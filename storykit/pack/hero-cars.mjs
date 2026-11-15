// Story Kit: the cars a creator can pick for a story's hero (schema.mjs re-exports these; app/create/story.tsx shows
// them). No imports, so the Create page bundles this list alone.
// the player's car as the creator picked it on Create (the owner, 14 Nov: "car selection an optional dropdown menu when
// creating a story world"): one of the town fleet's ready-made, player-drivable models by a generic name (Mog City's
// realistic town cars, assets/vehicles/fleet, CC BY 4.0; wagmi/fleet-picks.js maps each name to its model), sports cars
// first. Left out, the story chooses its own car, as before. `classes`: the vehicle-sheet classes the hero's ride may be
// (gate.ts: it drives as that kind of car wherever the realistic model is not drawn); `group`: only a sports car boosts
export const HERO_CARS = [
  { id: 'gt-coupe', label: 'GT Coupe', classes: ['coupe', 'sports'], group: 'sports' },
  { id: 'muscle-car', label: 'Muscle Car', classes: ['muscle'], group: 'sports' },
  { id: 'roadster', label: 'Roadster', classes: ['sports', 'coupe'], group: 'sports' },
  { id: 'sports-car', label: 'Sports Car', classes: ['sports', 'coupe', 'supercar'], group: 'sports' },
  { id: 'sports-coupe', label: 'Sports Coupe', classes: ['coupe', 'sports'], group: 'sports' },
  { id: 'supercar', label: 'Supercar', classes: ['supercar', 'sports'], group: 'sports' },
  { id: 'sedan', label: 'Sedan', classes: ['sedan'], group: 'everyday' },
  { id: 'old-sedan', label: 'Old Sedan', classes: ['sedan'], group: 'everyday' },
  { id: 'hatchback', label: 'Hatchback', classes: ['compact-hatch'], group: 'everyday' },
  { id: 'city-car', label: 'City Car', classes: ['compact-hatch'], group: 'everyday' },
  { id: 'suv', label: 'SUV', classes: ['suv', 'crossover'], group: 'everyday' },
  { id: 'minivan', label: 'Minivan', classes: ['minivan'], group: 'everyday' },
  { id: 'pickup', label: 'Pickup', classes: ['pickup'], group: 'everyday' },
  { id: 'van', label: 'Van', classes: ['van'], group: 'everyday' },
];
export const HERO_CAR_IDS = HERO_CARS.map((c) => c.id);
