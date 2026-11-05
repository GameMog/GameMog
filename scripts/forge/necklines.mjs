// THE CHARACTER FORGE: necklines and collars (forge v2.5, NK). Round 3 found a fault at the neck on 13 of 16 people: a
// stand collar floating off the neck as a choker (its ring sized to the widest skin round the neck's base plus the coat's
// thickness, 13 mm out, and its bottom above the coat's neckline: skin and the coat's inside showed under it), a hood
// lying down as broken flaps inside the hoodie, drawcords whose tips stuck out of the cloth as two fangs, a tee's
// neckline a jagged cut through the pack's mesh. Each is now made the way the garment is sewn:
//   standCollar()  a closed band (outer face, a rolled top edge, an inner face) fitted to the neck's own skin at every
//                  height and angle (2.5 mm off it), its foot tucked inside the coat's neckline and widened to meet it,
//                  so there is no gap between the coat and the collar or between the collar and the neck; open at the
//                  front (a mandarin's rounded corners) or closed (a hoodie's rib)
//   hoodDown()     the hood lying down: one rolled band on the hoodie's shoulders and upper back (its underside on the
//                  cloth, its body along the cloth's normal: fullest behind the neck where a hood folds, thinning round
//                  the sides), its two ends tucked under the neckband at the front
//   drawcords()    two round cords from under the hood's ends, lying on the chest down the cloth's front, aglets at the
//                  tips; skinned as the cloth under them
//   necklineBinding() a pack top's neckline: the jagged cut evened into one smooth line, then bound with a rolled band
//                  over the edge (outside, over the top, inside), as a tee's neck is
// Every part is a closed tube, wound outward (orient): no back face or open edge to show as a shard.
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const TAU = 2 * Math.PI;
const angOf = (x, z, nz) => Math.atan2(x, z - nz); // 0: the front, +-PI: the back
const binOf = (a, NB) => ((Math.floor(((a + Math.PI) / TAU) * NB) % NB) + NB) % NB;
// a table round the neck by angle (NB bins) and height (y0, dy, NY) read back bilinearly, its empty cells filled from
// their neighbours (round the angle first, then up and down)
function table(NB, y0, dy, NY) {
  const v = new Float32Array(NB * NY).fill(NaN), n = new Float32Array(NB * NY);
  const fillY = () => { for (let i = 0; i < NB; i++) for (let j = 0; j < NY; j++) { if (!isNaN(v[j * NB + i])) continue; let lo = j - 1, hi = j + 1; while (lo >= 0 && isNaN(v[lo * NB + i])) lo--; while (hi < NY && isNaN(v[hi * NB + i])) hi++;
      if (lo < 0 && hi >= NY) continue; v[j * NB + i] = lo < 0 ? v[hi * NB + i] : hi >= NY ? v[lo * NB + i] : v[lo * NB + i] + ((v[hi * NB + i] - v[lo * NB + i]) * (j - lo)) / (hi - lo); } };
  const fill = (yFirst = false) => { if (yFirst) fillY();
    for (let j = 0; j < NY; j++) { const row = []; for (let i = 0; i < NB; i++) if (!isNaN(v[j * NB + i])) row.push(i);
      if (!row.length) continue; for (let i = 0; i < NB; i++) { if (!isNaN(v[j * NB + i])) continue; let lo = -1, hi = -1;
        for (let d = 1; d < NB; d++) { if (lo < 0 && !isNaN(v[j * NB + ((i - d + NB) % NB)])) lo = d; if (hi < 0 && !isNaN(v[j * NB + ((i + d) % NB)])) hi = d; if (lo > 0 && hi > 0) break; }
        const a = v[j * NB + ((i - lo + NB) % NB)], b = v[j * NB + ((i + hi) % NB)]; v[j * NB + i] = (a * hi + b * lo) / (lo + hi); } }
    for (let i = 0; i < NB; i++) for (let j = 0; j < NY; j++) { if (!isNaN(v[j * NB + i])) continue; let lo = j - 1, hi = j + 1; while (lo >= 0 && isNaN(v[lo * NB + i])) lo--; while (hi < NY && isNaN(v[hi * NB + i])) hi++;
      v[j * NB + i] = lo < 0 ? (hi < NY ? v[hi * NB + i] : 0) : hi >= NY ? v[lo * NB + i] : v[lo * NB + i] + ((v[hi * NB + i] - v[lo * NB + i]) * (j - lo)) / (hi - lo); } };
  const smooth = (passes = 2) => { for (let p = 0; p < passes; p++) { const c = Float32Array.from(v); for (let j = 0; j < NY; j++) for (let i = 0; i < NB; i++) v[j * NB + i] = (2 * c[j * NB + i] + c[j * NB + ((i + 1) % NB)] + c[j * NB + ((i - 1 + NB) % NB)]) / 4; } };
  const at = (a, y) => { const u = ((a + Math.PI) / TAU) * NB - 0.5, i0 = ((Math.floor(u) % NB) + NB) % NB, f = u - Math.floor(u), w = Math.min(NY - 1.001, Math.max(0, (y - y0) / dy)), j0 = Math.floor(w), g = w - j0;
    const V = (i, j) => v[j * NB + i]; return (V(i0, j0) * (1 - f) + V((i0 + 1) % NB, j0) * f) * (1 - g) + (V(i0, j0 + 1) * (1 - f) + V((i0 + 1) % NB, j0 + 1) * f) * g; };
  return { v, n, NB, NY, y0, dy, fill, smooth, at, cell: (a, y) => { const j = Math.round((y - y0) / dy); return j < 0 || j >= NY ? -1 : j * NB + binOf(a, NB); } };
}
// the neck's own skin by angle and height: the innermost skin round the neck's axis (the neck itself, not the shoulders
// or the trapezius beside it), from 10 cm under the neck's base to 7 cm over it
export function neckSkin(ctx) {
  if (ctx._neckSkin) return ctx._neckSkin;
  const { bPos, cls, NECKY, bodyIdx } = ctx, nz = ctx.jpos('neck01')[2], T = table(36, NECKY - 0.1, 0.006, 29), yHi = T.y0 + T.dy * (T.NY - 1) + 0.003;
  // (the skin's triangles sampled every ~2.5 mm, not its points: the body's points are 1-2 cm apart, so a cell with none
  // of the neck's own would take a farther point's radius (the trapezius's) and the collar would stand off there)
  const put = (x, y, z) => { const r = Math.hypot(x, z - nz); if (r < 0.02 || r > 0.11 || y < T.y0 - 0.003 || y > yHi) return; const k = T.cell(angOf(x, z, nz), y); if (k >= 0 && (isNaN(T.v[k]) || r < T.v[k])) T.v[k] = r; };
  for (let q = 0; q < bodyIdx.length; q += 3) { const t = [bodyIdx[q], bodyIdx[q + 1], bodyIdx[q + 2]]; if (t.some((v) => { const c = cls[v]; return c === 1 || c === 2 || c === 3 || c === 4; })) continue;
    const A = t.map((v) => [bPos[v * 3], bPos[v * 3 + 1], bPos[v * 3 + 2]]); if (Math.max(...A.map((p) => p[1])) < T.y0 - 0.01 || Math.min(...A.map((p) => p[1])) > yHi + 0.01) continue;
    if (Math.min(...A.map((p) => Math.hypot(p[0], p[2] - nz))) > 0.115) continue;
    const L = Math.max(...[0, 1, 2].map((e) => Math.hypot(...[0, 1, 2].map((c) => A[e][c] - A[(e + 1) % 3][c])))), n = Math.max(1, Math.ceil(L / 0.0025));
    for (let a = 0; a <= n; a++) for (let b = 0; a + b <= n; b++) { const u = a / n, w = b / n, z0 = 1 - u - w; put(...[0, 1, 2].map((c) => A[0][c] * z0 + A[1][c] * u + A[2][c] * w)); } }
  T.fill(true); T.smooth(2); ctx._neckSkin = { at: T.at, nz }; return ctx._neckSkin;
}
// an open edge of a mesh round the neck (its neckline): by angle, the edge point nearest the neck's base (r, y), smoothed
export function necklineOf(P, idx, nz, NECKY, o = {}) {
  // (welded by place first: a uv seam's two copies of a point are one point, so a seam is not an edge)
  const wid = new Map(), members = new Map(), W = (v) => { if (wid.has(v)) return wid.get(v); const k = Math.round(P[v * 3] * 1e4) + ',' + Math.round(P[v * 3 + 1] * 1e4) + ',' + Math.round(P[v * 3 + 2] * 1e4); if (!members.has(k)) members.set(k, []); members.get(k).push(v); wid.set(v, k); return k; };
  const ec = new Map(); for (let q = 0; q < idx.length; q += 3) for (let e = 0; e < 3; e++) { const a = W(idx[q + e]), b = W(idx[q + ((e + 1) % 3)]); if (a === b) continue; const k = a < b ? a + '|' + b : b + '|' + a; ec.set(k, (ec.get(k) || 0) + 1); }
  const NB = o.NB ?? 72, Y = new Float32Array(NB).fill(NaN), R = new Float32Array(NB).fill(NaN), verts = new Set();
  for (const [k, c] of ec) { if (c !== 1) continue; for (const v of k.split('|').flatMap((w) => members.get(w))) { const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2] - nz, r = Math.hypot(x, z);
    if (y < NECKY - (o.below ?? 0.13) || y > NECKY + 0.06 || r > (o.rMax ?? 0.14)) continue; verts.add(v); const b = binOf(Math.atan2(x, z), NB); if (isNaN(Y[b]) || y > Y[b]) { Y[b] = y; R[b] = r; } } }
  const fillC = (A) => { for (let i = 0; i < NB; i++) { if (!isNaN(A[i])) continue; let lo = 1, hi = 1; while (lo < NB && isNaN(A[(i - lo + NB) % NB])) lo++; while (hi < NB && isNaN(A[(i + hi) % NB])) hi++; if (lo >= NB) { A[i] = 0; continue; } A[i] = (A[(i - lo + NB) % NB] * hi + A[(i + hi) % NB] * lo) / (lo + hi); } };
  fillC(Y); fillC(R);
  // (o.envelope: the line laid over the edge's highest points (a max over a few bins first), so evening it lifts the low
  // points up to it and none is left standing over it)
  if (o.envelope) { const c = Float32Array.from(Y), cr = Float32Array.from(R); for (let i = 0; i < NB; i++) { let m = -9, mr = 0; for (let d = -o.envelope; d <= o.envelope; d++) { const k = (i + d + NB) % NB; if (c[k] > m) { m = c[k]; mr = cr[k]; } } Y[i] = m; R[i] = mr; } }
  for (let p = 0; p < (o.smooth ?? 4); p++) for (const A of [Y, R]) { const c = Float32Array.from(A); for (let i = 0; i < NB; i++) A[i] = (2 * c[i] + c[(i + 1) % NB] + c[(i - 1 + NB) % NB]) / 4; }
  const at = (A) => (a) => { const u = ((a + Math.PI) / TAU) * NB - 0.5, i0 = ((Math.floor(u) % NB) + NB) % NB, f = u - Math.floor(u); return A[i0] * (1 - f) + A[(i0 + 1) % NB] * f; };
  return { y: at(Y), r: at(R), verts, found: verts.size };
}
// a revolved band: for i in 0..NA, a closed profile loop of points (each { r, y } at angle a(i)); quads between rings,
// the loop closed; open ends capped with a fan. Wound so the profile's outside faces out (checked on the first quad of
// the outer face, flipped as a whole if not)
function revolve(NA, angle, loop, o) {
  const P = [], UV = [], idx = [], nz = o.nz, R = loop(0).length, closed = !!o.closed;
  for (let i = 0; i <= NA; i++) { const a = angle(i), L = loop(i), s = L.map((p, k) => (k ? Math.hypot(p.r - L[k - 1].r, p.y - L[k - 1].y) : 0)); let acc = 0; const tot = s.reduce((x, y) => x + y, 0) + Math.hypot(L[0].r - L[R - 1].r, L[0].y - L[R - 1].y);
    L.forEach((p, k) => { acc += s[k]; P.push(Math.sin(a) * p.r + (p.dx ?? 0), p.y, nz + Math.cos(a) * p.r + (p.dz ?? 0)); UV.push(o.uvU ? o.uvU(i) : i / NA, acc / tot); }); }
  // (a closed band's last ring lies on its first: the same points, the uv's seam)
  for (let i = 0; i < NA; i++) for (let k = 0; k < R; k++) { const a = i * R + k, b = (i + 1) * R + k, a1 = i * R + ((k + 1) % R), b1 = (i + 1) * R + ((k + 1) % R); idx.push(a, b, a1, a1, b, b1); }
  // (the outer face's first quad faces out (away from the neck's axis)? if not, every triangle flipped)
  const k0 = o.outerK ?? 1, iM = Math.floor(NA / 2), t = [iM * R + k0, (iM + 1) * R + k0, iM * R + k0 + 1].map((v) => [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]]);
  const u = t[1].map((x, c) => x - t[0][c]), w = t[2].map((x, c) => x - t[0][c]), n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]], out = [t[0][0], 0, t[0][2] - nz];
  if (n[0] * out[0] + n[2] * out[2] < 0) for (let q = 0; q < idx.length; q += 3) { const x = idx[q + 1]; idx[q + 1] = idx[q + 2]; idx[q + 2] = x; }
  // (the ends capped: a fan from the profile's middle, facing along the band away from it)
  if (!closed) for (const [i, sgn] of [[0, -1], [NA, 1]]) { const c = [0, 0, 0]; for (let k = 0; k < R; k++) for (let j = 0; j < 3; j++) c[j] += P[(i * R + k) * 3 + j] / R; const ci = P.length / 3; P.push(...c); UV.push(i / NA, 0.5);
    const nb = (i === 0 ? 1 : NA - 1) * R, dir = [0, 1, 2].map((j) => (c[j] - P[nb * 3 + j])); // (outward along the band)
    for (let k = 0; k < R; k++) { const a = i * R + k, b = i * R + ((k + 1) % R), A = [P[a * 3], P[a * 3 + 1], P[a * 3 + 2]], B = [P[b * 3], P[b * 3 + 1], P[b * 3 + 2]];
      const u2 = A.map((x, j) => x - c[j]), w2 = B.map((x, j) => x - c[j]), n2 = [u2[1] * w2[2] - u2[2] * w2[1], u2[2] * w2[0] - u2[0] * w2[2], u2[0] * w2[1] - u2[1] * w2[0]];
      if (n2[0] * dir[0] + n2[1] * dir[1] + n2[2] * dir[2] >= 0) idx.push(ci, a, b); else idx.push(ci, b, a); } }
  return { P, UV, idx };
}
const weightsOf = (si, sw, q, scale = 255) => [0, 1, 2, 3].map((k) => [si[q * 4 + k], sw[q * 4 + k] / scale]);
function skinBy(P, near, out) { const JI = [], WT = []; for (let i = 0; i < P.length / 3; i++) { const e = near([P[i * 3], P[i * 3 + 1], P[i * 3 + 2]], i); for (const [j, w] of e) { JI.push(j); WT.push(w); } } return { JI: Int32Array.from(JI), WT: Float32Array.from(WT) }; }

/* --------------------------------------------------------------- stand collar -- */
// o: { sh (the garment's shell: its neckline), top (m over the neck's base), dropFront, gap (to the skin), th (the band's
// thickness), tuck (its foot under the coat's neckline), open (half the front opening, rad; 0: a closed ring), round
// (the front corners' rounding, m), nearestNeck (ctx, p) -> body point for the weights }
export function standCollar(ctx, o) {
  const { NECKY } = ctx, { at: skin, nz } = neckSkin(ctx), NE = necklineOf(o.sh.P, o.sh.idx, nz, NECKY), gap = o.gap ?? 0.0025, th = o.th ?? 0.0035, tuck = o.tuck ?? 0.012, open = o.open ?? 0, NA = open ? 72 : 80;
  const angle = (i) => (open ? open + ((TAU - 2 * open) * i) / NA : (TAU * i) / NA + (o.seamBack ? Math.PI : 0)); // (o.seamBack: a closed ring's uv seam at the back, out of sight)
  const loop = (i) => { const a = angle(i), f = 0.5 + 0.5 * Math.cos(a), yE = NE.y(a), rE = NE.r(a), corner = open ? (o.round ?? 0.008) * (1 - sm(0, 0.35, Math.min(Math.abs(a - open), Math.abs(TAU - open - a)))) : 0;
    const yT = Math.max(NECKY + (o.top ?? 0.012) - (o.dropFront ?? 0) * f * f - corner, yE + (o.minH ?? 0.016)), yB = yE - tuck;
    const rI = (y) => skin(a, Math.min(y, yT)) + gap, rO = (y) => { const base = rI(y) + th, s = sm(yE + 0.014, yE - 0.002, y); return Math.max(base, (rE - 0.0015) * s + base * (1 - s)); };
    const rIc = (y) => Math.min(rI(y), rO(y) - 0.0015);
    const out = [], inn = [], hs = [yB, yE - 0.004, yE + 0.002, yE + 0.007]; const h0 = yE + 0.007, h1 = yT - th / 2; for (let k = 1; k <= 3; k++) hs.push(h0 + ((h1 - h0) * k) / 3);
    for (const y of hs) out.push({ r: rO(y), y });
    // (the top edge rolled: a half round from the outer face over to the inner)
    const ro = rO(h1), ri = rIc(h1), rc = (ro + ri) / 2, rr = (ro - ri) / 2; for (const t of [0.25, 0.5, 0.75]) out.push({ r: rc + Math.cos(t * Math.PI) * rr, y: h1 + Math.sin(t * Math.PI) * Math.max(rr, th / 2) });
    for (let k = 0; k <= 4; k++) { const y = h1 - ((h1 - yB) * k) / 4; inn.push({ r: rIc(y), y }); }
    if (o.debug && (i === 0 || i === NA >> 1 || i === NA >> 2)) ctx.log?.(`collar dbg a ${a.toFixed(2)} yE ${((yE - NECKY) * 1000).toFixed(1)} rE ${(rE * 1000).toFixed(1)} yT ${((yT - NECKY) * 1000).toFixed(1)} | ` + [...out, ...inn].map((p) => `${(p.r * 1000).toFixed(1)}@${((p.y - NECKY) * 1000).toFixed(1)}`).join(' '));
    return [...out, ...inn]; };
  const { P, UV, idx } = revolve(NA, angle, loop, { nz, closed: !open, outerK: 2 });
  // (its weights: one set for the band's whole height at each angle, the neck's skin's just over the coat's neckline
  // (o.stiff m over it): the band stands stiff as a collar does and turns with the neck's base; weighted by each height's
  // own skin, the throat folding under the chin sheared its inner face out through its outer one)
  // (and those smoothed round the band (a column's with its neighbours' over +-4, by a bell): neighbouring columns
  // weighted to different bones (a clavicle's, the neck's) sheared the band into back faces in a talk)
  const near = o.nearestNeck, NC = 96, colW = [];
  // (o.shellWeights: a rib sewn to its top's neckline, the top's own weights at its edge, so the band, the top and a hood
  // lying on it move together)
  for (let c = 0; c < NC; c++) { const a = (c / NC) * TAU - Math.PI, m = new Map();
    if (o.shellWeights) { const q = nearestOn(o.sh, [Math.sin(a) * NE.r(a), NE.y(a), nz + Math.cos(a) * NE.r(a)]); for (let k = 0; k < 4; k++) if (o.sh.WT[q * 4 + k] > 0) m.set(o.sh.JI[q * 4 + k], (m.get(o.sh.JI[q * 4 + k]) || 0) + o.sh.WT[q * 4 + k]); }
    else { const ys = NE.y(a) + (o.stiff ?? 0.008), r = skin(a, ys), q = near(ctx, [Math.sin(a) * r, ys, nz + Math.cos(a) * r]); if (q >= 0) for (const [j, w] of weightsOf(ctx.si, ctx.sw, q)) if (w > 0) m.set(j, (m.get(j) || 0) + w); }
    if (!m.size) m.set(ctx.BI('neck01'), 1); colW.push(m); }
  const colS = colW.map((_, c) => { const m = new Map(); for (let d = -4; d <= 4; d++) { const g = Math.exp(-(d * d) / 8); for (const [j, w] of colW[(c + d + NC) % NC]) m.set(j, (m.get(j) || 0) + w * g); }
    const e = [...m.entries()].sort((x, y) => y[1] - x[1]).slice(0, 4), t = e.reduce((x, y) => x + y[1], 0) || 1; while (e.length < 4) e.push([0, 0]); return e.map(([j, w]) => [j, w / t]); });
  const { JI, WT } = skinBy(P, (p) => colS[binOf(angOf(p[0], p[2], nz), NC)]);
  // (the skin inside the band hidden: from under the coat's neckline to 6 mm under the band's top, out to the coat's
  // edge: closed in by the band, it can only show as flecks where the shoulder's slope comes up through its foot)
  const hide = new Set(), { bodyIdx, bPos } = ctx, topAt = (a) => { const f = 0.5 + 0.5 * Math.cos(a); return Math.max(NECKY + (o.top ?? 0.012) - (o.dropFront ?? 0) * f * f, NE.y(a) + (o.minH ?? 0.016)); };
  const inside = (v) => { const x = bPos[v * 3], y = bPos[v * 3 + 1], z = bPos[v * 3 + 2] - nz, a = Math.atan2(x, z); if (open && Math.abs(a) < open + 0.05) return false; return y < topAt(a) - 0.006 && y > NE.y(a) - 0.03 && Math.hypot(x, z) < NE.r(a) + 0.006; };
  // (and a skin triangle with each point either inside the band or under the coat (o.field > 0): the body's triangles
  // are big at the shoulders, and one reaching from the neck out to the shoulder's top was neither all under the coat nor
  // all under the band, so it stayed, its flat face standing out over the coat's rounded shoulder as a pale flap)
  const under = (v) => inside(v) || (o.field && o.field([bPos[v * 3], bPos[v * 3 + 1], bPos[v * 3 + 2]], ctx.cls[v], v) > 0 && bPos[v * 3 + 1] > NECKY - 0.12);
  for (let q = 0; q < bodyIdx.length; q += 3) { const t = [bodyIdx[q], bodyIdx[q + 1], bodyIdx[q + 2]]; if (t.every((v) => ctx.cls[v] !== 5) && t.every(under) && t.some(inside)) hide.add(q / 3); else if (ctx.cls[t[0]] !== 1 && t.every(inside)) hide.add(q / 3); }
  ctx.log?.(`collar (NK): ${o.name || 'stand'} ${NA + 1} rings, neckline found from ${NE.found} edge points, gap ${(gap * 1000).toFixed(1)} mm, open ${open.toFixed(2)} rad, ${hide.size} skin triangles inside it hidden`);
  // (the uv's v: 0 the outer face's foot (inside the coat), ~0.45-0.6 the rolled top edge, 1 the inner face's foot)
  return { P: Float32Array.from(P), UV: Float32Array.from(UV), JI, WT, idx: Uint32Array.from(idx), roll: [0.42, 0.62], hide };
}

/* ------------------------------------------------------------- turned collar -- */
// a jacket's collar (o.sh: the jacket's shell): the stand up the back of the neck from the jacket's neckline, over the
// shirt's collar (o.gap off the skin), turned over at the top, and the fall down over the stand and past the jacket's
// neckline (o.over) so the jacket's cut edge never shows; open at the front by o.frontGap (rad), its ends at the lapels'
// tops; the stand lower toward the front. One closed band (no back face, no open edge)
export function turnCollar(ctx, o) {
  const { NECKY } = ctx, { at: skin, nz } = neckSkin(ctx), NE = necklineOf(o.sh.P, o.sh.idx, nz, NECKY), S = surfaces(o.sh, NECKY, nz), gap = o.gap ?? 0.011, th = o.th ?? 0.003, fg = o.frontGap ?? 0.62, NA = 64;
  const angle = (i) => fg + ((TAU - 2 * fg) * i) / NA;
  const loop = (i) => { const a = angle(i), f = 0.5 + 0.5 * Math.cos(a), yE = NE.y(a), rE = NE.r(a), end = sm(0, 0.3, Math.min(a - fg, TAU - fg - a));
    const yS = yE + (o.stand ?? 0.03) - 0.012 * f * f, y0 = yE - 0.006, rI = (y) => skin(a, y) + gap, over = (o.over ?? 0.012) * (0.4 + 0.6 * end);
    const yF = yE - over, rF = Math.max(rE + th + 0.002, rI(yS) + th + 0.004 + (yS - yF) * 0.35), out = [];
    // (the stand's inner face, up)
    for (let k = 0; k <= 3; k++) { const y = y0 + ((yS - y0) * k) / 3; out.push({ r: rI(y), y }); }
    // (the turn over the top)
    const rT = rI(yS); for (const t of [0.3, 0.7]) out.push({ r: rT + th * (0.5 - 0.5 * Math.cos(t * Math.PI)), y: yS + Math.sin(t * Math.PI) * th * 0.8 });
    // (the fall's outer face, down and out over the jacket's edge)
    // (never into the jacket: each point of the fall at least 2.5 mm over the jacket's top surface under it)
    const onJ = (r, y) => { const e = S.exact(Math.sin(a) * r, nz + Math.cos(a) * r); return e ? Math.max(y, e.y + 0.0025) : y; };
    for (let k = 0; k <= 4; k++) { const t = k / 4, r = rT + th + (rF - rT - th) * Math.pow(t, 1.3); out.push({ r, y: onJ(r, yS - (yS - yF) * t) }); }
    // (the fall's edge, turned under, and back in under it to the stand's foot)
    const yFe = out[out.length - 1].y; out.push({ r: rF - th * 0.5, y: yFe - th * 0.4 }); out.push({ r: rF - th, y: yFe - 0.001 }); out.push({ r: (rF + rI(y0)) / 2, y: Math.min((yFe + y0) / 2, yFe - 0.002) });
    return out; };
  const { P, UV, idx } = revolve(NA, angle, loop, { nz, closed: false, outerK: 7 });
  const near = o.nearestNeck, { JI, WT } = skinBy(P, (p) => { const a = angOf(p[0], p[2], nz), ys = Math.min(p[1], NE.y(a) + 0.008), r = skin(a, ys), q = near(ctx, [Math.sin(a) * r, ys, nz + Math.cos(a) * r]); if (q >= 0) return weightsOf(ctx.si, ctx.sw, q); const nk = ctx.BI('neck01'); return [[nk, 1], [0, 0], [0, 0], [0, 0]]; });
  ctx.log?.(`turned collar (NK): ${NA + 1} sections, neckline from ${NE.found} edge points, open ${fg.toFixed(2)} rad`);
  return { P: Float32Array.from(P), UV: Float32Array.from(UV), JI, WT, idx: Uint32Array.from(idx) };
}

/* ----------------------------------------------------------- the hood, down -- */
// the shell's top surface as a smooth height by angle round the neck and distance out from its axis (the highest shell
// point in each cell, filled and smoothed: a hood lying on it follows the shoulders' line, not each triangle), and its
// front as a smooth depth by x and y; each with the shell point nearest (its weights)
function surfaces(sh, NECKY, nz) {
  const T = table(72, 0.03, 0.006, 30), FW = 0.004, FX = 60, FY = 70, fz = new Float32Array(FX * FY).fill(NaN), fx0 = -0.12, fy0 = NECKY - 0.3;
  for (let i = 0; i < sh.P.length / 3; i++) { const x = sh.P[i * 3], y = sh.P[i * 3 + 1], z = sh.P[i * 3 + 2]; if (y < NECKY - 0.3) continue; const r = Math.hypot(x, z - nz), k = T.cell(angOf(x, z, nz), r);
    if (k >= 0 && y > NECKY - 0.2 && (isNaN(T.v[k]) || y > T.v[k])) T.v[k] = y;
    if (sh.N[i * 3 + 2] > 0.2) { const a = Math.floor((x - fx0) / FW), b = Math.floor((y - fy0) / FW); if (a >= 0 && b >= 0 && a < FX && b < FY && (isNaN(fz[b * FX + a]) || z > fz[b * FX + a])) fz[b * FX + a] = z; } }
  // (a max over each cell's neighbours first, so the smoothing that follows leaves the line on the cloth, not in it)
  T.fill(); { const c = Float32Array.from(T.v); for (let j = 0; j < T.NY; j++) for (let i = 0; i < T.NB; i++) { let m = c[j * T.NB + i]; for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) { const jj = j + dj; if (jj < 0 || jj >= T.NY) continue; m = Math.max(m, c[jj * T.NB + ((i + di + T.NB) % T.NB)]); } T.v[j * T.NB + i] = m; } }
  T.smooth(3); for (let p = 0; p < 2; p++) { const c = Float32Array.from(T.v); for (let j = 1; j < T.NY - 1; j++) for (let i = 0; i < T.NB; i++) T.v[j * T.NB + i] = (c[(j - 1) * T.NB + i] + 2 * c[j * T.NB + i] + c[(j + 1) * T.NB + i]) / 4; }
  // (the front's depth: holes filled from their neighbours, then smoothed)
  for (let it = 0; it < 6; it++) { const c = Float32Array.from(fz); for (let b = 0; b < FY; b++) for (let a = 0; a < FX; a++) { if (!isNaN(c[b * FX + a])) continue; let s = 0, n = 0; for (const [da, db] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const A = a + da, Bb = b + db; if (A < 0 || Bb < 0 || A >= FX || Bb >= FY) continue; const w = c[Bb * FX + A]; if (!isNaN(w)) { s += w; n++; } } if (n) fz[b * FX + a] = s / n; } }
  for (let it = 0; it < 3; it++) { const c = Float32Array.from(fz); for (let b = 1; b < FY - 1; b++) for (let a = 1; a < FX - 1; a++) { const q = b * FX + a; if (isNaN(c[q])) continue; let s = 4 * c[q], n = 4; for (const d of [1, -1, FX, -FX]) if (!isNaN(c[q + d])) { s += c[q + d]; n++; } fz[q] = s / n; } }
  const front = (x, y) => { const u = (x - fx0) / FW - 0.5, v = (y - fy0) / FW - 0.5, a = Math.max(0, Math.min(FX - 2, Math.floor(u))), b = Math.max(0, Math.min(FY - 2, Math.floor(v))), f = Math.min(1, Math.max(0, u - a)), g = Math.min(1, Math.max(0, v - b)), Z = (i, j) => fz[j * FX + i];
    const z = (Z(a, b) * (1 - f) + Z(a + 1, b) * f) * (1 - g) + (Z(a, b + 1) * (1 - f) + Z(a + 1, b + 1) * f) * g; return isNaN(z) ? null : z; };
  const top = (a, r) => T.at(a, r);
  // (the exact top: a ray straight down onto the shell's triangles, the highest it meets; null off the shell)
  const TG = new Map(), tc = 0.02; for (let q = 0; q < sh.idx.length; q += 3) { const t = [sh.idx[q], sh.idx[q + 1], sh.idx[q + 2]]; if (t.every((v) => sh.P[v * 3 + 1] < NECKY - 0.25)) continue;
    const xs = t.map((v) => sh.P[v * 3]), zs = t.map((v) => sh.P[v * 3 + 2]); for (let i = Math.floor(Math.min(...xs) / tc); i <= Math.floor(Math.max(...xs) / tc); i++) for (let k = Math.floor(Math.min(...zs) / tc); k <= Math.floor(Math.max(...zs) / tc); k++) { const kk = i + ',' + k; (TG.get(kk) || TG.set(kk, []).get(kk)).push(t); } }
  const exact = (x, z) => { let best = null; for (const t of TG.get(Math.floor(x / tc) + ',' + Math.floor(z / tc)) || []) { const [A, B, C] = t.map((v) => [sh.P[v * 3], sh.P[v * 3 + 1], sh.P[v * 3 + 2]]);
      const det = (B[0] - A[0]) * (C[2] - A[2]) - (C[0] - A[0]) * (B[2] - A[2]); if (Math.abs(det) < 1e-12) continue; const u = ((x - A[0]) * (C[2] - A[2]) - (C[0] - A[0]) * (z - A[2])) / det, w = ((B[0] - A[0]) * (z - A[2]) - (x - A[0]) * (B[2] - A[2])) / det;
      if (u < -1e-4 || w < -1e-4 || u + w > 1 + 1e-4) continue; const y = A[1] + u * (B[1] - A[1]) + w * (C[1] - A[1]); if (best == null || y > best.y) { const e1 = [0, 1, 2].map((k) => B[k] - A[k]), e2 = [0, 1, 2].map((k) => C[k] - A[k]); let n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]; const l = Math.hypot(...n) || 1; n = n.map((c) => c / l); if (n[1] < 0) n = n.map((c) => -c); best = { y, n }; } } return best; };
  // (the top's normal: up, tipped by the slope out and round)
  const normal = (a, r) => { const e = 0.004, dr = (top(a, r + e) - top(a, r - e)) / (2 * e), da = (top(a + e / r, r) - top(a - e / r, r)) / (2 * e), ra = [Math.sin(a), 0, Math.cos(a)], ta = [Math.cos(a), 0, -Math.sin(a)];
    const n = [-dr * ra[0] - da * ta[0], 1, -dr * ra[2] - da * ta[2]], l = Math.hypot(...n); return n.map((c) => c / l); };
  return { top, normal, front, exact };
}
// o: { sh (the hoodie's shell), band (the neckband's thickness out from the neckline), color }
export function hoodDown(ctx, o) {
  const { NECKY } = ctx, sh = o.sh, nz = ctx.jpos('neck01')[2], NE = necklineOf(sh.P, sh.idx, nz, NECKY), S = surfaces(sh, NECKY, nz), a0 = o.end ?? 0.55, NA = 64, M = 14;
  // (along the band: from one end at the front round the back to the other; back = 1 behind the neck)
  const angle = (i) => a0 + ((TAU - 2 * a0) * i) / NA;
  const tipOf = (a) => { const al = Math.min(a, TAU - a); return sm(a0, a0 + 0.7, al); };
  const sampleAt = (a, w) => { const back = (1 - Math.cos(a)) / 2, e = tipOf(a), W = (0.03 + 0.032 * Math.pow(back, 1.6)) * (0.35 + 0.65 * e), T = (0.013 + 0.02 * back * back) * (0.12 + 0.88 * e) * (1 + 0.06 * Math.sin(a * 9 + 1.3));
    const ri = NE.r(a) + (o.band ?? 0.006) + 0.002, r = ri + ((w + 1) / 2) * W, x = Math.sin(a) * r, z = nz + Math.cos(a) * r;
    const ex = S.exact(x, z), y0 = ex ? ex.y : Math.min(S.top(a, r), NE.y(a) + 0.004), ns = S.normal(a, r), n0 = ex ? ns.map((c, k) => c + ex.n[k]) : ns, nl = Math.hypot(...n0), n = n0.map((c) => c / nl);
    // (thickest toward the neck, where the hood folds over; its ends lowered under the neckband (tucked))
    const prof = Math.max(0.3, Math.pow(Math.max(0, 1 - w * w), 0.4)) * (1 - 0.25 * ((w + 1) / 2)), dip = (1 - e) * 0.01;
    return { b: [x, y0 + 0.003 - dip, z], n, T: T * prof, q: -1 }; };
  const P = [], UV = [], Q = [], idx = [], SM = [];
  // (the underside's heights smoothed round and across (two passes), never below the cloth: a soft roll, not the
  // shell's facets traced)
  for (let i = 0; i <= NA; i++) { const row = []; for (let k = 0; k < M; k++) row.push(sampleAt(angle(i), -1 + (2 * k) / (M - 1))); SM.push(row); }
  for (let pass = 0; pass < 2; pass++) { const yy = SM.map((r) => r.map((s) => s.b[1])); for (let i = 0; i <= NA; i++) for (let k = 0; k < M; k++) { let t = 0, n = 0; for (const [di, dk] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) { const ii = i + di, kk = k + dk; if (ii < 0 || ii > NA || kk < 0 || kk >= M) continue; t += yy[ii][kk] * (di || dk ? 1 : 2); n += di || dk ? 1 : 2; } SM[i][k].b[1] = Math.max(yy[i][k], t / n); } }
  for (let i = 0; i <= NA; i++) {
    // (the loop: the underside from the inner edge out, then the top from the outer edge back in)
    for (let k = 0; k < M; k++) { const s = SM[i][k]; P.push(...s.b); UV.push(i / NA, 0.5 * k / (M - 1) * 0.3); Q.push(s.q); }
    for (let k = 0; k < M; k++) { const s = SM[i][M - 1 - k]; P.push(...s.b.map((x, c) => x + s.n[c] * Math.max(0.003, s.T))); UV.push(i / NA, 0.3 + 0.7 * k / (M - 1)); Q.push(s.q); } }
  const R = 2 * M;
  // (never into the cloth: each section's underside point at least 2 mm out along the nearest shell point's normal, the
  // whole section moved out with it (its top keeps the band's thickness))
  let pushed = 0; for (let i = 0; i <= NA; i++) { let worst = 0, dir = null; for (let k = 0; k < M; k++) { const v = i * R + k, p = [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]], q = nearestOn(sh, p), n = [sh.N[q * 3], sh.N[q * 3 + 1], sh.N[q * 3 + 2]], d = (p[0] - sh.P[q * 3]) * n[0] + (p[1] - sh.P[q * 3 + 1]) * n[1] + (p[2] - sh.P[q * 3 + 2]) * n[2];
      if (0.0005 - d > worst) { worst = 0.0005 - d; dir = n; } Q[v] = q; }
    if (worst > 0) { pushed++; for (let k = 0; k < R; k++) for (let c = 0; c < 3; c++) P[(i * R + k) * 3 + c] += dir[c] * worst; for (let k = M; k < R; k++) Q[i * R + k] = Q[i * R + (R - 1 - k)]; } }
  for (let i = 0; i < NA; i++) for (let k = 0; k < R; k++) { const a = i * R + k, b = a + R, a1 = i * R + ((k + 1) % R), b1 = (i + 1) * R + ((k + 1) % R); idx.push(a, b, a1, a1, b, b1); }
  // (wound so the top faces out of the band: every top triangle's normal against the way from the underside up to it,
  // summed, decides; one triangle's test flipped a whole hood where the back is steep)
  { let vote = 0; for (let q = 0; q < idx.length; q += 3) { const [a, b, c] = [idx[q], idx[q + 1], idx[q + 2]], ka = a % R; if (ka < M + 1 || ka > R - 2) continue; const A = [0, 1, 2].map((k) => P[a * 3 + k]), u = [0, 1, 2].map((k) => P[b * 3 + k] - A[k]), w = [0, 1, 2].map((k) => P[c * 3 + k] - A[k]);
      const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]], under = a - ka + (R - 1 - ka), d = [0, 1, 2].map((k) => A[k] - P[under * 3 + k]); vote += Math.sign(n[0] * d[0] + n[1] * d[1] + n[2] * d[2]); }
    if (vote < 0) for (let q = 0; q < idx.length; q += 3) { const x = idx[q + 1]; idx[q + 1] = idx[q + 2]; idx[q + 2] = x; } }
  for (const [i, nb] of [[0, 1], [NA, NA - 1]]) { const c = [0, 0, 0]; for (let k = 0; k < R; k++) for (let j = 0; j < 3; j++) c[j] += P[(i * R + k) * 3 + j] / R; const ci = P.length / 3; P.push(...c); UV.push(i / NA, 0.15); Q.push(Q[i * R]);
    const dir = [0, 1, 2].map((j) => c[j] - P[(nb * R) * 3 + j]);
    for (let k = 0; k < R; k++) { const a = i * R + k, b = i * R + ((k + 1) % R), A = [0, 1, 2].map((j) => P[a * 3 + j] - c[j]), B = [0, 1, 2].map((j) => P[b * 3 + j] - c[j]), n = [A[1] * B[2] - A[2] * B[1], A[2] * B[0] - A[0] * B[2], A[0] * B[1] - A[1] * B[0]];
      if (n[0] * dir[0] + n[1] * dir[1] + n[2] * dir[2] >= 0) idx.push(ci, a, b); else idx.push(ci, b, a); } }
  // (one set of weights for each section, its underside points' mean, smoothed with the next two either way: the band
  // moves as one soft piece on the shoulders; weighted point by point, its outer edge rode up through its inner part
  // when the shoulder rose (a sit, a gesture) and the band turned inside out there)
  const secW = []; for (let i = 0; i <= NA; i++) { const m = new Map(); for (let k = 0; k < M; k++) { const v = i * R + k, q = Q[v] >= 0 ? Q[v] : nearestOn(sh, [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]]); for (let j = 0; j < 4; j++) if (sh.WT[q * 4 + j] > 0) m.set(sh.JI[q * 4 + j], (m.get(sh.JI[q * 4 + j]) || 0) + sh.WT[q * 4 + j]); } secW.push(m); }
  const secS = secW.map((_, i) => { const m = new Map(); for (let d = -2; d <= 2; d++) { const ii = Math.min(NA, Math.max(0, i + d)), g = Math.exp(-(d * d) / 3); for (const [j, w] of secW[ii]) m.set(j, (m.get(j) || 0) + w * g); }
    const e = [...m.entries()].sort((x, y) => y[1] - x[1]).slice(0, 4), t = e.reduce((x, y) => x + y[1], 0) || 1; while (e.length < 4) e.push([0, 0]); return e.map(([j, w]) => [j, w / t]); });
  // (half the section's, half the cloth's right under the point: soft enough to follow the shoulder, one enough not to turn)
  const { JI, WT } = skinBy(P, (p, i) => { const sec = secS[Math.min(NA, Math.floor(i / R))] || secS[NA], q = Q[i] >= 0 ? Q[i] : nearestOn(sh, p), m = new Map();
    for (const [j, w] of sec) m.set(j, (m.get(j) || 0) + w * (o.secShare ?? 0.5)); for (let k = 0; k < 4; k++) if (sh.WT[q * 4 + k] > 0) m.set(sh.JI[q * 4 + k], (m.get(sh.JI[q * 4 + k]) || 0) + sh.WT[q * 4 + k] * (1 - (o.secShare ?? 0.5)));
    const e = [...m.entries()].sort((x, y) => y[1] - x[1]).slice(0, 4), t = e.reduce((x, y) => x + y[1], 0) || 1; while (e.length < 4) e.push([0, 0]); return e.map(([j, w]) => [j, w / t]); });
  ctx.log?.(`hood down (NK): ${pushed} of ${NA + 1} sections moved out onto the cloth`);
  ctx.log?.(`hood down (NK): one rolled band, ${NA + 1} sections x ${R}, from ${(a0 * 57.3).toFixed(0)} deg off the front round the back; neckline from ${NE.found} edge points`);
  return { P: Float32Array.from(P), UV: Float32Array.from(UV), JI, WT, idx: Uint32Array.from(idx) };
}
function nearestOn(sh, p) { if (!sh._ng) { const G = new Map(), c = 0.02; for (let i = 0; i < sh.P.length / 3; i++) { const k = Math.floor(sh.P[i * 3] / c) + ',' + Math.floor(sh.P[i * 3 + 1] / c) + ',' + Math.floor(sh.P[i * 3 + 2] / c); (G.get(k) || G.set(k, []).get(k)).push(i); } sh._ng = { G, c }; }
  const { G, c } = sh._ng, a = p.map((x) => Math.floor(x / c)); let best = 0, bd = 1e9;
  for (let r = 1; r <= 4 && bd === 1e9; r++) for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) for (let k = -r; k <= r; k++) for (const v of G.get((a[0] + i) + ',' + (a[1] + j) + ',' + (a[2] + k)) || []) { const d = (sh.P[v * 3] - p[0]) ** 2 + (sh.P[v * 3 + 1] - p[1]) ** 2 + (sh.P[v * 3 + 2] - p[2]) ** 2; if (d < bd) { bd = d; best = v; } }
  return best; }
// the drawcords: o { sh, len, x (each cord's x at the top), r }: round cords lying on the shell's front (their axis r +
// 0.6 mm off it), drifting out a little and swaying as they hang, an aglet (thinner, its own shade: uv v > 0.86) at
// each tip, the tip capped. uv u: 0..0.5 the left cord, 0.5..1 the right
export function drawcords(ctx, o) {
  const { NECKY } = ctx, sh = o.sh, nz = ctx.jpos('neck01')[2], NE = necklineOf(sh.P, sh.idx, nz, NECKY), S = surfaces(sh, NECKY, nz), L = o.len ?? 0.19, r0 = o.r ?? 0.0027, NS = 30, SEG = 8;
  const P = [], UV = [], Q = [], idx = [];
  for (const [ci, sx] of [[0, 1], [1, -1]]) { const base = P.length / 3, x0 = sx * (o.x ?? 0.03), yTop = NE.y(Math.asin(Math.min(1, (o.x ?? 0.03) / Math.max(0.04, NE.r(0))))) - 0.004;
    const path = []; for (let j = 0; j <= NS; j++) { const t = j / NS, y = yTop - L * t, x = x0 + sx * (0.008 * t * t + 0.0015 * Math.sin(t * 3.2 + ci * 1.7)), f = S.front(x, y), z = (f ?? nz + 0.1) + r0 + 0.0008 - (t < 0.06 ? 0.004 * (1 - t / 0.06) : 0); path.push({ p: [x, y, z], q: -1 }); }
    for (let j = 0; j <= NS; j++) { const p = path[j].p, nx = path[Math.min(NS, j + 1)].p, pv = path[Math.max(0, j - 1)].p, T = [0, 1, 2].map((k) => nx[k] - pv[k]), l = Math.hypot(...T); for (let k = 0; k < 3; k++) T[k] /= l;
      // (a frame round the cord: X across, Z out from the chest)
      let X = [1, 0, 0]; const d = X[0] * T[0] + X[1] * T[1] + X[2] * T[2]; X = X.map((x, k) => x - d * T[k]); const lx = Math.hypot(...X); X = X.map((x) => x / lx); const Z = [T[1] * X[2] - T[2] * X[1], T[2] * X[0] - T[0] * X[2], T[0] * X[1] - T[1] * X[0]];
      const t = j / NS, aglet = t > 1 - 0.022 / L, r = aglet ? r0 * 0.85 : r0;
      for (let k = 0; k < SEG; k++) { const th = (k / SEG) * TAU, c = Math.cos(th), s = Math.sin(th); P.push(...[0, 1, 2].map((m) => p[m] + (X[m] * c * 1.1 + Z[m] * s * 0.9) * r)); UV.push(ci * 0.5 + (k / SEG) * 0.5, aglet ? 0.93 : t * 0.86); Q.push(path[j].q); } }
    for (let j = 0; j < NS; j++) for (let k = 0; k < SEG; k++) { const a = base + j * SEG + k, b = a + SEG, a1 = base + j * SEG + ((k + 1) % SEG), b1 = b - k + ((k + 1) % SEG); idx.push(a, a1, b, a1, b1, b); }
    // (outward: the first quad's normal along its point's offset from the axis)
    const tri = idx.slice(idx.length - NS * SEG * 6, idx.length - NS * SEG * 6 + 3).map((v) => [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]]), u = tri[1].map((x, c) => x - tri[0][c]), w = tri[2].map((x, c) => x - tri[0][c]), n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]], off = [0, 1, 2].map((k) => tri[0][k] - path[0].p[k]);
    if (n[0] * off[0] + n[1] * off[1] + n[2] * off[2] < 0) for (let q = idx.length - NS * SEG * 6; q < idx.length; q += 3) { const x = idx[q + 1]; idx[q + 1] = idx[q + 2]; idx[q + 2] = x; }
    // (the tip capped)
    const tip = P.length / 3; P.push(...path[NS].p.map((x, k) => x + (path[NS].p[k] - path[NS - 1].p[k]) * 0.3)); UV.push(ci * 0.5 + 0.25, 0.95); Q.push(path[NS].q);
    for (let k = 0; k < SEG; k++) { const a = base + NS * SEG + k, b = base + NS * SEG + ((k + 1) % SEG), A = [0, 1, 2].map((m) => P[a * 3 + m] - P[tip * 3 + m]), B = [0, 1, 2].map((m) => P[b * 3 + m] - P[tip * 3 + m]), nn = [A[1] * B[2] - A[2] * B[1], A[2] * B[0] - A[0] * B[2], A[0] * B[1] - A[1] * B[0]];
      if (nn[1] <= 0) idx.push(tip, a, b); else idx.push(tip, b, a); } }
  const { JI, WT } = skinBy(P, (p, i) => { const q = Q[i] >= 0 ? Q[i] : nearestOn(sh, p); return [0, 1, 2, 3].map((k) => [sh.JI[q * 4 + k], sh.WT[q * 4 + k]]); });
  ctx.log?.(`drawcords (NK): 2 x ${(L * 100).toFixed(0)} cm, r ${(r0 * 1000).toFixed(1)} mm, lying on the front`);
  return { P: Float32Array.from(P), UV: Float32Array.from(UV), JI, WT, idx: Uint32Array.from(idx) };
}

/* ------------------------------------------------------ a pack top's neckline -- */
// P (positions, edited in place), tris (the top's triangles), si/sw (its skin weights, 0..255), NECKY, nz: the neckline's
// open edge evened (each edge point moved onto the smoothed line: its height and radius by angle), then a binding rolled
// over it: outside from 9 mm under the edge, over it, 6 mm down inside; skinned as the edge point nearest it
export function necklineBinding(P, tris, si, sw, NECKY, nz, o = {}) {
  const NE = necklineOf(P, tris, nz, NECKY, { NB: 64, smooth: 5, below: 0.16, rMax: 0.15, envelope: 1 }); if (NE.found < 12) return null;
  let moved = 0, maxMm = 0; for (const v of NE.verts) { const x = P[v * 3], z = P[v * 3 + 2] - nz, a = Math.atan2(x, z), r = NE.r(a), y = NE.y(a), d = Math.hypot(Math.hypot(x, z) - r, P[v * 3 + 1] - y); if (d > 0.03) continue;
    P[v * 3] = Math.sin(a) * r; P[v * 3 + 1] = y; P[v * 3 + 2] = nz + Math.cos(a) * r; moved++; maxMm = Math.max(maxMm, d * 1000); }
  // (the way down the top's surface from its edge, by angle (in the plane of radius and height): straight down over a
  // chest, out and down over the upper back. The binding lies along it, so it is the same width all round)
  const NB = 48, D = Array.from({ length: NB }, () => [0, 0]), vs = new Set(tris);
  for (const v of vs) { const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2] - nz, a = Math.atan2(x, z), dr = Math.hypot(x, z) - NE.r(a), dy = y - NE.y(a), d = Math.hypot(dr, dy); if (d < 0.008 || d > 0.04 || dy > 0.002) continue; const b = binOf(a, NB); D[b][0] += dr / d; D[b][1] += dy / d; }
  for (let p = 0; p < 3; p++) { const c = D.map((d) => d.slice()); for (let b = 0; b < NB; b++) for (let k = 0; k < 2; k++) D[b][k] = (2 * c[b][k] + c[(b + 1) % NB][k] + c[(b - 1 + NB) % NB][k]) / 4; }
  const dirAt = (a) => { const u = ((a + Math.PI) / TAU) * NB - 0.5, i0 = ((Math.floor(u) % NB) + NB) % NB, f = u - Math.floor(u); let dr = D[i0][0] * (1 - f) + D[(i0 + 1) % NB][0] * f, dy = D[i0][1] * (1 - f) + D[(i0 + 1) % NB][1] * f; const l = Math.hypot(dr, dy); if (l < 1e-3) return [0, -1]; dr /= l; dy /= l; if (dy > -0.15) { dy = -0.15; const l2 = Math.hypot(dr, dy); dr /= l2; dy /= l2; } return [dr, dy]; };
  const H = o.h ?? 0.011, IN = o.inside ?? 0.006, th = o.th ?? 0.0024, NA = 96, angle = (i) => (TAU * i) / NA - Math.PI;
  const loop = (i) => { const a = angle(i), yE = NE.y(a), rE = NE.r(a), [dr, dy] = dirAt(a), nr = -dy, ny = dr, at = (s, off) => ({ r: rE + dr * s + nr * off, y: yE + dy * s + ny * off }), out = [], inn = [];
    for (const s of [H, H * 0.6, H * 0.25, 0.0012]) out.push(at(s, th * 0.6));
    const rr = th * 0.7; for (const t of [0.2, 0.5, 0.8]) out.push(at(-Math.sin(t * Math.PI) * rr, Math.cos(t * Math.PI) * rr));
    for (const s of [0.0012, IN * 0.5, IN]) inn.push(at(s, -th * 0.7));
    return [...out, ...inn]; };
  const { P: BP, UV, idx } = revolve(NA, angle, loop, { nz, closed: true, outerK: 1 });
  const ev = [...NE.verts], near = (p) => { let best = ev[0], bd = 1e9; for (const v of ev) { const d = (P[v * 3] - p[0]) ** 2 + (P[v * 3 + 1] - p[1]) ** 2 + (P[v * 3 + 2] - p[2]) ** 2; if (d < bd) { bd = d; best = v; } } return best; };
  const { JI, WT } = skinBy(BP, (p) => weightsOf(si, sw, near(p)));
  return { mesh: { P: Float32Array.from(BP), UV: Float32Array.from(UV), JI, WT, idx: Uint32Array.from(idx) }, moved, maxMm: +maxMm.toFixed(1), edge: NE.found, line: NE };
}
// a coarse pack top's neckline made fine enough to follow a curve: each open edge round the neck longer than maxLen split
// at its middle (the new point on the evened line, its uv, normal and weights the two ends' mean), the triangle on it
// split in two; repeated until none is longer. P (positions), tris (the top's triangles, edited in place), A { uv,
// normal, skinIndex, skinWeight } (typed arrays, 2/3/4/4 per point); returns the grown arrays (P, A) and the count added
export function splitNeckline(P, tris, A, NECKY, nz, o = {}) {
  const W = { uv: 2, normal: 3, skinIndex: 4, skinWeight: 4 }, maxLen = o.maxLen ?? 0.012; let n = P.length / 3, added = 0;
  const NP = [], NA = { uv: [], normal: [], skinIndex: [], skinWeight: [] }, pos = (v) => (v < n ? [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]] : NP.slice((v - n) * 3, (v - n) * 3 + 3));
  const att = (k, v) => (v < n ? Array.from(A[k].subarray(v * W[k], v * W[k] + W[k])) : NA[k].slice((v - n) * W[k], (v - n) * W[k] + W[k]));
  for (let pass = 0; pass < 4; pass++) {
    const all = Float32Array.from([...P, ...NP]), NE = necklineOf(all, tris, nz, NECKY, { NB: 64, smooth: 5, below: 0.16, rMax: 0.15, envelope: 1 }), key = (v) => { const p = pos(v); return Math.round(p[0] * 1e4) + ',' + Math.round(p[1] * 1e4) + ',' + Math.round(p[2] * 1e4); };
    const ec = new Map(); for (let q = 0; q < tris.length; q += 3) for (let e = 0; e < 3; e++) { const a = key(tris[q + e]), b = key(tris[q + ((e + 1) % 3)]), k = a < b ? a + '|' + b : b + '|' + a; ec.set(k, (ec.get(k) || 0) + 1); }
    let split = 0; const out = [];
    for (let q = 0; q < tris.length; q += 3) { const t = [tris[q], tris[q + 1], tris[q + 2]]; let done = false;
      for (let e = 0; e < 3 && !done; e++) { const u = t[e], v = t[(e + 1) % 3], w = t[(e + 2) % 3], a = key(u), b = key(v), k = a < b ? a + '|' + b : b + '|' + a; if (ec.get(k) !== 1) continue;
        const pu = pos(u), pv = pos(v); if (!NE.verts.has(u) && !NE.verts.has(v)) continue; if (Math.hypot(pu[0] - pv[0], pu[1] - pv[1], pu[2] - pv[2]) <= maxLen) continue;
        const m = pu.map((x, c) => (x + pv[c]) / 2), ang = Math.atan2(m[0], m[2] - nz), r = NE.r(ang); NP.push(Math.sin(ang) * r, Math.max(m[1], Math.min(NE.y(ang), Math.max(pu[1], pv[1]) + 0.004)), nz + Math.cos(ang) * r);
        for (const kk of Object.keys(W)) { const x = att(kk, u), y = att(kk, v); NA[kk].push(...(kk === 'skinIndex' || kk === 'skinWeight' ? x : x.map((c, i) => Math.round((c + y[i]) / 2)))); }
        const mi = n + NP.length / 3 - 1; out.push(u, mi, w, mi, v, w); split++; added++; done = true; }
      if (!done) out.push(...t); }
    tris.splice(0, tris.length, ...out); if (!split) break; }
  if (!added) return { P, A, added: 0 };
  const P2 = new Float32Array(P.length + NP.length); P2.set(P); P2.set(NP, P.length); const A2 = {};
  for (const k of Object.keys(W)) { const a = new A[k].constructor(A[k].length + NA[k].length); a.set(A[k]); a.set(NA[k], A[k].length); A2[k] = a; }
  return { P: P2, A: A2, added };
}
