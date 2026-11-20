// Jensen Heist's forged supporting cast (all invented people, no real likeness): each sheet in
// storykit/handbuilt/jensen-cast/ forged in Node with the forge's own modules (scripts/forge is not changed), Mr. Big's
// shoulder fix on the men (the arm joints in along the clavicles, a little more slope: no pad look, as John's base), then
// the light finish every hand-built person gets: wet eyes, the iris pass (no black-hole irises), the fingers slimmed, the
// daylight skin pass (the story plays in sun), and the jeans a dark rinse at the sheet's colour. Marge's headset is baked onto her head bone (headset.mjs: props are never
// drawn in game).
// Cast round 1 (19 Nov, the owner's standing rules): the garment front flat sternum to belt, each person's natural skin
// tone with the hands matched to the face (castpass.mjs), the hair regroomed as alpha cards (groom.mjs), baked face
// targets with symmetric visemes and a dark mouth cavity (castpass.mjs). Marge's top a black work jacket (full sleeves),
// Lola's apron (a flat white slab) left off.
// Cast round 2 (19 Nov, the critic on round 1; castpass2.mjs): the forge's own cut shipped wherever the card groom was not
// cleaner (Marge's recoloured a dark salt-and-pepper), every jacket's skin drawn in under it (no shards), Dex's open zip
// showing a grey undershirt, Director Navy's buzz and beard painted as fine strands (no popcorn shells), Nico's jacket
// shoulders taken in, a stronger flat front, the tones set against a neutral-light render, and a rest-pose correction under
// the shared clips (posture 'auto': the shoulders over the hips, the ears over the shoulders, the chin kept level). Faces,
// hair styles and wardrobe (role-specific bottoms and shoes) are in the sheets.
//   node scripts/handbuilt/jensen-cast/forge.mjs [id,id,...]      -> storykit/handbuilt/jensen-cast/<id>.glb
//   (JC_OUT=<dir>/ writes there instead; JC_SKIP=flat,tone,groom,face,teethrigid leaves those passes out)
import fs from 'node:fs';
import { nodeEnv } from '../../forge/env-node.mjs';
import { compile } from '../../forge/compile.mjs';
import { core } from '../../forge/core.mjs';
import { post } from '../../forge/post.mjs';
import { diet } from '../../forge/diet.mjs';
import { loadFaceKit } from '../../forge/targets.mjs';
import { io, write } from '../young-hero/glb.mjs';
import { eyesPass } from '../young-hero/look.mjs';
import { fingerPass } from '../young-hero/p2.mjs';
import { irisPass } from '../old-boss/eyes.mjs';
import { daylightSkinPass } from '../daylight.mjs';
import { headsetPass } from './headset.mjs';
import { jeansPass } from '../jensen/wear.mjs';
import { groomPass } from './groom.mjs';
import { strandGroomPass } from './strandgroom.mjs';
import { flatFront3Pass, flatGate, layerMaskPass } from './castpass3.mjs';
import { slimDoc } from './slim.mjs';
import { faceShapePass, eyeTamePass, dyePass, seatClipsPass, seatedGate } from './castpass4.mjs';
import { skinTonePass, flatFrontPass, faceRigPass } from './castpass.mjs';
import { hairBasePass, bodyMaskPass, undershirtPass, posturePass, stubblePaintPass, tailorPass } from './castpass2.mjs';
// (cast round 1, the owner's standing rules: each person's natural skin tone (sRGB, the cheek under neutral light: varied
// across the cast, never chalky or orange) and their hair regroomed as alpha cards (groom.mjs); JC_SKIP=a,b leaves passes out)
// (the tone is the face's median in the texture: Jensen's reads ~150,104,78 there and plays a natural light-medium warm)
const ROUND1 = {
  marge: { tone: [186, 124, 98] }, lola: { tone: [122, 82, 62], groom: false }, nico: { tone: [156, 108, 82] }, wesley: { tone: [174, 114, 86] }, dex: { tone: [182, 120, 96] },
  'intern-a': { tone: [96, 60, 42] }, 'intern-b': { tone: [178, 122, 96], groom: false }, 'director-a': { tone: [182, 120, 102] }, 'director-b': { tone: [130, 86, 62] },
};
// Cast round 2 (the critic on round 1): per person, over ROUND1. hairBase: the forge's cut kept and recoloured (no card
// groom where the cards were not cleaner than it); flat: a stronger flat front; under: the undershirt's colour on the torso
const ROUND2 = {
  // (the tones set against a neutral-light render of the face (r2/tone.py): Jensen's renders 156,108,87 there)
  lola: { tone: [103, 73, 57] }, nico: { tone: [154, 107, 82], groom: false, tailor: { k: 0.18 } }, wesley: { tone: [141, 100, 80], groom: false }, dex: { tone: [175, 125, 102], groom: false, under: [118, 120, 126], underK: { vneck: /^puffer-collar$/ } },
  'intern-a': { tone: [94, 59, 41] }, 'intern-b': { tone: [132, 93, 73] }, 'director-a': { tone: [174, 125, 110], groom: false }, 'director-b': { tone: [134, 92, 70], stubble: { col: [28, 25, 24], grey: [120, 116, 110], salt: 0.3, scalp: 0.85 } },
  marge: { tone: [161, 119, 103], groom: false, hairBase: { dark: [24, 23, 22], light: [86, 83, 80], salt: 0.34 }, flat: { max: 0.04, depth: 0.07, waist: 0.14 } },
};
for (const [k, v] of Object.entries(ROUND2)) ROUND1[k] = { ...ROUND1[k], ...v };
// Cast round 3 (the critic on round 2; strandgroom.mjs, castpass3.mjs): strand: the shared strand-card groom in place of the
// forge's cut (the style, the hair's colour sRGB, its grey and greying, the forehead's hairline height over the eyes)
const ROUND3 = {
  marge: { strand: { style: 'bob', col: [50, 45, 41], grey: [132, 130, 127], greying: 0.38 } },
  lola: { strand: { style: 'long', col: [27, 23, 21], grey: [118, 116, 113], greying: 0.18 } },
  nico: { strand: { style: 'side-part', col: [50, 38, 30], grey: [118, 114, 108], greying: 0.22, seed: 23 } },
  dex: { strand: { style: 'side-part', col: [56, 41, 30], grey: [118, 114, 108], greying: 0, seed: 31, part: [-0.42, 0.88, 0.2] } },
  'director-a': { strand: { style: 'side-part', col: [96, 95, 94], grey: [156, 155, 153], greying: 0.6, seed: 41, hf: 0.072, hl: { recede: 0.012 } } },
  'intern-b': { strand: { style: 'ponytail', col: [25, 21, 20], grey: [90, 88, 86], greying: 0, seed: 53 } },
  wesley: { strand: { style: 'short-curly', col: [112, 80, 54], grey: [120, 116, 110], greying: 0, seed: 61 } },

};
// (age: the forge's age blend raised for the face only (Marge reads 57, Nico 47); drop: garment parts taken off (the
// Directors' shattered lapel overlay, Intern Two's spiky collar band); under/underK: Dex's tee as a crew neck; stubble:
// Navy's beard carried onto the lip and chin ring (a lip ellipse eased, not cut) in softer strokes; tone: by the render)
const R3X = {
  marge: { age: 0.1 }, nico: { age: 0.08, tone: [150, 110, 90] }, lola: { tone: [98, 72, 60] }, wesley: { tone: [156, 114, 90] },
  dex: { tone: [178, 134, 108], under: [70, 72, 76], underK: { crew: { dip: 0.022, rib: 0.008, ribK: 0.72 } } },
  'intern-b': { tone: [156, 112, 84], recolor: { mat: 'uniform-collar', col: [0.105, 0.165, 0.34] }, under: [138, 160, 202], underK: { top: -0.014, crew: { dip: 0.012, rib: 0.012, ribK: 0.78 } } },
  'director-a': { drop: /^suit-(lapels|collar)$/, layer: {} }, 'director-b': { drop: /^suit-(lapels|collar)$/, layer: {}, stubble: { col: [28, 25, 24], grey: [120, 116, 110], salt: 0.3, scalp: 0.85, lips: [0.024, 0.0075], soft: 0.75 } },
};
for (const [k, v] of Object.entries(ROUND3)) ROUND1[k] = { ...ROUND1[k], ...v };
for (const [k, v] of Object.entries(R3X)) ROUND1[k] = { ...ROUND1[k], ...v };
// Cast round 4 (the critic on round 3; castpass4.mjs and the groom's knobs): strand4: over the round-3 groom (no grey cast:
// greying and the tip's highlight 0 except Marge and Grey; each person's own root-to-tip colour; a lower specular (no wet
// look); finer, narrower cards and more of them; Lola's layers past the shoulders; Intern Two's full tapered tail);
// shape: MakeHuman modifier targets baked into the face (Nico's cheek, brow and jaw relief; Dex and Intern Two out of the
// teen look); dye: a garment's colour by the render; flat3: the flat front carried from the belt down to the crotch;
// seat: the pack's sit clips carried as the body's own with the slump halved (the call tile's seated front)
const FINE = { nMul: 1.45, wMul: 0.72, spec: 0.3, hi: 0 };
const DARK = (u, v, d, i) => d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2] < 3 * 46;
const MH = (n, w, both = true) => (both ? [['cheek/l-' + n, w], ['cheek/r-' + n, w]] : [[n, w]]);
const R4 = {
  marge: { strand4: { ...FINE, hi: 0.03, spec: 0.38, rise: 0.04 }, tone: [160, 120, 92], eyes: {} },
  lola: { strand4: { ...FINE, nMul: 1.15, seg: 6, col: [22, 18, 16], greying: 0, len: [0.42, 0.38, 0.46], lenFront: 0.3, endY: -0.42 }, dye: [[/^western(-hem|-collar)?$/, [116, 54, 42]]] },
  nico: { strand4: { ...FINE, col: [62, 45, 33], greying: 0 }, shape: [...MH('cheek-bones-incr', 0.6), ...MH('cheek-volume-decr', 0.45), ['chin/chin-bones-incr', 0.45, 0], ['eyebrows/eyebrows-trans-forward', 0.6], ['chin/chin-prominent-incr', 0.3]], eyes: {} },
  wesley: { strand4: { ...FINE, col: [100, 70, 47], greying: 0 } },
  dex: { strand4: { ...FINE, col: [44, 32, 24], greying: 0 }, age: 0.06, shape: [...MH('cheek-volume-decr', 0.5), ...MH('cheek-bones-incr', 0.3), ['chin/chin-bones-incr', 0.4], ['chin/chin-prominent-incr', 0.45]], eyes: {},
    dye: [[/^puffer(-hem|-collar)?$/, [30, 36, 60]], [/^clothes$/, [52, 53, 56]]] },
  'intern-a': { eyes: {} },
  'intern-b': { strand4: { ...FINE, col: [20, 17, 16], greying: 0, tail: { n: 1100, len: 0.3, r: 0.024, swell: 0.6, w: 1.05, taper: 0.62 } }, tone: [150, 110, 80], age: 0.05, shape: [...MH('cheek-volume-decr', 0.45), ['chin/chin-bones-incr', 0.2], ['chin/chin-prominent-incr', 0.3]] },
  // (the Directors: the suit a smooth worsted (its knit's contrast taken down) in each one's colour; the black inner jacket
  // of the suit under it (the slab in the V) dyed the suit's colour, so the V reads shirt, tie and lapel; Navy's padded
  // shoulder crest taken in; Navy's beard thinned off the lips (the vermilion clear))
  'director-a': { flat3: { below: 0.2 }, strand4: { ...FINE, hi: 0.03, spec: 0.38 }, eyes: {}, dye: [[/^suit(-hem|-collar|-lapels)?$/, [118, 120, 124], { contrast: 0.45 }], [/^clothes$/, [112, 114, 118], { only: DARK }]] },
  'director-b': { flat3: { below: 0.2 }, eyes: {}, dye: [[/^suit(-hem|-collar|-lapels)?$/, [36, 46, 80], { contrast: 0.45 }], [/^clothes$/, [34, 44, 76], { only: DARK }]], tailor: { k: 0.3, mats: /^suit(-hem|-collar|-lapels)?$/, x0: 0.13, ease: 0.008 },
    stubble: { col: [28, 25, 24], grey: [120, 116, 110], salt: 0.3, scalp: 0.85, lips: [0.03, 0.0125], lipFade: 1.9, lipThin: 0.45, soft: 0.75 } },
};
for (const [k, v] of Object.entries(R4)) { const o = ROUND1[k] || {}; ROUND1[k] = { ...o, ...v, strand: o.strand && v.strand4 ? { ...o.strand, ...v.strand4 } : o.strand, age: (o.age || 0) + (v.age || 0) || undefined };
  ROUND1[k].flat3 = { below: 0.15, lowEase: 0.03, xLowIn: 0.07, xLowOut: 0.11, ...(o.flat3 || {}), ...(v.flat3 || {}) }; ROUND1[k].seat = ROUND1[k].seat ?? { k: 0.5 }; }
const SKIP = new Set((process.env.JC_SKIP || '').split(',').filter(Boolean));
const DIR = new URL('../../../storykit/handbuilt/jensen-cast/', import.meta.url).pathname, OUTDIR = process.env.JC_OUT || DIR;
const want = process.argv[2]?.split(',');
const env = await nodeEnv(); await loadFaceKit(env);
const IRIS = { 'dark-brown': [52, 36, 26], brown: [86, 58, 38], hazel: [110, 86, 52], blue: [70, 96, 126], 'grey-blue': [92, 104, 116] };
for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith('.sheet.json')).sort()) {
  const S = JSON.parse(fs.readFileSync(DIR + f, 'utf8')); if (want && !want.includes(S.id)) continue;
  const t0 = Date.now(), { cfg, log } = compile(S);
  if (ROUND1[S.id]?.age) cfg.age = Math.min(0.9, cfg.age + ROUND1[S.id].age);
  if (S.identity.body === 'male') { cfg.shoulder = 0.76; cfg.slope = { ...(cfg.slope || {}), drop: 0.015 }; }
  const logs = [], env1 = { ...env, log: (...a) => logs.push(a.join(' ')) };
  const a = await core(cfg, env1), b = await post(a.glb, a.lm, env1), glb0 = await diet(b.glb, env1);
  const src = Buffer.from(glb0), doc = await io.readBinary(src); doc.setLogger({ debug() {}, info() {}, warn() {}, error: console.error });
  eyesPass(doc); await irisPass(doc, { base: IRIS[S.face.eyes] || IRIS.brown }); fingerPass(doc, { slim: 0.06 });
  // (the pack's jeans are a light stone-wash whatever the sheet's colour: a dark rinse at the sheet's colour, Jensen's pass)
  if (/jeans/.test(S.wardrobe.bottom.item)) { const c = S.wardrobe.bottom.color.match(/\w\w/g).map((x) => parseInt(x, 16)); await jeansPass(doc, { tgt: c }); }
  await daylightSkinPass(doc, {});
  const R1 = ROUND1[S.id] || {};
  if (R1.shape && !SKIP.has('shape')) faceShapePass(doc, R1.shape);
  if (!SKIP.has('eyes4')) await eyeTamePass(doc, R1.eyes || {});
  if (R1.dye && !SKIP.has('dye')) for (const [re, col, k] of R1.dye) await dyePass(doc, re, col, k);
  if (!SKIP.has('flat')) flatFrontPass(doc, R1.flat);
  if (!SKIP.has('tone') && R1.tone) await skinTonePass(doc, R1.tone, R1.toneK);
  // (the two ponytails keep the forge's own cut this round: the 'tie' groom read spiky and see-through, worse than the cut)
  if (R1.tailor && !SKIP.has('tailor')) tailorPass(doc, R1.tailor);
  if (R1.drop && !SKIP.has('drop')) for (const p of doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives())) if (R1.drop.test(p.getMaterial()?.getName() || '')) {
    // (its triangles reduced to one empty one: the node and its mesh stay (the node order is the forge's), nothing is drawn)
    p.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint16Array([0, 0, 0])).setBuffer(doc.getRoot().listBuffers()[0])); console.log('drop:', p.getMaterial().getName()); }
  if (!SKIP.has('mask')) bodyMaskPass(doc, R1.mask);
  if (R1.layer && !SKIP.has('layer')) layerMaskPass(doc, R1.layer);
  // (Intern Two: her black collar band's spikes read as a jagged black ruff: the band dyed the jacket's own blue, plain)
  if (R1.recolor) { const m = doc.getRoot().listMaterials().find((x) => x.getName() === R1.recolor.mat); if (m) { m.setBaseColorTexture(null).setBaseColorFactor([...R1.recolor.col, 1]); console.log('recolor:', R1.recolor.mat); } }
  if (R1.under) await undershirtPass(doc, R1.under, R1.underK);
  if (R1.stubble) await stubblePaintPass(doc, R1.stubble);
  const ST = process.env.JC_STRAND ? { ...R1.strand, ...JSON.parse(process.env.JC_STRAND) } : R1.strand;
  if (ST && !SKIP.has('strand')) await strandGroomPass(doc, ST);
  else if (R1.hairBase && !SKIP.has('hairbase')) await hairBasePass(doc, R1.hairBase);
  if (!ST && !SKIP.has('groom') && (R1.groom !== false || process.env.JC_CARDS)) await groomPass(doc, S.hair.style, { greying: S.hair.greying || 0, ...R1.groom, ...(process.env.JC_CARDS ? JSON.parse(process.env.JC_CARDS) : {}) });
  // (the headset over the new hair's outer surface, before the face's targets: it rides the skin's mesh)
  if (S.id === 'marge') headsetPass(doc);
  if (!SKIP.has('face')) await faceRigPass(doc, R1.face || {});
  // (last: the rest correction carries the face's targets with the head)
  const PC = process.env.JC_POSTURE ? JSON.parse(process.env.JC_POSTURE) : (R1.posture ?? 'auto'); if (!SKIP.has('posture')) posturePass(doc, PC);
  // (cast round 3, rule 1 that lands: the flat front on the final rest pose, the skin drawn in under it again, then the gate:
  // the build fails if the garment's front stands more than 1 cm forward of the sternum-belt line, castpass3.mjs)
  if (!SKIP.has('flat3')) { flatFront3Pass(doc, R1.flat3); if (!SKIP.has('mask')) bodyMaskPass(doc, R1.mask); }
  flatGate(doc, S.id);
  if (R1.seat && !SKIP.has('seat')) { await seatClipsPass(doc, R1.seat); await seatedGate(doc, S.id); }
  // (cast round 3, blocker A: every body at most 6 MB: the lossless-looking diet last (slim.mjs))
  if (!SKIP.has('slim')) console.log('slim:', await slimDoc(doc));
  const out = await write(doc, src); if (out.length > 6 * 1048576) throw new Error(`${S.id}: ${(out.length / 1048576).toFixed(2)} MB is over the 6 MB body cap`); fs.writeFileSync(OUTDIR + S.id + '.glb', out);
  console.log(S.id, (out.length / 1048576).toFixed(2), 'MB', ((Date.now() - t0) / 1000).toFixed(1), 's', (log || []).filter((l) => /left off|guard|cap/.test(l)).join(' | '));
}
