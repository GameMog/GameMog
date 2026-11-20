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
import { skinTonePass, flatFrontPass, faceRigPass } from './castpass.mjs';
// (cast round 1, the owner's standing rules: each person's natural skin tone (sRGB, the cheek under neutral light: varied
// across the cast, never chalky or orange) and their hair regroomed as alpha cards (groom.mjs); JC_SKIP=a,b leaves passes out)
// (the tone is the face's median in the texture: Jensen's reads ~150,104,78 there and plays a natural light-medium warm)
const ROUND1 = {
  marge: { tone: [186, 124, 98] }, lola: { tone: [122, 82, 62], groom: false }, nico: { tone: [156, 108, 82] }, wesley: { tone: [174, 114, 86] }, dex: { tone: [182, 120, 96] },
  'intern-a': { tone: [96, 60, 42] }, 'intern-b': { tone: [178, 122, 96], groom: false }, 'director-a': { tone: [182, 120, 102] }, 'director-b': { tone: [130, 86, 62] },
};
const SKIP = new Set((process.env.JC_SKIP || '').split(',').filter(Boolean));
const DIR = new URL('../../../storykit/handbuilt/jensen-cast/', import.meta.url).pathname, OUTDIR = process.env.JC_OUT || DIR;
const want = process.argv[2]?.split(',');
const env = await nodeEnv(); await loadFaceKit(env);
const IRIS = { 'dark-brown': [52, 36, 26], brown: [86, 58, 38], hazel: [110, 86, 52], blue: [70, 96, 126], 'grey-blue': [92, 104, 116] };
for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith('.sheet.json')).sort()) {
  const S = JSON.parse(fs.readFileSync(DIR + f, 'utf8')); if (want && !want.includes(S.id)) continue;
  const t0 = Date.now(), { cfg, log } = compile(S);
  if (S.identity.body === 'male') { cfg.shoulder = 0.76; cfg.slope = { ...(cfg.slope || {}), drop: 0.015 }; }
  const logs = [], env1 = { ...env, log: (...a) => logs.push(a.join(' ')) };
  const a = await core(cfg, env1), b = await post(a.glb, a.lm, env1), glb0 = await diet(b.glb, env1);
  const src = Buffer.from(glb0), doc = await io.readBinary(src); doc.setLogger({ debug() {}, info() {}, warn() {}, error: console.error });
  eyesPass(doc); await irisPass(doc, { base: IRIS[S.face.eyes] || IRIS.brown }); fingerPass(doc, { slim: 0.06 });
  // (the pack's jeans are a light stone-wash whatever the sheet's colour: a dark rinse at the sheet's colour, Jensen's pass)
  if (/jeans/.test(S.wardrobe.bottom.item)) { const c = S.wardrobe.bottom.color.match(/\w\w/g).map((x) => parseInt(x, 16)); await jeansPass(doc, { tgt: c }); }
  await daylightSkinPass(doc, {});
  const R1 = ROUND1[S.id] || {};
  if (!SKIP.has('flat')) flatFrontPass(doc, R1.flat);
  if (!SKIP.has('tone') && R1.tone) await skinTonePass(doc, R1.tone, R1.toneK);
  // (the two ponytails keep the forge's own cut this round: the 'tie' groom read spiky and see-through, worse than the cut)
  if (!SKIP.has('groom') && R1.groom !== false) await groomPass(doc, S.hair.style, { greying: S.hair.greying || 0, ...R1.groom });
  // (the headset over the new hair's outer surface, before the face's targets: it rides the skin's mesh)
  if (S.id === 'marge') headsetPass(doc);
  if (!SKIP.has('face')) await faceRigPass(doc, R1.face || {});
  const out = await write(doc, src); fs.writeFileSync(OUTDIR + S.id + '.glb', out);
  console.log(S.id, (out.length / 1048576).toFixed(2), 'MB', ((Date.now() - t0) / 1000).toFixed(1), 's', (log || []).filter((l) => /left off|guard|cap/.test(l)).join(' | '));
}
