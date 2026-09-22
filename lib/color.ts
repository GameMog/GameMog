/** Shared colour maths. Used by generation, the playtest, and character repair. */

export type RGB = { r: number; g: number; b: number };

export const toRgb = (hex: string): RGB => {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
};

export const toHex = ({ r, g, b }: RGB) =>
  '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('').toUpperCase();

const channel = (v: number) => {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};

export function luminance(hex: string) {
  const { r, g, b } = toRgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG-style ratio, 1 (identical) to 21 (black on white). */
export function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** Perceptual distance, so two colours of equal luminance but different hue
 *  are not treated as interchangeable the way a contrast ratio would. */
export function distance(a: string, b: string) {
  const x = toRgb(a), y = toRgb(b);
  const rm = (x.r + y.r) / 2;
  const dr = x.r - y.r, dg = x.g - y.g, db = x.b - y.b;
  return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db);
}

/**
 * Move `colour` away from `from` until they read as distinct, keeping hue.
 *
 * Used to protect an uploaded character: the character's colour is fixed, so
 * when the world would camouflage it, the world is what moves.
 */
export function pushApart(colour: string, from: string, minDistance = 140, minContrast = 1.5) {
  if (distance(colour, from) >= minDistance && contrast(colour, from) >= minContrast) return colour;

  // darken if the thing we are avoiding is light, lighten if it is dark
  const away = luminance(from) > 0.45 ? -1 : 1;
  let best = colour;
  for (let step = 1; step <= 14; step++) {
    const t = step / 14;
    const { r, g, b } = toRgb(colour);
    const target = away > 0 ? 255 : 0;
    const mixed = toHex({
      r: r + (target - r) * t * 0.85,
      g: g + (target - g) * t * 0.85,
      b: b + (target - b) * t * 0.85,
    });
    best = mixed;
    if (distance(mixed, from) >= minDistance && contrast(mixed, from) >= minContrast) break;
  }
  return best;
}
