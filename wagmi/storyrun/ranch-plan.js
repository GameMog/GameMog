// Mog City story runner: where a ranch goes in a town, and how it is laid out (a plain module: no three.js, for the
// tests, node --test tests/storyrun-ranch.test.mjs). ranch.js builds what this plans.
// A Story Kit world asks for a ranch at one of its places (world.ranches: [{ at: '<place key>', sign, cattle, horses }]):
// a rural place the town's map does not have (Colter Land's Colter Ranch). It is dressed on open land near that place,
// at the edge of the town where there is room: a plot fronting a road, clear of every building, road, sidewalk and
// the water, on ground that is not too steep, inside the town's map. The plot's frame:
//   u  along the road (metres, + to the right looking in from the road), v  away from the road, into the ranch (0 its
//   front fence, the gate in its middle), heading  the way in (+v), as the world's headings: 0 faces +z
// The layout, in that frame, sized to the plot (a full one 110 x 96 m, down to a compact 74 x 70 m: deep enough for the barn and a pasture, shallow enough that
// every mark is in reach of the road on foot, reach.js's 90 m): the front
// fence with the gate and its overhead sign, the dirt drive and yard, the farmhouse with its porch facing the road,
// the barn and the stable, a round corral with the horses, a windmill over a water trough, hay bales, a pasture behind
// a cross fence with the cattle; every fence open where a way goes through it (the gate, the corral's, the pasture's),
// so every mark is reached on foot from the road (reach.js: no ring inside a building, none walled in).
//   findRanchSite({ anchor, edges, solid, blocked, height, inMap, crowd, R, Rmax, sizes, ms }) -> site | null
//   layoutRanch(site) -> { items, marks }   items in the plot's frame; marks: name -> { u, v, deg, foot }
//   toWorld(site, u, v) -> { x, z };  markAt(site, name) -> { x, z, heading, foot } | null

// the plot sizes tried, largest first
export const RANCH_SIZES = [{ w: 110, d: 96 }, { w: 96, d: 88 }, { w: 84, d: 78 }, { w: 74, d: 70 }];
// the marks a world may send the player to (a place alias's `ranch`)
export const RANCH_MARKS = ['gate', 'yard', 'porch', 'barn', 'stable', 'corral', 'windmill', 'hay', 'pasture'];
// metres of verge between the road's edge and the front fence (the drive's mouth, the mailbox)
export const VERGE = 7;

export function toWorld(site, u, v) {
  return { x: site.x + site.ux * u + site.vx * v, z: site.z + site.uz * u + site.vz * v };
}

// the plot's footprint in the world, padded by m: its four corners
export function corners(site, pad = 0) {
  const { w, d } = site;
  return [[-w / 2 - pad, -VERGE + 2], [w / 2 + pad, -VERGE + 2], [w / 2 + pad, d + pad], [-w / 2 - pad, d + pad]].map(([u, v]) => toWorld(site, u, v));
}

// a candidate plot, fronting edge e at s along it, on its side (+1 right of its direction, -1 left)
function plotOf(e, s, side, size) {
  const half = Number.isFinite(e.half) ? e.half : 5;
  const px = e.x0 + e.dx * s, pz = e.z0 + e.dz * s;
  // v points away from the road, u along it to the right looking in
  const vx = e.rx * side, vz = e.rz * side;
  const ux = -vz, uz = vx;
  const off = half + VERGE;
  return { x: px + vx * off, z: pz + vz * off, ux, uz, vx, vz, w: size.w, d: size.d, heading: Math.atan2(vx, vz), road: { x: px, z: pz, half } };
}

// is the plot clear: every sample over it (every `step` m, the coarse ones first) on open dry ground of the map, its
// ground within `slope` m of level
function plotClear(site, { solid, blocked, height, inMap, step = 4, slope = 9 }) {
  const { w, d } = site;
  if (solid && solid(site)) return false;
  const us = [], vs = [];
  for (let u = -w / 2 - 2; u <= w / 2 + 2.01; u += step) us.push(u);
  for (let v = -VERGE + 2.5; v <= d + 2.01; v += step) vs.push(v);
  // (the corners and the middle first: most plots fail there)
  const order = [];
  for (const [a, b] of [[0, 0], [us.length - 1, 0], [0, vs.length - 1], [us.length - 1, vs.length - 1], [us.length >> 1, vs.length >> 1]]) order.push([a, b]);
  for (let j = 0; j < vs.length; j += 3) for (let i = 0; i < us.length; i += 3) order.push([i, j]);
  for (let j = 0; j < vs.length; j++) for (let i = 0; i < us.length; i++) if (i % 3 || j % 3) order.push([i, j]);
  let lo = Infinity, hi = -Infinity;
  for (const [i, j] of order) {
    const p = toWorld(site, us[i], vs[j]);
    if (inMap && !inMap(p.x, p.z)) return false;
    if (blocked(p.x, p.z)) return false;
    if (height && (i % 3 === 0 && j % 3 === 0)) { const y = height(p.x, p.z); if (Number.isFinite(y)) { lo = Math.min(lo, y); hi = Math.max(hi, y); if (hi - lo > slope) return false; } }
  }
  site.y0 = Number.isFinite(lo) ? lo : 0; site.y1 = Number.isFinite(hi) ? hi : 0;
  return true;
}

// the plot for a ranch near anchor { x, z }: the plots fronting the roads within R m (Rmax when there is none), tried
// in the order a ranch is wanted (the fewest buildings round them first, the edge of the town and the open land past
// it; then the nearest, then the largest), each tried largest first; of the first `keep` that are clear, the best.
// What each try costs is bounded by time (ms), never by a count of tries: a whole town's dense middle used to spend a
// fixed budget on its nearest plots and find nothing (Bozeman's whole town, 16 Nov). null when there is none (the
// world plays its place as it is)
//   crowd(x, z): the buildings round a point (0 open land, 1 a built-up street; cheap: it is asked of every candidate)
export function findRanchSite({ anchor, edges, solid = null, blocked, height = null, inMap = null, crowd = null, R = 1800, Rmax = 4200, sizes = RANCH_SIZES, every = 26, keep = 8, ms = 900, now = () => (globalThis.performance ? performance.now() : Date.now()) }) {
  if (!anchor || !Array.isArray(edges)) return null;
  const t0 = now();
  const gather = (Rr) => {
    const cands = [];
    for (const e of edges) {
      if (!e || e.bore || !(e.span >= 24)) continue;
      const mx = e.x0 + e.dx * e.span / 2, mz = e.z0 + e.dz * e.span / 2;
      if (Math.hypot(mx - anchor.x, mz - anchor.z) > Rr + e.span / 2) continue;
      const n = Math.max(1, Math.floor(e.span / every));
      for (let k = 0; k < n; k++) {
        const s = (k + 0.5) * e.span / n;
        const px = e.x0 + e.dx * s, pz = e.z0 + e.dz * s, dist = Math.hypot(px - anchor.x, pz - anchor.z);
        if (dist > Rr) continue;
        for (const side of [1, -1]) {
          // (how built-up the land is where the plot would be: half its depth in from the road)
          const half = Number.isFinite(e.half) ? e.half : 5, off = half + VERGE + sizes[0].d / 2;
          const qx = px + e.rx * side * off, qz = pz + e.rz * side * off;
          if (inMap && !inMap(qx, qz)) continue;
          const cr = crowd ? crowd(qx, qz) : 0;
          cands.push({ e, s, side, dist, crowd: cr, key: cr * 2 + dist / 600 });
        }
      }
    }
    cands.sort((a, b) => a.key - b.key || a.dist - b.dist);
    return cands;
  };
  const found = [];
  const tryAll = (cands) => {
    for (const c of cands) {
      if (found.length >= keep || now() - t0 > ms) break;
      // (a candidate on land already taken by a plot found: the same land)
      const f0 = plotOf(c.e, c.s, c.side, sizes[0]);
      if (found.some((f) => Math.hypot(f.x - f0.x, f.z - f0.z) < 40)) continue;
      for (const [si, size] of sizes.entries()) {
        const site = plotOf(c.e, c.s, c.side, size);
        if (!plotClear(site, { solid, blocked, height, inMap })) continue;
        if (found.some((f) => Math.hypot(f.x - site.x, f.z - site.z) < 40)) break;
        const mid = toWorld(site, 0, size.d / 2);
        site.dist = c.dist; site.crowd = crowd ? crowd(mid.x, mid.z) : 0;
        // (the fewest buildings round it first: a ranch is at the edge of the town; then the nearest, then the largest)
        site.score = site.crowd * 2 + c.dist / 600 - (sizes.length - si - 1) * 0.4;
        found.push(site);
        break;
      }
    }
  };
  tryAll(gather(R));
  // (nothing near: the open land further out, the town's edge whichever way it is)
  if (!found.length && Rmax > R && now() - t0 <= ms) tryAll(gather(Rmax).filter((c) => c.dist > R));
  if (!found.length) return null;
  found.sort((a, b) => a.score - b.score);
  return found[0];
}

// the layout in the plot's frame, scaled to its size (the buildings keep their own sizes; where they stand moves)
export function layoutRanch(site) {
  const W = site.w, D = site.d, su = W / 110, sv = D / 110;
  const at = (u, v) => [u * su, v * sv];
  const items = [];
  const add = (kind, o) => { items.push({ kind, ...o }); return o; };
  // the frontage: post-and-rail either side of the gate, barbed wire on out to the corners; the sides and the back
  // barbed wire; the cross fence before the pasture, open in its middle
  const G = 3.6, PR = Math.min(26, W / 2 - 6);
  add('gate', { u: 0, v: 0, half: G });
  add('fence', { style: 'rail', from: [-PR, 0], to: [-G - 0.4, 0] });
  add('fence', { style: 'rail', from: [G + 0.4, 0], to: [PR, 0] });
  add('fence', { style: 'wire', from: [-W / 2, 0], to: [-PR, 0] });
  add('fence', { style: 'wire', from: [PR, 0], to: [W / 2, 0] });
  add('fence', { style: 'wire', from: [-W / 2, 0], to: [-W / 2, D] });
  add('fence', { style: 'wire', from: [W / 2, 0], to: [W / 2, D] });
  add('fence', { style: 'wire', from: [-W / 2, D], to: [W / 2, D] });
  const pv = D * 0.8;
  add('fence', { style: 'wire', from: [-W / 2, pv], to: [-3.5, pv] });
  add('fence', { style: 'wire', from: [3.5, pv], to: [W / 2, pv] });
  add('gateOpen', { u: 0, v: pv, half: 3.5 });
  // the drive and the yard
  const yard = at(0, 50);
  add('dirt', { kind2: 'drive', from: [0, -VERGE + 0.5], to: yard, width: 5 });
  add('dirt', { kind2: 'yard', u: yard[0], v: yard[1], r: 17 * Math.min(su, sv) + 2 });
  add('dirt', { kind2: 'drive', from: [yard[0], pv - 2], to: yard, width: 3.4 });
  add('mailbox', { u: 4.2, v: -VERGE + 1.6 });
  // the farmhouse, its porch to the road; the barn's doors and the stable's stalls to the yard
  const house = at(-30, 40), barn = at(27, 68), stable = at(-24, 74);
  add('house', { u: house[0], v: house[1], w: 12, d: 9, porch: 3, face: -1 });
  add('barn', { u: barn[0], v: barn[1], w: 14, d: 20 });
  add('stable', { u: stable[0], v: stable[1], w: 22, d: 7 });
  // the corral between the gate and the barn, its gate to the drive; the windmill and its trough; the hay by the barn
  const cor = at(20, 26), cr = 9 * Math.min(1, Math.max(0.8, su));
  add('corral', { u: cor[0], v: cor[1], r: cr, gapAt: Math.PI, gap: 3.2 });
  add('trough', { u: cor[0] + cr * 0.45, v: cor[1] + cr * 0.3, len: 2.6, ry: 0.4 });
  const mill = at(44, 42);
  add('windmill', { u: mill[0], v: mill[1] });
  add('trough', { u: mill[0] - 3.4, v: mill[1] + 0.6, len: 3.2, ry: Math.PI / 2, round: true });
  const hay = at(44, 72);
  add('hay', { u: hay[0], v: hay[1], n: 9 });
  add('hay', { u: -8 * su, v: pv - 7, n: 3, loose: true });
  // the yard's own clutter, round the barn and the house
  add('props', { list: [
    { id: 'burn-barrel', u: barn[0] - 9, v: barn[1] - 12 }, { id: 'old-tyre', u: barn[0] - 10.5, v: barn[1] - 9.5, ry: 0.4 },
    { id: 'dead-trunk', u: house[0] + 8.5, v: house[1] + 6, ry: 1.2 }, { id: 'shrub', u: house[0] - 4, v: house[1] - 8.6 },
    { id: 'shrub', u: house[0] + 4.5, v: house[1] - 8.4 }, { id: 'blue-drum', u: stable[0] + 12.5, v: stable[1] - 4.5 },
  ] });
  // the herds: horses in the corral, cattle in the pasture
  add('horses', { u: cor[0], v: cor[1], r: cr - 1.6 });
  add('cattle', { u0: -W / 2 + 4, u1: W / 2 - 4, v0: pv + 3, v1: D - 3 });
  // the marks (foot: a person's spot; the gate is a car's too)
  const marks = {
    gate: { u: 0, v: -VERGE + 1.5, deg: 0, foot: false },
    yard: { u: yard[0], v: yard[1], deg: 0, foot: true },
    porch: { u: house[0], v: house[1] - 4.5 - 3 - 2.2, deg: 0, foot: true },
    barn: { u: barn[0], v: barn[1] - 10 - 3.5, deg: 0, foot: true },
    stable: { u: stable[0], v: stable[1] - 3.5 - 3, deg: 0, foot: true },
    corral: { u: cor[0] - cr - 2.2, v: cor[1], deg: 90, foot: true },
    windmill: { u: mill[0] - 3.4, v: mill[1] - 2.8, deg: 0, foot: true },
    hay: { u: hay[0], v: hay[1] - 3, deg: 0, foot: true },
    pasture: { u: 0, v: pv - 2.5, deg: 0, foot: true },
  };
  return { items, marks };
}

// a mark in the world: { x, z, heading, foot }
export function markAt(site, name) {
  const L = site.layout || (site.layout = layoutRanch(site));
  const m = L.marks[name]; if (!m) return null;
  const p = toWorld(site, m.u, m.v);
  return { x: p.x, z: p.z, heading: site.heading + (m.deg || 0) * Math.PI / 180, foot: m.foot };
}

/* ------------------------------------------------------------------ a cow's head down to the grass */
// The ranch's cow (assets/props/cow.glb) is a still scan with no skeleton: in its own (geometry) space it stands on y 0,
// its head forward along +z (the neck narrows at z 0.5-0.6, the head runs to the muzzle at z 1.22, y 0.93-1.18). Grazing
// bends only the neck and head: each vertex's weight ramps up from the shoulder (z0) to behind the ears (z1); a weighted
// vertex turns about the neck's pivot by graze x weight x ang radians and drops (the neck reaching down) by drop, so the
// muzzle comes to the grass. Everything behind the shoulder (the body, the legs) never moves. This is the reference the
// cattle's vertex shader (ranch.js cattle()) mirrors node for node: it runs on the geometry's own position, before the
// cow's instance matrix, and the instance's yaw and scale carry the bend out to where the cow stands.
export const COW_NECK = { z0: 0.42, z1: 0.82, pivotY: 1.24, pivotZ: 0.46, ang: 0.9, drop: 0.5, reach: 0.26 };
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export function cowGrazeWeight(z, N = COW_NECK) { return smooth(N.z0, N.z1, z); }
// a geometry-space vertex [x, y, z] of the cow, its head brought down by graze (0 up .. 1 down): the bent vertex
export function cowGrazeBend([x, y, z], graze, N = COW_NECK) {
  const w = cowGrazeWeight(z, N) * graze, a = N.ang * w, c = Math.cos(a), s = Math.sin(a);
  const dy = y - N.pivotY, dz = z - N.pivotZ;
  return [x, N.pivotY + dy * c - dz * s - N.drop * w, N.pivotZ + dy * s + dz * c + N.reach * w];
}
// the bend carried out to the cow in its herd: its instance at pos, turned yaw about y, scaled sc. The instance's own
// position of the unbent vertex plus the bend's offset turned and scaled with it (what the shader adds to positionLocal)
export function cowInstanceVertex(p, graze, { pos, yaw, sc }) {
  const b = cowGrazeBend(p, graze), d = [b[0] - p[0], b[1] - p[1], b[2] - p[2]];
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const at = (q) => [pos[0] + sc * (c * q[0] + s * q[2]), pos[1] + sc * q[1], pos[2] + sc * (-s * q[0] + c * q[2])];
  const o = at(p);
  return [o[0] + sc * (c * d[0] + s * d[2]), o[1] + sc * d[1], o[2] + sc * (-s * d[0] + c * d[2])];
}
