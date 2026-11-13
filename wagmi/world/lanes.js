// Mog City: the one lane locator. The traffic's road graph (trafficSystem.network: cities/sf/js/road-network.js and
// js/traffic.js) indexed by its edges in 32 m cells, so "the lane nearest here" is a few cells' look, not every edge's.
// Pure: no globals; world.nearestLane (common.js), the chase cars' nav (pursuit/nav.js) and their recovery all read it.
//   const L = createLaneIndex(net);  L.nearest(x, z, { h, y, R = 80, minLen = 8, end = 4, turn = 15 })
//     -> { x, z, heading, d, edge, s, lane } | null: the lane centre nearest (x, z) within R m, s m along the edge
//        (end m in from its ends), lane the index into edge.lanes. With h (a heading, radians, 0 = +z): an edge facing
//        more than 100 degrees away from h costs `turn` m more (a car's own side of the road, not the oncoming lanes).
//        With y: an edge whose lane is more than 2.5 m above or below y is skipped (a deck over a street, a tunnel
//        under it: net.edgeY gives the lane's height). ok(edge): only the edges it accepts.
//   L.corridor(x, z, pad = 0) -> true on an edge's roadway (its half-width either side of its centreline)
//   L.net, L.version: what it was built from (rebuilt by laneIndexFor when either changes)
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const CELL = 32, COS100 = Math.cos((100 * Math.PI) / 180), key = (ix, iz) => (ix + 32768) * 65536 + (iz + 32768);

export function createLaneIndex(net) {
  const cells = new Map();
  const add = (k, e) => { let c = cells.get(k); if (!c) cells.set(k, (c = [])); c.push(e); };
  for (const e of net?.edges || []) {
    if (!e || !(e.len > 0) || !e.lanes || !e.lanes.length) continue;
    // (the edge's straight run, its lanes either side: every cell its box touches)
    let w = Math.max(2, (e.half || 0) + 0.5); for (const l of e.lanes) w = Math.max(w, Math.abs(l) + 2);
    const ex = e.sx + e.dx * e.len, ez = e.sz + e.dz * e.len;
    const x0 = Math.floor((Math.min(e.sx, ex) - w) / CELL), x1 = Math.floor((Math.max(e.sx, ex) + w) / CELL);
    const z0 = Math.floor((Math.min(e.sz, ez) - w) / CELL), z1 = Math.floor((Math.max(e.sz, ez) + w) / CELL);
    for (let a = x0; a <= x1; a++) for (let b = z0; b <= z1; b++) add(key(a, b), e);
  }
  const edgeY = typeof net?.edgeY === 'function' ? net.edgeY : null;
  const seen = new Set();
  function nearest(x, z, o = {}) {
    const R = o.R ?? 80, minLen = o.minLen ?? 8, end = o.end ?? 4, turn = o.turn ?? 15, ok = o.ok || null;
    const h = Number.isFinite(o.h) ? o.h : null, y = Number.isFinite(o.y) ? o.y : null;
    const hx = h == null ? 0 : Math.sin(h), hz = h == null ? 0 : Math.cos(h);
    let best = null, bs = Infinity;
    const ix = Math.floor(x / CELL), iz = Math.floor(z / CELL), rMax = Math.ceil(R / CELL);
    seen.clear();
    for (let r = 0; r <= rMax; r++) {
      for (let a = ix - r; a <= ix + r; a++) for (let b = iz - r; b <= iz + r; b++) {
        if (Math.max(Math.abs(a - ix), Math.abs(b - iz)) !== r) continue;
        const list = cells.get(key(a, b)); if (!list) continue;
        for (const e of list) {
          if (seen.has(e)) continue; seen.add(e);
          if (e.len < minLen || (ok && !ok(e))) continue;
          const s = clamp((x - e.sx) * e.dx + (z - e.sz) * e.dz, Math.min(end, e.len / 2), Math.max(e.len - end, e.len / 2));
          const pen = h != null && e.dx * hx + e.dz * hz < COS100 ? turn : 0;
          for (let l = 0; l < e.lanes.length; l++) {
            const px = e.sx + e.dx * s + e.rx * e.lanes[l], pz = e.sz + e.dz * s + e.rz * e.lanes[l], d = Math.hypot(px - x, pz - z);
            if (d > R || d + pen >= bs) continue;
            if (y != null && edgeY && e.prof) { const ly = edgeY(e, s, l); if (Number.isFinite(ly) && Math.abs(ly - y) > 2.5) continue; }
            bs = d + pen; best = { x: px, z: pz, heading: Math.atan2(e.dx, e.dz), d, edge: e, s, lane: l };
          }
        }
      }
      // (every cell within the best score's reach looked at: nothing nearer is left)
      if (best && bs <= r * CELL) break;
    }
    return best;
  }
  // on an edge's roadway: within its half-width (edge.half, else its outer lane and 1.8 m) of its centreline, between
  // its ends (and pad m more). What the road graph says is road, whatever the curb islands say
  function corridor(x, z, pad = 0) {
    const list = cells.get(key(Math.floor(x / CELL), Math.floor(z / CELL))); if (!list) return false;
    for (const e of list) {
      const s = (x - e.sx) * e.dx + (z - e.sz) * e.dz; if (s < -pad || s > e.len + pad) continue;
      let half = e.half || 0; if (!half) for (const l of e.lanes) half = Math.max(half, Math.abs(l) + 1.8);
      if (Math.abs((x - e.sx) * e.rx + (z - e.sz) * e.rz) <= half + pad) return true;
    }
    return false;
  }
  return { nearest, corridor, net, version: net?.version ?? 0 };
}

// the index for this network, built once and again only when the network (or its version) changes
let cached = null;
export function laneIndexFor(net) {
  if (!net) return null;
  if (!cached || cached.net !== net || cached.version !== (net.version ?? 0)) cached = createLaneIndex(net);
  return cached;
}
