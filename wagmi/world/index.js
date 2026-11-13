// Mog City's world contract: the one city-geography API the game layer (wagmi/) uses. The city is picked once, from
// the one city reader (city.js: window.NYC.CITY, set by index.html from ?city=), and its adapter (ny.js, sf.js) reads
// that city's own globals behind it. Nothing outside wagmi/world/ reads the city's tables, its place library or the
// address's ?city= itself.
//   world.id ('ny' | 'sf'), world.name, world.frame
//   ground   sampleSurface(x, z, mode = 'person') -> { y, base, water, curb, park };  groundY(x, z, mode);  roadY(x, z)
//            (the road's level: a hill's bare ground, 0 on New York's flat streets);  isPark(x, z);  inWater(x, z)
//   solids   queryColliders({ x, z, r } | { minX, maxX, minZ, maxZ })
//   roads    nearestLane(x, z, mode = 'car', R = 80) -> { x, z, heading, d, edge } | null;  throughRoad({ x, z }) -> a
//            long main road's lane near there { x, z, heading, edge } | null;  route(a, b, mode) -> Promise
//            of [[x, z], ...] ('car' the GPS's legal route, 'foot' a walk, 'chase' a chase car's);  roadClass(edge),
//            isAvenue(edge);  streetNameAt(x, z, { dir: { ux, uz }, r });  districtAt(x, z);  commercial(district)
//   signals  walkSignal({ dx, dz }, t) (a crossing walked that way has the WALK);  signalAt(road, t) -> 'green' | ...
//   blocks   blockAt(x, z), blocksInRect(minX, maxX, minZ, maxZ), blocks (the curb islands)
//   places   places (key -> { x, z, heading, name, cx?, cz?, foot? }), placesMissing, spawnPoints('all' | 'ground'),
//            findMissionSites({ near, min, max, count, foot }), landmarks (name -> { x, z, ... })
//   scene    sceneGroups (what the city's scene groups are called: grid, blocks, landmarks, streetDetails, traffic...)
//   grid     New York's street grid (street(n), streetLine(n), avenue(id), avenueLine(id)); null in San Francisco
//   tiles    ensureLoaded(x, z, r, lod = 'near') (or ({ x, z, r }) / ({ minX, maxX, minZ, maxZ })) -> Promise<tile[]>: the
//            tiles there loaded; tiles: the tile manager (tiles.js: rings, LRU, on('load' | 'upgrade' | 'unload'),
//            stats()), its source today the city in memory sliced (tiles-mem.js); ?tiles=1 has it follow the player
//   origin   the floating origin (?origin=float, origin.js: the scene drawn rebased round the player, the world's
//            coordinates unchanged), else null. See cities/sf/docs/STREAMING.md
import { cityId } from './city.js';
import { createNY } from './ny.js';
import { createSF } from './sf.js';

export { cityId, cityQuery, CITIES } from './city.js';
export const world = cityId() === 'sf' ? createSF() : createNY();
export default world;
