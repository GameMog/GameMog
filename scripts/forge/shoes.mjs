// THE CHARACTER FORGE: footwear (forge v2.3, SH). Work boots, sneakers and dress shoes (a cap-toe oxford) built as rigid
// objects round the foot, not cloth cut from it (v2.2's shoes were a shell of the foot smoothed into a toe box, and the
// toe box crumpled where the toes were; its leather went orange in the study's warm key):
//   the last     each foot's own points (the foot, and the leg up to the collar or a boot's shaft top) wrapped by two convex
//                bodies (the foot below the ankle, the leg above it) offset by the shoe's room, joined with a fillet where
//                the shin meets the instep, plus a designed toe box (round in plan, the big toe's side straighter, a set
//                height to the tip and room ahead of the toes). The surface is star-shaped round a point inside the
//                heel, so it is one grid (round x up/down) with a clean uv: the seam down the heel's back, as a real shoe's
//                back seam. No toe, tendon or ankle bone can show through it: it never follows the foot's own surface
//   the upper    the last cut at the collar line (a sneaker's padded collar with its heel tab and tongue, a boot's shaft
//                top, an oxford's low topline), the bottom tucked into the sole; a padded roll round the opening
//   the sole     its own mesh: the upper's outline at the sole's top, out by the welt or the cupsole's lip, from the floor
//                up the side (a sneaker's 3 cm cupsole with a toe bumper, a boot's lug sole and stitched welt, an oxford's
//                thin sole and stacked heel), the waist raised under the arch, the toe sprung
//   laces        geometry: criss-crossed over the tongue between the eyelets, laid on the upper, and a bow; a boot's
//                eyelets are brass rings
//   skinned      every point of the shoe on the foot bone alone (one bone: it cannot crumple), a boot's shaft and a
//                sneaker's collar eased onto the shin above the ankle, so the leg never comes out through the opening
//   materials    leather (roughness by finish: an oxford's polish 0.34, a work boot's oiled 0.58), rubber (0.85-0.9),
//                canvas (0.92), each with a normal map from the same 3D paint (grain, weave, seams, stitches, tread); the
//                colours go through the colour guard and are kept out of the warm hues (a brown is a cool, dark brown)
// Every number is in metres in the body's bind space (y up, z forward, +x the character's left).
import { guard } from './colour.mjs';

const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lin = (c) => Math.pow(c / 255, 2.2), enc = (l) => clamp(Math.round(255 * Math.pow(Math.max(0, l), 1 / 2.2)), 0, 255);
const shade = (rgb, k) => rgb.map((c) => enc(lin(c) * k));
const hexRGB = (h, d) => (h ? [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) : d);
const hash3 = (x, y, z) => { let h = (x * 374761393 + y * 668265263 + z * 2147483647) >>> 0; h = ((h ^ (h >>> 13)) * 1274126177) >>> 0; return ((h ^ (h >>> 16)) & 0xffff) / 65535; };
function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), fx = x - xi, fy = y - yi, fz = z - zi, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const L = (a, b, t) => a + (b - a) * t, h = (i, j, k) => hash3(xi + i, yi + j, zi + k);
  return L(L(L(h(0, 0, 0), h(1, 0, 0), u), L(h(0, 1, 0), h(1, 1, 0), u), v), L(L(h(0, 0, 1), h(1, 0, 1), u), L(h(0, 1, 1), h(1, 1, 1), u), v), w);
}
const fbm = (p, s) => vnoise(p[0] / s, p[1] / s, p[2] / s) * 0.55 + vnoise(p[0] / s * 2.3 + 7, p[1] / s * 2.3, p[2] / s * 2.3) * 0.3 + vnoise(p[0] / s * 5.1, p[1] / s * 5.1 + 3, p[2] / s * 5.1) * 0.15;
// (a leather's colour: through the colour guard, then any warm hue's chroma held low, so a brown stays a brown under a
// 2700 K key and never reads orange; blacks and whites are left as they are)
function leatherColour(rgb) {
  const c = guard(rgb).rgb, L = c.map(lin), mx = Math.max(...L), mn = Math.min(...L), g = (L[0] + L[1] + L[2]) / 3;
  // (a black: Mr. Big's shoes' albedo (#100F11, neutral): a near-black's warm cast taken out and its level brought down,
  // so a strong warm key reads it as black leather with warm highlights, not as brown)
  if (Math.max(...c) < 56) { const k = Math.min(1, lin(16) / Math.max(1e-5, g)); return [0, 1, 2].map((i) => enc((g + (L[i] - g) * 0.25) * k)); }
  if (mx < 1e-4 || !(L[0] >= L[1] && L[1] >= L[2])) return c; const sat = (mx - mn) / mx; if (sat <= 0.42) return c;
  const k = 0.42 / sat; return L.map((x) => enc(g + (x - g) * k));
}

/* ------------------------------------------------------------------ the kinds -- */
// soleH: floor to the foot's underside (cm of stack); wrap: how far the sole climbs the upper's side (heel, side, toe);
// room: the last's clearance round the foot; allow: room ahead of the longest toe; toeH: the toe box's height at its
// front, over the foot's underside; collar: the opening's height over the ankle joint (front, side, back); spring: the
// toe's rise; arch: the waist's lift under the arch; welt: the sole's edge out from the upper
export const KINDS = {
  sneaker: { soleH: 0.024, wrap: [0.015, 0.0095, 0.016], room: 0.0038, allow: 0.014, toeH: 0.034, collar: [0.032, -0.012, 0.012], tongue: 0.5, bevel: 0.008, spring: 0.011, arch: 0.002, welt: 0.0035,
    upperBottom: -0.002, rows: 6, eyeW: [0.0135, 0.0115], roll: 0.0055, shaftEase: 0.6, lace: { w: 0.0034, t: 0.0014 }, rough: { upper: 0.9, sole: 0.8, lace: 0.92 } },
  boot: { soleH: 0.027, wrap: [0.006, 0.004, 0.006], room: 0.0038, allow: 0.015, toeH: 0.037, collar: [0.112, 0.108, 0.122], tongue: 0, bevel: 0.009, spring: 0.009, arch: 0.004, welt: 0.0058,
    upperBottom: -0.004, rows: 8, eyeW: [0.0145, 0.0125], roll: 0.006, shaftEase: 0.92, lace: { w: 0.0036, t: 0.0024 }, rough: { upper: 0.4, sole: 0.9, lace: 0.9 } },
  dress: { soleH: 0.022, wrap: [-0.0105, -0.0105, -0.0105], room: 0.0034, allow: 0.02, toeH: 0.027, collar: [0.02, -0.009, -0.004], tongue: 0, bevel: 0.011, spring: 0.011, arch: 0.009, welt: 0.003,
    upperBottom: -0.012, rows: 5, eyeW: [0.0085, 0.0075], roll: 0.0026, shaftEase: 0, lace: { w: 0.0019, t: 0.0016 }, rough: { upper: 0.4, sole: 0.55, lace: 0.6 } },
};

/* ------------------------------------------------------------- the foot's frame -- */
function footFrame(ctx, side) {
  const { bPos, nBody, cls } = ctx, sx = side === 'L' ? 1 : -1, A = ctx.jpos('foot.' + side), pts = [], cl = [], vid = [];
  for (let v = 0; v < nBody; v++) { const c = cls[v]; if ((c !== 4 && c !== 3) || Math.sign(bPos[v * 3]) !== sx) continue; const y = bPos[v * 3 + 1]; if (y > A[1] + 0.2) continue; pts.push([bPos[v * 3], y, bPos[v * 3 + 2]]); cl.push(c); vid.push(v); }
  let yb = 9; for (let i = 0; i < pts.length; i++) if (cl[i] === 4) yb = Math.min(yb, pts[i][1]);
  // (the long axis: the sole region's principal direction in plan)
  const S = pts.filter((p, i) => cl[i] === 4 && p[1] < yb + 0.035); let mx = 0, mz = 0; for (const p of S) { mx += p[0]; mz += p[2]; } mx /= S.length; mz /= S.length;
  let cxx = 0, cxz = 0, czz = 0; for (const p of S) { const x = p[0] - mx, z = p[2] - mz; cxx += x * x; cxz += x * z; czz += z * z; }
  const th = 0.5 * Math.atan2(2 * cxz, czz - cxx), d = [Math.sin(th), Math.cos(th)]; if (d[1] < 0) { d[0] = -d[0]; d[1] = -d[1]; }
  let e = [d[1], -d[0]]; if (e[0] * sx < 0) e = [-e[0], -e[1]];
  const loc = (p) => [(p[0] - A[0]) * d[0] + (p[2] - A[2]) * d[1], (p[0] - A[0]) * e[0] + (p[2] - A[2]) * e[1], p[1]];
  const wld = (a, b, y) => [A[0] + a * d[0] + b * e[0], y, A[2] + a * d[1] + b * e[1]];
  const L = pts.map(loc); let aH = 9, aT = -9; for (let i = 0; i < L.length; i++) if (cl[i] === 4) { if (L[i][1] !== undefined && pts[i][1] < yb + 0.05) aH = Math.min(aH, L[i][0]); aT = Math.max(aT, L[i][0]); }
  const band = (a0, a1, y1 = 9) => { let lo = 9, hi = -9; for (const q of L) if (q[0] > a0 && q[0] < a1 && q[2] < y1) { lo = Math.min(lo, q[1]); hi = Math.max(hi, q[1]); } return [lo, hi]; };
  const ball = band(aT - 0.085, aT - 0.05), heel = band(aH, aH + 0.035, yb + 0.04);
  return { side, sx, A, d, e, loc, wld, pts, cl, vid, L, yb, aH, aT, ball, heel };
}

/* ------------------------------------------------------- convex bodies, the star -- */
function fibDirs(n) { const D = new Float32Array(n * 3), g = Math.PI * (3 - Math.sqrt(5)); for (let i = 0; i < n; i++) { const y = 1 - (2 * (i + 0.5)) / n, r = Math.sqrt(1 - y * y), t = g * i; D[i * 3] = Math.cos(t) * r; D[i * 3 + 1] = y; D[i * 3 + 2] = Math.sin(t) * r; } return D; }
// a convex body's support (its offset by `off`) at the sampled normals, and a ray's exit from it (from c, inside it)
function support(pts, Nn, off) { const n = Nn.length / 3, H = new Float32Array(n); for (let k = 0; k < n; k++) { let m = -9; const a = Nn[k * 3], b = Nn[k * 3 + 1], c = Nn[k * 3 + 2]; for (const p of pts) { const s = a * p[0] + b * p[1] + c * p[2]; if (s > m) m = s; } H[k] = m + off; } return H; }
// (a ray's span through a convex body c may be outside of: [in, out], or null when it misses)
function spanR(H, Nn, c, dir) { let t0 = -9, t1 = 9; for (let k = 0; k < H.length; k++) { const nd = Nn[k * 3] * dir[0] + Nn[k * 3 + 1] * dir[1] + Nn[k * 3 + 2] * dir[2], s = H[k] - (Nn[k * 3] * c[0] + Nn[k * 3 + 1] * c[1] + Nn[k * 3 + 2] * c[2]);
  if (Math.abs(nd) < 1e-6) { if (s < 0) return null; continue; } const t = s / nd; if (nd > 0) { if (t < t1) t1 = t; } else if (t > t0) t0 = t; if (t0 > t1) return null; } return t1 > 0 ? [t0, t1] : null; }
function exitR(H, Nn, c, dir) { let t = 9; for (let k = 0; k < H.length; k++) { const nd = Nn[k * 3] * dir[0] + Nn[k * 3 + 1] * dir[1] + Nn[k * 3 + 2] * dir[2]; if (nd < 1e-5) continue; const s = (H[k] - (Nn[k * 3] * c[0] + Nn[k * 3 + 1] * c[1] + Nn[k * 3 + 2] * c[2])) / nd; if (s < t) t = s; } return Math.max(0.005, t); }

/* --------------------------------------------------------------------- the last -- */
// the star grid: NU round (u 0 at the heel's back, the outward side at u 0.25), NV from straight up to straight down
const NU = 144, NV = 104;
function last(ctx, F, K, top) {
  const { A, yb, aH, aT, ball, wld, loc } = F, len = aT - aH, aTip = aT + K.allow;
  // (the centre: inside the heel under the ankle, in both bodies)
  const c = wld(Math.min(0.012, aH + 0.33 * len), (ball[0] + ball[1]) / 2 * 0.3, yb + 0.042);
  // (the foot's body: everything below the ankle, plus the designed toe box: from the ball to the tip, round in plan,
  // the big toe's side straighter, its top at toeH falling round to the sole at the front)
  const foot = [], leg = [];
  for (let i = 0; i < F.pts.length; i++) { const p = F.pts[i], q = F.L[i]; if (p[1] < A[1] + 0.012) foot.push(p);
    if (p[1] > A[1] - 0.045 && p[1] < top + 0.012 && Math.hypot(q[0], q[1]) < 0.08 && q[0] < 0.07) leg.push(p); }
  // (the leg in bands 4.5 cm tall (1.5 cm overlap), each its own convex body: a boot's shaft narrows above the heel round
  // the Achilles and the ankle as the leg does, instead of one box from the heel to the shaft's top)
  const y0 = A[1] - 0.045, y1 = top + 0.012, nBand = Math.max(1, Math.ceil((y1 - y0 - 0.015) / 0.03)), bands = Array.from({ length: nBand }, (_, i) => { const lo = y0 + ((y1 - y0 - 0.015) * i) / nBand, hi = y0 + ((y1 - y0 - 0.015) * (i + 1)) / nBand + 0.015; return { lo, hi, pts: [] }; });
  // (the leg's mesh is coarse (rings 5-6 cm apart): its section at the shaft's top added, where the triangles' edges cross it)
  { const { bPos, bodyIdx, cls } = ctx, yc = top + 0.012, P = (v) => [bPos[v * 3], bPos[v * 3 + 1], bPos[v * 3 + 2]];
    for (let q = 0; q < bodyIdx.length; q += 3) for (let e = 0; e < 3; e++) { const u = bodyIdx[q + e], v = bodyIdx[q + (e + 1) % 3]; if (cls[u] !== 3 || cls[v] !== 3 || Math.sign(bPos[u * 3]) !== F.sx) continue;
      const a = P(u), b = P(v); for (const yy of [yc, ...bands.flatMap((B) => [B.lo, B.hi])]) { if ((a[1] - yy) * (b[1] - yy) >= 0) continue; const t = (yy - a[1]) / (b[1] - a[1]), p = a.map((x, k) => x + (b[k] - x) * t), lq = loc(p); if (Math.hypot(lq[0], lq[1]) < 0.08 && lq[0] < 0.07) leg.push(p); } } }
  for (const p of leg) for (const B of bands) if (p[1] >= B.lo - 1e-4 && p[1] <= B.hi + 1e-4) B.pts.push(p);
  const aB = aT - 0.072, bIn = ball[0], bOut = ball[1], tipB = bIn + 0.36 * (bOut - bIn), yTopBall = (() => { let m = yb; for (const q of F.L) if (q[0] > aB - 0.01 && q[0] < aB + 0.01 && q[2] < A[1]) m = Math.max(m, q[2]); return m; })();
  for (let i = 0; i <= 16; i++) { const t = i / 16, a = aB + (aTip - K.room - aB) * t;
    const wm = (tipB - bIn) * Math.pow(Math.max(0, 1 - Math.pow(t, 3.2)), 1 / 3.2), wl = (bOut - tipB) * Math.pow(Math.max(0, 1 - Math.pow(t, 2.2)), 1 / 2.2);
    const hTop = yb + (K.toeH - K.room) + (yTopBall - yb - (K.toeH - K.room)) * Math.pow(1 - t, 1.6), front = Math.pow(Math.max(0, 1 - Math.pow(Math.max(0, (t - 0.55) / 0.45), 2.4)), 1 / 2.4), h = yb + (hTop - yb) * (0.35 + 0.65 * front);
    for (let j = 0; j <= 10; j++) { const s = j / 10, b = tipB - wm + (wm + wl) * s, edge = Math.pow(Math.abs(2 * s - 1), 4); foot.push(wld(a, b, yb), wld(a, b, h - (h - yb) * 0.55 * edge)); } }
  // (the upper's walls down past the foot's underside into the sole (an oxford's lasting margin over its thin sole))
  { const n = foot.length; for (let i = 0; i < n; i++) if (foot[i][1] < yb + 0.012) foot.push([foot[i][0], yb + K.upperBottom - 0.004 + K.room, foot[i][2]]); }
  const Nn = fibDirs(1200), HF = support(foot, Nn, K.room), HB = bands.filter((B) => B.pts.length > 12).map((B) => support(B.pts, Nn, K.room)), HL = HB.length ? true : null;
  const R = new Float32Array((NU + 1) * (NV + 1)), RF = new Float32Array(R.length), RL = new Float32Array(R.length), DIR = new Float32Array(R.length * 3);
  for (let j = 0; j <= NV; j++) { const th = (Math.PI * j) / NV; for (let i = 0; i <= NU; i++) { const ph = (2 * Math.PI * (i % NU)) / NU, la = -Math.cos(ph) * Math.sin(th), lb = Math.sin(ph) * Math.sin(th), ly = Math.cos(th);
    const w = wld(la, lb, ly), dir = [w[0] - A[0], ly, w[2] - A[2]], k = j * (NU + 1) + i; DIR.set(dir, k * 3);
    RF[k] = exitR(HF, Nn, c, dir); let rl = 0; for (const H of HB) { const sp = spanR(H, Nn, c, dir); if (sp && sp[0] < Math.max(RF[k], rl) + 0.004) rl = Math.max(rl, sp[1]); } RL[k] = rl; R[k] = Math.max(RF[k], RL[k]); } }
  const at = (i, j) => j * (NU + 1) + (((i % NU) + NU) % NU);
  const avg = (G, i, j) => { const a = G[at(i - 1, j)], b = G[at(i + 1, j)], cc = G[at(i, Math.max(0, j - 1))], dd = G[at(i, Math.min(NV, j + 1))], s = Math.sin((Math.PI * j) / NV), wu = 0.3 + 0.7 * s; return (wu * (a + b) + cc + dd) / (2 * wu + 2); };
  const R0 = Float32Array.from(R);
  // (the fillet where the shin's body meets the foot's: only where the two are close, the crease filled outward)
  if (HL) for (let it = 0; it < 40; it++) { const G = Float32Array.from(R); for (let j = 1; j < NV; j++) for (let i = 0; i < NU; i++) { const k = at(i, j), m = 1 - sm(0.0, 0.035, Math.abs(RF[k] - RL[k])); if (m <= 0) continue; const v = avg(G, i, j); if (v > R[k]) R[k] += (v - R[k]) * m; } for (let j = 0; j <= NV; j++) R[j * (NU + 1) + NU] = R[j * (NU + 1)]; }
  // (the convex bodies' facets smoothed away; never in closer than 40 % of the room)
  for (let it = 0; it < 14; it++) { const G = Float32Array.from(R); for (let j = 1; j < NV; j++) for (let i = 0; i < NU; i++) { const k = at(i, j); R[k] = Math.max(R0[k] - K.room * 0.2, G[k] + (avg(G, i, j) - G[k]) * 0.6); } }
  for (let j = 0; j <= NV; j++) R[j * (NU + 1) + NU] = R[j * (NU + 1)];
  // R at any direction (world): bilinear on the grid
  const toGrid = (dir) => { const l = loc([A[0] + dir[0], dir[1], A[2] + dir[2]]), n = Math.hypot(l[0], l[1], l[2]) || 1, th = Math.acos(clamp(l[2] / n, -1, 1)); let ph = Math.atan2(l[1], -l[0]); if (ph < 0) ph += 2 * Math.PI; return [(ph / (2 * Math.PI)) * NU, (th / Math.PI) * NV]; };
  const Rat = (dir) => { const [fu, fv] = toGrid(dir), i0 = Math.floor(fu), j0 = Math.min(NV - 1, Math.floor(fv)), tu = fu - i0, tv = fv - j0, g = (i, j) => R[at(i, j)];
    return (g(i0, j0) * (1 - tu) + g(i0 + 1, j0) * tu) * (1 - tv) + (g(i0, j0 + 1) * (1 - tu) + g(i0 + 1, j0 + 1) * tu) * tv; };
  // the surface point on the ray from c toward q (world)
  const onto = (q, lift = 0) => { const dir = [q[0] - c[0], q[1] - c[1], q[2] - c[2]], n = Math.hypot(...dir), u = dir.map((x) => x / n), r = Rat(u) + lift; return [c[0] + u[0] * r, c[1] + u[1] * r, c[2] + u[2] * r]; };
  const inside = (p, margin) => { const dir = [p[0] - c[0], p[1] - c[1], p[2] - c[2]], n = Math.hypot(...dir) || 1e-6; return Rat(dir.map((x) => x / n)) - n - margin; };
  return { c, R, DIR, at, Rat, onto, inside, aTip, aB, tipB, foot: foot.length, leg: leg.length };
}

/* ------------------------------------------------------------ mesh helpers -- */
// clip a triangle mesh to f > 0 (the zero line through the triangles, as the shells' hems): attributes interpolated
function clip(M, f) {
  const nv = M.P.length / 3, F = new Float32Array(nv); for (let i = 0; i < nv; i++) F[i] = f(i);
  const P = [], UV = [], X = [], idx = [], map = new Map();
  const push = (pp, uu, xx) => { P.push(...pp); UV.push(...uu); X.push(xx); return P.length / 3 - 1; };
  const vert = (v) => { if (map.has(v)) return map.get(v); const i = push([M.P[v * 3], M.P[v * 3 + 1], M.P[v * 3 + 2]], [M.UV[v * 2], M.UV[v * 2 + 1]], M.X[v]); map.set(v, i); return i; };
  const edge = (a, b) => { const key = a < b ? a + ':' + b : b + ':' + a; if (map.has(key)) return map.get(key); const t = F[a] / (F[a] - F[b]), L = (x, y) => x + (y - x) * t;
    const i = push([0, 1, 2].map((k) => L(M.P[a * 3 + k], M.P[b * 3 + k])), [L(M.UV[a * 2], M.UV[b * 2]), L(M.UV[a * 2 + 1], M.UV[b * 2 + 1])], { ...M.X[a], rim: true }); map.set(key, i); return i; };
  for (let q = 0; q < M.idx.length; q += 3) { const t = [M.idx[q], M.idx[q + 1], M.idx[q + 2]], s = t.map((v) => F[v] >= 0), n = s.filter(Boolean).length;
    if (!n) continue; if (n === 3) { idx.push(vert(t[0]), vert(t[1]), vert(t[2])); continue; }
    for (let r = 0; r < 3; r++) { const a = t[r], b = t[(r + 1) % 3], c = t[(r + 2) % 3];
      if (n === 1 && s[r]) { idx.push(vert(a), edge(a, b), edge(a, c)); break; }
      if (n === 2 && !s[(r + 2) % 3]) { const va = vert(a), vb = vert(b), bc = edge(b, c), ca = edge(c, a); idx.push(va, vb, bc, va, bc, ca); break; } } }
  return { P, UV, X, idx };
}
// a tube along a path (points), its section an ellipse (w across the surface, t off it) oriented by the normals given
function tube(path, nrm, w, t, closed, segs = 8) {
  const P = [], idx = [], UV = [], n = path.length, ring = segs;
  for (let i = 0; i < n; i++) { const a = path[closed ? (i - 1 + n) % n : Math.max(0, i - 1)], b = path[closed ? (i + 1) % n : Math.min(n - 1, i + 1)], T = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], tl = Math.hypot(...T) || 1; for (let k = 0; k < 3; k++) T[k] /= tl;
    let N0 = nrm[i], dt = N0[0] * T[0] + N0[1] * T[1] + N0[2] * T[2]; N0 = [N0[0] - T[0] * dt, N0[1] - T[1] * dt, N0[2] - T[2] * dt]; const nl = Math.hypot(...N0) || 1; N0 = N0.map((x) => x / nl);
    const B = [T[1] * N0[2] - T[2] * N0[1], T[2] * N0[0] - T[0] * N0[2], T[0] * N0[1] - T[1] * N0[0]];
    for (let s = 0; s < ring; s++) { const g = (2 * Math.PI * s) / ring, cw = Math.cos(g) * w / 2, st = Math.sin(g) * t / 2; P.push(path[i][0] + B[0] * cw + N0[0] * st, path[i][1] + B[1] * cw + N0[1] * st, path[i][2] + B[2] * cw + N0[2] * st); UV.push(i / Math.max(1, n - 1), s / ring); } }
  const segsN = closed ? n : n - 1; for (let i = 0; i < segsN; i++) for (let s = 0; s < ring; s++) { const a = i * ring + s, b = i * ring + ((s + 1) % ring), c = ((i + 1) % n) * ring + s, d = ((i + 1) % n) * ring + ((s + 1) % ring); idx.push(a, c, b, b, c, d); }
  if (!closed) for (const [i0, flip] of [[0, true], [n - 1, false]]) { const ctr = P.length / 3; P.push(...path[i0]); UV.push(0, 0); for (let s = 0; s < ring; s++) { const a = i0 * ring + s, b = i0 * ring + ((s + 1) % ring); if (flip) idx.push(ctr, b, a); else idx.push(ctr, a, b); } }
  return { P, UV, idx };
}
function merge(list) { const P = [], UV = [], JI = [], WT = [], idx = []; for (const m of list) { const o = P.length / 3; P.push(...m.P); UV.push(...m.UV); JI.push(...m.JI); WT.push(...m.WT); for (const i of m.idx) idx.push(o + i); }
  return { P: Float32Array.from(P), UV: Float32Array.from(UV), JI: Int32Array.from(JI), WT: Float32Array.from(WT), idx: Uint32Array.from(idx) }; }
const rigid = (n, j) => ({ JI: Array.from({ length: n * 4 }, (_, i) => (i % 4 === 0 ? j : 0)), WT: Array.from({ length: n * 4 }, (_, i) => (i % 4 === 0 ? 1 : 0)) });

/* ------------------------------------------------------------------ the panels -- */
// the upper's panels in the foot's frame (q = [a along, b out, y]): the toe cap's seam, the lacing's gap (the tongue in it)
// and the facings either side, the heel counter, the back stay; LE the lacing gap's half width
const LE = { boot: 0.0095, sneaker: 0.0085, dress: 0.0045 };
function panelsOf(kind, F, S, q) { const { A, aH, yb } = F, a = q[0], b = q[1], y = q[2], aTip = S.aTip;
  const capLine = aTip - (kind === 'dress' ? 0.05 : kind === 'boot' ? 0.058 : 0.045) - 0.012 * (b / 0.045) ** 2, cap = a - capLine;
  const lacing = Math.abs(b) - LE[kind] * (1 + 0.25 * sm(S.aLB - 0.03, S.aLB, a)), onTop = a > -0.015 && a < S.aLB + 0.004 && y > yb + 0.028 && Math.abs(b) < LE[kind] + 0.035;
  const back = Math.abs(Math.atan2(b, -(a - aH - 0.02))), counter = kind === 'boot' ? 1 : kind === 'sneaker' ? (a < aH + 0.055 ? (y - yb) - (0.03 - 0.35 * Math.max(0, a - aH - 0.015)) : 1) : (a < aH + 0.075 ? (y - yb) - (0.045 - 0.25 * Math.max(0, a - aH - 0.02)) : 1);
  return { a, b, y, dy: y - A[1], cap, lacing, onTop, back, counter, yb, aTip, aLB: S.aLB }; }
// (the panels' relief, m along the surface's ray: the tongue sunk in the lacing's gap, the facings over it, the toe cap's
// overlay, the counter's, a padded collar, a boot's back stay)
function reliefOf(kind, P0, toTop) { let h = 0; const K0 = { boot: [0.0022, 0.0013, 0.001, 0.002], sneaker: [0.0016, 0.001, 0.0007, 0.0038], dress: [0.0011, 0.0006, 0.0004, 0] }[kind];
  if (P0.onTop && P0.lacing < 0) h -= K0[0] * sm(0, -0.0025, P0.lacing) * sm(P0.aLB + 0.004, P0.aLB - 0.008, P0.a);
  if (P0.onTop && P0.lacing >= 0) h += K0[1] * (1 - sm(0.017, 0.024, P0.lacing)) * sm(P0.aLB + 0.004, P0.aLB - 0.008, P0.a);
  if (P0.cap > 0) h += K0[2] * sm(0, 0.0025, P0.cap); if (P0.counter < 0) h += K0[2] * sm(0, -0.0025, P0.counter); if (kind === 'boot' && P0.back < 0.14) h += 0.0008 * sm(0.14, 0.11, P0.back);
  if (K0[3] && !(P0.onTop && P0.lacing < 0.01)) h += K0[3] * (1 - sm(0.0, 0.022, toTop)) * sm(-0.004, 0.006, toTop);
  return h; }

/* --------------------------------------------------------------------- a shoe -- */
function buildSide(ctx, F, kind, K, colours) {
  const { A, yb, wld, loc, sx } = F, footJ = ctx.BI('foot.' + F.side), shinJ = ctx.BI('lowerleg02.' + F.side) >= 0 ? ctx.BI('lowerleg02.' + F.side) : ctx.BI('lowerleg01.' + F.side);
  // (the collar's height round the leg's axis (angle 0 the front): a sneaker's tongue in front and its heel tab, low at
  // the ankle bones; a boot's shaft top level, a little higher at the back; an oxford's topline under the ankle bones)
  const [cf, cs, cb] = K.collar, collarY = (ph) => { const f = Math.pow(Math.max(0, Math.cos(ph)), kind === 'boot' ? 2 : 6), b = Math.pow(Math.max(0, -Math.cos(ph)), 2); return A[1] + cs + (cf - cs) * f + (cb - cs) * b; };
  const top = A[1] + Math.max(cf, cs, cb);
  const S = last(ctx, F, K, top), { c, R, DIR, at } = S;
  // (the lacing's middle line, from its top (at the throat) down the instep: found before the relief, which needs its end)
  const sag = (th) => { const w = wld(Math.sin(th), 0, 0); return S.onto([c[0] + (w[0] - A[0]), c[1] + Math.cos(th), c[2] + (w[2] - A[2])]); };
  const findTh = (test) => { for (let th = 0.02; th < 1.9; th += 0.004) if (test(sag(th))) return th; return 1; };
  const thTop = findTh((p) => p[1] < collarY(0) - (kind === 'boot' ? 0.012 : kind === 'sneaker' ? 0.026 : 0.004)), thBot = findTh((p) => loc(p)[0] > (kind === 'dress' ? 0.075 : S.aTip - (kind === 'boot' ? 0.1 : 0.088)));
  S.aLB = loc(sag(thBot))[0] + 0.006;
  { const phL = (p) => { const q = loc(p); return Math.atan2(q[1], q[0]); }; for (let k = 0; k < R.length; k++) { const p = [c[0] + DIR[k * 3] * R[k], c[1] + DIR[k * 3 + 1] * R[k], c[2] + DIR[k * 3 + 2] * R[k]];
    R[k] += reliefOf(kind, panelsOf(kind, F, S, loc(p)), collarY(phL(p)) - p[1]); } }
  // the grid's points
  const G = { P: [], UV: [], X: [], idx: [] };
  for (let j = 0; j <= NV; j++) for (let i = 0; i <= NU; i++) { const k = j * (NU + 1) + i, r = R[k]; G.P.push(c[0] + DIR[k * 3] * r, c[1] + DIR[k * 3 + 1] * r, c[2] + DIR[k * 3 + 2] * r); G.UV.push(i / NU, j / NV); G.X.push({}); }
  for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) { const a = j * (NU + 1) + i, b = a + 1, cc = a + NU + 1, d = cc + 1; if (sx > 0) G.idx.push(a, b, cc, b, d, cc); else G.idx.push(a, cc, b, b, cc, d); }
  const phOf = (p) => { const q = loc(p); return Math.atan2(q[1], q[0]); };
  const yBot = yb + K.upperBottom;
  const up = clip({ P: Float32Array.from(G.P), UV: Float32Array.from(G.UV), X: G.X, idx: G.idx }, (v) => { const p = [G.P[v * 3], G.P[v * 3 + 1], G.P[v * 3 + 2]]; return Math.min(collarY(phOf(p)) - p[1], p[1] - (yBot - 0.004)); });
  // (the opening's rim: the clip's points along the collar (not the bottom), as a loop in order)
  const nv = up.P.length / 3, isRim = (i) => up.X[i].rim && up.P[i * 3 + 1] > yb + 0.01;
  const ec = new Map(); for (let q = 0; q < up.idx.length; q += 3) for (let e = 0; e < 3; e++) { const a = up.idx[q + e], b = up.idx[q + (e + 1) % 3], k = a < b ? a + ',' + b : b + ',' + a; ec.set(k, (ec.get(k) || 0) + 1); }
  const nb = new Map(); for (const [k, n] of ec) { if (n !== 1) continue; const [a, b] = k.split(',').map(Number); if (!isRim(a) || !isRim(b)) continue; (nb.get(a) || nb.set(a, []).get(a)).push(b); (nb.get(b) || nb.set(b, []).get(b)).push(a); }
  let loop = []; { const seen = new Set(), starts = [...nb.keys()].sort((x, y) => nb.get(x).length - nb.get(y).length); for (const s of starts) { if (seen.has(s)) continue; const L = [s]; seen.add(s); let prev = -1, cur = s; for (;;) { const nx = (nb.get(cur) || []).find((x) => x !== prev && !seen.has(x)); if (nx == null) break; L.push(nx); seen.add(nx); prev = cur; cur = nx; } if (L.length > loop.length) loop = L; } }
  // (the toe spring: the front of the shoe rises from the ball, the upper and the sole as one)
  const spring = (p) => { const a = loc(p)[0], t = clamp((a - S.aB) / (S.aTip - S.aB), 0, 1); return K.spring * Math.pow(t, 2.2); };
  // (weights: the foot bone; above the ankle a boot's shaft (and a little of a sneaker's collar) eased onto the shin)
  const wOf = (p) => { const q = loc(p), w = K.shaftEase * sm(A[1] - 0.012, A[1] + 0.045, p[1]) * (1 - sm(0.04, 0.07, q[0])); // (the instep and toe box stay on the foot alone)
    return w > 0.01 ? { JI: [footJ, shinJ, 0, 0], WT: [1 - w, w, 0, 0] } : { JI: [footJ, 0, 0, 0], WT: [1, 0, 0, 0] }; };
  const fin = (P0, UV0, idx0) => { const n = P0.length / 3, P = new Float32Array(n * 3), JI = [], WT = []; for (let i = 0; i < n; i++) { const p = [P0[i * 3], P0[i * 3 + 1], P0[i * 3 + 2]], w = wOf(p); JI.push(...w.JI); WT.push(...w.WT); P[i * 3] = p[0]; P[i * 3 + 1] = p[1] + spring(p); P[i * 3 + 2] = p[2]; } return { P, UV: UV0, JI, WT, idx: idx0 }; };
  const upper = fin(up.P, up.UV, up.idx);
  // the padded roll round the opening (on the rim, its centre a little in toward the leg)
  let roll = null, lining = null; if (loop.length > 12) { let path = loop.map((i) => [up.P[i * 3], up.P[i * 3 + 1], up.P[i * 3 + 2]]);
    { const L = [0]; for (let i = 1; i <= path.length; i++) { const a = path[i - 1], b = path[i % path.length]; L.push(L[i - 1] + Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])); } const n = Math.min(160, Math.max(24, Math.round(L[path.length] / 0.004))), out = []; let j = 0;
      for (let k = 0; k < n; k++) { const t = (k / n) * L[path.length]; while (L[j + 1] < t) j++; const a = path[j], b = path[(j + 1) % path.length], f = (t - L[j]) / Math.max(1e-9, L[j + 1] - L[j]); out.push(a.map((x, q) => x + (b[q] - x) * f)); } path = out; }
    for (let it = 0; it < 4; it++) path = path.map((p, i) => { const a = path[(i - 1 + path.length) % path.length], b = path[(i + 1) % path.length]; return p.map((x, k) => x * 0.5 + (a[k] + b[k]) * 0.25); });
    const nrm = path.map((p) => { const q = loc(p), r = Math.hypot(q[0], q[1]) || 1, w = wld(q[0] / r, q[1] / r, 0); return [w[0] - A[0], 0, w[2] - A[2]]; });
    path = path.map((p, i) => [p[0] - nrm[i][0] * K.roll * 0.2, p[1] - K.roll * 0.15, p[2] - nrm[i][2] * K.roll * 0.2]);
    const T = tube(path, nrm, K.roll * 2, K.roll * 2.2, true, 10); roll = fin(T.P, T.UV, T.idx);
    // (the lining: a band from under the roll in to the leg (3.5 mm off its skin) and down, so no one sees into the gap
    // between the shoe and the ankle (skin, or a trouser leg's inside laid there))
    const skinR = (p, u) => { let m = 0.03; for (const q of F.pts) { if (Math.abs(q[1] - p[1] + 0.008) > 0.012) continue; const dx = q[0] - A[0], dz = q[2] - A[2], r = Math.hypot(dx, dz); if (r < 1e-4) continue; if ((dx * u[0] + dz * u[1]) / r > 0.97) m = Math.max(m, r); } return m; };
    const LP = [], LUV = [], Lidx = [], n = path.length;
    path.forEach((p, i) => { const dx = p[0] - A[0], dz = p[2] - A[2], r = Math.hypot(dx, dz) || 1, u = [dx / r, dz / r], rs = Math.min(r - K.roll * 0.4, skinR(p, u) + 0.0035);
      for (const [rr, dy, v] of [[r - K.roll * 0.4, -K.roll * 0.3, 0], [rs, -0.008, 0.5], [rs, -0.022, 1]]) { LP.push(A[0] + u[0] * rr, p[1] + dy, A[2] + u[1] * rr); LUV.push(i / n, v); } });
    for (let i = 0; i < n; i++) for (let j = 0; j < 2; j++) { const a = i * 3 + j, b = ((i + 1) % n) * 3 + j; Lidx.push(a, b, a + 1, b, b + 1, a + 1); }
    lining = fin(LP, LUV, Lidx);
    // (its inner rows move as the skin beside them does (the nearest body point's weights), so the leg never comes through it)
    for (let i = 0; i < LP.length / 3; i++) { if (LUV[i * 2 + 1] === 0) continue; let best = -1, bd = 1e9; for (let j = 0; j < F.pts.length; j++) { const q = F.pts[j], d = (q[0] - LP[i * 3]) ** 2 + (q[1] - LP[i * 3 + 1]) ** 2 + (q[2] - LP[i * 3 + 2]) ** 2; if (d < bd) { bd = d; best = F.vid[j]; } }
      if (best >= 0) for (let k = 0; k < 4; k++) { lining.JI[i * 4 + k] = ctx.si[best * 4 + k]; lining.WT[i * 4 + k] = ctx.sw[best * 4 + k] / 255; } } }
  // the sole: the upper's outline at the sole's top (its widest over the wrap's height), out by the welt
  const NB = 112, sc = wld((F.aH + S.aTip) / 2, (F.ball[0] + F.ball[1]) / 2, 0), scl = loc(sc), RO = new Float32Array(NB);
  for (let i = 0; i < nv; i++) { const p = [up.P[i * 3], up.P[i * 3 + 1], up.P[i * 3 + 2]]; if (p[1] > yb + Math.max(...K.wrap) + 0.004) continue; const q = loc(p), da = q[0] - scl[0], db = q[1] - scl[1], r = Math.hypot(da, db), k = ((Math.floor(((Math.atan2(db, -da) + 2 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI) * NB)) % NB + NB) % NB; RO[k] = Math.max(RO[k], r); }
  for (let k = 0; k < NB; k++) if (!RO[k]) RO[k] = Math.max(RO[(k + NB - 1) % NB], RO[(k + 1) % NB]);
  for (let it = 0; it < 3; it++) { const C0 = Float32Array.from(RO); for (let k = 0; k < NB; k++) RO[k] = Math.max(C0[k], (C0[(k + NB - 1) % NB] + 2 * C0[k] + C0[(k + 1) % NB]) / 4); }
  const floorAt = (a, b) => { const tA = (a - F.aH) / (S.aTip - F.aH), waist = sm(0.2, 0.32, tA) * (1 - sm(0.52, 0.66, tA)), med = 0.55 + 0.45 * sm(0.01, -0.03, b); const heel = 1 - sm(F.aH - 0.004, F.aH + 0.03, a); return yb - K.soleH + K.arch * waist * med + K.bevel * heel * heel; }; // (the heel's back edge bevelled: it lands rounded, not on a corner)
  // (the side's profile: [out from the outline, height (0 floor .. 1 the wrap's top), v]: the bottom edge rounded, the
  // wall, the top's lip tucked against the upper)
  const prof = kind === 'boot' ? [[-0.003, 0, 0.36], [0.0, 0.0015, 0.42], [0.0015, 0.12, 0.5], [0.0015, 0.55, 0.62], [K.welt, 0.6, 0.7], [K.welt, 0.86, 0.82], [K.welt * 0.6, 0.97, 0.92], [-0.001, 1.0, 1]]
    : kind === 'dress' ? [[-0.0025, 0, 0.36], [0.0, 0.002, 0.42], [0.0012, 0.25, 0.55], [K.welt, 0.55, 0.68], [K.welt, 0.86, 0.84], [-0.001, 1.0, 1]]
    : [[-0.004, 0, 0.36], [0.0, 0.003, 0.42], [0.0035, 0.08, 0.5], [0.0045, 0.4, 0.66], [0.004, 0.86, 0.86], [0.0012, 0.97, 0.95], [-0.0015, 1.0, 1]];
  const wrapAt = (ph) => { const back = Math.pow(Math.max(0, Math.cos(ph)), 2), front = Math.pow(Math.max(0, -Math.cos(ph)), 2); return K.wrap[1] + (K.wrap[0] - K.wrap[1]) * back + (K.wrap[2] - K.wrap[1]) * front; };
  const SP = [], SUV = [], Sidx = [], RW = prof.length;
  for (let k = 0; k <= NB; k++) { const ph = ((k % NB) + 0.5) / NB * 2 * Math.PI, r = RO[k % NB], da = -Math.cos(ph), db = Math.sin(ph);
    // (an oxford's heel: a stacked block to the heel's breast, the forepart's sole thin under the upper's lasting)
    const lug = kind === 'boot' && (k % 3) === 0; for (const [dr0, hy, v] of prof) { const dr = dr0 - (lug && hy < 0.2 ? 0.003 : 0), a = scl[0] + da * (r + dr), b = scl[1] + db * (r + dr), yf = floorAt(a, b), heel = kind === 'dress' ? 1 - sm(F.aH + 0.075, F.aH + 0.085, a) : 0;
      const yTop = yb + wrapAt(ph) + (kind === 'dress' ? heel * 0.0105 : 0), y = yf + (yTop - yf) * hy, p = wld(a, b, y); p[1] += spring(p); SP.push(...p); SUV.push(k / NB, v); } }
  for (let k = 0; k < NB; k++) for (let j = 0; j < RW - 1; j++) { const a = k * RW + j, b = a + RW; if (sx > 0) Sidx.push(a, a + 1, b, a + 1, b + 1, b); else Sidx.push(a, b, a + 1, a + 1, b, b + 1); }
  // (the bottom: its edge ring again, then rings in to the middle, uv in plan (v under 0.33), so the tread is painted where it is)
  { const bounds = [9, -9, 9, -9]; for (let k = 0; k < NB; k++) { const ph = (k + 0.5) / NB * 2 * Math.PI, a = scl[0] - Math.cos(ph) * RO[k], b = scl[1] + Math.sin(ph) * RO[k]; bounds[0] = Math.min(bounds[0], a); bounds[1] = Math.max(bounds[1], a); bounds[2] = Math.min(bounds[2], b); bounds[3] = Math.max(bounds[3], b); }
    const pUV = (q) => [0.02 + 0.96 * clamp((q[0] - bounds[0]) / (bounds[1] - bounds[0]), 0, 1), 0.01 + 0.31 * clamp((q[1] - bounds[2]) / (bounds[3] - bounds[2]), 0, 1)];
    const base = SP.length / 3, rings = 6;
    for (let g = 0; g < rings; g++) { const s = 1 - g / rings; for (let k = 0; k <= NB; k++) { let p; if (g === 0) { const i = k * RW; p = [SP[i * 3], SP[i * 3 + 1], SP[i * 3 + 2]]; } else { const ph = ((k % NB) + 0.5) / NB * 2 * Math.PI, r = (RO[k % NB] + prof[0][0]) * s, a = scl[0] - Math.cos(ph) * r, b = scl[1] + Math.sin(ph) * r; p = wld(a, b, floorAt(a, b) - 0.0004 * Math.min(g, 2)); p[1] += spring(p); }
      SP.push(...p); SUV.push(...pUV(loc(p))); } }
    const mid = SP.length / 3, pm = wld(scl[0], scl[1], floorAt(scl[0], scl[1]) - 0.0008); pm[1] += spring(pm); SP.push(...pm); SUV.push(...pUV(loc(pm)));
    const ri = (g, k) => base + g * (NB + 1) + k;
    for (let g = 0; g < rings - 1; g++) for (let k = 0; k < NB; k++) { const a = ri(g, k), b = ri(g, k + 1), cc = ri(g + 1, k), d = ri(g + 1, k + 1); if (sx > 0) Sidx.push(a, b, cc, b, d, cc); else Sidx.push(a, cc, b, b, cc, d); }
    for (let k = 0; k < NB; k++) { const a = ri(rings - 1, k), b = ri(rings - 1, k + 1); if (sx > 0) Sidx.push(a, b, mid); else Sidx.push(a, mid, b); } }
  const soleW = rigid(SP.length / 3, footJ), sole = { P: Float32Array.from(SP), UV: SUV, JI: soleW.JI, WT: soleW.WT, idx: Sidx };
  // the laces: the lacing's middle line from its top (at the throat) down the instep, eyelet pairs either side of it
  const rows = K.rows, eyes = [], lat = (p) => { const q = loc(p); return { a: q[0], y: p[1] }; };
  for (let r = 0; r < rows; r++) { const s = r / (rows - 1), th = thTop + (thBot - thTop) * s, m = sag(th), ew = K.eyeW[0] + (K.eyeW[1] - K.eyeW[0]) * s, ml = loc(m), pair = [];
    for (const sgn of [1, -1]) { const q = wld(ml[0], ml[1] + sgn * ew, m[1]); pair.push(S.onto([q[0] + (q[0] - c[0]) * 0.0, q[1] + 0.004, q[2]])); }
    eyes.push(pair); }
  const nOn = (p) => { const d = [p[0] - c[0], p[1] - c[1], p[2] - c[2]], n = Math.hypot(...d); return d.map((x) => x / n); };
  const laceSeg = (p0, p1, over) => { const pts = [], nn = []; for (let i = 0; i <= 10; i++) { const t = i / 10, q = [0, 1, 2].map((k) => p0[k] + (p1[k] - p0[k]) * t), lift = -0.0008 + (K.lace.t * 0.5 + 0.0016 + over * 0.0011) * Math.sqrt(Math.sin(Math.PI * t)); pts.push(S.onto(q, Math.max(-0.0008, lift))); nn.push(nOn(q)); } return tube(pts, nn, K.lace.w, K.lace.t, false, 6); };
  const laces = []; for (let r = rows - 1; r > 0; r--) { laces.push(laceSeg(eyes[r][0], eyes[r - 1][1], r % 2), laceSeg(eyes[r][1], eyes[r - 1][0], 1 - (r % 2))); }
  laces.push(laceSeg(eyes[rows - 1][0], eyes[rows - 1][1], 0));
  // (the bow at the top: a knot, two loops lying over the quarters, two ends hanging)
  { const k0 = S.onto([(eyes[0][0][0] + eyes[0][1][0]) / 2, (eyes[0][0][1] + eyes[0][1][1]) / 2 + 0.006, (eyes[0][0][2] + eyes[0][1][2]) / 2], K.lace.t * 1.6), kl = loc(k0), big = kind === 'dress' ? 0.7 : 1;
    for (const sgn of [1, -1]) { const lp = [], ln = [], L = 0.026 * big, W = 0.0075 * big; for (let i = 0; i <= 18; i++) { const g = (i / 18) * 2 * Math.PI, ox = L * (0.5 - 0.5 * Math.cos(g)), oy = W * Math.sin(g), q = wld(kl[0] + oy - ox * 0.25, kl[1] + sgn * ox, k0[1] - ox * 0.18); lp.push(S.onto(q, K.lace.t * (1.2 + 1.6 * Math.sin(g / 2)))); ln.push(nOn(q)); }
      laces.push(tube(lp, ln, K.lace.w, K.lace.t, false, 6));
      const tp = [], tn = []; for (let i = 0; i <= 10; i++) { const t = i / 10, q = wld(kl[0] - 0.004 * t + sgn * 0.0, kl[1] + sgn * (0.004 + 0.012 * t), k0[1] - 0.045 * big * t); tp.push(S.onto(q, K.lace.t * (1.1 + 0.8 * t))); tn.push(nOn(q)); } laces.push(tube(tp, tn, K.lace.w, K.lace.t, false, 6)); }
    const kn = []; for (let i = 0; i <= 6; i++) { const t = i / 6 - 0.5, q = wld(kl[0] + t * 0.004, kl[1] + t * 0.009, k0[1]); kn.push(S.onto(q, K.lace.t * 2)); } laces.push(tube(kn, kn.map(nOn), K.lace.w * 2.1, K.lace.t * 2.4, false, 8)); }
  const lm = laces.reduce((acc, t) => { const o = acc.P.length / 3; acc.P.push(...t.P); acc.UV.push(...t.UV); for (const i of t.idx) acc.idx.push(o + i); return acc; }, { P: [], UV: [], idx: [] });
  const laceM = fin(lm.P, lm.UV, lm.idx);
  // (eyelets: a ring at each hole; brass on a boot, nothing but the painted hole on the others)
  let eyeM = null; if (kind === 'boot') { const E = { P: [], UV: [], idx: [] }; for (const pair of eyes) for (const e of pair) { const n0 = nOn(e), ring = [], rn = []; const t1 = Math.abs(n0[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0], u = [n0[1] * t1[2] - n0[2] * t1[1], n0[2] * t1[0] - n0[0] * t1[2], n0[0] * t1[1] - n0[1] * t1[0]], ul = Math.hypot(...u), U = u.map((x) => x / ul), V = [n0[1] * U[2] - n0[2] * U[1], n0[2] * U[0] - n0[0] * U[2], n0[0] * U[1] - n0[1] * U[0]];
      for (let i = 0; i < 12; i++) { const g = (i / 12) * 2 * Math.PI; ring.push([0, 1, 2].map((k) => e[k] + (U[k] * Math.cos(g) + V[k] * Math.sin(g)) * 0.0032 + n0[k] * 0.0008)); rn.push(n0); }
      const T = tube(ring, rn, 0.0016, 0.0013, true, 5), o = E.P.length / 3; E.P.push(...T.P); E.UV.push(...T.UV); for (const i of T.idx) E.idx.push(o + i); }
    eyeM = fin(E.P, E.UV, E.idx); }
  // (the fit, measured: the room ahead of the longest toe, and every foot point below the collar inside the upper)
  let tip = -9; for (let i = 0; i < nv; i++) tip = Math.max(tip, loc([up.P[i * 3], up.P[i * 3 + 1], up.P[i * 3 + 2]])[0]);
  let outN = 0, outMm = 0; for (let i = 0; i < F.pts.length; i++) { const p = F.pts[i]; if (F.cl[i] !== 4 || p[1] > collarY(phOf(p)) - 0.005) continue; const d = -S.inside(p, 0); if (d > 0.001) outN++; outMm = Math.max(outMm, d * 1000); }
  const fit = { toeRoomMm: +((tip - F.aT) * 1000).toFixed(1), footOutside: outN, footOutsideMm: +outMm.toFixed(1), footPoints: F.cl.filter((c) => c === 4).length };
  return { upper, roll, lining, sole, laces: laceM, eyes: eyeM, eyePts: eyes.flat(), S, collarY, phOf, F, yBot, fit };
}

/* -------------------------------------------------------------------- the paint -- */
// each part's paint works in the foot's own frame (a along it, b out to the side, y up), so both feet are painted alike
function painter(sides, fn) { return (p, n, f, c, ao, uv) => { const s = sides[p[0] >= 0 ? 'L' : 'R'] || sides.L, q = s.F.loc(p); return fn(q, p, n, uv, s); }; }
const stitch = (d, along, w = 0.0005, pitch = 0.0034) => Math.abs(d) < w && Math.sin((along / pitch) * 2 * Math.PI) > -0.2;
function shoes(ctx, o) {
  const kind = o.kind, K = KINDS[kind], fem = ctx.sex === 'female';
  const col = kind === 'sneaker' ? hexRGB(o.color, [234, 234, 230]) : leatherColour(hexRGB(o.color, kind === 'boot' ? [70, 54, 44] : [26, 22, 21]));
  const acc = kind === 'sneaker' ? hexRGB(o.accent, [36, 46, 74]) : leatherColour(hexRGB(o.accent, col.map((x) => Math.round(x * 0.8))));
  const solC = kind === 'sneaker' ? [238, 236, 228] : kind === 'boot' ? [19, 18, 18] : [22, 19, 18], laceC = kind === 'sneaker' ? [240, 240, 236] : kind === 'boot' ? (Math.max(...col) < 40 ? [17, 16, 16] : [98, 74, 52]) : [14, 13, 13];
  const sides = {}; for (const s of ['L', 'R']) { const F = footFrame(ctx, s); sides[s] = buildSide(ctx, F, kind, K, { col, acc }); }
  ctx.log?.(`shoes ${kind}: foot length ${((sides.L.F.aT - sides.L.F.aH) * 100).toFixed(1)} cm, underside y ${sides.L.F.yb.toFixed(3)}, last points ${sides.L.S.foot}+${sides.L.S.leg}, rim ${sides.L.upper ? 'ok' : '-'}`);
  const eyeD = (p) => { let m = 9; for (const s of Object.values(sides)) for (const e of s.eyePts) m = Math.min(m, Math.hypot(p[0] - e[0], p[1] - e[1], p[2] - e[2])); return m; };
  const panels = (q, s) => panelsOf(kind, s.F, s.S, q);
  const upperPaint = painter(sides, (q, p, n, uv, s) => { const P0 = panels(q, s); let k = 1, C0 = col;
    if (kind === 'sneaker') { // (canvas: a fine plain weave; a suede toe cap and heel counter; the side's swept stripe in the accent)
      const wv = 0.94 + 0.03 * Math.sin(p[1] * 2600) * Math.sin((p[0] + p[2]) * 2600) + 0.04 * fbm(p, 0.004); k *= wv;
      if (P0.cap > 0) { k *= 0.97 + 0.03 * fbm(p, 0.0015); if (P0.cap < 0.0016) k *= 0.82; if (Math.abs(P0.cap - 0.0035) < 0.0005) k *= 0.85; }
      if (P0.counter < 0) { C0 = acc; k *= 0.96 + 0.06 * fbm(p, 0.0016); if (P0.counter > -0.0016) k *= 0.8; if (Math.abs(P0.counter + 0.0035) < 0.0005) k *= 0.82; }
      const band = P0.y - P0.yb - 0.022 - 0.18 * (P0.a - 0.02) * 0.4, inStripe = Math.abs(P0.b) > 0.02 && P0.a > -0.04 && P0.a < P0.aTip - 0.075 && Math.abs(band - 0.004 * Math.sin(P0.a * 30)) < 0.0042 * sm(-0.03, 0.0, P0.a) * (1 - sm(P0.aTip - 0.11, P0.aTip - 0.075, P0.a));
      if (inStripe) { C0 = acc; if (Math.abs(Math.abs(band) - 0.0055) < 0.0005) k *= 0.8; }
      if (P0.onTop && P0.lacing < 0) { k *= 0.72 + 0.08 * fbm(p, 0.002); if (P0.lacing > -0.0014) k *= 0.6; } // (the tongue in the lacing's gap, in its shadow)
      if (P0.onTop && P0.lacing > 0 && P0.lacing < 0.012) { if (Math.abs(P0.lacing - 0.0105) < 0.0005) k *= 0.8; } // (the eyestay's stitch)
    } else if (kind === 'boot') { // (oiled leather: a pebbled grain, a stitched toe cap, the vamp's seam, a back stay, a padded collar)
      k *= 0.9 + 0.07 * fbm(p, 0.0018) + 0.03 * fbm(p, 0.0005); k *= 1 + 0.06 * sm(0.0, 0.03, P0.cap) * Math.max(0, n[1]); // (worn lighter where it scuffs)
      if (Math.abs(P0.cap) < 0.0012) k *= 0.62; if (stitch(P0.cap - 0.0035, P0.b) || stitch(P0.cap - 0.0062, P0.b)) k *= 0.7;
      const vamp = P0.a - (0.025 - 0.0 * P0.dy); if (Math.abs(vamp) < 0.001 && P0.dy < 0.03 && Math.abs(P0.b) > 0.016) k *= 0.65; if (stitch(vamp - 0.003, P0.y) && P0.dy < 0.03 && Math.abs(P0.b) > 0.018) k *= 0.72;
      if (P0.back < 0.16) { k *= 0.88; if (Math.abs(P0.back - 0.16) < 0.02) k *= 0.85; } if (P0.dy > 0.08 && P0.dy < 0.1 && Math.abs(P0.dy - 0.08) < 0.0008) k *= 0.7;
      if (P0.onTop && P0.lacing < 0) { k *= 0.8; if (P0.lacing > -0.0012) k *= 0.6; } if (P0.onTop && P0.lacing > 0 && stitch(P0.lacing - 0.006, P0.a + P0.y)) k *= 0.72;
    } else { // (polished calf: smooth, a cap toe, closed lacing (the quarters meet over the tongue), a heel counter, the topline bound)
      k *= 0.96 + 0.03 * fbm(p, 0.006) + 0.01 * fbm(p, 0.0008);
      if (Math.abs(P0.cap) < 0.0009) k *= 0.55; if (stitch(P0.cap - 0.0022, P0.b, 0.0003, 0.0022)) k *= 0.82; if (P0.cap > 0) k *= 1.03;
      const quarter = P0.a - (0.045 + 0.4 * Math.max(0, P0.y - P0.yb - 0.03)); if (Math.abs(quarter) < 0.0008 && P0.y > P0.yb + 0.012) k *= 0.6; if (stitch(quarter + 0.0022, P0.y, 0.0003, 0.0022) && P0.y > P0.yb + 0.012) k *= 0.82;
      if (P0.counter < 0 && P0.counter > -0.0009) k *= 0.6; if (P0.onTop && P0.lacing < 0) { k *= 0.75; if (P0.lacing > -0.0009) k *= 0.5; }
    }
    if (eyeD(p) < (kind === 'boot' ? 0.0022 : 0.0019)) { C0 = [12, 11, 10]; k = 1; } // (the eyelet's hole)
    const yb = P0.yb; if (p[1] < yb + 0.0035 + (kind === 'dress' ? -0.008 : 0)) k *= 0.85; // (where it meets the sole: in shadow)
    return shade(C0, k); });
  const upperBump = painter(sides, (q, p, n, uv, s) => { const P0 = panels(q, s); let h = 128;
    if (kind === 'sneaker') { h += 10 * Math.sin(p[1] * 2600) * Math.sin((p[0] + p[2]) * 2600); if (Math.abs(P0.cap) < 0.0014) h -= 30; if (P0.counter < 0 && P0.counter > -0.0014) h -= 30; }
    else if (kind === 'boot') { h += 34 * (fbm(p, 0.0007) - 0.5); if (Math.abs(P0.cap) < 0.0012) h -= 50; if (stitch(P0.cap - 0.0035, P0.b) || stitch(P0.cap - 0.0062, P0.b)) h += 30; }
    else { h += 6 * (fbm(p, 0.002) - 0.5); if (Math.abs(P0.cap) < 0.0009) h -= 40; if (stitch(P0.cap - 0.0022, P0.b, 0.0003, 0.0022)) h += 18; }
    if (eyeD(p) < 0.002) h -= 40; return [h, h, h]; });
  const soleBump = painter(sides, (q, p, n, uv) => { let h = 128; if (uv[1] < 0.33) { const u = uv[0] * 60, v = uv[1] * 60; h += kind === 'boot' ? (Math.sin(u * 1.6) * Math.sin(v * 3) > 0.15 ? 60 : -40) : kind === 'sneaker' ? (Math.abs(((u + v * 0.7) % 1 + 1) % 1 - 0.5) < 0.18 ? 40 : -20) : 0; } else if (kind === 'sneaker' && uv[1] > 0.5 && uv[1] < 0.84) h += 18 * Math.sin(uv[1] * 260); return [h, h, h]; });
  const solePaint = painter(sides, (q, p, n, uv, s) => { const v = uv[1]; let k = 1, C0 = solC;
    if (v < 0.33) { k = kind === 'boot' ? 0.85 : 0.8; return shade(C0, k * (0.94 + 0.06 * fbm(p, 0.003))); } // (the tread, painted in the normal map)
    if (kind === 'sneaker') { k *= 0.96 + 0.04 * fbm(p, 0.004); if (v > 0.6 && v < 0.64) C0 = acc; if (v > 0.9) k *= 0.92; if (v < 0.44) k *= 0.85; }
    else if (kind === 'boot') { if (v > 0.66) { C0 = col; k *= 0.92 + 0.06 * fbm(p, 0.0018); if (Math.abs(v - 0.8) < 0.025 && Math.sin(uv[0] * 1400) > -0.2) k *= 0.6; } else { k *= 0.9 + 0.1 * (Math.sin(uv[0] * 500) > 0.3 ? 1 : 0.55); } }
    else { const a = q[0], heel = a < s.F.aH + 0.08; if (heel && v > 0.42 && v < 0.84) { k *= 0.9 + 0.1 * (Math.sin(p[1] * 1600) > 0.8 ? 0.6 : 1); } if (!heel && v > 0.66) { C0 = col; k *= 0.95; if (Math.abs(v - 0.76) < 0.02 && Math.sin(uv[0] * 1600) > -0.2) k *= 0.7; } }
    return shade(C0, k); });
  const parts = [], extras = [];
  const both = (key) => merge(['L', 'R'].map((s) => sides[s][key]).filter(Boolean));
  const id = kind === 'boot' ? 'work-boots' : kind === 'sneaker' ? 'sneakers' : 'dress-shoes';
  extras.push({ name: id, mesh: both('upper'), S: 1024, base: col, paint: upperPaint, bump: upperBump, bumpK: kind === 'boot' ? 3 : 2, rough: K.rough.upper });
  extras.push({ name: id + '-soles', mesh: both('sole'), S: 512, base: solC, paint: solePaint, bump: soleBump, bumpK: 3, rough: K.rough.sole });
  extras.push({ name: id + '-collar', mesh: both('roll'), S: 128, base: kind === 'sneaker' ? col : col.map((x) => Math.round(x * 0.85)), paint: (p) => shade(kind === 'sneaker' ? col : col, kind === 'sneaker' ? 0.95 + 0.05 * fbm(p, 0.002) : 0.8), rough: kind === 'dress' ? 0.45 : K.rough.upper });
  extras.push({ name: id + '-lining', mesh: both('lining'), S: 64, base: kind === 'sneaker' ? [64, 64, 68] : [30, 26, 24], paint: () => (kind === 'sneaker' ? [64, 64, 68] : [30, 26, 24]), rough: 0.9 });
  extras.push({ name: id + '-laces', mesh: both('laces'), S: 128, base: laceC, paint: (p, n, f, c, ao, uv) => shade(laceC, 0.85 + 0.15 * Math.abs(Math.sin(uv[0] * 90 + uv[1] * 6))), rough: K.rough.lace });
  if (kind === 'boot') extras.push({ name: id + '-eyelets', mesh: both('eyes'), S: 64, base: [150, 128, 84], paint: () => [150, 128, 84], rough: 0.38, metal: 0.85 });
  // the body's points inside the shoe (a margin in): the skin hidden there, a trouser leg's points laid under it
  // (the body's points inside the shoe: the skin hidden there (2 mm in), and what the core does with a trouser leg's points
  // over them: laid 3 mm off the skin, never dropped (a dropped triangle leaves a ragged hem). Over the leg just above the
  // collar too, so a trouser leg narrows into the opening (into a boot's shaft) instead of standing round it, where the
  // shoe would come out through it as the ankle bends)
  const inShoe = (p) => { const s = sides[p[0] >= 0 ? 'L' : 'R']; return Math.min(s.S.inside(p, 0.0), s.collarY(s.phOf(p)) - p[1]); };
  const taper = { boot: 0.03, sneaker: 0.025, dress: 0.022 }[kind];
  const field = (p, c) => { if (c !== 4 && c !== 3) return -1; const f0 = inShoe(p); return f0 > -taper ? 0.0055 : f0; };
  const hide = new Set(); { const { bPos, bodyIdx, cls } = ctx; for (let q = 0; q < bodyIdx.length; q += 3) { const t = [bodyIdx[q], bodyIdx[q + 1], bodyIdx[q + 2]]; if (t.every((v) => (cls[v] === 4 || cls[v] === 3) && inShoe([bPos[v * 3], bPos[v * 3 + 1], bPos[v * 3 + 2]]) > 0.002)) hide.add(q / 3); } }
  const all = extras.map((e) => e.mesh.P);
  ctx.log?.(`shoes ${kind}: ${extras.map((e) => e.name + ' ' + e.mesh.idx.length / 3).join(', ')} tris; hides ${hide.size} body tris`);
  return { parts, extras, shell: { hide, P: Float32Array.from(all.flatMap((a) => Array.from(a))), skirt: null }, field, report: { kind, soleH: K.soleH, allow: K.allow, toeH: K.toeH, fit: { L: sides.L.fit, R: sides.R.fit } } };
}
// a height image (rasterPaint's [h,h,h], 128 flat) to a tangent-space normal map (glTF: +x right, +y up the image)
export function bumpNormals(img, S, k = 2) {
  const out = new Uint8Array(S * S * 3), h = (x, y) => img[(clamp(y, 0, S - 1) * S + clamp(x, 0, S - 1)) * 3];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const dx = (h(x + 1, y) - h(x - 1, y)) / 255 * k, dy = (h(x, y + 1) - h(x, y - 1)) / 255 * k, l = Math.hypot(dx, dy, 1), i = (y * S + x) * 3;
    out[i] = Math.round((-dx / l * 0.5 + 0.5) * 255); out[i + 1] = Math.round((dy / l * 0.5 + 0.5) * 255); out[i + 2] = Math.round((1 / l * 0.5 + 0.5) * 255); }
  return out;
}
export const SHOES = {
  'work-boots': (ctx, o) => shoes(ctx, { ...o, kind: 'boot' }),
  sneakers: (ctx, o) => shoes(ctx, { ...o, kind: 'sneaker' }),
  'dress-shoes': (ctx, o) => shoes(ctx, { ...o, kind: 'dress' }),
};
