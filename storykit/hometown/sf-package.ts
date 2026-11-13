/**
 * Hometown: San Francisco's place library as a CityPackage, so SF goes through the same builder and gate path as a
 * compiled town (and SF 2040 can be mogged on it later). It reads only what the repo keeps for San Francisco:
 *
 *   places       storykit/cities/sf/city.js PLACES (the 35 corners, piers and ramps, x, z) and its 14 arrivals
 *                (storykit/pack/cities.ts PLACES.sf names; x, z from the city's own data: the 11 landmark arrivals at
 *                their OSM landmark, the 3 street arrivals at their junction, as js/city-config.js finds them)
 *   landmarks    js/sf-geodata.js GEO.landmarks: every named one inside the drivable core's box, with its OSM kind
 *   districts    the road graph's neighbourhoods (GEO.roadGraph.nhoods), each at the middle of its streets
 *   spawnPoints  the 14 arrivals
 *   roadsSummary the road graph: its named streets, their length, the longest
 *   tileSet      the SHA-256 of each of the city's data files (js/sf-geodata.js, js/sf-places.js, data/**.bin): the
 *                library is not compiled by the hometown compiler, so its "compiler" is the library's own version
 *
 * Server side (Node) only: it reads the files once and keeps the package.
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { places as sfPlaces } from '../cities/sf/city.js';
import { PLACES } from '../pack/cities.ts';
import { tileSetHash, type CityPackage, type PackageLandmark, type PackagePlace } from './city-package.ts';

export const SF_PLACE_ID = 'us-ca-san-francisco';
/** The place library's version (bump it when city.js PLACES or the arrivals change: a Mog keeps the version it pinned). */
export const SF_LIBRARY_VERSION = 'sf-library-1';
// the arrivals at an OSM landmark (js/city-config.js LANDMARK_TELEPORTS) and at a junction (TELEPORT_DEFS: at, along)
const LANDMARK_ARRIVALS: Record<string, string> = { ferry: 'San Francisco Ferry Building', salesforce: 'Salesforce Tower', transamerica: 'Transamerica Pyramid',
  coit: 'Coit Tower', lombard: 'Lombard Street', wharf: "Fisherman's Wharf", unionsquare: 'Union Square', chinatown: 'Dragon Gate',
  civiccenter: 'San Francisco City Hall', oraclepark: 'Oracle Park', nobhill: 'Grace Cathedral' };
const STREET_ARRIVALS: Record<string, [string, string, string]> = { powell: ['POWELL ST', 'CALIFORNIA ST', 'STOCKTON ST'], market: ['MONTGOMERY ST', 'MARKET ST', 'SUTTER ST'], mission: ['14TH ST', 'DOLORES ST', '15TH ST'] };

const SF = (...p: string[]) => join(process.cwd(), 'storykit', 'cities', 'sf', ...p);
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const slug = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 36) || 'x';
const title = (s: string) => s.toLowerCase().replace(/\b0(\d)/g, '$1').replace(/\b[a-z]/g, (c) => c.toUpperCase()).replace(/\bSt\b/g, 'St').replace(/\bAve\b/g, 'Ave');

type Geo = { box: { x0: number; x1: number; z0: number; z1: number }; landmarks: Record<string, { x: number; z: number; kind?: string }>;
  roadGraph: { nodes: number[]; names: string[]; links: [number, number, number, ...unknown[]][]; nhoods: string[]; linkNhood: number[] } };
function geo(): Geo {
  const sandbox = { window: { NYC: {} as Record<string, unknown> } };
  runInNewContext(readFileSync(SF('js', 'sf-geodata.js'), 'utf8'), sandbox);
  return sandbox.window.NYC.GEO as Geo;
}
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? files(p) : [p]; });
}

let cached: CityPackage | null = null;
/** San Francisco's CityPackage (built once per process). */
export function sfCityPackage(): CityPackage {
  if (cached) return cached;
  const G = geo(), R = G.roadGraph;
  const node = (i: number) => ({ x: R.nodes[i * 2], z: R.nodes[i * 2 + 1] });
  const junction = (a: string, b: string) => {
    const at = new Map<number, Set<string>>();
    for (const [u, v, ni] of R.links) for (const n of [u, v]) { if (!at.has(n)) at.set(n, new Set()); at.get(n)!.add(R.names[ni]); }
    for (const [n, set] of at) if (set.has(a) && set.has(b)) return node(n);
    return null;
  };
  const places: PackagePlace[] = [];
  const spawnPoints: CityPackage['spawnPoints'] = [];
  // the arrivals
  for (const [id, name] of Object.entries(LANDMARK_ARRIVALS)) {
    const L = G.landmarks[name];
    if (!L) throw new Error(`SF landmark ${name} is missing`);
    places.push({ id, kind: L.kind && L.kind !== 'yes' ? L.kind : 'landmark', name: PLACES.sf[id].name, x: L.x, z: L.z, tags: ['arrival', 'generic-name', `osm:name=${name}`] });
    spawnPoints.push({ id, x: L.x, z: L.z, heading: 0, mode: 'car', name: PLACES.sf[id].name });
  }
  for (const [id, [at, along, toward]] of Object.entries(STREET_ARRIVALS)) {
    const j = junction(at, along), t = junction(toward, along);
    if (!j || !t) throw new Error(`SF arrival ${id}: no junction`);
    const heading = Math.atan2(t.x - j.x, t.z - j.z);
    places.push({ id, kind: 'corner', name: PLACES.sf[id].name, x: j.x, z: j.z, heading, tags: ['arrival'] });
    spawnPoints.push({ id, x: j.x, z: j.z, heading, mode: 'car', name: PLACES.sf[id].name });
  }
  // the place library
  for (const [id, p] of Object.entries(sfPlaces() as Record<string, { x: number; z: number; name: string; foot?: boolean }>)) {
    const kind = /pier|dock/i.test(p.name) ? 'pier' : /ramp/i.test(p.name) ? 'ramp' : /BART/.test(p.name) ? 'train_station' : 'corner';
    places.push({ id, kind, name: p.name, x: p.x, z: p.z, tags: ['library'], ...(p.foot ? { foot: true } : {}) });
  }
  // the landmarks in the core
  const { x0, x1, z0, z1 } = G.box, seen = new Set<string>();
  const landmarks: PackageLandmark[] = [];
  for (const [name, L] of Object.entries(G.landmarks)) {
    if (/^\d+$/.test(name) || L.x < x0 || L.x > x1 || L.z < z0 || L.z > z1) continue;
    let id = slug(name); while (seen.has(id)) id += '-2'; seen.add(id);
    landmarks.push({ id, name, kind: L.kind && L.kind !== 'yes' ? L.kind : 'building', x: Math.round(L.x * 10) / 10, z: Math.round(L.z * 10) / 10 });
  }
  // districts: each neighbourhood at the middle of its streets; roads: named streets and their length
  const sum = new Map<number, { x: number; z: number; n: number }>(), len = new Map<string, number>();
  let km = 0;
  R.links.forEach(([u, v, ni], i) => {
    const a = node(u), b = node(v), d = Math.hypot(b.x - a.x, b.z - a.z);
    km += d / 1000; len.set(R.names[ni], (len.get(R.names[ni]) ?? 0) + d);
    const h = R.linkNhood[i], s = sum.get(h) ?? { x: 0, z: 0, n: 0 };
    s.x += (a.x + b.x) / 2; s.z += (a.z + b.z) / 2; s.n++; sum.set(h, s);
  });
  const districts = R.nhoods.map((name, h) => ({ name, s: sum.get(h) })).filter((d) => d.name && d.s)
    .map((d) => ({ id: slug(d.name), name: d.name, x: Math.round(d.s!.x / d.s!.n), z: Math.round(d.s!.z / d.s!.n) }));
  const main = [...len].filter(([n]) => n).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([n]) => title(n));
  // the tile set: the city's data files
  const data = [SF('js', 'sf-geodata.js'), SF('js', 'sf-places.js'), ...files(SF('data'))].sort();
  const tiles = data.map((f) => ({ id: f.slice(SF().length + 1), sha256: sha(readFileSync(f)) }));
  cached = {
    v: 1, placeId: SF_PLACE_ID, name: 'San Francisco', state: 'California', compilerVersion: SF_LIBRARY_VERSION,
    tileSet: { hash: tileSetHash(tiles), count: tiles.length },
    places, landmarks, districts, spawnPoints, roadsSummary: { streets: new Set(R.names.filter(Boolean)).size, km: Math.round(km * 10) / 10, main },
  };
  return cached;
}
