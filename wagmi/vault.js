// Mog City: Dan over the low things on foot: the parks' iron fences, railings and lawn hoops, the benches, the
// plazas' granite and planters (js/controllers.js lowObstacles: solid to him below their tops). A quick hurdle: a short
// forward arc over it, his legs tucked up under him (ffAirHold, his GLB has no jump or vault clip), leaning into it, his
// left hand reaching down for the rail as he goes over, and on running the way he was.
//   Space (the pad's A) going toward one up to MAX m high, within a stride of it: over it. In a fight Space is the
//   dodge, as before.
//   Running into one (a jog or faster, forward held, square enough on): over it without a key. In a fight's footwork,
//   pushing the stick into it a moment (or sprinting at it) does the same.
// Never: onto a drop (the far side lower than this one by more than a step: a terrace's edge, the Battery's bulkhead),
// into the roadway off the curb, where the traffic or his own car is (or is about to be), into a wall, a tree, a post,
// the park's water, or off the island; never in the middle of a move of the fight, in a cutscene, or getting in the car.
// Installed by combat/index.js, over the fight's control hook (person.control, js/controllers.js updatePerson): while
// he goes over it the hurdle moves him, with the city's collision (buildings) and the low things but the one he clears.
// Debug: WAGMI.vault { state(), try(how) }.
import * as THREE from 'three/webgpu';
import { clamp, smooth, angWrap, fwd, right } from './combat/util.js';

const MAX = 1.35;        // the highest he goes over (m above where he stands: the parks' fences are 1.27)
const R = 0.48;          // his body (as the city's collision has it)
const CLEAR = 0.1;       // his feet over the top
const TUCK = 0.42;       // his lowest foot over his root in the tucked pose (measured: ffAirHold)
const DEEP = 2.6;        // the deepest thing (along his way) he goes over
const SQUARE = 0.64;     // cos of the widest angle off square he goes over a fence or a bench at (~50 deg)

export function installVault(W, c) {
  const app = W.app, cm = app.controllerManager, P = W.person, Q = W.dan, pos = P.position;
  const V = { on: false, t: 0, T: 0, S: new THREE.Vector3(), u: new THREE.Vector3(), D: 0, H: 0, g0: 0, gL: 0, o: null, hand: null, tr: null, last: null, push: 0, upWas: false, count: 0 };
  const _d = new THREE.Vector3(), _p = new THREE.Vector3(), _a = new THREE.Vector3();
  const ground = (x, z) => cm.getGroundHeight(x, z, 'person');

  // the way he means to go (unit, on the ground) and how fast: the street's walk (camera-relative: he faces the way he goes) along his heading; the fight's
  // footwork camera-relative, by the stick
  function intent(keys, fighting) {
    if (fighting) {
      const f = (+keys.forward || 0) - (+keys.backward || 0), s = (+keys.right || 0) - (+keys.left || 0), y = c.camYaw();
      _d.set(0, 0, 0).addScaledVector(fwd(y, _a), f).addScaledVector(right(y, _a), s);
      const m = Math.min(1, _d.length());
      if (m < 0.3) return 0;
      _d.normalize();
      return m * (keys.boost ? 5.6 : 2.3);
    }
    if (!((cm.footMove ? cm.footMove.mag : +keys.forward) > 0.3)) return 0;
    fwd(P.heading, _d);
    return Math.max(0, P.speed || 0);
  }

  // the far side: clear ground no lower than a step down (nor the road off the curb), nothing standing there or on
  // the way, no traffic coming, his own car not there, not the water, still the island
  const _probe = new THREE.Vector3();
  function landingOk(L, over, g0) {
    const gL = ground(L.x, L.z);
    if (gL < g0 - 0.3 || gL > g0 + 0.55) return 'drop';
    if (gL < 0.1 && g0 > 0.15) return 'road';
    if (cm.inParkWater(L.x, L.z)) return 'water';
    _probe.set(L.x, gL, L.z);
    cm.resolveHorizontalCollision(_probe, R, gL + 1.0);
    if (Math.hypot(_probe.x - L.x, _probe.z - L.z) > 0.05) return 'wall';
    // (the other low things, at the landing and on the way)
    for (const o of cm.lowObstacles(L.x, L.z, R + 1)) {
      if (over.includes(o)) continue;
      const dx = L.x - o.cx, dz = L.z - o.cz, lx = dx * o.cs - dz * o.sn, lz = dx * o.sn + dz * o.cs;
      if (Math.abs(lx) < o.hx + R && Math.abs(lz) < o.hz + R) return 'another';
    }
    // (trees, posts, lamps, hydrants... the crash's props still up, within his body of the way over)
    const props = W.crash?.props;
    if (props) {
      const mx = (pos.x + L.x) * 0.5, mz = (pos.z + L.z) * 0.5, len = Math.hypot(L.x - pos.x, L.z - pos.z), ux = (L.x - pos.x) / len, uz = (L.z - pos.z) / len;
      for (const b of props.around(mx, mz, len * 0.5 + 2)) {
        if (b.taken || b.kind === 'bench' || b.kind === 'granite' || b.kind === 'planter') continue;
        const t = clamp((b.x - pos.x) * ux + (b.z - pos.z) * uz, 0, len), d = Math.hypot(pos.x + ux * t - b.x, pos.z + uz * t - b.z);
        if (d < (b.w ? Math.max(b.w, b.d) * 0.5 : b.r || 0.3) + 0.3) return 'prop';
      }
    }
    // (his own car, and the traffic where it will be over the next second or so)
    if (c.carSolid && (c.carSolid(L.x, gL + 0.5, L.z, 0.7) || c.carSolid((pos.x + L.x) * 0.5, gL + 0.5, (pos.z + L.z) * 0.5, 0.3))) return 'car';
    for (const v of app.trafficSystem?.cars || []) if (inPath(v, L)) return 'traffic';
    for (const v of app.trafficSystem?.buses || []) if (inPath(v, L)) return 'traffic';
    return null;
  }
  function inPath(v, L) {
    if (!v.edge || Math.abs(v.x - L.x) > 40 || Math.abs(v.z - L.z) > 40) return false;
    const cs = Math.cos(v.yaw), sn = Math.sin(v.yaw), sp = Math.max(0, v.speed || 0);
    for (let t = 0; t <= 1.4; t += 0.35) {
      const dx = L.x - (v.x + sn * sp * t), dz = L.z - (v.z + cs * sp * t);
      if (Math.abs(dx * cs - dz * sn) < (v.halfWidth || 0.95) + 1.2 && Math.abs(dx * sn + dz * cs) < (v.half || 2.3) + 1.2) return true;
    }
    return false;
  }

  // can he go over what is ahead, now? The hurdle's plan, or null (V.last: why not, for the debug state). What is close
  // behind the first thing goes over with it in one (a lawn's hoop with a bench backed onto it)
  function plan(speed, how) {
    const g0 = ground(pos.x, pos.z);
    const reach = how === 'space' ? 1.2 : 0.3 + speed * 0.11;
    const hits = [], over = [];
    let hit = cm.lowAhead(pos.x, pos.z, pos.y, _d.x, _d.z, R, reach);
    if (!hit) { V.last = 'nothing'; return null; }
    while (hit && hits.length < 3) {
      const o = hit.o;
      if (o.top - g0 > MAX) { V.last = 'too high'; return null; }
      // (square enough on: his way against the thing's thin side, for a fence or a bench; any way over a block)
      const across = Math.abs(_d.x * o.cs - _d.z * o.sn), along = Math.abs(_d.x * o.sn + _d.z * o.cs);
      if (Math.min(o.hx, o.hz) < 0.4 && (o.hx < o.hz ? across : along) < SQUARE) { V.last = 'too slanted'; return null; }
      hits.push(hit); over.push(o);
      const last = hit;
      hit = cm.lowAhead(pos.x, pos.z, pos.y, _d.x, _d.z, R, last.exit + 0.6, over);
      if (hit && hit.enter > last.exit + 0.6) hit = null;
    }
    const first = hits[0], last = hits[hits.length - 1];
    const span = Math.max(0, last.exit - first.enter - 2 * R);
    if (span > DEEP) { V.last = 'too deep'; return null; }
    // the arc centred on it all: as far beyond its middle as he is short of it, and at least clear of it
    const mid = (first.enter + last.exit) * 0.5;
    const D = Math.max(2 * Math.max(0, mid), last.exit + 0.15, 1.4);
    const L = _p.set(pos.x + _d.x * D, 0, pos.z + _d.z * D);
    const bad = landingOk(L, over, g0);
    if (bad) { V.last = bad; return null; }
    const high = hits.reduce((a, b) => (b.o.top > a.o.top ? b : a));
    return { hits, over, high, top: high.o.top, span, D, g0, gL: ground(L.x, L.z) };
  }

  function start(pl, speed, how) {
    const { high, D, g0, gL, top, span } = pl, o = high.o;
    V.on = true; V.t = 0; V.rang = false; V.how = how; V.o = o; V.n = pl.over.length; V.D = D; V.g0 = g0; V.gL = gL; V.count++;
    V.S.set(pos.x, g0, pos.z); V.u.copy(_d);
    const v = clamp(Math.max(speed, 4.2), 4.2, 7.5);
    V.T = clamp(D / v, 0.4 + 0.18 * Math.max(0, top - g0), 0.8);
    // high enough that his tucked feet clear the top all across it (the arc's middle over its middle)
    const need = Math.max(0.12, top - g0 + CLEAR - TUCK), e = span * 0.5 + 0.2;
    V.H = Math.min(need / Math.max(0.5, Math.cos(Math.PI * Math.min(0.45, e / D))), 1.25);
    cm.vaultPass = pl.over;
    // the hand on the rail: where his way crosses the highest one's top, a little to his left
    const cx = pos.x + _d.x * high.mid, cz = pos.z + _d.z * high.mid;
    V.hand = me().holding ? null : new THREE.Vector3(cx - _d.z * 0.22, o.top + 0.03, cz + _d.x * 0.22);
    V.tr = Q.play('ffAirHold', { from: 0.1, until: 0.9, ts: 0.8 / V.T, fade: Math.min(0.12, V.T * 0.25), fadeOut: 0.16 });
    V.yaw = Math.atan2(_d.x, _d.z);
    if (how === 'space') P.jumpHeld = true;
    P.verticalVel = 0;
    W.audio?.play?.('whoosh', { pos: [pos.x, pos.y + 1, pos.z], vol: 0.35, rate: 1.25 });
  }
  function end(landed) {
    V.on = false; cm.vaultPass = null;
    if (V.tr && !V.tr.out) { V.tr.out = 1e-6; V.tr.fadeOut = 0.14; }
    V.tr = null;
    if (V.hand) Q.reach('L', null, 0);
    Q.body.rotation.x = 0;
    if (landed) { pos.y = V.gL; P.verticalVel = 0; W.audio?.play?.('land', { pos: [pos.x, pos.y, pos.z], vol: 0.45 }); }
  }
  function step(dt) {
    V.t += dt;
    const k = Math.min(1, V.t / V.T);
    const x = V.S.x + V.u.x * V.D * k, z = V.S.z + V.u.z * V.D * k;
    pos.x = x; pos.z = z;
    pos.y = V.g0 + (V.gL - V.g0) * smooth(k) + V.H * Math.sin(Math.PI * k);
    cm.resolveHorizontalCollision(pos, R, pos.y + 1.0);
    c.carPush?.(pos, 0.36);
    // (something not foreseen in the way: down where he is)
    if (Math.hypot(pos.x - x, pos.z - z) > 0.2) { V.last = 'stopped'; end(false); return; }
    P.heading = V.yaw + angWrap(P.heading - V.yaw) * Math.exp(-18 * dt);
    P.speed = V.D / V.T;
    Q.loco = null;
    // leaning into it, the left hand down to the rail as he goes over
    Q.body.rotation.x = 0.22 * Math.sin(Math.PI * k);
    if (V.hand) Q.reach('L', V.hand, k > 0.22 && k < 0.62 ? 1 : 0, _a.set(1, -0.2, -0.6));
    // (the iron rings under his hand)
    if (V.o.fence && !V.rang && k > 0.4) { V.rang = true; W.audio?.play?.('clang', { pos: [V.hand ? V.hand.x : pos.x, V.o.top, V.hand ? V.hand.z : pos.z], vol: 0.18, rate: 1.9 }); }
    V.lx = pos.x; V.lz = pos.z; V.stamp = performance.now();
    if (k >= 1) end(true);
  }

  const me = () => c.me;
  const free = () => cm.activeMode === 'person' && !P.inVehicle && !W.cutscene && !W.directed && !W.ride?.phase && !W.paused;
  const base = P.control;
  P.control = (dt, keys, ctl) => {
    const up = !!keys.up, pressed = up && !V.upWas;
    V.upWas = up;
    if (V.on) {
      // (a move of the fight taking over (a blow landing on him): let go, he comes down where he is; so too when the
      // hurdle was left behind: he got in the car, or was put somewhere else, since its last step)
      const now = performance.now();
      if (!free() || !me().isFree() || now - V.stamp > 250 || Math.hypot(pos.x - V.lx, pos.z - V.lz) > 0.5) end(false);
      else { step(dt * (c.ts ?? 1)); return true; }
    }
    if (free() && me().isFree() && dt > 0) {
      const fighting = !!me().fighting, onGround = pos.y - ground(pos.x, pos.z) < 0.05;
      const speed = onGround ? intent(keys, fighting) : 0;
      let how = null;
      if (speed > 0) {
        if (pressed && !fighting) how = 'space';
        else if (fighting ? (keys.boost || V.push > 0.2) : speed >= 3) how = 'run';
      }
      if (how) {
        const pl = plan(speed, how);
        if (pl) { start(pl, speed, how); step(dt * (c.ts ?? 1)); return true; }
      }
      // (the fight's footwork pushing into one: a moment of that and he goes over)
      if (fighting && speed > 0) {
        const hit = cm.lowAhead(pos.x, pos.z, pos.y, _d.x, _d.z, R, 0.08);
        V.push = hit ? V.push + dt : 0;
      } else V.push = 0;
    }
    return base ? base(dt, keys, ctl) : false;
  };

  W.vault = {
    state: () => ({ on: V.on, t: +V.t.toFixed(2), T: +V.T.toFixed(2), D: +V.D.toFixed(2), H: +V.H.toFixed(2), how: V.how, last: V.last, count: V.count, top: V.o ? +V.o.top.toFixed(2) : null, n: V.n, kind: V.o ? (V.o.fence ? 'fence' : V.o.kind) : null }),
    // (debug: over what is straight ahead now, as if run at it)
    try(how = 'run') { if (V.on || !free()) return false; fwd(P.heading, _d); const pl = plan(5, how); if (!pl) return V.last; start(pl, 5, how); return true; },
  };
  return W.vault;
}
