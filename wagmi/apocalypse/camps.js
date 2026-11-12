// SF 2040: where the people left in the city gather. Camps on the open ground (tents and tarps, barrel fires, people
// round them) and food lines (a relief table under a tarp, a queue of people waiting at it), at a few places a city's
// people would go: the plazas, the squares. Everything here is invented: no group, sign or brand.
// The tents and tables are one merged mesh a camp (shown within SHOW m); the people are the city's own people
// (js/pedestrians.js: one instanced, skinned draw for every camp), standing and shifting their weight, drawn within
// PEOPLE_R m; the seated and the huddled are made in code as San Francisco's sidewalk scenes' people are.
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const SHOW = 520, PEOPLE_R = 170;
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// [x, z, radius, tents, kind: 'camp' | 'line' | 'both', facing (deg, the line's table faces this way)]
export const CAMPS = [
  [600, -668, 16, 9, 'both', 200],     // Sue Bierman Park, by the Ferry Building and the Embarcadero
  [-1318, 1040, 24, 16, 'both', 90],   // Civic Center: the plaza's east end, by Larkin (its middle is Old Silver's lair)
  [-978, 905, 9, 4, 'line', 45],       // UN Plaza, off Market
  [-480, 92, 14, 8, 'camp', 0],        // Union Square
  [-289, -676, 10, 6, 'camp', 0],      // Portsmouth Square
  [-2079, 770, 18, 9, 'camp', 0],      // Jefferson Square
];
const TENT = [0x5c6458, 0x6a6150, 0x4f5a62, 0x7a6a52, 0x5a4e48, 0x67705e, 0x4a4640, 0x7c5a3c];
const COAT = [0x4a4440, 0x56503f, 0x3e4448, 0x5e5248, 0x48403a, 0x5a5e52, 0x6a5a48];

export function createCamps(W, fx, { clear = [] } = {}) {
  const app = W.app, scene = app.scene, N = window.NYC;
  const ground = (x, z) => { try { const y = app.controllerManager.getGroundHeight(x, z, 'person'); return Number.isFinite(y) ? y : N.Terrain.groundAt(x, z); } catch { return 0; } };
  const solid = (x, z, r = 1.2) => { try { const q = new THREE.Vector3(x, ground(x, z), z), q0 = q.clone(); app.controllerManager.resolveHorizontalCollision?.(q, r, q.y + 1); return Math.hypot(q.x - q0.x, q.z - q0.z) > 0.05; } catch { return false; } };
  const mat = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide });
  const fires = []; fx.sources.set('camps', fires);
  // (circles kept clear of the camps, [x, z, r]: a story's lairs, where it fights)
  const kept = (x, z, r = 0) => clear.some(([a, b, R]) => Math.hypot(x - a, z - b) < R + r);
  const crowd = N.PersonCrowd ? new N.PersonCrowd(96, { farDistance: 36, name: 'ApocCampPeople', farShadow: false }) : null;
  if (crowd) for (const m of crowd.meshes) scene.add(m);
  const people = [];
  const camps = [];
  const scanAt = []; // [id, x, y, z, yaw]: the library's scans round the camps

  for (const [ci, [cx, cz, rad, nTents, kind, faceDeg]] of CAMPS.entries()) {
    const R = rng(ci * 101 + 7), parts = [];
    const y0 = ground(cx, cz);
    function part(g, hex, x, y, z, ry = 0, rx = 0, rz = 0) {
      g = g.index ? g.toNonIndexed() : g;
      for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
      g.rotateX(rx); g.rotateZ(rz); g.rotateY(ry); g.translate(x - cx, y - y0, z - cz);
      const c = new THREE.Color(hex), col = new Float32Array(g.attributes.position.count * 3);
      for (let i = 0; i < col.length; i += 3) { col[i] = c.r; col[i + 1] = c.g; col[i + 2] = c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3)); parts.push(g);
    }
    const free = (x, z, r) => !solid(x, z, r) && !kept(x, z, r);
    // tents round the middle, doors inward
    const spots = [];
    // a thin pole or line from a to b
    const rod = (a, b, r, hex) => {
      const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), len = d.length();
      const g = new THREE.CylinderGeometry(r, r, len, 5);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
      part(g, hex, (A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
    };
    // local (u along the tent's ridge, v across, h up) to world
    const at = (x, y, z, ry) => (u, h, v) => [x + Math.cos(ry) * u + Math.sin(ry) * v, y + h, z - Math.sin(ry) * u + Math.cos(ry) * v];
    function quad(P, a, b, c, d, hex) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([...P(...a), ...P(...b), ...P(...c), ...P(...a), ...P(...c), ...P(...d)], 3));
      g.computeVertexNormals(); part(g, hex, 0, 0, 0);
    }
    function tri(P, a, b, c, hex) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([...P(...a), ...P(...b), ...P(...c)], 3));
      g.computeVertexNormals(); part(g, hex, 0, 0, 0);
    }
    // (part() translates by -cx/-y0/-cz: world points are given here, so quads and tris add them back)
    const ridgeTent = (x, y, z, ry, hex, L = 2.4, W = 1.7, H = 1.25) => {
      const P = at(x, y, z, ry), sag = 0.08;
      // two sloped sides, sagging a little between the poles; the back end closed, the front door half open
      for (const s of [-1, 1]) {
        quad(P, [-L / 2, H, 0], [0, H - sag, 0], [0, 0.02, s * W / 2], [-L / 2, 0.02, s * W / 2], hex);
        quad(P, [0, H - sag, 0], [L / 2, H, 0], [L / 2, 0.02, s * W / 2], [0, 0.02, s * W / 2], hex);
      }
      tri(P, [-L / 2, H, 0], [-L / 2, 0.02, -W / 2], [-L / 2, 0.02, W / 2], hex);
      tri(P, [L / 2, H, 0], [L / 2, 0.02, -W / 2], [L / 2 + 0.25, 0.3, -W * 0.15], new THREE.Color(hex).multiplyScalar(0.8).getHex());
      // poles at the ends, guy lines out to stakes
      for (const u of [-L / 2, L / 2]) {
        rod(P(u, 0, 0), P(u, H + 0.08, 0), 0.016, 0x8a8a84);
        const e = Math.sign(u);
        rod(P(u, H, 0), P(u + e * 1.0, 0.02, 0), 0.005, 0xb0a890);
        for (const s of [-1, 1]) rod(P(u * 0.6, H * 0.55, s * W * 0.27), P(u * 0.6, 0.02, s * (W / 2 + 0.6)), 0.004, 0xb0a890);
      }
      // a sleeping bag out front
      const b = new THREE.CapsuleGeometry(0.22, 1.3, 3, 8); b.rotateZ(Math.PI / 2); b.scale(1, 0.55, 1);
      const bp = P(L / 2 + 0.9, 0.12, 0.3); part(b, [0x3a4a5a, 0x6a3a2a, 0x4a5a3a][Math.floor(R() * 3)], bp[0], bp[1], bp[2], ry + 0.3);
    };
    const tarp = (x, y, z, ry, hex) => {
      // a tarp sagging between four poles (two tall at the front, two short behind), a cart and bags under it
      const P = at(x, y, z, ry), W = 3.0, D = 2.6, n = 6, pos = [];
      const pt = (i, j) => { const u = (i / n - 0.5) * W, v = (j / n - 0.5) * D, h = 2.0 - (j / n) * 0.8 - Math.sin((i / n) * Math.PI) * Math.sin((j / n) * Math.PI) * 0.28; return P(u, h, v); };
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) pos.push(...pt(i, j), ...pt(i + 1, j), ...pt(i + 1, j + 1), ...pt(i, j), ...pt(i + 1, j + 1), ...pt(i, j + 1));
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals(); part(g, hex, 0, 0, 0);
      for (const [u, v, h] of [[-W / 2, -D / 2, 2.0], [W / 2, -D / 2, 2.0], [-W / 2, D / 2, 1.2], [W / 2, D / 2, 1.2]]) rod(P(u, 0, v), P(u, h, v), 0.025, 0x6a6258);
      // a shopping cart
      const c = P(0.6, 0, 0.2);
      part(new THREE.BoxGeometry(0.55, 0.45, 0.85), 0x8a8d8c, c[0], c[1] + 0.62, c[2], ry);
      part(new THREE.BoxGeometry(0.48, 0.3, 0.7), 0x6a5a44, c[0], c[1] + 0.7, c[2], ry);
      for (const s of [-1, 1]) rod(P(0.6 + s * 0.25, 0, -0.3), P(0.6 + s * 0.25, 0.4, -0.3), 0.015, 0x5a5c5c), rod(P(0.6 + s * 0.25, 0, 0.6), P(0.6 + s * 0.25, 0.4, 0.6), 0.015, 0x5a5c5c);
      const s2 = P(-0.7, 0.18, 0.3); part(new THREE.SphereGeometry(0.3, 8, 6).scale(1, 0.6, 0.8), 0x4a4a3a, s2[0], s2[1], s2[2]);
      const s3 = P(-0.9, 0.12, -0.5); const bag = new THREE.CapsuleGeometry(0.2, 1.4, 3, 8); bag.rotateZ(Math.PI / 2); bag.scale(1, 0.5, 1); part(bag, 0x5a3a2e, s3[0], s3[1], s3[2], ry);
    };
    const dome = (x, y, z, ry, hex) => {
      const d = new THREE.SphereGeometry(1, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.2, 1.0, 0.95);
      part(d, hex, x, y, z, ry);
      const P = at(x, y, z, ry);
      for (const a of [-0.62, 0.62]) { let prev; for (let i = 0; i <= 10; i++) { const t = (i * Math.PI) / 10, p = P(Math.cos(t) * 1.21 * Math.cos(a), Math.sin(t) * 1.01, Math.cos(t) * 0.96 * Math.sin(a)); if (prev) rod(prev, p, 0.012, 0x9d9f98); prev = p; } }
      const door = P(0, 0.42, 0.93); part(new THREE.CircleGeometry(0.42, 10, 0, Math.PI), 0x1e2222, door[0], door[1] - 0.4, door[2], ry);
    };
    // the tents packed close round the fires, in two loose rows, doors in
    for (let i = 0, tries = 0; i < nTents && tries < 120; tries++) {
      const a = R() * Math.PI * 2, d = rad * 0.55 * (0.4 + 0.6 * Math.sqrt(R()));
      const x = cx + Math.sin(a) * d, z = cz + Math.cos(a) * d;
      if (!free(x, z, 1.6) || spots.some((s) => Math.hypot(s[0] - x, s[1] - z) < (s[2] ? 3.6 : 2.7))) continue;
      const y = ground(x, z), ry = Math.atan2(cx - x, cz - z) + Math.PI / 2 + (R() - 0.5) * 0.4, shade = TENT[Math.floor(R() * TENT.length)], t = R();
      if (t < 0.45) ridgeTent(x, y, z, ry, shade);
      else if (t < 0.75) dome(x, y, z, ry - Math.PI / 2, shade);
      else tarp(x, y, z, ry, shade);
      spots.push([x, z, t >= 0.75]); i++;
      // a box, a crate, a drum beside it (the library's scans)
      const sx = x + Math.cos(ry) * 1.6, sz = z - Math.sin(ry) * 1.6;
      scanAt.push([['cardboard-box', 'plastic-crate', 'blue-drum', 'red-drum', 'old-tyre'][Math.floor(R() * 5)], sx, ground(sx, sz), sz, R() * 6]);
    }
    // barrel fires, people round them
    const nFires = kind === 'line' ? 1 : 2;
    for (let f = 0; f < nFires; f++) {
      let x = cx, z = cz;
      for (let k = 0; k < 20; k++) { const a = R() * 6.28, d = rad * 0.3 * R(); x = cx + Math.sin(a) * d; z = cz + Math.cos(a) * d; if (free(x, z, 1.4) && !spots.some((s) => Math.hypot(s[0] - x, s[1] - z) < 3)) break; }
      if (kept(x, z, 1.4)) continue;
      const y = ground(x, z);
      part(new THREE.CylinderGeometry(0.29, 0.29, 0.88, 12, 1, true), 0x5a2a18, x, y + 0.44, z);
      part(new THREE.CylinderGeometry(0.27, 0.27, 0.05, 12), 0x1a1210, x, y + 0.78, z);
      fires.push({ x, y: y + 0.85, z, s: 0.5 });
      const n = 3 + Math.floor(R() * 3);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + R() * 0.4, d = 1.1 + R() * 0.4;
        people.push({ x: x + Math.sin(a) * d, z: z + Math.cos(a) * d, h: Math.atan2(-Math.sin(a), -Math.cos(a)), camp: ci, seed: ci * 50 + people.length });
      }
    }
    // the food line: a table under a tarp, two behind it, the queue snaking away
    if (kind !== 'camp' && !kept(cx - Math.sin((faceDeg * Math.PI) / 180) * rad * 0.2, cz - Math.cos((faceDeg * Math.PI) / 180) * rad * 0.2, 16)) {
      const fh = (faceDeg * Math.PI) / 180, fx2 = Math.sin(fh), fz2 = Math.cos(fh), rx = Math.cos(fh), rz = -Math.sin(fh);
      const tx = cx - fx2 * rad * 0.2, tz = cz - fz2 * rad * 0.2, ty = ground(tx, tz);
      part(new THREE.BoxGeometry(3.2, 0.06, 0.9), 0x8a7a60, tx, ty + 0.8, tz, fh + Math.PI / 2);
      for (const sx of [-1.4, 1.4]) part(new THREE.BoxGeometry(0.06, 0.8, 0.8), 0x5a5048, tx + rx * sx, ty + 0.4, tz + rz * sx, fh + Math.PI / 2);
      // crates and sacks on it
      for (let i = 0; i < 5; i++) part(new THREE.BoxGeometry(0.4, 0.28, 0.32), i % 2 ? 0x8a6a40 : 0xb0a080, tx + rx * (i - 2) * 0.6, ty + 0.97, tz + rz * (i - 2) * 0.6, fh + R() * 0.3);
      // the tarp canopy on four poles
      for (const [a, b] of [[-1.8, -1.2], [1.8, -1.2], [-1.8, 1.0], [1.8, 1.0]]) part(new THREE.CylinderGeometry(0.035, 0.035, 2.5, 5), 0x6a6258, tx + rx * a + fx2 * b, ty + 1.25, tz + rz * a + fz2 * b);
      const tarp = new THREE.PlaneGeometry(3.9, 2.6); part(tarp, 0x3e5a6a, tx - fx2 * 0.1, ty + 2.45, tz - fz2 * 0.1, fh, -Math.PI / 2 + 0.12);
      // stacked boxes behind
      for (let i = 0; i < 4; i++) part(new THREE.BoxGeometry(0.5, 0.4, 0.5), 0x9a8460, tx - fx2 * 1.1 + rx * (i - 1.5) * 0.55, ty + 0.2 + (i % 2) * 0.4, tz - fz2 * 1.1 + rz * (i - 1.5) * 0.55, R());
      for (const sx of [-0.8, 0.8]) people.push({ x: tx - fx2 * 0.7 + rx * sx, z: tz - fz2 * 0.7 + rz * sx, h: fh, camp: ci, seed: ci * 50 + people.length });
      // the queue: out from the table, a bend in it
      let qx = tx + fx2 * 1.1, qz = tz + fz2 * 1.1, qh = fh;
      // (single file, each facing the back of the one ahead, a gentle curve near its end)
      const nq = kind === 'line' ? 14 : 12;
      for (let i = 0; i < nq; i++) {
        people.push({ x: qx + (R() - 0.5) * 0.08, z: qz + (R() - 0.5) * 0.08, h: qh + Math.PI + (R() - 0.5) * 0.15, camp: ci, seed: ci * 50 + people.length });
        if (i >= 8) qh += 0.12;
        qx += Math.sin(qh) * 0.95; qz += Math.cos(qh) * 0.95;
      }
      // the relief truck behind the table: a box van, its back open to the table
      const vx = tx - fx2 * 4.2, vz = tz - fz2 * 4.2, vy = ground(vx, vz);
      if (free(vx, vz, 2.6) && free(vx - fx2 * 2.9, vz - fz2 * 2.9, 1.6)) {
      part(new THREE.BoxGeometry(2.3, 2.3, 4.2), 0xb8b2a4, vx, vy + 1.55, vz, fh);
      part(new THREE.BoxGeometry(2.2, 1.6, 1.7), 0x6a6e70, vx - fx2 * 2.9, vy + 1.2, vz - fz2 * 2.9, fh);
      part(new THREE.BoxGeometry(2.0, 0.6, 0.05), 0x1a1c1e, vx - fx2 * 3.76, vy + 1.6, vz - fz2 * 3.76, fh);
      for (const [a, b] of [[-1.05, 1.3], [1.05, 1.3], [-1.05, -1.4], [1.05, -1.4], [-1.05, -3.1], [1.05, -3.1]]) {
        const w = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 12); w.rotateZ(Math.PI / 2);
        part(w, 0x1a1a1a, vx + rx * a + fx2 * b, vy + 0.42, vz + rz * a + fz2 * b, fh);
      }
      }
    }
    // seated figures by the tents (made in code, as the sidewalk scenes' are)
    for (const [x, z] of spots.slice(0, 4)) {
      if (R() < 0.4) continue;
      const a = R() * 6.28, px = x + Math.sin(a) * 1.6, pz = z + Math.cos(a) * 1.6, py = ground(px, pz), coat = COAT[Math.floor(R() * COAT.length)];
      part(new THREE.BoxGeometry(0.46, 0.36, 0.42), 0x5a5448, px, py + 0.18, pz, a);
      part(new THREE.CapsuleGeometry(0.19, 0.42, 3, 8), coat, px, py + 0.72, pz, a, 0.25);
      part(new THREE.SphereGeometry(0.12, 8, 6), 0x7a5a48, px + Math.sin(a) * 0.08, py + 1.12, pz + Math.cos(a) * 0.08);
      part(new THREE.SphereGeometry(0.13, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0x3a3430, px + Math.sin(a) * 0.06, py + 1.15, pz + Math.cos(a) * 0.06);
      part(new THREE.BoxGeometry(0.32, 0.16, 0.5), 0x34383c, px + Math.sin(a) * 0.25, py + 0.42, pz + Math.cos(a) * 0.25, a);
    }
    const g = mergeGeometries(parts); parts.forEach((p) => p.dispose());
    const mesh = new THREE.Mesh(g, mat); mesh.position.set(cx, y0, cz); mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = 'apoc-camp-' + ci; mesh.userData.noCamBlock = true; // (the camp merged into one mesh: its whole box is no wall for the lens, which shook the view at Mission 1's start)
    scene.add(mesh);
    camps.push({ x: cx, z: cz, mesh, kind });
  }
  // (anyone or anything set down in a kept-clear circle after all: taken out)
  for (let i = people.length - 1; i >= 0; i--) if (kept(people[i].x, people[i].z, 0.5)) people.splice(i, 1);
  for (let i = scanAt.length - 1; i >= 0; i--) if (kept(scanAt[i][1], scanAt[i][3], 0.6)) scanAt.splice(i, 1);
  // the library's scans by the tents (one instanced draw a kind, every camp's)
  import('../storyrun/setkit.js').then(async ({ libModel }) => {
    const M4 = new THREE.Matrix4(), Q4 = new THREE.Quaternion(), V1 = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
    for (const id of [...new Set(scanAt.map((s) => s[0]))]) {
      const list = scanAt.filter((s) => s[0] === id);
      try {
        const L = await libModel(id);
        for (const subs of Object.values(L.parts)) for (const sub of subs) {
          const m = new THREE.InstancedMesh(sub.geometry, sub.material, list.length);
          list.forEach(([, x, y, z, yaw], i) => m.setMatrixAt(i, M4.compose(new THREE.Vector3(x, y, z), Q4.setFromAxisAngle(up, yaw), V1)));
          m.castShadow = false; m.receiveShadow = true; m.frustumCulled = false; m.name = 'apoc-camp-' + id; m.userData.noCamBlock = true; scene.add(m);
        }
      } catch (e) { console.warn('[apocalypse] camp scan', id, e); }
    }
  });
  // the standing people's rigs
  if (crowd) for (const p of people) {
    const r = rng(p.seed * 31 + 5);
    const female = r() < 0.45;
    p.rig = new N.PersonRig({ seed: 900 + p.seed * 1.618, female, scale: (female ? 0.9 : 0.96) + r() * 0.08, girth: 0.85 + r() * 0.2, hair: female ? 0.7 : r() * 0.3, armSwing: 0.6, stride: 0.95 });
    p.sway = r() * 6.28;
  }
  const pg = (owner, x, z) => ground(x, z);
  let t = 0;
  function update(dt, c) {
    t += dt;
    const cp = c.position;
    for (const k of camps) k.mesh.visible = Math.hypot(k.x - cp.x, k.z - cp.z) < SHOW;
    if (!crowd) return;
    crowd.begin();
    for (const p of people) {
      const d = Math.hypot(p.x - cp.x, p.z - cp.z);
      if (d > PEOPLE_R) { p.rig.placed = false; continue; }
      // (standing: a slow shift of weight, a turn of the head's way now and then)
      const h = p.h + Math.sin(t * 0.21 + p.sway) * 0.18;
      p.rig.update(dt, p.x, p.z, h, pg, p, 0, true);
      crowd.add(p.rig, d);
    }
    crowd.end();
  }
  return { update, camps, people, fires, crowd };
}
