// Jensen, hair round 1 (19 Nov; the critic, five rounds on: the sculpted clump shells read as a grooved HELMET whatever
// the grooves did): the technique changed. His hair is now built from alpha-tested hair CARDS, the way a game's groom is:
// layered strips cut from a strand atlas (parts/hair-strands.webp, from POLYTRICITY's "Hair Cards_FBX", CC BY 4.0, see
// hairatlas.mjs and CREDITS.md), each strip's strands with their own alpha and tapering tips, laid along a groomed flow
// over a low, darker shell (clumps.mjs with shellK, the old dome only: the mid-grey under the hair and the scalp's cover).
//   hairCardsPass(doc, shell, K)   shell: what hairClumpsPass returns (the skull's centre and the scalp by direction)
// The groom: thick and full, swept up and back off the forehead and a little across to his right; a taller, rounder
// front swoop of four big locks lifted apart with gaps (the darker shell shows in them); full over the ears, the back
// combed down to the nape; near-white on top, cool mid-grey lowlights underneath, at the temples and the nape; a soft,
// irregular silhouette with a few wavy flyaways. Material 'hair' (alpha MASK, double-sided, the atlas's grey times the
// card's vertex colour): Mog City's story runner (storyrun/polish.js) draws a 'hair' material as hair (alpha to coverage
// under MSAA, Kajiya-Kay strands along the flow, the volume's light); every point rides the head bone.
import fs from 'node:fs';
import { sm, clamp } from '../young-hero/glb.mjs';

const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const lerp = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);
const D2R = Math.PI / 180;
// the atlas's strips (pixels of the 4096 source sheet: x0, x1, the tip's row; the roots at row ~3990): 0-2 wide dense
// clumps, 3-4 narrower tapered clumps, 5 one tapered lock, 6-9 shorter tapered clumps, 10-12 single wavy strands
const STRIPS = [[80, 467, 90], [524, 835, 151], [887, 1198, 139], [1252, 1547, 43], [1612, 1897, 54], [1978, 2257, 122],
  [2336, 2612, 1596], [2697, 2981, 2002], [3068, 3345, 1896], [3425, 3685, 2131], [3756, 3793, 1841], [3830, 3861, 849], [3954, 3978, 1041]];
const ROOT = 3988 / 4096;

export function hairCardsPass(doc, shell, K = {}) {
  K = { atlas: null, cut: 0.5, rough: 0.72, seed: 7, n: 1150, part: 44,
    // colours (linear): the near-white top, the cool mid-grey and the deep lowlight under it
    top: [0.68, 0.69, 0.73], mid: [0.27, 0.285, 0.325], low: [0.1, 0.11, 0.14], jit: [0.8, 1.06],
    // the mass: the cards' height over the scalp, a multiple of the mass's thickness (clumps.mjs thick), by layer
    lay: [0.5, 1.02], front: 0.022, frontW: 0.5, lockLift: 0.018, sideFlat: 0.2, backFlat: 0.5, sideAdd: 0.009, twist: 9, normalVol: 0.65, bury: 0.006,
    locks: null, flyaways: 6, ...K };
  if (!shell?.scalp) throw new Error('hairCards: needs the shell (hairClumpsPass with its scalp)');
  const C = shell.C, R = doc.getRoot();
  let seed = K.seed; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647), rr = (a, b) => a + (b - a) * rnd();
  const scalp = (d) => shell.scalp(d);
  const phi = (d) => Math.atan2(d[0], d[2]) / D2R; // 0 at the front, + his left
  // ---- the flow over the head: up and back over the top (a little across to his right), back and down over the
  // sides and the ears, down the back; beyond the part on his left, back and down toward his left ear
  const flow = (d) => { const wy = sm(-0.05, 0.55, d[1]), side = sm(0.35, 0.85, Math.abs(d[0])), back = sm(0.0, -0.6, d[2]);
    const p = phi(d), beyond = sm(K.part - 4, K.part + 6, p) * sm(0.2, 0.55, d[1]);
    let top = [-0.24, 0.05, -1]; top = lerp(top, [0.55, -0.35, -0.75], beyond);
    const sd = [0.22 * Math.sign(d[0]), -0.62, -0.75], bk = [0.05 * Math.sign(d[0]), -1, -0.18];
    let v = lerp(lerp(sd, bk, back * (1 - side * 0.5)), top, wy);
    if (dot(v, d) !== 0) v = add(v, d, -dot(v, d));
    return norm(v); };
  // the cards' height over the scalp at d for a layer (0 inner .. 1 outer): the mass's thickness, the front lifted
  const massH = (d, s) => s.T * s.f;
  const pos = [], nrm = [], col = [], uvs = [], tan = [], idx = [];
  let ncard = 0, ntri = 0;
  const shellH = (s) => s.T * (shell.shellK ?? 0.55) * s.f;
  // ---- one card: a strip of the atlas laid along a strand (points P[] with their radial direction D[])
  const card = (P, D, strip, w0, colour, o = {}) => {
    const m = P.length; if (m < 3) return;
    // (a window of the strip, not all of it: the strands drawn larger on the card, so they still read at a distance)
    const [x0, x1, ty] = STRIPS[strip], win = strip >= 10 ? 1 : (o.win ?? rr(0.45, 0.7)), c0 = x0 + (x1 - x0) * rr(0, 1 - win), u0 = c0 / 4096, u1 = (c0 + (x1 - x0) * win) / 4096, vT = ty / 4096;
    const base = pos.length / 3, tw = (o.twist ?? rr(-K.twist, K.twist)) * D2R, taper = o.taper ?? 0.35, arch = o.arch ?? 0.12;
    // (arc length, for the texture's run root -> tip)
    const L = [0]; for (let i = 1; i < m; i++) L.push(L[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1], P[i][2] - P[i - 1][2]));
    const len = L[m - 1] || 1;
    for (let i = 0; i < m; i++) {
      const t = L[i] / len, a = P[Math.max(0, i - 1)], b = P[Math.min(m - 1, i + 1)], T = norm([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
      let B = norm(cross(T, D[i])); if (!Number.isFinite(B[0])) B = [1, 0, 0];
      // (the card turned about its run by its twist: cards that are not all flat on the mass catch the light apart)
      const tws = tw * (0.4 + 0.6 * t), TB = cross(T, B); B = norm(add(B.map((x) => x * Math.cos(tws)), TB, Math.sin(tws)));
      let N = norm(cross(B, T)); if (dot(N, D[i]) < 0) N = N.map((x) => -x);
      const Nv = norm(lerp(N, D[i], K.normalVol));
      const w = w0 * (1 - taper * t);
      for (const x of [-1, 0, 1]) {
        const q = add(add(P[i], B, (x * w) / 2), N, (1 - x * x) * w * arch);
        pos.push(...q); nrm.push(...Nv); tan.push(...T, 1);
        uvs.push(u0 + ((u1 - u0) * (x + 1)) / 2, ROOT + (vT - ROOT) * t);
        col.push(...colour(t, x), 1);
      }
    }
    for (let i = 0; i < m - 1; i++) for (let j = 0; j < 2; j++) { const a = base + i * 3 + j, b = a + 1, c = a + 3, dd = c + 1; idx.push(a, c, b, b, c, dd); ntri += 2; }
    ncard++;
  };
  // ---- grow a strand from a root direction: steps of ~3 mm along the flow (turned toward a bias and bent by a curl),
  // its height rising off the scalp to its layer's share of the mass, lifted further where it is a front lock
  const grow = (d0, len, layer, o = {}) => {
    const P = [], D = []; let d = norm(d0), t0 = null; const ds = 0.003, n = Math.max(4, Math.round(len / ds));
    const curl = o.curl ?? rr(-6, 6), bias = o.bias ? norm(o.bias) : null, lift = o.lift ?? 0, liftL = o.liftL ?? 0.02;
    for (let i = 0; i <= n; i++) {
      const s = scalp(d); if (!s) break; if (s.e < (i ? -(o.past ?? 0.006) : 0.0005)) break;
      const sl = i * ds, rise = 1 - Math.exp(-sl / (o.rise ?? 0.007));
      // (the sides and the back lie flatter: the volume is on top and in the swoop)
      const flat = (1 - K.sideFlat * sm(0.45, -0.1, d[1])) * (1 - K.backFlat * sm(-0.15, -0.75, d[2]));
      let h = massH(d, s) * (K.lay[0] + (K.lay[1] - K.lay[0]) * layer) * flat * rise;
      h += lift * rise * (1 - (o.drop ?? 0.55) * sm(liftL, liftL * 3.2, sl));
      // (fuller at the temples and over the ears: the hair's silhouette a little wider than the face there)
      h += K.sideAdd * rise * sm(0.5, 0.85, Math.abs(d[0])) * sm(-0.35, 0.05, d[1]) * sm(0.6, 0.25, d[1]) * sm(-0.7, -0.2, d[2]);
      // (the tip settles onto the hair under it)
      h *= 1 - 0.18 * sm(0.75, 1, i / n);
      // (the root buried in the shell: a card's cut root edge never shows; past it, the card stays over the shell)
      const sh = shellH(s), bury = sm(0, K.bury, sl);
      h = Math.max(h, sh + 0.0007) * bury + (sh - 0.0025) * (1 - bury);
      if (s.e < 0) h = Math.max(h, 0.0004);
      P.push(add(C, d, s.r + h)); D.push(d);
      let f = flow(d); if (bias) f = norm(lerp(f, add(bias, d, -dot(bias, d)), o.biasK ?? 0.7));
      if (t0) f = norm(lerp(t0, f, 0.35));
      // (a slow curl about the radial: the strands wander a little, never ruler-straight)
      const ca = curl * D2R * 0.12, side = norm(cross(d, f)); f = norm(add(f.map((x) => x * Math.cos(ca)), side, Math.sin(ca)));
      t0 = f; d = norm(add(d, f, ds / 0.1));
    }
    // (every other point: 6 mm segments are smooth enough for a card and halve its triangles)
    const keep = P.map((_, i) => i).filter((i) => i % 2 === 0 || i === P.length - 1);
    return { P: keep.map((i) => P[i]), D: keep.map((i) => D[i]) };
  };
  const colourOf = (d0, layer, o = {}) => {
    const temple = sm(0.55, 0.85, Math.abs(d0[0])) * sm(0.55, 0.1, d0[1]), nape = sm(-0.2, -0.65, d0[2]) * sm(0.35, -0.2, d0[1]);
    const under = 1 - layer, lowK = clamp(0.55 * under + 0.5 * Math.max(temple, nape) + (o.dark ?? 0));
    const topK = sm(0.0, 0.7, d0[1]) * layer;
    // (each card its own value a little: silver strands and greyer ones side by side, the lowlights broken up)
    const c0 = lerp(lerp(K.mid, K.top, clamp(0.3 + 0.7 * topK + (o.bright ?? 0))), K.low, lowK * 0.9).map((v) => v * rr(K.jit[0], K.jit[1]));
    return (t, x) => { const root = 1 - sm(0.0, 0.18, t), tip = sm(0.6, 1, t);
      return lerp(c0, K.low, 0.35 * root).map((v, i) => Math.min(1, v * (1 + 0.06 * tip) * (1 + 0.03 * x * (i - 1)))); };
  };
  // ---- the roots: a Fibonacci spread of directions over the hair, the inner layers first (drawn under the outer)
  const roots = []; const NF = 9000;
  for (let i = 0; i < NF; i++) { const y = 1 - (2 * (i + 0.5)) / NF, r = Math.sqrt(1 - y * y), th = i * 2.399963229728653; const d = [r * Math.cos(th), y, r * Math.sin(th)];
    if (y < -0.55) continue; const s = scalp(d); if (!s || s.e < 0.002) continue; roots.push(d); }
  const pick = () => roots[Math.floor(rnd() * roots.length)];
  const lenAt = (d) => { const top = sm(0.0, 0.6, d[1]) * (1 - 0.45 * sm(0.0, -0.6, d[2])); return (0.04 + 0.06 * top) * rr(0.85, 1.15); };
  // (1) the inner and mid layers: wide dense clumps (strips 0-4), the hair's body
  const layers = [[0.0, 0.32, Math.round(K.n * 0.34), [0, 1, 2], [0.01, 0.014]], [0.35, 0.68, Math.round(K.n * 0.34), [0, 1, 2, 3, 4], [0.008, 0.012]],
    [0.7, 1.0, Math.round(K.n * 0.32), [3, 4, 5, 1], [0.007, 0.011]]];
  for (const [l0, l1, n, strips, [w0, w1]] of layers) for (let k = 0; k < n; k++) {
    const d = pick(), layer = rr(l0, l1), front = sm(0.45, 0.9, d[2]) * sm(0.05, 0.5, d[1]);
    const { P, D } = grow(d, lenAt(d) * (1 + 0.25 * front), layer, { lift: K.front * front * (0.6 + 0.4 * layer), liftL: 0.025 });
    const short = d[1] < 0.1; const st = short && rnd() < 0.5 ? [6, 7, 8, 9][Math.floor(rnd() * 4)] : strips[Math.floor(rnd() * strips.length)];
    card(P, D, st, rr(w0, w1) * (short ? 0.85 : 1), colourOf(d, layer));
  }
  // (2) the front swoop: four big locks off the front hairline, lifted up and back and falling a little to his right,
  // each a bundle of cards that gather toward the lock's line at their tips (gaps between the locks)
  const LK = K.locks || [[-36, 12, 0.1, -0.3, 0.8], [-14, 13, 0.115, -0.28, 1.0], [8, 13, 0.115, -0.26, 1.08], [30, 11, 0.1, -0.18, 0.85]];
  let nlock = 0;
  for (const [p0, hw, len, sweepX, hk] of LK) {
    // the lock's root line: on the hairline's inner edge at azimuth p0, a few millimetres in
    let dc = null; for (let el = 70; el > 0; el -= 1) { const a = el * D2R, d = norm([Math.cos(a) * Math.sin(p0 * D2R), Math.sin(a) * 0.98 - 0.02, Math.cos(a) * Math.cos(p0 * D2R)]); const s = scalp(d); if (s && s.e > 0.004) { dc = d; } else if (dc) break; }
    if (!dc) continue; nlock++;
    // the lock's line: one strand grown from the root's middle, lifted (the swoop) and biased up, back and to his right;
    // its cards ride that line side by side (a bundle), their offsets drawn in toward the line at the tip (the lock
    // gathers to a point), stacked a few millimetres deep, so the locks read as four masses with gaps between them
    const bias = [sweepX, 0.25, -1], lift = K.lockLift * hk + K.front * 0.6;
    const c = grow(dc, len, 1, { bias, biasK: 0.7, lift, liftL: 0.03, rise: 0.008, drop: 0.35, curl: rr(-2, 2) }), m = c.P.length; if (m < 3) continue;
    const Lc = [0]; for (let i = 1; i < m; i++) Lc.push(Lc[i - 1] + Math.hypot(...[0, 1, 2].map((q) => c.P[i][q] - c.P[i - 1][q])));
    const BL = c.P.map((_, i) => { const a = c.P[Math.max(0, i - 1)], b = c.P[Math.min(m - 1, i + 1)]; return norm(cross(norm([b[0] - a[0], b[1] - a[1], b[2] - a[2]]), c.D[i])); });
    const hwm = hw * D2R * 0.1;
    for (let k = 0; k < (K.lockCards ?? 16); k++) {
      const o = rr(-1, 1) * hwm, dep = rr(-0.0045, 0.0012), cut = rr(0.75, 1), layer = clamp(0.55 + (dep + 0.0045) / 0.0057 * 0.45), drift = rr(-0.002, 0.002);
      const P = [], D = [];
      for (let i = 0; i < m; i++) { const t = Lc[i] / Lc[m - 1]; if (t > cut) break;
        P.push(add(add(c.P[i], BL[i], o * (1 - 0.6 * t) + drift * t * t), c.D[i], dep * sm(0, 0.15, t))); D.push(c.D[i]); }
      card(P, D, [3, 4, 5, 0, 1][k % 5], rr(0.01, 0.014), colourOf(dc, 1, { bright: 0.12 + 0.12 * layer, dark: 0.2 * (1 - layer) }), { twist: rr(-8, 8), taper: 0.5 });
    }
  }
  // (2b) the front's wall: cards close along the front hairline rising into the swoop under the locks, so no forehead
  // shows between the locks (their gaps show this darker hair instead)
  for (let p0 = -58; p0 <= 58; p0 += K.wallStep ?? 2.6) for (const inset of [0.004, 0.011]) {
    let dc = null; for (let el = 70; el > 0; el -= 1) { const a = el * D2R, d = norm([Math.cos(a) * Math.sin(p0 * D2R), Math.sin(a) * 0.98 - 0.02, Math.cos(a) * Math.cos(p0 * D2R)]); const s = scalp(d); if (s && s.e > inset) dc = d; else if (dc) break; }
    if (!dc) continue; const mid = 1 - sm(25, 60, Math.abs(p0)), layer = rr(0.45, 0.8);
    const { P, D } = grow(dc, rr(0.06, 0.085) * (0.7 + 0.3 * mid), layer, { bias: [-0.25, 0.3, -1], biasK: 0.55 * mid, lift: (K.lockLift * 0.55 + K.front * 0.5) * (0.35 + 0.65 * mid), liftL: 0.025, rise: 0.008, drop: 0.4 });
    card(P, D, [0, 1, 2, 3][Math.floor(rnd() * 4)], rr(0.01, 0.014), colourOf(dc, 0.35 + 0.65 * layer, { bright: 0.08 }), { twist: rr(-6, 6), taper: 0.4 });
  }
  // (3) a few flyaways: single wavy strands lifting off the top and the swoop
  for (let k = 0; k < K.flyaways; k++) {
    const d = pick(); if (d[1] < 0.35) { k--; continue; }
    const { P, D } = grow(d, rr(0.035, 0.06), 1, { lift: K.front * 0.4 + rr(0.004, 0.009), liftL: 0.04, curl: rr(-10, 10) });
    card(P, D, 10 + (k % 3), rr(0.0028, 0.0042), colourOf(d, 1, { bright: 0.2 }), { twist: rr(-40, 40), taper: 0.2, arch: 0 });
  }
  // ---- into the hair mesh (beside the shell), on the head bone
  const hm = shell.mesh, tmpl = hm.listPrimitives()[0], skin = R.listSkins()[0], hj = skin.listJoints().findIndex((j) => j.getName() === 'head');
  const n = pos.length / 3, J16 = hj > 255 || tmpl.getAttribute('JOINTS_0')?.getArray() instanceof Uint16Array, J = new (J16 ? Uint16Array : Uint8Array)(n * 4), Wt = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) { J[i * 4] = hj; Wt[i * 4] = 1; }
  const buf = R.listBuffers()[0], acc = (type, arr) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buf);
  // (the old cards' material and atlas, unused since the shell replaced them: out)
  for (const m of R.listMaterials()) if (/^(hair|hairCap)$/.test(m.getName()) && !m.listParents().some((p) => p.propertyType === 'Primitive')) {
    const t = m.getBaseColorTexture(); m.dispose(); if (t && !t.listParents().some((p) => p.propertyType === 'Material')) t.dispose(); }
  const tex = doc.createTexture('hair-strands').setImage(fs.readFileSync(K.atlas)).setMimeType('image/webp');
  const mat = doc.createMaterial('hair').setBaseColorFactor([1, 1, 1, 1]).setBaseColorTexture(tex).setAlphaMode('MASK').setAlphaCutoff(K.cut)
    .setDoubleSided(true).setRoughnessFactor(K.rough).setMetallicFactor(0)
    .setExtras({ hairTone: 'light', hairNormals: 'volume', look: { hair: 'cards', note: 'alpha-tested hair cards from a strand atlas (POLYTRICITY, CC BY 4.0), tinted by vertex colour' } });
  const p = doc.createPrimitive().setMaterial(mat).setIndices(acc('SCALAR', n > 65535 ? Uint32Array.from(idx) : Uint16Array.from(idx)))
    .setAttribute('POSITION', acc('VEC3', Float32Array.from(pos))).setAttribute('NORMAL', acc('VEC3', Float32Array.from(nrm))).setAttribute('COLOR_0', acc('VEC4', Float32Array.from(col)))
    .setAttribute('TEXCOORD_0', acc('VEC2', Float32Array.from(uvs))).setAttribute('TANGENT', acc('VEC4', Float32Array.from(tan)))
    .setAttribute('JOINTS_0', acc('VEC4', J)).setAttribute('WEIGHTS_0', acc('VEC4', Wt));
  hm.addPrimitive(p);
  console.log('hair cards:', ncard, 'cards (', nlock, 'front locks ), points', n, 'triangles', ntri, '; roots', roots.length);
}
