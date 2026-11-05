// THE CHARACTER FORGE: where its Node tools find what lives outside this repo (dev only; the site never reads these).
// Every path comes from the environment or, unset, from a place relative to this checkout. Nothing machine-specific
// is written here (the repo is public):
//   FORGE_GAMEMOG      a GameMog checkout with node_modules (three, sharp)        default: this checkout
//   FORGE_TOOLBOX_DIR  the glTF toolbox (a folder with diet/build.mjs and its node_modules: @gltf-transform/*,
//                      meshoptimizer, sharp)                                     default: <this checkout>/.scratch/tools/gltf
//   FORGE_TOOLBOX      that toolbox's node_modules/                               default: <FORGE_TOOLBOX_DIR>/node_modules/
//   FORGE_MOGCITY      a Mog City checkout (its characters and wagmi/ layer)     default: <checkout>/MogCity, else ../GameMog/MogCity
//   FORGE_MH_TARGETS   MakeHuman's targets folder (the approved CC0 download)    default: <this checkout>/.scratch/storykit/downloads/...
//   FORGE_MH_BASE      MakeHuman's base.obj (npm run assets:fetch)               default: <checkout>/assets-src/cache/..., else ../GameMog/...
//   CHROME_LOCK_MODULE the shared one-Chrome lock module (dev machines that have one)
// Not imported by the browser forge (web.mjs): it reads process.env and node:fs.
import fs from 'node:fs';
import path from 'node:path';

export const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../..');
const env = (k) => (process.env[k] ? path.resolve(process.env[k]) : '');
/** the first that exists, else the first (so an error names where it looked) */
const first = (...c) => { const l = c.filter(Boolean); return l.find((p) => fs.existsSync(p)) || l[0]; };
const sibling = (rel) => path.join(ROOT, '..', 'GameMog', rel);

export const GAMEMOG = env('FORGE_GAMEMOG') || ROOT;
export const TOOLBOX_DIR = env('FORGE_TOOLBOX_DIR') || path.join(ROOT, '.scratch/tools/gltf');
export const TOOLBOX = (env('FORGE_TOOLBOX') || path.join(TOOLBOX_DIR, 'node_modules')) + '/';
export const MOGCITY = env('FORGE_MOGCITY') || first(path.join(GAMEMOG, 'MogCity'), path.join(ROOT, 'MogCity'), sibling('MogCity'));
export const MH_TARGETS = env('FORGE_MH_TARGETS') || path.join(ROOT, '.scratch/storykit/downloads/makehuman-targets/repo/makehuman/data/targets');
export const MH_BASE = env('FORGE_MH_BASE') || first(path.join(GAMEMOG, 'assets-src/cache/makehuman/3dobjs/base.obj'),
  path.join(ROOT, 'assets-src/cache/makehuman/3dobjs/base.obj'), sibling('assets-src/cache/makehuman/3dobjs/base.obj'));
export const CHROME_LOCK_MODULE = env('CHROME_LOCK_MODULE') || first(path.join(GAMEMOG, 'MogCity/.scratch/integrate/reg/lock.mts'),
  path.join(ROOT, 'MogCity/.scratch/integrate/reg/lock.mts'), sibling('MogCity/.scratch/integrate/reg/lock.mts'));
