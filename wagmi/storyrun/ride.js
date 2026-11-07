// Mog City story runner: the player's car from a world's vehicle sheet (wagmi/storyrun/vehicles: the Story Kit's
// buildVehicle, a copy, same owner). Called from the car block of wagmi/game.js only when a world names a sheet car;
// Dan's roadster keeps today's numbers exactly (that block's default side).
// buildVehicle already returns the interface of Dan's roadster (group, anchor, seat, update, setThrust, setElectric,
// length, width, height), and its front doors open as the roadster's do (setDoor, doorT, doors.L.pivot with the hand's
// frame first): wagmi/game.js's way in and out swings the driver's door, his hand on its handle. What a sheet car lacks
// is made safe here: a car with no door cut (none built) keeps the no-op setDoor; no yoke (its own wheel turns in its
// update).
//   buildSheetCar(THREE, sheet) -> rs (or throws: the roadster then)
//   fitSheet(car, rs)           the city's car entity's numbers from the sheet (tune.js: body box, axle, mass, chase
//                               framing, pace, brakes, handling), in place of the roadster's
import { buildVehicle } from './vehicles/build-vehicle.js';

export function buildSheetCar(THREE, sheet) {
  const rs = buildVehicle(THREE, sheet);
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
// as the porsche or have the booster"). Only a sports car (sports, supercar, coupe, muscle; the hero's own GT and Dan's
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

export function fitSheet(car, rs) {
  const T = rs.tune || {};
  const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] != null).map((k) => [k, o[k]]));
  Object.assign(car, pick(T, ['body', 'axle', 'mass', 'chaseDistance', 'chaseHeight', 'chase', 'topSpeed', 'boostSpeed', 'accel', 'boostAccel', 'rolling', 'drag', 'coast', 'brake', 'boostBrake']));
  if (T.handling) car.handling = { ...T.handling };
  car.label = rs.label || car.label;
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
    for (const k of WORN_KEYS) car[k] = st.base.car[k];
    car.handling = { ...st.base.handling };
    rs.update = st.base.update; rs.setThrust = st.base.setThrust;
    st.id = null;
  }
  if (id) {
    if (!st.base) {
      // (the hero car's own meshes, not the seat anchor's subtree: the driver sits on that)
      const meshes = [], skip = new Set(); rs.anchor?.traverse((o) => skip.add(o));
      rs.group.traverse((o) => { if (o.isMesh && !skip.has(o)) meshes.push([o, o.visible]); });
      st.base = { meshes, car: Object.fromEntries(WORN_KEYS.map((k) => [k, car[k]])), handling: { ...car.handling }, update: rs.update, setThrust: rs.setThrust };
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
    if (T.handling) car.handling = { ...T.handling };
    car.label = w.label || sheet.label || car.label;
    setClass(car, vehicleClass(sheet));
    // (the hero rig still runs (its wheel the hands hold), its flame off; the sheet's body turns its own wheels)
    rs.update = (dt, v, s) => { st.base.update.call(rs, dt, v, s); w.update(dt, v, s); };
    rs.setThrust = (a, b) => { st.base.setThrust.call(rs, 0, 0); w.setThrust?.(a, b); };
    st.id = id;
  }
  const lab = typeof document !== 'undefined' && document.getElementById('hud-active-mode'); if (lab) lab.textContent = car.label;
  return true;
}
