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
node --test 'server/tiles/test/*.test.mjs'            # all tests (ports 4691-4693; TILES_TEST_PORT=<p> per file)
node server/tiles/bin/serve.mjs                        # http://127.0.0.1:4694, fake compiler, disk cache in server/tiles/.cache
curl -s localhost:4694/places/okemah-ok/manifest | head -c 300
node server/tiles/bin/prewarm.mjs --places server/tiles/fixtures/places.txt --version fake-1
node server/tiles/bin/loadtest.mjs                     # port 4690
```

`server/tiles/.cache/` holds the local disk store and the pre-warm state. It is git-ignored.

## API (the national grid hg1)

Tiles are keyed on **hg1** (`tools/hometown/grid.py`, the authority; `src/grid.mjs` re-exports the JS twin
`wagmi/world/grid.js`): per-domain Lambert Conformal Conic on GRS80, 512 grid-m L0 tiles, ids `hg1-{domain}/0/{c}/{r}`.
Every key carries the **buildId** `htc-{compilerVersion}-hg1-b{8 hex}` (compiler version, libraries, image, Overture
release, DEM snapshot, grid: `builds/{buildId}.json`).

| Request | Answer | Caching |
|---|---|---|
| `GET /tiles/{buildId}/hg1-{domain}/0/{c}/{r}` | the tile (HTL1, gzip) | immutable, strong ETag |
| `GET /manifests/{buildId}/{placeId}` | the place's descriptor + tile set in that build | immutable |
| `GET /places/{placeId}/manifest[?version=buildId]` | the same at the current build (or the given one) | short / immutable |
| `GET /places/{placeId}/lock[?version=buildId]` | a lock v2 | short / immutable |
| `GET /locks/{placeId}/{buildId}/{tileSetHash}` | the manifest that lock names, 409 on a mismatch | immutable |
| `GET /locks/{placeId}/{buildId}/{tileSetHash}/tiles/hg1-{domain}/0/{c}/{r}` | a tile of the locked set, checked on every read; a tile OUTSIDE the set is served unlocked at the same build (`x-tile-lock: ...unlocked`) | immutable |
| `GET /ctx/{buildId}/hg1-{domain}/4/{C}/{R}` | a context block (local / admin only) | immutable |
| `GET /admin/verify/{placeId}/{buildId}/{tileSetHash}` | `verifyLock` (local / admin only) | `no-store` |
| `GET /healthz` | counts (store and builds to local / admin only) | `no-store` |

Errors: **400** a bad build id, grid, domain, level, or a key that is negative, not plain decimal, over 6 digits or
outside the domain's bounds (conus c, r <= 12000; ak c <= 12000, r <= 10000; others <= 4000); **404** an unknown place
or route; **409** a lock mismatch; **410** a tile that is not stored in a build that is not registered (the edge of that
world) or a lost locked tile whose build is gone; **422** a tile the compiler refused (no DEM, a region not fetched:
the reason in the body); **502** a compile failure; **503** a lost put race whose winner is not readable yet.

**The manifest** (`hometown-tileset` v2, sorted-key JSON): `placeId`, `name`, `buildId`, `grid`, `domain`,
`origin {c0, r0}`, `k0`, `gamma0`, `anchor`, `playBox`, `yOffset`, `waterLevel` (stage 2, when the compiler gives
them), `tileCount`, `bytes`, `tileUrl`, `tiles [{id, contentHash, hash, bytes}]` and `tileSetHash` = sha256 over the
sorted lines `"{id} {contentHash}\n"` (the same code as the compiler's `assemble.py tile_set_hash` and GameMog's
`city-package.ts`; `contentHash` is the sha256 of the decoded tile). **The tile list is the compiler's descriptor's**
(stage 1, Python): the service never computes which tiles a place covers.

**A miss** single-flights the tile, then its **L2 block** (4 x 4 tiles): one compiler call compiles the block in one
process and its 16 children are stored ifAbsent, so N concurrent GETs of any of its tiles are one compile. A lock
repair compiles the one tile alone (and stores it only if it matches the lock).

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
- **Decoded copies** for clients that accept no stored encoding are kept in a cache capped by **bytes** (32 MB by
  default, `decodedCacheBytes` in `createHttpHandler`) as well as by count (256).
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

The keys are `tiles/{buildId}/hg1-{domain}/0/{c}/{r}`, `ctx/{buildId}/hg1-{domain}/4/{C}/{R}`, `manifests/{buildId}/{placeId}.json`, `builds/{buildId}.json` and `dem/{etag}/...`.

- **Disk** (the default). There is one file per key: `HTT1` + uint32 meta length + meta JSON + body. Each object is
  written to a temp file in the same directory, then linked into place. Readers never see a partial file, and
  `ifAbsent` is atomic.
- **S3 / R2** (`S3Store`). Path-style URLs, AWS SigV4 implemented in `sigv4.mjs` (tested against AWS's published GET
  Object example signature).
  - Tile meta goes in `x-amz-meta-tilemeta` (base64url JSON). The tile's encoding is **not** set as the object's
    Content-Encoding, because `fetch` would silently decompress it on the way back and break byte-exact passthrough.
  - A **409** on the conditional PUT means another write to the key is still in progress, not that the key is stored.
    The PUT is retried with exponential backoff (6 retries from 50 ms) until it lands or a 412 shows the winner; the
    service then reads the stored object back. If it still cannot read it, it answers 503 rather than serving its own
    unstored bytes.
  - Credentials come only from `TILES_S3_ACCESS_KEY_ID` / `TILES_S3_SECRET_ACCESS_KEY` in the environment (via
    `--store s3`). Nothing here reads a credentials file.
  - **Tested only against the local mock** (`test/mock-s3.mjs`). The mock checks every request's signature and
    payload hash and implements the conditional PUT.
  - For R2, use the endpoint `https://<account>.r2.cloudflarestorage.com` with region `auto`.

## City locks v2 (what a Mog stores)

```json
{ "format": "hometown-city-lock", "formatVersion": 2, "place": "okemah", "buildId": "htc-0.3.0-hg1-becc45523",
  "grid": "hg1", "domain": "conus", "origin": { "c0": 5806, "r0": 8582 }, "k0": 0.996523396, "gamma0": -0.190411,
  "yOffset": 244, "waterLevel": -10, "tiles": "<64 hex tileSetHash>" }
```

- A Mog's story coordinates are `{site}` refs or session x / z relative to the **pinned** origin: a gazetteer change
  never moves a Mog. `resolveLock` refuses (409) a lock whose tile set, place, build, domain, origin, k0, gamma0,
  yOffset or waterLevel differs from the stored manifest, and re-hashes the manifest's tile list itself.
- Locked tile reads are checked against the manifest's `hash` and `contentHash` (409 on drift). A lost tile is
  rebuilt by the pinned build when it is still registered and stored only if it matches; without it: 410.
- Tiles outside the locked set are served at the same buildId, unlocked: compiled on demand while the build is
  registered, 410 after.
- `verifyLock` (`/admin/verify/...`) re-reads and re-hashes every tile. The tests are in `test/service.test.mjs`
  (*lock v2: ...*, *locked tile: ...*), also over the S3 mock.

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

## How the compiler plugs in

`src/compilers/index.mjs` defines a build: `compileTile(key)`, `compileBlock(block)` (an L2 block, 16 children),
`compileCtx(key)`, `describePlace(place, stage)` and `buildRecord()`. The Python compiler runs as a subprocess, no
shell, an allow-listed environment (never `TILES_S3_*`):

```bash
BID=$(python tools/hometown/compile.py --print-build | jq -r .buildId)
node server/tiles/bin/serve.mjs --compiler cmd --compiler-version $BID --compiler-encoding gzip --compiler-cwd . \
  --gazetteer tools/hometown/places.json \
  --compiler-argv '["python3","tools/hometown/compile.py","--tile","{id}","--out","-"]' \
  --compiler-block-argv '["python3","tools/hometown/compile.py","--block","{id}","--out","-"]' \
  --compiler-describe-argv '["python3","tools/hometown/compile.py","--descriptor","{placeId}","--stage","{stage}"]'
```

Placeholders `{buildId} {grid} {domain} {L} {c} {r} {id} {placeId} {stage}`. Exit 3 is a refusal (stderr JSON
`{"refused": reason}`), any other non-zero exit, a timeout (600 s) or empty stdout an error; neither is cached. The
block stream is HTB1 (per child: u32 id length, id, u32 body length or `0xffffffff` + reason, body).
`fixtures/fake-compiler-cmd.mjs` stands in for it in the tests. Measured with the real compiler on port 4702:
`GET /tiles/{buildId}/hg1-conus/0/5806/8582` compiled its block in 6.4 s, the next GET and a sibling were memory hits,
and the served bytes equal the place compile's; `/places/okemah/manifest` (156 tiles) gave the same `tileSetHash` as
the compiler's own descriptor.

## Grid alignment (decided: hg1)

The grid is the national grid hg1 (Final grid spec "hg1"): global tiles shared by neighbouring towns, a per-tile
compile from the tile's own sources and context blocks, the place frame applied by the client (origin tile, k0,
gamma0, yOffset, waterLevel from the descriptor). Web-Mercator keys and the `--zoom` option are gone. Changing the
grid's projection, tile size, lattices, quantisation or ownership rules is hg2: a new key namespace in which old locks
stay servable.

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
- **Auth and rate limiting.** Apart from the admin route (local or bearer token), the service has no auth and no rate limiting. A deployment puts it behind a CDN and
  needs a per-IP limit on misses: hits are cheap, but every miss costs a compile.
- **Shared compile leases.** Single-flight is per process. A cross-instance compile lease is noted above if it is ever
  needed.
- **Repository tests.** The repository-level `tests/` suite was not changed. Run these tests with
  `node --test 'server/tiles/test/*.test.mjs'`.
