// SF 2040: the way the GPS shows kept rideable. The streets still read abandoned, but along the route the player is
// sent (W.gps.route, every mission's: M1-M6 and free roam's own waypoint) no wreck stands across the line he rides:
//   - a stranded car within HALF m of the route is pushed to the kerb (its own side, else the far one), parked
//     askew as if pulled over and left; one on a street too narrow for that is put away (the traffic places it
//     elsewhere, out of view); checked every half second and again whenever the traffic places a car
//   - debris.js leaves its heaps, slabs and barricade pieces out of the corridor (laid out again when the route
//     changes: its `keep` test)
// The route is kept as the stretch ahead of him (AHEAD m), segments bucketed in 32 m cells.
//   createCorridor(W, debris) -> { update(dt), near(x, z, r), stats() }
const HALF = 3.6, AHEAD = 900, CELL = 32;

export function createCorridor(W, debris) {
  const app = W.app;
  let segs = [], cells = new Map(), key = '', t = 0, moved = 0, hidden = 0;
  const ck = (ix, iz) => (ix + 4096) * 8192 + (iz + 4096);
  function build(route) {
    segs = []; cells = new Map();
    let L = 0;
    for (let i = 1; i < route.length && L < AHEAD; i++) {
      const [ax, az] = route[i - 1], [bx, bz] = route[i], l = Math.hypot(bx - ax, bz - az);
      if (l < 0.01) continue;
      const s = { ax, az, bx, bz, l, dx: (bx - ax) / l, dz: (bz - az) / l };
      segs.push(s); L += l;
      for (let ix = Math.floor((Math.min(ax, bx) - HALF - 4) / CELL); ix <= Math.floor((Math.max(ax, bx) + HALF + 4) / CELL); ix++)
        for (let iz = Math.floor((Math.min(az, bz) - HALF - 4) / CELL); iz <= Math.floor((Math.max(az, bz) + HALF + 4) / CELL); iz++) {
          const k = ck(ix, iz); let c = cells.get(k); if (!c) cells.set(k, (c = [])); c.push(s);
        }
    }
  }
  // distance from (x, z) to the route, within r + HALF (Infinity beyond)
  function dist(x, z) {
    const c = cells.get(ck(Math.floor(x / CELL), Math.floor(z / CELL))); if (!c) return Infinity;
    let d = Infinity;
    for (const s of c) { const u = Math.max(0, Math.min(s.l, (x - s.ax) * s.dx + (z - s.az) * s.dz)); d = Math.min(d, Math.hypot(s.ax + s.dx * u - x, s.az + s.dz * u - z)); }
    return d;
  }
  const near = (x, z, r = 0) => on && segs.length > 0 && dist(x, z) < HALF + r;
  // a car's footprint against the corridor: its centre and its two ends (askew, a car is 4.5 m long)
  function blocks(v, ox, oz, yaw) {
    const fx = Math.sin(yaw) * 2.1, fz = Math.cos(yaw) * 2.1, w = 1.0;
    return dist(ox, oz) < HALF + w || dist(ox + fx, oz + fz) < HALF + w * 0.6 || dist(ox - fx, oz - fz) < HALF + w * 0.6;
  }
  // push one car clear: its lane's spot, then the kerb on its side, then the far kerb; else put it away
  function clearCar(v) {
    const e = v.edge; if (!e || v.disabled || v.bus) return;
    const base = (v.x - (v.offX || 0)), baseZ = (v.z - (v.offZ || 0));
    const yaw0 = v.yaw + (v.yawOffset || 0);
    if (!blocks(v, v.x, v.z, yaw0 + (v.askew || 0))) return;
    const lane = e.lanes && Number.isInteger(v.lane) ? e.lanes[v.lane] : 0, kerb = Math.max(0.5, (e.half || 4) - 1.05);
    for (const side of [Math.sign(lane || 1), -Math.sign(lane || 1)]) {
      const off = side * kerb - lane, x = base + e.rx * off, z = baseZ + e.rz * off;
      const askew = (Math.random() - 0.5) * 0.35;
      if (!blocks(v, x, z, yaw0 + askew)) { v.offX = e.rx * off; v.offZ = e.rz * off; v.askew = askew; v.x = x; v.z = z; moved++; return; }
    }
    // (no room either side: this street is too narrow to leave one in)
    v.disabled = true; v.edge = null; v.conn = null; v.commit = null; v._corridorOut = true; hidden++;
  }
  // (&apoccorridor=0: left as the traffic leaves it, for comparing)
  const on = new URLSearchParams(location.search).get('apoccorridor') !== '0';
  function update(dt) {
    if (!on || (t -= dt) > 0) return; t = 0.5;
    const r = W.gps?.route, d = W.gps?.dest;
    // (the route changes its first point every frame he moves: a new corridor only for a new destination, a new plan
    // longer than a few points, or once he's ridden 120 m along it)
    const k = r && r.length > 1 ? `${Math.round(r[r.length - 1][0])},${Math.round(r[r.length - 1][1])}:${r.length > 3 ? Math.round(r[2]?.[0] || 0) : ''}` : '';
    if (k !== key) {
      key = k;
      if (r && r.length > 1) build(r); else { segs = []; cells = new Map(); }
      debris?.relayout?.();
      // (the cars put away for the old route come back: the traffic places them out of view)
      for (const v of app.trafficSystem?.cars || []) if (v._corridorOut) { v._corridorOut = false; v.disabled = false; }
    }
    if (!segs.length) return;
    for (const v of app.trafficSystem?.cars || []) clearCar(v);
  }
  return { update, near, dist, stats: () => ({ segs: segs.length, moved, hidden }) };
}
