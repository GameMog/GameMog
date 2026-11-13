import fs from 'node:fs/promises';
import { checkPlace } from './keys.mjs';
import { DOMAINS, domainOfGeoid } from './grid.mjs';

// Place resolver: placeId -> { placeId, name, bbox: [west, south, east, north], geoid, domain, anchor: [lon, lat] } | null.
// The gazetteer is JSON ({ "places": { "<id>": { name, bbox, geoid?, domain?, anchor? } } }): the domain comes from the
// Census GEOID's state prefix (02 ak, 15 hi, 72 / 78 pr, 66 / 69 gu, 60 as, else conus), never from lon/lat; the anchor
// is the Census internal point (INTPTLAT / INTPTLONG), else the bbox centre. The compiler's descriptor projects it.
// A place's bbox and anchor are inputs of every manifest built for it: changing them needs a new build, or old
// manifests (and the locks pointing at them) and new ones would disagree.
export function gazetteerResolver(data) {
  const places = data.places || data;
  return {
    async resolve(placeId) {
      checkPlace(placeId);
      const p = Object.prototype.hasOwnProperty.call(places, placeId) ? places[placeId] : null;
      if (!p) return null;
      const domain = p.geoid ? domainOfGeoid(p.geoid) : (p.domain || 'conus');
      if (!DOMAINS[domain]) throw new Error(`place ${placeId}: bad domain ${domain}`);
      const bbox = p.bbox.map(Number);
      return { placeId, name: p.name || placeId, bbox, geoid: p.geoid || null, domain, anchor: p.anchor ? p.anchor.map(Number) : null };
    },
    ids: () => Object.keys(places),
  };
}

export async function loadGazetteer(file) {
  return gazetteerResolver(JSON.parse(await fs.readFile(file, 'utf8')));
}
