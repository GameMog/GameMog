// THE CHARACTER FORGE: the mouth's inside as seen (G7a). Round 4 to 6 graded every forged face's open talking frames
// with a lavender or blue mouth: the study's cool rim (7500 K, from behind, no shadow) lit the inside of the mouth and the
// tongue, which only face.js's mouthShade had darkened (the albedo, not the light). Jane's reads dark and warm.
// This measures it where it shows: studio/talk.mts draws each open talking frame twice, as lit and as flat ids
// (studio.html's mask: the inside red, the tongue blue, the teeth green), and passes both here. The inside's pixels (the
// red and the blue, one pixel in from their edge) are read in OKLab: their median lightness, and the hue and chroma of
// their median colour, and the share of them that read cool (b < -0.012: blue to lavender).
//   mouthStats(lit, ids, width, channels)   raw RGB(A) buffers of one frame -> { px, L, C, h, cool } (null: mouth shut)
//   mouthVerdict(frames)                    the open frames' stats -> { pass, worst, ... } against MOUTH_LIMITS

// Calibration (G7, the study light, the 4 open frames of studio/talk.mts): Jane passes (L 0.13-0.20, hue 22-33, 0 %
// cool); Mr. Big's lightness passes (L 0.20-0.26) but his colour does not: hue 318-320 and 73-95 % cool in 3 of his 4
// open frames (only the front one is warm). The shipped Mr. Big shows the same lavender in this light (face.js darkens
// his inside's colour only, and his GLB has no lining), so the bar for the colour is Jane's, and Mr. Big's lightness
// with a margin for L. Round 6's anchors: L up to 0.23-0.33, up to 51-80 % cool, 12 of 12 fail; G7a's: L 0.12-0.18, 0 % cool, pass.
// (median L <= 0.30; the median colour warm (345..90 deg) unless near grey (C < 0.025); <= 30 % of the inside cool;
// frames with fewer than 40 inside pixels are shut)
export const MOUTH_LIMITS = { minPx: 40, maxL: 0.3, neutralC: 0.025, warmHue: [345, 90], maxCool: 0.3 };

const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const oklab = (r, g, b) => { const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s]; };
const med = (a) => { const s = Float64Array.from(a).sort(); return s.length ? s[Math.floor(s.length / 2)] : 0; };

/** the inside of the mouth in one frame: lit and ids are raw buffers of the same size (width W, ch channels) */
export function mouthStats(lit, ids, W, ch = 3) {
  const H = Math.floor(ids.length / ch / W), cls = new Uint8Array(W * H);
  // (classes: 1 the inside, 2 the tongue, 3 teeth, 4 the set or background, 0 the rest of the person)
  for (let k = 0; k < W * H; k++) { const r = ids[k * ch], g = ids[k * ch + 1], b = ids[k * ch + 2];
    cls[k] = r > 140 && g > 140 && b > 140 ? 4 : r > 140 && g < 90 && b < 90 ? 1 : b > 140 && r < 90 && g < 90 ? 2 : g > 140 && r < 90 && b < 90 ? 3 : 0; }
  // (the set seen through the open mouth: a white patch not joined to the frame's edge, touching the inside, the tongue or
  // the teeth, is the dark behind them (a GLB with nothing there): counted as the inside)
  { const seen = new Uint8Array(W * H), st = [];
    for (let k = 0; k < W * H; k++) { const x = k % W, y = (k / W) | 0; if (cls[k] === 4 && (x === 0 || y === 0 || x === W - 1 || y === H - 1)) { seen[k] = 1; st.push(k); } }
    const fill = (st, mark) => { while (st.length) { const k = st.pop(); mark(k); for (const d of [1, -1, W, -W]) { const q = k + d; if (q < 0 || q >= W * H || seen[q] || cls[q] !== 4) continue; seen[q] = 1; st.push(q); } } };
    fill(st, () => {});
    for (let k = 0; k < W * H; k++) if (cls[k] === 4 && !seen[k]) { const comp = []; seen[k] = 1; fill([k], (q) => comp.push(q));
      const touches = comp.some((q) => [1, -1, W, -W].some((d) => { const c = cls[q + d]; return c === 1 || c === 2 || c === 3; }));
      for (const q of comp) cls[q] = touches ? 1 : 0; } }
  for (let k = 0; k < W * H; k++) if (cls[k] > 2) cls[k] = 0;
  const L = [], A = [], B = []; let cool = 0, tongue = 0;
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const k = y * W + x; if (!cls[k]) continue;
    let edge = false; for (let dy = -1; dy <= 1 && !edge; dy++) for (let dx = -1; dx <= 1; dx++) if (!cls[k + dy * W + dx]) { edge = true; break; }
    if (edge) continue;
    const [l, a, b] = oklab(lin(lit[k * ch]), lin(lit[k * ch + 1]), lin(lit[k * ch + 2])); L.push(l); A.push(a); B.push(b); if (b < -0.012) cool++; if (cls[k] === 2) tongue++; }
  if (L.length < MOUTH_LIMITS.minPx) return null;
  const a = med(A), b = med(B);
  return { px: L.length, tongueShare: +(tongue / L.length).toFixed(2), L: +med(L).toFixed(3), C: +Math.hypot(a, b).toFixed(3), h: Math.round(((Math.atan2(b, a) * 180) / Math.PI + 360) % 360), cool: +(cool / L.length).toFixed(2) };
}

const warm = (h) => { const [a, b] = MOUTH_LIMITS.warmHue; return a > b ? h >= a || h <= b : h >= a && h <= b; };
/** one frame's faults ([] = it passes) */
export function mouthFaults(s) {
  if (!s) return [];
  const f = [];
  if (s.L > MOUTH_LIMITS.maxL) f.push(`light (L ${s.L} > ${MOUTH_LIMITS.maxL})`);
  if (s.C >= MOUTH_LIMITS.neutralC && !warm(s.h)) f.push(`hue ${s.h} not warm`);
  if (s.cool > MOUTH_LIMITS.maxCool) f.push(`cool ${s.cool} > ${MOUTH_LIMITS.maxCool}`);
  return f;
}
/** the verdict over a person's open frames (each { jaw, ang, stats }) */
export function mouthVerdict(frames) {
  const open = frames.filter((f) => f.stats), bad = open.map((f) => ({ ...f, faults: mouthFaults(f.stats) })).filter((f) => f.faults.length);
  const worstL = Math.max(0, ...open.map((f) => f.stats.L)), worstCool = Math.max(0, ...open.map((f) => f.stats.cool));
  return { pass: open.length > 0 && !bad.length, open: open.length, worstL, worstCool, fails: bad.map((f) => `jaw ${f.jaw} ang ${f.ang}: ${f.faults.join(', ')}`),
    limit: `open talking frames in the study light: the mouth's inside (and tongue) median OKLab L <= ${MOUTH_LIMITS.maxL}, its median colour warm (hue ${MOUTH_LIMITS.warmHue[0]}..${MOUTH_LIMITS.warmHue[1]}) or near grey (C < ${MOUTH_LIMITS.neutralC}), <= ${MOUTH_LIMITS.maxCool * 100} % of it cool` };
}
