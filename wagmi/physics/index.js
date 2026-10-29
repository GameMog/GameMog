// Mog City: real rigid-body physics where the game used to fake it. Jolt Physics (JoltPhysics.js 1.1.0 by Jorrit Rouwe,
// MIT, js/vendor/jolt/ with its LICENSE; see NOTICE), loaded on first need (the first crash, the first fight: never at
// the opening or the trailer) and only ever simulating a local world round Dan: a square HALF m each way of the ground
// (a height field sampled from the controllers' own ground height) and the walls of what stands on it (the city's
// colliders: the buildings, a set's containers and fences, the terraces a car can't climb), moved with him when he
// goes 45 m off its middle. What moves in it: the city's cars knocked out of their lanes (wagmi/crash/wrecks.js), the
// small street furniture knocked flying (wagmi/crash/props.js), a Suit's ragdoll (wagmi/physics/ragdoll.js); Dan's
// car is in it as a kinematic body (driven by the controllers exactly as before, never moved by it: it shoves what
// it drives into). Everything sleeps when it stops; what leaves the local world is frozen where it lies.
//   const P = createPhysics({ cm, car });  P.want() (load now) · P.ready · P.frame(dt) (once a frame) ·
//   P.addBox/addCar(...) -> body · P.remove(body) · P.read(body) (its pose into body.p, body.q) · P.impulse(...)
//   URL ?physics=0: off (the game's own fakes, as before)
import * as THREE from 'three/webgpu';

const VENDOR = new URL('../../js/vendor/jolt/', import.meta.url).href;
const QS = new URLSearchParams(location.search);
const OFF = QS.get('physics') === '0';
export const HALF = 80, SAMPLES = 128, RECENTRE = 45;
// object layers: the city (static), what moves, Dan's car (kinematic: only touches what moves), a ragdoll's parts
export const L = { STATIC: 0, MOVING: 1, PLAYER: 2, RAG: 3 };

export function createPhysics({ cm, car }) {
  const P = {
    ready: false, failed: OFF, J: null,
    stats: { load: null, init: null, steps: 0, ms: 0, max: 0, last: 0, rebuilds: 0, rebuildMs: 0, rebuildMax: 0, bodies: 0, active: 0, error: null },
  };
  let J = null, jolt = null, sys = null, bi = null, loading = null, centre = null, ground = null, walls = null, kin = null, kinAt = null;
  const live = new Set();
  let v3a, v3b, rv3, qa;

  function load() {
    if (loading || P.failed) return loading;
    const t0 = performance.now();
    loading = (async () => {
      try {
        const mod = await import(VENDOR + 'jolt-physics.wasm.js');
        J = P.J = await mod.default();
        const t1 = performance.now();
        setup();
        P.stats.init = Math.round(performance.now() - t1);
        P.stats.load = Math.round(t1 - t0);
        P.ready = true;
        console.log(`[physics] Jolt in: ${P.stats.load} ms to load, ${P.stats.init} ms to start`);
      } catch (err) {
        P.failed = true; P.stats.error = String(err && err.message || err);
        console.warn('[physics] Jolt failed to load: the game fakes it as before', err);
      }
    })();
    return loading;
  }
  P.want = () => { load(); };

  function setup() {
    const S = new J.JoltSettings();
    S.mMaxWorkerThreads = 0;
    S.mMaxBodies = 2048; S.mMaxBodyPairs = 4096; S.mMaxContactConstraints = 4096;
    const pairs = new J.ObjectLayerPairFilterTable(4);
    pairs.EnableCollision(L.STATIC, L.MOVING); pairs.EnableCollision(L.MOVING, L.MOVING);
    pairs.EnableCollision(L.PLAYER, L.MOVING);
    pairs.EnableCollision(L.RAG, L.STATIC); pairs.EnableCollision(L.RAG, L.MOVING); pairs.EnableCollision(L.RAG, L.PLAYER); pairs.EnableCollision(L.RAG, L.RAG);
    const bp = new J.BroadPhaseLayerInterfaceTable(4, 2);
    bp.MapObjectToBroadPhaseLayer(L.STATIC, new J.BroadPhaseLayer(0));
    for (const l of [L.MOVING, L.PLAYER, L.RAG]) bp.MapObjectToBroadPhaseLayer(l, new J.BroadPhaseLayer(1));
    S.mObjectLayerPairFilter = pairs; S.mBroadPhaseLayerInterface = bp;
    S.mObjectVsBroadPhaseLayerFilter = new J.ObjectVsBroadPhaseLayerFilterTable(bp, 2, pairs, 4);
    jolt = new J.JoltInterface(S); J.destroy(S);
    sys = jolt.GetPhysicsSystem(); bi = sys.GetBodyInterface();
    v3a = new J.Vec3(0, 0, 0); v3b = new J.Vec3(0, 0, 0); rv3 = new J.RVec3(0, 0, 0); qa = new J.Quat(0, 0, 0, 1);
    P.bi = bi; P.sys = sys;
  }
  const V = (x, y, z) => (v3a.Set(x, y, z), v3a);
  const V2 = (x, y, z) => (v3b.Set(x, y, z), v3b);
  const RV = (x, y, z) => (rv3.Set(x, y, z), rv3);
  const Q = (q) => (qa.Set(q.x, q.y, q.z, q.w), qa);
  P.V = V; P.V2 = V2; P.RV = RV; P.Q = Q;

  // ------------------------------------------------------------------ the local world (static)
  const gh = (x, z) => cm.getGroundHeight(x, z, 'person');
  function rebuild(cx, cz) {
    const t0 = performance.now();
    for (const b of [ground, walls]) if (b) { bi.RemoveBody(b.GetID()); bi.DestroyBody(b.GetID()); }
    ground = walls = null;
    // the ground: a height field, SAMPLES square over 2 HALF m
    const n = SAMPLES, step = (2 * HALF) / (n - 1), x0 = cx - HALF, z0 = cz - HALF;
    const hs = new J.HeightFieldShapeSettings();
    hs.mOffset = V(x0, 0, z0); hs.mScale = V2(step, 1, step); hs.mSampleCount = n; hs.mBlockSize = 4; hs.mBitsPerSample = 8;
    hs.mHeightSamples.resize(n * n);
    const H = new Float32Array(J.HEAPF32.buffer, J.getPointer(hs.mHeightSamples.data()), n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) H[j * n + i] = gh(x0 + i * step, z0 + j * step);
    const gs = hs.Create().Get();
    const gb = new J.BodyCreationSettings(gs, RV(0, 0, 0), Q(new THREE.Quaternion()), J.EMotionType_Static, L.STATIC);
    gb.mFriction = 0.8;
    ground = bi.CreateBody(gb); J.destroy(gb); J.destroy(hs);
    bi.AddBody(ground.GetID(), J.EActivation_DontActivate);
    // the walls: one static compound of boxes, the colliders within reach (not the ones high overhead)
    const cs = new J.StaticCompoundShapeSettings();
    let nw = 0;
    const q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0);
    for (const c of cm.nearColliders(cx, cz, HALF * 1.45)) {
      if (c.minY != null && c.minY >= 2.2) continue;
      const o = c.obb;
      const y0 = c.minY != null ? Math.min(c.minY, -1) : -1, y1 = Math.min(c.maxY ?? 30, 60);
      if (y1 - y0 < 0.3) continue;
      let px, pz, hx, hz;
      if (o) { px = o.cx; pz = o.cz; hx = o.hx; hz = o.hz; q.setFromAxisAngle(Y, Math.atan2(o.sn, o.cs)); }
      else { px = (c.minX + c.maxX) / 2; pz = (c.minZ + c.maxZ) / 2; hx = (c.maxX - c.minX) / 2; hz = (c.maxZ - c.minZ) / 2; q.identity(); }
      if (Math.abs(px - cx) > HALF + hx + 10 || Math.abs(pz - cz) > HALF + hz + 10 || hx < 0.02 || hz < 0.02) continue;
      const bs = new J.BoxShapeSettings(V(Math.max(hx, 0.06), (y1 - y0) / 2, Math.max(hz, 0.06)), 0.02);
      cs.AddShape(V2(px - cx, (y0 + y1) / 2, pz - cz), Q(q), bs, 0);
      nw++;
    }
    if (nw) {
      const ws = cs.Create().Get();
      const wb = new J.BodyCreationSettings(ws, RV(cx, 0, cz), Q(new THREE.Quaternion()), J.EMotionType_Static, L.STATIC);
      wb.mFriction = 0.5;
      walls = bi.CreateBody(wb); J.destroy(wb);
      bi.AddBody(walls.GetID(), J.EActivation_DontActivate);
    }
    J.destroy(cs);
    sys.OptimizeBroadPhase();
    centre = { x: cx, z: cz, walls: nw, sig: cm.colliders.length };
    // (what was simulated off the edge of the old world is frozen where it is; the rest wakes on the new ground)
    for (const b of live) if (!b.frozen && !P.inside(b.p.x, b.p.z, 4)) freeze(b);
    const ms = performance.now() - t0;
    P.stats.rebuilds++; P.stats.rebuildMs = Math.round(ms * 10) / 10; P.stats.rebuildMax = Math.max(P.stats.rebuildMax, Math.round(ms * 10) / 10);
  }
  // (the world is only moved while something moves in it: with nothing live, it is moved when it is next asked about)
  let focusAt = null;
  const stale = () => focusAt && (!centre || Math.hypot(focusAt.x - centre.x, focusAt.z - centre.z) > RECENTRE || centre.sig !== cm.colliders.length);
  function ensure() { if (P.ready && stale()) rebuild(focusAt.x, focusAt.z); }
  P.inside = (x, z, m = 0) => { ensure(); return !!centre && Math.abs(x - centre.x) < HALF - m && Math.abs(z - centre.z) < HALF - m; };
  P.centre = () => centre;

  // ------------------------------------------------------------------ bodies
  // a body: { id, body, p: Vector3, q: Quaternion, kind, frozen }
  function make(shapeSettings, p, q, { mass, layer = L.MOVING, friction = 0.5, restitution = 0.1, damp = 0.05, angDamp = 0.1, v = null, w = null, group = null, ccd = false } = {}) {
    const shape = shapeSettings.Create().Get();
    const s = new J.BodyCreationSettings(shape, RV(p.x, p.y, p.z), Q(q), layer === L.PLAYER ? J.EMotionType_Kinematic : J.EMotionType_Dynamic, layer);
    if (mass) { s.mOverrideMassProperties = J.EOverrideMassProperties_CalculateInertia; s.mMassPropertiesOverride.mMass = mass; }
    s.mFriction = friction; s.mRestitution = restitution; s.mLinearDamping = damp; s.mAngularDamping = angDamp;
    if (ccd) s.mMotionQuality = J.EMotionQuality_LinearCast;
    if (group) s.mCollisionGroup = group;
    const body = bi.CreateBody(s); J.destroy(s);
    const id = body.GetID();
    bi.AddBody(id, J.EActivation_Activate);
    if (v) bi.SetLinearVelocity(id, V(v.x, v.y, v.z));
    if (w) bi.SetAngularVelocity(id, V(w.x, w.y, w.z));
    const B = { id, body, p: new THREE.Vector3().copy(p), q: new THREE.Quaternion().copy(q), frozen: false, mass: mass || 0, active: true };
    if (layer !== L.PLAYER) live.add(B);
    P.stats.bodies = live.size;
    return B;
  }
  P.make = make;
  // a box (half extents hx hy hz) at p turned q
  P.addBox = (p, q, hx, hy, hz, o = {}) => { const s = new J.BoxShapeSettings(V(Math.max(hx, 0.03), Math.max(hy, 0.03), Math.max(hz, 0.03)), Math.min(0.05, hx * 0.3, hy * 0.3, hz * 0.3)); const B = make(s, p, q, o); J.destroy(s); return B; };
  // one of the city's cars: its body box from the ground (wheels included) to the waist, its cabin above; the body's
  // origin is the car's own (on the ground under its middle), so its pose is the mesh's
  P.addCar = (p, q, hw, hl, roof, o = {}) => {
    const cs = new J.StaticCompoundShapeSettings(), I = new THREE.Quaternion();
    const low = new J.BoxShapeSettings(V(hw, 0.47, hl), 0.06);
    cs.AddShape(V2(0, 0.49, 0), Q(I), low, 0);
    const ch = Math.max(0.2, (roof - 0.96) / 2);
    const cab = new J.BoxShapeSettings(V(hw * 0.86, ch, hl * 0.52), 0.06);
    cs.AddShape(V2(0, 0.96 + ch, -hl * 0.08), Q(I), cab, 0);
    const B = make(cs, p, q, o); J.destroy(cs);
    return B;
  };
  P.remove = (B) => {
    if (!B || B.gone) return; B.gone = true; live.delete(B);
    if (!B.frozen) { bi.RemoveBody(B.id); }
    bi.DestroyBody(B.id);
    P.stats.bodies = live.size;
  };
  function freeze(B) { if (B.frozen) return; B.frozen = true; bi.RemoveBody(B.id); }
  P.freeze = freeze;
  // its pose now (into B.p, B.q); true while it moves
  P.read = (B) => {
    if (B.frozen || B.gone) return false;
    const b = B.body, p = b.GetPosition(), q = b.GetRotation();
    B.p.set(p.GetX(), p.GetY(), p.GetZ()); B.q.set(q.GetX(), q.GetY(), q.GetZ(), q.GetW());
    B.active = b.IsActive();
    return B.active;
  };
  P.vel = (B, out) => { const v = B.body.GetLinearVelocity(); return out.set(v.GetX(), v.GetY(), v.GetZ()); };
  P.angVel = (B, out) => { const v = B.body.GetAngularVelocity(); return out.set(v.GetX(), v.GetY(), v.GetZ()); };
  P.setVel = (B, v, w = null) => { if (B.frozen) return; bi.SetLinearVelocity(B.id, V(v.x, v.y, v.z)); if (w) bi.SetAngularVelocity(B.id, V(w.x, w.y, w.z)); bi.ActivateBody(B.id); };
  // an impulse (kg m/s) at a point
  P.impulse = (B, jx, jy, jz, px, py, pz) => { if (B.frozen || B.gone) return; bi.AddImpulse(B.id, V(jx, jy, jz), RV(px, py, pz)); };
  P.angImpulse = (B, x, y, z) => { if (B.frozen || B.gone) return; bi.AddAngularImpulse(B.id, V(x, y, z)); };
  P.place = (B, p, q) => { if (B.frozen || B.gone) return; bi.SetPositionAndRotation(B.id, RV(p.x, p.y, p.z), Q(q), J.EActivation_Activate); };

  // ------------------------------------------------------------------ Dan's car (kinematic)
  const _kq = new THREE.Quaternion(), _Y = new THREE.Vector3(0, 1, 0);
  function kinematicCar(dt) {
    if (!car || !car.body) return;
    const B = car.body;
    const shown = car.mesh?.visible !== false && (cm.activeMode === 'car' || car.position.y < 2.6);
    if (!kin) {
      const cs = new J.StaticCompoundShapeSettings(), hl = (B.z1 - B.z0) / 2, top = B.top || 1.4;
      const bs = new J.BoxShapeSettings(V(B.hx, (top - 0.12) / 2, hl), 0.05);
      cs.AddShape(V2(0, 0.12 + (top - 0.12) / 2, (B.z1 + B.z0) / 2), Q(new THREE.Quaternion()), bs, 0);
      kin = make(cs, car.position, _kq.setFromAxisAngle(_Y, car.heading), { layer: L.PLAYER, mass: (car.mass || 2) * 1000 });
      J.destroy(cs); kinAt = car.position.clone();
    }
    _kq.setFromAxisAngle(_Y, car.heading);
    const p = car.position, y = shown ? p.y : -50;
    // (jumped a long way in a frame (put back on the road, into a garage): put there, not swept there at a speed)
    if (!shown || kinAt.distanceTo(p) > 6 || dt <= 0) bi.SetPositionAndRotation(kin.id, RV(p.x, y, p.z), Q(_kq), J.EActivation_DontActivate);
    else bi.MoveKinematic(kin.id, RV(p.x, y, p.z), Q(_kq), dt);
    kinAt.copy(p);
  }

  // ------------------------------------------------------------------ every frame
  P.frame = (dt, focus) => {
    if (!P.ready || dt <= 0) return;
    const t0 = performance.now();
    const f = focus || car?.position;
    if (f) (focusAt ??= { x: 0, z: 0 }), focusAt.x = f.x, focusAt.z = f.z;
    // (nothing moving: no step, the world not moved)
    if (!live.size) { if (kin && kinAt.x < 1e8) { bi.SetPositionAndRotation(kin.id, RV(0, -50, 0), Q(_kq), J.EActivation_DontActivate); kinAt.set(1e9, 0, 0); } return; }
    ensure();
    kinematicCar(dt);
    const d = Math.min(dt, 1 / 30);
    jolt.Step(d, d > 1 / 55 ? 2 : 1);
    const ms = performance.now() - t0;
    P.stats.steps++; P.stats.ms += ms; P.stats.max = Math.max(P.stats.max, ms); P.stats.last = ms;
    P.stats.active = sys.GetNumActiveBodies(J.EBodyType_RigidBody);
  };
  P.statsNow = () => ({ ...P.stats, avg: P.stats.steps ? +(P.stats.ms / P.stats.steps).toFixed(3) : 0, centre, ready: P.ready, mem: J ? Math.round((jolt ? 0 : 0) + (J.HEAPF32?.buffer.byteLength || 0) / 1048576) : 0 });
  P.resetStats = () => Object.assign(P.stats, { steps: 0, ms: 0, max: 0 });
  return P;
}
