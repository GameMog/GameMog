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
import { strandsPass, hairArea } from './strands.mjs';
import { ageShapePass, ageSkinPass, browAgePass, sculptPass } from './age.mjs';
import { teePass, jeansPass } from './wear.mjs';
import { motoPass, teeHemPass, collarPass, teeShoulderPass, teeCrewPass, drapePass } from './moto.mjs';
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
const { doc, src } = await read(process.env.JH_BASE || DIR + 'base-forged.glb');
const steps = [
  // (the warm grin, kept at rest: MakeHuman Faceunits 01 (CC0) smile, cheek and eye squint at a third, in the rest shape)
  // (likeness round 1: the rest grin lighter and the cheek squint under it mostly gone: it pushed the cheeks out and up
  // into the round, puffy face the owner flagged; his reference's resting face is a closed, pleasant half-smile)
  // (likeness round 2b, the owner: an alert, open face: the brows a little raised, the grin a touch more)
  ['grin', () => bakeRest(doc, [['mouthSmileLeft', 0.3], ['mouthSmileRight', 0.29], ['browInnerUp', 0.18], ['browOuterUpLeft', 0.12], ['browOuterUpRight', 0.12], ['cheekSquintLeft', 0.05], ['cheekSquintRight', 0.05], ['eyeSquintLeft', 0.08], ['eyeSquintRight', 0.08]].map(([n, w]) => [FACE + n + '.target', w]))],
  // (round 4: his age in the face's shape: MakeHuman's own targets, age.mjs)
  // (likeness round 1: the owner's reference is a lean, taut face: no jowls or heavy cheeks; age.mjs's lean set)
  // (likeness round 2: a broad face (wider cheekbones and temples, a squarer, shorter midface and forehead), the mouth's
  // corners level with a fuller upper lip, narrower hooded eyes, the brows lower and straighter, no bags)
  ['ageshape', () => ageShapePass(doc, { lean: 1, laugh: 0, laughIn: 0.3, bag: 0.12, bagH: 0, fold: 0.6, brow: 0.45, lipUp: 0, lipUpInc: 0.35, lipLow: 0.1, bones: 1, temple: 0.7, foreV: 0.5, horiz: 0.3, vert: 0.15, square: 0, chinW: 1.0, angUp: 0.6, eyeH: 0.45, eyeH1: 0, diamond: 0.35, invTri: 1.0, cheekIn: 0.7, vol: 0.8, fat: 0.45, neckW: 0.5, neckD: 0.3 })],
  // (likeness round 2b: the outline sculpted: broad cheekbones, a tapered jaw, age.mjs)
  ['sculpt', () => sculptPass(doc, { jaw: 0.07, bones: 0.015 })],
  // (clean-shaven; an older man's skin: the age detail up, lentigines and crow's feet; round 4: less orange)
  // (likeness round 2: smoother: fewer dots, less of the painted age texture)
  ['skin', () => paintSkin(doc, { handTone: 0.9, dot: 0.12, age: 1.3, stubble: 0, mul: [0.88, 0.845, 0.74] })],
  // (round 4: the creases, folds and age spots of a man of 63, painted and in the normal map; the tone less saturated)
  // (likeness round 1: a fit man around 60, not a very wrinkled one: the creases at a little over half depth, fewer spots,
  // the tone a warm light tan)
  // (likeness round 2: smooth, taut skin: the forehead's lines at about a fifth, the folds by the mouth and the marionette
  // lines at half, no dark under the lids, almost no spots; the tone an olive tan, less saturated, less orange)
  ['age', () => ageSkinPass(doc, { depth: 0.45, spots: 0.08, desat: 0.22, cool: [0.9, 0.9, 0.8], fore: 0.5, folds: 0.55, mar: 0.4, trough: 0.35, jowl: 0.3, neckR: 0.35 })],
  // (likeness round 2: charcoal grey, denser)
  ['brows', () => browAgePass(doc, { col: [34, 34, 36], mix: 0.7, alpha: 1 })],
  // (the scalp under the cut painted as short silver hair, not dark)
  // (likeness round 1: silver-grey, not white: darker at the roots and over the ears)
  // (likeness round 2: the front hairline 1.7 cm lower; the roots a darker grey)
  ['scalp', () => scalpPass(doc, { root: [84, 83, 82], tip: [140, 139, 137], grey: [100, 99, 98], area: (x, y, z, n) => hairArea(x, y, z, n, 0.054) })],
  // (likeness round 2: new strand cards (strands.mjs) for the forge's cut: thick, tousled silver-grey hair lifted up and a
  // little forward off a lower front hairline, a full crown, the temples covered, short sides; no card tiles or wedges)
  ['strands', () => strandsPass(doc, { front: 0.052, Tfront: 0.034, Tcrown: 0.023, rough: 0.6, tone: [158, 157, 156] })],
  ['fingers', () => fingerPass(doc, { slim: 0.07 })],
  ['eyes', () => eyesPass(doc)],
  ['iris', () => irisPass(doc, { base: [70, 46, 32] })],
  // (round 4: the moto jacket is the forge library's tailored cut (forge-base.mjs), made black leather with its zips here)
  // (likeness round 1: the stand collar a real moto band, taller, close round the neck; before the paint, which places
  // the collar's snaps by where its points are)
  ['collar', () => collarPass(doc, { k: 1.15 })],
  // (likeness round 2b: the front hangs straight from the chest, no bust, moto.mjs)
  ['drape', () => drapePass(doc)],
  ['jacket', () => motoPass(doc)],
  ['tee', () => teePass(doc)],
  // (round 4: the tee's hem taken up under the short jacket)
  ['teehem', () => teeHemPass(doc)],
  // (likeness round 1: the tee cut away under the jacket's shoulders, where its edges came through as shards)
  ['teeshoulder', () => teeShoulderPass(doc)],
  ['jeans', () => jeansPass(doc)],
  // (likeness round 1, the owner: "glasses aren't right style": his are a thin metal semi-rimless (browline) frame, slim
  // rectangular lenses of shallow height under a thin dark gunmetal top bar, rimless below, thin wire temples)
  // (likeness round 2: wider lenses to the cheekbones' edge, set higher (the brows nearly on the bar), a thinner gunmetal
  // bar swept up at its outer ends, continuous wire temples and bridge, the rimless edge a faint clear line)
  ['glasses', () => framesPass(doc, { style: 'browline', LW: 0.056, LH: 0.026, r: 0.005, BH: 0.0009, BD: 0.0013, drop: 0.0, armW: 0.0013, sweep: 0.0022, edgeR: 0.0004, edgeCol: [0.5, 0.52, 0.55, 0.14], glint: 0.045, lens: [0.86, 0.88, 0.9, 0.035], col: [0.2, 0.2, 0.215], metal: 0.9, rough: 0.3, tilt: 0.1 })],
  // (round 4: no extra saturation or warmth for him: the round-3 skin read orange and doll-like)
  ['daylight', () => daylightSkinPass(doc, { sat: 1.0, warm: [1.01, 0.995, 0.98], gain: 0.82 })],
  // (likeness round 2b: the tee's crew neck painted in the jacket's open collar, moto.mjs)
  ['teecrew', () => teeCrewPass(doc)],
  // (the talking face, last: MakeHuman Faceunits 01 and Visemes 02 (CC0) as glTF morph targets, the names and the set
  // Mog City's face.js plays (FACE-CONTRACT: blinks, jaw, the 15 visemes, the grin and what rides it, brows, spares);
  // the lashes and brows ride the lids and brows, the lower teeth the jaw)
  ['morphs', () => addMorphs(doc, MORPHS.map((n) => [n, FACE + n + '.target']))],
];
for (const [k, f] of steps) if (on(k)) { const t = Date.now(); await f(); console.log('step', k, ((Date.now() - t) / 1000).toFixed(1), 's'); }
const glb = await write(doc, src); fs.writeFileSync(OUT, glb); console.log(OUT, (glb.length / 1048576).toFixed(2), 'MB');
