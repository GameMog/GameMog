/**
 * Build the site's icons from the one mark in lib/brand.ts.
 *
 *   npm run brand:icons
 *
 * Writes, where Next.js serves them from without any wiring:
 *   app/icon.svg        the tab icon for browsers that take SVG (sharp at any size)
 *   app/favicon.ico     16, 32 and 48 pixel PNGs, for everything else
 *   app/apple-icon.png  180 pixels, square corners (the iPhone rounds them itself)
 *
 * Chrome rasterises the SVG, so the PNGs match what the header draws.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { withBrowser } from '../lib/browser.ts';
import { markSvg } from '../lib/brand.ts';

const APP = join(new URL('..', import.meta.url).pathname, 'app');

/** One PNG of `svg` at `size` pixels, transparent outside the tile. */
function rasterise(page: { eval<T>(expr: string): Promise<T> }, svg: string, size: number) {
  return page.eval<string>(`new Promise((done, fail) => {
    const img = new Image(${size}, ${size});
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = c.height = ${size};
      c.getContext('2d').drawImage(img, 0, 0, ${size}, ${size});
      done(c.toDataURL('image/png').split(',')[1]);
    };
    img.onerror = () => fail(new Error('the mark did not load'));
    img.src = 'data:image/svg+xml;base64,' + ${JSON.stringify(Buffer.from(svg).toString('base64'))};
  })`).then((b64) => Buffer.from(b64, 'base64'));
}

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
  const tile = markSvg();
  writeFileSync(join(APP, 'icon.svg'), tile + '\n');
  const sizes = [16, 32, 48];
  const pngs = [];
  for (const size of sizes) pngs.push({ size, png: await rasterise(page, tile, size) });
  writeFileSync(join(APP, 'favicon.ico'), ico(pngs));
  writeFileSync(join(APP, 'apple-icon.png'), await rasterise(page, markSvg({ bleed: true }), 180));
  console.log(`wrote app/icon.svg, app/favicon.ico (${sizes.join(', ')}) and app/apple-icon.png (180)`);
});
