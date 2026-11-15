// Comrade1280's packs (CC BY 4.0) -> Mog City's service vehicles: the packs split into their vehicles (every one of them
// written to the staging folder's c1280/ for a look), and the ones the game uses processed like the town cars:
//  - the engine's frame (metres, y up, tyres on y = 0, nose +z, left +x, origin midway between the end axles)
//  - the civil pack's wheels, merged into each body, split out by geometry (connected pieces round each hub)
//  - per vehicle: its body (its own texture, 1024 / 512, its metal-rough as ORM), its lamps (the pack's shared optics
//    texture, each lamp tagged head / tail / indicator by its colour and end), its glass, its decals (alpha), wheels
//  - LOD1 / LOD2: the body and glass simplified (decals and lamps left off)
// node build-c1280.mjs <downloads dir> <out dir> [ids]
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { io, extract, bounds, applyMat, rotY, trans, mul, Bucket, mergeArrays, transformArrays, simplify, writeGLB, sha256, sha1s, compact } from './lib.mjs';

const [SRC, OUT, ONLY] = process.argv.slice(2);
const SPLIT = join(OUT, '..', 'c1280'); mkdirSync(SPLIT, { recursive: true }); mkdirSync(OUT, { recursive: true });
const LAMP = { none: 0, head: 1, tail: 2, brake: 3, blink: 4, reverse: 5, beacon: 6, sign: 7 };
const FLAG = { interior: 1, inner: 2, wheel: 4, glass: 8, plate: 16 };

// the vehicles the game uses: pack, its root node, the engine's id, and flip (its nose the other way along its length)
export const C1280 = {
  bus: { pack: 'civil', root: 'citybus', flip: true }, schoolbus: { pack: 'civil', root: 'school_bus', flip: true }, ambulance: { pack: 'civil', root: 'ambulance' },
  firetruck: { pack: 'civil', root: 'fire_truck', flip: true }, garbage: { pack: 'civil', root: 'garbage_truck' }, mailvan: { pack: 'civil', root: 'postvan' },
  utility: { pack: 'civil', root: 'rdservtruck', flip: true }, tow: { pack: 'civil', root: 'towtruck', flip: true }, police20: { pack: 'civil', root: 'police_sedan', flip: true },
  taxi20: { pack: 'civil', root: 'taxi' }, minivan20: { pack: 'passenger', root: 'minivan body', wheels: /^Wheel_D/ },
};
const PACKS = { civil: 'gm-car-c1280-civil-pack.glb', passenger: 'gm-car-c1280-passenger-pack.glb' };

// connected pieces of a prim (vertices welded by position)
function pieces(p) {
  const n = p.pos.length / 3, key = new Map(), weld = new Int32Array(n);
  for (let i = 0; i < n; i++) { const k = `${Math.round(p.pos[i * 3] * 2000)},${Math.round(p.pos[i * 3 + 1] * 2000)},${Math.round(p.pos[i * 3 + 2] * 2000)}`; let w = key.get(k); if (w === undefined) { w = i; key.set(k, w); } weld[i] = w; }
  const parent = Int32Array.from({ length: n }, (_, i) => i);
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const unite = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[a] = b; };
  for (let t = 0; t < p.idx.length; t += 3) { unite(weld[p.idx[t]], weld[p.idx[t + 1]]); unite(weld[p.idx[t]], weld[p.idx[t + 2]]); }
  const comps = new Map();
  for (let t = 0; t < p.idx.length / 3; t++) { const r = find(weld[p.idx[t * 3]]); let c = comps.get(r); if (!c) comps.set(r, (c = { tris: [], lo: [Infinity, Infinity, Infinity], hi: [-Infinity, -Infinity, -Infinity] })); c.tris.push(t); for (let k = 0; k < 3; k++) { const v = p.idx[t * 3 + k]; for (let a = 0; a < 3; a++) { const x = p.pos[v * 3 + a]; if (x < c.lo[a]) c.lo[a] = x; if (x > c.hi[a]) c.hi[a] = x; } } }
  return [...comps.values()].map((c) => ({ ...c, c: c.lo.map((v, a) => (v + c.hi[a]) / 2), s: c.lo.map((v, a) => c.hi[a] - v) }));
}

async function texture(doc, sha) { for (const t of doc.getRoot().listTextures()) if (sha1s(t.getImage()) === sha) return t.getImage(); return null; }

async function buildOne(id, def, docs) {
  const doc = docs[def.pack];
  const inRoot = (path) => path.includes(def.root);
  let prims = extract(doc, null, (path) => inRoot(path) || (def.wheels && def.wheels.test(path[0])));
  if (def.wheels) {
    // (the passenger pack: the four wheel nodes nearest this body)
    const body = prims.filter((p) => inRoot(p.path)), bb = bounds(body);
    prims = [...body, ...prims.filter((p) => !inRoot(p.path) && Math.hypot(bounds([p]).c[0] - bb.c[0], bounds([p]).c[2] - bb.c[2]) < Math.max(bb.s[0], bb.s[2]) * 0.6)];
  }
  // ---- frame: its length along z (principal axis in the ground plane), the nose by flip ----
  const b0 = bounds(prims);
  let sxx = 0, szz = 0, sxz = 0, n = 0;
  for (const p of prims) for (let i = 0; i < p.pos.length; i += 3) { const x = p.pos[i] - b0.c[0], z = p.pos[i + 2] - b0.c[2]; sxx += x * x; szz += z * z; sxz += x * z; n++; }
  const phi = 0.5 * Math.atan2(2 * sxz, sxx - szz); // the principal axis' angle from +x
  // rotate so the principal axis lies along +z: x' = x cos t + z sin t ... use rotY(theta) mapping the axis (cos phi, sin phi) to (0, 1)
  let theta = -(Math.PI / 2 - phi) * -1; // (rotY(t) maps (cos phi, 0, sin phi) to (cos(phi + t)... ) solved below
  // rotY(t): (x, z) -> (x cos t + z sin t, -x sin t + z cos t). For the axis (cos phi, sin phi): z' = -cos phi sin t + sin phi cos t = sin(phi - t) = 1 -> t = phi - pi/2
  theta = phi - Math.PI / 2;
  applyMat(prims, mul(rotY(theta), trans(-b0.c[0], 0, -b0.c[2])));
  if (def.flip) applyMat(prims, rotY(Math.PI));
  // ---- the parts by material ----
  const kindOf = (p) => /glass/i.test(p.mat) ? 'glass' : /optics/i.test(p.mat) ? 'optics' : /decal/i.test(p.mat) ? 'decal' : /wheel|wheek/i.test(p.mat) || /^Wheel_/.test(p.path[0] || '') ? 'wheel' : 'body';
  const parts = { body: [], glass: [], optics: [], decal: [], wheel: [] };
  for (const p of prims) parts[kindOf(p)].push(p);
  // ---- wheels: separate nodes (passenger pack) or pieces of the body near the ground at its sides (civil pack) ----
  const detect = () => {
    const bb = bounds(prims);
    const wheelPieces = []; // { p, tris, lo, hi, c }
    if (parts.wheel.length) for (const p of parts.wheel) { const b = bounds([p]); wheelPieces.push({ p, tris: null, lo: b.lo, hi: b.hi, c: b.c }); }
    else {
      for (const p of parts.body) for (const c of pieces(p)) {
        // (a piece of a wheel: low (its top under ~1.25 m), at a side, roughly as tall as it is long)
        if (c.hi[1] < 1.25 && c.lo[1] < 0.35 && Math.abs(c.c[0]) > bb.s[0] * 0.18 && c.s[1] > 0.08 && c.s[2] < 1.35 && c.s[2] > 0.05) wheelPieces.push({ p, tris: c.tris, lo: c.lo, hi: c.hi, c: c.c });
      }
    }
    // clusters: same side, overlapping along z
    const clusters = [];
    for (const w of wheelPieces.sort((a, b) => a.c[2] - b.c[2])) {
      const side = Math.sign(w.c[0]);
      let cl = clusters.find((k) => k.side === side && w.c[2] > k.lo[2] - 0.05 && w.c[2] < k.hi[2] + 0.05);
      if (!cl) clusters.push((cl = { side, items: [], lo: [...w.lo], hi: [...w.hi] }));
      cl.items.push(w); for (let a = 0; a < 3; a++) { cl.lo[a] = Math.min(cl.lo[a], w.lo[a]); cl.hi[a] = Math.max(cl.hi[a], w.hi[a]); }
    }
    // (a wheel is about as tall as long; drop slivers)
    const ws = clusters.filter((k) => { const h = k.hi[1] - k.lo[1], l = k.hi[2] - k.lo[2]; return h > 0.35 && Math.abs(h - l) / h < 0.35 && k.lo[1] < 0.1; });
    ws.forEach((k) => (k.c = k.lo.map((v, a) => (v + k.hi[a]) / 2)));
    return ws;
  };
  let wheels = detect();
  // (the length along z exactly: the angle of each axle's left-to-right line, from its pair of wheels, taken out)
  {
    const L = wheels.filter((k) => k.c[0] > 0), R = wheels.filter((k) => k.c[0] < 0), ang = [];
    for (const l of L) { const r = R.reduce((b, k) => (!b || Math.abs(k.c[2] - l.c[2]) < Math.abs(b.c[2] - l.c[2]) ? k : b), null); if (r && Math.abs(r.c[2] - l.c[2]) < 0.6) ang.push(Math.atan2(l.c[2] - r.c[2], l.c[0] - r.c[0])); }
    if (ang.length) { const d = ang.reduce((a, b) => a + b, 0) / ang.length; if (Math.abs(d) > 0.002) { applyMat(prims, rotY(d)); wheels = detect(); } }
  }
  const bb = bounds(prims);
  const axleZ = [...new Set(wheels.map((k) => Math.round(k.c[2] * 4) / 4))];
  // ---- origin: midway between the end axles, track centred, tyres on y = 0 ----
  const zs = wheels.map((k) => k.c[2]), zF = Math.max(...zs), zR = Math.min(...zs);
  const ground = wheels.length ? Math.min(...wheels.map((k) => k.lo[1])) : bb.lo[1];
  const xMid = wheels.length ? (Math.max(...wheels.map((k) => k.hi[0])) + Math.min(...wheels.map((k) => k.lo[0]))) / 2 : 0;
  const T = trans(-xMid, -ground, -(zF + zR) / 2);
  applyMat(prims, T);
  for (const k of wheels) { for (const a of [0, 1, 2]) { const d = [-xMid, -ground, -(zF + zR) / 2][a]; k.lo[a] += d; k.hi[a] += d; k.c[a] += d; } }
  const inWheel = new Map(); // prim -> Set(tri)
  for (const k of wheels) for (const w of k.items) { if (!w.tris) continue; let s = inWheel.get(w.p); if (!s) inWheel.set(w.p, (s = new Set())); for (const t of w.tris) s.add(t); }
  return { id, def, doc, prims, parts, wheels, axleZ, bb: bounds(prims) };
}

// ---- textures: the vehicle's own base (hi 1024 / lo 512), its ORM (512 / 256), its decals (alpha), the shared optics --
async function texFiles(v, out) {
  const files = {};
  const body = v.parts.body[0], decal = v.parts.decal[0];
  const mat = body.matRef, base = mat.getBaseColorTexture(), mr = mat.getMetallicRoughnessTexture();
  for (const [tag, s] of [['', 1024], ['-lo', 512]]) {
    await sharp(Buffer.from(base.getImage())).removeAlpha().resize(s, s, { kernel: 'lanczos3' }).webp({ quality: 85, effort: 6 }).toFile(`${out}/${v.id}${tag}.webp`);
    // (ORM: no occlusion, the metal-rough's roughness (G) and metalness (B), times the material's factors)
    const mrImg = mr ? await sharp(Buffer.from(mr.getImage())).removeAlpha().resize(s / 2, s / 2).raw().toBuffer() : null;
    const o = Buffer.alloc((s / 2) * (s / 2) * 3);
    const rf = mat.getRoughnessFactor(), mf = mat.getMetallicFactor();
    for (let i = 0; i < (s / 2) * (s / 2); i++) { o[i * 3] = 255; o[i * 3 + 1] = mrImg ? Math.round(mrImg[i * 3 + 1] * rf) : Math.round(255 * rf); o[i * 3 + 2] = mrImg ? Math.round(mrImg[i * 3 + 2] * mf) : Math.round(255 * mf); }
    await sharp(o, { raw: { width: s / 2, height: s / 2, channels: 3 } }).webp({ quality: 88 }).toFile(`${out}/${v.id}-orm${tag}.webp`);
    // (decals are lettering: kept sharper than the body: half their own size at 512, all of it at 1024)
    if (decal) { const dt = decal.matRef.getBaseColorTexture(); const m = await sharp(Buffer.from(dt.getImage())).metadata(); const k = s / 1024; await sharp(Buffer.from(dt.getImage())).ensureAlpha().resize(Math.max(128, Math.round(m.width * k)), Math.max(64, Math.round(m.height * k))).webp({ quality: 90, alphaQuality: 95 }).toFile(`${out}/${v.id}-decal${tag}.webp`); }
    files[tag || 'hi'] = true;
  }
  return files;
}

async function finish(v) {
  const { prims, parts, wheels } = v;
  const body = new Bucket('body'), optics = new Bucket('optics'), glass = new Bucket('glass'), decal = new Bucket('decal');
  const wheelTris = new Map(); for (const k of wheels) for (const w of k.items) if (w.tris) { let s = wheelTris.get(w.p); if (!s) wheelTris.set(w.p, (s = new Set())); for (const t of w.tris) s.add(t); }
  for (const p of parts.body) {
    const skip = wheelTris.get(p);
    const tris = []; for (let t = 0; t < p.idx.length / 3; t++) if (!skip || !skip.has(t)) tris.push(t);
    body.add(p, { tris, fl: [0, 0, 0, 0] });
  }
  for (const p of parts.glass) glass.add(p, { fl: [0, 0, 1, FLAG.glass] });
  for (const p of parts.decal) decal.add(p, { fl: [0, 0, 0, 0] });
  // the lamps: by the optics texture's colour under each vertex (red: tail, amber: indicator, clear: head at the front,
  // reverse at the back), the lightbar's blue and red up top: a beacon
  const opt = parts.optics[0] && parts.optics[0].matRef.getBaseColorTexture();
  let img = null, W = 0, H = 0;
  if (opt) { const r = await sharp(Buffer.from(opt.getImage())).removeAlpha().raw().toBuffer({ resolveWithObject: true }); img = r.data; W = r.info.width; H = r.info.height; }
  for (const p of parts.optics) {
    optics.add(p, { fl: (vi) => {
      const u = p.uv[vi * 2] - Math.floor(p.uv[vi * 2]), w = p.uv[vi * 2 + 1] - Math.floor(p.uv[vi * 2 + 1]);
      const o = (Math.min(H - 1, Math.floor(w * H)) * W + Math.min(W - 1, Math.floor(u * W))) * 3, r = img[o], g = img[o + 1], b = img[o + 2];
      const z = p.pos[vi * 3 + 2], y = p.pos[vi * 3 + 1];
      const top = y > v.bb.hi[1] - 0.45;
      let lamp = LAMP.none;
      if (top && (b > r * 1.3 || r > g * 2)) lamp = LAMP.beacon;
      else if (r > 120 && g < r * 0.55) lamp = z > 0 ? LAMP.blink : LAMP.tail;
      else if (r > 140 && g > r * 0.5 && g < r * 0.85 && b < g * 0.6) lamp = LAMP.blink;
      else if (r + g + b > 330) lamp = z > 0 ? LAMP.head : LAMP.reverse;
      return [0, lamp, 0, 0];
    } });
  }
  // wheels: each centred on its hub, the left ones as they are; the first front-left as the mesh (all wheels of a pack
  // vehicle are alike), its rear as another mesh if it differs (a truck's twin rear wheels)
  const wheelArrays = (k) => { const b = new Bucket('w'); for (const w of k.items) b.add(w.p, { tris: w.tris, fl: [0, 0, 0, FLAG.wheel] }); return transformArrays(b.arrays(), trans(-k.c[0], -k.c[1], -k.c[2])); };
  const left = wheels.filter((k) => k.c[0] > 0).sort((a, b) => b.c[2] - a.c[2]);
  const right = wheels.filter((k) => k.c[0] < 0);
  // (the left wheel kept as it is; a right one turned round to face +x if no left one exists)
  const WF = left[0] ? wheelArrays(left[0]) : transformArrays(wheelArrays(right.sort((a, b) => b.c[2] - a.c[2])[0]), rotY(Math.PI));
  const lastL = left[left.length - 1];
  const WR = lastL && lastL !== left[0] ? wheelArrays(lastL) : WF;
  const rOf = (k) => (k.hi[1] - k.lo[1]) / 2, wOf = (k) => k.hi[0] - k.lo[0];
  const sameRear = WR === WF || Math.abs(WR.idx.length - WF.idx.length) < 3;
  const bodyA = body.arrays(), glassA = glass.arrays(), opticsA = optics.arrays(), decalA = decal.arrays();
  // the far LODs: body and glass (dark), the wheels in place
  const placed = wheels.map((k) => { const src = k.c[2] > 0 || sameRear ? WF : WR; return transformArrays(src, mul(trans(k.c[0], k.c[1], k.c[2]), k.c[0] < 0 ? rotY(Math.PI) : rotY(0))); });
  const farGlass = { ...glassA, fl: Uint8Array.from(glassA.fl) };
  const farBase = mergeArrays([bodyA, ...placed]);
  const lod1 = simplify(farBase, 3500, { error: 0.05 });
  let lod2 = simplify(farBase, 700, { error: 0.25 });
  if (lod2.idx.length / 3 > 1100) lod2 = simplify(farBase, 700, { error: 0.5, sloppy: true });
  const lod1g = simplify(farGlass, 120, { error: 0.1 });
  const bb = bounds([{ pos: bodyA.pos }]);
  const r3 = (x) => +x.toFixed(3);
  const fk = left[0] || right[0], rk = lastL || right[right.length - 1];
  const lampAt = (a, id) => { let x = 0, y = 0, z = 0, n = 0; for (let i = 0; i < a.pos.length / 3; i++) if (a.fl[i * 4 + 1] === id && a.pos[i * 3] > 0) { x += a.pos[i * 3]; y += a.pos[i * 3 + 1]; z += a.pos[i * 3 + 2]; n++; } return n ? [r3(x / n), r3(y / n), r3(z / n)] : null; };
  const meta = {
    id: v.id, length: r3(bb.s[2]), width: r3(bb.s[0]), height: r3(bb.hi[1]), zF: r3(bb.hi[2]), zR: r3(bb.lo[2]), hw: r3(Math.max(-bb.lo[0], bb.hi[0])),
    axle: r3((fk.c[2] - rk.c[2]) / 2),
    wheels: { front: { x: r3(Math.abs(fk.c[0])), y: r3(fk.c[1]), z: r3(fk.c[2]), r: r3(rOf(fk)), w: r3(wOf(fk)) }, rear: { x: r3(Math.abs(rk.c[0])), y: r3(rk.c[1]), z: r3(rk.c[2]), r: r3(rOf(rk)), w: r3(wOf(rk)) }, rearMesh: !sameRear,
      extra: wheels.filter((k) => k !== fk && k !== rk && k.c[0] > 0).map((k) => ({ x: r3(Math.abs(k.c[0])), y: r3(k.c[1]), z: r3(k.c[2]), rear: Math.abs(k.c[2] - rk.c[2]) < Math.abs(k.c[2] - fk.c[2]) })) },
    head: lampAt(opticsA, LAMP.head), tail: lampAt(opticsA, LAMP.tail),
    steer: null, livery: null, open: false, paint: null, own: true, decal: decalA.idx.length > 0,
    tris: { lod0: body.tris + glass.tris + optics.tris + decal.tris + wheels.reduce((s, k) => s + k.items.reduce((q, w) => q + (w.tris ? w.tris.length : w.p.idx.length / 3), 0), 0), body: body.tris, glass: glass.tris, optics: optics.tris, decal: decal.tris, wheel: WF.idx.length / 3, wheels: wheels.length, lod1: lod1.idx.length / 3 + lod1g.idx.length / 3, lod2: lod2.idx.length / 3 },
  };
  const meshes = [{ name: 'body', arrays: bodyA, mat: 'own' }, { name: 'glass', arrays: glassA, mat: 'glass' }, { name: 'optics', arrays: opticsA, mat: 'optics' }, { name: 'wheel', arrays: WF, mat: 'own' }];
  if (!sameRear) meshes.push({ name: 'wheelR', arrays: WR, mat: 'own' });
  if (decalA.idx.length) meshes.push({ name: 'decal', arrays: decalA, mat: 'decal' });
  meshes.push({ name: 'lod1', arrays: lod1, mat: 'own' }, { name: 'lod1glass', arrays: lod1g, mat: 'glass' }, { name: 'lod2', arrays: lod2, mat: 'own' });
  return { meta, meshes };
}

const docs = {};
for (const [k, f] of Object.entries(PACKS)) docs[k] = await io.read(join(SRC, f));
const metas = {};
const ids = ONLY ? ONLY.split(',') : Object.keys(C1280);
// the shared optics texture, once
{
  const p = extract(docs.civil, null, (path) => path.includes('citybus')).find((q) => /optics/i.test(q.mat));
  const t = p.matRef.getBaseColorTexture();
  for (const [tag, s] of [['', 512], ['-lo', 256]]) await sharp(Buffer.from(t.getImage())).removeAlpha().resize(s, s, { kernel: 'lanczos3' }).webp({ quality: 86 }).toFile(`${OUT}/c1280-optics${tag}.webp`);
}
for (const id of ids) {
  const def = C1280[id]; if (!def) continue;
  const v = await buildOne(id, def, docs);
  await texFiles(v, OUT);
  const { meta, meshes } = await finish(v);
  const glb = await writeGLB(null, meshes, { fleet: meta });
  writeFileSync(join(OUT, id + '.glb'), glb);
  const src = readFileSync(join(SRC, PACKS[def.pack]));
  meta.bytes = glb.length; meta.sha256 = sha256(glb); meta.source = { file: PACKS[def.pack], sha256: sha256(src), bytes: src.length }; meta.part = def.root;
  metas[id] = meta;
  console.log(id.padEnd(10), `${(glb.length / 1024).toFixed(0)} KB`, `L ${meta.length} W ${meta.width} H ${meta.height} axle ${meta.axle} wheels ${meta.tris.wheels} (axles at ${v.axleZ.join(',')})`, `tris lod0 ${meta.tris.lod0} lod1 ${meta.tris.lod1} lod2 ${meta.tris.lod2}`, 'head', JSON.stringify(meta.head), 'tail', JSON.stringify(meta.tail));
}
writeFileSync(join(OUT, 'c1280-meta.json'), JSON.stringify(metas, null, 1));
