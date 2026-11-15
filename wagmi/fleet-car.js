// Mog City, Hometown: the player's car in one of the town fleet's ready-made bodies (cities/sf/js/fleet-models.js,
// window.NYC.Fleet: realistic models, CC BY 4.0, assets/vehicles/fleet/CREDITS.md). A sheet with fleet: '<model id>'
// (wagmi/jack-sheets.js for a car he takes, the town's default car in wagmi/game.js) is built as the Story Kit builds
// any sheet (wagmi/storyrun/vehicles/build-vehicle.js: its seat and the wheel his hands hold, its engine's sound, its
// handling from the sheet's class and adjectives), shaped near the model's size, and then wears the model: the Story
// Kit's own body hidden (the driver's anchor kept, moved with the wheel he holds onto the model's own steering wheel),
// the model's body and glass on its springs, its wheels in the Story Kit's wheel list (so update() spins and steers
// them), its paint and lamps the model's own uniforms (brake lamps from its speed, as the Story Kit's do), its box,
// axles and chase framing the model's. Its doors don't open: it is a doorless car to ride.js (he just gets in).
//   buildFleetCar(THREE, sheet) -> rs (throws when the model isn't loaded: the caller builds the plain sheet then)
//   fleetModelReady(id)         the model is loaded (synchronous)
import { buildVehicle } from './storyrun/vehicles/build-vehicle.js';
import { CLASSES } from './storyrun/vehicles/classes.js';

const Fleet = () => globalThis.window?.NYC?.Fleet || null;
export const fleetModelReady = (id) => !!Fleet()?.get(id);

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
// the class preset's knobs moved toward the model's length, width and height (the seat, the wheel and the sound follow)
function shapedSheet(sheet, m) {
  const C = CLASSES[sheet.class] || CLASSES.sedan;
  const P = { ...(sheet.proportions || {}) };
  if (C && C.L) P.length = clamp((m.length / C.L - 1) / 0.1, -1, 1);
  if (C && C.W) P.width = clamp(((m.width / 2) / C.W - 1) / 0.055, -1, 1);
  return { ...sheet, proportions: P };
}

export function buildFleetCar(THREE, sheet) {
  const F = Fleet(), model = F && F.get(sheet.fleet);
  if (!model) throw new Error('fleet model not loaded: ' + sheet.fleet);
  const m = model.meta;
  const { fleet, ...plain } = shapedSheet(sheet, m);
  const rs = buildVehicle(THREE, plain);
  const g = rs.group, V = (x, y, z) => new THREE.Vector3(x, y, z);
  // the Story Kit's own body put away: every mesh but the driver's (the anchor's subtree)
  const keep = new Set(); rs.anchor.traverse((o) => keep.add(o));
  g.traverse((o) => { if (o.isMesh && !keep.has(o)) o.visible = false; });
  // the model: body, glass, lamps and decals on the body (its springs lean it), the wheels on the car
  const car = F.buildCar(model, { paint: sheet.paint?.base, hero: true });
  for (const part of [...car.group.children]) {
    if (car.wheels.some((w) => w.W === part)) g.add(part);
    else rs.body.add(part);
  }
  rs.wheels.length = 0;
  for (const w of car.wheels) rs.wheels.push({ W: w.W, spin: w.spin, front: w.front, r: w.r });
  // the wheel his hands hold, on the model's own steering wheel, and the driver with it
  if (m.steer && rs.wheel) {
    g.updateMatrixWorld(true);
    const want = rs.body.localToWorld(V(...m.steer)), at = rs.wheel.getWorldPosition(V(0, 0, 0));
    const d = want.sub(at);
    const pw = rs.wheel.parent, pa = rs.anchor.parent;
    const local = (obj, delta) => { const a = obj.parent.worldToLocal(obj.getWorldPosition(V(0, 0, 0)).add(delta)); obj.position.copy(a); };
    if (pw && pa) { local(rs.wheel, d.clone()); local(rs.anchor, d.clone()); }
  }
  // (his eyes under the model's roof: a low sports car seats him lower than its class's preset; an open car leaves him be)
  if (!m.open && rs.seat) {
    const eye = rs.anchor.position.y + (rs.seat.eye ? rs.seat.eye[1] : rs.seat.hip[1] + 0.56), roofEye = m.height - 0.17;
    if (eye > roofEye) rs.anchor.position.y -= eye - roofEye;
  }
  // its paint and lamps: the model's uniforms
  rs.setPaint = (hex) => car.setPaint(hex);
  let prev = 0, accS = 0, brakeSet = null, revSet = null;
  const update = rs.update;
  rs.update = (dt, speed = 0, steer = 0) => {
    update(dt, speed, steer);
    if (!(dt > 0)) return;
    const acc = (speed - prev) / Math.min(dt, 0.05); prev = speed;
    accS += (acc - accS) * Math.min(1, dt * 8);
    const slowing = speed * accS < 0 ? Math.abs(accS) : 0;
    const brake = brakeSet ?? (Math.abs(speed) < 0.3 || slowing > 3.4 ? 1 : 0);
    car.setState(brake, 0, 0, m.livery === 'police' ? 1 : 0);
  };
  rs.setBrake = (on) => { brakeSet = on == null ? null : on ? 1 : 0; };
  rs.setReverse = (on) => { revSet = on == null ? null : on ? 1 : 0; };
  // its headlamps' spots on the model's own lamps
  const HEAD_GAIN = 6, head = m.head || [m.hw * 0.7, 0.7, m.zF - 0.2];
  rs.attach = (c) => {
    if (!c?.headLights) return;
    c.headLights.forEach((s, i) => {
      const side = s.position.x < 0 ? -1 : s.position.x > 0 ? 1 : (i ? 1 : -1), x = side * Math.abs(head[0]), y = head[1], z = head[2] + 0.05;
      s.position.set(x, y, z); s.target.position.set(x + side * 0.25, y - 10 * Math.tan(0.08), z + 10);
      s.color.set('#F2F0E8'); s.angle = 0.26; s.penumbra = 0.6; s.distance = 90;
      let val = s.intensity; Object.defineProperty(s, 'intensity', { get: () => val, set: (x2) => { val = x2 * HEAD_GAIN; }, configurable: true });
    });
  };
  // the model's box, axles and chase framing (tune.js's formulas, from the model's size)
  const T = rs.tune || (rs.tune = {});
  T.body = { hx: +(m.hw * 0.95).toFixed(2), z0: +(m.zR - 0.04).toFixed(2), z1: +(m.zF + 0.05).toFixed(2), top: +m.height.toFixed(2) };
  T.axle = +m.axle.toFixed(2);
  T.chaseDistance = +(2.6 + 0.67 * m.length + Math.min(1.5 * Math.max(0, m.height - 1.4), 0.9)).toFixed(2);
  T.chaseHeight = +(0.55 + 0.86 * m.height).toFixed(2);
  Object.assign(rs, { length: m.length, width: m.width, height: m.height, fleet: sheet.fleet, fleetCar: car });
  // (no door cut in the model: doorless, ride.js keeps its no-op setDoor and he just gets in)
  rs.doors = null;
  return rs;
}
