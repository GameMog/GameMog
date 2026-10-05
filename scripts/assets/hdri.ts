/**
 * Radiance (.hdr) sky for image-based light. The RGBE pixels are kept as
 * they are (four bytes a pixel, deflated) and decoded to half floats by the
 * runtime, so the light keeps its full range.
 */
import { deflateSync } from 'node:zlib';
import { readBin, writeOut } from './lib.ts';

// half: a light, not a sky to look at (AI Alps' winter square, 4 Oct): each 2 x 2 block of pixels averaged in linear
// light and encoded again as RGBE, a quarter of the bytes; a sky built without it is copied pixel for pixel as before
function halve(px: Uint8Array, w: number, h: number) {
  const W = w >> 1, H = h >> 1, out = new Uint8Array(W * H * 4);
  const lin = (i: number, c: number) => (px[i + 3] ? px[i + c] * Math.pow(2, px[i + 3] - 136) : 0);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const rgb = [0, 1, 2].map((c) => { let s = 0; for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) s += lin(((2 * y + dy) * w + 2 * x + dx) * 4, c); return s / 4; });
    const v = Math.max(rgb[0], rgb[1], rgb[2]), o = (y * W + x) * 4;
    if (v < 1e-32) continue;
    const e = Math.floor(Math.log2(v)) + 1, f = 256 / Math.pow(2, e);   // v = m * 2^e with m in [0.5, 1)
    for (let c = 0; c < 3; c++) out[o + c] = Math.min(255, Math.floor(rgb[c] * f));
    out[o + 3] = e + 128;
  }
  return { out, W, H };
}

export function buildHdri(src: string, outDir: string, o: { half?: boolean } = {}) {
  const b = readBin(src);
  let p = 0; const line = () => { let s = ''; while (b[p] !== 10) s += String.fromCharCode(b[p++]); p++; return s; };
  if (!line().startsWith('#?')) throw new Error(`${src}: not a Radiance file`);
  for (let l = line(); l !== ''; l = line()) if (l.startsWith('FORMAT') && !l.includes('32-bit_rle_rgbe')) throw new Error(`${src}: ${l}`);
  const [, h, , w] = line().split(' ').map((v, i) => (i % 2 ? +v : v)) as [string, number, string, number];
  const out = new Uint8Array(w * h * 4), row = new Uint8Array(w * 4);
  for (let y = 0; y < h; y++) {
    if (b[p] !== 2 || b[p + 1] !== 2) throw new Error(`${src}: only new-style RLE is supported`);
    p += 4;
    for (let c = 0; c < 4; c++) {
      for (let x = 0; x < w;) {
        let n = b[p++];
        if (n > 128) { n -= 128; const v = b[p++]; while (n--) row[(x++) * 4 + c] = v; }
        else while (n--) row[(x++) * 4 + c] = b[p++];
      }
    }
    out.set(row, y * w * 4);
  }
  if (o.half) { const hv = halve(out, w, h); writeOut(outDir, 'sky.rgbe.z', deflateSync(hv.out, { level: 9 })); return { width: hv.W, height: hv.H, file: 'sky.rgbe.z' }; }
  writeOut(outDir, 'sky.rgbe.z', deflateSync(out, { level: 9 }));
  return { width: w, height: h, file: 'sky.rgbe.z' };
}
