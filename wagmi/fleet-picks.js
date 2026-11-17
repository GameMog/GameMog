// Mog City, Hometown: the car a story's creator picked for its hero (GameMog's Create, the optional Car dropdown, 14 Nov:
// the owner, "car selection an optional dropdown menu when creating a story world"). GameMog's Story Kit writes the pick
// as the pack's heroCar and the runner world's fleetCar, by a generic name (GameMog storykit/pack/hero-cars.mjs); here
// each name is one of the town fleet's ready-made, player-drivable models (cities/sf/js/fleet-data.js, CC BY 4.0,
// assets/vehicles/fleet/CREDITS.md). No three.js here (tests/fleet-picks.test.mjs reads it in node).
//   FLEET_PICKS                       name -> model id, sports cars first
//   fleetPickOf(name)                 the model id of a known name, or null (an unknown name plays as if none was picked)
//   pickedFleetSheet(name, o)         the hero car's sheet for a picked car: the model's own tuned sheet (wagmi/jack-sheets.js
//                                     MODEL_SHEETS, so it drives as that model does) wearing it (fleet: id), with the story's
//                                     own name for its car and its paint when the story's sheet gives them; null when the
//                                     name is unknown or the model is not in the fleet
// A story that names a car of its own and has a pick drives the picked model (the cars9 gap: such a story kept the
// procedural car); with no pick, a story's own car and the town's default sports car are as before (wagmi/game.js).
export const FLEET_PICKS = Object.freeze({
  'gt-coupe': 'gt83',
  'muscle-car': 'muscle69',
  roadster: 'roadster00',
  'sports-car': 'turbo81',
  'sports-coupe': 'sport99',
  supercar: 'gt95',
  sedan: 'sedan10',
  'old-sedan': 'sedan80',
  hatchback: 'hatch11',
  'city-car': 'city07',
  // (16 Nov, the owner, "car doesn't look good, maybe we can find new ones": an SUV and a pickup are the big full-size
  // ones now, a ranch's or a mountain town's; the smaller ones they were stay offered by names of their own, after the
  // others, as does the short four-by-four)
  suv: 'suv20',
  minivan: 'minivan20',
  pickup: 'pickup20',
  van: 'van92',
  crossover: 'suv10',
  'compact-pickup': 'pickup89',
  'four-by-four': 'offroad20',
});

// (Mog City, Hometown) a story's own pickup or SUV (a ride a mission names, or the hero's car when no car was picked)
// wears the fleet's full-size model of its class: its own name, paint, handling, sound and abilities kept (a tow rig built
// on the model's bed, wagmi/fleet-car.js rigFit), only the body the model's; the plain Story Kit body while it loads or
// if it can't (wagmi/storyrun/ride.js buildSheetCar). Other classes keep their own body.
export const RIDE_MODELS = Object.freeze({ pickup: 'pickup20', suv: 'suv20' });
export const rideFleetOf = (sheet) => (sheet && typeof sheet === 'object' && !sheet.fleet && (!sheet.family || sheet.family === 'car4') && Object.prototype.hasOwnProperty.call(RIDE_MODELS, sheet.class) ? RIDE_MODELS[sheet.class] : null);

// (the picks named apart from the model's own sheet label: the smaller SUV and pickup, offered under their own names)
export const PICK_LABELS = Object.freeze({ crossover: 'Crossover', 'compact-pickup': 'Compact Pickup' });
export const fleetPickOf = (name) => (typeof name === 'string' && Object.prototype.hasOwnProperty.call(FLEET_PICKS, name) ? FLEET_PICKS[name] : null);

const COLOUR = /^#[0-9A-Fa-f]{6}$/;
// (the classes that carry a tow rig: wagmi/storyrun/vehicles/sheet.js TOW_CLASSES, asserted equal in tests/fleet-picks.test.mjs)
export const TOW_CLASSES = Object.freeze(['wrecker', 'pickup']);
// o: { models: FLEET_DATA.models, sheets: MODEL_SHEETS, story: the story's own sheet (PACK.sheetCar) or null,
//      paint: a fallback paint (#rrggbb), label: the fallback name ('Your car') }
export function pickedFleetSheet(name, o = {}) {
  const id = fleetPickOf(name);
  if (!id || !o.models || !o.models[id] || !o.sheets || !o.sheets[id]) return null;
  const { say, ...base } = o.sheets[id];
  const story = o.story && typeof o.story === 'object' ? o.story : null;
  const storyPaint = story && story.paint && COLOUR.test(story.paint.base || '') ? story.paint.base : null;
  const paint = storyPaint || (COLOUR.test(o.paint || '') ? o.paint : null) || o.models[id].paint || '#B3121A';
  const label = story && typeof story.label === 'string' && story.label.trim() ? story.label.trim().slice(0, 40) : (o.label || PICK_LABELS[name] || base.label);
  // (the story's abilities for its car ride along, so a mission's tow or ram still has its rig: no thrusters on a real
  // car, and the tow only on a model whose class carries a tow rig; none left, the model's own)
  const ab = story && Array.isArray(story.abilities) ? story.abilities.filter((a) => typeof a === 'string' && a !== 'hop' && a !== 'dash' && (a !== 'tow' || TOW_CLASSES.includes(base.class))) : [];
  return { v: 1, family: 'car4', ...base, id: 'fleet-pick-' + id, label, fleet: id, ...(ab.length ? { abilities: [...new Set(ab)] } : {}), paint: { base: paint, finish: (story && story.paint && story.paint.finish) || 'metallic' } };
}
