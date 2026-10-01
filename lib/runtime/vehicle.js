/* GameMog vehicles: the platform's car kit (runtime v1).
 *
 * ctx.assets.car({ kind, ... }) builds a racing car for player() or rival(),
 * the way ctx.assets.cyclist builds a rider on a bicycle. Four kinds:
 *
 *   hypercar  a road-legal hypercar: cab-forward glasshouse, front pontoons,
 *             a roof intake, a shark fin and a big rear wing
 *   formula   a single-seater: open wheels, halo, multi-element wings, and
 *             the skid block that throws sparks at night
 *   stockcar  a stock car: a coupe body, a big number on the doors and the
 *             roof, a window net, a rear spoiler
 *   monster   a monster truck: 66-inch tyres on long-travel suspension, a
 *             fibreglass pickup body, a blower through the hood
 *   roadster  an open two-seat sports car: long bonnet, round lamps in the
 *             wings, a raked screen, leather in the cockpit, speedster humps
 *   van       a step van, a food truck: a tall box over a short cab, a
 *             serving window under an awning, art on its flat flanks, a
 *             figure on a spring on the roof (topper), guns (armed)
 *
 * Every car is built here from its own dimensions, as a coachbuilder would:
 * the body is lofted through cross-sections (a superellipse whose top can
 * rise into fenders), wheel arches are pressed out of it, the glasshouse is
 * a second loft, and wings are real aerofoil sections. Paint is clear-coated
 * over metallic flake, carbon has its weave, glass reflects the street, and
 * the livery (stripes, numbers, a name) is painted onto the body's own
 * surface. A driver in a helmet sits in the cockpit and turns the wheel;
 * the runtime can seat one of the library's scanned people there instead
 * (car.cockpit is where the seat, the wheel and its turn are).
 *
 * It drives like a car: wheels roll with the road and the front ones steer,
 * the body rolls out of a bend, dives under braking and squats under power,
 * a monster truck wallows on its springs, the gears climb and the exhaust
 * pops on the overrun, brake discs glow, a single-seater sparks off the
 * road, and in a crash the car spins, flips or barrel-rolls with sparks,
 * smoke and debris. The engine note (lib/runtime/vehicle.js engine()) is
 * synthesised from the same revs the gearbox shows.
 *
 * No brand's car is copied: shapes follow the class, not a manufacturer.
 */
var GameMogVehicles = (function () {
  'use strict';

  var PI = Math.PI, TAU = PI * 2;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function damp(cur, tgt, lambda, dt) { return lerp(cur, tgt, 1 - Math.exp(-lambda * dt)); }
  function smooth(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function isHex(c) { return typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c); }
  function hx(v, d) { return isHex(v) ? v : d; }
  function word(v, d, n) { return typeof v === 'string' && v.trim() ? v.trim().replace(/[<>&]/g, '').slice(0, n) : d; }

  /* ----------------------------------------------------- the four classes -- */
  // Dimensions in metres. The body is described by key stations along the
  // car (z, rear to front): half-width w, bottom yb, shoulder ys (widest),
  // deck yt, fender rise fh at fx (fraction of w) and fw wide, roundness of
  // the upper (nU) and lower (nL) section, tumble-under of the sills (tuck),
  // and whether that part of the lower body is carbon (cl: carbon line).
  var CLASSES = {
    hypercar: {
      length: 4.76, width: 2.0, wheelbase: 2.72, clearance: 0.09, mass: 1.7,
      wheels: { front: { r: 0.345, w: 0.29, x: 0.84, rim: 0.245 }, rear: { r: 0.36, w: 0.34, x: 0.8, rim: 0.255 } },
      rim: 'multi', spokes: 10, cover: false,
      body: [
        { z: -2.38, w: 0.8, yb: 0.36, ys: 0.64, yt: 0.78, fh: 0.08, fx: 0.72, fw: 0.2, nU: 2.6, nL: 2.4, tuck: 0.3, cl: 0.52 },
        { z: -2.18, w: 0.93, yb: 0.3, ys: 0.62, yt: 0.8, fh: 0.16, fx: 0.76, fw: 0.2, nU: 3, nL: 2.8, tuck: 0.3, cl: 0.4 },
        { z: -1.36, w: 1.0, yb: 0.14, ys: 0.58, yt: 0.8, fh: 0.22, fx: 0.8, fw: 0.19, nU: 3.4, nL: 3.5, tuck: 0.18, cl: 0.3 },
        { z: -0.55, w: 0.96, yb: 0.1, ys: 0.48, yt: 0.84, fh: 0.06, fx: 0.8, fw: 0.2, nU: 3.2, nL: 4, tuck: 0.14, cl: 0.3 },
        { z: 0.25, w: 0.95, yb: 0.1, ys: 0.44, yt: 0.68, fh: 0.05, fx: 0.8, fw: 0.2, nU: 3, nL: 4, tuck: 0.14, cl: 0.28 },
        { z: 0.95, w: 0.99, yb: 0.1, ys: 0.46, yt: 0.52, fh: 0.18, fx: 0.76, fw: 0.2, nU: 3, nL: 4, tuck: 0.05, cl: 0.26 },
        { z: 1.36, w: 1.0, yb: 0.12, ys: 0.46, yt: 0.46, fh: 0.22, fx: 0.75, fw: 0.19, nU: 3.2, nL: 4, cl: 0.26 },
        { z: 1.92, w: 0.96, yb: 0.13, ys: 0.36, yt: 0.34, fh: 0.16, fx: 0.72, fw: 0.2, nU: 3, nL: 3.5, cl: 0.24 },
        { z: 2.26, w: 0.86, yb: 0.13, ys: 0.26, yt: 0.25, fh: 0.06, fx: 0.7, fw: 0.2, nU: 2.6, nL: 3, cl: 0.22 },
        { z: 2.4, w: 0.62, yb: 0.15, ys: 0.2, yt: 0.2, nU: 2.2, nL: 2.4, cl: 0.21 },
      ],
      // the glasshouse: half-width wc, base yb, height h, roundness n; roof panel from rz0 to rz1
      cabin: { stations: [
        { z: -1.3, wc: 0.22, yb: 0.84, h: 0.04, n: 2.4 },
        { z: -0.7, wc: 0.5, yb: 0.8, h: 0.34, n: 2.6 },
        { z: -0.1, wc: 0.62, yb: 0.72, h: 0.46, n: 3 },
        { z: 0.38, wc: 0.64, yb: 0.64, h: 0.5, n: 3 },
        { z: 0.8, wc: 0.6, yb: 0.56, h: 0.34, n: 2.6 },
        { z: 1.1, wc: 0.48, yb: 0.5, h: 0.03, n: 2.2 },
      ], roof: [-0.55, 0.3], roofW: 0.34, glassFrom: 0.14, glassZ: [-0.42, 1.2] },
      seat: { z: 0.08, y: 0.24, x: 0.28, recline: 0.45, wheel: 'yoke' },
      lamps: 'slit', tail: 'bar', exhaust: 'centre', wing: { span: 1.84, chord: 0.4, y: 1.2, z: -2.08, elements: 2, mount: 'swan' },
      splitter: true, diffuser: 5, scoop: true, fin: true, mirrors: [0.86, 0.74, 0.79],
      roll: 0.018, pitch: 0.012, bounce: 0.006,
      engine: 'v6turbo', gears: [0, 26, 40, 54, 68, 82, 96, 112], redline: 11000, idle: 1200,
    },
    formula: {
      length: 5.5, width: 1.9, wheelbase: 3.4, clearance: 0.03, mass: 0.8,
      wheels: { front: { r: 0.36, w: 0.3, x: 0.8, rim: 0.23 }, rear: { r: 0.36, w: 0.39, x: 0.77, rim: 0.23 } },
      rim: 'multi', spokes: 12, cover: true, open: true,
      body: [
        { z: -2.32, w: 0.1, yb: 0.2, ys: 0.28, yt: 0.34, nU: 2.4, nL: 2.4, cl: 1 },
        { z: -2.0, w: 0.19, yb: 0.13, ys: 0.3, yt: 0.46, nU: 2.6, nL: 2.6, cl: 1 },
        { z: -1.55, w: 0.3, yb: 0.09, ys: 0.3, yt: 0.62, nU: 2.6, nL: 3, cl: 0.2 },
        { z: -1.05, w: 0.56, yb: 0.06, ys: 0.33, yt: 0.72, nU: 3, nL: 3.4, tuck: 0.35, cl: 0.16 },
        { z: -0.45, w: 0.8, yb: 0.05, ys: 0.4, yt: 0.72, nU: 3.4, nL: 3.4, tuck: 0.45, cl: 0.16 },
        { z: 0.05, w: 0.74, yb: 0.05, ys: 0.42, yt: 0.64, nU: 3.4, nL: 3.4, tuck: 0.42, cl: 0.16 },
        { z: 0.42, w: 0.36, yb: 0.05, ys: 0.34, yt: 0.64, nU: 2.8, nL: 3, tuck: 0.1, cl: 0.12 },
        { z: 1.05, w: 0.28, yb: 0.07, ys: 0.34, yt: 0.6, nU: 2.6, nL: 2.8, cl: 0.12 },
        { z: 1.75, w: 0.19, yb: 0.13, ys: 0.33, yt: 0.49, nU: 2.4, nL: 2.4, cl: 0.12 },
        { z: 2.35, w: 0.13, yb: 0.17, ys: 0.28, yt: 0.36, nU: 2.2, nL: 2.2, cl: 0.12 },
        { z: 2.72, w: 0.07, yb: 0.2, ys: 0.24, yt: 0.28, nU: 2, nL: 2, cl: 0.12 },
      ],
      // the engine cover and airbox behind the driver's head
      cabin: { stations: [
        { z: -1.9, wc: 0.07, yb: 0.5, h: 0.02, n: 2.2 },
        { z: -1.25, wc: 0.2, yb: 0.62, h: 0.12, n: 2.4 },
        { z: -0.55, wc: 0.3, yb: 0.66, h: 0.26, n: 2.6 },
        { z: -0.18, wc: 0.24, yb: 0.64, h: 0.36, n: 2.6 },
        { z: -0.02, wc: 0.2, yb: 0.64, h: 0.34, n: 2.4 },
      ], paint: true },
      seat: { z: 0.5, y: 0.14, x: 0, recline: 1.0, wheel: 'formula' },
      lamps: 'rain', tail: 'rain', exhaust: 'formula', wing: { span: 1.0, chord: 0.32, y: 0.92, z: -2.18, elements: 2, mount: 'pylon', beam: true },
      frontWing: { span: 1.9, z: 2.58, elements: 3 }, halo: true, floor: true, diffuser: 6, sparks: true, fin: true, mirrors: [0.5, 0.62, 0.3], airbox: true,
      roll: 0.006, pitch: 0.006, bounce: 0.003,
      engine: 'v6formula', gears: [0, 30, 45, 58, 72, 86, 100, 116, 132], redline: 12500, idle: 1600,
    },
    stockcar: {
      length: 4.92, width: 2.0, wheelbase: 2.84, clearance: 0.1, mass: 1.5,
      wheels: { front: { r: 0.355, w: 0.3, x: 0.83, rim: 0.23 }, rear: { r: 0.355, w: 0.3, x: 0.83, rim: 0.23 } },
      rim: 'stock', spokes: 5, cover: false,
      body: [
        { z: -2.46, w: 0.9, yb: 0.22, ys: 0.62, yt: 0.86, nU: 3.2, nL: 3.2, cl: 0.3 },
        { z: -2.2, w: 0.98, yb: 0.15, ys: 0.64, yt: 0.92, nU: 4, nL: 4.5, cl: 0.22 },
        { z: -1.42, w: 1.0, yb: 0.11, ys: 0.62, yt: 0.92, fh: 0.03, fx: 0.85, fw: 0.2, nU: 4.2, nL: 5, cl: 0.2 },
        { z: -0.5, w: 0.99, yb: 0.1, ys: 0.6, yt: 0.9, nU: 4.2, nL: 5, cl: 0.2 },
        { z: 0.55, w: 0.99, yb: 0.1, ys: 0.6, yt: 0.86, nU: 4.2, nL: 5, cl: 0.2 },
        { z: 1.42, w: 1.0, yb: 0.11, ys: 0.58, yt: 0.8, fh: 0.04, fx: 0.84, fw: 0.2, nU: 4, nL: 5, cl: 0.2 },
        { z: 2.1, w: 0.96, yb: 0.12, ys: 0.5, yt: 0.66, fh: 0.02, fx: 0.8, fw: 0.2, nU: 3.6, nL: 4, cl: 0.2 },
        { z: 2.4, w: 0.86, yb: 0.12, ys: 0.36, yt: 0.46, nU: 3, nL: 3, cl: 0.2 },
        { z: 2.48, w: 0.7, yb: 0.13, ys: 0.3, yt: 0.34, nU: 2.4, nL: 2.4, cl: 0.2 },
      ],
      cabin: { stations: [
        { z: -1.7, wc: 0.66, yb: 0.9, h: 0.02, n: 4 },
        { z: -1.3, wc: 0.72, yb: 0.88, h: 0.3, n: 4.2 },
        { z: -0.55, wc: 0.76, yb: 0.87, h: 0.44, n: 4.6 },
        { z: 0.2, wc: 0.76, yb: 0.86, h: 0.44, n: 4.6 },
        { z: 0.62, wc: 0.74, yb: 0.85, h: 0.3, n: 4.2 },
        { z: 1.05, wc: 0.68, yb: 0.82, h: 0.02, n: 3.8 },
      ], roof: [-1.12, 0.32], roofW: 0.64, glassFrom: 0.08, net: true },
      seat: { z: -0.3, y: 0.32, x: 0.3, recline: 0.2, wheel: 'round' },
      lamps: 'decal', tail: 'decal', exhaust: 'side', spoiler: true, splitter: true, diffuser: 0, mirrors: null,
      roll: 0.03, pitch: 0.016, bounce: 0.008,
      engine: 'v8', gears: [0, 30, 46, 60, 76, 90], redline: 9200, idle: 1100,
    },
    monster: {
      length: 5.3, width: 3.6, wheelbase: 3.1, clearance: 0.9, mass: 5,
      wheels: { front: { r: 0.84, w: 1.06, x: 1.28, rim: 0.46 }, rear: { r: 0.84, w: 1.06, x: 1.28, rim: 0.46 } },
      rim: 'beadlock', spokes: 8, cover: false, lugs: true,
      // lifted: the body rides on the chassis 1.78 m up, clear over the tyres
      lift: 1.78,
      // a pickup: tailgate and covered bed, a tall cab, a hood that rises to the blower
      body: [
        { z: -2.56, w: 1.02, yb: 0.06, ys: 0.4, yt: 0.6, nU: 6, nL: 5, cl: 0 },
        { z: -2.38, w: 1.08, yb: 0.0, ys: 0.42, yt: 0.64, nU: 8, nL: 8, cl: 0 },
        { z: -1.02, w: 1.08, yb: 0.0, ys: 0.44, yt: 0.64, nU: 8, nL: 8, cl: 0 },
        { z: -0.9, w: 1.1, yb: 0.0, ys: 0.46, yt: 0.7, nU: 8, nL: 8, cl: 0 },
        { z: 0.6, w: 1.1, yb: 0.0, ys: 0.46, yt: 0.72, nU: 8, nL: 8, cl: 0 },
        { z: 0.85, w: 1.1, yb: 0.02, ys: 0.5, yt: 0.84, nU: 7, nL: 8, cl: 0 },
        { z: 2.2, w: 1.06, yb: 0.06, ys: 0.5, yt: 0.8, nU: 6, nL: 7, cl: 0 },
        { z: 2.56, w: 0.98, yb: 0.12, ys: 0.44, yt: 0.64, nU: 4, nL: 4, cl: 0 },
      ],
      cabin: { stations: [
        { z: -0.96, wc: 0.98, yb: 0.66, h: 0.02, n: 8 },
        { z: -0.86, wc: 1.0, yb: 0.66, h: 0.86, n: 10 },
        { z: 0.22, wc: 0.99, yb: 0.7, h: 0.84, n: 10 },
        { z: 0.64, wc: 0.97, yb: 0.74, h: 0.5, n: 8 },
        { z: 0.86, wc: 0.94, yb: 0.78, h: 0.02, n: 6 },
      ], roof: [-0.75, 0.24], roofW: 0.84, glassFrom: 0.18 },
      seat: { z: -0.2, y: 0.55, x: 0.3, recline: 0.15, wheel: 'round' },
      lamps: 'truck', tail: 'truck', exhaust: 'stacks', blower: true, chassis: true, mirrors: null,
      roll: 0.07, pitch: 0.04, bounce: 0.05,
      engine: 'blower', gears: [0, 20, 34, 48, 62, 78], redline: 7600, idle: 900,
    },
  };
  // an open two-seater: the deck is cut away over a leather-lined cockpit, the
  // screen raked back over it, the wings swell over both axles
  CLASSES.roadster = {
    length: 4.38, width: 1.84, wheelbase: 2.48, clearance: 0.11, mass: 1.35,
    wheels: { front: { r: 0.33, w: 0.24, x: 0.78, rim: 0.235 }, rear: { r: 0.34, w: 0.29, x: 0.78, rim: 0.245 } },
    rim: 'multi', spokes: 5, cover: false,
    body: [
      { z: -2.19, w: 0.66, yb: 0.3, ys: 0.52, yt: 0.62, nU: 2.4, nL: 2.4, cl: 0.32 },
      { z: -2.02, w: 0.88, yb: 0.2, ys: 0.54, yt: 0.7, fh: 0.03, fx: 0.72, fw: 0.2, nU: 3, nL: 3, cl: 0.26 },
      { z: -1.5, w: 1.0, yb: 0.14, ys: 0.54, yt: 0.72, fh: 0.12, fx: 0.76, fw: 0.2, nU: 3.4, nL: 4, tuck: 0.1, cl: 0.2 },
      { z: -0.95, w: 0.99, yb: 0.13, ys: 0.52, yt: 0.74, fh: 0.07, fx: 0.76, fw: 0.2, nU: 3.4, nL: 4, tuck: 0.1, cl: 0.19 },
      { z: -0.3, w: 0.95, yb: 0.13, ys: 0.5, yt: 0.73, fh: 0.02, fx: 0.78, fw: 0.2, nU: 3.4, nL: 4, tuck: 0.1, cl: 0.19 },
      { z: 0.4, w: 0.95, yb: 0.13, ys: 0.5, yt: 0.73, fh: 0.03, fx: 0.78, fw: 0.2, nU: 3.4, nL: 4, tuck: 0.1, cl: 0.19 },
      { z: 1.0, w: 0.98, yb: 0.13, ys: 0.48, yt: 0.64, fh: 0.12, fx: 0.76, fw: 0.2, nU: 3.2, nL: 4, cl: 0.19 },
      { z: 1.6, w: 0.96, yb: 0.14, ys: 0.44, yt: 0.56, fh: 0.12, fx: 0.74, fw: 0.2, nU: 3, nL: 3.6, cl: 0.2 },
      { z: 2.02, w: 0.84, yb: 0.16, ys: 0.36, yt: 0.44, fh: 0.05, fx: 0.72, fw: 0.2, nU: 2.6, nL: 3, cl: 0.22 },
      { z: 2.19, w: 0.6, yb: 0.2, ys: 0.3, yt: 0.34, nU: 2.2, nL: 2.4, cl: 0.24 },
    ],
    // no glasshouse: the screen (its foot and top), for the car's height
    cabin: { open: true, stations: [{ z: 0.4, wc: 0.66, yb: 0.74, h: 0.02, n: 3 }, { z: 0.08, wc: 0.6, yb: 0.74, h: 0.4, n: 3 }] },
    // the cockpit cut from the deck: |x| under x, z from z0 to z1 (rounded corners)
    cockpit: { x: 0.64, z0: -0.82, z1: 0.36, floor: 0.2, belt: 0.73 },
    seat: { z: -0.34, y: 0.26, x: 0.33, recline: 0.34, wheel: 'round' },
    lamps: 'round', tail: 'round', exhaust: 'twin', splitter: false, diffuser: 0, mirrors: [0.84, 0.84, 0.46], humps: true,
    roll: 0.024, pitch: 0.014, bounce: 0.007,
    engine: 'flat6', gears: [0, 22, 36, 50, 64, 78, 92], redline: 8400, idle: 950,
  };
  // a step van: a tall box behind a short-nosed cab, the box overhanging the
  // cab's roof; the food truck's flanks are flat, so its art is painted on
  // panels of their own (a serving window and its awning on the kerb side)
  CLASSES.van = {
    length: 5.78, width: 2.24, wheelbase: 3.4, clearance: 0.2, mass: 3.2,
    wheels: { front: { r: 0.42, w: 0.27, x: 0.9, rim: 0.27 }, rear: { r: 0.42, w: 0.3, x: 0.88, rim: 0.27 } },
    rim: 'stock', spokes: 8, cover: false,
    body: [
      { z: -2.89, w: 1.06, yb: 0.46, ys: 1.5, yt: 2.78, nU: 10, nL: 8, cl: 0.5 },
      { z: -2.84, w: 1.12, yb: 0.4, ys: 1.5, yt: 2.86, nU: 12, nL: 9, cl: 0.5 },
      { z: 0.78, w: 1.12, yb: 0.4, ys: 1.5, yt: 2.86, nU: 12, nL: 9, cl: 0.5 },
      { z: 0.92, w: 1.1, yb: 0.4, ys: 1.05, yt: 1.42, nU: 7, nL: 9, cl: 0.5 },
      { z: 1.0, w: 1.1, yb: 0.4, ys: 1.05, yt: 1.42, nU: 7, nL: 9, cl: 0.5 },
      { z: 1.9, w: 1.08, yb: 0.4, ys: 1.02, yt: 1.38, nU: 7, nL: 8, cl: 0.5 },
      { z: 2.42, w: 1.02, yb: 0.42, ys: 0.95, yt: 1.24, nU: 5, nL: 6, cl: 0.5 },
      { z: 2.78, w: 0.96, yb: 0.46, ys: 0.86, yt: 1.08, nU: 4, nL: 5, cl: 0.5 },
      { z: 2.89, w: 0.86, yb: 0.5, ys: 0.8, yt: 0.98, nU: 3.4, nL: 4, cl: 0.5 },
    ],
    cabin: { stations: [
      { z: 0.84, wc: 1.06, yb: 1.36, h: 1.12, n: 12 },
      { z: 1.45, wc: 1.06, yb: 1.36, h: 1.1, n: 12 },
      { z: 1.7, wc: 1.04, yb: 1.36, h: 0.95, n: 11 },
      { z: 1.96, wc: 1.0, yb: 1.36, h: 0.5, n: 10 },
      { z: 2.12, wc: 0.96, yb: 1.34, h: 0.02, n: 8 },
    ], roof: [0.8, 1.5], roofW: 0.98, glassFrom: 0.14 },
    seat: { z: 1.25, y: 0.98, x: 0.48, recline: 0.12, wheel: 'round' },
    lamps: 'van', tail: 'van', exhaust: 'rear', splitter: false, diffuser: 0, mirrors: null, box: { z0: -2.84, z1: 0.78, top: 2.86, w: 1.12 },
    roll: 0.06, pitch: 0.035, bounce: 0.02,
    engine: 'v8', gears: [0, 16, 27, 40, 54, 68], redline: 5400, idle: 700,
  };
  CLASSES.hyper = CLASSES.hypercar; CLASSES.f1 = CLASSES.formula; CLASSES.stock = CLASSES.stockcar; CLASSES.nascar = CLASSES.stockcar; CLASSES.truck = CLASSES.monster;
  var KINDS = ['hypercar', 'formula', 'stockcar', 'monster', 'roadster', 'van'];
  // the names a world may use for each class
  var ALIAS = { hypercar: 'hypercar', hyper: 'hypercar', formula: 'formula', f1: 'formula', stockcar: 'stockcar', stock: 'stockcar', nascar: 'stockcar', monster: 'monster', truck: 'monster',
    roadster: 'roadster', convertible: 'roadster', cabrio: 'roadster', cabriolet: 'roadster', spider: 'roadster', spyder: 'roadster', speedster: 'roadster', sports: 'roadster', sportscar: 'roadster',
    van: 'van', stepvan: 'van', foodtruck: 'van', icecream: 'van', icecreamtruck: 'van' };

  /* ----------------------------------------------------- engine profiles -- */
  // cylinders fire at rpm/60 * cyl/2 per second: a V6 at 11,000 rpm sings at
  // 550 Hz, a big V8 at 7,000 rumbles at 470 with a burble at half that
  var ENGINES = {
    v6turbo: { cyl: 6, saw: 0.5, sq: 0.18, whine: 0.08, burble: 0.12, drive: 3.2, cut: [900, 5200], noise: 0.16, turbo: 0.05, hybrid: 0.05, gain: 0.85 },
    v6formula: { cyl: 6, saw: 0.55, sq: 0.12, whine: 0.12, burble: 0.06, drive: 4, cut: [1400, 7400], noise: 0.14, turbo: 0.04, hybrid: 0.07, gain: 0.8 },
    v8: { cyl: 8, saw: 0.42, sq: 0.36, whine: 0.03, burble: 0.42, drive: 5, cut: [520, 3200], noise: 0.2, turbo: 0, hybrid: 0, gain: 0.95 },
    blower: { cyl: 8, saw: 0.4, sq: 0.44, whine: 0.16, burble: 0.5, drive: 6, cut: [380, 2400], noise: 0.26, turbo: 0, hybrid: 0, gain: 1, blower: 0.06 },
    // a flat six: hard-edged, a howl near the top, a crackle when it lifts
    flat6: { cyl: 6, saw: 0.52, sq: 0.3, whine: 0.05, burble: 0.26, drive: 4.2, cut: [700, 4600], noise: 0.18, turbo: 0, hybrid: 0, gain: 0.9 },
  };

  /* ------------------------------------------------------------- the kit -- */
  function kit(THREE, H) {
    // H: { canvas(w, h, draw, opts), normal(w, h, draw, strength), quality, aniso, scene, envMap() }
    var low = H.quality === 'low';
    var V = function (x, y, z) { return new THREE.Vector3(x, y, z); };
    var _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();

    /* --- shared textures --- */
    var TEX = {};
    // carbon: a 2x2 twill, the weave in the normals and a sheen in the colour
    TEX.carbonN = H.normal(128, 128, function (g, w, h) {
      var n = 8, s = w / n;
      for (var i = 0; i < n; i++) for (var j = 0; j < n; j++) {
        var over = ((i + j) >> 1) % 2 === 0;
        var gr = g.createLinearGradient(i * s, j * s, over ? (i + 1) * s : i * s, over ? j * s : (j + 1) * s);
        gr.addColorStop(0, '#5a5a5a'); gr.addColorStop(0.5, '#d8d8d8'); gr.addColorStop(1, '#5a5a5a');
        g.fillStyle = gr; g.fillRect(i * s + 0.5, j * s + 0.5, s - 1, s - 1);
      }
    }, 1.6);
    TEX.carbonN.repeat.set(10, 10);
    // metallic flake under the clear coat: a fine glitter in the normals
    TEX.flake = H.normal(256, 256, function (g, w, h) {
      var img = g.getImageData(0, 0, w, h), d = img.data, seed = 7;
      for (var i = 0; i < d.length; i += 4) { seed = (seed * 16807) % 2147483647; var v = 128 + ((seed % 1000) / 1000 - 0.5) * 120; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
      g.putImageData(img, 0, 0);
    }, 0.9);
    TEX.flake.repeat.set(24, 12);
    // a tyre's sidewall: moulded ribs and a band of colour (a compound, or white lettering)
    function sidewall(band, text) {
      return H.canvas(1024, 64, function (g, w, h) {
        g.fillStyle = '#141416'; g.fillRect(0, 0, w, h);
        for (var i = 0; i < w; i += 4) { g.fillStyle = i % 8 ? '#18181b' : '#111113'; g.fillRect(i, 0, 2, h); }
        if (band) { g.fillStyle = band; g.fillRect(0, h * 0.34, w, h * 0.1); }
        if (text) {
          g.fillStyle = band || '#E8E6E0'; g.font = '700 30px "Arial Black", Arial, sans-serif'; g.textBaseline = 'middle';
          for (var k = 0; k < 2; k++) g.fillText(text, 60 + k * w / 2, h * 0.62, w / 2 - 140);
        }
      });
    }
    // tread: a slick is smooth; a monster truck's lugs are geometry, this is their rubber
    TEX.rubberN = H.normal(128, 128, function (g, w, h) {
      var img = g.getImageData(0, 0, w, h), d = img.data, seed = 3;
      for (var i = 0; i < d.length; i += 4) { seed = (seed * 16807) % 2147483647; var v = 128 + ((seed % 1000) / 1000 - 0.5) * 40; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
      g.putImageData(img, 0, 0);
    }, 0.6);
    // a soft round shadow under a car: it sits the car on the road whatever the lights do
    TEX.contact = H.canvas(128, 256, function (g, w, h) {
      var r = g.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2);
      r.addColorStop(0, 'rgba(0,0,0,0.9)'); r.addColorStop(0.55, 'rgba(0,0,0,0.6)'); r.addColorStop(1, 'rgba(0,0,0,0)');
      g.save(); g.scale(1, h / w); g.fillStyle = r; g.fillRect(0, 0, w, w); g.restore();
    });
    TEX.contact.wrapS = TEX.contact.wrapT = THREE.ClampToEdgeWrapping;
    // a spinning wheel's blur: the spokes smeared into a ring
    TEX.spin = H.canvas(128, 128, function (g, w, h) {
      var r = g.createRadialGradient(w / 2, h / 2, 6, w / 2, h / 2, w / 2);
      r.addColorStop(0, 'rgba(200,204,210,0.95)'); r.addColorStop(0.2, 'rgba(160,165,172,0.7)'); r.addColorStop(0.72, 'rgba(120,124,130,0.55)'); r.addColorStop(0.92, 'rgba(180,184,190,0.8)'); r.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = r; g.fillRect(0, 0, w, h);
    });
    TEX.spin.wrapS = TEX.spin.wrapT = THREE.ClampToEdgeWrapping;
    // a window net: black webbing, see-through between
    TEX.net = H.canvas(128, 128, function (g, w, h) {
      g.clearRect(0, 0, w, h); g.strokeStyle = 'rgba(12,12,14,1)'; g.lineWidth = 7;
      for (var i = -w; i < w * 2; i += 26) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h, h); g.stroke(); g.beginPath(); g.moveTo(i, h); g.lineTo(i + h, 0); g.stroke(); }
    });
    TEX.net.repeat.set(3, 2);
    // a glow for lamps and flames
    TEX.glow = H.canvas(64, 64, function (g, w, h) {
      var r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.3, 'rgba(255,255,255,0.5)'); r.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = r; g.fillRect(0, 0, w, h);
    });
    TEX.glow.wrapS = TEX.glow.wrapT = THREE.ClampToEdgeWrapping;

    /* --- shared materials --- */
    var MAT = {
      carbon: new THREE.MeshPhysicalMaterial({ color: '#17181B', roughness: 0.34, metalness: 0.25, clearcoat: 1, clearcoatRoughness: 0.06, normalMap: TEX.carbonN, normalScale: new THREE.Vector2(0.35, 0.35) }),
      satin: new THREE.MeshStandardMaterial({ color: '#0E0F11', roughness: 0.6, metalness: 0.2 }),
      interior: new THREE.MeshStandardMaterial({ color: '#08090A', roughness: 0.9, metalness: 0 }),
      chrome: new THREE.MeshStandardMaterial({ color: '#D3D6DB', roughness: 0.12, metalness: 1 }),
      steel: new THREE.MeshStandardMaterial({ color: '#8C9097', roughness: 0.35, metalness: 1 }),
      rubber: new THREE.MeshStandardMaterial({ color: '#141416', roughness: 0.88, metalness: 0, normalMap: TEX.rubberN, normalScale: new THREE.Vector2(0.4, 0.4) }),
      tread: new THREE.MeshStandardMaterial({ color: '#1A1A1C', roughness: 0.78, metalness: 0 }),
      disc: new THREE.MeshStandardMaterial({ color: '#3A3B3F', roughness: 0.55, metalness: 0.7, emissive: '#FF4A10', emissiveIntensity: 0 }),
      intake: new THREE.MeshBasicMaterial({ color: '#030304' }),
      spin: new THREE.MeshBasicMaterial({ map: TEX.spin, transparent: true, depthWrite: false, opacity: 0 }),
      net: new THREE.MeshStandardMaterial({ map: TEX.net, alphaTest: 0.5, color: '#FFFFFF', roughness: 0.8, side: THREE.DoubleSide }),
      contact: new THREE.MeshBasicMaterial({ map: TEX.contact, transparent: true, depthWrite: false, opacity: 0.8, color: '#000000', polygonOffset: true, polygonOffsetFactor: -2 }),
    };
    MAT.contact.userData.gmNoEnv = true;
    // lamps are brighter than white, so the renderer's bloom catches them
    function lampMat(hex, k) { var m = new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k), toneMapped: true }); m.userData.base = new THREE.Color(hex); m.userData.k = k; return m; }
    // tinted glass whose reflections stay bright while the cabin shows through
    function glassMat(tint, alpha) {
      var m = new THREE.MeshPhysicalMaterial({ color: tint || '#0A0D12', roughness: 0.03, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.02, transparent: true, opacity: alpha, envMapIntensity: 1.6 });
      m.blending = THREE.CustomBlending; m.blendSrc = THREE.OneFactor; m.blendDst = THREE.OneMinusSrcAlphaFactor; m.depthWrite = false;
      return m;
    }
    MAT.glass = glassMat('#0A0D12', 0.62);
    MAT.visor = glassMat('#050608', 0.9);
    MAT.lens = glassMat('#101216', 0.35);
    MAT.screen = glassMat('#0A0D12', 0.2);

    /* --- geometry helpers --- */
    // merge geometries sharing one material into one (positions, normals, uvs)
    function merge(list) {
      var n = 0; list.forEach(function (g) { n += (g.index ? g.index.count : g.attributes.position.count); });
      var pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), o = 0;
      list.forEach(function (g) {
        if (g.index) g = g.toNonIndexed();
        if (!g.attributes.normal) g.computeVertexNormals();
        var c = g.attributes.position.count;
        pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3);
        if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
        o += c;
      });
      var geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      return geo;
    }
    // a bin of parts by material: add(geometry, material), then meshes()
    function Bin() { this.by = new Map(); }
    Bin.prototype.add = function (g, m) { if (!this.by.has(m)) this.by.set(m, []); this.by.get(m).push(g); return g; };
    Bin.prototype.meshes = function (parent, shadow) {
      this.by.forEach(function (list, m) { var mesh = new THREE.Mesh(merge(list), m); mesh.castShadow = shadow !== false && !m.transparent; mesh.receiveShadow = true; parent.add(mesh); });
      this.by.clear();
    };
    function tube(a, b, r, sides) {
      var len = a.distanceTo(b), g = new THREE.CylinderGeometry(r, r, len, sides || 8, 1, false);
      _q.setFromUnitVectors(_v.set(0, 1, 0), _v2.subVectors(b, a).normalize());
      g.applyQuaternion(_q); g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
      return g;
    }
    function sweep(points, r, segs, radial) { return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), segs || 20, r, radial || 8, false); }
    function box(w, h, d, x, y, z) { return new THREE.BoxGeometry(w, h, d).translate(x || 0, y || 0, z || 0); }
    // an aerofoil (a cambered, thick-nosed section) extruded across the car:
    // chord along z, from x0 to x1, its leading edge at (y, z), angle of attack aoa
    function aerofoil(chord, x0, x1, y, z, aoa, thick) {
      var sh = new THREE.Shape(), n = 16, t = thick || 0.11, top = [], bot = [];
      for (var i = 0; i <= n; i++) {
        var u = 1 - Math.cos(i / n * PI / 2 * 2) * 0.5 - 0.5; // cosine spacing
        var yt = 5 * t * (0.2969 * Math.sqrt(u) - 0.126 * u - 0.3516 * u * u + 0.2843 * u * u * u - 0.1036 * u * u * u * u);
        var camber = 0.06 * (u < 0.4 ? (2 * 0.4 * u - u * u) / 0.16 : ((1 - 0.8) + 2 * 0.4 * u - u * u) / 0.36);
        top.push([u, camber + yt]); bot.push([u, camber - yt]);
      }
      // the section lies in (z, y): leading edge forward (+z), cambered downward (a wing pushes down)
      // an inverted section (a wing that presses the car down): drawn with the
      // chord along the shape's x, turned so the chord runs back from the leading edge
      sh.moveTo(0, 0);
      for (i = 0; i <= n; i++) sh.lineTo(top[i][0] * chord, -top[i][1] * chord);
      for (i = n; i >= 0; i--) sh.lineTo(bot[i][0] * chord, -bot[i][1] * chord);
      var g = new THREE.ExtrudeGeometry(sh, { depth: x1 - x0, bevelEnabled: false, curveSegments: 1 });
      // (x, y, z) -> (z, y, -x): the extrusion runs across the car, the chord toward -z
      g.rotateY(PI / 2); g.translate(x0, 0, 0);
      // angle of attack: the trailing edge rises
      g.rotateX(aoa || 0); g.translate(0, y, z);
      return g;
    }

    /* --- the loft: a body through its cross-sections --- */
    function interp(keys, z, name, def) {
      // smooth (Catmull-Rom) through the key stations' values of one parameter
      var n = keys.length;
      if (z <= keys[0].z) return keys[0][name] != null ? keys[0][name] : def;
      if (z >= keys[n - 1].z) return keys[n - 1][name] != null ? keys[n - 1][name] : def;
      var i = 0; while (i < n - 2 && keys[i + 1].z < z) i++;
      var p = function (k) { k = clamp(k, 0, n - 1); return keys[k][name] != null ? keys[k][name] : def; };
      var t = (z - keys[i].z) / (keys[i + 1].z - keys[i].z);
      var p0 = p(i - 1), p1 = p(i), p2 = p(i + 1), p3 = p(i + 2);
      var t2 = t * t, t3 = t2 * t;
      var v = 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
      var lo = Math.min(p1, p2), hi = Math.max(p1, p2), span = hi - lo;
      return clamp(v, lo - span * 0.25 - 0.01, hi + span * 0.25 + 0.01);
    }
    function spow(v, e) { return (v < 0 ? -1 : 1) * Math.pow(Math.abs(v), e); }
    // the body's section at z: a closed ring of M points, starting at the
    // bottom centre, rising up the left side (+x), over the top, down the right
    function section(C, z, M, arches, out) {
      var B = C.body, lift = C.lift || 0;
      var w = interp(B, z, 'w', 1), yb = interp(B, z, 'yb', 0.1), ys = interp(B, z, 'ys', 0.5), yt = interp(B, z, 'yt', 0.8);
      var fh = interp(B, z, 'fh', 0), fx = interp(B, z, 'fx', 0.75), fw = interp(B, z, 'fw', 0.2);
      var nU = interp(B, z, 'nU', 3), nL = interp(B, z, 'nL', 3), tuck = interp(B, z, 'tuck', 0);
      for (var i = 0; i <= M; i++) {
        var t = i / M * TAU, a = t - PI / 2, c = Math.cos(a), s = Math.sin(a), x, y;
        if (s >= 0) {
          var u = spow(c, 2 / nU), v = Math.pow(s, 2 / nU);
          x = u * w;
          var deck = yt + fh * Math.exp(-Math.pow((Math.abs(u) - fx) / fw, 2));
          y = ys + v * (deck - ys);
        } else {
          var ul = spow(c, 2 / nL), vl = Math.pow(-s, 2 / nL);
          x = ul * w * (1 - tuck * vl);
          y = ys - vl * (ys - yb);
        }
        y += lift;
        // wheel arches: points inside a wheel's opening are pressed out to its rim
        // (outboard of the wheel's inner face, the body starts above the arch's curve)
        for (var k = 0; k < arches.length; k++) {
          var A = arches[k], dz = z - A.z;
          if (Math.abs(x) < A.xIn || Math.abs(dz) >= A.r) continue;
          var ya = A.y + Math.sqrt(A.r * A.r - dz * dz);
          if (y < ya) y = ya;
        }
        out[i * 2] = x; out[i * 2 + 1] = y;
      }
      return out;
    }
    // an open car's cockpit: the deck inside a rounded rectangle is cut away
    function inCockpit(K, x, y, z) {
      var zm = (K.z0 + K.z1) / 2, hz = (K.z1 - K.z0) / 2;
      return y > K.belt - 0.1 && Math.pow(Math.abs(x) / K.x, 4) + Math.pow(Math.abs(z - zm) / hz, 4) < 1;
    }
    function cockpitRim(K, n, inset) {
      var zm = (K.z0 + K.z1) / 2, hz = (K.z1 - K.z0) / 2, pts = [];
      for (var i = 0; i < n; i++) { var t = i / n * TAU, c = Math.cos(t), s = Math.sin(t); pts.push([spow(c, 0.5) * (K.x - inset), zm + spow(s, 0.5) * (hz - inset)]); }
      return pts;
    }
    function loftBody(C, arches, opts) {
      var M = opts.M || (low ? 40 : 64), N = opts.N || (low ? 44 : 72), B = C.body;
      var z0 = B[0].z, z1 = B[B.length - 1].z;
      var ring = new Float32Array((M + 1) * 2), pos = [], uvs = [], idx = { paint: [], carbon: [] };
      for (var j = 0; j <= N; j++) {
        // more stations near the ends, where the body turns fastest
        var u = j / N, zz = z0 + (z1 - z0) * (0.5 - 0.5 * Math.cos(u * PI));
        section(C, zz, M, arches, ring);
        for (var i = 0; i <= M; i++) { pos.push(ring[i * 2], ring[i * 2 + 1], zz); uvs.push((zz - z0) / (z1 - z0), i / M); }
      }
      var cl = function (z) { return interp(B, z, 'cl', 0) + (C.lift || 0); };
      for (j = 0; j < N; j++) for (i = 0; i < M; i++) {
        var a = j * (M + 1) + i, b = a + 1, c = a + (M + 1), d = c + 1;
        var yc = (pos[a * 3 + 1] + pos[b * 3 + 1] + pos[c * 3 + 1] + pos[d * 3 + 1]) / 4, zc = (pos[a * 3 + 2] + pos[c * 3 + 2]) / 2;
        if (C.cockpit && inCockpit(C.cockpit, (pos[a * 3] + pos[d * 3]) / 2, yc - (C.lift || 0), zc)) continue;
        (yc < cl(zc) ? idx.carbon : idx.paint).push(a, b, c, b, d, c);
      }
      // end caps
      var base = pos.length / 3;
      [0, N].forEach(function (jj, e) {
        var cx = 0, cy = 0, zc = pos[(jj * (M + 1)) * 3 + 2];
        for (i = 0; i < M; i++) { cx += pos[(jj * (M + 1) + i) * 3]; cy += pos[(jj * (M + 1) + i) * 3 + 1]; }
        pos.push(cx / M, cy / M, zc); uvs.push(e ? 1 : 0, 0.5);
        var ci = pos.length / 3 - 1;
        for (i = 0; i < M; i++) { var p0 = jj * (M + 1) + i, p1 = p0 + 1; idx.paint.push.apply(idx.paint, e ? [ci, p0, p1] : [ci, p1, p0]); }
      });
      void base;
      return build(pos, uvs, idx);
    }
    // the glasshouse (or engine cover): a dome over the deck, open underneath
    function loftCabin(C, opts) {
      var S = C.cabin.stations, M = low ? 20 : 32, N = low ? 18 : 30, lift = C.lift || 0;
      var z0 = S[0].z, z1 = S[S.length - 1].z, pos = [], uvs = [], idx = { paint: [], glass: [] };
      for (var j = 0; j <= N; j++) {
        var u = j / N, zz = z0 + (z1 - z0) * (0.5 - 0.5 * Math.cos(u * PI));
        var wc = interp(S, zz, 'wc', 0.5), yb = interp(S, zz, 'yb', 0.8) + lift, h = interp(S, zz, 'h', 0.4), n = interp(S, zz, 'n', 3);
        for (var i = 0; i <= M; i++) {
          var a = i / M * PI, c = Math.cos(a), s = Math.sin(a);
          // a little below the deck at the sides, so the seam never shows
          pos.push(spow(c, 2 / n) * wc, yb - 0.04 + Math.pow(s, 2 / n) * (h + 0.04), zz); uvs.push(u, i / M);
        }
      }
      var cab = C.cabin;
      for (j = 0; j < N; j++) for (i = 0; i < M; i++) {
        var A = j * (M + 1) + i, Bq = A + 1, Cq = A + (M + 1), D = Cq + 1;
        var xc = (pos[A * 3] + pos[D * 3]) / 2, yc = (pos[A * 3 + 1] + pos[D * 3 + 1]) / 2, zc = (pos[A * 3 + 2] + pos[D * 3 + 2]) / 2;
        var ybz = interp(S, zc, 'yb', 0.8) + lift, hz = interp(S, zc, 'h', 0.4);
        var glass = !cab.paint && yc > ybz + hz * (cab.glassFrom || 0.1) && !(cab.roof && zc > cab.roof[0] && zc < cab.roof[1] && Math.abs(xc) < cab.roofW) && hz > 0.1 && (!cab.glassZ || (zc > cab.glassZ[0] && zc < cab.glassZ[1]));
        (glass ? idx.glass : idx.paint).push(A, Bq, Cq, Bq, D, Cq);
      }
      return build(pos, uvs, idx);
    }
    // one BufferGeometry with a group for each material slot, in a fixed order
    function build(pos, uvs, idx) {
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      var all = [], names = Object.keys(idx), at = 0;
      names.forEach(function (k, m) { g.addGroup(at, idx[k].length, m); at += idx[k].length; all = all.concat(idx[k]); });
      g.setIndex(all); g.computeVertexNormals();
      g.userData.slots = names;
      return g;
    }

    /* --- wheels --- */
    // a tyre turned from its profile (rim bead, bulging sidewall, rounded
    // shoulder, flat tread) and a rim: spokes, a dished barrel, a centre nut
    var WHEELS = {};
    function wheelGeos(spec, style, spokes, lugs) {
      var key = [spec.r, spec.w, spec.rim, style, spokes, lugs].join(':');
      if (WHEELS[key]) return WHEELS[key];
      var r = spec.r, w = spec.w, rr = spec.rim, hw = w / 2, seg = low ? 28 : 48;
      // the tyre profile in (radius, axial), from the inner bead round to the outer
      var prof = [], sh = Math.min(0.05, w * 0.12);
      prof.push(new THREE.Vector2(rr, -hw * 0.82));
      prof.push(new THREE.Vector2(lerp(rr, r, 0.45), -hw * 1.02));
      prof.push(new THREE.Vector2(r - sh, -hw * 0.99));
      for (var i = 0; i <= 6; i++) { var a = PI / 2 * i / 6; prof.push(new THREE.Vector2(r - sh + Math.sin(a) * sh, -hw + sh - Math.cos(a) * sh)); }
      for (i = 0; i <= 6; i++) { var b = PI / 2 * i / 6; prof.push(new THREE.Vector2(r - sh + Math.cos(b) * sh, hw - sh + Math.sin(b) * sh)); }
      prof.push(new THREE.Vector2(r - sh, hw * 0.99));
      prof.push(new THREE.Vector2(lerp(rr, r, 0.45), hw * 1.02));
      prof.push(new THREE.Vector2(rr, hw * 0.82));
      var tyre = new THREE.LatheGeometry(prof, seg);
      // lathe turns about y: lay it on its side so it rolls about x
      tyre.rotateZ(PI / 2);
      var lug = null;
      if (lugs) {
        // chevron lugs, the monster truck's paddles
        var L = [], n = 22;
        for (i = 0; i < n; i++) {
          var ang = i / n * TAU;
          [-1, 1].forEach(function (sd) {
            var g = new THREE.BoxGeometry(hw * 0.95, 0.07, 0.18);
            g.translate(sd * hw * 0.5, 0, 0); g.rotateY(sd * 0.35);
            g.translate(0, r + 0.02, 0); g.rotateX(ang + (sd > 0 ? 0.07 : 0));
            L.push(g);
          });
        }
        lug = merge(L);
      }
      // the rim
      var R = [], dish = style === 'beadlock' ? 0.1 : 0.05, face = hw * 0.75;
      R.push(new THREE.CylinderGeometry(rr, rr, w * 0.8, seg, 1, true).rotateZ(PI / 2));                        // barrel
      R.push(new THREE.RingGeometry(rr * 0.9, rr * 1.02, seg).rotateY(PI / 2).translate(face, 0, 0));          // outer lip
      if (style === 'beadlock') {
        R.push(new THREE.TorusGeometry(rr * 0.95, 0.03, 6, seg).rotateY(PI / 2).translate(face + 0.02, 0, 0));
        for (i = 0; i < 24; i++) { var ba = i / 24 * TAU; R.push(box(0.03, 0.03, 0.03, face + 0.04, Math.cos(ba) * rr * 0.95, Math.sin(ba) * rr * 0.95)); }
      }
      var hub = style === 'stock' ? 0.07 : 0.06;
      R.push(new THREE.CylinderGeometry(hub * 1.3, hub * 1.6, 0.06, 16).rotateZ(PI / 2).translate(face - dish + 0.02, 0, 0));   // centre
      R.push(new THREE.CylinderGeometry(hub * 0.7, hub * 0.8, 0.07, 6).rotateZ(PI / 2).translate(face - dish + 0.06, 0, 0));    // the nut
      var ns = spokes || 10, sw = style === 'stock' ? 0.06 : style === 'beadlock' ? 0.07 : 0.028;
      for (i = 0; i < ns; i++) {
        var sa = i / ns * TAU, c = Math.cos(sa), s = Math.sin(sa);
        var inner = V(face - dish, c * hub * 1.3, s * hub * 1.3), outer = V(face - 0.01, c * rr * 0.93, s * rr * 0.93);
        var sp = tube(inner, outer, sw, 5); sp.scale(style === 'stock' ? 0.5 : 0.7, 1, 1); R.push(sp);
        if (style === 'multi') { var s2 = sa + PI / ns * 0.34; R.push(tube(V(face - dish, Math.cos(s2) * hub * 1.3, Math.sin(s2) * hub * 1.3), V(face - 0.01, Math.cos(s2 + 0.09) * rr * 0.93, Math.sin(s2 + 0.09) * rr * 0.93), sw * 0.8, 5)); }
      }
      var rim = merge(R);
      // brake disc and caliper, just inside the spokes
      var disc = new THREE.CylinderGeometry(rr * 0.8, rr * 0.8, 0.034, seg, 1, false).rotateZ(PI / 2).translate(face - dish - 0.06, 0, 0);
      var cal = new THREE.BoxGeometry(0.06, rr * 0.5, 0.14).translate(face - dish - 0.07, rr * 0.55, -rr * 0.1);
      var blur = new THREE.CircleGeometry(rr * 0.98, 32).rotateY(PI / 2).translate(face + 0.012, 0, 0);
      var cover = new THREE.CircleGeometry(rr * 0.99, 40).rotateY(PI / 2).translate(face + 0.008, 0, 0);
      WHEELS[key] = { tyre: tyre, lug: lug, rim: rim, disc: disc, cal: cal, blur: blur, cover: cover };
      return WHEELS[key];
    }
    function wheel(spec, C, look, side) {
      var G = wheelGeos(spec, C.rim, C.spokes, C.lugs);
      var steer = new THREE.Group(), spin = new THREE.Group(), fixed = new THREE.Group();
      steer.add(spin); steer.add(fixed);
      var tyre = new THREE.Mesh(G.tyre, look.sidewall);
      spin.add(tyre);
      if (G.lug) spin.add(new THREE.Mesh(G.lug, MAT.tread));
      var rim = new THREE.Mesh(G.rim, look.rim); spin.add(rim);
      var disc = new THREE.Mesh(G.disc, look.disc); spin.add(disc);
      var blur = new THREE.Mesh(G.blur, MAT.spin); blur.renderOrder = 2; fixed.add(blur);
      var cal = new THREE.Mesh(G.cal, look.caliper); fixed.add(cal);
      if (C.cover && look.cover) { var cv = new THREE.Mesh(G.cover, look.cover); spin.add(cv); }
      [tyre, rim].forEach(function (m) { m.castShadow = true; m.receiveShadow = true; });
      // every wheel is modelled as a left-hand one (face toward +x): mirror the right ones
      if (side < 0) steer.scale.x = -1;
      return { group: steer, spin: spin, r: spec.r, blur: blur, spokes: rim };
    }

    /* --- a food truck's art, drawn on its panels --- */
    // polka dots on a staggered grid, a touch irregular, as if hand-painted
    function dots(g, w, h, color, r, seed) {
      var s = seed || 11, step = r * 3.2;
      function rnd() { s = (s * 16807) % 2147483647; return s / 2147483647; }
      g.fillStyle = color;
      for (var row = 0, y = r * 0.6; y < h + r; row++, y += step * 0.87)
        for (var x = (row % 2) * step / 2; x < w + r; x += step) { g.beginPath(); g.arc(x + (rnd() - 0.5) * r * 0.35, y + (rnd() - 0.5) * r * 0.35, r * (0.88 + rnd() * 0.24), 0, TAU); g.fill(); }
    }
    function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
    // an ice-cream cone, cartoon style: a waffle cone, three swirls of soft serve, a cherry, sprinkles
    function drawCone(g, cx, cy, size) {
      var s = size, ink = '#3A1B2A';
      g.save(); g.translate(cx, cy); g.lineJoin = 'round'; g.lineCap = 'round';
      // the waffle cone
      g.beginPath(); g.moveTo(-s * 0.2, -s * 0.02); g.lineTo(s * 0.2, -s * 0.02); g.lineTo(0, s * 0.48); g.closePath();
      g.fillStyle = '#E3A857'; g.fill(); g.save(); g.clip();
      g.strokeStyle = '#B97A2E'; g.lineWidth = s * 0.012;
      for (var k = -6; k <= 6; k++) { g.beginPath(); g.moveTo(k * s * 0.06 - s * 0.3, -s * 0.05); g.lineTo(k * s * 0.06 + s * 0.3, s * 0.55); g.stroke(); g.beginPath(); g.moveTo(k * s * 0.06 + s * 0.3, -s * 0.05); g.lineTo(k * s * 0.06 - s * 0.3, s * 0.55); g.stroke(); }
      g.restore();
      g.strokeStyle = ink; g.lineWidth = s * 0.025; g.beginPath(); g.moveTo(-s * 0.2, -s * 0.02); g.lineTo(s * 0.2, -s * 0.02); g.lineTo(0, s * 0.48); g.closePath(); g.stroke();
      // the soft serve: three tiers, each a rounded blob with a highlight
      [[0, -0.07, 0.25, 0.11], [0.01, -0.19, 0.19, 0.095], [0.02, -0.29, 0.12, 0.08]].forEach(function (b) {
        g.beginPath(); g.ellipse(b[0] * s, b[1] * s, b[2] * s, b[3] * s, 0, 0, TAU); g.fillStyle = '#FFC2D9'; g.fill(); g.lineWidth = s * 0.022; g.strokeStyle = ink; g.stroke();
        g.beginPath(); g.ellipse(b[0] * s - b[2] * s * 0.3, b[1] * s - b[3] * s * 0.3, b[2] * s * 0.45, b[3] * s * 0.28, -0.2, 0, TAU); g.fillStyle = 'rgba(255,255,255,.55)'; g.fill();
      });
      g.beginPath(); g.moveTo(s * 0.0, -s * 0.36); g.quadraticCurveTo(s * 0.08, -s * 0.44, s * 0.13, -s * 0.4); g.lineWidth = s * 0.05; g.strokeStyle = ink; g.stroke(); g.lineWidth = s * 0.03; g.strokeStyle = '#FFC2D9'; g.stroke();
      // the cherry and its stem
      g.beginPath(); g.moveTo(-s * 0.02, -s * 0.37); g.quadraticCurveTo(-s * 0.02, -s * 0.47, s * 0.04, -s * 0.5); g.lineWidth = s * 0.014; g.strokeStyle = '#3B5A1E'; g.stroke();
      g.beginPath(); g.arc(-s * 0.035, -s * 0.355, s * 0.05, 0, TAU); g.fillStyle = '#D3102E'; g.fill(); g.lineWidth = s * 0.018; g.strokeStyle = ink; g.stroke();
      g.beginPath(); g.arc(-s * 0.05, -s * 0.37, s * 0.014, 0, TAU); g.fillStyle = 'rgba(255,255,255,.8)'; g.fill();
      // sprinkles
      var cols = ['#FF3B6B', '#FFD23F', '#3BCEAC', '#4D7CFE', '#A55EEA', '#FFFFFF'], sd = 5;
      for (var n = 0; n < 26; n++) {
        sd = (sd * 16807) % 2147483647; var a = sd / 2147483647; sd = (sd * 16807) % 2147483647; var b2 = sd / 2147483647;
        var tier = n % 3, T = [[0, -0.07, 0.22, 0.09], [0.01, -0.19, 0.16, 0.075], [0.02, -0.29, 0.1, 0.06]][tier];
        var px = (T[0] + (a - 0.5) * 2 * T[2] * 0.8) * s, py = (T[1] + (b2 - 0.5) * 2 * T[3] * 0.6) * s;
        g.save(); g.translate(px, py); g.rotate(a * 6); g.fillStyle = cols[n % cols.length]; rr(g, -s * 0.016, -s * 0.005, s * 0.032, s * 0.01, s * 0.005); g.fill(); g.restore();
      }
      g.restore();
    }

    /* --- the livery, painted on the body's own surface --- */
    // the body's uv: u runs rear (0) to front (1), v round the section from the
    // bottom centre (0) up the left side (0.25), over the roof (0.5) and down
    // the right (0.75). A decal on a side is drawn mirrored or turned to read.
    function livery(C, L) {
      var W = low ? 1024 : 2048, Hh = low ? 512 : 1024;
      return H.canvas(W, Hh, function (g, w, h) {
        g.fillStyle = L.paint; g.fillRect(0, 0, w, h);
        var len = C.length, z0 = C.body[0].z;
        function U(z) { return (z - z0) / len * w; }
        // canvas y for a height band on a side, in texture v; top of canvas is v = 1
        function Y(v) { return (1 - v) * h; }
        var pat = L.pattern;
        g.save();
        if (pat === 'stripes') {
          // twin racing stripes nose to tail over the top
          g.fillStyle = L.trim; g.fillRect(0, Y(0.535), w, h * 0.025); g.fillRect(0, Y(0.49), w, h * 0.025);
        } else if (pat === 'arrow') {
          // a sweep from the nose back along both flanks, the classic dart
          g.fillStyle = L.trim;
          [0.24, 0.76].forEach(function (vc) { g.beginPath(); g.moveTo(w, Y(vc + 0.04)); g.lineTo(w * 0.25, Y(vc + 0.012)); g.lineTo(w * 0.25, Y(vc - 0.012)); g.lineTo(w, Y(vc - 0.04)); g.fill(); });
          g.fillStyle = L.accent; g.fillRect(w * 0.84, Y(0.54), w * 0.16, h * 0.08);
        } else if (pat === 'split') {
          g.fillStyle = L.trim; g.fillRect(0, 0, w * 0.46, h);
          g.fillStyle = L.accent; g.fillRect(w * 0.44, 0, w * 0.035, h);
        } else if (pat === 'flames') {
          // flames licking back from the nose along both flanks
          [0.24, 0.76].forEach(function (vc) {
            for (var k = 0; k < 7; k++) {
              var yy = Y(vc + (k - 3) * 0.022), len2 = w * (0.3 + 0.25 * Math.sin(k * 1.7 + 1) * Math.sin(k * 1.7 + 1));
              var gr = g.createLinearGradient(w, 0, w - len2, 0); gr.addColorStop(0, L.accent); gr.addColorStop(0.5, L.trim); gr.addColorStop(1, 'rgba(0,0,0,0)');
              g.fillStyle = gr; g.beginPath(); g.moveTo(w, yy - h * 0.02); g.quadraticCurveTo(w - len2 * 0.6, yy - h * 0.03, w - len2, yy); g.quadraticCurveTo(w - len2 * 0.55, yy + h * 0.012, w, yy + h * 0.02); g.fill();
            }
          });
        } else if (pat === 'teeth') {
          // a shark's grin along the lower flanks and the nose
          [0.2, 0.8].forEach(function (vc) {
            g.fillStyle = '#FFFFFF';
            for (var k = 0; k < 14; k++) { var x0 = w * (0.62 + k * 0.026); g.beginPath(); g.moveTo(x0, Y(vc)); g.lineTo(x0 + w * 0.013, Y(vc + (vc < 0.5 ? 0.05 : -0.05))); g.lineTo(x0 + w * 0.026, Y(vc)); g.fill(); }
          });
          g.fillStyle = L.trim; g.fillRect(0, Y(0.3), w, h * 0.02); g.fillRect(0, Y(0.72), w, h * 0.02);
        } else if (pat === 'bands') {
          g.fillStyle = L.trim; g.fillRect(0, Y(0.3), w, h * 0.06); g.fillRect(0, Y(0.76), w, h * 0.06);
          g.fillStyle = L.accent; g.fillRect(0, Y(0.315), w, h * 0.012); g.fillRect(0, Y(0.745), w, h * 0.012);
        } else if (pat === 'dots' && C.kind !== 'van') {
          // polka dots all over (a van's are on its panels)
          dots(g, w, h, L.accent, h * 0.035);
        }
        // a van: the skirt below its panels in the trim, a pinstripe at the top of it
        if (C.kind === 'van') {
          g.fillStyle = L.trim; g.fillRect(0, Y(0.247), w, h * 0.247 + 2); g.fillRect(0, 0, w, Y(0.753) + 1);
          g.fillStyle = L.accent; g.fillRect(0, Y(0.253), w, h * 0.004); g.fillRect(0, Y(0.751), w, h * 0.004);
        }
        g.restore();
        // a thin pinstripe along the shoulders
        if (L.pinstripe) { g.fillStyle = L.accent; g.fillRect(0, Y(0.262), w, Math.max(2, h * 0.005)); g.fillRect(0, Y(0.742), w, Math.max(2, h * 0.005)); }
        // the number: on both doors and on the roof (or the nose of a single-seater)
        var num = C.kind === 'van' ? '' : L.number;
        if (num) {
          var doorZ = C.kind === 'formula' ? -0.7 : C.kind === 'monster' ? -1.4 : -0.2;
          var fs = C.kind === 'stockcar' ? h * 0.15 : C.kind === 'formula' ? h * 0.08 : h * 0.1;
          var sideV = C.kind === 'stockcar' ? 0.215 : C.kind === 'formula' ? 0.25 : 0.2;
          [[sideV, true], [1 - sideV, false]].forEach(function (d) {
            g.save(); g.translate(U(doorZ), Y(d[0]));
            // left side reads mirrored in u; the right side runs upside down in v
            if (d[1]) g.scale(-1, 1); else g.scale(1, -1);
            if (C.kind === 'stockcar') { g.fillStyle = L.numberBg || '#F4F4F2'; g.beginPath(); g.ellipse(0, 0, fs * 0.95, fs * 0.8, 0, 0, TAU); g.fill(); }
            g.font = '900 ' + Math.round(fs) + 'px "Arial Black", "Helvetica Neue", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
            g.lineWidth = fs * 0.08; g.strokeStyle = L.numberEdge || '#101010'; g.strokeText(num, 0, fs * 0.04);
            g.fillStyle = L.numberInk || '#FFFFFF'; if (C.kind === 'stockcar') g.fillStyle = L.numberInk || '#101010';
            g.fillText(num, 0, fs * 0.04);
            g.restore();
          });
          if (C.kind === 'stockcar' || C.kind === 'monster') {
            // on the roof, read from the side of the track: turned a quarter
            var roofZ = C.kind === 'stockcar' ? -0.4 : -0.3;
            g.save(); g.translate(U(roofZ), Y(0.5)); g.rotate(PI / 2);
            g.font = '900 ' + Math.round(fs * 1.25) + 'px "Arial Black", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
            g.fillStyle = L.numberInk || '#FFFFFF'; g.strokeStyle = L.numberEdge || '#101010'; g.lineWidth = fs * 0.1;
            g.strokeText(num, 0, 0); g.fillText(num, 0, 0);
            g.restore();
          }
        }
        // the name along the flank (a team, a truck's name), read the right way on both sides
        if (L.name && C.kind !== 'van') {
          var nz = C.kind === 'monster' ? 0.9 : C.kind === 'formula' ? -1.1 : 1.1, nv = C.kind === 'monster' ? 0.24 : C.kind === 'formula' ? 0.2 : 0.31;
          var nf = C.kind === 'monster' ? h * 0.075 : h * 0.042;
          [[nv, true], [1 - nv, false]].forEach(function (d) {
            g.save(); g.translate(U(nz), Y(d[0])); if (d[1]) g.scale(-1, 1); else g.scale(1, -1);
            g.font = (C.kind === 'monster' ? '900 ' : '800 italic ') + Math.round(nf) + 'px "Arial Black", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
            if (C.kind === 'monster') { g.lineWidth = nf * 0.16; g.strokeStyle = '#0A0A0A'; g.strokeText(L.name, 0, 0); }
            g.fillStyle = L.nameInk || L.accent; g.fillText(L.name, 0, 0, w * 0.34);
            g.restore();
          });
        }
      });
    }

    /* --- the driver: a race suit, a helmet with a visor, hands on the wheel --- */
    function driver(C, L) {
      var S = C.seat, g = new THREE.Group(), suit = new THREE.MeshStandardMaterial({ color: L.suit, roughness: 0.7 });
      var helmetPaint = new THREE.MeshPhysicalMaterial({ color: L.helmet, roughness: 0.25, metalness: 0.3, clearcoat: 1, clearcoatRoughness: 0.04 });
      var glove = new THREE.MeshStandardMaterial({ color: '#141417', roughness: 0.6 });
      var lift = C.lift || 0, rec = S.recline;
      // hips on the seat; the back leans by `recline` (a single-seater's driver lies almost flat)
      var hip = V(S.x, S.y + lift, S.z), back = V(0, Math.cos(rec * 0.7), -Math.sin(rec * 0.7));
      var shoulder = hip.clone().addScaledVector(back, 0.5), neck = hip.clone().addScaledVector(back, 0.6);
      var torso = new THREE.CapsuleGeometry(0.17, 0.34, 4, 10); torso.scale(1.15, 1, 0.8);
      _q.setFromUnitVectors(_v.set(0, 1, 0), back); torso.applyQuaternion(_q);
      var tc = hip.clone().addScaledVector(back, 0.28); torso.translate(tc.x, tc.y, tc.z);
      var t = new THREE.Mesh(torso, suit); g.add(t);
      // the helmet: a dome, a chin bar, a visor, a stripe; the HANS collar
      var head = neck.clone().add(V(0, 0.13, 0.02));
      var hel = new THREE.SphereGeometry(0.135, 20, 14); hel.scale(1, 1.02, 1.12);
      g.add(new THREE.Mesh(hel.translate(head.x, head.y, head.z), helmetPaint));
      var vis = new THREE.SphereGeometry(0.139, 18, 8, -PI * 0.3, PI * 0.6, PI * 0.36, PI * 0.2); vis.scale(1, 1.02, 1.12);
      g.add(new THREE.Mesh(vis.translate(head.x, head.y, head.z), MAT.visor));
      var stripe = new THREE.TorusGeometry(0.137, 0.012, 6, 28, PI); stripe.rotateY(PI / 2); stripe.scale(1, 1.02, 1.12); stripe.translate(head.x, head.y + 0.005, head.z);
      g.add(new THREE.Mesh(stripe, new THREE.MeshStandardMaterial({ color: L.trim, roughness: 0.3 })));
      var hans = new THREE.TorusGeometry(0.12, 0.035, 6, 16, PI * 1.2); hans.rotateX(PI / 2); hans.rotateY(PI * 0.4); hans.translate(neck.x, neck.y - 0.02, neck.z - 0.02);
      g.add(new THREE.Mesh(hans, MAT.satin));
      // the steering wheel ahead of the chest, and arms that reach it
      var wc = shoulder.clone().add(V(0, C.kind === 'formula' ? 0.02 : -0.08, 0.36 + (C.kind === 'formula' ? 0.02 : 0)));
      var wheelG = new THREE.Group(); wheelG.position.copy(wc);
      wheelG.lookAt(wc.clone().add(V(0, -0.35, 1))); // tilted like a real column
      var rimR = S.wheel === 'formula' ? 0.13 : S.wheel === 'yoke' ? 0.16 : 0.19;
      var wg = S.wheel === 'round' ? new THREE.TorusGeometry(rimR, 0.018, 8, 28) : new THREE.BoxGeometry(rimR * 2.1, rimR * 1.2, 0.05);
      var wm = new THREE.Mesh(wg, S.wheel === 'round' ? MAT.satin : MAT.carbon); wheelG.add(wm);
      if (S.wheel !== 'round') { var scr = new THREE.Mesh(new THREE.PlaneGeometry(rimR * 0.9, rimR * 0.5), lampMat('#3FD0FF', 1.4)); scr.position.z = 0.03; scr.rotation.y = PI; wheelG.add(scr); }
      g.add(wheelG);
      var arms = [1, -1].map(function (sd) {
        var up = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.22, 3, 8), suit), fo = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.2, 3, 8), suit), hand = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), glove);
        g.add(up); g.add(fo); g.add(hand);
        return { sd: sd, up: up, fo: fo, hand: hand, sh: shoulder.clone().add(V(sd * 0.19, -0.02, 0)) };
      });
      var el = new THREE.Vector3(), hw = new THREE.Vector3(), tmp = new THREE.Vector3(), pole = new THREE.Vector3();
      function limb(mesh, a, b) { mesh.position.copy(a).add(b).multiplyScalar(0.5); _q.setFromUnitVectors(_v.set(0, 1, 0), tmp.subVectors(b, a).normalize()); mesh.quaternion.copy(_q); }
      function ik(a, c, l1, l2, pl, out) {
        var d = _v2.subVectors(c, a), len = clamp(d.length(), Math.abs(l1 - l2) + 1e-3, l1 + l2 - 1e-3); d.normalize();
        var ca = (l1 * l1 + len * len - l2 * l2) / (2 * l1 * len), sa = Math.sqrt(Math.max(0, 1 - ca * ca));
        var perp = _v.copy(pl).addScaledVector(d, -pl.dot(d)).normalize();
        return out.copy(a).addScaledVector(d, l1 * ca).addScaledVector(perp, l1 * sa);
      }
      function steer(angle) {
        wm.rotation.z = angle * 2.2;
        wheelG.updateMatrix();
        for (var i = 0; i < 2; i++) {
          var A = arms[i], ga = A.sd > 0 ? 0.25 : PI - 0.25;
          // the hands grip the rim at quarter to three, and turn with it
          hw.set(Math.cos(ga + angle * 2.2) * rimR, Math.sin(ga + angle * 2.2) * rimR, 0).applyMatrix4(wheelG.matrix);
          pole.set(A.sd * 0.8, -0.6, -0.2);
          ik(A.sh, hw, 0.29, 0.27, pole, el);
          limb(A.up, A.sh, el); limb(A.fo, el, hw); A.hand.position.copy(hw);
        }
      }
      steer(0);
      g.traverse(function (o) { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } });
      // everything but the wheel: the person, for the runtime to swap for one of its own
      var person = g.children.filter(function (m) { return m !== wheelG; });
      return { group: g, steer: steer, head: head, wheel: wheelG, rimR: rimR, turn: 2.2, person: person };
    }

    /* --- effects shared by every car: sparks, smoke, debris --- */
    var FX = null;
    function fx() {
      if (FX) return FX;
      var NS = low ? 260 : 700, NM = low ? 90 : 220;
      // sparks: bright streaks that fall, bounce once and die
      var sg = new THREE.BufferGeometry(), sp = new Float32Array(NS * 3), sv = new Float32Array(NS * 3), sl = new Float32Array(NS), sa = new Float32Array(NS);
      sg.setAttribute('position', new THREE.BufferAttribute(sp, 3)); sg.setAttribute('alpha', new THREE.BufferAttribute(sa, 1));
      var sm = new THREE.ShaderMaterial({
        uniforms: { uSize: { value: low ? 30 : 46 } },
        vertexShader: 'attribute float alpha; varying float vA; uniform float uSize; void main() { vA = alpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = uSize * alpha / -mv.z; gl_Position = projectionMatrix * mv; }',
        fragmentShader: 'varying float vA; void main() { vec2 c = gl_PointCoord - 0.5; float d = length(c); if (d > 0.5) discard; float k = pow(1.0 - d * 2.0, 1.6); gl_FragColor = vec4(vec3(6.0, 3.6, 1.4) * k * vA, 1.0); }',
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      });
      var sparks = new THREE.Points(sg, sm); sparks.frustumCulled = false; sparks.userData.noReflection = true;
      // smoke: soft puffs that grow and drift
      var mg = new THREE.BufferGeometry(), mp = new Float32Array(NM * 3), mv = new Float32Array(NM * 3), ml = new Float32Array(NM), ma = new Float32Array(NM), ms = new Float32Array(NM), mh = new Float32Array(NM);
      mg.setAttribute('position', new THREE.BufferAttribute(mp, 3)); mg.setAttribute('alpha', new THREE.BufferAttribute(ma, 1)); mg.setAttribute('size', new THREE.BufferAttribute(ms, 1)); mg.setAttribute('shade', new THREE.BufferAttribute(mh, 1));
      // shade: 1 a pale smoke or steam, toward 0 the black smoke of something burning
      var smk = new THREE.ShaderMaterial({
        uniforms: { uMap: { value: TEX.glow }, uColor: { value: new THREE.Color('#B8B4B0') } },
        vertexShader: 'attribute float alpha; attribute float size; attribute float shade; varying float vA; varying float vS; void main() { vA = alpha; vS = shade; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * 380.0 / -mv.z; gl_Position = projectionMatrix * mv; }',
        fragmentShader: 'uniform sampler2D uMap; uniform vec3 uColor; varying float vA; varying float vS; void main() { float a = texture2D(uMap, gl_PointCoord).a * vA; gl_FragColor = vec4(uColor * 0.55 * vS, a * mix(0.75, 0.5, vS)); }',
        transparent: true, depthWrite: false,
      });
      var smoke = new THREE.Points(mg, smk); smoke.frustumCulled = false; smoke.userData.noReflection = true;
      // fire: hot points that rise, yellow at the heart to red at the tips
      var NF = low ? 120 : 320, fgeo = new THREE.BufferGeometry(), fpos = new Float32Array(NF * 3), fvel = new Float32Array(NF * 3), flife = new Float32Array(NF), fl0 = new Float32Array(NF), falpha = new Float32Array(NF), fsize = new Float32Array(NF);
      fgeo.setAttribute('position', new THREE.BufferAttribute(fpos, 3)); fgeo.setAttribute('alpha', new THREE.BufferAttribute(falpha, 1)); fgeo.setAttribute('size', new THREE.BufferAttribute(fsize, 1));
      var fmat = new THREE.ShaderMaterial({
        uniforms: { uMap: { value: TEX.glow } },
        vertexShader: 'attribute float alpha; attribute float size; varying float vA; void main() { vA = alpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * 360.0 / -mv.z; gl_Position = projectionMatrix * mv; }',
        fragmentShader: 'uniform sampler2D uMap; varying float vA; void main() { float a = texture2D(uMap, gl_PointCoord).a * smoothstep(0.0, 0.3, vA); vec3 c = mix(vec3(1.0, 0.22, 0.03), vec3(1.0, 0.78, 0.32), vA); gl_FragColor = vec4(c * a * 2.4, 1.0); }',
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      });
      var fire = new THREE.Points(fgeo, fmat); fire.frustumCulled = false; fire.userData.noReflection = true;
      for (var fi = 0; fi < NF; fi++) fpos[fi * 3 + 1] = -999;
      // debris: shards of carbon and paint, tumbling
      var ND = 48, dm = new THREE.InstancedMesh(new THREE.TetrahedronGeometry(0.09), MAT.carbon, ND); dm.frustumCulled = false; dm.userData.noReflection = true;
      var dp = [], dummy = new THREE.Object3D();
      for (var i = 0; i < ND; i++) { dp.push({ p: new THREE.Vector3(0, -99, 0), v: new THREE.Vector3(), r: new THREE.Vector3(), w: new THREE.Vector3(), life: 0 }); dm.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0)); }
      H.scene.add(sparks); H.scene.add(smoke); H.scene.add(dm); H.scene.add(fire);
      var nS = 0, nM = 0, nD = 0, nF = 0;
      FX = {
        spark: function (p, v, spread, life) {
          var i = nS++ % NS;
          sp[i * 3] = p.x; sp[i * 3 + 1] = p.y; sp[i * 3 + 2] = p.z;
          sv[i * 3] = v.x + (Math.random() - 0.5) * spread; sv[i * 3 + 1] = v.y + Math.random() * spread * 0.6; sv[i * 3 + 2] = v.z + (Math.random() - 0.5) * spread;
          sl[i] = life || 0.35 + Math.random() * 0.3; sa[i] = 1;
        },
        puff: function (p, v, size, life, shade) {
          var i = nM++ % NM;
          mp[i * 3] = p.x; mp[i * 3 + 1] = p.y; mp[i * 3 + 2] = p.z;
          mv[i * 3] = v.x; mv[i * 3 + 1] = v.y; mv[i * 3 + 2] = v.z;
          ml[i] = life || 1.6; ma[i] = 0.9; ms[i] = size || 1; mh[i] = shade == null ? 1 : clamp(shade, 0.1, 1.6);
        },
        fire: function (p, v, size, life) {
          var i = nF++ % NF;
          fpos[i * 3] = p.x + (Math.random() - 0.5) * 0.3; fpos[i * 3 + 1] = p.y; fpos[i * 3 + 2] = p.z + (Math.random() - 0.5) * 0.3;
          fvel[i * 3] = v.x * 0.3 + (Math.random() - 0.5) * 0.8; fvel[i * 3 + 1] = 1.2 + Math.random() * 1.4; fvel[i * 3 + 2] = v.z * 0.3 + (Math.random() - 0.5) * 0.8;
          flife[i] = fl0[i] = (life || 0.7) * (0.7 + Math.random() * 0.6); fsize[i] = (size || 1) * (0.5 + Math.random() * 0.5); falpha[i] = 1;
        },
        debris: function (p, v) {
          var d = dp[nD++ % ND]; d.p.copy(p); d.v.copy(v); d.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6); d.w.set(Math.random() * 14 - 7, Math.random() * 14 - 7, Math.random() * 14 - 7); d.life = 2.5;
        },
        step: function (dt) {
          if (!(dt > 0)) return;
          for (var i = 0; i < NS; i++) {
            if (sl[i] <= 0) { if (sa[i] > 0) { sa[i] = 0; sp[i * 3 + 1] = -999; } continue; }
            sl[i] -= dt; sv[i * 3 + 1] -= 9.8 * dt;
            sp[i * 3] += sv[i * 3] * dt; sp[i * 3 + 1] += sv[i * 3 + 1] * dt; sp[i * 3 + 2] += sv[i * 3 + 2] * dt;
            if (sp[i * 3 + 1] < 0.02) { sp[i * 3 + 1] = 0.02; sv[i * 3 + 1] *= -0.35; sv[i * 3] *= 0.7; sv[i * 3 + 2] *= 0.7; }
            sa[i] = clamp(sl[i] * 3, 0, 1);
          }
          sg.attributes.position.needsUpdate = true; sg.attributes.alpha.needsUpdate = true;
          for (i = 0; i < NM; i++) {
            if (ml[i] <= 0) { if (ma[i] > 0) { ma[i] = 0; mp[i * 3 + 1] = -999; } continue; }
            ml[i] -= dt; mv[i * 3] *= 1 - dt * 1.2; mv[i * 3 + 2] *= 1 - dt * 1.2; mv[i * 3 + 1] = mv[i * 3 + 1] * (1 - dt) + dt * 0.8;
            mp[i * 3] += mv[i * 3] * dt; mp[i * 3 + 1] += mv[i * 3 + 1] * dt; mp[i * 3 + 2] += mv[i * 3 + 2] * dt;
            ms[i] += dt * 1.6; ma[i] = clamp(ml[i] * 0.6, 0, 0.9);
          }
          mg.attributes.position.needsUpdate = true; mg.attributes.alpha.needsUpdate = true; mg.attributes.size.needsUpdate = true; mg.attributes.shade.needsUpdate = true;
          for (i = 0; i < NF; i++) {
            if (flife[i] <= 0) { if (falpha[i] > 0) { falpha[i] = 0; fpos[i * 3 + 1] = -999; } continue; }
            flife[i] -= dt; fvel[i * 3 + 1] += 2.6 * dt; fvel[i * 3] *= 1 - dt * 2; fvel[i * 3 + 2] *= 1 - dt * 2;
            fpos[i * 3] += fvel[i * 3] * dt; fpos[i * 3 + 1] += fvel[i * 3 + 1] * dt; fpos[i * 3 + 2] += fvel[i * 3 + 2] * dt;
            falpha[i] = clamp(flife[i] / fl0[i], 0, 1); fsize[i] *= 1 - dt * 0.9;
          }
          fgeo.attributes.position.needsUpdate = true; fgeo.attributes.alpha.needsUpdate = true; fgeo.attributes.size.needsUpdate = true;
          var any = false;
          for (i = 0; i < ND; i++) {
            var d = dp[i];
            if (d.life <= 0) continue;
            any = true; d.life -= dt; d.v.y -= 9.8 * dt; d.p.addScaledVector(d.v, dt);
            if (d.p.y < 0.05) { d.p.y = 0.05; d.v.y *= -0.3; d.v.x *= 0.6; d.v.z *= 0.6; d.w.multiplyScalar(0.6); }
            d.r.addScaledVector(d.w, dt);
            dummy.position.copy(d.p); dummy.rotation.set(d.r.x, d.r.y, d.r.z); dummy.scale.setScalar(d.life > 0 ? 1 : 0); dummy.updateMatrix(); dm.setMatrixAt(i, dummy.matrix);
          }
          if (any || nD) dm.instanceMatrix.needsUpdate = true;
        },
      };
      return FX;
    }

    // a headlight's beam in the night air: brightest at the lamp, fading along
    // its length and toward its edges (seen side on, a cone has no hard rim)
    function beamMat(hex) {
      return new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color(hex).multiplyScalar(0.16) } },
        vertexShader: 'varying vec2 vUv; varying float vRim; void main() { vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vec3 n = normalize(normalMatrix * normal); vRim = abs(dot(n, normalize(-mv.xyz))); gl_Position = projectionMatrix * mv; }',
        fragmentShader: 'uniform vec3 uColor; varying vec2 vUv; varying float vRim; void main() { float a = pow(vUv.y, 2.2) * pow(vRim, 1.5); gl_FragColor = vec4(uColor * a, 1.0); }',
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      });
    }

    /* --- the car --- */
    var PALETTE = {
      hypercar: { paint: '#A7ADB4', trim: '#15171A', accent: '#00B2A9', pattern: 'arrow', metallic: 0.5 },
      formula: { paint: '#E8E6E1', trim: '#C8102E', accent: '#101820', pattern: 'split', metallic: 0.2 },
      stockcar: { paint: '#F2C230', trim: '#101010', accent: '#D22B2B', pattern: 'bands', metallic: 0.35 },
      monster: { paint: '#1E7A34', trim: '#F2B705', accent: '#E0401B', pattern: 'flames', metallic: 0.4 },
      roadster: { paint: '#9E1B22', trim: '#1B1B1D', accent: '#E8E4DA', pattern: 'plain', metallic: 0.55 },
      van: { paint: '#F8F5EF', trim: '#F0468C', accent: '#FF8DC0', pattern: 'dots', metallic: 0.12 },
    };
    function car(o) {
      o = o || {};
      var kind = ALIAS[String(o.kind || '').toLowerCase()] || 'hypercar';
      var C = Object.assign({ kind: kind }, CLASSES[kind]), P = PALETTE[kind];
      var L = {
        paint: hx(o.paint, P.paint), trim: hx(o.trim, P.trim), accent: hx(o.accent, P.accent),
        pattern: ['plain', 'stripes', 'arrow', 'split', 'flames', 'teeth', 'bands', 'dots'].indexOf(o.pattern) >= 0 ? o.pattern : P.pattern,
        number: o.number == null ? '' : String(o.number).replace(/[^0-9A-Za-z]/g, '').slice(0, 3),
        name: word(o.livery, '', 18), pinstripe: o.pinstripe !== false && kind === 'hypercar',
        numberInk: hx(o.numberInk, null), numberBg: hx(o.numberBg, null),
        suit: hx(o.driver && o.driver.suit, hx(o.trim, P.trim)), helmet: hx(o.driver && o.driver.helmet, hx(o.accent, P.accent)),
        rim: hx(o.rims, kind === 'monster' ? '#C9CCD1' : kind === 'stockcar' ? '#1B1C1F' : kind === 'hypercar' || kind === 'roadster' ? '#9AA0A8' : '#23252A'),
        leather: hx(o.interior, '#6E3B22'),
        caliper: hx(o.calipers, kind === 'hypercar' ? '#E8B400' : '#C8102E'),
        glow: hx(o.glow, null), metallic: o.metallic != null ? clamp(Number(o.metallic) || 0, 0, 1) : P.metallic,
        chrome: !!o.chrome, iridescent: !!o.iridescent, spikes: !!o.spikes,
        // a food truck: the art on its flanks, the serving window, its sign, the line on its back doors, the figure on its roof
        art: o.art === 'none' ? null : o.art === 'cone' || kind === 'van' ? 'cone' : null, window: o.window !== false,
        sign: word(o.sign, '', 16), motto: word(o.motto, '', 26), topper: o.topper === 'swirl' ? 'swirl' : null, swirl: hx(o.swirl, '#FFB3CF'),
        armed: !!o.armed,
      };
      var root = new THREE.Group(), chassis = new THREE.Group(), body = new THREE.Group();
      root.add(chassis); chassis.add(body);
      var lift = C.lift || 0, HL = C.length / 2, wf = C.wheels.front, wr = C.wheels.rear;
      var zf = C.wheelbase / 2, zr = -C.wheelbase / 2;
      // the paint: clear coat over metallic flake, the livery in its colour map
      var paint = new THREE.MeshPhysicalMaterial({ color: '#FFFFFF', map: livery(C, L), metalness: L.chrome ? 1 : L.metallic, roughness: L.chrome ? 0.08 : 0.32, clearcoat: 1, clearcoatRoughness: 0.03, normalMap: TEX.flake, normalScale: new THREE.Vector2(0.06, 0.06), envMapIntensity: 1.05 });
      if (L.iridescent) { paint.iridescence = 1; paint.iridescenceIOR = 1.6; paint.iridescenceThicknessRange = [220, 620]; }
      paint.map.anisotropy = H.aniso;
      var look = {
        sidewall: new THREE.MeshStandardMaterial({ color: '#FFFFFF', map: sidewall(kind === 'formula' ? (o.compound || '#E4002B') : null, kind === 'stockcar' ? 'RACING  RADIAL' : kind === 'monster' ? 'MONSTER  TRAC' : null), roughness: 0.85, normalMap: TEX.rubberN, normalScale: new THREE.Vector2(0.4, 0.4) }),
        rim: new THREE.MeshStandardMaterial({ color: L.rim, roughness: 0.28, metalness: 1 }),
        disc: MAT.disc.clone(), caliper: new THREE.MeshStandardMaterial({ color: L.caliper, roughness: 0.4, metalness: 0.2 }),
        cover: C.cover ? new THREE.MeshPhysicalMaterial({ color: L.trim, roughness: 0.3, metalness: 0.4, clearcoat: 1, clearcoatRoughness: 0.05 }) : null,
      };
      var lampF = lampMat(kind === 'monster' ? '#FFE9B8' : '#E8F2FF', 7), lampR = lampMat('#FF1A1A', 2.2), lampX = lampMat(L.accent, 3.2);
      var bin = new Bin();

      /* the body, pressed out round its wheels */
      var arches = C.open || kind === 'monster' ? [] : [
        { z: zf, y: wf.r + 0.0, r: wf.r + (kind === 'monster' ? 0.12 : 0.04), xIn: wf.x - wf.w * 0.62 },
        { z: zr, y: wr.r + 0.0, r: wr.r + (kind === 'monster' ? 0.12 : 0.04), xIn: wr.x - wr.w * 0.62 },
      ];
      var bg = loftBody(C, arches, {});
      var slots = bg.userData.slots.map(function (s) { return s === 'paint' ? paint : MAT.carbon; });
      var bodyMesh = new THREE.Mesh(bg, slots); bodyMesh.castShadow = true; bodyMesh.receiveShadow = true; body.add(bodyMesh);
      // wheel wells and the cabin's floor: dark, so no light shows through the arches
      if (!C.open) {
        if (kind !== 'monster') [[zf, wf], [zr, wr]].forEach(function (a) { bin.add(box((a[1].x - a[1].w * 0.62) * 2 - 0.02, a[1].r * 1.6, a[1].r * 2.3, 0, a[1].r * 0.95, a[0]), MAT.interior); });
        var bodyW = C.body.reduce(function (m, s) { return Math.max(m, s.w); }, 0) * 2;
        if (!C.cockpit) bin.add(box(bodyW * 0.84, 0.3, C.wheelbase * 0.9, 0, lift + C.body[3].ys * 0.9, 0), MAT.interior);
      }
      if (!C.cabin.open) {
        var cabG = loftCabin(C, {});
        var cslots = cabG.userData.slots.map(function (s) { return s === 'glass' ? MAT.glass : paint; });
        var cab = new THREE.Mesh(cabG, cslots); cab.castShadow = true; cab.receiveShadow = true; body.add(cab);
      }
      if (C.cockpit) {
        /* the open cockpit: a leather-lined tub under a padded rim, two buckets,
           the dash and its dials, a raked screen in a bright frame */
        var K = C.cockpit, S = C.seat, leather = new THREE.MeshPhysicalMaterial({ color: L.leather, roughness: 0.52, sheen: 0.4, sheenRoughness: 0.5, sheenColor: new THREE.Color(L.leather).lerp(new THREE.Color('#FFFFFF'), 0.3), side: THREE.DoubleSide });
        var rim0 = cockpitRim(K, 48, 0.02), tp = [], ti = [];
        rim0.forEach(function (q) { tp.push(q[0], lift + K.belt + 0.005, q[1], q[0] * 0.95, lift + K.floor, q[1] * 0.97 + (K.z0 + K.z1) / 2 * 0.03); });
        for (var ri = 0; ri < rim0.length; ri++) { var r1 = (ri + 1) % rim0.length; ti.push(ri * 2, ri * 2 + 1, r1 * 2, r1 * 2, ri * 2 + 1, r1 * 2 + 1); }
        var fc = tp.length / 3; tp.push(0, lift + K.floor, (K.z0 + K.z1) / 2);
        for (ri = 0; ri < rim0.length; ri++) ti.push(fc, ri * 2 + 1, ((ri + 1) % rim0.length) * 2 + 1);
        var tub = new THREE.BufferGeometry(); tub.setAttribute('position', new THREE.Float32BufferAttribute(tp, 3)); tub.setIndex(ti); tub.computeVertexNormals();
        var tubM = new THREE.Mesh(tub, leather); tubM.receiveShadow = true; body.add(tubM);
        var rimPts = rim0.map(function (q) { return V(q[0], lift + K.belt + 0.012, q[1]); });
        bin.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rimPts, true), 96, 0.028, 8, true), leather);
        [-1, 1].forEach(function (sd) {
          var sx = sd * S.x;
          bin.add(box(0.46, 0.1, 0.5, sx, lift + K.floor + 0.07, S.z + 0.12), leather);
          var back = new THREE.CapsuleGeometry(0.2, 0.3, 6, 16); back.scale(1.18, 1, 0.36); back.rotateX(-S.recline * 0.8);
          back.translate(sx, lift + S.y + 0.3, S.z - 0.2 - Math.sin(S.recline * 0.8) * 0.2); bin.add(back, leather);
          var hr = new THREE.CapsuleGeometry(0.075, 0.06, 4, 12); hr.rotateZ(PI / 2); hr.scale(1, 1, 0.55); hr.rotateX(-S.recline * 0.8);
          hr.translate(sx, lift + S.y + 0.72, S.z - 0.2 - Math.sin(S.recline * 0.8) * 0.5); bin.add(hr, leather);
          // speedster humps behind the headrests, in the paint
          // long, low, tapering to nothing down the deck
          if (C.humps) {
            var hp = new THREE.SphereGeometry(1, 24, 12, 0, TAU, 0, PI / 2), hpp = hp.attributes.position;
            for (var hi = 0; hi < hpp.count; hi++) { var hz0 = hpp.getZ(hi); if (hz0 < 0) { var tt = -hz0; hpp.setX(hi, hpp.getX(hi) * (1 - 0.55 * tt)); hpp.setY(hi, hpp.getY(hi) * (1 - 0.8 * tt * tt)); } }
            hp.computeVertexNormals(); hp.scale(0.17, 0.1, 0.7); hp.translate(sx, lift + K.belt - 0.02, K.z0 - 0.08); bin.add(hp, paint);
          }
          // the dials, facing the driver
          if (sd > 0) [-0.075, 0.075].forEach(function (dx) {
            var dial = new THREE.CircleGeometry(0.045, 24); dial.rotateY(PI); dial.rotateX(-0.3); dial.translate(sx + dx, lift + K.belt - 0.03, K.z1 - 0.2); bin.add(dial, MAT.satin);
            var bez = new THREE.TorusGeometry(0.047, 0.006, 6, 24); bez.rotateY(PI); bez.rotateX(-0.3); bez.translate(sx + dx, lift + K.belt - 0.03, K.z1 - 0.2); bin.add(bez, MAT.chrome);
          });
        });
        var dash = box(K.x * 2 - 0.08, 0.12, 0.24, 0, lift + K.belt - 0.06, K.z1 - 0.08); bin.add(dash, leather);
        // the screen: raked back, bowed forward in the middle
        var WS = 10, sp2 = [], si2 = [], sw0 = K.x + 0.04, sw1 = K.x - 0.02;
        for (var wv = 0; wv <= 1; wv++) for (var wu = 0; wu <= WS; wu++) {
          var u2 = wu / WS * 2 - 1, v2 = wv, hwid = lerp(sw0, sw1, v2);
          sp2.push(u2 * hwid, lift + lerp(K.belt + 0.02, K.belt + 0.4, v2), lerp(K.z1 + 0.06, K.z1 - 0.24, v2) + 0.06 * (1 - u2 * u2));
        }
        for (wu = 0; wu < WS; wu++) si2.push(wu, wu + 1, wu + WS + 1, wu + 1, wu + WS + 2, wu + WS + 1);
        var scr = new THREE.BufferGeometry(); scr.setAttribute('position', new THREE.Float32BufferAttribute(sp2, 3)); scr.setIndex(si2); scr.computeVertexNormals();
        var screen = new THREE.Mesh(scr, MAT.screen); screen.renderOrder = 3; body.add(screen);
        var topEdge = [], p3 = function (k) { return V(sp2[k * 3], sp2[k * 3 + 1], sp2[k * 3 + 2]); };
        for (wu = 0; wu <= WS; wu++) topEdge.push(p3(WS + 1 + wu));
        bin.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(topEdge), 24, 0.012, 6, false), MAT.chrome);
        [0, WS].forEach(function (k) { bin.add(tube(p3(k), p3(WS + 1 + k), 0.016, 8), MAT.chrome); });
      }

      /* the driver */
      var D = driver(C, L); body.add(D.group);
      // where a person sits and what they hold, in the body's own frame (it rolls and pitches)
      var cockpit = { body: body, hip: V(C.seat.x, C.seat.y + lift, C.seat.z), recline: C.seat.recline, floor: (C.cockpit ? C.cockpit.floor : C.seat.y - 0.12) + lift,
        wheel: D.wheel, rimR: D.rimR, person: D.person, open: !!C.cabin.open, onSteer: null };
      // the cockpit rim of a single-seater
      if (kind === 'formula') {
        var rimG = new THREE.TorusGeometry(0.26, 0.03, 6, 24); rimG.rotateX(PI / 2); rimG.scale(1, 1, 1.6); rimG.translate(0, 0.64, 0.26);
        bin.add(rimG, MAT.carbon);
      }

      /* aero */
      var wingSpec = C.wing;
      if (wingSpec) {
        var ws = wingSpec, hs = ws.span / 2;
        for (var e = 0; e < ws.elements; e++) bin.add(aerofoil(ws.chord * (e ? 0.55 : 1), -hs, hs, lift + ws.y + e * 0.075, ws.z + (e ? -ws.chord * 0.62 : 0), 0.1 + e * 0.32, e ? 0.09 : 0.12), MAT.carbon);
        // endplates
        [-1, 1].forEach(function (sd) {
          var ep = box(0.018, 0.3 + (ws.beam ? 0.16 : 0), ws.chord * 1.6, sd * (hs + 0.009), lift + ws.y - 0.04, ws.z - ws.chord * 0.55);
          bin.add(ep, MAT.carbon);
        });
        if (ws.mount === 'swan') {
          [-1, 1].forEach(function (sd) { bin.add(sweep([V(sd * 0.32, lift + 0.82, ws.z + 0.25), V(sd * 0.32, lift + ws.y + 0.12, ws.z + 0.05), V(sd * 0.32, lift + ws.y + 0.05, ws.z - ws.chord * 0.4)], 0.02, 12, 6), MAT.carbon); });
        } else {
          bin.add(box(0.04, ws.y - 0.45, 0.22, 0, lift + (ws.y + 0.45) / 2, ws.z - 0.1), MAT.carbon);
        }
        if (ws.beam) bin.add(aerofoil(0.2, -0.36, 0.36, lift + 0.46, ws.z - 0.05, 0.25, 0.1), MAT.carbon);
      }
      if (C.frontWing) {
        var fwS = C.frontWing, fh = fwS.span / 2;
        for (e = 0; e < fwS.elements; e++) {
          [-1, 1].forEach(function (sd) { bin.add(aerofoil(0.24 - e * 0.05, sd > 0 ? 0.16 : -fh, sd > 0 ? fh : -0.16, 0.1 + e * 0.05, fwS.z + 0.14 - e * 0.13, 0.05 + e * 0.22, 0.08), e === 0 ? MAT.carbon : paint); });
        }
        bin.add(aerofoil(0.26, -0.16, 0.16, 0.09, fwS.z + 0.14, 0.02, 0.08), MAT.carbon);
        [-1, 1].forEach(function (sd) { bin.add(box(0.014, 0.2, 0.5, sd * (fh + 0.007), 0.18, fwS.z - 0.05), MAT.carbon); });
        // the nose's pylons down to the wing
        [-1, 1].forEach(function (sd) { bin.add(box(0.02, 0.12, 0.3, sd * 0.09, 0.2, fwS.z + 0.05), MAT.carbon); });
      }
      if (kind === 'hypercar') {
        // the rear: a louvred black grille between the lamps, the diffuser below
        var gr = new THREE.PlaneGeometry(1.3, 0.2); gr.rotateY(PI); gr.translate(0, lift + 0.52, -HL - 0.004); bin.add(gr, MAT.intake);
        for (var lv = 0; lv < 4; lv++) bin.add(box(1.3, 0.012, 0.05, 0, lift + 0.44 + lv * 0.055, -HL - 0.01), MAT.carbon);
      }
      if (C.splitter) bin.add(box(C.width * 0.9, 0.02, 0.36, 0, lift + 0.07, HL - 0.2), MAT.carbon);
      if (C.floor) {
        // the floor and its plank, with the edges that seal the underside
        bin.add(box(1.5, 0.025, 2.9, 0, 0.045, -0.15), MAT.carbon);
        bin.add(box(0.3, 0.012, 2.8, 0, 0.026, -0.15), new THREE.MeshStandardMaterial({ color: '#6B5B45', roughness: 0.8 }));
      }
      if (C.diffuser) {
        var dw = C.width * (kind === 'formula' ? 0.5 : 0.8), ramp = new THREE.BoxGeometry(dw, 0.014, 0.6);
        ramp.rotateX(-0.3); ramp.translate(0, lift + 0.16, -HL + 0.3); bin.add(ramp, MAT.carbon);
        for (var dI = 0; dI < C.diffuser; dI++) {
          var dx = (dI / (C.diffuser - 1) - 0.5) * dw;
          var fin = new THREE.BoxGeometry(0.014, 0.16, 0.56); fin.rotateX(-0.3); fin.translate(dx, lift + 0.1, -HL + 0.3); bin.add(fin, MAT.carbon);
        }
      }
      if (C.scoop) {
        // the roof intake over the cabin: a snout with a dark mouth
        var sc = new THREE.SphereGeometry(1, 16, 10, 0, TAU, 0, PI / 2); sc.scale(0.15, 0.13, 0.55); sc.translate(0, lift + C.cabin.stations[3].yb + C.cabin.stations[3].h - 0.03, -0.25);
        bin.add(sc, paint);
        var mouth = new THREE.CircleGeometry(1, 16, 0, PI); mouth.scale(0.11, 0.09, 1); mouth.translate(0, lift + C.cabin.stations[3].yb + C.cabin.stations[3].h - 0.02, 0.28);
        bin.add(mouth, MAT.intake);
      }
      if (C.airbox) {
        var ab = new THREE.CircleGeometry(1, 16); ab.scale(0.09, 0.1, 1); ab.translate(0, 0.9, -0.17);
        bin.add(ab, MAT.intake);
      }
      if (C.fin) {
        // the shark fin from the cabin back to the wing
        var fs0 = kind === 'formula' ? -0.3 : -0.7, fs1 = kind === 'formula' ? -1.95 : -2.0, fy0 = kind === 'formula' ? 0.98 : C.cabin.stations[1].yb + C.cabin.stations[1].h, fy1 = kind === 'formula' ? 0.86 : wingSpec.y - 0.02;
        var sh = new THREE.Shape(); sh.moveTo(fs0, fy0 - 0.02); sh.lineTo(fs1, fy1); sh.lineTo(fs1, fy1 - 0.3); sh.lineTo(fs0 + 0.2, fy0 - 0.26); sh.lineTo(fs0, fy0 - 0.02);
        var fg = new THREE.ExtrudeGeometry(sh, { depth: 0.012, bevelEnabled: false }); fg.rotateY(-PI / 2); fg.translate(0.006, lift, 0);
        bin.add(fg, paint);
      }
      if (C.halo) {
        var halo = [V(0, 0.64, 0.8), V(0, 0.84, 0.66), V(0.22, 0.87, 0.42), V(0.28, 0.83, 0.12), V(0.22, 0.74, -0.02)];
        bin.add(sweep(halo, 0.024, 20, 8), MAT.carbon);
        bin.add(sweep(halo.map(function (p) { return V(-p.x, p.y, p.z); }), 0.024, 20, 8), MAT.carbon);
        bin.add(tube(V(0, 0.6, 0.8), V(0, 0.84, 0.68), 0.03, 8), MAT.carbon);
      }
      if (C.spoiler) {
        var sp = new THREE.BoxGeometry(C.width * 0.86, 0.2, 0.012); sp.rotateX(-0.45); sp.translate(0, 0.98, -HL + 0.14); bin.add(sp, paint);
        [-1, 1].forEach(function (sd) { bin.add(box(0.012, 0.18, 0.2, sd * C.width * 0.43, lift + 0.96, -HL + 0.14), MAT.carbon); });
      }
      if (C.mirrors) {
        var M3 = C.mirrors;
        [-1, 1].forEach(function (sd) {
          var mg = new THREE.SphereGeometry(1, 12, 8); mg.scale(0.07, 0.05, 0.1); mg.translate(sd * M3[0], lift + M3[1], M3[2]); bin.add(mg, paint);
          bin.add(tube(V(sd * (M3[0] - 0.14), lift + M3[1] - 0.06, M3[2] + 0.02), V(sd * (M3[0] - 0.03), lift + M3[1], M3[2]), 0.012, 6), MAT.carbon);
        });
      }
      if (C.cabin.net) {
        // the driver's window net, on the left (the side a stock car's driver sits)
        var net = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.34), MAT.net); net.rotation.y = PI / 2; net.position.set(0.78, lift + 1.08, -0.2); body.add(net);
      }
      if (kind === 'monster') {
        bin.add(box(1.86, 0.03, 1.3, 0, lift + 0.655, -1.72), MAT.satin);
        [-1, 1].forEach(function (sd) { bin.add(box(0.06, 0.08, 1.36, sd * 0.97, lift + 0.68, -1.72), MAT.chrome); });
        var grille = new THREE.PlaneGeometry(1.3, 0.32); grille.translate(0, lift + 0.4, 2.565); bin.add(grille, MAT.intake);
        for (var gb = 0; gb < 5; gb++) bin.add(box(1.3, 0.025, 0.03, 0, lift + 0.28 + gb * 0.06, 2.575), MAT.chrome);
        bin.add(tube(V(-1.02, lift - 0.05, 2.62), V(1.02, lift - 0.05, 2.62), 0.07, 10), MAT.chrome); // the bumper bar
      }
      var topper = null, gunRig = null;
      // the food truck: its flanks, back, roof and sign as painted panels over the
      // flat box; the serving window's awning, bumpers, mirrors, roof lights
      function vanParts() {
        var B = C.box, fl = B.w + 0.006, zc = (B.z0 + B.z1) / 2 + 0.04, len = B.z1 - B.z0 - 0.16, y0 = 0.98, y1 = B.top - 0.2, ph = y1 - y0;
        var PW = low ? 1024 : 2048, PH = Math.round(PW * ph / len);
        function panel(w, h, draw, emissive) {
          var tex = H.canvas(PW, Math.round(PW * h / w), draw); tex.anisotropy = H.aniso;
          var m = new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.34, metalness: 0.05, clearcoat: 0.8, clearcoatRoughness: 0.08, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
          if (emissive) { m.emissive = new THREE.Color('#FFFFFF'); m.emissiveMap = tex; m.emissiveIntensity = emissive; }
          m.userData.gmLive = true;
          return m;
        }
        function plane(w, h, mat, rx, ry, x, y, z) {
          var g = new THREE.PlaneGeometry(w, h); if (rx) g.rotateX(rx); if (ry) g.rotateY(ry); g.translate(x, y, z);
          var m = new THREE.Mesh(g, mat); m.receiveShadow = true; body.add(m); return m;
        }
        var winZ = -1.05, winW = 1.5, winY = 1.38, winH = 0.84;   // the serving window, on the kerb side (-x)
        // left flank (+x): the art and the truck's name, read front to back
        plane(len, ph, panel(len, ph, function (g, w, h) { flank(g, w, h, true); }), 0, PI / 2, fl, (y0 + y1) / 2, zc);
        // right flank (-x): the serving window under its awning, the menu beside it, read back to front
        plane(len, ph, panel(len, ph, function (g, w, h) { flank(g, w, h, false); }), 0, -PI / 2, -fl, (y0 + y1) / 2, zc);
        function flank(g, w, h, left) {
          g.fillStyle = L.paint; g.fillRect(0, 0, w, h);
          dots(g, w, h, L.accent, h * 0.045, left ? 11 : 29);
          var s = h / 1.68;   // canvas px per metre of the panel's height
          // panel z (metres from the panel's centre, +front) to canvas x
          var X = function (z) { var u = (z - zc) / len + 0.5; return left ? (1 - u) * w : u * w; };
          if (L.art === 'cone') drawCone(g, X(left ? 0.05 : -2.3), h * 0.52, h * 0.82);
          if (!left && L.window) {
            // the window: dark glass, a chrome frame, the menu taped inside
            var wx = X(winZ) - winW / 2 * s, wy = h - (winY + winH - y0) * s, ww = winW * s, wh = winH * s;
            g.fillStyle = '#C9CDD2'; rr(g, wx - s * 0.05, wy - s * 0.05, ww + s * 0.1, wh + s * 0.1, s * 0.06); g.fill();
            var gl = g.createLinearGradient(wx, wy, wx + ww, wy + wh); gl.addColorStop(0, '#1A2230'); gl.addColorStop(0.55, '#0B0F16'); gl.addColorStop(1, '#202A38');
            g.fillStyle = gl; rr(g, wx, wy, ww, wh, s * 0.03); g.fill();
            g.fillStyle = 'rgba(255,255,255,.16)'; g.beginPath(); g.moveTo(wx + ww * 0.12, wy); g.lineTo(wx + ww * 0.3, wy); g.lineTo(wx + ww * 0.12, wy + wh); g.lineTo(wx - ww * 0.06 + ww * 0.0, wy + wh); g.closePath(); g.fill();
            // the counter under it
            g.fillStyle = '#D9DDE2'; g.fillRect(wx - s * 0.08, wy + wh + s * 0.02, ww + s * 0.16, s * 0.07);
            // the menu: what a scoop costs, in GM
            var mx = X(winZ + (left ? -1 : 1) * 1.28) - 0.42 * s, my = wy + s * 0.02, mw = 0.84 * s, mh = 0.98 * s;
            g.fillStyle = '#FFF7E8'; rr(g, mx, my, mw, mh, s * 0.05); g.fill(); g.lineWidth = s * 0.02; g.strokeStyle = L.trim; g.stroke();
            g.fillStyle = L.trim; g.font = '900 ' + Math.round(s * 0.11) + 'px "Arial Black", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
            g.fillText('MENU', mx + mw / 2, my + mh * 0.12);
            g.font = '800 ' + Math.round(s * 0.072) + 'px Arial, Helvetica, sans-serif'; g.fillStyle = '#3A1B2A'; g.textAlign = 'left';
            [['Soft serve', '50'], ['Sundae', '120'], ['Float', '90'], ['Sprinkles', 'free']].forEach(function (r, i) {
              var ly = my + mh * (0.3 + i * 0.17);
              g.fillText(r[0], mx + mw * 0.08, ly); g.textAlign = 'right'; g.fillText(r[1] === 'free' ? 'FREE' : r[1] + ' GM', mx + mw * 0.93, ly); g.textAlign = 'left';
            });
          }
          if (left && L.name) {
            // the name, big, under the art
            var fs = h * 0.2; g.save(); g.translate(X(-1.25), h * 0.44); g.rotate(-0.05);
            g.font = '900 ' + Math.round(fs) + 'px "Arial Black", "Helvetica Neue", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
            g.lineWidth = fs * 0.28; g.strokeStyle = '#3A1B2A'; g.strokeText(L.name, 0, 0, w * 0.6);
            g.lineWidth = fs * 0.14; g.strokeStyle = '#FFFFFF'; g.strokeText(L.name, 0, 0, w * 0.6);
            g.fillStyle = L.trim; g.fillText(L.name, 0, 0, w * 0.6);
            g.restore();
          }
          // a rub strip and the panel's edge
          g.fillStyle = L.trim; g.fillRect(0, h - h * 0.035, w, h * 0.035); g.fillRect(0, 0, w, h * 0.02);
        }
        // the back: the doors, a joke for whoever is behind
        var bw = B.w * 2 - 0.3, bh = B.top - 0.14 - 0.66;
        plane(bw, bh, panel(bw, bh, function (g, w, h) {
          g.fillStyle = L.paint; g.fillRect(0, 0, w, h); dots(g, w, h, L.accent, h * 0.04, 47);
          g.strokeStyle = 'rgba(40,20,30,.55)'; g.lineWidth = w * 0.006; g.strokeRect(w * 0.06, h * 0.08, w * 0.88, h * 0.86); g.beginPath(); g.moveTo(w / 2, h * 0.08); g.lineTo(w / 2, h * 0.94); g.stroke();
          g.fillStyle = '#0D1118'; rr(g, w * 0.12, h * 0.16, w * 0.3, h * 0.2, w * 0.02); g.fill(); rr(g, w * 0.58, h * 0.16, w * 0.3, h * 0.2, w * 0.02); g.fill();
          g.fillStyle = '#C9CDD2'; g.fillRect(w * 0.44, h * 0.52, w * 0.03, h * 0.12); g.fillRect(w * 0.53, h * 0.52, w * 0.03, h * 0.12);
          g.fillStyle = L.trim; rr(g, w * 0.1, h * 0.7, w * 0.8, h * 0.13, h * 0.03); g.fill();
          g.font = '900 ' + Math.round(h * 0.062) + 'px "Arial Black", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#FFFFFF';
          g.fillText(L.motto || 'BRAKES FOR SPRINKLES', w / 2, h * 0.765, w * 0.74);
        }), 0, PI, 0, 0.66 + bh / 2, -C.length / 2 - 0.012);
        // the roof, read from behind: dots, and the name
        var rw = B.w * 2 * 0.8, rl = len;
        plane(rw, rl, panel(rw, rl, function (g, w, h) {
          g.fillStyle = L.paint; g.fillRect(0, 0, w, h); dots(g, w, h, L.accent, w * 0.05, 83);
          if (L.name) { var f = w * 0.16; g.font = '900 ' + Math.round(f) + 'px "Arial Black", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
            g.lineJoin = 'round'; g.lineWidth = f * 0.24; g.strokeStyle = '#FFFFFF'; g.strokeText(L.name, w / 2, h * 0.84, w * 0.86); g.fillStyle = L.trim; g.fillText(L.name, w / 2, h * 0.84, w * 0.86); }
        }), -PI / 2, PI, 0, B.top + 0.004, zc);
        // the sign over the cab, lit
        var sw2 = B.w * 2 - 0.2, sh2 = 0.34;
        plane(sw2, sh2, panel(sw2, sh2, function (g, w, h) {
          g.fillStyle = L.trim; g.fillRect(0, 0, w, h);
          for (var k = 0; k < 26; k++) { g.fillStyle = k % 2 ? '#FFF3B0' : '#FFFFFF'; g.beginPath(); g.arc(w * (0.02 + k * 0.0384), h * 0.12, h * 0.05, 0, TAU); g.fill(); g.beginPath(); g.arc(w * (0.02 + k * 0.0384), h * 0.88, h * 0.05, 0, TAU); g.fill(); }
          g.font = '900 ' + Math.round(h * 0.52) + 'px "Arial Black", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
          g.lineWidth = h * 0.12; g.strokeStyle = '#3A1B2A'; g.strokeText(L.sign || 'ICE CREAM', w / 2, h * 0.52, w * 0.9); g.fillStyle = '#FFFFFF'; g.fillText(L.sign || 'ICE CREAM', w / 2, h * 0.52, w * 0.9);
        }, 1.4), 0, 0, 0, B.top - sh2 / 2 - 0.03, B.z1 + 0.16);
        bin.add(box(sw2 + 0.06, sh2 + 0.06, 0.16, 0, B.top - sh2 / 2 - 0.03, B.z1 + 0.07), MAT.satin);
        // the awning over the window: striped canvas on two arms, a scalloped edge
        var aw = new THREE.MeshStandardMaterial({ map: H.canvas(256, 64, function (g, w, h) { for (var k = 0; k < 8; k++) { g.fillStyle = k % 2 ? '#FFFFFF' : L.trim; g.fillRect(k * w / 8, 0, w / 8, h); } }), roughness: 0.8, side: THREE.DoubleSide });
        var ag = new THREE.PlaneGeometry(winW + 0.5, 0.62); ag.rotateX(PI / 2 + 0.42); ag.rotateY(-PI / 2); ag.translate(-B.w - 0.26, winY + winH + 0.16, winZ);
        var awn = new THREE.Mesh(ag, aw); awn.castShadow = true; body.add(awn);
        var scal = [new THREE.MeshStandardMaterial({ color: L.trim, roughness: 0.8, side: THREE.DoubleSide }), new THREE.MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.8, side: THREE.DoubleSide })];
        for (var k = 0; k < 9; k++) { var sc2 = new THREE.CircleGeometry(0.085, 12, PI, PI); sc2.rotateY(-PI / 2); sc2.translate(-B.w - 0.54, winY + winH + 0.04, winZ - (winW + 0.5) / 2 + 0.11 + k * (winW + 0.5 - 0.22) / 8); bin.add(sc2, scal[k % 2]); }
        [-1, 1].forEach(function (sd) { bin.add(tube(V(-B.w, winY + winH - 0.05, winZ + sd * (winW / 2 + 0.2)), V(-B.w - 0.52, winY + winH + 0.06, winZ + sd * (winW / 2 + 0.2)), 0.012, 6), MAT.chrome); });
        // bumpers, grille, the step at the back, mirrors on arms, amber lights on the box's corners
        bin.add(box(1.96, 0.16, 0.14, 0, 0.5, C.length / 2 + 0.04), MAT.chrome);
        bin.add(box(1.98, 0.16, 0.2, 0, 0.48, -C.length / 2 - 0.08), MAT.chrome);
        bin.add(box(1.2, 0.05, 0.34, 0, 0.36, -C.length / 2 - 0.22), MAT.steel);
        var gr2 = new THREE.PlaneGeometry(1.1, 0.24); gr2.translate(0, 0.72, C.length / 2 + 0.006); bin.add(gr2, MAT.intake);
        for (var gb2 = 0; gb2 < 4; gb2++) bin.add(box(1.1, 0.02, 0.02, 0, 0.62 + gb2 * 0.065, C.length / 2 + 0.012), MAT.chrome);
        [-1, 1].forEach(function (sd) {
          bin.add(tube(V(sd * 1.06, 1.75, 1.95), V(sd * 1.26, 1.82, 1.95), 0.014, 6), MAT.chrome);
          bin.add(box(0.06, 0.34, 0.2, sd * 1.3, 1.78, 1.95), MAT.satin);
          [B.z0 + 0.06, B.z1 - 0.06].forEach(function (z) { lampsX.add(box(0.12, 0.06, 0.06, sd * (B.w - 0.08), B.top + 0.03, z), lampAmber); });
        });
        // the topper on the roof: a figure on a spring
        if (L.topper === 'swirl') { topper = swirl(); topper.group.position.set(0, B.top, B.z0 + (B.z1 - B.z0) * 0.62); body.add(topper.group); }
      }
      // twin guns on the roof, firing ahead: the flash at each muzzle, the barrel's kick
      function guns() {
        var top = kind === 'van' ? C.box.top : lift + C.cabin.stations.reduce(function (m, s) { return Math.max(m, s.yb + s.h); }, 0);
        var z0 = kind === 'van' ? C.box.z1 - 0.32 : -0.2, xs = kind === 'van' ? 0.7 : 0.4;
        var gunMat = new THREE.MeshStandardMaterial({ color: '#2B2D31', roughness: 0.42, metalness: 0.85 });
        var flashMat = new THREE.MeshBasicMaterial({ map: TEX.glow, color: new THREE.Color('#FFC266').multiplyScalar(5), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
        var out = { flashes: [], barrels: [], muzzles: [], kick: [0, 0], lit: [0, 0] };
        [-1, 1].forEach(function (sd) {
          var x = sd * xs, y = top + 0.22;
          bin.add(box(0.22, 0.12, 0.36, x, top + 0.06, z0), MAT.satin);
          bin.add(tube(V(x, top + 0.1, z0), V(x, y - 0.04, z0 + 0.04), 0.035, 8), MAT.steel);
          var hs = new THREE.CylinderGeometry(0.075, 0.08, 0.46, 14); hs.rotateX(PI / 2); hs.translate(x, y, z0 + 0.1); bin.add(hs, gunMat);
          bin.add(box(0.11, 0.13, 0.2, x + sd * 0.12, y - 0.02, z0 + 0.02), new THREE.MeshStandardMaterial({ color: '#3F4F2E', roughness: 0.7 }));
          var bar = new THREE.Group(); bar.position.set(x, y, z0 + 0.33);
          var bg2 = new THREE.CylinderGeometry(0.026, 0.026, 0.62, 10); bg2.rotateX(PI / 2); bg2.translate(0, 0, 0.31); bar.add(new THREE.Mesh(bg2, gunMat));
          var mb = new THREE.CylinderGeometry(0.04, 0.04, 0.1, 10); mb.rotateX(PI / 2); mb.translate(0, 0, 0.62); bar.add(new THREE.Mesh(mb, MAT.steel));
          body.add(bar); out.barrels.push(bar);
          var f = new THREE.Group(); f.position.set(x, y, z0 + 0.33 + 0.68);
          var s1 = new THREE.PlaneGeometry(0.32, 0.72); s1.rotateX(PI / 2); s1.translate(0, 0, 0.26);
          f.add(new THREE.Mesh(s1, flashMat), new THREE.Mesh(s1.clone().rotateZ(PI / 2), flashMat), new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42), flashMat));
          f.visible = false; f.traverse(function (m) { m.userData.gmFx = true; m.userData.noReflection = true; }); body.add(f); out.flashes.push(f);
          out.muzzles.push({ x: x, y: y, z: z0 + 0.33 + 0.7 });
        });
        return out;
      }
      // the soft-serve on a spring: a waffle cone, a piped swirl with a grin, a cherry
      // for a nose and sprinkles for hair; it rocks with every lurch of the truck
      function swirl() {
        var g = new THREE.Group(), bend = new THREE.Group(), head = new THREE.Group(); g.add(bend);
        g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.05, 20).translate(0, 0.025, 0), MAT.satin));
        var coil = []; for (var i = 0; i <= 96; i++) { var u = i / 96, a = u * TAU * 6; coil.push(V(Math.cos(a) * 0.1, 0.05 + u * 0.4, Math.sin(a) * 0.1)); }
        var spring = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(coil), low ? 96 : 192, 0.016, 6, false), MAT.chrome); bend.add(spring);
        head.position.y = 0.45; bend.add(head);
        // the cone, point down, and its rim
        var waffle = new THREE.MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.75, map: H.canvas(256, 256, function (c, w, h) {
          c.fillStyle = '#DDA155'; c.fillRect(0, 0, w, h); c.strokeStyle = '#A9692A'; c.lineWidth = 6;
          for (var k = -8; k <= 16; k++) { c.beginPath(); c.moveTo(k * 32, 0); c.lineTo(k * 32 + h, h); c.stroke(); c.beginPath(); c.moveTo(k * 32, 0); c.lineTo(k * 32 - h, h); c.stroke(); }
        }) });
        waffle.map.wrapS = waffle.map.wrapT = THREE.RepeatWrapping; waffle.map.repeat.set(3, 1);
        head.add(new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.42, 28, 1, true).rotateX(PI).translate(0, 0.23, 0), waffle));
        head.add(new THREE.Mesh(new THREE.TorusGeometry(0.205, 0.03, 8, 28).rotateX(PI / 2).translate(0, 0.43, 0), waffle));
        // the swirl: a dome whose surface rises in a helical ridge, the tip curled over
        var NY = low ? 40 : 64, NA = low ? 28 : 44, Hs = 0.67, pos = [], idx = [];
        for (i = 0; i <= NY; i++) {
          var v = i / NY, y = 0.38 + v * Hs, rb = 0.25 * Math.pow(Math.max(0, 1 - v), 0.7);
          for (var j = 0; j <= NA; j++) {
            var ph = j / NA * TAU, ridge = 0.05 * Math.pow(0.5 + 0.5 * Math.cos(TAU * (v * Hs / 0.16) - ph), 1.6) * (1 - v * 0.55), r = rb + ridge * Math.min(1, rb / 0.05);
            pos.push(Math.sin(ph) * r + 0.07 * Math.pow(smooth(0.8, 1, v), 2), y, Math.cos(ph) * r);
          }
        }
        for (i = 0; i < NY; i++) for (j = 0; j < NA; j++) { var q0 = i * (NA + 1) + j; idx.push(q0, q0 + 1, q0 + NA + 1, q0 + 1, q0 + NA + 2, q0 + NA + 1); }
        var sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); sg.setIndex(idx); sg.computeVertexNormals();
        var cream = new THREE.MeshPhysicalMaterial({ color: L.swirl, roughness: 0.5, sheen: 0.7, sheenColor: new THREE.Color('#FFFFFF'), sheenRoughness: 0.45, clearcoat: 0.3, clearcoatRoughness: 0.3 });
        head.add(new THREE.Mesh(sg, cream), new THREE.Mesh(new THREE.CircleGeometry(0.27, 28).rotateX(PI / 2).translate(0, 0.38, 0), cream));
        // the face, toward the road ahead: big eyes under cheeky brows, a cherry nose, a wide grin
        var white = new THREE.MeshPhysicalMaterial({ color: '#FFFFFF', roughness: 0.2, clearcoat: 1 }), black = new THREE.MeshPhysicalMaterial({ color: '#0D0A0C', roughness: 0.15, clearcoat: 1 });
        var ink = new THREE.MeshStandardMaterial({ color: '#4A0C1E', roughness: 0.5 });
        [-1, 1].forEach(function (sd) {
          head.add(new THREE.Mesh(new THREE.SphereGeometry(0.062, 20, 14).scale(1, 1.15, 0.8).translate(sd * 0.072, 0.77, 0.152), white));
          head.add(new THREE.Mesh(new THREE.SphereGeometry(0.03, 14, 10).translate(sd * 0.068, 0.765, 0.198), black));
          head.add(new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 6).translate(sd * 0.06, 0.778, 0.224), white));
          head.add(new THREE.Mesh(new THREE.CapsuleGeometry(0.012, 0.06, 4, 8).rotateZ(PI / 2 + sd * 0.15).translate(sd * 0.078, sd > 0 ? 0.878 : 0.862, 0.14), ink));
        });
        var cherry = new THREE.MeshPhysicalMaterial({ color: '#C80E2A', roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.02 });
        head.add(new THREE.Mesh(new THREE.SphereGeometry(0.052, 20, 14).translate(0, 0.665, 0.205), cherry));
        head.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(V(0.005, 0.712, 0.215), V(0.012, 0.74, 0.24), V(0.04, 0.748, 0.262)), 8, 0.006, 5), new THREE.MeshStandardMaterial({ color: '#3B5A1E', roughness: 0.6 })));
        var smile = [], teeth = [];
        for (i = 0; i <= 16; i++) { var t2 = i / 8 - 1, sx = t2 * 0.125, sy = 0.585 - 0.055 * (1 - t2 * t2), sz = Math.sqrt(Math.max(0, 0.252 * 0.252 - sx * sx)) + 0.002; smile.push(V(sx, sy, sz)); teeth.push(V(sx * 0.9, sy + 0.016, sz + 0.006)); }
        head.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(smile), 32, 0.022, 8, false), ink));
        head.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(teeth.slice(3, 14)), 24, 0.011, 6, false), white));
        // sprinkles for hair, over the top of the swirl
        var cols = ['#FF3B6B', '#FFD23F', '#3BCEAC', '#4D7CFE', '#A55EEA', '#FFFFFF'], sb = new Bin(), sm = cols.map(function (c) { return new THREE.MeshStandardMaterial({ color: c, roughness: 0.35 }); }), sd2 = 3;
        function rnd() { sd2 = (sd2 * 16807) % 2147483647; return sd2 / 2147483647; }
        for (i = 0; i < 40; i++) {
          var vv = 0.62 + rnd() * 0.3, ph2 = rnd() * TAU, rr2 = 0.25 * Math.pow(1 - vv, 0.7) + 0.02;
          if (Math.cos(ph2) > 0.55 && vv < 0.74) continue;   // not over the eyes
          var sp3 = new THREE.CapsuleGeometry(0.011, 0.04, 3, 6); sp3.rotateX(rnd() * PI); sp3.rotateZ(rnd() * PI);
          sp3.translate(Math.sin(ph2) * rr2 + 0.07 * Math.pow(smooth(0.8, 1, vv), 2), 0.38 + vv * Hs + 0.01, Math.cos(ph2) * rr2); sb.add(sp3, sm[i % sm.length]);
        }
        sb.meshes(head);
        g.traverse(function (m) { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
        var S = { ax: 0, az: 0, vx: 0, vz: 0, sq: 0, vq: 0 };
        return {
          group: g,
          // a damped spring: it leans against the truck's acceleration and swings back past upright
          step: function (dt, acc, alat, heave, jolt) {
            if (jolt) { S.vx += (Math.random() - 0.5) * jolt * 14; S.vz += (Math.random() - 0.5) * jolt * 14; S.vq -= jolt * 3; }
            var tx = clamp(-acc * 0.014, -0.55, 0.55), tz = clamp(-alat * 0.022, -0.55, 0.55);
            S.vx += (-70 * (S.ax - tx) - 3.4 * S.vx) * dt; S.vz += (-70 * (S.az - tz) - 3.4 * S.vz) * dt;
            S.ax = clamp(S.ax + S.vx * dt, -0.9, 0.9); S.az = clamp(S.az + S.vz * dt, -0.9, 0.9);
            S.vq += (-160 * (S.sq + heave * 6) - 6 * S.vq) * dt; S.sq = clamp(S.sq + S.vq * dt, -0.3, 0.3);
            bend.rotation.set(S.ax, 0, S.az); spring.scale.y = 1 + S.sq; head.position.y = 0.45 * (1 + S.sq);
          },
        };
      }
      if (C.blower) {
        // a supercharger through the hood, with its scoop
        bin.add(box(0.5, 0.26, 0.62, 0, lift + 0.94, 1.45), MAT.chrome);
        bin.add(box(0.56, 0.2, 0.44, 0, lift + 1.16, 1.5), MAT.satin);
        var mouthB = new THREE.PlaneGeometry(0.46, 0.14); mouthB.translate(0, lift + 1.17, 1.725); bin.add(mouthB, MAT.intake);
      }
      if (L.spikes && kind === 'monster') {
        // a mean truck: spikes along the roof and the bed rails
        for (var k = 0; k < 7; k++) { var cone = new THREE.ConeGeometry(0.07, 0.3, 6); cone.translate(0, lift + 1.62, -0.7 + k * 0.14); bin.add(cone, MAT.chrome); }
        [-1, 1].forEach(function (sd) { for (var k2 = 0; k2 < 5; k2++) { var c2 = new THREE.ConeGeometry(0.06, 0.24, 6); c2.translate(sd * 1.02, lift + 0.9, -2.3 + k2 * 0.3); bin.add(c2, MAT.chrome); } });
      }
      if (C.chassis) {
        // the chassis: a tube frame, four-link bars, and two shocks at each corner
        var fy = lift - 0.1;
        [[-1, 1]].forEach(function () {
          [-1, 1].forEach(function (sd) { bin.add(tube(V(sd * 0.55, fy, -2.3), V(sd * 0.55, fy, 2.3), 0.05, 8), MAT.steel); });
          for (var r2 = -2; r2 <= 2; r2++) bin.add(tube(V(-0.55, fy, r2), V(0.55, fy, r2), 0.04, 8), MAT.steel);
        });
        [zf, zr].forEach(function (az) {
          [-1, 1].forEach(function (sd) {
            [-0.25, 0.25].forEach(function (dz) {
              var top = V(sd * 0.62, fy + 0.25, az + dz), bot = V(sd * 0.95, wf.r, az + dz * 0.6);
              bin.add(tube(top, bot, 0.075, 10), new THREE.MeshStandardMaterial({ color: '#E8C21A', roughness: 0.35, metalness: 0.4 }));
              bin.add(tube(top.clone().lerp(bot, 0.35), bot, 0.045, 8), MAT.chrome);
            });
            bin.add(tube(V(sd * 0.5, fy - 0.1, az - 0.8 * Math.sign(az)), V(sd * 1.0, wf.r, az), 0.035, 8), MAT.steel);
          });
          bin.add(tube(V(-1.1, wf.r, az), V(1.1, wf.r, az), 0.1, 10), MAT.steel); // the axle
        });
      }
      if (C.open) {
        // a single-seater's suspension: wishbones from the tub to each upright
        [[zf, wf], [zr, wr]].forEach(function (a) {
          [-1, 1].forEach(function (sd) {
            [0.24, 0.42].forEach(function (y0, n) {
              bin.add(tube(V(sd * 0.22, y0, a[0] + 0.3), V(sd * (a[1].x - a[1].w * 0.4), a[1].r + (n ? 0.12 : -0.12), a[0]), 0.016, 6), MAT.carbon);
              bin.add(tube(V(sd * 0.22, y0, a[0] - 0.3), V(sd * (a[1].x - a[1].w * 0.4), a[1].r + (n ? 0.12 : -0.12), a[0]), 0.016, 6), MAT.carbon);
            });
          });
        });
      }

      /* lamps */
      var lampsF = new Bin(), lampsR = new Bin(), lampsX = new Bin(), lampAmber = lampMat('#FFA41C', 4);
      if (kind === 'van') vanParts();
      if (L.armed) gunRig = guns();
      if (C.lamps === 'slit') {
        // thin blades of light along the top of the front pontoons
        [-1, 1].forEach(function (sd) { var g = box(0.26, 0.022, 0.05, sd * 0.68, lift + 0.49, 2.02); g.rotateY(sd * 0.3); lampsF.add(g, lampF); lampsX.add(box(0.2, 0.01, 0.03, sd * 0.66, lift + 0.47, 2.0), lampX); });
      } else if (C.lamps === 'round') {
        // round lamps set into the tops of the front wings, under glass, in a bright bezel
        [-1, 1].forEach(function (sd) {
          var lx = sd * 0.62, ly = lift + 0.53, lz = HL - 0.26;
          var disc = new THREE.CircleGeometry(0.088, 28); disc.rotateX(-0.5); disc.translate(lx, ly, lz); lampsF.add(disc, lampF);
          var bz = new THREE.TorusGeometry(0.095, 0.012, 8, 28); bz.rotateX(-0.5); bz.translate(lx, ly + 0.004, lz + 0.006); bin.add(bz, MAT.chrome);
          var lens = new THREE.SphereGeometry(0.094, 20, 8, 0, TAU, 0, PI * 0.28); lens.rotateX(PI / 2 - 0.5); lens.translate(lx, ly - 0.03, lz - 0.05); bin.add(lens, MAT.lens);
          lampsX.add(box(0.12, 0.012, 0.02, sd * 0.56, lift + 0.33, HL - 0.1), lampX);
        });
      } else if (C.lamps === 'decal' || C.lamps === 'truck') {
        [-1, 1].forEach(function (sd) {
          var y = kind === 'monster' ? lift + 0.52 : 0.52, zz = kind === 'monster' ? 2.56 : 2.36, xx = kind === 'monster' ? 0.72 : 0.64;
          var g = new THREE.CircleGeometry(kind === 'monster' ? 0.12 : 0.1, 18); g.scale(1.5, 0.7, 1); g.rotateX(-0.3); g.translate(sd * xx, y, zz); lampsF.add(g, lampF);
        });
        if (kind === 'monster') for (var lb = 0; lb < 6; lb++) lampsF.add(box(0.14, 0.08, 0.08, -0.5 + lb * 0.2, lift + 1.56, 0.5), lampF); // the roof light bar
      }
      if (C.lamps === 'van') {
        // square lamps either side of the grille, amber indicators beside them
        [-1, 1].forEach(function (sd) {
          lampsF.add(box(0.26, 0.17, 0.02, sd * 0.68, 0.74, C.length / 2 + 0.01), lampF);
          bin.add(box(0.3, 0.21, 0.03, sd * 0.68, 0.74, C.length / 2 - 0.005), MAT.chrome);
          lampsX.add(box(0.09, 0.08, 0.02, sd * 0.9, 0.74, C.length / 2 - 0.05), lampAmber);
        });
      }
      if (C.tail === 'van') {
        // tall lamps up the back corners: tail, indicator, reverse
        [-1, 1].forEach(function (sd) {
          lampsR.add(box(0.13, 0.3, 0.02, sd * 0.94, 0.98, -C.length / 2 - 0.016), lampR);
          lampsX.add(box(0.13, 0.12, 0.02, sd * 0.94, 1.22, -C.length / 2 - 0.016), lampAmber);
        });
      }
      if (C.tail === 'bar') {
        var ty = C.tailY || 0.7, tw = C.tailY ? 0.6 : 0.8;
        lampsR.add(box(C.width * tw, 0.026, 0.02, 0, lift + ty, -HL - 0.012), lampR);
        [-1, 1].forEach(function (sd) { lampsR.add(box(0.05, 0.16, 0.02, sd * C.width * tw / 2, lift + ty - 0.08, -HL - 0.012), lampR); });
      } else if (C.tail === 'round') {
        // two round lamps a side, set into the tail
        [-1, 1].forEach(function (sd) { [0.46, 0.3].forEach(function (lx2) {
          var tl = new THREE.CircleGeometry(0.048, 20); tl.rotateY(PI); tl.translate(sd * lx2, lift + 0.5, -HL - 0.006); lampsR.add(tl, lampR);
          var tb = new THREE.TorusGeometry(0.05, 0.008, 6, 20); tb.translate(sd * lx2, lift + 0.5, -HL - 0.006); bin.add(tb, MAT.chrome);
        }); });
      } else if (C.tail === 'rain') {
        lampsR.add(box(0.12, 0.06, 0.02, 0, 0.5, -2.34), lampR);
      } else if (C.tail === 'decal' || C.tail === 'truck') {
        [-1, 1].forEach(function (sd) { lampsR.add(box(0.34, 0.07, 0.02, sd * 0.62, lift + (kind === 'monster' ? 0.6 : 0.72), (kind === 'monster' ? -2.5 : -2.46) - 0.012), lampR); });
      }
      /* exhausts, with flames that show on the overrun and the shifts */
      var pipes = [];
      if (C.exhaust === 'centre') { pipes.push(V(0, lift + 0.44, -HL + 0.02), V(-0.12, lift + 0.36, -HL + 0.04), V(0.12, lift + 0.36, -HL + 0.04)); }
      else if (C.exhaust === 'formula') pipes.push(V(0, 0.6, -2.1));
      else if (C.exhaust === 'side') pipes.push(V(-1.0, 0.22, -0.2), V(-1.0, 0.22, 0.0));
      else if (C.exhaust === 'stacks') pipes.push(V(0.32, lift + 1.35, 1.2), V(-0.32, lift + 1.35, 1.2));
      else if (C.exhaust === 'twin') pipes.push(V(0.3, lift + 0.28, -HL + 0.05), V(-0.3, lift + 0.28, -HL + 0.05));
      else if (C.exhaust === 'rear') pipes.push(V(-0.72, 0.36, -HL - 0.1));
      // the tips glow hot at night; by day they are just dark pipes
      var tipMat = H.day && H.day() ? MAT.intake : lampMat('#FF6A1A', 1.6);
      pipes.forEach(function (p, i) {
        var side = C.exhaust === 'side', stack = C.exhaust === 'stacks', r0 = i === 0 && C.exhaust === 'centre' ? 0.075 : 0.048;
        var g = new THREE.CylinderGeometry(r0, r0 * 1.05, 0.16, 14, 1, true);
        var core = new THREE.CircleGeometry(r0 * 0.8, 14);
        if (side) { g.rotateZ(PI / 2); core.rotateY(-PI / 2); core.translate(-0.06, 0, 0); }
        else if (stack) { core.rotateX(-PI / 2); core.translate(0, 0.06, 0); }
        else { g.rotateX(PI / 2); core.rotateY(PI); core.translate(0, 0, -0.05); }
        g.translate(p.x, p.y, p.z); core.translate(p.x, p.y, p.z); bin.add(g, MAT.chrome); lampsR.add(core, tipMat);
      });
      var flameMat = new THREE.MeshBasicMaterial({ map: TEX.glow, color: new THREE.Color('#FF7A2A').multiplyScalar(4), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
      var flames = pipes.map(function (p) {
        var f = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.6, 10, 1, true), flameMat);
        var side = C.exhaust === 'side', stack = C.exhaust === 'stacks';
        if (side) { f.rotation.z = PI / 2; f.position.set(p.x - 0.3, p.y, p.z); }
        else if (stack) { f.position.set(p.x, p.y + 0.38, p.z); }
        else { f.rotation.x = -PI / 2; f.position.set(p.x, p.y, p.z - 0.3); }
        f.userData.gmFx = true; f.visible = false; body.add(f); return f;
      });

      var glow = null;
      if (L.glow) {
        // neon under the car: a meaner rival's
        var gm = new THREE.MeshBasicMaterial({ map: TEX.contact, color: new THREE.Color(L.glow).multiplyScalar(2.5), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
        glow = new THREE.Mesh(new THREE.PlaneGeometry(C.width * 1.9, C.length * 1.35), gm); glow.rotation.x = -PI / 2; glow.position.y = 0.02; glow.userData.gmFx = true; root.add(glow);
        lampsX.add(box(C.width * 0.8, 0.02, 0.02, 0, lift + 0.06, HL * 0.6), lampX);
      }

      lampsF.meshes(body, false); lampsR.meshes(body, false); lampsX.meshes(body, false);
      bin.meshes(body);

      /* wheels */
      var wheels = [[wf, zf, 1, true], [wf, zf, -1, true], [wr, zr, 1, false], [wr, zr, -1, false]].map(function (w) {
        var W = wheel(w[0], C, look, w[2]);
        W.group.position.set(w[2] * w[0].x, w[0].r, w[1]); W.front = w[3]; W.side = w[2]; W.base = w[0].r;
        chassis.add(W.group);
        return W;
      });
      // a monster truck's wheels are part of its chassis (they don't roll with the body)
      /* headlight beams: a soft cone of light ahead, and the contact shadow */
      var beams = null;
      if (C.lamps !== 'rain' && !(H.day && H.day())) {
        var bmat = beamMat(kind === 'monster' ? '#FFE3A8' : '#CFE2FF');
        beams = new THREE.Group();
        [-1, 1].forEach(function (sd) {
          var cone = new THREE.Mesh(new THREE.ConeGeometry(1.4, 9, 16, 1, true), bmat);
          cone.rotation.x = -PI / 2 - 0.06; cone.position.set(sd * 0.62, lift + 0.45, HL + 4.4); beams.add(cone);
        });
        beams.traverse(function (b) { b.userData.gmFx = true; b.userData.noReflection = true; });
        root.add(beams);
      }
      var shadow = new THREE.Mesh(new THREE.PlaneGeometry(C.width * 1.25, C.length * 1.12), MAT.contact);
      shadow.rotation.x = -PI / 2; shadow.position.y = 0.012; shadow.userData.gmFx = true; shadow.renderOrder = 1; root.add(shadow);
      // everything whose reflection should be the live street (paint, glass, chrome)
      var reflective = [paint, MAT.glass, MAT.screen, MAT.carbon, look.rim, MAT.chrome, MAT.visor, MAT.lens];
      reflective.forEach(function (m) { m.userData.gmLive = true; });

      /* --- driving --- */
      var st = {
        spin: 0, steer: 0, roll: 0, pitch: 0, heave: 0, hv: 0, yaw: null, yr: 0, v0: 0, acc: 0, lat0: 0, alat: 0,
        gear: 1, rpm: C.idle, shift: 0, pop: 0, heat: 0, crash: 0, crashed: false, wrecked: false, cs: { spin: 0, roll: 0, lift: 0, vy: 0, side: 1, flip: 0 },
        sparkT: 0, bump: 0, t: 0, wheelHop: [0, 0, 0, 0], throttle: 0, brake: 0, launch: 0,
      };
      var world = new THREE.Vector3(), fwd = new THREE.Vector3(), rgt = new THREE.Vector3(), q = new THREE.Quaternion(), tmp3 = new THREE.Vector3();
      // where the engine is (its steam, smoke and fire), and the colour a fire leaves the paint
      var ENG = kind === 'van' ? V(0, 1.18, 2.4) : V(0, lift + interp(C.body, HL * 0.6, 'yt', 0.8) - 0.04, kind === 'formula' ? -1.2 : HL * 0.62), SCORCH = new THREE.Color('#3A2C28');
      if (gunRig) gunRig.barrelZ = gunRig.barrels[0].position.z;
      function gearFor(v) { var g = 1; while (g < C.gears.length - 1 && v > C.gears[g] * 0.97) g++; return g; }
      function animate(t, dt, S) {
        if (S.paused || !(dt > 0)) return;
        var v = S.speed || 0, F = fx();
        st.t += dt;
        var acc = (v - st.v0) / dt; st.v0 = v;
        st.acc = damp(st.acc, clamp(acc, -40, 40), 6, dt);
        var lat = S.lateral || 0, dlat = (lat - st.lat0) / dt; st.lat0 = lat;
        // the carrier's heading: how fast it turns, for the lean out of a bend
        root.getWorldQuaternion(q); fwd.set(0, 0, 1).applyQuaternion(q);
        var yaw = Math.atan2(fwd.x, fwd.z);
        if (st.yaw !== null) { var dy = yaw - st.yaw; if (dy > PI) dy -= TAU; if (dy < -PI) dy += TAU; st.yr = damp(st.yr, clamp(dy / dt, -2, 2), 5, dt); }
        st.yaw = yaw;
        // lateral acceleration to the right (a right-hand bend, or a steer right)
        st.alat = damp(st.alat, clamp(-v * st.yr + dlat * 0.35, -30, 30), 5, dt);
        st.throttle = damp(st.throttle, S.boost ? 1 : S.brake ? 0 : clamp(0.55 + st.acc * 0.08, 0.2, 1), 8, dt);
        st.brake = damp(st.brake, S.brake || st.acc < -6 ? 1 : 0, 10, dt);

        if (S.crashed) {
          // the crash: once, the sparks, the smoke, the shards; then the car tumbles to rest
          if (!st.crashed) {
            st.crashed = true; var cs = st.cs;
            cs.side = st.alat > 0 ? -1 : 1; cs.spin = (kind === 'monster' ? 2.5 : 5.5) * cs.side; cs.vy = kind === 'monster' ? 5 : kind === 'formula' ? 3.2 : 2.4;
            cs.flip = kind === 'monster' ? 7 * cs.side : kind === 'formula' ? 0 : 2.4 * cs.side;
            root.getWorldPosition(world);
            for (var n = 0; n < 60; n++) F.spark(world.clone().add(tmp3.set((Math.random() - 0.5) * 2, 0.3, (Math.random() - 0.5) * 3)), fwd.clone().multiplyScalar(v * 0.4), 9, 0.8);
            for (n = 0; n < 16; n++) F.puff(world.clone().add(tmp3.set((Math.random() - 0.5) * 2, 0.5, (Math.random() - 0.5) * 3)), tmp3.set((Math.random() - 0.5) * 3, 1 + Math.random(), (Math.random() - 0.5) * 3), 1.2 + Math.random(), 2.2);
            for (n = 0; n < 16; n++) F.debris(world.clone().add(tmp3.set(0, 0.6, 0)), tmp3.set((Math.random() - 0.5) * 12, 3 + Math.random() * 5, (Math.random() - 0.5) * 12).addScaledVector(fwd, v * 0.3));
          }
          var cs2 = st.cs;
          st.crash += dt;
          cs2.vy -= 14 * dt; cs2.lift = Math.max(0, cs2.lift + cs2.vy * dt); if (cs2.lift === 0 && cs2.vy < 0) { cs2.vy *= -0.3; cs2.spin *= 0.6; cs2.flip *= 0.5; }
          cs2.spin *= 1 - dt * 1.4; cs2.flip *= 1 - dt * 1.2;
          chassis.rotation.y += cs2.spin * dt;
          chassis.rotation.z += cs2.flip * dt;
          chassis.position.y = cs2.lift + (Math.abs(Math.sin(chassis.rotation.z)) * C.width * 0.45);
          if (Math.random() < dt * 12) { root.getWorldPosition(world); F.puff(world.add(tmp3.set(0, 0.6, 0)), tmp3.set(0, 1.2, 0), 1.4, 2.4); }
          flameMat.opacity = 0; flames.forEach(function (f) { f.visible = false; });
          return;
        } else if (st.crashed) {
          st.crashed = false; st.crash = 0; chassis.rotation.set(0, 0, 0); chassis.position.set(0, 0, 0); st.cs.lift = 0; st.cs.vy = 0;
        }
        // damage (S.damage 0..1): steam from under the bonnet, then smoke; a wreck
        // (S.wrecked) is dead: down on one side, its lamps out, burning, the paint
        // scorching; a hit (S.jolt 0..1) shakes the body and whatever rides on it
        var dmg = clamp(S.damage || 0, 0, 1), dead = !!S.wrecked;
        if (dead !== st.wrecked) {
          st.wrecked = dead; st.burn = 0; st.scorch = 0;
          lampF.color.copy(lampF.userData.base).multiplyScalar(dead ? 0.04 : lampF.userData.k);
          if (!dead) paint.color.set('#FFFFFF');
        }
        if (S.jolt) { st.hv -= S.jolt * 0.9; st.roll += (Math.random() - 0.5) * S.jolt * 0.12; }
        if (dmg > 0.45 || dead) {
          root.updateWorldMatrix(true, false);
          st.smk = (st.smk || 0) + dt * (dead ? (low ? 5 : 9) : dmg > 0.7 ? 3 + (dmg - 0.7) * 20 : 2 + dmg * 6);
          while (st.smk > 1) { st.smk--; F.puff(root.localToWorld(tmp3.copy(ENG)), _v.set((Math.random() - 0.5) * 0.6, 1 + Math.random(), (Math.random() - 0.5) * 0.6), dead ? 1.4 : dmg > 0.7 ? 0.9 : 0.6, dead ? 2.6 : 1.5, dead ? 0.28 : dmg > 0.7 ? 0.6 : 1.3); }
          if (dead) {
            st.burn += dt;
            var burning = Math.min(1, st.burn / 1.5) * Math.max(0.3, 1 - st.burn / 45);
            st.fl = (st.fl || 0) + dt * (low ? 14 : 28) * burning;
            while (st.fl > 1) { st.fl--; F.fire(root.localToWorld(tmp3.copy(ENG).add(_v2.set((Math.random() - 0.5) * C.width * 0.5, 0, (Math.random() - 0.5) * 0.8))), _v.set(0, 0, 0), 1 + burning * 1.2, 0.75); }
            st.scorch = Math.min(0.72, st.scorch + dt * 0.03); paint.color.set('#FFFFFF').lerp(SCORCH, st.scorch);
          }
        }
        if (dead) {
          // dead on its springs, settled to one side
          st.roll = damp(st.roll, 0.05, 3, dt); st.pitch = damp(st.pitch, 0.02, 3, dt);
          body.rotation.set(st.pitch, 0, st.roll); body.position.y = damp(body.position.y, -0.08, 3, dt);
          flameMat.opacity = 0; flames.forEach(function (f) { f.visible = false; });
          if (topper) topper.step(dt, 0, 0, 0, S.jolt || 0);
          if (gunRig) gunRig.flashes.forEach(function (f) { f.visible = false; });
          st.rpm = damp(st.rpm, 0, 4, dt);
          return;
        }

        /* wheels: roll, steer, blur */
        var wspin = v / wf.r;
        st.spin = (st.spin + wspin * dt) % TAU;
        st.steer = damp(st.steer, clamp(lat / Math.max(v, 8) * 1.6, -0.45, 0.45), 10, dt);
        // a launch: the rear wheels spin up and smoke off the line
        st.launch = v > 0.5 && v < 14 && st.acc > 3 ? 1 : Math.max(0, st.launch - dt * 2);
        var blurK = smooth(18, 40, wspin), wobble = 0;
        for (var i = 0; i < 4; i++) {
          var W = wheels[i];
          W.spin.rotation.x = st.spin;
          if (W.front) W.group.rotation.y = -st.steer;
          W.blur.material.opacity = blurK * 0.85;
          W.spokes.visible = blurK < 0.98;
          // a monster truck's wheels ride the bumps on their own
          if (kind === 'monster') {
            st.wheelHop[i] = damp(st.wheelHop[i], (Math.sin(st.t * (3.1 + i * 0.7) + i * 1.3) * 0.5 + Math.sin(st.t * 7.3 + i)) * 0.05 * clamp(v / 25, 0, 1.4), 8, dt);
            W.group.position.y = W.base + st.wheelHop[i];
            wobble += st.wheelHop[i] / 4;
          }
        }
        /* the body on its springs: roll out of the bend, dive and squat, heave */
        var roll = clamp(-st.alat * C.roll, -0.16, 0.16), pitch = clamp(-st.acc * C.pitch * 0.12, -0.08, 0.08);
        st.roll = damp(st.roll, roll, kind === 'monster' ? 4 : 7, dt); st.pitch = damp(st.pitch, pitch, kind === 'monster' ? 3.5 : 6, dt);
        // the road's small bumps, felt more at speed and far more by a truck
        st.bump -= dt;
        if (st.bump <= 0) { st.bump = 0.08 + Math.random() * 0.25; st.hv += (Math.random() - 0.5) * C.bounce * 60 * clamp(v / 40, 0.2, 1.6); }
        st.hv += (-st.heave * 180 - st.hv * 14) * dt; st.heave += st.hv * dt;
        body.rotation.set(st.pitch + (kind === 'monster' ? st.heave * 0.6 : 0), 0, st.roll);
        body.position.y = st.heave * (kind === 'monster' ? 3 : 1) + wobble;
        D.steer(st.steer);
        if (cockpit.onSteer) cockpit.onSteer(st.steer * D.turn, dt, st);

        /* the gearbox and the exhaust */
        var g = gearFor(v), vmax = C.gears[g] || 1, vmin = g > 1 ? C.gears[g - 1] * 0.97 : 0;
        if (g !== st.gear) { if (g > st.gear) { st.shift = 0.12; st.pop = 0.1; } else st.pop = 0.18; st.gear = g; }
        var frac = clamp((v - vmin * 0.62) / Math.max(1, vmax - vmin * 0.62), 0, 1.02);
        var rpmT = v < 1 ? C.idle : lerp(C.idle + (C.redline - C.idle) * 0.42, C.redline, frac);
        if (st.launch > 0) rpmT = C.redline * 0.82;
        st.shift = Math.max(0, st.shift - dt);
        st.rpm = damp(st.rpm, st.shift > 0 ? rpmT * 0.72 : rpmT, st.shift > 0 ? 30 : 9, dt);
        // lifting off: the overrun crackles
        if (st.acc < -5 && v > 20 && Math.random() < dt * 8) st.pop = Math.max(st.pop, 0.07);
        st.pop = Math.max(0, st.pop - dt);
        var fl = st.pop > 0 ? 0.6 + Math.random() * 0.5 : 0;
        flameMat.opacity = fl;
        for (i = 0; i < flames.length; i++) { flames[i].visible = fl > 0; flames[i].scale.set(0.7 + Math.random() * 0.6, 0.6 + Math.random() * 0.9, 0.7 + Math.random() * 0.6); }
        /* lamps: the brake lights flare, discs glow after a hard stop */
        lampR.color.copy(lampR.userData.base).multiplyScalar(st.brake > 0.3 ? 9 : 2.2);
        st.heat = clamp(st.heat + (st.brake > 0.5 && v > 30 ? dt * 0.9 : -dt * 0.25), 0, 1);
        look.disc.emissiveIntensity = st.heat * 2.5;
        /* sparks from the skid block, smoke off the line */
        if (C.sparks && v > 30) {
          st.sparkT -= dt;
          var rate = 0.04 + (Math.abs(st.heave) > 0.002 ? 0.25 : 0) + Math.abs(st.alat) * 0.004;
          if (st.sparkT <= 0 && Math.random() < rate * 60 * dt + 0.02) {
            st.sparkT = 0.02;
            root.getWorldPosition(world); rgt.set(1, 0, 0).applyQuaternion(q);
            var n2 = 3 + Math.floor(Math.random() * 7);
            for (var s = 0; s < n2; s++) F.spark(tmp3.copy(world).addScaledVector(fwd, -0.9 - Math.random() * 1.2).addScaledVector(rgt, (Math.random() - 0.5) * 0.3).setY(0.05), _v.copy(fwd).multiplyScalar(v * (0.35 + Math.random() * 0.3)), 2.2, 0.25 + Math.random() * 0.35);
          }
        }
        if (st.launch > 0 && Math.random() < dt * 30) {
          root.getWorldPosition(world); rgt.set(1, 0, 0).applyQuaternion(q);
          [-1, 1].forEach(function (sd) { F.puff(tmp3.copy(world).addScaledVector(fwd, zr).addScaledVector(rgt, sd * wr.x).setY(0.3), _v.set((Math.random() - 0.5) * 1.5, 0.6, (Math.random() - 0.5) * 1.5), kind === 'monster' ? 1.6 : 0.9, 1.4); });
        }
        /* what rides on it: the figure on its spring, the guns */
        if (topper) topper.step(dt, st.acc, st.alat, st.heave, S.jolt || 0);
        if (gunRig) {
          if (S.fire) { var gk = (S.fireSide | 0) % 2; gunRig.lit[gk] = 0.045; gunRig.kick[gk] = 1; }
          for (var gi = 0; gi < 2; gi++) {
            var lit = gunRig.lit[gi] -= dt, fsh = gunRig.flashes[gi];
            fsh.visible = lit > 0; if (lit > 0) { fsh.rotation.z = Math.random() * TAU; fsh.scale.setScalar(0.75 + Math.random() * 0.5); }
            gunRig.kick[gi] = Math.max(0, gunRig.kick[gi] - dt * 14); gunRig.barrels[gi].position.z = gunRig.barrelZ - gunRig.kick[gi] * 0.07;
          }
        }
      }
      root.userData.gmVehicle = true;
      // hitbox: the car's own footprint (length and width), not its lights
      return {
        object: root, animate: animate, name: word(o.name, '', 24) || undefined, color: hx(o.color, L.paint), cockpit: cockpit,
        vehicle: { kind: kind, length: C.length, width: C.width, height: Math.max((C.lift || 0) + (C.cabin.stations.reduce(function (m, s) { return Math.max(m, s.yb + s.h); }, 0)), C.box ? C.box.top : 0), engine: C.engine, state: st, redline: C.redline, idle: C.idle, mass: C.mass,
          // where the guns' muzzles are (armed), in the car's own frame
          muzzles: gunRig ? gunRig.muzzles.map(function (m) { return { x: m.x, y: m.y, z: m.z }; }) : null },
      };
    }
    // fx(): the sparks, smoke, fire and debris the cars throw, for whatever else needs them (a gun's hits, a wreck)
    return { car: car, step: function (dt) { if (FX) FX.step(dt); }, fx: function () { return fx(); }, classes: KINDS };
  }

  /* ------------------------------------------------------ the engine note -- */
  // An engine synthesised from its revs: the firing frequency as a sawtooth
  // and a square an octave down (a V8's burble), a whine an octave up, all
  // driven into a soft clipper and a low-pass that opens with the revs and
  // the throttle; intake roar as band-passed noise pulsed at the firing
  // rate; a turbo's whistle or a blower's whine; a hybrid's electric hum.
  // set(rpm, throttle) each frame; pan and level for a car passing by.
  function engine(ac, out, type) {
    var E = ENGINES[type] || ENGINES.v6turbo;
    var t0 = ac.currentTime;
    var bus = ac.createGain(); bus.gain.value = 0;
    var pan = ac.createStereoPanner ? ac.createStereoPanner() : null;
    if (pan) { bus.connect(pan); pan.connect(out); } else bus.connect(out);
    var lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 1.4; lp.frequency.value = E.cut[0];
    var shaper = ac.createWaveShaper(), curve = new Float32Array(1024);
    for (var i = 0; i < 1024; i++) { var x = i / 512 - 1; curve[i] = Math.tanh(x * E.drive) / Math.tanh(E.drive); }
    shaper.curve = curve; shaper.oversample = '2x';
    var pre = ac.createGain(); pre.gain.value = 0.5;
    pre.connect(shaper); shaper.connect(lp); lp.connect(bus);
    // the firing pulse: amplitude modulation at the firing rate gives the note its grain
    var am = ac.createGain(); am.gain.value = 0.7; am.connect(pre);
    var amOsc = ac.createOscillator(); amOsc.type = 'sine'; var amDepth = ac.createGain(); amDepth.gain.value = 0.3; amOsc.connect(amDepth); amDepth.connect(am.gain);
    function osc(typeName, gain) { var o = ac.createOscillator(); o.type = typeName; var g = ac.createGain(); g.gain.value = gain; o.connect(g); g.connect(am); o.start(t0); return o; }
    var saw = osc('sawtooth', E.saw), sq = osc('square', E.sq), wh = osc('triangle', E.whine), bur = osc('sine', E.burble);
    amOsc.start(t0);
    // intake and exhaust roar
    var nb = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate), nd = nb.getChannelData(0);
    for (i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    var noise = ac.createBufferSource(); noise.buffer = nb; noise.loop = true;
    var bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.9;
    var ng = ac.createGain(); ng.gain.value = E.noise;
    noise.connect(bp); bp.connect(ng); ng.connect(lp); noise.start(t0);
    // a turbo whistle, a blower's whine, a hybrid's hum: clean sines over the top
    var extra = [];
    [['turbo', 1], ['blower', 1], ['hybrid', 1]].forEach(function (e) {
      if (!E[e[0]]) return;
      var o = ac.createOscillator(); o.type = 'sine'; var g = ac.createGain(); g.gain.value = 0; o.connect(g); g.connect(bus); o.start(t0);
      extra.push({ kind: e[0], o: o, g: g, k: E[e[0]] });
    });
    var state = { rpm: 0, thr: 0 };
    function set(rpm, throttle, speed) {
      var now = ac.currentTime, f = rpm / 60 * E.cyl / 2;
      state.rpm = rpm; state.thr = throttle;
      saw.frequency.setTargetAtTime(f, now, 0.02); sq.frequency.setTargetAtTime(f / 2, now, 0.02); wh.frequency.setTargetAtTime(f * 2, now, 0.02); bur.frequency.setTargetAtTime(f / 2, now, 0.02);
      amOsc.frequency.setTargetAtTime(f, now, 0.02);
      bp.frequency.setTargetAtTime(Math.min(8000, f * 3.2), now, 0.03);
      var open = E.cut[0] + (E.cut[1] - E.cut[0]) * clamp((rpm - 1000) / 11000, 0, 1) * (0.55 + 0.45 * throttle);
      lp.frequency.setTargetAtTime(open, now, 0.03);
      ng.gain.setTargetAtTime(E.noise * (0.4 + 0.8 * throttle), now, 0.05);
      extra.forEach(function (x) {
        var hz = x.kind === 'turbo' ? 2400 + rpm * 0.55 : x.kind === 'blower' ? rpm * 1.6 : 180 + (speed || 0) * 22;
        x.o.frequency.setTargetAtTime(hz, now, 0.05);
        x.g.gain.setTargetAtTime(x.k * (x.kind === 'turbo' ? throttle * clamp((rpm - 4000) / 6000, 0, 1) : x.kind === 'hybrid' ? clamp((speed || 0) / 60, 0, 1) : 0.6 + 0.4 * throttle), now, 0.08);
      });
    }
    // level (0..1) and pan (-1..1), for this voice's place in the mix
    function mix(level, p) {
      var now = ac.currentTime;
      bus.gain.setTargetAtTime(clamp(level, 0, 1.5) * E.gain * 0.22, now, 0.06);
      if (pan) pan.pan.setTargetAtTime(clamp(p || 0, -1, 1), now, 0.06);
    }
    // a pop on the overrun, or a shift's crack
    function pop(k) {
      var now = ac.currentTime, n = ac.createBufferSource(), g = ac.createGain(), f = ac.createBiquadFilter();
      n.buffer = nb; f.type = 'bandpass'; f.frequency.value = 900 + Math.random() * 900; f.Q.value = 0.8;
      g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(0.35 * (k || 1), now + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);
      n.connect(f); f.connect(g); g.connect(bus); n.start(now, Math.random()); n.stop(now + 0.09);
    }
    function stop() { var now = ac.currentTime; bus.gain.setTargetAtTime(0, now, 0.1); [saw, sq, wh, bur, amOsc, noise].concat(extra.map(function (x) { return x.o; })).forEach(function (o) { try { o.stop(now + 0.5); } catch (e) {} }); }
    return { set: set, mix: mix, pop: pop, stop: stop, state: state, type: type };
  }

  return { kit: kit, engine: engine, classes: KINDS, engines: Object.keys(ENGINES) };
})();
