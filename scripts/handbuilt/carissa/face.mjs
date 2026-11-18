// Hand-built Carissa, the face's cards and the mouth (her landmarks: eyes 1.5636, the mouth's parting 1.4984).
//  brows   the forge's brow cards recoloured a warm dark brown and only their dense hairs kept (a groomed, not heavy,
//          brow); the inner ends 1 mm up (the forge's slant read as a frown); the skin pass paints the soft underlay
//  lashes  mascara: near-black, the outer third of the upper lashes 1 mm longer, out and up
//  mouth   the inside back to the forged colour, matte and flat (the skin pass's lip paint must not reach it: the
//          forge's mouth gate)
import { body, prim, matOf, rgba, setWebp, sm, read, raster, sharp } from '../young-hero/glb.mjs';
import { TONE } from './skin.mjs';
export const EYE_Y = 1.5636, MOUTH_Y = 1.4984;
export async function browsLashesPass(doc, K = {}) {
  K = { lift: 0.0004, inner: 0.001, brow: [44, 31, 25], ...K };
  const B = body(doc), P = B.P, a = P.getArray().slice();
  const bv = new Set(prim(doc, 'brows').flatMap((q) => [...q.getIndices().getArray()]));
  for (const v of bv) { const x = Math.abs(a[v * 3]), d = K.lift + K.inner * sm(0.03, 0.012, x); a[v * 3 + 1] += d; a[v * 3 + 2] -= 0.4 * d; }
  const lv = new Set(prim(doc, 'lashes').flatMap((q) => [...q.getIndices().getArray()]));
  let lm = 0; for (const v of lv) { const x = Math.abs(a[v * 3]), y = a[v * 3 + 1]; if (y < EYE_Y + 0.001) continue; const o = sm(0.036, 0.046, x); if (o <= 0) continue; a[v * 3] += Math.sign(a[v * 3]) * 0.0007 * o; a[v * 3 + 1] += 0.0009 * o; lm++; }
  P.setArray(a);
  const bt = matOf(doc, 'brows').getBaseColorTexture(), { data, w, h } = await rgba(bt);
  for (let i = 0; i < w * h; i++) { const L = (data[i * 4] + data[i * 4 + 1] + data[i * 4 + 2]) / 3 / 31; for (let c = 0; c < 3; c++) data[i * 4 + c] = Math.min(255, Math.round(K.brow[c] * (0.8 + 0.2 * L))); }
  await setWebp(bt, data, w, h, 88);
  const lm8 = matOf(doc, 'lashes'); lm8.setBaseColorFactor([0.1, 0.085, 0.08, 1]); lm8.setAlphaCutoff(0.28);
  matOf(doc, 'brows').setAlphaCutoff(K.cut ?? 0.5);
  console.log('brows', bv.size, 'lash points lengthened', lm);
}
export async function mouthInsidePass(doc, K = {}) {
  K = { depth: 0.004, MY: MOUTH_Y, ...K };
  const R8 = (await read(new URL('../../../storykit/handbuilt/carissa/forged.glb', import.meta.url).pathname)).doc;
  const mat = matOf(doc, 'skin'), tex = mat.getBaseColorTexture(), img = await rgba(tex), S = img.w, ref = await rgba(matOf(R8, 'skin').getBaseColorTexture());
  const B = body(doc), p = B.pos, uv = B.uv.getArray(), wHead = B.wOn(/^head$/), tris = prim(doc, 'skin').flatMap((q) => [...q.getIndices().getArray()]);
  let front = -1; for (let v = 0; v < p.length / 3; v++) if (wHead[v] > 0.5 && Math.abs(p[v * 3]) < 0.008 && Math.abs(p[v * 3 + 1] - K.MY) < 0.01) front = Math.max(front, p[v * 3 + 2]);
  const inside = new Float32Array(S * S);
  const NA = B.sk.getAttribute('NORMAL'), N0 = NA.getArray(), ns = NA.getNormalized() ? (N0 instanceof Int8Array ? 127 : 32767) : 1;
  raster(tris, (v) => [uv[v * 2] * S, uv[v * 2 + 1] * S], S, (x, y, l1, l2, l3, a, b, c) => { const P = [0, 1, 2].map((k) => l1 * p[a * 3 + k] + l2 * p[b * 3 + k] + l3 * p[c * 3 + k]), w = l1 * wHead[a] + l2 * wHead[b] + l3 * wHead[c];
    // (only the lining: its normals face back or across; the chin and the skin round the lips face out)
    const nz = (l1 * N0[a * 3 + 2] + l2 * N0[b * 3 + 2] + l3 * N0[c * 3 + 2]) / ns; if (nz > 0.35) return;
    if (w < 0.5 || Math.abs(P[0]) > 0.032 || Math.abs(P[1] - K.MY) > 0.02) return; inside[y * S + x] = Math.max(inside[y * S + x], sm(front - K.depth + 0.0015, front - K.depth - 0.0015, P[2])); }, 0.03);
  let n = 0; for (let i = 0; i < S * S; i++) { const t = inside[i]; if (!t) continue; n++; for (let k = 0; k < 3; k++) img.data[i * 4 + k] = Math.round(img.data[i * 4 + k] * (1 - t) + Math.min(255, 255 * ((ref.data[i * 4 + k] / 255) ** 2.2 * TONE.gain[k]) ** (1 / 2.2)) * t * (K.dark ?? 0.8)); }
  await setWebp(tex, img.data, S, S, 88);
  for (const [t, flat] of [[mat.getNormalTexture(), [128, 128, 255]], [mat.getMetallicRoughnessTexture(), [null, 255, 0]]]) { if (!t) continue;
    const { data, info } = await sharp(Buffer.from(t.getImage())).removeAlpha().raw().toBuffer({ resolveWithObject: true }), W = info.width, f = S / W;
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) { const s = inside[Math.floor(y * f) * S + Math.floor(x * f)]; if (!s) continue; const i = (y * W + x) * 3;
      for (let k = 0; k < 3; k++) if (flat[k] !== null) data[i + k] = Math.round(data[i + k] * (1 - s) + flat[k] * s); }
    t.setImage(await sharp(data, { raw: { width: W, height: W, channels: 3 } }).webp({ quality: 90 }).toBuffer()).setMimeType('image/webp'); }
  console.log('mouth inside: lips front z', front.toFixed(4), 'texels', n);
}
// the mouth's corners lifted (the forged mouth sat corners-down: a tired, older read, and the forge's talk gate (corner
// share 0.72 > 0.58, a grimace when it opens)): every head point near each corner raised K.lift, a soft 6 mm field,
// the lips' middle (|x| < 1 cm) still, so the parting the face finder carries does not move
export function cornerLiftPass(doc, K = {}) {
  K = { lift: 0.0016, out: 0.0003, r: 0.006, cx: 0.0214, ...K };
  const B = body(doc), P = B.P, a = P.getArray().slice(), head = B.wOn(/^head$/); let n = 0, mx = 0;
  for (let v = 0; v < a.length / 3; v++) { if (head[v] < 0.5) continue; const x = Math.abs(a[v * 3]), y = a[v * 3 + 1], z = a[v * 3 + 2]; if (z < 0.11) continue;
    const d = Math.hypot(x - K.cx, (y - MOUTH_Y) * 1.2), w = Math.exp(-((d / K.r) ** 2)) * sm(0.008, 0.014, x); if (w < 0.01) continue;
    a[v * 3 + 1] += K.lift * w; a[v * 3] += Math.sign(a[v * 3]) * K.out * w; n++; mx = Math.max(mx, K.lift * w); }
  P.setArray(a); console.log('mouth corners lifted', n, 'points, max mm', (mx * 1000).toFixed(2));
}
