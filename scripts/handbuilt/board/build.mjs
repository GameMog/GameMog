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
import { read, write, matOf, rgba, setWebp, io } from '../young-hero/glb.mjs';
import { chestWeightPass, flatFront5Pass, seatUprightPass, rulesGate, mouthTamePass, innerMouthPass } from '../jensen-cast/castpass5.mjs';
import { eyesPass } from '../young-hero/look.mjs';
import { irisPass } from '../old-boss/eyes.mjs';
import { teethPass } from '../pedro/build.mjs';
import { framesPass } from '../frames.mjs';
import { flatFrontPass } from '../jensen-cast/castpass.mjs';
import { posturePass, bodyMaskPass, tailorPass } from '../jensen-cast/castpass2.mjs';
import { flatFront3Pass, flatGate } from '../jensen-cast/castpass3.mjs';
import { slimDoc } from '../jensen-cast/slim.mjs';
import { plumbClipsPass, bakeRestPass, levelArmaturePass } from '../jensen-cast/plumb.mjs';
import { faceRigPass } from '../jensen-cast/castpass.mjs';
import { eyeTamePass, beardCardsPass, beardMorphsPass, seatClipsPass, seatedGate } from '../jensen-cast/castpass4.mjs';

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
  // (rules round 1: his trousers' belt sits 3 cm over his hip joints, not 7: the rule's belt there (rules.mjs trunkLevels))
  doc.getRoot().setExtras({ ...(doc.getRoot().getExtras() || {}), rules: { beltUp: 0.03 } });
  const steps = [['eyes', () => eyesPass(doc)], ['iris', () => irisPass(doc, { base: [86, 56, 36] })], ['teeth', () => teethPass(doc)],
    // (cast round 3, the critic: clear glasses: a fine dark gunmetal frame, the lenses clear (no white glare panes or glints))
    // (cast round 4, the critic: "a genuinely thin dark frame": the rims 2.2 mm (were 3.4 plus a 1.2 mm bevel), a near-black
    // satin with no metal (the 0.6 metal read as a thick silver frame under the study's key))
    ['glasses', () => { framesPass(doc, { style: 'acetate', T: 0.0022, D: 0.0032, bevel: 0.0005, BH: 0.0016, armH: 0.0036, armW: 0.0018, col: [0.012, 0.011, 0.011], metal: 0, rough: 0.32, glint: 0 });
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
    ['tailor', () => tailorPass(doc, { mats: /^clothes$/, ease: 0.008, x0: 0.13, drop: 0.14, k: 0.3, ...JSON.parse(process.env.JC_TAILOR || '{}') })],
    ['flat3', () => { flatFront3Pass(doc, { lean: 0.02, xIn: 0.21, xOut: 0.3, d1: 0.06, d2: 0.14, below: 0.17, lowEase: 0.03, legW: 0.93, bUp: 0.03 }); bodyMaskPass(doc); }], // (cast round 4: on down to the crotch)
    ['gate', () => flatGate(doc, 'board', { bUp: 0.03, below: 0.1 })], // (his belt sits 3 cm over the hips: the band 10 cm under it, to the trousers' fly seam)
    // (cast round 4, the critic: his visemes rendered and checked: the cast's baked face targets (castpass.mjs faceRigPass:
    // blinks, jaw, the 15 visemes, smiles, brows; his skin is MakeHuman's, mapped by uv), the beard as short dense cards that
    // open with the jaw, the eyes' washout tamed; the pack's sit clips as his own with the slump halved, measured seated)
    ['eyes4', () => eyeTamePass(doc, {})], // (rules round 1, the critic: "steel-wool noise: a soft, groomed grey beard": the cards one soft grey with little spread,
    // no dark roots, finer and laid flatter; the shell under them blurred to an even grey (no speckle))
    ['beard', () => beardCardsPass(doc, { col: 0.3, tint: [1.0, 0.99, 0.97], root: 0.93, salt: 0, lift: 0.0004, len: [0.004, 0.007], w: [0.0010, 0.0016], fine: 1, under: 0.95, shell: { blur: 5, col: [0.27, 0.265, 0.26], k: 0.75 }, ...JSON.parse(process.env.JC_BEARD || '{}') })],
    ['face', async () => { await faceRigPass(doc, {}); /* (the tongue in the open visemes a muted dark rose, not a lit red) */ doc.getRoot().listMaterials().find((m) => m.getName() === 'teethLow')?.setBaseColorFactor([0.32, 0.22, 0.21, 1]); }], ['beardmorphs', () => beardMorphsPass(doc)],
    // (rules round 1, the critic: "his cartoon-red inner mouth": the gums, the tongue and the cavity a muted dark rose, after the face's cavity is painted)
    ['mouth', async () => { await mouthTamePass(doc, { col: [0.2, 0.09, 0.085], max: 0.55 }); await innerMouthPass(doc); }],
    // (rules round 1: the owner's hard rules measured and held (jensen-cast/rules.mjs, castpass5.mjs): his chest's front off
    // the arms' weights (wider: a broad chest), the suit's front on the straight sternum-belt line, the skin under it; his
    // seat clips solved upright (the pack's sit hunched his rig 14 cm head-forward: his upper spine, neck and shoulders
    // taken to his own idle's turns, then the chest and the ears solved over the hips and the shoulders); the gate)
    ['rules', () => { chestWeightPass(doc, { xOut: 0.2 }); flatFront5Pass(doc); bodyMaskPass(doc); }],
    ['seat', async () => { await seatClipsPass(doc, { k: 0.5 }); if (on('rules')) seatUprightPass(doc, { pack: await io.read(ROOT + 'public/storykit/cast/cast-clips.glb'), clav: 1, unflex: { spine05: 1, spine04: 1, spine03: 1, spine02: 1, spine01: 1, neck01: 1, neck02: 1, neck03: 1 }, ...JSON.parse(process.env.JC_UPRIGHT || '{}') }); await seatedGate(doc, 'board'); }],
    ['rulesgate', async () => rulesGate(doc, 'board', await io.read(ROOT + 'public/storykit/cast/cast-clips.glb'), { hard: true })]];
  for (const [k, f] of steps) if (on(k)) { const t = Date.now(); await f(); console.log('step', k, ((Date.now() - t) / 1000).toFixed(1), 's'); }
  fs.mkdirSync(DIR, { recursive: true });
  if (on('slim')) console.log('slim:', await slimDoc(doc));
  const glb = await write(doc, src, { ownTRS: on('level') || on('plumb') || on('bakerest') }); fs.writeFileSync(OUT, glb); console.log(OUT, glb.length, 'bytes', (glb.length / 1048576).toFixed(2), 'MB');
}
