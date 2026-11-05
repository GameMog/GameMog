// THE CHARACTER FORGE: bundles the forge for a creator's browser (FB, browser port): web.mjs and its imports (the forge's
// modules, glTF-Transform, meshoptimizer, three's math) -> public/storykit/forge/forge.js, one ES module.
//   node scripts/forge/build-web.mjs        (npm run storykit:forge-web; again after any change in scripts/forge)
import path from 'node:path';
import { createRequire } from 'node:module';
import { TOOLBOX } from './paths.mjs';
const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../..');
const esbuild = createRequire(ROOT + '/package.json')('esbuild');
const out = path.join(ROOT, 'public/storykit/forge/forge.js');
const r = await esbuild.build({
  entryPoints: [path.join(ROOT, 'scripts/forge/web.mjs')], bundle: true, format: 'esm', platform: 'browser', target: 'es2022',
  minify: true, legalComments: 'eof', outfile: out, nodePaths: [TOOLBOX, path.join(ROOT, 'node_modules')], metafile: true, logLevel: 'warning',
  external: ['node:*'],   // (only behind Node-only paths never taken in a browser: NodeIO, compile.mjs's CLI)
  banner: { js: '// GameMog Story Kit: the Character Forge for the browser. Built by scripts/forge/build-web.mjs from scripts/forge (do not edit).\n// Bundles glTF-Transform (MIT), meshoptimizer (MIT), three.js math (MIT). See /storykit/CREDITS.md.' },
});
const bytes = Object.values(r.metafile.outputs)[0].bytes;
console.log('forge.js', (bytes / 1024).toFixed(0), 'KB');
