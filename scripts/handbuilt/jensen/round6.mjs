// Jensen, caricature round 6 (the owner: "he looks a bit young, he's 63"; the critic on round 5: the age shows only in
// close-up, at game distance the face reads smooth, doll-like and about 40-50; a wide, flat face with small features in
// the middle; a helmet of even grooves with wire-thin flyaways; a scalloped hairline; a tight-lipped smirk at rest; white
// hands; a ring crease at the neck; pasty skin under neutral light; glasses set high with tall lenses). Universal adult
// and age cues only: nothing about the eyes' shape, the skin's tone family or any racialised feature is changed.
//   shape6Pass(doc)   the face's planes and its age in its shape, on the head's own points (symmetric by |x|): the lower
//                     third ~6% longer (the chin down), the mouth ~5% wider, the nose a little broader and more
//                     projecting with a firmer bridge, fuller, higher cheekbones and less round softness below them, the
//                     nose-to-mouth fold deeper where it meets the nostril's wing (the cheek's mass over it), a real fold
//                     of upper-lid skin half over the lid's crease, rounded lower-lid bags, softness under the jaw's corners
//   paint6Pass(doc)   the skin maps: a shadow under the lower-lid bags and under the upper-lid fold, the fold's top shaded,
//                     the neck's hard rings replaced by two or three soft broken bands, a faint sheen on the forehead and
//                     the nose (lower roughness), a feathered silver tint at the hairline; the hands matched to the face's
//                     tone (they read chalky), a little redness at the knuckles and a soft shade between the fingers
//   glasses6Pass(doc) the frame 3.5 mm lower, the lenses ~10% shallower with rounded lower corners
//   hem6Pass(doc)     the jacket's hem tapered in to the waist (it flared at the hips)
//   mouth6Pass(doc)   the open mouth: the 'aa' viseme ~15% less jaw, a tongue riding the lower jaw, the mouth's inside a
//                     dark-rose to near-black gradient (no flat black hole)
// Original procedural work (no photographs, no assets), CC0.
import { matOf, rgba, setWebp, fbm, noise3, sm, clamp, body, raster, prim } from '../young-hero/glb.mjs';
import { texelPos } from '../young-mother/p2.mjs';
import { hairArea } from './strands.mjs';
import { skinMap } from '../facekit.mjs';
import { LM } from './landmarks.mjs';

const g2 = (d, r) => Math.exp(-((d / r) ** 2));
const { EY, EZ, EYEX, MOUTHY, CHINY } = LM;
const FOLD = [[0.028, MOUTHY + 0.028], [0.0325, MOUTHY + 0.016], [0.0375, MOUTHY + 0.004], [0.0405, MOUTHY - 0.008]];
function seg(x, y, P) {
  let best = 1e9, tt = 0, side = 0, acc = 0, tot = 0;
  for (let k = 0; k + 1 < P.length; k++) tot += Math.hypot(P[k + 1][0] - P[k][0], P[k + 1][1] - P[k][1]);
  for (let k = 0; k + 1 < P.length; k++) { const [ax, ay] = P[k], [bx, by] = P[k + 1], dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy, L = Math.sqrt(L2);
    const t = clamp(((x - ax) * dx + (y - ay) * dy) / L2), cx = ax + dx * t, cy = ay + dy * t, dd = Math.hypot(x - cx, y - cy);
    let nx = dy, ny = -dx; if (nx < 0) { nx = -nx; ny = -ny; }
    if (dd < best) { best = dd; tt = (acc + t * L) / tot; side = Math.sign((x - cx) * nx + (y - cy) * ny); } acc += L; }
  return { d: best, t: tt, side };
}
function weld(a) { const n = a.length / 3, key = new Map(), rep = new Int32Array(n);
  for (let v = 0; v < n; v++) { const k = `${Math.round(a[v * 3] * 1e5)},${Math.round(a[v * 3 + 1] * 1e5)},${Math.round(a[v * 3 + 2] * 1e5)}`; if (!key.has(k)) key.set(k, v); rep[v] = key.get(k); }
  return rep; }
// the points of the eyes, lashes and teeth (they share the skin's points accessor): never moved by a skin sculpt
function notSkin(doc, acc) { const s = new Set();
  for (const p of doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives())) { const mn = p.getMaterial()?.getName() || ''; if (p.getAttribute('POSITION') !== acc || !/^(eyes|lashes|teethUp|teethLow)$/.test(mn)) continue;
    for (const v of p.getIndices().getArray()) s.add(v); }
  return s; }

export function shape6Pass(doc, K = {}) {
  K = { chin: 0.003, mouthW: 0.05, noseW: 0.07, noseZ: 0.07, bridge: 0.0012, cheek: 0.0014, lowCheek: 0.0009, nlTop: 0.0018, nlRidge: 0.002,
    hood: 0.0006, bag: 0.0007, jaw: 0.0012, ...K };
  const M = skinMap(doc), a = M.P.getArray().slice(), n = M.n, rep = weld(a), skip = notSkin(doc, M.P);
  const C = [0, EY - 0.02, EZ - 0.09];
  let peak = 0, moved = 0;
  for (let v = 0; v < n; v++) { if (rep[v] !== v || skip.has(v)) continue; const X = a[v * 3], y = a[v * 3 + 1], z = a[v * 3 + 2], x = Math.abs(X), sg = Math.sign(X) || 1;
    if (y < CHINY - 0.06 || y > EY + 0.05 || z < EZ - 0.14 || x > 0.085) continue;
    let ox = X - C[0], oy = y - C[1], oz = z - C[2]; const ol = Math.hypot(ox, oy, oz) || 1; ox /= ol; oy /= ol; oz /= ol;
    let out = 0, dx = 0, dy = 0, dz = 0;
    const front = sm(EZ - 0.06, EZ - 0.03, z);
    // (1) the lower third longer: the chin and the jaw's front down (fading back toward the jaw's corners and into the neck)
    { const w = sm(MOUTHY - 0.01, MOUTHY - 0.032, y) * sm(EZ - 0.12, EZ - 0.06, z) * sm(0.075, 0.04, x) * (y < CHINY - 0.008 ? sm(CHINY - 0.05, CHINY - 0.008, y) : 1); dy -= K.chin * w; }
    // (2) the mouth wider: the lips and the skin round them spread from the middle line
    { const w = (1 - sm(0.024, 0.042, x)) * g2(y - MOUTHY, 0.013) * sm(EZ - 0.05, EZ - 0.025, z); dx += sg * K.mouthW * x * w; }
    // (3) the nose a little broader and more projecting (from its base plane), the bridge between the eyes a little firmer
    { const w = sm(EY - 0.004, EY - 0.03, y) * sm(MOUTHY + 0.011, MOUTHY + 0.018, y) * sm(0.03, 0.017, x) * sm(EZ - 0.012, EZ + 0.004, z);
      dx += sg * x * K.noseW * w; dz += Math.max(0, z - EZ) * K.noseZ * w;
      dz += K.bridge * g2(x, 0.008) * g2(y - (EY - 0.004), 0.011) * sm(EZ - 0.01, EZ + 0.004, z); }
    // (4) fuller, higher cheekbones; less round softness below them
    out += K.cheek * g2(Math.hypot(x - 0.05, (y - (EY - 0.028)) * 1.25), 0.014) * sm(EZ - 0.08, EZ - 0.045, z);
    out -= K.lowCheek * g2(Math.hypot(x - 0.048, (y - (MOUTHY + 0.004)) * 1.1), 0.012) * sm(EZ - 0.08, EZ - 0.05, z);
    // (5) the nose-to-mouth fold deeper at its top, where it meets the nostril's wing, the cheek's mass over it
    { const s = seg(x, y, FOLD), top = sm(0, 0.06, s.t) * (1 - sm(0.35, 0.65, s.t));
      out += front * top * (-K.nlTop * g2(s.d, 0.0032) + K.nlRidge * (s.side > 0 ? 1 : 0) * g2(s.d - 0.0055, 0.0045)); }
    // (6) the upper lid's skin folded down over the lid's crease (between the crease and the brow, never the lid's margin)
    { const t = g2((x - (EYEX + 0.004)) / 1.15, 0.012) * sm(EY + 0.0105, EY + 0.0135, y) * sm(EY + 0.024, EY + 0.017, y) * sm(EZ - 0.045, EZ - 0.02, z);
      dy -= K.hood * t; dz += K.hood * 0.45 * t; }
    // (7) rounded lower-lid bags
    { const t = g2(Math.hypot(x - (EYEX + 0.002), (y - (EY - 0.0165)) * 1.7), 0.0078) * sm(EZ - 0.045, EZ - 0.02, z); out += K.bag * t; }
    // (8) softness under the jaw's corners (a little sag, down and out)
    { const t = g2(Math.hypot(x - 0.052, (y - (CHINY + 0.004)) * 1.3, (z - (EZ - 0.085)) * 0.8), 0.014); dy -= K.jaw * t; out += K.jaw * 0.4 * t; }
    dx += ox * out; dy += oy * out; dz += oz * out;
    const m = Math.hypot(dx, dy, dz); if (m < 1e-7) continue; peak = Math.max(peak, m); moved++;
    a[v * 3] += dx; a[v * 3 + 1] += dy; a[v * 3 + 2] += dz; }
  for (let v = 0; v < n; v++) { const r = rep[v]; if (r !== v && !skip.has(v)) for (let k = 0; k < 3; k++) a[v * 3 + k] = a[r * 3 + k]; }
  M.P.setArray(a); console.log('shape6: points', moved, 'peak mm', (peak * 1000).toFixed(2));
}

export async function paint6Pass(doc, K = {}) {
  K = { bagShade: 0.24, hoodShade: 0.1, nlShade: 0.24, neck: 1, sheen: 0.14, hairline: 0.32, hand: 0.75, knuckle: 1, web: 1, warm: 1, ...K };
  const { tex, img, S, N2, pos, head, B } = await texelPos(doc), d = img.data;
  const mat = matOf(doc, 'skin'), mrt = mat.getMetallicRoughnessTexture();
  const lin = (c) => Math.pow(c / 255, 2.2), enc = (l) => Math.min(255, Math.max(0, Math.round(255 * Math.pow(Math.max(0, l), 1 / 2.2))));
  // per-texel skin weights for the hands' bones (wrist, the finger joints), rastered as texelPos rasters the points
  const names = B.names, side = ['L', 'R'], fing = [1, 2, 3, 4, 5];
  const want = []; for (const s of side) { want.push('wrist_' + s); for (const f of fing) for (const j of [1, 2, 3]) want.push(`finger${f}-${j}_${s}`); }
  const have = want.filter((w) => names.includes(w)), WB = Object.fromEntries(have.map((w) => [w, B.wOn(new RegExp('^' + w + '$'))]));
  const hand = new Float32Array(N2).fill(0), KN = new Float32Array(N2), WEB = new Float32Array(N2);
  const wHand = B.wOn(/^(wrist|finger|metacarpal|thumb)/), uv = B.uv.getArray(), tris = prim(doc, 'skin').flatMap((q) => [...q.getIndices().getArray()]);
  // the joints' blend zones: the knuckles (a bone and the next along the finger, the wrist and each finger's first bone)
  const pairs = [], webs = [];
  for (const s of side) { for (const f of fing) { const c = [`wrist_${s}`, `finger${f}-1_${s}`, `finger${f}-2_${s}`, `finger${f}-3_${s}`]; for (let k = 0; k + 1 < c.length; k++) if (WB[c[k]] && WB[c[k + 1]]) pairs.push([WB[c[k]], WB[c[k + 1]], k === 0 ? 0.6 : 1]); }
    for (let f = 2; f < 5; f++) { const A = WB[`finger${f}-1_${s}`], Bq = WB[`finger${f + 1}-1_${s}`]; if (A && Bq) webs.push([A, Bq]); } }
  raster(tris, (v) => [uv[v * 2] * S, uv[v * 2 + 1] * S], S, (x, y, l1, l2, l3, a, b, c) => { const i = y * S + x, L = (A) => l1 * A[a] + l2 * A[b] + l3 * A[c];
    hand[i] = L(wHand); let kn = 0; for (const [A, Bq, s] of pairs) kn = Math.max(kn, 4 * L(A) * L(Bq) * s); KN[i] = kn; let wb = 0; for (const [A, Bq] of webs) wb = Math.max(wb, 4 * L(A) * L(Bq)); WEB[i] = wb; }, 0.03);
  // the face's tone (the cheeks, under the eyes) and the hands' (the backs of the hands), low frequency, linear
  const fm = [0, 0, 0], hm = [0, 0, 0]; let nf = 0, nh = 0;
  for (let i = 0; i < N2; i++) { const X = pos[i * 3]; if (Number.isNaN(X)) continue; const x = Math.abs(X), y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    if (head[i] > 0.9 && x > 0.03 && x < 0.05 && y > EY - 0.05 && y < EY - 0.025 && z > EZ - 0.05) { for (let k = 0; k < 3; k++) fm[k] += lin(d[i * 4 + k]); nf++; }
    if (hand[i] > 0.9) { for (let k = 0; k < 3; k++) hm[k] += lin(d[i * 4 + k]); nh++; } }
  for (let k = 0; k < 3; k++) { fm[k] /= Math.max(1, nf); hm[k] /= Math.max(1, nh); }
  // (the face's hue on the hands at their own lightness, a touch darker: they read chalky beside the face)
  const Lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2], ratio = fm.map((f, k) => ((f / Lum(fm)) / Math.max(1e-4, hm[k] / Lum(hm))) * 0.95);
  const H = new Float32Array(N2), R = new Float32Array(N2);
  let nn = 0, nhand = 0;
  for (let i = 0; i < N2; i++) { const X = pos[i * 3]; if (Number.isNaN(X)) continue; const x = Math.abs(X), y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    let r = lin(d[i * 4]), g = lin(d[i * 4 + 1]), b = lin(d[i * 4 + 2]); if (0.2126 * r + 0.7152 * g + 0.0722 * b < 0.02) continue;
    const n1 = fbm(X, y, z, 70) - 0.5;
    let dk = 0, lt = 0, h = 0;
    const face = head[i] > 0.4 && z > EZ - 0.08 && y > CHINY - 0.02;
    if (face) {
      // a soft shadow under the lower-lid bags (the bag's own top a touch lighter)
      { const e = Math.hypot((x - (EYEX + 0.002)) / 1.25, (y - (EY - 0.0235)) * 2.4); dk += K.bagShade * g2(e, 0.0085) * sm(EZ - 0.045, EZ - 0.025, z);
        lt += 0.04 * g2(Math.hypot((x - (EYEX + 0.002)) / 1.2, (y - (EY - 0.0155)) * 2.2), 0.007); }
      // the shade under the upper-lid fold
      dk += K.hoodShade * g2((x - (EYEX + 0.004)) / 1.2, 0.011) * g2(y - (EY + 0.0085), 0.0028) * sm(EZ - 0.045, EZ - 0.025, z);
      // the fold's top, at the nostril's wing
      { const s = seg(x, y, FOLD), top = sm(0, 0.05, s.t) * (1 - sm(0.35, 0.7, s.t)); dk += K.nlShade * top * g2(s.d, 0.0035) * sm(EZ - 0.045, EZ - 0.025, z); }
      // the hairline: a feathered silver tint over the forehead's top (no hard edge where the hair meets the skin)
      { const ha = hairArea(X, y, z, 0.6 * n1, 0.047, 0.006); if (ha > 0 && ha < 1) lt += K.hairline * 0.25 * ha * (1 - ha) * 4; }
    }
    // the neck: two or three soft, broken bands across its front (the round-5 rings were one hard line)
    if (K.neck && y < CHINY - 0.012 && y > CHINY - 0.085 && z > 0.0 && head[i] < 0.97) {
      const ph = (y - (CHINY - 0.028)) / 0.021 + 0.25 * n1, k = Math.round(ph), f = ph - k;
      if (k >= -2 && k <= 0) { const br = sm(0.35, 0.6, fbm(X + 5, y * 0.3, z, 55)), w = sm(0.05, 0.022, x) * sm(0.0, 0.03, z), ln = g2(f, 0.2) * w * br;
        dk += K.neck * 0.06 * ln; h -= 0.0002 * ln; } }
    // the hands: the face's tone, the knuckles a little redder, a soft shade between the fingers
    const hw = clamp(hand[i] * 1.2) * (y < 1.15 ? 1 : 0);
    if (hw > 0) { const t = hw * K.hand; r *= 1 + (ratio[0] - 1) * t; g *= 1 + (ratio[1] - 1) * t; b *= 1 + (ratio[2] - 1) * t; nhand++;
      const kn = clamp(KN[i]) * K.knuckle, wb = clamp(WEB[i]) * K.web; R[i] = kn; dk += 0.08 * wb; }
    const kk = 1 - clamp(dk, 0, 0.4), ll = 1 + clamp(lt, 0, 0.08);
    r *= kk * ll; g *= kk * ll * 0.99; b *= kk * ll * 0.985;
    if (R[i] > 0) { const q = R[i] * 0.12; r *= 1 + q * 0.6; g *= 1 - q * 0.25; b *= 1 - q * 0.2; }
    // a little living warmth back on the face, ears and neck (under neutral light round 5 leaned pasty pink-grey)
    if (K.warm && (head[i] > 0.3 || (y > 1.38 && x < 0.08))) { const w = K.warm; r *= 1 + 0.025 * w; g *= 1 + 0.004 * w; b *= 1 - 0.03 * w; }
    H[i] = h; nn++;
    d[i * 4] = enc(r); d[i * 4 + 1] = enc(g); d[i * 4 + 2] = enc(b); }
  await setWebp(tex, d, S, S, 90, 4);
  // the roughness (green): a faint sheen on the forehead and the nose (the T-zone), a little drier elsewhere on the face
  if (mrt && K.sheen) { const { data: mr, w: MW } = await rgba(mrt); const k = MW / S; let ns = 0;
    for (let i = 0; i < N2; i++) { const X = pos[i * 3]; if (Number.isNaN(X) || head[i] < 0.5) continue; const x = Math.abs(X), y = pos[i * 3 + 1], z = pos[i * 3 + 2];
      const fore = (1 - sm(0.03, 0.05, x)) * sm(EY + 0.018, EY + 0.03, y) * sm(EY + 0.065, EY + 0.05, y) * sm(EZ - 0.03, EZ - 0.01, z);
      const nose = (1 - sm(0.008, 0.016, x)) * sm(MOUTHY + 0.016, MOUTHY + 0.024, y) * sm(EY - 0.002, EY - 0.012, y) * sm(EZ - 0.005, EZ + 0.01, z);
      const w = Math.max(fore, nose); if (w <= 0) continue; const xx = i % S, yy = (i / S) | 0, j = (Math.floor(yy * k) * MW + Math.floor(xx * k)) * 4;
      mr[j + 1] = Math.max(0, Math.round(mr[j + 1] * (1 - K.sheen * w))); ns++; }
    await setWebp(mrt, mr, MW, MW, 90); console.log('paint6: sheen texels', ns); }
  console.log('paint6: texels', nn, 'hand texels', nhand, 'face tone', fm.map((v) => v.toFixed(3)).join(','), 'hand tone', hm.map((v) => v.toFixed(3)).join(','), 'knuckle pairs', pairs.length, 'webs', webs.length);
}

export function glasses6Pass(doc, K = {}) {
  K = { drop: 0.0015, back: 0.0, shallow: 0.82, round: 0.35, zFront: 0.125, zBack: 0.07, ...K };
  const seen = new Set(), all = [];
  for (const p of doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives())) { const mn = p.getMaterial()?.getName() || ''; if (!/^glasses-/.test(mn)) continue; const acc = p.getAttribute('POSITION'); if (seen.has(acc)) continue; seen.add(acc); all.push([mn, acc]); }
  // the lenses' box from the rims (the lens-edge points on the front)
  let x0 = 1, x1 = 0, y0 = 9, y1 = 0;
  for (const [mn, acc] of all) { if (mn !== 'glasses-lens-edge') continue; const A = acc.getArray(); for (let i = 0; i < A.length; i += 3) { const x = Math.abs(A[i]), y = A[i + 1], z = A[i + 2]; if (z < K.zFront - 0.02 || x < 0.012) continue; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } }
  const cx = (x0 + x1) / 2, hw = (x1 - x0) / 2, top = y1, hh = (y1 - y0) / 2, cy = (y0 + y1) / 2;
  let n = 0;
  for (const [mn, acc] of all) { const A = acc.getArray().slice();
    for (let i = 0; i < A.length; i += 3) { let X = A[i], y = A[i + 1]; const z = A[i + 2], x = Math.abs(X), w = sm(K.zBack, K.zFront - 0.01, z);
      // the lens's lower half shallower toward the top bar, its lower outer and inner corners rounded (a squircle)
      if (w > 0 && y < cy && x > x0 - 0.004 && x < x1 + 0.004) { const u = (x - cx) / hw, v = (y - cy) / hh, p = 4, r = Math.pow(Math.pow(Math.abs(u), p) + Math.pow(Math.abs(v), p), 1 / p);
        const corner = clamp((Math.min(Math.abs(u), 1.2) - 0.55) / 0.45) * clamp((Math.min(Math.abs(v), 1.2) - 0.55) / 0.45), pull = 1 - K.round * corner * 0.16 * (r > 0.9 ? 1 : r / 0.9);
        const nu = u * pull, nv = v * pull * (1 - (1 - K.shallow) * w);
        X = Math.sign(X) * (cx + nu * hw); y = cy + nv * hh; }
      A[i] = X; A[i + 1] = y - K.drop; A[i + 2] = z - K.back * w; n++; }
    acc.setArray(A); }
  console.log('glasses6: points', n, 'lens box x', x0.toFixed(4), x1.toFixed(4), 'y', y0.toFixed(4), y1.toFixed(4), 'drop mm', K.drop * 1000);
}

export function hem6Pass(doc, K = {}) {
  K = { taper: 0.05, y0: 0.93, y1: 1.1, ...K };
  const seen = new Set(); let n = 0;
  for (const p of doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives())) {
    const mn = p.getMaterial()?.getName() || ''; if (!/^(leather|hardware|zip-tape|snaps)$/.test(mn)) continue; const acc = p.getAttribute('POSITION'); if (seen.has(acc)) continue; seen.add(acc);
    const A = acc.getArray().slice();
    for (let i = 0; i < A.length; i += 3) { const w = sm(K.y1, K.y0, A[i + 1]); if (w <= 0) continue; A[i] *= 1 - K.taper * w; n++; }
    acc.setArray(A); }
  console.log('hem6: points', n, 'taper', K.taper);
}

export function mouth6Pass(doc, K = {}) {
  K = { aa: 0.85, tongue: true, col: [0.3, 0.085, 0.085], ...K };
  const R = doc.getRoot(), prims = R.listMeshes().flatMap((m) => m.listPrimitives().map((p) => ({ m, p })));
  // (1) the 'aa' viseme ~15% less jaw (every primitive's target of that name, so the teeth and the mouth's inside follow)
  let na = 0; const seenA = new Set(); for (const { p } of prims) for (const t of p.listTargets()) if (t.getName() === 'viseme_aa') { const acc = t.getAttribute('POSITION'); if (seenA.has(acc)) continue; seenA.add(acc); const A = acc.getArray().slice(); for (let i = 0; i < A.length; i++) A[i] *= K.aa; acc.setArray(A); na++; }
  // (2) the mouth's inside: a gradient by depth (a dark rose just behind the lips to near black at the back), COLOR_0
  const mi = prims.find(({ p }) => p.getMaterial()?.getName() === 'mouth-inside'); let nmi = 0;
  if (mi) { const P = mi.p.getAttribute('POSITION').getArray(), np = P.length / 3; let zmax = -9, zmin = 9; for (let v = 0; v < np; v++) { zmax = Math.max(zmax, P[v * 3 + 2]); zmin = Math.min(zmin, P[v * 3 + 2]); }
    const col = new Float32Array(np * 4), lo = [0.012, 0.004, 0.004], hi = [0.22, 0.06, 0.06];
    for (let v = 0; v < np; v++) { const t = Math.pow(clamp((P[v * 3 + 2] - zmin) / Math.max(1e-4, zmax - zmin)), 2.2) * (P[v * 3 + 1] < MOUTHY ? 1 : 0.6); for (let k = 0; k < 3; k++) col[v * 4 + k] = lo[k] + (hi[k] - lo[k]) * t; col[v * 4 + 3] = 1; nmi++; }
    const buf = R.listBuffers()[0]; mi.p.setAttribute('COLOR_0', doc.createAccessor().setType('VEC4').setArray(col).setBuffer(buf)); mi.p.getMaterial().setBaseColorFactor([1, 1, 1, 1]); }
  // (3) a tongue: a flattened, rounded body on the mouth's floor behind the lower teeth, riding the lower teeth (each point
  // takes the nearest lower-tooth point's skin weights and morph deltas: it opens with the jaw and the visemes)
  let ntg = 0;
  const tl = prims.find(({ p }) => p.getMaterial()?.getName() === 'teethLow');
  if (K.tongue && tl) { const p0 = tl.p, P = p0.getAttribute('POSITION').getArray(), used = [...new Set(p0.getIndices().getArray())];
    let lo = [9, 9, 9], hi = [-9, -9, -9]; for (const v of used) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], P[v * 3 + k]); hi[k] = Math.max(hi[k], P[v * 3 + k]); }
    // (the tongue's body: inside the lower arch, its tip just behind the front teeth, its top a little under their edges)
    const cx = 0, rx = (hi[0] - lo[0]) * 0.36, rz = (hi[2] - lo[2]) * 0.62, cz = hi[2] - rz - (hi[2] - lo[2]) * 0.2, ry = (hi[1] - lo[1]) * 0.42, cy = hi[1] - ry * 0.92;
    const NU = 24, NV = 12, pos = [], nrm = [], idx = [];
    for (let j = 0; j <= NV; j++) { const th = (j / NV) * Math.PI / 2; for (let i = 0; i < NU; i++) { const ph = (i / NU) * Math.PI * 2;
      const ex = Math.cos(th) * Math.sin(ph), ez = Math.cos(th) * Math.cos(ph), ey = Math.sin(th);
      // (a soft middle groove along the top)
      const groove = 1 - 0.18 * Math.exp(-((ex / 0.25) ** 2)) * ey;
      pos.push(cx + rx * ex, cy + ry * ey * groove - ry * 0.25 * (1 - ey), cz + rz * ez); const nx = ex / rx, ny = ey / ry, nz = ez / rz, L = Math.hypot(nx, ny, nz) || 1; nrm.push(nx / L, ny / L, nz / L); } }
    for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) { const a = j * NU + i, b = j * NU + ((i + 1) % NU), c = a + NU, d = b + NU; idx.push(a, b, c, b, d, c); }
    const np = pos.length / 3, near = new Int32Array(np);
    for (let v = 0; v < np; v++) { let best = 9, q = used[0]; for (const u of used) { const dd = Math.hypot(P[u * 3] - pos[v * 3] * 0.6, P[u * 3 + 1] - pos[v * 3 + 1], P[u * 3 + 2] - pos[v * 3 + 2]); if (dd < best) { best = dd; q = u; } } near[v] = q; }
    const J0 = p0.getAttribute('JOINTS_0'), W0 = p0.getAttribute('WEIGHTS_0'), j0 = J0.getArray(), w0 = W0.getArray();
    const J = new j0.constructor(np * 4), W = new w0.constructor(np * 4); for (let v = 0; v < np; v++) for (let k = 0; k < 4; k++) { J[v * 4 + k] = j0[near[v] * 4 + k]; W[v * 4 + k] = w0[near[v] * 4 + k]; }
    const buf = R.listBuffers()[0], acc = (type, arr) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buf);
    const mat = doc.createMaterial('tongue').setBaseColorFactor([...K.col, 1]).setRoughnessFactor(0.42).setMetallicFactor(0);
    const tp = doc.createPrimitive().setMaterial(mat).setIndices(acc('SCALAR', Uint16Array.from(idx))).setAttribute('POSITION', acc('VEC3', Float32Array.from(pos))).setAttribute('NORMAL', acc('VEC3', Float32Array.from(nrm)))
      .setAttribute('JOINTS_0', acc('VEC4', J)).setAttribute('WEIGHTS_0', acc('VEC4', W).setNormalized(W0.getNormalized()));
    for (const t of p0.listTargets()) { const D = t.getAttribute('POSITION').getArray(), out = new Float32Array(np * 3); for (let v = 0; v < np; v++) for (let k = 0; k < 3; k++) out[v * 3 + k] = D[near[v] * 3 + k];
      tp.addTarget(doc.createPrimitiveTarget(t.getName()).setAttribute('POSITION', acc('VEC3', out))); }
    tl.m.addPrimitive(tp); ntg = np;
    console.log('mouth6: tongue', np, 'points, box', [rx, ry, rz].map((q) => (q * 1000).toFixed(1)).join('x'), 'mm at', [cx, cy, cz].map((q) => q.toFixed(4)).join(','));
  }
  console.log('mouth6: aa targets', na, 'x', K.aa, '; mouth inside coloured', nmi, '; tongue', ntg);
}

// the round's tuned settings (each still overridable by its JH_* env)
export const R6 = {
  // (the rest smile: the lower lip no longer rolled in (it read pressed, a tight-lipped smirk), the cheeks raised so the
  // smile reaches the eyes)
  grin: [['jawOpen', 0.0], ['mouthSmileLeft', 0.5], ['mouthSmileRight', 0.5], ['mouthStretchLeft', 0.16], ['mouthStretchRight', 0.16], 
    ['mouthUpperUpLeft', 0.12], ['mouthUpperUpRight', 0.12], ['cheekSquintLeft', 0.28], ['cheekSquintRight', 0.28], ['browInnerUp', 0.15], ['browOuterUpLeft', 0.5], ['browOuterUpRight', 0.5], ['eyeWideLeft', 0.12], ['eyeWideRight', 0.12]],
  // (the hair: the crown ~10% lower, the volume pushed back and out over the ears, clump widths varied ~3x with crossing
  // sweeps, a softer, more irregular front edge, seven thicker tapered flyaways rooted in the locks)
  hair: { groove: 0.85, fine: 0.0021, top: 0.0095, quiff: 0.0095, crown: 0.0095, sideTrim: 0.03, side: 0.0105, backTrim: 0.12, sideLow: 0.3, depthLow: 0.35, low: [0.17, 0.19, 0.24], edgeJit: 0.0065, fadeW: 0.0065, breakup: 0.75,
    clumps: [[-124, 12, 140, -4, 31, 0.8, 2], [-98, 24, 148, -6, 29, 0.9, 4], [-66, 10, 156, -2, 30, 1.0, 2], [-46, 22, 150, -6, 36, 0.95, 4], [-22, 9, 160, 22, 28, 1.1, 2], [4, 26, 164, -14, 27, 1.1, 5],
      [26, 10, 152, -26, 40, 0.95, 2], [42, 18, 160, 8, 30, 0.95, 3], [62, 9, 154, -18, 33, 0.9, 2], [78, 20, 150, 4, 38, 0.85, 3], [100, 12, 148, 6, 31, 0.9, 2], [122, 22, 140, 4, 32, 0.8, 4]],
    locks: [[-34, 16, 112, -18, 0.0055, 28, 0.0035, 3], [-8, 9, 122, 4, 0.007, 27, 0.0045, 2], [12, 20, 116, -22, 0.005, 29, 0.004, 4], [38, 8, 105, 10, 0.0035, 31, 0.003, 2]],
    wisps: [[-100, 97, 18, 0.0035, 7], [-46, 70, 16, 0.0035, 4], [-12, 77, 14, 0.0045, 5], [20, 75, 16, 0.0035, -5], [52, 92, 15, 0.0035, -7], [88, 90, 14, 0.003, -3], [124, 60, 16, 0.0035, 6]],
    wispR0: 0.0011, wispR1: 0.00022, wispRoot: 0.45 },
  // (the browline bar ~30% thicker: 1.9 -> 2.5 x)
  glassesBig: { bar: 2.5 },
};
