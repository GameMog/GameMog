// THE CHARACTER FORGE: colour under the game's light (forge v2). The gates' colour check and the compiler's colour guard
// share it: a cloth's albedo lit by a warm (2700 K) or cool (7500 K) light, white-balanced (the eye adapts to the light),
// through the game's tonemap (ACES, Narkowicz's fit) at the studio's exposure, read in OKLCH. A dark saturated red lit warm
// drifts toward pink-raspberry this way (Sal's coat, v1); the guard takes chroma out until the drift is small.
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const toLin = (c) => Math.pow(c / 255, 2.2);
const toDisp = (c) => Math.pow(c, 1 / 2.2);
export const oklab = ([r, g, b]) => { const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s]; };
export const fromOklab = ([L, a, b]) => { const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s]; };
export const lch = (c) => { const [L, a, b] = oklab(c); return { L, C: Math.hypot(a, b), h: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360 }; };
const aces = (x) => clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0, 1);
export const LIGHTS = { neutral: [1, 1, 1], warm: [1, 0.706, 0.42], cool: [0.737, 0.824, 1] };
export function litColour(albedo, light, E = 2.2) { return albedo.map((a, c) => toLin(Math.round(255 * toDisp(aces(a * light[c] * E))))); }
// a lit albedo (linear) white-balanced against a light grey under the same light
export function seen(albedo, L) { const c = litColour(albedo, LIGHTS[L]), g = litColour([0.8, 0.8, 0.8], LIGHTS[L]), n = litColour([0.8, 0.8, 0.8], LIGHTS.neutral); return c.map((x, i) => (x / Math.max(1e-4, g[i])) * n[i]); }
export function family({ L, C, h }) { if (C < 0.035) return L < 0.3 ? 'black' : L > 0.8 ? 'white' : 'grey';
  const bands = [[20, 'pink-red'], [45, 'red'], [70, 'orange-brown'], [105, 'yellow-tan'], [160, 'green'], [230, 'teal-blue'], [280, 'blue'], [330, 'purple'], [360, 'pink-red']];
  let name = bands.find(([x]) => h < x)[1]; if ((name === 'red' || name === 'pink-red') && L < 0.42) name = 'wine'; if (name === 'orange-brown' && L < 0.5) name = 'brown'; return name; }
const NEUTRALS = ['black', 'grey', 'white'], REDS = ['wine', 'red'];
export const sameFamily = (a, b) => a === b || (NEUTRALS.includes(a) && NEUTRALS.includes(b)) || (REDS.includes(a) && REDS.includes(b)) || (['brown', 'orange-brown'].includes(a) && ['brown', 'orange-brown'].includes(b));
// the drift of one albedo (linear rgb): its family and hue shift (deg) under each light
export function drift(albedo) { const base = lch(litColour(albedo, LIGHTS.neutral)), fam = family(base), out = { family: fam, worst: 0 };
  for (const L of ['warm', 'cool']) { const l = lch(seen(albedo, L)), dh = base.C < 0.035 || l.C < 0.035 ? 0 : Math.min(Math.abs(l.h - base.h), 360 - Math.abs(l.h - base.h)), f2 = family(l);
    out[L] = { family: f2, hueShiftDeg: +dh.toFixed(1) }; const bad = dh > 22 || (dh > 12 && !sameFamily(f2, fam)); if (bad) out.fail = L; out.worst = Math.max(out.worst, dh); }
  return out; }
// the compiler's guard: an sRGB colour whose drift would fail, its chroma taken down (and lifted a touch) until it holds
// (checked at the shades the cloth will show: its folds' dark to its lit highlights, x0.5 .. x2.2 in light)
const SHADES = [0.5, 1, 1.6, 2.2];
export function driftShades(lin) { let w = { worst: 0 }; for (const k of SHADES) { const d = drift(lin.map((x) => Math.min(1, x * k))); if (d.fail && !w.fail) w = { ...d, shade: k }; else if (!w.fail && d.worst > w.worst) w = { ...d, shade: k }; } return w; }
export function guard(rgb) { const lin = rgb.map(toLin), d0 = driftShades(lin); if (!d0.fail && d0.worst <= 16) return { rgb, changed: false };
  let [L, a, b] = oklab(lin);
  for (let i = 0; i < 12; i++) { a *= 0.86; b *= 0.86; L = Math.min(0.9, L * 1.01); const c = fromOklab([L, a, b]).map((x) => clamp(x, 0, 1)), d = driftShades(c); if (!d.fail && d.worst <= 16) return { rgb: c.map((x) => Math.round(255 * Math.pow(x, 1 / 2.2))), changed: true, steps: i + 1 }; }
  const c = fromOklab([L, a, b]).map((x) => clamp(x, 0, 1)); return { rgb: c.map((x) => Math.round(255 * Math.pow(x, 1 / 2.2))), changed: true, steps: 12 }; }

// SKIN (forge v2.5, MV): the skin's colour-shift gate and the forge's guard, as the cloth's above. Measured on the median
// of the skin's texels over the neck, shoulders and upper chest (no brow, beard or scalp paint there), and calibrated on
// the cast the owner holds as the bar (shipped Mog City GLBs, the same measure): Mr. Big (albedo h 46, C/L .140, warm h
// 62), Jane (h 46, C/L .142, warm h 48), Fiona (h 43, C/L .127, warm h 63, cool C/L .088) and Knox, the darkest (h 49, C/L
// .148, warm h 40, warm C .103). A dark skin whose albedo leans red (h < 42) or is too saturated for its lightness reads
// red-orange under the study's 2700 K lamp (the grandmother: h 37, C/L .247, warm h 33; the nurse: warm h 37); a light
// skin with too little chroma left after the cool rim's white balance reads grey. warm: lit by the warm key at exposure 1,
// NOT white-balanced (the study shot is not); cool: lit by the 7500 K rim at the skin's shade (x0.45), white-balanced.
export const SKIN = { hue: [42, 78], cl: 0.17, warmHue: 39, warmChroma: 0.14, coolCl: 0.05 };
export function skinTone(lin) {
  const al = lch(lin), w = lch(litColour(lin, LIGHTS.warm, 1)), c = lch(seen(lin.map((x) => x * 0.45), 'cool')), cl = al.C / Math.max(1e-4, al.L), ccl = c.C / Math.max(1e-4, c.L);
  const why = [];
  if (al.h < SKIN.hue[0]) why.push(`hue ${al.h.toFixed(0)} < ${SKIN.hue[0]} (red)`); if (al.h > SKIN.hue[1]) why.push(`hue ${al.h.toFixed(0)} > ${SKIN.hue[1]} (yellow-green)`);
  if (cl > SKIN.cl) why.push(`C/L ${cl.toFixed(3)} > ${SKIN.cl}`);
  if (w.h < SKIN.warmHue) why.push(`warm hue ${w.h.toFixed(0)} < ${SKIN.warmHue} (red-orange under the lamp)`); if (w.C > SKIN.warmChroma) why.push(`warm chroma ${w.C.toFixed(3)} > ${SKIN.warmChroma}`);
  if (ccl < SKIN.coolCl) why.push(`cool C/L ${ccl.toFixed(3)} < ${SKIN.coolCl} (grey under the rim)`);
  return { srgb: lin.map((x) => Math.round(255 * Math.pow(Math.max(0, x), 1 / 2.2))), L: +al.L.toFixed(3), C: +al.C.toFixed(3), h: +al.h.toFixed(1), cl: +cl.toFixed(3), warm: { h: +w.h.toFixed(1), C: +w.C.toFixed(3) }, coolCl: +ccl.toFixed(3), pass: !why.length, why };
}
// the guard: per-channel gains (linear) that move the median into the bar's band with margin, keeping its lightness (the
// photo atlas's pores, freckles and shading all kept, only the cast of the whole skin changed). null when it already holds.
export function skinGuard(lin) {
  if (skinTone(lin).pass) return null;
  let [L, a, b] = oklab(lin), C = Math.hypot(a, b), h = Math.atan2(b, a);
  const H0 = 47 * Math.PI / 180, H1 = 74 * Math.PI / 180; h = clamp(h, H0, H1); C = Math.min(C, 0.15 * L); C = Math.max(C, 0.06 * L);
  let t = lin;
  for (let i = 0; i < 24; i++) { t = fromOklab([L, C * Math.cos(h), C * Math.sin(h)]).map((x) => clamp(x, 1e-4, 1)); const s = skinTone(t), w = lch(litColour(t, LIGHTS.warm, 1));
    if (s.pass && w.h >= SKIN.warmHue + 2 && w.C <= SKIN.warmChroma - 0.006 && s.cl <= SKIN.cl - 0.01) break;
    if (w.h < SKIN.warmHue + 2) h = Math.min(H1, h + 2 * Math.PI / 180); if (w.C > SKIN.warmChroma - 0.006 || s.cl > SKIN.cl - 0.01) C *= 0.94; if (s.coolCl < SKIN.coolCl) C *= 1.06; }
  return t.map((x, i) => x / Math.max(1e-4, lin[i]));
}
// (MV) a cloth's albedo capped at OKLab L 0.885 (sRGB ~218 for a neutral): a white cotton tee or chef's jacket is not
// paper-white, and over 0.9 the study's lamp and the street's sun clip it to flat cream with no folds (the grandmother's
// tee, GR). Hue and chroma kept.
export const WHITE_L = 0.885;
export function capWhite(rgb) { const lin = rgb.map(toLin), [L, a, b] = oklab(lin); if (L <= WHITE_L) return { rgb, changed: false };
  const c = fromOklab([WHITE_L, a * WHITE_L / L, b * WHITE_L / L]).map((x) => clamp(x, 0, 1)); return { rgb: c.map((x) => Math.round(255 * Math.pow(x, 1 / 2.2))), changed: true }; }
