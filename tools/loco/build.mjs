// Mog City's locomotion pack (assets/anim/loco-walk.glb): Dan's walk replaced (wagmi/retarget.js loadLoco).
// The walk: Tripo's "walk" preset (the owner's paid Tripo account, its auto-rig of Mandi: a Mixamo-style 65-bone rig)
// retargeted onto Dan's 66 bones (xrig.mjs: global deltas against the two binds, each limb swung to match; the hips'
// travel taken out, leg-scaled), its legs, hips, spine and head, under Dan's own walk's arms (Bandai Namco walk_normal)
// time-warped onto Tripo's stride, left heel strike to left heel strike (hybrid.mjs): Tripo's upright, straight-legged
// stride with a natural arm swing (Tripo's own arms barely swing and stand out from a wide body).
// Compared Nov 25 against Dan's walk and Quaternius UAL1/UAL2 (CC0; its walk, jog, sprint and idle stoop and bend the
// knees and elbows: not used). Strips: GameMog/Mandi/review/motion-*-v2.png.
//   FORGE_TOOLBOX_DIR=<glTF toolbox> node tools/loco/build.mjs <tripo-walk.glb> [out]
import { loadRig } from './rig.mjs';
import { retargetClip } from './xrig.mjs';
import { writePack } from './packwrite.mjs';
import { hybridWalk } from './hybrid.mjs';
import { natural } from './natural.mjs';
const [TR, OUT = new URL('../../assets/anim/loco-walk.glb', import.meta.url).pathname] = process.argv.slice(2);
const dan = await loadRig(new URL('../../assets/characters/dan.glb', import.meta.url).pathname, { uprightArmature: true });
const tr = await retargetClip(dan, TR, 'mixamo', 'walk', { outName: 'walk' });
const hy = hybridWalk(dan, tr.clip, dan.anims.walk);
const speed = +natural(dan, hy.clip).toFixed(4);
await writePack(OUT, [{ name: 'walk', clip: hy.clip }], { loco: { clips: ['walk'], speed: { walk: speed }, travel: { walk: +tr.speed.toFixed(4) },
  from: { walk: 'legs, hips, spine, head: Tripo AI animation preset "walk" (generated on the owner\'s paid Tripo account; Tripo\'s terms: paid-plan output is the user\'s, commercial use allowed); arms: Bandai Namco Research Motion Dataset walk_normal (CC BY-NC 4.0, as Dan\'s other clips)' } } });
console.log(JSON.stringify({ out: OUT, speed, travel: tr.speed, strikes: hy.strikes }));
