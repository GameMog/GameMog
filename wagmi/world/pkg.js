// A Hometown package (cities/pkg/packages/<id>: a place compiled from open map data by tools/hometown/compile.py) behind
// the world contract, on San Francisco's engine base: the package's geodata.js fills the same window.NYC globals San
// Francisco's does (GEO, PLACE_DATA) plus window.NYC.PKG (its id, name, frame, arrivals, mission places, compiled
// tiles). Frame: metres, origin the package's box centre (PKG.frame lat0, lon0), +x east, -z north, y the ground's
// NAVD88 height minus PKG.frame.yOffset (the place's water or lowest ground near 0). Heading 0 faces +z (south).
import { createWorld } from './common.js';
import { SCENE_GROUPS } from './ny.js';
import { createMemoryTileSource } from './tiles-mem.js';

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

// The package's tiles: one grid shared with the compiler (tools/hometown/compile.py TILE, PKG.tileSize: 512 m squares
// keyed floor(x / size), floor(z / size) in the package's own frame, PKG.tiles the ones it compiled) and the tile
// manager (wagmi/world/tiles.js: world.tiles, its cache key 'pkg:<id>@<compiler>:ix,iz'). The source slices the
// package already in memory (tiles-mem.js; v1: the compiled tiles fetched, compiled on first request and cached by
// compiler version), and asks for no tile the package never compiled.
const tileSize = () => PKG()?.tileSize || 512;
let compiled = null;
const compiledSet = () => compiled || (PKG() ? (compiled = new Set((PKG().tiles || []).map(([x, z]) => x + ',' + z))) : new Set());
function tileSource(W) {
  const P = PKG() || {};
  return createMemoryTileSource(W, { size: tileSize(), id: 'pkg:' + (P.id || 'none'), version: P.compiler || '0', has: (ix, iz) => compiledSet().has(ix + ',' + iz) });
}
// the grid cells the bounds touch: (x, z, r) | ({ x, z, r }) | ({ minX, maxX, minZ, maxZ }), a box round a disc
function tilesFor(a, b, c) {
  const size = tileSize();
  const x = typeof a === 'number' ? a : a.x, z = typeof a === 'number' ? b : a.z, r = (typeof a === 'number' ? c : a.r) || 0;
  const minX = a.minX ?? x - r, maxX = a.maxX ?? x + r, minZ = a.minZ ?? z - r, maxZ = a.maxZ ?? z + r;
  const out = [];
  if (![minX, maxX, minZ, maxZ].every(Number.isFinite)) return out;
  for (let tz = Math.floor(minZ / size); tz <= Math.floor(maxZ / size); tz++) for (let tx = Math.floor(minX / size); tx <= Math.floor(maxX / size); tx++) out.push(tx + ',' + tz);
  return out;
}
// ensureLoaded(x, z, r, lod) | ({ x, z, r }, lod) | ({ minX, maxX, minZ, maxZ }, lod) -> Promise<tile[]>: once the
// package's data is in memory and the city built on it (the road graph's traffic network up), the tile manager's tiles
// there at lod (the world contract's, cities/sf/docs/STREAMING.md); the array also says .complete (every tile the
// bounds touch is one the package compiled) and .missing (the grid keys 'ix,iz' it never compiled: v1 compiles them on
// first request). No bounds: [] (complete) once the package is up.
async function ensureLoaded(W, ...a) {
  const N = globalThis.window?.NYC;
  if (N?.dataReady) await N.dataReady;
  for (let i = 0; i < 1200 && !globalThis.window?.__NYC_APP?.trafficSystem?.network; i++) await new Promise((r) => setTimeout(r, 50));
  const got = a[0] == null ? [] : await W.tiles.ensureLoaded(...a);
  const missing = a[0] == null ? [] : tilesFor(...a).filter((k) => !compiledSet().has(k));
  return Object.assign(got, { complete: missing.length === 0, missing });
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
    // (its tiles on the compiler's grid, above)
    tileSource,
  });
  W.pkg = P.id || null;
  // how busy its streets are, 0..1 (the compiled density, buildings per km2: wagmi/street/crowd.js reads it, 1 elsewhere)
  W.crowd = Math.max(0.1, Math.min(1, P.density ?? 1));
  W.ensureLoaded = (...a) => ensureLoaded(W, ...a);
  // the package's own landmarks: its public places (school, library, park...) by name
  Object.defineProperty(W, 'landmarks', { get: () => Object.fromEntries(Object.values(PKG()?.places || {}).filter((p) => p.kind && !/^the /.test(p.name)).map((p) => [p.name, { x: p.cx, z: p.cz, kind: p.kind }])) });
  return W;
}
