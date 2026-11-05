// San Francisco as a Story Kit CityModule (see ARCHITECTURE.md). The city itself is the San Francisco fork of Mr.doob's
// Slop New York (cities/sf/js, classic scripts on the window.NYC global, booted by its main.js); this file is the one
// place the engine and the framework touch it.
//
// Frame: metres, origin Market St x Montgomery St, +x east, -z north, y = NAVD88 metres (Nob Hill ~100 m up).
// Heading 0 faces +z (south); heading = atan2(dx, dz).

const N = () => window.NYC;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export const id = 'sf';
export const name = 'San Francisco';
export const frame = { origin: { lat: 37.788721152, lon: -122.402065729, label: 'Market St x Montgomery St' }, east: '+x', north: '-z', up: '+y', headingZero: '+z' };

// the city app once it is built and its first frame is on screen
let app = null;
export function load(onProgress) {
  return new Promise((resolve, reject) => {
    const t0 = performance.now();
    const tick = () => {
      const a = window.__NYC_APP;
      if (a && a.controllerManager && a.ready) { app = a; return resolve(api); }
      if (window.__STORYKIT_BOOT_ERROR) return reject(window.__STORYKIT_BOOT_ERROR);
      if (window.__STORYKIT_NO_WEBGPU) return; // (the needs-WebGPU card is up: the city never loads, quietly)
      if (performance.now() - t0 > 180000) return reject(new Error('San Francisco did not finish loading'));
      onProgress?.(); setTimeout(tick, 100);
    };
    tick();
  });
}
// one city in memory at a time: a hard page navigation frees it (FEASIBILITY.md: SF alone is 600-900 MB)
export function dispose() { location.reload(); }

// the ground the car stands on at (x, z): terrain, or a bridge deck / tunnel floor picked by levelY (the height you are
// at now; omit it for the surface)
export function groundHeight(x, z, levelY = null) {
  const T = N().Terrain, G = N().GradeSeparation;
  if (!(T && T.loaded)) return 0;
  const d = G && levelY !== null ? G.floorAt(x, z, levelY) : null;
  return d !== null ? d : T.groundAt(x, z);
}
export function inWater(x, z) { const T = N().Terrain; return !!(T && T.loaded) && T.heightAt(x, z) <= T.waterLevel + 0.05; }

// collision: is a car (or a walker's circle) clear of the city's solids at (x, z)?
export function isClear(x, z, heading = 0, mode = 'car') {
  const cm = app.controllerManager, y = groundHeight(x, z);
  return cm.isWorldPositionClear({ x, y, z }, heading, mode, 0);
}

// spawn points: the city's arrivals (a junction near each landmark, facing it), { x, z, heading }
export function spawnPoints() {
  const out = {};
  for (const [k, p] of Object.entries(N().TELEPORT_LOCATIONS || {})) out[k] = { x: p.x, z: p.z, heading: p.heading, mode: p.mode || 'car' };
  return out;
}
// landmarks: OSM-named sites (GEO.landmarks), { name: { x, z } }
export function landmarks() { return N().LANDMARK_SITES || {}; }

// street name at (x, z) (nearest centreline within r m), or null
export function streetAt(x, z, r = 40) {
  const near = N().nearestRoads ? N().nearestRoads(x, z, r) : [];
  return near.length ? near[0].road.name || near[0].name || null : null;
}

// the drivable road graph (js/road-network.js): directed edges with lanes, turn moves, signals
export function roads() { return app.trafficSystem.network; }

// put the active player (car by default) at (x, z) facing heading (radians; omit to face along the street)
export function placePlayer(x, z, heading, mode = 'car') {
  if (app.controllerManager.activeMode !== mode) app.selectMode(mode);
  const at = app.controllerManager.teleportActiveTo(x, z, heading);
  app.cameraSystem.resetForTeleport();
  return at;
}

// route(a, b): a lane-following route between any two points of the drivable core, Dijkstra over real lane
// centrelines and turn connectors (generalised from the fork's ride.js planFirstRide). Returns
// { points: [{ x, y, z, heading, s }], turns: [{ s, name, direction }], length } or null.
export function route(a, b, { avoidUTurns = true } = {}) {
  const net = roads(), NYC = N();
  const lanePoint = (e, l, s) => ({ x: e.sx + e.dx * s + e.rx * e.lanes[l], z: e.sz + e.dz * s + e.rz * e.lanes[l], y: NYC.edgeY(e, s, l), heading: Math.atan2(e.dx, e.dz) });
  const nearby = (p, R = 60) => {
    const list = [];
    for (const e of net.edges) {
      if (e.len < 8) continue;
      const mx = e.sx + e.dx * e.len / 2, mz = e.sz + e.dz * e.len / 2;
      if (Math.abs(mx - p.x) > R + e.len / 2 || Math.abs(mz - p.z) > R + e.len / 2) continue;
      for (let lane = 0; lane < e.lanes.length; lane++) {
        const s = clamp((p.x - e.sx) * e.dx + (p.z - e.sz) * e.dz, 3, e.len - 3), q = lanePoint(e, lane, s);
        const d = Math.hypot(q.x - p.x, q.z - p.z);
        if (d < R) list.push({ e, lane, s, p: q, d });
      }
    }
    return list.sort((u, v) => u.d - v.d).slice(0, 10);
  };
  const starts = nearby(a), ends = nearby(b);
  if (!starts.length || !ends.length) return null;
  const key = (e, l) => e.id * 8 + l;
  const heap = [];
  const push = (v) => { let i = heap.length; heap.push(v); while (i) { const p = (i - 1) >> 1; if (heap[p].cost <= v.cost) break; heap[i] = heap[p]; i = p; } heap[i] = v; };
  const pop = () => { const first = heap[0], last = heap.pop(); if (heap.length) { let i = 0; while (i * 2 + 1 < heap.length) { let j = i * 2 + 1; if (j + 1 < heap.length && heap[j + 1].cost < heap[j].cost) j++; if (heap[j].cost >= last.cost) break; heap[i] = heap[j]; i = j; } heap[i] = last; } return first; };
  const best = new Map(), previous = new Map(), origin = new Map();
  for (const s of starts) {
    const k = key(s.e, s.lane), cost = s.d * 4 - s.s;
    if (cost < (best.get(k) ?? Infinity)) { best.set(k, cost); origin.set(k, s); push({ e: s.e, lane: s.lane, cost, k }); }
  }
  let finish = null;
  while (heap.length) {
    const cur = pop(); if (cur.cost !== best.get(cur.k)) continue;
    const o = origin.get(cur.k);
    const end = ends.find((t) => t.e === cur.e && t.lane === cur.lane && (!o || t.s > o.s + 5));
    if (end) { finish = { ...end, k: cur.k }; break; }
    for (const move of cur.e.moves) {
      const l = move.out[cur.lane], e = move.to;
      if (l < 0 || l === undefined || (avoidUTurns && move.turn === 'U')) continue;
      const c = net.connector(cur.e, cur.lane, e, l);
      const k = key(e, l), cost = cur.cost + cur.e.len + c.len + (move.turn === 'S' ? 0 : 8);
      if (cost < (best.get(k) ?? Infinity)) { best.set(k, cost); previous.set(k, cur); push({ e, lane: l, k, cost }); }
    }
  }
  if (!finish) return null;
  const states = []; let cursor = finish;
  while (cursor) { states.push(cursor); cursor = previous.get(cursor.k); }
  states.reverse();
  const start = origin.get(states[0].k), points = [], turns = [];
  const add = (p) => { const last = points.at(-1); points.push({ ...p, s: (last?.s || 0) + (last ? Math.hypot(p.x - last.x, p.z - last.z) : 0) }); };
  states.forEach((st, i) => {
    const { e, lane } = st, s0 = i === 0 ? start.s : 0, s1 = i === states.length - 1 ? finish.s : e.len;
    if (i) {
      const prev = states[i - 1], c = net.connector(prev.e, prev.lane, e, lane), p = {};
      const delta = wrap(Math.atan2(e.dx, e.dz) - Math.atan2(prev.e.dx, prev.e.dz));
      if (e.name !== prev.e.name) turns.push({ s: points.at(-1).s, name: e.name, direction: Math.abs(delta) < 0.3 ? 'Continue' : delta > 0 ? 'Turn left' : 'Turn right' });
      for (let d = 0; d < c.len; d += 1.5) { net.curvePoint(c, d, p); add({ x: p.x, z: p.z, y: NYC.curveY(c, d), heading: Math.atan2(p.dx, p.dz) }); }
    }
    for (let d = s0; d < s1; d += 2) add(lanePoint(e, lane, d));
    add(lanePoint(e, lane, s1));
  });
  return { points, turns, length: points.at(-1).s, start: points[0], end: points.at(-1) };
}


// the place library a story picks from by name ("@key" in a pack, framework/story.js), on top of the spawn points and
// landmarks: street corners, piers and ramps of the drivable core, in the city's frame. A `drive` snaps each to the
// nearest lane; the ones marked `foot` are more than 40 m off the lanes (a pier's end, a building's door) and are for a
// `walk` step (drive to a corner near them first).
const PLACES = {
  touchdown: { x: 882, z: 217, name: 'Fremont & Harrison' },
  bayramp: { x: 804, z: 295, name: 'the Bay Bridge on-ramp at 1st St' },
  ramp5th: { x: 156, z: 1212, name: 'the 5th St bridge ramp' },
  ramp280: { x: 511, z: 1570, name: 'the I-280 ramps at King St' },
  ramp101: { x: -676, z: 2039, name: 'the US-101 ramps at 10th St' },
  octavia: { x: -1903, z: 1885, name: 'Market & Octavia' },
  larkin_eddy: { x: -1362, z: 601, name: 'Larkin & Eddy' },
  leavenworth_eddy: { x: -1072, z: 555, name: 'Leavenworth & Eddy' },
  civic: { x: -1297, z: 1013, name: 'Civic Center' },
  bart16: { x: -1560, z: 2560, name: '16th St BART' },
  mission_14: { x: -1564, z: 2447, name: 'Mission at 14th' },
  valencia_15: { x: -1760, z: 2462, name: 'Valencia & 15th' },
  dolores_15: { x: -2165, z: 2441, name: 'Dolores at 15th' },
  under280: { x: 700, z: 2440, name: 'under I-280 at 16th' },
  third_16: { x: 1142, z: 2422, name: '3rd & 16th' },
  mission_rock: { x: 1088, z: 1753, name: '3rd & Mission Rock' },
  fourth_mb: { x: 942, z: 1764, name: '4th St in Mission Bay' },
  pier48: { x: 1403, z: 1446, name: 'Pier 48', foot: true },
  pier28: { x: 1382, z: 64, name: 'Piers 26–28', foot: true },
  pier9: { x: 463, z: -1323, name: 'Pier 9', foot: true },
  pier24: { x: 1263, z: -84, name: 'the Pier 24 dock' },
  tenth_harrison: { x: -811, z: 1903, name: '10th & Harrison' },
  sixth_folsom: { x: -313, z: 1134, name: '6th & Folsom' },
  bryant: { x: -236, z: 1603, name: 'Bryant St by the Hall of Justice' },
  hall: { x: -189, z: 1479, name: 'the Hall of Justice', foot: true },
  vanness: { x: -1702, z: 337, name: 'Van Ness Ave' },
  broadway: { x: -2300, z: -710, name: 'Broadway in Pacific Heights' },
  goldengate_ave: { x: -2399, z: 1047, name: 'Golden Gate Ave' },
  king_4th: { x: 707, z: 1375, name: 'King & 4th' },
  emb_mission: { x: 843, z: -560, name: 'the Embarcadero at Mission' },
  emb_bryant: { x: 1257, z: 180, name: 'the Embarcadero at Bryant' },
  folsom_2nd: { x: 472, z: 353, name: 'Folsom & 2nd' },
  harrison_8th: { x: -568, z: 1661, name: 'Harrison & 8th' },
  channel_4th: { x: 919, z: 1598, name: 'Channel & 4th' },
  vn_broadway: { x: -1880, z: -779, name: 'Van Ness & Broadway' }
};
export function places() { return PLACES; }

// named camera points for cutscenes (framework/missions/time.js camPoint): the Bay Bridge's west span, found once from
// the city's own bridge group ('bridge:bay'); falls back to the bearing from the Rincon Hill touchdown
let span = null;
function bridge(G) {
  if (span) return span;
  const T = N().THREE;
  let g = null; G.app.scene.traverse((o) => { if (!g && o.name === 'bridge:bay') g = o; });
  const ux = 0.87, uz = -0.5;
  if (g) {
    const b = new T.Box3().setFromObject(g), c = b.getCenter(new T.Vector3());
    span = { x0: 900, z0: 200, cx: c.x, cz: c.z, top: b.max.y, ux, uz };
  } else span = { x0: 900, z0: 200, cx: 900 + ux * 1600, cz: 200 + uz * 1600, top: 160, ux, uz };
  return span;
}
export function camPoint(name, G) {
  const B = bridge(G), W = 2;
  const mid = (k) => [B.x0 + (B.cx - B.x0) * k, 70, B.z0 + (B.cz - B.z0) * k];
  switch (name) {
    case 'bridge-west-span': return [1420, W + 9, 120];
    case 'bridge-from-rincon': return [760, 95, 330];
    case 'bridge-deck-far': return [1500, W + 4, -320];
    case 'bridge-mid': return mid(0.45);
    case 'bridge-near': return mid(0.15);
    case 'bay-east': return [B.x0 + B.ux * 5000, 30, B.z0 + B.uz * 5000 + 800];
    default: return null;
  }
}

const api = { id, name, frame, load, dispose, groundHeight, inWater, isClear, spawnPoints, landmarks, streetAt, roads, placePlayer, route, places, camPoint, get app() { return app; } };
export default api;
