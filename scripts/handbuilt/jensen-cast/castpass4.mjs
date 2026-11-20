// Jensen Heist's supporting cast, cast round 4 (20 Nov, the critic on round 3): the passes added after castpass3.mjs.
//   faceShapePass(doc, list)  rule 8/10, a face's relief and age by MakeHuman's own modifier targets (cheek bones, inner
//                             cheeks, jaw, brow ridge: CC0, FORGE_MH_TARGETS) baked into the rest shape (facekit bakeRest;
//                             the lashes, brows and a beard ride along)
//   eyeTamePass(doc, K)       the call tile's eye washout: the sclera a little greyer, the iris deeper, the clear coat
//                             thinner (the game keeps a GLB's own clear-coated eyes as they are, polish.js wetEyes)
//   dyePass(doc, re, col, K)  rule 9, a garment's colour by the render: every texture the matching materials draw remapped
//                             to the target sRGB colour at the texture's median, each texel's light kept as a ratio
//   seatClipsPass(doc, K)     rule 1 seated: the shared pack's 'sit' and 'sitTalk' (public/storykit/cast/cast-clips.glb)
//                             carried in the body as its own (the game plays a body's own clip over the pack's,
//                             storyrun/cast.js), their spine's flexion taken back toward the clip's standing frame by K.k
//                             (a slump folds the front of a jacket into a belly over the lap)
//   seatedProfile(doc, clip)  rule 1 measured seated: the body posed at the clip's frame, the torso's front (off the arms
//                             and the thighs) from the sternum to the belt and the belt to the lap, the largest forward
//                             deviation from the chest-belt line (m)
// Original procedural work, CC0.
import fs from 'node:fs';
import { matOf, rgba, setWebp, sm, io, THREE, sharp } from '../young-hero/glb.mjs';
import { bakeRest } from '../facekit.mjs';
import { armW } from './castpass3.mjs';

const lin = (c) => Math.pow(c / 255, 2.2), enc = (l) => Math.min(255, Math.max(0, Math.round(255 * Math.pow(Math.max(0, l), 1 / 2.2))));
const MHT = process.env.FORGE_MH_TARGETS || '';

export function faceShapePass(doc, list) {
  if (!list?.length) return;
  bakeRest(doc, list.map(([f, w]) => [MHT + '/' + f + '.target', w]));
  console.log('face shape:', list.map(([f, w]) => f + ' ' + w).join(', '));
}

export async function eyeTamePass(doc, K = {}) {
  K = { sclera: 0.8, iris: 0.72, coat: 0.45, rough: 0.28, ...K };
  const m = matOf(doc, 'eyes'); if (!m) return; const t = m.getBaseColorTexture();
  if (t) { const { data, w, h } = await rgba(t); let ns = 0, ni = 0;
    for (let i = 0; i < w * h; i++) { const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b), sat = mx ? (mx - mn) / mx : 0;
      // (the sclera: light and nearly grey; the iris: the rest of the eye's colour)
      const k = mx > 150 && sat < 0.22 ? K.sclera : mx > 25 ? K.iris : 1; if (k === K.sclera) ns++; else if (k === K.iris) ni++;
      for (let c = 0; c < 3; c++) data[i * 4 + c] = enc(lin(data[i * 4 + c]) * k); }
    await setWebp(t, data, w, h, 92); console.log('eyes tamed: sclera texels', ns, 'iris texels', ni); }
  m.setRoughnessFactor(K.rough); for (const e of m.listExtensions()) if (e.setClearcoatFactor) { e.setClearcoatFactor(K.coat); e.setClearcoatRoughnessFactor?.(0.06); }
}

export async function dyePass(doc, re, col, K = {}) {
  K = { contrast: 1, ...K };
  const mats = doc.getRoot().listMaterials().filter((m) => re.test(m.getName())), seen = new Set(), tgt = col.map(lin);
  for (const m of mats) { const t = m.getBaseColorTexture(); if (!t) { m.setBaseColorFactor([...tgt, 1]); continue; } if (seen.has(t)) continue; seen.add(t);
    const { data, w, h } = await rgba(t), L = new Float32Array(w * h); const hist = [];
    for (let i = 0; i < w * h; i++) { L[i] = 0.2126 * lin(data[i * 4]) + 0.7152 * lin(data[i * 4 + 1]) + 0.0722 * lin(data[i * 4 + 2]); if (data[i * 4 + 3] > 8 && i % 7 === 0) hist.push(L[i]); }
    hist.sort((a, b) => a - b); const med = hist[hist.length >> 1] || 0.2;
    // (a region mask (K.only(u, v)): a texture shared by a jacket and its shirt dyed in the jacket's part only)
    for (let i = 0; i < w * h; i++) { if (K.only && !K.only((i % w) / w, Math.floor(i / w) / h, data, i)) continue; const r = Math.pow(L[i] / med, K.contrast); for (let c = 0; c < 3; c++) data[i * 4 + c] = enc(tgt[c] * r); }
    await setWebp(t, data, w, h, 90); }
  for (const m of mats) m.setBaseColorFactor([1, 1, 1, 1]);
  console.log('dye:', String(re), '->', col.join(','), mats.length, 'materials');
}

// ---- seated
let PACK = null;
const packClip = async (name) => { PACK = PACK || await io.read(new URL('../../../public/storykit/cast/cast-clips.glb', import.meta.url).pathname); return PACK.getRoot().listAnimations().find((a) => a.getName() === name); };
const SPINE = /^(spine0[1-5]|neck0[1-3]|head)$/;
export async function seatClipsPass(doc, K = {}) {
  K = { clips: ['sit', 'sitTalk'], k: 0.45, keep: SPINE, ...K };
  const R = doc.getRoot(), byName = new Map(R.listNodes().map((n) => [n.getName(), n])), buf = R.listBuffers()[0], out = [];
  // (upright: the pack's own standing idle's first frame, bone by bone (the pack's rest frames are its own, not the body's))
  const idle = await packClip('idle'), up = new Map(); for (const ch of idle.listChannels()) if (ch.getTargetPath() === 'rotation') up.set(ch.getTargetNode().getName(), ch.getSampler().getOutput().getElement(0, [0, 0, 0, 1]));
  for (const name of K.clips) { const src = await packClip(name); if (!src) continue; const old = R.listAnimations().find((a) => a.getName() === name); if (old) old.dispose();
    const a = doc.createAnimation(name);
    for (const ch of src.listChannels()) { const node = byName.get(ch.getTargetNode().getName()); if (!node) continue; const s = ch.getSampler(), path = ch.getTargetPath(), I = s.getInput().getArray(), so = s.getOutput(), es = so.getElementSize(), O = new Float32Array(so.getCount() * es), el = new Array(es);
      // (read through getElement: the pack's outputs are quantized (normalized integers))
      for (let i = 0; i < so.getCount(); i++) { so.getElement(i, el); for (let c = 0; c < es; c++) O[i * es + c] = el[c]; }
      // (the spine's and the neck's turn toward the bind's (upright) by K.k: the slump halved; the head turned back by the
      // same share so the eyes stay on the lens)
      if (path === 'rotation' && K.keep.test(node.getName()) && up.has(node.getName())) { const r0 = new THREE.Quaternion(...up.get(node.getName())), q = new THREE.Quaternion(); for (let i = 0; i < O.length; i += 4) { q.set(O[i], O[i + 1], O[i + 2], O[i + 3]).slerp(r0, K.k); O[i] = q.x; O[i + 1] = q.y; O[i + 2] = q.z; O[i + 3] = q.w; } }
      // (the root's translation is the pack's skeleton's: kept as the pack has it)
      const smp = doc.createAnimationSampler().setInput(doc.createAccessor().setType('SCALAR').setArray(Float32Array.from(I)).setBuffer(buf)).setOutput(doc.createAccessor().setType(s.getOutput().getType()).setArray(O).setBuffer(buf)).setInterpolation(s.getInterpolation());
      a.addSampler(smp).addChannel(doc.createAnimationChannel().setTargetNode(node).setTargetPath(path).setSampler(smp)); }
    out.push(name + ' ' + a.listChannels().length + ' channels'); }
  console.log('seat clips: carried as the body\'s own, the spine\'s flexion x', (1 - K.k).toFixed(2), '|', out.join(', '));
}

// the skinned points of the torso's garments (and the skin) at a clip's frame
function posed(doc, anim, t) {
  const R = doc.getRoot(), sk = R.listSkins()[0], J = sk.listJoints(), par = new Map(); for (const n of R.listNodes()) for (const c of n.listChildren()) par.set(c, n);
  const key = new Map(); if (anim) for (const ch of anim.listChannels()) { const s = ch.getSampler(), ti = s.getInput().getArray(), vo = s.getOutput(); let k = 0; for (let i = 0; i < ti.length; i++) if (Math.abs(ti[i] - t) < Math.abs(ti[k] - t)) k = i; key.set(ch.getTargetNode().getName() + '.' + ch.getTargetPath(), vo.getElement(k, new Array(vo.getElementSize()))); }
  const W = new Map(); const world = (n) => { if (!n) return new THREE.Matrix4(); if (W.has(n)) return W.get(n); const nm = n.getName(); const t0 = key.get(nm + '.translation') || n.getTranslation(), r = key.get(nm + '.rotation') || n.getRotation();
    const w = world(par.get(n)).clone().multiply(new THREE.Matrix4().compose(new THREE.Vector3(...t0), new THREE.Quaternion(...r), new THREE.Vector3(...n.getScale()))); W.set(n, w); return w; };
  const IB = sk.getInverseBindMatrices(), S = J.map((j, i) => world(j).clone().multiply(new THREE.Matrix4().fromArray(IB.getElement(i, new Array(16)))));
  const jw = (nm) => new THREE.Vector3().setFromMatrixPosition(world(J.find((j) => j.getName() === nm)));
  return { S, J, jw };
}
export async function seatedProfile(doc, clip = 'sitTalk', t = 1.0, K = {}) {
  K = { x: 0.1, ...K };
  const R = doc.getRoot(), anim = R.listAnimations().find((a) => a.getName() === clip) || await packClip(clip);
  // (a pack clip on this body: its channels by name; posed() reads by the target node's name, so the pack's own nodes work)
const { S, J, jw } = posed(doc, anim, t), names = J.map((j) => j.getName()), LEG = names.map((n) => /^(upperleg|lowerleg|foot|toe)/.test(n));
  const sh = jw('upperarm01_L').add(jw('upperarm01_R')).multiplyScalar(0.5), hp = jw('upperleg01_L').add(jw('upperleg01_R')).multiplyScalar(0.5), sp = jw('spine05');
  // the trunk's own frame: up from the hips to the shoulders, forward the body's (+z turned by the root's heading)
  const up = sh.clone().sub(hp).normalize(), s0 = jw('upperleg01_L').sub(jw('upperleg01_R')), side = s0.sub(up.clone().multiplyScalar(s0.dot(up))).normalize(), fw = new THREE.Vector3().crossVectors(side, up).normalize();
  const ys = sh.clone().sub(hp).dot(up) - 0.05, yb = 0.07, rows = new Map(); void sp;
  const OUT = /^(eyes|brows|lashes|teethUp|teethLow|mouth-inside|tongue|hair|hairUnder|headset|beard|glasses.*|lens.*)$/;
  for (const p of R.listMeshes().flatMap((m) => m.listPrimitives())) { const nm = p.getMaterial()?.getName() || ''; if (OUT.test(nm) || /shoe|boot|sole|lace|eyelet/.test(nm) || !p.getIndices()) continue;
    const JA = p.getAttribute('JOINTS_0'), WA = p.getAttribute('WEIGHTS_0'); if (!JA) continue; const A = p.getAttribute('POSITION').getArray(), aw = armW(doc, p), j = [0, 0, 0, 0], w = [0, 0, 0, 0], v = new THREE.Vector3();
    for (const i of new Set(p.getIndices().getArray())) { if (aw[i] > 0.3) continue; JA.getElement(i, j); WA.getElement(i, w); let lw = 0; for (let k = 0; k < 4; k++) if (LEG[j[k]]) lw += w[k]; if (lw > (K.leg ?? 0.15)) continue;
      const el = new Array(16).fill(0), s = w[0] + w[1] + w[2] + w[3] || 1; for (let k = 0; k < 4; k++) if (w[k]) { const a = S[j[k]].elements; for (let q = 0; q < 16; q++) el[q] += a[q] * w[k] / s; }
      v.set(A[i * 3], A[i * 3 + 1], A[i * 3 + 2]).applyMatrix4(new THREE.Matrix4().fromArray(el)).sub(hp); const x = v.dot(side), y = v.dot(up), z = v.dot(fw);
      if (Math.abs(x) > K.x || y < (K.y0 ?? 0.03) - 0.005 || y > ys + 0.02) continue; const r = Math.round(y / 0.01); rows.set(r, Math.max(rows.get(r) ?? -9, z)); } }
  let zs = -9; for (let y = ys - 0.06; y <= ys + 1e-6; y += 0.01) zs = Math.max(zs, rows.get(Math.round(y / 0.01)) ?? -9);
  // (a row with only the back sampled (its front on the thighs' or the arms' weights) is no row: dropped)
  for (const [r, z] of rows) if (z < zs - 0.15) rows.delete(r);
  let zb = -9; for (let y = yb; y <= yb + 0.03 + 1e-6; y += 0.01) zb = Math.max(zb, rows.get(Math.round(y / 0.01)) ?? -9); if (zb < -1) zb = zs; zb = Math.min(zb, zs); let dev = 0, devY = 0; const prof = [];
  for (let y = K.y0 ?? 0.03; y <= ys + 1e-6; y += 0.01) { const z = rows.get(Math.round(y / 0.01)); if (z === undefined) continue; const line = y <= yb ? zb : Math.min(zs, zb + (zs - zb) * (y - yb) / (ys - yb - 0.06)), d = z - line; prof.push(+(d * 1000).toFixed(0)); if (d > dev) { dev = d; devY = y; } }
  return { dev, devY, prof };
}
export async function seatedGate(doc, id, K = {}) {
  const out = []; let worst = 0;
  for (const [clip, t] of K.frames || [['sitTalk', 0.5], ['sitTalk', 1.5], ['sit', 1.0]]) { const r = await seatedProfile(doc, clip, t, K); worst = Math.max(worst, r.dev); out.push(`${clip}@${t} ${(r.dev * 1000).toFixed(1)} mm at ${(r.devY * 100).toFixed(0)} cm`); }
  const ok = worst <= (K.max ?? 0.012);
  console.log(`seated gate: ${id} ${out.join('; ')} ${ok ? 'PASS' : 'FAIL'} (limit ${((K.max ?? 0.012) * 1000).toFixed(0)} mm)`);
  if (!ok && !process.env.JC_NOGATE && K.hard) throw new Error(`seated gate: ${id} ${(worst * 1000).toFixed(1)} mm`);
  return worst;
}
void fs; void sm;

// ---- Mr. Board's beard as short dense cards (the critic: "replace the fuzz beard with short dense cards"): roots
// area-weighted on the beard's own shell where its texture is covered (alpha over K.a), each a short card from the
// strand atlas (single strands and narrow clumps) lying down the face along the beard's growth (down, and out from the
// chin's middle), dark at the root, salt and pepper (its colour sampled from the shell's texture there); the shell itself
// kept as a darker, thinner under-layer. The cards ride the head bone and follow the face's morphs by their root's
// nearest skin point (beardMorphsPass, after the face's targets exist).
const ATLAS = new URL('../../../storykit/handbuilt/jensen/parts/hair-strands.webp', import.meta.url).pathname;
const STR = [[1252, 1547, 43], [1612, 1897, 54], [1978, 2257, 122], [3756, 3793, 1841], [3830, 3861, 849], [3954, 3978, 1041]];
export async function beardCardsPass(doc, K = {}) {
  K = { n: 4800, len: [0.0035, 0.0065], w: [0.0012, 0.002], lift: 0.0008, a: 0.45, under: 0.78, cut: 0.5, salt: 0.5, fine: 0.8, seed: 7, spec: 0.3, ...K };
  const R = doc.getRoot(), bp = R.listMeshes().flatMap((m) => m.listPrimitives()).find((p) => p.getMaterial()?.getName() === 'beard' && !BEARD_ROOTS.has(p)); if (!bp) return;
  const bm = bp.getMaterial(), { data: T, w: tw, h: th } = await rgba(bm.getBaseColorTexture());
  const P = bp.getAttribute('POSITION').getArray(), N = bp.getAttribute('NORMAL').getArray(), U = bp.getAttribute('TEXCOORD_0').getArray(), I = bp.getIndices().getArray();
  const tex = (u, v) => { const x = Math.min(tw - 1, Math.max(0, Math.floor(((u % 1) + 1) % 1 * tw))), y = Math.min(th - 1, Math.max(0, Math.floor(((v % 1) + 1) % 1 * th))), i = (y * tw + x) * 4; return [T[i], T[i + 1], T[i + 2], T[i + 3]]; };
  let s = K.seed; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647), rr = (a, b) => a + (b - a) * rnd();
  const tri = []; let area = 0, cx = 0, cn = 0;
  for (let t = 0; t < I.length; t += 3) { const [a, b, c] = [I[t], I[t + 1], I[t + 2]]; const e1 = [0, 1, 2].map((k) => P[b * 3 + k] - P[a * 3 + k]), e2 = [0, 1, 2].map((k) => P[c * 3 + k] - P[a * 3 + k]);
    const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]], ar = Math.hypot(...cr) / 2; if (ar < 1e-9) continue;
    const al = tex((U[a * 2] + U[b * 2] + U[c * 2]) / 3, (U[a * 2 + 1] + U[b * 2 + 1] + U[c * 2 + 1]) / 3)[3] / 255; if (al < K.a) continue; area += ar; tri.push([area, a, b, c]); cx += P[a * 3 + 1]; cn++; }
  const ymid = cx / cn; let ztop = -9; for (const [, a] of tri) ztop = Math.max(ztop, P[a * 3 + 2]);
  const pos = [], nrm = [], col = [], uvs = [], idx = [], root = [];
  for (let k = 0; k < K.n; k++) { const x0 = rnd() * area; let lo = 0, hi = tri.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (tri[m][0] < x0) lo = m + 1; else hi = m; }
    const [, a, b, c] = tri[lo]; let u = rnd(), v = rnd(); if (u + v > 1) { u = 1 - u; v = 1 - v; } const wa = 1 - u - v;
    const p = [0, 1, 2].map((q) => P[a * 3 + q] * wa + P[b * 3 + q] * u + P[c * 3 + q] * v), n0 = [0, 1, 2].map((q) => N[a * 3 + q] * wa + N[b * 3 + q] * u + N[c * 3 + q] * v), nl = Math.hypot(...n0), n = n0.map((x) => x / nl);
    const uv = [U[a * 2] * wa + U[b * 2] * u + U[c * 2] * v, U[a * 2 + 1] * wa + U[b * 2 + 1] * u + U[c * 2 + 1] * v], tc = tex(uv[0], uv[1]);
    // the growth: down the face, a little out from the chin's middle (x), along the surface
    let g = [p[0] * 1.2, -1, 0.25]; const gd = g[0] * n[0] + g[1] * n[1] + g[2] * n[2]; g = g.map((x, q) => x - n[q] * gd); const gl = Math.hypot(...g) || 1; g = g.map((x) => x / gl);
    const L = rr(K.len[0], K.len[1]), wd = rr(K.w[0], K.w[1]), side = [g[1] * n[2] - g[2] * n[1], g[2] * n[0] - g[0] * n[2], g[0] * n[1] - g[1] * n[0]];
    const pts = [0, 0.5, 1].map((t) => p.map((x, q) => x + g[q] * L * t + n[q] * (K.lift + 0.0006 * t * t)));
    const [x0s, x1s, ty] = STR[rnd() < K.fine ? 3 + Math.floor(rnd() * 3) : Math.floor(rnd() * 3)], win = x1s - x0s < 100 ? 1 : rr(0.35, 0.6), c0 = x0s + (x1s - x0s) * rr(0, 1 - win), u0 = c0 / 4096, u1 = (c0 + (x1s - x0s) * win) / 4096, vT = ty / 4096, vR = 3988 / 4096;
    // (salt and pepper: the shell's own colour there, a share of the strands lighter, a share darker; dark at the root)
    const lum = lin(tc[0]) * 0.3 + lin(tc[1]) * 0.6 + lin(tc[2]) * 0.1, salt = rnd() < K.salt, base = K.col != null ? K.col * rr(0.88, 1.08) : salt ? Math.min(0.5, lum * rr(1.0, 1.25)) : lum * rr(0.6, 0.85), tint = K.tint || [1.0, 0.98, 0.95];
    const b0 = pos.length / 3; let nearest = a; { let bd = 9; for (const q of [a, b, c]) { const d = (P[q * 3] - p[0]) ** 2 + (P[q * 3 + 1] - p[1]) ** 2 + (P[q * 3 + 2] - p[2]) ** 2; if (d < bd) { bd = d; nearest = q; } } }
    pts.forEach((pt, i) => { const t = i / 2, w = wd * (1 - 0.45 * t), rk = (K.root ?? 0.6) + (1 - (K.root ?? 0.6)) * sm(0, 0.5, t); for (const xx of [-1, 1]) { pos.push(...pt.map((x, q) => x + side[q] * xx * w / 2)); nrm.push(...n); uvs.push(xx < 0 ? u0 : u1, vR + (vT - vR) * Math.min(1, t * 0.9)); col.push(...tint.map((x) => Math.min(1, x * base * rk / 0.31)), 1); root.push(nearest); } });
    for (let i = 0; i < 2; i++) { const q = b0 + i * 2; idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); } }
  void ymid; void ztop;
  // the shell under them: darker and thinner
  bm.setAlphaCutoff(Math.max(bm.getAlphaCutoff(), K.cut)); bm.setBaseColorFactor(bm.getBaseColorFactor().map((x, i) => (i < 3 ? x * K.under : x)));
  // (rules round 1, the critic: "steel-wool noise": K.shell, the shell's texture a soft even grey, its own alpha kept, its
  // colour blurred (K.shell.blur px) and pulled toward K.shell.col (linear) by K.shell.k: no salt-and-pepper speckle under the cards)
  if (K.shell) { const bt = bm.getBaseColorTexture(), { data: D, w: W0, h: H0 } = await rgba(bt), al = new Uint8Array(W0 * H0); for (let i = 0; i < W0 * H0; i++) al[i] = D[i * 4 + 3];
    const bl = await sharp(Buffer.from(D), { raw: { width: W0, height: H0, channels: 4 } }).removeAlpha().blur(K.shell.blur || 6).raw().toBuffer();
    for (let i = 0; i < W0 * H0; i++) for (let c = 0; c < 3; c++) D[i * 4 + c] = enc(lin(bl[i * 3 + c]) * (1 - K.shell.k) + K.shell.col[c] * K.shell.k);
    await setWebp(bt, D, W0, H0, 90); void al; }
  const sk = R.listSkins()[0], HJ = sk.listJoints().findIndex((j) => j.getName() === 'head'), buf = R.listBuffers()[0], acc = (type, arr) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buf), n = pos.length / 3;
  const J = new Uint16Array(n * 4), W = new Float32Array(n * 4); for (let i = 0; i < n; i++) { J[i * 4] = HJ; W[i * 4] = 1; }
  const t = doc.createTexture('beard-strands').setImage(fs.readFileSync(ATLAS)).setMimeType('image/webp');
  const mat = doc.createMaterial('beard').setBaseColorTexture(t).setAlphaMode('MASK').setAlphaCutoff(0.4).setDoubleSided(true).setRoughnessFactor(0.85).setMetallicFactor(0)
    .setExtras({ look: { hair: 'strand-cards', note: 'short beard cards from the strand atlas (POLYTRICITY, CC BY 4.0), cast round 4 (castpass4.mjs)' } });
  if (K.spec != null) { const { KHRMaterialsSpecular } = (await import('../young-hero/glb.mjs')).require('@gltf-transform/extensions'); mat.setExtension('KHR_materials_specular', doc.createExtension(KHRMaterialsSpecular).createSpecular().setSpecularFactor(K.spec)); }
  const pr = doc.createPrimitive().setMaterial(mat).setIndices(acc('SCALAR', Uint32Array.from(idx))).setAttribute('POSITION', acc('VEC3', Float32Array.from(pos))).setAttribute('NORMAL', acc('VEC3', Float32Array.from(nrm)))
    .setAttribute('COLOR_0', acc('VEC4', Float32Array.from(col))).setAttribute('TEXCOORD_0', acc('VEC2', Float32Array.from(uvs))).setAttribute('JOINTS_0', acc('VEC4', J)).setAttribute('WEIGHTS_0', acc('VEC4', W));
  pr.setExtras({ rootOf: 'beard' }); const mesh = R.listMeshes().find((m) => m.listPrimitives().includes(bp)); mesh.addPrimitive(pr);
  BEARD_ROOTS.set(pr, Int32Array.from(root));
  console.log('beard cards:', K.n, 'cards,', n, 'points; the shell x', K.under, 'cut', K.cut);
}
const BEARD_ROOTS = new Map();
// after the face's targets: each beard card's points take its root's skin point's delta (the beard opens with the jaw)
export function beardMorphsPass(doc) {
  for (const [pr, root] of BEARD_ROOTS) { const mesh = doc.getRoot().listMeshes().find((m) => m.listPrimitives().includes(pr)), names = mesh.getExtras()?.targetNames || [];
    const fam = mesh.listPrimitives().find((p) => p.getMaterial()?.getName() === 'skin'); if (!fam || !names.length) continue; const buf = doc.getRoot().listBuffers()[0];
    for (const t of pr.listTargets()) { pr.removeTarget(t); t.dispose(); }
    let zero = null, live = 0;
    fam.listTargets().forEach((ft, k) => { const D = ft.getAttribute('POSITION').getArray(), out = new Float32Array(root.length * 3); let mx = 0; for (let i = 0; i < root.length; i++) for (let c = 0; c < 3; c++) { out[i * 3 + c] = D[root[i] * 3 + c]; mx = Math.max(mx, Math.abs(out[i * 3 + c])); }
      // (a target that leaves the beard where it is (a blink, a brow) shares one zero accessor: the file stays small)
      let acc; if (mx < 2e-4) acc = zero = zero || doc.createAccessor().setType('VEC3').setArray(new Float32Array(root.length * 3)).setBuffer(buf); else { acc = doc.createAccessor().setType('VEC3').setArray(out).setBuffer(buf); live++; }
      pr.addTarget(doc.createPrimitiveTarget(names[k]).setAttribute('POSITION', acc)); }); console.log('beard cards: targets that move it', live);
    console.log('beard cards: morphs carried', fam.listTargets().length); }
}
