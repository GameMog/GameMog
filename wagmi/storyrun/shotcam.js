// Mog City story runner: a cutscene shot's lens, beyond where it was written (runner.js shotList):
//  - a move (shot.move): the lens goes somewhere over the shot instead of standing still. 'push' in toward what it looks
//    at (amount: the share of the way, 0.15; at most 1.4 m), 'pull' out, 'orbit' round it (amount: degrees, 14; + to
//    the lens's right), 'crane' up (m, 0.9) looking a little down, 'drop' down, 'drift' sideways (m, 0.7; + right),
//    'track' sideways with its look (m, 1.2). A world's `cine: { drift }` gives every street shot that has no move of
//    its own a slow one ('push' or 'drift', a small amount): no shot is a still picture.
//  - a path (shot.path: [ref, ref, ...], two or more lens points as `cam` takes them): the lens along a smooth curve
//    through them at an even speed (a centripetal Catmull-Rom, timed by its length), eased in and out.
//  - its room: never in a car's body (carSight: the story's cars, his own, as boxes, a line from the face to the lens
//    stopped at the first one it meets, the car the face is in left out), never under a deck it is not under with its
//    subject (a lower level's roof), and not within ROOM m of a wall when it can step away from it (clearRoom).
// Pure: the runner hands in sight(a, b) (reach.js: the share of the way open before a wall) and the cars.
export const ROOM = 1.5;
export const MOVES = ['push', 'pull', 'orbit', 'crane', 'drop', 'drift', 'track'];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const len = (a) => Math.hypot(a[0], a[1], a[2]);

// the end of a move: { B, LB } (the lens and its look at the end of the shot) from where it starts (A, looking at LA)
export function shotMove(move, A, LA, amount = null) {
  const m = String(move || '').toLowerCase(); if (!MOVES.includes(m)) return null;
  const d = sub(LA, A), dist = len(d) || 1, fl = Math.hypot(d[0], d[2]) || 1, right = [-d[2] / fl, 0, d[0] / fl];
  const a = amount == null ? null : +amount;
  if (m === 'push' || m === 'pull') {
    const k = Math.min(1.4, dist * (a ?? 0.15)) * (m === 'push' ? 1 : -1);
    // (never closer than 0.6 m to what it looks at)
    const step = m === 'push' ? Math.min(k, Math.max(0, dist - 0.6)) : k;
    return { B: add(A, mul(d, step / dist)), LB: LA.slice() };
  }
  if (m === 'orbit') {
    const r = (((a ?? 14) * Math.PI) / 180), c = Math.cos(r), s = Math.sin(r), x = A[0] - LA[0], z = A[2] - LA[2];
    // (+ to the lens's right: round the look point clockwise seen from above)
    return { B: [LA[0] + x * c + z * s, A[1], LA[2] - x * s + z * c], LB: LA.slice() };
  }
  if (m === 'crane' || m === 'drop') { const k = (a ?? 0.9) * (m === 'crane' ? 1 : -1); return { B: [A[0], A[1] + k, A[2]], LB: [LA[0], LA[1] + k * 0.25, LA[2]] }; }
  if (m === 'drift') { const k = a ?? 0.7; return { B: add(A, mul(right, k)), LB: LA.slice() }; }
  if (m === 'track') { const k = a ?? 1.2; return { B: add(A, mul(right, k)), LB: add(LA, mul(right, k)) }; }
  return null;
}
// a smooth path through the lens points, timed by its length: (u 0..1) -> [x, y, z]. Centripetal Catmull-Rom (alpha
// 0.5: no loops or cusps at close points), sampled into a length table once
export function pathOf(pts) {
  if (!pts || pts.length < 2) return null;
  const P = [mul(sub(pts[0], pts[1]), 1).map((v, i) => pts[0][i] + v), ...pts, pts[pts.length - 1].map((v, i) => v + (v - pts[pts.length - 2][i]))];
  const seg = (p0, p1, p2, p3, t) => {
    const tj = (a, b) => Math.pow(Math.max(1e-6, len(sub(b, a))), 0.5);
    const t0 = 0, t1 = t0 + tj(p0, p1), t2 = t1 + tj(p1, p2), t3 = t2 + tj(p2, p3), u = t1 + (t2 - t1) * t;
    const L = (a, b, ta, tb) => (ta === tb ? a : a.map((v, i) => ((tb - u) / (tb - ta)) * v + ((u - ta) / (tb - ta)) * b[i]));
    const A1 = L(p0, p1, t0, t1), A2 = L(p1, p2, t1, t2), A3 = L(p2, p3, t2, t3), B1 = L(A1, A2, t0, t2), B2 = L(A2, A3, t1, t3);
    return L(B1, B2, t1, t2);
  };
  const N = 24, samples = [];
  for (let i = 1; i < P.length - 2; i++) for (let k = 0; k < N; k++) samples.push(seg(P[i - 1], P[i], P[i + 1], P[i + 2], k / N));
  samples.push(pts[pts.length - 1].slice());
  const acc = [0]; for (let i = 1; i < samples.length; i++) acc.push(acc[i - 1] + len(sub(samples[i], samples[i - 1])));
  const total = acc[acc.length - 1] || 1;
  return (u) => {
    const want = Math.max(0, Math.min(1, u)) * total; let lo = 0, hi = acc.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (acc[mid] < want) lo = mid; else hi = mid; }
    const k = (want - acc[lo]) / Math.max(1e-6, acc[hi] - acc[lo]);
    return samples[lo].map((v, i) => v + (samples[hi][i] - v) * k);
  };
}
// a line's way through boxes: the story's cars as boxes { x, z, h (heading), hx (half width), z0, z1 (along, back and
// front), y0, y1 }. -> (a, b) the share of the way from a to b open before the first box (1: none). A box holding `a`
// (the face in the car) is left out: the lens looks in through its glass
export function carSight(boxes) {
  const inBox = (B, p, pad = 0) => {
    const dx = p[0] - B.x, dz = p[2] - B.z, s = Math.sin(B.h), c = Math.cos(B.h), al = dx * s + dz * c, ac = dx * c - dz * s;
    return al > B.z0 - pad && al < B.z1 + pad && Math.abs(ac) < B.hx + pad && p[1] > B.y0 - pad && p[1] < B.y1 + pad;
  };
  // (a person's box (person: true) is never left out for holding the face, two people in a hug overlap; it only
  // counts past the first 0.4 m from the face, so the face's own shoulders and hair are not a wall)
  return (a, b) => {
    const live = boxes.filter((B) => B.person || !inBox(B, a, 0.05));
    if (!live.length) return 1;
    const L = len(sub(b, a)), n = Math.max(2, Math.ceil(L / 0.15));
    for (let k = 1; k <= n; k++) { const t = k / n, p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; for (const B of live) if ((!B.person || t * L > 0.4) && inBox(B, p, B.person ? 0 : 0.12)) return (k - 1) / n; }
    return 1;
  };
}
// the lens moved to have room: away from what is within ROOM m of it, sideways and back (8 ways round it, level),
// keeping its line to L open; and under a deck its subject is under (roofY(x, z): the deck's underside over the
// subject's level there, or Infinity). -> [x, y, z] (the same point when it has room already)
export function clearRoom(A, L, sight, roofY = null) {
  let P = A.slice();
  if (roofY) { const r = roofY(P[0], P[2]); if (Number.isFinite(r) && P[1] > r - 0.35) P[1] = Math.max(L[1] - 0.2, r - 0.5); }
  if (typeof sight !== 'function') return P;
  for (let it = 0; it < 2; it++) {
    let px = 0, pz = 0, hit = 0;
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4, D = [P[0] + Math.cos(a) * ROOM, P[1], P[2] + Math.sin(a) * ROOM], f = sight(P, D);
      if (f < 0.999) { const w = 1 - f; px -= Math.cos(a) * w; pz -= Math.sin(a) * w; hit++; }
    }
    if (!hit) break;
    const n = Math.hypot(px, pz); if (n < 1e-3) break;
    const step = Math.min(ROOM, 0.6 + 0.3 * hit), Q = [P[0] + (px / n) * step, P[1], P[2] + (pz / n) * step];
    // (only where the face is still in sight from there)
    if (sight(L, Q) >= 0.999) P = Q; else break;
  }
  return P;
}
// a lens inside a car's body (a box, carSight's) that what it looks at is not in, moved out of it: back along the line
// from what it looks at (L) through the lens until it is 0.3 m clear of the box; above its roof when that is nearer.
// (A lens and a face in the same car is an interior shot: kept.) -> [x, y, z] (the same point when it is in none)
export const inBoxes = (P, boxes) => (boxes || []).some((B) => { const dx = P[0] - B.x, dz = P[2] - B.z, s = Math.sin(B.h), c = Math.cos(B.h), al = dx * s + dz * c, ac = dx * c - dz * s; return al > B.z0 && al < B.z1 && Math.abs(ac) < B.hx && P[1] > B.y0 && P[1] < B.y1; });
// (keepSame false: even a lens in the face's own car is moved out: a push that began outside it and ran into its body)
export function outOfBoxes(P, L, boxes, { keepSame = true } = {}) {
  const inside = (B, p, pad) => {
    const dx = p[0] - B.x, dz = p[2] - B.z, s = Math.sin(B.h), c = Math.cos(B.h), al = dx * s + dz * c, ac = dx * c - dz * s;
    return al > B.z0 - pad && al < B.z1 + pad && Math.abs(ac) < B.hx + pad && p[1] > B.y0 - pad && p[1] < B.y1 + pad;
  };
  // (a lens in the same car as the face it looks at is an interior shot, on purpose: kept)
  const B = (boxes || []).find((b) => inside(b, P, 0) && !(keepSame && inside(b, L, 0.05))); if (!B) return P;
  const d = sub(P, L), n = len(d) || 1, u = mul(d, 1 / n);
  let out = null;
  for (let t = 0.1; t <= 8; t += 0.1) { const Q = add(P, mul(u, t)); if (!inside(B, Q, 0.3)) { out = Q; break; } }
  const up = [P[0], B.y1 + 0.35, P[2]];
  if (!out || len(sub(out, P)) > up[1] - P[1]) out = up;
  return out;
}
