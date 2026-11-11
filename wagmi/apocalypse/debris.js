// SF 2040: the broken streets round the camera. What lies in the streets is laid out edge by edge of the road network
// (cities/sf/js/road-network.js), each edge from its own seed so a street looks the same every time it is seen; only
// the edges within RADIUS of the camera are dressed, again whenever the camera has moved RELAY m. Every kind is one
// instanced draw (a scanned prop's parts one each): rubble heaps, broken slabs, concrete barriers, sheets of corrugated
// metal, fallen poles, and the library's scans (CC0, Poly Haven, assets/sets: oil drums, old tyres, crates, boxes,
// rusty bins, a covered car). Now and then a barricade across a street (a gap left to ride through), and some heaps
// and drums burning (their fires are fx.js's). Nothing here casts a shadow or stops anyone: it is the street's dressing.
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { libModel } from '../storyrun/setkit.js';

const RADIUS = 230, RELAY = 45;
const hashI = (n) => { let t = (n + 0x6D2B79F5) >>> 0; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ── geometry made here, vertex-coloured ──
function paint(g, fn) {
  const p = g.attributes.position, c = new Float32Array(p.count * 3), col = new THREE.Color();
  for (let i = 0; i < p.count; i++) { fn(col, p.getX(i), p.getY(i), p.getZ(i), i); c.set([col.r, col.g, col.b], i * 3); }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g;
}
const strip = (g) => { g = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'color') g.deleteAttribute(k); return g; };
function rubbleGeo() {
  const R = rng(17), parts = [];
  const tones = [0x6e6a64, 0x7c776e, 0x5a5650, 0x8a8278, 0x4e4842, 0x6a5e52];
  for (let i = 0; i < 14; i++) {
    const r = 0.18 + R() * (i < 4 ? 0.55 : 0.3);
    let g = new THREE.DodecahedronGeometry(r, 0);
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) p.setXYZ(k, p.getX(k) * (0.8 + R() * 0.5), p.getY(k) * (0.5 + R() * 0.35), p.getZ(k) * (0.8 + R() * 0.5));
    const a = R() * Math.PI * 2, d = i < 4 ? R() * 0.5 : 0.3 + R() * 1.1;
    g.rotateY(R() * 3); g.rotateX((R() - 0.5) * 0.6);
    g.translate(Math.cos(a) * d, r * 0.35 + (i < 4 ? 0.15 : 0), Math.sin(a) * d);
    g = strip(g); g.computeVertexNormals();
    const tone = new THREE.Color(tones[i % tones.length]);
    paint(g, (c) => c.copy(tone).multiplyScalar(0.85 + R() * 0.3));
    parts.push(g);
  }
  // a bent rebar or two
  for (let i = 0; i < 3; i++) {
    let g = new THREE.CylinderGeometry(0.012, 0.012, 1.4 + R(), 4); g.rotateZ(0.6 + R() * 0.8); g.rotateY(R() * 3); g.translate((R() - 0.5) * 1.2, 0.5, (R() - 0.5) * 1.2);
    g = strip(g); paint(g, (c) => c.setHex(0x4a3020)); parts.push(g);
  }
  return mergeGeometries(parts);
}
function slabGeo() {
  let g = new THREE.BoxGeometry(1.8, 0.22, 1.2, 4, 1, 3);
  const R = rng(5), p = g.attributes.position;
  for (let k = 0; k < p.count; k++) if (Math.abs(p.getX(k)) > 0.8) p.setX(k, p.getX(k) * (0.75 + R() * 0.3));
  g = strip(g); g.computeVertexNormals();
  return paint(g, (c, x, y) => c.setHex(y > 0 ? 0x8a857c : 0x5e5a54));
}
function barrierGeo() {
  // a jersey barrier's profile, 3 m long
  const s = new THREE.Shape(); s.moveTo(-0.3, 0); s.lineTo(0.3, 0); s.lineTo(0.3, 0.08); s.lineTo(0.2, 0.25); s.lineTo(0.09, 0.82); s.lineTo(-0.09, 0.82); s.lineTo(-0.2, 0.25); s.lineTo(-0.3, 0.08);
  let g = new THREE.ExtrudeGeometry(s, { depth: 3, bevelEnabled: false }); g.translate(0, 0, -1.5);
  g = strip(g); g.computeVertexNormals();
  return paint(g, (c, x, y, z) => c.setHex(0x9a958a).multiplyScalar(0.8 + 0.2 * Math.sin(z * 3.1 + y * 7)));
}
function sheetGeo() {
  // corrugated metal, 2.4 x 1.0 m, rusted in patches
  let g = new THREE.PlaneGeometry(2.4, 1.0, 36, 1);
  const p = g.attributes.position;
  for (let k = 0; k < p.count; k++) p.setZ(k, Math.sin(p.getX(k) * 2 * Math.PI / 0.15) * 0.022);
  g.rotateX(-Math.PI / 2); g.translate(0, 0.03, 0);
  g = strip(g); g.computeVertexNormals();
  return paint(g, (c, x, y, z) => { const r = 0.5 + 0.5 * Math.sin(x * 2.3 + z * 4.1) * Math.sin(x * 0.7 - z * 2.9); c.setHex(0x7a8288).lerp(new THREE.Color(0x7a3c1c), Math.min(1, r * 1.3)); });
}
function poleGeo() {
  let g = new THREE.CylinderGeometry(0.09, 0.13, 8.5, 8); g.rotateZ(Math.PI / 2); g.translate(0, 0.12, 0);
  let arm = new THREE.CylinderGeometry(0.05, 0.05, 1.8, 6); arm.rotateX(Math.PI / 2); arm.translate(4.1, 0.12, 0.9);
  g = mergeGeometries([strip(g), strip(arm)]);
  return paint(g, (c) => c.setHex(0x4d5052));
}

export function createDebris(W, fx) {
  const app = W.app, scene = app.scene, N = window.NYC;
  const net = app.trafficSystem?.network;
  const group = new THREE.Group(); group.name = 'apoc-debris'; scene.add(group);
  const ground = (x, z) => { try { const y = app.controllerManager.getGroundHeight(x, z, 'person'); return Number.isFinite(y) ? y : N.Terrain.groundAt(x, z); } catch { return 0; } };
  const vmat = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.95, metalness: 0.0 });
  const sheetMat = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.35, side: THREE.DoubleSide });
  // kinds: { meshes: [InstancedMesh], cap, n, list }
  const kinds = {};
  function kind(name, cap, pieces) {
    const meshes = pieces.map(({ geometry, material }) => {
      const m = new THREE.InstancedMesh(geometry, material, cap);
      m.count = 0; m.castShadow = false; m.receiveShadow = true; m.frustumCulled = false; m.name = 'apoc-' + name;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      group.add(m); return m;
    });
    return (kinds[name] = { meshes, cap, n: 0 });
  }
  kind('rubble', 220, [{ geometry: rubbleGeo(), material: vmat }]);
  kind('slab', 130, [{ geometry: slabGeo(), material: vmat }]);
  kind('barrier', 40, [{ geometry: barrierGeo(), material: vmat }]);
  kind('sheet', 90, [{ geometry: sheetGeo(), material: sheetMat }]);
  kind('pole', 16, [{ geometry: poleGeo(), material: vmat }]);
  // the scans (loaded in the background: their kinds appear once they are in)
  const SCANS = { 'blue-drum': 70, 'red-drum': 70, 'old-tyre': 110, 'plastic-crate': 70, 'cardboard-box': 100, 'trash-cans': 60, 'covered-car': 10 };
  const SCAN_PARTS = { 'trash-cans': ['metal_trash_can_rust', 'metal_trash_can_rust_lid'] };
  const ready = Promise.all(Object.entries(SCANS).map(async ([id, cap]) => {
    try {
      const L = await libModel(id);
      const pieces = [];
      for (const [name, subs] of Object.entries(L.parts)) {
        if (SCAN_PARTS[id] && !SCAN_PARTS[id].includes(name)) continue;
        for (const s of subs) { const mat = s.material.clone(); mat.color.multiplyScalar(0.8); pieces.push({ geometry: s.geometry, material: mat }); }
      }
      kind(id, cap, pieces);
      dirty = true;
    } catch (e) { console.warn('[apocalypse] scan', id, e); }
  }));

  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), S = new THREE.Vector3(), P = new THREE.Vector3();
  function put(name, x, z, yaw, { s = 1, tilt = 0, roll = 0, dy = 0, y = null } = {}) {
    const k = kinds[name]; if (!k || k.n >= k.cap) return false;
    P.set(x, (y ?? ground(x, z)) + dy, z); E.set(tilt, yaw, roll, 'YXZ'); Q.setFromEuler(E); S.setScalar(s);
    M.compose(P, Q, S);
    for (const m of k.meshes) m.setMatrixAt(k.n, M);
    k.n++; return true;
  }
  const fires = []; fx.sources.set('debris', fires);
  const CLUTTER = ['old-tyre', 'old-tyre', 'cardboard-box', 'cardboard-box', 'plastic-crate', 'blue-drum', 'red-drum', 'trash-cans', 'sheet', 'rubble', 'slab'];

  function dressEdge(e, idx, cx, cz) {
    const R = rng(idx * 7919 + 13);
    const along = (s, r) => [e.sx + e.dx * s + e.rx * r, e.sz + e.dz * s + e.rz * r];
    const yaw0 = Math.atan2(e.dx, e.dz);
    const len = e.len;
    if (len < 30) return;
    // a barricade across this street (1 in 9 edges)
    if (R() < 0.14 && len > 50) {
      const s = 20 + R() * (len - 40), gap = (R() - 0.5) * e.half;
      for (let r = -e.half + 0.6; r < e.half - 0.6; r += 3.1) {
        if (Math.abs(r - gap) < 2.6) continue;
        const [x, z] = along(s, r);
        const pick = R();
        if (pick < 0.55) put('barrier', x, z, yaw0 + Math.PI / 2 + (R() - 0.5) * 0.25);
        else if (pick < 0.8) { put(R() < 0.5 ? 'blue-drum' : 'red-drum', x, z, R() * 6); put('sheet', x + e.dx * 0.6, z + e.dz * 0.6, yaw0 + Math.PI / 2, { tilt: -1.1, dy: 0.4 }); }
        else put('covered-car', x, z, yaw0 + Math.PI / 2 + (R() - 0.5) * 0.5) || put('rubble', x, z, R() * 6, { s: 1.2 });
      }
      // a drum fire at its end
      if (R() < 0.6) { const [x, z] = along(s - 1.5, e.half - 1.2); if (put('red-drum', x, z, R() * 6)) fires.push({ x, y: ground(x, z) + 0.9, z, s: 0.55 }); }
    }
    // a fallen pole now and then, across the gutter and the sidewalk
    if (R() < 0.08) { const s = 15 + R() * (len - 30), sd = R() < 0.5 ? 1 : -1; const [x, z] = along(s, sd * (e.half + 0.5)); put('pole', x, z, yaw0 + Math.PI / 2 + (R() - 0.5) * 0.8 + (sd < 0 ? Math.PI : 0), { tilt: 0, roll: 0.03 }); }
    // clutter in the gutters and on the sidewalks, every ~14 m
    // fallen facade in the lanes: heaps and slabs out in the road now and then
    for (let s = 14 + R() * 20; s < len - 14; s += 22 + R() * 30) {
      if (R() < 0.45) continue;
      const r = (R() - 0.5) * e.half * 1.4, [x, z] = along(s, r);
      put('rubble', x, z, R() * 6, { s: 0.7 + R() * 0.9 });
      if (R() < 0.6) put('slab', x + (R() - 0.5) * 3, z + (R() - 0.5) * 3, R() * 6, { tilt: (R() - 0.5) * 0.4, roll: (R() - 0.5) * 0.3, dy: 0.05 });
      if (R() < 0.4) put(R() < 0.5 ? 'old-tyre' : 'sheet', x + (R() - 0.5) * 4, z + (R() - 0.5) * 4, R() * 6, { tilt: R() < 0.5 ? Math.PI / 2 : 0 });
    }
    for (let s = 8 + R() * 6; s < len - 8; s += 6 + R() * 9) {
      const sd = R() < 0.5 ? 1 : -1;
      const onWalk = R() < 0.45;
      const r = sd * (onWalk ? e.half + 0.9 + R() * 2.0 : e.half - 0.4 - R() * 1.6);
      const [x, z] = along(s, r);
      if (onWalk && net.onSidewalk && !net.onSidewalk(x, z)) continue;
      const roll = R();
      if (roll < 0.3) {
        // a heap: rubble with things in it, sometimes burning
        put('rubble', x, z, R() * 6, { s: 0.8 + R() * 0.7 });
        for (let j = 0; j < 3; j++) put(CLUTTER[Math.floor(R() * CLUTTER.length)], x + (R() - 0.5) * 3, z + (R() - 0.5) * 3, R() * 6, { tilt: (R() - 0.5) * 0.4 });
        if (R() < 0.3) fires.push({ x, y: ground(x, z) + 0.5, z, s: 0.7 + R() * 0.6 });
      } else if (roll < 0.45) {
        put('slab', x, z, R() * 6, { tilt: (R() - 0.5) * 0.5, roll: (R() - 0.5) * 0.4, dy: 0.05 });
        put('rubble', x + 1.2, z, R() * 6, { s: 0.5 });
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

  let at = null, dirty = true;
  function layout(cx, cz) {
    at = { x: cx, z: cz }; dirty = false;
    for (const k of Object.values(kinds)) k.n = 0;
    fires.length = 0;
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
    for (const k of Object.values(kinds)) for (const m of k.meshes) { m.count = k.n; m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere?.(); }
  }
  function update(c) {
    const p = c.position;
    if (dirty || !at || Math.hypot(p.x - at.x, p.z - at.z) > RELAY) layout(p.x, p.z);
  }
  const count = () => Object.fromEntries(Object.entries(kinds).map(([k, v]) => [k, v.n]));
  return { update, ready, group, count, fires, put };
}
