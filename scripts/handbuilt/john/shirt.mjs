// Hand-built John, the shirt and trousers (the forge's suit base: MakeHuman's elegantsuit01 shirt, tie and trousers under
// the library's jacket). He is in smart-casual for a bank meeting, so:
//  tieFlat   the tie's points (their texel in the tie's uv rectangle and the sheet's dark tie colour) laid back onto the
//            shirt front (each to the shirt's depth under it, from the nearest shirt points): no knot, no tie
//  shirt     the shirt (collar, front, cuffs) a soft light-blue oxford (no white wedge: the collar's white was the
//            brightest thing on him in daylight), a fine weave, a placket line with two buttons down the middle, and an
//            open collar: the top button undone, a V of his neck's skin under the collar's front with a soft shadow
//  trousers  the suit's trousers repainted as chinos (taupe, their folds kept), so jacket and trousers do not read as a suit
import { prim, matOf, rgba, setWebp, raster, sm, h3, fbm, clamp } from '../young-hero/glb.mjs';
const TIE = [350, 60, 446, 206];
export async function shirtPass(doc, K = {}) {
  K = { patch: [600 / 1024, 300 / 1024], shirt: [150, 168, 192], skin: [118, 84, 66], chino: [104, 95, 82], jacket: [46, 49, 54], vDepth: 0.032, vHalf: 0.02, flat: 1, ...K };
  const p = prim(doc, 'clothes')[0], P = p.getAttribute('POSITION'), a = P.getArray().slice(), uv = p.getAttribute('TEXCOORD_0').getArray(), I = p.getIndices().getArray();
  const mat = matOf(doc, 'clothes'), tex = mat.getBaseColorTexture(), { data, w, h } = await rgba(tex), k = w / 1024;
  const L = (i) => (data[i * 4] + data[i * 4 + 1] + data[i * 4 + 2]) / 3, sat = (i) => Math.max(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]) - Math.min(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
  const red = (i) => data[i * 4] > data[i * 4 + 2] + 25 && data[i * 4] > data[i * 4 + 1] + 20;
  const inTie = (tx, ty) => tx >= TIE[0] * k && tx < TIE[2] * k && ty >= TIE[1] * k && ty < TIE[3] * k;
  const texOf = (v) => [Math.min(w - 1, Math.max(0, Math.floor(uv[v * 2] * w))), Math.min(h - 1, Math.max(0, Math.floor(uv[v * 2 + 1] * h)))];
  // (the suit's uv islands overlap there: a few of the jacket's own triangles (behind the shoulder, the upper arm) map
  // into the tie's rectangle, so they wore the tie's red (later the open V's skin) as dark red-brown flecks on the jacket.
  // Their points' uvs moved onto a plain patch of the jacket's cloth)
  { const far = (v) => Math.abs(a[v * 3]) > 0.07 || a[v * 3 + 2] < 0.04 || a[v * 3 + 1] < 1.3;
    const U = p.getAttribute('TEXCOORD_0'), ua = U.getArray().slice(), moved = new Set();
    const lightT = (v) => { const [tx, ty] = texOf(v), i = ty * w + tx; return L(i) > 100 && sat(i) < 45; }, cuff = (v) => a[v * 3 + 1] < 1.02 && Math.abs(a[v * 3]) > 0.17;
    for (let t = 0; t < I.length; t += 3) { const vs = [I[t], I[t + 1], I[t + 2]]; if (!vs.every((v) => { const [tx, ty] = texOf(v); return (inTie(tx, ty) || (lightT(v) && a[v * 3 + 1] < 1.42)) && far(v) && !cuff(v); })) continue; for (const v of vs) moved.add(v); }
    for (const v of moved) { ua[v * 2] = K.patch[0]; ua[v * 2 + 1] = K.patch[1]; }
    U.setArray(ua); console.log('jacket points off the tie\'s and the shirt\'s uvs', moved.size); }
  // the tie's points: in the rectangle and red (the base sheet's tie is #5A1E24)
  const verts = [...new Set(I)], tie = new Set(), shirtV = [];
  for (const v of verts) { const [tx, ty] = texOf(v), i = ty * w + tx; if (inTie(tx, ty) && red(i)) tie.add(v); else if (a[v * 3 + 2] > 0.03 && Math.abs(a[v * 3]) < 0.12 && a[v * 3 + 1] > 1.2) shirtV.push(v); }
  // (the tie's own points also sit at the knot over the collar: every point within 3 mm of a tie point that is in the
  // rectangle counts too)
  if (K.flat) { let n = 0; for (const v of tie) { const x = a[v * 3], y = a[v * 3 + 1];
      let best = [], bd = []; for (const s of shirtV) { if (tie.has(s)) continue; const d = Math.hypot(a[s * 3] - x, a[s * 3 + 1] - y); if (bd.length < 4 || d < bd[3]) { bd.push(d); best.push(s); const o = bd.map((q, j) => [q, best[j]]).sort((u, v2) => u[0] - v2[0]).slice(0, 4); bd = o.map((q) => q[0]); best = o.map((q) => q[1]); } }
      if (!best.length) continue; let zs = 0, ws = 0; best.forEach((s, j) => { const ww = 1 / (bd[j] + 0.002); zs += a[s * 3 + 2] * ww; ws += ww; });
      const zt = zs / ws + 0.002; if (a[v * 3 + 2] > zt) { a[v * 3 + 2] = zt; n++; } }
    P.setArray(a); console.log('tie points laid flat', n, 'of', tie.size); }
  // the shirt's texels: the light ones (collar, cuffs, the front in the tie's rectangle) and the tie's
  const shirtT = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; if ((L(i) > 110 && sat(i) < 45) || (inTie(x, y) && (red(i) || L(i) > 70))) shirtT[i] = 1; }
  // (the collar's saw edge: dark texels within 3 px of the shirt, inside the clothes' islands near the collar, the shirt's)
  const cov = new Uint8Array(w * h), pos = new Float32Array(w * h * 3).fill(NaN);
  raster(I, (v) => [uv[v * 2] * w, uv[v * 2 + 1] * h], w, (x, y, l1, l2, l3, A, B, C) => { const i = y * w + x; cov[i] = 1; for (let c = 0; c < 3; c++) pos[i * 3 + c] = l1 * a[A * 3 + c] + l2 * a[B * 3 + c] + l3 * a[C * 3 + c]; }, 0.04);
  const grow = Uint8Array.from(shirtT); for (let y = 3; y < 250 * k; y++) for (let x = 320 * k; x < 530 * k; x++) { const i = y * w + x; if (shirtT[i] || !cov[i]) continue; let near = false; for (let dy = -3; dy <= 3 && !near; dy++) for (let dx = -3; dx <= 3; dx++) if (shirtT[(y + dy) * w + x + dx]) { near = true; break; } if (near) grow[i] = 1; }
  // the open V: the collar's front top (the highest shirt point near the middle, in front)
  let ytop = 0; for (const v of verts) if (!tie.has(v) && Math.abs(a[v * 3]) < 0.012 && a[v * 3 + 2] > 0.05) { const [tx, ty] = texOf(v); if (shirtT[ty * w + tx]) ytop = Math.max(ytop, a[v * 3 + 1]); }
  console.log('collar front top', ytop.toFixed(3));
  let ns = 0, nv = 0;
  for (let i = 0; i < w * h; i++) { if (!grow[i]) continue; const x = i % w, y = (i / w) | 0, X = pos[i * 3], Y = pos[i * 3 + 1], Z = pos[i * 3 + 2];
    const l = clamp(L(i) / 200, 0.55, 1.12), sh = shirtT[i] && !(inTie(x, y) && red(i)) ? 0.86 + 0.18 * l : 1.0;
    const weave = 1 + 0.035 * (((x + y) % 2) ? 1 : -1) * (0.5 + h3(x >> 1, y >> 1, 3)) + 0.02 * (fbm(x / w, y / h, 0.3, 90) - 0.5);
    let c = K.shirt.map((q) => q * sh * weave);
    if (!Number.isNaN(X) && Z > 0.03) {
      // placket: a slightly darker band 1.2 cm wide down the middle with a stitched edge, buttons every 8 cm
      const ax = Math.abs(X), pl = sm(0.0075, 0.006, ax), edge = Math.exp(-(((ax - 0.0065) / 0.0006) ** 2));
      c = c.map((q) => q * (1 - 0.05 * pl - 0.12 * edge));
      const by = ((ytop - K.vDepth - 0.012 - Y) % 0.085 + 0.085) % 0.085, bt = Math.hypot(X, Math.min(by, 0.085 - by)) < 0.0045 && Y < ytop - K.vDepth ? 1 : 0;
      if (bt) c = [214, 214, 210].map((q) => q * (0.85 + 0.15 * l));
      // the open V of skin: from the collar's top down vDepth, half-width vHalf at the top to 0
      const t = (ytop - Y) / K.vDepth, half = K.vHalf * (1 - t) ** 0.9;
      if (t > -0.1 && t < 1) { const vin = sm(half + 0.002, half - 0.002, ax) * sm(-0.1, 0.02, t);
        if (vin > 0) { const sk = K.skin.map((q, j) => q * (0.84 + 0.16 * (1 - t)) * (1 - 0.18 * Math.exp(-(((half - ax) / 0.004) ** 2)))); c = c.map((q, j) => q * (1 - vin) + sk[j] * vin); nv++; } }
    }
    for (let j = 0; j < 3; j++) data[i * 4 + j] = Math.round(clamp(c[j], 0, 255)); ns++; }
  // (stray tie-red texels outside the tie's rectangle (the base's red paint caught a few jacket texels: red specks on
  // the back and shoulder in daylight) to the jacket's charcoal at their own lightness)
  let nr = 0; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; if (inTie(x, y) || !red(i)) continue; const l = clamp(L(i) / 60, 0.5, 1.6); for (let j = 0; j < 3; j++) data[i * 4 + j] = Math.round(K.jacket[j] * l); nr++; }
  console.log('stray red texels', nr);
  // trousers: the lower half's panels (not the shoes' island at the right)
  let nt = 0; const tl = []; for (let y = Math.round(480 * k); y < h; y++) for (let x = 0; x < Math.round(760 * k); x++) { const i = y * w + x; if (!cov[i] || shirtT[i]) continue; tl.push(L(i)); }
  const mL = tl.reduce((s, q) => s + q, 0) / Math.max(1, tl.length);
  for (let y = Math.round(480 * k); y < h; y++) for (let x = 0; x < Math.round(760 * k); x++) { const i = y * w + x; if (shirtT[i]) continue; const r = clamp(L(i) / mL, 0.35, 1.5), r2 = 1 + (r - 1) * 0.75, gr = 1 + 0.03 * (h3(x, y, 9) - 0.5);
    for (let j = 0; j < 3; j++) data[i * 4 + j] = Math.round(clamp(K.chino[j] * r2 * gr, 0, 255)); nt++; }
  // (the jacket's back vent: its edge texels (the uv island's border there) bled the chinos' tan in from the trouser
  // panels below, a light slit up the back: the vent's texels and 3 px round them the jacket's charcoal)
  let nvt = 0; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x, X = pos[i * 3], Y = pos[i * 3 + 1], Z = pos[i * 3 + 2]; if (Number.isNaN(X) || Z > -0.03 || Math.abs(X) > 0.03 || Y < 0.85 || Y > 1.2) continue;
    const L0 = clamp(L(i) / 50, 0.6, 1.4); if (L(i) > 70 || Math.abs(X) < 0.012) for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const j = (y + dy) * w + x + dx; if (j < 0 || j >= w * h || (cov[j] && !(Math.abs(X) < 0.012))) continue; for (let c2 = 0; c2 < 3; c2++) data[j * 4 + c2] = Math.round(K.jacket[c2] * (cov[j] ? 1 : 0.9)); nvt++; } }
  console.log('vent texels', nvt);
  await setWebp(tex, data, w, h, 92);
  // the tie's normal flat (its stripe ridges), the shirt a little rough
  const ntx = mat.getNormalTexture(); if (ntx) { const { data: nd, w: nw, h: nh } = await rgba(ntx), kn = nw / w;
    for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) { const X = Math.min(w - 1, Math.floor(x / kn)), Y = Math.min(h - 1, Math.floor(y / kn)); if (!inTie(X, Y)) continue; const o = (y * nw + x) * 4; nd[o] = 128; nd[o + 1] = 128; nd[o + 2] = 255; }
    await setWebp(ntx, nd, nw, nh, 90); }
  console.log('shirt texels', ns, 'open V', nv, 'trouser texels', nt);
}
// the trouser hems: the suit's hems hung to 6 cm off the floor, over the sneakers' collars (11 cm), so in every walk the
// shoe came out through the cloth (the cloth gate). The legs' last 9 cm gathered up so the hem sits just over the
// collar (a chino's ankle length over a sneaker), flared 4 mm so it clears the shoe as the foot bends
export function hemPass(doc, K = {}) {
  K = { from: 0.16, low: 0.059, hem: 0.125, flare: 0.006, ...K };
  const p = prim(doc, 'clothes')[0], P = p.getAttribute('POSITION'), a = P.getArray().slice(), vs = [...new Set(p.getIndices().getArray())].filter((v) => a[v * 3 + 1] < K.from);
  const c = { L: [0, 0, 0], R: [0, 0, 0] }; for (const v of vs) { const s = a[v * 3] > 0 ? 'L' : 'R'; c[s][0] += a[v * 3]; c[s][1] += a[v * 3 + 2]; c[s][2]++; }
  for (const v of vs) { const s = a[v * 3] > 0 ? 'L' : 'R', cx = c[s][0] / c[s][2], cz = c[s][1] / c[s][2], y = a[v * 3 + 1], t = clamp((K.from - y) / (K.from - K.low));
    a[v * 3 + 1] = K.from - t * (K.from - K.hem); const dx = a[v * 3] - cx, dz = a[v * 3 + 2] - cz, r = Math.hypot(dx, dz) || 1, f = K.flare * sm(0.3, 1, t);
    a[v * 3] += (dx / r) * f; a[v * 3 + 2] += (dz / r) * f; }
  P.setArray(a); console.log('hem points', vs.length);
}
// the shoulders: the suit's sleeve head stood ~6 mm over the shoulder's line (the shoulders gate's corner; the pad look),
// so the outer shoulder's top is eased down: a field over the shoulder from 15 to 26 cm out, strongest at its top
export function shoulderPass(doc, K = {}) {
  K = { drop: 0.011, x0: 0.15, x1: 0.215, x2: 0.27, y0: 1.47, ...K };
  const p = prim(doc, 'clothes')[0], P = p.getAttribute('POSITION'), a = P.getArray().slice(); let n = 0;
  for (const v of new Set(p.getIndices().getArray())) { const x = Math.abs(a[v * 3]), y = a[v * 3 + 1]; if (y < K.y0 - 0.06 || x < K.x0) continue;
    const w = sm(K.x0, K.x1, x) * sm(K.x2 + 0.03, K.x2, x) * sm(K.y0 - 0.06, K.y0 + 0.02, y); if (w <= 0) continue; a[v * 3 + 1] -= K.drop * w; n++; }
  P.setArray(a); console.log('shoulder points eased', n);
}
