// SF 2040: the broken streets round the camera. What lies in the streets is laid out edge by edge of the road network
// (cities/sf/js/road-network.js), each edge from its own seed so a street looks the same every time it is seen; only
// the edges within RADIUS of the camera are dressed, again whenever the camera has moved RELAY m. Every kind is one
// instanced draw (a scanned prop's parts one each): rubble heaps, broken slabs, concrete barriers, sheets of corrugated
// metal, fallen poles, and the library's scans (CC0, Poly Haven, assets/sets: oil drums, old tyres, crates, boxes,
// rusty bins, a covered car, chipped concrete blocks, burn barrels, wheel rims, dead trunks). The heaps are what came
// off a building front: concrete lumps and slabs with their rebar out, bonded brick and loose bricks, charred timber
// and grit in a mound of dust, in the library's scanned concrete and brick, darkened low down and ash on top, a soft
// contact shadow under each. Now and then a barricade across a street (a 5 m gap left to ride through), and some heaps,
// drums and burn barrels burning (their fires are fx.js's). The parks' dead lawns get their own: dirt mounds, dead
// shrubs, fallen trunks, litter. The big heaps, the barriers and blocks and the covered wrecks are solid: colliders
// handed out with the city's own (controllerManager.nearColliders), so the horse and the player go round them.
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { libModel } from '../storyrun/setkit.js';

const RADIUS = 230, RELAY = 45;
const hashI = (n) => { let t = (n + 0x6D2B79F5) >>> 0; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ── geometry made here, vertex-coloured; the masonry's UVs in metres (planar per face) for the scanned surfaces ──
function paint(g, fn) {
  const p = g.attributes.position, c = new Float32Array(p.count * 3), col = new THREE.Color();
  for (let i = 0; i < p.count; i++) { fn(col, p.getX(i), p.getY(i), p.getZ(i), i); c.set([col.r, col.g, col.b], i * 3); }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g;
}
const strip = (g, keepUV = false) => { g = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'color' && !(keepUV && k === 'uv')) g.deleteAttribute(k); return g; };
// UVs in metres over TILE m: each triangle projected on the plane its face looks most along (non-indexed, flat)
function planarUV(g, tile = 2) {
  const p = g.attributes.position, uv = new Float32Array(p.count * 2), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    n.subVectors(c, b).cross(b.clone().sub(a)); const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
    for (let k = 0; k < 3; k++) {
      const v = [a, b, c][k];
      const [u, w] = ay >= ax && ay >= az ? [v.x, v.z] : ax >= az ? [v.z, v.y] : [v.x, v.y];
      uv[(i + k) * 2] = u / tile; uv[(i + k) * 2 + 1] = w / tile;
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return g;
}
// a broken lump: a box with its corners pulled about (a fracture, not a crystal), flat-shaded
function chunk(R, w, h, d, jit = 0.28) {
  let g = new THREE.BoxGeometry(w, h, d, 2, 1, 2);
  const p = g.attributes.position, seen = new Map();
  for (let k = 0; k < p.count; k++) {
    const key = p.getX(k).toFixed(3) + ',' + p.getY(k).toFixed(3) + ',' + p.getZ(k).toFixed(3);
    let o = seen.get(key);
    if (!o) seen.set(key, (o = [(R() - 0.5) * w * jit, (R() - 0.5) * h * jit * (p.getY(k) > 0 ? 1.6 : 0.4), (R() - 0.5) * d * jit]));
    p.setXYZ(k, p.getX(k) + o[0], p.getY(k) + o[1], p.getZ(k) + o[2]);
  }
  g = strip(g); g.computeVertexNormals(); return g;
}
// the masonry's tone: darker low down and underneath (its own contact shadow), ash on what faces up
const ASH = new THREE.Color(0x8a867e);
function tone(g, base, R, { ao = 0.5, ash = 0.35, var: vr = 0.18 } = {}) {
  const nrm = g.attributes.normal, t = new THREE.Color(base).multiplyScalar(1 - vr / 2 + R() * vr);
  return paint(g, (c, x, y, z, i) => {
    const up = nrm ? nrm.getY(i) : 0;
    c.copy(t).multiplyScalar(Math.min(1, (1 - ao) + ao * Math.min(1, Math.max(0, (y + 0.05) / 0.5))) * (up < -0.3 ? 0.6 : 1));
    if (up > 0.55) c.lerp(ASH, ash * (0.6 + 0.4 * Math.sin(x * 9.1 + z * 7.3) * Math.sin(x * 3.3 - z * 5.7)));
  });
}
const place = (g, rx, ry, rz, x, y, z) => { g.rotateX(rx); g.rotateZ(rz); g.rotateY(ry); g.translate(x, y, z); return g; };
// a low mound of dust and grit the heap sits in: its edge feathered into the street
function moundGeo(R, rad, h) {
  const seg = 28, rings = 5, pos = [], idx = [];
  pos.push(0, h, 0);
  // (a ragged edge, smoothed: lobes, not spikes)
  const raw = Array.from({ length: seg }, () => 0.72 + R() * 0.5);
  const radii = raw.map((_, i) => rad * (raw[(i + seg - 1) % seg] + raw[i] * 2 + raw[(i + 1) % seg]) / 4);
  for (let r = 1; r <= rings; r++) for (let s = 0; s < seg; s++) {
    const a = (s / seg) * Math.PI * 2, f = r / rings, rr = radii[s] * f;
    pos.push(Math.cos(a) * rr, h * (1 - f * f) * (0.8 + R() * 0.4) - (r === rings ? 0.04 : 0), Math.sin(a) * rr);
  }
  for (let s = 0; s < seg; s++) idx.push(0, 1 + ((s + 1) % seg), 1 + s);
  for (let r = 1; r < rings; r++) for (let s = 0; s < seg; s++) {
    const a = 1 + (r - 1) * seg + s, b = 1 + (r - 1) * seg + ((s + 1) % seg), c2 = a + seg, d = b + seg;
    idx.push(a, b, d, a, d, c2);
  }
  let g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  g.computeVertexNormals(); g = g.toNonIndexed(); // (smooth: a soft drift of dust, not facets)
  return paint(g, (c, x, y, z) => c.setHex(0x6a6258).multiplyScalar(0.85 + 0.25 * Math.sin(x * 5.1 + z * 3.7) * Math.sin(x * 2.3 - z * 4.9)).lerp(ASH, Math.min(0.45, y * 1.4)));
}
// bent rebar out of a broken edge: two or three rods, kinked
function rebar(R, parts, x, y, z, n = 3, len = 1.2) {
  const rust = new THREE.Color(0x3a2216);
  for (let i = 0; i < n; i++) {
    const a = R() * Math.PI * 2, L1 = len * (0.4 + R() * 0.4), L2 = len * (0.3 + R() * 0.5);
    for (const [L, tilt, off] of [[L1, 0.35 + R() * 0.5, 0], [L2, 0.9 + R() * 0.9, L1]]) {
      let g = new THREE.CylinderGeometry(0.014, 0.014, L, 5); g.translate(0, L / 2, 0);
      g.rotateZ(tilt); g.rotateY(a);
      const dx = -Math.sin(0.35 + 0.0) * 0, base = new THREE.Vector3(0, off, 0).applyAxisAngle(new THREE.Vector3(0, 0, 1), 0.35 + R() * 0.2).applyAxisAngle(new THREE.Vector3(0, 1, 0), a);
      g.translate(x + base.x + dx + (R() - 0.5) * 0.3, y + base.y * 0.6, z + base.z + (R() - 0.5) * 0.3);
      g = strip(g); parts.push(paint(g, (c) => c.copy(rust).multiplyScalar(0.8 + R() * 0.4)));
    }
  }
}
// charred timber: joists and boards, black with grey ash at the ends
function timber(R, parts, x, y, z, len) {
  let g = new THREE.BoxGeometry(0.1 + R() * 0.06, 0.08 + R() * 0.08, len, 1, 1, 3);
  const p = g.attributes.position; for (let k = 0; k < p.count; k++) p.setX(k, p.getX(k) + Math.sin(p.getZ(k) * 2.1) * 0.02);
  g = strip(g); g.computeVertexNormals();
  place(g, (R() - 0.5) * 0.5, R() * Math.PI, (R() - 0.5) * 0.4, x, y, z);
  parts.push(paint(g, (c, px, py, pz) => c.setHex(0x14110f).lerp(ASH, Math.max(0, Math.min(0.5, (Math.abs(pz - z) / len - 0.35))) * 0.6).multiplyScalar(0.9 + R() * 0.2)));
}
// A heap of what came down off a building front: { concrete, brick } (each merged; UVs in metres)
//   mix: 'mixed' | 'brick' | 'flat'
function heapGeo(seed, mix = 'mixed') {
  const R = rng(seed), con = [], bri = [];
  const big = mix === 'flat' ? 0.55 : 1;
  if (mix !== 'flat') con.push(moundGeo(R, 1.9, 0.32));
  // the big pieces: concrete lumps and slabs, some half sunk in the heap
  const nC = mix === 'brick' ? 3 : mix === 'flat' ? 4 : 7;
  for (let i = 0; i < nC; i++) {
    const slab = R() < 0.35, w = (0.45 + R() * 0.75) * big, h = slab ? 0.14 + R() * 0.1 : (0.3 + R() * 0.45) * big, d = (0.4 + R() * 0.7) * big;
    const g = chunk(R, w * (slab ? 1.8 : 1), h, d * (slab ? 1.4 : 1));
    const a = R() * Math.PI * 2, r = i < 2 ? R() * 0.4 : 0.35 + R() * 1.25;
    place(g, (R() - 0.5) * (slab ? 0.9 : 0.6), R() * 6, (R() - 0.5) * (slab ? 0.9 : 0.5), Math.cos(a) * r, h * 0.3 + (i < 2 && mix !== 'flat' ? 0.22 : 0.02), Math.sin(a) * r);
    con.push(planarUV(tone(g, [0xa09a90, 0x8f897f, 0xb0a99c, 0x7d776e][i % 4], R)));
    if (slab && R() < 0.7) rebar(R, con, Math.cos(a) * r, h * 0.3, Math.sin(a) * r, 2 + Math.floor(R() * 3), 0.9 + R() * 0.8);
  }
  if (mix !== 'flat' && R() < 0.8) rebar(R, con, (R() - 0.5) * 0.8, 0.3, (R() - 0.5) * 0.8, 3, 1.4);
  // brick: wall fragments (several courses still bonded) and loose bricks spilled round
  const nW = mix === 'brick' ? 4 : mix === 'flat' ? 1 : 2;
  for (let i = 0; i < nW; i++) {
    const g = chunk(R, 0.5 + R() * 0.7, 0.35 + R() * 0.5, 0.22, 0.12);
    const a = R() * Math.PI * 2, r = 0.3 + R() * 1.1;
    place(g, (R() - 0.5) * 1.6, R() * 6, (R() - 0.5) * 1.2, Math.cos(a) * r, 0.25 + R() * 0.2, Math.sin(a) * r);
    bri.push(planarUV(tone(g, 0xc8b8a8, R, { ash: 0.3 })));
  }
  const nB = mix === 'brick' ? 26 : mix === 'flat' ? 10 : 16;
  for (let i = 0; i < nB; i++) {
    let g = new THREE.BoxGeometry(0.21, 0.065, 0.1); g = strip(g);
    const a = R() * Math.PI * 2, r = 0.5 + R() * (mix === 'flat' ? 1.4 : 1.9);
    place(g, (R() - 0.5) * 1.2, R() * 6, (R() - 0.5) * 1.2, Math.cos(a) * r, 0.04 + Math.max(0, (1.6 - r)) * 0.12 * (mix === 'flat' ? 0 : 1), Math.sin(a) * r);
    g.computeVertexNormals();
    bri.push(planarUV(tone(g, R() < 0.2 ? 0x8a8078 : 0xc0a898, R, { ao: 0.2, ash: 0.25, var: 0.35 })));
  }
  // small concrete grit
  for (let i = 0; i < (mix === 'flat' ? 10 : 14); i++) {
    const g = chunk(R, 0.08 + R() * 0.14, 0.06 + R() * 0.08, 0.08 + R() * 0.14, 0.5);
    const a = R() * Math.PI * 2, r = 0.6 + R() * 1.8;
    place(g, R(), R() * 6, R(), Math.cos(a) * r, 0.03, Math.sin(a) * r);
    con.push(planarUV(tone(g, 0x958f86, R, { ao: 0.25 })));
  }
  // charred timber across it
  const nT = mix === 'flat' ? 1 : 2 + Math.floor(R() * 2);
  for (let i = 0; i < nT; i++) timber(R, con, (R() - 0.5) * 1.6, 0.25 + R() * 0.25, (R() - 0.5) * 1.6, 1.2 + R() * 1.4);
  const uvless = (list) => list.map((g) => (g.attributes.uv ? g : planarUV(g)));
  return { concrete: mergeGeometries(uvless(con)), brick: mergeGeometries(uvless(bri)) };
}
function slabGeo() {
  // a fallen floor slab: broken along one edge, its rebar out of the break
  const R = rng(5), parts = [];
  let g = new THREE.BoxGeometry(2.2, 0.2, 1.5, 6, 1, 4);
  const p = g.attributes.position;
  for (let k = 0; k < p.count; k++) { const x = p.getX(k); if (x > 0.7) { p.setX(k, x - R() * 0.5); p.setY(k, p.getY(k) + (R() - 0.5) * 0.08); } p.setZ(k, p.getZ(k) * (0.92 + R() * 0.12)); }
  g = strip(g); g.computeVertexNormals();
  parts.push(planarUV(tone(g, 0x9a948a, R)));
  for (let i = 0; i < 7; i++) {
    let r = new THREE.CylinderGeometry(0.012, 0.012, 0.5 + R() * 0.7, 5); r.translate(0, (0.5 + R() * 0.7) / 2, 0); r.rotateZ(-Math.PI / 2 + (R() - 0.5) * 0.9); r.translate(0.8, (R() - 0.5) * 0.1, -0.65 + i * 0.2);
    r = strip(r); parts.push(planarUV(paint(r, (c) => c.setHex(0x3a2216))));
  }
  return mergeGeometries(parts);
}
function barrierGeo() {
  // a jersey barrier's profile, 3 m long
  const s = new THREE.Shape(); s.moveTo(-0.3, 0); s.lineTo(0.3, 0); s.lineTo(0.3, 0.08); s.lineTo(0.2, 0.25); s.lineTo(0.09, 0.82); s.lineTo(-0.09, 0.82); s.lineTo(-0.2, 0.25); s.lineTo(-0.3, 0.08);
  let g = new THREE.ExtrudeGeometry(s, { depth: 3, bevelEnabled: false }); g.translate(0, 0, -1.5);
  g = strip(g); g.computeVertexNormals();
  return planarUV(paint(g, (c, x, y, z) => c.setHex(0xa8a296).multiplyScalar(0.8 + 0.2 * Math.sin(z * 3.1 + y * 7)).multiplyScalar(y < 0.15 ? 0.7 : 1)));
}
function sheetGeo() {
  // corrugated metal, 2.4 x 1.0 m, rusted in patches
  let g = new THREE.PlaneGeometry(2.4, 1.0, 36, 1);
  const p = g.attributes.position;
  for (let k = 0; k < p.count; k++) p.setZ(k, Math.sin(p.getX(k) * 2 * Math.PI / 0.15) * 0.022);
  g.rotateX(-Math.PI / 2); g.translate(0, 0.03, 0);
  g = strip(g); g.computeVertexNormals();
  return paint(g, (c, x, y, z) => { const r = 0.5 + 0.5 * Math.sin(x * 2.3 + z * 4.1) * Math.sin(x * 0.7 - z * 2.9); c.setHex(0x5e6468).lerp(new THREE.Color(0x5a2c14), Math.min(1, r * 1.3)); });
}
function poleGeo() {
  let g = new THREE.CylinderGeometry(0.09, 0.13, 8.5, 8); g.rotateZ(Math.PI / 2); g.translate(0, 0.12, 0);
  let arm = new THREE.CylinderGeometry(0.05, 0.05, 1.8, 6); arm.rotateX(Math.PI / 2); arm.translate(4.1, 0.12, 0.9);
  g = mergeGeometries([strip(g), strip(arm)]);
  return paint(g, (c) => c.setHex(0x3d4042));
}
// a dead shrub: bare, grey-brown twigs fanning up out of a dry tuft
function deadShrubGeo() {
  const R = rng(91), parts = [];
  for (let i = 0; i < 16; i++) {
    const L = 0.4 + R() * 0.8;
    let g = new THREE.CylinderGeometry(0.006, 0.018, L, 4); g.translate(0, L / 2, 0);
    g.rotateZ((R() - 0.5) * 1.3); g.rotateY(R() * 6.3); g.translate((R() - 0.5) * 0.25, 0, (R() - 0.5) * 0.25);
    g = strip(g); parts.push(paint(g, (c) => c.setHex(0x4a3f34).multiplyScalar(0.7 + R() * 0.5)));
    if (R() < 0.6) { // a side twig
      let t = new THREE.CylinderGeometry(0.004, 0.008, L * 0.5, 3); t.translate(0, L * 0.25, 0); t.rotateZ((R() - 0.5) * 2); t.rotateY(R() * 6.3); t.translate(0, L * 0.5, 0);
      t = strip(t); parts.push(paint(t, (c) => c.setHex(0x55493c)));
    }
  }
  let tuft = new THREE.ConeGeometry(0.45, 0.25, 9, 1, true); tuft.translate(0, 0.12, 0); tuft = strip(tuft);
  parts.push(paint(tuft, (c) => c.setHex(0x6e6146)));
  const g = mergeGeometries(parts); g.computeVertexNormals(); return g;
}
// a soft dark disc under a heap or a wreck: its contact shadow
function shadowTexture() {
  // (an alpha map is read from its green: white where the shadow is, on black)
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  x.fillStyle = '#000'; x.fillRect(0, 0, 128, 128);
  const g = x.createRadialGradient(64, 64, 6, 64, 64, 62); g.addColorStop(0, 'rgb(150,150,150)'); g.addColorStop(0.55, 'rgb(90,90,90)'); g.addColorStop(1, 'rgb(0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; return t;
}
const SETS = new URL('../../assets/sets/', import.meta.url).href;
function surface(id) {
  const L = new THREE.TextureLoader(), load = (f, srgb) => { const t = L.load(SETS + id + '/' + f); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 4; return t; };
  return { map: load('color.jpg', true), normalMap: load('normal.jpg', false), roughnessMap: load('roughness.jpg', false) };
}

export function createDebris(W, fx, { clear = [] } = {}) {
  const app = W.app, scene = app.scene, N = window.NYC, cm = app.controllerManager;
  const net = app.trafficSystem?.network;
  const group = new THREE.Group(); group.name = 'apoc-debris'; scene.add(group);
  const ground = (x, z) => { try { const y = cm.getGroundHeight(x, z, 'person'); return Number.isFinite(y) ? y : N.Terrain.groundAt(x, z); } catch { return 0; } };
  const vmat = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.95, metalness: 0.0 });
  const sheetMat = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.35, side: THREE.DoubleSide });
  // the masonry in the library's scanned surfaces (Poly Haven, CC0: assets/sets/tex-concrete, tex-brick), tinted per
  // vertex (its tone, its ash, its contact shadow)
  // (the sky's reflection kept low: rough broken faces turned to the bright horizon read as lit edges otherwise)
  const scanned = (id, k = 1) => new THREE.MeshStandardNodeMaterial({ vertexColors: true, ...surface(id), roughness: 1.0, metalness: 0, normalScale: new THREE.Vector2(k, k), envMapIntensity: 0.3 });
  const concreteMat = scanned('tex-concrete', 1.4), brickMat = scanned('tex-brick', 1.2);
  const shadowMat = new THREE.MeshBasicNodeMaterial({ color: 0x000000, alphaMap: shadowTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  // kinds: { meshes: [InstancedMesh], cap, n }
  const kinds = {};
  function kind(name, cap, pieces, { shadows = false } = {}) {
    const meshes = pieces.map(({ geometry, material }) => {
      const m = new THREE.InstancedMesh(geometry, material, cap);
      m.count = 0; m.castShadow = shadows; m.receiveShadow = true; m.frustumCulled = false; m.name = 'apoc-' + name;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      group.add(m); return m;
    });
    return (kinds[name] = { meshes, cap, n: 0 });
  }
  const heap = (seed, mix) => { const h = heapGeo(seed, mix); return [{ geometry: h.concrete, material: concreteMat }, { geometry: h.brick, material: brickMat }]; };
  kind('rubble', 150, heap(17, 'mixed'));
  kind('rubble-b', 110, heap(29, 'brick'));
  kind('rubble-s', 160, heap(43, 'flat'));
  kind('slab', 130, [{ geometry: slabGeo(), material: concreteMat }]);
  kind('barrier', 40, [{ geometry: barrierGeo(), material: concreteMat }]);
  kind('sheet', 90, [{ geometry: sheetGeo(), material: sheetMat }]);
  kind('pole', 16, [{ geometry: poleGeo(), material: vmat }]);
  kind('dead-shrub', 140, [{ geometry: deadShrubGeo(), material: vmat }]);
  kind('mound', 90, [{ geometry: (() => { const g = moundGeo(rng(7), 2.2, 0.28); return planarUV(g); })(), material: concreteMat }]);
  const sh = kind('shadow', 420, [{ geometry: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), material: shadowMat }]);
  sh.meshes[0].renderOrder = 997; sh.meshes[0].receiveShadow = false;
  // the scans (loaded in the background: their kinds appear once they are in); tint: their maps darkened toward ash
  const SCANS = { 'blue-drum': 70, 'red-drum': 70, 'old-tyre': 110, 'plastic-crate': 60, 'cardboard-box': 90, 'trash-cans': 50, 'covered-car': 10, 'concrete-block': 50, 'burn-barrel': 40, 'dead-trunk': 30, 'wheel-rim': 50 };
  const TINT = { 'dead-trunk': [0.32, 0.3, 0.28], 'concrete-block': [0.62, 0.6, 0.57], 'burn-barrel': [0.7, 0.66, 0.62], 'cardboard-box': [0.62, 0.58, 0.52], 'plastic-crate': [0.6, 0.6, 0.6] };
  const SCAN_PARTS = { 'trash-cans': ['metal_trash_can_rust', 'metal_trash_can_rust_lid'] };
  const ready = Promise.all(Object.entries(SCANS).map(async ([id, cap]) => {
    try {
      const L = await libModel(id);
      const pieces = [];
      for (const [name, subs] of Object.entries(L.parts)) {
        if (SCAN_PARTS[id] && !SCAN_PARTS[id].includes(name)) continue;
        for (const s of subs) { const mat = s.material.clone(); if (TINT[id]) mat.color.setRGB(...TINT[id]); else mat.color.multiplyScalar(0.72); mat.roughness = Math.max(mat.roughness, 0.9); pieces.push({ geometry: s.geometry, material: mat }); }
      }
      kind(id, cap, pieces, { shadows: id === 'covered-car' });
      dirty = true;
    } catch (e) { console.warn('[apocalypse] scan', id, e); }
  }));

  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), S = new THREE.Vector3(), P = new THREE.Vector3();
  // keep(x, z, r): true where nothing that stands in the way may go (the GPS route's corridor, set by index.js)
  const out = { keep: null };
  const FLAT = new Set(['sheet', 'shadow', 'mound', 'rubble-s', 'cardboard-box', 'dead-shrub', 'wheel-rim']);
  function put(name, x, z, yaw, { s = 1, tilt = 0, roll = 0, dy = 0, y = null } = {}) {
    const k = kinds[name]; if (!k || k.n >= k.cap) return false;
    if (out.keep && !FLAT.has(name) && out.keep(x, z, (BODY[name] ? Math.max(BODY[name][0], BODY[name][1]) * s : 0.6))) return false;
    const gy = y ?? ground(x, z);
    P.set(x, gy + dy, z); E.set(tilt, yaw, roll, 'YXZ'); Q.setFromEuler(E); S.setScalar(s);
    M.compose(P, Q, S);
    for (const m of k.meshes) m.setMatrixAt(k.n, M);
    k.n++;
    const b = BODY[name];
    if (b) {
      // its contact shadow, and (the big ones) a collider: the horse and the player go round it
      shade(x, z, gy, yaw, b[0] * s * 2.4, b[1] * s * 2.4);
      if (b[2] && s * Math.max(b[0], b[1]) >= b[2] && !(tilt && Math.abs(tilt) > 1)) solid(x, z, gy, yaw, b[0] * s, b[1] * s, b[3] * s);
    }
    return true;
  }
  // [half-width, half-length, smallest half-size that blocks, height] of each kind that sits heavy on the street
  const BODY = { rubble: [1.25, 1.25, 0.9, 0.9], 'rubble-b': [1.2, 1.2, 0.9, 0.8], 'rubble-s': [1.0, 1.0, 9, 0.3], slab: [1.1, 0.75, 9, 0.3], barrier: [0.32, 1.5, 0.3, 0.82], 'covered-car': [0.92, 2.2, 0.5, 1.4], 'concrete-block': [0.78, 0.25, 0.2, 1.1], mound: [1.9, 1.9, 9, 0.3], 'dead-trunk': [2.0, 0.5, 9, 1.0], 'burn-barrel': [0.3, 0.3, 0.29, 0.86] };
  function shade(x, z, gy, yaw, w, l) {
    const k = kinds.shadow; if (k.n >= k.cap) return;
    P.set(x, gy + 0.02, z); E.set(0, yaw, 0); Q.setFromEuler(E); S.set(w, 1, l); M.compose(P, Q, S); k.meshes[0].setMatrixAt(k.n++, M);
  }
  // ── colliders: the big heaps, the barriers and blocks, the wrecks under covers (each a turned box as the city's
  //    colliders' obb, bucketed in 16 m cells; the controllers' nearColliders hands them out with the city's own) ──
  const CELL = 16, cells = new Map(), solids = [];
  const ckey = (ix, iz) => (ix + 8192) * 16384 + (iz + 8192);
  function solid(x, z, gy, yaw, hx, hz, h) {
    const cs = Math.cos(yaw), sn = Math.sin(yaw), ex = Math.abs(hx * cs) + Math.abs(hz * sn), ez = Math.abs(hx * sn) + Math.abs(hz * cs);
    const c = { minX: x - ex, maxX: x + ex, minZ: z - ez, maxZ: z + ez, minY: gy - 1, maxY: gy + h, obb: { cx: x, cz: z, hx, hz, cs, sn }, apoc: true };
    solids.push(c);
    for (let ix = Math.floor(c.minX / CELL); ix <= Math.floor(c.maxX / CELL); ix++) for (let iz = Math.floor(c.minZ / CELL); iz <= Math.floor(c.maxZ / CELL); iz++) {
      const k = ckey(ix, iz); let l = cells.get(k); if (!l) cells.set(k, (l = [])); l.push(c);
    }
  }
  // (&apocsolid=0: none of it solid, for comparing)
  const solidOn = new URLSearchParams(location.search).get('apocsolid') !== '0';
  if (solidOn && cm && cm.nearColliders && !cm._apocNear) {
    const base = cm.nearColliders.bind(cm);
    cm._apocNear = true;
    cm.nearColliders = (x, z, r) => {
      const out = base(x, z, r);
      if (!solids.length) return out;
      const stamp = (cm._apocStamp = (cm._apocStamp || 0) + 1);
      for (let ix = Math.floor((x - r) / CELL); ix <= Math.floor((x + r) / CELL); ix++) for (let iz = Math.floor((z - r) / CELL); iz <= Math.floor((z + r) / CELL); iz++) {
        const l = cells.get(ckey(ix, iz)); if (!l) continue;
        for (const c of l) if (c._apocSeen !== stamp) { c._apocSeen = stamp; out.push(c); }
      }
      return out;
    };
  }
  const fires = []; fx.sources.set('debris', fires);
  const CLUTTER = ['old-tyre', 'old-tyre', 'cardboard-box', 'cardboard-box', 'plastic-crate', 'blue-drum', 'red-drum', 'trash-cans', 'sheet', 'rubble-s', 'slab', 'wheel-rim', 'rubble-s'];
  const HEAPS = ['rubble', 'rubble-b', 'rubble'];
  const kept = (x, z, r = 0) => clear.some(([a, b, R]) => Math.hypot(x - a, z - b) < R + r);

  function dressEdge(e, idx, cx, cz) {
    const R = rng(idx * 7919 + 13);
    const along = (s, r) => [e.sx + e.dx * s + e.rx * r, e.sz + e.dz * s + e.rz * r];
    const yaw0 = Math.atan2(e.dx, e.dz);
    const len = e.len;
    if (len < 30) return;
    // a barricade across this street (1 in 7 edges; a gap left to ride through, 5 m)
    if (R() < 0.14 && len > 50) {
      const s = 20 + R() * (len - 40), gap = (R() - 0.5) * e.half;
      for (let r = -e.half + 0.6; r < e.half - 0.6; r += 3.1) {
        if (Math.abs(r - gap) < 2.6) continue;
        const [x, z] = along(s, r);
        const pick = R();
        if (pick < 0.4) put('barrier', x, z, yaw0 + Math.PI / 2 + (R() - 0.5) * 0.25);
        else if (pick < 0.6) put('concrete-block', x, z, yaw0 + Math.PI / 2 + (R() - 0.5) * 0.4) || put('barrier', x, z, yaw0 + Math.PI / 2);
        else if (pick < 0.82) { put(R() < 0.5 ? 'blue-drum' : 'red-drum', x, z, R() * 6); put('sheet', x + e.dx * 0.6, z + e.dz * 0.6, yaw0 + Math.PI / 2, { tilt: -1.1, dy: 0.4 }); }
        else put('covered-car', x, z, yaw0 + Math.PI / 2 + (R() - 0.5) * 0.5) || put('rubble', x, z, R() * 6, { s: 1.0 });
      }
      // a fire in a burn barrel at its end
      if (R() < 0.7) { const [x, z] = along(s - 1.5, e.half - 1.2); if (put('burn-barrel', x, z, R() * 6) || put('red-drum', x, z, R() * 6)) fires.push({ x, y: ground(x, z) + 0.95, z, s: 0.55 }); }
    }
    // a fallen pole now and then, across the gutter and the sidewalk
    if (R() < 0.08) { const s = 15 + R() * (len - 30), sd = R() < 0.5 ? 1 : -1; const [x, z] = along(s, sd * (e.half + 0.5)); put('pole', x, z, yaw0 + Math.PI / 2 + (R() - 0.5) * 0.8 + (sd < 0 ? Math.PI : 0), { tilt: 0, roll: 0.03 }); }
    // fallen facade in the lanes: heaps and slabs out in the road now and then
    for (let s = 14 + R() * 20; s < len - 14; s += 22 + R() * 30) {
      if (R() < 0.45) continue;
      const r = (R() - 0.5) * e.half * 1.4, [x, z] = along(s, r);
      put(HEAPS[Math.floor(R() * HEAPS.length)], x, z, R() * 6, { s: 0.75 + R() * 0.6 });
      if (R() < 0.6) put('slab', x + (R() - 0.5) * 3, z + (R() - 0.5) * 3, R() * 6, { tilt: (R() - 0.5) * 0.4, roll: (R() - 0.5) * 0.3, dy: 0.05 });
      if (R() < 0.5) put('rubble-s', x + (R() - 0.5) * 4, z + (R() - 0.5) * 4, R() * 6, { s: 0.8 + R() * 0.5 });
      if (R() < 0.4) put(R() < 0.5 ? 'old-tyre' : 'sheet', x + (R() - 0.5) * 4, z + (R() - 0.5) * 4, R() * 6, { tilt: R() < 0.5 ? Math.PI / 2 : 0 });
    }
    // clutter in the gutters and on the sidewalks, every ~14 m
    for (let s = 8 + R() * 6; s < len - 8; s += 6 + R() * 9) {
      const sd = R() < 0.5 ? 1 : -1;
      const onWalk = R() < 0.45;
      const r = sd * (onWalk ? e.half + 0.9 + R() * 2.0 : e.half - 0.4 - R() * 1.6);
      const [x, z] = along(s, r);
      if (onWalk && net.onSidewalk && !net.onSidewalk(x, z)) continue;
      const roll = R();
      if (roll < 0.3) {
        // a heap off a building front, things in it, sometimes burning
        put(onWalk ? 'rubble-b' : HEAPS[Math.floor(R() * HEAPS.length)], x, z, R() * 6, { s: 0.7 + R() * 0.5 });
        for (let j = 0; j < 3; j++) put(CLUTTER[Math.floor(R() * CLUTTER.length)], x + (R() - 0.5) * 3, z + (R() - 0.5) * 3, R() * 6, { tilt: (R() - 0.5) * 0.4 });
        if (R() < 0.3) fires.push({ x, y: ground(x, z) + 0.5, z, s: 0.7 + R() * 0.6 });
      } else if (roll < 0.45) {
        put('slab', x, z, R() * 6, { tilt: (R() - 0.5) * 0.5, roll: (R() - 0.5) * 0.4, dy: 0.05 });
        put('rubble-s', x + 1.2, z, R() * 6, { s: 0.6 });
      } else {
        const n = 1 + Math.floor(R() * 3);
        for (let j = 0; j < n; j++) {
          const id = CLUTTER[Math.floor(R() * CLUTTER.length)], x2 = x + (R() - 0.5) * 2, z2 = z + (R() - 0.5) * 2;
          const down = (id === 'blue-drum' || id === 'red-drum' || id === 'trash-cans') && R() < 0.4;
          put(id, x2, z2, R() * 6, down ? { tilt: Math.PI / 2, dy: 0.3 } : id === 'old-tyre' && R() < 0.6 ? { tilt: Math.PI / 2, dy: 0.0 } : {});
          if ((id === 'red-drum' || id === 'blue-drum') && !down && R() < 0.25) fires.push({ x: x2, y: ground(x2, z2) + 0.9, z: z2, s: 0.5 });
        }
      }
    }
  }
  // the parks and plazas' dead lawns: worn dirt mounds, dead shrubs, a fallen trunk, litter, now and then a burn barrel
  // (kept off a story's lairs and the camps' middles; nothing here blocks but the barrels)
  const inPoly = (poly, x, z) => { let y = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a.z > z) !== (b.z > z) && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) y = !y; } return y; };
  const LITTER = ['cardboard-box', 'old-tyre', 'sheet', 'plastic-crate', 'wheel-rim', 'cardboard-box', 'rubble-s'];
  function dressLawn(b) {
    const R = rng(b.id * 131 + 7);
    const n = Math.min(70, Math.round(b.area * b.park / 160));
    for (let i = 0; i < n; i++) {
      const x = b.minX + R() * (b.maxX - b.minX), z = b.minZ + R() * (b.maxZ - b.minZ), roll = R();
      if (!inPoly(b.poly, x, z) || kept(x, z, 3)) continue;
      if (roll < 0.34) put('dead-shrub', x, z, R() * 6, { s: 0.7 + R() * 0.9 });
      else if (roll < 0.5) put('mound', x, z, R() * 6, { s: 0.6 + R() * 0.8, dy: -0.06 });
      else if (roll < 0.56) put('dead-trunk', x, z, R() * 6, { s: 0.7 + R() * 0.4, dy: -0.05 });
      else if (roll < 0.59) { if (put('burn-barrel', x, z, R() * 6) && R() < 0.6) fires.push({ x, y: ground(x, z) + 0.95, z, s: 0.5 }); }
      else put(LITTER[Math.floor(R() * LITTER.length)], x, z, R() * 6, { tilt: R() < 0.3 ? Math.PI / 2 : 0 });
    }
  }

  let at = null, dirty = true;
  function layout(cx, cz) {
    at = { x: cx, z: cz }; dirty = false;
    for (const k of Object.values(kinds)) k.n = 0;
    fires.length = 0; solids.length = 0; cells.clear();
    if (!net) return;
    const edges = net.edges;
    for (let i = 0; i < edges.length; i++) {
      const e = edges[i];
      if (e.bore || !e.len) continue;
      const mx = e.sx + e.dx * e.len * 0.5, mz = e.sz + e.dz * e.len * 0.5;
      if (Math.hypot(mx - cx, mz - cz) > RADIUS + e.len * 0.5) continue;
      // (each street once: of its two ways, the edge running west-to-east or north-to-south)
      if (e.dx < -0.01 || (Math.abs(e.dx) <= 0.01 && e.dz < 0)) continue;
      dressEdge(e, Math.round(e.sx * 3.1 + e.sz * 7.7), cx, cz);
    }
    for (const b of N.BLOCKS || []) {
      if (!(b.park > 0.5) || b.median || b.area < 400) continue;
      if (b.maxX < cx - RADIUS || b.minX > cx + RADIUS || b.maxZ < cz - RADIUS || b.minZ > cz + RADIUS) continue;
      dressLawn(b);
    }
    for (const k of Object.values(kinds)) for (const m of k.meshes) { m.count = k.n; m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere?.(); }
  }
  function update(c) {
    const p = c.position;
    if (dirty || !at || Math.hypot(p.x - at.x, p.z - at.z) > RELAY) layout(p.x, p.z);
  }
  const count = () => Object.fromEntries(Object.entries(kinds).map(([k, v]) => [k, v.n]));
  return Object.assign(out, { update, ready, group, count, fires, put, solids, relayout() { dirty = true; } });
}
