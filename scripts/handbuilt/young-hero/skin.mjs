// Hand-built young hero, the skin pass: his skin texture redrawn texel by texel from where each texel is on him (the
// bind pose), the Mr. Big second-pass way (MogCity .scratch/polish/leftovers/mrbig2/tools/tex.mjs), with his landmarks:
//  colour   tan mottling at three sizes (warm and cool), warmth at the nose, cheeks and ears, a cooler, deeper perioral
//           ring and under-eye, the lips' border defined; the hands and feet matched to the forearm's tone (they were ~9%
//           lighter and pinker) and their baked wrinkles softened; the ears repainted in skin (the scalp's black covered them);
//           stubble painted as follicles over the jaw, chin and upper lip (a clean line under the jaw)
//  normal   (new, 2048) from a height field: pores on the face (most on the nose and cheeks), a fine grain on the body,
//           the lips' vertical lines, creases at each finger joint and nails, knuckles
//  rough    (new, 1024, G) T-zone and nose shinier, lips wet, nails glossy, the stubble matte, the body softer
import { body, prim, matOf, raster, fbm, h3, sm, clamp, rgba, setWebp, sharp, THREE } from './glb.mjs';
export async function paintSkin(doc, K = {}) {
  K = { stubble: 1, pores: 1, hands: 1, ears: 1, tone: 1, under: 1, handTone: 0.93, ...K };
  const B = body(doc), p = B.pos, uv = B.uv.getArray(), mat = matOf(doc, 'skin'), tex = mat.getBaseColorTexture();
  const { data: src, w: S } = await rgba(tex), N2 = S * S;
  const tris = prim(doc, 'skin').flatMap((q) => [...q.getIndices().getArray()]);
  // landmarks (bind space, metres): eyes' centres and front, the mouth line, the chin
  const EY = 1.748, EYEFRONT = 0.1508, EZ = 0.138, EYEX = 0.033, MOUTHY = 1.672, CHINY = 1.627;
  const wHand = B.wOn(/^(wrist|finger)/), wFoot = B.wOn(/^(foot|toe)/), wHead = B.wOn(/^head$/), wFore = B.wOn(/^lowerarm/);
  const ibm = B.skin.getInverseBindMatrices().getArray(), jp = (nm) => new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray(ibm, B.names.indexOf(nm) * 16).invert());
  const uvS = (v) => [uv[v * 2] * S, uv[v * 2 + 1] * S];
  const pos = new Float32Array(N2 * 3).fill(NaN), hw = new Float32Array(N2), fw = new Float32Array(N2), headW = new Float32Array(N2), foreW = new Float32Array(N2), mpt = new Float32Array(N2);
  let lastT = -1, lastM = 0;
  raster(tris, uvS, S, (x, y, l1, l2, l3, a, b, c) => {
    const i = y * S + x; for (let k = 0; k < 3; k++) pos[i * 3 + k] = l1 * p[a * 3 + k] + l2 * p[b * 3 + k] + l3 * p[c * 3 + k];
    hw[i] = l1 * wHand[a] + l2 * wHand[b] + l3 * wHand[c]; fw[i] = l1 * wFoot[a] + l2 * wFoot[b] + l3 * wFoot[c]; headW[i] = l1 * wHead[a] + l2 * wHead[b] + l3 * wHead[c]; foreW[i] = l1 * wFore[a] + l2 * wFore[b] + l3 * wFore[c];
    const key = a * 1e6 + b * 7 + c; if (key !== lastT) { lastT = key; const P = [a, b, c].map((v) => new THREE.Vector3(p[v * 3], p[v * 3 + 1], p[v * 3 + 2])), U = [uvS(a), uvS(b), uvS(c)];
      const a3 = P[1].clone().sub(P[0]).cross(P[2].clone().sub(P[0])).length() / 2, a2 = Math.abs((U[1][0] - U[0][0]) * (U[2][1] - U[0][1]) - (U[2][0] - U[0][0]) * (U[1][1] - U[0][1])) / 2; lastM = a2 > 1e-9 ? Math.sqrt(a3 / a2) : 0; }
    mpt[i] = lastM;
  }, 0.03);
  const lin = (c) => Math.pow(c / 255, 2.2), enc = (l) => Math.min(255, Math.max(0, Math.round(255 * Math.pow(Math.max(0, l), 1 / 2.2))));
  // (tone references: the forearm's mean, the hands' and feet's means, the cheeks' mean)
  const mean = (f) => { const s = [0, 0, 0]; let n = 0; for (let i = 0; i < N2; i++) if (!Number.isNaN(pos[i * 3]) && f(i)) { for (let k = 0; k < 3; k++) s[k] += lin(src[i * 4 + k]); n++; } return s.map((x) => x / Math.max(1, n)); };
  const fore = mean((i) => foreW[i] > 0.8 && hw[i] < 0.01), hand = mean((i) => hw[i] > 0.8), foot = mean((i) => fw[i] > 0.8);
  const cheek = mean((i) => { const x = Math.abs(pos[i * 3]), y = pos[i * 3 + 1], z = pos[i * 3 + 2]; return headW[i] > 0.9 && x > 0.035 && x < 0.055 && y > EY - 0.045 && y < EY - 0.02 && z > EZ - 0.04; });
  const neck = mean((i) => { const y = pos[i * 3 + 1], z = pos[i * 3 + 2]; return y > 1.52 && y < 1.6 && z > 0.02 && hw[i] < 0.01; });
  console.log('tone neck', neck.map((x) => enc(x)));
  const ref = K.handRef === 'cheek' ? cheek : neck[0] > 0.01 ? neck : fore[0] > 0.01 ? fore : cheek, kH = ref.map((f, k) => (f * K.handTone) / hand[k]), kF = ref.map((f, k) => (f * 0.97) / foot[k]);
  console.log('tone fore', fore.map((x) => enc(x)), 'hand', hand.map((x) => enc(x)), 'foot', foot.map((x) => enc(x)), 'cheek', cheek.map((x) => enc(x)));
  // (the hands' de-bake: a blurred copy to pull the baked wrinkles toward)
  const blur = await sharp(src, { raw: { width: S, height: S, channels: 4 } }).blur(5).raw().toBuffer();
  let hs = 0, hn = 0; const out = Buffer.from(src), hgt = new Float32Array(N2), rough = new Float32Array(N2).fill(0.66);
  const g2 = (dx, dy, dz, sx, sy, sz) => Math.exp(-((dx / sx) ** 2 + (dy / sy) ** 2 + (dz / sz) ** 2));
  // the hands' joints (for creases and nails): per finger the joint chain and the tip
  const fingers = []; for (const s of ['L', 'R']) for (let f = 1; f <= 5; f++) { const j = [1, 2, 3].map((k) => jp(`finger${f}-${k}_${s}`)), d = j[2].clone().sub(j[1]); fingers.push({ s, f, j, tip: j[2].clone().addScaledVector(d.normalize(), f === 1 ? 0.028 : 0.022), d }); }
  const wr = { L: jp('wrist_L'), R: jp('wrist_R') };
  const handN = {}; for (const s of ['L', 'R']) { const F = jp(`finger3-1_${s}`).sub(wr[s]).normalize(), A = jp(`finger2-1_${s}`).sub(jp(`finger5-1_${s}`)); A.addScaledVector(F, -A.dot(F)).normalize(); handN[s] = (s === 'R' ? new THREE.Vector3().crossVectors(A, F) : new THREE.Vector3().crossVectors(F, A)).normalize(); }
  // beard / stubble share (after build-mrbig's beardOf, at his landmarks)
  const beardOf = (x0, y, z) => { const x = Math.abs(x0), nC = (fbm(x0, y, z, 55) - 0.5) * 0.006, nE = (fbm(x0 + 3, y, z, 45) - 0.5) * 0.008, nN = (fbm(x0, y + 5, z, 50) - 0.5) * 0.005;
    const cheekL = MOUTHY + 0.008 + Math.max(0, x - 0.026) * 0.5 + nC, ear = EZ - 0.078 + nE;
    let a = sm(cheekL + 0.008, cheekL - 0.006, y) * sm(ear - 0.008, ear + 0.012, z);
    const mo = (1 - sm(0.024, 0.03, x)) * sm(MOUTHY + 0.021, MOUTHY + 0.016, y) * sm(MOUTHY + 0.004, MOUTHY + 0.0068, y);
    a = Math.max(a, mo) * sm(CHINY - 0.05 + nN, CHINY - 0.032 + nN, y);
    const lip = (1 - sm(0.021, 0.027, x)) * sm(MOUTHY - 0.0125, MOUTHY - 0.0095, y) * sm(MOUTHY + 0.0048, MOUTHY + 0.0028, y); a *= 1 - lip;
    if (x < 0.03 && Math.abs(y - MOUTHY) < 0.012 && z < EYEFRONT - 0.004) a = 0; return clamp(a); };
  const nose = [0, EY - 0.045, EYEFRONT + 0.025];
  for (let i = 0; i < N2; i++) {
    if (Number.isNaN(pos[i * 3])) continue;
    const x0 = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2], x = Math.abs(x0);
    let r = lin(src[i * 4]), g = lin(src[i * 4 + 1]), b = lin(src[i * 4 + 2]), h = 0, ro = 0.66;
    const face = headW[i] > 0.5 && y > CHINY - 0.06 && z > EZ - 0.1;
    // hands and feet: their tone to the forearm's, the bake softened
    const th = K.hands ? sm(0.15, 0.7, hw[i]) : 0, tf = K.hands ? sm(0.15, 0.7, fw[i]) : 0;
    if (th > 0 || tf > 0) { const db = 0.55 * Math.max(th, tf); r = r * (1 - db) + lin(blur[i * 4]) * db; g = g * (1 - db) + lin(blur[i * 4 + 1]) * db; b = b * (1 - db) + lin(blur[i * 4 + 2]) * db;
      const k = th > tf ? kH : kF, t = Math.max(th, tf); r *= 1 + (k[0] - 1) * t; g *= 1 + (k[1] - 1) * t; b *= 1 + (k[2] - 1) * t; }
    // ears: the scalp paint out, skin in (the cheek's tone, warmer and a little redder at the rim)
    if (K.ears && headW[i] > 0.5 && x > 0.062 && y > 1.69 && y < 1.79 && z > -0.022 && z < 0.08) {
      const L0 = 0.2126 * r + 0.7152 * g + 0.0722 * b, Lc = 0.2126 * cheek[0] + 0.7152 * cheek[1] + 0.0722 * cheek[2], dark = sm(0.85, 0.45, L0 / Lc);
      const zone = sm(0.062, 0.07, x) * sm(1.69, 1.7, y) * sm(1.79, 1.78, y) * sm(-0.022, -0.012, z) * sm(0.08, 0.07, z);
      const rim = sm(0.078, 0.088, x), n = fbm(x0, y, z, 160) - 0.5, t = dark * zone;
      if (t > 0) { const sh = 0.86 + 0.12 * n; r = r * (1 - t) + cheek[0] * sh * (1 + 0.1 * rim) * t; g = g * (1 - t) + cheek[1] * sh * (1 - 0.06 * rim) * t; b = b * (1 - t) + cheek[2] * sh * (1 - 0.08 * rim) * t; }
    }
    // mottling everywhere (warm/cool at 3 sizes) and a fine grain
    if (K.tone) { const n1 = fbm(x0, y, z, 22) - 0.5, n2 = fbm(x0 + 4, y, z, 80) - 0.5, n3 = fbm(x0 + 9, y, z, 300, 2) - 0.5, gr = h3(Math.floor(x0 * 3000), Math.floor(y * 3000), Math.floor(z * 3000)) - 0.5;
      const amp = face ? 1 : 0.8; r *= 1 + amp * (0.07 * n1 + 0.06 * n2 + 0.05 * n3 + 0.025 * gr); g *= 1 + amp * (0.06 * n1 + 0.05 * n2 + 0.045 * n3 + 0.025 * gr - 0.03 * Math.max(0, n2)); b *= 1 + amp * (0.05 * n1 + 0.05 * n2 + 0.04 * n3 + 0.025 * gr - 0.04 * Math.max(0, n2));
      h += (face ? 0 : 0.000008) * (fbm(x0, y, z, 1800, 2) - 0.5); }
    if (face) {
      // warmth: nose, cheeks' apples, ears; deeper/cooler: around the mouth, under the eyes, the brow's shadow
      const nz = g2(x0, y - nose[1], z - nose[2], 0.012, 0.018, 0.025), ck = g2(x - 0.045, y - (EY - 0.035), 0, 0.02, 0.016, 1) * sm(EZ - 0.05, EZ - 0.02, z), ears = sm(0.07, 0.08, x) * g2(0, y - 1.735, z - 0.03, 1, 0.035, 0.04);
      const red = Math.min(1, 0.7 * nz + 0.55 * ck + 0.4 * ears); r *= 1 + 0.03 * red; g *= 1 - 0.12 * red; b *= 1 - 0.13 * red;
      const peri = g2(x, y - (MOUTHY - 0.004), z - EYEFRONT, 0.03, 0.022, 0.05) * (1 - g2(x, y - MOUTHY, 0, 0.022, 0.008, 1)), under = g2(x - EYEX - 0.002, y - (EY - 0.016), 0, 0.015, 0.006, 1) * sm(EZ - 0.03, EZ - 0.005, z);
      const dk = 1 - 0.1 * peri - 0.14 * under; r *= dk; g *= dk * (1 - 0.02 * peri); b *= dk * (1 + 0.02 * under);
      // lips: the border darker, the centre lighter, vertical lines; wet
      const lipA = (1 - sm(0.021, 0.026, x)) * g2(0, y - MOUTHY, 0, 1, 0.0085, 1) * sm(EYEFRONT - 0.002, EYEFRONT + 0.004, z);
      if (lipA > 0.01) { const edge = Math.abs(y - MOUTHY) / 0.0085, rim = sm(0.55, 0.85, edge) * (1 - sm(0.95, 1.2, edge)); r *= 1 - 0.1 * rim * lipA; g *= 1 - 0.2 * rim * lipA; b *= 1 - 0.16 * rim * lipA;
        const ln = Math.sin(x0 * 2400 + 3 * fbm(x0, y, z, 300)); h -= 0.00002 * lipA * Math.max(0, ln) ** 6; ro = ro * (1 - lipA) + 0.36 * lipA; }
      // stubble: follicles (dark dots, ~60% of the area) and a shadow under them
      if (K.stubble) { const a = beardOf(x0, y, z); if (a > 0.01) { const q = 4200, fx = Math.floor(x0 * q), fy = Math.floor(y * q), fz = Math.floor(z * q), hh = h3(fx, fy, fz), dot = hh < 0.34 * a ? 1 : 0;
        const sh = 1 - 0.03 * a - 0.32 * dot * (0.6 + 0.4 * h3(fx + 7, fy, fz)); r *= sh; g *= sh * 0.99; b *= sh * 0.975; h -= 0.000006 * dot; ro = ro * (1 - a) + 0.72 * a; } }
      // pores (nose and cheeks most) and the roughness: T-zone and nose shinier
      if (K.pores) { const area = sm(EZ - 0.06, EZ - 0.02, z) * (0.45 + 0.55 * Math.min(1, g2(x0, y - nose[1], 0, 0.022, 0.025, 1) + g2(x - 0.045, y - (EY - 0.03), 0, 0.025, 0.02, 1)));
        const pit = h3(Math.floor(x0 * 2400), Math.floor(y * 2400), Math.floor(z * 2400)) < 0.14 ? 1 : 0; h += area * (0.00001 * (fbm(x0, y, z, 2600, 2) - 0.5) - 0.000016 * pit); }
      const tz = Math.max((1 - sm(0.02, 0.035, x)) * sm(EY - 0.06, EY - 0.04, y) * (1 - sm(EY + 0.07, EY + 0.09, y)), g2(x0, y - nose[1], z - nose[2], 0.015, 0.02, 0.025));
      ro = Math.min(ro, 0.68 - 0.12 * tz) + 0.05 * (fbm(x0, y, z, 400) - 0.5);
    }
    // hands: creases at each finger joint (the palm side deeper), knuckles, nails
    if (th > 0.3) { const s = x0 > 0 ? 'L' : 'R', Nn = handN[s], P = new THREE.Vector3(x0, y, z);
      for (const fg of fingers) { if (fg.s !== s) continue;
        const pts = [...fg.j, fg.tip];
        for (let k = 0; k < 3; k++) { const a = pts[k], bb = pts[k + 1], ax = bb.clone().sub(a), L = ax.length(); ax.normalize(); const v = P.clone().sub(a), t = v.dot(ax); if (t < -0.012 || t > L + 0.004) continue;
          const rad = v.clone().addScaledVector(ax, -t), rl = rad.length(); if (rl > 0.016) continue; const side = rad.clone().normalize().dot(Nn); // >0 palm side (N points palm-ward for R)
          // creases at the joint (t near 0 for k>0), the palm side deeper
          if (k > 0) { const c = Math.exp(-((t / 0.0011) ** 2)) + 0.6 * Math.exp(-(((t + 0.0028) / 0.0009) ** 2)); h -= c * (0.00003 + 0.00004 * Math.max(0, side)); const dk2 = 1 - 0.12 * c; r *= dk2; g *= dk2 * 0.98; b *= dk2 * 0.98; }
          // nails: the last bone's back, its far 55%
          if (k === 2) { const u = t / L; const back = -side; const nl = sm(0.38, 0.48, u) * sm(1.02, 0.92, u) * sm(0.35, 0.6, back);
            if (nl > 0.01) { r *= 1 + 0.1 * nl; g *= 1 + 0.05 * nl; b *= 1 + 0.03 * nl; h += 0.00006 * nl; ro = ro * (1 - nl) + 0.3 * nl;
              const edge = sm(0.42, 0.48, u) * (1 - sm(0.48, 0.55, u)) * sm(0.4, 0.6, back); h -= 0.00004 * edge; } }
          // knuckles: a bump on the back over joint 1 and 2
          if (k < 2) { const kn = Math.exp(-((t / 0.006) ** 2)) * sm(0.2, 0.7, -side); h += 0.00008 * kn; } } }
      ro = Math.max(ro, 0.55); }
    // under the hoodie: the body's skin painted as the hoodie's dark inside, so a gap (the hood's tip lifting off the
    // back, the neckband's sides) shows cloth in shadow, not a light shard of skin
    if (K.under) { const neck = 1.56 + 0.03 * sm(0.09, -0.03, z) - 0.012, wrd = Math.min(Math.hypot(x0 - wr.L.x, y - wr.L.y, z - wr.L.z), Math.hypot(x0 - wr.R.x, y - wr.R.y, z - wr.R.z));
      const t = sm(neck + 0.004, neck - 0.008, y) * sm(0.955, 0.985, y) * sm(0.07, 0.11, wrd) * (1 - sm(0.01, 0.05, hw[i])) * (1 - Math.min(1, fw[i] * 4));
      if (t > 0) { const c = [lin(38), lin(40), lin(46)]; r = r * (1 - t) + c[0] * t; g = g * (1 - t) + c[1] * t; b = b * (1 - t) + c[2] * t; h *= 1 - t; } }
    out[i * 4] = enc(r); out[i * 4 + 1] = enc(g); out[i * 4 + 2] = enc(b);
    hgt[i] = mpt[i] > 0 ? h / mpt[i] : 0; if (h) { hs += Math.abs(hgt[i]); hn++; } rough[i] = clamp(ro, 0.25, 0.9);
  }
  await setWebp(tex, out, S, S, 90); console.log('height |h| mean (texels)', (hs / Math.max(1, hn)).toFixed(3), 'mpt face', mpt[Math.floor(S*0.45)*S+Math.floor(S*0.8)].toExponential(2));
  // normal map from the height (in texels): +x along u (image right), +y up the image
  const nm = Buffer.alloc(N2 * 3), K2 = +(process.env.NK || 8);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const i = y * S + x, hx = (hgt[y * S + Math.min(S - 1, x + 1)] - hgt[y * S + Math.max(0, x - 1)]) / 2, hy = (hgt[Math.min(S - 1, y + 1) * S + x] - hgt[Math.max(0, y - 1) * S + x]) / 2;
    let nx = -hx * K2, ny = hy * K2, nz = 1; const l = Math.hypot(nx, ny, nz); nm[i * 3] = Math.round((nx / l * 0.5 + 0.5) * 255); nm[i * 3 + 1] = Math.round((ny / l * 0.5 + 0.5) * 255); nm[i * 3 + 2] = Math.round((nz / l * 0.5 + 0.5) * 255); }
  // (the uv coordinates here: v as stored (glTF: v down the image), so uvS's y is the image row: up the image = -y. ok.)
  const nt = doc.createTexture('skin-normal'); nt.setImage(await sharp(nm, { raw: { width: S, height: S, channels: 3 } }).webp({ quality: 92, effort: 5 }).toBuffer()).setMimeType('image/webp');
  mat.setNormalTexture(nt); mat.getNormalTextureInfo().setTexCoord(0); mat.setNormalScale?.(1);
  const R1 = 1024, rm = Buffer.alloc(R1 * R1 * 3); for (let y = 0; y < R1; y++) for (let x = 0; x < R1; x++) { let s = 0; for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) s += rough[(y * 2 + dy) * S + x * 2 + dx]; const i = (y * R1 + x) * 3; rm[i] = 255; rm[i + 1] = Math.round((s / 4) * 255); rm[i + 2] = 0; }
  // (texels off the island: roughness 0.62, not 0)
  const mt = mat.getMetallicRoughnessTexture() || doc.createTexture('skin-mr'); mt.setImage(await sharp(rm, { raw: { width: R1, height: R1, channels: 3 } }).webp({ quality: 90 }).toBuffer()).setMimeType('image/webp');
  mat.setMetallicRoughnessTexture(mt).setRoughnessFactor(1).setMetallicFactor(0);
  return { hgt, out, S };
}
