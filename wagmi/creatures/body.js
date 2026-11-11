// Mog City: a library creature's body as capsules (wagmi/library/creature.js makes the creature; this measures it), so a
// blow lands on the body it is for: a T-rex's shin, a scorpion's claw, a knight's breastplate, not a man-sized capsule
// from the hips to the head. Measured once per kind from the creature's own skin at rest: each bone's vertices (the ones
// it moves most), a capsule along their main axis (trimmed of their outliers) as thick as most of them lie from it. The
// capsules ride on their bones, so they follow every clip and every pose the fight puts on top.
//   shapeOf(kit, made) -> { caps: [{ bone, a, b, r }] (a, b in the bone's own frame, r at the kind's own size), feet }
//   new Body(made, shape): .update() after the pose is final (world capsules), .dist(p) (to the surface, m; < 0 inside),
//     .nearest(p, yLo, yHi, out) (the surface point nearest p in a height band), .segDist(a, b) (a segment to the
//     surface), .pushOut(p, r, h) (p moved out of the body's footprint below h m over its feet)
import * as THREE from 'three/webgpu';

const SHAPES = new WeakMap(); // kit -> its shape (one per kind)
const MIN_VERTS = 24;         // (a bone that moves fewer vertices than this is its neighbours' business)

// the bones' rest matrices in the creature's own frame (forward +z, feet at y 0, before its turn and scale)
function restMatrices(J) {
  const M = new Array(J.bones.length);
  const at = (i) => {
    if (M[i]) return M[i];
    const b = J.bones[i], m = new THREE.Matrix4().compose(new THREE.Vector3().fromArray(b.t), new THREE.Quaternion().fromArray(b.r), new THREE.Vector3().fromArray(b.s));
    return (M[i] = b.parent >= 0 ? at(b.parent).clone().multiply(m) : m);
  };
  J.bones.forEach((_, i) => at(i));
  return M;
}
// (the main axis of a cloud of points: power iteration on its covariance)
function mainAxis(P, mu) {
  let xx = 0, xy = 0, xz = 0, yy = 0, yz = 0, zz = 0;
  for (const p of P) { const x = p[0] - mu[0], y = p[1] - mu[1], z = p[2] - mu[2]; xx += x * x; xy += x * y; xz += x * z; yy += y * y; yz += y * z; zz += z * z; }
  let v = [0.57, 0.58, 0.58];
  for (let it = 0; it < 32; it++) {
    const w = [xx * v[0] + xy * v[1] + xz * v[2], xy * v[0] + yy * v[1] + yz * v[2], xz * v[0] + yz * v[1] + zz * v[2]];
    const L = Math.hypot(w[0], w[1], w[2]) || 1; v = [w[0] / L, w[1] / L, w[2] / L];
  }
  return v;
}
const pct = (arr, q) => { const s = Float64Array.from(arr).sort(); return s.length ? s[Math.min(s.length - 1, Math.floor(q * (s.length - 1)))] : 0; };

/** The capsules of one kind (measured from `made`'s shared skin the first time; kept on the kit). */
export function shapeOf(kit, made) {
  if (SHAPES.has(kit)) return SHAPES.get(kit);
  const J = kit.json, g = made.mesh.geometry;
  const pos = g.attributes.position.array, si = g.attributes.skinIndex.array, sw = g.attributes.skinWeight.array;
  const n = pos.length / 3, nb = J.bones.length;
  const sets = Array.from({ length: nb }, () => []);
  for (let v = 0; v < n; v++) {
    let bi = si[v * 4], bw = sw[v * 4];
    for (let k = 1; k < 4; k++) if (sw[v * 4 + k] > bw) { bw = sw[v * 4 + k]; bi = si[v * 4 + k]; }
    sets[bi].push([pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]]);
  }
  const M = restMatrices(J), caps = [];
  for (let b = 0; b < nb; b++) {
    const P = sets[b]; if (P.length < MIN_VERTS) continue;
    const mu = [0, 0, 0]; for (const p of P) { mu[0] += p[0] / P.length; mu[1] += p[1] / P.length; mu[2] += p[2] / P.length; }
    const e = mainAxis(P, mu);
    const t = P.map((p) => (p[0] - mu[0]) * e[0] + (p[1] - mu[1]) * e[1] + (p[2] - mu[2]) * e[2]);
    let t0 = pct(t, 0.03), t1 = pct(t, 0.97);
    const A = [mu[0] + e[0] * t0, mu[1] + e[1] * t0, mu[2] + e[2] * t0], B = [mu[0] + e[0] * t1, mu[1] + e[1] * t1, mu[2] + e[2] * t1];
    // (how far the vertices lie from that line, most of them: its thickness)
    const d = P.map((p) => { const u = Math.max(t0, Math.min(t1, (p[0] - mu[0]) * e[0] + (p[1] - mu[1]) * e[1] + (p[2] - mu[2]) * e[2])); return Math.hypot(p[0] - mu[0] - e[0] * u, p[1] - mu[1] - e[1] * u, p[2] - mu[2] - e[2] * u); });
    const r = Math.max(0.03, pct(d, 0.75));
    // (the round ends of the capsule reach r past its line: the line brought in by that much, so its ends are the body's)
    const half = (t1 - t0) / 2, cut = Math.min(r * 0.8, half);
    t0 += cut; t1 -= cut;
    const a = new THREE.Vector3(mu[0] + e[0] * t0, mu[1] + e[1] * t0, mu[2] + e[2] * t0), bb = new THREE.Vector3(mu[0] + e[0] * t1, mu[1] + e[1] * t1, mu[2] + e[2] * t1);
    // (kept in the bone's own frame: it rides on the bone)
    const inv = M[b].clone().invert();
    caps.push({ bone: b, name: J.bones[b].name, a: a.applyMatrix4(inv), b: bb.applyMatrix4(inv), r, lo: Math.min(A[1], B[1]) - r, n: P.length });
  }
  // the feet: the lowest bones that end a leg (each one's height at rest over the ground, for its footfalls)
  const names = J.bones.map((b) => b.name), feet = [];
  for (const nm of ['hpaw_L', 'hpaw_R', 'fpaw_L', 'fpaw_R', 'foot_L', 'foot_R', 'toe_L', 'toe_R', 'metatarsus_L', 'metatarsus_R']) {
    const i = names.indexOf(nm); if (i < 0) continue;
    // (a leg counted once: its paw, else its foot, else its toe)
    const side = nm.slice(-1), front = nm[0] === 'f' && nm !== 'foot_L' && nm !== 'foot_R';
    if (feet.some((f) => f.side === side && f.front === front)) continue;
    feet.push({ bone: i, name: nm, side, front, y0: new THREE.Vector3().setFromMatrixPosition(M[i]).y });
  }
  const shape = { caps, feet };
  SHAPES.set(kit, shape);
  return shape;
}

// ------------------------------------------------------------------ geometry
const _d = new THREE.Vector3(), _e = new THREE.Vector3(), _f = new THREE.Vector3(), _q = new THREE.Vector3();
/** The distance from p to the segment a-b (and the nearest point on it in `out`). */
export function pointSeg(p, a, b, out = _q) {
  _d.subVectors(b, a); const L2 = _d.lengthSq();
  const u = L2 > 1e-9 ? Math.max(0, Math.min(1, _e.subVectors(p, a).dot(_d) / L2)) : 0;
  out.copy(a).addScaledVector(_d, u);
  return out.distanceTo(p);
}
/** The distance between two segments p0-p1 and q0-q1 (closest points, clamped). */
export function segSeg(p0, p1, q0, q1) {
  const d1 = _d.subVectors(p1, p0), d2 = _e.subVectors(q1, q0), r = _f.subVectors(p0, q0);
  const a = d1.dot(d1), e = d2.dot(d2), f = d2.dot(r);
  let s, t;
  if (a <= 1e-9 && e <= 1e-9) return p0.distanceTo(q0);
  if (a <= 1e-9) { s = 0; t = Math.max(0, Math.min(1, f / e)); }
  else {
    const c = d1.dot(r);
    if (e <= 1e-9) { t = 0; s = Math.max(0, Math.min(1, -c / a)); }
    else {
      const b = d1.dot(d2), den = a * e - b * b;
      s = den > 1e-9 ? Math.max(0, Math.min(1, (b * f - c * e) / den)) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = Math.max(0, Math.min(1, -c / a)); } else if (t > 1) { t = 1; s = Math.max(0, Math.min(1, (b - c) / a)); }
    }
  }
  const x = p0.x + d1.x * s - (q0.x + d2.x * t), y = p0.y + d1.y * s - (q0.y + d2.y * t), z = p0.z + d1.z * s - (q0.z + d2.z * t);
  return Math.hypot(x, y, z);
}

/** One creature's capsules in the world, from its bones as they stand now. */
export class Body {
  constructor(made, shape) {
    this.made = made; this.k = made.scale;
    const bones = made.skeleton.bones;
    this.caps = shape.caps.map((s) => ({ s, bone: bones[s.bone], a: new THREE.Vector3(), b: new THREE.Vector3(), r: s.r * made.scale, name: s.name }));
    this.ok = false;
  }
  // (after the frame's pose: the mixer, and whatever the fight bends on top)
  update() { for (const C of this.caps) { const m = C.bone.matrixWorld; C.a.copy(C.s.a).applyMatrix4(m); C.b.copy(C.s.b).applyMatrix4(m); } this.ok = true; }
  /** From p to the body's surface (m; under 0 inside it); the capsule it is nearest in this.hit. */
  dist(p) {
    let best = Infinity, hit = null;
    for (const C of this.caps) { const d = pointSeg(p, C.a, C.b) - C.r; if (d < best) { best = d; hit = C; } }
    this.hit = hit; return best;
  }
  /** The segment a-b to the body's surface (m), the nearest capsule in this.hit. */
  segDist(a, b, only = null) {
    let best = Infinity, hit = null;
    for (const C of this.caps) { if (only && !only.has(C.name)) continue; const d = segSeg(a, b, C.a, C.b) - C.r; if (d < best) { best = d; hit = C; } }
    this.hit = hit; return best;
  }
  /** The point of the surface nearest p, of the capsules that reach into the height band yLo..yHi (or null). */
  nearest(p, yLo, yHi, out) {
    let best = Infinity, got = false;
    for (const C of this.caps) {
      if (Math.min(C.a.y, C.b.y) - C.r > yHi || Math.max(C.a.y, C.b.y) + C.r < yLo) continue;
      const d = pointSeg(_f.copy(p).setY(Math.max(yLo, Math.min(yHi, p.y))), C.a, C.b, _q);
      if (d - C.r < best) {
        best = d - C.r; got = true;
        // (on its surface, toward p, at a height in the band)
        out.copy(_q); const dx = p.x - _q.x, dz = p.z - _q.z, L = Math.hypot(dx, dz) || 1;
        out.x += dx / L * C.r; out.z += dz / L * C.r; out.y = Math.max(yLo, Math.min(yHi, _q.y));
      }
    }
    return got ? out : null;
  }
  /** Where a man at p strikes it: the point of its surface toward him that is nearest, a part at his fists' height
   *  (y0..y1) counting nearer than one under them (a scorpion's back before its claw tips at his shins). */
  aim(p, y0, y1, out) {
    let best = Infinity, got = false;
    for (const C of this.caps) {
      // (the capsule's point nearest him across the ground, at the band's middle height)
      const d = pointSeg(_f.set(p.x, (y0 + y1) / 2, p.z), C.a, C.b, _q);
      const top = _q.y + C.r, bot = _q.y - C.r, off = top < y0 ? y0 - top : bot > y1 ? bot - y1 : 0;
      const dx = p.x - _q.x, dz = p.z - _q.z, L = Math.hypot(dx, dz) || 1, flat = Math.max(0, L - C.r);
      const score = flat + 2.5 * off; void d;
      if (score < best) { best = score; got = true; out.set(_q.x + dx / L * C.r, Math.max(y0, Math.min(y1, _q.y)), _q.z + dz / L * C.r); }
    }
    return got ? out : null;
  }
  /** Moves p (on the ground) out of the body's footprint, r m round it, where the body comes below h m over `foot`. */
  pushOut(p, r, h, foot) {
    let moved = false;
    for (const C of this.caps) {
      if (Math.min(C.a.y, C.b.y) - C.r > foot + h) continue;
      // (2D, on the ground: the capsule's line from above)
      const ax = C.a.x, az = C.a.z, dx = C.b.x - ax, dz = C.b.z - az, L2 = dx * dx + dz * dz;
      const u = L2 > 1e-9 ? Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.z - az) * dz) / L2)) : 0;
      const qx = ax + dx * u, qz = az + dz * u, ex = p.x - qx, ez = p.z - qz, d = Math.hypot(ex, ez), m = C.r + r;
      if (d >= m) continue;
      const nx = d > 1e-4 ? ex / d : 1, nz = d > 1e-4 ? ez / d : 0;
      p.x = qx + nx * m; p.z = qz + nz * m; moved = true;
    }
    return moved;
  }
}
