      /* ======================================================= the derby == */
      // Included into openWorld() in open.js (lib/custom-game.ts puts it at the
      // marker), so it shares the open world's closure: its actors, director,
      // coins, HUD, intro and states. `open.vehicle` turns an open world into car
      // combat in an arena (the owner, 1 Oct: Mog Derby): you drive instead of
      // walk, the crew drive at you instead of punching, spins and wrecks pay GM.
      //
      // The rules follow drcollect/demolition-derby (MIT, (c) 2026 Patrick Hable):
      // a car you hit hard enough starts a spin credited to you, and how far it
      // turns pays (90, 180, 360 degrees); a wreck pays most. Damage lands by
      // zone (a nose is the weak point, a tail the strong one) and grows with the
      // change of speed a hit causes. The other drivers pick a target with room
      // for a run-up, lead it, aim for a back corner to spin it, turn side-on to
      // a head-on, back into you once their nose is dented, back off out of a
      // shoving match and come again, and steer off the wall (licence: derby-LICENSE.txt). Its physics engine
      // is not used: here the cars are boxes that slide and turn on a flat floor,
      // pushed apart by impulses, which is all a camera behind a truck can see.
      //
      //   open.vehicle: { arena: { x, z, rx, rz } (the wall: an ellipse), gates: [[x, z], ...]
      //     (where the crew drive in), guns: true, armor: 0.55 (how hard hits land on you),
      //     gm: { spin90: 30, spin180: 60, spin360: 150, wreck: 150 } }
      //   open.crew.<kind>.car: options for ctx.assets.car (or (ctx, i, heat) => options)
      var DERBY = (function (V) {
        if (!V) return null;
        V = typeof V === 'object' ? V : {};
        var A = V.arena && typeof V.arena === 'object' ? V.arena : {}, B = O.bounds || {};
        var bx = Array.isArray(B.x) ? B.x : [-60, 60], bz = Array.isArray(B.z) ? B.z : [-60, 60];
        var arena = { x: num(A.x, (bx[0] + bx[1]) / 2, -1e4, 1e4), z: num(A.z, (bz[0] + bz[1]) / 2, -1e4, 1e4), rx: num(A.rx, (bx[1] - bx[0]) / 2 - 3, 15, 400), rz: num(A.rz, (bz[1] - bz[0]) / 2 - 3, 15, 400) };
        var gates = (Array.isArray(V.gates) ? V.gates : []).filter(function (g) { return Array.isArray(g) && g.length >= 2 && isFinite(g[0]) && isFinite(g[1]); }).map(function (g) { return { x: +g[0], z: +g[1] }; });
        if (!gates.length) [0, 1, 2, 3].forEach(function (k) { var a = k * Math.PI / 2; gates.push({ x: arena.x + Math.sin(a) * (arena.rx - 6), z: arena.z + Math.cos(a) * (arena.rz - 6) }); });
        var G = V.gm && typeof V.gm === 'object' ? V.gm : {};
        return {
          arena: arena, gates: gates, guns: V.guns !== false, armor: num(V.armor, 0.55, 0.1, 2),
          gm: { spin: [num(G.spin90, 30, 0, 5000), num(G.spin180, 60, 0, 5000), num(G.spin360, 150, 0, 5000)], wreck: num(G.wreck, 150, 0, 20000) },
          spins: 0, wrecks: 0, tracers: null, bullets: [], log: [],
        };
      })(O.vehicle);
      // armour per unit of a crew kind's hp (hp counts punches for a person; a car takes far more)
      var ARMOR = 30;
      // how each class drives: top speed (m/s), pull, brakes, grip, reverse
      var HANDLING = {
        van: { vmax: 25, accel: 9, brake: 16, grip: 7, vrev: 9 }, stockcar: { vmax: 27, accel: 10.5, brake: 17, grip: 8, vrev: 10 },
        monster: { vmax: 21, accel: 8, brake: 13, grip: 6.5, vrev: 8 }, hypercar: { vmax: 31, accel: 12, brake: 19, grip: 8.5, vrev: 10 },
        roadster: { vmax: 28, accel: 11, brake: 18, grip: 8.5, vrev: 10 }, formula: { vmax: 32, accel: 13, brake: 20, grip: 9.5, vrev: 9 },
      };

      /* -------------------------------------------------------- the cars -- */
      // a car on an actor: its box, its mass, how it drives, its dents
      function derbyCar(a, veh) {
        var k = HANDLING[veh && veh.kind] || HANDLING.stockcar, L = veh && veh.length || 4.8, Wd = veh && veh.width || 2;
        var m = veh && veh.mass || 1.5;
        a.car = {
          hl: L / 2 * 0.96, hw: Wd / 2 * 0.94, h: veh && veh.height || 1.4, m: m, I: m * (L * L + Wd * Wd) / 12, wb: L * 0.6,
          vmax: k.vmax, accel: k.accel, brake: k.brake, grip: k.grip, vrev: k.vrev, steer: 0,
          inp: { thr: 0, steer: 0, hand: false, boost: false }, u: 0,
          zones: { f: 0, r: 0, l: 0, rt: 0 }, spin: null, lastHit: null, wreck: false, jolt: 0, fire: false, side: 0, loose: 0,
          heat: 0, hot: false, cool: 0, S: { speed: 0, lateral: 0, boost: false, brake: false, damage: 0, wrecked: false, jolt: 0, fire: false, fireSide: 0 },
          ai: null, muzzles: veh && veh.muzzles || null,
        };
        a.r = a.car.hw; a.vx = a.vz = 0; a.w = 0;
        a.e.muzzle = function () { return { y: a.car.h * 0.82, forward: a.car.hl * 0.7 }; };
        return a;
      }
      // a crew kind's car: the world's options, built by the car kit
      function derbyCrewCar(kind, sp, i, extra) {
        var own = null;
        try { own = sp.make(ctx, i, DIR.heat); } catch (e) { warn('open.crew.' + kind + '.car threw: ' + (e && e.message || e)); }
        if (!own || !own.object || !own.vehicle) return null;
        var a = makeActor(kind, own, Object.assign({ body: 'car', name: own.name || sp.names[i % sp.names.length] }, extra || {}));
        derbyCar(a, own.vehicle);
        a.car.ai = { mode: 'attack', modeT: 0, retarget: 0, stuck: 0, steerS: 0, evadeDir: 1, wobble: Math.random() * 9, fwd: false, pushing: 0, back: 0, target: null,
          p: { aggression: 0.55 + RND() * 0.45, caution: 0.15 + RND() * 0.75, reverseRam: 0.2 + RND() * 0.75, skill: 0.5 + RND() * 0.35, focus: 0.25 + RND() * 0.4 } };
        return a;
      }
      function cars() { return actors.filter(function (a) { return a.car; }); }
      // a crew kind with no car of its own: the derby's regulars in stock cars, a
      // tow-truck yellow for the second kind, the law in black and white, a monster truck to lead them
      function derbyDefaultCar(kind, i) {
        var P = ['#C8102E', '#1F4E9C', '#F2B705', '#2E7D32', '#6A1B9A', '#E65100', '#37474F', '#00838F'];
        if (kind === 'boss') return { kind: 'monster', paint: ['#1E1E22', '#5B0F14', '#123A1C'][i % 3], trim: '#F2B705', accent: '#E0401B', pattern: 'flames', spikes: true, livery: ['CRUSHER', 'IRON HOG', 'BONE RATTLER'][i % 3] };
        if (kind === 'cop') return { kind: 'stockcar', paint: '#F4F4F2', trim: '#101216', accent: '#1D4ED8', pattern: 'split', number: String(10 + i), numberInk: '#101216', livery: 'SHERIFF' };
        return { kind: 'stockcar', paint: P[(i * 3 + (kind === 'biker' ? 1 : 0)) % P.length], trim: P[(i * 5 + 2) % P.length], accent: '#FFFFFF', pattern: ['bands', 'stripes', 'arrow', 'plain'][i % 4], number: String(((i * 37) % 89) + 2) };
      }
      function fwdOf(a) { return { x: Math.sin(a.yaw), z: Math.cos(a.yaw) }; }
      // a point in a car's frame: z ahead, x to its left
      function toLocal(a, x, z) { var dx = x - a.x, dz = z - a.z, s = Math.sin(a.yaw), c = Math.cos(a.yaw); return { z: dx * s + dz * c, x: dz * s - dx * c }; }
      function wrap(y) { while (y > PI) y -= TAU; while (y < -PI) y += TAU; return y; }
      function health(a) { return a.max > 0 ? clamp(a.hp / a.max, 0, 1) : 0; }

      /* ------------------------------------------------------- driving -- */
      // one car for one step: the engine and brakes along it, the tyres against
      // the slide across it, the steering turning it (a bicycle's turn for its
      // speed); a hit's spin carries on until the tyres bite again
      function drive(a, inp, dt) {
        var c = a.car, f = fwdOf(a), rx = -f.z, rz = f.x;   // r: the car's left
        var u = a.vx * f.x + a.vz * f.z, s = a.vx * rx + a.vz * rz;
        if (c.wreck) inp = { thr: 0, steer: 0, hand: true, boost: false };
        var hp = health(a), nose = clamp((c.zones.f - 0.55) / 0.45, 0, 1);
        var power = c.accel * (inp.boost ? 1.3 : 1) * (1 - 0.5 * nose) * (1 - 0.6 * Math.pow(c.zones.r, 1.6)) * (0.55 + 0.45 * Math.max(hp, 0.25));
        var top = c.vmax * (inp.boost ? 1.12 : 1) * (1 - 0.25 * Math.max(c.zones.f, c.zones.r));
        if (inp.thr > 0.02) {
          if (u < -0.5) u = Math.min(0, u + c.brake * inp.thr * dt);
          else u += power * inp.thr * clamp(1 - u / top, 0, 1) * dt;
        } else if (inp.thr < -0.02) {
          if (u > 0.5) u = Math.max(0, u + c.brake * inp.thr * dt);
          else u -= power * 0.6 * -inp.thr * clamp(1 + u / c.vrev, 0, 1) * dt;
        }
        // rolling and air; the handbrake drags; a wreck stops
        u -= u * (0.12 + (inp.hand ? 0.9 : 0) + (c.wreck ? 2.5 : 0)) * dt;
        u -= Math.sign(u) * Math.min(Math.abs(u), 0.6 * dt);
        // knocked loose by a hit: the tyres let go for a moment, so the car slides and spins
        if (c.loose > 0) c.loose -= dt;
        var grip = c.wreck ? 9 : inp.hand ? 1.5 : c.loose > 0 ? c.grip * 0.3 : c.grip;
        s *= Math.exp(-grip * dt);
        a.vx = f.x * u + rx * s; a.vz = f.z * u + rz * s;
        // the turn: right is negative yaw; less lock at speed; the handbrake swings the tail
        c.steer = damp(c.steer, inp.steer, 9, dt);
        var lock = 0.62 / (1 + Math.abs(u) / 11), wT = -(u / c.wb) * Math.tan(c.steer * lock) * (inp.hand ? 1.7 : 1) * (1 - 0.3 * Math.max(c.zones.l, c.zones.rt));
        var off = Math.abs(a.w - wT), k = c.loose > 0 ? 0.7 : off > 1.6 ? 1.1 : inp.hand ? 3 : 7;
        a.w += (wT - a.w) * (1 - Math.exp(-k * dt));
        a.yaw = wrap(a.yaw + a.w * dt);
        a.x += a.vx * dt; a.z += a.vz * dt;
        c.u = u; a.speed = Math.hypot(a.vx, a.vz);
        if (a.speed > 0.3) a.mdir = Math.atan2(a.vx, a.vz);
        // what the car kit shows: its speed and its wheels' turn, the throttle, the brake
        var S = c.S; S.speed = Math.abs(u); S.lateral = c.steer * 0.4 * Math.max(Math.abs(u), 8) / 1.6;
        S.boost = inp.thr > 0.5 && !c.wreck; S.brake = (inp.thr < -0.1 && u > 1) || (inp.hand && Math.abs(u) > 2);
      }

      /* ---------------------------------------------------- collisions -- */
      // two boxes on the floor: the separating axes, the shallowest overlap, the
      // corner pressed deepest; then an impulse with a little bounce and friction
      var _ax = [0, 0, 0, 0, 0, 0, 0, 0];
      function corners(a, out) {
        var c = a.car, f = fwdOf(a), lx = -f.z, lz = f.x;   // left
        var k = 0;
        for (var i = -1; i <= 1; i += 2) for (var j = -1; j <= 1; j += 2) { out[k++] = a.x + f.x * c.hl * i + lx * c.hw * j; out[k++] = a.z + f.z * c.hl * i + lz * c.hw * j; }
        return out;
      }
      var CA = new Float32Array(8), CB = new Float32Array(8), SPINK = 1.6;
      function project(cs, nx, nz) { var lo = Infinity, hi = -Infinity; for (var i = 0; i < 8; i += 2) { var p = cs[i] * nx + cs[i + 1] * nz; if (p < lo) lo = p; if (p > hi) hi = p; } return [lo, hi]; }
      function carHit(A, B) {
        var ra = Math.hypot(A.car.hl, A.car.hw), rb = Math.hypot(B.car.hl, B.car.hw);
        if (Math.hypot(A.x - B.x, A.z - B.z) > ra + rb) return;
        corners(A, CA); corners(B, CB);
        var fa = fwdOf(A), fb = fwdOf(B);
        _ax[0] = fa.x; _ax[1] = fa.z; _ax[2] = -fa.z; _ax[3] = fa.x; _ax[4] = fb.x; _ax[5] = fb.z; _ax[6] = -fb.z; _ax[7] = fb.x;
        var best = Infinity, nx = 0, nz = 0, ownA = true;
        for (var i = 0; i < 8; i += 2) {
          var pa = project(CA, _ax[i], _ax[i + 1]), pb = project(CB, _ax[i], _ax[i + 1]);
          var o = Math.min(pa[1], pb[1]) - Math.max(pa[0], pb[0]);
          if (o <= 0) return;
          if (o < best) { best = o; nx = _ax[i]; nz = _ax[i + 1]; ownA = i < 4; }
        }
        // from A to B
        if ((B.x - A.x) * nx + (B.z - A.z) * nz < 0) { nx = -nx; nz = -nz; }
        // the contact: B's corner deepest into A, or A's deepest into B
        var px = 0, pz = 0, m = Infinity, M = -Infinity;
        if (ownA) { for (i = 0; i < 8; i += 2) { var d = CB[i] * nx + CB[i + 1] * nz; if (d < m) { m = d; px = CB[i]; pz = CB[i + 1]; } } }
        else { for (i = 0; i < 8; i += 2) { var d2 = CA[i] * nx + CA[i + 1] * nz; if (d2 > M) { M = d2; px = CA[i]; pz = CA[i + 1]; } } }
        resolve(A, B, nx, nz, px, pz, best);
      }
      function massOf(a) { return a.car.m * (a.car.wreck ? 2.2 : 1) * (a.scripted ? 50 : 1); }
      function resolve(A, B, nx, nz, px, pz, depth) {
        var mA = massOf(A), mB = massOf(B), iA = 1 / mA, iB = 1 / mB, IA = A.car.I * mA / A.car.m, IB = B.car.I * mB / B.car.m;
        // apart, by mass
        var push = depth + 0.01;
        A.x -= nx * push * iA / (iA + iB); A.z -= nz * push * iA / (iA + iB);
        B.x += nx * push * iB / (iA + iB); B.z += nz * push * iB / (iA + iB);
        var rAx = px - A.x, rAz = pz - A.z, rBx = px - B.x, rBz = pz - B.z;
        var vAx = A.vx + A.w * rAz, vAz = A.vz - A.w * rAx, vBx = B.vx + B.w * rBz, vBz = B.vz - B.w * rBx;
        var vn = (vBx - vAx) * nx + (vBz - vAz) * nz;
        if (vn >= 0) return;
        // who drove into whom: the one whose own speed closed the gap takes less of it
        var atA = Math.max(0, A.vx * nx + A.vz * nz), atB = Math.max(0, -(B.vx * nx + B.vz * nz)), shA = atA + atB > 0.5 ? atA / (atA + atB) : 0.5;
        var kA = rAz * nx - rAx * nz, kB = rBz * nx - rBx * nz;
        var j = -(1 + 0.3) * vn / (iA + iB + kA * kA / IA + kB * kB / IB);
        A.vx -= nx * j * iA; A.vz -= nz * j * iA; A.w -= j * kA / IA * SPINK;
        B.vx += nx * j * iB; B.vz += nz * j * iB; B.w += j * kB / IB * SPINK;
        // friction along the contact: the scrape that turns a car
        var tx = -nz, tz = nx, vt = (vBx - vAx) * tx + (vBz - vAz) * tz, kAt = rAz * tx - rAx * tz, kBt = rBz * tx - rBx * tz;
        var jt = clamp(-vt / (iA + iB + kAt * kAt / IA + kBt * kBt / IB), -0.45 * j, 0.45 * j);
        A.vx -= tx * jt * iA; A.vz -= tz * jt * iA; A.w -= jt * kAt / IA;
        B.vx += tx * jt * iB; B.vz += tz * jt * iB; B.w += jt * kBt / IB;
        if (A.scripted || B.scripted) return;
        impact(A, B, j * iA, px, pz, 1 - 0.4 * shA, -nx, -nz);
        impact(B, A, j * iB, px, pz, 1 - 0.4 * (1 - shA), nx, nz);
        hitFx(px, pz, -vn, A === player || B === player);
      }
      // what a hit does to a car: dents by zone, a spin credited to whoever did it
      function impact(a, by, dv, px, pz, relief, nx, nz) {
        var c = a.car;
        if (by && dv > 1.2) c.lastHit = { by: by, t: DIR.time };
        if (by && dv >= 2 && !c.wreck) {
          c.loose = Math.max(c.loose, 0.45 + Math.min(1.1, dv * 0.08));
          if (c.spin && c.spin.by !== by) closeSpin(a);
          if (!c.spin) c.spin = { by: by, acc: 0, t: 0, calm: 0 }; else c.spin.t = Math.min(c.spin.t, 0.3);
        }
        c.jolt = Math.max(c.jolt, Math.min(1, dv / 9));
        if (dv < 1.5) return;
        var amount = 2.1 * Math.pow(dv - 1.5, 1.25) * relief * (by ? 1 : 0.15);
        var lp = toLocal(a, px, pz);
        damage(a, amount, lp.z / c.hl, lp.x / c.hw, by);
        void nx; void nz;
      }
      // zones: the ends are front or back only within a third of the length of each end
      function damage(a, amount, nzL, nxL, by) {
        var c = a.car;
        var f = clamp((nzL - 0.25) / 0.75, 0, 1.4), r = clamp((-nzL - 0.25) / 0.75, 0, 1.4), l = clamp(nxL, 0, 1.4) * 0.9, rt = clamp(-nxL, 0, 1.4) * 0.9;
        var w = { f: f * f, r: r * r, l: l * l, rt: rt * rt }, sum = w.f + w.r + w.l + w.rt;
        if (sum < 1e-4) w = { f: 0.25, r: 0.25, l: 0.25, rt: 0.25 }; else { w.f /= sum; w.r /= sum; w.l /= sum; w.rt /= sum; }
        // a nose is radiator and engine; a tail is the strongest part of a derby car
        var dealt = amount * (w.f * 1.5 + w.r * 0.75 + (w.l + w.rt) * 1.0) * (a === player ? DERBY.armor : 1);
        if (a === player && (invincible || demo)) dealt = 0;
        if (a.scripted || a.ko) return;
        var frac = dealt / Math.max(1, a.max);
        c.zones.f = Math.min(1, c.zones.f + frac * w.f * 2.4); c.zones.r = Math.min(1, c.zones.r + frac * w.r * 2.4);
        c.zones.l = Math.min(1, c.zones.l + frac * w.l * 2.4); c.zones.rt = Math.min(1, c.zones.rt + frac * w.rt * 2.4);
        a.hp -= dealt; a.hurtT = 0;
        if (a === player) { PL.regenT = 0; PL.fightT = DIR.time; }
        if (a.hp <= 0) { a.hp = 0; knockout(a, by && by.car ? by : null); }
      }
      // a blow with no point to it (a shot from range, the checks): spread over the car
      function derbyHurt(a, power, by) {
        if (a.ko || a.scripted) return;
        if (a === player && (invincible || demo)) return;
        if (by && by.car) a.car.lastHit = { by: by, t: DIR.time };
        a.car.jolt = Math.max(a.car.jolt, 0.6);
        a.hp -= power; a.hurtT = 0;
        if (a === player) { PL.regenT = 0; CAM.shake = Math.max(CAM.shake, 0.5); crunch(1.2); }
        if (a.hp <= 0) { a.hp = 0; knockout(a, by && by.car ? by : null); }
      }
      // the wall: an ellipse; any corner past it is pushed back in and bounces off
      function wallHit(a) {
        var c = a.car, R = DERBY.arena; corners(a, CA);
        var worst = 0, wx = 0, wz = 0, gx = 0, gz = 0;
        for (var i = 0; i < 8; i += 2) {
          var qx = (CA[i] - R.x) / R.rx, qz = (CA[i + 1] - R.z) / R.rz, e = Math.hypot(qx, qz);
          if (e > 1) {
            var nx = qx / R.rx, nz = qz / R.rz, n = Math.hypot(nx, nz) || 1; nx /= n; nz /= n;
            var pen = (e - 1) * Math.min(R.rx, R.rz);
            if (pen > worst) { worst = pen; wx = CA[i]; wz = CA[i + 1]; gx = nx; gz = nz; }
          }
        }
        if (worst <= 0) return;
        a.x -= gx * (worst + 0.01); a.z -= gz * (worst + 0.01);
        var rx = wx - a.x, rz = wz - a.z, vx = a.vx + a.w * rz, vz = a.vz - a.w * rx, vn = vx * gx + vz * gz;
        if (vn <= 0) return;
        var m = massOf(a), I = c.I * m / c.m, k = rz * gx - rx * gz;
        var j = (1 + 0.2) * vn / (1 / m + k * k / I);
        a.vx -= gx * j / m; a.vz -= gz * j / m; a.w -= j * k / I;
        // the scrape along it
        var tx = -gz, tz = gx, vt = vx * tx + vz * tz, kt = rz * tx - rx * tz, jt = clamp(-vt / (1 / m + kt * kt / I), -0.35 * j, 0.35 * j);
        a.vx += tx * jt / m; a.vz += tz * jt / m; a.w += jt * kt / I;
        if (!a.scripted) impact(a, null, j / m, wx, wz, 1, gx, gz);
        if (vn > 3) hitFx(wx, wz, vn * 0.7, a === player);
      }
      // posts and tyre stacks inside the arena (ctx.solid circles): a corner against a circle
      function postHit(a) {
        var g = cellAt(a.x, a.z); if (!g || !g.c.length) return;
        corners(a, CA);
        for (var i = 0; i < g.c.length; i++) {
          var q = g.c[i], lp = toLocal(a, q.x, q.z), cx = clamp(lp.x, -a.car.hw, a.car.hw), cz = clamp(lp.z, -a.car.hl, a.car.hl);
          var dx = lp.x - cx, dz = lp.z - cz, d = Math.hypot(dx, dz);
          if (d >= q.r) continue;
          var f = fwdOf(a), lx = -f.z, lz = f.x;
          // the push in the world, out from the circle's centre
          var wx = lx * dx + f.x * dz, wz = lz * dx + f.z * dz, n = Math.hypot(wx, wz) || 1;
          var push = q.r - d; a.x -= wx / n * push; a.z -= wz / n * push;
          var vn = -(a.vx * wx + a.vz * wz) / n;
          if (vn < 0) { a.vx += wx / n * vn * 1.2; a.vz += wz / n * vn * 1.2; if (!a.scripted) impact(a, null, -vn * 1.2, q.x, q.z, 1, 0, 0); }
        }
      }

      /* -------------------------------------------------- spins and GM -- */
      // (earned as a coin is, open.js: the goal, then the story's beats)
      function addGm(n) { if (demo || !(n > 0) || !cfg.coins) return; earnGm(Math.round(n)); }
      function stepSpin(a, dt) {
        var s = a.car.spin; if (!s) return;
        s.acc += a.w * dt; s.t += dt;
        if (Math.abs(a.w) < 0.6) s.calm += dt; else s.calm = 0;
        if ((s.t > 0.7 && s.calm > 0.35) || s.t > 4.5 || a.car.wreck) closeSpin(a);
      }
      function closeSpin(a) {
        var s = a.car.spin; a.car.spin = null;
        if (!s || state !== 'race') return;
        var deg = Math.abs(s.acc) * 180 / PI, k = deg >= 320 ? 2 : deg >= 160 ? 1 : deg >= 80 ? 0 : -1;
        DERBY.log.push((s.by === player ? 'you' : s.by.kind) + '>' + a.kind + ':' + Math.round(deg)); if (DERBY.log.length > 24) DERBY.log.shift();
        if (k < 0 || s.by !== player || a === player) return;
        var n = Math.round(DERBY.gm.spin[k] * (1 + 0.1 * (DIR.heat - 1))), label = ['90°', '180°', '360°'][k];
        DERBY.spins++; addGm(n);
        var gmTag = cfg.coins ? '  +' + n + ' GM' : '';
        if (k === 2) showBanner(label + ' spin', a.name + gmTag); else say(label + ' spin' + gmTag);
        emit('spin', { deg: Math.round(deg), gm: n });
      }
      // a wreck: the engine dies, the car burns where it stopped, its GM spills
      function derbyWreck(a, by) {
        if (a.ko) return;
        var c = a.car;
        a.ko = true; a.koT = 0; a.state = 'ko'; a.act = null; c.wreck = true; c.spin && closeSpin(a);
        c.S.wrecked = true; c.jolt = 1;
        wreckFx(a);
        if (a === player) { crashOpen(by || (c.lastHit && c.lastHit.by)); return; }
        DIR.kos++; DIR.koHeat++; DERBY.wrecks++;
        var hit = c.lastHit, att = by || (hit && DIR.time - hit.t < 8 ? hit.by : null);
        var sp = spec(a.kind), n = Math.max(1, Math.round(sp.gm * (1 + 0.12 * (DIR.heat - 1))));
        drop(a.x, a.y + 0.8, a.z, n);
        if (att === player) {
          var bonus = Math.round(DERBY.gm.wreck * (a.boss ? 4 : 1) * (1 + 0.1 * (DIR.heat - 1)));
          addGm(bonus);
          if (a.boss) { showBanner(a.name + ' wrecked', cfg.coins ? '+' + bonus + ' GM' : ''); hitstop = 0.3; CAM.shake = 0.9; SFX.level(); }
          else say('Wrecked ' + a.name + (cfg.coins ? '  +' + bonus + ' GM' : ''));
        } else say(a.boss ? a.name + ' is out' : a.name + ' is out of the derby');
        if (a.boss) DIR.boss = null;
        emit('knockout', { kind: a.kind, name: a.name, kos: DIR.kos, heat: DIR.heat, wreck: true });
      }

      /* ------------------------------------------------------- effects -- */
      function kitFx() { try { return vehicles().fx(); } catch (e) { return null; } }
      var _p = new THREE.Vector3(), _q = new THREE.Vector3();
      function hitFx(x, z, power, mine) {
        var F = kitFx(); if (!F) return;
        var n = Math.min(40, Math.round(power * 2.5));
        for (var i = 0; i < n; i++) F.spark(_p.set(x, 0.5 + Math.random() * 0.6, z), _q.set((Math.random() - 0.5) * 3, 1.5, (Math.random() - 0.5) * 3), 6 + power * 0.3, 0.5);
        if (power > 7) for (i = 0; i < Math.min(10, power - 6); i++) F.debris(_p.set(x, 0.8, z), _q.set((Math.random() - 0.5) * 8, 2 + Math.random() * 4, (Math.random() - 0.5) * 8));
        if (power > 2.5) crunch(Math.min(2.2, power / 6), mine);
        if (mine) CAM.shake = Math.max(CAM.shake, Math.min(0.9, power * 0.06));
      }
      function wreckFx(a) {
        var F = kitFx(); if (!F) return;
        for (var i = 0; i < 70; i++) F.spark(_p.set(a.x, 0.8, a.z), _q.set((Math.random() - 0.5) * 6, 3, (Math.random() - 0.5) * 6), 10, 0.9);
        for (i = 0; i < 18; i++) F.debris(_p.set(a.x, 1, a.z), _q.set((Math.random() - 0.5) * 12, 3 + Math.random() * 6, (Math.random() - 0.5) * 12));
        for (i = 0; i < 14; i++) F.puff(_p.set(a.x + (Math.random() - 0.5) * 3, 1, a.z + (Math.random() - 0.5) * 3), _q.set((Math.random() - 0.5) * 3, 2 + Math.random(), (Math.random() - 0.5) * 3), 1.6 + Math.random(), 2.6, 0.3);
        for (i = 0; i < 30; i++) F.fire(_p.set(a.x + (Math.random() - 0.5) * 2, 0.8 + Math.random(), a.z + (Math.random() - 0.5) * 2), _q.set(0, 0, 0), 2.4, 0.9);
        var near = player ? dist(a, player) : 99;
        if (near < 40 && audio && !demo) { noiseBand(1.1, 0.6 * (1 - near / 50), 1800, 120); tone(70, 0, 0.6, 'sine', 0.4 * (1 - near / 50), 35); }
        if (near < 25) CAM.shake = Math.max(CAM.shake, 0.6 * (1 - near / 25));
      }
      // metal on metal: a thump and a torn crunch
      function crunch(p, mine) {
        if (!audio || demo) return;
        var k = mine === false ? 0.45 : 1;
        thud(p * k); noiseBand(0.28 + p * 0.12, (0.18 + p * 0.22) * k, 3200, 380);
        if (p > 1.2) for (var g = 0; g < 3; g++) tone(1800 + Math.random() * 2600, 0.03 + g * 0.04, 0.12, 'sine', 0.03 * k);
      }

      /* ---------------------------------------------------------- guns -- */
      // twin guns on your roof (the car kit's armed option): held, they fire in
      // turn, twelve rounds a second; they heat, and lock when they glow until
      // they cool. Rounds fly fast and a little down, and lean onto whoever is in
      // a narrow cone ahead; each hit dents, sparks and pushes
      var NTR = 32, tracerMat = null, tracerGeo = null;
      function tracers() {
        if (DERBY.tracers) return DERBY.tracers;
        tracerMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#FFD27A').multiplyScalar(5), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
        tracerGeo = new THREE.BoxGeometry(0.05, 0.05, 1).translate(0, 0, -0.5);
        DERBY.tracers = [];
        for (var i = 0; i < NTR; i++) { var m = new THREE.Mesh(tracerGeo, tracerMat); m.visible = false; m.frustumCulled = false; m.userData.noReflection = true; scene.add(m); DERBY.tracers.push(m); }
        return DERBY.tracers;
      }
      var tracerN = 0;
      function shoot(a) {
        var c = a.car, mz = c.muzzles && c.muzzles[c.side % c.muzzles.length] || { x: (c.side % 2 ? -1 : 1) * 0.4, y: c.h + 0.2, z: c.hl * 0.6 };
        c.side++;
        var f = fwdOf(a), lx = -f.z, lz = f.x;
        var sx = a.x + f.x * mz.z + lx * mz.x, sz = a.z + f.z * mz.z + lz * mz.x, sy = a.y + mz.y;
        // the aim: whoever is nearest the line ahead, within a narrow cone; else ahead and a little down
        var tgt = null, best = 0.13;
        cars().forEach(function (b) {
          if (b === a || b.ko || b.scripted) return;
          var d = dist(a, b); if (d > 70 || d < 2) return;
          var off = Math.abs(wrap(yawTo(a, b.x, b.z) - a.yaw));
          if (off < best) { best = off; tgt = b; }
        });
        var dx, dy, dz;
        if (tgt) { var lead = dist(a, tgt) / 140; dx = tgt.x + tgt.vx * lead - sx; dz = tgt.z + tgt.vz * lead - sz; dy = tgt.y + tgt.car.h * 0.5 - sy; }
        else { dx = f.x * 26; dz = f.z * 26; dy = 0.7 - sy; }
        var n = Math.hypot(dx, dy, dz) || 1, sp = 0.012;
        dx = dx / n + (Math.random() - 0.5) * sp; dy = dy / n + (Math.random() - 0.5) * sp; dz = dz / n + (Math.random() - 0.5) * sp;
        DERBY.bullets.push({ x: sx, y: sy, z: sz, vx: dx * 140 + a.vx, vy: dy * 140, vz: dz * 140 + a.vz, life: 0.6, by: a, tr: tracers()[tracerN++ % NTR] });
        c.S.fire = true; c.S.fireSide = c.side % 2;
        if (audio && !demo && a === player) { noiseBand(0.06, 0.16, 3200, 900); tone(140, 0, 0.05, 'square', 0.05, 70); }
      }
      // a round's path this step against every car's box (the slabs), then the wall
      function stepBullets(dt) {
        var L = DERBY.bullets;
        for (var i = L.length - 1; i >= 0; i--) {
          var b = L[i], x1 = b.x + b.vx * dt, y1 = b.y + b.vy * dt, z1 = b.z + b.vz * dt, hit = null, ht = 1;
          for (var k = 0; k < actors.length; k++) {
            var a = actors[k]; if (!a.car || a === b.by || a.scripted) continue;
            if (Math.hypot(a.x - b.x, a.z - b.z) > Math.hypot(b.vx, b.vz) * dt + a.car.hl + 2) continue;
            var p0 = toLocal(a, b.x, b.z), p1 = toLocal(a, x1, z1), t0 = 0, t1 = 1, ok = true;
            [['x', a.car.hw], ['z', a.car.hl]].forEach(function (q) {
              if (!ok) return;
              var d = p1[q[0]] - p0[q[0]], s0 = p0[q[0]];
              if (Math.abs(d) < 1e-6) { if (Math.abs(s0) > q[1]) ok = false; return; }
              var ta = (-q[1] - s0) / d, tb = (q[1] - s0) / d; if (ta > tb) { var tt = ta; ta = tb; tb = tt; }
              t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) ok = false;
            });
            if (!ok) continue;
            var yh = b.y + (y1 - b.y) * t0;
            if (yh < a.y - 0.2 || yh > a.y + a.car.h + 0.15) continue;
            if (t0 < ht) { ht = t0; hit = a; }
          }
          var hx = b.x + (x1 - b.x) * ht, hy = b.y + (y1 - b.y) * ht, hz = b.z + (z1 - b.z) * ht;
          // the tracer: a streak behind the round
          var len = Math.min(3, Math.hypot(b.vx, b.vz) * dt * 1.4);
          b.tr.visible = true; b.tr.position.set(hx, hy, hz); b.tr.lookAt(hx + b.vx, hy + b.vy, hz + b.vz); b.tr.scale.set(1, 1, len);
          b.life -= dt;
          var R = DERBY.arena, out = Math.hypot((hx - R.x) / R.rx, (hz - R.z) / R.rz) > 1.02;
          if (hit || out || hy < groundAt(hx, hz) + 0.05 || b.life <= 0) {
            var F = kitFx();
            if (F && (hit || out || hy < 0.3)) for (var s = 0; s < (hit ? 6 : 3); s++) F.spark(_p.set(hx, Math.max(0.1, hy), hz), _q.set(-b.vx * 0.02, 1, -b.vz * 0.02), 4, 0.3);
            if (hit && !hit.ko) {
              var lp = toLocal(hit, hx, hz);
              hit.car.lastHit = { by: b.by, t: DIR.time };
              damage(hit, 1.25, lp.z / hit.car.hl, lp.x / hit.car.hw, b.by);
              hit.vx += b.vx * 0.0012 / hit.car.m; hit.vz += b.vz * 0.0012 / hit.car.m;
              if (audio && !demo && b.by === player) tone(2400 + Math.random() * 800, 0, 0.04, 'triangle', 0.035);
            }
            b.tr.visible = false; L.splice(i, 1); continue;
          }
          b.x = x1; b.y = y1; b.z = z1;
        }
      }
      function stepGuns(a, want, dt) {
        var c = a.car;
        c.cool -= dt;
        if (!want || c.hot || c.wreck) c.heat = Math.max(0, c.heat - dt * 0.34);
        if (c.hot && c.heat < 0.3) c.hot = false;
        if (want && !c.hot && !c.wreck && c.cool <= 0) {
          c.cool = 1 / 12; c.heat += 0.022; shoot(a);
          if (c.heat >= 1) { c.hot = true; c.heat = 1; if (a === player) { say('Guns overheated'); if (audio && !demo) noiseBand(0.5, 0.12, 900, 3800); } }
        }
      }

      /* ------------------------------------------------------- driving AI -- */
      // a derby driver (after drcollect/demolition-derby's AIDriver, MIT): a target
      // with room for a run-up, led and hit on a back corner; a head-on turned
      // side-on; a dented nose backs in; a shoving match backed out of; the wall avoided
      function targetedBy(t) { var n = 0; cars().forEach(function (b) { if (b.car.ai && b.car.ai.target === t && !b.ko) n++; }); return n; }
      function pickTarget(me) {
        var best = null, bs = Infinity, ai = me.car.ai;
        cars().forEach(function (c) {
          if (c === me || c.ko || c.scripted) return;
          var d = dist(me, c), ang = Math.abs(wrap(yawTo(me, c.x, c.z) - me.yaw));
          var s = Math.abs(d - 14) * 0.8 + ang * 4.5;
          if (c === player) s -= ai.p.focus * 14 + (DIR.heat - 1) * 2;
          if (me.car.lastHit && me.car.lastHit.by === c && DIR.time - me.car.lastHit.t < 6) s -= 10;   // revenge
          if (health(c) < 0.3) s -= 6;
          s += targetedBy(c) * 5 + Math.random() * 6;
          if (s < bs) { bs = s; best = c; }
        });
        return best;
      }
      function think(me, dt, pilotMode) {
        var c = me.car, ai = c.ai, out = { thr: 0, steer: 0, hand: false, boost: false };
        if (c.wreck) return out;
        var heatK = Math.min(1, 0.7 + DIR.heat * 0.05), skill = clamp(ai.p.skill * heatK + (pilotMode ? 0.25 : 0), 0.2, 1), aggr = clamp(ai.p.aggression * (0.85 + DIR.heat * 0.04), 0, 1.2);
        var speed = c.u;
        ai.modeT -= dt; ai.retarget -= dt; ai.wobble += dt;
        if (!ai.target || ai.target.ko || ai.target.scripted || ai.retarget <= 0 || actors.indexOf(ai.target) < 0) { ai.target = pickTarget(me); ai.retarget = 1.2 + Math.random() * 2.2; }
        // stuck: out the other way
        var moving = ai.mode === 'attack' || ai.mode === 'reverse' || ai.mode === 'wander' || ai.mode === 'backoff';
        if (moving && Math.abs(speed) < 1) ai.stuck += dt; else ai.stuck = Math.max(0, ai.stuck - dt * 2);
        if (ai.stuck > 1.4 && ai.mode !== 'unstuck') { ai.mode = 'unstuck'; ai.modeT = 1.1 + Math.random() * 0.6; ai.evadeDir = Math.random() < 0.5 ? -1 : 1; ai.stuck = 0; ai.fwd = speed < -0.5; }
        // threats: a head-on coming at the nose (turn side-on), a tailgater (brake-check)
        if (ai.mode === 'attack' || ai.mode === 'wander') {
          var cs = cars();
          for (var i = 0; i < cs.length; i++) {
            var o = cs[i]; if (o === me || o.ko || o.scripted) continue;
            var d = dist(me, o); if (d > 14 || d < 0.1) continue;
            var tx = (me.x - o.x) / d, tz = (me.z - o.z) / d, closing = (o.vx - me.vx) * tx + (o.vz - me.vz) * tz;
            var ang = wrap(yawTo(me, o.x, o.z) - me.yaw);
            if (closing > 8 && Math.abs(ang) < 0.7 && d < 11 && Math.random() < ai.p.caution * 0.35 * dt * 6) { ai.mode = 'evade'; ai.modeT = 0.55 + Math.random() * 0.3; ai.evadeDir = ang > 0 ? 1 : -1; break; }
            if (o !== ai.target && Math.abs(ang) > 2.6 && d < 7 && closing > 3.5 && Math.random() < ai.p.caution * 0.04) { ai.mode = 'brake'; ai.modeT = 0.45; break; }
          }
        }
        // shoving: back off at an angle and come again with speed
        if (ai.mode === 'attack' && ai.target) {
          var lt = toLocal(me, ai.target.x, ai.target.z), touching = dist(me, ai.target) < c.hl + ai.target.car.hl + 1.2;
          if (touching && lt.z > 0 && Math.abs(speed) < 2.5) ai.pushing += dt; else ai.pushing = Math.max(0, ai.pushing - dt * 2);
          if (ai.pushing > 0.45 + (1 - aggr) * 0.4) { ai.pushing = 0; ai.mode = 'backoff'; ai.modeT = 1.3 + Math.random() * 1.1; ai.back = (Math.random() < 0.5 ? -1 : 1) * (0.35 + Math.random() * 0.5); }
        }
        if (ai.modeT <= 0 && ai.mode !== 'attack') ai.mode = ai.target ? 'attack' : 'wander';
        if (!ai.target && (ai.mode === 'attack' || ai.mode === 'reverse')) ai.mode = 'wander';
        var R = DERBY.arena, aim = null;
        switch (ai.mode) {
          case 'unstuck': out.thr = ai.fwd ? 1 : -1; out.steer = ai.evadeDir; break;
          case 'evade': out.thr = 1; out.steer = ai.evadeDir; break;
          case 'brake': out.thr = -1; break;
          case 'backoff': out.thr = -1; out.steer = ai.back; break;
          case 'wander': {
            var wa = Math.atan2((me.z - R.z) / R.rz, (me.x - R.x) / R.rx) + 0.6;
            aim = { x: R.x + Math.cos(wa) * R.rx * 0.55, z: R.z + Math.sin(wa) * R.rz * 0.55 };
            out.steer = clamp(-wrap(yawTo(me, aim.x, aim.z) - me.yaw) * 1.8, -1, 1); out.thr = 0.55;
            break;
          }
          default: {
            var t = ai.target, td = dist(me, t);
            var cl = Math.max(4, Math.hypot(me.vx, me.vz) + 2), lead = clamp(td / cl, 0, 1.3) * (0.4 + 0.6 * skill);
            aim = { x: t.x + t.vx * lead, z: t.z + t.vz * lead };
            // a back corner, to spin it
            var tf = fwdOf(t), tlx = -tf.z, tlz = tf.x, ox = me.x - t.x, oz = me.z - t.z;
            var side = Math.sign(ox * tlx + oz * tlz) || 1, quarter = clamp(aggr * skill, 0, 1), behind = ox * tf.x + oz * tf.z < 0;
            aim.x += -tf.x * t.car.hl * (behind ? 0.8 : 0.55) * quarter + tlx * side * t.car.hw * 0.6 * quarter;
            aim.z += -tf.z * t.car.hl * (behind ? 0.8 : 0.55) * quarter + tlz * side * t.car.hw * 0.6 * quarter;
            var ang2 = wrap(yawTo(me, aim.x, aim.z) - me.yaw);
            // in backwards, with a dented nose or a liking for it
            if (ai.mode === 'attack' && Math.abs(ang2) > 2.1 && td < 15 && td > 3 && Math.random() < ai.p.reverseRam * 0.05 + (c.zones.f > c.zones.r + 0.2 ? 0.05 : 0)) { ai.mode = 'reverse'; ai.modeT = 2.2 + Math.random() * 1.5; }
            if (ai.mode === 'reverse') {
              if (Math.abs(ang2) < 1.2) ai.mode = 'attack';
              else { var back = wrap(ang2 + PI); out.thr = -1; out.steer = clamp(back * 2, -1, 1); break; }
            }
            var noise = (1 - skill) * Math.sin(ai.wobble * 2.3) * 0.25, aa = Math.abs(ang2);
            out.steer = clamp(-(ang2 * (1.6 + skill) + noise), -1, 1);
            out.thr = aa < 0.45 ? 1 : aa < 1.2 ? 0.8 : 0.5;
            if (aa > 1.5 && speed > 9 && skill > 0.6) out.hand = Math.random() < 0.5;
            if (aa > 2.2 && speed < 4) { out.thr = -1; out.steer = Math.sign(ang2); }
            if (aa < 0.25 && td < 25) { out.thr = 1; out.boost = pilotMode && td > 8; }
          }
        }
        // the wall: don't drive into the concrete for nothing
        var rr = Math.hypot((me.x - R.x) / R.rx, (me.z - R.z) / R.rz), margin = 7 / Math.min(R.rx, R.rz);
        if (rr > 1 - margin && ai.mode !== 'unstuck' && ai.mode !== 'reverse' && ai.mode !== 'backoff') {
          var f = fwdOf(me), outward = (f.x * (me.x - R.x) / R.rx + f.z * (me.z - R.z) / R.rz) / Math.max(0.01, rr);
          var tAt = ai.target && Math.hypot((ai.target.x - R.x) / R.rx, (ai.target.z - R.z) / R.rz) > 1 - margin * 1.2 && dist(ai.target, me) < 12;
          if (outward > 0.5 && !tAt) { out.steer = clamp(-wrap(yawTo(me, R.x, R.z) - me.yaw) * 2, -1, 1); out.thr = Math.min(out.thr, 0.7); }
        }
        out.thr *= pilotMode ? 1 : Math.min(1, 0.82 + DIR.heat * 0.03);
        var rate = 4 + skill * 8;
        ai.steerS += clamp(out.steer - ai.steerS, -rate * dt, rate * dt); out.steer = ai.steerS;
        ai.aimAt = ai.target;
        return out;
      }

      /* --------------------------------------------------------- you -- */
      var PILOT = null;
      function derbyPlayer(dt) {
        var a = player, c = a.car;
        if (a.ko) { c.inp = { thr: 0, steer: 0, hand: true, boost: false }; return; }
        // your truck mends itself a little when nothing has hit it for a while
        PL.regenT += dt; if (PL.regenT > 5 && a.hp < a.max) { a.hp = Math.min(a.max, a.hp + 3 * dt); var hk = health(a); ['f', 'r', 'l', 'rt'].forEach(function (z) { c.zones[z] = Math.min(c.zones[z], 1 - hk); }); }
        var inp, fire = false;
        if (autopilot || demo) {
          if (!PILOT) { PILOT = { mode: 'attack', modeT: 0, retarget: 0, stuck: 0, steerS: 0, evadeDir: 1, wobble: 0, fwd: false, pushing: 0, back: 0, target: null, p: { aggression: 0.9, caution: 0.6, reverseRam: 0.1, skill: 0.8, focus: 0 } }; }
          c.ai = PILOT; inp = think(a, dt, true); c.ai = null;
          // the pilot fires at whatever is in front and near, and lets the guns cool before they lock
          fire = c.heat < 0.9 && cars().some(function (b) { return b !== a && !b.ko && !b.scripted && dist(a, b) < 45 && Math.abs(wrap(yawTo(a, b.x, b.z) - a.yaw)) < 0.25; });
        } else {
          var thr = IN.f - IN.b, st = IN.r - IN.l;
          if (IN.jOn) { thr = Math.abs(IN.jy) > 0.18 ? -IN.jy : 0; st = Math.abs(IN.jx) > 0.12 ? IN.jx : 0; }
          inp = { thr: clamp(thr, -1, 1), steer: clamp(st, -1, 1), hand: !!IN.hand, boost: !!IN.sprint };
          fire = !!IN.fire;
        }
        c.inp = inp;
        if (DERBY.guns) stepGuns(a, fire, dt);
      }

      /* ------------------------------------------------------ the frame -- */
      var WRECKS_KEPT = 6;
      function derbyActors(dt) {
        var live = state !== 'intro' && state !== 'title' || demo;
        // who drives: you by your hands (or the pilot), the crew by their heads
        for (var i = 0; i < actors.length; i++) {
          var a = actors[i];
          if (!a.car) continue;
          if (a.ko) {
            a.koT += dt;
            if (a !== player && a.koT > 40) { a.fade -= dt * 0.6; if (a.fade <= 0) { removeActor(a); i--; continue; } }
          }
          if (a.scripted || !live) { a.car.S.speed = a.speed || 0; continue; }
          var inp;
          if (a === player) inp = state === 'race' ? a.car.inp : { thr: 0, steer: 0, hand: true };
          else {
            inp = a.ko || !a.car.ai ? null : think(a, dt, false);
            // a crew kind with a shot fires it at you when it faces you (open.crew.<kind>.ranged)
            if (inp && a.sp && a.sp.ranged && player && !player.ko) {
              if (a.rcool == null) a.rcool = Math.random() * a.sp.ranged.every;
              a.rcool -= dt;
              var pd = dist(a, player);
              if (a.rcool <= 0 && pd < a.sp.ranged.range * 2 && Math.abs(wrap(yawTo(a, player.x, player.z) - a.yaw)) < 0.5) { a.rcool = a.sp.ranged.every * (0.8 + Math.random() * 0.5); fire(a); }
            }
          }
          drive(a, inp || { thr: 0, steer: 0, hand: true }, dt);
          if (a.car.spin) stepSpin(a, dt);
        }
        // the wrecks kept on the floor: the oldest is towed away
        var wrecks = actors.filter(function (a) { return a.car && a.ko && a !== player && a.fade >= 1; });
        if (wrecks.length > WRECKS_KEPT) wrecks.sort(function (p, q) { return q.koT - p.koT; })[0].koT = 41;
        // contact: car against car, the wall, the posts
        if (live) {
          var cs = cars();
          for (var it = 0; it < 2; it++) {
            for (i = 0; i < cs.length; i++) for (var j = i + 1; j < cs.length; j++) if (cs[i].fade > 0.5 && cs[j].fade > 0.5) carHit(cs[i], cs[j]);
            for (i = 0; i < cs.length; i++) { wallHit(cs[i]); postHit(cs[i]); }
          }
        }
        if (DERBY.bullets.length) stepBullets(dt);
        // the picture: placed, turned, and the car kit's own motion
        for (i = 0; i < actors.length; i++) {
          var b = actors[i];
          if (!b.car) continue;
          b.y = groundAt(b.x, b.z);
          b.g.position.set(b.x, b.y, b.z); b.g.rotation.y = b.yaw;
          var far = Math.hypot(b.x - camera.position.x, b.z - camera.position.z);
          b.g.visible = far < 260 && b.fade > 0.02;
          if (!b.g.visible) continue;
          if (b.fade < 1) b.g.traverse(function (m) { if (m.isMesh && m.material && !Array.isArray(m.material) && !m.material.userData.gmFade) { m.material = m.material.clone(); m.material.userData.gmFade = true; m.material.userData.gmOwned = true; m.material.transparent = true; } if (m.isMesh && m.material) m.material.opacity = b.fade; });
          var S = b.car.S; S.damage = 1 - health(b); S.wrecked = b.car.wreck; S.jolt = b.car.jolt; b.car.jolt = 0;
          if (b.scripted) { S.speed = b.speed || 0; S.lateral = 0; S.boost = S.speed > 2; S.brake = false; }
          try { b.e.animate(t, dt, S); } catch (e) { fail('A car in the derby could not move: ' + (e && e.message || e)); b.e.animate = function () {}; }
          S.fire = false;
        }
        derbyEngines();
      }

      /* -------------------------------------------------------- camera -- */
      // behind the truck and above it, looking past it; it swings round after a
      // spin rather than whipping, a drag looks about, and it keeps out of the stands
      var CAMV = { yaw: 0, init: false };
      function derbyCam(dt) {
        if (!player) return;
        var fl = film && typeof film === 'object' ? film : null;
        CAM.userT += dt;
        var c = player.car, speed = Math.abs(c ? c.u : 0);
        var want = player.yaw + PI;
        // reversing hard: still behind the truck's tail, not its nose
        if (CAM.userT > 1.6 || !CAMV.init) face(CAM, want, CAMV.init ? 1 - Math.exp(-(player.ko ? 0.4 : 3.2) * dt) : 1);
        CAMV.init = true;
        // behind the truck's middle by the world's distance, above it by its height
        // and more; looking at the floor ahead of it, where the next hit comes from
        var d = fl ? clamp(fl.distance, -20, 20) : CAM.dist + speed * 0.05, hgt = fl ? fl.height : CAM.h;
        // a phone held upright sees a narrow slice: further back and higher, so the truck and the floor ahead both fit
        var tall = camera.aspect < 1 && !fl ? clamp(1 / camera.aspect, 1, 2.3) - 1 : 0; d *= 1 + tall * 0.55; hgt += tall * 2.2;
        var f = fwdOf(player), cp = Math.cos(CAM.pitch), side = fl ? fl.side || 0 : 0;
        var x = player.x + Math.sin(CAM.yaw) * cp * d + Math.cos(CAM.yaw) * side, z = player.z + Math.cos(CAM.yaw) * cp * d - Math.sin(CAM.yaw) * side;
        var tx = player.x + (fl ? 0 : f.x * 6), tz = player.z + (fl ? 0 : f.z * 6), ty = player.y + (fl ? clamp(fl.look, 0.5, 4) : 1.6);
        var y = fl ? ty + hgt - 1.4 + Math.sin(CAM.pitch) * d * 0.6 : player.y + hgt + 1.4 + Math.sin(CAM.pitch) * d * 0.4;
        // the stands are behind the wall: the camera stays over the floor, rising if it must
        var R = DERBY.arena, e = Math.hypot((x - R.x) / R.rx, (z - R.z) / R.rz), lim = 1 + 2.5 / Math.min(R.rx, R.rz);
        if (e > lim && !fl) { x = R.x + (x - R.x) * lim / e; z = R.z + (z - R.z) * lim / e; y += (e - lim) * 10; }
        if (!CAM.init) { CAM.pos.set(x, y, z); CAM.look.set(tx, ty, tz); CAM.init = true; }
        CAM.pos.lerp(camTmp.set(x, y, z), 1 - Math.exp(-9 * dt)); CAM.look.lerp(camTmp.set(tx, ty, tz), 1 - Math.exp(-12 * dt));
        camera.position.copy(CAM.pos);
        CAM.shake = Math.max(0, CAM.shake - dt * 2.8);
        if (CAM.shake > 0) camera.position.add(camTmp.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(CAM.shake * 0.22));
        camera.lookAt(CAM.look);
        var fov = fl ? fl.fov : (Number(fc.fov) || 58) + clamp(speed - 8, 0, 18) * 0.35;
        if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
      }

      /* ------------------------------------------------- HUD and input -- */
      function derbySetup() {
        root.classList.add('derby');
        // on a phone the guns' heat is a short bar in the armour chip, not a row of its own
        var css = document.createElement('style');
        css.textContent = '#gm.touch.derby .ow .wp{flex-basis:auto;width:58px;margin:0}#gm.touch.derby .ow .wp b{display:none}';
        document.head.appendChild(css);
        // for the checks and the films: a crew car placed ahead of you (still: it does not drive),
        // and the truck's own keys held from outside
        OW.debug.car = function (kind, ahead, side, turn, still) {
          if (!player) return null;
          var f = fwdOf(player), lx = -f.z, lz = f.x, k = KIND[kind] ? kind : 'thug';
          var a = spawnKind(k, { x: player.x + f.x * (+ahead || 12) + lx * (+side || 0), z: player.z + f.z * (+ahead || 12) + lz * (+side || 0) });
          if (!a) return null;
          a.yaw = player.yaw + (+turn || 0); a.vx = a.vz = 0; a.w = 0;
          if (still) a.car.ai = null;
          return { kind: a.kind, name: a.name, armor: a.hp };
        };
      }
      // the guns' heat in the weapon's row: amber, red when locked
      function derbyHud() {
        if (!DERBY.guns || !player || !player.car) return;
        var wp = hudHp.querySelector('.wp'), c = player.car;
        wp.style.display = 'flex';
        var k = (c.hot ? 'h' : 'c') + Math.round(c.heat * 20);
        if (wp.dataset.k === k) return;
        wp.dataset.k = k;
        wp.querySelector('b').textContent = c.hot ? 'HOT' : 'GUNS';
        var bar = wp.querySelector('span i'); bar.style.width = Math.round(c.heat * 100) + '%';
        bar.style.background = c.hot ? '#FF4040' : c.heat > 0.7 ? '#FF9A2E' : '#FFD34D';
      }
      // the radar's floor: the arena wall
      function derbyRadar(P, k) {
        var R = DERBY.arena; rg.strokeStyle = 'rgba(255,255,255,.35)'; rg.lineWidth = 2; rg.beginPath();
        for (var i = 0; i <= 48; i++) { var a = i / 48 * TAU, p = P(R.x + Math.cos(a) * R.rx, R.z + Math.sin(a) * R.rz); if (i) rg.lineTo(p[0], p[1]); else rg.moveTo(p[0], p[1]); }
        rg.stroke(); void k;
      }
      // the keys: J, F, X or a held click fire; Space is the handbrake; Shift boosts (open.js reads the rest)
      function derbyKey(e, down) {
        var c = e.code;
        if (c === 'KeyJ' || c === 'KeyF' || c === 'KeyX') { if (down) e.preventDefault(); IN.fire = down && state === 'race'; return true; }
        if (c === 'Space' || c === 'KeyK' || c === 'KeyC') { if (down) e.preventDefault(); IN.hand = down && state === 'race'; return true; }
        return false;
      }
      // touch: the stick steers and drives (up for gas, down to brake and reverse);
      // the far right is the derby's own: BOOST, BRAKE (the handbrake), FIRE
      function derbyTouch() {
        tbtn('BOOST', '', function (on) { IN.sprint = on; });
        tbtn('BRAKE', '', function (on) { IN.hand = on; });
        tbtn('FIRE', 'big', function (on) { IN.fire = on && state === 'race'; });
        var none = document.createElement('button'); none.style.display = 'none';
        return none;
      }
      // where a crew car comes in: a gate out of your sight, or anywhere open and away from you
      function derbySpot(cx, cz, r0, r1) {
        var R = DERBY.arena, px = player ? player.x : cx, pz = player ? player.z : cz;
        var free = DERBY.gates.filter(function (g) { return Math.hypot(g.x - px, g.z - pz) > 24 && !actors.some(function (a) { return a.car && !a.ko && Math.hypot(a.x - g.x, a.z - g.z) < 7; }); });
        if (free.length && r0 == null) return free[Math.floor(Math.random() * free.length)];
        for (var k = 0; k < 40; k++) {
          var a = Math.random() * TAU, r = (r0 || 20) + Math.random() * ((r1 || 40) - (r0 || 20)), x = cx + Math.sin(a) * r, z = cz + Math.cos(a) * r;
          if (Math.hypot((x - R.x) / (R.rx - 6), (z - R.z) / (R.rz - 6)) > 1) continue;
          if (actors.some(function (b) { return b.car && Math.hypot(b.x - x, b.z - z) < 6; })) continue;
          return { x: x, z: z };
        }
        return { x: R.x + (Math.random() - 0.5) * R.rx, z: R.z + (Math.random() - 0.5) * R.rz };
      }
      function derbyReset() {
        var c = player.car; if (!c) return;
        player.vx = player.vz = 0; player.w = 0; c.u = 0; c.steer = 0; c.zones = { f: 0, r: 0, l: 0, rt: 0 }; c.spin = null; c.lastHit = null; c.wreck = false;
        c.heat = 0; c.hot = false; c.loose = 0; c.S.wrecked = false; c.S.damage = 0; c.inp = { thr: 0, steer: 0, hand: false, boost: false };
        IN.fire = false; IN.hand = false; PILOT = null; CAMV.init = false;
        DERBY.bullets.forEach(function (b) { b.tr.visible = false; }); DERBY.bullets.length = 0;
        DERBY.spins = 0; DERBY.wrecks = 0;
      }
      // engines: yours up front, the two nearest crew cars panned to where they are
      function derbyEngines() {
        if (!audio || !audio.voices || typeof GameMogVehicles === 'undefined') return;
        var V = audio.voices, silent = demo || state === 'results' || state === 'paused' || state === 'title';
        function voice(slot, type) {
          var v = V[slot];
          if (v && v.type !== type) { v.stop(); v = null; }
          if (!v) { try { v = V[slot] = GameMogVehicles.engine(audio.ctx, audio.engines, type); } catch (e) { return null; } }
          return v;
        }
        if (silent) { V.forEach(function (v) { if (v) v.mix(0, 0); }); return; }
        if (player && player.e.vehicle) {
          var veh = player.e.vehicle, st = veh.state, pv = voice(0, veh.engine);
          if (pv) {
            var dead = player.ko;
            pv.set(dead ? veh.idle * 0.5 : st.rpm, dead ? 0 : st.throttle, Math.abs(player.car.u));
            var rf = clamp((st.rpm - veh.idle) / (veh.redline - veh.idle), 0, 1);
            pv.mix(dead ? 0 : 0.4 + 0.5 * Math.max(rf * (0.55 + 0.45 * st.throttle), 0.12), 0);
          }
        }
        var near = actors.filter(function (a) { return a.car && a !== player && !a.ko && a.e.vehicle; })
          .map(function (a) { return { a: a, d: player ? dist(a, player) : 0 }; }).sort(function (p, q) { return p.d - q.d; }).slice(0, 2);
        for (var i = 0; i < 2; i++) {
          var q = near[i], v = q ? voice(i + 1, q.a.e.vehicle.engine) : V[i + 1];
          if (!v) continue;
          if (!q) { v.mix(0, 0); continue; }
          var rel = toLocal(player, q.a.x, q.a.z), ve = q.a.e.vehicle;
          v.set(ve.state.rpm || 3000, 0.8, Math.abs(q.a.car.u));
          v.mix(Math.pow(clamp(1 - q.d / 70, 0, 1), 1.6) * 0.75, clamp(-rel.x / 14, -0.9, 0.9));
        }
      }
