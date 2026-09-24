/**
 * Build the site's icons from the one description in lib/brand.ts.
 *
 *   npm run brand:icons
 *
 * Writes, where Next.js serves and links them without any wiring:
 *   app/favicon.ico     16, 32 and 48 pixel PNGs, for the browser tab
 *   app/apple-icon.png  180 pixels, square corners (the iPhone rounds them itself)
 *
 * Chrome draws the letter with the same self-hosted font the logo uses, so the
 * icon and the logo cannot drift apart.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { withBrowser } from '../lib/browser.ts';
import { ICON } from '../lib/brand.ts';

const ROOT = new URL('..', import.meta.url).pathname;
const APP = join(ROOT, 'app');

/** An .ico holding PNG images, which every browser since 2010 reads. */
function ico(images: { size: number; png: Buffer }[]) {
  const head = Buffer.alloc(6 + 16 * images.length);
  head.writeUInt16LE(0, 0);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(images.length, 4);
  let offset = head.length;
  images.forEach(({ size, png }, i) => {
    const e = 6 + 16 * i;
    head.writeUInt8(size >= 256 ? 0 : size, e);
    head.writeUInt8(size >= 256 ? 0 : size, e + 1);
    head.writeUInt8(0, e + 2);
    head.writeUInt8(0, e + 3);
    head.writeUInt16LE(1, e + 4);
    head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(png.length, e + 8);
    head.writeUInt32LE(offset, e + 12);
    offset += png.length;
  });
  return Buffer.concat([head, ...images.map((x) => x.png)]);
}

await withBrowser(async (page) => {
  const font = readFileSync(join(ROOT, ICON.font)).toString('base64');
  await page.eval(`(async () => {
    const face = new FontFace('Display', 'url(data:font/woff2;base64,${font})', { weight: '200 900' });
    document.fonts.add(await face.load());
  })()`);

  /** One PNG at `size` pixels: the tile, and the letter centred on its ink. */
  const draw = (size: number, bleed = false) => page.eval<string>(`(() => {
    const size = ${size}, c = document.createElement('canvas');
    c.width = c.height = size;
    const x = c.getContext('2d');
    x.fillStyle = ${JSON.stringify(ICON.tile)};
    x.beginPath(); x.roundRect(0, 0, size, size, ${bleed ? 0 : `size * ${ICON.radius}`}); x.fill();
    const letter = ${JSON.stringify(ICON.letter)}, weight = ${ICON.weight};
    x.font = weight + ' 100px Display';
    let m = x.measureText(letter);
    const per100 = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
    x.font = weight + ' ' + (100 * size * ${ICON.height} / per100) + 'px Display';
    m = x.measureText(letter);
    x.fillStyle = ${JSON.stringify(ICON.ink)};
    x.fillText(letter,
      size / 2 - (m.actualBoundingBoxRight - m.actualBoundingBoxLeft) / 2,
      size / 2 + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2);
    return c.toDataURL('image/png').split(',')[1];
  })()`).then((b64) => Buffer.from(b64, 'base64'));

  const sizes = [16, 32, 48];
  const pngs = [];
  for (const size of sizes) pngs.push({ size, png: await draw(size) });
  writeFileSync(join(APP, 'favicon.ico'), ico(pngs));
  writeFileSync(join(APP, 'apple-icon.png'), await draw(180, true));
  console.log(`wrote app/favicon.ico (${sizes.join(', ')}) and app/apple-icon.png (180)`);
});
