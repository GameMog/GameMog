// Mog City's locomotion pack (assets/anim/loco-walk.glb): Dan's walk replaced (wagmi/retarget.js loadLoco).
// The walk: Tripo's "walk" preset (the owner's paid Tripo account, its auto-rig of Mandi: a Mixamo-style 65-bone rig)
// retargeted onto Dan's 66 bones (xrig.mjs: global deltas against the two binds, each limb swung to match; the hips'
// travel taken out, leg-scaled), arms and all, with a modest fore-and-aft arm swing put on against the legs (hybrid.mjs
// swingArms): Tripo's upright, straight-legged stride, its relaxed arms close to the body.
// Compared Nov 25 against Dan's walk and Quaternius UAL1/UAL2 (CC0; its walk, jog, sprint and idle stoop and bend the
// knees and elbows: not used). Strips: GameMog/Mandi/review/motion-*-v2.png.
//   FORGE_TOOLBOX_DIR=<glTF toolbox> node tools/loco/build.mjs <tripo-walk.glb> [out]
import { loadRig } from './rig.mjs';
import { retargetClip } from './xrig.mjs';
import { writePack } from './packwrite.mjs';
import { swingArms } from './hybrid.mjs';
import { natural } from './natural.mjs';
const [TR, OUT = new URL('../../assets/anim/loco-walk.glb', import.meta.url).pathname] = process.argv.slice(2);
const dan = await loadRig(new URL('../../assets/characters/dan.glb', import.meta.url).pathname, { uprightArmature: true });
const tr = await retargetClip(dan, TR, 'mixamo', 'walk', { outName: 'walk' });
// (Tripo's arms with a swing put on: forward 15 deg at the peak, 10 deg more elbow; the back swing pulled 6 deg in, so the
// hands never go past the back line. Dan's arms on Tripo's stride (v2) swung 38 cm behind it: rejected Nov 25)
const hy = { clip: swingArms(dan, tr.clip, { amp: 15, back: -6, elbow: 10 }), strikes: null };
const speed = +natural(dan, hy.clip).toFixed(4);
await writePack(OUT, [{ name: 'walk', clip: hy.clip }], { loco: { clips: ['walk'], speed: { walk: speed }, travel: { walk: +tr.speed.toFixed(4) },
  from: { walk: 'Tripo AI animation preset "walk" (generated on the owner\'s paid Tripo account; Tripo\'s terms: paid-plan output is the user\'s, commercial use allowed), with a procedural arm swing' } } });
console.log(JSON.stringify({ out: OUT, speed, travel: tr.speed, strikes: hy.strikes }));
