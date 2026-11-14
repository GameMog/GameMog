# Hometown: go-live runbook (on-demand builders, Render Workflows)

For the owner. Every step that touches Render, GitHub or the live database is the owner's; agents never push or deploy.
The architecture is [HOMETOWN-HOSTING.md](HOMETOWN-HOSTING.md); the overview is [HOMETOWN.md](HOMETOWN.md).

State of the code (13 Nov 2026): `render.yaml` has the builder **on for players** (`HOMETOWN_BUILDER` on,
`HOMETOWN_RUNS` workflows, `HOMETOWN_TILES` on, `NEXT_PUBLIC_HOMETOWN_SEARCH` on, `STORYKIT` on,
`HOMETOWN_DAILY_COLD` 100). `deploy/town-builder/workflow-build.sh` pins MogCity compiler 0.8.0,
`MOGCITY_SHA=aa0bc4515ceff34f57f00ba92eb75d96b77a6cd3`, fetched from github.com/GameMog/GameMog (branch
`hometown-compiler`).

---------------------------------------------------------------------------------------------------------------------

## 1. What goes live, and how it ships

| Piece | Where | Ships by |
|---|---|---|
| Web: queue, store, towns, worker protocol, dispatcher, `/towns/...` bundles, Create's town card | `gamemog` web (Render, Node, 1c-2g, 1 instance, 10 GB disk) | a push of GameMog `main` (autoDeploy) |
| Town builder | `gamemog-town-builder` **workflow** (Python 3.14.6, task `build_jobs`, each run 4c-8g, no disk, no ports) | Blueprint sync, then its own `buildFilter` (`deploy/town-builder/**`) |
| Compiler 0.8.0 | fetched by `workflow-build.sh` at `MOGCITY_SHA` into `.town-builder/` | the commit must be on a branch of github.com/GameMog/GameMog |
| Engine: towns, the growing town, the town's names and labels | **mc.gamemog.com is GitHub Pages** (GameMog/GameMog branch `mogcity`), not Render | a push of MogCity's engine files to `mogcity` |

How a town is built: a pick enqueues jobs, within 0.3 s the dispatcher starts runs through
`POST /v1/task-runs`, each run claims jobs over the private network, compiles, uploads, and ends 20 s after the queue is
idle. Idle costs $0.

---------------------------------------------------------------------------------------------------------------------

## 2. Before the push (prerequisites)

1. **The compiler commit is on GitHub.** Push MogCity `prod-builder` (tip `aa0bc451...`) to the branch
   `hometown-compiler` of GameMog/GameMog. `workflow-build.sh` fetches the SHA by itself (GitHub serves any commit
   reachable from a branch of the public repo) and falls back to fetching that branch.
2. **The OSM lane table** ships in that commit (`tools/hometown/osm/osm-roads-us.parquet`, 17,100,621 bytes, ODbL, its
   notice beside it); its sha256 is checked against `deploy/town-builder/osm-roads-us.parquet.json`. Nothing else to host.
3. **The engine.** MogCity's engine files (the growing town, `town-src.js`, `pkg-far.js`, the town loader words "Loading
   your town...", the town-only map labels) go to the `mogcity` branch. They are inert without `?city=pkg`, so they can
   go before the web.
4. `npm run check` passes, `next build` passes, and `deploy/town-builder/workflow-sim.sh` passes on the Mac.

---------------------------------------------------------------------------------------------------------------------

## 3. Go live (players)

1. **Push GameMog `main`** (the deploy skill's checklist). The web deploys with the builder on; until the workflow
   exists, the dispatcher's start calls fail and back off (the /admin card says why), and Create's town card waits.
2. **Blueprint sync** (Render dashboard, Blueprints). It creates the `gamemog-town-builder` workflow and adds the web's
   new variables. When it asks for `HOMETOWN_WORKER_PAUSED`, leave it **empty** (or `0`) to build; `1` pauses. Its first
   build takes 10-15 min (pip by hash, duckdb extensions, the Overture file index); the log ends with
   `town-builder build: recipe id ... ok`. Check the workflow's task list shows `build_jobs` (plan 4c-8g, timeout
   10,800 s, 1 retry).
3. **Secrets** on the web's Environment page (already entered 13 Nov): `HOMETOWN_WORKER_TOKEN` (24+ characters; the
   workflow reads it from the web), `HOMETOWN_RENDER_API_KEY` (a Render API key, used only for `POST /v1/task-runs` and
   `GET /v1/task-runs/{id}`), `HOMETOWN_ADMIN_TOKEN`. `ANTHROPIC_API_KEY` and `ADMIN_PASSWORD` as before.
4. **The build is learned by itself.** Leave `HOMETOWN_BUILD` empty: the first pick starts one run that reports the
   build, and Create's card asks again every 15 s until it is admitted (about 16 s locally; on Render add a run's
   spin-up). To learn it before any player: the workflow, `build_jobs`, **Run task** with input `[]`; the run logs
   `{"event": "start", "build": "htc-0.8.0-hg1-b........", "caps": ["--assemble", "--far-list", "--frame", "--tiles"], ...}`
   (all four caps must be listed) and ends idle 20 s later; the web keeps that build. Pinning it in `HOMETOWN_BUILD` is
   optional.
5. Open `/admin`: the Town builder card shows the runs in flight (0 of 20 when idle) and the build. "Not starting" names
   the missing variable.
6. Run the live test (section 5).

---------------------------------------------------------------------------------------------------------------------

## 4. Environment variables (names; secrets never in the repo)

**Web (`gamemog`)**
- secrets (`sync: false`): `HOMETOWN_WORKER_TOKEN`, `HOMETOWN_RENDER_API_KEY`, `HOMETOWN_ADMIN_TOKEN`, `ADMIN_PASSWORD`;
  `ANTHROPIC_API_KEY` is entered on the Environment page only
- optional pin (`sync: false`): `HOMETOWN_BUILD`
- switches (render.yaml): `STORYKIT` on, `NEXT_PUBLIC_HOMETOWN_SEARCH` on, `HOMETOWN_TILES` on, `HOMETOWN_COMPILE` off,
  `HOMETOWN_BUILDER` on, `HOMETOWN_FRAME` on, `HOMETOWN_RUNS` workflows
- limits (render.yaml): `HOMETOWN_DAILY_COLD` 100, `HOMETOWN_PER_IP_HOUR` 3, `HOMETOWN_MAX_WAIT_S` 600,
  `HOMETOWN_MAX_RUNS` 20, `HOMETOWN_RUN_SLOTS` 4, `HOMETOWN_PREWARM_RUNS` 4, `HOMETOWN_DISK_CAP_GB` 4,
  `HOMETOWN_SRC_CAP_GB` 1
- automatic: `HOMETOWN_WORKFLOW_SLUG` (from the workflow)
- tunables with code defaults: `HOMETOWN_RUN_STARTS_PER_MIN` 4, `HOMETOWN_RUN_TARGET_S` 60, `HOMETOWN_RUN_SPINUP_S` 45,
  `HOMETOWN_QUEUE_MAX`, `HOMETOWN_CANARY_RATE`, `HOMETOWN_FREE_FLOOR_GB`
- never in production: `HOMETOWN_TOWNS`, `HOMETOWN_RENDER_API`, `STORYKIT_FAKE_REPLY`, `STORYKIT_MC_ORIGIN`

**Workflow (`gamemog-town-builder`)**
- automatic: `HOMETOWN_WEB`, `HOMETOWN_WORKER_TOKEN` (from the web)
- `HOMETOWN_WORKER_PAUSED` (`sync: false`; empty or `0` builds, `1` pauses)
- render.yaml: `PYTHON_VERSION` 3.14.6, `HOMETOWN_RUN_PLAN` 4c-8g, `HOMETOWN_SLOT_GB` 1.5, `HOMETOWN_CACHE_GB` 4
- optional: `HOMETOWN_RUN_CAP_S` (7200), `HOMETOWN_IDLE_S` (20), `HOMETOWN_OSM_URL`, `HOMETOWN_MOGCITY_REF`
- set by `workflow.py`, never by hand: `HOMETOWN_PYTHON`, `HOMETOWN_COMPILER_DIR`, `HOMETOWN_DATA_SEED`,
  `HOMETOWN_OSM_ROADS`, `DUCKDB_EXTENSION_DIRECTORY`, `HOMETOWN_IMAGE_ID_FILE`, `HOMETOWN_SLOTS`, `HOMETOWN_ONCE`,
  `PYTHONHASHSEED`, `NPY_DISABLE_CPU_FEATURES`
- never on the workflow: `ADMIN_PASSWORD`, `ANTHROPIC_API_KEY`, `HOMETOWN_ADMIN_TOKEN`, `HOMETOWN_RENDER_API_KEY`

---------------------------------------------------------------------------------------------------------------------

## 5. Live test checklist (gamemog.com)

1. [ ] With an empty queue: `/admin` shows 0 runs in flight; the workflow's Runs page shows no run for 10 minutes.
2. [ ] First pick after the deploy: the card says "Waiting its turn", one run appears (reason "learn the build"), and
       the pick is admitted by itself. Its first log line has the 4 caps.
3. [ ] A cold town in a state never asked before: record pick -> "Ready to write", -> "Ready to drive", -> "Your whole
       town is built" (the Create card and the /admin card). ONE regions job per region.
4. [ ] A capped town (a city whose search square is over 4.5 km, e.g. Pittsburgh): the frame centres on its downtown;
       the event log shows `retile`; the town completes.
5. [ ] Within about a minute of the whole town every run is Succeeded with `{"exit": "idle", ...}`: nothing left
       running (the scale-to-zero check).
6. [ ] Write a story on a "Ready to write" town (the owner's own paid generation; agents never trigger one) and play it:
       the address carries `&tv=district-...` while the town grows and `&tv=full` once it is whole; the HUD, the loader
       and the map name the town, never San Francisco or New York.
7. [ ] Same town from two devices at once: one build, one set of jobs.
8. [ ] Five new towns within a minute: 2-5 runs wanted; Render starts them (Hobby: 4 a minute).
9. [ ] Fault: cancel a run mid-build on the Runs page; the town still completes.
10. [ ] Fault: redeploy the web mid-build; runs log `web-retry` and carry on; no duplicate run (idempotency key).
11. [ ] Determinism: canary 0 mismatches (2 towns at once).
12. [ ] Web health unchanged; the billing page matches the runs' durations x $1.00/h.

Watch for: p50 time to drive under 30 s warm and 90 s cold, every run ending idle, ETA error within plus or minus 30%.

---------------------------------------------------------------------------------------------------------------------

## 6. Scaling, disk, kill switches, upgrade, rollback

**Scaling is automatic**: runs wanted = the queue's ready work over 4 slots a run, at least 1, at most
`HOMETOWN_MAX_RUNS` (20); at most 4 new runs a minute (Hobby: 16 new run CPUs a minute; Render queues the rest).
`HOMETOWN_MAX_RUNS` is the only knob for a spike; a Pro workspace doubles the per-minute limits
(`HOMETOWN_RUN_STARTS_PER_MIN` 8 then).

**Spend**: `HOMETOWN_DAILY_COLD` (new towns a day, about $0.10 each built alone) and `HOMETOWN_MAX_RUNS` (the hourly
ceiling: 20 runs = $20/h).

**Disk (grown on demand, never in advance)**: when `/admin` shows the store near `HOMETOWN_DISK_CAP_GB`, set the web
disk `sizeGB: 20` in render.yaml and `HOMETOWN_DISK_CAP_GB` "8", `HOMETOWN_SRC_CAP_GB` "2"; push and sync. +$5 a month.
A disk never shrinks.

**Kill switches, fastest first**
1. Web `HOMETOWN_RUNS=off`: no new run; runs in flight finish their jobs and end within 20 s of idle.
2. Workflow `HOMETOWN_WORKER_PAUSED=1`: a run claims nothing and ends. While work is ready the breaker holds starts
   after 3 such runs (10 minutes, then one probe run; the /admin card says why).
3. Web `HOMETOWN_BUILDER=owner` (players lose the town routes) or `off` (all 404; runs get 404 and end at once).
4. Revoke the Render API key.

A later Blueprint sync puts back render.yaml's values for the switches it sets (`HOMETOWN_RUNS`, `HOMETOWN_BUILDER`):
to keep a switch off across syncs, change it in render.yaml.

**Compiler upgrade**: change `MOGCITY_SHA` (one line in `deploy/town-builder/workflow-build.sh`), push the commit to a
GameMog/GameMog branch first, then push GameMog; the workflow rebuilds (buildFilter). With `HOMETOWN_BUILD` empty the
new build is used once a run of it claims; old towns stay playable at their build (stories pin their lock).

**Rollback**: web: redeploy the previous `main` commit (the queue and store stay on the disk). Workflow:
`HOMETOWN_RUNS=off`; to remove it, delete it on the dashboard and its block from render.yaml.

---------------------------------------------------------------------------------------------------------------------

## 7. Local simulation (13 Nov 2026)

`deploy/town-builder/workflow-sim.sh` with `SIM_LEARN_BUILD=1 SIM_ASK=browser`, a local Mog City, and Create driven in
headless Chrome. Town: Wewoka, OK (us-4080550, 196 tiles, capped: re-tiled onto its downtown), never built, compiler
0.8.0, 2 slots a run, 2 runs at most.

| From the pick | Seconds |
|---|---:|
| admitted (one run learned the build) | 16 |
| story ready | 58 |
| drive | 81 |
| whole town | 351 |
| every run ended idle | 383 |

2 runs, 47 jobs, 0 failed, 231 CPU-s. The story (fixture reply) played on the local Mog City: drivable 3.4-4.0 s after
the title screen, 271 m driven in 9 s. Not provable locally: the real build on Render's image, a run's real spin-up,
private networking to the web's hostport, `fromService ... property: slug` on a workflow, Hobby's per-minute limits, and
cancelling a run from the dashboard.

---------------------------------------------------------------------------------------------------------------------

## 8. Costs

Runs bill per second, 4c-8g $1.00/h. Idle $0. One town about $0.025 on a busy run, $0.08-0.12 built alone. 30 towns a
month about $3; 300 about $30; a viral day of 600 new towns $15-60; the daily cap of 100 new towns at most about $10 a
day; the ceiling 20 runs x 24 h = $480 a day. The web ($25/month) and the 10 GB disk ($2.50/month) are unchanged.
