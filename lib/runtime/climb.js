      /* ======================================================== levels == */
      // Included into openWorld() in open.js at its marker, so it shares the open
      // world's closure: the player, W's boxes, groundAt, steer. A world with
      // open.traversal (trav.js; the owner, 2 Oct: Zcity) is a world of levels:
      // every box collider is a building whose roof is ground to stand and fight
      // on. Everyone stands on whatever is under them and falls off what they
      // walk off; the climbers (open.crew.<kind>.climb, the share of that crew
      // who climb) go up a wall after a hero who has gone up one, the rest wait
      // at its foot, and a shooter shoots up at him. The hero's own moves are
      // the traversal's; it keeps TRV (below) told where he is.
      var CLIMB = O.traversal ? { gravity: 22 } : null;
      // the level the hero is on: 'ground' (a street or a roof), 'climb' (on the wall of TRV.wall.b) or 'air'
      var TRV = { mode: 'ground', y: 0, vx: 0, vy: 0, vz: 0, wall: null };
      function climbOn() { return !!CLIMB && !!player && !DERBY; }
      function climbReset() { TRV.mode = 'ground'; TRV.vx = TRV.vy = TRV.vz = 0; TRV.wall = null; TRV.y = player ? floorAt(player.x, player.z, player.y + 0.2) : 0; PL.air = 0; }

      // the highest roof under (x, z) that is no higher than y: the ground you stand on
      function topAt(x, z, below) {
        var g = cellAt(x, z), best = -Infinity; if (!g) return best;
        for (var i = 0; i < g.b.length; i++) { var b = g.b[i]; if (x >= b.min.x && x <= b.max.x && z >= b.min.z && z <= b.max.z && b.max.y <= below && b.max.y > best) best = b.max.y; }
        return best;
      }
      function floorAt(x, z, y) { return Math.max(groundAt(x, z), topAt(x, z, y + 0.4)); }
      function boxUnder(x, z, y) {
        var g = cellAt(x, z); if (!g) return null;
        for (var i = 0; i < g.b.length; i++) { var b = g.b[i]; if (x >= b.min.x && x <= b.max.x && z >= b.min.z && z <= b.max.z && Math.abs(b.max.y - y) < 0.5) return b; }
        return null;
      }
      // the level the hero is on, and the building it belongs to: his roof, or the one he is climbing
      function playerLevel() {
        if (TRV.mode === 'climb' && TRV.wall) return { y: TRV.wall.b.max.y, b: TRV.wall.b };
        var y = TRV.mode === 'ground' ? TRV.y : floorAt(player.x, player.z, TRV.y);
        return { y: y, b: boxUnder(player.x, player.z, y) };
      }
      function climbFoe(a, dt) {
        if (a.fy == null) a.fy = a.y;
        if (a.climber == null) a.climber = Math.random() < (a.sp.climb || 0);
        var P = player, sp = a.sp;
        if (a.wall) {
          // on a wall: up it, hand over hand; a blow knocks them off
          var w = a.wall, b = w.b;
          if (a.hurtT < 0.05 || P.ko) { a.wall = null; a.kx += w.nx * 3; a.kz += w.nz * 3; return false; }
          a.fy += (2.1 + Math.min(1.6, DIR.heat * 0.14)) * dt; a.climbT += dt; a.speed = 0;
          var cx = clamp(a.x, b.min.x, b.max.x), cz = clamp(a.z, b.min.z, b.max.z);
          a.x = cx + w.nx * (a.r + 0.03); a.z = cz + w.nz * (a.r + 0.03); a.yaw = Math.atan2(-w.nx, -w.nz);
          if (a.fy + 1.2 >= b.max.y) { a.fy = b.max.y; a.x = cx - w.nx * 0.8; a.z = cz - w.nz * 0.8; a.wall = null; a.stun = 0.3; a.state = 'chase'; }
          return true;
        }
        if (a.stun > 0 || P.ko || a.fall != null) return a.fall != null;
        var lv = playerLevel(), dy = lv.y - a.fy;
        if (Math.abs(dy) < 1.6) return false;
        if (a.token) { a.token = false; tokens = Math.max(0, tokens - 1); }
        a.state = 'chase'; a.stance = a.weapon ? 'guard' : 'fight';
        var tx, tz, want;
        if (dy < 0) {
          // above him: straight at him, off the edge if that is the way
          tx = P.x; tz = P.z; want = sp.speed;
        } else {
          if (sp.ranged && !a.climber) return false;
          var b2 = lv.b; if (!b2) return false;
          var cx2 = clamp(a.x, b2.min.x, b2.max.x), cz2 = clamp(a.z, b2.min.z, b2.max.z), ex = a.x - cx2, ez = a.z - cz2, e = Math.hypot(ex, ez);
          if (e < 1e-3) return false;
          var nx = ex / e, nz = ez / e;
          // at the foot of the wall: a climber goes up it
          if (a.climber && e < a.r + 0.75 && b2.max.y - a.fy > 1.3) { a.wall = { b: b2, nx: nx, nz: nz }; a.climbT = 0; a.speed = 0; a.act = null; return true; }
          // the rest crowd the foot of it, spread along the wall, looking up
          var spread = a.climber ? 0 : ((a.id % 5) - 2) * 1.4, off = a.climber ? a.r + 0.1 : 1.6 + (a.id % 3) * 0.7;
          tx = clamp(cx2 - nz * spread, b2.min.x, b2.max.x) + nx * off; tz = clamp(cz2 + nx * spread, b2.min.z, b2.max.z) + nz * off;
          want = sp.speed * (e > 10 ? 1.1 : 0.9);
        }
        var wp = steer(a, tx, tz), mx = wp.x - a.x, mz = wp.z - a.z, md = Math.hypot(mx, mz);
        if (md < 0.35) want = 0; else { mx /= md; mz /= md; }
        face(a, want > 0 ? Math.atan2(mx, mz) : yawTo(a, P.x, P.z), 1 - Math.exp(-8 * dt));
        a.speed = damp(a.speed, want * wade(a), 8, dt);
        if (want > 0) { a.mdir = Math.atan2(mx, mz); a.x += mx * a.speed * dt; a.z += mz * a.speed * dt; }
        return true;
      }
      // where they stand: a fall when nothing is under them, a stumble at the bottom of a long one
      function foeY(a, dt) {
        if (a.fy == null) a.fy = a.y;
        if (a.wall) return a.fy;
        var fl = floorAt(a.x, a.z, a.fy);
        if (a.fy > fl + 0.05) {
          if (a.fall == null) { a.fall = a.fy; a.fvy = 0; }
          a.fvy -= CLIMB.gravity * dt; a.fy = Math.max(fl, a.fy + a.fvy * dt);
        } else a.fy = fl - a.fy > 0.6 ? fl : damp(a.fy, fl, 16, dt);
        if (a.fall != null && a.fy <= fl + 0.01) { var h = a.fall - a.fy; a.fall = null; a.fvy = 0; if (h > 4 && !a.ko) { a.stun = Math.max(a.stun, 0.5 + Math.min(1, h * 0.04)); play(a, 'hit', 1.2); } }
        return a.fy;
      }

      /* ---- a climber on its wall, posed hand over hand by IK ---- */
      function foePose(a) {
        if (!a.wall || a.creature) return;
        if (a.rig === undefined) {
          a.rig = rigFor(a);
          if (a.rig) { var base = a.e.animate, self = a; a.e.animate = function (t, dt, s) { base(t, dt, s); if (self.wall && self.rig) { try { self.rig.ph += dt * 5; climbPose(self, self.rig, self.rig.ph); } catch (err) { self.rig = null; } } }; }
        }
      }
      // a human body's bones, and where they rest
      function rigFor(a) {
        if (!a.e.object) return null;
        var bones = {}; a.e.object.traverse(function (b) { if (b.isBone) bones[b.name] = b; });
        if (!bones.upperarm01_L || !bones.upperleg01_L) return null;
        var A0 = ASSETS[a.body] || ASSETS[cfg.body] || ASSETS['human-athlete-male']; if (!A0 || !A0.json || !A0.json.skeleton) return null;
        var REST = {}; A0.json.skeleton.forEach(function (b) { REST[b.name.replace(/\./g, '_')] = new THREE.Vector3().fromArray(b.head); });
        if (!REST.lowerarm01_L || !REST.wrist_L || !REST.lowerleg01_L || !REST.foot_L) return null;
        return { bones: bones, REST: REST, ph: Math.random() * 6 };
      }
      var _QR = new THREE.Quaternion(), _QP = new THREE.Quaternion(), _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m0 = new THREE.Matrix4(), _m1 = new THREE.Matrix4();
      var _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _el = new THREE.Vector3();
      function climbPose(a, P, ph) {
        var hroot = a.e.object; hroot.updateMatrixWorld(true);
        var s = hroot.scale.x, B = P.bones, R = P.REST;
        function lw(x, y, z) { return a.g.localToWorld(_v3.set(x, y, z)).clone(); }
        function aim(b, restDir, restUp, dirW, upW) {
          hroot.getWorldQuaternion(_QR);
          KIT.basis(_v1.copy(restDir).normalize().applyQuaternion(_QR), _v2.copy(restUp).applyQuaternion(_QR), _m0);
          KIT.basis(dirW.clone().normalize(), upW, _m1);
          _q1.setFromRotationMatrix(_m1).multiply(_q2.setFromRotationMatrix(_m0).invert()).multiply(_QR);
          b.parent.getWorldQuaternion(_QP); b.quaternion.copy(_QP.invert().multiply(_q1)); b.updateMatrixWorld(true);
        }
        var FWD = new THREE.Vector3(0, 0, 1), BACK = new THREE.Vector3(0, 0, -1);
        function limb(top, mid, end, target, poleW, restUp) {
          var t0 = B[top].getWorldPosition(new THREE.Vector3()), l1 = B[mid].getWorldPosition(new THREE.Vector3()).distanceTo(t0), l2 = B[end].getWorldPosition(new THREE.Vector3()).distanceTo(B[mid].getWorldPosition(new THREE.Vector3()));
          KIT.ik(t0, target, l1, l2, poleW, _el);
          aim(B[top], R[mid].clone().sub(R[top]), restUp, _el.clone().sub(t0), poleW);
          var mW = B[mid].getWorldPosition(new THREE.Vector3());
          aim(B[mid], R[end].clone().sub(R[mid]), restUp, target.clone().sub(mW), poleW);
        }
        function dirW(x, y, z) { return _v3.set(x, y, z).transformDirection(a.g.matrixWorld).clone(); }
        // hands reaching up the wall in turn, feet pushing below them
        var r1 = Math.sin(ph), r2 = Math.sin(ph + PI), hy = 1.62 + 0.04 * s;
        limb('upperarm01_L', 'lowerarm01_L', 'wrist_L', lw(0.22, hy + 0.2 + 0.2 * r1, 0.33), dirW(0.6, -0.6, -0.4), BACK);
        limb('upperarm01_R', 'lowerarm01_R', 'wrist_R', lw(-0.22, hy + 0.2 + 0.2 * r2, 0.33), dirW(-0.6, -0.6, -0.4), BACK);
        limb('upperleg01_L', 'lowerleg01_L', 'foot_L', lw(0.15, 0.32 + 0.22 * Math.max(0, r2), 0.3), dirW(0.3, 0.2, 1), FWD);
        limb('upperleg01_R', 'lowerleg01_R', 'foot_R', lw(-0.15, 0.32 + 0.22 * Math.max(0, r1), 0.3), dirW(-0.3, 0.2, 1), FWD);
      }
