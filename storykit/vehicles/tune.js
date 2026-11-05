// Story Kit vehicles: from a sheet's handling adjectives and sound words to the numbers the engine reads.
//   driveTune(sheet, dims)  the car entity's numbers (engine/car/drive-model.js and player-car.js read them): pace,
//                           brakes, handling { rMin, yawMax, grip, rampIn, rampOut, vRef }, mass, the collision box and
//                           the chase camera's framing; plus springs (how the body leans, dives and squats) and tail
//                           (the rear stepping out under power, for a tail-happy car)
//   soundProfile(sheet, tune)  a profile for engine/audio/supercar.js: the recorded V8 loops through this car's own
//                           gearbox and voicing (gears, idle, red line, shift points, gain, drive, low end, wet, lope,
//                           pops, pitch)
// Every adjective is -1..1 across the family's range (classes.js RANGES), so a sheet can't leave it.
import { RANGES } from './classes.js';

const lerp = (a, b, t) => a + (b - a) * t;
const at = (r, k) => lerp(r[0], r[1], (Math.max(-1, Math.min(1, k || 0)) + 1) / 2);
const r2 = (x) => Math.round(x * 100) / 100;

// the handling characters: on top of the adjectives
const CHAR = {
  planted: { rampIn: [0.11, 0.19], rampOut: 0.08, soft: 0, tail: 0 },
  floaty: { rampIn: [0.16, 0.28], rampOut: 0.12, soft: 0.8, tail: 0 },
  'tail-happy': { rampIn: [0.1, 0.18], rampOut: 0.075, soft: -0.3, tail: 1 },
  twitchy: { rampIn: [0.07, 0.13], rampOut: 0.055, soft: -0.4, tail: 0.35 },
  tank: { rampIn: [0.2, 0.32], rampOut: 0.14, soft: 0.4, tail: 0 },
};

export function driveTune(sheet, d) {
  const H = sheet.handling, R = RANGES[sheet.family] || RANGES.car4, C = CHAR[H.character] || CHAR.planted;
  const topSpeed = at(R.topSpeed, H.pace), boostSpeed = topSpeed + at(R.boostGap, H.pull);
  const accel = at(R.accel, H.pull), boostAccel = at(R.boostAccel, H.pull);
  const mass = at(R.mass, H.weight), brakeN = at(R.brake, H.brakes);
  const grip = at(R.grip, H.grip), rMin = at(R.rMin, H.turnIn), yawMax = at(R.yawMax, H.turnIn);
  // heavier: slower to change direction; and every car with the boost ability gets its push
  const heavy = (H.weight || 0) * 0.04;
  const tune = {
    scale: 1.0,
    body: { hx: r2(d.width / 2), z0: r2(d.zR - 0.06), z1: r2(d.zF + 0.08), top: r2(d.height) }, axle: r2(d.wheelbase / 2), mass: r2(mass),
    chaseDistance: r2(2.6 + 0.67 * d.length + Math.min(1.5 * Math.max(0, d.height - 1.4), 0.9)), chaseHeight: r2(0.55 + 0.86 * d.height),
    chase: { fov: 60, pull: 0.002, kick: r2(0.7 + accel * 0.04), boostKick: r2(1.2 + (boostSpeed - topSpeed) * 0.1), vmax: r2(topSpeed), shake: r2(0.015 + Math.max(0, -C.soft) * 0.03), vtop: r2(boostSpeed + 1) },
    topSpeed: r2(topSpeed), boostSpeed: r2(boostSpeed), accel: r2(accel), boostAccel: r2(boostAccel), reverse: 0.4,
    rolling: r2(0.42 + mass * 0.05), drag: 0.0048, coast: r2(2.2 + mass * 0.08), brake: r2(brakeN), boostBrake: r2(brakeN * 1.45),
    handling: { rMin: r2(rMin), yawMax: r2(yawMax), grip: r2(grip), rampIn: [r2(C.rampIn[0] + heavy), r2(C.rampIn[1] + heavy)], rampOut: r2(C.rampOut + heavy * 0.5), vRef: r2(topSpeed) },
  };
  // the springs: soft (floaty, heavy) lean and dive more and settle slower
  const soft = Math.max(-1, Math.min(1, C.soft + (H.weight || 0) * 0.3));
  const springs = {
    rollGain: r2(lerp(0.0013, 0.0034, (soft + 1) / 2)), rollMax: r2(lerp(0.035, 0.085, (soft + 1) / 2)),
    pitchGain: r2(lerp(0.0024, 0.0036, (soft + 1) / 2) * 10000) / 10000, pitchMax: r2(lerp(0.032, 0.055, (soft + 1) / 2)),
    k: r2(lerp(72, 30, (soft + 1) / 2)), damp: r2(lerp(11.5, 6.8, (soft + 1) / 2)),
  };
  // the tail stepping out under power in a turn (yaw kick rad/s², slide m/s² at full power and lock)
  const tail = C.tail > 0 ? { yaw: r2(2.8 * C.tail), slide: r2(19 * C.tail), steerMin: 0.3, vMin: 4, vPeak: r2(topSpeed * 0.4), vSpan: 20 } : null;
  return { tune, springs, tail };
}

// the engine layouts over the one set of recorded V8 loops: each a base profile (the first two are the lifted
// engine's own: default = the supercar's seven-speed, the Trailhand's and the roadster's; v8-cammed = the Vandal GT's
// five-speed) and the boost top speed its gears were laid out for. pitch moves the loops' firing note
const BASE = {
  v8: { ref: 56, p: { idle: 850, redline: 8000, launch: 3600, upHard: 7600, upGas: 5200, upCoast: 7800, downTo: 2900, kick: 5600, gain: 1, drive: 1.6, low: 3, wet: 0.35, lope: 0, pops: 1, pitch: 1 },
    gears: [1.69, 2.75, 3.81, 4.88, 6.0, 7.25, 11.3] },
  'v8-cammed': { ref: 48, p: { idle: 760, redline: 6500, launch: 3000, upHard: 6150, upGas: 4500, upCoast: 6300, downTo: 2500, kick: 5000, gain: 1.6, drive: 2.6, low: 7, wet: 0.5, lope: 1, pops: 1.6, pitch: 1 },
    gears: [1.72, 2.85, 4.0, 5.3, 8.4] },
  v6: { ref: 50, p: { idle: 750, redline: 6800, launch: 3000, upHard: 6400, upGas: 4200, upCoast: 6600, downTo: 2400, kick: 4800, gain: 0.85, drive: 1.4, low: 1.5, wet: 0.3, lope: 0, pops: 0.5, pitch: 1.14 } },
  i4: { ref: 46, p: { idle: 800, redline: 7000, launch: 3200, upHard: 6600, upGas: 4000, upCoast: 6800, downTo: 2500, kick: 4800, gain: 0.7, drive: 1.9, low: -1, wet: 0.4, lope: 0, pops: 0.3, pitch: 1.32 } },
  v12: { ref: 58, p: { idle: 900, redline: 8500, launch: 3800, upHard: 8100, upGas: 4400, upCoast: 8300, downTo: 3000, kick: 5800, gain: 0.9, drive: 1.1, low: 1, wet: 0.2, lope: 0, pops: 0.2, pitch: 1.42 } },
  flat6: { ref: 54, p: { idle: 900, redline: 8400, launch: 3800, upHard: 8000, upGas: 5000, upCoast: 8200, downTo: 3200, kick: 5800, gain: 1.15, drive: 2.3, low: 1.5, wet: 0.45, lope: 0, pops: 1.2, pitch: 1.22 } },
  diesel: { ref: 34, p: { idle: 700, redline: 4300, launch: 1700, upHard: 3900, upGas: 2500, upCoast: 4000, downTo: 1400, kick: 3000, gain: 1.05, drive: 3.2, low: 6, wet: 0.55, lope: 0.35, pops: 0, pitch: 0.74 } },
  ev: { ref: 56, p: { idle: 850, redline: 8000, launch: 3600, upHard: 7600, upGas: 5200, upCoast: 7800, downTo: 2900, kick: 5600, gain: 0.12, drive: 0.6, low: -4, wet: 0, lope: 0, pops: 0, pitch: 1 } },
};

export function soundProfile(sheet, tune) {
  const S = sheet.sound, B = BASE[S.engine] || BASE.v8, p = { ...B.p };
  // the gearbox: the layout's own, scaled to this car's boost top speed; or, given a gear count (or for a layout with
  // no gears of its own), laid out new: the last gear's top end at the boost speed near the red line, the first a
  // quarter of it, an overdrive half again over the last
  const era = sheet.era || 2010;
  const n = S.gears || (B.gears ? 0 : era < 1980 ? 3 : era < 2000 ? 4 : era < 2012 ? 5 : 6);
  let gears;
  if (B.gears && !S.gears) gears = B.gears.map((g) => r2(g * tune.boostSpeed / B.ref));
  else {
    const last = tune.boostSpeed / (0.93 * p.redline / 1000), first = last / 4.1;
    gears = []; for (let i = 0; i < n; i++) gears.push(r2(first * Math.pow(last / first, n > 1 ? i / (n - 1) : 1)));
    gears.push(r2(last * 1.5));
  }
  // character -1..1 around the class's: quieter and smoother down, louder, rawer, more lope and crackle up
  const c = Math.max(-1, Math.min(1, S.character || 0)) - (S.engine === 'v8-cammed' ? 0.6 : 0);
  const up = (x, k) => r2(Math.max(0, x * (1 + k * c)));
  Object.assign(p, { gears, gain: up(p.gain, 0.45), drive: up(p.drive, 0.4), low: r2(p.low + 3 * c), wet: r2(Math.min(0.8, up(p.wet, 0.4))), lope: r2(Math.min(1.2, Math.max(0, p.lope + (c > 0.3 ? 0.4 * (c - 0.3) : 0)))), pops: up(p.pops, 0.7) });
  // a tired engine: a little rougher
  if (sheet.condition === 'beater') { p.drive = r2(p.drive * 1.15); p.lope = r2(Math.min(1.2, p.lope + 0.2)); }
  p.name = `sk-${S.engine}-${sheet.id}`;
  return p;
}
