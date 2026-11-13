// Mog City's world contract, the part both cities share: an adapter over today's city globals (window.NYC: the city's
// classic scripts' tables and helpers; window.__NYC_APP: its runtime objects), read when asked, never at import (the
// city is still loading when the game's modules are evaluated). wagmi/world/ny.js and sf.js give it what differs: the
// frame, the place library, the road classes, the scene's group names. See wagmi/world/index.js for the API.
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const N = () => globalThis.window?.NYC || {};
const APP = () => globalThis.window?.__NYC_APP || null;

// ------------------------------------------------------------------ mission sites: the vocabulary (MISSION-SITES.md)
// the kinds of place a mission can ask for by what it is, not where it is (findMissionSites({ kind }))
export const SITE_KINDS = ['gas_station', 'store', 'park', 'plaza', 'bridge', 'parking', 'landmark', 'straight_road', 'junction', 'dead_end', 'waterfront'];
// a string's 32-bit FNV-1a hash, and a small seeded generator over it (mulberry32): the same seed, the same numbers,
// in every browser and in node
export function hash32(s) {
  let h = 0x811c9dc5;
  for (const ch of String(s)) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
export function seeded(seed) {
  let a = hash32(seed) || 1;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// list (each with a unique `key`) in the seed's order: sorted by key first, so the order the city's data came in never
// matters, then shuffled by the seed (Fisher-Yates)
export function seededOrder(list, seed) {
  const out = list.slice().sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)), rnd = seeded(seed);
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}
// a road's data name for a screen: the city's own display names when it has them (San Francisco's: O'Farrell St,
// McAllister St), else title case
const pretty = (s) => (s ? (typeof N().prettyName === 'function' ? N().prettyName(String(s)) : String(s).toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase())) : s);

export function createWorld(city) {
  const cm = () => APP()?.controllerManager;
  const net = () => APP()?.trafficSystem?.network;

  // ------------------------------------------------------------------ the ground
  // the height a walker (or mode's body: 'car', 'person') stands at; 0 before the city is up
  function groundY(x, z, mode = 'person') {
    const c = cm(); if (!c) return 0;
    const y = c.getGroundHeight(x, z, mode);
    return Number.isFinite(y) ? y : 0;
  }
  // the road's own level under (x, z): a hill's bare ground (cm.baseHeight, San Francisco), New York's streets at 0
  function roadY(x, z) {
    const c = cm();
    return (c && c.baseHeight?.(x, z)) || 0;
  }
  function isPark(x, z) {
    const n = N(), CP = n.CENTRAL_PARK_BOUNDS;
    if (CP && x > CP.minX && x < CP.maxX && z > CP.minZ && z < CP.maxZ) return true;
    const b = n.blockAt?.(x, z);
    return !!(b && b.park > 0.5 && !b.median);
  }
  // water a body can't cross on the ground (New York: Central Park's lakes; San Francisco has none inland)
  const inWater = (x, z) => !!cm()?.inParkWater?.(x, z);
  // { y, base, water, curb, park }: y the ground (mode's), base the road's level there, curb: up on a sidewalk or a
  // raised slab (over 8 cm above the road)
  function sampleSurface(x, z, mode = 'person') {
    const y = groundY(x, z, mode), base = roadY(x, z);
    return { y, base, water: inWater(x, z), curb: y - base > 0.08, park: isPark(x, z) };
  }

  // ------------------------------------------------------------------ what stands there
  // the colliders near a point: bounds { x, z, r } or { minX, maxX, minZ, maxZ }
  function queryColliders(b) {
    const c = cm(); if (!c || !b) return [];
    if (b.r != null) return c.nearColliders(b.x, b.z, b.r);
    const x = (b.minX + b.maxX) / 2, z = (b.minZ + b.maxZ) / 2;
    return c.nearColliders(x, z, Math.hypot(b.maxX - b.minX, b.maxZ - b.minZ) / 2);
  }

  // ------------------------------------------------------------------ the roads
  // the nearest lane to (x, z) within R m on the traffic's drivable graph: { x, z, heading, d, edge } (4 m in from
  // an edge's ends, edges under 8 m skipped)
  function nearestLane(x, z, mode = 'car', R = 80) {
    const n = net(); if (!n) return null;
    let best = null;
    for (const e of n.edges) {
      if (e.len < 8) continue;
      const mx = e.sx + e.dx * e.len / 2, mz = e.sz + e.dz * e.len / 2;
      if (Math.abs(mx - x) > R + e.len / 2 || Math.abs(mz - z) > R + e.len / 2) continue;
      const s = clamp((x - e.sx) * e.dx + (z - e.sz) * e.dz, 4, e.len - 4);
      for (let l = 0; l < e.lanes.length; l++) {
        const px = e.sx + e.dx * s + e.rx * e.lanes[l], pz = e.sz + e.dz * s + e.rz * e.lanes[l], d = Math.hypot(px - x, pz - z);
        if (!best || d < best.d) best = { x: px, z: pz, heading: Math.atan2(e.dx, e.dz), d, edge: e };
      }
    }
    return best;
  }
  // a through-road near (x, z): the nearest long main road of the drivable graph (the road graph's own class, at
  // least minLen m between junctions, not in a tunnel), at the road's level (not up on a deck): { x, z, heading, edge }
  // a quarter of the way along it on its first lane, facing along it; null when there is none within R m
  function throughRoad(near, { minLen = 60, R = 900 } = {}) {
    const n = net(); if (!n || !near) return null;
    let best = null, bd = Infinity;
    for (const e of n.edges) {
      if (!(e.len >= minLen) || !e.lanes?.length || e.bore || !city.isAvenue(e)) continue;
      const mx = e.sx + e.dx * e.len / 2, mz = e.sz + e.dz * e.len / 2, d = Math.hypot(mx - near.x, mz - near.z);
      if (d > R || d >= bd) continue;
      if (Math.abs(groundY(mx, mz, 'car') - roadY(mx, mz)) > 0.3) continue;
      best = e; bd = d;
    }
    if (!best) return null;
    const s = clamp(best.len * 0.25, 12, best.len - 12), l = best.lanes[0];
    return { x: best.sx + best.dx * s + best.rx * l, z: best.sz + best.dz * s + best.rz * l, heading: Math.atan2(best.dx, best.dz), edge: best };
  }
  // a route from a { x, z, h } to b { x, z }: [[x, z], ...]. mode 'car' the GPS's legal one (mission/gps.js plan),
  // 'foot' its walking one, 'chase' a chase car's (pursuit/nav.js: one-way streets either way)
  let chaseNav = null;
  async function navFor() {
    if (!chaseNav) { const { createNav } = await import('../pursuit/nav.js'); chaseNav = createNav(APP()); }
    return chaseNav;
  }
  async function route(a, b, mode = 'car') {
    const W = globalThis.window?.WAGMI;
    if (mode === 'chase') return (await navFor()).route(a, b);
    if (mode === 'foot') return W?.gps?.planWalk?.(a, b) || null;
    return W?.gps?.plan?.(a, b, a.h ?? null) || null;
  }
  // the street at (x, z): of the city's roads within r m (30), the nearest; with dir { ux, uz } (the way a route runs
  // there), the nearest whose centreline runs that way there (within 45 degrees, either direction), any city's grid or
  // none; (horizontal: the old grid test, the nearest whose nearest stretch is more east-west, or not)
  function roadDir(road, x, z) {
    const P = road.pts || []; let best = null, bd = Infinity;
    for (let i = 0; i + 1 < P.length; i++) {
      const a = P[i], b = P[i + 1], dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz || 1e-9;
      const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / L2, 0, 1), d = Math.hypot(a.x + dx * t - x, a.z + dz * t - z);
      if (d < bd) { bd = d; const L = Math.sqrt(L2); best = { ux: dx / L, uz: dz / L }; }
    }
    return best;
  }
  function streetNameAt(x, z, { dir = null, horizontal = null, r = 30 } = {}) {
    const n = N(); if (!n.nearestRoads) return null;
    const near = n.nearestRoads(x, z, r);
    let pick = near[0];
    if (dir) pick = near.find((q) => { const u = roadDir(q.road, x, z); return u && Math.abs(u.ux * dir.ux + u.uz * dir.uz) >= Math.SQRT1_2; }) || near[0];
    else if (horizontal != null) pick = near.find((q) => q.horizontal === horizontal) || near[0];
    return pick?.road.name || null;
  }
  const districtAt = (x, z) => N().districtAt?.(x, z) ?? null;
  // a busy shopping and office district (more people on its sidewalks)
  const commercial = (district) => city.commercial.has(district);

  // ------------------------------------------------------------------ the signals
  // crossing { dx, dz }: the way a walker crosses. True while he has the WALK at time t
  const walkSignal = (crossing, t) => N().walkSignal(t, city.runsWithAvenue(crossing));
  // 'green' | 'amber' | 'red' for traffic on a road (an edge of the graph, or { dx, dz } along it) at time t
  const signalAt = (road, t) => N().signalPhase(t, road && road.axis ? city.isAvenue(road) : city.runsWithAvenue(road));

  // ------------------------------------------------------------------ the places
  let lib = null, missing = [];
  function places() {
    if (lib) return lib;
    const n = net(); if (!n) return {};
    lib = {}; missing = [];
    city.buildPlaces({ N: N(), app: APP(), net: n, lib, missing, nearestLane: (x, z, R) => nearestLane(x, z, 'car', R) });
    return lib;
  }
  // the city's arrivals, { key, x, z, heading, mode? }: kind 'all' every one, 'ground' not the helicopter's
  function spawnPoints(kind = 'all') {
    const out = [];
    for (const [key, p] of Object.entries(N().TELEPORT_LOCATIONS || {})) if (kind !== 'ground' || p.mode !== 'helicopter') out.push({ key, ...p });
    return out;
  }
  // ------------------------------------------------------------------ mission sites (MISSION-SITES.md)
  // findMissionSites(req): without a `kind`, the place library's keys as before (v0: { near, min, max, count, foot } ->
  // [{ key, x, z, heading, name, d }] nearest first). With one, real places of that kind on this map, found from the
  // city's own data (its roads, blocks, landmarks, piers, colliders), each { key, kind, name, x, z, heading (where a car
  // stops: on its lane, facing along it), cx, cz (the place itself, on foot), road, d, ... } in the seed's order (req.seed)
  // or nearest first. The same city and the same request give the same answer, every time.
  function placeSites(req) {
    const L = places(), at = req.near, out = [];
    for (const [key, p] of Object.entries(L)) {
      if (!p || (p.foot && !req.foot)) continue;
      const d = at ? Math.hypot(p.x - at.x, p.z - at.z) : 0;
      if (req.min != null && d < req.min) continue;
      if (req.max != null && d > req.max) continue;
      out.push({ key, ...p, d });
    }
    out.sort((a, b) => a.d - b.d);
    return req.count ? out.slice(0, req.count) : out;
  }
  // the lanes by 100 m cell, built once a road graph: the nearest lane to a point among the edges a test keeps
  const CELL = 100;
  let laneCells = null, laneNet = null;
  function laneIndex() {
    const n = net(); if (!n) return null;
    if (laneNet === n && laneCells) return laneCells;
    laneNet = n; laneCells = new Map();
    for (const e of n.edges) {
      if (!(e.len >= 8) || !e.lanes?.length) continue;
      const ex = e.sx + e.dx * e.len, ez = e.sz + e.dz * e.len;
      for (let ix = Math.floor(Math.min(e.sx, ex) / CELL); ix <= Math.floor(Math.max(e.sx, ex) / CELL); ix++)
        for (let iz = Math.floor(Math.min(e.sz, ez) / CELL); iz <= Math.floor(Math.max(e.sz, ez) / CELL); iz++) {
          const k = ix * 65536 + iz; let list = laneCells.get(k); if (!list) laneCells.set(k, (list = [])); list.push(e);
        }
    }
    return laneCells;
  }
  const level = (e) => { const mx = e.sx + e.dx * e.len / 2, mz = e.sz + e.dz * e.len / 2; return Math.abs(groundY(mx, mz, 'car') - roadY(mx, mz)) <= 0.3; };
  const roadKeep = (e) => !e.bore && level(e);
  function laneAt(x, z, R = 80, keep = roadKeep) {
    const cells = laneIndex(); if (!cells) return null;
    let best = null; const seen = new Set();
    for (let ix = Math.floor((x - R) / CELL); ix <= Math.floor((x + R) / CELL); ix++)
      for (let iz = Math.floor((z - R) / CELL); iz <= Math.floor((z + R) / CELL); iz++) for (const e of cells.get(ix * 65536 + iz) || []) {
        if (seen.has(e)) continue; seen.add(e);
        if (keep && !keep(e)) continue;
        const s = clamp((x - e.sx) * e.dx + (z - e.sz) * e.dz, 4, e.len - 4);
        for (let l = 0; l < e.lanes.length; l++) {
          const px = e.sx + e.dx * s + e.rx * e.lanes[l], pz = e.sz + e.dz * s + e.rz * e.lanes[l], d = Math.hypot(px - x, pz - z);
          if (d <= R && (!best || d < best.d || (d === best.d && e.id < best.edge.id))) best = { x: px, z: pz, heading: Math.atan2(e.dx, e.dz), d, edge: e };
        }
      }
    return best;
  }
  // a point s m along an edge on its lane l (the last: the kerb side), facing along it
  const lanePt = (e, s, l = 0) => { const o = e.lanes[clamp(l, 0, e.lanes.length - 1)]; s = clamp(s, 2, e.len - 2); return { x: e.sx + e.dx * s + e.rx * o, z: e.sz + e.dz * s + e.rz * o, heading: Math.atan2(e.dx, e.dz), d: 0, edge: e }; };
  // what stands at ground level near a point (a copy: the controllers' list is reused), how far a box is from a point
  function solids(x, z, r) {
    const y = groundY(x, z, 'person');
    return queryColliders({ x, z, r }).filter((c) => !(c.minY >= y + 2) && !(c.maxY <= y + 0.3));
  }
  // (by its real outline when it has one: San Francisco's buildings' polygons, a turned box's obb; their bounds, an
  // upright box round a turned building, take in the sidewalk and often the street in front of it. lim: beyond that
  // the bounds' own distance, a lower bound, is enough)
  function boxD(c, x, z, lim = Infinity) {
    const a = Math.hypot(Math.max(c.minX - x, 0, x - c.maxX), Math.max(c.minZ - z, 0, z - c.maxZ));
    if (a >= lim) return a;
    const P = c.polygon;
    if (Array.isArray(P) && P.length >= 3) {
      let inside = false, d = Infinity;
      for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
        const p = P[i], q = P[j];
        if ((p.z > z) !== (q.z > z) && x < ((q.x - p.x) * (z - p.z)) / (q.z - p.z) + p.x) inside = !inside;
        const dx = q.x - p.x, dz = q.z - p.z, t = clamp(((x - p.x) * dx + (z - p.z) * dz) / (dx * dx + dz * dz || 1e-9), 0, 1);
        d = Math.min(d, Math.hypot(p.x + dx * t - x, p.z + dz * t - z));
      }
      return inside ? 0 : d;
    }
    const o = c.obb;
    if (o && Number.isFinite(o.cx)) {
      const dx = x - o.cx, dz = z - o.cz, lx = dx * o.cs - dz * o.sn, lz = dx * o.sn + dz * o.cs;
      return Math.hypot(Math.max(Math.abs(lx) - o.hx, 0), Math.max(Math.abs(lz) - o.hz, 0));
    }
    return a;
  }
  const inSolid = (x, z) => solids(x, z, 3).some((c) => boxD(c, x, z, 0.3) < 0.3);
  // nothing solid within r m of (x, z), and dry
  const openAt = (x, z, r) => !inWater(x, z) && !solids(x, z, r + 2).some((c) => boxD(c, x, z, r) < r);
  // a clear line at a person's height from (ax, az) to (bx, bz): no collider on it (1 m steps)
  function sightline(ax, az, bx, bz) {
    const L = Math.hypot(bx - ax, bz - az); if (L < 1) return true;
    const list = solids((ax + bx) / 2, (az + bz) / 2, L / 2 + 2), n = Math.ceil(L);
    for (let k = 1; k < n; k++) { const x = ax + (bx - ax) * k / n, z = az + (bz - az) * k / n; if (list.some((c) => boxD(c, x, z, 0.2) < 0.2)) return false; }
    return true;
  }
  // off the roadway, where a man on foot stands: up on a sidewalk or a raised slab, on a park's ground, or what the
  // city's own data calls a sidewalk or a paved square without a raised curb (city.sidewalkAt: San Francisco's ground
  // mask)
  const footGround = (x, z) => { const s = sampleSurface(x, z); return s.curb || s.park || !!city.sidewalkAt?.(x, z); };
  // a place's front, where a man on foot meets it: from a lane toward (tx, tz) (1 m steps, up to `reach` m), the first
  // point off the roadway that nothing stands on; else, where there is no sidewalk in the data, the open ground just
  // short of the first building on the way, 3 m or more off the lane ({ face: true }); null when there is neither
  function frontPoint(lx, lz, tx, tz, reach = 30) {
    const L = Math.hypot(tx - lx, tz - lz) || 1, ux = (tx - lx) / L, uz = (tz - lz) / L;
    let open = null;
    for (let k = 2; k <= Math.min(reach, L + 2); k++) {
      const x = lx + ux * k, z = lz + uz * k;
      if (inWater(x, z)) return null;
      const solid = inSolid(x, z);
      if (!solid && footGround(x, z)) return { x, z };
      if (solid) return open && k - 1 >= 3 ? { ...open, face: true } : null;
      open = { x, z };
    }
    return null;
  }
  const streetOf = (x, z, e) => { const nm = streetNameAt(x, z, e ? { dir: { ux: e.dx, uz: e.dz } } : {}); return (nm && !(/tunnel/i.test(nm) && e && !e.bore && e.name) ? nm : pretty(e?.name) || nm) || null; };
  const neighbours = (nd) => new Set([...(nd.in || []).map((e) => e.from), ...(nd.out || []).map((e) => e.to)]);
  // a site on a lane: where a car stops (x, z, heading) and the place itself (cx, cz)
  const site = (c, lane, cx, cz, more) => (lane ? { key: c.key, kind: c.kind, name: c.name, x: lane.x, z: lane.z, heading: lane.heading, cx, cz, road: lane.edge ? (city.isAvenue(lane.edge) ? 'avenue' : 'street') : null, reach: Math.hypot(cx - lane.x, cz - lane.z), ...(c.fallback ? { fallback: c.fallback } : {}), ...more } : null);
  // a building's or a landmark's front: its nearest lane within R m, then the sidewalk in front of it (front: 'sidewalk',
  // or 'face': open ground before its wall where the data has no sidewalk). None: the place is where the city's data
  // puts it, its reach the whole way there from the lane, and every test (a car's reach, open, roadView, on foot) is
  // of that point (front: false), never of the lane
  const frontSite = (c, R = 200) => {
    const lane = laneAt(c.fx, c.fz, R); if (!lane) return null;
    const f = frontPoint(lane.x, lane.z, c.fx, c.fz);
    return f ? site(c, lane, f.x, f.z, { front: f.face ? 'face' : 'sidewalk' }) : site(c, lane, c.fx, c.fz, { front: false });
  };
  // the kerb side of an edge's last lane, s m along it (the sidewalk there, else 2 m off the lane)
  const kerbSite = (c, e, s, more) => { const lane = lanePt(e, s, e.lanes.length - 1), f = frontPoint(lane.x, lane.z, lane.x + e.rx * 14, lane.z + e.rz * 14, 14); return site(c, lane, f ? f.x : lane.x + e.rx * 2, f ? f.z : lane.z + e.rz * 2, { front: f ? (f.face ? 'face' : 'sidewalk') : false, ...more }); };
  // a park's block: its nearest lane, then into the park from there (a few metres in)
  const parkSite = (c, b) => {
    const lane = laneAt(b.cx, b.cz, 600); if (!lane) return null;
    const L = Math.hypot(b.cx - lane.x, b.cz - lane.z) || 1, ux = (b.cx - lane.x) / L, uz = (b.cz - lane.z) / L;
    let at = null;
    for (let k = 2; k <= Math.min(L, 200); k += 2) { const x = lane.x + ux * k, z = lane.z + uz * k; if (isPark(x, z) && !inWater(x, z)) { at = { x: lane.x + ux * Math.min(L, k + 5), z: lane.z + uz * Math.min(L, k + 5) }; break; } }
    return site(c, lane, (at || { x: b.cx }).x, at ? at.z : b.cz, { area: Math.round(b.area || 0) });
  };
  const named = (k) => !/^\d+$/.test(k);
  // how far the place itself may be from where the car stops, by kind (req.reach): a pier's end, a park's lawn
  const REACH = { waterfront: 250, park: 150, plaza: 150, landmark: 150 };
  const STORE = new Set(['retail', 'commercial', 'supermarket', 'convenience', 'mall', 'department_store', 'shop', 'kiosk']);
  // each kind's candidates, once a road graph: { real, fallback } of { key, kind, name, fx, fz (about where it is), make }
  let kindNet = null; const kinds = new Map();
  function candidates(kind) {
    const n = net(); if (!n) return null;
    if (kindNet !== n) { kindNet = n; kinds.clear(); }
    if (kinds.has(kind)) return kinds.get(kind);
    const real = [], fallback = [], NN = N(), LM = NN.LANDMARK_SITES || {};
    const add = (list, c) => { c.kind = kind; list.push(c); };
    // (a compiled town's own points of interest, when its adapter has them: city.pois(kind) -> [{ id, name, x, z }])
    for (const p of city.pois?.(kind) || []) add(real, { key: `poi:${p.id ?? p.name}`, name: p.name || pretty(kind.replace('_', ' ')), fx: p.x, fz: p.z, make: (c) => frontSite(c) });
    const parkBlocks = () => (NN.BLOCKS || []).filter((b) => b.park > 0.5 && !b.median && (b.area || 0) >= 400 && Number.isFinite(b.cx));
    const edges = n.edges.filter((e) => e.len >= 8 && e.lanes?.length && !e.bore);
    const nodes = n.nodes || [];
    if (kind === 'landmark') for (const l of NN.NYC_LANDMARKS || []) add(real, { key: `landmark:${l.id || l.name}`, name: l.name, fx: l.x, fz: l.z, make: (c) => frontSite(c) });
    if (kind === 'store') {
      for (const [k, v] of Object.entries(LM)) if (named(k) && STORE.has(v.kind)) add(real, { key: `store:${k}`, name: k, fx: v.x, fz: v.z, make: (c) => frontSite(c) });
      // (none of the city's own: a shopfront on a street of a busy district, else on any street)
      const mid = (e) => [e.sx + e.dx * e.len / 2, e.sz + e.dz * e.len / 2];
      let shop = edges.filter((e) => e.len >= 40 && !city.isAvenue(e) && commercial(districtAt(...mid(e))));
      if (!shop.length) shop = edges.filter((e) => e.len >= 40 && !city.isAvenue(e));
      for (const e of shop) { const [mx, mz] = mid(e); add(fallback, { key: `shopfront:${e.id}`, fx: mx, fz: mz, fallback: 'shopfront', make: (c) => { const s = kerbSite(c, e, e.len / 2); if (s) s.name = `the shop on ${streetOf(mx, mz, e) || 'the street'}`; return s; } }); }
    }
    if (kind === 'parking') {
      for (const [k, v] of Object.entries(LM)) if (v.kind === 'parking' || (named(k) && /garage|parking/i.test(k))) add(real, { key: `parking:${k}`, name: named(k) ? k : 'the parking garage', fx: v.x, fz: v.z, make: (c) => frontSite(c) });
      for (const e of edges) if (e.len >= 50 && !city.isAvenue(e)) { const mx = e.sx + e.dx * e.len / 2, mz = e.sz + e.dz * e.len / 2; add(fallback, { key: `kerb:${e.id}`, fx: mx, fz: mz, fallback: 'kerb', make: (c) => { if (!level(e)) return null; const lane = lanePt(e, e.len / 2, e.lanes.length - 1); return site({ ...c, name: `parking on ${streetOf(mx, mz, e) || 'the street'}` }, lane, lane.x + e.rx * 1.6, lane.z + e.rz * 1.6); } }); }
    }
    if (kind === 'gas_station') {
      for (const [k, v] of Object.entries(LM)) if (v.kind === 'fuel') add(real, { key: `fuel:${k}`, name: named(k) ? k : 'the gas station', fx: v.x, fz: v.z, make: (c) => frontSite(c) });
      // (none of the city's own: the corner lot of a main road's junction, on the kerb side before it)
      for (const nd of nodes) {
        if (neighbours(nd).size < 3) continue;
        const ins = (nd.in || []).filter((e) => e.len >= 30 && !e.bore && e.lanes?.length).sort((a, b) => (city.isAvenue(b) - city.isAvenue(a)) || b.len - a.len || a.id - b.id);
        if (!ins.length || !(nd.in || []).concat(nd.out || []).some((e) => city.isAvenue(e))) continue;
        add(fallback, { key: `corner:${nd.id}`, fx: nd.x, fz: nd.z, fallback: 'corner', make: (c) => { const e = ins[0]; if (!level(e)) return null; const s = kerbSite(c, e, e.len - 18); if (s) s.name = `the gas station at ${cornerName(nd) || streetOf(nd.x, nd.z, e) || 'the corner'}`; return s; } });
      }
    }
    if (kind === 'park') for (const b of parkBlocks()) add(real, { key: `park:${b.id}`, name: b.parkName || 'the park', fx: b.cx, fz: b.cz, make: (c) => parkSite(c, b) });
    if (kind === 'plaza') {
      for (const b of parkBlocks()) if (/plaza|square|piazza|green|commons|mall/i.test(b.parkName || '')) add(real, { key: `plaza:${b.id}`, name: b.parkName, fx: b.cx, fz: b.cz, make: (c) => parkSite(c, b) });
      for (const p of NN.GEO?.plazas || []) if (Array.isArray(p.a) && Array.isArray(p.b)) { const fx = (p.a[0] + p.b[0]) / 2, fz = (p.a[1] + p.b[1]) / 2; add(real, { key: `plaza:${p.name}`, name: p.name, fx, fz, make: (c) => { const lane = laneAt(fx, fz, 200); return site(c, lane, fx, fz); } }); }
    }
    // (a bridge or an overpass: where a raised deck of the city's highways, 5 m or more over the ground, crosses a
    // street a car can drive: the street under it, every 80 m of deck)
    if (kind === 'bridge') for (const [li, H] of ((APP()?.highwayTraffic?.lanes) || NN.highwayLanes || []).entries()) {
      let last = -1e9, run = 0;
      for (let i = 0; i + 1 < (H.pts || []).length; i++) {
        const p = H.pts[i], q = H.pts[i + 1]; run += Math.hypot(q.x - p.x, q.z - p.z);
        if (run - last < 80) continue;
        const deck = (p.y || 0) - roadY(p.x, p.z);
        if (!(deck >= 5)) continue;
        last = run;
        add(real, { key: `bridge:${li}:${i}`, fx: p.x, fz: p.z, make: (c) => {
          const lane = laneAt(p.x, p.z, 40); if (!lane) return null;
          const st = streetOf(lane.x, lane.z, lane.edge) || 'the street';
          return site({ ...c, name: deck >= 30 ? `under the bridge on ${st}` : `under the overpass on ${st}` }, lane, lane.x, lane.z, { deck: Math.round(deck) });
        } });
      }
    }
    if (kind === 'straight_road') {
      const dot = (a, b) => a.dx * b.dx + a.dz * b.dz;
      const next = (cur) => (cur.to.out || []).filter((q) => q.to !== cur.from && !q.bore && q.lanes?.length && dot(q, cur) > 0.995).sort((a, b) => a.id - b.id)[0];
      for (const e of edges) {
        if ((e.from.in || []).some((p) => p.from !== e.to && !p.bore && dot(p, e) > 0.995)) continue;
        const chain = [e], seen = new Set([e]); let L = e.len, cur = e;
        for (let q = next(cur); q && !seen.has(q) && chain.length < 60 && L < 3000; q = next(cur)) { seen.add(q); chain.push(q); L += q.len; cur = q; }
        const last = chain[chain.length - 1];
        add(real, { key: `straight:${e.id}`, fx: e.sx + e.dx * Math.min(L, e.len) / 2, fz: e.sz + e.dz * Math.min(L, e.len) / 2, length: L, make: (c) => {
          if (!level(e)) return null;
          const a = lanePt(e, Math.min(10, e.len / 4), 0), b = lanePt(last, last.len - 4, 0);
          return site({ ...c, name: streetOf(a.x, a.z, e) || 'the straight' }, a, a.x, a.z, { length: Math.round(L), ex: b.x, ez: b.z, edges: chain.length });
        } });
      }
    }
    if (kind === 'junction' || kind === 'dead_end') {
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (const nd of nodes) { minX = Math.min(minX, nd.x); maxX = Math.max(maxX, nd.x); minZ = Math.min(minZ, nd.z); maxZ = Math.max(maxZ, nd.z); }
      for (const nd of nodes) {
        const k = neighbours(nd).size;
        if (kind === 'junction' ? k < 3 : k !== 1) continue;
        // (a dead end at the map's edge is where the city's data stops, not a street's end)
        if (kind === 'dead_end' && (nd.x < minX + 150 || nd.x > maxX - 150 || nd.z < minZ + 150 || nd.z > maxZ - 150)) continue;
        const ins = (nd.in || []).filter((e) => e.len >= 15 && !e.bore && e.lanes?.length && (kind === 'junction' || !city.isAvenue(e))).sort((a, b) => b.len - a.len || a.id - b.id);
        if (!ins.length) continue;
        add(real, { key: `${kind === 'junction' ? 'junction' : 'deadend'}:${nd.id}`, fx: nd.x, fz: nd.z, signal: !!nd.signal, make: (c) => {
          const e = ins[0]; if (!level(e)) return null;
          const lane = lanePt(e, e.len - (kind === 'junction' ? 15 : 8), 0);
          const name = kind === 'junction' ? cornerName(nd) || `the junction on ${streetOf(lane.x, lane.z, e) || 'the road'}` : `the end of ${streetOf(lane.x, lane.z, e) || 'the street'}`;
          return site({ ...c, name }, lane, nd.x, nd.z, { signal: !!nd.signal, arms: neighbours(nd).size });
        } });
      }
    }
    if (kind === 'waterfront') for (const [i, p] of (NN.WATERFRONT_PIERS || []).entries()) {
      if (!Number.isFinite(p.cx)) continue;
      add(real, { key: `pier:${i}`, name: p.name || 'the waterfront', fx: p.cx, fz: p.cz, make: (c) => {
        const lane = laneAt(p.cx, p.cz, 400); if (!lane) return null;
        // (out on the pier from its landward end: the ring's corner nearest the lane, a fifth of the way to its middle)
        const ring = (p.ring || []).filter((q) => Array.isArray(q) || (q && Number.isFinite(q.x))).map((q) => (Array.isArray(q) ? { x: q[0], z: q[1] } : q));
        let root = { x: p.cx, z: p.cz }, bd = Infinity;
        for (const q of ring) { const d = Math.hypot(q.x - lane.x, q.z - lane.z); if (d < bd) { bd = d; root = q; } }
        return site(c, lane, root.x + (p.cx - root.x) * 0.2, root.z + (p.cz - root.z) * 0.2, { pier: p.name || null, reach: Math.hypot(root.x - lane.x, root.z - lane.z) });
      } });
    }
    const out = { real, fallback };
    kinds.set(kind, out);
    return out;
  }
  // a junction's name, two of its roads that cross ('Market St & 3rd St')
  function cornerName(nd) {
    const arms = [...(nd.out || []), ...(nd.in || [])].filter((e) => e.lanes?.length).sort((a, b) => a.id - b.id), names = [];
    for (const e of arms) {
      const out = e.from === nd, ux = out ? e.dx : -e.dx, uz = out ? e.dz : -e.dz, x = nd.x + ux * 14, z = nd.z + uz * 14;
      const nm = streetNameAt(x, z, { dir: { ux, uz } }) || pretty(e.name);
      if (nm && !names.some((m) => m.nm === nm) && !names.some((m) => Math.abs(m.ux * ux + m.uz * uz) > 0.7)) names.push({ nm, ux, uz });
      if (names.length === 2) break;
    }
    return names.length === 2 ? `${names[0].nm} & ${names[1].nm}` : null;
  }
  const built = (c) => { if (c.built === undefined) { try { c.built = c.make(c) || null; } catch { c.built = null; } } return c.built; };
  function findMissionSites(req = {}) {
    if (!req || !req.kind) return placeSites(req || {});
    if (!SITE_KINDS.includes(req.kind)) return [];
    const C = candidates(req.kind); if (!C) return [];
    const at = Array.isArray(req.near) ? { x: req.near[0], z: req.near[1] } : req.near && Number.isFinite(req.near.x) ? req.near : null;
    const avoid = (req.avoid || []).map((a) => (Array.isArray(a) ? { x: a[0], z: a[1], r: 40 } : a)).filter((a) => a && Number.isFinite(a.x));
    const access = req.access || 'car', minLen = req.kind === 'straight_road' ? (req.minLen ?? 150) : req.minLen;
    const want = req.count || Infinity;
    function pass(list) {
      // (the cheap tests first, on every candidate)
      const ok = [];
      for (const c of list) {
        if (at && (req.max != null && Math.hypot(c.fx - at.x, c.fz - at.z) > req.max + 250)) continue;
        if (minLen != null && c.length != null && c.length < minLen) continue;
        if (req.signal != null && c.signal != null && c.signal !== !!req.signal) continue;
        const s = built(c); if (!s) continue;
        const d = at ? Math.hypot(s.cx - at.x, s.cz - at.z) : 0;
        if (req.min != null && d < req.min) continue;
        if (req.max != null && d > req.max) continue;
        if (minLen != null && !(s.length >= minLen)) continue;
        if (req.maxLen != null && s.length != null && s.length > req.maxLen) continue;
        if (req.road && req.road !== 'any' && s.road !== req.road) continue;
        if (avoid.some((a) => Math.hypot(s.cx - a.x, s.cz - a.z) < (a.r ?? 40) || Math.hypot(s.x - a.x, s.z - a.z) < (a.r ?? 40))) continue;
        if (access === 'car' && s.reach > (req.reach ?? REACH[req.kind] ?? 80)) continue;
        ok.push({ ...s, d: Math.round(d * 10) / 10 });
      }
      const ordered = req.seed != null ? seededOrder(ok, req.seed) : ok.sort((a, b) => a.d - b.d || (a.key < b.key ? -1 : 1));
      // (then the costly ones, in that order, until there are enough)
      const out = [];
      for (const s of ordered) {
        if (out.length >= want) break;
        if (access === 'foot' && (inWater(s.cx, s.cz) || inSolid(s.cx, s.cz))) continue;
        if (req.open && !openAt(s.cx, s.cz, req.open)) continue;
        if (req.roadView && !sightline(s.cx, s.cz, s.x, s.z)) continue;
        out.push(s);
      }
      return out;
    }
    let out = pass(C.real);
    if (!out.length && C.fallback.length && req.fallback !== false) out = pass(C.fallback);
    return out;
  }

  const W = {
    id: city.id, name: city.name, frame: city.frame,
    sampleSurface, groundY, roadY, queryColliders,
    nearestLane, throughRoad, route, streetNameAt, districtAt, commercial, isPark, inWater,
    walkSignal, signalAt,
    // a road's class: 'avenue' (a city's main roads: New York's avenues) or 'street'
    roadClass: (e) => (city.isAvenue(e) ? 'avenue' : 'street'),
    isAvenue: (e) => city.isAvenue(e),
    // the curb islands (city-config.js BLOCKS): the one under (x, z), those in a rectangle, all of them
    blockAt: (x, z) => N().blockAt?.(x, z) ?? null,
    blocksInRect: (minX, maxX, minZ, maxZ) => N().blocksInRect?.(minX, maxX, minZ, maxZ) ?? [],
    get blocks() { return N().BLOCKS || []; },
    get places() { return places(); },
    get placesMissing() { places(); return missing; },
    spawnPoints, findMissionSites, siteKinds: SITE_KINDS,
    get landmarks() { return N().LANDMARK_SITES || {}; },
    sceneGroups: city.sceneGroups,
    // New York's street grid (null elsewhere): its avenues and numbered streets
    grid: city.grid || null,
    // (v0: the whole city is in memory once the page has loaded it)
    ensureLoaded: () => Promise.resolve(),
  };
  return W;
}
