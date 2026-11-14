# Hometown hosting: the on-demand town builder

How a player's hometown is built and served in production. The overview (product flow, switches, costs, open items) is
[HOMETOWN.md](HOMETOWN.md); the owner's go-live steps are [HOMETOWN-RUNBOOK.md](HOMETOWN-RUNBOOK.md).

Any US town is built **on demand** when a player picks it on Create. The web (`gamemog`, Render, Node, 1c-2g, one 10 GB
disk) holds the job queue and the store and **never compiles**. Compiling runs in a **Render Workflow**
(`gamemog-town-builder`, task `build_jobs`): each run is its own 4c-8g instance, started by the web through the Render
API only while there is work, and gone 20 s after the queue is idle. **No town asked, no builder up, $0.**

## What runs where

| Piece | Where | Code |
|---|---|---|
| The queue (`data/hometown/queue.db`: jobs, wants, towns, workers, runs, costs, events) | `gamemog` web, its disk | `lib/hometown-build/queue.ts` |
| A town's job graph, phases, wait estimate, admission, limits | web | `lib/hometown-build/towns.ts` (stage 1 in TS: `grid.ts`) |
| The worker protocol (claim, heartbeat, objects, complete, fail) | web, `/api/hometown/worker/*`, bearer `HOMETOWN_WORKER_TOKEN` | `lib/hometown-build/server.ts` |
| Starting runs (never Python) | web: the dispatcher, a pass every 5 s and on every queue change | `lib/hometown-build/dispatch.ts` |
| Compiling (regions, ctx, tiles, far, frame, bundles) | `gamemog-town-builder` workflow runs | `deploy/town-builder/workflow.py` (the task), `worker.py` (its loop), `workflow-build.sh` (the pinned build) |
| The compiler | MogCity `tools/hometown` (compiler **0.8.0**), fetched at `MOGCITY_SHA` | github.com/GameMog/GameMog, branch `hometown-compiler` |
| The store: tiles, ctx, manifests, builds, frames, bundles, far, src, dem | web disk, `data/hometown/` | `lib/hometown-tiles/` (`keys.ts` grammar, `http.ts verifyObject`) |
| Playing a town | **mc.gamemog.com** (GitHub Pages, branch `mogcity`), reading bundles and tiles from gamemog.com | MogCity `wagmi/world/town-src.js`, `growing.js`, `pkg-far.js` |
| The owner's view | `/admin`, "Town builder" card; `GET /api/hometown/admin/builder` | `app/admin/dashboard.tsx` |

A run holds nothing the web needs: its cache (`/tmp/hometown-cache`, capped by `HOMETOWN_CACHE_GB`) vanishes when it ends.

## How a town is built

1. **The pick.** Create's town box (`app/create/place-search.tsx`) searches the Census places (`/api/places`) and
   `POST /api/towns {placeId}`. The web resolves the place, its play box (`lib/hometown/box.ts`: the search's square
   capped at 4,500 m a side round the Census internal point, the compiler's own cap) and stage 1 (`grid.ts`: the tile
   range, under 50 ms, no Python).
2. **The graph** (one transaction with the town's row). P0: the town's map regions not staged yet, its ctx blocks, the
   tiles within 2 tiles of the anchor (as 2 x 2 quads, many slots at once), the frame. P1: every other tile block,
   ringed by distance. P2: the far field and the full bundle. Missing regions surface as a worker's exit 3 and become a
   regions job (staged in `src/` for every later town nearby).
3. **The dispatcher** sees claimable work within 0.3 s and starts runs
   (`POST https://api.render.com/v1/task-runs {task: "<slug>/build_jobs", input, idempotencyKey}`). How many:
   `want = min(ceil((ready + leased weight) / 4 slots), ceil(P0 work / (4 x 60 s) + other work / (4 x 600 s)))`, at least 1
   when anything is ready, at most `HOMETOWN_MAX_RUNS`, or `HOMETOWN_PREWARM_RUNS` while only pre-warm (P5) is ready; at
   most 4 new runs a minute. Each start is written to the `runs` table with its idempotency key before the POST, so a web
   restart re-sends the same key and Render answers with the run it already made.
4. **A run** is `worker.py`'s loop once: long-poll `claim` over Render's private network (`HOMETOWN_WEB`, the web's
   hostport), download the job's inputs, compile, upload through the web's hash-checked `PUT`, `complete`. Leases (60 s),
   heartbeats (15 s), retries (3) and the reaper make a dead run cost one lease. It ends when nothing has been claimable
   for 20 s and nothing runs, or after its 2 h cap.
5. **The frame lands** (P0, from ctx, regions and DEM only, never a compiled tile): the spawn, the story places and the
   lock v3. The town is `district`: Create gets the lock and **the story can be written while the town builds**. The
   spawn district's tiles (5 x 5 round the spawn) go to P0 and its district bundle is enqueued.
6. **The district bundle lands**: `growing`, "Drive now". Mog City plays the district (`&tv=district-{c}-{r}`) with haze
   at its edge and "The rest of town is still being built".
7. **The full bundle lands**: `full`. Mog City's `growing.js` polls `/api/towns/{place}?build=` and swaps to the whole
   town at the next pause, keeping the player's position.

### Compiler 0.8.0: the downtown box, and the town re-tiled to its frame

Round 3 of the compiler centres a **capped** town's box on its downtown: when the search's square (`searchBbox`) is wider
than the 4,500 m cap, the frame takes a box of the same size round the strongest downtown centre within half a box of the
Census internal point (MogCity `tools/hometown/assemble.py downtown_box`; Pittsburgh's internal point is 2 km east of the
Golden Triangle). Stage 1 in TS cannot know that box (it needs the map), so:
- every job's places entry carries `searchBbox` beside the capped `bbox` (`gazetteerOf`);
- when the frame lands with other tiles than stage 1's, **`retileToFrame`** makes the frame's tile set the town's: its
  ctx and tile jobs are enqueued (the block merge adds only the bits not covered), the town stops wanting the tile jobs
  that build none of the frame's tiles (dropped when no other town wants them and they have not started), the full
  bundle waits on the new set, and the town's tile count follows. The event log records `retile`.
- the frame of a capped town reads the map round the downtown window: missing regions are an exit 3 like any other.

Uncapped towns (the search's square already under the cap) are unchanged: their frame is stage 1's box.

### The first pick on a fresh deploy: the build is learned

The build new towns are made at is `HOMETOWN_BUILD` when set; else the build the live runs report; else the build the
**last** run reported (the `workers` table survives runs ending). A buildId hashes the compiler, its packages, the OSM
table and the run's machine (the recipe id), so it is only known once a run has started on Render. On a fresh deploy with
no run ever, the first pick is answered 503 with `retryS: 15`, logs `build-unknown`, and the dispatcher starts **one**
run to learn it (`plan().probe`). Create's card shows "Waiting its turn" and asks again by itself every 15 s
(`lib/places/request-city.ts`, for up to about 5 minutes); the run's first claim reports the build and the next ask is
admitted. Measured locally: the pick admitted **16 s** after it was made. The breaker (below) bounds a probe that never
claims.

When `HOMETOWN_RUNS=workflows` but no run can start (no `HOMETOWN_RENDER_API_KEY`, or no slug: the status page's "runs
problem"), a pick of any town not built in full is refused at once with "New towns aren't being built right now"
(503, no `retryS`), so nobody waits on a run that cannot come. Towns built in full keep playing.

## The store (`data/hometown`, `lib/hometown-tiles/store.ts`)

The compiler's own layout, objects immutable, each written once through a temp file and `link(2)`:
`tiles/{build}/hg1-{d}/0/{c}/{r}`, `ctx/{build}/hg1-{d}/4/{C}/{R}`, `far/{build}/hg1-{d}/{L}/{C}/{R}`,
`frames/{build}/{place}.json`, `bundles/{build}/{place}/{tilesId}/{variant}/...`, `manifests/{build}/{place}.json`,
`builds/{build}.json`, `src/overture/{release}/hg1-{d}/4/{C}/{R}/...` (staged regions), `dem/...` (DEM pieces).

Every put has two guards: the store's cap `HOMETOWN_DISK_CAP_GB` (4 on the 10 GB disk) with the staged regions' own share
`HOMETOWN_SRC_CAP_GB` (1, least recently used go first), and the disk's free-space floor `HOMETOWN_FREE_FLOOR_GB` (2,
counting everything else on the disk: Story Kit, the database). A refused put returns 507 and logs `disk-full`; a new
town is refused before it is enqueued; built towns keep serving.

**The GC** keeps the current build and every build a world names (in `gamemog.db` or `data/storykit`, drafts and sealed
worlds included); anything else goes as a whole build, least recently served first. It is a dry run first: `GET
/api/hometown/admin/gc` (or `scripts/hometown-gc.ts`) prints a plan with an id, and only `POST {planId}` applies that
exact plan. If the pins cannot be read, nothing is deleted.

## Routes

- **Towns** (`HOMETOWN_BUILDER` on, or owner for the owner's session): `POST /api/towns`, `GET /api/towns/{place}`,
  `GET /api/towns/enabled`, `GET /api/places`.
- **Bundles**: `GET /towns/{place}/{build}/{tilesId}/{variant}/...` (public, unlinked: random ids, no listing; Mog City
  reads them across origins). A story's play address names the variant (`&tv=`, `lib/storykit-publish.ts townVariant`):
  the whole town once built, else the spawn district.
- **Tiles** (`HOMETOWN_TILES=on`): `GET /api/hometown/{tiles,far,manifests,builds,places}/...`.
- **Workers** (bearer `HOMETOWN_WORKER_TOKEN`): `/api/hometown/worker/{claim,heartbeat,objects,complete,fail}`.
- **Admin** (bearer `HOMETOWN_ADMIN_TOKEN`, or the owner's /admin session): `status`, `builder`, `prewarm`, `gc`,
  `requests`, `PUT objects/{key}`. With no token set, admin is 404.

## Switches

Web service (`render.yaml`, all set **on for players** since 13 Nov):

| Variable | render.yaml | Meaning |
|---|---|---|
| `HOMETOWN_BUILDER` | `on` | `off`: inert, every town route 404. `owner`: the owner's /admin session only. `on`: players |
| `HOMETOWN_RUNS` | `workflows` | the dispatcher starts runs (needs the key and the slug). `off`: nothing is started (the fastest kill switch) |
| `HOMETOWN_TILES` | `on` | the tile, far and descriptor routes Mog City reads |
| `HOMETOWN_FRAME` | `on` | spawn-first towns: frame, district bundle, lock v3 (compiler 0.7.0+) |
| `NEXT_PUBLIC_HOMETOWN_SEARCH` | `on` | the town box built into Create and `/api/places` (the builder's runtime probe answers the same) |
| `STORYKIT` | `on` | Story Kit for everyone (the town box lives on Create's "Story world") |
| `HOMETOWN_COMPILE` | `off` | the web never compiles; stays off |
| `HOMETOWN_RENDER_API_KEY`, `HOMETOWN_ADMIN_TOKEN` | `sync: false` | secrets, entered by the owner on the Environment page (by hand: see the release order) |
| `HOMETOWN_WORKER_TOKEN` | `generateValue: true` | Render makes it (256 bits) on the first sync and keeps one already there; nobody types or sees it |
| `HOMETOWN_BUILD` | `sync: false` | optional pin of the build (unset: learned, above) |
| `HOMETOWN_WORKFLOW_SLUG` | from the workflow | `fromService ... property: slug`; the task is `<slug>/build_jobs` |
| `HOMETOWN_DAILY_COLD` | `100` | new towns players may ask a UTC day: THE spend cap (built towns are never limited) |
| `HOMETOWN_PER_IP_HOUR` | `3` | new towns per address an hour |
| `HOMETOWN_MAX_WAIT_S` | `600` | a new town whose wait to drive is over this is refused, with the 3 nearest built towns |
| `HOMETOWN_MAX_RUNS` / `HOMETOWN_RUN_SLOTS` / `HOMETOWN_PREWARM_RUNS` | `20` / `4` / `4` | runs in flight at most; compile slots a run; runs while only pre-warm is ready |
| `HOMETOWN_DISK_CAP_GB` / `HOMETOWN_SRC_CAP_GB` | `4` / `1` | the store's share of the 10 GB disk; the staged regions' share of that |

Defaults in code (not in render.yaml): `HOMETOWN_RUN_STARTS_PER_MIN` 4, `HOMETOWN_RUN_TARGET_S` 60,
`HOMETOWN_RUN_SPINUP_S` 45, `HOMETOWN_QUEUE_MAX` max(10, slots x 3), `HOMETOWN_CANARY_RATE` 0.01,
`HOMETOWN_FREE_FLOOR_GB` 2. Never set in production: `HOMETOWN_TOWNS` (the in-process builder, local development only),
`HOMETOWN_RENDER_API` (the local simulation's fake API), `STORYKIT_FAKE_REPLY`, `STORYKIT_MC_ORIGIN`.

Workflow service: `PYTHON_VERSION` 3.14.6 (part of the buildId), `HOMETOWN_WEB` (the web's hostport),
`HOMETOWN_WORKER_TOKEN` (from the web's variable), `HOMETOWN_RUN_PLAN` 4c-8g (read when the task registers, at a
deploy), `HOMETOWN_SLOT_GB` 1.5, `HOMETOWN_CACHE_GB` 4, `HOMETOWN_WORKER_PAUSED` (`sync: false`; `1` = a run claims
nothing and ends; empty or `0` builds). Optional: `HOMETOWN_RUN_CAP_S` (7200), `HOMETOWN_IDLE_S` (20),
`HOMETOWN_OSM_URL`, `HOMETOWN_MOGCITY_REF`.

## The build environment (`deploy/town-builder/workflow-build.sh`)

Workflows build on the native runtime only (`runtime: python`; no Dockerfile). The buildCommand installs the Render SDK
(`workflow-requirements.txt`) and runs `workflow-build.sh`, which writes `.town-builder/`:
- **the compiler at `MOGCITY_SHA`** (THE one line to re-pin; now `aa0bc4515ceff34f57f00ba92eb75d96b77a6cd3`, compiler
  0.8.0), fetched by SHA from github.com/GameMog/GameMog; when a SHA alone cannot be fetched, the branch
  `HOMETOWN_MOGCITY_REF` (default `hometown-compiler`) and then the SHA inside it;
- its packages from the compiler's own hash lock (`--require-hashes`, wheels only) in their own venv;
- **the OSM lane table** (`osm-roads-us.parquet`, 17,100,621 bytes, ODbL) checked against
  `deploy/town-builder/osm-roads-us.parquet.json` (sha256 `555ea001...2f65`): from this checkout if present, else from
  the compiler commit (`tools/hometown/osm/`, with its ODbL notice), else `HOMETOWN_OSM_URL`;
- duckdb's httpfs and spatial extensions installed at build time (a run never downloads one);
- the Overture release's file index; and the **recipe id** (a hash of all of the above, the machine and glibc), which
  `compile.py` folds into the buildId as `HOMETOWN_IMAGE_DIGEST`.

It refuses any Python but `PYTHON_VERSION`. `deploy/hometown-compiler.Dockerfile` is the same recipe, kept for reference.
The workflow rebuilds only when `deploy/town-builder/**` changes (`buildFilter`).

## Measured

**One town, on demand, simulated end to end** (13 Nov 2026, `deploy/town-builder/workflow-sim.sh`: `next dev` with
production's switches and no `HOMETOWN_BUILD`, a local Render Workflows that starts each run as a fresh process of
`workflow.py` over the Render SDK's own protocol, the build environment made by `workflow-build.sh` at compiler 0.8.0;
2 compile slots a run, 2 runs at most, the Mac shared). Town: **Wewoka, OK** (us-4080550), never built, an empty store,
capped (its search square is 5.3 km), 196 tiles. Driven from Create in Chrome.

| From the pick on Create | Seconds |
|---|---:|
| Admitted (no build known: one run learned it) | 16 |
| Story ready (frame, lock v3; "Ready to write: 54 places") | 58 |
| Drive (district bundle) | 81 |
| Whole town | 351 |
| All runs ended (idle) | 383 |

Runs: 2 (the probe and one more), both `exit: idle`; run wall 671 s, **CPU 231 s** for the whole town. Jobs: 3 regions,
4 ctx, 37 tile jobs, 1 frame, 2 bundles: 47, none failed. The frame moved the box onto Wewoka's downtown (`retile`: 4
tile jobs dropped). The story (the fixture reply, no model call) was written 180 s after "Write the story"; on the local
Mog City the whole town was drivable 3.4-4.0 s after the title screen, and the car drove 271 m in 9 s down W 5th St past
a shop signed with the town's name.

The earlier run (Boley, OK, 121 tiles, compiler 0.7.0, `HOMETOWN_BUILD` pinned): story 59 s, drive 72 s, whole 411 s,
181.5 CPU-s. A bug that run found is fixed (a 2-slot run ended after one job: now only a claim made with every slot free
and nothing running can end a run).

**Peak RSS** (M-series Mac, sources fetched): a whole place `--id` 1.4-1.8 GB; one L2 block 0.4-1.2 GB; one tile
0.35-1.2 GB; a stage-1 descriptor 66 MB; `fetch.py --regions` about 3 GB. So nothing compiles on the 2 GB web, and a
4c-8g run gives each of its 4 slots 1.5 GB plus a 4 GB cache.

**Disk per town**: Okemah 169 tiles 11 MB, Phoenix 225 tiles 20 MB, Pittsburgh 225 tiles 28 MB (a full capped box,
plus about 2 MB of bundles). The 4 GB store holds about 130-300 towns before the disk grows.

**Bandwidth**: a play pulls 1 MB (the spawn's tiles) to 11 MB (a whole town); tiles and bundles are immutable and cached
for a year. Render includes 5 GB a month on Hobby, then $0.15/GB.

## Cost (Render Workflows prices, 13 Nov 2026)

Runs bill per second: 4c-8g (ours) $1.00/h; 2c-4g $0.40, 2c-8g $0.70, 4c-16g $1.50, 8c-32g $2.50. No run, no bill.
One town is 181-231 CPU-s on the Mac; with 2x for Render's vCPUs, about $0.025-0.03 a town on a busy run and
$0.08-0.12 for a town built alone (its jobs wait on each other: regions, ctx, frame, district, then the rest), plus the
20 s idle tail. The web 1c-2g ($25/month) and the 10 GB disk ($2.50/month) are unchanged.

| Scenario | Builder | Total a month |
|---|---|---|
| Idle | $0 | $27.50 |
| 30 towns a month (owner test) | about $3 | about $31 |
| 300 new towns a month | about $30 | about $60 (+$5 when the disk grows to 20 GB) |
| A why.com-size viral day (600 new towns) | $15-60 that day | + web 2c-4g if it is slow |
| The daily cap (`HOMETOWN_DAILY_COLD` 100) | at most about $10 a day | |
| The ceiling (`HOMETOWN_MAX_RUNS` 20 x 24 h) | at most $480 a day | |

## Safety valves

- **Kill switches**, fastest first: web `HOMETOWN_RUNS=off` (no new run; runs in flight finish their jobs and end);
  workflow `HOMETOWN_WORKER_PAUSED=1` (a run claims nothing and ends); web `HOMETOWN_BUILDER=owner` or `off`; revoke the
  Render API key.
- **The breaker** (`dispatch.ts fruitless`): when the last 3 runs ended without claiming at the current build (paused,
  token refused, crashed at start, or a redeploy whose build differs from a pinned `HOMETOWN_BUILD`), nothing is started
  for 10 minutes, then one probe run; the /admin card says why.
- **Limits on new towns**: `HOMETOWN_DAILY_COLD`, `HOMETOWN_PER_IP_HOUR`, `HOMETOWN_QUEUE_MAX`, `HOMETOWN_MAX_WAIT_S`.
  A built town is never limited.
- **Determinism canary**: 1% of tile jobs are recompiled on another run and compared byte for byte.

## Release order (the first push that turns the builder on)

A Blueprint update **ignores new `sync: false` keys** (Render's Blueprint spec: they are asked for only when a Blueprint
is first created), and the workflow service is created and built the moment `main` carries it. So, in this order:

1. **Mog City's engine first.** mc.gamemog.com (branch `mogcity`, GitHub Pages) must play `?city=pkg&town=..&tv=..`
   before any player can pick a town. Release it as a fast-forward of the live `mogcity` (tree-only release commit,
   `.scratch` left out), after the SF 2040, Pickup Time and New York regressions.
2. **The compiler commit on GitHub.** Push the commit `MOGCITY_SHA` names to the `hometown-compiler` branch of
   GameMog/GameMog BEFORE `main`. The workflow builds at once when it is created and is rebuilt only by
   `deploy/town-builder/**` changes, so a compiler pushed later is never picked up (start a manual deploy of
   gamemog-town-builder if the order was missed).
3. **The owner enters `HOMETOWN_RENDER_API_KEY`** (and `HOMETOWN_ADMIN_TOKEN` if not there yet) on the gamemog
   service's Environment page by hand. `HOMETOWN_WORKER_TOKEN` needs nothing: Render generates it.
4. **Nothing building** on Render (a deploy stops builds in flight), then push `main`; the Blueprint must sync.
5. Check: the workflow's build log ends `town-builder build: ok`; the workflow service shows `HOMETOWN_WORKER_TOKEN`;
   the web shows `HOMETOWN_WORKFLOW_SLUG` filled in; the owner's builder status page shows no "runs problem". Then one
   owner test pick.

Safe fallback while any step is open: `HOMETOWN_BUILDER=owner` and `NEXT_PUBLIC_HOMETOWN_SEARCH=off`.

## Compiler upgrade

1. Re-pin `MOGCITY_SHA` in `workflow-build.sh` and push; only the workflow rebuilds. The commit must be on a branch of
   GameMog/GameMog first.
2. With `HOMETOWN_BUILD` unset the new build is used as soon as a run of it claims (towns are then built at it; towns
   built at the old build keep playing at it: every story pins its lock). To shadow-build first, pin `HOMETOWN_BUILD`
   to the old build, pre-warm at the new one (`POST /api/hometown/admin/prewarm {"n": 100, "build": "<new>"}`), then
   change the pin.
3. After 30 days, the GC dry run lists the unpinned old objects; the owner applies the plan.

## Local development

- `deploy/town-builder/workflow-sim.sh`: the whole on-demand path on a Mac (ports 4830 web, 4840 the fake Render API).
  Options: `SIM_LEARN_BUILD=1` (no `HOMETOWN_BUILD`, as production starts), `SIM_ASK=browser` (a player picks on
  Create), `SIM_HOLD_S`, `SIM_FAKE_REPLY`, `MC_ORIGIN` (a local Mog City). Its build environment comes from
  `workflow-build.sh` with `HOMETOWN_MOGCITY_SRC`, `HOMETOWN_TB_VENV`, `HOMETOWN_TB_DATA`.
- `deploy/town-builder/dry-run.sh`: one `worker.py` against `next dev`.
- `HOMETOWN_TOWNS=on` (with `HOMETOWN_BUILDER=off`): the older in-process builder (`lib/hometown/towns.ts`), which
  compiles inside the web process. For a Mac with the compiler checked out only; never on Render.
- Checks: `npm run check` runs `hometown-build-check`, `hometown-dispatch-check`, `hometown-tiles-check`,
  `hometown-towns-check`, `storykit-hometown-check`, `storykit-wardrobe-check`; the worker's own tests are
  `python3 -m unittest deploy/town-builder/test_worker.py`.
