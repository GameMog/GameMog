// Daniel Zhabotinsky's cars (CC BY 4.0) -> Mog City's fleet models. For each car:
//  - its parts flattened into the engine's frame: metres, y up, the nose to +z, the left side (+x), the tyres on y = 0,
//    the origin midway between the axles on the track's middle
//  - every badge mesh dropped (the shared badge atlas is never shipped); the number plates' characters dropped (only the
//    blank plate backings kept); the tyre's sidewall lettering and the liveries' stickers, slogans and numbers cleaned
//  - one opaque mesh on the shared kit atlas (body paint flagged, its colour the car's own; lamps tagged by kind), one
//    glass mesh, one wheel (and a rear one where it differs) centred on its hub, the outer face to +x
//  - LOD1 (~4k tris, wheels and glass merged, no cabin or underbody) and LOD2 (~700 tris)
// node build-dz.mjs <downloads dir> <out dir> <crop dir> [ids]
import { mkdirSync, writeFileSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { io, extract, bounds, applyMat, rotY, trans, mul, Bucket, mergeArrays, transformArrays, simplify, writeGLB, sha256, sha1s, compact } from './lib.mjs';
import { KIT, LIVERY, TILES, atlasUV, buildKit, buildLiveries } from './kit.mjs';

const [SRC, OUT, CROPS, ONLY] = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });
const TEX = join(OUT, '..', 'kit-src'); mkdirSync(TEX, { recursive: true });

// id: source file, the procedural body it stands for (the engine's fallback), and a few flags
export const DZ = {
  gt95: { file: 'gm-car-saba-v12-95' }, turbo81: { file: 'gm-car-hazer-turbo-81' }, sport99: { file: 'gm-car-jdm-sport-99' },
  gt83: { file: 'gm-car-tiara-gt-83' }, roadster00: { file: 'gm-car-roadster-00', open: true }, muscle69: { file: 'gm-car-duke-69' },
  sedan10: { file: 'gm-car-kiri-10' }, hatch11: { file: 'gm-car-ace-11' }, city07: { file: 'gm-car-compact-07' },
  sedan80: { file: 'gm-car-negotiator-80' }, suv10: { file: 'gm-car-urban-10' }, van92: { file: 'gm-car-shvan-92' },
  pickup89: { file: 'gm-car-conquer-89-pickup' }, taxi75: { file: 'gm-car-canyon-75-taxi', livery: 'taxi' },
  police90: { file: 'gm-car-illinois-90-police', livery: 'police' }, box95: { file: 'gm-car-lct-3000-95' },
};
// lettering and emblems cut as geometry inside other parts (not on the badge atlas): each a part and the centre of the
// piece to drop, in the download's own frame (found with the raw model, tools/vehicles: scan-box)
const EMBLEMS = {
  hatch11: [{ part: /bumper_front_inner/, c: [1.86, 0.62, -0.23], r: 0.06, max: 0.05 }],   // (its model's name on the grille)
  taxi75: [{ part: /hood_inner/, c: [2.54, 1.02, 0], r: 0.04, max: 0.2 }, { part: /trunkdoor_inner/, c: [-2.36, 1.06, 0], r: 0.04, max: 0.2 }],   // (a maker-like crest, nose and tail)
  sedan80: [{ part: /bottom/, c: [2.24, 0.87, 0], r: 0.04, max: 0.1 }],   // (the stand-up hood ornament)
};
// connected pieces of a prim (vertices welded by position): [{ tris, c, size }]
function pieces(p) {
  const n = p.pos.length / 3, key = new Map(), weld = new Int32Array(n);
  for (let i = 0; i < n; i++) { const k = `${Math.round(p.pos[i * 3] * 4000)},${Math.round(p.pos[i * 3 + 1] * 4000)},${Math.round(p.pos[i * 3 + 2] * 4000)}`; let w = key.get(k); if (w === undefined) { w = i; key.set(k, w); } weld[i] = w; }
  const parent = Int32Array.from({ length: n }, (_, i) => i);
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  for (let t = 0; t < p.idx.length; t += 3) { const a = find(weld[p.idx[t]]), b = find(weld[p.idx[t + 1]]), c = find(weld[p.idx[t + 2]]); parent[a] = c; parent[b] = c; }
  const comps = new Map();
  for (let t = 0; t < p.idx.length / 3; t++) { const r = find(weld[p.idx[t * 3]]); let c = comps.get(r); if (!c) comps.set(r, (c = { tris: [], lo: [1e9, 1e9, 1e9], hi: [-1e9, -1e9, -1e9] })); c.tris.push(t); for (let k = 0; k < 3; k++) { const v = p.idx[t * 3 + k]; for (let a = 0; a < 3; a++) { const x = p.pos[v * 3 + a]; c.lo[a] = Math.min(c.lo[a], x); c.hi[a] = Math.max(c.hi[a], x); } } }
  return [...comps.values()].map((c) => ({ tris: c.tris, c: c.lo.map((v, a) => (v + c.hi[a]) / 2), size: Math.max(...c.hi.map((v, a) => v - c.lo[a])) }));
}
const LAMP = { none: 0, head: 1, tail: 2, brake: 3, blink: 4, reverse: 5, beacon: 6, sign: 7 };
const FLAG = { interior: 1, inner: 2, wheel: 4, glass: 8, plate: 16 };

const find = (dir, sha) => { const f = readdirSync(dir).find((x) => x.startsWith(sha)); if (!f) throw new Error('no kit image ' + sha); return join(dir, f); };

// ---- the kit's images, extracted once from whichever car carries them ---------------------------------------------
async function extractKit(files) {
  const want = new Set([...Object.values(KIT).flatMap((k) => [k.base, k.orm]).filter(Boolean), ...Object.values(LIVERY)]);
  for (const f of files) {
    const doc = await io.read(f);
    for (const t of doc.getRoot().listTextures()) {
      const s = sha1s(t.getImage());
      if (!want.has(s)) continue;
      want.delete(s);
      writeFileSync(join(TEX, `${s}.${t.getMimeType() === 'image/png' ? 'png' : 'jpg'}`), t.getImage());
    }
    if (!want.size) break;
  }
  if (want.size) throw new Error('kit images missing: ' + [...want]);
}

// the part a primitive belongs to: the nearest named part node ('Saba95_Headlights'), lower-cased words
const partOf = (p) => (p.path.find((n) => !/^Object_\d+$/.test(n) && !/_0$/.test(n)) || p.path[0] || '').toLowerCase();
const tileOf = (p) => {
  if (/bodymat|_body$/i.test(p.mat)) return 'paint';
  for (const [name, k] of Object.entries(KIT)) if (k.base === p.baseSha) return name;
  if (p.baseSha === LIVERY.taxi || p.baseSha === LIVERY.police) return 'paint';
  throw new Error(`no tile for ${p.mat} (${p.baseSha})`);
};

async function buildOne(id, def) {
  const file = join(SRC, def.file + '.glb');
  const srcBytes = readFileSync(file);
  const doc = await io.read(file);
  let prims = extract(doc);
  // ---- emblems: the badge meshes' empty mounts (a small piece of another part where a badge sat) and the lettering cut
  // as geometry (EMBLEMS), dropped; in the download's own frame ----
  const badgeAt = [];
  for (const p of prims) if (/carbadges/i.test(p.mat) || /badge/.test(partOf(p))) for (const c of pieces(p)) badgeAt.push(c.c);
  let emblemTris = 0;
  for (const p of prims) {
    if (/carbadges/i.test(p.mat) || /badge/.test(partOf(p)) || /numberplate/i.test(p.mat) || /bodymat|_body$/i.test(p.mat)) continue;
    const rules = (EMBLEMS[id] || []).filter((r) => r.part.test(partOf(p)));
    for (const c of pieces(p)) {
      const mount = c.size < 0.2 && badgeAt.some((b) => Math.hypot(b[0] - c.c[0], b[1] - c.c[1], b[2] - c.c[2]) < 0.04);
      const emblem = rules.some((r) => c.size < r.max && Math.hypot(r.c[0] - c.c[0], r.c[1] - c.c[1], r.c[2] - c.c[2]) < r.r);
      if (mount || emblem) { (p.skip || (p.skip = new Set())); for (const t of c.tris) p.skip.add(t); emblemTris += c.tris.length; }
    }
  }
  // ---- the frame: the nose (headlights) to +z ----
  const cen = (re) => { const ps = prims.filter((p) => re.test(partOf(p))); let x = 0, z = 0, n = 0; for (const p of ps) for (let i = 0; i < p.pos.length; i += 3) { x += p.pos[i]; z += p.pos[i + 2]; n++; } return [x / n, z / n]; };
  const h = cen(/headlight/), t = cen(/brakelight|taillight/);
  const dx = h[0] - t[0], dz = h[1] - t[1];
  const theta = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? -Math.PI / 2 : Math.PI / 2) : (dz > 0 ? 0 : Math.PI);
  applyMat(prims, rotY(theta));
  // ---- the parts ----
  const drop = [], wheels = [], keep = [];
  for (const p of prims) {
    const part = partOf(p);
    if (/carbadges/i.test(p.mat) || /badge/.test(part)) { drop.push(p); continue; }
    if (/wh?e+l+stock/.test(part)) { wheels.push(p); continue; }
    keep.push(p);
  }
  // the wheels by corner (from where they are)
  const wb = wheels.map((p) => ({ p, b: bounds([p]) }));
  const front = wb.filter((w) => w.b.c[2] > 0), rear = wb.filter((w) => w.b.c[2] <= 0);
  if (front.length !== 2 || rear.length !== 2) throw new Error(`${id}: wheels ${front.length}+${rear.length}`);
  const fl = front.find((w) => w.b.c[0] > 0), rl = rear.find((w) => w.b.c[0] > 0);
  const ax = (a, b) => (a.b.c[2] + b.b.c[2]) / 2;
  const zF = ax(...front), zR = ax(...rear), xMid = (front[0].b.c[0] + front[1].b.c[0]) / 2;
  const ground = Math.min(...wheels.map((p) => bounds([p]).lo[1]));
  // the origin midway between the axles, on the track's middle, the tyres on y = 0
  const T = trans(-xMid, -ground, -(zF + zR) / 2);
  applyMat(prims, T);
  for (const w of wb) w.b = bounds([w.p]);
  // ---- buckets ----
  const body = new Bucket('body'), glass = new Bucket('glass');
  const lampOf = (part) => /lightbar/.test(part) ? LAMP.beacon : /taxi_beacon|beacon/.test(part) ? LAMP.sign : /headlight/.test(part) ? (/glass/.test(part) ? LAMP.none : LAMP.head)
    : /brakelight/.test(part) ? LAMP.brake : /taillight/.test(part) ? LAMP.tail : /blinker/.test(part) ? LAMP.blink : /reverse/.test(part) ? LAMP.reverse : LAMP.none;
  const counts = { dropped: drop.reduce((s, p) => s + p.idx.length / 3, 0) + emblemTris, plateLetters: 0 };
  for (const p of keep) {
    const part = partOf(p), tile = tileOf(p), lamp = lampOf(part);
    const transp = /transperent|transparent/i.test(p.mat);
    const isWindow = transp && !/headlight|taillight|brakelight|reverse|blinker/.test(part);
    const isCover = transp && /headlight/.test(part) && /glass/.test(part);
    let flags = 0;
    if (/interior|steering|seat/.test(part) || /interiors/i.test(p.mat)) flags |= FLAG.interior;
    if (/inner|suspension|bottom|exhaust/.test(part)) flags |= FLAG.inner;
    const livery = tile === 'paint' && (p.baseSha === LIVERY.taxi || p.baseSha === LIVERY.police);
    // uv: into the tile (a triangle out of 0..1 shifted into it whole, or clamped)
    const uvMap = (u, v, tri) => {
      if (livery) return [u, v];
      if (tile === 'paint') return atlasUV('white', 0.5, 0.5);
      if (tile === 'plate') return atlasUV('plate', u >= 0.5 ? u - 0.5 : u, Math.min(1, Math.max(0, (v - 0.75) / 0.25)));
      const i0 = p.idx[tri * 3], i1 = p.idx[tri * 3 + 1], i2 = p.idx[tri * 3 + 2];
      const us = [p.uv[i0 * 2], p.uv[i1 * 2], p.uv[i2 * 2]], vs = [p.uv[i0 * 2 + 1], p.uv[i1 * 2 + 1], p.uv[i2 * 2 + 1]];
      const fu = Math.floor(Math.min(...us) + 1e-6), fv = Math.floor(Math.min(...vs) + 1e-6);
      const su = Math.max(...us) - fu <= 1.0001 ? fu : 0, sv = Math.max(...vs) - fv <= 1.0001 ? fv : 0;
      const cu = Math.min(1, Math.max(0, u - su)), cv = Math.min(1, Math.max(0, v - sv));
      return atlasUV(tile, cu, cv);
    };
    let tris = p.skip ? Array.from({ length: p.idx.length / 3 }, (_, t) => t).filter((t) => !p.skip.has(t)) : null;
    if (tile === 'plate') {
      // (the characters and state names live in the plate texture's upper three quarters: those triangles dropped)
      tris = [];
      for (let t = 0; t < p.idx.length / 3; t++) { let v = 0; for (let k = 0; k < 3; k++) v += p.uv[p.idx[t * 3 + k] * 2 + 1] / 3; if (v > 0.75) tris.push(t); else counts.plateLetters++; }
      flags |= FLAG.plate;
    }
    if (isWindow || isCover) glass.add(p, { tris, uvMap, fl: [0, lamp, isWindow ? 1 : 2, flags | FLAG.glass] });
    else body.add(p, { tris, uvMap, fl: [tile === 'paint' ? 255 : 0, lamp, 0, flags] });
  }
  // the wheels: the front-left one centred on its hub (its outer face +x), the rear-left too if it is another wheel
  const wheelOf = (w) => {
    const b = new Bucket('wheel'); b.add(w.p, { uvMap: (u, v, tri) => {
      const i0 = w.p.idx[tri * 3], i1 = w.p.idx[tri * 3 + 1], i2 = w.p.idx[tri * 3 + 2];
      const us = [w.p.uv[i0 * 2], w.p.uv[i1 * 2], w.p.uv[i2 * 2]], vs = [w.p.uv[i0 * 2 + 1], w.p.uv[i1 * 2 + 1], w.p.uv[i2 * 2 + 1]];
      const fu = Math.floor(Math.min(...us) + 1e-6), fv = Math.floor(Math.min(...vs) + 1e-6);
      return atlasUV('tire', Math.min(1, Math.max(0, u - (Math.max(...us) - fu <= 1.0001 ? fu : 0))), Math.min(1, Math.max(0, v - (Math.max(...vs) - fv <= 1.0001 ? fv : 0))));
    }, fl: [0, 0, 0, FLAG.wheel] });
    const a = b.arrays(), c = w.b.c;
    return { arrays: transformArrays(a, trans(-c[0], -c[1], -c[2])), c, r: w.b.s[1] / 2, w: w.b.s[0], tris: b.tris };
  };
  const WF = wheelOf(fl), WR = wheelOf(rl);
  const sameWheel = WF.tris === WR.tris && Math.abs(WF.r - WR.r) / WF.r < 0.03 && Math.abs(WF.w - WR.w) / WF.w < 0.05;
  // ---- LODs ----
  // (LOD0 lighter where it is seldom seen: the underbody and the hidden inner panels to ~35%, the cabin to ~60%; the
  // shell, lamps, plates and trim as modelled)
  const bodyA = (() => {
    const all = body.arrays(), sel = (test) => { const idx = []; for (let t = 0; t < all.idx.length; t += 3) { const f = all.fl[all.idx[t] * 4 + 3]; if (test(f)) idx.push(all.idx[t], all.idx[t + 1], all.idx[t + 2]); } return compact(all, Uint32Array.from(idx)); };
    const shell = sel((f) => !(f & (FLAG.inner | FLAG.interior))), inner = sel((f) => f & FLAG.inner), cabin = sel((f) => (f & FLAG.interior) && !(f & FLAG.inner));
    const lite = (a, r) => (a.idx.length ? simplify(a, Math.max(60, Math.round(a.idx.length / 3 * r)), { error: 0.01, uvWeight: 1 }) : a);
    return mergeArrays([shell, lite(inner, 0.35), lite(cabin, def.open ? 0.85 : 0.6)]);
  })();
  const glassA = glass.arrays();
  const at = (W, x, z, flip) => transformArrays(W.arrays, mul(trans(x, W.c[1], z), flip ? rotY(Math.PI) : rotY(0)));
  const wheelsPlaced = [];
  for (const w of wb) { const W = w.b.c[2] > 0 ? WF : (sameWheel ? WF : WR); wheelsPlaced.push(at(W, w.b.c[0], w.b.c[2], w.b.c[0] < 0)); }
  const keepFar = (a, open) => {
    const out = [];
    for (let t = 0; t < a.idx.length; t += 3) { let drop = false; for (let k = 0; k < 3; k++) { const f = a.fl[a.idx[t + k] * 4 + 3]; if ((f & FLAG.inner) || (!open && (f & FLAG.interior)) || (f & FLAG.plate)) drop = true; } if (!drop) out.push(a.idx[t], a.idx[t + 1], a.idx[t + 2]); }
    return { ...a, idx: Uint32Array.from(out) };
  };
  // (glass as opaque dark glass in the far LODs: its glass kind kept, so the shader shades it as glass)
  const farBase = mergeArrays([keepFar(bodyA, def.open), keepFar(glassA, def.open), ...wheelsPlaced]);
  const lod1 = simplify(farBase, 4000, { error: 0.05 });
  let lod2 = simplify(farBase, 700, { error: 0.2 });
  if (lod2.idx.length / 3 > 1100) lod2 = simplify(farBase, 700, { error: 0.5, sloppy: true });
  // ---- numbers the engine reads ----
  const bb = bounds([{ pos: bodyA.pos }]);
  const lampAt = (a, id, side = 1) => { let x = 0, y = 0, z = 0, n = 0; for (let i = 0; i < a.pos.length / 3; i++) if (a.fl[i * 4 + 1] === id && a.pos[i * 3] * side > 0) { x += a.pos[i * 3]; y += a.pos[i * 3 + 1]; z += a.pos[i * 3 + 2]; n++; } return n ? [+(x / n).toFixed(3), +(y / n).toFixed(3), +(z / n).toFixed(3)] : null; };
  const steer = prims.filter((p) => /steering/.test(partOf(p)));
  const sw = steer.length ? bounds(steer) : null;
  const r3 = (v) => +v.toFixed(3);
  const meta = {
    id, frame: 'metres; y up, tyres on y=0; nose +z; left side +x; origin midway between the axles',
    length: r3(bb.s[2]), width: r3(bb.s[0]), height: r3(bb.hi[1]), zF: r3(bb.hi[2]), zR: r3(bb.lo[2]), hw: r3(Math.max(-bb.lo[0], bb.hi[0])),
    axle: r3((WF.c[2] - WR.c[2]) / 2),
    wheels: { front: { x: r3(Math.abs(WF.c[0])), y: r3(WF.c[1]), z: r3(WF.c[2]), r: r3(WF.r), w: r3(WF.w) }, rear: { x: r3(Math.abs(WR.c[0])), y: r3(WR.c[1]), z: r3(WR.c[2]), r: r3(WR.r), w: r3(WR.w) }, rearMesh: !sameWheel },
    head: lampAt(bodyA, LAMP.head) || lampAt(glassA, LAMP.none), tail: lampAt(bodyA, LAMP.tail) || lampAt(bodyA, LAMP.brake),
    steer: sw ? [r3(sw.c[0]), r3(sw.c[1]), r3(sw.c[2])] : null,
    livery: def.livery || null, open: !!def.open,
    paint: (() => { const m = doc.getRoot().listMaterials().find((m) => /bodymat|_body$/i.test(m.getName())); const c = m ? m.getBaseColorFactor() : [0.5, 0.5, 0.5, 1]; return '#' + c.slice(0, 3).map((v) => Math.round(Math.pow(v, 1 / 2.2) * 255).toString(16).padStart(2, '0')).join(''); })(),
    tris: { lod0: bodyA.idx.length / 3 + glass.tris + 2 * WF.tris + 2 * (sameWheel ? WF.tris : WR.tris), body: bodyA.idx.length / 3, bodyModelled: body.tris, glass: glass.tris, wheel: WF.tris, wheelR: sameWheel ? 0 : WR.tris, lod1: lod1.idx.length / 3, lod2: lod2.idx.length / 3, source: prims.reduce((s, p) => s + p.idx.length / 3, 0), dropped: counts.dropped, plateLetters: counts.plateLetters },
  };
  const meshes = [{ name: 'body', arrays: bodyA, mat: 'kit' }, { name: 'glass', arrays: glassA, mat: 'glass' }, { name: 'wheel', arrays: WF.arrays, mat: 'kit' }];
  if (!sameWheel) meshes.push({ name: 'wheelR', arrays: WR.arrays, mat: 'kit' });
  meshes.push({ name: 'lod1', arrays: lod1, mat: 'kit' }, { name: 'lod2', arrays: lod2, mat: 'kit' });
  const glb = await writeGLB(join(OUT, id + '.glb'), meshes, { fleet: meta });
  writeFileSync(join(OUT, id + '.glb'), glb);
  meta.bytes = glb.length; meta.sha256 = sha256(glb); meta.source = { file: def.file + '.glb', sha256: sha256(srcBytes), bytes: srcBytes.length };
  return meta;
}

const ids = ONLY ? ONLY.split(',') : Object.keys(DZ);
await extractKit(Object.values(DZ).map((d) => join(SRC, d.file + '.glb')));
if (!ONLY || ONLY.includes('kit')) { await buildKit(TEX, OUT, CROPS, find); await buildLiveries(TEX, OUT, CROPS, find); }
const metas = {};
for (const id of ids) {
  if (!DZ[id]) continue;
  const m = await buildOne(id, DZ[id]);
  metas[id] = m;
  console.log(id.padEnd(11), `${(m.bytes / 1024).toFixed(0)} KB`, `L ${m.length} W ${m.width} H ${m.height} axle ${m.axle}`, `tris lod0 ${m.tris.lod0} (body ${m.tris.body} glass ${m.tris.glass} wheel ${m.tris.wheel}${m.tris.wheelR ? '/' + m.tris.wheelR : ''}) lod1 ${m.tris.lod1} lod2 ${m.tris.lod2}; dropped ${m.tris.dropped} badge tris, ${m.tris.plateLetters} plate-letter tris; wheels r ${m.wheels.front.r}/${m.wheels.rear.r}`);
}
writeFileSync(join(OUT, 'dz-meta.json'), JSON.stringify(metas, null, 1));
