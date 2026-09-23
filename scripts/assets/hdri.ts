/**
 * Radiance (.hdr) sky for image-based light. The RGBE pixels are kept as
 * they are (four bytes a pixel, deflated) and decoded to half floats by the
 * runtime, so the light keeps its full range.
 */
import { deflateSync } from 'node:zlib';
import { readBin, writeOut } from './lib.ts';

export function buildHdri(src: string, outDir: string) {
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
  writeOut(outDir, 'sky.rgbe.z', deflateSync(out, { level: 9 }));
  return { width: w, height: h, file: 'sky.rgbe.z' };
}
