// Mog City's locomotion pack (assets/anim/loco-walk.glb): Tripo AI's animation presets (the owner's paid Tripo account,
// its auto-rig of Mandi: a Mixamo-style 65-bone rig) retargeted onto Dan's 66 bones (xrig.mjs: global deltas against the
// two binds, each limb swung to match; the hips' travel taken out, leg-scaled), in place of Dan's clips by name
// (wagmi/retarget.js loadLoco) or beside them:
//   walk       Tripo's walk, its relaxed arms with a modest swing put on (hybrid.mjs swingArms; Dan's arms on its stride
//              swung behind the back, rejected Nov 25)
//   run        Tripo's run, one stride, its seam spread over the cycle (a lean, pumping run; Dan's was crouched)
//   idle       Tripo's idle (15 s: breathing, weight shifts; Dan's stood stiff, hands crossed in front)
//   idleLook   Tripo's look_around (an ambient idle)
//   swagger    Tripo's swagger, one stride: a walk style (a cast entry's walk: 'swagger', Mandi's)
//   phoneCall  Tripo's make_a_call_01's upper body (it sits) over the idle's legs: on foot, the phone at the ear
// Compared Nov 25 with Dan's clips and Quaternius UAL1/UAL2 (CC0: they stoop; not used). turn (a crouched turn-and-look,
// not a clean turn in place), standing_relax (wide-legged) and box_01 (a boxer's bounce) were not taken.
// Strips: GameMog/Mandi/review/motion-*-v2/v3/v4.png.
//   FORGE_TOOLBOX_DIR=<glTF toolbox> node tools/loco/build.mjs <tripo-walk.glb> <tripo-anims9.glb> [out]
import { loadRig } from './rig.mjs';
import { retargetClip } from './xrig.mjs';
import { writePack } from './packwrite.mjs';
import { swingArms, strikes, upperOver } from './hybrid.mjs';
import { natural } from './natural.mjs';
const [TW, T9, OUT = new URL('../../assets/anim/loco-walk.glb', import.meta.url).pathname] = process.argv.slice(2);
const dan = await loadRig(new URL('../../assets/characters/dan.glb', import.meta.url).pathname, { uprightArmature: true });
const one = async (f, c, name) => { const r0 = await retargetClip(dan, f, 'mixamo', c); const st = strikes(dan, r0.clip); return retargetClip(dan, f, 'mixamo', c, { from: st[0], to: st[st.length - 1], loop: true, outName: name }); };
const walk = await retargetClip(dan, TW, 'mixamo', 'walk', { outName: 'walk' });
walk.clip = swingArms(dan, walk.clip, { amp: 15, back: -6, elbow: 10 });
const run = await one(T9, 'run', 'run'), swagger = await one(T9, 'swagger', 'swagger');
const idle = await retargetClip(dan, T9, 'mixamo', 'idle', { outName: 'idle', loop: true });
const look = await retargetClip(dan, T9, 'mixamo', 'look_around', { outName: 'idleLook', loop: true });
const call = await retargetClip(dan, T9, 'mixamo', 'make_a_call_01', { outName: 'phoneCall', loop: true });
const phone = { name: 'phoneCall', clip: upperOver(idle.clip, call.clip) };
const clips = [walk, run, idle, { name: 'idleLook', clip: look.clip }, swagger, phone];
const speed = Object.fromEntries([walk, run, swagger].map((r) => [r.name, +natural(dan, r.clip).toFixed(4)]));
const T = 'Tripo AI animation preset (generated on the owner\'s paid Tripo account; Tripo\'s terms: paid-plan output is the user\'s, commercial use allowed)';
await writePack(OUT, clips.map((r) => ({ name: r.name, clip: r.clip })), { loco: { clips: clips.map((r) => r.name), speed,
  // (the gaits by speed with this pack in: no jog of its own, the walk blends straight into the run)
  gaits: ['idle', 'walk', 'run', 'sprint'],
  from: { walk: T + ' "walk", with a procedural arm swing', run: T + ' "run"', idle: T + ' "idle"', idleLook: T + ' "look_around"', swagger: T + ' "swagger"', phoneCall: T + ' "make_a_call_01" (upper body) over "idle"' } } });
console.log(JSON.stringify({ out: OUT, speed, durs: Object.fromEntries(clips.map((r) => [r.name, +r.clip.dur.toFixed(3)])) }));
