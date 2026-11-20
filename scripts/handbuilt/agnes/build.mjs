// Hand-built Agnes Teodoro (Pickup Time's Nanny, 74): the hand passes applied, in order, to her forge base
// (storykit/handbuilt/agnes/forged.glb, forged from agnes.sheet.json beside it with scripts/forge/forge.mjs; never changed).
//   node scripts/handbuilt/agnes/build.mjs [out.glb] [--only=skin,cardigan,...] [--skip=...]
// Shares the young hero's GLB tools and his eye, teeth and finger passes and the old boss's iris pass; her own passes
// (skin, hair, cardigan, face) are in this folder.
import fs from 'node:fs';
import { daylightSkinPass } from '../daylight.mjs';
import { read, write } from '../young-hero/glb.mjs';
import { eyesPass, teethPass } from '../young-hero/look.mjs';
import { fingerPass } from '../young-hero/p2.mjs';
import { irisPass } from '../old-boss/eyes.mjs';
import { paintSkin } from './skin.mjs';
import * as W from './wear.mjs';
import * as F from './fit.mjs';
import * as C from './collar.mjs';
import { glassesPass } from './glasses.mjs';
import { flapPass, bandPass, edgePass, slitPass } from '../bunny/fit.mjs';
const DIR = new URL('../../../storykit/handbuilt/agnes/', import.meta.url).pathname;
const args = process.argv.slice(2), OUT = args.find((a) => !a.startsWith('--')) || DIR + 'agnes.glb';
const IN = args.find((a) => a.startsWith('--in='))?.slice(5) || DIR + 'forged.glb';
const only = args.find((a) => a.startsWith('--only='))?.slice(7).split(','), skip = new Set(args.find((a) => a.startsWith('--skip='))?.slice(7).split(',') || []);
const on = (k) => (!only || only.includes(k)) && !skip.has(k);
const { doc, src } = await read(IN);
const steps = [
  ['band', () => bandPass(doc, { over: 'uniform', sink: 0.012 })],
  ['skin', () => paintSkin(doc)],
  ['knit', () => W.knitPass(doc)],
  ['collar', () => W.blouseCollarPass(doc)],
  ['buttons', () => W.buttonsPass(doc)],
  ['trousers', () => W.trousersPass(doc)],
  ['shoes', () => W.shoesPass(doc)],
  // (HP-ag4: the specks on her collar and chest in daylight: the uniform's pocket flaps (folds in the shell: dark notches and
  // pale slivers on the chest) ironed flat, and the stand collar's zigzag edges (the white shards at its ends, the navy
  // teeth at the back of the neck) rebuilt as one clean band (band, first, so the collar paint paints it); Bunny's fit
  // passes, the same forge garment)
  ['flaps', () => flapPass(doc, { it: 200, nIt: 8 })],
  ['slits', () => slitPass(doc)],
  // (the jacket's own neckline under the band: its teeth smoothed into one line, tucked under the band's flared foot)
  ['neckline', () => edgePass(doc, { mats: ['uniform'], yMin: 1.33, it: 40 })],
  ['shoulders', () => F.shoulderPass(doc)],
  ['collarin', () => F.collarInPass(doc)],
  ['skinin', () => C.skinInPass(doc)],
  ['corners', () => F.cornerLiftPass(doc)],
  ['cull', () => F.cullPass(doc, [['skin', ['uniform', 'uniform-hem', 'uniform-collar', 'clothes', 'shoes']], ['clothes', ['uniform', 'uniform-hem']], ['shoes', ['clothes']]])],
  ['glasses', () => glassesPass(doc)],
  ['fingers', () => fingerPass(doc, { slim: 0.06 })],
  ['eyes', () => eyesPass(doc)],
  ['iris', () => irisPass(doc, { base: [92, 98, 96] })],
  ['teeth', () => teethPass(doc)],
  // (the daylight skin pass, last: Pickup Time plays in midday sun; scripts/handbuilt/daylight.mjs)
  ['daylight', () => daylightSkinPass(doc, {})],
];
for (const [k, f] of steps) if (on(k)) { const t = Date.now(); await f(); console.log('step', k, ((Date.now() - t) / 1000).toFixed(1), 's'); }
// (textures the passes replaced, left with no material, dropped)
for (const t of doc.getRoot().listTextures()) if (!t.listParents().some((x) => x.propertyType === 'Material')) t.dispose();
const glb = await write(doc, src); fs.writeFileSync(OUT, glb); console.log(OUT, (glb.length / 1048576).toFixed(2), 'MB');
