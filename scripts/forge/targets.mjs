// THE CHARACTER FORGE: MakeHuman's CC0 face targets behind the sheet's face fields (forge v2, 4 Nov 2026).
// MakeHuman's modelling targets (nose, eyes, mouth, chin, cheeks, ears, head, forehead, eyebrows) are sparse offsets on
// its base mesh, in decimetres. GameMog's body asset IS that base mesh (scripts/assets/human.ts: the 'body' group's
// faces in base.obj order, each (vertex, uv) pair one vertex), so each target lands on our body by a vertex map rebuilt
// here from the same faces; nothing is approximated. The eyeballs, brows, lashes and the hair (proxies fitted to the
// body) follow the skin under them (carry()).
// Caps (compile.mjs's rule, kept; widened in v2.5): each field's largest move <= 5 mm, their sum <= 28 mm, and no point
// moved more than 8 mm by them all together. A field is a
// sheet word (nose width, lips, ears ...) that may use several targets; its cap is measured on the shaped body, in mm.
// Sources: the targets come from the approved download (CC0, see downloads/SOURCES.md). FB (browser port): kit.mjs packs
// the ones the library uses, already parsed, with base.obj's body corners, into public/storykit/forge/kit/ (face-kit.*),
// so the forge reads the same numbers in Node and in a creator's browser; nothing here touches a file system.
//   loadFaceKit(env) once before applyFace (env: the forge's platform, env-node.mjs / env-browser.mjs)
// (where kit.mjs reads the targets and base.obj from: paths.mjs, FORGE_MH_TARGETS / FORGE_MH_BASE)
const DM = 0.1;

/* ---------------------------------------------------------------- the library -- */
// Each sheet field: its words, each a list of [target, weight]. A left/right pair is written 'l|r-...' (both sides; the
// sides get slightly different weights by the face's own seed: real faces are not mirror images).
const T = (n) => n; // (names relative to the targets folder, without .target)
export const FACE_LIB = {
  noseWidth: { narrow: [['nose/nose-scale-horiz-decr', 0.55], ['nose/nose-nostrils-width-decr', 0.4]], average: [], wide: [['nose/nose-scale-horiz-incr', 0.5], ['nose/nose-flaring-incr', 0.45], ['nose/nose-nostrils-width-incr', 0.35]] },
  noseLength: { short: [['nose/nose-scale-vert-decr', 0.5], ['nose/nose-scale-depth-decr', 0.35]], average: [], long: [['nose/nose-scale-vert-incr', 0.5], ['nose/nose-scale-depth-incr', 0.3]] },
  noseTip: { upturned: [['nose/nose-point-up', 0.6], ['nose/nose-septumangle-incr', 0.3]], average: [], drooping: [['nose/nose-point-down', 0.55], ['nose/nose-septumangle-decr', 0.3]] },
  noseBridge: { straight: [], hump: [['nose/nose-hump-incr', 0.7]], concave: [['nose/nose-curve-concave', 0.6]], greek: [['nose/nose-greek-incr', 0.6]], flat: [['nose/nose-compression-compress', 0.5], ['nose/nose-hump-decr', 0.3]] },
  cheekbones: { flat: [['l|r-cheek-bones-decr', 0.6]], average: [], high: [['l|r-cheek-bones-incr', 0.7], ['l|r-cheek-trans-up', 0.25]] },
  cheekVolume: { hollow: [['l|r-cheek-volume-decr', 0.7], ['l|r-cheek-inner-decr', 0.4]], average: [], full: [['l|r-cheek-volume-incr', 0.6], ['l|r-cheek-inner-incr', 0.35]], jowly: [['l|r-cheek-volume-incr', 0.8], ['neck/neck-double-incr', 0.35]] },
  faceWidth: { narrow: [['head/head-scale-horiz-decr', 0.35]], average: [], wide: [['head/head-scale-horiz-incr', 0.35], ['chin/chin-width-incr', 0.3]] },
  browRidge: { soft: [['forehead/forehead-nubian-decr', 0.5], ['eyebrows/eyebrows-trans-backward', 0.4]], average: [], strong: [['forehead/forehead-nubian-incr', 0.45], ['eyebrows/eyebrows-trans-forward', 0.55]] },
  chin: { receding: [['chin/chin-prominent-decr', 0.6], ['chin/chin-prognathism-decr', 0.35]], average: [], strong: [['chin/chin-prominent-incr', 0.6], ['chin/chin-prognathism-incr', 0.3]] },
  chinLength: { short: [['chin/chin-height-decr', 0.6]], average: [], long: [['chin/chin-height-incr', 0.6]] },
  chinWidth: { narrow: [['chin/chin-width-decr', 0.6], ['chin/chin-triangle', 0.3]], average: [], wide: [['chin/chin-width-incr', 0.6], ['chin/chin-bones-incr', 0.3]] },
  chinCleft: { none: [], cleft: [['chin/chin-cleft-incr', 0.8]] },
  eyeShape: {
    almond: [['eyes/l|r-eye-corner1-down', 0.3], ['eyes/l|r-eye-corner2-up', 0.35]],
    round: [['eyes/l|r-eye-height2-incr', 0.55], ['eyes/l|r-eye-height1-incr', 0.3]],
    hooded: [['eyes/l|r-eye-eyefold-down', 0.65], ['eyes/l|r-eye-eyefold-convex', 0.35]],
    'deep-set': [['eyes/l|r-eye-push1-in', 0.5], ['eyes/l|r-eye-eyefold-concave', 0.4]],
    downturned: [['eyes/l|r-eye-corner2-down', 0.6], ['eyes/l|r-eye-eyefold-angle-down', 0.35]],
    upturned: [['eyes/l|r-eye-corner2-up', 0.6], ['eyes/l|r-eye-eyefold-angle-up', 0.35]],
    monolid: [['eyes/l|r-eye-epicanthus-in', 0.55], ['eyes/l|r-eye-eyefold-down', 0.5]],
    average: [],
  },
  eyeBags: { none: [], light: [['eyes/l|r-eye-bag-incr', 0.4]], heavy: [['eyes/l|r-eye-bag-incr', 0.75], ['eyes/l|r-eye-bag-height-incr', 0.4]] },
  mouthWidth: { narrow: [['mouth/mouth-scale-horiz-decr', 0.55]], average: [], wide: [['mouth/mouth-scale-horiz-incr', 0.55]] },
  lips: { thin: [['mouth/mouth-upperlip-volume-decr', 0.6], ['mouth/mouth-lowerlip-volume-decr', 0.55]], average: [], full: [['mouth/mouth-upperlip-volume-incr', 0.55], ['mouth/mouth-lowerlip-volume-incr', 0.6]] },
  cupidsBow: { soft: [['mouth/mouth-cupidsbow-decr', 0.6]], average: [], defined: [['mouth/mouth-cupidsbow-incr', 0.7]] },
  // (FC, talking faces: every word lifts the corners some. Face.js opens the jaw with a soft split toward the corners, so
  // the corners' skin goes down with it: MakeHuman's angles-down at 0.55 read as a grimace in every talking frame
  // (mechanic, Sal, cop), and even a neutral mouth's corner tips sank to the opening's bottom. Measured by the talk
  // gate's corners on the mechanic: angles-down 0.12 -> 0.63 of the opening's height, angles-up 0.5 -> 0.53. 'down' is
  // now the least lift (a stern mouth at rest), 'up' the most. G7a: 'down' 0.32 -> 0.40: the mechanic's mouth at 0.32
  // still read turned down at rest in every round-6 close-up (neutral 0.45))
  mouthCorners: { down: [['mouth/mouth-angles-up', 0.4]], neutral: [['mouth/mouth-angles-up', 0.45]], up: [['mouth/mouth-angles-up', 0.62]] },
  earSize: { small: [['ears/l|r-ear-scale-decr', 0.55]], average: [], large: [['ears/l|r-ear-scale-incr', 0.5], ['ears/l|r-ear-lobe-incr', 0.4]] },
  earShape: { round: [['ears/l|r-ear-shape-round', 0.6]], pointed: [['ears/l|r-ear-shape-pointed', 0.45]], square: [['ears/l|r-ear-shape-square', 0.6]], average: [] },
  earAngle: { flat: [['ears/l|r-ear-wing-decr', 0.6]], average: [], protruding: [['ears/l|r-ear-wing-incr', 0.55], ['ears/l|r-ear-flap-incr', 0.35]] },
  skull: { oval: [['head/head-oval', 0.5]], round: [['head/head-round', 0.5]], square: [['head/head-square', 0.5]], long: [['head/head-rectangular', 0.45], ['head/head-scale-vert-incr', 0.25]], heart: [['head/head-invertedtriangular', 0.45]], average: [] },
  skullBack: { flat: [['head/head-back-scale-depth-decr', 0.6]], average: [], full: [['head/head-back-scale-depth-incr', 0.6]] },
  forehead: { low: [['forehead/forehead-scale-vert-decr', 0.6]], average: [], high: [['forehead/forehead-scale-vert-incr', 0.6]], sloped: [['forehead/forehead-trans-backward', 0.5]] },
  // (forge v2.5, MV: three more fields, so two faces from the same heritage need not twin: the eyes' spacing (the eyes
  // and their sockets moved in or out; the eyeballs are carried whole), the jaw's width at its angle (the jaw bones, not
  // the chin), the face's length (the whole head, top to chin))
  eyeSpacing: { close: [['eyes/l|r-eye-trans-in', 0.75]], average: [], wide: [['eyes/l|r-eye-trans-out', 0.75]] },
  jawWidth: { narrow: [['chin/chin-bones-decr', 0.75], ['head/head-invertedtriangular', 0.2]], average: [], wide: [['chin/chin-bones-incr', 0.8], ['head/head-square', 0.25]] },
  faceLength: { short: [['head/head-scale-vert-decr', 0.5], ['chin/chin-height-decr', 0.3]], average: [], long: [['head/head-scale-vert-incr', 0.5], ['chin/chin-height-incr', 0.3]] },
};
// the face's own small marks, picked by its seed from these (never named by the sheet): two faces from the same words
// still differ, the way two brothers do
const INDIVIDUAL = [
  ['nose/nose-hump-incr', 0.35], ['nose/nose-nostrils-angle-up', 0.4], ['nose/nose-nostrils-angle-down', 0.4], ['nose/nose-point-width-incr', 0.4], ['nose/nose-point-width-decr', 0.4],
  ['nose/nose-trans-up', 0.3], ['nose/nose-trans-down', 0.3], ['mouth/mouth-cupidsbow-width-incr', 0.4], ['mouth/mouth-cupidsbow-width-decr', 0.4], ['mouth/mouth-philtrum-volume-incr', 0.4],
  ['mouth/mouth-dimples-in', 0.4], ['mouth/mouth-laugh-lines-in', 0.4], ['mouth/mouth-lowerlip-middle-down', 0.35], ['mouth/mouth-upperlip-middle-up', 0.35], ['chin/chin-jaw-drop-incr', 0.3],
  ['eyebrows/eyebrows-angle-up', 0.4], ['eyebrows/eyebrows-angle-down', 0.4], ['forehead/forehead-temple-incr', 0.35], ['forehead/forehead-temple-decr', 0.35],
  ['ears/l|r-ear-lobe-decr', 0.4], ['ears/l|r-ear-rot-backward', 0.35], ['eyes/l|r-eye-corner1-up', 0.3], ['eyes/l|r-eye-height3-decr', 0.3], ['l|r-cheek-trans-down', 0.3],
];
export const FIELDS = Object.keys(FACE_LIB);
// (MV: the caps widened from 3.5 mm a field / 12 mm summed to 5 mm a field / 28 mm summed, and a new cap on what a
// point actually moves (peak: the fields together, at the point that moves most) of 8 mm: at the old caps a sheet's
// words moved its face too little to tell two men of one heritage apart (the club promoter and the young hero, GR), and
// a sum of each field's own largest move over-counts fields that move different parts of the face. Still capped: no
// caricature)
export const CAP = { field: 0.005, total: 0.028, peak: 0.008, individual: 0.003 };

// a seeded random in [0, 1) from a string (the sheet id): the same id, the same face
export function seeded(id) { let h = 2166136261 >>> 0; for (const ch of String(id)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return () => { h ^= h << 13; h >>>= 0; h ^= h >>> 17; h ^= h << 5; h >>>= 0; return (h % 1e6) / 1e6; }; }

// compile's side: the sheet's face words -> { field: [[target, weight], ...] } plus the seeded marks (sides split)
export function faceRecipe(F = {}, id = 'x') {
  const rnd = seeded(id + ':face'), out = {}, unknown = [];
  const side = (list) => list.flatMap(([n, w]) => { if (!n.includes('l|r-')) return [[n, w]]; const a = 1 + (rnd() - 0.5) * 0.3, b = 1 + (rnd() - 0.5) * 0.3;
    // ('l|r-cheek-...' lives in cheek/; the others carry their folder)
    const dir = n.includes('/') ? '' : 'cheek/'; return [[dir + n.replace('l|r-', 'l-'), w * a], [dir + n.replace('l|r-', 'r-'), w * b]]; });
  for (const [field, words] of Object.entries(FACE_LIB)) { const word = F[field]; if (word == null || word === 'average' || word === 'none' || word === 'straight' || (word === 'neutral' && field !== 'mouthCorners')) continue;
    if (!words[word]) { unknown.push(`${field}:${word}`); continue; } out[field] = side(words[word]); }
  // (the marks: 4 of them, small)
  const pool = INDIVIDUAL.slice(), marks = [];
  for (let k = 0; k < 4 && pool.length; k++) { const i = Math.floor(rnd() * pool.length), [n, w] = pool.splice(i, 1)[0]; marks.push(...side([[n, w * (0.5 + 0.5 * rnd())]])); }
  out.individual = marks;
  return { fields: out, unknown };
}

/* ---------------------------------------------------------------- the build -- */
// (the kit's parsers, used by kit.mjs on the download; the forge itself only reads the packed kit)
export function parseTarget(text) {
  const idx = [], d = [];
  for (const line of text.split('\n')) { if (!line || line[0] === '#') continue; const p = line.trim().split(/\s+/); if (p.length < 4) continue; idx.push(+p[0]); d.push(+p[1] * DM, +p[2] * DM, +p[3] * DM); }
  return { idx: Int32Array.from(idx), d: Float32Array.from(d) };
}
// base.obj's 'body' group's triangle corners (quads split 0-1-2 / 0-2-3, as human.ts addPart does)
export function parseBodyCorners(objText) {
  let group = 'default'; const corners = [];
  for (const line of objText.split('\n')) { if (line.startsWith('g ')) { group = line.trim().split(/\s+/)[1]; continue; } if (!line.startsWith('f ') || group !== 'body') continue;
    const v = line.trim().split(/\s+/).slice(1).map((s) => +s.split('/')[0] - 1);
    if (v.length === 4) corners.push(v[0], v[1], v[2], v[0], v[2], v[3]); else if (v.length === 3) corners.push(v[0], v[1], v[2]); }
  return Int32Array.from(corners);
}
// every target the library can ask for (both sides of each 'l|r-' pair)
export function allTargetNames() {
  const out = new Set(), add = (n) => { if (!n.includes('l|r-')) return out.add(n); const dir = n.includes('/') ? '' : 'cheek/'; out.add(dir + n.replace('l|r-', 'l-')); out.add(dir + n.replace('l|r-', 'r-')); };
  for (const words of Object.values(FACE_LIB)) for (const list of Object.values(words)) for (const [n] of list) add(n);
  for (const [n] of INDIVIDUAL) add(n);
  return [...out].sort();
}
// the packed kit: face-kit.json { targets: { name: [idxOffset, count] }, corners: [offset, count] } + face-kit.bin.z
// (zlib: the corners as Int32, then each target's indices (Int32) and offsets (Float32, xyz))
let KIT = null;
export async function loadFaceKit(env) {
  if (KIT) return KIT;
  const J = JSON.parse(await env.text(env.K + 'face-kit.json')), buf = await env.inflate(await env.bytes(env.K + 'face-kit.bin.z'));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), targets = new Map();
  for (const [name, [o, n]] of Object.entries(J.targets)) targets.set(name, { idx: new Int32Array(ab, o, n), d: new Float32Array(ab, o + n * 4, n * 3) });
  KIT = { corners: new Int32Array(ab, J.corners[0], J.corners[1]), targets };
  return KIT;
}
function readTarget(name) {
  if (!KIT) throw new Error('face targets: loadFaceKit(env) first');
  const t = KIT.targets.get(name); if (!t) throw new Error('face target missing from the kit: ' + name); return t;
}
// our body's vertex -> MakeHuman's base vertex: the 'body' group's triangles walk base.obj's body faces in order
// (human.ts addPart: quads split 0-1-2 / 0-2-3), so the k-th corner of our index is the k-th corner there
export function vertexMap(bodyIndex, nBody) {
  if (!KIT) throw new Error('face targets: loadFaceKit(env) first');
  const corners = KIT.corners;
  if (corners.length !== bodyIndex.length) throw new Error(`face targets: base.obj body corners ${corners.length} != asset body index ${bodyIndex.length}`);
  const map = new Int32Array(nBody).fill(-1); let bad = 0;
  for (let k = 0; k < corners.length; k++) { const a = bodyIndex[k]; if (map[a] < 0) map[a] = corners[k]; else if (map[a] !== corners[k]) bad++; }
  if (bad) throw new Error('face targets: vertex map inconsistent at ' + bad + ' corners');
  return map;
}
// one field's offsets on our body (m), from its targets
function fieldDelta(list, map, nBody) {
  const inv = new Map(); for (let i = 0; i < nBody; i++) { if (map[i] < 0) continue; const m = map[i]; (inv.get(m) || inv.set(m, []).get(m)).push(i); }
  const D = new Float32Array(nBody * 3);
  for (const [name, w] of list) { const t = readTarget(name); for (let k = 0; k < t.idx.length; k++) { const our = inv.get(t.idx[k]); if (!our) continue; for (const i of our) { D[i * 3] += t.d[k * 3] * w; D[i * 3 + 1] += t.d[k * 3 + 1] * w; D[i * 3 + 2] += t.d[k * 3 + 2] * w; } } }
  return D;
}
const maxLen = (D) => { let m = 0; for (let i = 0; i < D.length; i += 3) m = Math.max(m, Math.hypot(D[i], D[i + 1], D[i + 2])); return m; };
// apply: { fields } (from faceRecipe) onto P (our shaped positions, body verts first); returns the total offset field
// and the log. extraMm: the hand sculpts' own share of the 28 mm (they count against it too)
export function applyFace(P, bodyIndex, nBody, recipe, extraMm = 0) {
  const map = vertexMap(bodyIndex, nBody), log = [], parts = [];
  for (const [field, list] of Object.entries(recipe.fields || {})) { if (!list.length) continue; const D = fieldDelta(list, map, nBody), m = maxLen(D); if (m <= 0) continue;
    const cap = field === 'individual' ? CAP.individual : CAP.field, k = m > cap ? cap / m : 1; if (k < 1) log.push(`face ${field} ${(m * 1000).toFixed(1)} mm -> ${(cap * 1000).toFixed(1)} mm`);
    parts.push({ field, D, mm: m * k * 1000, k }); }
  const sum = parts.reduce((a, p) => a + p.mm, 0) + extraMm, kt = sum > CAP.total * 1000 ? (CAP.total * 1000 - extraMm) / (sum - extraMm) : 1;
  if (kt < 1) log.push(`face total ${sum.toFixed(1)} mm -> ${(CAP.total * 1000).toFixed(1)} mm`);
  const D = new Float32Array(nBody * 3);
  for (const p of parts) { const k = p.k * Math.max(0, kt); p.mm *= Math.max(0, kt); for (let i = 0; i < D.length; i++) D[i] += p.D[i] * k; }
  { const pk = maxLen(D); if (pk > CAP.peak) { const k = CAP.peak / pk; for (let i = 0; i < D.length; i++) D[i] *= k; for (const p of parts) p.mm *= k; log.push(`face peak ${(pk * 1000).toFixed(1)} mm -> ${(CAP.peak * 1000).toFixed(1)} mm`); } }
  for (let i = 0; i < D.length; i++) P[i] += D[i];
  return { D, log, fields: Object.fromEntries(parts.map((p) => [p.field, +p.mm.toFixed(2)])), totalMm: +parts.reduce((a, p) => a + p.mm, 0).toFixed(2), moved: (() => { let n = 0; for (let i = 0; i < D.length; i += 3) if (D[i] || D[i + 1] || D[i + 2]) n++; return n; })() };
}
// the proxies on the face (eyes, brows, lashes, hair) moved as the skin under them moved: each point by the offsets of
// the body points within r of it (nearer ones counting more). rigid: a set moved as one (an eyeball keeps its shape)
export function carry(Pbody0, D, nBody, P, verts, r = 0.012, rigid = false) {
  const cell = r, G = new Map(), key = (x, y, z) => Math.floor(x / cell) + ',' + Math.floor(y / cell) + ',' + Math.floor(z / cell);
  for (let i = 0; i < nBody; i++) { if (!(D[i * 3] || D[i * 3 + 1] || D[i * 3 + 2])) continue; const k = key(Pbody0[i * 3], Pbody0[i * 3 + 1], Pbody0[i * 3 + 2]); (G.get(k) || G.set(k, []).get(k)).push(i); }
  const mv = new Map();
  for (const v of verts) { const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2], cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell); let w = 0; const a = [0, 0, 0];
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) { const L = G.get((cx + i) + ',' + (cy + j) + ',' + (cz + k)); if (!L) continue;
      for (const b of L) { const d = Math.hypot(Pbody0[b * 3] - x, Pbody0[b * 3 + 1] - y, Pbody0[b * 3 + 2] - z); if (d > r) continue; const q = (1 - d / r) ** 2; w += q; for (let c = 0; c < 3; c++) a[c] += D[b * 3 + c] * q; } }
    if (w > 0) mv.set(v, a.map((c) => c / w)); }
  if (rigid) { const m = [0, 0, 0]; let n = 0; for (const a of mv.values()) { for (let c = 0; c < 3; c++) m[c] += a[c]; n++; } if (!n) return 0; for (const v of verts) for (let c = 0; c < 3; c++) P[v * 3 + c] += m[c] / n; return verts.length; }
  for (const [v, a] of mv) for (let c = 0; c < 3; c++) P[v * 3 + c] += a[c];
  return mv.size;
}
