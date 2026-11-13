# syntax=docker/dockerfile:1
# The town-builder worker image (docs/HOMETOWN-HOSTING.md "Production builder"; render.yaml service
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
ARG MOGCITY_SHA=5379f18b523e7d0b733043017a0e728cc1c328f4
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
ARG MOGCITY_SHA=5379f18b523e7d0b733043017a0e728cc1c328f4
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
    HOMETOWN_WORK=/tmp/hometown-cache
# (prlimit, for the per-slot memory cap of each compile child, is util-linux: essential in Debian 12, already here)
RUN useradd --uid 10001 --create-home --home-dir /home/builder --shell /usr/sbin/nologin builder \
 && command -v prlimit
COPY --from=compiler /opt/mogcity/tools/hometown /opt/mogcity/tools/hometown
COPY --from=compiler /opt/mogcity-sha /opt/mogcity-sha
COPY deploy/town-builder/requirements.lock /opt/hometown-build/requirements.lock
RUN python -m venv /opt/venv \
 && /opt/venv/bin/pip install --no-cache-dir --require-hashes --only-binary=:all: -r /opt/hometown-build/requirements.lock
# the OSM lane table (16 MB, ODbL), checked against its pin: without it the compiler makes ANOTHER build
COPY deploy/town-builder/osm-roads-us.parquet* /opt/hometown-data/osm/
RUN want="$(python -c 'import json;print(json.load(open("/opt/hometown-data/osm/osm-roads-us.parquet.json"))["sha256"])')" \
 && test -f /opt/hometown-data/osm/osm-roads-us.parquet \
 && echo "${want}  /opt/hometown-data/osm/osm-roads-us.parquet" | sha256sum -c -
COPY deploy/town-builder/worker.py /opt/worker/worker.py
# duckdb's extensions, installed now as the user that runs (fetch.py's INSTALL then finds them: no run-time download)
USER 10001
RUN /opt/venv/bin/python -c "import duckdb; c = duckdb.connect(); c.execute('INSTALL httpfs; INSTALL spatial; LOAD httpfs; LOAD spatial')"
USER root
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
