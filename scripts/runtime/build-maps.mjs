/**
 * Bundle the runtime's maps into scripts the game page can include:
 * lib/runtime/maps/<map>/entry.js (ES modules, some written for a later
 * three.js) -> lib/runtime/maps/<map>.js, an IIFE that uses the page's own
 * three.js (r157) through lib/runtime/maps/three-shim.cjs.
 *
 *   node scripts/runtime/build-maps.mjs
 */
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const MAPS = [{ id: 'ocean-drive', global: 'GameMogOceanDrive' }];
for (const m of MAPS) {
  const licence = readFileSync(`${root}lib/runtime/maps/${m.id}/LICENSE`, 'utf8').trim();
  await build({
    entryPoints: [`${root}lib/runtime/maps/${m.id}/entry.js`],
    bundle: true, format: 'iife', globalName: m.global, target: 'es2020',
    outfile: `${root}lib/runtime/maps/${m.id}.js`,
    minifySyntax: true, minifyWhitespace: true, legalComments: 'none', logLevel: 'warning',
    banner: { js: `/* ${m.id}: a GameMog runtime map, built by scripts/runtime/build-maps.mjs from lib/runtime/maps/${m.id}/ (do not edit).\n${licence}\n*/` },
    plugins: [{ name: 'three-global', setup(b) { b.onResolve({ filter: /^three$/ }, () => ({ path: `${root}lib/runtime/maps/three-shim.cjs` })); } }],
  });
  console.log('built', m.id);
}
