(function () {
// cities/sf/js/bascule.js
// Portions adapted from manhattan-free-roam (https://github.com/huangserva/manhattan-free-roam), Copyright (c) 2026 The
// manhattan-free-roam authors, MIT License. (src/bridges.js: Grid, segments, orientedEdge, roadPaths, pointAt, bounds,
// insideRing, waterMap, shorelineStations and structureBoxes' beam, ported to this engine's classic scripts; see NOTICE)
//
// Chicago's river bridges in the Loop as trunnion bascules (CITY-BUILDER-TASK item 4, Mandi's Revenge's M8 "Bridge Up"):
// - Which: a town in BASCULE_TOWNS (Chicago, us-1714000): every package deck (road graph link with a profile) within
//   its radius of the Loop that crosses the river, found by walking the decks' links into continuous paths (roadPaths)
//   and cutting each where it crosses a water polygon's edge (shorelineStations): a run over the water 18-120 m wide is
//   a span. ?bascule=0 leaves every bridge fixed; ?bascule=1 asks for them in any town.
// - grade-separation.js asks claim(seg) for each deck floor it builds: the stretch of the floor between the two hinges
//   is CUT (no static deck drawn, no floor, no parapet, no column there) and the bascule stands in it.
// - Each span: two leaves hinged at the banks (the trunnions, just behind the river walls), each rotating up about its
//   hinge; a deck slab with the road's own surface, sidewalks and railings, an under-deck truss deepest at the trunnion
//   (Chicago's), a counterweight behind the hinge that swings down into its pit; a bridge house at each corner
//   (limestone, a copper roof, its windows lit at night).
// - The floor: floorAt follows each leaf's angle (a car drives up a rising leaf and leaves its tip with the leaf's slope
//   and lift: controllers.js settleCar's leap), and the static floors are ignored inside a span.
// - Scriptable: NYC.Bascules.raise(id | [x, z] | 'nearest', { to: deg, dur: s, delay: s, ease }) -> Promise, set(),
//   angle(), list(), nearest(x, z); the story's `bridge` step and a cutscene's `bridge` cue (wagmi/storyrun/runner.js).

const { THREE } = window.NYC;
const EPS = 1e-6;
const mix = (a, b, t) => a + (b - a) * t;

// (towns whose river bridges are bascules: the Loop's centre (lat, lon) and how far from it)
const BASCULE_TOWNS = {
  'us-1714000': { name: 'Chicago', lat: 41.882, lon: -87.6278, radius: 1500 }
};
const SPAN_MIN = 18, SPAN_MAX = 120; // m of water a span crosses
const SKIP_NAMES = /EXPRESSWAY|EXPY|LAKE SHORE|HIGHWAY|INTERSTATE|\bI-\d|RAMP/i;
const HINGE_BACK = 1.2; // m the trunnion stands behind the river wall
const DECK_T = 0.55; // leaf deck slab
const WALK = 1.6; // sidewalk on each leaf edge
const MAX_DEG = 80;
const FLOOR_BAND = 2.5; // (as grade-separation.js: a floor counts for something above it less this)

// ── ported from manhattan-free-roam src/bridges.js (MIT) ─────────────────────────────────────────────────────────────
const CELL = 48;
class Grid {
  constructor() { this.cells = new Map(); }
  add(item, x0, z0, x1 = x0, z1 = z0) {
    this.visit(x0, z0, x1, z1, (key) => {
      if (!this.cells.has(key)) this.cells.set(key, []);
      this.cells.get(key).push(item);
    });
  }
  near(x, z, radius) {
    const items = new Set();
    this.visit(x - radius, z - radius, x + radius, z + radius, (key) => {
      for (const item of this.cells.get(key) ?? []) items.add(item);
    });
    return items;
  }
  visit(x0, z0, x1, z1, visitCell) {
    for (let z = Math.floor(z0 / CELL); z <= Math.floor(z1 / CELL); z++) {
      for (let x = Math.floor(x0 / CELL); x <= Math.floor(x1 / CELL); x++) visitCell(x + 65536 * z);
    }
  }
}
// (a road: { p: [x, z, ...], y: [...], w, k }: here a road graph link, k its street's name)
function segments(road) {
  const edges = [];
  for (let i = 0; i + 3 < road.p.length; i += 2) {
    const x = road.p[i], z = road.p[i + 1], ex = road.p[i + 2], ez = road.p[i + 3];
    const y = road.y?.[i / 2] ?? 0, ey = road.y?.[i / 2 + 1] ?? 0;
    const length = Math.hypot(ex - x, ez - z);
    if (length > EPS) edges.push({ x, z, y, ex, ez, ey, length, w: road.w, road });
  }
  return edges;
}
function orientedEdge(edge, forward, s) {
  const { x, z, y, ex, ez, ey, length } = edge;
  const points = forward ? { x, z, y, ex, ez, ey } : { x: ex, z: ez, y: ey, ex: x, ez: z, ey: y };
  const direction = forward ? 1 : -1;
  return { ...edge, ...points, s, tx: direction * (ex - x) / length, tz: direction * (ez - z) / length };
}
// Walk through matching way ends so each path continues across data splits.
function roadPaths(ways) {
  const ends = new Map(), paths = [], used = new Set();
  for (const way of ways) {
    const first = way.edges[0], last = way.edges.at(-1);
    way.keys = [`${first.x},${first.z},${first.y},${way.road.k}`, `${last.ex},${last.ez},${last.ey},${way.road.k}`];
    for (const key of way.keys) {
      if (!ends.has(key)) ends.set(key, []);
      ends.get(key).push(way);
    }
  }
  function walk(way, key) {
    const edges = [];
    let length = 0;
    while (way && !used.has(way)) {
      used.add(way);
      const forward = way.keys[0] === key;
      const append = (edge) => { edges.push(orientedEdge(edge, forward, length)); length += edge.length; };
      if (forward) { for (const e of way.edges) append(e); } else { for (let i = way.edges.length - 1; i >= 0; i--) append(way.edges[i]); }
      key = way.keys[forward ? 1 : 0];
      const next = ends.get(key);
      way = next.length === 2 ? next.find((candidate) => !used.has(candidate)) : null;
    }
    paths.push({ edges, length });
  }
  for (const [key, adjacent] of ends) {
    if (adjacent.length === 2) continue;
    for (const way of adjacent) if (!used.has(way)) walk(way, key);
  }
  for (const way of ways) if (!used.has(way)) walk(way, way.keys[0]);
  return paths;
}
function pointAt(path, s) {
  let lo = 0, hi = path.edges.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (path.edges[mid].s <= s) lo = mid; else hi = mid - 1;
  }
  const e = path.edges[lo], t = (s - e.s) / e.length;
  return { x: mix(e.x, e.ex, t), z: mix(e.z, e.ez, t), y: mix(e.y, e.ey, t), tx: e.tx, tz: e.tz, w: e.w, road: e.road };
}
function indexEdge(grid, e, pad = 0) {
  grid.add(e, Math.min(e.x, e.ex) - pad, Math.min(e.z, e.ez) - pad, Math.max(e.x, e.ex) + pad, Math.max(e.z, e.ez) + pad);
}
function bounds(ring) {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (let i = 0; i < ring.length; i += 2) {
    x0 = Math.min(x0, ring[i]); x1 = Math.max(x1, ring[i]);
    z0 = Math.min(z0, ring[i + 1]); z1 = Math.max(z1, ring[i + 1]);
  }
  return { x0, z0, x1, z1 };
}
function insideRing(x, z, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    const zi = ring[i + 1], zj = ring[j + 1];
    if ((zi > z) !== (zj > z) && x < ring[i] + (ring[j] - ring[i]) * (z - zi) / (zj - zi)) inside = !inside;
  }
  return inside;
}
function waterMap(areas) {
  const polygons = [], edges = new Grid();
  for (const a of areas) {
    if (a.k !== 'water' || a.p.length < 6) continue;
    polygons.push({ ...a, ...bounds(a.p) });
    for (const ring of [a.p, ...(a.o ?? [])]) {
      for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) indexEdge(edges, { x: ring[j], z: ring[j + 1], ex: ring[i], ez: ring[i + 1] });
    }
  }
  const contains = (x, z) => polygons.some((p) => x >= p.x0 && x <= p.x1 && z >= p.z0 && z <= p.z1 && insideRing(x, z, p.p) && !p.o?.some((hole) => insideRing(x, z, hole)));
  return { edges, contains };
}
function shorelineStations(path, start, water) {
  const cuts = [start, path.length];
  for (const e of path.edges) {
    if (e.s + e.length <= start) continue;
    for (const f of water.edges.near((e.x + e.ex) / 2, (e.z + e.ez) / 2, e.length / 2)) {
      const dx = f.ex - f.x, dz = f.ez - f.z;
      const divisor = e.tx * dz - e.tz * dx;
      if (Math.abs(divisor) < EPS) continue;
      const x = f.x - e.x, z = f.z - e.z;
      const along = (x * dz - z * dx) / divisor;
      const across = (x * e.tz - z * e.tx) / divisor;
      if (along >= 0 && along <= e.length && across >= 0 && across <= 1 && e.s + along > start + EPS && e.s + along < path.length - EPS) cuts.push(e.s + along);
    }
  }
  cuts.sort((a, b) => a - b);
  const breaks = cuts.filter((s, i) => !i || s - cuts[i - 1] > EPS);
  const towers = [];
  let wet;
  for (let i = 1; i < breaks.length; i++) {
    const p = pointAt(path, (breaks[i - 1] + breaks[i]) / 2);
    const next = water.contains(p.x, p.z);
    if (i > 1 && wet !== next) towers.push(breaks[i - 1]);
    wet = next;
  }
  return towers;
}
// (structureBoxes: oriented boxes batched per material, an instanced mesh each. Here a leaf's own boxes, in its frame)
function structureBoxes() {
  const batches = new Map();
  const axisY = new THREE.Vector3(), axisX = new THREE.Vector3(), axisZ = new THREE.Vector3();
  const position = new THREE.Vector3(), scale = new THREE.Vector3();
  const rotation = new THREE.Quaternion(), basis = new THREE.Matrix4(), matrix = new THREE.Matrix4();
  let members = 0;
  function push(name, x, y, z, length, height, width, colour) {
    if (!batches.has(name)) batches.set(name, []);
    batches.get(name).push({ matrix: matrix.compose(position.set(x, y, z), rotation, scale.set(length, height, width)).clone(), colour });
  }
  return {
    // an axis-aligned box in the leaf's frame (x along the leaf, z across it)
    box(name, x0, x1, y0, y1, z0, z1, colour) {
      rotation.identity();
      push(name, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0, colour);
    },
    beam(name, a, b, width, colour) {
      axisY.set(b.x - a.x, b.y - a.y, b.z - a.z);
      const length = axisY.length();
      if (length <= EPS) return;
      axisY.divideScalar(length);
      axisX.set(axisY.z, 0, -axisY.x);
      if (axisX.lengthSq() < EPS * EPS) axisX.set(1, 0, 0); else axisX.normalize();
      axisZ.crossVectors(axisX, axisY).normalize();
      rotation.setFromRotationMatrix(basis.makeBasis(axisX, axisY, axisZ));
      push(name, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, width, length, width, colour);
      members++;
    },
    flush(parent, materials) {
      const geometry = new THREE.BoxGeometry(1, 1, 1), tint = new THREE.Color();
      let triangles = 0;
      for (const [name, boxes] of batches) {
        const mesh = new THREE.InstancedMesh(geometry, materials[name], boxes.length);
        mesh.name = `Bascule ${name}`;
        boxes.forEach((box, i) => { mesh.setMatrixAt(i, box.matrix); mesh.setColorAt(i, tint.setHex(box.colour ?? 0xffffff)); });
        mesh.castShadow = true; mesh.receiveShadow = true;
        mesh.computeBoundingSphere();
        parent.add(mesh);
        triangles += boxes.length * 12;
      }
      batches.clear();
      return { members, triangles };
    }
  };
}
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

// The town's frame: (lat, lon) to its metres (hg1: x east and z south of the frame's origin, turned by its bearing)
function toLocal(frame, lat, lon) {
  const e = (lon - frame.lon0) * Math.cos((frame.lat0 * Math.PI) / 180) * 111320;
  const n = (lat - frame.lat0) * 110574;
  const b = ((frame.bearingDeg || 0) * Math.PI) / 180;
  return { x: e * Math.cos(b) - n * Math.sin(b), z: -(n * Math.cos(b) + e * Math.sin(b)) };
}

function townWants() {
  let q = null;
  try { q = new URLSearchParams(location.search).get('bascule'); } catch { /* no address */ }
  if (q === '0' || q === 'off') return null;
  const PKG = window.NYC.PKG, GEO = window.NYC.GEO;
  if (!PKG || !GEO || !GEO.roadGraph || !GEO.water) return null;
  const town = BASCULE_TOWNS[PKG.id] || (q === '1' ? { name: PKG.name || 'town', lat: null, radius: Infinity } : null);
  if (!town) return null;
  const frame = GEO.frame || PKG.frame;
  const c = town.lat !== null && frame && Number.isFinite(frame.lat0) ? toLocal(frame, town.lat, town.lon) : null;
  return { ...town, cx: c ? c.x : 0, cz: c ? c.z : 0, any: !c };
}

// The spans: every river crossing of the decks near the Loop (before grade-separation.js builds its floors)
let SPANS = null;
function findSpans() {
  if (SPANS) return SPANS;
  SPANS = [];
  const want = townWants();
  if (!want) return SPANS;
  const RG = window.NYC.GEO.roadGraph, N = RG.nodes;
  const ways = [];
  for (const l of RG.links) {
    const [a, b, ni, w, , , inner, flags, , , , , elev] = l;
    if (!Array.isArray(elev) || elev.length < 3 || flags & (1 | 2 | 4 | 8 | 16)) continue; // (decks only: no tunnels, freeways, paths)
    const p = [N[2 * a], N[2 * a + 1], ...(inner || []), N[2 * b], N[2 * b + 1]];
    const mx = (p[0] + p[p.length - 2]) / 2, mz = (p[1] + p[p.length - 1]) / 2;
    if (!want.any && Math.hypot(mx - want.cx, mz - want.cz) > want.radius) continue;
    const road = { p, w: w || 9, k: RG.names[ni] || '' };
    // (streets only: not an expressway's or Lake Shore Drive's deck, nor a way with no name)
    if (!road.k || SKIP_NAMES.test(road.k)) continue;
    const edges = segments(road);
    if (edges.length) ways.push({ road, edges });
  }
  const water = waterMap((window.NYC.GEO.water || []).map((wt) => ({ k: 'water', p: wt.ring || [] })));
  for (const path of roadPaths(ways)) {
    if (path.length < SPAN_MIN) continue;
    const shores = shorelineStations(path, 0, water);
    for (let i = 0; i + 1 < shores.length; i++) {
      const s0 = shores[i], s1 = shores[i + 1], w = s1 - s0;
      if (w < SPAN_MIN || w > SPAN_MAX) continue;
      const m = pointAt(path, (s0 + s1) / 2);
      if (!water.contains(m.x, m.z)) continue;
      const a = pointAt(path, Math.max(0, s0 - HINGE_BACK)), b = pointAt(path, Math.min(path.length, s1 + HINGE_BACK));
      const L = Math.hypot(b.x - a.x, b.z - a.z);
      if (L < SPAN_MIN) continue;
      const ux = (b.x - a.x) / L, uz = (b.z - a.z) / L;
      // (one span per crossing: a street's two carriageways (two paths) and its links split on the water join it)
      const twin = SPANS.find((s) => Math.abs(s.ux * ux + s.uz * uz) > 0.97 && Math.abs((m.x - s.mx) * s.uz - (m.z - s.mz) * s.ux) < 24 &&
        Math.abs((m.x - s.mx) * s.ux + (m.z - s.mz) * s.uz) < 12);
      if (twin) continue;
      SPANS.push({ id: SPANS.length, name: titleCase(m.road.k).replace(/\bLower /, ''), ax: a.x, az: a.z, bx: b.x, bz: b.z, ux, uz, L, mx: m.x, mz: m.z,
        lo: Infinity, hi: -Infinity, ya: [], yb: [], segs: [], angle: 0, anim: null });
    }
  }
  if (SPANS.length) console.info(`[bascule] ${want.name}: ${SPANS.length} river bridges as bascules (${SPANS.map((s) => s.name).join(', ')})`);
  return SPANS;
}
const titleCase = (s) => String(s || '').toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());

// grade-separation.js: the stretch of a deck floor a bascule stands in, [t0, t1] along it, or null. Also notes the
// floor's width and height at the hinges on the span (its leaves are as wide as every floor it cuts)
function claim(seg) {
  const spans = findSpans();
  if (!spans.length || seg.kind !== 'deck') return null;
  for (const s of spans) {
    const par = seg.dx * s.ux + seg.dz * s.uz;
    if (Math.abs(par) < 0.97) continue;
    // its offset across the span's axis, and the hinges along it
    const off = (seg.x0 - s.ax) * -s.uz + (seg.z0 - s.az) * s.ux;
    if (Math.abs(off) > 30) continue;
    const ta = (s.ax - seg.x0) * seg.dx + (s.az - seg.z0) * seg.dz, tb = (s.bx - seg.x0) * seg.dx + (s.bz - seg.z0) * seg.dz;
    const lo = Math.max(seg.t0, Math.min(ta, tb)), hi = Math.min(seg.t1, Math.max(ta, tb));
    if (hi - lo < 1.5) continue;
    // (lateral: the floor's [L, R] in the span's frame (its right is -v, v = (-uz, ux)), offset as it stands)
    const sideL = par > 0 ? -seg.R : seg.L, sideR = par > 0 ? -seg.L : seg.R;
    const vOff = (seg.x0 - s.ax) * -s.uz + (seg.z0 - s.az) * s.ux;
    s.lo = Math.min(s.lo, vOff + sideL); s.hi = Math.max(s.hi, vOff + sideR);
    const yAt = (t) => { const k = Math.min(seg.ys.length - 1, Math.max(0, (t - seg.t0) / 2)); const i = Math.min(seg.ys.length - 2, Math.floor(k)); return i < 0 ? seg.ys[0] : seg.ys[i] + (seg.ys[i + 1] - seg.ys[i]) * (k - i); };
    if (ta >= seg.t0 - 0.5 && ta <= seg.t1 + 0.5) s.ya.push(yAt(ta));
    if (tb >= seg.t0 - 0.5 && tb <= seg.t1 + 0.5) s.yb.push(yAt(tb));
    s.segs.push(seg);
    return [lo, hi];
  }
  return null;
}
// is (x, z) inside a span's footprint (between its hinges, across its width + pad)
function covers(x, z, pad = 1) {
  for (const s of findSpans()) {
    if (!s.segs.length) continue;
    const t = (x - s.ax) * s.ux + (z - s.az) * s.uz, o = (x - s.ax) * -s.uz + (z - s.az) * s.ux;
    if (t > -0.2 && t < s.L + 0.2 && o > s.lo - pad && o < s.hi + pad) return s;
  }
  return null;
}

// Built once the grade floors stand: the leaves, the houses, the floor and the API
function buildBascules(scene, grade) {
  const spans = findSpans().filter((s) => s.segs.length && s.hi > s.lo);
  const api = { spans, list, nearest, set, raise, angle, update, floorAt: leafFloor, leafAt, covers };
  window.NYC.Bascules = api;
  if (!spans.length) return api;
  const N = window.NYC, T = N.Terrain;
  const wl = T && Number.isFinite(T.waterLevel) ? T.waterLevel : 0;
  const group = new THREE.Group();
  group.name = 'Bascules';
  scene.add(group);

  // materials: the road's own surface, steel (Chicago's dark bridge grey), concrete, limestone, copper, warm windows
  const steel = new THREE.MeshStandardNodeMaterial({ color: 0xffffff, roughness: 0.62, metalness: 0.25 });
  const concrete = new THREE.MeshStandardNodeMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 });
  const stone = N.createMarbleAshlarMaterial ? N.createMarbleAshlarMaterial() : new THREE.MeshStandardNodeMaterial({ color: 0xcfc6b4, roughness: 0.85 });
  const copper = new THREE.MeshStandardNodeMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0.15 });
  const glass = new THREE.MeshStandardNodeMaterial({ color: 0x20262e, roughness: 0.25, metalness: 0.1 });
  const { smoothstep, color: tcolor } = N.TSL;
  if (N.cityUniforms && N.cityUniforms.uInteriorGlow) glass.emissiveNode = tcolor(0xffc27a).mul(smoothstep(0.4, 1.3, N.cityUniforms.uInteriorGlow).mul(0.9));
  const road = N.createRoadSurfaceMaterial ? N.createRoadSurfaceMaterial() : concrete;
  const MATS = { steel, concrete, stone, copper, glass };
  const STEEL = 0x3f4a4d, STEEL_D = 0x2c3436, CONC = 0x8a857a;

  for (const s of spans) {
    // (the hinges' height: the top deck's (a double-deck crossing, Michigan Ave's, carries its leaves at the upper level;
    // its lower deck ends at the river walls))
    const top = (v) => { if (!v.length) return null; const m = Math.max(...v), k = v.filter((y) => y > m - 2.5); return k.reduce((p, q) => p + q, 0) / k.length; };
    s.yA = top(s.ya);
    s.yB = top(s.yb);
    if (s.yA === null) s.yA = s.yB; if (s.yB === null) s.yB = s.yA;
    s.half = s.L / 2 - 0.04;
    s.yM = (s.yA + s.yB) / 2;
    s.width = s.hi - s.lo;
    s.leaves = [];
    for (const side of [0, 1]) {
      const hx = side ? s.bx : s.ax, hz = side ? s.bz : s.az, hy = side ? s.yB : s.yA;
      const ux = side ? -s.ux : s.ux, uz = side ? -s.uz : s.uz;
      // (the leaf's frame: x along it to its tip, z across: v = (-uz, ux) for leaf A; leaf B's runs the other way)
      const zL = side ? -s.hi : s.lo, zR = side ? -s.lo : s.hi;
      const rest = Math.atan2(s.yM - hy, s.half);
      const leaf = { span: s, side, hx, hy, hz, ux, uz, vx: -uz, vz: ux, zL, zR, len: s.half / Math.cos(rest), rest, phi: rest, omega: 0 };
      leaf.group = new THREE.Group();
      leaf.group.position.set(hx, hy, hz);
      leaf.group.rotation.y = Math.atan2(-uz, ux);
      leaf.pivot = new THREE.Group();
      leaf.pivot.rotation.z = rest;
      leaf.group.add(leaf.pivot);
      buildLeaf(leaf);
      group.add(leaf.group);
      s.leaves.push(leaf);
    }
    buildHouses(s);
  }

  function buildLeaf(leaf) {
    const { len, zL, zR } = leaf, B = structureBoxes();
    const W = zR - zL;
    // deck: the roadway (the road's own surface), slab under it, sidewalks either side
    const g = new THREE.BufferGeometry();
    const rx0 = 0, rx1 = len, rz0 = zL + WALK, rz1 = zR - WALK;
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([rx0, 0, rz0, rx1, 0, rz0, rx1, 0, rz1, rx0, 0, rz1]), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
    g.setIndex([0, 2, 1, 0, 3, 2]);
    const deck = new THREE.Mesh(g, road);
    deck.receiveShadow = true;
    leaf.pivot.add(deck);
    B.box('concrete', 0, len, -DECK_T, -0.02, zL, zR, CONC);
    for (const [a, b] of [[zL, zL + WALK], [zR - WALK, zR]]) B.box('concrete', 0, len, -0.02, 0.16, a, b, 0xb0aa9c);
    // the lane lines: dashed white between the lanes, the double yellow in the middle (two-way)
    const mid = (zL + zR) / 2;
    for (let x = 1; x + 3 < len; x += 4) for (const o of [-0.12, 0.12]) B.box('concrete', x, x + 3.2, 0.005, 0.03, mid + o - 0.05, mid + o + 0.05, 0xd8a820);
    // railings: posts every 2 m and a top rail on each edge
    for (const z of [zL + 0.12, zR - 0.12]) {
      for (let x = 0.3; x < len; x += 2) B.box('steel', x - 0.06, x + 0.06, 0.16, 1.15, z - 0.06, z + 0.06, STEEL);
      B.beam('steel', { x: 0, y: 1.12, z }, { x: len, y: 1.12, z }, 0.1, STEEL);
      B.beam('steel', { x: 0, y: 0.62, z }, { x: len, y: 0.62, z }, 0.06, STEEL);
    }
    // the truss under the deck: a girder on each side (and in the middle of a wide one), deepest at the trunnion,
    // its bottom chord curving up toward the tip; verticals and diagonals every PANEL m; floor beams across
    const PANEL = 3.6, girders = W > 14 ? [zL + 0.9, mid, zR - 0.9] : [zL + 0.9, zR - 0.9];
    const depth = (x) => mix(5.6, 1.5, Math.pow(Math.min(1, Math.max(0, x / len)), 0.8));
    const top = -DECK_T - 0.05;
    const n = Math.max(2, Math.round(len / PANEL));
    for (const z of girders) {
      let prev = null;
      for (let i = 0; i <= n; i++) {
        const x = (len * i) / n, bot = top - depth(x);
        const P = { t: { x, y: top, z }, b: { x, y: bot, z } };
        B.beam('steel', P.t, P.b, 0.32, STEEL);
        if (prev) {
          B.beam('steel', prev.t, P.t, 0.42, STEEL);
          B.beam('steel', prev.b, P.b, 0.5, STEEL_D);
          B.beam('steel', i % 2 ? prev.b : prev.t, i % 2 ? P.t : P.b, 0.26, STEEL_D);
        }
        prev = P;
      }
    }
    for (let i = 0; i <= n; i++) { const x = (len * i) / n; B.box('steel', x - 0.18, x + 0.18, top - 0.55, top, zL + 0.6, zR - 0.6, STEEL_D); }
    // the trunnion (its axle across) and the counterweight behind it, swinging down into its pit as the leaf rises
    B.beam('steel', { x: 0, y: -2.6, z: zL + 0.3 }, { x: 0, y: -2.6, z: zR - 0.3 }, 0.9, STEEL_D);
    B.box('concrete', -7.5, -1.2, -7.2, -1.6, zL + 0.8, zR - 0.8, 0x8c877c);
    for (const z of girders) B.beam('steel', { x: -7.5, y: top - 1.2, z }, { x: 0, y: top - depth(0), z }, 0.5, STEEL_D);
    B.flush(leaf.pivot, MATS);
  }

  // a bridge house at each corner: a limestone tender's house on its pier by the trunnion, standing over the deck
  // with a cornice and a copper hip roof; windows on its faces, lit at night. Each a collider
  function buildHouses(s) {
    const B = structureBoxes(), houses = new THREE.Group();
    houses.position.set(s.ax, 0, s.az);
    houses.rotation.y = Math.atan2(-s.uz, s.ux);
    const HW = 4.2, HL = 5.4, H = 6.2;
    for (const side of [0, 1]) for (const lat of [-1, 1]) {
      const x0 = side ? s.L + 0.6 : -0.6 - HL, x1 = x0 + HL;
      const z0 = lat < 0 ? s.lo - 0.5 - HW : s.hi + 0.5, z1 = z0 + HW;
      const y = side ? s.yB : s.yA, base = Math.min(wl - 0.5, y - 8);
      B.box('stone', x0, x1, base, y + H, z0, z1, 0xd6cfbf);
      B.box('stone', x0 - 0.25, x1 + 0.25, y + H, y + H + 0.45, z0 - 0.25, z1 + 0.25, 0xe2dccd); // cornice
      B.box('stone', x0 - 0.15, x1 + 0.15, y - 0.2, y + 0.7, z0 - 0.15, z1 + 0.15, 0xc8c0ae); // plinth band at the deck
      // the roof: three stepped slabs to a ridge (a hip roof's look), copper green
      for (let k = 0; k < 3; k++) {
        const ins = 0.2 + k * 0.85;
        B.box('copper', x0 + ins, x1 - ins, y + H + 0.45 + k * 0.7, y + H + 1.15 + k * 0.7, z0 + ins * 0.8, z1 - ins * 0.8, 0x5f8f7c);
      }
      // windows: two on each long face, one on each end, over the deck
      for (const fx of [x0 + HL * 0.3, x0 + HL * 0.7]) for (const fz of [z0 - 0.04, z1 + 0.04]) B.box('glass', fx - 0.5, fx + 0.5, y + 2.2, y + 4.6, fz - 0.05, fz + 0.05);
      for (const fx of [x0 - 0.04, x1 + 0.04]) B.box('glass', fx - 0.05, fx + 0.05, y + 2.2, y + 4.6, (z0 + z1) / 2 - 0.55, (z0 + z1) / 2 + 0.55);
      // its collider in the world (an oriented box, the controllers' frame: local z along (dx, dz))
      const cx = s.ax + s.ux * (x0 + x1) / 2 + -s.uz * (z0 + z1) / 2, cz = s.az + s.uz * (x0 + x1) / 2 + s.ux * (z0 + z1) / 2;
      const hz = HL / 2, hx = HW / 2, ex = Math.abs(s.ux) * hx + Math.abs(s.uz) * hz, ez = Math.abs(s.uz) * hx + Math.abs(s.ux) * hz;
      // (sn, cs: the box's local z is the span's axis u)
      grade.colliders.push({ minX: cx - ex, maxX: cx + ex, minZ: cz - ez, maxZ: cz + ez, minY: base, maxY: y + H + 2.5, obb: { cx, cz, hx, hz, cs: s.uz, sn: s.ux } });
    }
    B.flush(houses, MATS);
    group.add(houses);
    // (the leaves' own railings as walls while the bridge is down: their tops dropped out of reach once it rises)
    s.walls = [];
    for (const lat of [s.lo + 0.15, s.hi - 0.15]) {
      const ox = -s.uz * lat, oz = s.ux * lat, cx = (s.ax + s.bx) / 2 + ox, cz = (s.az + s.bz) / 2 + oz;
      const hz = s.L / 2, hx = 0.15, ex = Math.abs(s.ux) * hx + Math.abs(s.uz) * hz, ez = Math.abs(s.uz) * hx + Math.abs(s.ux) * hz;
      const c = { minX: cx - ex, maxX: cx + ex, minZ: cz - ez, maxZ: cz + ez, minY: Math.min(s.yA, s.yB) - 1, maxY: Math.max(s.yA, s.yB) + 1.15, obb: { cx, cz, hx, hz, cs: s.uz, sn: s.ux }, below: 0.5 };
      c._maxY = c.maxY;
      grade.colliders.push(c);
      s.walls.push(c);
    }
  }

  // ── the floor: each leaf's surface, at its angle ──
  // (for something at height y over (x, z): the leaf's surface there when y is within the band over it; inside a span's
  // footprint the static floors (a disc at a node on the water, a deck the traffic left out) do not count)
  const gFloor = grade.floorAt, gOnDeck = grade.onDeckAt;
  grade.floorAt = (x, z, y) => {
    const s = covers(x, z, 0.6);
    if (!s) return gFloor(x, z, y);
    const f = leafAt(x, z, y);
    return f ? f.y : null;
  };
  if (gOnDeck) grade.onDeckAt = (x, z, y) => (covers(x, z, 0.6) ? !!leafAt(x, z, y) : gOnDeck(x, z, y));
  return api;

  // the leaf under (x, z) for something at y: { y, slope (rise per metre along u, the leaf's way), vLift (m/s up of the
  // surface there, the leaf turning), ux, uz }
  function leafAt(x, z, y) {
    const s = covers(x, z, 0.6);
    if (!s || !s.leaves) return null;
    let best = null;
    for (const l of s.leaves) {
      const px = x - l.hx, pz = z - l.hz;
      const h = px * l.ux + pz * l.uz, o = px * l.vx + pz * l.vz;
      if (o < l.zL - 0.3 || o > l.zR + 0.3) continue;
      const c = Math.cos(l.phi);
      if (h < -0.3 || h > l.len * c + 0.05) continue;
      const tan = Math.tan(l.phi), fy = l.hy + h * tan;
      if (y !== undefined && y !== null && !(y > fy - FLOOR_BAND)) continue;
      if (!best || fy > best.y) best = { y: fy, slope: tan, vLift: l.omega * h / (c * c), ux: l.ux, uz: l.uz, span: s.id };
    }
    return best;
  }
  function leafFloor(x, z, y) { const f = leafAt(x, z, y); return f ? f.y : null; }

  function list() {
    return spans.map((s) => ({ id: s.id, name: s.name, x: +((s.ax + s.bx) / 2).toFixed(1), z: +((s.az + s.bz) / 2).toFixed(1), span: +s.L.toFixed(1),
      width: +s.width.toFixed(1), angle: +s.angle.toFixed(2), hinges: [[+s.ax.toFixed(1), +s.yA.toFixed(2), +s.az.toFixed(1)], [+s.bx.toFixed(1), +s.yB.toFixed(2), +s.bz.toFixed(1)]] }));
  }
  function nearest(x, z) {
    let best = null, bd = Infinity;
    for (const s of spans) { const d = Math.hypot((s.ax + s.bx) / 2 - x, (s.az + s.bz) / 2 - z); if (d < bd) { bd = d; best = s; } }
    return best ? best.id : null;
  }
  function spanOf(ref) {
    if (typeof ref === 'number') return spans.find((s) => s.id === ref) || null;
    if (Array.isArray(ref)) { const id = nearest(ref[0], ref[1]); return id === null ? null : spanOf(id); }
    if (typeof ref === 'string') {
      const r = ref.toLowerCase();
      if (r === 'nearest') { const p = window.__NYC_APP?.controllerManager?.getActiveEntity()?.position; return p ? spanOf([p.x, p.z]) : null; }
      return spans.find((s) => s.name.toLowerCase().includes(r)) || null;
    }
    return null;
  }
  function angle(ref) { const s = spanOf(ref); return s ? s.angle : null; }
  function apply(s, deg) {
    s.angle = Math.max(0, Math.min(MAX_DEG, deg));
    const a = (s.angle * Math.PI) / 180;
    for (const l of s.leaves) { l.phi = l.rest + a; l.pivot.rotation.z = l.phi; }
    for (const c of s.walls || []) c.maxY = s.angle > 2 ? -1e9 : c._maxY;
  }
  function set(ref, deg) {
    const s = spanOf(ref);
    if (!s) return null;
    s.anim = null;
    for (const l of s.leaves) l.omega = 0;
    apply(s, deg);
    return s.id;
  }
  // raise (or lower) to `to` degrees over `dur` s after `delay` s; ease 'inOut' (default), 'linear' or 'out'
  function raise(ref, o = {}) {
    const s = spanOf(ref ?? 'nearest');
    if (!s) return Promise.resolve(null);
    const to = Math.max(0, Math.min(MAX_DEG, o.to ?? 70)), dur = Math.max(0.05, o.dur ?? 8);
    return new Promise((res) => { s.anim = { from: s.angle, to, dur, t: -(o.delay || 0), ease: o.ease || 'inOut', res }; });
  }
  function update(dt) {
    for (const s of spans) {
      const A = s.anim;
      if (!A) continue;
      A.t += dt;
      if (A.t < 0) continue;
      const k = Math.min(1, A.t / A.dur);
      const e = A.ease === 'linear' ? k : A.ease === 'out' ? 1 - (1 - k) * (1 - k) : k * k * (3 - 2 * k);
      const before = s.angle;
      apply(s, A.from + (A.to - A.from) * e);
      const w = dt > 0 ? (((s.angle - before) * Math.PI) / 180) / dt : 0;
      for (const l of s.leaves) l.omega = w;
      if (k >= 1) { s.anim = null; for (const l of s.leaves) l.omega = 0; A.res(s.id); }
    }
  }
}

Object.assign(window.NYC, { basculeClaim: claim, basculeCovers: covers, buildBascules, BASCULE_TOWNS, basculePort: { roadPaths, shorelineStations, structureBoxes, waterMap, pointAt, segments } });
})();
