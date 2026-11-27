// Mog City: a colour made readable on the HUD's dark boxes. A speaker's name in their cast colour on the subtitle box
// (mission/ui.js sub(), rgba(8,10,14,0.66) over the picture) and a name card's role line (caption()) were drawn as the
// cast has them: Jensen Heist's MR. BOARD #6B3A2A, DIRECTOR GREY #4B4F58 and DIRECTOR NAVY #2C3442 could not be read
// on it (day audit, 22 Nov). A colour that falls short of WCAG's 4.5:1 against the box is lightened toward white, its
// hue kept, just as far as it takes; a colour that passes is returned as it was given, so nothing else changes.
//   readable(color, bg = BOX, min = 4.5) -> '#rrggbb' (or the colour as given: it passes, or it is not one we read)
//   contrast(a, b) -> the WCAG ratio of two '#rrggbb' colours
export const BOX = '#0B0D12';
export const MIN = 4.5;

function rgbOf(c) {
  const s = String(c ?? '').trim();
  let m = /^#([0-9a-f]{3})$/i.exec(s);
  if (m) return m[1].split('').map((h) => parseInt(h + h, 16));
  m = /^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/i.exec(s);
  if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  m = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(s);
  if (m) return [+m[1], +m[2], +m[3]].map((v) => Math.min(255, v));
  return null;
}
const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const hex = (rgb) => '#' + rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();

export function contrast(a, b) {
  const A = Array.isArray(a) ? a : rgbOf(a), B = Array.isArray(b) ? b : rgbOf(b);
  if (!A || !B) return 21;
  const la = lum(A), lb = lum(B);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export function readable(color, bg = BOX, min = MIN) {
  const c = rgbOf(color), b = rgbOf(bg);
  if (!c || !b || contrast(c, b) >= min) return color;
  // (mixed toward white in small steps: the first mix that reads, so the colour stays as near its own as it can)
  for (let k = 1; k <= 40; k++) {
    const t = k / 40, m = c.map((v) => v + (255 - v) * t);
    if (contrast(m, b) >= min) return hex(m);
  }
  return '#FFFFFF';
}
