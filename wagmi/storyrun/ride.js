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

export function fitSheet(car, rs) {
  const T = rs.tune || {};
  const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] != null).map((k) => [k, o[k]]));
  Object.assign(car, pick(T, ['body', 'axle', 'mass', 'chaseDistance', 'chaseHeight', 'chase', 'topSpeed', 'boostSpeed', 'accel', 'boostAccel', 'rolling', 'drag', 'coast', 'brake', 'boostBrake']));
  if (T.handling) car.handling = { ...T.handling };
  car.label = rs.label || car.label;
  // (its headlamps on its own lamps)
  try { rs.attach?.(car); } catch (err) { console.warn('[storyrun] lamps', err); }
  return car;
}
