// Mog City: Dan's side of the fight: his moves, how he moves in a fight, and his animation through game.js's layers.
// He fights freeflow, as in the games the owner named: every blow goes to a man (the one the stick or the camera points
// at), closing the gap first: a run in on his own legs and a step into the blow (the strike clip only fades in for its
// wind-up), or, from further, a flying kick. He lands where his fist or foot meets the man (the contact distances were
// measured on both bodies), turns fast but never snaps, and every blow is checked against the body it is for.
// Moves:
//   strike  jab > cross > hook > uppercut or roundhouse (the chain resets after a pause); a man knocked flat is passed over
//   heavy   a kick or a rising uppercut that puts a man down; with the combo meter full, the takedown (a flying kick that
//           lays him out, then a fist from overhead into him on the ground); at a man on the ground (or still falling)
//           within 4.5 m, the ground finisher
//   counter while a man's cue shows yellow: his blow is stopped dead, a moment of slow motion, and he is put down; two
//           men swinging together: both stopped, put down one after the other (the double counter). The full rules
//           (index.js c.rules): thrown with no yellow cue up (none, too early, or a red one) it whiffs: a swing at the
//           air and 0.42 s open (presses meanwhile are lost)
//   (strikes mashed ahead of the beat under the full rules: two or more presses before a blow lands and it ends in an
//   overswing, 0.45 s open)
//   dodge   a roll the way the stick points, or a back flip away; in the last moment before a blow (perfect) time slows
//           and his next blow is a counter's; a brute's slam dodged leaves the brute stunned
//   grab    a dazed man (three blows in a row) or a stunned brute (run in to from up to 5 m): lifted overhead and slammed;
//           otherwise the bat, bottle or trash can by him: picked up (off the street: down on one knee for it, the hand
//           reaching it), and with something in his hands the grab key throws it
// Armed: a bat swings (a rising swing, then the big one from over his shoulder; heavy: a low sweep that takes the legs;
// between swings it hangs at his side) and wears out (~8 hits, then it snaps); a bottle is broken over a head (one use); a trash can, carried in both hands,
// is thrown (strike, heavy or grab) or, at a man lying in the street, brought down on him (heavy). A blow that hits
// carrying the can knocks it out of his hands; knocked down, he drops whatever he has.
// Hit reactions: a flinch and a step back, or (a brute's slam, a red bat swing, a blow while down to nothing) knocked
// flat, then up. A slam, a finisher or a can brought down leaves him open to the others unless it comes straight off a
// counter, a perfect dodge or the takedown.
// A roll, a flip, a fall goes only where his body has room (walls, his car, trunks, poles, cans, the traffic: the
// nearest way round, or as far as there is) and never straight at the lens; a dash or a takedown never goes at a man
// across the car or behind a wall.
import * as THREE from 'three/webgpu';
import { clamp, smooth, lerp, yawTo, hdist, angWrap, fwd, right } from './util.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
// [clip, moment of contact (clip s), pace, root-to-root distance at contact (m, a grunt; a brute is bigger), damage,
// kind, side (where it lands: +1 his left, -1 his right, the way his head snaps), the limb that lands]
// (measured again 23 Oct, Dan standing upright over his feet: his fists land 0.27-0.35 m nearer him than they did when
// he leaned 11 deg into every move, his kicks ~0.15 m; the ranges brought in to match, so they still meet the body)
const MOVES = {
  // (the jab and the cross snap out: their wind-up mostly skipped, the fist lands ~0.11-0.13 s after the press)
  jab: { clip: 'ffJab', from: 0.07, hit: 0.24, ts: 1.55, range: 0.83, dmg: 8, kind: 'light', side: 0, limb: 'fl' },
  cross: { clip: 'ffCross', from: 0.06, hit: 0.26, ts: 1.5, range: 0.93, dmg: 9, kind: 'light', side: 1, limb: 'fr' },
  hook: { clip: 'ffHook', hit: 0.29, ts: 1.35, range: 0.62, dmg: 10, kind: 'light', side: -1, limb: 'fr' },
  kick: { clip: 'ffKick', hit: 0.30, ts: 1.4, range: 1.0, dmg: 10, kind: 'light', side: 1, limb: 'footR' },
  uppercut: { clip: 'ffRiser', hit: 0.30, ts: 1.2, range: 0.72, dmg: 15, kind: 'ender', side: 0, limb: 'fr', up: 4.4, fly: 3.2 },
  roundhouse: { clip: 'ffKick', hit: 0.30, ts: 1.15, range: 1.0, dmg: 16, kind: 'ender', side: 1, limb: 'footR' },
  leap: { clip: 'ffLeap', hit: 0.22, ts: 1.15, range: 1.05, dmg: 16, kind: 'ender', side: 0, limb: 'footR' },
  // heavies (slower, harder: a man down, a brute's armour wearing through)
  heavyKick: { clip: 'ffKick', from: 0.05, hit: 0.30, ts: 1.1, range: 1.0, dmg: 18, kind: 'heavy', side: 1, limb: 'footR', fly: 6.8, up: 3.4 },
  heavyRiser: { clip: 'ffRiser', from: 0.04, hit: 0.30, ts: 1.1, range: 0.72, dmg: 17, kind: 'heavy', side: 0, limb: 'fr', fly: 3, up: 5.4 },
  // a counter: the cross, through him
  counter: { clip: 'ffCross', from: 0.06, hit: 0.26, ts: 1.5, range: 0.93, dmg: 14, kind: 'counter', side: 1, limb: 'fr', fly: 5.5, up: 3.4 },
  // armed (from: where the clip starts, until: where it stops; the ranges measured with the item in his fist):
  //   bat: a rising swing (low across his front, then up on his left: he squares up turned right of the man, yawOff,
  //   so it meets his ribs), then the big one, down from over his right shoulder (turned left of him: it comes down on
  //   his shoulder and head); heavy, a low sweep that takes the legs. lo: the lowest it may meet him (x his height)
  batRise: { clip: 'slash1', from: 0.12, until: 0.33, hit: 0.258, ts: 1.0, range: 1.45, dmg: 15, kind: 'light', side: -1, limb: 'item', w: 0.6, up: 2, yawOff: -0.75, lo: 0.9 },
  batSmash: { clip: 'smash', from: 0.24, until: 0.47, hit: 0.386, ts: 1.0, range: 1.27, dmg: 24, kind: 'ender', side: 1, limb: 'item', fly: 7.5, up: 3.6, yawOff: 0.9, lo: 1.25 },
  batSweep: { clip: 'slash3', from: 0.03, until: 0.3, hit: 0.155, ts: 0.9, range: 1.05, dmg: 18, kind: 'heavy', side: 0, limb: 'item', fly: 2.5, up: 4.8, low: true },
  //   bottle: over his head (the swing comes round from high on Dan's right: he squares up turned a little to his left
  //   (yawOff, rad) so it comes down on the man's head)
  bottleSmash: { clip: 'smash', from: 0.24, until: 0.47, hit: 0.385, ts: 1.0, range: 0.92, dmg: 26, kind: 'ender', side: 1, limb: 'item', fly: 4.5, up: 3.0, stun: true, head: true, yawOff: 0.45 },
};
const CHAIN = [['jab'], ['cross'], ['hook', 'kick'], ['uppercut', 'roundhouse']];
const ARMED = { bat: [['batRise'], ['batSmash']], bottle: [['bottleSmash']] };
const DASH = { leap: 4.4, max: 7.2, lunge: 0.3 };      // run in up to `leap` m of gap, a flying kick beyond (to `max`)
const FIGHT = { near: 12, far: 16, step: 2.3, run: 5.6 }; // the fight's footwork: in it within `near` m, out past `far`
const DODGE = { safe: 0.5, perfect: 0.3, late: 0.05, counter: 1.4, mult: 1.6 };
// the full rules' price of a guess: a counter whiffed (no yellow cue) and a mashed combo's overswing, open this long
const OPEN = { whiff: 0.42, over: 0.45, mash: 2 };
// the combo meter (full: the takedown): what each blow that lands adds, and the pause that loses the run
const METER = { light: 1 / 8, heavy: 1 / 6, counter: 1 / 5, perfect: 1 / 4, lapse: 3.2 };
const REGEN = { delay: 6, rate: 7 }; // (out of a fight only)
const FINISH = 4.5; // the ground finisher's reach (m: a heavy throws a man 3-5 m)
// picking up: off the street (the crush: down on one knee, his right fist by the street 0.52 ahead and 0.24 to his
// right at 0.6 s) or a can by its handles (the pickup clip's lean); grasp: the clip's moment the hand closes; up: how
// soon after it he comes back up, lift: the can's rise into his arms (a pickup mid-fight takes 0.3-0.7 s)
const PICK = { low: { clip: 'crush', from: 0.5, until: 1.24, ts: 1.35, grasp: 0.61, ahead: 0.52, side: 0.24, up: 0.1 }, can: { clip: 'pickup', from: 0.02, until: 0.6, ts: 1.3, grasp: 0.24, ahead: 0.6, lift: 0.26 } };
// the can in his hands: its middle this high and this far ahead; overhead for a throw or a slam
const CARRY = { y: 0.8, f: 0.45, over: [0, 2.05, -0.3], release: [0, 1.85, 0.5], slam: [0, 1.8, 0.62] };
// throwing: a can over his head with both hands (the crush's overhead and drive), a bottle or a bat overarm (the smash's)
const THROW = { two: { clip: 'crush', from: 0.06, until: 0.7, ts: 1.05, over: 0.36, release: 0.5 }, one: { clip: 'smash', from: 0.2, until: 0.47, ts: 1.15, release: 0.372 } };
// elbows: out and down round the can, up and out with it overhead
const POLE = { L: new THREE.Vector3(1, -0.8, -0.3), R: new THREE.Vector3(-1, -0.8, -0.3), Lup: new THREE.Vector3(1, 0.3, -0.6), Rup: new THREE.Vector3(-1, 0.3, -0.6), low: new THREE.Vector3(-0.5, 0.3, -1), side: new THREE.Vector3(-0.4, -0.2, -1), tuck: new THREE.Vector3(1, -1, -0.2) };
// a bat he isn't swinging: his right hand low at his side, the bat's end down by the street ahead of him; the left arm
// tucked in through a one-handed swing over the top (the smash flings it out straight)
const BATDOWN = { hand: [-0.27, 0.9, 0.16], dir: [-0.2, -0.72, 0.66] };

export function createHero(c) {
  const W = c.W, p = W.person, Q = W.dan, cm = c.cm;
  const M = { name: 'free', t: 0 };
  const me = {
    M, hp: 100, maxHp: 100, invulnUntil: 0, comboStep: 0, lastAttackT: -9, target: null, counterUntil: 0, focus: null,
    meter: 0, lastHurtT: -99, fighting: false, holding: null, vel: new THREE.Vector3(), contact: null,
  };
  const prev = new THREE.Vector3();
  const pos = p.position;
  // logical facing at once, the visible body turns fast but continuously (a half turn in ~0.3 s, never a snap)
  function face(yaw) { M.yawGoal = yaw; }
  function turn(dt, rate = 14, maxW = 11) {
    if (M.yawGoal == null) return;
    const d = angWrap(M.yawGoal - p.heading);
    p.heading = angWrap(p.heading + clamp(d * (1 - Math.exp(-rate * dt)), -maxW * dt, maxW * dt));
  }
  function collide() { cm.resolveHorizontalCollision(pos, 0.48, pos.y + 1.0); c.carPush(pos, 0.36); }
  function setXZ(x, z) { pos.x = x; pos.z = z; collide(); }
  function ground(dt) {
    const gy = cm.getGroundHeight(pos.x, pos.z, 'person');
    if (M.air) return;
    p.verticalVel = (p.verticalVel || 0) - 14.5 * dt; pos.y += p.verticalVel * dt;
    if (pos.y < gy) { pos.y = gy; p.verticalVel = 0; }
  }
  function start(name, o = {}) { const g = M.yawGoal; for (const k of Object.keys(M)) delete M[k]; Object.assign(M, { name, t: 0, hitDone: false, yawGoal: g, ...o }); }
  function free(fade = 0.22) { const g = M.yawGoal; for (const k of Object.keys(M)) delete M[k]; M.name = 'free'; M.t = 0; M.yawGoal = g; Q.stop(fade); Q.reach('L', null, 0); Q.reach('R', null, 0); }
  me.isFree = () => M.name === 'free';
  me.busy = () => M.name !== 'free';
  me.moveName = () => M.name;
  // (a slam, a finisher, a can brought down: the men can make him pay for them, unless they come straight off a
  // counter, a perfect dodge or the takedown)
  me.invuln = () => c.time < me.invulnUntil || M.name === 'down' || M.name === 'getup' || (M.safe && (M.name === 'slam' || M.name === 'ground' || M.name === 'canSlam'));
  me.lastCounterT = -9;
  const earned = () => c.time - me.lastCounterT < 1.8;
  me.down = () => M.name === 'down' || M.name === 'getup';
  me.addMeter = (kind) => { me.meter = Math.min(1, me.meter + (METER[kind] ?? METER.light)); };

  // ------------------------------------------------------------------ targeting
  // dir: the way the player points (camera-relative), else the camera's forward; standing men only, the one in that
  // direction and near scoring best (the man he is already on, and a man winding up, a little better still)
  function pickTarget(dir, maxD, { downed = false, reach = false } = {}) {
    const want = dir && dir.lengthSq() > 0.04 ? _v.copy(dir).setY(0).normalize() : fwd(c.camYaw(), _v);
    let best = null, bs = Infinity;
    for (const e of c.enemies) {
      if (downed ? !e.grounded : !e.targetable) continue;
      const d = hdist(pos, e.pos); if (d > maxD) continue;
      if (Math.abs(e.pos.y - pos.y) > 2) continue;
      // (a man across the car or behind a wall is not one to dash at)
      if (reach && d > 1.5 && (c.carCross(pos, e.pos, 0.3) || c.lineBlocked(pos, e.pos))) continue;
      const to = _v2.set(e.pos.x - pos.x, 0, e.pos.z - pos.z).normalize();
      const ang = Math.acos(clamp(to.dot(want), -1, 1));
      let sc = d * 0.6 + ang * 3.2;
      if (e === me.target) sc -= 1.0;
      if (e.state === 'attack' || e.state === 'approach') sc -= 0.4;
      if (sc < bs) { bs = sc; best = e; }
    }
    return best;
  }
  me.pickTarget = pickTarget;
  function nearest(maxD) { let d = Infinity, b = null; for (const e of c.enemies) if (e.standing || e.state === 'getup') { const k = hdist(e.pos, pos); if (k < d) { d = k; b = e; } } return d <= maxD ? b : null; }
  // the stick, camera-relative (W ahead along the view, D to its right)
  function stick(keys, out = new THREE.Vector3()) {
    const f = (+keys.forward || 0) - (+keys.backward || 0), s = (+keys.right || 0) - (+keys.left || 0);
    const y = c.camYaw();
    out.set(0, 0, 0).addScaledVector(fwd(y, _v3), f).addScaledVector(right(y, _v3), s);
    if (out.lengthSq() > 1) out.normalize();
    return out;
  }

  // how far he can go from `from` along d (unit, on the ground) before his body (r m round him) meets something: a wall,
  // his car, a trunk, a pole, a can, a car in the traffic
  function room(from, d, dist, r = 0.45) {
    _a.copy(from).setY(from.y + 0.9); _b.copy(_a).addScaledVector(d, dist + r);
    let free = c.cam.firstBlock(_a, _b) - r;
    _b.setY(from.y); const h = c.carHit(from, _b, r); if (h >= 0) free = Math.min(free, h * (dist + r) - 0.05);
    // (a park's fence, a lawn hoop, a bench: solid to him on foot, js/controllers.js lowObstacles)
    const lo = cm.lowAhead?.(from.x, from.z, from.y, d.x, d.z, r, dist); if (lo) free = Math.min(free, lo.enter - 0.05);
    for (let s = 0.3; s < Math.min(free, dist) + r; s += 0.3) { // (a wall at his shoulder as he goes: the body's width)
      const x = from.x + d.x * s, z = from.z + d.z * s;
      if (c.solid(x - d.z * r, from.y + 1.0, z + d.x * r) || c.solid(x + d.z * r, from.y + 1.0, z - d.x * r)) { free = Math.min(free, s - r); break; }
    }
    return Math.max(0, Math.min(dist, free));
  }
  me.room = room;

  // ------------------------------------------------------------------ strikes (run in, then the blow)
  let lastMove = '';
  const rangeOf = (S, T) => S.range * (T.type === 'brute' ? 1.14 : 1);
  function dashDist(u, D, T, v0, v1) { const u2 = u * u, u3 = u2 * u; return (u3 - 2 * u2 + u) * v0 * T + (-2 * u3 + 3 * u2) * D + (u3 - u2) * v1 * T; }
  function strikeWith(T, S, o = {}) {
    const P0 = pos.clone();
    const range = rangeOf(S, T);
    const gap = Math.max(0, hdist(P0, T.pos) - range);
    const dir0 = _v.set(P0.x - T.pos.x, 0, P0.z - T.pos.z); if (dir0.lengthSq() < 1e-6) fwd(p.heading + Math.PI, dir0); dir0.normalize();
    let { clip, hit, ts, kind, dmg, side, limb, fly, up } = S, from = S.from || 0;
    if (o.counter || c.time < me.counterUntil) { dmg *= DODGE.mult; if (kind === 'light') kind = 'ender'; me.counterUntil = 0; o.counter = true; }
    if (o.ts) ts = o.ts;
    const base = { target: T, clip, from, until: S.until, hit, ts, kind, dmg, side, limb, fly, up, w: S.w, stun: S.stun, low: S.low, head: S.head, lo: S.lo, yawOff: S.yawOff || 0, P0, dir0: dir0.clone(), range, pressT: c.time, counter: !!o.counter };
    if ((gap > DASH.leap || o.leap) && !o.noLong) { // too far to run in (or the takedown): the flying kick, airborne the whole way
      const L = MOVES.leap, flyT = clamp(gap / 13, 0.26, 0.5);
      Object.assign(base, { clip: L.clip, hit: L.hit, ts: L.hit / flyT, kind: o.leap ? kind : 'ender', dmg: Math.max(dmg, L.dmg), side: 0, limb: L.limb, range: rangeOf(L, T), long: true, flyT, clipOn: true, dashDur: flyT });
      start(o.name || 'strike', base);
      M.track = Q.play(L.clip, { ts: base.ts, fade: 0.06 });
      c.sfx('whoosh', 1.4);
    } else {
      // run in on his legs until a step short of the man, THEN the blow, its wind-up thrown as he steps the last bit in
      const windup = (hit - from) / ts;
      const v0 = Math.max(0, me.vel.length() * Math.cos(angWrap(Math.atan2(me.vel.x, me.vel.z) - yawTo(P0, T.pos))));
      const runD = Math.max(0, gap - DASH.lunge);
      const runT = runD > 0.05 ? clamp(0.06 + runD / 12.5 - Math.min(0.1, v0 * 0.01), 0.1, 0.44) : 0;
      Object.assign(base, { long: false, dashDur: runT + windup, runT, runD, windup, clipAt: Math.max(0, runT - 0.05), clipOn: false, v0, D0: Math.max(0.01, gap) });
      start(o.name || 'strike', base);
      if (M.clipAt <= 0) playStrikeClip(); else Q.stop(0.12);
      c.sfx('whoosh', kind === 'light' ? 0.6 : 1);
    }
    face(yawTo(P0, T.pos) + (M.yawOff || 0));
    me.target = T; me.lastAttackT = c.time;
  }
  function playStrikeClip() {
    M.clipOn = true;
    const windup = (M.hit - M.from) / M.ts;
    M.track = Q.play(M.clip, { from: M.from, until: M.until, ts: M.ts, fade: clamp(windup * 0.7, 0.06, 0.12) });
  }
  const chain = () => (me.holding && ARMED[me.holding.kind]) || CHAIN;
  function chooseMove(step, T) {
    const d = hdist(pos, T.pos), C = chain();
    // no kick thrown on the run-up (it would slide in the kick's pose): kicks from close only
    const pool = C[step].filter((k) => (k !== lastMove || C[step].length === 1) && !(d > 2.4 && MOVES[k].clip === 'ffKick'));
    return pool[Math.floor(Math.random() * pool.length)] || C[step][0];
  }
  function strike(T) {
    const C = chain();
    if (c.time - me.lastAttackT > 0.95) me.comboStep = 0;
    const key = chooseMove(me.comboStep % C.length, T); lastMove = key;
    strikeWith(T, MOVES[key]);
    me.comboStep = (me.comboStep + 1) % C.length;
  }
  function whiff(clipKey = 'jab') {
    if (me.holding && ARMED[me.holding.kind]) clipKey = ARMED[me.holding.kind][me.comboStep % ARMED[me.holding.kind].length][0];
    const S = MOVES[clipKey]; me.comboStep = (me.comboStep + 1) % chain().length; me.lastAttackT = c.time;
    start('whiff', { end: S.until ? (S.until - (S.from || 0)) / S.ts : 0.3 }); M.track = Q.play(S.clip, { from: S.from || 0, until: S.until, ts: S.ts, fade: 0.08 }); c.sfx('whoosh', me.holding ? 1.1 : 0.5);
  }
  function heavy(T) {
    const brute = T.type === 'brute', I = me.holding;
    let key = brute ? 'heavyKick' : (me.lastHeavy === 'heavyKick' ? 'heavyRiser' : 'heavyKick');
    if (I && I.kind === 'bat') key = brute ? 'batSmash' : 'batSweep';
    else if (I && I.kind === 'bottle') key = 'bottleSmash';
    me.lastHeavy = key; me.comboStep = 0;
    strikeWith(T, MOVES[key], { noLong: true, name: 'heavy', ts: I ? MOVES[key].ts * 0.92 : undefined });
  }
  // the takedown (combo meter full): a flying kick that lays him out, then the fist from overhead into him on the ground
  function takedown(T) {
    me.meter = 0; c.releaseToken(T); c.clearThreats(T);
    T.set('stagger'); T.stagT = 1.5; T.play('thugStumbleBack', { once: true, ts: 0.3, fade: 0.1 }); // held for the moment
    const brute = T.type === 'brute';
    strikeWith(T, { ...MOVES.leap, kind: 'takedown', dmg: brute ? 70 : 999, fly: brute ? 2 : 4.2, up: 3.2 }, { leap: true, name: 'strike' });
    me.followUp = { target: T, until: c.time + 2.2 }; me.invulnUntil = c.time + 1.0; me.lastCounterT = c.time;
    c.cine(T, 1.7);
  }
  // the ground finisher: beside him, a fist from overhead into his chest
  // where he kneels for it: beside the man, across his body (head to hips), on the side Dan is on (the crush lands its
  // fist 0.54 m ahead and 0.25 m to his right); out: the spot, and the way he faces there
  function finisherSpot(T, out) {
    const chest = T.bones.spine2 ? T.bones.spine2.getWorldPosition(_a) : T.chest(_a);
    const head = T.headPos(_b), axis = _v2.set(head.x - chest.x, 0, head.z - chest.z).normalize();
    const side = _v.set(-axis.z, 0, axis.x); if (side.x * (pos.x - chest.x) + side.z * (pos.z - chest.z) < 0) side.negate();
    const yaw = Math.atan2(-side.x, -side.z);
    out.copy(chest).addScaledVector(fwd(yaw, _v2), -0.66).addScaledVector(right(yaw, _v3), -0.25); out.y = pos.y;
    return yaw;
  }
  function groundFinisher(T) {
    const at = new THREE.Vector3(), yaw = finisherSpot(T, at);
    // from further than a step: a run there first, on his legs (the blow's clip only once he is beside him and down)
    const D = hdist(pos, at), runT = D > 0.9 ? clamp(D / 6.5, 0.12, 0.7) : 0;
    start('ground', { target: T, P0: pos.clone(), at, hit: 0.58, runT, arrive: runT + 0.3, clipOn: false, yawEnd: yaw, safe: earned() });
    if (T.state === 'down') T.downT = Math.max(T.downT || 0, T.st + runT + 1.1); // (he stays down for it)
    if (!runT && T.state === 'down') { M.clipOn = true; M.track = Q.play('crush', { from: 0.05, ts: 1.15, fade: 0.08 }); face(yaw); }
    else { Q.stop(0.12); face(yawTo(pos, at)); }
    me.target = T;
    c.sfx('whoosh', 0.9);
  }
  // counter: his blow stopped dead, the cross through him
  // (his weapon: snatched out of his hand when Dan's are empty, knocked away otherwise; a can in Dan's hands is let
  // fall for it; armed, the counter is the weapon's big swing)
  // two or three men swinging at once: all stopped dead, put down one after the other (the double, the triple counter)
  function counter(threat, others = []) {
    const e = threat.e;
    const dir = _v.set(e.pos.x - pos.x, 0, e.pos.z - pos.z).normalize().clone();
    if (me.holding && me.holding.def.hands === 2) dropHeld(0.5);
    let took = null;
    if (e.weapon) { if (!me.holding) { took = e.weapon; e.weapon = null; took.holder = null; c.items.give(me, took, 0.1); } else e.disarm(_v2.copy(dir).multiplyScalar(3).setY(3)); }
    e.parry(dir);
    me.invulnUntil = Math.max(me.invulnUntil, c.time + 0.45);
    const I = me.holding, S = I && I.kind === 'bat' && !took ? MOVES.batSmash : I && I.kind === 'bottle' && !took ? MOVES.bottleSmash : MOVES.counter;
    strikeWith(e, S, { noLong: true, counter: true, name: 'strike', ts: S === MOVES.counter ? undefined : 1.45 });
    M.isCounter = true; me.lastCounterT = c.time;
    others.forEach((o, i) => { const e2 = o.e; e2.disarm(_v2.set(e2.pos.x - pos.x, 0, e2.pos.z - pos.z).normalize().multiplyScalar(3).setY(3)); e2.parry(_v2.set(e2.pos.x - pos.x, 0, e2.pos.z - pos.z).normalize()); e2.stagT = 1.1 + 0.45 * i; });
    if (others.length) M.then = others.map((o) => o.e);
    c.onCounter(e, took, others.length + 1);
  }
  // a counter with no yellow cue to answer (the full rules): a swing at the air, off balance a moment. t: the cue up
  // (a white one: too early; a red one: dodge that), for the word
  let toldT = -9;
  function counterWhiff(t) {
    const T = t ? t.e : pickTarget(null, 4);
    if (T) face(yawTo(pos, T.pos));
    start('cwhiff', { end: OPEN.whiff }); M.track = Q.play('ffCross', { from: 0.06, until: 0.36, ts: 1.15, fade: 0.06 });
    c.sfx('whoosh', 0.7); c.sfx('deny');
    if (c.time - toldT > 3) { toldT = c.time; c.hud.flash(!t ? 'Nothing to counter: wait for the yellow' : t.kind === 'counter' ? 'Too early: counter on the yellow' : 'Red: dodge it, don’t counter', 'danger'); }
    me.comboStep = 0;
  }
  // a combo mashed ahead of its beat: the last blow carries him past his man, off balance a moment
  function overswing() {
    start('overswing', { end: OPEN.over }); M.track = Q.play('ffHook', { from: 0.29, until: 0.6, ts: 0.85, fade: 0.08 });
    c.sfx('whoosh', 0.5);
    if (c.time - toldT > 3) { toldT = c.time; c.hud.flash('Too fast: one press a blow', 'danger'); }
    me.comboStep = 0;
  }
  // a way he is thrown or flips (unit, on the ground) turned off the camera's line when it would take him straight at
  // the lens (k: how square on counts), to the side with room to land
  function offLens(d, k = 0.7, turn = 0.8, dist = 2.5) {
    const cy = c.camYaw(), bx = -Math.sin(cy), bz = -Math.cos(cy); // toward the lens
    if (d.x * bx + d.z * bz < k) return d;
    let best = null, bs = -Infinity;
    for (const sg of [1, -1]) {
      const r = _v3.copy(d).applyAxisAngle(UP, sg * turn), x = pos.x + r.x * dist, z = pos.z + r.z * dist;
      const sc = -(r.x * bx + r.z * bz) - (c.solid(x, pos.y + 1, z) || c.carSolid(x, pos.y + 0.5, z, 0.3) ? 5 : 0);
      if (sc > bs) { bs = sc; best = sg; }
    }
    return d.applyAxisAngle(UP, best * turn);
  }
  // dodge: a roll the way the stick points, a back flip away from the blow (no stick, or back the way he faces)
  function dodge(threat, perfect, dir) {
    if (me.holding && me.holding.def.hands === 2) dropHeld(1.2);
    let move;
    if (dir && dir.lengthSq() > 0.1) move = dir.clone().normalize();
    else if (threat) move = _v.set(pos.x - threat.e.pos.x, 0, pos.z - threat.e.pos.z).normalize().clone();
    else move = fwd(p.heading + Math.PI, new THREE.Vector3());
    const back = threat && (!dir || dir.lengthSq() < 0.1) || Math.abs(angWrap(Math.atan2(move.x, move.z) - p.heading)) > 2.3;
    if (back) offLens(move);
    // (the way must be clear for his whole body, a flip's arc a body length: a wall, the car, a tree, a pole or the
    // traffic there, and he goes the nearest way round that has room, or as far as there is)
    let dist = back ? 3.0 : 3.4; const r = back ? 0.62 : 0.45;
    if (room(pos, move, dist, r) < dist - 0.05) {
      // (scored: the room it has, how far it turns from the way he meant, and never straight at the lens)
      const cy = c.camYaw(), lx = -Math.sin(cy), lz = -Math.cos(cy);
      let bestM = move, bs = -Infinity, bestF = 0;
      for (const a of [0, 0.45, -0.45, 0.9, -0.9, 1.35, -1.35, 1.8, -1.8]) {
        const m2 = move.clone().applyAxisAngle(UP, a), f = room(pos, m2, dist, r);
        const sc = Math.min(f, dist) * 2 - Math.abs(a) * 0.5 - (m2.x * lx + m2.z * lz > 0.6 ? 2 : 0);
        if (sc > bs) { bs = sc; bestM = m2; bestF = f; }
      }
      move = bestM; dist = Math.max(0.7, Math.min(dist, bestF));
    }
    if (back) {
      start('dodge', { move, flip: true, dist, P0: pos.clone(), perfect, go: 0.08, dur: 0.46, end: 0.62 });
      M.track = Q.play('ffDodge', { ts: 1.5, fade: 0.06 });
      face(Math.atan2(-move.x, -move.z));
    } else {
      start('dodge', { move, flip: false, dist, P0: pos.clone(), perfect, go: 0.04, dur: 0.6, end: 0.78 });
      M.track = Q.play('roll', { ts: 1.75, fade: 0.06 });
      face(Math.atan2(move.x, move.z));
    }
    me.invulnUntil = c.time + DODGE.safe;
    c.sfx('whoosh', 1.1);
    if (perfect) { me.counterUntil = c.time + DODGE.counter; me.lastCounterT = c.time; }
  }
  // ------------------------------------------------------------------ things in his hands
  // a point in his own frame (x his left, y up, z ahead) in the world
  const local = (x, y, z, out = new THREE.Vector3()) => { const h = p.heading, cs = Math.cos(h), sn = Math.sin(h); return out.set(pos.x + x * cs + z * sn, pos.y + y, pos.z - x * sn + z * cs); };
  // both hands on the can's handles (its own ±x, up its side), or low on its sides when it is over his head (u: 0..1)
  function handsOnCan(I, w, u = 0) {
    const hy = lerp(0.18, -0.2, u), hx = lerp(0.33, 0.3, u);
    I.obj.updateMatrixWorld(true);
    Q.reach('L', I.obj.localToWorld(_v.set(hx, hy, 0)), w, u > 0.5 ? POLE.Lup : POLE.L);
    Q.reach('R', I.obj.localToWorld(_v.set(-hx, hy, 0)), w, u > 0.5 ? POLE.Rup : POLE.R);
  }
  // the can carried before him (the pose step, after he has moved: game.js's pre hook)
  function carryPose(I, out = I.obj) {
    local(0, CARRY.y, CARRY.f, out.position); out.quaternion.setFromAxisAngle(UP, p.heading);
  }
  // the left fist in before his chest, wherever the swing has turned it (the chest's own front: up x his shoulders)
  function tuckL(w) {
    const B = Q.bones, L = B.upperarm01_L, R = B.upperarm01_R, ch = B.spine03; if (!L || !R || !ch) return;
    L.getWorldPosition(_a); R.getWorldPosition(_b); ch.getWorldPosition(_hold);
    const ac = _b.sub(_a).setY(0).normalize(), f = _a.set(0, 1, 0).cross(ac);
    _hold.addScaledVector(f, 0.26).addScaledVector(ac, -0.02); _hold.y -= 0.14;
    Q.reach('L', _hold, w, POLE.tuck);
  }
  const ldir = (x, y, z, out) => { const h = p.heading, cs = Math.cos(h), sn = Math.sin(h); return out.set(x * cs + z * sn, y, -x * sn + z * cs).normalize(); };
  const _hold = new THREE.Vector3();
  let batDown = false;
  me.carryK = 0;
  me.pre = (dt = 0) => {
    const I = me.holding, can = I && I.def.hands === 2;
    if (can && M.name === 'free' && c.live()) { carryPose(I); handsOnCan(I, 1); me.carrying = true; }
    else if (me.carrying && !can) { me.carrying = false; if (M.name === 'free') { Q.reach('L', null, 0); Q.reach('R', null, 0); } } // (it went: the hands let go)
    // a bat he isn't swinging: lowered at his side (eased, the hand and the bat together)
    const want = I && I.kind === 'bat' && M.name === 'free' && c.live() ? 1 : 0;
    me.carryK += (want - me.carryK) * Math.min(1, dt * 14);
    if (want) { batDown = true; Q.reach('R', local(...BATDOWN.hand, _hold), 1, POLE.side); }
    else if (batDown) { batDown = false; if (M.name !== 'pickup') Q.reach('R', null, 0); }
    if (I && I.kind === 'bat') { const A = I.aimAt || (I.aimAt = { w: 0, dir: new THREE.Vector3() }); A.w = smooth(me.carryK); ldir(...BATDOWN.dir, A.dir); I.aim = me.carryK > 0.01 ? A : null; }
    // the left arm kept in through a one-handed swing over the top, and while it fades out (the clip flings it out)
    let sw = 0; for (const t of Q.tracks) if (t.name === 'smash') sw = Math.max(sw, t.env);
    if (sw > 0.02 && !can) { tucked = true; tuckL(0.95 * Math.min(1, sw / 0.15)); } else if (tucked) { tucked = false; if (!can) Q.reach('L', null, 0); }
  };
  let tucked = false;
  // let go of what he holds: it falls before him (k: how hard it is flung)
  function dropHeld(k = 0.6, dir = null) {
    const I = me.holding; if (!I) return;
    const d = dir ? _v2.copy(dir) : fwd(p.heading, _v2);
    c.items.drop(me, false, _v.copy(d).multiplyScalar(1.2 * k).setY(1.2 + k));
    if (I.def.hands === 2) { Q.reach('L', null, 0); Q.reach('R', null, 0); }
  }
  me.dropHeld = dropHeld;
  // picking up: a step to where his hand will meet it, then down for it
  function pickup(I) {
    const two = I.def.hands === 2, hp = c.items.handle(I, new THREE.Vector3()), gy = cm.getGroundHeight(pos.x, pos.z, 'person');
    const yaw = yawTo(pos, two ? I.obj.position : hp);
    const P = two ? PICK.can : PICK.low;
    const stand = two ? I.obj.position.clone().addScaledVector(fwd(yaw, _v), -P.ahead) : hp.clone().addScaledVector(fwd(yaw, _v), -P.ahead).addScaledVector(right(yaw, _v2), -P.side);
    stand.y = pos.y;
    const D = hdist(pos, stand), runT = D > 0.1 ? clamp(0.06 + D / 5, 0.1, 0.45) : 0;
    start('pickup', { item: I, two, P, P0: pos.clone(), stand, runT, clipOn: false, got: false, lowItem: hp.y - gy < 0.6 });
    face(yaw); I.claim = me;
    if (!runT) startPickClip(); else Q.stop(0.12);
  }
  function startPickClip() { const P = M.P; M.clipOn = true; M.track = Q.play(P.clip, { from: P.from, until: P.until, ts: P.ts, fade: 0.14 }); }
  function pickupMotion(dt) {
    const I = M.item;
    if (!I || I.state === 'gone' || (I.holder && I.holder !== me)) { if (I && I.claim === me) I.claim = null; free(0.2); return; }
    if (!M.clipOn) {
      const u = smooth(M.t / M.runT); setXZ(lerp(M.P0.x, M.stand.x, u), lerp(M.P0.z, M.stand.z, u));
      if (M.t >= M.runT) startPickClip();
      return;
    }
    const P = M.P, ct = M.track ? M.track.t : P.until;
    if (!M.got) {
      const k = smooth((ct - P.from) / Math.max(0.05, P.grasp - P.from));
      if (M.two) handsOnCan(I, k);
      else Q.reach('R', c.items.handle(I, _v3).setY(_v3.y + 0.07), k, POLE.low);
      if (ct >= P.grasp) {
        M.got = true; I.claim = null;
        if (M.two) { c.items.give(me, I); M.lift = { p: I.obj.position.clone(), q: I.obj.quaternion.clone(), t: 0 }; c.sfx('clang', 0.12); c.sfx('grunt', 0.4); }
        else { c.items.give(me, I, 0.1); Q.reach('R', null, 0); c.sfx(I.kind === 'bat' ? 'wood' : 'tink', 0.35); }
        c.onPickup?.(I);
      }
    }
    if (M.got && M.two) { // up off the street into his arms
      M.lift.t += dt; const u = smooth(M.lift.t / P.lift);
      carryPose(I, _carry); I.obj.position.lerpVectors(M.lift.p, _carry.position, u); I.obj.quaternion.slerpQuaternions(M.lift.q, _carry.quaternion, u);
      handsOnCan(I, 1);
    }
    if (ct >= P.until - 0.02 || (M.got && M.two && M.lift.t > P.lift + 0.06)) free(0.25);
    else if (M.got && !M.two && ct >= P.grasp + P.up) free(0.32); // (in his fist: back up, the crouch fading out)
  }
  const _carry = new THREE.Object3D();
  // throwing what he holds at a man (or straight ahead): a can heaved from over his head, a bottle or a bat overarm
  function throwHeld(T) {
    const I = me.holding; if (!I) return;
    const two = I.def.hands === 2, S = two ? THROW.two : THROW.one;
    const yaw = T ? yawTo(pos, T.pos) : p.heading;
    start('throw', { item: I, target: T, two, S, released: false, from: two ? { p: I.obj.position.clone(), q: I.obj.quaternion.clone() } : null, yaw });
    face(yaw); me.target = T; me.lastAttackT = c.time;
    M.track = Q.play(S.clip, { from: S.from, until: S.until, ts: S.ts, fade: 0.1 });
    if (two) c.sfx('grunt', 0.6);
  }
  function release(I, T) {
    const from = I.obj.position, two = I.def.hands === 2;
    const sp = two ? 14 : 17, aim = T ? T.chest(_v).setY(T.pos.y + 1.05 * T.scale) : local(0, 1.2, 11, _v);
    const D = from.distanceTo(aim), Tf = clamp(D / sp, 0.16, 0.75);
    const vel = _v2.set((aim.x - from.x) / Tf, (aim.y - from.y) / Tf + 0.5 * 20 * Tf, (aim.z - from.z) / Tf);
    // (a can end over end, a bottle the same, a bat whirling flat)
    const axis = right(p.heading, _v3).negate();
    const spin = I.kind === 'bat' ? new THREE.Vector3(0, 1, 0).multiplyScalar(18).addScaledVector(axis, 3) : axis.multiplyScalar(two ? 7 : 15);
    c.items.drop(me, false, vel); I.spin.copy(spin); I.thrower = me; I.hitSet.clear();
    if (two) { Q.reach('L', null, 0); Q.reach('R', null, 0); }
    c.sfx('whoosh', two ? 1.6 : 1.2);
    me.lastHitT = c.time;
  }
  function throwMotion(dt) {
    const I = M.item, S = M.S, ct = M.track ? M.track.t : S.until;
    if (!M.released && (!I || I.holder !== me)) { free(0.2); return; }
    if (M.target && !M.released) M.yawGoal = yawTo(pos, M.target.pos);
    if (M.two && !M.released) { // up over his head, then forward with everything
      const u1 = smooth((ct - S.from) / (S.over - S.from)), u2 = smooth((ct - S.over) / (S.release - S.over));
      carryPose(I, _carry);
      const over = local(...CARRY.over, _v3), rel = local(...CARRY.release, new THREE.Vector3());
      if (ct < S.over) I.obj.position.lerpVectors(M.from.p, over, u1); else I.obj.position.lerpVectors(over, rel, u2 * u2);
      I.obj.quaternion.copy(_carry.quaternion).multiply(_q0.setFromAxisAngle(_v.set(1, 0, 0), ct < S.over ? -0.5 * u1 : -0.5 + 1.4 * u2 * u2));
      handsOnCan(I, 1, ct < S.over ? u1 : 1 - u2 * 0.5);
    }
    if (!M.released && ct >= S.release) { M.released = true; release(I, M.target); }
    if (ct >= S.until - 0.02) free(0.25);
  }
  const _q0 = new THREE.Quaternion();
  // the can brought down on a man lying in the street: over his head, then down on the man's chest
  function canSlam(D) {
    const I = me.holding;
    const chest = D.bones.spine2 ? D.bones.spine2.getWorldPosition(new THREE.Vector3()) : D.chest(new THREE.Vector3());
    // beside him, square to his body (head to hips), on the side Dan is already on: the can comes down on his chest
    const head = D.headPos(new THREE.Vector3()), axis = _v2.set(head.x - chest.x, 0, head.z - chest.z).normalize();
    const side = _v.set(-axis.z, 0, axis.x); if (side.x * (pos.x - chest.x) + side.z * (pos.z - chest.z) < 0) side.negate();
    const yaw0 = Math.atan2(-side.x, -side.z), at = chest.clone().addScaledVector(side, CARRY.slam[2]); at.y = pos.y;
    D.downT = Math.max(D.downT || 0, D.st + 1.9); // (he stays down for it)
    const Dd = hdist(pos, at), runT = Dd > 0.15 ? clamp(Dd / 5.5, 0.12, 0.6) : 0;
    start('canSlam', { item: I, target: D, chest, P0: pos.clone(), at, runT, clipOn: false, from: { p: I.obj.position.clone(), q: I.obj.quaternion.clone() }, safe: earned() });
    face(yaw0); me.target = D;
    if (!runT) startCanSlamClip(); else Q.stop(0.12);
    c.sfx('grunt', 0.7);
  }
  const CANSLAM = { from: 0.06, over: 0.4, hit: 0.565, until: 0.95, ts: 1.0 };
  function startCanSlamClip() { M.clipOn = true; M.t0 = M.t; M.track = Q.play('crush', { from: CANSLAM.from, until: CANSLAM.until, ts: CANSLAM.ts, fade: 0.1 }); M.from = { p: M.item.obj.position.clone(), q: M.item.obj.quaternion.clone() }; }
  function canSlamMotion(dt) {
    const I = M.item, T = M.target;
    if (!M.hitDone && (!I || I.holder !== me)) { free(0.2); return; }
    if (!M.clipOn) {
      const u = smooth(M.t / M.runT); setXZ(lerp(M.P0.x, M.at.x, u), lerp(M.P0.z, M.at.z, u));
      carryPose(I); handsOnCan(I, 1);
      if (M.t >= M.runT) startCanSlamClip();
      return;
    }
    const ct = M.track ? M.track.t : CANSLAM.until;
    if (!M.hitDone) {
      M.yawGoal = yawTo(pos, M.chest);
      const over = local(...CARRY.slam, _v3), down = M.chest.clone().setY(M.chest.y + 0.36);
      if (ct < CANSLAM.over) { const u = smooth((ct - CANSLAM.from) / (CANSLAM.over - CANSLAM.from)); I.obj.position.lerpVectors(M.from.p, over, u); handsOnCan(I, 1, u * 0.6); }
      else { const u = clamp((ct - CANSLAM.over) / (CANSLAM.hit - CANSLAM.over), 0, 1); I.obj.position.lerpVectors(over, down, u * u); handsOnCan(I, 1, 0.6 * (1 - u)); }
      I.obj.quaternion.setFromAxisAngle(UP, p.heading);
      if (ct >= CANSLAM.hit) {
        M.hitDone = true;
        if (T.alive && T.state === 'down') c.playerHit(T, { kind: 'ground', dmg: 60, at: down.clone(), heavy: 1, w: 1, dir: _v2.set(0, -1, 0), weapon: 'trashcan' });
        c.groundPound(down.clone().setY(M.chest.y - 0.1), 1.0);
        c.sfx('clang', 1.1);
        // the can bounces off him and away, its lid off
        const away = _v.set(T.pos.x - pos.x, 0, T.pos.z - pos.z).normalize();
        c.items.drop(me, false, away.multiplyScalar(2.2).setY(3.2)); I.spin.copy(right(p.heading, _v3).multiplyScalar(-6));
        c.items.popLid(I, _v.set(Math.random() - 0.5, 4.5, Math.random() - 0.5));
        c.fx.trash(down, _v.set(0, 1, 0));
        Q.reach('L', null, 0); Q.reach('R', null, 0);
      }
    }
    if (ct >= CANSLAM.until - 0.02) free(0.3);
  }

  // the grab and the slam: lifted overhead, slammed into the street in front of him
  const SLAM = { reach: 0.2, lift: 0.52, hold: 0.62, slam: 0.78, end: 1.3, land: 1.45 };
  // from further than a step (a stunned brute, up to 5 m): a run in to him first, then the grab
  function grab(T) {
    const D = hdist(pos, T.pos) - 0.75 * T.scale;
    if (D > 0.5 && M.name !== 'grabRun') {
      const runT = clamp(0.08 + D / 7.5, 0.12, 0.6);
      start('grabRun', { target: T, P0: pos.clone(), runT, clipOn: false }); face(yawTo(pos, T.pos)); Q.stop(0.12);
      if (T.stun > 0) T.stun = Math.max(T.stun, runT + 0.4); else T.dazeEnd = Math.max(T.dazeEnd || 0, T.st + runT + 0.4);
      c.sfx('whoosh', 0.8); me.target = T;
      return;
    }
    grabNow(T);
  }
  function grabNow(T) {
    const P0 = pos.clone(), dir0 = _v.set(P0.x - T.pos.x, 0, P0.z - T.pos.z); if (dir0.lengthSq() < 1e-4) fwd(p.heading + Math.PI, dir0); dir0.normalize();
    start('slam', { target: T, P0, dir0: dir0.clone(), E0: T.pos.clone(), eyaw: T.yaw, landed: false, safe: earned() });
    face(yawTo(P0, T.pos)); me.target = T;
    T.grab(); c.releaseToken(T); c.clearThreats(T);
    M.track = Q.play('crush', { from: 0.06, until: 0.3, ts: 0.6, fade: 0.1, hold: true });
    c.sfx('grab');
    // the camera's moment: down low by the street, looking up at the man going over his head
    c.cine(T, SLAM.end + 0.25, { slow: false, low: true });
  }
  function takeHit(e, dmg, heavyHit) {
    me.hp = Math.max(0, me.hp - dmg); me.lastHurtT = c.time; me.meter = 0;
    const dir = new THREE.Vector3(pos.x - e.pos.x, 0, pos.z - e.pos.z); if (dir.lengthSq() < 1e-4) fwd(p.heading + Math.PI, dir); dir.normalize();
    me.comboStep = 0;
    if (M.name === 'slam') releaseSlam(false);
    if (M.name === 'pickup' && M.item) M.item.claim = null;
    // a can is knocked out of his hands; knocked down, everything goes
    if (me.holding && (me.holding.def.hands === 2 || heavyHit || me.hp <= 0)) dropHeld(0.8, dir);
    if (heavyHit || me.hp <= 0) {
      offLens(dir, 0.55, 0.9, 1.6); // (thrown down at the lens he would land under it: off to one side instead)
      start('down', { dir: dir.clone(), dist: room(pos, dir, 1.6, 0.6), P0: pos.clone(), dead: me.hp <= 0 });
      M.track = Q.play('death', { from: 0.72, ts: 1.6, until: 1.75, fade: 0.06, hold: true });
      me.invulnUntil = c.time + 2.6;
      if (me.hp <= 0) c.onHeroDown();
    } else {
      // (a weapon's blow throws him further back)
      start('hit', { dir: dir.clone(), dist: room(pos, dir, e.weapon || e.atk === 'bottleChop' ? 0.7 : 0.35, 0.4), P0: pos.clone() });
      M.track = Q.play(Math.random() < 0.5 ? 'hitHead' : 'hitChest', { ts: e.weapon ? 0.85 : 1.0, fade: 0.05 });
      me.invulnUntil = c.time + 0.4;
    }
    face(Math.atan2(-dir.x, -dir.z));
  }
  me.takeHit = takeHit;
  me.getUp = (hp) => { if (M.name !== 'down') return; M.up = true; if (hp != null) me.hp = hp; };

  // ------------------------------------------------------------------ per frame motion of the move
  // (the flying kick of a takedown goes for his chest where it is: a man reeling back leans well behind his feet)
  const contactPoint = (T, dir0, range, out, chest = false) => {
    if (chest && T.bones.spine2) { T.bones.spine2.getWorldPosition(out); out.y = T.pos.y; out.lerp(T.pos, 0.25); } else out.copy(T.pos);
    return out.addScaledVector(dir0, range);
  };
  // how close what he swings comes to a man's body (hips to crown; to his feet for a low blow), sampled from the fist
  // out and swept from where it was a frame before (a bat crosses a man in a frame); the point that met him in `at`
  const seg = { a: new THREE.Vector3(), b: new THREE.Vector3(), a0: new THREE.Vector3(), b0: new THREE.Vector3(), ok: false };
  function trackSeg() { // (each frame: what he holds, as the last pose left it)
    const I = me.holding;
    if (!I || I.def.hands === 2) { seg.ok = false; return; }
    seg.a0.copy(seg.a); seg.b0.copy(seg.b); const had = seg.ok;
    c.items.seg(I, seg.a, seg.b); if (!had) { seg.a0.copy(seg.a); seg.b0.copy(seg.b); } seg.ok = true;
  }
  // (a bottle is for his head: its distance from his head, less the head's own size, and it breaks there)
  function headDist(T, at) {
    const h = T.headPos(_v2); let best = 9;
    for (let s = 0; s <= 4; s++) { const v = s / 4; _a.lerpVectors(seg.a0, seg.a, v); _b.lerpVectors(seg.b0, seg.b, v);
      for (let k = 0; k <= 6; k++) { const u = 0.3 + 0.7 * k / 6, x = lerp(_a.x, _b.x, u), y = lerp(_a.y, _b.y, u), z = lerp(_a.z, _b.z, u), d = Math.hypot(x - h.x, y - h.y, z - h.z); if (d < best) best = d; } }
    at.copy(h); return best - 0.3 + 0.26 * T.scale;
  }
  // his body for something swung at it: a capsule up his own spine (thighs to crown, so a man leaning or reeling is met
  // where he is), from `lo` (x his height) up; its radius in .r
  const _c0 = new THREE.Vector3(), _c1 = new THREE.Vector3(), _ax = new THREE.Vector3(), _p0 = new THREE.Vector3(), _p1 = new THREE.Vector3(), _q0v = new THREE.Vector3(), _q1v = new THREE.Vector3();
  function bodyCap(T, lo) {
    if (T.bones.hips && T.bones.head) { T.bones.hips.getWorldPosition(_c0); T.bones.head.getWorldPosition(_c1); _ax.subVectors(_c1, _c0); _c0.addScaledVector(_ax, -0.45); _c1.addScaledVector(_ax, 0.12); }
    else { _c0.copy(T.pos).setY(T.pos.y + 0.45 * T.scale); _c1.copy(T.pos).setY(T.pos.y + 1.7 * T.scale); }
    const ylo = T.pos.y + lo * T.scale; if (_c1.y > _c0.y + 0.2 && ylo > _c0.y) _c0.lerp(_c1, Math.min(0.92, (ylo - _c0.y) / (_c1.y - _c0.y)));
    bodyCap.r = 0.22 * T.scale;
  }
  // the item swept from (a0, b0) to (a1, b1) in 8 steps against that capsule: the closest it comes (less the radius), the
  // point, and the first step that meets him (of the sweep, 0..1; 1 when it never does) in sweep.v
  function sweep(T, lo, a0, b0, a1, b1, at) {
    bodyCap(T, lo); const ab = _ax.subVectors(_c1, _c0), L2 = Math.max(1e-6, ab.lengthSq()), r = bodyCap.r; let best = 9; sweep.v = 1;
    for (let s = 0; s <= 8; s++) {
      const v = s / 8; _p0.lerpVectors(a0, a1, v); _p1.lerpVectors(b0, b1, v);
      for (let k = 0; k <= 10; k++) {
        const u = 0.25 + 0.75 * k / 10; _q0v.lerpVectors(_p0, _p1, u);
        const w = clamp(_q1v.subVectors(_q0v, _c0).dot(ab) / L2, 0, 1), d = _q1v.copy(_c0).addScaledVector(ab, w).distanceTo(_q0v) - r;
        if (d < best) { best = d; at.copy(_q0v); }
        if (d < 0.03 && sweep.v === 1) sweep.v = v;
      }
    }
    return best;
  }
  const loOf = (low, lo0) => lo0 ?? (low ? 0.08 : 0.45);
  // (what he swings over the last frame; a bottle is for his head: its distance from his head, less the head's size)
  function itemDist(T, low, at, head = false, lo0 = null) {
    if (head) return headDist(T, at);
    return sweep(T, loOf(low, lo0), seg.a0, seg.b0, seg.a, seg.b, at);
  }
  function headDist(T, at) {
    const h = T.headPos(_v2); let best = 9;
    for (let s = 0; s <= 4; s++) { const v = s / 4; _a.lerpVectors(seg.a0, seg.a, v); _b.lerpVectors(seg.b0, seg.b, v);
      for (let k = 0; k <= 6; k++) { const u = 0.3 + 0.7 * k / 6, x = lerp(_a.x, _b.x, u), y = lerp(_a.y, _b.y, u), z = lerp(_a.z, _b.z, u), d = Math.hypot(x - h.x, y - h.y, z - h.z); if (d < best) best = d; } }
    at.copy(h); return best - 0.3;
  }
  // (and over the next frame, if it goes on as it went: where it would first meet him, or 1)
  const _na = new THREE.Vector3(), _nb = new THREE.Vector3();
  function nextMeets(T, lo) {
    _na.copy(seg.a).multiplyScalar(2).sub(seg.a0); _nb.copy(seg.b).multiplyScalar(2).sub(seg.b0);
    return sweep(T, lo, seg.a, seg.b, _na, _nb, _v3) < 0.03 ? sweep.v : 1;
  }
  const weightOf = (kind) => (kind === 'light' ? 0.25 : kind === 'counter' ? 0.75 : 0.6);
  function land() { // the blow's moment: does the limb (or what he holds) reach his body? (it should: the run-in put him there)
    const T = M.target; if (!T || !T.alive) return;
    const I = M.limb === 'item' ? me.holding : null;
    if (M.limb === 'item' && !I) return false; // (it went from his hand mid-swing)
    let r = 0.26 * T.scale, d; const at = new THREE.Vector3();
    if (I) { d = itemDist(T, M.low, at, M.head, M.lo); r = 0; } // (an item's distance is to his body's surface already)
    else {
      const lp = Q.limb(M.limb, _v); at.copy(lp);
      // distance from the limb to his body: a capsule from his thighs to his crown, along his own spine (a man reeling
      // or leaning is hit where his body is, not over his feet)
      const a = _v2, b = _v3;
      if (T.bones.hips && T.bones.head) { T.bones.hips.getWorldPosition(a); T.bones.head.getWorldPosition(b); const ax = _a.subVectors(b, a); a.addScaledVector(ax, -0.45); b.addScaledVector(ax, 0.12); }
      else { a.copy(T.pos).setY(T.pos.y + 0.5 * T.scale); T.chest(b).setY(T.pos.y + 1.55 * T.scale); }
      const ab = b.sub(a), u = clamp(_b.copy(_v).sub(a).dot(ab) / ab.lengthSq(), 0, 1); d = a.addScaledVector(ab, u).distanceTo(_v);
    }
    me.contact = { move: M.clip, d: +(d - r).toFixed(3), limb: M.limb };
    if (d - r > 0.45 || !T.targetable) { c.sfx('whoosh', 0.4); return false; }
    const hit = (e, p, k = 1) => c.playerHit(e, { kind: M.kind, dmg: M.dmg * k, side: M.side, fly: M.fly, up: M.up, at: p, counter: M.counter,
      heavy: I ? (M.kind === 'light' ? 0.45 : 0.85) : weightOf(M.kind) * (M.kind === 'light' ? 0.6 : 1), w: M.w ?? weightOf(M.kind), weapon: I ? I.kind : null, stun: M.stun, limb: M.limb });
    hit(T, at);
    if (I && I.kind === 'bat') {
      // a bat's arc takes in whoever else stands in it
      for (const e of c.enemies) { if (e === T || !e.targetable || hdist(e.pos, pos) > 2.8) continue; const p2 = new THREE.Vector3(); if (itemDist(e, M.low, p2) < 0.1) hit(e, p2, 0.7); }
      if (--I.hits <= 0) c.items.breakBat(I, fwd(p.heading, new THREE.Vector3()).applyAxisAngle(UP, -M.side * 0.6));
    } else if (I && I.kind === 'bottle') c.items.shatter(I, _v.set(T.pos.x - pos.x, 0, T.pos.z - pos.z).normalize(), { neck: true });
    return true;
  }
  function motion(dt) {
    M.t += dt;
    // (a move whose clip the model lacks still ends)
    if (M.t > (M.name === 'down' ? (M.dead ? Infinity : 15) : 3) || (M.clipOn && !M.track && M.t > 0.8)) { free(0.3); return; }
    switch (M.name) {
      case 'strike': case 'heavy': {
        const T = M.target;
        // (a bat that met him bounces back off him a little, then he settles back into his guard)
        if (M.recoil) { const k = c.time - M.recoil; if (M.track) M.track.ts = k < 0.015 ? 0 : k < 0.14 ? -0.45 : 0; if (k > 0.14) free(0.3); break; }
        if (!T.alive && !M.hitDone) { free(0.2); break; }
        if (M.long) { // the flying kick: an arc onto the contact point
          const u = clamp(M.t / M.flyT, 0, 1), e = 1 - (1 - u) * (1 - u);
          if (!M.hitDone) { const cp = contactPoint(T, M.dir0, M.range, _v2, M.kind === 'takedown'); setXZ(lerp(M.P0.x, cp.x, e), lerp(M.P0.z, cp.z, e)); M.yawGoal = yawTo(pos, T.pos); }
        } else if (!M.hitDone && T.alive && M.t <= M.dashDur + 0.02) { // run in, then step into the blow
          const cp = contactPoint(T, M.dir0, M.range, _v2);
          let d;
          if (M.t < M.runT) d = dashDist(clamp(M.t / M.runT, 0, 1), M.runD, M.runT, M.v0, 2.2);
          else { const u = clamp((M.t - M.runT) / Math.max(1e-3, M.windup), 0, 1); d = M.runD + (M.D0 - M.runD) * (1 - (1 - u) * (1 - u)); }
          const k = clamp(d / M.D0, 0, 1.02);
          setXZ(lerp(M.P0.x, cp.x, k), lerp(M.P0.z, cp.z, k));
          M.yawGoal = yawTo(pos, T.pos) + M.yawOff;
        }
        if (!M.clipOn && M.t >= M.clipAt) playStrikeClip();
        const clipT = M.clipOn && M.track ? M.track.t : -1;
        // (a swung weapon lands the moment it first meets him, from a little before the clip's mark)
        // (the pose shown is the moment it meets him, never through him: when the next step would take it into him, the
        // clip goes only as far as the meeting, the blow lands on that pose (the clip held there) and the hit-stop holds
        // it; met already (it came faster than it went), the clip is put back to the meeting)
        const win = !M.hitDone && M.clipOn && M.limb === 'item' && clipT >= M.hit - 0.07 && clipT < M.hit + 0.03 && M.t >= M.dashDur - 0.1 && M.target.alive && seg.ok;
        if (win && M.pending && dt > 0) { M.hitDone = true; if (M.track) M.track.ts = 0; if (land() && me.holding?.kind === 'bat') M.recoil = c.time; else if (M.track) M.track.ts = M.ts; break; }
        if (win && itemDist(M.target, M.low, _v3, M.head, M.lo) < (M.head ? 0.16 : 0.03)) {
          M.hitDone = true;
          const bat = me.holding?.kind === 'bat';
          if (M.track && !M.head) M.track.t = Math.max(M.from, M.track.t - (2 - sweep.v) * dt * M.track.ts);
          if (land() && bat) M.recoil = c.time;
          break;
        }
        if (win && !M.head) { const v = nextMeets(M.target, loOf(M.low, M.lo)); if (v < 1 && M.track) { M.track.t -= (1 - v) * dt * M.track.ts; M.pending = true; } }
        if (!M.hitDone && M.clipOn && clipT >= M.hit + (M.limb === 'item' ? 0.02 : 0) - 0.001 && M.t >= M.dashDur - 0.03) { M.hitDone = true; land(); }
        // (the double counter's second man, as soon as the first blow is in)
        if (M.then && M.hitDone && clipT >= M.hit + 0.04) {
          const rest = M.then.filter((x) => x.alive && x.targetable), e2 = rest.shift(); M.then = null;
          if (e2) { strikeWith(e2, MOVES.counter, { noLong: true, counter: true, name: 'strike' }); M.isCounter = true; if (rest.length) M.then = rest; break; }
        }
        if (M.track && (clipT >= M.track.until - 0.02 || (M.hitDone && M.name === 'strike' && clipT >= M.hit + 0.32))) free(M.long ? 0.3 : 0.25);
        break;
      }
      case 'ground': {
        const T = M.target, u = clamp(M.t / M.arrive, 0, 1), e = M.runT ? u * u * (3 - 2 * u) : 1 - (1 - u) * (1 - u);
        // (until the blow starts, the spot follows him: a man still sliding to a stop, or the body settling)
        if (!M.clipOn && T.alive) { M.yawEnd = finisherSpot(T, M.at); if (M.runT) M.yawGoal = M.t < M.runT * 0.8 ? yawTo(pos, M.at) : M.yawEnd; }
        if (T.state === 'down' && !M.hitDone) T.downT = Math.max(T.downT, T.st + 0.5);
        if (M.t <= M.arrive + 0.02 || !M.clipOn) setXZ(lerp(M.P0.x, M.at.x, e), lerp(M.P0.z, M.at.z, e));
        // (down on him only once he lies still, or has stopped flying long enough)
        if (!M.clipOn && M.t >= M.runT && (T.state === 'down' || !T.alive || M.t > M.runT + 0.8)) { M.clipOn = true; M.track = Q.play('crush', { from: 0.12, ts: 1.15, fade: 0.08 }); M.yawGoal = M.yawEnd; }
        if (!M.clipOn) break;
        const clipT = M.track ? M.track.t : 0;
        if (!M.hitDone && clipT >= M.hit) {
          M.hitDone = true;
          if (T.alive && (T.state === 'down' || T.state === 'knock')) c.playerHit(T, { kind: 'ground', dmg: 40, at: Q.limb('fr', _v).clone(), heavy: 0.9, dir: _v2.set(0, -1, 0) });
          c.groundPound(_v.copy(Q.limb('fr', _v3)).setY(pos.y), 0.5);
        }
        if (M.track && clipT >= M.track.until - 0.02) free(0.25);
        break;
      }
      case 'slam': slamMotion(dt); break;
      case 'grabRun': { // (to a step short of him, then the grab)
        const T = M.target; if (!T.grabbable) { free(0.2); break; }
        const at = _v2.set(T.pos.x - pos.x, 0, T.pos.z - pos.z), L = at.length(); at.normalize();
        const goal = _v3.copy(T.pos).addScaledVector(at, -0.75 * T.scale), u = smooth(M.t / M.runT);
        setXZ(lerp(M.P0.x, goal.x, u), lerp(M.P0.z, goal.z, u)); M.yawGoal = yawTo(pos, T.pos);
        if (M.t >= M.runT || L < 0.8 * T.scale) grabNow(T);
        break;
      }
      case 'whiff': if (M.t > M.end) free(0.25); break;
      case 'cwhiff': case 'overswing': if (M.t > M.end) free(0.22); break;
      case 'pickup': pickupMotion(dt); break;
      case 'throw': throwMotion(dt); break;
      case 'canSlam': canSlamMotion(dt); break;
      case 'dodge': {
        const u = clamp((M.t - M.go) / M.dur, 0, 1), e = 1 - Math.pow(1 - u, 2.2);
        setXZ(M.P0.x + M.move.x * M.dist * e, M.P0.z + M.move.z * M.dist * e);
        if (M.t > M.end) free(0.25);
        break;
      }
      case 'hit': case 'down': case 'getup': {
        const dur = M.name === 'hit' ? 0.3 : 0.55;
        const u = clamp(M.t / dur, 0, 1), e = 1 - (1 - u) * (1 - u);
        if (M.name !== 'getup') setXZ(M.P0.x + M.dir.x * M.dist * e, M.P0.z + M.dir.z * M.dist * e);
        if (M.name === 'hit' && M.t > 0.38) free(0.22);
        if (M.name === 'down') {
          const wait = M.dead ? c.player.downTime : 1.0;
          if ((M.t > wait && (!M.dead || c.player.autoGetUp)) || M.up) {
            if (M.dead && !M.up) me.hp = Math.max(me.hp, c.player.getUpHp);
            start('getup'); M.track = Q.play('getup', { from: 0.3, ts: 1.35, fade: 0.15 });
          }
        }
        if (M.name === 'getup' && M.track && M.track.t >= M.track.until - 0.25) { me.invulnUntil = c.time + 0.4; free(0.3); }
        break;
      }
    }
  }
  // ---- the slam, step by step (game seconds): reach (step in, hands on him), lift (overhead), hold, slam, recover
  const _e = new THREE.Vector3(), _top = new THREE.Vector3(), _land = new THREE.Vector3();
  function slamMotion(dt) {
    const T = M.target, t = M.t, f = fwd(p.heading, _v), r = right(p.heading, _v2);
    if (!T || T.out) { releaseSlam(false); free(0.25); return; }
    // he steps in to 0.7 m and faces him
    if (t < SLAM.reach) { const u = smooth(t / SLAM.reach), cp = _v3.copy(M.E0).addScaledVector(M.dir0, 0.7 * T.scale); setXZ(lerp(M.P0.x, cp.x, u), lerp(M.P0.z, cp.z, u)); M.yawGoal = yawTo(pos, M.E0); }
    const gy = cm.getGroundHeight(pos.x, pos.z, 'person');
    // the man: in front, then overhead lying across his shoulders, then flat on his back in the street ahead
    _top.copy(pos).addScaledVector(f, 0.05); _top.y = gy + 1.62 + 0.25 * (T.scale - 1);
    _land.copy(pos).addScaledVector(f, SLAM.land * T.scale); _land.y = cm.getGroundHeight(_land.x, _land.z, 'person');
    const yawFace = yawTo(T.pos, pos), yawAcross = p.heading + Math.PI / 2, yawAway = p.heading + Math.PI;
    if (t < SLAM.reach) {
      T.grabPose(0); T.yaw = T.root.rotation.y = yawFace; T.pos.y = gy;
      const k = smooth(t / SLAM.reach);
      Q.reach('L', T.hipsAt(_e, 0.12, 0.1), k); Q.reach('R', T.chestAt(_e, -0.12, 0.15), k);
    } else if (t < SLAM.hold) { // the lift: up and over, rolling onto his back
      if (!M.lifted) { M.lifted = true; M.from = T.pos.clone(); M.fromYaw = T.yaw; M.track = Q.play('fight', { ts: 0, fade: 0.25, hold: true }); c.sfx('grunt'); }
      const u = smooth((t - SLAM.reach) / (SLAM.lift - SLAM.reach));
      T.grabPose(u);
      if (t >= SLAM.lift - 0.04 && !M.top) { M.top = true; c.slowmo(0.3, 0.3, 0.2); } // a beat at the top
      T.pos.lerpVectors(M.from, _top, u); T.pos.y += Math.sin(Math.PI * u) * 0.25;
      T.yaw = T.root.rotation.y = M.fromYaw + angWrap(yawAcross - M.fromYaw) * u;
      Q.reach('L', T.hipsAt(_e, 0, -0.05), 1, _v3.set(0.6, -0.3, -1)); Q.reach('R', T.chestAt(_e, 0, -0.08), 1, _v3.set(-0.6, -0.3, -1));
    } else if (t < SLAM.slam) { // the slam: down and over in front of him
      if (!M.slamming) { M.slamming = true; M.from = T.pos.clone(); M.fromYaw = T.yaw; M.track = Q.play('crush', { from: 0.4, until: 0.62, ts: (0.62 - 0.4) / (SLAM.slam - SLAM.hold), fade: 0.06, hold: true }); c.sfx('whoosh', 1.5); }
      const u = (t - SLAM.hold) / (SLAM.slam - SLAM.hold), e = u * u;
      T.grabPose(1);
      T.pos.lerpVectors(M.from, _land, e); T.pos.y += Math.sin(Math.PI * u) * 0.35;
      T.yaw = T.root.rotation.y = M.fromYaw + angWrap(yawAway - M.fromYaw) * smooth(u);
      Q.reach('L', T.hipsAt(_e, 0, -0.05), 1 - u * u); Q.reach('R', T.chestAt(_e, 0, -0.08), 1 - u * u);
    } else if (!M.landed) {
      M.landed = true;
      T.pos.copy(_land); T.yaw = T.root.rotation.y = yawAway;
      Q.reach('L', null, 0); Q.reach('R', null, 0);
      releaseSlam(true);
      M.track = Q.play('crush', { from: 0.62, ts: 1.4, fade: 0.05 });
    } else if (t > SLAM.end || (M.track && M.track.t >= M.track.until - 0.02)) free(0.3);
    T.root.updateMatrixWorld(true);
  }
  function releaseSlam(landed) {
    const T = M.target; if (!T || T.state !== 'grabbed') return;
    if (landed) { T.slammed(); c.playerHit(T, { kind: 'slam', dmg: T.type === 'brute' ? 55 : 40, heavy: 1, w: 1, at: T.chest(_v).clone(), dir: fwd(p.heading, _v2).clone() }); c.groundPound(T.pos, 1.2); c.cam.kick(_v.set(0, -2.6, 0)); }
    else { T.slammed(); T.downT = 0.8; }
  }

  // ------------------------------------------------------------------ input -> moves
  function act(k, keys) {
    const dir = stick(keys), I = me.holding, two = I && I.def.hands === 2;
    // a can in his hands: thrown at the man he points at (heavy, at a man lying near: brought down on him)
    if (two && (k === 'strike' || k === 'heavy')) {
      const D = k === 'heavy' && pickTarget(dir, 3.4, { downed: true });
      if (D) canSlam(D); else throwHeld(pickTarget(dir, 16));
      return true;
    }
    if (k === 'strike') {
      const T = pickTarget(dir, DASH.max, { reach: true });
      if (!T) { whiff(['jab', 'cross'][me.comboStep % 2]); return true; }
      strike(T); return true;
    }
    if (k === 'heavy') {
      const T = pickTarget(dir, 5.5, { reach: true });
      const D = pickTarget(dir, FINISH, { downed: true });
      if (D && (!T || hdist(pos, D.pos) + 1.2 < hdist(pos, T.pos))) { groundFinisher(D); return true; }
      if (T && me.meter >= 1) { takedown(T); return true; }
      if (T) { heavy(T); return true; }
      if (D) { groundFinisher(D); return true; }
      // nobody up: the man he has just knocked flying (or who is still falling), finished as he comes down
      const F = c.enemies.find((e) => e.alive && (e.state === 'knock' || e.state === 'down') && hdist(pos, e.pos) < FINISH + 1.5 && c.time - e.lastHitT < 1.8);
      if (F) { groundFinisher(F); return true; }
      whiff('cross'); return true;
    }
    if (k === 'grab') {
      // something in his hands: thrown; empty-handed: a dazed man first, then whatever lies by him
      if (I) { throwHeld(pickTarget(dir, 16)); return true; }
      // (a dazed man within a step or two; a stunned brute from up to 5 m, run in to)
      let best = null, bd = Infinity;
      for (const e of c.enemies) if (e.grabbable) { const d = hdist(pos, e.pos), reach = e.type === 'brute' ? 5.2 : 2.6; if (d < reach && d - (reach - 2.6) < bd && !(d > 1.6 && c.lineBlocked(pos, e.pos))) { bd = d - (reach - 2.6); best = e; } }
      if (best) { grab(best); return true; }
      const it = c.items.nearest(pos, 1.9, p.heading);
      if (it) { pickup(it); return true; }
      const any = nearest(2.6);
      if (any) c.hud.flash(any.type === 'brute' ? 'Stun him first' : 'Daze him first: three in a row');
      return false;
    }
    return false;
  }
  // ------------------------------------------------------------------ the control hook (updatePerson)
  const stickV = new THREE.Vector3(), moveV = new THREE.Vector3();
  me.control = (dt0, keys) => {
    if (!c.live()) { if (M.name !== 'free') free(0.2); me.fighting = false; me.offer = null; Q.loco = null; return false; }
    const dt = dt0 * c.ts;
    prev.copy(pos);
    if (dt > 0) trackSeg();
    const inp = c.input;
    // in the fight's footwork while a man of a crew in it lives near him (standing, flying, lying, getting up, in his
    // hands): out again past `far`, or once the last of them is out
    const reach = me.fighting ? FIGHT.far : FIGHT.near, nb = nearest(reach);
    me.fighting = c.enemies.some((e) => e.alive && e.state !== 'idle' && hdist(e.pos, pos) < reach);
    // what the grab key would pick up (the overlay's prompt)
    me.offer = !me.holding && M.name === 'free' ? c.items.nearest(pos, 1.9, p.heading) : null;
    const threat = c.nearestThreat();
    // (open after a guess: what he presses meanwhile is lost)
    if (M.name === 'cwhiff' || M.name === 'overswing') for (const k of ['strike', 'heavy', 'counter', 'dodge', 'grab']) inp.take(k);
    // --- dodge: any time on foot, out of most moves
    if (inp.has('dodge') && !['down', 'getup', 'slam', 'ground', 'canSlam', 'cwhiff', 'overswing'].includes(M.name) && !(M.name === 'throw' && M.released) && !(M.name === 'dodge' && M.t < 0.4) && pos.y - cm.getGroundHeight(pos.x, pos.z, 'person') < 0.3) {
      inp.take('dodge');
      if (M.name === 'slam') releaseSlam(false);
      if (M.name === 'pickup' && M.item && M.item.claim === me) M.item.claim = null;
      const perfect = !!threat && !threat.quake && threat.at - c.time <= DODGE.perfect && threat.at - c.time > -DODGE.late;
      dodge(threat, perfect, stick(keys, stickV));
      c.onDodge(threat, perfect);
    }
    // --- counter: while a cue shows
    if (inp.has('counter') && !['down', 'getup', 'slam', 'canSlam', 'pickup', 'cwhiff', 'overswing'].includes(M.name) && !(M.name === 'throw' && !M.released)) {
      inp.take('counter');
      const t = c.counterable(), open = t && t.kind === 'counter' && c.cueOpen(t);
      const others = [];
      if (open) for (const x of c.threats) if (x !== t && x.e !== t.e && x.kind === 'counter' && !x.item && x.at - c.time > -0.1 && c.cueOpen(x) && !others.some((o) => o.e === x.e) && others.length < 2) others.push(x);
      if (open) counter(t, others);
      else if (c.rules.whiff && M.name !== 'dodge' && (t || nearest(4.5))) counterWhiff(t); // (nobody near: nothing happens)
      else if (t && t.kind !== 'counter') { c.hud.flash('Can’t counter that: dodge!', 'danger'); c.sfx('deny'); }
    }
    // (the full rules: strike presses ahead of the blow landing, counted; two or more and the combo ends in an overswing)
    if ((M.name === 'strike' || M.name === 'heavy') && c.rules.mash && !M.isCounter && !M.long) {
      const n = inp.n('strike') + inp.n('heavy');
      if (M.seq == null) M.seq = n; else if (n > M.seq) { if (!M.hitDone) M.early = (M.early || 0) + n - M.seq; M.seq = n; }
    }
    // --- buffered blows: when free or inside a move's cancel window
    const clipT = M.track ? M.track.t : 0;
    const cancel = M.name === 'free' || M.name === 'whiff' && M.t > 0.12
      || (M.name === 'strike' || M.name === 'heavy') && M.hitDone && (M.recoil ? c.time - M.recoil > 0.05 : clipT >= M.hit + 0.05)
      || M.name === 'dodge' && (M.perfect ? M.t > 0.08 : M.t > 0.42)
      || M.name === 'hit' && M.t > 0.3;
    if (cancel && (M.early || 0) >= OPEN.mash && (M.name === 'strike' || M.name === 'heavy')) { inp.take('strike'); inp.take('heavy'); overswing(); }
    else if (cancel) for (const k of ['grab', 'heavy', 'strike']) { if (!inp.has(k)) continue; inp.take(k); if (act(k, keys)) break; }
    // the takedown's second half: he lies still, the fist from overhead
    const fu = me.followUp;
    if (fu && M.name === 'free') { if (c.time > fu.until || !fu.target.alive && !fu.target.grounded) me.followUp = null; else if (fu.target.grounded && hdist(pos, fu.target.pos) < 3.5) { me.followUp = null; groundFinisher(fu.target); } }
    // --- regen out of the fight, GTA style
    if (!me.fighting && c.time - me.lastHurtT > REGEN.delay && me.hp > 0 && me.hp < me.maxHp && M.name === 'free') me.hp = Math.min(me.maxHp, me.hp + REGEN.rate * dt);
    if (c.time - me.lastHitT > METER.lapse) { c.combo.n = 0; if (!me.fighting) me.meter = Math.max(0, me.meter - dt * 0.2); }
    // --- a move: it moves him
    if (M.name !== 'free') {
      motion(dt); turn(dt, M.name === 'dodge' ? 18 : 14, M.name === 'dodge' ? 14 : 11); ground(dt); measure(dt);
      const run = M.clipOn === false && M.name !== 'free';
      Q.loco = { fight: !run, speed: run ? me.vel.length() : 0, dir: 0 };
      p.speed = me.vel.length();
      return true;
    }
    if (!me.fighting) { Q.loco = null; me.vel.set(0, 0, 0); return false; }
    // --- the fight's footwork: camera-relative, facing his man; sprinting, facing the way he runs
    const s = stick(keys, stickV), sprint = !!keys.boost && s.lengthSq() > 0.1;
    const want = sprint ? FIGHT.run : FIGHT.step;
    moveV.lerp(_v.copy(s).multiplyScalar(want), 1 - Math.exp(-(s.lengthSq() > 0.01 ? 9 : 12) * dt));
    setXZ(pos.x + moveV.x * dt, pos.z + moveV.z * dt);
    me.focus = pickTarget(s.lengthSq() > 0.1 ? s : fwd(p.heading, _v2), FIGHT.far) || nb;
    if (sprint) M.yawGoal = Math.atan2(moveV.x, moveV.z);
    else if (me.focus) M.yawGoal = yawTo(pos, me.focus.pos);
    turn(dt, 10, 8); ground(dt); measure(dt);
    const sp = Math.hypot(moveV.x, moveV.z);
    Q.loco = { fight: true, speed: sp, dir: angWrap(Math.atan2(moveV.x, moveV.z) - p.heading) };
    p.speed = sp;
    return true;
  };
  function measure(dt) { if (dt < 1e-5) return; me.vel.copy(pos).sub(prev).divideScalar(dt).setY(0); if (me.vel.length() > 30) me.vel.setLength(30); }
  me.lastHitT = -9;
  me.FINISH = FINISH;
  me.reset = () => { if (M.name !== 'free') free(0.3); me.comboStep = 0; Q.loco = null; };
  me.MOVES = MOVES; // (debug: tuning in place)
  me.debugStart = (name, ...a) => ({ strike, heavy, takedown, groundFinisher, counter, dodge, grab, whiff, takeHit, pickup, throwHeld, canSlam, dropHeld }[name])(...a);
  return me;
}
