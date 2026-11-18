// Hand-built Gordon Pell (Pickup Time's loan officer who said no, 45): the hand passes applied, in order, to his forge base
// (storykit/handbuilt/pell/forged.glb, made by John's forge-base.mjs from pell.sheet.json beside it, at sheet age 52 so
// the MakeHuman base reads mid-forties: the base suit worn whole, Mr. Big's and John's way; never changed).
//   node scripts/handbuilt/pell/build.mjs [out.glb] [--only=skin,suit,...] [--skip=...]
// Shares the young hero's GLB tools and eye, teeth and finger passes, the old boss's iris pass, Agnes's skin pass (his
// landmarks, a man's settings: no make-up, light lines) and her wire glasses (here thin, silver, at his eyes); his own
// passes (the grey suit, the pale blue tie, the lanyard) are in wear.mjs here.
import fs from 'node:fs';
import { daylightSkinPass } from '../daylight.mjs';
import { read, write, matOf } from '../young-hero/glb.mjs';
import { eyesPass, teethPass } from '../young-hero/look.mjs';
import { fingerPass } from '../young-hero/p2.mjs';
import { irisPass } from '../old-boss/eyes.mjs';
import { paintSkin } from '../agnes/skin.mjs';
import { glassesPass } from '../agnes/glasses.mjs';
import * as W from './wear.mjs';
const DIR = new URL('../../../storykit/handbuilt/pell/', import.meta.url).pathname;
const args = process.argv.slice(2), OUT = args.find((a) => !a.startsWith('--')) || DIR + 'pell.glb';
const only = args.find((a) => a.startsWith('--only='))?.slice(7).split(','), skip = new Set(args.find((a) => a.startsWith('--skip='))?.slice(7).split(',') || []);
const on = (k) => (!only || only.includes(k)) && !skip.has(k);
const { doc, src } = await read(DIR + 'forged.glb');
// his landmarks (forge extras: ey 1.7265, mouth 75.7 mm under the eyes, chin 122.3 mm, eye front 0.1497, mouth half 21.2 mm)
export const LM = { EY: 1.7265, EYEFRONT: 0.1497, EZ: 0.137, EYEX: 0.033, MOUTHY: 1.7265 - 0.0757, CHINY: 1.7265 - 0.1223, MH: 0.0212, NOSE: [0, 1.7265 - 0.04, 0.183] };
const steps = [
  ['skin', () => paintSkin(doc, { lm: LM, target: [206, 160, 134], handTone: 0.95, age: 0.6, spots: 0.25, lines: 0.5, lc: 0.35, lids: 1, lipCol: [168, 112, 104] })],
  ['suit', () => W.suitPass(doc)],
  ['hair', () => W.hairPass(doc)],
  ['shoes', () => { const m = matOf(doc, 'shoes'); if (m) m.setBaseColorFactor([0.09, 0.07, 0.06, 1]).setRoughnessFactor(0.4); }],
  ['lanyard', () => W.lanyardPass(doc, LM)],
  ['glasses', () => glassesPass(doc, { EY: LM.EY, EYEFRONT: LM.EYEFRONT, ex: LM.EYEX, R: 0.019, r: 0.0006, dz: 0.011, temple: 0.085, col: [0.78, 0.79, 0.8] })],
  ['fingers', () => fingerPass(doc, { slim: 0.08 })],
  ['eyes', () => eyesPass(doc)],
  ['iris', () => irisPass(doc, { base: [104, 86, 62] })],
  ['teeth', () => teethPass(doc)],
  // (the daylight skin pass, last: Pickup Time plays in midday sun; scripts/handbuilt/daylight.mjs)
  ['daylight', () => daylightSkinPass(doc, { sat: 1.12 })],
];
for (const [k, f] of steps) if (on(k)) { const t = Date.now(); await f(); console.log('step', k, ((Date.now() - t) / 1000).toFixed(1), 's'); }
for (const t of doc.getRoot().listTextures()) if (!t.listParents().some((x) => x.propertyType === 'Material')) t.dispose();
const glb = await write(doc, src); fs.writeFileSync(OUT, glb); console.log(OUT, (glb.length / 1048576).toFixed(2), 'MB');
