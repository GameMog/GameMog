// Hand-built Jensen, likeness round 3: the moto jacket's stand-up band collar as its own geometry (the critic: the
// library's stand collar read as two flat, stiff upright slabs with jagged, shard-like lower edges and skin or tee
// showing between them; the owner: "a stand-up band collar with two snap tabs that sits cleanly on the neck with no
// jagged edges"). One continuous, softly curved leather band round the neck, following the library collar's own fit to
// the neck (its inner radius per angle, smoothed), its foot tucked down inside the jacket's neckline (so no gap and no
// cut edge shows), meeting near the front with a narrow V where the tee shows; the front ends' top corners rounded; the
// top edge rolled (a folded-over band, two leather layers 3.5 mm thick), stitched 4 mm under it, and again over the
// foot; a snap tab with two gunmetal snaps on his LEFT side of the throat, at the base (as the reference's). Painted here
// (colour, roughness, metal, normal) from where each texel is on the band, not by moto.mjs (its extras: bandPainted).
// Skinned by the nearest point of the library collar it replaces, which the forge had weighted to the neck and spine.
//   bandCollarPass(doc, { H, T, gapLo, gapHi, gap })
import { sharp, fbm, h3, sm, clamp, THREE } from '../young-hero/glb.mjs';

const TAU = Math.PI * 2;
export async function bandCollarPass(doc, K = {}) {
  K = { H: 0.043, Hfront: 0.035, T: 0.0035, gapLo: 0.11, gapHi: 0.2, inset: 0.002, NU: 160, tuck: 0.024, black: [17, 17, 18], rough: 0.44, ...K };
  const R = doc.getRoot(), all = R.listMeshes().flatMap((m) => m.listPrimitives().map((p) => ({ m, p })));
  const old = all.find(({ p }) => p.getMaterial()?.getName() === 'uniform-collar'), body = all.find(({ p }) => p.getMaterial()?.getName() === 'uniform');
  if (!old || !body) throw new Error('collar: no library collar / jacket body');
  const OA = old.p.getAttribute('POSITION').getArray(), OV = [...new Set(old.p.getIndices().getArray())];
  const BA = body.p.getAttribute('POSITION').getArray(), BV = [...new Set(body.p.getIndices().getArray())];
  // the neck's middle: the old collar's points' mean in x and z
  let cz = 0; for (const v of OV) cz += OA[v * 3 + 2]; cz /= OV.length; const cx = 0;
  const ang = (x, z) => Math.atan2(x - cx, z - cz), rad = (x, z) => Math.hypot(x - cx, z - cz);
  // per 5 degrees: the old collar's lowest point, its inner radius at its foot and at its top; the jacket body's top edge
  // (its highest point near the neck) and the edge's inner radius
  const NB = 72, bin = (a) => ((Math.floor(((a + Math.PI) / TAU) * NB) % NB) + NB) % NB;
  const oy0 = new Float32Array(NB).fill(9), oy1 = new Float32Array(NB).fill(-9);
  for (const v of OV) { const b = bin(ang(OA[v * 3], OA[v * 3 + 2])); oy0[b] = Math.min(oy0[b], OA[v * 3 + 1]); oy1[b] = Math.max(oy1[b], OA[v * 3 + 1]); }
  const rb = new Float32Array(NB).fill(NaN), rt = new Float32Array(NB).fill(NaN);
  for (const v of OV) { const x = OA[v * 3], y = OA[v * 3 + 1], z = OA[v * 3 + 2], b = bin(ang(x, z)), s = oy1[b] - oy0[b], r = rad(x, z); if (s <= 0) continue;
    if (y < oy0[b] + s * 0.3) rb[b] = Number.isNaN(rb[b]) ? r : Math.min(rb[b], r); if (y > oy1[b] - s * 0.3) rt[b] = Number.isNaN(rt[b]) ? r : Math.min(rt[b], r); }
  const by1 = new Float32Array(NB).fill(-9), be = new Float32Array(NB).fill(NaN);
  for (const v of BV) { const x = BA[v * 3], y = BA[v * 3 + 1], z = BA[v * 3 + 2], r = rad(x, z); if (r > 0.13 || y < 1.36) continue; const b = bin(ang(x, z)); by1[b] = Math.max(by1[b], y); }
  for (const v of BV) { const x = BA[v * 3], y = BA[v * 3 + 1], z = BA[v * 3 + 2], r = rad(x, z); if (r > 0.13) continue; const b = bin(ang(x, z)); if (y > by1[b] - 0.012) be[b] = Number.isNaN(be[b]) ? r : Math.min(be[b], r); }
  const fill = (A) => { for (let it = 0; it < NB; it++) { let left = 0; for (let b = 0; b < NB; b++) if (Number.isNaN(A[b]) || A[b] === 9 || A[b] === -9) { const p = A[(b + NB - 1) % NB], q = A[(b + 1) % NB], ok = (u) => !(Number.isNaN(u) || u === 9 || u === -9);
      if (ok(p) && ok(q)) A[b] = (p + q) / 2; else if (ok(p)) A[b] = p; else if (ok(q)) A[b] = q; else left++; } if (!left) break; } return A; };
  const smooth = (A, n = 4) => { for (let k = 0; k < n; k++) { const B = A.slice(); for (let b = 0; b < NB; b++) A[b] = (B[(b + NB - 1) % NB] + 2 * B[b] + B[(b + 1) % NB]) / 4; } return A; };
  const at = (A, a) => { const f = ((a + Math.PI) / TAU) * NB - 0.5, b0 = Math.floor(f), t = f - b0; return A[((b0 % NB) + NB) % NB] * (1 - t) + A[(((b0 + 1) % NB) + NB) % NB] * t; };
  // (the critic: jagged clipping at the jacket's neck opening and the shoulders beside it: the body's neckline points
  // stood up in spikes round the old collar. Its edge per angle taken as a running median over 45 degrees (the spikes
  // and the notch at the back's middle dropped), smoothed, and every body point near the neck above it brought down onto it, so the neckline is one clean
  // curve the band's foot tucks under)
  { const e = by1.slice(); for (let b = 0; b < NB; b++) { const w = []; for (let d = -4; d <= 4; d++) { const q = e[(b + d + NB) % NB]; if (q !== -9) w.push(q); } w.sort((x, y) => x - y); by1[b] = w.length ? w[w.length >> 1] : -9; } }
  fill(by1); smooth(by1, 6);
  { const a2 = body.p.getAttribute('POSITION').getArray().slice(); let nd = 0; for (const v of BV) { const x = a2[v * 3], y = a2[v * 3 + 1], z = a2[v * 3 + 2], r = rad(x, z); if (r > 0.14 || y < 1.38) continue;
      const lim = at(by1, ang(x, z)), w = sm(0.14, 0.11, r); if (y > lim) { a2[v * 3 + 1] = y + (lim - y) * w; nd++; } }
    body.p.getAttribute('POSITION').setArray(a2); console.log('band collar: neckline points brought down', nd); }
  // fill the bins the old collar left empty (its front opening) from their neighbours, then smooth round the neck
  for (const A of [oy0, rb, rt, be]) smooth(fill(A));
  // the band's shape at angle a (0: the throat, + his left) and height fraction hf (0 at its foot, the jacket's edge)
  const foot = (a) => at(by1, a) - 0.003, Hh = (a) => K.Hfront + (K.H - K.Hfront) * sm(0.2, 1.4, Math.abs(a));
  const rIn = (a, hf) => { const r0 = Math.max(at(rb, a), at(be, a) - K.T - 0.0012), r1 = Math.min(at(rt, a) + K.inset, r0); return hf <= 0 ? r0 + 0.003 * clamp(-hf / 0.35) : r0 + (r1 - r0) * sm(0, 1, hf) ** 0.8; };
  const T = K.T, NU = K.NU, Rc = 0.009;
  // the cross-section, as (side, hf, roll angle): up the inside from under the foot, over the rolled top, down the outside
  const sec = []; const NH = 14, NR = 7, low = -K.tuck / K.H;
  for (let k = 0; k <= NH; k++) sec.push({ side: 0, hf: low + (1 - low) * (k / NH) });
  for (let k = 1; k < NR; k++) sec.push({ side: k / NR, hf: 1, roll: Math.PI * (1 - k / NR) });
  for (let k = NH; k >= 0; k--) sec.push({ side: 1, hf: low + (1 - low) * (k / NH) });
  const NS = sec.length, vlen = []; { let acc = 0; for (let s = 0; s < NS; s++) { vlen.push(acc); const a = sec[s], b = sec[Math.min(NS - 1, s + 1)]; acc += a.roll != null || b.roll != null ? (Math.PI * T / 2) / NR : Math.abs(b.hf - a.hf) * K.H; } }
  const VL = vlen[NS - 1];
  // the band's points: column u (0..1 from his left front end, round the back, to his right front end)
  const P = [], UV = [], meta = [];
  for (let i = 0; i <= NU; i++) { const u = i / NU;
    for (let s = 0; s < NS; s++) { const q = sec[s], hfc = clamp(q.hf, 0, 1), g = K.gapLo + (K.gapHi - K.gapLo) * hfc, a = g + u * (TAU - 2 * g), A = a > Math.PI ? a - TAU : a;
      const arcEnd = Math.min(u, 1 - u) * (TAU - 2 * g) * at(rt, A); let H = Hh(A); if (arcEnd < Rc) H -= Rc - Math.sqrt(Math.max(0, Rc * Rc - (Rc - arcEnd) ** 2)); // (the rounded top corners)
      const y0 = foot(A), r = rIn(A, q.hf);
      let rr, y; if (q.roll != null) { rr = r + T / 2 - (T / 2) * Math.cos(q.roll); y = y0 + H - T / 2 + (T / 2) * Math.sin(q.roll); } else { rr = r + q.side * T; y = q.hf >= 0 ? y0 + q.hf * (H - T / 2) : y0 + q.hf * K.H; }
      P.push(cx + rr * Math.sin(A), y, cz + rr * Math.cos(A)); UV.push(u, vlen[s] / VL); meta.push({ A, hf: q.hf, side: q.side, roll: q.roll, arcEnd, H, u }); } }
  const idx = []; for (let i = 0; i < NU; i++) for (let s = 0; s < NS - 1; s++) { const a = i * NS + s, b = (i + 1) * NS + s; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  // the end caps: each front end's cross-section closed (a fan from its middle)
  for (const [i, flip] of [[0, false], [NU, true]]) { const c = P.length / 3; let mx = 0, my = 0, mz = 0; for (let s = 0; s < NS; s++) { mx += P[(i * NS + s) * 3]; my += P[(i * NS + s) * 3 + 1]; mz += P[(i * NS + s) * 3 + 2]; }
    P.push(mx / NS, my / NS, mz / NS); UV.push(i / NU, 0.5); meta.push({ ...meta[i * NS + (NS >> 1)], cap: true }); for (let s = 0; s < NS - 1; s++) { const a = i * NS + s, b = a + 1; if (flip) idx.push(c, a, b); else idx.push(c, b, a); } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(idx); g.computeVertexNormals();
  // the winding: the outside's normals must face out (away from the neck)
  { const n = g.attributes.normal; let out = 0, cnt = 0; for (let k = 0; k < meta.length; k++) if (meta[k].side === 1 && !meta[k].cap) { const x = P[k * 3] - cx, z = P[k * 3 + 2] - cz; out += Math.sign(n.getX(k) * x + n.getZ(k) * z); cnt++; }
    if (out < 0) { for (let t = 0; t < idx.length; t += 3) [idx[t + 1], idx[t + 2]] = [idx[t + 2], idx[t + 1]]; g.setIndex(idx); g.computeVertexNormals(); } }
  const nv = P.length / 3, N = g.attributes.normal.array;
  // skinned as the nearest point of the old collar
  const OJ = old.p.getAttribute('JOINTS_0').getArray(), OW = old.p.getAttribute('WEIGHTS_0').getArray(), J = new Uint16Array(nv * 4), W = new Float32Array(nv * 4);
  for (let v = 0; v < nv; v++) { let best = 1e9, bv = OV[0]; for (const o of OV) { const d = (OA[o * 3] - P[v * 3]) ** 2 + (OA[o * 3 + 1] - P[v * 3 + 1]) ** 2 + (OA[o * 3 + 2] - P[v * 3 + 2]) ** 2; if (d < best) { best = d; bv = o; } }
    for (let k = 0; k < 4; k++) { J[v * 4 + k] = OJ[bv * 4 + k]; W[v * 4 + k] = OW[bv * 4 + k]; } }
  // the paint: 2048 x 256 (u round the band, v across it)
  const TW = 2048, TH = 256, base = Buffer.alloc(TW * TH * 4), mr = Buffer.alloc(TW * TH * 4), nm = Buffer.alloc(TW * TH * 4);
  const lin = (c) => Math.pow(c / 255, 2.2), enc = (l) => Math.min(255, Math.max(0, Math.round(255 * Math.pow(Math.max(0, l), 1 / 2.2))));
  const span = TAU * 0.06; // metres round the band, about (for the stitch spacing)
  const vOf = (side, hf) => { for (let s = 0; s < NS - 1; s++) { const q = sec[s], q2 = sec[s + 1]; if (q.side !== side || q2.side !== side || q.roll != null || q2.roll != null) continue; const lo = Math.min(q.hf, q2.hf), hi = Math.max(q.hf, q2.hf); if (hf >= lo && hf <= hi) { const t = (hf - q.hf) / (q2.hf - q.hf || 1); return (vlen[s] + t * (vlen[s + 1] - vlen[s])) / VL; } } return null; };
  const vTopIn = vlen[NH] / VL, vTopOut = vlen[NH + NR] / VL; // (the roll between)
  const snaps = [0.175, 0.31].map((a) => ({ a, hf: 0.36 })), tab = { a0: K.gapLo + 0.035, a1: 0.43, h0: 0.12, h1: 0.62 };
  for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) { const i = y * TW + x, u = (x + 0.5) / TW, v = (y + 0.5) / TH;
    // where this texel is: the outside (v past the roll) by height from the top edge, in metres
    const outside = v > vTopOut, inside = v < vTopIn, onRoll = !outside && !inside, dTop = outside ? (v - vTopOut) * VL : inside ? (vTopIn - v) * VL : 0;
    const a = K.gapLo + u * (TAU - 2 * K.gapLo), A = a > Math.PI ? a - TAU : a, along = u * span;
    const q = [Math.sin(A) * 0.06, 1.48 + dTop, Math.cos(A) * 0.06];
    const grain = fbm(q[0] * 3, q[1] * 3, q[2] * 3, 340) - 0.5, mott = 0.94 + 0.12 * fbm(q[0], q[1], q[2], 18);
    let col = K.black.map((k) => lin(k) * mott * (1 + 0.25 * grain)), rough = K.rough + 0.14 * (fbm(q[0], q[1], q[2], 40) - 0.5) + 0.08 * grain, metal = 0, n = [grain * 0.35, (fbm(q[0] * 3 + 7, q[1] * 3, q[2] * 3, 340) - 0.5) * 0.35];
    if (onRoll) { rough -= 0.08; col = col.map((c) => c * 1.12); } // (the rolled edge rubbed a little smoother)
    if (outside || inside) {
      // the stitching: a row 4 mm under the top edge, and one 5 mm over the foot (outside only), each stitch 3 mm, 1 mm gaps
      const st = (d0) => { const r = Math.abs(dTop - d0); if (r > 0.0006) return 0; return (along % 0.004) < 0.003 ? 1 - r / 0.0006 : -0.5; };
      const hfHere = 1 - dTop / Math.max(0.02, K.H); let s = st(0.004); if (outside) s = Math.max(s, st(K.H - 0.005) * (hfHere > 0.05 ? 1 : 0));
      if (s > 0) { col = [lin(40), lin(40), lin(42)].map((c) => c * (0.8 + 0.3 * s)); rough = 0.75; n = [0, 0.4 * Math.sign(Math.sin(along * 1600))]; }
      else if (s < 0) { col = col.map((c) => c * 0.6); n = [0, 0]; }
      // the snap tab (outside, on his left near the throat): a strap outline stitched round, and two snaps
      if (outside && A > 0) { const hf = hfHere; if (A > tab.a0 && A < tab.a1 && hf > tab.h0 && hf < tab.h1) { const e = Math.min((A - tab.a0) * 0.065, (tab.a1 - A) * 0.065, (hf - tab.h0) * K.H, (tab.h1 - hf) * K.H);
          if (e < 0.0007) { col = col.map((c) => c * 0.45); n = [0, 0]; } else if (Math.abs(e - 0.0022) < 0.0004 && (along % 0.004) < 0.003) { col = [lin(40), lin(40), lin(42)]; rough = 0.75; } else { col = col.map((c) => c * 1.06); rough -= 0.04; } }
        for (const S of snaps) { const d = Math.hypot((A - S.a) * 0.065, (hf - S.hf) * K.H); if (d < 0.0042) { const t = d / 0.0042; col = [lin(86), lin(86), lin(92)].map((k) => k * (t > 0.8 ? 0.5 : 0.85 + 0.35 * (1 - t))); metal = 1; rough = 0.32; n = [((A - S.a) * 0.065 / 0.0042) * 0.8, ((hf - S.hf) * K.H / 0.0042) * -0.8]; } else if (d < 0.0052) { col = col.map((c) => c * 0.55); } } }
    }
    base[i * 4] = enc(col[0]); base[i * 4 + 1] = enc(col[1]); base[i * 4 + 2] = enc(col[2]); base[i * 4 + 3] = 255;
    mr[i * 4] = 255; mr[i * 4 + 1] = Math.round(clamp(rough, 0.2, 0.95) * 255); mr[i * 4 + 2] = Math.round(metal * 255); mr[i * 4 + 3] = 255;
    const L = Math.hypot(n[0], n[1], 1); nm[i * 4] = Math.round((n[0] / L * 0.5 + 0.5) * 255); nm[i * 4 + 1] = Math.round((n[1] / L * 0.5 + 0.5) * 255); nm[i * 4 + 2] = Math.round((1 / L * 0.5 + 0.5) * 255); nm[i * 4 + 3] = 255; }
  const mk = async (name, buf, q) => doc.createTexture(name).setImage(await sharp(buf, { raw: { width: TW, height: TH, channels: 4 } }).removeAlpha().webp({ quality: q, effort: 5 }).toBuffer()).setMimeType('image/webp');
  const om = old.p.getMaterial(), mat = doc.createMaterial('moto-collar').setBaseColorFactor([1, 1, 1, 1]).setMetallicFactor(1).setRoughnessFactor(1).setDoubleSided(true)
    .setBaseColorTexture(await mk('moto-collar-leather', base, 90)).setMetallicRoughnessTexture(await mk('moto-collar-mr', mr, 90)).setNormalTexture(await mk('moto-collar-normal', nm, 92))
    .setExtras({ ...(om.getExtras() || {}), garment: 'leather-moto-jacket', bandPainted: true });
  const buf = R.listBuffers()[0], acc = (type, arr) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buf);
  const prim = doc.createPrimitive().setMaterial(mat).setAttribute('POSITION', acc('VEC3', Float32Array.from(P))).setAttribute('NORMAL', acc('VEC3', Float32Array.from(N))).setAttribute('TEXCOORD_0', acc('VEC2', Float32Array.from(UV)))
    .setAttribute('JOINTS_0', acc('VEC4', J)).setAttribute('WEIGHTS_0', acc('VEC4', W)).setIndices(acc('SCALAR', new Uint32Array(idx)));
  old.m.addPrimitive(prim); old.m.removePrimitive(old.p);
  console.log('band collar: points', nv, 'triangles', idx.length / 3, 'centre z', cz.toFixed(3), 'foot front/back', foot(0).toFixed(3), foot(Math.PI).toFixed(3), 'r top front/back', rIn(0.3, 1).toFixed(3), rIn(Math.PI, 1).toFixed(3));
}
