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

/* ---------------------------------------------------------- derivations -- */
/**
 * A model picking eighteen separate hexes produces an incoherent palette and,
 * with structured outputs, a decoding grammar too large to compile. It picks
 * the few that carry meaning; these derive the rest, which also makes the
 * shading consistent instead of eighteen independent guesses.
 */
export const mix = (a: string, b: string, t: number) => {
  const x = toRgb(a), y = toRgb(b);
  return toHex({ r: x.r + (y.r - x.r) * t, g: x.g + (y.g - x.g) * t, b: x.b + (y.b - x.b) * t });
};
export const darken = (c: string, t = 0.18) => mix(c, '#000000', t);
export const lighten = (c: string, t = 0.18) => mix(c, '#FFFFFF', t);

/** Rotate hue while keeping perceived lightness, for sibling colours. */
export function shiftHue(hex: string, degrees: number) {
  const { r, g, b } = toRgb(hex);
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B), min = Math.min(R, G, B), l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d !== 0) {
    if (max === R) h = ((G - B) / d) % 6;
    else if (max === G) h = (B - R) / d + 2;
    else h = (R - G) / d + 4;
  }
  h = (h * 60 + degrees + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const seg: [number, number, number] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return toHex({ r: (seg[0] + m) * 255, g: (seg[1] + m) * 255, b: (seg[2] + m) * 255 });
}
