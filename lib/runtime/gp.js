    /* ============================================================= Grand Prix: the director (ARTIFICIAL1 M1, lane T) == */
    // A Grand Prix (gp: { ... } among a world's own keys; lib/custom-game.ts isGpWorld): twenty cars, a 3 to 7 km lap
    // built from segments, places, laps and the five red lights. Spliced into boot() at /*@include gp.js*/ for a GP world
    // only, so it reads and reassigns the runtime's own names the way kart.js and shootout.js do, and owns the step, the
    // camera, the input, the HUD and the sound. Its parts are pasted below, each a file of its own declaring ONE name
    // (the M2 file split, EXPERIENCE.md 6.1; who owns each file: INTERFACES.md 8, the M2 amendment):
    //   gpTrack (the lap table; pure)   GpSim (the 120 Hz cars; pure)   GpAI (the line, the pace, the drivers; pure)
    //   GpRace (the rules; pure)   GpCam (the player's cameras)   GpDirector (the TV director)   GpCar (the car view)
    //   GpStage (the podium, the boards, the flag)   gpKit (the look)   GpHud (the HUD)   GpIntro (the first minute)
    //   gpAudio (the sound)
    // A part not in the tree is a console warning (the ones a race needs) or nothing (the rest), never a failed page;
    // a part whose factory returns null (a stub) leaves M1's behaviour in place: the director stands in for it.
    // This file declares functions only, each named gp*: v1 calls gpCtx (build time) and gpGuardCorridor (the corridor
    // guard) long before the include point runs, so only hoisted declarations exist there.
    /*@include gp-track.js*/
    /*@include gp-sim.js*/
    /*@include gp-ai.js*/
    /*@include gp-race.js*/
    /*@include gp-cam.js*/
    /*@include gp-director.js*/
    /*@include gp-car.js*/
    /*@include gp-stage.js*/
    /*@include gp-kit.js*/
    /*@include gp-hud.js*/
    /*@include gp-intro.js*/
    /*@include gp-audio.js*/

    // ctx.gp, for build(): the lap table and its lookups, the greybox and (M1b) the look kit's streaming builder. Only
    // the table exists at build time; the race does not
    function gpCtx() {
      ctx.track.clear = function (x, z, margin) { var nr = nearest(x, z); return nr.distance > GPT.hwAt(nr.d) + (margin == null ? 3 : margin); };
      ctx.track.widthAt = function (d) { return GPT.hwAt(d) * 2; };
      ctx.track.wallsAt = function (d) { return GPT.wallsAt(d, {}); };
      return {
        table: GPT,
        at: function (pos) { return GPT.at(pos); },
        pose: function (d) { return GPT.pose(d, {}); },
        posAt: function (d, lat, up) { return GPT.posAt(d, lat || 0, up || 0, {}); },
        widthAt: function (d) { return GPT.hwAt(d) * 2; },
        wallsAt: function (d) { return GPT.wallsAt(d, {}); },
        corners: GPT.corners, segs: GPT.segs, kerbs: GPT.kerbs,
        greybox: gpGreybox,
        stream: function (o) {
          if (typeof gpKit !== 'function') { warn('ctx.gp.stream() needs the look kit, which is not in this runtime yet; nothing was streamed.'); return null; }
          if (!GPS.kit) GPS.kit = gpKit({ THREE: THREE, scene: scene, renderer: renderer, camera: camera, quality: quality, T: GPT, warn: warn, GPS: GPS });
          return GPS.kit && typeof GPS.kit.stream === 'function' ? GPS.kit.stream(o || {}) : null;
        },
      };
    }

    // the lap in grey: the road at its own width, kerbs, the barrier walls along the barrier lines and the start line.
    // Three draws; every mesh is track furniture (the corridor guard leaves it alone)
    function gpGreybox(o) {
      o = o || {};
      var g = new THREE.Group(); g.name = 'gp-greybox';
      var road = ribbon({ color: o.road || '#1A1C20' });
      road.name = 'gp-road'; g.add(road);
      var kc = Array.isArray(o.kerb) ? o.kerb : ['#E8E8E8', '#C8102E'], cA = new THREE.Color(kc[0] || '#E8E8E8'), cB = new THREE.Color(kc[1] || kc[0] || '#C8102E'), cL = new THREE.Color('#F2F2F2');
      var pos = [], col = [], q = {}, q2 = {};
      function quad(a, b, c, d, color) {
        [a, b, c, a, c, d].forEach(function (p) { pos.push(p.x, p.y, p.z); col.push(color.r, color.g, color.b); });
      }
      function pt(d, lat, up) { var p = GPT.posAt(d, lat, up, {}); return p; }
      // kerbs: 1 m stripes, from the white line out by the kerb's width, on both sides of every corner
      GPT.kerbs.forEach(function (k) {
        var len = GPT.wrap(k.d1 - k.d0), sgn = k.side === 'R' ? 1 : -1;
        for (var s = 0; s < len; s += 1) {
          var d0 = k.d0 + s, d1 = k.d0 + Math.min(len, s + 1), h0 = GPT.hwAt(d0), h1 = GPT.hwAt(d1);
          quad(pt(d0, sgn * h0, 0.03), pt(d1, sgn * h1, 0.03), pt(d1, sgn * (h1 + GPT.kerb), 0.03), pt(d0, sgn * (h0 + GPT.kerb), 0.03), (Math.floor(s) % 2) ? cA : cB);
        }
      });
      // the start line, 0.6 m deep across the road
      if (o.line !== false) { var hw0 = GPT.hwAt(0); quad(pt(0, -hw0, 0.035), pt(0, hw0, 0.035), pt(0.6, hw0, 0.035), pt(0.6, -hw0, 0.035), cL); }
      var mg = new THREE.BufferGeometry();
      mg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); mg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      mg.computeVertexNormals();
      var marks = new THREE.Mesh(mg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 }));
      marks.name = 'gp-kerbs'; marks.receiveShadow = true; g.add(marks);
      // the barrier walls: 1.1 m faces along the barrier lines, every 2 m
      var wp = [], n = Math.ceil(GPT.L / 2), up = new THREE.Vector3(0, 1.1, 0);
      for (var side = -1; side <= 1; side += 2) {
        for (var i = 0; i < n; i++) {
          var a = i * GPT.L / n, b = (i + 1) * GPT.L / n, wa = GPT.wallsAt(a, q), la = side > 0 ? wa.right : wa.left, wb = GPT.wallsAt(b, q2), lb = side > 0 ? wb.right : wb.left;
          var A = pt(a, side * la, -0.2), B = pt(b, side * lb, -0.2);
          [A, B, { x: B.x, y: B.y + up.y, z: B.z }, A, { x: B.x, y: B.y + up.y, z: B.z }, { x: A.x, y: A.y + up.y, z: A.z }].forEach(function (p) { wp.push(p.x, p.y, p.z); });
        }
      }
      var wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3)); wg.computeVertexNormals();
      var walls = new THREE.Mesh(wg, new THREE.MeshStandardMaterial({ color: o.wall || '#9AA0A6', roughness: 0.85, side: THREE.DoubleSide }));
      walls.name = 'gp-walls'; walls.receiveShadow = true; g.add(walls);
      g.traverse(function (m) { if (m.isMesh) { m.userData.gmTrack = true; m.castShadow = false; } });
      scene.add(g);
      return g;
    }

    // v1's corridor guard (v1.js guardCorridor), with the road's own half width where each sample is, in place of the lap's
    // widest; track furniture (gmTrack, gpFurniture) and the cars (gpCar) are never hidden
    function gpGuardCorridor() {
      var grid = {}, HWX = GPT.hwMax;
      COARSE.forEach(function (s) { var key = Math.floor(s.x / 12) + ',' + Math.floor(s.z / 12); (grid[key] = grid[key] || []).push(s); });
      function intrudes(minX, maxX, minY, maxY, minZ, maxZ) {
        for (var gx = Math.floor((minX - HWX - 3) / 12); gx <= Math.floor((maxX + HWX + 3) / 12); gx++)
          for (var gz = Math.floor((minZ - HWX - 3) / 12); gz <= Math.floor((maxZ + HWX + 3) / 12); gz++) {
            var cell = grid[gx + ',' + gz]; if (!cell) continue;
            for (var j = 0; j < cell.length; j++) {
              var s = cell[j], hwl = GPT.hwAt(s.d);
              var px = clamp(s.x, minX, maxX), pz = clamp(s.z, minZ, maxZ);
              var hd = Math.hypot(px - s.x, pz - s.z), la = lateralOf(s, px, pz), h2 = s.rx * s.rx + s.rz * s.rz;
              if (Math.sqrt(hd * hd + la * la * Math.max(0, 1 - h2)) > hwl + 1.2) continue;
              var sy = s.y + clamp(lateralOf(s, px, pz), -hwl - 1.2, hwl + 1.2) * s.ry;
              if (maxY > sy + 0.8 && minY < sy + R.corridorHeight) return s;
            }
          }
        return null;
      }
      var hidden = 0, B = new THREE.Box3(), M = new THREE.Matrix4(), ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
      var where = [], CEN = new THREE.Vector3();
      function noteHidden(o, minX, maxX, minY, maxY, minZ, maxZ) {
        if (where.length >= 5) return;
        var s = intrudes(minX, maxX, minY, maxY, minZ, maxZ); if (!s) return;
        var nm = o.name && o.name !== 'scenery' ? String(o.name).slice(0, 16) : ((String(o.geometry && o.geometry.type || '').replace(/(Buffer)?Geometry$/, '').toLowerCase() || 'mesh') + (o.material && o.material.color ? ' #' + o.material.color.getHexString() : '') + ' ' + Math.max(maxX - minX, maxZ - minZ).toFixed(0) + 'm');
        CEN.set((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
        var la = lateralOf(s, CEN.x, CEN.z);
        where.push(nm + ' @' + Math.round(s.d) + 'm ' + Math.abs(la).toFixed(1) + (la >= 0 ? 'R' : 'L') + ' ' + Math.max(0, minY - s.y).toFixed(1) + '-' + (maxY - s.y).toFixed(1) + 'up');
      }
      scene.updateMatrixWorld(true);
      var skip = new Set([P0.object, coinMesh]); obstacles.forEach(function (o) { skip.add(o.object); });
      scene.traverse(function (o) {
        if (!o.isMesh || o.userData.gmTrack || o.userData.gpFurniture || o.userData.gpCar) return;
        for (var p = o; p; p = p.parent) if (skip.has(p) || p.userData.gpFurniture || p.userData.gpCar) return;
        if (o.isInstancedMesh) {
          if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
          var changed = false, IB = new THREE.Box3();
          for (var n = 0; n < o.count; n++) {
            o.getMatrixAt(n, M);
            IB.copy(o.geometry.boundingBox).applyMatrix4(M).applyMatrix4(o.matrixWorld);
            if (IB.max.y - IB.min.y < 0.8 || Math.max(IB.max.x - IB.min.x, IB.max.z - IB.min.z) > 140) continue;
            if (intrudes(IB.min.x, IB.max.x, IB.min.y, IB.max.y, IB.min.z, IB.max.z)) { noteHidden(o, IB.min.x, IB.max.x, IB.min.y, IB.max.y, IB.min.z, IB.max.z); o.setMatrixAt(n, ZERO); hidden++; changed = true; }
          }
          if (changed) o.instanceMatrix.needsUpdate = true;
          return;
        }
        B.setFromObject(o);
        var size = B.getSize(new THREE.Vector3());
        if (size.y < 0.8 || Math.max(size.x, size.z) > 140) return;
        if (intrudes(B.min.x, B.max.x, B.min.y, B.max.y, B.min.z, B.max.z)) { noteHidden(o, B.min.x, B.max.x, B.min.y, B.max.y, B.min.z, B.max.z); o.visible = false; hidden++; }
      });
      var band = (GPT.hwMin + 1.2).toFixed(1) + (GPT.hwMax > GPT.hwMin ? '-' + (GPT.hwMax + 1.2).toFixed(1) : '');
      if (hidden) warn(hidden + ' scenery piece' + (hidden > 1 ? 's were' : ' was') + ' inside the racing corridor (within ' + band + 'm of the centre line, the road\'s own half width there plus 1.2 m, and under ' + R.corridorHeight + 'm high) and were hidden so they cannot block the camera. Keep scenery off the track; overhead arches must clear ' + R.corridorHeight + 'm.');
      if (where.length) warn('Hidden (piece @metres along the lap, metres right/left of the centre line, metres over the road): ' + where.join('; ') + '. Move each out past the road\'s half width there plus 1.2 m from the centre line or lift its underside over ' + R.corridorHeight + ' m.');
    }

    // the stand-in car (until the library has model-why-v07): a code-built single-seater of boxes, under 1,000 triangles,
    // authored facing +Z on the wheelbase's midpoint at the ground (axles at +-1.8 m, nose 3.19, tail -2.39, 2.0 m wide,
    // tyres 0.361 m), in four livery parts and a wheel
    function gpProxyParts(X3) {
      function box(w, h, l, x, y, z) { var g = new X3.BoxGeometry(w, h, l); g.translate(x, y, z); return g; }
      function merge(list, cols) {
        var pos = [], nor = [], col = [];
        list.forEach(function (g, k) {
          var n = g.index ? g.toNonIndexed() : g, p = n.attributes.position.array, q = n.attributes.normal.array, c = cols ? new X3.Color(cols[k]) : null;
          for (var i = 0; i < p.length; i++) { pos.push(p[i]); nor.push(q[i]); }
          if (c) for (var j = 0; j < p.length / 3; j++) col.push(c.r, c.g, c.b);
        });
        var out = new X3.BufferGeometry();
        out.setAttribute('position', new X3.Float32BufferAttribute(pos, 3)); out.setAttribute('normal', new X3.Float32BufferAttribute(nor, 3));
        if (cols) out.setAttribute('color', new X3.Float32BufferAttribute(col, 3));
        out.computeBoundingSphere();
        return out;
      }
      var body = merge([box(0.86, 0.5, 3.0, 0, 0.42, 0.35), box(0.44, 0.26, 1.3, 0, 0.36, 2.45), box(1.62, 0.42, 1.7, 0, 0.36, -0.35), box(0.72, 0.52, 1.6, 0, 0.62, -1.15), box(0.36, 0.3, 0.5, 0, 0.98, -0.45)]);
      var aero = merge([box(1.95, 0.05, 0.45, 0, 0.1, 2.95), box(1.9, 0.05, 0.2, 0, 0.17, 2.74), box(1.0, 0.05, 0.38, 0, 0.82, -2.18), box(1.0, 0.04, 0.22, 0, 0.95, -2.27),
        box(0.03, 0.44, 0.58, 0.5, 0.78, -2.15), box(0.03, 0.44, 0.58, -0.5, 0.78, -2.15), box(1.5, 0.03, 3.5, 0, 0.04, -0.1), box(1.0, 0.18, 0.4, 0, 0.12, -2.2)]);
      var accent = merge([box(0.06, 0.06, 0.72, 0.25, 0.86, 0.22), box(0.06, 0.06, 0.72, -0.25, 0.86, 0.22), box(0.05, 0.24, 0.05, 0, 0.75, 0.6), box(0.12, 0.02, 2.5, 0, 0.675, 1.2), box(1.0, 0.03, 0.06, 0, 0.985, -2.36)]);
      var helmet = new X3.SphereGeometry(0.15, 10, 6); helmet.translate(0, 0.76, 0.1); helmet.computeBoundingSphere();
      var tyre = new X3.CylinderGeometry(0.3608, 0.3608, 0.37, 18, 1); tyre.rotateZ(Math.PI / 2);
      var rim = new X3.CylinderGeometry(0.235, 0.235, 0.38, 12, 1); rim.rotateZ(Math.PI / 2);
      var sp1 = box(0.39, 0.05, 0.44, 0, 0, 0), sp2 = box(0.39, 0.44, 0.05, 0, 0, 0);
      var wheel = merge([tyre, rim, sp1, sp2], ['#121212', '#7E838A', '#C9CDD2', '#C9CDD2']);
      var blob = new X3.PlaneGeometry(2.6, 6.0); blob.rotateX(-Math.PI / 2); blob.translate(0, 0, 0.3);
      return { body: body, aero: aero, accent: accent, helmet: helmet, wheel: wheel, blob: blob,
        wheels: [[0.822, 0.3608, 1.8, 1], [-0.822, 0.3608, 1.8, 1], [0.772, 0.3608, -1.8, 0], [-0.772, 0.3608, -1.8, 0]] };
    }

    // the car from the library (gp.car, a 'model' asset with levels of detail: model-why-v07): its geometry per level, part
    // and material, each part local to its pivot (body; wheel-fl/fr/rl/rr spin about +X; steer-fl/fr turn about +Y, a
    // front wheel inside its steer part; steering-wheel about json.car.steeringWheel.axis), and its textures once each.
    // The integrator's adapter (INTERFACES 2.11), read the way v07/verify/page.html (the asset lane's reference) reads it
    function gpCarParts(A) {
      var J = A.json, buf = A.model, TY = { Float32Array: Float32Array, Int8Array: Int8Array, Uint8Array: Uint8Array, Uint16Array: Uint16Array, Uint32Array: Uint32Array };
      if (!J || !Array.isArray(J.lods) || !J.car || !(buf && buf.byteLength)) throw new Error('the model has no levels of detail or no car record');
      function view(key) { var L0 = J.layout[key]; if (!L0) return null; var Ty = TY[L0.type]; if (!Ty) throw new Error('unknown layout type ' + L0.type); return new Ty(buf, L0.offset, L0.length); }
      function geo(sub) {
        var g = new THREE.BufferGeometry(), v;
        g.setAttribute('position', new THREE.BufferAttribute(view(sub.key + ':pos'), 3));
        if ((v = view(sub.key + ':nor'))) g.setAttribute('normal', new THREE.BufferAttribute(v, 3, true));
        if ((v = view(sub.key + ':uv'))) g.setAttribute('uv', new THREE.BufferAttribute(v, 2));
        if ((v = view(sub.key + ':ao'))) g.setAttribute('ao', new THREE.BufferAttribute(v, 1, true));
        if ((v = view(sub.key + ':slot'))) g.setAttribute('slot', new THREE.BufferAttribute(v, 1));
        g.setIndex(new THREE.BufferAttribute(view(sub.key + ':idx'), 1));
        g.computeBoundingSphere();
        return g;
      }
      var lods = {};
      J.lods.forEach(function (Lv) {
        var parts = {};
        Object.keys(Lv.parts).forEach(function (name) { var P = Lv.parts[name]; parts[name] = { origin: P.origin, subs: P.subs.map(function (s) { return { geometry: geo(s), material: s.material, tris: s.triangles }; }) }; });
        lods[Lv.name] = { parts: parts, tris: Lv.triangles, draws: Lv.draws };
      });
      var TEX = {};
      function tex(name, srgb, clampT, clampS) {
        var bm = name && A.images[name]; if (!bm) return null;
        var k = name + (srgb ? '|s' : '|l') + (clampT ? 'c' : '') + (clampS ? 'c' : ''); if (TEX[k]) return TEX[k];
        var t = new THREE.Texture(bm); t.flipY = false; t.premultiplyAlpha = false; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        t.wrapS = clampS ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping; t.wrapT = clampT ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
        t.anisotropy = ANISO; t.needsUpdate = true; return (TEX[k] = t);
      }
      return { json: J, lods: lods, tex: tex, pal: J.car.palette || [], materials: J.materials || [] };
    }

    // THE MOMENT's picker (EXPERIENCE X32, finish-and-loop 3.2; lane E): pure, over the race's log (the one event schema,
    // INTERFACES 8 M2; M1's names where the race still writes them). Each event a score, the best one the moment, a tie to
    // the later one; a lonely race falls back to your best lap's tunnel exit. The captions are the race's facts only.
    //   gpMomentPick(events, you, o) -> { kind, score, t, event, caption: [line, line], fallback? }
    //   o = { laps, names: [], heavy: ['T1', ...] (the heavy stops), fast: { n, time } (the race's fastest lap) }
    function gpMomentPick(events, you, o) {
      o = o || {};
      var names = o.names || [], heavy = Array.isArray(o.heavy) ? o.heavy : ['T1', 'T4', 'T9', 'T12', 'T15'], laps = o.laps || 3, best = null, passEv = false, bestLap = null;
      events = Array.isArray(events) ? events : [];
      for (var i = 0; i < events.length; i++) if (events[i] && events[i].e === 'pass') { passEv = true; break; }
      function nm(n) { return String(names[n] != null ? names[n] : 'car ' + n).toUpperCase(); }
      function lapClock(s) { var m = Math.floor(s / 60), r = (s - m * 60).toFixed(3); return m + ':' + (+r < 10 ? '0' : '') + r; }
      function take(c) { if (!best || c.score > best.score || (c.score === best.score && c.t >= best.t)) best = c; }
      for (var k = 0; k < events.length; k++) {
        var e = events[k]; if (!e || typeof e.e !== 'string') continue;
        var t = +e.t || 0;
        if ((e.e === 'pass' || (e.e === 'overtake' && !passEv)) && e.car === you && e.earned !== false) {
          // a pass for a place: +100 for the lead or the win, +60 on the final lap, +40 into a heavy stop, +40 round the
          // outside, +30 with the Flap, +3 a metre of braking margin
          var s = 100, facts = [], corner = e.corner != null ? String(e.corner) : '';
          if (e.place === 1) s += 100;
          if (e.lap >= laps) s += 60;
          if (corner && heavy.indexOf(corner.replace(/-.*/, '')) >= 0) s += 40;
          if (e.kind === 'outside') s += 40;
          if (e.kind === 'flap' || e.flap) s += 30;
          if (isFinite(+e.margin) && +e.margin > 0) { s += 3 * +e.margin; facts.push('BRAKED ' + Math.round(+e.margin) + ' M LATER'); }
          if (isFinite(+e.flapKmh) && +e.flapKmh > 0) facts.push('FLAP +' + Math.round(+e.flapKmh) + ' KM/H');
          take({ kind: 'pass', score: s, t: t, event: e, caption: ['YOU PASS ' + nm(e.passed) + (e.place ? ' FOR P' + e.place : ''), facts.join(' · ')] });
        } else if (e.e === 'finish' && e.car === you) {
          // a photo finish: 0.100 s or less to the car ahead or behind, 300 (+200 if you won it)
          var ga = e.gapAhead != null ? Math.abs(+e.gapAhead) : 9, gb = e.gapBehind != null ? Math.abs(+e.gapBehind) : 9, g = Math.min(ga, gb);
          if (g <= 0.1) take({ kind: 'photo', score: 300 + (e.place === 1 ? 200 : 0), t: t, event: e, caption: ['PHOTO FINISH', Math.round(g * 1000) + ' THOUSANDTHS' + (e.place ? ' · P' + e.place : '')] });
        } else if (e.e === 'sideBySide' && (e.a === you || e.b === you) && +e.dur >= 1.5) {
          take({ kind: 'side', score: 70 + (e.tunnel || /tunnel/i.test(String(e.corner || '')) ? 50 : 0), t: t, event: e, caption: ['SIDE BY SIDE WITH ' + nm(e.a === you ? e.b : e.a), (+e.dur).toFixed(1) + ' S' + (e.corner ? ' · ' + e.corner : '')] });
        } else if (e.e === 'defence' && e.car === you && e.held !== false) {
          take({ kind: 'defence', score: 60 + (e.lap >= laps ? 60 : 0), t: t, event: e, caption: ['DEFENCE HELD', e.by != null ? nm(e.by) + ' KEPT BEHIND' : ''] });
        } else if (e.e === 'lap' && e.car === you && !e.deleted && isFinite(+e.time)) {
          if (!bestLap || +e.time < +bestLap.time) bestLap = e;
        } else if (e.e === 'mistake' && e.car !== you && isFinite(+e.ahead) && +e.ahead >= 0 && +e.ahead <= 50) {
          take({ kind: 'mistake', score: 40 + (e.gave ? 40 : 0), t: t, event: e, caption: [nm(e.car) + ' · ' + String(e.kind || 'mistake').toUpperCase(), Math.round(+e.ahead) + ' M AHEAD OF YOU'] });
        } else if (e.e === 'contact' && (e.a === you || e.b === you)) {
          take({ kind: 'contact', score: 30 - (e.striker === you ? 30 : 0), t: t, event: e, caption: ['CONTACT WITH ' + nm(e.a === you ? e.b : e.a), ''] });
        }
      }
      // your fastest lap of the race, 80: that lap's tunnel exit
      if (bestLap && o.fast && o.fast.n === you && Math.abs(+o.fast.time - +bestLap.time) < 1e-6) take({ kind: 'fastest', score: 80, t: +bestLap.t || 0, event: bestLap, caption: ['FASTEST LAP', lapClock(+bestLap.time)] });
      if (best) return best;
      return { kind: 'lap', score: 0, t: bestLap ? +bestLap.t || 0 : 0, event: bestLap, caption: bestLap ? ['YOUR BEST LAP', lapClock(+bestLap.time)] : ['', ''], fallback: true };
    }

    // the director (lane T in M1, lane E in M2): the race (GpRace.race: the sim, the AI and the rules, the same call the
    // Node harness makes), the devices, the car view, the camera and the HUD (GpCam.camera, GpHud.hud), the TV director,
    // the intro and the stage (M2 parts, stubs until their lanes land), the sound stand-in, the screens, the run's report
    // (GameMog.finish, with its aids tag) and the readouts and debug hooks. A part that is not in the tree leaves the lap
    // flown at speed, as on day 0
    function gpWorld() {
      function gpStep(name) { try { console.info('[gp] step ' + name); } catch (e) {} }
      // an M2 part's factory (gp-director.js, gp-stage.js, gp-intro.js, gp-car.js): its view, or null (a stub, or none)
      function gpPart(label, mod, fn, env) {
        if (!mod || typeof mod[fn] !== 'function') return null;
        try { var v = mod[fn](env) || null; if (v) gpStep(label + ': own'); return v; }
        catch (e) { warn('The Grand Prix ' + label + ' could not be made (' + (e && e.message || e) + '): it is left out.'); return null; }
      }
      // a director or page event (INTERFACES 8, the M2 amendment): { e, t, step, you } plus its data, kept for the tests,
      // and the ones the page is told about (the telemetry, gpTell)
      function gpPage(name, data) {
        var S0 = GR && GR.S, o = { e: String(name), t: S0 ? S0.t : 0, step: S0 ? S0.steps : 0, you: true };
        if (data && typeof data === 'object') for (var k in data) if (k !== 'e' && k !== 't' && k !== 'step') o[k] = data[k];
        o.wall = typeof performance !== 'undefined' ? performance.now() : 0;
        GPAGE.push(o); if (GPAGE.length > 400) GPAGE.shift();
        gpTell(o);
        // (the sound hears the page's moments too: the intro's beats, a skip, the podium, the results; lane D's X18 and X28)
        if (GAUD && typeof GAUD.event === 'function') { try { GAUD.event(o.e, o); } catch (x) { GAUD = null; } }
        return o;
      }
      // the telemetry (INTERFACES 8, the M2 amendment): the frame posts { type: 'gp', e, ... } for these, the page
      // forwards them to first-party analytics in M3 (until then it ignores them); never in the demo
      var GTELL = /^(intro|skip|handoff|launch|lap|finish|results|again|moment-watch|pause|quit)$/;
      function gpTell(o) {
        if (!o || !GTELL.test(o.e) || GRK !== 'race' || o.you !== true) return;
        var m = {}; for (var k in o) { var v = o[k]; if (k !== 'wall' && (v == null || typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean')) m[k] = v; }
        try { if (GM && typeof GM.gpEvent === 'function') GM.gpEvent(m); } catch (e) {}
      }
      var GMODS = {
        sim: typeof GpSim !== 'undefined' && GpSim && typeof GpSim.create === 'function' ? GpSim : null,
        ai: typeof GpAI !== 'undefined' && GpAI && typeof GpAI.line === 'function' ? GpAI : null,
        race: typeof GpRace !== 'undefined' && GpRace && typeof GpRace.race === 'function' ? GpRace : null,
        cam: typeof GpCam !== 'undefined' && GpCam && typeof GpCam.camera === 'function' ? GpCam : null,
        hud: typeof GpHud !== 'undefined' && GpHud && typeof GpHud.hud === 'function' ? GpHud : null,
      };
      gpStep('director: making (parts ' + Object.keys(GMODS).map(function (k) { return k + ':' + (GMODS[k] ? 'own' : 'none'); }).join(' ') + ')');
      // what the lap race would draw is never shown; the runtime's own player is an empty group
      coinMesh.visible = false;
      P0.object.visible = false;
      if (quality === 'low' && basePixelRatio > 1.25) { basePixelRatio = 1.25; renderer.setPixelRatio(basePixelRatio); renderer.setSize(window.innerWidth, window.innerHeight); }
      // the frame's whole cost, the shadow, reflection and post passes included: read on the first tick of each frame
      renderer.info.autoReset = false;
      camera.near = 0.3; camera.updateProjectionMatrix();
      var GCOST = { calls: 0, tris: 0, frame: -1, ms: 0, last: 0, log: [] };
      GPS.cost = GCOST;
      var GCFG = null;
      if (GMODS.race && typeof GMODS.race.read === 'function') { try { GCFG = GMODS.race.read(def.gp, GPT, warn); } catch (e) { fail('The race could not read gp: ' + (e && e.message || e)); } }
      var GOK = !!(GMODS.sim && GMODS.ai && GMODS.race && GCFG);
      if (!GOK) warn('The Grand Prix runs without ' + ['sim', 'ai', 'race'].filter(function (k) { return !GMODS[k]; }).concat(GCFG ? [] : ['its config']).join(', ') + ': the lap is flown, no race.');
      var GTOUCH = root.classList.contains('touch');
      // (the driving aids on every device to start with, Pro opt-in everywhere: the race's config says, gp.assists)
      var GAS0 = GCFG && GCFG.assists ? (GTOUCH ? GCFG.assists.touch : GCFG.assists.keys) : null;
      // (lane E, X26: the pause sheet's settings live here, in session memory; the host forwards them in M3)
      var GSET = { you: GCFG ? GCFG.you : null, pro: GAS0 ? !(GAS0.brake || GAS0.steer) : false, gearbox: GCFG ? GCFG.gearbox : 'auto', cam: GCFG && GCFG.cameras ? GCFG.cameras.start : 'chase',
        tones: false, haptics: true, vol: { master: 1, engine: 1, crowd: 1, click: 1 }, steer: 1 };
      var GDBG = { used: false, headless: false, lod: { near: null, all: false }, events: [], renderLog: [], idle: false };
      // the session (in memory: the frame has no storage, RULES 1 and EXPERIENCE 1.11): races begun, the last place the
      // player finished in (D4: the next race starts from it + 3; the first from the back of the grid), a dare's slot
      // (lane E: whether the long intro has played this session, a dare's words for its intro (M3), the session's best lap)
      var GSES = { races: 0, last: null, dare: null, sent: 0, introSeen: false, dareIntro: null, best: null, pb: false };
      // the director and page events (INTERFACES 8, the M2 amendment), the newest 400; the race's report once sent
      var GPAGE = [], GFIN = null, GFINR = null, GPASS = 0;
      var GLINE = null, GLINEMS = 0, GR = null, GRK = null, GST = null, GRESULTS = 0, GSCR = null, GSEED = 1;
      var GHERO = new THREE.Vector3(), GE = new THREE.Euler(0, 0, 0, 'YXZ'), GM4 = new THREE.Matrix4(), GM5 = new THREE.Matrix4(), GM6 = new THREE.Matrix4(), GQ = new THREE.Quaternion();
      var GV = new THREE.Vector3(), GS1 = new THREE.Vector3(1, 1, 1), GZERO = new THREE.Matrix4().makeScale(0, 0, 0), GFOCUS = { n: 0, x: 0, y: 0, z: 0, h: 0, pitch: 0, roll: 0, v: 0, steerAngle: 0, d: 0 };
      function nextSeed() { GSEED = (Math.floor(Math.random() * 4294967295) >>> 0) || 1; return GSEED; }
      function angD(a, b) { var x = (a - b) % (2 * Math.PI); if (x > Math.PI) x -= 2 * Math.PI; else if (x <= -Math.PI) x += 2 * Math.PI; return x; }

      /* ------------------------------------------------------------------------------------- the car view -- */
      // gp.car from the library (model-why-v07) when the page loaded it, else the code-built stand-in. Either way the focus
      // car is the hero (its own meshes, the only car casting into the shadow map) and every other car is drawn for less
      var GCARID = def.gp && typeof def.gp.car === 'string' ? def.gp.car : null;
      var GASSET = GCARID && ASSETS[GCARID] && ASSETS[GCARID].json && ASSETS[GCARID].json.kind === 'model' && ASSETS[GCARID].model ? ASSETS[GCARID] : null;
      if (GCARID && !GASSET) warn('gp.car "' + GCARID + '" is not loaded (list it in assets): a stand-in car races.');
      // the drivers' helmet colours (gp.drivers[].helmet), by id
      var GHELM = {};
      (def.gp && Array.isArray(def.gp.drivers) ? def.gp.drivers : []).forEach(function (d) { if (d && typeof d.id === 'string' && typeof d.helmet === 'string' && /^#[0-9a-fA-F]{6}$/.test(d.helmet)) GHELM[d.id] = d.helmet; });
      var GCV = null;
      if (GASSET) { try { GCV = gpModelView(GASSET); gpStep('car: ' + GCARID); } catch (e) { warn('The car "' + GCARID + '" could not be built (' + (e && e.message || e) + '): a stand-in car races.'); GCV = null; } }
      // (lane C2's car view, gp-car.js, when it returns one: its pose fills the focus the camera follows)
      var GCVX = gpPart('car', typeof GpCar !== 'undefined' ? GpCar : null, 'view', { THREE: THREE, three: THREE, scene: scene, renderer: renderer, camera: camera, quality: quality, T: GPT, cfg: GCFG || {}, asset: GASSET, warn: warn });
      if (GCVX && typeof GCVX.pose === 'function') {
        if (GCV && GCV.group && GCV.group.parent) GCV.group.parent.remove(GCV.group);
        GCV = { group: GCVX.group || new THREE.Group(), model: GCVX.model || 'gp-car', levels: GCVX.levels || null, onboard: function (m) { if (typeof GCVX.onboard === 'function') GCVX.onboard(m); },
          pose: function (R, a) { GCVX.pose(R, a, GFOCUS); }, tris: function () { return typeof GCVX.tris === 'function' ? GCVX.tris() : 0; }, prewarm: function () { if (typeof GCVX.prewarm === 'function') GCVX.prewarm(); } };
      }
      if (!GCV) GCV = gpProxyView();

      // the library car: the hero at its finest level (lod0; lod1 on a phone), the cars nearest the camera as cars of
      // their own at a middle level (wheels turning and steering, their own livery), every other car one instanced
      // proxy (one draw for all of them, colours per instance), helmets and ground shadows instanced too
      function gpModelView(A) {
        var K = gpCarParts(A), J = K.json, low = quality === 'low', CAP = Math.max(2, GCFG && GCFG.all ? GCFG.all.length : 20);
        var LV = { hero: low ? 'lod1' : 'lod0', near: low ? 'far' : 'mid', nearN: low ? 2 : 3, nearR: low ? 30 : 45, midR: low ? 0 : 160, far: 'proxy-far', mid: 'proxy-mid' };
        ['hero', 'near'].forEach(function (k) { if (!K.lods[LV[k]]) LV[k] = J.lods[0].name; });
        var PAL = K.pal, NPAL = PAL.length, SL = {};
        PAL.forEach(function (p, i) { SL[p.name] = i; });
        var OWN = J.car.livery && J.car.livery.owner || {};
        var SWAX = new THREE.Vector3().fromArray(J.car.steeringWheel && J.car.steeringWheel.axis || [0, -0.3746, -0.9272]).normalize();
        var group = new THREE.Group(); group.name = 'gp-cars'; group.userData.gpCar = true;
        function mdef(name) { for (var i = 0; i < K.materials.length; i++) if (K.materials[i].name === name) return K.materials[i]; return {}; }
        // the shader patches (the asset lane's reference consumer): baked occlusion on the indirect light, the livery
        // mask's five colours, the trim palette by vertex slot, and (proxies) the team colours per instance
        function patch(mat, o) {
          mat.onBeforeCompile = function (s) {
            var vh = '#include <common>\n', vb = '#include <begin_vertex>\n', fh = '#include <common>\n';
            if (o.ao) { vh += 'attribute float ao;\nvarying float vGpAo;\n'; vb += 'vGpAo = ao;\n'; fh += 'varying float vGpAo;\n'; }
            if (o.trim) {
              Object.assign(s.uniforms, o.trim);
              vh += 'attribute float slot;\nuniform vec3 uPal[' + NPAL + '];\nuniform vec2 uRM[' + NPAL + '];\nuniform vec3 uEm[' + NPAL + '];\nvarying vec3 vPal;\nvarying vec2 vRM;\nvarying vec3 vEm;\n';
              vb += 'int si = int(slot + 0.5); vPal = uPal[si]; vRM = uRM[si]; vEm = uEm[si];\n';
              if (o.inst) {
                vh += 'attribute vec3 iUp;\nattribute vec3 iLow;\nattribute vec3 iCo;\nattribute vec3 iAcc;\n';
                vb += 'if (si == ' + (SL.upper == null ? -1 : SL.upper) + ') vPal = iUp; else if (si == ' + (SL.lower == null ? -1 : SL.lower) + ') vPal = iLow; else if (si == ' + (SL.coach == null ? -1 : SL.coach) + ' || si == ' + (SL.nut == null ? -1 : SL.nut) + ') vPal = iCo; else if (si == ' + (SL.accent == null ? -1 : SL.accent) + ') vPal = iAcc;\n';
              }
              fh += 'varying vec3 vPal;\nvarying vec2 vRM;\nvarying vec3 vEm;\n';
            }
            if (o.mask) {
              Object.assign(s.uniforms, o.mask); fh += 'uniform vec3 uUp, uLow, uCoach, uInk, uGold, uNum;\nuniform float uScuff;\nvarying vec3 vGpObj;\n';
              vh += 'varying vec3 vGpObj;\n'; vb += 'vGpObj = position;\n';
            }
            s.vertexShader = s.vertexShader.replace('#include <common>', vh).replace('#include <begin_vertex>', vb);
            s.fragmentShader = s.fragmentShader.replace('#include <common>', fh);
            if (o.trim) s.fragmentShader = s.fragmentShader.replace('#include <color_fragment>', 'diffuseColor.rgb *= vPal;')
              .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vRM.x;').replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vRM.y;')
              .replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance = vEm;');
            if (o.mask) s.fragmentShader = s.fragmentShader.replace('#include <map_fragment>', [
              '#ifdef USE_MAP',
              '  vec4 mk = texture2D( map, vMapUv );',
              '  float gold = min( mk.g, mk.b ), co = mk.g - gold, ink = mk.b - gold, low = max( 0.0, 1.0 - mk.r - co - ink - gold - mk.a );',
              '  diffuseColor.rgb *= uUp * mk.r + uCoach * co + uInk * ink + uGold * gold + uNum * mk.a + uLow * low;',
              '#endif',
              // the knocks the car has taken (the sim's scuff, 0 to 1): scraped patches and streaks, more of them as it grows
              // (thin streaks along the car, 2 to 3 cm across and a third of a metre long, darker where the paint is gone)
              '{ vec3 sq = floor( vGpObj * vec3( 40.0, 52.0, 3.0 ) ); float nz = fract( sin( dot( sq, vec3( 12.9898, 78.233, 37.719 ) ) ) * 43758.5453 );',
              '  float sc = step( 0.04, uScuff ) * smoothstep( 1.0 - 0.35 * uScuff, 1.02 - 0.35 * uScuff, nz );',
              '  diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * 0.35 + vec3( 0.05, 0.048, 0.045 ), sc * 0.7 ); }'].join('\n'));
            if (o.ao) s.fragmentShader = s.fragmentShader.replace('#include <aomap_fragment>', [
              '#include <aomap_fragment>',
              '{ float bao = clamp( vGpAo * 1.1, 0.0, 1.0 ); reflectedLight.indirectDiffuse *= bao;',
              '  float dNV = saturate( dot( geometryNormal, geometryViewDir ) ); reflectedLight.indirectSpecular *= computeSpecularOcclusion( dNV, bao, material.roughness ); }'].join('\n'));
          };
          mat.customProgramCacheKey = function () { return 'gp-car|' + mat.type + '|' + (o.ao ? 'a' : '') + (o.trim ? 't' : '') + (o.mask ? 'm' : '') + (o.inst ? 'i' : ''); };
          return mat;
        }
        function trimU() {
          return { uPal: { value: PAL.map(function (p) { return new THREE.Color(p.color); }) }, uRM: { value: PAL.map(function (p) { return new THREE.Vector2(p.roughness == null ? 0.5 : p.roughness, p.metalness || 0); }) },
            uEm: { value: PAL.map(function (p) { return p.emissive ? new THREE.Color(p.emissive).multiplyScalar(p.emissiveIntensity || 1) : new THREE.Color(0, 0, 0); }) } };
        }
        // the shared materials: carbon, the two tyres, the rain light
        var mC = mdef('carbon'), mP = mdef('paint'), ns = mC.normalScale || 0.24;
        var maskT = K.tex(J.car.livery && J.car.livery.mask || mP.livery, false, true, true);
        var carbon = patch(new THREE.MeshPhysicalMaterial({ map: K.tex(mC.map, true), normalMap: K.tex(mC.normalMap, false), normalScale: new THREE.Vector2(ns, ns), roughnessMap: K.tex(mC.armMap, false), roughness: 1,
          clearcoat: low ? 0 : (mC.clearcoat == null ? 0.55 : mC.clearcoat), clearcoatRoughness: mC.clearcoatRoughness == null ? 0.32 : mC.clearcoatRoughness, specularIntensity: mC.specularIntensity == null ? 0.55 : mC.specularIntensity }), { ao: true });
        function tyre(m) {
          return patch(new THREE.MeshPhysicalMaterial({ map: K.tex(m.map, true, true), normalMap: K.tex(m.normalMap, false, true), roughnessMap: K.tex(m.armMap, false, true), roughness: 1,
            specularIntensity: m.specularIntensity == null ? 0.55 : m.specularIntensity, sheen: low ? 0 : (m.sheen || 0.18), sheenRoughness: 0.65, sheenColor: new THREE.Color('#3a3a3a') }), { ao: true });
        }
        var tyreF = tyre(mdef('tyre-front')), tyreR = tyre(mdef('tyre-rear'));
        var led = new THREE.MeshStandardMaterial({ color: '#200202', emissive: '#ff2412', emissiveIntensity: 3, roughness: 0.25 });
        var VISOR = new THREE.MeshStandardMaterial({ color: '#07090C', roughness: 0.06, metalness: 0.7 });
        // a car's own materials: its paint (the livery through the mask) and its trim (the nut and the T-cam per car)
        function liveryMats(fine) {
          var UL = { uUp: { value: new THREE.Color() }, uLow: { value: new THREE.Color() }, uCoach: { value: new THREE.Color() }, uInk: { value: new THREE.Color() }, uGold: { value: new THREE.Color() }, uNum: { value: new THREE.Color() }, uScuff: { value: 0 } };
          var po = { map: maskT, roughness: mP.roughness == null ? 0.28 : mP.roughness, metalness: 0 };
          if (fine) { po.clearcoat = mP.clearcoat == null ? 1 : mP.clearcoat; po.clearcoatRoughness = mP.clearcoatRoughness == null ? 0.03 : mP.clearcoatRoughness; }
          var paint = patch(fine ? new THREE.MeshPhysicalMaterial(po) : new THREE.MeshStandardMaterial(po), { ao: true, mask: UL });
          var UT = trimU(), trim = patch(new THREE.MeshStandardMaterial({ color: '#ffffff' }), { ao: true, trim: UT });
          var helmet = new THREE.MeshPhysicalMaterial({ color: '#d8d8d8', roughness: 0.22, metalness: 0.05, clearcoat: fine ? 1 : 0, clearcoatRoughness: 0.05 });
          return { paint: paint, trim: trim, helmet: helmet, UL: UL, UT: UT };
        }
        function matFor(idx, LM) {
          var n = K.materials[idx] && K.materials[idx].name;
          return n === 'paint' ? LM.paint : n === 'carbon' ? carbon : n === 'tyre-front' ? tyreF : n === 'tyre-rear' ? tyreR : n === 'led' ? led : LM.trim;
        }
        // the helmet (none in the model): an original shell and visor built here, on the driver's seat (car.md 7's estimate:
        // centre 0.80 m up, 0.43 m ahead of the wheelbase's middle)
        var HSHELL = new THREE.SphereGeometry(0.14, low ? 14 : 24, low ? 10 : 16); HSHELL.scale(0.93, 1.0, 1.1); HSHELL.translate(0, 0.80, 0.43);
        var HVIS = new THREE.SphereGeometry(0.1425, low ? 12 : 20, 4, Math.PI * 0.5 - 0.92, 1.84, Math.PI * 0.41, Math.PI * 0.15); HVIS.scale(0.93, 1.0, 1.1); HVIS.translate(0, 0.80, 0.43);
        // one car, built from a level: its parts on their pivots, the front wheels inside their steer parts
        function rigOf(lod, fine, shadows) {
          var L0 = K.lods[lod], LM = liveryMats(fine), root = new THREE.Group(), parts = {};
          root.rotation.order = 'YXZ'; root.userData.gpCar = true; root.name = 'gp-car-' + lod;
          Object.keys(L0.parts).forEach(function (name) {
            var P = L0.parts[name], g = new THREE.Group(); g.name = name; g.position.fromArray(P.origin);
            P.subs.forEach(function (s) {
              var m = new THREE.Mesh(s.geometry, matFor(s.material, LM)), mn = K.materials[s.material] && K.materials[s.material].name;
              m.castShadow = !!shadows && mn !== 'led' && name !== 'steering-wheel'; m.receiveShadow = true; m.userData.gpCar = true; g.add(m);
            });
            parts[name] = g;
          });
          var rig = { root: root, LM: LM, wheels: [], steer: [], sw: parts['steering-wheel'] || null, car: -1, gen: -1, tris: L0.tris };
          ['fl', 'fr', 'rl', 'rr'].forEach(function (c) {
            var w = parts['wheel-' + c], st = parts['steer-' + c];
            if (!w) return;
            if (st) { w.position.set(0, 0, 0); st.add(w); rig.steer.push(st); }
            rig.wheels.push(w);
          });
          Object.keys(parts).forEach(function (name) { if (!parts[name].parent) root.add(parts[name]); });
          var sh = new THREE.Mesh(HSHELL, LM.helmet), vi = new THREE.Mesh(HVIS, VISOR);
          sh.castShadow = !!shadows; sh.receiveShadow = true; sh.userData.gpCar = vi.userData.gpCar = true;
          root.add(sh); root.add(vi); rig.helmet = [sh, vi]; rig.tris += (HSHELL.index.count + HVIS.index.count) / 3;
          root.traverse(function (o) { o.userData.gpCar = true; });
          group.add(root); envify(root);
          return rig;
        }
        // the far cars: one instanced proxy a level, the team colours per instance
        function proxyOf(lod) {
          var Lp = K.lods[lod]; if (!Lp || !Lp.parts.body) return null;
          var sub = Lp.parts.body.subs[0], g = new THREE.BufferGeometry(), att = {};
          for (var k in sub.geometry.attributes) g.setAttribute(k, sub.geometry.attributes[k]);
          g.setIndex(sub.geometry.index); g.boundingSphere = sub.geometry.boundingSphere;
          ['iUp', 'iLow', 'iCo', 'iAcc'].forEach(function (k2) { att[k2] = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 3), 3); att[k2].setUsage(THREE.DynamicDrawUsage); g.setAttribute(k2, att[k2]); });
          var m = new THREE.InstancedMesh(g, patch(new THREE.MeshStandardMaterial({ color: '#ffffff' }), { ao: true, trim: trimU(), inst: true }), CAP);
          m.name = 'gp-cars-' + lod; m.frustumCulled = false; m.castShadow = false; m.receiveShadow = true; m.count = 0; m.userData.gpCar = true;
          m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); group.add(m); envify(m);
          return { mesh: m, att: att, tris: Lp.tris };
        }
        var hero = rigOf(LV.hero, true, true), near = [], PX = { mid: LV.midR > 0 ? proxyOf(LV.mid) : null, far: proxyOf(LV.far) };
        if (!PX.far) PX.far = proxyOf(LV.mid);
        function nearSlot(k) { while (near.length <= k) near.push(rigOf(LV.near, !low, false)); return near[k]; }
        var PT = gpProxyParts(THREE);
        var blobTex = canvasTexture(64, 64, function (g2, w, h) { var gr = g2.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(0,0,0,0.78)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g2.fillStyle = gr; g2.fillRect(0, 0, w, h); });
        var blobs = new THREE.InstancedMesh(PT.blob, new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }), CAP);
        var helmets = new THREE.InstancedMesh(HSHELL, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3, metalness: 0.08 }), CAP);
        [blobs, helmets].forEach(function (m) { m.frustumCulled = false; m.castShadow = false; m.receiveShadow = false; m.count = 0; m.userData.gpCar = true; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); group.add(m); });
        for (var hi = 0; hi < CAP; hi++) helmets.setColorAt(hi, new THREE.Color('#ffffff'));
        envify(helmets);
        scene.add(group);
        // the livery of every car in the race (grid order), worked out once a race: the WHY. cars keep the wordmark and its
        // gold stop, Muse (No. 7) the number the mask carries; every other car hides both in its upper colour
        var cols = [], lastR = null, gen = 0, onboardMode = 'chase';
        function liveries(R) {
          cols = R.cfg.specs.map(function (s) {
            var c = s.colors || {}, why = s.team === 'why', up = c.upper || '#C8CCD2', coach = c.coach || '#DD6135';
            return { up: new THREE.Color(up), low: new THREE.Color(c.lower || '#141518'), coach: new THREE.Color(coach),
              ink: new THREE.Color(why ? OWN.letters || '#080806' : up), gold: new THREE.Color(why ? OWN.gold || '#a08c5a' : up),
              num: new THREE.Color(why && String(s.num) === '7' ? c.number || OWN.number || '#dd6135' : up),
              nut: new THREE.Color(why ? OWN.nut || '#b0301b' : coach), acc: new THREE.Color(s.tcam || '#111111'), helmet: new THREE.Color(GHELM[s.id] || '#D8D8D8') };
          });
          lastR = R; gen++;
        }
        function dress(rig, i) {
          if (rig.car === i && rig.gen === gen) return;
          rig.car = i; rig.gen = gen;
          var c = cols[i]; if (!c) return;
          var U = rig.LM.UL; U.uUp.value.copy(c.up); U.uLow.value.copy(c.low); U.uCoach.value.copy(c.coach); U.uInk.value.copy(c.ink); U.uGold.value.copy(c.gold); U.uNum.value.copy(c.num);
          var P2 = rig.LM.UT.uPal.value; if (SL.nut != null) P2[SL.nut].copy(c.nut); if (SL.accent != null) P2[SL.accent].copy(c.acc);
          rig.LM.helmet.color.copy(c.helmet);
        }
        var POS = [], Q = new THREE.Quaternion(), E = new THREE.Euler(0, 0, 0, 'YXZ'), V = new THREE.Vector3(), S1 = new THREE.Vector3(1, 1, 1), M = new THREE.Matrix4(), CAND = [], drawn = { tris: 0 };
        for (var pi = 0; pi < CAP; pi++) POS.push({ x: 0, y: 0, z: 0, h: 0, p: 0, r: 0 });
        function poseRig(rig, c, P) {
          rig.root.position.set(P.x, P.y, P.z); rig.root.rotation.set(-P.p, Math.PI - P.h, -P.r, 'YXZ');
          var st = c.steerAngle || 0, wa = c.wheelAngle || 0;
          for (var k = 0; k < rig.wheels.length; k++) rig.wheels[k].rotation.set(wa, 0, 0);
          for (var k2 = 0; k2 < rig.steer.length; k2++) rig.steer[k2].rotation.set(0, -st, 0);
          if (rig.sw) rig.sw.quaternion.setFromAxisAngle(SWAX, clamp(-st * 5, -2.4, 2.4));
          rig.LM.UL.uScuff.value = clamp(c.scuff || 0, 0, 1);
          rig.root.visible = true;
        }
        function pose(R, alpha) {
          var S = R.S, cars = S.cars, N = Math.min(cars.length, CAP), f = R.focus();
          if (lastR !== R || cols.length !== cars.length) liveries(R);
          var cx = camera.position.x, cz = camera.position.z, nearR2 = LV.nearR * LV.nearR, midR2 = LV.midR * LV.midR;
          CAND.length = 0;
          for (var i = 0; i < N; i++) {
            var c = cars[i], P = POS[i];
            P.x = c.px + (c.x - c.px) * alpha; P.y = c.py + (c.y - c.py) * alpha; P.z = c.pz + (c.z - c.pz) * alpha; P.h = c.ph + angD(c.h, c.ph) * alpha; P.p = c.pitch || 0; P.r = c.roll || 0;
            P.dd = (P.x - cx) * (P.x - cx) + (P.z - cz) * (P.z - cz); P.lv = 0;
            if (i !== f && P.dd < nearR2) CAND.push(i);
          }
          CAND.sort(function (a, b) { return POS[a].dd - POS[b].dd; });
          var nN = Math.min(CAND.length, GDBG.lod.all ? CAP - 1 : Math.max(0, GDBG.lod.near == null ? LV.nearN : GDBG.lod.near));
          drawn.tris = 0;
          // the hero
          if (f >= 0 && f < N) {
            var cf = cars[f], PF = POS[f];
            dress(hero, f); poseRig(hero, cf, PF); POS[f].lv = 3;
            hero.helmet[0].visible = hero.helmet[1].visible = onboardMode !== 'cockpit';
            GFOCUS.n = f; GFOCUS.x = PF.x; GFOCUS.y = PF.y; GFOCUS.z = PF.z; GFOCUS.h = PF.h; GFOCUS.pitch = PF.p; GFOCUS.roll = PF.r; GFOCUS.v = cf.v; GFOCUS.steerAngle = cf.steerAngle || 0; GFOCUS.d = cf.d;
            drawn.tris += hero.tris;
          } else hero.root.visible = false;
          // the nearest cars, at the middle level
          for (var k = 0; k < Math.max(nN, near.length); k++) {
            if (k < nN) { var ni = CAND[k], rig = nearSlot(k); dress(rig, ni); poseRig(rig, cars[ni], POS[ni]); POS[ni].lv = 2; drawn.tris += rig.tris; }
            else near[k].root.visible = false;
          }
          // the rest: instanced proxies (and their helmets); a ground shadow under every car
          var jm = 0, jf = 0, jh = 0;
          for (var j = 0; j < N; j++) {
            var Pj = POS[j];
            E.set(-Pj.p, Math.PI - Pj.h, -Pj.r, 'YXZ'); Q.setFromEuler(E); V.set(Pj.x, Pj.y, Pj.z); M.compose(V, Q, S1);
            if (!Pj.lv) {
              var px = PX.mid && Pj.dd < midR2 ? PX.mid : PX.far, n2 = px === PX.mid ? jm++ : jf++, cj = cols[j];
              px.mesh.setMatrixAt(n2, M);
              if (cj) { px.att.iUp.setXYZ(n2, cj.up.r, cj.up.g, cj.up.b); px.att.iLow.setXYZ(n2, cj.low.r, cj.low.g, cj.low.b); px.att.iCo.setXYZ(n2, cj.coach.r, cj.coach.g, cj.coach.b); px.att.iAcc.setXYZ(n2, cj.acc.r, cj.acc.g, cj.acc.b); }
              helmets.setMatrixAt(jh, M); if (cj) helmets.setColorAt(jh, cj.helmet); jh++;
              drawn.tris += px.tris;
            }
            V.set(Pj.x, Pj.y + 0.025, Pj.z); M.compose(V, Q, S1); blobs.setMatrixAt(j, M);
          }
          [PX.mid, PX.far].forEach(function (px, w) {
            if (!px) return;
            px.mesh.count = w === 0 ? jm : jf; px.mesh.instanceMatrix.needsUpdate = true;
            for (var key in px.att) px.att[key].needsUpdate = true;
          });
          helmets.count = jh; helmets.instanceMatrix.needsUpdate = true; if (helmets.instanceColor) helmets.instanceColor.needsUpdate = true;
          blobs.count = N; blobs.instanceMatrix.needsUpdate = true;
          drawn.tris += jh * HSHELL.index.count / 3 + N * 2;
        }
        return { pose: pose, group: group, hero: hero.root, CAP: CAP, model: GCARID, levels: LV, tris: function () { return Math.round(drawn.tris); },
          onboard: function (mode) { onboardMode = mode || 'chase'; },
          // (X10, lane E: the near cars made ahead, hidden until posed, so no car is first built in the race)
          prewarm: function () { for (var k = 0; k < LV.nearN; k++) nearSlot(k).root.visible = false; } };
      }

      // the stand-in car (until the library has the model): the code-built single-seater, every other car one
      // InstancedMesh a livery part (per-instance colour), the wheels one more, the ground shadows one more
      function gpProxyView() {
        var PT = gpProxyParts(THREE), CAP = Math.max(2, GCFG && GCFG.all ? GCFG.all.length : 20);
        var group = new THREE.Group(); group.name = 'gp-cars'; group.userData.gpCar = true;
        function std(o) { return new THREE.MeshStandardMaterial(o); }
        var mats = { body: std({ color: '#ffffff', roughness: 0.32, metalness: 0.18 }), aero: std({ color: '#ffffff', roughness: 0.5, metalness: 0.1 }), accent: std({ color: '#ffffff', roughness: 0.4, metalness: 0.1 }),
          helmet: std({ color: '#ffffff', roughness: 0.25, metalness: 0.3 }), wheel: std({ color: '#ffffff', vertexColors: true, roughness: 0.82 }) };
        var blobTex = canvasTexture(64, 64, function (g2, w, h) { var gr = g2.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(0,0,0,0.75)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g2.fillStyle = gr; g2.fillRect(0, 0, w, h); });
        var blobMat = new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
        var I = {};
        ['body', 'aero', 'accent', 'helmet'].forEach(function (k) { I[k] = new THREE.InstancedMesh(PT[k], mats[k], CAP); });
        I.wheel = new THREE.InstancedMesh(PT.wheel, mats.wheel, CAP * 4);
        I.blob = new THREE.InstancedMesh(PT.blob, blobMat, CAP);
        Object.keys(I).forEach(function (k) {
          var m = I[k]; m.frustumCulled = false; m.castShadow = false; m.receiveShadow = k !== 'blob'; m.userData.gpCar = true; m.name = 'gp-cars-' + k;
          m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
          for (var i = 0; i < m.count; i++) m.setMatrixAt(i, GZERO);
          group.add(m);
        });
        ['body', 'aero', 'accent', 'helmet'].forEach(function (k) { for (var i = 0; i < CAP; i++) I[k].setColorAt(i, new THREE.Color('#ffffff')); I[k].instanceColor.needsUpdate = true; });
        // the hero: the same parts as meshes of its own, wheels on steering pivots
        var hero = new THREE.Group(); hero.name = 'gp-hero'; hero.rotation.order = 'YXZ'; hero.userData.gpCar = true;
        var hm = {};
        ['body', 'aero', 'accent', 'helmet'].forEach(function (k) { hm[k] = new THREE.Mesh(PT[k], mats[k].clone()); hm[k].castShadow = true; hm[k].receiveShadow = true; hero.add(hm[k]); });
        var hw = PT.wheels.map(function (w) {
          var pivot = new THREE.Group(); pivot.position.set(w[0], w[1], w[2]);
          var m = new THREE.Mesh(PT.wheel, mats.wheel); m.castShadow = true; pivot.add(m); hero.add(pivot);
          return { pivot: pivot, mesh: m, front: !!w[3] };
        });
        group.add(hero);
        group.traverse(function (o) { if (o.isMesh) o.userData.gpCar = true; });
        envify(group);
        scene.add(group);
        var colored = -1, heroN = -1, N = 0, cols = [], GCOL = new THREE.Color(), GM7 = new THREE.Matrix4();
        function paint(R) {
          N = R.S.cars.length; cols = R.cfg.specs.map(function (s) { var c = s.colors || {}; return { body: c.upper || s.color || '#C8CCD2', aero: c.lower || '#141518', accent: c.coach || '#DD6135', helmet: s.tcam || '#111111' }; });
          for (var i = 0; i < CAP; i++) {
            var c = cols[i]; if (!c) continue;
            ['body', 'aero', 'accent', 'helmet'].forEach(function (k) { I[k].setColorAt(i, GCOL.set(c[k])); });
          }
          ['body', 'aero', 'accent', 'helmet'].forEach(function (k) { I[k].instanceColor.needsUpdate = true; });
          colored = R.seed; heroN = -1;
        }
        function wheelMatrix(base, w, steer, spin, out) {
          GM5.makeRotationY(-steer); GM6.makeRotationX(spin); GM5.multiply(GM6);
          GM5.setPosition(w[0], w[1], w[2]);
          return out.multiplyMatrices(base, GM5);
        }
        function pose(R, alpha) {
          var S = R.S, f = R.focus(), cars = S.cars;
          if (colored !== R.seed || cols.length !== cars.length) paint(R);
          if (f !== heroN) { heroN = f; var c0 = cols[f]; if (c0) ['body', 'aero', 'accent', 'helmet'].forEach(function (k) { hm[k].material.color.set(c0[k]); }); }
          for (var i = 0; i < CAP; i++) {
            var c = cars[i];
            if (!c) { ['body', 'aero', 'accent', 'helmet', 'blob'].forEach(function (k) { I[k].setMatrixAt(i, GZERO); }); for (var w0 = 0; w0 < 4; w0++) I.wheel.setMatrixAt(i * 4 + w0, GZERO); continue; }
            var x = c.px + (c.x - c.px) * alpha, y = c.py + (c.y - c.py) * alpha, z = c.pz + (c.z - c.pz) * alpha, h = c.ph + angD(c.h, c.ph) * alpha;
            GE.set(-(c.pitch || 0), Math.PI - h, -(c.roll || 0), 'YXZ'); GQ.setFromEuler(GE); GV.set(x, y, z);
            GM4.compose(GV, GQ, GS1);
            if (i === f) {
              GFOCUS.n = i; GFOCUS.x = x; GFOCUS.y = y; GFOCUS.z = z; GFOCUS.h = h; GFOCUS.pitch = c.pitch || 0; GFOCUS.roll = c.roll || 0; GFOCUS.v = c.v; GFOCUS.steerAngle = c.steerAngle || 0; GFOCUS.d = c.d;
              hero.position.set(x, y, z); hero.rotation.set(-(c.pitch || 0), Math.PI - h, -(c.roll || 0), 'YXZ');
              for (var hwi = 0; hwi < 4; hwi++) { hw[hwi].pivot.rotation.set(0, hw[hwi].front ? -(c.steerAngle || 0) : 0, 0); hw[hwi].mesh.rotation.set(c.wheelAngle || 0, 0, 0); }
              ['body', 'aero', 'accent', 'helmet'].forEach(function (k) { I[k].setMatrixAt(i, GZERO); });
              for (var w1 = 0; w1 < 4; w1++) I.wheel.setMatrixAt(i * 4 + w1, GZERO);
            } else {
              ['body', 'aero', 'accent', 'helmet'].forEach(function (k) { I[k].setMatrixAt(i, GM4); });
              for (var w2 = 0; w2 < 4; w2++) { var W = PT.wheels[w2]; I.wheel.setMatrixAt(i * 4 + w2, wheelMatrix(GM4, W, W[3] ? (c.steerAngle || 0) : 0, c.wheelAngle || 0, GM7)); }
            }
            GV.set(x, y + 0.025, z); I.blob.setMatrixAt(i, GM4.compose(GV, GQ, GS1));
          }
          Object.keys(I).forEach(function (k) { I[k].instanceMatrix.needsUpdate = true; });
          hero.visible = cars.length > 0;
        }
        return { pose: pose, group: group, hero: hero, I: I, CAP: CAP, model: null, tris: function () { var t = 0; [PT.body, PT.aero, PT.accent, PT.helmet].forEach(function (g) { t += g.attributes.position.count / 3; }); return Math.round(t + 4 * PT.wheel.attributes.position.count / 3); },
          onboard: function (mode) { hm.helmet.visible = mode !== 'cockpit'; }, prewarm: function () {} };
      }

      /* ----------------------------------------------------------------------------------------- the sparks -- */
      // (fix, 15 Oct: contact was never drawn) sparks off a barrier hit, a car-to-car knock and a car scraping along a
      // barrier, near the camera only: one additive point cloud, one draw. A view of the sim's events (never the sim)
      function gpSparks() {
        var N = quality === 'low' ? 160 : 360, pos = new Float32Array(N * 3), col = new Float32Array(N * 3), vel = new Float32Array(N * 3), life = new Float32Array(N), span = new Float32Array(N), floorY = new Float32Array(N);
        var geo = new THREE.BufferGeometry(), pa = new THREE.BufferAttribute(pos, 3), ca = new THREE.BufferAttribute(col, 3);
        pa.setUsage(THREE.DynamicDrawUsage); ca.setUsage(THREE.DynamicDrawUsage); geo.setAttribute('position', pa); geo.setAttribute('color', ca);
        var tex = canvasTexture(32, 32, function (g2, w, h) { var gr = g2.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.75)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g2.fillStyle = gr; g2.fillRect(0, 0, w, h); });
        var mat = new THREE.PointsMaterial({ size: 0.15, map: tex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, sizeAttenuation: true });
        var pts = new THREE.Points(geo, mat); pts.name = 'gp-sparks'; pts.frustumCulled = false; pts.userData.gpCar = true; pts.visible = false; scene.add(pts);
        var next = 0, live = 0, R2 = 180 * 180;
        function near(x, z) { var dx = x - camera.position.x, dz = z - camera.position.z; return dx * dx + dz * dz < R2; }
        // n sparks from (x, y, z), thrown along (vx, vz) (m/s, the car's own motion) and out along (ox, oz)
        function emit(x, y, z, vx, vz, ox, oz, n) {
          if (!near(x, z)) return;
          for (var k = 0; k < n; k++) {
            var i = next; next = (next + 1) % N;
            pos[i * 3] = x + (Math.random() - 0.5) * 0.6; pos[i * 3 + 1] = y + 0.12 + Math.random() * 0.25; pos[i * 3 + 2] = z + (Math.random() - 0.5) * 0.6;
            var sp = 2 + Math.random() * 7;
            vel[i * 3] = vx * (0.45 + Math.random() * 0.4) + ox * sp + (Math.random() - 0.5) * 3; vel[i * 3 + 1] = 0.8 + Math.random() * 3.2; vel[i * 3 + 2] = vz * (0.45 + Math.random() * 0.4) + oz * sp + (Math.random() - 0.5) * 3;
            life[i] = span[i] = 0.18 + Math.random() * 0.42; floorY[i] = y + 0.02;
          }
          live = Math.max(live, 1); pts.visible = true;
        }
        function onCar(c, side, dv) {
          var sh = Math.sin(c.h), ch = Math.cos(c.h), rx = ch, rz = sh, along = (Math.random() - 0.5) * 3.2;
          emit(c.x + rx * side * 1.0 + sh * along, c.y, c.z + rz * side * 1.0 - ch * along, sh * c.v, -ch * c.v, rx * side, rz * side, Math.round(clamp(dv * 2.5, 4, quality === 'low' ? 18 : 36)));
        }
        function event(e, cars) {
          if (!cars) return;
          if (e.e === 'wall' && cars[e.car]) onCar(cars[e.car], e.side === 'R' ? 1 : -1, +e.dv || 1);
          else if (e.e === 'contact' && cars[e.a] && cars[e.b]) {
            var A = cars[e.a], B = cars[e.b], dv = +e.dv || 1, mx = (A.x + B.x) / 2, mz = (A.z + B.z) / 2, nx = B.x - A.x, nz = B.z - A.z, nl = Math.hypot(nx, nz) || 1;
            emit(mx, (A.y + B.y) / 2, mz, Math.sin(A.h) * A.v, -Math.cos(A.h) * A.v, -nz / nl, nx / nl, Math.round(clamp(dv * 2, 3, quality === 'low' ? 14 : 28)));
          }
        }
        // a car pressed along a barrier: a stream while it scrapes
        function scrape(cars, dt) {
          for (var n = 0; n < cars.length; n++) { var c = cars[n]; if (c.wall > 0 && c.v > 8 && Math.random() < dt * (c.v * 0.6)) onCar(c, c.lat > 0 ? 1 : -1, 1.5); }
        }
        function update(dt) {
          if (!live) return;
          var any = 0;
          for (var i = 0; i < N; i++) {
            if (life[i] <= 0) { col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = 0; continue; }
            life[i] -= dt; any++;
            vel[i * 3 + 1] -= 9.81 * dt;
            pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
            if (pos[i * 3 + 1] < floorY[i]) { pos[i * 3 + 1] = floorY[i]; vel[i * 3 + 1] *= -0.35; vel[i * 3] *= 0.6; vel[i * 3 + 2] *= 0.6; }
            var f = Math.max(0, life[i] / span[i]), k = f * f;
            col[i * 3] = 4.2 * k; col[i * 3 + 1] = (1.2 + 1.4 * f) * k; col[i * 3 + 2] = 0.35 * k * f;
          }
          pa.needsUpdate = true; ca.needsUpdate = true;
          if (!any) { live = 0; pts.visible = false; }
        }
        return { event: event, scrape: scrape, update: update, points: pts };
      }
      var GSPK = null;
      try { GSPK = gpSparks(); } catch (e) { warn('The sparks could not be made (' + (e && e.message || e) + ')'); GSPK = null; }

      /* ------------------------------------------------------------------------------ the camera and the HUD -- */
      var GRM = false;
      try { GRM = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { GRM = false; }
      function gpKitOf() { return GPS.kit || null; }
      // (X23, lane B's REQ: the camera's exposure zones reach the picture here, k = 2^ev times the world's own exposure; with
      // no zone in the world the camera asks for k = 1 once, which is the picture as it was)
      var GEXPO = G && isFinite(G.exposure) ? G.exposure : renderer.toneMappingExposure;
      function gpExposure(k) { k = +k; if (!(k > 0) || !isFinite(k)) return; if (G && post && typeof post.setExposure === 'function') post.setExposure(GEXPO * k); else renderer.toneMappingExposure = GEXPO * k; }
      var GENV = { THREE: THREE, three: THREE, camera: camera, renderer: renderer, scene: scene, root: root, el: el, tpad: tpad, tbtn: tbtn, TK: TK, quality: quality, touch: GTOUCH,
        theme: { ink: T.ink, panel: T.panel, accent: T.accent, font: T.font }, fovFor: fovFor, warn: warn, T: GPT, cfg: GCFG || {}, kit: gpKitOf, reduced: GRM, exposure: gpExposure };
      var GCAMV = null, GHUD = null;
      if (GMODS.cam) { try { GCAMV = GMODS.cam.camera(GENV); } catch (e) { fail('The race camera failed: ' + (e && e.message || e)); } }
      if (GMODS.hud && GCFG) { try { GHUD = GMODS.hud.hud(GENV); } catch (e) { fail('The race HUD failed: ' + (e && e.message || e)); } }
      var GTH = GHUD ? GHUD.touch({ manual: GSET.gearbox === 'manual' }) : null, GTHP = { flap: 0, cam: 0, up: 0, down: 0, brakeUp: 0 };
      function hudCall(name) { if (!GHUD || typeof GHUD[name] !== 'function') return null; try { return GHUD[name].apply(GHUD, [].slice.call(arguments, 1)); } catch (e) { fail('The race HUD failed (' + name + '): ' + (e && e.message || e)); GHUD = null; return null; } }
      // (the radio's words: the world's gp.radio { pit: { key: line }, agents: { id: [lines] } } over the roster's own lines;
      // the tunnels, gp.tunnels [[d0, d1]], where no line is spoken)
      if (def.gp && def.gp.radio && typeof def.gp.radio === 'object') hudCall('radioPool', def.gp.radio);
      if (def.gp && Array.isArray(def.gp.tunnels)) hudCall('tunnels', def.gp.tunnels);

      /* --------------------------------------------- the M2 parts: the TV director, the stage, the intro -- */
      // (INTERFACES 8, the M2 amendment: each a factory that may return null, a stub, and then M1's behaviour stays; a
      // part that throws is warned about once and left out, never a failed race)
      var GPENV = { THREE: THREE, three: THREE, camera: camera, renderer: renderer, scene: scene, root: root, el: el, tpad: tpad, tbtn: tbtn, TK: TK, quality: quality, touch: GTOUCH,
        theme: GENV.theme, fovFor: fovFor, warn: warn, T: GPT, cfg: GCFG || {}, cam: GCAMV, hud: GHUD, reduced: GRM, page: gpPage, race: function () { return GR; }, director: null, kit: gpKitOf };
      var GDIR = gpPart('director', typeof GpDirector !== 'undefined' ? GpDirector : null, 'director', GPENV);
      if (GDIR && GCAMV && typeof GDIR.frame === 'function') GCAMV.director(function (c, f, i, dt) { return partCall('GDIR', 'frame', c, f, i, dt); });
      GPENV.director = GDIR;
      // (the director's tape keeps a replay window round each event the one picker scores 60 or more: E's scorer, X32)
      if (GDIR && GDIR.tape && typeof GDIR.tape.scorer === 'function') {
        try { GDIR.tape.scorer(function (e, R0) { if (!R0 || R0.human < 0 || !e) return 0; var o = {}; for (var k in e) o[k] = e[k]; var me = R0.S.cars[R0.human]; if (me && (e.e === 'pass' || e.e === 'overtake') && e.car === R0.human) o.place = me.place;
          var p = gpMomentPick([o], R0.human, { laps: R0.cfg.laps }); return p && !p.fallback ? p.score : 0; }); } catch (e) {}
      }
      var GSTG = gpPart('stage', typeof GpStage !== 'undefined' ? GpStage : null, 'stage', GPENV);
      var GINTRO = gpPart('intro', typeof GpIntro !== 'undefined' ? GpIntro : null, 'intro', GPENV);
      function partCall(which, name) {
        var P = which === 'GDIR' ? GDIR : which === 'GSTG' ? GSTG : which === 'GINTRO' ? GINTRO : null;
        if (!P || typeof P[name] !== 'function') return null;
        try { return P[name].apply(P, [].slice.call(arguments, 2)); }
        catch (e) {
          warn('The Grand Prix ' + (which === 'GDIR' ? 'director' : which === 'GSTG' ? 'stage' : 'intro') + ' failed (' + name + '): ' + (e && e.message || e) + '; it is left out.');
          if (which === 'GDIR') { GDIR = null; GPENV.director = null; if (GCAMV) GCAMV.director(null); } else if (which === 'GSTG') GSTG = null; else { GINTRO = null; gpIntroGone(); }
          return null;
        }
      }

      /* ------------------------------------------------------------------------------------- the flow -- */
      // (lane E, M2) the page's flow (D5, the owner 15 Oct): Play goes straight into the intro (the long one once a session,
      // skippable; the lights are never skipped); RACE AGAIN and Restart go straight to the grid, the first red light 1.2 s
      // after the tap; after your flag the ceremony (the flag, THE MOMENT, the podium: the director's and the stage's
      // shots, each cut when its part has none), then the results; 20 s idle and the demo is back.
      //   GFL.mode   'demo' | 'intro' | 'race' | 'ceremony' | 'results'
      var GFL = { mode: 'demo', variant: null, build: null, rev: 0, hold: 0, skipped: false, t0: 0 };
      var GCER = null, GMOM = null, GLCH = null, GRT = null, GPREP = null, GPLAY = null, GWARM = null, GFT = { on: false, max: 0, n: 0, over: 0, log: [] }, GCTX = { lost: 0, restored: 0 }, GTL = [];
      function nowMs() { return typeof performance !== 'undefined' ? performance.now() : Date.now(); }
      function introOn() { return !!(GINTRO && GFL.mode === 'intro'); }
      function gpIntroGone() { if (GFL.mode === 'intro') { root.classList.remove('gpintro'); gpHand(); } }

      /* ------------------------------------------------------------------------------------------- devices -- */
      // keyboard, gamepad and touch into one Input; the device used last decides
      var GKEY = {}, GEDGE = { up: false, down: false, flap: false }, GSTEER = 0, GRAW = {}, GKST = { steer: 0 }, GDEV = GTOUCH ? 'touch' : 'keys', GPAD = { b: [] };
      var GINP = { steer: 0, throttle: 0, brake: 0, up: false, down: false, flap: false, manual: false, abrake: false, asteer: false, analog: false, touch: false, auto: false };
      var KEYMAP = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'gas', KeyW: 'gas', ArrowDown: 'brake', KeyS: 'brake' };
      // the start (D5, one launch on every device): BRAKE is the clutch on the grid. Held through the rev phase and the
      // lights, it arms the launch; let go after lights out and the car leaves (a release on keys or a pad reaches the race
      // as a throttle press; on touch as the getaway tap). The race's own launch rules (gp-race.js, lane A) time it
      var GHOLD = { armed: false, atGo: false, released: false };
      function racing() { return GRK === 'race' && !!GR && GR.human >= 0 && !GR.S.cars[GR.human].fin && (state === 'race' || state === 'countdown') && !introOn() && !gliding(); }
      // (the director's glide into your hands ends itself, a frame at most after the intro's clock: until it has, the
      // camera is still the glide's, not yet yours)
      function gliding() { if (!GDIR || typeof GDIR.state !== 'function' || GFL.mode !== 'race') return false; try { var ds = GDIR.state(); return ds.shot === 'handoff' && !ds.holding; } catch (e) { return false; } }
      function camCycle() { if (GCAMV) GSET.cam = GCAMV.cycle(racing()); }
      window.addEventListener('keydown', function (e) {
        var code = e.code;
        if (code === 'Enter' || code === 'Space' || code === 'KeyP' || code === 'Escape' || KEYMAP[code] || code === 'KeyE' || code === 'KeyQ' || code === 'KeyV' || code === 'KeyC' || code === 'KeyM' || code === 'KeyR') e.preventDefault();
        ensureAudio();
        if (KEYMAP[code]) { GKEY[KEYMAP[code]] = true; GDEV = 'keys'; }
        if (e.repeat) return;
        // (a sheet or a card on screen: its keys)
        if (GSCR && state === 'paused' && (code === 'KeyP' || code === 'Escape')) { togglePause(); return; }
        if (GSCR && state === 'paused' && typeof GSCR.key === 'function' && GSCR.key(code)) return;
        if (GSCR && state === 'results' && typeof GSCR.key === 'function' && GSCR.key(code)) return;
        if (GSCR && (code === 'Enter' || code === 'Space')) { var sc = GSCR; GSCR = null; sc.go(); return; }
        if (GSCR && state === 'title' && (code === 'ArrowLeft' || code === 'ArrowRight') && typeof GSCR.pick === 'function') { GSCR.pick(code === 'ArrowLeft' ? -1 : 1); return; }
        if (demo && (code === 'Enter' || code === 'Space' || KEYMAP[code])) { showStart(); return; }
        if (state === 'results' && (code === 'Enter' || code === 'Space')) { startCountdown(null); return; }
        if (code === 'KeyP' || code === 'Escape') { togglePause(); return; }
        // the intro: any other key skips it (the lights are never skipped)
        if (introOn() && !GSCR) { partCall('GINTRO', 'skip'); return; }
        // the ceremony: a fresh key skips the beat
        if (GFL.mode === 'ceremony') { gpCerSkip(); return; }
        if (state !== 'race' && state !== 'countdown') return;
        if (code === 'Space') { GEDGE.flap = true; GDEV = 'keys'; }
        else if (code === 'KeyE') GEDGE.up = true;
        else if (code === 'KeyQ') GEDGE.down = true;
        else if (code === 'KeyV') camCycle();
        else if (code === 'KeyC' && GCAMV) GCAMV.look(true);
      });
      window.addEventListener('keyup', function (e) {
        if (KEYMAP[e.code]) GKEY[KEYMAP[e.code]] = false;
        if (e.code === 'KeyC' && GCAMV) GCAMV.look(false);
      });
      window.addEventListener('blur', function () { GKEY = {}; if (state === 'countdown' && !demo && !paused) togglePause(); });
      // (locking the phone, a call, another tab: the race pauses in every phase, the intro, the grid and the lights
      // included; v1 pauses its own 'race' state, so this listens for the rest only. EXPERIENCE X26)
      document.addEventListener('visibilitychange', function () { if (document.hidden && state === 'countdown' && !demo && !paused) togglePause(); });
      // a tap: skips the intro (not on its seat chip or a sheet); a fresh one skips a beat of the ceremony; on touch a
      // tap after lights out is the getaway (M1); a tap on the results' postcard does nothing (the bar's buttons do)
      var GTAPGO = false;
      window.addEventListener('pointerdown', function (e) {
        var tg = e.target && e.target.closest ? e.target : null;
        if (tg && tg.closest('.screen, .gpi .seat, .tpad, .stick, .pause')) return;
        if (introOn() && !GSCR) { partCall('GINTRO', 'skip'); return; }
        if (GFL.mode === 'ceremony' && !GSCR) { gpCerSkip(); return; }
        if (GST && GST.go) GTAPGO = true;
      }, true);
      function touchHold() {
        if (!GR || GR.human < 0 || !GST) return false;
        var me = GST.cars && GST.cars[GR.human];
        return !GTAPGO && !(GST.go && me && me.launched);
      }
      function pad() {
        var gp0 = null;
        try { var all = navigator.getGamepads ? navigator.getGamepads() : []; for (var i = 0; i < all.length; i++) if (all[i] && all[i].connected) { gp0 = all[i]; break; } } catch (e) { gp0 = null; }
        return gp0;
      }
      function readInput(dt) {
        var I = GINP, gp0 = pad(), b = gp0 ? gp0.buttons : null;
        function pressed(k) { return !!(b && b[k] && (b[k].pressed || b[k].value > 0.5)); }
        function edge(k) { var p = pressed(k), was = !!GPAD.b[k]; GPAD.b[k] = p; return p && !was; }
        if (gp0) {
          var ax = gp0.axes && gp0.axes.length ? gp0.axes[0] : 0;
          if (Math.abs(ax) > 0.12 || pressed(7) || pressed(6) || pressed(0)) GDEV = 'pad';
          var anyEdge = false; for (var bi = 0; bi < (b ? b.length : 0); bi++) if (bi !== 9 && edge(bi)) { anyEdge = true; GPAD.e = GPAD.e || {}; GPAD.e[bi] = true; }
          if (edge(9) || GPAD.e && GPAD.e[9]) { ensureAudio(); if (GSCR && state !== 'paused') { var sc = GSCR; GSCR = null; sc.go(); } else if (demo) showStart(); else togglePause(); }
          var E0 = GPAD.e || {}; GPAD.e = {};
          if (introOn() && anyEdge && !GSCR) partCall('GINTRO', 'skip');
          else if (GFL.mode === 'ceremony' && anyEdge && !GSCR) gpCerSkip();
          else if (state === 'results' && GSCR) { if (E0[0]) { var sr = GSCR; GSCR = null; sr.go(); } else if (E0[2] && typeof GSCR.key === 'function') GSCR.key('KeyM'); }
          else if (E0[0]) { if (GSCR) { var sc2 = GSCR; GSCR = null; sc2.go(); } else if (demo) showStart(); else GEDGE.flap = true; }
          if (E0[5]) GEDGE.up = true;
          if (E0[4]) GEDGE.down = true;
          if (E0[3]) camCycle();
        }
        if (GTH) {
          var P = GTH.presses;
          if (P.flap !== GTHP.flap) { GTHP.flap = P.flap; GEDGE.flap = true; GDEV = 'touch'; }
          if (P.cam !== GTHP.cam) { GTHP.cam = P.cam; camCycle(); }
          if (P.up !== GTHP.up) { GTHP.up = P.up; GEDGE.up = true; }
          if (P.down !== GTHP.down) { GTHP.down = P.down; GEDGE.down = true; }
          if (GTH.brake || GTH.gas || TK.on) GDEV = 'touch';
        }
        var brakeNow = GDEV === 'touch' ? !!(GTH && GTH.brake) : GDEV === 'pad' && gp0 ? !!(b && b[6] && b[6].value >= 0.5) : !!GKEY.brake;
        gpHoldStep(brakeNow);
        if (GMODS.sim && typeof GMODS.sim.mapInput === 'function') {
          // (the sim's own mapping, lane S: the same ramps, deadzones and curves for every page and test)
          var raw = GRAW;
          raw.left = !!GKEY.left; raw.right = !!GKEY.right; raw.up = !!GKEY.gas || GHOLD.released && GDEV === 'keys'; raw.down = !!GKEY.brake;
          raw.pad = gp0 && GDEV === 'pad' ? { x: gp0.axes && gp0.axes.length ? gp0.axes[0] : 0, thr: GHOLD.released ? 1 : b && b[7] ? b[7].value : 0, brk: b && b[6] ? b[6].value : 0 } : null;
          raw.touch = GDEV === 'touch' ? { x: TK.on ? TK.jx : 0, brake: !!(GTH && GTH.brake), hold: touchHold() } : null;
          raw.last = GDEV === 'keys' ? 'key' : GDEV;
          raw.flap = GEDGE.flap; raw.gearUp = GEDGE.up; raw.gearDown = GEDGE.down; raw.manual = GSET.gearbox === 'manual';
          raw.assists = { brake: !GSET.pro, steer: !GSET.pro }; raw.auto = false;
          GMODS.sim.mapInput(raw, GKST, dt, I);
          GEDGE.up = GEDGE.down = GEDGE.flap = false;
          if (GSET.steer !== 1) I.steer = clamp(I.steer * GSET.steer, -1, 1);
          return I;
        }
        if (GDEV === 'pad' && gp0) {
          var a0 = gp0.axes[0] || 0;
          I.steer = Math.abs(a0) > 0.12 ? clamp((a0 - Math.sign(a0) * 0.12) / 0.88, -1, 1) : 0;
          I.throttle = GHOLD.released ? 1 : b[7] ? clamp(b[7].value, 0, 1) : 0; I.brake = b[6] ? clamp(b[6].value, 0, 1) : 0; I.analog = true; I.touch = false;
        } else if (GDEV === 'touch') {
          var jx = TK.on ? TK.jx : 0;
          I.steer = Math.abs(jx) > 0.08 ? clamp((jx - Math.sign(jx) * 0.08) / 0.92, -1, 1) : 0;
          var br = !!(GTH && GTH.brake);
          I.throttle = br || touchHold() ? 0 : 1; I.brake = br ? 1 : 0; I.analog = true; I.touch = true;
        } else {
          var want = (GKEY.right ? 1 : 0) - (GKEY.left ? 1 : 0), rate = want === 0 || GSTEER * want < 0 ? 5 : 3;
          GSTEER += clamp(want - GSTEER, -rate * dt, rate * dt);
          I.steer = GSTEER; I.throttle = GKEY.gas || GHOLD.released ? 1 : 0; I.brake = GKEY.brake ? 1 : 0; I.analog = false; I.touch = false;
        }
        if (GSET.steer !== 1) I.steer = clamp(I.steer * GSET.steer, -1, 1);
        I.up = GEDGE.up; I.down = GEDGE.down; I.flap = GEDGE.flap; GEDGE.up = GEDGE.down = GEDGE.flap = false;
        I.manual = GSET.gearbox === 'manual'; I.abrake = I.asteer = !GSET.pro; I.auto = false;
        return I;
      }
      // the launch's device side: armed while BRAKE is held on the grid and through the lights; at lights out, still armed,
      // its release is the launch (until the car has left)
      function gpHoldStep(brakeNow) {
        var st = GST, me = st && GR && GR.human >= 0 ? st.cars[GR.human] : null;
        if (!me || GRK !== 'race' || introOn()) { GHOLD.armed = GHOLD.atGo = GHOLD.released = false; return; }
        if (st.phase === 'grid' || st.phase === 'lights') { GHOLD.armed = brakeNow; GHOLD.atGo = brakeNow; GHOLD.released = false; return; }
        if (st.go && !me.launched) {
          if (GHOLD.atGo && !brakeNow && !GHOLD.released) { GHOLD.released = true; if (GDEV === 'touch') GTAPGO = true; }
          GHOLD.armed = brakeNow;
          return;
        }
        GHOLD.armed = false; GHOLD.released = false; GHOLD.atGo = false;
      }

      /* ------------------------------------------------------------------------------------ the haptics (X4) -- */
      // (Should) a pad's dual rumble (Chrome's vibrationActuator) and an Android phone's buzz (navigator.vibrate): the kerbs
      // weak, a lock-up, a contact, a crest's landing and the launch strong, the limiter and the Flap's clack weak. Never
      // more than one effect every 50 ms; none while the pause sheet's switch is off; iOS has no vibration
      var GBZ = { last: -1e9, log: [] }, BUZZ = { kerb: [20, 0, 0.35, 12], lockup: [60, 1, 0.4, 30], contact: [120, 1, 0.6, 40], land: [80, 1, 0.5, 30], launch: [150, 1, 0.5, 0], limiter: [40, 0, 0.3, 0], flap: [30, 0, 0.5, 0] };
      function gpBuzz(kind) {
        var B = BUZZ[kind]; if (!B || !GSET.haptics || demo) return false;
        var now = nowMs(); if (now - GBZ.last < 50) return false;
        var done = false, gp0 = GDEV === 'pad' ? pad() : null;
        try { if (gp0 && gp0.vibrationActuator && typeof gp0.vibrationActuator.playEffect === 'function') { gp0.vibrationActuator.playEffect('dual-rumble', { duration: B[0], strongMagnitude: B[1], weakMagnitude: B[2] }); done = true; } } catch (e) {}
        try { if (!done && GDEV === 'touch' && B[3] > 0 && typeof navigator.vibrate === 'function') { navigator.vibrate(B[3]); done = true; } } catch (e) {}
        if (done || GDBG.buzz) { GBZ.last = now; GBZ.log.push({ kind: kind, t: Math.round(now) }); if (GBZ.log.length > 200) GBZ.log.shift(); }
        return done;
      }
      function gpBuzzEvent(e, you) {
        if (you < 0) return;
        if (e.e === 'contact' && (e.a === you || e.b === you)) gpBuzz('contact');
        else if (e.e === 'wall' && e.car === you) gpBuzz('contact');
        else if (e.e === 'land' && e.car === you && +e.g > 1.3) gpBuzz('land');
        else if (e.e === 'launch' && e.car === you) gpBuzz('launch');
        else if (e.e === 'mistake' && e.car === you && /lock/i.test(String(e.kind || ''))) gpBuzz('lockup');
        else if (e.e === 'flap' && e.car === you && e.state === 'open') gpBuzz('flap');
      }

      /* ---------------------------------------------------------------------------------------- the sound -- */
      // M2's gp-audio.js takes over when it is in the tree; until then the runtime's v6formula engine (vehicle.js) for the
      // focus car and the three nearest. No music anywhere; the demo is silent; in the intro the engines wait for their
      // beat (the grid's engines firing), and the harbour and the helicopter are gp-audio.js's
      var GAUD = null, GAUDF = false, GVOX = [];
      function sound(dt) {
        if (!audio || typeof GameMogVehicles === 'undefined' || !GR) return;
        var ist = introOn() && GINTRO ? GINTRO.state() : null, preEngines = !!ist && !(ist.log || []).some(function (l) { return l.e === 'engines' || l.e === 'skip'; });
        var silent = demo || state === 'title' || state === 'paused' || state === 'results' || preEngines;
        gpAudioMake();
        var cars = GR.S.cars, f = GR.focus(), F = cars[f];
        if (GAUD && typeof GAUD.frame === 'function') {
          if (demo || state === 'paused' || state === 'title') return;
          // (lane D's view: the sim's own cars and time, or the director's tape while it replays; the camera's mode: 'tv'
          // while the intro or a replay frames the shot, else the player's chase, T-cam or cockpit, or the director's 'tv')
          var RV = GDIR && typeof GDIR.replaying === 'function' && GDIR.replaying() && typeof GDIR.view === 'function' ? partCall('GDIR', 'view') : null, VS = RV ? RV.S : GR.S;
          try {
            GAUD.frame({ cars: VS.cars, focus: RV ? RV.focus() : f, human: GR.human, phase: GST ? GST.phase : null, replay: RV ? {} : null, t: VS.t },
              { x: camera.position.x, y: camera.position.y, z: camera.position.z, qx: camera.quaternion.x, qy: camera.quaternion.y, qz: camera.quaternion.z, qw: camera.quaternion.w, onboard: GSET.cam !== 'chase', mode: introOn() || RV ? 'tv' : GCAMV ? GCAMV.mode() : null, tunnel: false }, dt);
          } catch (e) { warn('The race sound failed: ' + (e && e.message || e)); GAUD = null; }
          // (the v4 bank could not load: the stand-in voice below plays the engines under the world's sound)
          if (!(GAUD && typeof GAUD.failed === 'function' && GAUD.failed())) return;
        }
        if (silent || !F) { GVOX.forEach(function (v) { if (v) v.mix(0, 0); }); return; }
        var near = cars.map(function (c, i) { return { c: c, i: i, dd: i === f ? -1 : Math.hypot(c.x - F.x, c.z - F.z) }; }).filter(function (q) { return q.dd < 120; }).sort(function (a, b) { return a.dd - b.dd; }).slice(0, 4);
        camera.getWorldDirection(GV); var rx = -GV.z, rz = GV.x, rl = Math.hypot(rx, rz) || 1;
        for (var k = 0; k < 4; k++) {
          var q = near[k], v = GVOX[k];
          if (!v) { try { v = GVOX[k] = GameMogVehicles.engine(audio.ctx, audio.engines, 'v6formula'); } catch (e) { return; } }
          if (!q) { v.mix(0, 0); continue; }
          var c = q.c, P = GMODS.sim.CAR, rf = clamp((c.rpm - P.idle) / (P.redline - P.idle), 0, 1);
          v.set(c.rpm, c.thr, c.v);
          var lvl = q.i === f ? 0.42 + 0.58 * Math.max(rf * (0.55 + 0.45 * c.thr), 0.1) : Math.pow(clamp(1 - q.dd / 120, 0, 1), 1.6) * 0.8;
          var pan = q.i === f ? 0 : clamp(((c.x - camera.position.x) * rx + (c.z - camera.position.z) * rz) / rl / 14, -0.9, 0.9);
          v.mix(lvl, pan);
          if (c.shift > 0 || c.pop) v.pop(1);
        }
      }
      // the sound part (gp-audio.js), made once the page has its audio (the first gesture)
      function gpAudioMake() {
        if (!audio || typeof gpAudio !== 'function' || GAUDF) return;
        // (lane D's env, INTERFACES 2.12 grown: the page, the library's asset records and their hash-checked files, the master
        // for the world's buses, the lap table, the race's cfg and a seed; without win, asset and fetch it returns null)
        GAUDF = true; try { GAUD = gpAudio({ ac: audio.ctx, out: audio.engines, master: audio.master, quality: quality, warn: warn, win: window, T: GPT, cfg: GCFG, seed: GR ? GR.seed : 1,
          asset: function (id) { return ASSETS[id] || null; }, fetch: function (id, name) { var a = ASSETS[id]; return a ? fetchChecked(id, name, a.entry) : Promise.reject(new Error(id + ' is not loaded')); } }); } catch (e) { GAUD = null; warn('The race sound failed: ' + (e && e.message || e)); }
      }
      // (the sheet's volumes: the master and the engines on the runtime's own buses; the crowd and the radio click are
      // gp-audio.js's, told as a 'settings' event)
      function gpVolumes() {
        if (!audio) return;
        try { audio.master.gain.value = 0.55 * clamp(GSET.vol.master, 0, 1); audio.engines.gain.value = 0.9 * clamp(GSET.vol.engine, 0, 1); } catch (e) {}
        if (GAUD && typeof GAUD.event === 'function') { try { GAUD.event('settings', { vol: GSET.vol, tones: GSET.tones }); } catch (x) {} }
      }

      /* --------------------------------------------------------------------------------------- the races -- */
      // a race, built (the sim, the AI and the rules: GpRace.race, the same call the Node harness makes). gridHold: the
      // seconds of revs on the grid before the first red light, given to the race as its rev phase (o.rev, X29/D5: 3.0
      // the first race, 1.2 a race again, 2.0 after a skip; none: the world's gp.lights.gridHold)
      function gpBuild(o) {
        o = o || {};
        var t0 = nowMs();
        var R = GMODS.race.race({ GpSim: GMODS.sim, GpAI: GMODS.ai }, GPT, def.gp, {
          seed: o.seed != null ? o.seed >>> 0 : nextSeed(), you: o.you === undefined ? GSET.you : o.you, demo: !!o.demo, autopilot: !!o.autopilot, solo: !!o.solo,
          laps: o.laps, skipLights: o.skipLights, assists: o.assists || { brake: !GSET.pro, steer: !GSET.pro }, gearbox: o.gearbox || GSET.gearbox,
          gridSlot: o.gridSlot, field: o.field, rev: o.gridHold != null ? o.gridHold : undefined, line: GLINE, lineIterations: 600, warn: warn,
        });
        if (!GLINE) { GLINE = R.line; GLINEMS = nowMs() - t0; gpStep('line: ' + Math.round(GLINEMS) + ' ms'); }
        R.buildMs = Math.round(nowMs() - t0); R.gridHold = o.gridHold == null ? null : o.gridHold; R.you = o.you === undefined ? GSET.you : o.you;
        return R;
      }
      function gpUse(R) {
        if (GDBG.used && typeof R.markAssisted === 'function') R.markAssisted();
        GR = R; GST = null; GDBG.events = []; GTAPGO = false; GPASS = 0; GEARNED = 0; GPASSEV = false; GLCH = null; GMOM = null; GCER = null; GEV = [];
        GHOLD.armed = GHOLD.atGo = GHOLD.released = false;
        if (GCAMV) GCAMV.reset();
        hudCall('lights', 0);
        // (the braking points for the radio: where the AI's profile starts to slow for a corner, once a line)
        if (GR.prof && GLINE && GBRK.sig !== GLINE.sig) { GBRK.sig = GLINE.sig; GBRK.list = gpBrakes(GR.prof); }
        hudCall('brakes', GBRK.list);
        return R;
      }
      var GBRK = { sig: null, list: [] };
      function gpBrakes(prof) {
        var out = [], n = prof.length, ds = GPT.L / n;
        for (var i = 0; i < n; i++) {
          var a = prof[(i - 1 + n) % n], b0 = prof[i], c = prof[(i + 1) % n];
          if (b0 >= a && c < b0) { var j = i, drop = 0; while (j < i + n && prof[(j + 1) % n] < prof[j % n] + 1e-6) { drop = b0 - prof[(j + 1) % n]; j++; } if (drop > 12) out.push(Math.round(i * ds)); }
        }
        return out;
      }
      function newRace(o) { return gpUse(gpBuild(o)); }
      var GEV = [], GEARNED = 0, GPASSEV = false;
      function drain() {
        if (!GR) return;
        var ev = GR.drain(), you = GR.human;
        for (var i = 0; i < ev.length; i++) {
          var e = ev[i];
          // (the debug log keeps every event but the gear changes, about 4,500 a race, which would push the rest out)
          if (e.e !== 'shift') { GDBG.events.push(e); if (GDBG.events.length > 3000) GDBG.events.shift(); }
          if (e.e === 'light') { hudCall('lights', e.n); gpLightSeen(e); }
          else if (e.e === 'go') { hudCall('lights', -1); GLCH = { goT: e.t, you: null, at: null, ai: {}, ev: false, shown: false }; GTL.push({ e: 'go', w: nowMs(), hold: e.hold }); }
          if ((e.e === 'contact' || e.e === 'wall') && GCAMV && (e.car === GR.focus() || e.a === GR.focus() || e.b === GR.focus())) GCAMV.event(e);
          if ((e.e === 'contact' || e.e === 'wall') && GSPK && !GDBG.headless) GSPK.event(e, GR.S.cars);
          if (e.e === 'launch' && GLCH) { var rr = e.reaction != null ? +e.reaction : +e.react; if (e.car === you) { GLCH.you = rr; GLCH.at = e.t; GLCH.mode = e.mode || e.why; } else if (isFinite(rr)) { GLCH.ai[e.car] = rr; GLCH.ev = true; } }
          if (GHUD && typeof GHUD.event === 'function') hudCall('event', e);
          // the M2 parts and the sound hear every race event (INTERFACES 8, the M2 amendment)
          if (GDIR) partCall('GDIR', 'event', e);
          if (GSTG) partCall('GSTG', 'event', e);
          if (GINTRO) partCall('GINTRO', 'event', e);
          if (GAUD && typeof GAUD.event === 'function') { try { GAUD.event(e.e, e); } catch (x) { warn('The race sound failed: ' + (x && x.message || x)); GAUD = null; } }
          if (GRK !== 'race' || GR.demo) continue;
          gpBuzzEvent(e, you);
          // the world's moments (G9): the player's flagged
          var mine = you >= 0 && (e.car === you || e.a === you || e.b === you), data = {};
          for (var k in e) if (k !== 'e') data[k] = e[k];
          if (mine) data.you = true;
          if (e.e === 'overtake' && e.car === you) GPASS++;
          if (e.e === 'pass') { GPASSEV = true; if (e.car === you && e.earned !== false) GEARNED++; }
          // (THE MOMENT's log: the player's moves, with the place they gave, and what happened near the player)
          if (mine || e.e === 'mistake' || e.e === 'finish' || e.e === 'lap') gpMomentLog(e, you);
          if (mine && (e.e === 'launch' || (e.e === 'lap' && e.car === you) || (e.e === 'finish' && e.car === you))) gpTell(e);
          // the run's report (GameMog.finish): at the player's flag, or at the end with the player classified
          if ((e.e === 'finish' && e.car === you) || e.e === 'end') gpFinish();
          if (e.e === 'finish' && e.car === you) gpCeremony();
          if (e.e === 'light') emit('lights', data);
          else if (e.e === 'go') { emit('go', data); emit('start', data); }
          else if (/^(lap|overtake|contact|limits|flap|finish|end|pass|finalLap|mistake)$/.test(e.e)) emit(e.e, data);
          else if (e.e === 'launch' && mine) emit('launch', data);
        }
      }
      function gpMomentLog(e, you) {
        var o = {}; for (var k in e) o[k] = e[k];
        var me = GR.S.cars[you];
        if ((e.e === 'pass' || e.e === 'overtake') && e.car === you && me) o.place = me.place;
        if (e.e === 'mistake' && me && e.car !== you) { var c = GR.S.cars[e.car]; if (c) { var dd = GPT.wrap(c.d - me.d); o.ahead = dd < GPT.L / 2 ? dd : dd - GPT.L; } }
        GEV.push(o); if (GEV.length > 600) GEV.shift();
      }
      // the reaction, ranked among the twenty (X29): the player's from its launch; the agents' from their launch events
      // (lane A) or, until those exist, from each agent's own launch countdown as the sim keeps it (car.ai.react)
      function gpLaunchWatch() {
        if (!GLCH || !GR || GR.human < 0 || GLCH.shown) return;
        var S = GR.S, H = S.H || 1 / 120;
        if (!GLCH.ev) for (var i = 0; i < S.cars.length; i++) {
          if (i === GR.human || GLCH.ai[i] != null) continue;
          var A = S.cars[i].ai; if (A && A.go === 1 && isFinite(A.react)) GLCH.ai[i] = A.react + (S.t - GLCH.goT) + H;
        }
        if (GLCH.you != null && S.t >= GLCH.at + 0.6 - 1e-9) {
          GLCH.shown = true;
          var keys = Object.keys(GLCH.ai), rank = 1;
          keys.forEach(function (k) { if (GLCH.ai[k] < GLCH.you) rank++; });
          var of = keys.length + 1;
          hudCall('reaction', GLCH.you, keys.length >= Math.min(5, S.cars.length - 1) ? rank : null, of);
          GLCH.rank = rank; GLCH.of = of;
        }
      }
      // the run's report to the page (lib/custom-game.ts hostScript GameMog.finish, a Grand Prix's own keys): once a race,
      // the player's place, time and laps, the grid slot it started from, its best lap, strikes, contacts and passes,
      // the seed, the field's pace and the aids tag (D3, 15 Oct: 'on' | 'off' | 'pro', never 'assisted' for the driving
      // aids; assisted only for the autopilot, the time controls and the debug hooks, which the page refuses)
      function gpFinish() {
        if (!GR || GR.human < 0 || GFINR === GR || GRK !== 'race') return;
        var st = GR.state({}), me = st.cars[GR.human], rows = GR.classification(), row = null;
        for (var i = 0; i < rows.length; i++) if (rows[i].n === GR.human) row = rows[i];
        if (!me || !row || (!me.fin && !st.done)) return;
        GFINR = GR;
        var timeS = row.time != null ? row.time : (me.raceT != null ? me.raceT : st.raceT);
        var res = { won: row.pos === 1, place: row.pos, timeMs: Math.max(0, Math.round((timeS || 0) * 1000)), score: 0, level: me.lap, gm: 0,
          assisted: !!st.assisted, gp: true, aids: st.aids || 'on', grid: st.gridSlot, field: st.field, laps: me.lap, of: st.laps,
          bestLapMs: me.best != null ? Math.round(me.best * 1000) : 0, strikes: me.strikes | 0, penaltyMs: Math.round((me.penalty || 0) * 1000),
          // (passes: the earned ones once the race writes pass { earned } (lane A); M1's raw overtakes until then)
          contacts: me.contacts | 0, passes: GPASSEV ? GEARNED : GPASS, seed: GR.seed, classified: !me.fin };
        // (D4: the next race starts from this place + 3; the session's best lap, for the results' PB)
        GSES.last = row.pos; GSES.sent++;
        GSES.pb = me.best != null && (GSES.best == null || me.best < GSES.best - 1e-9);
        if (me.best != null && (GSES.best == null || me.best < GSES.best)) GSES.best = me.best;
        GFIN = res;
        try { GM.finish(res); } catch (x) {}
      }
      function gpState() {
        var out = GR ? GR.state({}) : { phase: null, cars: [] };
        out.ready = true; out.state = state; out.demo = demo; out.kind = GRK; out.parts = { sim: !!GMODS.sim, ai: !!GMODS.ai, race: !!GMODS.race, kit: typeof gpKit === 'function', audio: typeof gpAudio === 'function',
          cam: !!GCAMV, hud: !!GHUD, director: !!GDIR, stage: !!GSTG, intro: !!GINTRO, car: !!GCVX };
        // (M2: the session (D4), the run's report as sent (D3), the director and page events written; lane E: the flow)
        out.session = { races: GSES.races, last: GSES.last, dare: GSES.dare, next: gpSlot(), sent: GSES.sent, introSeen: GSES.introSeen, best: GSES.best }; out.finish = GFIN; out.pageEvents = GPAGE.length;
        out.flow = { mode: GFL.mode, variant: GFL.variant, rev: GFL.rev, ceremony: GCER ? { beat: GCER.beat, t: +GCER.t.toFixed(2), log: GCER.log.slice() } : null, lastCeremony: GFL.lastCer || null, moment: GMOM ? { kind: GMOM.kind, score: GMOM.score, t: GMOM.t, caption: GMOM.caption } : null,
          reaction: GLCH && GLCH.shown ? { you: GLCH.you, rank: GLCH.rank, of: GLCH.of, mode: GLCH.mode || null } : null, prepared: !!GPREP, playReady: !!GPLAY, playPrepared: !!GFL.prepared, hold: { armed: GHOLD.armed, released: GHOLD.released } };
        out.settings = { cam: GSET.cam, pro: GSET.pro, gearbox: GSET.gearbox, tones: GSET.tones, haptics: GSET.haptics, vol: { master: GSET.vol.master, engine: GSET.vol.engine, crowd: GSET.vol.crowd, click: GSET.vol.click }, steer: GSET.steer, you: GSET.you };
        out.cam = GCAMV ? GCAMV.state().mode : 'fly'; out.assists = { brake: !GSET.pro, steer: !GSET.pro }; out.gearbox = GSET.gearbox; out.pro = GSET.pro; out.device = GDEV;
        out.L = GPT.L; out.n = GPT.n; out.ds = GPT.ds; out.trackSig = GPT.sig; out.lineSig = GLINE ? GLINE.sig : null; out.lineMs = Math.round(GLINEMS);
        out.seed = GR ? GR.seed : null; out.steps = GR ? GR.S.steps : 0; out.hash = GR ? GR.hash() : null; out.lapModel = GR ? GR.lapModel : null;
        if (GDBG.used) out.assisted = true;
        out.car = { model: GCV.model || 'stand-in', levels: GCV.levels || null };
        out.render = { calls: GCOST.calls, tris: GCOST.tris, mainCalls: post ? post.calls : null, mainTris: post ? post.tris : null, frameMs: +GCOST.ms.toFixed(2), dpr: renderer.getPixelRatio(), quality: quality, frames: frames, carTris: GCV.tris() };
        out.warm = GWARM ? { done: GWARM.done, jobs: GWARM.jobs.length, ms: GWARM.ms.slice() } : null; out.ctx = { lost: GCTX.lost, restored: GCTX.restored };
        return out;
      }

      /* ---------------------------------------------------------------------------- compile ahead (X10) -- */
      // (lane E) during the demo, a job a frame: every program the scene draws with compiled for this camera and every
      // texture sent up (kart.js prepJobs' pattern), and the car view's near cars made, so the intro's first cut and the
      // race never meet a first draw. The intro holds its helicopter until this is done (X17's hold path)
      function gpWarm() {
        var J = [];
        J.push(function () { if (GCV && typeof GCV.prewarm === 'function') GCV.prewarm(); });
        J.push(function () { var p0 = renderer.info.programs ? renderer.info.programs.length : 0; renderer.compile(scene, camera); GWARM.programs = [p0, renderer.info.programs ? renderer.info.programs.length : 0]; });
        J.push(function () {
          var seen = new Set();
          scene.traverse(function (o) {
            var ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
            ms.forEach(function (m) {
              ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'alphaMap', 'aoMap', 'envMap', 'clearcoatNormalMap'].forEach(function (k) { var tx = m[k]; if (tx && tx.isTexture && !seen.has(tx)) { seen.add(tx); try { renderer.initTexture(tx); } catch (e) {} } });
              if (m.uniforms) for (var u in m.uniforms) { var v = m.uniforms[u] && m.uniforms[u].value; if (v && v.isTexture && !v.isRenderTargetTexture && !seen.has(v)) { seen.add(v); try { renderer.initTexture(v); } catch (e) {} } }
            });
          });
          if (scene.background && scene.background.isTexture && !seen.has(scene.background)) { try { renderer.initTexture(scene.background); } catch (e) {} }
          if (scene.environment && scene.environment.isTexture) { try { renderer.initTexture(scene.environment); } catch (e) {} }
        });
        return { jobs: J, i: 0, done: false, ms: [], wait: 45 };
      }
      function gpWarmStep() {
        if (!GWARM || GWARM.done) return;
        if (GWARM.wait > 0) { GWARM.wait--; return; }
        var t0 = nowMs();
        try { GWARM.jobs[GWARM.i](); } catch (e) { warn('The Grand Prix warm-up (' + GWARM.i + ') failed: ' + (e && e.message || e)); }
        GWARM.ms.push(Math.round(nowMs() - t0)); GWARM.i++;
        if (GWARM.i >= GWARM.jobs.length) { GWARM.done = true; gpStep('warm: ' + GWARM.ms.join('/') + ' ms'); }
      }
      function gpReady() { var K0 = GPS.kit; return (!GWARM || GWARM.done) && !(K0 && typeof K0.ready === 'function' && !K0.ready()) && !(GDBG.notReady && nowMs() < GDBG.notReady); }

      /* ---------------------------------------------------------------------------------- THE MOMENT (X32) -- */
      // the one picker (lane E, gpMomentPick, pure) over the race's log; the director plays it (lane B) when it can
      function gpPickMoment() {
        if (!GR || GR.human < 0) return null;
        var specs = GR.cfg.specs || [], best = null, st = GR.state({});
        var heavy = def.gp && def.gp.intro && Array.isArray(def.gp.intro.heavy) ? def.gp.intro.heavy : null;
        try { best = gpMomentPick(GEV, GR.human, { laps: st.laps, names: specs.map(function (s) { return s.name; }), tlas: specs.map(function (s) { return s.tla; }), heavy: heavy, fast: st.fast, tunnel: def.gp && def.gp.tunnels ? def.gp.tunnels[0] : null }); }
        catch (e) { warn('THE MOMENT could not be picked (' + (e && e.message || e) + ')'); best = null; }
        return best;
      }

      /* -------------------------------------------------------------------- the ceremony (X16, X32, X33) -- */
      // t = 0 is your car on the line. The flag, live, 2.0 s (the chase runs on in real time); the flag shot and the
      // cool-down (the director's, 4.4 s); THE MOMENT (9 s: on later races only at a score of 150 or more); the podium
      // (15 s the first time; 8 s later unless you made it or set a PB); the results. A beat the director or the stage
      // cannot play is cut, so with none of them the results come 2.0 s after the line. A fresh tap or key skips a beat
      // (from 1.5 s after the line; the podium from 1 s into it); a tap held from before the line never skips anything
      var GCERB = [['flag', 2.0], ['flagshot', 4.4], ['moment', 9.0], ['podium', 15.0]];
      function gpCeremony() {
        if (GCER || !GR || GR.human < 0 || GRK !== 'race') return;
        var first = GSES.races <= 1, me = GR.S.cars[GR.human], place = me ? me.place : 99;
        GMOM = gpPickMoment();
        var playMoment = !!GMOM && (first || GMOM.score >= 150);
        GCER = { t: 0, beat: -1, bt: 0, dur: 0, first: first, log: [], playMoment: playMoment, podLen: first || place <= 3 || GSES.pb ? 15.0 : 8.0, wall0: nowMs() };
        GFL.mode = 'ceremony';
        gpCerNext();
      }
      function gpCerNext() {
        if (!GCER) return;
        while (++GCER.beat < GCERB.length) {
          var id = GCERB[GCER.beat][0], dur = id === 'podium' ? GCER.podLen : GCERB[GCER.beat][1], ok = false;
          if (id === 'flag') ok = true;
          else if (id === 'flagshot') ok = !!GDIR && !!partCall('GDIR', 'play', 'flag', { state: GST, focus: GFOCUS, len: dur });
          else if (id === 'moment') ok = GCER.playMoment && !!GDIR && !!partCall('GDIR', 'play', 'moment', { state: GST, event: GMOM.event, t: GMOM.t, caption: GMOM.caption, kind: GMOM.kind });
          else if (id === 'podium') {
            var a = GDIR ? !!partCall('GDIR', 'play', 'podium', { state: GST, first: GCER.first, len: dur, stage: GSTG }) : false, b = GSTG ? !!partCall('GSTG', 'play', 'podium', { state: GST, first: GCER.first, len: dur }) : false;
            ok = a || b; if (ok) gpPage('podium', { first: GCER.first, length: dur });
          }
          GCER.log.push({ beat: id, at: +((nowMs() - GCER.wall0) / 1000).toFixed(3), played: ok, len: dur });
          if (!ok) continue;
          GCER.last = id;
          if (id !== 'flag' && GCAMV) GCAMV.mode('tv', false);
          if (id === 'moment') { gpPage('replay', { kind: 'moment' }); if (GMOM.caption) hudCall('caption', GMOM.caption, Math.min(dur, 6)); }
          // (the podium's lower-thirds: P3, P2, then P1 as they step up; the names, the teams, the race times)
          GCER.caps = [];
          if (id === 'podium') { var cls = GR.classification(); [2, 1, 0].forEach(function (k, j) { var r = cls[k]; if (r) GCER.caps.push({ at: 2.0 + 2.0 * j, lines: ['P' + r.pos + ' · ' + String(r.name).toUpperCase() + (r.n === GR.human ? ' · ' + (GCFG.youTag || 'DRIVEN BY YOU') : ''), (r.teamName || '') + (r.time != null ? ' · ' + gpClock(r.time) : '')] }); }); }
          GCER.bt = 0; GCER.dur = dur;
          return;
        }
        gpCerEnd();
      }
      function gpCerEnd() {
        // (the podium's last shot, the postcard from the water, holds under the results; anything else stops)
        var keep = GCER && GCER.last === 'podium';
        if (GDIR && !keep) partCall('GDIR', 'stop');
        if (GCAMV && !keep) GCAMV.mode(GSET.cam, false);
        GFL.mode = 'results';
        showResults();
      }
      function gpCerSkip() {
        if (!GCER) return;
        var id = GCERB[GCER.beat] ? GCERB[GCER.beat][0] : null;
        if ((nowMs() - GCER.wall0) / 1000 < 1.5) return;
        if (id === 'podium' && GCER.bt < 1.0) return;
        GCER.log.push({ skip: id, at: +((nowMs() - GCER.wall0) / 1000).toFixed(3) });
        if (GDIR) partCall('GDIR', 'stop');
        gpCerNext();
      }
      function gpClock(s) { var m = Math.floor(s / 60), r = (s - m * 60).toFixed(3); return m + ':' + (+r < 10 ? '0' : '') + r; }
      function gpCerStep(dt) {
        if (!GCER || GFL.mode !== 'ceremony') return;
        GCER.t += dt; GCER.bt += dt;
        while (GCER.caps && GCER.caps.length && GCER.bt >= GCER.caps[0].at) hudCall('caption', GCER.caps.shift().lines, 1.9);
        if (GCER.bt >= GCER.dur - 1e-9) gpCerNext();
      }

      /* ------------------------------------------------------------------------------------- the step -- */
      var GFLY = { d: 0, v: 60 }, GA = {}, GB = {};
      function fly(dt) {
        GFLY.d = GPT.wrap(GFLY.d + GFLY.v * dt);
        GPT.posAt(GFLY.d, 0, 5, GA); GPT.posAt(GFLY.d + 45, 0, 1.2, GB);
        camera.position.set(GA.x, GA.y, GA.z); camera.lookAt(GB.x, GB.y, GB.z);
        GPT.posAt(GFLY.d + 20, 0, 0, GA); GHERO.set(GA.x, GA.y, GA.z);
      }
      function gpLightSeen(e) {
        GTL.push({ e: 'light', n: e.n, w: nowMs() });
        if (GRT && e.n === 1 && GRT.light == null) {
          GRT.light = nowMs(); GRT.dt = Math.round(GRT.light - GRT.tap); var M = renderer.info.memory;
          GRT.geometries1 = M.geometries; GRT.textures1 = M.textures; GRT.newGeometries = M.geometries - GRT.geometries0; GRT.newTextures = M.textures - GRT.textures0;
        }
      }
      // (live is real time, EXPERIENCE 1.4: v1 caps a frame at 50 ms, so a page under 20 fps would run its race, its
      // lights and its intro slow against the clock; a Grand Prix steps by the clock instead, up to 250 ms a frame. A
      // film's fixed step (fixedStep) keeps v1's)
      var GWT = { frame: -1, last: 0, raw: 0 };
      function gpWallDt(dt) {
        if (fixedStep) return dt;
        if (frames !== GWT.frame) { GWT.frame = frames; var nw = nowMs(); GWT.raw = GWT.last ? clamp((nw - GWT.last) / 1000, 0, 0.25) : 0.016; GWT.last = nw; }
        var n = Math.max(1, Math.round(timeScale));
        return GWT.raw * timeScale / n;
      }
      function gpTick(dt0) {
        var dt = gpWallDt(dt0);
        if (frames !== GCOST.frame) {
          GCOST.frame = frames; GCOST.calls = renderer.info.render.calls; GCOST.tris = renderer.info.render.triangles; renderer.info.reset();
          var now = nowMs(); GCOST.ms = GCOST.last ? now - GCOST.last : 0; GCOST.last = now;
          GDBG.renderLog.push([GCOST.calls, GCOST.tris, post ? post.calls : GCOST.calls]); if (GDBG.renderLog.length > 4000) GDBG.renderLog.shift();
          // (X10: every frame's interval after the intro's first cut, until the results)
          if (GFT.on && GCOST.ms > 0 && state !== 'paused') {
            GFT.n++; if (GCOST.ms > GFT.max) GFT.max = GCOST.ms;
            // (a long frame, with what it might have been: new programs or textures, the shot, the intro's beat)
            var prg = renderer.info.programs ? renderer.info.programs.length : 0, mem = renderer.info.memory;
            if (GCOST.ms > 100) { GFT.over++; GFT.log.push({ ms: Math.round(GCOST.ms), mode: GFL.mode, at: frames, programs: prg, newPrograms: prg - (GFT.prg || prg), tex: mem.textures, geo: mem.geometries, shot: GDIR && typeof GDIR.state === 'function' ? GDIR.state().cut : null, beat: GINTRO && introOn() ? GINTRO.state().shot : null }); if (GFT.log.length > 40) GFT.log.shift(); }
            GFT.prg = prg;
          }
          if (demo) gpWarmStep();
          // (I, M2 round 2: the race Play will start, built in the demo once the warm-up is done, as RACE AGAIN's is built in
          // the results: building it at the intro's dip took 0.27-0.54 s a frame at 4x CPU, which often fell in the
          // helicopter's first frames, the X10 hitch; gpIntroRace takes it when the seat, slot and rev phase still match)
          if (demo && GOK && GRK === 'demo' && GWARM && GWARM.done && !GPLAY) { try { var pv = gpVariantNext(), ph = gpHoldOf(pv); GPLAY = gpBuild({ gridSlot: gpSlot(), gridHold: ph }); GPLAY.for = GSET.you; GPLAY.variant = pv; } catch (e) { GPLAY = null; } }
        }
        if (!GOK || !GR) { if (state !== 'paused') { t += dt; fly(dt); } return; }
        if (timeScale !== 1 && typeof GR.markAssisted === 'function') GR.markAssisted();
        // the intro: the player's race is made at the dip's black (its hitch hidden there), and waits on the grid
        if (GFL.mode === 'intro' && GFL.build && state !== 'paused') {
          var ist = GINTRO ? GINTRO.state() : null;
          if (!ist || ist.real >= GFL.buildAt) { gpIntroRace(); GST = GR.state({}); }
        }
        var inp = readInput(dt);
        if (GR.human >= 0 && (state === 'race' || state === 'countdown') && !introOn()) GR.setInput(inp);
        var alpha = state === 'paused' ? 1 : GR.advance(dt);
        if (state !== 'paused') t += dt;
        drain();
        var st = GST = GR.state(GST || {});
        gpLaunchWatch();
        // v1's page state follows the race's phase
        if (GRK === 'race' && state !== 'paused' && state !== 'results' && state !== 'title') {
          state = st.phase === 'grid' || st.phase === 'lights' || introOn() ? 'countdown' : 'race';
          if (st.done && GFL.mode !== 'ceremony' && GFL.mode !== 'results') { if (GFL.mode === 'race' && st.you >= 0 && !st.cars[st.you].fin) { GFL.mode = 'results'; } showResults(); }
        }
        if (GRK === 'demo' && GFL.mode === 'demo' && (st.leaderLap > 1 || st.done)) { startDemo(); return; }
        // (20 s idle on the results and the demo is back; a race driven by the debug hooks keeps its results, as in M1,
        // unless a test asks for the idle, debug.gp().idle(true))
        if (state === 'results' && !demo && (!GDBG.used || GDBG.idle) && (GRESULTS -= dt) <= 0) { gpPage('idle', {}); startDemo(); return; }
        // RACE AGAIN, ready before the tap: the next race is built a second into the results (the tap then only starts it)
        if (state === 'results') GFL.resT = (GFL.resT || 0) + dt;
        if (state === 'results' && !GPREP && GFL.resT > 1 && GOK) { try { GPREP = gpBuild({ gridSlot: gpSlot(), gridHold: GPASSREV }); GPREP.for = GSET.you; } catch (e) { GPREP = null; } }
        if (state !== 'paused') gpCerStep(dt);
        var framed = false, iActive = introOn();
        if (!GDBG.headless) {
          GCV.onboard(GCAMV ? GCAMV.mode() : 'chase');
          // (while THE MOMENT or the flag shot replays, the cars stand where the director's tape had them: lane B's view)
          var RV = GDIR && typeof GDIR.replaying === 'function' && GDIR.replaying() && typeof GDIR.view === 'function' ? partCall('GDIR', 'view') : null;
          GCV.pose(RV || GR, RV ? 1 : alpha);
          GHERO.set(GFOCUS.x, GFOCUS.y, GFOCUS.z);
          if (iActive) { var r = partCall('GINTRO', 'update', state === 'paused' ? 0 : dt, st, GFOCUS, fixedStep ? null : nowMs() / 1000); framed = !!(r && r.framed); if (r && GINTRO && GINTRO.state().beat >= 1) GFT.on = true; }
          if (!framed && GCAMV) GCAMV.update(state === 'paused' ? 0 : dt, GFOCUS, { racing: racing(), phase: st.phase, title: state === 'title' });
          var fc = st.cars[st.focus];
          hudCall('update', dt, st, { cam: GCAMV ? GCAMV.state().mode : 'chase', assists: { brake: !GSET.pro, steer: !GSET.pro }, aids: GR.human >= 0 ? (GSET.pro ? 'pro' : 'on') : null, gearbox: GSET.gearbox, kmh: fc ? Math.round(fc.v * 3.6) : 0,
            demo: demo, intro: iActive && !GFL.built, device: GDEV, tv: GFL.mode === 'ceremony' && !!GCER && GCER.beat >= 1, first: GSES.races <= 1, hold: { armed: GHOLD.armed }, brake: { mine: GINP.brake, total: fc ? fc.brk : 0 },
            ceremony: GFL.mode === 'ceremony' ? { skippable: GCER && (nowMs() - GCER.wall0) / 1000 >= 1.5, hint: GDEV === 'touch' ? 'Tap to skip' : GDEV === 'pad' ? 'Any button to skip' : 'Any key to skip' } : null });
          if (GSPK) { if (state !== 'paused') { GSPK.scrape(GR.S.cars, dt); GSPK.update(dt); } }
          if (GDIR && typeof GDIR.update === 'function') partCall('GDIR', 'update', state === 'paused' ? 0 : dt, st);
          if (GSTG && typeof GSTG.frame === 'function') partCall('GSTG', 'frame', state === 'paused' ? 0 : dt, st, camera);
        } else if (iActive) partCall('GINTRO', 'update', state === 'paused' ? 0 : dt, st, GFOCUS, fixedStep ? null : nowMs() / 1000);
        sound(dt);
        // (the limiter's buzz, five times a second at most, while the player's car is on it)
        if (GR.human >= 0 && state === 'race') { var hc = GR.S.cars[GR.human]; if (hc && hc.limiter && !hc.fin && nowMs() - GBZ.last > 200) gpBuzz('limiter'); }
      }

      /* ------------------------------------------------------------------------------------ the screens -- */
      // the runtime's six, reassigned as kart.js does (the page's Play, blur, the pause button and debug.start call them)
      var GPASSREV = 1.2;
      reset = function () {};
      startDemo = function () {
        hideScreen(); hudCall('screen', null); GSCR = null;
        if (GINTRO) partCall('GINTRO', 'cancel');
        root.classList.remove('gpintro', 'gpbuild');
        demo = true; state = 'race'; paused = false; root.classList.add('demo');
        GFL.mode = 'demo'; GFL.build = null; GCER = null; GPREP = null; GPLAY = null; GFT.on = false;
        if (GCAMV) GCAMV.mode(GSET.cam, false);
        if (!GOK) { GR = null; return; }
        GRK = 'demo'; newRace({ demo: true, you: null }); GR.start();
        if (!GWARM) GWARM = gpWarm();
      };
      // Play (the page's button, a key or a tap on the demo): straight into the intro (D5). The long one on the first race
      // of a session, the skip's short dip on later ones; no intro part: M1's start card
      showStart = function () {
        demo = false; root.classList.remove('demo'); paused = false;
        hideScreen(); hudCall('screen', null); GSCR = null;
        if (!GOK || !GHUD) {
          state = 'title';
          showScreen('<h1>' + esc(meta.title || 'Grand Prix') + '</h1>' + (meta.tagline ? '<p>' + esc(meta.tagline) + '</p>' : '') + '<div class="go">Enter or tap to start</div>', function () { startCountdown(null); });
          GSCR = { go: function () { startCountdown(null); } };
          return;
        }
        if (!GINTRO) {
          state = 'title';
          GSCR = hudCall('screen', 'start', { drivers: GCFG.all, you: GSET.you, pro: GSET.pro, gearbox: GSET.gearbox, cam: GSET.cam, title: meta.title || 'Grand Prix', tagline: meta.tagline || '', laps: GCFG.laps, youTag: GCFG.youTag,
            onGo: function (sel) { startCountdown(sel); }, onPick: function (id) { GSET.you = id; }, onOption: gpOption });
          return;
        }
        gpPlay(GSES.dareIntro ? 'dare' : GSES.introSeen ? 'skip' : 'long', 'play');
      };
      // the intro's words and pictures, from the world (gp.intro: title, sub, tagline, kicker, landmark; every key has a
      // default from the track and the field) and the race (your seat, the front row's agent)
      function gpIntroOpts(variant, from, slot) {
        var GI = def.gp && def.gp.intro && typeof def.gp.intro === 'object' ? def.gp.intro : {}, specs = GCFG.all || [], me = null;
        for (var i = 0; i < specs.length; i++) if (specs[i].id === GSET.you) me = specs[i];
        var N = GCFG.field || 20, km = (GPT.L / 1000).toFixed(3), turns = GPT.corners ? GPT.corners.length : 0;
        var sub = (typeof GI.sub === 'string' && GI.sub.trim() ? GI.sub.trim() : 'Grand Prix') + ' · ' + km + ' km · ' + turns + ' turns · ' + GCFG.laps + ' laps';
        return {
          from: from, title: typeof GI.title === 'string' && GI.title.trim() ? GI.title.trim() : meta.title || 'Grand Prix', sub: sub,
          tagline: typeof GI.tagline === 'string' && GI.tagline.trim() ? GI.tagline.trim() : N + ' agents. 1 human.',
          kicker: typeof GI.kicker === 'string' ? GI.kicker : 'The birth of agentic racing', landmark: GI.landmark || null, slot: slot, aids: GSET.pro ? 'pro' : 'on', device: GDEV,
          camMode: GSET.cam, seatText: gpSeatText(), you: me ? { num: me.num, name: me.name, tag: GCFG.youTag || 'DRIVEN BY YOU', team: me.teamName } : null,
          dare: GSES.dareIntro || null, ready: gpReady,
          onHandoff: function (instant) { gpHudUp(instant); }, onSkip: function () { GFL.skipped = true; }, onHand: gpHand, onSeat: gpSeat,
        };
      }
      function gpSeatText() { var s = null; (GCFG.all || []).forEach(function (d) { if (d.id === GSET.you) s = d; }); return '#' + (s ? s.num : '') + ' · ' + (GSET.pro ? 'PRO' : 'AIDS ON'); }
      // the front row's agent for the grid walk (X12): the house machine (your team-mate) when it starts in P1-P4, else
      // the front row's, chrome first, then plush, then suited
      function gpFeature(R) {
        var specs = R.cfg.specs, you = R.human, mate = -1, best = -1, rank = { chrome: 0, plush: 1, suited: 2 };
        for (var i = 0; i < Math.min(4, specs.length); i++) if (i !== you && specs[you] && specs[i].team === specs[you].team) mate = i;
        if (mate < 0) for (var j = 0; j < Math.min(2, specs.length); j++) if (j !== you && (best < 0 || (rank[specs[j].form] || 2) < (rank[specs[best].form] || 2))) best = j;
        var n = mate >= 0 ? mate : best >= 0 ? best : 0, s = specs[n];
        return { n: n, place: n + 1, num: s.num, name: s.name, team: s.teamName, line: s.voice || '' };
      }
      // (the variant Play starts, and the grid's hold for it: the variant's rev phase, at least the skip's 2.0 s)
      function gpVariantNext() { return GSES.dareIntro ? 'dare' : GSES.introSeen ? 'skip' : 'long'; }
      function gpHoldOf(variant) { var V = GINTRO && GpIntro.VARIANTS ? GpIntro.VARIANTS[variant] : null; return Math.max(V ? V.rev : 2.0, 2.0); }
      function gpPlay(variant, from) {
        var slot = gpSlot(), V = GINTRO && GpIntro.VARIANTS ? GpIntro.VARIANTS[variant] : null, rev = V ? V.rev : 2.0;
        GSES.introSeen = true;
        GFL.mode = 'intro'; GFL.variant = variant; GFL.rev = rev; GFL.skipped = false; GFL.built = false; GFL.t0 = nowMs(); GTL = [{ e: 'tap', w: GFL.t0, variant: variant }];
        GCER = null; GPREP = null; GFT.on = false; GFT.max = 0; GFT.n = 0; GFT.over = 0; GFT.log = [];
        // (the race is made at the dip's black; its grid holds max(rev, the skip's 2.0 s), and the hand-off takes off the extra)
        GFL.hold = Math.max(rev, 2.0);
        GFL.build = { gridSlot: slot, gridHold: GFL.hold }; GFL.buildAt = variant === 'skip' ? 0.12 : 0.25;
        GRK = 'race'; state = 'countdown';
        ensureAudio(); gpAudioMake();
        var o = gpIntroOpts(variant, from, slot);
        if (!partCall('GINTRO', 'play', variant, o)) { GFL.build = null; gpUse(gpBuild({ gridSlot: slot, gridHold: GPASSREV })); gpHand(); return; }
      }
      // the HUD comes up round the car (the glide's start, or a skip's black)
      function gpHudUp(instant) {
        GFL.built = true; root.classList.remove('gpintro');
        hudCall('build', !!instant);
        GTH = GHUD ? hudCall('touch', { manual: GSET.gearbox === 'manual' }) : null; GTHP = { flap: 0, cam: 0, up: 0, down: 0, brakeUp: 0 };
      }
      // the player's race, made during the intro (at the dip's black), and the intro told who is where on the grid
      function gpIntroRace() {
        var bo = GFL.build; if (!bo) return;
        // (the race built in the demo when it still fits: the seat, the slot and the rev phase; the aids and the gears as set now)
        var R = GPLAY && bo.seed == null && GPLAY.for === GSET.you && GPLAY.gridSlot === bo.gridSlot && GPLAY.gridHold === bo.gridHold ? GPLAY : null;
        GPLAY = null; GFL.prepared = !!R;
        GFL.build = null; gpUse(R || gpBuild(bo)); GRK = 'race';
        if (R) { if (GR.human >= 0) GR.assists({ brake: !GSET.pro, steer: !GSET.pro }); if (typeof GR.gearbox === 'function') GR.gearbox(GSET.gearbox); }
        partCall('GINTRO', 'cast', { youN: GR.human, feature: gpFeature(GR), slot: GR.gridSlot });
      }
      // the intro's end: the race starts (the rev phase, then the five lights); a skip's race has 2.0 s of revs left
      function gpHand(late) {
        if (GFL.mode !== 'intro') return;
        if (GFL.build) gpIntroRace();
        GFL.mode = 'race'; root.classList.remove('gpintro');
        if (!GFL.built) gpHudUp(true);
        if (!GR) return;
        GR.start(); GSES.races++;
        // (the revs left: the variant's, or the skip's 2.0 s, less the frame's lateness past the intro's end)
        var want = GFL.skipped ? 2.0 : GFL.rev, extra = Math.max(0, (GR.gridHold != null ? GR.gridHold : GFL.hold) - want + (+late > 0 ? Math.min(+late, 0.25) : 0));
        for (var k = 0, n = Math.round(extra * 120); k < n; k++) GR.step();
        GFL.revLeft = want;
        state = 'countdown';
        if (GCAMV) { GSET.cam = GCAMV.mode(GSET.cam, false); }
        GTL.push({ e: 'hand', w: nowMs(), rev: want });
      }
      // the seat chip (the intro waits while the sheet is open): the seat, the aids, the gears, the camera
      function gpSeat() {
        if (!GHUD || GSCR) return;
        partCall('GINTRO', 'pause', true);
        var was = GSET.you;
        GSCR = hudCall('screen', 'seat', { drivers: GCFG.all, you: GSET.you, pro: GSET.pro, gearbox: GSET.gearbox, cam: GSET.cam, youTag: GCFG.youTag, onPick: function (id) { GSET.you = id; }, onOption: gpOption,
          onDone: function () {
            hudCall('screen', null); GSCR = null;
            if (GSET.you !== was && GFL.mode === 'intro' && !GFL.build) { GFL.build = { seed: GR ? GR.seed : null, gridSlot: gpSlot(), gridHold: GFL.hold }; gpIntroRace(); }
            partCall('GINTRO', 'seat', gpSeatText());
            partCall('GINTRO', 'pause', false);
          } });
      }
      // a setting from a sheet (the seat's, the pause sheet's): each changes the state it names
      function gpOption(name, v) {
        if (name === 'pro') { GSET.pro = !!v; if (GR && GR.human >= 0) GR.assists({ brake: !GSET.pro, steer: !GSET.pro }); partCall('GINTRO', 'seat', gpSeatText()); }
        else if (name === 'gearbox') { GSET.gearbox = v === 'manual' ? 'manual' : 'auto'; if (GR && typeof GR.gearbox === 'function') GR.gearbox(GSET.gearbox); if (GHUD && state === 'paused') GTH = hudCall('touch', { manual: GSET.gearbox === 'manual' }); }
        else if (name === 'cam') { GSET.cam = v; if (GCAMV && !introOn()) GSET.cam = GCAMV.mode(v, racing()); }
        else if (name === 'tones') { GSET.tones = !!v; gpVolumes(); }
        else if (name === 'haptics') GSET.haptics = !!v;
        else if (name === 'master' || name === 'engine' || name === 'crowd' || name === 'click') { GSET.vol[name] = clamp(+v || 0, 0, 1); gpVolumes(); }
        else if (name === 'steer') GSET.steer = clamp(+v || 1, 0.5, 1.5);
      }
      // the player's grid slot (D4, the owner 15 Oct): the first race of a session from the back of the grid, later ones
      // from the last finish + 3 (P4 to the back), a dare from the sender's slot (GSES.dare, from the host in M3)
      function gpSlot() {
        var N = GCFG ? GCFG.field : 20;
        if (GSES.dare != null) return clamp(Math.round(GSES.dare), 1, N);
        return GSES.last == null ? N : clamp(GSES.last + 3, Math.min(4, N), N);
      }
      // RACE AGAIN, Restart in the pause sheet, debug.start: no intro, chase on the grid with the HUD up, the first red
      // light 1.2 s after the tap (X06: the race was built a second into the results; nothing is made on the tap)
      startCountdown = function (sel) {
        var tap = nowMs(), was = state, M0 = renderer.info.memory;
        GRT = { tap: tap, from: was, geometries0: M0.geometries, textures0: M0.textures, light: null, prepared: false };
        hideScreen(); hudCall('screen', null); GSCR = null;
        if (sel) { if (sel.you) GSET.you = sel.you; GSET.pro = !!sel.pro; GSET.gearbox = sel.gearbox === 'manual' ? 'manual' : 'auto'; if (sel.cam) GSET.cam = sel.cam; }
        demo = false; root.classList.remove('demo', 'gpintro'); paused = false;
        if (!GOK) { startDemo(); return; }
        if (GINTRO) partCall('GINTRO', 'cancel');
        if (GDIR) partCall('GDIR', 'stop');
        var slot = gpSlot(), R = GPREP && GPREP.for === GSET.you && GPREP.gridSlot === slot ? GPREP : null;
        GPREP = null; GRT.prepared = !!R;
        GRK = 'race'; GFL.mode = 'race'; GFL.variant = 'race-again'; GFL.rev = GPASSREV; GFL.skipped = false; GCER = null;
        gpUse(R || gpBuild({ gridSlot: slot, gridHold: GPASSREV }));
        if (GR.human >= 0) GR.assists({ brake: !GSET.pro, steer: !GSET.pro });
        if (typeof GR.gearbox === 'function') GR.gearbox(GSET.gearbox);
        GR.start(); GSES.races++; GSES.introSeen = true;
        state = 'countdown';
        GTL = [{ e: 'tap', w: tap, variant: 'race-again' }];
        GFT.on = true; GFT.max = 0; GFT.n = 0; GFT.over = 0; GFT.log = [];
        gpPage(was === 'results' ? 'again' : 'intro', was === 'results' ? { slot: GR.gridSlot } : { variant: 'race-again', from: was === 'paused' ? 'restart' : 'start' });
        if (was === 'results') gpPage('intro', { variant: 'race-again', from: 'again' });
        gpHudUp(true);
        if (GCAMV) GSET.cam = GCAMV.mode(GSET.cam, true);
        ensureAudio(); if (audio && audio.ctx.state === 'suspended') audio.ctx.resume();
      };
      togglePause = function () {
        if ((state === 'race' || state === 'countdown') && !demo) {
          state = 'paused'; paused = true; if (audio) audio.ctx.suspend();
          gpPage('pause', { mode: GFL.mode });
          partCall('GINTRO', 'pause', true);
          if (GAUD && typeof GAUD.event === 'function') { try { GAUD.event('pause', {}); } catch (x) { GAUD = null; } }
          GVOX.forEach(function (v) { if (v) v.mix(0, 0); });
          var hapticsOk = !!(navigator.vibrate) || !!(pad() && pad().vibrationActuator);
          GSCR = hudCall('screen', 'pause', { state: GST, settings: { cam: GSET.cam, pro: GSET.pro, gearbox: GSET.gearbox, tones: GSET.tones, haptics: GSET.haptics, hapticsOk: hapticsOk, vol: GSET.vol, steer: GSET.steer },
            onResume: function () { togglePause(); }, onOption: gpOption,
            onRestart: function () { partCall('GINTRO', 'pause', false); startCountdown(null); },
            onQuit: function () { gpPage('quit', { mode: GFL.mode, lap: GST && GR && GR.human >= 0 && GST.cars[GR.human] ? GST.cars[GR.human].lap + 1 : null }); paused = false; if (audio) audio.ctx.resume(); startDemo(); } });
          if (!GSCR) { showScreen('<h1>Paused</h1><div class="go">P or tap to carry on</div>', togglePause, 'bar'); GSCR = { go: togglePause }; }
        } else if (state === 'paused') {
          hideScreen(); hudCall('screen', null); GSCR = null;
          state = GST && (GST.phase === 'grid' || GST.phase === 'lights') || introOn() ? 'countdown' : 'race'; paused = false; if (audio) audio.ctx.resume();
          partCall('GINTRO', 'pause', false);
          if (GAUD && typeof GAUD.event === 'function') { try { GAUD.event('resume', {}); } catch (x) { GAUD = null; } }
        }
      };
      showResults = function () {
        if (!GR || state === 'results') return;
        if (GFL.mode === 'ceremony' && !(GCER && GCER.last === 'podium')) { if (GDIR) partCall('GDIR', 'stop'); if (GCAMV) GCAMV.mode(GSET.cam, false); }
        if (GCER) { GCER.log.push({ beat: 'results', at: +((nowMs() - GCER.wall0) / 1000).toFixed(3), played: true }); GFL.lastCer = GCER.log.slice(); }
        GFL.mode = 'results'; GCER = null;
        state = 'results'; GRESULTS = 20; GFT.on = false; GFL.resT = 0;
        gpPage('results', { place: GFIN && GFINR === GR ? GFIN.place : null });
        GVOX.forEach(function (v) { if (v) v.mix(0, 0); });
        var st = GR.state({});
        GSCR = hudCall('screen', 'results', { rows: GR.classification(), you: GR.human, state: st, grid: GR.gridSlot, report: GFIN && GFINR === GR ? { passes: GFIN.passes, earned: GPASSEV ? GEARNED : GFIN.passes, contacts: GFIN.contacts, strikes: GFIN.strikes } : null,
          aids: GR.human >= 0 ? st.aids : null, pb: !!GSES.pb, youTag: GCFG.youTag, moment: !!(GMOM && GDIR),
          onGo: function () { startCountdown(null); }, onTouch: function () { GRESULTS = 20; },
          onMoment: function () { if (!GMOM || !GDIR) return; gpPage('moment-watch', { kind: GMOM.kind, score: GMOM.score }); GRESULTS = 20; partCall('GDIR', 'play', 'moment', { state: st, event: GMOM.event, t: GMOM.t, caption: GMOM.caption, again: true }); } });
      };

      /* ------------------------------------------------------------------------------ the context guard -- */
      // (X26) a lost WebGL context (a phone's memory, a GPU reset): kept restorable, the race paused; three.js rebuilds its
      // state when it comes back and the player resumes
      try {
        renderer.domElement.addEventListener('webglcontextlost', function (e) { try { e.preventDefault(); } catch (x) {} GCTX.lost++; if ((state === 'race' || state === 'countdown') && !demo && !paused) togglePause(); }, false);
        renderer.domElement.addEventListener('webglcontextrestored', function () { GCTX.restored++; }, false);
      } catch (e) {}

      /* ------------------------------------------------------------------------------- the debug hooks -- */
      // for the platform's tests, never for players: any use marks the race (and the page's later ones) assisted
      function used() { GDBG.used = true; if (GR && typeof GR.markAssisted === 'function') GR.markAssisted(); }
      function carOf(n) { return GR ? GR.S.cars[n == null ? (GR.human >= 0 ? GR.human : GR.focus()) : n] : null; }
      function plain(o) { var out = {}; for (var k in o) { var v = o[k]; if (v == null || typeof v !== 'object') out[k] = v; else if (Array.isArray(v) && v.length < 40) out[k] = v.slice(); else if (k === 'flap' || k === 'inp' || k === 'eff') out[k] = JSON.parse(JSON.stringify(v)); } return out; }
      var GDEBUG = {
        go: function (o) {
          used(); o = o || {};
          if (o.you !== undefined) GSET.you = o.you;
          if (o.assists) GSET.pro = !(o.assists.brake || o.assists.steer);
          if (o.gearbox) GSET.gearbox = o.gearbox;
          hideScreen(); hudCall('screen', null); GSCR = null; demo = false; root.classList.remove('demo', 'gpintro'); paused = false;
          if (GINTRO) partCall('GINTRO', 'cancel');
          if (!GOK) return null;
          GRK = 'race'; GFL.mode = 'race'; GFL.build = null; GCER = null;
          newRace({ seed: o.seed, you: o.you === undefined ? GSET.you : o.you, autopilot: !!o.autopilot, solo: !!o.solo, laps: o.laps, skipLights: o.skipLights, assists: o.assists, gearbox: o.gearbox, gridSlot: o.gridSlot, field: o.field, gridHold: o.gridHold });
          GR.start(); state = GR.state({}).phase === 'race' ? 'race' : 'countdown';
          gpHudUp(true);
          if (GCAMV) GCAMV.mode(GSET.cam, racing());
          return { seed: GR.seed, you: GR.human, field: GR.S.cars.length, laps: GR.cfg.laps, lapModel: GR.lapModel, gridSlot: GR.gridSlot, pace: GR.field };
        },
        place: function (d, lat, v, n) {
          used(); var c = carOf(n); if (!c) return null;
          // (through the sim's marks where it has them: replayed at the same step, so replay() stays equal)
          if (typeof GR.S.mark === 'function') { GR.S.mark('place', { n: c.n, d: d, lat: lat || 0, v: v == null ? c.v : v }); return plain(c); }
          var p = GPT.posAt(d, lat || 0, 0, {}), h = GPT.headingAt(d);
          c.x = c.px = p.x; c.z = c.pz = p.z; c.y = c.py = p.y; c.h = c.ph = h; c.v = v == null ? c.v : v; c.vlat = 0; c.r = 0;
          c.i = GPT.idx(d); c.d = GPT.wrap(d); c.dPrev = c.d; c.lat = lat || 0;
          return plain(c);
        },
        speed: function (v, n) { used(); var c = carOf(n); if (!c) return null; if (typeof GR.S.mark === 'function') GR.S.mark('speed', { n: c.n, v: +v || 0 }); else c.v = +v || 0; return c.v; },
        autopilot: function (on) { used(); return GR ? GR.autopilot(on) : null; },
        assists: function (a) { used(); a = a || {}; GSET.pro = !(a.brake || a.steer); return GR ? GR.assists(a) : null; },
        cam: function (name) { used(); return GCAMV ? (GSET.cam = GCAMV.mode(name, racing())) : null; },
        eye: function (mode, o) { used(); return GCAMV && typeof GCAMV.eye === 'function' ? GCAMV.eye(mode, o) : null; },
        focus: function (n) { used(); return GR ? GR.focus(n) : null; },
        pick: function (id) { used(); if (GCFG && GCFG.all.some(function (s) { return s.id === id; })) GSET.you = id; return GSET.you; },
        lod: function (o) { used(); if (o) { if (o.near != null) GDBG.lod.near = o.near; if (o.all != null) GDBG.lod.all = !!o.all; } return GDBG.lod; },
        car: function (n) { used(); var c = carOf(n); return c ? plain(c) : null; },
        field: function () { used(); return GR ? GR.cfg.specs.map(function (s) { return { n: s.n, id: s.id, name: s.name, tla: s.tla, team: s.team, pace: s.pace }; }) : null; },
        table: function () { return { L: GPT.L, L3: GPT.L3, n: GPT.n, ds: GPT.ds, sig: GPT.sig, hwMin: GPT.hwMin, hwMax: GPT.hwMax, minR: GPT.minR, edge: GPT.edge, corners: GPT.corners, segs: GPT.segs, issues: GPT.issues }; },
        line: function () { used(); return GLINE ? { M: GLINE.M, step: GLINE.step, sig: GLINE.sig, ms: GLINE.ms, loadMs: Math.round(GLINEMS), lat: Array.prototype.filter.call(GLINE.lat, function (x, i) { return i % 200 === 0; }) } : null; },
        profile: function (step) { used(); if (!GR || !GR.prof) return null; step = step || 10; var out = []; for (var d = 0; d < GPT.L; d += step) out.push([Math.round(d), +GR.prof[GPT.idx(d)].toFixed(2)]); return out; },
        events: function (clear) { used(); var e = GDBG.events.slice(); if (clear) GDBG.events = []; return e; },
        replay: function () { used(); if (!GR) return null; var r = GR.replay(); return { live: r.live, replayed: r.hash, equal: r.equal, steps: r.steps }; },
        hash: function () { return GR ? GR.hash() : null; },
        fly: function (d, v) { if (typeof d === 'number') GFLY.d = GPT.wrap(d); if (typeof v === 'number') GFLY.v = clamp(v, 0, 120); return { d: GFLY.d, v: GFLY.v }; },
        render: function () {
          var L0 = GDBG.renderLog; GDBG.renderLog = [];
          if (!L0.length) return { frames: 0 };
          var calls = L0.map(function (r) { return r[0]; }).sort(function (a, b) { return a - b; }), tris = L0.map(function (r) { return r[1]; }).sort(function (a, b) { return a - b; });
          var p95 = function (a) { return a[Math.min(a.length - 1, Math.floor(a.length * 0.95))]; };
          return { calls: L0[L0.length - 1][0], tris: L0[L0.length - 1][1], mainCalls: L0[L0.length - 1][2], p95: { calls: p95(calls), tris: p95(tris) }, max: { calls: calls[calls.length - 1], tris: tris[tris.length - 1] }, frames: L0.length };
        },
        headless: function (on) { used(); GDBG.headless = !!on; GCV.group.visible = !GDBG.headless; hudCall('show', !GDBG.headless); return GDBG.headless; },
        // (M2) the session's slot rule (D4): { last, dare } set it for a test; the director and page events (read-only)
        session: function (o) { used(); if (o) { if (o.last !== undefined) GSES.last = o.last == null ? null : +o.last; if (o.dare !== undefined) GSES.dare = o.dare == null ? null : +o.dare; if (o.introSeen !== undefined) GSES.introSeen = !!o.introSeen; if (o.dareIntro !== undefined) GSES.dareIntro = o.dareIntro; } return { races: GSES.races, last: GSES.last, dare: GSES.dare, next: gpSlot(), introSeen: GSES.introSeen }; },
        page: function (clear) { var p = GPAGE.slice(); if (clear) GPAGE = []; return p; },
        // (lane E, read-only: they never mark a race) the intro's state, the HUD's, the RACE AGAIN timing (X06), the
        // flow's timeline in wall milliseconds from the tap (the page events and the lights), the frames over 100 ms
        // since the intro's first cut (X10), the warm-up, the context guard, the moment picked
        intro: function () { return GINTRO ? GINTRO.state() : null; },
        introProbe: function () { return GINTRO && typeof GINTRO.probe === 'function' ? GINTRO.probe() : null; },
        introRects: function () { return GINTRO && typeof GINTRO.rects === 'function' ? GINTRO.rects() : null; },
        hud: function () { return GHUD ? GHUD.state() : null; },
        rects: function () { return GHUD && typeof GHUD.rects === 'function' ? GHUD.rects() : null; },
        restartTiming: function () { return GRT ? { tap: GRT.tap, light: GRT.light, dt: GRT.dt, prepared: GRT.prepared, from: GRT.from, newGeometries: GRT.newGeometries, newTextures: GRT.newTextures, geometries: [GRT.geometries0, GRT.geometries1], textures: [GRT.textures0, GRT.textures1] } : null; },
        timeline: function () { var t0 = GTL.length ? GTL[0].w : 0; return { lights: GTL.map(function (x) { var o = {}; for (var k in x) o[k] = x[k]; o.w = Math.round(x.w - t0); return o; }), page: GPAGE.filter(function (p) { return p.wall != null; }).map(function (p) { return { e: p.e, w: Math.round(p.wall - t0), at: p.at, variant: p.variant, shot: p.shot, id: p.id, waited: p.waited, what: p.what }; }) }; },
        frames: function (reset) { var o = { on: GFT.on, n: GFT.n, max: Math.round(GFT.max), over: GFT.over, log: GFT.log.slice() }; if (reset) { GFT.max = 0; GFT.n = 0; GFT.over = 0; GFT.log = []; } return o; },
        warm: function () { return GWARM ? { done: GWARM.done, i: GWARM.i, jobs: GWARM.jobs.length, ms: GWARM.ms.slice(), programs: GWARM.programs || null } : null; },
        moment: function () { return GMOM; },
        // (lane D, read-only: the race sound's state, or with live the part itself for its tests; null while the stand-in plays)
        audio: function (live) { return !GAUD ? null : live ? GAUD : typeof GAUD.state === 'function' ? GAUD.state() : null; },
        cls: function () { return GR ? GR.classification() : null; },
        pickMoment: function (events, you, o) { return gpMomentPick(events, you, o || {}); },
        // (marking: the intro of a given variant from the demo (a dare's words), as Play would start it)
        play: function (variant, o) { used(); o = o || {}; if (o.dare) GSES.dareIntro = o.dare; if (o.introSeen != null) GSES.introSeen = !!o.introSeen; demo = false; root.classList.remove('demo'); hideScreen(); hudCall('screen', null); GSCR = null; paused = false; gpPlay(variant || 'long', 'debug'); GSES.dareIntro = null; return { variant: GFL.variant, slot: GFL.build ? GFL.build.gridSlot : null }; },
        idle: function (on) { GDBG.idle = !!on; return GDBG.idle; },
        // (X17's hold path: the grid not ready for ms milliseconds from now; X4: the haptics' log, the fake actuator on)
        notReady: function (ms) { used(); GDBG.notReady = nowMs() + (+ms || 0); return GDBG.notReady; },
        buzz: function (on) { if (on != null) GDBG.buzz = !!on; return GBZ.log.slice(); },
        buzzTest: function (kind) { return gpBuzz(kind); },
        ctxLoss: function (ms) { var gl = renderer.getContext(), x = gl && gl.getExtension('WEBGL_lose_context'); if (!x) return false; x.loseContext(); setTimeout(function () { try { x.restoreContext(); } catch (e) {} }, ms || 400); return true; },
      };

      /* ---------------------------------------------------------------------------------- the hand-off -- */
      OW = { ready: true, tick: gpTick, shadow: function () {}, state: null, gp: gpState, gpDebug: GDEBUG };
      OW.hero = function (out) { return out.copy(GHERO); };
      fly(0);
      gpStep('director: made');
      startDemo();
    }
