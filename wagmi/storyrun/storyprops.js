// Mog City story runner: a story's props in the world (a pack's `prop` and `flotilla` steps, and a shot's `props`):
// placed, held, swapped and put away, and their points for a cutscene's lens (camPt: { prop: id } and { flotilla: id }).
//   prop     { id, kind (props.js PROP_KINDS: duck, duffel, duffel-open, sponge, bucket, jacket, jacket-folded, suds,
//              slip), at, heading (deg), scale, number (a duck's), remove: true (put away), swap (a new kind, the same
//              place: the duffel unzipped), drop: true (a held prop left on the ground where it is) }
//            at: '@place' (on the ground at its approach) | [x, y, z] | { rel: 'player' | a cast name, fwd, right, up }
//                (on the ground beside them, up m over it) | { car: 'player' | a story car's name, part: 'hood' | 'roof' |
//                'trunk' | 'seat' | 'side', side: 1 (right) | -1, along: m } (on the car, found by a ray down onto it) |
//                { hold: 'player' | a cast name, hand: 'right' | 'left', fwd, right, up } (in their hand, each frame)
//   flotilla { id, at: '@place' | [x, z] (the water nearest it), count (980), length (56 m), width (26 m), speed (0.45
//              m/s), flow (1 | -1), scale (1.6), pour: secs (they go in from the hero's hands, in arcs, a splash where
//              they land), remove: true }
// Every prop and flotilla is put away when the mission ends (tidy()).
import { makeProp, propKind, stretchCar } from './props.js';
import { createFlotilla } from './flotilla.js';

export { stretchCar };
export function createStoryProps(W, THREE, { app, cm, places, cast, castName, heroName, car, inCar, groundY, placeOf }) {
  const props = new Map(); // id -> { obj, kind, follow: () => void | null }
  const flots = new Map(); // id -> flotilla
  let raf = 0, last = 0;
  const scene = app.scene;
  const T = () => globalThis.window?.NYC?.Terrain;
  // the water's surface at (x, z), or null where it is dry: the town's terrain under its water level (reach.js water)
  const water = (x, z) => { const t = T(); if (!(t && t.loaded && t.groundAt && Number.isFinite(t.waterLevel))) return null; const g = t.groundAt(x, z); return Number.isFinite(g) && g <= t.waterLevel + 0.05 ? t.waterLevel : null; };
  const loop = () => {
    raf = 0; if (!props.size && !flots.size) return;
    const n = performance.now(), dt = last ? Math.min(0.05, (n - last) / 1000) : 0; last = n;
    for (const p of props.values()) if (p.follow) try { p.follow(); } catch {}
    const cam = app.camera || null;
    for (const f of flots.values()) f.frame(W.paused ? 0 : dt, cam);
    raf = requestAnimationFrame(loop);
  };
  const run = () => { if (!raf) { last = 0; raf = requestAnimationFrame(loop); } };
  // (who a ref names: the hero ('player', the hero's own name) or a cast member's figure)
  const isHero = (w) => !w || w === 'player' || castName(w) === heroName || cast.isHero?.(castName(w));
  const heroEnt = () => cm.getActiveEntity();
  function bodyOf(w) {
    if (isHero(w)) { const e = heroEnt(); return { root: e?.mesh || e?.model || null, x: e.position.x, y: e.position.y, z: e.position.z, h: e.heading }; }
    // (by the cast's name, or by a pack id that names it in lower case with hyphens: 'deckhand-red' for Deckhand Red)
    let f = cast.get(castName(w));
    if (!f && typeof w === 'string') { const slug = (n) => String(n).toLowerCase().replace(/[^a-z0-9]+/g, '-'); const n = (cast.live || []).map((x) => (typeof x === 'string' ? x : x?.name)).find((n) => n && slug(n) === slug(w)); if (n) f = cast.get(n); }
    if (!f?.root) return null;
    return { root: f.root, x: f.root.position.x, y: f.root.position.y, z: f.root.position.z, h: f.heading ?? f.root.rotation.y, fig: f };
  }
  // (a hand bone: the right or left one, by the names rigs give them: mixamorig:RightHand, hand_r, Hand.R, RightHand)
  function handBone(root, side) {
    if (!root) return null;
    const re = side === 'left' ? /(left.?hand|hand.?(l|left))$/i : /(right.?hand|hand.?(r|right))$/i;
    let b = null; root.traverse((o) => { if (!b && o.isBone && re.test(o.name.replace(/^mixamorig\d*:?/i, ''))) b = o; });
    return b;
  }
  // a car's frame: the hero's (W.car), or a story car parked by name (M.parked): its position, heading, its outline and
  // its meshes (for a ray onto it)
  function carOf(name, parked) {
    if (!name || name === 'player' || name === 'hero') {
      const e = cm.entities?.car, b = car.body || {};
      return { x: car.position.x, y: car.position.y, z: car.position.z, h: car.heading, hx: b.hx || 1.0, z0: b.z0 ?? -2.3, z1: b.z1 ?? 2.4, obj: e?.mesh || null };
    }
    const c = parked?.get?.(name); if (!c?.obj) return null;
    const o = c.obj, bb = new THREE.Box3().setFromObject(o), sz = bb.getSize(new THREE.Vector3());
    const len = Math.max(sz.x, sz.z), wid = Math.min(sz.x, sz.z);
    return { x: o.position.x, y: o.position.y, z: o.position.z, h: o.rotation.y, hx: wid / 2, z0: -len / 2, z1: len / 2, obj: o };
  }
  const rc = new THREE.Raycaster();
  // (the top of a car at a point of it (along, across, in its frame): a ray down onto its meshes from over its roof, or
  // from under it for a seat (from 1 m up inside the cabin))
  function carTop(C, along, across, fromY) {
    const s = Math.sin(C.h), c = Math.cos(C.h), x = C.x + along * s + across * c, z = C.z + along * c - across * s;
    let y = C.y + 1.0;
    if (C.obj) {
      C.obj.updateMatrixWorld(true);
      rc.set(new THREE.Vector3(x, C.y + fromY, z), new THREE.Vector3(0, -1, 0)); rc.far = fromY + 0.5; rc.camera = app.camera || null;
      // (its meshes only: a lamp's sprite or a skinned driver is not where a thing is put down)
      const list = []; C.obj.traverse((o) => { if (o.isMesh && !o.isSkinnedMesh && !o.isInstancedMesh && o.visible !== false && o.geometry?.attributes?.position) list.push(o); });
      let hit = null; try { hit = rc.intersectObjects(list, false)[0] || null; } catch (err) { console.warn('[storyrun] prop: ray onto the car', err.message); }
      if (hit) y = hit.point.y;
    }
    return { x, y, z };
  }
  // where a prop goes, and how it is turned: { x, y, z, h, follow? }
  function spot(at, o, parked) {
    if (Array.isArray(at)) return { x: +at[0], y: at.length > 2 ? +at[1] : groundY(+at[0], +at[at.length - 1]), z: +at[at.length - 1], h: 0 };
    if (typeof at === 'string' && at.startsWith('@')) { const p = placeOf(at); const x = p.cx ?? p.x, z = p.cz ?? p.z; return { x, y: groundY(x, z), z, h: p.heading ?? 0 }; }
    if (at && typeof at === 'object' && at.car) {
      const C = carOf(at.car, parked); if (!C) return null;
      const part = at.part || 'hood', side = at.side === -1 || at.side === 'left' ? -1 : 1;
      let along = 0, across = 0, from = 3;
      if (part === 'hood') along = C.z1 - 0.85;
      else if (part === 'trunk') along = C.z0 + 0.55;
      else if (part === 'roof') along = 0;
      else if (part === 'seat') { along = 0.05; across = -side * C.hx * 0.42; from = 1.05; }
      else if (part === 'side') { across = side * (C.hx + 0.75); }
      along += +at.along || 0; across += +at.across || 0;
      if (part === 'side') { const s = Math.sin(C.h), c = Math.cos(C.h), x = C.x + along * s + across * c, z = C.z + along * c - across * s; return { x, y: groundY(x, z), z, h: C.h }; }
      const q = carTop(C, along, across, from), dy = q.y + 0.005 - C.y;
      // (on his own car: carried with it, where it was put on it, as he drives; a story car stands still)
      const mine = !at.car || at.car === 'player' || at.car === 'hero';
      const follow = mine ? (obj) => { const dh = obj.rotation.y - C.h; return () => { const s2 = Math.sin(car.heading), c2 = Math.cos(car.heading); obj.position.set(car.position.x + along * s2 + across * c2, car.position.y + dy, car.position.z + along * c2 - across * s2); obj.rotation.y = car.heading + dh; }; } : null;
      return { ...q, y: q.y + 0.005, h: C.h, follow };
    }
    if (at && typeof at === 'object' && at.hold) {
      const who = at.hold, side = at.hand === 'left' ? 'left' : 'right';
      const B = bodyOf(who); if (!B) return null;
      const bone = handBone(B.root, side);
      const v = new THREE.Vector3();
      const follow = (obj) => () => {
        const b2 = bodyOf(who); if (!b2) return;
        if (bone) bone.getWorldPosition(v); else v.set(b2.x + Math.cos(b2.h) * (side === 'left' ? 0.25 : -0.25), b2.y + 0.95, b2.z - Math.sin(b2.h) * (side === 'left' ? 0.25 : -0.25));
        const h = b2.h, f = +at.fwd || 0, r = +at.right || 0;
        obj.position.set(v.x + Math.sin(h) * f - Math.cos(h) * r, v.y + (+at.up || 0) - 0.04 - (obj.userData.hang || 0), v.z + Math.cos(h) * f + Math.sin(h) * r);
        obj.rotation.set(0, h + ((+o.heading || 0) * Math.PI) / 180, 0);
      };
      return { x: B.x, y: B.y + 1, z: B.z, h: B.h, follow };
    }
    if (at && typeof at === 'object' && at.rel) {
      const B = bodyOf(at.rel); if (!B) return null;
      const h = B.h, f = +at.fwd || 0, r = +at.right || 0, x = B.x + Math.sin(h) * f - Math.cos(h) * r, z = B.z + Math.cos(h) * f + Math.sin(h) * r;
      return { x, y: groundY(x, z) + (+at.up || 0), z, h };
    }
    // (none said: at the hero's feet, a step ahead)
    const e = heroEnt(); const x = e.position.x + Math.sin(e.heading) * 1.2, z = e.position.z + Math.cos(e.heading) * 1.2;
    return { x, y: groundY(x, z), z, h: e.heading };
  }
  // the `prop` step (and a shot's props): placed, swapped, dropped or put away. -> the prop's object, or null
  function prop(d, parked) {
    const id = String(d.id || d.kind || 'prop');
    if (d.remove) { const p = props.get(id); if (p) { p.obj.removeFromParent(); props.delete(id); } return null; }
    const old = props.get(id);
    if (d.drop && old) { old.follow = null; old.obj.position.y = groundY(old.obj.position.x, old.obj.position.z); return old.obj; }
    const kind = propKind(d.swap || d.kind || old?.kind);
    if (!kind) { console.warn('[storyrun] prop: no kind', d.kind || d.swap); return null; }
    let S;
    if (d.swap && old && !d.at) S = { x: old.obj.position.x, y: old.obj.position.y, z: old.obj.position.z, h: old.obj.rotation.y, follow: old.followOf || null };
    else S = spot(d.at, d, parked);
    if (!S) { console.warn('[storyrun] prop: nowhere for', id, JSON.stringify(d.at)); return null; }
    const obj = makeProp(THREE, kind, { scale: d.scale, number: d.number });
    obj.position.set(S.x, S.y, S.z);
    obj.rotation.y = (S.h || 0) + ((+d.heading || 0) * Math.PI) / 180;
    obj.name = 'wagmi-prop:' + id;
    if (old) old.obj.removeFromParent();
    scene.add(obj);
    const rec = { obj, kind, follow: S.follow ? S.follow(obj) : null, followOf: S.follow || null, h: obj.rotation.y };
    props.set(id, rec); if (rec.follow) { rec.follow(); run(); }
    return obj;
  }
  // the `flotilla` step. -> its info (where it is on the water), or null when no water is near
  function flotilla(d, from = null) {
    const id = String(d.id || 'flotilla');
    if (d.remove) { const f = flots.get(id); if (f) { f.remove(); flots.delete(id); } return null; }
    let x, z;
    if (Array.isArray(d.at)) { x = +d.at[0]; z = +d.at[d.at.length - 1]; }
    else if (typeof d.at === 'string') { const p = placeOf(d.at); x = p.cx ?? p.x; z = p.cz ?? p.z; }
    else { const e = heroEnt(); x = e.position.x; z = e.position.z; }
    const old = flots.get(id); if (old) old.remove();
    const f = createFlotilla(THREE, scene, { water });
    const info = f.lay({ x, z, count: d.count, length: d.length, width: d.width, speed: d.speed, flow: d.flow, scale: d.scale, seed: d.seed, number: d.number, pour: d.pour ? +d.pour || 3 : 0, from: d.pour ? from : null });
    if (!info) { console.warn('[storyrun] flotilla: no water within 320 m of', Math.round(x), Math.round(z)); return null; }
    flots.set(id, f); run();
    console.info('[storyrun] flotilla', id, JSON.stringify({ count: info.count, x: Math.round(info.x), z: Math.round(info.z), river: Math.round(info.river), length: info.length, width: Math.round(info.width) }));
    return info;
  }
  // a cutscene's point on a prop or a flotilla: { prop: id, fwd, right, up } in the prop's own frame (its middle, its
  // way), { flotilla: id (or true: the first), along, right, up } on the water. -> [x, y, z] or null
  function point(ref) {
    if (!ref || typeof ref !== 'object') return null;
    if (ref.prop != null) {
      const p = props.get(String(ref.prop)); if (!p) return null;
      const o = p.obj; o.updateMatrixWorld(true);
      const bb = new THREE.Box3().setFromObject(o), c = bb.getCenter(new THREE.Vector3());
      const h = o.rotation.y, f = +ref.fwd || 0, r = +ref.right || 0;
      return [c.x + Math.sin(h) * f - Math.cos(h) * r, c.y + (+ref.up || 0), c.z + Math.cos(h) * f + Math.sin(h) * r];
    }
    if (ref.flotilla != null) {
      const f = ref.flotilla === true ? flots.values().next().value : flots.get(String(ref.flotilla)); if (!f) return null;
      const q = f.point({ along: +ref.along || 0, across: +ref.right || 0 }); if (!q) return null;
      return [q.x, q.y + (+ref.up || 0), q.z];
    }
    return null;
  }
  const has = (ref) => !!ref && typeof ref === 'object' && !Array.isArray(ref) && (ref.prop != null || ref.flotilla != null);
  function tidy() {
    for (const p of props.values()) p.obj.removeFromParent(); props.clear();
    for (const f of flots.values()) f.remove(); flots.clear();
    if (raf) cancelAnimationFrame(raf); raf = 0;
  }
  return { prop, flotilla, point, has, tidy, water, spot: (at, parked) => spot(at, {}, parked), get props() { return props; }, get flots() { return flots; } };
}
