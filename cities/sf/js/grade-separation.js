(function () {
// js/grade-separation.js
// Roads off the ground (P3.3):
// - Tunnels (Broadway, Stockton): the road network's tunnel edges (road-network.js spans(): straight between the portals'
//   ground, under the hill, which isn't cut) get a dark box bore with ceiling lights and lane lines, masonry portals and
//   wall colliders. AI traffic drives them; pedestrians don't.
// - Street bridges over the water (Mission Creek's 3rd and 4th St bridges; the bare-earth DEM has none): a deck between
//   the banks with parapets and piers down into the water.
// - Freeways and their ramps (I-80, US-101, I-280): decks on columns every COLUMN_STEP m. OSM says which stretches are
//   bridges and their `layer`, not how high: the deck stands DECK_H_ESTIMATE[layer] m over the ground (an estimate,
//   PLAN.md P3-3), eased along the road. Visual only for the player (they drive under them); highway traffic
//   (traffic.js createHighwayTraffic) runs on the main lines. On the Bay Bridge the deck is the bridge's
//   (sf-bridges.js bridgeDeckAt, P5.2): westbound on the upper deck, eastbound on the lower, the approach climbing to it.
// Returns { group, colliders, highwayLanes, floorAt, roofAt, carveAt }: floorAt(x, z, y) is the tunnel floor or bridge
// deck at (x, z) for something at height y (null: the ground), roofAt(x, z, y) a tunnel's ceiling over it (Infinity:
// none), carveAt(x, z) how low the terrain mesh dips at a portal (null: not at all).

const { THREE, Terrain } = window.NYC;
const { createRoadSurfaceMaterial, createMarbleAshlarMaterial, boreY, edgeArc } = window.NYC;
const bridgeDeckAt = (x, z, upper) => (window.NYC.bridgeDeckAt ? window.NYC.bridgeDeckAt(x, z, upper) : null);

const STEP = 2; // metres between floor height samples (and geometry stations, x2)
const LANE_HALF = 1.75;
const WALKWAY = 0.9; // tunnel ledge / bridge sidewalk beside the outer lanes
const BORE_H = 5.2; // tunnel: floor to ceiling (Bush St crosses over the Stockton Tunnel's portal 5.7 m above its road)
const PORTAL_T = 1.4; // portal headwall thickness
const LIGHT_STEP = 8;
const PARAPET_H = 1.0;
const PARAPET_MIN_DROP = 1.0; // m: a package deck's parapet stands only where the ground beside it is this far below
const DECK_T = 1.4; // deck thickness
const DECK_H_ESTIMATE = [0, 8, 15, 22]; // m over the ground by OSM layer (0 at grade): an ESTIMATE, the data has no heights
const DECK_GRADE = 0.05; // freeways climb at most 5% between their estimated heights
const FREEWAY_LANE = 3.6;
const COLUMN_STEP = 30;
const CARVE_SIDE = 2.4; // m beside a bore's walls the terrain mesh dips with it at the portals (a 2 m cell and more)
const FLOOR_BAND = 2.5; // a tunnel floor counts for something less than this above it; a deck for something above it less this

function buildGradeSeparation(scene, network) {
  const group = new THREE.Group();
  group.name = 'SFGradeSeparation';
  const colliders = [];
  const floors = []; // { kind, x0, z0, dx, dz, rx, rz, t0, t1, L, R, ys }
  const geo = { road: [], wall: [], ceiling: [], masonry: [], concrete: [], light: [], paint: [] };
  const ground = (x, z) => Terrain.groundAt(x, z);
  // A surface street's roadway within r m of (x, z)
  const onStreet = (x, z, r) => network.edges.some((e) => {
    if (e.bore) return false;
    const t = (x - e.x0) * e.dx + (z - e.z0) * e.dz;
    return t > -r && t < e.span + r && Math.abs((x - e.x0) * e.rx + (z - e.z0) * e.rz) < e.half + r;
  });

  // A quad from four [x, y, z] corners (counter-clockwise seen from the side it faces)
  function quad(list, a, b, c, d) {
    list.push([...a, ...b, ...c, ...a, ...c, ...d]);
  }
  // ... and seen from the other side
  const back = (list, a, b, c, d) => quad(list, d, c, b, a);
  // An oriented box: centre (cx, cz), from y0 to y1, `along` m along (dx, dz), `across` m across
  function box(list, cx, cz, dx, dz, along, across, y0, y1) {
    const ax = (dx * along) / 2, az = (dz * along) / 2, bx = (-dz * across) / 2, bz = (dx * across) / 2;
    const c = [[cx - ax - bx, cz - az - bz], [cx + ax - bx, cz + az - bz], [cx + ax + bx, cz + az + bz], [cx - ax + bx, cz - az + bz]];
    for (let i = 0; i < 4; i++) {
      const [p, q] = [c[i], c[(i + 1) % 4]];
      back(list, [p[0], y0, p[1]], [q[0], y0, q[1]], [q[0], y1, q[1]], [p[0], y1, p[1]]);
    }
    back(list, [c[0][0], y1, c[0][1]], [c[1][0], y1, c[1][1]], [c[2][0], y1, c[2][1]], [c[3][0], y1, c[3][1]]);
    back(list, [c[3][0], y0, c[3][1]], [c[2][0], y0, c[2][1]], [c[1][0], y0, c[1][1]], [c[0][0], y0, c[0][1]]);
  }
  // An oriented box collider (the controllers' OBB frame: local z along (dx, dz))
  function collider(cx, cz, dx, dz, along, across, minY, maxY) {
    const hz = along / 2, hx = across / 2;
    const ex = Math.abs(dz) * hx + Math.abs(dx) * hz, ez = Math.abs(dx) * hx + Math.abs(dz) * hz;
    colliders.push({ minX: cx - ex, maxX: cx + ex, minZ: cz - ez, maxZ: cz + ez, minY, maxY, obb: { cx, cz, hx, hz, cs: dz, sn: dx } });
  }

  // 1. Tunnels and street bridges, per road: an edge with the edge running the other way beside it (its partner) shares
  //    one bore or deck, as wide as both their lanes
  const done = new Set();
  const lateral = (e, x, z) => (x - e.x0) * e.rx + (z - e.z0) * e.rz;
  const discAt = new Map(); // (package decks) node -> { x, z, y, r, n }: deckEnds()
  let linkOnly = 0; // (package decks built from the road graph's links alone: linkDecks())
  const parapetQ = []; // (package decks' parapet pieces, placed by parapets() once every deck stands)
  const columnQ = []; // (package decks' column stations, placed by columns() once every deck stands)
  let bents = 0;
  const MERGE_GAP = 14;
  const branchy = (n) => (n.in || []).length + (n.out || []).length > 4 || new Set([...(n.in || []), ...(n.out || [])].map((x) => x.name)).size > 1;
  for (const e of network.edges) {
    if (!e.bore || done.has(e)) continue;
    done.add(e);
    const partner = network.edges.find((f) => f.bore && !done.has(f) && f.name === e.name && f.bore.kind === e.bore.kind &&
      e.dx * f.dx + e.dz * f.dz < -0.95 && Math.abs(lateral(e, f.x0, f.z0)) < 8 &&
      Math.abs((f.x0 - e.x0) * e.dx + (f.z0 - e.z0) * e.dz - e.span) < 12 &&
      // (a package's decks: only one at the same height, never the deck stacked over it)
      (e.bore.kind !== 'deck' || Math.abs(boreY(e.bore, (e.bore.a0 + e.bore.a1) / 2) - boreY(f.bore, (f.bore.a0 + f.bore.a1) / 2)) < 2));
    if (partner) done.add(partner);
    const lanes = e.lanes.slice();
    if (partner) for (const o of partner.lanes) lanes.push(lateral(e, partner.x0, partner.z0) - o);
    const L = Math.min(...lanes) - LANE_HALF - WALKWAY;
    const R = Math.max(...lanes) + LANE_HALF + WALKWAY;
    // the stretch of e off the ground: arcs along its link at its two ends, the span [p0, p1] between them
    const b = e.bore;
    const s0 = Math.hypot(e.sx - e.x0, e.sz - e.z0);
    const tAt = (u) => ((u - b.a0) / (b.a1 - b.a0 || 1)) * e.span;
    const t0 = Math.max(0, Math.min(tAt(b.p0), tAt(b.p1)));
    const t1 = Math.min(e.span, Math.max(tAt(b.p0), tAt(b.p1)));
    if (t1 - t0 < 2) continue;
    // floor heights along the edge from its start node (the road's own profile, clamped to the edge's stop lines)
    const n = Math.ceil((t1 - t0) / STEP);
    const ys = new Float32Array(n + 1);
    for (let k = 0; k <= n; k++) {
      const t = Math.min(t1, t0 + k * STEP);
      ys[k] = boreY(b, edgeArc(e, t - s0)) ?? ground(e.x0 + e.dx * t, e.z0 + e.dz * t);
    }
    const seg = { kind: b.kind, x0: e.x0, z0: e.z0, dx: e.dx, dz: e.dz, rx: e.rx, rz: e.rz, t0, t1, L, R, ys };
    floors.push(seg);
    if (b.kind === 'tunnel') buildBore(seg, e, partner);
    else buildDeck(seg, e, partner);
    if (b.kind === 'deck') deckEnds(seg, e, partner);
  }
  // (package decks the traffic network left out: a freeway interchange whose ramps end at the data's edge or in a
  // dropped tunnel is no through route for traffic, but its decks still stand and the player can drive them. Built
  // from the road graph's links (field [12]) wherever no kept edge's floor already covers the link)
  linkDecks();
  parapets();
  columns();
  // (a package deck's columns: never through another deck or road surface under it. Each stands under its deck's
  // middle every COLUMN_STEP m where the deck is over 3.5 m up (over water: a pier the deck's width down into it),
  // moved across the deck and a few metres along it to the nearest place clear of every street and deck floor below;
  // where a lower deck or road fills the whole width (a stacked deck: Fort Pitt's two), a BENT: two legs just clear of
  // it either side under a cap beam across, when the beam clears the floors under it by CAP_CLEAR m; else left out)
  function columns() {
    if (!columnQ.length) return;
    const C = 32, grid = new Map(), surf = floors.filter((f) => f.kind === 'deck' || f.kind === 'disc');
    for (const f of surf) {
      let x0, x1, z0, z1;
      if (f.kind === 'disc') { x0 = f.x - f.r; x1 = f.x + f.r; z0 = f.z - f.r; z1 = f.z + f.r; } else {
        const xs = [], zs = [];
        for (const t of [f.t0, f.t1]) for (const o of [f.L, f.R]) { xs.push(f.x0 + f.dx * t + f.rx * o); zs.push(f.z0 + f.dz * t + f.rz * o); }
        x0 = Math.min(...xs); x1 = Math.max(...xs); z0 = Math.min(...zs); z1 = Math.max(...zs);
      }
      for (let i = Math.floor((x0 - 1) / C); i <= Math.floor((x1 + 1) / C); i++) {
        for (let j = Math.floor((z0 - 1) / C); j <= Math.floor((z1 + 1) / C); j++) {
          const k = i + ',' + j;
          if (!grid.has(k)) grid.set(k, []);
          grid.get(k).push(f);
        }
      }
    }
    // the highest floor (deck or disc) other than seg within PAD m of (x, z) standing under `top` (null: none)
    const PAD = 0.9;
    const floorUnder = (seg, x, z, top) => {
      let best = null;
      for (const f of grid.get(Math.floor(x / C) + ',' + Math.floor(z / C)) || []) {
        if (f === seg) continue;
        let y;
        if (f.kind === 'disc') {
          if (Math.hypot(x - f.x, z - f.z) > f.r + PAD) continue;
          y = f.y;
        } else {
          const px = x - f.x0, pz = z - f.z0, t = px * f.dx + pz * f.dz, o = px * f.rx + pz * f.rz;
          if (t < f.t0 - PAD || t > f.t1 + PAD || o < f.L - PAD || o > f.R + PAD) continue;
          y = P(f, Math.min(f.t1, Math.max(f.t0, t)), 0)[1];
        }
        if (y < top && (best === null || y > best)) best = y;
      }
      return best;
    };
    const CAP_CLEAR = 4.6, CAP_T = 1.0, W = 1.6;
    const clear = (seg, x, z, top) => !onStreet(x, z, PAD) && floorUnder(seg, x, z, top) === null;
    const column = (seg, px, pz, bottom, top) => {
      box(geo.concrete, px, pz, seg.dx, seg.dz, W, W, bottom - 0.5, top);
      collider(px, pz, seg.dx, seg.dz, W, W, bottom - 1, top);
    };
    for (const { seg, t } of columnQ) {
      const mid = (seg.L + seg.R) / 2, h = (seg.R - seg.L) / 2;
      const [cx, y, cz] = P(seg, t, mid);
      const wet = Terrain.heightAt(cx, cz) <= Terrain.waterLevel + 0.05;
      if (!wet && y - ground(cx, cz) < 3.5) continue;
      const top = y - DECK_T;
      // over water: the full-width pier where nothing stands under the deck
      if (wet && [seg.L + 0.5, mid, seg.R - 0.5].every((o) => { const [x, , z] = P(seg, t, o); return floorUnder(seg, x, z, top) === null; })) {
        box(geo.concrete, cx, cz, seg.dx, seg.dz, W, seg.R - seg.L - 1, Terrain.waterLevel - 2, top);
        continue;
      }
      const bottomAt = (x, z) => (Terrain.heightAt(x, z) <= Terrain.waterLevel + 0.05 ? Terrain.waterLevel - 2 : ground(x, z));
      // one column: across the deck, then a few metres along it
      let spot = null;
      for (const dt of [0, -3, 3, -6, 6, -9, 9]) {
        const ta = t + dt;
        if (ta < seg.t0 + 1 || ta > seg.t1 - 1) continue;
        for (let k = 0; spot === null && k <= 4 * h; k++) {
          const c = mid + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.5;
          if (Math.abs(c - mid) > h - 0.8) continue;
          const [x, py, z] = P(seg, ta, c);
          if (clear(seg, x, z, py - DECK_T)) spot = [x, z, py - DECK_T];
        }
        if (spot) break;
      }
      if (spot) { column(seg, spot[0], spot[1], bottomAt(spot[0], spot[1]), spot[2]); continue; }
      // a bent: the nearest clear place each side of the floors under the deck's middle, at most 10 m out from its edge
      let lo = null, hi = null, under = -Infinity;
      for (let o = mid; o >= seg.L - 10; o -= 0.5) {
        const [x, , z] = P(seg, t, o);
        const fu = floorUnder(seg, x, z, top);
        if (fu === null && !onStreet(x, z, PAD)) { lo = o; break; }
        if (fu !== null) under = Math.max(under, fu);
      }
      for (let o = mid; o <= seg.R + 10; o += 0.5) {
        const [x, , z] = P(seg, t, o);
        const fu = floorUnder(seg, x, z, top);
        if (fu === null && !onStreet(x, z, PAD)) { hi = o; break; }
        if (fu !== null) under = Math.max(under, fu);
      }
      if (lo === null || hi === null || !(top - CAP_T - under >= CAP_CLEAR)) continue;
      for (const o of [lo, hi]) { const [x, , z] = P(seg, t, o); column(seg, x, z, bottomAt(x, z), top); }
      const [ax, , az] = P(seg, t, lo), [bx, , bz] = P(seg, t, hi);
      box(geo.concrete, (ax + bx) / 2, (az + bz) / 2, seg.dx, seg.dz, W, hi - lo + W, top - CAP_T, top);
      bents++;
    }
  }
  // (a package deck's parapet stands where its edge drops away: not where another deck's floor carries on beside it at
  // its height, as where two decks merge, part or run side by side (the Stack's ramps): there it would wall the lanes)
  function parapets() {
    if (!parapetQ.length) return;
    const C = 32, grid = new Map(), decks = floors.filter((f) => f.kind === 'deck');
    for (const f of decks) {
      const xs = [], zs = [];
      for (const t of [f.t0, f.t1]) for (const o of [f.L, f.R]) { xs.push(f.x0 + f.dx * t + f.rx * o); zs.push(f.z0 + f.dz * t + f.rz * o); }
      for (let i = Math.floor(Math.min(...xs) / C); i <= Math.floor(Math.max(...xs) / C); i++) {
        for (let j = Math.floor(Math.min(...zs) / C); j <= Math.floor(Math.max(...zs) / C); j++) {
          const k = i + ',' + j;
          if (!grid.has(k)) grid.set(k, []);
          grid.get(k).push(f);
        }
      }
    }
    const beside = (seg, x, z, y) => (grid.get(Math.floor(x / C) + ',' + Math.floor(z / C)) || []).some((f) => {
      if (f === seg) return false;
      const px = x - f.x0, pz = z - f.z0, t = px * f.dx + pz * f.dz, o = px * f.rx + pz * f.rz;
      if (t < f.t0 || t > f.t1 || o < f.L || o > f.R) return false;
      return Math.abs(P(f, t, o)[1] - y) < 1.2;
    });
    for (const { seg, ta, tb, tm, o, len, out } of parapetQ) {
      const [cx, y, cz] = P(seg, tm, o);
      const [bx, , bz] = P(seg, tm, o + out * 0.9);
      if (beside(seg, bx, bz, y)) continue;
      // (nor where the deck is still on the ground beside it: a deck's ends at grade, where the road comes onto it)
      if (y - ground(bx, bz) < PARAPET_MIN_DROP) continue;
      // (a package deck's parapet follows its slope: sloped faces, not a stair of boxes)
      const o0 = o - 0.15, o1 = o + 0.15;
      quad(geo.concrete, P(seg, ta, o1), P(seg, tb, o1), P(seg, tb, o1, PARAPET_H), P(seg, ta, o1, PARAPET_H));
      quad(geo.concrete, P(seg, tb, o0), P(seg, ta, o0), P(seg, ta, o0, PARAPET_H), P(seg, tb, o0, PARAPET_H));
      quad(geo.concrete, P(seg, ta, o0, PARAPET_H), P(seg, ta, o1, PARAPET_H), P(seg, tb, o1, PARAPET_H), P(seg, tb, o0, PARAPET_H));
      collider(cx, cz, seg.dx, seg.dz, len + 0.5, 0.3, y - 1, y + PARAPET_H);
    }
  }
  function linkDecks() {
    const RG = window.NYC.GEO.roadGraph;
    if (!RG || !RG.links || !window.NYC.deckOf || !floors.some((f) => f.kind === 'deck') && !RG.links.some((l) => Array.isArray(l[12]))) return;
    const covered = (x, z, y) => floors.some((f) => f.kind === 'deck' && (() => {
      const px = x - f.x0, pz = z - f.z0, t = px * f.dx + pz * f.dz, o = px * f.rx + pz * f.rz;
      if (t < f.t0 - 1 || t > f.t1 + 1 || o < f.L - 1 || o > f.R + 1) return false;
      const k = Math.min(f.ys.length - 1, Math.max(0, Math.round((t - f.t0) / STEP)));
      return Math.abs(f.ys[k] - y) < 1.5;
    })());
    const nodeOf = new Map();
    const node = (x, z) => { const k = Math.round(x * 2) + ',' + Math.round(z * 2); if (!nodeOf.has(k)) nodeOf.set(k, { x, z, in: [], out: [] }); return nodeOf.get(k); };
    for (let li = 0; li < RG.links.length; li++) {
      const [a, b, ni, w, , dir, inner, flags, , , lf, lb, elev] = RG.links[li];
      if (!Array.isArray(elev) || elev.length < 3 || flags & (2 | 8 | 16)) continue; // (a tunnel link's profile: no deck)
      const pts = [{ x: RG.nodes[2 * a], z: RG.nodes[2 * a + 1] }];
      for (let k = 0; k < inner.length; k += 2) pts.push({ x: inner[k], z: inner[k + 1] });
      pts.push({ x: RG.nodes[2 * b], z: RG.nodes[2 * b + 1] });
      const bore = window.NYC.deckOf({ pts, elev });
      if (!bore) continue;
      // (left out only where its middle has a floor at its height across its whole width: a two-way link whose one
      // direction is on the traffic network and the other not has only half its width floored by the kept edge)
      const half = Math.max(2.5, (w || 7) / 2);
      const um = (bore.p0 + bore.p1) / 2, pm = window.NYC.linkPoint(bore, um), pn = window.NYC.linkPoint(bore, Math.min(bore.p1, um + 1));
      const ml = Math.hypot(pn.x - pm.x, pn.z - pm.z) || 1, mx = -(pn.z - pm.z) / ml, mz = (pn.x - pm.x) / ml, ym = boreY(bore, um);
      if ([0, -(half - 1), half - 1].every((o) => covered(pm.x + mx * o, pm.z + mz * o, ym))) continue;
      const n = Math.max(1, dir !== 0 ? Math.max(lf, lb, 1) : (lf > 0 ? lf : 1) + (lb > 0 ? lb : 1));
      const nl = Math.min(n, Math.max(1, Math.floor((2 * half - 1) / 3)));
      const lanes = Array.from({ length: nl }, (_, k) => (k - (nl - 1) / 2) * Math.min(3.4, (2 * half - 1) / nl));
      let u = 0;
      for (let k = 0; k + 1 < pts.length; k++) {
        const p = pts[k], q = pts[k + 1], span = Math.hypot(q.x - p.x, q.z - p.z);
        const u0 = u, u1 = u + span;
        u = u1;
        if (span < 0.5 || u1 < bore.p0 || u0 > bore.p1) continue;
        const dx = (q.x - p.x) / span, dz = (q.z - p.z) / span;
        const t0 = Math.max(0, bore.p0 - u0), t1 = Math.min(span, bore.p1 - u0);
        if (t1 - t0 < 1) continue;
        const m = Math.ceil((t1 - t0) / STEP), ys = new Float32Array(m + 1);
        for (let i = 0; i <= m; i++) ys[i] = boreY(bore, u0 + Math.min(t1, t0 + i * STEP));
        const L = -half, R = half;
        const e = { name: RG.names[ni], lanes, from: node(p.x, p.z), to: node(q.x, q.z), span, x0: p.x, z0: p.z, dx, dz, rx: -dz, rz: dx };
        const seg = { kind: 'deck', x0: p.x, z0: p.z, dx, dz, rx: -dz, rz: dx, t0, t1, L, R, ys, linkOnly: true };
        floors.push(seg);
        buildDeck(seg, e, null);
        deckEnds(seg, e, null);
        linkOnly++;
      }
    }
  }
  for (const [, d] of [...discAt].sort((p, q) => p[1].x - q[1].x || p[1].z - q[1].z)) {
    floors.push({ kind: 'disc', x: d.x, z: d.z, r: d.r, y: d.y });
    const N = 16;
    for (let i = 0; i < N; i++) {
      const a0 = (i / N) * 2 * Math.PI, a1 = ((i + 1) / N) * 2 * Math.PI;
      const p0 = [d.x + Math.cos(a0) * d.r, d.z + Math.sin(a0) * d.r], p1 = [d.x + Math.cos(a1) * d.r, d.z + Math.sin(a1) * d.r];
      geo.road.push([d.x, d.y - 0.01, d.z, p1[0], d.y - 0.01, p1[1], p0[0], d.y - 0.01, p0[1]]);
      geo.concrete.push([d.x, d.y - DECK_T, d.z, p0[0], d.y - DECK_T, p0[1], p1[0], d.y - DECK_T, p1[1]]);
    }
  }

  // A package deck's ends at its graph nodes: floor DISCS at every node where a deck edge stands off the ground (graph
  // nodes and the shape stations at bends alike: the straight floors leave a wedge open on the outside of each bend, and
  // the junction's curves run between them), radius the widest half width there + 1 m
  function deckEnds(seg, e, partner) {
    for (const [node, t] of [[e.from, 0], [e.to, e.span]]) {
      if (t < seg.t0 - 1 || t > seg.t1 + 1) continue;
      const [, y] = P(seg, Math.min(seg.t1, Math.max(seg.t0, t)), 0);
      if (y - ground(node.x, node.z) < 0.6) continue;
      const r = Math.max(-seg.L, seg.R) + 1;
      const d = discAt.get(node);
      if (!d) discAt.set(node, { x: node.x, z: node.z, y, r, n: 1 });
      else { d.r = Math.max(d.r, r); d.y = (d.y * d.n + y) / (d.n + 1); d.n++; }
    }
  }
  // The point t m along a span's edge from its start node, o m to its right, dy m over its floor
  function P(seg, t, o, dy = 0) {
    const k = Math.min(seg.ys.length - 1, Math.max(0, (t - seg.t0) / STEP));
    const i = Math.min(seg.ys.length - 2, Math.floor(k));
    const y = i < 0 ? seg.ys[0] : seg.ys[i] + (seg.ys[i + 1] - seg.ys[i]) * (k - i);
    return [seg.x0 + seg.dx * t + seg.rx * o, y + dy, seg.z0 + seg.dz * t + seg.rz * o];
  }
  // stations along a span every 2 x STEP m
  function stations(seg) {
    const out = [];
    for (let t = seg.t0; t < seg.t1; t += 2 * STEP) out.push(t);
    out.push(seg.t1);
    return out;
  }
  // lane lines on a floor: dashed white between lanes going the same way, double yellow between the two directions
  function laneLines(seg, e, partner) {
    const line = (o, w, col, dash) => {
      for (let t = seg.t0 + 1; t < seg.t1 - 1; t += dash ? 12 : 4) {
        const len = Math.min(dash ? 3 : 4, seg.t1 - 1 - t);
        const a = P(seg, t, o - w / 2, 0.03), b = P(seg, t + len, o - w / 2, 0.03), c = P(seg, t + len, o + w / 2, 0.03), d = P(seg, t, o + w / 2, 0.03);
        geo.paint.push({ tri: [...a, ...d, ...c, ...a, ...c, ...b], col });
      }
    };
    const WHITE = [0.86, 0.86, 0.82], YELLOW = [0.85, 0.66, 0.12];
    for (let k = 0; k + 1 < e.lanes.length; k++) line((e.lanes[k] + e.lanes[k + 1]) / 2, 0.13, WHITE, true);
    if (partner) {
      const back = partner.lanes.map((o) => lateral(e, partner.x0, partner.z0) - o).sort((p, q) => p - q);
      for (let k = 0; k + 1 < back.length; k++) line((back[k] + back[k + 1]) / 2, 0.13, WHITE, true);
      const mid = (Math.min(...e.lanes) + Math.max(...back)) / 2;
      line(mid - 0.12, 0.1, YELLOW, false);
      line(mid + 0.12, 0.1, YELLOW, false);
    }
  }

  // A tunnel bore: floor, walls and ceiling facing in (seen from outside where the hill doesn't cover them: drawn both
  // sides), lights along the ceiling, wall colliders, and a masonry portal at each end
  function buildBore(seg, e, partner) {
    const st = stations(seg);
    for (let i = 0; i + 1 < st.length; i++) {
      const [ta, tb] = [st[i], st[i + 1]];
      quad(geo.road, P(seg, ta, seg.L), P(seg, ta, seg.R), P(seg, tb, seg.R), P(seg, tb, seg.L));
      quad(geo.wall, P(seg, ta, seg.R), P(seg, ta, seg.R, BORE_H), P(seg, tb, seg.R, BORE_H), P(seg, tb, seg.R));
      quad(geo.wall, P(seg, tb, seg.L), P(seg, tb, seg.L, BORE_H), P(seg, ta, seg.L, BORE_H), P(seg, ta, seg.L));
      quad(geo.ceiling, P(seg, ta, seg.R, BORE_H), P(seg, ta, seg.L, BORE_H), P(seg, tb, seg.L, BORE_H), P(seg, tb, seg.R, BORE_H));
      const len = tb - ta, tm = (ta + tb) / 2;
      for (const o of [seg.L - 0.3, seg.R + 0.3]) {
        const [cx, y, cz] = P(seg, tm, o);
        collider(cx, cz, seg.dx, seg.dz, len + 0.5, 0.6, y - 1, y + BORE_H);
      }
    }
    for (let t = seg.t0 + LIGHT_STEP / 2; t < seg.t1; t += LIGHT_STEP) {
      for (const o of [seg.L + (seg.R - seg.L) * 0.3, seg.L + (seg.R - seg.L) * 0.7]) {
        const [cx, y, cz] = P(seg, t, o, BORE_H - 0.06);
        box(geo.light, cx, cz, seg.dx, seg.dz, 2.4, 0.25, y - 0.08, y);
      }
    }
    laneLines(seg, e, partner);
    // portals: piers either side and a lintel up to the hill's surface over the opening (at least 2.5 m)
    for (const t of [seg.t0, seg.t1]) {
      const [cx, y, cz] = P(seg, t, (seg.L + seg.R) / 2);
      const w = seg.R - seg.L;
      let top = y + BORE_H + 2.5;
      for (const o of [seg.L, (seg.L + seg.R) / 2, seg.R]) {
        const [px, , pz] = P(seg, t, o);
        top = Math.max(top, ground(px, pz) + 0.5);
      }
      top = Math.min(top, y + BORE_H + 12);
      box(geo.masonry, cx, cz, seg.dx, seg.dz, PORTAL_T, w + 2 * CARVE_SIDE, y + BORE_H, top);
      for (const o of [seg.L - CARVE_SIDE / 2, seg.R + CARVE_SIDE / 2]) {
        const [px, , pz] = P(seg, t, o);
        box(geo.masonry, px, pz, seg.dx, seg.dz, PORTAL_T, CARVE_SIDE, y - 1.5, top);
        collider(px, pz, seg.dx, seg.dz, PORTAL_T, CARVE_SIDE, y - 1, top);
      }
    }
  }

  // A bridge deck over the water: road, sidewalks' parapets, the slab's sides and underside, piers every COLUMN_STEP m
  function buildDeck(seg, e, partner) {
    const st = stations(seg);
    for (let i = 0; i + 1 < st.length; i++) {
      const [ta, tb] = [st[i], st[i + 1]];
      quad(geo.road, P(seg, ta, seg.L), P(seg, ta, seg.R), P(seg, tb, seg.R), P(seg, tb, seg.L));
      quad(geo.concrete, P(seg, ta, seg.R, -DECK_T), P(seg, ta, seg.L, -DECK_T), P(seg, tb, seg.L, -DECK_T), P(seg, tb, seg.R, -DECK_T));
      quad(geo.concrete, P(seg, ta, seg.R, -DECK_T), P(seg, tb, seg.R, -DECK_T), P(seg, tb, seg.R), P(seg, ta, seg.R));
      quad(geo.concrete, P(seg, tb, seg.L, -DECK_T), P(seg, ta, seg.L, -DECK_T), P(seg, ta, seg.L), P(seg, tb, seg.L));
      const len = tb - ta, tm = (ta + tb) / 2;
      // (a package deck's parapets stay open over the last MERGE_GAP m before a node where decks merge or part)
      if (seg.kind === 'deck' && ((tm < MERGE_GAP && branchy(e.from)) || (tm > e.span - MERGE_GAP && branchy(e.to)))) continue;
      for (const o of [seg.L + 0.15, seg.R - 0.15]) {
        const [cx, y, cz] = P(seg, tm, o);
        // (a package deck's parapets are placed once every deck stands: parapets())
        if (seg.kind === 'deck') { parapetQ.push({ seg, ta, tb, tm, o, len, out: o < (seg.L + seg.R) / 2 ? -1 : 1 }); continue; }
        box(geo.concrete, cx, cz, seg.dx, seg.dz, len + 0.02, 0.3, y, y + PARAPET_H);
        collider(cx, cz, seg.dx, seg.dz, len + 0.5, 0.3, y - 1, y + PARAPET_H);
      }
    }
    for (let t = seg.t0 + COLUMN_STEP / 2; t < seg.t1; t += COLUMN_STEP) {
      // (a package's deck: its columns are placed once every deck stands, clear of the roads and decks under it: columns())
      if (seg.kind === 'deck') { columnQ.push({ seg, t }); continue; }
      const [cx, y, cz] = P(seg, t, (seg.L + seg.R) / 2);
      if (Terrain.heightAt(cx, cz) > Terrain.waterLevel + 0.05) continue;
      box(geo.concrete, cx, cz, seg.dx, seg.dz, 1.6, seg.R - seg.L - 1, Terrain.waterLevel - 2, y - DECK_T);
    }
    laneLines(seg, e, partner);
  }

  // 2. Freeways and ramps (GEO.roadGraph.decks), drawn from the centreline graph
  const highwayLanes = buildFreeways();
  function buildFreeways() {
    const RG = window.NYC.GEO.roadGraph;
    if (!RG || !RG.decks) return [];
    const node = (i) => ({ x: RG.nodes[2 * i], z: RG.nodes[2 * i + 1] });
    const ways = RG.decks.map(([li, layers]) => {
      const [a, b, , , lanes, dir, inner, flags] = RG.links[li];
      const pts = [node(a)];
      for (let k = 0; k < inner.length; k += 2) pts.push({ x: inner[k], z: inner[k + 1] });
      pts.push(node(b));
      // layers where OSM had no matching way: the nearest matched point's
      const lay = layers.map((v, k) => {
        if (v >= 0) return v;
        for (let d = 1; d < layers.length; d++) for (const j of [k - d, k + d]) if (layers[j] >= 0) return layers[j];
        return 0;
      });
      // the Bay Bridge (sf-bridges.js bridgeDeckAt, P5.2): westbound on its upper deck, eastbound on the lower; its
      // approach climbs to it
      const upper = /WESTBOUND/.test(RG.names[RG.links[li][2]]);
      const deckAt = (p) => (bridgeDeckAt && !(flags & 4) ? bridgeDeckAt(p.x, p.z, upper) : null);
      const target = pts.map((p, k) => {
        const est = ground(p.x, p.z) + DECK_H_ESTIMATE[Math.min(3, lay[k])];
        const bd = deckAt(p);
        return bd ? (bd.onBridge ? bd.y : Math.max(est, bd.y)) : est;
      });
      return { li, a, b, lanes: Math.max(1, lanes), dir, ramp: (flags & 4) !== 0, pts, target, deckAt };
    });
    // a junction's height: the highest any freeway meeting there wants, so the decks meet; a ramp meets a street on
    // the ground
    const street = new Set();
    RG.links.forEach(([a, b, , , , , , flags]) => { if (!(flags & 1)) street.add(a).add(b); });
    const nodeY = new Map();
    for (const w of ways) {
      nodeY.set(w.a, Math.max(nodeY.get(w.a) ?? -Infinity, w.target[0]));
      nodeY.set(w.b, Math.max(nodeY.get(w.b) ?? -Infinity, w.target[w.target.length - 1]));
    }
    for (const i of nodeY.keys()) if (street.has(i)) nodeY.set(i, ground(node(i).x, node(i).z));
    for (const w of ways) {
      // dense stations every 2 x STEP m with the target heights, the ends at their junctions', then eased: a few
      // passes of a moving average, and at most DECK_GRADE either way from each end
      const dense = [];
      for (let k = 0; k + 1 < w.pts.length; k++) {
        const p = w.pts[k], q = w.pts[k + 1];
        const L = Math.hypot(q.x - p.x, q.z - p.z), m = Math.max(1, Math.ceil(L / (2 * STEP)));
        for (let i = 0; i < m; i++) dense.push({ x: p.x + ((q.x - p.x) * i) / m, z: p.z + ((q.z - p.z) * i) / m, y: w.target[k] + ((w.target[k + 1] - w.target[k]) * i) / m });
      }
      const last = w.pts[w.pts.length - 1];
      dense.push({ x: last.x, z: last.z, y: w.target[w.target.length - 1] });
      dense[0].y = nodeY.get(w.a);
      dense[dense.length - 1].y = nodeY.get(w.b);
      // on a bridge the deck is the bridge's (fixed: not eased); on its approach at least as high as the climb to it
      for (const d of dense) {
        const bd = w.deckAt(d);
        if (bd && bd.onBridge) { d.y = bd.y; d.bridge = true; } else if (bd) d.y = Math.max(d.y, bd.y);
      }
      for (let pass = 0; pass < 6; pass++) {
        for (let i = 1; i + 1 < dense.length; i++) if (!dense[i].bridge) dense[i].y = (dense[i - 1].y + dense[i].y + dense[i + 1].y) / 3;
      }
      for (let i = 1; i < dense.length; i++) dense[i].s = Math.hypot(dense[i].x - dense[i - 1].x, dense[i].z - dense[i - 1].z);
      for (let i = 1; i + 1 < dense.length; i++) if (!dense[i].bridge) dense[i].y = Math.min(dense[i].y, dense[i - 1].y + DECK_GRADE * dense[i].s);
      for (let i = dense.length - 2; i > 0; i--) if (!dense[i].bridge) dense[i].y = Math.min(dense[i].y, dense[i + 1].y + DECK_GRADE * dense[i + 1].s);
      for (const d of dense) d.y = Math.max(d.y, ground(d.x, d.z) + 0.05);
      w.dense = dense;
      const width = w.lanes * FREEWAY_LANE + 2;
      w.half = width / 2;
      let sinceColumn = COLUMN_STEP / 2;
      for (let i = 0; i + 1 < dense.length; i++) {
        const p = dense[i], q = dense[i + 1];
        const L = Math.hypot(q.x - p.x, q.z - p.z) || 1;
        const dx = (q.x - p.x) / L, dz = (q.z - p.z) / L, rx = -dz, rz = dx;
        const gp = p.y - ground(p.x, p.z), gq = q.y - ground(q.x, q.z);
        if (gp < 0.6 && gq < 0.6) continue; // at grade: the terrain is its road
        const h = width / 2;
        const at = (r, o, dy = 0) => [r.x + rx * o, r.y + dy, r.z + rz * o];
        quad(geo.road, at(p, -h), at(p, h), at(q, h), at(q, -h));
        if (p.bridge && q.bridge) continue; // the bridge's truss carries it (sf-bridges.js)
        quad(geo.concrete, at(p, h, -DECK_T), at(p, -h, -DECK_T), at(q, -h, -DECK_T), at(q, h, -DECK_T));
        quad(geo.concrete, at(p, h, -DECK_T), at(q, h, -DECK_T), at(q, h), at(p, h));
        quad(geo.concrete, at(q, -h, -DECK_T), at(p, -h, -DECK_T), at(p, -h), at(q, -h));
        for (const o of [-h + 0.15, h - 0.15]) {
          const [cx, , cz] = at({ x: (p.x + q.x) / 2, y: 0, z: (p.z + q.z) / 2 }, o);
          box(geo.concrete, cx, cz, dx, dz, L + 0.05, 0.3, (p.y + q.y) / 2, (p.y + q.y) / 2 + PARAPET_H);
        }
        sinceColumn += L;
        if (sinceColumn >= COLUMN_STEP && Math.min(gp, gq) > 3.5) {
          sinceColumn = 0;
          const g = ground(q.x, q.z);
          // a column over a street under the deck moves across to the nearest place clear of its roadway, or is left out
          const placed = [];
          for (const o0 of width > 14 ? [-width / 4, width / 4] : [0]) {
            let o = null;
            for (let k = 0; o === null && k <= 4 * h; k++) {
              const c = o0 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.5;
              const [x, , z] = at(q, c);
              if (Math.abs(c) <= h - 0.8 && !onStreet(x, z, 0.8)) o = c;
            }
            if (o === null || placed.some((p) => Math.abs(p - o) < 2)) continue;
            placed.push(o);
            const [cx, , cz] = at(q, o);
            box(geo.concrete, cx, cz, dx, dz, 1.6, 1.6, g - 0.5, q.y - DECK_T);
            collider(cx, cz, dx, dz, 1.6, 1.6, g - 1, q.y - DECK_T);
          }
        }
      }
    }
    // Highway traffic on the main lines: chains of freeway links (not ramps) end to end, going on straightest
    const lanes = [];
    const byStart = new Map();
    for (const w of ways) if (!w.ramp && w.dir !== 0) byStart.set(w.dir > 0 ? w.a : w.b, [...(byStart.get(w.dir > 0 ? w.a : w.b) || []), w]);
    const used = new Set();
    const along = (w) => (w.dir > 0 ? w.dense : w.dense.slice().reverse());
    const hasIn = new Set();
    for (const w of ways) if (!w.ramp && w.dir !== 0) hasIn.add(w.dir > 0 ? w.b : w.a);
    const starts = ways.filter((w) => !w.ramp && w.dir !== 0 && !hasIn.has(w.dir > 0 ? w.a : w.b));
    for (const first of [...starts, ...ways.filter((w) => !w.ramp && w.dir !== 0)]) {
      if (used.has(first)) continue;
      const chain = [];
      let w = first;
      while (w && !used.has(w)) {
        used.add(w);
        chain.push(...(chain.length ? along(w).slice(1) : along(w)));
        const end = w.dir > 0 ? w.b : w.a;
        const d = along(w), p = d[d.length - 2], q = d[d.length - 1];
        const L = Math.hypot(q.x - p.x, q.z - p.z) || 1;
        let best = null, bd = 0.7;
        for (const n of byStart.get(end) || []) {
          if (used.has(n)) continue;
          const e = along(n), dot = ((e[1].x - e[0].x) * (q.x - p.x) + (e[1].z - e[0].z) * (q.z - p.z)) / ((Math.hypot(e[1].x - e[0].x, e[1].z - e[0].z) || 1) * L);
          if (dot > bd) { bd = dot; best = n; }
        }
        w = best;
      }
      let len = 0;
      for (let i = 1; i < chain.length; i++) len += Math.hypot(chain[i].x - chain[i - 1].x, chain[i].z - chain[i - 1].z);
      if (len < 300) continue;
      const n = first.lanes;
      for (let k = 0; k < n; k++) {
        const o = (k - (n - 1) / 2) * FREEWAY_LANE;
        const pts = chain.map((c, i) => {
          const a = chain[Math.max(0, i - 1)], b = chain[Math.min(chain.length - 1, i + 1)];
          const L = Math.hypot(b.x - a.x, b.z - a.z) || 1;
          const x = c.x - ((b.z - a.z) / L) * o, z = c.z + ((b.x - a.x) / L) * o;
          return new THREE.Vector3(x, Math.max(c.y, ground(x, z)) + 0.02, z); // (at grade, on the cross slope)
        });
        lanes.push({ pts, speed: 24 + k * 1.5 });
      }
    }
    return lanes;
  }

  // 3. Meshes: one per material
  const mat = {
    road: createRoadSurfaceMaterial(),
    wall: new THREE.MeshStandardNodeMaterial({ color: 0xb8b3a6, roughness: 0.55, metalness: 0.0, side: THREE.DoubleSide }),
    ceiling: new THREE.MeshStandardNodeMaterial({ color: 0x34322e, roughness: 0.9, metalness: 0.0, side: THREE.DoubleSide }),
    masonry: createMarbleAshlarMaterial(),
    concrete: new THREE.MeshStandardNodeMaterial({ color: 0x9a958b, roughness: 0.86, metalness: 0.0 }),
    light: new THREE.MeshBasicNodeMaterial({ color: 0xfff1d6 })
  };
  for (const [key, tris] of Object.entries(geo)) {
    if (key === 'paint' || !tris.length) continue;
    const pos = new Float32Array(tris.flat());
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, mat[key]);
    mesh.name = `SFGradeSeparation_${key}`;
    mesh.castShadow = key !== 'light' && key !== 'road';
    mesh.receiveShadow = key !== 'light';
    group.add(mesh);
  }
  if (geo.paint.length) {
    const pos = new Float32Array(geo.paint.flatMap((p) => p.tri));
    const col = new Float32Array(geo.paint.flatMap((p) => [...p.col, ...p.col, ...p.col, ...p.col, ...p.col, ...p.col]));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.0 }));
    mesh.name = 'SFGradeSeparation_paint';
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  scene.add(group);
  for (const key of Object.keys(geo)) geo[key] = null; // (the floor lookups below keep this scope alive)

  // 4. Floors: the tunnel floor under something in the bore, the deck under something on the bridge
  // (a 16 m grid of the floors over each cell; the floor for something at y: of those whose band holds it, the highest
  // at most 0.5 m over it, else the lowest: on stacked decks the nearest one under it)
  const CELL = 16;
  const cells = new Map();
  const ck = (i, j) => (i + 32768) * 65536 + (j + 32768);
  for (const s of floors) {
    let x0, x1, z0, z1;
    if (s.kind === 'disc') { x0 = s.x - s.r; x1 = s.x + s.r; z0 = s.z - s.r; z1 = s.z + s.r; }
    else {
      const xs = [], zs = [];
      for (const t of [s.t0 - 0.5, s.t1 + 0.5]) for (const o of [s.L, s.R]) { xs.push(s.x0 + s.dx * t + s.rx * o); zs.push(s.z0 + s.dz * t + s.rz * o); }
      x0 = Math.min(...xs); x1 = Math.max(...xs); z0 = Math.min(...zs); z1 = Math.max(...zs);
    }
    for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++) for (let j = Math.floor(z0 / CELL); j <= Math.floor(z1 / CELL); j++) {
      const k = ck(i, j);
      if (!cells.has(k)) cells.set(k, []);
      cells.get(k).push(s);
    }
  }
  function floorY(s, x, z) {
    if (s.kind === 'disc') return Math.hypot(x - s.x, z - s.z) <= s.r ? s.y : null;
    const px = x - s.x0, pz = z - s.z0;
    const t = px * s.dx + pz * s.dz;
    if (t < s.t0 - 0.5 || t > s.t1 + 0.5) return null;
    const o = px * s.rx + pz * s.rz;
    if (o < s.L || o > s.R) return null;
    const k = Math.min(s.ys.length - 1, Math.max(0, (t - s.t0) / STEP));
    const i = Math.min(s.ys.length - 2, Math.floor(k));
    return i < 0 ? s.ys[0] : s.ys[i] + (s.ys[i + 1] - s.ys[i]) * (k - i);
  }
  const decks = floors.filter((f) => f.kind === 'deck').length;
  function find(x, z, y) {
    const list = cells.get(ck(Math.floor(x / CELL), Math.floor(z / CELL)));
    if (!list) return null;
    let best = null, low = null;
    for (const s of list) {
      const fy = floorY(s, x, z);
      if (fy === null || !(s.kind === 'tunnel' ? y < fy + FLOOR_BAND : y > fy - FLOOR_BAND)) continue;
      if (fy <= y + 0.5) { if (!best || fy > best.fy) best = { s, fy }; }
      else if (!low || fy < low.fy) low = { s, fy };
    }
    return best || low;
  }
  // (package decks) the underside of the lowest deck over something at y, Infinity: none
  function deckOver(x, z, y) {
    const list = cells.get(ck(Math.floor(x / CELL), Math.floor(z / CELL)));
    let top = Infinity;
    if (list) for (const s of list) {
      if (s.kind !== 'deck' && s.kind !== 'disc') continue;
      const fy = floorY(s, x, z);
      if (fy !== null && y <= fy - FLOOR_BAND) top = Math.min(top, fy - DECK_T);
    }
    return top;
  }
  const floorAt = (x, z, y) => {
    const f = find(x, z, y);
    return f ? f.fy : null;
  };
  const roofAt = (x, z, y) => {
    const f = find(x, z, y);
    return f && f.s.kind === 'tunnel' ? f.fy + BORE_H : decks ? deckOver(x, z, y) : Infinity;
  };
  // (package decks) is (x, z) at y on a deck (no curb there: controllers.js getGroundHeight)
  const onDeckAt = (x, z, y) => {
    const f = decks ? find(x, z, y) : null;
    return !!f && (f.s.kind === 'deck' || f.s.kind === 'disc');
  };
  // The terrain mesh dips under a bore where the hill's surface comes down into it (terrain-mesh.js): the portals'
  // mouths stay open; deeper in, the hill covers the bore as it is
  const carveAt = (x, z) => {
    for (const s of floors) {
      if (s.kind !== 'tunnel') continue;
      const px = x - s.x0, pz = z - s.z0;
      const t = px * s.dx + pz * s.dz;
      if (t < s.t0 || t > s.t1) continue;
      const o = px * s.rx + pz * s.rz;
      if (o < s.L - CARVE_SIDE || o > s.R + CARVE_SIDE) continue;
      const fy = s.ys[Math.min(s.ys.length - 1, Math.round((t - s.t0) / STEP))];
      if (Terrain.groundAt(x, z) < fy + BORE_H + 0.3) return fy - 0.5;
    }
    return null;
  };
  const counts = { tunnels: floors.filter((f) => f.kind === 'tunnel').length, bridges: floors.filter((f) => f.kind === 'bridge').length };
  console.info(`[grade] ${counts.tunnels} tunnel bores, ${counts.bridges} bridge decks, ${highwayLanes.length} highway lanes, ${colliders.length} colliders` +
    (decks ? `, ${decks} package decks (${linkOnly} off the traffic network), ${floors.length - counts.tunnels - counts.bridges - decks} deck discs, ${bents} column bents` : ''));
  return { group, colliders, highwayLanes, floorAt, roofAt, carveAt, onDeckAt, floors };
}

Object.assign(window.NYC, { buildGradeSeparation, DECK_H_ESTIMATE });
})();
