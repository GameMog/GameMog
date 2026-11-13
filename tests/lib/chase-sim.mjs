// A chase car in node, no browser: the real road network (cities/sf/js/road-network.js on a city's geodata), the
// real nav (wagmi/pursuit/nav.js) and steering (wagmi/pursuit/steer.js), a car moved the way index.js drive() moves
// it (no walls, no traffic, no slip), chasing a target that drives the lanes at 20 m/s. One city per process (the
// city's classic scripts declare globals): node tests/lib/chase-sim.mjs <sf | synthetic | pkg id> [seeds] [secs]
// prints one JSON line. Measured against the asphalt (within w/2 of a road graph link's centreline: the buffer the
// Hometown compiler cuts the curb islands with), not against the code's own onRoadway.
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const JS = path.join(ROOT, 'cities/sf/js/');
export const pkgDir = (id) => path.join(ROOT, 'cities/pkg/packages', id);
export const hasPkg = (id) => fs.existsSync(path.join(pkgDir(id), 'geodata.js'));

const clamp = (x, a, b) => Math.max(a, Math.min(b, x)), wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
function lcg(seed) { let s = seed >>> 0 || 1; return () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296); }

// a made-up town (no map data): a 6 x 6 grid 90 m apart, a cul-de-sac, a curved arterial, a one-way pair, lawns
function synthetic() {
  const nodes = [], links = [], P = (x, z) => (nodes.push(x, z), nodes.length / 2 - 1);
  const g = []; for (let i = 0; i < 6; i++) { g.push([]); for (let j = 0; j < 6; j++) g[i].push(P(i * 90 - 225, j * 90 - 225)); }
  const L = (a, b, w = 9, lanes = 2, dir = 0, inner = []) => links.push([a, b, 0, w, lanes, dir, inner, 0, 1.6, 1.6]);
  for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) {
    if (i + 1 < 6) L(g[i][j], g[i + 1][j], j === 2 ? 7 : 9, j === 2 ? 1 : 2, j === 2 ? 1 : 0);
    if (j + 1 < 6) L(g[i][j], g[i][j + 1], i === 3 ? 7 : 9, i === 3 ? 1 : 2, i === 3 ? -1 : 0);
  }
  const cul = P(-180, -140); L(g[0][1], cul, 7, 2);
  // (a curved arterial round the town's south-east, its bends as inner points)
  const inner = []; for (let k = 1; k < 12; k++) { const a = (k / 12) * Math.PI / 2; inner.push(225 + Math.sin(a) * 120, 225 - Math.cos(a) * 120 + 120); }
  const sweep = P(345, 345); L(g[5][3], sweep, 12, 2, 0, inner); L(sweep, g[3][5], 12, 2);
  return { nodes, links, names: ['SYNTHETIC ST'], nhoods: [''], linkNhood: links.map(() => 0), control: new Array(nodes.length / 2).fill(0), stopMask: new Array(nodes.length / 2).fill(0) };
}

// window.NYC for the city, its traffic network, the asphalt test
export function loadCity(name) {
  globalThis.window = globalThis; globalThis.NYC = { DEBUG_ROADS: false };
  Object.assign(globalThis, { Path2D: function () {}, document: globalThis.document || {}, location: new URL(`http://127.0.0.1/?city=${name === 'sf' ? 'sf' : 'pkg&pkg=' + name}`) });
  const run = (f) => vm.runInThisContext(fs.readFileSync(f, 'utf8'), { filename: f });
  if (name === 'synthetic') {
    // (a geodata on the sf base: the road graph, blocks cut by the compiler's rule are not needed: lawns everywhere)
    run(path.join(JS, 'sf-geodata.js'));
    const RG = synthetic(); NYC.GEO.roadGraph = RG;
  } else run(name === 'sf' ? path.join(JS, 'sf-geodata.js') : path.join(pkgDir(name), 'geodata.js'));
  run(path.join(JS, 'city-config.js')); run(path.join(JS, 'road-network.js'));
  const N = globalThis.NYC;
  const sidewalks = name === 'synthetic' ? [] : N.BLOCKS.filter((b) => b.poly.length >= 3).map((b) => ({ minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ, block: b }));
  const net = N.buildRoadNetwork(sidewalks, []);
  // the asphalt: within w/2 of a link's polyline (as compile.py cuts the curb islands); margin(x, z) in m, < 0 off it
  const RG = N.GEO.roadGraph, C = 16, grid = new Map(), key = (i, j) => i * 100003 + j, pos = (i) => ({ x: RG.nodes[2 * i], z: RG.nodes[2 * i + 1] });
  for (const Lk of RG.links) {
    const [a, b, , w, , , inner, flags] = Lk; if (flags & 8) continue;
    const pts = [pos(a)]; for (let k = 0; k < (inner || []).length; k += 2) pts.push({ x: inner[k], z: inner[k + 1] }); pts.push(pos(b));
    const hw = (w > 3 ? w : 9.1) / 2;
    for (let k = 0; k + 1 < pts.length; k++) {
      const s = { a: pts[k], b: pts[k + 1], hw };
      for (let i = Math.floor((Math.min(s.a.x, s.b.x) - hw) / C); i <= Math.floor((Math.max(s.a.x, s.b.x) + hw) / C); i++)
        for (let j = Math.floor((Math.min(s.a.z, s.b.z) - hw) / C); j <= Math.floor((Math.max(s.a.z, s.b.z) + hw) / C); j++) { const kk = key(i, j); if (!grid.has(kk)) grid.set(kk, []); grid.get(kk).push(s); }
    }
  }
  function margin(x, z) {
    let best = -99;
    for (const s of grid.get(key(Math.floor(x / C), Math.floor(z / C))) || []) {
      const ex = s.b.x - s.a.x, ez = s.b.z - s.a.z, L2 = ex * ex + ez * ez || 1e-9, t = clamp(((x - s.a.x) * ex + (z - s.a.z) * ez) / L2, 0, 1);
      best = Math.max(best, s.hw - Math.hypot(s.a.x + ex * t - x, s.a.z + ez * t - z));
    }
    return best;
  }
  // (the code's own road test, world.onRoadway (simulate sets it); the synthetic town has no blocks: the asphalt)
  const onRoadway = name === 'synthetic' ? (x, z) => margin(x, z) >= 0 : (x, z) => !N.blockAt(x, z);
  return { N, net, margin, onRoadway };
}

// the target: a car driving the lanes (random turns), 20 m/s
function laneTarget(net, rnd) {
  let e; for (;;) { e = net.edges[Math.floor(rnd() * net.edges.length)]; if (e.len > 40 && e.moves.length) break; }
  const T = { e, i: 0, s: 5, speed: 20, x: 0, z: 0, vx: 0, vz: 0, h: 0 };
  T.step = (dt) => {
    T.s += T.speed * dt;
    while (T.s > T.e.len) { const m = T.e.moves[Math.floor(rnd() * T.e.moves.length)]; if (!m) { T.s = T.e.len; break; } T.s -= T.e.len; const j = Math.max(0, m.out[T.i] ?? 0); T.e = m.to; T.i = Math.min(j, T.e.lanes.length - 1); }
    const E = T.e, o = E.lanes[T.i] ?? 0;
    T.x = E.sx + E.dx * T.s + E.rx * o; T.z = E.sz + E.dz * T.s + E.rz * o; T.vx = E.dx * T.speed; T.vz = E.dz * T.speed; T.h = Math.atan2(E.dx, E.dz);
  };
  T.step(0);
  return T;
}

// one chase car's step: steerFn(P, T, d, dt) -> { ax, az, vt, direct }, then drive() as index.js does (J-turn, stuck)
function driveStep(P, g, dt, S, C) {
  const err = wrap(Math.atan2(g.ax - P.x, g.az - P.z) - P.h);
  let st = clamp(err * 1.8, -0.62, 0.62), vt = g.vt;
  if (P.back <= 0 && (Math.abs(err) > 2.0 || (S && S.noseOff(C.onRoadway, P, err))) && Math.abs(P.speed) < 8 && vt > 2) { P.back = 1.0; P.backSteer = -Math.sign(err) * 0.62; }
  if (vt > 3 && Math.abs(P.speed) < 1.2 && P.back <= 0) P.stuck += dt; else P.stuck = Math.max(0, P.stuck - dt * 2);
  if (P.stuck > 1.2) { P.back = 1.1; P.backSteer = -Math.sign(err || 1) * 0.62; P.stuck = 0; }
  if (P.back > 0 && S && !S.backOK(C.onRoadway, P)) P.back = 0;
  if (P.back > 0) { P.back -= dt; vt = -7; st = P.backSteer; }
  P.steer += (st - P.steer) * Math.min(1, dt * 8);
  P.speed += clamp(vt - P.speed, -18 * dt, (vt < 0 ? 9 : 12) * dt);
  const sf = Math.min(1, Math.abs(P.speed) / 7) * Math.sign(P.speed);
  P.h += P.steer * 2.5 * sf * dt; P.x += Math.sin(P.h) * P.speed * dt; P.z += Math.cos(P.h) * P.speed * dt;
}

// the shipped steering (index.js steerFor + drive's rejoin, the parts that decide where it goes)
export async function shippedSteer(app, C, { navPath } = {}) {
  const { createNav } = await import(pathToFileURL(navPath || path.join(ROOT, 'wagmi/pursuit/nav.js')).href);
  const S = await import(pathToFileURL(path.join(ROOT, 'wagmi/pursuit/steer.js')).href);
  const nav = createNav(app, { rnd: C.rnd, world: { roadY: () => 0, onRoadway: C.onRoadway } });
  const fn = (P, T, d, dt, vmax0) => {
    let ax, az, vt = vmax0, direct = false;
    const close = P.speed - (T.vx * (T.x - P.x) + T.vz * (T.z - P.z)) / (d || 1), lead = clamp(d / Math.max(8, close), 0, 1.1);
    const lx = T.x + T.vx * lead, lz = T.z + T.vz * lead;
    direct = d < 62 && S.directOK(C.onRoadway, P, T, d, lx, lz);
    if (direct) {
      const th = T.h, rx = -Math.cos(th), rz = Math.sin(th);
      ax = lx + rx * P.side * 1.1 - Math.sin(th) * 1.2; az = lz + rz * P.side * 1.1 - Math.cos(th) * 1.2;
      vt = Math.min(vmax0 + 8, Math.max(vmax0, T.speed + 5)) + (d < 30 ? 3 : 0); P.path = null;
      vt = Math.min(vt, Math.max(8, S.reach(P, ax, az)));
    } else {
      P.planT -= dt;
      if (!P.path || P.planT <= 0) { P.path = nav.route({ x: P.x, z: P.z, h: P.speed < -1 ? P.h + Math.PI : P.h }, T); P.seg = 0; P.planT = 1.0; }
      const f = S.follow(P, P.path, vmax0); ax = f.ax; az = f.az; vt = Math.min(vt, f.vt);
    }
    const r = S.rejoin(P, dt, { onRoadway: C.onRoadway, locate: nav.locate, exempt: direct && S.excused(C.onRoadway, T, d), vmax: vmax0 });
    if (r) { ax = r.ax; az = r.az; vt = Math.min(r.vt, Math.max(4, S.reach(P, r.ax, r.az))); }
    return { ax, az, vt, direct, path: P.path, S };
  };
  return { fn, nav };
}

// N runs of secs s each; off: the share of samples off the asphalt (less those excused: straight at a target off the
// road from within 25 m)
export async function simulate(name, { seeds = 20, secs = 150, steer = shippedSteer, navPath, lawn = false, trace = null } = {}) {
  const C = loadCity(name);
  globalThis.__NYC_APP = { trafficSystem: { network: C.net }, controllerManager: { getGroundHeight: () => 0, nearColliders: () => [], baseHeight: () => 0 } };
  // (the code's own road test: the world contract's, wagmi/world/common.js onRoadway, on this city's blocks)
  if (name !== 'synthetic') { const { world } = await import(pathToFileURL(path.join(ROOT, 'wagmi/world/index.js')).href); C.onRoadway = (x, z) => world.onRoadway(x, z); }
  C.rnd = lcg(12345);
  const { fn, nav } = await steer(globalThis.__NYC_APP, C, { navPath });
  const dt = 1 / 30, vmax0 = 27;
  const out = { city: name, seeds, secs, samples: 0, off: 0, excused: 0, lawn3: 0, runsClean: 0, firstOff: [], longestOff: 0, straight: 0, routes: 0, caught: 0, caughtOf: 0 };
  for (let r = 0; r < seeds; r++) {
    const rnd = lcg(1000 + r * 7919); C.rnd = rnd;
    const T = laneTarget(C.net, rnd);
    let parked = null;
    if (lawn) {
      // (a target parked on a lawn: 6..14 m off its lane, off the road)
      for (let k = 0; k < 200 && !parked; k++) { const o = 6 + rnd() * 8, sd = rnd() < 0.5 ? -1 : 1; const x = T.x + Math.cos(T.h) * o * sd, z = T.z - Math.sin(T.h) * o * sd; if (C.margin(x, z) < -1.5) parked = { x, z }; if (!parked) T.step(3); }
      if (!parked) continue;
      Object.assign(T, parked, { vx: 0, vz: 0, speed: 0 }); T.step = () => {};
      out.caughtOf++;
    }
    const back = lawn ? 140 : 40;
    const sp = nav.onRoad(T.x - Math.sin(T.h) * back, T.z - Math.cos(T.h) * back) || { x: T.x, z: T.z, h: T.h };
    const P = { x: sp.x, z: sp.z, h: sp.h, speed: 15, steer: 0, path: null, pi: 0, seg: 0, planT: 0, side: rnd() < 0.5 ? -1 : 1, back: 0, stuck: 0, backSteer: 0 };
    let first = null, odo = 0, run = 0, caught = false;
    for (let t = 0; t < (lawn ? 60 : secs); t += dt) {
      T.step(dt);
      const d = Math.hypot(T.x - P.x, T.z - P.z);
      const g = fn(P, T, d, dt, vmax0);
      if (g.path && g.path !== P._lastPath) { P._lastPath = g.path; out.routes++; if (g.path.length === 1) out.straight++; }
      driveStep(P, g, dt, g.S, C); odo += Math.abs(P.speed) * dt;
      if (lawn) { if (Math.hypot(T.x - P.x, T.z - P.z) < 6) { caught = true; break; } continue; }
      const m = C.margin(P.x, P.z); out.samples++;
      if (trace) trace({ P, g, T, m, d, t, r, C });
      if (m < 0 && g.direct && d < 25 && C.margin(T.x, T.z) < 0) { out.excused++; continue; }
      if (m < 0) { out.off++; run += dt; out.longestOff = Math.max(out.longestOff, run); if (first == null) first = odo; if (m < -3) out.lawn3++; } else run = 0;
    }
    if (lawn) { if (caught) out.caught++; continue; }
    out.firstOff.push(first ?? Infinity);
    if (first == null) out.runsClean++;
  }
  const fo = out.firstOff.slice().sort((a, b) => a - b);
  out.offPct = out.samples ? +((100 * out.off) / out.samples).toFixed(2) : 0;
  out.medianFirstOff = fo.length ? (Number.isFinite(fo[fo.length >> 1]) ? Math.round(fo[fo.length >> 1]) : 'never') : null;
  out.longestOff = +out.longestOff.toFixed(2);
  out.nav = nav.stats ? nav.stats() : null;
  delete out.firstOff;
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const [name, seeds = '20', secs = '150', extra = ''] = process.argv.slice(2);
  const o = { seeds: +seeds, secs: +secs, lawn: extra === 'lawn' };
  if (process.env.STEER) { const m = await import(pathToFileURL(path.resolve(process.env.STEER)).href); o.steer = m.steer; }
  if (process.env.NAV) o.navPath = path.resolve(process.env.NAV);
  console.log(JSON.stringify(await simulate(name, o)));
  process.exit(0); // (the world module's timers keep node up)
}
