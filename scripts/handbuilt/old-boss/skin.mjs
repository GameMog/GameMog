// Hand-built old boss, the skin pass: his skin texture redrawn texel by texel from where each texel is on him (the bind
// pose), the young hero's skin pass (itself Mr. Big's second pass, MogCity polish/leftovers/mrbig2/tools/tex.mjs) for a
// weathered Mediterranean man of about 68:
//  tone     the waxy cream-yellow taken to an olive-warm light-medium (a per-channel transfer to a target cheek), mottled
//           at three sizes; sun on the scalp, forehead and nose; redness at the nose, its wings and the cheeks
//  scalp    the crown's MakeHuman stubble repainted as a bare dome (the forge's horseshoe kept below a line 5-7 cm over
//           the eyes, rising at the back), its edge feathered with sparse hairs; age spots (lentigines) on the dome and
//           temples
//  beard    the painted beard under the shells redrawn as a trimmed silver-grey groom: growth-direction strands, a
//           quarter dark, the skin between them; the band round the lips (the 'dark ring') and the mouth's corners the
//           beard's mid-grey, sparse at the lip line; the old outline's band past the new trim back to cheek skin
//  age      deeper eye bags and a darker upper-lid crease; forehead furrows, glabella lines, crow's feet, the
//           nose-to-mouth fold (normal map and a little colour)
//  hands    matched to his neck's tone (they were pale cream), the bake softened, age spots, joint creases, knuckles,
//           ridged nails
//  normal   (new, 2048) from the height field; rough (new, 1024, G): a shiny dome and T-zone, matte cheeks, wet lips,
//           matte beard
import { body, prim, matOf, raster, fbm, h3, sm, clamp, rgba, setWebp, sharp, THREE } from '../young-hero/glb.mjs';
import { EY, EYEFRONT, EZ, EYEX, MOUTHY, CHINY, MH, NOSE, trimOf, oldBeardOf, hsLine } from './landmarks.mjs';
export async function paintSkin(doc, K = {}) {
  K = { handTone: 0.9, target: [172, 130, 106], scalp: 1, beard: 1, age: 1, spots: 1, ...K };
  const B = body(doc), p = B.pos, uv = B.uv.getArray(), mat = matOf(doc, 'skin'), tex = mat.getBaseColorTexture();
  const { data: src, w: S } = await rgba(tex), N2 = S * S;
  const tris = prim(doc, 'skin').flatMap((q) => [...q.getIndices().getArray()]);
  const wHand = B.wOn(/^(wrist|finger)/), wFoot = B.wOn(/^(foot|toe)/), wHead = B.wOn(/^head$/);
  const ibm = B.skin.getInverseBindMatrices().getArray(), jp = (nm) => new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray(ibm, B.names.indexOf(nm) * 16).invert());
  const uvS = (v) => [uv[v * 2] * S, uv[v * 2 + 1] * S];
  const pos = new Float32Array(N2 * 3).fill(NaN), hw = new Float32Array(N2), fw = new Float32Array(N2), headW = new Float32Array(N2), mpt = new Float32Array(N2);
  let lastT = -1, lastM = 0;
  // (only the body's own triangles: the shells share its uv but sit off the skin)
  const bI = prim(doc, 'beard')[0].getIndices().getArray(), v0 = Math.min(...bI), v1 = Math.max(...bI);
  const own = []; for (let q = 0; q < tris.length; q += 3) if (tris[q] < v0 || tris[q] > v1) own.push(tris[q], tris[q + 1], tris[q + 2]);
  raster(own, uvS, S, (x, y, l1, l2, l3, a, b, c) => {
    const i = y * S + x; for (let k = 0; k < 3; k++) pos[i * 3 + k] = l1 * p[a * 3 + k] + l2 * p[b * 3 + k] + l3 * p[c * 3 + k];
    hw[i] = l1 * wHand[a] + l2 * wHand[b] + l3 * wHand[c]; fw[i] = l1 * wFoot[a] + l2 * wFoot[b] + l3 * wFoot[c]; headW[i] = l1 * wHead[a] + l2 * wHead[b] + l3 * wHead[c];
    const key = a * 1e6 + b * 7 + c; if (key !== lastT) { lastT = key; const P = [a, b, c].map((v) => new THREE.Vector3(p[v * 3], p[v * 3 + 1], p[v * 3 + 2])), U = [uvS(a), uvS(b), uvS(c)];
      const a3 = P[1].clone().sub(P[0]).cross(P[2].clone().sub(P[0])).length() / 2, a2 = Math.abs((U[1][0] - U[0][0]) * (U[2][1] - U[0][1]) - (U[2][0] - U[0][0]) * (U[1][1] - U[0][1])) / 2; lastM = a2 > 1e-9 ? Math.sqrt(a3 / a2) : 0; }
    mpt[i] = lastM;
  }, 0.03);
  const lin = (c) => Math.pow(c / 255, 2.2), enc = (l) => Math.min(255, Math.max(0, Math.round(255 * Math.pow(Math.max(0, l), 1 / 2.2))));
  const mean = (f) => { const s = [0, 0, 0]; let n = 0; for (let i = 0; i < N2; i++) if (!Number.isNaN(pos[i * 3]) && f(i)) { for (let k = 0; k < 3; k++) s[k] += lin(src[i * 4 + k]); n++; } return s.map((x) => x / Math.max(1, n)); };
  const cheek = mean((i) => { const x = Math.abs(pos[i * 3]), y = pos[i * 3 + 1], z = pos[i * 3 + 2]; return headW[i] > 0.9 && x > 0.035 && x < 0.055 && y > EY - 0.045 && y < EY - 0.02 && z > EZ - 0.04; });
  const hand = mean((i) => hw[i] > 0.8), foot = mean((i) => fw[i] > 0.8);
  // the tone transfer: every texel x (target / cheek) per channel, so his cheek lands on the target
  const T = K.target.map(lin), kT = T.map((t, k) => t / cheek[k]);
  const fore = mean((i) => { const x = Math.abs(pos[i * 3]), y = pos[i * 3 + 1], z = pos[i * 3 + 2]; return headW[i] > 0.9 && x < 0.03 && y > EY + 0.03 && y < EY + 0.05 && z > EZ - 0.02; }).map((c, k) => c * kT[k]);
  const kH = T.map((t, k) => (t * K.handTone) / hand[k]), kF = T.map((t, k) => (foot[k] > 1e-6 ? (t * 0.95) / foot[k] : kT[k]));
  console.log('tone cheek', cheek.map(enc), '->', K.target, 'forehead after', fore.map(enc), 'hand', hand.map(enc));
  const blur = await sharp(src, { raw: { width: S, height: S, channels: 4 } }).blur(5).raw().toBuffer();
  // (the lips: the red texels round the mouth, grown 2 px and softened, so the beard's paint stops at them)
  const lipM = Buffer.alloc(N2); for (let i = 0; i < N2; i++) { if (Number.isNaN(pos[i * 3])) continue; const x = Math.abs(pos[i * 3]), y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    if (x < MH + 0.004 && Math.abs(y - MOUTHY) < 0.016 && z > EZ - 0.01 && src[i * 4] - src[i * 4 + 1] > 42 && src[i * 4] > 110) lipM[i] = 255; }
  const lipB = await sharp(lipM, { raw: { width: S, height: S, channels: 1 } }).blur(2.2).extractChannel(0).raw().toBuffer();
  const lipF = await sharp(lipM, { raw: { width: S, height: S, channels: 1 } }).blur(7).extractChannel(0).raw().toBuffer();
  let hs = 0, hn = 0; const out = Buffer.from(src), hgt = new Float32Array(N2), rough = new Float32Array(N2).fill(0.62);
  const g2 = (dx, dy, dz, sx, sy, sz) => Math.exp(-((dx / sx) ** 2 + (dy / sy) ** 2 + (dz / sz) ** 2));
  const fingers = []; for (const s of ['L', 'R']) for (let f = 1; f <= 5; f++) { const j = [1, 2, 3].map((k) => jp(`finger${f}-${k}_${s}`)), d = j[2].clone().sub(j[1]); fingers.push({ s, f, j, tip: j[2].clone().addScaledVector(d.normalize(), f === 1 ? 0.028 : 0.022) }); }
  const wr = { L: jp('wrist_L'), R: jp('wrist_R') };
  const handN = {}; for (const s of ['L', 'R']) { const F = jp(`finger3-1_${s}`).sub(wr[s]).normalize(), A = jp(`finger2-1_${s}`).sub(jp(`finger5-1_${s}`)); A.addScaledVector(F, -A.dot(F)).normalize(); handN[s] = (s === 'R' ? new THREE.Vector3().crossVectors(A, F) : new THREE.Vector3().crossVectors(F, A)).normalize(); }
  const mixL = (c, t, w) => c.map((x, k) => x * (1 - w) + t[k] * w);
  let nScalp = 0, nBeard = 0;
  for (let i = 0; i < N2; i++) {
    if (Number.isNaN(pos[i * 3])) continue;
    const x0 = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2], x = Math.abs(x0);
    let c = [lin(src[i * 4]), lin(src[i * 4 + 1]), lin(src[i * 4 + 2])], h = 0, ro = 0.62;
    const head = headW[i] > 0.5 || (y > 1.6 && hw[i] < 0.01 && Math.abs(x) < 0.1);
    const face = head && y > CHINY - 0.06 && z > EZ - 0.1;
    // tone: the transfer (the hands and feet to the target by their own means)
    const th = sm(0.15, 0.7, hw[i]), tf = sm(0.15, 0.7, fw[i]);
    if (th > 0 || tf > 0) { const db = 0.55 * Math.max(th, tf); c = c.map((v, k) => v * (1 - db) + lin(blur[i * 4 + k]) * db); }
    const kk = th > tf ? kH : kF, tt = Math.max(th, tf); c = c.map((v, k) => v * (kT[k] * (1 - tt) + kk[k] * tt));
    // mottling everywhere and a fine grain
    { const n1 = fbm(x0, y, z, 22) - 0.5, n2 = fbm(x0 + 4, y, z, 80) - 0.5, n3 = fbm(x0 + 9, y, z, 300, 2) - 0.5, gr = h3(Math.floor(x0 * 3000), Math.floor(y * 3000), Math.floor(z * 3000)) - 0.5, amp = face ? 0.75 : 0.8;
      c[0] *= 1 + amp * (0.08 * n1 + 0.06 * n2 + 0.05 * n3 + 0.025 * gr); c[1] *= 1 + amp * (0.07 * n1 + 0.05 * n2 + 0.045 * n3 + 0.025 * gr - 0.04 * Math.max(0, n2)); c[2] *= 1 + amp * (0.06 * n1 + 0.05 * n2 + 0.04 * n3 + 0.025 * gr - 0.05 * Math.max(0, n2));
      h += (face ? 0 : 0.000008) * (fbm(x0, y, z, 1800, 2) - 0.5); }
    // the scalp: the crown above the horseshoe's line a bare, sun-weathered dome
    if (K.scalp && head && y > EY + 0.035 && hw[i] < 0.01) {
      const line = hsLine(x, z), n = (fbm(x0, y, z, 70) - 0.5) * 0.006, bare = sm(line - 0.004, line + 0.01, y + n);
      if (bare > 0) { nScalp++;
        // a sparse fade: single hairs in the edge's band
        const fade = sm(line - 0.004, line + 0.012, y + n), hair = h3(Math.floor(x0 * 2600), Math.floor(y * 900), Math.floor(z * 2600)) < 0.5 * (1 - fade) ? 1 : 0;
        const sun = 1 + 0.06 * sm(EY + 0.06, EY + 0.11, y);
        let sk = [fore[0] * 1.02 * sun, fore[1] * 0.97, fore[2] * 0.93].map((v, k) => v * (1 + 0.07 * (fbm(x0, y, z, 30) - 0.5) + 0.05 * (fbm(x0 + 2, y, z, 120) - 0.5)));
        if (hair) sk = mixL(sk, [lin(150), lin(146), lin(142)], 0.7);
        c = mixL(c, sk, bare); ro = ro * (1 - bare) + (0.56 + 0.1 * (fbm(x0 + 5, y, z, 60) - 0.5) + 0.06 * (fbm(x0, y, z, 400) - 0.5)) * bare; h += bare * 0.000006 * (fbm(x0, y, z, 2200, 2) - 0.5); }
    }
    // the fringe: where the forge painted the horseshoe's shaved grey (low saturation behind the face), short silver hair
    // painted over scalp skin: 0.3 mm strands about 3 mm long combed back and down, a third darker grey, thinning to the
    // horseshoe's line (the fuzz shell is gone: its cut edge stood as a white wreath)
    if (K.scalp && head && hw[i] < 0.01 && z < EZ - 0.045 && y > EY - 0.09) {
      const r0 = src[i * 4], g0 = src[i * 4 + 1], b0 = src[i * 4 + 2], mx = Math.max(r0, g0, b0), sat = mx ? (mx - Math.min(r0, g0, b0)) / mx : 0;
      const line = hsLine(x, z), n = (fbm(x0, y, z, 70) - 0.5) * 0.008 + (fbm(x0 + 3, y, z, 320) - 0.5) * 0.005, f = sm(0.3, 0.16, sat) * sm(line + 0.004, line - 0.016, y + n);
      if (f > 0.02) { const sk = [fore[0] * 1.0, fore[1] * 0.96, fore[2] * 0.93];
        const q = 1500, ang = 0.5 * Math.sign(x0) * sm(-0.05, 0.05, z), u = (x0 + z * 0.3) * Math.cos(ang) - y * Math.sin(ang), v = (x0 + z * 0.3) * Math.sin(ang) + y * Math.cos(ang);
        const cu = Math.floor(u * q), cv = Math.floor(v * q / 9 + h3(cu, 5, 1) * 9), hh = h3(cu, cv, Math.floor(z * 500)), dark = h3(cu, cv, 31) < 0.33, strand = hh < 0.5 + 0.25 * f;
        const hc = dark ? [lin(98), lin(94), lin(90)] : [lin(188), lin(184), lin(176)].map((t) => t * (0.82 + 0.3 * h3(cu, cv, 4)));
        const under = mixL(sk, [lin(132), lin(124), lin(116)], 0.25 * f);
        c = mixL(c, strand ? hc : under, Math.min(1, f * 1.05)); ro = ro * (1 - f) + (strand ? 0.5 : 0.62) * f; h += f * (strand ? 0.000014 : -0.000006); }
    }
    // age spots: the dome, temples, forehead, the backs of the hands
    if (K.spots && ((head && (y > EY + 0.02 || (x > 0.05 && y > EY - 0.03))) || th > 0.3)) {
      const s1 = fbm(x0 * 1.3 + 7, y, z, 230, 2), s2 = fbm(x0 + 3, y + 1, z, 60, 2), spot = sm(0.72, 0.78, s1) * (0.4 + 0.6 * s2) * (th > 0.3 ? 0.6 : 1);
      if (spot > 0) { c = c.map((v, k) => v * (1 - 0.16 * spot * [0.8, 1, 1.15][k] * 0.55)); }
    }
    if (face) {
      // redness: nose (tip and wings), the cheeks' apples, faint broken capillaries at the wings
      const nz = g2(x0, y - NOSE[1], z - NOSE[2], 0.014, 0.016, 0.03), wing = g2(x - 0.017, y - (NOSE[1] - 0.004), 0, 0.006, 0.006, 1) * sm(EZ - 0.02, EZ + 0.01, z), ck = g2(x - 0.047, y - (EY - 0.035), 0, 0.02, 0.016, 1) * sm(EZ - 0.05, EZ - 0.02, z);
      const cap = wing * sm(0.6, 0.75, fbm(x0, y, z, 900, 2));
      const red = Math.min(1, 0.5 * nz + 0.4 * wing + 0.35 * ck + 0.4 * cap); c[0] *= 1 + 0.04 * red; c[1] *= 1 - 0.15 * red; c[2] *= 1 - 0.14 * red;
      // under the eyes: the bags deeper (shade and a fold), the upper lid's crease darker
      if (K.age) { const ex = x - EYEX;
        const bag = g2(ex, y - (EY - 0.017), 0, 0.017, 0.007, 1) * sm(EZ - 0.03, EZ - 0.005, z), lid = g2(ex, y - (EY + 0.009), 0, 0.016, 0.0028, 1) * sm(EZ - 0.03, EZ - 0.005, z);
        const dk = 1 - 0.16 * bag - 0.14 * lid; c = c.map((v, k) => v * dk * (k === 2 ? 1.02 : 1));
        const foldY = EY - 0.022 - 0.01 * (ex / 0.02) ** 2, fold = Math.exp(-(((y - foldY) / 0.0011) ** 2)) * sm(0.024, 0.012, Math.abs(ex)) * sm(EZ - 0.03, EZ - 0.01, z); h -= 0.00005 * fold; c = c.map((v) => v * (1 - 0.07 * fold));
        // forehead furrows: 4 wavy lines
        if (x < 0.06 && y > EY + 0.024 && y < EY + 0.085 && z > EZ - 0.045) { const yy = y + 0.0018 * Math.sin(x0 * 70) + 0.002 * (fbm(x0, y, z, 40) - 0.5); let g = 0;
          for (let L = 0; L < 4; L++) { const ly = EY + 0.033 + L * 0.0115; g = Math.max(g, Math.exp(-(((yy - ly) / 0.0009) ** 2)) * (1 - 0.25 * L)); }
          g *= sm(0.058, 0.035, x) * sm(EZ - 0.045, EZ - 0.02, z) * (0.7 + 0.6 * (fbm(x0, y, z, 90) - 0.2)); h -= 0.00006 * g; c = c.map((v) => v * (1 - 0.06 * g)); }
        // glabella: two short verticals between the brows
        { const g = Math.exp(-(((x - 0.0065) / 0.0007) ** 2)) * sm(EY + 0.004, EY + 0.01, y) * sm(EY + 0.03, EY + 0.022, y) * sm(EZ, EZ + 0.01, z); h -= 0.00005 * g; c = c.map((v) => v * (1 - 0.05 * g)); }
        // crow's feet: three lines fanning from the eye's outer corner
        { const cx = x - (EYEX + 0.021), cy = y - (EY + 0.001), r = Math.hypot(cx, cy); if (cx > 0 && r > 0.003 && r < 0.02 && z > EZ - 0.06) { const th0 = Math.atan2(cy, cx); let g = 0;
          for (const tk of [-0.45, -0.05, 0.35]) g = Math.max(g, Math.exp(-(((th0 - tk) * r / 0.0007) ** 2))); g *= sm(0.003, 0.006, r) * sm(0.02, 0.012, r); h -= 0.000045 * g; c = c.map((v) => v * (1 - 0.05 * g)); } }
        // the nose-to-mouth fold (its top shows over the trimmed beard)
        { const tr0 = (NOSE[1] - 0.004 - y) / 0.03, t0 = clamp(tr0), fx = 0.02 + 0.012 * t0, d = x - fx; const g = Math.exp(-((d / 0.0016) ** 2)) * sm(-0.1, 0.05, tr0) * sm(1.1, 0.8, t0) * sm(EZ - 0.01, EZ + 0.005, z); h -= 0.00007 * g; c = c.map((v) => v * (1 - 0.08 * g)); }
      }
      // the beard's paint: a trimmed silver-grey groom
      if (K.beard) { const nE = fbm(x0, y, z, 90) - 0.5, tr = trimOf(x0, y, z, nE), old = oldBeardOf(x0, y, z), lb = lipB[i] / 255, lf = lipF[i] / 255;
        const nearMouth = x < MH + 0.012 && Math.abs(y - MOUTHY) < 0.02;
        if (old > 0.02 || tr > 0.02 || (nearMouth && lf > 0.02)) {
          // the clean skin under (the cheek's tone, mottled), then the hair over it by the trim
          const base = T.map((t, k) => t * (0.92 + 0.08 * (fbm(x0, y, z, 30) - 0.5)) * (k === 0 ? 1.02 : 1));
          let a = tr * (1 - lb); if (nearMouth) a = Math.max(a * (1 - 0.35 * lf), 0.55 * (1 - lb) * sm(0, 0.25, lf) * (z > EZ - 0.01 ? 1 : 0));
          // strands: 0.33 mm wide, ~2 mm long, down the face (out and down on the moustache)
          const q = 1500, ang = y > MOUTHY ? (x0 > 0 ? -0.35 : 0.35) : 0.12 * Math.sign(x0), u = (x0 + 0.4 * Math.sign(x0) * Math.max(0, EZ + 0.01 - z)) * Math.cos(ang) - y * Math.sin(ang), v = x0 * Math.sin(ang) + y * Math.cos(ang);
          const cu = Math.floor(u * q), cv = Math.floor(v * q / 7 + h3(cu, 3, 5) * 7), hh = h3(cu, cv, Math.floor(z * 600)), dark = h3(cu, cv, 77) < 0.26;
          const strand = hh < 0.62 ? 1 : 0, col = dark ? [lin(112), lin(108), lin(105)] : [lin(170), lin(168), lin(164)].map((t) => t * (0.9 + 0.15 * h3(cu, cv, 9)));
          const under = mixL(base, [lin(128), lin(120), lin(114)], 0.55);
          const hair = strand ? col : under;
          c = mixL(old > 0.02 ? base : c, hair, clamp(a)); if (old > 0.02 && a < 0.02) c = mixL(c, base, 1);
          h -= a * 0.000012 * (strand ? 0 : 1); ro = ro * (1 - a) + 0.74 * a; if (a > 0.05) nBeard++;
        }
      }
      // lips: thin, wet, a defined border
      { const lb = lipB[i] / 255; if (lb > 0.05) { ro = ro * (1 - lb) + 0.5 * lb; const ln = Math.sin(x0 * 2400 + 3 * fbm(x0, y, z, 300)); h -= 0.000018 * lb * Math.max(0, ln) ** 6; c = mixL(c.map((v, k) => v * (1 - lb * [0.12, 0.2, 0.16][k])), [lin(150), lin(104), lin(96)], 0.35 * lb); } }
      // pores, and the T-zone's shine
      const area = sm(EZ - 0.06, EZ - 0.02, z) * (0.5 + 0.5 * Math.min(1, g2(x0, y - NOSE[1], 0, 0.022, 0.025, 1) + g2(x - 0.045, y - (EY - 0.03), 0, 0.025, 0.02, 1)));
      const pit = h3(Math.floor(x0 * 2400), Math.floor(y * 2400), Math.floor(z * 2400)) < 0.16 ? 1 : 0; h += area * (0.000012 * (fbm(x0, y, z, 2600, 2) - 0.5) - 0.000018 * pit);
      const tz = Math.max((1 - sm(0.02, 0.04, x)) * sm(EY - 0.06, EY - 0.04, y), g2(x0, y - NOSE[1], z - NOSE[2], 0.015, 0.02, 0.025));
      ro = Math.min(ro, 0.62 - 0.14 * tz) + 0.05 * (fbm(x0, y, z, 400) - 0.5);
    }
    // hands: creases, nails (ridged), knuckles, a few raised veins on the back
    if (th > 0.3) { const s = x0 > 0 ? 'L' : 'R', Nn = handN[s], P = new THREE.Vector3(x0, y, z);
      for (const fg of fingers) { if (fg.s !== s) continue; const pts = [...fg.j, fg.tip];
        for (let k = 0; k < 3; k++) { const a = pts[k], bb = pts[k + 1], ax = bb.clone().sub(a), L = ax.length(); ax.normalize(); const v = P.clone().sub(a), t = v.dot(ax); if (t < -0.012 || t > L + 0.004) continue;
          const rad = v.clone().addScaledVector(ax, -t), rl = rad.length(); if (rl > 0.016) continue; const side = rad.clone().normalize().dot(Nn);
          if (k > 0) { const cr = Math.exp(-((t / 0.0012) ** 2)) + 0.7 * Math.exp(-(((t + 0.003) / 0.001) ** 2)) + 0.4 * Math.exp(-(((t - 0.0026) / 0.0009) ** 2)); h -= cr * (0.000035 + 0.00004 * Math.max(0, side)); c = c.map((q2) => q2 * (1 - 0.13 * cr)); }
          if (k === 2) { const u = t / L, back = -side, nl = sm(0.36, 0.46, u) * sm(1.02, 0.92, u) * sm(0.35, 0.6, back);
            if (nl > 0.01) { c = c.map((q2, kk2) => q2 * (1 + [0.08, 0.06, 0.05][kk2] * nl)); const ridge = Math.sin(Math.atan2(rad.y, rad.x) * 40) * 0.5 + 0.5; h += 0.00006 * nl + 0.000008 * nl * ridge; ro = ro * (1 - nl) + 0.34 * nl;
              const edge = sm(0.4, 0.46, u) * (1 - sm(0.46, 0.53, u)) * sm(0.4, 0.6, back); h -= 0.00004 * edge; } }
          if (k < 2) { const kn = Math.exp(-((t / 0.006) ** 2)) * sm(0.2, 0.7, -side); h += 0.0001 * kn; c = c.map((q2, kk2) => q2 * (1 + [0.03, -0.02, -0.02][kk2] * kn)); } } }
      // veins: two soft ridges on the back of the hand toward the knuckles
      const vn = fbm(x0 * 0.3, y, z, 140, 2); const vein = Math.exp(-(((vn - 0.5) / 0.03) ** 2)) * sm(0.4, 0.9, th) * (1 - sm(0.9, 1, th)); h += 0.00004 * vein; c = c.map((q2, kk2) => q2 * (1 + [-0.03, -0.02, 0.05][kk2] * vein));
      ro = Math.max(ro, 0.55); }
    // (pass 1 faded the relief out at the midline for a 'uv seam' there; the head's uv runs straight across the midline,
    // and the lines up the forehead were the nose-to-mouth fold's gate left open above the nose, now closed (pass 2))
    out[i * 4] = enc(c[0]); out[i * 4 + 1] = enc(c[1]); out[i * 4 + 2] = enc(c[2]);
    hgt[i] = mpt[i] > 0 ? h / mpt[i] : 0; if (h) { hs += Math.abs(hgt[i]); hn++; } rough[i] = clamp(ro, 0.25, 0.9);
  }
  // (off the islands: the islands' edge colours grown out 6 texels, so mip filtering never pulls the old cream in along
  // a seam (the scalp's midline seam showed as a line up the forehead))
  { const on = new Uint8Array(N2); for (let i = 0; i < N2; i++) on[i] = Number.isNaN(pos[i * 3]) ? 0 : 1;
    for (let it = 0; it < 6; it++) { const add = []; for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const i = y * S + x; if (on[i]) continue; let n = 0; const sum = [0, 0, 0];
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= S || yy >= S) continue; const j = yy * S + xx; if (!on[j]) continue; n++; for (let k = 0; k < 3; k++) sum[k] += out[j * 4 + k]; }
        if (n) add.push([i, sum.map((v) => Math.round(v / n))]); }
      for (const [i, c3] of add) { on[i] = 1; for (let k = 0; k < 3; k++) out[i * 4 + k] = c3[k]; } } }
  await setWebp(tex, out, S, S, 90); console.log('scalp texels', nScalp, 'beard texels', nBeard, 'height |h| mean (texels)', (hs / Math.max(1, hn)).toFixed(3));
  const nm = Buffer.alloc(N2 * 3), K2 = +(process.env.NK || 8);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const i = y * S + x, H = (xx, yy) => { xx = Math.min(S - 1, Math.max(0, xx)); yy = Math.min(S - 1, Math.max(0, yy)); const j = yy * S + xx; return Number.isNaN(pos[j * 3]) ? hgt[i] : hgt[j]; }, hx = (H(x + 1, y) - H(x - 1, y)) / 2, hy = (H(x, y + 1) - H(x, y - 1)) / 2;
    const nx = -hx * K2, ny = hy * K2, l = Math.hypot(nx, ny, 1); nm[i * 3] = Math.round((nx / l * 0.5 + 0.5) * 255); nm[i * 3 + 1] = Math.round((ny / l * 0.5 + 0.5) * 255); nm[i * 3 + 2] = Math.round((1 / l * 0.5 + 0.5) * 255); }
  const nt = doc.createTexture('skin-normal'); nt.setImage(await sharp(nm, { raw: { width: S, height: S, channels: 3 } }).webp({ quality: 92, effort: 5 }).toBuffer()).setMimeType('image/webp');
  mat.setNormalTexture(nt); mat.getNormalTextureInfo().setTexCoord(0);
  const R1 = 1024, rm = Buffer.alloc(R1 * R1 * 3); for (let y = 0; y < R1; y++) for (let x = 0; x < R1; x++) { let s = 0; for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) s += rough[(y * 2 + dy) * S + x * 2 + dx]; const i = (y * R1 + x) * 3; rm[i] = 255; rm[i + 1] = Math.round((s / 4) * 255); rm[i + 2] = 0; }
  const mt = mat.getMetallicRoughnessTexture() || doc.createTexture('skin-mr'); mt.setImage(await sharp(rm, { raw: { width: R1, height: R1, channels: 3 } }).webp({ quality: 90 }).toBuffer()).setMimeType('image/webp');
  mat.setMetallicRoughnessTexture(mt).setRoughnessFactor(1).setMetallicFactor(0);
}
