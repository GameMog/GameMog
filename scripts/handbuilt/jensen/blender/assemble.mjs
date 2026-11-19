// Jensen's Blender parts on his game body (the build's last step; parts.mjs writes the part files):
//   stripOld(doc)        out with the round-3 hair (the strand cards and their cap), the forge's brows, the frames.mjs
//                        glasses and the library jacket (uniform, uniform-hem, uniform-collar): the parts replace them
//   addParts(doc, dir)   the jacket, the hair and cap, the card brows and the glasses, each its own skinned node on his
//                        skin (joints re-bound by name), carried onto this head (warpPart: each point moved as the skin
//                        near it moved between the head the part was fitted on and this one; the glasses as one rigid
//                        piece); the brows' 33 face targets carried from this skin (as blender/hair/build_glb.mjs did)
//   writeKept(doc, src)  young-hero/glb.mjs's write, but the nodes matched by object (the old ones keep their exact
//                        transforms as read, the new ones are written as made), so nodes can be added and removed
// Original work; the parts' own credits are in storykit/handbuilt/jensen/CREDITS.md.
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { read, io, require, prim, PropertyType } from '../../young-hero/glb.mjs';
const { EXTMeshoptCompression, KHRMeshQuantization } = require('@gltf-transform/extensions');
const { copyToDocument, prune } = require('@gltf-transform/functions');

const OLD_PRIMS = /^(hair|hairCap|brows|glasses|lens-edges|lenses)$/, OLD_NODES = /^(uniform|uniform-hem|uniform-collar)$/;
let ORIG = null; // node -> its transform as read (index order of the source glb)
export function keepOrder(doc) { ORIG = new Map(doc.getRoot().listNodes().map((n, i) => [n, i])); }

export function stripOld(doc) {
  const R = doc.getRoot(); let np = 0, nn = 0;
  for (const m of R.listMeshes()) for (const p of m.listPrimitives()) if (OLD_PRIMS.test(p.getMaterial()?.getName() || '')) { m.removePrimitive(p); p.dispose(); np++; }
  for (const n of R.listNodes()) if (OLD_NODES.test(n.getName())) { const m = n.getMesh(); n.dispose(); if (m && !R.listNodes().some((o) => o.getMesh() === m)) m.dispose(); nn++; }
  console.log('strip: primitives', np, 'nodes', nn);
}

// the body's skin primitive (the largest 'skin' one) and the points it uses
function skinOf(doc) {
  const sk = prim(doc, 'skin').sort((a, b) => b.getIndices().getCount() - a.getIndices().getCount())[0];
  return { sk, P: sk.getAttribute('POSITION').getArray(), used: [...new Set(sk.getIndices().getArray())] };
}
// a point grid for nearest searches (cell c metres): the K nearest within ring 1, else ring 3, else none (a point that
// far from the body keeps its place)
function grid(P, ids, c) {
  const G = new Map(), key = (i, j, k) => `${i},${j},${k}`;
  for (const v of ids) { const k = key(Math.floor(P[v * 3] / c), Math.floor(P[v * 3 + 1] / c), Math.floor(P[v * 3 + 2] / c)); (G.get(k) || G.set(k, []).get(k)).push(v); }
  const near = (x, y, z, K) => { const i0 = Math.floor(x / c), j0 = Math.floor(y / c), k0 = Math.floor(z / c);
    for (const r of [1, 3]) { const best = [];
      for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) for (let e = -r; e <= r; e++) { const L = G.get(key(i0 + a, j0 + b, k0 + e)); if (!L) continue;
        for (const v of L) best.push([(P[v * 3] - x) ** 2 + (P[v * 3 + 1] - y) ** 2 + (P[v * 3 + 2] - z) ** 2, v]); }
      if (best.length >= K) { best.sort((p, q) => p[0] - q[0]); return best.slice(0, K); } }
    return []; };
  return { near };
}
// each point of a part moved as the skin near it moved (inverse-distance mean of the 8 nearest skin points' moves);
// a rigid part by the mean of its points' moves
function warpPart(mesh, fit, cur, rigid) {
  const { P: Pn } = cur, Po = fit, G = grid(Po, Array.from({ length: Po.length / 3 }, (_, i) => i), 0.015), prims = mesh.listPrimitives(); let maxD = 0, n = 0; const mean = [0, 0, 0];
  const moves = prims.map((p) => { const A = p.getAttribute('POSITION').getArray(), N = A.length / 3, D = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { const nb = G.near(A[i * 3], A[i * 3 + 1], A[i * 3 + 2], 8); let w = 1e-9; const s = [0, 0, 0];
      for (const [d2, v] of nb) { const q = 1 / (d2 + 1e-6); w += q; for (let k = 0; k < 3; k++) s[k] += (Pn[v * 3 + k] - Po[v * 3 + k]) * q; }
      for (let k = 0; k < 3; k++) { D[i * 3 + k] = s[k] / w; mean[k] += D[i * 3 + k]; } n++; }
    return D; });
  for (let k = 0; k < 3; k++) mean[k] /= Math.max(1, n);
  prims.forEach((p, j) => { const acc = p.getAttribute('POSITION'), A = acc.getArray().slice(), D = moves[j];
    for (let i = 0; i < A.length / 3; i++) { const d = rigid ? mean : [D[i * 3], D[i * 3 + 1], D[i * 3 + 2]]; for (let k = 0; k < 3; k++) A[i * 3 + k] += d[k]; maxD = Math.max(maxD, Math.hypot(...d)); }
    acc.setArray(A); });
  return { maxD, mean };
}
// the brows' face targets from this skin: each brow point carries the deltas of the skin under it (every skin point within
// 8 mm and not below it, weight (1 - d/r)^2), as blender/hair/build_glb.mjs; on a blink only half (the lids pull the brow
// skin down ~5 mm, and the cards stand off it: at full they dropped like a frown)
function browTargets(doc, mesh, cur, names, K = { r: 0.008, blink: 0.5 }) {
  const { sk, P: SP, used } = cur, TD = sk.listTargets().map((t) => t.getAttribute('POSITION').getArray()), buf = doc.getRoot().listBuffers()[0];
  const cell = K.r, G = new Map(), key = (x, y, z) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
  for (const v of used) { const k = key(SP[v * 3], SP[v * 3 + 1], SP[v * 3 + 2]); (G.get(k) || G.set(k, []).get(k)).push(v); }
  const skNames = doc.getRoot().listMeshes().find((m) => m.listPrimitives().includes(sk)).getExtras().targetNames;
  for (const p of mesh.listPrimitives()) {
    const B = p.getAttribute('POSITION').getArray(), n = B.length / 3;
    for (const t of p.listTargets()) { p.removeTarget(t); t.dispose(); }
    for (const nm of names) { const ti = skNames.indexOf(nm); if (ti < 0) throw new Error('brows: the skin has no target ' + nm); const Dt = TD[ti], out = new Float32Array(n * 3), damp = /^eyeBlink/.test(nm) ? K.blink : 1;
      for (let i = 0; i < n; i++) { const x = B[i * 3], y = B[i * 3 + 1], z = B[i * 3 + 2]; let w = 0; const s = [0, 0, 0];
        for (let a = -1; a <= 1; a++) for (let c = -1; c <= 1; c++) for (let e = -1; e <= 1; e++) { const L = G.get(`${Math.floor(x / cell) + a},${Math.floor(y / cell) + c},${Math.floor(z / cell) + e}`); if (!L) continue;
          for (const v of L) { if (SP[v * 3 + 1] < y - 0.001) continue; const d = Math.hypot(SP[v * 3] - x, SP[v * 3 + 1] - y, SP[v * 3 + 2] - z); if (d > K.r) continue; const q = (1 - d / K.r) ** 2; w += q; for (let k = 0; k < 3; k++) s[k] += Dt[v * 3 + k] * q; } }
        if (w > 0) for (let k = 0; k < 3; k++) out[i * 3 + k] = s[k] / w * damp; }
      p.addTarget(doc.createPrimitiveTarget(nm).setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(out).setBuffer(buf))); }
  }
  mesh.setWeights(names.map(() => 0)).setExtras({ ...mesh.getExtras(), targetNames: names });
}

const NODE = { 'moto-jacket': 'moto-jacket', hair: 'jensen-hair', brows: 'jensen-brows', glasses: 'glasses' };
export async function addParts(doc, dir, files = ['jacket.glb', 'hair.glb', 'glasses.glb']) {
  const R = doc.getRoot(), skin = R.listSkins()[0], jn = skin.listJoints().map((j) => j.getName()), buf = R.listBuffers()[0];
  const cur = skinOf(doc), names = R.listMeshes().find((m) => m.listPrimitives().includes(cur.sk)).getExtras().targetNames;
  // (the parts' nodes beside the body's: under the body node's parent, or in the scene)
  const bodyNode = R.listNodes().find((n) => n.getMesh()?.listPrimitives().includes(cur.sk)), parent = bodyNode.getParentNode(), scene = R.listScenes()[0];
  const fits = new Map();
  for (const f of files) {
    // (JH_PARTS_PARTIAL=1: a part not made yet is left out, for a head to fit it on)
    if (process.env.JH_PARTS_PARTIAL === '1' && !fs.existsSync(path.join(dir, f))) { console.log('part', f, 'missing: left out'); continue; }
    const { doc: pd } = await read(path.join(dir, f));
    for (const pm of pd.getRoot().listMeshes()) {
      const map = copyToDocument(doc, pd, [pm]), m = map.get(pm), ex = m.getExtras(), pj = ex.joints;
      // (the copy's accessors into the body's one buffer)
      for (const p of m.listPrimitives()) { for (const a of [p.getIndices(), ...p.listAttributes(), ...p.listTargets().flatMap((t) => t.listAttributes())]) a?.setBuffer(buf);
        // (joints re-bound by name)
        const J = p.getAttribute('JOINTS_0'); if (!J) throw new Error(`${f}: ${m.getName()} has no joints`);
        const ja = J.getArray().slice(); for (let i = 0; i < ja.length; i++) { const k = jn.indexOf(pj[ja[i]]); if (k < 0) throw new Error(`${f}: joint ${pj[ja[i]]} not in his skin`); ja[i] = k; }
        if (jn.length > 255 && ja instanceof Uint8Array) J.setArray(Uint16Array.from(ja)); else J.setArray(ja); }
      if (!fits.has(ex.fit)) { const b = zlib.gunzipSync(fs.readFileSync(path.join(dir, ex.fit))); fits.set(ex.fit, new Float32Array(b.buffer, b.byteOffset, b.length / 4)); }
      const fit = fits.get(ex.fit); if (fit.length !== cur.P.length) throw new Error(`${ex.fit}: ${fit.length / 3} points, his body has ${cur.P.length / 3}`);
      const w = warpPart(m, fit, cur, !!ex.rigid);
      if (m.getName() === 'brows') browTargets(doc, m, cur, names);
      const e2 = { ...m.getExtras() }; delete e2.joints; delete e2.fit; delete e2.rigid; m.setExtras(e2);
      const node = doc.createNode(NODE[m.getName()] || m.getName()).setMesh(m).setSkin(skin); (parent || scene).addChild(node);
      console.log('part', f, m.getName(), 'prims', m.listPrimitives().length, 'moved up to', (w.maxD * 1000).toFixed(1), 'mm', ex.rigid ? `(rigid, ${w.mean.map((x) => (x * 1000).toFixed(2)).join(',')} mm)` : '');
    }
  }
  for (const b of R.listBuffers()) if (b !== buf) b.dispose();
  await doc.transform(prune({ propertyTypes: [PropertyType.ACCESSOR, PropertyType.MATERIAL, PropertyType.TEXTURE, PropertyType.MESH], keepAttributes: true, keepIndices: true, keepLeaves: true, keepSolidTextures: true }));
}

const readJson = (g) => { const L = g.readUInt32LE(12); return JSON.parse(g.subarray(20, 20 + L).toString('utf8')); };
function writeJson(g, json) {
  const L0 = g.readUInt32LE(12), rest = g.subarray(20 + L0); let s = Buffer.from(JSON.stringify(json), 'utf8');
  const pad = (4 - (s.length % 4)) % 4; s = Buffer.concat([s, Buffer.alloc(pad, 0x20)]);
  const head = Buffer.alloc(20); head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(20 + s.length + rest.length, 8); head.writeUInt32LE(s.length, 12); head.writeUInt32LE(0x4e4f534a, 16);
  return Buffer.concat([head, s, rest]);
}
// (glb.mjs's encoder writes 'TRIANGLES' index streams as 'INDICES': the JSON said so after the fact)
export function patchModes(glb) { const json = readJson(glb); let n = 0; for (const bv of json.bufferViews || []) { const e = bv.extensions?.EXT_meshopt_compression; if (e && e.mode === 'TRIANGLES') { e.mode = 'INDICES'; n++; } } return n ? writeJson(glb, json) : glb; }
export async function writeKept(doc, src) {
  if (!ORIG) throw new Error('writeKept: keepOrder(doc) was not called before the nodes changed');
  for (const e of doc.getRoot().listExtensionsUsed()) if (/meshopt|quantization/i.test(e.extensionName)) e.dispose();
  doc.createExtension(KHRMeshQuantization).setRequired(true);
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
  const nodes = doc.getRoot().listNodes(), glb = Buffer.from(await io.writeBinary(doc)), json = readJson(glb), sj = readJson(src);
  for (const bv of json.bufferViews) { const e = bv.extensions?.EXT_meshopt_compression; if (e && e.mode === 'TRIANGLES') e.mode = 'INDICES'; }
  if (json.nodes.length !== nodes.length) throw new Error('node count changed in writing');
  json.nodes.forEach((nd, i) => { const o = ORIG.get(nodes[i]); if (o === undefined) return; if ((nd.name ?? '') !== (sj.nodes[o].name ?? '')) throw new Error('node order: ' + nd.name);
    for (const k of ['translation', 'rotation', 'scale', 'matrix']) { delete nd[k]; if (sj.nodes[o][k]) nd[k] = sj.nodes[o][k]; } });
  return writeJson(glb, json);
}

// The owner, 18 Nov: "still looks like Jensen is hiding something underneath his jacket ... they should be smooth front
// surfaces". flatFront(doc, K): the jacket's front hangs FLAT from the chest to the hem, tapering a little (taper metres
// in at the hem), each vertical column of the front (1 cm in x) pulled in to a straight line from its own chest point
// (the most forward point between yc0 and yc1), never pushed out; every point within depth of the front surface moves
// with it (the zip, the pockets' hardware, the rolled hem), the back and the sleeves stay. The jeans' and the tee's
// waist below the hem (the belly that showed under it) pulled in behind the hem the same way.
// (iteration 2: the jacket is cut flat in Blender itself (blender/jacket common.flatten_front, its hem band 4 mm clear of
// the waist pulled in here, its sim's collider): K.jacket false leaves it as made, only the waist under it is pulled in)
export function flatFront(doc, K = {}) {
  K = { yc0: 1.27, yc1: 1.37, taper: 0.006, depth: 0.045, xIn: 0.14, xOut: 0.19, under: 0.007, y0: 0.885, y1: 0.935, jacket: false, ...K };
  const R = doc.getRoot(), jm = R.listMeshes().find((m) => m.getName() === 'moto-jacket'); if (!jm) throw new Error('flatFront: no moto-jacket');
  const C = 0.01, col = (x) => Math.round(x / C), fade = (x) => { const a = Math.abs(x); return a <= K.xIn ? 1 : a >= K.xOut ? 0 : 1 - (a - K.xIn) / (K.xOut - K.xIn); };
  const leather = jm.listPrimitives().find((p) => p.getMaterial()?.getName() === 'leather') || jm.listPrimitives()[0];
  const LP = leather.getAttribute('POSITION').getArray();
  // the front surface: the most forward z per (column, 1 cm row); the chest point per column; the hem's height
  const zmax = new Map(), chest = new Map(); let hem = 9;
  for (let i = 0; i < LP.length / 3; i++) { const x = LP[i * 3], y = LP[i * 3 + 1], z = LP[i * 3 + 2]; if (Math.abs(x) > K.xOut + C || z < 0) continue; hem = Math.min(hem, y);
    const k = col(x) + ',' + Math.round(y / C); zmax.set(k, Math.max(zmax.get(k) ?? -9, z)); if (y >= K.yc0 && y <= K.yc1) chest.set(col(x), Math.max(chest.get(col(x)) ?? -9, z)); }
  const yc = (K.yc0 + K.yc1) / 2, T = (x, y) => { const c = chest.get(col(x)); return c === undefined ? 9 : c - K.taper * Math.max(0, Math.min(1, (yc - y) / (yc - hem))); };
  const front = (x, y) => { let m = -9; for (const dy of [-1, 0, 1]) m = Math.max(m, zmax.get(col(x) + ',' + (Math.round(y / C) + dy)) ?? -9); return m; };
  let maxIn = 0, n = 0; const moved = new Set();
  if (K.jacket) for (const p of jm.listPrimitives()) { const acc = p.getAttribute('POSITION'); if (moved.has(acc)) continue; moved.add(acc); const A = acc.getArray().slice();
    for (let i = 0; i < A.length / 3; i++) { const x = A[i * 3], y = A[i * 3 + 1], z = A[i * 3 + 2]; if (y >= yc || z < 0) continue; const f = fade(x); if (!f) continue;
      const fz = front(x, y); if (fz < -1) continue; const over = fz - T(x, y); if (over <= 0) continue;
      const w = Math.max(0, Math.min(1, 1 - (fz - z) / K.depth)) * f * Math.min(1, (yc - y) / 0.03); if (!w) continue; A[i * 3 + 2] = z - over * w; maxIn = Math.max(maxIn, over * w); n++; }
    acc.setArray(A); }
  // the jeans' and the tee's front under the hem: behind the new hem by K.under, blended in from y0 to y1
  let maxJ = 0, nj = 0; const seen = new Set();
  for (const m of R.listMeshes()) for (const p of m.listPrimitives()) { if (p.getMaterial()?.getName() !== 'clothes') continue; const acc = p.getAttribute('POSITION'); if (seen.has(acc)) continue; seen.add(acc);
    const A = acc.getArray().slice(), used = new Set(R.listMeshes().flatMap((mm) => mm.listPrimitives()).filter((q) => q.getAttribute('POSITION') === acc && q.getMaterial()?.getName() === 'clothes').flatMap((q) => [...q.getIndices().getArray()]));
    for (const i of used) { const x = A[i * 3], y = A[i * 3 + 1], z = A[i * 3 + 2]; if (y < K.y0 || y > yc || z < 0) continue; const f = fade(x); if (!f) continue;
      const lim = T(x, hem) - K.under; if (lim > 1) continue; const over = z - lim; if (over <= 0) continue; const w = f * Math.min(1, (y - K.y0) / (K.y1 - K.y0)); A[i * 3 + 2] = z - over * w; maxJ = Math.max(maxJ, over * w); nj++; }
    acc.setArray(A); }
  console.log('flat front: jacket points', n, 'in up to', (maxIn * 1000).toFixed(1), 'mm; hem', hem.toFixed(3), '; waist points', nj, 'in up to', (maxJ * 1000).toFixed(1), 'mm');
}

// The hair's look in the engine (assembly, iteration 1): Mog City's strand shader eases the coverage over +-0.2 round the
// cut, so at the part's 0.3 the cards' faint tips stood out of the top as a spiky crew cut, and its silver read white
// in the game's light: the cut raised (shorter, softer ends) and the colour taken down to a silver-grey.
export function hairLook(doc, K = {}) {
  K = { cut: 0.46, tint: [0.8, 0.8, 0.81], ...K };
  for (const m of doc.getRoot().listMaterials()) if (m.getName() === 'hair') { m.setAlphaCutoff(K.cut); const c = m.getBaseColorFactor(); m.setBaseColorFactor([c[0] * K.tint[0], c[1] * K.tint[1], c[2] * K.tint[2], c[3]]); console.log('hair look: cut', K.cut, 'colour', m.getBaseColorFactor().map((x) => x.toFixed(2)).join(',')); }
}

// The hair combed back (assembly, iteration 1): in the engine the front and top cards stood up off the hairline like a
// brush (the owner: "not a spiky crew cut"; his hair lifts up and BACK, soft): each card point moved back (and a little
// down) by how far along its strand it is (t, from the atlas: the root at each 256x1024 tile's bottom, 2 rows), the
// tips most, over the front and top of the head (z from z0 to z1 in bind space), so the strands lie back over each other.
export function combBack(doc, K = {}) {
  K = { back: 0.024, down: 0.006, pow: 1.5, z0: -0.01, z1: 0.07, ...K };
  const m = doc.getRoot().listMeshes().find((q) => q.getName() === 'hair'); if (!m) return;
  for (const p of m.listPrimitives()) { if (p.getMaterial()?.getName() !== 'hair') continue;
    const acc = p.getAttribute('POSITION'), A = acc.getArray().slice(), U = p.getAttribute('TEXCOORD_0').getArray(); let mx = 0;
    for (let i = 0; i < A.length / 3; i++) { const v = U[i * 2 + 1], r = v < 0.5 ? 0 : 1, t = Math.max(0, Math.min(1, (r * 0.5 + 0.5 - v) / 0.5)), z = A[i * 3 + 2];
      const w = Math.max(0, Math.min(1, (z - K.z0) / (K.z1 - K.z0))) * t ** K.pow; if (!w) continue;
      A[i * 3 + 2] -= K.back * w; A[i * 3 + 1] -= K.down * w; mx = Math.max(mx, w); }
    acc.setArray(A); console.log('comb back:', K.back * mx * 1000, 'mm at most'); }
}

// The tee's hem under the jacket (iteration 2): the tee (the pack's layer-2 'clothes', garment male_casualsuit06) flares
// out to 15.4 cm in front of his middle at y 0.975-1.01, in front of the flat leather front (the black band under the
// iteration-1 hem, and a hump to push the jacket over): every tee triangle wholly below K.y (all under the jacket) out.
export function teeUnder(doc, K = {}) {
  K = { y: 1.05, ...K }; let n = 0;
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) { const mt = p.getMaterial(), ex = mt?.getExtras() || {};
    if (mt?.getName() !== 'clothes' || ex.layer !== 2 || !/casualsuit06/.test(ex.garment || '')) continue;
    const P = p.getAttribute('POSITION').getArray(), I = p.getIndices(), A = I.getArray(), out = [];
    for (let t = 0; t < A.length; t += 3) { if ([A[t], A[t + 1], A[t + 2]].every((v) => P[v * 3 + 1] < K.y)) { n++; continue; } out.push(A[t], A[t + 1], A[t + 2]); }
    I.setArray(new A.constructor(out)); }
  console.log('tee under the jacket: triangles out', n);
}

// The neck's skin under the lower band collar (iteration 2): the forge cut the skin away under the library jacket's
// collar, its edge a saw-tooth ring round the neck at y 1.44 (front) to 1.54 (sides); the Blender collar, 15% lower, left
// the teeth and the dark inside of the neck showing over its band at the sides. A skirt of skin hung from that edge: each
// edge point copied K.drop metres down (and K.in toward the neck's axis, under the collar), every attribute and face target
// copied from its edge point, so the neck reads whole down into the collar. Its own primitive, the skin's material, after
// the face targets (it carries all of them).
export function neckSkirt(doc, K = {}) {
  K = { drop: 0.05, in: 0.006, rings: 2, yMax: 1.56, xMax: 0.1, holeMax: 16, ...K };
  const R = doc.getRoot(), body = R.listMeshes().find((m) => m.getExtras().targetNames && m.listPrimitives().some((p) => p.getMaterial()?.getName() === 'skin'));
  const sks = body.listPrimitives().filter((p) => p.getMaterial()?.getName() === 'skin');
  const main = sks.slice().sort((a, b) => b.getIndices().getCount() - a.getIndices().getCount())[0], P = main.getAttribute('POSITION').getArray();
  const pk = (A, v) => `${Math.round(A[v * 3] * 1e5)},${Math.round(A[v * 3 + 1] * 1e5)},${Math.round(A[v * 3 + 2] * 1e5)}`;
  // edges by position (uv seams split points), each with the main primitive's point and its winding
  const E = new Map(), mainOf = new Map(); for (let v = 0; v < P.length / 3; v++) if (!mainOf.has(pk(P, v))) mainOf.set(pk(P, v), v);
  for (const p of sks) { const A = p.getAttribute('POSITION').getArray(), I = p.getIndices().getArray();
    for (let t = 0; t < I.length; t += 3) for (let e = 0; e < 3; e++) { const ka = pk(A, I[t + e]), kb = pk(A, I[t + (e + 1) % 3]); if (ka === kb) continue; const k = ka < kb ? ka + '|' + kb : kb + '|' + ka;
      const o = E.get(k); if (o) o.n++; else E.set(k, { n: 1, ka, kb }); } }
  const used = new Set(main.getIndices().getArray());
  const pts = (k) => mainOf.get(k);
  const bnd = [...E.values()].filter((e) => { if (e.n !== 1) return false; const a = pts(e.ka), b = pts(e.kb); if (a === undefined || b === undefined) return false;
    return [a, b].every((v) => P[v * 3 + 1] < K.yMax && P[v * 3 + 1] > 1.3 && Math.abs(P[v * 3]) < K.xMax); });
  // the neck ring: the boundary chain through the lowest front point
  const adj = new Map(); for (const e of bnd) { (adj.get(e.ka) || adj.set(e.ka, []).get(e.ka)).push(e); (adj.get(e.kb) || adj.set(e.kb, []).get(e.kb)).push(e); }
  let start = null; for (const e of bnd) { const a = pts(e.ka); if (!start || (P[a * 3 + 2] > 0 && P[a * 3 + 1] < P[pts(start.ka) * 3 + 1])) start = e; }
  const ring = new Set(), stack = [start]; while (stack.length) { const e = stack.pop(); if (ring.has(e)) continue; ring.add(e); for (const k of [e.ka, e.kb]) for (const f of adj.get(k)) if (!ring.has(f)) stack.push(f); }
  // (the small holes left beside it, under the ears behind the jaw (the neck-hole fill's slivers): each closed by a fan
  // round a new middle point, one triangle per hole edge, wound as the reverse of the skin triangle the edge bounds)
  const holes = []; { const left = bnd.filter((e) => !ring.has(e));
    const W = new Set(); for (const p of sks) { const A = p.getAttribute('POSITION').getArray(), Ix = p.getIndices().getArray(); for (let t = 0; t < Ix.length; t += 3) for (let e = 0; e < 3; e++) W.add(pk(A, Ix[t + e]) + '>' + pk(A, Ix[t + (e + 1) % 3])); }
    const comp = new Map(); for (const e of left) { const c = new Set([e]); for (const f of left) if (f !== e && [f.ka, f.kb].some((k) => k === e.ka || k === e.kb)) c.add(f); comp.set(e, c); }
    const done = new Set(); for (const e of left) { if (done.has(e)) continue; const C = new Set(), st = [e]; while (st.length) { const x = st.pop(); if (C.has(x)) continue; C.add(x); done.add(x); for (const y of comp.get(x)) if (!C.has(y)) st.push(y); }
      if (C.size > K.holeMax) continue; const ed = [...C].map((x) => (W.has(x.ka + '>' + x.kb) ? [x.kb, x.ka] : [x.ka, x.kb])); holes.push({ ed, keys: [...new Set(ed.flat())] }); } }
  // the neck's axis (its middle in x and z) from the ring
  let cx = 0, cz = 0, nk = 0; for (const e of ring) { const a = pts(e.ka); cx += P[a * 3]; cz += P[a * 3 + 2]; nk++; } cx /= nk; cz /= nk;
  // new points: ring point i, level r (0 = the edge itself)
  const keys = [...new Set([...ring].flatMap((e) => [e.ka, e.kb]))], slot = new Map(keys.map((k, i) => [k, i])), L = K.rings + 1, N = keys.length * L + holes.reduce((a, h) => a + h.keys.length + 1, 0);
  const src = []; for (let r = 0; r < L; r++) for (const k of keys) src.push(pts(k));
  const holeAt = holes.map((h) => { const at = src.length; for (const k of h.keys) src.push(pts(k)); src.push(pts(h.keys[0])); return at; });
  const buf = P.constructor === Float32Array ? main.getAttribute('POSITION').getBuffer() : null, pr = doc.createPrimitive().setMaterial(main.getMaterial());
  for (const name of main.listSemantics()) { const acc = main.getAttribute(name), old = acc.getArray(), es = acc.getElementSize(), out = new old.constructor(N * es);
    src.forEach((v, j) => { for (let c = 0; c < es; c++) out[j * es + c] = old[v * es + c]; });
    if (name === 'POSITION') for (let j = 0; j < keys.length * L; j++) { const r = Math.floor(j / keys.length) / K.rings; if (!r) continue; const x = out[j * 3], z = out[j * 3 + 2], d = Math.hypot(x - cx, z - cz) || 1;
      out[j * 3 + 1] -= K.drop * r; out[j * 3] -= ((x - cx) / d) * K.in * r; out[j * 3 + 2] -= ((z - cz) / d) * K.in * r; }
    // (each hole's middle point: the mean of its edge points)
    if (name === 'POSITION') holes.forEach((h, i) => { const at = holeAt[i], n = h.keys.length, m = [0, 0, 0]; for (let j = 0; j < n; j++) for (let c = 0; c < 3; c++) m[c] += out[(at + j) * 3 + c] / n; for (let c = 0; c < 3; c++) out[(at + n) * 3 + c] = m[c]; });
    const na = doc.createAccessor().setType(acc.getType()).setArray(out).setBuffer(buf); if (acc.getNormalized()) na.setNormalized(true); pr.setAttribute(name, na); }
  // quads, wound against the skin triangle each edge belongs to (its edge runs the other way in the skirt)
  const I = []; const win = new Map();
  { const A = P, Ix = main.getIndices().getArray(); for (let t = 0; t < Ix.length; t += 3) for (let e = 0; e < 3; e++) win.set(pk(A, Ix[t + e]) + '>' + pk(A, Ix[t + (e + 1) % 3]), 1); }
  for (const p of sks) if (p !== main) { const A = p.getAttribute('POSITION').getArray(), Ix = p.getIndices().getArray(); for (let t = 0; t < Ix.length; t += 3) for (let e = 0; e < 3; e++) win.set(pk(A, Ix[t + e]) + '>' + pk(A, Ix[t + (e + 1) % 3]), 1); }
  for (const e of ring) { let [ka, kb] = [e.ka, e.kb]; if (!win.has(ka + '>' + kb)) [ka, kb] = [kb, ka];
    const a = slot.get(ka), b = slot.get(kb), M = keys.length;
    for (let r = 0; r < K.rings; r++) { const a0 = a + r * M, b0 = b + r * M, a1 = a0 + M, b1 = b0 + M; I.push(b0, a0, a1, b0, a1, b1); } }
  holes.forEach((h, i) => { const at = holeAt[i], ix = new Map(h.keys.map((k, j) => [k, at + j])), mid = at + h.keys.length; for (const [a, b] of h.ed) I.push(ix.get(a), ix.get(b), mid); });
  pr.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint16Array(I)).setBuffer(buf));
  for (const t of main.listTargets()) { const D = t.getAttribute('POSITION').getArray(), out = new Float32Array(N * 3); src.forEach((v, j) => { for (let c = 0; c < 3; c++) out[j * 3 + c] = D[v * 3 + c]; });
    pr.addTarget(doc.createPrimitiveTarget(t.getName()).setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(out).setBuffer(buf))); }
  body.addPrimitive(pr);
  let ylo = 9, yhi = -9; for (const k of keys) { const y = P[pts(k) * 3 + 1]; ylo = Math.min(ylo, y); yhi = Math.max(yhi, y); }
  console.log('neck skirt: holes closed', holes.map((h) => h.ed.length).join(','), '; ring edges', ring.size, 'of', bnd.length, 'boundary edges; edge y', ylo.toFixed(3), '-', yhi.toFixed(3), '; axis', cx.toFixed(3), cz.toFixed(3), '; tris', I.length / 3);
}

// His posture (iteration 2, the owner's plumb line: the ear over the shoulder over the hip, no forward head, the chest
// relaxed, seated upright): Dan's idle, talk, phone, arms, sitTalk and sit with the spine pitched over the hips, the neck
// and head over the shoulders and the arms counter-turned so they still hang (blender/jacket posture.py, s97_clips.mjs),
// carried in his own GLB: Mog City plays a body's own clips before Dan's (storyrun/cast.js), so only he changes.
export async function ownClips(doc, file, names = ['idle', 'talk', 'phone', 'arms', 'sitTalk', 'sit']) {
  const { doc: cd } = await read(file), R = doc.getRoot(), buf = R.listBuffers()[0];
  const byName = new Map(R.listNodes().map((n) => [n.getName(), n]));
  for (const a of R.listAnimations()) if (names.includes(a.getName())) a.dispose();
  let nc = 0;
  for (const src of cd.getRoot().listAnimations()) { if (!names.includes(src.getName())) continue;
    const an = doc.createAnimation(src.getName()), done = new Map();
    for (const ch of src.listChannels()) { const node = byName.get(ch.getTargetNode()?.getName()); if (!node) continue;
      const s = ch.getSampler(); let ns = done.get(s);
      if (!ns) { const cp = (acc) => doc.createAccessor().setType(acc.getType()).setArray(acc.getArray().slice()).setBuffer(buf);
        ns = doc.createAnimationSampler().setInput(cp(s.getInput())).setOutput(cp(s.getOutput())).setInterpolation(s.getInterpolation()); an.addSampler(ns); done.set(s, ns); }
      an.addChannel(doc.createAnimationChannel().setTargetNode(node).setTargetPath(ch.getTargetPath()).setSampler(ns)); nc++; }
  }
  console.log('own clips:', R.listAnimations().map((a) => a.getName()).join(' '), '; channels', nc);
}

// The lens panes out (iteration 2): Mog City casts a shadow from every mesh of a cast body (storyrun/cast.js: castShadow
// on all), a clear pane's too, so the panes laid a grey band over his eyes and upper cheeks in every lit shot. The rimless
// lens shows as its polished edge (glasses-lens-edge) and the bar; the panes come back when the engine stops shadows from
// see-through materials.
export function lensPanes(doc, K = {}) {
  if (K.keep) return; let n = 0;
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) if (p.getMaterial()?.getName() === 'glasses-lens') { m.removePrimitive(p); p.dispose(); n++; }
  console.log('lens panes out:', n);
}
