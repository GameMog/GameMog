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
| The compiler | MogCity `tools/hometown` (compiler **0.12.0**), fetched at `MOGCITY_SHA` | github.com/GameMog/GameMog, branch `hometown-compiler` |
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
8. **A story pinned to an older build** (the builder moved on before that build's whole town was built, so it would
   play the old spawn district for ever, its places outside the district missing): when the town's current build has
   its whole town, the same frame, and every place the story names is the same place there (same id, same kind, within
   30 m; `lib/storykit-upgrade.ts`), the play page plays the current whole town with the world re-pinned to it, and
   `growing.js` (it sends `&world=<sha256>` with its poll) gets `upgrade: { build, tilesId, variant, url, pack }` and
   swaps there. Otherwise the story keeps its pinned build; the owner's screen (Story towns) says why and offers a
   re-pin, which gates the pack against the new build's map before anything changes.

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

### A compiler upgrade learns its build (14 Nov; before, a manual `build_jobs` run)

Every run sends its **deploy stamp** with its claims: the files that make the workflow (`deploy/town-builder/*`, exactly
the workflow's `buildFilter`) hashed by name and bytes (`worker.py deploy_stamp`). The web computes the same stamp from
its own checkout (`lib/hometown-build/stamp.ts`); both deploy from the same commit, and the workflow rebuilds exactly
when those files change. So, with `HOMETOWN_BUILD` empty (`towns.ts buildView`):

- the build of the **newest run that reports the web's stamp** is the current build (learned);
- until one has (the workflow is still rebuilding, or no run has started since), the build is **not learned**: a pick of a
  town built in full at the old build plays at once; any other pick is kept (202 "Waiting its turn") and is admitted
  only at a build a **live** run reports (that run can claim it now), never at a build no run may claim again;
- at the web's boot (`build-learn` in the event log) and on every kept pick, the dispatcher starts **one** run to learn
  it, at most one every 2 minutes while learning (`PROBE_GAP_MS`: a run that reported the old deploy, the workflow still
  rebuilding, is not followed by another at once), for 10 minutes after the last boot or pick;
- once learned, a town left at an older build that no live run reports (admitted by a run of the old deploy that has
  since ended) **moves** to the new build (`rekeyStale`, `town-rekeyed` in the event log): a town not yet playable whole;
  a playable one keeps its row and spawn district (a story pinned to it plays it) and is built whole at the new build.
  The old build's unfinished jobs are dropped when no other town wants them. A pinned `HOMETOWN_BUILD` is never moved.

`HOMETOWN_DEPLOY_STAMP` overrides the stamp (16 hex) on either side, or `off` on the web (the build the runs report, as
before). If the workflow's rebuild fails, its old deploy keeps running: picks are then built at the old build by live
runs of it, and the /admin card keeps saying "learning".

### A pinned build on an empty store stages its regions at the pick

The Overture release a build reads is in its build record, which the build's first run stores before it claims. A town
picked before that (a pinned `HOMETOWN_BUILD` on an empty store) still gets its regions jobs at the pick: bound to the
build (only its runs claim them), keyed `regions:@<build>:...`, the release filled in at the claim from the claiming
run's record (`server.ts`), so its ctx and tiles wait on one round of fetches instead of finding regions missing one exit
3 at a time.

### The first pick on a fresh deploy: the build is learned in the same run

The build new towns are made at is `HOMETOWN_BUILD` when set; else the build the live runs report; else the build the
**last** run reported (the `workers` table in `queue.db`, on the disk: it survives runs ending and web deploys alike). A
buildId hashes the compiler, its packages, the OSM table and the run's machine (the recipe id), so it is only known once
a run has started on Render. On a fresh deploy with no run ever, the first pick is **kept** (the `pending` table) and
answered 202 "Waiting its turn" at once; it logs `build-unknown`, and the dispatcher starts **one** run to learn it
(`plan().probe`). That run's first claim records its build and admits every kept pick at it (`towns.ts admitPending`,
called by the claim itself), then takes the town's first job **in the same claim**: no refusal, no 15 s retry round trip
by the Create card, no idle claim. A kept pick that no run admits within 10 minutes is refused as busy. (Before 14 Nov the
pick was answered 503 with `retryS: 15` and admitted on the card's next ask: the live Wewoka pick reached "framing" at
15.9 s for that round trip alone.) The breaker (below) bounds a probe that never claims.

When `HOMETOWN_RUNS=workflows` but no run can start (no `HOMETOWN_RENDER_API_KEY`, or no slug: the status page's "runs
problem"), a pick of any town not built in full is refused at once with "New towns aren't being built right now"
(503, no `retryS`), so nobody waits on a run that cannot come. Towns built in full keep playing.

### The cold start, measured (14 Nov, the local simulation, cold Prague, OK: 196 tiles, no build known)

| | before | after |
|---|---|---|
| pick -> first job claimed ("framing") | 18 s (503, the card's 15 s retry) | 3-11 s (kept, admitted by the run's first claim) |
| a run's start-up (compiler flags + buildId) | serial | side by side, 0.6-1.9 s (`initS`) |
| the frame's own compile (same machine, same inputs) | 66.6 s (it computed 9 ctx blocks in turn) | 22.5 s (9 ctx jobs side by side before it) |
| slot idle between a job's end and the run's next claim | 38 gaps over 5 s, 577 s | 4 gaps, 28 s |
| slot use while the town builds | 37-38 % | 63-68 % |
| whole town / billed run seconds (load-confounded) | 1,224 s / 2,321 s | 487 s / 920 s |

Every ctx block a town's compiles read (Prague: 9) is its own P0 job waiting on its own region only, the frame waits on
all of them, and a tile block on those within its reach; the bytes are the compiler's either way (Prague's 248 tiles,
9 ctx, frame and both bundles byte-identical before and after). On Render the first pick after a quiet spell now waits
the run's spin-up plus about 1-2 s to "framing" (live: 15.9 s, the retry round trip), and the story's frame waits the
slowest of its ctx blocks instead of all of them in turn: on Prague here the frame compile is 44 s shorter, and the 9 ctx
jobs before it take about one ctx job's time (10-20 s) on a run's 4 slots and a second run's, so about 25-30 s less.

### When a job fails: retries, split tiles, degraded towns, "Try again"

- **Retries.** Any job is retried with backoff (5 s, then 10 s) and fails after 3 attempts (`queue.ts`).
- **A tile job of several tiles** (a 16-tile block or a 2 x 2 quad) that fails 3 times is **split** into one job per tile,
  each with 3 fresh attempts; the tiles that compile are kept. The event log records `split`.
- **A one-tile job that fails for good degrades the town instead of failing it**: the full bundle stops waiting on it and
  lists the tile in its `args.absent` (`degraded` in the log). The worker lays **flat ground** there in its local store
  before the assembler runs (`worker.py placeholder_tile`: the HTL1 tile format, lawn, no roads or buildings, the terrain
  a Coons patch between the edges of the built neighbours, so no cliff at a seam), and removes it, with the session
  descriptor written over it, before any upload: a placeholder never reaches the web's store under a real tile key, and a
  degraded town has no `manifests/` descriptor (the web takes one only when every tile it lists is stored; a later whole
  build may store its own). The town still becomes `full`; its row keeps `meta.absent`, and `/admin` lists it ("built with
  flat patches"). Tiles a compile refused (no DEM under them) are laid the same way in the full bundle.
- **The spawn district still fails clearly.** A district bundle that waits on a failed tile of its window fails, and so
  does its town; a failed tile inside the frame's `spawnDistrict` (without the frame: the anchor's 5 x 5) fails the town
  as soon as the frame lands (`towns.ts fatalFailures`). Any other failed job (regions, ctx, frame, bundle) fails the town
  as before; `/admin` shows the job and its error.
- **Only the district's own tiles hold the district** (14 Nov): when a block job shared by district and outside tiles is
  split, the district bundle (`args.window`) waits on its window's tiles only, and a failed tile outside it drops out of
  it (Surfside, FL failed for a tile outside its district before).
- **The full bundle never lays the spawn district flat** (14 Nov): it carries the district as `args.keep` (set when the
  frame lands; without the frame, the anchor's 5 x 5) and fails instead of degrading for a tile there; one degraded over a
  district tile before the frame landed fails with the town when it does. A failed town is no longer assembled anyway
  and then served as ready with its downtown as flat ground (Beverly Beach, FL).
- **"Try again"** on a failed town (the Create card POSTs the pick again) queues that town's failed jobs again **at
  once**, their attempts reset (`queue.ts retryFailed`; `town-retry` in the log), and takes the tiles it queues again out
  of the full bundle's `args.absent` (it waits on them again instead of laying them flat). Before, a re-ask within 60 s
  joined the same failed jobs and got the same "Not built". The retry is not a new town for the address limit.
- **The Create card follows a town ready to write** (phase district or growing) every 5 s until it is whole or fails
  (`lib/places/request-city.ts` onLater), so a town that fails after its frame no longer keeps saying "Ready to write".

### The per-address limit and the dispatcher's own housekeeping

- `HOMETOWN_PER_IP_HOUR` is counted in `queue.db` (`ip_hits`, a hash of the address, never the address): a deploy no
  longer resets it. It counts towns, not asks (14 Nov: `ip_hits.place`): a failed town asked again by the address that
  asked for it is no new town, so its "Try again" is never refused with "Lots of towns are being built".
- **A worker tops up regions staged by an older compiler** (14 Nov): compiler 0.10.0 refuses a region without
  `overture-base-land.parquet` and the segment extras ("fetched without ..."), which no region staged by 0.8.0 has, and a
  staged region's `files.json` is write-once. When a compile still refuses a region staged on the worker ("fetched
  without ...", or a ctx's "no region of [...] fetched"), `worker.py compile` runs `fetch.py --regions` once per region
  and job for it and its neighbours the web has staged (one read of each layer's union for the town's 3 x 3), under
  their locks (it fetches only the missing layers and the extras), and compiles again. A worker runs one `fetch.py` at a
  time: its segment extras go through one fixed folder of the data dir, and two side by side would mix envelopes.
- **A retry uploads what an earlier attempt left** (14 Nov): `worker.py upload_new` takes every object made in this run
  and not yet uploaded, not only this attempt's: a full bundle's stage-2 manifest (`put_if_absent`) left by a failed
  first attempt was never uploaded before, and every retry got "outputs not stored" (Boley, OK).
- The dispatcher's plan (every 5 s and on every queue change) sums the work in SQL over the `jobs_plan` index (each job
  carries its cost units) and counts ready jobs with their deps checked by primary key, only as far as a decision needs:
  about 8 ms at 20,000 queued jobs (under 100 ms when none of them is ready) where it parsed every row in JS before
  (about 200-330 ms, the event loop blocked).
- Rows of the `runs` table that can no longer be live (a `starting` row whose POST never went through for 10 minutes, a
  run older than a run can be) are retired in one indexed update at the start of every pass (`runs-reaped`), even while
  starts are held; before, they could stay counted in flight and hold back new runs.
- A worker claims one job at a time; a claim made with its last slot free asks for P0 work only. The claim's long-poll
  now re-reads the worker's free slots from its leases on every wake-up, so when its other job completes that same claim
  takes P1 work at once, instead of sitting out its 20 s (one P1 job per 20 s per run, measured in the simulation).

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
- **the compiler at `MOGCITY_SHA`** (THE one line to re-pin; now `7f68d4e052703808467a775ee560d726c35b004b`, compiler
  0.12.0), fetched by SHA from github.com/GameMog/GameMog; when a SHA alone cannot be fetched, the branch
  `HOMETOWN_MOGCITY_REF` (default `hometown-compiler`) and then the SHA inside it;
- its packages from the compiler's own hash lock (`--require-hashes`, wheels only) in their own venv;
- **the OSM lane table** (`osm-roads-us.parquet`, 19,372,313 bytes, ODbL) checked against
  `deploy/town-builder/osm-roads-us.parquet.json` (sha256 `369b9deb...0128`): from this checkout if present, else from
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

**Compiler 0.9.0, the round-4 merge** (14 Nov 2026, the same simulation, `SIM_LEARN_BUILD=1`, the Mac shared at load
average 15-50). Wewoka, OK, cold: story ready 306 s, drive 338 s, whole 470 s, all runs ended 503 s; 2 runs, 51 jobs, none
failed, CPU 274 s. The first 3 minutes were the two regions jobs reading Overture from S3 (08:04 to 08:07), and the
frame then waited on a fifth region its downtown box needed; the frame itself compiled in 15 s. The 13 Nov run read the same
regions in 15 s (story 41-58 s), so the difference is the network, not the code. Prague, OK, cold with tile
`hg1-conus/0/5731/8563` forced to fail (`SIM_FAIL_TILE`): the tile block split, the tile failed 3 times, and the town
became whole **degraded** at 899 s (story 275 s, drive 327 s) with that tile flat ground; no manifest was stored and the
web's store never received that tile; 3 runs, all ended idle. The same forced failure before round 4 failed the town (409).

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

## Release r11 (compiler 0.12.0, re-pinned)

Live before it: gamemog.com `main` f81fea8e, mc.gamemog.com `mogcity` 6faee4bf (the tree of MogCity `r10s`
`e8c98e6766acbd35c993ca1f0b9a3cc2cbc3aa3a`), `hometown-compiler` e8c98e67. r11 adds: a picked pickup (`fleetCar`
pickup, the town fleet's pickup89) keeps its tow rig, built as its own group and fitted to the model's bed and roof
(the procedural wrecker looks the same as before); the speedometer shows a car's real mph, with the doubled dial kept
for Dan's roadster alone; the cache stamp `20261115-r11` for the city scripts and for New York's. `tools/hometown` is
unchanged, so the compiler stays 0.12.0 and the buildId does not change; the pin moves to the r11 tip only to keep
`MOGCITY_SHA` on the branch's tip.

In this order:

1. **Mog City's engine**: push the local MogCity branch `mogcity-release-r11` (parent `6faee4bf` = the live `mogcity`,
   a fast-forward; the tree of MogCity `r11` `7f68d4e052703808467a775ee560d726c35b004b` without `.scratch`, the live
   README and `CNAME` kept; no live file deleted) to `mogcity`.
2. **The compiler commit**: push MogCity `r11` (tip `7f68d4e052703808467a775ee560d726c35b004b`) to
   `hometown-compiler` BEFORE `main` (it descends from the live e8c98e67, a fast-forward).
3. **Nothing building** on Render, then push GameMog `r10-misc` to `main` (a fast-forward of f81fea8e). The pin changed
   under `deploy/town-builder/**`, so the workflow rebuilds, at the same compiler 0.12.0.

## Release r10 (compiler 0.12.0, re-pinned)

Live before it: gamemog.com `main` 4cf761c7, mc.gamemog.com `mogcity` 5b45e939 (the tree of MogCity `release-r5`
`875cf960d14669d919395b4b06205fd08e1991e5`), `hometown-compiler` 875cf960. r10 adds: pier signs, labels and piers 86
and 81 that name no real operator; the creator-picked hero car (`fleetCar`, Create's optional Car dropdown) as the town
fleet's realistic model, keeping the story's abilities; the town's map-data credit on the loading screen, the title,
the pause menu and Credits (and on the game page and the library), no longer over play; no driving hitch every 1-2 s
in big towns (a terrain rebuild looks only at the tunnels near a point and reads each height once; meshes unchanged),
with the city scripts' cache stamp `20261114-r10`. `tools/hometown` is unchanged
since r8, so the compiler stays 0.12.0 and the buildId does not change; the pin moves to the r10 tip only to keep
`MOGCITY_SHA` on the branch's tip.

In this order:

1. **Mog City's engine**: push the local MogCity branch `mogcity-release-r10s` (parent `5b45e939` = the live `mogcity`,
   a fast-forward; the tree of MogCity `r10s` `e8c98e6766acbd35c993ca1f0b9a3cc2cbc3aa3a` without `.scratch`, the
   live README and `CNAME` kept; no live file deleted) to `mogcity`.
2. **The compiler commit**: push MogCity `r10s` (tip `e8c98e6766acbd35c993ca1f0b9a3cc2cbc3aa3a`) to
   `hometown-compiler` BEFORE `main` (it descends from the live 875cf960, a fast-forward).
3. **Nothing building** on Render, then push GameMog `r10-misc` to `main` (a fast-forward of 4cf761c7). The pin changed
   under `deploy/town-builder/**`, so the workflow rebuilds, at the same compiler 0.12.0.

## Release r8 (compiler 0.12.0)

Everything is committed locally and nothing is pushed. It supersedes release r7 (never pushed: its branches are folded
in, so everything listed under r7 below ships with it). Live: gamemog.com `main` d6241046 (r6, the voice-plan fix
fbc60528, the revoice page a54530ea, admin visibility d6241046), mc.gamemog.com `mogcity` ee368f8 (r6a),
`hometown-compiler` d7e60927 (compiler 0.10.0). What r8 adds to r7:

- **Compiler 0.12.0** (MogCity `release-r5`, tip `875cf960d14669d919395b4b06205fd08e1991e5`): reach's approach points. Every story
  place in the frame carries `ax, az` (`aHow`): where a person on foot is sent, outdoors, 1.5 m clear of every building,
  off the water and the carriageway, a straight walk from its lane point (`tools/hometown/approach.py`;
  `reach_scan.py <package>` checks a compiled town). The frame's bytes (and the bundle's `PKG.places`) change, the
  tiles do not. The OSM lane table is unchanged (same pin). New buildId `htc-0.12.0-hg1-b...`.
- **Mog City's engine** (index.html script version `20261114-r9`; r9 adds cars9's town cars, CC BY 4.0 models that
  drive and park the towns, take any car, and people2's forged hairline, hair, skin, eyes and idle): reach (the story runner's footing guard: every on-foot
  target moved to ground a person can stand on, never a ring inside a building; a beacon over the objective, its name
  and distance, the hold-F prompt, "Follow the marker"; the test drive fails a mission whose place no player could reach,
  `wagmi/storyrun/reach.js`: a horse ride held to the on-foot rule, a car's spot on any street of the road graph, even one
  the traffic keeps no lane of); r8-voices (a story line ducks the street and the effects; a story call's gentler call
  band); r8-people (forged people's soft hair edges and graded skin); r8-story (the action layer, `wagmi/storyrun/action.js`,
  on by itself in a hometown world: title slams, the chase's camera, lens, speed lines and moments, a step's sting /
  shake / slow motion / camera, a cutscene shot's grammar, an act's cliffhanger; a story chase's alarm names its own
  pursuer, never "Delgado's crew").
- **GameMog** `prod-builder-clean`: the pin above; live `main` merged in (the voice-plan fix, the owner's revoice page
  `/storykit/revoice.html`, /admin's Live / Link only / Only me control beside r7's Story towns card); Story Kit
  reachability (`lib/storykit-reach.ts`, `lib/drive-reach.ts`: a test drive that cannot reach a place has the builder
  swap it for the nearest reachable place of its kind, at most 3 times, and a town's unreachable places are never offered
  again; the gate prefers reachable places, `docs/RULES.md` 1i); the forge's crotch fix for women's jackets and coats;
  the builder's cinematic rules (`storykit/BUILDER.md` "Set pieces", the `CINEMATIC` first-turn sentence,
  `pacingProblems`' one send-back, the action layer's schema fields `sting`, `shake`, `slowmo`, `cam`, `frame`, `cliff`,
  a pursuit's `name`, `docs/RULES.md` 1j; shipped untested by the owner's call, the owner tests it with a story build).

In this order (a push of `main` restarts the web and stops builds in flight, so the owner picks the moment):

1. **Mog City's engine** (`mogcity`; no build needed, old towns keep playing; the old web ignores `&world=`): push the
   local MogCity branch `mogcity-release-r9` (parent `6c14231` = the live `mogcity` r8, so a fast-forward; the tree of
   MogCity `release-r5` `875cf960d14669d919395b4b06205fd08e1991e5` without `.scratch`, the live README and `CNAME` kept; no live file
   deleted) to the `mogcity` branch of GameMog/GameMog. Towns built before 0.12.0 have no `ax, az`: the runner's
   footing guard moves their on-foot targets.
2. **The compiler commit** (`hometown-compiler`): push MogCity `release-r5` (tip `875cf960d14669d919395b4b06205fd08e1991e5`, compiler 0.12.0)
   to the `hometown-compiler` branch of GameMog/GameMog BEFORE `main` (it descends from the live `d7e60927`, so a
   fast-forward).
3. **Nothing building** on Render, then push GameMog `prod-builder-clean` to `main` (it contains the live `d6241046`, so
   a fast-forward). `deploy/town-builder/**` changed (the pin), so the workflow rebuilds at compiler 0.12.0; the web
   deploys the rest.
4. **No manual run, nothing by hand for the build.** The web learns the 0.12.0 build itself. Towns built at 0.10.0 keep
   playing at their build; a town asked again is built at 0.12.0 (its places' approach points and, in the warm band,
   the r7 look).
5. **Story towns**, as in r7 step 5, at 0.12.0: "The Courtesy Lane" needs Bal Harbour built at 0.12.0 (the owner's test
   pick of Bal Harbour on Create does it). The /admin Story towns card shows each pinned story's state and why.
6. Check /admin opens (the Town builder and Story towns cards, a world's Live / Link only / Only me), then that one
   owner test pick, and one story build to try the cinematic rules.

## Release r7 (compiler 0.11.0, superseded by r8)

Never pushed: folded into release r8 above, whose release order replaces the one below.

Everything is committed locally and nothing is pushed. Release r6 is live: gamemog.com `main` 8a878166, mc.gamemog.com
`mogcity` ee368f8 (r6a: the story search ring a player can reach), `hometown-compiler` d7e60927 (compiler 0.10.0).
What is in r7:

- **Compiler 0.11.0** (MogCity `release-r5`, tip `578423c6da6c738291413cefb3b058e300c4dedd`): the r7 warm-band rules (labelled 0.10.1 on their
  branch; warm-climate towns only): a trunk or primary road's 2 m planting strip between the curb and the sidewalk; the
  dunes behind a beach (patchy sand and scrub within 30 m of it, no longer mowed lawn); hedge walls kept where a lot
  fronts the road; a gap in every hedge where a driveway or path crosses it; trees over the street's hedge walls (three
  in four sea grape). The OSM lane table is unchanged (same pin). New buildId `htc-0.11.0-hg1-b...`.
- **Mog City's engine** (index.html script version `20261114-r7`): r6a's story search ring; a car driven into the
  water sinks with a splash and is put back on the road (X at once, or after 3 s), and a car stuck off the road is put
  back after 5 s (r8: on a bridge's deck at the deck's own height, not under it; a bank under a bridge is not road);
  town chases open with a cruiser coming down the player's road at him; no San Francisco landmark
  warnings in towns; the full map's street names kept clear of its panels; Bal Harbour's polish (a mall roof that reads
  as a roof, lower varied hedges, banded and curved towers, no walkers on medians); `growing.js` sends `&world=` with
  its poll and swaps to the current whole town when the web offers a story `upgrade`.
- **GameMog** `prod-builder-clean`: the pin above; a hometown story's voice plan lists its lines (fbc60528); story
  towns (a story pinned to an older build plays the current whole town when every place it names is the same place
  there, `lib/storykit-upgrade.ts`; the owner's Story towns card and its re-pin); Create's town card (honest live
  progress, its ready states, the "Drive around" test drive, a "Your hometown" entry); the key art page tells anyone
  not signed in to sign in at /admin; a story world on a phone shows the desktop-only note instead of the city. r8:
  a hometown story world's page is a story world's (it was read as an arcade world: "Endless laps", arcade controls,
  and a frame that never started), with its town by name, the desktop-only note on phones and the WebGPU note; the
  town card calls a town slow only past 1.25 x what it was told (its own promise when that was longer than the median
  town's), and its waits count down instead of jittering with every poll.

In this order (a push of `main` restarts the web and stops builds in flight, so the owner picks the moment):

1. **Mog City's engine** (`mogcity`; no build needed, old towns keep playing; the old web ignores `&world=`): push the
   local MogCity branch `mogcity-release-r7` (parent `ee368f8` = the live `mogcity`, so a fast-forward; the tree of
   MogCity `release-r5` `578423c6da6c738291413cefb3b058e300c4dedd` without `.scratch`, the live README and `CNAME` kept; no live file
   deleted) to the `mogcity` branch of GameMog/GameMog.
2. **The compiler commit** (`hometown-compiler`): push MogCity `release-r5` (tip `578423c6da6c738291413cefb3b058e300c4dedd`, compiler 0.11.0)
   to the `hometown-compiler` branch of GameMog/GameMog BEFORE `main` (it descends from the live `d7e60927`, so a
   fast-forward).
3. **Nothing building** on Render, then push GameMog `prod-builder-clean` to `main`. `deploy/town-builder/**` changed
   (the pin), so the workflow rebuilds at compiler 0.11.0; the web deploys the rest.
4. **No manual run, nothing by hand for the build.** The web learns the 0.11.0 build itself, as in r6. Towns built at
   0.10.0 keep playing at their build; a town asked again is built at 0.11.0 (that is when a live town gets the r7 look:
   Bal Harbour's only after it is built again).
5. **Story towns.** A story pinned to an older build is `waiting` (it plays its pinned build) until its town's whole
   town is built at 0.11.0; then it plays that whole town if every place it names is the same place there. "The
   Courtesy Lane" (Bal Harbour, pinned to 0.8.0's district) therefore needs Bal Harbour built at 0.11.0: the owner's
   test pick of Bal Harbour on Create does it. The /admin Story towns card shows each pinned story's state and why.
6. Check /admin opens (the Town builder and Story towns cards), then that one owner test pick.

## Release r6 (compiler 0.10.0)

Live since 14 Nov (r6a added the story search ring on `mogcity` ee368f8 and `hometown-compiler` d7e60927).
It supersedes the round 4 release (never pushed: its branches
`mogcity-release-2` and MogCity `prod-builder` `dd7e82ec` are folded into this one). What is in it:

- **Compiler 0.10.0** (MogCity `release-r5`, tip `d7a5b6f7beae0f73ef1f51bf5675b1e85a03f172`): round 4 (0.9.0: Fort Pitt's tunnel portals at
  their connectors, no link that short at a portal); the DEM's `/historical/` fallback (a pinned 3DEP file that USGS
  replaced under `/current/` is read from its dated copy, same bytes, so a build never fails because upstream moved);
  the fidelity line, rounds 1 and 2: each carriageway's own sidewalks and cycleways, a divided road's lanes as OSM
  counts them and a narrow median as open ground; the warm band (palm rows, clipped hedges, sea grape, the
  south-Florida building region); beaches and wet sand as ground; malls (a large low retail building, shops on every
  open wall) and hedge walls along the main roads and round the car parks; and arrival and place street names spelled as
  a sign spells them ("N 3rd St", "McDonald Ave", "US Hwy 1", no longer `str.title()`'s "N 3Rd St"). New buildId
  `htc-0.10.0-hg1-b...`.
- **Mog City's engine** (index.html script version `20261114-r6`): round 4's engine (shop signs that do not repeat
  within sight, a town's bus kept to roads it can be passed on, street furniture on another level never stops the car,
  no deck parapet under another deck's lanes); the fidelity line's drawing of all of the above (sidewalks, medians and
  their curbs, palms and hedge walls, beach sand, the mall's storefronts); a town's buses signed with the town's name and
  in one of a few plain liveries, and the player's plate from the town's state (never San Francisco's); road paint that
  stays put under the floating origin; Pittsburgh's chase start on E Carson St, not boxed in; street names cased right
  for towns built before 0.10.0; a mission place whose own street the traffic does not drive (Cedar Key's Dock St, out on
  the water) keeps the nearest lane it does, within 250 m, instead of going missing.
- **GameMog** `prod-builder-clean`: the pin above, the town builder fixes, rough builder/signs/wardrobe, the storyart
  fix, the build learned from a new workflow deploy by itself, regions at a pinned pick, the full town playing at its
  build, and the key art page (below); the OSM lane table pin of compiler 0.10.0 (fid-roads' sidewalk and cycleway
  columns); the release r6 builder fixes (regions staged by 0.8.0 topped up, a retry uploading what its first attempt
  left, the spawn district never laid flat, a district held by its own tiles only, the card following a growing town,
  "Try again" not counted as a new town). The /admin crash fix fc8ba0fc is already live.

In this order (a push of `main` restarts the web and stops builds in flight, so the owner picks the moment):

1. **Mog City's engine** (`mogcity`; no build needed, old towns keep playing): push the local MogCity branch
   `mogcity-release-r6` (parent `c2d9749` = the live `mogcity`, so a fast-forward; the tree of MogCity `release-r5`
   `d7a5b6f7beae0f73ef1f51bf5675b1e85a03f172` without `.scratch`, the live README paragraph and `CNAME` kept; no live file deleted) to the
   `mogcity` branch of GameMog/GameMog.
2. **The compiler commit** (`hometown-compiler`): push MogCity `release-r5` (tip `d7a5b6f7beae0f73ef1f51bf5675b1e85a03f172`, compiler 0.10.0)
   to the `hometown-compiler` branch of GameMog/GameMog BEFORE `main` (it descends from the live `aa0bc45`, so a
   fast-forward).
3. **Nothing building** on Render, then push GameMog `prod-builder-clean` to `main`. `deploy/town-builder/**` changed
   (the pin), so the workflow rebuilds at compiler 0.10.0; the web deploys the builder's fixes.
4. **No manual run, nothing by hand for the build.** The web learns the 0.10.0 build itself (below, "A compiler upgrade
   learns its build"): at its boot it starts one run, and again every 2 minutes while picks wait, until a run of the new
   workflow deploy reports it. Towns built at 0.8.0 keep playing at their build; a town asked again is built at 0.10.0.
   The /admin card's Build line says "learning" until then. Leave `HOMETOWN_BUILD` empty.
5. Check /admin opens (the Town builder card), then one owner test pick.
6. **Story worlds with no key art** (published while the test drive played the wrong city, before work.js read the
   town's four-part frame): open `/storykit/keyart.html` in the owner's /admin browser; it lists them, and each one's
   link plays that world in Mog City and keeps its key art (below, "Key art again").
7. **Story worlds with no voices** (every hometown story published before the voice plan read the town's table, 14 Nov:
   sealed with no lines, so the cast spoke only the placeholder mumble): open `/storykit/revoice.html` in the owner's
   /admin browser and record each one (below, "Voices again").

### Key art again

A published story world whose test drive never drove it has no key art: before work.js read a town's four-part frame
(13 Nov), a hometown story's drive played New York, Mog City refused the world and took no frame, so the game's cover is
the plain palette card. Key art is a frame Mog City takes in a browser (the server has no graphics card), so the owner's
browser takes it again:

1. Sign in at `/admin` (the Story Kit card links the page), then open `/storykit/keyart.html`: the published story worlds
   with no key art, each a link (`?slug=<slug>` takes it for any published story world, replacing what it has).
2. The page plays the world as published (its sealed world and its town, unchanged) in Mog City with the autopilot and
   `?keyart=1`; a few seconds into the first drive Mog City sends a wide and a square frame. Keep the tab in front.
3. They are sent to `POST /api/storykit/admin/keyart` (owner only): checked as JPEG frames, stored as the game's cover
   (the plain frame) and art, and titled in Mog City's lockup (`titleStoryArt`). The world, its plays and its Mogs are
   unchanged. `/g/<slug>/cover` is cached up to an hour.

### Voices again

Every hometown story published before 14 Nov (fbc60528) was sealed with an empty voice plan: `voicePlanOf` gated the pack
without the town's table, the gate refused it before it listed a line, the creator's voice studio recorded nothing, and
the cast spoke only Mog City's placeholder mumble. The voices are made by Kokoro in a browser (the server has no model),
so the owner's browser records them:

1. Sign in at `/admin` (the Story Kit card links the page), then open `/storykit/revoice.html`: the published story worlds
   whose voice plan (the pack's, with its town's table: `StoryStore.voiceGap`) has lines with no clip, each a link.
2. `?slug=<slug>` runs the voice studio in the page (`studio.html?revoice=<slug>`: the creator's pass and codec, the
   model from Hugging Face; WebGPU or WASM) over the missing lines and keeps the clips in the tab.
3. They are sent as the owner's patch (`POST /api/storykit/admin/patch`, at most 48 clips a patch, each patch the world
   as the last one left it): the world as it is, its `voice` the pack's plan with every clip. `StoryStore.patch` checks
   the lines against that plan and each clip against a line; nothing else of the world changes, the old world is kept
   (patching back is a patch with it), and Mogs of the world inherit the clips. `/g/<slug>` plays them at once.

## Compiler upgrade

1. Re-pin `MOGCITY_SHA` in `workflow-build.sh` and push; only the workflow rebuilds. The commit must be on a branch of
   GameMog/GameMog first.
2. With `HOMETOWN_BUILD` unset the new build is learned by itself (above, "A compiler upgrade learns its build"): one
   run at the web's boot, and towns are built at it as soon as a run of the new deploy reports it (towns built at the
   old build keep playing at it: every story pins its lock). To shadow-build first, pin `HOMETOWN_BUILD`
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
