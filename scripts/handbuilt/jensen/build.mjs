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
import { motoPass, teeHemPass, collarPass, teeShoulderPass } from './moto.mjs';
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
  // (likeness round 1: the rest grin lighter and the cheek squint under it mostly gone: it pushed the cheeks out and up
  // into the round, puffy face the owner flagged; his reference's resting face is a closed, pleasant half-smile)
  ['grin', () => bakeRest(doc, [['mouthSmileLeft', 0.2], ['mouthSmileRight', 0.19], ['cheekSquintLeft', 0.05], ['cheekSquintRight', 0.05], ['eyeSquintLeft', 0.08], ['eyeSquintRight', 0.08]].map(([n, w]) => [FACE + n + '.target', w]))],
  // (round 4: his age in the face's shape: MakeHuman's own targets, age.mjs)
  // (likeness round 1: the owner's reference is a lean, taut face: no jowls or heavy cheeks; age.mjs's lean set)
  ['ageshape', () => ageShapePass(doc, { lean: 1 })],
  // (clean-shaven; an older man's skin: the age detail up, lentigines and crow's feet; round 4: less orange)
  ['skin', () => paintSkin(doc, { handTone: 0.9, dot: 0.34, age: 2.2, stubble: 0, mul: [0.945, 0.87, 0.77] })],
  // (round 4: the creases, folds and age spots of a man of 63, painted and in the normal map; the tone less saturated)
  // (likeness round 1: a fit man around 60, not a very wrinkled one: the creases at a little over half depth, fewer spots,
  // the tone a warm light tan)
  ['age', () => ageSkinPass(doc, { depth: 0.45, spots: 0.45, desat: 0.04, cool: [0.94, 0.875, 0.78] })],
  ['brows', () => browAgePass(doc)],
  // (the scalp under the cut painted as short silver hair, not dark)
  // (likeness round 1: silver-grey, not white: darker at the roots and over the ears)
  ['scalp', () => scalpPass(doc, { root: [118, 116, 114], tip: [176, 174, 171], grey: [112, 110, 108] })],
  ['hair', () => silverPass(doc)],
  // (likeness round 1: thick, with volume swept up and back off the forehead; short and close at the sides, ears clear)
  ['volume', () => volumePass(doc, { front: 0.007, crown: 0.008, side: 0.006, lift: 0.005 })],
  ['hairline', () => hairlinePass(doc)],
  ['layer', () => layerPass(doc, { front: 0.008, crown: 0.0085, lift: 0 })],
  ['fingers', () => fingerPass(doc, { slim: 0.07 })],
  ['eyes', () => eyesPass(doc)],
  ['iris', () => irisPass(doc, { base: [70, 46, 32] })],
  // (round 4: the moto jacket is the forge library's tailored cut (forge-base.mjs), made black leather with its zips here)
  // (likeness round 1: the stand collar a real moto band, taller, close round the neck; before the paint, which places
  // the collar's snaps by where its points are)
  ['collar', () => collarPass(doc, { k: 1.4 })],
  ['jacket', () => motoPass(doc)],
  ['tee', () => teePass(doc)],
  // (round 4: the tee's hem taken up under the short jacket)
  ['teehem', () => teeHemPass(doc)],
  // (likeness round 1: the tee cut away under the jacket's shoulders, where its edges came through as shards)
  ['teeshoulder', () => teeShoulderPass(doc)],
  ['jeans', () => jeansPass(doc)],
  // (likeness round 1, the owner: "glasses aren't right style": his are a thin metal semi-rimless (browline) frame, slim
  // rectangular lenses of shallow height under a thin dark gunmetal top bar, rimless below, thin wire temples)
  ['glasses', () => framesPass(doc, { style: 'browline', LW: 0.052, LH: 0.025, r: 0.0055, BH: 0.0012, BD: 0.0016, drop: 0.005, armW: 0.0016, lens: [0.86, 0.88, 0.9, 0.035], col: [0.07, 0.07, 0.078], metal: 0.85, rough: 0.32, tilt: 0.07 })],
  // (round 4: no extra saturation or warmth for him: the round-3 skin read orange and doll-like)
  ['daylight', () => daylightSkinPass(doc, { sat: 1.0, warm: [1.01, 0.995, 0.98], gain: 0.82 })],
  // (the talking face, last: MakeHuman Faceunits 01 and Visemes 02 (CC0) as glTF morph targets, the names and the set
  // Mog City's face.js plays (FACE-CONTRACT: blinks, jaw, the 15 visemes, the grin and what rides it, brows, spares);
  // the lashes and brows ride the lids and brows, the lower teeth the jaw)
  ['morphs', () => addMorphs(doc, MORPHS.map((n) => [n, FACE + n + '.target']))],
];
for (const [k, f] of steps) if (on(k)) { const t = Date.now(); await f(); console.log('step', k, ((Date.now() - t) / 1000).toFixed(1), 's'); }
const glb = await write(doc, src); fs.writeFileSync(OUT, glb); console.log(OUT, (glb.length / 1048576).toFixed(2), 'MB');
