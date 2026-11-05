// THE CHARACTER FORGE: the gates (plan 3.3 #4). Mr. Big's polish rounds were a person looking for the same faults on every
// render; these look for them by measurement, on the finished GLB posed by the shared clip pack, and refuse a character
// that fails one. Node only (gltf-transform + three's maths), no GPU: the CPU skins the meshes the way the GPU will.
//   shoulders       the outer layer's shoulder line from the neck to the arm slopes down and rounds off (no pad's flat
//                   top or raised corner); the body's width inside the cast's band
//   cloth           no covered layer (skin under a cuff or collar, a shirt under a coat, trousers under an apron) comes
//                   out through the layer over it, in any of the 74 clips (3 moments each); the belly reported apart
//   hands           hand length / head height in the band (men 0.75-0.78, women 0.70-0.72), the joints on their creases
//   teeth           both rows and the tongue built, behind the lips and inside the mouth
//   helmet hair     the hair stands off the skull like hair (not a shell: the outer cards' offset neither too even nor too far)
//   claw hands      in the everyday clips (not fights, not holding a thing) no finger curls tip-first with a straight
//                   knuckle (a claw), no hand balls into a fist
//   beard mouth     (v2.3) no beard in the lips' outline or across the parting by the mouth (the open-mouth shards)
//   hair on face    no hair in front of the eyes, nose, cheeks or mouth (a fringe above the brows is fine), at rest and in
//                   the talk / walk / idle clips
//   linings         a shoe's or garment's inside panel (seen at the ankle, a cuff, a hood) close to its outside's shade
//   colour shift    each cloth's colour stays in its own family under a warm (2700 K) and a cool (7500 K) light, as the
//                   game renders it (ACES), so a wine coat never turns raspberry
//   skin tone       (v2.5) the skin's median (neck, shoulders, chest) in the shipped cast's band: no red-orange dark skin
//                   under the warm (2700 K) key, no grey light skin under the cool (7500 K) rim (calibrated on Mr. Big, Jane,
//                   Fiona and Knox, colour.mjs SKIN)
//   blink           face.js finds the lids (an opening of 0.25-0.9 rad), so the blink closes the eye
//   collar          (forge v2.5, NK; gates-collar.mjs) every collar, neckband, hood lying down and bound neckline within
//                   7 mm of what is under it round the neck, at rest and talking, standing, walking; no covered skin or cloth
//                   back face (a shard, a fleck, a lining) round the neck in a CPU render from 6 sides at 4 moments
//   shoes           (forge v2.3, SH; the library's boots, sneakers, dress shoes) rigid: no edge of the toe box stretches
//                   in any clip; every point of the foot (the hidden skin too) inside the upper, at rest and in every
//                   clip; room ahead of the toes; the sole's thickness; standing on the floor at rest and never sunk
//                   into it in the walk, jog or run; each leather, rubber and canvas colour out of the warm hues under the
//                   2700 K key (never turns orange)
//   talk            (FC) in the engine's talking face (talkgate.mjs): the tongue behind the lower incisors, the open mouth's
//                   corners level with its middle (no grimace), the brows rising from head to arch (no scowl)
//   node gates.mjs <character.glb> [--clips cast-clips.glb] [--json out.json]
import { createRequire } from 'module';
import fs from 'node:fs';
import { TOOLBOX, GAMEMOG } from './paths.mjs';
const require = createRequire(TOOLBOX);
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
const { MeshoptDecoder } = require('meshoptimizer');
const sharp = require('sharp');
const T3 = createRequire(GAMEMOG + '/package.json')('three');
import { drift, seen, lch as lchC, family as famC, skinTone, SKIN } from './colour.mjs';
import { talkGate } from './talkgate.mjs';
import { collarGate } from './gates-collar.mjs';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });

// (the everyday clips: no fist or claw allowed. Holding clips (phone, drink, toast) and fights may close the hand)
export const EVERYDAY = ['idle', 'talk', 'walk', 'walkCool', 'walkHeavy', 'walkF', 'walkBack', 'jog', 'run', 'shift', 'arms', 'argue', 'shrug', 'wave', 'sit', 'sitTalk', 'leanBar', 'cheer', 'dance', 'start'];
export const LIMITS = {
  shoes: { strainMm: 0.25, outsideMm: 1, toeRoomMm: 8, soleMm: { 'work-boots': 22, sneakers: 22, 'dress-shoes': 18 }, floorMm: [-4, 6], sinkMm: 15, warmChroma: 0.03 },
  shoulderDropMm: 15, shoulderCornerMm: 3, shoulderBand: { male: [0.72, 0.86], female: [0.88, 0.95] },
  pokeDepthMm: 4, pokeFrameMax: 40, pokeBellyMax: 12, helmetMeanMm: 14,
  hands: { male: [0.745, 0.785], female: [0.695, 0.725] }, creaseShare: 0.5,
  hairP90Mm: 34, hairVolumeP90Mm: 80, hairShellCv: 0.18, faceHairMax: 12, beardMouthMax: 6,
  liningRatio: [0.45, 2.2], hueShiftDeg: 22, lidGap: [0.25, 0.9],
  claw: { tipRad: 1.5, knuckleRad: 0.3 }, fist: 2.5,
};

/* ------------------------------------------------------------------ the model -- */
async function load(file) {
  const doc = await io.read(file), R = doc.getRoot(), skin = R.listSkins()[0], J = skin.listJoints(), names = J.map((j) => j.getName());
  const IBM = J.map((_, k) => new T3.Matrix4().fromArray(skin.getInverseBindMatrices().getElement(k, [])));
  const parentOf = (n) => n.listParents().find((p) => p.propertyType === 'Node');
  const armature = parentOf(J[names.indexOf('root')]);
  const prims = [];
  for (const node of R.listNodes()) { const mesh = node.getMesh(); if (!mesh) continue;
    for (const p of mesh.listPrimitives()) { const m = p.getMaterial(), get = (k) => p.getAttribute(k); if (!get('POSITION')) continue;
      const A = (a) => { if (!a) return null; const n = a.getCount(), w = a.getElementSize(), o = new Float32Array(n * w), t = []; for (let i = 0; i < n; i++) { a.getElement(i, t); for (let c = 0; c < w; c++) o[i * w + c] = t[c]; } return o; };
      prims.push({ node, skinned: !!node.getSkin(), name: m?.getName() || '', ex: m?.getExtras() || {}, mat: m, P: A(get('POSITION')), N: A(get('NORMAL')), UV: A(get('TEXCOORD_0')), JI: A(get('JOINTS_0')), WT: A(get('WEIGHTS_0')), C: A(get('COLOR_0')), idx: Uint32Array.from(p.getIndices().getArray()) }); prims[prims.length - 1].V = Uint32Array.from(new Set(prims[prims.length - 1].idx)); } }
  return { doc, R, J, names, IBM, armature, prims, parentOf, extras: R.getAsset().extras?.forge || {} };
}
// a clip's local transforms (by bone name) at time t: the pack's channels retargeted as clips-runtime.mjs does it
function clipLib(packDoc) {
  const lib = new Map();
  for (const a of packDoc.getRoot().listAnimations()) { const ch = new Map(); let dur = 0;
    for (const c of a.listChannels()) { const n = c.getTargetNode()?.getName(); if (!n) continue; const s = c.getSampler(), ti = Float32Array.from(s.getInput().getArray()), oa = s.getOutput(); let o = Float32Array.from(oa.getArray());
      if (oa.getNormalized()) { const r = oa.getArray(), f = r instanceof Int16Array ? 32767 : r instanceof Int8Array ? 127 : r instanceof Uint16Array ? 65535 : 255; o = Float32Array.from(r, (x) => Math.max(-1, x / f)); }
      dur = Math.max(dur, ti[ti.length - 1]); ch.set(n + '|' + c.getTargetPath(), { ti, o }); }
    lib.set(a.getName(), { ch, dur }); }
  return lib;
}
function sample(c, t, w) { const { ti, o } = c; let i = 0; while (i < ti.length - 1 && ti[i + 1] <= t) i++; const j = Math.min(ti.length - 1, i + 1), f = j === i ? 0 : Math.max(0, Math.min(1, (t - ti[i]) / (ti[j] - ti[i])));
  if (w === 4) return new T3.Quaternion().fromArray(o, i * 4).slerp(new T3.Quaternion().fromArray(o, j * 4), f); return new T3.Vector3().fromArray(o, i * 3).lerp(new T3.Vector3().fromArray(o, j * 3), f); }
// every joint's world matrix in a pose (null clip: the bind pose)
function poseWorld(M, clip, t) {
  const fx = M.extras.post?.clips || {}, kRoot = fx.rootScale ?? 1, splay = (fx.armSplay ?? 0) * Math.PI / 180, out = new Map();
  const arm = new T3.Matrix4().compose(new T3.Vector3(...M.armature.getTranslation()), new T3.Quaternion(...M.armature.getRotation()), new T3.Vector3(...M.armature.getScale()));
  const world = (n) => { if (out.has(n)) return out.get(n); const p = M.parentOf(n), pw = p === M.armature || !p ? arm : world(p), name = n.getName();
    let tr = new T3.Vector3(...n.getTranslation()), q = new T3.Quaternion(...n.getRotation());
    if (clip) { const c1 = clip.ch.get(name + '|translation'), c2 = clip.ch.get(name + '|rotation'); if (c1) { tr = sample(c1, t, 3); if (name === 'root') tr.multiplyScalar(kRoot); }
      if (c2) { q = sample(c2, t, 4); const side = /upperarm01_(L|R)$/.exec(name)?.[1]; if (side && splay) q.premultiply(new T3.Quaternion().setFromAxisAngle(new T3.Vector3(0, 0, 1), side === 'L' ? splay : -splay)); } }
    const m = pw.clone().multiply(new T3.Matrix4().compose(tr, q, new T3.Vector3(...n.getScale()))); out.set(n, m); return m; };
  for (const j of M.J) world(j);
  return M.J.map((j) => world(j));
}
// posed positions of a primitive (skinned by its weights, or carried by its parent joint like the cap)
function skinPrim(M, pr, W) {
  const n = pr.P.length / 3, o = new Float32Array(n * 3), S = W.map((w, k) => w.clone().multiply(M.IBM[k])), e = S.map((m) => m.elements);
  if (!pr.skinned) { const par = M.parentOf(pr.node), k = M.J.indexOf(par), m = (k >= 0 ? W[k] : new T3.Matrix4()).clone().multiply(new T3.Matrix4().fromArray(pr.node.getMatrix())), a = m.elements;
    for (const i of pr.V) { const x = pr.P[i * 3], y = pr.P[i * 3 + 1], z = pr.P[i * 3 + 2]; o[i * 3] = a[0] * x + a[4] * y + a[8] * z + a[12]; o[i * 3 + 1] = a[1] * x + a[5] * y + a[9] * z + a[13]; o[i * 3 + 2] = a[2] * x + a[6] * y + a[10] * z + a[14]; } return o; }
  for (const i of pr.V) { const x = pr.P[i * 3], y = pr.P[i * 3 + 1], z = pr.P[i * 3 + 2]; let X = 0, Y = 0, Z = 0;
    for (let k = 0; k < 4; k++) { const w = pr.WT[i * 4 + k]; if (!w) continue; const a = e[pr.JI[i * 4 + k]]; X += w * (a[0] * x + a[4] * y + a[8] * z + a[12]); Y += w * (a[1] * x + a[5] * y + a[9] * z + a[13]); Z += w * (a[2] * x + a[6] * y + a[10] * z + a[14]); }
    o[i * 3] = X; o[i * 3 + 1] = Y; o[i * 3 + 2] = Z; }
  return o;
}
function vNormals(P, idx) { const N = new Float32Array(P.length);
  for (let q = 0; q < idx.length; q += 3) { const a = idx[q] * 3, b = idx[q + 1] * 3, c = idx[q + 2] * 3, ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; for (const k of [a, b, c]) { N[k] += nx; N[k + 1] += ny; N[k + 2] += nz; } }
  for (let i = 0; i < N.length; i += 3) { const l = Math.hypot(N[i], N[i + 1], N[i + 2]) || 1; N[i] /= l; N[i + 1] /= l; N[i + 2] /= l; } return N; }
function grid(P, verts, cell = 0.025) { const G = new Map(), key = (x, y, z) => Math.floor(x / cell) + ',' + Math.floor(y / cell) + ',' + Math.floor(z / cell);
  for (const v of verts) { const k = key(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]); (G.get(k) || G.set(k, []).get(k)).push(v); }
  return (x, y, z, r = cell) => { let best = -1, bd = r * r; const cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) { const L = G.get((cx + i) + ',' + (cy + j) + ',' + (cz + k)); if (!L) continue;
      for (const v of L) { const d = (P[v * 3] - x) ** 2 + (P[v * 3 + 1] - y) ** 2 + (P[v * 3 + 2] - z) ** 2; if (d < bd) { bd = d; best = v; } } }
    return best; }; }
const pct = (a, p) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
async function texMean(pr, tris = null) {
  const t = pr.mat?.getBaseColorTexture(), f = pr.mat?.getBaseColorFactor() || [1, 1, 1, 1];
  if (!t) { if (pr.C) { const a = [0, 0, 0]; const n = pr.C.length / 4; for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) a[c] += pr.C[i * 4 + c] / n; return a.map((x, c) => x * f[c]); } return f.slice(0, 3); }
  const { data, info } = pr._img || (pr._img = await sharp(Buffer.from(t.getImage())).removeAlpha().raw().toBuffer({ resolveWithObject: true }));
  const a = [0, 0, 0]; let n = 0, alpha = 0; const L = tris || Array.from({ length: pr.idx.length / 3 }, (_, i) => i);
  for (const q of L) for (const k of [0, 1, 2]) { const v = pr.idx[q * 3 + k], u = pr.UV[v * 2], w = pr.UV[v * 2 + 1], x = Math.min(info.width - 1, Math.max(0, Math.floor(u * info.width))), y = Math.min(info.height - 1, Math.max(0, Math.floor(w * info.height))), i = (y * info.width + x) * info.channels;
    for (let c = 0; c < 3; c++) a[c] += Math.pow(data[i + c] / 255, 2.2); n++; }
  return a.map((x, c) => (x / Math.max(1, n)) * f[c]);
}
// a material's main colours: its texels under its triangles (or its vertex colours), k-means (k = 3) in linear rgb
async function texClusters(pr) {
  const f = pr.mat?.getBaseColorFactor() || [1, 1, 1, 1], t = pr.mat?.getBaseColorTexture(), S = [];
  if (t) { const { data, info } = pr._img || (pr._img = await sharp(Buffer.from(t.getImage())).removeAlpha().raw().toBuffer({ resolveWithObject: true }));
    const step = Math.max(1, Math.floor(pr.idx.length / 3 / 1500));
    for (let q = 0; q < pr.idx.length / 3; q += step) { const v = [0, 1, 2].map((k) => pr.idx[q * 3 + k]), u = (v.reduce((a, i) => a + pr.UV[i * 2], 0)) / 3, w = (v.reduce((a, i) => a + pr.UV[i * 2 + 1], 0)) / 3;
      const x = Math.min(info.width - 1, Math.max(0, Math.floor(u * info.width))), y = Math.min(info.height - 1, Math.max(0, Math.floor(w * info.height))), i = (y * info.width + x) * info.channels; S.push([0, 1, 2].map((c) => Math.pow(data[i + c] / 255, 2.2) * f[c])); } }
  else if (pr.C) { for (const v of pr.V) S.push([0, 1, 2].map((c) => pr.C[v * 4 + c] * f[c])); }
  else S.push(f.slice(0, 3));
  let K = [S[0], S[Math.floor(S.length / 2)], S[S.length - 1]].map((c) => c.slice()), lab = new Int32Array(S.length);
  for (let it = 0; it < 10; it++) { S.forEach((c, i) => { let b = 0, bd = 9; K.forEach((k, j) => { const d = (c[0] - k[0]) ** 2 + (c[1] - k[1]) ** 2 + (c[2] - k[2]) ** 2; if (d < bd) { bd = d; b = j; } }); lab[i] = b; });
    K = K.map((k, j) => { const m = [0, 0, 0]; let n = 0; S.forEach((c, i) => { if (lab[i] === j) { m[0] += c[0]; m[1] += c[1]; m[2] += c[2]; n++; } }); return n ? m.map((x) => x / n) : k; }); }
  return K.map((k, j) => ({ lin: k, share: lab.filter((x) => x === j).length / S.length })).filter((c) => c.share >= 0.12);
}
// colour: linear rgb -> OKLab / LCh; the game's tonemap (ACES, Narkowicz's fit) at an exposure where 18 % grey under the
// key reads mid-grey
const oklab = ([r, g, b]) => { const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s]; };
const lch = (c) => { const [L, a, b] = oklab(c); return { L, C: Math.hypot(a, b), h: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360 }; };
const aces = (x) => Math.max(0, Math.min(1, (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14)));
const toLin = (c) => Math.pow(c / 255, 2.2), toDisp = (c) => Math.pow(c, 1 / 2.2);
const LIGHTS = { neutral: [1, 1, 1], warm: [1, 0.706, 0.42], cool: [0.737, 0.824, 1] }; // (2700 K and 7500 K, as rgb in linear, white-normalised by max)
function litColour(albedo, light, E = 2.2) { return albedo.map((a, c) => toLin(Math.round(255 * toDisp(aces(a * light[c] * E))))); }
// a colour's family: its hue band and whether it is near grey / dark
function family({ L, C, h }) { if (C < 0.035) return L < 0.3 ? 'black' : L > 0.8 ? 'white' : 'grey';
  const bands = [[20, 'pink-red'], [45, 'red'], [70, 'orange-brown'], [105, 'yellow-tan'], [160, 'green'], [230, 'teal-blue'], [280, 'blue'], [330, 'purple'], [360, 'pink-red']];
  let name = bands.find(([x]) => h < x)[1]; if (name === 'red' && L < 0.42) name = 'wine'; if (name === 'pink-red' && L < 0.42) name = 'wine'; if (name === 'orange-brown' && L < 0.5) name = 'brown'; return name; }

/* ------------------------------------------------------------------ the gates -- */
export async function runGates(glb, packFile) {
  const M = await load(glb), F = M.extras, lm = F.landmarks || {}, post = F.post || {}, sex = lm.sex || 'male', res = {};
  const pack = clipLib(await io.read(packFile));
  const by = (fn) => M.prims.filter(fn), skinP = M.prims.find((p) => p.name === 'skin');
  const cloth = by((p) => ['clothes', 'puffer', 'apron', 'hood', 'cap'].includes(p.name) || p.ex.kind === 'cloth');
  const layerOf = (p) => p.ex.layer ?? ({ skin: 0, shoes: 1, clothes: 2, puffer: 3, apron: 4, hood: 4, cap: 9 }[p.name] ?? 2);
  const ey = lm.ey, eyeFront = lm.eyeFront, headI = M.names.indexOf('head');
  const rest = poseWorld(M, null, 0), restP = new Map(M.prims.map((p) => [p, skinPrim(M, p, rest)]));
  // (the rest analyses in the bind space, where the landmarks are: a skinned point's own position (post.mjs made the rest
  // skeleton the bind one; the cap is carried by the head's inverse bind, so its points are bind-space too)
  const bindP = (p) => p.P, BW = (y) => y, frameScale = 1;

  /* shoulders */
  { const outer = M.prims.filter((p) => p !== skinP && !/hair|braids|locs|curls|eyes|brows|lashes|teeth|cap|collar|neckband|^hood(-up)?$|scarf|buttons/.test(p.name) && p.name !== 'skin'), sh = M.names.indexOf('upperarm01_L'), shY = new T3.Vector3().setFromMatrixPosition(M.IBM[sh].clone().invert()).y;
    const prof = (x0, x1) => { let m = -9; for (const p of [skinP, ...outer]) { const P = bindP(p); for (const v of p.V) { const i = v * 3, ax = Math.abs(P[i]); if (ax < x0 || ax > x1 || Math.abs(P[i + 2]) > 0.09 || P[i + 1] > shY + 0.2 || P[i + 1] < shY - 0.15) continue; if (p === skinP && P[i + 1] > BW(lm.ey) - 0.12) continue; m = Math.max(m, P[i + 1]); } } return m; };
    // (the line beyond the neck and its collar: 11.5, 16.5 and 21.5 cm out; the corner = how far the arm's end sits above the
    // line of the first two: a natural shoulder rounds down (negative), a pad stays flat or rises)
    const s = frameScale, y1 = prof(0.11 * s, 0.12 * s), y2 = prof(0.16 * s, 0.17 * s), y3 = prof(0.21 * s, 0.22 * s);
    const drop = (y1 - y3) * 1000, corner = (y3 - (y2 + (y2 - y1))) * 1000, band = LIMITS.shoulderBand[sex], width = F.post?.shoulder ?? lm.shoulder;
    res.shoulders = { pass: drop >= LIMITS.shoulderDropMm && corner <= LIMITS.shoulderCornerMm, dropMm: +drop.toFixed(1), cornerMm: +corner.toFixed(1), lineMm: [y1, y2, y3].map((y) => Math.round(y * 1000)), limit: `from 11.5 to 21.5 cm out the outer layer drops >= ${LIMITS.shoulderDropMm} mm, and the arm's end sits <= ${LIMITS.shoulderCornerMm} mm over the line of the first 10 cm` }; }

  /* cloth: covered layers out through the layer over them, across the clips */
  { const layers = M.prims.filter((p) => p === skinP || cloth.includes(p) || p.name === 'shoes').map((p) => ({ p, L: layerOf(p) }));
    // (at rest: which points of an inner layer are covered by an outer one: within 2.5 cm behind its nearest point)
    const pairs = [];
    for (const o of layers) { if (!o.p.skinned || o.p.name === 'cap') continue; const Po = restP.get(o.p), No = vNormals(Po, o.p.idx), near = grid(Po, o.p.V);
      for (const i of layers) { if (i.L >= o.L || !i.p.skinned) continue; const Pi = restP.get(i.p), cov = [];
        // (each covered point keeps the outer points round its own at rest (within 3 cm): in a pose it is checked against
        // those only, so a hand resting in front of the chest is not 'out through' the chest's cloth)
        const nbr = new Map(), cellR = 0.03, Gk = new Map(), gk = (x, y, z) => Math.floor(x / cellR) + ',' + Math.floor(y / cellR) + ',' + Math.floor(z / cellR); for (const q of o.p.V) { const k = gk(Po[q * 3], Po[q * 3 + 1], Po[q * 3 + 2]); (Gk.get(k) || Gk.set(k, []).get(k)).push(q); }
        for (const v of i.p.V) { const q = near(Pi[v * 3], Pi[v * 3 + 1], Pi[v * 3 + 2]); if (q < 0) continue; const d = (Pi[v * 3] - Po[q * 3]) * No[q * 3] + (Pi[v * 3 + 1] - Po[q * 3 + 1]) * No[q * 3 + 1] + (Pi[v * 3 + 2] - Po[q * 3 + 2]) * No[q * 3 + 2]; if (!(d < 0.0005 && d > -0.025)) continue;
          cov.push(v); const L = [], c0 = [Pi[v * 3], Pi[v * 3 + 1], Pi[v * 3 + 2]].map((x) => Math.floor(x / cellR)); for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) for (const w of Gk.get((c0[0] + a) + ',' + (c0[1] + b) + ',' + (c0[2] + c)) || []) if ((Po[w * 3] - Pi[v * 3]) ** 2 + (Po[w * 3 + 1] - Pi[v * 3 + 1]) ** 2 + (Po[w * 3 + 2] - Pi[v * 3 + 2]) ** 2 < cellR * cellR) L.push(w); nbr.set(v, L); }
        if (cov.length) pairs.push({ o: o.p, i: i.p, cov, nbr, label: `${i.p.name}${i.L}<${o.p.name}${o.L}` }); } }
    const waist = BW((lm.ey ?? 1.6) - 0.68), chest = BW((lm.ey ?? 1.6) - 0.36), torsoJ = new Set(M.names.map((n, k) => (/^(root|spine0[1-5]|pelvis_[LR])$/.test(n) ? k : -1)).filter((k) => k >= 0));
    const torso = (p, v) => { let w = 0; for (let k = 0; k < 4; k++) if (torsoJ.has(p.JI[v * 4 + k])) w += p.WT[v * 4 + k]; return w > 0.6; };
    const everyday = new Set(EVERYDAY); let worstAll = { n: 0 };
    let worst = { n: 0 }, bellyWorst = { n: 0 }, frames = 0; const perClip = {};
    for (const [name, clip] of pack) for (const u of [0.2, 0.5, 0.8]) { const t = clip.dur * u, W = poseWorld(M, clip, t); frames++; const cacheP = new Map();
      const posed = (p) => cacheP.get(p) || cacheP.set(p, skinPrim(M, p, W)).get(p);
      let n = 0, belly = 0, maxD = 0; const lab = {};
      for (const pr of pairs) { const Po = posed(pr.o), No = vNormals(Po, pr.o.idx), Pi = posed(pr.i), Ri = pr.i.P;
        for (const v of pr.cov) { let q = -1, bd = 1e9; for (const w of pr.nbr.get(v)) { const dd = (Po[w * 3] - Pi[v * 3]) ** 2 + (Po[w * 3 + 1] - Pi[v * 3 + 1]) ** 2 + (Po[w * 3 + 2] - Pi[v * 3 + 2]) ** 2; if (dd < bd) { bd = dd; q = w; } } if (q < 0 || bd > 0.03 * 0.03) continue; const d = (Pi[v * 3] - Po[q * 3]) * No[q * 3] + (Pi[v * 3 + 1] - Po[q * 3 + 1]) * No[q * 3 + 1] + (Pi[v * 3 + 2] - Po[q * 3 + 2]) * No[q * 3 + 2];
          if (d > LIMITS.pokeDepthMm / 1000) { n++; maxD = Math.max(maxD, d); lab[pr.label] = (lab[pr.label] || 0) + 1; if (Ri[v * 3 + 1] > waist - 0.06 && Ri[v * 3 + 1] < chest && Ri[v * 3 + 2] > 0 && Math.abs(Ri[v * 3]) < 0.14 && torso(pr.i, v)) belly++; } } }
      perClip[name] = Math.max(perClip[name] || 0, n);
      const rec = { n, clip: name, t: +t.toFixed(2), maxMm: +(maxD * 1000).toFixed(1), by: lab }; if (n > worstAll.n) worstAll = rec; if (everyday.has(name) && n > worst.n) worst = rec;
      if (belly > bellyWorst.n) bellyWorst = { n: belly, clip: name, t: +t.toFixed(2) }; }
    const bad = Object.entries(perClip).filter(([k, n]) => everyday.has(k) && n > LIMITS.pokeFrameMax).map(([k, n]) => `${k}:${n}`), badAll = Object.entries(perClip).filter(([, n]) => n > LIMITS.pokeFrameMax).length;
    res.cloth = { pass: worst.n <= LIMITS.pokeFrameMax && bellyWorst.n <= LIMITS.pokeBellyMax, frames, pairs: pairs.map((p) => `${p.label} (${p.cov.length} covered)`), worst, worstAnyClip: worstAll, belly: bellyWorst, everydayOver: bad, anyClipOver: badAll,
      limit: `everyday clips: <= ${LIMITS.pokeFrameMax} covered points > ${LIMITS.pokeDepthMm} mm out in any frame; the belly (torso skin) <= ${LIMITS.pokeBellyMax} in ALL 74 clips; fights reported, not gated` }; }

  /* collar (NK): collars, neckbands, the hood lying down and a bound neckline on the neck; no flecks round it */
  res.collar = collarGate({ debug: globalThis.__nkDebug, M, pack, poseWorld, skinPrim, vNormals, layerOf, skinP, EVERYDAY, isCloth: (p) => cloth.includes(p) });

  /* hands */
  { const h = post.hands || {}, band = LIMITS.hands[sex], ok = ['L', 'R'].every((s) => h[s] && h[s].after >= band[0] && h[s].after <= band[1]);
    const cr = ['L', 'R'].map((s) => post.joints?.['hand' + s]), share = cr.every(Boolean) ? Math.min(...cr.map((c) => c.creaseOwn / c.creaseOf)) : null;
    res.hands = { pass: ok && (share == null || share >= LIMITS.creaseShare), ratio: { L: h.L?.after, R: h.R?.after }, band, creaseShare: share != null ? +share.toFixed(2) : null, limit: `ratio in [${band}], >= ${LIMITS.creaseShare * 100}% of hand joints on their own crease` }; }

  /* teeth */
  { const up = M.prims.find((p) => p.name === 'teethUp'), lo = M.prims.find((p) => p.name === 'teethLow');
    const lipZ = (lm.eyeFront ?? 0) + (lm.mouthUsed?.front ?? lm.front ?? 10) / 1000, part = (lm.ey ?? 0) - (lm.mouthUsed?.below ?? lm.below ?? 65) / 1000;
    const box = (p) => { const b = [9, -9, 9, -9]; for (const v of p.V) { const i = v * 3; b[0] = Math.min(b[0], p.P[i + 1]); b[1] = Math.max(b[1], p.P[i + 1]); b[2] = Math.min(b[2], p.P[i + 2]); b[3] = Math.max(b[3], p.P[i + 2]); } return b; };
    const bu = up && box(up), behind = bu ? (lipZ - bu[3]) * 1000 : null;
    res.teeth = { pass: !!(up && lo && up.idx.length > 300 && lo.idx.length > 300 && behind > 1 && behind < 12 && bu[1] > part), tris: { up: up ? up.idx.length / 3 : 0, lowAndTongue: lo ? lo.idx.length / 3 : 0 }, behindLipsMm: behind != null ? +behind.toFixed(1) : null, limit: 'both rows built, upper row 1-12 mm behind the lips, reaching above the parting' }; }

  /* helmet hair */
  { const hairs = M.prims.filter((p) => /^(hair|braids|locs)/.test(p.name));
    if (!hairs.length) res.helmetHair = { pass: true, note: 'no hair geometry (shaved / buzz painted)' };
    else { const P = bindP(skinP), headV = []; for (const v of skinP.V) { let w = 0; for (let k = 0; k < 4; k++) if (skinP.JI[v * 4 + k] === headI) w += skinP.WT[v * 4 + k]; if (w > 0.5) headV.push(v); }
      const near = grid(P, headV, 0.02), d = [], eyW = BW(ey);
      // (forge v2.3, HB: a volume style (the afro's coil shells, standing twists, a bun) stands off the skull by design: its
      // p90 limit is hairVolumeP90Mm and the search reaches 9 cm. A point with no skull within reach is a ponytail's or a
      // bun's hang, not the cap's: left out (it counted as 7 cm, so every tail failed the cap's test))
      const volume = hairs.some((h) => ['afro', 'twists', 'bun'].includes(h.ex?.style)), reach = volume ? [0.02, 0.04, 0.06, 0.09] : [0.02, 0.04, 0.06]; let hang = 0;
      for (const h of hairs) { const H = bindP(h); for (const v of h.V) { if (H[v * 3 + 1] < eyW + 0.01) continue; let q = -1; for (const r of reach) { q = near(H[v * 3], H[v * 3 + 1], H[v * 3 + 2], r); if (q >= 0) break; } if (q < 0) { hang++; continue; } d.push(Math.hypot(H[v * 3] - P[q * 3], H[v * 3 + 1] - P[q * 3 + 1], H[v * 3 + 2] - P[q * 3 + 2])); } }
      const p90 = pct(d, 0.9) * 1000, outer = d.filter((x) => x > pct(d, 0.6)), m = outer.reduce((a, x) => a + x, 0) / Math.max(1, outer.length), cv = Math.sqrt(outer.reduce((a, x) => a + (x - m) ** 2, 0) / Math.max(1, outer.length)) / (m || 1);
      // (braids and locs lie in rows on the scalp by design: an even offset there is their look, only p90 applies)
      const ropes = hairs.every((h) => /^(braids|locs)$/.test(h.name));
      const p90Max = volume ? LIMITS.hairVolumeP90Mm : LIMITS.hairP90Mm;
      res.helmetHair = { pass: p90 <= p90Max && (ropes || cv >= LIMITS.hairShellCv || m * 1000 < LIMITS.helmetMeanMm), p90Mm: +p90.toFixed(1), outerMeanMm: +(m * 1000).toFixed(1), outerCv: +cv.toFixed(2), hangPoints: hang, volume, limit: `p90 standoff <= ${p90Max} mm; a shell (outer mean >= ${LIMITS.helmetMeanMm} mm) must vary (cv >= ${LIMITS.hairShellCv})` }; } }

  /* claw hands + fists in the everyday clips */
  { const fing = []; for (const s of ['L', 'R']) for (let f = 2; f <= 5; f++) fing.push([1, 2, 3].map((j) => M.names.indexOf(`finger${f}-${j}_${s}`)));
    const restQ = M.J.map((j) => new T3.Quaternion(...j.getRotation())), ang = (q, k) => 2 * Math.acos(Math.min(1, Math.abs(q.dot(restQ[k]))));
    let claw = [], fist = [];
    for (const name of EVERYDAY) { const clip = pack.get(name); if (!clip) continue;
      for (const u of [0.15, 0.4, 0.65, 0.9]) { const t = clip.dur * u; let nc = 0, nf = 0;
        for (const chain of fing) { const b = chain.map((k) => { const c = clip.ch.get(M.names[k] + '|rotation'); return c ? ang(sample(c, t, 4), k) : 0; });
          if (b[1] + b[2] > LIMITS.claw.tipRad && b[0] < LIMITS.claw.knuckleRad) nc++; if (b[0] + b[1] + b[2] > LIMITS.fist) nf++; }
        if (nc >= 3) claw.push(`${name}@${t.toFixed(1)}:${nc}`); if (nf >= 6) fist.push(`${name}@${t.toFixed(1)}:${nf}`); } }
    res.clawHands = { pass: !claw.length && !fist.length, claw: claw.slice(0, 8), fist: fist.slice(0, 8), limit: 'no >= 3 fingers tip-curled over a straight knuckle, no >= 6 fingers in a fist, in the everyday clips' }; }

  /* hair on the face */
  { const hairs = M.prims.filter((p) => /^(hair|braids|locs)/.test(p.name)), P = bindP(skinP), eyW = BW(ey), chin = eyW - BW((lm.chin ?? 110) / 1000);
    if (!hairs.length) res.hairOnFace = { pass: true, note: 'no hair geometry' };
    else { // (the face's front by (x, y) in 5 mm cells: the skin's frontmost point)
      const C = 0.005, front = new Map(), k2 = (x, y) => Math.round(x / C) + ',' + Math.round(y / C);
      for (const v of skinP.V) { const x = P[v * 3], y = P[v * 3 + 1]; if (Math.abs(x) > 0.08 || y > eyW + 0.03 || y < chin) continue; const k = k2(x, y); front.set(k, Math.max(front.get(k) ?? -9, P[v * 3 + 2])); }
      let worst = { n: 0 };
      for (const [clipName, u] of [[null, 0], ['talk', 0.5], ['walk', 0.3], ['idle', 0.6], ['shift', 0.5]]) { const clip = clipName && pack.get(clipName), W = clip ? poseWorld(M, clip, clip.dur * u) : rest;
        // (posed: into the head's frame, so the face's map applies)
        const hw = W[headI], inv = hw.clone().multiply(M.IBM[headI]).invert(); let n = 0;
        for (const h of hairs) { const H = clip ? skinPrim(M, h, W) : bindP(h), v3 = new T3.Vector3();
          for (const v of h.V) { v3.set(H[v * 3], H[v * 3 + 1], H[v * 3 + 2]); if (clip) v3.applyMatrix4(inv); const x = v3.x, y = v3.y, z = v3.z;
            // (the face: under the brows (a fringe above them is hair's), over the chin, inside the cheeks' width)
            if (y > eyW + 0.012 || y < chin || Math.abs(x) > 0.062) continue; const f = front.get(k2(x, y)); if (f == null) continue; if (z > f - 0.003) n++; } }
        if (n > worst.n) worst = { n, at: clipName || 'rest' }; if (!clipName) worst.rest = n; }
      res.hairOnFace = { pass: worst.n <= LIMITS.faceHairMax, worst, limit: `<= ${LIMITS.faceHairMax} hair points in front of the face (brows to chin, cheek to cheek)` }; } }

  /* beard over the mouth (forge v2.3, HB) */
  // (the beard's shells and cards clear of the lips' outline at rest: none in front of the lips between the lower lip's
  // groove (11.5 mm under the parting) and 2 mm over the parting (a moustache may hang over the upper lip's edge, not
  // into the mouth); no beard triangle across the parting by the mouth, where the opening jaw stretches it into a shard)
  { const bd = M.prims.find((p) => p.name === 'beard');
    if (!bd) res.beardMouth = { pass: true, note: 'no beard geometry' };
    else { const lipZ = (lm.eyeFront ?? 0) + (lm.mouthUsed?.front ?? lm.front ?? 10) / 1000, part = (lm.ey ?? 0) - (lm.mouthUsed?.below ?? lm.below ?? 65) / 1000, H = bindP(bd); let n = 0, cross = 0;
      // (FC: the lens at the mouth's own width when the build records it (lm.mouthHalf), else v2.3's 3.1 cm)
      const LH = lm.mouthHalf != null ? lm.mouthHalf + 0.0015 : 0.031, LX = LH - 0.003, CX = lm.mouthHalf != null ? lm.mouthHalf + 0.002 : 0.036; // (FC: across the parting where the mouth opens: past its corners the skin does not part)
      for (const v of bd.V) { const x = Math.abs(H[v * 3]), y = H[v * 3 + 1], z = H[v * 3 + 2]; if (z < lipZ - 0.025) continue; const t = Math.min(1, x / LH);
        if (x < LX && Math.min(part + 0.002 - 0.0045 * t * t - y, y - (part - 0.0115 + 0.0078 * t * t), LX - x) > 0.001) n++; } // (more than 1 mm inside it: the build keeps its shells 0.3 mm clear)
      for (let q = 0; q < bd.idx.length; q += 3) { const ys = [0, 1, 2].map((k) => H[bd.idx[q + k] * 3 + 1] - part), xs = [0, 1, 2].map((k) => Math.abs(H[bd.idx[q + k] * 3])), zs = [0, 1, 2].map((k) => H[bd.idx[q + k] * 3 + 2]);
        if (Math.max(...ys) > 0.0012 && Math.min(...ys) < -0.0012 && Math.min(...xs) < CX && Math.max(...zs) > lipZ - 0.02) cross++; }
      res.beardMouth = { pass: n <= LIMITS.beardMouthMax && cross === 0, inOutline: n, crossingParting: cross, limit: `<= ${LIMITS.beardMouthMax} beard points inside the lips' outline, no beard triangle across the parting by the mouth` }; } }

  /* linings */
  { const out = {}; let pass = true;
    for (const p of M.prims.filter((p) => p.name === 'shoes' || cloth.includes(p))) { if (!p.UV || !p.mat?.getBaseColorTexture()) continue; const P = bindP(p), N = vNormals(P, p.idx);
      // (an inside panel: a triangle facing in toward its own part's middle (the leg's / body's axis), near an opening)
      let yMax = -9, yMin = 9; for (const v of p.V) { yMax = Math.max(yMax, P[v * 3 + 1]); yMin = Math.min(yMin, P[v * 3 + 1]); }
      const inT = [], outT = []; for (let q = 0; q < p.idx.length / 3; q++) { const a = p.idx[q * 3], b = p.idx[q * 3 + 1], c = p.idx[q * 3 + 2], cx = (P[a * 3] + P[b * 3] + P[c * 3]) / 3, cy = (P[a * 3 + 1] + P[b * 3 + 1] + P[c * 3 + 1]) / 3, cz = (P[a * 3 + 2] + P[b * 3 + 2] + P[c * 3 + 2]) / 3;
        const nx = N[a * 3] + N[b * 3] + N[c * 3], nz = N[a * 3 + 2] + N[b * 3 + 2] + N[c * 3 + 2], ax = p.name === 'shoes' ? cx - Math.sign(cx) * 0.09 * frameScale : cx, inward = (nx * ax + nz * (p.name === 'shoes' ? cz - 0.0 : cz)) < 0;
        if (p.name === 'shoes' && cy < yMax - 0.03) continue; (inward ? inT : outT).push(q); }
      if (inT.length < 8 || outT.length < 8) continue; const a = await texMean(p, inT), b = await texMean(p, outT), la = lch(a).L, lb = lch(b).L, r = (la ** 3) / Math.max(1e-4, lb ** 3);
      const ok = r >= LIMITS.liningRatio[0] && r <= LIMITS.liningRatio[1]; if (!ok) pass = false; out[p.name + (out[p.name] ? '2' : '')] = { ratio: +r.toFixed(2), insideTris: inT.length, ok }; }
    res.linings = { pass, panels: out, limit: `inside / outside luminance in [${LIMITS.liningRatio}]` }; }

  /* colour shift: each cloth's main colours (k-means of its texels, each >= 12 % of it) under warm and cool light */
  { const out = {}; let pass = true, n = 0;
    for (const p of cloth) { const cols = await texClusters(p);
      for (const c of cols) { const d = drift(c.lin), key = `${p.name}${p.ex.garment ? ':' + p.ex.garment : ''}#${n++}`; out[key] = { share: +c.share.toFixed(2), srgb: c.lin.map((x) => Math.round(255 * Math.pow(x, 1 / 2.2))), family: d.family, warm: d.warm, cool: d.cool, ...(d.fail ? { fail: d.fail } : {}) }; if (d.fail) pass = false; } }
    res.colourShift = { pass, materials: out, limit: 'each main colour: hue within 22 deg, and its family kept (a wine never a red), under warm (2700 K) and cool (7500 K) light, white-balanced, ACES' }; }

  /* skin tone (forge v2.5, MV): the skin's median over the neck, shoulders and upper chest (colour.mjs skinTone, the
     shipped cast's band: no red-orange dark skin under the warm lamp, no grey light skin under the cool rim) */
  { const sk = M.prims.find((p) => p.name === 'skin');
    if (!sk || !sk.mat?.getBaseColorTexture() || !sk.UV) res.skinTone = { pass: true, note: 'no skin texture' };
    else { const { data, info } = sk._img || (sk._img = await sharp(Buffer.from(sk.mat.getBaseColorTexture().getImage())).removeAlpha().raw().toBuffer({ resolveWithObject: true }));
      let y0 = 9, y1 = -9; for (const v of sk.V) { y0 = Math.min(y0, sk.P[v * 3 + 1]); y1 = Math.max(y1, sk.P[v * 3 + 1]); }
      const Hs = y1 - y0, ch = [[], [], []], f = sk.mat.getBaseColorFactor();
      for (let q = 0; q < sk.idx.length; q += 3) { const vs = [sk.idx[q], sk.idx[q + 1], sk.idx[q + 2]], y = vs.reduce((a, v) => a + sk.P[v * 3 + 1], 0) / 3; if (y < y1 - 0.30 * Hs || y > y1 - 0.14 * Hs) continue;
        const u = vs.reduce((a, v) => a + sk.UV[v * 2], 0) / 3, w = vs.reduce((a, v) => a + sk.UV[v * 2 + 1], 0) / 3, x = Math.min(info.width - 1, Math.max(0, Math.floor(u * info.width))), yy = Math.min(info.height - 1, Math.max(0, Math.floor(w * info.height))), i = (yy * info.width + x) * info.channels;
        for (let c = 0; c < 3; c++) ch[c].push(Math.pow(data[i + c] / 255, 2.2) * f[c]); }
      const med = ch.map((a) => a.sort((p, q) => p - q)[Math.floor(a.length / 2)] ?? 0), t = skinTone(med);
      res.skinTone = { ...t, samples: ch[0].length, limit: `the skin's median (neck, shoulders, chest): hue ${SKIN.hue[0]}-${SKIN.hue[1]}, C/L <= ${SKIN.cl}; under the 2700 K key (not balanced) hue >= ${SKIN.warmHue}, chroma <= ${SKIN.warmChroma}; under the 7500 K rim (balanced, in shade) C/L >= ${SKIN.coolCl} (calibrated on Mr. Big, Jane, Fiona and Knox)` }; } }

  /* blink */
  { const L = lm.lidInfo; res.blink = { pass: !!L && L.gapRad >= LIMITS.lidGap[0] && L.gapRad <= LIMITS.lidGap[1], ...(L || { note: 'lids not found' }), limit: `face.js finds the lids, opening ${LIMITS.lidGap} rad` }; }

  /* shoes (forge v2.3, SH) */
  { const IDS = ['work-boots', 'sneakers', 'dress-shoes'], upper = M.prims.find((p) => IDS.includes(p.name)), L0 = LIMITS.shoes;
    if (!upper) res.shoes = { pass: true, note: 'no library shoes' };
    else { const id = upper.name, parts = M.prims.filter((p) => p.name === id || p.name.startsWith(id + '-')), sole = M.prims.find((p) => p.name === id + '-soles'), out = {};
      const jIdx = ['L', 'R'].map((s) => M.names.indexOf('foot_' + s)), jPos = jIdx.map((k) => new T3.Vector3().setFromMatrixPosition(M.IBM[k].clone().invert()));
      // (the toe box: the upper ahead of the ball (8 cm in front of the ankle), its edges' lengths posed against the bind)
      const toeE = []; { const seen2 = new Set(); for (let q = 0; q < upper.idx.length; q += 3) for (let e = 0; e < 3; e++) { const a = upper.idx[q + e], b = upper.idx[q + (e + 1) % 3], k = a < b ? a + ',' + b : b + ',' + a; if (seen2.has(k)) continue; seen2.add(k); const s = upper.P[a * 3] >= 0 ? 0 : 1; const l0 = Math.hypot(upper.P[a * 3] - upper.P[b * 3], upper.P[a * 3 + 1] - upper.P[b * 3 + 1], upper.P[a * 3 + 2] - upper.P[b * 3 + 2]); if (upper.P[a * 3 + 2] - jPos[s].z > 0.08 && l0 > 0.001) toeE.push([a, b, Math.hypot(upper.P[a * 3] - upper.P[b * 3], upper.P[a * 3 + 1] - upper.P[b * 3 + 1], upper.P[a * 3 + 2] - upper.P[b * 3 + 2])]); } }
      // (the foot: every skin point (hidden ones too: the body's whole position list) on a foot bone over half)
      const footV = []; for (let v = 0; v < skinP.P.length / 3; v++) { let w = 0; for (let k = 0; k < 4; k++) if (jIdx.includes(skinP.JI[v * 4 + k])) w += skinP.WT[v * 4 + k]; if (w > 0.9) footV.push(v); }
      const allV = Uint32Array.from({ length: skinP.P.length / 3 }, (_, i) => i), skinAll = { ...skinP, V: Uint32Array.from(footV) };
      let covered = null; const outside = (Pu, Ps) => { const Nu = vNormals(Pu, upper.idx), near = grid(Pu, upper.V, 0.03); let n = 0, worst = 0; const first = !covered; if (first) covered = new Set(); for (const v of footV) { if (!first && !covered.has(v)) continue; const q = near(Ps[v * 3], Ps[v * 3 + 1], Ps[v * 3 + 2], 0.06); if (q < 0) continue; const d = (Ps[v * 3] - Pu[q * 3]) * Nu[q * 3] + (Ps[v * 3 + 1] - Pu[q * 3 + 1]) * Nu[q * 3 + 1] + (Ps[v * 3 + 2] - Pu[q * 3 + 2]) * Nu[q * 3 + 2]; if (first) { if (d < -0.0005 && d > -0.03) covered.add(v); continue; } if (d > L0.outsideMm / 1000) { n++; worst = Math.max(worst, d); } } return { n, worst }; };
      let strain = 0, strainMm = 0, outN = 0, outWorst = { n: 0 }, sink = 0, sinkAt = null, frames = 0;
      for (const [name, clip] of [[null, null], ...pack]) for (const u of clip ? [0.2, 0.5, 0.8] : [0]) { const t = clip ? clip.dur * u : 0, W = clip ? poseWorld(M, clip, t) : rest, Pu = clip ? skinPrim(M, upper, W) : restP.get(upper); frames++;
        const sc = jIdx.map((k) => Math.cbrt(Math.abs(W[k].clone().multiply(M.IBM[k]).determinant())) || 1); // (the gate's sampled quaternions are not renormalised: their scale taken out)
        for (const [a, b, l0] of toeE) { const l = Math.hypot(Pu[a * 3] - Pu[b * 3], Pu[a * 3 + 1] - Pu[b * 3 + 1], Pu[a * 3 + 2] - Pu[b * 3 + 2]) / sc[upper.P[a * 3] >= 0 ? 0 : 1]; strain = Math.max(strain, Math.abs(l - l0) / l0 * 100); strainMm = Math.max(strainMm, Math.abs(l - l0) * 1000); }
        const Ps = skinPrim(M, skinAll, W), o = !name || EVERYDAY.includes(name) ? outside(Pu, Ps) : { n: 0 }; if (o.n > outWorst.n) outWorst = { n: o.n, mm: +(o.worst * 1000).toFixed(1), clip: name || 'rest', t: +t.toFixed(2) }; outN = Math.max(outN, o.n);
        if (name && /^(walk|walkCool|walkHeavy|jog|run)$/.test(name) && sole) { const Pq = skinPrim(M, sole, W); let m = 9; for (const v of sole.V) m = Math.min(m, Pq[v * 3 + 1]); if (-m > sink) { sink = -m; sinkAt = `${name}@${t.toFixed(2)}`; } } }
      // (at rest: the floor under the sole; the toe's room; the sole's stack under the foot)
      let minY = 9; { const idle = pack.get('idle'), Wi = idle ? poseWorld(M, idle, Math.min(1.2, idle.dur)) : rest; for (const p of parts) { const Pp = skinPrim(M, p, Wi); for (const v of p.V) minY = Math.min(minY, Pp[v * 3 + 1]); } }
      const fitR = lm.shoes?.fit || {}, room = ['L', 'R'].map((s) => fitR[s]?.toeRoomMm ?? -1)
      const soleMm = +((lm.sole ?? 0) * 1000).toFixed(1);
      // (colour: each shoe material's main colours, white-balanced under the warm key: no warm family taken on, no chroma gained)
      const warm = {}; let warmOk = true; for (const p of parts) { if (p.ex.kind !== 'cloth' || /eyelets/.test(p.name)) continue; for (const c of await texClusters(p)) { const n0 = lchC(seen(c.lin, 'neutral')), w0 = lchC(seen(c.lin, 'warm')), f0 = famC(n0), f1 = famC(w0), gain = w0.C - n0.C;
        const bad = gain > L0.warmChroma || (['orange-brown', 'yellow-tan', 'red'].includes(f1) && !['orange-brown', 'yellow-tan', 'red', 'brown'].includes(f0)); if (bad) warmOk = false; warm[p.name + '#' + Object.keys(warm).length] = { family: f0, warm: f1, chromaGain: +gain.toFixed(3), ok: !bad }; } }
      const built = ['L', 'R'].reduce((a, s) => a + (fitR[s]?.footOutside ?? 99), 0);
      Object.assign(out, { id, frames, toeBoxStrainMm: +strainMm.toFixed(3), toeBoxStrainPct: +strain.toFixed(2), builtFit: fitR, visibleCovered: covered?.size ?? 0, footOutside: outWorst, toeRoomMm: room, soleMm, restFloorMm: +(minY * 1000).toFixed(1), sinkMm: +(sink * 1000).toFixed(1), sinkAt, warm });
      const pass = strainMm <= L0.strainMm && built === 0 && outN === 0 && room.every((r) => r >= L0.toeRoomMm) && soleMm >= (L0.soleMm[id] ?? 15) && minY * 1000 >= L0.floorMm[0] && minY * 1000 <= L0.floorMm[1] && sink * 1000 <= L0.sinkMm && warmOk;
      res.shoes = { pass, ...out, limit: `no toe-box edge changes length > ${L0.strainMm} mm in any clip; every foot point (the hidden ones at the build, the visible covered ones in rest + 74 clips x 3) inside the upper (<= ${L0.outsideMm} mm); toe room >= ${L0.toeRoomMm} mm; sole >= ${JSON.stringify(L0.soleMm)} mm; at rest the sole on the floor (${L0.floorMm} mm); sunk <= ${L0.sinkMm} mm in walk/jog/run; under the warm key no colour gains > ${L0.warmChroma} chroma or turns orange` }; } }

  /* talking frames (FC): the tongue, the mouth's corners and the brows in the engine's own talking face (talkgate.mjs) */
  res.talk = await talkGate(M.doc);

  const failed = Object.entries(res).filter(([, r]) => !r.pass).map(([k]) => k);
  return { pass: !failed.length, failed, gates: res };
}

if (process.argv[1]?.endsWith('gates.mjs')) {
  const args = process.argv.slice(2), opt = (k) => { const i = args.indexOf(k); return i < 0 ? null : args[i + 1]; }, glb = args.find((a, i) => !a.startsWith('--') && !(args[i - 1] || '').startsWith('--'));
  const r = await runGates(glb, opt('--clips') || glb.replace(/[^/]+$/, 'cast-clips.glb'));
  if (opt('--json')) fs.writeFileSync(opt('--json'), JSON.stringify(r, null, 1));
  console.log(JSON.stringify({ glb: glb.split('/').pop(), pass: r.pass, failed: r.failed }));
  for (const [k, g] of Object.entries(r.gates)) console.log((g.pass ? 'PASS ' : 'FAIL ') + k.padEnd(12), JSON.stringify(Object.fromEntries(Object.entries(g).filter(([kk]) => kk !== 'pass' && kk !== 'limit'))).slice(0, 400));
}
