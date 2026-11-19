// Jensen face (Blender track): two build passes for scripts/handbuilt/jensen/build.mjs.
//   sculptPass(doc, file)   the head sculpt: a MakeHuman-format .target (base.obj vertex, dx dy dz) baked into the rest
//                           shape through facekit.bakeRest (uv-mapped, scaled to the body, carried to brows/lashes/lower
//                           teeth). Same points, same order: every later morph target still applies.
//   mapsPass(doc, dir)      the skin's albedo, metallicRoughness and normal (4096, on the existing hm08 UVs) and the eyes'
//                           base colour replaced by the Blender bakes in dir (webp; alpha kept on the eyes).
// Original work (procedural, no photo input), CC0.
import fs from 'node:fs';
import path from 'node:path';
const HB = process.env.JH_HANDBUILT || new URL('../../', import.meta.url).pathname;
const { bakeRest } = await import(path.join(HB, 'facekit.mjs'));
const { matOf, sharp } = await import(path.join(HB, 'young-hero/glb.mjs'));
export function sculptPass(doc, file) { bakeRest(doc, [[file, 1]]); }
async function put(tex, file, q = 90, alpha = false) {
  // (the repo keeps the bakes as webp at their shipped quality: used as they are, never encoded twice)
  if (file.endsWith('.webp')) { const buf = fs.readFileSync(file); tex.setImage(buf).setMimeType('image/webp'); return buf.length; }
  let img = sharp(fs.readFileSync(file)); if (!alpha) img = img.removeAlpha();
  const buf = await img.webp({ quality: q, effort: 5, alphaQuality: 100 }).toBuffer(); tex.setImage(buf).setMimeType('image/webp'); return buf.length;
}
export async function mapsPass(doc, dir, K = {}) {
  const skin = matOf(doc, 'skin'), eyes = matOf(doc, 'eyes'); const f = (n) => { const p = path.join(dir, n), w = p.replace(/\.png$/, '.webp'); return fs.existsSync(w) ? w : p; }; let n = 0;
  if (fs.existsSync(f('skin-albedo.png'))) n += await put(skin.getBaseColorTexture(), f('skin-albedo.png'), K.q || 90);
  if (fs.existsSync(f('skin-mr.png')) && skin.getMetallicRoughnessTexture()) n += await put(skin.getMetallicRoughnessTexture(), f('skin-mr.png'), 92);
  if (fs.existsSync(f('skin-normal.png'))) n += await put(skin.getNormalTexture(), f('skin-normal.png'), 94);
  if (fs.existsSync(f('eyes-albedo.png'))) n += await put(eyes.getBaseColorTexture(), f('eyes-albedo.png'), 92, true);
  console.log('face maps:', (n / 1048576).toFixed(2), 'MB of webp');
}
// The mouth's inside: an open mouth showed through to the head's inside (the skin's own back faces, the lower teeth's
// grey backs and the scalp texture) instead of a dark oral cavity. A closed ellipsoid behind the lips, its normals
// pointing INWARD and single-sided, so only its far wall draws: dark through the lips' gap, never over the teeth or
// the lips in front of it. It rides the head as the upper teeth do (each point takes the skinning of the nearest
// upper-teeth point) and has no morphs of its own (addMorphs gives it zero targets when this runs before 'morphs').
export function mouthBagPass(doc, K = {}) {
  K = { rx: 0.024, ry: 0.02, rz: 0.017, back: 0.03, down: 0.003, col: [0.03, 0.012, 0.012], seg: 24, ring: 16, ...K };
  const { prim } = HBmods; const tu = prim(doc, 'teethUp')[0]; if (!tu) { console.log('mouth bag: no teethUp'); return; }
  const P = tu.getAttribute('POSITION'), J = tu.getAttribute('JOINTS_0'), W = tu.getAttribute('WEIGHTS_0');
  const idx = [...new Set(tu.getIndices().getArray())]; const p = [0, 0, 0]; let c = [0, 0, 0], zmax = -9;
  for (const v of idx) { P.getElement(v, p); for (let k = 0; k < 3; k++) c[k] += p[k] / idx.length; zmax = Math.max(zmax, p[2]); }
  // glTF: y up, +z forward. Centre behind the upper teeth's front, a little below them.
  const C = [0, c[1] - K.down, zmax - K.back]; const pos = [], nrm = [], jn = [], wt = [], ind = [];
  const nearest = (q) => { let b = -1, bd = 1e9; for (const v of idx) { P.getElement(v, p); const d = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2; if (d < bd) { bd = d; b = v; } } return b; };
  const jj = [0, 0, 0, 0], ww = [0, 0, 0, 0];
  for (let i = 0; i <= K.ring; i++) { const th = Math.PI * i / K.ring; for (let j = 0; j <= K.seg; j++) { const ph = 2 * Math.PI * j / K.seg;
    const n = [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)]; const q = [C[0] + K.rx * n[0], C[1] + K.rz * n[1], C[2] + K.ry * n[2]];
    pos.push(...q); nrm.push(-n[0], -n[1], -n[2]); const v = nearest(q); J.getElement(v, jj); W.getElement(v, ww); jn.push(...jj); wt.push(...ww); } }
  for (let i = 0; i < K.ring; i++) for (let j = 0; j < K.seg; j++) { const a = i * (K.seg + 1) + j, b = a + K.seg + 1;
    ind.push(a, b, a + 1, a + 1, b, b + 1); }  // wound so the front face looks inward
  const buf = P.getBuffer(), mk = (t, arr, T) => doc.createAccessor().setType(t).setArray(new T(arr)).setBuffer(buf);
  const mat = doc.createMaterial('mouth-inside').setBaseColorFactor([...K.col, 1]).setRoughnessFactor(0.55).setMetallicFactor(0).setDoubleSided(false);
  const pr = doc.createPrimitive().setMaterial(mat).setIndices(mk('SCALAR', ind, Uint16Array))
    .setAttribute('POSITION', mk('VEC3', pos, Float32Array)).setAttribute('NORMAL', mk('VEC3', nrm, Float32Array))
    .setAttribute('JOINTS_0', mk('VEC4', jn, J.getArray().constructor)).setAttribute('WEIGHTS_0', mk('VEC4', wt, W.getArray().constructor));
  const mesh = doc.getRoot().listMeshes().find((m) => m.listPrimitives().includes(tu)); mesh.addPrimitive(pr);
  console.log('mouth bag: centre', C.map((x) => x.toFixed(4)).join(','), 'points', pos.length / 3);
}
const HBmods = await import(path.join(HB, 'young-hero/glb.mjs'));
// The lower teeth in the talking morphs: facekit carries them by the nearby chin and lip skin, point by point, so on
// jawOpen and the open visemes their tops followed the lower lip and their roots the chin: the row stretched into a
// tall grey wall with shards behind it. After 'morphs', each target's lower-teeth deltas are replaced by ONE rigid
// motion: a rotation about the jaw's hinge axis (x, through the hinge point) fitted to the mean delta of the teeth,
// so the row swings down and back as a solid piece.
export function teethRigidPass(doc, K = {}) {
  K = { hingeBack: 0.075, hingeUp: 0.035, gain: 1.0, ...K };
  const { prim } = HBmods; const tl = prim(doc, 'teethLow')[0]; if (!tl) return;
  const P = tl.getAttribute('POSITION'), idx = [...new Set(tl.getIndices().getArray())], a = P.getArray();
  let cx = 0, cy = 0, cz = 0; for (const v of idx) { cx += a[v * 3]; cy += a[v * 3 + 1]; cz += a[v * 3 + 2]; } cx /= idx.length; cy /= idx.length; cz /= idx.length;
  const hy = cy + K.hingeUp, hz = cz - K.hingeBack; // hinge: above and behind the lower teeth (glTF: y up, +z forward)
  let n = 0;
  for (const t of tl.listTargets()) { const A = t.getAttribute('POSITION'); if (!A) continue; const d = A.getArray().slice();
    let my = 0, mz = 0, mx = 0; for (const v of idx) { mx += d[v * 3]; my += d[v * 3 + 1]; mz += d[v * 3 + 2]; } mx /= idx.length; my /= idx.length; mz /= idx.length;
    if (Math.hypot(mx, my, mz) < 1e-5) { for (const v of idx) d[v * 3] = d[v * 3 + 1] = d[v * 3 + 2] = 0; A.setArray(d); continue; }
    // the angle that moves the teeth's centre by (my, mz) about the hinge (small-angle fit along the tangent)
    const ry = cy - hy, rz = cz - hz, r2 = ry * ry + rz * rz, tan = [rz, -ry]; // tangent of a rotation that drops the front
    const ang = (my * tan[0] + mz * tan[1]) / r2 * K.gain, c = Math.cos(ang), s = Math.sin(ang);
    for (const v of idx) { const y = a[v * 3 + 1] - hy, z = a[v * 3 + 2] - hz; d[v * 3] = mx * 0.5; d[v * 3 + 1] = (c * y + s * z) - y; d[v * 3 + 2] = (-s * y + c * z) - z; }
    A.setArray(d); n++; }
  console.log('teeth rigid: targets', n, 'teeth points', idx.length);
}
// The skin's tone graded (assembly, iteration 1): in the game's lights the Blender bake's albedo (face ~ sRGB 158,111,71)
// read orange, not his warm light tan: some of its saturation out (desat), then lifted and balanced per channel (mul).
export async function skinTonePass(doc, K = {}) {
  K = { desat: 0.3, mul: [1.2, 1.13, 1.15], q: 90, ...K };
  const t = matOf(doc, 'skin').getBaseColorTexture(), img = sharp(Buffer.from(t.getImage())), meta = await img.metadata();
  const { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  // (the bake's islands bled out: its background is black, and a few triangles at the neck behind the jaw reach past their
  // island's edge in uv (the dark saw-toothed shards under his ears in profile): every background texel within K.bleed
  // texels of an island takes the colour of the island texels next to it, ring by ring)
  { const W = info.width, H = info.height, bg = new Uint8Array(W * H); let front = [];
    for (let p = 0; p < W * H; p++) if (data[p * 4] + data[p * 4 + 1] + data[p * 4 + 2] < 24) bg[p] = 1;
    for (let p = 0; p < W * H; p++) if (bg[p]) { const x = p % W, y = (p / W) | 0; if ((x > 0 && !bg[p - 1]) || (x < W - 1 && !bg[p + 1]) || (y > 0 && !bg[p - W]) || (y < H - 1 && !bg[p + W])) front.push(p); }
    let filled = 0;
    for (let ring = 0; ring < (K.bleed ?? 96) && front.length; ring++) {
      const set = [];
      for (const p of front) { if (!bg[p]) continue; const x = p % W, y = (p / W) | 0; let n = 0; const c = [0, 0, 0];
        for (const q of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, y > 0 ? p - W : -1, y < H - 1 ? p + W : -1]) if (q >= 0 && !bg[q]) { n++; for (let k = 0; k < 3; k++) c[k] += data[q * 4 + k]; }
        if (n) set.push([p, c[0] / n, c[1] / n, c[2] / n]); }
      const next = new Set();
      for (const [p, r, g, b] of set) { data[p * 4] = r; data[p * 4 + 1] = g; data[p * 4 + 2] = b; bg[p] = 0; filled++; }
      for (const [p] of set) { const x = p % W, y = (p / W) | 0; for (const q of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, y > 0 ? p - W : -1, y < H - 1 ? p + W : -1]) if (q >= 0 && bg[q]) next.add(q); }
      front = [...next]; }
    console.log('skin bleed: texels filled', filled); }
  // (and the neck under the ears: a few of its triangles reach into the scalp's grey in uv (the dark saw-toothed shards on
  // the side of his neck in profile): in each neck triangle (bind height ny0..ny1, the front of the neck), a texel that
  // is not skin-coloured (red over blue by less than K.warm) takes the mean of that triangle's skin-coloured texels)
  { const W = info.width, H = info.height, { prim } = await import(path.join(HB, 'young-hero/glb.mjs'));
    const ny0 = K.ny0 ?? 1.42, ny1 = K.ny1 ?? 1.6, warm = K.warm ?? 22; let fixed = 0;
    for (const p of prim(doc, 'skin')) { const P = p.getAttribute('POSITION').getArray(), U = p.getAttribute('TEXCOORD_0').getArray(), I = p.getIndices().getArray();
      for (let t = 0; t < I.length; t += 3) { const a = I[t], b = I[t + 1], c = I[t + 2];
        if (![a, b, c].every((v) => P[v * 3 + 1] > ny0 && P[v * 3 + 1] < ny1 && P[v * 3 + 2] > -0.04 && Math.abs(P[v * 3]) > 0.015)) continue;
        const ux = [a, b, c].map((v) => U[v * 2] * W), uy = [a, b, c].map((v) => U[v * 2 + 1] * H);
        const x0 = Math.max(0, Math.floor(Math.min(...ux))), x1 = Math.min(W - 1, Math.ceil(Math.max(...ux))), y0 = Math.max(0, Math.floor(Math.min(...uy))), y1 = Math.min(H - 1, Math.ceil(Math.max(...uy)));
        if ((x1 - x0) * (y1 - y0) > 40000) continue;
        const ed = (i, j, px, py) => (ux[j] - ux[i]) * (py - uy[i]) - (uy[j] - uy[i]) * (px - ux[i]), ar = ed(0, 1, ux[2], uy[2]); if (!ar) continue;
        const inside = [];
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const px = x + 0.5, py = y + 0.5, e0 = ed(1, 2, px, py) / ar, e1 = ed(2, 0, px, py) / ar, e2 = ed(0, 1, px, py) / ar;
          if (e0 < -0.04 || e1 < -0.04 || e2 < -0.04) continue; inside.push((y * W + x) * 4); }
        if (!inside.length) continue;
        // (a texel is the neck's skin when it is warm (red over blue by K.warm) and not far darker than the triangle's own
        // brightest half: the scalp's grey and the islands' dark edges are neither)
        const lum = (q) => data[q] + data[q + 1] + data[q + 2], L = inside.map(lum).sort((a, b) => a - b), ref = L[Math.floor(L.length * 0.75)];
        const good = (q) => data[q] - data[q + 2] >= warm && lum(q) >= ref * 0.72, m = [0, 0, 0]; let n = 0;
        for (const q of inside) if (good(q)) { for (let k = 0; k < 3; k++) m[k] += data[q + k]; n++; }
        if (!n || n < inside.length * 0.3) continue;
        for (const q of inside) if (!good(q)) { for (let k = 0; k < 3; k++) data[q + k] = m[k] / n; fixed++; } } }
    console.log('neck texels re-skinned', fixed); }
  for (let i = 0; i < data.length; i += 4) { const r = data[i], g = data[i + 1], b = data[i + 2], l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    data[i] = Math.min(255, (r + (l - r) * K.desat) * K.mul[0]); data[i + 1] = Math.min(255, (g + (l - g) * K.desat) * K.mul[1]); data[i + 2] = Math.min(255, (b + (l - b) * K.desat) * K.mul[2]); }
  let out = sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }); if (!meta.hasAlpha) out = out.removeAlpha();
  const buf = await out.webp({ quality: K.q, effort: 5 }).toBuffer(); t.setImage(buf).setMimeType('image/webp');
  console.log('skin tone: desat', K.desat, 'mul', K.mul.join(','), (buf.length / 1024 | 0) + 'K');
}
