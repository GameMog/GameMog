// Hand-built cast: comparison sheets from study.mts's tiles, the reference (Mr. Big) row over the hand-built one's.
//   node scripts/handbuilt/compose.mjs <tilesDir> <shotsDir> <prefix> <refName> <name> [label]
import { createRequire } from 'node:module';
import fs from 'node:fs';
const TB = process.env.FORGE_TOOLBOX_DIR || new URL('../../.scratch/tools/gltf/', import.meta.url).pathname;
const sharp = createRequire(TB + 'node_modules/')('sharp');
const [T, SH, P, REF, NAME, LABEL = 'young hero'] = process.argv.slice(2);
const who = { [REF]: 'Mr. Big (A)', [NAME]: LABEL };
const tile = (n, sec, k) => `${T}/${n}/${sec}-${String(k).padStart(2, '0')}.jpg`;
const text = (s, w, h, size = 18) => Buffer.from(`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#101114"/><text x="10" y="${Math.round(h * 0.68)}" font-family="Helvetica, Arial" font-size="${size}" fill="#E8E2D6">${s.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text></svg>`);
// rows: [label, [file...]], each tile w x h (cover), a label strip LH tall over each row
async function sheet(file, title, rows, w, h, LH = 26) {
  const cols = Math.max(...rows.map((r) => r[1].length)), W = cols * w, H = 40 + rows.length * (h + LH);
  const comp = [{ input: text(title, W, 40, 22), left: 0, top: 0 }];
  for (const [i, [lab, files]] of rows.entries()) { const y = 40 + i * (h + LH); comp.push({ input: text(lab, W, LH, 16), left: 0, top: y });
    for (const [j, f] of files.entries()) if (f && fs.existsSync(f)) comp.push({ input: await sharp(f).resize(w, h, { fit: 'cover', position: 'centre' }).toBuffer(), left: j * w, top: y + LH }); }
  await sharp({ create: { width: W, height: H, channels: 3, background: '#000' } }).composite(comp).jpeg({ quality: 86 }).toFile(file); console.log(file);
}
const r = (n, sec, ks) => ks.map((k) => tile(n, sec, k)), R8 = (a) => [...Array(8).keys()].map((x) => x + a);
const both = (sec, lab, ks) => [[`${who[REF]}: ${lab}`, r(REF, sec, ks)], [`${who[NAME]}: ${lab}`, r(NAME, sec, ks)]];
const yaws = 'yaw 0 / 45 / 90 / 135 / 180 / 225 / 270 / 315';
await sheet(`${SH}/${P}-01-turn.jpg`, `Turntable, idle, ${yaws}: eye, low (0.45 m), high (2.6 m)`, [...both('turn', 'eye', R8(0)), ...both('turn', 'low', R8(8)), ...both('turn', 'high', R8(16))], 200, 300);
await sheet(`${SH}/${P}-02-head.jpg`, `Head and shoulders in the study light, ${yaws}: eye, low (-0.38 m), high (+0.42 m)`, [...both('bust', 'eye', R8(0)), ...both('bust', 'low', R8(8)), ...both('bust', 'high', R8(16))], 230, 230);
await sheet(`${SH}/${P}-03-talk.jpg`, 'Talk (study light): front rest, 3/4 mid-word, 3/4 open, other 3/4, profile, blink | close: rest, open, 3/4 open', both('talk', 'talk', [...Array(9).keys()]), 260, 260);
await sheet(`${SH}/${P}-04-hands.jpg`, 'Hands (study light): idle L front/side, R side/back | talk R, L | phone R x2 | guard R, L | jab L | arms R  (Mr. Big has no guard/jab clip: his idle)', both('hands', 'hands', [...Array(12).keys()]), 230, 230);
await sheet(`${SH}/${P}-05-walk.jpg`, 'Walk: 8 frames at 3/4, 4 at the side (Mr. Big: walk; young hero: walkCool)', both('walk', 'walk', [...Array(12).keys()]), 180, 270);
// the study sheet: one row each, the frames that decide the grade
const pick = (n) => [tile(n, 'turn', 0), tile(n, 'turn', 1), tile(n, 'turn', 2), tile(n, 'turn', 4), tile(n, 'turn', 9), tile(n, 'turn', 16), tile(n, 'bust', 0), tile(n, 'bust', 1), tile(n, 'bust', 2), tile(n, 'talk', 2), tile(n, 'talk', 7), tile(n, 'hands', 0), tile(n, 'hands', 6)];
await sheet(`${SH}/${P}-00-study.jpg`, `HP ${LABEL} study vs Mr. Big: front, 3/4, profile, back, low 3/4, high front | head front, 3/4, profile | talk 3/4 open, close open | hand at rest, phone hand`, [[who[REF], pick(REF)], [who[NAME] + (LABEL === 'young hero' ? ' (forge round 8, 34bfa851)' : ''), pick(NAME)]], 200, 300, 28);
