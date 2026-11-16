// Mog City story runner: the player's car from a world's vehicle sheet (wagmi/storyrun/vehicles: the Story Kit's
// buildVehicle, a copy, same owner). Called from the car block of wagmi/game.js only when a world names a sheet car;
// Dan's roadster keeps today's numbers exactly (that block's default side).
// buildVehicle already returns the interface of Dan's roadster (group, anchor, seat, update, setThrust, setElectric,
// length, width, height), and its front doors open as the roadster's do (setDoor, doorT, doors.L.pivot with the hand's
// frame first): wagmi/game.js's way in and out swings the driver's door, his hand on its handle. What a sheet car lacks
// is made safe here: a car with no door cut (none built) keeps the no-op setDoor; no yoke (its own wheel turns in its
// update).
//   buildSheetCar(THREE, sheet) -> rs (or throws: the roadster then)
//   fitSheet(car, rs)           the city's car entity's numbers from the sheet (tune.js: body box, axle, mass, pace,
//                               brakes, handling), in place of the roadster's; its chase framing Mog City's (mogFraming)
import { buildVehicle } from './vehicles/build-vehicle.js';
import { buildFleetCar, fleetModelReady } from '../fleet-car.js';

// (a sheet naming one of a town fleet's ready-made models, fleet: '<id>', wagmi/fleet-car.js, wears it when it has
// loaded; the sheet's own Story Kit body otherwise)
export function buildSheetCar(THREE, sheet) {
  let rs = null;
  if (sheet && sheet.fleet && fleetModelReady(sheet.fleet)) { try { rs = buildFleetCar(THREE, sheet); } catch (err) { console.warn('[fleet] car', err); rs = null; } }
  if (!rs) { const { fleet, ...plain } = sheet || {}; rs = buildVehicle(THREE, plain); }
  rs.doorless = !rs.doors?.L;
  if (rs.doorless) { rs.setDoor = rs.door = () => {}; rs.doorT = () => 0; rs.doors = null; }
  rs.scale = 1;
  // (the roadster's driver marks are hip and heel; a sheet's are hip, knee, foot, hand, eye: its heel a little behind
  // the foot's mark, on the floor)
  const f = rs.seat.foot || [rs.seat.hip[0], 0.27, rs.seat.hip[2] + 0.75];
  rs.seat.heel = rs.seat.heel || [f[0], f[1], f[2] - 0.2];
  return rs;
}

// a vehicle's class, for what it sounds like and whether it boosts (the owner: "the truck shouldn't make the same noise
// as the [sports car] or have the booster"). Only a sports car (sports, supercar, coupe, muscle; the hero's own GT and Dan's
// roadster are sports) has the boost: its push, its flame, its sound and its HUD. Every other car drives on its own
// pace alone, whatever its sheet's abilities say, and has an engine of its own (wagmi/audio/playercar.js: voice):
//   van    van, minivan              a diesel six's low, slow clatter (the city's bus engine, in the cab)
//   truck  pickup, wrecker           the same diesel, a little lower and harder
//   suv    suv, crossover            a petrol six, deeper than a sedan's
//   sedan  sedan, taxi, cruiser, limo, wagon   a plain petrol four
//   sports sports, supercar, coupe, muscle      the supercar's V8 (wagmi/audio/supercar.js), and the boost
const CLASS_OF = { van: 'van', minivan: 'van', pickup: 'truck', wrecker: 'truck', suv: 'suv', crossover: 'suv', sedan: 'sedan', taxi: 'sedan', cruiser: 'sedan', limo: 'sedan', wagon: 'sedan', sports: 'sports', supercar: 'sports', coupe: 'sports', muscle: 'sports' };
export const vehicleClass = (sheet) => (sheet ? CLASS_OF[sheet.class] || 'sedan' : 'sports');
// (the car entity's class and its boost: off, its boost pace is its plain pace, so Shift does nothing to it)
export function setClass(car, vclass) {
  car.vclass = vclass;
  car.noBoost = vclass !== 'sports';
  if (car.noBoost) {
    Object.assign(car, { boostSpeed: car.topSpeed, boostAccel: car.accel, boostBrake: car.brake, boosting: false });
    if (car.chase) car.chase = { ...car.chase, boostKick: 0, vtop: car.topSpeed };
  }
  return car;
}

// the chase camera's framing for any car the player drives: Mog City's own car view (wagmi/game.js, the owner's 4 Nov
// framing of Dan's car: 5.58 m back, 2.05 m up, a 58 degree lens). The owner, 15 Nov: "all games should have initial MOG
// CITY car view unless specified differently in the build". A sheet's tune keeps its own feel of speed (the lens kick,
// its top, the shake); only a tall body (a van, a truck: over 1.6 m) sits the lens a little higher and further back by
// as much as it stands taller, so its roof doesn't fill the frame. A sheet that names its own framing, camera:
// { distance, height, fov } (the build's choice; the Story Kit never writes it by itself), has that.
export const MOG_FRAMING = Object.freeze({ distance: 5.58, height: 2.05, fov: 58, pull: 0.002 });
export function mogFraming(T = {}, sheet = null, h = 0) {
  const own = sheet && sheet.camera && typeof sheet.camera === 'object' ? sheet.camera : null;
  const num = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : null);
  const tall = Math.max(0, (h || 0) - 1.6);
  const distance = num(own?.distance, 2, 20) ?? +(MOG_FRAMING.distance + Math.min(1.2 * tall, 0.9)).toFixed(2);
  const height = num(own?.height, 0.5, 10) ?? +(MOG_FRAMING.height + Math.min(0.86 * tall, 1.2)).toFixed(2);
  const fov = num(own?.fov, 30, 100) ?? MOG_FRAMING.fov;
  return { chaseDistance: distance, chaseHeight: height, chase: { ...(T.chase || {}), fov, pull: MOG_FRAMING.pull } };
}
const bodyHeight = (T, rs) => (T && T.body && typeof T.body.top === 'number' ? T.body.top : rs && typeof rs.height === 'number' ? rs.height : 0);

export function fitSheet(car, rs) {
  const T = rs.tune || {};
  const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] != null).map((k) => [k, o[k]]));
  Object.assign(car, pick(T, ['body', 'axle', 'mass', 'topSpeed', 'boostSpeed', 'accel', 'boostAccel', 'rolling', 'drag', 'coast', 'brake', 'boostBrake']));
  Object.assign(car, mogFraming(T, rs.sheet || null, bodyHeight(T, rs)));
  if (T.handling) car.handling = { ...T.handling };
  car.label = rs.label || car.label; car.dial = null;   // (its real mph on the HUD, js/main.js)
  setClass(car, vehicleClass(rs.sheet || null));
  // (its headlamps on its own lamps)
  try { rs.attach?.(car); } catch (err) { console.warn('[storyrun] lamps', err); }
  return car;
}

// a mission's own ride (a world's `rides` sheet named by a mission's `vehicle`, Pickup Time's Slice Marin van): the hero's
// car wears it for that mission and takes its own body back for the next. The car entity, its rig object (car.roadster:
// game.js's onUpdate, the doors and the driver hold it) and the driver stay; the hero car's meshes are hidden (the
// driver's seat anchor kept), the sheet's body shown on the same chassis, the car's numbers (box, axles, chase framing,
// pace, brakes, handling, name) the sheet's while it is worn and the hero car's again after.
//   wearRide(THREE, car, sheet | null)
const WORN_KEYS = ['body', 'axle', 'mass', 'chaseDistance', 'chaseHeight', 'chase', 'topSpeed', 'boostSpeed', 'accel', 'boostAccel', 'rolling', 'drag', 'coast', 'brake', 'boostBrake', 'label', 'vclass', 'noBoost'];
export function wearRide(THREE, car, sheet) {
  const rs = car.roadster; if (!rs) return false;
  const st = rs.__worn || (rs.__worn = { id: null, base: null, rigs: {} });
  const id = sheet ? sheet.id : null;
  if (st.id === id) return false;
  if (st.id) {
    st.rigs[st.id].group.visible = false;
    for (const [m, v] of st.base.meshes) m.visible = v;
    // (the driver's seat and the wheel he holds back in the hero car's own places)
    for (const [o, p] of st.base.seatAt || []) o.position.copy(p);
    for (const k of WORN_KEYS) car[k] = st.base.car[k];
    car.dial = st.base.dial;
    car.handling = { ...st.base.handling };
    rs.update = st.base.update; rs.setThrust = st.base.setThrust;
    st.id = null;
  }
  if (id) {
    if (!st.base) {
      // (the hero car's own meshes, not the seat anchor's subtree: the driver sits on that)
      const meshes = [], skip = new Set(); rs.anchor?.traverse((o) => skip.add(o));
      rs.group.traverse((o) => { if (o.isMesh && !skip.has(o)) meshes.push([o, o.visible]); });
      st.base = { meshes, car: Object.fromEntries(WORN_KEYS.map((k) => [k, car[k]])), dial: car.dial, handling: { ...car.handling }, update: rs.update, setThrust: rs.setThrust };
    }
    let w = st.rigs[id];
    if (!w) {
      w = st.rigs[id] = buildSheetCar(THREE, sheet);
      w.group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      car.chassisPivot.add(w.group);
    }
    for (const [m] of st.base.meshes) m.visible = false;
    w.group.visible = true;
    const T = w.tune || {};
    for (const k of WORN_KEYS) if (T[k] != null) car[k] = T[k];
    Object.assign(car, mogFraming(T, sheet, bodyHeight(T, w)));   // (Mog City's car view, as fitSheet)
    if (T.handling) car.handling = { ...T.handling };
    car.label = w.label || sheet.label || car.label; car.dial = null;
    setClass(car, vehicleClass(sheet));
    // (the hero rig still runs (its wheel the hands hold), its flame off; the sheet's body turns its own wheels)
    rs.update = (dt, v, s) => { st.base.update.call(rs, dt, v, s); w.update(dt, v, s); };
    rs.setThrust = (a, b) => { st.base.setThrust.call(rs, 0, 0); w.setThrust?.(a, b); };
    // (Mog City, Hometown) a town fleet's model worn (wagmi/fleet-car.js, which seats its driver under its roof): the
    // driver (who sits on the hero car's anchor) and the wheel his hands hold moved by as much as its seat lies off the
    // hero car's, his hip onto its hip (a low sports car's roof over his head); a mission's other rides as before
    try {
      if (!st.base.seatAt) st.base.seatAt = [rs.anchor, rs.wheel, rs.yoke].filter(Boolean).map((o) => [o, o.position.clone()]);
      for (const [o, p] of st.base.seatAt) o.position.copy(p);
      if (w.fleet && rs.anchor && w.anchor && rs.seat?.hip && w.seat?.hip) {
        car.chassisPivot.updateMatrixWorld(true);
        const hip = (r) => r.anchor.localToWorld(new THREE.Vector3(...r.seat.hip));
        const d = hip(w).sub(hip(rs));
        for (const [o] of st.base.seatAt) { const at = o.getWorldPosition(new THREE.Vector3()).add(d); o.position.copy(o.parent.worldToLocal(at)); }
      }
    } catch (err) { console.warn('[storyrun] seat', err); }
    st.id = id;
  }
  const lab = typeof document !== 'undefined' && document.getElementById('hud-active-mode'); if (lab) lab.textContent = car.label;
  return true;
}
