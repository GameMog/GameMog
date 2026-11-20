// the atlas's maps from the Cycles passes (tex/<what>-{cov,tt,id,depth,nrm}.png, saved through the Standard view: sRGB
// encoded, decoded here back to data): base colour + alpha (sRGB, what the engine reads), and the data maps
//   node compose.mjs hair|brows <outdir>
import { sharp } from './tk.mjs';
import fs from 'node:fs';
const [WHAT, OUT] = process.argv.slice(2), K = JSON.parse(fs.readFileSync(new URL('./tone.json', import.meta.url), 'utf8'))[WHAT];
const rd = async (k) => { const { data, info } = await sharp(`tex/${WHAT}-${k}.png`).toColourspace('rgb16').raw({ depth: 'ushort' }).toBuffer({ resolveWithObject: true }); return { a: new Uint16Array(data.buffer, data.byteOffset, data.length / 2), w: info.width, h: info.height, c: info.channels }; };
const dec = (v) => { v /= 65535; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const enc = (v) => { v = Math.min(1, Math.max(0, v)); return Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055)); };
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const cov = await rd('cov'), tt = await rd('tt'), id = await rd('id'), dp = await rd('depth'), nr = await rd('nrm');
const { w, h } = cov, N = w * h, C = cov.c;
const A = new Float32Array(N), T = new Float32Array(N), I = new Float32Array(N), Dp = new Float32Array(N);
const TH = WHAT === 'hair' ? h / 2 : h / 2;
for (let i = 0; i < N; i++) { const yy = Math.floor(i / w) % TH; A[i] = cov.a[i * C + 3] / 65535 * (WHAT === 'hair' ? sm(TH, TH * (1 - K.rootFade), yy) : 1); T[i] = dec(tt.a[i * C]); I[i] = dec(id.a[i * C]); Dp[i] = dec(dp.a[i * C]); }
// albedo, linear
const col = new Float32Array(N * 3);
for (let i = 0; i < N; i++) {
  if (A[i] <= 0) continue;
  const t = T[i], r = I[i];
  let L = K.root + (K.body - K.root) * sm(0, K.rootLen, t) + (K.tip - K.body) * sm(0.6, 1, t);
  if (r < K.darkFrac) L *= K.dark; else if (r > 1 - K.lightFrac) L = L * (1 - K.lightMix) + K.light * K.lightMix; else L *= 1 + K.vary * (r - 0.5);
  L *= 1 - K.depthDk * (1 - Dp[i]);
  for (let c = 0; c < 3; c++) col[i * 3 + c] = L * K.tint[c];
}
// (the transparent texels take their neighbours' colour, so mips and the coverage's soft edge never pull a dark fringe in)
const prem = Buffer.alloc(N * 4);
for (let i = 0; i < N; i++) { for (let c = 0; c < 3; c++) prem[i * 4 + c] = Math.round(Math.min(1, col[i * 3 + c] * A[i]) * 255); prem[i * 4 + 3] = Math.round(A[i] * 255); }
const bl = await sharp(prem, { raw: { width: w, height: h, channels: 4 } }).blur(6).raw().toBuffer();
const bl2 = await sharp(prem, { raw: { width: w, height: h, channels: 4 } }).blur(24).raw().toBuffer();
const base = Buffer.alloc(N * 4), meanL = K.body * K.tint[1];
for (let i = 0; i < N; i++) {
  for (let c = 0; c < 3; c++) {
    let v;
    if (A[i] > 0.02) v = col[i * 3 + c];
    else { const a1 = bl[i * 4 + 3], a2 = bl2[i * 4 + 3]; v = a1 > 3 ? bl[i * 4 + c] / a1 : a2 > 1 ? bl2[i * 4 + c] / a2 : meanL; }
    base[i * 4 + c] = enc(v);
  }
  base[i * 4 + 3] = Math.round(A[i] * 255);
}
fs.mkdirSync(OUT, { recursive: true });
await sharp(base, { raw: { width: w, height: h, channels: 4 } }).png().toFile(`${OUT}/${WHAT}_basecolor.png`);
await sharp(base, { raw: { width: w, height: h, channels: 4 } }).webp({ quality: 92, alphaQuality: 100, effort: 5 }).toFile(`${OUT}/${WHAT}_basecolor.webp`);
const g8 = (F) => { const b = Buffer.alloc(N); for (let i = 0; i < N; i++) b[i] = Math.round(Math.min(1, Math.max(0, F[i])) * 255); return sharp(b, { raw: { width: w, height: h, channels: 1 } }).png(); };
await g8(A).toFile(`${OUT}/${WHAT}_alpha.png`);
await g8(Dp.map((v, i) => (A[i] > 0 ? v : 0))).toFile(`${OUT}/${WHAT}_depth.png`);
await g8(T.map((v, i) => (A[i] > 0 ? v : 0))).toFile(`${OUT}/${WHAT}_roottip.png`);
await g8(I.map((v, i) => (A[i] > 0 ? v : 0))).toFile(`${OUT}/${WHAT}_id.png`);
// tangent-space normal (x along u, y toward the tip = image up, z out of the card); flat where there's no strand
const nb = Buffer.alloc(N * 3);
for (let i = 0; i < N; i++) {
  let x = dec(nr.a[i * C]) * 2 - 1, y = dec(nr.a[i * C + 1]) * 2 - 1, z = dec(nr.a[i * C + 2]) * 2 - 1;
  const a = A[i]; x *= a; y *= a; z = z * a + (1 - a); const L = Math.hypot(x, y, z) || 1;
  nb[i * 3] = Math.round((x / L * 0.5 + 0.5) * 255); nb[i * 3 + 1] = Math.round((y / L * 0.5 + 0.5) * 255); nb[i * 3 + 2] = Math.round((z / L * 0.5 + 0.5) * 255);
}
await sharp(nb, { raw: { width: w, height: h, channels: 3 } }).png().toFile(`${OUT}/${WHAT}_normal.png`);
// (the data maps packed: R root->tip, G strand id, B depth, A alpha)
const pk = Buffer.alloc(N * 4); for (let i = 0; i < N; i++) { pk[i * 4] = Math.round(T[i] * 255 * (A[i] > 0)); pk[i * 4 + 1] = Math.round(I[i] * 255 * (A[i] > 0)); pk[i * 4 + 2] = Math.round(Dp[i] * 255 * (A[i] > 0)); pk[i * 4 + 3] = Math.round(A[i] * 255); }
await sharp(pk, { raw: { width: w, height: h, channels: 4 } }).png().toFile(`${OUT}/${WHAT}_data_rt-id-depth-alpha.png`);
console.log(WHAT, w, h, 'ok');
