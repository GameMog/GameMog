// Hand-built young mother: the hand passes applied, in order, to the forge round-8 copy (r8-forged.glb, never changed).
//   node scripts/handbuilt/young-mother/build.mjs [out.glb] [--only=skin,hair,...] [--skip=...]
// Shares the young hero's GLB tools (../young-hero/glb.mjs) and his shoe, eye, teeth and denim passes; her own passes
// (hair, skin and make-up, face, cloth, hands) are in this folder.
import fs from 'node:fs';
import { read, write } from '../young-hero/glb.mjs';
import { shoesPass, eyesPass, teethPass } from '../young-hero/look.mjs';
import { hoodSidePass } from '../young-hero/p2.mjs';
import { hairTexPass, hairStylePass } from './hair.mjs';
import { clothPass, fitPass, cordsTeethPass } from './cloth.mjs';
import { fingerPass } from '../young-hero/p2.mjs';
import { paintSkin } from './skin.mjs';
import { browsLashesPass, faceShapePass } from './face.mjs';
import { bustSoftPass, bustMapPass, cordsShortPass, irisPass, mouthInsidePass } from './p3.mjs';
import { faceAgePass, agePaintPass, hairSoftPass, bustApexPass } from './p4.mjs';
import { apexWeldPass, BROW_DROP, browsDownPass, midFacePass, hairVolumePass, partLinePass, apexCleanPass } from './p5.mjs';
import { SHOES, CLOTH, HL, STYLE, foreheadPass, locksPass, bustPass, hoodieNormalsPass, cordsPass, hoodPass, faceMorePass } from './p2.mjs';
const DIR = new URL('../../../storykit/handbuilt/young-mother/', import.meta.url).pathname;
const args = process.argv.slice(2), OUT = args.find((a) => !a.startsWith('--')) || DIR + 'young-mother.glb';
const only = args.find((a) => a.startsWith('--only='))?.slice(7).split(','), skip = new Set(args.find((a) => a.startsWith('--skip='))?.slice(7).split(',') || []);
const on = (k) => (!only || only.includes(k)) && !skip.has(k);
const { doc, src } = await read(DIR + 'r8-forged.glb');
const steps = [
  ['shoes', () => shoesPass(doc, SHOES)],
  ['hairtex', () => hairTexPass(doc)],
  ['hairstyle', () => hairStylePass(doc, STYLE)],
  ['faceshape', () => faceShapePass(doc)],
  ['facemore', () => faceMorePass(doc)],
  ['faceage', () => faceAgePass(doc)],
  ['midface', () => midFacePass(doc)],
  ['brows', () => browsLashesPass(doc)],
  ['browsdown', () => browsDownPass(doc)],
  ['skin', () => paintSkin(doc, { hairline: HL, browDrop: on('browsdown') ? BROW_DROP : 0 })],
  ['forehead', () => foreheadPass(doc)],
  ['agepaint', () => agePaintPass(doc)],
  ['mouthinside', () => mouthInsidePass(doc)],
  ['locks', () => locksPass(doc)],
  ['hairvolume', () => hairVolumePass(doc)],
  ['partline', () => partLinePass(doc)],
  ['hairsoft', () => hairSoftPass(doc, { peak: 0.8, pw: 2.2, band: 0.007 })],
  ['cloth', () => clothPass(doc, CLOTH)],
  ['hoodside', () => hoodSidePass(doc)],
  ['fit', () => fitPass(doc)],
  ['hoodienormals', () => hoodieNormalsPass(doc)],
  ['bust', () => bustPass(doc)],
  ['bustsoft', () => bustSoftPass(doc)],
  ['bustmap', () => bustMapPass(doc)],
  ['bustapex', async () => await bustApexPass(doc)],
  ['apexweld', () => apexWeldPass(doc)],
  ['apexlow', async () => await bustApexPass(doc, { seed: [0.103, 1.17], r: 0.045, shrink: 40, taubin: 30, flat: false })],
  ['apexclean', () => apexCleanPass(doc)],
  ['hoodflat', () => hoodPass(doc)],
  ['cordshang', () => cordsPass(doc)],
  ['cordsshort', () => cordsShortPass(doc)],
  ['fingers', () => fingerPass(doc, { slim: 0.08 })],
  ['eyes', () => eyesPass(doc)],
  ['iris', () => irisPass(doc)],
  ['teeth', () => teethPass(doc)],
  ['cords', () => cordsTeethPass(doc)],
];
for (const [k, f] of steps) if (on(k)) { const t = Date.now(); await f(); console.log('step', k, ((Date.now() - t) / 1000).toFixed(1), 's'); }
const glb = await write(doc, src); fs.writeFileSync(OUT, glb); console.log(OUT, (glb.length / 1048576).toFixed(2), 'MB');
