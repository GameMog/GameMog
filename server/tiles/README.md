# Hometown tile service (Milestone 5 groundwork)

Compile on first request, then cache forever. Every key includes the compiler version. A small Node service serves
Hometown city tiles: it compiles a tile the first time someone asks for it, stores the bytes, and serves those same
bytes for good. A Mog keeps its city **locked** by storing a city-lock record. The record names one place, one compiler
version and the hash of that tile set, and resolving it always returns identical bytes.

Nothing here is deployed. There is no real bucket, no credentials and no model calls. Everything runs on
`127.0.0.1:4690-4694` against local disk, memory or a local S3 mock.

- **Runtime:** Node 20+ (tested on v25.9.0). **No dependencies and no framework.** It uses only `node:http`,
  `node:zlib`, `node:crypto`, `node:test` and `fetch`. A router this small does not need a framework, and with no
  dependencies there is no `package.json`, lockfile or supply chain to manage.

```
server/tiles/
  src/keys.mjs            key grammar + slippy-map maths (every storage key is built here from validated parts)
  src/service.mjs         the core: getTile / getManifest / createLock / resolveLock / verifyLock / prewarmPlace
  src/http.mjs            the HTTP front (routing, ETag/304, encoding negotiation, cache headers)
  src/singleflight.mjs    per-key de-duplication of concurrent work
  src/lru.mjs             bounded in-memory LRU (bytes + entries)
  src/storage/            one interface: disk.mjs (default), s3.mjs (S3/R2, SigV4 over fetch), memory.mjs (tests)
  src/compilers/          the compiler interface, fake.mjs (deterministic placeholders), subprocess.mjs (M2 adapter)
  src/places.mjs          placeId -> bbox (a JSON gazetteer for now)
  src/prewarm.mjs         resumable pre-warm
  src/config.mjs          CLI options -> a service
  bin/serve.mjs           run the service
  bin/prewarm.mjs         prewarm --places list.txt --version v
  bin/loadtest.mjs        local load test
  test/                   node:test suites + a local S3 mock
  fixtures/               test gazetteer, place list, a stand-in compiler command
```

## Run it

```bash
node --test 'server/tiles/test/*.test.mjs'            # all tests (ports 4691-4693)
node server/tiles/bin/serve.mjs                        # http://127.0.0.1:4694, fake compiler, disk cache in server/tiles/.cache
curl -s localhost:4694/places/okemah-ok/manifest | head -c 300
node server/tiles/bin/prewarm.mjs --places server/tiles/fixtures/places.txt --version fake-1
node server/tiles/bin/loadtest.mjs                     # port 4690
```

`server/tiles/.cache/` holds the local disk store and the pre-warm state. It is git-ignored.

## API

| Request | Answer | Caching |
|---|---|---|
| `GET /tiles/{compilerVersion}/{z}/{x}/{y}` | the tile's stored bytes | `public, max-age=31536000, immutable`, strong ETag |
| `GET /places/{placeId}/manifest` | the place's tile set at the **current** version | `max-age=300`: it moves when the current version changes |
| `GET /places/{placeId}/manifest?version=v` | the place's tile set at version `v` | immutable |
| `GET /places/{placeId}/lock[?version=v]` | a lock record `{format, formatVersion, placeId, compilerVersion, tileSetHash}` | short / immutable as above |
| `GET /locks/{placeId}/{compilerVersion}/{tileSetHash}` | the manifest that lock names, or **409** if the stored tile set does not hash to it | immutable |
| `GET /healthz` | stats: compiles, hits, LRU, in-flight | `no-store` |

`HEAD` works everywhere `GET` does. Errors are JSON `{ "error": ... }`:

- **400:** a bad version, place id or tile coordinate (z outside 10..18 by default, x/y off the grid, `..`, bad percent-encoding)
- **404:** an unknown place, or a version that is neither cached nor registered
- **405:** any method other than GET or HEAD
- **409:** a lock mismatch
- **413:** a place that covers more than `maxTilesPerPlace` tiles
- **502:** a compile failure (not cached; the next request retries)

**The manifest** (`format: hometown-tileset`) is written as sorted-key JSON with no timestamps, so the same inputs always
give the same bytes. It contains:

- `placeId`, `name`, `bbox`, `compilerVersion`, `zoom`, `tileCount`, `bytes`
- `tileUrl` (`/tiles/{version}/{z}/{x}/{y}`)
- `tiles[]`: `{z, x, y, contentHash, hash, bytes}`, in row-major order
- `tileSetHash`: `sha256` over one line per tile, `"z/x/y <contentHash>\n"`, in manifest order

`contentHash` is the sha256 of the tile's decoded content. `hash` is the sha256 of the stored bytes, which is what the
ETag is built from.

## How a request flows

```
GET /tiles/v/z/x/y
  -> validate key (400)
  -> LRU hit?                         -> serve (x-tile-source: memory)
  -> single-flight on the storage key (every concurrent request for the key waits on ONE promise)
       -> store.get hit?              -> verify sha256, put in LRU, serve (x-tile-source: store)
       -> compiler registered for v?  no -> 404 (nothing compiled for typos/scans)
       -> compile (global cap: maxConcurrentCompiles), decode-check the bytes
       -> store.put(ifAbsent)         lost a race with another process? -> re-read and serve THE WINNER's bytes
       -> LRU, serve (x-tile-source: compiled)
```

- **Single-flight** (`src/singleflight.mjs`) is per process. The entry is removed when the work settles, so a failure
  is not cached and the next request retries. Across processes or instances, `put(ifAbsent)` arbitrates and the first
  writer wins. Disk does this with `link(2)`, which fails with EEXIST. S3/R2 does it with a conditional
  `If-None-Match: *` PUT, which returns 412. Two instances may both compile a tile once, but every client still gets
  the one stored copy (test: *two processes racing on one disk store*). If duplicate compiles across instances ever
  cost too much, put a shared lease (a lease object written with a conditional PUT and a TTL) in front of the compile.
- **Version keying.** The compiler version is the first segment of every tile key and manifest key. A new compiler
  version therefore never reads an old version's objects. Old versions keep resolving from storage even after their
  compiler is removed from the service, because the store is consulted before the compiler registry. The service
  never compiles for a version it has no compiler for. **Bump the version on any change to the output**: code,
  source release (the Overture release, 3DEP), rules, or a place's bbox.
- **Encoding passthrough.** A tile is stored exactly as the compiler encoded it (`identity`, `gzip` or `br`).
  - A client that accepts the stored encoding gets the bytes untouched, with `Content-Encoding` set.
  - A client that accepts neither gets a decoded copy, with its own ETag (`"<hash>.identity"`). The service keeps a
    small cache of these decoded copies.
  - The service never re-compresses on the fly.
  - `Vary: Accept-Encoding` is always sent.
- **ETag / 304.** The ETag is the first 40 hex characters of the stored body's sha256. `If-None-Match` is honoured
  (including weak tags and `*`).
- **Integrity.** Every read from disk or S3 re-hashes the body against the stored meta and fails loudly on a
  mismatch. It is never served silently.
- **LRU** (`src/lru.mjs`) is bounded by bytes (default 64 MB, `--lru-mb`) and by entry count. An object larger than
  the whole budget is never cached.

## Storage backends (`src/storage/`)

One interface:

- `get(key) -> {body, meta} | null`
- `put(key, body, meta, {ifAbsent}) -> {created}`
- `delete(key)`
- `describe()`

The keys are `tiles/{v}/{z}/{x}/{y}` and `manifests/{v}/{placeId}.json`.

- **Disk** (the default). There is one file per key: `HTT1` + uint32 meta length + meta JSON + body. Each object is
  written to a temp file in the same directory, then linked into place. Readers never see a partial file, and
  `ifAbsent` is atomic.
- **S3 / R2** (`S3Store`). Path-style URLs, AWS SigV4 implemented in `sigv4.mjs` (tested against AWS's published GET
  Object example signature).
  - Tile meta goes in `x-amz-meta-tilemeta` (base64url JSON). The tile's encoding is **not** set as the object's
    Content-Encoding, because `fetch` would silently decompress it on the way back and break byte-exact passthrough.
  - Credentials come only from `TILES_S3_ACCESS_KEY_ID` / `TILES_S3_SECRET_ACCESS_KEY` in the environment (via
    `--store s3`). Nothing here reads a credentials file.
  - **Tested only against the local mock** (`test/mock-s3.mjs`). The mock checks every request's signature and
    payload hash and implements the conditional PUT.
  - For R2, use the endpoint `https://<account>.r2.cloudflarestorage.com` with region `auto`.

## City locks (what a Mog stores)

```json
{ "format": "hometown-city-lock", "formatVersion": 1, "placeId": "okemah-ok", "compilerVersion": "fake-1",
  "tileSetHash": "<64 hex>" }
```

1. **Creating a lock.** A Mog creates its lock at publish time with `GET /places/{id}/lock`.
2. **Playing a locked Mog.** Playback resolves the lock with `GET /locks/{id}/{version}/{hash}`, which returns that
   version's manifest, then fetches the tiles at that version.
3. **Why the bytes cannot drift.**
   - The manifest and the tiles are immutable, version-keyed objects, so a newer compiler cannot change them.
   - If a stored object were lost and recompiled to different bytes, `resolveLock` (manifest hash) and `verifyLock`
     (every tile re-read and re-hashed) return 409 instead of serving a different city.
4. **The proof** is in `test/service.test.mjs` (*city lock: ...*). The test:
   - locks Okemah at `fake-1`
   - "restarts" with an empty LRU and only a `fake-2` compiler
   - confirms the new current lock differs
   - re-resolves the old lock and compares every tile byte for byte
   - checks that resolving it compiled nothing
   - checks that a forged hash gives 409, and that a tile recompiled to different bytes is caught by `verifyLock`

   The same flow also runs over the S3 backend against the mock.

**Place resolution.** A place's bbox is an input of its manifest. Changing an existing place's bbox therefore needs a
new compiler version (or a new place id). `src/places.mjs` reads a JSON gazetteer for now. The search box's place
index replaces it later.

## Pre-warm

```bash
node server/tiles/bin/prewarm.mjs --places list.txt --version v [--concurrency 2] [--max-compiles 4] [--state f]
                                  [--store disk --store-dir d | --store s3 ...] [--compiler fake|cmd ...]
```

- **Input.** One place id per line. `#` comments and blank lines are skipped.
- **Concurrency.** `--concurrency` sets how many places run at once. `--max-compiles` caps tile compiles across all of
  them; this is the service's global compile semaphore.
- **Resumable.**
  - Each finished place is appended to `<store>/prewarm/<version>.jsonl`. A torn last line from a kill is ignored.
  - A rerun skips the places already in that file.
  - A place that failed or was interrupted is retried, and its tiles that were already stored are cache hits.
  - Ctrl-C stops launching new places and lets the ones in flight finish.
  - The exit code is 1 if anything failed or was interrupted.
- **Tested** in `test/prewarm.test.mjs`:
  - a scripted tile failure leaves one place out of the state file
  - the rerun compiles only the missing tiles
  - a third run is a no-op
  - the CLI's second run reports `skipped: 4, compiles: 0`

## How M2's compiler plugs in

The service calls one function per tile. The interface is defined in `src/compilers/index.mjs`:

```js
compiler = {
  version: '0.1.0',                       // = tools/hometown/compile.py COMPILER_VERSION (bump on any output change)
  async compileTile({ version, z, x, y, bbox: [west, south, east, north] }) {
    return { body, contentType, contentEncoding /* 'identity' | 'gzip' | 'br' */ };
  },
}
```

There are two ways to connect it, and neither needs a change here.

1. **Subprocess.** This is the path for the current Python compiler. M2 adds a per-tile mode that writes the tile's
   bytes to **stdout** and exits 0, or exits non-zero with the reason on stderr. The service then runs:

   ```bash
   node server/tiles/bin/serve.mjs --compiler cmd --compiler-version 0.1.0 --compiler-encoding gzip \
     --compiler-cwd /path/to/MogCity \
     --compiler-argv '["python3","tools/hometown/compile.py","--tile","{z}/{x}/{y}","--bbox","{west},{south},{east},{north}","--out","-"]'
   ```

   - **Placeholders:** `{version} {z} {x} {y} {west} {south} {east} {north}`.
   - The command runs **without a shell**.
   - **Limits:** a 120 s timeout and a 64 MB stdout cap.
   - **Errors are not cached:** empty output, a non-zero exit or a timeout is an error, and the next request retries.
   - The adapter is tested with `fixtures/fake-compiler-cmd.mjs`, which stands in for the Python command.
2. **In-process.** A JS module that exports the object above can be registered with `compilerRegistry([...])` in
   `src/config.mjs`.

**Open design point for M2.** The tile grid does not yet match M2's v1 plan, and M2 and M5 need to settle it before M2
adds `--tile`.

- **What the service keys on.** Global web-mercator tiles at z16 by default (`--zoom`). A z16 tile is about
  611 m × cos(latitude) wide, about 483 m at San Francisco.
- **What M2's v0 package uses.** 512 m squares in a **per-place** local frame. The height datum (`frame.yOffset`) and
  the water level are per place too.
- **Recommendation: global tiles.** Neighbouring towns then share tiles and the cache, and a tile's key never depends
  on which search result loaded it. This requires two things:
  1. tiles carry absolute heights (NAVD88) and absolute or tile-local coordinates, and the client applies the place
     frame;
  2. the network stage runs per tile with a halo, as M2's README already plans for v1.
- **Alternative: place-scoped keys** (`/tiles/{v}/{placeId}/{i}/{j}`). This is a small change in `keys.mjs` and
  `service.mjs`, but it gives up sharing between places.
- **Determinism.** Whichever grid is chosen, tile bytes must be deterministic. The fake compiler writes gzip with
  mtime 0 and OS byte 255, as Python's `gzip` module does. Node's zlib otherwise stamps the host OS, so macOS and
  Linux would produce different bytes.

## Load test (local, fake compiler)

```bash
node server/tiles/bin/loadtest.mjs [--tiles 200] [--concurrency 32] [--compile-ms 25] [--max-compiles 8] [--stampede 100]
```

The test serves real HTTP on 127.0.0.1:4690 over a keep-alive agent, against a disk store in a temp dir.

**Phases:**

- **cold:** 200 distinct misses
- **hot-memory:** 2,000 LRU hits
- **hot-store:** 200 store hits with a fresh LRU
- **stampede:** 100 concurrent misses for one new key

The run exits non-zero unless the stampede compiled **exactly once** and every body was identical.

**Results on 12 Nov 2026** (Node v25.9.0, 10 cores). The machine was heavily loaded by other jobs (load average ~75),
so treat these as upper bounds.

| Run | Phase | Requests | p50 ms | p95 ms | p99 ms |
|---|---|---:|---:|---:|---:|
| concurrency 8, max-compiles 8 | miss (25 ms fake compile + disk store) | 200 | 33.7 | 45.7 | 49.6 |
| | hit, memory LRU | 2000 | 0.76 | 1.75 | 2.23 |
| | hit, disk store (cold LRU) | 200 | 1.16 | 2.31 | 5.18 |
| | stampede: 100 concurrent misses, one key | 100 | 36.4 | 37.1 | 37.2 |
| concurrency 32, max-compiles 8 | miss (queued behind the compile cap) | 200 | 106.1 | 122.1 | 142.3 |
| | hit, memory LRU | 2000 | 3.66 | 7.95 | 13.8 |
| | hit, disk store (cold LRU) | 200 | 5.54 | 8.50 | 10.6 |
| | stampede | 100 | 40.6 | 41.1 | 41.1 |

**Stampede result: 1 compile for 100 requests, identical bodies, 99 shared waits** (the test asserts the same).

Miss latency is roughly the compile time plus the wait in the compile queue: with 32 requests in flight over 8 compile
slots, a miss waits about (32/8) × 25 ms. Real compiles will take seconds, not 25 ms, so the first visitor to a place
the pre-warm skipped waits for a full compile. This is why pre-warming popular places matters.

## Storage cost model

**Measured.** San Francisco compiled is 19 MB, about **120 B per building**. That is the whole package (terrain +
buildings + ground mask, gzipped) divided by the building count.

**Estimated for the whole US: 20–100 GB.**

- **Low end (about 20 GB):** about 150 M US building footprints × 120 B ≈ 18 GB, plus roads and terrain in dense
  areas.
- **High end (about 100 GB):** rural terrain and ground masks dominate where buildings are sparse, and a tile's fixed
  cost (its terrain and mask grids) stops being amortised over many buildings.

**Each compiler version is a full copy.** Old versions stay because locked Mogs pin them, so storage grows by roughly
the share of the map that is actually played at each new version, not by the whole US each time. Compile-on-request
means unvisited tiles at a new version are never built.

**Cloudflare R2 monthly cost:**

| Stored | R2 cost per month |
|---|---:|
| 1 GB (about 50 popular towns) | free tier (10 GB free) |
| 20 GB (US, low estimate) | ≈ $0.30 |
| 100 GB (US, high estimate) | ≈ $1.50 |
| 5 compiler versions kept × 100 GB | ≈ $7.50 |

- **Storage:** R2 storage is about **$0.015 / GB-month**.
- **Egress:** **zero egress fees**, so play traffic costs nothing for bytes out.
- **Operations:**
  - Writes are about $4.50 per million (one per compiled tile). Pre-warming 1,000 places × ~100 tiles is about $0.45.
  - Reads are about $0.36 per million. The `immutable` cache headers let a CDN or browser cache absorb repeat plays,
    so R2 sees roughly one read per tile per edge.
- **Takeaway:** compute for the compiles costs more than storage. Check current R2 prices before relying on these
  numbers.
- **No per-build map API fees:** all source data is open, read by bbox from Overture's public bucket and USGS 3DEP.

## Not done here (on purpose)

- **Deployment and real buckets.** No deploy, no real bucket, no credentials.
- **Auth and rate limiting.** The service has no auth and no rate limiting. A deployment puts it behind a CDN and
  needs a per-IP limit on misses: hits are cheap, but every miss costs a compile.
- **Shared compile leases.** Single-flight is per process. A cross-instance compile lease is noted above if it is ever
  needed.
- **Repository tests.** The repository-level `tests/` suite was not changed. Run these tests with
  `node --test 'server/tiles/test/*.test.mjs'`.
