// GameMog's adapter for the traversal (src/, from Spiderbench; see NOTICE.md): bundled by
// scripts/runtime/build-maps.mjs into lib/runtime/maps/traversal.js, which a world gets with
// open: { traversal: {...} }. This file is GameMog's own: it turns the open world's colliders into the
// world the traversal reads (boxes, a ray cast, the ground under a point), wraps the runtime's own hero in
// the rig, and hands the open world the player, its camera and its input.
import * as THREE from 'three';
import { rigFromModel } from './src/player/rig.js';
import { createPlayer } from './src/player/player.js';
import { createInput } from './src/player/input.js';
import { setLineStyle } from './src/player/web.js';
import { H } from './src/player/traversal/traversal.js';

// the library human's bones (lib/runtime/v1.js, MakeHuman's rig cut to 66 bones) for the rig's logical ones
export const HUMAN_BONES = {
  hips: 'root', spine: 'spine04', chest: 'spine02', neck: 'neck01', head: 'head',
  upperArmL: 'upperarm01_L', lowerArmL: 'lowerarm01_L', handL: 'wrist_L',
  upperArmR: 'upperarm01_R', lowerArmR: 'lowerarm01_R', handR: 'wrist_R',
  upperLegL: 'upperleg01_L', lowerLegL: 'lowerleg01_L', footL: 'foot_L',
  upperLegR: 'upperleg01_R', lowerLegR: 'lowerleg01_R', footR: 'foot_R',
};
export const HUMAN_FINGERS = { thumb: 'finger1-', index: 'finger2-', middle: 'finger3-', ring: 'finger4-', pinky: 'finger5-' };

/* ------------------------------------------------------------------ the world, from the open world's colliders */
// boxes: [{ min: {x,y,z}, max: {x,y,z} }]; circles: [{ x, z, r, h? }] (posts and trunks, stood up as thin boxes);
// ground(x, z): the terrain's height. The traversal asks for:
//   buildings [{ min: [x,y,z], max: [x,y,z] }], raycast(origin, dir, max) -> { point, normal, distance } | null,
//   groundHeight(x, z, below) -> the highest surface at (x, z) no higher than `below`, spawn.
export function makeWorld({ boxes = [], circles = [], ground = () => 0, spawn = new THREE.Vector3() }) {
  const B = [];
  for (const b of boxes) {
    if (b.max.y - Math.max(b.min.y, -1) < 0.35 || b.max.y < 0.3) continue;   // kerbs and steps are walked over
    B.push({ min: [b.min.x, b.min.y, b.min.z], max: [b.max.x, b.max.y, b.max.z] });
  }
  for (const c of circles) { const h = c.h || 5, r = c.r * 0.89; B.push({ min: [c.x - r, ground(c.x, c.z) - 0.2, c.z - r], max: [c.x + r, ground(c.x, c.z) + h, c.z + r] }); }
  const CELL = 8, grid = new Map(), stamp = new Uint32Array(B.length); let frame = 1;
  const key = (i, j) => i * 73856093 ^ j * 19349663;
  B.forEach((b, n) => {
    for (let i = Math.floor(b.min[0] / CELL); i <= Math.floor(b.max[0] / CELL); i++)
      for (let j = Math.floor(b.min[2] / CELL); j <= Math.floor(b.max[2] / CELL); j++) { const k = key(i, j); let l = grid.get(k); if (!l) grid.set(k, l = []); l.push(n); }
  });
  const g0 = (x, z) => { const h = ground(x, z); return Number.isFinite(h) ? h : 0; };
  function groundHeight(x, z, below = Infinity) {
    let best = g0(x, z);
    const l = grid.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
    if (l) for (const n of l) { const b = B[n]; if (x >= b.min[0] && x <= b.max[0] && z >= b.min[2] && z <= b.max[2] && b.max[1] <= below + 1e-3 && b.max[1] > best) best = b.max[1]; }
    return best;
  }
  // a ray against one box (slabs): the entry distance and the face it enters by
  const _n = new THREE.Vector3();
  function rayBox(o, d, b, tMax) {
    let t0 = 0, t1 = tMax, ax = -1, sg = 0;
    for (let a = 0; a < 3; a++) {
      const oa = a === 0 ? o.x : a === 1 ? o.y : o.z, da = a === 0 ? d.x : a === 1 ? d.y : d.z;
      if (Math.abs(da) < 1e-9) { if (oa < b.min[a] || oa > b.max[a]) return null; continue; }
      let ta = (b.min[a] - oa) / da, tb = (b.max[a] - oa) / da, s = -1;
      if (ta > tb) { const tt = ta; ta = tb; tb = tt; s = 1; }
      if (ta > t0) { t0 = ta; ax = a; sg = s; }
      if (tb < t1) t1 = tb;
      if (t0 > t1) return null;
    }
    if (ax < 0) return null;   // starting inside: no entry face
    _n.set(0, 0, 0).setComponent(ax, sg);
    return t0;
  }
  // the terrain along a ray: stepped, then halved down to the crossing
  function rayGround(o, d, max) {
    const f = (t) => o.y + d.y * t - g0(o.x + d.x * t, o.z + d.z * t);
    if (f(0) < 0) return null;
    let prev = 0, step = 0.5;
    for (let t = step; t <= max + step; t += step) {
      const u = Math.min(t, max);
      if (f(u) < 0) { let a = prev, b = u; for (let k = 0; k < 18; k++) { const m = (a + b) / 2; if (f(m) < 0) b = m; else a = m; } return b; }
      prev = u; step = Math.min(4, step * 1.25);
      if (u >= max) break;
    }
    return null;
  }
  const _g = new THREE.Vector3();
  function raycast(origin, dir, max = 200) {
    const d = _g.copy(dir); const len = d.length(); if (len < 1e-9) return null; d.divideScalar(len);
    let best = max, bestN = null;
    // the boxes in the cells the ray crosses (a walk through the grid in x and z)
    const fr = ++frame;
    let i = Math.floor(origin.x / CELL), j = Math.floor(origin.z / CELL);
    const si = d.x > 0 ? 1 : -1, sj = d.z > 0 ? 1 : -1;
    const dX = Math.abs(d.x) > 1e-9 ? Math.abs(CELL / d.x) : Infinity, dZ = Math.abs(d.z) > 1e-9 ? Math.abs(CELL / d.z) : Infinity;
    let tX = Math.abs(d.x) > 1e-9 ? ((si > 0 ? (i + 1) * CELL : i * CELL) - origin.x) / d.x : Infinity;
    let tZ = Math.abs(d.z) > 1e-9 ? ((sj > 0 ? (j + 1) * CELL : j * CELL) - origin.z) / d.z : Infinity;
    for (let guard = 0; guard < 400; guard++) {
      const l = grid.get(key(i, j));
      if (l) for (const n of l) {
        if (stamp[n] === fr) continue; stamp[n] = fr;
        const t = rayBox(origin, d, B[n], best);
        if (t != null && t < best) { best = t; bestN = _n.clone(); }
      }
      const tNext = Math.min(tX, tZ);
      if (tNext > best || tNext > max) break;
      if (tX < tZ) { tX += dX; i += si; } else { tZ += dZ; j += sj; }
    }
    const tg = rayGround(origin, d, best);
    if (tg != null && tg < best) {
      const p = origin.clone().addScaledVector(d, tg), e = 0.25;
      const n = new THREE.Vector3(g0(p.x - e, p.z) - g0(p.x + e, p.z), 2 * e, g0(p.x, p.z - e) - g0(p.x, p.z + e)).normalize();
      return { point: p, normal: n, distance: tg };
    }
    if (!bestN) return null;
    return { point: origin.clone().addScaledVector(d, best), normal: bestN, distance: best };
  }
  return { buildings: B, raycast, groundHeight, spawn: spawn.clone ? spawn.clone() : new THREE.Vector3(spawn.x, spawn.y, spawn.z), update() {} };
}

/* ------------------------------------------------------------------ the hero */
// opts: { scene, camera, renderer, canvas, group (the runtime player's Group, moved and turned by the traversal),
//   model (its body's root), bones?, fingers?, clips?, boxes, circles, ground, spawn: {x,y,z}, yaw, line? }
export function create(opts) {
  const { scene, camera, renderer } = opts;
  const world = makeWorld(opts);
  const rig = rigFromModel(opts.model, { bones: opts.bones || HUMAN_BONES, fingers: opts.fingers === undefined ? HUMAN_FINGERS : opts.fingers, clips: opts.clips || [] });
  const input = createInput(opts.canvas || renderer.domElement);
  // the animation layer and the camera find the scene through this (rig.js, anim/legacy.js, camera.js)
  const ctx = { THREE, scene, camera, renderer, world, input, systems: [] };
  window.__ctx = ctx;
  if (opts.line) setLineStyle(opts.line);
  const player = createPlayer({ scene, world, camera, input, renderer, rig, object: opts.group });
  ctx.player = player; window.__trav = player.traversal;
  const sp = opts.spawn || { x: 0, y: 0, z: 0 };
  player.teleport(new THREE.Vector3(sp.x, world.groundHeight(sp.x, sp.z, sp.y == null ? Infinity : sp.y + 0.5) + H, sp.z), opts.yaw || 0);
  // the runtime's own controls on top of the traversal's keyboard and mouse: a touch stick, held buttons,
  // and none at all (a title screen, a cut scene) — set each frame with steer()
  let extra = null, frozen = false;
  player.setControlOverride((I) => {
    if (frozen) return null;
    if (!extra) return I;
    if (extra.move && Math.hypot(extra.move.x, extra.move.y) > Math.hypot(I.move.x, I.move.y)) I.move = { x: extra.move.x, y: extra.move.y };
    if (extra.moveScale != null && extra.moveScale < 1) I.move = { x: I.move.x * extra.moveScale, y: I.move.y * extra.moveScale };
    if (extra.combat) { I.combat = true; if (extra.combatSub) I.combatSub = extra.combatSub; I.combatVel = extra.combatVel || null; }
    return I;
  });
  const H_ = H;
  return {
    player, rig, input, world, H: H_,
    get state() { return player.state; },
    // feet, facing (the runtime's yaw: forward = (sin, cos)) and speed, for the open world's bookkeeping
    feet(out = new THREE.Vector3()) { return out.set(player.state.pos.x, player.state.pos.y - H_, player.state.pos.z); },
    yaw() { const f = new THREE.Vector3(0, 0, 1).applyQuaternion(opts.group.quaternion); return Math.atan2(f.x, f.z); },
    camYaw() { const f = camera.getWorldDirection(new THREE.Vector3()); return Math.atan2(-f.x, -f.z); },
    steer(o) { extra = o; },
    freeze(on) { frozen = !!on; },
    press(code) { input.press(code); }, release(code) { input.release(code); },
    update(dt) { player.update(dt); },
    teleport(x, y, z, yaw) { player.teleport(new THREE.Vector3(x, (y == null ? world.groundHeight(x, z) : y) + H_, z), yaw || 0); },
    oneShot(name, o) { return rig.play(name, Object.assign({ loop: false, fade: 0.08 }, o || {})); },
  };
}
