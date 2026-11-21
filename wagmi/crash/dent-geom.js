// Mog City (jh-rc): the geometry both kinds of dent share (wagmi/crash/damage.js's, on any car's body meshes, and the
// Tensore's own, wagmi/storyrun/wedge.js): the wheels kept clear of the metal pushed in, and the crumple's shape.
// No three.js here but what is handed in (tests/dent.test.mjs runs it in node).
//   wheelKeeps(objs, toFrame, rOf)  the wheels' keep-out drums in a frame (the car's): for each wheel object (a group of
//                                   meshes, the tyre the largest), its hub (cy, cz), radius R and its span across (x0..x1);
//                                   toFrame(mesh) -> a Matrix4-like { elements } from that mesh's geometry to the frame
//   keepRoom(p, keeps)              how far (m) a point p (in the frame) may be pushed by a wheel: K of its distance to the
//                                   nearest wheel's drum (unbounded clear of them all), so the metal by a wheel gives way
//                                   less and less and never reaches the tyre, and smoothly (the push is the least of the
//                                   dent's own and this, neither steeper than 1 along the way in, so no face folds over, as
//                                   one would where a point stopped short at the tyre was passed by a free one beside it)
//   keepClear(p, dir, d, keeps)     how far (0..d) a point p may move along dir without entering a wheel's drum
//   crumple(x, y, z)                a smooth -1..1 field over the panel (wavelengths of 35-60 cm): the depth wavers with
//                                   it, so the bowl reads as buckled metal, never so steeply it folds a face over
//   crease(x, y, z)                 a finer one for the normals alone (the light breaking up over the crumple: no vertex moves)
export const KEEP = { M: 0.04, K: 0.75 };

const tf = (e, x, y, z) => [e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]];

export function wheelKeeps(objs, toFrame) {
  const out = [];
  for (const o of objs || []) {
    if (!o || typeof o.traverse !== 'function') continue;
    let best = null, x0 = Infinity, x1 = -Infinity;
    o.traverse((m) => {
      if (!m.isMesh || !m.geometry) return;
      const g = m.geometry; if (!g.boundingBox && g.computeBoundingBox) g.computeBoundingBox();
      const b = g.boundingBox; if (!b) return;
      const e = toFrame(m).elements;
      const sx = Math.hypot(e[0], e[1], e[2]), sy = Math.hypot(e[4], e[5], e[6]), sz = Math.hypot(e[8], e[9], e[10]);
      const h = [(b.max.x - b.min.x) / 2 * sx, (b.max.y - b.min.y) / 2 * sy, (b.max.z - b.min.z) / 2 * sz];
      const c = tf(e, (b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2);
      // (a wheel's part is a drum: its two big half extents its radius, the small one half its width)
      const R = Math.max(...h), hw = Math.min(...h);
      if (!(R > 0.05) || !Number.isFinite(c[0])) return;
      if (!best || R > best.R) best = { cy: c[1], cz: c[2], R };
      x0 = Math.min(x0, c[0] - hw); x1 = Math.max(x1, c[0] + hw);
    });
    if (best && x1 > x0) out.push({ ...best, x0, x1 });
  }
  return out;
}

function inKeep(x, y, z, keeps, M) {
  for (const k of keeps) {
    if (x < k.x0 - M || x > k.x1 + M) continue;
    if (Math.hypot(y - k.cy, z - k.cz) < k.R + M) return true;
  }
  return false;
}
export function keepClear(p, dir, d, keeps, M = KEEP.M) {
  if (!(d > 0)) return 0;
  if (!keeps || !keeps.length) return d;
  const at = (t) => inKeep(p.x + dir.x * t, p.y + dir.y * t, p.z + dir.z * t, keeps, M);
  // (a point already in the drum (the wheel well's own lining): left where it is)
  if (at(0)) return 0;
  const N = 6;
  let lo = 0;
  for (let i = 1; i <= N; i++) {
    const t = (d * i) / N;
    if (at(t)) { let hi = t; for (let j = 0; j < 6; j++) { const m = (lo + hi) / 2; if (at(m)) hi = m; else lo = m; } return lo; }
    lo = t;
  }
  return d;
}

// (the distance from p to the nearest drum's surface, 0 inside one)
export function keepDist(p, keeps, M = KEEP.M) {
  let best = Infinity;
  for (const k of keeps || []) {
    const rad = Math.max(0, Math.hypot(p.y - k.cy, p.z - k.cz) - (k.R + M));
    const ax = Math.max(0, k.x0 - M - p.x, p.x - (k.x1 + M));
    best = Math.min(best, Math.hypot(rad, ax));
  }
  return best;
}
export function keepRoom(p, keeps, k = KEEP.K) {
  return keeps && keeps.length ? k * keepDist(p, keeps) : Infinity;
}

export const crumple = (x, y, z) => Math.sin(x * 11 + z * 6.5 + 1.3) * Math.sin(y * 13 - z * 8 + 0.7);
export const crease = (x, y, z) => Math.sin(x * 37 + y * 21 - z * 9) * Math.sin(z * 31 - y * 27 + x * 6);
