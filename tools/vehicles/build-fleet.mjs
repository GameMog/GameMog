#!/usr/bin/env node
// Mog City, Hometown: the town fleet's ready-made cars, built from the raw downloads (CC BY 4.0 models from Sketchfab,
// never committed; their sources, creators and the downloads' SHA-256 end up in assets/vehicles/fleet/fleet.json).
//
//   node tools/vehicles/build-fleet.mjs <downloads dir> [staging dir]
//
// The downloads dir holds the .glb files and SOURCES.json ([{ file, sha256, source, uid, creator, licence, downloaded }]).
// Run it from anywhere but inside the downloads (they are data, never run). It needs @gltf-transform/core, /extensions
// and /functions 4.5, meshoptimizer 1.2 and sharp 0.35 in tools/vehicles/node_modules (git-ignored; Mog City has no
// package.json of its own: `npm i --no-save --prefix tools/vehicles @gltf-transform/core@4.5 ...`, or a link to the
// characters' diet tools' node_modules).
//   1. build-dz.mjs     Daniel Zhabotinsky's cars: re-framed, badges / emblems / plate characters / sidewall lettering
//                       dropped or cleaned, one shared atlas (kit*.webp) and the two liveries, LOD0 / LOD1 / LOD2, wheels
//   2. build-c1280.mjs  Comrade1280's packs: split into vehicles, wheels split from the body by geometry, own textures
//   3. emit.mjs         the files copied into assets/vehicles/fleet, fleet.json (every file's and source's SHA-256) and
//                       cities/sf/js/fleet-data.js (the engine's numbers)
// Before/after crops of every texture cleaned go to <staging>/../crops. The output is deterministic for the same
// downloads and the same tool versions.
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url)), REPO = resolve(HERE, '../..');
const [SRC, STAGE = join(tmpdir(), 'mogcity-fleet', 'fleet')] = process.argv.slice(2);
if (!SRC) { console.error('usage: node tools/vehicles/build-fleet.mjs <downloads dir> [staging dir]'); process.exit(2); }
const CROPS = join(STAGE, '..', 'crops');
mkdirSync(STAGE, { recursive: true }); mkdirSync(CROPS, { recursive: true });
const run = (script, ...args) => {
  const r = spawnSync(process.execPath, [join(HERE, script), ...args], { stdio: 'inherit', cwd: HERE });
  if (r.status !== 0) { console.error(script, 'failed'); process.exit(r.status || 1); }
};
run('build-dz.mjs', resolve(SRC), STAGE, CROPS);
run('build-c1280.mjs', resolve(SRC), STAGE);
run('emit.mjs', STAGE, join(resolve(SRC), 'SOURCES.json'), REPO);
