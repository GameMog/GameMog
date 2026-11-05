// Mog City story runner: a world's pet that goes with the hero (the Story Kit's pets[] with "follows": true, owned by
// the hero; the runner pack's cast entry { pet: { model, species, follows, owner } }). Mog City's own dog is the one
// built today: 'mogcity/moon' is wagmi/moon.js's Moon, the same build (fur, rig, idle, trot, sit) as the shipped game's.
// On foot she trots after him (behind his right hand, her pace from his, never through him), sits when he stands, and
// is put beside him if she falls far behind (a teleport, a cutscene's move, a retry). In the car she rides: in the
// load bay of a pickup or a wagon (the sheet car's own 'load' socket, sitting up facing forward, head over the side),
// else on the passenger seat. Without a following pet nothing here is built.
//   createPets(W, world) -> { list, update(dt), dispose() } | null
import * as THREE from 'three/webgpu';
import { buildMoon } from '../moon.js';

const BUILT = { 'mogcity/moon': (o) => buildMoon(THREE, o) };

export function createPets(W, world) {
  const cast = world.def.cast || {};
  const want = Object.entries(cast).filter(([, c]) => c && c.pet && c.pet.follows && BUILT[c.pet.model] && (!c.pet.owner || c.pet.owner === world.heroName));
  if (!want.length) return null;
  const app = W.app, cm = app.controllerManager, P = W.person, car = W.car;
  const pets = want.slice(0, 1).map(([name, c]) => {
    const dog = BUILT[c.pet.model]({});
    dog.group.name = 'storyrun-pet-' + name.replace(/[^A-Za-z0-9]+/g, '-');
    dog.group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
    app.scene.add(dog.group);
    return { name, dog, at: new THREE.Vector3(), heading: 0, speed: 0, placed: false, riding: false };
  });
  // where she rides: the sheet car's load bay (a pickup's bed), else the passenger seat (the driver's hip, mirrored)
  const rs = car.roadster;
  const cabin = rs?.group?.getObjectByName?.('cabin') || null;
  const load = rs?.sockets?.load || null;
  const seat = rs?.seat?.hip ? [-rs.seat.hip[0], rs.seat.hip[1] - 0.02, rs.seat.hip[2] + 0.05] : null;
  const ride = cabin && load ? { parent: cabin, pos: [load[0] + 0.28, load[1] + 0.01, load[2] + (rs.sockets.loadLen || 1.4) * 0.22], scale: 1.25 }
    : (rs?.anchor && seat ? { parent: rs.anchor, pos: seat, scale: 1.1 } : null);
  const v = new THREE.Vector3(), lookAt = new THREE.Vector3();
  const ground = (x, z) => cm.getGroundHeight(x, z, 'person');

  function onFoot(p, dt) {
    if (p.riding) { p.riding = false; app.scene.add(p.dog.group); p.dog.group.scale.setScalar(1); p.placed = false; }
    const h = P.heading || 0, fx = Math.sin(h), fz = Math.cos(h), rx = Math.cos(h), rz = -Math.sin(h);
    // behind his right hand
    const tx = P.position.x - fx * 1.05 + rx * 0.75, tz = P.position.z - fz * 1.05 + rz * 0.75;
    const dx = tx - p.at.x, dz = tz - p.at.z, d = Math.hypot(dx, dz);
    if (!p.placed || d > 22) { p.at.set(tx, ground(tx, tz), tz); p.heading = h; p.speed = 0; p.placed = true; }
    else {
      // her pace: up to his sprint, eased; she settles inside half a metre
      const want = d < 0.45 ? 0 : Math.min(9, 1.2 + d * 2.2, Math.max(1.4, Math.abs(P.speed || 0) * 1.15 + d));
      p.speed += (want - p.speed) * Math.min(1, dt * 6);
      const step = Math.min(d, p.speed * dt);
      if (d > 1e-3) { p.at.x += (dx / d) * step; p.at.z += (dz / d) * step; }
      if (p.speed > 0.25 && d > 0.3) { const th = Math.atan2(dx, dz); let a = th - p.heading; a = Math.atan2(Math.sin(a), Math.cos(a)); p.heading += a * Math.min(1, dt * 8); }
      else { let a = h - p.heading; a = Math.atan2(Math.sin(a), Math.cos(a)); p.heading += a * Math.min(1, dt * 2); }
      // (never inside him)
      const ox = p.at.x - P.position.x, oz = p.at.z - P.position.z, od = Math.hypot(ox, oz);
      if (od < 0.55 && od > 1e-3) { p.at.x = P.position.x + (ox / od) * 0.55; p.at.z = P.position.z + (oz / od) * 0.55; }
      p.at.y = ground(p.at.x, p.at.z);
    }
    p.dog.group.position.copy(p.at); p.dog.group.rotation.set(0, p.heading, 0);
    const moving = p.speed > 0.35;
    lookAt.set(P.position.x, p.at.y + 1.2, P.position.z);
    p.dog.update(dt, { mode: moving ? 'trot' : 'sit', speed: p.speed, look: moving ? undefined : lookAt, mouth: moving ? 0.6 : 0.25, calm: 1 });
  }
  function inCar(p, dt) {
    if (!ride) { p.dog.group.visible = false; return; }
    if (!p.riding) {
      p.riding = true; ride.parent.add(p.dog.group);
      p.dog.group.position.set(...ride.pos); p.dog.group.rotation.set(0, 0, 0); p.dog.group.scale.setScalar(ride.scale);
    }
    p.dog.group.visible = true;
    // (head into the wind: the look a little ahead of the car)
    p.dog.group.getWorldPosition(v);
    const h = car.heading || 0;
    lookAt.set(v.x + Math.sin(h) * 6 + Math.cos(h) * 1.5, v.y + 0.4, v.z + Math.cos(h) * 6 - Math.sin(h) * 1.5);
    p.dog.update(dt, { mode: 'sit', speed: 0, look: lookAt, mouth: Math.min(1, 0.3 + Math.abs(car.speed || 0) / 25), wag: 0.6, calm: 1 });
  }
  const api = {
    list: pets.map((p) => p.name),
    update(dt) {
      if (!dt || dt > 0.25) dt = Math.min(0.25, dt || 0.016);
      for (const p of pets) {
        p.dog.group.visible = true;
        if (cm.activeMode === 'car' || P.inVehicle) inCar(p, dt); else onFoot(p, dt);
      }
    },
    dispose() { for (const p of pets) p.dog.group.removeFromParent(); },
  };
  return api;
}
