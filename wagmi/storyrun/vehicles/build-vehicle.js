// Story Kit vehicles: buildVehicle(THREE, sheet) turns a vehicle sheet (vehicle-sheet.schema.json) into a drivable
// car with the player car interface the Story Kit engine already speaks (engine/car/player-car.js, the interface of
// engine/cars/suv.js): group, body, materials, wheels, anchor, seat, tune, sound, length, width, height, update, attach,
// onDrive, setThrust, setElectric, setNight, setBrake, setReverse, plus childSeat / booster when the sheet carries one.
//
//   import { buildVehicle } from '/storykit/vehicles/build-vehicle.js';
//   const car = buildVehicle(THREE, sheet);            // throws VehicleSheetError (its .problems) for a bad sheet
//   scene.add(car.group); car.update(dt, speed, steer); // steer < 0: turning left, as player-car.js passes it
//
// How it is built (no geometry is written per car: the class preset holds the base numbers, the sheet's knobs move
// them, and every enum value is one part function below, shared by every sheet):
//   1. the shape: resolveShape() reads the class preset (classes.js) and the knobs into lines: the plan's half width,
//      the shoulder (bonnet, belt, deck), the crown, the roof, the glasshouse's ends;
//   2. the lower body: a section at every station along the car (sill, cladding step, crease, shoulder, the top across),
//      lofted into one grid per side, open over the cabin (and a pickup's bed); arches cut round each wheel;
//   3. the glasshouse: a loft of plan rings from the belt to the roof, laid out from the doors and the rear shape (A, B,
//      C and D pillars, glass, seals), a rolled roof edge and a crowned roof; the headliner inside;
//   4. the parts: bumpers, grille, lamps, tail lamps, plates, mirrors, handles, seams, rails, scoops, aero, exhausts,
//      wheels and tyres, the cabin (dash, wheel, seats, a partition), the story props on the class's sockets, the livery;
//   5. the paint: one node material over the whole body: two-tone, stripes, and the condition (grime low down, a dull
//      clear coat, scuffs, rust, a mismatched panel), so the merged body stays one draw per material;
//   6. drive and sound: tune.js maps the handling adjectives to the drive model's numbers and the sound words to an
//      engine profile (engine/audio/supercar.js accepts a profile object).
// Units are metres; the car stands on y = 0, nose to +z, the driver's side +x (the frame of the lifted cars).
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { positionLocal, normalLocal, mx_noise_float, smoothstep, mix, vec3, float, abs, step, color, max } from 'three/tsl';
import { checkSheet } from './sheet.js';
import { CLASSES, REAR } from './classes.js';
import { driveTune, soundProfile } from './tune.js';

export class VehicleSheetError extends Error {
  constructor(problems) { super('vehicle sheet refused: ' + problems.join('; ')); this.problems = problems; }
}

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function crv(keys) {
  keys = keys.slice().sort((a, b) => a[0] - b[0]).filter((k, i, a) => i === 0 || k[0] - a[i - 1][0] > 1e-3);
  const n = keys.length, xs = keys.map((k) => k[0]), ys = keys.map((k) => k[1]), h = [], d = [], m = new Array(n);
  if (n === 1) return () => ys[0];
  for (let i = 0; i < n - 1; i++) { h[i] = xs[i + 1] - xs[i]; d[i] = (ys[i + 1] - ys[i]) / h[i]; }
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) m[i] = 0;
    else { const w1 = 2 * h[i] + h[i - 1], w2 = h[i] + 2 * h[i - 1]; m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]); }
  }
  return (x) => {
    if (x <= xs[0]) return ys[0]; if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0; while (x > xs[i + 1]) i++;
    const t = (x - xs[i]) / h[i], t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h[i] * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h[i] * m[i + 1];
  };
}
// a small deterministic random from the sheet's id (dents, scuffs, a plate)
function rng(seedText) {
  let h = 2166136261; for (const c of String(seedText)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 100000) / 100000; };
}

/* ======================================================================= the shape == */
// the class preset moved by the knobs; every line the builder draws comes out of this
export function resolveShape(sheet) {
  const C = CLASSES[sheet.class], P = sheet.proportions, B = sheet.body;
  const kl = 1 + 0.1 * P.length;
  const L = C.L * kl, W = C.W * (1 + 0.055 * P.width), wb = C.wb * kl, fo = C.fo * kl;
  const ZF = L / 2, ZR = -L / 2, AXF = ZF - fo, AXR = AXF - wb;
  const WR = C.WR * (1 + 0.08 * P.wheelSize), RIM = Math.min(WR - 0.07, C.RIM * (1 + 0.15 * P.wheelSize));
  const flare = Math.max(0, P.flare) * 0.035;
  const TW = C.TW * (1 + 0.04 * P.wheelSize + 0.12 * Math.max(0, P.flare));
  const WX = W - C.WXin + flare * 0.8;
  const ride = 0.07 * P.rideHeight, hs = 1 + 0.08 * P.height;
  const Y = (y) => C.yb + ride + (y - C.yb) * hs;
  const belt = 0.055 * P.beltline;
  const yb = C.yb + ride;
  const S = {
    cls: sheet.class, L, W, wb, ZF, ZR, AXF, AXR, WR, RIM, TW, WX, flare,
    ARCH: WR + Math.max(0.035, 0.055 + 0.02 * P.rideHeight), yb,
    yNose: Y(C.yNose) + belt * 0.5, yCowl: Y(C.yCowl) + belt, yBelt: Y(C.yBelt) + belt, yTail: Y(C.yTail) + belt,
    yRoof: Y(C.yRoof) + 0.075 * P.roofline + (B.roof === 'high' && C.roof !== 'high' ? 0.5 : 0),
    roofFall: C.roofFall, crease: Y(C.crease), clad: B.cladding ? (C.clad ? Y(C.clad) : yb + 0.22) : 0,
    tumble: C.tumble * (1 + 0.6 * P.tumblehome), crownH: C.crown, RF: C.RF, RR: C.RR,
    rear: B.rear, doors: B.doors, roof: B.roof,
  };
  // the glasshouse's ends: the class's own for its own rear shape, else the shape's fractions of the length
  let roofR = C.roofR * kl, back = C.back * kl;
  if (B.rear !== C.rear) { const [a, b] = REAR[B.rear]; roofR = a * L; back = b * L; }
  if (B.rear === 'fastback' || B.rear === 'notchback') roofR -= 0.12 * P.roofline;
  const shift = 0.2 * P.cabinForward, boxy = ['hatch', 'wagon', 'box'].includes(B.rear);
  S.zCowl = ZF - (C.cowl * kl + 0.25 * P.bonnet) + shift;
  S.zRoofF = ZF - (C.roofF * kl + 0.12 * P.bonnet + 0.2 * P.windscreenRake) + shift;
  S.zRoofR = ZR + roofR + (boxy ? 0 : shift);
  S.zBack = ZR + back + (boxy ? 0 : shift);
  // (kept in order: tail < back glass's foot <= roof's back < roof's front < windscreen's foot < nose)
  S.zCowl = clamp(S.zCowl, AXF - 0.3, ZF - 0.35);
  S.zRoofF = clamp(S.zRoofF, ZR + 1.0, S.zCowl - 0.12);
  S.zRoofR = clamp(S.zRoofR, ZR + 0.02, S.zRoofF - 0.7);
  S.zBack = clamp(S.zBack, ZR + 0.004, S.zRoofR);
  S.wRoof = C.wRoof * (W / C.W) * (1 - 0.07 * P.tumblehome);
  // a high roof's glass stops short of the roof (a van's windscreen and door glass)
  S.glassTop = B.roof === 'high' ? Math.min(S.yRoof - 0.3, S.yBelt + 0.72) : null;
  // the side glass: the class's layout for its own doors, else a two- or four-door layout
  S.win = B.doors === C.doors ? C.win : B.doors <= 3 ? [[0.03, 0.62, 'front'], [0.66, 0.85, 'rear']] : [[0.035, 0.4, 'front'], [0.425, 0.7, 'rear'], [0.725, 0.9, 'rear']];
  S.pillar = C.pillar;
  // the driver: the eye under the roof, the hip a little over half a metre under it
  const eye = S.yRoof - 0.27 - (S.glassTop ? S.yRoof - S.glassTop - 0.15 : 0);
  S.hipY = Math.max(yb + 0.24, eye - 0.56);
  S.eyeY = eye;
  S.seatZ = S.zCowl - clamp(0.62 * (S.yCowl - S.hipY + 0.5) + 0.45, 0.8, 1.15);
  return S;
}

/* ===================================================================== the builder == */
export function buildVehicle(THREE, raw, o = {}) {
  const chk = checkSheet(raw);
  if (!chk.ok) throw new VehicleSheetError(chk.problems);
  const sheet = chk.sheet;
  if (o.paint) sheet.paint = { ...sheet.paint, base: o.paint };
  const S = resolveShape(sheet);
  const R = rng(sheet.id);
  const g = new THREE.Group(); g.name = 'sk-vehicle-' + sheet.id;
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const { ZF, ZR, W, AXF, AXR, WR, ARCH, yb } = S;
  const cond = { showroom: 0, daily: 1, tired: 2, beater: 3 }[sheet.condition];
  const trimChrome = sheet.body.trim === 'chrome', era = sheet.era;

  /* ------------------------------------------------------------- materials -- */
  const std = (p) => new THREE.MeshStandardNodeMaterial(p);
  const FIN = {
    gloss: { metalness: 0.15, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.08 },
    metallic: { metalness: 0.55, roughness: 0.36, clearcoat: 0.7, clearcoatRoughness: 0.12 },
    pearl: { metalness: 0.4, roughness: 0.3, clearcoat: 0.9, clearcoatRoughness: 0.05, sheen: 0.4 },
    satin: { metalness: 0.2, roughness: 0.55, clearcoat: 0.25, clearcoatRoughness: 0.4 },
    matte: { metalness: 0.1, roughness: 0.78, clearcoat: 0, clearcoatRoughness: 0.6 },
    primer: { metalness: 0.0, roughness: 0.9, clearcoat: 0, clearcoatRoughness: 0.8 },
  }[sheet.paint.finish];
  // the condition dulls the clear coat
  const fin = { ...FIN, roughness: clamp(FIN.roughness + [0, 0.05, 0.14, 0.24][cond], 0, 1), clearcoat: FIN.clearcoat * [1, 0.85, 0.5, 0.2][cond] };
  const finishMat = (hex) => new THREE.MeshPhysicalNodeMaterial({ color: hex, ...fin });
  const WHEEL_FIN = { silver: ['#B9BEC3', 0.28, 0.85], black: ['#1C1D1F', 0.4, 0.5], gunmetal: ['#4A4E53', 0.3, 0.8], chrome: ['#E6E9EC', 0.06, 1.0], white: ['#E6E6E2', 0.35, 0.3], bronze: ['#8A6B3E', 0.3, 0.85] }[sheet.wheels.finish];
  const seatHex = sheet.interior.seat, seatRough = { cloth: 0.95, vinyl: 0.55, leather: 0.48, alcantara: 0.98 }[sheet.interior.material];
  const M = {
    paint: finishMat(sheet.paint.base),
    clad: std({ color: '#2E3032', roughness: 0.8, metalness: 0.05 }),
    black: std({ color: '#0E0F10', roughness: 0.5, metalness: 0.1 }),
    trim: trimChrome ? std({ color: '#E4E7EA', roughness: 0.1, metalness: 1.0 }) : std({ color: '#121314', roughness: 0.7 }),
    rubberTrim: std({ color: '#151617', roughness: 0.85 }),
    chrome: std({ color: '#E4E7EA', roughness: 0.1, metalness: 1.0 }),
    bumperPl: std({ color: '#26282A', roughness: 0.82, metalness: 0.02 }),
    glassF: new THREE.MeshPhysicalNodeMaterial({ color: sheet.class === 'supercar' ? '#3A2814' : '#1A2329', roughness: 0.04, metalness: 0.0, transparent: true, opacity: 0.4 + cond * 0.04, depthWrite: false, side: THREE.DoubleSide }),
    glassR: new THREE.MeshPhysicalNodeMaterial({ color: sheet.class === 'supercar' ? '#2A2016' : '#141B20', roughness: 0.04, metalness: 0.0, transparent: true, opacity: 0.55 + cond * 0.03, depthWrite: false, side: THREE.DoubleSide }),
    lens: new THREE.MeshPhysicalNodeMaterial({ color: '#E8EEF2', roughness: 0.03, metalness: 0.0, transparent: true, opacity: 0.14 + cond * 0.05, depthWrite: false }),
    reflector: std({ color: '#9AA1A8', roughness: 0.16, metalness: 1.0, emissive: '#FFF0D8', emissiveIntensity: 0 }),
    bulb: std({ color: '#BFC3C6', emissive: era >= 2008 ? '#F4F8FF' : '#FFF1D6', emissiveIntensity: 0.0, roughness: 0.2 }),
    drl: std({ color: '#D8DDE2', emissive: '#EAF2FF', emissiveIntensity: 0.6, roughness: 0.2 }),
    amber: std({ color: '#C77A1A', emissive: '#FF8A1A', emissiveIntensity: 0.0, roughness: 0.25, metalness: 0.1 }),
    tail: std({ color: '#6E0A0E', emissive: '#E3060C', emissiveIntensity: 0.0, roughness: 0.22, metalness: 0.1 }),
    reverse: std({ color: '#D9DCDF', emissive: '#FFFFFF', emissiveIntensity: 0.0, roughness: 0.15, metalness: 0.3 }),
    chmsl: std({ color: '#3A0507', emissive: '#FF1418', emissiveIntensity: 0.0, roughness: 0.3 }),
    interior: std({ color: '#1E1F21', roughness: 0.9, side: THREE.BackSide }),
    dash: std({ color: '#232426', roughness: 0.8 }),
    seat: std({ color: seatHex, roughness: seatRough, metalness: 0 }),
    cluster: std({ color: '#101214', emissive: '#58C8D8', emissiveIntensity: 0.0, roughness: 0.4 }),
    screen: std({ color: '#0A0C10', emissive: '#4C7FBF', emissiveIntensity: 0.0, roughness: 0.15, metalness: 0.2 }),
    rubber: std({ color: '#181818', roughness: 0.92, metalness: 0.0, side: THREE.DoubleSide }),
    white: std({ color: '#ECEBE6', roughness: 0.7, side: THREE.DoubleSide }),
    alloy: std({ color: WHEEL_FIN[0], roughness: WHEEL_FIN[1], metalness: WHEEL_FIN[2], side: THREE.DoubleSide }),
    aero: std({ color: '#D8DADC', roughness: 0.3, metalness: 0.6, side: THREE.DoubleSide }),
    barrel: std({ color: '#55595E', roughness: 0.5, metalness: 0.7, side: THREE.DoubleSide }),
    disc: std({ color: '#6B6E72', roughness: 0.45, metalness: 0.8 }),
    caliper: std({ color: '#2F3134', roughness: 0.6, metalness: 0.4 }),
    under: std({ color: '#121314', roughness: 0.9, side: THREE.DoubleSide }),
    mirror: std({ color: '#9AA4AC', roughness: 0.02, metalness: 1.0 }),
    fabric: std({ color: '#1A1B1C', roughness: 0.97 }),
    thrust: std({ color: '#2A2D31', emissive: '#7FE8FF', emissiveIntensity: 0, roughness: 0.3, metalness: 0.7 }),
    burn: std({ color: '#1A1B1D', emissive: '#FF7A1E', emissiveIntensity: 0, roughness: 0.4 }),
  };
  if (sheet.paint.second && sheet.paint.split !== 'none') M.second = finishMat(sheet.paint.second);
  if (sheet.class === 'supercar' && sheet.paint.split === 'lower') M.lowerGloss = new THREE.MeshPhysicalNodeMaterial({ color: sheet.paint.second || '#0B0C0D', metalness: 0.2, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05 });

  /* ------------------------------------------------------------ the lines -- */
  const { zCowl, zRoofF, zRoofR, zBack, RF, RR } = S;
  const tu = S.tumble;
  // the plan's half width: rounded at the corners, a little in toward the ends, out over the wheels (flares, hips)
  const hips = sheet.body.crease === 'muscle-hips' ? 0.022 : 0;
  const bump = (z, cz, r) => Math.max(0, 1 - ((z - cz) / r) ** 2);
  const Wz = (z) => W - 0.022 * sm(AXF + 0.2, ZF, z) - 0.012 * sm(AXR - 0.2, ZR, z) + hips * bump(z, AXR + 0.05, 0.8) + S.flare * 0.6 * (bump(z, AXF, ARCH + 0.2) + bump(z, AXR, ARCH + 0.2));
  const halfW = (z) => {
    let w = Wz(z);
    if (z > ZF - RF) { const d = Math.min(1, (z - (ZF - RF)) / RF); w -= RF * (1 - Math.sqrt(Math.max(0, 1 - d * d))); }
    if (z < ZR + RR) { const d = Math.min(1, ((ZR + RR) - z) / RR); w -= RR * (1 - Math.sqrt(Math.max(0, 1 - d * d))); }
    return w;
  };
  // the shoulder: the bonnet from the nose to the windscreen's foot, the belt along the cabin, the deck or tail
  const isBed = S.rear === 'bed';
  const YS = crv([[ZR, S.yTail], [ZR + 0.3, S.yTail + 0.004], [Math.min(zBack, ZR + 0.6) + 0.01, lerp(S.yTail, S.yBelt, 0.4)], [lerp(zBack, zCowl, 0.45), S.yBelt],
    [zCowl, S.yCowl], [lerp(zCowl, ZF, 0.55), lerp(S.yCowl, S.yNose, 0.4)], [ZF, S.yNose]]);
  // the crown across the bonnet and deck (a power dome or a scoop's base on the bonnet's middle)
  const domeK = sheet.body.hood === 'dome' || sheet.body.hood === 'scoop' ? 1 : 0;
  function crown(x, z) {
    x = Math.abs(x);
    if (z > zCowl - 0.05) {
      const base = S.crownH * Math.max(0, 1 - (x / (W * 0.93)) ** 2);
      const dome = domeK * 0.032 * (1 - sm(0.22, 0.38, x)) * sm(zCowl + 0.25, zCowl + 0.65, z) * (1 - sm(ZF - 0.45, ZF - 0.1, z));
      return sm(zCowl - 0.05, zCowl + 0.3, z) * (base + dome);
    }
    if (z < zBack - 0.02 && !isBed) return 0.6 * S.crownH * Math.max(0, 1 - (x / (W * 0.93)) ** 2) * sm(zBack - 0.02, zBack - 0.25, z);
    return 0;
  }
  const yBottom = (z) => {
    let y = yb + Math.max(0, z - (ZF - 0.3)) * 0.18 + Math.max(0, (ZR + 0.25) - z) * 0.15;
    for (const cz of [AXF, AXR]) { const dz = z - cz; if (Math.abs(dz) < ARCH) y = Math.max(y, WR + Math.sqrt(ARCH * ARCH - dz * dz)); }
    return y;
  };
  // the side scoop's recess ahead of the back wheel
  const scoopZ = AXR + ARCH + 0.12;
  const scoop = (z) => (sheet.body.sideScoop ? sm(scoopZ, scoopZ + 0.4, z) * (1 - sm(scoopZ + 0.42, scoopZ + 0.47, z)) : 0);
  const ck = { none: 0.2, single: 1, double: 1, 'muscle-hips': 1.2 }[sheet.body.crease];
  const TOP = 13, TOPF = [0.92, 0.8, 0.66, 0.5, 0.33, 0.16, 0];
  function section(z) {
    const w = halfW(z), yb2 = yBottom(z), ys = YS(z), cr = Math.min(S.crease, ys - 0.1), sc = scoop(z);
    const yc = S.clad > 0 ? Math.min(S.clad, cr - 0.05) : lerp(yb2, cr, 0.42);
    const rows = [[0, yb2], [w - 0.12, yb2], [w - 0.045, yb2 + 0.035], [w - 0.012, yb2 + 0.09],
      [w + 0.004 + (S.clad ? 0.006 : 0), yc], [w + 0.002, yc + 0.006], [w + 0.01 - 0.024 * sc, lerp(yc, cr, 0.6)],
      [w + 0.014 * ck, cr - 0.03], [w + 0.02 * ck + 0.002, cr], [w + 0.012 * ck, cr + 0.03],
      [w + 0.004 - tu * 0.25, lerp(cr, ys, 0.55)], [w - tu * 0.6, ys - 0.025], [w - tu * 0.85 - 0.02, ys - 0.005], [w - tu - 0.045, ys]];
    for (let j = 1; j <= TOP; j++) rows[j][1] = Math.max(rows[j][1], rows[j - 1][1] + (j === 1 ? 0 : 0.003));
    const xe = w - tu - 0.045;
    for (let k = 0; k < TOPF.length; k++) { const x = xe * TOPF[k]; rows.push([x, ys + crown(x, z) + 0.004]); }
    rows[TOP][1] += crown(xe, z);
    return rows;
  }
  function sideX(z, y) {
    const r = section(z);
    for (let j = 2; j < TOP; j++) if (y >= r[j][1] && y <= r[j + 1][1]) return lerp(r[j][0], r[j + 1][0], (y - r[j][1]) / Math.max(1e-6, r[j + 1][1] - r[j][1]));
    return y < r[2][1] ? r[2][0] : r[TOP][0];
  }
  const beltX = (z) => halfW(z) - tu - 0.045;
  const topY = (x, z) => YS(z) + crown(x, z);
  const roofMid = (zRoofF + zRoofR) / 2, roofHalf = Math.max(0.3, (zRoofF - zRoofR) / 2);
  const roofY = (z) => S.yRoof - S.roofFall * Math.min(1.4, ((z - roofMid) / roofHalf) ** 2);

  /* -------------------------------------------------------- mesh builders -- */
  function grid(P, faceMat, inside, wrapJ = false) {
    const ni = P.length, nj = P[0].length, pos = [];
    for (const row of P) for (const p of row) pos.push(p[0], p[1], p[2]);
    const at = (i, j) => i * nj + (j % nj);
    const quads = new Map(); let vote = 0;
    const jn = wrapJ ? nj : nj - 1;
    for (let i = 0; i < ni - 1; i++) for (let j = 0; j < jn; j++) {
      const m = faceMat(i, j); if (!m) continue;
      const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1);
      const A = P[i][j], B = P[i + 1][j], D = P[i][(j + 1) % nj];
      const e1 = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], e2 = [D[0] - A[0], D[1] - A[1], D[2] - A[2]];
      const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      vote += Math.sign(n[0] * (A[0] - inside[0]) + n[1] * (A[1] - inside[1]) + n[2] * (A[2] - inside[2]));
      if (!quads.has(m)) quads.set(m, []); quads.get(m).push([a, b, c, d]);
    }
    const flip = vote < 0, out = [];
    if (!quads.size) return out;
    const all = new THREE.Float32BufferAttribute(pos, 3);
    const whole = new THREE.BufferGeometry(); whole.setAttribute('position', all);
    const idxAll = []; for (const qs of quads.values()) for (const [a, b, c, d] of qs) idxAll.push(...(flip ? [a, c, b, a, d, c] : [a, b, c, a, c, d]));
    whole.setIndex(idxAll); whole.computeVertexNormals();
    for (const [m, qs] of quads) {
      const ix = []; for (const [a, b, c, d] of qs) ix.push(...(flip ? [a, c, b, a, d, c] : [a, b, c, a, c, d]));
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', all.clone()); geo.setAttribute('normal', whole.attributes.normal.clone()); geo.setIndex(ix);
      out.push(new THREE.Mesh(geo, m));
    }
    return out;
  }
  const add = (parent, ...ms) => { for (const m of ms.flat()) parent.add(m); return ms; };
  const mesh = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); return m; };
  const rbox = (w, h, d, r, mat, x, y, z) => mesh(new RoundedBoxGeometry(Math.max(w, 0.002), Math.max(h, 0.002), Math.max(d, 0.002), 2, Math.max(0.0005, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3))), mat, x, y, z);
  const cyl = (r0, r1, h, seg, mat, open = false) => new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, seg, 1, open), mat);

  // the plan outline round an end (+1 the nose, -1 the tail) at the bumper line: across the end face, round the corner,
  // back along the side; u is the distance along it from the end's middle
  const endW = (end) => Wz(end > 0 ? ZF - RF : ZR + RR);
  function outline(end, u) {
    const Ze = end > 0 ? ZF : ZR, r = end > 0 ? RF : RR, Wd = endW(end), s0 = Wd - r, arc = r * Math.PI / 2;
    if (u <= s0) return { x: u, z: Ze, nx: 0, nz: end };
    if (u <= s0 + arc) { const a = (u - s0) / r; return { x: s0 + r * Math.sin(a), z: Ze - end * r * (1 - Math.cos(a)), nx: Math.sin(a), nz: end * Math.cos(a) }; }
    return { x: Wd, z: Ze - end * (r + (u - s0 - arc)), nx: 1, nz: 0 };
  }
  const cornerU = (end) => endW(end) - (end > 0 ? RF : RR);
  const arcU = (end) => (end > 0 ? RF : RR) * Math.PI / 2;
  function sweep(end, side, u0, u1, nu, prof, mats) {
    const P = [];
    for (let i = 0; i <= nu; i++) {
      const u = lerp(u0, u1, i / nu), q = outline(end, u);
      P.push(prof(u).map(([off, y]) => [side * (q.x + q.nx * off), y, q.z + q.nz * off]));
    }
    const avgY = P[0].reduce((s, p) => s + p[1], 0) / P[0].length;
    return grid(P, (i, j) => (typeof mats === 'function' ? mats(j) : mats), [0, avgY, (end > 0 ? ZF : ZR) - end * 1.2]);
  }
  // a flat part laid on the nose or tail face at plan distance u (its centre), facing out
  const onEnd = (end, u, off = 0) => { const q = outline(end, u); return { x: q.x + q.nx * off, z: q.z + q.nz * off, ry: Math.atan2(q.nx, q.nz) }; };

  // the body on its springs about a roll centre low between the axles; the wheels stay on the ground
  const ROLLC = yb + 0.1;
  const bodyPivot = new THREE.Group(); bodyPivot.position.y = ROLLC; g.add(bodyPivot);
  const body = new THREE.Group(); body.position.y = -ROLLC; bodyPivot.add(body);

  /* ------------------------------------------------------- the lower body -- */
  const openTop = (z) => (z > zBack + 0.004 && z < zCowl - 0.004) || (isBed && z > ZR + 0.07 && z < zBack - 0.05);
  // dents and dings (a tired car, a beater): a few soft pushes into the side panels
  const dents = [];
  for (let k = 0; k < [0, 0, 2, 4][cond]; k++) dents.push({ side: R() < 0.5 ? 1 : -1, z: lerp(AXR - 0.5, AXF + 0.5, R()), y: lerp(yb + 0.12, S.crease + 0.05, R()), r: 0.12 + 0.12 * R(), d: 0.008 + 0.012 * R() });
  const dentAt = (side, z, y) => { let d = 0; for (const t of dents) if (t.side === side) d += t.d * Math.max(0, 1 - ((z - t.z) ** 2 + (y - t.y) ** 2) / (t.r * t.r)); return d; };
  {
    const zs = [];
    for (let k = 0; k <= 10; k++) zs.push(ZR + RR - RR * Math.cos((k / 10) * Math.PI / 2));
    const zA = ZR + RR, zB = ZF - RF;
    for (let z = zA + 0.04; z < zB - 0.02; z += 0.04) zs.push(z);
    for (let k = 0; k <= 12; k++) zs.push(zB + RF * Math.sin((k / 12) * Math.PI / 2));
    zs.push(zBack, zBack + 0.004, zCowl, zCowl - 0.004, scoopZ, scoopZ + 0.4); if (isBed) zs.push(ZR + 0.07, zBack - 0.05);
    for (const cz of [AXF, AXR]) for (let k = -6; k <= 6; k++) zs.push(cz + ARCH * Math.sin((k / 6) * Math.PI / 2));
    zs.sort((a, b) => a - b);
    const zu = zs.filter((z, i) => z >= ZR - 1e-6 && z <= ZF + 1e-6 && (i === 0 || z - zs[i - 1] > 0.004));
    for (const side of [1, -1]) {
      const P = zu.map((z) => section(z).map(([x, y], j) => [side * (x - (j >= 3 && j <= 11 ? dentAt(side, z, y) : 0)), y, z]));
      const mat = (i, j) => {
        if (j >= TOP && openTop((zu[i] + zu[i + 1]) / 2)) return null;
        if (j <= 4) return S.clad ? M.clad : M.lowerGloss || M.paint;
        if (M.lowerGloss && j <= 7) return M.lowerGloss;
        return M.paint;
      };
      add(body, grid(P, mat, [0, (yb + S.yBelt) / 2, 0]));
    }
    for (const [z, end] of [[zu[zu.length - 1], 1], [zu[0], -1]]) {
      const half = section(z), ring = [...half.map(([x, y]) => [x, y]), ...half.slice(1, -1).reverse().map(([x, y]) => [-x, y])];
      const cy = ring.reduce((s, p) => s + p[1], 0) / ring.length;
      const pos = [], idx = [];
      pos.push(0, cy, z); for (const [x, y] of ring) pos.push(x, y, z);
      for (let k = 0; k < ring.length; k++) { const a = 1 + k, b = 1 + ((k + 1) % ring.length); idx.push(...(end > 0 ? [0, b, a] : [0, a, b])); }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
      const nz = geo.attributes.normal.getZ(0); if (nz * end < 0) { geo.setIndex(idx.map((v, i) => idx[i - (i % 3) + [0, 2, 1][i % 3]])); geo.computeVertexNormals(); }
      body.add(new THREE.Mesh(geo, end > 0 && sheet.face.grille === 'closed-ev' ? M.black : M.paint));
    }
    // a pickup's bed: its floor, inner walls and the tailgate's inside
    if (isBed) {
      const z0 = ZR + 0.07, z1 = zBack - 0.05, yf = Math.max(yb + 0.22, WR + 0.12), yt = YS((z0 + z1) / 2);
      body.add(rbox(2 * (W - 0.07), 0.03, z1 - z0, 0.01, M.under, 0, yf, (z0 + z1) / 2));
      for (const s of [1, -1]) body.add(rbox(0.03, yt - yf, z1 - z0, 0.01, M.under, s * (W - 0.06), (yt + yf) / 2, (z0 + z1) / 2));
      body.add(rbox(2 * (W - 0.07), yt - yf, 0.03, 0.01, M.under, 0, (yt + yf) / 2, z1)); body.add(rbox(2 * (W - 0.07), yt - yf, 0.03, 0.01, M.under, 0, (yt + yf) / 2, z0));
      for (const s of [1, -1]) body.add(rbox(0.07, 0.03, z1 - z0 + 0.06, 0.01, M.black, s * (W - 0.045), yt + 0.012, (z0 + z1) / 2));
    }
  }

  /* -------------------------------------------------------- the glasshouse -- */
  const convDown = S.roof === 'convertible-down';
  const fabricRoof = S.roof === 'convertible-up';
  const GH = [];
  const yRoofAt = convDown ? () => S.yCowl + 0.34 : roofY;
  {
    const P = (bx, bz, rx, rz, nx, nz, mat) => GH.push({ b: [bx, bz], r: [rx, rz], n: [nx, nz], mat });
    const xbF = beltX(zCowl) - 0.01, xr = S.wRoof, rcb = Math.min(0.16, xbF * 0.18), rcr = Math.min(0.11, xr * 0.16);
    const bowB = 0.045 * W, bowR = 0.035 * W;
    const pillarA = S.pillar === 'black' ? 'blackP' : 'paint';
    // the windscreen, its seal, the A pillar's face round the corner onto the side
    for (const u of [0, 0.3, 0.58, 0.8, 0.9]) P(u * (xbF - rcb), zCowl - bowB * u * u, u * (xr - rcr), zRoofF - bowR * u * u, 0.15 * u * u, 1, 'wind');
    P(0.965 * (xbF - rcb), zCowl - bowB * 0.93, 0.965 * (xr - rcr), zRoofF - bowR * 0.93, 0.15, 1, 'seal');
    P(xbF - rcb, zCowl - bowB, xr - rcr, zRoofF - bowR, 0.2, 1, pillarA);
    for (const a of [Math.PI / 4]) P(xbF - rcb + rcb * Math.sin(a), zCowl - bowB - rcb * (1 - Math.cos(a)), xr - rcr + rcr * Math.sin(a), zRoofF - bowR - rcr * (1 - Math.cos(a)), Math.sin(a), Math.cos(a), pillarA);
    const sb0 = zCowl - bowB - rcb, sr0 = zRoofF - bowR - rcr;
    if (!convDown) {
      const xbR = beltX(zBack + 0.1) - 0.01, rcbR = Math.min(S.rear === 'box' || S.rear === 'wagon' || S.rear === 'hatch' ? 0.07 : 0.14, xbR * 0.2), rcrR = Math.min(0.1, xr * 0.15);
      const bowBR = ['box', 'wagon'].includes(S.rear) ? 0.01 : 0.04 * W, bowRR = ['box', 'wagon'].includes(S.rear) ? 0.008 : 0.03 * W;
      const sb1 = zBack + bowBR + rcbR, sr1 = zRoofR + bowRR + rcrR;
      const side = (f, mat) => { const bz = lerp(sb0, sb1, f), rz = lerp(sr0, sr1, f); P(beltX(bz) - 0.012, bz, xr, rz, 1, 0, mat); };
      side(0, pillarA);
      const sealF = 0.014 / Math.max(0.5, sb0 - sb1);
      S.win.forEach(([f0, f1, glass], k) => {
        side(f0 - sealF, 'seal'); side(f0, glass); side(f1, 'seal');
        side(f1 + sealF, k < S.win.length - 1 ? 'blackP' : 'paint');
      });
      side(1, 'paint');
      // round the back corner
      const a = Math.PI / 4;
      P(xbR - rcbR + rcbR * Math.cos(a), sb1 - rcbR * Math.sin(a), xr - rcrR + rcrR * Math.cos(a), sr1 - rcrR * Math.sin(a), Math.cos(a), -Math.sin(a), 'paint');
      // the back: the back glass (a van's two door windows and the seam between them), to the middle
      const bk = (u, mat) => P(u * (xbR - rcbR), zBack + bowBR * u * u, u * (xr - rcrR), zRoofR + bowRR * u * u, 0, -1, mat);
      if (S.rear === 'box') { bk(1, 'paint'); bk(0.84, 'seal'); bk(0.82, 'back'); bk(0.5, 'back'); bk(0.12, 'seal'); bk(0.1, 'paint'); bk(0.012, 'blackP'); bk(0, 'blackP'); }
      else if (isBed) { bk(1, 'paint'); bk(0.8, 'seal'); bk(0.78, 'back'); bk(0.4, 'back'); bk(0, 'back'); }
      else { bk(1, 'paint'); bk(0.94, 'seal'); bk(0.92, 'back'); bk(0.6, 'back'); bk(0.3, 'back'); bk(0, 'back'); }
    }
  }
  const glassOf = { wind: M.glassF, front: M.glassF, rear: M.glassR, back: M.glassR };
  const tTop = S.glassTop ? clamp((S.glassTop - S.yBelt) / (S.yRoof - S.yBelt), 0.3, 0.88) : 0.88;
  const TS = [...new Set([0, 0.03, 0.06, 0.2, 0.4, 0.6, 0.8, tTop, Math.min(0.93, tTop + 0.035), 0.88, 0.92, 0.96, 1].map((t) => +t.toFixed(3)))].sort((a, b) => a - b);
  function ghPoint(p, t, inset = 0) {
    const yb0 = topY(p.b[0], p.b[1]) + 0.003, yr = yRoofAt(p.r[1]);
    const bow = (p.n[1] > 0.5 ? 0.012 : p.n[1] < -0.5 ? 0.008 : 0.022) * Math.sin(Math.PI * t);
    return [lerp(p.b[0], p.r[0], t) + p.n[0] * (bow - inset), lerp(yb0, yr, t) - (t > 0.99 ? inset : 0), lerp(p.b[1], p.r[1], t) + p.n[1] * (bow - inset)];
  }
  const roofMat = fabricRoof ? M.fabric : sheet.paint.split === 'roof' && M.second ? M.second : M.paint;
  const pillarPaint = sheet.paint.split === 'roof' && M.second ? M.second : M.paint;
  const sealMat = trimChrome ? M.trim : M.black;
  // (the strip's material, row i, ring point j)
  const ghMat = (s, t, last) => {
    if (last || t >= Math.max(0.92, tTop + 0.035)) return roofMat;
    if (s === 'paint') return t < 0.06 ? M.paint : fabricRoof ? M.fabric : pillarPaint;
    if (s === 'blackP') return M.black;
    if (s === 'seal') return sealMat;
    if (t < 0.06 || t >= tTop) return t >= tTop + 0.035 ? (fabricRoof ? M.fabric : pillarPaint) : sealMat;
    return glassOf[s];
  };
  if (convDown) {
    // only the windscreen's frame: right corner to left corner (the strip after point j takes the right half's material)
    const mir = (p) => ({ ...p, b: [-p.b[0], p.b[1]], r: [-p.r[0], p.r[1]], n: [-p.n[0], p.n[1]] }), n = GH.length;
    const pts = [...GH.slice(1).reverse().map(mir), ...GH];
    const matOf = (j) => (j < n - 1 ? GH[n - 2 - j].mat : GH[j - n + 1].mat);
    const rows = TS.map((t) => pts.map((p) => ghPoint(p, t)));
    add(body, grid(rows, (i, j) => (matOf(j) === 'wind' && TS[i] >= 0.06 && TS[i] < 0.88 ? M.glassF : M.black), [0, S.yCowl, zCowl - 1.5]));
  } else {
    const RING = [...GH, ...GH.slice(1, -1).reverse().map((p) => ({ b: [-p.b[0], p.b[1]], r: [-p.r[0], p.r[1]], n: [-p.n[0], p.n[1]], mat: null }))];
    for (let k = GH.length; k < RING.length; k++) { const m = 2 * GH.length - 2 - k; RING[k].mat = GH[m - 1].mat; }
    RING[GH.length - 1].mat = GH[GH.length - 2].mat;
    const rows = TS.map((t) => RING.map((p) => ghPoint(p, t)));
    rows.push(RING.map((p) => { const q = ghPoint(p, 1); return [q[0] - p.n[0] * 0.02, q[1] + 0.012, q[2] - p.n[1] * 0.02]; }));
    rows.push(RING.map((p) => { const q = ghPoint(p, 1); return [q[0] - p.n[0] * 0.055, q[1] + 0.023, q[2] - p.n[1] * 0.055]; }));
    add(body, grid(rows, (i, j) => ghMat(RING[j].mat, TS[i] ?? 1, i >= TS.length - 1), [0, (S.yBelt + S.yRoof) / 2, roofMid], true));
    // the roof: a fan in from its rolled edge to a gentle crown, following the roof's own fall
    const edge = rows[rows.length - 1], zc = roofMid, roof = [];
    for (const s of [1, 0.8, 0.6, 0.4, 0.2, 0.0]) roof.push(edge.map(([x, y, z]) => { const zz = zc + (z - zc) * (0.55 + 0.45 * s); return [x * s, y + (roofY(zz) - roofY(z)) + 0.02 * (1 - s * s), zz]; }));
    add(body, grid(roof, () => roofMat, [0, 0, zc], true));
    // the headliner and the pillars' trim from inside
    const lin = TS.map((t) => RING.map((p) => ghPoint(p, t, 0.028)));
    const linMat = (i, j) => { const s = RING[j].mat, t = TS[i]; return glassOf[s] && t >= 0.06 && t < tTop ? null : M.interior; };
    add(body, grid(lin, linMat, [0, (S.yBelt + S.yRoof) / 2, roofMid], true).map((m) => { m.material = M.interior; return m; }));
    const roofIn = new THREE.Mesh(new THREE.PlaneGeometry(2 * S.wRoof - 0.1, Math.max(0.3, zRoofF - zRoofR - 0.1)), M.interior); roofIn.rotation.x = -Math.PI / 2; roofIn.position.set(0, S.yRoof - 0.03, roofMid); body.add(roofIn);
    if (S.roof === 'sunroof') { const sr = rbox(Math.min(0.85, S.wRoof * 1.2), 0.012, 0.75, 0.04, M.glassR, 0, roofY(zRoofF - 0.55) + 0.024, zRoofF - 0.55); body.add(sr); }
  }

  /* --------------------------------------------- arches, under, the exhausts -- */
  for (const cz of [AXF, AXR]) for (const side of [1, -1]) {
    const lip = S.clad || S.flare > 0.012;
    const prof = lip ? [[-0.012, -0.005], [0.02 + S.flare, 0.0], [0.03 + S.flare, 0.028], [0.022 + S.flare * 0.6, 0.06], [-0.004, 0.07]] : [[0.004, -0.004], [0.012, 0.004], [0.006, 0.02], [-0.02, 0.026]];
    const P = [];
    const a0 = 0.1, a1 = Math.PI - a0;
    for (let k = 0; k <= 28; k++) {
      const a = lerp(a0, a1, k / 28), c = Math.cos(a), s = Math.sin(a), zz = cz + ARCH * c;
      const bx = sideX(zz, WR + ARCH * s) - 0.004;
      P.push(prof.map(([dx, dr]) => [side * (bx + dx), WR + (ARCH + dr) * s, cz + (ARCH + dr) * c]));
    }
    add(body, grid(P, () => (S.clad ? M.clad : lip ? M.black : M.lowerGloss || M.paint), [0, WR, cz]));
    const liner = new THREE.Mesh(new THREE.CylinderGeometry(ARCH - 0.008, ARCH - 0.008, 0.42, 24, 1, true, Math.PI / 2 - 1.45, 2.9), M.under);
    liner.rotation.z = Math.PI / 2; liner.position.set(side * (W - 0.23), WR, cz); body.add(liner);
    const cap = new THREE.Mesh(new THREE.CircleGeometry(ARCH - 0.008, 24, 0, Math.PI), M.under);
    cap.rotation.y = Math.PI / 2; cap.position.set(side * (W - 0.44), WR, cz); body.add(cap);
  }
  body.add(rbox(2 * W - 0.4, 0.14, AXF - AXR + 0.6, 0.04, M.under, 0, yb + 0.05, (AXF + AXR) / 2));
  body.add(rbox(0.4, 0.2, 0.3, 0.08, M.under, 0, Math.max(0.25, WR - 0.06), AXR));
  {
    const ex = sheet.tail.exhaust, n = { none: 0, single: 1, twin: 2, quad: 4 }[ex];
    const xs = n === 1 ? [-0.52] : n === 2 ? [-0.55, 0.55] : n === 4 ? [-0.62, -0.47, 0.47, 0.62] : [];
    const r = n === 4 ? 0.038 : n === 2 ? 0.045 : 0.036, y = yb + 0.03 + (n === 1 ? -0.02 : 0);
    for (const x of xs) {
      const tip = cyl(r, r, 0.16, 18, M.chrome, true); tip.rotation.x = Math.PI / 2; tip.position.set(x * W / 0.9, Math.max(0.22, y), ZR - 0.035); body.add(tip);
      const hole = new THREE.Mesh(new THREE.CircleGeometry(r * 0.92, 18), M.under); hole.rotation.y = Math.PI; hole.position.set(x * W / 0.9, Math.max(0.22, y), ZR - 0.11); body.add(hole);
    }
  }

  /* --------------------------------------------------------------- bumpers -- */
  const bumpH = clamp((YS(ZF) - yb) * (CLASSES[sheet.class].bumpF || 0.42), 0.16, 0.4);
  const yBumpF = yb + bumpH, yBumpR = yb + clamp((YS(ZR) - yb) * 0.42, 0.18, 0.36);
  {
    const kind = sheet.face.bumper;
    const fu1 = cornerU(1) + arcU(1) + 0.18, ru1 = cornerU(-1) + arcU(-1) + 0.26;
    const y0 = yb + 0.02;
    for (const side of [1, -1]) {
      if ((kind === 'body' || kind === 'bull-bar') && era >= 2005 && !S.clad) {
        // a modern bumper: flush with the face, body colour nearly to the ground, a thin black lip under it
        const up = sheet.class === 'supercar' ? M.lowerGloss || M.black : M.paint;
        add(body, sweep(1, side, 0, fu1, 30, () => [[-0.03, y0 - 0.02], [0.01, y0 - 0.016], [0.022, y0 + 0.012]], M.bumperPl));
        add(body, sweep(1, side, 0, fu1, 30, () => [[0.022, y0 + 0.012], [0.03, lerp(y0, yBumpF, 0.4)], [0.03, lerp(y0, yBumpF, 0.85)], [0.018, yBumpF + 0.02], [-0.01, yBumpF + 0.035]], up));
        add(body, sweep(-1, side, 0, ru1, 26, () => [[-0.03, y0], [0.012, y0 + 0.004], [0.028, y0 + 0.03]], M.bumperPl));
        add(body, sweep(-1, side, 0, ru1, 26, () => [[0.028, y0 + 0.03], [0.036, lerp(y0, yBumpR, 0.5)], [0.034, yBumpR - 0.01], [0.016, yBumpR + 0.02], [-0.01, yBumpR + 0.03]], up));
      } else if (kind === 'body' || kind === 'bull-bar') {
        add(body, sweep(1, side, 0, fu1, 30, () => [[-0.03, y0 - 0.02], [0.022, y0 - 0.015], [0.045, y0 + 0.03], [0.054, lerp(y0, yBumpF, 0.45)]], S.clad ? M.clad : M.bumperPl));
        add(body, sweep(1, side, 0, fu1, 30, () => [[0.054, lerp(y0, yBumpF, 0.45)], [0.056, lerp(y0, yBumpF, 0.8)], [0.046, yBumpF], [0.024, yBumpF + 0.03], [-0.01, yBumpF + 0.04]], M.paint));
        add(body, sweep(-1, side, 0, ru1, 26, () => [[-0.03, y0], [0.03, y0 + 0.005], [0.062, y0 + 0.05], [0.07, lerp(y0, yBumpR, 0.5)]], S.clad ? M.clad : M.bumperPl));
        add(body, sweep(-1, side, 0, ru1, 26, () => [[0.07, lerp(y0, yBumpR, 0.5)], [0.068, yBumpR - 0.02], [0.05, yBumpR + 0.02], [0.0, yBumpR + 0.035]], M.paint));
      } else if (kind === 'black-plastic') {
        add(body, sweep(1, side, 0, fu1, 30, () => [[-0.03, y0 - 0.02], [0.03, y0 - 0.01], [0.062, y0 + 0.05], [0.07, lerp(y0, yBumpF, 0.6)], [0.066, yBumpF], [0.03, yBumpF + 0.025], [-0.01, yBumpF + 0.03]], M.bumperPl));
        add(body, sweep(-1, side, 0, ru1, 26, () => [[-0.03, y0], [0.035, y0 + 0.005], [0.075, y0 + 0.06], [0.08, yBumpR - 0.02], [0.06, yBumpR + 0.02], [0.0, yBumpR + 0.03]], M.bumperPl));
      } else {
        // chrome blades over a dark valance
        add(body, sweep(1, side, 0, fu1, 30, () => [[-0.03, y0 - 0.02], [0.02, y0 - 0.01], [0.035, lerp(y0, yBumpF, 0.4)]], M.bumperPl));
        add(body, sweep(1, side, 0, fu1, 30, () => [[0.035, lerp(y0, yBumpF, 0.4)], [0.085, lerp(y0, yBumpF, 0.5)], [0.1, lerp(y0, yBumpF, 0.75)], [0.085, yBumpF], [0.0, yBumpF + 0.02]], M.chrome));
        add(body, sweep(-1, side, 0, ru1, 26, () => [[-0.03, y0], [0.03, y0 + 0.005], [0.04, lerp(y0, yBumpR, 0.35)]], M.bumperPl));
        add(body, sweep(-1, side, 0, ru1, 26, () => [[0.04, lerp(y0, yBumpR, 0.35)], [0.095, lerp(y0, yBumpR, 0.5)], [0.105, lerp(y0, yBumpR, 0.8)], [0.08, yBumpR], [0.0, yBumpR + 0.02]], M.chrome));
      }
      // a rub strip round the corners (era < 2000, or a chrome-trim car)
      if (era < 2000 && kind !== 'chrome-blade') add(body, sweep(1, side, 0.3, fu1, 20, () => [[0.058, lerp(y0, yBumpF, 0.6)], [0.07, lerp(y0, yBumpF, 0.68)], [0.058, lerp(y0, yBumpF, 0.76)]], M.rubberTrim));
    }
    if (kind === 'bull-bar') {
      const zb = ZF + 0.13, hb = yBumpF + 0.22;
      for (const x of [-0.32, 0.32]) { const up = cyl(0.028, 0.028, hb - yb, 12, M.black); up.position.set(x, (hb + yb) / 2 + 0.02, zb); body.add(up); }
      const bar = cyl(0.03, 0.03, 0.9, 12, M.black); bar.rotation.z = Math.PI / 2; bar.position.set(0, hb, zb); body.add(bar);
      const low = cyl(0.03, 0.03, 1.1, 12, M.black); low.rotation.z = Math.PI / 2; low.position.set(0, yb + 0.14, zb - 0.02); body.add(low);
      body.add(rbox(0.7, 0.05, 0.14, 0.02, M.black, 0, yb + 0.14, ZF + 0.07));
    }
    // the chin: a lower intake (and a lip)
    if (sheet.face.grille !== 'closed-ev' || sheet.class !== 'supercar') body.add(rbox(Math.min(1.0, W * 0.95), Math.max(0.04, bumpH * 0.28), 0.04, 0.015, M.black, 0, yb + bumpH * 0.33, ZF + 0.048));
    if (sheet.body.aero === 'lip' || sheet.class === 'muscle' || sheet.class === 'supercar') body.add(rbox(2 * W - 0.25, 0.022, 0.12, 0.008, M.black, 0, yb + 0.005, ZF - 0.01));
  }

  /* ------------------------------------------------------------- the plates -- */
  function textMat(draw, w = 512, h = 256, extra = {}) {
    if (typeof document === 'undefined') return std({ color: '#DADAD4', roughness: 0.5 });
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    draw(cv.getContext('2d'), w, h);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    return std({ map: tex, roughness: 0.45, metalness: 0.1, ...extra });
  }
  {
    const plateText = sheet.plate || (sheet.id.replace(/[^a-z0-9]/gi, '').toUpperCase().slice(-3) + String(100 + Math.floor(R() * 899))).slice(0, 7);
    const pm = textMat((cx, w, h) => {
      cx.fillStyle = '#F4F4F0'; cx.fillRect(0, 0, w, h);
      cx.strokeStyle = '#3A3D44'; cx.lineWidth = 8; cx.strokeRect(10, 10, w - 20, h - 20);
      cx.fillStyle = '#1B2A5C'; cx.font = "700 132px 'Arial Narrow', 'Barlow Condensed', system-ui, sans-serif"; cx.textAlign = 'center'; cx.textBaseline = 'middle';
      cx.fillText(plateText, w / 2, h / 2 + 8, w - 50);
      if (cond >= 2) { cx.fillStyle = 'rgba(80,60,40,0.25)'; for (let k = 0; k < 40; k++) cx.fillRect(R() * w, R() * h, 6 + R() * 30, 3 + R() * 8); }
    });
    const fy = yb + bumpH * 0.62, fz = ZF + 0.075;
    body.add(rbox(0.32, 0.165, 0.02, 0.006, M.black, 0, fy, fz - 0.01));
    const fp = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.15), pm); fp.position.set(0, fy, fz + 0.001); body.add(fp);
    const ry = sheet.tail.plate === 'bumper' ? yb + 0.13 : clamp(yBumpR + 0.16, yb + 0.25, YS(ZR) - 0.16);
    const rz = sheet.tail.plate === 'bumper' ? ZR - 0.085 : ZR - 0.004;
    body.add(rbox(0.36, 0.2, 0.02, 0.01, M.black, 0, ry, rz + 0.002));
    const rp = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.15), pm); rp.rotation.y = Math.PI; rp.position.set(0, ry, rz - 0.01); body.add(rp);
    S.plateY = ry;
  }

  /* ---------------------------------------------- the grille and the lamps -- */
  const zf = ZF, noseTop = YS(ZF);
  const lamp = sheet.face.lamps;
  const faceH = noseTop - yBumpF;
  const lampH = { 'round-pair': 0.17, 'quad-round': 0.14, square: clamp(0.62 * faceH, 0.12, 0.22), wraparound: 0.2, 'slim-led': 0.045, 'projector-pair': 0.1 }[lamp];
  const lampTop = noseTop - (lamp === 'slim-led' ? 0.03 : 0.035), lampBot = Math.max(yBumpF + 0.035, lampTop - lampH), lampY = (lampTop + lampBot) / 2;
  // (flat housings: square, round, quad round, from just inside the nose's corner inward; swept ones from mid-face round the corner)
  const flatLamp = ['square', 'round-pair', 'quad-round'].includes(lamp);
  const lampW = { square: clamp(W * 0.36, 0.26, 0.38), 'round-pair': 0.2, 'quad-round': 0.31 }[lamp] || 0;
  const xFlatOut = endW(1) - RF * 0.3;
  const xLampIn = flatLamp ? xFlatOut - lampW : W * (lamp === 'projector-pair' ? 0.47 : 0.5), xLampOut = cornerU(1) + arcU(1) * 0.8;
  S.lampPos = [W * 0.62, lampY, ZF + 0.06];
  {
    // the grille, between the lamps
    const gk = 1 + 0.25 * sheet.face.grilleSize;
    const gw = Math.min(W * 0.95, lamp === 'slim-led' ? W * 0.42 * gk : (xLampIn - (flatLamp ? 0.025 : 0.04)) * Math.min(gk, 1.1)), gb = yBumpF + 0.025, gt = Math.min(noseTop - 0.025, lamp === 'slim-led' ? noseTop - 0.07 : lampTop + 0.005);
    const gh = gt - gb, gc = (gt + gb) / 2, gz = zf + 0.004;
    const surround = trimChrome || sheet.class === 'suv' || sheet.class === 'pickup' ? M.chrome : M.black;
    const backing = () => body.add(rbox(2 * gw, gh, 0.03, 0.02, M.black, 0, gc, gz));
    const frame = () => {
      const path = new THREE.Shape(), r = Math.min(0.05, gh * 0.3);
      path.moveTo(-gw + r, gb); path.lineTo(gw - r, gb); path.quadraticCurveTo(gw, gb, gw, gb + r); path.lineTo(gw, gt - r); path.quadraticCurveTo(gw, gt, gw - r, gt);
      path.lineTo(-gw + r, gt); path.quadraticCurveTo(-gw, gt, -gw, gt - r); path.lineTo(-gw, gb + r); path.quadraticCurveTo(-gw, gb, -gw + r, gb);
      const pts = path.getSpacedPoints(80).map((p) => V3(p.x, p.y, zf + 0.026));
      body.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 160, 0.016, 8, true), surround));
    };
    const g = sheet.face.grille;
    if (g === 'horizontal-bars') {
      backing(); frame();
      const n = gh > 0.25 ? 2 : 3;
      for (let k = 0; k < n; k++) body.add(rbox(2 * gw - 0.03, Math.min(0.05, gh / (n * 2.5)), 0.035, 0.012, surround, 0, lerp(gb, gt, (k + 1) / (n + 1)), zf + 0.026));
    } else if (g === 'mesh' || g === 'egg-crate') {
      backing(); frame();
      const t = g === 'mesh' ? 0.008 : 0.018, nx = g === 'mesh' ? 22 : 9, ny = g === 'mesh' ? 7 : 3, mat = g === 'egg-crate' ? M.chrome : M.trim === M.black ? M.bumperPl : M.bumperPl;
      for (let k = 1; k < nx; k++) body.add(rbox(t, gh - 0.02, 0.025, 0.003, mat, lerp(-gw, gw, k / nx), gc, zf + 0.02));
      for (let k = 1; k < ny; k++) body.add(rbox(2 * gw - 0.02, t, 0.025, 0.003, mat, 0, lerp(gb, gt, k / ny), zf + 0.02));
    } else if (g === 'honeycomb') {
      backing(); frame();
      const hx = [], r = 0.028;
      for (let row = 0, y = gb + r * 1.1; y < gt - r * 0.8; y += r * 1.62, row++) for (let x = -gw + r * 1.1 + (row % 2) * r * 0.93; x < gw - r * 0.9; x += r * 1.86) {
        hx.push(new THREE.TorusGeometry(r * 0.88, 0.006, 3, 6).rotateZ(Math.PI / 6).translate(x, y, zf + 0.02));
      }
      if (hx.length) body.add(new THREE.Mesh(mergeGeometries(hx), M.bumperPl));
    } else if (g === 'slot') {
      body.add(rbox(2 * gw * 0.9, 0.05, 0.03, 0.02, M.black, 0, lampY, gz));
      body.add(rbox(2 * gw * 0.9, 0.01, 0.012, 0.004, surround, 0, lampY + 0.03, zf + 0.022));
    } else if (g === 'closed-ev') {
      body.add(rbox(2 * gw, Math.max(0.05, gh * 0.6), 0.02, 0.02, sheet.class === 'supercar' ? M.black : M.paint, 0, gc, zf + 0.01));
    }
    if (sheet.class === 'suv' || sheet.class === 'pickup') { body.add(rbox(0.16, 0.05, 0.02, 0.01, M.bumperPl, 0, gc, zf + 0.04)); }

    // the lamps
    for (const side of [1, -1]) {
      if (lamp === 'wraparound' || lamp === 'projector-pair') {
        const u0 = xLampIn, u1 = xLampOut;
        const yLo = (u) => lerp(lampBot, lampBot - (lamp === 'wraparound' ? 0.045 : 0.0), Math.min(1, (u - u0) / 0.18)), yHi = (u) => lerp(lampTop, lampTop - (lamp === 'projector-pair' ? 0.03 : 0.01), (u - u0) / (u1 - u0));
        add(body, sweep(1, side, u0 - 0.012, u1 + 0.012, 20, (u) => [[0.0, yLo(u) - 0.012], [0.004, yLo(u) - 0.01], [0.004, yHi(u) + 0.01], [0.0, yHi(u) + 0.012]], M.black));
        add(body, sweep(1, side, u0, u1, 20, (u) => [[0.005, yLo(u)], [0.008, lerp(yLo(u), yHi(u), 0.5)], [0.005, yHi(u)]], M.reflector));
        add(body, sweep(1, side, u0, u1, 20, (u) => [[0.006, yLo(u)], [0.018, yLo(u) + 0.015], [0.024, lerp(yLo(u), yHi(u), 0.5)], [0.018, yHi(u) - 0.015], [0.006, yHi(u)]], M.lens));
        const us = lamp === 'wraparound' ? [[u0 + 0.075, 0.05], [u0 + 0.215, 0.045]] : [[u0 + 0.07, 0.035]];
        for (const [u, r] of us) {
          const q = outline(1, u);
          const bowl = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.reflector); bowl.rotation.x = -Math.PI / 2; bowl.scale.z = 0.35;
          bowl.position.set(side * q.x, lampY, q.z + 0.006); body.add(bowl);
          const b = new THREE.Mesh(new THREE.SphereGeometry(lamp === 'projector-pair' ? r * 0.75 : 0.018, 14, 8), lamp === 'projector-pair' ? M.lens : M.bulb); b.position.set(side * q.x, lampY, q.z + 0.012); body.add(b);
          const disc = new THREE.Mesh(new THREE.CircleGeometry(r * 0.8, 20), M.bulb); disc.position.set(side * q.x, lampY, q.z + 0.009); body.add(disc);
        }
        if (lamp === 'projector-pair') add(body, sweep(1, side, u0 + 0.02, u1 - 0.02, 16, (u) => [[0.02, yLo(u) + 0.008], [0.022, yLo(u) + 0.018]], M.drl));
        add(body, sweep(1, side, cornerU(1) + arcU(1) * 0.5, u1 - 0.004, 6, () => [[0.012, lampBot + 0.005], [0.014, lampBot + 0.035]], M.amber));
      } else if (lamp === 'slim-led') {
        const u0 = sheet.class === 'supercar' ? 0.0 : W * 0.35, u1 = xLampOut;
        add(body, sweep(1, side, u0, u1, 24, () => [[0.0, lampY - 0.03], [0.006, lampY - 0.028], [0.006, lampY + 0.028], [0.0, lampY + 0.03]], M.black));
        add(body, sweep(1, side, u0, u1, 24, () => [[0.008, lampY - 0.007], [0.011, lampY + 0.007]], M.drl));
        const q = outline(1, (u0 + u1) * 0.55 + 0.1); const pr = new THREE.Mesh(new THREE.CircleGeometry(0.022, 16), M.bulb); pr.position.set(side * q.x, lampY - 0.016, q.z + 0.009); body.add(pr);
        S.lampPos = [W * 0.55, lampY, ZF + 0.04];
      } else {
        // housings on the face: square (two round reflectors in each), round, quad round
        const quad = lamp === 'quad-round', round = lamp === 'round-pair' || quad;
        const hw = lampW, x = side * (xFlatOut - hw / 2), q = onEnd(1, Math.abs(x));
        if (round) {
          const rr = quad ? 0.058 : 0.075;
          for (const dx of quad ? [-0.068, 0.068] : [0]) {
            const xx = x + side * dx, qq = onEnd(1, Math.abs(xx));
            const bez = new THREE.Mesh(new THREE.TorusGeometry(rr + 0.008, 0.01, 8, 28), trimChrome || era < 1990 ? M.chrome : M.black); bez.position.set(xx, lampY, qq.z + 0.02); body.add(bez);
            const bowl = new THREE.Mesh(new THREE.SphereGeometry(rr, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.reflector); bowl.rotation.x = -Math.PI / 2; bowl.scale.z = 0.35; bowl.position.set(xx, lampY, qq.z + 0.006); body.add(bowl);
            const lens = new THREE.Mesh(new THREE.SphereGeometry(rr, 20, 8, 0, Math.PI * 2, 0, 0.6), M.lens); lens.rotation.x = Math.PI / 2; lens.scale.y = 0.35; lens.position.set(xx, lampY, qq.z + 0.004); body.add(lens);
            const bulb = new THREE.Mesh(new THREE.CircleGeometry(rr * 0.55, 18), M.bulb); bulb.position.set(xx, lampY, qq.z + 0.012); body.add(bulb);
          }
        } else {
          const hh = lampTop - lampBot;
          const hz = q.z + 0.005;
          const hs = rbox(hw, hh, 0.04, 0.012, M.black, x, lampY, hz); hs.rotation.y = side * Math.min(0.25, Math.atan2(q.ry, 6)); body.add(hs);
          body.add(rbox(hw - 0.016, hh - 0.016, 0.01, 0.006, M.reflector, x, lampY, hz + 0.02));
          for (const dx of [-hw * 0.22, hw * 0.22]) {
            const xx = x + dx, bowl = new THREE.Mesh(new THREE.SphereGeometry(Math.min(0.05, hh * 0.38), 18, 9, 0, Math.PI * 2, 0, Math.PI / 2), M.reflector);
            bowl.rotation.x = -Math.PI / 2; bowl.scale.z = 0.4; bowl.position.set(xx, lampY, hz + 0.024); body.add(bowl);
            const bl = new THREE.Mesh(new THREE.CircleGeometry(Math.min(0.03, hh * 0.22), 16), M.bulb); bl.position.set(xx, lampY, hz + 0.027); body.add(bl);
          }
          body.add(rbox(hw - 0.008, hh - 0.008, 0.012, 0.006, M.lens, x, lampY, hz + 0.032));
          // the amber corner lamp round the side
          const sm2 = outline(1, cornerU(1) + arcU(1) * 0.7), mk = rbox(0.012, hh * 0.6, 0.1, 0.004, M.amber, side * (sm2.x + sm2.nx * 0.004), lampY, sm2.z + sm2.nz * 0.004);
          mk.rotation.y = side * Math.atan2(sm2.nx, sm2.nz) - side * Math.PI / 2; body.add(mk);
        }
        S.lampPos = [Math.abs(x), lampY, ZF + 0.06];
      }
      if (sheet.face.fog) {
        const fx = side * Math.min(W * 0.72, xLampOut - 0.08), fq = onEnd(1, Math.abs(fx)), fy = yb + bumpH * 0.45;
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.01, 8, 24), M.chrome); ring.position.set(fx, fy, fq.z + 0.062); body.add(ring);
        const fl = new THREE.Mesh(new THREE.CircleGeometry(0.043, 24), M.bulb); fl.position.set(fx, fy, fq.z + 0.061); body.add(fl);
      }
    }

    // the tail lamps
    const tl = sheet.tail.lamps, tailTop = YS(ZR) - 0.04;
    const tu0 = cornerU(-1) - 0.14, tu1 = cornerU(-1) + arcU(-1) + 0.05;
    const yTL0 = Math.max(yBumpR + 0.04, tailTop - (S.rear === 'box' || S.rear === 'wagon' && S.cls !== 'wagon' || S.cls === 'suv' ? 0.5 : 0.17));
    for (const side of [1, -1]) {
      if (tl === 'vertical') {
        const top = S.rear === 'box' || ['suv', 'van', 'minivan', 'crossover'].includes(S.cls) ? Math.min(tailTop + 0.02, yTL0 + 0.55) : tailTop;
        const bot = Math.max(yBumpR + 0.05, top - (S.rear === 'box' ? 0.55 : 0.45));
        add(body, sweep(-1, side, tu0 - 0.012, tu1 + 0.01, 14, () => [[0.0, bot - 0.012], [0.006, bot - 0.008], [0.006, top + 0.008], [0.0, top + 0.012]], M.black));
        add(body, sweep(-1, side, tu0, tu1, 14, () => [[0.007, lerp(bot, top, 0.48)], [0.016, lerp(bot, top, 0.55)], [0.018, lerp(bot, top, 0.8)], [0.007, top]], M.tail));
        add(body, sweep(-1, side, tu0, tu1, 14, () => [[0.007, lerp(bot, top, 0.3)], [0.016, lerp(bot, top, 0.32)], [0.016, lerp(bot, top, 0.46)], [0.007, lerp(bot, top, 0.48)]], M.reverse));
        add(body, sweep(-1, side, tu0, tu1, 14, () => [[0.007, bot], [0.016, bot + 0.01], [0.016, lerp(bot, top, 0.28)], [0.007, lerp(bot, top, 0.3)]], M.amber));
      } else if (tl === 'wrap') {
        const top = tailTop, bot = Math.max(yBumpR + 0.05, top - 0.15), uu0 = W * 0.42;
        add(body, sweep(-1, side, uu0 - 0.012, tu1 + 0.03, 18, () => [[0.0, bot - 0.012], [0.006, bot - 0.008], [0.006, top + 0.008], [0.0, top + 0.012]], M.black));
        add(body, sweep(-1, side, uu0, tu1 + 0.02, 18, () => [[0.007, lerp(bot, top, 0.35)], [0.016, lerp(bot, top, 0.45)], [0.018, lerp(bot, top, 0.8)], [0.007, top]], M.tail));
        add(body, sweep(-1, side, uu0, uu0 + 0.14, 6, () => [[0.007, bot], [0.016, bot + 0.01], [0.016, lerp(bot, top, 0.33)], [0.007, lerp(bot, top, 0.35)]], M.reverse));
        add(body, sweep(-1, side, uu0 + 0.14, tu1 + 0.02, 12, () => [[0.007, bot], [0.016, bot + 0.01], [0.016, lerp(bot, top, 0.33)], [0.007, lerp(bot, top, 0.35)]], M.amber));
      } else if (tl === 'round') {
        for (const dx of [0.0, 0.17]) {
          const u = cornerU(-1) - 0.1 - dx, q = onEnd(-1, u), y = tailTop - 0.09;
          const rim = new THREE.Mesh(new THREE.TorusGeometry(0.068, 0.01, 8, 24), M.chrome); rim.position.set(side * q.x, y, q.z - 0.01); body.add(rim);
          const disc = new THREE.Mesh(new THREE.CircleGeometry(0.066, 24), dx ? M.reverse : M.tail); disc.rotation.y = Math.PI; disc.position.set(side * q.x, y, q.z - 0.008); body.add(disc);
        }
      } else if (tl === 'bars') {
        const top = tailTop, bot = Math.max(yBumpR + 0.05, top - 0.17), u0 = W * 0.3, u1 = cornerU(-1) + arcU(-1) * 0.4;
        add(body, sweep(-1, side, u0, u1, 16, () => [[0.0, bot - 0.012], [0.008, bot - 0.008], [0.008, top + 0.008], [0.0, top + 0.012]], M.black));
        for (let k = 0; k < 3; k++) {
          const a = lerp(u0 + 0.02, u1 - 0.02, k / 3) + 0.01, b = lerp(u0 + 0.02, u1 - 0.02, (k + 1) / 3) - 0.01;
          add(body, sweep(-1, side, a, b, 4, () => [[0.009, bot + 0.008], [0.016, bot + 0.02], [0.016, top - 0.02], [0.009, top - 0.008]], M.tail));
        }
        add(body, sweep(-1, side, u0 - 0.01, u0 + 0.0, 2, () => [[0.01, bot + 0.01], [0.012, top - 0.01]], M.reverse));
      }
    }
    if (tl === 'full-width') {
      const top = tailTop, y = top - 0.03, uw = cornerU(-1) + arcU(-1) * 0.6;
      for (const side of [1, -1]) {
        add(body, sweep(-1, side, 0, uw, 24, () => [[0.0, y - 0.035], [0.006, y - 0.032], [0.006, y + 0.032], [0.0, y + 0.035]], M.black));
        add(body, sweep(-1, side, 0, uw, 24, () => [[0.008, y - 0.014], [0.012, y], [0.008, y + 0.014]], M.tail));
        add(body, sweep(-1, side, W * 0.55, W * 0.66, 3, () => [[0.009, y - 0.03], [0.011, y - 0.018]], M.reverse));
      }
    }
    if (tl === 'bars') body.add(rbox(0.36, 0.05, 0.02, 0.01, M.chrome, 0, tailTop - 0.085, ZR - 0.004));
    // the third brake lamp: on the roof's back edge (hatch, wagon, box, bed), or on the deck
    if (['hatch', 'wagon', 'box'].includes(S.rear) || isBed) body.add(rbox(0.3, 0.025, 0.02, 0.008, M.chmsl, 0, roofY(zRoofR) - 0.015, zRoofR - 0.012 - (isBed ? 0.03 : 0)));
    else body.add(rbox(0.36, 0.02, 0.04, 0.008, M.chmsl, 0, topY(0, zBack - 0.08) + 0.02, zBack - 0.08));
    // the tailgate's or the bootlid's shut lines and its handle bar
    const deckZ = ['hatch', 'wagon', 'box'].includes(S.rear) ? ZR - 0.002 : null;
    if (deckZ != null) {
      const xs = S.rear === 'box' ? [0.004] : [tu0 - 0.02, -(tu0 - 0.02)];
      for (const x of xs) body.add(rbox(0.006, YS(ZR) - yBumpR - 0.06, 0.006, 0.002, M.black, x, (YS(ZR) + yBumpR) / 2, deckZ));
      body.add(rbox(0.42, 0.04, 0.03, 0.012, trimChrome || S.cls === 'suv' ? M.chrome : M.black, 0, S.plateY + 0.15, ZR - 0.012));
    } else if (!isBed) {
      for (const s of [1, -1]) { const P = []; for (let k = 0; k <= 16; k++) { const z = lerp(ZR + 0.02, zBack - 0.06, k / 16), y = topY(0.6, z) + 0.002; P.push([[s * 0.6, y, z], [s * 0.606, y, z]]); } body.add(...grid(P, () => M.black, [0, 0, z0c()])); }
    } else {
      body.add(rbox(0.3, 0.05, 0.02, 0.01, M.black, 0, YS(ZR) - 0.08, ZR - 0.004));
    }
    function z0c() { return (ZR + zBack) / 2; }
  }

  /* -------------------------------------------- the side: seams, handles, mirrors -- */
  {
    const seams = [];
    const strip = (side, z, y0, y1) => {
      const P = [];
      for (let k = 0; k <= 12; k++) { const y = lerp(y0, y1, k / 12), x = sideX(z, y) + 0.0025; P.push([[side * x, y, z - 0.003], [side * x, y, z + 0.003]]); }
      return grid(P, () => M.black, [0, (y0 + y1) / 2, z]);
    };
    const sb0 = zCowl - 0.045 * W - 0.1, sb1 = zBack + 0.15, beltZ = (f) => lerp(sb0, sb1, f);
    const front0 = Math.min(zCowl + 0.03, AXF - ARCH - 0.04), doorBot = yb + 0.07;
    // the doors' cuts: the front door's front edge, the B pillar's cut, the rear door's back edge (or the sliding door's)
    const cuts = [front0];
    const w0 = S.win[0];
    const bz = beltZ(w0[1] + 0.012);
    cuts.push(bz);
    if (S.doors >= 4 && S.win.length > 1) cuts.push(Math.max(AXR + ARCH + 0.05, beltZ(S.win[1][1] + 0.012)));
    if (sheet.body.doorType === 'sliding') cuts.push(Math.max(AXR + ARCH + 0.06, bz - 1.25));
    const handleZ = [];
    for (const side of [1, -1]) {
      for (const z of cuts) seams.push(...strip(side, z, Math.max(doorBot, yBottom(z) + 0.01), YS(z) - 0.012));
      // the handles, just behind each door's front cut
      const hz = [front0 - 0.18 - (cuts.length > 2 ? 0 : 0.6) - (S.doors <= 3 ? (front0 - bz) * 0.55 : 0)];
      if (cuts.length > 2) hz[0] = bz + 0.15;
      if (S.doors >= 4 && cuts.length > 2) hz.push(cuts[2] + 0.12);
      if (sheet.body.doorType === 'sliding') hz.push(cuts[cuts.length - 1] + 0.15);
      if (sheet.body.doorType !== 'up') for (const z of hz) { const hy = Math.min(YS(z) - 0.1, S.crease + 0.12); body.add(rbox(0.022, 0.04, 0.17, 0.01, trimChrome ? M.chrome : sheet.paint.finish === 'primer' ? M.black : M.black, side * (sideX(z, hy) + 0.008), hy, z)); handleZ.push(z); }
      // the sliding door's rail under the back side glass line
      if (sheet.body.doorType === 'sliding') body.add(rbox(0.012, 0.02, Math.max(0.3, bz - 1.25 - (AXR + ARCH)), 0.004, M.black, side * (sideX(AXR + 0.8, S.yBelt - 0.08) + 0.006), S.yBelt - 0.08, (bz - 1.25 + AXR + ARCH) / 2));
      // the mirrors: on stubby arms at the front door's corner, the glass facing back
      const mz = zCowl - 0.16, my = topY(W, mz) + 0.1, mx = W + 0.12;
      body.add(rbox(0.16, 0.05, 0.08, 0.02, trimChrome && era < 1995 ? M.chrome : M.black, side * (W + 0.04), my - 0.04, mz));
      body.add(rbox(0.19, S.cls === 'van' ? 0.28 : 0.15, 0.1, 0.035, sheet.class === 'supercar' || sheet.class === 'sedan' || sheet.class === 'limo' ? M.paint : M.black, side * mx, my + (S.cls === 'van' ? 0.06 : 0), mz));
      const mg = new THREE.Mesh(new THREE.PlaneGeometry(0.16, S.cls === 'van' ? 0.25 : 0.125), M.mirror); mg.rotation.y = Math.PI; mg.position.set(side * mx, my + (S.cls === 'van' ? 0.06 : 0), mz - 0.051); body.add(mg);
      // the belt moulding along the window line
      const P = [];
      for (let k = 0; k <= 40; k++) { const z = lerp(beltZ(1), sb0 + 0.05, k / 40), y = topY(beltX(z), z) + 0.004, x = beltX(z) - 0.012; P.push([[side * (x + 0.002), y, z], [side * (x + 0.012), y - 0.012, z], [side * (x + 0.012), y - 0.028, z]]); }
      seams.push(...grid(P, () => (trimChrome ? M.chrome : M.rubberTrim), [0, S.yBelt - 0.3, 0]));
      // a side rub strip (older cars, cabs, vans)
      if (era < 2002 || S.cls === 'van') {
        const ry = S.crease - 0.06, Q = [];
        for (let k = 0; k <= 50; k++) { const z = lerp(AXR + ARCH + 0.04, AXF - ARCH - 0.04, k / 50), x = sideX(z, ry); Q.push([[side * x, ry - 0.025, z], [side * (x + 0.012), ry - 0.018, z], [side * (x + 0.014), ry + 0.018, z], [side * x, ry + 0.025, z]]); }
        seams.push(...grid(Q, () => (S.cls === 'taxi' ? M.chrome : M.rubberTrim), [0, ry, 0]));
      }
      // the side scoop's black insert
      if (sheet.body.sideScoop) body.add(rbox(0.02, 0.09, 0.3, 0.01, M.black, side * (sideX(scoopZ + 0.2, 0.47) - 0.004), 0.47 + (yb - 0.21) * 0.5, scoopZ + 0.2));
    }
    // the bonnet's shut lines and the wipers
    for (const side of [1, -1]) {
      const P = [], x = W * 0.86;
      for (let k = 0; k <= 30; k++) { const z = lerp(zCowl + 0.04, ZF - 0.05, k / 30), y = topY(x, z) + 0.003; P.push([[side * x, y, z], [side * (x + 0.006), y, z]]); }
      seams.push(...grid(P, () => M.black, [0, 0.2, (zCowl + ZF) / 2]));
    }
    body.add(...seams);
    for (const [x0, len] of [[0.08, 0.55 * W / 0.9], [-0.62 * W / 0.9, 0.5 * W / 0.9]]) { const wp = rbox(len, 0.014, 0.018, 0.005, M.black, x0 + len / 2, topY(0, zCowl + 0.03) + 0.016, zCowl + 0.03); wp.rotation.y = 0.04; body.add(wp); }
    // the fuel door, passenger side behind the back wheel
    const fz = AXR - ARCH - 0.25;
    if (fz > ZR + 0.3) { const fd = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.003, 4, 28), M.black); fd.rotation.y = Math.PI / 2; fd.position.set(-(sideX(fz, S.crease + 0.12) + 0.002), S.crease + 0.12, fz); body.add(fd); }
  }

  /* ------------------------------------------- the bonnet, the roof, the aero -- */
  if (sheet.body.hood === 'scoop') {
    const z = lerp(zCowl, ZF, 0.45), y = topY(0, z);
    body.add(rbox(0.42, 0.08, 0.6, 0.03, M.paint, 0, y + 0.03, z));
    body.add(rbox(0.32, 0.045, 0.02, 0.01, M.black, 0, y + 0.04, z + 0.3));
  } else if (sheet.body.hood === 'vents') {
    for (const s of [1, -1]) for (let k = 0; k < 4; k++) { const z = lerp(zCowl + 0.25, ZF - 0.5, 0.5) + k * 0.06, x = s * 0.35; body.add(rbox(0.22, 0.012, 0.025, 0.004, M.black, x, topY(x, z) + 0.004, z)); }
  }
  if (sheet.body.roofRails) {
    const rx = S.wRoof - 0.15;
    for (const side of [1, -1]) {
      body.add(rbox(0.04, 0.036, (zRoofF - zRoofR) * 0.84, 0.016, M.black, side * rx, S.yRoof + 0.085, roofMid));
      for (const z of [zRoofR + 0.1, zRoofF - 0.15]) body.add(rbox(0.05, 0.09, 0.12, 0.02, M.black, side * rx, S.yRoof + 0.05, z));
    }
    for (const z of [roofMid + 0.48, roofMid - 0.48]) { body.add(rbox(2 * rx, 0.03, 0.05, 0.012, M.black, 0, S.yRoof + 0.125, z)); for (const side of [1, -1]) body.add(rbox(0.06, 0.06, 0.07, 0.015, M.aero, side * rx, S.yRoof + 0.105, z)); }
  }
  {
    const aero = sheet.body.aero;
    if (aero === 'ducktail') {
      const P = [];
      for (let k = 0; k <= 20; k++) { const x = lerp(-W + 0.1, W - 0.1, k / 20), y = topY(x, ZR + 0.02); P.push([[x, y - 0.005, ZR + 0.14], [x, y + 0.03, ZR + 0.035], [x, y + 0.035, ZR + 0.005], [x, y - 0.01, ZR - 0.004]]); }
      body.add(...grid(P, () => M.paint, [0, 0, ZR + 0.3]));
    } else if (aero === 'wing') {
      const z = ZR + 0.2, y = topY(0, z) + 0.2;
      body.add(rbox(1.5, 0.03, 0.26, 0.012, M.paint, 0, y, z));
      for (const s of [1, -1]) { body.add(rbox(0.03, 0.2, 0.12, 0.01, M.black, s * 0.55, y - 0.1, z)); body.add(rbox(0.02, 0.09, 0.3, 0.008, M.black, s * 0.76, y + 0.02, z)); }
    } else if (aero === 'roof-spoiler' || ['hatch', 'wagon'].includes(S.rear)) {
      body.add(rbox(2 * S.wRoof - 0.1, 0.035, 0.14, 0.015, M.paint, 0, roofY(zRoofR) + 0.02, zRoofR + 0.03));
    }
  }

  /* ------------------------------------------------------------ the livery -- */
  const liv = sheet.paint.livery;
  let roofSign = null;
  if (liv) {
    const text = (liv.text || (liv.kind === 'taxi' ? 'TAXI' : '')).toUpperCase(), num = liv.number || '';
    const lz0 = AXR + ARCH + 0.1, lz1 = AXF - ARCH - 0.1, ly = (S.crease + YS(0) ) / 2 - 0.02;
    const dm = textMat((cx, w, h) => {
      cx.clearRect(0, 0, w, h);
      if (liv.kind === 'taxi') {
        // a checker band along the doors, the fare words above it, the number on the back door
        const sq = h / 8;
        for (let r2 = 0; r2 < 2; r2++) for (let k = 0; k * sq < w; k++) { cx.fillStyle = (k + r2) % 2 ? '#111' : '#F2F2EA'; cx.fillRect(k * sq, h * 0.62 + r2 * sq, sq, sq); }
        cx.fillStyle = '#111'; cx.font = "800 64px 'Arial Black', 'Arial', system-ui, sans-serif"; cx.textBaseline = 'middle';
        cx.textAlign = 'left'; cx.fillText(text, w * 0.06, h * 0.36);
        cx.textAlign = 'right'; cx.fillText(num, w * 0.94, h * 0.36);
      } else {
        cx.fillStyle = liv.kind === 'security' ? '#C9A43A' : '#1A1A1A'; cx.font = "800 72px 'Arial Black', 'Arial', system-ui, sans-serif"; cx.textAlign = 'center'; cx.textBaseline = 'middle';
        cx.fillText(text, w / 2, h * 0.45, w * 0.9);
        if (num) { cx.font = "700 40px 'Arial', system-ui, sans-serif"; cx.fillText(num, w / 2, h * 0.8); }
      }
    }, 2048, 256, { transparent: true, roughness: 0.4, alphaTest: 0.05 });
    const len = lz1 - lz0, hgt = len / 8;
    for (const side of [1, -1]) {
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(len, hgt), dm);
      pl.position.set(side * (sideX((lz0 + lz1) / 2, ly) + 0.006), ly, (lz0 + lz1) / 2); pl.rotation.y = side * Math.PI / 2; if (side < 0) pl.scale.x = 1; body.add(pl);
      if (side < 0) { pl.rotation.y = -Math.PI / 2; }
    }
    if (liv.kind === 'taxi') {
      roofSign = new THREE.Group(); roofSign.position.set(0, S.yRoof + 0.02, roofMid + 0.15); body.add(roofSign);
      const sm3 = textMat((cx, w, h) => { cx.fillStyle = '#F7F1DA'; cx.fillRect(0, 0, w, h); cx.fillStyle = '#141414'; cx.font = "800 150px 'Arial Black', 'Arial', system-ui, sans-serif"; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText(text, w / 2, h * 0.42); cx.font = "700 60px 'Arial', system-ui, sans-serif"; cx.fillText(num, w / 2, h * 0.84); }, 512, 256, { emissive: '#FFF2C8', emissiveIntensity: 0.0 });
      M.sign = sm3;
      roofSign.add(rbox(0.66, 0.05, 0.26, 0.015, M.black, 0, 0.025, 0));
      roofSign.add(rbox(0.6, 0.2, 0.2, 0.03, M.white, 0, 0.15, 0));
      for (const s of [1, -1]) { const f = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.17), sm3); f.position.set(0, 0.15, s * 0.101); if (s < 0) f.rotation.y = Math.PI; roofSign.add(f); }
    }
  }

  /* ---------------------------------------------------------------- inside -- */
  const cabin = new THREE.Group(); cabin.name = 'cabin'; body.add(cabin);
  const floorY = Math.max(yb + 0.14, WR * 0.6), dx = 0.39 * W / 0.905;
  const sockets = {};
  let steerWheel = null;
  {
    const zi0 = Math.max(zBack + 0.06, ZR + 0.1), zi1 = zCowl - 0.02;
    cabin.add(mesh(new THREE.BoxGeometry(2 * (W - 0.1), S.yBelt - floorY + 0.05, zi1 - zi0), M.interior, 0, (S.yBelt + floorY) / 2, (zi0 + zi1) / 2));
    const dashY = S.yCowl - 0.07, dashZ = zCowl - 0.3;
    cabin.add(rbox(2 * (W - 0.16), 0.24, 0.46, 0.06, M.dash, 0, dashY - 0.05, dashZ));
    cabin.add(rbox(2 * (W - 0.2), 0.05, 0.24, 0.025, M.dash, 0, dashY + 0.07, dashZ + 0.1));
    const wheelPos = [dx, S.hipY + 0.17, S.seatZ + 0.5];
    const dash = sheet.interior.dash;
    if (dash === 'analog') {
      cabin.add(rbox(0.44, 0.1, 0.2, 0.04, M.dash, dx, dashY + 0.07, dashZ - 0.17));
      const cl = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.08), M.cluster); cl.position.set(dx, dashY + 0.05, dashZ - 0.271); cl.rotation.y = Math.PI; cl.rotation.x = 0.25; cabin.add(cl);
    } else if (dash === 'twin-cowl') {
      for (const s of [1, -1]) {
        const cw = cyl(0.075, 0.075, 0.08, 20, M.dash, true); cw.rotation.x = Math.PI / 2; cw.position.set(dx + s * 0.09, dashY + 0.05, dashZ - 0.22); cabin.add(cw);
        const dl = new THREE.Mesh(new THREE.CircleGeometry(0.068, 20), M.cluster); dl.rotation.y = Math.PI; dl.position.set(dx + s * 0.09, dashY + 0.05, dashZ - 0.19); cabin.add(dl);
      }
    } else {
      const sc = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.13), M.screen); sc.position.set(dx * 0.4, dashY + 0.13, dashZ - 0.06); sc.rotation.y = Math.PI; sc.rotation.x = -0.2; cabin.add(sc);
      const cl = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.09), M.screen); cl.position.set(dx, dashY + 0.08, dashZ - 0.22); cl.rotation.y = Math.PI; cl.rotation.x = 0.2; cabin.add(cl);
    }
    cabin.add(rbox(0.26, 0.3, Math.max(0.3, dashZ - S.seatZ - 0.1), 0.05, M.dash, 0, floorY + 0.18, (dashZ + S.seatZ) / 2));
    // the wheel
    const sw = new THREE.Group(); sw.position.set(...wheelPos); sw.rotation.x = 0.42 - (S.yRoof - S.hipY < 0.75 ? 0.15 : 0); cabin.add(sw); steerWheel = sw;
    const wk = sheet.interior.wheel;
    if (wk === 'yoke') {
      const sh = new THREE.Shape(); sh.moveTo(-0.17, -0.04); sh.lineTo(0.17, -0.04); sh.lineTo(0.17, 0.08); sh.quadraticCurveTo(0.17, 0.11, 0.14, 0.11); sh.lineTo(0.1, 0.11); sh.lineTo(0.1, 0.02); sh.lineTo(-0.1, 0.02); sh.lineTo(-0.1, 0.11); sh.lineTo(-0.14, 0.11); sh.quadraticCurveTo(-0.17, 0.11, -0.17, 0.08); sh.lineTo(-0.17, -0.04);
      sw.add(new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 2 }), M.dash));
    } else {
      sw.add(new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.022, 10, 36), M.dash));
      const n = { 'two-spoke': 2, 'three-spoke': 3, 'four-spoke': 4 }[wk], angs = n === 2 ? [0, Math.PI] : n === 3 ? [0, 2.1, -2.1] : [0.6, Math.PI - 0.6, Math.PI + 0.6, -0.6];
      for (const a of angs) { const sp = rbox(0.15, 0.03, 0.02, 0.008, M.dash, 0.075 * Math.cos(a - Math.PI / 2), 0.075 * Math.sin(a - Math.PI / 2), 0); sp.rotation.z = a - Math.PI / 2; sw.add(sp); }
    }
    sw.add(mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.06, 16).rotateX(Math.PI / 2), M.dash));
    const col = mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.3, 10), M.dash, dx, wheelPos[1] - 0.05, wheelPos[2] + 0.12); col.rotation.x = Math.PI / 2 + 0.42; cabin.add(col);
    cabin.add(rbox(0.25, 0.07, 0.03, 0.02, M.black, 0, roofY(zRoofF) - 0.13, zRoofF - 0.18));
    sockets.mirror = [0, roofY(zRoofF) - 0.2, zRoofF - 0.2];
    sockets.dash = [-dx, dashY + 0.1, dashZ - 0.08];
    sockets.cowl = [-0.3, topY(0.3, zCowl + 0.06) + 0.012, zCowl + 0.06];
    // the front seats
    const seatW = Math.min(0.52, W * 0.56), sz = S.seatZ, hy = S.hipY;
    for (const side of [1, -1]) {
      cabin.add(rbox(seatW, 0.14, 0.52, 0.06, M.seat, side * dx, hy - 0.07, sz + 0.06));
      const back = rbox(seatW, 0.58, 0.14, 0.06, M.seat, side * dx, hy + 0.24, sz - 0.28); back.rotation.x = -0.2; cabin.add(back);
      if (S.yRoof - hy > 0.75) cabin.add(rbox(0.26, 0.17, 0.1, 0.04, M.seat, side * dx, hy + 0.61, sz - 0.38));
    }
    // the back: a bench (with a passenger-side headrest out for a child seat), or a cab's partition, or a load floor
    const rearSeats = S.doors >= 4 && S.cls !== 'van' || ['coupe', 'muscle', 'sports'].includes(S.cls);
    const rz = sz - (S.doors >= 4 ? 0.92 : 0.78), rearRoom = rz - 0.35 > zBack - 0.1 || ['notchback', 'fastback'].includes(S.rear);
    if (rearSeats && rearRoom) {
      const ry = hy - (S.doors >= 4 ? 0.02 : 0.08);
      cabin.add(rbox(2 * (W - 0.18), 0.15, 0.52, 0.06, M.seat, 0, ry - 0.08, rz));
      const rb = rbox(2 * (W - 0.18), 0.48, 0.14, 0.06, M.seat, 0, ry + 0.17, rz - 0.32); rb.rotation.x = -0.22; cabin.add(rb);
      if (S.yRoof - ry > 0.8) cabin.add(rbox(0.26, 0.15, 0.09, 0.04, M.seat, dx, ry + 0.48, rz - 0.38));
      sockets.rearLeft = [-dx, ry - 0.005, rz + 0.07]; sockets.rearRight = [dx, ry - 0.005, rz + 0.07];
    }
    if (sheet.interior.partition) {
      const pz = sz - 0.42;
      cabin.add(rbox(2 * (W - 0.14), S.yBelt - floorY, 0.03, 0.01, M.dash, 0, (S.yBelt + floorY) / 2, pz));
      cabin.add(rbox(2 * (W - 0.18), roofY(pz) - S.yBelt - 0.08, 0.012, 0.005, M.glassF, 0, (roofY(pz) + S.yBelt) / 2 - 0.03, pz));
      cabin.add(rbox(2 * (W - 0.16), 0.03, 0.04, 0.01, M.chrome, 0, roofY(pz) - 0.07, pz));
    }
    // the load floor (a hatch, a wagon, a van's box, an SUV's bay)
    if (['hatch', 'wagon', 'box'].includes(S.rear)) {
      const lz0 = zBack + 0.08, lz1 = rearSeats && rearRoom ? rz - 0.45 : sz - 0.5, ly = Math.max(floorY + 0.12, Math.max(S.yBelt - 0.55, WR + 0.25));
      if (lz1 > lz0 + 0.2) { cabin.add(rbox(2 * (W - 0.12), 0.04, lz1 - lz0, 0.01, M.dash, 0, ly, (lz0 + lz1) / 2)); sockets.load = [0, ly + 0.02, (lz0 + lz1) / 2]; sockets.loadLen = lz1 - lz0; }
      if (S.rear === 'box') cabin.add(rbox(2 * (W - 0.12), roofY(sz - 0.45) - floorY - 0.05, 0.03, 0.01, M.dash, 0, (roofY(sz - 0.45) + floorY) / 2, sz - 0.45));
    } else if (isBed) {
      sockets.load = [0, Math.max(yb + 0.24, WR + 0.14), (ZR + zBack) / 2]; sockets.loadLen = zBack - ZR - 0.2;
    }
    sockets.roof = [0, S.yRoof + 0.02, roofMid];
    sockets.roofLen = zRoofF - zRoofR;
  }

  /* ----------------------------------------------------------- the props -- */
  let childSeat = null, booster = null;
  const P3 = (a) => new THREE.Vector3(...a);
  const pm = {
    strap: std({ color: '#2A2B30', roughness: 0.8 }), shell: std({ color: '#3B3E44', roughness: 0.55, metalness: 0.05 }), shellIn: std({ color: '#C79DA4', roughness: 0.95, side: THREE.BackSide }),
    canopy: std({ color: '#D9C2C5', roughness: 0.95, side: THREE.DoubleSide }), star: std({ color: '#FFD34D', emissive: '#FFC21A', emissiveIntensity: 0.15, roughness: 0.7 }),
    bag: std({ color: '#5A6B7E', roughness: 0.9 }), gym: std({ color: '#1E2A3A', roughness: 0.85 }), boost: std({ color: '#4A4E57', roughness: 0.85 }), boostAcc: std({ color: '#D2468E', roughness: 0.8 }),
    tag: std({ color: '#F2F0EA', roughness: 0.8, side: THREE.DoubleSide }), card: std({ color: '#B98A55', roughness: 0.92 }), paper: std({ color: '#F1EFE6', roughness: 0.9, side: THREE.DoubleSide }),
    pink: std({ color: '#F28AB6', roughness: 0.95 }), red: std({ color: '#C3262E', roughness: 0.6 }), green: std({ color: '#2E5B34', roughness: 0.9 }), metal: std({ color: '#8E9397', roughness: 0.35, metalness: 0.8 }),
    cup: std({ color: '#EDE7DA', roughness: 0.7 }), lid: std({ color: '#2A2A2A', roughness: 0.6 }), crate: std({ color: '#6D7378', roughness: 0.6, metalness: 0.4 }),
  };
  const PROPS = {
    'child-seat'() {
      // a rear-facing infant carrier behind the passenger: reclined, a canopy over the head end, the handle up, a star on it
      const s = sockets.rearLeft; if (!s) return;
      const cs = new THREE.Group(); cs.name = 'child-seat'; cs.position.set(s[0], s[1], s[2]); cabin.add(cs); childSeat = cs;
      cs.add(rbox(0.4, 0.1, 0.6, 0.04, pm.shell, 0, 0.05, 0));
      const tilt = new THREE.Group(); tilt.position.set(0, 0.32, 0.04); tilt.rotation.x = 0.62; cs.add(tilt);
      const cup = new THREE.SphereGeometry(1, 28, 16, 0, Math.PI, 0, Math.PI);
      const shell = new THREE.Mesh(cup, pm.shell); shell.scale.set(0.215, 0.33, 0.25); tilt.add(shell);
      const lining = new THREE.Mesh(cup, pm.shellIn); lining.scale.set(0.2, 0.315, 0.232); tilt.add(lining);
      const rim = []; for (let k = 0; k <= 48; k++) { const a = (k / 48) * Math.PI * 2; rim.push(V3(0.21 * Math.cos(a), 0.325 * Math.sin(a), 0)); }
      tilt.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rim, true), 96, 0.012, 8, true), pm.shell));
      for (const sx of [-0.06, 0.06]) { const st = rbox(0.03, 0.34, 0.012, 0.005, pm.strap, sx, 0.04, -0.13); st.rotation.x = 0.1; tilt.add(st); }
      const can = new THREE.Mesh(new THREE.SphereGeometry(0.235, 24, 10, 0, Math.PI * 2, 0, 1.2), pm.canopy); can.rotation.x = -0.75; can.position.set(0, 0.13, 0.02); tilt.add(can);
      const hd = new THREE.Mesh(new THREE.TorusGeometry(0.235, 0.016, 8, 30, Math.PI), pm.shell); hd.position.set(0, 0.36, -0.05); cs.add(hd);
      const shape = new THREE.Shape();
      for (let k = 0; k < 10; k++) { const a = Math.PI / 2 + (k / 10) * Math.PI * 2, r = k % 2 ? 0.022 : 0.05; const x = r * Math.cos(a), y = r * Math.sin(a); k ? shape.lineTo(x, y) : shape.moveTo(x, y); }
      const star = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.018, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 2 }), pm.star);
      star.position.set(0.06, 0.48, -0.06); star.rotation.y = 0.5; cs.add(star);
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.1, 4), pm.strap); cord.position.set(0.06, 0.55, -0.05); cs.add(cord);
      cs.add(rbox(0.44, 0.012, 0.05, 0.004, pm.strap, 0, 0.11, 0.08));
    },
    booster() {
      // a high-back booster behind the passenger, rarely used: the price tag still on
      const s = sockets.rearLeft; if (!s) return;
      const b = new THREE.Group(); b.name = 'booster'; b.position.set(s[0], s[1], s[2] - 0.05); cabin.add(b); booster = b; childSeat = childSeat || b;
      b.add(rbox(0.4, 0.12, 0.38, 0.05, pm.boost, 0, 0.06, 0.02));
      const bk = rbox(0.38, 0.5, 0.1, 0.05, pm.boost, 0, 0.36, -0.17); bk.rotation.x = -0.18; b.add(bk);
      for (const s2 of [1, -1]) { b.add(rbox(0.06, 0.12, 0.3, 0.03, pm.boost, s2 * 0.2, 0.17, 0.0)); b.add(rbox(0.07, 0.2, 0.14, 0.03, pm.boostAcc, s2 * 0.15, 0.58, -0.2)); }
      const tag = new THREE.Group(); tag.position.set(0.2, 0.2, 0.13); b.add(tag); b.userData.tag = tag;
      tag.add(mesh(new THREE.CylinderGeometry(0.0015, 0.0015, 0.08, 4), pm.strap, 0, -0.04, 0));
      tag.add(mesh(new THREE.PlaneGeometry(0.05, 0.08), pm.tag, 0, -0.1, 0));
    },
    'diaper-bag'() { const s = sockets.load || sockets.rearRight; if (!s) return; cabin.add(rbox(0.46, 0.24, 0.28, 0.1, pm.bag, s[0] + 0.25, s[1] + 0.12, s[2])); const h = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.012, 6, 16, Math.PI), pm.strap); h.position.set(s[0] + 0.25, s[1] + 0.24, s[2]); cabin.add(h); },
    'gym-bag'() { const s = sockets.load || sockets.rearRight; if (!s) return; const gb = cyl(0.13, 0.13, 0.55, 16, pm.gym); gb.rotation.z = Math.PI / 2; gb.position.set(s[0] - 0.2, s[1] + 0.13, s[2] - 0.05); cabin.add(gb); },
    'coffee-cups'() { const s = sockets.dash; for (const k of [0, 1]) { const c = cyl(0.04, 0.03, 0.12, 14, pm.cup); c.position.set(0.12 * (k ? -1 : 1) * 0.5, S.hipY + 0.05, S.seatZ + 0.35 - k * 0.09); cabin.add(c); const l = cyl(0.042, 0.042, 0.012, 14, pm.lid); l.position.set(c.position.x, c.position.y + 0.065, c.position.z); cabin.add(l); } void s; },
    'fuzzy-dice'() { const s = sockets.mirror; for (const k of [-1, 1]) { const d = rbox(0.06, 0.06, 0.06, 0.02, pm.pink, s[0] + k * 0.03, s[1] - 0.12 - (k > 0 ? 0.03 : 0), s[2]); d.rotation.set(0.4, 0.6 * k, 0.2); cabin.add(d); const st = cyl(0.002, 0.002, 0.12, 4, pm.strap); st.position.set(s[0] + k * 0.03, s[1] - 0.04, s[2]); cabin.add(st); } },
    'air-freshener'() { const s = sockets.mirror; const t = new THREE.Shape(); t.moveTo(0, 0.07); t.lineTo(0.035, 0.0); t.lineTo(0.01, 0.0); t.lineTo(0.03, -0.05); t.lineTo(-0.03, -0.05); t.lineTo(-0.01, 0.0); t.lineTo(-0.035, 0.0); t.lineTo(0, 0.07); const m = new THREE.Mesh(new THREE.ShapeGeometry(t), pm.green); m.material.side = THREE.DoubleSide; m.position.set(s[0], s[1] - 0.12, s[2]); cabin.add(m); },
    'parking-tickets'() { const s = sockets.cowl; for (const k of [0, 1, 2]) { const p = mesh(new THREE.PlaneGeometry(0.1, 0.16), pm.paper, s[0] - k * 0.05, s[1] + 0.015 + k * 0.004, s[2] + 0.02 - k * 0.01); p.rotation.set(-Math.PI / 2 + 0.5, 0, 0.2 * (k - 1)); body.add(p); } },
    clipboard() { const s = sockets.dash; cabin.add(rbox(0.23, 0.012, 0.32, 0.004, pm.card, s[0], s[1], s[2])); cabin.add(rbox(0.2, 0.004, 0.27, 0.002, pm.paper, s[0], s[1] + 0.008, s[2])); },
    toolbox() { const s = sockets.load || sockets.rearRight; if (!s) return; cabin.add(rbox(0.5, 0.22, 0.24, 0.02, pm.red, s[0] - 0.3, s[1] + 0.11, s[2])); cabin.add(rbox(0.3, 0.03, 0.03, 0.01, pm.metal, s[0] - 0.3, s[1] + 0.25, s[2])); },
    'delivery-boxes'() { const s = sockets.load || sockets.rearRight; if (!s) return; const L = sockets.loadLen || 0.5; for (let k = 0; k < Math.max(2, Math.floor(L / 0.45)); k++) { const h = 0.25 + 0.15 * R(); cabin.add(rbox(0.4 + 0.1 * R(), h, 0.36, 0.01, pm.card, s[0] + 0.3 - 0.4 * (k % 2), s[1] + h / 2, s[2] - L / 2 + 0.25 + k * 0.4)); } },
    'dog-crate'() { const s = sockets.load || sockets.rearRight; if (!s) return; const c = new THREE.Group(); c.position.set(s[0], s[1], s[2]); cabin.add(c); for (const x of [-0.3, 0.3]) for (const z of [-0.25, 0.25]) c.add(rbox(0.02, 0.5, 0.02, 0.005, pm.crate, x, 0.25, z)); for (let k = 0; k <= 6; k++) { c.add(rbox(0.6, 0.01, 0.01, 0.003, pm.crate, 0, 0.5, -0.25 + k / 12)); c.add(rbox(0.01, 0.5, 0.01, 0.003, pm.crate, -0.3 + k * 0.1, 0.25, 0.25)); } c.add(rbox(0.62, 0.02, 0.52, 0.004, pm.crate, 0, 0.01, 0)); },
    'ladder-rack'() {
      const s = sockets.roof, L = sockets.roofLen * 0.9, y = s[1] + 0.09, rx = S.wRoof - 0.12;
      for (const z of [s[2] - L / 2 + 0.2, s[2], s[2] + L / 2 - 0.2]) { body.add(rbox(2 * rx + 0.1, 0.03, 0.04, 0.008, pm.metal, 0, y, z)); for (const sd of [1, -1]) body.add(rbox(0.03, 0.09, 0.04, 0.006, pm.metal, sd * rx, y - 0.05, z)); }
      const lx = 0.28, lw = 0.4;
      for (const sd of [1, -1]) body.add(rbox(0.04, 0.03, L + 0.4, 0.008, pm.metal, lx + sd * lw / 2, y + 0.035, s[2]));
      for (let k = 0; k * 0.3 < L + 0.3; k++) body.add(rbox(lw, 0.018, 0.018, 0.004, pm.metal, lx, y + 0.035, s[2] - (L + 0.4) / 2 + 0.1 + k * 0.3));
    },
    'roof-box'() { const s = sockets.roof; body.add(rbox(0.85, 0.32, Math.min(1.9, sockets.roofLen * 0.85), 0.14, pm.lid, 0, s[1] + 0.25, s[2])); for (const z of [-0.4, 0.4]) body.add(rbox(1.1, 0.03, 0.05, 0.01, M.black, 0, s[1] + 0.08, s[2] + z)); },
    'christmas-tree-on-roof'() { const s = sockets.roof; const t = new THREE.Group(); t.position.set(0, s[1] + 0.2, s[2]); t.rotation.x = Math.PI / 2; body.add(t); for (const [r, h, y] of [[0.32, 0.55, 0.0], [0.26, 0.5, 0.35], [0.18, 0.45, 0.68]]) { const c = new THREE.Mesh(new THREE.ConeGeometry(r, h, 10), pm.green); c.position.y = y; t.add(c); } const tk = cyl(0.04, 0.04, 0.25, 8, pm.card); tk.position.y = -0.35; t.add(tk); for (const z of [-0.25, 0.25]) body.add(rbox(1.2 * S.wRoof * 2 / 1.4, 0.012, 0.03, 0.004, M.black, 0, s[1] + 0.2, s[2] + z)); },
  };
  for (const p of sheet.props) PROPS[p]?.();

  /* ------------------------------------------------- the thrusters (hop, dash) -- */
  const thrusters = sheet.abilities.includes('hop') || sheet.abilities.includes('dash');
  if (thrusters) {
    const y = Math.max(yb + 0.12, yBumpR - 0.02), n = 5;
    body.add(rbox(1.25, 0.16, 0.06, 0.06, M.black, 0, y, ZR - 0.02));
    for (let k = 0; k < n; k++) {
      const x = lerp(-0.5, 0.5, k / (n - 1)), cup = cyl(0.055, 0.065, 0.08, 20, M.barrel, true); cup.rotation.x = Math.PI / 2; cup.position.set(x, y, ZR - 0.06); body.add(cup);
      const core = new THREE.Mesh(new THREE.CircleGeometry(0.05, 20), k === 2 ? M.burn : M.thrust); core.rotation.y = Math.PI; core.position.set(x, y, ZR - 0.05); body.add(core);
    }
  }

  /* ---------------------------------------------------------------- wheels -- */
  const wheels = [];
  const { RIM, TW } = S, WRr = WR, hw = TW / 2;
  const tyreKind = sheet.wheels.tyre;
  const tyreGeo = (() => {
    const r0 = RIM + 0.002, sh = tyreKind === 'balloon' ? 0.07 : tyreKind === 'low-profile' ? 0.03 : 0.045;
    const pts = [[r0, -hw * 0.86], [lerp(r0, WRr, 0.35), -hw * 0.96], [lerp(r0, WRr, 0.7), -hw], [WRr - sh * 0.4, -hw * 0.96], [WRr - sh * 0.08, -hw * 0.82], [WRr, -hw * 0.6], [WRr, hw * 0.6], [WRr - sh * 0.08, hw * 0.82], [WRr - sh * 0.4, hw * 0.96], [lerp(r0, WRr, 0.7), hw], [lerp(r0, WRr, 0.35), hw * 0.96], [r0, hw * 0.86]];
    return new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 56);
  })();
  const treadGeo = tyreKind === 'all-terrain' ? (() => { const ps = []; for (let k = 0; k < 36; k++) { const a = (k / 36) * Math.PI * 2; for (const sy of [-1, 1]) ps.push(new THREE.BoxGeometry(0.035, hw * 0.55, 0.012).translate(0, sy * hw * 0.42, WRr + 0.004).rotateY(0).applyMatrix4(new THREE.Matrix4().makeRotationY(a + (sy > 0 ? 0.08 : 0)))); } const m = mergeGeometries(ps); return m; })() : null;
  const L = (pts, seg = 48) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
  const face = hw * 0.78;
  const lipGeo = L([[RIM - 0.02, face - 0.02], [RIM - 0.005, face + 0.003], [RIM + 0.007, face + 0.006], [RIM + 0.011, face - 0.004], [RIM + 0.003, face - 0.02]]);
  const barrelGeo = L([[RIM - 0.005, face - 0.02], [RIM - 0.003, -face]], 40);
  const dishGeo = L([[RIM - 0.013, face - 0.006], [RIM * 0.6, face - 0.026], [RIM * 0.37, face - 0.028], [0.0, face - 0.028]], 40);
  const hubGeo = new THREE.CylinderGeometry(RIM * 0.3, RIM * 0.34, 0.035, 24).translate(0, face - 0.01, 0);
  const capGeo = new THREE.CylinderGeometry(RIM * 0.17, RIM * 0.17, 0.012, 20).translate(0, face + 0.01, 0);
  const lugGeo = (() => { const ps = []; for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2 + Math.PI / 5; ps.push(new THREE.CylinderGeometry(0.009, 0.009, 0.02, 6).translate(RIM * 0.245 * Math.cos(a), face + 0.008, RIM * 0.245 * Math.sin(a))); } return mergeGeometries(ps); })();
  const discGeo = new THREE.CylinderGeometry(RIM * 0.76, RIM * 0.76, 0.024, 32).translate(0, -0.02, 0);
  const spokeSet = (n, wIn, wOut, depth, rot = 0, split = 0) => {
    const s = new THREE.Shape(), r0 = RIM * 0.3, r1 = RIM * 0.86;
    s.moveTo(r0, -wIn / 2); s.lineTo(r1, -wOut / 2); s.quadraticCurveTo(r1 + RIM * 0.1, 0, r1, wOut / 2); s.lineTo(r0, wIn / 2); s.quadraticCurveTo(r0 - 0.008, 0, r0, -wIn / 2);
    const gg = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: 0.005, bevelSize: 0.005, bevelSegments: 2, curveSegments: 6 });
    gg.rotateX(-Math.PI / 2); gg.translate(0, face - 0.03, 0);
    const parts = [];
    for (let k = 0; k < n; k++) {
      if (split) for (const d of [-split, split]) parts.push(gg.clone().rotateY((k / n) * Math.PI * 2 + rot + d));
      else parts.push(gg.clone().rotateY((k / n) * Math.PI * 2 + rot));
    }
    const out = mergeGeometries(parts.map((p) => { p.deleteAttribute('uv'); return p; })); out.computeVertexNormals(); return out;
  };
  const style = sheet.wheels.style;
  const faceParts = (() => {
    const a = [];
    if (style === 'five-spoke') a.push([spokeSet(5, 0.064, 0.092, 0.022), M.alloy]);
    else if (style === 'split-five') a.push([spokeSet(5, 0.032, 0.05, 0.022, 0, 0.12), M.alloy]);
    else if (style === 'multi-spoke') a.push([spokeSet(10, 0.022, 0.036, 0.02), M.alloy]);
    else if (style === 'mesh') { a.push([spokeSet(16, 0.012, 0.016, 0.016, 0.09), M.alloy]); a.push([spokeSet(16, 0.012, 0.016, 0.014, -0.09), M.alloy]); }
    else if (style === 'turbine') {
      // curved blades over a pale aero disc
      const blades = []; for (let k = 0; k < 12; k++) { const b = new THREE.BoxGeometry(RIM * 0.62, 0.016, 0.03); b.translate(RIM * 0.56, face - 0.012, 0); b.rotateZ(0.0); const m = new THREE.Matrix4().makeRotationY((k / 12) * Math.PI * 2); const tw = new THREE.Matrix4().makeRotationX(0.5); b.applyMatrix4(tw); b.applyMatrix4(m); blades.push(b); }
      a.push([mergeGeometries(blades), M.alloy]);
      a.push([L([[RIM - 0.015, face - 0.035], [RIM * 0.3, face - 0.03], [0, face - 0.03]], 40), M.aero]);
    } else if (style === 'steel-hubcap') {
      a.push([L([[RIM + 0.004, face - 0.004], [RIM * 0.95, face + 0.01], [RIM * 0.8, face + 0.022], [RIM * 0.5, face + 0.03], [RIM * 0.25, face + 0.04], [0, face + 0.042]], 48), M.alloy]);
      const sl = []; for (let k = 0; k < 10; k++) { const a2 = (k / 10) * Math.PI * 2; sl.push(new THREE.BoxGeometry(0.018, 0.006, RIM * 0.22).translate(0, face + 0.028, RIM * 0.66).applyMatrix4(new THREE.Matrix4().makeRotationY(a2))); }
      a.push([mergeGeometries(sl), M.black]);
    } else if (style === 'steel-bare') {
      a.push([L([[RIM - 0.01, face - 0.01], [RIM * 0.82, face - 0.02], [RIM * 0.55, face - 0.004], [RIM * 0.4, face + 0.006], [0, face + 0.006]], 40), M.alloy]);
      const hs = []; for (let k = 0; k < 8; k++) { const a2 = (k / 8) * Math.PI * 2; hs.push(new THREE.CylinderGeometry(0.022, 0.022, 0.004, 12).translate(RIM * 0.68 * Math.cos(a2), face - 0.012, RIM * 0.68 * Math.sin(a2))); }
      a.push([mergeGeometries(hs), M.under]);
    }
    return a;
  })();
  const showDish = !['steel-hubcap', 'steel-bare'].includes(style);
  const wwGeo = sheet.wheels.whitewall ? new THREE.RingGeometry(lerp(RIM, WRr, 0.25), lerp(RIM, WRr, 0.55), 48).rotateX(-Math.PI / 2).translate(0, hw * 0.99, 0) : null;
  function wheel(cz, side) {
    const Wg = new THREE.Group(); Wg.position.set(side * S.WX, WRr, cz);
    const spin = new THREE.Group(); Wg.add(spin);
    const hub = new THREE.Group(); hub.rotation.z = -side * Math.PI / 2; spin.add(hub);
    hub.add(new THREE.Mesh(tyreGeo, M.rubber), new THREE.Mesh(lipGeo, M.alloy), new THREE.Mesh(barrelGeo, M.barrel), new THREE.Mesh(discGeo, M.disc));
    if (treadGeo) hub.add(new THREE.Mesh(treadGeo, M.rubber));
    if (wwGeo) hub.add(new THREE.Mesh(wwGeo, M.white));
    for (const [geo, mat] of faceParts) hub.add(new THREE.Mesh(geo, mat));
    if (showDish) { hub.add(new THREE.Mesh(hubGeo, M.alloy), new THREE.Mesh(capGeo, M.chrome), new THREE.Mesh(lugGeo, M.chrome)); const dish = new THREE.Mesh(dishGeo, M.under); dish.position.y = -0.03; hub.add(dish); }
    else if (style === 'steel-bare') hub.add(new THREE.Mesh(lugGeo, M.chrome), new THREE.Mesh(capGeo, M.black));
    const fixed = new THREE.Group(); fixed.rotation.z = -side * Math.PI / 2; Wg.add(fixed);
    fixed.add(rbox(0.06, 0.05, RIM * 0.62, 0.015, M.caliper, RIM * 0.6, -0.02, -RIM * 0.3));
    g.add(Wg);
    return { W: Wg, spin, front: cz > 0, r: WRr };
  }
  for (const cz of [AXF, AXR]) for (const side of [1, -1]) wheels.push(wheel(cz, side));

  /* ---------------------------------------------- the paint: tone, stripes, wear -- */
  {
    const p = positionLocal, n = normalLocal;
    let col = color(sheet.paint.base);
    const second = sheet.paint.second ? color(sheet.paint.second) : null;
    const cr = float(S.crease), bl = float(S.yBelt);
    if (second && sheet.paint.split === 'lower' && !M.lowerGloss) col = mix(col, second, step(p.y, cr));
    if (second && sheet.paint.split === 'beltline') col = mix(col, second, step(cr.sub(0.04), p.y).mul(step(p.y, cr.add(0.05))));
    const sc = color(sheet.paint.stripeColour);
    if (sheet.paint.stripes === 'twin-racing') { const ax = abs(p.x); col = mix(col, sc, step(0.06, ax).mul(step(ax, 0.24)).mul(smoothstep(0.35, 0.6, n.y))); }
    else if (sheet.paint.stripes === 'side') col = mix(col, sc, step(cr.add(0.02), p.y).mul(step(p.y, cr.add(0.075))).mul(smoothstep(0.5, 0.8, abs(n.x))));
    else if (sheet.paint.stripes === 'pinstripe') col = mix(col, sc, step(cr.add(0.03), p.y).mul(step(p.y, cr.add(0.038))).mul(smoothstep(0.5, 0.8, abs(n.x))));
    let rough = float(fin.roughness);
    if (cond >= 1) {
      // grime: low on the body, thickest behind the wheels and on the sills, broken up
      const amt = [0, 0.35, 0.65, 0.92][cond];
      const nz = mx_noise_float(p.mul(vec3(2.2, 7.0, 2.2))).mul(0.5).add(0.5);
      const low = float(1).sub(smoothstep(float(yb - 0.02), float(yb + 0.42 + 0.12 * cond), p.y));
      const g2 = low.mul(nz.mul(0.7).add(0.3)).mul(amt);
      col = mix(col, color('#4A3F31'), g2);
      // (a tired car or a beater: grime run down in streaks from the window line and the lamps)
      if (cond >= 2) { const st = smoothstep(0.55, 0.85, mx_noise_float(p.mul(vec3(26.0, 1.2, 26.0)))).mul(step(p.y, float(S.yBelt))).mul(smoothstep(0.5, 0.9, abs(n.x)).add(smoothstep(0.5, 0.9, abs(n.z)))).mul(0.3 * (cond - 1)); col = mix(col, color('#6A604F'), st); }
      rough = rough.add(g2.mul(0.45));
      // dust on top surfaces for a tired car or a beater
      if (cond >= 2) { const d = smoothstep(0.6, 0.95, n.y).mul(mx_noise_float(p.mul(3.1).add(2.0)).mul(0.5).add(0.5)).mul(0.22 * (cond - 1)); col = mix(col, color('#8A8170'), d); rough = rough.add(d.mul(0.5)); }
      // scuffs: thin pale scratches on the sides
      if (cond >= 2) { const s2 = smoothstep(0.82, 0.9, mx_noise_float(p.mul(vec3(1.5, 40.0, 9.0)))).mul(smoothstep(0.5, 0.9, abs(n.x))).mul(0.35); col = mix(col, color('#C9C7C2'), s2); }
      // rust (a beater): blooms low down, round the arches and sills
      if (cond >= 3) {
        const rr = smoothstep(0.32, 0.5, mx_noise_float(p.mul(vec3(4.5, 4.5, 4.5)).add(7.3))).mul(float(1).sub(smoothstep(float(yb + 0.05), float(S.crease + 0.05), p.y)));
        col = mix(col, color('#6B3A1E'), rr.mul(0.9)); rough = rough.add(rr.mul(0.5));
        // the mismatched panel: the passenger's front door, a replacement left in another white
        const dz0 = zCowl - 1.2, dz1 = zCowl - 0.05;
        const box = step(p.x, float(-0.3)).mul(step(float(dz0), p.z)).mul(step(p.z, float(dz1))).mul(step(float(yb + 0.06), p.y)).mul(step(p.y, float(S.yBelt + 0.01)));
        col = mix(col, color(sheet.paint.second || '#D8D4C6'), box.mul(0.92));
      }
    }
    M.paint.colorNode = col;
    M.paint.roughnessNode = rough.min(1);
  }

  /* ---------------------------------------------- one mesh per material -- */
  {
    body.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(body.matrixWorld).invert();
    const byMat = new Map(), gone = [];
    const keep = new Set([childSeat, booster, roofSign].filter(Boolean));
    body.traverse((m) => {
      if (!m.isMesh || m.material.map) return;
      let p = m.parent; while (p && p !== body) { if (keep.has(p)) return; p = p.parent; }
      let geo = m.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld)); if (geo.index) geo = geo.toNonIndexed();
      for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal') geo.deleteAttribute(k);
      if (!byMat.has(m.material)) byMat.set(m.material, []); byMat.get(m.material).push(geo); gone.push(m);
    });
    for (const m of gone) m.parent.remove(m);
    for (const [mat, geos] of byMat) {
      const mm = new THREE.Mesh(mergeGeometries(geos), mat);
      mm.castShadow = !mat.transparent; mm.receiveShadow = true; body.add(mm);
    }
  }

  /* ------------------------------------------------ drive, sound, the live parts -- */
  const dims = { length: (ZF - ZR) + 0.12, width: 2 * W, height: S.yRoof + (roofSign ? 0.25 : 0), wheelbase: AXF - AXR, zF: ZF, zR: ZR };
  const { tune, springs, tail } = driveTune(sheet, dims);
  const sound = soundProfile(sheet, tune);
  let night = 0, nightSet = null, brakeSet = null, revSet = null, brake = 0, rev = 0, prevSpeed = 0, accS = 0, latS = 0, clock = 0;
  let cold = 0, burn = 0;
  const spr = { roll: 0, rollV: 0, pitch: 0, pitchV: 0 };
  function lamps() {
    const n = nightSet ?? night, b = brakeSet ?? brake, r = revSet ?? rev;
    M.bulb.emissiveIntensity = n * 7.5;
    M.reflector.emissiveIntensity = n * 0.55;
    M.drl.emissiveIntensity = 0.5 + n * 2.5;
    M.tail.emissiveIntensity = n * 0.45 + b * (0.8 + 1.8 * (1 - n));
    M.chmsl.emissiveIntensity = b * 4;
    M.reverse.emissiveIntensity = r * 4;
    M.amber.emissiveIntensity = n * 0.8;
    M.cluster.emissiveIntensity = n * 0.9;
    M.screen.emissiveIntensity = 0.25 + n * 0.8;
    if (M.sign) M.sign.emissiveIntensity = 0.15 + n * 1.2;
    pm.star.emissiveIntensity = 0.15 + n * 0.5;
    M.thrust.emissiveIntensity = cold * 3; M.burn.emissiveIntensity = burn * 5;
  }
  const H = tune.handling;
  function update(dt, speed = 0, steer = 0) {
    if (!(dt > 0)) return;
    dt = Math.min(dt, 0.05); clock += dt;
    steer = -steer;
    for (const w of wheels) { w.spin.rotation.x += (speed * dt) / w.r; if (w.front) w.W.rotation.y = steer * 0.5; }
    // (the steering wheel with them, a good deal further: left (steer > 0) is anticlockwise to the driver)
    if (steerWheel) steerWheel.rotation.z += (-steer * 1.25 - steerWheel.rotation.z) * Math.min(1, dt * 16);
    const glow = globalThis.window?.NYC?.cityUniforms?.uInteriorGlow?.value;
    if (glow !== undefined) night = Math.max(0, Math.min(1, (glow - 0.6) * 1.45));
    const acc = (speed - prevSpeed) / dt; prevSpeed = speed;
    accS += (acc - accS) * Math.min(1, dt * 8);
    const slowing = speed * accS < 0 ? Math.abs(accS) : 0;
    brake = Math.abs(speed) < 0.3 || slowing > 3.4 ? 1 : 0;
    rev = speed < -0.3 ? 1 : 0;
    lamps();
    // the body on its springs: it leans out of a turn and dives under the brakes; a cammed or tired engine shakes it at idle
    const v = Math.abs(speed), lat = Math.sign(steer) * Math.min(v * v / H.rMin, H.yawMax * v, H.grip) * Math.min(1, Math.abs(steer) / 0.9) * Math.sign(speed || 1);
    latS += (lat - latS) * Math.min(1, dt * 6);
    const shake = (sound.lope > 0.3 || sheet.sound.engine === 'diesel') && v < 0.5 ? 0.0012 * Math.sin(clock * 2 * Math.PI * (sheet.sound.engine === 'diesel' ? 11 : 7.3)) * (1 + 0.4 * Math.sin(clock * 2 * Math.PI * 1.7)) : 0;
    const wantRoll = clamp(latS * springs.rollGain, -springs.rollMax, springs.rollMax) + shake, wantPitch = clamp(-accS * springs.pitchGain, -springs.pitchMax, springs.pitchMax);
    spr.rollV += ((wantRoll - spr.roll) * springs.k - spr.rollV * springs.damp) * dt; spr.roll += spr.rollV * dt;
    spr.pitchV += ((wantPitch - spr.pitch) * springs.k * 1.15 - spr.pitchV * springs.damp * 1.15) * dt; spr.pitch += spr.pitchV * dt;
    bodyPivot.rotation.z = spr.roll; bodyPivot.rotation.x = spr.pitch;
    const tg = booster?.userData.tag; if (tg) tg.rotation.y = 0.5 + 0.25 * Math.sin(clock * 2.1) * Math.min(1, 0.2 + v / 10);
  }
  lamps();

  // a tail-happy car: on the throttle in a turn the rear lets go (engine/cars/muscle.js's, scaled by the sheet)
  const onDrive = tail ? function onDrive(dt, car, keys, throttle, steerK, G) {
    const T = tail;
    if (!(dt > 0) || car.halt || throttle <= 0 || car.speed < T.vMin || Math.abs(steerK) < T.steerMin) return;
    const v = car.speed, pull = throttle * (keys?.boost ? 1.45 : 1) * Math.max(0, 1 - Math.abs(v - T.vPeak) / T.vSpan);
    const k = pull * (Math.abs(steerK) - T.steerMin) / (1 - T.steerMin) * (G?.missions?.runner?.autopilot ? 0.33 : 1);
    if (k <= 0) return;
    const s = Math.sign(steerK);
    car.angularVel = (car.angularVel || 0) + s * T.yaw * k * dt;
    const lx = Math.cos(car.heading), lz = -Math.sin(car.heading);
    car.vx = (car.vx || 0) - s * lx * T.slide * k * dt;
    car.vz = (car.vz || 0) - s * lz * T.slide * k * dt;
  } : undefined;

  // the city's headlamp spots moved onto this car's lamps
  const HEAD_GAIN = 6;
  function attach(car) {
    if (!car?.headLights) return;
    car.headLights.forEach((s, i) => {
      const side = s.position.x < 0 ? -1 : s.position.x > 0 ? 1 : (i ? 1 : -1), sc = rs.scale || 1, x = side * S.lampPos[0] * sc, y = S.lampPos[1] * sc, z = S.lampPos[2] * sc;
      s.position.set(x, y, z); s.target.position.set(x + side * 0.25, y - 10 * Math.tan(0.08), z + 10);
      s.color.set(era >= 2008 ? '#F2F6FF' : '#FFF0D2'); s.angle = 0.26; s.penumbra = 0.6; s.distance = 90;
      let val = s.intensity; Object.defineProperty(s, 'intensity', { get: () => val, set: (x2) => { val = x2 * HEAD_GAIN; }, configurable: true });
    });
  }

  // the driver's marks (the left seat, +x): anchor is a group in the car's frame for a body; seat its points
  const anchor = new THREE.Group(); anchor.name = 'driver-anchor'; body.add(anchor);
  const SEAT = { hip: [dx, S.hipY, S.seatZ], knee: [dx, S.hipY - 0.02, S.seatZ + 0.42], foot: [dx, floorY + 0.06, S.seatZ + 0.8], hand: [dx, S.hipY + 0.17, S.seatZ + 0.5], eye: [dx, S.eyeY, S.seatZ - 0.08] };

  // the automatic checks of the quality gate (the turntable is the rest of it)
  let tris = 0; g.traverse((m) => { if (m.isMesh) tris += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; });
  const checks = {
    wheelsInArches: WR + 0.025 < ARCH && S.WX + hw <= W + S.flare + 0.04,
    clearance: +(yb).toFixed(3), clearanceOk: yb >= 0.08,
    headroom: +(S.yRoof - S.hipY).toFixed(2), seatReachable: S.yRoof - S.hipY > 0.62 && S.hipY > floorY,
    triangles: Math.round(tris), trianglesOk: tris < 400000,
  };

  const rs = {
    group: g, body, materials: M, wheels, childSeat, booster, anchor, seat: SEAT, tune, sound, springs,
    length: dims.length, width: dims.width, height: dims.height,
    update, attach, onDrive,
    // the wheel (wheel) and where a driver's hand holds it (the wrist's mark, a touch out, under and back from the rim's
    // side end), in the world: grip('L' | 'R'), L the rim's +x side
    wheel: steerWheel, grip(sideK, out = new THREE.Vector3()) { steerWheel.updateWorldMatrix(true, false); return steerWheel.localToWorld(out.set(sideK === 'L' ? 0.21 : -0.21, -0.035, -0.05)); },
    setThrust(c = 0, b = 0) { cold = c; burn = b; lamps(); }, setElectric() {},
    setNight(k) { nightSet = k == null ? null : +k; lamps(); },
    setBrake(on) { brakeSet = on == null ? null : on ? 1 : 0; lamps(); },
    setReverse(on) { revSet = on == null ? null : on ? 1 : 0; lamps(); },
    setBooster(on) { if (booster) booster.visible = !!on; },
    // what the story layer reads: the words, the abilities, the sockets, the gate's checks and the sheet's clamps
    sheet, label: sheet.label, noun: sheet.noun, abilities: sheet.abilities, doorType: sheet.body.doorType, sockets, checks, notes: chk.notes, shape: S,
  };
  if (!rs.onDrive) delete rs.onDrive;
  return rs;
}
