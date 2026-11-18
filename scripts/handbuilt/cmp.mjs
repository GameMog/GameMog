// Hand-built cast: a quick side-by-side of study tiles, one row per character.
//   node scripts/handbuilt/cmp.mjs <tilesDir> <out.jpg> <names,comma> <sec:k,sec:k,...> [w] [h]
import { createRequire } from 'node:module'; import fs from 'node:fs';
const sharp = createRequire(new URL('../../.scratch/tools/gltf/node_modules/', import.meta.url).pathname)('sharp');
const [T, OUT, NAMES, KS, w = 220, h = 280] = process.argv.slice(2), W = +w, H = +h;
const names = NAMES.split(','), ks = KS.split(',').map((s) => s.split(':')), comp = [];
for (const [r, n] of names.entries()) for (const [c, [sec, k]] of ks.entries()) { const f = `${T}/${n}/${sec}-${String(k).padStart(2, '0')}.jpg`; if (fs.existsSync(f)) comp.push({ input: await sharp(f).resize(W, H, { fit: 'cover' }).toBuffer(), left: c * W, top: r * H }); }
await sharp({ create: { width: ks.length * W, height: names.length * H, channels: 3, background: '#000' } }).composite(comp).jpeg({ quality: 85 }).toFile(OUT); console.log(OUT);
