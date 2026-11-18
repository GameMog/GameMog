// Hand-built young mother, pass 5 (age, round 2): after p4 she read about 18-24. What still read young: high thin brows
// (pass 1 lifted them 2-3 mm to take out a scowl), a broad mid-face, flat hair close to the skull with no part, a heavy
// painted hairline band, and a faint point at one bust apex under the key light.
//  brows       BROW_DROP: the brow cards 1.7 mm lower (back 0.4 mm per mm, on the brow ridge's slope); the skin pass paints
//              the underlay at the same place (skin.mjs K.browDrop)
//  midFace     the mid-face ~3% narrower: the cheeks and the cheekbones' sides scaled in x toward the midline (eyes and
//              mouth held), fading out above the brows, below the jaw's angle and behind the ears' front
//  hairVolume  the hair (and the locks over it) pushed out from the skull: the crown up to 5 mm, the sides above the ears
//              3 mm, more on the long side next to the part, so the hair rises from a side part; the hairline's roots kept
//  partLine    a clear side part painted on the hair texture (a thin, slightly lighter, broken scalp line along x = part
//              from the front edge back over the crown, rastered from the hair's uvs)
//  apexClean   the bust apex's last point: the fleece's normal map set flat (128,128,255) within 5 cm of each apex (the
//              hoodie's uv seam runs through the apex, so the tangent-space bake drew a crease from the tip), and the base
//              colour there blended toward a light blur (its baked pucker shade gone; the heather kept)
import { body, prim, matOf, raster, rgba, setWebp, sm, h3, sharp } from '../young-hero/glb.mjs';

export const BROW_DROP = 0.0017;
const g = (dx, dy, dz, sx, sy, sz) => Math.exp(-((dx / sx) ** 2 + (dy / sy) ** 2 + (dz / sz) ** 2));

export function browsDownPass(doc, K = {}) {
  K = { drop: BROW_DROP, ...K };
  const B = body(doc), P = B.P, a = P.getArray().slice(), bv = new Set(prim(doc, 'brows').flatMap((q) => [...q.getIndices().getArray()]));
  for (const v of bv) { a[v * 3 + 1] -= K.drop; a[v * 3 + 2] += 0.4 * K.drop; }
  P.setArray(a); console.log('brows down', bv.size, 'points');
}

export function midFacePass(doc, K = {}) {
  K = { s: 0.03, ...K };
  const B = body(doc), P = B.P, a = P.getArray().slice(), head = B.wOn(/^(head|neck)/), n = a.length / 3; let moved = 0, maxd = 0;
  for (let v = 0; v < n; v++) { if (head[v] < 0.3) continue; const x0 = a[v * 3], y = a[v * 3 + 1], z = a[v * 3 + 2], x = Math.abs(x0);
    if (y < 1.4 || y > 1.53 || z < 0.0) continue;
    const band = sm(1.405, 1.43, y) * (1 - sm(1.505, 1.525, y)) * sm(0.02, 0.06, z) * sm(0.012, 0.035, x);
    const hold = 1 - Math.max(g(x - 0.033, y - 1.5, z - 0.13, 0.015, 0.009, 0.03), g(x, y - 1.437, z - 0.14, 0.026, 0.01, 0.03));
    const dx = -x0 * K.s * band * hold * Math.min(1, head[v] / 0.6); if (Math.abs(dx) < 1e-7) continue;
    a[v * 3] += dx; moved++; maxd = Math.max(maxd, Math.abs(dx)); }
  P.setArray(a); console.log('mid face: moved', moved, 'max mm', (maxd * 1000).toFixed(2));
}

export function hairVolumePass(doc, K = {}) {
  K = { crown: 0.0014, side: 0.0006, ridge: 0.003, part: 0.024, C: [0, 1.5, 0.0], ...K };
  let n = 0;
  for (const name of ['hair', 'hair-locks']) for (const p of prim(doc, name)) {
    const A = p.getAttribute('POSITION'), a = A.getArray().slice();
    for (let v = 0; v < a.length / 3; v++) { const x0 = a[v * 3], y = a[v * 3 + 1], z = a[v * 3 + 2], x = Math.abs(x0);
      if (y < 1.38) continue;
      const crown = sm(1.52, 1.585, y), side = sm(0.055, 0.075, x) * sm(1.42, 1.5, y) * (1 - sm(1.56, 1.6, y));
      // (the long side, her right, next to the part: a soft lift so the hair rises away from the part)
      const ridge = g(x0 - (K.part - 0.022), 0, 0, 0.014, 1, 1) * sm(1.56, 1.59, y);
      // (the hairline's front kept: no lift at the forehead's edge, where the roots lie on the skin)
      const keep = 1 - sm(0.06, 0.1, z) * (1 - sm(1.585, 1.6, y));
      const amt = (K.crown * crown + K.side * side + K.ridge * ridge) * keep; if (amt < 1e-6) continue;
      const d = [x0 - K.C[0], y - K.C[1], z - K.C[2]], L = Math.hypot(...d) || 1;
      for (let k = 0; k < 3; k++) a[v * 3 + k] += (d[k] / L) * amt; n++; }
    A.setArray(a); }
  console.log('hair volume: points', n);
}

// (a texture's texels' positions, from a primitive's uvs)
function texPos(p, S) {
  const a = p.getAttribute('POSITION').getArray(), uv = p.getAttribute('TEXCOORD_0').getArray(), idx = [...p.getIndices().getArray()], pos = new Float32Array(S * S * 3).fill(NaN);
  raster(idx, (v) => [uv[v * 2] * S, uv[v * 2 + 1] * S], S, (x, y, l1, l2, l3, i0, i1, i2) => { const k = (y * S + x) * 3; for (let c = 0; c < 3; c++) pos[k + c] = l1 * a[i0 * 3 + c] + l2 * a[i1 * 3 + c] + l3 * a[i2 * 3 + c]; }, 0.02);
  return pos;
}

export async function partLinePass(doc, K = {}) {
  K = { part: 0.024, w: 0.0011, scalp: [96, 70, 58], ...K };
  const t = matOf(doc, 'hair').getBaseColorTexture(), img = await rgba(t), S = img.w, d = img.data, pos = texPos(prim(doc, 'hair')[0], S);
  let n = 0;
  for (let i = 0; i < S * S; i++) { const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2]; if (Number.isNaN(x) || y < 1.565 || z < -0.035 || z > 0.1) continue;
    const along = sm(-0.035, -0.01, z) * (1 - sm(0.07, 0.095, z)), wob = 0.0005 * Math.sin(z * 260), dd = Math.abs(x - K.part - wob);
    const br = h3(Math.floor(z * 2500), 1, 7) < 0.25 ? 0.45 : 1, w = (1 - sm(K.w * 0.4, K.w, dd)) * along * br * 0.75; if (w <= 0) continue;
    for (let c = 0; c < 3; c++) d[i * 4 + c] = Math.round(d[i * 4 + c] * (1 - w) + K.scalp[c] * w); n++; }
  await setWebp(t, d, S, S, 88); console.log('part line: texels', n);
}

// (the point itself: at each apex a cluster of separate fleece points lay within a fraction of a millimetre of each
// other (the tear-fix had collapsed them, unwelded), a pinch the normals could not smooth across: every hoodie point
// within K.weld of another, near the apex, moved to its cluster's centre, so the smoothing passes weld them)
export function apexWeldPass(doc, K = {}) {
  K = { weld: 0.003, at: [0.103, 1.17, 0.137], r: 0.03, ...K };
  const p = prim(doc, 'hoodie')[0], A = p.getAttribute('POSITION'), a = A.getArray().slice(), n = a.length / 3; let merged = 0;
  for (const s of [1, -1]) { const vs = []; for (let v = 0; v < n; v++) if (Math.hypot(a[v * 3] - s * K.at[0], a[v * 3 + 1] - K.at[1], a[v * 3 + 2] - K.at[2]) < K.r) vs.push(v);
    const cl = new Int32Array(vs.length).fill(-1); let c = 0;
    for (let i = 0; i < vs.length; i++) { if (cl[i] >= 0) continue; cl[i] = c; const st = [i]; while (st.length) { const j = st.pop(); for (let k = 0; k < vs.length; k++) if (cl[k] < 0 && Math.hypot(a[vs[j] * 3] - a[vs[k] * 3], a[vs[j] * 3 + 1] - a[vs[k] * 3 + 1], a[vs[j] * 3 + 2] - a[vs[k] * 3 + 2]) < K.weld) { cl[k] = c; st.push(k); } } c++; }
    for (let q = 0; q < c; q++) { const mem = vs.filter((_, i) => cl[i] === q); if (mem.length < 2) continue; const m = [0, 1, 2].map((k) => mem.reduce((t, v) => t + a[v * 3 + k], 0) / mem.length);
      const distinct = new Set(mem.map((v) => `${a[v * 3]},${a[v * 3 + 1]},${a[v * 3 + 2]}`)).size; if (distinct > 1) merged += mem.length; for (const v of mem) for (let k = 0; k < 3; k++) a[v * 3 + k] = m[k]; } }
  A.setArray(a); console.log('apex weld: points merged', merged);
}

export async function apexCleanPass(doc, K = {}) {
  K = { r0: 0.05, r1: 0.07, cr0: 0.035, cr1: 0.05, ...K };
  const mat = matOf(doc, 'hoodie'), p = prim(doc, 'hoodie')[0], a = p.getAttribute('POSITION').getArray();
  // (each apex: the hoodie's frontmost point near the forge's apex, as it is now)
  const ap = [1, -1].map((s) => { let bz = -1, best = null; for (let v = 0; v < a.length / 3; v++) { const x = a[v * 3] * s, y = a[v * 3 + 1], z = a[v * 3 + 2]; if (Math.abs(x - 0.105) < 0.025 && Math.abs(y - 1.14) < 0.03 && z > bz) { bz = z; best = [a[v * 3], y, z]; } } return best; });
  console.log('apex clean at', ap.map((c) => c.map((u) => u.toFixed(3)).join(',')));
  const wf = (r0, r1) => (x, y, z) => { if (z < 0.05) return 0; let w = 0; for (const c of ap) w = Math.max(w, sm(r1, r0, Math.hypot(x - c[0], y - c[1], (z - c[2]) * 0.5))); return w; };
  for (const [tex, flat, f] of [[mat.getNormalTexture(), true, wf(K.r0, K.r1)], [mat.getBaseColorTexture(), false, wf(K.cr0, K.cr1)]]) { if (!tex) continue;
    const img = await rgba(tex), S = img.w, d = img.data, pos = texPos(p, S);
    const bl = flat ? null : await sharp(Buffer.from(d), { raw: { width: S, height: S, channels: 4 } }).blur(4).raw().toBuffer();
    let n = 0; for (let i = 0; i < S * S; i++) { const x = pos[i * 3]; if (Number.isNaN(x)) continue; const w = f(x, pos[i * 3 + 1], pos[i * 3 + 2]); if (w <= 0) continue; n++;
      const tgt = flat ? [128, 128, 255] : [bl[i * 4], bl[i * 4 + 1], bl[i * 4 + 2]], ww = flat ? w : 0.8 * w; for (let c = 0; c < 3; c++) d[i * 4 + c] = Math.round(d[i * 4 + c] * (1 - ww) + tgt[c] * ww); }
    await setWebp(tex, d, S, S, flat ? 80 : 88); console.log('apex clean:', flat ? 'normal' : 'colour', n, 'texels'); }
}
