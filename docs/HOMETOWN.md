# Hometown

A player types their hometown on Create, any US town or city, and gets a story world set on its real streets: the town
is built on demand from open map data, the story is written while it builds, and it plays on Mog City's engine at
mc.gamemog.com. How it is hosted: [HOMETOWN-HOSTING.md](HOMETOWN-HOSTING.md). Going live and the live test:
[HOMETOWN-RUNBOOK.md](HOMETOWN-RUNBOOK.md).

## The product flow

1. **Create, Story world, "Or your hometown".** The box searches the Census places as the player types.
2. **The pick.** The town card shows the build: "Waiting its turn", "Reading the map", "Laying the streets near you",
   with the wait to drive and to the whole town. A town someone built before is ready at once.
3. **Ready to write** (about a minute for a new town). The town's frame is in: its spawn, its places and its lock. The
   player writes the story now; the town keeps building meanwhile.
4. **Ready to drive.** The streets round the spawn are built (the spawn district). The story's first mission stays
   there (a gate rule), so the player can play before the rest of town exists: past its edge a haze and "The rest of
   town is still being built".
5. **Your whole town is built.** The engine swaps to the whole town at the next pause, keeping the player where they are.
6. **Publish, dare, Mog**, as any story world. A Mog keeps the town, locked.

The town is built from OpenStreetMap, Overture Maps and USGS 3DEP data (credited on screen and on the credits page):
its streets with their names and lanes, its buildings, its shops signed with names from its own streets, its ground by
climate and land use, bridges and water. A capped town (a city whose map is bigger than 4.5 km a side) is centred on
its downtown.

## What runs where

| | |
|---|---|
| gamemog.com (Render web, 1c-2g, 10 GB disk) | Create, the story writer, the job queue, the store of tiles and bundles, the dispatcher. It never compiles |
| `gamemog-town-builder` (Render Workflow) | compiles. Each run is a 4c-8g instance started only while there is work, gone 20 s after |
| mc.gamemog.com (GitHub Pages) | plays the story in the town, reading the town's bundles and tiles from gamemog.com |
| The compiler | MogCity `tools/hometown`, version 0.11.0, pinned by commit in `deploy/town-builder/workflow-build.sh` |

## Switches (render.yaml, 14 Nov 2026: on for everyone)

| Switch | Value | What it does |
|---|---|---|
| `STORYKIT` | `on` | story worlds on Create for everyone |
| `NEXT_PUBLIC_HOMETOWN_SEARCH` | `on` | the town box on Create, and `/api/places` |
| `HOMETOWN_BUILDER` | `on` | the town routes for players (`owner`: the owner's session only; `off`: none) |
| `HOMETOWN_RUNS` | `workflows` | builders start on demand (`off`: none start: the kill switch) |
| `HOMETOWN_TILES` | `on` | the tiles and far field Mog City reads |
| `HOMETOWN_FRAME` | `on` | spawn first: story and drive before the whole town |
| `HOMETOWN_DAILY_COLD` | `100` | new towns a day: the spend cap |
| `HOMETOWN_PER_IP_HOUR` | `3` | new towns per address an hour |
| `HOMETOWN_BUILD` | empty | the build; empty, it is learned from the first run |

Secrets (entered by the owner, `sync: false`): `HOMETOWN_WORKER_TOKEN`, `HOMETOWN_RENDER_API_KEY`,
`HOMETOWN_ADMIN_TOKEN`, plus `ANTHROPIC_API_KEY` and `ADMIN_PASSWORD`.

## Costs

| | |
|---|---|
| Idle | $0 for the builder; the web $25/month and the disk $2.50/month as before |
| One new town | about $0.025 on a busy run, $0.08-0.12 built alone (4c-8g at $1.00/h, billed per second) |
| A built town asked again | $0 |
| The daily cap (100 new towns) | at most about $10 a day |
| The ceiling (20 runs round the clock) | $480 a day |
| A story | the model's cost, as any story world |

## Measured (local simulation, compiler 0.8.0)

Wewoka, OK, never built, 196 tiles, from the pick on Create: admitted 16 s (the first pick on a fresh deploy: one run
learns the build), ready to write **58 s**, ready to drive **81 s**, whole town **351 s**, every builder ended 32 s after.
231 CPU-s for the town. The story played on Mog City drivable 4 s after its title screen.

## Status (14 Nov 2026)

- **Live** (release r6): gamemog.com runs `main` 8a878166 (compiler 0.10.0's builder, its fixes, the key art page);
  mc.gamemog.com runs `mogcity` ee368f8 (r6a: round 4 and the fidelity line's engine, the story search ring a player
  can reach); `hometown-compiler` is d7e60927 (compiler 0.10.0).
- **Ready to release, not pushed** (release r7, local branches): GameMog `prod-builder-clean` (the pin, a hometown
  story's voice plan, story towns that play the current whole town when every place is the same place, Create's honest
  town card with its ready states, test drive and "Your hometown" entry, the key art page's sign-in message, the
  desktop-only note for story worlds on phones), MogCity `release-r5` (compiler **0.11.0**: the warm band's planting
  strips, dunes, hedge walls where lots front the road, their gaps and trees over them; engine: the car in the water
  and the stuck car put back on the road, the town chase's head-on cruiser, the full map's labels, Bal Harbour's mall
  roof, hedges, towers and medians, growing.js's story upgrade), and its Mog City release commit (local branch
  `mogcity-release-r7`, a fast-forward of the live `mogcity`). Release order: `mogcity`, then `hometown-compiler`,
  then `main`; no manual run (the web learns the build). The steps are in
  [HOMETOWN-HOSTING.md](HOMETOWN-HOSTING.md#release-r7-compiler-0110).
- **Fixed in round 4** (were open items): one failed tile no longer fails a town (it is built with a flat patch and
  listed as degraded); "Try again" re-queues a failed town at once; the per-address limit survives deploys (queue.db);
  the dispatcher's plan is cheap at 20,000 jobs; orphaned run rows are retired every pass; the first pick on a fresh
  deploy is answered 202 at once; Phoenix's repeated shop names; Fort Pitt's 6.7 m jump.

## Open items

- **Street names in towns built before 0.10.0**: their frames carry `str.title()`'s "N 3Rd St"; the engine and
  `lib/hometown/names.ts` correct them when read (0.10.0 spells them right at the source).
- **Not proven before production**: the build on Render's native Python image (pip by hash, duckdb extensions, the
  recipe id and so the real buildId on x86_64), private networking from a run to the web, Hobby's per-minute run
  limits, cancelling a run from the dashboard.
- **The full bundle** compiles the far field it does not find stored (about 2 minutes on the Mac for a whole town).
- **A failing 12-tile block** costs 12 single-tile compiles before the town degrades; a failed tile inside the spawn
  district still fails the town.
- **The first pick on a fresh deploy** waits for a run's spin-up only when it comes before the run the web starts at
  its boot has reported the build (docs/HOMETOWN-HOSTING.md, "A compiler upgrade learns its build").
- **A story world's whole town by another tiles id**: the play page plays the whole town once built at the same place
  and build even when its tiles id is not the story's lock (lib/storykit-publish.ts townPlay), but Mog City's world check
  (wagmi/storyrun/pack.js townLockMismatch) compares `tiles` too and would refuse it. Lock v3 gives every variant the
  frame's lock, so this does not arise today.
