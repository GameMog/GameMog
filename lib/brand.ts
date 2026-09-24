/**
 * The GameMog mark: a black crown on a GM-gold tile.
 *
 * The crown is the promise ("you are the main character") and the verb (to
 * mog is to outshine); the gold is the GM every run collects. It is drawn on a
 * 64-unit grid in multiples of four, so every edge lands on a whole pixel at
 * 16, 32 and 48 pixels, the sizes a browser tab and a bookmark actually use.
 *
 * This file is the one source: the header and footer draw it as React, and
 * `npm run brand:icons` rasterises it into the favicon and the home-screen icon.
 */
export const GOLD = '#F5B82E';
export const INK = '#0B0B0F';

export const MARK = {
  viewBox: '0 0 64 64',
  /** The tile's corner, 3px at favicon size. */
  radius: 12,
  /** Three points, the middle one tallest, on a flat base. */
  crown: 'M8 40V16l12 12 12-20 12 20 12-12v24z',
  /** The band under the crown, one pixel clear of it at 16px. */
  band: { x: 8, y: 44, width: 48, height: 8 },
} as const;

/**
 * The mark as a standalone SVG document. `bleed` squares the corners for
 * platforms that apply their own mask (an iPhone's home screen).
 */
export function markSvg({ bleed = false } = {}) {
  const { viewBox, radius, crown, band } = MARK;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">`
    + `<rect width="64" height="64"${bleed ? '' : ` rx="${radius}"`} fill="${GOLD}"/>`
    + `<path d="${crown}" fill="${INK}"/>`
    + `<rect x="${band.x}" y="${band.y}" width="${band.width}" height="${band.height}" fill="${INK}"/>`
    + `</svg>`;
}
