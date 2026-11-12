// Mog City: a library creature as a street fighter, one of the fight's enemies (wagmi/combat: the director gives it
// its turns and its slot round Dan, his moves aim at it and land on it, the overlays and the camera follow it) with the
// Suits' interface (enemy.js) but its own body: its clips (wagmi/library/creature.js), its blows as measured
// (profiles.js), its skin's capsules for what lands on it and what it lands with (body.js), its size.
//   Size: everything is scaled by its height: its slot round Dan (ring), how far it swings from, its footprint, its pace.
//   Heavy (the big ones, any taller than 2.6 m, or `heavy`): Dan's blows do their damage but never shove, throw or put
//   it down; heavy blows (a heavy, a counter, a finisher, a weapon) wear its poise, and with that gone it staggers
//   (its Hit clip) and is open a moment. Its heavy blows put Dan down. Light ones (a knight) take blows as a Suit does:
//   a stagger, thrown by an ender, a fall (the body tipped by the code: the library has no fall clips) and up again.
//   Its blows: the clip from `from`, the wind-up held to the cue's clock (the telegraph), contact at the clip's own
//   moment: the striking capsules against Dan's body (a bite from the T-rex's head, a claw at his shins), or a red ring
//   on the street for a slam. A lunge or a leap covers the ground on the way.
//   Lair (hold): it stays at home (its idle, or its display looped) until Dan comes within `wake` m or hits it, wakes
//   with its display (a roar), fights within `leash` m of home and walks back there when he leaves it.
//   Boss: phases at its health's thresholds (its display, then quicker: shorter wind-ups, shorter rests).
// States: idle · intro (waking) · hold (its slot) · approach · attack · special (its display) · stagger · knock ·
//   down · getup · dying · out · home
import * as THREE from 'three/webgpu';
import { clamp, damp, angWrap, yawTo, hdist, rnd, smooth, fwd } from '../combat/util.js';
import { S as story } from '../story/index.js';
import { shapeOf, Body } from './body.js';
import { cue, stepsAt } from './voice.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();
const _q = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _ax = new THREE.Vector3();
const G = 22;
const STANDING = ['idle', 'intro', 'hold', 'approach', 'attack', 'special', 'stagger', 'home'];
// (the Suits' clip names the fight's moves ask a man for, as this body's: a stumble is its Hit)
const SUIT_HIT = new Set(['hitReact', 'thugStumbleBack', 'thugStumbleLeft', 'thugStumbleRight']);
let seq = 0;

// a bone turned about a world axis through itself (on top of its clip)
function bend(bone, axis, angle) {
  if (!bone || !bone.parent || Math.abs(angle) < 1e-5) return;
  bone.parent.getWorldQuaternion(_pq);
  _ax.copy(axis).applyQuaternion(_pq.invert());
  bone.quaternion.premultiply(_q.setFromAxisAngle(_ax, angle));
}
const turnTo = (cur, goal, rate, dt) => { const d = angWrap(goal - cur); return angWrap(cur + clamp(d * (1 - Math.exp(-9 * dt)), -rate * dt, rate * dt)); };

export class CreatureFighter {
  constructor(c, kit, P, { pos, yaw = 0, height, name, heavy, stats = {}, boss = null, hold = null } = {}) {
    this.c = c; this.kit = kit; this.P = P; this.model = kit.id; this.creature = true; this.type = 'creature';
    this.id = 'k' + (++seq);
    const made = (this.made = kit.make({ height: height > 0 ? height : kit.json.height, name: name || P.name }));
    this.root = made.object; this.root.name = 'Creature-' + this.id;
    this.k = made.scale; this.height = made.height; this.name = name || P.name;
    // (its own material: it flashes when hit, and dissolves right at the lens as a Suit does; the skin, its maps and
    // its clips stay shared by every one of its kind)
    const mat = made.mesh.material.clone(); mat.alphaHash = true; made.mesh.material = mat; this.mats = [mat];
    this.shape = shapeOf(kit, made); this.body = new Body(made, this.shape);
    // the fight's bone names (hips, spine1, spine2, neck, head) on its own bones, its own names kept too
    this.bones = {}; for (const b of made.skeleton.bones) this.bones[b.name] = b;
    for (const [k, v] of Object.entries(P.alias || {})) if (!this.bones[k] && this.bones[v]) this.bones[k] = this.bones[v];
    this.heavy = heavy ?? (!!P.heavy || this.height > 2.6);
    this.big = this.height > 2.25;
    this.scale = this.height / 1.8; // (the fight's size factor: a man is 1)
    const HP = story.knob('enemyHp'), DMG = story.knob('enemyDamage'), bulk = Math.pow(this.k, 1.5);
    this.T = { hp: Math.round((stats.hp ?? P.hp * bulk) * HP), dmg: (stats.dmg ?? P.dmg * Math.sqrt(this.k)) * DMG, speed: stats.speed ?? P.speed * this.k, scale: this.scale, radius: P.foot * this.k };
    this.ring = P.ring ? P.ring * this.k : null;
    this.footR = P.foot * this.k; this.spacing = P.spacing * this.k; this.bodyR = this.footR;
    this.navOff = this.footR > 0.62; // (the navmesh's crowd is for men: the big ones walk by the fight's own steering)
    this.carDrag = this.heavy ? 0.3 : 0.86;
    this.pickBias = this.heavy ? 1.5 : 0;
    this.root.position.copy(pos); this.yaw = yaw; this.root.rotation.y = yaw;
    c.scene.add(this.root);
    this.hp = this.maxHp = this.T.hp;
    this.state = 'idle'; this.st = 0; this.cd = rnd(0.8, 2.0); this.stun = 0; this.poise = 0; this.poiseLock = -9; this.backing = false;
    this.vel = new THREE.Vector3(); this.flinch = 0; this.flinchDir = 1; this.flash = 0; this.fall = 0; this.fallSide = 1; this.spd = 0;
    this.out = false; this.lastHitT = -9; this.weapon = null; this.atk = null; this.rage = 0; this.dipK = 0; this.walkPh = 0;
    this.boss = boss ? { name: boss.name || this.name, kind: boss.kind, phases: (boss.phases || [0.66, 0.33]).slice().sort((a, b) => b - a), next: 0 } : null;
    this.lair = hold ? { home: pos.clone(), yaw, wake: hold.wake ?? 9, leash: hold.leash ?? 24 } : null;
    this.feet = this.shape.feet.map((f) => ({ bone: made.skeleton.bones[f.bone], floor: Infinity, up: false }));
    this.initAnim();
    this.anim(0.001);
  }
  get pos() { return this.root.position; }
  get alive() { return !this.out; }
  get standing() { return !this.out && STANDING.includes(this.state); }
  get targetable() { return !this.out && !['down', 'getup', 'knock', 'dying'].includes(this.state); }
  get grounded() { return this.state === 'down' && !this.out && this.fall > 0.95; }
  get grabbable() { return false; } // (no grab or slam on a creature: Dan's slam lifts a man overhead)
  get B() { return this.P.blows[this.atk] || null; }
  set(state) { this.state = state; this.st = 0; if (state === 'approach') this.repicked = false; }
  disarm() {} dropClaim() {}
  // ------------------------------------------------------------------ where its parts are
  chest(out = new THREE.Vector3()) { const b = this.bones.spine2 || this.bones.hips; if (b && this.body.ok) return b.getWorldPosition(out); return out.copy(this.pos).setY(this.pos.y + this.height * 0.6); }
  headPos(out = new THREE.Vector3()) { const b = this.bones.head; if (b && this.body.ok) return b.getWorldPosition(out); return out.copy(this.pos).setY(this.pos.y + this.height); }
  // (the overlays' tag: over the top of its body, its head's place across)
  tagPos(out = new THREE.Vector3()) { this.headPos(out); out.y = Math.max(out.y, this.pos.y + this.height * (this.fall > 0.5 ? 0.35 : 0.92)) + 0.35; return out; }
  boneAt(name, out, dx = 0, dy = 0) { const b = this.bones[name]; if (!b) return this.chest(out); b.getWorldPosition(out); out.y += dy; void dx; return out; }
  hipsAt(out, dx, dy) { return this.boneAt('hips', out, dx, dy); }
  chestAt(out, dx, dy) { return this.boneAt('spine2', out, dx, dy); }
  // Dan's blows: from p to its body's surface (m; the fight's limb-to-body test). down: a blow comes down onto a body
  // lower than it (his fists are thrown at a man's height: on a scorpion's back they land up to 0.6 m lower)
  hurtDist(p, down = false) {
    let d = this.body.dist(p); if (!down) return d;
    for (const dy of [0.3, 0.6]) d = Math.min(d, this.body.dist(_hd.copy(p).setY(p.y - dy)));
    return d;
  }
  // where Dan aims from `from`: the part of its body nearest him at his fists' and feet's height (0.7-1.7 m over the
  // street), a lower part only when there is nothing nearer up there
  aimAt(from, out = new THREE.Vector3()) { const g = this.pos.y; return this.body.aim(from, g + 0.7, g + 1.7, out) || out.copy(this.pos); }
  // how far out it swings the blow from (root to Dan)
  blowRange(atk = this.atk) { const B = this.P.blows[atk]; return B ? B.range * this.k : this.footR + 0.8; }
  // ------------------------------------------------------------------ animation: its gaits always playing, a clip over them
  initAnim() {
    const M = this.made, MV = M.moves, A = M.actions;
    // (its lair's loop in place of its idle: the scorpion's claws snapping)
    const idle = this.P.idle && A[this.P.idle] ? this.P.idle : MV.idle;
    this.gaitNames = [idle, MV.walk, MV.run].filter((n, i, a) => n && A[n] && a.indexOf(n) === i);
    for (const n of Object.keys(A)) { A[n].stop(); A[n].setEffectiveWeight(0); }
    this.gw = {}; for (const n of this.gaitNames) { A[n].reset(); A[n].setLoop(THREE.LoopRepeat, Infinity); A[n].play(); A[n].time = Math.random() * A[n].getClip().duration; this.gw[n] = n === idle ? 1 : 0; }
    this.idleName = idle; this.one = null; this.fading = [];
  }
  // a clip over the gaits, from `from` (clip s) at time scale ts, its weight eased in over `fade`
  playOne(name, { from = 0, ts = 1, fade = 0.12, loop = false } = {}) {
    const a = this.made.actions[name]; if (!a) return null;
    const was = this.one;
    if (was && was.a !== a) { was.out = true; this.fading.push(was); }
    a.reset(); a.enabled = true; a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity); a.clampWhenFinished = true; a.time = from; a.timeScale = ts; a.play();
    this.one = { a, name, w: was && was.a === a ? was.w : 0, fade, out: false };
    this.fading = this.fading.filter((f) => f.a !== a);
    return a;
  }
  stopOne(fade = 0.25) { if (this.one) { this.one.out = true; this.one.fade = fade; this.fading.push(this.one); this.one = null; } }
  // (the Suits' clip names, from the fight's moves: a stumble is its Hit; the rest it has no clip for)
  play(name, o = {}) { if (SUIT_HIT.has(name)) return this.playOne(this.made.moves.hit || '', { ts: o.ts && o.ts > 0.2 ? o.ts : 1, fade: 0.08 }); return null; }
  idle() { this.stopOne(0.3); }
  anim(dt) {
    const M = this.made, MV = M.moves, A = M.actions, k = this.k;
    const ease = (o) => { o.w = o.out ? Math.max(0, o.w - dt / Math.max(0.02, o.fade)) : Math.min(1, o.w + dt / Math.max(0.02, o.fade)); o.a.setEffectiveWeight(o.w); };
    if (this.one) ease(this.one);
    for (let i = this.fading.length - 1; i >= 0; i--) { const f = this.fading[i]; ease(f); if (f.w <= 0) { if (f !== this.one) f.a.stop(); this.fading.splice(i, 1); } }
    const busy = this.one ? this.one.w : 0;
    // the gait for its speed: standing, a walk, a run past halfway between the two paces
    const SP = M.speeds, ws = SP.walk || 1.2 * k, rs = SP.run || 0, v = this.spd;
    let g = this.idleName;
    if (!this.P.gaitless && v > 0.18 * k && MV.walk) g = MV.run && rs && v > (ws + rs) / 2 && !this.backing ? MV.run : MV.walk;
    for (const n of this.gaitNames) {
      this.gw[n] += ((n === g ? 1 : 0) - this.gw[n]) * (1 - Math.exp(-9 * dt));
      A[n].setEffectiveWeight(this.gw[n] * (1 - 0.97 * busy));
      A[n].timeScale = n === MV.walk && n !== this.idleName ? (this.backing ? -1 : 1) * clamp(v / ws, 0.5, 2.2) : n === MV.run ? clamp(v / (rs || ws), 0.6, 1.8) : 1;
    }
    M.mixer.update(dt);
    this.posed = true; // (the clips have set every bone afresh: late() may bend them once on top)
  }
  // ------------------------------------------------------------------ moving
  ground() { return this.c.world.ground(this.pos.x, this.pos.z); }
  moveXZ(dx, dz) {
    if (Math.abs(dx) + Math.abs(dz) < 1e-7) return false;
    const x = this.pos.x + dx, z = this.pos.z + dz; this.pos.x = x; this.pos.z = z;
    this.c.world.collide(this.pos, Math.max(0.5, this.footR));
    return Math.abs(this.pos.x - x) + Math.abs(this.pos.z - z) > 1e-4;
  }
  pushXZ(dir, d) { if (!this.heavy) this.moveXZ(dir.x * d, dir.z * d); }
  // to p at up to sp m/s, facing the way it goes (no side-steps in the library: an animal turns to walk), and faceYaw
  // once there; a man-sized one through the navmesh's crowd when there is one, the big ones straight, round walls
  stepTo(p, sp, faceYaw, dt) {
    const w = this.c.detour(this.pos, p, this.footR + 0.1, _wp); if (w) p = w;
    const to = _v.set(p.x - this.pos.x, 0, p.z - this.pos.z), L = to.length();
    const want = L > 0.25 * this.k ? sp : 0, rate = this.P.turn;
    // (its way lies behind it, a few steps: it backs off facing him, its walk played backwards, never turning its back)
    const back = L > 1e-3 && Math.abs(angWrap(Math.atan2(to.x, to.z) - faceYaw)) > 2.2 && L < 9 * this.k;
    const backPace = (this.made.speeds.walk || 1) * 1.1;
    const g = this.navOff ? null : this.c.nav?.steer(this, p, back ? Math.min(want, backPace) : want);
    let moving;
    if (g) {
      const vs = Math.hypot(g.vx, g.vz); let dx = g.x - this.pos.x, dz = g.z - this.pos.z; const D = Math.hypot(dx, dz);
      if (D > 1.2) { this.c.nav.resync(this); dx = dz = 0; } else { const cap = vs * dt * 1.25 + 0.6 * dt; if (D > cap) { dx *= cap / D; dz *= cap / D; } }
      this.spd = Math.max(vs, want > 0 && vs < 0.13 ? 0.13 : 0);
      this.moveXZ(dx, dz);
      moving = vs >= 0.05; if (moving) to.set(g.vx / vs, 0, g.vz / vs);
    } else {
      // (a big body turns before it gets going: slower while it faces away from where it goes)
      const off = back ? 0 : L > 1e-3 ? Math.abs(angWrap(Math.atan2(to.x, to.z) - this.yaw)) : 0;
      const cap = back ? Math.min(want, backPace) : want * (off > 1.2 ? 0.25 : off > 0.6 ? 0.6 : 1);
      this.spd = damp(this.spd, cap, cap > this.spd ? 3 : 6, dt);
      moving = this.spd > 0.05 && L > 0.05;
      if (moving) { to.divideScalar(L); const s = Math.min(L, this.spd * dt); this.moveXZ(to.x * s, to.z * s); }
    }
    this.backing = back && moving;
    if (!this.backing && moving && this.spd > 0.3 * this.k && Math.abs(angWrap(Math.atan2(to.x, to.z) - faceYaw)) > 0.5) this.yaw = turnTo(this.yaw, Math.atan2(to.x, to.z), rate, dt);
    else this.yaw = turnTo(this.yaw, faceYaw, rate, dt);
    if (!moving) this.spd = damp(this.spd, 0, 8, dt);
    return this.spd;
  }
  // ------------------------------------------------------------------ damage taken
  // h: as the Suits' (enemy.js hit): { dmg, dir (attacker -> it), kind, side, fly, up, w, weapon, stun }
  hit(h) {
    // (already falling for good: another blow would start its fall over, and it would never be out)
    if (this.out || this.state === 'dying') return null;
    const c = this.c;
    this.lastHitT = c.time; this.flash = 1;
    if (this.state === 'idle' || this.state === 'home') this.wake(true);
    const hard = ['heavy', 'ender', 'counter', 'finisher', 'takedown', 'slam', 'ground', 'thrown'].includes(h.kind) || !!h.weapon;
    this.hp -= h.dmg;
    this.faceYaw = Math.atan2(-h.dir.x, -h.dir.z);
    cue(c.W, this.P.voice?.hurt, this.voiceAt());
    const dead = this.hp <= 0;
    if (this.boss) this.bossPhase();
    if (dead) {
      if (!this.heavy && ['ender', 'heavy', 'counter', 'finisher', 'takedown', 'thrown'].includes(h.kind) && this.state !== 'down') { this.knock(h.dir, (h.fly ?? 6) * 0.9, (h.up ?? 3.6) * 0.9); return { knocked: true, dead: true }; }
      this.die(h.dir); return { knocked: true, dead: true };
    }
    if (this.state === 'down' || this.state === 'getup' || this.state === 'knock') { this.flinch = 1; return { ground: true }; }
    if (this.heavy) {
      // (its poise: heavy blows wear it, a counter twice as fast; gone, it staggers, open a moment; then it is steady a
      // few seconds whatever lands, so nothing is stun-locked; winding up a blow, it takes two more)
      if (hard && c.time > this.poiseLock) this.poise += h.kind === 'counter' || h.kind === 'takedown' ? 2 : 1;
      this.flinch = Math.max(this.flinch, hard ? 0.7 : 0.35); this.flinchDir = Math.random() < 0.5 ? -1 : 1;
      if (this.poise >= this.P.poise && this.state !== 'attack' || this.poise >= this.P.poise + 2) {
        this.poise = 0; this.poiseLock = c.time + (this.boss ? 5.5 : 3.5); this.stagger(this.boss ? 0.85 : 1.1); return { stagger: true };
      }
      return {};
    }
    // a man-sized one: thrown by an ender, a heavy, a counter; a light blow, a stagger (its Hit) and a shove
    if (h.kind === 'finisher' || h.kind === 'takedown' || h.kind === 'ender' || h.kind === 'heavy' || h.kind === 'counter' || h.kind === 'thrown') {
      this.knock(h.dir, h.fly ?? (h.kind === 'heavy' ? 7 : 6), h.up ?? 3.6); return { knocked: true };
    }
    this.stagger(0.45 + 0.35 * (h.w ?? 0.4));
    this.pushXZ(h.dir, 0.15 + (h.w ?? 0.4) * 0.35);
    return { stagger: true };
  }
  stagger(dur = 0.6) {
    const hitClip = this.made.moves.hit;
    this.set('stagger'); this.stagT = dur; this.turnRate = 6; this.flinch = 1; this.flinchDir = Math.random() < 0.5 ? -1 : 1;
    if (hitClip) this.playOne(hitClip, { from: 0, ts: clamp(this.made.actions[hitClip].getClip().duration / (dur + 0.6), 0.9, 2.2), fade: 0.06 });
    this.c.onEnemyInterrupted(this);
  }
  // countered: its swing stopped dead, it reels (the counter's blow follows)
  parry(dir) { this.faceYaw = Math.atan2(-dir.x, -dir.z); this.stagger(this.heavy ? 0.9 : 0.55); this.pushXZ(dir, 0.18); }
  daze_() { this.stagger(1.2); }
  knock(dir, speed, up) {
    if (this.heavy) { this.stagger(0.8); return; }
    this.set('knock'); this.vel.set(dir.x * speed, up, dir.z * speed); this.dusted = false; this.fallSide = Math.random() < 0.5 ? 1 : -1;
    const hitClip = this.made.moves.hit; if (hitClip) this.playOne(hitClip, { from: 0.1, ts: 1.2, fade: 0.05 });
    this.c.onEnemyInterrupted(this);
  }
  landDown() { this.set('down'); this.vel.set(0, 0, 0); this.downT = this.hp <= 0 ? 1.6 : rnd(1.4, 2.0); }
  // its last blow: it keels over (its Hit held), and lies there
  die(dir) {
    this.hp = Math.min(this.hp, 0);
    if (this.state === 'down') { this.downT = Math.min(this.downT || 0, this.st + 0.4); return; }
    // (away from the blow: rolled about its length, +1 tips it to its own -x side, so a push to its +x is -1)
    this.set('dying'); this.fallSide = dir && (dir.x * Math.cos(this.yaw) - dir.z * Math.sin(this.yaw)) > 0 ? -1 : 1;
    const hitClip = this.made.moves.hit; if (hitClip) this.playOne(hitClip, { from: 0, ts: 0.8, fade: 0.08 });
    this.dieT = 0.8 + 0.25 * Math.sqrt(this.height); this.thud = false;
    this.c.onEnemyInterrupted(this); this.c.fx.ring(null);
    if (this.big) this.c.slowmo(0.9, 0.35, 0.35);
  }
  runOver(dir, sp) {
    const c = this.c; if (this.out) return false;
    this.lastHitT = c.time; this.flash = 1; this.faceYaw = Math.atan2(-dir.x, -dir.z);
    this.hp -= clamp((sp - 2) * 5, 14, 400) * (this.heavy ? 0.4 : 1);
    if (this.hp <= 0) { this.heavy ? this.die(dir) : this.knock(dir, clamp(sp + 1.5, 3.5, 13), 3.2); return true; }
    if (this.heavy) { this.stagger(0.7); return false; }
    this.knock(dir, clamp(sp + 1.5, 3.5, 13), 3.2);
    return false;
  }
  dive(dir) { if (!this.heavy) this.knock(dir, 5.4, 2.7); }
  // ------------------------------------------------------------------ waking, its lair, its display
  wake(hit = false) {
    if (this.out || !['idle', 'home'].includes(this.state)) return;
    this.engagedOnce = true;
    if (this.crew) this.crew.awake = true;
    // (a lair's creature, or a boss, wakes with its display: the roar, the chest beat; hit, it turns on him at once)
    if ((this.lair || this.boss) && !hit && this.P.special && this.state === 'idle') { this.special(true); return; }
    this.set('hold'); this.cd = Math.max(this.cd, rnd(0.6, 1.4));
  }
  special(intro = false) {
    const name = this.P.special, A = this.made.actions[name]; if (!A) { this.set('hold'); return; }
    this.set(intro ? 'intro' : 'special'); this.c.onEnemyInterrupted(this);
    this.playOne(name, { from: 0, ts: 1, fade: 0.2 });
    this.specT = Math.min(A.getClip().duration, 3.4) - 0.2;
    const V = this.P.voice || {};
    if (V.roar) { cue(this.c.W, V.roar, this.voiceAt(), { vol: this.boss ? 1 : 0.85 }); this.c.W.horseVoice?.fear?.(this.voiceAt(), this.boss || this.big); }
    if (this.P.beats && V.beat) for (const t of this.P.beats) if (t < this.specT) cue(this.c.W, V.beat.map((q) => ({ ...q, at: t })), this.voiceAt());
    if (this.big) this.c.shake(0.35);
  }
  bossPhase() {
    const B = this.boss; if (!B || B.next >= B.phases.length || this.hp <= 0) return;
    if (this.hp / this.maxHp > B.phases[B.next]) return;
    B.next++; this.rage++; this.wantSpecial = true; this.poise = 0;
  }
  voiceAt() { const p = this.headPos(_v3); return [p.x, p.y, p.z]; }
  // ------------------------------------------------------------------ its blows
  chooseBlow(dist = 3) {
    const k = this.k, tall = this.c.W.dan ? this.c.W.dan.limb('head', _a).y - this.c.playerFeet.y > 2.3 : false;
    const all = Object.entries(this.P.blows).filter(([, B]) => (!B.mounted || tall) && !B.phase);
    let pool = all.filter(([, B]) => dist >= B.use[0] * k && dist <= B.use[1] * k);
    // (none for where he is: the one whose distances are nearest it, the bite from out there, the stomp from under it)
    if (!pool.length) { const off = ([, B]) => Math.max(B.use[0] * k - dist, dist - B.use[1] * k, 0); const best = Math.min(...all.map(off)); pool = all.filter((x) => off(x) <= best + 0.5); }
    if (!pool.length) pool = all;
    let tot = 0; for (const [, B] of pool) tot += B.w || 1;
    let r = Math.random() * tot, pick = pool[0][0];
    for (const [n, B] of pool) { r -= B.w || 1; if (r <= 0) { pick = n; break; } }
    if (pick === this.lastAtk && pool.length > 1 && Math.random() < 0.5) pick = pool.find(([n]) => n !== pick)[0];
    this.atk = this.lastAtk = pick;
  }
  startSwing() {
    const B = this.B; if (!B) return;
    const tele = B.tele * (this.rage ? Math.pow(0.86, this.rage) : 1);
    this.set('attack'); this.swung = false; this.landed = false; this.dodged = false; this.tele = tele; this.lunge = null;
    if (B.quake?.target) { const P = this.c.W.person.position; (this.qT || (this.qT = new THREE.Vector3())).set(P.x, this.c.W.app?.controllerManager?.getGroundHeight?.(P.x, P.z, 'person') ?? P.y, P.z); }
    this.playOne(B.clip, { from: B.from, ts: 0, fade: Math.min(0.2, tele * 0.25) });
    this.c.threat(this, tele, B.counter ? 'counter' : 'dodge', { quake: !!B.quake });
    if (B.voice && this.P.voice?.[B.voice]) cue(this.c.W, this.P.voice[B.voice], this.voiceAt(), { at: B.voiceAt || 0 });
    // (a roar near the horse: it shies, wagmi/horse/voice.js)
    if (B.voice === 'roar') this.c.W.horseVoice?.fear?.(this.voiceAt(), true);
    if (B.phase && this.big) this.c.shake(0.3);
  }
  // the quake's middle now (where its fists or its foot come down)
  quakeAt(B, out) {
    const Q = B.quake;
    // (a shell's ring: where he stood when it fired, held there, not where its body is)
    if (Q.target && this.qT) return out.copy(this.qT);
    if (Q.at && this.bones[Q.at]) { this.bones[Q.at].getWorldPosition(out); out.y = this.ground(); return out; }
    return out.copy(this.pos).addScaledVector(fwd(this.yaw, _a), (Q.ahead || 0) * this.k);
  }
  // Dan's body: feet to crown, as a capsule (r 0.25)
  danCapsule(a, b) {
    const W = this.c.W, P = W.person.position;
    a.copy(P); a.y += 0.25;
    if (W.dan) W.dan.limb('head', b); else b.copy(P).setY(P.y + 1.7);
    b.y += 0.05; return 0.25;
  }
  landBlow(B, at, dir) {
    const c = this.c, me = c.me;
    this.landed = true;
    const dmg = this.T.dmg * B.dmg;
    me.takeHit(this, dmg, !!B.heavy);
    c.fx.hit(at, _v2.copy(dir).negate(), { heavy: B.heavy ? 0.9 : 0.45, color: [5.5, 1.6, 1.2] });
    c.hitStop(B.heavy ? 0.1 : 0.06, B.heavy ? 0.03 : 0.06); c.shake(B.heavy ? 0.85 : 0.45, dir);
    if (B.heavy) c.cam.punch(0.9);
    c.hud.hurt(B.heavy ? 0.45 : 0.15); c.combo.n = 0; c.sfx('hurt', B.heavy ? 1 : 0.5);
    cue(c.W, this.P.voice?.strike, [at.x, at.y, at.z]);
  }
  // the moment it lands (each frame of the contact window, or once for a ring)
  contact(B, first) {
    const c = this.c, me = c.me, P = c.W.person.position;
    const onFoot = c.live();
    if (B.quake) {
      if (!first) return;
      const at = this.quakeAt(B, _v);
      const R = B.quake.r * this.k;
      // (a slam into the street: dust, the thud; a roar's blast: only the air)
      if (!B.phase) { c.groundPound(at, 1.3, 'slam'); c.fx.dust(at, { amount: 1.2 + 0.4 * this.k }); cue(c.W, this.P.voice?.land, [at.x, at.y, at.z]); }
      else c.sfx('whoosh', 1.5);
      c.shake(0.7 + 0.2 * Math.min(2, this.k));
      c.fx.ring(null);
      const inside = onFoot && hdist(at, P) <= R + 0.2 && Math.abs(P.y - (B.quake.target ? at.y : this.pos.y)) < 1.4 && !me.down();
      if (!inside) { this.stun = 1.6; this.cd = Math.max(this.cd, 1.6); return; }
      me.invulnUntil = 0; this.landBlow(B, _v2.copy(P).setY(P.y + 0.6), _v3.set(P.x - at.x, 0, P.z - at.z).normalize());
      if (!c.quakeTold) { c.quakeTold = true; c.hud.flash('Inside the red ring: get out of it, a roll won’t save you', 'danger'); }
      return;
    }
    if (this.landed || this.dodged || !onFoot || me.invuln() || me.down()) return;
    // the striking capsules against his body, this frame
    const r = this.danCapsule(_a, _b), only = new Set(B.limbs || []);
    const d = this.body.segDist(_a, _b, only.size ? only : null) - r;
    if (d > (B.tol ?? 0.22)) return;
    const C = this.body.hit, at = _v.copy(C.a).lerp(C.b, 0.7);
    this.landBlow(B, at, _v3.set(P.x - this.pos.x, 0, P.z - this.pos.z).normalize());
  }
  // ------------------------------------------------------------------ per frame
  update(dt) {
    const c = this.c, P = c.playerFeet;
    this.st += dt; this.cd -= dt; this.stun -= dt; this.backing = false;
    this.flinch = Math.max(0, this.flinch - dt * (this.heavy ? 3 : 5)); this.flash = Math.max(0, this.flash - dt * 10);
    const dist = hdist(this.pos, P), faceP = yawTo(this.pos, P), live = c.live();
    if (this.turnRate && this.faceYaw != null && this.state === 'stagger') this.yaw = turnTo(this.yaw, this.faceYaw, Math.min(this.P.turn, this.turnRate), dt);
    // (its lair: woken by Dan coming near; left for home when he goes past its leash)
    const L = this.lair;
    if (L && !this.out) {
      if ((this.state === 'idle' || this.state === 'home') && live && dist < L.wake) this.wake();
      else if (['hold', 'approach'].includes(this.state) && hdist(P, L.home) > L.leash && !(this.state === 'approach' && dist < this.blowRange() + 1)) {
        c.onEnemyInterrupted(this); this.set('home');
      }
    }
    switch (this.state) {
      case 'idle': { // at home, or a crew not in it yet: it watches him come
        this.spd = damp(this.spd, 0, 6, dt);
        if (L) this.yaw = turnTo(this.yaw, dist < L.wake * 2.2 && live ? faceP : L.yaw, this.P.turn * 0.5, dt);
        else if (dist < 30) this.yaw = turnTo(this.yaw, faceP, this.P.turn * 0.4, dt);
        break;
      }
      case 'home': {
        const d = hdist(this.pos, L.home);
        if (d > 0.7 * this.k) this.stepTo(L.home, this.T.speed * 0.55, yawTo(this.pos, L.home), dt);
        else { this.spd = 0; this.set('idle'); if (this.crew) this.crew.awake = false; this.cd = rnd(0.8, 1.6); }
        break;
      }
      case 'intro': case 'special': {
        this.spd = damp(this.spd, 0, 6, dt); this.yaw = turnTo(this.yaw, faceP, this.P.turn * 0.6, dt);
        if (this.st > this.specT) { this.stopOne(0.35); this.set('hold'); this.cd = rnd(0.4, 0.9); this.wantSpecial = false; }
        break;
      }
      case 'hold': {
        // (a boss's phase: its roar, a blow of its own when it has one (a blast round it), else its display)
        if (this.wantSpecial && !c.hasToken(this)) { this.wantSpecial = false; const ph = Object.keys(this.P.blows).find((n) => this.P.blows[n].phase); if (ph) { this.atk = ph; this.startSwing(); } else this.special(); break; }
        const slot = c.slotFor(this), d = hdist(slot, this.pos);
        const sp = d > 6 ? this.T.speed * 0.85 : d > 1.0 * this.k ? this.T.speed * 0.4 : 0;
        this.stepTo(slot, sp, faceP, dt);
        break;
      }
      case 'approach': { // its turn: in to its blow's range, facing him, then the swing
        if (!this.B) this.chooseBlow(dist);
        // (he went somewhere else on the way, under it or well out: once, the blow for where he is now)
        if (!this.repicked && this.st > 0.3 && this.B.use && (dist < this.B.use[0] * this.k - 0.6 || dist > this.B.use[1] * this.k + 2.5)) { this.repicked = true; this.chooseBlow(dist); }
        const range = this.blowRange();
        if (dist > range + 0.35 * this.k) this.stepTo(P, this.T.speed, faceP, dt);
        else { this.spd = damp(this.spd, 0, 8, dt); this.yaw = turnTo(this.yaw, faceP, this.P.turn, dt); }
        const facing = Math.abs(angWrap(faceP - this.yaw)) < (this.big ? 0.32 : 0.5);
        if (dist <= range + 0.8 * this.k && facing && this.stun <= 0 && c.swingOk(this, this.B.tele)) this.startSwing();
        else if (this.st > 5 || !c.attackable()) { this.set('hold'); c.releaseToken(this); this.cd = rnd(1.2, 2.4); }
        break;
      }
      case 'attack': this.attackStep(dt, dist, faceP); break;
      case 'stagger': {
        this.spd = damp(this.spd, 0, 8, dt);
        if (this.st > this.stagT) { this.stopOne(0.3); this.set('hold'); this.cd = Math.max(this.cd, rnd(0.5, 1.2)); }
        break;
      }
      case 'knock': {
        this.vel.y -= G * dt;
        this.fall = Math.min(1, this.fall + dt * 2.6);
        const wall = this.moveXZ(this.vel.x * dt, this.vel.z * dt);
        this.pos.y += this.vel.y * dt;
        if (wall && Math.hypot(this.vel.x, this.vel.z) > 3) { c.fx.hit(this.chest(_v), _v2.set(-this.vel.x, 0, -this.vel.z).normalize(), { heavy: 0.4, color: [2, 2, 2] }); c.shake(0.15); c.sfx('wall'); this.vel.x *= -0.25; this.vel.z *= -0.25; this.hp -= 6; }
        const gy = this.ground();
        if (this.pos.y <= gy && this.vel.y <= 0) {
          this.pos.y = gy;
          const hs = Math.hypot(this.vel.x, this.vel.z);
          if (hs > 0.6) { this.vel.y = 0; this.vel.x *= Math.exp(-7 * dt); this.vel.z *= Math.exp(-7 * dt); if (!this.dusted) { this.dusted = true; c.fx.dust(this.pos, { amount: 0.8 * this.k }); c.sfx('bodyfall', 0.7); cue(c.W, this.P.voice?.down, [this.pos.x, this.pos.y, this.pos.z]); } }
          else this.landDown();
        }
        if (this.st > 3.5) { this.pos.y = gy; this.landDown(); }
        break;
      }
      case 'down': {
        this.fall = Math.min(1, this.fall + dt * 3);
        if (this.st > this.downT) {
          if (this.hp <= 0) { this.out = true; this.set('out'); this.outAt = c.time; c.onEnemyOut(this); }
          else { this.set('getup'); this.stopOne(0.5); }
        }
        break;
      }
      case 'getup': {
        this.fall = Math.max(0, 1 - smooth(this.st / 0.9));
        if (this.st > 0.95) { this.fall = 0; this.set('hold'); this.cd = rnd(0.6, 1.4); }
        break;
      }
      case 'dying': {
        this.spd = damp(this.spd, 0, 6, dt);
        const u = clamp(this.st / this.dieT, 0, 1); this.fall = u * u * (3 - 2 * u);
        if (!this.thud && this.fall > 0.9) {
          this.thud = true;
          c.fx.dust(this.chest(_v).setY(this.pos.y), { amount: 1 + this.k }); c.shake(0.3 + 0.25 * Math.min(2.5, this.k)); c.sfx('bodyfall', 1);
          cue(c.W, this.P.voice?.down, [this.pos.x, this.pos.y, this.pos.z]);
        }
        if (this.st > this.dieT + 0.35) { this.out = true; this.set('out'); this.outAt = c.time; c.onEnemyOut(this); }
        break;
      }
      case 'out': this.spd = 0; break;
    }
    if (this.state !== 'knock') { const gy = this.ground(); this.pos.y = damp(this.pos.y, gy, 20, dt); }
    this.root.rotation.y = this.yaw;
    this.anim(this.state === 'out' && this.st > 2 ? 0 : dt);
  }
  attackStep(dt, dist, faceP) {
    const c = this.c, B = this.B, a = this.one && this.one.name === B.clip ? this.one.a : null, P = c.playerFeet;
    if (!a) { this.set('hold'); c.releaseToken(this); c.clearThreats(this); return; }
    const tele = this.tele;
    // the wind-up held to the cue's clock: at st the clip is where it must be to land at `tele`; after contact, its own pace
    if (!this.swung) { a.timeScale = 0; a.time = Math.min(B.hit, B.from + (B.hit - B.from) * clamp(this.st / tele, 0, 1)); }
    else a.timeScale = B.ts1 || 1.1;
    const clipT = a.time;
    // (the ring of a slam on the street, filling as it comes)
    if (B.quake && !this.swung) c.fx.ring(this.quakeAt(B, _v), B.quake.r * this.k, clamp(this.st / tele, 0, 1));
    // tracking him through the wind-up, then committed (the last 0.4 s, a slam from the start)
    const left = tele - this.st;
    // (a bite follows him with its head almost to the snap: it is committed only for its last 0.15 s)
    if (!this.swung && !B.quake && left > (B.dip ? 0.15 : 0.4)) {
      this.yaw = turnTo(this.yaw, faceP, this.P.turn * (this.st < tele * 0.6 || B.dip ? 1 : 0.4), dt);
      const gap = dist - B.range * this.k;
      if (gap > 0.05 && !B.travel) { const s = Math.min(gap, gap / Math.max(0.1, left) * dt, this.T.speed * 0.9 * dt); const d = _v.set(P.x - this.pos.x, 0, P.z - this.pos.z).normalize(); this.moveXZ(d.x * s, d.z * s); }
      else if (gap < -0.35 * this.k) { const d = _v.set(P.x - this.pos.x, 0, P.z - this.pos.z).normalize(); this.moveXZ(-d.x * 1.2 * dt, -d.z * 1.2 * dt); }
    } else if (B.quake && !this.swung) this.yaw = turnTo(this.yaw, faceP, this.P.turn * 0.5, dt);
    // a lunge or a leap: across the ground toward where he is (locked as it leaves the ground)
    const T = B.travel;
    if (T && clipT >= T.from && clipT <= T.to + 0.05) {
      if (!this.lunge) {
        const want = Math.max(0, dist - (B.range * this.k)), D = Math.min(want, T.max * this.k);
        const d = _v.set(P.x - this.pos.x, 0, P.z - this.pos.z).normalize();
        this.lunge = { from: this.pos.clone(), dx: d.x * D, dz: d.z * D, done: 0 };
        this.yaw = Math.atan2(d.x, d.z);
      }
      const u = smooth(clamp((clipT - T.from) / (T.to - T.from), 0, 1)), L = this.lunge;
      this.moveXZ(L.from.x + L.dx * u - this.pos.x, L.from.z + L.dz * u - this.pos.z);
    }
    // contact: at the clip's own moment the cue is spent; the blow lands within its window, once
    const win = B.win || [-0.08, 0.12];
    if (!this.swung && clipT >= B.hit - 1e-4) { this.swung = true; c.clearThreats(this); this.contact(B, true); if (!B.quake && !this.landed && !this.dodged) this.contact(B, false); }
    else if (this.swung && !B.quake && clipT <= B.hit + win[1]) this.contact(B, false);
    else if (!this.swung && clipT >= B.hit + win[0]) this.contact(B, false);
    if (this.swung && !this.whooshed && !this.landed && !B.quake && clipT > B.hit + win[1]) { this.whooshed = true; c.sfx('whoosh', this.big ? 1.3 : 0.8); }
    if (this.swung && clipT >= (B.until || a.getClip().duration) - 0.05) {
      this.whooshed = false; this.stopOne(0.35); this.set('hold');
      this.cd = rnd(1.1, 2.3) * (this.boss ? 0.85 : 1) * (this.rage ? Math.pow(0.8, this.rage) : 1) * c.crowdK(); c.releaseToken(this);
    }
  }
  // ------------------------------------------------------------------ over the clip (after the mixer)
  late(dt) {
    const M = this.made, body = M.body, yaw = this.yaw;
    const right = _a.set(Math.cos(yaw), 0, -Math.sin(yaw)), up = _b.set(0, 1, 0);
    // (bends go on top of the clips' pose once per pose: a frame with no update (a cutscene's freeze) bends nothing again)
    const fresh = this.posed; this.posed = false;
    this.root.updateMatrixWorld(true);
    // a blow's flinch: the chest and the head snap (smaller on a big one)
    if (fresh && this.flinch > 0) {
      const f = smooth(this.flinch) * (this.heavy ? 0.45 : 1);
      bend(this.bones.spine2, right, -0.22 * f); bend(this.bones.head, _v.set(Math.sin(yaw), 0, Math.cos(yaw)), 0.25 * f * this.flinchDir);
    }
    // the T-rex's bite: the neck reared back as it winds up, then brought down into the bite to meet a man on foot (less
    // at a rider up high), eased back after
    const B = this.state === 'attack' ? this.B : null;
    if (B && B.dip) {
      const u = this.st / this.tele, tall = this.c.W.dan ? this.c.W.dan.limb('head', _v2).y - this.c.playerFeet.y > 2.3 : false;
      const w = u < 0.25 ? -0.3 * smooth(u / 0.25) : u < 0.85 ? -0.3 + 1.3 * smooth((u - 0.25) / 0.6) : 1;
      this.dipK = damp(this.dipK, w * (tall ? 0.35 : 1), 14, dt);
    } else this.dipK = damp(this.dipK, 0, 4, dt);
    if (fresh && Math.abs(this.dipK) > 1e-3) {
      const dip = (this.P.blows.bite?.dip || 0.4) * this.dipK;
      bend(this.bones.spine1, right, dip * 0.12); bend(this.bones.neck1, right, dip * 0.4); bend(this.bones.neck2, right, dip * 0.33); bend(this.bones.head, right, dip * 0.25);
    }
    // a creature with no walk clip (the scorpion): its legs swung by the code, four at a time, as fast as it goes
    if (fresh && this.P.gaitless && this.spd > 0.05 && this.targetable) {
      this.walkPh += dt * this.spd / (0.42 * this.k) * Math.PI;
      for (let i = 1; i <= 4; i++) for (const s of ['L', 'R']) {
        const ph = this.walkPh + ((i + (s === 'L' ? 0 : 1)) % 2) * Math.PI, sw = Math.sin(ph), lift = Math.max(0, Math.cos(ph));
        const amp = clamp(this.spd / (0.8 * this.k), 0, 1);
        bend(this.bones['femur' + i + '_' + s], up, 0.26 * sw * amp);
        bend(this.bones['femur' + i + '_' + s], _v.set(Math.sin(yaw), 0, Math.cos(yaw)), (s === 'L' ? -1 : 1) * 0.22 * lift * amp);
      }
    }
    // down: tipped over by the code (the library has no falls): a biped on its back, a beast on its side
    if (this.fall > 1e-3) {
      const e = this.fall, H = this.height;
      if (M.creature === 'beast') { body.rotation.z = this.fallSide * e * 1.45; body.rotation.x = 0; body.position.set(0, e * H * 0.12, 0); }
      else { body.rotation.x = -e * 1.4; body.rotation.z = 0; body.position.set(0, e * H * 0.04, -e * H * 0.12); }
      // (out for good, a while later: it sinks out of sight)
      if (this.state === 'out' && this.c.time - this.outAt > 14) body.position.y -= Math.min(1, (this.c.time - this.outAt - 14) / 2.5) * H * 0.9;
    } else if (body.rotation.x || body.rotation.z || body.position.lengthSq()) { body.rotation.x = 0; body.rotation.z = 0; body.position.set(0, 0, 0); }
    // the hit's flash
    const e = this.flash * this.flash * 0.06;
    for (const m of this.mats) m.emissive.setRGB(e, e * 0.92, e * 0.85);
    this.root.updateMatrixWorld(true);
    this.body.update();
    this.footfalls(dt);
  }
  // its feet meeting the street: its steps (the pack's), a big one's felt through the view close by
  footfalls(dt) {
    if (!this.standing || this.state === 'idle' && this.spd < 0.05) return;
    const k = this.k, W = this.c.W, P = this.c.playerFeet, steps = stepsAt(this.P, this.pos.x, this.pos.z);
    for (const f of this.feet) {
      f.bone.getWorldPosition(_v); const h = _v.y - this.pos.y;
      f.floor = Math.min(f.floor + 0.04 * dt, h); const above = h - f.floor;
      if (above > 0.1 * k) f.up = true;
      else if (f.up && above < 0.035 * k) {
        f.up = false;
        const d = hdist(_v, P); if (d > 45) continue;
        cue(W, steps, [_v.x, _v.y, _v.z], { vol: f.front ? 0.8 : 1 });
        if (this.P.shake && d < 16 && this.c.live()) this.c.shake(this.P.shake * (1 - d / 16));
      }
    }
  }
  setFade(k) {
    k = k < 0.03 ? 0 : k > 0.985 ? 1 : k; if (k === this.fadeK || (k !== 0 && k !== 1 && Math.abs(k - (this.fadeK ?? 1)) < 0.01)) return;
    this.fadeK = k; for (const m of this.mats) m.opacity = k;
  }
  dispose() {
    this.c.scene.remove(this.root);
    this.made.dispose();
    for (const m of this.mats) m.dispose();
    this.disposed = true;
  }
}
const _wp = new THREE.Vector3(), _hd = new THREE.Vector3();
