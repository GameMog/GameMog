// A Hometown package (cities/pkg/packages/<id>: a place compiled from open map data by tools/hometown/compile.py) behind
// the world contract, on San Francisco's engine base: the package's geodata.js fills the same window.NYC globals San
// Francisco's does (GEO, PLACE_DATA) plus window.NYC.PKG (its id, name, frame, arrivals, mission places, compiled
// tiles). Frame: metres, origin the package's box centre (PKG.frame lat0, lon0), +x east, -z north, y the ground's
// NAVD88 height minus PKG.frame.yOffset (the place's water or lowest ground near 0). Heading 0 faces +z (south).
import { createWorld } from './common.js';
import { SCENE_GROUPS } from './ny.js';

const PKG = () => globalThis.window?.NYC?.PKG || null;

// the arrivals on the ground (city-config.js TELEPORT_LOCATIONS: PLACE_DATA.regional, the compiler's spawn points), then
// the compiled mission places on their lanes (the compiler put each on its nearest drivable lane already; snapped again
// onto the traffic's own lanes here, the ones the cars and the GPS drive)
function buildPlaces({ N, lib, missing, nearestLane }) {
  for (const [k, p] of Object.entries(N.TELEPORT_LOCATIONS || {})) if (p.mode !== 'helicopter') lib[k] = { x: p.x, z: p.z, heading: p.heading, name: p.name || p.landmark || k };
  for (const [key, p] of Object.entries(PKG()?.places || {})) {
    const lane = nearestLane(p.x, p.z, 60);
    if (lane) lib[key] = { x: lane.x, z: lane.z, heading: lane.heading, name: p.name, kind: p.kind, cx: p.cx, cz: p.cz };
    else missing.push(key);
  }
}

// ensureLoaded(bounds): resolves true once the package's data is in memory and the city built on it (the road graph's
// traffic network up), when every compiled tile the bounds { minX, maxX, minZ, maxZ } (or { x, z, r }) touch is in the
// package; false for bounds reaching tiles the package never compiled (v1: compile on first request, cache by compiler
// version). The whole package loads at boot in v0, so a true answer never waits on more than the boot itself.
function tilesFor(b) {
  const size = PKG()?.tileSize || 512;
  const r = b.r != null ? b.r : 0;
  const minX = b.minX ?? b.x - r, maxX = b.maxX ?? b.x + r, minZ = b.minZ ?? b.z - r, maxZ = b.maxZ ?? b.z + r;
  const out = [];
  for (let tz = Math.floor(minZ / size); tz <= Math.floor(maxZ / size); tz++) for (let tx = Math.floor(minX / size); tx <= Math.floor(maxX / size); tx++) out.push(tx + ',' + tz);
  return out;
}
async function ensureLoaded(bounds) {
  const N = globalThis.window?.NYC;
  if (N?.dataReady) await N.dataReady;
  for (let i = 0; i < 1200 && !globalThis.window?.__NYC_APP?.trafficSystem?.network; i++) await new Promise((r) => setTimeout(r, 50));
  if (!bounds) return true;
  const have = new Set((PKG()?.tiles || []).map(([x, z]) => x + ',' + z));
  return tilesFor(bounds).every((k) => have.has(k));
}

export function createPkg() {
  const P = PKG() || {};
  const W = createWorld({
    id: 'pkg', name: String(P.name || 'Hometown').split(',')[0],
    frame: { units: 'm', origin: { lat: P.frame?.lat0, lon: P.frame?.lon0, label: 'package box centre' }, east: '+x', north: '-z', up: '+y', headingZero: '+z', yOffset: P.frame?.yOffset || 0 },
    buildPlaces,
    // (the road graph's own class, by width and lanes: cities/sf/js/road-network.js axis 'ave' for a major road)
    isAvenue: (e) => !!e && e.axis === 'ave',
    runsWithAvenue: (c) => Math.abs(c.dz) > Math.abs(c.dx),
    // (the package's downtown: its one neighbourhood, the place's own name, is a busy one)
    commercial: new Set(),
    sceneGroups: { ...SCENE_GROUPS, landmarks: 'SFLandmarks', grid: null, boroughs: null, sfStreetDetails: 'SFStreetDetails' },
    grid: null,
  });
  W.pkg = P.id || null;
  W.ensureLoaded = ensureLoaded;
  // the package's own landmarks: its public places (school, library, park...) by name
  Object.defineProperty(W, 'landmarks', { get: () => Object.fromEntries(Object.values(PKG()?.places || {}).filter((p) => p.kind && !/^the /.test(p.name)).map((p) => [p.name, { x: p.cx, z: p.cz, kind: p.kind }])) });
  return W;
}
