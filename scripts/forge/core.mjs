// THE CHARACTER FORGE: core builder (4 Nov 2026). A compiled character config (compile.mjs turns a character sheet into
// one, clamped) -> a raw GLB on the cast's 66-bone rig. Generalised from Mog City's cast2 builder (build-cast.mjs, the
// copy made for Fiona) with Mr. Big's JMOVE skeleton refit (build-man.mjs) folded in, and new: face sculpts (nose,
// cheekbones, brow ridge, chin), the lips found automatically (forge/landmarks.mjs, wagmi/face.js's finder run here, no
// studio pass), beard styles, generated headwear (ball cap, peaked cap, knit beanie), an apron panel, a hood, ripped
// denim, box braids. Sources: GameMog's CC0 MakeHuman body + people pack. Every face is a blend, never anyone's likeness.
// FB (browser port): one function on a platform (env-node.mjs / env-browser.mjs), no Node API, so a creator's browser
// runs it as the Node CLI does (forge.mjs -> pipeline.mjs). Files come from env.A (the asset library) and env.K (the
// forge kit, kit.mjs); the raw GLB and the landmarks come back in memory.
//   core(cfg, env) -> { glb: Uint8Array, lm (the landmarks post.mjs and the runtime read), info }
import { findMouth } from './landmarks.mjs';
import { bumpNormals } from './shoes.mjs';
import { applyFace, carry } from './targets.mjs';
import { skinGuard, skinTone } from './colour.mjs';
import { prepare, GARMENTS, rasterPaint, weldNormals, wrapWeights, coveredBy, FABRIC, FABRIC_ROUGH, fabricBump, fabricShade, tuckBob, baldTris, slick, knitTex, BRAIDS, nearestBody, beardCards, strandAtlas, mouthGap, vnoise } from './library.mjs';
import { hoodDown, drawcords, necklineBinding, splitNeckline } from './necklines.mjs';
import { cardHairTex, hairlineDist } from './hairline.mjs';
export async function core(CFG0, env) {
// (the platform: its logger stands in for the console, its module table for require)
const console = { error: env.log, log: env.log, warn: env.log };
const MODS = { '@gltf-transform/core': env.gltf.core, '@gltf-transform/functions': env.gltf.functions, '@gltf-transform/extensions': env.gltf.extensions };
const require = (m) => { if (!MODS[m]) throw new Error('forge core: no module ' + m); return MODS[m]; };
const { Document } = env.gltf.core, IO = env.IO;
const { ALL_EXTENSIONS } = env.gltf.extensions;
const { MeshoptDecoder } = env.meshopt;
const sharp = env.sharp, T3 = env.THREE;
await MeshoptDecoder.ready;
const A = env.A;
const CFG = Object.assign({
  sex: 'male', face: { caucasian: 0.34, asian: 0.33, african: 0.33 }, muscle: 0.2, lean: 0, age: 0.3, weight: 0.3,
  mouth: null, skins: { caucasian: 1 }, hair: 'none', wear: [], shoes: 'shoes03', shoesTint: [1, 1, 1],
  height: 1.78, headScale: 1, beard: null, shells: null, jaw: 0, jowl: 0, shoulder: 0.84, slope: { drop: 0.009 },
  teeth: true, cap: null, puffer: null, sculpt: null, hairShape: null, tail: null,
}, structuredClone(CFG0));
// (the rig's template: the cast's male (gears.glb, as Mr. Big and the Suits were built) or female (Fiona's original);
// only its 66 joints, node tree and inverse binds are kept; the clips are replaced by Dan's after (clips.mjs))
// (FB: the kit's stripped copies, kit.mjs)
const TEMPLATE = CFG.template || env.K + (CFG.sex === 'female' ? 'rig-female.glb' : 'rig-male.glb');

/* ------------------------------------------------------------ the source -- */
const ATH = 'human-athlete-' + (CFG.sex || 'male'), PKD = 'human-pack-' + (CFG.sex || 'male');
const TYPES = { Float32Array, Int8Array, Uint8Array, Uint16Array, Int16Array, Uint32Array };
async function readAsset(dir, file) {
  const J = JSON.parse(await env.text(A + dir + '/asset.json')), buf = await env.inflate(await env.bytes(A + dir + '/' + file));
  const get = (k) => { const L = J.layout[k], T = TYPES[L.type]; return new T(buf.buffer.slice(buf.byteOffset + L.offset, buf.byteOffset + L.offset + L.length * T.BYTES_PER_ELEMENT)); };
  return { J, get };
}
const B = await readAsset(ATH, 'body.bin.z'), PK = await readAsset(PKD, 'pack.bin.z');
const nB = B.J.vertexCount, nP = PK.J.vertexCount;
const group = (src, name) => src.J.groups.find((g) => g.name === name);

// the shapes: the base's own (muscle, lean, the three faces) and the pack's two for the base (age, weight); the pack's
// garments and hair follow the same shapes with theirs
function shaped(src, n, list) {
  const p = Float32Array.from(src.get('position'));
  for (const [k, w, scale] of list) { if (!w) continue; const d = src.get(k); for (let i = 0; i < n * 3; i++) p[i] += d[i] * scale * w; }
  return p;
}
const W = { muscle: CFG.muscle, lean: CFG.lean, african: CFG.face.african || 0, asian: CFG.face.asian || 0, caucasian: CFG.face.caucasian || 0, age: CFG.age, weight: CFG.weight };
const bPos = (() => {
  const p = shaped(B, nB, ['muscle', 'lean', 'african', 'asian', 'caucasian'].map((k) => ['morph:' + k, W[k], B.J.morphs[k]]));
  for (const k of ['age', 'weight']) { if (!W[k]) continue; const d = PK.get('base:' + k), s = PK.J.base.morphs[k]; for (let i = 0; i < nB * 3; i++) p[i] += d[i] * s * W[k]; }
  return p;
})();
// FB: the reference body for carried landmarks (landmarks.mjs): the base unshaped, same topology, where the finder reads
const REF = B.get('position');
const pPos = shaped(PK, nP, Object.keys(W).map((k) => ['morph:' + k, W[k], PK.J.morphs[k]]));
// FORGE v2: MakeHuman's CC0 face targets (targets.mjs) behind the sheet's face fields, capped 5 mm a field, 28 mm summed, 8 mm at a point, in
// all; the eyeballs (each moved whole), brows, lashes and every hair or garment point near the face carried with the skin
const FACE = CFG.faceTargets ? (() => {
  const gB = group(B, 'body'), bi = B.get('index').subarray(gB.start, gB.start + gB.count); let nBody = 0; for (const v of bi) nBody = Math.max(nBody, v + 1);
  const P0 = bPos.slice(0, nBody * 3);
  // (the lips must still part where face.js looks for it: a mouth word that closes them (full lips with a defined bow
  // on some blends) is halved, then dropped, until the finder sees the parting)
  const eyI = (() => { const g = group(B, 'eyes'); return Array.from(B.get('index').subarray(g.start, g.start + g.count)); })();
  const parts = (P) => { let ef = -9; for (const v of eyI) if (P[v * 3] > 0) ef = Math.max(ef, P[v * 3 + 2]); return findMouth(P, Array.from(bi), eyI, ef, REF); };
  const MOUTHF = ['lips', 'cupidsBow', 'mouthWidth', 'mouthCorners'];
  let r = null;
  for (const k of [1, 0.5, 0]) { const rec = { fields: Object.fromEntries(Object.entries(CFG.faceTargets.fields).map(([f0, L]) => [f0, MOUTHF.includes(f0) ? L.map(([n, w]) => [n, w * k]) : L])) };
    r = applyFace(bPos, bi, nBody, rec, CFG.faceExtraMm || 0); const m = parts(bPos);
    if (m && m.source.parting === 'found') { if (k < 1) r.log.push(`mouth words x${k}: the lips closed`); break; }
    // (FB: still closed with no mouth words: the shapes keep k = 0 and the parting is carried from the base below)
    if (k === 0) { r.log.push('lips closed without mouth words: parting carried from the base'); break; }
    for (let i = 0; i < nBody * 3; i++) bPos[i] -= r.D[i]; }
  const vs = (src, idx, name) => { const g = group(src, name); return g ? [...new Set(idx.subarray(g.start, g.start + g.count))] : []; };
  const bI = B.get('index'), pI = PK.get('index'); let n = 0;
  const eyeVs = vs(B, bI, 'eyes'); for (const s of [1, -1]) n += carry(P0, r.D, nBody, bPos, eyeVs.filter((v) => bPos[v * 3] * s > 0), 0.02, true);
  for (const g of ['brows', 'lashes']) n += carry(P0, r.D, nBody, bPos, vs(B, bI, g), 0.01);
  for (const g of B.J.groups.filter((g) => g.name.startsWith('hair:'))) n += carry(P0, r.D, nBody, bPos, vs(B, bI, g.name), 0.03);
  for (const g of PK.J.groups.filter((g) => /^(hair|outfit):/.test(g.name))) n += carry(P0, r.D, nBody, pPos, vs(PK, pI, g.name), g.name.startsWith('hair') ? 0.03 : 0.015);
  console.error('face targets', JSON.stringify(r.fields), 'total', r.totalMm, 'mm;', r.moved, 'skin points,', n, 'carried;', r.log.join('; '));
  return r;
})() : null;
// (the Suits, 28 Oct: the face shapes are the whole body's (african +8.5 cm at the head at 1, asian -10 cm, the hands
// 3 cm across), and the template's joints don't move with them. Each joint moved as the body round it moved: the
// mean of the shapes' moves of the points within r of it in the base body (nearer ones counting more): MakeHuman's own
// way of fitting its skeleton to a shaped body)
const JMOVE = CFG.jmove === false ? null : (() => {
  const P0 = B.get('position'), sk = B.J.skeleton, out = sk.map(() => [0, 0, 0]);
  sk.forEach((b, i) => {
    const r = /finger|wrist/.test(b.name) ? 0.022 : /neck|head|clavicle/.test(b.name) ? 0.05 : 0.07, h = b.head; let w = 0; const acc = [0, 0, 0];
    for (let v = 0; v < nB; v++) { const dx = P0[v * 3] - h[0], dy = P0[v * 3 + 1] - h[1], dz = P0[v * 3 + 2] - h[2], d2 = dx * dx + dy * dy + dz * dz; if (d2 > r * r) continue;
      const k = Math.pow(1 - Math.sqrt(d2) / r, 2); w += k; for (let c = 0; c < 3; c++) acc[c] += (bPos[v * 3 + c] - P0[v * 3 + c]) * k; }
    if (w > 0) out[i] = acc.map((x) => x / w);
  });
  const big = out.map((d, i) => [sk[i].name, Math.hypot(...d)]).sort((a, b) => b[1] - a[1]).slice(0, 4);
  console.error('joints moved with the shapes, most:', big.map(([n, d]) => n + ' ' + (d * 1000).toFixed(0) + 'mm').join(', '));
  return out;
})();


// (the neck's base as shaped: the base's landmark moved with the neck joint (an old or short body's is lower))
const NECKY = B.J.landmarks.neck + (JMOVE ? JMOVE[B.J.skeleton.findIndex((b) => b.name === 'neck01')][1] : 0);
/* ------------------------------------------------------------ the pieces -- */
const bIdx = B.get('index'), pIdx = PK.get('index');
const tris = (src, idx, name) => { const g = group(src, name); return idx.subarray(g.start, g.start + g.count); };
// the body's skin, less what the garments and the shoes cover (their hide lists: a bit per body triangle)
const bodyG = group(B, 'body'), nT = bodyG.count / 3;
const hidden = new Uint8Array(nT);
const hideBy = (name, keep = () => true) => { const bits = PK.get('hide:' + name); for (let t = 0; t < nT; t++) if (bits[t >> 3] & (1 << (t & 7))) { const q = bodyG.start + t * 3; if (keep(q)) hidden[t] = 1; } };
// (a garment worn for its top or its bottom only: the body hidden under that part only, split at the waist)
const WAIST = B.J.landmarks.waist + 0.01;
const triY = (idx, q, P) => (P[idx[q] * 3 + 1] + P[idx[q + 1] * 3 + 1] + P[idx[q + 2] * 3 + 1]) / 3;
// (each garment's whole hide list, even where only its top or bottom is worn: what it hid is under the other one too,
// and a cut at the waist left the skin showing between the two)
for (const [name] of CFG.wear) hideBy(name);
if (CFG.shoes !== 'none') hideBy(CFG.shoes); // (forge v2.2: 'none' when the library's shoes are worn)
const skinT = []; for (let t = 0; t < nT; t++) if (!hidden[t]) { const q = bodyG.start + t * 3; skinT.push(bIdx[q], bIdx[q + 1], bIdx[q + 2]); }
// the eyes' middles (for the lashes: the lower ones off, as on the cast's other faces)
const eyesT = Array.from(tris(B, bIdx, 'eyes'));
const eyeC = [1, -1].map((s) => { let x = 0, y = 0, z = 0, n = 0; for (const v of new Set(eyesT)) if (bPos[v * 3] * s > 0) { x += bPos[v * 3]; y += bPos[v * 3 + 1]; z += bPos[v * 3 + 2]; n++; } return [x / n, y / n, z / n]; });
let EYEFRONT = -9; for (const v of new Set(eyesT)) if (bPos[v * 3] > 0) EYEFRONT = Math.max(EYEFRONT, bPos[v * 3 + 2]);
const lashAll = tris(B, bIdx, 'lashes'), lashT = [];
let lowerCut = 0;
for (let q = 0; q < lashAll.length; q += 3) { const y = triY(lashAll, q, bPos), c = eyeC[bPos[lashAll[q] * 3] > 0 ? 0 : 1]; if (y < c[1] - 0.001) { lowerCut++; continue; } lashT.push(lashAll[q], lashAll[q + 1], lashAll[q + 2]); }
const browT = Array.from(tris(B, bIdx, 'brows'));
// (his face: the eyes' middle, the mouth's line, the head bone's hold on each point; the beard's area per point, 0..1:
// under the cheekbones, in front of the ears, down under the jaw to the top of the neck, a clean line on the cheeks and
// the neck, the lips left clear (Dan's stubble's area, made a short full beard))
// (the lips found on the shaped face (forge/landmarks.mjs: wagmi/face.js's own finder), not copied in by hand)
const MOUTH_GIVEN = !!CFG.mouth;
if (!CFG.mouth) { CFG.mouth = findMouth(bPos, skinT, eyesT, EYEFRONT, REF); if (!CFG.mouth) throw new Error('face finder: no lip parting found (nor on the base body)'); console.error('mouth found (pre-sculpt)', JSON.stringify(CFG.mouth)); }
const EY = (eyeC[0][1] + eyeC[1][1]) / 2, EZ = (eyeC[0][2] + eyeC[1][2]) / 2; let MOUTHY = EY - (CFG.mouth?.below ?? 63.5) / 1000;
const HEADI = B.J.skeleton.findIndex((b) => b.name === 'head'), bSI = B.get('skinIndex'), bSW = B.get('skinWeight');
const headW = (v) => { let w = 0; for (let j = 0; j < 4; j++) if (bSI[v * 4 + j] === HEADI) w += bSW[v * 4 + j] / 255; return w; };
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// (G7a: the mouth's way out: straight forward (the bind space's +z; a little down let a low lamp in front light it up past the lips): the inside's normals and the
// tongue's turn to it (paintMouthIn, mouthNormals, the teeth below))
const MOUTH_OUT = [0, 0, 1];
let MOUTH_DEEP = null; // (mouthDeep's cache, below)
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const skinV = new Set(skinT);
// FORGE: face sculpts (m, small and clamped by compile.mjs): smooth fields in the bind space round the face's own
// landmarks (the eyes' middles and fronts, the lips found above), on the head's skin and the brows riding it (not the
// eyeballs or lashes; nothing within 1.2 cm of an eye's middle moves). These give each face its own nose, cheekbones,
// brow and chin over the ethnicity blend: the variety the macro shapes alone lacked.
//   sculpt { noseWidth, noseLength (forward), noseTip (down -, up +), cheekbones (out), browRidge (forward),
//            chin (forward), chinLength (down), faceWidth (the cheeks/temples out) }
if (CFG.sculpt) {
  const S = CFG.sculpt, g = (x, c, s0) => Math.exp(-((x - c) * (x - c)) / (2 * s0 * s0));
  const eyesV = new Set(eyesT), lashV = new Set(lashAll), browV = new Set(browT), moved = {};
  const F = EYEFRONT, MY = MOUTHY;
  for (let v = 0; v < nB; v++) {
    if (eyesV.has(v) || lashV.has(v)) continue; if (!skinV.has(v) && !browV.has(v)) continue;
    const hw = Math.min(1, headW(v) * 1.4); if (hw <= 0) continue;
    const x = bPos[v * 3], ax = Math.abs(x), y = bPos[v * 3 + 1], z = bPos[v * 3 + 2], sx = Math.sign(x) || 1;
    const de = Math.min(...eyeC.map((c) => Math.hypot(x - c[0], y - c[1], z - c[2]))), eyeGuard = sm(0.012, 0.022, de);
    const front = sm(F - 0.03, F - 0.005, z);
    let dx = 0, dy = 0, dz = 0;
    if (S.noseWidth) { const w = g(ax, 0.017, 0.007) * sm(EY - 0.072, EY - 0.058, y) * (1 - sm(EY - 0.042, EY - 0.03, y)) * front; dx += sx * S.noseWidth * w; }
    if (S.noseLength) { const w = (1 - sm(0.006, 0.02, ax)) * sm(EY - 0.064, EY - 0.05, y) * (1 - sm(EY - 0.012, EY + 0.002, y)) * sm(F - 0.012, F + 0.006, z); dz += S.noseLength * w; }
    if (S.noseTip) { const w = (1 - sm(0.008, 0.022, ax)) * g(y, EY - 0.05, 0.008) * sm(F - 0.005, F + 0.012, z); dy += S.noseTip * w; }
    if (S.cheekbones) { const w = g(ax, 0.052, 0.013) * g(y, EY - 0.03, 0.012) * sm(EZ - 0.07, EZ - 0.035, z) * eyeGuard; dx += sx * S.cheekbones * w * 0.8; dz += S.cheekbones * w * 0.5; }
    if (S.faceWidth) { const w = sm(0.035, 0.065, ax) * g(y, EY - 0.035, 0.03) * sm(EZ - 0.11, EZ - 0.06, z) * eyeGuard; dx += sx * S.faceWidth * w; }
    if (S.browRidge) { const w = (1 - sm(0.04, 0.062, ax)) * g(y, EY + 0.022, 0.009) * sm(F - 0.03, F - 0.01, z); dz += S.browRidge * w; dy += S.browRidge * 0.3 * w; }
    if (S.chin || S.chinLength) { const w = (1 - sm(0.014, 0.034, ax)) * sm(MY - 0.012, MY - 0.03, y) * (1 - sm(EY - 0.128, EY - 0.15, y)) * sm(EZ - 0.04, EZ - 0.0, z);
      dz += (S.chin || 0) * w; dy -= (S.chinLength || 0) * w * sm(MY - 0.012, MY - 0.035, y); }
    const k = hw;
    if (dx || dy || dz) { bPos[v * 3] += dx * k; bPos[v * 3 + 1] += dy * k; bPos[v * 3 + 2] += dz * k; moved.n = (moved.n || 0) + 1; }
  }
  console.error('sculpt', JSON.stringify(S), 'points', moved.n || 0);
  if (!MOUTH_GIVEN) { const m = findMouth(bPos, skinT, eyesT, EYEFRONT, REF); if (m) { CFG.mouth = m; MOUTHY = EY - m.below / 1000; console.error('mouth found (post-sculpt)', JSON.stringify(m)); } }
}
// (a short boxed beard: the moustache over the upper lip down round the mouth's corners into the chin, the cheeks'
// line rising from the corners to the sideburns in front of the ears, a clean line 2 cm under the jaw; the lips clear)
const BN0 = B.get('normal'), MH = CFG.mouthHalf ?? 0.0212;
const beardOf = (P, v) => { const x = Math.abs(P[v * 3]), y = P[v * 3 + 1], z = P[v * 3 + 2], h = Math.min(1, headW(v) * 1.6 + 0.25);
  // (the cheeks' line: from over the mouth's corners up toward the ear; the area under it, in front of the ears)
  const cheek = MOUTHY + 0.014 + Math.max(0, x - 0.026) * 0.62, ear = EZ - 0.072;
  let a = sm(cheek + 0.004, cheek - 0.003, y) * sm(ear - 0.006, ear + 0.006, z);
  // (the moustache: the band over the upper lip, under the nose, the mouth's width and a little more)
  const mo = (1 - sm(0.026, 0.032, x)) * sm(MOUTHY + 0.0215, MOUTHY + 0.0165, y) * sm(MOUTHY + 0.0035, MOUTHY + 0.0065, y) * sm(EZ + 0.0, EZ + 0.012, z);
  a = Math.max(a, mo);
  // (FORGE beard styles: 'full' (the default above), 'moustache' (the band over the lip only, a little fuller, down
  // past the mouth's corners), 'goatee' (the moustache and the chin))
  const st = CFG.beard?.style;
  if (st === 'moustache' || st === 'goatee') {
    const mo2 = (1 - sm(0.03, 0.036, x)) * sm(MOUTHY + 0.0225, MOUTHY + 0.017, y) * sm(MOUTHY - 0.004 + 0.009 * (1 - sm(0.018, 0.03, x)), MOUTHY + 0.0005 + 0.009 * (1 - sm(0.018, 0.03, x)), y) * sm(EZ - 0.004, EZ + 0.01, z);
    a = Math.max(mo, mo2);
    if (st === 'goatee') a = Math.max(a, (1 - sm(0.02, 0.028, x)) * sm(MOUTHY - 0.006, MOUTHY - 0.011, y) * sm(MOUTHY - 0.052, MOUTHY - 0.044, y) * sm(EZ - 0.01, EZ + 0.005, z));
  }
  // (forge v2.2 grooms: 'fullgrown' (the cheeks' line higher, further down under the jaw), 'chinstrap' (a band along the
  // jaw's edge from the sideburns round under the chin: where the skin turns from the face to under the jaw, and in
  // front of the ears; no moustache))
  if (st === 'fullgrown') { const ch2 = MOUTHY + 0.02 + Math.max(0, x - 0.024) * 0.68; a = Math.max(a, sm(ch2 + 0.004, ch2 - 0.004, y) * sm(ear - 0.006, ear + 0.006, z)); }
  if (st === 'chinstrap') { const ny = BN0[v * 3 + 1] / 127, edge = sm(-0.05, -0.35, ny) * (1 - sm(-0.75, -0.92, ny)), burn = sm(ear + 0.03, ear + 0.012, z) * sm(ear - 0.006, ear + 0.004, z) * sm(MOUTHY - 0.02, MOUTHY, y);
    a = Math.min(a, Math.max(edge, burn)) * (1 - mo); }
  // (under the jaw: down to the top of the neck, then a clean line)
  a *= st === 'fullgrown' ? sm(MOUTHY - 0.108, MOUTHY - 0.092, y) : sm(MOUTHY - 0.088, MOUTHY - 0.074, y);
  // (the lips clear: the lower lip's band under the parting, the upper lip's red under the moustache; the mouth's inside)
  const lip = (1 - sm(MH - 0.0012, MH + 0.0045, x)) * sm(MOUTHY - 0.0125, MOUTHY - 0.009, y) * sm(MOUTHY + 0.0045, MOUTHY + 0.0025, y) * sm(EZ - 0.0, EZ + 0.01, z); a *= 1 - lip;
  if (x < MH + 0.009 && Math.abs(y - MOUTHY) < 0.012 && z < EYEFRONT - 0.004) a = 0;
  return Math.max(0, Math.min(1, a * h)); };
const BEARD = new Float32Array(nB); for (const v of skinV) BEARD[v] = beardOf(bPos, v);
// (cast2, the lead: 'soft feathered edges into the cheeks and neck': the area smoothed over the skin's neighbours (welded
// across the uv seams by place) CFG.beard.feather times, then the lips and the mouth's inside cleared again)
if (CFG.beard?.feather) {
  const key = (v) => Math.round(bPos[v * 3] * 2e4) + ',' + Math.round(bPos[v * 3 + 1] * 2e4) + ',' + Math.round(bPos[v * 3 + 2] * 2e4);
  const wid = new Map(), wOf = new Int32Array(nB).fill(-1); for (const v of skinV) { const k = key(v); if (!wid.has(k)) wid.set(k, wid.size); wOf[v] = wid.get(k); }
  const nW = wid.size, adj = Array.from({ length: nW }, () => new Set());
  for (let q = 0; q < skinT.length; q += 3) for (let e = 0; e < 3; e++) { const a = wOf[skinT[q + e]], b = wOf[skinT[q + (e + 1) % 3]]; adj[a].add(b); adj[b].add(a); }
  let val = new Float32Array(nW); for (const v of skinV) val[wOf[v]] = Math.max(val[wOf[v]], BEARD[v]);
  for (let it = 0; it < CFG.beard.feather; it++) { const nx = new Float32Array(nW); for (let w = 0; w < nW; w++) { let s0 = val[w], c = 1; for (const o of adj[w]) { s0 += val[o]; c++; } nx[w] = s0 / c; } val = nx; }
  const clear = (v) => { const x = Math.abs(bPos[v * 3]), y = bPos[v * 3 + 1], z = bPos[v * 3 + 2];
    const lip = (1 - sm(MH - 0.0012, MH + 0.0045, x)) * sm(MOUTHY - 0.0125, MOUTHY - 0.009, y) * sm(MOUTHY + 0.0045, MOUTHY + 0.0025, y) * sm(EZ - 0.0, EZ + 0.01, z);
    return x < MH + 0.009 && Math.abs(y - MOUTHY) < 0.012 && z < EYEFRONT - 0.004 ? 0 : 1 - lip; };
  for (const v of skinV) BEARD[v] = Math.min(1, val[wOf[v]] * 1.15) * clear(v);
}
// (FC, talking faces: a soft-edged clearing round the mouth: the beard thins over the last 5 mm before the lips' outline
// (mouthGap at the mouth's own width), so the shells, the cards' roots and the painted beard fade into the lips as a
// trimmed beard does, with no hard rim or bare slot at the corners)
if (CFG.beard && CFG.beard.style !== 'stubble') { const gap0 = mouthGap({ MOUTHY, EZ, half: MH });
  for (const v of skinV) { if (!BEARD[v]) continue; const p = [bPos[v * 3], bPos[v * 3 + 1], bPos[v * 3 + 2]]; if (Math.abs(p[0]) > MH + 0.012 || Math.abs(p[1] - MOUTHY) > 0.02) continue;
    const g = gap0(p); BEARD[v] *= g > 0 ? 0 : g < -1 ? 1 : sm(0.0004, 0.005, -g); } }
// (G7a: and none on the mouth's inside (the skin behind the lips' front with skin in front of it: mouthDeep): the old
// boss's shells grew off the floor of his mouth, a lit tangle of hair in every open frame)
if (CFG.beard) { const d0 = mouthDeep(true); let n = 0; for (const v of skinV) if (BEARD[v] && d0[v] > 0) { BEARD[v] = 0; n++; } console.error('beard: mouth inside cleared', n, 'points'); }
// a strand's direction across a triangle in its texture's space (px): the 3D direction D (the hair's growth: down, a
// little out from the middle and back under the jaw) projected onto the triangle and carried into its uvs
function uvDir(Pv, U, D) {
  const E1 = [0, 1, 2].map((k) => Pv[1][k] - Pv[0][k]), E2 = [0, 1, 2].map((k) => Pv[2][k] - Pv[0][k]), dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const g11 = dot(E1, E1), g12 = dot(E1, E2), g22 = dot(E2, E2), r1 = dot(E1, D), r2 = dot(E2, D), det = g11 * g22 - g12 * g12; if (Math.abs(det) < 1e-14) return [0, 1];
  const a = (r1 * g22 - r2 * g12) / det, b = (r2 * g11 - r1 * g12) / det, du = a * (U[1][0] - U[0][0]) + b * (U[2][0] - U[0][0]), dv = a * (U[1][1] - U[0][1]) + b * (U[2][1] - U[0][1]), l = Math.hypot(du, dv) || 1;
  return [du / l, dv / l];
}
const growth = (p) => { const sx = Math.sign(p[0]), under = p[1] < MOUTHY - 0.03 ? 1 : 0; const d = [sx * 0.18, -1, under ? -0.45 : 0.05]; const l = Math.hypot(...d); return d.map((c) => c / l); };
// (hair: streaks along the strand's direction, about a px across and len px long; a second set, finer and rarer, grey)
const strand = (x, y, d, len, seed) => { const a = x * d[0] + y * d[1], b = -x * d[1] + y * d[0]; return vnoise(b / 0.9 + seed, a / len, seed * 0.37); };
// a squarer jaw (out a little at the jaw's angle, below the ear, over the chin's line: Dan's), then the beard's depth
// (each point out along its normal by its share; not at the mid-line over the lip, where face.js reads the parting)
{ const N0 = B.get('normal'); let nj = 0, nd = 0;
  for (const v of skinV) { const hw = headW(v); if (!hw) continue; const x = bPos[v * 3], y = bPos[v * 3 + 1], z = bPos[v * 3 + 2];
    // (a heavier man's face: the cheeks and the jaw fuller, out from the middle under the cheekbones, the most at the jaw)
    if (CFG.jowl) { const jw = sm(0.018, 0.055, Math.abs(x)) * sm(EY - 0.025, EY - 0.075, y) * (1 - sm(MOUTHY - 0.06, MOUTHY - 0.09, y)) * sm(EZ - 0.11, EZ - 0.06, z) * hw;
      if (jw > 0) bPos[v * 3] += Math.sign(x) * CFG.jowl * jw; }
    if (CFG.jaw) { const ang = sm(0.035, 0.065, Math.abs(x)) * sm(MOUTHY + 0.01, MOUTHY - 0.02, y) * (1 - sm(MOUTHY - 0.05, MOUTHY - 0.075, y)) * sm(EZ - 0.1, EZ - 0.07, z) * (1 - sm(EZ - 0.02, EZ + 0.01, z)) * hw;
      if (ang > 0) { bPos[v * 3] += Math.sign(x) * CFG.jaw * ang; nj++; } }
    const b = BEARD[v] * (Math.abs(x) < 0.02 && y > MOUTHY - 0.012 ? 0 : 1);
    if (CFG.beard && b > 0.05) { const d = (CFG.beard.depth || 0) * Math.min(1, b * 1.4); bPos[v * 3] += N0[v * 3] / 127 * d; bPos[v * 3 + 1] += N0[v * 3 + 1] / 127 * d; bPos[v * 3 + 2] += N0[v * 3 + 2] / 127 * d; nd++; } }
  console.error('jaw', nj, 'beard depth', nd); }
// narrower shoulders (the owner, 27 Oct): each arm's joint (shoulder01) and all under it moved in along its clavicle
// by (1 - CFG.shoulder) of its length (in, not down), each point of the body and the clothes by its weights on those
// bones (the sleeves with the arms); the binds and the joints' rest offsets moved with them below (as Dan's were)
const SKEL = B.J.skeleton, kidsOf = SKEL.map((b, i) => SKEL.map((c, j) => (c.parent === i ? j : -1)).filter((j) => j >= 0));
const subtree = (i, out = new Set()) => { out.add(i); for (const c of kidsOf[i]) subtree(c, out); return out; };
const SHOULDER = [];
if (CFG.shoulder && CFG.shoulder !== 1) for (const side of ['L', 'R']) {
  const ci = SKEL.findIndex((b) => b.name === 'clavicle.' + side), si = SKEL.findIndex((b) => b.name === 'shoulder01.' + side), arm = subtree(si);
  const D = [0, 2].map((k) => (SKEL[si].head[k] - SKEL[ci].head[k]) * (CFG.shoulder - 1)); const Dv = [D[0], 0, D[1]];
  let n = 0;
  for (const [src, P, cnt] of [[B, bPos, nB], [PK, pPos, nP]]) { const si4 = src.get('skinIndex'), sw4 = src.get('skinWeight');
    for (let v = 0; v < cnt; v++) { let w = 0; for (let j = 0; j < 4; j++) if (arm.has(si4[v * 4 + j])) w += sw4[v * 4 + j] / 255; if (!w) continue;
      P[v * 3] += Dv[0] * w; P[v * 3 + 2] += Dv[2] * w; n++; } }
  SHOULDER.push({ side, ci, si, arm, D: Dv }); console.error('shoulder', side, Dv.map((x) => (x * 100).toFixed(2)).join(','), 'cm,', n, 'points');
}
// (cast2) the shoulders' top line sloped down from the neck to the arm, the deltoid's corner rounded: a smooth field on
// the body and the garments alike, by height and distance out from the middle (the base's own skeleton: the shoulder
// joint 1.52 m up); the arms' joints as they are
if (CFG.slope) {
  const Sy = SKEL.find((b) => b.name === 'shoulder01.L').head[1], D = CFG.slope.drop; let n = 0;
  for (const [P, cnt] of [[bPos, nB], [pPos, nP]]) for (let v = 0; v < cnt; v++) {
    const x = Math.abs(P[v * 3]), y = P[v * 3 + 1]; if (y < Sy - 0.1 || x < 0.06 || x > 0.34) continue;
    const w = sm(0.07, 0.22, x) * sm(Sy - 0.09, Sy - 0.015, y) * (1 - sm(0.275, 0.335, x)); if (w <= 0) continue;
    P[v * 3 + 1] -= D * w; n++; }
  console.error('slope', n, 'points');
}
// the beard's shells: the skin's triangles with some beard, copied CFG.shells.layers times, each copy out along the
// skin's normals (tapering to nothing at the beard's edge, so each shell meets the skin there); new points after the
// body's own (nB + layer * count + k), each with its source point's uv, normal and weights
const shell = (() => {
  // (forge v2.3, HB: Mr. Big's shells AND fine cards over them (library.mjs beardCards), one primitive with one texture:
  // the shells' strokes in the skin's uv space squeezed into the left SX of it, the cards' strand strip the rest. Their
  // points after the body's: the shells' layers, then the cards' (each with its root's weights and normal))
  const S = CFG.shells, CC = globalThis.process?.env?.HB_NOCARDS ? null : CFG.cards, layers = globalThis.process?.env?.HB_NOSHELLS ? 0 : S?.layers || 0; if (!layers && !CC) return null;
  const T = [], src = new Map(), gap = mouthGap({ MOUTHY, EZ, half: MH });
  // (FORGE: no shell over the mouth: a triangle with a point inside the lips' outline (mouthGap, the lens from corner to
  // corner; v2.2's was a box) has none, so the open mouth never shows hair stretched across it: Mr. Big's 'beard shards'
  // fix, by rule)
  const inMouth = (v) => gap([bPos[v * 3], bPos[v * 3 + 1], bPos[v * 3 + 2]]) > 0.0003;
  // (and none across the parting by the mouth's corners: the jaw opens it, and a shell over it stretches into a shard)
  // (FC: where the mouth opens (its own width and 2 mm); v2.3 cut out to 3.8 cm, a bare slot of skin past the corners.
  // Past them the skin does not part (face.js's split is soft there): the shells stay, laid low over the parting's line
  // (below), so they stretch with the skin under them and stand no shard)
  const straddle = (...vs) => { const ys = vs.map((v) => bPos[v * 3 + 1] - MOUTHY); return Math.max(...ys) > -0.001 && Math.min(...ys) < 0.001 && vs.some((v) => Math.abs(bPos[v * 3]) < MH + 0.002 && bPos[v * 3 + 2] > EZ - 0.012); };
  const lowBy = (v) => { const ax = Math.abs(bPos[v * 3]), dy = Math.abs(bPos[v * 3 + 1] - MOUTHY); return ax > MH + 0.016 || dy > 0.007 || bPos[v * 3 + 2] < EZ - 0.02 ? 1 : 1 - (1 - sm(0.002, 0.007, dy)) * (1 - sm(MH + 0.004, MH + 0.016, ax)) * 0.75; };
  let cut = 0; if (layers) for (let q = 0; q < skinT.length; q += 3) { const a = skinT[q], b = skinT[q + 1], c = skinT[q + 2]; if (Math.max(BEARD[a], BEARD[b], BEARD[c]) > 0.05) { if (inMouth(a) || inMouth(b) || inMouth(c) || straddle(a, b, c)) { cut++; continue; } T.push(a, b, c); } }
  if (layers) console.error('beard shells: mouth outline cleared', cut, 'triangles');
  const verts = [...new Set(T)]; verts.forEach((v, k) => src.set(v, k));
  const nS = verts.length, N0 = B.get('normal'), triS = [], PS = new Float32Array(nS * layers * 3);
  for (let L = 0; L < layers; L++) {
    const f = (L + 1) / layers;
    // (H5: the beard's outline tapered over more of its edge (a trimmed beard thins to its line) and lumpy by clumps of about
    // 8 mm (S.clump of the depth either way), so its silhouette breaks up instead of standing as one even shell)
    verts.forEach((v, k) => { const tp = sm(0.0, S.taper ?? 0.55, BEARD[v]) * (1 + (S.clump ?? 0) * (vnoise(bPos[v * 3] * 125 + 3, bPos[v * 3 + 1] * 125, bPos[v * 3 + 2] * 125) - 0.5) * 2), d = S.depth * f * tp * (Math.abs(bPos[v * 3]) < 0.03 && bPos[v * 3 + 1] > MOUTHY ? 0.7 : 1) * lowBy(v);
      // (forge v2.3: by the mouth, a shell over the upper lip goes out, never down past the parting, and one under it never
      // up past it: face.js opens the jaw at the parting, and a shell point on the other side of it went with the other
      // lip: the 'teeth' of hair hanging into an open mouth)
      let nx = N0[v * 3] / 127, ny = N0[v * 3 + 1] / 127, nz = N0[v * 3 + 2] / 127; const y0 = bPos[v * 3 + 1] - MOUTHY;
      if (Math.abs(bPos[v * 3]) < 0.045 && bPos[v * 3 + 2] > EZ - 0.02 && Math.abs(y0) < 0.025) { if (y0 > 0) ny = Math.max(ny, 0); else ny = Math.min(ny, 0); const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l; }
      const n3 = [nx, ny, nz]; for (let c = 0; c < 3; c++) PS[(L * nS + k) * 3 + c] = bPos[v * 3 + c] + n3[c] * d; });
    for (const v of T) triS.push(nB + L * nS + src.get(v));
  }
  if (layers) console.error('beard shells', layers, 'x', T.length / 3, 'triangles,', nS, 'points each');
  const SX = CC ? 0.75 : 1, nSh = nS * layers;
  const C0 = CC ? beardCards({ P: bPos, N: N0, T: skinT, mask: BEARD }, { MOUTHY, EZ, EY, half: MH }, CC.groom, CC.seed || 7, { u0: SX }) : null;
  if (C0) console.error('beard cards', CC.groom, C0.count, 'cards,', C0.P.length / 3, 'points; cut short at the lips', C0.cut, 'dropped', C0.dropped);
  const nC = C0 ? C0.P.length / 3 : 0, P = new Float32Array((nSh + nC) * 3); P.set(PS); if (C0) P.set(C0.P, nSh * 3);
  const triC = C0 ? Array.from(C0.idx, (i) => nB + nSh + i) : [];
  return { T, verts, nS, layers, nSh, nC, n: nSh + nC, P, triS, triC, cards: C0, SX,
    isCard: (i) => i >= nB + nSh, layerOf: (i) => Math.floor((i - nB) / nS),
    srcOf: (i) => (i < nB ? i : i < nB + nSh ? verts[(i - nB) % nS] : C0.src[i - nB - nSh]),
    uvOf: (i) => [C0.UV[(i - nB - nSh) * 2], C0.UV[(i - nB - nSh) * 2 + 1]] };
})();
// the body's source with the shells' points after its own (their uv (the shells' squeezed by SX; the cards' their own),
// normal, weights: their source point's)
const BX = shell ? (() => {
  const n = nB + shell.n, cache = {};
  const ext = (k, w) => { const a = B.get(k), o = new a.constructor(n * w); o.set(a.subarray(0, nB * w)); for (let i = nB; i < n; i++) { if (k === 'uv' && shell.isCard(i)) { const u = shell.uvOf(i); o[i * 2] = Math.round(u[0] * 65535); o[i * 2 + 1] = Math.round((1 - u[1]) * 65535); continue; } const s0 = shell.srcOf(i); for (let c = 0; c < w; c++) o[i * w + c] = a[s0 * w + c]; if (k === 'uv') o[i * 2] = Math.round(a[s0 * 2] * shell.SX); } return o; };
  return { n, get: (k) => cache[k] || (cache[k] = ext(k, { uv: 2, normal: 3, skinIndex: 4, skinWeight: 4 }[k])) };
})() : B;
const bPosX = shell ? (() => { const o = new Float32Array(BX.n * 3); o.set(bPos); o.set(shell.P, nB * 3); return o; })() : bPos;
// the teeth (cast2): two rows round their arches and a tongue, in the bind space at his lips (the parting and the lips'
// front as face.js finds them: CFG.mouth), their points after the body's (and the shells'), all on the head bone. The
// upper row its own primitive ('teethUp'); the lower row and the tongue ('teethLow') turned down with his jaw by
// face.js's 'jaw' morph, as his chin's skin is. Shapes and shading after wagmi/mission/jane.js's (centrals 8.4 mm,
// laterals, canines, a premolar; the lower row 3.3 mm behind), sized by CFG.teethScale; their light baked into one
// small texture (rows: upper, lower, tongue), cut out by its alpha
const TEETH = CFG.teeth ? (() => {
  const ts = CFG.teethScale || 1, part = EY - CFG.mouth.below / 1000, lipZ = EYEFRONT + CFG.mouth.front / 1000;
  const ROWS = { up: { z: -6.3, c: 0.03 / ts, y0: 4.5, y1: -4.5, S: 26 * ts, r: [0, 200], teeth: [[8.4, -2.6, 0.6, 1.1], [6.4, -2.0, 1.0, 1.6], [7.4, -2.35, 'cusp'], [6.8, -1.7, 1.5, 1.5]] },
    lo: { z: -9.6, c: 0.036 / ts, y0: 0, y1: -8, S: 21 * ts, r: [216, 400], teeth: [[5.3, -1.1, 0.35, 0.6], [5.8, -1.15, 0.6, 0.9], [6.6, -1.45, 'cusp'], [6.8, -0.9, 1.4, 1.4]] } };
  // (forge v2, 'the open mouth reads as a grille': the corners between teeth rounded less (0.55x), the line between two
  // teeth a soft shade 0.35 mm wide (not a dark 0.16 mm cut), each tooth its own slight shade and warmth, the whole row
  // dimmer and darker toward the back as a mouth's inside is lit; the gaps at the biting edge kept small)
  const SOFT = CFG.teethSoft ?? 1;
  for (const R of Object.values(ROWS)) R.teeth = R.teeth.map((t) => [t[0] * ts, t[1], typeof t[2] === 'number' ? t[2] * (1 - 0.45 * SOFT) : t[2], typeof t[3] === 'number' ? t[3] * (1 - 0.45 * SOFT) : t[3]]);
  const toothVar = (k) => { let h = (k * 2654435761) >>> 0; h ^= h >>> 15; return ((h & 0xffff) / 65535 - 0.5); };
  const TW = 1024, TH = 512, img = new Uint8Array(TW * TH * 4);
  const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const cr = (q, r) => (q < r ? r - Math.sqrt(Math.max(0, r * r - (r - q) ** 2)) : 0);
  const tone = CFG.teethTone || [236, 226, 204];
  // (each row's teeth into its band of the texture: the outline, rounded corners, the notches between teeth; a convex
  // shade across each, darker up toward the gum and round to the sides, as jane.js's vertex colours had it)
  for (const [key, T] of Object.entries(ROWS)) {
    const lower = key === 'lo', sg = lower ? -1 : 1, spans = []; let s0 = 0; for (const t of T.teeth) { spans.push([s0, s0 + t[0], t]); s0 += t[0]; }
    for (let i = 0; i < TW; i++) {
      const s = -T.S + (2 * T.S * (i + 0.5)) / TW, a = Math.abs(s), sp = spans.find((q) => a < q[1]) || spans[spans.length - 1];
      const w = sp[1] - sp[0], u = Math.min(w, a - sp[0]), t = sp[2];
      let e; if (t[2] === 'cusp') { const d = Math.abs(u - w / 2) / (w / 2); e = t[1] + sg * (0.75 * (Math.sqrt(d * d + 0.04) - 0.2) + cr(u, 0.9) + cr(w - u, 0.9)); } else e = t[1] + sg * (cr(u, t[2]) + cr(w - u, t[3]));
      const x = (u / w) * 2 - 1, tk = spans.indexOf(sp) * Math.sign(s || 1) + (lower ? 40 : 0), tv = 1 + 0.06 * SOFT * toothVar(tk + 7);
      const across = (1 - 0.22 * x * x) * (SOFT ? (0.84 + 0.16 * ss(0, 0.35, Math.min(u, w - u))) * tv : 0.72 + 0.28 * ss(0, 0.16, Math.min(u, w - u)));
      const side = 1 - (lower ? 0.92 * ss(2.5 * ts, 12 * ts, a) : 0.88 * ss((SOFT ? 3.6 : 4.5) * ts, (SOFT ? 14 : 17) * ts, a));
      for (let j = T.r[0]; j < T.r[1]; j++) {
        const y = T.y0 + ((T.y1 - T.y0) * (j - T.r[0] + 0.5)) / (T.r[1] - T.r[0]), inn = sg * (y - e), al = Math.min(1, Math.max(0, inn / 0.09 + 0.5));
        const g = ss(2.5, 7, inn), k = across * (0.88 + 0.12 * ss(0, 0.6, inn)) * side * (lower ? 0.5 * (0.5 + 0.5 * ss(-4, -0.8, y)) : 0.32 + 0.68 * ss(3.2, -2, y)) * (SOFT ? 0.86 : 1), o = (j * TW + i) * 4;
        img[o] = Math.round((tone[0] - 16 * g) * k); img[o + 1] = Math.round((tone[1] - 26 * g) * k); img[o + 2] = Math.round((tone[2] - 40 * g) * k); img[o + 3] = Math.round(al * 255);
      }
    }
  }
  // (the tongue's band: a dark, wet red, lighter at its tip and top; FC: deeper and darker (it sits in the mouth's shade:
  // 150/62/64 read as a pink slab under the study's rim))
  // (G7a: browner and darker toward its back and its root (u: round the tongue, its tip at u = 0.25; the back half in
  // the mouth's dark), the blue taken down (128/50/54 under the cool rim read as a lavender slab))
  for (let j = 416; j < TH; j++) for (let i = 0; i < TW; i++) { const o = (j * TW + i) * 4, f = 0.45 + 0.4 * ((j - 416) / (TH - 416)), fr = 0.5 + 0.5 * Math.sin(2 * Math.PI * (i + 0.5) / TW), k = f * (0.6 + 0.4 * fr);
    img[o] = Math.round(Math.min(255, 196 * k)); img[o + 1] = Math.round(72 * k); img[o + 2] = Math.round(60 * k); img[o + 3] = 255; }
  // the geometry: each row a band round its arch (x across, the arch's curve going back), a few rows of points down it
  const pts = [], uvs = [], nrm = [], up = [], lo = [];
  const add = (p, uv, n) => { pts.push(...p); uvs.push(uv[0], uv[1]); const l = Math.hypot(...n) || 1; nrm.push(...n.map((c) => c / l)); return pts.length / 3 - 1; };
  for (const [key, T] of Object.entries(ROWS)) {
    const lower = key === 'lo', tab = [[0, 0]]; for (let x = 0, s = 0; s < T.S + 1; ) { const d = 0.02, sl = 2 * T.c * x; s += d * Math.sqrt(1 + sl * sl); x += d; tab.push([s, x]); }
    const xAt = (s) => { const a = Math.abs(s); let i = 1; while (i < tab.length - 1 && tab[i][0] < a) i++; const [s1, x1] = tab[i - 1], [s2, x2] = tab[i]; return Math.sign(s) * (x1 + ((x2 - x1) * (a - s1)) / Math.max(1e-9, s2 - s1)); };
    const N = Math.round((2 * T.S) / 0.9), YS = lower ? [T.y0, -0.8, -2, (T.y0 + 2 * T.y1) / 3, T.y1] : [T.y0, (T.y0 * 2 + T.y1) / 3, 1.5, -1, T.y1];
    const base = pts.length / 3, list = lower ? lo : up;
    for (let i = 0; i <= N; i++) {
      const s = -T.S + (2 * T.S * i) / N, x = xAt(s), n = [2 * T.c * x, lower ? 0.15 : 0.06, 1];
      for (const y of YS) add([x / 1000, part + y / 1000, lipZ + (T.z - T.c * x * x) / 1000], [(s + T.S) / (2 * T.S), (T.r[0] + ((T.y0 - y) / (T.y0 - T.y1)) * (T.r[1] - T.r[0])) / TH], n);
    }
    const RN = YS.length; for (let i = 0; i < N; i++) for (let r = 0; r < RN - 1; r++) { const a = base + i * RN + r, b = a + RN; list.push(a, a + 1, b, b, a + 1, b + 1); }
  }
  // the tongue: a flattened ball low behind the lower row (jane.js's), on the lower list
  // (FC, talking faces: it lies on the mouth's floor, as a speaking tongue at rest does: its top 5.5 mm under the
  // parting (4.4 under the incisors' edge), its tip 13.5 mm behind the lips' front, inside the lower arch (13 mm half
  // wide). Face.js turns the jaw about a hinge behind the ears, so the incisors, further out, drop faster than the tongue
  // behind them: the old one (its top 2.6 mm under the parting, its tip 1.9 mm behind the incisors) rose over their edge
  // mid-word and showed pushed out between the teeth (young mother, office worker, mechanic). The talk gate measures it)
  { const base = pts.length / 3, SEG = 20, RNG = 10, TX = 0.013 * ts, TY = 0.0044, TZ = 0.0145;
    for (let r = 0; r <= RNG; r++) for (let k = 0; k <= SEG; k++) { const th = (r / RNG) * Math.PI, ph = (k / SEG) * 2 * Math.PI, x = Math.sin(th) * Math.cos(ph), y = Math.cos(th), z = Math.sin(th) * Math.sin(ph);
      // (G7a: its normals turned out of the mouth (forward), so no light from above or behind lights its top)
      const nl = Math.hypot(x / TX, y / TY, z / TZ), nn = [0.3 * x / TX / nl + MOUTH_OUT[0], 0.3 * y / TY / nl + MOUTH_OUT[1], 0.3 * z / TZ / nl + MOUTH_OUT[2]];
      add([x * TX, part - 0.0099 + y * TY, lipZ - 0.028 + z * TZ], [k / SEG, (416 + (0.5 + 0.5 * y) * 95) / TH], CFG.mouthIn === false ? [x / TX, y / TY, z / TZ] : nn); }
    for (let r = 0; r < RNG; r++) for (let k = 0; k < SEG; k++) { const a = base + r * (SEG + 1) + k, b = a + SEG + 1; lo.push(a, b, a + 1, a + 1, b, b + 1); } }
  console.error('teeth', pts.length / 3, 'points; up', up.length / 3, 'lo+tongue', lo.length / 3, 'tris; parting', part.toFixed(4), 'lipZ', lipZ.toFixed(4));
  return { P: Float32Array.from(pts), UV: uvs, N: nrm, n: pts.length / 3, up, lo, img, TW, TH };
})() : null;
// the body's source with the teeth's points after the shells' (their own uv and normals; all on the head bone)
const BT = TEETH ? (() => {
  const n0 = BX.n ?? nB, n = n0 + TEETH.n, cache = {};
  const ext = (k) => {
    const w = { uv: 2, normal: 3, skinIndex: 4, skinWeight: 4 }[k], a = BX.get(k), o = new a.constructor(n * w); o.set(a.subarray(0, n0 * w));
    for (let i = 0; i < TEETH.n; i++) { const q = (n0 + i) * w;
      if (k === 'uv') { o[q] = Math.round(TEETH.UV[i * 2] * 65535); o[q + 1] = Math.round((1 - TEETH.UV[i * 2 + 1]) * 65535); }
      else if (k === 'normal') for (let c = 0; c < 3; c++) o[q + c] = Math.round(TEETH.N[i * 3 + c] * 127);
      else if (k === 'skinIndex') { o[q] = HEADI; o[q + 1] = o[q + 2] = o[q + 3] = 0; }
      else { o[q] = 255; o[q + 1] = o[q + 2] = o[q + 3] = 0; } }
    return o;
  };
  return { n, n0, get: (k) => cache[k] || (cache[k] = ext(k)) };
})() : null;
const bPosT = TEETH ? (() => { const o = new Float32Array(BT.n * 3); o.set(bPosX.subarray(0, BT.n0 * 3)); o.set(TEETH.P, BT.n0 * 3); return o; })() : bPosX;
// the pack's pieces: the hair, the garments (a part of one: its triangles above or under the waist), the shoes
const HAIR_BODY = CFG.hair === 'none' || CFG.hair.startsWith('body:'), HAIR = CFG.hair.replace('body:', '');
const hairT = CFG.hair === 'none' ? [] : Array.from(HAIR_BODY ? tris(B, bIdx, 'hair:' + HAIR) : tris(PK, pIdx, 'hair:' + HAIR));
// (the hair to her shoulders, with a soft wave: its points under cut drawn up (k of their drop kept), then each pushed
// out from the head's upright axis by a wave of its original height (only outward, so none goes into her neck or face),
// fading in from top down)
if (CFG.hairShape && !HAIR_BODY) {
  const { cut, k, amp = 0, len = 0.08, top = 1.5, zc = 0.03 } = CFG.hairShape; let moved = 0;
  for (const v of new Set(hairT)) { const y0 = pPos[v * 3 + 1];
    if (amp && y0 < top) { const x = pPos[v * 3], z = pPos[v * 3 + 2] - zc, r = Math.hypot(x, z) || 1, f = Math.min(1, (top - y0) / 0.06);
      const d = amp * f * (0.5 + 0.5 * Math.sin((top - y0) / len * 2 * Math.PI - Math.PI / 2)); pPos[v * 3] += x / r * d; pPos[v * 3 + 2] += z / r * d; }
    if (y0 < cut) { pPos[v * 3 + 1] = cut - (cut - y0) * k; moved++; } }
  console.error('hair shaped', moved);
}
// (forge v2.1, tousle: a short card cut stands off the skull as one even shell (the gates' helmet check: the outer cards'
// standoff varies by under 18 %). Each card point pushed out from the head's middle by a low-frequency noise of its place
// (clumps of ~3 cm, only outward, none over the face), so the hair lifts in tufts like hair, not a cap)
if (CFG.hairTousle && !HAIR_BODY) { const T = CFG.hairTousle, c = [0, EY + 0.03, EZ - 0.09]; let n = 0;
  const hh = (i, j, k) => { const x = Math.sin(i * 127.1 + j * 311.7 + k * 74.7) * 43758.5453; return x - Math.floor(x); };
  const tn = (x, y, z) => { const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), f = [x - xi, y - yi, z - zi].map((t) => t * t * (3 - 2 * t)), L = (a, b, t) => a + (b - a) * t, h = (i, j, k) => hh(xi + i, yi + j, zi + k);
    return L(L(L(h(0, 0, 0), h(1, 0, 0), f[0]), L(h(0, 1, 0), h(1, 1, 0), f[0]), f[1]), L(L(h(0, 0, 1), h(1, 0, 1), f[0]), L(h(0, 1, 1), h(1, 1, 1), f[0]), f[1]), f[2]); };
  for (const v of new Set(hairT)) { const p = [pPos[v * 3], pPos[v * 3 + 1], pPos[v * 3 + 2]]; if (p[2] > EZ - 0.02 && p[1] < EY + 0.045) continue;
    const d = [p[0] - c[0], p[1] - c[1], p[2] - c[2]], L = Math.hypot(...d) || 1, nz = tn(p[0] / T.size + 11, p[1] / T.size, p[2] / T.size + 5), a = T.amp * Math.max(0, nz - 0.5) / 0.5 * Math.min(1, (p[1] - (EY - 0.05)) / 0.05);
    if (a > 0) { for (let k = 0; k < 3; k++) pPos[v * 3 + k] += (d[k] / L) * a; n++; } }
  console.error('hair tousled', n, 'points'); }
// (a part of a garment: its islands (triangles joined by shared vertices) whose middle is above the waist, or under it;
// a cut by height left the hem ragged)
function islands(all) {
  const par = new Map(), find = (a) => { while (par.get(a) !== a) { par.set(a, par.get(par.get(a))); a = par.get(a); } return a; };
  for (const v of all) if (!par.has(v)) par.set(v, v);
  for (let q = 0; q < all.length; q += 3) { const a = find(all[q]); par.set(find(all[q + 1]), a); par.set(find(all[q + 2]), a); }
  const sum = new Map(); for (let q = 0; q < all.length; q += 3) { const r = find(all[q]), e = sum.get(r) || [0, 0]; e[0] += triY(all, q, pPos); e[1]++; sum.set(r, e); }
  return (q) => { const e = sum.get(find(all[q])); return e[0] / e[1]; };
}
const wearT = CFG.wear.map(([name, part]) => { const all = tris(PK, pIdx, 'outfit:' + name), mid = islands(all), out = []; for (let q = 0; q < all.length; q += 3) { const y = mid(q); if (part === 'all' || (part === 'top' ? y > WAIST : y <= WAIST)) out.push(all[q], all[q + 1], all[q + 2]); } return out; });
const shoeT = CFG.shoes === 'none' ? [] : Array.from(tris(PK, pIdx, 'outfit:' + CFG.shoes));
// FORGE: no shoulder pads, by rule (the owner: "natural shape not like shoulder pads, that goes for every human"):
// over the shoulders and the sleeve caps, every point of a tailored garment (not a puffer or a lofted hoodie) is kept
// within CFG.hug.max of the body under it (the nearest point of the whole body, hidden ones too), the excess taken off
// along its own offset; a smooth weight by height and distance out, so the line from the neck to the arm follows the
// body's own (Mr. Big's jacket-dome fix, edit.mjs, made general)
if (CFG.hug !== false) {
  const H = CFG.hug || {}, maxO = H.max ?? 0.011, shY = B.J.skeleton.find((b) => b.name === 'shoulder01.L').head[1] + (JMOVE ? JMOVE[B.J.skeleton.findIndex((b) => b.name === 'shoulder01.L')][1] : 0);
  const bodyVs = new Set(); for (let q = bodyG.start; q < bodyG.start + bodyG.count; q++) bodyVs.add(bIdx[q]);
  const near = nearestOf(bPos, [...bodyVs]); let n = 0, maxCut = 0;
  CFG.wear.forEach(([, , , mode, o], wi) => { if (mode === 'puffer' || o?.puff) return;
    for (const v of new Set(wearT[wi])) { const x = Math.abs(pPos[v * 3]), y = pPos[v * 3 + 1]; const w = sm(shY - 0.11, shY - 0.05, y) * sm(0.06, 0.1, x) * (1 - sm(0.3, 0.36, x)); if (w <= 0) continue;
      const q = near([pPos[v * 3], y, pPos[v * 3 + 2]]); if (q < 0) continue; const d = [pPos[v * 3] - bPos[q * 3], y - bPos[q * 3 + 1], pPos[v * 3 + 2] - bPos[q * 3 + 2]], L = Math.hypot(...d); if (L <= maxO) continue;
      const cut = (L - maxO) * w; maxCut = Math.max(maxCut, cut); for (let c = 0; c < 3; c++) pPos[v * 3 + c] -= (d[c] / L) * cut; n++; } });
  console.error('shoulder hug', n, 'points pulled in, at most', (maxCut * 1000).toFixed(1), 'mm');
}
// (under the puffer, her tee only shows at the neck: its triangles lower than that dropped, so none pokes through the
// jacket as it drapes)
if (CFG.puffer && CFG.wear.some((w) => w[3] !== 'puffer' && !w[4]?.puff && w[1] !== 'bottom')) { const ti = CFG.wear.findIndex((w) => w[3] !== 'puffer' && !w[4]?.puff && w[1] !== 'bottom'), neck0 = NECKY - 0.055, L = wearT[ti], out = [], mid = islands(L);
  for (let q = 0; q < L.length; q += 3) { const ys = [L[q], L[q + 1], L[q + 2]].map((v) => pPos[v * 3 + 1]); if (mid(q) > WAIST && Math.max(...ys) < neck0) continue; out.push(L[q], L[q + 1], L[q + 2]); }
  console.error('tee under the puffer:', (L.length - out.length) / 3, 'of', L.length / 3, 'triangles dropped'); wearT[ti] = out; }
// (the jacket's lapels, crumpled when puffed: cut off above the neck's base, a clean round neckline over the tee's)
if (CFG.puffer?.cutCollar) { const pi = CFG.wear.findIndex((w) => w[3] === 'puffer' || w[4]?.puff), L = wearT[pi], out = [], cy = NECKY - CFG.puffer.cutCollar;
  for (let q = 0; q < L.length; q += 3) { const ys = [L[q], L[q + 1], L[q + 2]].map((v) => pPos[v * 3 + 1]); if (Math.min(...ys) > cy) continue; out.push(L[q], L[q + 1], L[q + 2]); }
  console.error('collar cut:', (L.length - out.length) / 3, 'triangles'); wearT[pi] = out; }
// (cast2) the puffer: the garment worn in 'puffer' mode inflated along its own (welded, smooth) normals by its loft plus
// a channel's: quilted rings round the body (by height) and round each sleeve (by the distance down the arm from the
// shoulder joint), a channel's profile round (0 at a baffle's seam, 1 in its middle); less at the collar. The texture's
// light follows the same quilting (puffQuilt), from the points before they were puffed (PUFF0)
const PUFF0 = new Map(), PUFFARM = new Map();
const SKL = (n) => B.J.skeleton.find((b) => b.name === n).head;
function puffQuilt(p, armW) {
  const P = CFG.puffer;
  const side = p[0] >= 0 ? 'L' : 'R', sh = SKL('upperarm01.' + side), wr = SKL('wrist.' + side), ax = [wr[0] - sh[0], wr[1] - sh[1], wr[2] - sh[2]], al = Math.hypot(...ax);
  const along = ((p[0] - sh[0]) * ax[0] + (p[1] - sh[1]) * ax[1] + (p[2] - sh[2]) * ax[2]) / al;
  const hT = (p[1] - WAIST) / P.pitch, hA = along / P.sleevePitch;
  const h = armW > 0.5 ? hA : hT, f = h - Math.floor(h), q = 0.5 - 0.5 * Math.cos(2 * Math.PI * f);
  const dist = Math.min(f, 1 - f) * (armW > 0.5 ? P.sleevePitch : P.pitch);
  return { q, dist };
}
if (CFG.puffer) {
  const wi = CFG.wear.findIndex((w) => w[3] === 'puffer' || w[4]?.puff), T = wearT[wi], si4 = PK.get('skinIndex'), sw4 = PK.get('skinWeight');
  const armSet = new Set(SKEL.map((b, i) => [b.name, i]).filter(([n]) => /^(upperarm|lowerarm|wrist)/.test(n)).map(([, i]) => i));
  // (a puffer drapes, it doesn't cling: the jacket's body (not its sleeves) smoothed first, welded across its seams, so
  // it hangs straight over the bust and the waist; then puffed)
  { const keyS = (v) => Math.round(pPos[v * 3] * 1e4) + ',' + Math.round(pPos[v * 3 + 1] * 1e4) + ',' + Math.round(pPos[v * 3 + 2] * 1e4);
    const W0 = new Map(), wOf = new Map(); for (const v of new Set(T)) { const k = keyS(v); if (!W0.has(k)) W0.set(k, W0.size); wOf.set(v, W0.get(k)); }
    const nW = W0.size, adj = Array.from({ length: nW }, () => new Set()), pos = new Float64Array(nW * 3), arm = new Float32Array(nW);
    const ec = new Map(); for (let q = 0; q < T.length; q += 3) for (let e = 0; e < 3; e++) { const a = wOf.get(T[q + e]), b = wOf.get(T[q + (e + 1) % 3]); adj[a].add(b); adj[b].add(a); const k = a < b ? a + ',' + b : b + ',' + a; ec.set(k, (ec.get(k) || 0) + 1); }
    // (its open edges (the hem, the cuffs, the collar, the front's closing) held where they are: smoothing pulls them in)
    const edge = new Uint8Array(nW); for (const [k, c] of ec) if (c === 1) { const [a, b] = k.split(',').map(Number); edge[a] = edge[b] = 1; }
    for (const [v, w] of wOf) { for (let k = 0; k < 3; k++) pos[w * 3 + k] = pPos[v * 3 + k]; let aw = 0; for (let j = 0; j < 4; j++) if (armSet.has(si4[v * 4 + j])) aw += sw4[v * 4 + j] / 255; arm[w] = aw; }
    for (let it = 0; it < (CFG.puffer.smooth ?? 10); it++) { const nx = Float64Array.from(pos); for (let w = 0; w < nW; w++) { if (arm[w] > 0.3 || edge[w]) continue; let c = 0; const m = [0, 0, 0]; for (const o of adj[w]) { for (let k = 0; k < 3; k++) m[k] += pos[o * 3 + k]; c++; } if (!c) continue; for (let k = 0; k < 3; k++) nx[w * 3 + k] = pos[w * 3 + k] * 0.5 + (m[k] / c) * 0.5; } pos.set(nx); }
    for (const [v, w] of wOf) for (let k = 0; k < 3; k++) pPos[v * 3 + k] = pos[w * 3 + k]; }
  // (a stand collar: the jacket's lapels (above the neck's base less stand.from) laid round the neck as a clean band,
  // stand.h tall, stand.gap out from the skin, its height and turn kept from the lapels, blending in from below)
  if (CFG.puffer.stand) {
    const { from, h, gap } = CFG.puffer.stand, cy = NECKY - from, nz = SKL('neck01')[2];
    const NB = 36, rN = new Float32Array(NB).fill(0);
    for (const v of skinV) { const y = bPos[v * 3 + 1]; if (y < cy - 0.01 || y > cy + h + 0.01 || headW(v) > 0.5) continue; const x = bPos[v * 3], z = bPos[v * 3 + 2] - nz, r = Math.hypot(x, z); if (r > 0.12) continue; const b = Math.floor(((Math.atan2(x, z) + Math.PI) / (2 * Math.PI)) * NB) % NB; rN[b] = Math.max(rN[b], r); }
    for (let i = 0; i < NB; i++) if (!rN[i]) rN[i] = 0.06;
    const rAt = (th) => { const u = ((th + Math.PI) / (2 * Math.PI)) * NB - 0.5, i0 = ((Math.floor(u) % NB) + NB) % NB, f = u - Math.floor(u); return rN[i0] * (1 - f) + rN[(i0 + 1) % NB] * f; };
    const vs = [...new Set(T)]; let ymax = -9; for (const v of vs) ymax = Math.max(ymax, pPos[v * 3 + 1]);
    let n = 0;
    for (const v of vs) { const y = pPos[v * 3 + 1]; if (y < cy - 0.02) continue; const x = pPos[v * 3], z = pPos[v * 3 + 2] - nz, th = Math.atan2(x, z), r0 = Math.hypot(x, z);
      const t = Math.max(0, Math.min(1, (y - cy) / Math.max(0.01, ymax - cy))), b = sm(-0.02, 0.0, y - cy) * sm(0, 0.25, t + 0.001);
      const r = r0 + (rAt(th) + gap - r0) * b, ny = y + (cy + t * h - y) * sm(-0.02, 0, y - cy);
      pPos[v * 3] = Math.sin(th) * r; pPos[v * 3 + 2] = nz + Math.cos(th) * r; pPos[v * 3 + 1] = ny; n++; }
    console.error('stand collar', n, 'points; neck r', (rAt(0) * 100).toFixed(1), (rAt(Math.PI / 2) * 100).toFixed(1), 'cm');
  }
  // welded normals of the jacket as built
  const key = (v) => Math.round(pPos[v * 3] * 1e4) + ',' + Math.round(pPos[v * 3 + 1] * 1e4) + ',' + Math.round(pPos[v * 3 + 2] * 1e4);
  const wid = new Map(), acc = new Map();
  for (let q = 0; q < T.length; q += 3) {
    const [a, b, c] = [T[q], T[q + 1], T[q + 2]], A3 = (v) => [pPos[v * 3], pPos[v * 3 + 1], pPos[v * 3 + 2]], pa = A3(a), pb = A3(b), pc = A3(c);
    const u = pb.map((x, k) => x - pa[k]), w = pc.map((x, k) => x - pa[k]), n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    for (const v of [a, b, c]) { const k = key(v); const e = acc.get(k) || [0, 0, 0]; e[0] += n[0]; e[1] += n[1]; e[2] += n[2]; acc.set(k, e); }
  }
  // (outward: a normal pointing into the body (toward the body's axis) flipped)
  const verts = [...new Set(T)], neck = B.J.landmarks.neck ?? 1.45; let flipped = 0;
  const moves = verts.map((v) => {
    const p = [pPos[v * 3], pPos[v * 3 + 1], pPos[v * 3 + 2]]; let n = acc.get(key(v)); const l = Math.hypot(...n) || 1; n = n.map((c) => c / l);
    let armW = 0; for (let j = 0; j < 4; j++) if (armSet.has(si4[v * 4 + j])) armW += sw4[v * 4 + j] / 255;
    const { q } = puffQuilt(p, armW), P = CFG.puffer;
    const collar = sm(neck - 0.05, neck - 0.01, p[1]);
    const d = (P.loft + P.amp * q) * (1 - 0.85 * collar);
    return { v, p, n, d, armW };
  });
  // (orientation: most normals of a closed garment point out; one that points the other way than its own position's
  // horizontal offset from the body's middle is turned)
  for (const m of moves) { const o = [m.p[0], 0, m.p[2] - 0.0]; if (m.armW > 0.5) { const s = m.p[0] >= 0 ? 'L' : 'R', sh = SKL('upperarm01.' + s); o[0] = m.p[0] - sh[0]; o[1] = 0; } if (o[0] * m.n[0] + o[2] * m.n[2] < 0) { m.n = m.n.map((c) => -c); flipped++; } }
  for (const m of moves) { PUFF0.set(m.v, m.p); PUFFARM.set(m.v, m.armW); for (let k = 0; k < 3; k++) pPos[m.v * 3 + k] = m.p[k] + m.n[k] * m.d; }
  console.error('puffer', verts.length, 'points, flipped', flipped);
}
// (a fringe trimmed over the eyes: the hair's points in front of the face and under the brows drawn up to the brows'
// line (squashed toward it, a few mm out from the skin), so it falls to the side of her face and not across an eye)
if (CFG.trimFringe && !HAIR_BODY) {
  const eyY = (eyeC[0][1] + eyeC[1][1]) / 2, brow = eyY + CFG.trimFringe, front = EYEFRONT - 0.04; let moved = 0;
  for (const v of new Set(hairT)) { const x = pPos[v * 3], y = pPos[v * 3 + 1], z = pPos[v * 3 + 2];
    if (z < front || Math.abs(x) > 0.072 || y > brow) continue;
    const w = 1 - Math.max(0, Math.min(1, (Math.abs(x) - 0.055) / 0.017));
    pPos[v * 3 + 1] = y + (brow + (y - brow) * 0.12 - y) * w; pPos[v * 3 + 2] = z + 0.004 * w; moved++; }
  console.error('fringe trimmed', moved);
}

// FORGE v2 hair library (library.mjs): the bob tucked behind the ears, slicked hair pressed to the skull, balding (the
// crown's cards dropped, a fringe of them kept round the sides and back)
if (hairT.length && (CFG.tuck || CFG.slick || CFG.bald)) {
  const gB = group(B, 'body'), bi = bIdx.subarray(gB.start, gB.start + gB.count); let nBody = 0; for (const v of bi) nBody = Math.max(nBody, v + 1);
  const hctx = prepare({ bPos, nBody, bodyIdx: bi, uv: B.get('uv'), si: B.get('skinIndex'), sw: B.get('skinWeight'), SKEL, jpos: (n) => SKL(n), NECKY, WAIST, EY, EZ, sex: CFG.sex });
  const HP = HAIR_BODY ? bPos : pPos, hv = [...new Set(hairT)];
  if (CFG.tuck) console.error('bob tucked behind the ears:', tuckBob(hctx, HP, hv), 'points');
  if (CFG.slick) console.error('slicked:', slick(hctx, HP, hv, CFG.slick), 'points pressed');
  if (CFG.bald) { const kept = baldTris(hctx, HP, hairT, CFG.bald); console.error('balding: hair triangles', hairT.length / 3, '->', kept.length / 3); hairT.splice(0, hairT.length, ...kept); }
}
// (forge v2.3, HB: long hair framing the face (CFG.faceClear m): the hair's points beside the face (under the brows, over
// the chin, in front of the ears) moved out to at least faceClear from the middle, more the further forward, so the side
// locks fall outside the cheeks and never swing across them in a walk (the gates' hair on the face))
if (CFG.faceClear && hairT.length && !HAIR_BODY) { const FC = CFG.faceClear; let n = 0;
  for (const v of new Set(hairT)) { const x = pPos[v * 3], y = pPos[v * 3 + 1], z = pPos[v * 3 + 2], ax = Math.abs(x); if (y > EY + 0.03 || y < EY - 0.16 || z < EZ - 0.09 || ax > FC + 0.01) continue;
    const w = sm(EZ - 0.09, EZ - 0.05, z) * (1 - sm(EY + 0.012, EY + 0.03, y)), nx = Math.sign(x || 1) * Math.max(ax, FC + 0.01 * sm(EZ - 0.05, EZ, z)); if (w <= 0) continue;
    pPos[v * 3] = x + (nx - x) * w; pPos[v * 3 + 2] = z - 0.012 * w * sm(EZ - 0.06, EZ - 0.02, z); n++; }
  console.error('face cleared:', n, 'points out to', FC); }
// (forge v2.3, HB: a side part (CFG.sidePart { x, sweep }): a line from the front hairline back to the crown, x m to the
// character's left of the middle; the hair within 7 mm of it combed off it (the part opens), the wide side swept over
// toward the far temple, the narrow side laid down; every moved point kept at its own distance from the head's centre
// (it slides over the head, never into it); the part painted as skin in the scalp's paint. (Cutting the cards on the
// line was tried: the pack's cards are wide, so it opened a bald patch, not a line)
if (CFG.sidePart && hairT.length) { const SP = CFG.sidePart, HP = HAIR_BODY ? bPos : pPos, xp = SP.x ?? 0.026, HC = [0, EY + 0.02, EZ - 0.088]; let n = 0;
  for (const v of new Set(hairT)) { const x = HP[v * 3], y = HP[v * 3 + 1], z = HP[v * 3 + 2]; if (y < EY + 0.025 || z < EZ - 0.15) continue;
    const w = sm(EZ - 0.15, EZ - 0.115, z) * sm(EY + 0.025, EY + 0.06, y), dx = x - xp; if (w <= 0) continue;
    const push = Math.max(0, 0.009 - Math.abs(dx)) * (dx < 0 ? -1 : 1), sweep = dx < 0 ? -(SP.sweep ?? 0.012) * sm(0, 0.035, -dx) * (1 - sm(0.05, 0.075, Math.abs(x))) : 0.003 * sm(0, 0.02, dx);
    const nx = x + (push + sweep) * w, r0 = Math.hypot(x - HC[0], y - HC[1], z - HC[2]), r1 = Math.hypot(nx - HC[0], y - HC[1], z - HC[2]) || 1, k = r0 / r1;
    HP[v * 3] = HC[0] + (nx - HC[0]) * k; HP[v * 3 + 1] = HC[1] + (y - HC[1]) * k; HP[v * 3 + 2] = HC[2] + (z - HC[2]) * k; n++; }
  // (the hair pressed down into a groove along the line (within 1.2 cm of it, to a quarter of its height over the skull at
  // the line): the part reads by its shadow from every side, not only from above)
  { const G = capGeom({}); for (const v of new Set(hairT)) { const x = HP[v * 3], y = HP[v * 3 + 1], z = HP[v * 3 + 2], adx = Math.abs(x - xp); if (adx > 0.012 || y < EY + 0.045 || z < EZ - 0.14 || z > EZ - 0.01) continue;
      const dx = x - G.C[0], dy = y - G.C[1], dz = z - G.C[2], r = Math.hypot(dx, dy, dz), ph = Math.atan2(dx, dz), th = Math.asin(Math.max(-1, Math.min(1, dy / r))), rh = G.rHead(ph, th) + 0.0015; if (r <= rh) continue;
      const kk = 0.25 + 0.75 * sm(0.002, 0.012, adx), w2 = sm(EZ - 0.14, EZ - 0.11, z), r2 = r + (rh + (r - rh) * kk - r) * w2;
      HP[v * 3] = G.C[0] + dx / r * r2; HP[v * 3 + 1] = G.C[1] + dy / r * r2; HP[v * 3 + 2] = G.C[2] + dz / r * r2; } }
  console.error('side part at x', xp, ':', n, 'points combed and pressed'); }
// (cast2, the lead: 'a believable ponytail with some volume and strands') the tail (the hair's points more than 2 cm
// off her head's skin, under the crown) filled out: each 1 cm slice of it pushed out from its own middle by CFG.tail.puff,
// and two more copies of its cards turned about that middle by +/- tail.turn rad (a little narrower), so it reads round
// from every side, not as one flat sheet; the copies' points after the pack's, with their source's uv, normal (turned)
// and weights. (The rest of the hair as it is.)
// (the head's outline for headwear: the skull's radius by direction about a centre over the ears (a smoothed max of
// the head's skin), the band's height round the head; the cap and the hair under it both use it)
function capGeom(K) {
  const C = [0, EY + 0.02, EZ - 0.088], NP = 96, NT = 40, TH0 = -0.5, THN = Math.PI / 2;
  const grid = new Float32Array(NP * NT).fill(-1);
  const bi = (ph, th) => [((Math.round((ph / (2 * Math.PI)) * NP) % NP) + NP) % NP, Math.max(0, Math.min(NT - 1, Math.round(((th - TH0) / (THN - TH0)) * (NT - 1))))];
  for (const v of skinV) { if (headW(v) < 0.5) continue; const x = bPos[v * 3] - C[0], y = bPos[v * 3 + 1] - C[1], z = bPos[v * 3 + 2] - C[2], r = Math.hypot(x, y, z); if (y < -0.06) continue;
    const [i, j] = bi(Math.atan2(x, z), Math.asin(y / r)); grid[j * NP + i] = Math.max(grid[j * NP + i], r); }
  // (holes filled from their neighbours, a max over each 3x3 (no point of the skull under the cap), then smoothed)
  for (let pass = 0; pass < 6; pass++) for (let j = 0; j < NT; j++) for (let i = 0; i < NP; i++) { if (grid[j * NP + i] > 0) continue; let s0 = 0, c = 0; for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const jj = j + dj; if (jj < 0 || jj >= NT) continue; const g = grid[jj * NP + ((i + di + NP) % NP)]; if (g > 0) { s0 += g; c++; } } if (c) grid[j * NP + i] = s0 / c; }
  const filt = (f) => { const o = new Float32Array(grid.length); for (let j = 0; j < NT; j++) for (let i = 0; i < NP; i++) { const a = []; for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const jj = Math.max(0, Math.min(NT - 1, j + dj)); a.push(grid[jj * NP + ((i + di + NP) % NP)]); } o[j * NP + i] = f(a); } grid.set(o); };
  filt((a) => Math.max(...a)); filt((a) => a.reduce((x, y) => x + y, 0) / a.length); filt((a) => a.reduce((x, y) => x + y, 0) / a.length);
  const rHead = (ph, th) => { const u = (((ph / (2 * Math.PI)) * NP) % NP + NP) % NP, w = Math.max(0, Math.min(NT - 1.001, ((th - TH0) / (THN - TH0)) * (NT - 1))), i0 = Math.floor(u), j0 = Math.floor(w), fu = u - i0, fw = w - j0, g = (i, j) => grid[j * NP + (i % NP)];
    return (g(i0, j0) * (1 - fu) + g(i0 + 1, j0) * fu) * (1 - fw) + (g(i0, j0 + 1) * (1 - fu) + g(i0 + 1, j0 + 1) * fu) * fw; };
  const cutY = K.cut || ((ph) => EY + (K.front ?? 0.042) * (0.5 + 0.5 * Math.cos(ph)) + (K.side ?? 0.02) * Math.sin(ph) ** 2 * 0 + (K.back ?? -0.006) * (0.5 - 0.5 * Math.cos(ph)) + (K.side ?? 0.02) * (1 - Math.abs(Math.cos(ph))) * 0.35);
  // (the band's elevation at each azimuth: where the skin's ray reaches cutY)
  const thMin = (ph) => { let th = 0; for (let it = 0; it < 6; it++) { const r = rHead(ph, th); th = Math.asin(Math.max(-0.99, Math.min(0.99, (cutY(ph) - C[1]) / r))); } return th; };
  return { C, NP, NT, TH0, THN, rHead, thMin, cutY };
}
// FORGE: hair under headwear: every hair point above the band (less 5 mm) drawn in to just under the crown's inside
// (the skull's radius + 70 % of the crown's offset), so no card pokes through a beanie or a cap; under it, as it was
if (CFG.cap?.make && hairT.length) {
  const { C, rHead, thMin, cutY } = capGeom(CFG.cap), off = CFG.cap.off ?? 0.006; let n = 0;
  for (const v of new Set(hairT)) { const x = pPos[v * 3] - C[0], y = pPos[v * 3 + 1] - C[1], z = pPos[v * 3 + 2] - C[2], r = Math.hypot(x, y, z), ph = Math.atan2(x, z), th = Math.asin(Math.max(-1, Math.min(1, y / r)));
    const band = cutY(ph) - 0.005, wy = pPos[v * 3 + 1]; if (wy < band - 0.012) continue;
    const lim = rHead(ph, th) + off * 0.7, f = sm(band - 0.012, band, wy); if (r <= lim) continue;
    const r2 = r + (lim - r) * f; pPos[v * 3] = C[0] + x / r * r2; pPos[v * 3 + 1] = C[1] + y / r * r2; pPos[v * 3 + 2] = C[2] + z / r * r2; n++; }
  console.error('hair under the headwear', n, 'points drawn in');
  // (forge v2: a tucked bob's fringe under a beanie goes up under its cuff: the forehead clear, no hair slab over it)
  if (CFG.tuck) { let m = 0; for (const v of new Set(hairT)) { const x = pPos[v * 3], y = pPos[v * 3 + 1], z = pPos[v * 3 + 2]; if (z < EZ - 0.035 || Math.abs(x) > 0.075 || y > cutY(Math.atan2(x - C[0], z - C[2])) + 0.01 || y < EY - 0.03) continue;
      const ph = Math.atan2(x - C[0], z - C[2]), band = cutY(ph) + 0.006, th = Math.asin(Math.max(-1, Math.min(1, (band - C[1]) / rHead(ph, 0.3)))), r2 = rHead(ph, th) + off * 0.5;
      pPos[v * 3] = C[0] + Math.sin(ph) * Math.cos(th) * r2; pPos[v * 3 + 1] = band; pPos[v * 3 + 2] = C[2] + Math.cos(ph) * Math.cos(th) * r2; m++; }
    console.error('fringe under the beanie', m, 'points'); }
}
let PKX = PK, pPosX = pPos, hairTX = hairT, BUN = null;
if (CFG.tail && hairT.length) {
  const hv = [...new Set(hairT)], headPts = []; for (const v of skinV) if (headW(v) > 0.6) headPts.push(bPos[v * 3], bPos[v * 3 + 1], bPos[v * 3 + 2]);
  const off = new Map();
  for (const v of hv) { const x = pPos[v * 3], y = pPos[v * 3 + 1], z = pPos[v * 3 + 2]; let m = 1; for (let k = 0; k < headPts.length; k += 3) { const dx = headPts[k] - x, dy = headPts[k + 1] - y, dz = headPts[k + 2] - z, d2 = dx * dx + dy * dy + dz * dz; if (d2 < m) m = d2; } off.set(v, Math.sqrt(m)); }
  const isTail = (v) => off.get(v) > 0.02 && pPos[v * 3 + 2] < EZ - 0.09 && pPos[v * 3 + 1] < EY + 0.06;
  const tail = hv.filter(isTail), slice = (y) => Math.floor(y / 0.01), C = new Map();
  const TS = new Set(tail); // (the tail as found before any lift: a lifted point stays the tail's)
  for (const v of tail) { const k = slice(pPos[v * 3 + 1]), e = C.get(k) || [0, 0, 0]; e[0] += pPos[v * 3]; e[1] += pPos[v * 3 + 2]; e[2]++; C.set(k, e); }
  const mid = (y) => { const k = slice(y); for (const kk of [k, k + 1, k - 1, k + 2, k - 2]) { const e = C.get(kk); if (e) return [e[0] / e[2], e[1] / e[2]]; } return [0, EZ - 0.15]; };
  const { puff, turn, copies = 2 } = CFG.tail;
  // (forge v2.3, HB: a high ponytail (CFG.tail.high m): the tail and where it is gathered lifted up the back of the head
  // toward the crown, its hang kept clear of the skull (each point at least its own offset out from the head's centre); the
  // hair over the back of the head under the new gather drawn up toward it (combed up, as a high tail's is), the nape's
  // edge held so no bare scalp shows)
  if (CFG.tail.high) { const H = CFG.tail.high, HC = [0, EY + 0.02, EZ - 0.088]; let gy = -9; for (const v of tail) if (off.get(v) < 0.035) gy = Math.max(gy, pPos[v * 3 + 1]);
    const lift = (v, f) => { const y0 = pPos[v * 3 + 1], z0 = pPos[v * 3 + 2], ny = y0 + H * f, nz = z0 - H * 0.25 * f, r0 = Math.hypot(pPos[v * 3] - HC[0], y0 - HC[1], z0 - HC[2]), r1 = Math.hypot(pPos[v * 3] - HC[0], ny - HC[1], nz - HC[2]);
      pPos[v * 3 + 1] = ny; pPos[v * 3 + 2] = nz; if (r1 < r0) { const k = r0 / r1; pPos[v * 3] = HC[0] + (pPos[v * 3] - HC[0]) * k; pPos[v * 3 + 1] = HC[1] + (ny - HC[1]) * k; pPos[v * 3 + 2] = HC[2] + (nz - HC[2]) * k; } };
    for (const v of tail) lift(v, Math.min(1, 0.55 + (off.get(v) - 0.02) / 0.06));
    // (the hair over the head drawn tight to the skull (to half its height over it), as hair pulled up into a tail is)
    { const G = capGeom({}); for (const v of hv) { if (TS.has(v)) continue; const dx = pPos[v * 3] - G.C[0], dy = pPos[v * 3 + 1] - G.C[1], dz = pPos[v * 3 + 2] - G.C[2], r = Math.hypot(dx, dy, dz); if (pPos[v * 3 + 1] < EY - 0.02) continue;
        const ph = Math.atan2(dx, dz), th = Math.asin(Math.max(-1, Math.min(1, dy / r))), rh = G.rHead(ph, th) + 0.002; if (r <= rh) continue; const r2 = rh + (r - rh) * 0.5;
        pPos[v * 3] = G.C[0] + dx / r * r2; pPos[v * 3 + 1] = G.C[1] + dy / r * r2; pPos[v * 3 + 2] = G.C[2] + dz / r * r2; } }
    let combed = 0; for (const v of hv) { if (TS.has(v)) continue; const y = pPos[v * 3 + 1], z = pPos[v * 3 + 2]; if (z > EZ - 0.07 || y > gy + H || y < EY - 0.075) continue;
      const f = 0.55 * sm(EY - 0.075, gy, y) * (1 - sm(gy, gy + H, y)); if (f > 0) { lift(v, f); combed++; } }
    C.clear(); for (const v of tail) { const k = slice(pPos[v * 3 + 1]), e = C.get(k) || [0, 0, 0]; e[0] += pPos[v * 3]; e[1] += pPos[v * 3 + 2]; e[2]++; C.set(k, e); }
    console.error('high ponytail: lifted', H, 'm,', tail.length, 'tail points,', combed, 'combed up'); }
  // (forge v2.3, HB: a bun (CFG.bun): the tail's cards dropped (the hair over the head is the slicked cut, gathered at the
  // back), its gather kept for the bun built later as coiled rope (BUN))
  if (CFG.bun) { let g = [0, 0, 0, 0]; for (const v of tail) if (off.get(v) < 0.04) { g[0] += pPos[v * 3]; g[1] += pPos[v * 3 + 1]; g[2] += pPos[v * 3 + 2]; g[3]++; }
    BUN = g[3] ? [g[0] / g[3], g[1] / g[3] + (CFG.bun.lift ?? 0.02), g[2] / g[3]] : [0, EY + 0.03, EZ - 0.17];
    const loose = (v) => off.get(v) > 0.012 && pPos[v * 3 + 1] < BUN[1] - 0.03 && pPos[v * 3 + 2] < EZ - 0.11; // (a stray card left hanging under the bun)
    const kept = []; for (let q = 0; q < hairT.length; q += 3) if (!(TS.has(hairT[q]) || TS.has(hairT[q + 1]) || TS.has(hairT[q + 2]) || loose(hairT[q]) || loose(hairT[q + 1]) || loose(hairT[q + 2]))) kept.push(hairT[q], hairT[q + 1], hairT[q + 2]);
    console.error('bun: tail cards dropped', (hairT.length - kept.length) / 3, 'gather', BUN.map((x) => x.toFixed(3)).join(',')); hairT.splice(0, hairT.length, ...kept); }
  else {
  // (the tail filled out about its middle, fading in below where it leaves the head)
  for (const v of tail) { const y = pPos[v * 3 + 1], [cx, cz] = mid(y), f = Math.min(1, (off.get(v) - 0.02) / 0.03); pPos[v * 3] = cx + (pPos[v * 3] - cx) * (1 + (puff - 1) * f); pPos[v * 3 + 2] = cz + (pPos[v * 3 + 2] - cz) * (1 + (puff - 1) * f); }
  const triT = []; for (let q = 0; q < hairT.length; q += 3) if (TS.has(hairT[q]) && TS.has(hairT[q + 1]) && TS.has(hairT[q + 2])) triT.push(hairT[q], hairT[q + 1], hairT[q + 2]);
  const tv = [...new Set(triT)], idx = new Map(tv.map((v, k) => [v, k])), nT0 = tv.length, n = nP + nT0 * copies, P2 = new Float32Array(n * 3); P2.set(pPos);
  const N0 = PK.get('normal'), extra = { normal: [] };
  for (let c = 0; c < copies; c++) { const a = (c % 2 ? -1 : 1) * turn * (1 + Math.floor(c / 2) * 0.6), ca = Math.cos(a), sa = Math.sin(a);
    tv.forEach((v, k) => { const y = pPos[v * 3 + 1], [cx, cz] = mid(y), f = Math.min(1, (off.get(v) - 0.02) / 0.03), aa = a * f, c1 = Math.cos(aa), s1 = Math.sin(aa), x = (pPos[v * 3] - cx) * 0.9, z = (pPos[v * 3 + 2] - cz) * 0.9, i = nP + c * nT0 + k;
      P2[i * 3] = cx + x * c1 + z * s1; P2[i * 3 + 1] = y; P2[i * 3 + 2] = cz - x * s1 + z * c1;
      const nx = N0[v * 3], nz = N0[v * 3 + 2]; extra.normal[i] = [Math.round(nx * c1 + nz * s1), N0[v * 3 + 1], Math.round(-nx * s1 + nz * c1)]; }); }
  const ext = (k) => { const w = { uv: 2, normal: 3, skinIndex: 4, skinWeight: 4 }[k], a = PK.get(k), o = new a.constructor(n * w); o.set(a.subarray(0, nP * w));
    for (let c = 0; c < copies; c++) tv.forEach((v, kk) => { const i = nP + c * nT0 + kk; if (k === 'normal') o.set(extra.normal[i], i * 3); else for (let j = 0; j < w; j++) o[i * w + j] = a[v * w + j]; }); return o; };
  const cache = {}; PKX = { n, J: PK.J, get: (k) => cache[k] || (cache[k] = ext(k)) }; pPosX = P2;
  hairTX = [...hairT]; for (let c = 0; c < copies; c++) for (const v of triT) hairTX.push(nP + c * nT0 + idx.get(v));
  console.error('ponytail', tail.length, 'points,', triT.length / 3, 'cards x', copies, 'copies');
  }
}
/* ------------------------------------------------ FORGE v2: the library -- */
// the garments authored on this body (library.mjs), in the order worn (CFG.lib: [{ item, color, accent, fit, len }]):
// each one hides the skin deep under it, drops the parts of the pack's garments deep inside it (a shirt's back under a
// coat), and stands off whatever is left under it (the shirt's collar at the coat's neckline)
const jpos = (name) => { const i = SKEL.findIndex((b) => b.name === name), h = SKEL[i].head.slice(); if (JMOVE) for (let k = 0; k < 3; k++) h[k] += JMOVE[i][k];
  for (const S0 of SHOULDER) if (S0.arm.has(i)) for (let k = 0; k < 3; k++) h[k] += S0.D[k]; return h; };
const LIB = CFG.lib?.length ? (() => {
  const gB = group(B, 'body'), bodyIdx = bIdx.subarray(gB.start, gB.start + gB.count); let nBody = 0; for (const v of bodyIdx) nBody = Math.max(nBody, v + 1);
  const ctx = prepare({ bPos, nBody, bodyIdx, uv: B.get('uv'), si: B.get('skinIndex'), sw: B.get('skinWeight'), SKEL, jpos, NECKY, WAIST, EY, EZ, ARMPIT: NECKY - (B.J.landmarks.neck - B.J.landmarks.armpit), sex: CFG.sex, log: (m) => console.error('library', m) });
  const bodyVs = []; for (let v = 0; v < nBody; v++) bodyVs.push(v); const nearB = nearestOf(bPos, bodyVs);
  const done = [], hide = new Set();
  for (const g of CFG.lib) {
    const make = GARMENTS[g.item]; if (!make) { console.error('library: no garment', g.item); continue; }
    // (what is under it: the pack's garments still worn, the library's pieces before it)
    const inner = []; for (const T of wearT) for (const v of new Set(T)) inner.push([pPos[v * 3], pPos[v * 3 + 1], pPos[v * 3 + 2]]);
    for (const d of done) for (const p of d.r.parts) for (let i = 0; i < p.mesh.P.length; i += 3) inner.push([p.mesh.P[i], p.mesh.P[i + 1], p.mesh.P[i + 2]]);
    // (two passes when something is worn under it: the first finds where it covers, the pack's points there are laid on
    // the skin (below), and the second is cut over what is left, so the cloth follows the body, not a shirt's wrinkles)
    ctx.inner = inner;
    let r = make(ctx, g);
    const layUnder = (r0) => { let laid = 0; const sk = r0.shell.skirt, skTop = sk ? Math.max(...Array.from({ length: sk.P.length / 3 }, (_, i) => sk.P[i * 3 + 1])) : 0, skBot = sk ? Math.min(...Array.from({ length: sk.P.length / 3 }, (_, i) => sk.P[i * 3 + 1])) : 0, nz = jpos('neck01')[2];
      wearT.forEach((T, wi) => { for (const v of new Set(T)) { const p = [pPos[v * 3], pPos[v * 3 + 1], pPos[v * 3 + 2]], b = nearB(p); if (b < 0) continue; const fb = r0.field([bPos[b * 3], bPos[b * 3 + 1], bPos[b * 3 + 2]], ctx.cls[b], b);
        // (under it, or just past its neckline at the sides and back (a shirt's collar there would show through as shards); the front's V keeps its shirt)
        const under = fb > 0.004 || (fb > -0.014 && p[2] < nz + 0.025 && p[1] > NECKY - 0.12) || (sk && p[1] < skTop && p[1] > skBot + 0.05 && (ctx.cls[b] === 3 || ctx.cls[b] === 0)); if (!under) continue;
        for (let k = 0; k < 3; k++) pPos[v * 3 + k] = bPos[b * 3 + k] + ctx.N[b * 3 + k] * 0.003; laid++; } }); return laid; };
    if (inner.length) { layUnder(r); const inner2 = []; for (const T of wearT) for (const v of new Set(T)) inner2.push([pPos[v * 3], pPos[v * 3 + 1], pPos[v * 3 + 2]]); for (const d of done) for (const p of d.r.parts) for (let i = 0; i < p.mesh.P.length; i += 3) inner2.push([p.mesh.P[i], p.mesh.P[i + 1], p.mesh.P[i + 2]]); ctx.inner = inner2; r = make(ctx, g); }
    for (const t of r.shell.hide) hide.add(t);
    // (the pack's garment triangles inside it (all three points over 6 mm in from its edges) dropped: hidden there, and a shoulder let down to its natural line would otherwise show them through)
    let dropped = 0; wearT.forEach((T, wi) => { const keep = []; for (let q = 0; q < T.length; q += 3) { const deep = [T[q], T[q + 1], T[q + 2]].every((v) => { const b = nearB([pPos[v * 3], pPos[v * 3 + 1], pPos[v * 3 + 2]]); return b >= 0 && r.field([bPos[b * 3], bPos[b * 3 + 1], bPos[b * 3 + 2]], ctx.cls[b], b) > 0.006; }); if (deep) dropped++; else keep.push(T[q], T[q + 1], T[q + 2]); } wearT[wi] = keep; });
    // (the pack's garment points left under it (near its edges, or under a coat's skirt) laid 3 mm off the skin: hidden
    // there anyway, and so close to the body they move as it does, never out through the cloth over them in a pose)
    const laid = layUnder(r);
    console.error('library', g.item, 'parts', r.parts.length, 'extras', r.extras.length, '; pack triangles dropped under it', dropped, '; pack points laid on the skin under it', laid);
    done.push({ g, r });
  }
  return { done, hide, ctx };
})() : null;
// (C5: under a suit's jacket the base suit's shirt collar kept only in the jacket's V: at the sides and back it is under
// the jacket's turned collar, and when he turned his head or sat it came 1-2 cm out through the collar and the lapels
// (the old boss: 40 of his 71 points out in sitTalk were the shirt's collar))
if (LIB && CFG.suit) { const jacket = LIB.done.find((d) => /^suit-jacket/.test(d.g.item));
  if (jacket) { const nz = SKL('neck01')[2], yC = NECKY - 0.09, xV = 0.04; let cut = 0;
    // (F6: the V's edge is the lapels' own: C5 kept the shirt inside |x| < 4 cm, but the lapels' inner edges run 4.5-6 cm
    // out, so between the kept shirt and the lapels the jacket's inside showed as dark zig-zags round white shards either
    // side of the tie. Now the jacket's front (its points 3 cm before the neck) gives the V's half width per centimetre of
    // height, and the shirt is kept to it: a triangle with two or three points past it dropped (all three left a saw
    // edge of white teeth over the lapels; one already showed the jacket's inside in the gap), so its cut edge runs
    // along the lapels' edge. Laying the shirt behind
    // the lapels or keeping 8 mm more under them was tried: the shirt's inside then showed in the turns (collar flecks
    // 92-114, not kept))
    const JP = [...jacket.r.parts, ...jacket.r.extras].filter((p) => !/buttons/.test(p.name)).map((p) => p.mesh.P), vb = new Map();
    for (const P of JP) for (let i = 0; i < P.length; i += 3) { const x = P[i], y = P[i + 1], z = P[i + 2]; if (z < nz + 0.03) continue; const b = Math.round((y - NECKY) / 0.01); vb.set(b, Math.min(vb.get(b) ?? 9, Math.abs(x))); }
    // (over the lapels' top the shirt's collar band rises round the neck: kept to C5's 4 cm there (wider, its sides
    // showed their inside past the jacket's collar from the side))
    let lapTop = -9; for (const p of [...jacket.r.parts, ...jacket.r.extras]) if (p.name === 'suit-lapels') for (let i = 0; i < p.mesh.P.length; i += 3) if (p.mesh.P[i + 2] > nz + 0.03) lapTop = Math.max(lapTop, p.mesh.P[i + 1]);
    const bTop = lapTop > -9 ? Math.floor((lapTop - NECKY) / 0.01) : Math.max(...vb.keys()), xVf = (y) => { const f = (y - NECKY) / 0.01; if (f > bTop) return xV; const b0 = Math.floor(f), a = vb.get(b0), c = vb.get(b0 + 1); return a == null ? c ?? xV : c == null ? a : a + (c - a) * (f - b0); };
    const back = (v) => pPos[v * 3 + 1] > yC && !(pPos[v * 3 + 2] > nz + 0.02 && Math.abs(pPos[v * 3]) < xVf(pPos[v * 3 + 1]));
    wearT.forEach((T, wi) => { if (CFG.wear[wi][3] !== 'suit') return; const keep = []; for (let q = 0; q < T.length; q += 3) { if ((back(T[q]) ? 1 : 0) + (back(T[q + 1]) ? 1 : 0) + (back(T[q + 2]) ? 1 : 0) >= 2) { cut++; continue; } keep.push(T[q], T[q + 1], T[q + 2]); } wearT[wi] = keep; });
    console.error('suit (C5): shirt collar triangles under the jacket collar dropped', cut);
    // (F6: the jacket's own front edge kept out of the V: the few triangles of it inside the lapels' line dropped, and its
    // neckline and its front under the lapels given the collar's and the lapels' weights, so its inside does not ride up
    // past them in talk and the turns: the old boss's collar flecks 51 -> 41, the cloth gate 34 -> 31)
    { const lap = [...jacket.r.parts, ...jacket.r.extras].find((p) => p.name === 'suit-lapels'), body = jacket.r.parts.find((p) => p.name === 'suit');
      if (lap && body) { const lb = new Map(); for (let i = 0; i < lap.mesh.P.length; i += 3) { const z = lap.mesh.P[i + 2]; if (z < nz + 0.03) continue; const b = Math.round((lap.mesh.P[i + 1] - NECKY) / 0.01); lb.set(b, Math.min(lb.get(b) ?? 9, Math.abs(lap.mesh.P[i]))); }
        const xL = (y) => { const f = (y - NECKY) / 0.01, b0 = Math.floor(f), a = lb.get(b0), c = lb.get(b0 + 1); return a == null ? c ?? -1 : c == null ? a : a + (c - a) * (f - b0); };
        const P = body.mesh.P, I = body.mesh.idx, keep = []; let edge = 0;
        for (let q = 0; q < I.length; q += 3) { const vs = [I[q], I[q + 1], I[q + 2]], x = vs.reduce((a, v) => a + Math.abs(P[v * 3]), 0) / 3, y = vs.reduce((a, v) => a + P[v * 3 + 1], 0) / 3, z = vs.reduce((a, v) => a + P[v * 3 + 2], 0) / 3, xl = xL(y);
          if (z > nz + 0.025 && y > NECKY - 0.25 && xl > 0 && x < xl + 0.003) { edge++; continue; } keep.push(...vs); }
        body.mesh.idx = Uint32Array.from(keep); console.error('suit (F6): jacket front edge triangles inside the lapels dropped', edge);
        // (and the jacket's neckline under its turned collar moves with the collar (its weights), so as he talks its inside
        // does not ride up past the collar's top at the back or in the V)
        { const col = [...jacket.r.parts, ...jacket.r.extras].find((p) => p.name === 'suit-collar');
          if (col) console.error('suit (F6): jacket neckline points wrapped to its collar', wrapWeights(body.mesh, [col.mesh], { depth: 0.03, reach: 0.03, out: 0.004, only: (v) => P[v * 3 + 1] > NECKY - 0.07 })); }
        // (the jacket's front under the lapels moves with them: wrapped to their weights, so in a turn or a sit its edge
        // does not swing out past theirs and show its inside)
        console.error('suit (F6): jacket front points wrapped to the lapels', wrapWeights(body.mesh, [lap.mesh], { depth: 0.02, reach: 0.025, out: 0.004, only: (v) => P[v * 3 + 2] > nz + 0.02 && P[v * 3 + 1] > NECKY - 0.28 })); } }
  } }
// (C5: a pack trouser leg's hem inside the library's shoes dropped: hidden there, and when she shifted her weight it came
// out through the shoe's collar and lining (the young mother's jeans in 'wave'))
if (LIB) { const shoeParts = LIB.done.filter((d) => /^(sneakers|work-boots|dress-shoes)$/.test(d.g.item)).flatMap((d) => [...d.r.parts, ...d.r.extras]).map((p) => p.mesh);
  if (shoeParts.length) { let cut = 0; const ank = jpos('foot.L')[1] + 0.06;
    wearT.forEach((T, wi) => { const part = CFG.wear[wi][1]; if (part === 'top') return; const low = [...new Set(T)].filter((v) => pPos[v * 3 + 1] < ank), cov = coveredBy(pPos, low, shoeParts, 0.03, 0.03);
      const keep = []; for (let q = 0; q < T.length; q += 3) { if (cov.has(T[q]) && cov.has(T[q + 1]) && cov.has(T[q + 2])) { cut++; continue; } keep.push(T[q], T[q + 1], T[q + 2]); } wearT[wi] = keep; });
    console.error('shoes (C5): trouser triangles inside the shoes dropped', cut); } }
// FORGE v2: the shoes' tops inside a trouser leg dropped (a shoe point with trouser cloth outside it, round the ankle's
// axis, and at least 8 mm above it): when the ankle bends in a walk they would come out through the hem (the gates'
// cloth check found Sal's shoes through his trousers in every run and jog)
{ const bot = []; CFG.wear.forEach(([, part], wi) => { if (part === 'bottom' || part === 'all') for (const v of new Set(wearT[wi])) bot.push([pPos[v * 3], pPos[v * 3 + 1], pPos[v * 3 + 2]]); });
  if (LIB) for (const { g, r } of LIB.done) if (/trousers/.test(g.item)) for (let i = 0; i < r.shell.P.length; i += 3) bot.push([r.shell.P[i], r.shell.P[i + 1], r.shell.P[i + 2]]);
  if (bot.length) { const cell = 0.02, G = new Map(), gk = (x, y, z) => Math.floor(x / cell) + ',' + Math.floor(y / cell) + ',' + Math.floor(z / cell); for (const q of bot) { const k = gk(...q); (G.get(k) || G.set(k, []).get(k)).push(q); }
    const ax = { L: jpos('foot.L'), R: jpos('foot.R') };
    const covered = (v) => { const p = [pPos[v * 3], pPos[v * 3 + 1], pPos[v * 3 + 2]], a = ax[p[0] >= 0 ? 'L' : 'R'], rv = Math.hypot(p[0] - a[0], p[2] - a[2]), c = p.map((x) => Math.floor(x / cell));
      for (let i = -1; i <= 1; i++) for (let j = 0; j <= 2; j++) for (let k = -1; k <= 1; k++) for (const q of G.get((c[0] + i) + ',' + (c[1] + j) + ',' + (c[2] + k)) || []) { if (q[1] < p[1] + 0.008) continue; const rq = Math.hypot(q[0] - a[0], q[2] - a[2]), da = Math.abs(Math.atan2(q[0] - a[0], q[2] - a[2]) - Math.atan2(p[0] - a[0], p[2] - a[2])); if (rq > rv + 0.001 && (da < 0.5 || da > 2 * Math.PI - 0.5)) return true; }
      return false; };
    const cv = new Map(), keep = []; let n = 0; for (let q = 0; q < shoeT.length; q += 3) { const t = [shoeT[q], shoeT[q + 1], shoeT[q + 2]]; if (t.every((v) => (cv.has(v) ? cv.get(v) : cv.set(v, covered(v)).get(v)))) { n++; continue; } keep.push(...t); }
    shoeT.splice(0, shoeT.length, ...keep); console.error('shoes: triangles inside the trouser legs dropped', n); } }
// (the skin left showing: the pack's hide lists and the library's)
const skinOut = LIB ? (() => { const o = []; for (let t = 0; t < nT; t++) if (!hidden[t] && !LIB.hide.has(t)) { const q = bodyG.start + t * 3; o.push(bIdx[q], bIdx[q + 1], bIdx[q + 2]); } return o; })() : skinT;
/* ---------------------------------------------------------- the vertices -- */
// a mesh's own vertices: the ones its triangles use, in first-use order
function compact(lists, n) {
  const map = new Int32Array(n).fill(-1), order = [];
  const out = lists.map((L) => Uint32Array.from(L, (v) => { if (map[v] < 0) { map[v] = order.length; order.push(v); } return map[v]; }));
  return { order, out };
}
// smooth normals from the shape as built: area-weighted, the same at a seam's two copies of a point (welded by place)
function normals(P, lists, order, keepN, srcN) {
  const n = order.length, N = new Float32Array(n * 3);
  const key = (i) => { const v = order[i]; return Math.round(P[v * 3] * 1e4) + ',' + Math.round(P[v * 3 + 1] * 1e4) + ',' + Math.round(P[v * 3 + 2] * 1e4); };
  const weld = new Map(), wid = new Int32Array(n); for (let i = 0; i < n; i++) { const k = key(i); if (!weld.has(k)) weld.set(k, weld.size); wid[i] = weld.get(k); }
  const acc = new Float64Array(weld.size * 3);
  for (const [li, L] of lists.entries()) { if (keepN[li]) continue; for (let q = 0; q < L.length; q += 3) {
    const a = order[L[q]], b = order[L[q + 1]], c = order[L[q + 2]];
    const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2], vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1], vz = P[c * 3 + 2] - P[a * 3 + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const i of [L[q], L[q + 1], L[q + 2]]) { const w = wid[i]; acc[w * 3] += nx; acc[w * 3 + 1] += ny; acc[w * 3 + 2] += nz; } } }
  const own = new Uint8Array(n); for (const [li, L] of lists.entries()) if (keepN[li]) for (const i of L) own[i] = 1;
  for (let i = 0; i < n; i++) {
    let x, y, z;
    if (own[i]) { const v = order[i]; x = srcN[v * 3] / 127; y = srcN[v * 3 + 1] / 127; z = srcN[v * 3 + 2] / 127; }
    else { const w = wid[i]; x = acc[w * 3]; y = acc[w * 3 + 1]; z = acc[w * 3 + 2]; }
    const l = Math.hypot(x, y, z) || 1; N[i * 3] = x / l; N[i * 3 + 1] = y / l; N[i * 3 + 2] = z / l;
  }
  return N;
}

/* ------------------------------------------------------- the GLB's frame -- */
const io = new IO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.readBinary(await env.bytes(TEMPLATE));
const R = doc.getRoot();
for (const e of R.listExtensionsUsed()) if (/meshopt|quantization/i.test(e.extensionName)) e.dispose();
const skin0 = R.listSkins()[0], joints = skin0.listJoints(), jIx = new Map(joints.map((j, i) => [j.getName(), i]));
const nodeBy = (n) => R.listNodes().find((x) => x.getName() === n);
const skelNames = B.J.skeleton.map((b) => b.name.replace('.', '_'));
const jmap = skelNames.map((nm) => { const i = jIx.get(nm); if (i == null) throw new Error('no joint ' + nm); return i; });
// the template's own meshes away (their nodes, materials, textures, the skins they had): kept are the bones, the clips,
// the frame holding the skeleton (its height set below), and the mouth's inside (the teeth and the dark behind them),
// moved to her mouth below
const armature = R.listNodes().find((n) => n.listChildren().includes(nodeBy('root')));
const keepMouth = [];
for (const n of R.listNodes()) {
  const m = n.getMesh(); if (!m) continue;
  const mat = m.listPrimitives()[0].getMaterial(), hex = mat ? mat.getBaseColorFactor().slice(0, 3).map((x) => x.toFixed(3)).join(',') : '';
  const head = nodeBy('head');
  if (!n.getSkin() && head.listChildren().includes(n) && (hex === '0.807,0.761,0.687' || hex === '0.023,0.004,0.004')) { keepMouth.push({ n, kind: hex.startsWith('0.807') ? 'teeth' : 'dark', t: n.getTranslation() }); continue; }
  // (his cap: the template's own, on his head bone)
  if (CFG.cap && !CFG.cap.make && !n.getSkin() && /^cap/.test(mat?.getName() || '')) continue;
  n.dispose();
}
// (the wrappers left empty, the dangling meshes, materials, textures, skins and accessors gone)
for (let pass = 0; pass < 3; pass++) for (const n of R.listNodes()) if (!joints.includes(n) && !n.getMesh() && !n.listChildren().length && n !== armature) n.dispose();
for (const m of R.listMeshes()) if (!m.listParents().some((p) => p.propertyType === 'Node')) m.dispose();
for (const s of R.listSkins()) if (s !== skin0) s.dispose();
for (const m of R.listMaterials()) if (!m.listParents().some((p) => p.propertyType === 'Primitive')) m.dispose();
for (const t of R.listTextures()) if (!t.listParents().some((p) => p.propertyType === 'Material')) t.dispose();
for (const a of R.listAccessors()) if (!a.listParents().some((p) => p.propertyType !== 'Root')) a.dispose();

// her height (the frame's scale: the base female is 1.696 m) and her head's own scale (the template's teen head was
// 1.06: an adult's is 1)
// (FORGE: the height asked for is the shaped body's: its own crown, not the base's (an old or heavy shape is shorter))
const CROWN = (() => { let m = 0; for (const v of skinV) m = Math.max(m, bPos[v * 3 + 1]); return m; })();
const sc = CFG.height / CROWN; armature.setScale([sc, sc, sc]);
nodeBy('head').setScale([CFG.headScale, CFG.headScale, CFG.headScale]);
// (the cap's frame under the head: moved (dy up, dz forward, in the bind's axes: the head's bind turn is none) and scaled
// to his head as built)
if (CFG.cap && !CFG.cap.make) { const cn = nodeBy('cap'); if (cn) { const t = cn.getTranslation(); cn.setTranslation([t[0], t[1] + (CFG.cap.dy || 0), t[2] + (CFG.cap.dz || 0)]); const s0 = cn.getScale(); cn.setScale(s0.map((x) => x * (CFG.cap.scale || 1))); console.error('cap', t.map((x) => x.toFixed(4)).join(','), '->', cn.getTranslation().map((x) => x.toFixed(4)).join(','), 'scale', cn.getScale()[0].toFixed(3)); } }
// (the narrower shoulders' joints: each arm bone's bind moved by D, the shoulder's rest offset in its clavicle's frame
// by D turned into that frame: the clavicle's bind turn, from its inverse bind)
if (JMOVE) {
  const ibmA = skin0.getInverseBindMatrices(), ibm = ibmA.getArray().slice();
  JMOVE.forEach((d, i) => { const j = jmap[i]; new T3.Matrix4().fromArray(ibm, j * 16).multiply(new T3.Matrix4().makeTranslation(-d[0], -d[1], -d[2])).toArray(ibm, j * 16); });
  ibmA.setArray(ibm);
}
if (SHOULDER.length) {
  const ibmA = skin0.getInverseBindMatrices(), ibm = ibmA.getArray().slice();
  for (const { side, ci, si, arm, D } of SHOULDER) {
    const TD = new T3.Matrix4().makeTranslation(-D[0], -D[1], -D[2]);
    for (const i of arm) { const j = jmap[i]; new T3.Matrix4().fromArray(ibm, j * 16).multiply(TD).toArray(ibm, j * 16); }
    const Bc = new T3.Matrix4().fromArray(ibmA.getArray(), jmap[ci] * 16).invert(), qc = new T3.Quaternion().setFromRotationMatrix(new T3.Matrix4().extractRotation(Bc));
    const node = joints[jmap[si]], t0 = new T3.Vector3(...node.getTranslation()), dl = new T3.Vector3(...D).applyQuaternion(qc.invert());
    node.setTranslation(t0.clone().add(dl).toArray());
    console.error('shoulder joint', side, node.getName(), t0.toArray().map((x) => x.toFixed(4)).join(','), '->', node.getTranslation().map((x) => x.toFixed(4)).join(','));
  }
  ibmA.setArray(ibm);
}

/* ------------------------------------------------------------ materials -- */
const buf = R.listBuffers()[0];
async function tex(name, input, mime = 'image/png') { const t = doc.createTexture(name).setImage(input).setMimeType(mime); return t; }
const mat = (name, o = {}) => { const m = doc.createMaterial(name).setRoughnessFactor(o.rough ?? 0.6).setMetallicFactor(0).setDoubleSided(!!o.ds).setBaseColorFactor([...(o.color || [1, 1, 1]), 1]);
  if (o.alpha) m.setAlphaMode('MASK').setAlphaCutoff(o.alpha); if (o.map) m.setBaseColorTexture(o.map); if (o.normal) m.setNormalTexture(o.normal);
  if (o.spec) m.setExtension('KHR_materials_specular', SPECX.createSpecular().setSpecularFactor(o.spec[0]).setSpecularColorFactor(o.spec[1])); return m; };
// (forge v2.5, MV: hair's highlight as Jane's hairStrands are: specular 0.6, tinted warm (1, 0.8, 0.62), and rougher; the
// plain F0 0.04 white highlight at rough 0.42 took the cool rim and the room's light as a blue sheen on dark hair)
const SPECX = doc.createExtension(env.gltf.extensions.KHRMaterialsSpecular), HAIRSPEC = [0.6, [1, 0.8, 0.62]];
// (C5: cloth's specular: woven fibre scatters, it does not mirror: F0 at 45 %, so the key's highlight lies soft on a
// fold instead of as a glaze on moulded plastic)
const CLOTHSPEC = [0.45, [1, 1, 1]];
// the skin: the three young skins blended (her own tone), 2048 square
const skinImg = await (async () => {
  const S = Object.entries(CFG.skins).filter(([, w]) => w > 0);
  const raws = await Promise.all(S.map(([k]) => sharp(A + (k.includes('-') ? PKD + '/skin-' : ATH + '/skin-') + k + '.jpg').resize(2048, 2048).removeAlpha().raw().toBuffer()));
  const o = new Uint8Array(2048 * 2048 * 3); const tot = S.reduce((a, [, w]) => a + w, 0);
  const tn = CFG.skinTint || [1, 1, 1];
  for (let i = 0; i < o.length; i++) { let v = 0; for (let k = 0; k < S.length; k++) v += raws[k][i] * S[k][1] / tot; o[i] = Math.min(255, Math.round(255 * Math.pow(Math.pow(v / 255, 2.2) * tn[i % 3], 1 / 2.2))); }
  return sharp(o, { raw: { width: 2048, height: 2048, channels: 3 } }).jpeg({ quality: 92 }).toBuffer();
})();
// the eyes: the light brown, its cornea's white spot cleared (the eye fix GameMog shipped: alpha off there, cut at 0.5;
// the spot is in the image's bottom right as stored, the top right in GameMog's flipped bitmap)
const eyeImg = await (async () => {
  const { data, info } = await sharp(A + ATH + '/eye-' + (CFG.eyes || 'brown') + '.jpg').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) if (x > 0.82 * info.width && y > 0.82 * info.height) data[(y * info.width + x) * 4 + 3] = 0;
  // (the iris (its saturated texels) to a deeper brown: its own pattern's light kept)
  if (CFG.iris) for (let i = 0; i < data.length; i += 4) { const r = data[i], g = data[i + 1], b = data[i + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b); if (mx - mn < 40) continue;
    const L = 0.3 * r + 0.59 * g + 0.11 * b, k = Math.min(1, (mx - mn - 40) / 40); for (let c = 0; c < 3; c++) data[i + c] = Math.round(data[i + c] * (1 - k) + Math.min(255, L * 1.6 * CFG.iris[c]) * k); }
  return sharp(data, { raw: info }).png().toBuffer();
})();
const rd = (f) => env.bytes(f);
/* ---------------------------------------------------------- the mouth's inside (G7a) -- */
// Rounds 4-6 graded every open talking frame with a lavender or blue mouth: face.js's mouthShade darkens the inside's
// colour, but its surfaces faced up and back, so the cool rim (from behind, unshadowed) lit the floor and the tongue's
// top with its own blue, and the skin's peach under it read lavender. A mouth is a cavity: light gets into it only
// through the opening. So here, on every forged face (whatever face.js the engine runs): (1) its skin inside the lips
// is painted a wet, dark, warm red, darker the deeper it lies (to near black at the throat), (2) its normals turn to
// face out through the opening, more the deeper they lie, so a light from behind or above never reaches them, and (3)
// the tongue (the teeth's texture) is darker and browner toward its back, its normals out of the mouth too.
// The depth: how far each skin point lies behind the frontmost skin straight in front of it (a ray along +z), as
// face.js reads it for mouthShade, in the bind space at the build. -> Float32Array per body point (0 = not inside)
function mouthDeep(fresh = false) {
  if (MOUTH_DEEP && !fresh) return MOUTH_DEEP;
  const fm = EY - (CFG.mouth?.below ?? 63.5) / 1000, lipZ = EYEFRONT + (CFG.mouth?.front ?? 13.25) / 1000, deep = new Float32Array(bPos.length / 3);
  const T = []; for (let q = 0; q < skinT.length; q += 3) { const vs = [skinT[q], skinT[q + 1], skinT[q + 2]];
    if (vs.some((v) => Math.abs(bPos[v * 3]) < 0.045 && bPos[v * 3 + 1] > fm - 0.035 && bPos[v * 3 + 1] < fm + 0.022 && bPos[v * 3 + 2] > lipZ - 0.11)) T.push(...vs); }
  for (const v of new Set(skinT)) {
    const x = bPos[v * 3], y = bPos[v * 3 + 1], z = bPos[v * 3 + 2];
    // (no further back than 10 cm behind the lips (the throat): the back of the head and neck also have skin 'in front' of them)
    if (Math.abs(x) > 0.04 || y < fm - 0.03 || y > fm + 0.018 || z > lipZ - 0.0008 || z < lipZ - 0.1) continue;
    let top = -Infinity;
    for (let i = 0; i < T.length; i += 3) { const a = T[i], b = T[i + 1], c = T[i + 2], x1 = bPos[a * 3], y1 = bPos[a * 3 + 1], x2 = bPos[b * 3], y2 = bPos[b * 3 + 1], x3 = bPos[c * 3], y3 = bPos[c * 3 + 1];
      const det = (y2 - y3) * (x1 - x3) + (x3 - x2) * (y1 - y3); if (Math.abs(det) < 1e-12) continue;
      const l1 = ((y2 - y3) * (x - x3) + (x3 - x2) * (y - y3)) / det, l2 = ((y3 - y1) * (x - x3) + (x1 - x3) * (y - y3)) / det, l3 = 1 - l1 - l2;
      if (l1 < 0 || l2 < 0 || l3 < 0) continue; const zh = l1 * bPos[a * 3 + 2] + l2 * bPos[b * 3 + 2] + l3 * bPos[c * 3 + 2]; if (zh > top) top = zh; }
    const d = top - z; if (d > 0.0008) deep[v] = d * (1 - sm(0.03, 0.04, Math.abs(x)));
  }
  let n = 0, mx = 0; for (const d of deep) if (d > 0) { n++; mx = Math.max(mx, d); }
  console.error('mouth inside', n, 'points, deepest', (mx * 1000).toFixed(1), 'mm');
  return fresh ? deep : (MOUTH_DEEP = deep);
}
// the inside's colour (sRGB, before face.js's own darkening): the lips' wet inner red where it begins, a deep warm
// red-brown behind, near black toward the throat (CFG.mouthIn: false leaves the skin as it was)
const MOUTH_IN = { lip: [132, 50, 44], deep: [74, 24, 18], throat: [28, 8, 6] };
async function paintMouthIn(img) {
  if (CFG.mouthIn === false || !CFG.mouth) return img;
  const S = 2048, { data } = await sharp(img).removeAlpha().raw().toBuffer({ resolveWithObject: true }), uv = B.get('uv'), deep = mouthDeep();
  const col = (d) => { const a = sm(0.0008, 0.004, d), b = sm(0.003, 0.01, d), c = sm(0.01, 0.03, d);
    return [0, 1, 2].map((k) => (MOUTH_IN.lip[k] * (1 - b) + MOUTH_IN.deep[k] * b) * (1 - c) + MOUTH_IN.throat[k] * c).concat(a); };
  let painted = 0;
  for (let q = 0; q < skinT.length; q += 3) {
    const vs = [skinT[q], skinT[q + 1], skinT[q + 2]], ds = vs.map((v) => deep[v]); if (ds.every((d) => d <= 0)) continue; painted++;
    const U = vs.map((v) => [uv[v * 2] / 65535 * S, (1 - uv[v * 2 + 1] / 65535) * S]);
    const x0 = Math.floor(Math.min(...U.map((u) => u[0]))), x1 = Math.ceil(Math.max(...U.map((u) => u[0]))), y0 = Math.floor(Math.min(...U.map((u) => u[1]))), y1 = Math.ceil(Math.max(...U.map((u) => u[1])));
    const det = (U[1][1] - U[2][1]) * (U[0][0] - U[2][0]) + (U[2][0] - U[1][0]) * (U[0][1] - U[2][1]); if (Math.abs(det) < 1e-9) continue;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const l1 = ((U[1][1] - U[2][1]) * (x - U[2][0]) + (U[2][0] - U[1][0]) * (y - U[2][1])) / det, l2 = ((U[2][1] - U[0][1]) * (x - U[2][0]) + (U[0][0] - U[2][0]) * (y - U[2][1])) / det, l3 = 1 - l1 - l2;
      if (l1 < -0.02 || l2 < -0.02 || l3 < -0.02 || x < 0 || y < 0 || x >= S || y >= S) continue;
      const [r, g, b, w] = col(Math.max(0, l1 * ds[0] + l2 * ds[1] + l3 * ds[2])), i = (y * S + x) * 3;
      // (the skin's own grain kept a little: its light against its mean)
      const grain = 0.85 + 0.15 * Math.min(1.6, (0.3 * data[i] + 0.59 * data[i + 1] + 0.11 * data[i + 2]) / 170);
      data[i] = Math.round(data[i] * (1 - w) + r * grain * w); data[i + 1] = Math.round(data[i + 1] * (1 - w) + g * grain * w); data[i + 2] = Math.round(data[i + 2] * (1 - w) + b * grain * w);
    }
  }
  console.error('mouth inside painted', painted, 'triangles');
  return sharp(data, { raw: { width: S, height: S, channels: 3 } }).png().toBuffer();
}
// the inside's roughness map (G channel; 256 px over the skin's uvs): rough everywhere else, 1 inside (by depth as painted)
async function mouthRough(rough) {
  const S = 256, data = new Uint8Array(S * S * 3), base = Math.round(rough * 255), uv = B.get('uv'), deep = mouthDeep();
  for (let i = 0; i < S * S; i++) { data[i * 3] = 255; data[i * 3 + 1] = base; data[i * 3 + 2] = 0; }
  for (let q = 0; q < skinT.length; q += 3) {
    const vs = [skinT[q], skinT[q + 1], skinT[q + 2]], ws = vs.map((v) => sm(0.0008, 0.004, deep[v])); if (ws.every((w) => w <= 0)) continue;
    const U = vs.map((v) => [uv[v * 2] / 65535 * S, (1 - uv[v * 2 + 1] / 65535) * S]);
    const x0 = Math.floor(Math.min(...U.map((u) => u[0]))) - 1, x1 = Math.ceil(Math.max(...U.map((u) => u[0]))) + 1, y0 = Math.floor(Math.min(...U.map((u) => u[1]))) - 1, y1 = Math.ceil(Math.max(...U.map((u) => u[1]))) + 1;
    const det = (U[1][1] - U[2][1]) * (U[0][0] - U[2][0]) + (U[2][0] - U[1][0]) * (U[0][1] - U[2][1]); if (Math.abs(det) < 1e-9) continue;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (x < 0 || y < 0 || x >= S || y >= S) continue;
      const l1 = ((U[1][1] - U[2][1]) * (x + 0.5 - U[2][0]) + (U[2][0] - U[1][0]) * (y + 0.5 - U[2][1])) / det, l2 = ((U[2][1] - U[0][1]) * (x + 0.5 - U[2][0]) + (U[0][0] - U[2][0]) * (y + 0.5 - U[2][1])) / det, l3 = 1 - l1 - l2;
      if (l1 < -0.15 || l2 < -0.15 || l3 < -0.15) continue;   // (a texel's margin round each triangle: the map is small)
      const w = Math.max(0, Math.min(1, Math.max(0, l1) * ws[0] + Math.max(0, l2) * ws[1] + Math.max(0, l3) * ws[2])), i = (y * S + x) * 3;
      data[i + 1] = Math.max(data[i + 1], Math.round(base + (255 - base) * w)); }
  }
  return sharp(data, { raw: { width: S, height: S, channels: 3 } }).png().toBuffer();
}
// (2) the inside's normals out through the opening (a built primitive's NORMAL accessor, its points' body indices)
function mouthNormals(acc, order) {
  if (CFG.mouthIn === false || !CFG.mouth) return 0;
  const deep = mouthDeep(), N = acc.getArray(); let n = 0;
  order.forEach((v, i) => { const d = v < deep.length ? deep[v] : 0; if (d <= 0) return; const w = sm(0.0008, 0.0045, d);
    const x = N[i * 3] * (1 - w) + MOUTH_OUT[0] * w, y = N[i * 3 + 1] * (1 - w) + MOUTH_OUT[1] * w, z = N[i * 3 + 2] * (1 - w) + MOUTH_OUT[2] * w, l = Math.hypot(x, y, z) || 1;
    N[i * 3] = x / l; N[i * 3 + 1] = y / l; N[i * 3 + 2] = z / l; n++; });
  acc.setArray(N); return n;
}
// her lips a little rose and her lids a touch darker on the skin's texture: the skin's triangles about her mouth painted
// in the texture's space (its uvs), softly, by how near each point is to the lips' middle line
async function paintFace(img) {
  if (!CFG.lips && !CFG.blouse && !CFG.lids) return img;
  const S = 2048, { data } = await sharp(img).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const uv = B.get('uv'), ey = (eyeC[0][1] + eyeC[1][1]) / 2, py = ey - (CFG.mouth?.below ?? 63.5) / 1000;
  const [lr, lg, lb, la] = CFG.lips || [1, 1, 1, 0];
  // (cast2: the lids: the skin over each eye, from the lash line up 9 mm, out to the eye's corners and a little past the
  // outer one, darker and a touch cooler, fading up; painted the way the lips are, below)
  if (CFG.lids) { const [er, eg, eb, ea] = CFG.lids;
    const lw = (v) => { const x = bPos[v * 3], y = bPos[v * 3 + 1], z = bPos[v * 3 + 2], c = eyeC[x > 0 ? 0 : 1]; const dx = (x - c[0]) * Math.sign(x), dy = y - c[1];
      if (z < c[2] || dy < -0.001 || dy > 0.011 || Math.abs(dx) > 0.019 + (dx > 0 ? 0.004 : 0)) return 0; return sm(0.011, 0.002, dy) * (1 - sm(0.014, 0.022, Math.abs(dx))); };
    for (let q = 0; q < skinT.length; q += 3) {
      const vs = [skinT[q], skinT[q + 1], skinT[q + 2]], ws = vs.map(lw); if (ws.every((w) => w <= 0)) continue;
      const U = vs.map((v) => [uv[v * 2] / 65535 * S, (1 - uv[v * 2 + 1] / 65535) * S]);
      const x0 = Math.floor(Math.min(...U.map((u) => u[0]))), x1 = Math.ceil(Math.max(...U.map((u) => u[0]))), y0 = Math.floor(Math.min(...U.map((u) => u[1]))), y1 = Math.ceil(Math.max(...U.map((u) => u[1])));
      const det = (U[1][1] - U[2][1]) * (U[0][0] - U[2][0]) + (U[2][0] - U[1][0]) * (U[0][1] - U[2][1]); if (Math.abs(det) < 1e-9) continue;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const l1 = ((U[1][1] - U[2][1]) * (x - U[2][0]) + (U[2][0] - U[1][0]) * (y - U[2][1])) / det, l2 = ((U[2][1] - U[0][1]) * (x - U[2][0]) + (U[0][0] - U[2][0]) * (y - U[2][1])) / det, l3 = 1 - l1 - l2;
        if (l1 < -0.02 || l2 < -0.02 || l3 < -0.02 || x < 0 || y < 0 || x >= S || y >= S) continue;
        const w = Math.max(0, l1 * ws[0] + l2 * ws[1] + l3 * ws[2]) * ea, i = (y * S + x) * 3;
        data[i] = Math.round(data[i] * (1 - w + er * w)); data[i + 1] = Math.round(data[i + 1] * (1 - w + eg * w)); data[i + 2] = Math.round(data[i + 2] * (1 - w + eb * w));
      }
    }
  }
  const wOf = (v) => { const x = bPos[v * 3], y = bPos[v * 3 + 1], z = bPos[v * 3 + 2]; const ax = Math.abs(x) / 0.024, ay = (y - py) / (y > py ? 0.0105 : 0.0125); const r = ax * ax + ay * ay; return z > EYEFRONT - 0.004 && r < 1 ? Math.pow(1 - r, 0.6) : 0; };
  for (let q = 0; q < skinT.length; q += 3) {
    const vs = [skinT[q], skinT[q + 1], skinT[q + 2]], ws = vs.map(wOf); if (ws.every((w) => w <= 0)) continue;
    const U = vs.map((v) => [uv[v * 2] / 65535 * S, (1 - uv[v * 2 + 1] / 65535) * S]);
    const x0 = Math.floor(Math.min(...U.map((u) => u[0]))), x1 = Math.ceil(Math.max(...U.map((u) => u[0]))), y0 = Math.floor(Math.min(...U.map((u) => u[1]))), y1 = Math.ceil(Math.max(...U.map((u) => u[1])));
    const det = (U[1][1] - U[2][1]) * (U[0][0] - U[2][0]) + (U[2][0] - U[1][0]) * (U[0][1] - U[2][1]); if (Math.abs(det) < 1e-9) continue;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const l1 = ((U[1][1] - U[2][1]) * (x - U[2][0]) + (U[2][0] - U[1][0]) * (y - U[2][1])) / det, l2 = ((U[2][1] - U[0][1]) * (x - U[2][0]) + (U[0][0] - U[2][0]) * (y - U[2][1])) / det, l3 = 1 - l1 - l2;
      if (l1 < -0.02 || l2 < -0.02 || l3 < -0.02 || x < 0 || y < 0 || x >= S || y >= S) continue;
      const w = Math.max(0, l1 * ws[0] + l2 * ws[1] + l3 * ws[2]) * la, i = (y * S + x) * 3;
      data[i] = Math.round(data[i] * (1 - w) + data[i] * lr * w); data[i + 1] = Math.round(data[i + 1] * (1 - w) + data[i + 1] * lg * w); data[i + 2] = Math.round(data[i + 2] * (1 - w) + data[i + 2] * lb * w);
    }
  }
  // a blouse under the knit (seen in its V): the chest's skin painted a plain cream, its own light kept, a crew neck
  // just under the collarbones
  if (CFG.blouse) {
    const [br, bg, bb] = CFG.blouse, neck = B.J.landmarks.neck;
    const inB = (v) => { const x = bPos[v * 3], y = bPos[v * 3 + 1], z = bPos[v * 3 + 2]; return Math.abs(x) < 0.16 && y > WAIST - 0.02 && y < neck - 0.03 + 9 * x * x && (z > -0.02 || y < neck - 0.06); };
    for (let q = 0; q < skinT.length; q += 3) {
      const vs = [skinT[q], skinT[q + 1], skinT[q + 2]]; if (!vs.every(inB)) continue;
      const U = vs.map((v) => [uv[v * 2] / 65535 * S, (1 - uv[v * 2 + 1] / 65535) * S]);
      const x0 = Math.floor(Math.min(...U.map((u) => u[0]))), x1 = Math.ceil(Math.max(...U.map((u) => u[0]))), y0 = Math.floor(Math.min(...U.map((u) => u[1]))), y1 = Math.ceil(Math.max(...U.map((u) => u[1])));
      const det = (U[1][1] - U[2][1]) * (U[0][0] - U[2][0]) + (U[2][0] - U[1][0]) * (U[0][1] - U[2][1]); if (Math.abs(det) < 1e-9) continue;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const l1 = ((U[1][1] - U[2][1]) * (x - U[2][0]) + (U[2][0] - U[1][0]) * (y - U[2][1])) / det, l2 = ((U[2][1] - U[0][1]) * (x - U[2][0]) + (U[0][0] - U[2][0]) * (y - U[2][1])) / det, l3 = 1 - l1 - l2;
        if (l1 < -0.03 || l2 < -0.03 || l3 < -0.03 || x < 0 || y < 0 || x >= S || y >= S) continue;
        const i = (y * S + x) * 3, lum = (0.3 * data[i] + 0.59 * data[i + 1] + 0.11 * data[i + 2]) / 200;
        data[i] = Math.min(255, Math.round(br * 255 * lum)); data[i + 1] = Math.min(255, Math.round(bg * 255 * lum)); data[i + 2] = Math.min(255, Math.round(bb * 255 * lum));
      }
    }
  }
  // (cast2: her hairline: the scalp under her hair and a centimetre past its edge painted her platinum, in fine strands
  // combed back toward the ponytail, thinning out to the skin: the hair's cards then sit on painted hair, no bald seam)
  if (CFG.scalp && hairT.length) {
    const hv = [...new Set(hairT)], HP = new Float32Array(hv.length * 3); hv.forEach((v, k) => { HP[k * 3] = pPos[v * 3]; HP[k * 3 + 1] = pPos[v * 3 + 1]; HP[k * 3 + 2] = pPos[v * 3 + 2]; });
    const near = new Float32Array(nB).fill(1);
    for (const v of skinV) { if (headW(v) < 0.4 || bPos[v * 3 + 1] < EY - 0.06) continue; const x = bPos[v * 3], y = bPos[v * 3 + 1], z = bPos[v * 3 + 2]; let m = 1;
      for (let k = 0; k < hv.length; k++) { const dx = HP[k * 3] - x, dy = HP[k * 3 + 1] - y, dz = HP[k * 3 + 2] - z, d2 = dx * dx + dy * dy + dz * dz; if (d2 < m) m = d2; } near[v] = Math.sqrt(m); }
    const { col, root, reach } = CFG.scalp, wv0 = (v) => 1 - sm(0.004, reach, near[v]);
    let n = 0;
    for (let q = 0; q < skinT.length; q += 3) {
      const vs = [skinT[q], skinT[q + 1], skinT[q + 2]], ws = vs.map(wv0); if (ws.every((w) => w <= 0.01)) continue;
      const U = vs.map((v) => [uv[v * 2] / 65535 * S, (1 - uv[v * 2 + 1] / 65535) * S]), Pv = vs.map((v) => [bPos[v * 3], bPos[v * 3 + 1], bPos[v * 3 + 2]]);
      const D = [-0.2 * Math.sign(Pv[0][0]), 0.45, -1], dl = Math.hypot(...D), d = uvDir(Pv, U, D.map((c) => c / dl));
      const x0 = Math.floor(Math.min(...U.map((u) => u[0]))), x1 = Math.ceil(Math.max(...U.map((u) => u[0]))), y0 = Math.floor(Math.min(...U.map((u) => u[1]))), y1 = Math.ceil(Math.max(...U.map((u) => u[1])));
      const det = (U[1][1] - U[2][1]) * (U[0][0] - U[2][0]) + (U[2][0] - U[1][0]) * (U[0][1] - U[2][1]); if (Math.abs(det) < 1e-9) continue;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const l1 = ((U[1][1] - U[2][1]) * (x - U[2][0]) + (U[2][0] - U[1][0]) * (y - U[2][1])) / det, l2 = ((U[2][1] - U[0][1]) * (x - U[2][0]) + (U[0][0] - U[2][0]) * (y - U[2][1])) / det, l3 = 1 - l1 - l2;
        if (l1 < -0.03 || l2 < -0.03 || l3 < -0.03 || x < 0 || y < 0 || x >= S || y >= S) continue;
        const w = Math.max(0, Math.min(1, l1 * ws[0] + l2 * ws[1] + l3 * ws[2])); if (w <= 0.01) continue;
        let part = 1; if (CFG.sidePart) { const px = l1 * Pv[0][0] + l2 * Pv[1][0] + l3 * Pv[2][0], py = l1 * Pv[0][1] + l2 * Pv[1][1] + l3 * Pv[2][1], pz = l1 * Pv[0][2] + l2 * Pv[1][2] + l3 * Pv[2][2];
          part = 1 - (1 - sm(0.0008, 0.0022, Math.abs(px - (CFG.sidePart.x ?? 0.026)))) * sm(EY + 0.04, EY + 0.06, py) * sm(EZ - 0.13, EZ - 0.1, pz); }
        const st = strand(x, y, d, 22, 5), a = Math.pow(Math.min(1, w * 1.15), 1.6) * (0.72 + 0.28 * st) * part, i = (y * S + x) * 3, k = 0.94 + 0.1 * st;
        for (let c = 0; c < 3; c++) data[i + c] = Math.round(data[i + c] * (1 - a) + Math.min(255, (root[c] + (col[c] - root[c]) * st) * k) * a);
        n++;
      }
    }
    console.error('scalp px', n);
  }
  return sharp(data, { raw: { width: S, height: S, channels: 3 } }).jpeg({ quality: 92 }).toBuffer();
}
// a garment's diffuse: as it is ('tex', tinted by the material's colour) or its cloth made plain ('flat': its own light and
// folds kept (the AO), its print and colour away: a solid cloth of the tint)
// ('bake': the plain cloth with its colour in the image (linear tint), so a trim can be its own colour: opt.white, the
// print's own white trims (a track pant's side stripe) kept in that colour; opt.sleeve { w, color }: a piping w m wide down
// the outer side of each sleeve, shoulder to cuff, worked out on the garment's 3D shape for each pixel of its triangles T)
const lin = (c) => Math.pow(c / 255, 2.2), enc = (l) => Math.min(255, Math.round(255 * Math.pow(Math.max(0, l), 1 / 2.2)));
const SK = Object.fromEntries(B.J.skeleton.map((b) => [b.name, b.head]));
function sleeveAt(p, w) {
  let best = 0;
  for (const s of ['L', 'R']) for (const [a, b] of [['upperarm01', 'lowerarm01'], ['lowerarm01', 'wrist']]) {
    const A0 = SK[a + '.' + s], B0 = SK[b + '.' + s], d = [B0[0] - A0[0], B0[1] - A0[1], B0[2] - A0[2]], L2 = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
    const v = [p[0] - A0[0], p[1] - A0[1], p[2] - A0[2]], t = (v[0] * d[0] + v[1] * d[1] + v[2] * d[2]) / L2; if (t < -0.15 || t > 1.05) continue;
    const r = [v[0] - d[0] * t, v[1] - d[1] * t, v[2] - d[2] * t], rl = Math.hypot(...r); if (rl > 0.085 || rl < 1e-4) continue;
    // (outward: away from her side and a little up, square to the arm)
    const sx = s === 'L' ? 1 : -1, o0 = [sx, 0.45, 0], od = (o0[0] * d[0] + o0[1] * d[1]) / L2, o = [o0[0] - d[0] * od, o0[1] - d[1] * od, -d[2] * od], ol = Math.hypot(...o);
    const c = (r[0] * o[0] + r[1] * o[1] + r[2] * o[2]) / rl / ol, arc = rl * Math.acos(Math.max(-1, Math.min(1, c)));
    best = Math.max(best, 1 - Math.max(0, Math.min(1, (arc - w * 0.35) / (w * 0.3))));
  }
  return best;
}
function bakeCloth(o, src, info, opt, T) {
  const tn = opt.tint, S = info.width;
  for (let i = 0; i < S * info.height; i++) {
    const g = lin(o[i * 3]);
    let c = tn;
    if (opt.white) { const r = src[i * 3], gg = src[i * 3 + 1], b = src[i * 3 + 2]; if (Math.min(r, gg, b) > 175 && Math.max(r, gg, b) - Math.min(r, gg, b) < 40) c = opt.white; }
    // (MV: a soft knee over linear 0.6, never past 0.82 (sRGB 234): a light top's lit folds keep their shape, never clip)
    // (and a jersey's grain, a texel's worth of knit: the plain shading alone, smooth from the 64 px read, looked like satin)
    const px = i % S, py = (i / S) | 0, kn = 0.955 + 0.03 * hash3(px, py, 7) + 0.015 * (((px >> 1) + py) & 1);
    for (let k = 0; k < 3; k++) { const x = g * c[k] * kn; o[i * 3 + k] = enc(x < 0.6 ? x : 0.6 + (x - 0.6) / (1 + (x - 0.6) / 0.22)); }
  }
  if (opt.sleeve && T) {
    { let n = 0, near = 0; for (const v of new Set(T)) { const p = [pPos[v * 3], pPos[v * 3 + 1], pPos[v * 3 + 2]]; if (Math.abs(p[0]) > 0.2) near++; if (sleeveAt(p, opt.sleeve.w) > 0) n++; } console.error('sleeve verts', n, 'of', new Set(T).size, 'arm-ish', near); }
    const uv = PK.get('uv'), { w, color } = opt.sleeve;
    for (let q = 0; q < T.length; q += 3) {
      const vs = [T[q], T[q + 1], T[q + 2]], U = vs.map((v) => [uv[v * 2] / 65535 * S, (1 - uv[v * 2 + 1] / 65535) * S]), Pv = vs.map((v) => [pPos[v * 3], pPos[v * 3 + 1], pPos[v * 3 + 2]]);
      if (Pv.every((p) => Math.abs(p[0]) < 0.12)) continue;
      const x0 = Math.floor(Math.min(...U.map((u) => u[0]))), x1 = Math.ceil(Math.max(...U.map((u) => u[0]))), y0 = Math.floor(Math.min(...U.map((u) => u[1]))), y1 = Math.ceil(Math.max(...U.map((u) => u[1])));
      const det = (U[1][1] - U[2][1]) * (U[0][0] - U[2][0]) + (U[2][0] - U[1][0]) * (U[0][1] - U[2][1]); if (Math.abs(det) < 1e-9) continue;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const l1 = ((U[1][1] - U[2][1]) * (x - U[2][0]) + (U[2][0] - U[1][0]) * (y - U[2][1])) / det, l2 = ((U[2][1] - U[0][1]) * (x - U[2][0]) + (U[0][0] - U[2][0]) * (y - U[2][1])) / det, l3 = 1 - l1 - l2;
        if (l1 < -0.05 || l2 < -0.05 || l3 < -0.05 || x < 0 || y < 0 || x >= S || y >= S) continue;
        const p = [0, 1, 2].map((k) => l1 * Pv[0][k] + l2 * Pv[1][k] + l3 * Pv[2][k]), a = sleeveAt(p, w); if (a <= 0) continue;
        const i = (y * S + x) * 3;
        for (let k = 0; k < 3; k++) o[i + k] = Math.round(o[i + k] * (1 - a) + enc(Math.min(1, lin(200) * color[k])) * a);
      }
    }
  }
}
// (3D value noise, 0..1: a hash per lattice point, smoothly blended; fbm: three octaves)
function hash3(x, y, z) { let h = (x * 374761393 + y * 668265263 + z * 2147483647) >>> 0; h = ((h ^ (h >>> 13)) * 1274126177) >>> 0; return ((h ^ (h >>> 16)) & 0xffff) / 65535; } // (H5: hoisted: the beard's shells read vnoise before here)
function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), fx = x - xi, fy = y - yi, fz = z - zi, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const L = (a, b, t) => a + (b - a) * t, h = (i, j, k) => hash3(xi + i, yi + j, zi + k);
  return L(L(L(h(0, 0, 0), h(1, 0, 0), u), L(h(0, 1, 0), h(1, 1, 0), u), v), L(L(h(0, 0, 1), h(1, 0, 1), u), L(h(0, 1, 1), h(1, 1, 1), u), v), w);
}
const fbm = (p, s) => (vnoise(p[0] / s, p[1] / s, p[2] / s) * 0.55 + vnoise(p[0] / s * 2.3 + 7, p[1] / s * 2.3, p[2] / s * 2.3) * 0.3 + vnoise(p[0] / s * 5.1, p[1] / s * 5.1 + 3, p[2] / s * 5.1) * 0.15);
// a mechanic's overalls: grease and wear by the garment's 3D shape (bind space, the build's own positions), per pixel of
// its triangles T: the knees' fronts worn pale and grimed, the thighs' fronts and sides where his hands wipe dark,
// the bib's front and pocket a few smudges, the cuffs and the seat dirty, everything blotchy (noise), the tee lightly
// (the tee's texels: grey, unsaturated)
function grimeAt(p) {
  const H = B.J.height, y = p[1] / H, x = Math.abs(p[0]), z = p[2];
  const knee = Math.exp(-(((y - 0.285) / 0.05) ** 2)) * (z > 0.0 ? 1 : 0.3);
  const thigh = Math.exp(-(((y - 0.47) / 0.07) ** 2)) * (x > 0.07 ? 1 : 0.5);
  const bib = Math.exp(-(((y - 0.66) / 0.08) ** 2)) * (z > 0.06 ? 0.6 : 0.15);
  const cuff = Math.exp(-(((y - 0.03) / 0.04) ** 2));
  const seat = Math.exp(-(((y - 0.5) / 0.06) ** 2)) * (z < -0.05 ? 0.5 : 0);
  const n1 = fbm(p, 0.05), n2 = fbm([p[0] + 3, p[1], p[2]], 0.018), blot = Math.max(0, (n1 - 0.42) / 0.3) * (0.6 + 0.6 * n2);
  const grease = Math.min(1, (knee * 0.7 + thigh * 0.85 + bib * 0.6 + cuff * 0.8 + seat) * blot + 0.06 * n2);
  const wear = Math.min(1, knee * 0.9 * (0.5 + 0.7 * n1) + cuff * 0.4 + 0.1 * n1);
  return [grease, wear];
}
// FORGE: paint by the garment's 3D shape (bind space), per pixel of its triangles T: ripped knees and thighs (the skin
// under the tear, white weft threads across it, a frayed pale edge), a hoodie's kangaroo pocket (its seams), a check
function paint3D(o, info, T, opt) {
  const S = info.width, H0 = info.height, uv = PK.get('uv'), done = new Uint8Array(S * H0); let n = 0;
  const skinC = opt.skinRGB || [150, 110, 90];
  const rips = (opt.rips || []).map((r) => { const side = r.side || 'L', j = SKL((r.at || 'lowerleg01') + '.' + side); return { c: [j[0] + (r.dx || 0), j[1] + (r.dy || 0)], z: j[2], rx: r.rx || 0.04, ry: r.ry || 0.022, seed: r.seed || 1 }; });
  const fn = (p, rgb) => {
    for (const r of rips) { if (p[2] < r.z - 0.005) continue; const dx = (p[0] - r.c[0]) / r.rx, dy = (p[1] - r.c[1]) / r.ry, rag = 0.82 + 0.3 * vnoise(p[0] * 220 + r.seed, p[1] * 160, r.seed);
      const d = Math.hypot(dx, dy) / rag;
      if (d < 0.86) { const thread = ((p[1] / 0.0042) % 1 + 1) % 1 < 0.42 && vnoise(p[0] * 300, p[1] * 40, 3) > 0.25; return thread ? [226, 224, 214] : skinC.map((c) => c * (0.78 + 0.22 * vnoise(p[0] * 90, p[1] * 90, 9))); }
      if (d < 1.12) { const k = 1 - (d - 0.86) / 0.26, w = [220, 222, 226]; return rgb.map((c, i) => c + (w[i] - c) * 0.75 * k); } }
    if (opt.pocket) { const P = opt.pocket, top = WAIST + (P.top ?? 0.11), bot = WAIST - (P.bottom ?? 0.02), hw = P.w ?? 0.11;
      if (p[2] > (P.z ?? 0.02) && p[1] < top + 0.004 && p[1] > bot - 0.004) { const wAt = hw - (p[1] - bot) * 0.25, ax = Math.abs(p[0]);
        const e = Math.min(Math.abs(p[1] - top), Math.abs(ax - wAt), Math.abs(p[1] - bot)), inside = p[1] < top && p[1] > bot && ax < wAt;
        if (inside || ax < wAt + 0.004) { if (e < 0.0025) return rgb.map((c) => c * 0.8); if (e < 0.005) return rgb.map((c) => c * 1.04); if (inside) return rgb.map((c) => c * 0.97); } } }
    if (opt.check) { const C = opt.check, k = Math.floor(p[0] / C.size) + Math.floor(p[1] / C.size), a = ((k % 2) + 2) % 2; return a ? C.a : C.b; }
    return null;
  };
  for (let q = 0; q < T.length; q += 3) {
    const vs = [T[q], T[q + 1], T[q + 2]], U = vs.map((v) => [uv[v * 2] / 65535 * S, (1 - uv[v * 2 + 1] / 65535) * H0]), Pv = vs.map((v) => [pPos[v * 3], pPos[v * 3 + 1], pPos[v * 3 + 2]]);
    const x0 = Math.floor(Math.min(...U.map((u) => u[0]))), x1 = Math.ceil(Math.max(...U.map((u) => u[0]))), y0 = Math.floor(Math.min(...U.map((u) => u[1]))), y1 = Math.ceil(Math.max(...U.map((u) => u[1])));
    const det = (U[1][1] - U[2][1]) * (U[0][0] - U[2][0]) + (U[2][0] - U[1][0]) * (U[0][1] - U[2][1]); if (Math.abs(det) < 1e-9) continue;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const l1 = ((U[1][1] - U[2][1]) * (x - U[2][0]) + (U[2][0] - U[1][0]) * (y - U[2][1])) / det, l2 = ((U[2][1] - U[0][1]) * (x - U[2][0]) + (U[0][0] - U[2][0]) * (y - U[2][1])) / det, l3 = 1 - l1 - l2;
      if (l1 < -0.04 || l2 < -0.04 || l3 < -0.04 || x < 0 || y < 0 || x >= S || y >= H0 || done[y * S + x]) continue;
      done[y * S + x] = 1;
      const p = [0, 1, 2].map((c) => l1 * Pv[0][c] + l2 * Pv[1][c] + l3 * Pv[2][c]), i = (y * S + x) * 3, c = fn(p, [o[i], o[i + 1], o[i + 2]]);
      if (c) { for (let ch = 0; ch < 3; ch++) o[i + ch] = Math.max(0, Math.min(255, Math.round(c[ch]))); n++; }
    }
  }
  console.error('paint3D px', n);
}
function paintGrime(o, info, T, k) {
  const S = info.width, uv = PK.get('uv'); let n = 0;
  const done = new Uint8Array(S * info.height);
  for (let q = 0; q < T.length; q += 3) {
    const vs = [T[q], T[q + 1], T[q + 2]], U = vs.map((v) => [uv[v * 2] / 65535 * S, (1 - uv[v * 2 + 1] / 65535) * S]), Pv = vs.map((v) => [pPos[v * 3], pPos[v * 3 + 1], pPos[v * 3 + 2]]);
    const x0 = Math.floor(Math.min(...U.map((u) => u[0]))), x1 = Math.ceil(Math.max(...U.map((u) => u[0]))), y0 = Math.floor(Math.min(...U.map((u) => u[1]))), y1 = Math.ceil(Math.max(...U.map((u) => u[1])));
    const det = (U[1][1] - U[2][1]) * (U[0][0] - U[2][0]) + (U[2][0] - U[1][0]) * (U[0][1] - U[2][1]); if (Math.abs(det) < 1e-9) continue;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const l1 = ((U[1][1] - U[2][1]) * (x - U[2][0]) + (U[2][0] - U[1][0]) * (y - U[2][1])) / det, l2 = ((U[2][1] - U[0][1]) * (x - U[2][0]) + (U[0][0] - U[2][0]) * (y - U[2][1])) / det, l3 = 1 - l1 - l2;
      if (l1 < -0.04 || l2 < -0.04 || l3 < -0.04 || x < 0 || y < 0 || x >= S || y >= info.height || done[y * S + x]) continue;
      done[y * S + x] = 1;
      const p = [0, 1, 2].map((c) => l1 * Pv[0][c] + l2 * Pv[1][c] + l3 * Pv[2][c]), [g, w] = grimeAt(p), i = (y * S + x) * 3;
      const r = o[i], gg = o[i + 1], b = o[i + 2], mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), tee = mx > 70 && mx - mn < 26 ? 0.35 : 1;
      // (wear: toward a faded, greyer blue, lighter; grease: darker and browner)
      const L = (r + gg + b) / 3, fw = w * 0.32 * k * tee, fg = Math.min(0.42, g * 0.5 * k) * tee;
      let c = [r + (L * 1.25 + 18 - r) * fw, gg + (L * 1.25 + 20 - gg) * fw, b + (L * 1.3 + 26 - b) * fw];
      c = [c[0] * (1 - fg) + 30 * fg, c[1] * (1 - fg) + 27 * fg, c[2] * (1 - fg) + 24 * fg];
      for (let ch = 0; ch < 3; ch++) o[i + ch] = Math.max(0, Math.min(255, Math.round(c[ch])));
      n++;
    }
  }
  console.error('grime px', n);
}
async function garment(name, mode, opt = {}, T = null) {
  const f = A + PKD + '/' + name + '.jpg';
  if (mode === 'suit') return suitTex(f);
  if (mode === 'whites') {
    // (her tee white with the acid-green trim at the collar and cuffs (the print's orange stripes and dark-blue ribs), the
    // denim white, its weave and fading kept as a soft shade)
    const { data, info } = await sharp(f).removeAlpha().raw().toBuffer({ resolveWithObject: true }), { tee, denim, trim } = CFG.whites, H0 = info.height;
    for (let y = 0; y < H0; y++) for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * 3, r = data[i], g = data[i + 1], b = data[i + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b), L = 0.3 * r + 0.59 * g + 0.11 * b;
      if (mx - mn < 18 && mn > 150) continue; // (the atlas's empty grey)
      const teeZ = y < H0 * 0.48 || x > info.width * 0.72, orange = teeZ && r > g + 30 && r > b + 60, rib = teeZ && b > r + 60 && L < 70;
      let c, m;
      if (rib) { c = trim; m = Math.max(0.6, Math.min(1.1, L / 50)); }
      else if (orange) { c = tee; m = 0.95; }
      else if (y < H0 * 0.48 || x > info.width * 0.72) { c = tee; m = Math.max(0.78, Math.min(1.04, 0.62 + L / 230)); }
      else { c = denim; m = Math.max(0.84, Math.min(1.03, 0.8 + L / 900)); }
      for (let k = 0; k < 3; k++) data[i + k] = Math.min(255, Math.round(c[k] * m));
    }
    return sharp(data, { raw: info }).jpeg({ quality: 92 }).toBuffer();
  }
  if (mode === 'puffer') {
    // (the puffer's shell: white nylon, each channel's light baked by the same quilting as its shape (puffQuilt, from the
    // garment's points before they were puffed), darker into each baffle's seam, a stitch line in it; a zip down the front)
    const info = { width: 1024, height: 1024, channels: 3 }, S = 1024, data = new Uint8Array(S * S * 3), uvA = PK.get('uv'), Wt = CFG.puffer.white;
    for (let i = 0; i < data.length; i += 3) { data[i] = Wt[0]; data[i + 1] = Wt[1]; data[i + 2] = Wt[2]; }
    for (let q = 0; q < T.length; q += 3) {
      const vs = [T[q], T[q + 1], T[q + 2]], U = vs.map((v) => [uvA[v * 2] / 65535 * S, (1 - uvA[v * 2 + 1] / 65535) * S]), Pv = vs.map((v) => PUFF0.get(v) || [pPos[v * 3], pPos[v * 3 + 1], pPos[v * 3 + 2]]);
      const x0 = Math.floor(Math.min(...U.map((u) => u[0]))), x1 = Math.ceil(Math.max(...U.map((u) => u[0]))), y0 = Math.floor(Math.min(...U.map((u) => u[1]))), y1 = Math.ceil(Math.max(...U.map((u) => u[1])));
      const det = (U[1][1] - U[2][1]) * (U[0][0] - U[2][0]) + (U[2][0] - U[1][0]) * (U[0][1] - U[2][1]); if (Math.abs(det) < 1e-9) continue;
      const armW = vs.map((v) => PUFFARM.get(v) || 0);
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const l1 = ((U[1][1] - U[2][1]) * (x - U[2][0]) + (U[2][0] - U[1][0]) * (y - U[2][1])) / det, l2 = ((U[2][1] - U[0][1]) * (x - U[2][0]) + (U[0][0] - U[2][0]) * (y - U[2][1])) / det, l3 = 1 - l1 - l2;
        if (l1 < -0.04 || l2 < -0.04 || l3 < -0.04 || x < 0 || y < 0 || x >= S || y >= S) continue;
        const p = [0, 1, 2].map((k) => l1 * Pv[0][k] + l2 * Pv[1][k] + l3 * Pv[2][k]), aw = l1 * armW[0] + l2 * armW[1] + l3 * armW[2];
        const { q: qq, dist } = puffQuilt(p, aw), i = (y * S + x) * 3;
        // (lit by its own roundness: the channel's middle full, the seam's valley dark, a stitch line 1 mm wide in it)
        let k = 0.8 + 0.2 * Math.sqrt(qq);
        if (dist < 0.0007) k *= 0.86;
        k *= 0.97 + 0.06 * vnoise(x / 1.5, y / 1.5, 4);
        // (the zip: down the front's middle, a grey band 7 mm wide)
        if (Math.abs(p[0]) < 0.0035 && p[2] > 0.02 && p[1] > WAIST - 0.12) k *= 0.74;
        for (let c = 0; c < 3; c++) data[i + c] = Math.max(0, Math.min(255, Math.round(Wt[c] * k)));
      }
    }
    return sharp(data, { raw: info }).jpeg({ quality: 92 }).toBuffer();
  }
  if (mode === 'overalls') {
    const { data, info } = await sharp(f).removeAlpha().raw().toBuffer({ resolveWithObject: true }), { navy, tee } = CFG.overalls;
    // (the denim's middle lightness, so its weave keeps its own contrast about the navy)
    const Ls = []; for (let i = 0; i < data.length; i += 3) { const r = data[i], g = data[i + 1], b = data[i + 2]; if (b > r + 25 && Math.max(r, g, b) - Math.min(r, g, b) > 30) Ls.push(0.3 * r + 0.59 * g + 0.11 * b); }
    Ls.sort((a, b) => a - b); const Lm = Ls[Ls.length >> 1] || 140;
    for (let i = 0; i < data.length; i += 3) {
      const r = data[i], g = data[i + 1], b = data[i + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b), L = 0.3 * r + 0.59 * g + 0.11 * b;
      if (b > r + 25 && mx - mn > 30) { const m = Math.max(0.4, Math.min(1.8, Math.pow(L / Lm, 1.6))); for (let c = 0; c < 3; c++) data[i + c] = Math.min(255, Math.round(navy[c] * m)); }
      else if (mn > 110 && mx - mn < 40) { const m = Math.min(1.08, L / 236); for (let c = 0; c < 3; c++) data[i + c] = Math.min(255, Math.round(tee[c] * m)); }
    }
    if (CFG.grime && T) paintGrime(data, info, T, CFG.grime.k);
    return sharp(data, { raw: info }).jpeg({ quality: 92 }).toBuffer();
  }
  if (mode.startsWith('file:')) {
    const { data, info } = await sharp(mode.slice(5)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    if (CFG.grime && T) paintGrime(data, info, T, CFG.grime.k);
    return sharp(data, { raw: info }).jpeg({ quality: 92 }).toBuffer();
  }
  if (mode === 'tex' && T && (opt.rips || opt.pocket || opt.desat)) { const { data, info } = await sharp(f).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    if (opt.desat) for (let i = 0; i < data.length; i += 3) { const L = 0.3 * data[i] + 0.59 * data[i + 1] + 0.11 * data[i + 2]; for (let c = 0; c < 3; c++) data[i + c] = Math.round(L + (data[i + c] - L) * (1 - opt.desat)); }
    if (opt.rips || opt.pocket) paint3D(data, info, T, opt); return sharp(data, { raw: info }).jpeg({ quality: 92 }).toBuffer(); }
  if (mode !== 'flat' && mode !== 'bake') return rd(f);
  const { data, info } = await sharp(f).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  // (the cloth's shading: its brightness, blurred over the print's fine stripes, about its own middle)
  const lum = new Uint8Array(info.width * info.height); for (let i = 0; i < lum.length; i++) lum[i] = Math.round(0.3 * data[i * 3] + 0.59 * data[i * 3 + 1] + 0.11 * data[i * 3 + 2]);
  // (down to 64 px and back: the print's stripes gone, the folds' broad light and shade kept)
  // (forge v2.5, MV: done here, not by sharp: Node's sharp hands a one-channel raw image back as three channels, so the
  // shading was read three texels to the pixel, smeared sideways and banded line by line: the 'stripes' on every baked
  // sleeve and the blown light tops (the browser's sharp-web did not). Box-averaged to DS x DS, read back bilinear)
  const DS = opt.ds ?? 64, bl = (() => { const Wd = info.width, Hd = info.height, sm = new Float32Array(DS * DS), n = new Float32Array(DS * DS);
    for (let y = 0; y < Hd; y++) for (let x = 0; x < Wd; x++) { const k = Math.min(DS - 1, Math.floor(y * DS / Hd)) * DS + Math.min(DS - 1, Math.floor(x * DS / Wd)); sm[k] += lum[y * Wd + x]; n[k]++; }
    for (let k = 0; k < sm.length; k++) sm[k] /= n[k] || 1;
    const out = new Uint8Array(Wd * Hd);
    for (let y = 0; y < Hd; y++) { const fy = Math.min(DS - 1, Math.max(0, (y + 0.5) * DS / Hd - 0.5)), y0 = Math.floor(fy), y1 = Math.min(DS - 1, y0 + 1), ty = fy - y0;
      for (let x = 0; x < Wd; x++) { const fx = Math.min(DS - 1, Math.max(0, (x + 0.5) * DS / Wd - 0.5)), x0 = Math.floor(fx), x1 = Math.min(DS - 1, x0 + 1), tx = fx - x0;
        out[y * Wd + x] = Math.round((sm[y0 * DS + x0] * (1 - tx) + sm[y0 * DS + x1] * tx) * (1 - ty) + (sm[y1 * DS + x0] * (1 - tx) + sm[y1 * DS + x1] * tx) * ty); } }
    return out; })();
  const sorted = Uint8Array.from(bl).sort(), mid = sorted[Math.floor(sorted.length * 0.6)] || 128;
  const o = new Uint8Array(info.width * info.height * 3);
  const floor = opt.floor ?? 0.35;
  for (let i = 0; i < lum.length; i++) { const v = Math.max(floor, Math.min(1.25, bl[i] / mid)) * 200; o[i * 3] = o[i * 3 + 1] = o[i * 3 + 2] = Math.min(255, Math.round(v)); }
  if (mode === 'bake') bakeCloth(o, data, info, opt, T);
  if (T && (opt.rips || opt.pocket || opt.check)) paint3D(o, info, T, opt);
  return sharp(o, { raw: { width: info.width, height: info.height, channels: 3 } }).jpeg({ quality: 90 }).toBuffer();
}
// a texture's lightness put onto a ramp (its alpha kept): the hair and brows silver
// (cast2: the hair's relief: its lightness as a height, a normal map from it (the strands raised, the gaps between them
// sunk), so the light runs along the strands and the shine breaks up)
async function hairNormal(f, k = 3.2) {
  const { data, info } = await sharp(f).ensureAlpha().raw().toBuffer({ resolveWithObject: true }), W0 = info.width, H0 = info.height, h = new Float32Array(W0 * H0);
  for (let i = 0; i < W0 * H0; i++) h[i] = (0.3 * data[i * 4] + 0.59 * data[i * 4 + 1] + 0.11 * data[i * 4 + 2]) / 255 * (data[i * 4 + 3] / 255);
  const o = new Uint8Array(W0 * H0 * 3), at = (x, y) => h[Math.min(H0 - 1, Math.max(0, y)) * W0 + Math.min(W0 - 1, Math.max(0, x))];
  for (let y = 0; y < H0; y++) for (let x = 0; x < W0; x++) { const dx = (at(x + 1, y) - at(x - 1, y)) * k, dy = (at(x, y + 1) - at(x, y - 1)) * k, l = Math.hypot(dx, dy, 1), i = (y * W0 + x) * 3;
    o[i] = Math.round((-dx / l * 0.5 + 0.5) * 255); o[i + 1] = Math.round((dy / l * 0.5 + 0.5) * 255); o[i + 2] = Math.round((1 / l * 0.5 + 0.5) * 255); }
  return sharp(o, { raw: { width: W0, height: H0, channels: 3 } }).png().toBuffer();
}
// FORGE: box braids: the hair's own cut-out (its cards' alpha) filled with rows of plaits along the strands (the cards'
// v), each braid a rounded strand of alternating lobes (a chevron), dark between braids, each braid's colour and phase
// its own; the gaps cut out, so the braids read separate
async function braidTex(f, Bd) {
  const { data, info } = await sharp(f).ensureAlpha().raw().toBuffer({ resolveWithObject: true }), W0 = info.width, H0 = info.height;
  const w = Bd.width ?? Math.round(W0 / 70), P = w * (Bd.pitch ?? 0.85), cols = Bd.colors || [[14, 10, 9], [46, 34, 28], [92, 70, 56]];
  const hsh = (i) => { let h = (i * 374761393) >>> 0; h = ((h ^ (h >>> 13)) * 1274126177) >>> 0; return (h & 0xffff) / 65535; };
  const a0 = new Uint8Array(W0 * H0); for (let i = 0; i < W0 * H0; i++) a0[i] = data[i * 4 + 3];
  for (let y = 0; y < H0; y++) for (let x = 0; x < W0; x++) {
    const i = (y * W0 + x) * 4; if (a0[y * W0 + x] < 60) { data[i + 3] = 0; continue; }
    const col = Math.floor(x / w), u = (x - col * w) / w, ph = hsh(col) * P, prof = 1 - Math.pow(2 * u - 1, 2);
    const s = ((y + ph) / P) % 1, lobe = Math.abs(((s + (u < 0.5 ? 0 : 0.5)) % 1) - 0.5) * 2;
    const L = Math.max(0, Math.min(1, (0.25 + 0.75 * Math.sqrt(prof)) * (0.45 + 0.55 * lobe) * (0.85 + 0.3 * hsh(col * 7 + 1))));
    const t = L * (cols.length - 1), k = Math.min(cols.length - 2, Math.floor(t)), f2 = t - k;
    for (let c = 0; c < 3; c++) data[i + c] = Math.round(cols[k][c] + (cols[k + 1][c] - cols[k][c]) * f2);
    data[i + 3] = prof > 0.16 ? 255 : 0;
  }
  return sharp(data, { raw: info }).png().toBuffer();
}
async function ramp(f, stops) {
  const { data, info } = await sharp(f).ensureAlpha().raw().toBuffer({ resolveWithObject: true }), lum = (i) => 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
  const Ls = []; for (let i = 0; i < data.length; i += 4) if (data[i + 3] > 100) Ls.push(lum(i)); Ls.sort((a, b) => a - b);
  const lo = Ls[Math.floor(Ls.length * 0.05)], hi = Ls[Math.floor(Ls.length * 0.97)], n = stops.length - 1;
  for (let i = 0; i < data.length; i += 4) { const t = Math.max(0, Math.min(1, (lum(i) - lo) / Math.max(1, hi - lo))) * n, k = Math.min(n - 1, Math.floor(t)), f2 = t - k;
    for (let c = 0; c < 3; c++) data[i + c] = Math.round(stops[k][c] + (stops[k + 1][c] - stops[k][c]) * f2); }
  return sharp(data, { raw: info }).png().toBuffer();
}
// (FC, talking faces: the cards' heads thinned: each side's image in the cards' texture faded toward the brow's inner end
// (to 45 % at the head, full a third of the way out), so the head reads soft and lighter than the arch, as a real brow's
// does; with the alpha cut, fewer of its hairs pass. The template's cards drew their heaviest, steepest strokes there:
// with dark hair a knot by the nose read as a scowl (the talk gate's head weight). Which end is the head: each side's
// card points' u against their distance out from the middle, fitted)
async function browHeads(img) {
  const uv = B.get('uv'), fit = [1, -1].map((sd) => { const vs = [...new Set(browT)].filter((v) => bPos[v * 3] * sd > 0); let a0 = 9, a1 = 0, w0 = 9, w1 = -9; for (const v of vs) { const ax = Math.abs(bPos[v * 3]); a0 = Math.min(a0, ax); a1 = Math.max(a1, ax); }
    let su = 0, st = 0, suu = 0, sut = 0; for (const v of vs) { const u = uv[v * 2] / 65535, w = 1 - uv[v * 2 + 1] / 65535, t = (Math.abs(bPos[v * 3]) - a0) / Math.max(1e-4, a1 - a0); su += u; st += t; suu += u * u; sut += u * t; w0 = Math.min(w0, w); w1 = Math.max(w1, w); }
    const n = vs.length || 1, b = (n * sut - su * st) / Math.max(1e-9, n * suu - su * su), a = (st - b * su) / n; return { a, b, w0, w1 }; });
  const { data, info } = await sharp(img).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let y = 0; y < info.height; y++) { const w = (y + 0.5) / info.height, f = fit.find((F) => w >= F.w0 - 0.03 && w <= F.w1 + 0.03); if (!f) continue;
    for (let x = 0; x < info.width; x++) { const t = clamp01(f.a + f.b * (x + 0.5) / info.width), i = (y * info.width + x) * 4; data[i + 3] = Math.round(data[i + 3] * (0.45 + 0.55 * sm(0.0, 0.33, t))); } }
  return sharp(data, { raw: info }).png().toBuffer();
}
// the suit: its dark cloth navy (its own light and folds kept), the shirt's whites kept, the tie a deep burgundy (its
// stripes kept as a darker weave), the maker's mark in the atlas's corner painted out
async function suitTex(f) {
  const { data, info } = await sharp(f).removeAlpha().raw().toBuffer({ resolveWithObject: true }), S = info.width, k = S / 1024;
  const at = (x, y) => (y * S + x) * 3, bg = [data[at(Math.round(260 * k), Math.round(12 * k))], data[at(Math.round(260 * k), Math.round(12 * k)) + 1], data[at(Math.round(260 * k), Math.round(12 * k)) + 2]];
  const { navy, tie } = CFG.suit; let nt = 0, nw = 0;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < S; x++) {
    const i = at(x, y), r = data[i], g = data[i + 1], b = data[i + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b), L = 0.3 * r + 0.59 * g + 0.11 * b;
    if (x < 200 * k && y < 30 * k) { data[i] = bg[0]; data[i + 1] = bg[1]; data[i + 2] = bg[2]; continue; }
    if (x > 735 * k && y > 465 * k && y < 720 * k) continue; // (the shoes' part of the atlas: as it is)
    const white = mn > 140 && mx - mn < 30;
    if (white) { nw++; continue; }
    if (x > 355 * k && x < 440 * k && y > 70 * k && y < 200 * k) { const m = Math.max(0.45, Math.min(1.25, L / 110)); data[i] = Math.round(tie[0] * m); data[i + 1] = Math.round(tie[1] * m); data[i + 2] = Math.round(tie[2] * m); nt++; continue; }
    const m = Math.max(0.35, Math.min(1.7, L / 47)); data[i] = Math.min(255, Math.round(navy[0] * m)); data[i + 1] = Math.min(255, Math.round(navy[1] * m)); data[i + 2] = Math.min(255, Math.round(navy[2] * m));
  }
  console.error('suit: tie px', nt, 'white px', nw);
  return sharp(data, { raw: info }).jpeg({ quality: 92 }).toBuffer();
}
// the beard on the skin's texture: each skin triangle with some beard drawn in the texture's space (its uvs), the
// silver hair over the skin by the area's share, a fine grain of darker roots and lighter tips in it
async function paintBeard(img) {
  if (!CFG.beard) return img;
  const S = 2048, { data } = await sharp(img).removeAlpha().raw().toBuffer({ resolveWithObject: true }), uv = B.get('uv'), { col, root, a: A0 } = CFG.beard;
  let n = 0; const done = new Uint8Array(S * S); // (H5: each texel once: the overlap at triangle edges drew the mesh)
  for (let q = 0; q < skinT.length; q += 3) {
    const vs = [skinT[q], skinT[q + 1], skinT[q + 2]], ws = vs.map((v) => BEARD[v]); if (ws.every((w) => w <= 0.01)) continue;
    const U = vs.map((v) => [uv[v * 2] / 65535 * S, (1 - uv[v * 2 + 1] / 65535) * S]), Pv = vs.map((v) => [bPos[v * 3], bPos[v * 3 + 1], bPos[v * 3 + 2]]);
    const d = uvDir(Pv, U, growth(Pv[0]));
    const x0 = Math.floor(Math.min(...U.map((u) => u[0]))), x1 = Math.ceil(Math.max(...U.map((u) => u[0]))), y0 = Math.floor(Math.min(...U.map((u) => u[1]))), y1 = Math.ceil(Math.max(...U.map((u) => u[1])));
    const det = (U[1][1] - U[2][1]) * (U[0][0] - U[2][0]) + (U[2][0] - U[1][0]) * (U[0][1] - U[2][1]); if (Math.abs(det) < 1e-9) continue;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const l1 = ((U[1][1] - U[2][1]) * (x - U[2][0]) + (U[2][0] - U[1][0]) * (y - U[2][1])) / det, l2 = ((U[2][1] - U[0][1]) * (x - U[2][0]) + (U[0][0] - U[2][0]) * (y - U[2][1])) / det, l3 = 1 - l1 - l2;
      if (l1 < -0.03 || l2 < -0.03 || l3 < -0.03 || x < 0 || y < 0 || x >= S || y >= S) continue;
      const wv = Math.max(0, Math.min(1, l1 * ws[0] + l2 * ws[1] + l3 * ws[2])); if (wv <= 0.01 || done[y * S + x]) continue; done[y * S + x] = 1;
      const i = (y * S + x) * 3;
      // (the base: the skin under a dense beard darkened toward the roots' colour, by how full the beard is there)
      const base = sm(0.05, 0.75, wv) * A0;
      // (the strands over it: dark hairs along the growth, sparser toward the edge; grey ones as fine streaks)
      const h = sm(0.42, 0.68, strand(x, y, d, CFG.beard.len || 16, 1)), gr = sm(0.8, 0.9, strand(x, y, d, (CFG.beard.len || 16) * 1.3, 7)) * (CFG.beard.grey ?? 0.2) * 5;
      const ha = h * sm(0.02, 0.45, wv) * 0.9;
      const k = 0.85 + 0.3 * vnoise(x / 3, y / 3, 2);
      for (let ch = 0; ch < 3; ch++) {
        let c = data[i + ch] * (1 - base) + root[ch] * base;
        const hc = gr > 0.5 ? col[ch] : CFG.beard.mid[ch] * k;
        c = c * (1 - ha) + hc * ha;
        data[i + ch] = Math.max(0, Math.min(255, Math.round(c)));
      }
      n++;
    }
  }
  console.error('beard px', n);
  return sharp(data, { raw: { width: S, height: S, channels: 3 } }).jpeg({ quality: 92 }).toBuffer();
}
// (H5: stubble that shows. v2 painted it as a flat tint of 8-25 % with a per-texel grain: at 2 m the jaw was the bare
// skin's own colour (the mechanic's, the club promoter's). Now as Mr. Big's skin under his shells: a 5 o'clock shadow
// (the skin darkened and cooled toward the stubble's root colour by the area's share, feathered at its edge) and over
// it the hairs: short strokes 1-1.5 mm along the growth, dense, a share of them light for salt-and-pepper (CFG.beard
// { a: shadow, mid: hair, light, grey: light share, dens })
async function paintStubbleTex(img) {
  const S = 2048, { data } = await sharp(img).removeAlpha().raw().toBuffer({ resolveWithObject: true }), uv = B.get('uv'), Bd = CFG.beard, A0 = Bd.a ?? 0.25, mid = Bd.mid || [30, 28, 28], light = Bd.light || mid, gS = Bd.grey ?? 0, dens = Bd.dens ?? 0.8;
  // (each texel painted once: triangles overlap a little at their edges, and painting twice drew the mesh as hatching)
  let n = 0; const done = new Uint8Array(S * S);
  for (let q = 0; q < skinT.length; q += 3) {
    const vs = [skinT[q], skinT[q + 1], skinT[q + 2]], ws = vs.map((v) => BEARD[v]); if (ws.every((w) => w <= 0.01)) continue;
    const U = vs.map((v) => [uv[v * 2] / 65535 * S, (1 - uv[v * 2 + 1] / 65535) * S]), Pv = vs.map((v) => [bPos[v * 3], bPos[v * 3 + 1], bPos[v * 3 + 2]]), d = uvDir(Pv, U, growth(Pv[0]));
    const x0 = Math.floor(Math.min(...U.map((u) => u[0]))), x1 = Math.ceil(Math.max(...U.map((u) => u[0]))), y0 = Math.floor(Math.min(...U.map((u) => u[1]))), y1 = Math.ceil(Math.max(...U.map((u) => u[1])));
    const det = (U[1][1] - U[2][1]) * (U[0][0] - U[2][0]) + (U[2][0] - U[1][0]) * (U[0][1] - U[2][1]); if (Math.abs(det) < 1e-9) continue;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const l1 = ((U[1][1] - U[2][1]) * (x - U[2][0]) + (U[2][0] - U[1][0]) * (y - U[2][1])) / det, l2 = ((U[2][1] - U[0][1]) * (x - U[2][0]) + (U[0][0] - U[2][0]) * (y - U[2][1])) / det, l3 = 1 - l1 - l2;
      if (l1 < -0.03 || l2 < -0.03 || l3 < -0.03 || x < 0 || y < 0 || x >= S || y >= S) continue;
      const wv = Math.max(0, Math.min(1, l1 * ws[0] + l2 * ws[1] + l3 * ws[2])); if (wv <= 0.01) continue;
      // (the edge: ragged by a slow noise, as a shaved line grown out is)
      if (done[y * S + x]) continue; done[y * S + x] = 1;
      // (F6: with CFG.beard.cool the shadow is the skin itself taken toward a blue-grey (a shaved man's skin over his
      // roots), its edge soft (no ragged top), the hairs fainter and shorter)
      const cool = Bd.cool, e = cool ? Math.pow(sm(0.02, 0.85, wv + (vnoise(x / 14, y / 14, 13) - 0.5) * 0.12), 1.3) : sm(0.08, 0.7, wv + (vnoise(x / 9, y / 9, 13) - 0.5) * 0.35), i = (y * S + x) * 3;
      const base = A0 * e * (0.85 + 0.3 * vnoise(x / 30, y / 30, 5));
      const st = 0.65 * vnoise(x / 0.9, y / 0.9, 1) + 0.35 * strand(x, y, d, Bd.len ?? 1.8, 1), hairA = sm(0.62 - 0.08 * dens, 0.76 - 0.06 * dens, st) * e * (Bd.hair ?? 0.38), isL = vnoise(x / 1.3, y / 1.3, 17) < gS;
      for (let ch = 0; ch < 3; ch++) { let c = cool ? data[i + ch] * (1 - base * (1 - cool[ch]) * 1.6) : data[i + ch] * (1 - base) + mid[ch] * base; c = c * (1 - hairA) + (isL ? light[ch] : mid[ch] * 0.92) * hairA; data[i + ch] = Math.max(0, Math.min(255, Math.round(c))); }
      n++; } }
  console.error('stubble (H5) px', n);
  return sharp(data, { raw: { width: S, height: S, channels: 3 } }).jpeg({ quality: 92 }).toBuffer();
}
// (forge v2.3, HB: the brows painted on the skin under the brows' cards (the template's strip), in the brows' own colours.
// FC, talking faces: soft, not stroked. The skin's texels are about half a millimetre, so HB's fine strokes became blocky
// dots under the cards ('stitches'), and their dark, tall inner heads with steep strokes read as a scowl in every
// close-up. Now a feathered fill (Mr. Big's and Jane's brows are their cards alone, soft and low in contrast): each side's
// line from the strip's points (a smooth curve through its middle); the brow's band round it 2.4 mm half at the inner
// head, fullest (2.6) a third of the way out, thinning to 0.9 at the tail; its density lighter at the head (half), full
// under the arch, fading through the tail; both edges feathered (the lower a little crisper, as a groomed brow's is), the
// ends rounded off; a slow patchy variation of a few per cent, never per texel. The fine hairs are the cards over it)
async function paintBrows(img) {
  if (!CFG.browPaint || !browT.length) return img;
  const BP = CFG.browPaint, S = 2048, { data } = await sharp(img).removeAlpha().raw().toBuffer({ resolveWithObject: true }), uv = B.get('uv'), col = BP.col || CFG.browRamp[1];
  const side = {}; for (const v of new Set(browT)) { const x = bPos[v * 3], sd = x > 0 ? 1 : -1, e = side[sd] || (side[sd] = { bins: new Map(), a0: 9, a1: 0, z: -9 }), b = Math.round(Math.abs(x) / 0.002);
    const L = e.bins.get(b) || e.bins.set(b, []).get(b); L.push(bPos[v * 3 + 1]); e.a0 = Math.min(e.a0, Math.abs(x)); e.a1 = Math.max(e.a1, Math.abs(x)); e.z = Math.max(e.z, bPos[v * 3 + 2]); }
  // (FC: the line a smooth curve: a quadratic fitted to each 2 mm bin's middle (its strip's top and bottom halfway). HB
  // took each bin's mean as a step, so the narrow band jumped up and down every 2 mm: the 'stitches' were those steps)
  for (const e of Object.values(side)) { const A = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
    for (const [b, L] of e.bins) { const x = b * 0.002 - e.a0, y = (Math.min(...L) + Math.max(...L)) / 2, r = [1, x, x * x]; for (let i = 0; i < 3; i++) { for (let j = 0; j < 3; j++) A[i][j] += r[i] * r[j]; A[i][3] += r[i] * y; } }
    for (let c = 0; c < 3; c++) { let m = c; for (let r = c + 1; r < 3; r++) if (Math.abs(A[r][c]) > Math.abs(A[m][c])) m = r; [A[c], A[m]] = [A[m], A[c]]; for (let r = 0; r < 3; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let k = c; k < 4; k++) A[r][k] -= f * A[c][k]; } }
    e.fit = [A[0][3] / A[0][0], A[1][3] / A[1][1], A[2][3] / A[2][2]]; }
  const yc = (e, ax) => { const x = Math.min(e.a1, Math.max(e.a0, ax)) - e.a0; return e.fit[0] + e.fit[1] * x + e.fit[2] * x * x; };
  let n = 0;
  for (let q = 0; q < skinT.length; q += 3) {
    const vs = [skinT[q], skinT[q + 1], skinT[q + 2]], Pv = vs.map((v) => [bPos[v * 3], bPos[v * 3 + 1], bPos[v * 3 + 2]]), cx = (Pv[0][0] + Pv[1][0] + Pv[2][0]) / 3, e = side[cx > 0 ? 1 : -1]; if (!e) continue;
    const ax = Math.abs(cx), cy = (Pv[0][1] + Pv[1][1] + Pv[2][1]) / 3; if (ax < e.a0 - 0.006 || ax > e.a1 + 0.004 || Math.abs(cy - yc(e, ax)) > 0.012 || (Pv[0][2] + Pv[1][2] + Pv[2][2]) / 3 < e.z - 0.035) continue;
    const U = vs.map((v) => [uv[v * 2] / 65535 * S, (1 - uv[v * 2 + 1] / 65535) * S]);
    const x0 = Math.floor(Math.min(...U.map((u) => u[0]))), x1 = Math.ceil(Math.max(...U.map((u) => u[0]))), y0 = Math.floor(Math.min(...U.map((u) => u[1]))), y1 = Math.ceil(Math.max(...U.map((u) => u[1])));
    const det = (U[1][1] - U[2][1]) * (U[0][0] - U[2][0]) + (U[2][0] - U[1][0]) * (U[0][1] - U[2][1]); if (Math.abs(det) < 1e-9) continue;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const l1 = ((U[1][1] - U[2][1]) * (x - U[2][0]) + (U[2][0] - U[1][0]) * (y - U[2][1])) / det, l2 = ((U[2][1] - U[0][1]) * (x - U[2][0]) + (U[0][0] - U[2][0]) * (y - U[2][1])) / det, l3 = 1 - l1 - l2;
      if (l1 < -0.02 || l2 < -0.02 || l3 < -0.02 || x < 0 || y < 0 || x >= S || y >= S) continue;
      const px = Math.abs(l1 * Pv[0][0] + l2 * Pv[1][0] + l3 * Pv[2][0]), py = l1 * Pv[0][1] + l2 * Pv[1][1] + l3 * Pv[2][1], t = clamp01((px - e.a0) / Math.max(0.01, e.a1 - e.a0));
      const half = (t < 0.35 ? 0.0024 + 0.0002 * (t / 0.35) : 0.0026 - 0.0017 * Math.pow((t - 0.35) / 0.65, 1.2)) * (BP.k ?? 1), dy = py - (yc(e, px) - 0.0003 + 0.0006 * t - (BP.droop ?? 0) * sm(0.55, 1, t));
      // (F6, BP.soft: softer edges, the upper one carried up by the arch (fullest two thirds out), and a faint grain of hairs
      // along their lie (up and out at the head, flat at the arch, down at the tail), never a stroke per texel)
      const up = half * (1 + (BP.arch ?? 0) / 0.0026 * Math.sin(Math.PI * Math.min(1, t / 1.0)) * sm(0.1, 0.65, t));
      const edge = BP.soft ? (dy < 0 ? 1 - sm(half * 0.35, half * 1.3, -dy) : 1 - sm(up * 0.2, up * 1.45, dy)) : dy < 0 ? 1 - sm(half * 0.5, half * 1.05, -dy) : 1 - sm(half * 0.3, half * 1.15, dy);
      const lie = BP.soft ? 0.86 + 0.28 * vnoise((x * Math.cos(1.1 - 1.4 * t) + y * Math.sin(1.1 - 1.4 * t)) / 6, (-x * Math.sin(1.1 - 1.4 * t) + y * Math.cos(1.1 - 1.4 * t)) / 1.2, 31) : 1;
      const ends = sm(e.a0 - 0.001, e.a0 + 0.007, px) * (1 - sm(e.a1 - 0.008, e.a1 + 0.001, px)), dens = (0.5 + 0.5 * sm(0.0, 0.32, t)) * (1 - 0.5 * sm(0.68, 1.0, t));
      const a = Math.min(0.95, (BP.a ?? 0.4) * edge * ends * dens * lie * (0.92 + 0.16 * (vnoise(x / 9, y / 9, 3.7) - 0.5))); if (a <= 0.004) continue; const i = (y * S + x) * 3;
      for (let ch = 0; ch < 3; ch++) data[i + ch] = Math.max(0, Math.min(255, Math.round(data[i + ch] * (1 - a) + col[ch] * a)));
      n++; } }
  console.error('brows painted (soft)', n, 'px');
  return sharp(data, { raw: { width: S, height: S, channels: 3 } }).jpeg({ quality: 92 }).toBuffer();
}
// the shells' hair: in the skin's texture space, over the beard's triangles only (the rest clear): strands along the
// growth (cast2: streaks a px across and the beard's len long, not dots), dark, a few grey; their alpha the strand's
// (an inner shell shows most of them, the outer ones the longest few: the alpha by layer is the shells' vertex colour)
// (Mr. Big's shells (build-man.mjs): short salt-and-pepper strokes, silver or CFG.shells.cols; a trimmed beard)
async function shellTexStrokes(SX = 1) {
  // (H5: Mr. Big's strokes laid along the beard's growth, in clumps, so the shells read as layered hair, not wool: v2.3 drew
  // each texel its own random height (stretched 3 px down the texture whatever the growth), a salt noise that read as a
  // fur ball (the old boss) or cotton wool (the veteran's moustache). Now each texel's height is a strand (a fine streak
  // 1 px across, CFG.shells.len px long along the growth carried into the texture's space) in its clump (a coarser
  // streak), and the edge of the beard ragged by a slow noise (stubble: dots, not streaks: on the jaw's stretched uvs
  // its streaks crossed as hatching); an inner shell (vertex alpha 1) shows most strands, the
  // outer ones only the tallest, each strand its own shade between the two colours. 'stubble': short sparse strokes)
  const S = CFG.shells.tex, data = new Uint8Array(S * S * 4), uv = B.get('uv'), C = CFG.shells.cols, stub = CFG.shells.style === 'stubble';
  const len = CFG.shells.len ?? (stub ? 2.4 : 7), gS = CFG.shells.grey ?? (C ? 0.08 : 0.3);
  for (let q = 0; q < shell.T.length; q += 3) {
    const vs = [shell.T[q], shell.T[q + 1], shell.T[q + 2]], ws = vs.map((v) => BEARD[v]);
    const U = vs.map((v) => [uv[v * 2] / 65535 * S * SX, (1 - uv[v * 2 + 1] / 65535) * S]), Pv = vs.map((v) => [bPos[v * 3], bPos[v * 3 + 1], bPos[v * 3 + 2]]), d = uvDir(Pv, U, growth(Pv[0]));
    const x0 = Math.floor(Math.min(...U.map((u) => u[0]))) - 1, x1 = Math.ceil(Math.max(...U.map((u) => u[0]))) + 1, y0 = Math.floor(Math.min(...U.map((u) => u[1]))) - 1, y1 = Math.ceil(Math.max(...U.map((u) => u[1]))) + 1;
    const det = (U[1][1] - U[2][1]) * (U[0][0] - U[2][0]) + (U[2][0] - U[1][0]) * (U[0][1] - U[2][1]); if (Math.abs(det) < 1e-9) continue;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const l1 = ((U[1][1] - U[2][1]) * (x - U[2][0]) + (U[2][0] - U[1][0]) * (y - U[2][1])) / det, l2 = ((U[2][1] - U[0][1]) * (x - U[2][0]) + (U[0][0] - U[2][0]) * (y - U[2][1])) / det, l3 = 1 - l1 - l2;
      if (l1 < -0.08 || l2 < -0.08 || l3 < -0.08 || x < 0 || y < 0 || x >= S || y >= S) continue;
      const wv = Math.max(0, Math.min(1, l1 * ws[0] + l2 * ws[1] + l3 * ws[2])), i = (y * S + x) * 4;
      const fine = stub ? vnoise(x / 0.85, y / 0.85, 3) : strand(x, y, d, len, 3), clump = strand(x / 3.2, y / 3.2, d, len / 2.2, 8), h = stub ? fine : 0.62 * fine + 0.38 * clump;
      const cov = sm(0.06, 0.62, wv + (vnoise(x / 7, y / 7, 21) - 0.5) * 0.45);
      const a = cov * (stub ? 0.7 * sm(0.7, 0.82, h) : sm(0.3 + (CFG.shells.gap ?? 0), 0.78 + (CFG.shells.gap ?? 0) * 0.5, h)); if (a * 255 <= data[i + 3]) continue; // (F6: gap: fewer, separate strands)
      const tone = strand(x, y, d, len * 1.4, 5), isL = vnoise(x / 1.4, y / 4, 23) < gS;
      if (C) { const lo = isL ? C[1] : C[0], hi = isL ? C[1].map((c) => Math.min(255, c * 1.15)) : C[1]; for (let ch = 0; ch < 3; ch++) data[i + ch] = Math.min(255, Math.round(lo[ch] + (hi[ch] - lo[ch]) * tone)); }
      else { const g = (isL ? 196 : 118) + 52 * tone; data[i] = Math.min(255, Math.round(g + 3)); data[i + 1] = Math.min(255, Math.round(g + 1)); data[i + 2] = Math.min(255, Math.round(g)); }
      data[i + 3] = Math.round(a * 255);
    }
  }
  return sharp(data, { raw: { width: S, height: S, channels: 4 } }).png().toBuffer();
}
// (forge v2.3: the beard's one texture: the shells' strokes squeezed into its left shell.SX (their uvs are), the cards'
// strand strip (library.mjs strandAtlas, 512 x 2048) in the rest)
async function beardTex() {
  if (!shell.cards) return shellTex();
  const S = CFG.shells?.tex || 2048, W = Math.round(S * (1 - shell.SX)), SW = S - W;
  const silver = !CFG.shells?.cols, ramp3 = silver ? [[112, 110, 108], [178, 176, 174], [228, 228, 228]] : [CFG.beard.root, CFG.beard.mid, CFG.beard.col];
  // (a grey beard's cards silver as its shells are (Mr. Big's strokes, 128-220), not the paint's dark roots)
  const strip = await sharp(strandAtlas(W, S, ramp3, silver ? 0.3 : CFG.cards.grey ?? 0.12, CFG.cards.seed || 3), { raw: { width: W, height: S, channels: 4 } }).png().toBuffer();
  const left = shell.layers ? await sharp(await shellTexStrokes(shell.SX)).extract({ left: 0, top: 0, width: SW, height: S }).png().toBuffer() : null;
  return sharp({ create: { width: S, height: S, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([...(left ? [{ input: left, left: 0, top: 0 }] : []), { input: strip, left: SW, top: 0 }]).png().toBuffer();
}
// (F6: Mr. Big's own shell texture (build-man.mjs shellTex), for a full beard made as his: short strokes 1 x 3 px, each
// its own silver (128-220, a little warm or cool per 4 px) or between CFG.shells.cols, each its own height (its alpha))
async function shellTexMrBig() {
  const S = CFG.shells.tex, data = new Uint8Array(S * S * 4), uv = B.get('uv'), C = CFG.shells.cols;
  const hash = (x, y) => { let h = (x * 374761393 + y * 668265263) >>> 0; h = ((h ^ (h >>> 13)) * 1274126177) >>> 0; return (h & 0xffff) / 65535; };
  for (let q = 0; q < shell.T.length; q += 3) {
    const vs = [shell.T[q], shell.T[q + 1], shell.T[q + 2]], ws = vs.map((v) => BEARD[v]);
    const U = vs.map((v) => [uv[v * 2] / 65535 * S, (1 - uv[v * 2 + 1] / 65535) * S]);
    const x0 = Math.floor(Math.min(...U.map((u) => u[0]))) - 1, x1 = Math.ceil(Math.max(...U.map((u) => u[0]))) + 1, y0 = Math.floor(Math.min(...U.map((u) => u[1]))) - 1, y1 = Math.ceil(Math.max(...U.map((u) => u[1]))) + 1;
    const det = (U[1][1] - U[2][1]) * (U[0][0] - U[2][0]) + (U[2][0] - U[1][0]) * (U[0][1] - U[2][1]); if (Math.abs(det) < 1e-9) continue;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const l1 = ((U[1][1] - U[2][1]) * (x - U[2][0]) + (U[2][0] - U[1][0]) * (y - U[2][1])) / det, l2 = ((U[2][1] - U[0][1]) * (x - U[2][0]) + (U[0][0] - U[2][0]) * (y - U[2][1])) / det, l3 = 1 - l1 - l2;
      if (l1 < -0.08 || l2 < -0.08 || l3 < -0.08 || x < 0 || y < 0 || x >= S || y >= S) continue;
      const wv = Math.max(0, Math.min(1, l1 * ws[0] + l2 * ws[1] + l3 * ws[2])), i = (y * S + x) * 4;
      const h = hash(x, Math.floor(y / 3)), h2 = hash(x * 3 + 7, Math.floor(y / 3) * 5 + 2), a = Math.min(1, wv * 1.6) * (0.3 + 0.7 * h); if (a * 255 <= data[i + 3]) continue;
      const g = 128 + 92 * h2, warm = (hash(x >> 2, y >> 2) - 0.5) * 8;
      if (C) for (let ch = 0; ch < 3; ch++) data[i + ch] = Math.max(0, Math.min(255, Math.round(C[0][ch] + (C[1][ch] - C[0][ch]) * h2 + warm)));
      else { data[i] = Math.min(255, Math.round(g + warm)); data[i + 1] = Math.min(255, Math.round(g + warm * 0.5)); data[i + 2] = Math.min(255, Math.round(g + 3)); }
      data[i + 3] = Math.round(a * 255);
    }
  }
  return sharp(data, { raw: { width: S, height: S, channels: 4 } }).png().toBuffer();
}
async function shellTex() {
  if (CFG.shells.style === 'strokes' || CFG.shells.style === 'stubble') return shellTexStrokes();
  if (CFG.shells.style === 'mrbig') return shellTexMrBig();
  const S = CFG.shells.tex, data = new Uint8Array(S * S * 4), uv = B.get('uv');
  for (let q = 0; q < shell.T.length; q += 3) {
    const vs = [shell.T[q], shell.T[q + 1], shell.T[q + 2]], ws = vs.map((v) => BEARD[v]);
    const U = vs.map((v) => [uv[v * 2] / 65535 * S, (1 - uv[v * 2 + 1] / 65535) * S]), Pv = vs.map((v) => [bPos[v * 3], bPos[v * 3 + 1], bPos[v * 3 + 2]]);
    const d = uvDir(Pv, U, growth(Pv[0]));
    const x0 = Math.floor(Math.min(...U.map((u) => u[0]))) - 1, x1 = Math.ceil(Math.max(...U.map((u) => u[0]))) + 1, y0 = Math.floor(Math.min(...U.map((u) => u[1]))) - 1, y1 = Math.ceil(Math.max(...U.map((u) => u[1]))) + 1;
    const det = (U[1][1] - U[2][1]) * (U[0][0] - U[2][0]) + (U[2][0] - U[1][0]) * (U[0][1] - U[2][1]); if (Math.abs(det) < 1e-9) continue;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const l1 = ((U[1][1] - U[2][1]) * (x - U[2][0]) + (U[2][0] - U[1][0]) * (y - U[2][1])) / det, l2 = ((U[2][1] - U[0][1]) * (x - U[2][0]) + (U[0][0] - U[2][0]) * (y - U[2][1])) / det, l3 = 1 - l1 - l2;
      if (l1 < -0.08 || l2 < -0.08 || l3 < -0.08 || x < 0 || y < 0 || x >= S || y >= S) continue;
      const wv = Math.max(0, Math.min(1, l1 * ws[0] + l2 * ws[1] + l3 * ws[2])), i = (y * S + x) * 4;
      const st = strand(x, y, d, CFG.beard.len || 16, 3), cov = sm(0.05, 0.6, wv);
      const a = cov * sm(0.4, 0.62, st); if (a * 255 <= data[i + 3]) continue;
      const grey = sm(0.8, 0.9, strand(x, y, d, (CFG.beard.len || 16) * 1.3, 7)) > 0.5 && vnoise(x / 40, y / 40, 9) < (CFG.shells.grey ?? 0.1) * 4;
      const c = grey ? CFG.shells.light : CFG.shells.dark, kk = 0.85 + 0.3 * vnoise(x / 2, y / 6, 4);
      data[i] = Math.min(255, Math.round(c[0] * kk)); data[i + 1] = Math.min(255, Math.round(c[1] * kk)); data[i + 2] = Math.min(255, Math.round(c[2] * kk)); data[i + 3] = Math.round(a * 255);
    }
  }
  return sharp(data, { raw: { width: S, height: S, channels: 4 } }).png().toBuffer();
}
// FORGE (from build-man.mjs, the Suits): a shaved head's stubble and a stubble beard, a plain tint by a mask with a
// fine grain (CFG.shaved { a, col }: the scalp above the hairline and down the back to the nape, the ears clear;
// CFG.beard.style 'stubble': the beard's own area)
const SCALP = new Float32Array(nB), CAPC = [0, EY + 0.02, EZ - 0.088];
if (CFG.shaved) for (const v of skinV) { const x = Math.abs(bPos[v * 3]), y = bPos[v * 3 + 1], z = bPos[v * 3 + 2]; if (headW(v) < 0.4) continue;
  let a = sm(EY + 0.03, EY + 0.048, y);
  // (forge v2: under braids or locs, the painted hair starts exactly where the braids' roots do (their hairline), so no
  // smudge of paint shows on the forehead below the first row)
  if (CFG.boxBraids) { const c = Math.cos(Math.atan2(bPos[v * 3], z - (EZ - 0.088))), bandY = c > 0 ? EY + 0.012 + 0.04 * Math.pow(c, 1.5) : EY + 0.012 - 0.082 * Math.pow(-c, 1.3); a = sm(bandY - 0.002, bandY + 0.006, y); }
  a = Math.max(a, sm(EZ - 0.045, EZ - 0.075, z) * sm(EY - 0.075, EY - 0.04, y));
  a = Math.max(a, sm(0.058, 0.07, x) * sm(EY + 0.0, EY + 0.03, y) * sm(EZ - 0.03, EZ - 0.05, z));
  if (x > 0.062 && y < EY + 0.012 && y > EY - 0.06 && z > EZ - 0.115 && z < EZ - 0.055) a *= 0.15;
  // (FORGE v2: a buzz's hairline: the temples receding a little, the edge soft; balding: the crown and the front bare,
  // the horseshoe round the sides and back kept)
  if (CFG.shaved.buzz) a *= 1 - 0.75 * sm(EZ - 0.045, EZ - 0.02, z) * sm(0.035, 0.058, x) * sm(EY + 0.03, EY + 0.06, y);
  if (CFG.shaved.horseshoe) a *= 1 - sm(EY + (CFG.bald?.crown ?? 0.07) - 0.02, EY + (CFG.bald?.crown ?? 0.07) + 0.005, y + 0.25 * Math.max(0, z - (EZ - 0.09))) * (1 - sm(0.05, 0.068, x));
  // (box braids' parts: the scalp in boxes, a thin line of skin between each braid's square (in angle round the head
  // and by height), so the braids sit on hair-coloured squares, never bare scalp, and read rooted)
  if (CFG.shaved.parts) { const dx = bPos[v * 3] - CAPC[0], dy = y - CAPC[1], dz = z - CAPC[2], ph = Math.atan2(dx, dz), th = Math.atan2(dy, Math.hypot(dx, dz)), st = (u, n) => { const f0 = ((u * n) % 1 + 1) % 1; return 1 - sm(0.06, 0.16, Math.min(f0, 1 - f0)); };
    a *= 1 - 0.75 * Math.max(st(ph / (2 * Math.PI), 34), st(th / (Math.PI / 2), 9)); }
  SCALP[v] = Math.min(1, a); }
async function paintMask(img, MASK, a0, col) {
  const S = 2048, { data } = await sharp(img).removeAlpha().raw().toBuffer({ resolveWithObject: true }), uv = B.get('uv');
  const hash = (x, y) => { let h = (x * 374761393 + y * 668265263) >>> 0; h = ((h ^ (h >>> 13)) * 1274126177) >>> 0; return (h & 0xffff) / 65535; };
  const WMAX = new Float32Array(S * S);
  for (let q = 0; q < skinT.length; q += 3) {
    const vs = [skinT[q], skinT[q + 1], skinT[q + 2]], ws = vs.map((v) => MASK[v]); if (ws.every((w) => w <= 0)) continue;
    const U = vs.map((v) => [uv[v * 2] / 65535 * S, (1 - uv[v * 2 + 1] / 65535) * S]);
    const x0 = Math.floor(Math.min(...U.map((u) => u[0]))), x1 = Math.ceil(Math.max(...U.map((u) => u[0]))), y0 = Math.floor(Math.min(...U.map((u) => u[1]))), y1 = Math.ceil(Math.max(...U.map((u) => u[1])));
    const det = (U[1][1] - U[2][1]) * (U[0][0] - U[2][0]) + (U[2][0] - U[1][0]) * (U[0][1] - U[2][1]); if (Math.abs(det) < 1e-9) continue;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const l1 = ((U[1][1] - U[2][1]) * (x - U[2][0]) + (U[2][0] - U[1][0]) * (y - U[2][1])) / det, l2 = ((U[2][1] - U[0][1]) * (x - U[2][0]) + (U[0][0] - U[2][0]) * (y - U[2][1])) / det, l3 = 1 - l1 - l2;
      if (l1 < -0.03 || l2 < -0.03 || l3 < -0.03 || x < 0 || y < 0 || x >= S || y >= S) continue;
      const wv = Math.max(0, Math.min(1, l1 * ws[0] + l2 * ws[1] + l3 * ws[2])); if (wv <= 0) continue;
      const grain = MASK === SCALP && CFG.shaved?.buzz ? 0.55 + 0.45 * hash(x, y) * hash(x + 3, y >> 1) : 0.8 + 0.2 * hash(x, y), w = Math.min(1, wv * 1.3) * a0 * grain, pi = y * S + x; if (w > WMAX[pi]) WMAX[pi] = w; } }
  for (let pi = 0; pi < S * S; pi++) { const w = WMAX[pi]; if (w <= 0) continue; for (let ch = 0; ch < 3; ch++) data[pi * 3 + ch] = Math.round(data[pi * 3 + ch] * (1 - w) + col[ch] * w); }
  return sharp(data, { raw: { width: S, height: S, channels: 3 } }).jpeg({ quality: 92 }).toBuffer();
}
// (forge v2.5, MV: the skin guard (colour.mjs skinGuard), on the finished skin (its brows, scalp and beard painted): the
// median of the texels over the neck, shoulders and upper chest, as the gates' skinTone gate reads it, moved into the
// shipped cast's band when it leans red or grey: one gain per channel on the whole atlas, its lightness kept)
async function guardSkin(img) {
  if (CFG.skinGuard === false) return img;
  const { data: o } = await sharp(img).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  // (C5: over the skin that is seen (skinOut: the library's covers taken out too), as the gate reads it)
  const skinT = skinOut, uv = B.get('uv'); let y0 = 9, y1 = -9; for (const v of skinT) { y0 = Math.min(y0, bPos[v * 3 + 1]); y1 = Math.max(y1, bPos[v * 3 + 1]); }
  const Hs = y1 - y0, ch = [[], [], []];
  for (let q = 0; q < skinT.length; q += 3) { const vs = [skinT[q], skinT[q + 1], skinT[q + 2]], y = (bPos[vs[0] * 3 + 1] + bPos[vs[1] * 3 + 1] + bPos[vs[2] * 3 + 1]) / 3; if (y < y1 - 0.30 * Hs || y > y1 - 0.14 * Hs) continue;
    const u = vs.reduce((a, v) => a + uv[v * 2] / 65535, 0) / 3, w = vs.reduce((a, v) => a + uv[v * 2 + 1] / 65535, 0) / 3, px = Math.min(2047, Math.max(0, Math.floor(u * 2048))), py = Math.min(2047, Math.max(0, Math.floor((1 - w) * 2048))), i = (py * 2048 + px) * 3;
    for (let c = 0; c < 3; c++) ch[c].push(Math.pow(o[i + c] / 255, 2.2)); }
  if (ch[0].length > 50) { const med = ch.map((a) => a.sort((x, y) => x - y)[Math.floor(a.length / 2)]), g = skinGuard(med); console.error('skin tone', ch[0].length, 'samples', JSON.stringify(skinTone(med)));
    if (g) { const lut = [0, 1, 2].map((c) => Uint8Array.from({ length: 256 }, (_, v) => Math.min(255, Math.round(255 * Math.pow(Math.pow(v / 255, 2.2) * g[c], 1 / 2.2)))));
      for (let i = 0; i < o.length; i++) o[i] = lut[i % 3][o[i]];
      console.error('skin guard', skinTone(med).why.join('; '), '-> gains', g.map((x) => x.toFixed(3)).join(','), '->', skinTone(med.map((x, c) => x * g[c])).srgb.join(',')); } }
  return sharp(o, { raw: { width: 2048, height: 2048, channels: 3 } }).jpeg({ quality: 92 }).toBuffer();
}
const paintShaved = async (img) => (CFG.shaved ? paintMask(img, SCALP, CFG.shaved.a ?? 0.25, CFG.shaved.col || [40, 36, 33]) : img);
const paintStubble = async (img) => (CFG.beard?.style === 'stubble' ? paintStubbleTex(img) : img);
// (H5, hair that reads as hair: Jane's hair2 for every card cut (hairline.mjs). Each hair point's distance to the bare
// forehead and temples; the front edge (its last 1.2 cm above the eyes) laid down to 2 mm off the skin (Jane's hug: no
// brim standing off the forehead); the cards' texture rebuilt as strands along the source's own strand direction, the
// cut-out edges broken into strand ends and the hairline thinned to single strands (no stepped edge, no helmet line))
const HAIRTEX = (CFG.hairStrands && !HAIR_BODY && hairTX.length) ? await (async () => {
  const H5 = CFG.hairStrands, hv = [...new Set(hairTX)], NB = B.get('normal');
  const band = [...skinV].filter((v) => headW(v) > 0.5 && bPos[v * 3 + 1] > EY - 0.035 && bPos[v * 3 + 1] < EY + 0.11 && bPos[v * 3 + 2] > EZ - 0.085);
  const { dE, bare } = hairlineDist({ P: bPos, N: NB, V: band }, { P: pPosX, T: hairTX }, hv);
  // (below the eyes a lock beside the cheek is not the hairline: its distance eased away)
  for (const v of hv) { const y = pPosX[v * 3 + 1]; dE[v] += (1 - sm(EY - 0.03, EY - 0.005, y)) * 0.05; }
  // (the hug: the front edge's points to 2 mm off the head's skin, eased in over 1.2 cm from the edge)
  { const head = [...skinV].filter((v) => headW(v) > 0.5 && bPos[v * 3 + 1] > EY - 0.04), cell = 0.01, G = new Map(), key = (x, y, z) => x + ',' + y + ',' + z;
    for (const v of head) { const k = key(...[0, 1, 2].map((c) => Math.floor(bPos[v * 3 + c] / cell))); (G.get(k) || G.set(k, []).get(k)).push(v); }
    let n = 0; for (const v of hv) { const w = (1 - sm(H5.d0 ?? 0.002, (H5.d0 ?? 0.002) + (H5.hugW ?? 0.012), dE[v])) * sm(EY - 0.01, EY + 0.005, pPosX[v * 3 + 1]); if (w <= 0) continue;
      const p = [0, 1, 2].map((c) => pPosX[v * 3 + c]), c0 = p.map((x) => Math.floor(x / cell)); let best = -1, bd = 1;
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) for (const s of G.get(key(c0[0] + i, c0[1] + j, c0[2] + k)) || []) { const d = Math.hypot(bPos[s * 3] - p[0], bPos[s * 3 + 1] - p[1], bPos[s * 3 + 2] - p[2]); if (d < bd) { bd = d; best = s; } }
      if (best < 0 || bd <= (H5.hug ?? 0.002)) continue; const k = 1 - w + w * (H5.hug ?? 0.002) / bd; for (let c = 0; c < 3; c++) pPosX[v * 3 + c] = bPos[best * 3 + c] + (p[c] - bPos[best * 3 + c]) * k; n++; }
    console.error('hair strands (H5): front edge laid down', n, 'points'); }
  const f = A + PKD + '/hair-' + HAIR + '.png', S0 = H5.tex ?? 1024;
  const { data: src } = await sharp(f).ensureAlpha().resize(S0, S0, { kernel: 'lanczos3' }).raw().toBuffer({ resolveWithObject: true });
  // (the distance per texel: each hair triangle drawn in its uvs, the least distance kept)
  const uvH = PKX.get('uv'), dmap = new Float32Array(S0 * S0).fill(NaN);
  for (let q = 0; q < hairTX.length; q += 3) { const vs = [hairTX[q], hairTX[q + 1], hairTX[q + 2]], U = vs.map((v) => [uvH[v * 2] / 65535 * S0, (1 - uvH[v * 2 + 1] / 65535) * S0]), ds = vs.map((v) => dE[v]);
    const det = (U[1][1] - U[2][1]) * (U[0][0] - U[2][0]) + (U[2][0] - U[1][0]) * (U[0][1] - U[2][1]); if (Math.abs(det) < 1e-9) continue;
    for (let y = Math.max(0, Math.floor(Math.min(...U.map((u) => u[1]))) - 1); y <= Math.min(S0 - 1, Math.ceil(Math.max(...U.map((u) => u[1]))) + 1); y++)
      for (let x = Math.max(0, Math.floor(Math.min(...U.map((u) => u[0]))) - 1); x <= Math.min(S0 - 1, Math.ceil(Math.max(...U.map((u) => u[0]))) + 1); x++) {
        const l1 = ((U[1][1] - U[2][1]) * (x + 0.5 - U[2][0]) + (U[2][0] - U[1][0]) * (y + 0.5 - U[2][1])) / det, l2 = ((U[2][1] - U[0][1]) * (x + 0.5 - U[2][0]) + (U[0][0] - U[2][0]) * (y + 0.5 - U[2][1])) / det, l3 = 1 - l1 - l2;
        if (l1 < -0.04 || l2 < -0.04 || l3 < -0.04) continue; const d = l1 * ds[0] + l2 * ds[1] + l3 * ds[2], i = y * S0 + x; if (!(dmap[i] <= d)) dmap[i] = d; } }
  const T = cardHairTex(src, S0, S0, CFG.hairRamp, dmap, { fw: H5.fw, d0: H5.d0, hl: H5.hl, normal: H5.normal, seed: H5.seed });
  console.error('hair strands (H5):', HAIR, S0 + 'px, bare forehead points', bare, 'of', band.length, '; front-edge texels', T.edge);
  return { color: await sharp(T.rgba, { raw: { width: S0, height: S0, channels: 4 } }).png().toBuffer(), normal: await sharp(T.nrm, { raw: { width: S0, height: S0, channels: 3 } }).png().toBuffer() };
})() : null;
const M = {
  beard: shell ? mat('beard', { spec: HAIRSPEC, rough: shell.cards ? 0.8 : 0.72, alpha: shell.cards ? 0.45 : 0.5, ds: !!shell.cards, map: await tex('', await beardTex()) }) : null,
  skin: mat('skin', { rough: CFG.skinRough ?? 0.55, map: await tex('', await guardSkin(await paintBrows(await paintShaved(CFG.beard?.style === 'stubble' ? await paintStubble(await paintMouthIn(await paintFace(skinImg))) : await paintBeard(await paintMouthIn(await paintFace(skinImg)))))), 'image/jpeg') }),
  eyes: mat('eyes', { rough: 0.2, alpha: 0.5, map: await tex('', eyeImg) }),
  brows: mat('brows', { spec: HAIRSPEC, rough: 0.8, alpha: CFG.browAlpha ?? 0.4, ds: true, map: await tex('', await browHeads(await ramp(A + ATH + '/brows.png', CFG.browRamp))) }),
  lashes: mat('lashes', { rough: 0.8, alpha: 0.35, ds: true, map: await tex('', await rd(A + ATH + '/lashes.png')), color: [0.6, 0.58, 0.56] }),
  hair: CFG.hair === 'none' ? null : HAIRTEX ? mat('hair', { spec: HAIRSPEC, rough: Math.max(0.62, CFG.hairRough ?? 0.6), normal: await tex('', HAIRTEX.normal), alpha: CFG.hairAlpha ?? 0.42, ds: true, map: await tex('', HAIRTEX.color) }) : mat('hair', { spec: HAIRSPEC, rough: Math.max(0.6, CFG.hairRough ?? 0.55), normal: CFG.hairNormal ? await tex('', await hairNormal(A + (HAIR_BODY ? ATH + '/hair-' : PKD + '/hair-') + HAIR + '.png', CFG.hairNormal)) : null, alpha: CFG.hairAlpha ?? 0.42, ds: true, map: await tex('', CFG.braids ? await braidTex(A + (HAIR_BODY ? ATH + '/hair-' : PKD + '/hair-') + HAIR + '.png', CFG.braids) : await ramp(A + (HAIR_BODY ? ATH + '/hair-' : PKD + '/hair-') + HAIR + '.png', CFG.hairRamp)) }),
  // (FORGE: a dark shoe's pale lining (the atlas's inside panel) darkened, so no white flash shows at the ankle)
  shoes: CFG.shoes === 'none' ? null : (m => m.setExtras({ layer: 0.5, kind: 'shoes' }))(mat('shoes', { rough: 0.35, map: await tex('', CFG.shoes === 'shoes05' ? await rd(A + PKD + '/' + CFG.shoes + '.jpg') : await (async () => { const { data, info } = await sharp(A + PKD + '/' + CFG.shoes + '.jpg').removeAlpha().raw().toBuffer({ resolveWithObject: true });
    // (forge v2: a soft mask, not a hard cut: the hard one left the lining's edge as jagged dark marks (Rosa, v1))
    for (let i = 0; i < data.length; i += 3) { const r = data[i], g = data[i + 1], b = data[i + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b), w = sm(100, 150, mx) * (1 - sm(28, 52, mx - mn)); if (w > 0) { const k = 1 - 0.7 * w; data[i] = r * k; data[i + 1] = g * k; data[i + 2] = b * k; } }
    return sharp(data, { raw: info }).jpeg({ quality: 90 }).toBuffer(); })(), 'image/jpeg'), color: CFG.shoesTint })),
  teethUp: TEETH ? mat('teethUp', { rough: 0.52, alpha: 0.5, ds: true, map: await tex('', await sharp(TEETH.img, { raw: { width: TEETH.TW, height: TEETH.TH, channels: 4 } }).png().toBuffer()) }) : null,
};
// (G7a: the mouth's inside rough (a small roughness map on the skin, its own roughness everywhere else): its normals face
// out of the mouth, toward where a camera and the lights in front are, so a lamp low in front mirrored off the wet
// inside as a light brown wall (young mother, nurse: the other 3/4); face.js's shadeMouth carries roughnessMap over)
if (CFG.mouthIn !== false && CFG.mouth) M.skin.setRoughnessFactor(1).setMetallicRoughnessTexture(await tex('', await mouthRough(CFG.skinRough ?? 0.55)));
// (C5: a pack garment's cloth surface: its own baked texture's fine detail (the weave, seams and folds the garment was
// painted with, high-passed at 7 px) as a relief, with a weave across its uv space: denim's twill, a knit's jersey
// wales, a suit's fine twill, as a normal map; rougher, and a dielectric's specular turned down: no plastic sheen)
async function packCloth(buf, kind) {
  // (luminance from the colour, here: the browser's sharp stand-in (sharp-web.mjs) has no greyscale)
  const { data, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true }), W = info.width, H = info.height, ch = info.channels;
  const bl = await sharp(buf).removeAlpha().blur(7).raw().toBuffer(), Y = (a, i) => (ch >= 3 ? 0.3 * a[i * ch] + 0.59 * a[i * ch + 1] + 0.11 * a[i * ch + 2] : a[i * ch]), h = new Uint8Array(W * H * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x, b = Y(bl, i), hp = (Y(data, i) - b) / Math.max(24, b) * 90;
    const wv = kind === 'denim' ? 14 * ((((x + y) % 4) < 2) ? 1 : -1) : kind === 'suit' ? 8 * ((((x + y * 2) % 3) === 0) ? 1 : -1) : 9 * (x % 3 === 0 ? 1 : -0.5);
    const v = Math.max(0, Math.min(255, Math.round(128 + Math.max(-60, Math.min(60, hp)) + wv))); h[i * 3] = h[i * 3 + 1] = h[i * 3 + 2] = v; }
  return sharp(bumpNormals(h, W, 1.6), { raw: { width: W, height: H, channels: 3 } }).png().toBuffer();
}
const wearM = [];
for (const [wi, [name, part, tint0, mode, opt0]] of CFG.wear.entries()) {
  const opt = Object.assign({ tint: tint0 }, opt0 || {}), tint = mode === 'bake' ? [1, 1, 1] : tint0;
  const O = PK.J.outfits[name], img = await garment(name, mode, opt, wearT[wi]);
  // (a plain cloth has no print, so none of the print's relief either: the normal map only with the garment's own texture)
  const own = O.normal && !['flat', 'bake', 'puffer'].includes(mode), kind = mode === 'suit' ? 'suit' : opt0?.desat ? 'denim' : 'jersey';
  const C5 = !globalThis.process?.env?.C5_NOFABRIC && mode !== 'puffer' && !own;
  wearM.push(((m) => m.setExtras({ layer: CFG.wear[wi][1] === 'bottom' ? 1 : mode === 'puffer' ? 3 : 2, kind: 'cloth', garment: name }))(mat(mode === 'puffer' ? 'puffer' : 'clothes', { rough: mode === 'puffer' ? 0.5 : C5 ? 0.92 : 0.85, ds: true, spec: C5 ? CLOTHSPEC : null, map: await tex('', img, 'image/jpeg'), normal: own ? await tex('', await rd(A + PKD + '/' + O.normal), 'image/jpeg') : C5 ? await tex('', await packCloth(img, kind)) : null, color: tint })));
}

/* --------------------------------------------------------------- meshes -- */
function skinAttrs(src, order) {
  const si = src.get('skinIndex'), sw = src.get('skinWeight'), n = order.length;
  const J = new Uint16Array(n * 4), Wt = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const v = order[i]; const e = [0, 1, 2, 3].map((k) => [jmap[si[v * 4 + k]], sw[v * 4 + k] / 255]).sort((a, b) => b[1] - a[1]);
    const s = e.reduce((a, x) => a + Math.max(0, x[1]), 0) || 1;
    e.forEach(([j, w], k) => { J[i * 4 + k] = w > 0 ? j : 0; Wt[i * 4 + k] = Math.max(0, w) / s; });
  }
  return { J, Wt };
}
function build(name, src, P, lists, mats, keepN, color = null) {
  const { order, out } = compact(lists, src.n ?? (src === B ? nB : nP));
  const N = normals(P, out, order, keepN, src.get('normal')), uv = src.get('uv');
  const pos = new Float32Array(order.length * 3), UV = new Float32Array(order.length * 2);
  order.forEach((v, i) => { pos.set([P[v * 3], P[v * 3 + 1], P[v * 3 + 2]], i * 3); UV[i * 2] = uv[v * 2] / 65535; UV[i * 2 + 1] = 1 - uv[v * 2 + 1] / 65535; });
  const { J, Wt } = skinAttrs(src, order);
  const acc = (type, arr) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buf);
  const aP = acc('VEC3', pos), aN = acc('VEC3', N), aUV = acc('VEC2', UV), aJ = acc('VEC4', J), aW = acc('VEC4', Wt);
  // (the beard's shells: a colour per point (its layer's shade and thinning), on their primitive alone)
  const aC = color ? acc('VEC4', Float32Array.from(order.flatMap((v) => color(v)))) : null;
  const mesh = doc.createMesh('');
  // (lists with the same material one primitive (the beard's shells and cards: face.js moves one 'beard' with the jaw))
  const prim = []; out.forEach((L, i) => { if (!L.length) return; const last = prim[prim.length - 1]; if (last && last[1] === mats[i]) last[0] = [...last[0], ...L]; else prim.push([L, mats[i]]); });
  prim.forEach(([L0, m0]) => { const L = order.length > 65535 ? Uint32Array.from(L0) : L0, i = mats.indexOf(m0); const p = doc.createPrimitive().setAttribute('POSITION', aP).setAttribute('NORMAL', aN).setAttribute('TEXCOORD_0', aUV).setAttribute('JOINTS_0', aJ).setAttribute('WEIGHTS_0', aW)
    .setIndices(acc('SCALAR', order.length > 65535 ? L : Uint16Array.from(L))).setMaterial(mats[i]); if (aC && mats[i] === M.beard) p.setAttribute('COLOR_0', aC); mesh.addPrimitive(p); });
  const node = doc.createNode(name).setMesh(mesh).setSkin(skin0);
  armature.addChild(node);
  return { node, order, pos, count: order.length };
}
if (TEETH) M.teethLow = mat('teethLow', { rough: 0.52, alpha: 0.5, ds: true, map: M.teethUp.getBaseColorTexture() });
// (G7a: the tongue's highlight down to 6 % (KHR_materials_specular's texture, its alpha by the teeth texture's rows:
// the teeth 1, the tongue's band 0.06): turned out of the mouth it faced the room's light, and its F0 0.04 mirror of the
// environment read as a grey slab over the dark red)
if (TEETH && CFG.mouthIn !== false) { const SW = 4, SHh = 64, sp = new Uint8Array(SW * SHh * 4);
  for (let j = 0; j < SHh; j++) for (let i = 0; i < SW; i++) { const o = (j * SW + i) * 4, tongue = (j + 0.5) / SHh >= 416 / TEETH.TH; sp[o] = sp[o + 1] = sp[o + 2] = 255; sp[o + 3] = tongue ? 15 : 255; }
  M.teethLow.setExtension('KHR_materials_specular', SPECX.createSpecular().setSpecularFactor(1).setSpecularColorFactor([1, 1, 1])
    .setSpecularTexture(await tex('', await sharp(sp, { raw: { width: SW, height: SHh, channels: 4 } }).png().toBuffer()))); }
const SH = [...(shell ? [shell.triS, shell.triC] : []), ...(TEETH ? [TEETH.up.map((i) => BT.n0 + i), TEETH.lo.map((i) => BT.n0 + i)] : [])];
const SHM = [...(shell ? [M.beard, M.beard] : []), ...(TEETH ? [M.teethUp, M.teethLow] : [])], SHK = [...(shell ? [false, true] : []), ...(TEETH ? [true, true] : [])];
const NSH = shell ? nB + shell.n : nB;
const shellColor = shell ? (v) => { if (v < nB || v >= NSH) return [1, 1, 1, 1]; if (shell.isCard(v)) { const k = shell.cards.shade[v - nB - shell.nSh]; return [k, k, k, 1]; } const L = shell.layerOf(v), k = CFG.shells.shade[L]; return [k, k, k, CFG.shells.alpha[L]]; } : null;
const BSRC = TEETH ? BT : BX, BPOS = TEETH ? bPosT : bPosX;
// (NK: a pack top worn as the outer layer (a tee, a long-sleeve): its neckline's jagged cut evened into one line and
// bound with a rolled band (necklines.mjs), emitted with the made garments below)
const NKBIND = [];
{ const OVER = /^(chef-jacket|doorman-coat|uniform-jacket|hoodie|overcoat|puffer-coat|suit-jacket(-db)?|hood-up|scarf)$/;
  const over = (LIB && LIB.done.some((d) => OVER.test(d.g.item))) || CFG.puffer || CFG.suit || CFG.overalls;
  if (!over) CFG.wear.forEach(([name, part, , mode, opt], wi) => { if (part !== 'top' || mode !== 'bake' || !wearT[wi].length) return;
    // (a coarse top's neckline split finer first, so the evened edge follows the curve instead of cutting chords into the neck)
    const sp = splitNeckline(pPosX, wearT[wi], { uv: PKX.get('uv'), normal: PKX.get('normal'), skinIndex: PKX.get('skinIndex'), skinWeight: PKX.get('skinWeight') }, NECKY, SKL('neck01')[2]);
    if (sp.added) { const base = PKX, A2 = sp.A; PKX = { n: sp.P.length / 3, J: base.J, get: (k) => A2[k] || base.get(k) }; pPosX = sp.P; console.error('neckline (NK):', name, sp.added, 'edge points added'); }
    const b = necklineBinding(pPosX, wearT[wi], PKX.get('skinIndex'), PKX.get('skinWeight'), NECKY, SKL('neck01')[2]); if (!b) return;
    // (the skin under it round the neck hidden (4 mm under the bound edge to 13 cm, and under the binding itself, the neck and shoulders, not the arms):
    // near its edge the pack's hide lists keep skin, and that skin came through the cloth as pale flecks in a pose)
    { const nz = SKL('neck01')[2], under = (v) => { const x = bPos[v * 3], y = bPos[v * 3 + 1], z = bPos[v * 3 + 2] - nz, a = Math.atan2(x, z); const r = Math.hypot(x, z); return (y < b.line.y(a) - 0.004 || (y < b.line.y(a) + 0.002 && r > b.line.r(a) - 0.004)) && y > NECKY - 0.13 && r < 0.13 && headW(v) < 0.5; };
      const keep = []; let cut = 0; for (let q = 0; q < skinOut.length; q += 3) { if (under(skinOut[q]) && under(skinOut[q + 1]) && under(skinOut[q + 2])) { cut++; continue; } keep.push(skinOut[q], skinOut[q + 1], skinOut[q + 2]); }
      skinOut.splice(0, skinOut.length, ...keep); console.error('neckline (NK): skin triangles hidden under the neckline', cut); }
    NKBIND.push({ name, b, wi }); console.error('neckline (NK):', name, b.edge, 'edge points,', b.moved, 'evened (at most', b.maxMm, 'mm), bound'); }); }
const body = HAIR_BODY ? build('', BSRC, BPOS, [skinOut, eyesT, browT, lashT, hairT, ...SH], [M.skin, M.eyes, M.brows, M.lashes, M.hair, ...SHM], [false, true, true, true, true, ...SHK], shellColor)
  : build('', BSRC, BPOS, [skinOut, eyesT, browT, lashT, ...SH], [M.skin, M.eyes, M.brows, M.lashes, ...SHM], [false, true, true, true, ...SHK], shellColor);
// (G7a: the mouth's inside facing out through the opening: the skin's points in it, the body's shared NORMAL)
console.error('mouth inside normals', mouthNormals(body.node.getMesh().listPrimitives()[0].getAttribute('NORMAL'), body.order));
const pack = build('pack', PKX, pPosX, HAIR_BODY ? [...wearT, shoeT] : [hairTX, ...wearT, shoeT], HAIR_BODY ? [...wearM, M.shoes] : [M.hair, ...wearM, M.shoes], HAIR_BODY ? [...wearT.map(() => false), false] : [true, ...wearT.map(() => false), false]);

/* ----------------------------------------------------- FORGE: made garments -- */
// an extra skinned mesh: points in the bind space, uvs, B-skeleton joint indices + weights (4 per point), triangles;
// on the cast's skin like the body
const accX = (type, arr) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buf);
function addSkinned(name, P, UV, JI, WT, idx, material, color = null, NIN = null) {
  const n = P.length / 3, J = new Uint16Array(n * 4), Wt = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) { const e = [0, 1, 2, 3].map((k) => [JI[i * 4 + k], WT[i * 4 + k]]).sort((a, b) => b[1] - a[1]), sm0 = e.reduce((a, x) => a + Math.max(0, x[1]), 0) || 1;
    e.forEach(([j, w], k) => { J[i * 4 + k] = w > 0 ? jmap[j] : 0; Wt[i * 4 + k] = Math.max(0, w) / sm0; }); }
  const N = new Float32Array(n * 3);
  for (let q = 0; q < idx.length; q += 3) { const [a, b, c] = [idx[q], idx[q + 1], idx[q + 2]], ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2], vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1], vz = P[c * 3 + 2] - P[a * 3 + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; for (const k of [a, b, c]) { N[k * 3] += nx; N[k * 3 + 1] += ny; N[k * 3 + 2] += nz; } }
  for (let k = 0; k < n; k++) { const l = Math.hypot(N[k * 3], N[k * 3 + 1], N[k * 3 + 2]) || 1; N[k * 3] /= l; N[k * 3 + 1] /= l; N[k * 3 + 2] /= l; }
  if (NIN) N.set(NIN);
  // (F6: a coloured strand mesh (braids, curls, locs, twists) keeps its uvs and weights 16 bit normalized, not float)
  const q16 = (arr) => Uint16Array.from(arr, (x) => Math.round(Math.min(1, Math.max(0, x)) * 65535)), small = !!color && UV.every((x) => x >= 0 && x <= 1);
  const prim = doc.createPrimitive().setAttribute('POSITION', accX('VEC3', Float32Array.from(P))).setAttribute('NORMAL', accX('VEC3', N)).setAttribute('TEXCOORD_0', small ? accX('VEC2', q16(UV)).setNormalized(true) : accX('VEC2', Float32Array.from(UV)))
    .setAttribute('JOINTS_0', accX('VEC4', J)).setAttribute('WEIGHTS_0', small ? accX('VEC4', q16(Wt)).setNormalized(true) : accX('VEC4', Wt)).setIndices(accX('SCALAR', n > 65535 ? Uint32Array.from(idx) : Uint16Array.from(idx))).setMaterial(material);
  // (F6: the colours 16 bit normalized, not float: the curls' 57k points' colours were a fifth of the nurse's GLB)
  if (color) prim.setAttribute('COLOR_0', accX('VEC4', q16(color)).setNormalized(true));
  const node = doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(prim)).setSkin(skin0); armature.addChild(node);
  return node;
}
// nearest point of a set (a 3 cm grid), for borrowing a garment's skin weights
function nearestOf(P, verts) {
  const G = new Map(), cell = 0.03, key = (x, y, z) => Math.floor(x / cell) + ',' + Math.floor(y / cell) + ',' + Math.floor(z / cell);
  for (const v of verts) { const k = key(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]); (G.get(k) || G.set(k, []).get(k)).push(v); }
  return (p) => { let best = -1, bd = 1e9; const cx = Math.floor(p[0] / cell), cy = Math.floor(p[1] / cell), cz = Math.floor(p[2] / cell);
    for (let r = 1; r <= 4 && best < 0; r++) for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) for (let k = -r; k <= r; k++) { const L = G.get((cx + i) + ',' + (cy + j) + ',' + (cz + k)); if (!L) continue;
      for (const v of L) { const d = (P[v * 3] - p[0]) ** 2 + (P[v * 3 + 1] - p[1]) ** 2 + (P[v * 3 + 2] - p[2]) ** 2; if (d < bd) { bd = d; best = v; } } }
    return best; };
}
const BI = (n) => SKEL.findIndex((b) => b.name === n);
// the apron: a panel hung from the waist's front (CFG.apron { len, width, gap, check { a, b, size }, color, ties }):
// each row's depth the front of whatever is under it (the trousers, the jacket's hem, the body) as a taut cloth
// bridges it (a rolling envelope across the row), so it hangs straight between the legs; its weights the nearest
// garment point's, eased toward the pelvis (it swings with the hips, not glued to one thigh)
if (CFG.apron) {
  const Ap = CFG.apron, top = WAIST + (Ap.top ?? 0.03), len = Ap.len ?? 0.55, half = (Ap.width ?? 0.44) / 2, gap = Ap.gap ?? 0.012, NX = 36, NY = 40;
  const under = []; for (const T of wearT) for (const v of new Set(T)) under.push(v);
  const near = nearestOf(pPos, under), cellZ = new Float32Array((NX + 1) * (NY + 1)).fill(-9);
  const xs = (i) => -half + (2 * half * i) / NX, ys = (j) => top - (len * j) / NY;
  // (forge v2: the library's garments under it count too: the chef's jacket's front and hem)
  const libPts = []; if (LIB) for (const { r } of LIB.done) for (const p of r.parts) for (let i = 0; i < p.mesh.P.length; i += 3) libPts.push([p.mesh.P[i], p.mesh.P[i + 1], p.mesh.P[i + 2]]);
  for (const q of [...under.map((v) => [pPos[v * 3], pPos[v * 3 + 1], pPos[v * 3 + 2]]), ...libPts]) { const [x, y, z] = q; if (z < 0.0 || y > top + 0.03 || y < top - len - 0.03) continue;
    const i = Math.round(((x + half) / (2 * half)) * NX), j = Math.round(((top - y) / len) * NY); for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) { const ii = i + di, jj = j + dj; if (ii < 0 || ii > NX || jj < 0 || jj > NY) continue; const k = jj * (NX + 1) + ii; cellZ[k] = Math.max(cellZ[k], z); } }
  // (rolling envelope across each row, then down the rows: a cloth hangs, it doesn't tuck in under the hips)
  const Z = new Float32Array(cellZ.length);
  for (let j = 0; j <= NY; j++) for (let i = 0; i <= NX; i++) { let m = -9; for (let k = 0; k <= NX; k++) { const z = cellZ[j * (NX + 1) + k]; if (z > -9) m = Math.max(m, z - (Ap.curve ?? 5) * (xs(i) - xs(k)) ** 2); } Z[j * (NX + 1) + i] = m; }
  for (let j = 1; j <= NY; j++) for (let i = 0; i <= NX; i++) { const k = j * (NX + 1) + i, up = Z[(j - 1) * (NX + 1) + i]; Z[k] = Math.max(Z[k], up - 0.08 * (len / NY)); }
  const P = [], UV = [], JI = [], WT = [], idx = [], pelvis = BI('root'), si4 = PK.get('skinIndex'), sw4 = PK.get('skinWeight');
  for (let j = 0; j <= NY; j++) for (let i = 0; i <= NX; i++) { const x = xs(i), y = ys(j), z = Z[j * (NX + 1) + i] + gap * (1 + 0.6 * j / NY) + 0.006 * Math.cos((x / half) * Math.PI / 2) * 0;
    // (the sides curve back round the hips at the top)
    const wrap = sm(half * 0.6, half, Math.abs(x)) * (1 - j / NY) * 0.03;
    P.push(x, y, z - wrap); UV.push(i / NX, j / NY);
    const v = near([x, y, z]), e = v < 0 ? [[pelvis, 1], [0, 0], [0, 0], [0, 0]] : [0, 1, 2, 3].map((k) => [si4[v * 4 + k], sw4[v * 4 + k] / 255]), t = 0.55 * (1 - j / NY) + 0.25;
    const m = new Map(); for (const [jj, w] of e) m.set(jj, (m.get(jj) || 0) + w * (1 - t)); m.set(pelvis, (m.get(pelvis) || 0) + t);
    const top4 = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4); while (top4.length < 4) top4.push([0, 0]); for (const [jj, w] of top4) { JI.push(jj); WT.push(w); } }
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) { const a = j * (NX + 1) + i, b = a + 1, c = a + NX + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
  // (its cloth: a check (or plain), a hemmed edge, the waistband's ties, a little weave)
  const S = 512, img = new Uint8Array(S * S * 3), C = Ap.check, base = Ap.color || [236, 236, 232];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const X = (x / S) * 2 * half, Y = (y / S) * len, i = (y * S + x) * 3; let c = base;
    if (C) { const k = Math.floor(X / C.size) + Math.floor(Y / C.size), kx = Math.floor(X / C.size) % 2, ky = Math.floor(Y / C.size) % 2; c = kx && ky ? C.a : !kx && !ky ? C.b : C.a.map((v, q) => (v + C.b[q]) / 2); }
    const edge = Math.min(x, S - 1 - x, S - 1 - y) < 7 ? 0.82 : 1, band = y < 22 ? (Ap.band ? 1 : 0.9) : 1, weave = 0.94 + 0.06 * ((x + y) % 3 === 0 ? 1 : 0.5);
    const col = y < 22 && Ap.band ? Ap.band : c; for (let q = 0; q < 3; q++) img[i + q] = Math.min(255, Math.round(col[q] * edge * band * weave)); }
  const apM = mat('apron', { rough: 0.9, ds: true, map: await tex('', await sharp(img, { raw: { width: S, height: S, channels: 3 } }).jpeg({ quality: 90 }).toBuffer(), 'image/jpeg') });
  addSkinned('apron', P, UV, JI, WT, idx, apM);
  apM.setExtras({ layer: 6, kind: 'cloth', garment: 'apron' });
  // FORGE v2: the apron's ties: a band round the waist from the panel's top corners to the back, over whatever is worn
  // (its outline round the body at that height, 5 mm out), and a bow at the small of the back, two loops and two tails
  // hanging; on the pelvis (the tails eased to the hips). Coloured as the apron's band, or its cloth
  if (Ap.ties) {
    const ty = top - 0.008, NA = 72, rr = new Float32Array(NA), cz = 0.0, srcs = [[bPos, skinV], [pPos, new Set(under)]];
    for (const [Pp, set] of srcs) for (const v of set) { const y = Pp[v * 3 + 1]; if (Math.abs(y - ty) > 0.012) continue; const x = Pp[v * 3], z = Pp[v * 3 + 2] - cz, a = Math.atan2(x, z), r = Math.hypot(x, z); if (r > 0.3) continue; const b = ((Math.floor(((a + Math.PI) / (2 * Math.PI)) * NA) % NA) + NA) % NA; rr[b] = Math.max(rr[b], r); }
    for (let it = 0; it < 3; it++) { const c = Float32Array.from(rr); for (let i = 0; i < NA; i++) rr[i] = Math.max(c[i], (c[(i + NA - 1) % NA] + c[(i + 1) % NA]) / 2); }
    const T2 = [], U2 = [], J2 = [], W2 = [], I2 = [], pel = BI('root'), sp1 = BI('spine05') >= 0 ? BI('spine05') : pel, legs = [BI('upperleg01.L'), BI('upperleg01.R')], H = 0.02;
    const vtx = (p, uvv, j, w) => { T2.push(...p); U2.push(...uvv); J2.push(...j); W2.push(...w); return T2.length / 3 - 1; };
    // (the band)
    const ring = []; for (let i = 0; i <= NA; i++) { const a = -Math.PI + (2 * Math.PI * i) / NA, r = (rr[i % NA] || 0.15) + 0.005, p = [Math.sin(a) * r, ty, cz + Math.cos(a) * r];
      ring.push([vtx([p[0], ty - H / 2, p[2]], [0.02, 0.02], [pel, sp1, 0, 0], [0.7, 0.3, 0, 0]), vtx([p[0], ty + H / 2, p[2]], [0.02, 0.02], [pel, sp1, 0, 0], [0.7, 0.3, 0, 0])]); }
    for (let i = 0; i < NA; i++) { const [a, b] = ring[i], [c, d] = ring[i + 1]; I2.push(a, c, b, b, c, d); }
    // (the bow: at the back's middle, two flattened loops out to either side and two tails falling 22 cm, a little apart)
    const back = (rr[0] || 0.14) + 0.009, bc = [0, ty, cz - back];
    for (const sx of [-1, 1]) { const base = T2.length / 3, NL = 18; for (let i = 0; i <= NL; i++) { const t = (i / NL) * 2 * Math.PI, x = sx * (0.012 + 0.035 * (1 - Math.cos(t)) / 2), y = ty + 0.016 * Math.sin(t), z = bc[2] - 0.006 - 0.004 * (1 - Math.cos(t)) / 2;
        vtx([x, y - H * 0.45, z], [0.02, 0.02], [pel, 0, 0, 0], [1, 0, 0, 0]); vtx([x, y + H * 0.45, z], [0.02, 0.02], [pel, 0, 0, 0], [1, 0, 0, 0]); }
      for (let i = 0; i < NL; i++) { const a = base + i * 2; I2.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      const tb = T2.length / 3, NT2 = 12, L2 = 0.22; for (let i = 0; i <= NT2; i++) { const t = i / NT2, x = sx * (0.008 + 0.03 * t), y = ty - 0.004 - L2 * t, z = bc[2] - 0.004 - 0.012 * t, e = t * 0.35;
        const j = [pel, legs[sx > 0 ? 0 : 1], 0, 0], w = [1 - e, e, 0, 0]; vtx([x - 0.011, y, z], [0.02, 0.02], j, w); vtx([x + 0.011, y, z], [0.02, 0.02], j, w); }
      for (let i = 0; i < NT2; i++) { const a = tb + i * 2; I2.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); } }
    { const k0 = T2.length / 3; for (let i = 0; i < 10; i++) { const a = (i / 10) * 2 * Math.PI; vtx([bc[0] + 0.009 * Math.cos(a), bc[1] + 0.011 * Math.sin(a), bc[2] - 0.009], [0.02, 0.02], [pel, 0, 0, 0], [1, 0, 0, 0]); } const kc = vtx([bc[0], bc[1], bc[2] - 0.012], [0.02, 0.02], [pel, 0, 0, 0], [1, 0, 0, 0]); for (let i = 0; i < 10; i++) I2.push(k0 + i, kc, k0 + ((i + 1) % 10)); }
    const tc = (Ap.band || Ap.color || [236, 236, 232]).map((c) => Math.pow(c / 255, 2.2)), tM = mat('apron-ties', { rough: 0.9, ds: true, color: tc }).setExtras({ layer: 6.5, kind: 'cloth', garment: 'apron' });
    addSkinned('apron-ties', T2, U2, J2, W2, I2, tM);
    console.error('apron ties', T2.length / 3, 'points; waist r back', (rr[0] * 100).toFixed(1), 'cm');
  }
  console.error('apron', P.length / 3, 'points; depth at middle', Z[(NY >> 1) * (NX + 1) + (NX >> 1)].toFixed(3));
}
// the hood, down (CFG.hood { color, r, drop, strings }): a soft roll of cloth lying round the back of the neck on the
// shoulders, thickest at the back where it folds, its ends tucking into the neckline at the front; the drawstrings
// hanging from the neckline. On the upper spine and the clavicles.
// (NK: over the library's hoodie, the hood is one rolled band lying on its shoulders and the cords lie on its chest,
// both skinned as the cloth under them (necklines.mjs); the roll below is for a hood over a pack top)
for (const { name, b, wi } of NKBIND) { const m = b.mesh, N = weldNormals(m.P, m.idx);
  // (the binding's colour: the top's own baked texture, its mean round the neckline's edge points, so it is the same cloth)
  const col = await (async () => { const [, , t0, md, o0] = CFG.wear[wi], { data, info } = await sharp(await garment(name, md, Object.assign({ tint: t0 }, o0 || {}), wearT[wi])).removeAlpha().raw().toBuffer({ resolveWithObject: true }), uv0 = PKX.get('uv'), acc = [0, 0, 0]; let n = 0;
    for (const v of b.line.verts) { const x = Math.min(info.width - 1, Math.floor((uv0[v * 2] / 65535) * info.width)), y = Math.min(info.height - 1, Math.floor((1 - uv0[v * 2 + 1] / 65535) * info.height)), q = (y * info.width + x) * 3; for (let k = 0; k < 3; k++) acc[k] += data[q + k]; n++; }
    return n ? acc.map((c) => Math.round(c / n)) : [150, 150, 150]; })();
  const img = rasterPaint({ ...m, N }, 256, col, (p, n, f, c, ao, uv) => { const k = 0.97 * (0.88 + 0.12 * Math.pow(Math.abs(Math.sin(uv[0] * 260)), 0.7)); return col.map((x) => Math.min(255, Math.round(255 * Math.pow(Math.pow(x / 255, 2.2) * k, 1 / 2.2)))); });
  const bM = mat('neckline', { rough: 0.88, ds: true, map: await tex('', await sharp(img, { raw: { width: 256, height: 256, channels: 3 } }).jpeg({ quality: 90 }).toBuffer(), 'image/jpeg') });
  addSkinned('neckline', m.P, m.UV, m.JI, m.WT, m.idx, bM, null, N); bM.setExtras({ layer: 2.2, kind: 'cloth', garment: name }); }
const HOODIE = CFG.hood && LIB ? LIB.done.find((d) => d.g.item === 'hoodie') : null;
if (HOODIE) {
  const Hd = CFG.hood, sh = HOODIE.r.shell, col = HOODIE.g.color ? [1, 3, 5].map((i) => Math.round(parseInt(HOODIE.g.color.slice(i, i + 2), 16) * 0.96)) : Hd.color || [60, 60, 66], sc = Hd.stringColor || [230, 230, 226];
  const roll = hoodDown(LIB.ctx, { sh, band: 0.007, secShare: 0.7 }), N = weldNormals(roll.P, roll.idx);
  const img = rasterPaint({ ...roll, N }, 512, col, (p, n, f, c, ao, uv) => { const v = uv[1], k = (0.95 + 0.05 * vnoise(p[0] / 0.006, p[1] / 0.006, p[2] / 0.006)) * (v < 0.3 ? 0.95 : 1)
    // (the fold along the top (the hood's face edge, turned over: a darker crease and its hem's stitch) and soft folds across;
    // all within 7% of the hoodie's own colour, so a muted hoodie's hood keeps its family under a warm light)
    * (Math.abs(v - 0.62) < 0.03 ? 0.93 : 1) * (Math.abs(v - 0.7) < 0.006 ? 0.94 : 1) * (0.97 + 0.03 * Math.sin(uv[0] * 40 + v * 6)); return col.map((x) => Math.min(255, Math.round(x * k))); });
  // (C5: the hoodie's points under the front ends of the hood's band move with the band (library.mjs wrapWeights): one of
  // them came 6 mm out through the band's front end when she waved (at the back the hoodie keeps its own, so it still
  // hides the band's inside there); and the band's fleece as a normal map, as the hoodie's)
  console.error('hood (C5): hoodie points wrapped to the hood', wrapWeights(sh, [roll], { depth: 0.03, reach: 0.035, out: 0.004, only: (v) => sh.P[v * 3 + 2] > SKL('neck01')[2] + 0.02 }));
  const hNrm = globalThis.process?.env?.C5_NOFABRIC ? null : await tex('', await sharp(bumpNormals(rasterPaint({ ...roll, N }, 512, [128, 128, 128], fabricBump(LIB.ctx, 'fleece', 'hood-collar')), 512, 2.2), { raw: { width: 512, height: 512, channels: 3 } }).png().toBuffer());
  const hM = mat('hood', { rough: 0.95, ds: true, normal: hNrm, spec: hNrm ? CLOTHSPEC : null, map: await tex('', await sharp(img, { raw: { width: 512, height: 512, channels: 3 } }).jpeg({ quality: 90 }).toBuffer(), 'image/jpeg') });
  addSkinned('hood', roll.P, roll.UV, roll.JI, roll.WT, roll.idx, hM, null, N); hM.setExtras({ layer: 6, kind: 'cloth', garment: 'hood' });
  if (Hd.strings !== false) { const cords = drawcords(LIB.ctx, { sh, len: Hd.strings?.len ?? 0.19, x: 0.031 }), N2 = weldNormals(cords.P, cords.idx);
    const img2 = rasterPaint({ ...cords, N: N2 }, 128, sc, (p, n, f, c, ao, uv) => { const k = uv[1] > 0.88 ? 0.55 : 0.93 + 0.07 * Math.sin(uv[0] * 60 + uv[1] * 220); return sc.map((x) => Math.min(255, Math.round(x * k))); });
    const cM = mat('hood-cords', { rough: 0.8, map: await tex('', await sharp(img2, { raw: { width: 128, height: 128, channels: 3 } }).jpeg({ quality: 90 }).toBuffer(), 'image/jpeg') });
    addSkinned('hood-cords', cords.P, cords.UV, cords.JI, cords.WT, cords.idx, cM, null, N2); cM.setExtras({ layer: 6.5, kind: 'cord', garment: 'hood' }); }
  console.error('hood (NK)', roll.P.length / 3, 'points, cords', Hd.strings !== false);
} else if (CFG.hood) {
  const Hd = CFG.hood, neckY = NECKY, n1 = SKL('neck01'), c0 = [0, neckY - 0.035, n1[2] - 0.01];
  const neckR = (() => { let r = 0, n = 0; for (const v of skinV) { const y = bPos[v * 3 + 1]; if (Math.abs(y - (neckY - 0.01)) > 0.006) continue; r += Math.hypot(bPos[v * 3] - c0[0], bPos[v * 3 + 2] - c0[2]); n++; } return n ? r / n : 0.06; })();
  const NA = 48, NB0 = 16, P = [], UV = [], JI = [], WT = [], idx = [], sp = BI('spine01') >= 0 ? BI('spine01') : 0, nk = BI('neck01'), cl = [BI('clavicle.L'), BI('clavicle.R')];
  const R = Hd.r ?? 0.034, A0 = Hd.span ?? 2.3;
  for (let i = 0; i <= NA; i++) { const a = -A0 + (2 * A0 * i) / NA, back = Math.cos(a / A0 * Math.PI / 2), rr = R * (0.55 + 0.45 * back);
    const ax = Math.sin(a + Math.PI), az = Math.cos(a + Math.PI); // a = 0: straight behind
    const ex = Hd.extra ?? 0, ctr = [c0[0] + ax * (neckR + rr * 0.9 + 0.012 + ex), c0[1] - (Hd.drop ?? 0.03) * back * back + 0.01 * (1 - back), c0[2] + az * (neckR + rr * 0.9 + 0.012 + ex)];
    for (let k = 0; k <= NB0; k++) { const t = (k / NB0) * 2 * Math.PI, out = [ax, 0, az];
      const p = [ctr[0] + out[0] * Math.cos(t) * rr * 1.1, ctr[1] + Math.sin(t) * rr * 0.75, ctr[2] + out[2] * Math.cos(t) * rr * 1.1];
      P.push(...p); UV.push(i / NA, k / NB0);
      // (forge v2: over a library garment, the nearest body point's weights: the roll moves with the shoulders under it)
      const q = LIB ? nearestBody(LIB.ctx, p) : -1;
      if (q >= 0) { const si0 = B.get('skinIndex'), sw0 = B.get('skinWeight'); for (let k2 = 0; k2 < 4; k2++) { JI.push(si0[q * 4 + k2]); WT.push(sw0[q * 4 + k2] / 255); } }
      else { const side = a < 0 ? 0 : 1, wc = (1 - back) * 0.5; JI.push(sp >= 0 ? sp : 0, cl[side], nk, 0); WT.push(1 - wc - 0.1, wc, 0.1, 0); } } }
  for (let i = 0; i < NA; i++) for (let k = 0; k < NB0; k++) { const a = i * (NB0 + 1) + k, b = a + NB0 + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  // (the drawstrings: two cords from the neckline's front, hanging)
  if (Hd.strings !== false) for (const sx of [-1, 1]) { const base = P.length / 3, x0 = sx * 0.035, z0 = c0[2] + neckR + 0.018, L = Hd.strings?.len ?? 0.2, NS = 10, RS = 0.0035;
    for (let j = 0; j <= NS; j++) for (let k = 0; k <= 6; k++) { const t = (k / 6) * 2 * Math.PI, y = neckY - 0.06 - (L * j) / NS, z = z0 + 0.012 * (j / NS) + 0.01;
      P.push(x0 + Math.cos(t) * RS, y, z + Math.sin(t) * RS); UV.push(0.02, 0.02); JI.push(sp, 0, 0, 0); WT.push(1, 0, 0, 0); }
    for (let j = 0; j < NS; j++) for (let k = 0; k < 6; k++) { const a = base + j * 7 + k, b = a + 7; idx.push(a, b, a + 1, a + 1, b, b + 1); } }
  const S = 256, img = new Uint8Array(S * S * 3), col = Hd.color || [60, 60, 64];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const i = (y * S + x) * 3, f = 0.78 + 0.22 * Math.sin((y / S) * Math.PI) + 0.04 * (((x * 7 + y * 13) % 5) / 5 - 0.5); for (let q = 0; q < 3; q++) img[i + q] = Math.min(255, Math.round(col[q] * f)); }
  for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) { const i = (y * S + x) * 3, sc0 = Hd.stringColor || [230, 230, 226]; for (let q = 0; q < 3; q++) img[i + q] = sc0[q]; }
  const hM = mat('hood', { rough: 0.92, ds: true, map: await tex('', await sharp(img, { raw: { width: S, height: S, channels: 3 } }).jpeg({ quality: 90 }).toBuffer(), 'image/jpeg') });
  addSkinned('hood', P, UV, JI, WT, idx, hM); hM.setExtras({ layer: 6, kind: 'cloth', garment: 'hood' });
  console.error('hood', P.length / 3, 'points; neck r', neckR.toFixed(3));
}

// FORGE: box braids as geometry (CFG.boxBraids { n, rows, r, len, colors }): roots in a grid over the scalp (the
// skull's outline from capGeom), each braid a 6-sided tube with plaited light (alternating lobes along it): along the
// scalp down to the hairline (front roots swept back past the ears so none falls over the face), then hanging, kept
// out of the body and the clothes by their outline round the neck and back. The scalp under it painted dark (parts).
// On the head; the hanging part blends to the neck and upper spine.
// FORGE v2: the library's garments into the GLB: each part painted in its own uv space (the body's for a shell), its
// material marked with its layer (the gates' cloth check) and kind
// (NK: a hoodie's rib and its hood lying down are sewn on the same neckline seam: one layer, neither over the other)
if (LIB) for (const [li, { g, r }] of LIB.done.entries()) {
  const layer = g.layer ?? 3 + li;
  for (const p of [...r.parts, ...r.extras]) {
    const m = p.mesh, N = weldNormals(m.P, m.idx);
    // (C5: a made garment's cloth (library.mjs FABRIC): its weave, seams and folds as a normal map, the same relief a
    // little in its colour, its own roughness and a dielectric's specular turned down (no plastic sheen))
    const cloth = !globalThis.process?.env?.C5_NOFABRIC && p.paint && !p.bump && !/-buttons$/.test(p.name) ? (p.cloth || g.cloth || FABRIC[g.item]) : null;
    const fsh = cloth ? fabricShade(LIB.ctx, cloth, p.name) : null, paint = fsh ? (q, n, f, c, ao, uv) => { const k = fsh(q, n, f, c), rgb = p.paint(q, n, f, c, ao, uv); return rgb.map((x) => Math.min(255, Math.max(0, 255 * Math.pow(Math.pow(x / 255, 2.2) * k, 1 / 2.2)))); } : p.paint;
    let map = null; if (p.paint) { const img = rasterPaint({ ...m, N }, p.S, p.base, paint); map = await tex('', await sharp(img, { raw: { width: p.S, height: p.S, channels: 3 } }).jpeg({ quality: 90 }).toBuffer(), 'image/jpeg'); }
    // (forge v2.3, SH: a part's bump (a height painted as its colour is) as a normal map: grain, seams, stitches, tread)
    const bump = p.bump || (cloth ? fabricBump(LIB.ctx, cloth, p.name) : null), bS = p.bump ? p.S : Math.min(2048, Math.max(512, p.S));
    const normal = bump ? await tex('', await sharp(bumpNormals(rasterPaint({ ...m, N }, bS, [128, 128, 128], bump), bS, p.bumpK ?? (cloth ? 3 : 2)), { raw: { width: bS, height: bS, channels: 3 } }).png().toBuffer()) : null;
    const mm = mat(p.name, { rough: p.rough ?? (cloth ? FABRIC_ROUGH[cloth] ?? 0.9 : 0.86), ds: true, map, normal, spec: cloth && cloth !== 'nylon' ? CLOTHSPEC : null, color: map ? [1, 1, 1] : p.base.map((c) => Math.pow(c / 255, 2.2)) }).setMetallicFactor(p.metal ?? 0).setExtras({ layer: p.name.endsWith('-buttons') ? layer + 0.5 : layer, kind: 'cloth', garment: g.item });
    addSkinned(p.name, m.P, m.UV, m.JI, m.WT, m.idx, mm, null, N);
    console.error('library emitted', p.name, m.P.length / 3, 'points', m.idx.length / 3, 'tris');
  }
}
if (CFG.boxBraids) {
  const Bb = CFG.boxBraids, cols = Bb.colors || [[14, 10, 9], [40, 30, 25], [86, 66, 54]], R0 = Bb.r ?? 0.0042, L = Bb.len ?? 0.42, NBR = Bb.count ?? 90;
  const N0 = B.get('normal'), headV = [...skinV].filter((v) => headW(v) > 0.5), near = nearestOf(bPos, headV), zc = SKL('neck01')[2];
  // (the hairline round the head: over the forehead, above the ears, down to the nape)
  const band = (x, z) => { const ph = Math.atan2(x, z - (EZ - 0.088)), c = Math.cos(ph); return c > 0 ? EY + 0.012 + 0.04 * Math.pow(c, 1.5) : EY + 0.012 - 0.082 * Math.pow(-c, 1.3); };
  // (the roots: scalp points above the hairline, spread evenly (farthest-point sampling))
  const cand = headV.filter((v) => bPos[v * 3 + 1] > band(bPos[v * 3], bPos[v * 3 + 2]) + 0.006 && !(Math.abs(bPos[v * 3]) > 0.06 && bPos[v * 3 + 1] < EY + 0.03 && bPos[v * 3 + 2] > EZ - 0.12 && bPos[v * 3 + 2] < EZ - 0.05));
  // (a row on the hairline first, every 1.4 cm, so the braids start where hair starts; then the rest of the scalp)
  const roots = [], dmin = new Float32Array(cand.length).fill(9), dist = (a, c) => Math.hypot(bPos[a * 3] - bPos[c * 3], bPos[a * 3 + 1] - bPos[c * 3 + 1], bPos[a * 3 + 2] - bPos[c * 3 + 2]);
  for (const v of cand) { const y = bPos[v * 3 + 1] - band(bPos[v * 3], bPos[v * 3 + 2]); if (y > 0.012) continue; if (roots.every((r) => dist(r, v) > (Bb.edge ?? 0.014))) roots.push(v); }
  for (let i = 0; i < cand.length; i++) for (const r of roots) dmin[i] = Math.min(dmin[i], dist(cand[i], r));
  if (!roots.length) roots.push(cand[0]);
  while (roots.length < NBR) { const r = roots[roots.length - 1]; let bi = -1, bd = -1;
    for (let i = 0; i < cand.length; i++) { const v = cand[i], d = Math.hypot(bPos[v * 3] - bPos[r * 3], bPos[v * 3 + 1] - bPos[r * 3 + 1], bPos[v * 3 + 2] - bPos[r * 3 + 2]); if (d < dmin[i]) dmin[i] = d; if (dmin[i] > bd) { bd = dmin[i]; bi = i; } }
    if (bi < 0) break; roots.push(cand[bi]); }
  let crown = [0, -9, 0]; for (const v of cand) if (bPos[v * 3 + 1] > crown[1]) crown = [bPos[v * 3], bPos[v * 3 + 1], bPos[v * 3 + 2] - 0.02];
  // (the body's outline round the neck's axis below the ears, for the hanging part (not the face: only behind the jaw))
  const prof = new Map(), pk = (y, a) => Math.round(y * 100) + ',' + Math.round(a / (Math.PI / 18));
  // (forge v2: the library's garments in the outline too, so braids hang outside a hoodie, not through it)
  const LP = []; if (LIB) for (const { r } of LIB.done) for (const p of [...r.parts, ...r.extras]) for (let i = 0; i < p.mesh.P.length; i += 3) LP.push(p.mesh.P[i], p.mesh.P[i + 1], p.mesh.P[i + 2]);
  const LPf = Float32Array.from(LP), LPset = new Set(Array.from({ length: LP.length / 3 }, (_, i) => i));
  for (const [P, set] of [[bPos, skinV], [pPos, new Set(wearT.flat())], [LPf, LPset]]) for (const v of set) { const y = P[v * 3 + 1]; if (y > EY + 0.02 || y < EY - 0.8) continue; if (P === bPos && headW(v) > 0.3 && P[v * 3 + 2] > EZ - 0.075) continue;
    const x = P[v * 3], z = P[v * 3 + 2] - zc, an = Math.atan2(x, z), r = Math.hypot(x, z), k = pk(y, an); if (r > (prof.get(k) || 0)) prof.set(k, r); }
  const outR = (y, an) => { let m = 0; for (const dy of [-0.01, 0, 0.01]) for (const da of [-1, 0, 1]) m = Math.max(m, prof.get(pk(y + dy, an + da * Math.PI / 18)) || 0); return m; };
  const P = [], UV = [], JI = [], WT = [], CO = [], idx = [], head = BI('head'), neck = BI('neck01'), sp = BI('spine01');
  const hsh = (i) => { let h = (i * 374761393) >>> 0; h = ((h ^ (h >>> 13)) * 1274126177) >>> 0; return (h & 0xffff) / 65535; };
  const off = R0 + 0.0015 + (Bb.coil ? Bb.coil.R + 0.002 : 0), snap = (p) => { const q = near(p); const n = [N0[q * 3] / 127, N0[q * 3 + 1] / 127, N0[q * 3 + 2] / 127], d = (p[0] - bPos[q * 3]) * n[0] + (p[1] - bPos[q * 3 + 1]) * n[1] + (p[2] - bPos[q * 3 + 2]) * n[2] - off; return [p[0] - n[0] * d, p[1] - n[1] * d, p[2] - n[2] * d, n]; };
  let nb = 0;
  for (const [ri, rv] of roots.entries()) {
    let p = snap([bPos[rv * 3], bPos[rv * 3 + 1], bPos[rv * 3 + 2]]); const path = [p.slice(0, 3)];
    // (forge v2.3, HB: short twists (Bb.stand 0..1): the strand leaves the scalp at an angle (stand of the way out along
    // the scalp's normal, the rest down and away from the crown), bending under its own weight (Bb.droop by its length),
    // never back into the head (each step kept off the scalp by the braid's own radius); no hanging part)
    if (Bb.stand) { const n0 = p[3], rad = [p[0] - crown[0], 0, p[2] - crown[2]], rl = Math.hypot(...rad) || 1, fr = p[2] > crown[2] + 0.02 && p[1] > EY + 0.03;
      let away = fr ? [0.2 * Math.sign(p[0] || 1), 0.6, 0.55] : [rad[0] / rl, -0.6, rad[2] / rl]; const an = away[0] * n0[0] + away[1] * n0[1] + away[2] * n0[2]; away = away.map((c, i) => c - an * n0[i]); const al = Math.hypot(...away) || 1;
      const d0 = n0.map((c, i) => c * Bb.stand + away[i] / al * (1 - Bb.stand)), Lb = L * (0.8 + 0.4 * hsh(ri + 3)); let q = p.slice(0, 3), sl = 0;
      while (sl < Lb) { const f = sl / Lb; let d = [d0[0], d0[1] - (Bb.droop ?? 0.5) * f * f * 1.6, d0[2]]; const dl = Math.hypot(...d) || 1; d = d.map((c) => c / dl);
        let nq = [q[0] + d[0] * 0.003, q[1] + d[1] * 0.003, q[2] + d[2] * 0.003]; const sq = snap(nq), dot0 = (nq[0] - sq[0]) * sq[3][0] + (nq[1] - sq[1]) * sq[3][1] + (nq[2] - sq[2]) * sq[3][2]; if (dot0 < 0) nq = sq.slice(0, 3);
        path.push(nq); q = nq; sl += 0.003; } }
    else {
    // (down the scalp: away from the crown, swept back over the top when it starts in front, until the hairline)
    const front0 = p[2] > crown[2] + 0.01;
    for (let k = 0; k < 70; k++) { const n = p[3], rad = [p[0] - crown[0], 0, p[2] - crown[2]], rl = Math.hypot(...rad) || 1, fr = front0 && p[2] > crown[2] - 0.035 ? 1 : 0;
      // (a front root goes up and back over the top first (no gravity until it is past the crown), then down)
      let d = fr ? [0.22 * Math.sign(p[0] || 1), 0, -1] : [rad[0] / rl * 0.6, -1, rad[2] / rl * 0.6]; const dn = d[0] * n[0] + d[1] * n[1] + d[2] * n[2]; d = d.map((c, i) => c - dn * n[i]); const dl = Math.hypot(...d) || 1;
      p = snap([p[0] + d[0] / dl * 0.006, p[1] + d[1] / dl * 0.006, p[2] + d[2] / dl * 0.006]); path.push(p.slice(0, 3)); if (p[1] < band(p[0], p[2])) break; }
    // (then hanging, kept outside the outline, a little splay)
    let q = path[path.length - 1], len = 0; for (let k = 1; k < path.length; k++) len += Math.hypot(...path[k].map((x, i) => x - path[k - 1][i]));
    const Lb = L * (0.88 + 0.24 * hsh(ri + 3));
    // (forge v2: a braid that meets the shoulders or a hood slides round them toward the back, as hair does, instead of
    // standing out sideways to clear them)
    while (len < Lb) { const y = q[1] - 0.012, x0 = q[0], z0 = q[2] - zc, rr = Math.hypot(x0, z0); let an = Math.atan2(x0, z0), need = outR(y, an) + 0.006 + R0;
      for (let t = 0; t < 8 && need > rr + 0.012 && Math.abs(an) < Math.PI * 0.92; t++) { an += Math.sign(an || 1) * 0.12; need = outR(y, an) + 0.006 + R0; }
      const r2 = Math.max(rr, need) + 0.0008; const nq = [Math.sin(an) * r2, y, zc + Math.cos(an) * r2]; len += Math.hypot(nq[0] - q[0], nq[1] - q[1], nq[2] - q[2]); path.push(nq); q = nq; }
    }
    // (forge v2.2, curls (Bb.coil { R, pitch }): the strand's middle line wound round its path as a helix, so each strand
    // is a spring-like ringlet; the path resampled every 3 mm (F6: was 2.2 mm round a 4-sided tube: the nurse's curls
    // made a 4.4 MB person, over the store's 3 MB; now a 3-sided tube, 4 to 5 points a turn, about 2.4 MB))
    if (Bb.coil) { const rs = [path[0]]; let acc = 0; for (let k = 1; k < path.length; k++) { const a = path[k - 1], b = path[k], d = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), m = Math.max(1, Math.round(d / 0.003));
      for (let j = 1; j <= m; j++) rs.push(a.map((x, i) => x + (b[i] - x) * j / m)); acc += d; } path.splice(0, path.length, ...rs); }
    const base = P.length / 3, NS = Bb.coil ? 3 : 6, col = cols[Math.floor(hsh(ri + 11) * 0.999 * (cols.length - 1))], col2 = cols[cols.length - 1]; let s0 = 0;
    for (let k = 0; k < path.length; k++) {
      const a0 = path[Math.max(0, k - 1)], b0 = path[Math.min(path.length - 1, k + 1)], t = [b0[0] - a0[0], b0[1] - a0[1], b0[2] - a0[2]], tl = Math.hypot(...t) || 1; t[0] /= tl; t[1] /= tl; t[2] /= tl;
      let u = [-t[2], 0, t[0]]; if (Math.hypot(...u) < 0.2) u = [1, 0, 0]; const ul = Math.hypot(...u); u = u.map((x) => x / ul);
      const w = [t[1] * u[2] - t[2] * u[1], t[2] * u[0] - t[0] * u[2], t[0] * u[1] - t[1] * u[0]];
      if (k) s0 += Math.hypot(...path[k].map((x, i) => x - path[k - 1][i]));
      // (forge v2: the hanging part held by the head (Bb.headHold at its end), so it turns with the face, not across it)
      const taper = k > path.length - 3 ? 0.55 : k === 0 ? 0.85 : 1, hold = Bb.headHold ?? 0, hw = Math.max(hold * (1 - Math.min(1, (EY - 0.05 - path[k][1]) / 0.45)), Math.min(1, 1 - (EY - 0.05 - path[k][1]) / 0.1));
      const cph = Bb.coil ? s0 / Bb.coil.pitch * 2 * Math.PI + hsh(ri + 5) * 6.28 : 0, cR = Bb.coil ? Bb.coil.R * Math.min(1, s0 / 0.012) * (0.8 + 0.4 * hsh(ri + 9)) : 0, cOff = [0, 1, 2].map((i) => (u[i] * Math.cos(cph) + w[i] * Math.sin(cph)) * cR);
      for (let j = 0; j <= NS; j++) { const ang = (j / NS) * 2 * Math.PI, c = Math.cos(ang), sn = Math.sin(ang), ph = s0 / (Bb.pitch ?? 0.0055) * 2 * Math.PI,
        rr = R0 * taper * (1 + (Bb.plait ?? 0) * Math.cos(2 * ang + ph) + (Bb.lumps ?? 0) * (vnoise(s0 * 90 + ri * 3.1, ri * 0.7, 2) - 0.5) * 2);
        P.push(path[k][0] + cOff[0] + (u[0] * c + w[0] * sn) * rr, path[k][1] + cOff[1] + (u[1] * c + w[1] * sn) * rr, path[k][2] + cOff[2] + (u[2] * c + w[2] * sn) * rr);
        UV.push(j / NS, s0 / 0.5);
        const lobe = Bb.plait ? 0.5 + 0.5 * Math.cos(2 * ang + ph) : Math.abs(Math.sin(s0 / 0.0055 * Math.PI + (j % 2) * Math.PI / 2)), fz = 1 + (Bb.fuzz ?? 0.06) * (vnoise(s0 * 400 + j, ri, 5) - 0.5) * 2, L0 = (0.5 + 0.5 * lobe) * fz, cc = col.map((x, i) => Math.min(255, (x + (col2[i] - x) * 0.2 * lobe) * L0) / 255);
        CO.push(...cc.map((x) => Math.pow(x, 2.2)), 1);
        if (hw >= 1) { JI.push(head, 0, 0, 0); WT.push(1, 0, 0, 0); } else { JI.push(head, neck, sp, 0); WT.push(hw, (1 - hw) * 0.35, (1 - hw) * 0.65, 0); } }
      if (k) for (let j = 0; j < NS; j++) { const a1 = base + (k - 1) * (NS + 1) + j, b1 = a1 + NS + 1; idx.push(a1, a1 + 1, b1, a1 + 1, b1 + 1, b1); }
    }
    nb++;
  }
  const bM = mat(Bb.coil ? 'curls' : Bb.lumps ? 'locs' : 'braids', { spec: HAIRSPEC, rough: Bb.rough ?? 0.68, color: [1, 1, 1] }); if (Bb.stand) bM.setExtras({ style: 'twists' });
  addSkinned('braids', P, UV, JI, WT, idx, bM, CO);
  console.error('box braids', nb, 'braids,', P.length / 3, 'points');
}
// (forge v2.3, HB) the afro (CFG.afro { size (m), front, colors }): a volume of tight coils, made as Mr. Big's beard is: fur
// shells. Over the scalp from the hairline (capGeom's band: high on the forehead, over the ears, low at the nape) to the
// crown, CFG.afro.layers shells out to the afro's outline: size off the skull at the crown and sides, less over the
// forehead (front), the outline's height varied by clumps of about 3 cm (so it is round like hair, never a helmet), every
// shell meeting the skull at the band (no open edge, no brim from below). One texture of coils in the shells' (round the
// head, up) uv space, seamless round the head; a texel shows on a shell while its coil height is over the shell's share
// (the vertex alpha), so the inner shells are dense and the outer ones a fuzz of the tallest coils. On the head bone
if (CFG.afro) {
  const AF = CFG.afro, { C, rHead, thMin } = capGeom({ cut: (ph) => { const a = Math.abs(ph), c = Math.cos(ph);
    // (a hairline, not a hat's band: the forehead's middle, the temples a little back (higher), down in front of the ears
    // to their top, the back low to the nape)
    return EY + (c > 0 ? (AF.front ?? 0.042) * Math.pow(c, 0.6) + 0.012 * Math.exp(-(((a - 0.62) / 0.16) ** 2)) - 0.012 * Math.exp(-(((a - 1.25) / 0.2) ** 2)) : -0.05 * Math.pow(-c, 1.2)); } }), NP = 120, NT = 30, NL = AF.layers ?? 12, size = AF.size ?? 0.05, head = BI('head');
  const cols = AF.colors || [[10, 8, 7], [32, 24, 20], [70, 54, 44]];
  const nz3 = (x, y, z) => vnoise(x, y, z);
  const P = [], UV = [], JI = [], WT = [], CO = [], idx = [];
  const P3 = (ph, th, r) => [C[0] + r * Math.cos(th) * Math.sin(ph), C[1] + r * Math.sin(th), C[2] + r * Math.cos(th) * Math.cos(ph)];
  const TH1 = Math.PI / 2 - 0.035;
  // (v2.3 round 2: the inner 70 % an opaque core (its own primitive: no light through it, no spikes of stacked texels at
  // the outline), then NL fuzz shells from 0.62 to 1.04 of the size, each its uvs shifted (the coils of one shell never
  // stacked over another's, so the edge reads as a soft fuzz, not as rays))
  const CP = [], CUV = [], CJI = [], CWT = [], CCO = [], cidx = [];
  const ring = (f, L, out) => { const [PP, UU, JJ, WW, CC, II] = out, base = PP.length / 3, du = L * 0.1373, dv = Math.max(0, L) * 0.0211;
    for (let j = 0; j <= NT; j++) for (let i = 0; i <= NP; i++) { const ph = (i / NP) * 2 * Math.PI - Math.PI, t0 = thMin(ph), th = t0 + (TH1 - t0) * (j / NT);
      const dir = P3(ph, th, 1).map((c, k) => c - C[k]), front = Math.max(0, Math.cos(ph)) * sm(-0.1, 0.5, th), edge = 0.03 + 0.97 * Math.pow(sm(0, 0.55, th - t0), 0.45);
      const clump = 1 + 0.5 * (nz3(dir[0] * 6 + 3, dir[1] * 6, dir[2] * 6 + 7) - 0.5) * 2 + 0.22 * (nz3(dir[0] * 13, dir[1] * 13 + 5, dir[2] * 13) - 0.5) * 2;
      const T = size * (1 - (1 - (AF.frontK ?? 0.55)) * front) * edge * clump, r = rHead(ph, th) + 0.0025 + T * f;
      PP.push(...P3(ph, th, r)); UU.push(i / NP + du, j / NT * 0.27 + dv); JJ.push(head, 0, 0, 0); WW.push(1, 0, 0, 0);
      const k = L < 0 ? 0.55 : 0.5 + 0.5 * (f - 0.62) / 0.42, a = L < 0 ? 1 : 1 - 0.42 * (f - 0.62) / 0.42; CC.push(k, k, k, a); }
    for (let j = 0; j < NT; j++) for (let i = 0; i < NP; i++) { const a = base + j * (NP + 1) + i, b = a + 1, c = a + NP + 1, d = c + 1; II.push(a, b, c, b, d, c); } };
  ring(0.7, -1, [CP, CUV, CJI, CWT, CCO, cidx]);
  for (let L = 0; L < NL; L++) ring(0.62 + 0.42 * L / Math.max(1, NL - 1), L, [P, UV, JI, WT, CO, idx]);
  // (the coils' texture: W x H texels at about 0.7 mm each; height = two scales of coil noise, seamless round the head
  // (the noise read on a circle in u); the colour from the ramp by height, a few lighter coils)
  const W = 1024, H = 1024, img = new Uint8Array(W * H * 4), Rn = W / (2 * Math.PI);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const a = (x / W) * 2 * Math.PI, cx = Math.cos(a) * Rn, cy = Math.sin(a) * Rn;
    const h1 = nz3(cx / 2.6, cy / 2.6, y / 2.6), h2 = nz3(cx / 1.2 + 40, cy / 1.2, y / 1.2 + 9), h3 = nz3(cx / 9, cy / 9 + 3, y / 9);
    const h = Math.min(1, Math.max(0, (0.55 * h1 + 0.3 * h2 + 0.15 * h3 - 0.22) / 0.6)), lite = nz3(cx / 5 + 9, cy / 5, y / 5 + 2) > 0.78 ? 1 : 0, i = (y * W + x) * 4;
    const c = h < 0.5 ? cols[0].map((v, k) => v + (cols[1][k] - v) * h * 2) : cols[1].map((v, k) => v + (cols[2][k] - v) * (h - 0.5) * 2 * (0.6 + 0.4 * lite));
    img[i] = Math.round(c[0]); img[i + 1] = Math.round(c[1]); img[i + 2] = Math.round(c[2]); img[i + 3] = Math.round(255 * h); }
  const aM = mat('hair-afro', { spec: HAIRSPEC, rough: AF.rough ?? 0.88, alpha: 0.5, ds: true, map: await tex('', await sharp(img, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer()) });
  aM.setExtras({ style: 'afro' }); addSkinned('hair-afro', P, UV, JI, WT, idx, aM, CO);
  const cM = mat('hair-afro-core', { spec: HAIRSPEC, rough: AF.rough ?? 0.88, map: aM.getBaseColorTexture() }); cM.setExtras({ style: 'afro' }); addSkinned('hair-afro-core', CP, CUV, CJI, CWT, cidx, cM, CCO);
  console.error('afro', NL, 'shells,', P.length / 3, 'points, size', size);
}
// (H5) a buzz cut and a balding head's cropped sides as Mr. Big's beard is made: fur shells (CFG.fuzz { layers, depth (m),
// colors [root, middle, light], grey (light share), len (px) }). The scalp's painted area (SCALP: the buzz's hairline, the
// horseshoe) copied out along the skin's normals CFG.fuzz.layers times to depth (thinning to nothing at the area's edge),
// in the skin's own uvs; one texture of short hairs along their growth (from the crown out: forward over the forehead,
// down the sides and back), the area's edge ragged per hair, so the cut reads as hair at 2 m and in silhouette (v2 painted
// it alone: the veteran's white buzz read bald from every side). On the skin's weights; material 'hairShell'
if (CFG.fuzz && CFG.shaved) {
  const FZ = CFG.fuzz, NL = FZ.layers ?? 3, depth = FZ.depth ?? 0.0018, uvB = B.get('uv'), NB = B.get('normal'), SI = B.get('skinIndex'), SW = B.get('skinWeight');
  const T = []; for (let q = 0; q < skinOut.length; q += 3) { const a = skinOut[q], b = skinOut[q + 1], c = skinOut[q + 2]; if (Math.max(SCALP[a], SCALP[b], SCALP[c]) <= 0.04) continue;
    // (none down the face's sides under the brows' height (the sideburns stay painted): the gates' hair on the face)
    if ([a, b, c].some((v) => bPos[v * 3 + 1] < EY + 0.016 && Math.abs(bPos[v * 3]) < 0.066)) continue; T.push(a, b, c); }
  const verts = [...new Set(T)], ix = new Map(verts.map((v, k) => [v, k])), nS = verts.length, P = [], UV = [], JI = [], WT = [], CO = [], idx = [];
  for (let L = 0; L < NL; L++) { const f = (L + 1) / NL, k = 0.62 + 0.38 * f, al = 1 - 0.42 * L / Math.max(1, NL - 1);
    for (const v of verts) { const n = [NB[v * 3] / 127, NB[v * 3 + 1] / 127, NB[v * 3 + 2] / 127], nl = Math.hypot(...n) || 1, p = [bPos[v * 3], bPos[v * 3 + 1], bPos[v * 3 + 2]];
      const tp = sm(0.0, 0.5, SCALP[v]) * (0.8 + 0.4 * vnoise(p[0] * 140, p[1] * 140 + 4, p[2] * 140)), d = 0.0003 + depth * f * tp;
      P.push(...p.map((c, i) => c + n[i] / nl * d)); UV.push(uvB[v * 2] / 65535, 1 - uvB[v * 2 + 1] / 65535);
      for (let j = 0; j < 4; j++) { JI.push(SI[v * 4 + j]); WT.push(SW[v * 4 + j] / 255); } CO.push(k, k, k, al); }
    for (const v of T) idx.push(L * nS + ix.get(v)); }
  // (the texture: 2048 in the skin's uv space, over the shells' triangles only)
  const S = 2048, img = new Uint8Array(S * S * 4), cols = FZ.colors, gS = FZ.grey ?? 0, len = FZ.len ?? 3.2, CR = [0, EY + 0.115, EZ - 0.115];
  for (let q = 0; q < T.length; q += 3) {
    const vs = [T[q], T[q + 1], T[q + 2]], ws = vs.map((v) => SCALP[v]), U = vs.map((v) => [uvB[v * 2] / 65535 * S, (1 - uvB[v * 2 + 1] / 65535) * S]), Pv = vs.map((v) => [bPos[v * 3], bPos[v * 3 + 1], bPos[v * 3 + 2]]);
    const c3 = [0, 1, 2].map((c) => (Pv[0][c] + Pv[1][c] + Pv[2][c]) / 3), D0 = c3.map((c, i) => c - CR[i]); D0[1] -= 0.02; const dl = Math.hypot(...D0) || 1, d = uvDir(Pv, U, D0.map((c) => c / dl));
    const x0 = Math.floor(Math.min(...U.map((u) => u[0]))) - 1, x1 = Math.ceil(Math.max(...U.map((u) => u[0]))) + 1, y0 = Math.floor(Math.min(...U.map((u) => u[1]))) - 1, y1 = Math.ceil(Math.max(...U.map((u) => u[1]))) + 1;
    const det = (U[1][1] - U[2][1]) * (U[0][0] - U[2][0]) + (U[2][0] - U[1][0]) * (U[0][1] - U[2][1]); if (Math.abs(det) < 1e-9) continue;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const l1 = ((U[1][1] - U[2][1]) * (x - U[2][0]) + (U[2][0] - U[1][0]) * (y - U[2][1])) / det, l2 = ((U[2][1] - U[0][1]) * (x - U[2][0]) + (U[0][0] - U[2][0]) * (y - U[2][1])) / det, l3 = 1 - l1 - l2;
      if (l1 < -0.08 || l2 < -0.08 || l3 < -0.08 || x < 0 || y < 0 || x >= S || y >= S) continue;
      const wv = Math.max(0, Math.min(1, l1 * ws[0] + l2 * ws[1] + l3 * ws[2])), i = (y * S + x) * 4;
      const fine = strand(x, y, d, len, 31), clump = vnoise(x / 4, y / 4, 33), h = 0.85 * fine + 0.15 * clump;
      const cov = sm(0.1, 0.75, wv + (vnoise(x / 6, y / 6, 35) - 0.5) * 0.5), a = cov * sm(0.42, 0.8, h); if (a * 255 <= img[i + 3]) continue;
      const tone = vnoise(x / 1.2, y / 1.2, 37), isL = vnoise(x / 1.1, y / 1.1 + 50, 39) < gS, c = isL ? cols[2].map((v, j) => v * 0.9 + cols[1][j] * 0.1 * tone) : cols[0].map((v, j) => v + (cols[1][j] - v) * (0.35 + 0.65 * tone));
      img[i] = Math.round(c[0]); img[i + 1] = Math.round(c[1]); img[i + 2] = Math.round(c[2]); img[i + 3] = Math.round(255 * a); } }
  // (the clear texels the nearest hair's colour along the row, for the mips)
  for (let y = 0; y < S; y++) { let last = -1; for (let x = 0; x < S; x++) { const i = (y * S + x) * 4; if (img[i + 3] > 8) last = i; else if (last >= 0) { img[i] = img[last]; img[i + 1] = img[last + 1]; img[i + 2] = img[last + 2]; } } }
  const fM = mat('hairShell', { spec: HAIRSPEC, rough: FZ.rough ?? 0.82, alpha: 0.5, map: await tex('', await sharp(img, { raw: { width: S, height: S, channels: 4 } }).png().toBuffer()) }); fM.setExtras({ style: 'fuzz' });
  addSkinned('hairShell', P, UV, JI, WT, idx, fM, CO);
  console.error('scalp fuzz (H5)', NL, 'shells x', T.length / 3, 'triangles,', nS, 'points each, depth', depth);
}
// (forge v2.3, HB) the bun (CFG.bun { r, h, ropes, colors }, at BUN: the ponytail's gather, its tail's cards dropped): hair
// wound into a low dome, as ropes coiled from the middle outward (each 8-9 mm round, twisted strands in its light),
// sitting on the slicked hair at the gather, its foot sunk 3 mm into it; on the head bone
if (CFG.bun && BUN) {
  const Bn = CFG.bun, HC = [0, EY + 0.02, EZ - 0.088], head = BI('head'), cols = Bn.colors || [[60, 58, 56], [140, 138, 134], [210, 208, 204]];
  const nrm = (v) => { const l = Math.hypot(...v) || 1; return v.map((c) => c / l); }, cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const o = nrm(BUN.map((c, k) => c - HC[k])), e1 = nrm(cross([0, 1, 0], o)), e2 = cross(o, e1), Rb = Bn.r ?? 0.032, Hb = Bn.h ?? 0.03, NR = Bn.ropes ?? 3, rr0 = Bn.rope ?? 0.0085, turns = Bn.turns ?? 2.4, NS = 8;
  const P = [], UV = [], JI = [], WT = [], CO = [], idx = [], base0 = BUN.map((c, k) => c - o[k] * 0.003);
  for (let ri = 0; ri < NR; ri++) { const ph0 = (ri / NR) * 2 * Math.PI, path = [];
    for (let k = 0; k <= 160; k++) { const s1 = k / 160, rho = Rb * (0.12 + 0.88 * s1) - rr0 * 0.6, ang = ph0 + s1 * turns * 2 * Math.PI, hh = Hb * Math.sqrt(Math.max(0, 1 - Math.pow((rho + rr0 * 0.6) / (Rb + rr0 * 0.3), 2))) + 0.002;
      path.push([0, 1, 2].map((c) => base0[c] + (e1[c] * Math.cos(ang) + e2[c] * Math.sin(ang)) * rho + o[c] * hh)); }
    const base = P.length / 3; let sl = 0;
    for (let k = 0; k < path.length; k++) { const a0 = path[Math.max(0, k - 1)], b0 = path[Math.min(path.length - 1, k + 1)], t = nrm(b0.map((c, i) => c - a0[i])); let u = nrm(cross(t, o)); if (!isFinite(u[0])) u = e1; const w = cross(t, u);
      if (k) sl += Math.hypot(...path[k].map((c, i) => c - path[k - 1][i]));
      const taper = Math.min(1, 0.45 + k / 12) * Math.min(1, 0.35 + (path.length - 1 - k) / 14), rr = rr0 * taper;
      for (let j = 0; j <= NS; j++) { const an = (j / NS) * 2 * Math.PI, lump = 1 + 0.08 * (vnoise(sl * 300 + ri * 7, j * 0.7, 3) - 0.5) * 2;
        P.push(...[0, 1, 2].map((c) => path[k][c] + (u[c] * Math.cos(an) + w[c] * Math.sin(an)) * rr * lump)); UV.push(j / NS, sl / 0.3); JI.push(head, 0, 0, 0); WT.push(1, 0, 0, 0);
        const str = 0.5 + 0.5 * Math.cos(an * 3 + sl / 0.012 * 2 * Math.PI), fine = vnoise(an * 9 + ri, sl * 900, 4), L0 = 0.55 + 0.3 * str + 0.15 * fine, c3 = (fine > 0.72 ? cols[2] : cols[1]).map((x, i) => Math.min(255, (cols[0][i] + (x - cols[0][i]) * L0)) / 255);
        CO.push(...c3.map((x) => Math.pow(x, 2.2)), 1); }
      if (k) for (let j = 0; j < NS; j++) { const a1 = base + (k - 1) * (NS + 1) + j, b1 = a1 + NS + 1; idx.push(a1, a1 + 1, b1, a1 + 1, b1 + 1, b1); } } }
  const bnM = mat('hair-bun', { spec: HAIRSPEC, rough: Math.max(0.66, Bn.rough ?? 0.62), color: [1, 1, 1] }); bnM.setExtras({ style: 'bun' }); addSkinned('hair-bun', P, UV, JI, WT, idx, bnM, CO);
  console.error('bun', NR, 'ropes,', P.length / 3, 'points at', BUN.map((x) => x.toFixed(3)).join(','));
}

/* -------------------------------------------------------- her mouth's inside -- */
// the template's teeth and the dark behind them sat for the template's mouth (its lips' parting 1.5709 m up, their front
// 0.1556 m forward, in the bind's space, under a 1.06 head); here for hers (the parting found the way wagmi/face.js
// finds it, roughly: the lips' front at the mid-line, the jump forward going down)
const headN = nodeBy('head'), HB = B.J.skeleton.find((b) => b.name === 'head').head;
// (the parting and the lips' front as wagmi/face.js's finder reads them off her face in the studio: mm under the eyes'
// middle, mm in front of the eyeballs' front)
const mouth = (() => { const ey = (eyeC[0][1] + eyeC[1][1]) / 2, m = CFG.mouth || { below: 63.5, front: 13.25 }; return { y: ey - m.below / 1000, z: EYEFRONT + m.front / 1000, ey }; })();
// (the template's: its parting 62.9 mm under its eyes (1.639), its lips' front 0.1556; its teeth were set 5 mm under the
// parting and the game moves them up 1.2 mm and in 3.5 mm, which stays as it is for hers)
const JUNO = { y: 1.639 - 0.0629, z: 0.1556 };
for (const k of keepMouth.filter((k) => { if (k.kind === 'teeth' && TEETH) { k.n.dispose(); return false; } return true; })) {
  // (its place in the bind's space under the template's head, then the same offset from her lips)
  // (a child of the head at t sits where a head vertex at the head's joint + t does, whatever the head's scale)
  const t = k.t, want = [t[0], t[1] + mouth.y - JUNO.y, t[2] + mouth.z - JUNO.z];
  k.n.setTranslation(want);
}

// (cast2, the lead: 'fit the crown to the skull and curve the brim like a real ball cap') his cap made for his head: a
// six-panel crown that follows his skull (each direction from inside his head out to his skin's furthest point there,
// 6 mm out, a little room at the top), its band sloping from mid-forehead over the ears to the back of his head, a
// turned edge, seams and a button; a brim off the front, curved across (its sides down) and pitched a little down,
// with a thickness. In the bind space, on the head bone (a child placed by the head's inverse bind: a pure move).
if (CFG.cap?.make) {
  const { C, NP, NT, TH0, THN, rHead, thMin, cutY } = capGeom(CFG.cap), K = CFG.cap;
  const off = (t, ph) => (K.off ?? 0.006) + 0.012 * t * t + 0.004 * Math.max(0, Math.cos(ph)) * Math.sin(t * Math.PI);
  const pts = [], col = [], tri = [], uvs = [];
  const P3 = (ph, th, r) => [C[0] + r * Math.cos(th) * Math.sin(ph), C[1] + r * Math.sin(th), C[2] + r * Math.cos(th) * Math.cos(ph)];
  const seam = (ph) => { const k = ((ph / (Math.PI / 3)) % 1 + 1) % 1; return Math.min(k, 1 - k) < 0.035 ? 0.62 : 1; };
  const navy = K.color || [0.035, 0.05, 0.11];
  const add = (p, c, uv = [0.5, 0.02]) => { pts.push(...p); col.push(...c, 1); uvs.push(...uv); return pts.length / 3 - 1; };
  const STYLE = K.style || 'ball';
  const hsh = (i, j) => { let h = (i * 374761393 + j * 668265263) >>> 0; h = ((h ^ (h >>> 13)) * 1274126177) >>> 0; return (h & 0xffff) / 65535; };
  if (STYLE === 'ball') {
    const NR = 22, ring = [];
    // (the crown: rings from the band (t 0) to the top (t 1); the first ring a turned edge, 3 mm in)
    for (let j = -1; j <= NR; j++) { const row = []; for (let i = 0; i < NP; i++) { const ph = (i / NP) * 2 * Math.PI, t0 = thMin(ph), t = Math.max(0, j) / NR, th = t0 + (THN - 0.02 - t0) * t;
      const r = rHead(ph, th) + (j < 0 ? 0.0025 : off(t, ph)), sh = (0.82 + 0.18 * t) * seam(ph) * (j < 0 ? 0.7 : 1); row.push(add(P3(ph, th, r), navy.map((c) => c * sh))); } ring.push(row); }
    for (let j = 0; j < ring.length - 1; j++) for (let i = 0; i < NP; i++) { const a = ring[j][i], b = ring[j][(i + 1) % NP], c = ring[j + 1][i], d = ring[j + 1][(i + 1) % NP]; tri.push(a, c, b, b, c, d); }
    const apex = add([C[0], C[1] + rHead(0, THN - 0.01) + (K.off ?? 0.006) + 0.012, C[2]], navy.map((c) => c * 0.95));
    { const last = ring[ring.length - 1]; for (let i = 0; i < NP; i++) tri.push(last[i], apex, last[(i + 1) % NP]); }
    // (the button on top)
    { const top = pts.slice(apex * 3, apex * 3 + 3), n0 = pts.length / 3, R0 = 0.0065, H0 = 0.0035; const rim = []; for (let i = 0; i < 16; i++) { const a = (i / 16) * 2 * Math.PI; rim.push(add([top[0] + R0 * Math.sin(a), top[1] - 0.001, top[2] + R0 * Math.cos(a)], navy.map((c) => c * 0.8))); }
      const tp = add([top[0], top[1] + H0, top[2]], navy.map((c) => c * 0.9)); for (let i = 0; i < 16; i++) tri.push(rim[i], tp, rim[(i + 1) % 16]); }
    // the brim: from the band's front, out and curved
    const PB = K.brimSpan ?? 1.25, NU = 28, NV = 10, L = K.brimLen ?? 0.074, pitch = K.pitch ?? 0.2, droop = K.droop ?? 0.024, TK = 0.0035;
    const brim = (u, v, lo) => { const ph = u * PB, t0 = thMin(ph), r = rHead(ph, t0) + (K.off ?? 0.006), p = P3(ph, t0, r);
      const o = [Math.sin(ph) * 0.55, 0, Math.cos(ph) * 0.55 + 0.45], ol = Math.hypot(...o), len = L * Math.sqrt(Math.max(0, 1 - Math.pow(Math.abs(u), 2.4) * 0.92)) * v;
      return [p[0] + (o[0] / ol) * len, p[1] - Math.tan(pitch) * len - droop * u * u * v * (0.6 + 0.4 * v) - (lo ? TK : 0), p[2] + (o[2] / ol) * len]; };
    const bTop = [], bBot = [];
    for (let j = 0; j <= NV; j++) { const rt = [], rb = []; for (let i = 0; i <= NU; i++) { const u = -1 + (2 * i) / NU, v = j / NV; rt.push(add(brim(u, v, false), navy.map((c) => c * (0.95 - 0.1 * v)))); rb.push(add(brim(u, v, true), navy.map((c) => c * 0.45))); } bTop.push(rt); bBot.push(rb); }
    for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) { const a = bTop[j][i], b = bTop[j][i + 1], c = bTop[j + 1][i], d = bTop[j + 1][i + 1]; tri.push(a, b, c, b, d, c);
      const e = bBot[j][i], f = bBot[j][i + 1], g = bBot[j + 1][i], h = bBot[j + 1][i + 1]; tri.push(e, g, f, f, g, h); }
    for (let i = 0; i < NU; i++) { const a = bTop[NV][i], b = bTop[NV][i + 1], c = bBot[NV][i], d = bBot[NV][i + 1]; tri.push(a, b, c, b, d, c); }
    for (const j of [0]) for (const i of [0, NU]) { /* ends meet the crown */ }
  } else if (STYLE === 'beanie') {
    // FORGE: a knit beanie: the crown from a band low on the forehead and over the ears' tops to the top of the head,
    // loose (slouch) over the skull, a turned-up cuff (thicker, its own rib), the knit as vertex light: vertical ribs,
    // a row grain, a soft fold at the cuff; an optional pom
    const NR = 26, ring = [], col0 = navy, slouch = K.slouch ?? 0.018, cuffH = K.cuff ?? 0.045;
    const rib = (ph, j, f) => 0.76 + 0.28 * Math.pow(Math.abs(Math.sin(ph * (K.ribs ?? 60) / 2)), 0.6) * f + 0.05 * (hsh(Math.round(ph * 200), j) - 0.5);
    for (let j = -1; j <= NR; j++) { const row = []; for (let i = 0; i < NP; i++) { const ph = (i / NP) * 2 * Math.PI, t0 = thMin(ph), t = Math.max(0, j) / NR, th = t0 + (THN - 0.02 - t0) * t;
      const o = (K.off ?? 0.007) + slouch * Math.sin(Math.min(1, t * 1.15) * Math.PI * 0.9) * (0.6 + 0.4 * Math.max(0, -Math.cos(ph))) + (j < 0 ? -0.004 : 0);
      const r = rHead(ph, th) + o, inCuff = (rHead(ph, th) * Math.sin(th) + C[1]) < cutY(ph) + cuffH;
      const sh = (inCuff ? 0.9 * rib(ph, j, 1) : (0.84 + 0.16 * t) * rib(ph, j, 0.55)) * (j < 0 ? 0.65 : 1);
      row.push(add(P3(ph, th, r + (inCuff ? 0.004 : 0)), col0.map((c) => c * sh), [((i / NP) + 0.5) % 1, inCuff ? 1 - 0.3 * Math.min(1, Math.max(0, (rHead(ph, th) * Math.sin(th) + C[1] - cutY(ph)) / cuffH)) : 0.7 * (1 - t)])); } ring.push(row); }
    for (let j = 0; j < ring.length - 1; j++) for (let i = 0; i < NP; i++) { const a = ring[j][i], b = ring[j][(i + 1) % NP], c = ring[j + 1][i], d = ring[j + 1][(i + 1) % NP]; tri.push(a, c, b, b, c, d); }
    const apex = add([C[0], C[1] + rHead(0, THN - 0.01) + (K.off ?? 0.007) + slouch * 0.3, C[2] - slouch * 0.3], col0.map((c) => c * 0.9));
    { const last = ring[ring.length - 1]; for (let i = 0; i < NP; i++) tri.push(last[i], apex, last[(i + 1) % NP]); }
    if (K.pom) { const top = pts.slice(apex * 3, apex * 3 + 3), R0 = K.pom, SEG = 14, RNG = 10, base = pts.length / 3;
      for (let r = 0; r <= RNG; r++) for (let k = 0; k <= SEG; k++) { const th = (r / RNG) * Math.PI, ph = (k / SEG) * 2 * Math.PI, rr = R0 * (0.85 + 0.3 * hsh(r * 31 + k, 7));
        add([top[0] + rr * Math.sin(th) * Math.cos(ph), top[1] + R0 * 0.8 + rr * Math.cos(th), top[2] + rr * Math.sin(th) * Math.sin(ph)], (K.pomColor || col0).map((c) => c * (0.8 + 0.25 * hsh(k, r)))); }
      for (let r = 0; r < RNG; r++) for (let k = 0; k < SEG; k++) { const a = base + r * (SEG + 1) + k, b = a + SEG + 1; tri.push(a, b, a + 1, a + 1, b, b + 1); } }
  } else if (STYLE === 'peaked') {
    // FORGE: a peaked uniform cap (a doorman's, a chauffeur's): a stiff crown rising straight from the band, flaring to
    // a flat top a little larger than the head and higher in front, a braided band in its own colour, a short glossy
    // peak pitched down over the eyes
    const H = K.crown ?? 0.07, flare = K.flare ?? 0.03, NR = 14, ring = [], bandH = K.bandH ?? 0.03, bandC = K.band || [0.55, 0.42, 0.12], peakC = K.peak || [0.02, 0.02, 0.022];
    const base = (ph) => { const t0 = thMin(ph); return { p: P3(ph, t0, rHead(ph, t0) + (K.off ?? 0.006)), t0 }; };
    const dirOf = (ph) => [Math.sin(ph), 0, Math.cos(ph)];
    for (let j = 0; j <= NR; j++) { const row = []; const t = j / NR; for (let i = 0; i < NP; i++) { const ph = (i / NP) * 2 * Math.PI, { p } = base(ph), d = dirOf(ph);
      const front = 0.5 + 0.5 * Math.cos(ph), up = H * t + 0.012 * front * t, out = flare * Math.pow(t, 1.6) * (0.7 + 0.6 * front);
      const inBand = up < bandH, sh = inBand ? 0.85 + 0.15 * Math.abs(Math.sin(ph * 40 + up * 900)) : 0.8 + 0.2 * t;
      row.push(add([p[0] + d[0] * out, p[1] + up, p[2] + d[2] * out], (inBand ? bandC : navy).map((c) => c * sh))); } ring.push(row); }
    for (let j = 0; j < ring.length - 1; j++) for (let i = 0; i < NP; i++) { const a = ring[j][i], b = ring[j][(i + 1) % NP], c = ring[j + 1][i], d = ring[j + 1][(i + 1) % NP]; tri.push(a, c, b, b, c, d); }
    // (the flat top: a fan from its middle)
    { const last = ring[NR]; let cx = 0, cy = 0, cz = 0; for (const k of last) { cx += pts[k * 3]; cy += pts[k * 3 + 1]; cz += pts[k * 3 + 2]; } const n = last.length, ctr = add([cx / n, cy / n + 0.003, cz / n], navy.map((c) => c * 1.05));
      for (let i = 0; i < NP; i++) tri.push(last[i], ctr, last[(i + 1) % NP]); }
    // (the peak: a thin shell off the band's front, pitched down)
    const PB = K.brimSpan ?? 1.05, NU = 24, NV = 8, L = K.brimLen ?? 0.055, pitch = K.pitch ?? 0.42, TK = 0.003;
    const pk = (u, v, lo) => { const ph = u * PB, { p } = base(ph), d = dirOf(ph), len = L * Math.sqrt(Math.max(0, 1 - Math.pow(Math.abs(u), 2.2) * 0.95)) * v;
      return [p[0] + d[0] * len, p[1] - Math.tan(pitch) * len - (lo ? TK : 0) + 0.002, p[2] + d[2] * len]; };
    const bT = [], bB = [];
    for (let j = 0; j <= NV; j++) { const rt = [], rb = []; for (let i = 0; i <= NU; i++) { const u = -1 + (2 * i) / NU, v = j / NV; rt.push(add(pk(u, v, false), peakC.map((c) => c * (1.2 - 0.2 * v)))); rb.push(add(pk(u, v, true), peakC)); } bT.push(rt); bB.push(rb); }
    for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) { const a = bT[j][i], b = bT[j][i + 1], c = bT[j + 1][i], d = bT[j + 1][i + 1]; tri.push(a, b, c, b, d, c); const e = bB[j][i], f = bB[j][i + 1], g = bB[j + 1][i], h = bB[j + 1][i + 1]; tri.push(e, g, f, f, g, h); }
    for (let i = 0; i < NU; i++) { const a = bT[NV][i], b = bT[NV][i + 1], c = bB[NV][i], d = bB[NV][i + 1]; tri.push(a, b, c, b, d, c); }
    // (a badge: a small gold oval on the band's front)
    { const { p } = base(0), base0 = pts.length / 3, R0 = 0.011; add([p[0], p[1] + bandH * 0.5 + 0.004, p[2] + 0.0035], bandC.map((c) => c * 1.25)); for (let i = 0; i < 18; i++) { const a = (i / 18) * 2 * Math.PI; add([p[0] + R0 * Math.cos(a), p[1] + bandH * 0.5 + 0.004 + R0 * 0.8 * Math.sin(a), p[2] + 0.0025], bandC.map((c) => c * 1.1)); }
      for (let i = 0; i < 18; i++) tri.push(base0, base0 + 1 + i, base0 + 1 + ((i + 1) % 18)); }
  }
  // (smooth normals, area-weighted)
  const N = new Float32Array(pts.length);
  for (let q = 0; q < tri.length; q += 3) { const [a, b, c] = [tri[q], tri[q + 1], tri[q + 2]], A3 = (k) => [pts[k * 3], pts[k * 3 + 1], pts[k * 3 + 2]], pa = A3(a), pb = A3(b), pc = A3(c);
    const u = pb.map((x, k) => x - pa[k]), w = pc.map((x, k) => x - pa[k]), n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    for (const k of [a, b, c]) for (let m = 0; m < 3; m++) N[k * 3 + m] += n[m]; }
  for (let k = 0; k < N.length; k += 3) { const l = Math.hypot(N[k], N[k + 1], N[k + 2]) || 1; N[k] /= l; N[k + 1] /= l; N[k + 2] /= l; }
  const acc = (type, arr) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buf);
  const capM = doc.createMaterial('cap').setRoughnessFactor(K.rough ?? 0.88).setMetallicFactor(0).setDoubleSided(true).setBaseColorFactor([1, 1, 1, 1]);
  const prim = doc.createPrimitive().setAttribute('POSITION', acc('VEC3', Float32Array.from(pts))).setAttribute('NORMAL', acc('VEC3', N)).setAttribute('COLOR_0', acc('VEC4', Float32Array.from(col)))
    .setIndices(acc('SCALAR', pts.length / 3 > 65535 ? Uint32Array.from(tri) : Uint16Array.from(tri))).setMaterial(capM);
  // FORGE v2: a knit beanie's stitches: stockinette Vs over the crown, ribs in the cuff (library.knitTex), as a light map
  // under its colour and a normal map, so it reads knitted up close, not a plain dome (Oh Soon-ja, v1)
  prim.setAttribute('TEXCOORD_0', acc('VEC2', Float32Array.from(uvs)));
  if (K.knit && STYLE === 'beanie') { const kt = knitTex(512, 96, 40, 0.3); capM.setBaseColorTexture(await tex('', await sharp(kt.img, { raw: { width: 512, height: 512, channels: 1 } }).toColourspace('srgb').jpeg({ quality: 90 }).toBuffer(), 'image/jpeg')).setNormalTexture(await tex('', await sharp(kt.nrm, { raw: { width: 512, height: 512, channels: 3 } }).png().toBuffer())); capM.setRoughnessFactor(0.95); }
  capM.setExtras({ layer: 9, kind: 'cloth', garment: STYLE });
  const capNode = doc.createNode('cap').setMesh(doc.createMesh('cap').addPrimitive(prim)).setMatrix(Array.from(skin0.getInverseBindMatrices().getElement(joints.indexOf(headN), [])));
  headN.addChild(capNode);
  console.error('cap made', pts.length / 3, 'points', tri.length / 3, 'tris; band front', (cutY(0) - EY).toFixed(3), 'back', (cutY(Math.PI) - EY).toFixed(3));
}
// (the template's leftovers away: its meshes' primitives, materials and textures, none of them hers)
{ const { prune } = require('@gltf-transform/functions'); const { PropertyType: PT } = require('@gltf-transform/core');
  await doc.transform(prune({ propertyTypes: [PT.MESH, PT.PRIMITIVE, PT.PRIMITIVE_TARGET, PT.MATERIAL, PT.TEXTURE, PT.ACCESSOR, PT.SKIN], keepLeaves: true, keepAttributes: true, keepIndices: true, keepSolidTextures: true })); }
doc.getRoot().getAsset().generator = 'glTF-Transform v4.5.1';
const glb = await io.writeBinary(doc);
const lm = (() => { const lm = findMouth(bPos, skinT, eyesT, EYEFRONT, REF) || {}; return JSON.parse(JSON.stringify({ ...lm, sex: CFG.sex, armSplay: CFG.armSplay || 0, props: CFG.props || [], sheet: CFG.sheetId || null, mouthUsed: CFG.mouth, mouthHalf: CFG.mouthHalf ?? null, eyeFront: EYEFRONT, height: CFG.height, sole: LIB ? Math.max(0, ...LIB.done.map((d) => d.r.report?.soleH ?? 0)) : 0, shoes: LIB?.done.find((d) => d.r.report)?.r.report ?? null })); })();
const info = { face: FACE ? { fields: FACE.fields, totalMm: FACE.totalMm, capped: FACE.log } : null, verts: { body: body.count, pack: pack.count }, tris: { skin: skinT.length / 3, eyes: eyesT.length / 3, brows: browT.length / 3, lashes: lashT.length / 3, lowerLashesCut: lowerCut / 3, hair: hairT.length / 3, wear: wearT.map((t) => t.length / 3), shoes: shoeT.length / 3 },
  eyes: eyeC.map((c) => c.map((x) => +x.toFixed(4))), mouth, height: CFG.height, scale: +sc.toFixed(4), mouthKept: keepMouth.map((k) => k.kind),
  bounds: (() => { let lo = [9, 9, 9], hi = [-9, -9, -9]; for (const P of [body.pos, pack.pos]) for (let i = 0; i < P.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], P[i + k]); hi[k] = Math.max(hi[k], P[i + k]); } return { lo: lo.map((x) => +x.toFixed(3)), hi: hi.map((x) => +x.toFixed(3)) }; })() };
return { glb, lm, info };
}
