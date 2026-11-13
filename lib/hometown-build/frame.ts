/**
 * A town's FRAME (SPEC 4.2): what the compiler's `--frame <placeId>` (MogCity task M2) writes to frames/{build}/{place}.json,
 * computed from stage 1, the ctx blocks, the regions and the DEM only, never from a compiled tile. It is the one source
 * of truth for the spawns and the story places: the assembler reads them from it, and so does the Story Kit here.
 *
 *   { format: 'hometown-frame', formatVersion: 1, buildId, placeId, name?,
 *     tiles: ["hg1-conus/0/c/r", ...]                 the pinned tile set (ids only)
 *     lock: ServiceLock v3                            tiles = sha256(buildId + "\n" + sorted ids)
 *     spawn: { tile: [c, r], x, z, heading }          the main spawn (session metres)
 *     spawnDistrict: [c0, r0, c1, r1]                 the 5 x 5 tiles round the spawn tile, built first
 *     spawns: [{ id, name, x, z, heading, inDistrict }]   arrivals ("pkg_downtown", ...)
 *     places: { key: { kind, name, x, z, heading?, inDistrict } }   Overture places snapped to segments within 80 m
 *     roads?: { streets, km, main[] }                 from the regions' segment names
 *     far?: ["hg1-conus/1/C/R", ...]                  the far tiles round the town (far.py place_far)
 *     refused?: ["hg1-conus/0/c/r", ...] }            tiles with no DEM: far field and haze, never a hole
 *
 * cityPackageOfFrame builds the Story Kit's CityPackage from it: the story starts seconds after the pick, in parallel
 * with the build, and pins lock v3.
 */
import type { CityPackage, PackagePlace, SpawnPoint, District, PackageLandmark } from '../../storykit/hometown/city-package.ts';
import { classify } from '../../storykit/hometown/safety.ts';
import { storyLock, tilesIdOf, type ServiceLock } from '../hometown/ids.ts';

export type FramePlace = { kind: string; name: string; x: number; z: number; heading?: number; inDistrict?: boolean };
export type FrameSpawn = { id: string; name: string; x: number; z: number; heading: number; inDistrict?: boolean };
export type TownFrame = {
  format: 'hometown-frame'; formatVersion: 1; buildId: string; placeId: string; name?: string;
  tiles: string[]; lock: ServiceLock;
  spawn: { tile: [number, number]; x: number; z: number; heading: number };
  spawnDistrict: [number, number, number, number];
  spawns: FrameSpawn[]; places: Record<string, FramePlace>;
  roads?: { streets: number; km: number; main: string[] }; far?: string[]; refused?: string[];
};

/** What is wrong with a frame (empty: it can be used). */
export function frameProblems(f: unknown): string[] {
  const out: string[] = [];
  const x = f as TownFrame;
  if (!x || x.format !== 'hometown-frame' || x.formatVersion !== 1) return ['not a hometown-frame v1'];
  const l = storyLock(x.lock);
  if (!l || l.formatVersion !== 3) out.push('lock is a lock v3');
  else if (x.lock.tiles !== tilesIdOf(x.buildId, x.tiles)) out.push('lock.tiles is not sha256(buildId + sorted tile ids)');
  if (x.lock?.place !== x.placeId || x.lock?.buildId !== x.buildId) out.push('lock names another place or build');
  if (!x.spawn || !Array.isArray(x.spawn.tile)) out.push('spawn { tile, x, z, heading }');
  if (!Array.isArray(x.spawnDistrict) || x.spawnDistrict.length !== 4) out.push('spawnDistrict [c0, r0, c1, r1]');
  if (!Array.isArray(x.spawns) || !x.spawns.length) out.push('spawns: at least one');
  if (!x.places || typeof x.places !== 'object') out.push('places: an object');
  return out;
}

/** The Story Kit's CityPackage from a frame (lock v3): places and spawns carry inDistrict for the mission-1 rule. */
export function cityPackageOfFrame(f: TownFrame, town: { placeId: string; name: string; stateName: string }): CityPackage {
  const bad = frameProblems(f);
  if (bad.length) throw new Error(`frame: ${bad.join('; ')}`);
  if (f.placeId !== town.placeId) throw new Error(`the frame is ${f.placeId}, not ${town.placeId}`);
  const L = f.lock;
  const places: PackagePlace[] = [], spawnPoints: SpawnPoint[] = [], districts: District[] = [];
  for (const s of f.spawns) {
    places.push({ id: s.id, kind: 'arrival', name: s.id === 'pkg_downtown' ? `downtown ${town.name}` : s.name, x: s.x, z: s.z, heading: s.heading, tags: ['arrival'], inDistrict: !!s.inDistrict });
    spawnPoints.push({ id: s.id, x: s.x, z: s.z, heading: s.heading, mode: 'car', name: s.name, inDistrict: !!s.inDistrict });
    const d = s.id.replace(/^pkg_/, '');
    districts.push({ id: d, name: d === 'downtown' ? 'Downtown' : `the ${d[0].toUpperCase()}${d.slice(1)} Side`, x: s.x, z: s.z });
  }
  for (const [k, p] of Object.entries(f.places)) {
    if (!/^[a-z0-9][a-z0-9_-]{0,39}$/.test(k) || places.some((q) => q.id === k)) continue;
    places.push({ id: k, kind: String(p.kind), name: String(p.name).slice(0, 80), x: p.x, z: p.z, heading: p.heading, tags: [`overture=${p.kind}`], inDistrict: !!p.inDistrict });
  }
  const landmarks: PackageLandmark[] = places.filter((p) => p.kind !== 'arrival' && !classify(p).business && !classify(p).residence)
    .map((p) => ({ id: p.id, name: p.name, kind: p.kind, x: p.x, z: p.z }));
  return {
    v: 1, placeId: town.placeId, name: town.name, state: town.stateName, compilerVersion: L.buildId,
    tileSet: { hash: L.tiles, count: f.tiles.length }, places, landmarks, districts, spawnPoints,
    roadsSummary: f.roads ?? { streets: 0, km: 0, main: [] },
    grid: 'hg1', domain: L.domain as CityPackage['domain'], buildId: L.buildId, origin: { c0: L.origin.c0, r0: L.origin.r0 }, k0: L.k0, gamma0: L.gamma0,
    yOffset: L.yOffset, waterLevel: L.waterLevel, lockVersion: 3, spawnDistrict: f.spawnDistrict,
  };
}
