// Mog City: how a chase car finds its way. The traffic's road graph (trafficSystem.network) read as streets between
// corners, both ways (a chase car drives a one-way street the wrong way if that is the short way to Dan), A* corner
// to corner, the two ends on lanes: from the lane the car is on (the lane index, wagmi/world/lanes.js, by its heading)
// on to its next corner, and in at the end to the lane nearest the goal; and sight: a line between two points with no
// building across it.
//   const nav = createNav(app);  nav.route(from {x, z, h}, to {x, z}) -> [[x, z], ...]: the car's own lane point, the
//     corners, the goal's lane point, then the goal itself when it stands on the road (world.onRoadway) or within 4 m
//     of that lane. Never a straight line across the blocks: with no way found it is 30 m on along its own lane.
//   nav.locate(x, z, h?, y?) -> { x, z, heading, d, edge, s, lane } the lane point there (by heading: its own side)
//   nav.nearest(x, z) -> node;  nav.sees(ax, az, bx, bz) -> true when no building stands between; nav.solid(x, z)
//   nav.spot(x, z, rMin, rMax, ok) -> { x, z, h } a point in a lane rMin..rMax m from (x, z) that ok(x, z, h) accepts
//   nav.onRoad(x, z) -> { x, z, h, e, s } the lane point nearest (x, z);  nav.stats() -> { edges, parkEdges, ... }
// It follows the network: when the traffic's network is rebuilt (a new object or a new version) it builds itself
// again on the next call. opts: { rnd } (Math.random; a test's seeded one), { world } (a test's world contract).
import { world as WORLD } from '../world/index.js';
import { createLaneIndex } from '../world/lanes.js';

export function createNav(app, opts = {}) {
  const W = opts.world || WORLD, rnd = opts.rnd || Math.random;
  let G = null;
  const live = () => { const n = app.trafficSystem.network; if (!G || G.net !== n || G.version !== (n.version ?? 0)) G = build(n); return G; };
  const nav = {
    route: (from, to) => live().route(from, to),
    locate: (x, z, h, y) => live().locate(x, z, h, y),
    nearest: (x, z, h, maxR) => live().nearest(x, z, h, maxR),
    sees: (ax, az, bx, bz) => sees(ax, az, bx, bz),
    solid: (x, z) => solid(x, z),
    spot: (x, z, rMin, rMax, ok, tries) => live().spot(x, z, rMin, rMax, ok, tries),
    onRoad: (x, z) => live().onRoad(x, z),
    stats: () => live().stats,
    // (the network it was made for: world.route's cached nav is made again when this is false)
    fresh: (n) => n === app.trafficSystem.network && !!G && G.net === n && G.version === (n.version ?? 0),
    get nodes() { return live().nodes; },
    get adj() { return live().adj; },
  };
  const cm = app.controllerManager;

  function build(net) {
    const nodes = net.nodes, edges = net.edges;
    // (a lane the graph lays over a park's walks or lawn, as round Washington Square, isn't a street: its benches, lamps
    // and trees stop a car dead. The parks stand 0.26 m up and more over the road's own level there (world.roadY: a
    // hill's bare ground, New York's streets at 0), the medians 0.22.)
    const inPark = (e) => {
      let n = 0, up = 0;
      for (let s = 2; s < e.len - 1; s += 6) { n++; { const x = e.sx + e.dx * s, z = e.sz + e.dz * s; if (cm.getGroundHeight(x, z, 'car') - W.roadY(x, z) > 0.245) up++; } }
      return n > 0 && up / n > 0.5;
    };
    // the corners each corner leads to (both ways), and how far
    const adj = nodes.map(() => []), park = new Set();
    let parkLen = 0, allLen = 0;
    for (const e of edges) {
      const a = e.from.id, b = e.to.id; if (a == null || b == null || !adj[a] || !adj[b]) continue;
      allLen += e.len || 0;
      if (inPark(e)) { park.add(e); parkLen += e.len || 0; continue; }
      const d = Math.hypot(e.to.x - e.from.x, e.to.z - e.from.z);
      if (!adj[a].some((x) => x.n === b)) adj[a].push({ n: b, d, e });
      if (!adj[b].some((x) => x.n === a)) adj[b].push({ n: a, d, e });
    }
    const lanes = createLaneIndex(net), road = (e) => !park.has(e);
    const stats = { nodes: nodes.length, edges: edges.length, parkEdges: park.size, parkShare: allLen ? +(parkLen / allLen).toFixed(4) : 0, routes: 0, fails: 0 };
    // the corners in 64 m cells
    const CELL = 64, cells = new Map(), key = (ix, iz) => (ix + 4096) * 8192 + (iz + 4096);
    for (const n of nodes) { const k = key(Math.floor(n.x / CELL), Math.floor(n.z / CELL)); let c = cells.get(k); if (!c) cells.set(k, (c = [])); c.push(n); }
    function nearest(x, z, h = null, maxR = 260) {
      let best = null, bs = Infinity;
      const ix = Math.floor(x / CELL), iz = Math.floor(z / CELL);
      for (let r = 0; r <= Math.ceil(maxR / CELL); r++) {
        for (let a = ix - r; a <= ix + r; a++) for (let b = iz - r; b <= iz + r; b++) {
          if (Math.max(Math.abs(a - ix), Math.abs(b - iz)) !== r) continue;
          for (const n of cells.get(key(a, b)) || []) {
            if (!adj[n.id] || !adj[n.id].length) continue;
            const dx = n.x - x, dz = n.z - z, d = Math.hypot(dx, dz);
            // (with a heading: one behind costs more, so it drives on to the next rather than turning round)
            const s = d + (h != null && d > 6 && (dx * Math.sin(h) + dz * Math.cos(h)) / d < -0.3 ? 45 : 0);
            if (s < bs) { bs = s; best = n; }
          }
        }
        if (best && bs < (r + 1) * CELL - CELL * 0.5) break;
      }
      return best;
    }
    // the lane point at (x, z): on a street (not a park's walk), its own side of the road by the heading, at its level
    const locate = (x, z, h = null, y = null, R = 200) => lanes.nearest(x, z, { h, y, R, ok: road });
    // A*, corner to corner: from any of the sources (corner id, the metres to it) to any of the goals (corner id -> the
    // metres on from it); the heuristic the straight line to the goal's point (bx, bz), which no way beats
    const g = new Float64Array(nodes.length), came = new Int32Array(nodes.length), stamp = new Int32Array(nodes.length), shut = new Int32Array(nodes.length);
    const CAP = Math.max(6000, 2 * nodes.length);
    let run = 0;
    function search(sources, goals, bx, bz) {
      run++;
      const heap = [];
      const push = (f, i) => { heap.push([f, i]); let j = heap.length - 1; while (j > 0) { const p = (j - 1) >> 1; if (heap[p][0] <= heap[j][0]) break; [heap[p], heap[j]] = [heap[j], heap[p]]; j = p; } };
      const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let j = 0; for (;;) { const l = 2 * j + 1, r = l + 1; let m = j; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === j) break; [heap[m], heap[j]] = [heap[j], heap[m]]; j = m; } } return top; };
      const hc = (i) => Math.hypot(nodes[i].x - bx, nodes[i].z - bz);
      for (const [i, g0] of sources) {
        if (i == null || !adj[i]) continue;
        if (stamp[i] === run && g[i] <= g0) continue;
        g[i] = g0; stamp[i] = run; came[i] = -1; push(g0 + hc(i), i);
      }
      let n = 0, bestT = Infinity, bestGoal = -1;
      while (heap.length && n++ < CAP) {
        const [f, u] = pop(); if (f >= bestT) break;
        if (shut[u] === run) continue; shut[u] = run;
        if (goals.has(u)) { const t = g[u] + goals.get(u); if (t < bestT) { bestT = t; bestGoal = u; } }
        for (const { n: v, d } of adj[u]) {
          if (shut[v] === run) continue;
          // (a turn costs a little: it keeps to the long straight streets)
          const p = came[u] >= 0 ? nodes[came[u]] : null, cu = nodes[u], cv = nodes[v];
          const turn = p ? 1 - ((cu.x - p.x) * (cv.x - cu.x) + (cu.z - p.z) * (cv.z - cu.z)) / ((Math.hypot(cu.x - p.x, cu.z - p.z) * d) || 1) : 0;
          const ng = g[u] + d + turn * 12;
          if (stamp[v] !== run || ng < g[v]) { g[v] = ng; stamp[v] = run; came[v] = u; push(ng + hc(v), v); }
        }
      }
      if (bestGoal < 0) return null;
      const out = []; for (let i = bestGoal; i >= 0; i = came[i]) out.push(nodes[i]);
      return out.reverse();
    }
    // (a lane point s m along edge e, on its lane l)
    const at = (e, s, l) => { const o = e.lanes[l] ?? 0; return [e.sx + e.dx * s + e.rx * o, e.sz + e.dz * s + e.rz * o]; };
    function route(from, to) {
      stats.routes++;
      const A = locate(from.x, from.z, from.h ?? null), B = locate(to.x, to.z);
      if (!A || !B) { stats.fails++; return [[to.x, to.z]]; }
      const e = A.edge, f = B.edge, pts = [[A.x, A.z]];
      // (the goal itself when it is on the road: in its lane's reach, or on the asphalt near it)
      const dTo = Math.hypot(to.x - B.x, to.z - B.z);
      const tail = () => { if (dTo < 4 || (dTo < 12 && W.onRoadway?.(to.x, to.z))) pts.push([to.x, to.z]); return pts; };
      // (the same street: straight along it)
      if (f === e || (f.from === e.to && f.to === e.from)) { pts.push([B.x, B.z]); return tail(); }
      // on along its own lane to the corner ahead; or back to the one behind (turning round costs 45 m)
      const hx = Math.sin(from.h ?? 0), hz = Math.cos(from.h ?? 0), fwd = from.h == null || e.dx * hx + e.dz * hz >= 0;
      const ahead = fwd ? e.to : e.from, behind = fwd ? e.from : e.to;
      const dA = (n) => Math.hypot(n.x - A.x, n.z - A.z);
      const sources = [[ahead.id, dA(ahead)], [behind.id, dA(behind) + 45]];
      const goals = new Map(); for (const n of [f.from, f.to]) { const d = Math.hypot(n.x - B.x, n.z - B.z); if (!goals.has(n.id) || goals.get(n.id) > d) goals.set(n.id, d); }
      const chain = search(sources, goals, B.x, B.z);
      if (!chain) {
        // (no way found: on along its own lane, 30 m, and it tries again at the next plan)
        stats.fails++;
        pts.push(at(e, Math.max(0, Math.min(e.len, A.s + (fwd ? 30 : -30))), A.lane));
        return pts;
      }
      for (const n of chain) pts.push([n.x, n.z]);
      pts.push([B.x, B.z]);
      return tail();
    }
    // a spot in a lane: on an edge rMin..rMax m from (x, z), facing along it
    function spot(x, z, rMin, rMax, ok = () => true, tries = 80) {
      for (let k = 0; k < tries; k++) {
        const a = rnd() * Math.PI * 2, r = rMin + rnd() * (rMax - rMin);
        const n = nearest(x + Math.sin(a) * r, z + Math.cos(a) * r, null, 120); if (!n || !adj[n.id].length) continue;
        const { e } = adj[n.id][Math.floor(rnd() * adj[n.id].length)];
        if (!e || e.len < 14) continue;
        const s = 6 + rnd() * (e.len - 12), lane = e.lanes[Math.floor(rnd() * e.lanes.length)] ?? 0;
        const px = e.sx + e.dx * s + e.rx * lane, pz = e.sz + e.dz * s + e.rz * lane, d = Math.hypot(px - x, pz - z);
        if (d < rMin || d > rMax) continue;
        const h = Math.atan2(e.dx, e.dz);
        if (ok(px, pz, h, e)) return { x: px, z: pz, h, e };
      }
      return null;
    }
    // the lane point nearest (x, z) on any street (for a spawn at a given place, the pull-up by him on foot)
    function onRoad(x, z) {
      const L = locate(x, z);
      return L && { x: L.x, z: L.z, h: L.heading, e: L.edge, s: L.s, lane: L.lane, d: L.d };
    }
    return { net, version: net.version ?? 0, nodes, adj, nearest, locate, route, spot, onRoad, stats };
  }

  // sight: every 4 m along the line, inside a building's box (taller than a car) or not
  function inside(c, x, z) {
    if (c.obb) { const o = c.obb, dx = x - o.cx, dz = z - o.cz; return Math.abs(dx * o.cs - dz * o.sn) < o.hx && Math.abs(dx * o.sn + dz * o.cs) < o.hz; }
    return x > c.minX && x < c.maxX && z > c.minZ && z < c.maxZ;
  }
  // a point inside a building (or anything solid a car can't go through)
  function solid(x, z) {
    for (const c of cm.nearColliders(x, z, 0.5)) if (inside(c, x, z)) return true;
    return false;
  }
  function sees(ax, az, bx, bz) {
    const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / 4);
    for (let i = 1; i < n; i++) {
      const t = i / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      for (const c of cm.nearColliders(x, z, 0.5)) if (!c.carOnly && c.maxY > 3 && inside(c, x, z)) return false;
    }
    return true;
  }
  live();
  return nav;
}
