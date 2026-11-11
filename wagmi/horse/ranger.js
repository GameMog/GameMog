// Mog City: Ranger, the hero's horse: the library's bay horse (wagmi/library/creature.js, the anymove horse by Patch,
// CC0) in its tack (tack.js), on gaits made from its own clips (gaits.js), as the body of the hero's ride: it wears the
// interface Dan's roadster and the story's cars wear (wagmi/game.js puts it on the car entity's chassis, and the way in
// and out, the driver's rig and the story runner find what they look for):
//   const rs = await buildRanger(THREE)
//   rs.group (on car.chassisPivot), rs.anchor (the rider's frame: the horse's own at rest, moving with its back),
//   rs.seat { hip, heel } (the rider's marks in it), rs.grip(side, out) (the rein hands, world), rs.update(dt, speed,
//   steer, yaw) (the gaits for the speed, every frame), the doorless car's no-ops (setDoor, door, doorT, setThrust,
//   setElectric), rs.body / rs.axle (its box and its hooves' spread), kind 'horse'.
// Its own: rs.gait (the gait it is in), rs.mix ({ idle, walk, trot, gallop } weights, phases), rs.play(name, o) (buck,
// jump, rear: one-shots over the gaits), rs.oneShot (the one playing, or null), rs.hooves() (the four hooves' world
// points, for their sound), rs.reins(handL, handR) (to the rider's hands, or resting), rs.dispose().
// The gaits run from the speed: idle, walk, trot, gallop (with some overlap so it never flickers between two), each a
// stride that goes round at the speed over its stride length (so the hooves stay planted), held within the gait's own
// cadence; a change cross-fades over a quarter second. Over them: the neck turned into the turn, a buck (its Attack:
// the hind legs lashing out behind), a jump (its Jump: a rear and a leap), a rear (the Jump's first half).
import { loadCreature } from '../library/creature.js';
import { buildGaits } from './gaits.js';
import { buildTack } from './tack.js';

export const HORSE_ID = 'creature-horse';
// the gaits by speed (m/s): [up into it, down out of it]
const BANDS = { walk: [0.25, 0.12], trot: [2.7, 2.2], gallop: [6.4, 5.6] };
// each gait's cadence (strides a second): within it the hooves stay planted, outside it they slip a little rather than
// the legs whirling or crawling
const CAD = { walk: [0.45, 1.3], trot: [1.0, 2.1], gallop: [1.4, 2.7] };
const FADE = 0.25;
// the one-shots: the clip, the stretch of it, how fast, and when its blow lands (s into the clip)
const ONE = {
  buck: { clip: 'Attack', from: 0.05, until: 2.2, ts: 1.35, hit: 0.86 },
  jump: { clip: 'Jump', from: 0.62, until: 2.05, ts: 1.55 },
  rear: { clip: 'Jump', from: 0.0, until: 1.25, ts: 1.15, back: true },
};

export async function buildRanger(THREE, o = {}) {
  const kit = await loadCreature(HORSE_ID);
  const c = kit.make({ name: o.name || 'Ranger' });
  c.object.name = 'ranger';
  c.mesh.frustumCulled = false;
  const G = buildGaits(THREE, kit);
  const tack = buildTack(THREE, c);
  const group = new THREE.Group(); group.name = 'ranger-rig';
  group.add(c.object);

  // the rider's frame: the horse's own at rest, under the back's bone, so he rides its back's rise and fall and pitch
  const anchor = new THREE.Group(); anchor.name = 'ranger-saddle';
  {
    const s2 = c.bone('spine2'); c.object.updateMatrixWorld(true);
    const rest = new THREE.Matrix4().copy(c.object.matrixWorld).invert().multiply(s2.matrixWorld);
    rest.invert().decompose(anchor.position, anchor.quaternion, anchor.scale);
    s2.add(anchor);
  }
  const M = tack.marks;
  const seat = { hip: [0, +(M.seat.y + 0.1).toFixed(3), M.seat.z], heel: [M.stirrup.L.x, M.stirrup.L.y, M.stirrup.L.z] };

  /* ------------------------------------------------------------ the gaits -- */
  const mixer = c.mixer;
  mixer.stopAllAction();
  const act = {
    idle: mixer.clipAction(kit.clips.Idle), walk: mixer.clipAction(G.walk.clip), trot: mixer.clipAction(G.trot.clip), gallop: mixer.clipAction(G.gallop.clip),
  };
  const GAITS = ['idle', 'walk', 'trot', 'gallop'];
  for (const g of GAITS) { const a = act[g]; a.play(); a.setEffectiveWeight(g === 'idle' ? 1 : 0); if (g !== 'idle') a.timeScale = 0; }
  const W = { idle: 1, walk: 0, trot: 0, gallop: 0 }, P = { walk: 0, trot: 0, gallop: 0 }, F = { walk: 0, trot: 0, gallop: 0 };
  let gait = 'idle';
  const pick = (v) => {
    const order = ['idle', 'walk', 'trot', 'gallop'], i = order.indexOf(gait);
    let k = i;
    while (k < 3 && v > BANDS[order[k + 1]][0]) k++;
    while (k > 0 && v < BANDS[order[k]][1]) k--;
    return order[k];
  };
  // the one-shot over the gaits
  let one = null;
  function play(name, opt = {}) {
    const D = ONE[name]; if (!D) return null;
    const clip = kit.clips[D.clip]; if (!clip) return null;
    if (one) { one.a.stop(); }
    const a = mixer.clipAction(clip, undefined); a.reset(); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.timeScale = 0; a.play();
    one = { name, a, t: opt.from ?? D.from, until: opt.until ?? D.until, ts: opt.ts ?? D.ts, hit: D.hit, w: 0, out: 0, hitDone: false, onHit: opt.onHit || null, onEnd: opt.onEnd || null };
    return one;
  }
  // neck and head turned into the turn: about the world's up, as each bone's own axis at rest
  const _q = new THREE.Quaternion(), _wq = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0);
  const turnAxis = (n) => { const b = c.bone(n); b.getWorldQuaternion(_wq); c.object.getWorldQuaternion(_q); return UP.clone().applyQuaternion(_q).applyQuaternion(_wq.invert()).normalize(); };
  c.object.updateMatrixWorld(true);
  const NECK = [['neck1', turnAxis('neck1'), 0.45], ['neck2', turnAxis('neck2'), 0.35], ['head', turnAxis('head'), 0.2]].map(([n, ax, k]) => ({ b: c.bone(n), ax, k }));
  let look = 0;

  function update(dt, speed = 0, steer = 0, yaw = 0) {
    dt = Math.max(0, Math.min(0.1, dt || 0));
    const v = Math.abs(speed), back = speed < -0.05;
    // (turning on the spot: it steps round, at a walk's cadence for the turn)
    const vEff = Math.max(v, Math.abs(yaw) * 0.9);
    gait = one?.name === 'jump' ? gait : pick(vEff);
    // each gait's stride round: at the speed over its stride, held within its cadence
    for (const g of ['walk', 'trot', 'gallop']) {
      const f = Math.min(CAD[g][1], Math.max(CAD[g][0], vEff / G[g].stride));
      F[g] = f;
      if (W[g] > 0.001 || g === gait) P[g] = ((P[g] + (back && g === 'walk' ? -1 : 1) * f * dt) % 1 + 1) % 1;
    }
    for (const g of GAITS) W[g] += ((g === gait ? 1 : 0) - W[g]) * Math.min(1, dt / FADE * 2.2);
    let sum = 0; for (const g of GAITS) sum += W[g];
    // the one-shot: in fast, held, out at its end
    let ow = 0;
    if (one) {
      one.t += dt * one.ts;
      one.w = Math.min(1, one.w + dt / 0.1);
      const left = one.until - one.t;
      if (left < 0.2 / Math.max(0.5, one.ts)) one.out = Math.min(1, one.out + dt / 0.18);
      ow = one.w * (1 - one.out);
      if (one.hit != null && !one.hitDone && one.t >= one.hit) { one.hitDone = true; try { one.onHit?.(one); } catch (e) { console.error('[horse]', e); } }
      if (one.t >= one.until || one.out >= 1) { const o = one; one.a.stop(); one = null; ow = 0; try { o.onEnd?.(o); } catch (e) { console.error('[horse]', e); } }
      else { one.a.time = Math.min(one.t, one.a.getClip().duration); one.a.setEffectiveWeight(ow); }
    }
    for (const g of GAITS) {
      const a = act[g];
      a.setEffectiveWeight((W[g] / (sum || 1)) * (1 - ow));
      if (g !== 'idle') a.time = P[g] * a.getClip().duration;
    }
    mixer.update(dt);
    // the neck into the turn (steer: + left), eased; less at a gallop, none in a buck or a jump
    const want = one ? 0 : Math.max(-1, Math.min(1, steer)) * (0.42 - 0.18 * W.gallop);
    look += (want - look) * Math.min(1, dt * 5);
    if (Math.abs(look) > 1e-3) for (const n of NECK) n.b.quaternion.multiply(_q.setFromAxisAngle(n.ax, look * n.k));
  }

  /* ------------------------------------------------------------- the rest -- */
  const _v = new THREE.Vector3();
  const PAWS = ['fpaw_L', 'fpaw_R', 'hpaw_L', 'hpaw_R'].map((n) => ({ n, b: c.bone(n), p: new THREE.Vector3() }));
  const rs = {
    kind: 'horse', label: o.label || 'Ranger', group, anchor, seat, yoke: null, doors: null, doorless: true, scale: 1,
    setDoor() {}, door() {}, doorT: () => 0, setThrust() {}, setElectric() {},
    update,
    // (its size: nose to tail, across the barrel, to the ears; its box for all that runs into it or round it, the
    // rider's head over the top of it; its hooves' spread either side of its middle)
    length: 2.55, width: 0.85, height: 2.4, body: { hx: 0.45, z0: -1.25, z1: 1.3, top: 2.45 }, axle: 0.64,
    horse: c, kit, gaits: G, tack, marks: M,
    get gait() { return gait; },
    get mix() { return { W: { ...W }, P: { ...P }, F: { ...F } }; },
    weight: (g) => W[g] / (W.idle + W.walk + W.trot + W.gallop || 1),
    phase: (g) => P[g],
    play, get oneShot() { return one; },
    // held in one gait at one phase of its stride (a scene's shot, a frame strip): the next update() carries on from it
    pose(g = 'idle', phase = 0) {
      for (const k of GAITS) W[k] = k === g ? 1 : 0;
      if (g !== 'idle') P[g] = ((phase % 1) + 1) % 1;
      gait = g;
      for (const k of GAITS) { const a = act[k]; a.setEffectiveWeight(W[k]); if (k !== 'idle') a.time = P[k] * a.getClip().duration; }
      mixer.update(0);
    },
    // the rein hands' marks, as world points (for a driver's rig that asks for a grip)
    grip(side, out = new THREE.Vector3()) { return anchor.localToWorld(out.copy(side === 'R' ? M.rein.R : M.rein.L)); },
    stirrup(side, out = new THREE.Vector3()) { return anchor.localToWorld(out.copy(side === 'R' ? M.stirrup.R : M.stirrup.L)); },
    reins: (l, r) => tack.reins(l, r),
    // the hooves: world points of the four fetlocks (their sole 0.2 m under), for their sound
    hooves() { c.object.updateMatrixWorld(true); for (const h of PAWS) h.b.getWorldPosition(h.p); return PAWS; },
    dispose() { tack.dispose(); anchor.removeFromParent(); c.dispose(); group.removeFromParent(); },
  };
  // (the first frame's pose, so its box and its bones are right before anything reads them)
  update(0.016, 0, 0);
  _v.set(0, 0, 0);
  return rs;
}
