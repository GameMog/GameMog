// Hand-built Jensen (Jensen Heist's hero: a parody of a public keynote persona; realistic features at the forge's
// defaults, no exaggeration): the hand passes applied, in order, to his forge base (base-forged.glb, never changed; made
// by forge-base.mjs from storykit/handbuilt/jensen/jensen.sheet.json: MakeHuman CC0 body at sheet age 63, a black tee and
// dark jeans, the forge library's tailored jacket cut short as a moto jacket over them (round 4), black dress shoes).
//   node scripts/handbuilt/jensen/build.mjs [out.glb] [--only=skin,jacket,...] [--skip=...]
// Shares the young hero's GLB tools and his eye, teeth and finger passes, the old boss's iris pass, John's skin and scalp
// passes (with his own landmarks); his own passes (age, hair, moto jacket, glasses) are in this folder and ../frames.mjs.
import fs from 'node:fs';
import { daylightSkinPass } from '../daylight.mjs';
import { read, write } from '../young-hero/glb.mjs';
import { eyesPass } from '../young-hero/look.mjs';
import { fingerPass } from '../young-hero/p2.mjs';
import { irisPass } from '../old-boss/eyes.mjs';
import { scalpPass } from './scalp.mjs';
import { paintSkin } from './skin.mjs';
import { silverPass, volumePass, hairlinePass, layerPass } from './hair.mjs';
import { ageShapePass, ageSkinPass, browAgePass } from './age.mjs';
import { teePass, jeansPass } from './wear.mjs';
import { motoPass } from './moto.mjs';
import { bakeRest, addMorphs } from '../facekit.mjs';
const FACE = process.env.JH_FACE || new URL('../../../.scratch/jensen/face/', import.meta.url).pathname;
import { framesPass } from '../frames.mjs';
const MORPHS = ['eyeBlinkLeft', 'eyeBlinkRight', 'jawOpen', ...['sil', 'PP', 'FF', 'TH', 'DD', 'kk', 'CH', 'SS', 'nn', 'RR', 'aa', 'E', 'I', 'O', 'U'].map((v) => 'viseme_' + v),
  'mouthSmileLeft', 'mouthSmileRight', 'cheekSquintLeft', 'cheekSquintRight', 'eyeSquintLeft', 'eyeSquintRight', 'browInnerUp', 'browOuterUpLeft', 'browOuterUpRight', 'mouthClose',
  'eyeWideLeft', 'eyeWideRight', 'mouthFrownLeft', 'mouthFrownRight', 'mouthPucker', 'mouthFunnel'];
const DIR = new URL('../../../storykit/handbuilt/jensen/', import.meta.url).pathname;
const args = process.argv.slice(2), OUT = args.find((a) => !a.startsWith('--')) || DIR + 'jensen.glb';
const only = args.find((a) => a.startsWith('--only='))?.slice(7).split(','), skip = new Set(args.find((a) => a.startsWith('--skip='))?.slice(7).split(',') || []);
const on = (k) => (!only || only.includes(k)) && !skip.has(k);
const { doc, src } = await read(DIR + 'base-forged.glb');
const steps = [
  // (the warm grin, kept at rest: MakeHuman Faceunits 01 (CC0) smile, cheek and eye squint at a third, in the rest shape)
  ['grin', () => bakeRest(doc, [['mouthSmileLeft', 0.34], ['mouthSmileRight', 0.32], ['cheekSquintLeft', 0.22], ['cheekSquintRight', 0.2], ['eyeSquintLeft', 0.1], ['eyeSquintRight', 0.1]].map(([n, w]) => [FACE + n + '.target', w]))],
  // (round 4: his age in the face's shape: MakeHuman's own targets, age.mjs)
  ['ageshape', () => ageShapePass(doc)],
  // (clean-shaven; an older man's skin: the age detail up, lentigines and crow's feet; round 4: less orange)
  ['skin', () => paintSkin(doc, { handTone: 0.9, dot: 0.34, age: 3.0, stubble: 0, mul: [0.96, 0.91, 0.865] })],
  // (round 4: the creases, folds and age spots of a man of 63, painted and in the normal map; the tone less saturated)
  ['age', () => ageSkinPass(doc)],
  ['brows', () => browAgePass(doc)],
  // (the scalp under the cut painted as short silver hair, not dark)
  ['scalp', () => scalpPass(doc, { root: [120, 118, 116], tip: [196, 194, 190], grey: [80, 78, 76] })],
  ['hair', () => silverPass(doc)],
  ['volume', () => volumePass(doc, { front: 0.0065, crown: 0.003 })],
  ['hairline', () => hairlinePass(doc)],
  ['layer', () => layerPass(doc)],
  ['fingers', () => fingerPass(doc, { slim: 0.07 })],
  ['eyes', () => eyesPass(doc)],
  ['iris', () => irisPass(doc, { base: [70, 46, 32] })],
  // (round 4: the moto jacket is the forge library's tailored cut (forge-base.mjs), made black leather with its zips here)
  ['jacket', () => motoPass(doc)],
  ['tee', () => teePass(doc)],
  ['jeans', () => jeansPass(doc)],
  ['glasses', () => framesPass(doc, { style: 'acetate', LW: 0.049, LH: 0.028, T: 0.0022, D: 0.004, r: 0.004, bevel: 0.0006, armW: 0.0024, armH: 0.0045, col: [0.012, 0.012, 0.014], rough: 0.3 })],
  // (round 4: no extra saturation or warmth for him: the round-3 skin read orange and doll-like)
  ['daylight', () => daylightSkinPass(doc, { sat: 1.0, warm: [1.01, 0.995, 0.99], gain: 0.86 })],
  // (the talking face, last: MakeHuman Faceunits 01 and Visemes 02 (CC0) as glTF morph targets, the names and the set
  // Mog City's face.js plays (FACE-CONTRACT: blinks, jaw, the 15 visemes, the grin and what rides it, brows, spares);
  // the lashes and brows ride the lids and brows, the lower teeth the jaw)
  ['morphs', () => addMorphs(doc, MORPHS.map((n) => [n, FACE + n + '.target']))],
];
for (const [k, f] of steps) if (on(k)) { const t = Date.now(); await f(); console.log('step', k, ((Date.now() - t) / 1000).toFixed(1), 's'); }
const glb = await write(doc, src); fs.writeFileSync(OUT, glb); console.log(OUT, (glb.length / 1048576).toFixed(2), 'MB');
