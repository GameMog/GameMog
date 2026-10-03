/**
 * Bundle the runtime's maps and modules into scripts the game page can include:
 * <dir>/entry.js (ES modules, some written for a later three.js) ->
 * lib/runtime/maps/<id>.js, an IIFE that uses the page's own three.js (r157)
 * through lib/runtime/maps/three-shim.cjs. A map lives in lib/runtime/maps/<id>/;
 * the traversal (open.traversal) in lib/runtime/traversal/.
 *
 *   node scripts/runtime/build-maps.mjs
 */
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const MAPS = [
  { id: 'ocean-drive', global: 'GameMogOceanDrive', dir: 'lib/runtime/maps/ocean-drive', what: 'a GameMog runtime map' },
  { id: 'traversal', global: 'GameMogTraversal', dir: 'lib/runtime/traversal', what: 'the GameMog runtime\'s traversal (open.traversal)' },
  { id: 'city', global: 'GameMogCity', dir: 'lib/runtime/maps/city', what: 'a GameMog runtime map' },
];
for (const m of MAPS) {
  const licence = readFileSync(`${root}${m.dir}/LICENSE`, 'utf8').trim();
  await build({
    entryPoints: [`${root}${m.dir}/entry.js`],
    bundle: true, format: 'iife', globalName: m.global, target: 'es2020',
    outfile: `${root}lib/runtime/maps/${m.id}.js`,
    minifySyntax: true, minifyWhitespace: true, legalComments: 'none', logLevel: 'warning',
    banner: { js: `/* ${m.id}: ${m.what}, built by scripts/runtime/build-maps.mjs from ${m.dir}/ (do not edit).\n${licence}\n*/` },
    plugins: [{ name: 'three-global', setup(b) { b.onResolve({ filter: /^three$/ }, () => ({ path: `${root}lib/runtime/maps/three-shim.cjs` })); } }],
  });
  console.log('built', m.id);
}
