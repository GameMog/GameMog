// Hand-built Carissa (Pickup Time, John's wife, 36): the hand passes applied, in order, to her forged base
// (storykit/handbuilt/carissa/forged.glb, forged from sheet.json beside it with scripts/forge/forge.mjs; never changed).
//   node scripts/handbuilt/carissa/build.mjs [out.glb] [--only=skin,hair,...] [--skip=...]
// Shares the young hero's GLB tools and his eye, teeth, finger and denim passes and the young mother's iris pass; her
// own passes (hair, skin, face, jacket and knit, earrings) are in this folder.
import fs from 'node:fs';
import { daylightSkinPass } from '../daylight.mjs';
import { read, write } from '../young-hero/glb.mjs';
import { eyesPass, teethPass, jeansPass } from '../young-hero/look.mjs';
import { fingerPass } from '../young-hero/p2.mjs';
import { irisPass } from '../young-mother/p3.mjs';
import { paintSkin } from './skin.mjs';
import { browsLashesPass, mouthInsidePass, cornerLiftPass } from './face.mjs';
import { hairCutPass, hairShapePass, hairCollidePass, hairColourPass } from './hair.mjs';
import { jacketPass, knitPass, knitTuckPass, earringsPass, bootsPass, jeansDarkPass } from './wear.mjs';
const DIR = new URL('../../../storykit/handbuilt/carissa/', import.meta.url).pathname;
const args = process.argv.slice(2), OUT = args.find((a) => !a.startsWith('--')) || DIR + 'carissa.glb';
const only = args.find((a) => a.startsWith('--only='))?.slice(7).split(','), skip = new Set(args.find((a) => a.startsWith('--skip='))?.slice(7).split(',') || []);
const on = (k) => (!only || only.includes(k)) && !skip.has(k);
const { doc, src } = await read(DIR + 'forged.glb');
const steps = [
  ['corners', () => cornerLiftPass(doc)],
  ['skin', () => paintSkin(doc)],
  ['mouthinside', () => mouthInsidePass(doc)],
  ['brows', () => browsLashesPass(doc)],
  ['jeans', () => jeansPass(doc)],
  ['jeansdark', () => jeansDarkPass(doc)],
  ['knit', () => knitPass(doc)],
  ['jacket', () => jacketPass(doc)],
  ['knittuck', () => knitTuckPass(doc)],
  ['haircut', () => hairCutPass(doc)],
  ['hairshape', () => hairShapePass(doc)],
  ['haircollide', () => hairCollidePass(doc)],
  ['haircolour', () => hairColourPass(doc)],
  ['earrings', () => earringsPass(doc)],
  ['boots', () => bootsPass(doc)],
  ['fingers', () => fingerPass(doc, { slim: 0.08 })],
  ['eyes', () => eyesPass(doc)],
  ['iris', () => irisPass(doc, { L: 58 })],
  ['teeth', () => teethPass(doc)],
  // (the daylight skin pass, last: Pickup Time plays in midday sun; scripts/handbuilt/daylight.mjs)
  ['daylight', () => daylightSkinPass(doc, {})],
];
for (const [k, f] of steps) if (on(k)) { const t = Date.now(); await f(); console.log('step', k, ((Date.now() - t) / 1000).toFixed(1), 's'); }
const glb = await write(doc, src); fs.writeFileSync(OUT, glb); console.log(OUT, (glb.length / 1048576).toFixed(2), 'MB');
