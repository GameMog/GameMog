// Story Kit vehicles: the class presets. Each is one hand-tuned base shape (metres; the car stands on y = 0, nose to
// +z), the defaults a sheet starts from, and the handling and sound it has with every knob at 0. A sheet's knobs move
// these numbers (build-vehicle.js resolveShape); nothing here is a real car.
//
// Shape fields:
//   L, W         body length (sheet metal, bumpers stand proud) and half width
//   wb, fo       wheelbase, front overhang (nose to the front axle)
//   WR, RIM, TW  tyre radius, rim radius, tyre width;  WXin: the wheel centre's x in from W
//   yb           the body's bottom edge (the sill)
//   yNose, yCowl, yBelt, yTail   the shoulder line: the bonnet's front, the windscreen's foot, the belt at the B
//                pillar, the deck or belt at the tail
//   yRoof        the roof's top;  roofFall: how far it falls to its front and back edges
//   cowl         the windscreen's foot, back from the nose
//   roofF        the roof's front edge (the windscreen's top), back from the nose
//   roofR        the roof's back edge, forward of the tail;  back: the back glass's foot, forward of the tail
//   wRoof        the roof's half width;  RF, RR: the plan's corner radii, nose and tail
//   crease, clad the side crease's height; cladding's top (0: none)
//   win          the side glass in belt-z fractions of the side (front to back): [[from, to, glass], ...]; the rest
//                is pillar (the B and C pillars black, the last one painted)
//   bumpF        how much of the nose's face the bumper takes (0.42 if left out)

const W4 = [[0.03, 0.38, 'front'], [0.405, 0.67, 'rear'], [0.695, 0.9, 'rear']];

export const CLASSES = {
  suv: {
    L: 4.69, W: 0.905, wb: 2.89, fo: 0.86, WR: 0.375, RIM: 0.203, TW: 0.245, WXin: 0.125,
    yb: 0.42, yNose: 1.072, yCowl: 1.17, yBelt: 1.19, yTail: 1.2, yRoof: 1.765, roofFall: 0.012,
    cowl: 1.35, roofF: 2.285, roofR: 0.09, back: 0.025, wRoof: 0.725, RF: 0.17, RR: 0.09, crease: 0.95, clad: 0.6,
    win: [[0.035, 0.37, 'front'], [0.405, 0.67, 'rear'], [0.695, 0.9, 'rear']], tumble: 0.012, crown: 0.02,
    rear: 'wagon', doors: 5, roof: 'fixed', noun: 'suv',
    face: { lamps: 'wraparound', grille: 'horizontal-bars', bumper: 'body', fog: true },
    tail: { lamps: 'vertical', exhaust: 'single', plate: 'center' }, trim: 'black', pillar: 'paint',
    wheels: { style: 'five-spoke', finish: 'silver', tyre: 'all-terrain' },
    interior: { seat: '#2C2E31', material: 'cloth', dash: 'analog', wheel: 'three-spoke' },
    sound: { engine: 'v8', character: 0 }, handling: { character: 'floaty' },
  },
  crossover: {
    L: 4.55, W: 0.92, wb: 2.7, fo: 0.92, WR: 0.36, RIM: 0.229, TW: 0.235, WXin: 0.12,
    yb: 0.38, yNose: 0.95, yCowl: 1.08, yBelt: 1.1, yTail: 1.13, yRoof: 1.66, roofFall: 0.03,
    cowl: 1.4, roofF: 2.1, roofR: 0.22, back: 0.07, wRoof: 0.68, RF: 0.24, RR: 0.16, crease: 0.86, clad: 0.52,
    win: [[0.035, 0.4, 'front'], [0.43, 0.72, 'rear'], [0.75, 0.88, 'rear']], tumble: 0.03, crown: 0.025,
    rear: 'hatch', doors: 5, roof: 'fixed', noun: 'suv',
    face: { lamps: 'projector-pair', grille: 'mesh', bumper: 'body', fog: true },
    tail: { lamps: 'wrap', exhaust: 'twin', plate: 'center' }, trim: 'black', pillar: 'black',
    wheels: { style: 'multi-spoke', finish: 'gunmetal', tyre: 'road' },
    interior: { seat: '#26272A', material: 'cloth', dash: 'screen', wheel: 'three-spoke' },
    sound: { engine: 'i4', character: -0.3 }, handling: { character: 'planted' },
  },
  sedan: {
    L: 4.85, W: 0.915, wb: 2.8, fo: 0.95, WR: 0.34, RIM: 0.216, TW: 0.225, WXin: 0.12,
    yb: 0.3, yNose: 0.86, yCowl: 0.99, yBelt: 1.01, yTail: 1.04, yRoof: 1.46, roofFall: 0.035,
    cowl: 1.55, roofF: 2.25, roofR: 1.45, back: 1.0, bumpF: 0.5, wRoof: 0.66, RF: 0.26, RR: 0.2, crease: 0.76, clad: 0,
    win: [[0.035, 0.42, 'front'], [0.45, 0.82, 'rear'], [0.84, 0.95, 'rear']], tumble: 0.03, crown: 0.03,
    rear: 'notchback', doors: 4, roof: 'fixed', noun: 'sedan',
    face: { lamps: 'projector-pair', grille: 'horizontal-bars', bumper: 'body', fog: false },
    tail: { lamps: 'wrap', exhaust: 'twin', plate: 'center' }, trim: 'chrome', pillar: 'black',
    wheels: { style: 'multi-spoke', finish: 'silver', tyre: 'road' },
    interior: { seat: '#2A2B2E', material: 'leather', dash: 'screen', wheel: 'three-spoke' },
    sound: { engine: 'v6', character: -0.3 }, handling: { character: 'planted' },
  },
  taxi: {
    L: 5.35, W: 0.97, wb: 2.91, fo: 1.08, WR: 0.345, RIM: 0.19, TW: 0.225, WXin: 0.13,
    yb: 0.31, yNose: 0.92, yCowl: 1.0, yBelt: 1.02, yTail: 1.05, yRoof: 1.46, roofFall: 0.025,
    cowl: 1.78, roofF: 2.38, roofR: 1.62, back: 1.12, wRoof: 0.71, RF: 0.18, RR: 0.13, crease: 0.74, clad: 0,
    win: [[0.035, 0.44, 'front'], [0.465, 0.84, 'rear'], [0.86, 0.96, 'rear']], tumble: 0.025, crown: 0.022,
    rear: 'notchback', doors: 4, roof: 'fixed', noun: 'cab',
    face: { lamps: 'square', grille: 'egg-crate', bumper: 'black-plastic', fog: false },
    tail: { lamps: 'wrap', exhaust: 'single', plate: 'center' }, trim: 'chrome', pillar: 'black',
    wheels: { style: 'steel-hubcap', finish: 'silver', tyre: 'road' },
    interior: { seat: '#2D2A27', material: 'vinyl', dash: 'analog', wheel: 'four-spoke', partition: true },
    sound: { engine: 'v8', character: -0.4, gears: 4 }, handling: { character: 'floaty' },
  },
  cruiser: {
    L: 5.2, W: 0.96, wb: 2.95, fo: 1.0, WR: 0.35, RIM: 0.216, TW: 0.235, WXin: 0.125,
    yb: 0.31, yNose: 0.84, yCowl: 1.0, yBelt: 1.03, yTail: 1.05, yRoof: 1.47, roofFall: 0.03,
    cowl: 1.7, roofF: 2.4, roofR: 1.5, back: 1.05, wRoof: 0.7, RF: 0.22, RR: 0.16, crease: 0.76, clad: 0,
    win: [[0.035, 0.43, 'front'], [0.455, 0.83, 'rear'], [0.85, 0.95, 'rear']], tumble: 0.025, crown: 0.025,
    rear: 'notchback', doors: 4, roof: 'fixed', noun: 'cruiser',
    face: { lamps: 'square', grille: 'mesh', bumper: 'bull-bar', fog: false },
    tail: { lamps: 'wrap', exhaust: 'twin', plate: 'center' }, trim: 'black', pillar: 'black',
    wheels: { style: 'steel-bare', finish: 'black', tyre: 'road' },
    interior: { seat: '#232425', material: 'cloth', dash: 'analog', wheel: 'three-spoke', partition: true },
    sound: { engine: 'v8', character: 0.1 }, handling: { character: 'planted' },
  },
  limo: {
    L: 5.6, W: 0.97, wb: 3.36, fo: 1.0, WR: 0.36, RIM: 0.254, TW: 0.255, WXin: 0.13,
    yb: 0.29, yNose: 0.86, yCowl: 1.02, yBelt: 1.04, yTail: 1.06, yRoof: 1.5, roofFall: 0.03,
    cowl: 1.72, roofF: 2.42, roofR: 1.58, back: 1.08, wRoof: 0.69, RF: 0.24, RR: 0.18, crease: 0.8, clad: 0,
    win: [[0.035, 0.4, 'front'], [0.425, 0.8, 'rear'], [0.82, 0.95, 'rear']], tumble: 0.03, crown: 0.028,
    rear: 'notchback', doors: 4, roof: 'fixed', noun: 'sedan',
    face: { lamps: 'slim-led', grille: 'horizontal-bars', bumper: 'body', fog: false },
    tail: { lamps: 'full-width', exhaust: 'twin', plate: 'center' }, trim: 'chrome', pillar: 'black',
    wheels: { style: 'multi-spoke', finish: 'chrome', tyre: 'road' },
    interior: { seat: '#C9B9A0', material: 'leather', dash: 'screen', wheel: 'three-spoke' },
    sound: { engine: 'v12', character: -0.6 }, handling: { character: 'planted' },
  },
  coupe: {
    L: 4.6, W: 0.91, wb: 2.7, fo: 0.92, WR: 0.34, RIM: 0.229, TW: 0.235, WXin: 0.115,
    yb: 0.27, yNose: 0.74, yCowl: 0.94, yBelt: 0.97, yTail: 1.0, yRoof: 1.38, roofFall: 0.04,
    cowl: 1.65, roofF: 2.35, roofR: 1.25, back: 0.75, bumpF: 0.5, wRoof: 0.64, RF: 0.26, RR: 0.18, crease: 0.72, clad: 0,
    win: [[0.035, 0.66, 'front'], [0.69, 0.86, 'rear']], tumble: 0.035, crown: 0.03,
    rear: 'notchback', doors: 2, roof: 'fixed', noun: 'coupe',
    face: { lamps: 'projector-pair', grille: 'mesh', bumper: 'body', fog: false },
    tail: { lamps: 'wrap', exhaust: 'twin', plate: 'center' }, trim: 'black', pillar: 'paint',
    wheels: { style: 'five-spoke', finish: 'silver', tyre: 'low-profile' },
    interior: { seat: '#222326', material: 'leather', dash: 'analog', wheel: 'three-spoke' },
    sound: { engine: 'v6', character: 0.2 }, handling: { character: 'planted' },
  },
  muscle: {
    L: 4.64, W: 0.9, wb: 2.72, fo: 0.92, WR: 0.335, RIM: 0.229, TW: 0.235, WXin: 0.1,
    yb: 0.21, yNose: 0.875, yCowl: 0.958, yBelt: 0.97, yTail: 1.0, yRoof: 1.366, roofFall: 0.07,
    cowl: 2.0, roofF: 2.7, roofR: 1.247, back: 0.52, bumpF: 0.56, wRoof: 0.64, RF: 0.24, RR: 0.15, crease: 0.735, clad: 0,
    win: [[0.03, 0.62, 'front'], [0.66, 0.83, 'rear']], tumble: 0.075, crown: 0.042,
    rear: 'fastback', doors: 2, roof: 'fixed', noun: 'coupe',
    face: { lamps: 'square', grille: 'honeycomb', bumper: 'body', fog: true },
    tail: { lamps: 'bars', exhaust: 'twin', plate: 'center' }, trim: 'black', pillar: 'paint',
    wheels: { style: 'split-five', finish: 'silver', tyre: 'low-profile' },
    interior: { seat: '#26272A', material: 'cloth', dash: 'twin-cowl', wheel: 'three-spoke' },
    sound: { engine: 'v8-cammed', character: 0.6 }, handling: { character: 'tail-happy' },
  },
  sports: {
    L: 4.45, W: 0.93, wb: 2.6, fo: 0.95, WR: 0.33, RIM: 0.241, TW: 0.255, WXin: 0.11,
    yb: 0.18, yNose: 0.62, yCowl: 0.86, yBelt: 0.9, yTail: 0.96, yRoof: 1.28, roofFall: 0.06,
    cowl: 1.5, roofF: 2.2, roofR: 1.3, back: 0.38, wRoof: 0.6, RF: 0.3, RR: 0.2, crease: 0.6, clad: 0,
    win: [[0.035, 0.68, 'front'], [0.71, 0.85, 'rear']], tumble: 0.06, crown: 0.035,
    rear: 'fastback', doors: 2, roof: 'fixed', noun: 'coupe',
    face: { lamps: 'projector-pair', grille: 'slot', bumper: 'body', fog: false },
    tail: { lamps: 'full-width', exhaust: 'quad', plate: 'center' }, trim: 'black', pillar: 'black',
    wheels: { style: 'multi-spoke', finish: 'gunmetal', tyre: 'low-profile' },
    interior: { seat: '#1C1C1E', material: 'alcantara', dash: 'twin-cowl', wheel: 'three-spoke' },
    sound: { engine: 'flat6', character: 0.4 }, handling: { character: 'twitchy' },
  },
  supercar: {
    L: 4.34, W: 0.95, wb: 2.838, fo: 0.814, WR: 0.355, RIM: 0.279, TW: 0.285, WXin: 0.14,
    yb: 0.13, yNose: 0.483, yCowl: 0.7, yBelt: 0.82, yTail: 0.897, yRoof: 1.159, roofFall: 0.075,
    cowl: 0.733, roofF: 1.85, roofR: 1.12, back: 0.17, wRoof: 0.6, RF: 0.32, RR: 0.12, crease: 0.45, clad: 0,
    win: [[0.04, 0.62, 'front']], tumble: 0.09, crown: 0.012,
    rear: 'fastback', doors: 2, roof: 'fixed', noun: 'car', doorType: 'up',
    face: { lamps: 'slim-led', grille: 'closed-ev', bumper: 'body', fog: false },
    tail: { lamps: 'full-width', exhaust: 'none', plate: 'center' }, trim: 'black', pillar: 'black',
    wheels: { style: 'turbine', finish: 'black', tyre: 'low-profile' },
    interior: { seat: '#1A1A1C', material: 'alcantara', dash: 'screen', wheel: 'yoke' },
    sound: { engine: 'v8', character: 0 }, handling: { character: 'planted' },
  },
  'compact-hatch': {
    L: 4.05, W: 0.87, wb: 2.55, fo: 0.8, WR: 0.31, RIM: 0.191, TW: 0.205, WXin: 0.11,
    yb: 0.28, yNose: 0.78, yCowl: 0.98, yBelt: 1.0, yTail: 1.04, yRoof: 1.48, roofFall: 0.03,
    cowl: 1.25, roofF: 1.85, roofR: 0.25, back: 0.06, wRoof: 0.64, RF: 0.24, RR: 0.16, crease: 0.74, clad: 0,
    win: [[0.035, 0.44, 'front'], [0.47, 0.75, 'rear'], [0.78, 0.9, 'rear']], tumble: 0.03, crown: 0.025,
    rear: 'hatch', doors: 5, roof: 'fixed', noun: 'hatch',
    face: { lamps: 'projector-pair', grille: 'slot', bumper: 'body', fog: false },
    tail: { lamps: 'vertical', exhaust: 'single', plate: 'center' }, trim: 'black', pillar: 'black',
    wheels: { style: 'steel-hubcap', finish: 'silver', tyre: 'road' },
    interior: { seat: '#2E3033', material: 'cloth', dash: 'analog', wheel: 'three-spoke' },
    sound: { engine: 'i4', character: 0 }, handling: { character: 'twitchy' },
  },
  wagon: {
    L: 4.9, W: 0.915, wb: 2.85, fo: 0.95, WR: 0.34, RIM: 0.216, TW: 0.225, WXin: 0.12,
    yb: 0.3, yNose: 0.8, yCowl: 0.98, yBelt: 1.0, yTail: 1.04, yRoof: 1.5, roofFall: 0.02,
    cowl: 1.55, roofF: 2.25, roofR: 0.12, back: 0.05, wRoof: 0.68, RF: 0.26, RR: 0.12, crease: 0.76, clad: 0,
    win: [[0.035, 0.37, 'front'], [0.395, 0.65, 'rear'], [0.675, 0.92, 'rear']], tumble: 0.03, crown: 0.028,
    rear: 'wagon', doors: 5, roof: 'fixed', noun: 'wagon',
    face: { lamps: 'projector-pair', grille: 'horizontal-bars', bumper: 'body', fog: false },
    tail: { lamps: 'vertical', exhaust: 'single', plate: 'center' }, trim: 'chrome', pillar: 'black',
    wheels: { style: 'five-spoke', finish: 'silver', tyre: 'road' },
    interior: { seat: '#5A4A3C', material: 'leather', dash: 'analog', wheel: 'three-spoke' },
    sound: { engine: 'i4', character: -0.2 }, handling: { character: 'planted' },
  },
  minivan: {
    L: 5.1, W: 0.97, wb: 3.03, fo: 0.95, WR: 0.35, RIM: 0.216, TW: 0.235, WXin: 0.13,
    yb: 0.35, yNose: 0.95, yCowl: 1.1, yBelt: 1.12, yTail: 1.15, yRoof: 1.76, roofFall: 0.025,
    cowl: 1.2, roofF: 1.95, roofR: 0.12, back: 0.05, wRoof: 0.79, RF: 0.26, RR: 0.12, crease: 0.82, clad: 0,
    win: [[0.035, 0.3, 'front'], [0.325, 0.62, 'rear'], [0.645, 0.92, 'rear']], tumble: 0.03, crown: 0.03,
    rear: 'wagon', doors: 5, roof: 'fixed', noun: 'van', doorType: 'sliding',
    face: { lamps: 'projector-pair', grille: 'horizontal-bars', bumper: 'body', fog: false },
    tail: { lamps: 'vertical', exhaust: 'single', plate: 'center' }, trim: 'black', pillar: 'black',
    wheels: { style: 'five-spoke', finish: 'silver', tyre: 'road' },
    interior: { seat: '#4A4D52', material: 'cloth', dash: 'analog', wheel: 'three-spoke' },
    sound: { engine: 'v6', character: -0.4 }, handling: { character: 'floaty' },
  },
  van: {
    L: 5.3, W: 1.0, wb: 3.3, fo: 0.85, WR: 0.36, RIM: 0.2, TW: 0.215, WXin: 0.15,
    yb: 0.42, yNose: 1.05, yCowl: 1.26, yBelt: 1.32, yTail: 1.32, yRoof: 2.45, roofFall: 0.012,
    cowl: 1.02, roofF: 1.62, roofR: 0.035, back: 0.02, wRoof: 0.93, RF: 0.22, RR: 0.06, crease: 0.98, clad: 0.62,
    win: [[0.04, 0.2, 'front']], tumble: 0.02, crown: 0.03,
    rear: 'box', doors: 4, roof: 'high', noun: 'van', doorType: 'sliding',
    face: { lamps: 'square', grille: 'horizontal-bars', bumper: 'black-plastic', fog: false },
    tail: { lamps: 'vertical', exhaust: 'single', plate: 'bumper' }, trim: 'black', pillar: 'paint',
    wheels: { style: 'steel-bare', finish: 'black', tyre: 'road' },
    interior: { seat: '#34373B', material: 'vinyl', dash: 'analog', wheel: 'four-spoke' },
    sound: { engine: 'diesel', character: 0.2, gears: 5 }, handling: { character: 'tank' },
  },
  pickup: {
    L: 5.6, W: 0.99, wb: 3.6, fo: 0.95, WR: 0.39, RIM: 0.216, TW: 0.265, WXin: 0.14,
    yb: 0.5, yNose: 1.18, yCowl: 1.25, yBelt: 1.28, yTail: 1.3, yRoof: 1.92, roofFall: 0.015,
    cowl: 1.7, roofF: 2.3, roofR: 2.05, back: 2.0, wRoof: 0.8, RF: 0.18, RR: 0.06, crease: 1.0, clad: 0,
    win: [[0.04, 0.48, 'front'], [0.52, 0.94, 'rear']], tumble: 0.015, crown: 0.02,
    rear: 'bed', doors: 4, roof: 'fixed', noun: 'pickup',
    face: { lamps: 'square', grille: 'egg-crate', bumper: 'chrome-blade', fog: true },
    tail: { lamps: 'vertical', exhaust: 'single', plate: 'bumper' }, trim: 'chrome', pillar: 'black',
    wheels: { style: 'five-spoke', finish: 'silver', tyre: 'all-terrain' },
    interior: { seat: '#3A3A38', material: 'cloth', dash: 'analog', wheel: 'four-spoke' },
    sound: { engine: 'v8', character: 0.2 }, handling: { character: 'tank' },
  },
};

// the back of the glasshouse for each rear shape, as fractions of the length (used when a sheet's rear differs from
// its class's): [roofR, back]
export const REAR = { notchback: [0.3, 0.21], fastback: [0.27, 0.11], hatch: [0.055, 0.014], wagon: [0.026, 0.008], box: [0.008, 0.004], bed: [0.37, 0.36] };

// the handling every family can reach: each adjective -1..1 maps across these ranges (a sheet can never leave them)
export const RANGES = {
  car4: {
    topSpeed: [22, 35], boostGap: [7, 23], accel: [5, 17], boostAccel: [8, 34], grip: [20, 50],
    rMin: [6.6, 4.2], yawMax: [1.05, 2.0], mass: [1.2, 3.4], brake: [8.5, 18],
  },
};

// the real-name list: makers and models a sheet's words must not carry (the brand rule). Lower case, matched on words
export const REAL_NAMES = ['ford', 'mustang', 'chevrolet', 'chevy', 'camaro', 'corvette', 'dodge', 'charger', 'challenger', 'chrysler', 'jeep',
  'cadillac', 'lincoln', 'tesla', 'toyota', 'honda', 'nissan', 'mazda', 'subaru', 'mitsubishi', 'lexus', 'acura', 'infiniti', 'hyundai', 'kia',
  'bmw', 'mercedes', 'benz', 'maybach', 'audi', 'volkswagen', 'vw', 'porsche', 'ferrari', 'lamborghini', 'maserati', 'alfa', 'fiat', 'bugatti',
  'mclaren', 'aston', 'bentley', 'rolls', 'royce', 'jaguar', 'land rover', 'range rover', 'volvo', 'saab', 'peugeot', 'renault', 'citroen',
  'crown victoria', 'econoline', 'transit', 'sprinter', 'checker', 'waymo', 'uber', 'lyft', 'gmc', 'buick', 'pontiac', 'oldsmobile', 'hummer',
  'rivian', 'lucid', 'polestar', 'genesis', 'escalade', 'explorer', 'tahoe', 'suburban', 'wrangler', 'civic', 'camry', 'prius', 'model s', 'model 3'];
