// Mog City: a creature's face (SF 2040's Old Silver, the giant silverback; the owner: "no facial expression"). The
// library's ape has one head bone and no jaw, so its face is given morphs here, once a kind, on its own copy of the
// kind's geometry (the library's stays as it is for every other user):
//   jaw   the lower lip, chin and jaw turned down about a hinge under the ears; the lips split along the mouth's line
//         (the points on it doubled, the upper copies kept by the upper lip), so the mouth opens instead of stretching
//   lip   the snarl: the upper lip drawn up and back, most over the canines, the nose wrinkled up
//   brow  the scowl: the brow ridge down and in over the eyes
// and a mouth to open onto: a dark cavity with a tongue (its floor down with the jaw) and teeth, the upper row with
// long canines behind the upper lip (bared by the snarl), the lower on the jaw. At rest all of it is inside the muzzle.
//   faceKit(kit, 'ape')           wraps kit.make: each one made has made.face
//   made.face.set({ jaw, lip, brow })   0..1 each, now
//   made.face.update(dt, fighter)       what its face does in the fight (fierce at rest, a snarl winding up a blow, a
//                                       roar at the blow and through its chest beat, a grimace when hit, slack when down)
//   made.face.meshes                    the mouth's meshes (their materials join the fighter's: flash, dissolve)
import * as THREE from 'three/webgpu';

// the ape's face in its own mesh space (the library's bind pose: 2.4 m tall, facing +z). Measured off its geometry:
// the muzzle's middle 8.5 cm to its left of x = 0 (its head is turned a touch), the mouth's line at y 1.774 from corner
// to corner (13 cm either side), the muzzle's front at z 1.37, the jaw's hinge under the ears
const RECIPES = {
  ape: { xc: 0.085, yc: 1.774, half: 0.13, hinge: [1.87, 1.12], open: 0.44, zMin: 1.2, eyeY: 1.97, browY: 2.02 },
};
const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const GEO = new WeakMap();

// the kind's geometry with the lips split and the three morphs (made once a kind)
function faceGeometry(geo0, R, headIx) {
  const pos0 = geo0.attributes.position, n0 = pos0.count, idx0 = geo0.index.array, X = (i) => pos0.getX(i), Y = (i) => pos0.getY(i), Z = (i) => pos0.getZ(i);
  // the muzzle's front by x (for the mouth's pieces): the frontmost point near the mouth's line in 1 cm columns
  const front = new Map(); for (let i = 0; i < n0; i++) { if (Math.abs(Y(i) - R.yc) > 0.03 || Z(i) < R.zMin) continue; const k = Math.round((X(i) - R.xc) * 100); front.set(k, Math.max(front.get(k) ?? -9, Z(i))); }
  const zFront = (dx) => { let best = null; for (let d = 0; d <= 3 && best == null; d++) for (const s of [1, -1]) { const v = front.get(Math.round(dx * 100) + s * d); if (v != null) best = Math.max(best ?? -9, v); } return best ?? 1.3; };
  // split the lips: a triangle in the mouth's band is the upper lip's or the lower's by its middle; a point both use is
  // doubled, the copy the upper lip's
  const inBand = (i) => Math.abs(X(i) - R.xc) < R.half && Math.abs(Y(i) - R.yc) < 0.05 && Z(i) > R.zMin + 0.03;
  const side = new Int8Array(idx0.length / 3), lowerUse = new Uint8Array(n0);
  for (let t = 0; t < idx0.length; t += 3) { const a = idx0[t], b = idx0[t + 1], c = idx0[t + 2]; if (!(inBand(a) && inBand(b) && inBand(c))) continue;
    const cy = (Y(a) + Y(b) + Y(c)) / 3; side[t / 3] = cy > R.yc ? 1 : -1; if (side[t / 3] < 0) { lowerUse[a] = 1; lowerUse[b] = 1; lowerUse[c] = 1; } }
  const dup = new Map(); const idx = Array.from(idx0);
  for (let t = 0; t < idx.length; t += 3) if (side[t / 3] > 0) for (let k = 0; k < 3; k++) { const v = idx[t + k]; if (!lowerUse[v]) continue; if (!dup.has(v)) dup.set(v, n0 + dup.size); idx[t + k] = dup.get(v); }
  const n = n0 + dup.size, src = new Int32Array(n); for (let i = 0; i < n0; i++) src[i] = i; for (const [v, d] of dup) src[d] = v;
  const geo = new THREE.BufferGeometry();
  for (const [name, a] of Object.entries(geo0.attributes)) { const A = new a.array.constructor(n * a.itemSize); A.set(a.array.subarray(0, n0 * a.itemSize)); for (let i = n0; i < n; i++) for (let k = 0; k < a.itemSize; k++) A[i * a.itemSize + k] = a.array[src[i] * a.itemSize + k]; geo.setAttribute(name, new THREE.BufferAttribute(A, a.itemSize, a.normalized)); }
  geo.setIndex(new THREE.BufferAttribute(n > 65535 ? new Uint32Array(idx) : new Uint16Array(idx), 1));
  geo.boundingSphere = geo0.boundingSphere?.clone() || null; geo.boundingBox = geo0.boundingBox?.clone() || null;
  // the morphs
  const [hy, hz] = R.hinge, jaw = new Float32Array(n * 3), lip = new Float32Array(n * 3), brow = new Float32Array(n * 3), c = Math.cos(R.open), s = Math.sin(R.open);
  const turn = (y, z, out, i, w) => { const ry = y - hy, rz = z - hz; out[i * 3 + 1] = (ry * c - rz * s - ry) * w; out[i * 3 + 2] = (ry * s + rz * c - rz) * w; };
  for (let i = 0; i < n; i++) { const v = src[i], x = X(v), y = Y(v), z = Z(v), dx = Math.abs(x - R.xc), upperCopy = i >= n0;
    // (the jaw: under the mouth's line, the split points fully, elsewhere eased in under it; fading toward the cheeks
    // and back toward the hinge)
    if (!upperCopy && z > 0.98 && y < R.yc + 0.002 && y > 1.45) {
      const split = lowerUse[v] && dup.has(v), under = split ? 1 : sm(0, 0.06, R.yc - y), w = under * (1 - sm(R.half - 0.02, R.half + 0.14, dx)) * sm(0.98, 1.26, z);
      if (w > 0) turn(y, z, jaw, i, w); }
    // (the snarl: the upper lip up and back, most over the canines; the nose wrinkled up)
    if ((upperCopy || (!dup.has(v) && y >= R.yc - 0.001)) && z > R.zMin + 0.02 && dx < R.half + 0.02) {
      const up = 1 - sm(0.005, 0.085, y - R.yc), can = 0.55 + 0.45 * Math.exp(-(((dx - 0.076) / 0.035) ** 2)), w = up * can * (1 - sm(R.half - 0.03, R.half + 0.02, dx));
      lip[i * 3 + 1] += 0.044 * w; lip[i * 3 + 2] -= 0.006 * w; lip[i * 3] += Math.sign(x - R.xc) * 0.008 * w; }
    // (the lower lip peeled down off the lower teeth, most at the canines)
    if (!upperCopy && y < R.yc + 0.001 && y > R.yc - 0.05 && z > R.zMin + 0.02 && dx < R.half + 0.02) { const w = (1 - sm(0.004, 0.05, R.yc - y)) * (0.5 + 0.5 * Math.exp(-(((dx - 0.076) / 0.04) ** 2))) * (1 - sm(R.half - 0.03, R.half + 0.02, dx)); lip[i * 3 + 1] -= 0.016 * w; lip[i * 3 + 2] += 0.004 * w; }
    if (y > R.yc + 0.05 && y < R.eyeY - 0.02 && z > R.zMin + 0.05 && dx < 0.11) { const w = sm(R.yc + 0.05, R.yc + 0.1, y) * (1 - sm(R.eyeY - 0.07, R.eyeY - 0.02, y)) * (1 - sm(0.06, 0.11, dx)); lip[i * 3 + 1] += 0.012 * w; lip[i * 3 + 2] -= 0.003 * w; }
    // (the scowl: the brow ridge down and in, most at its inner ends)
    if (y > R.eyeY + 0.005 && y < R.browY + 0.07 && z > R.zMin + 0.03 && dx < 0.21) { const w = sm(R.eyeY + 0.005, R.browY - 0.01, y) * (1 - sm(R.browY + 0.02, R.browY + 0.07, y)) * (1 - sm(0.12, 0.21, dx)) * (0.65 + 0.35 * (1 - sm(0, 0.1, dx)));
      brow[i * 3 + 1] -= 0.013 * w; brow[i * 3 + 2] += 0.004 * w; brow[i * 3] -= Math.sign(x - R.xc) * 0.006 * w; } }
  geo.morphAttributes.position = [new THREE.BufferAttribute(jaw, 3), new THREE.BufferAttribute(lip, 3), new THREE.BufferAttribute(brow, 3)];
  geo.morphTargetsRelative = true;
  // the mouth: a cavity and tongue, the teeth; each point on the head, its jaw morph if it is the jaw's
  const parts = (build) => { const P = [], N = [], I = [], J = [], L = [], C = []; build({ P, N, I, J, L, C }); const g = new THREE.BufferGeometry(), m = P.length / 3;
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setIndex(I); if (C.length) g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    const si = new Uint16Array(m * 4), sw = new Float32Array(m * 4); for (let i = 0; i < m; i++) { si[i * 4] = headIx; sw[i * 4] = 1; }
    g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    const jm = new Float32Array(m * 3), lm = new Float32Array(m * 3); for (let i = 0; i < m; i++) { if (J[i]) turn(P[i * 3 + 1], P[i * 3 + 2], jm, i, 1); if (L[i]) lm[i * 3 + 1] = 0.012 * L[i]; }
    g.morphAttributes.position = [new THREE.BufferAttribute(jm, 3), new THREE.BufferAttribute(lm, 3), new THREE.BufferAttribute(new Float32Array(m * 3), 3)]; g.morphTargetsRelative = true;
    g.computeVertexNormals(); g.computeBoundingSphere(); g.boundingSphere.radius += 0.2; return g; };
  // (an ellipsoid of rows x cols, its lower half the jaw's)
  const blob = (o, cx, cy, cz, rx, ry, rz, jawBelow, flat = 1) => { const R0 = 10, C0 = 16, b = o.P.length / 3;
    for (let r = 0; r <= R0; r++) { const ph = (r / R0) * Math.PI, sy = Math.cos(ph), sr = Math.sin(ph);
      for (let k = 0; k <= C0; k++) { const th = (k / C0) * Math.PI * 2, nx = sr * Math.sin(th), nz = sr * Math.cos(th), y = cy + sy * ry * (sy < 0 ? flat : 1);
        o.P.push(cx + nx * rx, y, cz + nz * rz); o.N.push(-nx, -sy, -nz); o.J.push(jawBelow != null && y < jawBelow ? 1 : 0); o.L.push(0); } }
    for (let r = 0; r < R0; r++) for (let k = 0; k < C0; k++) { const a = b + r * (C0 + 1) + k, d = a + C0 + 1; o.I.push(a, d, a + 1, a + 1, d, d + 1); } };
  const zf = zFront(0);
  const cavity = parts((o) => blob(o, R.xc, R.yc - 0.012, zf - 0.13, R.half * 0.82, 0.042, 0.066, R.yc - 0.004, 0.45));
  const tongue = parts((o) => blob(o, R.xc, R.yc - 0.058, zf - 0.13, R.half * 0.42, 0.02, 0.06, 9, 1));
  // (a tooth: turned round its own axis from root to tip (10 sides), its section an oval (an incisor flat across the
  // mouth, a canine round), its profile full at the gum, narrowing to a rounded tip; a canine a long curved fang leaning
  // back; ivory, yellower and darker at the root, lighter to the tip)
  const tooth = (o, x, z, yRoot, yTip, rw, rd, jaw, fang) => { const b = o.P.length / 3, NS = 10, NR = 7, len = yTip - yRoot;
    for (let r = 0; r <= NR; r++) { const t = r / NR, prof = fang ? Math.pow(1 - t, 0.75) * (1 - 0.15 * t) + 0.04 : Math.min(1, 1.15 - 0.15 * t) * (t < 0.75 ? 1 : Math.sqrt(Math.max(0, 1 - ((t - 0.75) / 0.25) ** 2)) * 0.9 + 0.1);
      const y = yRoot + len * t, bz = fang ? -0.006 * t * t : 0, col = [0.34 + 0.24 * t, 0.29 + 0.23 * t, 0.17 + 0.2 * t];
      for (let k = 0; k <= NS; k++) { const a = (k / NS) * Math.PI * 2; o.P.push(x + Math.sin(a) * rw * prof, y, z + bz + Math.cos(a) * rd * prof); o.N.push(Math.sin(a), 0, Math.cos(a)); o.J.push(jaw ? 1 : 0); o.L.push(0); o.C.push(...col); } }
    for (let r = 0; r < NR; r++) for (let k = 0; k < NS; k++) { const a = b + r * (NS + 1) + k, d = a + NS + 1; o.I.push(a, d, a + 1, a + 1, d, d + 1); } };
  // (the gums: a soft ridge along each row's roots, dark pink, the teeth set in it)
  const gum = (o, pts, y, jaw) => { const b = o.P.length / 3, NS = 8;
    pts.forEach(([x, z]) => { for (let k = 0; k <= NS; k++) { const a = (k / NS) * Math.PI * 2; o.P.push(x, y + Math.sin(a) * 0.011, z + Math.cos(a) * 0.016); o.N.push(0, Math.sin(a), Math.cos(a)); o.J.push(jaw ? 1 : 0); o.L.push(0); o.C.push(0.24, 0.06, 0.06); } });
    for (let r = 0; r < pts.length - 1; r++) for (let k = 0; k < NS; k++) { const a = b + r * (NS + 1) + k, d = a + NS + 1; o.I.push(a, d, a + 1, a + 1, d, d + 1); } };
  const DX = [-0.096, -0.076, -0.053, -0.031, -0.01, 0.01, 0.031, 0.053, 0.076, 0.096], zAt = (dx) => zFront(dx) - 0.034 - 0.25 * dx * dx;
  const teeth = parts((o) => {
    for (const dx of DX) { const can = Math.abs(Math.abs(dx) - 0.076) < 0.005, mol = Math.abs(dx) > 0.1, x = R.xc + dx, zz = zAt(dx);
      // (the upper row from the gum down past the mouth's line; the canines long fangs)
      tooth(o, x, zz, R.yc + 0.024, R.yc - (can ? 0.05 : mol ? 0.002 : 0.011), can ? 0.0105 : mol ? 0.009 : 0.0085, can ? 0.0105 : 0.006, false, can);
      // (the lower row behind it, on the jaw, its canines shorter fangs pointing up)
      tooth(o, x * 0.9 + R.xc * 0.1, zz - 0.016, R.yc - 0.04, R.yc + (can ? 0.03 : mol ? 0.0 : 0.01), can ? 0.009 : 0.0075, can ? 0.009 : 0.0055, true, can); }
    const arc = (k, dz) => { const out = []; for (let dx = -0.1; dx <= 0.1001; dx += 0.01) out.push([R.xc + dx * k, zAt(dx) + dz]); return out; };
    gum(o, arc(1, 0), R.yc + 0.027, false); gum(o, arc(0.9, -0.016), R.yc - 0.043, true); });
  return { geo, cavity, tongue, teeth };
}

/** Give a library creature kind a face: each one kit.make() makes carries made.face. */
export function faceKit(kit, recipe = 'ape') {
  const R = RECIPES[recipe]; if (!R || kit.faced) return kit; kit.faced = true;
  const make0 = kit.make;
  kit.make = (o) => {
    const made = make0(o), mesh = made.mesh, bones = made.skeleton.bones, headIx = bones.findIndex((b) => b.name === 'head'); if (headIx < 0) return made;
    let F = GEO.get(kit); if (!F) { F = faceGeometry(mesh.geometry, R, headIx); F.mats = {
      cavity: new THREE.MeshStandardMaterial({ color: new THREE.Color(0.055, 0.012, 0.012), roughness: 0.55, metalness: 0, side: THREE.DoubleSide }),
      tongue: new THREE.MeshStandardMaterial({ color: new THREE.Color(0.22, 0.06, 0.06), roughness: 0.4, metalness: 0 }),
      teeth: new THREE.MeshStandardMaterial({ vertexColors: true, color: new THREE.Color(1, 1, 1), emissive: new THREE.Color(0.03, 0.025, 0.018), roughness: 0.32, metalness: 0, side: THREE.DoubleSide }) }; GEO.set(kit, F); }
    mesh.geometry = F.geo; mesh.updateMorphTargets(); mesh.morphTargetInfluences.fill(0);
    const meshes = [];
    for (const k of ['cavity', 'tongue', 'teeth']) { const m = new THREE.SkinnedMesh(F[k], F.mats[k]); m.name = 'face-' + k; m.frustumCulled = false; m.castShadow = false; m.receiveShadow = true; m.updateMorphTargets(); m.morphTargetInfluences.fill(0);
      mesh.parent.add(m); m.bind(made.skeleton, mesh.bindMatrix); meshes.push(m); }
    const all = [mesh, ...meshes], cur = { jaw: 0, lip: 0, brow: 0 };
    const set = (o2 = {}) => { for (const k of ['jaw', 'lip', 'brow']) if (o2[k] != null) cur[k] = Math.max(0, Math.min(1, o2[k])); for (const m of all) { m.morphTargetInfluences[0] = cur.jaw; m.morphTargetInfluences[1] = cur.lip; m.morphTargetInfluences[2] = cur.brow; } };
    const ease = (k, want, rate, dt) => { cur[k] += (want - cur[k]) * (1 - Math.exp(-rate * dt)); };
    let breathe = Math.random() * 6;
    const update = (dt, f) => {
      breathe += dt; const st = f?.state || 'idle'; let jaw = 0.04 + 0.03 * Math.max(0, Math.sin(breathe * 1.7)), lip = 0.28, brow = 0.75, rate = 8;
      if (st === 'hold' || st === 'approach' || st === 'home') { lip = 0.45; brow = 1; jaw = 0.1 + 0.05 * Math.max(0, Math.sin(breathe * 2.3)); }
      if (st === 'attack' && f.B) { const tele = f.tele || f.B.tele || 1, u = f.st / tele; brow = 1; lip = Math.min(1, 0.45 + 0.8 * u); jaw = u < 1 ? 0.15 + 0.75 * sm(0.35, 1, u) : Math.max(0.35, 1 - (f.st - tele) * 1.2); rate = 12; }
      if (st === 'special' || st === 'intro') { brow = 1; lip = 1; jaw = 0.55 + 0.45 * Math.abs(Math.sin(f.st * 3.1)); rate = 14; }
      if (st === 'stagger' || st === 'knock') { brow = 1; lip = 0.8; jaw = 0.5; rate = 16; }
      if (st === 'down' || st === 'getup' || st === 'dying' || st === 'out') { brow = 0.2; lip = 0.05; jaw = 0.3; rate = 3; }
      if (f?.flinch > 0.2) { lip = Math.max(lip, 0.8); jaw = Math.max(jaw, 0.45); }
      ease('jaw', jaw, rate, dt); ease('lip', lip, rate, dt); ease('brow', brow, rate * 0.6, dt); set();
    };
    made.face = { set, update, meshes, get: () => ({ ...cur }) };
    const dispose0 = made.dispose; made.dispose = () => { for (const m of meshes) m.removeFromParent(); dispose0(); };
    return made;
  };
  return kit;
}
