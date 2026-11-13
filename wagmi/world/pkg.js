// A Hometown package (cities/pkg/packages/<id>: a place compiled from open map data by tools/hometown/compile.py) behind
// the world contract, on San Francisco's engine base: the package's geodata.js fills the same window.NYC globals San
// Francisco's does (GEO, PLACE_DATA) plus window.NYC.PKG (its id, name, frame, arrivals, mission places, compiled
// tiles). Frame (compiler 0.3.0, the national grid hg1): metres, origin the NW corner of the anchor's tile (PKG.origin
// c0, r0), +x grid east, -z grid north (true bearing PKG.gamma0), session metres = grid metres / PKG.k0; y the ground's
// NAVD88 height minus PKG.yOffset. Heading 0 faces +z. A v0 package: origin its box centre, true north.
import { createWorld } from './common.js';
import { SCENE_GROUPS } from './ny.js';
import { createMemoryTileSource } from './tiles-mem.js';
import { maskClass } from './sf.js';
import { tileId } from './grid.js';
import { createNetTileSource } from './tiles-net.js';

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

// the compiled mission places as the world's points of interest by mission-site kind (city.pois, MISSION-SITES.md):
// the compiler's Overture categories (compile.py GENERIC) that are each kind, at the place itself (cx, cz)
const POI_KINDS = {
  gas_station: ['gas_station', 'fuel'],
  store: ['grocery_store', 'supermarket', 'convenience_store', 'pharmacy', 'hardware_store'],
  parking: ['parking'],
};
function pois(kind) {
  const want = POI_KINDS[kind]; if (!want) return [];
  return Object.entries(PKG()?.places || {}).filter(([, p]) => want.includes(p.kind) && Number.isFinite(p.cx) && Number.isFinite(p.cz))
    .map(([key, p]) => ({ id: key, name: p.name, x: p.cx, z: p.cz }));
}

// The package's tiles. On the national grid hg1 (compiler 0.3.0, PKG.grid 'hg1'; wagmi/world/grid.js): the session
// frame's origin is the NW corner of tile (PKG.origin.c0, r0), a tile is 512 / k0 session metres a side, so the tile
// manager's ix = floor(x / size) is c - c0 and its cache key is GLOBAL, '<buildId>:hg1-<domain>/0/<c>/<r>' (shared by
// neighbouring towns); PKG.tiles are those ids. ?tiles=net streams the compiled tiles themselves (tiles-net.js, from
// ?tileBase=, default the compiler's local store); otherwise the package in memory is sliced (tiles-mem.js). A v0
// package (no PKG.grid) keeps its own 512 m grid keyed floor(x / 512) in its box-centre frame.
const hg1 = () => PKG()?.grid === 'hg1';
const tileSize = () => (hg1() ? PKG().tileSize || 512 / PKG().k0 : PKG()?.tileSize || 512);
let compiled = null;
const compiledSet = () => compiled || (PKG() ? (compiled = new Set((PKG().tiles || []).map((t) => (Array.isArray(t) ? t[0] + ',' + t[1] : t)))) : new Set());
const gridKey = (ix, iz) => (hg1() ? tileId(PKG().domain, PKG().origin.c0 + ix, PKG().origin.r0 + iz) : ix + ',' + iz);
const query = () => { try { return new URLSearchParams(globalThis.location?.search || ''); } catch { return new URLSearchParams(); } };
function tileSource(W) {
  const P = PKG() || {};
  if (!hg1()) return createMemoryTileSource(W, { size: tileSize(), id: 'pkg:' + (P.id || 'none'), version: P.compiler || '0', has: (ix, iz) => compiledSet().has(ix + ',' + iz) });
  const q = query();
  const geo = { grid: 'hg1', domain: P.domain, c0: P.origin.c0, r0: P.origin.r0 };
  if (q.get('tiles') === 'net') {
    return createNetTileSource({ base: q.get('tileBase') || '/.scratch/hometown/store', buildId: P.buildId, domain: P.domain, c0: P.origin.c0, r0: P.origin.r0,
      k0: P.k0, yOffset: P.yOffset || 0, waterLevel: P.waterLevel, tiles: compiledSet() });
  }
  return Object.assign(createMemoryTileSource(W, { size: tileSize(), id: 'pkg:' + (P.id || 'none'), version: P.buildId, has: (ix, iz) => compiledSet().has(gridKey(ix, iz)) }), geo);
}
// the grid cells the bounds touch: (x, z, r) | ({ x, z, r }) | ({ minX, maxX, minZ, maxZ }), a box round a disc
function tilesFor(a, b, c) {
  const size = tileSize();
  const x = typeof a === 'number' ? a : a.x, z = typeof a === 'number' ? b : a.z, r = (typeof a === 'number' ? c : a.r) || 0;
  const minX = a.minX ?? x - r, maxX = a.maxX ?? x + r, minZ = a.minZ ?? z - r, maxZ = a.maxZ ?? z + r;
  const out = [];
  if (![minX, maxX, minZ, maxZ].every(Number.isFinite)) return out;
  for (let tz = Math.floor(minZ / size); tz <= Math.floor(maxZ / size); tz++) for (let tx = Math.floor(minX / size); tx <= Math.floor(maxX / size); tx++) out.push(gridKey(tx, tz));
  return out;
}
// ensureLoaded(x, z, r, lod) | ({ x, z, r }, lod) | ({ minX, maxX, minZ, maxZ }, lod) -> Promise<tile[]>: once the
// package's data is in memory and the city built on it (the road graph's traffic network up), the tile manager's tiles
// there at lod (the world contract's, cities/sf/docs/STREAMING.md); the array also says .complete (every tile the
// bounds touch is one the package compiled) and .missing (the tile ids it never compiled, 'hg1-conus/0/c/r'; a v0
// package's 'ix,iz': the tile service compiles them on first request). No bounds: [] (complete) once the package is up.
async function ensureLoaded(W, ...a) {
  const N = globalThis.window?.NYC;
  if (N?.dataReady) await N.dataReady;
  for (let i = 0; i < 1200 && !globalThis.window?.__NYC_APP?.trafficSystem?.network; i++) await new Promise((r) => setTimeout(r, 50));
  const got = a[0] == null ? [] : await W.tiles.ensureLoaded(...a);
  const missing = a[0] == null ? [] : tilesFor(...a).filter((k) => !compiledSet().has(k));
  return Object.assign(got, { complete: missing.length === 0, missing });
}
// how busy the streets are round (x, z): the compiled tiles' headers over the near and mid rings (5 x 5 tiles),
// 0.15 + buildings per km2 / 2000, clamped 0.15..1 (v0: the package's one density)
function crowdAt(x, z) {
  const P = PKG(); if (!P) return 1;
  if (!hg1() || !P.tileHeaders) return P.density ?? 1;
  const size = tileSize(), ix = Math.floor(x / size), iz = Math.floor(z / size);
  let n = 0, area = 0;
  for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) { const h = P.tileHeaders[gridKey(ix + dx, iz + dz)]; if (h) { n += h.bcount; area += h.groundAreaM2; } }
  return area ? Math.round(Math.min(1, Math.max(0.15, 0.15 + n / Math.max(area / 1e6, 0.1) / 2000)) * 100) / 100 : P.density ?? 1;
}

// (hg1: the origin is a tile's NW corner, -z grid north whose true bearing is bearingDeg = gamma0, session metres =
// grid metres / scale (k0); a v0 package: its box centre, true north). Read from the package when asked: the world can
// be made before its geodata.js has run.
function frameOf(P) {
  return P && P.grid === 'hg1'
    ? { units: 'm', origin: { lat: P.frame?.lat0, lon: P.frame?.lon0, label: P.frame?.origin || 'tile corner' }, east: '+x', north: '-z', up: '+y', headingZero: '+z',
      yOffset: P.yOffset || 0, bearingDeg: P.gamma0, scale: P.k0, grid: 'hg1', domain: P.domain, c0: P.origin.c0, r0: P.origin.r0 }
    : { units: 'm', origin: { lat: P?.frame?.lat0, lon: P?.frame?.lon0, label: 'package box centre' }, east: '+x', north: '-z', up: '+y', headingZero: '+z', yOffset: P?.frame?.yOffset || 0, bearingDeg: 0, scale: 1, grid: null, domain: null };
}

export function createPkg() {
  const P = PKG() || {};
  const W = createWorld({
    id: 'pkg', name: String(P.name || 'Hometown').split(',')[0],
    frame: frameOf(P),
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
    pois,
    // (a sidewalk or a paved square where a man stands: the package's ground mask, San Francisco's classes)
    sidewalkAt: (x, z) => maskClass(x, z) === 1,
  });
  W.pkg = P.id || null;
  // how busy its streets are, 0..1 (the compiled density, buildings per km2: wagmi/street/crowd.js reads it, 1 elsewhere)
  // (on the national grid: the ring tiles' headers round the player, refreshed every 2 s; a v0 package: its one density)
  let crowd = null, crowdT = -1e9;
  Object.defineProperty(W, 'crowd', { configurable: true, enumerable: true, get() {
    const now = Date.now();
    if (crowd == null || now - crowdT > 2000) {
      const Q = PKG() || {}, e = globalThis.window?.__NYC_APP?.controllerManager?.getActiveEntity?.(), at = e?.position || Q.spawn;
      crowd = Math.max(0.1, Math.min(1, at ? crowdAt(at.x, at.z) : Q.density ?? 1)); crowdT = now;
    }
    return crowd;
  }, set(v) { crowd = v; crowdT = Date.now(); } });
  W.crowdAt = crowdAt;
  Object.defineProperty(W, 'frame', { configurable: true, enumerable: true, get: () => ({ bearingDeg: 0, scale: 1, grid: null, domain: null, ...frameOf(PKG()) }) });
  W.ensureLoaded = (...a) => ensureLoaded(W, ...a);
  // the package's own landmarks: its public places (school, library, park...) by name
  Object.defineProperty(W, 'landmarks', { get: () => Object.fromEntries(Object.values(PKG()?.places || {}).filter((p) => p.kind && !/^the /.test(p.name)).map((p) => [p.name, { x: p.cx, z: p.cz, kind: p.kind }])) });
  return W;
}
