// Mog City: the GPS and the mission blips. The quickest legal route is an A* search over the traffic's road graph
// (__NYC_APP.trafficSystem.network: lane edges joined by the turns the graph allows, so one-way streets are kept),
// edge to edge, re-planned every second and whenever the player strays 25 m off it. The route (yellow on a dark casing),
// the destination and the blips are drawn on the radar and the full map over the city's own layers, in place of its
// L-shaped line (mapSystem.waypoint still names the destination). On foot and close (150 m) the route is a straight line;
// on foot and further, a walking route (planWalk: junction to junction, a one-way street walked either way).
// The rule (every mission, GTA's): the route always goes where the current objective says. An objective about the car
// routes to the car, one about a place to the place, a fight has none.
//   const gps = createGPS(W);  gps.set({ x, z, name });  gps.clear();
//   gps.objective(parts, target, { blip })   the objective (ui.objective: the line and the tracker) and the route with
//                         it, in one call: target a place { x, z, name } (its yellow blip too, unless blip: false), a thing
//                         that moves { follow: () => ({ x, z }), name } (the route only), or null (no route)
//   gps.to(target)        the route's target alone, the blips left as they are (same targets)
//   gps.drive({ dest, objective, onFoot, grace, needsCar }) -> { step(), stop(), state }   a 'get there' objective.
//                         A place he can walk to (needsCar false, the default): out of the car the objective, the
//                         place's blip and the route stay (a walking route), the car blipped once he's 25 m from it,
//                         one help line that the car is quicker. A leg that needs the car (needsCar: a tail, a chase):
//                         out of it, after a grace of a few seconds, 'Get back in your car.' with the car blipped and the
//                         route to it; within onFoot m of the place on foot, on to it on foot; back in the car, the place
//                         again. step() every frame (from the mission's frame hook), stop() at the end.
//   gps.blip(id, { x, z, kind: 'dest' | 'car' | 'enemy' | 'friend' | 'object' | 'letter' | 'laptop' | 'waypoint', letter,
//                  pulse, edge, name, label });  gps.unblip(id);  gps.update() (every frame; the radar asks for it itself)
//                         (label: true, its name, up to ' · ', written beside it on the full map)
//   gps.user              the player's own waypoint (a click on the full map, or its search's 'Set waypoint'): purple,
//                         its route wins over the mission's until he gets there, clicks it away, or the objective changes
// Named mission places (the route's place, named blips) are found by the full map's search (mapSystem.searchExtra).
// Stalls (instead of reminders on a timer): with a place to go, no headway along the route for 50 s of play, or the car
// stuck (the pedal down, going nowhere, 4 s), real help is offered once (ui.offer): the way shown again, the car put
// back on the road (WAGMI.recoverCar), the checkpoint restarted (a mission running). gps.stallNote = [from, text]: one
// gentle line sent with the first offer (the contact's), then never again for that objective.
// In the car, the next turn and its street at the top of the screen (turns.js: gps.turns), its corner a white chevron on
// the radar. On the full map, a blip with label: true has its name beside it; a pulse takes the blip's own colour.
import { createTurns } from './turns.js';
const YELLOW = '#FFC93C', BLUE = '#6CB8FF', RED = '#EF4444', GREEN = '#4ADE80', PURPLE = '#C77DFF', HALO = 'rgba(8, 11, 15, 0.9)';
const FOOT_LINE = 150; // m: on foot and this close, the route is the straight line to it

export function createGPS(W) {
  const app = W.app, ms = app.mapSystem, cm = app.controllerManager, net = app.trafficSystem.network;
  const edges = net.edges;
  const endOf = (e) => [e.sx + e.dx * e.len, e.sz + e.dz * e.len];
  // the nearest lane edge to (x, z), favouring one that runs the way `h` faces: across it (a cross street's lane met in
  // the middle of a junction, where the avenue's own lanes are 17 m off) counts as 20 m further off, against it as 40
  // (so driving straight through a junction it stays on the avenue ahead and never routes round the block)
  function nearest(x, z, h = null) {
    let best = null, bs = Infinity;
    for (const e of edges) {
      const s = Math.max(0, Math.min(e.len, (x - e.sx) * e.dx + (z - e.sz) * e.dz));
      const d = Math.hypot(e.sx + e.dx * s - x, e.sz + e.dz * s - z);
      const score = d + (h != null ? (1 - (Math.sin(h) * e.dx + Math.cos(h) * e.dz)) * 20 : 0);
      if (score < bs) { bs = score; best = { e, s, d }; }
    }
    return best;
  }
  // A* from edge to edge: g = metres to the end of an edge
  function plan(from, to, h) {
    const A = nearest(from.x, from.z, h), Bn = nearest(to.x, to.z);
    if (!A || !Bn) return null;
    const P = (e, s) => [e.sx + e.dx * s, e.sz + e.dz * s];
    if (A.e === Bn.e && Bn.s >= A.s) return [[from.x, from.z], P(A.e, A.s), P(Bn.e, Bn.s), [to.x, to.z]];
    const g = new Map([[A.e, A.e.len - A.s]]), came = new Map(), closed = new Set();
    const heap = [];
    const hcost = (e) => { const [ex, ez] = endOf(e); return Math.hypot(ex - to.x, ez - to.z); };
    const push = (e, f) => { heap.push([f, e]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    push(A.e, g.get(A.e) + hcost(A.e));
    let found = null, n = 0;
    while (heap.length && n++ < 20000) {
      const [, e] = pop(); if (closed.has(e)) continue; closed.add(e);
      if (e === Bn.e && e !== A.e) { found = e; break; }
      const [ex, ez] = endOf(e);
      for (const m of e.moves) {
        const f = m.to; if (!f || closed.has(f)) continue;
        // (a turn costs as much as 40 m of straight road: the route keeps to the long avenues, as a driver would)
        const ng = g.get(e) + Math.hypot(f.sx - ex, f.sz - ez) + f.len + (m.turn && m.turn !== 'S' ? 40 : 0);
        if (ng < (g.get(f) ?? Infinity)) { g.set(f, ng); came.set(f, e); push(f, ng + hcost(f)); }
      }
    }
    if (!found) return null;
    const chain = []; for (let e = found; e; e = came.get(e)) chain.unshift(e);
    const pts = [[from.x, from.z], P(A.e, A.s), endOf(A.e)];
    for (let i = 1; i < chain.length; i++) { const e = chain[i]; pts.push([e.sx, e.sz]); pts.push(i === chain.length - 1 ? P(e, Bn.s) : endOf(e)); }
    pts.push([to.x, to.z]);
    return pts;
  }
  // the walking route: a man on foot walks a one-way street either way. The road graph's junctions are the nodes, every
  // road between two an edge both ways (two junctions closer than 20 m are one corner: joined too); its ends are the
  // nearest road to each point, left by either end. Built once, when an objective with a place to go first comes up
  // (walkGraph(): not on a replan mid-walk), the roads bucketed into a 50 m grid so the nearest one is a few cells' look
  const CELL = 50, cellOf = (x, z) => Math.floor(x / CELL) + ',' + Math.floor(z / CELL);
  let walkG = null;
  // (again: built afresh, to time it)
  function walkGraph(again = false) {
    if (walkG && !again) return walkG;
    const t0 = performance.now(), adj = new Map(), grid = new Map(), roads = [], seen = new Set(), nodes = new Set();
    const link = (a, b, w) => { for (const [p, q] of [[a, b], [b, a]]) { let l = adj.get(p); if (!l) adj.set(p, (l = [])); l.push([q, w]); } };
    for (const e of edges) {
      const a = e.from, b = e.to; if (!a || !b || a === b) continue;
      const id = a.id ?? a.x + ',' + a.z, jd = b.id ?? b.x + ',' + b.z, k = id < jd ? id + '|' + jd : jd + '|' + id;
      if (seen.has(k)) continue; seen.add(k);
      const L = Math.hypot(b.x - a.x, b.z - a.z); if (L < 0.5) continue;
      const r = { a, b, dx: (b.x - a.x) / L, dz: (b.z - a.z) / L, L };
      roads.push(r); link(a, b, L); nodes.add(a); nodes.add(b);
      const n = Math.max(1, Math.ceil(L / 20)), cells = new Set();
      for (let i = 0; i <= n; i++) cells.add(cellOf(a.x + (b.x - a.x) * i / n, a.z + (b.z - a.z) * i / n));
      for (const c of cells) { let l = grid.get(c); if (!l) grid.set(c, (l = [])); l.push(r); }
    }
    // (the same corner: a divided avenue's two carriageways, a stretch too short to be a traffic lane)
    const ng = new Map();
    for (const n of nodes) { const c = cellOf(n.x, n.z); let l = ng.get(c); if (!l) ng.set(c, (l = [])); l.push(n); }
    for (const n of nodes) {
      const cx = Math.floor(n.x / CELL), cz = Math.floor(n.z / CELL);
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const m of ng.get(cx + i + ',' + (cz + j)) || []) {
        if (m === n) continue; const d = Math.hypot(m.x - n.x, m.z - n.z);
        if (d < 20 && !(adj.get(n) || []).some(([q]) => q === m)) { let l = adj.get(n); if (!l) adj.set(n, (l = [])); l.push([m, d]); }
      }
    }
    return (walkG = { adj, grid, roads, ms: performance.now() - t0 });
  }
  // the nearest road to (x, z): the grid's cells ring by ring, out until nothing nearer can be further out
  function roadAt(G, x, z) {
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    let best = null, bd = Infinity;
    const look = (r) => {
      const s = Math.max(0, Math.min(r.L, (x - r.a.x) * r.dx + (z - r.a.z) * r.dz));
      const d = Math.hypot(r.a.x + r.dx * s - x, r.a.z + r.dz * s - z);
      if (d < bd) { bd = d; best = { r, s, d }; }
    };
    for (let ring = 0; ring <= 8; ring++) {
      for (let i = -ring; i <= ring; i++) for (let j = -ring; j <= ring; j++) {
        if (Math.max(Math.abs(i), Math.abs(j)) !== ring) continue;
        for (const r of G.grid.get(cx + i + ',' + (cz + j)) || []) look(r);
      }
      if (best && bd <= ring * CELL) break;
    }
    if (!best) for (const r of G.roads) look(r);
    return best;
  }
  // (a man on foot cuts across a park or a plaza: from each end, straight to the furthest of the next few corners he can
  // walk to in a line, on land and clear of the buildings, 400 m at most)
  const clear = (a, b) => {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L > 400) return false;
    for (let i = 1, n = Math.ceil(L / 5); i < n; i++) { const x = a[0] + (b[0] - a[0]) * i / n, z = a[1] + (b[1] - a[1]) * i / n; if (!net.walkable(x - 0.6, x + 0.6, z - 0.6, z + 0.6)) return false; }
    return true;
  };
  function trim(pts) {
    if (!net.walkable || pts.length < 4) return pts;
    for (let j = Math.min(pts.length - 1, 8); j >= 2; j--) if (clear(pts[0], pts[j])) { pts = [pts[0], ...pts.slice(j)]; break; }
    const n = pts.length;
    for (let j = Math.max(0, n - 9); j <= n - 3; j++) if (clear(pts[j], pts[n - 1])) { pts = [...pts.slice(0, j + 1), pts[n - 1]]; break; }
    return pts;
  }
  function planWalk(from, to) {
    const G = walkGraph(), A = roadAt(G, from.x, from.z), B = roadAt(G, to.x, to.z);
    if (!A || !B) return null;
    const P = (q) => [q.r.a.x + q.r.dx * q.s, q.r.a.z + q.r.dz * q.s];
    const [bx, bz] = P(B);
    if (A.r === B.r) return trim([[from.x, from.z], P(A), [bx, bz], [to.x, to.z]]);
    // (A*: off A's road by either end, onto B's road by either end; the straight line to B's point never overestimates)
    const goal = new Map([[B.r.a, B.s], [B.r.b, B.r.L - B.s]]), h = (n) => Math.hypot(n.x - bx, n.z - bz);
    const g = new Map(), came = new Map(), closed = new Set(), heap = [];
    const push = (f, k) => { heap.push([f, k]); let i = heap.length - 1; while (i > 0) { const q = (i - 1) >> 1; if (heap[q][0] <= heap[i][0]) break; [heap[q], heap[i]] = [heap[i], heap[q]]; i = q; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    for (const [n, c] of [[A.r.a, A.s], [A.r.b, A.r.L - A.s]]) if (c < (g.get(n) ?? Infinity)) { g.set(n, c); push(c + h(n), n); }
    let best = Infinity, end = null, k = 0;
    while (heap.length && k++ < 40000) {
      const [f, n] = pop(); if (f >= best) break; if (closed.has(n)) continue; closed.add(n);
      const gn = g.get(n);
      if (goal.has(n) && gn + goal.get(n) < best) { best = gn + goal.get(n); end = n; }
      for (const [m, w] of G.adj.get(n) || []) { if (closed.has(m)) continue; const v = gn + w; if (v < (g.get(m) ?? Infinity)) { g.set(m, v); came.set(m, n); push(v + h(m), m); } }
    }
    if (!end) return null;
    const pts = []; for (let n = end, i = 0; n && i < 5000; n = came.get(n), i++) pts.unshift([n.x, n.z]);
    return trim([[from.x, from.z], P(A), ...pts, [bx, bz], [to.x, to.z]]);
  }
  const offRoute = (x, z, pts) => {
    let best = Infinity;
    for (let i = pts.length > 2 ? 2 : 1; i < pts.length; i++) {
      const [ax, az] = pts[i - 1], [bx, bz] = pts[i], dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz || 1;
      const k = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L));
      best = Math.min(best, Math.hypot(ax + dx * k - x, az + dz * k - z));
    }
    return best;
  };
  const lengthOf = (pts) => { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return L; };
  // the route on from (x, z): from the nearest point on its first 300 m, the part behind him dropped
  // (pts[0] is always where he was: the route proper starts at pts[1])
  const onFrom = (pts, x, z) => {
    if (pts.length < 3) return [[x, z], pts[pts.length - 1]];
    let bi = 2, bd = Infinity, bk = 0, run = 0;
    for (let i = 2; i < pts.length && run < 300; i++) {
      const [ax, az] = pts[i - 1], [bx, bz] = pts[i], dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz || 1;
      const k = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L)), d = Math.hypot(ax + dx * k - x, az + dz * k - z);
      if (d < bd) { bd = d; bi = i; bk = k; }
      run += Math.sqrt(L);
    }
    const [ax, az] = pts[bi - 1], [bx, bz] = pts[bi];
    return [[x, z], [ax + (bx - ax) * bk, az + (bz - az) * bk], ...pts.slice(bi)];
  };

  const blips = new Map();
  const now = () => (W.clock ? W.clock.now() : performance.now());
  const dist = (p, q) => Math.hypot(p.x - q.x, p.z - q.z);
  // where the route goes now: the player's own waypoint, else the objective's target (a moving one read afresh)
  const target = () => gps.user || (gps.dest && (gps.dest.follow ? gps.dest.follow() : gps.dest)) || null;
  const named = (t) => (t ? { x: t.x, z: t.z, name: t.name || '' } : null);
  const gps = {
    dest: null, user: null, route: null, length: 0, lastPlan: 0, waypoints: null, _to: null, _foot: null,
    // a destination; via: authored waypoints the route goes through in turn (shore highways are not in the graph)
    set(dest, via = null) { gps.to(dest); gps.waypoints = via; gps.blip('dest', { x: dest.x, z: dest.z, kind: 'dest', edge: true, name: dest.name }); },
    // the route's target alone (the objective changed: the player's own waypoint gives way to it)
    to(t) {
      const same = t && gps.dest && !t.follow && !gps.dest.follow && dist(t, gps.dest) < 1;
      gps.dest = t || null; gps.route = null; gps.lastPlan = 0; gps._to = null;
      if (!same) stall.reset(true);
      if (gps.user) { gps.user = null; ms.userWaypoint = null; gps.unblip('user'); }
      if (!t) { gps.length = 0; ms.waypoint = null; return; }
      // (the walking graph built now, as a step starts, not on a replan as he walks: a phone mustn't stall mid-stride)
      walkGraph();
      const p = t.follow ? t.follow() : t;
      ms.waypoint = p ? { x: p.x, z: p.z, name: t.name || '' } : null;
      gps.update(true);
    },
    clear() { gps.to(null); gps.unblip('dest'); },
    // the objective and its route together (the rule: a new objective, a new route)
    objective(parts, t = null, { blip = true, secs } = {}) {
      W.ui?.objective(parts, secs);
      gps.unblip('dest');
      gps.to(t);
      if (t && !t.follow && blip) gps.blip('dest', { x: t.x, z: t.z, kind: 'dest', edge: true, name: t.name });
    },
    // the player's own waypoint (null takes it away): the route goes there until he does
    setUser(wp) {
      gps.user = wp ? { x: wp.x, z: wp.z, name: wp.name || 'Waypoint' } : null;
      ms.userWaypoint = gps.user;
      gps.route = null; gps.lastPlan = 0; gps._to = null;
      if (gps.user) gps.blip('user', { x: gps.user.x, z: gps.user.z, kind: 'waypoint', edge: true, name: gps.user.name });
      else gps.unblip('user');
      ms.waypoint = named(target());
      gps.update(true);
    },
    blip(id, b) { blips.set(id, { ...blips.get(id), ...b, born: blips.get(id)?.born ?? performance.now() }); },
    unblip(id) { blips.delete(id); },
    get blips() { return blips; },
    update(force = false) {
      const ent = cm.getActiveEntity(), p = ent.position, t0 = performance.now();
      // (there: the player's own waypoint goes, the objective's route comes back)
      if (gps.user && dist(p, gps.user) < 20) { gps.setUser(null); return; }
      const t = target();
      if (!t) { gps.route = null; gps.length = 0; stall.reset(); return; }
      // (headway only counts toward a place that stays put: a car he's chasing comes and goes; a stuck car, any time)
      if (!force) stall.step(!!gps.user || !!(gps.dest && (!gps.dest.follow || gps.dest.still)));
      // (a target on the move, a car he's chasing: planned again as it goes, a few times a second at most)
      const moved = gps._to && dist(t, gps._to) > 8 && t0 - gps.lastPlan > 350;
      // (in or out of the car: planned again at once, the other way's route never kept: a walking route against a
      // one-way street is no route for a car)
      const foot = cm.activeMode !== 'car', swap = gps._foot !== foot;
      if (force || moved || swap || !gps.route || t0 - gps.lastPlan > 1000 || offRoute(p.x, p.z, gps.route) > 25) {
        gps.lastPlan = t0; gps._to = { x: t.x, z: t.z }; gps._foot = foot;
        const r = foot && dist(p, t) < FOOT_LINE ? null : foot ? planWalk({ x: p.x, z: p.z }, t) : plan({ x: p.x, z: p.z }, t, ent.heading);
        // (still on the route it had, a new plan much longer is not taken: crossing a junction straight on, a cross
        // street's lane can look like the way he is going for a moment, and the line must not flick round a block)
        const old = !force && !moved && !swap && r && gps.route && gps.route.length > 2 && offRoute(p.x, p.z, gps.route) < 10 ? onFrom(gps.route, p.x, p.z) : null;
        gps.route = old && lengthOf(r) > lengthOf(old) + 120 ? old : r || [[p.x, p.z], [t.x, t.z]];
        gps.length = lengthOf(gps.route);
      } else if (gps.route) { gps.route = onFrom(gps.route, p.x, p.z); gps.route[gps.route.length - 1] = [t.x, t.z]; gps.length = lengthOf(gps.route); }
    },
    // a 'drive there' objective, the GTA way (see the top)
    // needsCar: false (a place he can walk to: the objective, its blip and the route stay on the place on foot, the car
    // only blipped while he's away from it, one help line framing the car as the quicker way); true (the leg needs the
    // car: a tail, a chase): the old rule, 'Get back in your car.' after the grace, the route to it
    drive({ dest, objective, back = ['Get back in your ', { car: 'blue' }, '.'], onFoot = 150, grace = 2.5, needsCar = false, hintFar = 400 }) {
      const car = W.car, ui = W.ui;
      const carTarget = { follow: () => car.position, name: car.label || "Dan's car" };
      let state = 'drive', outAt = 0, live = true, hinted = false;
      const apply = (s) => {
        const was = state; state = s;
        // (between driving and walking the objective and the route stay as they are: a waypoint of his own too)
        if (s === 'back') { gps.to(carTarget); ui?.objective(back); }
        else if (was === 'back') { gps.to(dest); ui?.objective(objective); }
        if (s === 'drive') gps.unblip('car');
      };
      gps.set(dest); ui?.objective(objective);
      return {
        get state() { return state; },
        step() {
          if (!live) return;
          const inCar = cm.activeMode === 'car', p = cm.getActiveEntity().position, t = now();
          let want = state;
          if (inCar) { outAt = 0; want = 'drive'; }
          else {
            if (!outAt) outAt = t;
            const d = dist(p, dest);
            if (!needsCar) want = 'walk';
            else if (state === 'walk' ? d < onFoot * 1.25 : d < onFoot) want = 'walk';
            else if (t - outAt > grace * 1000) want = 'back';
            else if (state === 'walk') want = 'back';
            // (walking is fine; the car is the quicker way: said once a leg, far out, with the car close by. On a phone
            // the [F] cap reads GET IN, the button that does it)
            if (!needsCar && !hinted && t - outAt > 4000 && d > hintFar && dist(p, car.position) < 80) {
              hinted = true; ui?.help(['On foot works too. Your ', { car: 'blue' }, ' is quicker: walk up to it and press [F].'], 7, { mode: 'foot' });
            }
          }
          if (want !== state) apply(want);
          // (the car on the radar: always while he's asked back to it; walking, once he's 25 m from it)
          if (state === 'back' || (state === 'walk' && dist(p, car.position) > 25)) gps.blip('car', { x: car.position.x, z: car.position.z, kind: 'car', edge: true, name: carTarget.name });
          else gps.unblip('car');
        },
        stop() { live = false; gps.unblip('car'); },
      };
    },
    plan, planWalk, walkGraph,
  };
  // the stall watch (see the top): headway is the route getting shorter; the time is play time (the clock stops in the
  // pause menu, and a cutscene starts it over)
  const stall = (() => {
    let best = Infinity, since = 0, stuckT = 0, lastT = 0, offered = false, noted = false;
    const S = {
      reset(all = false) { best = Infinity; since = now(); stuckT = 0; if (all) { offered = false; noted = false; } },
      step(still = true) {
        const t = now(), dt = Math.min(0.1, Math.max(0, (t - (lastT || t)) / 1000)); lastT = t;
        if (W.cutscene || W.paused || document.body.classList.contains('wg-cine')) { since = t; stuckT = 0; return; }
        if (!since) since = t;
        const L = gps.length || Infinity;
        if (!still || L < best - 25 || L < 40) { best = Math.min(best, L); since = t; }
        const car = W.car, k = cm.keys || {}, inCar = cm.activeMode === 'car';
        // (stuck: the car's own signal when it has one, the one its 'X · Reset car to road' prompt uses: the pedal held,
        // the car going nowhere; else the pedal down with it stood still)
        if (W.carStuck) stuckT = inCar ? W.carStuck() : 0;
        else stuckT = inCar && (k.forward || k.backward) && Math.abs(car?.speed || 0) < 1.2 ? stuckT + dt : Math.max(0, stuckT - dt * 2);
        if (offered) return;
        if (t - since > 50000) S.offer('lost');
        else if (stuckT > 4 && W.recoverCar) S.offer('stuck');
      },
      // the help itself: what fits him now
      offer(why) {
        const ui = W.ui; if (!ui?.offer) return;
        offered = true;
        const inCar = cm.activeMode === 'car', M = W.missions?.active?.(), opts = [];
        if (why === 'lost' || !inCar) opts.push({ key: '1', label: ['Show me the way (the ', { 'yellow line': 'yellow' }, ')'], run: () => S.showWay() });
        if (inCar && W.recoverCar) opts.push({ key: String(opts.length + 1), label: 'Put my car back on the road', run: () => { W.recoverCar?.(); S.reset(); } });
        if (M && W.ui?.pause?.restartCurrent) opts.push({ key: String(opts.length + 1), label: 'Restart the checkpoint', run: () => W.ui.pause.restartCurrent() });
        if (!opts.length) return;
        ui.offer({ title: why === 'stuck' ? 'Stuck?' : 'Need a hand?', note: why === 'stuck' ? 'The car is going nowhere.' : null, options: opts });
        if (!noted && gps.stallNote && why === 'lost') { noted = true; const [from, text] = gps.stallNote; W.sfx?.play?.('buzz', { gain: 0.14, times: 1 }); W.audio?.play?.('phoneBuzz'); ui.dm(from, text, 8); }
      },
      // the way, again: his own waypoint away, the route planned afresh, the objective's line up, the place's blip pulsing
      showWay() {
        if (gps.user) gps.setUser(null);
        gps.update(true);
        const r = W.ui?.recent?.();
        if (r?.objective && W.ui) { const el = document.querySelector('#wg .wg-obj'); if (el) { el.innerHTML = r.objective; el.classList.remove('hide'); setTimeout(() => el.classList.add('hide'), 7000); } }
        for (const [id, b] of blips) if (b.kind === 'dest' || b.kind === 'letter' || b.kind === 'waypoint') blips.set(id, { ...b, born: performance.now(), pulse: 8 });
        W.ui?.brief?.(true);
        S.reset();
      },
      get offered() { return offered; },
    };
    return S;
  })();
  gps.stall = stall; gps.stallNote = null;
  // the player's own waypoint comes from the full map (a click, or 'Set waypoint' on a search hit)
  ms.onWaypoint = (wp) => gps.setUser(wp);
  // the full map's search finds the mission's named places: the route's place and every named blip (once each: the
  // place a letter blip stands on is the same place); a search finds them by their second name too (mapSystem)
  ms.searchExtra = () => {
    const out = [];
    const add = (name, x, z, sub) => {
      if (!name) return;
      const [n, s2] = String(name).split(' · ');
      if (out.some((o) => o.name === n && Math.hypot(o.x - x, o.z - z) < 30)) return;
      out.push({ name: n, sub: s2 || sub || 'Mission', x, z, kind: 'Mission' });
    };
    if (gps.dest && !gps.dest.follow) add(gps.dest.name, gps.dest.x, gps.dest.z);
    for (const b of blips.values()) {
      if (b.kind === 'waypoint' || b.kind === 'enemy') continue;
      add(b.name || (b.kind === 'letter' ? `Mission ${b.letter}` : ''), b.x, b.z, b.kind === 'letter' ? 'A new mission' : '');
    }
    return out;
  };

  /* --------------------------------------------------------- the drawing -- */
  function drawRoute(ctx, toX, toY, width) {
    if (!gps.route) return;
    const col = gps.user ? PURPLE : YELLOW;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath(); gps.route.forEach(([x, z], i) => (i ? ctx.lineTo(toX(x), toY(z)) : ctx.moveTo(toX(x), toY(z))));
    ctx.strokeStyle = HALO; ctx.lineWidth = width + 4; ctx.stroke();
    ctx.strokeStyle = col; ctx.lineWidth = width; ctx.stroke();
  }
  // the next turn's corner on the radar: a white chevron pointing the way out of it
  function drawTurnMark(ctx, x, y, ux, uz) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(Math.atan2(uz, ux));
    ctx.beginPath(); ctx.moveTo(-3, -4.5); ctx.lineTo(2.5, 0); ctx.lineTo(-3, 4.5);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.strokeStyle = HALO; ctx.lineWidth = 5; ctx.stroke();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.2; ctx.stroke();
    ctx.restore();
  }
  // (a blip's pulse in its own colour: a green thing to pick up pulses green)
  const PULSE = { object: '74, 222, 128', enemy: '239, 68, 68', friend: '108, 184, 255', car: '108, 184, 255', laptop: '108, 184, 255', waypoint: '199, 125, 255' };
  function drawLabel(ctx, x, y, text) {
    ctx.font = '700 13px "Barlow Condensed", system-ui'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.lineJoin = 'round';
    ctx.strokeStyle = HALO; ctx.lineWidth = 3; ctx.strokeText(text, x + 12, y + 4);
    ctx.fillStyle = '#ffffff'; ctx.fillText(text, x + 12, y + 4);
  }
  function drawBlip(ctx, x, y, b, r, t) {
    const pulse = b.pulse && (performance.now() - b.born) / 1000 < b.pulse;
    if (pulse) { const k = (t % 1100) / 1100; ctx.fillStyle = `rgba(${PULSE[b.kind] || '255, 201, 60'}, ${0.5 * (1 - k)})`; ctx.beginPath(); ctx.arc(x, y, r + 4 + k * 12, 0, Math.PI * 2); ctx.fill(); }
    const disc = (c, rr = r) => { ctx.fillStyle = HALO; ctx.beginPath(); ctx.arc(x, y, rr + 2, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2); ctx.fill(); };
    switch (b.kind) {
      case 'dest': disc(YELLOW); ctx.fillStyle = HALO; ctx.beginPath(); ctx.arc(x, y, r * 0.38, 0, Math.PI * 2); ctx.fill(); break;
      case 'enemy': disc(RED, r * 0.6); break;
      case 'friend': disc(BLUE, r * 0.7); break;
      case 'object': disc(GREEN, r * 0.7); break;
      case 'car': {
        disc(BLUE, r);
        ctx.fillStyle = '#0B1220'; ctx.fillRect(x - r * 0.55, y - r * 0.18, r * 1.1, r * 0.42); ctx.fillRect(x - r * 0.32, y - r * 0.42, r * 0.64, r * 0.3);
        break;
      }
      case 'laptop': {
        // (a laptop, open: its screen over its base)
        disc(BLUE, r);
        ctx.fillStyle = '#0B1220'; ctx.fillRect(x - r * 0.42, y - r * 0.46, r * 0.84, r * 0.58); ctx.fillRect(x - r * 0.6, y + r * 0.18, r * 1.2, r * 0.2);
        ctx.fillStyle = BLUE; ctx.fillRect(x - r * 0.3, y - r * 0.34, r * 0.6, r * 0.36);
        break;
      }
      // the player's own waypoint: GTA's purple flag
      case 'waypoint': {
        disc(PURPLE, r);
        ctx.fillStyle = '#fff'; ctx.fillRect(x - r * 0.32, y - r * 0.55, r * 0.14, r * 1.1);
        ctx.beginPath(); ctx.moveTo(x - r * 0.2, y - r * 0.55); ctx.lineTo(x + r * 0.5, y - r * 0.32); ctx.lineTo(x - r * 0.2, y - r * 0.08); ctx.closePath(); ctx.fill();
        break;
      }
      case 'letter': {
        disc(YELLOW, r * 1.15);
        ctx.fillStyle = '#0B0D12'; ctx.font = `800 ${Math.round(r * 1.5)}px "Barlow Condensed", system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(b.letter || '?', x, y + 1); ctx.textBaseline = 'alphabetic';
        break;
      }
    }
  }
  function drawArrow(ctx, heading, tipY, halfWidth, tailY) {
    ctx.save(); ctx.rotate(-heading + Math.PI);
    ctx.beginPath(); ctx.moveTo(0, tipY); ctx.lineTo(halfWidth, tailY); ctx.lineTo(0, tailY * 0.45); ctx.lineTo(-halfWidth, tailY); ctx.closePath();
    ctx.lineJoin = 'round'; ctx.strokeStyle = HALO; ctx.lineWidth = 3; ctx.stroke(); ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.restore();
  }
  // the radar: after the city's layers, the route, the blips (mission ones held at its edge), the arrow again on top.
  // On foot in a mission it zooms in (a car parked 20 m off is a blip of its own, not one under the arrow); it eases
  // back out in the car. (The city's radar eases its own scale 8% a frame toward its target: set ahead of it so it
  // lands where ours is.)
  // the turn-by-turn cue (turns.js), stepped with the radar's draw (or the full map's, which hides it)
  const turns = createTurns(W, gps); gps.turns = turns;
  const miniOrig = ms.renderMinimap.bind(ms);
  const GROUND = ms.miniScale || 0.32, FOOT = 1.0;
  let zoom = GROUND;
  ms.renderMinimap = function () {
    const wp = ms.waypoint; if (gps.dest || gps.user || blips.size) ms.waypoint = null;
    const ground = (cm.getActiveEntity().position.y || 0) < 25;
    if (ground && (gps.dest || gps.user || blips.size)) {
      zoom += ((cm.activeMode === 'person' ? FOOT : GROUND) - zoom) * 0.06;
      ms.miniScale = (zoom - 0.08 * GROUND) / 0.92;
    } else zoom = ms.miniScale;
    miniOrig(); ms.waypoint = wp;
    turns.step();
    if (!gps.dest && !gps.user && !blips.size) return;
    const cv = ms.miniCanvas, ctx = ms.miniCtx; if (!cv || !ctx || !cv.offsetParent) return;
    const w = cv.clientWidth, h = cv.clientHeight, dpr = Math.min(window.devicePixelRatio || 1, 2), s = ms.miniScale;
    const ent = cm.getActiveEntity(), px = ent.position.x, pz = ent.position.z, t = performance.now();
    ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, dpr * w * 0.5, dpr * h * 0.5);
    const toX = (x) => (x - px) * s, toY = (z) => (z - pz) * s;
    drawRoute(ctx, toX, toY, 5);
    const tc = turns.cue;
    if (tc && tc.kind === 'turn') { const x = toX(tc.at[0]), y = toY(tc.at[1]); if (Math.abs(x) < w * 0.5 - 8 && Math.abs(y) < h * 0.5 - 8) drawTurnMark(ctx, x, y, tc.ux, tc.uz); }
    const mx = w * 0.5 - 9, my = h * 0.5 - 9;
    for (const b of blips.values()) {
      let x = toX(b.x), y = toY(b.z);
      const out = Math.abs(x) > mx || Math.abs(y) > my;
      if (out) { if (!b.edge) continue; const k = Math.min(mx / Math.abs(x || 1e-6), my / Math.abs(y || 1e-6)); x *= k; y *= k; }
      drawBlip(ctx, x, y, b, b.kind === 'enemy' ? 5 : 6, t);
    }
    drawArrow(ctx, ent.heading, -9, 6.5, 7);
    // the distance to go, under it all
    if ((gps.dest || gps.user) && gps.length) {
      const mi = gps.length / 1609.34, txt = mi >= 0.1 ? `${mi.toFixed(mi < 10 ? 2 : 1)} mi` : `${Math.round(gps.length)} m`;
      ctx.font = '700 12px "Barlow Condensed", system-ui'; ctx.textAlign = 'center';
      const tw = ctx.measureText(txt).width + 12;
      ctx.fillStyle = 'rgba(8, 10, 14, 0.75)'; ctx.fillRect(-tw / 2, h * 0.5 - 22, tw, 16);
      ctx.fillStyle = gps.user ? PURPLE : YELLOW; ctx.fillText(txt, 0, h * 0.5 - 10);
    }
    ctx.restore();
  };
  // the full map
  const fullOrig = ms.renderFullMap.bind(ms);
  ms.renderFullMap = function () {
    const wp = ms.waypoint; if (gps.dest || gps.user || blips.size) ms.waypoint = null;
    fullOrig(); ms.waypoint = wp;
    turns.step();
    if ((!gps.dest && !gps.user && !blips.size) || !ms.isFullMapOpen || !ms.fullCtx) return;
    const ctx = ms.fullCtx, dpr = ms.fullDpr || 1, { w, h } = ms.fullSize(), s = ms.viewZoom, cx = ms.viewCenterX, cz = ms.viewCenterZ;
    const ent = cm.getActiveEntity(), t = performance.now();
    ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, dpr * w * 0.5, dpr * h * 0.5);
    const toX = (x) => (x - cx) * s, toY = (z) => (z - cz) * s;
    drawRoute(ctx, toX, toY, 6);
    for (const b of blips.values()) {
      const x = toX(b.x), y = toY(b.z);
      drawBlip(ctx, x, y, b, 8, t);
      if (b.label && b.name) drawLabel(ctx, x, y, String(b.name).split(' · ')[0]);
    }
    ctx.translate(toX(ent.position.x), toY(ent.position.z)); drawArrow(ctx, ent.heading, -11, 7.5, 8);
    ctx.restore();
  };
  return gps;
}
