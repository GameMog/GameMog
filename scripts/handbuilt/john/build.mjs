// Hand-built John Marin (Pickup Time's hero, 38): the hand passes applied, in order, to his forge base (base-forged.glb,
// never changed; made by forge-base.mjs from storykit/handbuilt/john/john-marin.sheet.json, forged at sheet age 46 so the
// MakeHuman base reads late thirties).
//   node scripts/handbuilt/john/build.mjs [out.glb] [--only=skin,shirt,...] [--skip=...]
// Shares the young hero's GLB tools and his eye, teeth, finger and stubble passes, the old boss's iris pass; his own passes (skin, shirt, hair) are in this folder.
import fs from 'node:fs';
import { daylightSkinPass } from '../daylight.mjs';
import { read, write } from '../young-hero/glb.mjs';
import { eyesPass, teethPass } from '../young-hero/look.mjs';
import { fingerPass, stubblePass } from '../young-hero/p2.mjs';
import { irisPass } from '../old-boss/eyes.mjs';
import { scalpPass } from './scalp.mjs';
import { paintSkin } from './skin.mjs';
import { shirtPass, hemPass, shoulderPass } from './shirt.mjs';
import { bellyPass, fitPass, postureCarriage, unfoldPass } from './body.mjs';
import { hairTonePass } from './hair.mjs';
import { matOf } from '../young-hero/glb.mjs';
// (the sneakers off-white and matte: pure white uppers glowed in every daylight shot)
function shoeTonePass(doc) { for (const [n, k] of [['sneakers', 0.8], ['sneakers-soles', 0.85], ['sneakers-collar', 0.85], ['sneakers-laces', 0.8]]) { const m = matOf(doc, n); if (!m) continue; const f = m.getBaseColorFactor(); m.setBaseColorFactor([f[0] * k, f[1] * k * 0.99, f[2] * k * 0.96, f[3]]); m.setRoughnessFactor(Math.max(0.85, m.getRoughnessFactor())); } }
const DIR = new URL('../../../storykit/handbuilt/john/', import.meta.url).pathname;
const args = process.argv.slice(2), OUT = args.find((a) => !a.startsWith('--')) || DIR + 'john.glb';
const only = args.find((a) => a.startsWith('--only='))?.slice(7).split(','), skip = new Set(args.find((a) => a.startsWith('--skip='))?.slice(7).split(',') || []);
const on = (k) => (!only || only.includes(k)) && !skip.has(k);
const { doc, src } = await read(DIR + 'base-forged.glb');
const steps = [
  ['skin', () => paintSkin(doc, { handTone: 0.9, dot: 0.3, age: 1.4, mul: [0.95, 0.89, 0.83] })],
  ['scalp', () => scalpPass(doc)],
  // (the cutscene sets' over-the-shoulder close-ups: the grey hairs read as white dashes all over the back of his head;
  // fewer, softer, mostly at the temples)
  ['hair', () => hairTonePass(doc, { top: 0.01, temple: 0.06, greyMix: 0.42 })],
  ['stubble', () => stubblePass(doc, { keep: 0.92 })],
  ['fingers', () => fingerPass(doc, { slim: 0.07 })],
  ['eyes', () => eyesPass(doc)],
  ['iris', () => irisPass(doc, { base: [92, 62, 40] })],
  ['teeth', () => teethPass(doc)],
  ['shirt', () => shirtPass(doc)],
  ['shoes', () => shoeTonePass(doc)],
  ['hem', () => hemPass(doc)],
  ['shoulders', () => shoulderPass(doc)],
  ['belly', () => bellyPass(doc)],
  ['fit', () => fitPass(doc)],
  ['unfold', () => unfoldPass(doc)],
  ['carriage', () => postureCarriage(doc)],
  // (the daylight skin pass, last: Pickup Time plays in midday sun; scripts/handbuilt/daylight.mjs)
  ['daylight', () => daylightSkinPass(doc, {})],
];
for (const [k, f] of steps) if (on(k)) { const t = Date.now(); await f(); console.log('step', k, ((Date.now() - t) / 1000).toFixed(1), 's'); }
const glb = await write(doc, src); fs.writeFileSync(OUT, glb); console.log(OUT, (glb.length / 1048576).toFixed(2), 'MB');
