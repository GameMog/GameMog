// The story runner's ranch (wagmi/storyrun/ranch-plan.js: where a ranch goes in a town and how it is laid out;
// ranch.js builds it): a plot fronting a road, clear of the town, every mark outdoors and in reach of the road on foot
// (reach.js: 90 m), none inside a building, the layout inside its plot; and the world check of world.ranches.
//   node --test tests/storyrun-ranch.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { findRanchSite, layoutRanch, markAt, toWorld, RANCH_SIZES, RANCH_MARKS, VERGE } from '../wagmi/storyrun/ranch-plan.js';
import { searchFromRoad } from '../wagmi/storyrun/reach.js';

// a town in boxes: one long road along z (x = 0, 10 m wide), its edge at the town's buildings
const road = { x0: 0, z0: -800, dx: 0, dz: 1, rx: -1, rz: 0, span: 1600, half: 5 };
const inBox = (b, x, z, r = 0) => x > b.minX - r && x < b.maxX + r && z > b.minZ - r && z < b.maxZ + r;
function town(boxes, extra = {}) {
  return {
    edges: [road],
    blocked: (x, z) => Math.abs(x) < road.half + 1.5,
    solid: (site) => boxes.some((b) => { for (let u = -site.w / 2; u <= site.w / 2; u += 4) for (let v = -VERGE + 2; v <= site.d; v += 4) { const p = toWorld(site, u, v); if (inBox(b, p.x, p.z, 1)) return true; } return false; }),
    crowd: (x, z) => boxes.filter((b) => Math.hypot((b.minX + b.maxX) / 2 - x, (b.minZ + b.maxZ) / 2 - z) < 160).length / 40,
    height: () => 0,
    ...extra,
  };
}

test('a ranch fronts the road, its gate on it, its plot clear of the road', () => {
  const site = findRanchSite({ anchor: { x: 20, z: 0 }, ...town([]) });
  assert.ok(site, 'a plot on open land');
  assert.deepEqual([site.w, site.d], [RANCH_SIZES[0].w, RANCH_SIZES[0].d]);
  // (its front fence VERGE m off the road's edge, the way in away from the road)
  assert.ok(Math.abs(Math.abs(site.x) - (road.half + VERGE)) < 1e-6);
  assert.ok(Math.abs(site.vx) > 0.99 && Math.sign(site.vx) === Math.sign(site.x));
  const gate = markAt(site, 'gate');
  assert.ok(Math.abs(gate.x) - road.half < 9, 'the gate (a car\'s end) within 9 m of the road: reach.js car rule');
});

test('a ranch keeps off the town: the plot moves past the buildings, to the emptier side', () => {
  // (buildings all along the east side near the anchor; the west side is open past z 300)
  const boxes = [];
  for (let z = -800; z < 800; z += 30) boxes.push({ minX: 10, maxX: 30, minZ: z, maxZ: z + 20 });
  for (let z = -800; z < 300; z += 30) boxes.push({ minX: -30, maxX: -10, minZ: z, maxZ: z + 20 });
  const site = findRanchSite({ anchor: { x: 0, z: 0 }, ...town(boxes) });
  assert.ok(site);
  assert.ok(site.x < 0, 'on the open (west) side');
  for (const b of boxes) for (const [u, v] of [[-site.w / 2, 0], [site.w / 2, 0], [-site.w / 2, site.d], [site.w / 2, site.d], [0, site.d / 2]]) {
    const p = toWorld(site, u, v); assert.ok(!inBox(b, p.x, p.z), 'no building in the plot');
  }
});

test('a whole town: past its dense middle to the open land at its edge, however many plots the middle has', () => {
  // (Bozeman's whole town, 16 Nov: a grid of streets every 50 m over 2 km, built up wall to wall, the open land past a
  // road beyond it; a fixed count of tries spent on the middle's nearest plots found nothing)
  const edges = [];
  for (let x = -1000; x <= 1000; x += 50) edges.push({ x0: x, z0: -1000, dx: 0, dz: 1, rx: -1, rz: 0, span: 2000, half: 5 });
  for (let z = -1000; z <= 1000; z += 50) edges.push({ x0: -1000, z0: z, dx: 1, dz: 0, rx: 0, rz: 1, span: 2000, half: 5 });
  edges.push({ x0: 1400, z0: -1500, dx: 0, dz: 1, rx: -1, rz: 0, span: 3000, half: 5 });
  const built = (x, z) => Math.abs(x) < 1060 && Math.abs(z) < 1060;
  const roadAt = (x, z) => edges.some((e) => (e.dx ? Math.abs(z - e.z0) < 7 && x > e.x0 - 7 && x < e.x0 + e.span + 7 : Math.abs(x - e.x0) < 7 && z > e.z0 - 7 && z < e.z0 + e.span + 7));
  const site = findRanchSite({
    anchor: { x: 600, z: 0 }, edges, height: () => 0,
    blocked: (x, z) => roadAt(x, z),
    solid: (s) => [[-s.w / 2, 0], [s.w / 2, 0], [-s.w / 2, s.d], [s.w / 2, s.d], [0, s.d / 2]].some(([u, v]) => { const p = toWorld(s, u, v); return built(p.x, p.z); }),
    crowd: (x, z) => (built(x, z) ? 2 : 0),
  });
  assert.ok(site, 'a plot on the open land');
  for (const [u, v] of [[-site.w / 2, 0], [site.w / 2, 0], [-site.w / 2, site.d], [site.w / 2, site.d]]) { const p = toWorld(site, u, v); assert.ok(p.x > 1060, `past the town, on its outer road (x ${p.x.toFixed(0)})`); }
  assert.equal(site.crowd, 0);
  assert.deepEqual([site.w, site.d], [RANCH_SIZES[0].w, RANCH_SIZES[0].d]);
});

test('nothing within R: the open land further out (Rmax)', () => {
  const far = { x0: 2600, z0: -400, dx: 0, dz: 1, rx: -1, rz: 0, span: 800, half: 5 };
  const site = findRanchSite({ anchor: { x: 0, z: 0 }, edges: [far], blocked: (x) => Math.abs(x - 2600) < 6.5, height: () => 0 });
  assert.ok(site && site.dist > 1800, 'found past R');
  assert.equal(findRanchSite({ anchor: { x: 0, z: 0 }, edges: [far], blocked: (x) => Math.abs(x - 2600) < 6.5, Rmax: 1800 }), null);
});

test('no open land: no ranch (the place plays as it is)', () => {
  const site = findRanchSite({ anchor: { x: 0, z: 0 }, ...town([], { blocked: () => true }) });
  assert.equal(site, null);
  assert.equal(findRanchSite({ anchor: null, edges: [] }), null);
});

test('every size: the layout inside its plot, every mark outdoors, reached on foot from the road', () => {
  for (const size of RANCH_SIZES) {
    const site = { x: road.half + VERGE, z: 0, ux: 0, uz: -1, vx: 1, vz: 0, w: size.w, d: size.d, heading: Math.PI / 2 };
    const L = layoutRanch(site);
    // the buildings, the hay stack, the corral, the troughs as boxes in the plot's frame (u, v)
    const solids = [];
    for (const it of L.items) {
      if (it.kind === 'house') solids.push({ minX: it.u - it.w / 2, maxX: it.u + it.w / 2, minZ: it.v - it.d / 2 - it.porch, maxZ: it.v + it.d / 2 });
      if (it.kind === 'barn' || it.kind === 'stable') solids.push({ minX: it.u - it.w / 2, maxX: it.u + it.w / 2, minZ: it.v - it.d / 2 - (it.kind === 'stable' ? 2.6 : 0), maxZ: it.v + it.d / 2 });
      if (it.kind === 'hay' && !it.loose) solids.push({ minX: it.u - 3.3, maxX: it.u + 3.3, minZ: it.v - 0.85, maxZ: it.v + 0.85 });
      if (it.kind === 'windmill') solids.push({ minX: it.u - 1.6, maxX: it.u + 1.6, minZ: it.v - 1.6, maxZ: it.v + 1.6 });
      if (it.kind === 'trough') solids.push({ minX: it.u - it.len / 2, maxX: it.u + it.len / 2, minZ: it.v - it.len / 2, maxZ: it.v + it.len / 2 });
    }
    const corral = L.items.find((i) => i.kind === 'corral');
    for (const s of solids) {
      assert.ok(s.minX >= -size.w / 2 && s.maxX <= size.w / 2 && s.minZ >= 0 && s.maxZ <= size.d, `${size.w}x${size.d}: inside the plot`);
      for (const t of solids) if (t !== s) assert.ok(!(s.minX < t.maxX && s.maxX > t.minX && s.minZ < t.maxZ && s.maxZ > t.minZ), `${size.w}x${size.d}: nothing stands in anything`);
    }
    // the fences: a line of posts, open only at the gates (the front gate, the pasture's, the corral's)
    const fences = L.items.filter((i) => i.kind === 'fence');
    const nearSeg = (u, v, f, r) => { const [a, b] = [f.from, f.to], du = b[0] - a[0], dv = b[1] - a[1], L2 = du * du + dv * dv, t = Math.max(0, Math.min(1, ((u - a[0]) * du + (v - a[1]) * dv) / L2)); return Math.hypot(a[0] + du * t - u, a[1] + dv * t - v) < r; };
    const ring = (u, v, r) => { const d = Math.hypot(u - corral.u, v - corral.v); if (Math.abs(d - corral.r) > r) return false; const a = Math.atan2(v - corral.v, u - corral.u); return Math.abs(Math.atan2(Math.sin(a - corral.gapAt), Math.cos(a - corral.gapAt))) > corral.gap / corral.r / 2; };
    const clear = (u, v) => !solids.some((s) => inBox(s, u, v, 0.3)) && !fences.some((f) => nearSeg(u, v, f, 0.42)) && !ring(u, v, 0.42) && u > -size.w / 2 - 30 && u < size.w / 2 + 30;
    for (const name of RANCH_MARKS) {
      const m = L.marks[name];
      assert.ok(m, name);
      if (!m.foot) continue;
      assert.ok(clear(m.u, m.v), `${size.w}x${size.d}: ${name} is outdoors`);
      // (on foot from the road: the road at v <= -VERGE, reach.js's search, 90 m out)
      const r = searchFromRoad({ x: m.u, z: m.v, clear, road: (u, v) => v <= -VERGE - 1 });
      assert.ok(r.ok, `${size.w}x${size.d}: ${name} reached on foot (${r.why})`);
    }
  }
});

test('the world check: ranches and ranch marks, closed shapes only', async () => {
  globalThis.location ??= new URL('http://127.0.0.1/');
  const { ranchErrors } = await import('../wagmi/storyrun/pack.js');
  assert.deepEqual(ranchErrors({ ranches: [{ at: 'colter-ranch', sign: 'Colter Ranch', brand: 'C', cattle: 10, horses: 3 }], places: { 'colter-ranch': { '@': 'gas_station2' }, porch: { '@': 'gas_station2', ranch: 'porch' } } }), []);
  assert.deepEqual(ranchErrors({}), []);
  assert.ok(ranchErrors({ ranches: [{ at: 'a' }, { at: 'b' }, { at: 'c' }] }).length);
  assert.ok(ranchErrors({ ranches: [{ at: 'a', cattle: 99 }] }).some((e) => /cattle/.test(e)));
  assert.ok(ranchErrors({ ranches: [{ at: 'a', brand: 'cc' }] }).some((e) => /brand/.test(e)));
  assert.ok(ranchErrors({ ranches: [{ at: 'a', script: 'x' }] }).some((e) => /script/.test(e)));
  assert.ok(ranchErrors({ places: { p: { '@': 'x', ranch: 'kitchen' } } }).some((e) => /ranch/.test(e)));
});

test('a grazing cow bends only its neck and head, about its own neck, wherever it stands in the herd', async () => {
  // (Colter Land's re-review, 16 Nov: the bend was worked on positionLocal, already instanced 80-90 m out in the ranch's
  // space, so a grazing cow swung about the ranch's corner and under the ground; most of the herd was out of sight)
  const { cowGrazeBend, cowGrazeWeight, cowInstanceVertex, COW_NECK } = await import('../wagmi/storyrun/ranch-plan.js');
  const { readFileSync } = await import('node:fs');
  // the cow's own verts (assets/props/cow.glb, geometry space: y up from its hooves, its head along +z)
  const glb = readFileSync(new URL('../assets/props/cow.glb', import.meta.url));
  const n = glb.readUInt32LE(12), j = JSON.parse(glb.subarray(20, 20 + n)), bin = glb.subarray(20 + n + 8);
  const verts = [];
  for (const m of j.meshes) for (const pr of m.primitives) {
    const a = j.accessors[pr.attributes.POSITION], bv = j.bufferViews[a.bufferView], off = (bv.byteOffset || 0) + (a.byteOffset || 0), st = bv.byteStride || 12;
    for (let i = 0; i < a.count; i++) verts.push([bin.readFloatLE(off + i * st), bin.readFloatLE(off + i * st + 4), bin.readFloatLE(off + i * st + 8)]);
  }
  assert.ok(verts.length > 3000);
  const graze = [0, 0.45, 0.95, 1.01];
  // the body and the legs (behind the shoulder) never move; the neck's weight is from the geometry's own z
  for (const p of verts) if (p[2] <= COW_NECK.z0) for (const g of graze) { const b = cowGrazeBend(p, g); assert.ok(Math.hypot(b[0] - p[0], b[1] - p[1], b[2] - p[2]) < 1e-9, `body vert ${p} moved`); }
  assert.equal(cowGrazeWeight(1.1), 1); assert.equal(cowGrazeWeight(0), 0);
  // head down: the muzzle (the lowest of the head, z past 1.1) comes to the grass, ahead of the front legs; no vert
  // goes more than 8 cm into the ground or more than 1.6 m from the cow's middle
  const muzzle = verts.filter((p) => p[2] > 1.1).map((p) => cowGrazeBend(p, 0.95));
  const low = Math.min(...muzzle.map((p) => p[1]));
  assert.ok(low < 0.15 && low > -0.08, `muzzle at the grass (${low.toFixed(2)} m)`);
  assert.ok(Math.min(...muzzle.map((p) => p[2])) > 0.6, 'the muzzle ahead of the front legs');
  for (const g of graze) for (const p of verts) { const b = cowGrazeBend(p, g); assert.ok(b[1] > -0.08 && Math.hypot(b[0], b[2]) < 1.6, `vert ${p} at graze ${g} -> ${b}`); }
  // in the herd: a cow 90 m out, turned and scaled, stays where it stands at every graze (its verts within 2 m of it)
  for (const inst of [{ pos: [88, 4.2, 91], yaw: 0, sc: 1 }, { pos: [-93, 1, 80], yaw: 2.3, sc: 1.06 }, { pos: [90, 0, -85], yaw: -1.1, sc: 0.94 }]) {
    for (const g of graze) for (const p of verts) {
      const q = cowInstanceVertex(p, g, inst);
      assert.ok(Math.hypot(q[0] - inst.pos[0], q[2] - inst.pos[2]) < 2 * inst.sc && q[1] > inst.pos[1] - 0.1 && q[1] < inst.pos[1] + 1.7, `cow at ${inst.pos} graze ${g}: ${q}`);
    }
    // (heads up, exactly the instance's own transform of the scan)
    const p = [0.1, 1.3, 1.0], q = cowInstanceVertex(p, 0, inst), c = Math.cos(inst.yaw), s = Math.sin(inst.yaw);
    assert.ok(Math.hypot(q[0] - (inst.pos[0] + inst.sc * (c * p[0] + s * p[2])), q[2] - (inst.pos[2] + inst.sc * (-s * p[0] + c * p[2]))) < 1e-9);
  }
  // the shader (ranch.js cattle) works the bend on positionGeometry, adding only the offset to positionLocal
  const src = readFileSync(new URL('../wagmi/storyrun/ranch.js', import.meta.url), 'utf8');
  const sh = src.slice(src.indexOf('mat.positionNode = Fn('), src.indexOf('mat.normalNode'));
  assert.match(sh, /const P = positionGeometry;/);
  assert.match(sh, /smoothstep\(float\(N\.z0\), float\(N\.z1\), P\.z\)/);
  assert.equal((sh.match(/positionLocal/g) || []).length, 1, 'positionLocal only as the base the offset is added to');
  assert.match(sh, /return positionLocal\.add\(/);
});
