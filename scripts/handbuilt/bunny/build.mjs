// Hand-built Bunny Ferraby (Pickup Time's loan shark, 58): the hand passes applied, in order, to her forge base
// (storykit/handbuilt/bunny/forged.glb, forged from bunny.sheet.json beside it with scripts/forge/forge.mjs at sheet age 68
// so the MakeHuman base reads late fifties, the short-curly cut, the uniform jacket and track pants; never changed).
//   node scripts/handbuilt/bunny/build.mjs [out.glb] [--only=skin,jacket,...] [--skip=...]
// Shares the young hero's GLB tools and eye, teeth and finger passes, the old boss's iris pass, Agnes's skin and fit passes
// (her face's features moved to Bunny's landmarks) and Carissa's earrings; her own passes (the velour tracksuit, the
// silver-blonde hair) are in wear.mjs here.
import fs from 'node:fs';
import { daylightSkinPass } from '../daylight.mjs';
import { read, write } from '../young-hero/glb.mjs';
import { eyesPass, teethPass } from '../young-hero/look.mjs';
import { fingerPass } from '../young-hero/p2.mjs';
import { irisPass } from '../old-boss/eyes.mjs';
import { paintSkin } from '../agnes/skin.mjs';
import * as F from '../agnes/fit.mjs';
import { skinInPass } from '../agnes/collar.mjs';
import { earringsPass } from '../carissa/wear.mjs';
import * as W from './wear.mjs';
import { flapPass, bandPass, edgePass, slitPass } from './fit.mjs';
const DIR = new URL('../../../storykit/handbuilt/bunny/', import.meta.url).pathname;
const args = process.argv.slice(2), OUT = args.find((a) => !a.startsWith('--')) || DIR + 'bunny.glb';
const only = args.find((a) => a.startsWith('--only='))?.slice(7).split(','), skip = new Set(args.find((a) => a.startsWith('--skip='))?.slice(7).split(',') || []);
const on = (k) => (!only || only.includes(k)) && !skip.has(k);
const { doc, src } = await read(DIR + 'forged.glb');
// her landmarks (forge extras: ey 1.5624, mouth 62.0 mm under the eyes, chin 100.2 mm, eye front 0.1536, mouth half 21.2
// mm; bind space)
export const LM = { EY: 1.5624, EYEFRONT: 0.1536, EZ: 0.1406, EYEX: 0.0285, MOUTHY: 1.5004, CHINY: 1.4622, MH: 0.0212, NOSE: [0, 1.5273, 0.1858] };
export const SKIN = { lm: LM, target: [204, 150, 114], handTone: 0.95, age: 0.5, spots: 0.4, lines: 0.45, lc: 0.35, lids: 1, lipCol: [158, 78, 90] };
const steps = [
  ['band', () => bandPass(doc, { over: 'uniform', sink: 0.012 })],
  ['skin', () => paintSkin(doc, SKIN)],
  ['jacket', () => W.jacketPass(doc)],
  ['collar', () => W.collarPass(doc)],
  ['buttons', () => W.buttonsPass(doc)],
  ['pants', () => W.pantsPass(doc)],
  ['hair', () => W.hairPass(doc)],
  ['fringe', () => W.fringePass(doc, LM)],
  ['flaps', () => flapPass(doc, { it: 200, nIt: 8 })],
  ['slits', () => slitPass(doc)],
  // (the jacket's own neckline under the band: its teeth smoothed into one line, tucked under the band's flared foot)
  ['neckline', () => edgePass(doc, { mats: ['uniform'], yMin: 1.33, it: 40 })],
  ['shoulders', () => F.shoulderPass(doc, { mats: ['uniform', 'uniform-hem'] })],
  ['collarin', () => F.collarInPass(doc)],
  ['skinin', () => skinInPass(doc)],
  ['corners', () => F.cornerLiftPass(doc, { lift: 0.0012, mouthY: LM.MOUTHY, cx: LM.MH })],
  ['cull', () => F.cullPass(doc, [['skin', ['uniform', 'uniform-hem', 'uniform-collar', 'clothes', 'sneakers', 'sneakers-collar']], ['clothes', ['uniform', 'uniform-hem', 'sneakers', 'sneakers-collar']]])],
  ['earrings', () => earringsPass(doc, { R: 0.0105, r: 0.0009 })],
  ['fingers', () => fingerPass(doc, { slim: 0.06 })],
  ['eyes', () => eyesPass(doc)],
  ['iris', () => irisPass(doc, { base: [78, 50, 34] })],
  ['teeth', () => teethPass(doc)],
  // (the daylight skin pass, last: Pickup Time plays in midday sun; scripts/handbuilt/daylight.mjs)
  ['daylight', () => daylightSkinPass(doc, {})],
];
for (const [k, f] of steps) if (on(k)) { const t = Date.now(); await f(); console.log('step', k, ((Date.now() - t) / 1000).toFixed(1), 's'); }
for (const t of doc.getRoot().listTextures()) if (!t.listParents().some((x) => x.propertyType === 'Material')) t.dispose();
const glb = await write(doc, src); fs.writeFileSync(OUT, glb); console.log(OUT, (glb.length / 1048576).toFixed(2), 'MB');
