// Hand-built Mr. Board (Jensen Heist: Mog City's Mr. Big after New York, now collecting board seats out west): Mog City's
// Mr. Big (public/storykit/cast/mogcity/mrbig.glb, the cast's A bar, never changed) with what his study gives him at
// runtime baked in, so a story's cutscene and his headshot have them (Mog City's runner draws the GLB as it is):
//  eyes    wet (clearcoat), the irises a dark brown with fibres (the old boss's irisPass; Mr. Big's read dark red)
//  teeth   two rows and a tongue at his lips (Pedro's pass, scripts/handbuilt/pedro/build.mjs)
//  glasses his heavy dark tortoiseshell rectangles (the layout of Mog City's wagmi/mission/mrbig.js, frames.mjs), rigid
//          on the head bone
//  tie     the burgundy stripe re-dyed a boardroom grey (each texel's own light kept; no logo, no pattern added)
// Face, silver hair and beard, suit, rig, his own ten clips, texture sizes: Mr. Big's.
//   node scripts/handbuilt/board/build.mjs [out.glb] [--only=eyes,...] [--skip=...]
import fs from 'node:fs';
import { read, write, matOf, rgba, setWebp } from '../young-hero/glb.mjs';
import { eyesPass } from '../young-hero/look.mjs';
import { irisPass } from '../old-boss/eyes.mjs';
import { teethPass } from '../pedro/build.mjs';
import { framesPass } from '../frames.mjs';
import { flatFrontPass } from '../jensen-cast/castpass.mjs';
import { posturePass, bodyMaskPass, tailorPass } from '../jensen-cast/castpass2.mjs';
import { flatFront3Pass, flatGate } from '../jensen-cast/castpass3.mjs';
import { slimDoc } from '../jensen-cast/slim.mjs';
import { plumbClipsPass, bakeRestPass, levelArmaturePass } from '../jensen-cast/plumb.mjs';

const ROOT = new URL('../../../', import.meta.url).pathname;
const SRC = ROOT + 'public/storykit/cast/mogcity/mrbig.glb', DIR = ROOT + 'storykit/handbuilt/board/';

// the tie: every clearly red texel in the tie's rectangle of the suit's uv (350..446 x 60..206 of 1024, as John's) (the burgundy and its stripes) mapped to a cool mid grey by its own lightness, so the
// weave and the stripe keep their light and dark; the white collar and the navy suit are not red and are left alone
export async function tiePass(doc, K = {}) {
  K = { grey: [0.5, 0.52, 0.56], gain: 1.15, ...K };
  const m = matOf(doc, 'clothes'), t = m.getBaseColorTexture(), { data, w, h } = await rgba(t); let n = 0;
  const k = w / 1024; for (let i = 0; i < w * h; i++) { const tx = i % w, ty = (i - tx) / w; if (tx < 350 * k || tx >= 446 * k || ty < 60 * k || ty >= 206 * k) continue; const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2], red = r - Math.max(g, b);
    if (red < 10 || r < 24) continue; const a = Math.min(1, (red - 10) / 16), L = Math.min(255, (0.55 * r + 0.3 * g + 0.15 * b) * K.gain);
    for (let c = 0; c < 3; c++) data[i * 4 + c] = Math.round(data[i * 4 + c] * (1 - a) + L * K.grey[c] * 1.6 * a); n++; }
  await setWebp(t, data, w, h, 92); console.log('tie: texels', n);
}

if (import.meta.url === 'file://' + process.argv[1]) {
  const args = process.argv.slice(2), OUT = args.find((a) => !a.startsWith('--')) || DIR + 'board.glb';
  const only = args.find((a) => a.startsWith('--only='))?.slice(7).split(','), skip = new Set(args.find((a) => a.startsWith('--skip='))?.slice(7).split(',') || []);
  const on = (k) => (!only || only.includes(k)) && !skip.has(k);
  const { doc, src } = await read(SRC);
  const steps = [['eyes', () => eyesPass(doc)], ['iris', () => irisPass(doc, { base: [86, 56, 36] })], ['teeth', () => teethPass(doc)],
    // (cast round 3, the critic: clear glasses: a fine dark gunmetal frame, the lenses clear (no white glare panes or glints))
    ['glasses', () => { framesPass(doc, { style: 'acetate', T: 0.0034, D: 0.0045, BH: 0.002, col: [0.09, 0.085, 0.08], metal: 0.6, rough: 0.35, glint: 0 });
      // (no lens panes: clear glass is no glass in the game (the panes' shadow greyed the eyes, Jensen's iteration 2))
      for (const p of doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives())) if (/^(lenses|lens-edges|lens-glints)$/.test(p.getMaterial()?.getName() || '')) { const m = p.getMaterial(); p.listParents().filter((x) => x.propertyType === 'Mesh').forEach((x) => x.removePrimitive(p)); p.dispose(); if (!m.listParents().some((x) => x.propertyType === 'Primitive')) m.dispose(); } }], ['tie', () => tiePass(doc)],
    // (Jensen Heist cast round 2, the owner's standing rules: the suit's front flat from the sternum to the belt (no belly),
    // the skin drawn in under it, and the rest correction under his clips (the head and shoulders back to the plumb line))
    ['flat', () => flatFrontPass(doc, { max: 0.08, depth: 0.12, waist: 0.12, beltMax: 0.04, yb: 0.93, xIn: 0.13, xOut: 0.19 })], ['mask', () => bodyMaskPass(doc)],
    // (cast round 3, the critic: "fix Mr. Board first": his rest pose and his standing clips put on the plumb line frame by
    // frame (plumb.mjs: the ankle under the hip, the knees straight, the shoulders over the hips, the head over the
    // shoulders, the chin's line kept), in place of round 2's mesh correction; then the flat front on the plumb rest pose
    // (castpass3.mjs: the suit's belly drawn back onto the sternum-belt line), the skin drawn in under it, and the gate)
    ['level', () => levelArmaturePass(doc)], ['plumb', () => plumbClipsPass(doc, JSON.parse(process.env.JC_PLUMB || '{}'))], ['bakerest', () => bakeRestPass(doc, 'idle', 0)],
    // (the critic: "remove the shoulder humps that appear in the call-tile pose": the suit's shoulders taken in to the arm)
    ['tailor', () => tailorPass(doc, { mats: /^clothes$/, ease: 0.01, x0: 0.14, drop: 0.14, k: 0.16, ...JSON.parse(process.env.JC_TAILOR || '{}') })],
    ['flat3', () => { flatFront3Pass(doc, { xIn: 0.13, xOut: 0.2, d1: 0.06, d2: 0.14, below: 0.14, bUp: 0.03 }); bodyMaskPass(doc); }],
    ['gate', () => flatGate(doc, 'board', { bUp: 0.03 })]];
  for (const [k, f] of steps) if (on(k)) { const t = Date.now(); await f(); console.log('step', k, ((Date.now() - t) / 1000).toFixed(1), 's'); }
  fs.mkdirSync(DIR, { recursive: true });
  if (on('slim')) console.log('slim:', await slimDoc(doc));
  const glb = await write(doc, src, { ownTRS: on('level') || on('plumb') || on('bakerest') }); fs.writeFileSync(OUT, glb); console.log(OUT, glb.length, 'bytes', (glb.length / 1048576).toFixed(2), 'MB');
}
