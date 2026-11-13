// Mog City: how a chase car keeps to the road (pure: no scene, no globals; index.js and tests/chase-lane.test.mjs).
//   follow(P, path, vmax) -> { ax, az, vt, seg, cross }: the car (P { x, z, speed, seg }) projected onto its planned
//     path ([[x, z], ...], nav.route's), a point a lookahead on down it from there, and the speed it can be at for the
//     corners in the next 120 m. P.seg (the segment it is on) only moves on; set it to 0 on a new plan.
//   roadClear(onRoadway, x0, z0, x1, z1, maxOff = 2) -> true when the line between is on the road but for maxOff m in
//     all (a junction's corner cut)
//   rejoin(P, dt, ctx) -> null | { ax, az, vt }: off the road (ctx.onRoadway) over REJOIN.after s and not excused
//     (ctx.exempt), back to its lane (ctx.locate(x, z, h) -> { x, z, heading }) 8 m on its way, at most REJOIN.v m/s,
//     until it has been on the road REJOIN.back s; P.offT (its time off the road) tells the caller when to put it back
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
// the follower: lookahead m (4 + 0.35 v, 6..16); the corners: a lateral grip of 8 m/s2 (v <= sqrt(8 R)), its steering's
// own limit (1.55 rad/s: v <= 1.3 R), braking at 9 m/s2 from 3 m short of each, radius from its turn and shorter leg
export const FOLLOW = { look0: 4, lookV: 0.35, lookMin: 6, lookMax: 16, aLat: 8, yaw: 1.3, brake: 9, horizon: 120, rMin: 3, rMax: 14 };
export const REJOIN = { after: 0.25, back: 0.3, ahead: 8, v: 12, respawn: 4 };

// the speed it can be at and still come round to point at (ax, az): the circle from where it is, tangent to its
// heading, through that point (R = D / 2 sin(err)), at the corners' lateral grip and steering limit
export function reach(P, ax, az) {
  const dx = ax - P.x, dz = az - P.z, D = Math.hypot(dx, dz);
  if (D < 0.5) return Infinity;
  const h = (P.speed || 0) < -1 ? P.h + Math.PI : P.h;
  const err = Math.abs(Math.atan2(Math.sin(Math.atan2(dx, dz) - h), Math.cos(Math.atan2(dx, dz) - h)));
  // (a small correction (under ~14 degrees) needn't be made by the aim point itself: no limit)
  if (err < 0.25) return Infinity;
  const R = err >= Math.PI / 2 ? D / 2 : D / (2 * Math.sin(err));
  return cornerV(Math.max(FOLLOW.rMin, R));
}
const cornerV = (R) => Math.min(Math.sqrt(FOLLOW.aLat * R), FOLLOW.yaw * R);

export function follow(P, path, vmax) {
  const n = path.length;
  if (!n) return { ax: P.x, az: P.z, vt: 0, seg: 0, cross: 0 };
  if (n === 1) return { ax: path[0][0], az: path[0][1], vt: vmax, seg: 0, cross: Math.hypot(path[0][0] - P.x, path[0][1] - P.z) };
  // (projected onto the segments from the one before its own to three on: the nearest)
  const s0 = clamp(P.seg | 0, 0, n - 2);
  let bi = s0, bt = 0, bd = Infinity;
  for (let i = Math.max(0, s0 - 1); i <= Math.min(n - 2, s0 + 3); i++) {
    const [a0, a1] = path[i], [b0, b1] = path[i + 1], ex = b0 - a0, ez = b1 - a1, L2 = ex * ex + ez * ez || 1e-9;
    const t = clamp(((P.x - a0) * ex + (P.z - a1) * ez) / L2, 0, 1), d = Math.hypot(a0 + ex * t - P.x, a1 + ez * t - P.z);
    if (d < bd - 0.01) { bd = d; bi = i; bt = t; }
  }
  // (on to the next segment once at the end of this one)
  if (bt >= 1 && bi < n - 2) { bi++; bt = 0; }
  const seg = Math.max(s0, bi);
  if (seg > bi) { bi = seg; bt = 0; }
  // the lookahead point, from the projection on down the path
  const v = Math.abs(P.speed || 0), look = clamp(FOLLOW.look0 + FOLLOW.lookV * v, FOLLOW.lookMin, FOLLOW.lookMax);
  let i = bi, sx = path[i][0] + (path[i + 1][0] - path[i][0]) * bt, sz = path[i][1] + (path[i + 1][1] - path[i][1]) * bt;
  let left = look, ax = path[n - 1][0], az = path[n - 1][1];
  while (i + 1 < n) {
    const [b0, b1] = path[i + 1], sl = Math.hypot(b0 - sx, b1 - sz);
    if (sl >= left) { ax = sx + ((b0 - sx) * left) / (sl || 1); az = sz + ((b1 - sz) * left) / (sl || 1); break; }
    left -= sl; sx = b0; sz = b1; i++;
  }
  // the speed: every corner ahead within the horizon, its radius from its turn and its shorter leg
  let vt = vmax, dist = 0, px = path[bi][0] + (path[bi + 1][0] - path[bi][0]) * bt, pz = path[bi][1] + (path[bi + 1][1] - path[bi][1]) * bt;
  for (let k = bi + 1; k + 1 < n && dist < FOLLOW.horizon; k++) {
    const [c0, c1] = path[k], [p0, p1] = path[k - 1], [n0, n1] = path[k + 1];
    dist += Math.hypot(c0 - px, c1 - pz); px = c0; pz = c1;
    const ux = c0 - p0, uz = c1 - p1, wx = n0 - c0, wz = n1 - c1, lu = Math.hypot(ux, uz), lw = Math.hypot(wx, wz);
    if (lu < 1e-3 || lw < 1e-3) continue;
    const th = Math.acos(clamp((ux * wx + uz * wz) / (lu * lw), -1, 1));
    if (th < 0.05) continue;
    const R = clamp(Math.min(lu, lw) / 2 / Math.tan(th / 2), FOLLOW.rMin, FOLLOW.rMax);
    const vc = cornerV(R);
    vt = Math.min(vt, Math.sqrt(vc * vc + 2 * FOLLOW.brake * Math.max(0, dist - 3)));
  }
  // (and coming round to its next corner, and to the lookahead, from the way the car itself points now)
  const nx = path[Math.min(n - 1, bi + 1)];
  vt = Math.min(vt, reach(P, ax, az), reach(P, nx[0], nx[1]));
  P.seg = seg;
  return { ax, az, vt, seg, cross: bd };
}

export function roadClear(onRoadway, x0, z0, x1, z1, maxOff = 2) {
  const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.ceil(L / 2)), step = L / n;
  let off = 0;
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    if (!onRoadway(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t) && (off += step) > maxOff) return false;
  }
  return true;
}

// straight at him (direct) only along the road: the line to where it aims on the road but for a corner cut; or him
// within DIRECT.ram m (the ram itself); or him off the road (parked on a lawn, a plaza) within DIRECT.off m: then it
// leaves the road on purpose (excused: no rejoin)
export const DIRECT = { ram: 4, off: 25 };
export const excused = (onRoadway, T, d) => d < DIRECT.off && !onRoadway(T.x, T.z);
export function directOK(onRoadway, P, T, d, ax, az) {
  if (d < DIRECT.ram || excused(onRoadway, T, d)) return true;
  if (!roadClear(onRoadway, P.x, P.z, ax, az)) return false;
  // (and from where its momentum carries it first: the arc it drives, not just the chord)
  const k = clamp(Math.abs(P.speed || 0) * 0.4, 2, d / 2), h = (P.speed || 0) < -1 ? P.h + Math.PI : P.h;
  const fx = P.x + Math.sin(h) * k, fz = P.z + Math.cos(h) * k;
  return onRoadway(fx, fz) && roadClear(onRoadway, fx, fz, ax, az);
}
// turning hard and slow with its nose about to leave the road (a U-turn on a street too narrow for it): the moment
// to back up instead (a three-point turn)
export function noseOff(onRoadway, P, err) {
  if (Math.abs(err) < 0.9 || Math.abs(P.speed || 0) > 8 || !onRoadway(P.x, P.z)) return false;
  const k = (P.hl || 2.4) + 1.5;
  return !onRoadway(P.x + Math.sin(P.h) * k, P.z + Math.cos(P.h) * k);
}
// backing up (a J-turn, off a wall): only while the road is behind it; on the road now and off it 3 m behind, it
// stops backing and drives on instead
export function backOK(onRoadway, P) {
  const bx = P.x - Math.sin(P.h) * (P.hl || 2.4) - Math.sin(P.h) * 3, bz = P.z - Math.cos(P.h) * (P.hl || 2.4) - Math.cos(P.h) * 3;
  return !onRoadway(P.x, P.z) || onRoadway(bx, bz);
}

export function rejoin(P, dt, ctx) {
  const on = ctx.onRoadway(P.x, P.z);
  if (on) { P.offT = 0; P.onT = (P.onT || 0) + dt; } else { P.offT = (P.offT || 0) + dt; P.onT = 0; }
  if (ctx.exempt) { P.rejoin = false; return null; }
  if (!P.rejoin && P.offT > REJOIN.after) P.rejoin = true;
  if (P.rejoin && P.onT > REJOIN.back) { P.rejoin = false; P.path = null; return null; }
  if (!P.rejoin) return null;
  const L = ctx.locate(P.x, P.z, P.speed < -1 ? P.h + Math.PI : P.h);
  if (!L) return null;
  // (its lane, 8 m on the way the car faces along it)
  let fx = Math.sin(L.heading), fz = Math.cos(L.heading);
  if (fx * Math.sin(P.h) + fz * Math.cos(P.h) < 0) { fx = -fx; fz = -fz; }
  P.path = null;
  return { ax: L.x + fx * REJOIN.ahead, az: L.z + fz * REJOIN.ahead, vt: Math.min(REJOIN.v, ctx.vmax ?? REJOIN.v) };
}
