// Mog City: Mission 2's lookouts, stealth-lite. Three Suits of the fight's own (WAGMI.combat, a crew that won't
// wake by itself) stand watch at the yard: one at the gate sweeping 12th Ave, one walking the west row, one at the side
// gate. Each sees down a cone (drawn on the ground, yellow going red) as far as the containers and walls let him:
// in it, Dan fills his suspicion (faster close up, running, or in a car); a sprint near him is heard. Full: 'You were
// spotted.' From behind, a step away, E takes him down (the fight's takedown), and whoever sees that gets suspicious.
// The prompt says so: 'Press E to take him down' (strong) in position, 'Closer: right behind him' (soft, no key) a
// few steps short of it.
//   const S = createStealth(W, { posts, U });  await S.spawn();  S.step(dt) -> null | 'seen' | 'hit';  S.alarm();  S.dispose()
//   S.lookouts: [{ e, name, sus, quiet, ... }] · S.by (the lookout who saw him, or was hit: his name for the banner) ·
//   S.down (taken down) · S.quiet (taken down unseen) · S.grace (s: nobody's suspicion fills yet: pulling up behind the
//   van, he has a moment to stop and get out)
import * as THREE from 'three/webgpu';

const PI = Math.PI;
const RANGE = 15, HALF = 0.72, CLOSE = 3.2;
// (who they are, for 'SPOTTED! The side-gate lookout saw you.': by post, m2-set.js's order; a post's own name first)
// (one string, split: the voice build reads a three-string array as [speaker, colour, words], a line to record)
const NAMES = 'The gate lookout|The lookout on the west row|The side-gate lookout'.split('|');
const angWrap = (a) => { a = (a + PI) % (2 * PI); if (a < 0) a += 2 * PI; return a - PI; };

export function createStealth(W, { posts, U, center }) {
  const app = W.app, cm = app.controllerManager, P = W.person, car = W.car, combat = W.combat, scene = app.scene, cam = app.cameraSystem.camera;
  const S = { lookouts: [], crew: null, down: 0, quiet: 0, alarmed: false, grace: 0, by: null };
  // a wall, a container or a building between two points (the city's colliders, the yard's among them)
  function blocked(ax, ay, az, bx, by, bz) {
    const L = Math.hypot(bx - ax, bz - az), n = Math.ceil(L / 0.6);
    for (let i = 1; i < n; i++) {
      const u = i / n, x = ax + (bx - ax) * u, y = ay + (by - ay) * u, z = az + (bz - az) * u;
      for (const c of cm.nearColliders(x, z, 0.3)) {
        if (y > c.maxY || x < c.minX || x > c.maxX || z < c.minZ || z > c.maxZ) continue;
        if (c.obb) { const o = c.obb, dx = x - o.cx, dz = z - o.cz; if (Math.abs(dx * o.cs - dz * o.sn) > o.hx || Math.abs(dx * o.sn + dz * o.cs) > o.hz) continue; }
        return true;
      }
    }
    return false;
  }
  // the cone on the ground, pointing along +x before it is turned
  const coneGeo = new THREE.CircleGeometry(RANGE, 28, -HALF, HALF * 2); coneGeo.rotateX(-PI / 2);
  function cone() {
    const m = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({ color: '#FFC93C', transparent: true, opacity: 0.08, depthWrite: false }));
    m.renderOrder = 4; m.frustumCulled = false; scene.add(m); return m;
  }
  S.spawn = async () => {
    if (!combat?.spawnCrew) return S;
    // (a crew of one each: taking one down doesn't wake the others; together they answer as one crew)
    const crews = posts.map((post) => { const [x, z] = post.at || post.path[0]; return combat.spawnCrew({ x, z, count: 1, aggro: false, props: false }); });
    S.crew = { enemies: crews.flatMap((c) => c.enemies), alive: () => crews.reduce((n, c) => n + c.alive(), 0), engage() { for (const c of crews) c.engage(); return this; } };
    S.crew.enemies.forEach((e, i) => {
      const post = posts[i], L = { e, post, id: 'lk' + i, name: post.name || NAMES[i] || 'A lookout', sus: 0, yaw: post.yaw ?? 0, t: Math.random() * 10, leg: 0, wait: 0, quiet: false, cone: cone(), watching: true, look: null };
      const [x, z] = post.at || post.path[0];
      e.pos.set(x, cm.getGroundHeight(x, z, 'person'), z); e.yaw = L.yaw; e.root.rotation.y = L.yaw;
      // (on watch: his own heading, not Dan's; walking his beat, his walk not the crew's idle: any of the idles enemy.js
      // asks for (its idle() plays the pack's suitIdle by name; a walk interrupted by it restarts from frame 0 each frame))
      const up = e.update.bind(e), play = e.play.bind(e);
      e.play = (name, o) => (L.watching && L.walking && /^(thugIdle|suitIdle|suitIdleGuide)$/.test(name) ? e.cur : play(name, o));
      e.update = (dt) => { up(dt); if (L.watching && e.alive && e.state === 'idle') { e.yaw = L.yaw; e.root.rotation.y = L.yaw; } };
      L.restore = () => { e.update = up; e.play = play; };
      S.lookouts.push(L);
    });
    return S;
  };
  const me = () => (cm.activeMode === 'car' ? car.position : P.position);
  const inCar = () => cm.activeMode === 'car';
  // the one Dan could take down now: on foot, a step away, behind him (not in his face)
  function takeable() {
    if (inCar() || S.alarmed || S.by) return null;
    let best = null, bd = 2.4;
    for (const L of S.lookouts) {
      const e = L.e; if (!L.watching || !e.alive || e.state !== 'idle') continue;
      const dx = P.position.x - e.pos.x, dz = P.position.z - e.pos.z, d = Math.hypot(dx, dz);
      if (d > bd) continue;
      const off = Math.abs(angWrap(Math.atan2(dx, dz) - L.yaw));
      if (off < 1.75) continue;
      best = L; bd = d;
    }
    return best;
  }
  function takedown(L) {
    const e = L.e; L.watching = false; L.restore(); L.quiet = L.sus < 1; L.cone.visible = false; U.unmark(L.id);
    const dbg = combat.debug;
    try { if (dbg?.move) dbg.move('takedown', e); else throw new Error('no move'); }
    catch { const d = new THREE.Vector3(e.pos.x - P.position.x, 0, e.pos.z - P.position.z).normalize(); e.hit({ dmg: 999, dir: d, kind: 'takedown', fly: 3.2, up: 3 }); }
    S.down++; if (L.quiet) S.quiet++;
    W.audio?.play?.('whoosh', { pos: [e.pos.x, 1, e.pos.z], vol: 0.6 });
    // whoever saw it
    for (const O of S.lookouts) {
      if (O === L || !O.watching || !O.e.alive) continue;
      const dx = e.pos.x - O.e.pos.x, dz = e.pos.z - O.e.pos.z, d = Math.hypot(dx, dz);
      if (d < RANGE * 1.2 && Math.abs(angWrap(Math.atan2(dx, dz) - O.yaw)) < HALF * 1.4 && !blocked(O.e.pos.x, O.e.pos.y + 1.6, O.e.pos.z, e.pos.x, e.pos.y + 1.0, e.pos.z)) { O.sus = Math.max(O.sus, 0.7); O.look = { x: e.pos.x, z: e.pos.z }; }
    }
  }
  const onKey = (ev) => {
    if (ev.code !== 'KeyE' || ev.repeat || W.cutscene || W.paused) return;
    const L = takeable(); if (!L) return;
    ev.stopImmediatePropagation(); ev.preventDefault();
    takedown(L);
  };
  addEventListener('keydown', onKey, true);
  S.takeable = takeable;
  S.takedown = (i) => { const L = S.lookouts[i]; if (L) takedown(L); };

  const _v = new THREE.Vector3();
  S.step = (dt) => {
    if (S.alarmed) return null;
    const p = me(), car_ = inCar(), sp = car_ ? Math.abs(car.speed) : P.speed || 0;
    if (S.grace > 0) S.grace -= dt;
    let spotted = null;
    for (const L of S.lookouts) {
      const e = L.e;
      // taken down some other way (a fist from the front, the car): that is the alarm
      if (L.watching && (!e.alive || e.state !== 'idle')) { L.watching = false; L.restore(); L.cone.visible = false; U.unmark(L.id); if (e.alive || !L.quiet) { spotted = spotted || 'hit'; S.by = S.by || L; } continue; }
      if (!L.watching) continue;
      L.t += dt;
      // where he looks: his sweep, his beat, or toward what made him suspicious
      const post = L.post;
      if (post.path) {
        const [a, b] = L.leg ? [post.path[1], post.path[0]] : [post.path[0], post.path[1]];
        const dx = b[0] - e.pos.x, dz = b[1] - e.pos.z, d = Math.hypot(dx, dz);
        if (L.wait > 0) { L.wait -= dt; L.walking = false; if (e.curName !== 'thugIdle') e.play('thugIdle', { fade: 0.3 }); L.yaw += angWrap(Math.atan2(a[0] - b[0], a[1] - b[1]) + Math.sin(L.t * 1.3) * 0.9 - L.yaw) * Math.min(1, dt * 2); if (L.wait <= 0) L.leg ^= 1; }
        else if (d < 0.3) { L.wait = post.pause || 2; }
        else if (L.sus < 0.35) { const st = Math.min(d, (post.speed || 1.1) * dt); e.moveXZ(dx / d * st, dz / d * st); L.walking = true; e.locomote(post.speed || 1.1); L.yaw += angWrap(Math.atan2(dx, dz) - L.yaw) * Math.min(1, dt * 5); }
        else { L.walking = false; if (e.curName !== 'thugIdle') e.play('thugIdle', { fade: 0.3 }); }
      } else {
        const want = post.yaw + Math.sin(L.t * 2 * PI / (post.period || 7)) * (post.sweep || 0.8);
        L.yaw += angWrap(want - L.yaw) * Math.min(1, dt * 2.5);
      }
      if (L.look && L.sus > 0.3) L.yaw += angWrap(Math.atan2(L.look.x - e.pos.x, L.look.z - e.pos.z) - L.yaw) * Math.min(1, dt * 3);
      // does he see Dan (or his car)?
      const dx = p.x - e.pos.x, dz = p.z - e.pos.z, d = Math.hypot(dx, dz), off = Math.abs(angWrap(Math.atan2(dx, dz) - L.yaw));
      const range = car_ ? RANGE * 1.5 : RANGE;
      const inCone = d < range && (off < HALF || (d < CLOSE * 1.6 && off < HALF * 1.6));
      const sees = S.grace <= 0 && inCone && !blocked(e.pos.x, e.pos.y + 1.6, e.pos.z, p.x, p.y + 1.1, p.z);
      const heard = S.grace <= 0 && !car_ && sp > 5.4 && d < 7;
      if (sees) { L.sus += dt * (0.55 + (range - d) / range * 1.6) * (sp > 4 ? 1.6 : 1) * (car_ ? 1.8 : 1); if (d < CLOSE) L.sus = 1; L.look = { x: p.x, z: p.z }; }
      else if (heard) { L.sus += dt * 0.9; L.look = { x: p.x, z: p.z }; }
      else L.sus = Math.max(0, L.sus - dt * 0.22);
      // (the one who saw him stays sure of it: his mark red until the alarm)
      if (L === S.by) L.sus = 1;
      if (L.sus >= 1) { L.sus = 1; spotted = spotted || 'seen'; S.by = S.by || L; }
      // the cone, the mark over his head
      L.cone.visible = true;
      L.cone.position.set(e.pos.x, Math.max(e.pos.y, 0.22) + 0.06, e.pos.z); L.cone.rotation.y = L.yaw - PI / 2;
      L.cone.material.color.set(L.sus > 0.66 ? '#EF4444' : L.sus > 0.05 ? '#F59E0B' : '#FFC93C'); L.cone.material.opacity = 0.07 + L.sus * 0.1;
      _v.set(e.pos.x, e.pos.y + 2.35, e.pos.z).project(cam);
      const onScreen = _v.z < 1 && Math.abs(_v.x) < 1.05 && Math.abs(_v.y) < 1.05 && d < 45;
      U.mark(L.id, { x: (_v.x * 0.5 + 0.5) * innerWidth, y: (-_v.y * 0.5 + 0.5) * innerHeight, k: L.sus, on: onScreen && (L.sus > 0.02 || d < 30) });
    }
    // the takedown, said: in position (a step away, behind him) the key; a few steps short of it, closer, and no key
    const T = takeable();
    if (T) U.prompt('Press [E] to take him down', { strong: true });
    else if (!car_ && !S.by && S.lookouts.some((L) => {
      const e = L.e; if (!L.watching || !e.alive || e.state !== 'idle') return false;
      const dx = P.position.x - e.pos.x, dz = P.position.z - e.pos.z, d = Math.hypot(dx, dz);
      return d > 2.4 && d < 5 && Math.abs(angWrap(Math.atan2(dx, dz) - L.yaw)) >= 1.75;
    })) U.prompt('Closer: right behind him', { soft: true });
    else U.prompt(null);
    return spotted;
  };
  // the alarm: every one still up joins the fight
  S.alarm = () => {
    if (S.alarmed) return; S.alarmed = true; U.prompt(null);
    for (const L of S.lookouts) { if (L.watching) { L.watching = false; L.restore(); } L.cone.visible = false; U.unmark(L.id); }
    S.crew?.engage();
  };
  S.standing = () => S.lookouts.filter((L) => L.e.alive).length;
  S.dispose = () => {
    removeEventListener('keydown', onKey, true); U.prompt(null);
    for (const L of S.lookouts) { if (L.watching) L.restore(); scene.remove(L.cone); L.cone.material.dispose(); U.unmark(L.id); }
  };
  return S;
}
