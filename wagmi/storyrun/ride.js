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
import { rideFleetOf } from '../fleet-picks.js';

// (a sheet naming one of a town fleet's ready-made models, fleet: '<id>', wagmi/fleet-car.js, wears it when it has
// loaded; the sheet's own Story Kit body otherwise. In a town, a sheet's own pickup or SUV wears the fleet's full-size
// one, wagmi/fleet-picks.js rideFleetOf: asked for here if it isn't loaded yet, for the next time)
export function rideSheet(sheet) {
  const N = globalThis.window?.NYC, id = N?.CITY === 'pkg' && N.Fleet ? rideFleetOf(sheet) : null;
  if (!id || !N.Fleet.data?.models?.[id]) return sheet;
  if (fleetModelReady(id)) return { ...sheet, fleet: id };
  N.Fleet.load(id).catch(() => {});
  return sheet;
}
export function buildSheetCar(THREE, sheet0) {
  let rs = null;
  const sheet = rideSheet(sheet0);
  if (sheet && sheet.fleet && fleetModelReady(sheet.fleet)) { try { rs = buildFleetCar(THREE, sheet); } catch (err) { console.warn('[fleet] car', err); rs = null; } }
  if (!rs) { const { fleet, ...plain } = sheet || {}; rs = buildVehicle(THREE, plain); }
  rs.doorless = !rs.doors?.L;
  if (rs.doorless) { rs.setDoor = rs.door = () => {}; rs.doorT = () => 0; rs.doors = null; }
  rs.scale = 1;
  // (the roadster's driver marks are hip and heel; a sheet's are hip, knee, foot, hand, eye: its heel a little behind
  // the foot's mark, on the floor. The heel's x is the feet's spread either side of his hip (the roadster's 0.11), not
  // a place: the foot's own x there put his left boot out through the door, 2 x the hip's, and his right on the middle)
  const f = rs.seat.foot || [rs.seat.hip[0], 0.27, rs.seat.hip[2] + 0.75];
  rs.seat.heel = rs.seat.heel || [0.11, f[1], f[2] - 0.2];
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

// (jh-drive round 2) the car's weight, by its class and its sheet's pull and weight: how long it takes to 60 mph on the
// throttle (a sports car about 3.4-3.8 s, a V8 SUV about 5, a sedan 5.5, a pickup 6, a delivery van 8), the boost's shove off the line (a
// sports car's, half again its pull), and its springs: how far it rolls at its tyres' grip (a sports car 3.5 degrees, a
// van 7), less what its own body leans on its springs (build-vehicle.js), stiff or soft as its sheet's tune.js springs.
// The controllers read car.accel, boostLaunch and springs (js/controllers.js, cities/sf/js/controllers.js updateCar).
// Called after the sheet's own numbers are on the car (its accel among them)
export const ZERO_60 = Object.freeze({ sports: 3.8, sedan: 5.4, suv: 4.8, truck: 5.8, van: 7.4 });
export const ROLL_DEG = Object.freeze({ sports: 3.5, sedan: 4.6, suv: 6.0, truck: 6.4, van: 7.0 });
const MPH60 = 26.82;
export function weigh(car, sheet, springs, vclass) {
  const H = (sheet && sheet.handling) || {}, k1 = (x) => Math.max(-1, Math.min(1, +x || 0));
  const t60 = (ZERO_60[vclass] || ZERO_60.sedan) * (1 - 0.12 * k1(H.pull)) * (1 + 0.05 * k1(H.weight));
  // (a world's own car or a mission's ride was tuned with its missions, their timers and chases: it keeps at least 0.8 of
  // its sheet's pull (Colter Land's pursuit at sunup was made on it); a car taken off the street, wagmi/jack.js, is all
  // its class's weight)
  const authored = !String((sheet && sheet.id) || '').startsWith('jack-');
  car.accel = +Math.max(MPH60 / t60, authored && Number.isFinite(car.accel) ? car.accel * 0.8 : 0).toFixed(2);
  car.boostLaunch = vclass === 'sports' ? +(car.accel * 1.5).toFixed(2) : 0;
  const soft = springs && Number.isFinite(springs.rollGain) ? Math.max(0, Math.min(1, (springs.rollGain - 0.0013) / 0.0021)) : 0.5;
  const want = (ROLL_DEG[vclass] || ROLL_DEG.sedan) * (0.85 + 0.3 * soft) * Math.PI / 180;
  const grip = car.handling && Number.isFinite(car.handling.grip) ? car.handling.grip : 30;
  const body = springs && Number.isFinite(springs.rollGain) ? Math.min(grip * springs.rollGain, springs.rollMax || 0.085) : 0;
  const chassis = Math.max(0.6 * Math.PI / 180, want - body);
  car.springs = { rollGain: +(chassis / (grip * 0.66)).toFixed(5), rollMax: +(chassis * 1.25).toFixed(4), k: springs?.k || 60, damp: springs?.damp || 10, t60: +t60.toFixed(2), rollDeg: +(want * 180 / Math.PI).toFixed(1) };
  return car;
}

// the chase camera's framing for any car the player drives: Mog City's own car view (wagmi/game.js, the owner's 4 Nov
// framing of Dan's car: 5.58 m back, 2.05 m up, a 58 degree lens). The owner, 15 Nov: "all games should have initial MOG
// CITY car view unless specified differently in the build". A sheet's tune keeps its own feel of speed (the lens kick,
// its top, the shake); only a tall body (a van, a truck: over 1.6 m) sits the lens a little higher and further back by
// as much as it stands taller, so its roof doesn't fill the frame. (A vehicle sheet has no camera of its own in the Story
// Kit's schema; a build that wants its own car camera says so with cine.carCam, action.js)
export const MOG_FRAMING = Object.freeze({ distance: 5.58, height: 2.05, fov: 58, pull: 0.002 });
export function mogFraming(T = {}, sheet = null, h = 0) {
  const tall = Math.max(0, (h || 0) - 1.6);
  const distance = +(MOG_FRAMING.distance + Math.min(1.2 * tall, 0.9)).toFixed(2);
  const height = +(MOG_FRAMING.height + Math.min(0.86 * tall, 1.2)).toFixed(2);
  return { chaseDistance: distance, chaseHeight: height, chase: { ...(T.chase || {}), fov: MOG_FRAMING.fov, pull: MOG_FRAMING.pull } };
}
const bodyHeight = (T, rs) => (T && T.body && typeof T.body.top === 'number' ? T.body.top : rs && typeof rs.height === 'number' ? rs.height : 0);

export function fitSheet(car, rs) {
  const T = rs.tune || {};
  const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] != null).map((k) => [k, o[k]]));
  Object.assign(car, pick(T, ['body', 'axle', 'mass', 'topSpeed', 'boostSpeed', 'accel', 'boostAccel', 'rolling', 'drag', 'coast', 'brake', 'boostBrake']));
  Object.assign(car, mogFraming(T, rs.sheet || null, bodyHeight(T, rs)));
  if (T.handling) car.handling = { ...T.handling };
  car.label = rs.label || car.label; car.dial = null;   // (its real mph on the HUD, js/main.js)
  weigh(car, rs.sheet || null, rs.springs || null, vehicleClass(rs.sheet || null));
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
const WORN_KEYS = ['body', 'axle', 'mass', 'chaseDistance', 'chaseHeight', 'chase', 'topSpeed', 'boostSpeed', 'accel', 'boostAccel', 'boostLaunch', 'springs', 'rolling', 'drag', 'coast', 'brake', 'boostBrake', 'label', 'vclass', 'noBoost'];
export function wearRide(THREE, car, sheet) {
  // (never on a horse: a horse alongside the car is ridden as it is, wagmi/game.js the two rides; the car wears it)
  const rs = car.roadster; if (!rs || rs.kind === 'horse') return false;
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
    weigh(car, sheet, w.springs || null, vehicleClass(sheet));
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
