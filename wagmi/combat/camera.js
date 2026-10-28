// Mog City: the fight's camera, a layer over the city's chase camera (js/cameras.js is not touched: its update is
// wrapped at run time). In a fight the view keeps its own yaw instead of swinging behind Dan every time he turns to
// a man (the chase camera's orbit is set to it); the player still drags it round. It pulls back and lifts with the
// spread of the fight, shifts toward the crowd, drifts round to a man winding up off screen (when the mouse is idle),
// and turns a little off the axis when his man stands hidden straight behind him.
// What stands in the street is in its way: the buildings, Dan's parked car, street-tree trunks, lamp and signal poles,
// trash cans and the traffic's cars and buses. Blocked, the view comes in front of the thing (never nearer his body than
// MIN), rises over it when that clears it (a car, a can), or turns round him to a clear angle, never faster than ~90
// degrees a second. Tree crowns are leaves: it looks through them, but the lens itself stays out of them. A Suit right
// at the lens dissolves (a dither) instead of filling the view with his back. Whatever moves it last (a shake, a punch
// in, the blend back to the city's camera), it is kept HARD m off Dan's head, chest and hips, and in a slam or a
// takedown off the other man's too.
// Blows shake it, jolt it the way they go (and roll it a touch) and punch it in; a takedown gets a side angle on the two,
// a body slam a low one looking up at the man overhead (a brute's from wider and higher). It holds a beat on him and the
// last man after the fight while it comes round behind him, so the city's camera takes over looking the way he faces.
import * as THREE from 'three/webgpu';
import { clamp, damp, smooth, angWrap, hdist, fwd } from './util.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const lerpN = (a, b, t) => a + (b - a) * t;
const _UP = new THREE.Vector3(0, 1, 0);
const MIN = 1.75;    // the lens in a fight: never nearer his body than this (m)
const HARD = 1.6;    // ...nor, whatever else moves it, than this
const SWING = 1.6;   // the fastest it turns round him by itself (rad/s)
const NEAR = [0.3, -0.3, 0.6, -0.6], OFFS = [0.9, -0.9, 1.25, -1.25, 1.65, -1.65, 2.1, -2.1, 2.6, -2.6, Math.PI];
const CROWN = 2.6; // a street tree's trunk: solid to 2.6 m x its scale (its leaves above are looked through)

// ------------------------------------------------------------------ what stands in the street, for the city's camera
// The city's follow camera (js/cameras.js keepInView) keeps its lens off the buildings' collision boxes only. This gives
// it the rest, as boxes in the colliders' own form (turned ones with obb, minY for one off the ground): Dan's car
// parked (on foot), the traffic's cars and buses, and whatever the game has set in the street since the city was built
// (a mission's van or SUV, the rally's stage screen and trusses, a wreck): its solid meshes, prop-sized, gathered now and
// then, their boxes turned with them. A vehicle's box reaches a little over its roof, so the view on foot never skims
// low over it with the car filling the frame (cs.blockers(x, z, r, entity)).
export function createBlockers(c) {
  const app = c.app, cm = c.cm, scene = app.scene, W = c.W, car = W.car, P = W.person;
  const base = new Set(scene.children); // (the city's own: its colliders already stand for it)
  const TV = [...(app.trafficSystem?.cars || []), ...(app.trafficSystem?.buses || [])];
  const props = []; let scanT = -1, scanN = -1;
  const out = [], pool = [];
  const _c = new THREE.Vector3();
  const corners = [0, 1, 2, 3, 4, 5, 6, 7].map(() => new THREE.Vector3());
  const box = (k) => { const o = pool[k] || (pool[k] = { obb: { cx: 0, cz: 0, cs: 1, sn: 0, hx: 0, hz: 0 }, minX: 0, maxX: 0, minZ: 0, maxZ: 0, minY: -1e4, maxY: 0 }); o.minY = -1e4; return o; };
  const set = (o, cx, cz, yaw, hx, hz, minY, maxY) => {
    const b = o.obb; b.cx = cx; b.cz = cz; b.cs = Math.cos(yaw); b.sn = Math.sin(yaw); b.hx = hx; b.hz = hz;
    const ex = Math.abs(b.cs) * hx + Math.abs(b.sn) * hz, ez = Math.abs(b.sn) * hx + Math.abs(b.cs) * hz;
    o.minX = cx - ex; o.maxX = cx + ex; o.minZ = cz - ez; o.maxZ = cz + ez; o.minY = minY; o.maxY = maxY;
    return o;
  };
  // (a mesh that is ours to skip: Dan, his car, a Suit, a person; or not solid to look at: see-through, flat)
  const own = (o) => { for (let p = o; p; p = p.parent) if (p === car?.mesh || p === P?.mesh || p === W.dan?.root || p.userData?.noCamBlock) return true; return false; };
  function scan() {
    props.length = 0;
    for (const top of scene.children) {
      if (base.has(top)) continue;
      top.traverse((o) => {
        if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || o.isSprite || !o.geometry) return;
        const m = o.material; if (!m || Array.isArray(m) || m.transparent && !m.depthWrite || m.visible === false || m.blending === THREE.AdditiveBlending) return;
        const g = o.geometry; if (!g.boundingBox) g.computeBoundingBox(); const bb = g.boundingBox; if (!bb || bb.isEmpty()) return;
        o.updateWorldMatrix(true, false);
        const e = o.matrixWorld.elements, sx = Math.hypot(e[0], e[1], e[2]), sy = Math.hypot(e[4], e[5], e[6]), sz = Math.hypot(e[8], e[9], e[10]);
        const w = (bb.max.x - bb.min.x) * sx, h = (bb.max.y - bb.min.y) * sy, d = (bb.max.z - bb.min.z) * sz;
        // (prop-sized: as tall as a man's waist, a metre or more across one way, not a slab of ground or a whole block)
        if (Math.max(w, h, d) < 0.9 || Math.max(w, d) > 40 || Math.min(h, Math.max(w, d)) < 0.6 && h < 0.9) return;
        if (own(o)) return;
        props.push({ o, bb, r: 0.5 * Math.hypot(w, h, d) });
      });
    }
  }
  const visible = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
  // the boxes within r of (x, z); for `entity` (the one the camera follows: never its own box)
  return function blockers(x, z, r, entity, only) {
    out.length = 0; let k = 0;
    const onFoot = cm.activeMode !== 'car', all = only !== 'props';
    // (the street's things, gathered again every 1.5 s, or as soon as something was added to the scene or taken out)
    const now = performance.now();
    if (now - scanT > 1500 || scene.children.length !== scanN) { scanT = now; scanN = scene.children.length; scan(); }
    // his car, parked
    if (all && onFoot && car?.mesh?.visible && car.body && Math.abs(car.position.x - x) < r + 4 && Math.abs(car.position.z - z) < r + 4) {
      const B = car.body, h = car.heading, m = (B.z0 + B.z1) / 2;
      out.push(set(box(k++), car.position.x + Math.sin(h) * m, car.position.z + Math.cos(h) * m, h, B.hx, (B.z1 - B.z0) / 2, -1e4, car.position.y + B.top + 0.75));
    }
    // the traffic (driving: only one the lens would be in or right at, a car stopped close behind his: else every car
    // crossing behind him in traffic would pull the view in and let it out again)
    const L = app.cameraSystem.camera.position;
    if (all) for (const v of TV) {
      if (!v.edge || Math.abs(v.x - x) > r + 7 || Math.abs(v.z - z) > r + 7) continue;
      const hx = v.halfWidth || 0.95, hz = v.half || 2.3;
      if (!onFoot) { const dx = L.x - v.x, dz = L.z - v.z, cs = Math.cos(v.yaw), sn = Math.sin(v.yaw); if (Math.abs(dx * cs - dz * sn) > hx + 1 || Math.abs(dx * sn + dz * cs) > hz + 1) continue; }
      out.push(set(box(k++), v.x, v.z, v.yaw, hx, hz, -1e4, (v.y || 0) + (v.bus ? 3.2 : 1.6) + (onFoot ? 0.6 : 0.1)));
    }
    // the game's things in the street
    for (const p of props) {
      const e = p.o.matrixWorld.elements;
      if (Math.abs(e[12] - x) > r + p.r + 1 || Math.abs(e[14] - z) > r + p.r + 1 || !visible(p.o)) continue;
      // (its box's corners in the world, measured along its own turn: tipped or not, it fits round them)
      const bb = p.bb; let i = 0;
      for (const cx of [bb.min.x, bb.max.x]) for (const cy of [bb.min.y, bb.max.y]) for (const cz of [bb.min.z, bb.max.z]) corners[i++].set(cx, cy, cz).applyMatrix4(p.o.matrixWorld);
      const yaw = Math.atan2(-e[2], e[0]), cs = Math.cos(yaw), sn = Math.sin(yaw);
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const q of corners) { const lx = q.x * cs - q.z * sn, lz = q.x * sn + q.z * cs; x0 = Math.min(x0, lx); x1 = Math.max(x1, lx); z0 = Math.min(z0, lz); z1 = Math.max(z1, lz); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
      const lx = (x0 + x1) / 2, lz = (z0 + z1) / 2;
      _c.set(lx * cs + lz * sn, 0, -lx * sn + lz * cs);
      // (one off the ground, a sign or a screen up on its truss: from where it starts; one standing on it, from the ground)
      out.push(set(box(k++), _c.x, _c.z, yaw, (x1 - x0) / 2, (z1 - z0) / 2, y0 > cm.getGroundHeight(_c.x, _c.z, 'person') + 0.6 ? y0 : -1e4, y1));
    }
    void entity;
    return out;
  };
}

export function createFightCamera(c) {
  const cs = c.app.cameraSystem, cam = cs.camera, P = c.W.person, cm = c.cm;
  const blockers = cs.blockers = createBlockers(c);
  const st = { w: 0, yaw: null, lastOff: 0, idle: 9, dist: 5.6, pivot: new THREE.Vector3(), pivotOn: false, frame: new THREE.Vector3(),
    shake: 0, punchT: 9, punchK: 0, cine: null, look: new THREE.Vector3(), kick: new THREE.Vector3(), kickV: new THREE.Vector3(), roll: 0, rollV: 0,
    downK: 0, cueK: 0, canK: 0, over: 0, lift: 0, swing: 0, searchT: 0, elUp: 0, elWant: 0, freeD: 9, crownY: 0, handback: false, tgt: null, tgtV: new THREE.Vector3(), occlT: 0 };
  const _lens = new THREE.Vector3(), _f = new THREE.Vector3(), _t1 = new THREE.Vector3(), _t2 = new THREE.Vector3(), _t3 = new THREE.Vector3();

  // ------------------------------------------------------------------ the street round him
  // (the buildings near him, the trees and the poles: gathered now and then; the cans and the traffic every frame)
  const near = { at: new THREE.Vector3(1e9, 0, 0), t: 9, blds: [], trees: [], poles: [], cans: [], props: [] };
  let poles = null;
  // every lamp and signal pole in the city, once (the street details' instanced posts: tall, thin, standing on the street)
  function findPoles() {
    poles = [];
    const M = new THREE.Matrix4(), W = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    c.scene.traverse((o) => {
      if (!o.isInstancedMesh || o.parent?.name !== 'ManhattanStreetDetails') return;
      const g = o.geometry; if (!g.boundingBox) g.computeBoundingBox(); const b = g.boundingBox;
      o.updateWorldMatrix(true, false);
      for (let i = 0; i < o.count; i++) {
        o.getMatrixAt(i, M); W.multiplyMatrices(o.matrixWorld, M); W.decompose(p, q, s);
        const r = Math.max(b.max.x - b.min.x, b.max.z - b.min.z) * 0.5 * Math.max(s.x, s.z), y0 = p.y + b.min.y * s.y, y1 = p.y + b.max.y * s.y;
        if (r < 0.3 && y1 - y0 > 2.4 && y0 < 1.2) poles.push({ x: p.x + (b.min.x + b.max.x) * 0.5 * s.x, z: p.z + (b.min.z + b.max.z) * 0.5 * s.z, r: r + 0.06, y0: -9, y1 });
      }
    });
  }
  function refresh(q, dt) {
    near.t += dt;
    if (near.t >= 0.5 || hdist(near.at, q) > 2) {
      near.t = 0; near.at.copy(q);
      near.blds = cm.nearColliders(q.x, q.z, 16).slice();
      if (!poles) findPoles();
      near.poles = poles.filter((o) => Math.abs(o.x - q.x) < 22 && Math.abs(o.z - q.z) < 22);
      // (the game's things in the street: a mission's van, the rally's screen and trusses, a wreck: boxes like the traffic's)
      near.props = blockers(q.x, q.z, 16, null, 'props').map((b) => ({ x: b.obb.cx, z: b.obb.cz, cs: b.obb.cs, sn: b.obb.sn, hx: b.obb.hx, hz: b.obb.hz, top: b.maxY }));
      near.trees = [];
      // (the trees are drawn per 200 m cell, js/trees.js: the shown ones only)
      (treeRoot ||= c.scene.getObjectByName('Trees') || c.scene).traverseVisible((o) => {
        if (!o.isInstancedMesh || !o.count || !/^Trees_.*lod[01]$/.test(o.name)) return;
        const a = o.instanceMatrix.array;
        let ceil = null;
        for (let i = 0; i < o.count; i++) {
          const x = a[i * 16 + 12], z = a[i * 16 + 14]; if (Math.abs(x - q.x) > 22 || Math.abs(z - q.z) > 22) continue;
          ceil ||= leaves(o.geometry);
          const sx = Math.hypot(a[i * 16], a[i * 16 + 1], a[i * 16 + 2]), sy = Math.hypot(a[i * 16 + 4], a[i * 16 + 5], a[i * 16 + 6]), y = a[i * 16 + 13];
          near.trees.push({ x, z, r: 0.34, y0: -9, y1: y + CROWN * sy, y, sx, sy, ceil });
        }
      });
    }
    near.cans.length = 0;
    for (const I of c.items.list) if (I.kind === 'trashcan' && !I.holder && hdist(I.obj.position, q) < 14) near.cans.push({ x: I.obj.position.x, z: I.obj.position.z, r: 0.34, y0: -9, y1: I.obj.position.y + 0.5 });
  }
  // how low a tree's leaves hang, by the distance out from its trunk (its own units, a metre a step), once per model
  // (keyed by its vertex data, which every cell's mesh of a model shares)
  const ceils = new WeakMap();
  let treeRoot = null;
  function leaves(g) {
    let L = ceils.get(g.attributes.position); if (L) return L;
    L = new Array(9).fill(Infinity); const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const r = Math.hypot(p.getX(i), p.getZ(i)); if (r < 0.9) continue; const b = Math.min(8, Math.floor(r)), y = p.getY(i); if (y < L[b]) L[b] = y; }
    ceils.set(g.attributes.position, L); return L;
  }
  // a point inside a building (the city's collision boxes) or Dan's parked car
  // (pad: m round it; the city's collision boxes sit up to half a metre inside some facades, so the lens keeps that off)
  function inBld(b, x, y, z, pad = 0) {
    if (y > b.maxY + pad || x < b.minX - pad || x > b.maxX + pad || z < b.minZ - pad || z > b.maxZ + pad) return false;
    if (b.obb) { const o = b.obb, dx = x - o.cx, dz = z - o.cz; if (Math.abs(dx * o.cs - dz * o.sn) > o.hx + pad || Math.abs(dx * o.sn + dz * o.cs) > o.hz + pad) return false; }
    return true;
  }
  function solid(x, y, z, pad = 0) {
    if (c.carSolid(x, y, z, 0.1 + pad)) return true;
    const list = Math.abs(x - near.at.x) < 14 && Math.abs(z - near.at.z) < 14 ? near.blds : cm.nearColliders(x, z, 0.5 + pad);
    for (const b of list) if (inBld(b, x, y, z, pad)) return true;
    return false;
  }
  // how far along a line (from a, unit u, up to L) before it meets an upright cylinder (x, z, r, y0..y1)
  function hitCyl(a, ux, uy, uz, L, o) {
    const fx = a.x - o.x, fz = a.z - o.z, A = ux * ux + uz * uz; if (A < 1e-8) return L;
    const B = 2 * (fx * ux + fz * uz), C = fx * fx + fz * fz - o.r * o.r, D = B * B - 4 * A * C; if (D < 0) return L;
    const sq = Math.sqrt(D); let t0 = (-B - sq) / (2 * A), t1 = (-B + sq) / (2 * A);
    if (t1 < 0 || t0 > L) return L; t0 = Math.max(0, t0); t1 = Math.min(L, t1);
    // (inside it between t0 and t1: does the line pass within its height there?)
    const ya = a.y + uy * t0, yb = a.y + uy * t1;
    if (Math.min(ya, yb) > o.y1 || Math.max(ya, yb) < o.y0) return L;
    if (ya <= o.y1) return t0;
    return Math.abs(uy) > 1e-6 ? clamp((o.y1 - a.y) / uy, t0, t1) : L;
  }
  // ...or a box on the street (its centre, cos / sin of its yaw, half width, half length, top)
  function hitBox(a, ux, uy, uz, L, o) {
    const dx = a.x - o.x, dz = a.z - o.z;
    const ax = dx * o.cs - dz * o.sn, az = dx * o.sn + dz * o.cs, vx = ux * o.cs - uz * o.sn, vz = ux * o.sn + uz * o.cs;
    let t0 = 0, t1 = L;
    for (const [p, v, h] of [[ax, vx, o.hx], [az, vz, o.hz]]) {
      if (Math.abs(v) < 1e-9) { if (Math.abs(p) >= h) return L; continue; }
      let u0 = (-h - p) / v, u1 = (h - p) / v; if (u0 > u1) { const s = u0; u0 = u1; u1 = s; }
      t0 = Math.max(t0, u0); t1 = Math.min(t1, u1); if (t0 >= t1) return L;
    }
    const ya = a.y + uy * t0, yb = a.y + uy * t1;
    if (Math.min(ya, yb) > o.top) return L;
    if (ya <= o.top) return t0;
    return Math.abs(uy) > 1e-6 ? clamp((o.top - a.y) / uy, t0, t1) : L;
  }
  // how far the view from a toward b is clear (m)
  function firstBlock(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, L = Math.hypot(dx, dy, dz); if (L < 1e-4) return 0;
    const ux = dx / L, uy = dy / L, uz = dz / L;
    let t = L;
    for (const o of near.trees) t = Math.min(t, hitCyl(a, ux, uy, uz, t, o));
    for (const o of near.poles) t = Math.min(t, hitCyl(a, ux, uy, uz, t, o));
    for (const o of near.cans) t = Math.min(t, hitCyl(a, ux, uy, uz, t, o));
    for (const o of c.vehs || []) t = Math.min(t, hitBox(a, ux, uy, uz, t, o));
    for (const o of near.props) t = Math.min(t, hitBox(a, ux, uy, uz, t, o));
    for (let s = 0.4; s < t; s += 0.25) if (solid(a.x + ux * s, a.y + uy * s, a.z + uz * s, s > 1.2 ? 0.55 : 0)) return Math.max(0, s - 0.3);
    return t;
  }
  // the lens in the room round a car or a bus (or his parked car), lower than well over its roof: the car fills the view
  function overBox(p) {
    const car = c.W.car;
    if (c.carSolid(p.x, Math.min(p.y, car.position.y + 1.0), p.z, 1.0) && p.y < car.position.y + 4.2) return true;
    for (const o of c.vehs || []) { const dx = p.x - o.x, dz = p.z - o.z; if (Math.abs(dx * o.cs - dz * o.sn) < o.hx + 0.9 && Math.abs(dx * o.sn + dz * o.cs) < o.hz + 0.9 && p.y < o.top + 1.4) return true; }
    for (const o of near.cans) if (Math.hypot(p.x - o.x, p.z - o.z) < 0.85 && p.y < o.y1 + 1.0) return true; // (a can right under the lens)
    return false;
  }
  // in a tree's leaves: the height the lens must stay under there to be clear of them (or Infinity)
  function crownCap(p) {
    let y = Infinity;
    for (const o of near.trees) {
      const r = Math.hypot(p.x - o.x, p.z - o.z) / o.sx; if (r > 8.5) continue;
      const b = Math.min(8, Math.floor(r)), lo = Math.min(o.ceil[b], o.ceil[Math.max(0, b - 1)], b < 8 ? o.ceil[b + 1] : Infinity); // (a step either way: leaves have size)
      if (lo < Infinity) y = Math.min(y, o.y + lo * o.sy - 0.3);
    }
    return y;
  }
  // a trunk or a pole across the view from a to b (his man hidden behind one)
  function thinBlock(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, L = Math.hypot(dx, dy, dz); if (L < 0.5) return false;
    const ux = dx / L, uy = dy / L, uz = dz / L;
    for (const o of near.trees) if (hitCyl(a, ux, uy, uz, L, o) < L - 0.3) return true;
    for (const o of near.poles) if (hitCyl(a, ux, uy, uz, L, o) < L - 0.3) return true;
    return false;
  }
  // what a lens at this yaw and elevation gets: how far out it can go (to want), whether it would sit in a crown, and
  // whether a trunk or a pole would stand between it and his man (st.tgt)
  function view(yaw, el, want) {
    lensAt(yaw, el, want + 0.3, _t2);
    let free = Math.min(want, firstBlock(st.pivot, _t2) - 0.3);
    // (right over a car: in until it isn't, if that leaves enough)
    for (let k = 0; k < 6 && free > MIN; k++) { lensAt(yaw, el, free, _t3); if (!overBox(_t3)) break; free -= 0.5; }
    lensAt(yaw, el, Math.max(free, MIN), _t3);
    return { free: Math.max(0, free), crown: _t3.y > crownCap(_t3), occl: !!st.tgt && thinBlock(_t3, st.tgt) };
  }

  // ------------------------------------------------------------------ the frame
  const orig = cs.update.bind(cs);
  cs.update = function (dt, elapsed) {
    c.frame(dt);
    if (c.W.cutscene || c.W.directed) { st.w = 0; st.cine = null; st.handback = false; } // a cutscene owns the camera at once
    const want = c.cameraWants() && cs.activePresetId === 'chase';
    st.w = damp(st.w, want ? 1 : 0, want ? 2.4 : 1.6, dt);
    const w = smooth(st.w);
    if (st.w > 0.003) {
      if (st.yaw == null) { cam.getWorldDirection(_v); st.yaw = Math.atan2(_v.x, _v.z); st.lastOff = cs.orbitYawOffset; st.idle = 0; }
      // the player's drag, then (mouse idle) the drift toward what matters
      const drag = angWrap(cs.orbitYawOffset - st.lastOff);
      if (Math.abs(drag) > 1e-5) { st.yaw += drag; st.idle = 0; st.swing = 0; } else st.idle += dt;
      const H = cm.getActiveEntity().heading;
      if (want && c.me.fighting) assist(dt, w);
      // the fight over (nobody near him on his feet): round behind him while it holds on the two of them, so the city's
      // camera takes over looking the way he faces
      else if (st.idle > 0.3 && !st.cine && !(cm.footMove && cm.footMove.mag > 0.1)) { const d = angWrap(H - st.yaw); st.yaw += Math.sign(d) * Math.min(Math.abs(d), Math.min(SWING, 0.5 + 2.2 * Math.abs(d)) * dt); st.swing = 0; }
      cs.orbitYawOffset = angWrap(st.yaw - H); st.lastOff = cs.orbitYawOffset;
      cs.userOrbitTimer = Math.max(cs.userOrbitTimer, 0.5);
      st.handback = true;
    } else {
      st.yaw = null;
      // (handed back with an orbit left over: eased out, standing or not, unless the player takes the view himself)
      if (st.handback) {
        const o = angWrap(cs.orbitYawOffset);
        if (cs.isDragging || cs.userOrbitTimer > 0.6 || c.cm.activeMode !== 'person' || Math.abs(o) < 0.005) st.handback = false;
        else cs.orbitYawOffset = o - Math.sign(o) * Math.min(Math.abs(o), Math.min(SWING, 0.4 + 2.2 * Math.abs(o)) * dt);
      }
    }
    orig(dt, elapsed);
    const t0 = performance.now();
    if (st.w > 0.003 && cs.activePresetId === 'chase') frameFight(dt, w);
    else st.pivotOn = false;
    if (st.cine) cineShot();
    if (st.dbg) debugView();
    cam.updateMatrixWorld();
    effects(dt);
    if (!st.dbg && (st.w > 0.003 || st.cine) && c.cm.activeMode === 'person') keepOff();
    cam.updateMatrixWorld();
    fadeNear();
    c.cost += performance.now() - t0;
    c.afterCamera(dt);
  };
  // the lens for a yaw, elevation and distance about the pivot
  function lensAt(yaw, el, dist, out) { const f = fwd(yaw, _f); out.copy(st.pivot).addScaledVector(f, -Math.cos(el) * dist); out.y += Math.sin(el) * dist; return out; }
  function frameFight(dt, w) {
    const q = P.position, me = c.me, Q = c.W.dan, mv = me.moveName(), down = me.down();
    refresh(q, dt);
    // the fight's centre: the men near (on their feet or not), his own man counting double; after the last of them,
    // the last body too (the view stays on the two of them a moment)
    let n = 0, spread = 0; const cen = _v.set(0, 0, 0);
    for (const e of c.enemies) {
      if (!e.alive || e.state === 'idle') continue; const d = hdist(e.pos, q); if (d > 13) continue;
      const k = e === me.target || e === me.focus ? 2 : 1; n += k; cen.x += e.pos.x * k; cen.z += e.pos.z * k; spread = Math.max(spread, d);
    }
    const lg = c.lingering() ? c.linger.at : null;
    if (lg && hdist(lg, q) < 13) { n += 2; cen.x += lg.x * 2; cen.z += lg.z * 2; spread = Math.max(spread, hdist(lg, q)); }
    // (down to the last one or two on their feet: the frame leans further their way, and pulls back to keep them in it)
    const few = lastFew(q);
    if (few.length) for (const e of few) spread = Math.max(spread, Math.min(16, hdist(e.pos, q)));
    const lean = lg ? 0.45 : few.length ? 0.42 : 0.3;
    const off = n ? _v2.set(cen.x / n - q.x, 0, cen.z / n - q.z).multiplyScalar(lean) : _v2.set(0, 0, 0);
    // (a man winding up: the view pulls back to take him in, and the frame leans halfway to the middle of the two of them)
    const wt = winder(q);
    if (wt) { const d = hdist(wt.pos, q); spread = Math.max(spread, Math.min(16, d)); off.x += ((wt.pos.x - q.x) * 0.5 - off.x) * 0.5; off.z += ((wt.pos.z - q.z) * 0.5 - off.z) * 0.5; }
    if (off.length() > (few.length || wt ? 2.2 : 1.6)) off.setLength(few.length || wt ? 2.2 : 1.6);
    st.frame.x = damp(st.frame.x, off.x, 2.2, dt); st.frame.z = damp(st.frame.z, off.z, 2.2, dt);
    // (down: the view on his chest as he lies, looking down on him from further back)
    st.downK = damp(st.downK, down ? 1 : 0, down ? 4 : 2, dt);
    const piv = _v.set(q.x + st.frame.x, q.y + 1.15, q.z + st.frame.z);
    if (st.downK > 0.01 && Q.bones.spine03) { Q.bones.spine03.getWorldPosition(_t1); piv.lerp(_t1.setY(Math.max(q.y + 0.45, _t1.y + 0.3)), st.downK); }
    // (mid-dodge or going down, the view keeps right up with him)
    const follow = mv === 'dodge' || down ? 22 : 9;
    if (!st.pivotOn) { st.pivot.copy(piv); st.pivotOn = true; st.freeD = 9; st.elUp = st.elWant = 0; st.swing = 0; } else st.pivot.lerp(piv, 1 - Math.exp(-follow * dt));
    // a cue showing: a little higher; a can going up over his head: higher and further back, to see where it goes
    const cue = c.threats.length > 0, canUp = !!me.holding && me.holding.def.hands === 2 && (mv === 'throw' || mv === 'canSlam');
    st.cueK = damp(st.cueK, cue ? 1 : 0, cue ? 6 : 2, dt); st.canK = damp(st.canK, canUp ? 1 : 0, canUp ? 6 : 2, dt);
    const wantD = clamp(4.0 + (spread - 3) * 0.22, 3.8, few.length ? 6.8 : 6.2) * cs.zoomMultiplier + 1.3 * st.downK + 0.6 * st.canK;
    st.dist = damp(st.dist, wantD, 1.6, dt);
    // (a crowd round him: a little higher, to see over the ones nearest the lens)
    let crowd = 0; for (const e of c.enemies) if (e.standing && hdist(e.pos, q) < 4.2) crowd++;
    st.crowdK = damp(st.crowdK || 0, clamp((crowd - 2) * 0.045, 0, 0.16), 1.5, dt);
    const el0 = clamp(0.27 + st.crowdK + (cs.orbitPitchOffset - 0.09) * 0.9 + 0.08 * st.cueK + 0.32 * st.downK + 0.18 * st.canK, 0.06, 1.15);
    // ---- what is in the way. Not enough room along the yaw: up over it when that clears it (a car, a can, a man's
    // head), else round to the nearest clear angle (a trunk, a pole, a wall right behind him, his man behind a pole),
    // never in a hurry
    const good = Math.min(st.dist, 2.9);
    const tg = me.target?.alive && c.time - me.lastAttackT < 2.5 ? me.target : me.focus?.alive ? me.focus : null;
    st.tgt = tg && hdist(tg.pos, q) < 7 ? tg.chest(st.tgtV) : null;
    let v = view(st.yaw, el0 + st.elUp, st.dist);
    st.occlT = v.occl ? st.occlT + dt : 0;
    st.searchT -= dt;
    if ((v.free < good - 0.05 || v.crown || st.occlT > 0.25) && st.searchT <= 0 && !st.swing) {
      st.searchT = 0.12;
      const cur = v.free - (v.crown ? 1.2 : 0) - (v.occl ? 1.0 : 0);
      const pick = (offs) => {
        let best = 0, bs = cur + 0.3;
        for (const o of offs) {
          const vv = view(st.yaw + o, el0, st.dist); if (vv.free < MIN + 0.25) continue;
          const s = vv.free - Math.abs(o) * 0.9 - (vv.crown ? 1.2 : 0) - (vv.occl ? 1.0 : 0);
          if (s > bs) { bs = s; best = o; }
        }
        return best;
      };
      // (a little way round first; then up over it; then as far round as it takes; then up, at least)
      const up = Math.min(0.5, 0.9 - el0), vu = up > 0.12 ? view(st.yaw, el0 + up, st.dist) : null;
      let o = st.idle > 0.3 ? pick(NEAR) : 0;
      if (o) { st.swing = o; st.elWant = 0; }
      else if (vu && vu.free >= good && !vu.crown && !vu.occl) st.elWant = up;
      else if (st.idle > 0.3 && (o = pick(OFFS))) { st.swing = o; st.elWant = 0; }
      else if (vu && vu.free > v.free + 0.5) st.elWant = up;
    } else if (st.elWant > 0 && st.searchT <= 0) { // (risen over something: back down once the view is clear without it)
      st.searchT = 0.25; const vd = view(st.yaw, el0, st.dist); if (vd.free >= good && !vd.crown && !vd.occl) st.elWant = 0;
    }
    st.elUp = damp(st.elUp, st.elWant, st.elWant > st.elUp ? 4 : 1.2, dt);
    if (st.swing) { // (eased in and out, at most SWING; the player's own drag stops it)
      const s = Math.sign(st.swing) * Math.min(Math.abs(st.swing), Math.min(SWING, 0.5 + 2.4 * Math.abs(st.swing)) * dt);
      st.yaw += s; st.swing -= s; if (Math.abs(st.swing) < 2e-3) { st.swing = 0; st.searchT = 0.3; }
    }
    const el = el0 + st.elUp;
    v = view(st.yaw, el, st.dist);
    // in front of what is in the way at once, back out slowly
    st.freeD = v.free < st.freeD ? v.free : damp(st.freeD, v.free, 2.2, dt);
    const lens = lensAt(st.yaw, el, Math.max(MIN, Math.min(st.dist, st.freeD)), _lens);
    // (a wall nearer him than MIN: the lens can't be in it; up over him, looking down, until the turn round is done)
    if (st.freeD < MIN && solid(lens.x, lens.y, lens.z)) { lensAt(st.yaw, el, Math.max(0.3, st.freeD), lens); lens.y = Math.max(lens.y, st.pivot.y + Math.sqrt(Math.max(0, MIN * MIN - st.freeD * st.freeD))); }
    // a man between the lens and Dan: the view rises over him (and comes in a little)
    let lift = 0;
    for (const e of c.enemies) {
      if (!e.alive || e.state === 'down' || e.state === 'idle') continue;
      const top = e.pos.y + 1.75 * e.scale, r = 0.42 * e.scale;
      for (let k = 0.1; k <= 0.62; k += 0.13) { // along the lens half of the view (men by Dan are the fight, not in the way)
        const x = lerpN(lens.x, st.pivot.x, k), y = lerpN(lens.y, st.pivot.y, k), z = lerpN(lens.z, st.pivot.z, k);
        if (y > top + 0.1 || y < e.pos.y) continue;
        if (Math.hypot(x - e.pos.x, z - e.pos.z) < r + 0.2) { lift = Math.max(lift, (top + 0.3 - y) * (1 - k * 0.8)); break; }
      }
    }
    st.lift = damp(st.lift, Math.min(1.4, lift), lift > st.lift ? 4 : 1.5, dt);
    if (st.lift > 0.01) { lens.y += st.lift; lens.lerp(st.pivot, Math.min(0.2, st.lift * 0.1)); }
    // a man standing right at the lens: a little up (he dissolves too, see fadeNear)
    let over = 0;
    for (const e of c.enemies) {
      if (!e.alive || !e.standing) continue;
      const d = Math.hypot(lens.x - e.pos.x, lens.z - e.pos.z); if (d > 1.0 * e.scale) continue;
      over = Math.max(over, (1 - smooth((d - 0.4 * e.scale) / (0.6 * e.scale))) * Math.max(0, e.pos.y + 1.9 * e.scale + 0.2 - lens.y) * 0.5);
    }
    st.over = damp(st.over, over, over > st.over ? 8 : 2, dt);
    if (st.over > 0.005) lens.y += st.over;
    // (out of the leaves: under the crown)
    const cap = crownCap(lens); st.crownY = cap;
    if (lens.y > cap) lens.y = Math.max(cap, st.pivot.y + 0.15);
    // (no higher than the view needs next to a wall: never looking straight down on him)
    lens.y = Math.min(lens.y, st.pivot.y + Math.max(2.6, hdist(lens, st.pivot) * 1.3 + 0.6) + 1.6 * st.downK);
    lens.y = Math.max(lens.y, cm.getGroundHeight(lens.x, lens.z, 'person') + 0.4);
    cam.position.lerp(lens, w);
    st.look.lerpVectors(cs.currentLookAt, st.pivot, w);
    cam.lookAt(st.look);
  }
  // the very last word on where the lens is: never nearer his head, chest or hips than HARD (nor, in a slam or a
  // takedown, the other man's): back out along the line from the nearest, or up where a wall stands there
  const BODY = ['root', 'spine03', 'head'], MAN = ['hips', 'spine2', 'head'];
  function keepOff() {
    const Q = c.W.dan.bones, T = st.cine ? st.cine.target : null, p = cam.position;
    let moved = false;
    for (let it = 0; it < 3; it++) {
      let nd = Infinity;
      for (const b of BODY) { const bn = Q[b]; if (!bn) continue; bn.getWorldPosition(_t1); const d = _t1.distanceTo(p); if (d < nd) { nd = d; _t2.copy(_t1); } }
      if (T && T.bones) for (const b of MAN) { const bn = T.bones[b]; if (!bn) continue; bn.getWorldPosition(_t1); const d = _t1.distanceTo(p); if (d < nd) { nd = d; _t2.copy(_t1); } }
      if (nd >= HARD) break;
      const push = HARD - nd + 0.02; _t3.subVectors(p, _t2); if (_t3.lengthSq() < 1e-6) _t3.set(0, 1, 0); _t3.normalize();
      const x = p.x + _t3.x * push, y = p.y + _t3.y * push, z = p.z + _t3.z * push;
      if (!solid(x, y, z)) p.set(x, y, z); else p.y += push;
      moved = true;
    }
    if (moved) { cam.lookAt(st.cine ? st.cineLook : st.look); if (Math.abs(st.roll) > 1e-4) cam.rotateZ(st.roll); }
  }
  // a Suit (on his feet or lying) within about a metre of the lens dissolves, so his back never fills the view
  function fadeNear() {
    const p = cam.position, off = !!(st.dbg || c.W.cutscene || c.W.directed); // (a cutscene frames its own shots)
    for (const e of c.enemies) {
      let k = 1;
      const b0 = e.bones.hips, b1 = e.bones.head;
      if (b0 && b1 && !off && Math.abs(e.pos.x - p.x) < 3 && Math.abs(e.pos.z - p.z) < 3) {
        b0.getWorldPosition(_t1); b1.getWorldPosition(_t2);
        const ab = _t3.subVectors(_t2, _t1), u = clamp(_v.subVectors(p, _t1).dot(ab) / Math.max(1e-6, ab.lengthSq()), 0, 1);
        k = smooth((_t1.addScaledVector(ab, u).distanceTo(p) - 0.45 * e.scale) / (0.85 * e.scale));
      }
      e.setFade(k);
    }
  }
  // the man winding up soonest to land (alive, not a thrown thing), or null
  function winder(q) {
    let tgt = null, best = Infinity;
    for (const t of c.threats) { const r = t.at - c.time; if (r > 0 && r < best && !t.item && t.e?.alive && hdist(t.e.pos, q) < 13) { best = r; tgt = t.e; } }
    return tgt;
  }
  function assist(dt, w) {
    const q = P.position, me = c.me;
    if (st.cine || st.swing) { st.thr = null; return; }
    // a man winding up outside the view (by where he is on the screen): round toward him at once (the player's own drag
    // in the last 0.25 s always wins), quicker the sooner his blow lands, until both of them are in it: the view's yaw
    // ~0.45 rad short of him, on Dan's side. Walking (camera-relative), no faster than 2 rad/s, so W keeps its meaning
    let tgt = null, best = Infinity;
    for (const t of c.threats) { const r = t.at - c.time; if (r > 0 && r < best && !t.item && t.e?.alive) { best = r; tgt = t; } }
    if (tgt && st.idle >= 0.25) {
      // (short of him by 0.45 rad on a landscape screen; less on a narrower one, a phone held upright)
      const half = Math.atan(Math.tan(cam.fov * Math.PI / 360) * cam.aspect), lead = Math.min(0.45, 0.6 * half);
      const e = tgt.e, rel = angWrap(Math.atan2(e.pos.x - q.x, e.pos.z - q.z) - st.yaw), over = Math.abs(rel) - lead;
      if (st.thr !== e && !inView(e, _t1)) st.thr = e;
      if (st.thr === e && over > 0.02) {
        let rate = clamp(over / Math.max(0.15, (tgt.at - c.time) - 0.15), 1.4, 3.5);
        if (cm.footMove && cm.footMove.mag > 0.1) rate = Math.min(rate, 2.0);
        st.yaw += Math.sign(rel) * Math.min(over, rate * dt * w);
        return;
      }
      if (st.thr === e) st.thr = null;
      if (st.idle >= 0.5 && offAxis(e, dt, w, 1.5)) return;
    } else st.thr = null;
    if (st.idle < 0.5) return;
    // the last one or two on their feet out of the view: round toward him until he is well inside it (the player's own
    // look, the mouse, always wins)
    if (frameFoe(dt, w)) return;
    // his man straight ahead along the view (hidden behind him): round to ~40 degrees off it, on the side he is already
    if (st.idle < 1.0) return;
    const tg = me.target?.alive && c.time - me.lastAttackT < 2.5 ? me.target : null;
    if (tg) offAxis(tg, dt, w, 1.1);
  }
  // the men still standing in the fight (alive, awake, within 18 m), when only one or two are: the ones to keep framed
  const _few = [];
  function lastFew(q) {
    _few.length = 0; let n = 0;
    for (const e of c.enemies) { if (!e.alive || e.state === 'idle') continue; if (e.standing || e.state === 'getup') { n++; if (hdist(e.pos, q) < 18) _few.push(e); } }
    if (n > 2) _few.length = 0;
    return _few;
  }
  // where a man stands in the view (x across it, -1..1; behind the lens: off it)
  function inView(e, out) { e.chest(out).project(cam); return out.z < 1 && Math.abs(out.x) < 0.62 && Math.abs(out.y) < 0.85; }
  function frameFoe(dt, w) {
    const q = P.position, few = lastFew(q);
    // (with more of them up the view keeps its own yaw, as it always has: the edge arrows show the ones out of it)
    let foe = null, best = Infinity;
    for (const e of few) if (!inView(e, _t1)) { const d = hdist(e.pos, q); if (d < best) { best = d; foe = e; } }
    if (!foe) return false;
    const rel = angWrap(Math.atan2(foe.pos.x - q.x, foe.pos.z - q.z) - st.yaw);
    // (not round into a wall or a tree: the way it would go is checked first)
    const step = Math.sign(rel) * Math.min(Math.abs(rel), Math.min(1.5, 0.6 + 1.2 * Math.abs(rel)) * dt * w);
    const vv = view(st.yaw + Math.sign(rel) * 0.25, 0.3, Math.min(st.dist, 4)); if (vv.free < MIN + 0.3) return false;
    st.yaw += step;
    return true;
  }
  function offAxis(e, dt, w, rate) {
    const q = P.position; if (hdist(e.pos, q) < 0.6) return false;
    const ys = Math.atan2(e.pos.x - q.x, e.pos.z - q.z), dA = angWrap(ys - st.yaw);
    if (Math.abs(dA) >= 0.5) return false;
    const goal = ys - (dA >= 0 ? 1 : -1) * 0.7, step = angWrap(goal - st.yaw);
    // (not round into a tree or a wall)
    const vv = view(st.yaw + clamp(step, -0.3, 0.3), 0.3, Math.min(st.dist, 4)); if (vv.free < MIN + 0.4) return false;
    st.yaw += clamp(step, -rate * dt * w, rate * dt * w);
    return true;
  }
  // the takedown and the slam: an angle from the side that frames both (clear of walls, poles, the traffic, the men
  // standing about), eased in and out; the slam's from down by the street (a brute's from wider and higher)
  function cineShot() {
    const S = st.cine; S.t += c.dt || 0; // (on the fight's clock: a slow motion inside it stretches it too)
    // (a man winding up meanwhile: the shot gives the view back soon, so his cue can be seen)
    if (c.threats.some((t) => t.e !== S.target)) S.dur = Math.min(S.dur, S.t + 0.3);
    const k = smooth(S.t / 0.3) * (1 - smooth((S.t - S.dur + 0.35) / 0.35));
    if (S.t > S.dur || !S.target) { st.cine = null; return; }
    refresh(P.position, 0);
    const a = _v.copy(P.position); a.y += 1.0;
    const tp = S.target.chest(_v2);
    const mid = a.clone().lerp(tp, 0.5), span = a.distanceTo(tp), big = S.target.type === 'brute';
    const wide = S.low && big ? 1.3 : 0;
    if (!S.side) {
      const ax = new THREE.Vector3(tp.x - a.x, 0, tp.z - a.z).normalize(), want = 2.8 + span * 0.8 + wide;
      let bestS = null, bs = -Infinity;
      for (const sg of [1, -1]) for (const turn of [0, 0.4, -0.4, 0.8, -0.8]) {
        const sd = new THREE.Vector3(-ax.z * sg, 0, ax.x * sg).addScaledVector(ax, -0.35).normalize().applyAxisAngle(_UP, turn);
        const at = mid.clone().addScaledVector(sd, want); at.y = S.low ? P.position.y + (big ? 1.35 : 0.62) : mid.y + 0.25;
        // (clear from there to the two of them, and not standing in a car's room)
        const free = Math.min(firstBlock(mid, at), firstBlock(_t1.copy(P.position).setY(P.position.y + 1.1), at) + 0.5) - 0.3;
        let sc = Math.min(free, want) - Math.abs(turn) * 0.6 - (free < want - 0.8 ? 2 : 0) - (overBox(at) ? 3 : 0) - (at.y > crownCap(at) ? 1 : 0);
        // (and away from the men standing about: none of them filling the lens or between it and the two)
        for (const e of c.enemies) { if (e === S.target || !e.standing) continue; for (let u = 0.35; u <= 1.0; u += 0.325) if (Math.hypot(lerpN(mid.x, at.x, u) - e.pos.x, lerpN(mid.z, at.z, u) - e.pos.z) < 0.9 * e.scale) { sc -= 1.5; break; } }
        sc -= sd.dot(_v3.subVectors(cam.position, mid).setY(0).normalize()) < 0 ? 0.8 : 0;
        if (sc > bs) { bs = sc; bestS = { sd, dist: Math.max(MIN + 0.4, Math.min(want, free)) }; }
      }
      S.side = bestS.sd; S.dist = bestS.dist;
    }
    const cpos = _v3.copy(mid).addScaledVector(S.side, S.dist + S.t * 0.3); cpos.y = mid.y + 0.25;
    // (the slam: down by the street, looking up at the man over his head; a brute's higher, or he fills it)
    if (S.low) { cpos.y = P.position.y + (big ? 1.35 : 0.62); mid.y = Math.max(mid.y, P.position.y + (big ? 1.6 : 1.35)); }
    cpos.y = Math.min(cpos.y, crownCap(cpos));
    // (a car or a bus that has come up beside the shot since it was chosen: in toward the two of them, clear of it)
    for (let i = 0; i < 6 && (overBox(cpos) || firstBlock(mid, cpos) < mid.distanceTo(cpos) - 0.35); i++) cpos.lerp(mid, 0.18);
    cam.position.lerp(cpos, k);
    st.cineLook = (st.cineLook || new THREE.Vector3()).copy(cam.position).addScaledVector(cam.getWorldDirection(new THREE.Vector3()), 4).lerp(mid, k);
    cam.lookAt(st.cineLook);
  }
  // (debug captures: a still camera on Dan and a man, from the side at deg off their line)
  function debugView() {
    const o = st.dbg, q = P.position, e = o.target && o.target.pos ? o.target.pos : null;
    const a = _v.copy(q); if (e) a.lerp(e, o.mid ?? 0.5); a.y = q.y + (o.at ?? 1.0);
    const base = e ? Math.atan2(e.x - q.x, e.z - q.z) : P.heading;
    const yaw = base + (o.deg ?? 90) * Math.PI / 180;
    cam.position.set(a.x + Math.sin(yaw) * (o.dist ?? 4), a.y + (o.h ?? 0.3), a.z + Math.cos(yaw) * (o.dist ?? 4));
    cam.lookAt(a);
  }
  function effects(dt) {
    if (st.dbg) return;
    // shake (decays), the blow's jolt (a sprung push the way it went) and roll, the heavy blow's punch in (eased in
    // 0.12 s, out 0.4 s) and a narrower lens for an instant
    st.shake = Math.max(0, st.shake - dt * 2.8);
    if (st.shake > 0.002) {
      const a = st.shake * st.shake * 0.35, t = c.rtime * 61;
      cam.position.x += (Math.sin(t * 1.3) + Math.sin(t * 2.9)) * 0.5 * a; cam.position.y += (Math.sin(t * 1.7 + 1) + Math.sin(t * 3.3)) * 0.5 * a; cam.position.z += (Math.sin(t * 1.1 + 2) + Math.sin(t * 2.3)) * 0.5 * a;
    }
    const kd = Math.min(dt, 1 / 30);
    st.kickV.addScaledVector(st.kick, -260 * kd).multiplyScalar(Math.exp(-22 * kd)); st.kick.addScaledVector(st.kickV, kd);
    st.rollV += (-260 * st.roll) * kd; st.rollV *= Math.exp(-20 * kd); st.roll += st.rollV * kd;
    if (st.kick.lengthSq() > 1e-7) cam.position.add(st.kick);
    st.punchT += dt;
    const pk = st.punchT < 0.12 ? smooth(st.punchT / 0.12) : 1 - smooth((st.punchT - 0.12) / 0.4);
    if (pk > 0.001) cam.position.addScaledVector(cam.getWorldDirection(_v), 0.32 * st.punchK * pk);
    const base = cs.lensFov || cs.getActivePreset().fov, fov = base - 4 * st.punchK * pk;
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
    if (Math.abs(st.roll) > 1e-4 && (st.w > 0.003 || st.cine)) cam.rotateZ(st.roll);
  }
  return {
    get weight() { return st.w; },
    yaw: () => (st.yaw != null ? st.yaw : (cam.getWorldDirection(_v), Math.atan2(_v.x, _v.z))),
    // a: how hard; dir (optional, world): the blow's way, the view jolted along it
    shake(a, dir) {
      st.shake = Math.min(1.2, Math.max(st.shake, a));
      if (dir) { st.kickV.addScaledVector(dir, 1.6 * a); st.kickV.y -= 0.8 * a; }
      st.rollV += (Math.random() < 0.5 ? -1 : 1) * 0.55 * a * a;
    },
    kick(v) { st.kickV.add(v); },
    punch(k = 1) { st.punchT = 0; st.punchK = clamp(k, 0, 1.5); },
    cine(target, dur, { low = false } = {}) { st.cine = { target, t: 0, dur, side: null, low }; },
    debugView(o) { st.dbg = o || null; },
    // for the moves: how far the way from a to b is clear of walls, the car, trunks, poles, cans and the traffic
    firstBlock(a, b) { refresh(P.position, 0); return firstBlock(a, b); },
    state: () => ({ yaw: st.yaw, swing: st.swing, elUp: +st.elUp.toFixed(2), freeD: +st.freeD.toFixed(2), dist: +st.dist.toFixed(2), w: +st.w.toFixed(2), handback: st.handback, cine: !!st.cine, trees: near.trees.length, poles: near.poles.length, vehs: (c.vehs || []).length }),
    solid,
  };
}
