// THE CHARACTER FORGE: compile a character sheet (character-sheet.schema.json, what an LLM fills from a description)
// into the core builder's config. Every word maps to a value inside the band the shipped Mog City cast used, and every
// number is clamped, so no sheet can ask for shoulder pads, a toothless mouth, claw hands or a caricature:
//   - shoulders: men 0.72-0.86, women 0.88-0.95 of the template's (moved in along the clavicle), the slope always on
//   - teeth: always built; hands: always refitted to their creases and sized to the head (post.mjs)
//   - face sculpts: each <= 5 mm, their sum <= 28 mm, no point moved > 8 mm (v2.5); jaw <= 6 mm, jowls <= 11 mm; head scale 0.98-1.03
//   - the blend: normalised, each shape kept 0.03-0.9 (always a blend: an original face, never one template)
//   - weight -0.6..2.4 (the pack's shape needs > 1 for heavy-set), muscle <= 0.8, height by body 1.45-1.85 / 1.55-2.0
//   node compile.mjs <sheet.json> <out-dir>   -> <out-dir>/<id>.cfg.json, prints the clamp log
import { faceRecipe } from './targets.mjs';
import { guard, capWhite, oklab, fromOklab, toLin } from './colour.mjs';
import { BRAIDS, GROOMS, HAIR_STYLES } from './library.mjs';
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const hex = (h, d) => (h ? [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) : d);
const lin = (c) => Math.pow(c / 255, 2.2);
const capChroma = (hx, cmax, log) => { const c = hex(hx), [L, a, b] = oklab(c.map(toLin)), C = Math.hypot(a, b); if (C <= cmax) return hx;
  const k = cmax / C, l = fromOklab([L, a * k, b * k]).map((x) => Math.round(255 * Math.pow(clamp(x, 0, 1), 1 / 2.2))), out = '#' + l.map((x) => x.toString(16).padStart(2, '0')).join(''); log.push(`chroma cap ${hx} -> ${out}`); return out; };
const mix = (a, b, t) => a.map((x, i) => Math.round(x + (b[i] - x) * t));

export function compile(S) {
  const log = [], note = (k, want, got) => { if (want !== got) log.push(`${k}: ${JSON.stringify(want)} -> ${JSON.stringify(got)}`); return got; };
  const I = S.identity, sex = I.body, fem = sex === 'female', age = clamp(I.age, 16, 92);
  const C = { sex, sheetId: S.id };

  /* the body */
  const H = I.heightCm / 100, [hl, hh] = fem ? [1.45, 1.85] : [1.55, 2.0];
  C.height = note('height', H, clamp(H, hl, hh));
  C.age = clamp(age < 25 ? (age - 16) / 9 * 0.12 : age < 45 ? 0.12 + (age - 25) / 20 * 0.23 : age < 65 ? 0.35 + (age - 45) / 20 * 0.27 : 0.62 + (age - 65) / 27 * 0.25, 0, 0.9);
  // (MV: stocky and heavy pushed further (1.0 -> 1.25, 2.0 -> 2.3): at 2.0 the old boss stood barely heavier than the rest, GR)
  const WT = { thin: -0.55, slim: -0.2, average: 0.3, stocky: 1.25, heavy: 2.3 }[I.build.weight];
  C.weight = clamp(WT, -0.6, 2.4);
  C.lean = clamp({ thin: 0.8, slim: 0.5, average: 0.1, stocky: -0.35, heavy: -0.75 }[I.build.weight], -0.9, 1);
  C.muscle = clamp({ soft: 0.05, average: 0.22, athletic: 0.45, strong: 0.68 }[I.build.muscle] + (I.build.frame === 'broad' ? 0.08 : 0), 0, 0.8);
  const sh = fem ? { small: 0.93, medium: 0.92, broad: 0.9 }[I.build.frame] : { small: 0.84, medium: 0.82, broad: 0.84 }[I.build.frame] - (I.build.weight === 'heavy' ? 0.1 : I.build.weight === 'stocky' ? 0.04 : 0);
  C.shoulder = note('shoulder', sh, clamp(sh, fem ? 0.88 : 0.72, fem ? 0.95 : 0.86));
  C.slope = { drop: clamp((fem ? 0.009 : 0.011) + (age > 60 ? 0.004 : 0) + (I.build.weight === 'heavy' ? 0.003 : 0), 0.009, 0.016) };
  C.armSplay = clamp({ thin: 0, slim: 0, average: 2, stocky: 6, heavy: 10 }[I.build.weight] + (I.build.frame === 'broad' ? 2 : 0), 0, 12);
  C.headScale = clamp(age < 18 ? 1.015 : 1, 0.98, 1.03);

  /* the blend */
  const b = S.heritage.blend, raw = { african: b.african, asian: b.asian, caucasian: b.european }, tot = Object.values(raw).reduce((a, x) => a + x, 0) || 1;
  C.face = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, +clamp(v / tot, 0.03, 0.9).toFixed(3)]));
  { const t2 = Object.values(C.face).reduce((a, x) => a + x, 0); for (const k in C.face) C.face[k] = +(C.face[k] / t2).toFixed(3); }
  if (Object.keys(raw).some((k) => Math.abs(raw[k] / tot - C.face[k]) > 0.005)) log.push(`blend ${JSON.stringify(raw)} -> ${JSON.stringify(C.face)}`);

  /* the skin: photo atlases by heritage and age (the old/middle atlases are what made Mr. Big read real), a tint by tone */
  const dom = Object.entries(C.face).sort((a, c) => c[1] - a[1]), band = age < 33 ? 'young' : age < 55 ? 'middle' : 'old';
  const atlas = (eth, bnd) => (bnd === 'young' ? (eth === 'caucasian' && !fem ? 'caucasian' : eth) : eth + '-' + bnd);
  C.skins = {};
  const add = (k, w) => { C.skins[k] = +((C.skins[k] || 0) + w).toFixed(3); };
  // (the tone moves weight between the atlases: the photo skins carry the real colour; a tint alone only greys it)
  const toneDark = { 'very-light': -0.3, light: -0.15, 'light-medium': 0, medium: 0.25, tan: 0.45, brown: 0.65, 'dark-brown': 0.85, deep: 0.95 }[S.heritage.skin.tone];
  const sw = { ...C.face }; if (toneDark > sw.african) { const d = toneDark - sw.african, rest = sw.asian + sw.caucasian || 1; sw.asian -= d * sw.asian / rest; sw.caucasian -= d * sw.caucasian / rest; sw.african = toneDark; }
  else if (toneDark < 0) { const d = Math.min(sw.african, -toneDark * 0.5); sw.african -= d; sw.caucasian += d; }
  const dom2 = Object.entries(sw).sort((a, c) => c[1] - a[1]);
  for (const [eth, w] of dom2) { if (w < 0.12) continue; if (band === 'old') { add(atlas(eth, 'old'), w * 0.7); add(atlas(eth, 'middle'), w * 0.3); } else if (band === 'middle') { add(atlas(eth, 'middle'), w * 0.7); add(atlas(eth, 'young'), w * 0.3); } else add(atlas(eth, 'young'), w); }
  const T = S.heritage.skin, tone = { 'very-light': 1.06, light: 1.02, 'light-medium': 0.98, medium: 0.95, tan: 0.92, brown: 0.97, 'dark-brown': 1.04, deep: 1.08 }[T.tone];
  // (a darker atlas lifted in shade, as Knox's was 1.3x: dark skin read black in shaded streets; a lighter one held)
  const ut = { cool: [0.98, 1.0, 1.04], neutral: [1, 1, 1], warm: [1.04, 1.0, 0.95], olive: [0.99, 1.01, 0.93] }[T.undertone];
  const darkAtlas = (Math.max(C.face.african, toneDark) > 0.6) ? 1.15 : 1;
  C.skinTint = ut.map((u) => +clamp(u * tone * darkAtlas, 0.8, 1.35).toFixed(3));
  if (T.weathered) C.skinTint = [C.skinTint[0] * 1.03, C.skinTint[1] * 0.99, C.skinTint[2] * 0.97].map((x) => +clamp(x, 0.8, 1.35).toFixed(3));
  C.skinRough = T.weathered ? 0.64 : fem ? 0.58 : 0.6;
  const lips = { natural: null, rose: [1.0, 0.74, 0.76, 0.5], red: [1.05, 0.55, 0.55, 0.6], berry: [0.85, 0.55, 0.62, 0.6], nude: [1.0, 0.86, 0.8, 0.4] }[T.lipTint || 'natural'];
  if (lips && T.makeup !== 'none') C.lips = lips;
  // (G7a: natural lips framed by a beard or a moustache read pale peach against it (the old boss, round 6): a man's own
  // lip colour, a little deeper and rosier-brown than his skin)
  else if ((T.lipTint || 'natural') === 'natural' && S.facialHair?.style && !['none', 'stubble'].includes(S.facialHair.style)) C.lips = [0.9, 0.7, 0.68, 0.5];
  if (T.makeup === 'natural' || T.makeup === 'lipstick') C.lids = [0.8, 0.74, 0.76, 0.35];

  /* the face */
  const F = S.face || {};
  C.jaw = clamp({ soft: 0, average: 0.002, square: 0.0045, heavy: 0.006 }[F.jaw || 'average'], 0, 0.006);
  C.jowl = clamp({ hollow: 0, average: 0.001, full: 0.005, jowly: 0.009 }[F.cheeks || 'average'] + (I.build.weight === 'heavy' ? 0.002 : 0), 0, 0.011);
  // (forge v2: the face's words are MakeHuman's CC0 face targets (targets.mjs), each field capped 5 mm and all of them
  // 28 mm summed, 8 mm at any point (v2.5) on the shaped body (core applies the caps, where the millimetres can be measured); the v1 hand sculpts are
  // kept in core for a config that asks for them, but a sheet no longer does. Age brings its own: bags under the eyes,
  // the mouth's corners down a little, larger ears)
  const N = F.nose || {}, Ch = F.chin || {}, Mo = F.mouth || {}, Ea = F.ears || {}, Sk = F.skull || {};
  // (FC: the mouth's half-width at its corners (the opening's, measured by the talk gate on the anchors: 19-25 mm), for
  // the beard's clearing round it: v2.3's lens was 31-33 mm wide at every mouth, so bare skin showed past the corners)
  C.mouthHalf = { narrow: 0.0195, average: 0.0212, wide: 0.0232 }[Mo.width || 'average'] ?? 0.0212;
  const words = { noseWidth: N.width, noseLength: N.length, noseTip: N.tip, noseBridge: N.bridge, cheekbones: F.cheekbones, cheekVolume: F.cheeks, faceWidth: F.faceWidth,
    browRidge: F.browRidge, chin: Ch.projection, chinLength: Ch.length, chinWidth: Ch.width, chinCleft: Ch.cleft ? 'cleft' : 'none', eyeShape: F.eyeShape,
    eyeBags: F.eyeBags ?? (age >= 70 ? 'heavy' : age >= 50 ? 'light' : 'none'), mouthWidth: Mo.width, lips: Mo.lips, cupidsBow: Mo.cupidsBow,
    // (FC: the corners' word no longer defaults to 'down' with age, and 'down' is a hint (targets.mjs): MakeHuman's
    // angles-down at 0.55 under face.js's opening jaw read as a grimace in every talking frame (mechanic, Sal, cop))
    mouthCorners: Mo.corners ?? 'neutral', earSize: Ea.size ?? (age >= 66 ? 'large' : 'average'), earShape: Ea.shape, earAngle: Ea.angle,
    skull: Sk.shape, skullBack: Sk.back, forehead: F.forehead, eyeSpacing: F.eyeSpacing, jawWidth: F.jawWidth, faceLength: F.faceLength };
  const fr = faceRecipe(words, S.id);
  for (const u of fr.unknown) log.push('face word not in the library: ' + u);
  C.faceTargets = { fields: fr.fields }; C.sculpt = null;
  C.eyes = { 'dark-brown': 'brown', brown: 'brown', hazel: 'brownlight', blue: 'blue', 'grey-blue': 'blue' }[F.eyes || 'brown'];
  // (the MakeHuman brown iris is red-brown; deepened to a real brown, hazel greened, grey-blue cooled)
  C.iris = { 'dark-brown': [0.36, 0.26, 0.2], brown: [0.48, 0.33, 0.22], hazel: [0.62, 0.55, 0.32], blue: null, 'grey-blue': [0.55, 0.62, 0.68] }[F.eyes || 'brown'];

  /* hair */
  const HC = (c) => ({ black: [[6, 6, 7], [26, 24, 24], [62, 58, 56]], 'dark-brown': [[12, 9, 8], [44, 32, 26], [92, 70, 56]], brown: [[24, 16, 11], [72, 50, 34], [128, 96, 70]], 'light-brown': [[48, 34, 24], [112, 84, 60], [172, 140, 106]],
    auburn: [[36, 14, 8], [104, 44, 24], [164, 86, 52]], red: [[50, 16, 8], [140, 56, 28], [206, 118, 70]], 'dark-blonde': [[70, 52, 34], [140, 110, 76], [196, 166, 120]], blonde: [[110, 86, 56], [190, 160, 112], [236, 214, 170]],
    platinum: [[102, 96, 88], [164, 158, 147], [242, 239, 230]], 'salt-and-pepper': [[30, 29, 30], [96, 94, 96], [184, 182, 184]], grey: [[66, 63, 61], [132, 128, 124], [200, 196, 190]], silver: [[70, 70, 74], [150, 150, 154], [214, 214, 216]], white: [[140, 140, 142], [204, 204, 206], [244, 244, 244]] }[c] || [[20, 16, 14], [60, 46, 38], [120, 96, 80]]);
  let ramp = HC(S.hair.color);
  if (S.hair.greying) { const g = HC('grey'); ramp = ramp.map((s, i) => mix(s, g[i], clamp(S.hair.greying, 0, 1))); }
  // (forge v2.3, HB: brows matched as Mr. Big's are: their ramp a quarter of the way from the hair's root toward its middle,
  // to the middle (v2.2 took the root darker, so a grey man's brows read black-and-white); a bearded man's brows from his
  // beard's colours unless the sheet names theirs; and painted on the skin under the strip (CFG.browPaint), denser for
  // heavy brows)
  const bcol = F.brows?.color || (S.facialHair?.style && !['none', 'stubble'].includes(S.facialHair.style) ? S.facialHair.color : null) || S.hair.color;
  // (F6: brows go grey with the hair, a little behind it (the mechanic's auburn brows were red lines under his greying hair))
  let br = HC(bcol); if (S.hair.greying && !['grey', 'silver', 'white', 'salt-and-pepper', 'platinum'].includes(bcol)) { const g = HC('grey'); br = br.map((c, i) => mix(c, g[i], clamp(S.hair.greying * 0.6, 0, 1))); }
  // (FC, talking faces: the cards' ramp from the hair's middle a little toward its light (Mr. Big's grey cards read soft;
  // a black ramp from the root read as a pen line with a hook), and under them a soft painted brow (core.mjs paintBrows:
  // a feathered fill, no strokes; the skin's texels are half a millimetre, so strokes painted there read as stitches))
  const bw = F.brows?.weight || 'average';
  // (F6: brows soft and full as Mr. Big's and Jane's, each person's own. The painted mass under the cards wider (1.8x
  // for an average brow, 2.1x heavy: at 1x it lay wholly under the cards' strip and never showed) with softer edges, its arch (a woman's higher, a peak two thirds out), an older
  // man's tail let down a little, and a few per cent of each person's own variation by their id; a light brow (white,
  // grey, silver, platinum, blonde) painted and carded from its ramp's darker half, so it reads as pale hair on skin, not
  // a white bar (the veteran's), and fainter)
  const lightB = ['white', 'grey', 'silver', 'platinum', 'blonde'].includes(bcol), hb = (k) => { let h = 2166136261; for (const c of S.id + k) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0; return (h & 0xffff) / 65535; };
  C.hairRamp = ramp; C.browRamp = lightB ? [br[0].map((c) => Math.round(c * 0.85)), mix(br[0], br[1], 0.5)] : [mix(br[1], br[2], 0.12).map(Math.round), mix(br[1], br[2], 0.45).map(Math.round)];
  C.browPaint = { k: +({ fine: 1.5, average: 1.8, heavy: 2.1 }[bw] * (0.94 + 0.12 * hb('k'))).toFixed(3), a: +({ fine: 0.38, average: 0.48, heavy: 0.56 }[bw] * (age > 60 ? 0.85 : 1) * (lightB ? 0.75 : 1)).toFixed(3),
    col: lightB ? mix(br[0], br[1], 0.45) : mix(br[1], br[2], 0.3), arch: +((fem ? 0.0016 : 0.0006) + 0.0006 * (hb('a') - 0.5)).toFixed(5), droop: !fem && age > 60 ? 0.0009 : 0, soft: 1 };
  C.browAlpha = { fine: 0.36, average: 0.38, heavy: 0.4 }[bw] + 0.12; // (F6: the cards' cut higher: fewer, finer hairs over the soft mass, not a solid strip)
  const st = S.hair.style;
  // (forge v2 adds: bob-tucked (behind the ear), slicked, balding, locs; curls falls back to the short curly cards (the
  // library's curls are not built yet))
  const HM = fem ? { shaved: 'none', buzz: 'body:short02', short: 'short01', 'swept-back': 'short03', slicked: 'short03', 'short-curly': 'bob02', curls: 'bob02', bob: 'bob01', 'bob-tucked': 'bob01', long: 'long01', ponytail: 'ponytail01', 'single-braid': 'braid01', 'box-braids': 'long01', locs: 'long01', balding: 'short01', afro: 'body:afro01' }
    : { shaved: 'none', buzz: 'body:short02', short: 'body:short02', 'swept-back': 'body:short04', slicked: 'body:short04', 'short-curly': 'short01', curls: 'short01', bob: 'bob01', 'bob-tucked': 'bob01', long: 'long01', ponytail: 'ponytail01', 'single-braid': 'braid01', 'box-braids': 'long01', locs: 'long01', balding: 'body:short02', afro: 'body:afro01' };
  C.hair = HM[st] ?? 'none';
  if (st === 'shaved') C.shaved = { a: age > 50 ? 0.12 : 0.22, col: ramp[1].map((x) => Math.round(x * 0.7)) };
  if (st === 'buzz') C.shaved = { a: 0.35, col: ramp[1] };
  if (st === 'curls') { C.hair = 'none'; C.boxBraids = { ...BRAIDS.curls, colors: [ramp[0], ramp[1], ramp[2]] }; C.shaved = { a: 0.9, col: ramp[0].map((x) => Math.round(x * 1.2 + 6)) }; }
  if (st === 'box-braids' || st === 'locs') { C.hair = 'none'; C.boxBraids = { ...BRAIDS[st], colors: [ramp[0], ramp[1], ramp[2]] }; C.shaved = { a: 0.92, col: ramp[0].map((x) => Math.round(x * 1.3 + 8)), parts: BRAIDS[st].partLines }; }
  if (st === 'bob-tucked') { C.tuck = true; C.trimFringe = 0.018; }
  if (st === 'slicked') { C.slick = 0.42; C.shaved = { a: 0.55, col: ramp[0] }; }
  // (H5: balding is the horseshoe cropped close (painted and fur shells, Mr. Big's beard's make), not the short cut's cards
  // cut round the crown: their cut edges stood as pasted patches over the ears)
  // (G8b: a horseshoe's hairs 11 px long, not 9, and 45 % of the way from the scalp's paint to their own tone, not 55:
  // seen from behind, the old boss's and the mechanic's read as specks and dark scribbles (1.4 % specks, the old boss's
  // browser build 1.52 % in round 7))
  if (st === 'balding') { C.hair = 'none'; C.bald = { crown: age > 60 ? 0.055 : 0.07 }; C.shaved = { a: 0.62, col: mix(ramp[0], ramp[1], 0.6).map(Math.round), horseshoe: true }; C.fuzz = { layers: 3, depth: 0.0026, colors: [ramp[0], ramp[1], ramp[2]], grey: clamp(S.hair.greying ?? 0, 0, 1) * 0.5, len: 11, w: 0.8, lift: 0.75, contrast: 0.45 }; }
  // (a buzz is the scalp painted, no cards: a card cap that short reads as a helmet (the gates' helmet check))
  // (H5: and fur shells over it, 1.8 mm, short hairs along their growth: a buzz reads as hair at 2 m and in silhouette)
  if (st === 'buzz') { C.hair = 'none'; C.shaved = { a: 0.7, col: ramp[0].map((x, i) => Math.round((x + ramp[1][i]) / 2)), buzz: true }; C.fuzz = { layers: 3, depth: 0.0013, colors: [ramp[0], ramp[1], ramp[2]], grey: clamp(S.hair.greying ?? 0, 0, 1) * 0.5, len: 8, w: 0.8, lift: 0.75, contrast: 0.55 }; }
  // (short card cuts tousled, so they read as hair, not a shell: the gates' helmet check)
  if (['short01', 'short02', 'short03', 'short04', 'bob02'].includes(C.hair)) C.hairTousle = { amp: 0.018, size: 0.024 };
  if (C.hair !== 'none' && !C.hair.startsWith('body:')) { C.hairCut = 0.32; C.hairAlpha = 0.3; C.hairNormal = 3.2; C.hairRough = 0.45; }
  if (st === 'slicked') { C.hairRough = 0.3; C.hairNormal = 4.5; }
  if (C.hair === 'bob02') C.trimFringe = 0.016;
  if (C.hair === 'ponytail01') C.tail = { puff: 1.25, turn: 0.38, copies: 2 };
  // (forge v2.3, HB: six more styles at the cast's quality (Jane's long hair, Fiona's ponytail: the pack's cards, their
  // relief and cut-out, the scalp painted the hair's colour under them, scalp), or made for the head (the afro's coil
  // shells, the twists, the bun's coiled ropes; library.mjs HAIR_STYLES))
  const HS = HAIR_STYLES[st];
  if (HS) {
    const scalp = { col: ramp[1], root: ramp[0], reach: 0.006 };
    if (st === 'afro') { C.hair = 'none'; C.afro = { ...HS, size: fem ? HS.size : HS.size * 0.85, colors: [ramp[0], ramp[1], ramp[2]] }; C.shaved = { a: 0.92, col: ramp[0].map((x) => Math.round(x * 1.2 + 6)) }; }
    if (st === 'short-twists') { C.hair = 'none'; C.boxBraids = { ...HS, colors: [ramp[0], ramp[1], ramp[2]] }; C.shaved = { a: 0.92, col: ramp[0].map((x) => Math.round(x * 1.3 + 8)), parts: true }; }
    if (st === 'side-part') { C.hair = 'short01'; C.sidePart = { x: HS.x, sweep: fem ? HS.sweepF : HS.sweep }; C.scalp = { ...scalp, reach: 0.01 }; C.slick = HS.slick; }
    if (st === 'long-straight') { C.hair = 'long01'; C.scalp = scalp; C.trimFringe = HS.fringe; C.faceClear = HS.clear + (fem ? 0 : 0.009); }
    if (st === 'high-ponytail') { C.hair = 'ponytail01'; C.tail = { puff: fem ? 1.3 : 1.15, turn: 0.38, copies: 2, high: fem ? HS.high : HS.high * 0.75 }; C.scalp = scalp; }
    // (G7c: under a bun's slicked-back hair the scalp's paint 1.2 cm past the cards and down the nape: at 6 mm, painted
    // per skin point, it stopped on the skin's triangle edges (a stepped hairline at the temple) and not at all below the
    // ears (a hard edge at the nape; the chef, round 6))
    if (st === 'bun') { C.hair = 'ponytail01'; C.tail = { puff: 1, turn: 0, copies: 0 }; C.bun = { ...HS, colors: [ramp[0], ramp[1], ramp[2]] }; C.scalp = { ...scalp, reach: 0.012, nape: 0.11 }; }
    if (C.hair !== 'none') { C.hairCut = 0.32; C.hairAlpha = 0.3; C.hairNormal = 3.5; C.hairRough = 0.42; }
  }

  // (H5: every card cut drawn as strands (hairline.mjs: Jane's hair2 for the library), its hairline thinned to single
  // strands and laid on the skin, the scalp under it painted the hair's colour with a ragged edge) (G8b: the bare band
  // the front edge thins toward runs back to 10 cm behind the eyes, to the front of the ear: the temple's cards stopped
  // short of it and kept a hard, stepped edge)
  if (C.hair !== 'none' && !C.hair.startsWith('body:')) { C.hairStrands = { fw: 0.014, d0: 0.002, hl: 0.35, normal: 2.2, hug: 0.002, hugW: 0.012, bandZ: 0.1 }; C.scalp = C.scalp || { col: ramp[1], root: ramp[0], reach: 0.008 }; C.hairRough = 0.62; }

  /* facial hair (men or anyone the sheet gives it to) */
  const FH = S.facialHair, fc = HC(FH.color || S.hair.color), dens = clamp(FH.density ?? 0.85, 0.1, 1);
  // (forge v2.2: the grooms are hair cards (library.mjs GROOMS) over the painted beard; stubble stays paint)
  const GROOM = { 'short-boxed': 'boxed', 'full-trimmed': 'boxed', full: 'fullgrown', goatee: 'goatee', moustache: 'moustache', 'chin-strap': 'chinstrap' }[FH.style];
  // (H5: stubble a 5 o'clock shadow with short strokes over it (core.mjs paintStubbleTex) and two shells 0.9 mm out, so
  // the jaw's edge reads rough at 2 m; salt-and-pepper a share of light hairs)
  if (FH.style === 'stubble') { const sp = ['salt-and-pepper', 'grey', 'silver', 'white'].includes(FH.color);
    // (F6: lighter, cooler, shorter, with a soft cheek line: H5's read as a brown mask (shadow 0.3, the hair's own warm
    // middle) with a hard ragged top across the cheek. Now the shadow is the skin taken toward a blue-grey (cool), about
    // half as strong; the hairs 1.2 mm and fainter; the area feathered 10 times (about 1.5 cm at the cheek) and the
    // shell's dots fainter)
    C.beard = { style: 'stubble', a: clamp(0.1 + 0.13 * dens, 0.08, 0.22), cool: [0.6, 0.66, 0.8], mid: mix(fc[1], [96, 104, 116], 0.35).map((x) => Math.round(x * 0.55)), light: mix(fc[2], [190, 192, 196], 0.3).map(Math.round), grey: sp ? 0.35 : 0.04, dens, feather: 10, hair: 0.24, len: 1.2 };
    C.shells = { style: 'stubble', layers: 1, depth: 0.0005, alpha: [0.45], shade: [0.9], tex: 2048, len: 1.6, grey: sp ? 0.3 : 0.03, taper: 0.9, cols: [mix(fc[0], [70, 76, 86], 0.25).map(Math.round), mix(fc[1], [110, 116, 126], 0.3).map(Math.round)] }; }
  // (F6: a full beard made exactly as Mr. Big's is (MogCity build-man.mjs, the A): his cheek line (not the grown-out
  // one), his painted beard (strength 0.94, 2.8 mm deep) and 4 shells to 7.5 mm with his short 1 x 3 px strokes,
  // silver for a grey or white beard, no cards. H5's 5 shells to 9.5 mm under 11 mm cards were a steel-wool mass half as
  // big again as his, with no grain)
  else if (FH.style === 'full') { const sil = ['silver', 'white', 'grey'].includes(FH.color);
    // (G7c: its outline about a fifth smaller, toward Mr. Big's silhouette: on the old boss's wide, jowly face his cheek
    // line ran high up the cheek and back to the ear, and 7.4 mm of shells made it puffy. The cheek line 5 mm lower and
    // flatter, 1 cm further from the ear, the shells to 6 mm)
    C.beard = { style: 'full', col: fc[2], mid: fc[1], root: fc[0], a: clamp(0.74 + 0.22 * dens, 0.6, 0.94), depth: 0.0024, grey: sil ? 0.5 : 0.15, len: 16, feather: 2, trim: { lift: 0.009, slope: 0.52, ear: 0.062 } };
    C.shells = { style: 'mrbig', layers: 4, depth: +(0.006 * (0.8 + 0.2 * dens)).toFixed(4), alpha: [1, 0.86, 0.74, 0.62], shade: [0.55, 0.72, 0.86, 1], tex: 2048, taper: 0.55, cols: sil ? null : [fc[1], fc[2]] }; }
  else if (GROOM && !globalThis.process?.env?.FORGE_SHELL_BEARDS) {
    C.beard = { style: GROOM, col: fc[2], mid: fc[1], root: fc[0], a: clamp(0.35 + 0.4 * dens, 0.3, 0.8), depth: GROOM === 'fullgrown' ? 0.0025 : 0.0012, grey: ['silver', 'white', 'grey', 'salt-and-pepper'].includes(FH.color) ? 0.5 : 0.15, len: 16, feather: 2 };
    C.cards = { groom: GROOM === 'fullgrown' ? 'full' : GROOM, grey: ['salt-and-pepper'].includes(FH.color) ? 0.35 : 0.1, seed: [...S.id].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0 };
    // (forge v2.3, HB: under the cards, Mr. Big's shells: the beard's body (silver strokes for a grey beard, else each
    // stroke between the beard's middle and light), 3-5 layers by the groom, deeper for a denser beard)
    const GS = GROOMS[C.cards.groom].shells, nl = GS.layers, lay = (a, b) => Array.from({ length: nl }, (_, i) => +(a + (b - a) * i / Math.max(1, nl - 1)).toFixed(3));
    // (H5: the shells' strands along the growth, clumped, the outline tapered over 80 % of the area's edge and lumpy by
    // a quarter of the depth; 15 % shallower (the old boss's read as a fur ball); a white or grey beard's colours from its
    // own ramp (root to light), not one silver)
    C.shells = { style: 'strokes', layers: nl, depth: +(GS.depth * 0.85 * (0.75 + 0.25 * dens)).toFixed(4), alpha: lay(1, 0.55), shade: lay(0.55, 1), tex: 2048, taper: C.cards.groom === 'moustache' ? 0.95 : 0.8, clump: 0.25, len: C.cards.groom === 'moustache' ? 6 : 8,
      cols: ['silver', 'white', 'grey'].includes(FH.color) ? [mix(fc[0], fc[1], 0.45), mix(fc[1], fc[2], 0.55)] : [mix(fc[0], fc[1], 0.7), mix(fc[1], fc[2], 0.6)], grey: ['salt-and-pepper', 'grey', 'silver'].includes(FH.color) ? 0.3 : 0.08 };
    // (F6: a moustache groomed, not a block: the cop's black one was one solid mass (dark shells on a 0.67 painted base
    // of the roots' colour). Now the paint under it about half (skin between the strands), the shells' strands with gaps
    // between them (gap), each strand from its root's dark to a lifted tip (a black moustache's sheen, a white one's
    // grey roots, never pure white))
    if (C.cards.groom === 'moustache') { const lt = ['silver', 'white', 'grey'].includes(FH.color);
      C.beard.a = clamp(0.18 + 0.2 * dens, 0.15, 0.4); C.shells.gap = 0.24; C.shells.clump = 0.35;
      C.shells.cols = lt ? [mix(fc[0], fc[1], 0.15), mix(fc[1], fc[2], 0.3)] : [mix(fc[0], fc[1], 0.8), mix(fc[2], [140, 130, 122], 0.35)];
      // (G7b: from the front the cop's black one still read thick and dark and the veteran's white one a bright cotton
      // wedge: fewer, shorter cards by the sheet's density, the shells three quarters as deep, and a white or silver one
      // an old man's: its cards' and shells' ramp taken a fifth toward a warm grey and down (no strand brighter than 200),
      // so it reads as hairs over skin, not as a lit white mass)
      C.cards.tune = { density: +(GROOMS.moustache.density * (0.5 + 0.3 * dens)).toFixed(1), len: +(GROOMS.moustache.len * (0.8 + 0.1 * dens)).toFixed(4) };
      C.shells.depth = +(C.shells.depth * 0.75).toFixed(4);
      if (lt) { const old = (c) => mix(c, [150, 140, 128], 0.2).map((x) => Math.round(Math.min(200, x * 0.84)));
        C.beard.root = old(fc[0]); C.beard.mid = old(fc[1]); C.beard.col = old(fc[2]); C.shells.cols = C.shells.cols.map(old); } }
  }
  else if (FH.style !== 'none') {
    C.beard = { style: { moustache: 'moustache', goatee: 'goatee', 'full-trimmed': 'full', 'short-boxed': 'full', full: 'full', 'chin-strap': 'full' }[FH.style], col: fc[2], mid: fc[1], root: fc[0], a: clamp(0.6 + 0.35 * dens, 0.4, 0.95), depth: clamp(0.0015 + 0.0015 * dens, 0.001, 0.003), grey: 0.4, len: 16, feather: 2 };
    C.shells = { style: 'strokes', layers: FH.style === 'moustache' ? 4 : 4, depth: clamp(FH.style === 'moustache' ? 0.0055 : 0.0075 * dens, 0.003, 0.008), alpha: [1, 0.86, 0.74, 0.62], shade: [0.55, 0.72, 0.86, 1], tex: 2048,
      cols: ['silver', 'white', 'grey'].includes(FH.color) ? null : [fc[1], fc[2]] };
  }

  /* the wardrobe */
  const W = S.wardrobe, top = W.top, bot = W.bottom, c3 = (g, d) => hex(g?.color, d), lin3 = (c) => c.map((x) => +(lin(x) / lin(200)).toFixed(3));
  C.wear = [];
  const skinRGB = mix([150, 110, 90], [92, 62, 48], C.face.african);
  const BOT = fem ? { jeans: ['female_casualsuit01', 'tex'], 'ripped-jeans': ['female_casualsuit01', 'tex'], trousers: ['female_sportsuit01', 'bake'], 'track-pants': ['female_sportsuit01', 'tex'], skirt: ['female_elegantsuit01', 'bake'] }
    : { jeans: ['male_casualsuit06', 'tex'], 'ripped-jeans': ['male_casualsuit06', 'tex'], trousers: ['male_casualsuit06', 'bake'], 'track-pants': ['male_casualsuit06', 'bake'], 'suit-trousers': ['male_elegantsuit01', 'suit'] };
  // (forge v2: the library's garments (library.mjs), authored on the body: the chef's jacket, the doorman's and uniform
  // coats, the overcoat, the hoodie, loose trousers. Every cloth colour through the colour guard (colour.mjs): a colour
  // that would drift out of its family under a warm or cool light has its chroma taken down until it holds)
  const G = (g, d) => { const w = capWhite(c3(g, d)); if (w.changed) log.push(`white cap ${g?.color || 'default'} -> #${w.rgb.map((x) => x.toString(16).padStart(2, '0')).join('')}`); const c = w.rgb, r = guard(c); if (r.changed) log.push(`colour guard ${g?.color || 'default'} -> #${r.rgb.map((x) => x.toString(16).padStart(2, '0')).join('')}`); return '#' + r.rgb.map((x) => x.toString(16).padStart(2, '0')).join(''); };
  const LIBTOP = { 'chef-jacket': 3, 'doorman-coat': 5, 'uniform-jacket': 3, hoodie: 3, overcoat: 5, 'puffer-coat': 4 };
  C.lib = [];
  const libTop = LIBTOP[top.item] != null, suitTop = top.item === 'suit-jacket' || top.item === 'suit-jacket-db';
  // the bottom
  if (bot.item === 'loose-trousers') C.lib.push({ item: 'loose-trousers', color: G(bot, [52, 50, 52]), layer: 1.2 });
  else if (suitTop && !fem) { C.wear.push(['male_elegantsuit01', 'all', [1, 1, 1], 'suit']); C.suit = { navy: c3(top, [26, 36, 66]), tie: hex(top.accent, [20, 18, 20]) }; }
  else if (top.item === 'overalls' && !fem) { C.wear.push(['male_worksuit01', 'all', [1, 1, 1], 'overalls']); C.overalls = { navy: c3(top, [34, 44, 74]), tee: [200, 200, 196] }; }
  else if (bot.item === 'suit-trousers' && !fem) { C.wear.push(['male_elegantsuit01', 'bottom', [1, 1, 1], 'suit']); C.suit = { navy: c3(bot, c3(top, [26, 36, 66]).map((x) => Math.round(x * 0.8))), tie: [20, 18, 20] }; }
  else {
    const [bf, bm] = BOT[bot.item] || BOT.trousers, bopt = {};
    if (bot.item === 'ripped-jeans') bopt.rips = [{ side: 'L', at: 'lowerleg01', dy: 0.01, rx: 0.045, ry: 0.024, seed: 1 }, { side: 'R', at: 'lowerleg01', dy: 0.03, rx: 0.035, ry: 0.016, seed: 2 }, { side: 'R', at: 'upperleg02', dy: -0.04, dx: 0.0, rx: 0.025, ry: 0.012, seed: 3 }];
    if (bopt.rips) bopt.skinRGB = skinRGB;
    // (denim's printed blue a little faded (x0.75 chroma): it keeps its family under a warm light (colour.mjs), as worn denim does)
    if (/jeans/.test(bot.item)) bopt.desat = 0.25;
    C.wear.push([bf, 'bottom', [1, 1, 1], bm, { ...bopt, tint: lin3(hex(G(bot, [40, 40, 44]))), floor: 0.3 }]);
  }
  // the top
  if (libTop) {
    // (MV: a puffer's nylon held under OKLCH chroma 0.09: a saturated orange-red puffer read as moulded plastic, GR)
    const topCol = top.item === 'puffer-coat' ? capChroma(G(top, [60, 60, 66]), 0.09, log) : G(top, top.item === 'chef-jacket' ? [238, 238, 234] : [60, 60, 66]);
    C.lib.push({ item: top.item, color: topCol, accent: top.accent || null, fit: top.fit || 'regular', layer: LIBTOP[top.item], apron: (W.over || []).some((o) => o.item === 'apron'),
      // (HD: the top told what is worn with it: no neckband under a hood worn up, no tall collar under a scarf)
      hoodUp: (W.headwear?.item || 'none') === 'hood-up' || undefined, scarf: (W.over || []).some((o) => o.item === 'scarf') || undefined });
    // (an overcoat as the top: a shirt under it, seen at the collar)
    if (top.item === 'overcoat') C.wear.push([fem ? 'female_casualsuit01' : 'male_casualsuit06', 'top', [1, 1, 1], 'bake', { tint: lin3(hex(top.accent, [214, 212, 206])), floor: 0.5 }]);
    if (top.item === 'hoodie') C.hood = { extra: top.fit === 'oversized' ? 0.016 : 0.011, color: hex(G(top, [70, 72, 78])).map((x) => Math.round(x * 0.92)), r: 0.036, drop: 0.035, stringColor: hex(top.accent, [230, 230, 226]) };
  } else if (!suitTop && top.item !== 'overalls') {
    if (top.item === 'puffer-coat') { C.wear.push([fem ? 'female_casualsuit01' : 'male_casualsuit06', 'top', [1, 1, 1], 'bake', { tint: lin3(hex(top.accent, [58, 54, 52])), floor: 0.5 }]); C.wear.push([fem ? 'female_elegantsuit01' : 'male_casualsuit01', 'top', [1, 1, 1], 'puffer']); C.puffer = { loft: 0.014, amp: 0.013, pitch: 0.085, sleevePitch: 0.07, white: hex(G(top, [200, 30, 36])), smooth: 10, cutCollar: 0.02, stand: { from: 0.03, h: 0.06, gap: 0.018 } }; }
    // (G7c: a plain top is cotton: its folds' light capped at 1.08 x its middle and a heathered grain (core.mjs garment))
    else C.wear.push([fem ? 'female_casualsuit01' : 'male_casualsuit06', 'top', [1, 1, 1], 'bake', { tint: lin3(hex(G(top, [200, 200, 196]))), floor: 0.4, hi: 1.08, heather: 0.05 }]);
  }
  // (forge v2.2: a suit's jacket is the library's (cut from the body, lapels, natural shoulders) over the base suit's shirt,
  // tie and trousers; a woman's over a plain shirt)
  if (suitTop) { if (fem) C.wear.push(['female_casualsuit01', 'top', [1, 1, 1], 'bake', { tint: lin3(hex(top.accent2 || null, [226, 226, 222])), floor: 0.5 }]);
    // (C5: over the base suit's shirt, whose collar is kept only in the V (core.mjs), the jacket's collar sits closer on the neck)
    C.lib.push({ item: top.item, color: G(top, [38, 40, 48]), pattern: top.pattern || 'plain', fit: top.fit || 'regular', layer: 3, ...(fem ? {} : { collarGap: 0.003 }) }); }
  for (const o of W.over || []) if (o.item === 'overcoat' && !libTop) C.lib.push({ item: 'overcoat', color: G(o, [60, 60, 66]), accent: o.accent || null, layer: 5 });
  for (const o of W.over || []) if (o.item === 'apron') C.apron = { len: fem ? 0.5 : 0.56, width: fem ? 0.36 : 0.4, curve: 5, color: c3(o, [236, 236, 232]), check: o.pattern === 'check' ? { a: c3(o, [40, 64, 120]), b: hex(o.accent, [236, 236, 232]), size: 0.022 } : null, band: hex(o.accent, null) || null, gap: 0.014, ties: true };
  const hw = W.headwear?.item || 'none';
  // (forge v2.2: the hood up (a hoodie's, or a hood on its own over any top), and a knit scarf over everything; the hair
  // under a hood is the scalp's shadow only, so no card comes through it)
  if (hw === 'hood-up') { C.lib.push({ item: 'hood-up', color: G(top.item === 'hoodie' ? top : W.headwear, [70, 72, 78]), layer: 4 }); C.hood = null; C.hair = 'none'; C.boxBraids = null; C.hairTousle = null; C.shaved = { a: 0.6, col: ramp[0] }; }
  for (const o of W.over || []) if (o.item === 'scarf') C.lib.push({ item: 'scarf', color: G(o, [150, 40, 44]), accent: o.accent || null, layer: 6 });
  if (hw === 'knit-beanie') C.cap = { make: true, style: 'beanie', color: c3(W.headwear, [180, 30, 36]).map((x) => +(lin(x)).toFixed(3)), front: 0.032, back: -0.02, side: 0.0, off: 0.008, slouch: 0.016, cuff: 0.048, ribs: 72, pom: W.headwear.pattern === 'stripe' ? 0.03 : 0, knit: true };
  else if (hw === 'peaked-cap') C.cap = { make: true, style: 'peaked', color: c3(W.headwear, [92, 18, 32]).map((x) => +(lin(x)).toFixed(3)), band: hex(W.headwear.accent, [176, 136, 52]).map((x) => +(lin(x) * 0.8).toFixed(3)), front: 0.042, back: 0.014, side: 0.012, off: 0.007, crown: 0.05, flare: 0.016, bandH: 0.02, brimLen: 0.036, brimSpan: 0.86, pitch: 0.55, rough: 0.72 };
  else if (hw === 'ball-cap') C.cap = { make: true, style: 'ball', color: c3(W.headwear, [20, 26, 48]).map((x) => +(lin(x)).toFixed(3)) };
  // (forge v2.3, SH: work boots and sneakers are the library's rigid shoes (shoes.mjs: a last round the foot, a sole, laces,
  // on the foot bone alone); FORGE_PACK_SHOES=1 the pack's. A man's dress shoes (the oxford) are built but opt in with
  // FORGE_LIB_DRESS=1: under a suit's long trousers they fail the cloth gate (the hem over the laces), so not anchor-ready)
  const LIBSHOE = { 'work-boots': 'work-boots', boots: 'work-boots', sneakers: 'sneakers', 'white-sneakers': 'sneakers', 'skate-shoes': 'sneakers', ...(fem || !globalThis.process?.env?.FORGE_LIB_DRESS ? {} : { dress: 'dress-shoes' }) }[W.shoes.item];
  if (LIBSHOE && !globalThis.process?.env?.FORGE_PACK_SHOES) { C.lib.unshift({ item: LIBSHOE, color: W.shoes.color ? G(W.shoes, [0, 0, 0]) : null, accent: W.shoes.accent || null, layer: 1.5 }); C.shoes = 'none'; } else
  C.shoes = { dress: 'shoes03', boots: 'shoes02', 'work-boots': 'shoes02', 'work-shoes': 'shoes04', loafers: 'shoes01', 'white-sneakers': 'shoes05', sneakers: 'shoes06', 'skate-shoes': 'shoes06' }[W.shoes.item] || 'shoes04';
  C.shoesTint = W.shoes.color ? hex(W.shoes.color).map((x) => +(x / 160).toFixed(2)) : [1, 1, 1];

  /* the mouth: always teeth (found lips -> placed); the props for the runtime */
  C.teeth = true; C.teethScale = fem ? 0.96 : 1; C.teethTone = age > 60 ? [222, 212, 188] : [232, 224, 206];
  C.props = (S.props || []).map((p) => ({ kind: p.kind === 'round-glasses' ? 'glasses' : p.kind, round: p.kind === 'round-glasses', color: p.color }));
  C.motion = { idle: S.posture.idle || 'idle', walk: S.posture.walk || (S.posture.pace === 'quick' ? 'walk' : 'walk'), rate: { slow: 0.9, steady: 1, quick: 1.12, restless: 1.06 }[S.posture.pace] };
  C.voice = S.voice;
  return { cfg: C, log };
}

// (the CLI, Node only: the module itself runs in a creator's browser too, FB)
if (globalThis.process?.argv?.[1]?.endsWith('compile.mjs')) {
  const { default: fs } = await import('node:fs');
  const [sheetF, outDir] = process.argv.slice(2), S = JSON.parse(fs.readFileSync(sheetF, 'utf8')), { cfg, log } = compile(S);
  fs.mkdirSync(outDir, { recursive: true }); fs.writeFileSync(`${outDir}/${S.id}.cfg.json`, JSON.stringify(cfg, null, 1));
  console.log(JSON.stringify({ id: S.id, clamps: log }));
}
