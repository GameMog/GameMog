// Hand-built old boss: the hand passes applied, in order, to the forge round-8 copy (r8-forged.glb, never changed).
//   node scripts/handbuilt/old-boss/build.mjs [out.glb] [--only=beard,skin,...] [--skip=...]
// Shares the young hero's GLB tools (../young-hero/glb.mjs) and his eye, teeth and finger passes; his own passes (beard,
// skin, suit) are in this folder.
import fs from 'node:fs';
import { daylightSkinPass } from '../daylight.mjs';
import { read, write } from '../young-hero/glb.mjs';
import { eyesPass, teethPass } from '../young-hero/look.mjs';
import { matOf, rgba, setWebp } from '../young-hero/glb.mjs';
import { fingerPass } from '../young-hero/p2.mjs';
import { beardPass } from './beard.mjs';
import { paintSkin } from './skin.mjs';
import { tiePass, lapelPass, flattenPass, shoulderPass, sleevePass, collarPass, shoulderSmoothPass } from './suit.mjs';
import { horseshoePass } from './scalp.mjs';
import { irisPass } from './eyes.mjs';
import { tieStripePass } from './p3.mjs';
// (an old man's teeth: the young hero's per-tooth gaps and gum line, then aged ivory, a little darker at the edges)
async function ivoryPass(doc) { for (const n of ['teethUp', 'teethLow']) { const t = matOf(doc, n).getBaseColorTexture(), { data, w, h } = await rgba(t);
  for (let i = 0; i < w * h; i++) { const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2]; if (r > 150 && r - g < 40) { data[i * 4] = Math.round(r * 0.97); data[i * 4 + 1] = Math.round(g * 0.94); data[i * 4 + 2] = Math.round(b * 0.84); } }
  await setWebp(t, data, w, h, 90); } }
// (his brows grey, as the sheet has them (they were near-black cards): the hairs' own light and dark kept, lifted to a
// grey of 70-160 with a few darker hairs)
async function browsPass(doc) { const t = matOf(doc, 'brows').getBaseColorTexture(), { data, w, h } = await rgba(t);
  for (let i = 0; i < w * h; i++) { if (data[i * 4 + 3] < 4) continue; const L = (data[i * 4] + data[i * 4 + 1] + data[i * 4 + 2]) / 3, dark = ((i * 2654435761) >>> 0) % 100 < 30; const v = dark ? 62 + 0.5 * L : 105 + 0.6 * L;
    data[i * 4] = Math.round(v); data[i * 4 + 1] = Math.round(v * 0.98); data[i * 4 + 2] = Math.round(v * 0.96); }
  await setWebp(t, data, w, h, 90); }
const DIR = new URL('../../../storykit/handbuilt/old-boss/', import.meta.url).pathname;
const args = process.argv.slice(2), OUT = args.find((a) => !a.startsWith('--')) || DIR + 'old-boss.glb';
const only = args.find((a) => a.startsWith('--only='))?.slice(7).split(','), skip = new Set(args.find((a) => a.startsWith('--skip='))?.slice(7).split(',') || []);
const on = (k) => (!only || only.includes(k)) && !skip.has(k);
const { doc, src } = await read(DIR + 'r8-forged.glb');
const steps = [
  ['beard', () => beardPass(doc)],
  ['skin', () => paintSkin(doc)],
  ['fingers', () => fingerPass(doc, { slim: 0.06 })],
  ['eyes', () => eyesPass(doc)],
  ['iris', () => irisPass(doc)],
  ['teeth', async () => { await teethPass(doc); await ivoryPass(doc); }],
  ['brows', () => browsPass(doc)],
  // (collarPass (the shirt collar's points pulled in) is off: moving only the white points tore the edge into feathers)
  ['collar', () => process.env.HB_COLLAR && collarPass(doc)],
  ['tie', () => tiePass(doc)],
  // (pass 3: the foulard read as blotches; a clean repp stripe of his own, and the collar's white spike on the tie)
  ['tiestripe', () => tieStripePass(doc)],
  ['lapels', () => lapelPass(doc)],
  ['flatten', () => flattenPass(doc)],
  ['shoulders', () => shoulderPass(doc)],
  ['shsmooth', () => shoulderSmoothPass(doc)],
  // (sleevePass (the upper sleeves slimmed to the arm's axis) is off: it narrowed them a little in the renders but
  // raised the shoulder's corner by the forge's shoulders gate (-20 -> -6 mm) and put the collar gate's flecks over 45 px)
  ['sleeves', () => process.env.HB_SLEEVES && sleevePass(doc)],
  ['horseshoe', () => horseshoePass(doc)],
  // (the daylight skin pass, last: Pickup Time plays in midday sun; scripts/handbuilt/daylight.mjs)
  ['daylight', () => daylightSkinPass(doc, { gain: 0.9, sat: 1.12 })],
];
for (const [k, f] of steps) if (on(k)) { const t = Date.now(); await f(); console.log('step', k, ((Date.now() - t) / 1000).toFixed(1), 's'); }
const glb = await write(doc, src); fs.writeFileSync(OUT, glb); console.log(OUT, (glb.length / 1048576).toFixed(2), 'MB');
