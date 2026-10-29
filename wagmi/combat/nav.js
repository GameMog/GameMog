// Mog City: the fight's pathfinding. Recast Navigation (recast-navigation-js 0.43.1, MIT, js/vendor/recast/ with its
// LICENSE; Recast & Detour by Mikko Mononen, zlib; see NOTICE): a navmesh of the ground round a fight, and a DetourCrowd
// that walks the Suits over it (paths round what stands in the way, collision avoidance between them).
// The navmesh is the local area only (128 m square round the fight, rebuilt round Dan when the fight moves 38 m off its
// middle, or when a set's colliders come or go): the ground sampled every metre (the controllers' own ground height)
// and the walls of what stands on it, from what the game already collides with: the city's colliders (the buildings,
// a set's containers, rigs and fences: m2-set.js, m3-set.js push theirs in), the low things that are solid to the men
// below their tops (js/controllers.js lowObstacles: the parks' iron fences and lawn hoops, the benches, granite and
// planters; a man with no way round, or only a long one, hops them as before: enemy.js tryHop), and the street furniture that stands (window.NYC.breakables:
// the trees, lamp posts, hydrants, mailboxes, subway stairs). Built in a worker (nav-worker.js), so the frame never waits
// for it; the islands it can't reach from the fight (inside a building) pruned.
// Each Suit is a crowd agent while the fight's footwork walks him (enemy.js stepTo: circling his slot, closing in,
// going for a bottle, to the car): the crowd moves the agent, he follows it through the city's own collision (moveXZ),
// and his gait is picked from the agent's velocity (enemy.js LOCO: stride-matched, his feet don't slide). In anything
// else (a swing, a stumble, flying, down, a hop, a lookout on watch) his agent is held where he is, standing still: an
// obstacle the others walk round. Dan is one too. Until the navmesh is ready, or if the WASM fails to load, nobody has
// an agent and the fight's own steering does it (as before).
//   const nav = createNav(c);  nav.want(x, z) (a fight is coming here: build now) · nav.frame(dt, frozen) (before the
//   Suits' update) · nav.steer(e, p, sp) -> { x, z, vx, vz } | null · nav.resync(e) · nav.path(a, b) -> [{ x, y, z }] | null
//   nav.ready() · nav.stats · URL ?nav=0 (off: the old steering), ?navdebug (the navmesh drawn, each agent's way ahead)
import * as THREE from 'three/webgpu';

const VENDOR = new URL('../../js/vendor/recast/', import.meta.url).href;
const QS = new URLSearchParams(location.search);
const OFF = QS.get('nav') === '0', DEBUG = QS.has('navdebug');
const HALF = 64, STEP = 1, REBUILD = 38;
// (Recast's units: cs/ch m; the rest in voxels (detailSampleDist in cells, detailSampleMaxError in ch): a man
// 1.8 m tall, up a 0.4 m step (a curb, a lawn's bed), kept 0.6 m off the walls: the city's collision keeps him 0.5 m off
// them, enemy.js moveXZ)
const CFG = { cs: 0.2, ch: 0.1, walkableSlopeAngle: 45, walkableHeight: 18, walkableClimb: 4, walkableRadius: 3, maxEdgeLen: 60, maxSimplificationError: 1.3, minRegionArea: 8, mergeRegionArea: 20, maxVertsPerPoly: 6, detailSampleDist: 6, detailSampleMaxError: 1 };
// (the street furniture that stands: its kinds; the low things (bench, granite, planter) come from lowObstacles)
const ROUND = new Set(['tree', 'mast', 'cobra', 'post', 'hydrant', 'mailbox', 'basket', 'paperbox', 'stack', 'barricade', 'cart', 'lamp']);
const LOW = new Set(['bench', 'granite', 'planter']);

export function createNav(c) {
  const cm = c.cm, N = {
    stats: { load: null, gatherMs: 0, buildMs: 0, importMs: 0, tris: 0, polys: 0, builds: 0, crowdMs: 0, crowdFrames: 0, crowdMax: 0, error: null },
  };
  let R = null, worker = null, loading = null, failed = OFF, area = null, building = null, wants = [], navMesh = null, query = null, crowd = null, debugObj = null, pathLines = null;
  const agents = new Map();
  let dan = null, seq = 0;
  N.ready = () => !!crowd;
  N.off = () => failed;

  // ------------------------------------------------------------------ the library (once, on the first fight)
  function load() {
    if (loading || failed) return loading;
    const t0 = performance.now();
    loading = (async () => {
      try {
        const [core, wasm] = await Promise.all([import(VENDOR + 'core.mjs'), import(VENDOR + 'recast-navigation.wasm.js')]);
        await core.init(wasm.default);
        R = core;
        try { worker = new Worker(new URL('./nav-worker.js', import.meta.url), { type: 'module' }); worker.onmessage = onBuilt; worker.onerror = (ev) => { console.warn('[nav] worker', ev.message); worker = null; }; }
        catch (err) { worker = null; }
        N.stats.load = Math.round(performance.now() - t0);
      } catch (err) {
        failed = true; N.stats.error = String(err && err.message || err);
        console.warn('[nav] Recast failed to load: the fight steers as before', err);
      }
    })();
    return loading;
  }

  // ------------------------------------------------------------------ the area's triangles
  const ground = (x, z) => cm.getGroundHeight(x, z, 'person');
  // a convex polygon ([[x, z]...]) clipped to the square
  function clip(poly, x0, z0, x1, z1) {
    const edge = (P, inside, cut) => { const out = []; for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length], ia = inside(a), ib = inside(b); if (ia) out.push(a); if (ia !== ib) out.push(cut(a, b)); } return out; };
    const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    let P = poly;
    P = edge(P, (p) => p[0] >= x0, (a, b) => lerp(a, b, (x0 - a[0]) / (b[0] - a[0]))); if (P.length < 3) return null;
    P = edge(P, (p) => p[0] <= x1, (a, b) => lerp(a, b, (x1 - a[0]) / (b[0] - a[0]))); if (P.length < 3) return null;
    P = edge(P, (p) => p[1] >= z0, (a, b) => lerp(a, b, (z0 - a[1]) / (b[1] - a[1]))); if (P.length < 3) return null;
    P = edge(P, (p) => p[1] <= z1, (a, b) => lerp(a, b, (z1 - a[1]) / (b[1] - a[1]))); if (P.length < 3) return null;
    return P;
  }
  const obbPoly = (cx, cz, cs, sn, hx, hz) => [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]].map(([lx, lz]) => [cx + lx * cs + lz * sn, cz - lx * sn + lz * cs]);
  function gather(cx, cz) {
    const t0 = performance.now();
    const x0 = cx - HALF, z0 = cz - HALF, x1 = cx + HALF, z1 = cz + HALF, n = Math.round(2 * HALF / STEP), W = n + 1;
    const pos = [], idx = [];
    // the ground, every metre (its triangles wound up: Recast's walkable side)
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) { const x = x0 + i * STEP, z = z0 + j * STEP; pos.push(x, ground(x, z), z); }
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const a = j * W + i, b = (j + 1) * W + i, cc = j * W + i + 1, d = (j + 1) * W + i + 1; idx.push(a, b, cc, cc, b, d); }
    // the walls of what stands on it: each footprint's sides, from under the ground to its top (4.5 m at most)
    let walls = 0;
    const wall = (poly, top) => {
      const P = clip(poly, x0, z0, x1, z1); if (!P) return;
      let gmin = Infinity, gx = 0, gz = 0; for (const [x, z] of P) { gmin = Math.min(gmin, ground(x, z)); gx += x / P.length; gz += z / P.length; }
      gmin = Math.min(gmin, ground(gx, gz));
      const y0 = gmin - 0.5, y1 = Math.min(top, gmin + 4.5); if (y1 < gmin + 0.45) return;
      for (let k = 0; k < P.length; k++) {
        const a = P[k], b = P[(k + 1) % P.length], v = pos.length / 3;
        pos.push(a[0], y0, a[1], b[0], y0, b[1], b[0], y1, b[1], a[0], y1, a[1]);
        idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
      }
      walls++;
    };
    const R2 = HALF * 1.45;
    for (const col of [...cm.nearColliders(cx, cz, R2)]) {
      if (col.carOnly || (col.minY != null && col.minY >= 2.2)) continue;
      const o = col.obb;
      wall(o ? obbPoly(o.cx, o.cz, o.cs, o.sn, o.hx, o.hz) : [[col.minX, col.minZ], [col.maxX, col.minZ], [col.maxX, col.maxZ], [col.minX, col.maxZ]], col.maxY);
    }
    for (const o of [...(cm.lowObstacles?.(cx, cz, R2) || [])]) {
      if (o.top - ground(o.cx, o.cz) <= 0.42) continue; // (stepped over)
      wall(obbPoly(o.cx, o.cz, o.cs, o.sn, Math.max(o.hx, 0.12), Math.max(o.hz, 0.12)), o.top);
    }
    for (const b of window.NYC?.breakables || []) {
      if (b.taken || Math.abs(b.x - cx) > HALF + 4 || Math.abs(b.z - cz) > HALF + 4 || LOW.has(b.kind)) continue;
      if (b.w && b.d) { const yaw = b.yaw || 0; wall(obbPoly(b.x, b.z, Math.cos(yaw), Math.sin(yaw), b.w / 2, b.d / 2), (b.y || 0) + 2); continue; }
      if (!ROUND.has(b.kind) || !b.r) continue;
      const P = []; for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; P.push([b.x + Math.sin(a) * b.r, b.z + Math.cos(a) * b.r]); }
      wall(P, (b.y || 0) + 2);
    }
    return { positions: new Float32Array(pos), indices: new Uint32Array(idx), walls, ms: performance.now() - t0 };
  }

  // ------------------------------------------------------------------ building one
  function build(cx, cz) {
    const G = gather(cx, cz), id = ++seq;
    N.stats.gatherMs = Math.round(G.ms); N.stats.tris = G.indices.length / 3; N.stats.walls = G.walls;
    building = { id, cx, cz, sig: cm.colliders.length, t0: performance.now() };
    if (worker) worker.postMessage({ id, positions: G.positions, indices: G.indices, cfg: CFG }, [G.positions.buffer, G.indices.buffer]);
    else {
      // (no worker: here, once; it holds the frame for the build)
      import(VENDOR + 'generators.mjs').then((gen) => {
        const t0 = performance.now(), r = gen.generateSoloNavMesh(G.positions, G.indices, CFG);
        if (!r.success) return onBuilt({ data: { id, error: String(r.error) } });
        const bin = R.exportNavMesh(r.navMesh); r.navMesh.destroy();
        onBuilt({ data: { id, bin, ms: performance.now() - t0 } });
      }).catch((err) => onBuilt({ data: { id, error: String(err) } }));
    }
  }
  function onBuilt({ data }) {
    const b = building; if (!b || data.id !== b.id) return;
    building = null;
    if (data.error) { N.stats.error = data.error; console.warn('[nav] build failed', data.error); area = { cx: b.cx, cz: b.cz, sig: b.sig, bad: true }; return; }
    const t0 = performance.now();
    dropCrowd();
    navMesh = R.importNavMesh(data.bin).navMesh;
    query = new R.NavMeshQuery(navMesh);
    query.defaultQueryHalfExtents = { x: 1.5, y: 1.0, z: 1.5 };
    // (the islands nobody here can reach: inside a building, on a container's floor)
    const seeds = [], add = (p) => { const r = query.findNearestPoly({ x: p.x, y: p.y, z: p.z }, { halfExtents: { x: 3, y: 1.5, z: 3 } }); if (r.success && r.nearestRef) seeds.push(r.nearestRef); };
    add(c.playerFeet); for (const e of c.enemies) if (!e.out) add(e.pos); for (const w of b.seeds || []) add(w);
    if (seeds.length) R.floodFillPruneNavMesh(navMesh, seeds);
    crowd = new R.Crowd(navMesh, { maxAgents: 40, maxAgentRadius: 0.7 });
    crowd.navMeshQuery.defaultQueryHalfExtents = { x: 1.5, y: 1.0, z: 1.5 };
    area = { cx: b.cx, cz: b.cz, sig: b.sig };
    N.stats.buildMs = Math.round(data.ms); N.stats.importMs = Math.round(performance.now() - t0); N.stats.builds++;
    N.stats.bytes = data.bin.byteLength; N.stats.wallMs = Math.round(performance.now() - b.t0);
    if (DEBUG) drawMesh();
  }
  function dropCrowd() {
    agents.clear(); dan = null;
    try { crowd?.destroy(); query?.destroy(); navMesh?.destroy(); } catch (err) { /* (gone) */ }
    crowd = query = navMesh = null;
  }

  // ------------------------------------------------------------------ the agents
  const AGENT = { height: 1.8, maxAcceleration: 9, collisionQueryRange: 4.5, pathOptimizationRange: 14, separationWeight: 2, updateFlags: 1 | 2 | 4 | 8 | 16, obstacleAvoidanceType: 3 };
  const inArea = (p, m = 3) => area && Math.abs(p.x - area.cx) < HALF - m && Math.abs(p.z - area.cz) < HALF - m;
  function agentFor(e) {
    let A = agents.get(e); if (A) return A;
    if (!inArea(e.pos)) return null;
    const r = Math.min(0.62, 0.45 * e.scale);
    const a = crowd.addAgent({ x: e.pos.x, y: e.pos.y, z: e.pos.z }, { ...AGENT, radius: r, maxSpeed: 1 });
    A = { a, held: false, tgt: null, sp: 1, at: new THREE.Vector3().copy(e.pos) };
    agents.set(e, A); hold(A, e, true);
    return A;
  }
  // standing where he is (not walked by the crowd this frame): an obstacle the others walk round
  function hold(A, e, force = false) {
    const a = A.a;
    if (force || !A.held || Math.abs(A.at.x - e.pos.x) + Math.abs(A.at.z - e.pos.z) > 0.04) {
      a.teleport({ x: e.pos.x, y: e.pos.y, z: e.pos.z }); A.at.copy(e.pos);
      a.requestMoveVelocity({ x: 0, y: 0, z: 0 });
      // (put more than 0.8 m from him: he stands off the navmesh, up against something it keeps clear of, or on the
      // far side of a low fence from it: not his agent to follow from here)
      A.off = Math.hypot(a.raw.get_npos(0) - e.pos.x, a.raw.get_npos(2) - e.pos.z) > 0.8;
    }
    A.held = true; A.tgt = null;
  }
  const _o = { x: 0, z: 0, vx: 0, vz: 0 };
  // his footwork this frame: to p at up to sp m/s. Where the crowd has him now ({ x, z, vx, vz }), or null (no
  // navmesh here, or he is off it: the fight's own steering)
  N.steer = (e, p, sp) => {
    if (!crowd) return null;
    const A = agents.get(e); if (!A || A.off || A.a.state() !== 1) return null;
    if (!inArea(p, 1)) return null;
    const a = A.a;
    // (is there a way there, and not a long one? Checked now and then: none, or more than three times as far as
    // straight there (and 10 m), and the fight's own steering takes him, hopping the low fence between, as before)
    if (c.time - (A.chk ?? -9) > 0.4 || (A.noway && A.tgt && Math.abs(A.tgt.x - p.x) + Math.abs(A.tgt.z - p.z) > 1.5)) {
      A.chk = c.time;
      const r = query.computePath({ x: e.pos.x, y: e.pos.y, z: e.pos.z }, { x: p.x, y: p.y ?? e.pos.y, z: p.z }), P = r.success && r.path;
      let len = 0; if (P) for (let i = 0, q = e.pos; i < P.length; q = P[i++]) len += Math.hypot(P[i].x - q.x, P[i].z - q.z);
      const end = P && P[P.length - 1], straight = Math.hypot(p.x - e.pos.x, p.z - e.pos.z);
      A.noway = !P || !end || Math.hypot(end.x - p.x, end.z - p.z) > 1.3 || len > straight * 3 + 10;
      N.stats.checks = (N.stats.checks || 0) + 1; if (A.noway) N.stats.noway = (N.stats.noway || 0) + 1;
      if (A.noway) (A.tgt ??= new THREE.Vector3()).set(p.x, 0, p.z);
    }
    if (A.noway) return null;
    e.navUsed = true;
    if (A.held || !A.tgt || Math.abs(A.tgt.x - p.x) + Math.abs(A.tgt.z - p.z) > 0.3) {
      a.requestMoveTarget({ x: p.x, y: p.y ?? e.pos.y, z: p.z });
      (A.tgt ??= new THREE.Vector3()).set(p.x, 0, p.z); A.held = false;
    }
    if (Math.abs(A.sp - sp) > 0.05) { a.maxSpeed = sp; A.sp = sp; }
    _o.x = a.raw.get_npos(0); _o.z = a.raw.get_npos(2); _o.vx = a.raw.get_vel(0); _o.vz = a.raw.get_vel(2);
    return _o;
  };
  // he ended up somewhere else than his agent (a wall stopped him): the agent back with him
  N.resync = (e) => { const A = agents.get(e); if (A) { hold(A, e, true); A.held = false; A.tgt = null; } };
  // a walkable way from a to b ([{ x, y, z }...], b last), or null
  N.path = (a, b) => {
    if (!query || !inArea(a, 1) || !inArea(b, 1)) return null;
    const r = query.computePath({ x: a.x, y: a.y ?? ground(a.x, a.z), z: a.z }, { x: b.x, y: b.y ?? ground(b.x, b.z), z: b.z });
    N.stats.paths = (N.stats.paths || 0) + 1;
    return r.success && r.path?.length ? r.path : null;
  };
  // a fight is coming here: the navmesh built round it now
  N.want = (x, z) => { if (failed) return; wants.push({ x, y: ground(x, z), z }); load(); };

  // ------------------------------------------------------------------ every frame (before the Suits' update)
  N.frame = (dt, frozen) => {
    if (failed) return;
    const live = c.enemies.some((e) => !e.out);
    if (!live) { wants.length = 0; return; }
    if (!R) { load(); return; }
    const pf = c.playerFeet;
    if (!building) {
      // where: a fight wanted somewhere this area doesn't cover; the colliders changed (a set came or went); the fight
      // moved off it with Dan
      const w = wants.filter((p) => !inArea(p, 20));
      const engagedNear = c.enemies.some((e) => !e.out && e.state !== 'idle' && Math.hypot(e.pos.x - pf.x, e.pos.z - pf.z) < 30);
      let at = null;
      if (w.length) { let x = 0, z = 0; for (const p of w) { x += p.x / w.length; z += p.z / w.length; } at = { x, z, seeds: w.slice() }; }
      else if (area && area.sig !== cm.colliders.length) at = { x: area.cx, z: area.cz, seeds: [] };
      else if (engagedNear && (!area || Math.hypot(pf.x - area.cx, pf.z - area.cz) > REBUILD)) at = { x: pf.x, z: pf.z, seeds: [] };
      wants.length = 0;
      if (at && !(area?.bad && Math.hypot(at.x - area.cx, at.z - area.cz) < 1 && area.sig === cm.colliders.length)) { build(at.x, at.z); building.seeds = at.seeds; }
    }
    if (!crowd) return;
    const t0 = performance.now();
    // (his agent gone with him; the others held where they stand unless the crowd walked them last frame)
    // (and a man ragdolled (wagmi/physics/ragdoll.js) leaves the crowd until he is up: his body is Jolt's)
    for (const [e, A] of agents) if (e.out || e.rag || !c.enemies.includes(e)) { crowd.removeAgent(A.a); agents.delete(e); }
    for (const e of c.enemies) {
      if (e.out || e.rag) continue;
      const A = agentFor(e);
      if (A && !e.navUsed) hold(A, e);
      e.navUsed = false;
    }
    // Dan: one more to walk round
    if (inArea(pf)) {
      if (!dan) { dan = { a: crowd.addAgent({ x: pf.x, y: pf.y, z: pf.z }, { ...AGENT, radius: 0.35, maxSpeed: 0.1, separationWeight: 0 }), held: false, at: new THREE.Vector3() }; }
      hold(dan, { pos: pf });
    }
    if (!frozen && dt > 0) crowd.update(Math.min(dt, 0.1));
    if (DEBUG) drawPaths();
    const ms = performance.now() - t0;
    N.stats.crowdMs += ms; N.stats.crowdFrames++; N.stats.crowdMax = Math.max(N.stats.crowdMax, ms);
  };
  N.debugGather = (x, z) => gather(x, z);
  N.debug = () => ({ agents, query, crowd });
  N.statsNow = () => ({ ...N.stats, building: building ? Math.round(performance.now() - building.t0) : null, worker: !!worker, crowdAvg: N.stats.crowdFrames ? +(N.stats.crowdMs / N.stats.crowdFrames).toFixed(3) : 0, agents: agents.size + (dan ? 1 : 0), area: area && { cx: Math.round(area.cx), cz: Math.round(area.cz), bad: !!area.bad }, ready: !!crowd, off: failed });

  // ------------------------------------------------------------------ ?navdebug
  function drawMesh() {
    if (debugObj) { c.scene.remove(debugObj); debugObj.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); }); }
    const [P, I] = R.getNavMeshPositionsAndIndices(navMesh, 1);
    N.stats.polysTris = I.length / 3;
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(P.map((v, i) => (i % 3 === 1 ? v + 0.06 : v)), 3)); geo.setIndex(I);
    debugObj = new THREE.Group(); debugObj.name = 'navdebug';
    const fill = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#16D9F0', transparent: true, opacity: 0.32, depthWrite: false }));
    const wire = new THREE.LineSegments(new THREE.WireframeGeometry(geo), new THREE.LineBasicMaterial({ color: '#0B7285', transparent: true, opacity: 0.6, depthWrite: false }));
    fill.renderOrder = wire.renderOrder = 5; fill.frustumCulled = wire.frustumCulled = false;
    debugObj.add(fill, wire); c.scene.add(debugObj);
  }
  const pathPos = new Float32Array(40 * 5 * 6);
  function drawPaths() {
    if (!pathLines) {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pathPos, 3));
      pathLines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#FF2D95', depthTest: false, transparent: true }));
      pathLines.frustumCulled = false; pathLines.renderOrder = 6; c.scene.add(pathLines);
    }
    let k = 0;
    for (const [, A] of agents) {
      if (A.held || k > pathPos.length - 30) continue;
      const a = A.a; let px = a.raw.get_npos(0), py = a.raw.get_npos(1) + 0.15, pz = a.raw.get_npos(2);
      for (const q of a.corners()) { pathPos.set([px, py, pz, q.x, q.y + 0.15, q.z], k); k += 6; px = q.x; py = q.y + 0.15; pz = q.z; if (k > pathPos.length - 6) break; }
    }
    pathPos.fill(0, k);
    pathLines.geometry.attributes.position.needsUpdate = true; pathLines.geometry.setDrawRange(0, k / 3);
  }
  return N;
}
