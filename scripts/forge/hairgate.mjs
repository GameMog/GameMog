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

// G8b, the hairline's step. Round 7 graded the chef's, young hero's and office worker's hairlines as hard, stepped
// cut-outs at the temples and forehead: the cards' alpha-cut edge lying on bare skin (their scalp was never painted).
// Mr. Big's is graded: the hair thins over the painted scalp, so where the hair's cut-out meets the skin the skin beside
// it is already the hair's tone. studio/hair.mts draws the hairline close (studio.html mode 'hairline': brows to the
// crown's front at 0.62 m) at the front and both 3/4s, lit and as mask 'hairline' (the hair white through its cut-out,
// the skin red, the rest black). On the hair's edge against the skin in the frame's top 62 % (the forehead and temples,
// not the ears or neck): per edge pixel the jump in OKLab lightness between the hair and the skin within 3 px of it
// (the means of each in its 7 x 7), over the contrast between the hair and the bare forehead (their medians away from
// the edge: the hair 6-60 px in, the skin 45-130 px out (past a painted hairline's strands: 1 px is about 0.3 mm); at
// least 0.1), and over 0.12 whatever the contrast. step = the share of edge pixels whose jump is over
// half that contrast: a cut-out's edge jumps the whole way, a graded one a little at a time.
//   hairlineStats(lit, mask, width, channels) -> { edge, contrast, step } (null: under minEdge edge pixels)
// Calibration (G8b, 600 px, the three views): Mr. Big 0.11-0.19 (silver on light skin: his contrast at the floor, so
// the 0.12 jump decides), Jane 0.07-0.14. G8a's builds: the chef 0.92-1.0, the young hero 0.90-1.0, the club promoter
// 0.95-1.0, the grandmother 0.19-0.45, the office worker 0.20-0.32, the young mother 0.12-0.28 (six fail); after G8b's
// scalp line (core.mjs) every anchor 0-0.21. Limit 0.25: Mr. Big's worst with a margin. The cop's cap and the veteran's
// buzz show no hair edge on the forehead (null: passes).
export const HAIRLINE_LIMITS = { minEdge: 60, top: 0.62, near: 3, minJump: 0.12, maxStep: 0.25 };
export function hairlineStats(lit, mask, W, ch = 3) {
  const H = Math.floor(mask.length / ch / W), cls = new Uint8Array(W * H), L = new Float32Array(W * H), C = HAIRLINE_LIMITS;
  for (let k = 0; k < W * H; k++) { const r = mask[k * ch], g = mask[k * ch + 1], b = mask[k * ch + 2]; cls[k] = r > 128 && g > 128 && b > 128 ? 1 : r > 128 && g < 80 && b < 80 ? 2 : 0; if (cls[k]) L[k] = okL(lin(lit[k * ch]), lin(lit[k * ch + 1]), lin(lit[k * ch + 2])); }
  // (each pixel's distance (in px, chessboard, two passes) to the nearest hair and to the nearest skin)
  const dist = (want) => { const d = new Uint16Array(W * H).fill(9999); for (let k = 0; k < W * H; k++) if (cls[k] === want) d[k] = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const k = y * W + x; let m = d[k]; if (x > 0) m = Math.min(m, d[k - 1] + 1); if (y > 0) { m = Math.min(m, d[k - W] + 1); if (x > 0) m = Math.min(m, d[k - W - 1] + 1); if (x < W - 1) m = Math.min(m, d[k - W + 1] + 1); } d[k] = m; }
    for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) { const k = y * W + x; let m = d[k]; if (x < W - 1) m = Math.min(m, d[k + 1] + 1); if (y < H - 1) { m = Math.min(m, d[k + W] + 1); if (x < W - 1) m = Math.min(m, d[k + W + 1] + 1); if (x > 0) m = Math.min(m, d[k + W - 1] + 1); } d[k] = m; }
    return d; };
  const dH = dist(1), dS = dist(2), Ytop = Math.floor(H * C.top), hs = [], ss = [];
  for (let y = 0; y < Ytop; y++) for (let x = 0; x < W; x++) { const k = y * W + x; if (cls[k] === 1 && dS[k] >= 6 && dS[k] < 60) hs.push(L[k]); else if (cls[k] === 2 && dH[k] >= 45 && dH[k] < 130) ss.push(L[k]); }
  if (hs.length < 50 || ss.length < 50) return null;
  const med = (a) => a.sort((p, q) => p - q)[a.length >> 1], contrast = Math.max(0.1, Math.abs(med(ss) - med(hs)));
  let edge = 0, steps = 0;
  for (let y = 4; y < Ytop; y++) for (let x = 4; x < W - 4; x++) { const k = y * W + x; if (cls[k] !== 1 || !(cls[k - 1] === 2 || cls[k + 1] === 2 || cls[k - W] === 2 || cls[k + W] === 2)) continue;
    let sh = 0, nh = 0, sk = 0, nk = 0; for (let dy = -C.near; dy <= C.near; dy++) for (let dx = -C.near; dx <= C.near; dx++) { const q = k + dy * W + dx; if (cls[q] === 1) { sh += L[q]; nh++; } else if (cls[q] === 2) { sk += L[q]; nk++; } }
    if (!nh || !nk) continue; edge++; if (Math.abs(sk / nk - sh / nh) > Math.max(0.5 * contrast, C.minJump)) steps++; }
  if (edge < C.minEdge) return null;
  return { edge, contrast: +contrast.toFixed(3), hairL: +med(hs).toFixed(3), skinL: +med(ss).toFixed(3), step: +(steps / edge).toFixed(3) };
}
export function hairlineVerdict(views) {
  const seen = views.filter((v) => v.stats), bad = seen.filter((v) => v.stats.step > HAIRLINE_LIMITS.maxStep);
  return { pass: !bad.length, seen: seen.length, worstStep: Math.max(0, ...seen.map((v) => v.stats.step)), fails: bad.map((v) => `ang ${v.ang}: hairline step ${v.stats.step} > ${HAIRLINE_LIMITS.maxStep}`),
    limit: `the hairline close (front and both 3/4s): <= ${HAIRLINE_LIMITS.maxStep * 100} % of the hair's edge against the forehead and temples jumping more than half the hair-to-skin contrast within ${HAIRLINE_LIMITS.near} px` };
}
