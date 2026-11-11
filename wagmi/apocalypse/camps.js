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
  [-1352, 1036, 32, 22, 'both', 90],   // Civic Center: the plaza before City Hall
  [-978, 905, 9, 4, 'line', 45],       // UN Plaza, off Market
  [-480, 92, 14, 8, 'camp', 0],        // Union Square
  [-289, -676, 10, 6, 'camp', 0],      // Portsmouth Square
  [-2079, 770, 18, 9, 'camp', 0],      // Jefferson Square
];
const TENT = [0x5c6458, 0x6a6150, 0x4f5a62, 0x7a6a52, 0x5a4e48, 0x67705e, 0x4a4640, 0x7c5a3c];
const COAT = [0x4a4440, 0x56503f, 0x3e4448, 0x5e5248, 0x48403a, 0x5a5e52, 0x6a5a48];

export function createCamps(W, fx) {
  const app = W.app, scene = app.scene, N = window.NYC;
  const ground = (x, z) => { try { const y = app.controllerManager.getGroundHeight(x, z, 'person'); return Number.isFinite(y) ? y : N.Terrain.groundAt(x, z); } catch { return 0; } };
  const solid = (x, z, r = 1.2) => { try { const q = new THREE.Vector3(x, ground(x, z), z), q0 = q.clone(); app.controllerManager.resolveHorizontalCollision?.(q, r, q.y + 1); return Math.hypot(q.x - q0.x, q.z - q0.z) > 0.05; } catch { return false; } };
  const mat = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.95 });
  const fires = []; fx.sources.set('camps', fires);
  const crowd = N.PersonCrowd ? new N.PersonCrowd(96, { farDistance: 36, name: 'ApocCampPeople', farShadow: false }) : null;
  if (crowd) for (const m of crowd.meshes) scene.add(m);
  const people = [];
  const camps = [];

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
    const free = (x, z, r) => !solid(x, z, r);
    // tents round the middle, doors inward
    const spots = [];
    for (let i = 0, tries = 0; i < nTents && tries < 80; tries++) {
      const a = R() * Math.PI * 2, d = rad * (0.35 + 0.65 * Math.sqrt(R()));
      const x = cx + Math.sin(a) * d, z = cz + Math.cos(a) * d;
      if (!free(x, z, 1.6) || spots.some((s) => Math.hypot(s[0] - x, s[1] - z) < 3.2)) continue;
      spots.push([x, z]); i++;
      const y = ground(x, z), ry = Math.atan2(cx - x, cz - z), shade = TENT[Math.floor(R() * TENT.length)], t = R();
      if (t < 0.5) {
        // a dome
        const dome = new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.15 + R() * 0.3, 1.0 + R() * 0.2, 0.9);
        part(dome, shade, x, y, z, ry);
        part(new THREE.PlaneGeometry(0.7, 0.8), 0x1e2222, x + Math.sin(ry) * 0.92, y + 0.4, z + Math.cos(ry) * 0.92, ry);
      } else if (t < 0.8) {
        // a ridge tent: a tarp over a line
        const ridge = new THREE.CylinderGeometry(1.0, 1.0, 2.4, 3, 1, false).scale(1.0, 1.0, 1.0);
        ridge.rotateZ(Math.PI / 2); ridge.rotateX(Math.PI / 6); part(ridge, shade, x, y + 0.5, z, ry + Math.PI / 2);
      } else {
        // a lean-to: a tarp off a pole, a pallet under it
        part(new THREE.PlaneGeometry(2.6, 2.2), shade, x, y + 0.9, z, ry, -0.9);
        part(new THREE.CylinderGeometry(0.03, 0.03, 1.8, 5), 0x6a6258, x - Math.cos(ry) * 1.2, y + 0.9, z + Math.sin(ry) * 1.2);
        part(new THREE.BoxGeometry(1.2, 0.14, 1.0), 0x7a6a50, x, y + 0.07, z, ry);
      }
      // things beside it: a bag, a box
      part(new THREE.BoxGeometry(0.5, 0.35, 0.4), 0x6a5a44, x + Math.cos(ry) * 1.4, y + 0.17, z - Math.sin(ry) * 1.4, ry);
    }
    // barrel fires, people round them
    const nFires = kind === 'line' ? 1 : 2;
    for (let f = 0; f < nFires; f++) {
      let x = cx, z = cz;
      for (let k = 0; k < 20; k++) { const a = R() * 6.28, d = rad * 0.3 * R(); x = cx + Math.sin(a) * d; z = cz + Math.cos(a) * d; if (free(x, z, 1.4) && !spots.some((s) => Math.hypot(s[0] - x, s[1] - z) < 3)) break; }
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
    if (kind !== 'camp') {
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
      const nq = kind === 'line' ? 12 : 9;
      for (let i = 0; i < nq; i++) {
        people.push({ x: qx + (R() - 0.5) * 0.2, z: qz + (R() - 0.5) * 0.2, h: qh + Math.PI + (R() - 0.5) * 0.5, camp: ci, seed: ci * 50 + people.length });
        if (i === 5) qh += 0.9 * (R() < 0.5 ? 1 : -1);
        qx += Math.sin(qh) * 0.85; qz += Math.cos(qh) * 0.85;
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
    const mesh = new THREE.Mesh(g, mat); mesh.position.set(cx, y0, cz); mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = 'apoc-camp-' + ci;
    scene.add(mesh);
    camps.push({ x: cx, z: cz, mesh, kind });
  }
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
