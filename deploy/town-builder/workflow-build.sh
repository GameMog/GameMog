#!/usr/bin/env bash
# The town builder's build environment on Render Workflows (render.yaml service gamemog-town-builder, its buildCommand;
# docs/HOMETOWN-HOSTING.md). Workflow services build on Render's native Python runtime: no
# Dockerfile (the Blueprint's type: workflow takes runtime python or node only, and the Docker fields are "not
# supported for workflows"). This script does what deploy/hometown-compiler.Dockerfile did, into .town-builder/ inside
# the repo checkout, which Render builds into the image every run starts from.
#
# Everything that decides a build's bytes is pinned, so the buildId is the same on every run and every redeploy:
#   - Python: PYTHON_VERSION (render.yaml, a fully qualified version); this script refuses any other
#   - the compiler by commit: MOGCITY_SHA below is THE ONE LINE to re-pin it (a compiler upgrade is a new buildId)
#   - its packages by hash: the compiler's own tools/hometown/requirements.lock at that commit, pip --require-hashes,
#     wheels only, into its own venv (.town-builder/venv); the SDK lives in the service's Python, never in this venv
#   - the OSM lane table by sha256 (deploy/town-builder/osm-roads-us.parquet.json; the file itself ships in the compiler
#     commit, tools/hometown/osm/, since 0.8.0)
#   - duckdb's extensions (httpfs, spatial) installed here into .town-builder/duckdb-ext (a run never downloads one)
#   - numpy's CPU dispatch and the hash seed: set for every compile child by workflow.py (PINNED_ENV)
# The recipe id (.town-builder/image-id) hashes all of the above plus the architecture and glibc; workflow.py passes it
# to the compiler as HOMETOWN_IMAGE_DIGEST=recipe-<id>, which the buildId hashes.
#
# Environment (all optional on Render):
#   HOMETOWN_TB_DIR       output folder (default <repo>/.town-builder)
#   HOMETOWN_OSM_URL      where to download osm-roads-us.parquet when neither checkout has it (checked by sha256)
#   HOMETOWN_MOGCITY_REF  the branch to fetch when the SHA cannot be fetched alone (default hometown-compiler)
#   HOMETOWN_MOGCITY_SRC  a local MogCity checkout at MOGCITY_SHA instead of the fetch (the local simulation)
#   HOMETOWN_TB_VENV      an existing venv with the pinned packages instead of the pip install (the local simulation:
#                         the lock's wheels are Linux ones)
#   HOMETOWN_TB_DATA      an existing data folder (osm/, overture-index/) instead of building the index (local)
set -euo pipefail
# THE ONE LINE to re-pin the compiler (a 40-hex commit of github.com/GameMog/GameMog that carries tools/hometown):
# compiler 0.8.0 (round 3 merged into the production builder), on the branch below
MOGCITY_SHA=aa0bc4515ceff34f57f00ba92eb75d96b77a6cd3
# the branch that carries it: fetched when the commit cannot be fetched by its SHA alone (the checkout is still the SHA)
MOGCITY_REF="${HOMETOWN_MOGCITY_REF:-hometown-compiler}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TB="${HOMETOWN_TB_DIR:-$ROOT/.town-builder}"
PY="${PYTHON:-python3}"
say() { echo "town-builder build: $*"; }

# ---- Python, exactly the pinned one (the lock's wheels are for this CPython)
have="$("$PY" -c 'import platform; print(platform.python_version())')"
if [ -z "${HOMETOWN_TB_VENV:-}" ]; then
  [ -n "${PYTHON_VERSION:-}" ] || { say "PYTHON_VERSION is not set (render.yaml pins it)"; exit 1; }
  [ "$have" = "$PYTHON_VERSION" ] || { say "Python $have is not the pinned $PYTHON_VERSION"; exit 1; }
fi
say "python $have, compiler $MOGCITY_SHA, into $TB"
rm -rf "$TB"
mkdir -p "$TB/data/osm"

# ---- the compiler at one commit
if [ -n "${HOMETOWN_MOGCITY_SRC:-}" ]; then
  test "$(git -C "$HOMETOWN_MOGCITY_SRC" rev-parse HEAD)" = "$MOGCITY_SHA" || { say "HOMETOWN_MOGCITY_SRC is not at $MOGCITY_SHA"; exit 1; }
  mkdir -p "$TB/mogcity/tools"
  git -C "$HOMETOWN_MOGCITY_SRC" archive "$MOGCITY_SHA" tools/hometown | tar -x -C "$TB/mogcity"
else
  git init -q "$TB/mogcity"
  # (by SHA: GitHub serves any commit reachable from a ref of the public repo; else the branch, then the SHA in it)
  CO=FETCH_HEAD
  if ! git -C "$TB/mogcity" fetch -q --depth 1 https://github.com/GameMog/GameMog.git "$MOGCITY_SHA"; then
    say "fetch by SHA refused: fetching branch $MOGCITY_REF"
    git -C "$TB/mogcity" fetch -q --depth 50 https://github.com/GameMog/GameMog.git "refs/heads/$MOGCITY_REF"
    git -C "$TB/mogcity" cat-file -e "$MOGCITY_SHA^{commit}" || { say "$MOGCITY_SHA is not in the last 50 commits of $MOGCITY_REF"; exit 1; }
    CO="$MOGCITY_SHA"
  fi
  git -C "$TB/mogcity" checkout -q --detach "$CO"
  test "$(git -C "$TB/mogcity" rev-parse HEAD)" = "$MOGCITY_SHA"
  rm -rf "$TB/mogcity/.git"
fi
HT="$TB/mogcity/tools/hometown"
test -f "$HT/compile.py" && test -f "$HT/requirements.lock"
echo "$MOGCITY_SHA" > "$TB/mogcity-sha"

# ---- the compiler's packages, by hash, in their own venv
if [ -n "${HOMETOWN_TB_VENV:-}" ]; then
  ln -s "$HOMETOWN_TB_VENV" "$TB/venv"
else
  "$PY" -m venv "$TB/venv"
  "$TB/venv/bin/pip" install -q --no-cache-dir --require-hashes --only-binary=:all: -r "$HT/requirements.lock"
fi
VPY="$TB/venv/bin/python"

# ---- the OSM lane table, checked against its pin (without it the compiler makes ANOTHER build)
OSM="$TB/data/osm/osm-roads-us.parquet"
want="$("$PY" -c 'import json,sys;print(json.load(open(sys.argv[1]))["sha256"])' "$ROOT/deploy/town-builder/osm-roads-us.parquet.json")"
# (compiler 0.8.0 carries it: tools/hometown/osm/, ODbL notice beside it; a copy here or HOMETOWN_OSM_URL still wins)
if [ -f "$ROOT/deploy/town-builder/osm-roads-us.parquet" ]; then cp "$ROOT/deploy/town-builder/osm-roads-us.parquet" "$OSM"
elif [ -f "$HT/osm/osm-roads-us.parquet" ]; then cp "$HT/osm/osm-roads-us.parquet" "$OSM"
elif [ -n "${HOMETOWN_OSM_URL:-}" ]; then curl -fsSL --retry 3 -o "$OSM" "$HOMETOWN_OSM_URL"
else say "osm-roads-us.parquet is neither in the checkout, nor in the compiler, nor at HOMETOWN_OSM_URL"; exit 1; fi
got="$("$PY" -c 'import hashlib,sys;print(hashlib.sha256(open(sys.argv[1],"rb").read()).hexdigest())' "$OSM")"
[ "$got" = "$want" ] || { say "osm-roads-us.parquet sha256 $got is not the pinned $want"; exit 1; }
cp "$ROOT/deploy/town-builder/osm-roads-us.parquet.json" "$TB/data/osm/"

# ---- duckdb's extensions, installed now, then checked by loading them
export DUCKDB_EXTENSION_DIRECTORY="$TB/duckdb-ext"
mkdir -p "$DUCKDB_EXTENSION_DIRECTORY"
"$VPY" "$HT/duck.py" --install
"$VPY" -c "import sys; sys.path.insert(0, sys.argv[1]); import duck; duck.check()" "$HT"

# ---- the Overture release's per-file bbox index (a cold region fetch reads only the files that meet it; 4-5 min)
if [ -n "${HOMETOWN_TB_DATA:-}" ] && [ -d "$HOMETOWN_TB_DATA/overture-index" ]; then
  cp -R "$HOMETOWN_TB_DATA/overture-index" "$TB/data/overture-index"
else
  "$VPY" "$HT/fetch.py" --index --data "$TB/data"
fi
ls "$TB/data/overture-index/"*.json > /dev/null

# ---- the recipe id: everything above that decides a build's bytes
NPY='AVX512F AVX512CD AVX512_SKX AVX512_CLX AVX512_CNL AVX512_ICL AVX512_SPR'
{ echo "$MOGCITY_SHA"
  "$PY" -c 'import hashlib,sys;[print(hashlib.sha256(open(p,"rb").read()).hexdigest(), p.rsplit("/",1)[-1]) for p in sys.argv[1:]]' "$HT/requirements.lock" "$OSM"
  "$TB/venv/bin/python" -m pip freeze --all 2>/dev/null | grep -v -E '^(pip|setuptools|wheel)=='
  "$VPY" -c 'import platform,sys;print(platform.machine(), sys.version.split()[0], *platform.libc_ver())'
  echo "$NPY"; } | "$PY" -c 'import hashlib,sys;print(hashlib.sha256(sys.stdin.buffer.read()).hexdigest()[:16])' > "$TB/image-id"
say "recipe id $(cat "$TB/image-id") ($(uname -m), $(grep -h PRETTY_NAME /etc/os-release 2>/dev/null | cut -d= -f2 || uname -s))"

# ---- smoke: the compiler starts with the pins
HOMETOWN_IMAGE_DIGEST="recipe-$(cat "$TB/image-id")" "$VPY" "$HT/compile.py" --help > /dev/null
"$PY" -m py_compile "$ROOT/deploy/town-builder/worker.py" "$ROOT/deploy/town-builder/workflow.py"
say "ok"
