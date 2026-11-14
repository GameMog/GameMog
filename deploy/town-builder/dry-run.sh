#!/usr/bin/env bash
# The town builder's local dry run (SPEC 6.2, task G9): the EXACT worker entrypoint (deploy/town-builder/worker.py) with
# the pinned venv, against a local `next dev` with HOMETOWN_BUILDER=on, building one town end to end: claim, compile,
# PUT (hash-checked), complete, the full bundle, the town ready. Docker is not needed (the image runs this same file).
# Then it checks determinism:
#   1. every tile the worker built is byte-identical to the same tile from a whole-town `compile.py --id` (fresh store)
#   2. the tile purity proof: a few tiles compiled ALONE (--tile --no-store) equal the worker's
#   3. the bundle's lock equals the --id package's lock
#
#   deploy/town-builder/dry-run.sh            (defaults: Okemah, port 4841)
# Environment (the first three required): HOMETOWN_VENV (the pinned venv: a python built from the compiler's
# requirements.lock), HOMETOWN_COMPILER_DIR (a MogCity checkout's tools/hometown), HOMETOWN_DRY_DATA (the compiler's
# local data: regions/, dem/, osm/), PORT (4840-4859 only: the machine is shared), PLACE (us-<GEOID>).
# Offline when the town's regions and DEM are in HOMETOWN_DRY_DATA: they are staged into the web store (the src family)
# with the owner's token, as region pre-staging does in production, and the DEM mirror seeds the worker's data dir.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
need() { [ -n "${!1:-}" ] || { echo "$1 is required (see the header of $0)"; exit 2; }; }
need HOMETOWN_VENV; need HOMETOWN_COMPILER_DIR; need HOMETOWN_DRY_DATA
VENV="$HOMETOWN_VENV"
COMPILER="$HOMETOWN_COMPILER_DIR"
DATA="$HOMETOWN_DRY_DATA"
PORT="${PORT:-4841}"
PLACE="${PLACE:-us-4054200}"
PY="$VENV/bin/python"
if [ "$PORT" -lt 4840 ] || [ "$PORT" -gt 4859 ]; then echo "PORT must be 4840-4859 (shared machine)"; exit 2; fi
RUN="$(mktemp -d "${TMPDIR:-/tmp}/town-dry.XXXXXX")"
echo "dry run in $RUN (place $PLACE, port $PORT)"
WTOK="dry-worker-$(openssl rand -hex 16)"; ATOK="dry-admin-$(openssl rand -hex 16)"
TSN=(node --import "$ROOT/scripts/ts-resolve.mjs")
# (only what this run started: the worker, and next dev with its own children; never a match by command line, since
# another session may run a next dev on the same port range)
cleanup() { [ -n "${WPID:-}" ] && kill "$WPID" 2>/dev/null || true; if [ -n "${NPID:-}" ]; then pkill -TERM -P "$NPID" 2>/dev/null || true; kill "$NPID" 2>/dev/null || true; sleep 1; fi; }
trap cleanup EXIT

# the build the worker will report (the same compiler, venv and data: the same buildId)
BUILD="$("$PY" "$COMPILER/compile.py" --print-build --store "$RUN/pb" --data "$DATA" | "$PY" -c 'import json,sys;print(json.load(sys.stdin)["buildId"])')"
echo "build $BUILD"

# the web: next dev with the production builder on, its store in the run folder
( cd "$ROOT" && HOMETOWN_BUILDER=on HOMETOWN_TILES=on HOMETOWN_WORKER_TOKEN="$WTOK" HOMETOWN_ADMIN_TOKEN="$ATOK" HOMETOWN_BUILD="$BUILD" \
  HOMETOWN_DIR="$RUN/web" HOMETOWN_DATA_DIR="$RUN/webdata" HOMETOWN_DISK_CAP_GB=8 HOMETOWN_FREE_FLOOR_GB=1 HOMETOWN_SRC_CAP_GB=4 HOMETOWN_CANARY_RATE=0.1 \
  node_modules/.bin/next dev -p "$PORT" > "$RUN/next.log" 2>&1 ) &
NPID=$!
WEB="http://127.0.0.1:$PORT"
for i in $(seq 1 240); do curl -fsS "$WEB/robots.txt" >/dev/null 2>&1 && break; sleep 2; done
curl -fsS "$WEB/robots.txt" >/dev/null || { echo "next dev did not start"; tail -30 "$RUN/next.log"; exit 1; }
echo "web up"

# stage the town's regions (src family, files.json last) with the owner's token, from the local compiler data
STAGED=0
while read -r dom C R; do
  d="$DATA/regions/hg1-$dom/4/$C/$R"
  [ -f "$d/region.json" ] || continue
  "$PY" - "$WEB" "$ATOK" "$d" "$dom" "$C" "$R" <<'PYEOF'
import hashlib, json, os, sys, urllib.request
web, tok, d, dom, C, R = sys.argv[1:]
rel = json.load(open(os.path.join(d, 'region.json')))['overture']['release']
base = 'src/overture/%s/hg1-%s/4/%s/%s/' % (rel, dom, C, R)
files = {}
def put(k, b, s=None):
    h = {'authorization': 'Bearer ' + tok, 'content-type': 'application/octet-stream'}
    if s: h['x-content-sha256'] = s
    r = urllib.request.urlopen(urllib.request.Request(web + '/api/hometown/admin/objects/' + k, data=b, method='PUT', headers=h), timeout=300)
    assert r.status in (200, 201), r.status
for n in sorted(os.listdir(d)):
    if n.endswith('.parquet') or n == 'region.json':
        b = open(os.path.join(d, n), 'rb').read(); s = hashlib.sha256(b).hexdigest()
        files[n] = {'sha256': s, 'bytes': len(b)}; put(base + n, b, s)
put(base + 'files.json', json.dumps({'format': 'hometown-region-files', 'files': files}, sort_keys=True).encode())
PYEOF
  STAGED=$((STAGED + 1))
done < <("${TSN[@]}" "$ROOT/scripts/hometown-dry-run-helper.ts" regions "$PLACE")
echo "staged $STAGED regions"

# the worker: the exact entrypoint, the pinned venv, the local DEM mirror and OSM table as its seed
HOMETOWN_WEB="$WEB" HOMETOWN_WORKER_TOKEN="$WTOK" HOMETOWN_PYTHON="$PY" HOMETOWN_COMPILER_DIR="$COMPILER" HOMETOWN_WORK="$RUN/worker" \
  HOMETOWN_DATA_SEED="$DATA" HOMETOWN_SLOTS="${HOMETOWN_SLOTS:-3}" HOMETOWN_WORKER_ID=dry-1 PATH="$PATH" \
  "$PY" "$ROOT/deploy/town-builder/worker.py" > "$RUN/worker.log" 2>&1 &
WPID=$!

# a player picks the town
T0=$(date +%s)
curl -fsS -X POST "$WEB/api/towns" -H 'content-type: application/json' -d "{\"placeId\":\"$PLACE\"}" > "$RUN/ask.json" || { cat "$RUN/ask.json"; exit 1; }
echo "asked: $(head -c 300 "$RUN/ask.json")"
STATUS=0
for i in $(seq 1 600); do
  STATUS=$(curl -s -o "$RUN/status.json" -w '%{http_code}' "$WEB/api/towns/$PLACE")
  [ "$STATUS" = 200 ] && break
  if [ "$STATUS" = 409 ]; then echo "town failed: $(cat "$RUN/status.json")"; tail -20 "$RUN/worker.log"; exit 1; fi
  [ $((i % 15)) = 0 ] && echo "  $(($(date +%s) - T0)) s: $(head -c 200 "$RUN/status.json")"
  sleep 2
done
[ "$STATUS" = 200 ] || { echo "town not ready after 20 min"; tail -30 "$RUN/worker.log"; exit 1; }
echo "town ready in $(($(date +%s) - T0)) s"
kill -TERM "$WPID"; wait "$WPID" || true; WPID=
grep -c '"event": "done"' "$RUN/worker.log" | sed 's/^/jobs done: /'
grep -q '"event": "stopped"' "$RUN/worker.log" && echo "worker drained on SIGTERM"

# 1. the worker's tiles == a whole-town --id compile's (fresh store, the same gazetteer entry)
"${TSN[@]}" "$ROOT/scripts/hometown-dry-run-helper.ts" gazetteer "$PLACE" > "$RUN/places.json"
( cd "$COMPILER" && "$PY" compile.py --id "$PLACE" --places "$RUN/places.json" --store "$RUN/ref" --data "$DATA" --out "$RUN/ref-out" 2> "$RUN/ref.log" )
"$PY" - "$RUN" "$BUILD" "$PLACE" "$PY" "$COMPILER" "$DATA" <<'PYEOF'
import gzip, hashlib, json, os, re, subprocess, sys
run, build, place, py, compiler, data = sys.argv[1:]
web = os.path.join(run, 'web', 'tiles', build); ref = os.path.join(run, 'ref', 'tiles', build)
def walk(root):
    out = {}
    for d, _, fs in os.walk(root):
        for f in fs:
            p = os.path.join(d, f); out[os.path.relpath(p, root)] = open(p, 'rb').read()
    return out
W, R = walk(web), walk(ref)
same = sum(1 for k in R if W.get(k) == R[k]); differ = [k for k in R if k in W and W[k] != R[k]]; missing = [k for k in R if k not in W]
print(json.dumps({'refTiles': len(R), 'workerTiles': len(W), 'identical': same, 'differ': differ[:5], 'missingFromWorker': missing[:5]}))
assert R and not differ and not missing, 'tiles differ from --id'
# 2. purity: three tiles compiled alone
for k in sorted(R)[::max(1, len(R) // 3)][:3]:
    tid = k.replace(os.sep, '/')
    out = os.path.join(run, 'alone.bin')
    subprocess.run([py, 'compile.py', '--tile', tid, '--no-store', '--store', os.path.join(run, 'pb'), '--data', data, '--out', out], cwd=compiler, check=True, capture_output=True)
    assert open(out, 'rb').read() == W[k], 'tile %s alone differs' % tid
    print(json.dumps({'alone': tid, 'equal': True}))
# 3. the bundle's lock == the --id package's lock
g = open(os.path.join(run, 'ref-out', place, 'geodata.js'), encoding='utf8').read()
lock = json.loads(re.search(r'^window\.NYC\.PKG = (.*);$', g, re.M).group(1))['lock']
bdir = os.path.join(run, 'web', 'bundles', build, place, lock['tiles'], 'full')
assert json.load(open(os.path.join(bdir, 'lock.json'))) == lock, 'bundle lock differs'
assert os.path.exists(os.path.join(bdir, 'citypackage.json')), 'no citypackage.json'
print(json.dumps({'bundleLock': lock['tiles'][:16], 'equal': True, 'citypackage': True}))
PYEOF
echo "DRY RUN PASSED ($RUN)"
