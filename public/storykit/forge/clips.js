// Story Kit forge: a copy of the Character Forge's runtime side (scripts/forge/clips-runtime.mjs, unchanged below its header), served
// beside portrait.html (the creator's browser's headshots). The check (scripts/storykit-pack-check.ts) keeps the two the same.
// THE CHARACTER FORGE, runtime side: the shared clip pack (cast-clips.glb, clips.mjs) bound to one forged character.
// Every forged person has the cast's 66-bone rig with the same bone names, so a pack clip drives them by name; three
// things differ per person:
//   rest       the body's own bind pose (forge v2.4): every joint refit to its body (post.mjs, a scan's wrap) while the
//              bones keep Dan's frames, so a limb's segment points another way in its bone's frame than Dan's does
//              (measured: Mandi's and Jay's upper arms 14-17 deg, the hand-built cast's forearms up to 10). Per long
//              bone of the arms and legs, the turn c that swings the body's segment onto Dan's (the pack's
//              forge.danBind) is put on every key: q' = c_parent^-1 * q * c_own (q_target = R_target_rest *
//              inverse(R_source_rest) * q_source), so the arms hang and swing where Dan's do. Needs the body
//              (opts.body: its scene) and the pack's danBind (opts.ref); without them, as before. Mog City's engine does
//              the same at load (wagmi/retarget.js): the studio shows what the game plays.
//   rootScale  the root's travel scaled by leg length (a short woman's stride is not Dan's); in the asset's extras
//              (forge.post.clips, written by post.mjs)
//   armSplay   a heavier body's upper arms carried out from the sides (deg about the forward axis, in the shoulder's frame)
// The clips are retargeted once per (body or rootScale, armSplay) and cached, so a crowd of the same build shares them.
//   import { castClips } from './clips-runtime.mjs';
//   const clips = castClips(THREE, pack.animations, gltf.parser.json.asset.extras.forge,
//                           { body: gltf.scene, ref: pack.parser.json.asset.extras.forge.danBind });   // AnimationClip[]
export const LIMB_ENDS = Object.freeze({
  upperarm01_L: 'lowerarm01_L', upperarm02_L: 'lowerarm01_L', lowerarm01_L: 'wrist_L', lowerarm02_L: 'wrist_L',
  upperarm01_R: 'lowerarm01_R', upperarm02_R: 'lowerarm01_R', lowerarm01_R: 'wrist_R', lowerarm02_R: 'wrist_R',
  upperleg01_L: 'lowerleg01_L', upperleg02_L: 'lowerleg01_L', lowerleg01_L: 'foot_L', lowerleg02_L: 'foot_L',
  upperleg01_R: 'lowerleg01_R', upperleg02_R: 'lowerleg01_R', lowerleg01_R: 'foot_R', lowerleg02_R: 'foot_R',
});
const MAX_DEG = 45;
// a skinned body's bind by bone name ({ p, q }) and each bone's parent bone (past a node between, armhang_L / _R)
export function bodyRig(THREE, root) {
  let sk = null; root.traverse((o) => { if (!sk && o.isSkinnedMesh && o.skeleton?.bones.some((b) => b.name === 'upperarm01_L')) sk = o.skeleton; });
  if (!sk) return null;
  const bind = new Map(), parent = new Map(), m = new THREE.Matrix4(), s = new THREE.Vector3();
  sk.bones.forEach((b, i) => { if (bind.has(b.name)) return; m.copy(sk.boneInverses[i]).invert(); const p = new THREE.Vector3(), q = new THREE.Quaternion(); m.decompose(p, q, s); bind.set(b.name, { p, q }); });
  root.traverse((o) => { if (!o.isBone || parent.has(o.name)) return; let p = o.parent; while (p && !p.isBone) p = p.parent; parent.set(o.name, p ? p.name : null); });
  return { bind, parent };
}
// per long bone, the turn in its bind frame that puts the body's segment on Dan's (ref: { name: [px,py,pz, qx,qy,qz,qw] })
export function restCorrections(THREE, ref, rig) {
  const corr = {}, deg = {}, R = (n) => { const a = ref[n]; return a && { p: new THREE.Vector3(a[0], a[1], a[2]), q: new THREE.Quaternion(a[3], a[4], a[5], a[6]) }; };
  for (const [k, e] of Object.entries(LIMB_ENDS)) {
    const s0 = R(k), s1 = R(e), d0 = rig.bind.get(k), d1 = rig.bind.get(e); if (!s0 || !s1 || !d0 || !d1) continue;
    const es = s1.p.clone().sub(s0.p).applyQuaternion(s0.q.clone().invert()).normalize();
    const ed = d1.p.clone().sub(d0.p).applyQuaternion(d0.q.clone().invert()).normalize();
    const a = (es.angleTo(ed) * 180) / Math.PI; deg[k] = Math.round(a * 10) / 10;
    if (a >= 0.5 && a <= MAX_DEG) corr[k] = new THREE.Quaternion().setFromUnitVectors(ed, es);
  }
  return { corr, deg };
}
const cache = new Map();
export function castClips(THREE, packClips, forge = {}, opts = {}) {
  const c = forge.post?.clips || {}, rootScale = c.rootScale ?? 1, splay = c.armSplay ?? forge.landmarks?.armSplay ?? 0;
  if (c.baked) return null; // (an older character with its own clips: use gltf.animations)
  const rig = opts.body && opts.ref && opts.rest !== false ? bodyRig(THREE, opts.body) : null;
  const { corr, deg } = rig ? restCorrections(THREE, opts.ref, rig) : { corr: {}, deg: {} };
  const key = rootScale.toFixed(4) + '|' + splay.toFixed(2) + '|' + Object.entries(corr).map(([n, q]) => n + q.toArray().map((x) => x.toFixed(4)).join(',')).join(';');
  let byPack = cache.get(packClips); if (!byPack) cache.set(packClips, (byPack = new Map()));
  if (byPack.has(key)) return byPack.get(key);
  const q = new THREE.Quaternion(), I = new THREE.Quaternion(), qa = { L: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), splay * Math.PI / 180), R: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -splay * Math.PI / 180) };
  const parentOf = (n) => rig?.parent.get(n) || null;
  const out = packClips.map((clip) => {
    const k = clip.clone();
    for (const t of k.tracks) {
      if (rootScale !== 1 && /^root\.position$/.test(t.name)) { t.values = Float32Array.from(t.values, (x) => x * rootScale); continue; }
      const m = /^(.+)\.quaternion$/.exec(t.name); if (!m) continue;
      const side = splay && /^upperarm01_(L|R)$/.exec(m[1])?.[1], own = corr[m[1]], par = corr[parentOf(m[1])];
      if (!side && !own && !par) continue;
      const pre = par ? par.clone().invert() : I.clone(); if (side) pre.premultiply(qa[side]);
      const post = own || I, v = Float32Array.from(t.values);
      for (let i = 0; i < v.length; i += 4) q.fromArray(v, i).premultiply(pre).multiply(post).toArray(v, i);
      t.values = v;
    }
    return k;
  });
  out.restDeg = deg;
  byPack.set(key, out);
  return out;
}
