# PREPARED, NOT USED. render.yaml runs the native Node runtime and does not read this file. It is phase 2 of Hometown
# hosting (docs/HOMETOWN-HOSTING.md): GameMog's Next server compiling a missing town on Render (HOMETOWN_COMPILE=on).
# Switching to it is the owner's decision. It needs, in render.yaml: `runtime: docker`, `dockerfilePath:
# ./deploy/hometown-compiler.Dockerfile`, no buildCommand / startCommand (they are below), and plan `pro` (2 CPU,
# 4 GB) because one block compile peaks at 0.4-1.2 GB beside Next.
#
# Why Docker and not the native runtime: the native runtime is Debian 12 with its own python3 (3.11) and pip but no
# documented venv, and a build's id hashes the Python, duckdb, shapely/GEOS, numpy, Pillow and zlib versions (MogCity
# tools/hometown/compile.py lib_versions). Pinning them needs an image. The Mac pre-warm must then run in THIS image
# too (docker run ... python tools/hometown/prewarm.py), or the Mac and the server make two different builds.
FROM python:3.14.6-slim-bookworm AS py

FROM node:24-bookworm-slim
# the pinned CPython from the official image (its zlib is Debian 12's; HOMETOWN_IMAGE_DIGEST names this image in
# every build record, so set it to the pushed image's digest at deploy)
COPY --from=py /usr/local /usr/local
RUN ldconfig && python3 -V
WORKDIR /opt/render/project/src
# the compiler: MogCity tools/hometown at the commit the build is made from (the ODbL method offer: it is public)
ARG MOGCITY_REF=hometown-integrate
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/* \
 && git clone --depth 1 --branch "$MOGCITY_REF" https://github.com/GameMog/GameMog.git /opt/mogcity \
 && python3 -m venv /opt/hometown-venv \
 && /opt/hometown-venv/bin/pip install --no-cache-dir -r /opt/mogcity/tools/hometown/requirements.txt
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
ENV HOMETOWN_PYTHON=/opt/hometown-venv/bin/python \
    HOMETOWN_COMPILER_DIR=/opt/mogcity \
    HOMETOWN_SOURCES_DIR=/opt/render/project/src/data/hometown-src
CMD ["sh", "-c", "node deploy/boot.mjs && node_modules/.bin/next start -p $PORT"]
