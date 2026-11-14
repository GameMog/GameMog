#!/usr/bin/env bash
# The town builder ON DEMAND, simulated end to end on this Mac (docs/HOMETOWN-HOSTING.md):
#   - the web: `next dev` with HOMETOWN_BUILDER=on, HOMETOWN_RUNS=workflows and STORYKIT_FAKE_REPLY (no model call); its
#     dispatcher (lib/hometown-build/dispatch.ts) talks to
#   - a local Render Workflows (scripts/hometown-workflow-sim.ts): the REST API the dispatcher calls, and the runtime that
#     starts each run as a fresh process of deploy/town-builder/workflow.py over the Render SDK's own socket protocol
#   - the build environment of deploy/town-builder/workflow-build.sh (.scratch/tb, made with its local options)
# and a town never built before (cold: no staged region, a fresh cache per run; its regions come from Overture S3).
# It checks: runs start only when there is work, the town reaches story-ready, drive and whole, every run ends by itself
# when the queue is idle (no instance left), and it prints the runs' wall and CPU seconds for the cost table.
#
#   deploy/town-builder/workflow-sim.sh            (PLACE=us-4007500 Boley, OK; ports 4830 web, 4840 Render)
# Environment: PLACE, HOMETOWN_TB_DIR (default .scratch/tb), SDK_PY (a Python with the render SDK: .scratch/render-venv),
# SIM_MAX_ACTIVE (2), HOMETOWN_SLOTS (2 a run: the Mac is shared), MAX_RUNS (2), WEB_PORT / API_PORT (4830-4849), and:
#   SIM_LEARN_BUILD=1   the web without HOMETOWN_BUILD, as production starts: the first pick is refused with retryS and
#                       starts ONE run that learns the build (dispatch.ts probe); the pick is asked again until admitted
#   SIM_ASK=browser     the pick is made by a player on Create (a browser driven from outside), not by this script: it
#                       waits for the town to be asked, then times story / drive / whole from that moment
#   SIM_HOLD_S=<s>      keep the servers up this long after the result (to play the town), then stop them
#   SIM_FAKE_REPLY      the story fixture the web replays (STORYKIT_FAKE_REPLY; it is read at each build, so a driver may
#                       write it once the town's frame is in); MC_ORIGIN a local Mog City (STORYKIT_MC_ORIGIN)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PLACE="${PLACE:-us-4007500}"
TB="${HOMETOWN_TB_DIR:-$ROOT/.scratch/tb}"
SDK_PY="${SDK_PY:-$ROOT/.scratch/render-venv/bin/python}"
WEB_PORT="${WEB_PORT:-4830}"; API_PORT="${API_PORT:-4840}"
[ -x "$TB/venv/bin/python" ] || { echo "no build environment in $TB: run workflow-build.sh first (see its local options)"; exit 2; }
RUN="$ROOT/.scratch/workflow-sim/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$RUN"
echo "workflow sim in $RUN (place $PLACE)"
WTOK="sim-worker-$(openssl rand -hex 16)"; ATOK="sim-admin-$(openssl rand -hex 16)"; KEY="rnd_sim_$(openssl rand -hex 12)"
# (only this script's own processes: the trees under the two servers it started; the Mac is shared)
kill_tree() { local c; for c in $(pgrep -P "$1" 2>/dev/null); do kill_tree "$c"; done; kill "$1" 2>/dev/null || true; }
cleanup() {
  [ -n "${SPID:-}" ] && kill_tree "$SPID"
  [ -n "${NPID:-}" ] && kill_tree "$NPID"
}
trap cleanup EXIT

# the buildId the runs will report (the same pins and recipe id: a Worker built exactly as a run builds it)
BUILD="$(cd "$ROOT/deploy/town-builder" && HOMETOWN_TB_DIR="$TB" HOMETOWN_WEB=x HOMETOWN_WORKER_TOKEN=x HOMETOWN_WORK="$RUN/pb" "$SDK_PY" -c '
import workflow; workflow.environment()
import worker; print(worker.Worker().build)')"
echo "build $BUILD (recipe $(cat "$TB/image-id"))"

# the web
# (production's switches: render.yaml; HOMETOWN_BUILD only when the build is not to be learned)
PIN_BUILD="$BUILD"; [ "${SIM_LEARN_BUILD:-0}" = 1 ] && PIN_BUILD=""
( cd "$ROOT" && HOMETOWN_BUILDER=on HOMETOWN_TILES=on HOMETOWN_FRAME=on HOMETOWN_WORKER_TOKEN="$WTOK" HOMETOWN_ADMIN_TOKEN="$ATOK" HOMETOWN_BUILD="$PIN_BUILD" \
  STORYKIT=on NEXT_PUBLIC_HOMETOWN_SEARCH=on NEXT_PUBLIC_BUILDS=on STORYKIT_MC_ORIGIN="${MC_ORIGIN:-}" \
  HOMETOWN_DIR="$RUN/web" HOMETOWN_DATA_DIR="$RUN/webdata" HOMETOWN_DISK_CAP_GB=4 HOMETOWN_FREE_FLOOR_GB=1 HOMETOWN_SRC_CAP_GB=1 HOMETOWN_CANARY_RATE=0 \
  HOMETOWN_RUNS=workflows HOMETOWN_RENDER_API="http://127.0.0.1:$API_PORT/v1" HOMETOWN_RENDER_API_KEY="$KEY" HOMETOWN_WORKFLOW_SLUG=gamemog-town-builder \
  HOMETOWN_MAX_RUNS="${MAX_RUNS:-2}" HOMETOWN_RUN_SLOTS="${HOMETOWN_SLOTS:-2}" HOMETOWN_RUN_STARTS_PER_MIN=4 \
  STORYKIT_FAKE_REPLY="${SIM_FAKE_REPLY:-storykit/hometown/fixtures/okemah-us-4054200.reply.json}" \
  node_modules/.bin/next dev -p "$WEB_PORT" > "$RUN/next.log" 2>&1 ) &
NPID=$!
WEB="http://127.0.0.1:$WEB_PORT"

# the local Render Workflows (registers the task first, as a deploy does)
( cd "$ROOT" && SIM_PORT=$API_PORT SIM_KEY="$KEY" SIM_PYTHON="$SDK_PY" SIM_START=deploy/town-builder/workflow.py SIM_SLUG=gamemog-town-builder \
  SIM_MAX_ACTIVE="${SIM_MAX_ACTIVE:-2}" SIM_WORK="$RUN/render" \
  HOMETOWN_WEB="$WEB" HOMETOWN_WORKER_TOKEN="$WTOK" HOMETOWN_TB_DIR="$TB" HOMETOWN_SLOTS="${HOMETOWN_SLOTS:-2}" HOMETOWN_CACHE_GB=2 \
  node --import ./scripts/ts-resolve.mjs scripts/hometown-workflow-sim.ts > "$RUN/render.log" 2>&1 ) &
SPID=$!
for i in $(seq 1 240); do curl -fsS "$WEB/robots.txt" >/dev/null 2>&1 && break; kill -0 "$NPID" 2>/dev/null || break; sleep 2; done
curl -fsS "$WEB/robots.txt" >/dev/null || { echo "next dev did not start"; tail -30 "$RUN/next.log"; exit 1; }
grep -q '"event":"registered"' "$RUN/render.log" || { sleep 5; grep -q '"event":"registered"' "$RUN/render.log" || { echo "task registration failed"; cat "$RUN/render.log"; exit 1; }; }
echo "web up; task registered: $(grep '"registered"' "$RUN/render.log" | head -c 400)"
runs() { curl -fsS -H "authorization: Bearer $KEY" "http://127.0.0.1:$API_PORT/sim/runs"; }
sleep 12
N0="$(runs | node -e 'process.stdin.on("data",d=>console.log(JSON.parse(d).length))')"
echo "runs before any work: $N0"
[ "$N0" = 0 ] || { echo "a run started with an empty queue"; exit 1; }

echo "SIM READY web $WEB render http://127.0.0.1:$API_PORT run $RUN"
# a player picks a town never built
ask() { curl -s -o "$RUN/ask.json" -w '%{http_code}' -X POST "$WEB/api/towns" -H 'content-type: application/json' -d "{\"placeId\":\"$PLACE\"}"; }
if [ "${SIM_ASK:-curl}" = browser ]; then
  echo "waiting for a player to pick $PLACE on $WEB/create"
  for i in $(seq 1 900); do [ "$(curl -s -o /dev/null -w '%{http_code}' "$WEB/api/towns/$PLACE")" != 404 ] && break; sleep 1; done
  T0=$(date +%s)
  echo "asked by the player: $(curl -s "$WEB/api/towns/$PLACE" | head -c 300)"
else
  T0=$(date +%s)
  CODE="$(ask)"
  if [ "$CODE" = 503 ] && grep -q retryS "$RUN/ask.json"; then
    echo "no build known: $(head -c 200 "$RUN/ask.json"); a run is learning it"
    for i in $(seq 1 60); do sleep 5; CODE="$(ask)"; [ "$CODE" != 503 ] && break; done
    echo "admitted after $(($(date +%s) - T0)) s (the build learned by one run)"
  fi
  [ "$CODE" = 202 ] || [ "$CODE" = 200 ] || { echo "ask: $CODE $(cat "$RUN/ask.json")"; exit 1; }
  echo "asked: $(head -c 300 "$RUN/ask.json")"
fi
STORY=""; DRIVE=""; STATUS=0; LAST=""
for i in $(seq 1 900); do
  STATUS=$(curl -s -o "$RUN/status.json" -w '%{http_code}' "$WEB/api/towns/$PLACE")
  PH="$(node -e 'try{const j=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log((j.phase||"")+" "+(j.lock?"lock":"")+" "+(j.district?"district":""))}catch{console.log("?")}' "$RUN/status.json")"
  now=$(($(date +%s) - T0))
  [ -z "$STORY" ] && [[ "$PH" == *lock* ]] && STORY=$now && echo "  story ready at $now s ($PH)"
  [ -z "$DRIVE" ] && [[ "$PH" == *" district" ]] && DRIVE=$now && echo "  drive at $now s ($PH)"
  [ "$STATUS" = 200 ] && break
  if [ "$STATUS" = 409 ]; then echo "town failed: $(cat "$RUN/status.json")"; exit 1; fi
  [ "$PH" != "$LAST" ] && echo "  $now s: $STATUS $PH; runs $(runs | node -e 'process.stdin.on("data",d=>{const r=JSON.parse(d);console.log(r.length+" ("+r.map(x=>x.status[0]).join("")+")")})')" && LAST="$PH"
  sleep 2
done
[ "$STATUS" = 200 ] || { echo "town not whole after 30 min"; exit 1; }
WHOLE=$(($(date +%s) - T0))
echo "whole town at $WHOLE s"
cp "$RUN/status.json" "$RUN/final.json"

# every run ends by itself once the queue is idle (20 s idle window + the dispatcher's next look)
for i in $(seq 1 60); do
  LIVE="$(runs | node -e 'process.stdin.on("data",d=>console.log(JSON.parse(d).filter(r=>r.status==="pending"||r.status==="running").length))')"
  [ "$LIVE" = 0 ] && break
  sleep 2
done
END=$(($(date +%s) - T0))
runs > "$RUN/runs.json"
node -e '
const r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
const wall = r.reduce((a, x) => a + x.wallS, 0), cpu = r.reduce((a, x) => a + (x.cpuS || 0), 0);
console.log(JSON.stringify({ runs: r.length, statuses: r.map((x) => x.status), results: r.map((x) => x.results && x.results[0]), runWallS: Math.round(wall), runCpuS: Math.round(cpu) }));
' "$RUN/runs.json"
echo "RESULT place=$PLACE story=${STORY:-?}s drive=${DRIVE:-?}s whole=${WHOLE}s all-runs-ended=$([ "$LIVE" = 0 ] && echo yes || echo NO) at ${END}s"
[ "$LIVE" = 0 ] || exit 1
grep -c '"event": "done"' "$RUN"/render/*.log | sed 's/^/jobs done per run log: /'
echo "WORKFLOW SIM PASSED ($RUN)"
if [ -n "${SIM_HOLD_S:-}" ]; then echo "holding the servers ${SIM_HOLD_S} s"; sleep "$SIM_HOLD_S"; fi
