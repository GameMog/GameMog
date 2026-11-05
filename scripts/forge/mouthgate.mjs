// THE CHARACTER FORGE: the mouth's inside as seen (G7a). Round 4 to 6 graded every forged face's open talking frames
// with a lavender or blue mouth: the study's cool rim (7500 K, from behind, no shadow) lit the inside of the mouth and the
// tongue, which only face.js's mouthShade had darkened (the albedo, not the light). Jane's reads dark and warm.
// This measures it where it shows: studio/talk.mts draws each open talking frame twice, as lit and as flat ids
// (studio.html's mask: the inside red, the tongue blue, the teeth green), and passes both here. The inside's pixels (the
// red and the blue, one pixel in from their edge) are read in OKLab: their median lightness, and the hue and chroma of
// their median colour, and the share of them that read cool (b < -0.012: blue to lavender).
//   mouthStats(lit, ids, width, channels)   raw RGB(A) buffers of one frame -> { px, L, C, h, cool, lit, teethRow, teethShare } (null: mouth shut)
//   mouthVerdict(frames)                    the open frames' stats -> { pass, worst, ... } against MOUTH_LIMITS

// Calibration (G7, the study light, the 4 open frames of studio/talk.mts): Jane passes (L 0.13-0.20, hue 22-33, 0 %
// cool); Mr. Big's lightness passes (L 0.20-0.26) but his colour does not: hue 318-320 and 73-95 % cool in 3 of his 4
// open frames (only the front one is warm). The shipped Mr. Big shows the same lavender in this light (face.js darkens
// his inside's colour only, and his GLB has no lining), so the bar for the colour is Jane's, and Mr. Big's lightness
// with a margin for L. Round 6's anchors: L up to 0.23-0.33, up to 51-80 % cool, 12 of 12 fail; G7a's: L 0.12-0.18, 0 % cool, pass.
// (median L <= 0.30; the median colour warm (345..90 deg) unless near grey (C < 0.025); <= 30 % of the inside cool;
// frames with fewer than 40 inside pixels are shut)
// G8a, 'a puppet's black void': G7a's mouths passed with the inside at lightness 0.12 (the render's floor: no tone at all)
// and only the two upper centrals lit. Two floors more, calibrated on Jane's 4 open frames (the study light):
//   voidShare the share of the open mouth (the inside, the tongue and the teeth) whose inside reads near black (OKLab
//             L < 0.14, the render's floor is 0.12): a floor on the inside's lightness over the opening, so the inner
//             lip, gums and floor carry some warm tone. Jane 0-0.06 (her inside is a dark sliver behind a full row of
//             teeth: per frame its median L is 0.13-0.20, too few pixels for a percentile floor); Mr. Big 0; G7's
//             anchors 0.27-0.51 in their worst frame. At most 0.2.
//   lit       (reported) the inside's 75th-percentile L: Jane 0.13-0.20, Mr. Big 0.22-0.27, G7's anchors 0.12-0.25.
//   teethRow  the share of the open mouth's width (its columns: the inside, the tongue and the teeth) that has a lit
//             tooth (OKLab L >= 0.5) in it: a full upper row reads across the opening. Jane 0.65-0.72; G7's anchors
//             0.31-0.41 (two centrals); Mr. Big 0 (his GLB has no teeth). Floor 0.5.
// (teethShare: the lit teeth's share of the opening's area, reported only: Jane's mouth opens far less, so hers is 0.7-0.9)
// (the teeth's mask green reaches the PNG as about (150, 230, 85) through the studio's tone mapping: classed by g over r)
export const MOUTH_LIMITS = { minPx: 40, maxL: 0.3, neutralC: 0.025, warmHue: [345, 90], maxCool: 0.3, maxVoid: 0.2, voidL: 0.14, minTeethRow: 0.5, toothL: 0.5 };

const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const oklab = (r, g, b) => { const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s]; };
const med = (a) => { const s = Float64Array.from(a).sort(); return s.length ? s[Math.floor(s.length / 2)] : 0; };

/** the inside of the mouth in one frame: lit and ids are raw buffers of the same size (width W, ch channels) */
export function mouthStats(lit, ids, W, ch = 3) {
  const H = Math.floor(ids.length / ch / W), cls = new Uint8Array(W * H), lit_ = (k, c) => lit[k * ch + c];
  // (classes: 1 the inside, 2 the tongue, 3 teeth, 4 the set or background, 0 the rest of the person)
  for (let k = 0; k < W * H; k++) { const r = ids[k * ch], g = ids[k * ch + 1], b = ids[k * ch + 2];
    cls[k] = r > 140 && g > 140 && b > 140 ? 4 : r > 140 && g < 90 && b < 90 ? 1 : b > 140 && r < 90 && g < 90 ? 2 : g > 140 && g - r > 40 && b < 130 ? 3 : 0; }
  // (the set seen through the open mouth: a white patch not joined to the frame's edge, touching the inside, the tongue or
  // the teeth, is the dark behind them (a GLB with nothing there): counted as the inside)
  { const seen = new Uint8Array(W * H), st = [];
    for (let k = 0; k < W * H; k++) { const x = k % W, y = (k / W) | 0; if (cls[k] === 4 && (x === 0 || y === 0 || x === W - 1 || y === H - 1)) { seen[k] = 1; st.push(k); } }
    const fill = (st, mark) => { while (st.length) { const k = st.pop(); mark(k); for (const d of [1, -1, W, -W]) { const q = k + d; if (q < 0 || q >= W * H || seen[q] || cls[q] !== 4) continue; seen[q] = 1; st.push(q); } } };
    fill(st, () => {});
    for (let k = 0; k < W * H; k++) if (cls[k] === 4 && !seen[k]) { const comp = []; seen[k] = 1; fill([k], (q) => comp.push(q));
      const touches = comp.some((q) => [1, -1, W, -W].some((d) => { const c = cls[q + d]; return c === 1 || c === 2 || c === 3; }));
      for (const q of comp) cls[q] = touches ? 1 : 0; } }
  // (G8a: the opening's columns, and those with a lit tooth, before the teeth are dropped from the inside)
  const cols = new Uint8Array(W), tcols = new Uint8Array(W); let open = 0, nLit = 0;
  for (let k = 0; k < W * H; k++) { const c = cls[k]; if (c < 1 || c > 3) continue; open++; cols[k % W] = 1;
    if (c === 3 && oklab(lin(lit_(k, 0)), lin(lit_(k, 1)), lin(lit_(k, 2)))[0] >= MOUTH_LIMITS.toothL) { tcols[k % W] = 1; nLit++; } }
  const nCols = cols.reduce((s, x) => s + x, 0), teethRow = nCols ? tcols.reduce((s, x) => s + x, 0) / nCols : 0, teethShare = open ? nLit / open : 0;
  for (let k = 0; k < W * H; k++) if (cls[k] > 2) cls[k] = 0;
  const L = [], A = [], B = []; let cool = 0, tongue = 0;
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const k = y * W + x; if (!cls[k]) continue;
    let edge = false; for (let dy = -1; dy <= 1 && !edge; dy++) for (let dx = -1; dx <= 1; dx++) if (!cls[k + dy * W + dx]) { edge = true; break; }
    if (edge) continue;
    const [l, a, b] = oklab(lin(lit[k * ch]), lin(lit[k * ch + 1]), lin(lit[k * ch + 2])); L.push(l); A.push(a); B.push(b); if (b < -0.012) cool++; if (cls[k] === 2) tongue++; }
  if (L.length < MOUTH_LIMITS.minPx) return null;
  const a = med(A), b = med(B);
  const p75 = Float64Array.from(L).sort()[Math.floor(L.length * 0.75)], voidShare = open ? L.filter((l) => l < MOUTH_LIMITS.voidL).length / open : 0;
  return { px: L.length, tongueShare: +(tongue / L.length).toFixed(2), L: +med(L).toFixed(3), lit: +p75.toFixed(3), teethRow: +teethRow.toFixed(2), teethShare: +teethShare.toFixed(2), voidShare: +voidShare.toFixed(2), C: +Math.hypot(a, b).toFixed(3), h: Math.round(((Math.atan2(b, a) * 180) / Math.PI + 360) % 360), cool: +(cool / L.length).toFixed(2) };
}

const warm = (h) => { const [a, b] = MOUTH_LIMITS.warmHue; return a > b ? h >= a || h <= b : h >= a && h <= b; };
/** one frame's faults ([] = it passes) */
export function mouthFaults(s) {
  if (!s) return [];
  const f = [];
  if (s.L > MOUTH_LIMITS.maxL) f.push(`light (L ${s.L} > ${MOUTH_LIMITS.maxL})`);
  if (s.C >= MOUTH_LIMITS.neutralC && !warm(s.h)) f.push(`hue ${s.h} not warm`);
  if (s.cool > MOUTH_LIMITS.maxCool) f.push(`cool ${s.cool} > ${MOUTH_LIMITS.maxCool}`);
  if (s.voidShare > MOUTH_LIMITS.maxVoid) f.push(`a void (${s.voidShare} of the opening L < ${MOUTH_LIMITS.voidL})`);
  if (s.teethRow < MOUTH_LIMITS.minTeethRow) f.push(`teeth (row ${s.teethRow} < ${MOUTH_LIMITS.minTeethRow})`);
  return f;
}
/** the verdict over a person's open frames (each { jaw, ang, stats }) */
export function mouthVerdict(frames) {
  const open = frames.filter((f) => f.stats), bad = open.map((f) => ({ ...f, faults: mouthFaults(f.stats) })).filter((f) => f.faults.length);
  const worstL = Math.max(0, ...open.map((f) => f.stats.L)), worstCool = Math.max(0, ...open.map((f) => f.stats.cool));
  const worstVoid = Math.max(0, ...open.map((f) => f.stats.voidShare)), worstTeethRow = Math.min(1, ...open.map((f) => f.stats.teethRow));
  return { pass: open.length > 0 && !bad.length, open: open.length, worstL, worstCool, worstVoid, worstTeethRow, fails: bad.map((f) => `jaw ${f.jaw} ang ${f.ang}: ${f.faults.join(', ')}`),
    limit: `open talking frames in the study light: the mouth's inside (and tongue) median OKLab L <= ${MOUTH_LIMITS.maxL}, its median colour warm (hue ${MOUTH_LIMITS.warmHue[0]}..${MOUTH_LIMITS.warmHue[1]}) or near grey (C < ${MOUTH_LIMITS.neutralC}), <= ${MOUTH_LIMITS.maxCool * 100} % of it cool; <= ${MOUTH_LIMITS.maxVoid * 100} % of the opening near black (L < ${MOUTH_LIMITS.voidL}); a lit tooth (L >= ${MOUTH_LIMITS.toothL}) across >= ${MOUTH_LIMITS.minTeethRow * 100} % of the opening's width` };
}
