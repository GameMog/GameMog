// Mission sites (wagmi/world findMissionSites, the story runner's { site } refs): a small made-up town in node, no
// browser. The same town and the same request give the same sites, whatever order the town's data came in.
//   node --test tests/mission-sites.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.location = new URL('http://127.0.0.1:4663/?pack=x');

// a 7 x 7 grid of junctions 100 m apart, two-way: the x roads streets, the z roads avenues (axis 'ave'), one street
// that stops short (a dead end), a park block, a plaza, two landmarks, a pier, a raised highway over one street
function town({ reverse = false } = {}) {
  const nodes = [], edges = [], S = 100, K = 7;
  const node = (x, z) => { const n = { x, z, id: nodes.length, in: [], out: [], signal: (x + z) % 200 === 0 }; nodes.push(n); return n; };
  const grid = [];
  for (let i = 0; i < K; i++) { grid.push([]); for (let j = 0; j < K; j++) grid[i].push(node(i * S, j * S)); }
  const link = (a, b, axis, name) => {
    const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz), ux = dx / len, uz = dz / len;
    const e = { from: a, to: b, axis, name, sx: a.x, sz: a.z, dx: ux, dz: uz, rx: -uz, rz: ux, len, lanes: [1.75], bore: null, id: edges.length };
    edges.push(e); a.out.push(e); b.in.push(e); return e;
  };
  for (let i = 0; i < K; i++) for (let j = 0; j < K; j++) {
    const a = grid[i][j];
    if (i + 1 < K) { link(a, grid[i + 1][j], 'st', `${j + 1}TH ST`); link(grid[i + 1][j], a, 'st', `${j + 1}TH ST`); }
    if (j + 1 < K) { link(a, grid[i][j + 1], 'ave', `${String.fromCharCode(65 + i)} AVE`); link(grid[i][j + 1], a, 'ave', `${String.fromCharCode(65 + i)} AVE`); }
  }
  // (a dead-end street off C Ave, between 3rd and 4th: 60 m long)
  const stub = node(260, 250), c = node(200, 250);
  link(c, stub, 'st', 'STUB CT'); link(stub, c, 'st', 'STUB CT');
  for (const g of [grid[2][2], grid[2][3]]) { link(c, g, 'ave', 'C AVE'); link(g, c, 'ave', 'C AVE'); }
  const roadDist = (x, z) => {
    let d = Math.min(Math.abs(((x % S) + S) % S - 0), Math.abs(((x % S) + S) % S - S), Math.abs(((z % S) + S) % S - 0), Math.abs(((z % S) + S) % S - S));
    if (z > 244 && z < 256 && x > 200 && x < 262) d = Math.min(d, Math.abs(z - 250));
    return d;
  };
  const colliders = [
    { minX: 120, maxX: 180, minZ: 120, maxZ: 180, minY: 0, maxY: 30 }, // a building in block (1,1)
    { minX: 420, maxX: 480, minZ: 120, maxZ: 180, minY: 0, maxY: 40 },
  ];
  const blocks = [
    { id: 0, cx: 350, cz: 350, area: 4500, park: 1, parkName: 'Town Green', median: false, minX: 306, maxX: 394, minZ: 306, maxZ: 394 },
    { id: 1, cx: 150, cz: 350, area: 4500, park: 1, parkName: 'Founders Plaza', median: false, minX: 106, maxX: 194, minZ: 306, maxZ: 394 },
    { id: 2, cx: 150, cz: 150, area: 4500, park: 0, parkName: '', median: false, minX: 106, maxX: 194, minZ: 106, maxZ: 194 },
  ];
  const inBlock = (b, x, z) => x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ;
  const NYC = {
    CITY: 'ny', BLOCKS: blocks, ROADS: [], TELEPORT_LOCATIONS: { hall: { x: 300, z: 300, heading: 0 }, depot: { x: 0, z: 600, heading: Math.PI } },
    NYC_LANDMARKS: [{ id: 'clock', name: 'the Clock Tower', x: 150, z: 150 }, { id: 'mill', name: 'the Old Mill', x: 450, z: 150 }],
    LANDMARK_SITES: {}, WATERFRONT_PIERS: [{ name: 'Pier 1', cx: 700, cz: 300, ring: [[650, 290], [750, 290], [750, 310], [650, 310]] }],
    GEO: { plazas: [] },
    blockAt: (x, z) => blocks.find((b) => inBlock(b, x, z)) || null,
    blocksInRect: () => blocks,
    districtAt: () => 'midtown',
    nearestRoads: (x, z) => {
      const out = [];
      const st = Math.round(z / S), av = Math.round(x / S);
      out.push({ road: { name: `${st + 1}th St`, pts: [{ x: -1000, z: st * S }, { x: 2000, z: st * S }] }, horizontal: true, d: Math.abs(z - st * S) });
      out.push({ road: { name: `${String.fromCharCode(65 + Math.max(0, Math.min(6, av)))} Ave`, pts: [{ x: av * S, z: -1000 }, { x: av * S, z: 2000 }] }, horizontal: false, d: Math.abs(x - av * S) });
      return out.sort((a, b) => a.d - b.d);
    },
  };
  const cm = {
    getGroundHeight: (x, z) => (roadDist(x, z) > 6 ? 0.15 : 0),
    baseHeight: () => 0,
    inParkWater: () => false,
    nearColliders: (x, z, r) => colliders.filter((c) => Math.hypot(Math.max(c.minX - x, 0, x - c.maxX), Math.max(c.minZ - z, 0, z - c.maxZ)) <= r),
  };
  // (a highway deck 8 m up, along 2nd St from A to D Ave)
  const hw = { pts: [] };
  for (let x = 0; x <= 300; x += 10) hw.pts.push({ x, y: 8, z: 100 });
  const net = { nodes: reverse ? nodes.slice().reverse() : nodes, edges: reverse ? edges.slice().reverse() : edges };
  return { NYC, app: { controllerManager: cm, trafficSystem: { network: net }, highwayTraffic: { lanes: [hw] } } };
}
function use(t) { globalThis.window = { NYC: t.NYC, __NYC_APP: t.app }; }

const T0 = town();
use(T0);
const { createWorld, SITE_KINDS, seededOrder, hash32 } = await import('../wagmi/world/common.js');
const { createNY } = await import('../wagmi/world/ny.js');
const { createSF } = await import('../wagmi/world/sf.js');
const { createPlaces } = await import('../wagmi/storyrun/places.js');
const { check } = await import('../wagmi/storyrun/pack.js');

const keys = (list) => list.map((s) => s.key);
const near = { x: 300, z: 300 };

test('the seeded order is fixed: the same seed the same order, sorted by key first (not by the data\'s order)', () => {
  assert.equal(hash32('mog'), hash32('mog'));
  assert.notEqual(hash32('mog'), hash32('mog2'));
  const list = ['d', 'a', 'c', 'b', 'e', 'f', 'g'].map((key) => ({ key }));
  assert.deepEqual(keys(seededOrder(list, 7)), keys(seededOrder(list.slice().reverse(), 7)));
  assert.notDeepEqual(keys(seededOrder(list, 7)), keys(seededOrder(list, 8)));
  // (pinned: a change to the generator would move every Mog's sites)
  assert.deepEqual(keys(seededOrder(list, 'pin')), keys(seededOrder(list, 'pin')));
  assert.equal(hash32('abc'), 440920331);
});

test('every kind of the vocabulary resolves in the made-up town, each on a lane with the place beside it', () => {
  use(T0);
  const w = createNY();
  for (const kind of SITE_KINDS) {
    const got = w.findMissionSites({ kind, near });
    if (kind === 'gas_station' || kind === 'store' || kind === 'parking') assert.ok(got.length && got.every((s) => s.fallback), `${kind}: the fallback stands in`);
    else assert.ok(got.length, `${kind}: found`);
    for (const s of got) {
      assert.equal(s.kind, kind);
      for (const k of ['x', 'z', 'heading', 'cx', 'cz', 'd']) assert.ok(Number.isFinite(s[k]), `${kind} ${s.key}: ${k}`);
      assert.ok(typeof s.name === 'string' && s.name, `${kind} ${s.key}: name`);
    }
  }
  assert.deepEqual(w.findMissionSites({ kind: 'dead_end' }).map((s) => s.key), ['deadend:49']);
  assert.match(w.findMissionSites({ kind: 'dead_end' })[0].name, /^the end of /);
  assert.equal(w.findMissionSites({ kind: 'park', near })[0].name, 'Town Green');
  assert.deepEqual(w.findMissionSites({ kind: 'plaza' }).map((s) => s.name).sort(), ['Founders Plaza', 'Town Green']);
  assert.ok(w.findMissionSites({ kind: 'straight_road', minLen: 500 }).every((s) => s.length >= 500));
  assert.ok(w.findMissionSites({ kind: 'bridge' }).every((s) => s.deck === 8 && /overpass/.test(s.name)));
  assert.deepEqual(w.findMissionSites({ kind: 'nowhere' }), []);
});

test('findMissionSites is deterministic: the same request twice, a fresh world, the town\'s data in reverse order', () => {
  use(T0);
  const a = createNY(), b = createNY();
  use(town({ reverse: true }));
  const c = createNY();
  for (const kind of SITE_KINDS) for (const seed of ['w|M1|0', 42]) {
    const req = { kind, near, max: 700, seed, count: 4 };
    use(T0);
    const ka = keys(a.findMissionSites(req)), ka2 = keys(a.findMissionSites(req)), kb = keys(b.findMissionSites(req));
    use(town({ reverse: true }));
    const kc = keys(c.findMissionSites(req));
    assert.deepEqual(ka, ka2, `${kind} ${seed}: twice`);
    assert.deepEqual(ka, kb, `${kind} ${seed}: a fresh world`);
    assert.deepEqual(ka, kc, `${kind} ${seed}: the data reversed`);
  }
  use(T0);
  // (another seed, another order, where there is a choice)
  assert.notDeepEqual(keys(a.findMissionSites({ kind: 'junction', seed: 1 })), keys(a.findMissionSites({ kind: 'junction', seed: 2 })));
  // (no seed: nearest first, ties by key)
  const ds = a.findMissionSites({ kind: 'junction', near }).map((s) => s.d);
  assert.deepEqual(ds, ds.slice().sort((x, y) => x - y));
});

test('the constraints hold: distance, road class, open ground, a sightline, avoid, count', () => {
  use(T0);
  const w = createNY();
  const R = w.findMissionSites({ kind: 'junction', near, min: 150, max: 260 });
  assert.ok(R.length && R.every((s) => s.d >= 150 && s.d <= 260));
  assert.ok(w.findMissionSites({ kind: 'junction', road: 'avenue' }).every((s) => s.road === 'avenue'));
  assert.ok(w.findMissionSites({ kind: 'junction', road: 'street' }).every((s) => s.road === 'street'));
  assert.equal(w.findMissionSites({ kind: 'junction', count: 3 }).length, 3);
  const av = w.findMissionSites({ kind: 'junction', near, avoid: [{ x: 300, z: 300, r: 120 }] });
  assert.ok(av.every((s) => Math.hypot(s.cx - 300, s.cz - 300) >= 120));
  // (the Clock Tower's block is all building: no open ground at its front a metre in, the Mill likewise; the park has it)
  assert.ok(w.findMissionSites({ kind: 'park', open: 6 }).length >= 1);
  const lm = w.findMissionSites({ kind: 'landmark', roadView: true });
  assert.ok(lm.length >= 1);
  const sig = w.findMissionSites({ kind: 'junction', signal: true });
  assert.ok(sig.length && sig.every((s) => s.signal === true));
});

test('the old call shape is unchanged: no kind, the place library nearest first', () => {
  use(T0);
  const w = createNY();
  const got = w.findMissionSites({ near, max: 600, count: 3 });
  assert.equal(got[0].key, 'hall');
  assert.ok(got.every((s) => 'key' in s && 'x' in s && 'd' in s && !('kind' in s)));
  assert.deepEqual(keys(w.findMissionSites({ near, max: 10 })), ['hall']);
  // (and San Francisco's adapter answers the same town the same way)
  assert.deepEqual(keys(createSF().findMissionSites({ kind: 'junction', near, seed: 3, count: 5 })), keys(w.findMissionSites({ kind: 'junction', near, seed: 3, count: 5 })));
  assert.ok(typeof createWorld === 'function');
});

const pack = (missions, extra = {}) => ({ storykit: 1, id: 'site-test', title: 'Sites', cast: { Dan: { model: 'mogcity/dan' } }, hero: 'Dan', acts: [{ name: 'I', missions: missions.map((m) => m.id) }], missions, ...extra });
const M = (id, steps, start) => ({ id, title: id, ...(start ? { start } : {}), steps });

test('a pack may name a place by what it is: { site } refs pass the check, a wrong word does not', () => {
  use(T0);
  const good = pack([M('S1', [
    { type: 'drive', to: { site: { kind: 'gas_station', id: 'gas', max: 600 } } },
    { type: 'walk', to: { site: { kind: 'park', near: 'gas', open: 4, access: 'foot' } } },
    { type: 'drive', to: { site: 'gas' } },
  ], { site: { kind: 'junction', near: '@hall', road: 'avenue' } })]);
  assert.deepEqual(check(good), []);
  const bad = (steps) => check(pack([M('S1', steps)])).join('; ');
  assert.match(bad([{ type: 'drive', to: { site: { kind: 'castle' } } }]), /kind castle/);
  assert.match(bad([{ type: 'drive', to: { site: 'nope' } }]), /no earlier site nope/);
  assert.match(bad([{ type: 'drive', to: { site: { kind: 'park', max: -4 } } }]), /max/);
  assert.match(bad([{ type: 'drive', to: { site: { kind: 'park', where: 'x' } } }]), /where/);
  assert.match(bad([{ type: 'drive', to: { site: { kind: 'park', near: 'later' } } }, { type: 'drive', to: { site: { kind: 'park', id: 'later' } } }]), /near/);
  assert.match(bad([{ type: 'drive', to: { site: { kind: 'park', road: 'lane' } } }]), /road/);
});

test('a mission\'s sites are picked once, in its order, seeded: the same world the same sites, another seed others', () => {
  use(T0);
  const def = pack([
    M('S1', [
      { type: 'drive', to: { site: { kind: 'junction', id: 'a', near: '@hall', max: 400 } } },
      { type: 'drive', to: { site: { kind: 'junction', near: 'a', min: 100, max: 300 } } },
      { type: 'drive', to: { site: 'a' } },
    ], { site: { kind: 'junction', near: '@hall', max: 300 } }),
    M('S2', [{ type: 'walk', to: { site: { kind: 'park', access: 'foot' } } }]),
  ]);
  const W = {};
  const def2 = JSON.parse(JSON.stringify(def));
  const P1 = createPlaces(W, def), P2 = createPlaces(W, def2);
  const s1 = P1.prepare(def.missions[0]), s2 = P2.prepare(def2.missions[0]);
  const strip = (l) => l.map(({ kind, key, name, x, z }) => ({ kind, key, name, x, z }));
  assert.equal(s1.length, 3);
  assert.ok(s1.every((e) => e.key));
  assert.deepEqual(strip(s1), strip(s2));
  assert.deepEqual(strip(P1.prepare(def.missions[0])), strip(s1));
  // (the first ask resolves the whole mission; asked again it is the same object's same place)
  const steps = def.missions[0].steps;
  const a = P1.at(steps[0].to), again = P1.at(steps[0].to), byId = P1.at(steps[2].to);
  assert.deepEqual([a.x, a.z, a.name], [again.x, again.z, again.name]);
  assert.deepEqual([byId.x, byId.z], [a.x, a.z]);
  // (distinct: the second keeps its distance from the first, and both from the start)
  const b = P1.at(steps[1].to), st = P1.at(def.missions[0].start);
  assert.ok(Math.hypot(b.cx - a.cx, b.cz - a.cz) >= 40 && Math.hypot(st.cx - a.cx, st.cz - a.cz) >= 40);
  // (a foot site is where he walks to, the park itself)
  const park = P1.at(def.missions[1].steps[0].to);
  assert.equal(park.foot, true); assert.equal(park.name, 'Town Green');
  // (other world seeds, other choices where the town has them)
  const pick = (P, d) => d.missions[0].steps.slice(0, 2).map((s) => P.at(s.to).site);
  const seeds = new Set(['s1', 's2', 's3', 's4', 's5'].map((seed) => { const d = { ...JSON.parse(JSON.stringify(def)), seed }; return pick(createPlaces(W, d), d).join(); }));
  assert.ok(seeds.size > 1, 'seeds choose differently');
});
