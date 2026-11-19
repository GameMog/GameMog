// Jensen at 63, caricature round 5 (the owner: "he looks a bit young, he's 63"; the critic on round 4: still a soft,
// round, pudgy 45-50: puffy cheeks and jowl area, a baby-smooth chin and neck, folds and lines that vanish at the webcam
// tile's scale; skin pink and waxy, close to a porcelain doll). Age-neutral, universal signs only; nothing about the
// eyes' shape, the skin's tone family or any other racialised feature is changed. Two passes:
//   ageSculptPass(doc)  the head's own points moved, after the face's stylize smooth (which ironed MakeHuman's age
//                       targets flat): a real nose-to-mouth crease with the cheek's soft mass over it, slight marionette
//                       lines with a little jowl beside them, the lower cheeks ~6% narrower, soft loose skin under the
//                       jaw and down the front of the neck, a soft temple hollow, the upper lid's outer skin a little
//                       hooded, gentle bags under the lower lids. Symmetric by construction (|x|).
//   agePaintPass(doc)   the skin maps, after the lips' tone: broad, soft creases that read at a small size (forehead
//                       lines, crow's feet, the nose-to-mouth folds with a light ridge on the cheek side, marionette
//                       lines, the neck's rings) in colour and normal; a living skin's variation (a little redder at
//                       the nose, the cheeks and the ears, cooler at the jaw, a low mottle), fine pores in the normal
//                       map and roughness, a few very faint age spots on the cheekbones and temples; and the lip-tone
//                       smear at the lower lip's corners and the chin cleaned back to the skin's own tone.
// Original procedural work (no photographs, no assets), CC0.
import { matOf, rgba, setWebp, fbm, h3, noise3, sm, clamp, sharp } from '../young-hero/glb.mjs';
import { texelPos } from '../young-mother/p2.mjs';
import { skinMap } from '../facekit.mjs';
import { LM } from './landmarks.mjs';

const g2 = (d, r) => Math.exp(-((d / r) ** 2));
// distance from (x, y) to a polyline, its run parameter t (0..1) and the side (+1 toward larger x)
function seg(x, y, P) {
  let best = 1e9, tt = 0, side = 0, acc = 0, tot = 0;
  for (let k = 0; k + 1 < P.length; k++) tot += Math.hypot(P[k + 1][0] - P[k][0], P[k + 1][1] - P[k][1]);
  for (let k = 0; k + 1 < P.length; k++) { const [ax, ay] = P[k], [bx, by] = P[k + 1], dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy, L = Math.sqrt(L2);
    const t = clamp(((x - ax) * dx + (y - ay) * dy) / L2), cx = ax + dx * t, cy = ay + dy * t, dd = Math.hypot(x - cx, y - cy);
    // (the side: the segment's normal turned toward +x)
    let nx = dy, ny = -dx; if (nx < 0) { nx = -nx; ny = -ny; }
    if (dd < best) { best = dd; tt = (acc + t * L) / tot; side = Math.sign((x - cx) * nx + (y - cy) * ny); } acc += L; }
  return { d: best, t: tt, side };
}

function weld(a) { const n = a.length / 3, key = new Map(), rep = new Int32Array(n);
  for (let v = 0; v < n; v++) { const k = `${Math.round(a[v * 3] * 1e5)},${Math.round(a[v * 3 + 1] * 1e5)},${Math.round(a[v * 3 + 2] * 1e5)}`; if (!key.has(k)) key.set(k, v); rep[v] = key.get(k); }
  return rep; }

// the lines both passes share (bind space, |x|)
const { EY, EZ, EYEX, MOUTHY, CHINY } = LM;
// (measured on the round-4 face: the nose's wings reach ~25 mm out, the smiling mouth's corners ~27 mm)
const FOLD = [[0.028, MOUTHY + 0.028], [0.0325, MOUTHY + 0.016], [0.0375, MOUTHY + 0.004], [0.0405, MOUTHY - 0.008]];
const MAR = [[0.0345, MOUTHY - 0.011], [0.0365, MOUTHY - 0.022], [0.0385, CHINY + 0.012]];
const CORNER = 0.027;

export function ageSculptPass(doc, K = {}) {
  K = { fold: 0.0009, ridge: 0.0019, mar: 0.0005, jowl: 0.0011, slim: 0.06, dbl: 0.0024, temple: 0.0013, hood: 0.0007, bag: 0.0006, ...K };
  const M = skinMap(doc), a = M.P.getArray().slice(), n = M.n, rep = weld(a);
  const C = [0, EY - 0.02, EZ - 0.09];
  let peak = 0, moved = 0;
  for (let v = 0; v < n; v++) { if (rep[v] !== v) continue; const X = a[v * 3], y = a[v * 3 + 1], z = a[v * 3 + 2], x = Math.abs(X), sg = Math.sign(X) || 1;
    if (y < CHINY - 0.075 || y > EY + 0.05 || z < EZ - 0.13 || x > 0.085) continue;
    // the outward direction from the skull's centre
    let ox = X - C[0], oy = y - C[1], oz = z - C[2]; const ol = Math.hypot(ox, oy, oz) || 1; ox /= ol; oy /= ol; oz /= ol;
    let out = 0, dx = 0, dy = 0, dz = 0;
    const front = sm(EZ - 0.06, EZ - 0.03, z);
    // (1) the nose-to-mouth fold: a crease along the line, the cheek's soft mass beside it (the cheek side)
    { const s = seg(x, y, FOLD), end = sm(0, 0.12, s.t) * sm(1.05, 0.8, s.t);
      out += front * end * (-K.fold * g2(s.d, 0.0038) + K.ridge * (s.side > 0 ? 1 : 0) * g2(s.d - 0.006, 0.0055)); }
    // (2) slight marionette lines from the mouth's corners, a little jowl outside them (out and a touch down)
    { const s = seg(x, y, MAR), end = sm(0, 0.2, s.t) * sm(1.05, 0.7, s.t); out -= front * end * K.mar * g2(s.d, 0.004);
      const j = g2(Math.hypot(x - 0.047, (y - (CHINY + 0.014)) * 1.2), 0.011) * sm(EZ - 0.09, EZ - 0.05, z); out += K.jowl * j; dy -= K.jowl * 0.7 * j; }
    // (3) the lower cheeks narrower (the round, puffy lower face), most between the mouth and the jaw's corner
    { const w = sm(EY - 0.028, EY - 0.05, y) * sm(CHINY - 0.01, CHINY + 0.02, y) * sm(0.024, 0.046, x) * sm(EZ - 0.12, EZ - 0.08, z); dx -= sg * K.slim * w * (x - 0.02); }
    // (4) soft loose skin under the jaw and down the neck's front: down and a little forward
    { const w = sm(CHINY + 0.006, CHINY - 0.006, y) * sm(CHINY - 0.065, CHINY - 0.03, y) * sm(0.05, 0.025, x) * sm(EZ - 0.14, EZ - 0.1, z) * sm(EZ - 0.02, EZ - 0.05, z);
      dy -= K.dbl * 0.55 * w; dz += K.dbl * w * sm(CHINY - 0.06, CHINY - 0.015, y); }
    // (5) a soft hollow at each temple
    { const t = g2(Math.hypot(x - 0.064, (y - (EY + 0.014)) * 0.8, (z - (EZ - 0.045)) * 0.8), 0.013); dx -= sg * K.temple * t; }
    // (6) the upper lid's outer skin a little hooded (the fold between the brow and the lid, never the lid itself)
    { const t = g2(Math.hypot(x - (EYEX + 0.009), (y - (EY + 0.0125)) * 1.6), 0.0075) * sm(EY + 0.007, EY + 0.011, y) * sm(EZ - 0.04, EZ - 0.02, z); dy -= K.hood * t; dz += K.hood * 0.4 * t; }
    // (7) gentle bags under the lower lids
    { const t = g2(Math.hypot(x - (EYEX + 0.002), (y - (EY - 0.0155)) * 1.6), 0.0072) * sm(EZ - 0.04, EZ - 0.02, z); out += K.bag * t; }
    dx += ox * out; dy += oy * out; dz += oz * out;
    const m = Math.hypot(dx, dy, dz); if (m < 1e-7) continue; peak = Math.max(peak, m); moved++;
    a[v * 3] += dx; a[v * 3 + 1] += dy; a[v * 3 + 2] += dz; }
  for (let v = 0; v < n; v++) { const r = rep[v]; if (r !== v) for (let k = 0; k < 3; k++) a[v * 3 + k] = a[r * 3 + k]; }
  M.P.setArray(a); console.log('age sculpt: points', moved, 'peak mm', (peak * 1000).toFixed(2));
}

export async function agePaintPass(doc, K = {}) {
  K = { depth: 1, dk: 1, fore: 1, crow: 1, folds: 1, mar: 1, neck: 1, red: 1, cool: 1, mottle: 1, pores: 1, spots: 1, gain: 6, rough: 1, chin: 1, ...K };
  const { tex, img, S, N2, pos, head } = await texelPos(doc), d = img.data;
  const mat = matOf(doc, 'skin'), nt = mat.getNormalTexture(), mrt = mat.getMetallicRoughnessTexture();
  const lin = (c) => Math.pow(c / 255, 2.2), enc = (l) => Math.min(255, Math.max(0, Math.round(255 * Math.pow(Math.max(0, l), 1 / 2.2))));
  const H = new Float32Array(N2), DK = new Float32Array(N2), LT = new Float32Array(N2), RD = new Float32Array(N2), CL = new Float32Array(N2), SP = new Float32Array(N2), RG = new Float32Array(N2), CH = new Float32Array(N2);
  // the chin's clean tone: the skin just above the lip line's corners and the chin's middle, averaged (linear)
  const ref = [0, 0, 0]; let nr = 0;
  for (let i = 0; i < N2; i++) { const X = pos[i * 3]; if (Number.isNaN(X)) continue; const x = Math.abs(X), y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    if (z > EZ - 0.03 && x > 0.036 && x < 0.046 && Math.abs(y - (MOUTHY + 0.004)) < 0.004) { for (let c = 0; c < 3; c++) ref[c] += lin(d[i * 4 + c]); nr++; } }
  for (let c = 0; c < 3; c++) ref[c] /= Math.max(1, nr);
  let nf = 0;
  for (let i = 0; i < N2; i++) {
    const X = pos[i * 3]; if (Number.isNaN(X)) continue; const y = pos[i * 3 + 1], z = pos[i * 3 + 2], x = Math.abs(X);
    const n1 = fbm(X, y, z, 60) - 0.5, n2 = fbm(X + 3, y, z, 220) - 0.5;
    let h = 0, dk = 0, lt = 0;
    const face = head[i] > 0.4 && z > EZ - 0.08 && y > CHINY - 0.02;
    if (face) { nf++;
      // forehead: three broad, gently wavy lines (wide enough to read at a webcam tile's size), fading at the temples
      { const fh = sm(EY + 0.024, EY + 0.032, y) * sm(EY + 0.07, EY + 0.058, y) * (1 - sm(0.036, 0.055, x)) * sm(EZ - 0.035, EZ - 0.012, z);
        if (fh > 0) { const ph = (y - EY - 0.031 - 0.0045 * (x / 0.05) ** 2 - 0.0012 * Math.sin(x * 140 + 1.3)) / 0.0105 + 0.25 * n1, k = Math.round(ph), f = ph - k;
          if (k >= 0 && k <= 2) { const len = 1 - sm(0.028 + 0.01 * (k === 1), 0.05, x + 0.008 * n2), ln = g2(f, 0.11) * len, bump = g2(Math.abs(f) - 0.32, 0.14) * len;
            h += K.fore * fh * (-0.0002 * ln + 0.00005 * bump); dk += K.fore * fh * 0.09 * ln; lt += K.fore * fh * 0.03 * bump; } } }
      // crow's feet: four soft rays fanning from each outer eye corner, 4 to 17 mm out
      { const cx = x - (EYEX + 0.0185), cy = y - (EY - 0.0005); if (cx > -0.003 && cx < 0.024 && Math.abs(cy) < 0.018 && z > EZ - 0.065) {
          const an = Math.atan2(cy, cx), r = Math.hypot(cx, cy), rays = g2(Math.sin((an + 0.18 * n1) * 4.0), 0.22) * (Math.abs(an) < 1.15 ? 1 : 0), fall = sm(0.004, 0.008, r) * sm(0.019, 0.011, r);
          h -= K.crow * 0.00024 * rays * fall; dk += K.crow * 0.12 * rays * fall; } }
      // the nose-to-mouth folds: a broad soft crease, a light ridge on the cheek side
      { const s = seg(x, y, FOLD), end = sm(0, 0.1, s.t) * sm(1.05, 0.8, s.t);
        if (z > EZ - 0.045) { // (colour only: the crease's form is in the sculpt; a slope in the normal map here streaked where the uv islands stretch)
          const f = g2(s.d, 0.0042) * end, ridge = g2(s.d - 0.0075, 0.005) * (s.side > 0 ? 1 : 0) * end;
          dk += K.folds * 0.17 * f; lt += K.folds * 0.04 * ridge; } }
      // marionette lines
      { const s = seg(x, y, MAR), end = sm(0, 0.2, s.t) * sm(1.05, 0.65, s.t), f = g2(s.d, 0.004) * end; if (z > EZ - 0.05) dk += K.mar * 0.08 * f; }
      // a low unevenness and fine pores (the normal map only)
      h += 0.00005 * (fbm(X, y, z, 140) - 0.5) + K.pores * 0.000016 * (noise3(X * 2600, y * 2600, z * 2600) - 0.5) + K.pores * 0.00001 * (noise3(X * 5200 + 7, y * 5200, z * 5200) - 0.5);
      // the redness of living skin: the nose (tip and wings), the cheeks' apples; the jaw a little cooler
      RD[i] = K.red * (0.9 * g2(Math.hypot(x, (y - (MOUTHY + 0.03)) * 0.9, (z - (EZ + 0.035)) * 0.6), 0.012) + 0.7 * g2(Math.hypot(x - (EYEX + 0.012), y - (EY - 0.034)), 0.016) * (z > EZ - 0.05 ? 1 : 0));
      CL[i] = K.cool * sm(MOUTHY - 0.004, MOUTHY - 0.03, y) * sm(0.026, 0.05, x);
      // the chin and the lower lip's corners: the round-4 lip tone smear (red-brown blotches) cleaned to the skin's tone
      CH[i] = K.chin * Math.max((1 - sm(0.024, 0.034, x)) * sm(MOUTHY - 0.0085, MOUTHY - 0.0125, y) * sm(CHINY - 0.01, CHINY + 0.004, y),
        g2(Math.hypot(x - 0.024, (y - (MOUTHY - 0.006)) * 1.2), 0.0055) * sm(MOUTHY - 0.0015, MOUTHY - 0.0045, y)) * (z > EZ - 0.04 ? 1 : 0);
      // (no crease right at the mouth's corners: the grin and the talk move them)
      const mc = Math.hypot(x - CORNER, y - MOUTHY), keep = sm(0.004, 0.009, mc); h *= keep; dk *= keep;
    }
    // the ears a little redder
    if (head[i] > 0.6 && x > 0.068 && z < EZ - 0.06 && Math.abs(y - (EY - 0.012)) < 0.035) RD[i] = Math.max(RD[i], K.red * 0.8 * sm(0.068, 0.076, x));
    // the neck: three soft rings across its front
    if (y < CHINY - 0.008 && y > CHINY - 0.1 && z > 0.0 && head[i] < 0.95) { const ph = (y - (CHINY - 0.04)) / 0.017 + 0.35 * n1, k = Math.round(ph), f = ph - k;
      if (k >= -1 && k <= 1) { const w = sm(0.055, 0.028, x) * sm(0.0, 0.03, z), ln = g2(f, 0.12) * w; h -= K.neck * 0.0003 * ln; dk += K.neck * 0.08 * ln; } }
    H[i] = h * K.depth; DK[i] = dk * K.dk; LT[i] = lt * K.dk;
    // very faint age spots on the cheekbones and the temples: a fifth of the 10 mm cells, 1.2-2.6 mm, soft
    if (K.spots && face) { const zone = g2(Math.hypot(x - 0.05, (y - (EY - 0.022)) * 0.8), 0.016) + g2(Math.hypot(x - 0.06, (y - (EY + 0.02)) * 0.8), 0.013);
      if (zone > 0.05) { const c = 0.01, cx = Math.floor(X / c), cy = Math.floor(y / c), cz = Math.floor(z / c); let sp = 0;
        for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let e = -1; e <= 1; e++) { const hx = cx + a, hy = cy + b, hz = cz + e; if (h3(hx, hy, hz + 911) > 0.2) continue;
          const px = (hx + h3(hx, hy, hz + 1)) * c, py = (hy + h3(hx, hy, hz + 2)) * c, pz = (hz + h3(hx, hy, hz + 3)) * c, r = 0.0006 + 0.0007 * h3(hx, hy, hz + 4);
          sp = Math.max(sp, (1 - sm(0.5, 1.2, Math.hypot(X - px, y - py, z - pz) / r + 0.3 * n2)) * (0.5 + 0.5 * h3(hx, hy, hz + 5))); }
        SP[i] = sp * clamp(zone) * K.spots; } }
    // the roughness: drier on the cheeks, the pores a fine breakup
    RG[i] = face ? K.rough * (0.05 * (noise3(X * 2600, y * 2600, z * 2600) - 0.5) + 0.06 * (fbm(X, y, z, 90) - 0.5)) : 0;
  }
  // the colour
  let nch = 0;
  for (let i = 0; i < N2; i++) { const X = pos[i * 3]; if (Number.isNaN(X)) continue; const y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    let r = lin(d[i * 4]), g = lin(d[i * 4 + 1]), b = lin(d[i * 4 + 2]); const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b; if (Y < 0.02) continue;
    if (CH[i] > 0) { const t = clamp(CH[i]) * 0.85, mo = 1 + 0.03 * (fbm(X, y, z, 70) - 0.5); r += (ref[0] * mo - r) * t; g += (ref[1] * mo - g) * t; b += (ref[2] * mo - b) * t; nch++; }
    const mt = 1 + K.mottle * 0.05 * (fbm(X + 9, y, z, 45) - 0.5);
    const rd = RD[i] * 0.07, cl = CL[i] * 0.025;
    r *= mt * (1 + rd) * (1 - cl); g *= mt * (1 - rd * 0.35); b *= mt * (1 - rd * 0.3) * (1 + cl * 0.6);
    const k = 1 - clamp(DK[i], 0, 0.4), l = 1 + clamp(LT[i], 0, 0.08); r *= k * l; g *= k * l * 0.99; b *= k * l * 0.985;
    const s = SP[i]; if (s > 0) { r *= 1 - 0.16 * s; g *= 1 - 0.22 * s; b *= 1 - 0.28 * s; }
    d[i * 4] = enc(r); d[i * 4 + 1] = enc(g); d[i * 4 + 2] = enc(b); }
  await setWebp(tex, d, S, S, 90, 4);
  // the normal map: the height's slope added to the map's own
  if (nt) { const { data: nm, w: NW } = await rgba(nt); const k = NW / S; let n = 0;
    const P = (x, y) => { const j = (y * S + x) * 3; return [pos[j], pos[j + 1], pos[j + 2]]; };
    for (let yy = 1; yy < S - 1; yy++) for (let xx = 1; xx < S - 1; xx++) { const i = yy * S + xx; if (!H[i] && !H[i - 1] && !H[i + 1] && !H[i - S] && !H[i + S]) continue;
      const a = P(xx - 1, yy), bq = P(xx + 1, yy), c = P(xx, yy - 1), e = P(xx, yy + 1); if ([a, bq, c, e].some((q) => Number.isNaN(q[0]))) continue;
      const du = Math.hypot(bq[0] - a[0], bq[1] - a[1], bq[2] - a[2]) || 1e-4, dv = Math.hypot(e[0] - c[0], e[1] - c[1], e[2] - c[2]) || 1e-4;
      const sx = ((H[i + 1] - H[i - 1]) / du) * K.gain, sy = ((H[i + S] - H[i - S]) / dv) * K.gain;
      const X0 = Math.floor(xx * k), Y0 = Math.floor(yy * k); if (X0 >= NW || Y0 >= NW) continue; const j = (Y0 * NW + X0) * 4;
      let nx = nm[j] / 127.5 - 1, ny = nm[j + 1] / 127.5 - 1, nz = nm[j + 2] / 127.5 - 1; nx += -sx * nz; ny += sy * nz; const L = Math.hypot(nx, ny, nz) || 1;
      nm[j] = Math.round((nx / L * 0.5 + 0.5) * 255); nm[j + 1] = Math.round((ny / L * 0.5 + 0.5) * 255); nm[j + 2] = Math.round((nz / L * 0.5 + 0.5) * 255); n++; }
    await setWebp(nt, nm, NW, NW, 92); console.log('age paint: normal texels', n); }
  // the roughness (green): a fine breakup over the face
  if (mrt && K.rough) { const { data: mr, w: MW } = await rgba(mrt); const k = MW / S; let n = 0;
    for (let i = 0; i < N2; i++) { if (!RG[i]) continue; const xx = i % S, yy = (i / S) | 0, j = (Math.floor(yy * k) * MW + Math.floor(xx * k)) * 4; mr[j + 1] = Math.max(0, Math.min(255, Math.round(mr[j + 1] + RG[i] * 255))); n++; }
    await setWebp(mrt, mr, MW, MW, 90); console.log('age paint: roughness texels', n); }
  console.log('age paint: face texels', nf, 'chin cleaned', nch, 'ref', ref.map((v) => v.toFixed(3)).join(','));
}
