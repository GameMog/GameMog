    /* ======================================== penalty shootout: the near goal, its net and the ball (lane B, THREE) == */
    // SHOOTOUT M1, lane B. Pasted into boot() by shootout.js (after shootout-sim.js); ONE top-level binding, shootGoal.
    // Reads the runtime's closure as kart.js does: THREE, scene, canvasTexture, envify, quality; and ShootSim (the goal's
    // planes and capsules come from ShootSim.geom, so what is drawn is what the ball meets).
    //   goal = shootGoal({ style: { frame, net }, parent?, quality?, trail? })
    //   goal.update(simState, dt, alpha?)  the ball (lerped p0 -> p by alpha, spin slerped q0 -> q), its contact shadow and
    //                                      trail, the net's bulge and ripple: a PURE function of the sim's state, so a
    //                                      replay drawn from recorded states draws the same net
    //   goal.bulge(net) / goal.reset() / goal.visible(on) / goal.debug() / goal.dispose(); goal.ball, goal.group
    // The net is drawn, never simulated: a vertex shader pushes the net out along the contact's normal by the sim's depth
    // (a gaussian, sigma 0.45 + 0.8 depth) and lays a decaying ripple from the last contact (design 3.5). No particles,
    // no springs between vertices, no solver. The look is the look-dev's: thin cords in an alpha grid, a veil near the lens.
    function shootGoal(opts) {
      var o = opts || {}, style = o.style || {}, Q = o.quality || (typeof quality !== 'undefined' ? quality : 'high'), low = Q === 'low';
      var SC = ShootSim.C, GM = ShootSim.geom(o.goal), g = GM.g, GZ = GM.GZ, X = GM.X, Y = GM.Y, D0 = GM.D0, D1 = GM.D1, BR = SC.R;
      var PI = Math.PI, group = new THREE.Group(); group.name = 'shootout goal';
      var keep = { geo: [], mat: [], tex: [] };
      function own(x, kind) { keep[kind].push(x); return x; }

      /* -------------------------------------------------------------------- the frame: posts, bar, stanchions -- */
      // one merged mesh (one draw call, one shadow caster); white, a clear coat, as the look-dev
      function merge(parts) {
        var pos = [], nor = [], uv = [];
        parts.forEach(function (pm) {
          var gg = pm[0].index ? pm[0].toNonIndexed() : pm[0]; gg.applyMatrix4(pm[1]);
          var P = gg.attributes.position.array, N = gg.attributes.normal.array, U = gg.attributes.uv ? gg.attributes.uv.array : null, i;
          for (i = 0; i < P.length; i++) { pos.push(P[i]); nor.push(N[i]); }
          for (i = 0; i < P.length / 3; i++) { uv.push(U ? U[i * 2] : 0, U ? U[i * 2 + 1] : 0); }
          if (gg !== pm[0]) gg.dispose(); pm[0].dispose();
        });
        var m = new THREE.BufferGeometry();
        m.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); m.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); m.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        m.computeBoundingSphere();
        return m;
      }
      var M4 = function (x, y, z, rz) { var m = new THREE.Matrix4(); if (rz) m.makeRotationZ(rz); m.setPosition(x, y, z); return m; };
      var pr = g.postR, px = g.postX, bc = g.barC, seg = low ? 12 : 20, H = bc + pr;
      var frameGeo = own(merge([
        [new THREE.CylinderGeometry(pr, pr, H, seg), M4(-px, H / 2, GZ)],
        [new THREE.CylinderGeometry(pr, pr, H, seg), M4(px, H / 2, GZ)],
        [new THREE.CylinderGeometry(pr, pr, px * 2 + pr * 2, seg), M4(0, bc, GZ, PI / 2)],
        [new THREE.CylinderGeometry(g.stanR, g.stanR, Y, 8), M4(-g.stanX, Y / 2, GZ - D0)],
        [new THREE.CylinderGeometry(g.stanR, g.stanR, Y, 8), M4(g.stanX, Y / 2, GZ - D0)],
      ]), 'geo');
      var frameMat = own(low ? new THREE.MeshStandardMaterial({ color: style.frame || '#F6F6F4', roughness: 0.35, metalness: 0 })
        : new THREE.MeshPhysicalMaterial({ color: style.frame || '#F6F6F4', roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.2 }), 'mat');
      var frame = new THREE.Mesh(frameGeo, frameMat); frame.name = 'goal frame'; frame.castShadow = true; frame.receiveShadow = true;
      group.add(frame);

      /* ------------------------------------------------------------------------------------------ the net -- */
      // four pieces in one indexed geometry, in world space (the group sits at the origin): roof, back, two sides.
      // Per vertex: the rest position (the look-dev's sag baked in), uv in metres/0.12 over a 4x4-cord tile (the look-
      // dev's density), restN (the piece's outward normal), and gmPin: x = pin, 0 on the RIGID frame (posts, bar,
      // stanchions) and 1 from PIN away (a bulge never tears the net off its frame); y = hug, 0 on the turf (the net's
      // slack foot slides along the ground under a push, it never lifts). Both are functions of the world position, so
      // a seam's two copies of a vertex always move together.
      var PIN = 0.3, NP = [], NN = [], NU = [], NPin = [], NI = [], vbase = 0;
      function ss(e0, e1, x) { var u = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return u * u * (3 - 2 * u); }
      var RIGID = [[-X, 0, GZ, -X, Y, GZ], [X, 0, GZ, X, Y, GZ], [-X, Y, GZ, X, Y, GZ], [-X, 0, GZ - D0, -X, Y, GZ - D0], [X, 0, GZ - D0, X, Y, GZ - D0]];
      function rigidDist(p) {
        var best = 1e9;
        for (var i = 0; i < RIGID.length; i++) {
          var r = RIGID[i], ux = r[3] - r[0], uy = r[4] - r[1], uz = r[5] - r[2], uu = ux * ux + uy * uy + uz * uz;
          var t = Math.min(1, Math.max(0, ((p[0] - r[0]) * ux + (p[1] - r[1]) * uy + (p[2] - r[2]) * uz) / uu));
          best = Math.min(best, Math.hypot(p[0] - r[0] - ux * t, p[1] - r[1] - uy * t, p[2] - r[2] - uz * t));
        }
        return best;
      }
      function piece(nu, nv, at) {
        // at(u, v) -> { p:[x,y,z], n:[x,y,z] outward, uv:[u,v] }
        for (var j = 0; j <= nv; j++) for (var i = 0; i <= nu; i++) {
          var r = at(i / nu, j / nv);
          NP.push(r.p[0], r.p[1], r.p[2]); NN.push(r.n[0], r.n[1], r.n[2]); NU.push(r.uv[0], r.uv[1]);
          NPin.push(ss(0, PIN, rigidDist(r.p)), ss(0, 0.25, r.p[1]));
        }
        for (j = 0; j < nv; j++) for (i = 0; i < nu; i++) {
          var a = vbase + j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
          NI.push(a, c, b, b, c, d);
        }
        vbase += (nu + 1) * (nv + 1);
      }
      var SAG_ROOF = -0.10, SAG_BACK = 0.12, BL = Math.hypot(Y, D1 - D0), BN = [0, (D1 - D0) / BL, -Y / BL];   // the back's outward normal
      function sagRoof(x, z) { return SAG_ROOF * Math.sin(PI * (x + X) / (2 * X)) * Math.sin(PI * (GZ - z) / D0); }
      function sagBack(x, s) { return SAG_BACK * Math.sin(PI * (x + X) / (2 * X)) * Math.sin(PI * s / BL); }
      var RS = low ? [32, 6] : [48, 10], BS = low ? [32, 14] : [48, 20], SS = low ? [10, 14] : [16, 20];
      // the roof: y = Y over z in [GZ - D0, GZ]; outward +y; it droops 0.10 into the goal
      piece(RS[0], RS[1], function (u, v) {
        var x = -X + 2 * X * u, z = GZ - D0 * v, s = sagRoof(x, z);
        return { p: [x, Y + s, z], n: [0, 1, 0], uv: [(x + X) / 0.12, (GZ - z) / 0.12] };
      });
      // the back: from the roof's back edge (y Y, z GZ - D0) down to the turf (y 0, z GZ - D1); it billows 0.12 out
      piece(BS[0], BS[1], function (u, v) {
        var x = -X + 2 * X * u, s = BL * v, y = Y - Y * v, z = GZ - D0 - (D1 - D0) * v, b = sagBack(x, s);
        return { p: [x, y + BN[1] * b, z + BN[2] * b], n: BN, uv: [(x + X) / 0.12, s / 0.12] };
      });
      // the sides: x = -+X, from the post back to the sloping back edge, the turf to the roof; outward -+x
      [-1, 1].forEach(function (sx) {
        piece(SS[0], SS[1], function (u, v) {
          var y = Y * v, zb = GZ - D1 + (D1 - D0) * v, z = GZ - (GZ - zb) * u;
          return { p: [sx * X, y, z], n: [sx, 0, 0], uv: [(GZ - z) / 0.12, y / 0.12] };
        });
      });
      var netGeo = own(new THREE.BufferGeometry(), 'geo');
      netGeo.setAttribute('position', new THREE.Float32BufferAttribute(NP, 3));
      netGeo.setAttribute('normal', new THREE.Float32BufferAttribute(NN, 3));
      netGeo.setAttribute('restN', new THREE.Float32BufferAttribute(NN.slice(), 3));
      netGeo.setAttribute('uv', new THREE.Float32BufferAttribute(NU, 2));
      netGeo.setAttribute('gmPin', new THREE.Float32BufferAttribute(NPin, 2));
      netGeo.setIndex(NI);
      netGeo.computeBoundingSphere(); netGeo.boundingSphere.radius += 0.8;   // (room for the bulge, or the frustum culls it)
      var TS = low ? 256 : 512, LW = low ? 3.5 : 7;
      var netTex = own(canvasTexture(TS, TS, function (c, w, h) {
        c.clearRect(0, 0, w, h); c.strokeStyle = '#FFFFFF'; c.lineWidth = LW; c.lineCap = 'round';
        for (var i = 0; i <= 4; i++) { c.beginPath(); c.moveTo(i * w / 4, 0); c.lineTo(i * w / 4, h); c.stroke(); c.beginPath(); c.moveTo(0, i * h / 4); c.lineTo(w, i * h / 4); c.stroke(); }
      }), 'tex');
      var NU0 = {
        gmAt: { value: new THREE.Vector3(0, -100, 0) }, gmN: { value: new THREE.Vector3(0, 0, -1) }, gmPush: { value: 0 }, gmSig: { value: 0.45 },
        gmRipAt: { value: new THREE.Vector3(0, -100, 0) }, gmRipT: { value: -1 }, gmRipA: { value: 0 },
      };
      var netMat = own(new THREE.MeshStandardMaterial({ color: style.net || '#F2F2F2', alphaMap: netTex, transparent: true, depthWrite: false, opacity: 0.8, side: THREE.DoubleSide, roughness: 0.9, metalness: 0 }), 'mat');
      netMat.onBeforeCompile = function (sh) {
        for (var k in NU0) sh.uniforms[k] = NU0[k];
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nattribute vec2 gmPin; attribute vec3 restN;\nuniform vec3 gmAt; uniform vec3 gmN; uniform float gmPush; uniform float gmSig; uniform vec3 gmRipAt; uniform float gmRipT; uniform float gmRipA;')
          .replace('#include <begin_vertex>', [
            '#include <begin_vertex>',
            // the bulge: along the contact's normal, a gaussian round the contact (object space is world space here)
            ' float gmR = distance(transformed, gmAt);',
            ' float gmB = gmPush * exp(-gmR * gmR / (2.0 * gmSig * gmSig));',
            // the ripple: from the last contact, spreading at 25/12 m/s, decaying over 0.4 s
            ' float gmRr = distance(transformed, gmRipAt);',
            ' float gmW = gmRipT < 0.0 ? 0.0 : gmRipA * exp(-gmRipT / 0.4) * sin(12.0 * gmRr - 25.0 * gmRipT) * exp(-gmRr / 1.5) * smoothstep(-0.25, 0.05, 2.0833 * gmRipT - gmRr);',
            ' vec3 gmDisp = gmPin.x * (gmN * gmB + restN * gmW); gmDisp.y *= gmPin.y;',
            ' transformed += gmDisp;',
          ].join('\n'));
        // a net close to the lens is out of focus: a faint veil, not a fence (the look-dev's)
        sh.fragmentShader = sh.fragmentShader.replace('#include <alphamap_fragment>', '#include <alphamap_fragment>\n diffuseColor.a *= mix(0.2, 1.0, smoothstep(1.2, 6.0, length(vViewPosition)));');
      };
      netMat.customProgramCacheKey = function () { return 'shootout-net-2'; };
      var net = new THREE.Mesh(netGeo, netMat); net.name = 'goal net'; net.castShadow = false; net.receiveShadow = false; net.renderOrder = 2;
      group.add(net);

      /* ------------------------------------------------------------------------------------------ the ball -- */
      // an original panel design (the look-dev's): navy and gold blades, a red seam
      var bw = low ? 512 : 1024, ballTex = own(canvasTexture(bw, bw / 2, function (c, w, h) {
        var k = w / 1024;
        c.fillStyle = '#F7F6F2'; c.fillRect(0, 0, w, h);
        for (var i = 0; i < 6; i++) {
          var cx = (i + 0.5) / 6 * w, cy = h * (i % 2 ? 0.34 : 0.66);
          c.fillStyle = i % 2 ? '#C9A24A' : '#16233F'; c.beginPath();
          c.moveTo(cx - 70 * k, cy); c.bezierCurveTo(cx - 40 * k, cy - 120 * k, cx + 60 * k, cy - 90 * k, cx + 80 * k, cy - 10 * k); c.bezierCurveTo(cx + 50 * k, cy + 60 * k, cx - 20 * k, cy + 40 * k, cx - 70 * k, cy); c.fill();
          c.strokeStyle = '#B3122E'; c.lineWidth = 6 * k; c.beginPath(); c.moveTo(cx - 60 * k, cy + 20 * k); c.quadraticCurveTo(cx, cy + 80 * k, cx + 70 * k, cy + 30 * k); c.stroke();
        }
      }), 'tex');
      ballTex.wrapS = THREE.RepeatWrapping; ballTex.wrapT = THREE.ClampToEdgeWrapping;
      var ballMat = own(low ? new THREE.MeshStandardMaterial({ map: ballTex, roughness: 0.42 })
        : new THREE.MeshPhysicalMaterial({ map: ballTex, roughness: 0.42, clearcoat: 0.7, clearcoatRoughness: 0.25 }), 'mat');
      var ball = new THREE.Mesh(own(new THREE.SphereGeometry(BR, low ? 28 : 40, low ? 16 : 24), 'geo'), ballMat);
      ball.name = 'ball'; ball.castShadow = true; ball.receiveShadow = true;
      group.add(ball);
      // its contact shadow: a soft dark disc on the turf that grows and fades as it rises (the floodlights' shadow map is
      // coarse at the ball's size). The falloff is in the vertices' alphas (no texture). The ball hides the disc's
      // middle, so the falloff stays dark out past the ball's edge (63% there) and fades by 0.25 m: an occlusion contact,
      // not a stain (measured by pixel read-back in the lab, 11 Oct)
      var BRING = [[0, 1], [0.45, 0.9], [0.75, 0.45], [1, 0]], BSEG = low ? 16 : 24, bp = [], bc = [], bi = [];
      for (var ri = 0; ri < BRING.length; ri++) for (var si = 0; si < BSEG; si++) {
        var ang = si / BSEG * 2 * PI, rr = BRING[ri][0] * 0.5;
        bp.push(Math.cos(ang) * rr, 0, Math.sin(ang) * rr); bc.push(0, 0, 0, BRING[ri][1]);
      }
      for (ri = 0; ri < BRING.length - 1; ri++) for (si = 0; si < BSEG; si++) {
        var q0 = ri * BSEG + si, q1 = ri * BSEG + (si + 1) % BSEG, q2 = q0 + BSEG, q3 = q1 + BSEG;
        bi.push(q0, q2, q1, q1, q2, q3);
      }
      var blobGeo = own(new THREE.BufferGeometry(), 'geo');
      blobGeo.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3)); blobGeo.setAttribute('color', new THREE.Float32BufferAttribute(bc, 4)); blobGeo.setIndex(bi);
      blobGeo.computeBoundingSphere();
      var blobMat = own(new THREE.MeshBasicMaterial({ color: '#FFFFFF', vertexColors: true, transparent: true, depthWrite: false, opacity: 0.7, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), 'mat');
      var blob = new THREE.Mesh(blobGeo, blobMat);
      blob.name = 'ball shadow'; blob.renderOrder = 1; blob.frustumCulled = false;
      group.add(blob);
      // its trail in flight (the look-dev's streak): faint, additive, only when it is fast
      var trail = null;
      if (o.trail !== false) {
        var tg = own(new THREE.CylinderGeometry(0.0, 0.06, 1.4, low ? 10 : 16, 1, true), 'geo'); tg.rotateX(PI / 2); tg.translate(0, 0, 0.7);
        trail = new THREE.Mesh(tg, own(new THREE.MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }), 'mat'));
        trail.name = 'ball trail'; trail.visible = false; trail.frustumCulled = false;
        group.add(trail);
      }

      (o.parent || scene).add(group);
      if (typeof envify === 'function') try { envify(group); } catch (e) { /* the environment scale is a nicety */ }

      /* ------------------------------------------------------------------------------------- per frame -- */
      var V = new THREE.Vector3(), QA = new THREE.Quaternion(), QB = new THREE.Quaternion(), ZF = new THREE.Vector3(0, 0, 1), DV = new THREE.Vector3();
      var DBG = { push: 0, at: [0, -100, 0], n: [0, 0, -1], sigma: 0.45, plane: null, ripT: -1, ripA: 0 };
      // the rest sag (outward) of a piece at a point on its plane
      function sagAt(id, p) {
        if (id === 'roof') return sagRoof(p[0], p[2]);
        if (id === 'back') { var s = Math.hypot(Y - p[1], (GZ - D0) - p[2]); return sagBack(p[0], s); }
        return 0;
      }
      function setBulge(at, n, push) {
        push = Math.max(0, push || 0);
        NU0.gmAt.value.set(at[0], at[1], at[2]); NU0.gmN.value.set(n[0], n[1], n[2]); NU0.gmPush.value = push; NU0.gmSig.value = 0.45 + 0.8 * push;
        DBG.push = push; DBG.at = at.slice(); DBG.n = n.slice(); DBG.sigma = NU0.gmSig.value;
      }
      function setRipple(at, tRel, amp) {
        NU0.gmRipAt.value.set(at[0], at[1], at[2]); NU0.gmRipT.value = tRel; NU0.gmRipA.value = amp;
        DBG.ripT = tRel; DBG.ripA = amp;
      }
      function update(S, dt, alpha) {
        if (!S) return;
        var a = alpha == null || !S.p0 ? 1 : Math.min(1, Math.max(0, alpha)), p = S.p, p0 = S.p0 || p;
        V.set(p0[0] + (p[0] - p0[0]) * a, p0[1] + (p[1] - p0[1]) * a, p0[2] + (p[2] - p0[2]) * a);
        ball.position.copy(V);
        if (S.q) { QB.set(S.q[0], S.q[1], S.q[2], S.q[3]); if (S.q0 && a < 1) { QA.set(S.q0[0], S.q0[1], S.q0[2], S.q0[3]); ball.quaternion.slerpQuaternions(QA, QB, a); } else ball.quaternion.copy(QB); }
        // the contact shadow
        var hgt = Math.max(0, V.y - BR), sc = BR * 4.6 * (1 + 0.9 * hgt);
        blob.position.set(V.x, 0.004, V.z); blob.scale.set(sc, 1, sc); blobMat.opacity = 0.7 * Math.exp(-hgt / 0.9);
        blob.visible = blobMat.opacity > 0.01;
        // the trail: behind the ball along its velocity, faint, only above 14 m/s and not in the net
        if (trail) {
          var v = S.v || [0, 0, 0], sp = Math.hypot(v[0], v[1], v[2]), on = sp > 14 && S.phase === 'flight';
          trail.visible = on;
          if (on) { DV.set(-v[0], -v[1], -v[2]).normalize(); trail.position.copy(V); trail.quaternion.setFromUnitVectors(ZF, DV); trail.scale.set(1, 1, Math.min(1, (sp - 10) / 14)); trail.material.opacity = 0.07 * Math.min(1, (sp - 14) / 6); }
        }
        // the bulge: from the ball itself whenever it is in the net (the drawn net has its sag; the sim's planes are flat):
        // the piece it presses deepest, pushed out to the ball's surface
        var best = null, bp = 0, bAt = null;
        if (S.inNet) {
          for (var i = 0; i < GM.planes.length; i++) {
            var P = GM.planes[i], n = P.n, d = (V.x - P.o[0]) * n[0] + (V.y - P.o[1]) * n[1] + (V.z - P.o[2]) * n[2];
            if (d > BR + 0.2) continue;
            var at = [V.x - n[0] * d, V.y - n[1] * d, V.z - n[2] * d], push = BR - d - sagAt(P.id, at);
            if (push > bp) { bp = push; best = P; bAt = at; }
          }
        }
        if (best) { setBulge(bAt, [-best.n[0], -best.n[1], -best.n[2]], bp); DBG.plane = best.id; }
        else { setBulge(DBG.at, DBG.n, 0); DBG.plane = null; }
        // the ripple: from the sim's last net contact, once it let go
        var N = S.net;
        if (N && N.plane && N.tRel >= 0 && !N.on && !N.outside) setRipple(N.at, N.tRel, 0.06 * Math.min(1, (N.peak || 0) / 0.25 + 0.15));
        else setRipple(N && N.at ? N.at : [0, -100, 0], -1, 0);
      }
      function reset() {
        ball.position.set(SC.spot[0], SC.spot[1], SC.spot[2]); ball.quaternion.identity();
        blob.position.set(SC.spot[0], 0.004, SC.spot[2]); blob.scale.set(BR * 4.6, 1, BR * 4.6); blobMat.opacity = 0.7; blob.visible = true;
        if (trail) trail.visible = false;
        setBulge([0, -100, 0], [0, 0, -1], 0); setRipple([0, -100, 0], -1, 0); DBG.plane = null;
      }
      reset();
      // the displacement a rest vertex gets (the vertex shader's, in JS): for checks that the drawn bulge meets the ball
      function displaced(p, pinV, restN, hug) {
        var u = NU0, dx = p[0] - u.gmAt.value.x, dy = p[1] - u.gmAt.value.y, dz = p[2] - u.gmAt.value.z, r2 = dx * dx + dy * dy + dz * dz;
        var b = u.gmPush.value * Math.exp(-r2 / (2 * u.gmSig.value * u.gmSig.value)), rr = Math.hypot(p[0] - u.gmRipAt.value.x, p[1] - u.gmRipAt.value.y, p[2] - u.gmRipAt.value.z), T = u.gmRipT.value;
        var e = Math.min(1, Math.max(0, (2.0833 * T - rr + 0.25) / 0.3)), w = T < 0 ? 0 : u.gmRipA.value * Math.exp(-T / 0.4) * Math.sin(12 * rr - 25 * T) * Math.exp(-rr / 1.5) * e * e * (3 - 2 * e);
        var pn = pinV == null ? 1 : pinV, rn = restN || [0, 0, 0], hg = hug == null ? 1 : hug;
        return [p[0] + pn * (u.gmN.value.x * b + rn[0] * w), p[1] + pn * (u.gmN.value.y * b + rn[1] * w) * hg, p[2] + pn * (u.gmN.value.z * b + rn[2] * w)];
      }
      return {
        group: group, ball: ball, frame: frame, net: net, blob: blob, trail: trail,
        update: update, reset: reset,
        // set the net's bulge straight from a sim net state ({ at, n (outward), depth, tRel, peak }), for tests
        bulge: function (nt) { if (!nt) { setBulge([0, -100, 0], [0, 0, -1], 0); setRipple([0, -100, 0], -1, 0); return; } setBulge(nt.at, nt.n, nt.depth); if (nt.tRel != null && nt.tRel >= 0 && !nt.on) setRipple(nt.at, nt.tRel, 0.06 * Math.min(1, (nt.peak || nt.depth || 0) / 0.25 + 0.15)); },
        visible: function (on) { group.visible = on !== false; },
        // the apex: the vertex of the drawn net nearest the bulge's centre, displaced, and the ball's surface point it meets
        debug: function () {
          var pos = netGeo.attributes.position.array, pa = netGeo.attributes.gmPin.array, rn = netGeo.attributes.restN.array, at = DBG.at, bi = -1, bd = 1e9, nv = pa.length / 2;
          for (var i = 0; i < nv; i++) { var d = Math.hypot(pos[i * 3] - at[0], pos[i * 3 + 1] - at[1], pos[i * 3 + 2] - at[2]); if (d < bd) { bd = d; bi = i; } }
          var apex = bi < 0 ? null : displaced([pos[bi * 3], pos[bi * 3 + 1], pos[bi * 3 + 2]], pa[bi * 2], [rn[bi * 3], rn[bi * 3 + 1], rn[bi * 3 + 2]], pa[bi * 2 + 1]);
          return { push: DBG.push, at: DBG.at, n: DBG.n, sigma: DBG.sigma, plane: DBG.plane, ripT: DBG.ripT, ripA: DBG.ripA, apex: apex, apexPin: bi < 0 ? null : pa[bi * 2], apexHug: bi < 0 ? null : pa[bi * 2 + 1], apexFrom: bd,
            ball: [ball.position.x, ball.position.y, ball.position.z], verts: nv };
        },
        displaced: displaced,
        dispose: function () {
          if (group.parent) group.parent.remove(group);
          keep.geo.forEach(function (x) { x.dispose(); }); keep.mat.forEach(function (x) { x.dispose(); }); keep.tex.forEach(function (x) { x.dispose(); });
        },
      };
    }
