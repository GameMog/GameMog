// THE CHARACTER FORGE: hair that reads as hair (G7b). Rounds 5 and 6 graded the nurse's curls as wire spirals or
// chain-link netting, and the mechanic's horseshoe and the cop's buzz as pepper dots, and no gate saw any of it (the
// helmet check measures geometry; the nurse's curls were not even counted as hair). This measures the hair where it
// shows: studio/hair.mts draws the four study views of the head (front, 3/4, profile, back 3/4) twice, as lit and as a
// hair mask (studio.html mask 'hair': the head's hair white through its cut-out, everything else black), and passes both
// here. On the hair's pixels away from its outline (the mask white over a 5 px square round them), in OKLab lightness:
//   grain   the mean distance of a pixel's lightness from its 5 x 5 neighbourhood's mean (hair pixels only), over the
//           hair's mean lightness (+0.1, so a black crop is not judged on noise): how hard the hair's texture reads.
//           Soft hair is a tone with a fine grain; wire, netting and pepper on skin read as hard dark-and-light.
//   dots    the share of those pixels that stand out from all 8 neighbours (darker than the darkest of them, or lighter
//           than the lightest, by over 0.02): isolated specks. A strand is darker than its sides but not its ends, so
//           hair along its growth scores low; pepper dots and broken wire score high.
//   holes   the hair's area closed over 4 px (dilated, then eroded) and the share of it the hair leaves open: the skin
//           or the room seen through it, as through netting (the nurse's wire ringlets).
//   hairStats(lit, mask, width, channels)   raw RGB(A) buffers of one view -> { px, L, grain, dots, holes } (null: < minPx)
//   hairVerdict(views, { ropes })           the views' stats -> { pass, worst, ... } against HAIR_LIMITS
// Calibration (G7b, the study light at 600 px, studio/hair.mts's four views): Mr. Big's crop grain 0.043-0.053, dots
// 0.8-1.3 %, holes 0.9-2.7 %; Jane grain 0.024-0.027, dots 0.1-0.3 %, holes 0.2-2.3 %. Round 6 / G7a's anchors: the
// nurse's wire curls grain up to 0.099 and holes 11-16 %, the mechanic's horseshoe dots up to 2.1 %, the veteran's
// white buzz 2.2-2.5 %, the old boss's horseshoe 3.0 %; G7b's: the nurse grain <= 0.067, holes <= 5.9 %; the mechanic's dots <= 1.4 %, the veteran's
// 1.1 %, the old boss's 1.4 %. (The cop's buzz, under his cap, reads as dots by eye more than here: 0.6 % before, 0.3 % after.) Limits: Mr.
// Big's worst with a margin.
export const HAIR_LIMITS = { minPx: 400, maxGrain: 0.08, maxDots: 0.015, maxHoles: 0.06 };

const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const okL = (r, g, b) => { const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s; };

/** the head's hair in one view: lit and mask are raw buffers of the same size (width W, ch channels) */
export function hairStats(lit, mask, W, ch = 3) {
  const H = Math.floor(mask.length / ch / W), on = new Uint8Array(W * H), L = new Float32Array(W * H);
  for (let k = 0; k < W * H; k++) { on[k] = mask[k * ch] > 128 && mask[k * ch + 1] > 128 && mask[k * ch + 2] > 128 ? 1 : 0; if (on[k]) L[k] = okL(lin(lit[k * ch]), lin(lit[k * ch + 1]), lin(lit[k * ch + 2])); }
  let n = 0, sumL = 0, dev = 0, dots = 0;
  for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) { const k = y * W + x; if (!on[k]) continue;
    let inside = true, s = 0, c = 0; for (let dy = -2; dy <= 2 && inside; dy++) for (let dx = -2; dx <= 2; dx++) { const q = k + dy * W + dx; if (!on[q]) { inside = false; break; } s += L[q]; c++; }
    if (!inside) continue;
    let lo = 9, hi = -9; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; const v = L[k + dy * W + dx]; if (v < lo) lo = v; if (v > hi) hi = v; }
    n++; sumL += L[k]; dev += Math.abs(L[k] - s / c); if (L[k] < lo - 0.02 || L[k] > hi + 0.02) dots++; }
  if (n < HAIR_LIMITS.minPx) return null;
  // (holes: the hair's area closed over 4 px (dilated, then eroded), and the share of it the hair does not cover: the
  // background or skin seen through it, as through netting)
  const R = 4, dil = new Uint8Array(W * H), clo = new Uint8Array(W * H), rowMax = (src, dst, val) => { const tmp = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let v = val ? 0 : 1; for (let d = -R; d <= R; d++) { const xx = x + d; if (xx < 0 || xx >= W) continue; if (val ? src[y * W + xx] : !src[y * W + xx]) { v = val ? 1 : 0; break; } } tmp[y * W + x] = v; }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let v = val ? 0 : 1; for (let d = -R; d <= R; d++) { const yy = y + d; if (yy < 0 || yy >= H) continue; if (val ? tmp[yy * W + x] : !tmp[yy * W + x]) { v = val ? 1 : 0; break; } } dst[y * W + x] = v; } };
  rowMax(on, dil, 1); rowMax(dil, clo, 0);
  let area = 0, gap = 0; for (let k = 0; k < W * H; k++) if (clo[k]) { area++; if (!on[k]) gap++; }
  const mL = sumL / n;
  return { px: n, L: +mL.toFixed(3), grain: +((dev / n) / (mL + 0.1)).toFixed(3), dots: +(dots / n).toFixed(4), holes: +(gap / Math.max(1, area)).toFixed(3) };
}

/** one view's faults ([] = it passes) */
export function hairFaults(s) {
  if (!s) return [];
  const f = [];
  if (s.grain > HAIR_LIMITS.maxGrain) f.push(`grain ${s.grain} > ${HAIR_LIMITS.maxGrain}`);
  if (s.dots > HAIR_LIMITS.maxDots) f.push(`dots ${s.dots} > ${HAIR_LIMITS.maxDots}`);
  if (s.holes > HAIR_LIMITS.maxHoles) f.push(`holes ${s.holes} > ${HAIR_LIMITS.maxHoles}`);
  return f;
}
/** the verdict over a person's views (each { ang, stats }); a head with no hair seen in any view passes (shaved) */
// (o.ropes: the head's hair only braids or locs: they lie in rows with the painted scalp between them by design, so the
// holes are not counted, as the helmet gate does not ask them to vary (the teen's locs: 10 % open, as made))
export function hairVerdict(views, o = {}) {
  const seen = views.filter((v) => v.stats), bad = seen.map((v) => ({ ...v, faults: hairFaults(v.stats).filter((f) => !(o.ropes && f.startsWith('holes'))) })).filter((v) => v.faults.length);
  return { pass: !bad.length, seen: seen.length, worstGrain: Math.max(0, ...seen.map((v) => v.stats.grain)), worstDots: Math.max(0, ...seen.map((v) => v.stats.dots)), worstHoles: Math.max(0, ...seen.map((v) => v.stats.holes)), ropes: !!o.ropes, fails: bad.map((v) => `ang ${v.ang}: ${v.faults.join(', ')}`),
    limit: `the head's hair in the study light (front, 3/4, profile, back 3/4): grain <= ${HAIR_LIMITS.maxGrain} (its lightness's mean distance from its 5 x 5 mean, over its mean + 0.1), <= ${HAIR_LIMITS.maxDots * 100} % isolated specks, <= ${HAIR_LIMITS.maxHoles * 100} % of its closed area open (not for braids or locs)` };
}
