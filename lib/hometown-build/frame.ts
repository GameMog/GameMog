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
  /** the district bundle's variant as the compiler names it (`district-{c}-{r}`, the spawn tile) */
  variant?: string;
};

/**
 * The compiler's frame as it is stored (MogCity tools/hometown/frame.py, compiler 0.7.0) -> TownFrame. The compiler
 * writes `version: 1`, `district: { tile, tileRange, variant, ... }`, `spawn` (no tile), `spawns` and `places` as
 * objects keyed by name with `district: true`, and `streets: [{ name, m }]`; this file's shape is the one the queue and
 * the Story Kit read. A frame already in this shape passes through unchanged. Never throws: frameProblems judges.
 */
export function normalizeFrame(raw: unknown): TownFrame | null {
  const f = raw as Record<string, any> | null;
  if (!f || typeof f !== 'object' || f.format !== 'hometown-frame') return null;
  if (f.formatVersion === 1 && Array.isArray(f.spawnDistrict) && Array.isArray(f.spawns)) return f as TownFrame;
  const d = f.district ?? {};
  const spawnsObj: Record<string, any> = f.spawns && typeof f.spawns === 'object' && !Array.isArray(f.spawns) ? f.spawns : {};
  const spawns: FrameSpawn[] = Object.keys(spawnsObj).sort((a, b) => (a === f.spawnKey ? -1 : b === f.spawnKey ? 1 : a < b ? -1 : 1)).map((k) => {
    const s = spawnsObj[k];
    return { id: `pkg_${k}`, name: String(s.name ?? k), x: Number(s.x), z: Number(s.z), heading: Number(s.heading ?? 0), inDistrict: !!(s.district ?? s.inDistrict) };
  });
  const places: Record<string, FramePlace> = {};
  for (const [k, p] of Object.entries((f.places ?? {}) as Record<string, any>)) {
    places[k] = { kind: String(p.kind), name: String(p.name), x: Number(p.x), z: Number(p.z), heading: p.heading == null ? undefined : Number(p.heading), inDistrict: !!(p.district ?? p.inDistrict) };
  }
  const streets = Array.isArray(f.streets) ? (f.streets as { name?: string; m?: number }[]) : [];
  const tile = Array.isArray(d.tile) ? d.tile : f.spawn?.tile;
  return {
    format: 'hometown-frame', formatVersion: Number(f.formatVersion ?? f.version) as 1, buildId: f.buildId, placeId: f.placeId, name: f.name,
    tiles: f.tiles, lock: f.lock,
    spawn: { tile: tile as [number, number], x: Number(f.spawn?.x), z: Number(f.spawn?.z), heading: Number(f.spawn?.heading ?? 0) },
    spawnDistrict: (d.tileRange ?? f.spawnDistrict) as [number, number, number, number],
    spawns, places,
    roads: { streets: streets.length, km: Math.round(streets.reduce((a, s) => a + (Number(s.m) || 0), 0) / 100) / 10, main: streets.slice(0, 8).map((s) => String(s.name ?? '')).filter(Boolean) },
    far: Array.isArray(f.far) ? f.far : undefined, refused: Array.isArray(f.refused) ? f.refused : undefined,
    ...(typeof d.variant === 'string' ? { variant: d.variant } : {}),
  } as TownFrame;
}

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
