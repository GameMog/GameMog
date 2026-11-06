/**
 * The headshots' sky (6 Nov, the owner: "main character headshot against a light blue background, not car"): every
 * world's round "Jump in" picture is its hero's face on this soft light blue, top to bottom. lib/runtime/portrait.js
 * keeps the same two colours (it runs in the browser, so it holds its own copy); Classic's bubble (app/cover.tsx) and
 * the card a world with no portrait gets (headshotCard below) use these.
 */
export const SKY = { top: '#DCEFFC', bottom: '#A6D3F2' } as const;

/**
 * The card for a world with no portrait yet (app/g/[slug]/avatar/route.ts): a head-and-shoulders silhouette on the
 * sky, framed as the headshots are (head about half the square, its eyes' line 40% down, centred), never a square cut
 * from a cover (which, for a car or kart world, showed the car). 512 px SVG; the route turns it into a JPEG.
 */
export function headshotCard(): string {
  const ink = '#7DB4DE', S = 512;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${SKY.top}"/><stop offset="1" stop-color="${SKY.bottom}"/></linearGradient></defs>
<rect width="${S}" height="${S}" fill="url(#s)"/>
<rect x="212" y="300" width="88" height="90" rx="36" fill="${ink}"/>
<ellipse cx="256" cy="214" rx="104" ry="128" fill="${ink}"/>
<path d="M44 512 C52 420 130 372 210 362 L302 362 C382 372 460 420 468 512 Z" fill="${ink}"/>
</svg>`;
}

/**
 * The key: one flat, saturated blue a studio that cannot draw a gradient (the Story Kit's portrait studio,
 * public/storykit/forge/portrait.html) puts behind a person, for onSky to swap for the sky's gradient. Saturated, so a
 * pale grey or white shirt is never taken for it; blue, so the few edge pixels mixed with it read as sky.
 */
export const SKY_KEY = '#3D9BE9';

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
