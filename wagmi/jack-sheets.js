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
// what the prompt calls it
export const NOUN = { sedan: 'sedan', oldsedan: 'old sedan', hatch: 'hatchback', suv: 'SUV', minivan: 'minivan', van: 'van', pickup: 'pickup',
  coupe: 'coupe', muscle: 'muscle car', convertible: 'convertible', taxi: 'cab' };

export function sheetFor(kind, hex) {
  const base = SHEETS[kind] || SHEETS.sedan;
  return { v: 1, id: 'jack-' + (SHEETS[kind] ? kind : 'sedan'), family: 'car4', ...base, paint: { base: hex, finish: 'metallic' } };
}
