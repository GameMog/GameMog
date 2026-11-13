/**
 * Hometown: the town bundle, the seam between the town builder and everything that plays a town (Hometown e2e spec 3.1).
 *
 * A bundle is one compiled town, addressed by its lock and never changed once written:
 *   data/towns/bundles/{buildId}/{placeId}/{tileSetHash}/
 *     geodata.json      { format: 'hometown-bundle', formatVersion: 1, GEO, PLACE_DATA, PKG }: the objects the compiler's
 *                       legacy assembler writes into geodata.js (MogCity tools/hometown/assemble.py), as data, so Mog
 *                       City's engine fetches them (wagmi/world/town-src.js) instead of running a script from this site
 *     data/terrain.bin.gz, data/buildings.bin.gz, data/groundmask.bin.gz   the package's files, byte for byte
 *     data/far/{tier}-{C}-{R}.bin.gz    its far field (PKG.far, Mog City's pkg-far.js), when the compiler wrote one
 *     citypackage.json  the Story Kit's CityPackage v1 (storykit/hometown/city-package.ts), built here from PKG and GEO
 *     lock.json         the compiler's lock v2 (PKG.lock; lib/hometown/ids.ts ServiceLock)
 *
 * Phase A builds it from the hg1 whole-place assembler (compile.py --id, one package per place); Phase B swaps the
 * producer for the tile service's batch compile without changing any of this.
 */
import { readFileSync } from 'node:fs';
import type { CityPackage, PackagePlace, SpawnPoint, District, PackageLandmark } from '../../storykit/hometown/city-package.ts';
import { classify } from '../../storykit/hometown/safety.ts';
import { storyLock, type ServiceLock } from './ids.ts';

export const BUNDLE_FORMAT = 'hometown-bundle';
export const BUNDLE_FILES = ['geodata.json', 'citypackage.json', 'lock.json', 'data/terrain.bin.gz', 'data/buildings.bin.gz', 'data/groundmask.bin.gz'] as const;

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
export type Geodata = { GEO: Json; PLACE_DATA: Json; PKG: Json };

/** The three objects of a compiler geodata.js (one `window.NYC.<K> = <json>;` line each; assemble.py writes nothing else). */
export function readGeodataJs(file: string): Geodata {
  const s = readFileSync(file, 'utf8');
  const one = (k: string) => {
    const m = new RegExp(`^window\\.NYC\\.${k} = (.*);$`, 'm').exec(s);
    if (!m) throw new Error(`geodata.js: no window.NYC.${k}`);
    return JSON.parse(m[1]);
  };
  return { GEO: one('GEO'), PLACE_DATA: one('PLACE_DATA'), PKG: one('PKG') };
}

/** geodata.json's body. */
export const geodataJson = (g: Geodata) => ({ format: BUNDLE_FORMAT, formatVersion: 1, GEO: g.GEO, PLACE_DATA: g.PLACE_DATA, PKG: g.PKG });

const titleStreet = (s: string) => s.toLowerCase().replace(/(^|[\s-])([a-z])/g, (_, a, b) => a + b.toUpperCase()).replace(/\b(\d+)(St|Nd|Rd|Th)\b/g, (_, n, x) => n + x.toLowerCase());

/** The road graph in words: named streets, km of road, the longest few. */
function roadsOf(GEO: Json) {
  const rg = GEO.roadGraph || {}, nodes: number[] = rg.nodes || [], names: string[] = rg.names || [];
  const len = new Map<string, number>();
  let km = 0;
  for (const l of rg.links || []) {
    const pts = [nodes[l[0] * 2], nodes[l[0] * 2 + 1], ...(l[6] || []), nodes[l[1] * 2], nodes[l[1] * 2 + 1]];
    let m = 0; for (let i = 2; i < pts.length; i += 2) m += Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]);
    km += m / 1000;
    const n = names[l[2]]; if (n) len.set(n, (len.get(n) || 0) + m);
  }
  // (one street under its directional names, "W BROADWAY ST" and "E BROADWAY ST", is one street)
  const base = new Map<string, number>();
  for (const [n, m] of len) { const b = titleStreet(n.replace(/^[NSEW] /, '')); base.set(b, (base.get(b) || 0) + m); }
  const main = [...base].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([n]) => n);
  return { streets: base.size, km: Math.round(km * 10) / 10, main };
}

/**
 * The town's CityPackage (storykit/hometown/city-package.ts) from a compiled bundle: its places are PKG.places by the
 * keys Mog City's world builds them under (wagmi/world/pkg.js buildPlaces) plus the arrivals as "pkg_<k>" (its
 * TELEPORT_LOCATIONS, PLACE_DATA.regional), the parts of town are the compiler's arrivals, the landmarks its public places.
 */
export function cityPackageOf(g: Geodata, town: { placeId: string; name: string; stateName: string }): CityPackage {
  const P = g.PKG, lock = storyLock(P.lock as ServiceLock);
  if (!lock) throw new Error('the bundle has no lock v2 or v3');
  if (lock.place !== town.placeId) throw new Error(`the bundle is ${lock.place}, not ${town.placeId}`);
  const places: PackagePlace[] = [];
  const spawnPoints: SpawnPoint[] = [], districts: District[] = [];
  for (const [k, s] of Object.entries((g.PLACE_DATA.regional || {}) as Record<string, Json>)) {
    places.push({ id: k, kind: 'arrival', name: k === 'pkg_downtown' ? `downtown ${town.name}` : String(s.name), x: s.x, z: s.z, heading: s.heading, tags: ['arrival'] });
    spawnPoints.push({ id: k, x: s.x, z: s.z, heading: s.heading, mode: 'car', name: String(s.name) });
    const d = k.replace(/^pkg_/, '');
    districts.push({ id: d, name: d === 'downtown' ? 'Downtown' : `the ${d[0].toUpperCase()}${d.slice(1)} Side`, x: s.x, z: s.z });
  }
  for (const [k, p] of Object.entries((P.places || {}) as Record<string, Json>)) {
    if (!/^[a-z0-9][a-z0-9_-]{0,39}$/.test(k)) continue;
    places.push({ id: k, kind: String(p.kind), name: String(p.name).slice(0, 80), x: p.x, z: p.z, heading: p.heading, tags: [`overture=${p.kind}`] });
  }
  const landmarks: PackageLandmark[] = places.filter((p) => p.kind !== 'arrival' && !classify(p).business && !classify(p).residence)
    .map((p) => ({ id: p.id, name: p.name, kind: p.kind, x: p.x, z: p.z }));
  return {
    v: 1, placeId: town.placeId, name: town.name, state: town.stateName, compilerVersion: lock.compiler,
    tileSet: { hash: lock.tiles, count: (P.tiles || []).length },
    places, landmarks, districts, spawnPoints, roadsSummary: roadsOf(g.GEO),
    grid: 'hg1', domain: lock.domain as CityPackage['domain'], buildId: lock.compiler, origin: lock.origin, k0: lock.k0, gamma0: lock.gamma0, yOffset: lock.yOffset, waterLevel: lock.waterLevel,
    ...(lock.formatVersion === 3 ? { lockVersion: 3 as const } : {}),
  };
}
