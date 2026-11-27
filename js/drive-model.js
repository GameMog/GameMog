(function () {
// js/drive-model.js (Mog City): the player's car on its tyres, shared by New York's and San Francisco's controllers
// (js/controllers.js, cities/sf/js/controllers.js; every town and story world drives on the second).
//
// Until now the car went exactly where it pointed: its heading came straight from the steer (steerHandled) and its
// velocity was always along it, so it never slid, and a wall took most of its speed on every half-metre step it
// touched. Here the car carries a sideways slide of its own, c.slipV (m/s, + to its left), beside its speed along its
// heading (c.speed) and the knocks' shove (c.vx, c.vz):
//   tyreStep(c, dh, dt, { hb, throttle, steer })   once an update, after the steer and any spin turned the heading by dh:
//     - the velocity carried round into the new heading (what was along the old heading is partly sideways now);
//     - the tyres take the slide off, in proportion to the slip angle (CORNERING m/s² per rad) up to the car's sideways
//       grip (lat, m/s²): under it the car tracks with a few degrees of slip; past it the slide grows and the car
//       drifts wide of its nose, the nose kept pointing within a stable angle of the way it travels (ALIGN);
//     - the handbrake (hb, Space while the car has no hop): the rear lets go (a share of the grip, HB), the car scrubs
//       speed and swings round under the steer, for a handbrake turn or a drift; counter-steer catches it;
//     - a tail-happy car (its sheet's character, tune.js `tail`) steps out under power in a turn.
//     Returns the slip angle (rad, + the car moving to the left of its nose) and keeps c.slip, c.slide (0..1: how far
//     past its grip), c.hb (the handbrake on, rolling) and c.latF (the tyres' sideways pull, m/s²) for the body's
//     roll, the skid marks, the squeal and the camera.
//   gripOf(c, v)                                    the car's sideways grip (m/s²) at v m/s (DOWNFORCE) and its
//                                                   cornering stiffness
//   wallKnock(c, nx, nz)                            a wall (its normal nx, nz out of it) against the car's whole
//     velocity: the part into it bounced back (a little), the part along it kept less a scrape (Coulomb friction
//     against the blow), once a contact (KNOCK.cool s: the frames after, while it is still pressed there, only the way
//     into it is taken out). Returns { vn, headOn, sideDot, knock } (knock: a real hit, to be felt), or null.
//   velocity(c, out)                                the car's world velocity, its slide and shove included
// Pure: it touches only the car entity given it, so tests/drive-model.test.mjs runs it as it is.

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
// the tyres: CORNERING m/s² per radian of slip (a road car's ~4 degrees at the limit); GRIP the share of a car's
// handling grip (steerHandled's limit on how hard it may be steered, m/s²) the tyres hold sideways before they slide;
// ALIGN how fast (1/s) the nose comes back toward the way the car travels once it slides past the limit (so a drift
// holds an angle instead of spinning); SPIN_CAP the most slip angle the drift may reach (rad)
const TYRE = { CORNERING: 420, GRIP: 0.66, ALIGN: 2.6, SPIN_CAP: 1.2 };
// (round 2) the grip with speed, as a road car's aero and its tyres loaded harder give it: the share above rises from
// V0 m/s (about 58 mph) to SHARE at V1 (125 mph, Dan's boost), eased in, and the tyres' cornering stiffens with it (by
// the rise to the power CORNER: the slide's lag behind the nose, v / cornering s, that let a full lock at 124 mph run
// 6 m wide of the old line into the buildings, cut to a few hundredths of a second). So a full-lock turn on the boost
// takes the line it used to, sliding 10 degrees and scrubbing speed (hard: the nose still runs out wide past the
// grip), while every corner and drift below V0 is as it was
const DOWNFORCE = { V0: 26, V1: 56, SHARE: 1.0, CORNER: 3 };
// (round 2) the steer's bite with speed: full lock's sideways pull (the handling's grip) eased down from V0 to K of it at
// V1, so 124 mph at full lock is a long, wide arc the tyres hold (a few degrees of slide) rather than a snap of the nose
// into the buildings: the car arrives at a kerb or a wall slanting, to glance off it, and a driver who lifts or brakes
// first makes the corner. Under V0 (58 mph) the steer and every drift are as they were
const STEER_FADE = { V0: 26, V1: 56, K: 0.7 };
const smooth01 = (t) => { const u = Math.max(0, Math.min(1, t)); return u * u * (3 - 2 * u); };
function steerFade(v) { return 1 + (STEER_FADE.K - 1) * smooth01((Math.abs(v || 0) - STEER_FADE.V0) / (STEER_FADE.V1 - STEER_FADE.V0)); }
// the handbrake: the grip left (share), the cornering left, the nose's pull back (lower: it swings further), the
// speed it scrubs (m/s²), the extra yaw at full lock (rad/s, from walking pace up) and the most it swings round (rad)
const HB = { GRIP: 0.35, CORNERING: 0.3, ALIGN: 0.6, BRAKE: 3, YAW: 1.2, SPIN_CAP: 2.8 };
// a wall: restitution glancing / head on, the scrape's friction against the blow, how long one contact lasts (s), how
// square on is head on (|cos| of the angle between the car's way and the wall's normal)
const KNOCK = { E: 0.18, E_HEAD: 0.12, MU: 0.25, MU_HEAD: 0.6, cool: 0.3, HEAD: 0.72, BLEND: [0.55, 0.9] };
// (round 2: between BLEND[0] and BLEND[1] of headOn the knock eases from a glance's to a head-on's, where it was a step at
// HEAD: a car meeting a wall at 45 degrees no longer stops dead on one side of a line and keeps 70% on the other)

// the grip's rise with speed (1 up to V0, SHARE / GRIP at V1 and over)
function downforce(v) {
  const t = Math.max(0, Math.min(1, (Math.abs(v || 0) - DOWNFORCE.V0) / (DOWNFORCE.V1 - DOWNFORCE.V0)));
  return 1 + (DOWNFORCE.SHARE / TYRE.GRIP - 1) * t * t * (3 - 2 * t);
}
function gripOf(c, v = 0) {
  const H = c.handling;
  const grip = H && Number.isFinite(H.grip) ? H.grip : 30;
  const lat = (H && Number.isFinite(H.lat) ? H.lat : grip * TYRE.GRIP) * downforce(v);
  return { lat, cornering: (H && Number.isFinite(H.cornering) ? H.cornering : TYRE.CORNERING) * Math.pow(downforce(v), DOWNFORCE.CORNER) };
}

function velocity(c, out = { x: 0, z: 0 }) {
  const s = Math.sin(c.heading), k = Math.cos(c.heading), slide = c.slipV || 0;
  out.x = s * c.speed + k * slide + (c.vx || 0);
  out.z = k * c.speed - s * slide + (c.vz || 0);
  return out;
}

// the tail stepping out under power in a turn (tune.js: yaw kick rad/s², slide m/s² at full power and lock, in a band of
// speed round vPeak): how much grip it takes, and the yaw it adds
function tailOf(c, throttle, steer, v) {
  const T = c.handling && c.handling.tail;
  if (!T || throttle <= 0.3 || Math.abs(steer) < (T.steerMin ?? 0.3) || v < (T.vMin ?? 4)) return null;
  const band = Math.exp(-(((v - (T.vPeak ?? 12)) / (T.vSpan || 20)) ** 2));
  const k = throttle * Math.abs(steer) * band;
  return { grip: (T.slide || 0) * k, yaw: (T.yaw || 0) * k * Math.sign(steer) };
}

function tyreStep(c, dh, dt, o = {}) {
  if (!(dt > 0)) return c.slip || 0;
  const hb = !!o.hb, throttle = o.throttle || 0, steer = o.steer || 0;
  if (!Number.isFinite(c.slipV)) c.slipV = 0;
  c._knockCool = Math.max(0, (c._knockCool || 0) - dt);
  // carried round: the world velocity unchanged by the heading's turn, seen from the new heading
  const cs = Math.cos(dh), sn = Math.sin(dh);
  let f = c.speed * cs + c.slipV * sn;
  let s = -c.speed * sn + c.slipV * cs;
  // (the tyres' own turns of the nose (the handbrake's swing, the drift's pull back): the velocity kept where it is)
  const turn = (d) => { c.heading += d; const a = Math.cos(d), b = Math.sin(d), f1 = f * a + s * b; s = -f * b + s * a; f = f1; };
  const v = Math.max(Math.abs(f), 3);
  const g = gripOf(c, f);
  let lat = g.lat, cornering = g.cornering, align = TYRE.ALIGN;
  const tail = tailOf(c, throttle, steer, Math.abs(f));
  if (tail) { lat = Math.max(lat * 0.45, lat - tail.grip); c.angularVel = (c.angularVel || 0) + tail.yaw * dt; }
  if (hb && Math.hypot(f, s) > 1) {
    lat *= HB.GRIP; cornering *= HB.CORNERING; align = HB.ALIGN;
    f -= Math.sign(f) * Math.min(Math.abs(f), HB.BRAKE * dt);
    // (the rear let go: the steer swings it round harder, more so the faster it goes, up to a point)
    turn(steer * HB.YAW * Math.min(1, Math.hypot(f, s) / 8) * dt);
  }
  // the tyres against the slide: in proportion to the slip angle (exponentially, so a long frame can't overshoot),
  // no more than the grip
  const linear = Math.abs(s) * (1 - Math.exp(-cornering * dt / v));
  const limit = lat * dt;
  const sliding = linear > limit;
  const push = Math.min(linear, limit);
  c.latF = s > 0 ? -push / dt : push / dt; // (the tyres' sideways pull, m/s², + to the left: the body rolls with it)
  s -= Math.sign(s) * push;
  // past the grip: the nose drawn back toward the way it travels by however far the slip is past the tyres' own angle
  let slip = Math.atan2(s, Math.abs(f));
  const own = lat / cornering;
  if (sliding && f > 1) {
    const over = Math.sign(slip) * Math.max(0, Math.abs(slip) - own);
    turn(align * over * dt);
    slip = Math.atan2(s, Math.abs(f));
    // (past the most a drift holds, SPIN_CAP (more on the handbrake, to swing round a 180): pulled back hard, the rest of
    // the turn taken by the nose)
    const cap = hb ? HB.SPIN_CAP : TYRE.SPIN_CAP;
    if (Math.abs(slip) > cap) {
      turn(Math.sign(slip) * (Math.abs(slip) - cap) * Math.min(1, 8 * dt));
      slip = Math.atan2(s, Math.abs(f));
    }
  }
  c.speed = f;
  c.slipV = Math.abs(s) < 1e-4 ? 0 : s;
  c.slip = Math.abs(Math.hypot(f, s)) > 2 ? slip : 0;
  c.slide = sliding ? Math.min(1, (Math.abs(slip) - own * 0.6) / 0.5) : 0;
  c.hb = hb && Math.hypot(f, s) > 1;
  return c.slip;
}

// the keyboard's steer for a car with its own handling (c.handling: rMin, yawMax, grip, rampIn, rampOut, vRef), as
// js/controllers.js steerHandled gave it (moved here unchanged, so the tests drive the same steer):
//  - the key moves a steer (c.steerK, -1..1) at a steady slew: to full lock in rampIn s (the first at walking pace,
//    the second from vRef m/s up), so a tap turns it a little and a hold all the way; let go (or the other key) it
//    comes back to the middle in rampOut s, quicker than it went;
//  - full lock turns it, by speed: a tight circle of rMin m at walking pace (turning out of a corner), no faster than
//    yawMax rad/s, and no harder than grip m/s² sideways (less lock the faster it goes: no twitch flat out);
//  - its front wheels at the angle that turn takes (c.steerAngle). Returns full lock's yaw rate now (rad/s).
function steer(c, input, dt) {
  const H = c.handling;
  const v = Math.abs(c.speed);
  let s = c.steerK || 0;
  if (input * s < 0 || Math.abs(input) < Math.abs(s)) {
    s += Math.max(-dt / H.rampOut, Math.min(dt / H.rampOut, input - s));
  } else {
    const k = Math.min(1, v / H.vRef);
    const T = H.rampIn[0] + (H.rampIn[1] - H.rampIn[0]) * k;
    s += Math.max(-dt / T, Math.min(dt / T, input - s));
  }
  c.steerK = s;
  const full = (u) => Math.min(u / H.rMin, H.yawMax, H.grip * steerFade(u) / Math.max(u, 0.1));
  const yawFull = full(v);
  // (backing up, the steer turns it the other way; on the handbrake, or sliding more sideways than back (a spin's
  // middle), still the way it's steered)
  const back = c.speed < 0 && !c.hb && Math.abs(c.slipV || 0) < -c.speed;
  if (v > 0.2) c.heading += s * yawFull * (back ? -1 : 1) * dt;
  const u = Math.max(v, 1.5);
  c.steerAngle = s * Math.atan(((c.axle || 1.45) * 2 * full(u)) / u);
  return yawFull;
}

const _v = { x: 0, z: 0 };
function wallKnock(c, nx, nz) {
  const sinH = Math.sin(c.heading), cosH = Math.cos(c.heading);
  const V = velocity(c, _v), vn = -(V.x * nx + V.z * nz);
  if (vn <= 0) return null;
  const into = sinH * nx + cosH * nz, headOn = Math.abs(into), sideDot = cosH * nx - sinH * nz;
  // a real hit: hard enough, and not the same contact still pressed against the wall (unless much harder)
  const knock = vn > 0.5 && ((c._knockCool || 0) <= 0 || vn > Math.max(4, (c._knockVn || 0) * 2));
  const tx = V.x + nx * vn, tz = V.z + nz * vn, tl = Math.hypot(tx, tz);
  let e = 0, mu = 0;
  if (knock) {
    const w = smooth01((headOn - KNOCK.BLEND[0]) / (KNOCK.BLEND[1] - KNOCK.BLEND[0]));
    e = KNOCK.E + (KNOCK.E_HEAD - KNOCK.E) * w;
    mu = KNOCK.MU + (KNOCK.MU_HEAD - KNOCK.MU) * w;
    c._knockCool = KNOCK.cool; c._knockVn = vn;
  }
  // (the scrape: the tangent's loss against the blow, never past a stop along the wall)
  const keep = tl > 1e-4 ? Math.max(0, tl - mu * (1 + e) * vn) / tl : 0;
  const ox = tx * keep + nx * vn * e, oz = tz * keep + nz * vn * e;
  // back into the car's frame: its speed along its heading and its slide; the shove spent
  c.speed = ox * sinH + oz * cosH;
  c.slipV = ox * cosH - oz * sinH;
  c.vx = 0; c.vz = 0;
  // (at a slant, the nose turned along the wall: the more the harder it hit)
  if (knock && headOn <= KNOCK.HEAD) c.angularVel = (c.angularVel || 0) + sideDot * (into >= 0 ? -1 : 1) * Math.min(3.2, vn * 0.22);
  return { vn, headOn, sideDot, knock, into };
}

// (jh-drive round 2) On foot, his weight: he gets going in about 0.3 s (UP m/s² to a jog, SPRINT over it: a run takes
// another half second), stops in a quarter of one (DOWN), turns at TURN rad/s walking (180 degrees in under half a
// second) and less at a run (TURN_RUN at RUN m/s); the stick's tilt walks, jogs, then runs (gait: 0..1 of it to m/s)
const FOOT = { UP: 15, SPRINT: 6.5, DOWN: 33, TURN: 6.6, TURN_RUN: 4.2, WALK: 1.7, JOG: 4.4, RUN: 8.2 };
function footSpeed(speed, target, dt) {
  const up = Math.abs(target) > Math.abs(speed) && Math.sign(target || 1) === Math.sign(speed || target || 1);
  const rate = up ? (Math.abs(speed) < FOOT.JOG ? FOOT.UP : FOOT.SPRINT) : FOOT.DOWN;
  return speed + Math.max(-rate * dt, Math.min(rate * dt, target - speed));
}
function footTurn(speed) {
  const k = Math.max(0, Math.min(1, (Math.abs(speed) - FOOT.JOG) / (FOOT.RUN - FOOT.JOG)));
  return FOOT.TURN + (FOOT.TURN_RUN - FOOT.TURN) * k;
}
// the stick's tilt (0..1) to a pace: a walk to half way, a jog at full; top: his pace at full tilt (a run on Shift)
function gait(mag, top) {
  if (mag <= 0) return 0;
  const jog = Math.min(top, FOOT.JOG);
  const base = mag < 0.5 ? FOOT.WALK * (mag / 0.5) : FOOT.WALK + (jog - FOOT.WALK) * ((mag - 0.5) / 0.5);
  return top > jog ? base * (top / jog) : base;
}

// (jh-drive round 2) the radar's range with the car's speed: 1x to RADAR.v0 m/s, RADAR.max x at RADAR.v1 (76 mph) and over,
// so the next turn is on it in time (the maps divide their scale by it: js/nyc-map.js, cities/sf/js/sf-map.js, the GPS's)
const RADAR = { v0: 6, v1: 34, max: 1.8 };
function radarZoom(speed) {
  const t = Math.max(0, Math.min(1, (Math.abs(speed || 0) - RADAR.v0) / (RADAR.v1 - RADAR.v0)));
  return 1 + (RADAR.max - 1) * t * t * (3 - 2 * t);
}

const DriveModel = { STEER_FADE, steerFade, RADAR, radarZoom, FOOT, footSpeed, footTurn, gait, TYRE, HB, KNOCK, DOWNFORCE, downforce, gripOf, velocity, steer, tyreStep, wallKnock, wrap };
if (typeof window !== 'undefined') Object.assign(window.NYC || (window.NYC = {}), { DriveModel });
if (typeof module !== 'undefined' && module.exports) module.exports = DriveModel;
})();
