import { SKY } from './portrait-sky';

/**
 * A headshot shot on a flat background (SKY_KEY, or any one flat colour) laid on the sky: the background, read from
 * the picture's top corners, is keyed out (a pixel near its colour is sky, one far from it is the person, and the ones
 * between, his edges, are mixed), and the sky's gradient goes behind. Square and 512 px, cut from the middle of the
 * picture's top (a portrait taller than wide keeps its head). A JPEG.
 */
export async function onSky(picture: Uint8Array, S = 512): Promise<Buffer> {
  const sharp = (await import('sharp')).default;
  const { data, info } = await sharp(Buffer.from(picture)).resize(S, S, { fit: 'cover', position: 'top' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, px = (x: number, y: number) => { const i = (y * W + x) * 3; return [data[i], data[i + 1], data[i + 2]]; };
  // (the key: the mean of the two top corners' 8 px squares)
  const k = [0, 0, 0]; let n = 0;
  for (const x0 of [0, W - 8]) for (let y = 0; y < 8; y++) for (let x = x0; x < x0 + 8; x++) { const p = px(x, y); k[0] += p[0]; k[1] += p[1]; k[2] += p[2]; n++; }
  k[0] /= n; k[1] /= n; k[2] /= n;
  const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const top = hex(SKY.top), bot = hex(SKY.bottom), out = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) {
    const t = y / (H - 1), sky = [0, 1, 2].map((c) => top[c] + (bot[c] - top[c]) * t);
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3, d = Math.hypot(data[i] - k[0], data[i + 1] - k[1], data[i + 2] - k[2]);
      const a = Math.min(1, Math.max(0, (d - 12) / 36));
      for (let c = 0; c < 3; c++) out[i + c] = Math.round(a * data[i + c] + (1 - a) * sky[c]);
    }
  }
  return sharp(out, { raw: { width: W, height: H, channels: 3 } }).jpeg({ quality: 88 }).toBuffer();
}
