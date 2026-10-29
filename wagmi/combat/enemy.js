// Mog City: one of the Suits (assets/characters/thug.glb, dressed by dressSuit) as a street fighter.
// The thug's own brawler clips (thugPunch1/2, thugKick, bruteSlam, three stumbles, thugKnockdown, thugGetUp, hitReact)
// for the fight; standing, walking and running, the Suits' motion capture (assets/anim/bandai/suits.glb, index.js: an
// upright standing idle, two walks, a run, a sprint, side-steps and a back-step; the rig's crouched brawler idle and walks
// only if that pack failed to load). Stumbles, the knockdown and the get-up carry root motion (rootDelta): the body
// travels with the feet, never slides or snaps back.
// Types: grunt (a street thug) and brute (big, armoured: light blows only make him flinch until he is stunned; his slam
// can't be countered, only dodged, and a dodged slam leaves him stunned).
// Under the full rules (everywhere but Mission 1, the lesson: index.js c.rules) they mix it up, each with its own tell:
//   a grunt's feint: the fist cocked, a hitch at the top of the wind-up (his shoulders twitch, the cue's ring keeps
//   closing), then the real punch: a counter thrown at the hitch whiffs; the cue only turns yellow for the real one
//   a grunt's red kick: a long wind-up, everything behind it: dodge it
//   a brute's ground slam (bruteQuake): both fists up, a red ring on the street round him filling as it comes: inside
//   it when it lands, Dan is put down whatever he does (a roll's moment of safety doesn't save him); outside it, the
//   brute is left winded (stunned) for a grab
// Armed (items.js): a bat brought down overhead from a held wind-up (a glint on it: the telegraph), now and then with
// everything behind it (a red cue: no counter, dodge it, or it puts Dan down); a bottle broken over Dan from close
// (sometimes red too) or thrown from further (it is in the air while the cue counts down: dodge it). Hit by Dan's
// car he is thrown (or dives aside in time); he never stands inside a car or a bus of the traffic. Knocked down, grabbed
// or countered, a man loses what he holds; an unarmed grunt with a moment to spare goes and picks one up off the street.
// He walks round Dan's parked car (its nearest corner), never swings across it, and gives up on a way in that takes
// too long (resting before the next try, so another man gets his turn); a slam is committed for its last 0.4 s.
// Dan in his car, stopped: they beat on it, one at a time (bang), and drag him out (index.js siege).
// States: idle (a crew not yet in it) · hold (circling his slot) · fetch (going for a weapon) · bang (at the car) · approach · attack ·
//   stagger · dazed (grabbable) · knock (flying) · down · getup · grabbed (in Dan's hands) · out
import * as THREE from 'three/webgpu';
import { clone as skClone } from 'three/addons/utils/SkeletonUtils.js';
import { clamp, damp, dampAngle, angWrap, yawTo, hdist, rnd, pick, smooth } from './util.js';
import { createRagdolls } from '../physics/ragdoll.js';
// (the ragdolls, made once Jolt is in: wagmi/physics, loaded by the crash's first hit or the first Suit on the street)
let RAGS = null;
const rags = () => { const P = window.WAGMI?.physics; if (!P || !P.ready || RAG_OFF) return null; return RAGS || (RAGS = createRagdolls(P)); };
const RAG_OFF = new URLSearchParams(location.search).get('ragdoll') === '0';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _q = new THREE.Quaternion();
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
const G = 22;

export const TYPES = {
  grunt: { hp: 50, speed: 3.2, dmg: 9, scale: 1, attacks: ['thugPunch1', 'thugPunch2', 'thugKick'], looks: ['a', 'b', 'c'], radius: 0.34 },
  brute: { hp: 150, speed: 2.4, dmg: 18, scale: 1.24, attacks: ['bruteSlam', 'thugPunch1', 'bruteSlam'], looks: ['brute'], radius: 0.34 },
};
// each blow: its clip (the blow's own name when not given), when it lands (clip s), its telegraph (s from the start of
// the swing to that moment: the wind-up is slowed to fill it, so the cue over his head and his body tell the same
// story), the distance he steps in to (root to root, m, at scale 1: his fist, or his weapon (measured with it in his
// hand), then meets Dan), its share of his damage, and whether a counter can stop it. Armed: the weapon it needs;
// thrown: hit is the moment it leaves his hand
export const BLOWS = {
  // (Dan stands upright since 23 Oct: the unarmed punches' reach re-measured against his body)
  thugPunch1: { hit: 0.33, tele: 0.66, range: 0.82, dmg: 1, counter: true },
  thugPunch2: { hit: 0.20, tele: 0.56, range: 0.76, dmg: 0.8, counter: true },
  thugKick: { hit: 0.30, tele: 0.6, range: 0.9, dmg: 1.1, counter: true },
  bruteSlam: { hit: 0.57, tele: 1.0, range: 1.2, dmg: 1.6, counter: false, heavy: true },
  batChop: { clip: 'bruteSlam', hit: 0.51, tele: 0.95, range: 1.1, dmg: 1.9, counter: true, weapon: 'bat', glint: 0.36 },
  bottleChop: { clip: 'bruteSlam', hit: 0.49, tele: 0.8, range: 0.88, dmg: 1.6, counter: true, weapon: 'bottle' },
  // (the same swings with everything behind them: no counter for these, dodge them; the bat's puts him down)
  batSmash: { clip: 'bruteSlam', hit: 0.51, tele: 1.05, range: 1.1, dmg: 2.3, counter: false, weapon: 'bat', glint: 0.36, down: true },
  bottleBash: { clip: 'bruteSlam', hit: 0.49, tele: 0.9, range: 0.88, dmg: 1.9, counter: false, weapon: 'bottle' },
  bottleThrow: { clip: 'bruteSlam', hit: 0.45, tele: 0.72, range: 0, dmg: 1.4, counter: false, weapon: 'bottle', thrown: true, end: 0.66 },
  // (the full rules' variety: the feint holds its wind-up at clip time `at` for `hold` s, the window only opening for
  // the real swing; the red kick; the brute's ground slam, its reach a ring of `quake` m round him at scale 1)
  thugFeint: { clip: 'thugPunch1', hit: 0.33, tele: 1.2, range: 0.82, dmg: 1.1, counter: true, feint: { at: 0.15, hold: 0.42 } },
  thugKickRed: { clip: 'thugKick', hit: 0.30, tele: 0.95, range: 0.9, dmg: 1.3, counter: false },
  bruteQuake: { clip: 'bruteSlam', hit: 0.57, tele: 1.3, range: 1.15, dmg: 1.3, counter: false, heavy: true, quake: 2.5 },
};
// the full rules' picks (a list to pick from: a blow twice is twice as likely)
const VARIETY = { grunt: ['thugPunch1', 'thugPunch2', 'thugKick', 'thugFeint', 'thugFeint', 'thugKickRed'], brute: ['bruteSlam', 'thugPunch1', 'bruteQuake', 'bruteQuake'] };
const clipOfBlow = (atk) => BLOWS[atk].clip || atk;
const STUMBLE = { back: 'thugStumbleBack', left: 'thugStumbleLeft', right: 'thugStumbleRight' };
// the speed (m/s at scale 1) each walk and run was captured at, so stride x cadence = ground speed (the clip's time scale
// is speed / LOCO / scale): the suit* clips' are their capture speed on this rig (the pack's own extras: played at it,
// a planted foot moves under 3 cm); the rig's own walk, jog and run (the fallbacks) are their planted feet's measured
// speed. The suit* clips (in place): two walks (normal, masculine), a run, a sprint, a
// back-step and side-steps; an upright standing idle (looped), a "this way" gesture now and then as he settles, and two
// wave-offs (taunts) played once
const LOCO = { walk: 0.82, jog: 2.6, run: 4.7, sprint: 9.0, suitWalk: 1.358, suitWalk2: 1.488, suitRun: 3.517, suitDash: 4.852, suitBack: 1.211, suitLeft: 1.239, suitRight: 1.131 };
const WALKS = new Set(['walk', 'suitWalk', 'suitWalk2', 'suitBack', 'suitLeft', 'suitRight']);
const LOOPS = new Set(['thugIdle', 'guard', 'walk', 'jog', 'run', 'sprint', 'suitIdle', 'suitWalk', 'suitWalk2', 'suitRun', 'suitDash', 'suitBack', 'suitLeft', 'suitRight']);
const TAUNTS = ['suitTauntBye', 'suitTauntByebye'];
// (the brawler's crouched idle asked for by name, here or by a mission, is the upright idle when the pack has it)
const ALIAS = { thugIdle: 'suitIdle' };
const STANDING = ['idle', 'hold', 'fetch', 'bang', 'approach', 'attack', 'stagger', 'dazed'];
const ROOT_MOTION = new Set(['thugStumbleBack', 'thugStumbleLeft', 'thugStumbleRight', 'thugKnockdown', 'thugGetUp']);

// the thug's clips, once: root-motion clips get an in-place copy and keep their hips' travel for rootDelta
export function prepareClips(gltf) {
  const clips = new Map(), rootTracks = new Map();
  for (const c of gltf.animations) {
    if (!ROOT_MOTION.has(c.name)) { clips.set(c.name, c); continue; }
    const tracks = c.tracks.map((t) => {
      if (t.name !== 'hips.position') return t;
      rootTracks.set(c.name, t);
      const v = t.values.slice(); for (let i = 0; i < v.length; i += 3) { v[i] = 0; v[i + 2] = -0.02; }
      return new THREE.VectorKeyframeTrack(t.name, t.times.slice(), v);
    });
    clips.set(c.name, new THREE.AnimationClip(c.name, c.duration, tracks));
  }
  return { clips, rootTracks, twins: new WeakMap() };
}
function rootXZ(lib, name, t, out) {
  const tr = lib.rootTracks.get(name); if (!tr) return null;
  const T = tr.times, V = tr.values; t = Math.max(T[0], Math.min(T[T.length - 1], t));
  let i = 1; while (i < T.length - 1 && T[i] < t) i++;
  const k = (t - T[i - 1]) / Math.max(1e-6, T[i] - T[i - 1]);
  out.x = V[(i - 1) * 3] + (V[i * 3] - V[(i - 1) * 3]) * k; out.z = V[(i - 1) * 3 + 2] + (V[i * 3 + 2] - V[(i - 1) * 3 + 2]) * k;
  return out;
}

let seq = 0;
export class Enemy {
  constructor(c, type = 'grunt', { pos, yaw = 0, look = null, weapon = null } = {}) {
    this.c = c; this.type = type; this.T = TYPES[type]; this.id = 'd' + (++seq);
    const lib = c.thug;
    this.lib = lib;
    // his walk: one of two takes (normal, masculine), the rig's own only without the pack
    this.gait = Math.random() < 0.5 ? 'suitWalk' : 'suitWalk2';
    this.root = new THREE.Group(); this.root.name = 'Suit-' + this.id;
    this.inner = skClone(lib.gltf.scene); this.root.add(this.inner);
    this.look = look || pick(this.T.looks);
    c.dressSuit(this.inner, this.look, true);
    // (his own materials, hashed alpha: right at the lens he dissolves instead of filling the view, see setFade)
    this.mats = []; this.inner.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; o.material.alphaHash = true; this.mats.push(o.material); } });
    this.fadeK = 1;
    this.bones = {}; this.inner.traverse((o) => { if (o.isBone) this.bones[o.name] = o; });
    this.root.scale.setScalar(this.T.scale);
    this.root.position.copy(pos); this.yaw = yaw; this.root.rotation.y = yaw;
    c.scene.add(this.root);
    this.mixer = new THREE.AnimationMixer(this.inner);
    this.hp = this.maxHp = this.T.hp;
    this.state = 'idle'; this.st = 0; this.cd = rnd(0.8, 2.2); this.stun = 0; this.daze = 0; this.dazeT = -9;
    this.vel = new THREE.Vector3(); this.pitch = 0; this.flinch = 0; this.flinchDir = 1; this.flash = 0; this.twist = 0;
    this.out = false; this.lastHitT = -9; this.heavyHits = 0; this.spd = 0;
    this.rd = new THREE.Vector3(); this.loco = null; this.shove = new THREE.Vector3();
    this.weapon = null; if (weapon) c.items.arm(this, weapon);
    this.idle(0);
    this.mixer.update(rnd(0, 1.5));
    window.WAGMI?.physics?.want(); // (a man on the street: Jolt loads now, for his fall)
  }
  get pos() { return this.root.position; }
  get alive() { return !this.out; }
  get standing() { return !this.out && STANDING.includes(this.state); }
  get targetable() { return !this.out && !['down', 'getup', 'grabbed', 'knock'].includes(this.state); }
  // lying still (the fall played out): a ground finisher can find him
  get grounded() { return this.state === 'down' && !this.out && (this.curName !== 'thugKnockdown' || this.cur.time > 0.8); }
  get grabbable() { return !this.out && (this.state === 'dazed' || (this.type === 'grunt' && this.state === 'stagger' && this.daze >= 2) || (this.type === 'brute' && this.stun > 0 && this.standing)); }
  get scale() { return this.T.scale; }
  // how far out he swings this blow from (root to root): a weapon in his hand takes him further out
  blowRange(atk = this.atk) { const B = BLOWS[atk]; return B.range * this.T.scale + (this.weapon && !B.weapon ? this.weapon.def.reach * 0.7 : 0); }
  chest(out = new THREE.Vector3()) { return out.copy(this.pos).setY(this.pos.y + 1.15 * this.T.scale + (this.state === 'down' || this.state === 'out' ? -0.9 : 0)); }
  // a bone's place in the world, nudged along his own left (dx) and up (dy): where Dan's hands take hold
  boneAt(name, out, dx = 0, dy = 0) { const b = this.bones[name]; if (!b) return this.chest(out); b.getWorldPosition(out); out.y += dy; if (dx) out.add(_v2.set(dx, 0, 0).applyQuaternion(this.root.quaternion)); return out; }
  hipsAt(out, dx, dy) { return this.boneAt('hips', out, dx, dy); }
  chestAt(out, dx, dy) { return this.boneAt('spine2', out, dx, dy); }
  headPos(out = new THREE.Vector3()) { const b = this.bones.head; if (b) return b.getWorldPosition(out); return this.chest(out).setY(out.y + 0.35); }
  set(state) {
    if (this.state === 'fetch' && state !== 'fetch') this.dropClaim();
    this.state = state; this.st = 0; if (['hold', 'approach', 'attack', 'idle', 'fetch', 'bang'].includes(state)) this.turnRate = 0;
  }
  dropClaim() { if (this.fetchItem && this.fetchItem.claim === this) this.fetchItem.claim = null; this.fetchItem = null; this.picking = false; this.got = false; }
  // what he holds, let go (flung the way he goes)
  disarm(vel) { if (this.weapon) this.c.items.drop(this, false, vel || _v.set(rnd(-1.5, 1.5), 2.6, rnd(-1.5, 1.5))); }
  // ------------------------------------------------------------------ animation
  play(name, { fade = 0.18, ts = 1, once, at = null } = {}) {
    if (ALIAS[name] && this.lib.clips.has(ALIAS[name])) name = ALIAS[name];
    once ??= !LOOPS.has(name);
    let clip = this.lib.clips.get(name); if (!clip) return null;
    if (this.curName === name && !once && at == null) { this.cur.timeScale = ts; return this.cur; }
    // the same clip again (two stumbles in a row): its twin, so the new one cross-fades from the old
    if (this.curName === name) { if (!this.lib.twins.has(clip)) this.lib.twins.set(clip, clip.clone()); clip = this.cur.getClip() === clip ? this.lib.twins.get(clip) : clip; }
    const a = this.mixer.clipAction(clip); a.reset(); a.enabled = true; a.timeScale = ts;
    a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity); a.clampWhenFinished = once;
    if (this.cur && this.cur !== a && fade > 0) a.crossFadeFrom(this.cur, fade, false); else if (this.cur && this.cur !== a) this.cur.stop();
    a.play(); if (at != null) a.time = at;
    this.cur = a; this.curName = name;
    this.rm = this.lib.rootTracks.has(name) ? { name, a, prev: rootXZ(this.lib, name, a.time, { x: 0, z: 0 }) } : null;
    return a;
  }
  // root motion of the playing clip since the last call (world m)
  rootDelta(out) {
    out.set(0, 0, 0); const r = this.rm; if (!r) return out;
    const p = rootXZ(this.lib, r.name, r.a.time, _rmp); if (!p) return out;
    const dx = p.x - r.prev.x, dz = p.z - r.prev.z; r.prev.x = p.x; r.prev.z = p.z;
    const w = r.a.getEffectiveWeight(), yaw = this.root.rotation.y, sc = this.T.scale;
    const cs = Math.cos(yaw), sn = Math.sin(yaw);
    out.x = (dx * cs + dz * sn) * w * sc; out.z = (-dx * sn + dz * cs) * w * sc;
    return out;
  }
  // locomotion clip for ground speed sp (hysteresis so a speed near a threshold never flips clips), stride-matched (the
  // time scale is sp / LOCO / scale: stride x cadence = sp, the planted foot holds still): walking, his walk; jogging, the
  // run; running, the sprint. The bands are judged on sp / scale (a big man walks faster before he breaks into a run).
  // back: his back-step (or the rig's walk reversed); side (+1 his left, -1 his right): a side-step while he watches Dan.
  // A walk slows to 0.4 of its pace before his feet would slide (a run to 0.55), and quickens to 1.6 (a back-step 2.2)
  locomote(sp, back = false, fade = 0.25, side = 0) {
    if (sp < 0.12) { this.loco = null; this.idle(0.3); return; }
    const has = (n) => this.lib.clips.has(n), b0 = this.loco ? this.band : null, sc = this.T.scale, ns = sp / sc;
    let band = ns > 4.6 ? 'run' : ns > 2.0 ? 'jog' : 'walk';
    if (b0 === 'run' && ns > 4.0) band = 'run'; else if (b0 === 'jog' && ns > 1.6 && ns < 5.2) band = 'jog'; else if (b0 === 'walk' && ns < 2.4) band = 'walk';
    this.band = band;
    let clip = band === 'jog' ? (has('suitRun') ? 'suitRun' : 'jog') : band === 'walk' ? (has(this.gait) ? this.gait : 'walk') : (has('suitDash') ? 'suitDash' : 'run'), ts = null;
    if (back) { clip = has('suitBack') ? 'suitBack' : 'walk'; ts = clip === 'walk' ? -clamp(ns / LOCO.walk, 0.4, 1.6) : clamp(ns / LOCO.suitBack, 0.4, 2.2); }
    else if (side && band === 'walk' && has(side > 0 ? 'suitLeft' : 'suitRight')) clip = side > 0 ? 'suitLeft' : 'suitRight';
    this.loco = clip;
    this.play(clip, { ts: ts ?? clamp(ns / LOCO[clip], WALKS.has(clip) ? 0.4 : 0.55, 1.6), fade });
  }
  // standing about: upright (the pack's idle), settling now and then with a "this way" gesture first (played once,
  // then the idle); the rig's brawler idle only without the pack
  idle(fade = 0.3) {
    const has = (n) => this.lib.clips.has(n), n = this.curName, a = this.cur;
    if (!has('suitIdle')) return n === 'thugIdle' ? a : this.play('thugIdle', { fade });
    if (n === 'suitIdle') return a;
    if (n === 'suitIdleGuide' && a && a.time < a.getClip().duration - 0.3) return a;
    return this.play(n !== 'suitIdleGuide' && Math.random() < 0.2 && has('suitIdleGuide') ? 'suitIdleGuide' : 'suitIdle', { fade });
  }
  // ------------------------------------------------------------------ moving
  ground() { return this.c.world.ground(this.pos.x, this.pos.z); }
  // horizontal move with the city's collision (no walking through facades); true when a wall stopped it. The low things
  // (the parks' fences and lawn hoops, benches, granite: js/controllers.js lowObstacles) are solid to him below their tops
  // as to Dan; walking at one (hop: from stepTo), he hops it (tryHop)
  moveXZ(dx, dz, hop = false) {
    if (Math.abs(dx) + Math.abs(dz) < 1e-7) return false;
    // (half a metre off the walls at least: the city's collision boxes sit inside some facades by about that)
    const r = Math.max(0.5, this.T.radius * this.T.scale), cm = this.c.cm;
    if (hop && !this.hop && cm.lowAhead) { const L = Math.hypot(dx, dz); if (this.tryHop(dx / L, dz / L, r)) return false; }
    const x = this.pos.x + dx, z = this.pos.z + dz;
    this.pos.x = x; this.pos.z = z;
    this.c.world.collide(this.pos, r);
    if (!this.hop) cm.resolveLowCollision?.(this.pos, r);
    return Math.abs(this.pos.x - x) + Math.abs(this.pos.z - z) > 1e-4;
  }
  // a hop over the low thing just ahead (along ux, uz): up to 1.35 m over his feet and 2.6 m deep, onto clear level
  // ground (no drop, no wall, nothing else low there, not the park's water); a short arc peaking over its middle, on the
  // way he was going. True when he goes
  tryHop(ux, uz, r) {
    const cm = this.c.cm, p = this.pos;
    const hit = cm.lowAhead(p.x, p.z, p.y, ux, uz, r, 0.45);
    if (!hit || hit.depth > 2.6 || hit.o.top - p.y > 1.35) return false;
    const d = hit.enter + hit.exit + 0.1, lx = p.x + ux * d, lz = p.z + uz * d, gL = this.c.world.ground(lx, lz);
    if (Math.abs(gL - p.y) > 0.35 || cm.inParkWater?.(lx, lz)) return false;
    _hp.set(lx, gL, lz); cm.resolveHorizontalCollision(_hp, r, gL + 1.0);
    if (Math.hypot(_hp.x - lx, _hp.z - lz) > 0.05) return false;
    if (cm.lowAhead(lx - ux * 0.3, lz - uz * 0.3, gL, ux, uz, r, 0.3, [hit.o])) return false;
    this.hop = { t: 0, T: clamp(d / 4.5, 0.42, 0.7), sx: p.x, sz: p.z, ux, uz, d, y0: p.y, y1: gL, H: hit.o.top - p.y + 0.18 };
    this.yaw = Math.atan2(ux, uz); this.twist = 0;
    this.c.W.audio?.play?.('whoosh', { pos: [p.x, p.y + 1, p.z], vol: 0.25, rate: 1.2 });
    return true;
  }
  // the hop under way (from update: it moves him, the fight's choices wait); false when there is none (or a blow ended it)
  hopStep(dt) {
    const h = this.hop;
    if (!h) return false;
    if (!['hold', 'approach', 'fetch'].includes(this.state)) { this.hop = null; return false; }
    h.t = Math.min(h.T, h.t + dt);
    const k = h.t / h.T;
    this.pos.x = h.sx + h.ux * h.d * k; this.pos.z = h.sz + h.uz * h.d * k;
    this.c.world.collide(this.pos, Math.max(0.5, this.T.radius * this.T.scale));
    this.pos.y = h.y0 + (h.y1 - h.y0) * k + h.H * 4 * k * (1 - k);
    if (k >= 1) { this.hop = null; this.pos.y = this.ground(); }
    return true;
  }
  rootMotion() { const d = this.rootDelta(this.rd); if (Math.abs(d.x) + Math.abs(d.z) > 1e-6) this.moveXZ(d.x, d.z); }
  // walk toward p at speed sp while facing faceYaw: forward, backwards, or sideways with the body turned half toward the
  // way he goes and his chest and head turned back toward Dan (circling, watching him)
  stepTo(p, sp, faceYaw, dt) {
    // (Dan's car in the way: round its nearest corner first)
    const w = this.c.detour(this.pos, p, this.T.radius * this.T.scale + 0.1, _wp); if (w) p = w;
    const to = _v.set(p.x - this.pos.x, 0, p.z - this.pos.z), L = to.length();
    const want = L > 0.15 ? sp : 0;
    // (the navmesh's crowd walks him when there is one here (nav.js): its way round what stands between, kept apart
    // from the others; he follows his agent through the city's collision, his speed and heading its velocity's)
    const g = this.c.nav?.steer(this, p, want);
    if (g) {
      const vs = Math.hypot(g.vx, g.vz);
      let dx = g.x - this.pos.x, dz = g.z - this.pos.z; const D = Math.hypot(dx, dz);
      if (D > 1.2) { this.c.nav.resync(this); dx = dz = 0; } // (a wall held him back: his agent back with him)
      else { const cap = vs * dt * 1.25 + 0.6 * dt; if (D > cap) { dx *= cap / D; dz *= cap / D; } } // (catching up gently)
      this.spd = vs;
      if (vs < 0.05 && !(L > 0.3 && this.loco)) { this.moveXZ(dx, dz); this.yaw = dampAngle(this.yaw, faceYaw, 7, dt); this.twist = damp(this.twist, 0, 6, dt); this.locomote(0); return 0; }
      if (vs >= 0.05) to.set(g.vx / vs, 0, g.vz / vs); else to.divideScalar(Math.max(L, 1e-6));
      this.moveXZ(dx, dz, vs > 0.9);
      if (vs < 0.13) this.spd = 0.13; // (setting off: a frame or two of his walk before the crowd gets him going)
    } else {
      this.spd = damp(this.spd, want, want > this.spd ? 5 : 8, dt);
      if (L < 0.05 || this.spd < 0.05) { this.yaw = dampAngle(this.yaw, faceYaw, 7, dt); this.twist = damp(this.twist, 0, 6, dt); this.locomote(0); return 0; }
      to.divideScalar(L);
      const step = Math.min(L, this.spd * dt);
      this.moveXZ(to.x * step, to.z * step, this.spd > 0.9);
    }
    const my = Math.atan2(to.x, to.z), rel = angWrap(my - faceYaw);
    let body = faceYaw, back = false, side = 0;
    if (this.spd > 2.4) body = my; // running: faces where he runs
    else if (Math.abs(rel) < 0.8) body = faceYaw + rel * 0.7;
    else if (Math.abs(rel) > 2.35) { body = faceYaw; back = true; }
    else {
      // sideways, walking: his side-step (+1 to his left, +X), square to Dan within half the way off it (the twist
      // turns his chest and head the rest); the rig's walk: the body turned half toward the way he goes
      const sd = rel > 0 ? 1 : -1;
      if (this.spd < 2.0 && this.lib.clips.has(sd > 0 ? 'suitLeft' : 'suitRight')) { side = sd; body = faceYaw + (rel - sd * Math.PI / 2) * 0.5; }
      else body = faceYaw + rel * 0.6;
    }
    this.yaw = dampAngle(this.yaw, body, 8, dt);
    this.twist = damp(this.twist, clamp(angWrap(faceYaw - this.yaw), -0.9, 0.9), 6, dt);
    this.locomote(this.spd, back, 0.25, side);
    return this.spd;
  }
  // ------------------------------------------------------------------ damage taken
  // h: { dmg, dir (unit, attacker -> him), kind: 'light' | 'ender' | 'heavy' | 'counter' | 'slam' | 'finisher' | 'ground' |
  //   'takedown' | 'thrown' (a can or a bottle through the air), side, w (how big the blow, 0..1: the size of his
  //   reaction), weapon (a bat or a bottle), stun (a blow that leaves a brute stunned: a bottle over his head, a can) }
  hit(h) {
    if (this.out) return null;
    const c = this.c;
    this.lastHitT = c.time; this.flash = 1;
    const brute = this.type === 'brute', w = h.w ?? 0.4;
    if (this.state === 'fetch') this.dropClaim();
    const armored = brute && this.stun <= 0 && !['finisher', 'slam', 'ground', 'takedown'].includes(h.kind) && !h.stun;
    if (brute && h.stun) { this.stun = 3.2; this.heavyHits = 0; }
    else if (brute && (h.kind === 'heavy' || h.kind === 'counter' || h.weapon)) { this.heavyHits++; if (this.heavyHits >= 2 || h.kind === 'counter') { this.stun = 3.2; this.heavyHits = 0; } }
    this.hp -= h.dmg * (armored ? (h.kind === 'heavy' || h.weapon ? 0.8 : 0.1) : 1);
    this.faceYaw = Math.atan2(-h.dir.x, -h.dir.z);
    const rel = angWrap(this.faceYaw - this.yaw);
    const dead = this.hp <= 0;
    if (h.kind === 'ground' || h.kind === 'slam' || this.state === 'down') { // on the ground: the blow drives him into it
      this.flinch = 1; this.flinchDir = Math.random() < 0.5 ? -1 : 1; if (dead) this.downT = Math.min(this.downT || 0, this.st + 0.6); return { ground: true, dead };
    }
    if (armored && !dead && h.kind !== 'heavy' && !h.weapon) { this.flinch = 1; this.flinchDir = Math.random() < 0.5 ? -1 : 1; this.pushXZ(h.dir, 0.12); return { armored: true }; }
    if (h.kind === 'finisher' || h.kind === 'takedown') { if (!brute || this.hp <= 0) this.hp = Math.min(this.hp, 0); this.knock(h.dir, h.fly ?? 7, h.up ?? 4.5); return { knocked: true, dead: this.hp <= 0 }; }
    if (dead || h.kind === 'ender' || h.kind === 'heavy' || h.kind === 'thrown' || h.kind === 'counter' && !brute) {
      const f = h.fly ?? (h.kind === 'heavy' ? 8 : dead ? 7 : 6), up = h.up ?? (h.kind === 'heavy' ? 4.2 : 3.6);
      if (brute && !dead) { this.stagger(rel, h.side, 0.85, w); return { stagger: true, armored: armored && !h.weapon }; }
      this.knock(h.dir, f * (brute ? 0.5 : 1), up * (brute ? 0.7 : 1)); return { knocked: true, dead };
    }
    // a light blow: a flinch (a jab), a directional stumble (root motion carries him with his feet), shoved back by its
    // weight (a bat's the furthest); three in a run leave him dazed
    if (c.time - this.dazeT > 2.4) this.daze = 0;
    this.daze++; this.dazeT = c.time;
    if (w < 0.22 && !brute && this.state !== 'dazed' && this.state !== 'stagger') this.flinchHit(rel);
    else this.stagger(rel, h.side, 0, w);
    this.shove.copy(h.dir).multiplyScalar((0.4 + w * 3.4) * (brute ? 0.4 : 1));
    if (!brute && this.daze >= 3) this.dazeNext = true;
    return { stagger: true };
  }
  // the smallest reaction: the head snaps, a short recoil (a jab)
  flinchHit(rel) {
    this.set('stagger'); this.turnRate = Math.abs(rel) > 2.3 ? 14 : 6;
    this.flinch = 1; this.flinchDir = Math.random() < 0.5 ? -1 : 1;
    this.play('hitReact', { fade: 0.05, once: true, ts: 1.25 });
    this.stagT = 0.36;
    this.c.onEnemyInterrupted(this);
  }
  stagger(rel, side, extra = 0, w = 0.4) {
    let st = 'back';
    if (Math.abs(rel) > 0.9 && Math.abs(rel) < 2.3) st = rel > 0 ? 'right' : 'left';
    else if (Math.abs(rel) <= 0.9 && side) st = side > 0 ? 'right' : 'left';
    if (st === this.lastStumble && Math.random() < 0.5) st = 'back';
    this.lastStumble = st;
    this.set('stagger'); this.turnRate = Math.abs(rel) > 2.3 ? 14 : 5;
    const ts = (1.15 + Math.random() * 0.15) * (1.12 - 0.25 * Math.min(1, w)); // a bigger blow: a longer stumble
    this.play(STUMBLE[st], { fade: 0.06, once: true, ts });
    this.stagT = (st === 'back' ? 0.7 : 0.6) / ts - 0.06 + extra;
    this.c.onEnemyInterrupted(this);
  }
  pushXZ(dir, d) { this.moveXZ(dir.x * d, dir.z * d); }
  knock(dir, speed, up, ragdoll = true) {
    this.disarm(_v2.set(dir.x * speed * 0.4 + rnd(-1, 1), 3, dir.z * speed * 0.4 + rnd(-1, 1)));
    this.set('knock'); this.turnRate = 22; this.dusted = false;
    this.vel.set(dir.x * speed, up, dir.z * speed);
    this.play('thugKnockdown', { fade: 0.05, once: true, ts: speed > 5 ? 1.45 : 1.15 });
    // (flung: his ragdoll takes him, from the pose he was in, if Jolt is in; else the clip and the arc as before)
    this.ragBlend = null; this.ragHold = null;
    if (ragdoll && !this.rag) { const R = rags(); if (R) { try { R.start(this, this.vel, _v3.set(dir.x, 0, dir.z).normalize()); } catch (err) { console.warn('[ragdoll]', err); R.drop(this); } } }
    this.c.onEnemyInterrupted(this);
  }
  // to the car's side at `at`, then a fist or a boot into it (index.js onCarBang)
  bangCar(at, carPos) { this.set('bang'); this.bangAt = at.clone(); this.carAt = carPos; this.swung = false; this.banging = false; }
  // run down by Dan's car at sp m/s: thrown (a brute too: no armour against a car), hurt by how fast it came; true
  // when it finished him
  runOver(dir, sp) {
    const c = this.c; if (this.out) return false;
    if (this.state === 'fetch') this.dropClaim();
    this.lastHitT = c.time; this.flash = 1; this.faceYaw = Math.atan2(-dir.x, -dir.z);
    this.hp -= clamp((sp - 2) * 5, 14, 400) * (this.type === 'brute' ? 0.65 : 1);
    // (slow, thrown on ahead of it; fast, up over the bonnet and the roof as it goes on under him)
    const fast = sp > 11, k = this.type === 'brute' ? 0.75 : 1;
    this.knock(dir, (fast ? clamp(sp * 0.55, 6, 15) : clamp(sp + 1.5, 3.5, 13)) * k, fast ? clamp(5.5 + sp * 0.08, 6, 8.5) : 3.2);
    return this.hp <= 0;
  }
  // out of the way of a car: a dive to one side, onto the street, and up again
  dive(dir) {
    if (this.state === 'fetch') this.dropClaim();
    this.faceYaw = Math.atan2(-dir.x, -dir.z); this.knock(dir, 5.4, 2.7, false);
  }
  // countered: his swing is stopped dead, he reels (the counter's blow follows)
  parry(dir) {
    this.faceYaw = Math.atan2(-dir.x, -dir.z); this.turnRate = 10;
    this.set('stagger'); this.stagT = 0.55; this.flinch = 1; this.flinchDir = Math.random() < 0.5 ? -1 : 1;
    this.play('thugStumbleBack', { fade: 0.04, once: true, ts: 1.9 }); this.pushXZ(dir, 0.18);
    this.c.onEnemyInterrupted(this);
  }
  daze_(dur = 2.4) {
    this.set('dazed'); this.dazeEnd = dur; this.daze = 0; this.dazeNext = false;
    this.play('thugStumbleBack', { fade: 0.2, once: true, ts: 0.32, at: 0.12 }); // off balance, swaying
    this.c.onEnemyInterrupted(this);
  }
  // in Dan's hands (the slam drives the root; the pose is his knockdown at u, 0..1 of it)
  grab() { this.disarm(); this.set('grabbed'); this.vel.set(0, 0, 0); this.c.onEnemyInterrupted(this); this.play('thugStumbleBack', { fade: 0.08, once: true, ts: 0, at: 0.25 }); }
  grabPose(u) {
    if (this.curName !== 'thugKnockdown') this.play('thugKnockdown', { fade: 0.15, once: true, ts: 0, at: 0.15 });
    this.cur.time = 0.15 + u * 0.8; this.rm = null;
  }
  slammed(dir) { // let go onto the ground by the slam
    this.set('down'); this.vel.set(0, 0, 0); this.pitch = 0;
    this.play('thugKnockdown', { fade: 0.05, once: true, at: 0.97 }); this.rm = null;
    this.downT = this.hp <= 0 ? 1.4 : rnd(2.4, 3.0);
  }
  // ------------------------------------------------------------------ per frame
  update(dt) {
    const c = this.c, P = c.playerFeet;
    this.st += dt; this.cd -= dt; this.stun -= dt;
    this.flinch = Math.max(0, this.flinch - dt * 5); this.flash = Math.max(0, this.flash - dt * 12);
    const dist = hdist(this.pos, P), faceP = yawTo(this.pos, P);
    if (this.rag) {
      // (ragdolled: where his body is; down once it has settled, up (the get-up from where he lies) when it is time)
      const settled = RAGS.step(this, dt);
      if (this.state === 'knock' && settled) {
        this.landDown();
        // (still alive: from where he lies into the clip's own lying pose (the knockdown's end, lined up with him), so the
        // get-up follows it as it always has; out for good, he stays as he fell)
        if (this.hp > 0) { RAGS.end(this); this.play('thugKnockdown', { fade: 0, once: true, at: 0.97 }); this.rm = null; this.downT = Math.max(this.downT, 1.3); }
      }
      if (this.rag && this.state === 'down' && this.st > this.downT) { RAGS.hold(this); this.out = true; this.set('out'); this.c.onEnemyOut(this); }
      if (this.rag) { this.mixer.update(dt); return; }
    }
    if (this.state === 'knock' && this.st > 3.5) { this.pos.y = this.ground(); this.landDown(); }
    if (this.hopStep(dt)) { this.root.rotation.y = this.yaw; this.mixer.update(dt); return; }
    if (this.faceYaw != null && this.turnRate) { this.yaw = dampAngle(this.yaw, this.faceYaw, this.turnRate, dt); if (Math.abs(angWrap(this.faceYaw - this.yaw)) < 0.02) this.turnRate = 0; }
    if (['stagger', 'knock', 'down', 'getup'].includes(this.state)) this.rootMotion();
    if (this.shove.lengthSq() > 1e-4) { if (['stagger', 'dazed', 'hold'].includes(this.state)) this.moveXZ(this.shove.x * dt, this.shove.z * dt); this.shove.multiplyScalar(Math.exp(-9 * dt)); }
    if (this.state !== 'hold' && this.state !== 'idle') this.twist = damp(this.twist, 0, 8, dt);
    switch (this.state) {
      case 'idle': { // a crew not in the fight yet: stands about, watches him come
        this.yaw = dampAngle(this.yaw, dist < 30 ? faceP : this.yaw, 2, dt);
        this.idle(0.3);
        break;
      }
      case 'hold': {
        const slot = c.slotFor(this), L = hdist(slot, this.pos);
        // (a taunt playing: he stands it out facing Dan, then back to his idle; dropped when his place moves on, his
        // turn comes, or another clip took over)
        if (this.taunt) {
          const a = this.cur;
          if (L > 1.2 || c.hasToken(this) || !a || this.curName !== this.taunt || a.time >= a.getClip().duration - 0.15) { this.taunt = null; if (L <= 1.2 && this.curName !== 'hitReact') this.idle(0.3); }
          else { this.spd = damp(this.spd, 0, 8, dt); this.yaw = dampAngle(this.yaw, faceP, 5, dt); this.twist = damp(this.twist, 0, 6, dt); break; }
        }
        const sp = L > 6 ? this.T.speed * 1.5 : L > 1.4 ? this.T.speed * 0.6 : Math.min(1.3, L * 1.8);
        this.stepTo(slot, sp, faceP, dt);
        // waiting his turn at his place, a few steps off: now and then a taunt (a wave-off, once)
        if (!this.taunt && this.spd < 0.15 && L < 0.6 && dist > 2.6 && !c.hasToken(this) && c.time - (this.tauntT ?? -9) > 7 && Math.random() < dt * 0.15) {
          const n = pick(TAUNTS);
          if (this.lib.clips.has(n)) { this.taunt = n; this.tauntT = c.time; this.loco = null; this.play(n, { once: true, fade: 0.25 }); }
        }
        // empty-handed with a moment to spare: a bat or a bottle lying near is worth going for
        if (this.type === 'grunt' && !this.weapon && !c.hasToken(this) && this.cd > 0.6 && c.attackable() && Math.random() < dt * 0.3) {
          const I = c.items.forSuit(this.pos, 6.5);
          if (I) { I.claim = this; this.fetchItem = I; this.set('fetch'); }
        }
        break;
      }
      case 'fetch': { // to it, down for it (the slam's crouch: his hand by the street), up with it
        const I = this.fetchItem;
        if (!I || I.holder || I.claim !== this || !(I.state === 'rest' || I.state === 'roll')) { if (!this.got) { this.set('hold'); this.idle(0.25); } }
        if (this.state !== 'fetch') break;
        const ip = I.obj.position, d = hdist(this.pos, ip);
        if (!this.picking) {
          if (d > 0.62) this.stepTo(ip, d > 2.5 ? this.T.speed : 1.7, yawTo(this.pos, ip), dt);
          else { this.picking = true; this.got = false; this.loco = null; this.play('bruteSlam', { once: true, at: 0.54, ts: 1.0, fade: 0.16 }); }
          if (this.st > 5) { this.set('hold'); this.idle(0.25); }
        } else {
          this.yaw = dampAngle(this.yaw, yawTo(this.pos, ip) + 0.25, 8, dt);
          if (!this.got && this.cur && this.cur.time >= 0.64) { this.got = true; I.claim = null; c.items.give(this, I, 0.14); c.sfx('grab'); }
          if (this.cur && this.cur.time >= 0.98) { this.picking = false; this.got = false; this.set('hold'); this.idle(0.3); this.cd = rnd(0.3, 0.9); }
        }
        break;
      }
      case 'bang': {
        const car = c.W.car;
        if (c.cm.activeMode !== 'car' || Math.abs(car.speed || 0) > 3) { this.set('hold'); this.idle(0.25); break; }
        const faceCar = yawTo(this.pos, car.position), d = hdist(this.pos, this.bangAt);
        if (!this.banging) {
          if (d > 0.3 && this.st < 4) { this.stepTo(this.bangAt, d > 2 ? this.T.speed * 1.3 : 2.2, faceCar, dt); break; }
          if (this.st >= 4) { this.set('hold'); this.idle(0.25); this.cd = rnd(0.6, 1.2); break; }
          this.banging = true; this.spd = 0; this.loco = null; this.bangClip = pick(['thugPunch1', 'thugKick', 'thugPunch2']);
          this.play(this.bangClip, { fade: 0.12, once: true, ts: 0.9 });
        }
        this.yaw = dampAngle(this.yaw, faceCar, 10, dt);
        const a = this.cur;
        if (!this.swung && a && a.time >= BLOWS[this.bangClip].hit) { this.swung = true; c.onCarBang(this); }
        if (this.state === 'bang' && this.swung && a && a.time >= a.getClip().duration - 0.12) { this.set('hold'); this.idle(0.25); this.cd = rnd(0.7, 1.5) * c.crowdK(); }
        break;
      }
      case 'approach': { // his turn: closes in, starts the swing about a metre out (he steps in during the wind-up)
        const range = this.blowRange();
        const sp = dist > 4 ? 5.6 : 3.6;
        // a bottle in his hand: thrown from where he stands (too close: broken over him instead)
        if (BLOWS[this.atk].thrown) {
          if (!this.weapon) { this.chooseBlow(dist); }
          else if (dist < 2.6) this.atk = Math.random() < 0.4 ? 'bottleBash' : 'bottleChop';
          else {
            this.spd = damp(this.spd, 0, 8, dt); this.locomote(0); this.yaw = dampAngle(this.yaw, faceP, 10, dt);
            if (Math.abs(angWrap(faceP - this.yaw)) < 0.35 && dist < 15 && c.swingOk(this, BLOWS.bottleThrow.tele + this.flightTime())) this.startSwing();
            else if (this.st > 2.0 || !c.attackable()) { this.set('hold'); c.releaseToken(this); this.cd = rnd(1.5, 3); }
            break;
          }
        }
        if (dist > range + 0.9) this.stepTo(P, sp, faceP, dt);
        else { this.spd = damp(this.spd, 0, 8, dt); this.yaw = dampAngle(this.yaw, faceP, 12, dt); }
        // (a second man in waits for his blow to fall at least 0.35 s after the first's)
        if (dist <= range + 1.0 && Math.abs(angWrap(faceP - this.yaw)) < 0.6 && c.swingOk(this, BLOWS[this.atk || 'thugPunch1'].tele)) this.startSwing();
        else if (this.st > 3.0 || !c.attackable()) { this.set('hold'); c.releaseToken(this); this.cd = rnd(1.5, 3); }
        break;
      }
      case 'attack': {
        const a = this.cur, B = BLOWS[this.atk], hitT = B.hit, tele = B.tele, range = this.blowRange();
        if (B.weapon && !this.weapon && !this.swung) { this.set('hold'); this.idle(0.2); c.releaseToken(this); c.clearThreats(this); break; }
        // the wind-up (to hitT - 0.06) stretched to fill the telegraph, then he snaps through the blow
        const k0 = hitT - 0.06;
        if (a && B.feint) {
          // (the feint: up to the top of the wind-up fast, held there (a twitch of the shoulders), then the rest of it)
          const F = B.feint, tW = tele - 0.06, t1 = Math.max(0.12, (tW - F.hold) * 0.4), t2 = t1 + F.hold;
          if (this.st < tW) { a.timeScale = 0; a.time = this.st < t1 ? F.at * this.st / t1 : this.st < t2 ? F.at - 0.02 * Math.abs(Math.sin((this.st - t1) * 22)) : F.at + (k0 - F.at) * (this.st - t2) / Math.max(0.05, tW - t2); }
          else a.timeScale = 1.05;
          if (this.st > t1 && this.st < t2) this.flinch = Math.max(this.flinch, 0.18 + 0.12 * Math.sin((this.st - t1) * 22));
        } else if (a) a.timeScale = a.time < k0 ? k0 / Math.max(0.05, tele - 0.06) : this.type === 'brute' ? 0.9 : 1.05;
        // (the ground slam: his ring on the street, filling as it comes)
        if (B.quake && !this.swung) c.fx.ring(this.pos, B.quake * this.T.scale, clamp(this.st / tele, 0, 1));
        // the weapon raised: a glint off it, the swing's telegraph
        if (B.glint && !this.glinted && a && a.time >= B.glint && this.weapon) { this.glinted = true; const tp = c.items.tip(this); if (tp) { c.fx.glint(tp); c.sfx('glint'); } }
        if (B.thrown) {
          this.yaw = dampAngle(this.yaw, faceP, 10, dt);
          if (!this.swung && a && a.time >= hitT) { this.swung = true; this.throwWeapon(); }
          if (this.swung && a && a.time >= B.end) { this.set('hold'); this.idle(0.3); this.cd = rnd(1.4, 2.6); c.releaseToken(this); }
          break;
        }
        // (a slam is committed for its last 0.4 s: it comes down where he aimed it, so a dodge on the cue gets clear; the
        // ground slam comes down where he stands, so he only turns to him)
        if (B.quake && !this.swung) this.yaw = dampAngle(this.yaw, faceP, 6, dt);
        else if (!this.swung && !(B.heavy && tele - this.st < 0.4)) {
          this.yaw = dampAngle(this.yaw, faceP, this.st < tele * 0.6 ? 10 : 3, dt); // tracks him through the wind-up, then commits
          const left = Math.max(0.06, tele - this.st), gap = dist - range;
          if (gap > 0.02) { const st = Math.min(gap, gap / left * dt, 3.6 * dt); const d = _v.set(P.x - this.pos.x, 0, P.z - this.pos.z).normalize(); this.moveXZ(d.x * st, d.z * st); }
          else if (gap < -0.25) { const d = _v.set(P.x - this.pos.x, 0, P.z - this.pos.z).normalize(); this.moveXZ(-d.x * 1.5 * dt, -d.z * 1.5 * dt); }
        }
        if (!this.swung && a && a.time >= hitT) { this.swung = true; if (B.quake) c.fx.ring(null); c.enemyStrike(this); }
        if (this.swung && a && a.time >= a.getClip().duration - 0.12) {
          this.set('hold'); this.idle(0.25); this.cd = rnd(1.0, 2.2) * (this.type === 'brute' ? 1.3 : 1) * c.crowdK(); c.releaseToken(this);
        }
        break;
      }
      case 'stagger': {
        if (this.st > this.stagT) {
          if (this.dazeNext) this.daze_();
          else { this.set('hold'); this.idle(0.25); this.cd = Math.max(this.cd, rnd(0.6, 1.4)); }
        }
        break;
      }
      case 'dazed': { // off balance: swaying on the spot, open to a grab, recovers after a beat
        if (this.cur && this.st > 0.5) this.cur.timeScale = 0;
        this.flinch = Math.max(this.flinch, 0.25 + 0.2 * Math.sin(this.st * 5));
        if (this.st > this.dazeEnd) { this.set('hold'); this.idle(0.35); this.cd = rnd(0.6, 1.2); }
        break;
      }
      case 'knock': {
        this.vel.y -= G * dt;
        this.pitch = damp(this.pitch, this.pos.y > this.ground() + 0.05 ? -0.35 : 0, 8, dt); // thrown back off his feet
        const wall = this.moveXZ(this.vel.x * dt, this.vel.z * dt);
        this.pos.y += this.vel.y * dt;
        if (wall && Math.hypot(this.vel.x, this.vel.z) > 3) { // into a wall: a thud, a bounce, it hurts
          c.fx.hit(this.chest(_v), _v2.set(-this.vel.x, 0, -this.vel.z).normalize(), { heavy: 0.4, color: [2, 2, 2] }); c.shake(0.15); c.sfx('wall');
          this.vel.x *= -0.25; this.vel.z *= -0.25; this.hp -= 6;
        }
        const gy = this.ground();
        if (this.pos.y <= gy && this.vel.y <= 0) {
          this.pos.y = gy;
          const hs = Math.hypot(this.vel.x, this.vel.z);
          if (hs > 0.6) { this.vel.y = 0; this.vel.x *= Math.exp(-7 * dt); this.vel.z *= Math.exp(-7 * dt); if (!this.dusted) { this.dusted = true; c.fx.dust(this.pos, { amount: 0.9 }); c.sfx('bodyfall', 0.7); c.shake(0.08); } }
          else this.landDown();
        }
        break;
      }
      case 'down': {
        this.pitch = damp(this.pitch, 0, 8, dt);
        if (this.st > this.downT) {
          if (this.hp <= 0) { this.out = true; this.set('out'); c.onEnemyOut(this); }
          else { this.set('getup'); this.play('thugGetUp', { fade: 0.15, once: true, ts: 1.1 }); }
        }
        break;
      }
      case 'getup': if (this.st > 1.4 / 1.1 - 0.12) { this.set('hold'); this.idle(0.25); this.cd = rnd(0.8, 1.8); } break;
      case 'grabbed': break; // the slam moves him
      case 'out': this.pitch = damp(this.pitch, 0, 8, dt); break;
    }
    if (['idle', 'hold', 'fetch', 'bang', 'approach', 'attack', 'stagger', 'dazed', 'getup', 'down', 'out'].includes(this.state)) {
      const gy = this.ground(); this.pos.y = damp(this.pos.y, gy, 20, dt);
    }
    this.root.rotation.y = this.yaw;
    this.mixer.update(dt);
  }
  landDown() {
    this.set('down'); this.vel.set(0, 0, 0);
    this.downT = this.hp <= 0 ? 2.0 : rnd(1.5, 2.2);
  }
  startSwing() {
    let atk = this.atk || pick(this.T.attacks);
    this.atk = atk; this.swung = false; this.loco = null; this.glinted = false; this.dodged = false; this.stunOnWhiff = false;
    this.set('attack'); this.play(clipOfBlow(atk), { fade: 0.12, once: true, ts: 0.5 });
    const B = BLOWS[atk];
    // (a throw's cue counts down to the bottle reaching him: the wind-up and the flight)
    if (B.thrown) { this.threatRef = this.c.threat(this, B.tele + this.flightTime(), 'dodge'); return; }
    this.c.threat(this, B.tele, B.counter ? 'counter' : 'dodge', { feint: !!B.feint, quake: !!B.quake });
  }
  flightTime() { return clamp(hdist(this.pos, this.c.playerFeet) / 13, 0.38, 0.85); }
  // the bottle leaves his hand on an arc that comes down on Dan (where he is going, a little)
  throwWeapon() {
    const c = this.c, I = this.weapon; if (!I) return;
    c.items.holdOn(this, I);
    const from = I.obj.position, T = this.flightTime(), P = c.playerFeet, mv = c.me.vel;
    const to = _v.set(P.x + mv.x * T * 0.45, P.y + 1.25, P.z + mv.z * T * 0.45);
    const vel = _v2.set((to.x - from.x) / T, (to.y - from.y) / T + 0.5 * 20 * T, (to.z - from.z) / T);
    this.weapon = null; I.holder = null;
    c.items.launch(I, vel, _v.set(rnd(-4, 4), rnd(-14, -8), rnd(-4, 4)), this);
    if (this.threatRef) { this.threatRef.at = c.time + T; this.threatRef.item = I; }
    c.sfx('whoosh', 1.1);
  }
  // (armed, he uses it: a bat overhead; a bottle thrown from further than a few steps, broken over him from closer)
  chooseBlow(dist = 9) {
    const w = this.weapon;
    if (w && this.type === 'grunt') { this.atk = this.lastAtk = w.kind === 'bat' ? (Math.random() < 0.35 ? 'batSmash' : 'batChop') : dist > 3.2 ? 'bottleThrow' : Math.random() < 0.4 ? 'bottleBash' : 'bottleChop'; return; }
    const pool = this.c.rules.variety ? VARIETY[this.type] : this.T.attacks;
    let a = pick(pool); if (a === this.lastAtk && Math.random() < 0.6) a = pick(pool); this.atk = this.lastAtk = a;
  }
  // ------------------------------------------------------------------ over the clip (after the mixer)
  late(dt) {
    const B = this.bones;
    // (ragdolled, or lying as he fell: his bones are the ragdoll's)
    if (this.rag || this.ragHold) {
      if (this.rag) RAGS.apply(this); else RAGS.applyHold(this);
      const e = this.flash * this.flash * 0.05; for (const m of this.mats) m.emissive.setRGB(e, e * 0.92, e * 0.85);
      if (this.weapon) this.c.items.holdOn(this, this.weapon);
      return;
    }
    // knocked about: a tumble about the pelvis
    const piv = 0.95;
    _q.setFromAxisAngle(X, this.pitch);
    this.inner.quaternion.copy(_q);
    this.inner.position.set(0, piv, 0).sub(_v.set(0, piv, 0).applyQuaternion(_q));
    // circling: chest and head turned back toward Dan
    if (Math.abs(this.twist) > 0.01 && B.spine1 && B.neck) {
      B.spine1.quaternion.multiply(_q.setFromAxisAngle(Y, this.twist * 0.45));
      B.spine2?.quaternion.multiply(_q.setFromAxisAngle(Y, this.twist * 0.25));
      B.neck.quaternion.multiply(_q.setFromAxisAngle(Y, this.twist * 0.3));
    }
    // a blow's flinch: spine and head snap (over the clip)
    if (this.flinch > 0 && B.spine2) {
      const f = smooth(this.flinch);
      B.spine2.quaternion.multiply(_q.setFromAxisAngle(X, -0.35 * f)); if (B.head) B.head.quaternion.multiply(_q.setFromAxisAngle(Z, 0.3 * f * this.flinchDir));
    }
    // the hit's flash
    const e = this.flash * this.flash * 0.05;
    for (const m of this.mats) m.emissive.setRGB(e, e * 0.92, e * 0.85);
    this.root.updateMatrixWorld(true);
    if (this.ragBlend) RAGS.blend(this, dt);
    if (this.weapon) this.c.items.holdOn(this, this.weapon);
  }
  // how much of him shows (1: all of him; toward 0 he dissolves, a dither: no sorting, no new pipeline)
  setFade(k) {
    k = k < 0.03 ? 0 : k > 0.985 ? 1 : k; if (k === this.fadeK || (k !== 0 && k !== 1 && Math.abs(k - this.fadeK) < 0.01)) return;
    this.fadeK = k; for (const m of this.mats) m.opacity = k;
  }
  dispose() {
    if (this.rag) RAGS?.drop(this);
    this.c.scene.remove(this.root); this.mixer.stopAllAction();
    for (const m of this.mats) m.dispose();
    if (this.weapon) this.c.items.drop(this, true);
  }
}
const _rmp = { x: 0, z: 0 }, _wp = new THREE.Vector3(), _hp = new THREE.Vector3();
