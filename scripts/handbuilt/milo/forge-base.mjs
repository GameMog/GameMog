// Hand-built Milo (Pickup Time, John and Carissa's son, 6): his forge base. The forge's people run 16 to 92 and have no
// child body, so this makes one with the forge's own modules (compile, core, post, diet; scripts/forge is not changed):
// MakeHuman's CC0 macro targets for a child (macrodetails: the ethnic child and baby shapes and the universal
// child/baby average-muscle average-weight shapes, blended about 6 years old) minus the forge base's own young-athlete
// shape (human.ts: the ethnic young shapes, half muscle, the ideal proportions, a little height) are put into the slot
// of the body's 'muscle' morph (the body asset and the clothes-and-hair pack both, read through a wrapped platform), and
// the compiled config dials it to 1 and the height to the child's. So core shapes a child, moves every joint with the
// shape (MakeHuman's own way, as for any sheet), dresses him and fits his hair over the child; post fits the skeleton.
// The pack's points (garments, hair) and the body asset's proxies (eyes rigidly, brows, lashes, hair) take the child
// shape's offsets from the body points nearest them.
//   node scripts/handbuilt/milo/forge-base.mjs <sheet.json> <out.glb> [--baby=0.45] [--height=1.15]
import fs from 'node:fs';
import { nodeEnv } from '../../forge/env-node.mjs';
import { compile } from '../../forge/compile.mjs';
import { core } from '../../forge/core.mjs';
import { post } from '../../forge/post.mjs';
import { diet } from '../../forge/diet.mjs';
import { loadFaceKit, vertexMap, parseTarget } from '../../forge/targets.mjs';
import { uncoveredGlb } from '../../forge/uncovered.mjs';
import { MH_TARGETS } from '../../forge/paths.mjs';

const args = process.argv.slice(2), [sheetF, out] = args.filter((a) => !a.startsWith('--'));
const opt = (k, d) => +(args.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d);
const BABY = opt('baby', 0.45), HEIGHT = opt('height', 1.15), CHILD = 1 - BABY;
const S = JSON.parse(fs.readFileSync(sheetF, 'utf8')), g = S.identity.body === 'female' ? 'female' : 'male';
const env = await nodeEnv(); await loadFaceKit(env);
const TYPES = { Float32Array, Int8Array, Uint8Array, Uint16Array, Int16Array, Uint32Array };
async function asset(dir, file) {
  const J = JSON.parse(await env.text(env.A + dir + '/asset.json')), buf = await env.inflate(await env.bytes(env.A + dir + '/' + file));
  const get = (k) => { const L = J.layout[k], T = TYPES[L.type]; return new T(buf.buffer.slice(buf.byteOffset + L.offset, buf.byteOffset + L.offset + L.length * T.BYTES_PER_ELEMENT)); };
  return { J, buf, get, dir, file };
}
const B = await asset('human-athlete-' + g, 'body.bin.z'), PK = await asset('human-pack-' + g, 'pack.bin.z');
const nB = B.J.vertexCount, nP = PK.J.vertexCount, grp = (A, n) => A.J.groups.find((x) => x.name === n);

/* -- the child shape on MakeHuman's base vertices (m) -- */
const T = (p) => parseTarget(fs.readFileSync(`${MH_TARGETS}/macrodetails/${p}.target`, 'utf8'));
const Dobj = new Map(); const add = (t, w) => { if (!w) return; for (let k = 0; k < t.idx.length; k++) { const i = t.idx[k]; let a = Dobj.get(i); if (!a) Dobj.set(i, (a = [0, 0, 0])); for (let c = 0; c < 3; c++) a[c] += t.d[k * 3 + c] * w; } };
for (const e of ['african', 'asian', 'caucasian']) { add(T(`${e}-${g}-child`), CHILD / 3); add(T(`${e}-${g}-baby`), BABY / 3); add(T(`${e}-${g}-young`), -1 / 3); }
add(T(`universal-${g}-child-averagemuscle-averageweight`), CHILD); add(T(`universal-${g}-baby-averagemuscle-averageweight`), BABY);
add(T(`universal-${g}-young-maxmuscle-averageweight`), -0.5);
add(T(`proportions/${g}-young-maxmuscle-averageweight-idealproportions`), -0.8);
add(T(`height/${g}-young-maxmuscle-averageweight-maxheight`), g === 'male' ? -0.15 : -0.1);
add(T(`proportions/${g}-child-averagemuscle-averageweight-idealproportions`), CHILD * 0.6);

const gB = grp(B, 'body'), bIdx = B.get('index'), bi = bIdx.subarray(gB.start, gB.start + gB.count); let nBody = 0; for (const v of bi) nBody = Math.max(nBody, v + 1);
const map = vertexMap(bi, nBody), P0 = B.get('position');
const DB = new Float32Array(nB * 3);
for (let v = 0; v < nBody; v++) { const a = Dobj.get(map[v]); if (a) for (let c = 0; c < 3; c++) DB[v * 3 + c] = a[c]; }
// (the finger shortening of human.ts is in the base and stays: the child's offsets are added on top of it)

/* -- the rest carried from the nearest body points -- */
const cell = 0.03, G = new Map(), key = (x, y, z) => x + ',' + y + ',' + z;
for (let i = 0; i < nBody; i++) { const k = key(Math.floor(P0[i * 3] / cell), Math.floor(P0[i * 3 + 1] / cell), Math.floor(P0[i * 3 + 2] / cell)); (G.get(k) || G.set(k, []).get(k)).push(i); }
function near(x, y, z) { // the offsets of the 6 nearest body points, by inverse distance
  const cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell);
  for (let R = 1; R <= 6; R++) { const best = [];
    for (let i = -R; i <= R; i++) for (let j = -R; j <= R; j++) for (let k = -R; k <= R; k++) { const L = G.get(key(cx + i, cy + j, cz + k)); if (!L) continue;
      for (const b of L) { const d = Math.hypot(P0[b * 3] - x, P0[b * 3 + 1] - y, P0[b * 3 + 2] - z); best.push([d, b]); } }
    if (best.length < 6) continue; best.sort((a, b) => a[0] - b[0]); const top = best.slice(0, 6); let w = 0; const a = [0, 0, 0];
    for (const [d, b] of top) { const q = 1 / (d + 0.004) ** 2; w += q; for (let c = 0; c < 3; c++) a[c] += DB[b * 3 + c] * q; }
    return a.map((c) => c / w); }
  return [0, 0, 0];
}
const groupVerts = (A, idx, name) => { const x = grp(A, name); return x ? [...new Set(idx.subarray(x.start, x.start + x.count))] : []; };
const bodySet = new Set(bi);
for (const x of B.J.groups) { if (x.name === 'body') continue; const vs = groupVerts(B, bIdx, x.name).filter((v) => !bodySet.has(v));
  if (x.name === 'eyes') { for (const s of [1, -1]) { const side = vs.filter((v) => P0[v * 3] * s > 0), m = [0, 0, 0]; let c0 = [0, 0, 0];
      for (const v of side) for (let c = 0; c < 3; c++) c0[c] += P0[v * 3 + c] / side.length; const a = near(c0[0], c0[1], c0[2] + 0.012);
      for (const v of side) for (let c = 0; c < 3; c++) DB[v * 3 + c] = a[c]; } continue; }
  for (const v of vs) { const a = near(P0[v * 3], P0[v * 3 + 1], P0[v * 3 + 2]); for (let c = 0; c < 3; c++) DB[v * 3 + c] = a[c]; } }
const PP = PK.get('position'), DP = new Float32Array(nP * 3);
for (let v = 0; v < nP; v++) { const a = near(PP[v * 3], PP[v * 3 + 1], PP[v * 3 + 2]); for (let c = 0; c < 3; c++) DP[v * 3 + c] = a[c]; }

/* -- the child made the assets' own base: both assets' positions, the body's skeleton and landmarks, read through a
// wrapped platform (so everything core measures on the base (the library's garments, the hide lists' heights, the
// joints, the face finder's reference) is the child's) -- */
function patched(A, D) {
  const L = A.J.layout.position, nb = new Uint8Array(A.buf); const pos = new Float32Array(nb.buffer, nb.byteOffset + L.offset, L.length);
  let m = 0; for (let i = 0; i < D.length; i++) { pos[i] += D[i]; m = Math.max(m, Math.abs(D[i])); }
  return { J: JSON.parse(JSON.stringify(A.J)), nb, maxMm: m * 1000 };
}
const pb = patched(B, DB), pp = patched(PK, DP);
// (the floor: the child's soles back on y = 0)
{ let minY = 9; for (let v = 0; v < nBody; v++) minY = Math.min(minY, P0[v * 3 + 1] + DB[v * 3 + 1]); for (const [X, n] of [[pb, nB], [pp, nP]]) { const L = X.J.layout.position, pos = new Float32Array(X.nb.buffer, X.nb.byteOffset + L.offset, L.length); for (let i = 0; i < n; i++) pos[i * 3 + 1] -= minY; } for (let v = 0; v < nB; v++) DB[v * 3 + 1] -= minY; console.error('child floor shift', (minY * 1000).toFixed(1), 'mm'); }
// the joints moved with the shape (core's JMOVE way: the mean offset of the body points round each joint, nearer ones
// counting more)
const jm = (h, r) => { let w = 0; const acc = [0, 0, 0]; for (let v = 0; v < nBody; v++) { const d = Math.hypot(P0[v * 3] - h[0], P0[v * 3 + 1] - h[1], P0[v * 3 + 2] - h[2]); if (d > r) continue; const k = (1 - d / r) ** 2; w += k; for (let c = 0; c < 3; c++) acc[c] += DB[v * 3 + c] * k; } return w > 0 ? acc.map((x) => x / w) : r < 0.2 ? jm(h, r * 2) : [0, 0, 0]; }; // (a joint deep in the body (the clavicles) with no skin within r: r doubled)
const JD = new Map();
for (const bn of pb.J.skeleton) { const r = /finger|wrist/.test(bn.name) ? 0.022 : /neck|head|clavicle/.test(bn.name) ? 0.05 : 0.07; for (const e of ['head', 'tail']) { const d = jm(bn[e], r); if (e === 'head') JD.set(bn.name.replace('.', '_'), d); bn[e] = bn[e].map((x, c) => +(x + d[c]).toFixed(5)); } }
for (const [k, y] of Object.entries(B.J.landmarks)) { let s = 0, n = 0; for (let v = 0; v < nBody; v++) if (Math.abs(P0[v * 3 + 1] - y) < 0.012 && Math.abs(P0[v * 3]) < 0.25) { s += DB[v * 3 + 1]; n++; } if (n) pb.J.landmarks[k] = +(y + s / n).toFixed(4); }
if (pb.J.height) { let top = 0; for (let v = 0; v < nBody; v++) top = Math.max(top, P0[v * 3 + 1] + DB[v * 3 + 1]); pb.J.height = +top.toFixed(4); }
console.error('child landmarks', JSON.stringify(pb.J.landmarks), 'height', pb.J.height);
// (the pack's two base morphs (age, weight) are its own; a child is dialled to neither)
const marks = new Map();
const env2 = { ...env,
  text: async (p) => p === env.A + B.dir + '/asset.json' ? JSON.stringify(pb.J) : p === env.A + PK.dir + '/asset.json' ? JSON.stringify(pp.J) : env.text(p),
  bytes: async (p) => { if (p === env.A + B.dir + '/' + B.file || p === env.A + PK.dir + '/' + PK.file) { const u = new Uint8Array(1); marks.set(u, p.endsWith(B.file) ? pb.nb : pp.nb); return u; } return env.bytes(p); },
  inflate: async (u) => marks.get(u) || env.inflate(u) };

const { cfg } = compile(S);
cfg.muscle = 0; cfg.lean = 0; cfg.age = 0; cfg.weight = 0; cfg.height = HEIGHT;
const logs = [], env3 = { ...env2, log: (...a) => logs.push(a.join(' ')) };
const a = await core(cfg, env3);
// (core's own joint refit (JMOVE) sees no shape, the base being the child already: each joint's bind moved here by the
// child's offset at it, as core moves them, before post fits the skeleton)
{ const io = new env.IO().registerExtensions(env.gltf.extensions.ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': env.meshopt.MeshoptDecoder, 'meshopt.encoder': env.meshopt.MeshoptEncoder });
  const d0 = await io.readBinary(a.glb), skin = d0.getRoot().listSkins()[0], J = skin.listJoints(), ibmA = skin.getInverseBindMatrices(), ibm = ibmA.getArray().slice(); let n = 0;
  J.forEach((j, k) => { const d = JD.get(j.getName()); if (!d) return; n++; new env.THREE.Matrix4().fromArray(ibm, k * 16).multiply(new env.THREE.Matrix4().makeTranslation(-d[0], -d[1], -d[2])).toArray(ibm, k * 16); });
  ibmA.setArray(ibm); a.glb = await io.writeBinary(d0); console.error('child joints moved', n, 'of', J.length, 'clav', JSON.stringify(JD.get('clavicle_L')), 'head', JSON.stringify(JD.get('head'))); }
const b = await post(a.glb, a.lm, env3); const glb = await diet(b.glb, env3);
const unc = await uncoveredGlb(glb, env);
fs.writeFileSync(out, glb); fs.writeFileSync(out.replace(/\.glb$/, '.core.log'), logs.join('\n'));
console.log(out, (glb.length / 1048576).toFixed(2), 'MB', 'child offsets max', pb.maxMm.toFixed(0), 'mm', 'uncovered', unc.pass, JSON.stringify(unc.worst), 'hands', JSON.stringify(b.report.hands), 'wear', JSON.stringify(cfg.wear), 'lib', JSON.stringify((cfg.lib || []).map((l) => l.item)));
