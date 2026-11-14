# syntax=docker/dockerfile:1
# REFERENCE ONLY since 13 Nov 2026: the builder is now a Render Workflow (render.yaml gamemog-town-builder, type: workflow),
# which builds on Render's native Python runtime, not from a Dockerfile. deploy/town-builder/workflow-build.sh is the same
# recipe for that runtime (and its MOGCITY_SHA is the pin that counts). Kept for a Docker host, should one be needed.
# The town-builder worker image (docs/HOMETOWN-HOSTING.md; render.yaml service
# gamemog-town-builder, a background worker with no disk). It runs deploy/town-builder/worker.py, which claims jobs from
# gamemog.com's queue over Render's private network and runs the pinned hg1 compiler (MogCity tools/hometown). No Next,
# no Node: the web service never compiles, and this image never serves a page.
#
# Everything that decides a build's bytes is pinned here, so the buildId is the same on every instance, redeploy and
# rebuild (compile.py build_record hashes the compiler version, the libraries, HOMETOWN_IMAGE_DIGEST and the sources):
#   - the base image by DIGEST (python 3.14.6, Debian 12 bookworm)
#   - the compiler by commit: MOGCITY_SHA below is THE ONE LINE to re-pin it (a compiler upgrade is a new buildId:
#     the rollout runbook in docs/HOMETOWN-HOSTING.md)
#   - the Python packages by hash (deploy/town-builder/requirements.lock, pip --require-hashes)
#   - the OSM lane table by sha256 (deploy/town-builder/osm-roads-us.parquet.json; the build fails without its bytes)
#   - numpy's run-time CPU dispatch (NPY_DISABLE_CPU_FEATURES: the AVX-512 family off, so hosts of one architecture
#     with and without AVX-512 make the same bytes), and the architecture in the recipe
#   - duckdb's extensions installed at build time (a run never downloads one)
# Render cannot know a pushed image's digest at build time, so the image's identity is a RECIPE id computed inside the
# build from all of the above (/opt/hometown-image-id); worker.py passes it to the compiler as HOMETOWN_IMAGE_DIGEST.
#
# Reviewed by reading (hadolint's rules; Docker is not installed on the dev Mac and the first real build is on Render):
# base images by digest (DL3006/DL3007), --no-install-recommends and apt lists removed (DL3015/DL3009), pinned pip
# installs (DL3013), no `cd` (DL3003), WORKDIR absolute, a non-root USER, JSON-form CMD (DL3025), no secret in any layer
# (the worker token arrives at run time from render.yaml), no ADD of a URL, no `latest`.

ARG PY_IMAGE=python:3.14.6-slim-bookworm@sha256:4c92ffcde4dd6f1ff72a24518f49fd4990b27134987dfa31a733badde66df9f8

# ---- the compiler at one commit (git only in this stage)
FROM ${PY_IMAGE} AS compiler
# THE ONE LINE to re-pin the compiler (a 40-hex commit of github.com/GameMog/GameMog that carries tools/hometown):
ARG MOGCITY_SHA=aa0bc4515ceff34f57f00ba92eb75d96b77a6cd3
# hadolint ignore=DL3008
RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates \
 && rm -rf /var/lib/apt/lists/*
RUN git init /opt/mogcity \
 && git -C /opt/mogcity fetch --depth 1 https://github.com/GameMog/GameMog.git "${MOGCITY_SHA}" \
 && git -C /opt/mogcity checkout --detach FETCH_HEAD \
 && test "$(git -C /opt/mogcity rev-parse HEAD)" = "${MOGCITY_SHA}" \
 && test -f /opt/mogcity/tools/hometown/compile.py \
 && echo "${MOGCITY_SHA}" > /opt/mogcity-sha

# ---- the worker
FROM ${PY_IMAGE}
ARG MOGCITY_SHA=aa0bc4515ceff34f57f00ba92eb75d96b77a6cd3
ENV PYTHONHASHSEED=0 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    NPY_DISABLE_CPU_FEATURES="AVX512F AVX512CD AVX512_SKX AVX512_CLX AVX512_CNL AVX512_ICL AVX512_SPR" \
    OMP_NUM_THREADS=1 \
    OPENBLAS_NUM_THREADS=1 \
    HOME=/home/builder \
    HOMETOWN_PYTHON=/opt/venv/bin/python \
    HOMETOWN_COMPILER_DIR=/opt/mogcity/tools/hometown \
    HOMETOWN_DATA_SEED=/opt/hometown-data \
    HOMETOWN_OSM_ROADS=/opt/hometown-data/osm/osm-roads-us.parquet \
    HOMETOWN_WORK=/tmp/hometown-cache \
    DUCKDB_EXTENSION_DIRECTORY=/opt/duckdb-ext
# (prlimit, for the per-slot memory cap of each compile child, is util-linux: essential in Debian 12, already here)
RUN useradd --uid 10001 --create-home --home-dir /home/builder --shell /usr/sbin/nologin builder \
 && command -v prlimit
COPY --from=compiler /opt/mogcity/tools/hometown /opt/mogcity/tools/hometown
COPY --from=compiler /opt/mogcity-sha /opt/mogcity-sha
# (the compiler's OWN hash lock at the pinned commit, tools/hometown/requirements.lock (MogCity M1); the copy in
# deploy/town-builder is the same pins, kept for review: the image installs the compiler's)
RUN mkdir -p /opt/hometown-build && cp /opt/mogcity/tools/hometown/requirements.lock /opt/hometown-build/requirements.lock
RUN python -m venv /opt/venv \
 && /opt/venv/bin/pip install --no-cache-dir --require-hashes --only-binary=:all: -r /opt/hometown-build/requirements.lock
# the OSM lane table (16 MB, ODbL), checked against its pin: without it the compiler makes ANOTHER build
COPY deploy/town-builder/osm-roads-us.parquet* /opt/hometown-data/osm/
RUN want="$(python -c 'import json;print(json.load(open("/opt/hometown-data/osm/osm-roads-us.parquet.json"))["sha256"])')" \
 && test -f /opt/hometown-data/osm/osm-roads-us.parquet \
 && echo "${want}  /opt/hometown-data/osm/osm-roads-us.parquet" | sha256sum -c -
COPY deploy/town-builder/worker.py /opt/worker/worker.py
# duckdb's extensions, installed now into DUCKDB_EXTENSION_DIRECTORY (compiler 0.7.0 duck.py only LOADs them, with
# auto-install off: a run never downloads one), then checked by loading them
RUN /opt/venv/bin/python /opt/mogcity/tools/hometown/duck.py --install \
 && chmod -R a+rX /opt/duckdb-ext \
 && /opt/venv/bin/python -c "import sys; sys.path.insert(0, '/opt/mogcity/tools/hometown'); import duck; duck.check()"
# the Overture release's per-file bbox index (fetch.py --index, MogCity M5): a cold region fetch then reads only the S3
# files that meet it (Phoenix's 4 regions: 418 s without, 23 s with). Built once here (about 4-5 min, network); the
# worker links it into its data dir (HOMETOWN_DATA_SEED/overture-index). It selects files only, never a byte of output.
RUN /opt/venv/bin/python /opt/mogcity/tools/hometown/fetch.py --index --data /opt/hometown-data \
 && ls /opt/hometown-data/overture-index/*.json
# the image's identity: a hash of everything that decides its bytes, computed IN the build (worker.py reads it)
RUN { echo "${MOGCITY_SHA}"; sha256sum /opt/hometown-build/requirements.lock /opt/hometown-data/osm/osm-roads-us.parquet; \
      /opt/venv/bin/pip freeze --all; /opt/venv/bin/python -c "import platform,sys;print(platform.machine(), sys.version)"; \
      cat /etc/debian_version; echo "${NPY_DISABLE_CPU_FEATURES}"; } | sha256sum | cut -c1-16 > /opt/hometown-image-id \
 && cat /opt/hometown-image-id \
 && /opt/venv/bin/python -m py_compile /opt/worker/worker.py \
 && HOMETOWN_IMAGE_DIGEST="recipe-$(cat /opt/hometown-image-id)" /opt/venv/bin/python /opt/mogcity/tools/hometown/compile.py --help > /dev/null
USER 10001
WORKDIR /home/builder
CMD ["/opt/venv/bin/python", "/opt/worker/worker.py"]
