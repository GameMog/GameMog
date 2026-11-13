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
  - the current build (`HOMETOWN_BUILD`; unset, both the newest build record and the build with the newest file are kept, so set it once a build is live);
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

## Turning on town building (`HOMETOWN_TOWNS=on`): assessment, 13 Nov 2026

`HOMETOWN_TOWNS=on` is a different switch from the tiles above. It turns on the Create page's town search and the
town builder, `lib/hometown/towns.ts`, which **compiles on this server**: per town, `compile.py --descriptor` (66 MB),
then `compile.py --id` (the whole place, 1.4-1.8 GB peak), then `fetch.py --regions` for a town whose map regions are
not read yet (about 3 GB). It writes its bundles to `data/towns/` (not under `HOMETOWN_DISK_CAP_GB`; about 13 MB a
town with its far field). On today's Render service it cannot work, and it is **not ready to turn on**:

| Need | Today | What it takes |
|---|---|---|
| Python and the compiler | not installed; `HOMETOWN_COMPILER` defaults to `hometown/compiler`, which is not in this repo | the Phase 2 image (`deploy/hometown-compiler.Dockerfile` now sets `HOMETOWN_COMPILER` and `HOMETOWN_SOURCES` too), or a vendored copy plus a pinned venv |
| Memory | `1c-2g`, Next 0.3-0.5 GB | a whole-place compile does not fit; a fetch does not fit. Pro (4 GB) at least |
| The DEM pin | fixed: an empty store now starts at the snapshot the compiler ships (`dem-12b3e06663843b4d`) | nothing |
| The same buildId as the pre-warm | the id hashes the Python and library versions and the OSM lane table | the pre-warm run in the same image, and `osm/osm-roads-us.parquet` (16 MB) in `HOMETOWN_SOURCES` |
| Sources | `data/towns/src` is empty: every town fetches its regions from Overture's S3 (duckdb) | fine on Pro; the first town in a new area is slow (Phoenix: 347 s with 4 regions) |
| Mog City | a town plays on `mc.gamemog.com/?city=pkg&town=` | the mogcity release with the town loader and far field **first** |

With no compiler, `/api/towns` now answers 503 with the town card's "couldn't build this town" words (it was a bare
500). Until the image is chosen, keep `HOMETOWN_TOWNS` and `NEXT_PUBLIC_HOMETOWN_SEARCH` unset, as `render.yaml` does.


## Production builder (13 Nov 2026): any US town, built on demand on Render

The spec is `.scratch/prod-builder/SPEC.md` (in the hometown-integrate worktree). Everything below is behind switches
that default OFF: a deploy of this code changes nothing until the owner turns `HOMETOWN_BUILDER` on.

### What runs where

| Piece | Where | Code |
|---|---|---|
| The queue (`data/hometown/queue.db`: jobs, wants, towns, workers, costs) | `gamemog` web, its disk, 1 instance | `lib/hometown-build/queue.ts` |
| A town's job graph, phases, wait estimate, admission, limits | web | `lib/hometown-build/towns.ts` (stage 1 in TS: `grid.ts`) |
| The worker protocol (claim, heartbeat, objects, complete, fail) | web, `/api/hometown/worker/*`, bearer `HOMETOWN_WORKER_TOKEN` | `lib/hometown-build/server.ts` |
| Compiling (regions, ctx, tiles, far, frame, bundles) | `gamemog-town-builder` **Render Workflow**: task `build_jobs`, one 4c-8g instance per run, started on demand, 0 when idle | `deploy/town-builder/workflow.py` (the task), `worker.py` (its loop), `workflow-build.sh` (the pinned build) |
| Starting runs (never Python) | web: the dispatcher, a pass every 5 s and on every queue change, Render REST API | `lib/hometown-build/dispatch.ts` (runs table in `queue.db`) |
| The store: tiles, ctx, manifests, builds, frames, bundles, far, src, dem | web disk, `data/hometown/` | `lib/hometown-tiles/` (`keys.ts` grammar, `http.ts verifyObject`) |
| The owner's view | `/admin` overview, "Town builder" card; `GET /api/hometown/admin/builder` | `app/admin/dashboard.tsx` |

The web never runs Python (`HOMETOWN_COMPILE` stays off). A run holds nothing the web needs; its cache
(`/tmp/hometown-cache`, capped by `HOMETOWN_CACHE_GB`) vanishes when it ends.

**On demand (the owner, 13 Nov: "upgrade on DEMAND, not anticipation").** No builder is up while the queue is empty.
When a town is asked, the dispatcher sees claimable work and starts runs of `build_jobs` through
`POST https://api.render.com/v1/task-runs` (bearer `HOMETOWN_RENDER_API_KEY`). Each run is the worker loop run once:
it long-polls the same claim protocol over Render's private network (same region, `HOMETOWN_WEB` = the web's
hostport), keeps its local cache warm across the town's jobs, and returns when nothing has been claimable for 20 s and
nothing runs (or after its 2 h cap; the dispatcher then starts a fresh one if work is left). Billed per second; leases,
heartbeats, retries and the reaper are unchanged (a run that dies loses one lease of time, 60 s).
How many runs: `want = min(ceil((ready + leased weight) / 4 slots), ceil(P0 work / (4 x 60 s) + other work / (4 x 600 s)))`,
at least 1 when anything is ready, at most `HOMETOWN_MAX_RUNS` (20), or `HOMETOWN_PREWARM_RUNS` (4) while only P5 is
ready; at most 4 new runs a minute (Hobby: 16 new CPU a minute). Work = units x the job kind's EWMA. Every start is
written to the `runs` table with its idempotency key BEFORE the POST, so a web restart re-sends the same key and Render
answers with the run it already made. One run per job was rejected: a town is 30-150 small jobs, and each run pays its
start (spin-up + `--print-build` + first downloads, 5-15 s) and loses the region/ctx cache affinity.

### Switches (web service)

| Variable | Default | Meaning |
|---|---|---|
| `HOMETOWN_BUILDER` | `off` | `off`: inert. `owner`: `/api/towns*`, `/api/towns/enabled`, `/api/places` and Create's town box answer only the owner's `/admin` session. `on`: players |
| `HOMETOWN_WORKER_TOKEN` | unset | the workers' bearer token (24+ characters). Unset: the worker routes are 404 |
| `HOMETOWN_BUILD` | unset | the build new towns are made at: the `build=` the worker logs at start |
| `HOMETOWN_DISK_CAP_GB` / `HOMETOWN_SRC_CAP_GB` | 4 / 1 (render.yaml; 8 / 2 once the disk is 20 GB) | the store's cap; the staged regions' own share (least recently used go first) |
| `HOMETOWN_RUNS` | `off` | `workflows`: the dispatcher starts Render Workflows runs (needs the two below and `HOMETOWN_BUILDER` owner/on) |
| `HOMETOWN_RENDER_API_KEY` | unset | a Render API key (sync: false), only to start and read task runs |
| `HOMETOWN_WORKFLOW_SLUG` | from the workflow | render.yaml `fromService ... property: slug`; the task is `<slug>/build_jobs` (`HOMETOWN_RUN_TASK` overrides) |
| `HOMETOWN_MAX_RUNS` / `HOMETOWN_RUN_SLOTS` / `HOMETOWN_PREWARM_RUNS` | 20 / 4 / 4 | runs in flight at most; compile slots a run; runs while only pre-warm is ready |
| `HOMETOWN_RUN_STARTS_PER_MIN` / `HOMETOWN_RUN_TARGET_S` / `HOMETOWN_RUN_SPINUP_S` | 4 / 60 / 45 | new runs a minute; P0 drain target; added to the wait estimate when no run is live |
| `HOMETOWN_MAX_WAIT_S` | 600 | over this wait to drive, a new town is refused with the minutes and the 3 nearest built towns |
| `HOMETOWN_PER_IP_HOUR`, `HOMETOWN_DAILY_COLD`, `HOMETOWN_QUEUE_MAX` | 3, live slots x 400 (min 100), slots x 3 (min 10; with runs on, slots = what the dispatcher may start) | the limits on NEW towns (a built town is never limited). `HOMETOWN_DAILY_COLD` is the day's spend cap: set it before opening to players |
| `HOMETOWN_FRAME` | off | on only once the compiler has `--frame` and `--assemble` (MogCity M2/M4): spawn-first towns, district bundles, lock v3 |
| `HOMETOWN_CANARY_RATE` | 0.01 | the share of tile jobs recompiled on another worker and compared byte for byte |

Workflow service: `PYTHON_VERSION` 3.14.6 (pinned: part of the buildId), `HOMETOWN_WEB` (the web's hostport),
`HOMETOWN_WORKER_TOKEN` (from the web's variable), `HOMETOWN_RUN_PLAN` 4c-8g (read when the task registers, i.e. at a
deploy), `HOMETOWN_SLOT_GB` 1.5, `HOMETOWN_CACHE_GB` 4, `HOMETOWN_WORKER_PAUSED` (`1`: a run claims nothing and ends).

**The build environment (no Docker: a workflow is `runtime: python` or `node` only).** `buildCommand` installs the SDK
(`workflow-requirements.txt`, exact versions) and runs `workflow-build.sh`, which writes `.town-builder/`: the compiler
at `MOGCITY_SHA` (THE one line to re-pin), its own venv from the compiler's hash lock (`--require-hashes`, wheels only),
the OSM lane table checked by sha256, duckdb's httpfs/spatial installed at build time, the Overture file index, and the
recipe id (sha of all of that + machine + glibc) that `compile.py` hashes into the buildId as `HOMETOWN_IMAGE_DIGEST`.
It refuses any Python but `PYTHON_VERSION`. `deploy/hometown-compiler.Dockerfile` is the same recipe, kept for reference.

**Pre-warm** runs on the same task: `POST /api/hometown/admin/prewarm` enqueues P5 jobs, the dispatcher starts at most
`HOMETOWN_PREWARM_RUNS` runs for them, and a run claims P5 only when no P0-P3 job is claimable.

### What a town is today, and what it becomes

- **Today (compiler 0.5.0, `HOMETOWN_FRAME` off).** The pick enqueues the town's ctx blocks (P0), its tile blocks (the
  ones within 2 tiles of the Census point P0, the rest P1 by ring) and the full bundle (P2, after every tile). Missing
  map regions come back as a worker's exit 3 and become a regions job (staged into `src/` for every later town nearby).
  Phases: asked, framing (building), full. The story starts when the town is full (lock v2), as before, but the work
  runs on as many workers as there are, never in the web process.
- **With MogCity M2/M4 (`HOMETOWN_FRAME=on`).** A frame job (P0) computes the spawn, the story places and the lock v3
  from ctx, regions and DEM only. When it lands the spawn district's blocks go to P0, the district bundle is enqueued,
  and the town is `district`: the Create page gets the lock v3 and the story starts while the town builds. Then
  `growing` (Drive now, the district bundle) and `full`. Mission 1 must stay in the district (gate rule in
  `storykit/hometown/hometown-gate.ts districtProblems`).

### The local dry run (`deploy/town-builder/dry-run.sh`), 13 Nov 2026

The exact `worker.py` with the pinned venv against `next dev` (port 4841, `HOMETOWN_BUILDER=on`), Okemah (us-4054200),
its 6 regions staged into the web store first, 3 slots on the shared Mac (another workflow running): claimed and built
2 ctx, 16 tile blocks and the full bundle (19 jobs, no failure), the town `full` 493 s after the pick (the Mac was
loaded: blocks took 10-52 s, the full bundle 243 s, most of it the assembler's far field). The worker drained on SIGTERM.
Determinism: all 169 of the town's tiles byte-identical to a whole-town `compile.py --id` in a fresh store; 3 tiles
compiled alone (`--tile --no-store`) identical to the worker's; the bundle's lock equal to the `--id` package's
(`f8afb7ef...`); citypackage.json written by the web. The worker also uploaded the DEM pieces it read (56 MB) into the
store's `dem/` family, so the next worker reads them from the web instead of USGS.
Not measured here: Render's hosts (the Mac is arm64, the image x86_64: a different buildId by design), several worker
instances, the spawn-first path (needs MogCity M2/M4).

### Cost (Render Workflows, 13 Nov 2026)

Runs bill per second by plan: 4c-8g (ours) $1.00/h; 2c-4g $0.40, 2c-8g $0.70, 4c-16g $1.50, 8c-32g $2.50. No run, no
bill. Measured (`deploy/town-builder/workflow-sim.sh`, Boley OK, cold, 121 tiles): 181.5 CPU-s a town on the Mac; with
2x for Render's vCPUs, about $0.025 a town on a busy run and $0.08-0.12 for a town built alone. Idle $0; a why.com-size
viral day (600 new towns) about $15-60; the ceiling is `HOMETOWN_MAX_RUNS` x $1/h. Web 1c-2g $25/month and the 10 GB disk
$2.50/month are unchanged. The full table is in the go-live runbook.

### Rollout runbook

**Before the first push (agents never push or deploy):**
1. The compiler commit `workflow-build.sh` pins (`MOGCITY_SHA`) must be on GitHub (GameMog/GameMog, any branch): the
   build fetches it by SHA.
2. `deploy/town-builder/osm-roads-us.parquet` (17 MB, ODbL, sha256 in the `.json` beside it) must be in the checkout, or
   reachable at `HOMETOWN_OSM_URL` (set on the workflow): otherwise the build stops at its sha256 check. Owner's call.
3. `npm run check` passes; `deploy/town-builder/workflow-sim.sh` passes on the Mac.

**Deploy order (owner): the full list with every variable is the go-live runbook (`.scratch/prod-builder/RUNBOOK.md`).**
1. Push. The web deploys with `HOMETOWN_BUILDER=off` and `HOMETOWN_RUNS=off`: inert.
2. Blueprint sync: creates the `gamemog-town-builder` workflow (enter `HOMETOWN_WORKER_PAUSED=1` when asked). A
   workflow bills only its runs: nothing runs yet, so it costs $0.
3. On the web: `HOMETOWN_WORKER_TOKEN`, then `HOMETOWN_RENDER_API_KEY` (Render Account Settings, API Keys).
4. Learn the buildId: Dashboard, the workflow, `build_jobs`, Run task with input `[]`. Still paused, the run logs
   `{"event": "start", "build": "htc-0.7.0-hg1-b........", "caps": [...]}` and ends at once (`exit: paused`); its
   result shows the build too.
5. On the web: `HOMETOWN_BUILD` = that build, `HOMETOWN_TILES=on`, `HOMETOWN_BUILDER=owner`, `HOMETOWN_RUNS=workflows`;
   on the workflow: `HOMETOWN_WORKER_PAUSED=0`.
6. Production test (owner only); then `HOMETOWN_DAILY_COLD` (the spend cap) and `HOMETOWN_BUILDER=on`.

**A compiler upgrade (for example 0.5.0 to 0.6.0):**
1. Re-pin `MOGCITY_SHA` (one line in `workflow-build.sh`) and push: only the workflow rebuilds (`buildFilter`).
2. The new workers report build B2 and claim only B2 jobs; the web's `HOMETOWN_BUILD` is still B1. Shadow-build the top
   towns at B2: `POST /api/hometown/admin/prewarm {"n": 100, "build": "<B2>"}` (P5). B1 on-demand work waits for the
   rollout window: run it off-peak (a second workflow service at B1 for an hour is the alternative).
3. Set `HOMETOWN_BUILD=B2` (restarts the web). Old towns keep serving: bundles, tiles and frames at B1 are immutable,
   every story pins its lock, and the GC never collects a pinned build.
4. After 30 days, the GC dry run lists the unpinned B1 objects; the owner applies the plan.

**Kill switches:** web `HOMETOWN_RUNS=off` (no new run; runs in flight finish their jobs and end), workflow
`HOMETOWN_WORKER_PAUSED=1` (a run claims nothing and ends), `HOMETOWN_BUILDER=off` (every town route 404; built towns'
bundles stop being served from the store too), or revoke the Render API key. **The breaker** (dispatch.ts `fruitless`):
when the last 3 runs ended without claiming at the current build (paused, token refused, a crash at start, or a
workflow redeploy whose buildId is not yet `HOMETOWN_BUILD`), the dispatcher starts nothing for 10 minutes, then one
probe run; the /admin card says why. So a paused or mismatched builder costs 3 short runs, then one every 10 minutes.
