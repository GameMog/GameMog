// Hand-built Milo Marin (Pickup Time, John and Carissa's son, 6): the hand passes applied, in order, to his child forge
// base (storykit/handbuilt/milo/forged.glb, made from milo.sheet.json beside it by forge-base.mjs here at --baby=0.2
// --height=1.15; never changed).
//   node scripts/handbuilt/milo/build.mjs [out.glb] [--only=skin,...] [--skip=...]
// Shares the young hero's GLB tools and eye, teeth and finger passes, the old boss's iris pass and Agnes's skin pass
// (her face's features moved to his landmarks, a child's settings: no lines, no spots, no lid paint left, rosy cheeks).
import fs from 'node:fs';
import { daylightSkinPass } from '../daylight.mjs';
import { read, write, matOf } from '../young-hero/glb.mjs';
import { eyesPass, teethPass } from '../young-hero/look.mjs';
import { irisPass } from '../old-boss/eyes.mjs';
import { paintSkin } from '../agnes/skin.mjs';
import { cullPass, shoulderPass } from '../agnes/fit.mjs';
import { backpackPass } from './backpack.mjs';
import { flapPass } from '../bunny/fit.mjs';
import { mouthTonePass, hoodInPass } from './face.mjs';
const DIR = new URL('../../../storykit/handbuilt/milo/', import.meta.url).pathname;
const args = process.argv.slice(2), OUT = args.find((a) => !a.startsWith('--')) || DIR + 'milo.glb';
const only = args.find((a) => a.startsWith('--only='))?.slice(7).split(','), skip = new Set(args.find((a) => a.startsWith('--skip='))?.slice(7).split(',') || []);
const on = (k) => (!only || only.includes(k)) && !skip.has(k);
const { doc, src } = await read(DIR + 'forged.glb');
// his landmarks (forge extras: ey 1.1265, mouth 56.1 mm under the eyes, chin 85.1 mm, eye front 0.1224, mouth half 21.2 mm;
// bind space, before the armature's scale to 1.15 m)
const LM = { EY: 1.1265, EZ: 0.1094, EYEX: 0.0263, MOUTHY: 1.0704, CHINY: 1.0413, MH: 0.0212, NOSE: [0, 1.099, 0.138] };
const steps = [
  ['skin', () => paintSkin(doc, { lm: LM, target: [214, 158, 124], handTone: 0.97, age: 0, spots: 0, lines: 0, lids: 1, lipCol: [196, 124, 114] })],
  // (HP-mi4: the grey-blue cast round his mouth (the adult base's beard shadow) taken to his cheek's tone, natural lips)
  ['mouthtone', () => mouthTonePass(doc, LM)],
  ['hoodie', () => { const m = matOf(doc, 'hoodie'); if (m) m.setBaseColorFactor([0.86, 0.9, 1, 1]); }],
  // (the hoodie's square shoulder ends 9 mm lower and in: they stood up like pads on a child's narrow shoulders)
  ['shoulders', () => shoulderPass(doc, { mats: ['hoodie', 'hoodie-hem'], cx: 0.165, wx: 0.04, y0: 0.9, y1: 0.97, drop: 0.009, inward: 0.008 })],
  // (HP-mi4: in the game's close-ups the hoodie's shoulders still stood out square and lumpy, like pads, wider than a
  // six-year-old's: the ends dropped more and drawn in, then the shoulder caps and the yoke ironed smooth (Bunny's
  // flap pass with a shoulder window), kept 5 mm off his skin)
  ['shoulders2', () => shoulderPass(doc, { mats: ['hoodie', 'hoodie-hem', 'hood'], cx: 0.15, wx: 0.05, y0: 0.88, y1: 0.97, drop: 0.012, inward: 0.012 })],
  ['yoke', () => flapPass(doc, { mat: 'hoodie', it: 60, clear: 0.005, weight: (x, y, z, sm) => sm(0.86, 0.92, y) * sm(0.05, 0.1, x) * sm(0.26, 0.2, x) })],
  ['hoodin', () => hoodInPass(doc)],
  ['backpack', () => backpackPass(doc, { col: [0.016, 0.024, 0.07], zip: [0.85, 0.5, 0.03] })],
  // (the cloth gate: skin and the jeans came through the hoodie, the sneakers and the hood in the clips: what lies
  // behind the layer over it taken out, Agnes's cull)
  ['cull', () => cullPass(doc, [['skin', ['clothes', 'hoodie', 'hoodie-hem', 'hoodie-neckband', 'hood', 'sneakers', 'sneakers-collar', 'sneakers-lining']], ['clothes', ['hoodie', 'hoodie-hem', 'sneakers', 'sneakers-collar', 'sneakers-lining']], ['hoodie', ['hood']]], { maxD: 0.025 })],
  ['eyes', () => eyesPass(doc)],
  ['iris', () => irisPass(doc, { base: [96, 62, 40] })],
  ['teeth', () => teethPass(doc)],
  // (the daylight skin pass, last: Pickup Time plays in midday sun; scripts/handbuilt/daylight.mjs)
  ['daylight', () => daylightSkinPass(doc, { sat: 1.15 })],
];
for (const [k, f] of steps) if (on(k)) { const t = Date.now(); await f(); console.log('step', k, ((Date.now() - t) / 1000).toFixed(1), 's'); }
for (const t of doc.getRoot().listTextures()) if (!t.listParents().some((x) => x.propertyType === 'Material')) t.dispose();
const glb = await write(doc, src); fs.writeFileSync(OUT, glb); console.log(OUT, (glb.length / 1048576).toFixed(2), 'MB');
