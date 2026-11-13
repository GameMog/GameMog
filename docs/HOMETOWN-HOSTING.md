# Hometown hosting

Hometown towns are served from GameMog's own Render disk. There is no new account and no cloud storage. The code is in
`lib/hometown-tiles/`. The routes are `app/api/hometown/[...path]` and `app/api/hometown/admin/[...path]`.

Every switch starts off, so production does not change until the owner sets them.

## What runs where

| | Phase 1 (launch) | Phase 2 (a separate owner decision) |
|---|---|---|
| Built on | the Mac, with `tools/hometown/prewarm.py` and the pinned venv | the Render server, on a tile miss (`HOMETOWN_COMPILE=on`) |
| Render runtime | native Node, unchanged | Docker (`deploy/hometown-compiler.Dockerfile`, prepared but not used) |
| Render plan | Standard `1c-2g`, unchanged | Pro, 2 CPU / 4 GB (+$60 a month) |
| Python on Render | not needed | pinned in the image |

## The store (`data/hometown`, `lib/hometown-tiles/store.ts`)

The store uses the Python compiler's own layout, so the store the Mac fills is uploaded file by file:
- `tiles/{buildId}/hg1-{d}/0/{c}/{r}`
- `ctx/{buildId}/hg1-{d}/4/{C}/{R}`
- `manifests/{buildId}/{placeId}.json`
- `builds/{buildId}.json`

Objects are immutable. Each is written once, through a temp file and `link(2)`.

Every put has two guards:
- **The store's cap.** `HOMETOWN_DISK_CAP_GB` defaults to 2.
- **The disk's free-space floor.** `HOMETOWN_FREE_FLOOR_GB` defaults to 2, and counts whatever else used the space (Story Kit, the database, backups).

A refused put returns `507` and logs `disk-full`. Stored towns keep serving.

**Eviction is "cache forever" with a GC.**
- The GC never touches:
  - the current build (`HOMETOWN_BUILD`, or else the newest build);
  - any build a world names anywhere in `gamemog.db` or `data/storykit` (drafts and sealed worlds included).
- Anything else goes as a whole build, least recently served first.
- If the pins can't be read, nothing is deleted.
- **It is a dry run first.** `scripts/hometown-gc.ts` and `GET /api/hometown/admin/gc` print a plan with an id. Only `--apply <id>` or `POST {planId}` deletes, and only that exact plan.

The in-memory body cache is 64 MB.

## Routes

**Public**, behind `HOMETOWN_TILES=on` (otherwise 404). Mog City uses `?tileBase=https://gamemog.com/api/hometown`:
- `GET /api/hometown/tiles/...`
- `GET /api/hometown/manifests/...`
- `GET /api/hometown/builds/...`
- `GET /api/hometown/places/{placeId}`

**Admin**, which needs `Authorization: Bearer $HOMETOWN_ADMIN_TOKEN`. The owner enters the token on Render (`sync: false`, at least 24 characters). With no token set, the admin routes are 404.
- `GET status`
- `PUT objects/{key}`: upload. Tiles are checked against their content hash. The build record must hash to its id. A descriptor is taken only after every one of its tiles is in, so it goes last.
- `GET` / `POST gc`
- `GET requests`: the towns players asked for that aren't built yet.

## Phase 1 run book

```bash
# GameMog: the list (top N by 2010 population, plus Okemah, Phoenix, Pittsburgh), as the compiler's gazetteer
node --import ./scripts/ts-resolve.mjs scripts/hometown-prewarm-list.ts --n 100 --out .scratch/top100.json
# MogCity, in the pinned venv (tools/hometown/requirements.txt): build them, resumable
python tools/hometown/prewarm.py --places .scratch/top100.json --store .scratch/prewarm/store
# GameMog: upload (the token comes from the shell's environment, never from a file in the repo)
node --import ./scripts/ts-resolve.mjs scripts/hometown-upload.ts --store <store> --build <htc-...> --base https://gamemog.com
```

## Step 0 findings (12 Nov 2026)

**The repo.** `render.yaml` runs `runtime: node` on `1c-2g`, with one 10 GB disk at `data/`. There is no Dockerfile. `package.json` has no `engines` field; render.yaml pins `NODE_VERSION` 24. `deploy/boot.mjs` only seeds and migrates the database. Nothing installs Python.

**Render's native runtime.** Per render.com/docs/native-runtimes:
- It is Debian 12.
- It lists `python3-dev`, `python3-pip` and `python3-setuptools`. That means Python 3.11, not the Mac's 3.14.6.
- `venv` isn't listed, and Debian's pip refuses system installs (PEP 668).
- A build's id hashes the versions of Python, duckdb, shapely and GEOS, numpy, Pillow and zlib. A Render build would therefore be a different build from the Mac's in any case.
- Phase 2 needs one image that both the server and the pre-warm run in. That image is the prepared Dockerfile.

**Peak RSS**, from `/usr/bin/time -l` on an M-series Mac, with the sources already fetched:

| Compile | Okemah | Phoenix | Pittsburgh |
|---|---:|---:|---:|
| whole place (`--id`), 31-37 s | 1.38 GB | 1.73 GB | 1.84 GB |
| one L2 block (`--block`), 6-14 s | 0.42 GB | 1.21 GB | 1.12 GB |
| one tile (`--tile --no-store`), 3-7 s | 0.35 GB | 1.21 GB | 0.64 GB |
| stage-1 descriptor | 66 MB | 66 MB | 67 MB |
| `fetch.py --regions` (2 regions) | about 3 GB (duckdb, no memory limit) | | |

Next.js uses about 0.3-0.5 GB. On the 2 GB plan:
- A whole-place compile does not fit beside it.
- A dense block barely does.
- A fetch does not.

So Phase 1 serves only.

**Disk.** I pre-warmed the three named towns with their full capped boxes (`prewarm.py`, 13 Nov):

| Town | Tiles | Size | Time |
|---|---:|---:|---|
| Okemah | 169 | 11 MB | 38 s |
| Phoenix | 225 | 20 MB | 347 s, including fetching 4 regions |
| Pittsburgh | 225 | 28 MB | 377 s |

- A big city fills its whole 4.5 km box, so the top 100 is about **2-2.8 GB**. That is past the 2 GB cap: with the cap left at 2, the top 70 or so fit.
- Story Kit already has 8,000 MB of the 10 GB on paper.
- **Proposal:**
  - resize the disk to **20 GB** (+$2.50 a month at $0.25/GB, so $5 in all);
  - then set `HOMETOWN_DISK_CAP_GB=6`, which holds the top 100 plus about 150 more towns.
- A disk can grow without downtime but never shrink.
- Neighbouring towns share tiles, so the real total comes in under the sum of the towns.

**Bandwidth.**
- Render includes 5 GB a month on a Hobby workspace and 25 GB on Pro (render.com/docs/outbound-bandwidth), then charges $0.15/GB.
- A play pulls between about 1 MB (the 13 tiles around the spawn, at 60-70 KB each) and 11 MB (a whole town).
- Tiles are immutable for a year, so a returning player costs nothing.
