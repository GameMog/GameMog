(function () {
// js/road-paint.js
// Road markings generated from the drivable road network (js/road-network.js), so the paint matches where traffic
// actually drives and stops: dashed lane lines, double yellow centre lines on two-way roads, stop bars and continental
// crosswalks (curb to curb, where traffic.js walks its pedestrians) at the junctions with signals or stop signs, and
// green bike lanes where the DataSF Bike Network has class II lanes or class IV separated ones (GEO.bikeways, P4.4:
// along both curbs, or along the curb on the right of a one-way lane's travel; a white buffer line on buffered ones);
// and the track beds and rails of the surface rail lines, with the cable slot along the cable-car lines. Every strip is a ribbon draped on the terrain
// (js/terrain.js), a vertex pair every metre.

const { THREE, CROSSWALK, createRoadPaintMaterial, blockAt } = window.NYC;

const WHITE = new THREE.Color(0xe6e2d6);
const YELLOW = new THREE.Color(0xe8ad22);
const GREEN = new THREE.Color(0x2a8a4e);
const STEEL = new THREE.Color(0x8d8f91);
const TRACK_BED = new THREE.Color(0x4d4a45);
const SLOT = new THREE.Color(0x141414);
const GAUGE = 1.435; // standard gauge, between the rails' centres (near enough)
const HEIGHT = 0.012; // above the asphalt
const STEP = 1; // metres between the vertex pairs of a strip

function buildRoadPaint(scene, network) {
  const position = [];
  const normal = [];
  const side = [];
  const paint = [];
  const colors = [];
  const index = [];
  const T = window.NYC.Terrain;
  const loaded = T && T.loaded;
  const n = { x: 0, y: 1, z: 0 };
  // (a Hometown package: every marking strip's kind, road and corners, for the markings survey: mesh.userData.marks)
  const marks = window.NYC.PKG ? [] : null;
  let kind = 'other', owner = null;

  // Strip w wide from a to b, with a dash pattern (period, duty cycle) running along it, on the ground (and on the curb
  // islands' tops, `onIslands`)
  function strip(ax, az, bx, bz, w, col, period = 1, duty = 1, onIslands = false, lift = 0) {
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 0.05) return;
    const sx = ((az - bz) / len) * w * 0.5;
    const sz = ((bx - ax) / len) * w * 0.5;
    const steps = Math.max(1, Math.ceil(len / STEP));
    if (marks) marks.push({ kind, e: owner, w, q: [ax - sx, az - sz, ax + sx, az + sz, bx + sx, bz + sz, bx - sx, bz - sz] });
    const i0 = position.length / 3;
    for (let k = 0; k <= steps; k++) {
      const u = (len * k) / steps;
      const x = ax + ((bx - ax) * k) / steps;
      const z = az + ((bz - az) * k) / steps;
      for (const s of [-1, 1]) {
        const px = x + sx * s, pz = z + sz * s;
        const island = onIslands && blockAt(px, pz) ? window.NYC.CURB_H : 0;
        position.push(px, (loaded ? T.groundAt(px, pz) : 0) + island + HEIGHT + lift, pz);
        if (loaded) T.normalAt(px, pz, n);
        normal.push(n.x, n.y, n.z);
        side.push(sx * s, sz * s);
        paint.push(u, period, duty);
        colors.push(col.r, col.g, col.b);
      }
      if (k > 0) {
        const i = i0 + 2 * (k - 1);
        index.push(i, i + 1, i + 3, i, i + 3, i + 2);
      }
    }
  }
  // How far the roadway reaches either side of the point s along edge e (to the first curb island), like the
  // crosswalk tracks of traffic.js: [left, right]
  function curbs(e, s) {
    const x = e.sx + e.dx * s, z = e.sz + e.dz * s;
    const reach = (dir) => {
      for (let r = 0; r < e.half + 8; r += 0.25) if (blockAt(x + e.rx * r * dir, z + e.rz * r * dir)) return r;
      return e.half;
    };
    return [reach(-1), reach(1)];
  }

  // Edges run between stop lines; s is measured from the start one and o to the right of the centre line
  const at = (e, s, o) => [e.sx + e.dx * s + e.rx * o, e.sz + e.dz * s + e.rz * o];
  // (a Hometown package: between its junctions' markings, planJunctions)
  const along = (e, o, w, col, period, duty) => {
    const [s0, s1] = (plan && plan.lines.get(e)) || [0.9, e.len - 0.9];
    if (s1 - s0 < 1) return;
    owner = e; kind = col === YELLOW ? 'yellow' : col === GREEN ? 'bike' : period > 1 ? 'dash' : 'line';
    strip(...at(e, s0, o), ...at(e, s1, o), w, col, period, duty);
    kind = 'other'; owner = null;
  };
  const across = (e, s, o0, o1, w, col, period, duty) => { owner = e; kind = period > 1 ? 'crosswalk' : 'stopbar'; strip(...at(e, s, o0), ...at(e, s, o1), w, col, period, duty); kind = 'other'; owner = null; };

  // Bike lanes (GEO.bikeways) by 16 m grid cell, segment by segment, to find the one running along a road
  const BIKE_CELL = 16;
  const bikeGrid = new Map();
  for (const b of window.NYC.GEO.bikeways || []) {
    for (let i = 2; i < b.pts.length; i += 2) {
      const ax = b.pts[i - 2], az = b.pts[i - 1], bx = b.pts[i], bz = b.pts[i + 1];
      const L = Math.hypot(bx - ax, bz - az);
      if (L < 0.5) continue;
      const seg = { b, ax, az, ux: (bx - ax) / L, uz: (bz - az) / L, L };
      for (let t = 0; t <= L; t += BIKE_CELL / 2) {
        const k = Math.floor((ax + seg.ux * t) / BIKE_CELL) * 100000 + Math.floor((az + seg.uz * t) / BIKE_CELL);
        if (!bikeGrid.has(k)) bikeGrid.set(k, new Set());
        bikeGrid.get(k).add(seg);
      }
    }
  }
  // the bike lane along edge e: its segments within 4 m of e's centreline at a quarter, half & three quarters, running
  // within 25 degrees of it (at two of the three); with the drawing direction's sign against e
  function bikewayAlong(e) {
    const hits = new Map();
    for (const f of [0.25, 0.5, 0.75]) {
      const [x, z] = at(e, e.len * f, 0);
      const seen = new Set();
      for (const seg of bikeGrid.get(Math.floor(x / BIKE_CELL) * 100000 + Math.floor(z / BIKE_CELL)) || []) {
        if (seen.has(seg.b)) continue;
        const dot = seg.ux * e.dx + seg.uz * e.dz;
        if (Math.abs(dot) < 0.9) continue;
        const t = Math.max(0, Math.min(seg.L, (x - seg.ax) * seg.ux + (z - seg.az) * seg.uz));
        if (Math.hypot(seg.ax + seg.ux * t - x, seg.az + seg.uz * t - z) > 4) continue;
        seen.add(seg.b);
        const h = hits.get(seg.b) || { n: 0, sign: Math.sign(dot) };
        h.n++;
        hits.set(seg.b, h);
      }
    }
    for (const [b, h] of hits) if (h.n >= 2) return { b, sign: h.sign };
    return null;
  }

  // The one or two directed edges of each road between a pair of intersections
  let bikeLanes = 0;
  const roads = new Map();
  for (const e of network.edges) {
    if (e.bore) continue; // paint is draped on the terrain: tunnels and bridges have their own (grade-separation.js)
    const key = Math.min(e.from.id, e.to.id) * 65536 + Math.max(e.from.id, e.to.id);
    if (roads.has(key)) roads.get(key).push(e);
    else roads.set(key, [e]);
  }

  const plan = window.NYC.PKG ? planJunctions() : null; // (used by along(), above: set before any road is painted)

  // (a Hometown package) Where each junction's markings go. A package's road graph puts a bend (a shape node) a few
  // metres from many junctions (a street's lane count or width changing there, a vertex of the map's line), and the
  // stop line on so short a link is squeezed in towards the junction, often into the road crossing it: its crosswalk
  // and stop bar were painted across the middle of the junction, its lane lines ran into it, and junctions a few metres
  // apart painted crosswalks over each other. Here every road's mouth at a junction is found again from the roads
  // themselves: the crosswalk goes where, across its road's width, it is clear of every road crossing (out past the
  // bend if need be: the street goes on there), the stop bar just behind it and the lane lines start behind that. A
  // crosswalk that finds no clear place on its own half of the link (a link between two junctions a few metres apart),
  // or would lie on one already placed (signals first, then the widest roads), isn't painted; nor is a stop bar that
  // would lie in a road crossing it. Crosswalks reach curb to curb, but no further than the road's own width.
  // -> { lines: edge -> [s0, s1], crosswalks: [[e, s, l, r]], bars: edge -> s | null }
  function planJunctions() {
    const roadKey = (e) => Math.min(e.from.id, e.to.id) * 65536 + Math.max(e.from.id, e.to.id);
    const C = 32, cells = new Map();
    for (const e of network.edges) {
      if (e.bore) continue;
      const pad = e.half + 1, x1 = e.x0 + e.dx * e.span, z1 = e.z0 + e.dz * e.span;
      for (let ix = Math.floor((Math.min(e.x0, x1) - pad) / C); ix <= Math.floor((Math.max(e.x0, x1) + pad) / C); ix++) {
        for (let iz = Math.floor((Math.min(e.z0, z1) - pad) / C); iz <= Math.floor((Math.max(e.z0, z1) + pad) / C); iz++) {
          const k = ix * 100000 + iz;
          if (!cells.has(k)) cells.set(k, []);
          cells.get(k).push(e);
        }
      }
    }
    // (x, z) on the roadway of a road crossing e's (0.3 m in from its sides; a road within ~30 degrees of e's is the same
    // street going on past a bend, or the other roadway of a divided one)
    const onCrossing = (x, z, e) => {
      const rk = roadKey(e);
      for (const f of cells.get(Math.floor(x / C) * 100000 + Math.floor(z / C)) || []) {
        if (roadKey(f) === rk || Math.abs(f.dx * e.dx + f.dz * e.dz) > 0.85) continue;
        const px = x - f.x0, pz = z - f.z0, u = px * f.dx + pz * f.dz;
        if (u > 0 && u < f.span && Math.abs(px * f.rx + pz * f.rz) < f.half - 0.3) return true;
      }
      return false;
    };
    const b0 = (f) => Math.hypot(f.sx - f.x0, f.sz - f.z0);
    // s along f of the point D m out from its end at node
    const sAt = (f, node, D) => (node === f.from ? D - b0(f) : f.span - D - b0(f));
    // whether a line across e's road D m out from node, o0..o1 to the right of e, keeps clear of the roads crossing it
    const clear = (e, node, D, o0, o1) => {
      const s = sAt(e, node, D);
      let n = 0, hit = 0;
      for (let o = o0 + 0.4; o <= o1 - 0.4 + 1e-6; o += 0.5, n++) if (onCrossing(...at(e, s, o), e)) hit++;
      return hit <= n * 0.1;
    };
    // the first D from D0 on (0.25 m steps, up to Dmax) where it does
    const firstClear = (e, node, D0, Dmax, o0, o1) => {
      for (let D = D0; D <= Dmax + 1e-6; D += 0.25) if (clear(e, node, D, o0, o1)) return D;
      return null;
    };
    const quad = (e, s, o0, o1, w) => {
      const [ax, az] = at(e, s, o0), [bx, bz] = at(e, s, o1);
      const hx = (e.dx * w) / 2, hz = (e.dz * w) / 2;
      return [[ax - hx, az - hz], [bx - hx, bz - hz], [bx + hx, bz + hz], [ax + hx, az + hz]];
    };
    const overlaps = (P, Q) => {
      // area of convex P clipped by convex Q (Sutherland-Hodgman) over 0.25 m2
      let out = P;
      let sgn = 0;
      for (let i = 0; i < Q.length; i++) sgn += Q[i][0] * Q[(i + 1) % Q.length][1] - Q[(i + 1) % Q.length][0] * Q[i][1];
      if (Math.abs(sgn) < 1e-6) return false; // (no area)
      for (let i = 0; i < Q.length && out.length; i++) {
        const [ax, az] = Q[i], [bx, bz] = Q[(i + 1) % Q.length];
        const side = (p) => ((bx - ax) * (p[1] - az) - (bz - az) * (p[0] - ax)) * Math.sign(sgn);
        const inp = out;
        out = [];
        for (let j = 0; j < inp.length; j++) {
          const p = inp[j], q = inp[(j + 1) % inp.length], sp = side(p), sq = side(q);
          if (sp >= 0) out.push(p);
          if ((sp >= 0) !== (sq >= 0)) out.push([p[0] + ((q[0] - p[0]) * sp) / (sp - sq), p[1] + ((q[1] - p[1]) * sp) / (sp - sq)]);
        }
      }
      let a = 0;
      for (let i = 0; i < out.length; i++) a += out[i][0] * out[(i + 1) % out.length][1] - out[(i + 1) % out.length][0] * out[i][1];
      return Math.abs(a) / 2 > 0.25;
    };

    const W = CROSSWALK - 0.3;
    const ends = [];
    const stats = { ends: 0, controlled: 0, noClear: 0, onAnother: 0, crosswalks: 0, bars: 0, noBar: 0 };
    for (const [e, back] of roads.values()) {
      for (const node of [e.from, e.to]) {
        if (node.shape) continue;
        const far = node === e.from ? e.to : e.from;
        // how far out the road's markings may go: past a bend the street goes on; towards a junction, half way
        const Dmax = far.shape ? e.span + 4 : e.span / 2 - CROSSWALK / 2;
        const b = node === e.from ? b0(e) : e.span - e.len - b0(e); // the stop line, m out from the node
        const end = { e, back, node, rk: roadKey(e), b, Dmax, xw: null, bar: null, line: null };
        stats.ends++;
        if (node.signal || node.stop) {
          stats.controlled++;
          const D = firstClear(e, node, b - CROSSWALK / 2, Dmax, -e.half, e.half);
          if (D === null) stats.noClear++;
          if (D !== null) {
            const s = sAt(e, node, D);
            const [l, r] = curbs(e, s).map((c) => Math.min(c, e.half + 0.3));
            // (a curb right at the road's centre line: no room for one)
            if (l + r >= 2) end.xw = { D, s, l, r, q: quad(e, s, -l, r, W) };
            else stats.noRoom = (stats.noRoom || 0) + 1;
          }
        }
        ends.push(end);
      }
    }
    // crosswalks: signals first, then the widest roads, the nearest their junction; none on top of one already placed
    const placed = [];
    for (const end of ends.filter((x) => x.xw).sort((p, q) => (q.node.signal ? 1 : 0) - (p.node.signal ? 1 : 0) || q.e.half - p.e.half || p.xw.D - q.xw.D)) {
      if (placed.some((x) => overlaps(end.xw.q, x.xw.q))) { end.xw = null; stats.onAnother++; }
      else placed.push(end);
    }
    const lines = new Map(), bars = new Map(), crosswalks = [];
    const barQuads = [];
    for (const end of ends) {
      const { e, back, node } = end;
      let edgeD; // where its lane lines may start, m out from the node
      // the stop bar of the way arriving here (at a signal, or facing a stop sign), from the centre line (or median) to
      // the curb: just behind the crosswalk, or else where it keeps clear of the roads crossing
      const f = e.to === node ? e : back && back.to === node ? back : null;
      if (f && (node.signal || f.stop)) {
        const left = back ? Math.max(0, f.lanes[0] - 1.8) : -f.half;
        const fb = f.span - f.len - b0(f);
        let D = end.xw ? Math.max(end.xw.D + 1.6, fb + 0.35) : firstClear(f, node, fb + 0.35, end.Dmax + 1.6, left, f.half);
        if (D !== null) {
          const s = sAt(f, node, D), q = quad(f, s, left + 0.1, f.half - 0.1, 0.45);
          if (placed.some((x) => x.rk !== end.rk && overlaps(q, x.xw.q)) || barQuads.some((x) => x.rk !== end.rk && overlaps(q, x.q))) D = null;
          else barQuads.push({ rk: end.rk, q });
        }
        bars.set(f, D === null ? null : sAt(f, node, D));
        stats[D === null ? 'noBar' : 'bars']++;
        if (D !== null) edgeD = D + 0.6;
      }
      if (end.xw) {
        crosswalks.push([e, end.xw.s, end.xw.l, end.xw.r]);
        edgeD = Math.max(edgeD || 0, end.xw.D + CROSSWALK / 2 + 0.3);
      }
      // (no markings across here: the lane lines start where they are clear of the roads crossing)
      if (edgeD === undefined) edgeD = firstClear(e, node, end.b + 0.9, end.Dmax + CROSSWALK, -e.half, e.half) ?? end.b + 0.9;
      for (const g of back ? [e, back] : [e]) {
        const span = lines.get(g) || [0.9, g.len - 0.9];
        const s = sAt(g, node, edgeD);
        if (node === g.from) span[0] = Math.max(span[0], s);
        else span[1] = Math.min(span[1], s);
        lines.set(g, span);
      }
    }
    stats.crosswalks = crosswalks.length;
    return { lines, crosswalks, bars, stats };
  }

  for (const [e, back] of roads.values()) {
    // Lanes of both directions, measured to the right of e, left to right
    const lanes = e.lanes.map((o) => ({ o, dir: 1 }));
    if (back) for (const o of back.lanes) lanes.push({ o: -o, dir: -1 });
    lanes.sort((p, q) => p.o - q.o);

    // Dashed white between lanes going the same way, double yellow between opposing ones
    // (nothing across a median or a lane closed off by an obstacle)
    for (let k = 0; k + 1 < lanes.length; k++) {
      const p = lanes[k];
      const q = lanes[k + 1];
      if (q.o - p.o > 4.5) continue;
      const mid = (p.o + q.o) / 2;
      if (p.dir === q.dir) {
        along(e, mid, 0.13, WHITE, 12, 0.25);
      } else {
        along(e, mid - 0.12, 0.11, YELLOW);
        along(e, mid + 0.12, 0.11, YELLOW);
      }
    }

    // Bike lanes: a 1.6 m green lane with white edge lines, outside a 2.4 m parking lane (class II, where it fits
    // beside the traffic lanes) or against the curb (class IV, separated); a buffered one gets a line 0.9 m further in
    const bike = bikewayAlong(e);
    if (bike) {
      const curbR = e.half, curbL = -(back ? back.half : e.half);
      // a one-way bike lane runs on the right of its travel: travel along e when the drawing runs with e and side is 1
      const sides = bike.b.side === 0 ? [1, -1] : [bike.b.side * bike.sign > 0 ? 1 : -1];
      for (const sign of sides) {
        const curb = sign > 0 ? curbR : curbL;
        const outer = sign > 0 ? lanes[lanes.length - 1].o : lanes[0].o; // the traffic lane nearest this curb
        let c = curb - sign * (bike.b.cls === 4 ? 1.1 : 3.2);
        if ((c - outer) * sign < 2.4) c = curb - sign * 1.1;
        if ((c - outer) * sign < 1.6) continue; // no room beside the traffic
        along(e, c, 1.6, GREEN);
        along(e, c - sign * 0.86, 0.12, WHITE);
        along(e, c + sign * 0.86, 0.12, WHITE);
        if (bike.b.buffered && (c - sign * 1.76 - outer) * sign > 1.2) along(e, c - sign * 1.76, 0.12, WHITE);
        bikeLanes++;
      }
    }

    // Stop bars across the lanes arriving at a signal or a stop sign, from the centre line (or median) to the curb
    // (a Hometown package: where planJunctions put them, the crosswalks after every road's)
    const controlled = (node, f) => node.signal || (f && f.stop);
    for (const f of back ? [e, back] : [e]) {
      if (plan) {
        const s = plan.bars.get(f);
        if (s != null) across(f, s, (back ? Math.max(0, f.lanes[0] - 1.8) : -f.half) + 0.1, f.half - 0.1, 0.45, WHITE);
        continue;
      }
      if (!controlled(f.to, f)) continue;
      const left = back ? Math.max(0, f.lanes[0] - 1.8) : -f.half;
      across(f, f.len - 0.35, left + 0.1, f.half - 0.1, 0.45, WHITE);
    }

    // Continental crosswalks curb to curb, between the stop lines and the junctions with signals or stop signs
    if (plan) continue;
    if (e.from.signal || e.from.stop) {
      const [l, r] = curbs(e, -CROSSWALK / 2);
      across(e, -CROSSWALK / 2, -l, r, CROSSWALK - 0.3, WHITE, 1.2, 0.5);
    }
    if (e.to.signal || e.to.stop) {
      const [l, r] = curbs(e, e.len + CROSSWALK / 2);
      across(e, e.len + CROSSWALK / 2, -l, r, CROSSWALK - 0.3, WHITE, 1.2, 0.5);
    }
  }

  if (plan) for (const [e, s, l, r] of plan.crosswalks) across(e, s, -l, r, CROSSWALK - 0.3, WHITE, 1.2, 0.5);

  // Surface rail (GEO.rail, P3.4): a track bed and two rails along each line, on the street or its rail median
  for (const r of window.NYC.GEO.rail || []) {
    for (let i = 2; i < r.pts.length; i += 2) {
      const [ax, az, bx, bz] = [r.pts[i - 2], r.pts[i - 1], r.pts[i], r.pts[i + 1]];
      const L = Math.hypot(bx - ax, bz - az) || 1, ox = (az - bz) / L, oz = (bx - ax) / L;
      strip(ax, az, bx, bz, 2.6, TRACK_BED, 1, 1, true);
      for (const s of [-GAUGE / 2, GAUGE / 2]) strip(ax + ox * s, az + oz * s, bx + ox * s, bz + oz * s, 0.08, STEEL, 1, 1, true, 0.004);
    }
  }

  // The cable cars' slot between their rails (GEO.transit cable-car runs, P4.6): a dark line down the track's middle
  for (const t of window.NYC.GEO.transit || []) {
    if (t.kind !== 'cablecar') continue;
    for (let i = 2; i < t.pts.length; i += 2) strip(t.pts[i - 2], t.pts[i - 1], t.pts[i], t.pts[i + 1], 0.05, SLOT, 1, 1, true, 0.006);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('side', new THREE.Float32BufferAttribute(side, 2));
  geometry.setAttribute('paint', new THREE.Float32BufferAttribute(paint, 3));
  geometry.setIndex(index);

  const mesh = new THREE.Mesh(geometry, createRoadPaintMaterial());
  mesh.name = 'RoadMarkings';
  mesh.receiveShadow = true;
  mesh.renderOrder = -1; // under the other see-through ground effects (contact shadows, headlight beams)
  if (marks) mesh.userData.marks = marks;
  if (plan) mesh.userData.junctionPaint = plan.stats;
  scene.add(mesh);
  console.info(`[paint] ${bikeLanes} bike lanes along ${roads.size} roads`);
  return mesh;
}

Object.assign(window.NYC, { buildRoadPaint });
})();
