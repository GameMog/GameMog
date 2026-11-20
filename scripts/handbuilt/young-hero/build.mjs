// Hand-built young hero: the hand passes applied, in order, to the forge round-8 copy (r8-forged.glb, never changed).
//   node scripts/handbuilt/young-hero/build.mjs [out.glb] [--only=skin,hair,...] [--skip=...]
import fs from 'node:fs';
import { daylightSkinPass } from '../daylight.mjs';
import { read, write, rgba, matOf } from './glb.mjs';
import { paintSkin } from './skin.mjs';
import { shellHairPass } from './hair.mjs';
import { fingerPass, stubblePass, faceShapePass, cordsShoesPass, hoodSidePass, denimPass } from './p2.mjs';
import { hairPass, jeansPass, hoodiePass, eyesPass, armsPass, shoesPass, sizePass, fitPass, hoodRimPass, teethPass, facePass } from './look.mjs';
const DIR = new URL('../../../storykit/handbuilt/young-hero/', import.meta.url).pathname;
const args = process.argv.slice(2), OUT = args.find((a) => !a.startsWith('--')) || DIR + 'young-hero.glb';
const only = args.find((a) => a.startsWith('--only='))?.slice(7).split(','), skip = new Set(args.find((a) => a.startsWith('--skip='))?.slice(7).split(',') || []);
const on = (k) => (!only || only.includes(k)) && !skip.has(k);
// pass 3 (after the pass-2 review): the hands 24% under the neck's tone, not 7% (they read pale peach
// against a dark face under the key light); the front hairline waved, rounded and thinned (it read as a swim cap); the
// curls' tips lighter (the crown kept its coil under the key); the drawcords a dark heather grey (bright stripes)
const P3 = { skin: { handTone: +(process.env.HT || 0.76) }, hair: { front: 1, base: [24, 17, 12], tip: [76, 53, 36] }, cords: { cord: [0.075, 0.072, 0.07], spec: 0.1 } };
const { doc, src } = await read(DIR + 'r8-forged.glb');
const scalpSrc = await rgba(matOf(doc, 'skin').getBaseColorTexture());
const steps = [['face', () => facePass(doc)], ['faceshape', () => faceShapePass(doc)], ['fingers', () => fingerPass(doc)], ['skin', () => paintSkin(doc, P3.skin)], ['shells', () => shellHairPass(doc, { src: scalpSrc, ...P3.hair })], ['stubble', () => stubblePass(doc)], ['cords', () => cordsShoesPass(doc, P3.cords)], ['hoodside', () => hoodSidePass(doc)], ['jeans', () => jeansPass(doc)], ['denim', () => denimPass(doc)], ['hoodie', () => hoodiePass(doc)], ['eyes', () => eyesPass(doc)], ['arms', () => armsPass(doc, 6)], ['fit', () => fitPass(doc)], ['hoodrim', () => hoodRimPass(doc)], ['teeth', () => teethPass(doc)], ['shoes', () => shoesPass(doc)], ['size', () => sizePass(doc)],
  // (the daylight skin pass, last: he plays Teddy in Pickup Time's midday sun; scripts/handbuilt/daylight.mjs)
  ['daylight', () => daylightSkinPass(doc, {})]];
for (const [k, f] of steps) if (on(k)) { const t = Date.now(); await f(); console.log('step', k, ((Date.now() - t) / 1000).toFixed(1), 's'); }
const glb = await write(doc, src); fs.writeFileSync(OUT, glb); console.log(OUT, (glb.length / 1048576).toFixed(2), 'MB');
