// Hand-built John: a free-form comparison sheet from study.mts's tiles (any rows, any tiles).
//   node scripts/handbuilt/john/grid.mjs <out.jpg> <title> <w> <h> <label>=<tilesDir>/<name>/<section>:<k,k,k> ...
import { createRequire } from 'node:module';
import fs from 'node:fs';
const TB = process.env.FORGE_TOOLBOX_DIR || new URL('../../../.scratch/tools/gltf/', import.meta.url).pathname;
const sharp = createRequire(TB + 'node_modules/')('sharp');
const [OUT, TITLE, w0, h0, ...specs] = process.argv.slice(2), w = +w0, h = +h0, LH = 24;
const text = (s, W, H, size) => Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#101114"/><text x="10" y="${Math.round(H * 0.7)}" font-family="Helvetica, Arial" font-size="${size}" fill="#E8E2D6">${s.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text></svg>`);
const rows = specs.map((s) => { const [lab, rest] = s.split('='), [base, ks] = rest.split(':'); return [lab, ks.split(',').map((k) => `${base}-${String(k).padStart(2, '0')}.jpg`)]; });
const cols = Math.max(...rows.map((r) => r[1].length)), W = cols * w, H = 40 + rows.length * (h + LH);
const comp = [{ input: text(TITLE, W, 40, 20), left: 0, top: 0 }];
for (const [i, [lab, files]] of rows.entries()) { const y = 40 + i * (h + LH); comp.push({ input: text(lab, W, LH, 15), left: 0, top: y });
  for (const [j, f] of files.entries()) if (fs.existsSync(f)) comp.push({ input: await sharp(f).resize(w, h, { fit: 'cover', position: 'centre' }).toBuffer(), left: j * w, top: y + LH }); }
await sharp({ create: { width: W, height: H, channels: 3, background: '#000' } }).composite(comp).jpeg({ quality: 86 }).toFile(OUT); console.log(OUT);
