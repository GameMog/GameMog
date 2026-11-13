import fs from 'node:fs/promises';
import { checkPlace } from './keys.mjs';

// Place resolver: placeId -> { placeId, name, bbox: [west, south, east, north] } | null.
// v0 reads a JSON gazetteer ({ "places": { "<id>": { "name", "bbox" } } }). The real one will come from the search box's
// place index (Overture divisions, bbox capped at 4.5 km a side, as tools/hometown/fetch.py --place resolves it).
// A place's bbox is an input of every manifest built for it: changing an existing place's bbox needs a new compiler
// version, or old manifests (and the locks pointing at them) and new ones would disagree.
export function gazetteerResolver(data) {
  const places = data.places || data;
  return {
    async resolve(placeId) {
      checkPlace(placeId);
      const p = Object.prototype.hasOwnProperty.call(places, placeId) ? places[placeId] : null;
      return p ? { placeId, name: p.name || placeId, bbox: p.bbox.map(Number) } : null;
    },
    ids: () => Object.keys(places),
  };
}

export async function loadGazetteer(file) {
  return gazetteerResolver(JSON.parse(await fs.readFile(file, 'utf8')));
}
