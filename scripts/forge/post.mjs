// THE CHARACTER FORGE: post-build (raw GLB in, raw GLB out). Three fixes every Mog City person needed by hand, made
// automatic:
//  1. the skeleton fitted to the body: every hand and arm joint moved onto the crease of the skin it bends (Mog City's
//     fixhands2/crease2: the centre of the points shared 25-75 % between a bone and its parent; fingers with too few
//     such points take their hand's median move), then EVERY joint's rest translation set from the binds (local =
//     inverse(B_parent) B_joint), so the rest skeleton is the bind skeleton (the shape refit and the narrower shoulders
//     included) and every pivot sits inside the body it turns
//  2. the hands sized to the head: hand length (wrist to the middle fingertip) / head height (chin to crown) brought
//     into the cast's band (men 0.75-0.78, women 0.70-0.72) by the wrist's scale (Mr. Big needed 1.09)
//  3. Dan's 74 clips in place of the template's 10: joint turns only plus the root's travel, scaled by leg length, with
//     Dan's skeleton frame (the frame those clips were made for); the face's morphs are made at load by wagmi/face.js
// FB (browser port): one function on a platform (env-node.mjs / env-browser.mjs), no Node API.
//   post(rawGlb: Uint8Array, LM (core's landmarks), env) -> { glb: Uint8Array, report }
// Dan's frame and idle clip come from the forge kit (clips-src.glb, kit.mjs); FORGE_CLIPS (a full clip file, Node) is
// still read when clips are baked (FORGE_BAKE_CLIPS=1).
export async function post(rawGlb, LM, env) {
const { ALL_EXTENSIONS } = env.gltf.extensions;
const { MeshoptDecoder } = env.meshopt;
const T3 = env.THREE;
await MeshoptDecoder.ready;
const CLIPS = env.flag('FORGE_CLIPS') || env.K + 'clips-src.glb';
const io = new env.IO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.readBinary(rawGlb), R = doc.getRoot();
const skin = R.listSkins()[0], J = skin.listJoints(), IBM = skin.getInverseBindMatrices(), name = J.map((j) => j.getName());
const ix = (n) => name.indexOf(n);
const Bm = J.map((j, k) => new T3.Matrix4().fromArray(IBM.getElement(k, [])).invert());
const parentOf = (k) => { const p = J[k].listParents().find((x) => x.propertyType === 'Node' && J.includes(x)); return p ? J.indexOf(p) : -1; };
const report = { joints: {}, hands: {}, clips: {} };

/* -- 1. creases -- */
const prim = R.listMeshes().flatMap((m) => m.listPrimitives()).find((p) => p.getMaterial()?.getName() === 'skin');
const P = prim.getAttribute('POSITION'), JJ = prim.getAttribute('JOINTS_0'), WW = prim.getAttribute('WEIGHTS_0');
const want = []; for (const s of ['L', 'R']) { want.push('lowerarm01_' + s, 'wrist_' + s); for (let f = 1; f <= 5; f++) for (let j = 1; j <= 3; j++) want.push(`finger${f}-${j}_${s}`); }
const wi = want.map(ix), pi = wi.map(parentOf), acc = wi.map(() => ({ s: [0, 0, 0], n: 0 }));
{ const p = [0, 0, 0], jj = [0, 0, 0, 0], ww = [0, 0, 0, 0];
  for (let v = 0; v < P.getCount(); v++) { JJ.getElement(v, jj); WW.getElement(v, ww);
    for (let q = 0; q < wi.length; q++) { let a = 0, b = 0; for (let k = 0; k < 4; k++) { if (jj[k] === wi[q]) a += ww[k]; if (jj[k] === pi[q]) b += ww[k]; }
      if (a > 0.25 && b > 0.25 && a + b > 0.85) { P.getElement(v, p); for (let i = 0; i < 3; i++) acc[q].s[i] += p[i]; acc[q].n++; } } } }
const pos0 = Bm.map((m) => new T3.Vector3().setFromMatrixPosition(m));
const out = {}; want.forEach((n, q) => { const a = acc[q]; out[n] = { k: wi[q], n: a.n, off: a.n ? new T3.Vector3(...a.s.map((x) => x / a.n)).sub(pos0[wi[q]]).toArray() : null }; });
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1] ?? 0; };
const moves = new Map();
for (const s of ['L', 'R']) {
  const fing = Object.entries(out).filter(([n, o]) => n.endsWith('_' + s) && n.startsWith('finger') && o.n >= 12);
  const med = [0, 1, 2].map((i) => median(fing.map(([, o]) => o.off[i])));
  for (const [n, o] of Object.entries(out)) { if (!n.endsWith('_' + s)) continue; const d = o.n >= 9 ? o.off : med; moves.set(o.k, new T3.Vector3(...d)); }
  report.joints['hand' + s] = { creaseOwn: Object.entries(out).filter(([n, o]) => n.endsWith('_' + s) && o.n >= 9).length, creaseOf: Object.keys(out).filter((n) => n.endsWith('_' + s)).length, medianFingerMoveMm: med.map((x) => +(x * 1000).toFixed(1)), wristMoveMm: (out['wrist_' + s].off || med).map((x) => +(x * 1000).toFixed(1)) };
  const sh = ix('upperarm01_' + s), u2 = ix('upperarm02_' + s), el = ix('lowerarm01_' + s), l2 = ix('lowerarm02_' + s), wr = ix('wrist_' + s);
  const at = (k) => pos0[k].clone().add(moves.get(k) || new T3.Vector3());
  const frac = (a, m, b) => pos0[m].clone().sub(pos0[a]).dot(pos0[b].clone().sub(pos0[a])) / pos0[b].clone().sub(pos0[a]).lengthSq();
  const fu = frac(sh, u2, el), fl = frac(el, l2, wr), E = at(el), Wp = at(wr);
  moves.set(u2, at(sh).lerp(E, fu).sub(pos0[u2])); moves.set(l2, E.clone().lerp(Wp, fl).sub(pos0[l2]));
}
const B2 = Bm.map((m, k) => { const n = m.clone(); if (moves.has(k)) n.setPosition(new T3.Vector3().setFromMatrixPosition(m).add(moves.get(k))); return n; });
{ const arr = new Float32Array(B2.length * 16); B2.forEach((m, k) => m.clone().invert().toArray(arr, k * 16)); IBM.setArray(arr); }
// (the rest skeleton = the bind skeleton: every joint's translation from the binds, the root's (animated) kept)
let maxFix = 0;
for (let k = 0; k < J.length; k++) { const p = parentOf(k); if (p < 0) continue;
  const t = new T3.Vector3().setFromMatrixPosition(B2[p].clone().invert().multiply(B2[k])), t0 = new T3.Vector3(...J[k].getTranslation());
  maxFix = Math.max(maxFix, t.distanceTo(t0)); J[k].setTranslation(t.toArray()); }
report.joints.maxRestTranslationFixMm = +(maxFix * 1000).toFixed(1);

/* -- 2. hand size -- */
{ const head = ix('head'), p = [0, 0, 0], jj = [0, 0, 0, 0], ww = [0, 0, 0, 0]; let crown = -9;
  const tip = { L: [0, null], R: [0, null] };
  for (let v = 0; v < P.getCount(); v++) { JJ.getElement(v, jj); WW.getElement(v, ww); P.getElement(v, p);
    let h = 0; for (let k = 0; k < 4; k++) if (jj[k] === head) h += ww[k]; if (h > 0.6) crown = Math.max(crown, p[1]);
    for (const s of ['L', 'R']) { const f = ix('finger3-3_' + s); let w = 0; for (let k = 0; k < 4; k++) if (jj[k] === f) w += ww[k];
      if (w > 0.5) { const d = new T3.Vector3(...p).distanceTo(new T3.Vector3().setFromMatrixPosition(B2[ix('wrist_' + s)])); if (d > tip[s][0]) tip[s] = [d, p.slice()]; } } }
  const chinY = LM.ey - LM.chin / 1000, headH = crown - chinY, female = LM.sex === 'female';
  const [lo, hi] = female ? [0.70, 0.72] : [0.75, 0.78];
  for (const s of ['L', 'R']) { const r = tip[s][0] / headH, target = r < lo ? lo : r > hi ? hi : r, k = Math.max(0.9, Math.min(1.15, target / r)); // (MV: down to 0.9, from 0.95: a short face (faceLength) leaves the hand long for its head)
    J[ix('wrist_' + s)].setScale([k, k, k]); report.hands[s] = { handMm: +(tip[s][0] * 1000).toFixed(1), headMm: +(headH * 1000).toFixed(1), ratio: +r.toFixed(3), scale: +k.toFixed(3), after: +(r * k).toFixed(3) }; } }

/* -- 3. Dan's clips -- */
const src = await io.readBinary(await env.bytes(CLIPS)), SR = src.getRoot(), sJ = SR.listSkins()[0].listJoints();
const armOf = (root) => root.listParents().find((x) => x.propertyType === 'Node');
const armature = armOf(J[ix('root')]), sArm = armOf(sJ.find((j) => j.getName() === 'root'));
// (leg length in each skeleton's own rest: root to the foot, in the frame's units)
const legOf = (joints, get) => { const chain = ['root', 'upperleg01_L', 'upperleg02_L', 'lowerleg01_L', 'lowerleg02_L', 'foot_L'].map((n) => joints.find((j) => j.getName() === n));
  let y = 0; for (const j of chain.slice(1)) y += new T3.Vector3(...get(j)).length(); return y; };
const ourLeg = legOf(J, (j) => j.getTranslation()), danLeg = legOf(sJ, (j) => j.getTranslation()), kRoot = ourLeg / danLeg;
for (const a of R.listAnimations()) a.dispose();
// FORGE v2: one shared clip pack (clips.mjs -> cast-clips.glb) for every character; nothing baked here unless
// FORGE_BAKE_CLIPS=1. What differs per person travels in the asset's extras for the runtime (clips-runtime.mjs): the
// root's travel scaled by leg length (rootScale) and a heavier body's arms carried out (armSplay, deg)
const BAKE = env.flag('FORGE_BAKE_CLIPS') === '1';
const byName = new Map(J.map((j) => [j.getName(), j]));
const buf = R.listBuffers()[0];
let nClips = 0, nCh = 0;
const splayQ = (name) => { const sp = LM.armSplay || 0, side = /upperarm01_(L|R)$/.exec(name)?.[1]; return sp && side ? new T3.Quaternion().setFromAxisAngle(new T3.Vector3(0, 0, 1), (side === 'L' ? 1 : -1) * sp * Math.PI / 180) : null; };
const decoded = (outp) => { let o = Float32Array.from(outp.getArray()); if (outp.getNormalized()) { const n0 = outp.getArray(), f = n0 instanceof Int16Array ? 32767 : n0 instanceof Int8Array ? 127 : n0 instanceof Uint16Array ? 65535 : 255; o = Float32Array.from(n0, (x) => Math.max(-1, x / f)); } return o; };
// (a clip's channel, retargeted the way the runtime does it: root travel x kRoot, the shoulders' splay)
const retarget = (ch) => { const tn = ch.getTargetNode(), s0 = ch.getSampler(), path = ch.getTargetPath(), o = decoded(s0.getOutput());
  if (path === 'translation' && tn.getName() === 'root') for (let i = 0; i < o.length; i++) o[i] *= kRoot;
  const qa = path === 'rotation' && splayQ(tn.getName()); if (qa) { const qq = new T3.Quaternion(); for (let i = 0; i < o.length; i += 4) { qq.set(o[i], o[i + 1], o[i + 2], o[i + 3]); qq.premultiply(qa); o[i] = qq.x; o[i + 1] = qq.y; o[i + 2] = qq.z; o[i + 3] = qq.w; } }
  return { node: byName.get(tn.getName()), path, t: Float32Array.from(s0.getInput().getArray()), o, interp: s0.getInterpolation() }; };
for (const a of SR.listAnimations()) {
  nClips++; if (!BAKE) continue;
  const A2 = doc.createAnimation(a.getName());
  for (const ch of a.listChannels()) { if (!ch.getTargetNode() || !byName.get(ch.getTargetNode().getName())) continue; const r = retarget(ch);
    const S = doc.createAnimationSampler().setInput(doc.createAccessor().setType('SCALAR').setArray(r.t).setBuffer(buf)).setOutput(doc.createAccessor().setType(ch.getSampler().getOutput().getType()).setArray(r.o).setBuffer(buf)).setInterpolation(r.interp);
    A2.addSampler(S).addChannel(doc.createAnimationChannel().setTargetNode(r.node).setTargetPath(r.path).setSampler(S)); nCh++; }
}
// (the frame: upright. Mog City's game sets every cast rig's frame straight at load (game.js, jane.js, mrbig.js:
// "the clips' own hips put right"), so the clips are made for an upright frame; the template's tilted one is dropped)
armature.setRotation([0, 0, 0, 1]);
// (on the floor: the idle clip's feet found by forward kinematics at 1.2 s, the frame lowered or raised so the soles
// sit at y = 0 as they do in the bind (the foot joint's bind height over the sole))
const sampleAt = (anim, node, path, t) => { const ch = anim.listChannels().find((c) => c.getTargetNode()?.getName() === node.getName() && c.getTargetPath() === path); if (!ch) return null;
  const r = retarget(ch), ti = r.t, o = r.o, w = path === 'rotation' ? 4 : 3; let i = 0; while (i < ti.length - 1 && ti[i + 1] <= t) i++;
  const j = Math.min(ti.length - 1, i + 1), f = j === i ? 0 : Math.max(0, Math.min(1, (t - ti[i]) / (ti[j] - ti[i])));
  if (w === 4) { const a = new T3.Quaternion(...o.slice(i * 4, i * 4 + 4)), b = new T3.Quaternion(...o.slice(j * 4, j * 4 + 4)); return a.slerp(b, f).toArray(); }
  return [0, 1, 2].map((k) => o[i * 3 + k] + (o[j * 3 + k] - o[i * 3 + k]) * f); };
const idle = SR.listAnimations().find((a) => a.getName() === 'idle') || SR.listAnimations()[0];
const worldOf = (node) => { const chain = []; for (let n = node; n && n !== armature; n = n.listParents().find((x) => x.propertyType === 'Node')) chain.unshift(n);
  const m = new T3.Matrix4().compose(new T3.Vector3(...armature.getTranslation()), new T3.Quaternion(...armature.getRotation()), new T3.Vector3(...armature.getScale()));
  for (const n of chain) { const t = sampleAt(idle, n, 'translation', 1.2) || n.getTranslation(), r = sampleAt(idle, n, 'rotation', 1.2) || n.getRotation(); m.multiply(new T3.Matrix4().compose(new T3.Vector3(...t), new T3.Quaternion(...r), new T3.Vector3(...n.getScale()))); }
  return new T3.Vector3().setFromMatrixPosition(m); };
{ const sc = armature.getScale()[1], fy = Math.min(...['foot_L', 'foot_R'].map((n) => worldOf(J[ix(n)]).y)), bindFoot = new T3.Vector3().setFromMatrixPosition(B2[ix('foot_L')]).y * sc;
  // (forge v2.3, SH: the library's shoes stand on their soles: the frame raised by the sole under the foot)
  const dy = bindFoot - fy + (LM.sole || 0) * sc, t0 = armature.getTranslation(); armature.setTranslation([t0[0], t0[1] + dy, t0[2]]); report.clips.groundFixMm = +(dy * 1000).toFixed(1); }
report.clips = Object.assign(report.clips, { from: SR.getAsset().extras?.forgeKit?.from || CLIPS.split('/').pop(), pack: BAKE ? null : 'cast-clips.glb', baked: BAKE, clips: BAKE ? nClips : SR.getAsset().extras?.forgeKit?.clips ?? nClips, channels: nCh, rootScale: +kRoot.toFixed(4), armSplay: LM.armSplay || 0, legMm: +(ourLeg * 1000).toFixed(1), danLegMm: +(danLeg * 1000).toFixed(1), frame: 'upright (the template tilt dropped)' });
R.getAsset().extras = Object.assign(R.getAsset().extras || {}, { forge: { landmarks: LM, props: LM.props || [], sheet: LM.sheet || null, post: report } });
return { glb: await io.writeBinary(doc), report };
}
