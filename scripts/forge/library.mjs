// THE CHARACTER FORGE: the garment and hair library (forge v2, 4 Nov 2026). Authored ON the cast bodies (the shaped
// CC0 MakeHuman body each character is built on), so a piece fits every build by construction:
//   shell()   a garment cut from the body's own surface by a smooth field (a hem, a cuff, a neckline are its zero line,
//             clipped through the triangles, so the edges are straight and clean), lifted off the body along its normals
//             by the cloth's thickness and over whatever is worn under it (never through it), the torso draped (it
//             bridges the hollows of the back and under the chest instead of clinging), skinned with the body's own
//             weights (it moves exactly as the body under it: no poke-through by construction); a coat's skirt hangs
//             from the hip line as rings round the legs' hull, its weights eased from the hips to the thighs. Painted in
//             the body's UV space by a 3D function: the cloth, its folds' shade, hems, plackets, pockets, rib bands
//   collar()  a band round the neck: a stand collar (a chef's, a doorman's) or a turned-down one (an overcoat's)
//   buttons() small domed buttons on the garment's surface, skinned as the cloth under them
//   GARMENTS  the pieces: overcoat, doorman/uniform coat, chef jacket (double-breasted), hoodie (crew neck under the
//             hood), loose trousers (women), plus helpers the core uses for the apron's ties and the knit beanie
//   hair      bob tucked behind the ear, balding / short, slicked, buzz; braids and locs are the core's braid builder
//             with the library's settings (BRAIDS)
// Every number is in metres in the body's bind space (y up, z forward, +x the character's left).
import { SHOES } from './shoes.mjs';
import { standCollar, turnCollar, neckSkin } from './necklines.mjs';
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const hash3 = (x, y, z) => { let h = (x * 374761393 + y * 668265263 + z * 2147483647) >>> 0; h = ((h ^ (h >>> 13)) * 1274126177) >>> 0; return ((h ^ (h >>> 16)) & 0xffff) / 65535; };
export function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), fx = x - xi, fy = y - yi, fz = z - zi, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const L = (a, b, t) => a + (b - a) * t, h = (i, j, k) => hash3(xi + i, yi + j, zi + k);
  return L(L(L(h(0, 0, 0), h(1, 0, 0), u), L(h(0, 1, 0), h(1, 1, 0), u), v), L(L(h(0, 0, 1), h(1, 0, 1), u), L(h(0, 1, 1), h(1, 1, 1), u), v), w);
}
const fbm = (p, s) => vnoise(p[0] / s, p[1] / s, p[2] / s) * 0.55 + vnoise(p[0] / s * 2.3 + 7, p[1] / s * 2.3, p[2] / s * 2.3) * 0.3 + vnoise(p[0] / s * 5.1, p[1] / s * 5.1 + 3, p[2] / s * 5.1) * 0.15;
const lin = (c) => Math.pow(c / 255, 2.2), enc = (l) => clamp(Math.round(255 * Math.pow(Math.max(0, l), 1 / 2.2)), 0, 255);
const hexRGB = (h, d) => (h ? [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) : d);

/* ------------------------------------------------------------------ context -- */
// ctx (from core.mjs): bPos, nBody, bodyIdx (the body group's triangles), uv (u16), si / sw (B skeleton index, u8
// weights), SKEL, jpos(name) (a joint's head on the shaped body), NECKY, WAIST, EY, EZ, sex, pPos, packIdx, wearT
export function prepare(ctx) {
  const { bPos, nBody, bodyIdx, si, sw, SKEL } = ctx;
  // (welded smooth normals of the shaped body)
  const key = (v) => Math.round(bPos[v * 3] * 2e4) + ',' + Math.round(bPos[v * 3 + 1] * 2e4) + ',' + Math.round(bPos[v * 3 + 2] * 2e4);
  const wid = new Int32Array(nBody), W = new Map(); for (let v = 0; v < nBody; v++) { const k = key(v); if (!W.has(k)) W.set(k, W.size); wid[v] = W.get(k); }
  const acc = new Float64Array(W.size * 3);
  for (let q = 0; q < bodyIdx.length; q += 3) { const a = bodyIdx[q], b = bodyIdx[q + 1], c = bodyIdx[q + 2], A = (i, k) => bPos[i * 3 + k];
    const ux = A(b, 0) - A(a, 0), uy = A(b, 1) - A(a, 1), uz = A(b, 2) - A(a, 2), vx = A(c, 0) - A(a, 0), vy = A(c, 1) - A(a, 1), vz = A(c, 2) - A(a, 2), n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
    for (const v of [a, b, c]) for (let k = 0; k < 3; k++) acc[wid[v] * 3 + k] += n[k]; }
  const N = new Float32Array(nBody * 3); for (let v = 0; v < nBody; v++) { const w = wid[v], l = Math.hypot(acc[w * 3], acc[w * 3 + 1], acc[w * 3 + 2]) || 1; for (let k = 0; k < 3; k++) N[v * 3 + k] = acc[w * 3 + k] / l; }
  const BI = (n) => SKEL.findIndex((b) => b.name === n);
  const ARM = new Set(SKEL.map((b, i) => (/^(shoulder01|upperarm|lowerarm|wrist|finger)/.test(b.name) ? i : -1)).filter((i) => i >= 0));
  const HAND = new Set(SKEL.map((b, i) => (/^(wrist|finger)/.test(b.name) ? i : -1)).filter((i) => i >= 0));
  const LEG = new Set(SKEL.map((b, i) => (/^(upperleg|lowerleg)/.test(b.name) ? i : -1)).filter((i) => i >= 0));
  const FOOT = new Set(SKEL.map((b, i) => (/^foot/.test(b.name) ? i : -1)).filter((i) => i >= 0));
  const HEAD = new Set(SKEL.map((b, i) => (/^(head|neck0[23])/.test(b.name) ? i : -1)).filter((i) => i >= 0));
  const share = (v, set) => { let w = 0; for (let k = 0; k < 4; k++) if (set.has(si[v * 4 + k])) w += sw[v * 4 + k] / 255; return w; };
  const cls = new Uint8Array(nBody); // 0 torso, 1 arm, 2 hand, 3 leg, 4 foot, 5 head
  for (let v = 0; v < nBody; v++) cls[v] = share(v, HAND) > 0.5 ? 2 : share(v, ARM) > 0.5 ? 1 : share(v, FOOT) > 0.5 ? 4 : share(v, HEAD) > 0.5 ? 5 : share(v, LEG) > 0.5 ? 3 : 0;
  // (each arm's line, shoulder to wrist, for sleeves: a point's distance down it)
  const arm = {}; for (const s of ['L', 'R']) { const a = ctx.jpos('upperarm01.' + s), e = ctx.jpos('lowerarm01.' + s), w = ctx.jpos('wrist.' + s); arm[s] = { a, e, w, len: Math.hypot(e[0] - a[0], e[1] - a[1], e[2] - a[2]) + Math.hypot(w[0] - e[0], w[1] - e[1], w[2] - e[2]) }; }
  const down = (p) => { const s = p[0] >= 0 ? 'L' : 'R', { a, e, w } = arm[s]; const seg = (A, B) => { const d = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], L = Math.hypot(...d), t = clamp(((p[0] - A[0]) * d[0] + (p[1] - A[1]) * d[1] + (p[2] - A[2]) * d[2]) / (L * L), -0.5, 1.5); return { t, L, r: Math.hypot(p[0] - A[0] - d[0] * t, p[1] - A[1] - d[1] * t, p[2] - A[2] - d[2] * t) }; };
    const u = seg(a, e), l = seg(e, w); return u.r < l.r || u.t < 1 ? u.t * u.L : u.L + l.t * l.L; };
  // (the wrist's distance down the arm, each side)
  const wristDown = { L: arm.L.len, R: arm.R.len };
  const crotch = (() => { let y = 9; for (let v = 0; v < nBody; v++) if (cls[v] === 3 && Math.abs(bPos[v * 3]) < 0.02 && bPos[v * 3 + 1] > 0.5) y = Math.min(y, bPos[v * 3 + 1]); return y; })();
  return Object.assign(ctx, { N, wid, cls, BI, share, down, wristDown, arm, crotch, ankle: ctx.jpos('foot.L')[1], knee: ctx.jpos('lowerleg01.L')[1], hip: ctx.jpos('upperleg01.L')[1] });
}

// a slice's convex hull (monotone chain) and its radius by angle round (cx, cz): a ray from the centre to the hull's edge.
// A cloth stretched round a body takes this shape: every hollow bridged
export function hullRadii(pts, cx, cz, NB) {
  const P = pts.map(([x, z]) => [x - cx, z - cz]).sort((a, b) => a[0] - b[0] || a[1] - b[1]); if (P.length < 3) return null;
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], up = [];
  for (const p of P) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = P.length - 1; i >= 0; i--) { const p = P[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  const H = lo.slice(0, -1).concat(up.slice(0, -1)), R = new Float32Array(NB);
  for (let k = 0; k < NB; k++) { const a = -Math.PI + ((k + 0.5) / NB) * 2 * Math.PI, d = [Math.sin(a), Math.cos(a)]; let best = 0;
    for (let i = 0; i < H.length; i++) { const A = H[i], B = H[(i + 1) % H.length], e = [B[0] - A[0], B[1] - A[1]], den = d[0] * e[1] - d[1] * e[0]; if (Math.abs(den) < 1e-12) continue;
      const t = (A[0] * e[1] - A[1] * e[0]) / den, u = (A[0] * d[1] - A[1] * d[0]) / den; if (t > 0 && u >= -1e-9 && u <= 1 + 1e-9) best = Math.max(best, t); }
    R[k] = best; }
  return R;
}
/* -------------------------------------------------------------------- shell -- */
// spec: { id, field(p, cls, v) -> m (> 0 inside), thick(p, cls, f) -> m, ease (extra over inner layers, m), drape (iters),
//         skirt: { len (m below the hip line), flare, rings } | null, paint(p, n, f, cls) -> [r,g,b] (0..255), tex (px) }
export function shell(ctx, spec) {
  const { bPos, N, nBody, bodyIdx, uv, si, sw, cls } = ctx;
  const f = new Float32Array(nBody); for (let v = 0; v < nBody; v++) f[v] = spec.field([bPos[v * 3], bPos[v * 3 + 1], bPos[v * 3 + 2]], cls[v], v);
  // (the vertices: the body's own inside the field, and points on the edges the zero line crosses)
  const P = [], NN = [], UV = [], JI = [], WT = [], F = [], C = [], idx = [], map = new Map();
  const wOf = (v) => { const m = new Map(); for (let k = 0; k < 4; k++) { const w = sw[v * 4 + k] / 255; if (w > 0) m.set(si[v * 4 + k], (m.get(si[v * 4 + k]) || 0) + w); } return m; };
  const push = (pp, nn, u, wm, ff, cl) => { const e = [...wm.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4), s = e.reduce((a, x) => a + x[1], 0) || 1; while (e.length < 4) e.push([0, 0]);
    P.push(...pp); NN.push(...nn); UV.push(...u); for (const [j, w] of e) { JI.push(j); WT.push(w / s); } F.push(ff); C.push(cl); return P.length / 3 - 1; };
  const uvOf = (v) => [uv[v * 2] / 65535, 1 - uv[v * 2 + 1] / 65535];
  const vert = (v) => { if (map.has(v)) return map.get(v); const i = push([bPos[v * 3], bPos[v * 3 + 1], bPos[v * 3 + 2]], [N[v * 3], N[v * 3 + 1], N[v * 3 + 2]], uvOf(v), wOf(v), f[v], cls[v]); map.set(v, i); return i; };
  const edge = (a, b) => { const k = a < b ? a + ':' + b : b + ':' + a; if (map.has(k)) return map.get(k); const t = f[a] / (f[a] - f[b]), L = (x, y) => x + (y - x) * t;
    const pp = [0, 1, 2].map((k) => L(bPos[a * 3 + k], bPos[b * 3 + k])), nn = [0, 1, 2].map((k) => L(N[a * 3 + k], N[b * 3 + k])), ua = uvOf(a), ub = uvOf(b), wa = wOf(a), wb = wOf(b), wm = new Map();
    for (const [j, w] of wa) wm.set(j, (wm.get(j) || 0) + w * (1 - t)); for (const [j, w] of wb) wm.set(j, (wm.get(j) || 0) + w * t);
    const i = push(pp, nn, [L(ua[0], ub[0]), L(ua[1], ub[1])], wm, 0, t < 0.5 ? cls[a] : cls[b]); map.set(k, i); return i; };
  const hide = new Set();
  for (let q = 0; q < bodyIdx.length; q += 3) { const t = [bodyIdx[q], bodyIdx[q + 1], bodyIdx[q + 2]], s = t.map((v) => f[v] >= 0), n = s.filter(Boolean).length;
    if (t.every((v) => f[v] > (spec.hideIn ?? 0.012))) hide.add(q / 3);
    if (!n) continue; if (n === 3) { idx.push(vert(t[0]), vert(t[1]), vert(t[2])); continue; }
    for (let r = 0; r < 3; r++) { const a = t[r], b = t[(r + 1) % 3], c = t[(r + 2) % 3];
      if (n === 1 && s[r]) { idx.push(vert(a), edge(a, b), edge(a, c)); break; }
      if (n === 2 && !s[(r + 2) % 3]) { const ab = [vert(a), vert(b)], bc = edge(b, c), ca = edge(c, a); idx.push(ab[0], ab[1], bc, ab[0], bc, ca); break; } } }
  const nv = P.length / 3; let Pp = Float32Array.from(P); const Nn = Float32Array.from(NN), P0 = Float32Array.from(P);
  for (let i = 0; i < nv; i++) { const l = Math.hypot(Nn[i * 3], Nn[i * 3 + 1], Nn[i * 3 + 2]) || 1; for (let k = 0; k < 3; k++) Nn[i * 3 + k] /= l; }
  // (adjacency, welded by place: the body's uv seams split points that are one point of the cloth)
  const keyP = (i) => Math.round(Pp[i * 3] * 2e4) + ',' + Math.round(Pp[i * 3 + 1] * 2e4) + ',' + Math.round(Pp[i * 3 + 2] * 2e4);
  const wk = new Map(), wOfI = new Int32Array(nv); for (let i = 0; i < nv; i++) { const k = keyP(i); if (!wk.has(k)) wk.set(k, wk.size); wOfI[i] = wk.get(k); }
  const nW = wk.size, adj = Array.from({ length: nW }, () => new Set()), ec = new Map();
  for (let q = 0; q < idx.length; q += 3) for (let e = 0; e < 3; e++) { const a = wOfI[idx[q + e]], b = wOfI[idx[q + (e + 1) % 3]]; if (a === b) continue; adj[a].add(b); adj[b].add(a); const k = a < b ? a + ',' + b : b + ',' + a; ec.set(k, (ec.get(k) || 0) + 1); }
  const rim = new Uint8Array(nW); for (const [k, c] of ec) if (c === 1) { const [a, b] = k.split(',').map(Number); rim[a] = rim[b] = 1; }
  const members = Array.from({ length: nW }, () => []); for (let i = 0; i < nv; i++) members[wOfI[i]].push(i);
  // (the thickness, then over the layers under it: each point at least `ease` past any inner point standing off the body
  // near it (within 1.5 cm sideways), the need spread to its neighbours so it rises smoothly, never a bump)
  const need = new Float32Array(nW), needIn = new Float32Array(nW), first = new Int32Array(nW).fill(-1); for (let i = 0; i < nv; i++) if (first[wOfI[i]] < 0) first[wOfI[i]] = i;
  for (let w = 0; w < nW; w++) { const i = first[w]; need[w] = spec.thick([Pp[i * 3], Pp[i * 3 + 1], Pp[i * 3 + 2]], C[i], F[i]); }
  if (ctx.inner?.length) { const G = new Map(), cell = 0.02, gk = (x, y, z) => Math.floor(x / cell) + ',' + Math.floor(y / cell) + ',' + Math.floor(z / cell); for (const q of ctx.inner) { const k = gk(q[0], q[1], q[2]); (G.get(k) || G.set(k, []).get(k)).push(q); }
    let lifted = 0; for (let w = 0; w < nW; w++) { const i = first[w], p = [Pp[i * 3], Pp[i * 3 + 1], Pp[i * 3 + 2]], n = [Nn[i * 3], Nn[i * 3 + 1], Nn[i * 3 + 2]], cx = Math.floor(p[0] / cell), cy = Math.floor(p[1] / cell), cz = Math.floor(p[2] / cell); let m = 0;
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) { const L = G.get((cx + a) + ',' + (cy + b) + ',' + (cz + c)); if (!L) continue;
        for (const q of L) { const d = [q[0] - p[0], q[1] - p[1], q[2] - p[2]], e = d[0] * n[0] + d[1] * n[1] + d[2] * n[2]; if (e <= 0 || e > 0.03) continue; const side = Math.hypot(d[0] - n[0] * e, d[1] - n[1] * e, d[2] - n[2] * e); if (side < 0.012) m = Math.max(m, e); } }
      if (m > 0) needIn[w] = m + (spec.ease ?? 0.004); if (m + (spec.ease ?? 0.004) > need[w]) { need[w] = m + (spec.ease ?? 0.004); lifted++; } }
    ctx.log?.(`${spec.id}: ${lifted} points lifted over the layers under it`); }
  let d = Float32Array.from(need); for (let it = 0; it < 4; it++) { const nx = Float32Array.from(d); for (let w = 0; w < nW; w++) { let s = 0, c = 0; for (const o of adj[w]) { s += d[o]; c++; } if (c) nx[w] = Math.max(need[w], s / c); } d = nx; }
  for (let i = 0; i < nv; i++) { const dd = d[wOfI[i]]; for (let k = 0; k < 3; k++) Pp[i * 3 + k] += Nn[i * 3 + k] * dd; }
  // (forge v2.1, the chest: cloth stretched over a chest falls in a straight line from the collarbone to the chest's
  // fullest point and from there down, so no breast or pectoral shape shows through a jacket. The torso's front, column by
  // column (angle round a fixed axis), takes the concave envelope of its own profile (radius against height) from under
  // the collar to the waist. The smoothing after may round it by at most spec.chest.keep, never erode it back onto the
  // body (it used to: 120 smoothing passes took every tent the hang made back down to the skin))
  const keepOff = new Float32Array(nW).fill(-1);
  const chestPass = (lock, tag) => { if (!spec.chest || globalThis.process?.env?.FORGE_NO_CHEST) return; const Q = spec.chest, NB = 36, dy = 0.008, yHi = Q.top, yLo = Q.bottom, NY = Math.ceil((yHi - yLo) / dy) + 1, front = Q.front ?? 1.35, fade = Q.fade ?? 0.45;
    const mem = []; let czS = 0; for (let w = 0; w < nW; w++) { const i = first[w], y = Pp[i * 3 + 1]; if (C[i] !== 0 || y > yHi || y < yLo) continue; mem.push(w); czS += Pp[i * 3 + 2]; }
    if (mem.length > 50) { const cz0 = czS / mem.length - (Q.back ?? 0.02), slices = Array.from({ length: NY }, () => []);
      for (const w of mem) { const i = first[w]; slices[Math.min(NY - 1, Math.floor((yHi - Pp[i * 3 + 1]) / dy))].push([Pp[i * 3], Pp[i * 3 + 2]]); }
      const R = new Float32Array(NY * NB), has = new Uint8Array(NY); for (let b = 0; b < NY; b++) { const h = slices[b].length >= 3 ? hullRadii(slices[b], 0, cz0, NB) : null; if (h) { R.set(h, b * NB); has[b] = 1; } }
      const angA = (k) => -Math.PI + ((k + 0.5) / NB) * 2 * Math.PI;
      // (each column's upper concave hull in (height, radius): the envelope a stretched cloth takes)
      const E = new Float32Array(NY * NB); for (let k = 0; k < NB; k++) { if (Math.abs(angA(k)) > front + 0.2) continue; const pts = []; for (let b = 0; b < NY; b++) if (has[b] && R[b * NB + k] > 0) pts.push([b, R[b * NB + k]]);
        const H = []; for (const p of pts) { while (H.length >= 2) { const a = H[H.length - 2], c = H[H.length - 1]; if ((c[0] - a[0]) * (p[1] - a[1]) - (c[1] - a[1]) * (p[0] - a[0]) >= 0) H.pop(); else break; } H.push(p); }
        for (let j = 0; j + 1 < H.length; j++) { const [b0, r0] = H[j], [b1, r1] = H[j + 1]; for (let b = b0; b <= b1; b++) E[b * NB + k] = r0 + ((r1 - r0) * (b - b0)) / Math.max(1, b1 - b0); } if (H.length === 1) E[H[0][0] * NB + k] = H[0][1]; 
        // (below the fullest point the cloth falls back in no faster than spec.chest.taper (m per m): it hangs from the
        // chest nearly straight (a stiff coat) or eases back toward the body (a soft hoodie), never tucks under the chest)
        if (Q.taper) { let bm = -1, em = -1; for (let b = 0; b < NY; b++) if (E[b * NB + k] > em) { em = E[b * NB + k]; bm = b; } for (let b = bm + 1; b < NY; b++) E[b * NB + k] = Math.max(E[b * NB + k], em - Q.taper * (b - bm) * dy); } }
      const Eat = (y, a) => { const fb = clamp((yHi - y) / dy - 0.5, 0, NY - 1.001), b0 = Math.floor(fb), tb = fb - b0, fk = ((a + Math.PI) / (2 * Math.PI)) * NB - 0.5, k0 = Math.floor(fk), tk = fk - k0, g = (b, k) => E[b * NB + ((k % NB) + NB) % NB];
        return (g(b0, k0) * (1 - tk) + g(b0, k0 + 1) * tk) * (1 - tb) + (g(b0 + 1, k0) * (1 - tk) + g(b0 + 1, k0 + 1) * tk) * tb; };
      let moved = 0, big = 0; for (const w of mem) { const i = first[w], x = Pp[i * 3], z = Pp[i * 3 + 2] - cz0, r = Math.hypot(x, z), a = Math.atan2(x, z), wa = 1 - sm(front - fade, front, Math.abs(a)); if (wa <= 0 || r < 1e-4) continue;
        // (eased in at the band's top and bottom, so it has no step)
        const wy = sm(yLo, yLo + 0.04, Pp[i * 3 + 1]) * (1 - sm(yHi - 0.03, yHi, Pp[i * 3 + 1])), want = Eat(Pp[i * 3 + 1], a), lift = Math.min(Q.max ?? 0.06, Math.max(0, want - r)) * wa * wy;
        if (lift > 1e-4) { for (const j of members[w]) { Pp[j * 3] += (x / r) * lift; Pp[j * 3 + 2] += (z / r) * lift; } moved++; big = Math.max(big, lift); }
        if (lock) keepOff[w] = (Pp[i * 3] - P0[i * 3]) * Nn[i * 3] + (Pp[i * 3 + 1] - P0[i * 3 + 1]) * Nn[i * 3 + 1] + (Pp[i * 3 + 2] - P0[i * 3 + 2]) * Nn[i * 3 + 2] - (Q.keep ?? 0.006); }
      ctx.log?.(`${spec.id}: chest envelope (${tag}) ${moved} of ${mem.length} points let out, biggest ${(big * 100).toFixed(1)} cm`); } }
  chestPass(true, 'before the hang');
  // (hang: cloth falls from the widest point above it. Round the body's axis (or each leg's, for trousers), height by
  // height from spec.hang.from down, no point of the torso (or leg) sits further in than the cloth above it at that
  // angle, less a small taper: a coat falls straight from the chest and the seat, a trouser leg from the thigh)
  if (spec.hang) { const H0 = spec.hang, NB = 48, dy = 0.01, groups = H0.legs ? [['T', 0], ['L', 1], ['R', -1]] : [['T', 0]];
    for (const [g, sx] of groups) {
      const mem = []; for (let w = 0; w < nW; w++) { const i = first[w], c = C[i], y = Pp[i * 3 + 1]; if (c === 1 || c === 2 || c === 5 || y > H0.from) continue; if (g === 'T' ? (c !== 0 && c !== 3) || (H0.legs && y < H0.legFrom) : (c !== 3 && c !== 4) || Math.sign(Pp[i * 3]) !== sx || y > H0.legFrom) continue; mem.push(w); }
      if (!mem.length) continue; const yTop = Math.max(...mem.map((w) => Pp[first[w] * 3 + 1])), yBot = Math.min(...mem.map((w) => Pp[first[w] * 3 + 1])), NY = Math.ceil((yTop - yBot) / dy) + 1;
      // (the axis at each height: the slice's middle)
      const cx = new Float32Array(NY), cz = new Float32Array(NY), cn = new Float32Array(NY); for (const w of mem) { const i = first[w], b = Math.min(NY - 1, Math.floor((yTop - Pp[i * 3 + 1]) / dy)); cx[b] += Pp[i * 3]; cz[b] += Pp[i * 3 + 2]; cn[b]++; }
      for (let b = 0; b < NY; b++) { if (cn[b]) { cx[b] /= cn[b]; cz[b] /= cn[b]; } else if (b) { cx[b] = cx[b - 1]; cz[b] = cz[b - 1]; } }
      if (g === 'T') for (let b = 0; b < NY; b++) cx[b] = 0;
      // (each cell of height x angle: the 85th percentile of its points' radii (a stray point no spike); empty cells
      // from their neighbours; then down the body never further in than the cell above (less the taper); then smoothed,
      // and read back between cells, so the cloth's new surface is smooth, not a staircase)
      const angOf = (x, z) => Math.atan2(x, z), cell = (a) => ((a + Math.PI) / (2 * Math.PI)) * NB - 0.5, slices = Array.from({ length: NY }, () => []);
      for (const w of mem) { const i = first[w], b0 = Math.min(NY - 1, Math.floor((yTop - Pp[i * 3 + 1]) / dy)); slices[b0].push([Pp[i * 3], Pp[i * 3 + 2]]); }
      const R = new Float32Array(NY * NB); for (let b0 = 0; b0 < NY; b0++) { const h = hullRadii(slices[b0], cx[b0], cz[b0], NB); if (h) R.set(h, b0 * NB); }
      for (let it = 0; it < NB; it++) { let holes = 0; for (let bb = 0; bb < NY; bb++) for (let k = 0; k < NB; k++) { const q = bb * NB + k; if (R[q]) continue; holes++; const l = R[bb * NB + (k + NB - 1) % NB], r = R[bb * NB + (k + 1) % NB]; if (l || r) R[q] = l && r ? (l + r) / 2 : l || r; } if (!holes) break; }
      for (let bb = 1; bb < NY; bb++) for (let k = 0; k < NB; k++) { const a0 = -Math.PI + ((k + 0.5) / NB) * 2 * Math.PI, inward = g !== 'T' ? Math.max(0, -Math.sin(a0) * sx) : 0, tp = (H0.taper ?? 0) + (H0.inner ?? 0.25) * inward;
        R[bb * NB + k] = Math.max(R[bb * NB + k], R[(bb - 1) * NB + k] - tp * dy); }
      for (let it = 0; it < 3; it++) { const c0 = Float32Array.from(R); for (let bb = 0; bb < NY; bb++) for (let k = 0; k < NB; k++) { let s0 = 0, n0 = 0; for (let db = -1; db <= 1; db++) { const b2 = bb + db; if (b2 < 0 || b2 >= NY) continue; for (let dk = -1; dk <= 1; dk++) { s0 += c0[b2 * NB + (k + dk + NB) % NB]; n0++; } } R[bb * NB + k] = s0 / n0; } }
      const Rat = (y, a) => { const fb = Math.max(0, Math.min(NY - 1.001, (yTop - y) / dy - 0.5)), b0 = Math.floor(fb), tb = fb - b0, fk = cell(a), k0 = Math.floor(fk), tk = fk - k0, g0 = (bb, k) => R[bb * NB + ((k % NB) + NB) % NB];
        return (g0(b0, k0) * (1 - tk) + g0(b0, k0 + 1) * tk) * (1 - tb) + (g0(b0 + 1, k0) * (1 - tk) + g0(b0 + 1, k0 + 1) * tk) * tb; };
      let moved = 0; const dbg = {}; for (const w of mem) { const i = first[w], y = Pp[i * 3 + 1], b0 = Math.min(NY - 1, Math.max(0, Math.round((yTop - y) / dy - 0.5))), x = Pp[i * 3] - cx[b0], z = Pp[i * 3 + 2] - cz[b0], r = Math.hypot(x, z), want = Rat(y, angOf(x, z));
        if (r > 1e-4 && want > r + 1e-4) { const sc = Math.min(want, r + (H0.max ?? 0.06)) / r; mv0(w, x * sc - x, z * sc - z); moved++; if ((sc - 1) * r > (dbg.m || 0)) Object.assign(dbg, { m: (sc - 1) * r, y, x: Pp[i * 3], z: Pp[i * 3 + 2], c: C[i], rim: rim[w], r }); } }
      ctx.log?.(`${spec.id}: hang ${g} biggest move ${(dbg.m * 100 || 0).toFixed(1)} cm at ${[dbg.x, dbg.y, dbg.z].map((v) => v?.toFixed(3))} class ${dbg.c} rim ${dbg.rim} r ${dbg.r?.toFixed(3)}`);
      ctx.log?.(`${spec.id}: hang ${g} ${moved} of ${mem.length} points let out`); }
    function mv0(w, dx, dz) { for (const i of members[w]) { Pp[i * 3] += dx; Pp[i * 3 + 2] += dz; } }
  }
  // (natural shoulders, the owner's rule: from the neck's side to the arm the cloth's top follows one sloped line
  // (spec.shoulder.slope, ~16 deg), and anything above it (a strong deltoid's corner, a shoulder-pad look) is let down
  // onto it, softly; the line starts at the cloth's own top beside the neck (NK: for a stand collar's coat, whose
  // neckline rises at the back's corners to meet the collar, read no further back than 2 cm behind the neck's axis))
  const letDown = () => { if (!spec.shoulder) return; const nz = ctx.jpos('neck01')[2]; let yN = -9; const yMin = (ctx.ARMPIT ?? ctx.NECKY - 0.2) + 0.03; for (let i = 0; i < nv; i++) { const ax = Math.abs(Pp[i * 3]); if (ax > 0.065 && ax < 0.115 && Math.abs(Pp[i * 3 + 2] - nz) < 0.06 && !(spec.shoulder.besideOnly && Pp[i * 3 + 2] - nz < -0.02) && !(spec.fieldBase && C[i] === 0 && spec.fieldBase([P0[i * 3], P0[i * 3 + 1], P0[i * 3 + 2]], C[i]) < 0) && Pp[i * 3 + 1] > yMin) yN = Math.max(yN, Pp[i * 3 + 1]); }
    if (yN < 0) { ctx.log?.(`${spec.id}: shoulder line skipped (no cloth over the shoulders)`); return; }
    let n = 0; if (yN > 0) for (let i = 0; i < nv; i++) { const ax = Math.abs(Pp[i * 3]); if (ax < 0.08 || ax > 0.3 || C[i] === 2) continue; const line = yN - spec.shoulder.slope * (ax - 0.075) - (spec.shoulder.round ?? 0) * (ax - 0.075) ** 2 + 0.003, y = Pp[i * 3 + 1]; if (y <= line) continue;
      const w = sm(0.08, 0.11, ax); Pp[i * 3 + 1] = y - (y - line) * 0.8 * w; n++; }
    ctx.log?.(`${spec.id}: shoulder line from ${yN.toFixed(3)}, ${n} points let down`); };
  letDown();
  // (forge v2.2, the shoulder bridge (spec.shoulder.bridge): tailored cloth spans from the neck point to the shoulder
  // point; it does not dip into the valley between a heavy man's trapezius and his deltoid. Slice by slice front to back,
  // each side's top line (distance out, height) takes its upper hull, so the line from the neck to the arm only ever
  // rounds down (the gates' shoulder check), and the smoothing after may not wear it back down)
  if (spec.shoulder?.bridge && !globalThis.process?.env?.FORGE_NO_BRIDGE) { const yMin = (ctx.ARMPIT ?? ctx.NECKY - 0.2) + 0.02, dz = 0.03, bins = new Map(); let n = 0, big = 0;
    for (let w = 0; w < nW; w++) { const i = first[w]; if (C[i] === 2 || C[i] === 5 || Nn[i * 3 + 1] < 0.45) continue; const ax = Math.abs(Pp[i * 3]), y = Pp[i * 3 + 1]; if (ax < 0.06 || ax > 0.26 || y < yMin) continue;
      const k = (Pp[i * 3] > 0 ? 'L' : 'R') + Math.floor((Pp[i * 3 + 2] - ctx.jpos('neck01')[2]) / dz + 0.5); (bins.get(k) || bins.set(k, []).get(k)).push(w); }
    for (const ws of bins.values()) { if (ws.length < 4) continue; const pts = ws.map((w) => [Math.abs(Pp[first[w] * 3]), Pp[first[w] * 3 + 1]]).sort((a, b) => a[0] - b[0]), H = [];
      for (const p of pts) { while (H.length >= 2) { const a = H[H.length - 2], c = H[H.length - 1]; if ((c[0] - a[0]) * (p[1] - a[1]) - (c[1] - a[1]) * (p[0] - a[0]) >= 0) H.pop(); else break; } H.push(p); }
      const at = (x) => { for (let j = 0; j + 1 < H.length; j++) if (x >= H[j][0] && x <= H[j + 1][0]) return H[j][1] + ((H[j + 1][1] - H[j][1]) * (x - H[j][0])) / Math.max(1e-6, H[j + 1][0] - H[j][0]); return null; };
      for (const w of ws) { const i = first[w], ax = Math.abs(Pp[i * 3]), y = Pp[i * 3 + 1], h = at(ax); if (h == null || h <= y) continue; const lift = Math.min(0.018, h - y) * sm(0.065, 0.085, ax) * (1 - sm(0.235, 0.255, ax)); if (lift < 1e-4) continue;
        for (const j of members[w]) Pp[j * 3 + 1] += lift; keepOff[w] = Math.max(keepOff[w], (Pp[i * 3] - P0[i * 3]) * Nn[i * 3] + (Pp[i * 3 + 1] - P0[i * 3 + 1]) * Nn[i * 3 + 1] + (Pp[i * 3 + 2] - P0[i * 3 + 2]) * Nn[i * 3 + 2] - 0.002); n++; big = Math.max(big, lift); } }
    ctx.log?.(`${spec.id}: shoulder bridge ${n} points lifted, biggest ${(big * 1000).toFixed(1)} mm`); }
  // (smooth: the body's muscle and bone taken out of the cloth: each point moved along its normal toward its neighbours'
  // middle, never closer to the body than the cloth's own thickness; the arms a little, the torso a lot)
  const isArm0 = new Uint8Array(nW); for (let i = 0; i < nv; i++) if (C[i] === 1 || C[i] === 2) isArm0[wOfI[i]] = 1;
  for (let it = 0; it < (spec.smooth ?? 0); it++) { const pos = new Float32Array(nW * 3); for (let i = 0; i < nv; i++) for (let k = 0; k < 3; k++) pos[wOfI[i] * 3 + k] = Pp[i * 3 + k];
    const mv = new Float32Array(nW);
    for (let w = 0; w < nW; w++) { if (!adj[w].size || (isArm0[w] && it >= (spec.smoothArm ?? 3))) continue; const i = first[w], m = [0, 0, 0], nb = rim[w] ? [...adj[w]].filter((o) => rim[o]) : [...adj[w]]; if (!nb.length) continue; for (const o of nb) for (let k = 0; k < 3; k++) m[k] += pos[o * 3 + k] / nb.length;
      let e = ((m[0] - pos[w * 3]) * Nn[i * 3] + (m[1] - pos[w * 3 + 1]) * Nn[i * 3 + 1] + (m[2] - pos[w * 3 + 2]) * Nn[i * 3 + 2]) * 0.5;
      const off = (pos[w * 3] - P0[i * 3]) * Nn[i * 3] + (pos[w * 3 + 1] - P0[i * 3 + 1]) * Nn[i * 3 + 1] + (pos[w * 3 + 2] - P0[i * 3 + 2]) * Nn[i * 3 + 2], tmin = Math.max(need[w] * 0.8 - (isArm0[w] ? 0 : spec.flatten ?? 0), needIn[w], keepOff[w]);
      if (off + e < tmin) e = tmin - off; mv[w] = e; }
    for (let i = 0; i < nv; i++) { const e = mv[wOfI[i]]; if (e) for (let k = 0; k < 3; k++) Pp[i * 3 + k] += Nn[i * 3 + k] * e; } }
  letDown(); // (again after the smoothing, which holds the cloth off a strong deltoid)
  // (drape: the torso's points moved out toward their neighbours' middle where the surface dips in (never in), the edges
  // held: the cloth spans the small of the back and under the chest instead of following every hollow)
  const isArm = new Uint8Array(nW); for (let i = 0; i < nv; i++) if (C[i] === 1 || C[i] === 2) isArm[wOfI[i]] = 1;
  for (let it = 0; it < (spec.drape ?? 0); it++) { const pos = new Float32Array(nW * 3); for (let i = 0; i < nv; i++) for (let k = 0; k < 3; k++) pos[wOfI[i] * 3 + k] = Pp[i * 3 + k];
    const mv = new Float32Array(nW);
    for (let w = 0; w < nW; w++) { if (rim[w] || isArm[w] || !adj[w].size) continue; const i = first[w], m = [0, 0, 0]; for (const o of adj[w]) for (let k = 0; k < 3; k++) m[k] += pos[o * 3 + k] / adj[w].size;
      const e = (m[0] - pos[w * 3]) * Nn[i * 3] + (m[1] - pos[w * 3 + 1]) * Nn[i * 3 + 1] + (m[2] - pos[w * 3 + 2]) * Nn[i * 3 + 2]; if (e > 0) mv[w] = e * 0.6; }
    for (let i = 0; i < nv; i++) { const e = mv[wOfI[i]]; if (e) for (let k = 0; k < 3; k++) Pp[i * 3 + k] += Nn[i * 3 + k] * e; } }
  // (and once more on the finished surface: whatever the hang and smoothing left standing over the chest is bridged)
  chestPass(false, 'final');
  // (relief added after the smoothing: a puffer's channels)
  if (spec.relief) for (let i = 0; i < nv; i++) { const d0 = spec.relief([P0[i * 3], P0[i * 3 + 1], P0[i * 3 + 2]], C[i], F[i]); if (d0) for (let k = 0; k < 3; k++) Pp[i * 3 + k] += Nn[i * 3 + k] * d0; }
  // (forge v2.4, HD: the hem band. Where the field's hem line crossed the body's triangles the cloth's lowest few
  // centimetres came out ragged (each cut point lifted, hung and smoothed on its own) and, below the crotch's top, notched
  // between the legs. Now a top's last spec.hemBand.h is cut away and re-made as a band of even rings round the body's
  // axis: its top just outside the cloth above it (a seam), each ring falling straight from there (less a small taper)
  // but never in closer than the body and whatever is worn under it at that height (their convex hull: the legs bridged,
  // no notch), its bottom one straight line at the hem's height, turned up inside by 1.6 cm. Skinned as the cloth above
  // it, smoothed round the body, so it moves as one piece)
  // (C5, spec.stiff { iters, only(cls) }: a stiff cloth's weights spread over its neighbours (a tailored jacket's front
  // moves as one panel, not each point with the bone under it: the belly and hips under a heavy man's jacket no longer
  // fold its front into the shirt and trousers under it))
  if (spec.stiff) { const nWt = nW, dense = Array.from({ length: nWt }, () => new Map());
    for (let w = 0; w < nWt; w++) { const i = first[w]; for (let k = 0; k < 4; k++) if (WT[i * 4 + k] > 0) dense[w].set(JI[i * 4 + k], (dense[w].get(JI[i * 4 + k]) || 0) + WT[i * 4 + k]); }
    const can = (w) => spec.stiff.only ? spec.stiff.only(C[first[w]], [Pp[first[w] * 3], Pp[first[w] * 3 + 1], Pp[first[w] * 3 + 2]]) : true;
    let cur = dense; for (let it = 0; it < (spec.stiff.iters ?? 10); it++) { const nx = cur.map((m) => m); for (let w = 0; w < nWt; w++) { if (!can(w) || !adj[w].size) continue; const m = new Map(); for (const [j, x] of cur[w]) m.set(j, x * 0.5);
        const f = 0.5 / adj[w].size; for (const o of adj[w]) for (const [j, x] of cur[o]) m.set(j, (m.get(j) || 0) + x * f); nx[w] = m; } cur = nx; }
    for (let i = 0; i < nv; i++) { const w = wOfI[i]; if (!can(w)) continue; const e = [...cur[w].entries()].sort((a, b) => b[1] - a[1]).slice(0, 4), sum = e.reduce((a, x) => a + x[1], 0) || 1; while (e.length < 4) e.push([0, 0]);
      e.forEach(([j, x], k) => { JI[i * 4 + k] = j; WT[i * 4 + k] = x / sum; }); } }
  let band = null, idxOut = idx;
  if (spec.hemBand && !globalThis.process?.env?.FORGE_NO_BAND) { const HB = spec.hemBand, y0 = HB.y, cutY = y0 + HB.h - 0.008, NR = 120, torso = (i) => C[i] === 0 || C[i] === 3;
    const ref = []; let czS = 0; for (let i = 0; i < nv; i++) { if (!torso(i)) continue; const y = P0[i * 3 + 1]; if (y < cutY - 0.022 || y > cutY + 0.03) continue; ref.push(i); czS += Pp[i * 3 + 2]; }
    if (ref.length > 60) { const cz = czS / ref.length, bin = (x, z) => (((Math.floor(((Math.atan2(x, z - cz) + Math.PI) / (2 * Math.PI)) * NR) % NR) + NR) % NR);
      // (the cloth's outline just above the band: its outermost point by angle; and its weights there, by angle)
      const Rt = new Float32Array(NR), Wb = Array.from({ length: NR }, () => new Map());
      for (const i of ref) { const b = bin(Pp[i * 3], Pp[i * 3 + 2]), r = Math.hypot(Pp[i * 3], Pp[i * 3 + 2] - cz); Rt[b] = Math.max(Rt[b], r); for (let k = 0; k < 4; k++) { const j = JI[i * 4 + k], w = WT[i * 4 + k]; if (w > 0) Wb[b].set(j, (Wb[b].get(j) || 0) + w); } }
      for (let it = 0; it < NR; it++) { let holes = 0; for (let b = 0; b < NR; b++) { if (Rt[b]) continue; holes++; const l = Rt[(b + NR - 1) % NR], r = Rt[(b + 1) % NR]; if (l || r) { Rt[b] = l && r ? (l + r) / 2 : l || r; if (!Wb[b].size) Wb[b] = new Map(Wb[(b + (l ? NR - 1 : 1)) % NR]); } } if (!holes) break; }
      const ring = (R, n, keepMax) => { for (let it = 0; it < n; it++) { const c0 = Float32Array.from(R); for (let b = 0; b < NR; b++) { const m = (c0[(b + NR - 1) % NR] + 2 * c0[b] + c0[(b + 1) % NR]) / 4; R[b] = keepMax ? Math.max(c0[b], m) : m; } } };
      ring(Rt, 3, true); ring(Rt, 2, false);
      // (the weights by angle: each bin's mean, spread over 5 bins either side, so the band bends as one piece)
      const Wn = Wb.map((m, b) => { const acc = new Map(); for (let d = -5; d <= 5; d++) { const mm = Wb[(b + d + NR) % NR], s = [...mm.values()].reduce((a, x) => a + x, 0) || 1; for (const [j, w] of mm) acc.set(j, (acc.get(j) || 0) + w / s); }
        const e = [...acc.entries()].sort((a, x) => x[1] - a[1]).slice(0, 4), s = e.reduce((a, x) => a + x[1], 0) || 1; while (e.length < 4) e.push([0, 0]); return e.map(([j, w]) => [j, w / s]); });
      // (what the band must clear at a height: the body's torso and legs and the layers under it, their hull round the axis)
      const pts = []; for (let v = 0; v < ctx.nBody; v++) if ((cls[v] === 0 || cls[v] === 3) && bPos[v * 3 + 1] > y0 - 0.03 && bPos[v * 3 + 1] < cutY + 0.03) pts.push([bPos[v * 3], bPos[v * 3 + 1], bPos[v * 3 + 2]]);
      for (const q of ctx.inner || []) if (q[1] > y0 - 0.03 && q[1] < cutY + 0.03 && Math.hypot(q[0], q[2] - cz) < 0.4) pts.push(q);
      const room = HB.room ?? 0.009, taper = HB.taper ?? 0.05, yTop = cutY + 0.008, NY = Math.max(3, Math.ceil((yTop - y0) / 0.006)), rows = [];
      for (let k = 0; k <= NY; k++) { const y = yTop - ((yTop - y0) * k) / NY, h = hullRadii(pts.filter((p) => Math.abs(p[1] - y) < 0.012).map((p) => [p[0], p[2]]), 0, cz, NR), R = new Float32Array(NR);
        for (let b = 0; b < NR; b++) R[b] = Math.max(Rt[b] + 0.0015 - taper * (yTop - y), (h ? h[b] : 0) + room);
        if (k) for (let b = 0; b < NR; b++) R[b] = Math.max(R[b], rows[k - 1].R[b] - 0.0025); // (never steps in)
        ring(R, 2, true); rows.push({ y, R, f: y - y0 }); }
      // (the turn-up inside: the hem's edge rounded in, then the facing 1.6 cm up)
      const last = rows[rows.length - 1]; rows.push({ y: y0 + 0.0025, R: last.R.map((r) => r - 0.0045), f: 0.0005 }, { y: y0 + 0.016, R: last.R.map((r) => r - 0.006), f: 0.0005 });
      const BP = [], BUV = [], BJ = [], BW = [], BF = [], BI2 = [];
      rows.forEach((row, k) => { for (let j = 0; j <= NR; j++) { const b = j % NR, a = -Math.PI + ((b + 0.5) / NR) * 2 * Math.PI, p = [Math.sin(a) * row.R[b], row.y, cz + Math.cos(a) * row.R[b]]; BP.push(...p); BUV.push(j / NR, k / (rows.length - 1)); BF.push(row.f);
        // (down the band its weights ease toward the body's right under it (a thigh's, by the hem), so a leg raised in a
        // stride or a seat carries the hem with it instead of coming out through it)
        const tb = (HB.follow ?? 0) * sm(yTop, y0, Math.max(y0, row.y)), q = tb > 0 ? nearestBody(ctx, p) : -1, m = new Map(); for (const [jj, w] of Wn[b]) m.set(jj, (m.get(jj) || 0) + w * (q >= 0 ? 1 - tb : 1));
        if (q >= 0) for (let kk = 0; kk < 4; kk++) { const w = ctx.sw[q * 4 + kk] / 255; if (w > 0) m.set(ctx.si[q * 4 + kk], (m.get(ctx.si[q * 4 + kk]) || 0) + w * tb); }
        const e = [...m.entries()].sort((x, y) => y[1] - x[1]).slice(0, 4), s0 = e.reduce((x, y) => x + y[1], 0) || 1; while (e.length < 4) e.push([0, 0]); for (const [jj, w] of e) { BJ.push(jj); BW.push(w / s0); } } });
      const RW = NR + 1; for (let k = 0; k + 1 < rows.length; k++) for (let j = 0; j < NR; j++) { const a = k * RW + j, b2 = a + RW; BI2.push(a, b2, a + 1, a + 1, b2, b2 + 1); }
      band = { P: Float32Array.from(BP), UV: Float32Array.from(BUV), JI: Int32Array.from(BJ), WT: Float32Array.from(BW), F: Float32Array.from(BF), C: new Uint8Array(BF.length), AO: new Float32Array(BF.length), idx: Uint32Array.from(BI2), nv: BF.length, cz, y0, yTop };
      // (the cloth under the band cut away: a triangle of the torso or legs wholly under the cut)
      const keep = []; let cut = 0; for (let q = 0; q < idx.length; q += 3) { const t = [idx[q], idx[q + 1], idx[q + 2]]; if (t.every((i) => torso(i) && P0[i * 3 + 1] < cutY)) { cut++; continue; } keep.push(...t); }
      idxOut = keep; ctx.log?.(`${spec.id}: hem band ${rows.length} rings x ${NR} at ${y0.toFixed(3)}-${yTop.toFixed(3)}, ${cut} ragged triangles cut`); } }
  // (concavity per point, for the painted fold shade: how far the neighbours' middle stands out from it)
  const AO = new Float32Array(nv); { const pos = new Float32Array(nW * 3); for (let i = 0; i < nv; i++) for (let k = 0; k < 3; k++) pos[wOfI[i] * 3 + k] = Pp[i * 3 + k];
    for (let i = 0; i < nv; i++) { const w = wOfI[i]; if (!adj[w].size) continue; const m = [0, 0, 0]; for (const o of adj[w]) for (let k = 0; k < 3; k++) m[k] += pos[o * 3 + k] / adj[w].size;
      AO[i] = clamp(((m[0] - pos[w * 3]) * Nn[i * 3] + (m[1] - pos[w * 3 + 1]) * Nn[i * 3 + 1] + (m[2] - pos[w * 3 + 2]) * Nn[i * 3 + 2]) / 0.004, -1, 1); } }
  const out = { id: spec.id, P0, P: Pp, N: Nn, UV: Float32Array.from(UV), JI: Int32Array.from(JI), WT: Float32Array.from(WT), F: Float32Array.from(F), C: Uint8Array.from(C), AO, idx: Uint32Array.from(idxOut), hide, nv, rimW: rim, wOfI, band };
  ctx.log?.(`${spec.id}: shell ${nv} points ${idx.length / 3} tris, hides ${hide.size} body tris`);
  if (spec.skirt) out.skirt = skirt(ctx, out, spec);
  return out;
}
// a coat's skirt: from the shell's hem loop (the points the hem line made, in order round the body) down `len`, each
// ring round the convex hull of the legs (and whatever is on them) at its height plus the cloth's room, flaring out;
// its points' weights eased from the hem's (the hips) to the thighs (each side by its x)
function skirt(ctx, sh, spec) {
  const { bPos, nBody, cls, BI } = ctx, S = spec.skirt, top = S.top;
  // (the hem loop: the points the hem line cut, on the torso or legs, before the lift off the body at y = top)
  const hem = []; for (let i = 0; i < sh.nv; i++) if (sh.F[i] === 0 && (sh.C[i] === 0 || sh.C[i] === 3) && Math.abs(sh.P0[i * 3 + 1] - top) < 2e-4) hem.push(i);
  const cx = 0, cz = (() => { let z = 0; for (const i of hem) z += sh.P[i * 3 + 2]; return hem.length ? z / hem.length : 0; })();
  const ang = (i) => Math.atan2(sh.P[i * 3] - cx, sh.P[i * 3 + 2] - cz);
  const uniq = []; { const seen = new Set(); for (const i of hem.sort((a, b) => ang(a) - ang(b))) { const k = Math.round(sh.P[i * 3] * 2e3) + ',' + Math.round(sh.P[i * 3 + 2] * 2e3); if (seen.has(k)) continue; seen.add(k); uniq.push(i); } }
  if (uniq.length < 12) { ctx.log?.(`${spec.id}: skirt skipped (hem loop ${uniq.length})`); return null; }
  const rHem = (a) => { // (the hem's radius at angle a: between its two loop points either side)
    let k = uniq.findIndex((i) => ang(i) > a); if (k < 0) k = 0; const i1 = uniq[k], i0 = uniq[(k + uniq.length - 1) % uniq.length], a0 = ang(i0), a1 = ang(i1) + (ang(i1) < a0 ? 2 * Math.PI : 0), aa = a + (a < a0 ? 2 * Math.PI : 0), t = a1 > a0 ? clamp((aa - a0) / (a1 - a0), 0, 1) : 0;
    const r = (i) => Math.hypot(sh.P[i * 3] - cx, sh.P[i * 3 + 2] - cz); return { r: r(i0) * (1 - t) + r(i1) * t, i: t < 0.5 ? i0 : i1 }; };
  // (the ring's own angles: evenly round, NR of them, each from the hem loop by angle)
  const NR = S.n ?? 72, rings = S.rings ?? 18, len = S.len, flare = S.flare ?? 0.12, room = S.room ?? 0.03;
  const r0 = (a) => { let best = null; for (let k = 0; k < uniq.length; k++) { const i = uniq[k], d = Math.abs(((ang(i) - a + 3 * Math.PI) % (2 * Math.PI)) - Math.PI); if (!best || d < best.d) best = { d, i }; } return best.i; };
  // (the legs' (and inner layers') hull at a height: the cross-section's points, convex hull's radius by angle)
  const pts = []; for (let v = 0; v < nBody; v++) if (cls[v] === 3 || cls[v] === 0) pts.push([bPos[v * 3], bPos[v * 3 + 1], bPos[v * 3 + 2]]); for (const q of ctx.inner || []) pts.push(q);
  const hullCache = new Map(), hullR = (y, a) => { const key = Math.round(y * 200); if (!hullCache.has(key)) hullCache.set(key, hullRadii(pts.filter((p) => Math.abs(p[1] - y) < 0.012).map((p) => [p[0], p[2]]), cx, cz, 96));
    const h = hullCache.get(key); if (!h) return 0; const f = ((a + Math.PI) / (2 * Math.PI)) * 96 - 0.5, k0 = Math.floor(f), t = f - k0; return h[((k0 % 96) + 96) % 96] * (1 - t) + h[(((k0 + 1) % 96) + 96) % 96] * t; };
  const P = [], UV = [], JI = [], WT = [], idx = [], legL = BI('upperleg01.L'), legR = BI('upperleg01.R'), rootI = BI('root');
  const ringPts = [], prevR = new Float32Array(NR);
  for (let k = 0; k <= rings; k++) { const t = k / rings, y = top - len * t, row = [];
    for (let j = 0; j < NR; j++) { const a = -Math.PI + (2 * Math.PI * j) / NR, h = rHem(a), src = h.i, rTop = h.r;
      // (ring 0 tucked 2 cm up inside the coat's hem, ring 1 just outside it: the two overlap, no seam to stitch)
      const yy = k === 0 ? top + 0.008 : y, need = hullR(Math.min(y, top - 0.01), a) + room * (0.4 + 0.6 * t), r = k === 0 ? rTop - 0.004 : k === 1 ? rTop + 0.0008 : Math.min(prevR[j] + 0.006, Math.max(prevR[j] + rTop * flare / rings, need + 0.006)),
        pp = [cx + Math.sin(a) * r, yy, cz + Math.cos(a) * r];
      prevR[j] = k === 0 ? rTop : r; row.push(P.length / 3); P.push(...pp); UV.push(j / NR, t);
      const wm = new Map(); for (let q = 0; q < 4; q++) { const w = sh.WT[src * 4 + q]; if (w > 0) wm.set(sh.JI[src * 4 + q], (wm.get(sh.JI[src * 4 + q]) || 0) + w * (1 - 0.8 * sm(0, 1, t))); }
      // (each side of the skirt follows its own thigh (a coat's front panels part as the legs move), the middle the hips)
      const sL = sm(-0.05, 0.05, pp[0] - cx), e = 0.9 * sm(0, 0.6, t);
      wm.set(legL, (wm.get(legL) || 0) + e * 0.75 * sL); wm.set(legR, (wm.get(legR) || 0) + e * 0.75 * (1 - sL)); wm.set(rootI, (wm.get(rootI) || 0) + e * 0.25);
      const ent = [...wm.entries()].filter(([, w]) => w > 0).sort((a, b) => b[1] - a[1]).slice(0, 4), s = ent.reduce((a, x) => a + x[1], 0) || 1; while (ent.length < 4) ent.push([0, 0]); for (const [j2, w] of ent) { JI.push(j2); WT.push(w / s); } }
    // (each ring's radius smoothed round, so a hull's corner never makes a crease)
    if (k > 1) for (let it = 0; it < 2; it++) { const rr = row.map((i) => Math.hypot(P[i * 3] - cx, P[i * 3 + 2] - cz)), sm2 = rr.map((r, j) => Math.max(r, (rr[(j + NR - 1) % NR] + 2 * r + rr[(j + 1) % NR]) / 4));
      row.forEach((i, j) => { const a = Math.atan2(P[i * 3] - cx, P[i * 3 + 2] - cz); P[i * 3] = cx + Math.sin(a) * sm2[j]; P[i * 3 + 2] = cz + Math.cos(a) * sm2[j]; prevR[j] = sm2[j]; }); }
    ringPts.push(row); }
  for (let k = 0; k < rings; k++) for (let j = 0; j < NR; j++) { const a = ringPts[k][j], b = ringPts[k][(j + 1) % NR], c = ringPts[k + 1][j], d = ringPts[k + 1][(j + 1) % NR]; idx.push(a, c, b, b, c, d); }
  // (the seam at the back: u from 0 to 1 needs its own column; the last column's quads use u = 1)
  ctx.log?.(`${spec.id}: skirt ${rings} rings x ${NR}, hem loop ${uniq.length} points`);
  return { P: Float32Array.from(P), UV: Float32Array.from(UV), JI: Int32Array.from(JI), WT: Float32Array.from(WT), idx: Uint32Array.from(idx), NR, rings, cz };
}

/* ------------------------------------------------------------------- collar -- */
// the nearest point of the body (not the head, hands or feet) to p: a 3 cm grid, built once per body
export function nearestBody(ctx, p) {
  if (!ctx._nb) { const cell = 0.03, G = new Map(); for (let v = 0; v < ctx.nBody; v++) { if (ctx.cls[v] === 5 || ctx.cls[v] === 2 || ctx.cls[v] === 4) continue; const k = Math.floor(ctx.bPos[v * 3] / cell) + ',' + Math.floor(ctx.bPos[v * 3 + 1] / cell) + ',' + Math.floor(ctx.bPos[v * 3 + 2] / cell); (G.get(k) || G.set(k, []).get(k)).push(v); } ctx._nb = { G, cell }; }
  const { G, cell } = ctx._nb, c = p.map((x) => Math.floor(x / cell)); let best = -1, bd = 1e9;
  for (let r = 1; r <= 3 && best < 0; r++) for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) for (let k = -r; k <= r; k++) for (const v of G.get((c[0] + i) + ',' + (c[1] + j) + ',' + (c[2] + k)) || []) { const d = (ctx.bPos[v * 3] - p[0]) ** 2 + (ctx.bPos[v * 3 + 1] - p[1]) ** 2 + (ctx.bPos[v * 3 + 2] - p[2]) ** 2; if (d < bd) { bd = d; best = v; } }
  return best;
}
// (HD) what the library has dressed this body in so far, by piece (each garment's second pass replaces its first), so a
// piece laid over another (a scarf) can be skinned as the cloth right under it moves, not as some bone near it
function worn(ctx, id, m) { (ctx._worn || (ctx._worn = {}))[id] = m; return m; }
function wornNearest(ctx, p, maxD = 0.03, only = null) { let best = null, bd = maxD * maxD;
  for (const [id, m] of Object.entries(ctx._worn || {})) if (!only || id === only) for (let i = 0; i < m.P.length / 3; i++) { const d = (m.P[i * 3] - p[0]) ** 2 + (m.P[i * 3 + 1] - p[1]) ** 2 + (m.P[i * 3 + 2] - p[2]) ** 2; if (d < bd) { bd = d; best = [0, 1, 2, 3].map((k) => [m.JI[i * 4 + k], m.WT[i * 4 + k]]); } }
  return best; }
// (HD) the nearest skin point round the neck and shoulders, the neck's own points under the jaw included (nearestBody
// leaves out the head's, and the neck's upper half is the head's): a collar or a scarf skinned from it turns and bends
// with the neck as the skin inside it does, instead of standing still while the neck moves through it
export function nearestNeck(ctx, p) {
  if (!ctx._nn) { const cell = 0.03, G = new Map(), yMax = ctx.EY - 0.095; for (let v = 0; v < ctx.nBody; v++) { const c = ctx.cls[v]; if (c === 2 || c === 4 || c === 3 || ctx.bPos[v * 3 + 1] > yMax) continue; const k = Math.floor(ctx.bPos[v * 3] / cell) + ',' + Math.floor(ctx.bPos[v * 3 + 1] / cell) + ',' + Math.floor(ctx.bPos[v * 3 + 2] / cell); (G.get(k) || G.set(k, []).get(k)).push(v); } ctx._nn = { G, cell }; }
  const { G, cell } = ctx._nn, c = p.map((x) => Math.floor(x / cell)); let best = -1, bd = 1e9;
  for (let r = 1; r <= 3 && best < 0; r++) for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) for (let k = -r; k <= r; k++) for (const v of G.get((c[0] + i) + ',' + (c[1] + j) + ',' + (c[2] + k)) || []) { const d = (ctx.bPos[v * 3] - p[0]) ** 2 + (ctx.bPos[v * 3 + 1] - p[1]) ** 2 + (ctx.bPos[v * 3 + 2] - p[2]) ** 2; if (d < bd) { bd = d; best = v; } }
  return best;
}
// a band round the neck from its base: stand (straight up, h tall, a little in at the top) or turn (up, then folded down
// and out over itself: a coat's collar). Weights: the neck's base and the upper spine, as the hood's
export function collar(ctx, o) {
  const { bPos, nBody, cls, BI } = ctx, cy = o.y, h = o.h ?? 0.04, gap = o.gap ?? 0.012, NB = 64;
  const nz = ctx.jpos('neck01')[2], rN = new Float32Array(NB);
  for (let v = 0; v < nBody; v++) { const y = bPos[v * 3 + 1]; if (y < cy || y > cy + h + 0.02 || cls[v] === 5 || cls[v] === 1) continue; const x = bPos[v * 3], z = bPos[v * 3 + 2] - nz, r = Math.hypot(x, z); if (r > 0.085) continue; const b = ((Math.floor(((Math.atan2(x, z) + Math.PI) / (2 * Math.PI)) * NB) % NB) + NB) % NB; rN[b] = Math.max(rN[b], r); }
  for (let i = 0; i < NB; i++) rN[i] = rN[i] ? Math.min(rN[i], 0.074) : 0.06; for (let it = 0; it < 2; it++) { const c = Float32Array.from(rN); for (let i = 0; i < NB; i++) rN[i] = Math.max(c[i], (c[(i + NB - 1) % NB] + c[(i + 1) % NB]) / 2); }
  const rAt = (a) => { const u = ((a + Math.PI) / (2 * Math.PI)) * NB - 0.5, i0 = ((Math.floor(u) % NB) + NB) % NB, f = u - Math.floor(u); return rN[i0] * (1 - f) + rN[(i0 + 1) % NB] * f; };
  const P = [], UV = [], JI = [], WT = [], idx = [], NA = 72, prof = o.style === 'turn' ? [[0, 0], [0.5, 0.004], [0.85, 0.006], [1, 0.012], [0.72, 0.024], [0.3, 0.034], [0.05, 0.04]] : [[0, 0], [0.5, 0.0015], [1, -0.002]];
  const open = o.open ?? 0, nk = BI('neck01'), sp = BI('spine05') >= 0 ? BI('spine05') : BI('spine04'), cl = [BI('clavicle.L'), BI('clavicle.R')];
  // (o.frontGap: the band open at the front instead (a jacket's collar runs round the back into its lapels))
  for (let i = 0; i <= NA; i++) { const a = o.frontGap ? o.frontGap + ((2 * Math.PI - 2 * o.frontGap) * i) / NA : -Math.PI + open + ((2 * Math.PI - 2 * open) * i) / NA, r0 = rAt(a) + gap, front = 0.5 + 0.5 * Math.cos(a), yb = cy - (o.dropFront ?? 0) * front * front;
    for (let k = 0; k < prof.length; k++) { const [u, out] = prof[k], hh = h * (1 - (o.lowFront ?? 0) * front), y = yb + u * hh, r = r0 + out;
      P.push(Math.sin(a) * r, y, nz + Math.cos(a) * r); UV.push(i / NA, k / (prof.length - 1));
      // (its weights: the nearest neck / shoulder point's (not the head's), so it turns with the neck as the skin does)
      const q = (o.follow ? nearestNeck : nearestBody)(ctx, [Math.sin(a) * r, y, nz + Math.cos(a) * r]); if (q >= 0) { const e = [0, 1, 2, 3].map((k) => [ctx.si[q * 4 + k], ctx.sw[q * 4 + k] / 255]); for (const [j, w] of e) { JI.push(j); WT.push(w); } }
      else { const side = a > 0 ? 0 : 1, wc = 0.25 * (1 - Math.abs(Math.cos(a))); JI.push(sp, nk, cl[side], 0); WT.push(0.62 - wc, 0.38, wc, 0); } } }
  const R = prof.length; for (let i = 0; i < NA; i++) for (let k = 0; k < R - 1; k++) { const a = i * R + k, b = a + R; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  // (NK: every triangle wound to face out from the neck: a turned collar's fold faced in, so its outside was a back face)
  for (let q = 0; q < idx.length; q += 3) { const [a, b, c] = [idx[q], idx[q + 1], idx[q + 2]], u = [0, 1, 2].map((k) => P[b * 3 + k] - P[a * 3 + k]), w = [0, 1, 2].map((k) => P[c * 3 + k] - P[a * 3 + k]);
    const nx = u[1] * w[2] - u[2] * w[1], nzz = u[0] * w[1] - u[1] * w[0], cx = (P[a * 3] + P[b * 3] + P[c * 3]) / 3, cz = (P[a * 3 + 2] + P[b * 3 + 2] + P[c * 3 + 2]) / 3 - nz;
    if (nx * cx + nzz * cz < 0) { idx[q + 1] = c; idx[q + 2] = b; } }
  return { P: Float32Array.from(P), UV: Float32Array.from(UV), JI: Int32Array.from(JI), WT: Float32Array.from(WT), idx: Uint32Array.from(idx) };
}
// buttons: small domes on a shell at given points (x, y on the front; the shell's frontmost surface there), each skinned
// as the shell point nearest it
export function buttons(sh, spots, o = {}) {
  const P = [], UV = [], JI = [], WT = [], idx = [], R = o.r ?? 0.008, H = o.h ?? 0.0035, SEG = 14;
  for (const [x, y] of spots) { let best = -1, bd = 1e9; for (let i = 0; i < sh.nv; i++) { if (sh.N[i * 3 + 2] < 0.3) continue; const d = (sh.P[i * 3] - x) ** 2 + (sh.P[i * 3 + 1] - y) ** 2; if (d < bd) { bd = d; best = i; } } if (best < 0) continue;
    const c = [sh.P[best * 3], sh.P[best * 3 + 1], sh.P[best * 3 + 2]], n = [sh.N[best * 3], sh.N[best * 3 + 1], sh.N[best * 3 + 2]], t1 = [1, 0, 0], t2 = [n[1] * t1[2] - n[2] * t1[1], n[2] * t1[0] - n[0] * t1[2], n[0] * t1[1] - n[1] * t1[0]];
    const base = P.length / 3, ji = Array.from(sh.JI.slice(best * 4, best * 4 + 4)), wt = Array.from(sh.WT.slice(best * 4, best * 4 + 4));
    const at = (r, h) => (a) => [0, 1, 2].map((k) => c[k] + n[k] * (0.0012 + h) + (t1[k] * Math.cos(a) + t2[k] * Math.sin(a)) * r);
    const rings = [[R, 0], [R * 0.98, H * 0.55], [R * 0.75, H * 0.95], [R * 0.35, H]];
    for (const [r, h] of rings) for (let s = 0; s < SEG; s++) { P.push(...at(r, h)((s / SEG) * 2 * Math.PI)); UV.push(s / SEG, h / H); JI.push(...ji); WT.push(...wt); }
    const top = P.length / 3; P.push(...c.map((x, k) => x + n[k] * (0.0012 + H))); UV.push(0.5, 1); JI.push(...ji); WT.push(...wt);
    for (let r = 0; r < rings.length - 1; r++) for (let s = 0; s < SEG; s++) { const a = base + r * SEG + s, b = base + r * SEG + ((s + 1) % SEG), cc = a + SEG, d = b + SEG; idx.push(a, b, cc, b, d, cc); }
    for (let s = 0; s < SEG; s++) idx.push(base + 3 * SEG + s, base + 3 * SEG + ((s + 1) % SEG), top); }
  return { P: Float32Array.from(P), UV: Float32Array.from(UV), JI: Int32Array.from(JI), WT: Float32Array.from(WT), idx: Uint32Array.from(idx) };
}

/* ------------------------------------------------------------------- paint -- */
// a garment's texture: its triangles rasterised in uv space (S px), each pixel's colour from paint(p, n, f, cls, ao)
// at the 3D point under it; the rest of the image its base colour (so mip levels don't bleed another colour in)
export function rasterPaint(mesh, S, base, paint) {
  const img = new Uint8Array(S * S * 3); for (let i = 0; i < S * S; i++) { img[i * 3] = base[0]; img[i * 3 + 1] = base[1]; img[i * 3 + 2] = base[2]; }
  const { P, N, UV, idx } = mesh, F = mesh.F, C = mesh.C, AO = mesh.AO;
  for (let q = 0; q < idx.length; q += 3) { const v = [idx[q], idx[q + 1], idx[q + 2]], U = v.map((i) => [UV[i * 2] * S, UV[i * 2 + 1] * S]);
    const x0 = Math.max(0, Math.floor(Math.min(...U.map((u) => u[0])) - 1)), x1 = Math.min(S - 1, Math.ceil(Math.max(...U.map((u) => u[0])) + 1)), y0 = Math.max(0, Math.floor(Math.min(...U.map((u) => u[1])) - 1)), y1 = Math.min(S - 1, Math.ceil(Math.max(...U.map((u) => u[1])) + 1));
    const det = (U[1][1] - U[2][1]) * (U[0][0] - U[2][0]) + (U[2][0] - U[1][0]) * (U[0][1] - U[2][1]); if (Math.abs(det) < 1e-9 || x1 - x0 > S / 2) continue;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const px = x + 0.5, py = y + 0.5;
      const l1 = ((U[1][1] - U[2][1]) * (px - U[2][0]) + (U[2][0] - U[1][0]) * (py - U[2][1])) / det, l2 = ((U[2][1] - U[0][1]) * (px - U[2][0]) + (U[0][0] - U[2][0]) * (py - U[2][1])) / det, l3 = 1 - l1 - l2;
      if (l1 < -0.08 || l2 < -0.08 || l3 < -0.08) continue; const L = [l1, l2, l3];
      const at = (A, w) => [0, 1, 2].slice(0, w).map((k) => L[0] * A[v[0] * w + k] + L[1] * A[v[1] * w + k] + L[2] * A[v[2] * w + k]);
      const p = at(P, 3), n = at(N, 3), f = F ? L[0] * F[v[0]] + L[1] * F[v[1]] + L[2] * F[v[2]] : 1, ao = AO ? L[0] * AO[v[0]] + L[1] * AO[v[1]] + L[2] * AO[v[2]] : 0;
      const c = paint(p, n, f, C ? C[v[0]] : 0, ao, [L[0] * UV[v[0] * 2] + L[1] * UV[v[1] * 2] + L[2] * UV[v[2] * 2], L[0] * UV[v[0] * 2 + 1] + L[1] * UV[v[1] * 2 + 1] + L[2] * UV[v[2] * 2 + 1]]), i = (y * S + x) * 3;
      img[i] = clamp(Math.round(c[0]), 0, 255); img[i + 1] = clamp(Math.round(c[1]), 0, 255); img[i + 2] = clamp(Math.round(c[2]), 0, 255); } }
  return img;
}
// the cloths: a base colour (sRGB 0..255) shaded in linear light by a weave and the fold shade
export const CLOTH = {
  wool: (p) => 0.93 + 0.07 * fbm(p, 0.012) + 0.025 * Math.sin((p[1] * 0.7 + (p[0] + p[2]) * 0.7) / 0.0026 * Math.PI),
  cotton: (p) => 0.95 + 0.05 * fbm(p, 0.02),
  fleece: (p) => 0.9 + 0.1 * fbm(p, 0.006),
  // (MV: a ripstop's grid, 5 mm, faint, and the down's unevenness: nylon, not a moulded plastic shell)
  nylon: (p) => (0.95 + 0.05 * fbm(p, 0.03)) * (Math.abs(((p[1] + 0.3 * p[0]) / 0.005) % 1 - 0.5) > 0.44 || Math.abs(((p[0] + p[2] - 0.3 * p[1]) / 0.005) % 1 - 0.5) > 0.44 ? 0.965 : 1),
  twill: (p) => 0.92 + 0.06 * fbm(p, 0.015) + 0.03 * Math.sin((p[1] + 0.6 * (p[0] + p[2])) / 0.003 * Math.PI),
};
/* ------------------------------------------------------------- C5: surface -- */
// Cloth surface (C5): every made garment's relief as a height in -1..1 at a point of its surface (bind space), turned
// into a normal map in the part's own uv space (core.mjs, as the shoes' bump), and the same relief laid into its colour
// a little (a fold's shadow side darker), so a garment reads as cloth next to Mr. Big's suit instead of moulded plastic:
//   weave   the cloth's own grain: a wool's fine twill (2.2 mm), a uniform's or trousers' twill (2.8 mm, steeper), a
//           cotton's plain weave (1.6 mm), a fleece's pilled nap, a nylon's ripstop, a knit's ribs
//   seams   sunk lines with a stitch row beside them: the torso's side seams, the shoulder seams, the armholes, the
//           sleeves' undersides; a trouser leg's outside seam and inseam
//   folds   soft creases where a body bends under cloth: rings round the inside of the elbow, across the waist and the
//           small of the back, behind and over the knee; each fold's phase broken by a slow noise so no two are alike
// FABRIC: the cloth of each garment; FABRIC_ROUGH: its roughness (no plastic sheen: a dull dielectric, and the
// specular itself turned down in core.mjs)
export const FABRIC = { 'suit-jacket': 'wool', 'suit-jacket-db': 'wool', overcoat: 'wool', 'doorman-coat': 'wool', 'uniform-jacket': 'twill', 'chef-jacket': 'cotton', hoodie: 'fleece', 'hood-up': 'fleece', 'puffer-coat': 'nylon', 'loose-trousers': 'twill', scarf: 'knit' };
export const FABRIC_ROUGH = { wool: 0.9, twill: 0.88, cotton: 0.9, fleece: 0.95, nylon: 0.66, knit: 0.96, denim: 0.92, jersey: 0.93 };
export function fabricHeight(ctx, cloth, p, n, c, part = '') {
  const tw = (period, steep) => { const t = ((p[1] + steep * (p[0] + p[2])) / period) % 1; return Math.abs(((t + 1) % 1) - 0.5) * 4 - 1; };
  let w = 0;
  if (cloth === 'wool') w = 0.35 * tw(0.0022, 0.9) + 0.25 * (fbm(p, 0.003) - 0.5) * 2;
  else if (cloth === 'twill') w = 0.5 * tw(0.0028, 1.4) + 0.2 * (fbm(p, 0.004) - 0.5) * 2;
  else if (cloth === 'cotton') w = 0.3 * Math.sin(p[1] / 0.0016 * Math.PI) * Math.sin((p[0] + p[2]) / 0.0016 * Math.PI) + 0.25 * (fbm(p, 0.005) - 0.5) * 2;
  else if (cloth === 'fleece') w = 0.55 * (fbm(p, 0.0022) - 0.5) * 2 + 0.3 * (vnoise(p[0] / 0.006, p[1] / 0.006, p[2] / 0.006) > 0.82 ? 1 : 0);
  else if (cloth === 'nylon') w = 0.15 * (fbm(p, 0.01) - 0.5) * 2;
  else if (cloth === 'knit') w = 0.6 * Math.sin(Math.atan2(p[0], p[2]) * 160);
  // (the folds: only on cloth over a bending joint, never on a collar, cuff or hem band)
  let fold = 0; const band = /-(collar|neckband|hem|lapels|buttons)$/.test(part);
  if (!band && ctx && cloth !== 'nylon') {
    const nz = (s) => vnoise(p[0] / s + 11, p[1] / s, p[2] / s + 5);
    if (c === 1 && ctx.down && ctx.arm) { const s = p[0] >= 0 ? 'L' : 'R', A = ctx.arm[s], up = Math.hypot(A.e[0] - A.a[0], A.e[1] - A.a[1], A.e[2] - A.a[2]), d = ctx.down(p) - up;
      // (the inside of the elbow folds most: the side of the arm facing forward and in)
      const inside = 0.45 + 0.55 * Math.max(0, n[2] * 0.8 - Math.sign(p[0]) * n[0] * 0.4), g = Math.exp(-((d / 0.055) ** 2));
      fold += g * inside * Math.sin(d / 0.0105 * Math.PI + nz(0.03) * 4 + p[2] * 60);
      // (and a sleeve gathers a little over the wrist)
      const wd = ctx.wristDown[s] - ctx.down(p); fold += 0.5 * Math.exp(-(((wd - 0.06) / 0.035) ** 2)) * Math.sin(wd / 0.009 * Math.PI + nz(0.02) * 3); }
    if (c === 0 && ctx.WAIST) { const dy = p[1] - ctx.WAIST, g = Math.exp(-((dy / 0.05) ** 2)), ang = Math.atan2(p[0], p[2]), side = 0.5 + 0.5 * Math.abs(Math.sin(ang));
      fold += 0.75 * g * side * Math.sin(dy / 0.014 * Math.PI + nz(0.04) * 5 + ang * 1.5);
      // (drag lines from the armpit down the side of the chest, and across the shoulder blades)
      if (ctx.ARMPIT && Math.abs(Math.sin(ang)) > 0.6) { const da = ctx.ARMPIT - p[1]; if (da > 0 && da < 0.12) fold += 0.45 * (1 - da / 0.12) * Math.sin((p[1] + Math.abs(p[0]) * 0.8) / 0.016 * Math.PI + nz(0.03) * 3); } }
    if (c === 3 && ctx.knee) { const dy = p[1] - ctx.knee, g = Math.exp(-((dy / 0.06) ** 2)), back = n[2] < 0 ? 1 : 0.55;
      fold += 0.8 * g * back * Math.sin(dy / 0.012 * Math.PI + nz(0.03) * 4);
      // (a trouser leg breaks over the shoe)
      if (ctx.ankle) { const da = p[1] - ctx.ankle; fold += 0.6 * Math.exp(-(((da - 0.04) / 0.03) ** 2)) * Math.sin(da / 0.016 * Math.PI + Math.atan2(p[0], p[2]) * 2 + nz(0.02) * 3); } }
    if (c === 0 && ctx.crotch && p[1] < ctx.hip && p[1] > ctx.crotch - 0.02 && n[2] > 0.3) fold += 0.4 * Math.sin((p[1] - Math.abs(p[0]) * 1.2) / 0.013 * Math.PI + nz(0.03) * 3) * (1 - Math.abs(p[1] - (ctx.hip + ctx.crotch) / 2) / Math.max(0.02, (ctx.hip - ctx.crotch)));
  }
  // (the seams: sunk 1.5 mm wide, a stitch row 2.5 mm beside)
  let seam = 0;
  if (!band && ctx) { const sl = (dist) => { const a = Math.abs(dist); if (a < 0.0009) return -1; if (Math.abs(a - 0.0025) < 0.0004 && Math.sin((p[1] + p[0] + p[2]) / 0.0012 * Math.PI) > 0.2) return -0.55; return 0; };
    if (c === 0) { const nz0 = ctx.jpos ? ctx.jpos('neck01')[2] - 0.02 : 0, ang = Math.atan2(p[0], p[2] - nz0), r = Math.hypot(p[0], p[2] - nz0);
      seam = Math.min(seam, sl((Math.abs(ang) - Math.PI / 2) * r)); // (the side seams)
      if (ctx.NECKY && p[1] > ctx.NECKY - 0.09) seam = Math.min(seam, sl(p[2] - nz0 + 0.004)); } // (the shoulder seams)
    if (c === 1 && ctx.down) { const d = ctx.down(p); seam = Math.min(seam, sl(d - 0.012)); if (n[1] < -0.2) { const s = p[0] >= 0 ? 'L' : 'R', A = ctx.arm[s]; seam = Math.min(seam, sl((p[2] - A.a[2]) * 0.8 + 0.01)); } }
    if (c === 3 && ctx.jpos) { const s = p[0] >= 0 ? 'L' : 'R', k = ctx.jpos('lowerleg01.' + s), ang = Math.atan2(p[0] - k[0], p[2] - k[2]), r = Math.hypot(p[0] - k[0], p[2] - k[2]);
      seam = Math.min(seam, sl((Math.abs(ang) - Math.PI / 2) * r)); } }
  return { w, fold: clamp(fold, -1, 1), seam };
}
// the relief as an 8-bit height for the normal map (128 = the surface), and its shade for the colour (k)
export function fabricBump(ctx, cloth, part) { return (p, n, f, c) => { const h = fabricHeight(ctx, cloth, p, n, c, part); const v = 128 + 30 * h.w + 85 * h.fold + 55 * h.seam; return [v, v, v]; }; }
export function fabricShade(ctx, cloth, part) { return (p, n, f, c) => { const h = fabricHeight(ctx, cloth, p, n, c, part); return 1 + 0.025 * h.w + 0.06 * h.fold + 0.14 * h.seam; }; }
export function shade(rgb, k) { return rgb.map((c) => enc(lin(c) * k)); }
// (rib knit: fine vertical cords round the part's axis)
export const rib = (p, axisAng, n = 140) => 0.84 + 0.16 * Math.pow(Math.abs(Math.sin(axisAng * n / 2)), 0.7);

/* ---------------------------------------------------------------- garments -- */
// The garment specs. Each returns { shells: [...], extras: [...meshes], drop(packVert positions) } built from ctx.
// o: { color, accent, fit, len }
const torsoArmField = (ctx, o) => (p, c, v) => {
  if (c === 2 || c === 4 || c === 5) return -1;
  // (the neckline: round the neck's base, lower in front)
  const nz = ctx.jpos('neck01')[2], a = Math.atan2(p[0], p[2] - nz), front = 0.5 + 0.5 * Math.cos(a), ny = ctx.NECKY - (o.neckBase ?? 0.03) - (o.neckFront ?? 0.025) * Math.pow(front, 2.2) - (o.vee ?? 0) * Math.pow(Math.max(0, Math.cos(a)), 8)
    + (o.neckBack ?? 0) * Math.pow(Math.sin(a), 2) * sm(-0.35, -0.75, Math.cos(a)); // (NK: a stand collar's coat up at the back's corners to meet it)
  let fN = ny - p[1];
  // (NK, o.hugNeck { margin, up }: a stand collar's coat brought up the shoulders' slope to within margin of the neck (up
  // to `up` over its neckline), so its neckline rings the neck's base for the collar to stand on, not a wide scoop out on
  // the shoulders (a woman's slope met the flat cut 12 cm out from the neck); the shoulders' tops too, whose points
  // are the arm's (her shoulders stood over the flat cut and showed as pale flaps on the coat))
  if (o.hugNeck && (c === 0 || (c === 1 && Math.hypot(p[0], p[2] - nz) < 0.15))) { const r = Math.hypot(p[0], p[2] - nz), rn = neckSkin(ctx).at(a, p[1]); fN = Math.max(fN, Math.min(fN + (c === 1 ? o.hugNeck.armUp ?? 0.01 : o.hugNeck.up), r - rn - o.hugNeck.margin)); }
  if (c === 1) { const s = p[0] >= 0 ? 'L' : 'R', dn = ctx.down(p), end = ctx.wristDown[s] - (o.cuff ?? 0.015); return Math.min(fN, o.sleeve === false ? -(dn - 0.04) : end - dn); }
  return Math.min(fN, p[1] - o.hem);
};
export const GARMENTS = {
  // the overcoat: knee length, single-breasted (three buttons), a turned-down collar over a notched lapel line, flap
  // pockets at the hips, a wool twill; drapes from the shoulders
  overcoat: (ctx, o) => coat(ctx, { ...o, kind: 'overcoat', hemTop: ctx.crotch + 0.045, len: (ctx.crotch + 0.045) - (ctx.knee + (o.len === 'long' ? -0.06 : 0.04)), cloth: 'wool', thick: 0.011, collar: 'turn', db: false }),
  // the doorman's / a uniform coat: mid-thigh, double-breasted gold buttons, a stand collar and cuffs in the trim colour
  'doorman-coat': (ctx, o) => coat(ctx, { ...o, kind: 'doorman', hemTop: ctx.crotch + 0.045, len: (ctx.crotch + 0.045) - ((ctx.crotch + ctx.knee) / 2 - 0.02), cloth: 'wool', thick: 0.01, collar: 'stand', db: true, trim: true }),
  'uniform-jacket': (ctx, o) => coat(ctx, { ...o, kind: 'uniform', hem: ctx.hip - 0.02, cloth: 'twill', thick: 0.009, collar: 'stand', db: false, trim: true, buttonsN: 5 }),
  // (G7c: its neckline 1.6 cm under the neck's base and only 5 mm lower in front (the stand collar's 2.2 and 2 cm): the
  // collar stands on the neck, and the skin at the neck's base in front of it, between the collar's foot and a neckline
  // scooped 2 cm lower, showed either side of the collar as pale flaps (round 6))
  // the chef's jacket: hip length, double-breasted (the left front over the right, two columns of cloth knot buttons),
  // a mandarin collar, turned-back cuffs, white cotton drill
  'chef-jacket': (ctx, o) => coat(ctx, { ...o, kind: 'chef', hem: ctx.hip - 0.03, cloth: 'cotton', thick: 0.009, collar: 'stand', db: true, flap: true, cuffBand: 0.05, neckFront: 0.005, neckBase: 0.016 }),
  // the hoodie: crew neck (the hood lies behind it), rib cuffs and hem band, a kangaroo pocket; loose
  hoodie: (ctx, o) => coat(ctx, { ...o, kind: 'hoodie', hem: ctx.hip - (o.fit === 'oversized' ? 0.06 : 0.035), cloth: 'fleece', thick: o.fit === 'oversized' ? 0.016 : 0.011, collar: 'rib', db: false, ribs: true, pocket: true, neckBase: 0.012, neckFront: 0.018, cuff: 0.01 }),
  // the puffer: quilted channels round the body and down the sleeves (the loft rises in each channel and falls to the
  // stitched seam), a tall stand collar, a zip; boxy (hangs straight from the chest)
  'puffer-coat': (ctx, o) => coat(ctx, { ...o, kind: 'puffer', hem: ctx.hip - 0.01, cloth: 'nylon', thick: 0.012, collar: 'stand-tall', db: false, quilt: { pitch: 0.075, sleeve: 0.065, amp: 0.011 }, neckBase: 0.02, neckFront: 0.012 }),
  // loose trousers (cut for a woman's body, the owner's note on Oh Soon-ja's leggings): waist to the ankle, a wide straight
  // leg falling from the hip, a pressed crease, a waistband
  'loose-trousers': (ctx, o) => trousers(ctx, { ...o, flare: 0.026, cloth: 'twill' }),
  // (forge v2.2) the suit jacket: single-breasted (two buttons, notch lapels) or double-breasted (six buttons, the left
  // front over the right, peak lapels); cut from the body like every shell (natural shoulder line, no pad), the seat
  // covered by a short skirt, the shirt's cuff showing at the wrist, a deep V that shows the shirt and tie worn under it
  'suit-jacket': (ctx, o) => suitJacket(ctx, { ...o, db: false }),
  'suit-jacket-db': (ctx, o) => suitJacket(ctx, { ...o, db: true }),
};
function coat(ctx, o) {
  const col = hexRGB(o.color, o.kind === 'chef' ? [238, 238, 234] : [60, 60, 66]), acc = hexRGB(o.accent, o.kind === 'doorman' ? [176, 140, 58] : o.kind === 'chef' ? [228, 226, 220] : [24, 22, 22]);
  const hem = o.hemTop ?? o.hem, field = torsoArmField(ctx, { ...o, hem, neckBase: o.neckBase ?? (o.collar === 'stand' ? 0.022 : 0.026), neckFront: o.neckFront ?? (o.collar === 'turn' ? 0.03 : 0.02), neckBack: o.collar === 'stand' ? 0.014 : 0, hugNeck: o.collar === 'stand' ? { margin: o.kind === 'chef' ? 0.009 : 0.006, up: 0.015 } : null, vee: o.collar === 'turn' ? 0.07 : 0 });
  const weave = CLOTH[o.cloth] || CLOTH.cotton, overlapX = o.db ? 0.055 : 0.0, ribBand = 0.05;
  const quilt = (p, c) => { if (!o.quilt) return 0; const h = c === 1 ? ctx.down(p) / o.quilt.sleeve : (p[1] - ctx.WAIST) / o.quilt.pitch, fq = h - Math.floor(h); return 0.5 - 0.5 * Math.cos(2 * Math.PI * fq); };
  const thick = (p, c, f) => (c === 1 ? o.thick * 0.85 : o.thick) + (o.flap && p[0] < overlapX && p[2] > 0.02 && p[1] < ctx.NECKY - 0.03 ? 0.0025 : 0) + (o.quilt ? o.quilt.amp * 0.5 : 0);
  const armpit = ctx.ARMPIT ?? ctx.jpos('upperarm01.L')[1] - 0.1, chest = Math.min(ctx.NECKY - (ctx.sex === 'female' ? 0.2 : 0.17), armpit - 0.03), spec = { id: o.kind, field, thick, ease: 0.005, drape: 3, smooth: 120, smoothArm: 8, shoulder: { slope: 0.27, round: 2.0, besideOnly: o.collar === 'stand' }, fieldBase: o.collar === 'stand' ? torsoArmField(ctx, { ...o, hem, neckBase: o.neckBase ?? 0.022, neckFront: o.neckFront ?? 0.02 }) : null, flatten: 0.006, chest: { top: ctx.NECKY - 0.045, bottom: o.hemTop ? o.hemTop + 0.012 : o.hem - 0.03, max: 0.07, keep: 0.002, taper: { hoodie: 0.3, chef: 0.22, uniform: 0.22, puffer: 0.1, overcoat: 0.12, doorman: 0.12 }[o.kind] ?? 0.15 }, hang: { from: chest, max: o.hemTop ? 0.07 : 0.035, taper: { chef: 0.2, uniform: 0.2, hoodie: 0.28, puffer: 0.08 }[o.kind] ?? 0 }, hideIn: 0.004, skirt: o.hemTop ? { top: o.hemTop, len: o.len, flare: o.kind === 'overcoat' ? 0.08 : 0.04, room: 0.02 } : null,
    // (HD: a top's hem re-made as an even band: a hoodie's rib drawn in a little, a coat's falling straight)
    hemBand: o.hemTop ? null : { y: o.hem, h: o.kind === 'hoodie' ? 0.05 : o.kind === 'puffer' ? 0.04 : 0.035, taper: o.kind === 'hoodie' ? 0.18 : o.kind === 'puffer' ? 0.12 : 0.04, room: o.kind === 'puffer' || o.kind === 'hoodie' ? 0.012 : 0.009 },
    // (C5: the chef's jacket stiff over the shoulders' tops beside the neck (their weights spread, so the cloth rides up as
    // one piece when the shoulders lift instead of folding over itself into a lip), its neckline 9 mm off the neck and its
    // collar 2 mm over the neck's base at the back, 4 mm in front (it stood 11 mm up the back, and its top and the coat's
    // back corners showed their insides when she talked: collar flecks 117 -> 37))
    stiff: o.kind === 'chef' ? { iters: 8, only: (c, p) => (c === 0 || c === 1) && p[1] > ctx.NECKY - 0.11 && Math.hypot(p[0], p[2] - ctx.jpos('neck01')[2]) < 0.17 } : null };
  const sh = shell(ctx, spec); worn(ctx, o.kind, sh); if (sh.band) worn(ctx, o.kind + '-hem', sh.band);
  // (the paint: the cloth, its fold shade (concave darker), its hem stitched, the closure and buttons' placket, pockets)
  const paint = (p, n, f, c, ao) => {
    let k = weave(p) * (1 - 0.22 * clamp(ao, 0, 1)) * (1 + 0.05 * clamp(-ao, 0, 1)), C0 = col;
    if (o.quilt) { const q = quilt(p, c); k *= 0.78 + 0.22 * Math.sqrt(q); if (q < 0.004) k *= 0.85; if (p[2] > 0.02 && Math.abs(p[0]) < 0.0035 && n[2] > 0.3) k *= 0.72;
      // (MV: each baffle's down lumpy, the nylon crinkled where the stitching pulls it in)
      k *= 0.93 + 0.1 * fbm(p, 0.028); if (q < 0.3) k *= 0.9 + 0.1 * fbm(p, 0.0045); }
    const ang = Math.atan2(p[0], p[2]);
    if (f < 0.006 && f >= 0) k *= 0.86 + 0.14 * sm(0.0, 0.006, f); // (a hem's turn)
    if (Math.abs(f - 0.009) < 0.0006) k *= 0.82; // (its stitch line)
    if (o.ribs && f < ribBand) { const a = c === 1 ? ang * 3 + p[1] * 40 : ang; k *= rib(p, a, c === 1 ? 60 : 220); }
    if (o.trim && c === 1 && f < 0.05 && f > 0.012 && ctx.down(p) > ctx.wristDown[p[0] >= 0 ? 'L' : 'R'] - 0.09) C0 = acc; // (a uniform's cuffs in the trim colour)
    if (o.cuffBand && c === 1 && f < o.cuffBand) { k *= f < 0.003 ? 0.85 : 1.02; if (Math.abs(f - o.cuffBand) < 0.0012) k *= 0.8; }
    if (p[2] > 0.0 && n[2] > 0.2) {
      // (the closure: single-breasted at the middle; double-breasted: the edge at overlapX over the other side)
      const ex = o.db ? overlapX : 0.0, dx = p[0] - ex;
      if (o.kind !== 'hoodie' && p[1] < ctx.NECKY - 0.02 && Math.abs(dx) < 0.0016) k *= 0.62;
      if (o.kind !== 'hoodie' && p[1] < ctx.NECKY - 0.02 && dx < -0.0016 && dx > -0.004) k *= 1.06;
      // (a lapel's turn: two lines from the collar down to the top button)
      if (o.collar === 'turn') { const yTop = ctx.NECKY - 0.03, yBot = ctx.WAIST + 0.12, t = (yTop - p[1]) / (yTop - yBot); if (t > 0 && t < 1) { const lx = 0.085 * (1 - t) + 0.005; if (Math.abs(Math.abs(p[0]) - lx) < 0.002) k *= 0.7; if (Math.abs(p[0]) < lx) k *= 0.96; } }
      // (pockets: a flap at each hip; the hoodie's kangaroo pocket)
      if (o.kind === 'overcoat' || o.kind === 'doorman') { const py = ctx.hip + 0.07, ax = Math.abs(p[0]); if (ax > 0.06 && ax < 0.17 && Math.abs(p[1] - py) < 0.025) { const e = Math.min(Math.abs(p[1] - py - 0.025), Math.abs(ax - 0.06), Math.abs(ax - 0.17)); k *= e < 0.0015 ? 0.7 : 0.97; } }
      if (o.pocket) { const top = ctx.WAIST + 0.06, bot = hem + 0.055, ax = Math.abs(p[0]), w = 0.1 - (top - p[1]) * 0.18; if (p[1] < top && p[1] > bot && ax < w + 0.003) { const e = Math.min(Math.abs(p[1] - top), Math.abs(ax - w), Math.abs(p[1] - bot)); k *= e < 0.0018 ? 0.74 : e < 0.004 ? 1.04 : 0.97; } }
    }
    return shade(C0, k);
  };
  // (MV: nylon's soft sheen, not a matte wool and not a gloss: rough 0.66)
  const parts = [{ name: o.kind, mesh: sh, S: 2048, base: col, paint, ...(o.kind === 'puffer' ? { rough: 0.66 } : {}) }];
  if (sh.band) parts.push({ name: o.kind + '-hem', mesh: sh.band, S: 1024, base: col, paint: (p, n, f, c, ao) => paint(p, n, f, c, ao), ...(o.kind === 'puffer' ? { rough: 0.66 } : {}) });
  if (sh.skirt) parts.push({ name: o.kind + '-skirt', mesh: sh.skirt, S: 1024, base: col, paint: (p, n, f, c, ao) => { let k = weave(p) * (0.97 - 0.05 * Math.abs(Math.sin(Math.atan2(p[0], p[2] - sh.skirt.cz) * 9 + p[1] * 3)));
    if (p[2] > sh.skirt.cz && Math.abs(p[0] - (o.db ? overlapX : 0)) < 0.0016) k *= 0.62; const bottom = sh.skirt.P.reduce ? 0 : 0; return shade(col, k); } });
  // (the collar, buttons)
  const extras = [];
  // (HD: under a scarf a puffer's tall collar is left off: the scarf's roll is the collar)
  // (NK: a stand collar fitted to the neck as a closed band whose foot is tucked into this coat's neckline, open at the
  // front (necklines.mjs); the hoodie's rib the same, closed round, low on the neck)
  if ((o.collar === 'stand' || o.collar === 'stand-tall') && !(o.scarf && o.collar === 'stand-tall')) { const tall = o.collar === 'stand-tall';
    const cm = standCollar(ctx, { name: o.kind, sh, nearestNeck, field, top: tall ? 0.03 : o.kind === 'chef' ? 0.002 : 0.011, smoothTop: o.kind === 'chef', dropFront: tall ? 0.012 : o.kind === 'chef' ? -0.002 : 0.007, gap: tall ? 0.006 : 0.0025, th: tall ? 0.011 : 0.0035, open: o.kind === 'chef' ? 0.09 : tall ? 0.08 : 0, round: o.kind === 'chef' ? 0.012 : 0.007, minH: tall ? 0.04 : 0.018 }); for (const t of cm.hide) sh.hide.add(t);
    extras.push({ name: o.kind + '-collar', mesh: cm, S: 512, base: col,
      paint: (p, n, f, c, ao, uv) => { const roll = uv[1] > 0.4 && uv[1] < 0.64; return shade(o.trim && roll ? acc : col, weave(p) * (roll ? 0.92 : 1) * (uv[1] < 0.05 ? 0.8 : 1) * (o.kind !== 'chef' && !tall && (uv[0] < 0.005 || uv[0] > 0.995) ? 0.45 : 1)); } }); }
  if (o.collar === 'turn') extras.push({ name: o.kind + '-collar', mesh: collar(ctx, { y: ctx.NECKY - (o.collar === 'turn' ? 0.04 : o.collar === 'stand-tall' ? 0.03 : 0.024), h: o.collar === 'turn' ? 0.05 : o.collar === 'stand-tall' ? (o.scarf ? 0.04 : 0.065) : 0.036, style: o.collar === 'stand-tall' ? 'stand' : o.collar, follow: o.collar === 'stand-tall', gap: o.thick + (o.collar === 'stand-tall' ? 0.008 : 0.004), dropFront: o.collar === 'turn' ? 0.035 : 0.006, open: o.collar === 'stand' && o.kind === 'chef' ? 0.12 : o.collar === 'turn' ? 0.42 : 0.05 }), S: 256, base: col, paint: (p, n, f, c, ao, uv) => shade(o.trim && (uv[1] > 0.82 || uv[1] < 0.1) ? acc : col, weave(p) * (uv[1] > 0.95 ? 0.85 : 1)) });
  // (HD: no neckband under a hood worn up: the hood is sewn in there)
  if (o.collar === 'rib' && !o.hoodUp) extras.push({ name: o.kind + '-neckband', mesh: standCollar(ctx, { name: 'rib', sh, nearestNeck, shellWeights: true, seamBack: true, top: -0.008, dropFront: 0.012, gap: 0.003, th: 0.0055, open: 0, minH: 0.012, tuck: 0.005 }), S: 256, base: col, paint: (p) => shade(col, rib(p, Math.atan2(p[0], p[2]), 200) * 0.97) });
  const bspots = [], btn = { r: o.kind === 'chef' ? 0.0075 : 0.0095, h: 0.004 };
  const yTop = o.kind === 'chef' ? ctx.NECKY - 0.07 : o.collar === 'turn' ? ctx.WAIST + 0.12 : ctx.NECKY - 0.08, yBot = o.kind === 'chef' ? ctx.WAIST + (o.apron ? 0.05 : -0.06) : (hem ?? ctx.hip) + 0.03;
  const nB = o.buttonsN ?? (o.kind === 'overcoat' ? 3 : o.kind === 'chef' ? 5 : o.kind === 'doorman' ? 4 : 0);
  for (let i = 0; i < nB; i++) { const y = yTop - ((yTop - yBot) * i) / Math.max(1, nB - 1), widen = o.db && o.kind !== 'chef' ? 0.012 * (1 - i / Math.max(1, nB - 1)) : 0;
    if (o.db) { bspots.push([0.045 + widen, y], [-0.045 - widen, y]); } else bspots.push([o.kind === 'overcoat' ? 0.012 : 0, y]); }
  if (o.kind === 'overcoat') bspots.splice(0, bspots.length, ...bspots.map(([x, y], i) => [x, ctx.WAIST + 0.12 - i * 0.1]));
  if (bspots.length) extras.push({ name: o.kind + '-buttons', mesh: buttons(sh, bspots, btn), S: 64, base: o.kind === 'doorman' ? acc : o.kind === 'chef' ? hexRGB(o.accent, [232, 230, 224]) : [22, 20, 20], rough: o.kind === 'doorman' ? 0.35 : 0.6, metal: o.kind === 'doorman' ? 0.6 : 0, paint: null });
  return { parts, extras, shell: sh, field: spec.field };
}
// (forge v2.2) the front surface of a finished shell, for pieces laid on it (lapels): its frontmost point's depth and
// normal by (x, y) on a 6 mm grid, read back as a weighted mean of the filled cells round a point (a cut, the V, reads
// its edge's cloth)
function frontOf(sh, y0, y1) {
  const cs = 0.006, X0 = -0.32, NX = Math.ceil(0.64 / cs), NY = Math.ceil((y1 - y0) / cs) + 1, Z = new Float32Array(NX * NY).fill(-9), Nn = new Float32Array(NX * NY * 3);
  for (let i = 0; i < sh.nv; i++) { if (sh.N[i * 3 + 2] < 0.25) continue; const x = sh.P[i * 3], y = sh.P[i * 3 + 1], z = sh.P[i * 3 + 2], a = Math.floor((x - X0) / cs), b = Math.floor((y - y0) / cs); if (a < 0 || b < 0 || a >= NX || b >= NY) continue;
    const q = b * NX + a; if (z > Z[q]) { Z[q] = z; Nn[q * 3] = sh.N[i * 3]; Nn[q * 3 + 1] = sh.N[i * 3 + 1]; Nn[q * 3 + 2] = sh.N[i * 3 + 2]; } }
  return (x, y) => { const fa = (x - X0) / cs - 0.5, fb = (y - y0) / cs - 0.5;
    for (const R of [1.6, 3, 5]) { let s = 0, zz = 0; const n = [0, 0, 0];
      for (let b = Math.floor(fb - R); b <= Math.ceil(fb + R); b++) for (let a = Math.floor(fa - R); a <= Math.ceil(fa + R); a++) { if (a < 0 || b < 0 || a >= NX || b >= NY) continue; const q = b * NX + a; if (Z[q] < -1) continue;
        const d2 = (a - fa) ** 2 + (b - fb) ** 2; if (d2 > R * R) continue; const w = Math.exp(-d2 / (0.5 * R * R)); s += w; zz += Z[q] * w; for (let k = 0; k < 3; k++) n[k] += Nn[q * 3 + k] * w; }
      if (s > 1e-6) { const l = Math.hypot(...n) || 1; return { z: zz / s, n: n.map((c) => c / l) }; } }
    return null; };
}
// (forge v2.2) a lapel on each side of a jacket's V: a strip laid on the jacket's front from the top button (B) up the
// roll line (the V's edge) to the collar (T), its outer edge out from the roll line by the lapel's width: a notch lapel
// (out to its point, then in to the gorge) or a peak lapel (its point swept up). The roll line is the strip's thickest
// edge (the cloth folded back over itself), its outer edge comes back down to the jacket (no paper edge)
function lapels(ctx, sh, o) {
  const front = frontOf(sh, o.yV - 0.06, ctx.NECKY + 0.04), P = [], UV = [], JI = [], WT = [], idx = [], NT = 44, US = [-0.07, 0, 0.12, 0.35, 0.6, 0.85, 0.96, 1];
  // (NK: both long edges let down into the jacket's front, so no sliver of the lapel's underside shows past its edge)
  const lift = (u) => (u < 0 ? -0.0012 : u === 0 ? 0.0075 : u < 0.9 ? 0.0062 - 0.0018 * u : u < 1 ? 0.0042 : -0.001);
  // (the nearest shell point's weights, as a button's)
  const near = (x, y, z) => { let best = -1, bd = 1e9; for (let i = 0; i < sh.nv; i++) { const d = (sh.P[i * 3] - x) ** 2 + (sh.P[i * 3 + 1] - y) ** 2 + (sh.P[i * 3 + 2] - z) ** 2; if (d < bd) { bd = d; best = i; } } return best; };
  for (const s of [1, -1]) {
    const B = [o.edgeX, o.yV], T = [s * o.xT, o.yT], L = Math.hypot(T[0] - B[0], T[1] - B[1]), f = [(T[0] - B[0]) / L, (T[1] - B[1]) / L];
    // (out from the roll line, away from the V)
    let d = [f[1], -f[0]]; if (d[0] * s < 0) d = [-d[0], -d[1]];
    const tn = o.peak ? 0.8 : 0.77, wMax = o.peak ? 0.084 : 0.07;
    const W = (t) => { if (t <= tn) return wMax * Math.pow(sm(0, 0.62, t), 0.8) * (1 - 0.06 * sm(0.5, tn, t));
      // (notch: a step in to the gorge; peak: the point swept up, then in)
      if (!o.peak) return wMax * 0.94 - (wMax * 0.94 - 0.03) * sm(tn, tn + 0.035, t);
      return wMax * (1 + 0.05 * sm(tn, tn + 0.04, t)) - (wMax * 1.05 - 0.03) * sm(tn + 0.045, tn + 0.075, t); };
    const UP = (t) => (o.peak ? 0.026 * sm(tn - 0.08, tn + 0.04, t) * (1 - sm(tn + 0.045, tn + 0.075, t)) : 0);
    const base = P.length / 3;
    for (let a = 0; a <= NT; a++) { const t = a / NT, F = [B[0] + f[0] * L * t, B[1] + f[1] * L * t], w = W(t), up = UP(t);
      for (let k = 0; k < US.length; k++) { const u = US[k], x = F[0] + d[0] * w * u, y = F[1] + d[1] * w * u + up * Math.max(0, u) ** 1.5, S = front(x, y); if (!S) { P.push(x, y, 0.1); } else { const l = lift(u); P.push(x + S.n[0] * l, y + S.n[1] * l, S.z + S.n[2] * l); }
        UV.push(t, (k + 0.5) / US.length); const i = P.length / 3 - 1, q = near(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); JI.push(...sh.JI.slice(q * 4, q * 4 + 4)); WT.push(...sh.WT.slice(q * 4, q * 4 + 4)); } }
    const R = US.length; for (let a = 0; a < NT; a++) for (let k = 0; k < R - 1; k++) { const i0 = base + a * R + k, i1 = i0 + R; if (s > 0) idx.push(i0, i0 + 1, i1, i0 + 1, i1 + 1, i1); else idx.push(i0, i1, i0 + 1, i0 + 1, i1, i1 + 1); }
  }
  return { P: Float32Array.from(P), UV: Float32Array.from(UV), JI: Int32Array.from(JI), WT: Float32Array.from(WT), idx: Uint32Array.from(idx) };
}
function suitJacket(ctx, o) {
  const col = hexRGB(o.color, [38, 40, 48]), nz = ctx.jpos('neck01')[2], db = !!o.db;
  // (the V: from the top button (B) up to each side of the collar (T); a double-breasted front's edge off to the right)
  const edgeX = db ? -0.034 : 0, yV = ctx.WAIST + (db ? 0.085 : 0.0), xT = 0.07, yT = ctx.NECKY - 0.032, hemTop = ctx.crotch + 0.05;
  // (C5, o.collarGap: over the base suit's shirt with its collar kept only in the V (core.mjs) the jacket's turned collar
  // sits 3 mm off the neck with a 3 mm fall, the jacket's neckline 1 cm up at the back's corners and its shoulders' tops
  // stiff (weights spread), so the old boss's collar and shoulders keep their insides hidden when he talks or sits)
  const snug = o.collarGap != null;
  const base = torsoArmField(ctx, { hem: hemTop, neckBase: 0.014, neckFront: 0.03, cuff: 0.03, neckBack: snug ? 0.01 : 0 });
  const field = (p, c, v) => { const f0 = base(p, c, v); if (c !== 0 || p[2] < nz || p[1] < yV - 0.02) return f0; const t = Math.min(1.5, (p[1] - yV) / (yT - yV));
    const xl = edgeX + (xT - edgeX) * t, xr = edgeX + (-xT - edgeX) * t, inV = Math.min(p[0] - xr, xl - p[0]); return Math.min(f0, -inV); };
  const thick = (p, c) => (c === 1 ? 0.0075 : 0.0085);
  const spec = { id: db ? 'suit-db' : 'suit', field, thick, ease: 0.009, drape: 3, smooth: 120, smoothArm: 8, shoulder: { slope: 0.27, round: 2.9, bridge: true }, flatten: 0.006,
    chest: { top: ctx.NECKY - 0.045, bottom: hemTop - 0.03, max: 0.07, keep: 0.002, taper: 0.05 }, hang: { from: Math.min(ctx.NECKY - 0.17, (ctx.ARMPIT ?? ctx.NECKY - 0.2) - 0.03), max: 0.05, taper: 0.05 }, hideIn: 0.004,
    skirt: null, hemBand: { y: hemTop, h: 0.035, taper: 0.02, room: 0.01 }, stiff: snug ? { iters: 8, only: (c, p) => (c === 0 || c === 1) && p[1] > ctx.NECKY - 0.11 && Math.hypot(p[0], p[2] - nz) < 0.17 } : null };
  const sh = shell(ctx, spec);
  const weave = (p) => CLOTH.wool(p) * (o.pattern === 'stripe' ? 1 : 1);
  // (a chalk pinstripe for pattern 'stripe': fine light lines 13 mm apart round the body, down the sleeves)
  const stripe = (p, c) => { if (o.pattern !== 'stripe') return 1; const s = c === 1 ? (Math.atan2(p[2], p[1]) * 0.05) : Math.atan2(p[0], p[2] - 0.0) * 0.16; const fq = s / 0.013 - Math.floor(s / 0.013); return fq < 0.07 ? 1.35 : 1; };
  const paint = (p, n, f, c, ao) => {
    let k = weave(p) * stripe(p, c) * (1 - 0.22 * clamp(ao, 0, 1)) * (1 + 0.05 * clamp(-ao, 0, 1));
    if (f < 0.005 && f >= 0) k *= 0.86 + 0.14 * sm(0.0, 0.005, f); // (the edges turned)
    if (Math.abs(f - 0.007) < 0.0005) k *= 0.84; // (the edge stitch)
    if (p[2] > 0.0 && n[2] > 0.2) {
      // (the closure under the top button)
      if (p[1] < yV && Math.abs(p[0] - edgeX) < 0.0016) k *= 0.6; if (p[1] < yV && p[0] - edgeX < -0.0016 && p[0] - edgeX > -0.004) k *= 1.06;
      // (flap pockets at the hips, a welt on the left breast)
      const py = ctx.hip + 0.045, ax = Math.abs(p[0]); if (ax > 0.07 && ax < 0.19 && p[1] < py && p[1] > py - 0.05) { const e = Math.min(Math.abs(p[1] - py), Math.abs(p[1] - py + 0.05), Math.abs(ax - 0.07), Math.abs(ax - 0.19)); k *= e < 0.0016 ? 0.66 : 1.03; }
      const wy = ctx.NECKY - 0.165 + (p[0] - 0.1) * 0.12; if (p[0] > 0.065 && p[0] < 0.165 && p[1] > wy - 0.013 && p[1] < wy + 0.004) { const e = Math.min(Math.abs(p[1] - wy + 0.013), Math.abs(p[1] - wy - 0.004), Math.abs(p[0] - 0.065), Math.abs(p[0] - 0.165)); k *= e < 0.0014 ? 0.66 : 1.02; }
    }
    return shade(col, k); };
  const parts = [{ name: spec.id, mesh: sh, S: 2048, base: col, paint }];
  if (sh.band) parts.push({ name: spec.id + '-hem', mesh: sh.band, S: 1024, base: col, paint });
  if (sh.skirt) parts.push({ name: spec.id + '-skirt', mesh: sh.skirt, S: 1024, base: col, paint: (p) => { let k = weave(p) * stripe(p, 0) * (0.97 - 0.04 * Math.abs(Math.sin(Math.atan2(p[0], p[2] - sh.skirt.cz) * 7 + p[1] * 3)));
    if (p[2] > sh.skirt.cz && Math.abs(p[0] - edgeX) < 0.0016) k *= 0.6; if (!db && p[2] > sh.skirt.cz && p[0] > edgeX && p[0] < edgeX + 0.05) k *= 1 - 0.1 * sm(0.0, 0.05, p[0] - edgeX); return shade(col, k); } });
  const extras = [];
  // (NK: the collar turned over on the jacket's own neckline, its fall over the cut edge, its ends at the lapels' tops)
  extras.push({ name: spec.id + '-collar', mesh: turnCollar(ctx, { sh, nearestNeck, gap: o.collarGap ?? 0.0115, frontGap: 0.62, stand: 0.03, over: snug ? 0.003 : 0.012 }), S: 256, base: col, paint: (p, n, f, c, ao, uv) => shade(col, weave(p) * (uv[1] > 0.3 && uv[1] < 0.42 ? 0.9 : 1) * (uv[1] > 0.8 ? 0.85 : 1)) });
  extras.push({ name: spec.id + '-lapels', mesh: lapels(ctx, sh, { edgeX, yV, xT, yT, peak: db }), S: 512, base: col, paint: (p, n, f, c, ao, uv) => {
    const u = uv[1]; let k = weave(p) * stripe(p, 0) * (u < 0.26 ? 1.16 - 0.5 * Math.max(0, u - 0.1) : 1) * (u > 0.93 ? 0.78 : 1);
    // (the pick stitch 6 mm in from the edge)
    if (u > 0.8 && u < 0.86 && Math.sin(uv[0] * 900) > 0.6) k *= 0.82; return shade(col, k); } });
  const spots = db ? [[0.058, yV - 0.005], [-0.058, yV - 0.005], [0.055, yV - 0.08], [-0.055, yV - 0.08], [0.052, yV - 0.155], [-0.052, yV - 0.155]] : [[edgeX + 0.002, yV - 0.012], [edgeX + 0.002, yV - 0.115]];
  extras.push({ name: spec.id + '-buttons', mesh: buttons(sh, spots, { r: 0.0085, h: 0.0035 }), S: 64, base: hexRGB(o.accent2, [24, 20, 18]), rough: 0.45, paint: null });
  return { parts, extras, shell: sh, field };
}
function trousers(ctx, o) {
  const col = hexRGB(o.color, [52, 50, 52]);
  const waist = ctx.WAIST + 0.015, cuffY = ctx.ankle + 0.012;
  const field = (p, c) => (c === 0 || c === 3 ? Math.min(waist - p[1], p[1] - cuffY) : c === 4 ? p[1] - cuffY : -1);
  // (room grows down the leg: hugging the hip, a straight wide leg below the knee; the inside of the thigh kept narrow so
  // the legs don't meet)
  const thick = (p, c, f) => { const t = sm(ctx.hip, ctx.knee - 0.05, p[1]), d = 0.008 + o.flare * t * 0.6; return d; };
  const sh = shell(ctx, { id: 'loose-trousers', field, thick, ease: 0.004, drape: 2, smooth: 40, smoothArm: 0, hang: { from: ctx.hip + 0.03, legs: true, legFrom: ctx.crotch + 0.01, taper: 0.06, inner: 0.35, max: 0.045 }, hideIn: 0.008 });
  // (the seat: the pelvis part hangs from the hips too)

  // (the inner thigh: a point moved toward the middle past 6 mm of it pulled back out)
  for (let i = 0; i < sh.nv; i++) { const x = sh.P[i * 3]; if (sh.C[i] !== 3) continue; const sx = Math.sign(sh.N[i * 3] || 1); if (sx * Math.sign(x) < 0 && Math.abs(x) < 0.006) sh.P[i * 3] = Math.sign(x || 1) * 0.006; }
  const paint = (p, n, f, c, ao) => { let k = CLOTH.twill(p) * (1 - 0.25 * clamp(ao, 0, 1));
    if (p[1] > waist - 0.035) { k *= p[1] > waist - 0.034 && p[1] < waist - 0.031 ? 0.8 : 1.03; }
    if (f < 0.005) k *= 0.85;
    // (the pressed crease down each leg's front)
    if (c === 3 && n[2] > 0.5) { const s = p[0] >= 0 ? 'L' : 'R', kx = ctx.jpos('lowerleg01.' + s)[0] * 0.9 + ctx.jpos('upperleg01.' + s)[0] * 0.1; if (Math.abs(p[0] - kx) < 0.0016 && p[1] < ctx.hip - 0.05) k *= 1.12; }
    return shade(col, k); };
  return { parts: [{ name: 'loose-trousers', mesh: sh, S: 2048, base: col, paint }], extras: [], shell: sh, field };
}

/* ------------------------------------------------------------------- hair -- */
// the bob tucked behind the ear: its points in front of the ear's back, under the temple, moved back behind the ear and
// in to the head's side (fading in under the temple and out at the ear's top), so the face is clear from the side
export function tuckBob(ctx, P, verts) {
  const { bPos, nBody, cls, EY } = ctx; const ear = { L: [0, 0, 0, 0], R: [0, 0, 0, 0] };
  for (let v = 0; v < nBody; v++) { if (cls[v] !== 5) continue; const x = bPos[v * 3], y = bPos[v * 3 + 1], z = bPos[v * 3 + 2]; if (Math.abs(x) < 0.062 || y > EY + 0.02 || y < EY - 0.06) continue; const e = ear[x > 0 ? 'L' : 'R']; e[0] += x; e[1] += y; e[2] += z; e[3]++; }
  for (const s of ['L', 'R']) { const e = ear[s]; ear[s] = e[3] ? [e[0] / e[3], e[1] / e[3], e[2] / e[3]] : [s === 'L' ? 0.075 : -0.075, EY - 0.02, ctx.EZ - 0.09]; }
  let n = 0;
  for (const v of verts) { const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2], e = ear[x > 0 ? 'L' : 'R'], back = e[2] - 0.022;
    if (Math.abs(x) < 0.04 || z < back) continue;
    const w = (1 - sm(e[1] + 0.035, e[1] + 0.06, y)) * sm(0.04, 0.06, Math.abs(x)); if (w <= 0) continue;
    const nz = back - 0.004 - (z - back) * 0.12, side = Math.sign(x), nx = side * Math.max(Math.abs(e[0]) - 0.012, Math.abs(x) * 0.88);
    P[v * 3 + 2] = z + (nz - z) * w; P[v * 3] = x + (nx - x) * w * 0.8; n++; }
  return n;
}
// balding: the hair's cards over the crown and the front dropped, a fringe of them round the sides and back kept
export function baldTris(ctx, P, tris, o = {}) { const { EY, EZ } = ctx, out = []; const crown = EY + (o.crown ?? 0.07);
  for (let q = 0; q < tris.length; q += 3) { const v = [tris[q], tris[q + 1], tris[q + 2]], y = Math.max(...v.map((i) => P[i * 3 + 1])), z = v.reduce((a, i) => a + P[i * 3 + 2], 0) / 3, x = v.reduce((a, i) => a + Math.abs(P[i * 3]), 0) / 3;
    const top = y > crown - 0.012 * sm(0.03, 0.07, x) * 4 && x < 0.075, front = z > EZ - 0.04 && y > EY + 0.03; if (top || front) continue; out.push(...v); }
  return out; }
// slicked: the hair pressed to the skull (each point's height over the scalp kept at `k` of it), combed straight back
export function slick(ctx, P, verts, k = 0.45) { const { bPos, nBody, cls } = ctx, head = []; for (let v = 0; v < nBody; v++) if (cls[v] === 5) head.push(v);
  const cell = 0.02, G = new Map(), key = (x, y, z) => Math.floor(x / cell) + ',' + Math.floor(y / cell) + ',' + Math.floor(z / cell); for (const v of head) { const kk = key(bPos[v * 3], bPos[v * 3 + 1], bPos[v * 3 + 2]); (G.get(kk) || G.set(kk, []).get(kk)).push(v); }
  let n = 0; for (const v of verts) { const p = [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]], c = p.map((x) => Math.floor(x / cell)); let best = -1, bd = 9;
    for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) for (let d = -2; d <= 2; d++) { const L = G.get((c[0] + a) + ',' + (c[1] + b) + ',' + (c[2] + d)); if (!L) continue; for (const h of L) { const dd = (bPos[h * 3] - p[0]) ** 2 + (bPos[h * 3 + 1] - p[1]) ** 2 + (bPos[h * 3 + 2] - p[2]) ** 2; if (dd < bd) { bd = dd; best = h; } } }
    if (best < 0) continue; for (let i = 0; i < 3; i++) P[v * 3 + i] = bPos[best * 3 + i] + (p[i] - bPos[best * 3 + i]) * k; n++; }
  return n; }
// braids and locs for the core's braid builder: roots on the hairline every `edge` m and over the scalp, a plaited
// (lobed) or rope (lumpy) tube, matte; the hanging part turns with the head (weights eased to the neck over its length)
export const BRAIDS = {
  'box-braids': { count: 150, r: 0.0034, len: 0.42, edge: 0.0095, plait: 0.2, pitch: 0.0055, rough: 0.86, partLines: true, headHold: 0.97 },
  // (forge v2.2) curls: ringlets: a thin strand wound as a helix round its path (3.5 cm on the scalp at most, then hanging
  // to about the jaw), dense, matte, fuzzy (F6: 215 strands, was 250: with core.mjs's lighter tube the nurse's GLB 4.4 ->
  // 2.65 MB, under the store's 3 MB a person)
  curls: { count: 260, r: 0.0019, len: 0.11, edge: 0.009, plait: 0, lumps: 0.1, pitch: 0.008, rough: 0.9, partLines: false, headHold: 0.97, fuzz: 0.25, coil: { R: 0.0062, pitch: 0.013 }, ribbon: { w: 0.92, v: 0.04, cut: 0.4 } },
  locs: { count: 72, r: 0.0058, len: 0.34, edge: 0.016, plait: 0, lumps: 0.22, pitch: 0.012, rough: 0.94, partLines: true, headHold: 0.97, fuzz: 0.18 },
};
// (forge v2.3, HB) the six styles' settings (compile.mjs reads them; core.mjs builds them):
//   afro            coil shells: size (m off the skull at crown and sides), frontK (over the forehead), layers
//   short-twists    the braid builder standing: two-strand twists (plait 0.3) 6 cm long, out from the scalp at stand,
//                   bending by droop
//   side-part       the pack's short cut, slicked a little, parted x m to the left (pressed into a groove along it),
//                   the wide side swept over by sweep
//   long-straight   the pack's long cards, straight (no wave), the fringe trimmed over the brows (fringe m)
//   high-ponytail   Fiona's ponytail, its gather lifted high m up the back of the head
//   bun             the slicked cut with the tail gathered into a coiled bun: r, h (m), its ropes, lift (m)
export const HAIR_STYLES = {
  afro: { size: 0.05, frontK: 0.55, layers: 12, rough: 0.88 },
  'short-twists': { count: 210, r: 0.0036, len: 0.06, edge: 0.011, plait: 0.3, pitch: 0.0085, rough: 0.82, partLines: true, headHold: 0.97, fuzz: 0.2, stand: 0.55, droop: 0.6 },
  'side-part': { x: 0.026, sweep: 0.012, sweepF: 0.016, slick: 0.6 },
  'long-straight': { fringe: 0.02, clear: 0.072 },
  'high-ponytail': { high: 0.05 },
  bun: { r: 0.03, h: 0.038, ropes: 4, rope: 0.0105, turns: 2.2, lift: 0.015, rough: 0.74 },
};
// the knit's texture (the beanie): stockinette 'V' stitches, a ribbed cuff below `cuffV`; and its height for a normal map
export function knitTex(S, cols = 64, rows = 48, cuffV = 0.3) {
  const img = new Uint8Array(S * S), hgt = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const u = (x / S) * cols, v = (y / S) * rows, fu = u - Math.floor(u), fv = v - Math.floor(v); let h;
    if (y / S > 1 - cuffV) { h = Math.pow(Math.abs(Math.sin(fu * Math.PI)), 0.8) * (Math.floor(u) % 2 ? 0.55 : 1); }
    else { const side = fu < 0.5 ? fu * 2 : (1 - fu) * 2, lean = Math.abs((fv - 0.5) * 2 - (1 - side) * 0.0), lobe = 1 - Math.min(1, Math.hypot((side - 0.55) * 1.6, (fv - 0.5 + (fu < 0.5 ? 1 : -1) * (fu - 0.5) * 0.6) * 1.4)); h = Math.max(0, lobe) * (0.85 + 0.15 * hash3(Math.floor(u), Math.floor(v), 3)); void lean; }
    hgt[y * S + x] = h; img[y * S + x] = Math.round(255 * (0.62 + 0.38 * h)); }
  const nrm = new Uint8Array(S * S * 3), at = (x, y) => hgt[((y + S) % S) * S + ((x + S) % S)];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const dx = (at(x + 1, y) - at(x - 1, y)) * 2.2, dy = (at(x, y + 1) - at(x, y - 1)) * 2.2, l = Math.hypot(dx, dy, 1), i = (y * S + x) * 3; nrm[i] = Math.round((-dx / l * 0.5 + 0.5) * 255); nrm[i + 1] = Math.round((dy / l * 0.5 + 0.5) * 255); nrm[i + 2] = Math.round((1 / l * 0.5 + 0.5) * 255); }
  return { img, nrm };
}
// smooth normals welded by place (the shell's points split at the body's uv seams shade as one surface)
// (C5: an inner layer wrapped to the layer over it: each inner point lying behind the outer cloth (within `depth` behind
// its nearest outer point, at rest) takes that point's skin weights, blended in over `blend` of depth so the edge of the
// cover is no seam. Both then move as one in every pose: a hoodie under its hood's band moves with the band. Returns the
// count wrapped)
export function wrapWeights(inner, outers, o = {}) {
  const depth = o.depth ?? 0.025, cell = 0.03, gk = (x, y, z) => Math.floor(x / cell) + ',' + Math.floor(y / cell) + ',' + Math.floor(z / cell);
  // (per outer piece, as the gates read cover: the inner point's nearest point on each piece; of the pieces it lies
  // behind, the one it is nearest to the surface of)
  const Gs = outers.map((m) => { const G = new Map(), N = weldNormals(m.P, m.idx); for (let i = 0; i < m.P.length / 3; i++) { const e = { m, i, p: [m.P[i * 3], m.P[i * 3 + 1], m.P[i * 3 + 2]], n: [N[i * 3], N[i * 3 + 1], N[i * 3 + 2]] }, k = gk(...e.p); (G.get(k) || G.set(k, []).get(k)).push(e); } return G; });
  let n = 0; const nv = inner.P.length / 3;
  for (let v = 0; v < nv; v++) { if (o.only && !o.only(v)) continue; const p = [inner.P[v * 3], inner.P[v * 3 + 1], inner.P[v * 3 + 2]], c = p.map((x) => Math.floor(x / cell)); let best = null, bd = 0, bdn = 9;
    for (const G of Gs) { let pb = null, pd = (o.reach ?? 0.03) ** 2;
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let d = -1; d <= 1; d++) for (const e of G.get((c[0] + a) + ',' + (c[1] + b) + ',' + (c[2] + d)) || []) { const dd = (e.p[0] - p[0]) ** 2 + (e.p[1] - p[1]) ** 2 + (e.p[2] - p[2]) ** 2; if (dd < pd) { pd = dd; pb = e; } }
      if (!pb) continue; const dn = (p[0] - pb.p[0]) * pb.n[0] + (p[1] - pb.p[1]) * pb.n[1] + (p[2] - pb.p[2]) * pb.n[2]; if (dn > (o.out ?? 0.001) || dn < -depth) continue; if (-dn < bdn) { bdn = -dn; best = pb; bd = pd; } }
    if (!best) continue;
    const t = o.blend ? sm(0, o.blend, Math.sqrt(bd)) : 0, k = 1 - t * (o.keep ?? 0); if (k <= 0) continue;
    const wm = new Map(); for (let j = 0; j < 4; j++) { const w = inner.WT[v * 4 + j] * (1 - k); if (w > 0) wm.set(inner.JI[v * 4 + j], (wm.get(inner.JI[v * 4 + j]) || 0) + w); const w2 = best.m.WT[best.i * 4 + j] * k; if (w2 > 0) wm.set(best.m.JI[best.i * 4 + j], (wm.get(best.m.JI[best.i * 4 + j]) || 0) + w2); }
    const e = [...wm.entries()].sort((x, y) => y[1] - x[1]).slice(0, 4), s = e.reduce((acc, x) => acc + x[1], 0) || 1; while (e.length < 4) e.push([0, 0]);
    e.forEach(([j, w], q) => { inner.JI[v * 4 + q] = j; inner.WT[v * 4 + q] = w / s; }); n++; }
  return n;
}
// (C5: which of a set of points lie under any of the outer pieces: behind its nearest point, within depth)
export function coveredBy(P, list, outers, depth = 0.02, reach = 0.025) {
  const cell = 0.03, gk = (x, y, z) => Math.floor(x / cell) + ',' + Math.floor(y / cell) + ',' + Math.floor(z / cell);
  const Gs = outers.map((m) => { const G = new Map(), N = weldNormals(m.P, m.idx); for (let i = 0; i < m.P.length / 3; i++) { const e = { p: [m.P[i * 3], m.P[i * 3 + 1], m.P[i * 3 + 2]], n: [N[i * 3], N[i * 3 + 1], N[i * 3 + 2]] }, k = gk(...e.p); (G.get(k) || G.set(k, []).get(k)).push(e); } return G; });
  const out = new Set();
  for (const v of list) { const p = [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]], c = p.map((x) => Math.floor(x / cell));
    for (const G of Gs) { let pb = null, pd = reach * reach; for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let d = -1; d <= 1; d++) for (const e of G.get((c[0] + a) + ',' + (c[1] + b) + ',' + (c[2] + d)) || []) { const dd = (e.p[0] - p[0]) ** 2 + (e.p[1] - p[1]) ** 2 + (e.p[2] - p[2]) ** 2; if (dd < pd) { pd = dd; pb = e; } }
      if (pb) { const dn = (p[0] - pb.p[0]) * pb.n[0] + (p[1] - pb.p[1]) * pb.n[1] + (p[2] - pb.p[2]) * pb.n[2]; if (dn < 0.0005 && dn > -depth) { out.add(v); break; } } } }
  return out;
}
export function weldNormals(P, idx) {
  const n = P.length / 3, key = (i) => Math.round(P[i * 3] * 2e4) + ',' + Math.round(P[i * 3 + 1] * 2e4) + ',' + Math.round(P[i * 3 + 2] * 2e4), W = new Map(), wid = new Int32Array(n);
  for (let i = 0; i < n; i++) { const k = key(i); if (!W.has(k)) W.set(k, W.size); wid[i] = W.get(k); }
  const acc = new Float64Array(W.size * 3);
  for (let q = 0; q < idx.length; q += 3) { const a = idx[q], b = idx[q + 1], c = idx[q + 2], ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2], vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1], vz = P[c * 3 + 2] - P[a * 3 + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; for (const v of [a, b, c]) { acc[wid[v] * 3] += nx; acc[wid[v] * 3 + 1] += ny; acc[wid[v] * 3 + 2] += nz; } }
  const N = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const w = wid[i], l = Math.hypot(acc[w * 3], acc[w * 3 + 1], acc[w * 3 + 2]) || 1; for (let k = 0; k < 3; k++) N[i * 3 + k] = acc[w * 3 + k] / l; }
  return N;
}

/* ------------------------------------------------------------ beard cards -- */
// (forge v2.3, HB: the beard finished the way Mr. Big's was made) three layers, as his: the beard painted on the skin
// (a shadow of hair), Mr. Big's shells (short fine strokes in 3-5 layers out along the skin: the beard's body and its
// soft edge) and, over them, fine cards: the strays and the length a groomed beard has past its trimmed body. v2.2's
// cards were the whole beard (5.8 mm wide, the tips lighter than the roots): they read as feathers and the mouth's
// clearing was a box. Now each card is 1.7-2.2 mm wide, its strands no lighter at the tip than along it, lying close on
// the shells (the droop), fewer of them, rooted only where the beard is full; and the mouth's clearing is the lips' own
// outline (mouthGap, a lens from corner to corner, the shells' too): no root in it or 1.5 mm round it, and a card that
// would reach into it is cut shorter (a moustache may hang 1.5 mm over the upper lip's edge, as a groomed one does) or
// dropped. Rules by construction: every spine point at least 1.2 mm off the skin, a card shorter toward the groom's edge.
//   GROOMS[style] { len (m), w (m), lift (rad), density (cards per cm2 of full beard), droop (tip toward the skin),
//                   shells { layers, depth (m) } }
export const GROOMS = {
  stubble: { len: 0.0026, w: 0.0016, lift: 0.5, density: 22, droop: 0.2, shells: null },
  boxed: { len: 0.0075, w: 0.0009, lift: 0.2, density: 8, droop: 0.92, shells: { layers: 4, depth: 0.0062 } },
  full: { len: 0.011, w: 0.0009, lift: 0.2, density: 7, droop: 0.94, shells: { layers: 5, depth: 0.0095 } },
  goatee: { len: 0.009, w: 0.0011, lift: 0.2, density: 13, droop: 0.92, shells: { layers: 4, depth: 0.0066 } },
  moustache: { len: 0.0068, w: 0.0009, lift: 0.12, density: 14, droop: 0.85, shells: { layers: 4, depth: 0.004 } },
  chinstrap: { len: 0.006, w: 0.001, lift: 0.26, density: 12, droop: 0.85, shells: { layers: 3, depth: 0.0045 } },
};
// the lips' outline for a beard (L { MOUTHY, EZ }): > 0 inside it (m, the distance in to its nearest edge), the upper
// line `over` m lower (a moustache's hang). A lens from corner to corner (2.8 cm either side): the top 3.5 mm over the
// parting at the middle, falling to it at the corners; the bottom 11.5 mm under the parting (the lower lip and the
// soft groove under it), rising to it at the corners
// (FC, talking faces: the lens ends 1.5 mm past the mouth's own corners (L.half, the sheet's mouth width: 19.5-23.2 mm),
// not at 3.1 cm for every mouth: past the corners it left bare skin in slots either side of the lips, the old boss's pale
// 'brackets' in every talking frame)
export const lensHalf = (L) => (L.half ?? 0.0212) + 0.0015;
export function mouthGap(L) {
  const { MOUTHY, EZ } = L, H = lensHalf(L), X = H + 0.0015;
  return (p, over = 0) => { const ax = Math.abs(p[0]); if (p[2] < EZ - 0.012 || ax > X) return -1;
    const t = Math.min(1, ax / H), top = MOUTHY + 0.0035 - 0.0045 * t * t - over, bot = MOUTHY - 0.0115 + 0.0078 * t * t;
    return Math.min(p[1] - bot, top - p[1], X - ax); };
}
// skin { P (bind positions), N (int8 normals), T (skin triangles), mask (per point 0..1) }; L { MOUTHY, EZ, EY };
// atlas: the cards' strip of the beard's texture (u from u0 to 1); returns { P, UV, src (root's nearest skin point),
// shade, idx, count, cut (cards shortened at the lips), dropped }
export function beardCards(skin, L, groom, seed = 1, atlas = { u0: 0 }) {
  // (G7b: atlas.tune overrides the groom's numbers for one person: a moustache's density and length by the sheet's)
  const G = { ...(GROOMS[groom] || GROOMS.boxed), ...(atlas.tune || {}) }, { P: bP, N: bN, T, mask } = skin, { MOUTHY, EZ } = L, gap = mouthGap(L), U0 = atlas.u0 || 0, XC = lensHalf(L) + 0.0065;
  let s0 = (seed * 2654435761) >>> 0; const rnd = () => ((s0 = (Math.imul(s0, 1664525) + 1013904223) >>> 0) / 4294967296);
  const nrm = (v) => { const l = Math.hypot(...v) || 1; return v.map((c) => c / l); }, cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  // (the growth by place: the cheeks down and a little forward; the lip's middle out and down; under the jaw down and back)
  const growth = (p, n) => { const sx = Math.sign(p[0]) || 1, ax = Math.abs(p[0]);
    if (p[1] > MOUTHY - 0.002 && ax < 0.034 && p[2] > EZ) return nrm([sx * (0.35 + 0.9 * sm(0.004, 0.026, ax)), -1, 0.15]);
    if (n[1] < -0.45) return nrm([sx * 0.1, -0.35, -1]);
    return nrm([sx * 0.12, -1, ax < 0.03 ? 0.15 : 0.04]); };
  // (the skin's points near the beard, for the stand-off check: a 1 cm grid)
  const cell = 0.01, Gd = new Map(), key = (x, y, z) => Math.floor(x / cell) + ',' + Math.floor(y / cell) + ',' + Math.floor(z / cell), used = new Set();
  for (let q = 0; q < T.length; q += 3) for (let e = 0; e < 3; e++) { const v = T[q + e]; if (used.has(v)) continue; used.add(v); const k = key(bP[v * 3], bP[v * 3 + 1], bP[v * 3 + 2]); (Gd.get(k) || Gd.set(k, []).get(k)).push(v); }
  const nearSkin = (p) => { const c = p.map((x) => Math.floor(x / cell)); let best = -1, bd = 1e9; for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) for (const v of Gd.get((c[0] + i) + ',' + (c[1] + j) + ',' + (c[2] + k)) || []) { const d = (bP[v * 3] - p[0]) ** 2 + (bP[v * 3 + 1] - p[1]) ** 2 + (bP[v * 3 + 2] - p[2]) ** 2; if (d < bd) { bd = d; best = v; } } return best; };
  const nOf = (v) => [bN[v * 3] / 127, bN[v * 3 + 1] / 127, bN[v * 3 + 2] / 127];
  const P = [], UV = [], src = [], shade = [], idx = []; let n = 0, cut = 0, dropped = 0;
  for (let q = 0; q < T.length; q += 3) {
    const t = [T[q], T[q + 1], T[q + 2]], m = (mask[t[0]] + mask[t[1]] + mask[t[2]]) / 3; if (m < 0.3) continue;
    const A = t.map((v) => [bP[v * 3], bP[v * 3 + 1], bP[v * 3 + 2]]), area = 0.5 * Math.hypot(...cross(A[1].map((c, k) => c - A[0][k]), A[2].map((c, k) => c - A[0][k]))) * 1e4;
    const want = area * G.density * sm(0.3, 0.75, m); const cnt = Math.floor(want) + (rnd() < want - Math.floor(want) ? 1 : 0);
    for (let c = 0; c < cnt; c++) {
      let a = rnd(), b = rnd(); if (a + b > 1) { a = 1 - a; b = 1 - b; } const w3 = [1 - a - b, a, b];
      const root = [0, 1, 2].map((k) => w3[0] * A[0][k] + w3[1] * A[1][k] + w3[2] * A[2][k]), mr = w3[0] * mask[t[0]] + w3[1] * mask[t[1]] + w3[2] * mask[t[2]]; if (mr < 0.28) continue;
      if (gap(root) > -0.0015) { dropped++; continue; }
      const nn = nrm([0, 1, 2].map((k) => w3[0] * nOf(t[0])[k] + w3[1] * nOf(t[1])[k] + w3[2] * nOf(t[2])[k]));
      const g = growth(root, nn); let tg = nrm(g.map((x, k) => x - nn[k] * dot(g, nn))); const side0 = nrm(cross(nn, tg));
      // (a little scatter in the direction, so the strands don't comb into stripes)
      const sc = (rnd() - 0.5) * 0.45; tg = nrm(tg.map((x, k) => x + side0[k] * sc));
      const side = nrm(cross(nn, tg)), lift = G.lift * (0.7 + 0.6 * rnd()), up = root[1] > MOUTHY - 0.002 && Math.abs(root[0]) < 0.034 && root[2] > EZ;
      let Ln = G.len * (0.6 + 0.6 * rnd()) * (0.4 + 0.6 * sm(0.3, 0.8, mr)), sp = null;
      // (the spine; cut shorter while it reaches into the lips' outline, then dropped)
      for (let tries = 0; tries < 3 && !sp; tries++, Ln *= 0.55) {
        const s = [root.map((x, k) => x + nn[k] * 0.0004)]; let bad = false;
        for (let k = 1; k <= 3; k++) { const th = lift * (1 - G.droop * (k - 1) / 2), d = nrm(tg.map((x, j) => x * Math.cos(th) + nn[j] * Math.sin(th))); const p = s[k - 1].map((x, j) => x + d[j] * Ln / 3);
          const sv = nearSkin(p); if (sv >= 0) { const ns = nOf(sv), off = dot(p.map((x, j) => x - bP[sv * 3 + j]), ns); if (off < 0.0012) for (let j = 0; j < 3; j++) p[j] += ns[j] * (0.0012 - off); }
          // (and a hair from over the parting never reaches under it by the mouth: open, it would hang in front of it)
          if (gap(p, up ? 0.0015 : 0) > 0 || (root[1] > MOUTHY && Math.abs(p[0]) < XC && p[1] < MOUTHY + 0.0012 && p[2] > EZ - 0.01) || (root[1] < MOUTHY && Math.abs(p[0]) < XC && p[1] > MOUTHY - 0.0012 && p[2] > EZ - 0.01)) { bad = true; break; } s.push(p); }
        if (!bad) sp = s; else cut++; }
      if (!sp) { dropped++; continue; }
      const col = Math.floor(rnd() * 8), u0 = U0 + (1 - U0) * (col / 8 + 0.004), u1 = U0 + (1 - U0) * ((col + 1) / 8 - 0.004), vo = rnd() < 0.5 ? 0 : 0.5, rv = nearSkin(root), base = P.length / 3;
      for (let k = 0; k <= 3; k++) { const hw = G.w * (1 - 0.55 * k / 3) / 2, v = k / 3; for (const sgn of [-1, 1]) { P.push(...sp[k].map((x, j) => x + side[j] * hw * sgn)); UV.push(sgn < 0 ? u0 : u1, vo + v * 0.48 + 0.01); src.push(rv); shade.push(0.62 + 0.26 * v); } }
      for (let k = 0; k < 3; k++) { const i0 = base + k * 2; idx.push(i0, i0 + 2, i0 + 1, i0 + 1, i0 + 2, i0 + 3); } // (wound to face out along the skin's normal: a double-sided card seen from the front is lit as the face is)
      n++; } }
  return { P: Float32Array.from(P), UV: Float32Array.from(UV), src: Int32Array.from(src), shade: Float32Array.from(shade), idx: Uint32Array.from(idx), count: n, cut, dropped };
}
// the strand atlas for the cards: W x H (a tall strip), 8 columns of ~34 fine strands each running down it (each card
// takes a half of a column's height: v 0 root to 1 tip), the roots' colour to the ramp's middle in the first third, then
// each strand its own shade of the middle (no light tips: v2.2's frosted feather look), a share of them grey or light;
// a strand's tip thins over its last eighth; RGBA, the gaps clear (their colour the nearest strand's, for the mips)
export function strandAtlas(W, H, ramp, grey = 0.15, seed = 3) {
  const img = new Uint8Array(W * H * 4); let s0 = seed >>> 0; const rnd = () => ((s0 = (Math.imul(s0, 1664525) + 1013904223) >>> 0) / 4294967296);
  const CW = W / 8, half = H / 2;
  // (a card is a lock of 4 strands, each about a sixth of the column across: thin lines on a 1 mm card vanish under the
  // alpha cut once the texture is mipped, a lock that covers 2/3 of its card stays)
  for (let c = 0; c < 8; c++) for (let h = 0; h < 2; h++) for (let k = 0; k < 4; k++) {
    const x0 = c * CW + CW * (0.2 + 0.2 * k) + (rnd() - 0.5) * CW * 0.08, len = 0.75 + 0.25 * rnd(), wv = (rnd() - 0.5) * CW * 0.12, ph = rnd() * 6, wd = CW * (0.075 + 0.025 * rnd()), isG = rnd() < grey, kk = 0.82 + 0.3 * rnd();
    const lite = isG ? ramp[2].map((x, j) => x * 0.92 + ramp[1][j] * 0.08) : ramp[1];
    for (let yy = 0; yy < half * len; yy++) { const v = yy / half, xc = x0 + Math.sin(v * 4 + ph) * wv * v, tip = 1 - 0.85 * sm(len - 0.3, len, v), t = sm(0, 0.33, v);
      const cc = [0, 1, 2].map((j) => (ramp[0][j] + (lite[j] - ramp[0][j]) * t) * kk), y = Math.floor(h * half + yy);
      for (let x = Math.floor(xc - wd - 1); x <= Math.ceil(xc + wd + 1); x++) { if (x < c * CW + 1 || x >= (c + 1) * CW - 1) continue; const cov = clamp(wd * tip - Math.abs(x - xc) + 0.5, 0, 1); if (cov <= 0) continue;
        const i = (y * W + x) * 4, al = Math.round(255 * cov); if (al <= img[i + 3]) continue; img[i] = clamp(Math.round(cc[0]), 0, 255); img[i + 1] = clamp(Math.round(cc[1]), 0, 255); img[i + 2] = clamp(Math.round(cc[2]), 0, 255); img[i + 3] = al; } } }
  for (let y = 0; y < H; y++) { let last = null; for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; if (img[i + 3]) last = [img[i], img[i + 1], img[i + 2]]; else if (last) { img[i] = last[0]; img[i + 1] = last[1]; img[i + 2] = last[2]; } } }
  return img;
}

/* ------------------------------------------------------------------ shoes -- */
// (forge v2.3, SH) work boots, sneakers and dress shoes are rigid objects round the foot, not shells: shoes.mjs
Object.assign(GARMENTS, SHOES);

/* ------------------------------------------------------- hood up, scarf -- */
// (forge v2.4, HD) the hood up: a fabric shell AROUND the head, not cut from it (v2.2's cut shell clung to the skull as a
// skullcap and the ears came through it as shards). Ring by ring from the neck's base to over the crown, round the head's
// axis: each ring the convex hull of the head, ears, neck and what is worn there at that height (the ears bridged), out
// by the hood's room (1.4 cm, more behind the head where a hood's slack sits), falling loose from the head's widest
// rings down to the neck (never tucking in faster than 45 cm per m: no neck skin through it, the throat closed under the
// chin), domed over the crown. The face's opening is a rounded oval from the hairline to under the chin, in front of the
// ears, clipped through the rings' triangles (a clean edge), with a lining 4 mm inside and a rolled edge joining them.
// Skinned to the head above the jaw, to the neck and shoulders under it (blended between)
function hoodUp(ctx, o) {
  const col = hexRGB(o.color, [70, 72, 78]), { bPos, nBody, cls, EY, EZ, NECKY, BI } = ctx, headI = BI('head');
  const pts = []; let yHT = -9, chinY = 9, cheek = 0;
  for (let v = 0; v < nBody; v++) { const x = bPos[v * 3], y = bPos[v * 3 + 1], z = bPos[v * 3 + 2];
    if (cls[v] === 5) { yHT = Math.max(yHT, y); if (z > EZ - 0.022 && Math.abs(x) < 0.015 && y < EY - 0.06) chinY = Math.min(chinY, y); if (z > EZ - 0.04 && y < EY + 0.02 && y > EY - 0.1) cheek = Math.max(cheek, Math.abs(x)); }
    if (cls[v] === 5 || ((cls[v] === 0 || cls[v] === 1) && y > NECKY - 0.07)) pts.push([x, y, z]); }
  const nz = ctx.jpos('neck01')[2];
  // (what is worn under it counts under the neck's base only: above it a pack top's own hood or collar is under the hood)
  for (const q of ctx.inner || []) if (q[1] > NECKY - 0.07 && q[1] < NECKY - 0.005 && Math.hypot(q[0], q[2] - nz) < 0.13) pts.push(q);
  const yBot = NECKY - 0.035, yTop = yHT + 0.024, dy = 0.004, NY = Math.ceil((yTop - yBot) / dy), NA = 128, ys = Array.from({ length: NY + 1 }, (_, k) => yTop - (k * (yTop - yBot)) / NY);
  // (each ring's axis: the middle of its slice front to back, smoothed down the rings)
  const czR = ys.map((y) => { let a = 9, b = -9; for (const p of pts) if (Math.abs(p[1] - y) < 0.008 && Math.hypot(p[0], p[2] - nz) < 0.16) { a = Math.min(a, p[2]); b = Math.max(b, p[2]); } return a < b ? (a + b) / 2 : null; });
  for (let k = 0; k <= NY; k++) if (czR[k] == null) czR[k] = czR.find((c) => c != null) ?? nz; for (let it = 0; it < 6; it++) for (let k = 1; k < NY; k++) czR[k] = (czR[k - 1] + 2 * czR[k] + czR[k + 1]) / 4;
  const ang = (j) => -Math.PI + (2 * Math.PI * j) / NA, R = ys.map(() => new Float32Array(NA)), H0 = ys.map(() => new Float32Array(NA));
  ys.forEach((y, k) => { const rMax = y < NECKY + 0.03 ? 0.1 : 0.16, sl = pts.filter((p) => Math.abs(p[1] - y) < 0.008 && Math.hypot(p[0], p[2] - czR[k]) < rMax).map((p) => [p[0], p[2]]), h = sl.length >= 3 ? hullRadii(sl, 0, czR[k], NA) : null;
    for (let j = 0; j < NA; j++) { const a = ang(j) + Math.PI / NA, back = Math.max(0, -Math.cos(a)), front = Math.max(0, Math.cos(a)), hv = h ? h[j] : 0; H0[k][j] = hv;
      // (the room: 2 cm, more behind the head (a hood's slack) and at the brow (the hood's edge stands off the forehead))
      R[k][j] = hv ? hv + 0.02 + 0.022 * back * sm(chinY, EY + 0.03, y) + 0.02 * Math.abs(Math.sin(a)) * sm(chinY - 0.03, EY, y) + 0.012 * front * sm(EY - 0.01, EY + 0.06, y) : 0; } });
  // (the dome over the crown: from 3.5 cm under the head's top, a quarter ellipse up to the hood's top)
  const kA = ys.findIndex((y) => y < yHT - 0.035);
  for (let k = 0; k < kA; k++) { const t = (ys[k] - ys[kA]) / (yTop - ys[kA]), e = Math.sqrt(Math.max(0, 1 - t * t)); for (let j = 0; j < NA; j++) R[k][j] = Math.max(R[kA][j] * e, H0[k][j] ? H0[k][j] + 0.012 : 0); }
  // (falling loose from the widest ring above, down to the neck's base)
  for (let k = kA + 1; k <= NY; k++) for (let j = 0; j < NA; j++) R[k][j] = Math.max(R[k][j], R[k - 1][j] - 0.45 * dy);
  // (under the neck's base the hood goes in under the top's neckline, onto the neck, where a hood is sewn in: its edge
  // hidden under the neckband instead of cutting through the shoulders' slope)
  { const bp = pts.filter((p, i) => i < pts.length && !(ctx.inner || []).includes(p)); ys.forEach((y, k) => { const t = sm(NECKY + 0.03, NECKY - 0.012, y); if (t <= 0) return;
      const sl = bp.filter((p) => Math.abs(p[1] - y) < 0.006 && Math.hypot(p[0], p[2] - czR[k]) < 0.12).map((p) => [p[0], p[2]]), h = sl.length >= 3 ? hullRadii(sl, 0, czR[k], NA) : null; if (!h) return;
      for (let j = 0; j < NA; j++) { R[k][j] = R[k][j] * (1 - t) + (h[j] + 0.005) * t; H0[k][j] = Math.min(H0[k][j] || 9, h[j]); } }); }
  // (the rings round the neck's base smoothed round (the shoulders' slice is uneven): it lies on them as one roll)
  for (let k = 0; k <= NY; k++) { const n = Math.round(16 * sm(NECKY + 0.07, NECKY - 0.005, ys[k])); for (let it = 0; it < n; it++) { const c0 = Float32Array.from(R[k]); for (let j = 0; j < NA; j++) R[k][j] = Math.max((c0[(j + NA - 1) % NA] + 2 * c0[j] + c0[(j + 1) % NA]) / 4, H0[k][j] ? H0[k][j] + (ys[k] < NECKY + 0.04 ? 0.004 : 0.008) : 0); } }
  for (let it = 0; it < 6; it++) for (let k = 1; k < NY; k++) { const c0 = R.map((r) => Float32Array.from(r)); for (let j = 0; j < NA; j++) { const m = (c0[k - 1][j] + c0[k + 1][j] + c0[k][(j + 1) % NA] + c0[k][(j + NA - 1) % NA] + 4 * c0[k][j]) / 8; R[k][j] = Math.max(m, H0[k][j] ? H0[k][j] + (ys[k] < NECKY + 0.04 ? 0.004 : 0.01) : 0); } }
  // (the grid: its points, weights and the opening's field: > 0 cloth)
  // (the opening: a rounded oval over the face from the hairline to the jaw, then its two edges running in to meet at the
  // throat over the neckline, as a hoodie's hood is sewn)
  const W = Math.min(0.092, cheek + 0.026), yo1 = EY + 0.062, yJ = chinY + 0.01, yc = yJ, Hh = yo1 - yJ, yV = yBot;
  const fOpen = (x, y, a) => { if (Math.cos(a) < 0.05) return 0.05; if (y < yJ) { const w = 0.008 + (W - 0.008) * Math.pow(sm(yV, yJ, y), 0.6); return (Math.abs(x) / w - 1) * 0.06; }
    const se = Math.pow(Math.abs(x) / W, 2.6) + Math.pow((y - yc) / Hh, 2.6); return (Math.pow(se, 1 / 2.6) - 1) * 0.06; };
  // (under the head's share the nearest skin of the neck and shoulders (the neck's own points too, under the jaw), so the
  // part tucked in at the neckline turns with the neck as the skin does)
  const NV = []; for (let v = 0; v < nBody; v++) if ((cls[v] === 0 || cls[v] === 1 || cls[v] === 5) && bPos[v * 3 + 1] < chinY - 0.012 && bPos[v * 3 + 1] > NECKY - 0.1) NV.push(v);
  const nearN = (p) => { let b = -1, bd = 1e9; for (const v of NV) { const d = (bPos[v * 3] - p[0]) ** 2 + (bPos[v * 3 + 1] - p[1]) ** 2 + (bPos[v * 3 + 2] - p[2]) ** 2; if (d < bd) { bd = d; b = v; } } return b; };
  const nb = (p) => { const q = nearN(p); return q >= 0 ? [0, 1, 2, 3].map((k) => [ctx.si[q * 4 + k], ctx.sw[q * 4 + k] / 255]) : [[headI, 1]]; };
  const GP = [], GUV = [], GW = [], GF = [];
  ys.forEach((y, k) => { for (let j = 0; j <= NA; j++) { const a = ang(j % NA) + Math.PI / NA, r = R[k][j % NA], p = [Math.sin(a) * r, y, czR[k] + Math.cos(a) * r]; GP.push(p); GUV.push([j / NA, k / NY]);
    const hs = sm(yBot + 0.02, EY - 0.035, y), m = new Map(); if (hs > 0) m.set(headI, hs); if (hs < 1) for (const [jj, w] of nb(p)) if (w > 0) m.set(jj, (m.get(jj) || 0) + w * (1 - hs)); GW.push(m);
    GF.push(Math.min(fOpen(p[0], y, a), y - yBot + 0.0001)); } });
  // (clipped at the opening's zero line, as a shell's edges are)
  const P = [], UV = [], WM = [], F = [], idx = [], vmap = new Map();
  const vert = (i) => { if (vmap.has(i)) return vmap.get(i); P.push(...GP[i]); UV.push(...GUV[i]); WM.push(GW[i]); F.push(GF[i]); vmap.set(i, P.length / 3 - 1); return P.length / 3 - 1; };
  const edge = (a, b) => { const key = a < b ? a + ':' + b : b + ':' + a; if (vmap.has(key)) return vmap.get(key); const t = GF[a] / (GF[a] - GF[b]), L = (x, y) => x + (y - x) * t, m = new Map();
    for (const [j, w] of GW[a]) m.set(j, (m.get(j) || 0) + w * (1 - t)); for (const [j, w] of GW[b]) m.set(j, (m.get(j) || 0) + w * t);
    P.push(...[0, 1, 2].map((c) => L(GP[a][c], GP[b][c]))); UV.push(L(GUV[a][0], GUV[b][0]), L(GUV[a][1], GUV[b][1])); WM.push(m); F.push(0); vmap.set(key, P.length / 3 - 1); return P.length / 3 - 1; };
  const tri = (t) => { const sg = t.map((i) => GF[i] >= 0), n = sg.filter(Boolean).length; if (!n) return; if (n === 3) { idx.push(vert(t[0]), vert(t[1]), vert(t[2])); return; }
    for (let r = 0; r < 3; r++) { const a = t[r], b = t[(r + 1) % 3], c = t[(r + 2) % 3]; if (n === 1 && sg[r]) { idx.push(vert(a), edge(a, b), edge(a, c)); return; } if (n === 2 && !sg[(r + 2) % 3]) { const bc = edge(b, c), ca = edge(c, a); idx.push(vert(a), vert(b), bc, vert(a), bc, ca); return; } } };
  const RW = NA + 1; for (let k = 0; k < NY; k++) for (let j = 0; j < NA; j++) { const a = k * RW + j, b = a + 1, c = a + RW, d = c + 1; tri([a, c, b]); tri([b, c, d]); }
  // (the lining 4 mm inside, wound the other way; a rolled edge between the two round every open edge)
  const n0 = P.length / 3, N = weldNormals(Float32Array.from(P), Uint32Array.from(idx)), key = (i) => Math.round(P[i * 3] * 2e4) + ',' + Math.round(P[i * 3 + 1] * 2e4) + ',' + Math.round(P[i * 3 + 2] * 2e4);
  const wid = new Map(), wOf = new Int32Array(n0); for (let i = 0; i < n0; i++) { const kk = key(i); if (!wid.has(kk)) wid.set(kk, wid.size); wOf[i] = wid.get(kk); }
  const ec = new Map(), adj = new Map(); for (let q = 0; q < idx.length; q += 3) for (let e = 0; e < 3; e++) { const a = idx[q + e], b = idx[q + (e + 1) % 3], wa = wOf[a], wb = wOf[b], kk = wa < wb ? wa + ',' + wb : wb + ',' + wa; const r = ec.get(kk) || { n: 0, a, b }; r.n++; ec.set(kk, r); (adj.get(wa) || adj.set(wa, new Set()).get(wa)).add(b); (adj.get(wb) || adj.set(wb, new Set()).get(wb)).add(a); }
  for (let i = 0; i < n0; i++) { P.push(P[i * 3] - N[i * 3] * 0.004, P[i * 3 + 1] - N[i * 3 + 1] * 0.004, P[i * 3 + 2] - N[i * 3 + 2] * 0.004); UV.push(UV[i * 2], UV[i * 2 + 1]); WM.push(WM[i]); F.push(F[i]); }
  const nIdx = idx.length; for (let q = 0; q < nIdx; q += 3) idx.push(idx[q] + n0, idx[q + 2] + n0, idx[q + 1] + n0);
  // (the roll's direction at an edge point: across the edge (its two edge neighbours' line x the normal), away from the cloth)
  const bn = new Map(); for (const { n, a, b } of ec.values()) if (n === 1) { (bn.get(a) || bn.set(a, []).get(a)).push(b); (bn.get(b) || bn.set(b, []).get(b)).push(a); }
  const mid = new Map(), midOf = (i) => { if (mid.has(i)) return mid.get(i); const nbs = [...(adj.get(wOf[i]) || [])], m = [0, 0, 0]; for (const o of nbs) for (let c = 0; c < 3; c++) m[c] += P[o * 3 + c] / nbs.length;
      const e2 = bn.get(i) || [], tg = e2.length >= 2 ? [0, 1, 2].map((c) => P[e2[1] * 3 + c] - P[e2[0] * 3 + c]) : [0, 1, 2].map((c) => P[(e2[0] ?? i) * 3 + c] - P[i * 3 + c]);
      let d = [tg[1] * N[i * 3 + 2] - tg[2] * N[i * 3 + 1], tg[2] * N[i * 3] - tg[0] * N[i * 3 + 2], tg[0] * N[i * 3 + 1] - tg[1] * N[i * 3]]; if (d[0] * (P[i * 3] - m[0]) + d[1] * (P[i * 3 + 1] - m[1]) + d[2] * (P[i * 3 + 2] - m[2]) < 0) d = d.map((x) => -x); const l = Math.hypot(...d) || 1;
      P.push(...[0, 1, 2].map((c) => P[i * 3 + c] - N[i * 3 + c] * 0.002 + (d[c] / l) * 0.0025)); UV.push(UV[i * 2], UV[i * 2 + 1]); WM.push(WM[i]); F.push(0); mid.set(i, P.length / 3 - 1); return P.length / 3 - 1; };
  let rimN = 0; for (const { n, a, b } of ec.values()) { if (n !== 1) continue; const ma = midOf(a), mb = midOf(b); idx.push(a, b, mb, a, mb, ma, ma, mb, b + n0, ma, b + n0, a + n0); rimN++; }
  const JI = [], WT = []; for (const m of WM) { const e = [...m.entries()].sort((x, y) => y[1] - x[1]).slice(0, 4), s0 = e.reduce((x, y) => x + y[1], 0) || 1; while (e.length < 4) e.push([0, 0]); for (const [j, w] of e) { JI.push(j); WT.push(w / s0); } }
  const nv = P.length / 3, mesh = { P: Float32Array.from(P), UV: Float32Array.from(UV), JI: Int32Array.from(JI), WT: Float32Array.from(WT), F: Float32Array.from(F), C: new Uint8Array(nv), AO: new Float32Array(nv), idx: Uint32Array.from(idx), nv };
  ctx.log?.(`hood-up: EY ${EY.toFixed(3)} chin ${chinY.toFixed(3)} neck ${NECKY.toFixed(3)} yJ ${yJ.toFixed(3)} yV ${yV.toFixed(3)} top ${yHT.toFixed(3)}`); ctx.log?.(`hood-up: ${NY + 1} rings x ${NA}, opening ${(2 * W * 100).toFixed(1)} cm wide, ${((yo1 - yV) * 100).toFixed(1)} cm tall, ${rimN} edge segments rolled, ${nv} points`);
  // (the fleece; the edge's roll a shade darker, a seam over the crown, front to back)
  const paint = (p, n, f) => { let k = CLOTH.fleece(p); if (f < 0.006) k *= f < 0.0015 ? 0.78 : 1.04; if (Math.abs(p[0]) < 0.0018 && p[1] > EY - 0.02) k *= 0.72; if (Math.abs(Math.abs(p[0]) - 0.004) < 0.0007 && p[1] > EY) k *= 0.85; return shade(col, k); };
  worn(ctx, 'hood-up', mesh);
  return { parts: [{ name: 'hood-up', mesh, S: 1024, base: col, paint }], extras: [], shell: { hide: new Set(), P: mesh.P, skirt: null }, field: () => -1 };
}
// (forge v2.4, HD) a knit scarf: wound round the neck over whatever is worn there (a coat's collar included) as one soft
// roll (an ellipse 3.6 cm tall, 2.4 cm deep, fuller at the back), round the outline of what it covers, smoothed so it
// never wobbles; its two ends hang down the front from under the roll, a knit's thickness (8 mm, with sides), lying 1 cm
// off the outer layer by (x, y), one a little longer and crossing slightly, finished in a fringe of tassels. The roll is
// skinned to the neck as the skin inside it (it turns with the neck, as a collar does now), the ends to the chest
function scarf(ctx, o) {
  const col = hexRGB(o.color, [150, 40, 44]), acc = hexRGB(o.accent, null), nz = ctx.jpos('neck01')[2], y0 = ctx.NECKY - 0.006;
  const pts = [...(ctx.inner || [])]; for (let v = 0; v < ctx.nBody; v++) if (ctx.cls[v] === 0 || ctx.cls[v] === 5 || ctx.cls[v] === 1) pts.push([ctx.bPos[v * 3], ctx.bPos[v * 3 + 1], ctx.bPos[v * 3 + 2]]);
  // (the outline round the neck's axis over the roll's height (what is worn there and the neck), smoothed round)
  const NB = 64, rN = new Float32Array(NB); for (const q of pts) { if (Math.abs(q[1] - y0) > 0.02) continue; const a = Math.atan2(q[0], q[2] - nz), r = Math.hypot(q[0], q[2] - nz); if (r > 0.105) continue; const b = ((Math.floor(((a + Math.PI) / (2 * Math.PI)) * NB) % NB) + NB) % NB; rN[b] = Math.max(rN[b], r); }
  for (let i = 0; i < NB; i++) if (!rN[i]) rN[i] = 0.065;
  for (let it = 0; it < 8; it++) { const c0 = Float32Array.from(rN); for (let i = 0; i < NB; i++) rN[i] = Math.max(c0[i], (c0[(i + NB - 1) % NB] + c0[(i + 1) % NB]) / 2); }
  for (let it = 0; it < 4; it++) { const c0 = Float32Array.from(rN); for (let i = 0; i < NB; i++) rN[i] = Math.max(c0[i] - 0.002, (c0[(i + NB - 1) % NB] + 2 * c0[i] + c0[(i + 1) % NB]) / 4); }
  const rAt = (a) => { const f = ((a + Math.PI) / (2 * Math.PI)) * NB - 0.5, i0 = ((Math.floor(f) % NB) + NB) % NB, t = f - Math.floor(f); return rN[i0] * (1 - t) + rN[(i0 + 1) % NB] * t; };
  // (the neck's own skin outline just over the roll's middle: the roll's weights are read there, so it moves as the neck)
  const sk = []; for (let v = 0; v < ctx.nBody; v++) { const y = ctx.bPos[v * 3 + 1]; if (Math.abs(y - (y0 + 0.012)) < 0.008 && Math.hypot(ctx.bPos[v * 3], ctx.bPos[v * 3 + 2] - nz) < 0.085) sk.push([ctx.bPos[v * 3], ctx.bPos[v * 3 + 2]]); }
  const skR = hullRadii(sk, 0, nz, NB), skAt = (a) => (skR ? skR[((Math.floor(((a + Math.PI) / (2 * Math.PI)) * NB) % NB) + NB) % NB] : 0.055);
  // (the outer layer's front depth by (x, y): its points in 1.5 cm cells, the frontmost; read with the neighbours' max)
  const FC = 0.015, front = new Map(), fk = (x, y) => Math.floor(x / FC) + ',' + Math.floor(y / FC); for (const q of pts) { if (q[2] < nz) continue; const k = fk(q[0], q[1]); front.set(k, Math.max(front.get(k) ?? -9, q[2])); }
  const bodyF = new Map(); for (let v = 0; v < ctx.nBody; v++) if (ctx.cls[v] === 0 && ctx.bPos[v * 3 + 2] > nz) { const k = fk(ctx.bPos[v * 3], ctx.bPos[v * 3 + 1]); if ((bodyF.get(k)?.[2] ?? -9) < ctx.bPos[v * 3 + 2]) bodyF.set(k, [ctx.bPos[v * 3], ctx.bPos[v * 3 + 1], ctx.bPos[v * 3 + 2]]); }
  const zAt = (x, y) => { let z = -9; for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) z = Math.max(z, front.get((Math.floor(x / FC) + i) + ',' + (Math.floor(y / FC) + j)) ?? -9); return z; };
  const P = [], UV = [], JI = [], WT = [], idx = [];
  const put = (p, uv, w) => { P.push(...p); UV.push(...uv); for (const [j, x] of w) { JI.push(j); WT.push(x); } return P.length / 3 - 1; };
  const wq = (q) => (q >= 0 ? [0, 1, 2, 3].map((k) => [ctx.si[q * 4 + k], ctx.sw[q * 4 + k] / 255]) : [[0, 1], [0, 0], [0, 0], [0, 0]]);
  // (the roll: u round it in [0, 1], v round its section in [0, 0.3])
  const NA = 96, NS = 14;
  for (let i = 0; i <= NA; i++) { const a = -Math.PI + (2 * Math.PI * i) / NA, back = 0.5 - 0.5 * Math.cos(a), dpt = 0.013 + 0.003 * back, hh = 0.019 + 0.002 * back, side = Math.abs(Math.sin(a)), rc = rAt(a) + dpt + 0.006 + 0.006 * side * side;
    for (let j = 0; j <= NS; j++) { const b = (j / NS) * 2 * Math.PI, rr = rc + Math.cos(b) * dpt, p = [Math.sin(a) * rr, y0 + 0.004 * back - 0.014 * side * side + Math.sin(b) * (hh + 0.004 * side), nz + Math.cos(a) * rr];
      put(p, [i / NA, (j / NS) * 0.3], (wornNearest(ctx, [Math.sin(a) * rAt(a), p[1], nz + Math.cos(a) * rAt(a)], 0.05) || wq(nearestNeck(ctx, [Math.sin(a) * skAt(a), y0 + 0.012, nz + Math.cos(a) * skAt(a)])))); } }
  for (let i = 0; i < NA; i++) for (let j = 0; j < NS; j++) { const a = i * (NS + 1) + j, b = a + NS + 1; idx.push(a, a + 1, b, a + 1, b + 1, b); }
  // (the ends: a box section 12 cm wide and 8 mm thick, from under the roll's front down; v in [0.32, 0.64] and [0.68, 1])
  const T = 0.008, ends = [[0.026, 0.4, 1, 0.32], [-0.024, 0.33, -1, 0.68]], rollFront = (x) => nz + Math.sqrt(Math.max(0, (rAt(0) + 0.029) ** 2 - x * x));
  for (const [x0, len, sx, v0] of ends) { const NL = 30, NW = 8, W0 = 0.095, rows = [];
    for (let i = 0; i <= NL; i++) { const t = i / NL, y = y0 - 0.014 - len * t, w = W0 * (1 - 0.08 * t), xc = x0 + sx * 0.014 * Math.sin(t * Math.PI * 0.5), row = [];
      // (its back face 1 cm off the layer under it, the longer end over the other)
      let zb = -9; for (let j = 0; j <= NW; j++) zb = Math.max(zb, zAt(xc + (j / NW - 0.5) * w, y)); if (zb < -1) zb = nz + 0.1; zb += 0.013 + (sx > 0 ? T + 0.002 : 0);
      // (its top tucked under the roll's front, the roll over it)
      zb = Math.max(zb, (rollFront(xc) - 0.012 - T) * (1 - sm(0.0, 0.12, t)) - 9 * sm(0.0, 0.12, t));
      for (let j = 0; j <= NW; j++) { const x = xc + (j / NW - 0.5) * w, bf = bodyF.get(fk(x, y)), wb = wornNearest(ctx, [x, y, zb - 0.012], 0.025) || wq(nearestBody(ctx, bf ? [x, y, bf[2]] : [x, y, zb - 0.03])), cup = 0.004 * Math.cos((j / NW - 0.5) * Math.PI);
        row.push([put([x, y, zb + cup], [j / NW, v0 + t * 0.3], wb), put([x, y, zb + cup + T], [j / NW, v0 + t * 0.3], wb)]); }
      rows.push(row); }
    for (let i = 0; i < NL; i++) for (let j = 0; j < NW; j++) { const A = rows[i][j], B = rows[i][j + 1], C = rows[i + 1][j], D = rows[i + 1][j + 1];
      idx.push(A[1], C[1], B[1], B[1], C[1], D[1]); idx.push(A[0], B[0], C[0], B[0], D[0], C[0]); }
    for (let i = 0; i < NL; i++) for (const j of [0, NW]) { const A = rows[i][j], C = rows[i + 1][j]; idx.push(A[0], A[1], C[0], A[1], C[1], C[0]); }
    // (the fringe: tassels 4.5 cm long hanging from the bottom edge, each a thin double-sided strip)
    const last = rows[NL]; for (let j = 0; j <= NW; j++) { const [a0, a1] = last[j], px = P[a0 * 3], py = P[a0 * 3 + 1], pz = P[a0 * 3 + 2] + T / 2;
      for (const dx of [-0.004, 0.004]) { const L = 0.04 + 0.008 * Math.sin(j * 2.3 + dx * 900), wb = [[JI[a0 * 4], WT[a0 * 4]], [JI[a0 * 4 + 1], WT[a0 * 4 + 1]], [JI[a0 * 4 + 2], WT[a0 * 4 + 2]], [JI[a0 * 4 + 3], WT[a0 * 4 + 3]]];
        const b = [put([px + dx - 0.0018, py + 0.004, pz], [0.5, v0 + 0.3], wb), put([px + dx + 0.0018, py + 0.004, pz], [0.5, v0 + 0.3], wb), put([px + dx - 0.0012, py - L, pz + 0.002], [0.5, v0 + 0.31], wb), put([px + dx + 0.0012, py - L, pz + 0.002], [0.5, v0 + 0.31], wb)];
        idx.push(b[0], b[2], b[1], b[1], b[2], b[3]); } } }
  const mesh = { P: Float32Array.from(P), UV: Float32Array.from(UV), JI: Int32Array.from(JI), WT: Float32Array.from(WT), idx: Uint32Array.from(idx) };
  ctx.log?.(`scarf: roll at ${y0.toFixed(3)} round r ${Math.min(...rN).toFixed(3)}-${Math.max(...rN).toFixed(3)}, ${P.length / 3} points`);
  // (the knit: rib cords along it (round the roll, down the ends), stripes across the ends in the accent, the fringe darker)
  const paint = (p, n, f, c, ao, uv) => { const v = uv[1], end = v > 0.31, t = end ? ((v - (v > 0.66 ? 0.68 : 0.32)) / 0.3) : 0, cord = end ? uv[0] * 22 : uv[0] * 140, k = 0.8 + 0.2 * Math.pow(Math.abs(Math.sin(cord * Math.PI)), 0.6);
    const st = acc && end && t > 0.62 && t < 0.97 && Math.floor((t - 0.62) / 0.07) % 2 === 0;
    return shade(st ? acc : col, k * (end && t > 0.995 ? 0.8 : 1) * (0.93 + 0.07 * fbm(p, 0.004))); };
  return { parts: [], extras: [{ name: 'scarf', mesh, S: 1024, base: col, rough: 0.95, paint }], shell: { hide: new Set(), P: mesh.P, skirt: null }, field: () => -1 };
}
GARMENTS['hood-up'] = (ctx, o) => hoodUp(ctx, o);
GARMENTS.scarf = (ctx, o) => scarf(ctx, o);
