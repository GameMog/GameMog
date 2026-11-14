// Mog City, Hometown: take any car on the street. A town's traffic (a car stopped or crawling, under TAKE_SPEED) and
// its parked cars (cities/sf/js/traffic.js: the town's own fleet, FLEET) can be taken: on foot within REACH m of one,
// the prompt offers it ("F · Take the pickup"), and F swaps the player's car for it:
//   - the car he had stays where he left it, as it was (a copy of its look, solid to him and the crashes, wagmi/crash's
//     'wagmi-parked'), and F at it takes it back (his own car, or the last one he took);
//   - the one he takes leaves the traffic (trafficSystem.take: it comes back somewhere out of view later), and his car
//     stands in its place in its kind's Story Kit body (wagmi/storyrun/vehicles: the class's own shape, handling and
//     engine; a sports body boosts, a pickup or a van doesn't), in its paint; its driver shouts as he bails;
//   - he walks to its door and climbs in (wagmi/game.js getIn), the traffic holding back round it meanwhile.
// Not a police cruiser (locked), not while a mission tows with its own ride (a tow truck: the story's, ride.js wearRide;
// any other ride is swapped like any car, and the next mission puts its own back on), never on a horse. Towns only
// (window.NYC.PKG); New York and San Francisco as before.
//   install(W)    W.jackPrompt() -> the prompt or '', W.jack() -> true when F took a car (game.js's F and prompt)
import * as THREE from 'three/webgpu';
import { wearRide } from './storyrun/ride.js';
import { NOUN, sheetFor } from './jack-sheets.js';

const REACH = 1.6, TAKE_SPEED = 3.5;
// the traffic's paint (linear floats) as the sheet's '#rrggbb'
const hexOf = (paint) => '#' + new THREE.Color(paint[0], paint[1], paint[2]).getHexString();

export function install(W) {
  const N = globalThis.window?.NYC;
  if (!N?.PKG) return;
  const app = W.app, TS = app.trafficSystem, cm = app.controllerManager, car = W.car, person = cm.entities.person;
  const rs = car?.roadster;
  if (!TS || !car || !rs || rs.kind === 'horse') return;
  const left = []; // the cars he left: { group, kind, hex, sheet (null: his own), x, z, h, hw, hl }
  const hold = { b: null, until: 0 };
  let cache = { t: 0, v: null };

  // the sheet the car wears now (one he took, or the mission's own ride), null for his own car
  const wornSheet = () => { const st = rs.__worn; return st?.id ? (st.id.startsWith('jack-') ? st.sheet : st.rigs[st.id]?.sheet) || null : null; };
  // the mission's own ride is a tow truck the mission tows with: that one stays his for the mission (any other ride he
  // may swap like any car: the next mission puts its ride back on, wagmi/storyrun/runner.js)
  const missionRide = () => { const st = rs.__worn; if (!st?.id || st.id.startsWith('jack-')) return false; return (wornSheet()?.abilities || []).includes('tow'); };
  // how far he is from a box (centre x, z, heading h, half width hw, half length hl), 0 inside it
  const boxDist = (x, z, h, hw, hl) => {
    const dx = person.position.x - x, dz = person.position.z - z, c = Math.cos(h), s = Math.sin(h);
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    return Math.hypot(Math.max(0, Math.abs(lx) - hw), Math.max(0, Math.abs(lz) - hl));
  };
  function target() {
    const now = performance.now();
    if (now - cache.t < 120) return cache.v;
    cache = { t: now, v: null };
    if (cm.activeMode !== 'person' || W.ride?.phase || W.cutscene || W.directed || missionRide()) return null;
    if (Math.hypot(person.position.x - car.position.x, person.position.z - car.position.z) < 4.2) return null; // (his own: game.js)
    let best = null, bd = REACH;
    for (const v of TS.cars) {
      if (!v.edge || v.taken || v.disabled || v.isNYPD || Math.abs(v.speed || 0) > TAKE_SPEED || Math.abs(v.y - person.position.y) > 2.5) continue;
      const d = boxDist(v.x, v.z, v.yaw + (v.yawOffset || 0), v.bodyW ?? v.halfWidth, v.bodyL ?? v.half);
      // (a town's ready-made car: its model's id, so he drives that model; its body kind otherwise)
      if (d < bd) { bd = d; best = { v, kind: v.model || v.bodyType }; }
    }
    for (const v of TS.parked || []) {
      if (!v.placed || v.taken || Math.abs(v.y - person.position.y) > 2.5) continue;
      const d = boxDist(v.x, v.z, v.yaw, v.bodyW, v.bodyL);
      if (d < bd) { bd = d; best = { v, kind: v.model || v.bodyType }; }
    }
    for (const L of left) {
      const d = boxDist(L.x, L.z, L.h, L.hw, L.hl);
      if (d < bd) { bd = d; best = { left: L, kind: L.kind }; }
    }
    return (cache.v = best);
  }
  W.jackPrompt = () => {
    const t = target();
    if (!t) return '';
    return t.left ? 'F  ·  Get in' : `F  ·  Take the ${NOUN[t.kind] || 'car'}`;
  };

  // a copy of his car's look where it stands (its meshes shared, no lamp lights of its own), solid as 'wagmi-parked'
  function leaveCar() {
    car.mesh.updateMatrixWorld(true);
    const g = car.mesh.clone(true);
    // (only what shows: the bodies hidden under it (his own under one he took, the others he took before) left out, so
    // its solid box is the body that shows)
    const drop = [];
    g.traverse((o) => { if (o !== g && (!o.visible || o.isLight || o.isCamera)) drop.push(o); });
    for (const o of drop) o.parent?.remove(o);
    g.name = 'wagmi-parked';
    g.position.copy(car.mesh.position); g.quaternion.copy(car.mesh.quaternion);
    app.scene.add(g);
    const id = rs.__worn?.id || null, B = car.body || { hx: 0.95, z0: -2.3, z1: 2.3 };
    left.unshift({ group: g, kind: id && id.startsWith('jack-') ? id.slice(5) : null, sheet: wornSheet(), x: car.position.x, z: car.position.z, h: car.heading,
      hw: B.hx, hl: (B.z1 - B.z0) / 2 });
    // (two at most: the oldest goes)
    while (left.length > 2) { const L = left.pop(); app.scene.remove(L.group); }
  }

  function take() {
    const t = target();
    if (!t) return false;
    cache.t = 0;
    let x, z, h;
    if (t.left) {
      const L = t.left;
      ({ x, z, h } = L);
      left.splice(left.indexOf(L), 1); app.scene.remove(L.group);
      leaveCar();
      wearRide(THREE, car, L.sheet);
      if (L.sheet) { const w = rs.__worn.rigs[L.sheet.id]; if (L.sheet.id.startsWith('jack-')) { w?.setPaint?.(L.sheet.paint.base); rs.__worn.sheet = L.sheet; } }
    } else {
      const v = t.v, hex = hexOf(v.paint), sheet = sheetFor(t.kind, hex);
      x = v.x; z = v.z; h = v.yaw + (v.yawOffset || 0);
      leaveCar();
      try {
        wearRide(THREE, car, sheet);
        const w = rs.__worn.rigs[sheet.id]; w?.setPaint?.(hex);
        rs.__worn.sheet = sheet;
      } catch (err) { console.warn('[jack] body', err); }
      TS.take(v);
      // (its driver bails with a shout; a parked car's alarm chirps)
      const p = [v.x, (v.y || 0) + 1.2, v.z];
      if (v.parked) W.audio?.play?.('horn', { pos: p, vol: 0.3, kind: 'sedan', len: 'double' });
      else W.audio?.play?.('scream', { pos: p, vol: 0.7, kind: 'hey' });
    }
    W.placeCar?.(x, z, h, true);
    // (the traffic holds back round it while he gets in)
    if (Array.isArray(TS.blockers)) {
      hold.b = hold.b || { x, z, yaw: h, halfW: 1.2, halfL: 3, vx: 0, vz: 0 };
      Object.assign(hold.b, { x, z, yaw: h, halfW: (car.body?.hx ?? 0.95) + 0.3, halfL: ((car.body?.z1 ?? 2.3) - (car.body?.z0 ?? -2.3)) / 2 + 2 });
      if (!TS.blockers.includes(hold.b)) TS.blockers.push(hold.b);
      hold.until = performance.now() + 6000;
    }
    W.ride?.getIn?.();
    W.jacks = (W.jacks || 0) + 1;
    return true;
  }
  // (the taken bodies kept built: the one he drives and the ones his left cars show, no more; the rest let go, their
  // geometry and materials freed (a town where he takes car after car stays inside its memory))
  function prune() {
    const st = rs.__worn; if (!st) return;
    const keep = new Set([st.id, ...left.map((L) => L.sheet?.id)]);
    for (const id of Object.keys(st.rigs)) {
      if (!id.startsWith('jack-') || keep.has(id)) continue;
      const w = st.rigs[id]; delete st.rigs[id];
      w.group.parent?.remove(w.group);
      const mats = new Set();
      // (a ready-made body's geometry, materials and textures are the town traffic's own (userData.shared): kept)
      w.group.traverse((o) => { if (o.userData.shared) return; if (o.geometry) o.geometry.dispose(); for (const m of [].concat(o.material || [])) mats.add(m); });
      for (const m of mats) { for (const v of Object.values(m)) if (v && v.isTexture) v.dispose(); m.dispose(); }
    }
  }
  W.jack = () => { const ok = take(); if (ok) try { prune(); } catch (err) { console.warn('[jack] prune', err); } return ok; };
  // (the hold lets go once he is away in it, or after 6 s; a left car 500 m behind is let go too)
  (function tick() {
    if (hold.b && (performance.now() > hold.until || (cm.activeMode === 'car' && Math.abs(car.speed) > 4))) {
      const k = TS.blockers.indexOf(hold.b); if (k >= 0) TS.blockers.splice(k, 1); hold.b = null;
    }
    for (let i = left.length - 1; i >= 0; i--) if (Math.hypot(left[i].x - car.position.x, left[i].z - car.position.z) > 500) { app.scene.remove(left[i].group); left.splice(i, 1); }
    requestAnimationFrame(tick);
  })();
  W.jackDebug = { target, left, sheetFor };
}
