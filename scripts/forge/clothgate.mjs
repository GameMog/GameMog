// THE CHARACTER FORGE: the cloth as it reads in the study light (G7c). Round 6 graded the cloth by eye, and the faults
// it found no gate saw: the cop's cap band shone like lacquer, and white shards of the old boss's shirt stood out along
// his lapels' dark inner edge. studio/cloth.mts draws three study views of the chest and head (front, 3/4, the other
// 3/4) three times each: lit, lit with the cloth's specular off (studio.html nospec: KHR_materials_specular's intensity
// 0), and as a cloth mask (studio.html mask 'cloth': each cloth material in its own code, red full and its green rising
// with its number (the piece is keyed by the green drawn); the rest black), and passes them here. On the cloth's
// pixels (2 px in from each piece's outline):
//   spec    the highlight the cloth's specular adds under the study key: the lit frame's linear luminance over the frame
//           without it, per piece (of at least 1500 px). Wool, cotton and twill scatter: their specular is a soft lift
//           spread over the whole piece (Mr. Big's suit about 0.007 almost everywhere, Jane's green cloth 0.017), where a
//           lacquered band or a satin sweep concentrates it in a streak. specArea is the share of the worst piece's
//           pixels lifted over 3 x the piece's own median lift (and over 0.02): a highlight that stands out of its
//           cloth; piecePeak (reported) the worst piece's 99th percentile lift.
//   shards  white on dark: white cloth pixels (OKLab lightness over 0.55, chroma under 0.06: a tie's rose stripe is not
//           white) next to dark cloth (under 0.22, within 3 px) that an opening of the light area by a 5 x 5 square takes away: spikes, teeth and slivers of a shirt along a
//           jacket's edge (a straight edge, however it runs, survives an opening; a saw edge does not). Pixels.
//   clothStats(lit, nospec, mask, width, channels) -> { px, specArea, specPiece, piecePeak, specPeak, shards, pieces } (null: < minPx)
//   clothVerdict(views)                            -> { pass, worst..., fails } against CLOTH_LIMITS
// What it does not see: a light cloth whose diffuse alone reads as satin (the grandmother's tee, round 6: its sweep is in
// the frame without the specular as well; its fix is in the cloth's texture, core.mjs garment's bake), and the chef's drawn
// lines.
// Calibration (G7c, studio/cloth.mts's three views at 600 px): Mr. Big specArea 0.04-1.65 %, shards 34-82; Jane
// specArea 0, shards 0. Before G7c: the cop's cap 4.8 and 7.8 % (its gold band and crown a plain F0 0.04 at roughness
// 0.72), the old boss's shards 280-316 (his shirt's saw edge along the lapels), the young hero's 16-48. Limits: Mr.
// Big's worst with a margin (2.5 %, 140 px). After G7c the old boss is at 88-128 (Node and browser builds), the rest at 0-48.
export const CLOTH_LIMITS = { minPx: 2000, minPiece: 1500, specLift: 0.02, hotOver: 3, maxSpecArea: 0.025, maxShards: 140 };

const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const okLab = (r, g, b) => { const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s]; };
// (a binary image eroded (val 0) or dilated (val 1) by a (2R+1) square, separably)
function morph(src, W, H, R, val) {
  const tmp = new Uint8Array(W * H), dst = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let v = val ? 0 : 1; for (let d = -R; d <= R; d++) { const xx = x + d; const s = xx < 0 || xx >= W ? 0 : src[y * W + xx]; if (val ? s : !s) { v = val; break; } } tmp[y * W + x] = v; }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let v = val ? 0 : 1; for (let d = -R; d <= R; d++) { const yy = y + d; const s = yy < 0 || yy >= H ? 0 : tmp[yy * W + x]; if (val ? s : !s) { v = val; break; } } dst[y * W + x] = v; }
  return dst;
}

/** one view: lit, nospec and mask are raw buffers of the same size (width W, ch channels) */
export function clothStats(lit, nospec, mask, W, ch = 3) {
  const H = Math.floor(mask.length / ch / W), id = new Uint8Array(W * H), any = new Uint8Array(W * H);
  for (let k = 0; k < W * H; k++) if (mask[k * ch] > 200) { any[k] = 1; id[k] = Math.max(1, mask[k * ch + 1]); }
  // (a piece's inside: its code over the whole 5 x 5 round the pixel)
  const inside = new Uint8Array(W * H);
  for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) { const k = y * W + x, c = id[k]; if (!c) continue; let ok = 1; for (let dy = -2; dy <= 2 && ok; dy++) for (let dx = -2; dx <= 2; dx++) if (id[k + dy * W + dx] !== c) { ok = 0; break; } inside[k] = ok; }
  const Y = (b, k) => 0.2126 * lin(b[k * ch]) + 0.7152 * lin(b[k * ch + 1]) + 0.0722 * lin(b[k * ch + 2]);
  const per = new Map(), lift = []; let n = 0;
  for (let k = 0; k < W * H; k++) { if (!inside[k]) continue; n++; const d = Math.max(0, Y(lit, k) - Y(nospec, k)); lift.push(d);
    const e = per.get(id[k]) || { n: 0, d: [] }; e.n++; e.d.push(d); per.set(id[k], e); }
  if (n < CLOTH_LIMITS.minPx) return null;
  lift.sort((a, b) => a - b);
  let specArea = 0, specPiece = 0, piecePeak = 0; const pieces = {};
  for (const [c, e] of per) { if (e.n < CLOTH_LIMITS.minPiece) continue; e.d.sort((a, b) => a - b); const p50 = e.d[Math.floor(e.d.length * 0.5)], p99 = e.d[Math.floor(e.d.length * 0.99)], hot = Math.max(CLOTH_LIMITS.specLift, CLOTH_LIMITS.hotOver * p50);
    let hi = 0; for (const d of e.d) if (d > hot) hi++; pieces[c] = { n: e.n, area: +(hi / e.n).toFixed(4), p50: +p50.toFixed(4), p99: +p99.toFixed(4) };
    if (hi / e.n > specArea) { specArea = hi / e.n; specPiece = c; } piecePeak = Math.max(piecePeak, p99); }
  // (shards: the light cloth opened by a 5 x 5 square; what the opening takes, next to dark cloth, is a shard's)
  const wht = new Uint8Array(W * H), drk = new Uint8Array(W * H);
  for (let k = 0; k < W * H; k++) { if (!any[k]) continue; const [L, a, b] = okLab(lin(lit[k * ch]), lin(lit[k * ch + 1]), lin(lit[k * ch + 2])); if (L > 0.55 && Math.hypot(a, b) < 0.06) wht[k] = 1; else if (L < 0.22) drk[k] = 1; }
  const opened = morph(morph(wht, W, H, 2, 0), W, H, 2, 1), nearD = morph(drk, W, H, 3, 1);
  let shards = 0; for (let k = 0; k < W * H; k++) if (wht[k] && !opened[k] && nearD[k]) shards++;
  return { px: n, specArea: +specArea.toFixed(4), specPiece, piecePeak: +piecePeak.toFixed(4), specPeak: +lift[Math.floor(lift.length * 0.99)].toFixed(4), shards, pieces };
}

/** one view's faults ([] = it passes) */
export function clothFaults(s) {
  if (!s) return [];
  const f = [], C = CLOTH_LIMITS;
  if (s.specArea > C.maxSpecArea) f.push(`specular area ${s.specArea} > ${C.maxSpecArea} (piece ${s.specPiece})`);
  if (s.shards > C.maxShards) f.push(`shards ${s.shards} px > ${C.maxShards}`);
  return f;
}
/** the verdict over a person's views (each { ang, stats }) */
export function clothVerdict(views) {
  const seen = views.filter((v) => v.stats), bad = seen.map((v) => ({ ...v, faults: clothFaults(v.stats) })).filter((v) => v.faults.length), C = CLOTH_LIMITS;
  const worst = (k) => Math.max(0, ...seen.map((v) => v.stats[k]));
  return { pass: !bad.length, seen: seen.length, worstSpecArea: worst('specArea'), worstSpecPeak: worst('specPeak'), worstShards: worst('shards'), fails: bad.map((v) => `ang ${v.ang}: ${v.faults.join(', ')}`),
    limit: `the cloth in the study light (front, 3/4, the other 3/4): no piece with over ${C.maxSpecArea * 100} % of it lifted by its specular over ${C.hotOver} x its median lift (and over ${C.specLift} in linear luminance); <= ${C.maxShards} px of white-on-dark shards (light cloth an opening by 5 x 5 takes, within 3 px of dark cloth)` };
}
