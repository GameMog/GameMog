// Jensen Heist, cast round 3 (19 Nov; the owner's rule 5 and the critic: "the cast still has no strand hair"): one shared
// groom for the whole supporting cast, ported from Jensen's hair round 3 (scripts/handbuilt/jensen/haircards.mjs and
// round12.mjs: the same strand atlas, storykit/handbuilt/jensen/parts/hair-strands.webp, cut by hairatlas.mjs from
// POLYTRICITY's "Hair Cards_FBX", CC BY 4.0, see CREDITS.md). Unlike the round-1 groom (groom.mjs) it does not fill the
// forge's cut: the forge's cut is taken off and the hair is grown from the scalp to the style's own length, so a bob falls
// to the chin and long hair to the shoulder blades, never a bowl.
//   strandGroomPass(doc, K)   K: a style (STYLES) and the person's colour; returns a short report
// The groom, three parts:
//   - the hairline: a line round the head (eye-relative height by the azimuth round the skull's centre: the forehead, the
//     temples, the sideburns, over the ears, the nape), feathered with a little noise; the scalp inside it painted the
//     hair's root colour (no shaved band, no skin seen between the cards)
//   - an under-layer: the scalp's own triangles inside the hairline, lifted off it a few millimetres in the hair's colour
//     (material 'hairUnder', opaque, matte), zero lift at the hairline (no step, no shell edge)
//   - two or three layers of narrow alpha-tested cards (material 'hair', MASK, double-sided: the game draws it with alpha to
//     coverage under MSAA): each a window of one atlas strip laid along a strand grown from a root on the scalp, along the
//     style's flow (away from a part, toward a tie), hugging the head at its layer's height, then (for a long style) falling
//     under gravity, pushed out of the body (the skin and the clothes, by the nearest point and its normal); each card dark
//     at the root rising to its value along its length, salt and pepper by the person's greying
// Every point rides the head bone; a long fall below the jaw blends onto the chest (spine03) so it lies on the shoulders.
// Original procedural work (the atlas CC BY as credited), CC0.
import fs from 'node:fs';
import { prim, sm, clamp, setWebp, fbm, body, require } from '../young-hero/glb.mjs';
import { eyeFit } from '../frames.mjs';
import { texelPos } from '../young-mother/p2.mjs';

const ATLAS = new URL('../../../storykit/handbuilt/jensen/parts/hair-strands.webp', import.meta.url).pathname;
const D2R = Math.PI / 180;
const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const lerp = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);
const tang = (v, n) => add(v, n, -dot(v, n));
const lin = (c) => Math.pow(c / 255, 2.2), enc = (l) => Math.min(255, Math.max(0, Math.round(255 * Math.pow(Math.max(0, l), 1 / 2.2))));
// the atlas's strips (pixels of the 4096 source sheet: x0, x1, the tip's row; roots at ~3990), as haircards.mjs: 0-2 wide
// dense clumps, 3-4 narrower tapered clumps, 5 one tapered lock, 6-9 shorter tapered clumps, 10-12 single wavy strands
const STRIPS = [[80, 467, 90], [524, 835, 151], [887, 1198, 139], [1252, 1547, 43], [1612, 1897, 54], [1978, 2257, 122],
  [2336, 2612, 1596], [2697, 2981, 2002], [3068, 3345, 1896], [3425, 3685, 2131], [3756, 3793, 1841], [3830, 3861, 849], [3954, 3978, 1041]];
const ROOT = 3988 / 4096;

// the hairline: [azimuth (degrees from the front, round the skull's centre), height over the eyes' line (m)]; hf the
// forehead's, the rest relative to the defaults below (a style or a person may move any point)
const HAIRLINE = (hf, o = {}) => [[0, hf], [28, hf + (o.temple ?? 0.002)], [46, hf - 0.016 + (o.recede ?? 0)], [60, 0.018], [70, o.sideburn ?? -0.004], [80, o.sideburn ?? -0.004], [85, 0.032], [110, 0.034], [124, -0.03], [150, (o.nape ?? -0.085) + 0.015], [180, o.nape ?? -0.085]];

// the styles: flow 'part' (away from a part point, then down) or 'tie' (to a tie point, then a tail); len [top, side,
// back] (m), the hang (0 = hugging the head all the way, 1 = falling straight once below the skull's widest), tuck (the
// ends turned in toward the neck, a bob's), layers [lo, hi, share, strips, width (m)], vol (m: the mass's height over the
// scalp, top and sides), n cards
export const STYLES = {
  // Marge: a chin-length layered bob parted on her right, face-framing pieces at the front falling past the cheekbones
  bob: { flow: 'part', part: [-0.42, 0.9, 0.18], len: [0.17, 0.13, 0.12], lenFront: 0.11, hang: 1, tuck: 0.25, endY: -0.075, vol: [0.013, 0.008], back: 0.7, n: 3000, seg: 3,
    layers: [[0, 0.35, 0.3, [0, 1, 2], [0.011, 0.015]], [0.35, 0.7, 0.35, [0, 1, 2, 3, 4], [0.009, 0.013]], [0.7, 1, 0.35, [3, 4, 5, 6, 7], [0.007, 0.011]]], frame: 90, hf: 0.06 },
  // Lola: long layered hair to the shoulder blades, a soft centre-left part, the front pieces in front of the shoulders
  long: { flow: 'part', part: [-0.12, 0.98, 0.12], partLine: -0.012, len: [0.36, 0.3, 0.4], lenFront: 0.26, hang: 1, tuck: 0.05, endY: -0.34, vol: [0.012, 0.008], back: 0.7, n: 2600, seg: 3,
    layers: [[0, 0.35, 0.3, [0, 1, 2], [0.018, 0.024]], [0.35, 0.7, 0.35, [0, 1, 2, 3, 4], [0.015, 0.02]], [0.7, 1, 0.35, [3, 4, 5, 6, 7], [0.012, 0.017]]], frame: 50, hf: 0.058 },
  // Nico, Dex, Director Grey: a short man's cut combed back and across from a side part (part on his left, +x), the sides
  // and back shorter and close, a clean taper at the temples and the nape
  'side-part': { flow: 'part', part: [0.42, 0.88, 0.2], len: [0.07, 0.035, 0.04], lenFront: 0.075, hang: 0, back: 0.75, vol: [0.011, 0.004], n: 1500, frontUp: 0.5,
    layers: [[0, 0.4, 0.35, [0, 1, 2], [0.012, 0.016]], [0.4, 0.75, 0.35, [0, 1, 2, 3, 4], [0.01, 0.014]], [0.75, 1, 0.3, [3, 4, 6, 7], [0.008, 0.012]]], hf: 0.068 },
  // Wesley: short soft curls, a crop all round
  'short-curly': { flow: 'part', part: [0.05, 0.75, -0.66], len: [0.05, 0.03, 0.035], lenFront: 0.045, hang: 0, back: 0.3, vol: [0.016, 0.008], n: 1700, curl: 30,
    layers: [[0, 0.4, 0.35, [0, 1, 2], [0.011, 0.015]], [0.4, 0.75, 0.35, [0, 1, 2, 3, 4], [0.01, 0.013]], [0.75, 1, 0.3, [6, 7, 8, 9], [0.008, 0.011]]], hf: 0.066 },
  // Intern Two: hair drawn back from a clean hairline to a low ponytail, the tail to between the shoulder blades
  ponytail: { flow: 'tie', tie: [0, 0.05, -1], len: [0.2, 0.2, 0.2], lenFront: 0.2, hang: 0, vol: [0.006, 0.004], n: 1300, seg: 3, tail: { n: 420, len: 0.24, r: 0.02 },
    layers: [[0, 0.4, 0.4, [0, 1, 2], [0.014, 0.02]], [0.4, 1, 0.6, [0, 1, 2, 3, 4], [0.012, 0.017]]], hf: 0.062 },
};

export async function strandGroomPass(doc, K = {}) {
  const ST = STYLES[K.style]; if (!ST) throw new Error('strand groom: no style ' + K.style);
  K = { atlas: 0.31, cut: 0.4, rough: 0.82, hi: 0.05, spec: null, wMul: 1, nMul: 1, seed: 17, ds: 0.004, seg: 2, greying: 0, grey: [168, 166, 162], under: 0.45, rootK: 0.55, shell: 0.0035, curl: 4, ...ST, ...K };
  const R = doc.getRoot();
  let seed = K.seed; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647), rr = (a, b) => a + (b - a) * rnd();
  const E = eyeFit(doc), ey = (E.L.c[1] + E.R.c[1]) / 2, ez = (E.L.c[2] + E.R.c[2]) / 2, C = [0, ey + 0.02, ez - 0.075];
  const HL = K.hairline || HAIRLINE(K.hf, K.hl || {});
  const hlAt = (ph) => { ph = Math.min(180, Math.abs(ph)); for (let i = 1; i < HL.length; i++) if (ph <= HL[i][0]) { const [a, ya] = HL[i - 1], [b, yb] = HL[i], t = (ph - a) / (b - a), u = t * t * (3 - 2 * t); return ya + (yb - ya) * u; } return HL[HL.length - 1][1]; };
  const phiOf = (p) => Math.atan2(p[0], p[2] - C[2]) / D2R;
  // the hair's weight at a scalp point: inside the hairline, feathered K.feather, a little noise along it
  // (nothing low on the face is scalp: under the eyes' line in front of the ears, or in front of the eyes' plane below the brow)
  const inHair = (p, fe = 0.003) => { const ph = phiOf(p), y = p[1] - ey; if ((Math.abs(ph) < 80 && y < -0.02) || (p[2] > ez - 0.01 && y < 0.03)) return 0;
    const n = 0.004 * (fbm(p[0], p[1], p[2], 70) - 0.5); return sm(-fe, fe, y - hlAt(ph) + n); };
  // ---- the body: the skin's points (the scalp) and every collider point (skin and clothes) with its normal
  const B = body(doc), sk = B.sk, SP = B.pos, SN = sk.getAttribute('NORMAL'), wHead = B.wOn(/^head$/);
  const skinV = [...new Set(prim(doc, 'skin').flatMap((p) => [...p.getIndices().getArray()]))];
  const NOT = /^(hair|hairUnder|hairShell|hairClumps|eyes|cornea|teethUp|teethLow|lashes|brows|mouth-inside|tongue|headset|beard)$/;
  const col = []; const nv = [0, 0, 0];
  for (const p of R.listMeshes().flatMap((m) => m.listPrimitives())) { const mn = p.getMaterial()?.getName() || ''; if (NOT.test(mn) || !p.getIndices()) continue;
    const A = p.getAttribute('POSITION'), N = p.getAttribute('NORMAL'); if (!N) continue; const Aa = A.getArray();
    for (const v of new Set(p.getIndices().getArray())) { if (Aa[v * 3 + 1] < C[1] - 0.6) continue; N.getElement(v, nv); const l = Math.hypot(...nv) || 1; col.push([Aa[v * 3], Aa[v * 3 + 1], Aa[v * 3 + 2], nv[0] / l, nv[1] / l, nv[2] / l]); } }
  const cell = 0.02, G = new Map(), key = (x, y, z) => Math.floor(x / cell) + ',' + Math.floor(y / cell) + ',' + Math.floor(z / cell);
  for (const c of col) { const k = key(c[0], c[1], c[2]); (G.get(k) || G.set(k, []).get(k)).push(c); }
  const near = (p) => { let best = null, bd = 1e9; const cx = Math.floor(p[0] / cell), cy = Math.floor(p[1] / cell), cz = Math.floor(p[2] / cell);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) { const L = G.get((cx + a) + ',' + (cy + b) + ',' + (cz + c)); if (!L) continue;
      for (const q of L) { const d = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2 + (q[2] - p[2]) ** 2; if (d < bd) { bd = d; best = q; } } }
    return best; };
  // the signed height over the body at p (the nearest point's normal plane), and its normal; far from everything: free
  const over = (p) => { const q = near(p); if (!q) return { s: NaN, n: norm(sub(p, C)) }; const n = [q[3], q[4], q[5]]; return { s: dot(sub(p, q), n), n }; };
  // ---- colours (linear): the hair's own, its root, the grey strands
  const base = K.col.map(lin), grey = K.grey.map(lin), root = base.map((x) => x * K.rootK);
  // ---- (1) the scalp painted the root colour inside the hairline
  { const { tex, img, S, N2, pos, head } = await texelPos(doc), d = img.data; let np = 0;
    for (let i = 0; i < N2; i++) { const y = pos[i * 3 + 1]; if (Number.isNaN(y) || head[i] < 0.5 || y < ey - 0.12) continue; const p = [pos[i * 3], y, pos[i * 3 + 2]];
      const w = inHair(p, 0.0035); if (w <= 0) continue; const g = K.greying * 0.5, c = lerp(root, grey.map((x) => x * 0.6), g);
      for (let ch = 0; ch < 3; ch++) d[i * 4 + ch] = enc(lin(d[i * 4 + ch]) * (1 - w * 0.94) + c[ch] * w * 0.94); np++; }
    await setWebp(tex, d, S, S, 90, 4); console.log('strand groom: scalp texels painted', np); }
  // ---- (2) the under-layer: the scalp's triangles inside the hairline, lifted by w x K.shell (+ a little more on top)
  const vw = new Float32Array(SP.length / 3); for (const v of skinV) { if (wHead[v] < 0.5) continue; vw[v] = inHair([SP[v * 3], SP[v * 3 + 1], SP[v * 3 + 2]], 0.004); }
  const shellOff = (v) => { const d = norm(sub([SP[v * 3], SP[v * 3 + 1], SP[v * 3 + 2]], C)); // (its edge sunk 1 mm under the skin: the layer's border is where it crosses the skin, over the painted scalp, never a
    // saw-tooth of the skin's own triangles standing proud of it)
    return vw[v] >= 0.5 ? (vw[v] - 0.5) * 2 * (K.shell + 0.003 * sm(0.2, 0.8, d[1])) : -0.001 * (1 - vw[v] * 2); };
  const sI = [], sMap = new Map(), skI = sk.getIndices().getArray();
  for (const p of prim(doc, 'skin')) { const I = p.getIndices().getArray(); for (let t = 0; t < I.length; t += 3) { const a = I[t], b = I[t + 1], c = I[t + 2]; if (Math.min(vw[a], vw[b], vw[c]) < 0.05 || Math.max(vw[a], vw[b], vw[c]) < 0.5) continue;
    for (const v of [a, b, c]) { if (!sMap.has(v)) sMap.set(v, sMap.size); sI.push(sMap.get(v)); } } }
  void skI;
  // ---- (3) the cards
  const pos = [], nrm = [], colr = [], uvs = [], idx = [], jw = []; let ncard = 0;
  const yChin = ey - 0.115;
  const card = (P, Nn, strip, w0, colour, o = {}) => {
    const m = P.length; if (m < 3) return;
    const [x0, x1, ty] = STRIPS[strip], win = strip >= 10 ? 1 : rr(0.45, 0.75), c0 = x0 + (x1 - x0) * rr(0, 1 - win), u0 = c0 / 4096, u1 = (c0 + (x1 - x0) * win) / 4096, vT = ty / 4096;
    const b0 = pos.length / 3, tw = (o.twist ?? rr(-6, 6)) * D2R, taper = o.taper ?? 0.4;
    const L = [0]; for (let i = 1; i < m; i++) L.push(L[i - 1] + Math.hypot(...sub(P[i], P[i - 1]))); const len = L[m - 1] || 1;
    for (let i = 0; i < m; i++) { const t = L[i] / len, T = norm(sub(P[Math.min(m - 1, i + 1)], P[Math.max(0, i - 1)]));
      let Bv = norm(cross(T, Nn[i])); const tws = tw * (0.4 + 0.6 * t), TB = cross(T, Bv); Bv = norm(add(Bv.map((x) => x * Math.cos(tws)), TB, Math.sin(tws)));
      let N = norm(cross(Bv, T)); if (dot(N, Nn[i]) < 0) N = N.map((x) => -x); const Nv = norm(lerp(N, Nn[i], 0.85)), w = w0 * (1 - taper * t);
      // (the skinning: the head bone, a fall below the jaw blended onto the chest)
      const hk = sm(yChin - 0.12, yChin + 0.01, P[i][1]);
      for (const x of [-1, 0, 1]) { pos.push(...add(add(P[i], Bv, (x * w) / 2), N, (1 - x * x) * w * 0.1)); nrm.push(...Nv); uvs.push(u0 + ((u1 - u0) * (x + 1)) / 2, ROOT + (vT - ROOT) * t); colr.push(...colour(t), 1); jw.push(hk); } }
    for (let i = 0; i < m - 1; i++) for (let j = 0; j < 2; j++) { const a = b0 + i * 3 + j, b = a + 1, c = a + 3, dd = c + 1; idx.push(a, c, b, b, c, dd); }
    ncard++; };
  // the flow at p (its outward normal n): away from the part (or to the tie), back a little, down by gravity
  const PT = K.part ? add(C, norm(K.part), 0.1) : null, TI = K.tie ? add(C, norm(K.tie), 0.1) : null;
  const flow = (p, n, o = {}) => { let v;
    if (K.flow === 'tie') { v = tang(sub(TI, p), n); if (Math.hypot(...v) < 0.01) v = tang([0, -1, 0], n); }
    // (K.partLine: a part running front to crown at x = K.partLine: the hair combed away from it to each side, no fringe)
    else if (K.partLine != null) { const sd = Math.sign(p[0] - K.partLine) || 1, d = norm(sub(p, C)); v = norm(tang([sd, -0.15, -0.35 * sm(0.0, 0.6, d[2])], n));
      v = norm(add(v, tang([0, -1, 0], n), (o.gravity ?? 1) * sm(0.5, -0.1, d[1]))); }
    else { v = tang(sub(p, PT), n); if (Math.hypot(...v) < 1e-3) v = tang([0, 0, -1], n); v = norm(v);
      // (the front of a short cut lifted up and back off the forehead; the rest combed back by K.back, then down)
      const d = norm(sub(p, C)), front = sm(0.2, 0.7, d[2]) * sm(0.1, 0.5, d[1]);
      v = norm(add(v, tang([0, 0.35 * (K.frontUp ?? 0) * front, -1], n), (K.back ?? 0.3) * sm(-0.2, 0.6, d[1]) + (K.frontUp ?? 0) * front));
      v = norm(add(v, tang([0, -1, 0], n), (o.gravity ?? 1) * sm(0.5, -0.1, d[1]))); }
    return norm(v); };
  // grow a strand from root r (scalp point, normal n0) to length len in layer l
  const grow = (r, n0, len, l, o = {}) => {
    const d0 = norm(sub(r, C)), volH = K.vol[1] + (K.vol[0] - K.vol[1]) * sm(0.0, 0.7, d0[1]), H = K.shell + 0.002 + l * volH;
    let p = add(r, n0, K.shell * 0.6), f = flow(p, n0), falling = false; const P = [p], Nn = [n0];
    const n = Math.max(4, Math.round(len / K.ds)), curl = (o.curl ?? rr(-1, 1) * K.curl) * D2R, ph = rr(0, 6.3);
    for (let i = 1; i <= n; i++) {
      const t = i / n, hb = over(p), nn = hb.n;
      // (falling: below the skull's widest, a long style lets go of the head and hangs; its ends turn in by K.tuck)
      if (K.hang && !falling && (p[1] < C[1] - 0.025 || (o.front && p[1] < ey + 0.01))) falling = true;
      let v;
      if (falling) { const toAx = norm([-(p[0]), 0, (C[2] - 0.01) - p[2]]); v = norm(add([0, -1, 0], toAx, K.tuck * sm(0.6, 1, t) + 0.04)); v = norm(lerp(f, v, 0.45)); }
      else { v = flow(p, nn); v = norm(lerp(f, v, 0.4)); }
      // (a slow wander about the normal; a curl winds faster)
      const ca = curl * (K.curl > 15 ? Math.sin(i * 0.8 + ph) : 0.15), sd = norm(cross(nn, v)); v = norm(add(v.map((x) => x * Math.cos(ca)), sd, Math.sin(ca)));
      if (o.bias) v = norm(lerp(v, tang(o.bias, nn), o.biasK ?? 0.3));
      f = v; p = add(p, v, K.ds);
      // the layer's height over the body: held there while hugging; while falling only pushed out
      const h2 = over(p), H0 = K.shell + 0.002, Hr = H0 + (H - H0) * sm(0, K.rise ?? 0.03, i * K.ds), tgt = Hr * (1 - 0.35 * sm(0.75, 1, t) * (falling ? 0 : 1));
      // (no body point within ~4 cm (NaN): left where it is, never pulled a metre in toward the skull's centre)
      if (!Number.isNaN(h2.s) && (!falling || h2.s < tgt)) p = add(p, h2.n, tgt - h2.s);
      if (Number.isNaN(h2.s) && !falling) break;
      // (a hugging strand that leaves the hair (past the hairline at its end) stops a little past it)
      if (!falling && inHair(p, 0.002) < 0.01 && i > 2 && !o.free) { const back = inHair(P[P.length - 1], 0.002); if (back < 0.01) { if (K.hang && p[1] < ey + 0.06 && Math.abs(phiOf(p)) > (K.letGo ?? 60)) falling = true; else break; } }
      if (falling && p[1] < ey + (K.endY ?? -0.1) + rr(-0.01, 0.01) * (o.front ? 2 : 1) && t > 0.5) { P.push(p); Nn.push(h2.n); break; }
      P.push(p); Nn.push(h2.n);
    }
    const keep = P.map((_, i) => i).filter((i) => i % K.seg === 0 || i === P.length - 1); return { P: keep.map((i) => P[i]), N: keep.map((i) => Nn[i]) };
  };
  const colourOf = (layer, o = {}) => {
    const gk = K.greying > 0 ? (rnd() < K.greying ** 0.9 ? rr(0.6, 1.0) : rr(0, 0.1)) : 0, jv = rr(0.9, 1.08), c0 = lerp(base, grey, gk).map((x) => x * jv * (0.8 + 0.2 * layer));
    return (t) => { const rg = 0.55 + 0.45 * sm(0, 0.3, t); return c0.map((x) => Math.min(1, (x / K.atlas) * rg * (1 + K.hi * sm(0.6, 1, t)))); }; };
  // roots: area-weighted points on the scalp's triangles well inside the hairline
  const tri = []; let area = 0;
  for (const p of prim(doc, 'skin')) { const I = p.getIndices().getArray(); for (let t = 0; t < I.length; t += 3) { const a = I[t], b = I[t + 1], c = I[t + 2], w = (vw[a] + vw[b] + vw[c]) / 3; if (w < 0.6) continue;
    const A = [SP[a * 3], SP[a * 3 + 1], SP[a * 3 + 2]], Bp = [SP[b * 3], SP[b * 3 + 1], SP[b * 3 + 2]], Cp = [SP[c * 3], SP[c * 3 + 1], SP[c * 3 + 2]], ar = Math.hypot(...cross(sub(Bp, A), sub(Cp, A))) / 2; area += ar * w; tri.push([area, A, Bp, Cp]); } }
  const pickRoot = () => { const x = rnd() * area; let lo = 0, hi = tri.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (tri[m][0] < x) lo = m + 1; else hi = m; }
    const [, A, Bp, Cp] = tri[lo]; let u = rnd(), v = rnd(); if (u + v > 1) { u = 1 - u; v = 1 - v; } const p = add(add(A, sub(Bp, A), u), sub(Cp, A), v); return { p, n: over(p).n }; };
  const lenAt = (p) => { const d = norm(sub(p, C)), top = sm(0.1, 0.7, d[1]), bk = sm(0.1, -0.6, d[2]); const [lt, ls, lb] = K.len; return (ls + (lt - ls) * top) * (1 - bk) + lb * bk; };
  for (const [l0, l1, f, strips, [w0, w1]] of K.layers) for (let k = 0; k < Math.round(K.n * f * K.nMul); k++) {
    const { p, n } = pickRoot(), layer = rr(l0, l1), d = norm(sub(p, C)), frontK = sm(0.35, 0.8, d[2]) * sm(-0.2, 0.6, d[1]);
    // (layered: each card its own length, the outer layers a little shorter at the ends (the bob's layering))
    const L = lenAt(p) * rr(0.82, 1.12) * (1 - 0.12 * layer * (K.hang ? 1 : 0)) * (frontK > 0.5 && K.lenFront ? K.lenFront / lenAt(p) : 1);
    const { P, N } = grow(p, n, L, layer);
    // (a root within 1.5 cm of the hairline: a narrow card, half of them single strands, so the hairline is soft strands
    // and not the square ends of wide clumps)
    const edge = p[1] - ey - hlAt(phiOf(p)) < 0.015 && Math.abs(phiOf(p)) < 120;
    card(P, N, edge && rnd() < 0.5 ? 10 + Math.floor(rnd() * 3) : strips[Math.floor(rnd() * strips.length)], rr(w0, w1) * K.wMul * (edge ? 0.45 : 1), colourOf(layer), {});
  }
  // the face-framing pieces (K.frame of them): from the front hairline at the temples, falling past the cheekbones
  // (roots drawn from the scalp itself: at the temples (K.frameAz degrees round from the front), within 2 cm of the hairline)
  for (let k = 0, tries = 0; k < Math.round((K.frame || 0) * K.nMul) && tries < 20000; tries++) {
    const { p: r, n: rn } = pickRoot(), ph = phiOf(r), a = Math.abs(ph); if (a < (K.frameAz?.[0] ?? 35) || a > (K.frameAz?.[1] ?? 68)) continue;
    if (r[1] - ey - hlAt(ph) > 0.02) continue; const sgn = Math.sign(ph) || 1; k++; const layer = rr(0.55, 1);
    const { P, N } = grow(r, rn, K.lenFront * rr(0.85, 1.1), layer, { front: true, bias: [sgn * 0.6, -1, -0.2], biasK: 0.3 });
    card(P, N, [3, 4, 5, 0][Math.floor(rnd() * 4)], rr(0.009, 0.013) * K.wMul, colourOf(layer), { taper: 0.5 });
  }
  // a ponytail's tail: cards from the tie falling down the back, gathered at the tie, a little wider below it
  if (K.tail) { const T = K.tail, tie = add(TI, norm(sub(TI, C)), -0.1 + 0.075);
    const h0 = over(tie); const t0 = add(tie, h0.n, Math.max(0, 0.012 - h0.s));
    for (let k = 0; k < T.n; k++) { const a = rr(0, 6.28), rad = T.r * Math.sqrt(rnd()), off = [Math.cos(a) * rad, Math.sin(a) * rad * 0.6, 0]; let p = add(t0, off), f = [0, -0.4, -1]; const P = [p], Nn = [norm(sub(p, C))];
      const n = Math.round(T.len * rr(0.8, 1.1) / K.ds);
      const sw = T.swell ?? 0, ax = add(t0, [0, 0, 0]); for (let i = 1; i <= n; i++) { const t = i / n; let v = norm(lerp(f, [off[0] * 3 * t, -1, -0.12], 0.25)); f = v; p = add(p, v, K.ds);
        // (the bundle's swell: the strand held at its offset from the bundle's axis scaled by the bundle's radius here: full
        // below the tie (x (1 + sw)), then tapering to a third at the tip)
        if (sw) { const k = (1 + sw * Math.sin(Math.PI * Math.min(1, t * 1.8)) * (1 - 0.5 * t)) * (1 - 0.6 * sm(0.5, 1, t)), kp = i > 1 ? (1 + sw * Math.sin(Math.PI * Math.min(1, (i - 1) / n * 1.8)) * (1 - 0.5 * (i - 1) / n)) * (1 - 0.6 * sm(0.5, 1, (i - 1) / n)) : 1; p = add(p, [off[0], off[1], 0], k - kp); }
        const h = over(p); if (h.s < 0.01) p = add(p, h.n, 0.01 - h.s); P.push(p); Nn.push(norm(add(h.n, [0, 0, -1], 0.5))); } void ax;
      const keep = P.map((_, i) => i).filter((i) => i % 3 === 0 || i === P.length - 1);
      card(keep.map((i) => P[i]), keep.map((i) => Nn[i]), [0, 1, 2, 3, 4][Math.floor(rnd() * 5)], rr(0.01, 0.015) * (T.w ?? 1), colourOf(rr(0.3, 1)), { taper: T.taper ?? 0.55 }); } }
  // ---- out with the forge's cut; in with the under-layer and the cards, in the cut's mesh (no morph targets there)
  const old = prim(doc, 'hair'); const mesh = old.length ? R.listMeshes().find((m) => m.listPrimitives().includes(old[0])) : R.listMeshes().find((m) => !m.listPrimitives().some((p) => p.listTargets().length));
  for (const p of old) { const t = p.getMaterial()?.getBaseColorTexture(); const m = p.getMaterial(); mesh.removePrimitive(p); p.dispose(); if (m && !m.listParents().some((q) => q.propertyType === 'Primitive')) { m.dispose(); if (t && !t.listParents().some((q) => q.propertyType === 'Material')) t.dispose(); } }
  const skin = R.listSkins()[0], JN = skin.listJoints().map((j) => j.getName()), HJ = JN.indexOf('head'), CJ = JN.indexOf('spine03');
  const buf = R.listBuffers()[0], acc = (type, arr) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buf);
  // the under-layer's primitive (its points the skin's, lifted along the normal; the skin's own skinning)
  { const n = sMap.size, Pp = new Float32Array(n * 3), Np = new Float32Array(n * 3), J = new Uint16Array(n * 4), W = new Float32Array(n * 4), SJ = sk.getAttribute('JOINTS_0'), SW = sk.getAttribute('WEIGHTS_0'), jj = [0, 0, 0, 0], ww = [0, 0, 0, 0];
    for (const [v, i] of sMap) { SN.getElement(v, nv); const l = Math.hypot(...nv) || 1, o = shellOff(v); for (let c = 0; c < 3; c++) { Pp[i * 3 + c] = SP[v * 3 + c] + (nv[c] / l) * o; Np[i * 3 + c] = nv[c] / l; }
      SJ.getElement(v, jj); SW.getElement(v, ww); for (let k = 0; k < 4; k++) { J[i * 4 + k] = jj[k]; W[i * 4 + k] = ww[k]; } }
    const c = lerp(base, grey, K.greying * 0.55).map((x) => x * K.under);
    const um = doc.createMaterial('hairUnder').setBaseColorFactor([...c, 1]).setRoughnessFactor(0.92).setMetallicFactor(0);
    mesh.addPrimitive(doc.createPrimitive().setMaterial(um).setIndices(acc('SCALAR', Uint32Array.from(sI))).setAttribute('POSITION', acc('VEC3', Pp)).setAttribute('NORMAL', acc('VEC3', Np)).setAttribute('JOINTS_0', acc('VEC4', J)).setAttribute('WEIGHTS_0', acc('VEC4', W))); }
  { const n = pos.length / 3, J = new Uint16Array(n * 4), W = new Float32Array(n * 4); for (let i = 0; i < n; i++) { J[i * 4] = HJ; W[i * 4] = jw[i]; J[i * 4 + 1] = CJ < 0 ? HJ : CJ; W[i * 4 + 1] = 1 - jw[i]; }
    const lum = 0.2126 * base[0] + 0.7152 * base[1] + 0.0722 * base[2] + K.greying * 0.25;
    const tex = doc.createTexture('hair-strands').setImage(fs.readFileSync(ATLAS)).setMimeType('image/webp');
    const mat = doc.createMaterial('hair').setBaseColorFactor([1, 1, 1, 1]).setBaseColorTexture(tex).setAlphaMode('MASK').setAlphaCutoff(K.cut).setDoubleSided(true).setRoughnessFactor(K.rough).setMetallicFactor(0)
      .setExtras({ ...(lum > 0.25 ? { hairTone: 'light' } : {}), hairNormals: 'volume', look: { hair: 'strand-cards', style: K.style, note: 'alpha-tested hair cards from a strand atlas (POLYTRICITY, CC BY 4.0), tinted by vertex colour (cast round 3, strandgroom.mjs)' } });
    if (K.spec != null) { const { KHRMaterialsSpecular } = require('@gltf-transform/extensions'); const ext = doc.createExtension(KHRMaterialsSpecular); mat.setExtension('KHR_materials_specular', ext.createSpecular().setSpecularFactor(K.spec)); }
    mesh.addPrimitive(doc.createPrimitive().setMaterial(mat).setIndices(acc('SCALAR', n > 65535 ? Uint32Array.from(idx) : Uint16Array.from(idx)))
      .setAttribute('POSITION', acc('VEC3', Float32Array.from(pos))).setAttribute('NORMAL', acc('VEC3', Float32Array.from(nrm))).setAttribute('COLOR_0', acc('VEC4', Float32Array.from(colr)))
      .setAttribute('TEXCOORD_0', acc('VEC2', Float32Array.from(uvs))).setAttribute('JOINTS_0', acc('VEC4', J)).setAttribute('WEIGHTS_0', acc('VEC4', W))); }
  const msg = `strand groom: ${K.style} ${ncard} cards, ${pos.length / 3} points, ${idx.length / 3} tris; under-layer ${sMap.size} points; colliders ${col.length}`;
  console.log(msg); return msg;
}
