// Mog City: the Suits' clips, Dan's own retargeted onto thug.glb's rig by anatomical frames (joint positions on both
// rigs), written as the Suits' pack assets/anim/suits-dan.glb. node tools/retarget-suits.mjs [out.glb]
// (three from the GameMog checkout this one sits in, or GAMEMOG_DIR; no other dependency: the GLBs are read here, their
// meshopt-compressed clips decoded by three's own decoder, and the pack written as a plain GLB)
//
// 5 Nov 2026, the owner: "Why are these guys leaning instead of being vertical like Dan." Two faults of the 29 Oct build
// (.scratch/polish/round11/retarget), both fixed here:
//   - Dan's landmarks were read with dan.glb's armature turn still on (its node above 'root': ~11 deg forward, ~7 deg to
//     his left), a turn the game takes out of Dan (wagmi/game.js) but the retarget kept: every Suit clip copied Dan's
//     bones as they point under that turn, so every Suit stood ~12 deg off plumb, his hips 13 cm to the side and 22 cm
//     ahead of his feet, one foot's edge off the street. The turn is taken out here exactly as the game does.
//   - the head and feet (copied as a turn from a reference) were referred to Dan's node pose, which has his left leg
//     raised: the Suits' left toe stood 22 cm up. They are referred to Dan's standing idle's first frame (both feet flat
//     on the ground, as the rig's rest has them).
// LEGACY=1 builds the 29 Oct pack as it was (a check of this port).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
const MC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..') + '/';
const GM = process.env.GAMEMOG_DIR || path.resolve(MC, '..');
const req = createRequire(path.join(GM, 'package.json'));
const THREE = req('three');
const THREE_DIR = path.resolve(path.dirname(req.resolve('three')), '..');
const { MeshoptDecoder } = await import(pathToFileURL(path.join(THREE_DIR, 'examples/jsm/libs/meshopt_decoder.module.js')).href);
await MeshoptDecoder.ready;
const LEGACY = process.env.LEGACY === '1';
const OUT = process.argv[2] || MC + 'assets/anim/suits-dan.glb';
const HZ = 30, V3 = THREE.Vector3, Q4 = THREE.Quaternion, M4 = THREE.Matrix4;
const v = (x = 0, y = 0, z = 0) => new V3(x, y, z);

// ---- a GLB's JSON and its accessors (meshopt views decoded, normalized integers to floats)
function readGLB(file) {
  const b = fs.readFileSync(file), jl = b.readUInt32LE(12), j = JSON.parse(b.subarray(20, 20 + jl).toString('utf8'));
  const bl = b.readUInt32LE(20 + jl), bin = b.subarray(28 + jl, 28 + jl + bl), views = new Map();
  const view = (i) => {
    if (views.has(i)) return views.get(i);
    const bv = j.bufferViews[i], e = bv.extensions?.EXT_meshopt_compression; let r;
    if (e) { const src = new Uint8Array(bin.buffer, bin.byteOffset + (e.byteOffset || 0), e.byteLength), dst = new Uint8Array(e.count * e.byteStride); MeshoptDecoder.decodeGltfBuffer(dst, e.count, e.byteStride, src, e.mode, e.filter); r = { dv: new DataView(dst.buffer), stride: e.byteStride }; }
    else r = { dv: new DataView(bin.buffer, bin.byteOffset + (bv.byteOffset || 0), bv.byteLength), stride: bv.byteStride || 0 };
    views.set(i, r); return r;
  };
  const SZ = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }, N = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
  const acc = (i) => {
    const a = j.accessors[i], n = N[a.type], sz = SZ[a.componentType], { dv, stride } = view(a.bufferView), st = stride || n * sz, out = new Float32Array(a.count * n);
    for (let k = 0; k < a.count; k++) for (let q = 0; q < n; q++) {
      const o = (a.byteOffset || 0) + k * st + q * sz; let x;
      switch (a.componentType) { case 5126: x = dv.getFloat32(o, true); break; case 5122: x = dv.getInt16(o, true); if (a.normalized) x = Math.max(x / 32767, -1); break; case 5123: x = dv.getUint16(o, true); if (a.normalized) x /= 65535; break;
        case 5120: x = dv.getInt8(o); if (a.normalized) x = Math.max(x / 127, -1); break; case 5121: x = dv.getUint8(o); if (a.normalized) x /= 255; break; default: x = dv.getUint32(o, true); }
      out[k * n + q] = x;
    }
    return out;
  };
  return { j, acc };
}
// ---- rigs as bone-only Object3D trees (the GLB's scene), clips as three AnimationClips
function tree(G) {
  const map = new Map(), root = new THREE.Group(), byIdx = new Map(); let k = 0;
  const mk = (i, parent) => { const n = G.j.nodes[i], o = new THREE.Object3D(); o.name = n.name || ('_n' + (k++)); if (map.has(o.name)) o.name += '_' + (k++);
    if (n.translation) o.position.fromArray(n.translation); if (n.rotation) o.quaternion.fromArray(n.rotation); if (n.scale) o.scale.fromArray(n.scale);
    parent.add(o); map.set(o.name, o); byIdx.set(i, o); for (const c of n.children || []) mk(c, o); };
  for (const i of G.j.scenes[G.j.scene || 0].nodes) mk(i, root);
  root.updateMatrixWorld(true);
  const clips = {};
  for (const a of G.j.animations || []) {
    const tracks = [];
    for (const ch of a.channels) { const o = byIdx.get(ch.target.node); if (!o) continue; const s = a.samplers[ch.sampler], times = G.acc(s.input), vals = G.acc(s.output), p = ch.target.path;
      if (p === 'rotation') tracks.push(new THREE.QuaternionKeyframeTrack(o.name + '.quaternion', times, vals)); else if (p === 'translation') tracks.push(new THREE.VectorKeyframeTrack(o.name + '.position', times, vals)); else if (p === 'scale') tracks.push(new THREE.VectorKeyframeTrack(o.name + '.scale', times, vals)); }
    clips[a.name] = new THREE.AnimationClip(a.name, -1, tracks);
  }
  return { root, map, clips };
}
const T = tree(readGLB(MC + 'assets/characters/thug.glb')), D = tree(readGLB(MC + 'assets/characters/dan.glb'));
// (Dan's armature turn out, as the game takes it out of him: wagmi/game.js)
{ const arm = D.map.get('root')?.parent; if (!LEGACY && arm && arm !== D.root) { arm.quaternion.identity(); D.root.updateMatrixWorld(true); } }
const THUG_BONES = [...T.map.keys()].filter((n) => n !== 'ThugRig' && T.map.get(n).parent && isUnder(T.map.get(n), T.map.get('ThugRig')));
function isUnder(o, r) { for (let p = o.parent; p; p = p.parent) if (p === r) return true; return false; }
const packName = (n) => n.replace('.', '');

// ---- poses: world position + rotation of every named joint
const wp = (o) => o.getWorldPosition(new V3()), wq = (o) => o.getWorldQuaternion(new Q4());
function poseAt(R, clip, t) { R.mixer ??= new THREE.AnimationMixer(R.root); R.mixer.stopAllAction(); const a = R.mixer.clipAction(clip); a.setLoop(THREE.LoopOnce, 0); a.clampWhenFinished = true; a.play(); R.mixer.setTime(Math.max(0, Math.min(clip.duration - 1e-4, t))); R.root.updateMatrixWorld(true); }
const Tj = (n) => T.map.get(n), Dj = (n) => D.map.get(n);
// thug rest: world rotations/positions of the rest pose (the node tree)
T.root.updateMatrixWorld(true);
const REST = {}; for (const b of THUG_BONES) REST[b] = { p: wp(Tj(b)), q: wq(Tj(b)), ql: Tj(b).quaternion.clone(), pl: Tj(b).position.clone() };
const RIG_S = Tj('ThugRig').scale.x;

// ---- anatomical frames. frame(o, c, side) -> rotation (Matrix4): y = c - o, x = side projected, z = x cross y
function frame(o, c, side) { const y = c.clone().sub(o).normalize(); const x = side.clone().addScaledVector(y, -side.dot(y)); if (x.lengthSq() < 1e-8) x.copy(Math.abs(y.x) < 0.9 ? v(1, 0, 0) : v(0, 0, 1)).addScaledVector(y, -x.dot(y)); x.normalize(); const z = x.clone().cross(y); return new M4().makeBasis(x, y, z); }
// bend normal of a limb o->c->g, blended toward fb when near straight (fb must lie on the flexion side)
function bendSide(o, c, g, fb) { const a = c.clone().sub(o).normalize(), b = g.clone().sub(c).normalize(); const n = a.clone().cross(b); const s = n.length(); const w = Math.min(1, s / 0.22); if (s < 1e-6) return fb.clone().normalize(); n.divideScalar(s); if (fb.dot(n) < 0 && w < 0.999) { /* fallback on the wrong side: trust the bend alone */ return w > 0.3 ? n : fb.clone().normalize(); } return n.multiplyScalar(w).addScaledVector(fb, 1 - w).normalize(); }
const mid = (a, b) => a.clone().add(b).multiplyScalar(0.5);
const mat2q = (m) => new Q4().setFromRotationMatrix(m);

// landmark sets: a function of a sampled rig giving named joint positions/rotations (thug names) for both rigs
function land(R, dan) {
  const P = (n) => wp(R.map.get(n)), Q = (n) => wq(R.map.get(n));
  const N = dan ? { hips: 'root', hipL: 'upperleg01_L', hipR: 'upperleg01_R', kneeL: 'lowerleg01_L', kneeR: 'lowerleg01_R', ankL: 'foot_L', ankR: 'foot_R', sp0: 'spine05', sp1: 'spine04', sp2: 'spine03', sp3: 'spine01', neck: 'neck01', head: 'head', clavL: 'clavicle_L', clavR: 'clavicle_R', shL: 'upperarm01_L', shR: 'upperarm01_R', elL: 'lowerarm01_L', elR: 'lowerarm01_R', wrL: 'wrist_L', wrR: 'wrist_R' }
    : { hips: 'hips', hipL: 'thigh.L', hipR: 'thigh.R', kneeL: 'shin.L', kneeR: 'shin.R', ankL: 'foot.L', ankR: 'foot.R', sp0: 'spine', sp1: 'spine1', sp2: 'spine2', sp3: 'neck', neck: 'neck', head: 'head', clavL: 'shoulder.L', clavR: 'shoulder.R', shL: 'upperArm.L', shR: 'upperArm.R', elL: 'forearm.L', elR: 'forearm.R', wrL: 'hand.L', wrR: 'hand.R' };
  const L = {}; for (const [k, n] of Object.entries(N)) L[k] = P(n);
  L.q = { head: Q(N.head), footL: Q(N.ankL), footR: Q(N.ankR), hips: Q(N.hips), wrL: Q(N.wrL), wrR: Q(N.wrR) };
  const F = { thumb: 1, index: 2, middle: 3, ring: 4, pinky: 5 };
  for (const s of ['L', 'R']) for (const [f, i] of Object.entries(F)) for (const j of [1, 2, 3]) L[f + j + s] = P(dan ? `finger${i}-${j}_${s}` : `${f}${j}.${s}`);
  L.hipMid = mid(L.hipL, L.hipR); L.hipLine = L.hipL.clone().sub(L.hipR).normalize(); L.shLine = L.shL.clone().sub(L.shR).normalize();
  L.up = L.sp1.clone().sub(L.hipMid).normalize();
  return L;
}
// frames for every chain bone from a landmark set; a limb's fallback side = hinge axis from the rig's bone rotation
// (calibrated once at the rig's reference pose: the thug's rest, Dan's node pose, both bent enough to read)
function frames(L, cal) {
  const F = {};
  F['hips'] = frame(L.hipMid, L.sp1, L.hipLine);
  const sideAt = (k) => L.hipLine.clone().multiplyScalar(1 - k).addScaledVector(L.shLine, k).normalize();
  F['spine'] = frame(L.sp0, L.sp2, sideAt(0.33)); F['spine1'] = frame(L.sp1, L.sp3, sideAt(0.66)); F['spine2'] = frame(L.sp2, L.neck, sideAt(1)); F['neck'] = frame(L.neck, L.head, L.shLine);
  const chestUp = L.neck.clone().sub(L.sp2).normalize();
  for (const s of ['L', 'R']) {
    const sh = L['sh' + s], el = L['el' + s], wr = L['wr' + s], hip = L['hip' + s], kn = L['knee' + s], an = L['ank' + s];
    F['shoulder.' + s] = frame(L['clav' + s], sh, chestUp);
    const armSide = bendSide(sh, el, wr, cal ? cal['arm' + s] : v(1, 0, 0)), legSide = bendSide(hip, kn, an, cal ? cal['leg' + s] : v(1, 0, 0));
    F['upperArm.' + s] = frame(sh, el, armSide); F['forearm.' + s] = frame(el, wr, armSide);
    F['thigh.' + s] = frame(hip, kn, legSide); F['shin.' + s] = frame(kn, an, legSide);
    const hs = L['index1' + s].clone().sub(L['pinky1' + s]).normalize(); F['hand.' + s] = frame(wr, L['middle1' + s], hs);
    for (const f of ['thumb', 'index', 'middle', 'ring', 'pinky']) {
      const p1 = L[f + '1' + s], p2 = L[f + '2' + s], p3 = L[f + '3' + s]; const fb = cal ? cal[f + s] : hs;
      const sd = bendSide(p1, p2, p3, fb);
      F[f + '1.' + s] = frame(p1, p2, sd); F[f + '2.' + s] = frame(p2, p3, sd);
    }
  }
  F._sides = { armL: F['upperArm.L'].elements.slice(0, 3), armR: F['upperArm.R'].elements.slice(0, 3), legL: F['thigh.L'].elements.slice(0, 3), legR: F['thigh.R'].elements.slice(0, 3) };
  return F;
}
// calibration: the flexion-side hinge axis of each limb/finger in the bone's own frame, read at a bent reference pose
function calibrate(L, qOf) {
  const c = {};
  for (const s of ['L', 'R']) {
    const n = (o, m, g) => { const a = m.clone().sub(o).normalize(), b = g.clone().sub(m).normalize(); return a.cross(b).normalize(); };
    c['arm' + s] = { axis: n(L['sh' + s], L['el' + s], L['wr' + s]), q: qOf('arm', s) }; c['leg' + s] = { axis: n(L['hip' + s], L['knee' + s], L['ank' + s]), q: qOf('leg', s) };
    for (const f of ['thumb', 'index', 'middle', 'ring', 'pinky']) c[f + s] = { axis: n(L[f + '1' + s], L[f + '2' + s], L[f + '3' + s]), q: qOf('hand', s) };
    // (kept in the bone's local frame: world = q * local)
    for (const k of Object.keys(c)) if (k.endsWith(s) && !c[k].local) c[k].local = c[k].axis.clone().applyQuaternion(c[k].q.clone().invert());
  }
  return c;
}
const calWorld = (cal, qOf) => { const o = {}; for (const [k, c] of Object.entries(cal)) { const s = k.slice(-1), kind = k.startsWith('arm') ? 'arm' : k.startsWith('leg') ? 'leg' : 'hand'; o[k] = c.local.clone().applyQuaternion(qOf(kind, s)); } return o; };
const qOfT = (kind, s) => wq(Tj(kind === 'arm' ? 'upperArm.' + s : kind === 'leg' ? 'thigh.' + s : 'hand.' + s));
const qOfD = (kind, s) => wq(Dj(kind === 'arm' ? 'upperarm01_' + s : kind === 'leg' ? 'upperleg01_' + s : 'wrist_' + s));
// thug rest landmarks + calibration (rest bends: elbow 9 deg, knee 7, fingers 6: readable)
const LT = land(T, false), CT = calibrate(LT, qOfT), FT = frames(LT, calWorld(CT, qOfT));
// Dan's calibration at his node pose (elbows bent ~50 deg there)
D.root.updateMatrixWorld(true);
const LD0 = land(D, true), CD = calibrate(LD0, qOfD);
// sanity: the flexion sides agree in meaning (thug rest: elbow bends forward (+z), knee back (-z))
{ const chk = (o, m, g) => { const d = g.clone().sub(m); const a = m.clone().sub(o).normalize(); return d.addScaledVector(a, -d.dot(a)); };
  console.log('thug rest elbow bend dir', chk(LT.shL, LT.elL, LT.wrL).toArray().map((x) => +x.toFixed(3)), 'knee', chk(LT.hipL, LT.kneeL, LT.ankL).toArray().map((x) => +x.toFixed(3)));
  console.log('dan pose elbow bend dir', chk(LD0.shL, LD0.elL, LD0.wrL).toArray().map((x) => +x.toFixed(3)), 'knee', chk(LD0.hipL, LD0.kneeL, LD0.ankL).toArray().map((x) => +x.toFixed(3)));
  const l = (a, b) => a.distanceTo(b); console.log('leg len thug', (l(LT.hipL, LT.kneeL) + l(LT.kneeL, LT.ankL)).toFixed(3), 'dan', (l(LD0.hipL, LD0.kneeL) + l(LD0.kneeL, LD0.ankL)).toFixed(3)); }
const LEG_T = LT.hipL.distanceTo(LT.kneeL) + LT.kneeL.distanceTo(LT.ankL), LEG_D = LD0.hipL.distanceTo(LD0.kneeL) + LD0.kneeL.distanceTo(LD0.ankL), LEG_K = LEG_T / LEG_D;
// delta bones (head, feet): Dan's reference world rotation = his node pose's (the owner's upright Dan)
// (29 Oct this was Dan's node pose, his left leg raised: the Suits' left toe stood 22 cm up; now his standing idle's
// first frame, both feet flat on the ground as the thug's rest has them, and his head level)
const LREF = LEGACY ? LD0 : (poseAt(D, D.clips.idle, 0), land(D, true));
const REFQ = { head: LREF.q.head.clone(), footL: LREF.q.footL.clone(), footR: LREF.q.footR.clone() };
const GROUND = { ank: REST['foot.L'].p.y, toe: REST['toe.L'].p.y };
console.log('rest ankle y', GROUND.ank.toFixed(3), 'toe y', GROUND.toe.toFixed(3), 'hips', REST.hips.p.toArray().map((x) => +x.toFixed(3)), 'leg k', LEG_K.toFixed(3));


// ---- one retargeted frame: world rotations for every thug bone from Dan's landmarks at time t (already posed)
const CHAIN = Object.keys(FT).filter((k) => k !== '_sides');
function retargetPose(LD) {
  const FD = frames(LD, calWorld(CD, qOfD));
  const W = {};
  for (const b of CHAIN) W[b] = mat2q(FD[b].clone().multiply(FT[b].clone().invert())).multiply(REST[b].q);
  for (const [b, k] of [['head', 'head'], ['foot.L', 'footL'], ['foot.R', 'footR']]) W[b] = LD.q[k].clone().multiply(REFQ[k].clone().invert()).multiply(REST[b].q);
  return W;
}
const twistY = (q) => { const t = new Q4(0, q.y, 0, q.w); const l = Math.hypot(q.y, q.w); return l < 1e-6 ? new Q4() : new Q4(0, q.y / l, 0, q.w / l); };
const HAND_TW = { L: twistY(REST['hand.L'].ql), R: twistY(REST['hand.R'].ql) };
// world rotations -> local quaternions (parent by parent), helpers filled from the thug rig's own convention
function toLocal(W) {
  const Lq = {}, Wq = { ...W };
  const order = []; const walk = (o) => { if (THUG_BONES.includes(o.name)) order.push(o.name); for (const c of o.children) walk(c); }; walk(Tj('ThugRig'));
  for (const b of order) {
    const o = Tj(b), par = o.parent.name;
    if (!Wq[b]) { // helpers and leaves: keep rest local; toe: rest; last phalanx: copies the middle one's local
      if (/^(index|middle|ring|pinky|thumb)3\./.test(b)) Lq[b] = Lq[b.replace('3.', '2.')].clone();
      else Lq[b] = REST[b].ql.clone();
      Wq[b] = (par === 'ThugRig' ? new Q4() : Wq[par].clone()).multiply(Lq[b]); continue;
    }
    const pq = par === 'ThugRig' ? new Q4() : Wq[par]; Lq[b] = pq.clone().invert().multiply(Wq[b]);
  }
  for (const s of ['L', 'R']) {
    Lq['glute.' + s] = Lq['thigh.' + s].clone(); Lq['deltoid.' + s] = REST['deltoid.' + s].ql.clone().slerp(Lq['upperArm.' + s], 0.5);
    const rel = twistY(Lq['hand.' + s]).multiply(HAND_TW[s].clone().invert()); Lq['forearmTwist.' + s] = new Q4().slerp(rel, 0.5);
  }
  return Lq;
}
// ---- the thug posed from locals (for measuring feet, hands, errors)
function applyLocals(Lq, hips) { for (const b of THUG_BONES) { Tj(b).quaternion.copy(Lq[b]); Tj(b).position.copy(REST[b].pl); } Tj('hips').position.copy(hips); T.root.updateMatrixWorld(true); }

// ---- clips
const BLOWS = { thugPunch1: 0.33, thugPunch2: 0.20, thugKick: 0.30, bruteSlam: 0.57 };
const thugDur = (n) => T.clips[n].duration; // (the rig's own clips' lengths: the fight's hit times are on them)
const S = {
  // name: [dan clip, kind, options]
  suitIdle: ['idle', 'loop'], thugIdle: ['idle', 'loop', { phase: 0.5 }], suitWalk: ['walk', 'loco'], walk: ['walk', 'loco'], suitWalk2: ['walkCool', 'loco'], jog: ['jog', 'loco'],
  suitRun: ['run', 'loco'], run: ['run', 'loco'], sprint: ['sprint', 'loco'], suitDash: ['sprint', 'loco'], suitBack: ['walkBack', 'loco'], suitLeft: ['guardL', 'loco'], suitRight: ['guardR', 'loco'],
  suitIdleGuide: ['arms', 'once'], suitTauntBye: ['wave', 'once'], suitTauntByebye: ['shrug', 'once'], guard: ['guard', 'loop'],
  thugPunch1: ['jab', 'blow', { hand: true }], thugPunch2: ['cross', 'blow', { hand: true }], thugKick: ['ffKick', 'blow', { hand: false }], bruteSlam: ['hook', 'blow', { hand: true }],
  hitReact: ['hitChest', 'fit'], thugKnockdown: ['fall', 'down'], thugGetUp: ['getup', 'fit'], thugStumbleBack: ['ffDodge', 'fit'], thugStumbleLeft: ['ffDodgeSide', 'fit', { side: 'L' }], thugStumbleRight: ['ffDodgeSide', 'fit', { side: 'R' }],
};
const ROOT_MOTION = new Set(['thugStumbleBack', 'thugStumbleLeft', 'thugStumbleRight', 'thugKnockdown', 'thugGetUp']); // (= enemy.js's)
const report = { clips: {}, loco: {}, hits: {}, hang: {} };
// ---- the standing arms (29 Oct, the owner: "just make their arms straight up and down"): in the STANDING clips, per key,
// in the SUIT'S OWN BODY frame (the thug posed with the retargeted locals: up = hip midpoint -> neck, left = the shoulder
// line, fwd = left x up) each upper arm is set to hang straight down (HANG.upOut deg out, upFwd fwd) and each forearm
// straight down continuing it (foOut out, foFwd fwd), both sides mirrored exactly; the trunk, legs, hands and fingers
// stay as retargeted (the hands are set at load by combat/suitarms.js). The thug's frame, not Dan's: Dan's hip->neck
// line leans 7-9 deg forward in the world in his idle (his proportions), the thug's 0-2 deg, so a hang built in Dan's
// frame would put the Suit's hands 7 deg behind his hips. A forearm raised for a gesture (its lift from straight down
// past the gate, smoothstepped) keeps Dan's arm: suitIdleGuide's gesture has both forearms up (~102 deg) at every key,
// so it is left whole.
const HANG = { clips: new Set(['suitIdle', 'thugIdle', 'suitIdleGuide']), upOut: 2, upFwd: 0, foOut: 3, foFwd: 1, gate: [35, 60] };
function bodyFrame(L) { const up = L.neck.clone().sub(L.hipMid).normalize(); const left = L.shLine.clone().addScaledVector(up, -L.shLine.dot(up)).normalize(); const fwd = left.clone().cross(up).normalize(); return { up, left, fwd }; }
const D2R = Math.PI / 180, smooth = (x, a, b) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
if (Tj('ThugRig').quaternion.angleTo(new Q4()) > 1e-3) throw new Error('ThugRig is rotated: W is in its frame, the landmarks in the world');
// (the hinge: the elbow's flexion normal for an arm hanging with the elbow bending forward, (-up) x fwd = -left, the same
// world axis for both arms; the thug's rest frames were calibrated with that same cross product, checked below: 0.73 =
// cos 43 deg, the rest A-pose's tilt, since a hinge is square to its arm)
function hangArms(W, LT) {
  const { up, left, fwd } = bodyFrame(LT), hinge = left.clone().negate(), out = {}, ws = {};
  for (const s of ['L', 'R']) {
    const f = LT['wr' + s].clone().sub(LT['el' + s]).normalize(), lift = Math.acos(Math.max(-1, Math.min(1, -f.dot(up)))) / D2R;
    const w = 1 - smooth(lift, HANG.gate[0], HANG.gate[1]); ws[s] = { lift: +lift.toFixed(1), w: +w.toFixed(3) };
    if (w <= 0) continue;
    const o = left.clone().multiplyScalar(s === 'L' ? 1 : -1);
    const dir = (aOut, aFwd) => o.clone().multiplyScalar(Math.tan(aOut * D2R)).addScaledVector(fwd, Math.tan(aFwd * D2R)).sub(up).normalize();
    const FU = frame(v(), dir(HANG.upOut, HANG.upFwd), hinge), FF = frame(v(), dir(HANG.foOut, HANG.foFwd), hinge);
    for (const [b, F] of [['upperArm.' + s, FU], ['forearm.' + s, FF]]) { const q = mat2q(F.clone().multiply(FT[b].clone().invert())).multiply(REST[b].q); out[b] = w >= 1 ? q : W[b].clone().slerp(q, w); }
  }
  return { W: Object.keys(out).length ? { ...W, ...out } : null, ws };
}
{ const { left } = bodyFrame(LT); for (const s of ['L', 'R']) { const x = v().fromArray(FT['upperArm.' + s].elements.slice(0, 3)), xf = v().fromArray(FT['forearm.' + s].elements.slice(0, 3)); console.log(`hinge check ${s}: thug rest upperArm frame x . (-left) = ${(-x.dot(left)).toFixed(3)}, forearm ${(-xf.dot(left)).toFixed(3)} (want ~ +1)`); } }
function sampleDan(clipName, t) { poseAt(D, D.clips[clipName], t); return land(D, true); }
// Dan's contact moment: the striking hand's (or foot's) peak reach from the hip midpoint, in his facing direction
function contactTime(clipName, hand) {
  const c = D.clips[clipName]; let best = 0, bt = 0;
  for (let t = 0; t <= c.duration; t += 1 / 120) { const L = sampleDan(clipName, t); const fwd = v().crossVectors(L.hipLine, v(0, 1, 0)).normalize(); const ends = hand ? [L.wrL, L.wrR] : [L.ankL, L.ankR]; for (const e of ends) { const r = e.clone().sub(L.hipMid).dot(fwd) + e.clone().sub(L.hipMid).length() * 0.3; if (r > best) { best = r; bt = t; } } }
  return bt;
}
function downTime(clipName) { const c = D.clips[clipName]; const ys = []; for (let t = 0; t <= c.duration; t += 1 / 60) ys.push([t, sampleDan(clipName, t).hips.y]); const fin = ys[ys.length - 1][1]; for (const [t, y] of ys) if (y - fin < 0.05) return t; return c.duration; }
function mirrorQ(q) { return new Q4(q.x, -q.y, -q.z, q.w); }
function build(name, [danName, kind, opt = {}]) {
  const dc = D.clips[danName]; if (!dc) throw new Error('no dan clip ' + danName);
  const Dd = dc.duration; let dur = Dd, map = (t) => t;
  if (kind === 'blow') { const H = BLOWS[name], C = contactTime(danName, opt.hand); dur = thugDur(name); map = (t) => t <= H ? C * t / H : C + (Dd - C) * (t - H) / (dur - H); report.hits[name] = { danContact: +C.toFixed(3), at: H, danDur: +Dd.toFixed(3), dur: +dur.toFixed(3) }; }
  else if (kind === 'down') { const C = downTime(danName); dur = thugDur(name); map = (t) => t <= 0.8 ? C * t / 0.8 : C + (Dd - C) * (t - 0.8) / (dur - 0.8); report.hits[name] = { danDown: +C.toFixed(3), at: 0.8, dur }; }
  else if (kind === 'fit') { dur = thugDur(name); map = (t) => t * Dd / dur; }
  else if (opt.phase) map = (t) => (t + Dd * opt.phase) % Dd;
  const n = Math.max(2, Math.round(dur * HZ) + 1), times = new Float32Array(n), rows = [], hipsRows = [], feet = [];
  const mirror = opt.side === 'L';
  for (let i = 0; i < n; i++) {
    const t = Math.min(dur, i / HZ); times[i] = t; const LD = sampleDan(danName, map(t));
    let W = retargetPose(LD);
    if (mirror) { const M = {}; for (const [b, q] of Object.entries(W)) M[b.includes('.L') ? b.replace('.L', '.R') : b.replace('.R', '.L')] = mirrorQ(q); W = M; }
    let Lq = toLocal(W);
    if (HANG.clips.has(name)) { // (the standing arms: the hand's and twist bone's locals kept, so the hand rides the forearm)
      applyLocals(Lq, REST.hips.p.clone().divideScalar(RIG_S)); // (the thug posed as retargeted: its own body frame)
      const h = hangArms(W, land(T, false)); const R = (report.hang[name] ||= { keys: 0, straight: 0, liftL: [99, -99], liftR: [99, -99] }); R.keys++;
      for (const s of ['L', 'R']) { R['lift' + s][0] = Math.min(R['lift' + s][0], h.ws[s].lift); R['lift' + s][1] = Math.max(R['lift' + s][1], h.ws[s].lift); }
      if (h.W) { const Lq0 = Lq; Lq = toLocal(h.W); for (const s of ['L', 'R']) { Lq['hand.' + s] = Lq0['hand.' + s]; Lq['forearmTwist.' + s] = Lq0['forearmTwist.' + s]; } if (h.ws.L.w >= 1 && h.ws.R.w >= 1) R.straight++; }
    }
    const hp = LD.hips.clone().sub(LD0.hips).multiplyScalar(LEG_K); if (mirror) hp.x = -hp.x;
    rows.push(Lq); hipsRows.push(REST.hips.p.clone().add(hp));
  }
  // in place: the linear travel out of the loops/once clips (root-motion clips keep theirs); then the feet on the ground
  if (!ROOT_MOTION.has(name)) { const a = hipsRows[0], b = hipsRows[n - 1]; for (let i = 0; i < n; i++) { const k = (n > 1 ? i / (n - 1) : 0); hipsRows[i].x -= a.x + (b.x - a.x) * k - REST.hips.p.x; hipsRows[i].z -= a.z + (b.z - a.z) * k - REST.hips.p.z; } }
  else for (let i = n - 1; i >= 0; i--) { hipsRows[i].x -= hipsRows[0].x - REST.hips.p.x; hipsRows[i].z -= hipsRows[0].z - REST.hips.p.z; }
  let minClr = Infinity, maxErr = 0, errBone = '';
  const DIRS = [['sp2', 'neck'], ['shL', 'elL'], ['elL', 'wrL'], ['shR', 'elR'], ['elR', 'wrR'], ['hipL', 'kneeL'], ['kneeL', 'ankL'], ['hipR', 'kneeR'], ['kneeR', 'ankR'], ['neck', 'head'], ['wrL', 'middle1L'], ['wrR', 'middle1R'], ['index1L', 'index2L'], ['index1R', 'index2R'], ['thumb1L', 'thumb2L'], ['clavL', 'shL'], ['clavR', 'shR']];
  const danL = []; for (let i = 0; i < n; i++) danL.push(sampleDan(danName, map(times[i])));
  for (let i = 0; i < n; i++) { applyLocals(rows[i], hipsRows[i].clone().divideScalar(RIG_S));
    { let LDi = danL[i]; if (mirror) { const M = {}; for (const [k, p] of Object.entries(LDi)) if (p && p.isVector3) M[k.endsWith('L') ? k.slice(0, -1) + 'R' : k.endsWith('R') ? k.slice(0, -1) + 'L' : k] = v(-p.x, p.y, p.z); LDi = M; }
      const LTi = land(T, false); for (const [a, b] of DIRS) { if (!LDi[a] || !LDi[b]) continue; const e = LTi[b].clone().sub(LTi[a]).normalize().angleTo(LDi[b].clone().sub(LDi[a]).normalize()) * 57.3; if (e > maxErr) { maxErr = e; errBone = a + '>' + b + '@' + times[i].toFixed(2); } } } const clr = Math.min(wp(Tj('foot.L')).y - GROUND.ank, wp(Tj('foot.R')).y - GROUND.ank, wp(Tj('toe.L')).y - GROUND.toe, wp(Tj('toe.R')).y - GROUND.toe); feet.push({ L: wp(Tj('foot.L')), R: wp(Tj('foot.R')), tL: wp(Tj('toe.L')), tR: wp(Tj('toe.R')), clr }); minClr = Math.min(minClr, clr); }
  for (let i = 0; i < n; i++) { hipsRows[i].y -= minClr; feet[i].L.y -= minClr; feet[i].R.y -= minClr; feet[i].tL.y -= minClr; feet[i].tR.y -= minClr; feet[i].clr -= minClr; }
  // ground speed of the planted feet (loco): median horizontal speed of a foot within 3 cm of the ground
  if (kind === 'loco') { const sp = []; for (let i = 1; i < n - 1; i++) for (const f of ['L', 'R']) { const a = feet[i - 1][f], b = feet[i + 1][f]; const hL = Math.min(feet[i][f].y - GROUND.ank, feet[i]['t' + f].y - GROUND.toe); if (hL < 0.03) sp.push(Math.hypot(b.x - a.x, b.z - a.z) / (2 / HZ)); } sp.sort((x, y) => x - y); report.loco[name] = +(sp[Math.floor(sp.length / 2)] || 0).toFixed(3); }
  report.clips[name] = { dan: danName, dur: +dur.toFixed(3), frames: n, rootMotion: ROOT_MOTION.has(name), maxDirErrDeg: +maxErr.toFixed(1), at: errBone };
  return { name, times, rows, hips: hipsRows.map((p) => p.divideScalar(RIG_S)), dur };
}
const built = []; for (const [name, spec] of Object.entries(S)) { built.push(build(name, spec)); process.stdout.write(name + ' '); } console.log();

// ---- the pack: a flat node per thug bone (the rig's names without the dot), the animations; one plain GLB
{
  const parts = [], accessors = [], bufferViews = []; let len = 0;
  const add = (arr, type, minmax) => {
    const bytes = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength); bufferViews.push({ buffer: 0, byteOffset: len, byteLength: bytes.length });
    parts.push(bytes); len += bytes.length; const pad = (4 - (len % 4)) % 4; if (pad) { parts.push(Buffer.alloc(pad)); len += pad; }
    const n = { SCALAR: 1, VEC3: 3, VEC4: 4 }[type], a = { bufferView: bufferViews.length - 1, componentType: 5126, count: arr.length / n, type };
    if (minmax) { const mn = Array(n).fill(Infinity), mx = Array(n).fill(-Infinity); for (let i = 0; i < arr.length; i++) { mn[i % n] = Math.min(mn[i % n], arr[i]); mx[i % n] = Math.max(mx[i % n], arr[i]); } a.min = mn; a.max = mx; }
    accessors.push(a); return accessors.length - 1;
  };
  const nodeOf = new Map(THUG_BONES.map((b, i) => [b, i]));
  const animations = built.map((c) => {
    const input = add(c.times, 'SCALAR', true), samplers = [], channels = [];
    for (const b of THUG_BONES) { const out = new Float32Array(c.rows.length * 4); c.rows.forEach((r, i) => r[b].toArray(out, i * 4)); samplers.push({ input, output: add(out, 'VEC4'), interpolation: 'LINEAR' }); channels.push({ sampler: samplers.length - 1, target: { node: nodeOf.get(b), path: 'rotation' } }); }
    const out = new Float32Array(c.rows.length * 3); c.hips.forEach((p, i) => p.toArray(out, i * 3)); samplers.push({ input, output: add(out, 'VEC3'), interpolation: 'LINEAR' }); channels.push({ sampler: samplers.length - 1, target: { node: nodeOf.get('hips'), path: 'translation' } });
    return { name: c.name, channels, samplers };
  });
  const json = { asset: { version: '2.0', generator: 'Mog City tools/retarget-suits.mjs (anatomical frames)', copyright: "The Suits' clips: Dan's own (dan.glb), retargeted onto thug.glb's rig. Mog City." },
    scene: 0, scenes: [{ name: 'suits-dan', nodes: THUG_BONES.map((b, i) => i) }], nodes: THUG_BONES.map((b) => ({ name: packName(b) })), animations, accessors, bufferViews, buffers: [{ byteLength: len }] };
  let js = Buffer.from(JSON.stringify(json), 'utf8'); if (js.length % 4) js = Buffer.concat([js, Buffer.alloc(4 - (js.length % 4), 0x20)]);
  const bin = Buffer.concat(parts), head = Buffer.alloc(12); head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + js.length + 8 + bin.length, 8);
  const ch = (t, l) => { const h = Buffer.alloc(8); h.writeUInt32LE(l, 0); h.writeUInt32LE(t, 4); return h; };
  fs.writeFileSync(OUT, Buffer.concat([head, ch(0x4e4f534a, js.length), js, ch(0x004e4942, bin.length), bin]));
}
console.log('wrote', OUT, fs.statSync(OUT).size, 'bytes'); console.log('loco', JSON.stringify(report.loco)); console.log('hits', JSON.stringify(report.hits)); console.log('hang', JSON.stringify(report.hang));
if (process.env.REPORT) fs.writeFileSync(process.env.REPORT, JSON.stringify(report, null, 1));
