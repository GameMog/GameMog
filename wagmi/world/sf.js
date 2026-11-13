// San Francisco (cities/sf: Slop San Francisco, by Kamil (@unable0_) and Mr.doob, MIT) behind the world contract. Its
// scripts fill the same window.NYC globals New York's do, the Manhattan-only tables empty (cities/sf/js/city-config.js);
// this adapter reads only what San Francisco really has. Frame: metres, origin Market St x Montgomery St, +x east, -z
// north, y the ground's real height (Nob Hill ~100 m up). Heading 0 faces +z (south).
import { createWorld } from './common.js';
import { COMMERCIAL, SCENE_GROUPS } from './ny.js';
import { SF_SPAWN_NAMES, SF_PLACES } from './places-sf.js';

// the arrivals on the ground (not the helicopter's over the region), then the place library on its lanes (a `foot`
// one, over 40 m off the lanes: a pier's end, a door, where it is)
function buildPlaces({ N, lib, missing, nearestLane }) {
  for (const [k, p] of Object.entries(N.TELEPORT_LOCATIONS || {})) if (p.mode !== 'helicopter') lib[k] = { x: p.x, z: p.z, heading: p.heading, name: SF_SPAWN_NAMES[k] || k };
  for (const [key, p] of Object.entries(SF_PLACES)) {
    if (p.foot) { lib[key] = { x: p.x, z: p.z, heading: Math.PI, name: p.name, foot: true }; continue; }
    const lane = nearestLane(p.x, p.z, 60);
    if (lane) lib[key] = { x: lane.x, z: lane.z, heading: lane.heading, name: p.name, cx: p.x, cz: p.z };
    else missing.push(key);
  }
  for (const k of Object.keys(SF_SPAWN_NAMES)) if (!lib[k]) missing.push(k);
}

export function createSF() {
  return createWorld({
    id: 'sf', name: 'San Francisco',
    frame: { units: 'm', origin: { lat: 37.788721152, lon: -122.402065729, label: 'Market St x Montgomery St' }, east: '+x', north: '-z', up: '+y', headingZero: '+z' },
    buildPlaces,
    // (the road graph's own class, by width and lanes: cities/sf/js/road-network.js axis 'ave' for a major road)
    isAvenue: (e) => !!e && e.axis === 'ave',
    // (as New York's for now: a crossing walked along z keeps the 'avenue' phase of the shared signal clock)
    runsWithAvenue: (c) => Math.abs(c.dz) > Math.abs(c.dx),
    // (the same names as New York's: none of San Francisco's neighbourhoods is among them, as before)
    commercial: COMMERCIAL,
    // (San Francisco's fork keeps most of the engine's group names; its landmarks and its own street details are its own)
    sceneGroups: { ...SCENE_GROUPS, landmarks: 'SFLandmarks', grid: null, boroughs: null, sfStreetDetails: 'SFStreetDetails' },
    grid: null,
    // (no park lawn measured for a set's dressing)
    parkLawn: () => null,
  });
}
