// Mog City story runner: the place library, the names a pack writes as "@key" (GameMog storykit/pack/cities.ts PLACES:
// New York's 42 keys, San Francisco's 49), on Mog City's own maps. The library itself is the world contract's
// (wagmi/world: world.places, laid on the map by ny.js and sf.js, their data moved unchanged to places-ny.js and
// places-sf.js): New York's arrivals, its named corners of two real streets and the FDR; San Francisco's arrivals on the
// ground and its own places; each on its nearest drivable lane facing along it, a `foot` one (a pier's end, a door)
// where it is. This file reads a pack's references against it.
//   createPlaces(W, world) -> { at(ref) -> { x, z, heading, name, mode } | null, list, missing }
//   ref: '@key' | { '@': key, face, heading (deg), mode } | a pack alias (world.places: { alias: { '@': key, name } }, or
//   { at: [x, z, heading (deg)], name }: a mark of the world's own on this map; an alias's offset { right, fwd } m moves it
//   along its facing: a sub-place)
import { world as cityWorld } from '../world/index.js';
export { SF_PLACES } from '../world/places-sf.js';

export function createPlaces(W, world) {
  // (the city's place library, laid on its map by the world contract: wagmi/world, ny.js and sf.js, their data in
  // places-ny.js and places-sf.js)
  const lib = cityWorld.places, missing = cityWorld.placesMissing.slice();
  if (missing.length) console.warn('[storyrun] places not found on the map:', missing.join(', '));
  const aliases = (world && world.places) || {};
  function base(key) {
    if (Object.prototype.hasOwnProperty.call(aliases, key)) {
      const a = aliases[key];
      // (a world's own mark on this map: at [x, z, heading in degrees], Mog City's own story's marks, packs/mog-city.json)
      if (Array.isArray(a.at) && a.at.length >= 2 && a.at.every((v) => Number.isFinite(v) && Math.abs(v) < 20000)) return { x: a.at[0], z: a.at[1], heading: (a.at[2] || 0) * Math.PI / 180, name: a.name || key, face: a.face };
      const p = lib[a['@']];
      if (!p) return null;
      return { ...p, name: a.name || p.name, ...(a.heading != null ? { heading: a.heading * Math.PI / 180 } : {}), face: a.face };
    }
    return lib[key] ? { ...lib[key] } : null;
  }
  function at(ref) {
    if (!ref) return null;
    const key = typeof ref === 'string' ? ref.replace(/^@/, '') : ref['@'];
    const p = base(key);
    if (!p) return null;
    if (typeof ref === 'object') {
      if (ref.heading != null) p.heading = ref.heading * Math.PI / 180;
      if (ref.mode) p.mode = ref.mode;
      if (ref.face) p.face = ref.face;
    }
    if (p.face) { const f = base(p.face); if (f && Math.hypot(f.x - p.x, f.z - p.z) > 2) p.heading = Math.atan2(f.x - p.x, f.z - p.z); }
    // (a sub-place: an alias's offset { right, fwd } m, up to 60, in its facing's frame: the side door round the corner)
    const off = Object.prototype.hasOwnProperty.call(aliases, key) ? aliases[key].offset : null;
    if (off && typeof off === 'object') {
      const r = Math.max(-60, Math.min(60, +off.right || 0)), f = Math.max(-60, Math.min(60, +off.fwd || 0)), h = p.heading ?? 0;
      const dx = Math.sin(h) * f - Math.cos(h) * r, dz = Math.cos(h) * f + Math.sin(h) * r;
      p.x += dx; p.z += dz; if (p.cx != null) { p.cx += dx; p.cz += dz; }
    }
    return p;
  }
  return { at, lib, missing };
}
