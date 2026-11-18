// Mog City story runner: can a player really get there. The owner, 14 Nov, on a search ring held inside a tower: "putting
// rings inside buildings does not work especially since you can NOT enter buildings on the platform". So every place a
// mission sends him (a walk's or a search's spot, a drive's or a stop's end, where a person is stood up, a fight, a
// collect, a tow, a place step) must be outdoors, on ground a person (a car, for a car's step) can stand on, and joined
// to the road network on foot. The test drive (?autopilot, autopilot.js) is held to it: a step whose spot fails, or an
// autopilot that could only finish by passing through a wall, fails its mission with the reason and the place, so the
// Story Kit's builder can swap the place (GameMog public/storykit/work.js, lib/storykit-reach.ts).
//   createReach(W, world) -> {
//     clear(x, z, mode)    a body can stand there: no building or wall over his feet (a person 0.3 m round, a car 1.1 m),
//                          not in the water
//     inside(x, z)         a person's middle is inside a building's outline: a no-clip
//     fromRoad(x, z, mode) { ok, why, path, len, cells }: on foot, a way from a lane of the road network to (x, z) over
//                          ground he can stand on (searchFromRoad below); a car's, a spot a car fits on a lane. A spot
//                          within SLACK m of open ground counts as that ground (a door's mark at a facade, a corner's
//                          kerb: a ring there is seen and stood in; a ring 15 m inside a tower is not). why:
//                          'inside' (the spot is in a building), 'water', 'enclosed' (walled in: no way to a road within
//                          R m), 'off-road' (a car's spot no lane reaches and on no street of the road graph)
//     line(ax, az, bx, bz) every 0.5 m between them clear on foot (a teleport or a nudge that crosses no wall)
//     nearestClear(x, z, r) the nearest clear spot within r m (a person stood up inside a wall moved out of it), or null
//     sight(a, b)          the share of a camera's line from what it looks at (a) to the lens (b) open before a wall
//     notes                what it found (the test drive's probes read and empty it)
//   }
//   searchFromRoad({ x, z, clear, road, cell, R, max })   the pure search (node --test tests/storyrun-reach.test.mjs)

// A breadth-first search over a grid of `cell` m from the spot outward, 8 ways (a diagonal only where both of its sides
// are clear: no corner cut through a wall's edge), out to R m, `max` cells at most. It ends on the first clear cell on
// a road. path: from that road cell to the spot, its corners only (every leg open ground: the autopilot walks it).
export function searchFromRoad({ x, z, clear, road, cell = 0.75, R = 90, max = 40000 }) {
  if (!clear(x, z)) return { ok: false, why: 'inside', path: null, len: 0, cells: 0 };
  if (road(x, z)) return { ok: true, why: null, path: [[x, z]], len: 0, cells: 1 };
  const N = Math.ceil(R / cell), W = 2 * N + 1, at = (i, j) => (i + N) * W + (j + N);
  const known = new Map(); // key -> clear?
  const ok = (i, j) => {
    if (Math.abs(i) > N || Math.abs(j) > N) return false;
    const k = at(i, j); let v = known.get(k);
    if (v === undefined) { v = !!clear(x + i * cell, z + j * cell); known.set(k, v); }
    return v;
  };
  const from = new Map([[at(0, 0), -1]]), qi = [0], qj = [0];
  let head = 0, end = -1;
  const STEPS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  while (head < qi.length && from.size < max) {
    const i = qi[head], j = qj[head]; head++;
    const k0 = at(i, j);
    for (const [di, dj] of STEPS) {
      const ni = i + di, nj = j + dj, k = at(ni, nj);
      if (from.has(k) || !ok(ni, nj)) continue;
      if (di && dj && !(ok(i + di, j) && ok(i, j + dj))) continue;
      from.set(k, k0);
      if (road(x + ni * cell, z + nj * cell)) { end = k; break; }
      qi.push(ni); qj.push(nj);
    }
    if (end >= 0) break;
  }
  if (end < 0) return { ok: false, why: 'enclosed', path: null, len: 0, cells: from.size };
  const pts = [];
  for (let k = end; k >= 0; k = from.get(k)) { const i = Math.floor(k / W) - N, j = (k % W) - N; pts.push([x + i * cell, z + j * cell]); }
  // (the road end first, the spot last; a corner kept only where the straight line past it would cross a wall, so every
  // leg of it is open ground the autopilot can walk or be moved along)
  pts[pts.length - 1] = [x, z];
  const open = (a, b) => { const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / (cell / 3))); for (let k = 1; k < n; k++) if (!clear(a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n)) return false; return true; };
  const path = [pts[0]];
  for (let n = 1; n < pts.length - 1; n++) if (!open(path[path.length - 1], pts[n + 1])) path.push(pts[n]);
  path.push(pts[pts.length - 1]);
  let len = 0; for (let n = 1; n < path.length; n++) len += Math.hypot(path[n][0] - path[n - 1][0], path[n][1] - path[n - 1][1]);
  return { ok: true, why: null, path, len, cells: from.size };
}

// how a collider stands against a circle at (x, z) r m round: the city's own contact test where it has one (San
// Francisco's and a town's: their real outlines, window.NYC.WorldCollision), else its turned box or its bounds
function touches(G, c, x, z, r) {
  if (x < c.minX - r || x > c.maxX + r || z < c.minZ - r || z > c.maxZ + r) return false;
  if (G && G.contact && G.circleShape) { try { return !!G.contact(G.circleShape({ x, z }, r), c); } catch { /* the bounds below */ } }
  const o = c.obb;
  if (o && Number.isFinite(o.cx)) { const dx = x - o.cx, dz = z - o.cz, lx = dx * o.cs - dz * o.sn, lz = dx * o.sn + dz * o.cs; return Math.abs(lx) < o.hx + r && Math.abs(lz) < o.hz + r; }
  return true;
}

// m: how near open ground a spot may be and count as on it (see fromRoad)
export const SLACK = 1.0;
export function createReach(W, world) {
  const cm = W.app.controllerManager;
  const notes = [];
  const note = (x) => { notes.push({ t: +(performance.now() / 1000).toFixed(1), ...x }); if (notes.length > 80) notes.shift(); };
  const G = () => globalThis.window?.NYC?.WorldCollision || null;
  const groundY = (x, z) => { try { return world.groundY ? world.groundY(x, z, 'person') : cm.getGroundHeight(x, z, 'person'); } catch { return 0; } };
  function water(x, z) {
    try { if (world.inWater?.(x, z)) return true; } catch {}
    const T = globalThis.window?.NYC?.Terrain;
    if (T && T.loaded && T.groundAt && Number.isFinite(T.waterLevel)) { const g = T.groundAt(x, z); if (Number.isFinite(g) && g <= T.waterLevel + 0.05) return true; }
    return false;
  }
  // something standing over a body r m round at (x, z): a building, a wall, a fence (not a kerb, nor a deck above him)
  function blocked(x, z, r, mode = 'person') {
    const y = groundY(x, z), g = G();
    let list; try { list = cm.nearColliders(x, z, r + 1); } catch { return false; }
    for (const c of list) {
      if (c.carOnly && mode !== 'car') continue;
      if (Number.isFinite(c.maxY) && c.maxY < y + 0.6) continue;
      if (Number.isFinite(c.minY) && c.minY > y + 2.2) continue;
      if (touches(g, c, x, z, r)) return true;
    }
    return false;
  }
  const clear = (x, z, mode = 'person') => !water(x, z) && !blocked(x, z, mode === 'car' ? 1.1 : 0.3, mode);
  const inside = (x, z) => blocked(x, z, 0.05);
  const lane = (x, z, R) => { try { return world.nearestLane?.(x, z, 'car', R) || null; } catch { return null; } };
  const onRoad = (x, z) => { const L = lane(x, z, 3.5); return !!L && L.d <= 3.5; };
  // (on a street of the road graph, the city's own centrelines (NYC.nearestRoads): within its half-width and 1.5 m of
  // one that is no footpath, and on the asphalt (world.onRoadway). A Hometown package's spawn point on a street the
  // traffic keeps no lane of: Bal Harbour's pkg_north, 0.4 m off a 7.8 m road, the nearest traffic lane 57.6 m off;
  // the autopilot drove there and circled on the mark, and the car rule alone called it off the roads)
  const PATH = 8; // (the road graph's footpath flag: city-config.js RG_FLAGS.pedestrian)
  function street(x, z) {
    try {
      const near = world.nearestRoads ? world.nearestRoads(x, z, 30) : globalThis.window?.NYC?.nearestRoads?.(x, z, 30);
      if (!near || !near.some((q) => q.road && !((q.road.flags || 0) & PATH) && Number.isFinite(q.road.w) && q.dist <= q.road.w / 2 + 1.5)) return false;
      return world.onRoadway ? !!world.onRoadway(x, z) : true;
    } catch { return false; }
  }
  const memo = new Map();
  function fromRoad(x0, z0, mode = 'person') {
    const s = clear(x0, z0, mode) ? { x: x0, z: z0 } : mode === 'car' ? null : nearestClear(x0, z0, SLACK);
    const x = s ? s.x : x0, z = s ? s.z : z0;
    const key = `${mode}:${x.toFixed(1)},${z.toFixed(1)}`;
    if (memo.has(key)) return memo.get(key);
    let r;
    if (mode === 'car') {
      // (a car's step ends on a lane: a spot a car fits on, no farther than 9 m from a lane the traffic drives, or on
      // the asphalt of a street the road graph has and the traffic does not drive (street below))
      const L = lane(x, z, 9);
      r = water(x, z) ? { ok: false, why: 'water', path: null, len: 0, cells: 1 }
        : blocked(x, z, 1.1, 'car') && !nearClearCar(x, z) ? { ok: false, why: 'inside', path: null, len: 0, cells: 1 }
        : L ? { ok: true, why: null, path: [[L.x, L.z], [x, z]], len: L.d, cells: 1 }
        : street(x, z) ? { ok: true, why: null, path: [[x, z]], len: 0, cells: 1 } : { ok: false, why: 'off-road', path: null, len: 0, cells: 1 };
    } else if (water(x, z)) r = { ok: false, why: 'water', path: null, len: 0, cells: 0 };
    else if (!s) r = { ok: false, why: water(x0, z0) ? 'water' : 'inside', path: null, len: 0, cells: 0 };
    else { r = searchFromRoad({ x, z, clear: (a, b) => clear(a, b), road: onRoad }); if (r.ok && (x !== x0 || z !== z0)) r = { ...r, path: [...r.path, [x0, z0]] }; }
    memo.set(key, r);
    if (memo.size > 400) memo.delete(memo.keys().next().value);
    return r;
  }
  function line(ax, az, bx, bz) {
    const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / 0.5));
    for (let k = 1; k <= n; k++) if (!clear(ax + (bx - ax) * k / n, az + (bz - az) * k / n)) return false;
    return true;
  }
  function nearestClear(x, z, r = 6) {
    if (clear(x, z)) return { x, z };
    for (let d = 0.5; d <= r; d += 0.5) for (let a = 0; a < 16; a++) { const q = a * Math.PI / 8, px = x + Math.cos(q) * d, pz = z + Math.sin(q) * d; if (clear(px, pz)) return { x: px, z: pz }; }
    return null;
  }
  // (a car's spot with a car's room within 1.5 m of it: a lane point by a kerb's planter)
  function nearClearCar(x, z) { for (let d = 0.5; d <= 1.5; d += 0.5) for (let a = 0; a < 12; a++) { const q = a * Math.PI / 6; if (!blocked(x + Math.cos(q) * d, z + Math.sin(q) * d, 1.1, 'car')) return true; } return false; }
  // (a car's middle r m round clear of any building and dry: where a jump may put it)
  const free = (x, z, r = 0.8) => !water(x, z) && !blocked(x, z, r, 'car');
  // a camera's line of sight, from what it looks at (a) out to the lens (b), [x, y, z] each: the share of the way that is
  // open before the first building, wall or rise of the ground across it (1: none). A cutscene's lens is kept on the
  // near side of it (runner.js clearLens)
  function sight(a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L = Math.hypot(dx, dy, dz), n = Math.max(1, Math.ceil(L / 0.3)), g = G();
    for (let k = 1; k <= n; k++) {
      const t = k / n, x = a[0] + dx * t, y = a[1] + dy * t, z = a[2] + dz * t;
      if (groundY(x, z) > y + 0.05) return (k - 1) / n;
      let list; try { list = cm.nearColliders(x, z, 0.8); } catch { return 1; }
      for (const c of list) {
        if (c.carOnly) continue;
        if (Number.isFinite(c.maxY) && y > c.maxY) continue;
        if (Number.isFinite(c.minY) && y < c.minY - 0.5) continue;
        if (touches(g, c, x, z, 0.15)) return (k - 1) / n;
      }
    }
    return 1;
  }
  return { clear, free, inside, fromRoad, line, nearestClear, onRoad, water, sight, notes, note };
}

// The words a reach failure is told in (the test drive's reason; the creator reads it on the build show): what the step
// is, where, and why a player could not do it
export const REACH_WHY = {
  inside: 'is inside a building: nobody can stand there, and buildings cannot be entered',
  water: 'is in the water',
  enclosed: 'is walled in: there is no way to it on foot from any street',
  'off-road': 'is off the roads: no car can stop there',
  noclip: 'could only be reached through a wall',
  blocked: 'could not be walked to: a wall is in the way and there is no way round it',
  spawn: 'stands a person inside a building',
};
export function reachReason(r) {
  const what = r.type === 'search' ? `the search${r.label ? ` "${String(r.label).slice(0, 40)}"` : ''}` : r.type === 'npc' ? `${r.who || 'a person'}'s spot` : `the ${r.type || 'step'}'s spot`;
  const at = r.at ? ` at ${r.name ? `${r.name} (@${r.at})` : `@${r.at}`}` : '';
  return `Unreachable: ${what}${at} ${REACH_WHY[r.why] || 'cannot be reached'}. Pick another place for it.`;
}
