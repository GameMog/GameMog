// Hand-built Milo, the face's daylight pass (HP-mi4): in the game's close-ups his mouth read puffy and smudged. The
// forge's base paint left a grey-blue cast round the mouth (the adult base's shaved-beard shadow, under a child's face):
// beside the mouth corners, over the upper lip and down to the chin. Here every head texel in that zone (an ellipse round
// the mouth, the lips themselves kept) is taken to his own cheek's tone, its fine detail kept at half, feathered over
// 8 mm; the lips a soft natural pink-brown, a child's, no gloss. Then a light warmth on the cheeks and the nose (a child
// out in the sun), never make-up.
import { setWebp, sm, fbm, clamp, sharp } from '../young-hero/glb.mjs';
import { texelPos } from '../young-mother/p2.mjs';
export async function mouthTonePass(doc, LM, K = {}) {
  K = { rx: 0.036, ry: 0.03, lips: [190, 118, 106], warm: 0.05, ...K };
  const { tex, img, S, N2, pos, head } = await texelPos(doc), d = img.data;
  const lin = (c) => Math.pow(c / 255, 2.2), enc = (l) => Math.min(255, Math.max(0, Math.round(255 * Math.pow(Math.max(0, l), 1 / 2.2))));
  const blur = await sharp(d, { raw: { width: S, height: S, channels: 4 } }).blur(16).raw().toBuffer();
  // his cheek's tone: the clean skin over the cheekbones (blurred)
  const ck = [0, 0, 0]; let cn = 0;
  for (let i = 0; i < N2; i++) { const X = pos[i * 3]; if (Number.isNaN(X) || head[i] < 0.9) continue; const x = Math.abs(X), y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    if (x > 0.03 && x < 0.045 && y > LM.MOUTHY + 0.02 && y < LM.EY - 0.02 && z > LM.EZ - 0.04) { for (let k = 0; k < 3; k++) ck[k] += lin(blur[i * 4 + k]); cn++; } }
  for (let k = 0; k < 3; k++) ck[k] /= Math.max(1, cn); const Lc = (ck[0] + ck[1] + ck[2]) / 3;
  let n = 0;
  for (let i = 0; i < N2; i++) { const X = pos[i * 3]; if (Number.isNaN(X) || head[i] < 0.5) continue; const x = Math.abs(X), y = pos[i * 3 + 1], z = pos[i * 3 + 2]; if (z < LM.EZ - 0.05) continue;
    const e = Math.hypot(x / K.rx, (y - (LM.MOUTHY - 0.006)) / K.ry), zone = sm(1.15, 0.85, e);
    const lip = sm(LM.MH + 0.003, LM.MH - 0.002, x) * sm(0.0085, 0.0045, Math.abs(y - LM.MOUTHY)) * sm(LM.EZ - 0.015, LM.EZ, z);
    let r = lin(d[i * 4]), g = lin(d[i * 4 + 1]), b = lin(d[i * 4 + 2]);
    if (zone > 0) { const lb = (lin(blur[i * 4]) + lin(blur[i * 4 + 1]) + lin(blur[i * 4 + 2])) / 3 + 1e-4, det = Math.pow(clamp(((r + g + b) / 3) / lb, 0.6, 1.6), 0.5), t = zone * (1 - lip);
      const tgt = ck.map((c) => c * det * (1 + 0.03 * (fbm(X, y, z, 70) - 0.5))); r = r * (1 - t) + tgt[0] * t; g = g * (1 - t) + tgt[1] * t; b = b * (1 - t) + tgt[2] * t; n++; }
    if (lip > 0) { const lc = K.lips.map(lin), L0 = (r + g + b) / 3, s = clamp(L0 / ((lc[0] + lc[1] + lc[2]) / 3), 0.75, 1.15), t = lip * 0.7; r = r * (1 - t) + lc[0] * s * t; g = g * (1 - t) + lc[1] * s * t; b = b * (1 - t) + lc[2] * s * t; }
    // a little sun on the cheeks and the nose tip
    const cheek = Math.exp(-(((x - 0.034) / 0.014) ** 2) - (((y - (LM.MOUTHY + 0.03)) / 0.014) ** 2)) * sm(LM.EZ - 0.03, LM.EZ - 0.01, z), nose = x < 0.012 ? Math.exp(-(((y - LM.NOSE[1]) / 0.008) ** 2)) * sm(LM.NOSE[2] - 0.012, LM.NOSE[2], z) : 0, w = K.warm * Math.max(cheek, nose * 0.7);
    r *= 1 + w; g *= 1 - w * 0.25; b *= 1 - w * 0.4;
    d[i * 4] = enc(r); d[i * 4 + 1] = enc(g); d[i * 4 + 2] = enc(b); }
  void Lc; await setWebp(tex, d, S, S, 90); console.log('mouth tone: texels', n, 'cheek', ck.map(enc).join(','));
}
// the hood drawn in toward his back and down a little: on his narrow shoulders its sides stood up over the shoulder tops
// like a collar of pads, which made his shoulders read broad from the front; each hood point's x pulled in by a share
// that grows toward the shoulder (k), lowered a little there, then kept 3 mm off the hoodie and his skin
import { prim } from '../young-hero/glb.mjs';
import { attrs, grid, surf, big } from '../agnes/collar.mjs';
export function hoodInPass(doc, K = {}) {
  K = { k: 0.22, drop: 0.008, clear: 0.003, y0: 0.86, ...K };
  const p = big(doc, 'hood'); if (!p) return; const Pa = p.getAttribute('POSITION'), a = Pa.getArray().slice(), cnt = Pa.getCount();
  const outs = ['hoodie', 'skin'].map((n) => big(doc, n)).filter(Boolean).map((q) => { const A = attrs(q); return [A, grid(A)]; });
  let moved = 0;
  for (let v = 0; v < cnt; v++) { const x = a[v * 3], y = a[v * 3 + 1]; if (y < K.y0) continue; const ax = Math.abs(x), t = sm(0.03, 0.12, ax);
    a[v * 3] = x * (1 - K.k * t); a[v * 3 + 1] = y - K.drop * t; moved++;
    for (const [A, near] of outs) { const s = surf(A, near, [a[v * 3], a[v * 3 + 1], a[v * 3 + 2]]); if (!s) continue; const dd = (a[v * 3] - s.p[0]) * s.n[0] + (a[v * 3 + 1] - s.p[1]) * s.n[1] + (a[v * 3 + 2] - s.p[2]) * s.n[2];
      if (dd < K.clear && dd > -0.03) for (let c = 0; c < 3; c++) a[v * 3 + c] += s.n[c] * (K.clear - dd); } }
  Pa.setArray(a); console.log('hood drawn in', moved);
}
