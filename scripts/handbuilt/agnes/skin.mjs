// Hand-built Agnes (Pickup Time's Nanny, 74), the skin pass: her skin texture redrawn texel by texel from where each
// texel is on her (the bind pose), the old boss's skin pass (scripts/handbuilt/old-boss/skin.mjs, itself Mr. Big's second
// pass) re-measured for her face and made for a woman in her seventies (no beard, no scalp):
//  tone     the forge's pale pink-cream taken to a soft warm light skin (one gain per channel to a target cheek), mottled
//           at three sizes; a little rose at the cheeks and the nose; faint lentigines (age spots) at the temples, the
//           cheekbones, the backs of the hands
//  lids     the forge's natural make-up (an orange-peach lid) taken back to skin, a soft taupe in the crease
//  age      eye bags and a darker upper-lid crease, under-eye folds, forehead lines, glabella, crow's feet, the
//           nose-to-mouth fold, marionette lines, fine vertical lines over the upper lip, rings on the neck (normal map
//           and a little colour); the jaw's edge a shade softer
//  lips     thin, a muted rose, matte-satin
//  hands    to the face's tone, creases at the knuckles, a few soft veins, spots
//  normal   (new, 2048) from the height field; rough (new, 1024, G): matte cheeks, a little T-zone sheen
import { body, prim, matOf, raster, fbm, h3, sm, clamp, rgba, setWebp, sharp, THREE } from '../young-hero/glb.mjs';
// her landmarks (her forge base: extras forge.landmarks ey 1.5582, mouth 64.6 mm under the eyes, chin 109 mm, eye
// front 0.1607; the skin's profile: nose tip 1.5231 / 0.1929; the eyes' centres x 0.0283)
export const EY = 1.5582, EYEFRONT = 0.1607, EZ = 0.1477, EYEX = 0.0283, MOUTHY = 1.4936, CHINY = 1.4492, MH = 0.0212;
export const NOSE = [0, 1.5231, 0.1929];
const LM = { EY, EYEFRONT, EZ, EYEX, MOUTHY, CHINY, MH, NOSE };
export async function paintSkin(doc, K = {}) {
  K = { handTone: 0.92, target: [192, 154, 124], age: 1, spots: 1, lines: 1, lc: 0.45, lids: 1, lipCol: [176, 112, 110], ...K };
  // (another face's landmarks may be given: K.lm, the same names; Milo's skin pass uses this one with his)
  const { EY, EZ, EYEX, MOUTHY, CHINY, MH, NOSE } = { ...LM, ...(K.lm || {}) };
  const B = body(doc), p = B.pos, uv = B.uv.getArray(), mat = matOf(doc, 'skin'), tex = mat.getBaseColorTexture();
  const { data: src, w: S } = await rgba(tex), N2 = S * S;
  const tris = prim(doc, 'skin').flatMap((q) => [...q.getIndices().getArray()]);
  const wHand = B.wOn(/^(wrist|finger)/), wFoot = B.wOn(/^(foot|toe)/), wHead = B.wOn(/^head$/), wNeck = B.wOn(/^neck/);
  const ibm = B.skin.getInverseBindMatrices().getArray(), jp = (nm) => new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray(ibm, B.names.indexOf(nm) * 16).invert());
  const uvS = (v) => [uv[v * 2] * S, uv[v * 2 + 1] * S];
  const pos = new Float32Array(N2 * 3).fill(NaN), hw = new Float32Array(N2), fw = new Float32Array(N2), headW = new Float32Array(N2), neckW = new Float32Array(N2), mpt = new Float32Array(N2);
  let lastT = -1, lastM = 0;
  raster(tris, uvS, S, (x, y, l1, l2, l3, a, b, c) => {
    const i = y * S + x; for (let k = 0; k < 3; k++) pos[i * 3 + k] = l1 * p[a * 3 + k] + l2 * p[b * 3 + k] + l3 * p[c * 3 + k];
    hw[i] = l1 * wHand[a] + l2 * wHand[b] + l3 * wHand[c]; fw[i] = l1 * wFoot[a] + l2 * wFoot[b] + l3 * wFoot[c]; headW[i] = l1 * wHead[a] + l2 * wHead[b] + l3 * wHead[c]; neckW[i] = l1 * wNeck[a] + l2 * wNeck[b] + l3 * wNeck[c];
    const key = a * 1e6 + b * 7 + c; if (key !== lastT) { lastT = key; const P = [a, b, c].map((v) => new THREE.Vector3(p[v * 3], p[v * 3 + 1], p[v * 3 + 2])), U = [uvS(a), uvS(b), uvS(c)];
      const a3 = P[1].clone().sub(P[0]).cross(P[2].clone().sub(P[0])).length() / 2, a2 = Math.abs((U[1][0] - U[0][0]) * (U[2][1] - U[0][1]) - (U[2][0] - U[0][0]) * (U[1][1] - U[0][1])) / 2; lastM = a2 > 1e-9 ? Math.sqrt(a3 / a2) : 0; }
    mpt[i] = lastM;
  }, 0.03);
  const lin = (c) => Math.pow(c / 255, 2.2), enc = (l) => Math.min(255, Math.max(0, Math.round(255 * Math.pow(Math.max(0, l), 1 / 2.2))));
  const mean = (f) => { const s = [0, 0, 0]; let n = 0; for (let i = 0; i < N2; i++) if (!Number.isNaN(pos[i * 3]) && f(i)) { for (let k = 0; k < 3; k++) s[k] += lin(src[i * 4 + k]); n++; } return s.map((x) => x / Math.max(1, n)); };
  const cheek = mean((i) => { const x = Math.abs(pos[i * 3]), y = pos[i * 3 + 1], z = pos[i * 3 + 2]; return headW[i] > 0.9 && x > 0.035 && x < 0.055 && y > EY - 0.045 && y < EY - 0.02 && z > EZ - 0.04; });
  const hand = mean((i) => hw[i] > 0.8), foot = mean((i) => fw[i] > 0.8);
  const T = K.target.map(lin), kT = T.map((t, k) => t / cheek[k]);
  const kH = T.map((t, k) => (t * K.handTone) / hand[k]), kF = T.map((t, k) => (foot[k] > 1e-6 ? (t * 0.95) / foot[k] : kT[k]));
  console.log('tone cheek', cheek.map(enc), '->', K.target, 'hand', hand.map(enc));
  // (the lips: the red texels round the mouth, grown and softened)
  const lipM = Buffer.alloc(N2); for (let i = 0; i < N2; i++) { if (Number.isNaN(pos[i * 3])) continue; const x = Math.abs(pos[i * 3]), y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    if (x < MH + 0.004 && Math.abs(y - MOUTHY) < 0.014 && z > EZ - 0.01 && src[i * 4] - src[i * 4 + 1] > 30 && src[i * 4] > 100) lipM[i] = 255; }
  const lipB = await sharp(lipM, { raw: { width: S, height: S, channels: 1 } }).blur(2.2).extractChannel(0).raw().toBuffer();
  let hs = 0, hn = 0; const out = Buffer.from(src), hgt = new Float32Array(N2), rough = new Float32Array(N2).fill(0.64);
  const g2 = (dx, dy, dz, sx, sy, sz) => Math.exp(-((dx / sx) ** 2 + (dy / sy) ** 2 + (dz / sz) ** 2));
  const fingers = []; for (const s of ['L', 'R']) for (let f = 1; f <= 5; f++) { const j = [1, 2, 3].map((k) => jp(`finger${f}-${k}_${s}`)), d = j[2].clone().sub(j[1]); fingers.push({ s, f, j, tip: j[2].clone().addScaledVector(d.normalize(), f === 1 ? 0.026 : 0.022) }); }
  const wr = { L: jp('wrist_L'), R: jp('wrist_R') };
  const handN = {}; for (const s of ['L', 'R']) { const F = jp(`finger3-1_${s}`).sub(wr[s]).normalize(), A = jp(`finger2-1_${s}`).sub(jp(`finger5-1_${s}`)); A.addScaledVector(F, -A.dot(F)).normalize(); handN[s] = (s === 'R' ? new THREE.Vector3().crossVectors(A, F) : new THREE.Vector3().crossVectors(F, A)).normalize(); }
  const mixL = (c, t, w) => c.map((x, k) => x * (1 - w) + t[k] * w);
  let nSpots = 0;
  for (let i = 0; i < N2; i++) {
    if (Number.isNaN(pos[i * 3])) continue;
    const x0 = pos[i * 3], x = Math.abs(x0), y = pos[i * 3 + 1], z = pos[i * 3 + 2], th = hw[i], tf = fw[i];
    let c = [0, 1, 2].map((k) => lin(src[i * 4 + k]) * (kT[k] * (1 - th - tf) + kH[k] * th + kF[k] * tf));
    // mottling at three sizes (softer than a man's: fine skin, a little blotchy)
    const m1 = fbm(x0, y, z, 18) - 0.5, m2 = fbm(x0, y, z, 70) - 0.5, m3 = fbm(x0, y, z, 260, 2) - 0.5;
    c = c.map((v, k) => v * (1 + 0.07 * m1 * [1, 1.15, 1.25][k] + 0.05 * m2 * [1, 1.1, 1.2][k] + 0.03 * m3));
    let h = 0, ro = 0.64;
    const face = headW[i] > 0.5 && y > CHINY - 0.03 && z > EZ - 0.09;
    // age spots: sparse, soft, light brown (temples, cheekbones, forehead, hands, a few on the neck and chest)
    if (K.spots) { const zone = face ? sm(0.03, 0.06, x) + 0.5 * sm(EY + 0.03, EY + 0.06, y) : th > 0.4 ? 1 : neckW[i] > 0.3 ? 0.4 : 0;
      if (zone > 0.05) { const q = 260, cx = Math.floor(x0 * q), cy = Math.floor(y * q), cz = Math.floor(z * q); let sp = 0;
        for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let d = -1; d <= 1; d++) { const r = h3(cx + a, cy + b, cz + d); if (r > 0.035) continue;
          const px = (cx + a + h3(cx + a, cy + b, 3)) / q, py = (cy + b + h3(cx + a, cy + b, 5)) / q, pz = (cz + d + h3(cx + a, cz + d, 7)) / q, rr = 0.0012 + 0.0016 * h3(cx + a, cy + b, cz + d + 9);
          sp = Math.max(sp, Math.exp(-(((x0 - px) ** 2 + (y - py) ** 2 + (z - pz) ** 2) / (rr * rr)))); }
        sp *= zone; if (sp > 0.05) nSpots++; c = c.map((v, k) => v * (1 - sp * [0.14, 0.2, 0.28][k])); } }
    if (face) {
      // rose at the cheeks' apples and the nose (faint)
      const nz = g2(x0, y - NOSE[1], z - NOSE[2], 0.012, 0.014, 0.03), ck = g2(x - 0.045, y - (EY - 0.033), 0, 0.02, 0.016, 1) * sm(EZ - 0.05, EZ - 0.02, z);
      const red = Math.min(1, 0.3 * nz + 0.45 * ck); c[0] *= 1 + 0.03 * red; c[1] *= 1 - 0.09 * red; c[2] *= 1 - 0.06 * red;
      const ex = x - EYEX;
      // the lids: the forge's peach shadow back to skin (a soft taupe in the crease)
      if (K.lids) { const lidA = g2(ex, y - (EY + 0.006), 0, 0.019, 0.007, 1) * sm(EZ - 0.03, EZ - 0.005, z);
        if (lidA > 0.02) { const sk = T.map((t) => t * 0.93), taupe = [lin(150), lin(126), lin(118)], crease = g2(ex, y - (EY + 0.009), 0, 0.016, 0.0025, 1);
          c = mixL(c, mixL(sk, taupe, 0.45 * crease), clamp(lidA * 1.2)); } }
      if (K.age) {
        const bag = g2(ex, y - (EY - 0.016), 0, 0.017, 0.007, 1) * sm(EZ - 0.03, EZ - 0.005, z), lid = g2(ex, y - (EY + 0.009), 0, 0.016, 0.0026, 1) * sm(EZ - 0.03, EZ - 0.005, z);
        const dk = 1 - 0.13 * bag - 0.12 * lid; c = c.map((v, k) => v * dk * (k === 2 ? 1.02 : 1));
        for (const [fy, a] of [[0.02, 1], [0.026, 0.6]]) { const foldY = EY - fy - 0.009 * (ex / 0.02) ** 2, fold = Math.exp(-(((y - foldY) / 0.001) ** 2)) * sm(0.024, 0.01, Math.abs(ex)) * sm(EZ - 0.03, EZ - 0.01, z) * a; h -= 0.00005 * fold; c = c.map((v) => v * (1 - 0.06 * fold)); }
        if (K.lines) {
          // forehead lines: 3 soft wavy ones
          if (x < 0.058 && y > EY + 0.024 && y < EY + 0.075 && z > EZ - 0.045) { const yy = y + 0.0016 * Math.sin(x0 * 70) + 0.002 * (fbm(x0, y, z, 40) - 0.5); let g = 0;
            for (let L = 0; L < 3; L++) { const ly = EY + 0.034 + L * 0.0115; g = Math.max(g, Math.exp(-(((yy - ly) / 0.0008) ** 2)) * (1 - 0.25 * L)); }
            g *= sm(0.055, 0.032, x) * sm(EZ - 0.045, EZ - 0.02, z) * (0.6 + 0.6 * (fbm(x0, y, z, 90) - 0.2)); h -= 0.00005 * g; c = c.map((v) => v * (1 - K.lc * 0.045 * g)); }
          // glabella: two faint verticals
          { const g = Math.exp(-(((x - 0.006) / 0.0007) ** 2)) * sm(EY + 0.004, EY + 0.01, y) * sm(EY + 0.028, EY + 0.02, y) * sm(EZ, EZ + 0.01, z) * 0.7; h -= 0.00004 * g; c = c.map((v) => v * (1 - K.lc * 0.04 * g)); }
          // crow's feet
          { const cx = x - (EYEX + 0.02), cy = y - (EY + 0.001), r = Math.hypot(cx, cy); if (cx > 0 && r > 0.003 && r < 0.02 && z > EZ - 0.06) { const th0 = Math.atan2(cy, cx); let g = 0;
            for (const tk of [-0.5, -0.15, 0.2, 0.5]) g = Math.max(g, Math.exp(-(((th0 - tk) * r / 0.0006) ** 2))); g *= sm(0.003, 0.006, r) * sm(0.02, 0.012, r); h -= 0.000045 * g; c = c.map((v) => v * (1 - K.lc * 0.05 * g)); } }
          // the nose-to-mouth fold
          { const tr0 = (NOSE[1] - 0.004 - y) / 0.03, t0 = clamp(tr0), fx = 0.019 + 0.011 * t0, d = x - fx; const g = Math.exp(-((d / 0.0018) ** 2)) * sm(-0.1, 0.05, tr0) * sm(1.1, 0.85, t0) * sm(EZ - 0.01, EZ + 0.005, z); h -= 0.00007 * g; c = c.map((v) => v * (1 - K.lc * 0.07 * g)); }
          // marionette lines: from the mouth's corners down
          { const t0 = (MOUTHY - 0.004 - y) / 0.022, fx = MH + 0.002 + 0.003 * clamp(t0), d = x - fx; const g = Math.exp(-((d / 0.0014) ** 2)) * sm(-0.05, 0.1, t0) * sm(1, 0.7, t0) * sm(EZ - 0.02, EZ, z) * 0.75; h -= 0.00005 * g; c = c.map((v) => v * (1 - K.lc * 0.05 * g)); }
          // fine verticals over the upper lip
          if (x < MH && y > MOUTHY + 0.004 && y < NOSE[1] - 0.012 && z > EZ) { const ln = Math.pow(Math.max(0, Math.sin(x0 * 900 + 4 * fbm(x0, y, z, 200))), 12) * sm(MOUTHY + 0.004, MOUTHY + 0.007, y) * sm(MOUTHY + 0.014, MOUTHY + 0.008, y); h -= 0.00002 * ln; }
        }
      }
      // lips: thin, a muted rose, satin
      { const lb = lipB[i] / 255; if (lb > 0.05) { ro = ro * (1 - lb) + 0.48 * lb; const ln = Math.sin(x0 * 2400 + 3 * fbm(x0, y, z, 300)); h -= 0.000016 * lb * Math.max(0, ln) ** 6; c = mixL(c, K.lipCol.map(lin), 0.4 * lb); } }
      // pores and a little T-zone sheen
      const area = sm(EZ - 0.06, EZ - 0.02, z) * (0.5 + 0.5 * Math.min(1, g2(x0, y - NOSE[1], 0, 0.022, 0.025, 1) + g2(x - 0.045, y - (EY - 0.03), 0, 0.025, 0.02, 1)));
      const pit = h3(Math.floor(x0 * 2400), Math.floor(y * 2400), Math.floor(z * 2400)) < 0.12 ? 1 : 0; h += area * (0.000009 * (fbm(x0, y, z, 2600, 2) - 0.5) - 0.000012 * pit);
      const tz = Math.max((1 - sm(0.02, 0.04, x)) * sm(EY - 0.06, EY - 0.04, y), g2(x0, y - NOSE[1], z - NOSE[2], 0.015, 0.02, 0.025));
      ro = Math.min(ro, 0.64 - 0.1 * tz) + 0.04 * (fbm(x0, y, z, 400) - 0.5);
    }
    // the neck: two soft horizontal rings, a little crepe
    if (neckW[i] > 0.3 && headW[i] < 0.6 && z > -0.02 && K.lines) { let g = 0; for (const ly of [CHINY - 0.035, CHINY - 0.06]) g = Math.max(g, Math.exp(-(((y + 0.002 * Math.sin(x0 * 40) - ly) / 0.0012) ** 2))); g *= sm(0.06, 0.03, x); h -= 0.00005 * g; c = c.map((v) => v * (1 - K.lc * 0.05 * g)); h += 0.000006 * (fbm(x0, y, z, 900, 2) - 0.5); }
    // hands: knuckle creases, soft veins
    if (th > 0.3) { const s = x0 > 0 ? 'L' : 'R', Nn = handN[s], P = new THREE.Vector3(x0, y, z);
      for (const fg of fingers) { if (fg.s !== s) continue; const pts = [...fg.j, fg.tip];
        for (let k = 0; k < 2; k++) { const a = pts[k], bb = pts[k + 1], ax = bb.clone().sub(a), L = ax.length(); ax.normalize(); const v = P.clone().sub(a), t = v.dot(ax); if (t < -0.012 || t > L + 0.004) continue;
          const rad = v.clone().addScaledVector(ax, -t), rl = rad.length(); if (rl > 0.015) continue; const side = rad.clone().normalize().dot(Nn);
          if (k > 0) { const cr = Math.exp(-((t / 0.0012) ** 2)) + 0.6 * Math.exp(-(((t + 0.003) / 0.001) ** 2)); h -= cr * (0.00003 + 0.00003 * Math.max(0, side)); c = c.map((q2) => q2 * (1 - 0.1 * cr)); } } }
      const vn = fbm(x0 * 0.3, y, z, 140, 2); const vein = Math.exp(-(((vn - 0.5) / 0.03) ** 2)) * sm(0.4, 0.9, th) * (1 - sm(0.9, 1, th)); h += 0.00003 * vein; c = c.map((q2, kk2) => q2 * (1 + [-0.03, -0.02, 0.05][kk2] * vein));
      ro = Math.max(ro, 0.56); }
    out[i * 4] = enc(c[0]); out[i * 4 + 1] = enc(c[1]); out[i * 4 + 2] = enc(c[2]);
    hgt[i] = mpt[i] > 0 ? h / mpt[i] : 0; if (h) { hs += Math.abs(hgt[i]); hn++; } rough[i] = clamp(ro, 0.3, 0.9);
  }
  // (off the islands: the edge colours grown out 6 texels so mip filtering never pulls the old cream in along a seam)
  { const on = new Uint8Array(N2); for (let i = 0; i < N2; i++) on[i] = Number.isNaN(pos[i * 3]) ? 0 : 1;
    for (let it = 0; it < 6; it++) { const add = []; for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const i = y * S + x; if (on[i]) continue; let n = 0; const sum = [0, 0, 0];
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= S || yy >= S) continue; const j = yy * S + xx; if (!on[j]) continue; n++; for (let k = 0; k < 3; k++) sum[k] += out[j * 4 + k]; }
        if (n) add.push([i, sum.map((v) => Math.round(v / n))]); }
      for (const [i, c3] of add) { on[i] = 1; for (let k = 0; k < 3; k++) out[i * 4 + k] = c3[k]; } } }
  await setWebp(tex, out, S, S, 90); console.log('spots', nSpots, 'height |h| mean (texels)', (hs / Math.max(1, hn)).toFixed(3));
  const nm = Buffer.alloc(N2 * 3), K2 = 8;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const i = y * S + x, H = (xx, yy) => { xx = Math.min(S - 1, Math.max(0, xx)); yy = Math.min(S - 1, Math.max(0, yy)); const j = yy * S + xx; return Number.isNaN(pos[j * 3]) ? hgt[i] : hgt[j]; }, hx = (H(x + 1, y) - H(x - 1, y)) / 2, hy = (H(x, y + 1) - H(x, y - 1)) / 2;
    const nx = -hx * K2, ny = hy * K2, l = Math.hypot(nx, ny, 1); nm[i * 3] = Math.round((nx / l * 0.5 + 0.5) * 255); nm[i * 3 + 1] = Math.round((ny / l * 0.5 + 0.5) * 255); nm[i * 3 + 2] = Math.round((1 / l * 0.5 + 0.5) * 255); }
  const nt = doc.createTexture('skin-normal'); nt.setImage(await sharp(nm, { raw: { width: S, height: S, channels: 3 } }).webp({ quality: 92, effort: 5 }).toBuffer()).setMimeType('image/webp');
  mat.setNormalTexture(nt); mat.getNormalTextureInfo().setTexCoord(0);
  const R1 = S >> 1, rm = Buffer.alloc(R1 * R1 * 3); for (let y = 0; y < R1; y++) for (let x = 0; x < R1; x++) { let s = 0; for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) s += rough[(y * 2 + dy) * S + x * 2 + dx]; const i = (y * R1 + x) * 3; rm[i] = 255; rm[i + 1] = Math.round((s / 4) * 255); rm[i + 2] = 0; }
  const mt = mat.getMetallicRoughnessTexture() || doc.createTexture('skin-mr'); mt.setImage(await sharp(rm, { raw: { width: R1, height: R1, channels: 3 } }).webp({ quality: 90 }).toBuffer()).setMimeType('image/webp');
  mat.setMetallicRoughnessTexture(mt).setRoughnessFactor(1).setMetallicFactor(0);
}
