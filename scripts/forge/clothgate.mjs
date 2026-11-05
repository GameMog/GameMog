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
// What it did not see until G8b's ridge (below): a light cloth whose diffuse alone reads as satin (the grandmother's tee,
// round 6: its sweep is in the frame without the specular as well); still not: the chef's drawn lines.
// Calibration (G7c, studio/cloth.mts's three views at 600 px): Mr. Big specArea 0.04-1.65 %, shards 34-82; Jane
// specArea 0, shards 0. Before G7c: the cop's cap 4.8 and 7.8 % (its gold band and crown a plain F0 0.04 at roughness
// 0.72), the old boss's shards 280-316 (his shirt's saw edge along the lapels), the young hero's 16-48. Limits: Mr.
// Big's worst with a margin (2.5 %, 140 px). After G7c the old boss is at 88-128 (Node and browser builds), the rest at 0-48.
// G8b adds two (the mask now draws the skin blue):
//   skinShards  the same shards against the skin (light cloth an opening takes, within 3 px of skin): the chef's collar
//               is white cloth on skin, which the white-on-dark count never saw. Mr. Big 33-210 (his collar points under
//               the beard), Jane 4-36; G8a's grandmother 176-291 (her tee's neck), the chef 33-50. Limit 300. At the study
//               distance it is a coarse guard: the chef's collar's teeth are a few px each here.
//   ridge       on a light piece (median OKLab L over 0.45 without specular) the share of its inside on a bright line
//               (the lightness blurred at 2 px; its Hessian's lower eigenvalue x 4 under -0.012 and 3 x the other): the
//               shading-only sheen round 7 could not see. Mr. Big's and Jane's cloth has no light piece (their shirts
//               are under 0.45 in this light, or one material with the suit); the chef 0.005-0.010, the young mother
//               0.017; G8a's grandmother 0.031-0.040 (each seam of her baked tee lit by the atlas's grey: core.mjs
//               garment), after G8b 0.016-0.024. Limit 0.03.
export const CLOTH_LIMITS = { minPx: 2000, minPiece: 1500, lightPiece: 0.45, ridgeK: 0.012, maxRidge: 0.03, maxSkinShards: 300, specLift: 0.02, hotOver: 3, maxSpecArea: 0.025, maxShards: 140 };

const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const okLab = (r, g, b) => { const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s]; };
// (a float field blurred by a gaussian of s px, separably)
function gblur(F, W, H, s) { const r = Math.ceil(3 * s), k = []; let t = 0; for (let i = -r; i <= r; i++) { const v = Math.exp(-i * i / (2 * s * s)); k.push(v); t += v; } for (let i = 0; i < k.length; i++) k[i] /= t;
  const a = new Float32Array(W * H), b = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let v = 0; for (let i = -r; i <= r; i++) v += k[i + r] * F[y * W + Math.min(W - 1, Math.max(0, x + i))]; a[y * W + x] = v; }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let v = 0; for (let i = -r; i <= r; i++) v += k[i + r] * a[Math.min(H - 1, Math.max(0, y + i)) * W + x]; b[y * W + x] = v; } return b; }
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
  const skin = new Uint8Array(W * H);
  for (let k = 0; k < W * H; k++) if (mask[k * ch] > 200) { any[k] = 1; id[k] = Math.max(1, mask[k * ch + 1]); } else if (mask[k * ch + 2] > 200 && mask[k * ch + 1] < 60) skin[k] = 1;
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
  const opened = morph(morph(wht, W, H, 2, 0), W, H, 2, 1), nearD = morph(drk, W, H, 3, 1), nearS = morph(skin, W, H, 3, 1);
  let shards = 0, skinShards = 0; for (let k = 0; k < W * H; k++) if (wht[k] && !opened[k]) { if (nearD[k]) shards++; else if (nearS[k]) skinShards++; }
  // (G8b, ridges: on a light piece (its median OKLab lightness over 0.45 in the frame without specular) the share of its
  // inside (the piece all round it at 7 px) on a bright line: the lightness blurred at 2 px, its Hessian's lower
  // eigenvalue under -RIDGE.k / 4 (a bright crest) and three times the other (a line, not a spot))
  const Ln = new Float32Array(W * H); for (let k = 0; k < W * H; k++) Ln[k] = okLab(lin(nospec[k * ch]), lin(nospec[k * ch + 1]), lin(nospec[k * ch + 2]))[0];
  const light = new Set(); { const per2 = new Map(); for (let k = 0; k < W * H; k++) if (id[k]) (per2.get(id[k]) || per2.set(id[k], []).get(id[k])).push(Ln[k]); for (const [c, a] of per2) { if (a.length < CLOTH_LIMITS.minPiece) continue; a.sort((p, q) => p - q); if (a[a.length >> 1] > CLOTH_LIMITS.lightPiece) light.add(c); } }
  let ridge = null; if (light.size) { const G = gblur(Ln, W, H, 2), R = 7; let rn = 0, rh = 0;
    for (let y = R; y < H - R; y++) for (let x = R; x < W - R; x++) { const k = y * W + x; if (!light.has(id[k])) continue; let ok = 1; for (let d = -R; d <= R && ok; d += R) for (let e = -R; e <= R; e += R) if (id[k + d * W + e] !== id[k]) { ok = 0; break; } if (!ok) continue; rn++;
      const xx = G[k + 1] + G[k - 1] - 2 * G[k], yy = G[k + W] + G[k - W] - 2 * G[k], xy = (G[k + W + 1] - G[k + W - 1] - G[k - W + 1] + G[k - W - 1]) / 4, tr = xx + yy, dt = Math.sqrt(((xx - yy) / 2) ** 2 + xy * xy), l1 = tr / 2 - dt, l2 = tr / 2 + dt;
      if (-l1 * 4 > CLOTH_LIMITS.ridgeK && Math.abs(l1) > 3 * Math.abs(l2)) rh++; }
    if (rn >= CLOTH_LIMITS.minPiece) ridge = +(rh / rn).toFixed(4); }
  return { px: n, specArea: +specArea.toFixed(4), specPiece, piecePeak: +piecePeak.toFixed(4), specPeak: +lift[Math.floor(lift.length * 0.99)].toFixed(4), shards, skinShards, ridge, pieces };
}

/** one view's faults ([] = it passes) */
export function clothFaults(s) {
  if (!s) return [];
  const f = [], C = CLOTH_LIMITS;
  if (s.specArea > C.maxSpecArea) f.push(`specular area ${s.specArea} > ${C.maxSpecArea} (piece ${s.specPiece})`);
  if (s.shards > C.maxShards) f.push(`shards ${s.shards} px > ${C.maxShards}`);
  if ((s.skinShards ?? 0) > C.maxSkinShards) f.push(`light-on-skin shards ${s.skinShards} px > ${C.maxSkinShards}`);
  if (s.ridge != null && s.ridge > C.maxRidge) f.push(`ridges ${s.ridge} > ${C.maxRidge} (a light cloth's bright lines)`);
  return f;
}
/** the verdict over a person's views (each { ang, stats }) */
export function clothVerdict(views) {
  const seen = views.filter((v) => v.stats), bad = seen.map((v) => ({ ...v, faults: clothFaults(v.stats) })).filter((v) => v.faults.length), C = CLOTH_LIMITS;
  const worst = (k) => Math.max(0, ...seen.map((v) => v.stats[k]));
  return { pass: !bad.length, seen: seen.length, worstSpecArea: worst('specArea'), worstSpecPeak: worst('specPeak'), worstShards: worst('shards'), worstSkinShards: worst('skinShards'), worstRidge: worst('ridge'), fails: bad.map((v) => `ang ${v.ang}: ${v.faults.join(', ')}`),
    limit: `the cloth in the study light (front, 3/4, the other 3/4): no piece with over ${C.maxSpecArea * 100} % of it lifted by its specular over ${C.hotOver} x its median lift (and over ${C.specLift} in linear luminance); <= ${C.maxShards} px of white-on-dark shards (light cloth an opening by 5 x 5 takes, within 3 px of dark cloth), <= ${C.maxSkinShards} px of them against the skin; on a light piece <= ${C.maxRidge * 100} % of it on a bright line (ridges, the frame without specular)` };
}
