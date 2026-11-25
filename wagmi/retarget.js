// Mog City: Dan's clips on another body of his rig (a forged person, a hand-built one), retargeted to that body's own
// rest. Every forged body has Dan's 66 bone names and his bones' frames, but its joints were refit to its own body
// (the forge's post step, a scan wrapped round the base): its bind pose is not his. Measured (Nov 25), each limb's
// segment in its bone's own frame, against Dan's: Mandi's upper arms 17 deg off his, Jay's 14-16, the hand-built
// cast's 3-7 (forearms up to 10). Copied as they are, Dan's local turns hold that error on every frame: the arm hangs
// forward and out of the shoulder (the owner's "walking like a zombie", the scarecrow arms), the forearm with it.
// Two things put right, once per body (cached on its GLTF):
//  1. per bone, the turn c that swings the body's bind segment (the joint to its end, in the bone's own bind frame)
//     onto Dan's, for the arms' and the legs' long bones; every rotation key becomes c_parent^-1 * q * c_own, so each
//     of those segments points where Dan's does on every frame (q_target = R_target_rest * inverse(R_source_rest) *
//     q_source, in the bone's frame). Spine and shoulder girdle are left as built (their differences are the body's
//     shape, not a pose: measured, matching them made the spine's overall line worse);
//  2. the root's travel scaled by leg length (the forge's rootScale): Dan's hips are 0.95-1.0 m up; on Mandi's
//     shorter legs his height left her soles 22 cm off the street in the idle (Lola 14, Marge 15, Jay 7).
// A heavier body's upper arms carried out from its sides (the forge's armSplay, asset extras) as the forge's studio
// does, so a wide body's arms clear its hips.
//   import { danOn } from './retarget.js';
//   const { clips, legRatio } = danOn(THREE, danGltf, bodyGltf, danClips);
// legRatio: the body's leg over Dan's: a gait's capture speed times it is the speed its feet stay planted at.
// Off with ?retarget=0 (the clips as they were, for comparison).

// Dan's gaits and the speed each was captured at on his legs (m/s; wagmi/game.js GAITS): a body walked along a path at
// v plays its gait at v / (speed x its legRatio), so its planted foot stays put (sets.js, runner.js walks)
export const GAIT_SPEED = Object.freeze({ walk: 1.4796, jog: 2.9654, run: 3.8326, sprint: 5.2867 });
// (a gait's speed with the locomotion pack's in: its walk's own)
export const gaitSpeed = (clip) => LOCO?.speed?.[clip] ?? GAIT_SPEED[clip];
export function gaitPace(clip, v, legRatio = 1) { const sp = gaitSpeed(clip); return sp && v > 0 ? Math.max(0.6, Math.min(1.6, v / (sp * (legRatio || 1)))) : 1; }

// The locomotion pack (assets/anim/loco-walk.glb, tools/loco/build.mjs): Dan's walk replaced, for him and every body on
// his clips. Compared Nov 25 (GameMog/Mandi/review/motion-*-v2.png): Tripo's "walk" preset stands tall on straight legs
// at the heel strike where Dan's (Bandai walk_normal) walks crouched and leaning, but its arms barely swing and stand
// out; Quaternius UAL's walk, jog, sprint and idle stoop. The walk is Tripo's, its relaxed arms kept close to the body
// with a modest swing put on against the legs (Dan's arms on its stride swung behind the back: rejected); jog, run,
// sprint and idle stay Dan's. Its speed (the planted foot's, on
// his legs) travels in its extras (loco.speed). loadLoco(loadGLB) once before Dan's clips are read; ?gait=classic: off
export const LOCO_URL = 'assets/anim/loco-walk.glb';
// the gaits by speed: the pack's list (no jog of its own: the walk blends straight into the run), else Dan's
export const gaitNames = () => LOCO?.gaits || ['idle', 'walk', 'jog', 'run', 'sprint'];
// a walk style: a cast entry's walk naming one of these plays it as their walk (Mandi's sheet: posture.walk 'swagger');
// any other name (walk, walkCool, walkHeavy, jog: older sheets) is their walk as before
export const WALK_STYLES = new Set(['swagger']);
const styledCache = new WeakMap();
export function walkStyled(THREE, clips, style) {
  if (!style || !WALK_STYLES.has(style)) return clips;
  let per = styledCache.get(clips); if (!per) styledCache.set(clips, (per = new Map()));
  if (!per.has(style)) { const st = clips.find((c) => c.name === style); per.set(style, st ? clips.map((c) => { if (c.name !== 'walk') return c; const k = st.clone(); k.name = 'walk'; return k; }) : clips); }
  return per.get(style);
}
export const walkSpeedOf = (style) => (style && WALK_STYLES.has(style) && LOCO?.speed?.[style]) || gaitSpeed('walk');
let LOCO = null, locoP = null;
export function loadLoco(loadGLB) {
  if (!gaitOn()) return Promise.resolve(null);
  return (locoP ||= loadGLB(LOCO_URL).then((g) => { const x = g.parser?.json?.asset?.extras?.loco || {}; LOCO = { clips: g.animations, speed: x.speed || {}, gaits: Array.isArray(x.gaits) ? x.gaits : null }; return LOCO; }, (err) => { console.warn('[retarget] loco', err); return null; }));
}

// the long bones and the joint each one points at
export const LIMB_ENDS = Object.freeze({
  upperarm01_L: 'lowerarm01_L', upperarm02_L: 'lowerarm01_L', lowerarm01_L: 'wrist_L', lowerarm02_L: 'wrist_L',
  upperarm01_R: 'lowerarm01_R', upperarm02_R: 'lowerarm01_R', lowerarm01_R: 'wrist_R', lowerarm02_R: 'wrist_R',
  upperleg01_L: 'lowerleg01_L', upperleg02_L: 'lowerleg01_L', lowerleg01_L: 'foot_L', lowerleg02_L: 'foot_L',
  upperleg01_R: 'lowerleg01_R', upperleg02_R: 'lowerleg01_R', lowerleg01_R: 'foot_R', lowerleg02_R: 'foot_R',
});
const LEG = ['upperleg01_L', 'upperleg02_L', 'lowerleg01_L', 'lowerleg02_L', 'foot_L'];
// past this a segment's difference is not a pose difference (a different make of rig): left alone
const MAX_DEG = 45;

export const retargetOn = () => { try { return new URLSearchParams(globalThis.location?.search || '').get('retarget') !== '0'; } catch { return true; } };

// a skinned body's bind pose by bone name: { p, q } (the joint's bind transform, from its skin's inverse binds), and the
// bones' rest by name (parent bone's name, rest translation)
export function rigOf(THREE, root) {
  let sk = null;
  root.traverse((o) => { if (!sk && o.isSkinnedMesh && o.skeleton?.bones.some((b) => b.name === 'upperarm01_L')) sk = o.skeleton; });
  if (!sk) return null;
  const bind = new Map(), bones = new Map(), m = new THREE.Matrix4(), s = new THREE.Vector3();
  sk.bones.forEach((b, i) => {
    if (bind.has(b.name)) return;
    m.copy(sk.boneInverses[i]).invert();
    const p = new THREE.Vector3(), q = new THREE.Quaternion(); m.decompose(p, q, s);
    bind.set(b.name, { p, q });
  });
  root.traverse((o) => {
    if (!o.isBone || bones.has(o.name)) return;
    let p = o.parent; while (p && !p.isBone) p = p.parent; // (past a node between: armhang_L / _R, levelled by pack.js unhang)
    bones.set(o.name, { parent: p ? p.name : null, t: o.position.clone() });
  });
  return { bind, bones };
}

// per bone, the turn (in its bind frame) that puts the target's segment where the source's is: { name: Quaternion }
export function restCorrections(THREE, src, dst, ends = LIMB_ENDS) {
  const corr = {}, deg = {};
  for (const [k, e] of Object.entries(ends)) {
    const s0 = src.bind.get(k), s1 = src.bind.get(e), d0 = dst.bind.get(k), d1 = dst.bind.get(e);
    if (!s0 || !s1 || !d0 || !d1) continue;
    const es = s1.p.clone().sub(s0.p).applyQuaternion(s0.q.clone().invert()).normalize();
    const ed = d1.p.clone().sub(d0.p).applyQuaternion(d0.q.clone().invert()).normalize();
    const a = (es.angleTo(ed) * 180) / Math.PI; deg[k] = Math.round(a * 10) / 10;
    if (a < 0.5 || a > MAX_DEG) continue;
    corr[k] = new THREE.Quaternion().setFromUnitVectors(ed, es);
  }
  return { corr, deg };
}

// the leg, root to the foot, in the frame's units (the rest translations: as the forge's post step measures it)
export function legOf(rig) { let y = 0; for (const n of LEG) { const b = rig.bones.get(n); if (!b) return 0; y += b.t.length(); } return y; }

// clips with their rotation keys retargeted (corr), the root's travel scaled (rootScale) and the upper arms carried out
// (splay, deg, in the shoulder's frame as the forge's clips-runtime.mjs does it): new clips, the old ones untouched
export function retargetClips(THREE, clips, { corr = {}, parentOf = () => null, rootScale = 1, splay = 0 } = {}) {
  const I = new THREE.Quaternion(), q = new THREE.Quaternion(), Z = new THREE.Vector3(0, 0, 1);
  const sq = { L: new THREE.Quaternion().setFromAxisAngle(Z, (splay * Math.PI) / 180), R: new THREE.Quaternion().setFromAxisAngle(Z, (-splay * Math.PI) / 180) };
  return clips.map((clip) => {
    const k = clip.clone();
    for (const t of k.tracks) {
      const dot = t.name.lastIndexOf('.'), bone = t.name.slice(0, dot), path = t.name.slice(dot + 1);
      if (path === 'position' && bone === 'root' && rootScale !== 1) { t.values = Float32Array.from(t.values, (x) => x * rootScale); continue; }
      if (path !== 'quaternion') continue;
      const own = corr[bone], par = corr[parentOf(bone)], side = splay ? /^upperarm01_(L|R)$/.exec(bone)?.[1] : null;
      if (!own && !par && !side) continue;
      const pre = par ? par.clone().invert() : I.clone(); if (side) pre.premultiply(sq[side]);
      const post = own || I, v = Float32Array.from(t.values);
      for (let i = 0; i < v.length; i += 4) q.fromArray(v, i).premultiply(pre).multiply(post).toArray(v, i);
      t.values = v;
    }
    return k;
  });
}

// Dan's walk carries his arms out: measured over the cycle, his wrists 31 cm from his centre line against 22 at idle,
// the forearms flared 20 deg out of the upper arms (the scarecrow the owner saw, on Dan too; walkCool, another take,
// 24 cm and 10). Per gait, his upper arms and forearms are swung in toward his sides about his forward axis on every
// key (deg; the fore-and-aft swing kept): HANG. The jog, run and sprint carry the arms bent and across, as runners do.
export const HANG = Object.freeze({ walk: [3, 10], walkF: [3, 10], walkHeavy: [2, 8], drunkWalk: [2, 6] });
const ARM_CHAIN = ['root', 'spine05', 'spine04', 'spine03', 'spine02', 'spine01'];
export function hangArms(THREE, clips, hang = HANG) {
  const Z = new THREE.Vector3(0, 0, 1), q = new THREE.Quaternion();
  return clips.map((clip) => {
    const h = hang[clip.name]; if (!h) return clip;
    const k = clip.clone(), tr = new Map(k.tracks.filter((t) => t.name.endsWith('.quaternion')).map((t) => [t.name.slice(0, -11), t]));
    const at = (n, t, out) => { const x = tr.get(n); return x ? out.fromArray(x.createInterpolant().evaluate(t)) : out.identity(); };
    for (const s of ['L', 'R']) {
      const ua = tr.get('upperarm01_' + s), fa = tr.get('lowerarm01_' + s); if (!ua || !fa) continue;
      const sg = s === 'L' ? -1 : 1, R1 = new THREE.Quaternion().setFromAxisAngle(Z, (sg * h[0] * Math.PI) / 180), R2 = new THREE.Quaternion().setFromAxisAngle(Z, (sg * h[1] * Math.PI) / 180);
      const chain = [...ARM_CHAIN, 'clavicle_' + s, 'shoulder01_' + s];
      const world = (names, t) => { const w = new THREE.Quaternion(); for (const n of names) w.multiply(at(n, t, q)); return w; };
      const uaV = Float32Array.from(ua.values), faV = Float32Array.from(fa.values);
      // (the upper arm: its world turn swung by R1; the forearm by R2 more, under the swung upper arm)
      for (let i = 0; i < ua.times.length; i++) { const t = ua.times[i], Wp = world(chain, t), L = new THREE.Quaternion().fromArray(ua.values, i * 4);
        Wp.clone().invert().multiply(R1).multiply(Wp).multiply(L).toArray(uaV, i * 4); }
      for (let i = 0; i < fa.times.length; i++) { const t = fa.times[i], Wsh = world(chain, t), Lua = at('upperarm01_' + s, t, new THREE.Quaternion()), Lu2 = at('upperarm02_' + s, t, new THREE.Quaternion());
        const Wfa = Wsh.clone().multiply(Lua).multiply(Lu2).multiply(new THREE.Quaternion().fromArray(fa.values, i * 4));
        const Wu2n = R1.clone().multiply(Wsh).multiply(Lua).multiply(Lu2); // (the swung upper arm's twist bone, the forearm's parent)
        Wu2n.invert().multiply(R2).multiply(R1).multiply(Wfa).toArray(faV, i * 4); }
      ua.values = uaV; fa.values = faV;
    }
    return k;
  });
}
const hung = new WeakMap();
// Dan's clips with HANG on them (cached per clip list); ?gait=classic: as they were
export function danClips(THREE, clips) {
  if (!gaitOn()) return clips;
  if (!hung.has(clips)) { let out = clips;
    // (the locomotion pack's clips in place of his by name, then his walks' arms hung in)
    if (LOCO) { const by = new Map(LOCO.clips.map((c) => [c.name, c])), have = new Set(out.map((c) => c.name)); out = [...out.map((c) => by.get(c.name) || c), ...LOCO.clips.filter((c) => !have.has(c.name))]; }
    try { out = hangArms(THREE, out); } catch (err) { console.warn('[retarget] hang', err); } hung.set(clips, out); }
  return hung.get(clips);
}
export const gaitOn = () => { try { return new URLSearchParams(globalThis.location?.search || '').get('gait') !== 'classic'; } catch { return true; } };

// Dan's clips for a body (cached per body and clip list). danGltf: dan.glb as loaded; bodyGltf: the body's GLTF.
const cache = new WeakMap(), rigs = new WeakMap();
const rigCached = (THREE, g) => { if (!rigs.has(g)) rigs.set(g, rigOf(THREE, g.scene)); return rigs.get(g); };
export function danOn(THREE, danGltf, bodyGltf, clips = danClips(THREE, danGltf.animations)) {
  let per = cache.get(bodyGltf); if (!per) cache.set(bodyGltf, (per = new WeakMap()));
  if (per.has(clips)) return per.get(clips);
  let out = { clips, legRatio: 1, rootScale: 1, deg: {}, on: false };
  try {
    const src = rigCached(THREE, danGltf), dst = rigCached(THREE, bodyGltf);
    if (src && dst && retargetOn()) {
      const { corr, deg } = restCorrections(THREE, src, dst);
      const legS = legOf(src), legD = legOf(dst), rootScale = legS && legD ? legD / legS : 1;
      // (the frame's scale: the legs in metres, for the gaits' speeds)
      const sc = (g) => { const a = g.scene.getObjectByName('root')?.parent; return a && a !== g.scene ? a.scale.y : 1; };
      const legRatio = legS && legD ? (legD * sc(bodyGltf)) / (legS * sc(danGltf)) : 1;
      const splay = Number(bodyGltf.parser?.json?.asset?.extras?.forge?.post?.clips?.armSplay ?? bodyGltf.parser?.json?.asset?.extras?.forge?.landmarks?.armSplay ?? 0) || 0;
      const parentOf = (n) => dst.bones.get(n)?.parent || null;
      out = { clips: retargetClips(THREE, clips, { corr, parentOf, rootScale, splay: Math.max(0, Math.min(12, splay)) }), legRatio, rootScale, deg, on: true };
    }
  } catch (err) { console.warn('[retarget]', err); }
  per.set(clips, out);
  return out;
}
