// Mog City, Hometown: the Story Kit sheet each body kind of a town's fleet (cities/sf/js/traffic.js FLEET) is driven as
// once the player takes one (wagmi/jack.js), and what the prompt calls it. No three.js here (tests/fleet.test.mjs reads
// it in node). Generic look-alikes all (no real maker's name, the brand rule): each kind its
// class's shape and engine, and its handling inside the family's range (tune.js): a van slow and heavy and wide in the
// turn, a pickup and an SUV heavy, a hatchback light and darting, a coupe, a convertible and a muscle car quick (the
// muscle car's pull the strongest, its grip the loosest), an old sedan soft and slow to stop
export const SHEETS = {
  sedan: { class: 'sedan', noun: 'sedan', label: 'Sedan', handling: { grip: 0.1 } },
  oldsedan: { class: 'sedan', noun: 'sedan', label: 'Old Sedan', era: 1996, condition: 'tired', body: { trim: 'chrome' }, wheels: { style: 'steel-hubcap', finish: 'silver' },
    handling: { pace: -0.35, pull: -0.45, weight: 0.15, grip: -0.35, turnIn: -0.2, brakes: -0.45 } },
  hatch: { class: 'compact-hatch', noun: 'hatch', label: 'Hatchback', handling: { pace: -0.2, weight: -0.6, grip: 0.25, turnIn: 0.65, brakes: 0.2 } },
  suv: { class: 'suv', noun: 'suv', label: 'SUV', handling: { pace: -0.15, pull: -0.1, weight: 0.5, grip: -0.1, turnIn: -0.25 } },
  minivan: { class: 'minivan', noun: 'van', label: 'Minivan', handling: { pace: -0.35, pull: -0.35, weight: 0.45, grip: -0.1, turnIn: -0.3, brakes: -0.15 } },
  van: { class: 'van', noun: 'van', label: 'Delivery Van', handling: { pace: -0.55, pull: -0.5, weight: 0.8, grip: -0.3, turnIn: -0.6, brakes: -0.35 } },
  pickup: { class: 'pickup', noun: 'pickup', label: 'Pickup', handling: { pace: -0.3, pull: -0.25, weight: 0.55, grip: -0.2, turnIn: -0.35, brakes: -0.2 } },
  coupe: { class: 'coupe', noun: 'coupe', label: 'Coupe', handling: { pace: 0.6, pull: 0.55, weight: -0.35, grip: 0.5, turnIn: 0.5, brakes: 0.5 } },
  muscle: { class: 'muscle', noun: 'car', label: 'Muscle Car', handling: { pace: 0.65, pull: 0.9, weight: 0.25, grip: -0.35, turnIn: -0.15 } },
  convertible: { class: 'sports', noun: 'roadster', label: 'Convertible', body: { roof: 'convertible-down' },
    handling: { pace: 0.5, pull: 0.5, weight: -0.25, grip: 0.4, turnIn: 0.45, brakes: 0.4 } },
  taxi: { class: 'crossover', noun: 'cab', label: 'Robotaxi', handling: { pace: -0.05, weight: 0.1 } },
};
// (Mog City, Hometown: a town fleet's ready-made cars, cities/sf/js/fleet-data.js; taken, the player's car wears the
// model itself, wagmi/fleet-car.js, on its class's Story Kit sheet: a sports car fast and grippy, the muscle car the
// strongest pull and loose at the back, the trucks heavy and slow. Generic words only: never the model's own name)
export const MODEL_SHEETS = {
  gt95: { class: 'supercar', noun: 'car', say: 'sports car', label: 'Sports Car', handling: { pace: 0.9, pull: 0.85, weight: -0.2, grip: 0.75, turnIn: 0.6, brakes: 0.75 } },
  turbo81: { class: 'sports', noun: 'car', say: 'sports car', label: 'Sports Car', handling: { pace: 0.75, pull: 0.75, weight: -0.3, grip: 0.6, turnIn: 0.6, brakes: 0.6 } },
  sport99: { class: 'coupe', noun: 'coupe', say: 'sports coupe', label: 'Sports Coupe', handling: { pace: 0.8, pull: 0.75, weight: -0.25, grip: 0.7, turnIn: 0.65, brakes: 0.65 } },
  gt83: { class: 'coupe', noun: 'coupe', say: 'coupe', label: 'GT Coupe', handling: { pace: 0.55, pull: 0.5, weight: -0.45, grip: 0.45, turnIn: 0.7, brakes: 0.45 } },
  roadster00: { class: 'sports', noun: 'roadster', say: 'roadster', label: 'Roadster', body: { roof: 'convertible-down' }, handling: { pace: 0.6, pull: 0.55, weight: -0.5, grip: 0.6, turnIn: 0.75, brakes: 0.55 } },
  muscle69: { class: 'muscle', noun: 'car', say: 'muscle car', label: 'Muscle Car', handling: { pace: 0.75, pull: 1, weight: 0.3, grip: -0.3, turnIn: -0.15, character: 'tail-happy' } },
  sedan10: { ...SHEETS.sedan, say: 'sedan' }, hatch11: { ...SHEETS.hatch, say: 'hatchback' }, city07: { ...SHEETS.hatch, say: 'city car', label: 'City Car' },
  sedan80: { ...SHEETS.oldsedan, say: 'old sedan' }, suv10: { ...SHEETS.suv, say: 'SUV' }, van92: { ...SHEETS.van, say: 'van', label: 'Van' }, pickup89: { ...SHEETS.pickup, say: 'pickup' },
  taxi75: { class: 'taxi', noun: 'cab', say: 'cab', label: 'Cab', handling: { pace: -0.1, weight: 0.2 } }, taxi20: { class: 'taxi', noun: 'cab', say: 'cab', label: 'Cab', handling: { pace: -0.05, weight: 0.1 } },
  minivan20: { ...SHEETS.minivan, say: 'minivan' },
  tow: { class: 'wrecker', noun: 'truck', say: 'tow truck', label: 'Tow Truck', handling: { pace: -0.5, pull: -0.4, weight: 0.85, grip: -0.25, turnIn: -0.5, brakes: -0.3 } },
  box95: { class: 'van', noun: 'truck', say: 'box truck', label: 'Box Truck', handling: { pace: -0.75, pull: -0.7, weight: 0.95, grip: -0.35, turnIn: -0.7, brakes: -0.45 } },
  ambulance: { class: 'van', noun: 'van', say: 'ambulance', label: 'Ambulance', handling: { pace: -0.4, pull: -0.35, weight: 0.8, grip: -0.25, turnIn: -0.5, brakes: -0.3 } },
  mailvan: { class: 'van', noun: 'van', say: 'mail van', label: 'Mail Van', handling: { pace: -0.55, pull: -0.5, weight: 0.7, grip: -0.3, turnIn: -0.55, brakes: -0.35 } },
  utility: { class: 'pickup', noun: 'truck', say: 'utility truck', label: 'Utility Truck', handling: { pace: -0.45, pull: -0.35, weight: 0.8, grip: -0.25, turnIn: -0.45, brakes: -0.3 } },
  firetruck: { class: 'van', noun: 'truck', say: 'fire truck', label: 'Fire Truck', handling: { pace: -0.8, pull: -0.75, weight: 1, grip: -0.4, turnIn: -0.8, brakes: -0.5 } },
  garbage: { class: 'van', noun: 'truck', say: 'garbage truck', label: 'Garbage Truck', handling: { pace: -0.9, pull: -0.85, weight: 1, grip: -0.45, turnIn: -0.85, brakes: -0.55 } },
};
// what the prompt calls it
export const NOUN = { sedan: 'sedan', oldsedan: 'old sedan', hatch: 'hatchback', suv: 'SUV', minivan: 'minivan', van: 'van', pickup: 'pickup',
  coupe: 'coupe', muscle: 'muscle car', convertible: 'convertible', taxi: 'cab',
  ...Object.fromEntries(Object.entries(MODEL_SHEETS).map(([k, v]) => [k, v.say])) };

// (kind: a body kind, or a fleet model's id: its sheet wears the model, fleet: id)
export function sheetFor(kind, hex) {
  if (MODEL_SHEETS[kind]) { const { say, ...base } = MODEL_SHEETS[kind]; return { v: 1, id: 'jack-' + kind, family: 'car4', ...base, fleet: kind, paint: { base: hex, finish: 'metallic' } }; }
  const base = SHEETS[kind] || SHEETS.sedan;
  return { v: 1, id: 'jack-' + (SHEETS[kind] ? kind : 'sedan'), family: 'car4', ...base, paint: { base: hex, finish: 'metallic' } };
}
