// Mog City: how a chase car finds its way. The traffic's road graph (trafficSystem.network) read as streets between
// corners, both ways (a chase car drives a one-way street the wrong way if that is the short way to Dan), A* corner
// to corner; and sight: a line between two points with no building across it.
//   const nav = createNav(app);  nav.route(from {x, z, h}, to {x, z}) -> [[x, z], ...] (corners, then the target)
//   nav.nearest(x, z) -> node;  nav.sees(ax, az, bx, bz) -> true when no building stands between; nav.solid(x, z)
//   nav.spot(x, z, rMin, rMax, ok) -> { x, z, h } a point in a lane rMin..rMax m from (x, z) that ok(x, z, h) accepts
export function createNav(app) {
  const net = app.trafficSystem.network, cm = app.controllerManager;
  const nodes = net.nodes, edges = net.edges;
  // (a lane the graph lays over a park's walks or lawn, as round Washington Square, isn't a street: its benches, lamps
  // and trees stop a car dead. The parks stand 0.26 m up and more, the city's streets at 0 and its medians at 0.22.)
  const inPark = (e) => {
    let n = 0, up = 0;
    for (let s = 2; s < e.len - 1; s += 6) { n++; if (cm.getGroundHeight(e.sx + e.dx * s, e.sz + e.dz * s, 'car') > 0.245) up++; }
    return n > 0 && up / n > 0.5;
  };
  // the corners each corner leads to (both ways), and how far
  const adj = nodes.map(() => []);
  for (const e of edges) {
    const a = e.from.id, b = e.to.id; if (a == null || b == null || !adj[a] || !adj[b]) continue;
    if (inPark(e)) continue;
    const d = Math.hypot(e.to.x - e.from.x, e.to.z - e.from.z);
    if (!adj[a].some((x) => x.n === b)) adj[a].push({ n: b, d, e });
    if (!adj[b].some((x) => x.n === a)) adj[b].push({ n: a, d, e });
  }
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
  // A*, corner to corner
  const g = new Float64Array(nodes.length), came = new Int32Array(nodes.length), stamp = new Int32Array(nodes.length), shut = new Int32Array(nodes.length);
  let run = 0;
  function astar(A, B) {
    run++;
    const heap = [];
    const push = (f, i) => { heap.push([f, i]); let j = heap.length - 1; while (j > 0) { const p = (j - 1) >> 1; if (heap[p][0] <= heap[j][0]) break; [heap[p], heap[j]] = [heap[j], heap[p]]; j = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let j = 0; for (;;) { const l = 2 * j + 1, r = l + 1; let m = j; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === j) break; [heap[m], heap[j]] = [heap[j], heap[m]]; j = m; } } return top; };
    const hc = (i) => Math.hypot(nodes[i].x - B.x, nodes[i].z - B.z);
    g[A.id] = 0; stamp[A.id] = run; came[A.id] = -1; push(hc(A.id), A.id);
    let n = 0;
    while (heap.length && n++ < 6000) {
      const [, u] = pop(); if (shut[u] === run) continue; shut[u] = run;
      if (u === B.id) break;
      for (const { n: v, d } of adj[u]) {
        if (shut[v] === run) continue;
        // (a turn costs a little: it keeps to the long straight streets)
        const p = came[u] >= 0 ? nodes[came[u]] : null, cu = nodes[u], cv = nodes[v];
        const turn = p ? 1 - ((cu.x - p.x) * (cv.x - cu.x) + (cu.z - p.z) * (cv.z - cu.z)) / ((Math.hypot(cu.x - p.x, cu.z - p.z) * d) || 1) : 0;
        const ng = g[u] + d + turn * 12;
        if (stamp[v] !== run || ng < g[v]) { g[v] = ng; stamp[v] = run; came[v] = u; push(ng + hc(v), v); }
      }
    }
    if (shut[B.id] !== run) return null;
    const out = []; for (let i = B.id; i >= 0; i = came[i]) out.push(nodes[i]);
    return out.reverse();
  }
  function route(from, to) {
    const A = nearest(from.x, from.z, from.h), B = nearest(to.x, to.z);
    if (!A || !B) return [[to.x, to.z]];
    const chain = A === B ? [A] : astar(A, B) || [A];
    const pts = chain.map((n) => [n.x, n.z]);
    // (the first corner behind it on the way: dropped, it drives on toward the second; only when it is out along that
    // leg already, not off to one side of the corner: a car 20 m up the cross street must come down to the corner first)
    if (pts.length > 1) {
      const [x0, z0] = pts[0], [x1, z1] = pts[1], ax = x1 - x0, az = z1 - z0, L = Math.hypot(ax, az) || 1;
      const along = ((from.x - x0) * ax + (from.z - z0) * az) / L, side = Math.abs((from.x - x0) * az - (from.z - z0) * ax) / L;
      if (along > 0 && side < 9) pts.shift();
    }
    // (the last corner past the target: dropped too, it goes straight on to him)
    if (pts.length > 1) { const n = pts.length, [x0, z0] = pts[n - 2], [x1, z1] = pts[n - 1], ax = x1 - x0, az = z1 - z0; if ((to.x - x1) * ax + (to.z - z1) * az < 0) pts.pop(); }
    pts.push([to.x, to.z]);
    return pts;
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
  // a spot in a lane: on an edge rMin..rMax m from (x, z), facing along it
  function spot(x, z, rMin, rMax, ok = () => true, tries = 80) {
    for (let k = 0; k < tries; k++) {
      const a = Math.random() * Math.PI * 2, r = rMin + Math.random() * (rMax - rMin);
      const n = nearest(x + Math.sin(a) * r, z + Math.cos(a) * r, null, 120); if (!n || !adj[n.id].length) continue;
      const { e } = adj[n.id][Math.floor(Math.random() * adj[n.id].length)];
      if (!e || e.len < 14) continue;
      const s = 6 + Math.random() * (e.len - 12), lane = e.lanes[Math.floor(Math.random() * e.lanes.length)] ?? 0;
      const px = e.sx + e.dx * s + e.rx * lane, pz = e.sz + e.dz * s + e.rz * lane, d = Math.hypot(px - x, pz - z);
      if (d < rMin || d > rMax) continue;
      const h = Math.atan2(e.dx, e.dz);
      if (ok(px, pz, h, e)) return { x: px, z: pz, h, e };
    }
    return null;
  }
  // the lane point nearest (x, z) on any edge (for a spawn at a given place)
  function onRoad(x, z) {
    let best = null, bs = Infinity;
    const n = nearest(x, z, null, 200); if (!n) return null;
    const near = new Set();
    for (const { e } of adj[n.id]) near.add(e);
    for (const { n: m } of adj[n.id]) for (const { e } of adj[m]) near.add(e);
    for (const e of near) {
      const s = Math.max(4, Math.min(e.len - 4, (x - e.sx) * e.dx + (z - e.sz) * e.dz));
      const lat = (x - e.sx) * e.rx + (z - e.sz) * e.rz;
      let lane = e.lanes[0] ?? 0; for (const l of e.lanes) if (Math.abs(l - lat) < Math.abs(lane - lat)) lane = l;
      const px = e.sx + e.dx * s + e.rx * lane, pz = e.sz + e.dz * s + e.rz * lane, d = Math.hypot(px - x, pz - z);
      if (d < bs) { bs = d; best = { x: px, z: pz, h: Math.atan2(e.dx, e.dz), e, s }; }
    }
    return best;
  }
  return { nearest, route, sees, solid, spot, onRoad, nodes, adj };
}
