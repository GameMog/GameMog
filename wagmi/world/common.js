// Mog City's world contract, the part both cities share: an adapter over today's city globals (window.NYC: the city's
// classic scripts' tables and helpers; window.__NYC_APP: its runtime objects), read when asked, never at import (the
// city is still loading when the game's modules are evaluated). wagmi/world/ny.js and sf.js give it what differs: the
// frame, the place library, the road classes, the scene's group names. See wagmi/world/index.js for the API.
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const N = () => globalThis.window?.NYC || {};
const APP = () => globalThis.window?.__NYC_APP || null;

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
  // least minLen m between junctions, not in a tunnel), at the road's level (not up on a deck), whose lane is a real
  // street's (realLane) and, with runway, runs on straight for that many metres (straightRun): { x, z, heading, edge }
  // a quarter of the way along it, on the centre of its first lane (as nearestLane gives it), facing along it. Of
  // those found, the nearest with the runway, else the nearest real lane, else the nearest; null when none is within R m
  function throughRoad(near, { minLen = 60, R = 900, runway = 0 } = {}) {
    const n = net(); if (!n || !near) return null;
    const cands = [];
    for (const e of n.edges) {
      if (!(e.len >= minLen) || !e.lanes?.length || e.bore || !city.isAvenue(e)) continue;
      const mx = e.sx + e.dx * e.len / 2, mz = e.sz + e.dz * e.len / 2, d = Math.hypot(mx - near.x, mz - near.z);
      if (d > R) continue;
      if (Math.abs(groundY(mx, mz, 'car') - roadY(mx, mz)) > 0.3) continue;
      cands.push([d, e]);
    }
    cands.sort((a, b) => a[0] - b[0]);
    const pick = (e) => {
      const s = clamp(e.len * 0.25, 12, e.len - 12), l = e.lanes[0];
      const px = e.sx + e.dx * s + e.rx * l, pz = e.sz + e.dz * s + e.rz * l;
      // (the lane's own centre, as nearestLane has it: on this edge, or this point)
      const L = nearestLane(px, pz, 'car', 6), at = L && L.edge === e ? L : { x: px, z: pz };
      return { x: at.x, z: at.z, heading: Math.atan2(e.dx, e.dz), edge: e, s, l };
    };
    let real = null;
    for (const [, e] of cands.slice(0, 60)) {
      const p = pick(e);
      if (!realLane(e, p.s, p.l)) continue;
      if (!runway || straightRun(p, runway)) return out(p);
      real = real || p;
    }
    return out(real || (cands.length ? pick(cands[0][1]) : null));
  }
  const out = (p) => (p ? { x: p.x, z: p.z, heading: p.heading, edge: p.edge } : null);
  // the road runs on straight ahead of p { x, z, heading } for len m: every 10 m a lane of the graph under the line
  // (within 3 m of it, facing within 15 degrees of the way), across a junction (up to 40 m with no lane) on the road
  // and not up a curb
  function straightRun(p, len) {
    const ux = Math.sin(p.heading), uz = Math.cos(p.heading);
    let gap = 0;
    for (let d = 10; d <= len; d += 10) {
      const x = p.x + ux * d, z = p.z + uz * d, L = nearestLane(x, z, 'car', 3);
      if (L && L.d <= 3 && Math.abs(Math.atan2(Math.sin(L.heading - p.heading), Math.cos(L.heading - p.heading))) < 0.26) { gap = 0; continue; }
      if ((gap += 10) > 40 || sampleSurface(x, z, 'person').curb || N().blockAt?.(x, z)) return false;
    }
    return true;
  }
  // a lane between curbs, not one drawn across an open paved expanse (San Francisco's waterfront by the Ferry Building,
  // a one-lane edge along a curb with open ground for 40 m on its other side): from the lane (offset l at s m along
  // edge e) out on its own side, a curb (a sidewalk up over the road, or a curb island) within the edge's half-width
  // and 4 m more
  function realLane(e, s, l) {
    const side = l < 0 ? -1 : 1, reach = (e.half || 6) + 4;
    const bx = e.sx + e.dx * s, bz = e.sz + e.dz * s;
    for (let o = Math.abs(l) + 1; o <= reach; o += 0.5) {
      const x = bx + e.rx * o * side, z = bz + e.rz * o * side;
      if (N().blockAt?.(x, z) || sampleSurface(x, z, 'person').curb) return true;
    }
    return false;
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
  // v0: mission sites from the place library. req { near: { x, z }, min, max (m), count, foot (true: a foot place
  // too) } -> [{ key, x, z, heading, name, d }] nearest first
  function findMissionSites(req = {}) {
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

  // ------------------------------------------------------------------ the engine's parts
  // what the game builds with from the city's own engine (each read when asked; undefined where a city has none):
  //   assets  TSL, Addons (mergeGeometries...), Terrain, the lofted cars (BODY_SPECS, buildCarGeometry,
  //           createLoftedCarMaterial, buildLightbarGeometry, createLightbarMaterial, carStyleCode), the people
  //           (PersonCrowd, PersonRig)
  //   look    cityUniforms, GRADE_LOOKS, CRATER_GLOW, the power uniforms (peopleWorn, signalPower, carLampPower), quality
  //   street  breakables (the street furniture a car knocks over), streetFootprints (the buildings' footprints by the
  //           sidewalks), parkLawn (a park lawn's box for a set's dressing: New York's Bryant Park; null elsewhere)
  const pass = (names) => Object.defineProperties({}, Object.fromEntries(names.map((k) => [k, { enumerable: true, get: () => N()[k] }])));
  const assets = pass(['TSL', 'Addons', 'Terrain', 'BODY_SPECS', 'buildCarGeometry', 'createLoftedCarMaterial', 'buildLightbarGeometry',
    'createLightbarMaterial', 'carStyleCode', 'PersonCrowd', 'PersonRig']);
  const look = pass(['cityUniforms', 'GRADE_LOOKS', 'CRATER_GLOW', 'peopleWorn', 'signalPower', 'carLampPower', 'quality']);
  const street = Object.defineProperties(pass(['breakables', 'streetFootprints']), {
    parkLawn: { enumerable: true, get: () => (city.parkLawn ? city.parkLawn(N()) : null) || null },
  });

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
    spawnPoints, findMissionSites,
    get landmarks() { return N().LANDMARK_SITES || {}; },
    sceneGroups: city.sceneGroups,
    // New York's street grid (null elsewhere): its avenues and numbered streets
    grid: city.grid || null,
    // (v0: the whole city is in memory once the page has loaded it)
    ensureLoaded: () => Promise.resolve(),
    // the city's running app (controllerManager, trafficSystem, lightingSystem, postFX, scene...): null till it is up
    get app() { return APP(); },
    // its three.js scene (null till the app is up)
    get scene() { return APP()?.scene || null; },
    assets, look, street,
  };
  return W;
}
