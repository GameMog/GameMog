// Hand-built Carissa, the skin pass: the young mother's (scripts/handbuilt/young-mother/skin.mjs, itself the young hero's
// and Mr. Big's second pass) re-measured for her face (eye centre 1.5636 / 0.1314, the mouth 65.2 mm under the eyes) and
// for a woman of 36: the forge's olive-grey base (cheek about 150/140/104) taken to a warm light-medium (K.cheek) by one
// gain per channel, the young mother's make-up kept, and age read added in the normal map and the colour: a faint
// nose-to-mouth fold, soft lines at the outer eye corners, a little under-eye shade, slightly more skin texture.
// Her face is read in the young hero's frame (toHero), so his face landmarks place her features.
//  hairline the forge's painted fringe (black jagged spikes down the forehead and temples, under the hair's blunt
//           fringe) erased to forehead skin, and a soft natural hairline painted at the new front edge: a slight widow's
//           curve, fine upward hairs feathered over ~8 mm, dark brown not black, the part on her left
//  clean    two red hexagonal blots by the mouth corners and the dark smudge on the ears (the scalp's paint) repainted
//  colour   fine mottling (half the young hero's), a soft warm flush on the cheeks and the nose tip
//  make-up  natural: the upper lids a warm taupe, a soft dark lash line, a hint of rose blush, nude-rose lips with a
//           darker border and a lighter centre (glossy in the roughness)
//  brows    the grey skin patches under the brow cards (they made a heavy, scowling brow) faded out, a finer brow painted:
//           tapered from a soft inner start to a thin tail, a gentle arch peaking at 2/3, dark brown, hair-stroked
//  hands    matched to her cheek's tone (they were lighter and pinker), the bake softened, nails (pale pink-beige,
//           glossy, a free-edge highlight), joint creases, knuckles
//  normal   (new, 2048) from a height field: very fine pores (nose and cheeks), lip lines, creases, nails, knuckles
//  rough    (new, 1024, G) a soft T-zone sheen, glossy lips and nails, matte elsewhere
import { body, prim, matOf, raster, fbm, h3, noise3, sm, clamp, rgba, setWebp, sharp, THREE } from '../young-hero/glb.mjs';
export const TONE = { gain: [1, 1, 1] };
export async function paintSkin(doc, K = {}) {
  K = { pores: 0.7, hands: 1, ears: 0, tone: 0.6, makeup: 1.3, brows: 1, browDrop: 0, hairline: 1, handTone: 0.95, part: 0.026, cheek: [182, 133, 105], age: -0.6, ...K };
  const B = body(doc), p = B.pos, uv = B.uv.getArray(), mat = matOf(doc, 'skin'), tex = mat.getBaseColorTexture();
  const { data: src, w: S } = await rgba(tex), N2 = S * S;
  const tris = prim(doc, 'skin').flatMap((q) => [...q.getIndices().getArray()]);
  // the young hero's landmarks, and the map from her face onto his
  const EY = 1.748, EYEFRONT = 0.1508, EZ = 0.138, EYEX = 0.033, MOUTHY = 1.672, CHINY = 1.627;
  const HE = [0.0331, 1.7473, 0.1417], ME = [0.0295, 1.5636, 0.1314], SX = 0.0331 / 0.0295, SY = 0.0753 / 0.06515, SZ = 1.12;
  const toHero = (x, y, z) => [x * SX, HE[1] + (y - ME[1]) * SY, HE[2] + (z - ME[2]) * SZ];
  const wHand = B.wOn(/^(wrist|finger)/), wFoot = B.wOn(/^(foot|toe)/), wHead = B.wOn(/^head$/);
  const ibm = B.skin.getInverseBindMatrices().getArray(), jp = (nm) => new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray(ibm, B.names.indexOf(nm) * 16).invert());
  const uvS = (v) => [uv[v * 2] * S, uv[v * 2 + 1] * S];
  const pos = new Float32Array(N2 * 3).fill(NaN), hw = new Float32Array(N2), fw = new Float32Array(N2), headW = new Float32Array(N2), mpt = new Float32Array(N2);
  let lastT = -1, lastM = 0;
  raster(tris, uvS, S, (x, y, l1, l2, l3, a, b, c) => {
    const i = y * S + x; for (let k = 0; k < 3; k++) pos[i * 3 + k] = l1 * p[a * 3 + k] + l2 * p[b * 3 + k] + l3 * p[c * 3 + k];
    hw[i] = l1 * wHand[a] + l2 * wHand[b] + l3 * wHand[c]; fw[i] = l1 * wFoot[a] + l2 * wFoot[b] + l3 * wFoot[c]; headW[i] = l1 * wHead[a] + l2 * wHead[b] + l3 * wHead[c];
    const key = a * 1e6 + b * 7 + c; if (key !== lastT) { lastT = key; const P = [a, b, c].map((v) => new THREE.Vector3(p[v * 3], p[v * 3 + 1], p[v * 3 + 2])), U = [uvS(a), uvS(b), uvS(c)];
      const a3 = P[1].clone().sub(P[0]).cross(P[2].clone().sub(P[0])).length() / 2, a2 = Math.abs((U[1][0] - U[0][0]) * (U[2][1] - U[0][1]) - (U[2][0] - U[0][0]) * (U[1][1] - U[0][1])) / 2; lastM = a2 > 1e-9 ? Math.sqrt(a3 / a2) : 0; }
    mpt[i] = lastM;
  }, 0.03);
  // (paint coverage mixed in display space, as a brush would: a linear mix of dark into skin reads as a grey veil)
  const mixS = (A, Bc, t) => A.map((c, k) => Math.pow(Math.pow(c, 1 / 2.2) * (1 - t) + Math.pow(Math.max(0, Bc[k]), 1 / 2.2) * t, 2.2));
  const lin = (c) => Math.pow(c / 255, 2.2), enc = (l) => Math.min(255, Math.max(0, Math.round(255 * Math.pow(Math.max(0, l), 1 / 2.2))));
  const mean = (f) => { const s = [0, 0, 0]; let n = 0; for (let i = 0; i < N2; i++) if (!Number.isNaN(pos[i * 3]) && f(i)) { for (let k = 0; k < 3; k++) s[k] += lin(src[i * 4 + k]); n++; } return s.map((x) => x / Math.max(1, n)); };
  const H = (i) => toHero(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
  const hand = mean((i) => hw[i] > 0.8), foot = mean((i) => fw[i] > 0.8);
  const cheek = mean((i) => { if (headW[i] < 0.9) return false; const [X, Y, Z] = H(i), x = Math.abs(X); return x > 0.035 && x < 0.055 && Y > EY - 0.045 && Y < EY - 0.02 && Z > EZ - 0.04; });
  // (the forehead's clean skin, between the brows and the forge's painted fringe, for the erased fringe)
  const brow0 = mean((i) => { if (headW[i] < 0.9) return false; const [X, Y, Z] = H(i), L = (src[i * 4] + src[i * 4 + 1] + src[i * 4 + 2]) / 3; return Math.abs(X) < 0.03 && Y > EY + 0.03 && Y < EY + 0.045 && Z > EZ - 0.02 && L > 120; });
  const fore = brow0[0] > 0.01 ? brow0 : cheek;
  const kH = cheek.map((f, k) => (f * K.handTone) / hand[k]), kF = cheek.map((f, k) => (f * 0.97) / foot[k]);
  const gain = K.cheek.map((c, k) => lin(c) / cheek[k]); TONE.gain = gain; const Lc0 = 0.2126 * cheek[0] + 0.7152 * cheek[1] + 0.0722 * cheek[2];
  const tr = (c) => { const L = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; return K.cheek.map((t, k) => 0.75 * lin(t) * (L / Lc0) + 0.25 * c[k] * gain[k]); }, foreT = tr(fore), cheekT = tr(cheek); console.log('tone gain', gain.map((x) => x.toFixed(2)));
  console.log('tone cheek', cheek.map(enc), 'forehead', fore.map(enc), 'hand', hand.map(enc), 'foot', foot.map(enc));
  const blur = await sharp(src, { raw: { width: S, height: S, channels: 4 } }).blur(5).raw().toBuffer();
  // (the erased fringe filled from its own neighbourhood: a normalised blur of only the light (skin) texels, so the fill
  // matches the forehead round it instead of one mean colour)
  const mA = Buffer.alloc(N2 * 3), mM = Buffer.alloc(N2); for (let i = 0; i < N2; i++) { const L = (src[i * 4] + src[i * 4 + 1] + src[i * 4 + 2]) / 3, ok = L > 165 ? 1 : 0; mM[i] = ok * 255; for (let k = 0; k < 3; k++) mA[i * 3 + k] = src[i * 4 + k] * ok; }
  const bA = await sharp(mA, { raw: { width: S, height: S, channels: 3 } }).blur(14).raw().toBuffer(), bM = await sharp(mM, { raw: { width: S, height: S, channels: 1 } }).blur(14).extractChannel(0).raw().toBuffer();
  // (the forge's fringe left a pale halo round its spikes: the forehead's broad brightness evened to the cheeks', its fine detail kept)
  const Lmap = Buffer.alloc(N2); for (let i = 0; i < N2; i++) Lmap[i] = Math.round((src[i * 4] + src[i * 4 + 1] + src[i * 4 + 2]) / 3);
  const Llow = await sharp(Lmap, { raw: { width: S, height: S, channels: 1 } }).blur(22).extractChannel(0).raw().toBuffer();
  const fill = (i) => bM[i] > 8 ? [0, 1, 2].map((k) => lin(Math.min(255, (bA[i * 3 + k] * 255) / bM[i]))) : null;
  let hs = 0, hn = 0, blots = 0, fringe = 0; const out = Buffer.from(src), hgt = new Float32Array(N2), rough = new Float32Array(N2).fill(0.66);
  const g2 = (dx, dy, dz, sx, sy, sz) => Math.exp(-((dx / sx) ** 2 + (dy / sy) ** 2 + (dz / sz) ** 2));
  const fingers = []; for (const s of ['L', 'R']) for (let f = 1; f <= 5; f++) { const j = [1, 2, 3].map((k) => jp(`finger${f}-${k}_${s}`)), d = j[2].clone().sub(j[1]); fingers.push({ s, f, j, tip: j[2].clone().addScaledVector(d.normalize(), f === 1 ? 0.024 : 0.019), d }); }
  const wr = { L: jp('wrist_L'), R: jp('wrist_R') };
  const handN = {}; for (const s of ['L', 'R']) { const F = jp(`finger3-1_${s}`).sub(wr[s]).normalize(), A = jp(`finger2-1_${s}`).sub(jp(`finger5-1_${s}`)); A.addScaledVector(F, -A.dot(F)).normalize(); handN[s] = (s === 'R' ? new THREE.Vector3().crossVectors(A, F) : new THREE.Vector3().crossVectors(F, A)).normalize(); }
  // her new front hairline (hero frame): y over x, a soft widow's curve, down the temples
  const partX = K.part * SX;
  // (HP-ym2: K.hairline as a function of her own x giving her own y: the higher, rounder adult hairline of pass 2)
  const hairY = typeof K.hairline === 'function' ? (X) => HE[1] + (K.hairline(X / SX) - ME[1]) * SY : (X) => { const x = Math.abs(X); return EY + 0.057 + 0.003 * sm(0.0, 0.03, x) - 0.006 * sm(0.045, 0.06, x) - 0.026 * sm(0.058, 0.075, x); };
  // the brow's curve: inner (x 0.012) to tail (x 0.056), peak at 2/3; centre line y and half-thickness
  const browC = (x) => { const u = (x - 0.012) / 0.044; return { y: EY + 0.0165 - K.browDrop + 0.0048 * Math.sin(Math.PI * Math.min(1, Math.max(0, u)) ** 0.85) - 0.003 * sm(0.75, 1.05, u), hw: 0.0036 * (1 - 0.62 * sm(0.1, 1.0, u)), u }; };
  const nose = [0, EY - 0.045, EYEFRONT + 0.025], dark = process.env.DBG ? [0, 1, 0] : [lin(24), lin(18), lin(15)];
  for (let i = 0; i < N2; i++) {
    if (Number.isNaN(pos[i * 3])) continue;
    const x0 = pos[i * 3], y0 = pos[i * 3 + 1], z0 = pos[i * 3 + 2], [X, Y, Z] = toHero(x0, y0, z0), x = Math.abs(X);
    let r = lin(src[i * 4]), g = lin(src[i * 4 + 1]), b = lin(src[i * 4 + 2]), h = 0, ro = 0.66;
    // (the tone: each texel's colour taken to K.cheek at its own lightness (the forge's base is olive-grey on the face and
    // pinker on the neck and chest, so one gain made the chest red: the skin-tone gate), a quarter of its own hue kept)
    { const L = 0.2126 * r + 0.7152 * g + 0.0722 * b, f = L / Lc0, T = K.cheek.map(lin); r = 0.75 * T[0] * f + 0.25 * r * gain[0]; g = 0.75 * T[1] * f + 0.25 * g * gain[1]; b = 0.75 * T[2] * f + 0.25 * b * gain[2]; }
    const isHead = headW[i] > 0.5, face = isHead && Y > CHINY - 0.06 && Z > EZ - 0.1;
    const th = K.hands ? sm(0.15, 0.7, hw[i]) : 0, tf = K.hands ? sm(0.15, 0.7, fw[i]) : 0;
    if (th > 0 || tf > 0) { const db = 0.55 * Math.max(th, tf); r = r * (1 - db) + lin(blur[i * 4]) * db; g = g * (1 - db) + lin(blur[i * 4 + 1]) * db; b = b * (1 - db) + lin(blur[i * 4 + 2]) * db;
      const k = th > tf ? kH : kF, t = Math.max(th, tf); r *= 1 + (k[0] - 1) * t; g *= 1 + (k[1] - 1) * t; b *= 1 + (k[2] - 1) * t; }
    // red blots (very saturated red texels on the head away from the lips)
    if (isHead) { const R0 = src[i * 4], G0 = src[i * 4 + 1]; const lipZone = x < 0.03 && Math.abs(Y - MOUTHY) < 0.014 && Z > EZ - 0.02;
      const blotZone = x > 0.018 && Y > CHINY - 0.025 && Y < MOUTHY + 0.02 && Z > EZ - 0.05;
      if (blotZone && !lipZone && R0 > 80 && R0 > 1.7 * G0) { r = cheekT[0]; g = cheekT[1]; b = cheekT[2]; blots++; } }
    // the fringe erased and the hairline drawn (the face's front half only; the scalp's paint elsewhere kept)
    if (K.hairline && isHead && Z > EZ - 0.075 && Y > EY + 0.024) {
      const L0 = (src[i * 4] + src[i * 4 + 1] + src[i * 4 + 2]) / 3, hy = hairY(X) + 0.002 * (fbm(X, Y, Z, 90) - 0.5);
      const strand = h3(Math.floor((X + 0.3 * (Y - hy)) * 2600), 0, 7), fine = (fbm(X * 3, Y, Z, 400) - 0.5);
      // coverage: 0 below the line, feathered up over ~8 mm, fine hairs reaching down 3 mm
      const cov = sm(hy - 0.0015, hy + 0.0045, Y + 0.0028 * (strand - 0.5) + 0.002 * fine);
      // the part: a thin line of scalp at partX on top
      const part = 0 * partX;
      const front = sm(EZ - 0.075, EZ - 0.05, Z) * (1 - sm(0.06, 0.072, x));
      if (true) { const tScalp = cov * (1 - part), f0 = fill(i), sk0 = (f0 || fore), Ls = 0.2126 * sk0[0] + 0.7152 * sk0[1] + 0.0722 * sk0[2], T0 = K.cheek.map(lin), sk = sk0.map((c, k) => (0.75 * T0[k] * (Ls / Lc0) + 0.25 * c * gain[k]) * (1 + 0.04 * (fbm(X, Y, Z, 60) - 0.5)));
        const skinMix = Math.max(sm(190, 120, L0), sm(EY + 0.026, EY + 0.034, Y)) * front; // erase the forge paint where it was dark
        let rr = r, gg = g, bb = b; if (skinMix > 0) { rr = r * (1 - skinMix) + sk[0] * skinMix; gg = g * (1 - skinMix) + sk[1] * skinMix; bb = b * (1 - skinMix) + sk[2] * skinMix; fringe++; }
        const tt = tScalp * front + (1 - front) * (L0 < 95 ? 1 : 0) * 0; const dv = 1 + 0.35 * fine; [r, g, b] = mixS([rr, gg, bb], dark.map((c) => c * dv), tt); }
    }
    if (K.hairline && isHead && Z > EZ - 0.06 && Y > EY + 0.02 && x < 0.06) {
      const Lc = (enc(cheek[0]) + enc(cheek[1]) + enc(cheek[2])) / 3 * 1.0, f = Math.max(0.86, Math.min(1.08, Lc / Math.max(40, Llow[i]))), t = sm(EY + 0.02, EY + 0.03, Y) * (1 - sm(0.05, 0.06, x)) * sm(110, 160, Lmap[i]);
      const m = 1 + (f - 1) * t; r *= m ** 2.2; g *= m ** 2.2; b *= m ** 2.2; }
    // (Carissa: the scalp under the hair one even dark brown (the forge's pale part stripe and pale patches showed
    // through the strand cards' gaps at the part as a grey patch)
    if (isHead && Y > hairY(X) + 0.004 && Y > EY + 0.035) { const t = 0.9 * sm(hairY(X) + 0.004, hairY(X) + 0.012, Y); [r, g, b] = mixS([r, g, b], [lin(30), lin(22), lin(18)], t); }
    // ears: the scalp paint out, skin in
    if (K.ears && isHead && x > 0.062 && Y > 1.69 && Y < 1.79 && Z > -0.022 && Z < 0.08) {
      const L0 = 0.2126 * r + 0.7152 * g + 0.0722 * b, Lc = 0.2126 * cheek[0] + 0.7152 * cheek[1] + 0.0722 * cheek[2], dk = sm(0.85, 0.45, L0 / Lc);
      const zone = sm(0.062, 0.07, x) * sm(1.69, 1.7, Y) * sm(1.79, 1.78, Y) * sm(-0.022, -0.012, Z) * sm(0.08, 0.07, Z);
      const rim = sm(0.078, 0.088, x), n = fbm(X, Y, Z, 160) - 0.5, t = dk * zone;
      if (t > 0) { const sh = 0.9 + 0.1 * n; r = r * (1 - t) + cheek[0] * sh * (1 + 0.1 * rim) * t; g = g * (1 - t) + cheek[1] * sh * (1 - 0.06 * rim) * t; b = b * (1 - t) + cheek[2] * sh * (1 - 0.08 * rim) * t; }
    }
    if (K.tone) { const n1 = fbm(X, Y, Z, 22) - 0.5, n2 = fbm(X + 4, Y, Z, 80) - 0.5, n3 = fbm(X + 9, Y, Z, 300, 2) - 0.5, gr = 1.6 * (noise3(X * 2200, Y * 2200, Z * 2200) - 0.5);
      const amp = K.tone * (face ? 1 : 0.8); r *= 1 + amp * (0.07 * n1 + 0.06 * n2 + 0.05 * n3 + 0.02 * gr); g *= 1 + amp * (0.06 * n1 + 0.05 * n2 + 0.045 * n3 + 0.02 * gr - 0.03 * Math.max(0, n2)); b *= 1 + amp * (0.05 * n1 + 0.05 * n2 + 0.04 * n3 + 0.02 * gr - 0.04 * Math.max(0, n2));
      h += (face ? 0 : 0.000006) * (fbm(X, Y, Z, 1800, 2) - 0.5); }
    if (face) {
      // brows: the old grey patches faded to skin, then the new brow
      if (K.brows) { const env = (1 - sm(0.058, 0.066, x)) * sm(0.006, 0.01, x) * g2(0, Y - (EY + 0.017 - 0.5 * K.browDrop), 0, 1, 0.011 + 0.5 * K.browDrop, 1) * sm(EZ - 0.03, EZ - 0.01, Z);
        if (env > 0.01) { const L0 = 0.2126 * r + 0.7152 * g + 0.0722 * b, Lf = 0.2126 * fore[0] + 0.7152 * fore[1] + 0.0722 * fore[2], t = env * sm(0.97, 0.6, L0 / Lf);
          r = r * (1 - t) + foreT[0] * t; g = g * (1 - t) + foreT[1] * t; b = b * (1 - t) + foreT[2] * t;
          const bc = browC(x), d = Math.abs(Y - bc.y) / bc.hw, inside = (1 - sm(0.7, 1.15, d)) * sm(0.004, 0.014, x) * (1 - sm(0.054, 0.06, x));
          // hair strokes: slanted up and out at the inner end, flatter along the tail
          const ang = 1.2 - 0.9 * clamp(bc.u), sx = (x * Math.cos(ang) + Y * Math.sin(ang)) * 5200, str = h3(Math.floor(sx), Math.floor((Y * Math.cos(ang) - x * Math.sin(ang)) * 900), 3);
          const a = inside * (0.5 + 0.32 * (str > 0.4 ? 1 : 0)) * (0.62 + 0.38 * sm(0.0, 0.35, bc.u));
          if (a > 0) { [r, g, b] = mixS([r, g, b], [lin(40), lin(29), lin(24)], a); } } }
      const nz = g2(X, Y - nose[1], Z - nose[2], 0.012, 0.018, 0.025), ck = g2(x - 0.045, Y - (EY - 0.03), 0, 0.022, 0.017, 1) * sm(EZ - 0.05, EZ - 0.02, Z);
      // flush and blush (rose), the nose tip a little warm
      const red = Math.min(1, 0.45 * nz + (0.55 + 0.35 * K.makeup) * ck); r *= 1 + 0.02 * red; g *= 1 - 0.1 * red; b *= 1 - 0.07 * red;
      const under = g2(x - EYEX - 0.002, Y - (EY - 0.016), 0, 0.015, 0.006, 1) * sm(EZ - 0.03, EZ - 0.005, Z), dk = 1 - 0.07 * under; r *= dk; g *= dk; b *= dk * 1.01;
      if (K.makeup) {
        // upper lid: warm taupe over the lid to the crease; the lash line a soft dark band at the lid's edge, longer out
        const lid = (1 - sm(0.048, 0.056, x)) * sm(0.012, 0.02, x) * g2(0, Y - (EY + 0.009), 0, 1, 0.005, 1) * sm(EZ - 0.01, EZ + 0.004, Z);
        r *= 1 - 0.1 * lid; g *= 1 - 0.17 * lid; b *= 1 - 0.16 * lid;
        const ly = EY + 0.0052 - 9 * (x - EYEX) ** 2 + 0.0012 * sm(0.04, 0.05, x), line = Math.exp(-(((Y - ly) / 0.0011) ** 2)) * sm(0.017, 0.022, x) * (1 - sm(0.05, 0.056, x)) * sm(EZ - 0.006, EZ + 0.004, Z);
        r *= 1 - 0.55 * line; g *= 1 - 0.58 * line; b *= 1 - 0.56 * line;
      }
      // lips: nude rose, the border darker, the centre lighter, lines, glossy
      const lipA = (1 - sm(0.021, 0.026, x)) * g2(0, Y - MOUTHY, 0, 1, 0.0085, 1) * sm(EYEFRONT - 0.002, EYEFRONT + 0.004, Z);
      if (lipA > 0.01) { const edge = Math.abs(Y - MOUTHY) / 0.0085, rim = sm(0.55, 0.85, edge) * (1 - sm(0.95, 1.2, edge)), cen = 1 - sm(0.1, 0.5, edge);
        const tint = K.makeup * lipA; r *= 1 + 0.03 * tint; g *= 1 - 0.13 * tint; b *= 1 - 0.07 * tint;
        r *= 1 - 0.08 * rim * lipA; g *= 1 - 0.14 * rim * lipA; b *= 1 - 0.1 * rim * lipA; r *= 1 + 0.05 * cen * lipA; g *= 1 + 0.04 * cen * lipA; b *= 1 + 0.04 * cen * lipA;
        const ln = Math.sin(X * 2400 + 3 * fbm(X, Y, Z, 300)); h -= 0.000012 * lipA * Math.max(0, ln) ** 6; ro = ro * (1 - lipA) + 0.3 * lipA; }
      // (pores: single fine pits on the nose and the cheeks only (a woman's forehead reads smooth), 0.17 mm cells)
      if (K.pores) { const area = sm(EZ - 0.06, EZ - 0.02, Z) * Math.min(1, g2(X, Y - nose[1], 0, 0.02, 0.022, 1) + g2(x - 0.045, Y - (EY - 0.03), 0, 0.022, 0.018, 1));
        const pit = h3(Math.floor(X * 6000), Math.floor(Y * 6000), Math.floor(Z * 6000)) < 0.08 ? 1 : 0; h += K.pores * area * (0.000005 * (fbm(X, Y, Z, 2600, 2) - 0.5) - 0.000008 * pit); }
      const tz = Math.max((1 - sm(0.02, 0.035, x)) * sm(EY - 0.06, EY - 0.04, Y) * (1 - sm(EY + 0.07, EY + 0.09, Y)), g2(X, Y - nose[1], Z - nose[2], 0.015, 0.02, 0.025));
      ro = Math.min(ro, 0.64 - 0.1 * tz) + 0.04 * (fbm(X, Y, Z, 400) - 0.5);
    }
    if (th > 0.3) { const s = x0 > 0 ? 'L' : 'R', Nn = handN[s], P = new THREE.Vector3(x0, y0, z0);
      for (const fg of fingers) { if (fg.s !== s) continue; const pts = [...fg.j, fg.tip];
        for (let k = 0; k < 3; k++) { const a = pts[k], bb = pts[k + 1], ax = bb.clone().sub(a), L = ax.length(); ax.normalize(); const v = P.clone().sub(a), t = v.dot(ax); if (t < -0.01 || t > L + 0.004) continue;
          const rad = v.clone().addScaledVector(ax, -t), rl = rad.length(); if (rl > 0.013) continue; const side = rad.clone().normalize().dot(Nn);
          if (k > 0) { const c = Math.exp(-((t / 0.0009) ** 2)) + 0.6 * Math.exp(-(((t + 0.0024) / 0.0008) ** 2)); h -= c * (0.00002 + 0.00003 * Math.max(0, side)); const dk2 = 1 - 0.09 * c; r *= dk2; g *= dk2 * 0.98; b *= dk2 * 0.98; }
          if (k === 2) { const u = t / L, back = -side, nl = sm(0.36, 0.46, u) * sm(1.04, 0.94, u) * sm(0.3, 0.55, back);
            if (nl > 0.01) { r *= 1 + 0.12 * nl; g *= 1 + 0.03 * nl; b *= 1 + 0.04 * nl; h += 0.00005 * nl; ro = ro * (1 - nl) + 0.24 * nl;
              const edge = sm(0.4, 0.46, u) * (1 - sm(0.46, 0.52, u)) * sm(0.35, 0.55, back); h -= 0.00003 * edge; const tip = sm(0.88, 0.98, u) * nl; r *= 1 + 0.12 * tip; g *= 1 + 0.12 * tip; b *= 1 + 0.12 * tip; } }
          if (k < 2) { const kn = Math.exp(-((t / 0.005) ** 2)) * sm(0.2, 0.7, -side); h += 0.00005 * kn; } } }
      ro = Math.max(ro, 0.5); }
    if (face && K.age) { // (36: a faint nose-to-mouth fold, fine lines at the outer eye corners, soft under-eye)
      const fx = 0.019 + 0.45 * (EY - 0.03 - Y), fold = Math.exp(-(((x - fx) / 0.0016) ** 2)) * sm(MOUTHY - 0.008, MOUTHY + 0.002, Y) * (1 - sm(EY - 0.035, EY - 0.026, Y)) * sm(EZ - 0.01, EZ + 0.005, Z);
      h -= 0.00004 * K.age * fold; r *= 1 - 0.035 * K.age * fold; g *= 1 - 0.05 * K.age * fold; b *= 1 - 0.045 * K.age * fold;
      const cx = x - 0.062, crow = sm(0.056, 0.062, x) * (1 - sm(0.072, 0.078, x)) * Math.exp(-(((Y - EY + 0.002) / 0.008) ** 2)) * Math.max(0, Math.sin((Y - EY + 0.03 * cx) * 1900)) ** 4;
      h -= 0.000012 * Math.max(0.3, K.age) * crow;
      const ue = g2(x - EYEX, Y - (EY - 0.013), 0, 0.012, 0.004, 1) * sm(EZ - 0.02, EZ, Z); h -= 0.00002 * K.age * Math.exp(-(((Y - (EY - 0.012)) / 0.0012) ** 2)) * sm(0.02, 0.03, x) * (1 - sm(0.048, 0.055, x)) * sm(EZ - 0.02, EZ, Z); r *= 1 - 0.03 * Math.max(0, K.age) * ue; g *= 1 - 0.045 * Math.max(0, K.age) * ue; b *= 1 - 0.03 * Math.max(0, K.age) * ue; }
    out[i * 4] = enc(r); out[i * 4 + 1] = enc(g); out[i * 4 + 2] = enc(b);
    hgt[i] = mpt[i] > 0 ? h / mpt[i] : 0; if (h) { hs += Math.abs(hgt[i]); hn++; } rough[i] = clamp(ro, 0.22, 0.9);
  }
  await setWebp(tex, out, S, S, 90); console.log('blots', blots, 'fringe texels erased', fringe, 'height |h| mean (texels)', (hs / Math.max(1, hn)).toFixed(3));
  const nm = Buffer.alloc(N2 * 3), K2 = 8;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const i = y * S + x, hx = (hgt[y * S + Math.min(S - 1, x + 1)] - hgt[y * S + Math.max(0, x - 1)]) / 2, hy = (hgt[Math.min(S - 1, y + 1) * S + x] - hgt[Math.max(0, y - 1) * S + x]) / 2;
    const nx = -hx * K2, ny = hy * K2, l = Math.hypot(nx, ny, 1); nm[i * 3] = Math.round((nx / l * 0.5 + 0.5) * 255); nm[i * 3 + 1] = Math.round((ny / l * 0.5 + 0.5) * 255); nm[i * 3 + 2] = Math.round((1 / l * 0.5 + 0.5) * 255); }
  const nt = doc.createTexture('skin-normal'); nt.setImage(await sharp(nm, { raw: { width: S, height: S, channels: 3 } }).webp({ quality: 92, effort: 5 }).toBuffer()).setMimeType('image/webp');
  mat.setNormalTexture(nt); mat.getNormalTextureInfo().setTexCoord(0);
  const R1 = 1024, rm = Buffer.alloc(R1 * R1 * 3); for (let y = 0; y < R1; y++) for (let x = 0; x < R1; x++) { let s = 0; for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) s += rough[(y * 2 + dy) * S + x * 2 + dx]; const i = (y * R1 + x) * 3; rm[i] = 255; rm[i + 1] = Math.round((s / 4) * 255); rm[i + 2] = 0; }
  const mt = mat.getMetallicRoughnessTexture() || doc.createTexture('skin-mr'); mt.setImage(await sharp(rm, { raw: { width: R1, height: R1, channels: 3 } }).webp({ quality: 90 }).toBuffer()).setMimeType('image/webp');
  mat.setMetallicRoughnessTexture(mt).setRoughnessFactor(1).setMetallicFactor(0);
}
