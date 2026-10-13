    /* ================================================== penalty shootout: the director (SHOOTOUT M1, 11 Oct 2026) == */
    // One penalty in a night final, played again and again (the owner, 11 Oct: "One Kick"). Spliced into boot() at
    // /*@include shootout.js*/ for a world that writes shootout: { ... } among its own keys (lib/custom-game.ts
    // isShootoutWorld), so it reads and reassigns the runtime's own names the way kart.js does, and owns the step, the
    // camera, the input, the HUD and the sound. Its parts are spliced in here, each a file of its own declaring one
    // name and no other (shoot*/Shoot*: they share boot()'s scope with every name the runtime has):
    //   ShootSim (the ball, the frame and the net; pure)   ShootBrain (the taker's timing, the keeper; pure)
    //   shootGoal (the frame, nets and ball drawn)          shootPeople (the rigs, the taker, the referee)
    //   shootKeeper (the keeper drawn from the brain)       shootCamera (the shots)
    //   shootAudio (the crowd and the effects)              shootHud (the glass HUD)
    // Whichever is not there (or throws), the director stands in for it plainly, so the flow always runs.
    /*@include shootout-sim.js*/
    /*@include shootout-brain.js*/
    /*@include shootout-goal.js*/
    /*@include shootout-people.js*/
    /*@include shootout-keeper.js*/
    /*@include shootout-camera.js*/
    /*@include shootout-audio.js*/
    /*@include shootout-hud.js*/

    /* ------------------------------------------------------------------------------- crowd cards, filmed -- */
    // ctx.shootout.impostors({ count, make(i), frames, cell, cols, size, foot, light, pose(h, f) }): people filmed off
    // screen before play into one sheet of crowd cards (copied from kart.js kartImpostors, not moved: a world may not
    // make cameras). One person at a time (critique #13, a phone's memory): make(i) builds look i (a library human, or
    // { object, cycle, step(dt), settle() }, its feet on y = 0, facing +Z), it is filmed through its frames (pose(h, f)
    // when given, else step, else its animate), and then let go: its skeleton and motion (h.dispose()) and the textures
    // it alone holds. cast: [...] (kart's form: people already built, each left where it was) still works. Picture f of
    // look i is cell i * frames + f, cols across (2 * frames), the first row at the bottom (v = 0); colour kept as its
    // square root (decode with c * c * 2), carried past its edges. Returns { texture, target, cols, rows, frames, looks,
    // cell, ms } or null.
    function shootImpostors(o) {
      o = o || {};
      try { console.info('[shoot] step crowd film'); } catch (e) {}
      var make = typeof o.make === 'function' ? o.make : null, pose = typeof o.pose === 'function' ? o.pose : null;
      var list = !make && Array.isArray(o.cast) ? o.cast.filter(function (c) { return c && c.object && c.object.isObject3D; }) : null;
      var nm = function (v, d, lo, hi) { v = +v; return isFinite(v) ? clamp(v, lo, hi) : d; };
      var n = make ? Math.round(nm(o.count, 0, 0, 512)) : list ? list.length : 0;
      if (!n || !renderer) return null;
      var t0 = performance.now(), REN = renderer;
      var F = Math.round(nm(o.frames, 12, 1, 32)), cell = Array.isArray(o.cell) ? o.cell : [], PX = Math.round(nm(cell[0], 96, 8, 512)), PY = Math.round(nm(cell[1], 216, 8, 512));
      var size = Array.isArray(o.size) ? o.size : [], CW = nm(size[0], 1.24, 0.05, 100), CH = nm(size[1], 2.8, 0.05, 100), FOOT = nm(o.foot, 0, -100, 100);
      var COLS = Math.round(nm(o.cols, 2 * F, 1, 4096)), ROWS = Math.ceil(n * F / COLS), SS = 2;
      var max = REN.capabilities.maxTextureSize || 4096;
      if (COLS * PX > max || ROWS * PY > max) { warn('ctx.shootout.impostors: the sheet would be ' + COLS * PX + ' x ' + ROWS * PY + ' pixels, over the ' + max + ' this screen allows; fewer frames, a smaller cell or more columns'); return null; }
      var L0 = o.light || {}, hex = function (c, d) { return isHex(c) ? c : d; }, lamp = function (a, dc, di, dp) { a = Array.isArray(a) ? a : []; var p = Array.isArray(a[2]) ? a[2] : dp; return [hex(a[0], dc), nm(a[1], di, 0, 20), [+p[0] || 0, +p[1] || 0, +p[2] || 0]]; };
      var KL = lamp(L0.key, '#FFC9A2', 1.9, [-0.55, 0.62, 1]), RL = lamp(L0.rim, '#9FB4FF', 0.7, [0.7, 0.5, -1]);
      var studio = new THREE.Scene();
      studio.add(new THREE.HemisphereLight(hex(L0.sky, '#B6B0E6'), hex(L0.ground, '#3A4A3C'), nm(L0.hemi, 1.15, 0, 20)));
      var kl = new THREE.DirectionalLight(KL[0], KL[1]); kl.position.set(KL[2][0], KL[2][1], KL[2][2]); studio.add(kl);
      var rl = new THREE.DirectionalLight(RL[0], RL[1]); rl.position.set(RL[2][0], RL[2][1], RL[2][2]); studio.add(rl);
      // one cell's lens: the person stands in the middle of it
      var lens = new THREE.OrthographicCamera(0, CW, CH, 0, 0.1, 40); lens.position.set(0, 0, 20);
      var raw = new THREE.WebGLRenderTarget(PX * SS, PY * SS, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false });
      var sheet = new THREE.WebGLRenderTarget(COLS * PX, ROWS * PY, { minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: true, depthBuffer: false });
      var copyMat = new THREE.ShaderMaterial({
        uniforms: { uSrc: { value: raw.texture }, uPx: { value: new THREE.Vector2(1 / (PX * SS), 1 / (PY * SS)) } },
        vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: [
          'uniform sampler2D uSrc; uniform vec2 uPx; varying vec2 vUv;',
          'void main() {',
          '  vec4 c = texture2D(uSrc, vUv); vec3 col = c.rgb / max(c.a, 1e-3);',
          '  if (c.a < 0.004) {',
          '    vec4 s = vec4(0.0);',
          '    for (int k = 0; k < 16; k++) { float a = float(k) * 0.7854, r = k < 8 ? 2.0 : 5.0; vec4 q = texture2D(uSrc, vUv + vec2(cos(a), sin(a)) * r * uPx); s += vec4(q.rgb, q.a); }',
          '    col = s.a > 0.0 ? s.rgb / s.a : vec3(0.0);',
          '  }',
          '  gl_FragColor = vec4(sqrt(clamp(col * 0.5, 0.0, 1.0)), c.a);',
          '}',
        ].join('\n'),
        depthTest: false, depthWrite: false,
      });
      var cg = new THREE.BufferGeometry(), cpos = new Float32Array(12);
      cg.setAttribute('position', new THREE.BufferAttribute(cpos, 3)); cg.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2)); cg.setIndex([0, 1, 2, 0, 2, 3]);
      var copyScene = new THREE.Scene(), copyMesh = new THREE.Mesh(cg, copyMat), copyCam = new THREE.OrthographicCamera(0, 1, 1, 0, -1, 1);
      copyMesh.frustumCulled = false; copyScene.add(copyMesh);
      // (what the stadium draws is never let go of: only what a filmed person alone held)
      var inUse = new Set();
      function texOf(root, into) {
        root.traverse(function (q) {
          if (!q.isMesh) return;
          (Array.isArray(q.material) ? q.material : [q.material]).forEach(function (m) { if (!m) return; for (var k in m) { var v = m[k]; if (v && v.isTexture) into.add(v); } });
        });
        return into;
      }
      texOf(scene, inUse);
      var rt0 = REN.getRenderTarget(), cc0 = REN.getClearColor(new THREE.Color()), ca0 = REN.getClearAlpha(), ac0 = REN.autoClear, filmed = 0;
      try {
        REN.autoClear = false; REN.setClearColor(0x000000, 0);
        REN.setRenderTarget(sheet); REN.clear(true, false, false);
        for (var i = 0; i < n; i++) {
          var h = null;
          if (make) { try { h = make(i); } catch (err) { warn('ctx.shootout.impostors: look ' + i + ' could not be made (' + (err && err.message || err) + ')'); h = null; } }
          else h = list[i];
          if (!h || !h.object || !h.object.isObject3D) continue;
          var obj = h.object, home = [obj.parent, obj.position.clone(), obj.visible], a2c = [];
          obj.position.set(CW / 2, FOOT, 0); obj.visible = true; studio.add(obj);
          obj.traverse(function (q) { if (q.isMesh) (Array.isArray(q.material) ? q.material : [q.material]).forEach(function (m) { if (m && m.alphaToCoverage) { a2c.push(m); m.alphaToCoverage = false; m.needsUpdate = true; } }); });
          try { if (typeof h.settle === 'function') h.settle(); } catch (err) {}
          var cyc = +h.cycle || 1;
          for (var f = 0; f < F; f++) {
            try {
              if (pose) pose(h, f);
              else if (typeof h.step === 'function') h.step(cyc / F);
              else if (typeof h.animate === 'function') h.animate(f * cyc / F, cyc / F, { speed: 0 });
            } catch (err) { warn('ctx.shootout.impostors: look ' + i + ' could not be posed (' + (err && err.message || err) + ')'); }
            obj.updateMatrixWorld(true);
            REN.setRenderTarget(raw); REN.clear(); REN.render(studio, lens);
            var q = i * F + f, col = q % COLS, row = Math.floor(q / COLS), x0 = col / COLS, x1 = (col + 1) / COLS, y0 = row / ROWS, y1 = (row + 1) / ROWS;
            cpos.set([x0, y0, 0, x1, y0, 0, x1, y1, 0, x0, y1, 0]); cg.attributes.position.needsUpdate = true;
            REN.setRenderTarget(sheet); REN.render(copyScene, copyCam);
          }
          studio.remove(obj);
          a2c.forEach(function (m) { m.alphaToCoverage = true; m.needsUpdate = true; });
          if (make) {
            // let go of this look before the next is made: its bones and motion, and the textures only it held
            var own = texOf(obj, new Set());
            try { if (typeof h.dispose === 'function') h.dispose(); } catch (err) {}
            own.forEach(function (tx) { if (!inUse.has(tx)) tx.dispose(); });
          } else { if (home[0]) home[0].add(obj); obj.position.copy(home[1]); obj.visible = home[2]; }
          filmed++;
        }
      } finally {
        REN.setRenderTarget(rt0); REN.setClearColor(cc0, ca0); REN.autoClear = ac0;
        raw.dispose(); copyMat.dispose(); cg.dispose();
      }
      try { console.info('[shoot] step crowd filmed ' + filmed + ' looks in ' + Math.round(performance.now() - t0) + ' ms'); } catch (e) {}
      return { texture: sheet.texture, target: sheet, cols: COLS, rows: ROWS, frames: F, looks: n, cell: [PX, PY], ms: Math.round(performance.now() - t0) };
    }

    /* ------------------------------------------------------------------------------------- the director -- */
    function shootoutWorld() {
      var SO = SHOOT || {};
      function stepLog(name) { try { console.info('[shoot] step ' + name); } catch (e) {} }
      stepLog('director: making');
      // the pitch, in metres (Y up, along z): the goal shot at, the spot, the ball at rest
      var H = 1 / 120, GZ = -52.5, SPOT = [0, -41.5], BALL_R = 0.11;
      var BALL0 = [SPOT[0], BALL_R, SPOT[1]];
      var LOW = quality === 'low';

      /* ------------------------------------------------ the local knobs (M1 only; gated or gone by M3) -- */
      var QP = {}; try { new URLSearchParams(location.search).forEach(function (v, k) { QP[k] = v; }); } catch (e) {}
      function qn(k, d, lo, hi) { var v = parseFloat(QP[k]); return isFinite(v) ? clamp(v, lo, hi) : d; }
      // (?speed= is a fixed base launch speed, m/s, in place of the heat's; ?mark= the run-up's length, m; ?join=run the
      // jog joined at the clip's own run start (D1's comparison); ?grace= ms a release begun before the lock is let pass)
      var KNOB = {
        kick: Math.round(qn('kick', 1, 1, 2)), cut: QP.cut === 'live' ? 'live' : 'b', skill: qn('keeper', 0.8, 0, 1),
        speed: QP.speed != null ? qn('speed', 0, 10, 40) || null : null, lat: qn('lat', 0, -300, 300) / 1000, hud: String(QP.hud || ''), snap: qn('snap', 25, 0, 60),
        mark: qn('mark', 4.75, 4.5, 5.0), join: QP.join === 'run' ? 'run' : null, grace: qn('grace', 0, 0, 300) / 1000,
        seed: QP.seed != null && /^\d+$/.test(QP.seed) ? (parseInt(QP.seed, 10) >>> 0) : null,
      };
      var TEAMS = Array.isArray(SO.teams) && SO.teams.length >= 2 ? SO.teams.slice(0, 2) : [{ name: 'Uruguay', short: 'URU', color: '#74BDE8' }, { name: 'Spain', short: 'ESP', color: '#B3122E' }];
      var TAKER_TEAM = SO.taker === 1 ? 1 : 0;
      var FLOODS = (Array.isArray(SO.floods) ? SO.floods : []).filter(function (p) { return Array.isArray(p) && p.length === 3 && p.every(function (v) { return typeof v === 'number' && isFinite(v); }); }).slice(0, 3);
      if (!FLOODS.length) FLOODS = [[-38, 44, -60], [38, 44, -60], [0, 44, 10]];

      /* ------------------------------------------------------------------------------ the parts, or not -- */
      var M = {
        sim: typeof ShootSim !== 'undefined' && ShootSim && typeof ShootSim.create === 'function' ? ShootSim : null,
        brain: typeof ShootBrain !== 'undefined' && ShootBrain && typeof ShootBrain.taker === 'function' && typeof ShootBrain.keeper === 'function' ? ShootBrain : null,
        goal: typeof shootGoal === 'function' ? shootGoal : null,
        people: typeof shootPeople === 'function' ? shootPeople : null,
        keeper: typeof shootKeeper === 'function' ? shootKeeper : null,
        camera: typeof shootCamera === 'function' ? shootCamera : null,
        audio: typeof shootAudio === 'function' ? shootAudio : null,
        hud: typeof shootHud === 'function' ? shootHud : null,
      };
      var USED = {}, FAILED = {};
      function modFail(name, e) {
        if (FAILED[name]) return;
        FAILED[name] = String(e && e.message || e).slice(0, 200);
        fail('The shootout\'s ' + name + ' failed (' + FAILED[name] + '); a stand-in carries on.');
        try { console.error('[shoot] ' + name + ' failed', e); } catch (x) {}
      }
      function make(name, fn) {
        try { var r = fn(); if (r) { USED[name] = 'own'; stepLog(name + ': made'); } return r || null; }
        catch (e) { modFail(name, e); return null; }
      }
      // the pure parts: the director's stand-ins are plain but keep the same shape
      var SIMM = M.sim || standInSim(), BRAIN = M.brain || standInBrain();
      USED.sim = M.sim ? 'own' : 'stand-in'; USED.brain = M.brain ? 'own' : 'stand-in';
      // the taker's controller (tap-contract §2.9: the first tap starts the run-up, every tap drives it). A brain whose
      // taker is the earlier hold-and-release one keeps its keeper, and the director's own taker (the same contract, the
      // same numbers) runs the tap: so the flow never waits on one part
      var TAKER = null;
      function setTaker() {
        var own = null;
        try { var tk0 = BRAIN.taker(kickMeta(CLIP), {}); own = tk0 && typeof tk0.input === 'function' && typeof tk0.power === 'function' && typeof tk0.started === 'function' ? BRAIN.taker : null; } catch (e) { own = null; }
        TAKER = own || standInBrain().taker;
        USED.taker = own && !BRAIN.standIn ? 'own' : 'stand-in';
      }
      // the tap's numbers: the brain's own C where it has them (tap-contract §2.1), else these
      var TC = { TAP_FLOOR: 0.030, RATE_TAU: 0.40, HEAT_K: 8, HEAT_P: 2.2, RISE: 0.25, COOL: 0.35, BANDS: [0.35, 0.65, 0.90], HOLD_LEAD: 0.35, S_MIN: 0.55, S_MAX: 1.35,
        PRE_T: 1.70, PRE_ACC: 0.50, PRE_STEP: 0.47, PRE_FIRST: 0.20, MARK_D: 4.75, SWING_MIN: 1.0, W_COLD: 0.160, W_HOT: 0.080, W_FLOOR: 0.070, TOUCH_K: 1.5,
        V0: 17, VH: 15, V_FIRE: 3, CONE_K: 1.2, WOB_A: 0.10, WOB_K: [0.6, 1.4], WOB_T: 1.6, AIM_X: [-7, 7], AIM_Y: [0.12, 4.5], REL_GRACE: 0,
        RHO: 1.8, AFTER: 1.15, AFTER_RAMP: 0.075, HANG_CAP: 0.28, PERFECT: 0.35 };
      (function () { var c = M.brain && M.brain.C; if (c) for (var k in TC) if (c[k] != null && typeof c[k] === typeof TC[k]) TC[k] = c[k]; })();
      // the brain's pure helpers (tap-contract §2.10), or the same here
      function fnOf(name, own) { return function () { var f = BRAIN && BRAIN[name]; if (typeof f === 'function' && !BRAIN.standIn) { try { return f.apply(BRAIN, arguments); } catch (e) { modFail('brain.' + name, e); } } return own.apply(null, arguments); }; }
      var bandOf = fnOf('band', function (h) { var B = TC.BANDS; return h < B[0] ? 'COLD' : h < B[1] ? 'WARM' : h < B[2] ? 'HOT' : 'ON FIRE'; });
      var degOf = fnOf('deg', function (h) { return Math.floor(100 * clamp(+h || 0, 0, 1) + 1e-9); });
      var wobbleOf = fnOf('wobble', function (ts, h) { var A = TC.WOB_A * (TC.WOB_K[0] + TC.WOB_K[1] * (+h || 0)), w = 2 * Math.PI * ts / TC.WOB_T; return [A * Math.sin(w), 0.5 * A * Math.sin(2 * w)]; });
      var clampAimOf = fnOf('clampAim', function (x, y) { return [clamp(+x || 0, TC.AIM_X[0], TC.AIM_X[1]), clamp(+y || 0, TC.AIM_Y[0], TC.AIM_Y[1])]; });
      var aimInfoOf = fnOf('aimInfo', function (x, y) {
        var ax = Math.abs(x), dPost = y <= 2.50 ? Math.abs(ax - 3.72) : Math.hypot(ax - 3.72, y - 2.50), dBar = ax <= 3.72 ? Math.abs(y - 2.50) : Math.hypot(ax - 3.72, y - 2.50);
        return { inFrame: ax < 3.66 && y < 2.44, nearWood: Math.min(dPost, dBar) < 0.17, over: y >= 2.44, wide: ax >= 3.66 };
      });
      var pilotOf = fnOf('pilot', standInPilot);

      /* ------------------------------------------------------------------------------- the people -- */
      // the taker is P0 (you, from #me=, or the world's player()); the keeper and the referee are the world's
      // rival(ctx, 1|2, { role, body }), built here (never makeRival: v1's reset() would put a cached one on the lap)
      var BODY = ME ? ME_BODY[ME.body] : (typeof SO.body === 'string' ? SO.body : 'human-athlete-male');
      var TAKER_BODY = youShown && ME ? ME_BODY[ME.body] : (typeof SO.body === 'string' ? SO.body : 'human-athlete-male');
      function person(k, role) {
        var raw = null, e = null;
        try { raw = call('rival', k, { role: role, body: BODY }); e = asEntity(raw, 'rival(ctx, ' + k + ')', 0.9); }
        catch (err) {
          fail('rival(ctx, ' + k + ') failed (the ' + role + '): ' + (err && err.message || err));
          var g = new THREE.Group(), cap = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 1.2, 4, 12), new THREE.MeshStandardMaterial({ color: '#888888' }));
          cap.position.y = 0.9; g.add(cap); e = { object: g, model: cap, radius: 0.5, half: 0.5, height: 1.8, animate: null, clips: null };
        }
        // (built after the graphics started: makeRival's steps, which a rival built at boot gets; critique #8)
        var shadow = !(role === 'referee' && LOW);
        e.object.traverse(function (o) { if (o.isMesh) o.castShadow = shadow && !(o.material && o.material.transparent) && !o.userData.gmFx; });
        envify(e.object);
        if (LIVE) liveMaterials(e.object);
        e.handle = raw; e.role = role;
        if (raw && typeof raw.detail === 'function') try { raw.detail(role === 'keeper'); } catch (x) {}
        scene.add(e.object);
        return e;
      }
      stepLog('people: making');
      var KEEPER = person(1, 'keeper'), REF = person(2, 'referee');
      var HUMANS = [P0, KEEPER, REF];
      stepLog('people: made');
      // what the lap would draw is never shown
      coinMesh.visible = false;
      scene.traverse(function (o) { if (o.userData && o.userData.gmTrack) o.visible = false; });

      // the keeper's limbs as his body has them (critique #1): the skeleton's own numbers, scaled as it was built
      var KSKEL = (function () {
        var A = ASSETS[BODY], sk = A && A.json && A.json.skeleton;
        if (!sk) return null;
        var sc = KEEPER.model && KEEPER.model.scale ? KEEPER.model.scale.x : 1, h = (A.json.height || 1.869);
        if (Math.abs(sc - 1) < 1e-6) return { skel: sk, height: h, scale: 1 };
        var m = function (a) { return Array.isArray(a) ? a.map(function (v) { return v * sc; }) : a; };
        return { skel: sk.map(function (b) { return { name: b.name, parent: b.parent, head: m(b.head), tail: m(b.tail) }; }), height: h * sc, scale: sc };
      })();
      var KDIMS = null;
      if (KSKEL && typeof BRAIN.dims === 'function') { try { KDIMS = BRAIN.dims(KSKEL.skel, KSKEL.height); } catch (e) { modFail('keeper dims', e); } }

      // the kick: the clip's meta from the taker's body (merged in from human-moves-football-*), its start the press
      // (lane A cuts it at run - 0.15 s, critique #22: trimmed here too for an older cut, so the timing and the drawing
      // read the same numbers)
      function clipMeta(body, name) {
        var A = ASSETS[body], l = A && A.json && A.json.clips && A.json.clips.list;
        if (!l) return null;
        for (var i = 0; i < l.length; i++) if (l[i].name === name) return l[i];
        return null;
      }
      var CLIP = KNOB.kick === 2 ? 'fbKick2' : 'fbKick';
      var STANDIN_KICK = { foot: 'R', start: 0, run: 0.15, plant: 1.725, contact: 1.85, stance: [['L', 0, 0.1583], ['R', 0, 0.6833], ['L', 0.4167, 1.2833], ['R', 1.175, 1.5167], ['L', 1.725, 2.025]],
        steps: [['L', 0.4167, 2.182, -1.484], ['R', 1.175, 1.446, -1.126], ['L', 1.725, 0.316, 0.182]], lastStride: 1.729, standIn: true };
      function kickMeta(clip) {
        var c = clipMeta(TAKER_BODY, clip) || clipMeta(TAKER_BODY, 'fbKick'), k = c && c.kick && typeof c.kick === 'object' ? c.kick : null;
        var m = JSON.parse(JSON.stringify(k || STANDIN_KICK));
        if (typeof m.run === 'number' && isFinite(m.run)) m.start = Math.max(+m.start || 0, m.run - 0.15);
        m.start = +m.start || 0;
        m.clip = c ? c.name : clip; m.duration = c ? c.duration : null;
        return m;
      }
      setTaker();
      // the run-up's nominal prefix (s) for a clip: the people kit's plan for the mark (P.pre.T), else the brain's
      var PRET = {};
      function preTFor(clip) { return PRET[clip] > 0 ? PRET[clip] : TC.PRE_T; }

      /* -------------------------------------------------------------------- the drawn parts, or not -- */
      var GOAL = M.goal && make('goal', function () { return shootGoal({ style: SO.goal && typeof SO.goal === 'object' ? SO.goal : {}, quality: quality }); }) || standInGoal();
      if (!USED.goal) USED.goal = 'stand-in';
      var PEOPLE = M.people && make('people', function () { return shootPeople({ P0: P0, ref: REF, quality: quality, body: TAKER_BODY, clip: CLIP, spot: SPOT.slice(), H: H }); });
      var PK = M.people && (shootPeople.PK || null);
      // (a taker that is no library human, a stand-in box: the people kit has no rig for it, and the director moves it)
      if (PEOPLE && !PEOPLE.taker) { warn('The shootout\'s taker is not a library human; it is moved as a box.'); PEOPLE = null; delete USED.people; }
      var KRIG = PK && typeof PK.rig === 'function' && KEEPER.model ? make('keeper rig', function () { return PK.rig(KEEPER, { body: BODY }); }) : null;
      var KBODY = M.keeper && PK && KRIG ? make('keeper', function () {
        var ks = KEEPER.clips ? KEEPER.clips() : [], gu = ks.some(function (c) { return c && c.name === 'gkGetupL'; }) ? 'gkGetupL' : null;
        return shootKeeper({ model: KEEPER.model, clips: KEEPER.clips }, { pk: PK, skeleton: KSKEL ? KSKEL.skel : null, getup: gu || undefined, getupRate: 1.3, quality: quality });
      }) : null;
      var NBLOB = HUMANS.length * FLOODS.length;
      var BLOBS = PK && typeof PK.blobs === 'function' ? make('blobs', function () { return PK.blobs(NBLOB); }) : null;
      var CAM = M.camera && make('camera', function () { return shootCamera({ quality: quality, touchTop: touchTop, cut: KNOB.cut, goal: GZ, spot: SPOT.slice() }); }) || standInCamera();
      if (!USED.camera) USED.camera = 'stand-in';
      var SND = M.audio && make('audio', function () { return shootAudio({ quality: quality, teams: TEAMS, taker: TAKER_TEAM }); }) || standInAudio();
      if (!USED.audio) USED.audio = 'stand-in';
      var HUD = M.hud && make('hud', function () { return shootHud({ teams: [TEAMS[TAKER_TEAM], TEAMS[1 - TAKER_TEAM]], onSkip: function () { skipScene(); }, onRetry: function () { nextKick(); } }); }) || standInHud();
      if (!USED.hud) USED.hud = 'stand-in';
      // the recorded crowd (tap-contract §6): a library sheet of cues, decoded by the sound itself after the first gesture;
      // none (or one that fails) leaves the synth playing every slot (no sound is made here, so the demo's gate is passed by)
      if (SND && typeof SND.load === 'function') { try { SND.load(ASSETS['audio-crowd-shootout'] || null); } catch (e) { modFail('audio.load', e); } }
      USED.people = PEOPLE ? 'own' : 'stand-in'; USED.keeper = KBODY ? 'own' : 'stand-in';
      // a call into a drawn part: a part that throws is let go (said once) and the stand-in carries on
      function part(name, obj, fn) {
        var f = obj && obj[fn];
        if (typeof f !== 'function') return undefined;
        // (the demo makes no sound, RULES row 18: nothing but 'off', the level and the step reach the sound in it)
        if (name === 'audio' && demo && fn !== 'level' && fn !== 'step' && !(fn === 'mood' && arguments[3] === 'off')) return undefined;
        try { return f.apply(obj, [].slice.call(arguments, 3)); }
        catch (e) {
          modFail(name + '.' + fn, e);
          if (name === 'people') { PEOPLE = null; USED.people = 'stand-in'; }
          else if (name === 'keeper') { KBODY = null; USED.keeper = 'stand-in'; }
          else if (name === 'goal') { try { if (GOAL && GOAL.ball && GOAL.ball.parent) GOAL.ball.parent.remove(GOAL.ball); } catch (x) {} GOAL = standInGoal(); USED.goal = 'stand-in'; }
          else if (name === 'camera') { CAM = standInCamera(); USED.camera = 'stand-in'; }
          else if (name === 'audio') { SND = standInAudio(); USED.audio = 'stand-in'; }
          else if (name === 'hud') { try { if (HUD && HUD.dispose) HUD.dispose(); } catch (x) {} HUD = standInHud(); USED.hud = 'stand-in'; }
          else if (name === 'blobs') { BLOBS = null; }
          return undefined;
        }
      }
      // where the touch kit's buttons begin, a fraction of the screen's height (kart.js touchTop, copied): the camera keeps
      // the goal line above them on a phone held upright (the heat gauge over KICK counts too, tap-contract X15)
      function touchTop() {
        var top = 1;
        // (the gauge only with the touch kit: on a desktop it stands at the right, beside the KICK disc)
        root.querySelectorAll(root.classList.contains('touch') ? '.tpad button, .so-gauge' : '.tpad button').forEach(function (b) { var r = b.getBoundingClientRect(); if (r.width > 2 && r.height > 2 && getComputedStyle(b).display !== 'none') top = Math.min(top, r.top / Math.max(1, innerHeight)); });
        return top;
      }
      var TV = new THREE.Vector3(), TV2 = new THREE.Vector3();
      function takerAt(out) {
        var p = PEOPLE && PEOPLE.taker ? part('people', PEOPLE.taker, 'pos', out) : null;
        return p || out.copy(P0.object.position).setY(0.95);
      }

      /* ------------------------------------------------------------------------- the phone's tier -- */
      // (no hook: the runtime's own boot names; critique #21)
      if (LOW) {
        if (basePixelRatio > 1.25) { basePixelRatio = 1.25; renderer.setPixelRatio(basePixelRatio); renderer.setSize(window.innerWidth, window.innerHeight); if (post) post.resize(); }
        if (post && post.msaa) post.setMsaa(false);
        if (sunLight && SUNB && sunLight.shadow.mapSize.x > 1024) {
          sunLight.shadow.mapSize.set(1024, 1024);
          if (sunLight.shadow.map) { sunLight.shadow.map.dispose(); sunLight.shadow.map = null; }
          SUNB.texel = 2 * SUNB.E / 1024;
        }
        stepLog('phone tier: ' + renderer.getPixelRatio() + 'x, msaa ' + !!(post && post.msaa) + ', shadow ' + (sunLight ? sunLight.shadow.mapSize.x : 0));
      }

      /* ------------------------------------------------------------------------------- the session -- */
      var SESS = { seed: KNOB.seed != null ? KNOB.seed : (Date.now() >>> 0), kicks: 0, goals: 0, list: [], index: 0, demo: 0, walked: false };
      function kickSeed(i, demoK) { return hashStr(SESS.seed + ':' + (demoK ? 'demo' : 'kick') + ':' + i) >>> 0; }
      function tally() {
        var done = SESS.list.map(function (k) { return k === 'goal' ? 'goal' : 'miss'; }), live = PH === 'walk' || PH === 'whistle' || PH === 'set' || PH === 'runup';
        var dots = live ? done.slice(-4).concat(['next']) : done.slice(-5);
        return { dots: [dots], scoreText: SESS.goals + '/' + SESS.kicks, label: live ? 'Kick ' + (SESS.kicks + 1) : SESS.kicks ? 'Goals ' + SESS.goals + ' of ' + SESS.kicks : '' };
      }

      /* ------------------------------------------------------- a kick: pure state, stepped at 120 Hz -- */
      // A kick is a record (its seed, and its inputs as sim step indices) and the state stepped from it: the same record
      // stepped again gives the same steps, contacts, outcome and hash (rekick, the replay's tape, debug.sim). Its inputs
      // (tap-contract §1.3, critique #3) are KICK's edges, each [stamp, at, kind]: the step it happened at (stamped from the
      // event's own time) and the step it was applied at (the next one to run, when it was read after its moment); kind 1
      // is a press (every press a tap), 0 the let-go of every source. Or, for the demo, a debug kick and Node, a scripted
      // player (pilot). The taker's controller makes all the rest of them: the start, the heat, the lock, the strike's
      // release and its grade. Step n is the moment n H, in the order of the brain's own headless kick (ShootBrain.kick,
      // which sim-check runs in Node): the inputs due; the taker (the lock locks the aim and the keeper decides; the
      // release, or the auto strike, draws the cone and tells him the strike; the contact launches the ball at its step);
      // the keeper at n H with the ball as it stands then, his colliders; the ball one step on. Nothing here touches THREE
      // or reads a clock.
      function newRec(o) {
        var clip = o.clip || CLIP;
        var rec = {
          v: 2, seed: o.seed >>> 0, kick: o.kick || 0, demo: !!o.demo, n0: o.n0 || 0, setStep: null, clip: clip,
          keeper: o.keeper === false ? false : o.keeper && typeof o.keeper === 'object' ? o.keeper : undefined, skill: o.skill == null ? KNOB.skill : o.skill, cone: o.cone == null ? null : +o.cone,
          touch: !!o.touch, preT: o.preT > 0 ? +o.preT : preTFor(clip), grace: o.grace != null ? Math.max(0, +o.grace || 0) : KNOB.grace, join: o.join !== undefined ? o.join : KNOB.join,
          Wfix: o.Wfix > 0 ? +o.Wfix : null, speedFix: o.speedFix > 0 ? +o.speedFix : KNOB.speed,
          edges: Array.isArray(o.edges) ? o.edges.map(function (e) { return [e[0] | 0, e[1] | 0, e[2] ? 1 : 0]; }) : [], pilot: o.pilot && typeof o.pilot === 'object' ? o.pilot : null,
          aim: Array.isArray(o.aim) ? clampAimOf(+o.aim[0] || 0, o.aim[1] == null ? 1 : +o.aim[1]) : null,
        };
        // (the keeper: false is an empty goal, an object forces his mind; the auto keeper is no key at all, as the brain's
        // ShootBrain.kick reads a null keeper as an empty goal)
        if (rec.keeper === undefined) delete rec.keeper;
        return rec;
      }
      function newKick(rec, headless) {
        var K = {
          rec: rec, n: rec.n0, meta: kickMeta(rec.clip), headless: !!headless, sim: null, kp: null, tk: null, tkOpts: null, tko: null, ei: 0, pilot: null, pe: null,
          ks: null, ksPrev: null, cols: [], cone: null, grade: null, power: null, launched: false, launchT: null, released: false, auto: false, relStep: null,
          contactStep: -1, launch: null, outcome: null, outStep: -1, hashAt: null, events: [], contacts: [], buf: [], plan: null, react: null, broken: false,
        };
        K.sim = SIMM.create({ seed: rec.seed, colliders: function () { return K.cols; } });
        // (keeper: false is an empty goal, as ShootBrain.kick's null)
        K.kp = rec.keeper === false ? emptyGoal() : BRAIN.keeper({ dims: KDIMS, seed: rec.seed, skill: rec.skill, antics: false });
        // the taker's controller, there before the first tap (its step says 'set' until a tap starts the run-up); the
        // device's window is read at the lock, so the first press setting touch is in time (the options are kept, and set)
        K.tkOpts = { touch: !!rec.touch, preT: rec.preT, Wfix: rec.Wfix, speedFix: rec.speedFix, relGrace: rec.grace || 0, join: rec.join || null };
        try { K.tk = TAKER(K.meta, K.tkOpts); }
        catch (e) { modFail('brain.taker', e); BRAIN = standInBrain(); USED.brain = 'stand-in'; setTaker(); K.kp = rec.keeper === false ? emptyGoal() : BRAIN.keeper({ dims: KDIMS, seed: rec.seed, skill: rec.skill }); K.tk = TAKER(K.meta, K.tkOpts); }
        if (K.kp.track) K.kp.track(K.tk);
        if (rec.pilot) { K.pilot = pilotOf(rec.pilot); K.pe = []; }
        return K;
      }
      function emptyGoal() { return { decide: function () { return null; }, state: function (tt) { return null; }, colliders: function () { return []; } }; }
      function stepKick(K) {
        var R = K.rec, n = K.n, t0 = n * H, out = null, tk = K.tk;
        function ev(e) { e.n = n; (out || (out = [])).push(e); if (e.type !== 'step' || !K.headless) K.events.push(e); }
        // 1. the inputs due at this step, in the record's order (a scripted player's stamped now)
        if (K.pilot) {
          var pe = K.pilot.edges(n, tk) || [];
          for (var p = 0; p < pe.length; p++) { tk.input(pe[p][0] ? 'press' : 'release', pe[p][1]); if (K.pe.length < 4000) K.pe.push([pe[p][1], n, pe[p][0] ? 1 : 0]); }
        } else {
          var E = R.edges;
          while (K.ei < E.length && E[K.ei][1] <= n) { var ed = E[K.ei++]; tk.input(ed[2] ? 'press' : 'release', ed[0]); }
        }
        // 2. the taker at n H (its events in its order: start, the taps, the lock, the strike's release, the footfalls,
        // the plant, the contact)
        var st = tk.step(n) || { c: tk.c0, rate: 0, hang: 0, phase: 'set', events: [] };
        K.tko = st;
        var te = st.events || [], nC = null;
        for (var i = 0; i < te.length; i++) {
          var x = te[i], ty = x.type;
          if (ty === 'lock') { lockKick(K, n); ev({ type: 'lock' }); }
          else if (ty === 'release' || ty === 'auto') {
            if (K.released) continue;
            K.released = true; if (ty === 'auto') K.auto = true; K.relStep = x.n != null ? x.n : n;
            drawCone(K);
            ev({ type: ty, stamp: K.relStep });
          }
          else if (ty === 'contact') { if (!K.launched) nC = x.n != null ? Math.min(n, x.n) : n; }
          else if (ty === 'tap' || ty === 'ignored' || ty === 'mash') ev({ type: ty, stamp: x.n });
          else if (ty === 'start' || ty === 'plant') { if (ty === 'start' && K.startN == null) K.startN = n; ev({ type: ty }); }
          else ev({ type: ty, i: x.i, foot: x.foot, pre: !!x.pre, plant: !!x.plant });
        }
        // the strike: the ball launched at the contact step's time (a contact read late is caught up to now)
        if (nC != null) {
          if (!K.cone) drawCone(K);
          launchBall(K, nC); K.contactStep = nC;
          ev({ type: 'contact', grade: K.launch.grade, err: K.launch.err });
          while (K.sim.state().t < t0 - 1e-9) stepBall(K, ev, t0);
        }
        // the keeper at n H, with the ball as it stands, and his colliders for the ball's step
        var bs = K.launched ? K.sim.state() : null;
        K.ksPrev = K.ks;
        K.ks = K.kp.state(t0, bs ? { p: bs.p, v: bs.v, w: bs.w, t: t0, contactT: K.launchT } : null);
        if (tk.started() && K.ks) K.cols = K.kp.colliders(K.ks) || [];
        // the ball, one step on
        if (K.launched) stepBall(K, ev, t0 + H);
        // (the tape only from the first tap to just past the outcome: the replay never reaches outside it, and a long wait
        // at the mark, or the retry, records nothing a phone has to collect)
        if (!K.headless && tk.started() && (K.outStep < 0 || n <= K.outStep + 60)) record(K, n, out);
        K.n++;
        return out;
      }
      // the lock (the last stride begins): the aim locks where the marker stood (live; a record carries its own), the
      // heat's power is fixed, and the keeper decides from the run-up he saw (tap-contract §2.8: his draws never read
      // the tap rate or the release)
      function lockKick(K, n) {
        var R = K.rec, tk = K.tk;
        if (!R.aim) R.aim = K.headless ? [0, 1] : lockedAim(n, tk);
        K.power = tk.power ? tk.power() : null;
        K.plan = K.kp.decide({ aim: R.aim.slice(), contactT: tk.predictContact(n), ballSpeed: K.power ? K.power.speed : null, heat: K.power ? K.power.H : null, tell: 1,
          force: R.keeper && typeof R.keeper === 'object' ? R.keeper : null });
      }
      function stepBall(K, ev, tEnd) {
        var es = K.sim.step(H) || [];
        for (var j = 0; j < es.length; j++) {
          var e = es[j];
          if (e.type === 'outcome' || e.type === 'plane') continue;
          if (/^(glove|body|post|bar|held|net)$/.test(e.type)) K.contacts.push({ type: e.type, part: e.part || null, side: e.side == null ? null : e.side, n: K.n, at: e.at ? e.at.slice() : null });
          ev({ type: e.type, part: e.part || null, side: e.side == null ? null : e.side, at: e.at ? e.at.slice() : null, speed: e.speed, outside: !!e.outside });
        }
        var s2 = K.sim.state();
        if (s2.outcome && !K.outcome) {
          K.outcome = s2.outcome; K.outStep = K.n; K.hashAt = K.sim.hash();
          if (K.kp.result) K.kp.result(s2.outcome.kind);
          K.react = { kind: s2.outcome.kind, t0: tEnd };
          ev({ type: 'outcome', outcome: s2.outcome });
        }
      }
      // the cone of error from the strike's release (drawn once, at its step; the auto strike's too, tap-contract X4):
      // ONE window, the locked heat's (power().W, which the grade read: B1), the heat's widening of it, and the keeper
      // told the strike's speed and its systematic lift (ShootBrain.kick's KP.strike)
      function drawCone(K) {
        var R = K.rec, tk = K.tk, pw = K.power || (tk.power ? tk.power() : null) || { W: TC.W_COLD, speed: TC.V0, coneK: 1 };
        K.power = pw;
        var g = tk.grade ? tk.grade() : null;
        if (!g) g = { err: 0, W: pw.W, q: 0, grade: 'good', auto: false };
        K.grade = g;
        K.cone = K.sim.cone({ err: g.err, W: g.W || pw.W, k: pw.coneK || 1, auto: !!g.auto, sigma: R.cone == null ? null : R.cone }) || { dYaw: 0, dPitch: 0, speedK: 1, sigma: 0, bias: 0 };
        if (K.kp.strike) K.kp.strike({ speed: pw.speed * (K.cone.speedK || 1), bias: K.cone.bias || 0 });
      }
      // the shot as struck: the inverse aim at the locked target at the heat's speed, then the cone's deviation and spin
      // (the target may lie past a post or over the bar: the flight ignores the frame, so the wood or the miss is physics)
      function launchBall(K, nC) {
        var R = K.rec, pw = K.power || { W: TC.W_COLD, speed: TC.V0 }, g = K.grade || { err: 0, W: pw.W, q: 0, grade: 'good' }, cn = K.cone, t1 = nC * H;
        var L = K.sim.aim({ target: R.aim.slice(), speed: pw.speed, cone: cn, t: t1 });
        K.sim.launch(L);
        K.launched = true; K.launchT = t1;
        if (K.kp.contact) K.kp.contact(t1);
        var sp = L.speed > 0 ? L.speed : pw.speed * (cn.speedK || 1);
        K.launch = { speed: sp, kmh: Math.round(sp * 3.6), base: pw.speed, grade: g.grade, q: g.q, err: g.err, W: g.W || pw.W, auto: !!g.auto, sigma: cn.sigma, bias: cn.bias,
          dYaw: cn.dYaw, dPitch: cn.dPitch, miss: L.solve ? L.solve.miss : null, iters: L.solve ? L.solve.iters : null };
      }
      // the replay's tape: what each step drew (the taker's clip time and heat, the keeper's state, the ball's), as plain
      // numbers
      function plain(o) {
        if (o == null || typeof o !== 'object') return o;
        if (Array.isArray(o)) { var a = new Array(o.length); for (var i = 0; i < o.length; i++) a[i] = plain(o[i]); return a; }
        if (ArrayBuffer.isView(o)) return Array.prototype.slice.call(o);
        var r = {}; for (var k in o) { var v = o[k]; if (typeof v !== 'function') r[k] = plain(v); } return r;
      }
      function record(K, n, evs) {
        var tk = K.tko, ht = K.tk.heat ? K.tk.heat() : null, m = K.rec.aim || markerAt(n * H, ht ? ht.H : 0);
        var bf = bounceOf(K, n * H);
        K.buf.push({ n: n, c: tk ? tk.c : null, rate: tk ? tk.rate || 0 : 0, hang: tk ? tk.hang || 0 : 0, held: true, sub: subOf(tk), heat: ht ? ht.H : 0, bounce: bf[0], bt: bf[1], ret: [m[0], m[1]],
          react: K.react ? { kind: K.react.kind, t: n * H - K.react.t0 } : null, ks: plain(K.ks), sim: K.launched ? K.sim.state() : null, ev: evs, cam: null });
        if (K.buf.length > 1200) K.buf.splice(0, 300);
      }
      // the toes' bounce let go of over the first 0.2 s of the run-up, on the set's own clock carried on (Ma-to-R-i3 #5):
      // [bounce 0..1, its clock]; none before the start or for a kick with no set (headless)
      var BF = [0, 0];
      function bounceOf(K, tNow) {
        if (!K || K.startN == null) { BF[0] = 0; BF[1] = 0; return BF; }
        var s = Math.max(0, tNow - K.startN * H);
        BF[0] = s >= 0.2 ? 0 : 1 - smooth(0, 0.2, s); BF[1] = BTS + s; return BF;
      }
      // the run-up's sub-state from the taker's step (tap-contract §1.1)
      function subOf(st) { var p = st && st.phase; return p === 'tap' || p === 'stride' || p === 'hang' ? p : null; }
      // a kick run with no picture (debug.simLive, debug.rekick): to its outcome and half a second on
      function runHeadless(rec, maxSec) {
        var K = newKick(rec, true), cap = rec.n0 + Math.round((maxSec || 40) / H), idle = !rec.pilot && !(rec.edges && rec.edges.length);
        while (K.n < cap) {
          stepKick(K);
          if (K.outcome && K.n - K.outStep > 60) break;
          if (idle && K.n > rec.n0 + 240) break;
        }
        return K;
      }
      function tapsOf(K) {
        var s = K.tk.steps ? K.tk.steps() : null;
        return s ? { start: s.start, lock: s.lock, release: s.release, auto: !!s.auto, contact: K.contactStep >= 0 ? K.contactStep : null, presses: s.presses, accepted: s.accepted, ignored: s.ignored, mashed: s.mashed } : null;
      }
      function heatOf(K) {
        var h = K.tk.heat ? K.tk.heat() : null;
        return h ? { H: r3(h.H), Hs: r3(h.Hs), r: r3(h.r), band: h.band || bandOf(h.H), deg: h.deg != null ? h.deg : degOf(h.H), locked: !!h.locked, Hlock: h.locked ? r3(h.H) : null } : null;
      }
      function resultOf(K) {
        var o = K.outcome, s = tapsOf(K);
        return {
          outcome: o ? { kind: o.kind, woodwork: o.woodwork || false, part: o.part || null, keeperTouched: !!o.keeperTouched, held: !!o.held, miss: o.miss || null, t: o.t } : null,
          hash: K.hashAt, hashEnd: K.sim.hash ? K.sim.hash() : null, n: K.n - K.rec.n0, steps: s, lock: s ? s.lock : null, contactStep: K.contactStep, outStep: K.outStep,
          grade: K.launch ? K.launch.grade : null, errMs: K.launch ? Math.round(K.launch.err * 1000) : null, auto: !!K.auto, launch: K.launch, kmh: K.launch ? K.launch.kmh : null,
          heat: heatOf(K), power: K.power ? roundDeep(plain(K.power)) : null,
          contacts: K.contacts.slice(), events: K.events.filter(function (e) { return e.type !== 'step' && e.type !== 'tap' && e.type !== 'ignored' && e.type !== 'mash'; }).map(function (e) { return { type: e.type, n: e.n, part: e.part || undefined }; }),
          plan: plain(K.plan), rec: plain(K.rec), pilotEdges: K.pe ? K.pe.slice() : null,
        };
      }

      /* ------------------------------------------------------------------------------ the live kick -- */
      var LK = null, ACC = 0, LAST = null, HIST = [];
      // the sim's time as the last frame stood, against the clock: an event's own time stamp maps to a step through it
      var TS = { p: performance.now(), t: 0, k: 1 };
      function stepOf(stamp) {
        var s = +stamp; if (!(s > 0)) s = performance.now();
        var ts = TS.t + (s - TS.p) / 1000 * TS.k - KNOB.lat;
        return Math.max(0, Math.round(ts / H));
      }
      // the moment drawn: the last step's n H, and the part of a step since (the ball is stepped one on, and lerped back)
      function simNow() { return LK ? (LK.n - 1) * H + ACC : t; }
      // the hit-stop (open.js IMPS, copied): held still 50 ms, then eased back over 100 ms, in real time
      var IMPS = { t: 9, hold: 0.05, ease: 0.10, real: 0, game: 0, held: 0, n: 0 };
      function impFreeze() { return IMPS.t < IMPS.hold + IMPS.ease; }
      var DBG = { slow: 1 };
      // advance the live kick by sdt of game time, in whole steps; a contact stops the steps for the hit-stop
      function advance(sdt) {
        if (!LK || LK.broken) return;
        ACC += sdt;
        var guard = 0;
        while (ACC >= H - 1e-9 && guard++ < 64) {
          ACC -= H;
          var evs;
          try { evs = stepKick(LK); }
          catch (e) { modFail('kick step', e); LK.broken = true; SIMM = standInSim(); BRAIN = standInBrain(); USED.sim = USED.brain = 'stand-in'; setTaker(); KDIMS = null; ACC = 0; brokenT = 0; KICKS.log = false; return; }
          // (KICK's edges are logged until the strike's release, or the contact)
          if (KICKS.log && (LK.released || LK.launched)) KICKS.log = false;
          if (evs) present(evs);
          if (impFreeze()) break;
        }
        if (ACC > H) ACC = H * 0.999;
      }
      var brokenT = 0;

      /* ------------------------------------------------------------------------------- the phases -- */
      // demo -> (start) -> walk -> whistle -> set -> runup (tap > stride > hang) -> strike -> flight -> result -> replay ->
      // retry -> walk ... The run-up's start and its lock are the taker's own events (the first tap; the last stride's
      // touchdown), so one code runs for a player, the demo's pilot, debug.kick and a rekick (tap-contract X1)
      var PH = 'boot', PT = 0, SUB = null, FIRST_WALK = false, WSTAGE = '', WH = 0.6, BTS = 0;
      var WT = { t1: 3.27, t2: 3.87, t3: 5.47, t4: 5.87, total: 6.17 };
      var PHLOG = [], EVN = {}, RETRY_T = 0, RP = null, PULSE = null, WOODWORK_IN = null, RESUME = null, BEAT = 0, ONB = { done: false };
      function logPhase(e) { PHLOG.push(e); if (PHLOG.length > 300) PHLOG.splice(0, 100); }
      function setPhase(p) {
        // (the set's bounce clock, carried on into the run-up so the first tap lets go of the toes' bounce smoothly)
        if (p === 'runup' && PH === 'set') BTS = PT;
        PH = p; PT = 0; SUB = p === 'runup' ? 'tap' : null;
        var e = { p: p, at: Math.round(performance.now()), step: LK ? LK.n : 0 }; if (SUB) e.sub = SUB;
        logPhase(e);
        part('hud', HUD, 'phase', demo ? 'demo' : p);
      }
      // the run-up's sub-state (tap, then the last stride, then the hang at the plant), logged as { p: 'runup', sub }
      function setSub(s) { if (PH !== 'runup' || SUB === s) return; SUB = s; logPhase({ p: 'runup', sub: s, at: Math.round(performance.now()), step: LK ? LK.n : 0 }); hint(); }
      function send(name, data) { EVN[name] = (EVN[name] || 0) + 1; emit(name, data); }
      // the frame's pulse for the ring (a tap's halo, a footfall, the plant, the contact: the strongest wins)
      var PULSES = { tap: 1, step: 2, plant: 3, contact: 4 };
      function pulse(p) { if (!PULSE || PULSES[p] > PULSES[PULSE]) PULSE = p; }

      // the mark: where the run-up's jog starts, about 4.75 m behind the ball (the people kit plans it and the prefix's
      // length, P.pre.T, with it); the stand-in's otherwise
      var MARK = [-3.7, -38.6];
      function planTaker(aim, meta) {
        var m = meta || (LK ? LK.meta : kickMeta(CLIP));
        var P = part('people', PEOPLE && PEOPLE.taker, 'plan', { ent: P0, ball: BALL0.slice(), clip: m.clip || CLIP, meta: m, aim: aim ? [aim[0], aim[1]] : null, goalZ: GZ, snapDeg: KNOB.snap, tell: 1,
          markD: KNOB.mark, join: KNOB.join });
        var mk = P && P.mark;
        if (mk && Array.isArray(mk) && isFinite(mk[0]) && isFinite(mk[1])) MARK = [mk[0], mk[1]];
        else if (mk && isFinite(mk.x)) MARK = [mk.x, mk.z];
        if (P && P.walk && P.walk.total > 0) WT = { t1: P.walk.t1, t2: P.walk.t2, t3: P.walk.t3, t4: P.walk.t4, total: P.walk.total };
        if (P && P.pre && P.pre.T > 0) PRET[m.clip || CLIP] = +P.pre.T;
        return P;
      }
      // the people kit draws the jog on the taker's own clock (tap-contract §4: taker.timeline(tk.pre))
      function handTimeline(K) { if (K && K.tk && K.tk.pre) part('people', PEOPLE && PEOPLE.taker, 'timeline', K.tk.pre); }
      function beginKick(o) {
        hideScreen();
        var clip = o.clip || CLIP;
        // (the plan first: its prefix length is the record's)
        planTaker(o.aim || null, kickMeta(clip));
        LK = newKick(newRec(o)); ACC = 0; IMPS.t = 9; RP = null; WOODWORK_IN = null; KICKS.log = false; clearSources();
        handTimeline(LK);
        part('goal', GOAL, 'reset');
        part('hud', HUD, 'result', null); part('hud', HUD, 'flash', null); part('hud', HUD, 'ring', null); part('hud', HUD, 'retry', null);
        return LK;
      }
      // a kick from the start: the walk (the session's first, in full) or, again, a cut to the mark
      function walkIn(first) {
        SESS.index++;
        state = 'race'; demo = false; paused = false; root.classList.remove('demo'); root.classList.remove('so-scene');
        beginKick({ seed: kickSeed(SESS.index), kick: SESS.index });
        FIRST_WALK = !!first; WSTAGE = '';
        setPhase('walk');
        camCut(first ? 'WALK' : 'HERO');
        send('walk', { kick: LK.rec.kick });
        part('audio', SND, 'mood', 'ambient', { side: TAKER_TEAM }); part('audio', SND, 'heartbeat', 0); BEAT = 0;
        part('hud', HUD, 'tracker', tally());
        hint();
      }
      function walkStage() {
        if (!FIRST_WALK) return PT >= 0.8 ? 'done' : 'settle';
        return PT < WT.t1 ? 'to' : PT < WT.t2 ? 'look' : PT < WT.t3 ? 'back' : PT < WT.t4 ? 'turn' : PT < WT.total + 0.1 ? 'settle' : 'done';
      }
      function stepWalk() {
        var s = walkStage();
        if (s !== WSTAGE) {
          WSTAGE = s;
          // (the first kick: the keeper from behind his net as the taker steps back, then back to the walk)
          if (FIRST_WALK && s === 'back') camCut('KEEPER');
          if (FIRST_WALK && s === 'turn') camCut('WALK');
        }
        if (s === 'done') enterWhistle();
      }
      function enterWhistle() {
        setPhase('whistle');
        WH = FIRST_WALK ? 1.5 : 0.6;
        send('whistle', { kick: LK.rec.kick });
        part('audio', SND, 'sfx', 'whistle'); part('audio', SND, 'mood', 'hush', { side: TAKER_TEAM });
        part('people', PEOPLE && PEOPLE.ref, 'whistle', t);
        camCut(FIRST_WALK ? 'BALL' : 'HERO');
      }
      function enterSet() {
        setPhase('set');
        LK.rec.setStep = LK.n;
        if (!demo) { BEAT = 72; part('audio', SND, 'heartbeat', BEAT); }
        camCut('HERO');
        part('hud', HUD, 'tracker', tally());
        hint();
      }
      // the first tap: the run-up starts (sub-state tap); the heat it builds is drawn and heard every frame
      function enterRunup() {
        setPhase('runup');
        hint();
      }
      // the lock: the last stride (HOLD, then RELEASE on the plant); the aim, the heat and the keeper's mind are fixed
      function onLock() {
        if (PH !== 'runup') return;
        setSub('stride');
        planTaker(LK.rec.aim, LK.meta); handTimeline(LK);
        var hl = LK.tk.heat ? LK.tk.heat().H || 0 : 0;
        if (!demo) {
          part('audio', SND, 'mood', 'inhale', { side: TAKER_TEAM }); part('audio', SND, 'sfx', 'lock', { heat: hl });
          BEAT = Math.round(80 + 60 * hl); part('audio', SND, 'heartbeat', BEAT);
        }
        if (!LK.rec.demo) ONB.done = true;
      }
      function enterResult() {
        setPhase('result');
        var o = LK.outcome, g = LK.launch || {}, h = heatOf(LK);
        if (!demo) {
          part('hud', HUD, 'result', o.kind, g.grade || null, g.err != null ? Math.round(g.err * 1000) : null,
            { woodwork: o.part || null, held: o.kind === 'saved' ? !!o.held : null, kmh: g.kmh || null, heat: h ? { band: h.band, deg: h.deg } : null });
          part('hud', HUD, 'tracker', tally());
        }
      }
      function toReplay() {
        if (!LK || !LK.outcome || PH === 'replay') return;
        if (LK.rec.demo) { demoNext(); return; }
        var b = LK.buf, a = LK.contactStep - 72, z = LK.outStep + 48, i0 = -1, i1 = -1;
        for (var i = 0; i < b.length; i++) { if (i0 < 0 && b[i].n >= a) i0 = i; if (b[i].n <= z) i1 = i; }
        if (i0 < 0 || i1 <= i0) { enterRetry(); return; }
        RP = { list: b.slice(i0, i1 + 1), tau: 0, last: -1 };
        setPhase('replay');
        root.classList.add('so-scene');
        send('replay', { kick: LK.rec.kick, on: true });
        part('hud', HUD, 'result', null); part('hud', HUD, 'replay', true); part('hud', HUD, 'skip', true);
        part('audio', SND, 'mood', 'replay', { side: TAKER_TEAM });
        camCut(KNOB.cut === 'live' ? 'HERO' : 'REVERSE', { side: diveSide(), wipe: true, replay: true });
      }
      function endReplay() {
        if (PH !== 'replay') return;
        RP = null;
        root.classList.remove('so-scene');
        part('hud', HUD, 'replay', false); part('hud', HUD, 'skip', false);
        send('replay', { kick: LK.rec.kick, on: false });
        enterRetry();
      }
      function enterRetry() {
        setPhase('retry'); RETRY_T = 0;
        root.classList.remove('so-scene');
        camCut('HERO');
        part('audio', SND, 'mood', 'ambient', { side: TAKER_TEAM }); part('audio', SND, 'heartbeat', 0); BEAT = 0;
        if (LK && !LK.finished && !LK.rec.demo && LK.outcome) {
          LK.finished = true;
          send('finish', { kicks: SESS.kicks, goals: SESS.goals });
          var won = LK.outcome.kind === 'goal';
          try { GM.finish({ score: SESS.goals, level: SESS.kicks, won: won, place: won ? 1 : 2, timeMs: Math.round((LK.n - LK.rec.n0) * H * 1000), assisted: assisted }); } catch (e) {}
        }
        part('hud', HUD, 'tracker', tally());
        showRetry();
      }
      // "Kick again": the HUD's own bar (its button, KICK, Enter, A), or the runtime's bar where there is no HUD
      function showRetry() {
        if (USED.hud === 'own') { part('hud', HUD, 'retry', { goals: SESS.goals, kicks: SESS.kicks }); return; }
        showScreen('<h1>Kick again</h1><div class="stats"><div><b>' + SESS.goals + '/' + SESS.kicks + '</b><small>Goals</small></div></div>' +
          '<div class="go">KICK, Enter or tap</div>', function () { nextKick(); }, 'bar');
      }
      function nextKick() { if (state === 'paused' || PH !== 'retry') return; hideScreen(); part('hud', HUD, 'retry', null); walkIn(false); }
      // the scene's Skip (the result, the replay, a retry's settle; and Kick again): the pill, KICK, Enter, B
      function skipScene() {
        if (demo || state === 'paused') return;
        if (PH === 'replay') endReplay();
        else if (PH === 'result') toReplay();
        else if (PH === 'retry') nextKick();
        else if (PH === 'walk' && !FIRST_WALK) enterWhistle();
        else if (PH === 'walk' && PT >= 0.8) skipFirstWalk();
      }
      // the first walk-out cut to its end: the taker on his mark, the whistle next (a cut hides the jump)
      function skipFirstWalk() { if (PH === 'walk' && FIRST_WALK) PT = Math.max(PT, WT.total + 0.11); }
      function diveSide() {
        var ks = LK && LK.ks;
        if (ks && (ks.side === 1 || ks.side === -1)) return ks.side;
        if (LK && LK.plan && (LK.plan.side === 1 || LK.plan.side === -1)) return LK.plan.side;
        var a = LK && LK.rec.aim ? LK.rec.aim : [AIM.x, AIM.y];
        return a[0] < 0 ? -1 : 1;
      }
      function camCut(name, o) {
        o = o || {};
        if (o.side == null) o.side = diveSide();
        o.first = FIRST_WALK;
        part('camera', CAM, 'cut', name, o);
      }
      // the desktop's one line of help (keys or the pad: the mouse only kicks now); none on a touch screen
      function hint() {
        if (demo || isTouch()) { part('hud', HUD, 'hint', null); return; }
        var dev = DEV.last === 'pad' ? 'pad' : 'keys';
        if (PH === 'walk' || PH === 'whistle' || PH === 'set' || (PH === 'runup' && SUB === 'tap')) part('hud', HUD, 'hint', dev);
        else if (PH === 'runup') part('hud', HUD, 'hint', 'stride');
        else part('hud', HUD, 'hint', null);
      }

      // what the kick's steps made, shown: the run-up's start and lock, the taps, pulses, the strike, the woodwork, the
      // outcome
      function present(evs) {
        for (var i = 0; i < evs.length; i++) {
          var e = evs[i];
          if (e.type === 'start') { if (PH === 'set') enterRunup(); }
          else if (e.type === 'tap') { pulse('tap'); part('audio', SND, 'sfx', 'tap', { heat: LK.tk.heat ? LK.tk.heat().H || 0 : 0 }); }
          else if (e.type === 'lock') onLock();
          else if (e.type === 'step') { pulse('step'); part('audio', SND, 'sfx', 'studs', { i: e.i, foot: e.foot, pre: !!e.pre }); }
          else if (e.type === 'plant') { pulse('plant'); part('audio', SND, 'sfx', 'plant'); }
          else if (e.type === 'contact') onContact(e);
          else if (e.type === 'post' || e.type === 'bar') {
            var st = LK.sim.state(), p = st.p, v = st.v;
            if (WOODWORK_IN === null) {
              // (whether it goes in, read from the rebound: the outcome itself comes when it is decided)
              WOODWORK_IN = v[2] < 0 && Math.abs(p[0]) < 3.66 && p[1] < 2.44;
              if (!LK.rec.demo) send('woodwork', { kick: LK.rec.kick, part: e.type, in: WOODWORK_IN });
              part('audio', SND, 'mood', 'gasp', { side: TAKER_TEAM });
            }
            part('audio', SND, 'sfx', 'clank', { part: e.type, speed: e.speed || Math.hypot(v[0], v[1], v[2]) });
            part('camera', CAM, 'kick', 0.5);
          }
          else if (e.type === 'glove' || e.type === 'body') part('audio', SND, 'sfx', 'glove', { part: e.part, speed: e.speed });
          else if (e.type === 'held') part('audio', SND, 'sfx', 'glove', { held: true, part: e.part });
          else if (e.type === 'net') part('audio', SND, 'sfx', 'swish', { speed: e.speed, outside: !!e.outside });
          else if (e.type === 'ground') part('audio', SND, 'sfx', 'bounce', { speed: e.speed });
          else if (e.type === 'outcome') onOutcome(e.outcome);
        }
        if (PH === 'runup' && LK && LK.tko && LK.tko.phase === 'hang') setSub('hang');
      }
      function onContact() {
        IMPS.t = 0; IMPS.n++;
        setPhase('strike');
        part('camera', CAM, 'kick', 1);
        var g = LK.launch || {}, h = heatOf(LK);
        part('audio', SND, 'sfx', 'thud', { power: clamp((g.speed || 22) / 25, 0.4, 1.4), grade: g.grade });
        part('audio', SND, 'duck', 50);
        part('audio', SND, 'sfx', 'whoosh', { speed: g.speed || 22 });
        part('audio', SND, 'heartbeat', 0); BEAT = 0;
        pulse('contact');
        if (!demo) part('hud', HUD, 'flash', g.grade || null, g.err != null ? Math.round(g.err * 1000) : null);
        if (!LK.rec.demo) send('kick', { kick: LK.rec.kick, grade: g.grade || null, errMs: g.err != null ? Math.round(g.err * 1000) : null, kmh: g.kmh || null, band: h ? h.band : null });
      }
      function onOutcome(o) {
        var R = LK.rec, kind = o.kind;
        if (!R.demo) {
          SESS.kicks++; if (kind === 'goal') SESS.goals++; SESS.list.push(kind);
          if (kind === 'goal') send('goal', { kick: R.kick, woodwork: !!o.woodwork, keeperTouched: !!o.keeperTouched });
          else if (kind === 'saved') send('save', { kick: R.kick, held: !!o.held });
          else send('miss', { kick: R.kick, kind: kind === 'miss' ? (o.miss || 'short') : kind });
          part('audio', SND, 'mood', kind === 'goal' ? 'roar' : 'groan', { side: kind === 'goal' ? TAKER_TEAM : 1 - TAKER_TEAM, kind: kind });
          if (kind === 'wide' || kind === 'over') part('audio', SND, 'sfx', 'derision');
        }
        LAST = resultOf(LK); LAST.live = true; LAST.demo = !!R.demo;
        HIST.push(LAST); if (HIST.length > 40) HIST.shift();
      }

      /* ------------------------------------------------------------------------- the screens -- */
      // the runtime's six, reassigned as kart.js does (the page's Play, blur, the pause button and debug.start call them)
      reset = function () {};
      showResults = function () {};
      startDemo = function () {
        hideScreen(); clearSources(); KICKS.log = false; TAPPER = null;
        demo = true; state = 'title'; paused = false; root.classList.add('demo'); root.classList.remove('so-scene');
        part('hud', HUD, 'hint', null); part('hud', HUD, 'replay', false); part('hud', HUD, 'skip', false); part('hud', HUD, 'reticle', null); part('hud', HUD, 'retry', null);
        part('hud', HUD, 'heat', null); part('hud', HUD, 'onboard', null);
        part('audio', SND, 'mood', 'off'); part('audio', SND, 'heartbeat', 0); BEAT = 0;
        demoKick();
      };
      showStart = function () {
        demo = false; root.classList.remove('demo'); root.classList.remove('so-scene');
        state = 'title'; clearSources(); KICKS.log = false; TAPPER = null; paused = false;
        if (LK && !LK.rec.demo && PH !== 'retry') LK = null;
        setPhase('start');
        camCut('HERO');
        part('hud', HUD, 'result', null); part('hud', HUD, 'reticle', null); part('hud', HUD, 'ring', null); part('hud', HUD, 'retry', null); part('hud', HUD, 'replay', false); part('hud', HUD, 'skip', false);
        part('hud', HUD, 'heat', null); part('hud', HUD, 'onboard', null);
        // (the three rows by device: tap-contract §3.5; no names but the game's)
        var touch = isTouch(), pad = DEV.last === 'pad';
        var rows = touch ? ['<b>TAP</b> <kbd>KICK</kbd> to run up: the faster you tap, the harder you hit. Top heat takes a Tetris pro\'s thumbs.',
          '<b>STEER</b> with the stick: the marker stays where you leave it. Over the bar or past a post is a miss.']
          : pad ? ['<b>TAP</b> <kbd>A</kbd> to run up: the faster you tap, the harder you hit. Top heat takes a Tetris pro\'s thumbs.',
            '<b>STEER</b> with the left stick: the marker stays where you leave it. Over the bar or past a post is a miss.']
          : ['<b>TAP</b> <kbd>Space</kbd> to run up: the faster you tap, the harder you hit. Top heat takes a Tetris pro\'s thumbs.',
            '<b>STEER</b> <kbd>&larr;</kbd> <kbd>&rarr;</kbd> <kbd>&uarr;</kbd> <kbd>&darr;</kbd> or WASD: the marker stays where you leave it. Over the bar or past a post is a miss.'];
        rows.push('<b>HOLD</b> the last tap, then <b>RELEASE</b> as the gold ring closes: the plant foot, the sweet spot.' + (touch ? '' : ' <kbd>P</kbd> pauses.'));
        rows.push('Perfect timing is never a sure goal: the keeper reads you, and he dives for real.');
        showScreen('<h1>' + esc(meta.title || 'SHOOTOUT') + '</h1><p>ONE KICK. EVERYTHING ON THE LINE.</p>' +
          '<div class="rules">' + rows.map(function (r) { return '<div>' + r + '</div>'; }).join('') + '</div>' +
          '<div class="go">' + (touch ? 'Tap to start' : 'Enter or tap to start') + '</div>', startCountdown);
      };
      startCountdown = function () {
        if (OW) OW.introSkip = false;
        hideScreen();
        walkIn(!SESS.walked);
        SESS.walked = true;
      };
      togglePause = function () {
        if (state === 'race') {
          if (kickDown() || KICKS.log || PH === 'runup') abortRunup('pause');
          state = 'paused'; paused = true; if (audio) audio.ctx.suspend();
          RESUME = PH; part('hud', HUD, 'phase', 'paused');
          showScreen('<h1>Paused</h1><p>Goals ' + SESS.goals + ' of ' + SESS.kicks + '</p><div class="go">P, Space or tap to carry on</div>', togglePause, 'bar');
        } else if (state === 'paused') {
          hideScreen(); state = 'race'; paused = false; if (audio) audio.ctx.resume();
          part('hud', HUD, 'phase', RESUME || PH); RESUME = null;
          if (PH === 'retry') showRetry();
        }
      };

      /* ------------------------------------------------------------------------ the demo (attract) -- */
      // a kick on its own at the Hero cam, again and again (critique #24): no walk, no replay, no sound, never scored. A
      // seeded scripted player taps it (tap-contract X17): 6 to 11 taps a second from 1.2 s, the last press held (up to
      // 0.1 s before the lock), let go about the plant
      function demoKick() {
        SESS.demo++;
        var seed = kickSeed(SESS.demo, true), r = SIMM.rng((seed ^ 0x5D) >>> 0);
        var side = r.next() < 0.5 ? -1 : 1, aim = [side * (1.6 + 1.5 * r.next()), 0.3 + 1.4 * r.next()];
        var pilot = { start: Math.round(1.2 / H), rate: Math.round((6 + 5 * r.next()) * 100) / 100, stopBefore: Math.round(0.1 * r.next() * 1000) / 1000,
          releaseMs: Math.round(r.gauss() * 40), duty: 0.45 };
        beginKick({ seed: seed, kick: -SESS.demo, demo: true, aim: aim, pilot: pilot });
        FIRST_WALK = false;
        setPhase('set'); LK.rec.setStep = LK.n;
        camCut('HERO');
      }
      function demoNext() { if (demo) demoKick(); }

      /* ---------------------------------------------------------------------------- the input -- */
      // Meme Kart's controls (kart.js 2728-2800; tap-contract §3.1): the stick wherever the left thumb lands steers the
      // aim marker (x1.15, as the kart steers), one big KICK far right where DRIFT sits; keys: the arrows or WASD steer,
      // Space is KICK; a gamepad: the left stick (or the pad) steers, A is KICK. The mouse button over the picture is a
      // KICK too (it aims nothing: the marker stays where you leave it). KICK is down while any of them holds it: each
      // press is a tap, logged with the step it happened at and the step it is applied at; the let-go of the last one is
      // logged the same way. The taker's controller makes the rest of them (the 30 ms floor, the start, the heat, the
      // strike's release). A cancelled touch, a lost capture, a blur, a pause or a lost pad aborts the run-up (#12)
      var DEV = { last: root.classList.contains('touch') ? 'touch' : 'key' };
      var KICKS = { src: {}, n: 0, log: false, dev: null, id: null, presses: 0, releases: 0, ignored: 0, aborts: 0 };
      var AIM = { x: 0, y: 0.9, vx: 0, vy: 0 }, AIMV = { VX: 4.0, VY: 2.6, ACC: 12, DEC: 60 };
      var KEYS = { left: false, right: false, up: false, down: false };
      var KMAP = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down' };
      function isTouch() { return DEV.last === 'touch' || (root.classList.contains('touch') && DEV.last !== 'key' && DEV.last !== 'mouse' && DEV.last !== 'pad'); }
      // the marker steers from the walk until the lock (the stick keeps steering while you tap)
      function aimLive() { return !demo && state === 'race' && (PH === 'walk' || PH === 'whistle' || PH === 'set' || (PH === 'runup' && !!LK && !LK.tk.locked())); }
      function srcKey(dev, id) { return dev === 'touch' ? 'touch:' + (id == null ? 0 : id) : dev; }
      function kickDown() { return KICKS.n > 0; }
      function clearSources() { KICKS.src = {}; KICKS.n = 0; }
      // an edge into the record: [stamp, at, kind], stamps never back across devices, applied no earlier than the next step
      function pushEdge(kind, stamp, st) {
        var R = LK.rec, E = R.edges, prev = E.length ? E[E.length - 1] : null;
        var s = st != null && isFinite(st) ? Math.round(st) : stepOf(stamp);
        s = Math.max(s, R.setStep != null ? R.setStep : R.n0, prev ? prev[0] : 0);
        var at = Math.max(s, LK.n, prev ? prev[1] : 0);
        if (E.length < 2000) E.push([s, at, kind]);
        return s;
      }
      function press(stamp, dev, id, st) {
        if (demo || state === 'paused') return false;
        // (a few more taps after the strike skip nothing before it is seen: the result, the replay, the retry each wait a
        // moment for a press; the replay's clock runs at half speed)
        if (PH === 'result') { if (PT >= 0.6) skipScene(); return false; }
        if (PH === 'replay') { if (PT >= 0.25) skipScene(); return false; }
        if (PH === 'retry') { if (RETRY_T >= 0.4) skipScene(); return false; }
        // (fix-i4, review-i3 D9: the first walk-out skips on a press after 0.8 s; a tap on the whistle ends it and counts)
        if (PH === 'walk') { if (!FIRST_WALK) enterWhistle(); else if (PT >= 0.8) skipFirstWalk(); return false; }
        if (PH === 'whistle' && LK && !LK.rec.demo && !LK.pilot && PT >= 0.2) enterSet();
        if (!LK || LK.rec.demo || LK.pilot || (PH !== 'set' && PH !== 'runup')) return false;
        if (PH === 'runup' && !KICKS.log) return false;
        var k = srcKey(dev, id);
        if (KICKS.src[k]) return false;
        KICKS.src[k] = true; KICKS.n++; KICKS.dev = dev; KICKS.id = id == null ? null : id; KICKS.presses++;
        if (!KICKS.log) {
          // (the first press: the record's device; the window it gives is read at the lock)
          KICKS.log = true; LK.rec.touch = dev === 'touch'; LK.tkOpts.touch = LK.rec.touch;
          if (typeof LK.tk.setTouch === 'function') LK.tk.setTouch(LK.rec.touch);
        }
        pushEdge(1, stamp, st);
        return true;
      }
      // a source let go (only what pressed lets go, once); the last one up is an edge
      function release(stamp, dev, id, st) {
        var k = srcKey(dev, id);
        if (!KICKS.src[k]) { KICKS.ignored++; return false; }
        delete KICKS.src[k]; KICKS.n = Math.max(0, KICKS.n - 1); KICKS.releases++;
        if (KICKS.n > 0 || !KICKS.log || !LK) return false;
        pushEdge(0, stamp, st);
        return true;
      }
      // back to the mark, nothing counted: a fresh kick from this step, the same seed, no edges (the run-up undone)
      function abortRunup(why) {
        var was = kickDown() || KICKS.log; clearSources();
        var live = LK && !LK.rec.demo && !LK.launched && !LK.released && (PH === 'runup' || (PH === 'set' && (KICKS.log || LK.rec.edges.length > 0)));
        KICKS.log = false; TAPPER = null;
        if (!live) return was;
        KICKS.aborts++;
        var R = LK.rec, n = LK.n;
        LK = newKick(newRec({ seed: R.seed, kick: R.kick, demo: R.demo, n0: n, keeper: R.keeper, clip: R.clip, skill: R.skill, cone: R.cone, preT: R.preT, Wfix: R.Wfix, speedFix: R.speedFix, grace: R.grace, join: R.join }));
        LK.rec.setStep = n; LK.abortedBy = why; ACC = 0;
        planTaker(null, LK.meta); handTimeline(LK);
        part('hud', HUD, 'ring', null);
        setPhase('set');
        if (!demo) { BEAT = 72; part('audio', SND, 'heartbeat', BEAT); }
        hint();
        return true;
      }
      // the marker: the aim on a figure of eight that grows with the heat (critique #1: regular, never dice), clamped to
      // the range at the goal line (never to the goal: over the bar or past a post is the player's to miss)
      function liveHeat() { return LK && LK.tk && LK.tk.heat ? LK.tk.heat().H || 0 : 0; }
      function markerAt(ts, h) { var w = wobbleOf(ts, h || 0); return clampAimOf(AIM.x + w[0], AIM.y + w[1]); }
      function markerNow() { return LK && LK.rec.aim && LK.tk.locked() ? LK.rec.aim : markerAt(simNow(), liveHeat()); }
      // what locks at the lock (tap-contract §3.2): where the marker stood at that step, at the locked heat's loop
      function lockedAim(n, tk) { var h = tk && tk.heat ? tk.heat().H || 0 : 0; return markerAt(n * H, h); }
      function nudge(k) { if (k === 'left') AIM.x -= 0.05; else if (k === 'right') AIM.x += 0.05; else if (k === 'up') AIM.y += 0.05; else AIM.y -= 0.05; clampAim(); }
      function clampAim() { var a = clampAimOf(AIM.x, AIM.y); if (a[0] !== AIM.x) AIM.vx = 0; if (a[1] !== AIM.y) AIM.vy = 0; AIM.x = a[0]; AIM.y = a[1]; }
      // rate control with a little acceleration, like steering a kart: the stick (or a key) sets the marker's speed, up to
      // 4 m/s across and 2.6 up; let go and it stops where it is (fix-i4, review-i3 D7: it glided ~0.3 m on at DEC 24;
      // now a let-go stops it dead and easing off or turning back brakes at DEC 60)
      function approach(v, tv, dt) {
        if (tv === 0) return 0;
        var a = v * tv < 0 || Math.abs(tv) < Math.abs(v) ? AIMV.DEC : AIMV.ACC, d = tv - v, s = a * dt;
        return Math.abs(d) <= s ? tv : v + (d > 0 ? s : -s);
      }
      function stepAim(dt) {
        if (!aimLive()) { AIM.vx = AIM.vy = 0; return; }
        var ix = (KEYS.right ? 1 : 0) - (KEYS.left ? 1 : 0), iy = (KEYS.up ? 1 : 0) - (KEYS.down ? 1 : 0);
        if (PAD.on && (PAD.ax || PAD.ay)) { ix = PAD.ax; iy = -PAD.ay; }
        if (TK.on) { ix = clamp(TK.jx * 1.15, -1, 1); iy = clamp(-TK.jy * 1.15, -1, 1); }
        AIM.vx = approach(AIM.vx, ix * AIMV.VX, dt); AIM.vy = approach(AIM.vy, iy * AIMV.VY, dt);
        AIM.x += AIM.vx * dt; AIM.y += AIM.vy * dt;
        clampAim();
      }
      window.addEventListener('keydown', function (e) {
        var k = KMAP[e.code];
        if (demo) { if (k || e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); ensureAudio(); if (!e.repeat) showStart(); } return; }
        if (DEV.last !== 'key') { DEV.last = 'key'; hint(); }
        if (k) { e.preventDefault(); ensureAudio(); if (!KEYS[k]) { KEYS[k] = true; if (aimLive()) nudge(k); } return; }
        if (e.code === 'Space') { e.preventDefault(); ensureAudio(); if (e.repeat) return; if (screen) { screen._go(); return; } press(e.timeStamp, 'key', null); return; }
        if (e.code === 'Enter' || e.code === 'KeyR') { e.preventDefault(); ensureAudio(); if (e.repeat) return; if (screen) { screen._go(); return; } if (e.code === 'Enter' || PH === 'retry') skipScene(); return; }
        if (e.code === 'KeyP' || e.code === 'Escape') { e.preventDefault(); if (!e.repeat && (state === 'race' || state === 'paused')) togglePause(); }
      });
      window.addEventListener('keyup', function (e) {
        var k = KMAP[e.code]; if (k) KEYS[k] = false;
        if (e.code === 'Space') release(e.timeStamp, 'key', null);
      });
      function lose(why) { for (var q in KEYS) KEYS[q] = false; if (kickDown() || KICKS.log || PH === 'runup') abortRunup(why); }
      window.addEventListener('blur', function () { lose('blur'); });
      document.addEventListener('visibilitychange', function () { if (document.hidden) lose('hidden'); });
      // the mouse's button over the picture is KICK (captured, so a drag off the canvas does not let go)
      var CV = renderer.domElement;
      CV.addEventListener('pointerdown', function (e) {
        if (e.pointerType !== 'mouse' || e.button !== 0) return;
        ensureAudio();
        if (demo) { showStart(); return; }
        if (DEV.last !== 'mouse') { DEV.last = 'mouse'; hint(); }
        if (press(e.timeStamp, 'mouse', e.pointerId)) try { CV.setPointerCapture(e.pointerId); } catch (x) {}
      });
      CV.addEventListener('pointerup', function (e) { if (e.pointerType === 'mouse' && e.button === 0) release(e.timeStamp, 'mouse', e.pointerId); });
      CV.addEventListener('pointercancel', function (e) { if (e.pointerType === 'mouse' && KICKS.src.mouse) abortRunup('cancel'); });
      // touch: the kit's floating stick steers (TK, read each frame); one big KICK, far right (RULES.md:61). tbtn gives the
      // button its look (and, in the demo, the tap that brings up the start); the presses are the director's, captured so
      // a thumb drifting off it does not let go (v1.js tbtn lets go on pointerleave and never captures). Every finger
      // down on it is a tap; KICK is up when the last one lifts
      tpad.innerHTML = ''; tpad.classList.remove('rows');
      TK.move = function () { if (TK.on && DEV.last !== 'touch') { DEV.last = 'touch'; hint(); } };
      var KB = tbtn('KICK', 'big', function () {});
      KB.classList.add('so-kick');
      KB.addEventListener('pointerdown', function (e) {
        if (demo) return;
        DEV.last = 'touch';
        if (press(e.timeStamp, 'touch', e.pointerId)) try { KB.setPointerCapture(e.pointerId); } catch (x) {}
      }, true);
      KB.addEventListener('pointerup', function (e) { release(e.timeStamp, 'touch', e.pointerId); }, true);
      KB.addEventListener('pointercancel', function (e) { if (KICKS.src[srcKey('touch', e.pointerId)]) abortRunup('cancel'); }, true);
      KB.addEventListener('lostpointercapture', function (e) { if (KICKS.src[srcKey('touch', e.pointerId)]) abortRunup('lost'); }, true);
      KB.addEventListener('pointerleave', function (e) { if (KICKS.src[srcKey('touch', e.pointerId)]) e.stopImmediatePropagation(); }, true);
      part('hud', HUD, 'kick', KB);
      // a gamepad, read every frame (kart.js pollPad, copied): the left stick or the pad steers, A is KICK, B skips,
      // Start pauses
      var PAD = { on: false, ax: 0, ay: 0, a: false, b: false, start: false };
      function pollPad() {
        var gp = null;
        try { var list = navigator.getGamepads ? navigator.getGamepads() : null; if (list) for (var i = 0; i < list.length; i++) if (list[i] && list[i].connected) { gp = list[i]; break; } } catch (e) { gp = null; }
        if (!gp) { if (PAD.on && KICKS.src.pad) abortRunup('pad'); PAD.on = false; PAD.ax = PAD.ay = 0; PAD.a = PAD.b = PAD.start = false; return; }
        PAD.on = true;
        var b = function (n) { var x = gp.buttons && gp.buttons[n]; return !!x && (x.pressed || x.value > 0.4); };
        var dz = function (v) { v = +v || 0; return Math.abs(v) < 0.15 ? 0 : (v > 0 ? 1 : -1) * Math.pow((Math.abs(v) - 0.15) / 0.85, 1.5); };
        var ax = dz(gp.axes[0]), ay = dz(gp.axes[1]);
        if (b(14)) ax = -1; else if (b(15)) ax = 1;
        if (b(12)) ay = -1; else if (b(13)) ay = 1;
        PAD.ax = ax; PAD.ay = ay;
        if ((ax || ay) && DEV.last !== 'pad') { DEV.last = 'pad'; hint(); }
        var a = b(0), bb = b(1), st = b(9), stamp = typeof gp.timestamp === 'number' && gp.timestamp > 0 ? gp.timestamp : performance.now();
        if (a && !PAD.a) { DEV.last = 'pad'; ensureAudio(); if (demo) showStart(); else if (screen) screen._go(); else press(stamp, 'pad', null); }
        if (!a && PAD.a) release(stamp, 'pad', null);
        if (bb && !PAD.b) { if (demo) showStart(); else skipScene(); }
        if (st && !PAD.start) { if (demo) showStart(); else if (state === 'race' || state === 'paused') togglePause(); }
        PAD.a = a; PAD.b = bb; PAD.start = st;
      }
      // a scripted tapper for the tests (debug.tap(rate, seconds)): KICK pressed at rate for seconds through the same
      // press and release, each stamped as an exact step (as a key's own time stamp is); the last press held, then let go
      // releaseMs off the nominal plant once the run-up has locked (null: held on, the auto strike)
      var TAPPER = null;
      function runTapper() {
        var T = TAPPER;
        if (!T || !LK || LK !== T.K || LK.launched || LK.released) { TAPPER = null; return; }
        var tk = LK.tk, lim = LK.n + 3, locked = tk.locked();
        if (!locked || !T.hold) {
          var lockAt = !locked && tk.started() && tk.predictLock ? LK.n + tk.predictLock(LK.n) : Infinity;
          while (T.i < T.q.length && T.q[T.i][0] <= lim) {
            var q = T.q[T.i];
            // (a let-go due about the lock is not given: the press is held through it, as a player reading HOLD would)
            if (T.hold && !q[1] && q[0] >= lockAt - 2) { T.i = T.q.length; break; }
            T.i++;
            if (q[1]) { if (press(0, T.dev, T.id, q[0])) T.down = true; } else { release(0, T.dev, T.id, q[0]); T.down = false; }
          }
          return;
        }
        // locked: no more taps; KICK held (pressed once if it was up), let go releaseMs off the nominal plant
        T.i = T.q.length;
        if (T.relMs == null || T.done) return;
        if (!T.down) { if (press(0, T.dev, T.id, LK.n)) T.down = true; }
        var nom = tk.nominal ? tk.nominal() : null; if (!nom) return;
        var L = tk.heat ? tk.heat().lockStep : null, tgt = Math.round(nom.plantT / H + T.relMs / 1000 / H);
        if (L != null) tgt = Math.max(tgt, L);
        if (tgt <= lim) { release(0, T.dev, T.id, tgt); T.done = true; TAPPER = null; }
      }
      function startTapper(rate, secs, o) {
        o = o || {};
        if (!LK || (PH !== 'set' && PH !== 'runup')) return null;
        rate = clamp(+rate || 0, 0, 60); secs = clamp(secs == null ? 2 : +secs, 0, 10);
        var duty = clamp(o.duty != null ? +o.duty : 0.45, 0.05, 0.95), n0 = o.at != null ? Math.round(+o.at) : LK.n, q = [], k = 0;
        var hold = o.hold !== false, dev = o.dev || 'key', id = dev === 'touch' ? (o.id != null ? o.id : 77) : null;
        if (!(rate > 0)) q.push([n0, 1]);
        else for (; k / rate <= secs + 1e-9 && k < 600; k++) {
          var s0 = n0 + Math.round(k / rate / H);
          q.push([s0, 1]);
          q.push([s0 + Math.max(1, Math.round(duty / rate / H)), 0]);
        }
        if (hold && q.length > 1 && q[q.length - 1][1] === 0) q.pop();
        TAPPER = { K: LK, q: q, i: 0, hold: hold, relMs: o.releaseMs === undefined ? 0 : o.releaseMs, dev: dev, id: id, done: false, down: false };
        return { start: n0, presses: q.filter(function (x) { return x[1]; }).length, hold: hold, releaseMs: TAPPER.relMs };
      }

      /* -------------------------------------------------------------------------------- the tick -- */
      var REST = { t: 0, phase: 'idle', p: BALL0.slice(), p0: BALL0.slice(), v: [0, 0, 0], w: [0, 0, 0], q: [0, 0, 0, 1], q0: [0, 0, 0, 1], net: { on: false, at: [0, 0, GZ], n: [0, 0, -1], depth: 0, tRel: -1 }, touched: { keeper: false, post: false, bar: false }, outcome: null };
      var PERF = { n: 0, acc: 0, t: 0, worst: 0 };
      function shootTick(dt) {
        pollPad();
        var slow = 1;
        if (state === 'paused') slow = 0;
        else {
          // the strike's stop: the sim held still, then eased back (real time: the camera's shake keeps running)
          if (impFreeze()) {
            IMPS.t += dt;
            var isl = IMPS.t <= IMPS.hold ? 0 : 0.03 + 0.97 * smooth(0, IMPS.ease, IMPS.t - IMPS.hold);
            slow *= isl; IMPS.real += dt; IMPS.game += dt * isl; if (isl === 0) IMPS.held++;
            if (!impFreeze()) onHitstopDone();
          }
          if (PH === 'replay') slow *= 0.5;
          slow *= DBG.slow;
        }
        var sdt = dt * slow;
        t += sdt; PT += sdt;
        if (TAPPER && state !== 'paused') runTapper();
        if (LK && PH !== 'replay' && PH !== 'start' && state !== 'paused') advance(sdt);
        TS.p = performance.now(); TS.t = simNow(); TS.k = timeScale * (slow > 0 ? slow : 1);
        phases(dt, sdt);
        stepAim(dt);
        draw(dt, sdt);
        PERF.n++; PERF.acc += dt; PERF.worst = Math.max(PERF.worst, dt);
        if (KNOB.hud === 'perf' && (PERF.t += dt) > 0.5) {
          // (the HUD's own types: flags as booleans, times in ms as numbers; N1)
          part('hud', HUD, 'perf', { calls: post ? post.calls : renderer.info.render.calls, tris: post ? post.tris : renderer.info.render.triangles, pr: renderer.getPixelRatio(), dpr: renderer.getPixelRatio(),
            msaa: !!(post && post.msaa), bloom: !!(post && post.bloomOn), worst: PERF.worst * 1000, fps: PERF.acc > 0 ? PERF.n / PERF.acc : 0, ms: PERF.n > 0 ? PERF.acc / PERF.n * 1000 : 0,
            heap: performance.memory ? performance.memory.usedJSHeapSize / 1048576 : null });
          PERF.t = 0; PERF.n = 0; PERF.acc = 0; PERF.worst = 0;
        }
      }
      function onHitstopDone() {
        if (PH !== 'strike') return;
        setPhase('flight');
        if (KNOB.cut === 'live') camCut('REVERSE', { side: diveSide() });
      }
      function phases(dt, sdt) {
        if (state === 'paused') return;
        if (LK && LK.broken) { brokenT += dt; if (brokenT > 1) { LK.broken = false; if (demo) demoKick(); else if (LK.outcome) enterRetry(); else { PH = 'retry'; nextKick(); } } return; }
        switch (PH) {
          case 'walk': stepWalk(); break;
          case 'whistle':
            if (FIRST_WALK && PT >= 0.9 && PT - sdt < 0.9) camCut('HERO');
            if (PT >= WH) enterSet();
            break;
          case 'runup': if (LK && LK.tko && LK.tko.phase === 'hang') setSub('hang'); break;
          case 'flight':
            if (LK.outcome && (LK.n * H - LK.launchT) >= 0.35) enterResult();
            else if (!LK.outcome && LK.launched && (LK.n * H - LK.launchT) > 4.5) {
              LK.outcome = { kind: 'miss', t: LK.n * H, miss: 'short', timeout: true }; LK.outStep = LK.n; LK.hashAt = LK.sim.hash();
              onOutcome(LK.outcome); enterResult();
            }
            break;
          case 'result': if (PT >= (LK.outcome && LK.outcome.kind === 'goal' ? 1.6 : 1.8)) toReplay(); break;
          case 'replay':
            if (RP) { RP.tau += sdt; if (RP.tau >= (RP.list.length - 1) * H) endReplay(); }
            break;
          case 'retry': RETRY_T += dt; if (RETRY_T > 25 && !kickDown()) startDemo(); break;
        }
      }

      /* --------------------------------------------------------------------------------- the picture -- */
      // the state to draw: the live kick's (between its last two steps) or, in the replay, the tape's
      var VK = { ks: null, tk: null, sim: null, alpha: 0, cam: null };
      var TKV = { mode: 'kick', c: 0, rate: 0, hang: 0, react: null, t: 0, heat: 0, bounce: 0, bt: 0 };
      function lerpA(a, b, u) { if (!a || !b || a.length !== b.length) return b || a; var r = new Array(b.length); for (var i = 0; i < b.length; i++) r[i] = typeof b[i] === 'number' && typeof a[i] === 'number' ? a[i] + (b[i] - a[i]) * u : b[i]; return r; }
      // (u past 1 runs on from b at the same rate: the live keeper is drawn up to a step past his last state). Every limb
      // chain moves together (B2): the body hangs the arm from KS.shoulders and turns the glove by KS.hands - KS.wrists
      var KS_PTS = ['root', 'look', 'head', 'neck'], KS_CHAINS = ['hands', 'feet', 'shoulders', 'elbows', 'wrists', 'hips', 'knees'], KS_ANG = ['roll', 'pitch', 'yaw'];
      function lerpKS(a, b, u) {
        if (!a || !b) return b || a; if (u === 1) return b; if (u <= 0) return a;
        u = Math.min(u, 2);
        var r = {}; for (var k in b) r[k] = b[k];
        KS_PTS.forEach(function (k) { if (Array.isArray(b[k]) && Array.isArray(a[k])) r[k] = lerpA(a[k], b[k], u); });
        KS_CHAINS.forEach(function (k) { if (Array.isArray(b[k]) && Array.isArray(a[k])) r[k] = b[k].map(function (v, i) { return Array.isArray(v) ? lerpA(a[k][i], v, u) : v; }); });
        KS_ANG.forEach(function (k) { if (typeof b[k] === 'number' && typeof a[k] === 'number') r[k] = a[k] + (b[k] - a[k]) * u; });
        return r;
      }
      function view() {
        if (PH === 'replay' && RP && RP.list.length) {
          var f = RP.tau / H, i = Math.min(RP.list.length - 1, Math.floor(f)), u = f - i, e0 = RP.list[i], e1 = RP.list[Math.min(RP.list.length - 1, i + 1)];
          // (the tape's sounds again, softer and lower)
          for (var j = RP.last + 1; j <= i; j++) { var ev = RP.list[j].ev; if (ev) for (var q = 0; q < ev.length; q++) replaySound(ev[q]); }
          RP.last = i;
          // (each entry: the taker and the keeper at its step's moment, the ball a step on: lerped back by u)
          VK.ks = lerpKS(e0.ks, e1.ks, u); VK.sim = e0.sim || REST; VK.alpha = u; VK.cam = e0.cam;
          if (e0.held && e0.c != null) {
            // (no reaction drawn in the replay: it ends before the follow-through)
            TKV.c = e0.c; TKV.rate = e0.rate; TKV.hang = e0.hang; TKV.react = null; TKV.heat = e0.heat || 0; TKV.bounce = e0.bounce || 0; TKV.bt = e0.bt || 0;
            VK.tk = TKV;
          } else VK.tk = null;
          return VK;
        }
        var K = LK, a = clamp(ACC / H, 0, 1);
        VK.alpha = a; VK.cam = null;
        if (!K) { VK.ks = null; VK.tk = null; VK.sim = REST; return VK; }
        VK.ks = lerpKS(K.ksPrev, K.ks, 1 + a);
        VK.sim = K.launched ? K.sim.state() : REST;
        // (the taker is drawn on the kick's clock from the first tap; before it, at the mark)
        if (K.tko && K.tk.started()) {
          TKV.c = K.tko.c; TKV.rate = K.tko.rate || 0; TKV.hang = K.tko.hang || 0; TKV.heat = liveHeat();
          var bfl = bounceOf(K, simNow()); TKV.bounce = bfl[0]; TKV.bt = bfl[1];
          TKV.react = K.react ? { kind: K.react.kind, t: Math.max(0, simNow() - K.react.t0) } : null;
          VK.tk = TKV;
        } else VK.tk = null;
        return VK;
      }
      function replaySound(e) {
        var o = { replay: true, gain: 0.6, pitch: 0.7 };
        if (e.type === 'contact') part('audio', SND, 'sfx', 'thud', Object.assign({ power: 1 }, o));
        else if (e.type === 'post' || e.type === 'bar') part('audio', SND, 'sfx', 'clank', Object.assign({ part: e.type }, o));
        else if (e.type === 'glove' || e.type === 'body' || e.type === 'held') part('audio', SND, 'sfx', 'glove', o);
        else if (e.type === 'net') part('audio', SND, 'sfx', 'swish', o);
      }
      // what the taker does this frame (shootout-people.js): walk in, the mark, the set (on his toes), the kick
      var TST = { mode: 'set', t: 0, c: 0, rate: 0, hang: 0, react: null, look: null, bounce: 0, bt: 0, heat: 0 };
      function takerState(v) {
        if (v.tk) { TST.mode = 'kick'; TST.c = v.tk.c; TST.rate = v.tk.rate; TST.hang = v.tk.hang; TST.react = v.tk.react; TST.heat = v.tk.heat || 0; TST.t = PT; TST.bounce = v.tk.bounce || 0; TST.bt = v.tk.bt || 0; return TST; }
        TST.c = 0; TST.rate = 0; TST.hang = 0; TST.react = null; TST.heat = 0; TST.bounce = 0; TST.bt = 0;
        if (PH === 'walk' && FIRST_WALK) { TST.mode = 'walk'; TST.t = PT; }
        else if (PH === 'walk') { TST.mode = 'mark'; TST.t = PT; }
        else { TST.mode = 'set'; TST.t = PT; TST.bounce = PH === 'set' || PH === 'runup' ? 1 : 0; }
        return TST;
      }
      function draw(dt, sdt) {
        var v = view();
        // the taker and the referee (shootout-people.js), the keeper (shootout-keeper.js) from the brain's state
        if (PEOPLE) {
          // (the clip time at the last step, run on by alpha steps at its rate inside the kit)
          part('people', PEOPLE.taker, 'apply', takerState(v), v.tk ? v.alpha : 0);
          // (the referee on the kit's own clock: its whistle overlay started by ref.whistle)
          if (PEOPLE) part('people', PEOPLE, 'update', v.alpha, sdt);
        }
        if (!PEOPLE) { standInTaker(v); standInRef(); }
        if (KBODY && v.ks) part('keeper', KBODY, 'apply', v.ks, { t: simNow(), mind: v.ks.mind || null });
        if (!KBODY) standInKeeper(v.ks);
        // the ball, the frame and the net
        part('goal', GOAL, 'update', v.sim || REST, sdt, v.alpha);
        // the floodlights' soft shadows, set after everyone is posed (critique #26)
        stepBlobs();
        // the camera (shootout-camera.js), on real time: the shake keeps going through the stop
        part('camera', CAM, 'update', dt, camLook(v));
        lensHide();
        // the HUD
        drawHud(v, dt);
        PULSE = null;
        // the sound: the crowd's whistling at the taker rises with the heat (frozen at the lock), the heart with it
        drawSound();
        part('audio', SND, 'step', dt);
        // the world's own update, as kart.js:5318 calls it (a world whose update throws loses it, said once)
        if (typeof def.update === 'function') try { def.update(ctx, t, sdt); } catch (e) { fail('update() threw: ' + (e && e.message || e)); def.update = null; }
        // the tape keeps the camera of each step it drew
        if (LK && PH !== 'replay' && LK.buf.length) { var last = LK.buf[LK.buf.length - 1]; if (!last.cam) last.cam = [camera.position.x, camera.position.y, camera.position.z, camera.quaternion.x, camera.quaternion.y, camera.quaternion.z, camera.quaternion.w, camera.fov]; }
      }
      // what the camera looks at
      var LOOK = { phase: '', taker: [0, 1.25, -39], keeper: [0, 1.55, GZ + 0.15], ball: BALL0.slice(), ballV: [0, 0, 0], runup: 0, heat: 0, flight: false, result: false, replay: false, side: 1, first: false, stage: '', aim: [0, 1, GZ], portrait: false, demo: false, cam: null, mark: MARK.slice() };
      // (the run-up's progress from the jog's first step to the contact, on the clip's own clock; X14)
      function runupU(c, K) { var tk = K && K.tk, c0 = tk && tk.c0 != null ? tk.c0 : K.meta.start, sp = K.meta.contact - c0; return sp > 0 ? clamp((c - c0) / sp, 0, 1) : 0; }
      function camLook(v) {
        takerAt(TV);
        LOOK.phase = PH; LOOK.sub = SUB; LOOK.first = FIRST_WALK; LOOK.stage = WSTAGE; LOOK.demo = demo; LOOK.t = PT;
        LOOK.taker[0] = TV.x; LOOK.taker[1] = TV.y + 0.3; LOOK.taker[2] = TV.z;
        LOOK.mark[0] = MARK[0]; LOOK.mark[1] = MARK[1];
        var ks = v.ks;
        if (ks && Array.isArray(ks.head)) { LOOK.keeper[0] = ks.head[0]; LOOK.keeper[1] = ks.head[1]; LOOK.keeper[2] = ks.head[2]; }
        else if (ks && Array.isArray(ks.root)) { LOOK.keeper[0] = ks.root[0]; LOOK.keeper[1] = ks.root[1] + 0.68; LOOK.keeper[2] = ks.root[2]; }
        var s = v.sim || REST, p0 = s.p0 || s.p, u = v.alpha || 0;
        LOOK.ball[0] = p0[0] + (s.p[0] - p0[0]) * u; LOOK.ball[1] = p0[1] + (s.p[1] - p0[1]) * u; LOOK.ball[2] = p0[2] + (s.p[2] - p0[2]) * u; LOOK.ballV = s.v || LOOK.ballV;
        var tk = v.tk;
        LOOK.runup = tk && LK ? runupU(tk.c, LK) : (PH === 'strike' || PH === 'flight' || PH === 'result' ? 1 : 0);
        LOOK.heat = PH === 'replay' ? (tk ? tk.heat || 0 : 0) : liveHeat();
        LOOK.flight = PH === 'flight' || PH === 'result'; LOOK.result = PH === 'result'; LOOK.replay = PH === 'replay'; LOOK.side = diveSide();
        // (the live marker until the lock, then the locked aim)
        var m = LK ? markerNow() : [AIM.x, AIM.y];
        LOOK.aim = [m[0], m[1], GZ];
        LOOK.portrait = camera.aspect < 1; LOOK.cam = v.cam || null;
        return LOOK;
      }
      // a person the camera stands inside is not drawn for that moment (v1.js:5655; the people kit's own where it is)
      function lensHide() {
        if (PEOPLE && PEOPLE.lens) { part('people', PEOPLE, 'lens', [PEOPLE.taker && PEOPLE.taker.rig, PEOPLE.ref && PEOPLE.ref.rig, KRIG], camera.position); if (PEOPLE) return; }
        for (var i = 0; i < HUMANS.length; i++) {
          var e = HUMANS[i]; if (!e || !e.object) continue;
          var o = e.object.position, dx = camera.position.x - o.x, dz = camera.position.z - o.z, dy = camera.position.y - (o.y + 0.9);
          var inside = dx * dx + dz * dz < 0.5 * 0.5 && Math.abs(dy) < 1.1;
          if (inside !== !!e.camHidden) { e.camHidden = inside; e.object.visible = !inside; }
        }
      }
      function stepBlobs() {
        if (!BLOBS) return;
        var i = 0;
        if (PEOPLE && PEOPLE.shadows) i = part('people', PEOPLE, 'shadows', BLOBS, FLOODS, 0) || 0;
        if (KRIG && PK && PK.shadowOf) { try { PK.shadowOf(BLOBS, i, KRIG, FLOODS); i += FLOODS.length; } catch (e) { modFail('keeper shadows', e); KRIG = null; } }
        for (; i < NBLOB; i++) part('blobs', BLOBS, 'hide', i);
        part('blobs', BLOBS, 'update');
      }
      // the heat as the gauge shows it (tap-contract §5): live until the lock, then frozen there, with its tick
      function heatView() {
        var h = LK && LK.tk && LK.tk.heat ? LK.tk.heat() : null;
        if (!h) return { H: 0, band: 'COLD', deg: 0, locked: false, lockDeg: null };
        var d = h.deg != null ? h.deg : degOf(h.H);
        return { H: h.H || 0, band: h.band || bandOf(h.H || 0), deg: d, locked: !!h.locked, lockDeg: h.locked ? d : null };
      }
      // KICK's face (tap-contract §5): TAP in set and while tapping, HOLD in the last stride before the sweet spot,
      // RELEASE in it (gold), RELEASE late in the hang (coral), KICK dimmed from the strike, AGAIN at the retry
      var KST = { label: 'TAP', tone: null, lockIn: null };
      function kickState() {
        var tk = LK && LK.tk, lbl = 'TAP', tone = null, lockIn = null;
        if (PH === 'retry') lbl = 'AGAIN';
        else if (PH === 'runup' && tk && tk.locked()) {
          var nom = tk.nominal ? tk.nominal() : null, pw = tk.power ? tk.power() : null, now = simNow();
          if (LK.released) { lbl = 'KICK'; }
          else if (nom && pw && now < nom.plantT - pw.W / 2) lbl = 'HOLD';
          else if (nom && pw && now <= nom.plantT + pw.W / 2) { lbl = 'RELEASE'; tone = 'gold'; }
          else { lbl = 'RELEASE'; tone = 'coral'; }
        }
        else if (PH === 'runup' && tk && tk.predictLock) { lockIn = Math.max(0, ((tk.predictLock(LK.n) || 0) + 1) * H - ACC); }
        else if (PH === 'strike' || PH === 'flight' || PH === 'result' || PH === 'replay') lbl = 'KICK';
        KST.label = lbl; KST.tone = tone; KST.lockIn = lockIn;
        return KST;
      }
      // the HUD each frame: the gauge, KICK's face, the reticle on its loop (red off the frame), the run-up's ring with the
      // HOLD arc and the sweet spot (narrower as it heats), the first kick's line, then its own update (real time)
      function drawHud(v, dt) {
        if (!demo) {
          var live = state === 'race' || state === 'paused';
          // the reticle (not from behind the net, the KEEPER cutaway: the goal plane is 5 m in front of that lens)
          var aiming = (PH === 'walk' || PH === 'whistle' || PH === 'set') && live && !(FIRST_WALK && PH === 'walk' && WSTAGE === 'back');
          if ((aiming || PH === 'runup') && LK) {
            var tk = LK.tk, locked = tk.locked() && !!LK.rec.aim, m = locked ? LK.rec.aim : markerNow(), info = aimInfoOf(m[0], m[1]);
            var A = locked ? null : TC.WOB_A * (TC.WOB_K[0] + TC.WOB_K[1] * liveHeat());
            part('hud', HUD, 'reticle', [m[0], m[1], GZ], locked ? null : { aim: [AIM.x, AIM.y], A: A, z: GZ }, locked, info);
          } else part('hud', HUD, 'reticle', null);
          // the thermometer: from set to the result
          var gauge = live && LK && (PH === 'set' || PH === 'runup' || PH === 'strike' || PH === 'flight' || PH === 'result');
          part('hud', HUD, 'heat', gauge ? heatView() : null);
          // KICK's face (its small line is the HUD's own: the band while tapping, the plant in the stride)
          if (live) part('hud', HUD, 'kickState', kickState());
          // the ring: the run-up from the jog's first step (u), the sweet spot about the plant at the clock's rate there
          if ((PH === 'runup' || PH === 'strike') && LK && LK.tk.started() && LK.tko) {
            var K = LK, T = K.tk, c0 = T.c0, sp = Math.max(0.2, K.meta.contact - c0), lk = T.locked();
            var cj = T.cJ != null ? T.cJ : (T.pre && T.pre.cJ != null ? T.pre.cJ : K.meta.plant - 0.55), pl = K.meta.plant;
            var s = lk && T.nominal && T.nominal() ? T.nominal().s : TC.S_MIN + (TC.S_MAX - TC.S_MIN) * liveHeat();
            var W = lk && T.power && T.power() ? T.power().W : T.windowNow ? T.windowNow() : TC.W_COLD;
            var cNow = PH === 'strike' ? K.meta.contact : K.tko.c + (ACC || 0) * (K.tko.rate || 0);
            var mk = null;
            if (K.relStep != null && T.nominal && T.nominal()) { var nm = T.nominal(); mk = clamp((Math.min(pl, pl - (nm.plantT - K.relStep * H) * nm.s) - c0) / sp, 0, 1); }
            // (fix-i4, D6: the approach ring's u, 1 at the lock to 0 on the plant, on the sim's own clock)
            var apU = null;
            if (lk && !K.released && T.nominal && T.nominal()) { var nm3 = T.nominal(); apU = (nm3.plantT - simNow()) / Math.max(0.05, nm3.plantT - nm3.lockT); }
            part('hud', HUD, 'ring', clamp((cNow - c0) / sp, 0, 1), [clamp((pl - c0 - W / 2 * s) / sp, 0, 1), clamp((pl - c0 + W / 2 * s) / sp, 0, 1)],
              PULSE, mk, { hold: [clamp((cj - c0) / sp, 0, 1), clamp((pl - c0) / sp, 0, 1)], approach: apU });
          } else if (PH !== 'flight' && PH !== 'result') part('hud', HUD, 'ring', null);
          // the first kick's line, from set to the lock
          var onb = !ONB.done && SESS.kicks === 0 && LK && !LK.rec.demo && (PH === 'set' || (PH === 'runup' && !LK.tk.locked()));
          part('hud', HUD, 'onboard', onb ? 'TAP to run up · steer to aim · RELEASE as the gold ring closes' : null);
        }
        part('hud', HUD, 'update', dt);
      }
      // the sound each frame: the heat under the crowd from set to the strike (silent in the demo, by part()), the heart
      // with it while tapping
      function drawSound() {
        if (demo || !LK) return;
        if (PH === 'set' || PH === 'runup' || PH === 'strike') {
          var h = heatView();
          part('audio', SND, 'heat', h.H, { locked: h.locked });
          if (PH === 'runup' && !h.locked) { var b = Math.round(72 + 40 * h.H); if (b !== BEAT) { BEAT = b; part('audio', SND, 'heartbeat', b); } }
        }
      }

      /* --------------------------------------------------------------------------------- stand-ins -- */
      // plain versions of the parts, the same shape, for whichever is not there: enough for the flow to run and be seen
      function standInSim() {
        function rng(seed) {
          var r = mulberry(seed >>> 0), spare = null;
          return { next: r, gauss: function () { if (spare !== null) { var s = spare; spare = null; return s; } var u = Math.max(1e-12, r()), w = r(), m = Math.sqrt(-2 * Math.log(u)); spare = m * Math.sin(2 * Math.PI * w); return m * Math.cos(2 * Math.PI * w); } };
        }
        function gradeOf(err, q) { return q <= 0.35 ? 'perfect' : q <= 1 ? 'good' : q <= 3 ? (err < 0 ? 'early' : 'late') : (err < 0 ? 'scuffed' : 'leaned'); }
        return { standIn: true, C: { R: BALL_R, GZ: GZ, H: H }, rng: rng, spinFor: function () { return [0, 0, 0]; }, create: function (o) {
          var cr = rng(((o && o.seed) ^ 0xC3) >>> 0);
          var S = { t: 0, phase: 'idle', p: BALL0.slice(), v: [0, 0, 0], w: [0, 0, 0], q: [0, 0, 0, 1], net: { on: false, at: [0, 0, GZ], n: [0, 0, -1], depth: 0, tRel: -1 }, touched: { keeper: false, post: false, bar: false }, outcome: null };
          var hsh = 2166136261, T0 = 0, crossed = false;
          function mix(v) { var x = Math.round(v * 1e6) | 0; hsh ^= x; hsh = Math.imul(hsh, 16777619) >>> 0; }
          function copy() { return { t: S.t, phase: S.phase, p: S.p.slice(), p0: (S.p0 || S.p).slice(), q0: [0, 0, 0, 1], v: S.v.slice(), w: S.w.slice(), q: S.q.slice(), net: { on: S.net.on, at: S.net.at.slice(), n: S.net.n.slice(), depth: S.net.depth, tRel: S.net.tRel }, touched: { keeper: false, post: false, bar: false }, outcome: S.outcome ? JSON.parse(JSON.stringify(S.outcome)) : null }; }
          var api = {
            cone: function (c, r) {
              r = r || cr;
              var q = Math.abs(c.err) / (c.W / 2), sg = (q <= 1 ? 0.5 + q * q : 1.5 + 2.5 * Math.min(1, (q - 1) / 2)), early = c.err < 0, qq = Math.min(q, 3);
              var a = r.gauss(), b = r.gauss(), bias = (early ? -0.6 : 1.0) * qq;
              if (c.sigma != null && isFinite(+c.sigma)) { sg = Math.max(0, +c.sigma); if (sg === 0) bias = 0; }
              return { dYaw: a * sg * Math.PI / 180, dPitch: (b * sg + bias) * Math.PI / 180, speedK: 1 - (early ? 0.06 : 0.03) * qq, sigma: sg, bias: bias, q: q, grade: gradeOf(c.err, q) };
            },
            aim: function (a) {
              var f = a.from || BALL0, k = a.cone || {}, sp = (a.speed || 22) * (k.speedK || 1), dx = a.target[0] - f[0], dz = GZ - f[2], dy = a.target[1] - f[1], dh = Math.hypot(dx, dz), T = dh / sp, vy = (dy + 0.5 * 9.81 * T * T) / T;
              var yaw = Math.atan2(dx, dz) + (k.dYaw || 0), el = Math.atan2(vy, dh / T) + (k.dPitch || 0), vv = Math.hypot(dh / T, vy);
              return { p: f.slice(), v: [Math.sin(yaw) * Math.cos(el) * vv, Math.sin(el) * vv, Math.cos(yaw) * Math.cos(el) * vv], w: [0, 0, 0], t: a.t, speed: sp, solve: { miss: 0, iters: 1 } };
            },
            launch: function (L) { S.p = L.p.slice(); S.v = L.v.slice(); S.w = (L.w || [0, 0, 0]).slice(); S.phase = 'flight'; T0 = L.t || 0; S.t = T0; return api; },
            step: function (h) {
              var ev = [];
              S.p0 = S.p.slice();
              if (S.phase === 'idle') { S.t += h; return ev; }
              S.t += h;
              if (S.phase === 'net') { S.v[0] *= 0.9; S.v[2] *= 0.9; }
              S.v[1] -= 9.81 * h;
              for (var k = 0; k < 3; k++) S.p[k] += S.v[k] * h;
              if (S.p[1] < BALL_R) { S.p[1] = BALL_R; if (S.v[1] < -0.5) { S.v[1] = -S.v[1] * 0.62; ev.push({ type: 'ground', t: S.t, at: S.p.slice() }); } else S.v[1] = 0; S.v[0] *= 0.995; S.v[2] *= 0.995; }
              if (S.phase === 'flight' && !crossed && S.p[2] < GZ - 0.17) {
                crossed = true;
                var inMouth = Math.abs(S.p[0]) < 3.66 && S.p[1] < 2.44, kind = inMouth ? 'goal' : S.p[1] >= 2.44 ? 'over' : 'wide';
                S.outcome = { kind: kind, t: S.t, at: S.p.slice(), woodwork: false, part: null, keeperTouched: false, held: false, miss: inMouth ? null : kind };
                ev.push({ type: inMouth ? 'goal' : 'out', t: S.t, at: S.p.slice() });
                if (inMouth) { S.phase = 'net'; S.net.on = true; S.net.at = S.p.slice(); }
              }
              if (S.phase === 'net' && S.p[2] < GZ - 1.3) { S.p[2] = GZ - 1.3; S.v[2] = Math.abs(S.v[2]) * 0.08; S.net.depth = 0.3; ev.push({ type: 'net', t: S.t, at: S.p.slice(), speed: 3 }); }
              if (!S.outcome && S.t - T0 > 3) S.outcome = { kind: 'miss', t: S.t, at: S.p.slice(), woodwork: false, part: null, keeperTouched: false, held: false, miss: 'short' };
              if (!crossed || S.outcome) S.p.forEach(mix);
              return ev;
            },
            state: copy,
            snapshot: function () { return JSON.parse(JSON.stringify({ S: S, h: hsh, T0: T0, crossed: crossed })); },
            restore: function (s) { S = s.S; hsh = s.h; T0 = s.T0; crossed = s.crossed; return api; },
            trace: function () { return new Float32Array(0); },
            hash: function () { return ('00000000' + hsh.toString(16)).slice(-8); },
          };
          return api;
        } };
      }
      // the taker's controller and the keeper, plainly, in the brain's shape. The controller is the tap contract's v2
      // (tap-contract §2.2-2.9, as ref-model.mjs checks it): every input an integer sim step; the heat from the taps (a
      // press under 30 ms after the last is nothing; a leaky rate, exponentially harder at the top); the run-up's clock at
      // s(H) from the jog's first step to the last stride's touchdown (the lock, where the heat, the window and the speed
      // freeze), then analytic in (lock, release, n), so a late-read release lands exactly
      function standInBrain() {
        function taker(meta, opts) {
          var o = opts || {}, K = meta && meta.plant > 0 ? meta : STANDIN_KICK;
          var plant = +K.plant, contact = +K.contact, PC = contact - plant;
          var sts = Array.isArray(K.steps) && K.steps.length >= 2 ? K.steps : STANDIN_KICK.steps;
          var cJ = +sts[sts.length - 2][1], footJ = sts[sts.length - 2][0] === 'L' ? 'L' : 'R';
          if (!(cJ < plant - 0.05)) cJ = Math.max(0, plant - 0.55);
          var preT = o.preT > 0 ? +o.preT : TC.PRE_T, c0 = cJ - preT, dec = Math.exp(-H / TC.RATE_TAU), riseK = 1 - Math.exp(-H / TC.RISE), D1 = preT - TC.PRE_ACC / 2;
          // the jog's timeline (§2.3): its speed ramps up over the first PRE_ACC, then cruises; its footfalls step back from cJ
          var pre = { c0: c0, cJ: cJ, T: preT, TACC: TC.PRE_ACC, STEP: TC.PRE_STEP, footJ: footJ, steps: [],
            frac: function (c) { var u = clamp(c - c0, 0, preT); return D1 > 0 ? (u < TC.PRE_ACC ? u * u / (2 * TC.PRE_ACC) : u - TC.PRE_ACC / 2) / D1 : 1; },
            speedK: function (c) { return Math.min(1, clamp(c - c0, 0, preT) / TC.PRE_ACC); } };
          (function () { var f = footJ, c = cJ - TC.PRE_STEP; for (var k = 0; k < 48 && c >= c0 + TC.PRE_FIRST - 1e-9; k++) { f = f === 'R' ? 'L' : 'R'; pre.steps.unshift([f, c]); c -= TC.PRE_STEP; } })();
          // every footfall: the jog's, then the clip's own stance downs from the lock to the plant
          var downs = pre.steps.map(function (s) { return [s[0], s[1], true]; });
          (Array.isArray(K.stance) ? K.stance : []).forEach(function (s) { if (+s[1] >= cJ - 1e-6 && +s[1] <= plant + 1e-6) downs.push([s[0], +s[1], false]); });
          downs.sort(function (a, b) { return a[1] - b[1]; });
          var start, lastRaw, r, Hh, Hs, c, L, cL, HL, sL, w, tP, nA, rel, auto, q, cnt, lastC, lastN, contactDone, down, downSince;
          function fresh() { lastN = null; start = null; lastRaw = null; r = 0; Hh = 0; Hs = 0; c = c0; L = null; cL = null; HL = 0; sL = TC.S_MIN; w = 1; tP = null; nA = null; rel = null; auto = false; q = []; cnt = { presses: 0, accepted: 0, ignored: 0, mashed: 0 }; lastC = c0; contactDone = false; down = false; downSince = null; }
          fresh();
          function sOf(h) { return TC.S_MIN + (TC.S_MAX - TC.S_MIN) * h; }
          // ONE window (B1): the heat's (live before the lock, the locked one after), final when fixed
          function Wn() { return o.Wfix > 0 ? +o.Wfix : Math.max(TC.W_FLOOR, (TC.W_COLD - (TC.W_COLD - TC.W_HOT) * Hh) * (o.touch ? TC.TOUCH_K : 1)); }
          function aOf(h) { return 1 + (TC.AFTER - 1) * Math.min(1, Math.max(0, h) / TC.AFTER_RAMP); }
          function cLine(m) { return Math.min(plant, cL + (m - L) * H * sL); }
          function relAt(m) { return rel != null && rel <= m ? rel : rel == null && L != null && m >= nA ? nA : null; }
          function contactT(rr) { var cr = cLine(rr); return cr < plant ? rr * H + (plant - cr) / (TC.RHO * sL) + PC / w : rr * H + PC / (w * aOf(rr * H - tP)); }
          function nCof(rr) { return Math.ceil(contactT(rr) / H - 1e-7); }
          // the clock after the lock at step m (§2.6)
          function after(m) {
            var rr = relAt(m);
            if (rr == null) { var cl = cL + (m - L) * H * sL; return cl < plant ? { c: cl, rate: sL, hang: 0, phase: 'stride' } : { c: plant, rate: 0, hang: m * H - tP, phase: 'hang' }; }
            var nC = nCof(rr);
            if (m >= nC) return { c: contact + (m - nC) * H * w, rate: w, hang: 0, phase: m === nC ? 'contact' : 'after' };
            var cr = cLine(rr), tm = m * H;
            if (cr < plant) { var rho = TC.RHO * sL, tP2 = rr * H + (plant - cr) / rho; return tm <= tP2 ? { c: cr + (tm - rr * H) * rho, rate: rho, hang: 0, phase: 'stride' } : { c: plant + (tm - tP2) * w, rate: w, hang: 0, phase: 'strike' }; }
            var a = aOf(rr * H - tP);
            return { c: Math.min(contact, plant + (m - rr) * H * w * a), rate: w * a, hang: 0, phase: 'strike' };
          }
          var TK = {
            meta: K, c0: c0, cJ: cJ, pre: pre, standIn: true,
            input: function (kind, stamp) { q.push([kind === 'press' ? 1 : 0, Math.round(+stamp || 0)]); },
            setTouch: function (b) { o.touch = !!b; },
            step: function (n) {
              var ev = [], taps = [], rels = [], qq = q, i; q = [];
              // 1. the rate leaks; 2. the presses (the floor against the previous press, accepted or not: D4); 3. the heat
              if (start != null && L == null) r *= dec;
              for (i = 0; i < qq.length; i++) {
                var p = qq[i][1];
                if (!qq[i][0]) { rels.push([p, downSince]); down = false; downSince = null; continue; }
                cnt.presses++;
                if (!down) { down = true; downSince = p; }
                if (L != null) { cnt.mashed++; taps.push({ type: 'mash', n: p }); continue; }
                var ok = lastRaw == null || (p - lastRaw) * H >= TC.TAP_FLOOR - 1e-9; lastRaw = p;
                if (!ok) { cnt.ignored++; taps.push({ type: 'ignored', n: p }); continue; }
                cnt.accepted++; r += 1 / TC.RATE_TAU; taps.push({ type: 'tap', n: p });
                if (start == null) { start = n; c = c0; ev.push({ type: 'start' }); }
              }
              for (i = 0; i < taps.length; i++) ev.push(taps[i]);
              if (start != null && L == null) {
                Hs = 1 - Math.exp(-Math.pow(Math.max(0, r) / TC.HEAT_K, TC.HEAT_P));
                // (KICK held in the HOLD lead-in keeps its heat: fix-i4 D5, as the brain)
                var holdIn = down && (cJ - c) / Math.max(1e-6, sOf(Hh)) <= TC.HOLD_LEAD + 1e-9;
                Hh = Hs > Hh ? Hh + (Hs - Hh) * riseK : holdIn ? Hh : Math.max(Hs, Hh - TC.COOL * H);
                // 4. the clock, and the lock at the last stride's touchdown
                if (n > start) c += H * sOf(Hh);
                if (c >= cJ) { L = n; cL = c; HL = Hh; sL = sOf(HL); w = Math.max(TC.SWING_MIN, sL); tP = L * H + (plant - cL) / sL; nA = Math.ceil((tP + TC.HANG_CAP) / H - 1e-9); ev.push({ type: 'lock', n: n }); }
              }
              // the strike's release: the first let-go stamped at or after the lock; else the auto strike at plant + 0.28 s
              if (L != null && rel == null) {
                for (i = 0; i < rels.length; i++) {
                  var pr = rels[i][0];
                  if (pr < L) continue;
                  if (o.relGrace > 0 && rels[i][1] != null && rels[i][1] < L && pr < L + o.relGrace / H) continue;
                  rel = pr; ev.push({ type: 'release', n: rel }); break;
                }
                if (rel == null && n >= nA) { rel = nA; auto = true; ev.push({ type: 'auto', n: nA }); }
              }
              var cl = L == null ? { c: c, rate: start == null ? 0 : sOf(Hh), hang: 0, phase: start == null ? 'set' : 'tap' } : after(n);
              if (start != null) {
                for (i = 0; i < downs.length; i++) if (downs[i][1] > lastC + 1e-9 && downs[i][1] <= cl.c + 1e-9) ev.push({ type: 'step', i: i, foot: downs[i][0], pre: downs[i][2], plant: Math.abs(downs[i][1] - plant) < 1e-6 });
                if (plant > lastC + 1e-9 && plant <= cl.c + 1e-9) ev.push({ type: 'plant' });
                var rr = L != null ? relAt(n) : null;
                if (rr != null && !contactDone) { var nC = nCof(rr); if (nC <= n) { contactDone = true; ev.push({ type: 'contact', n: nC, late: n - nC }); } }
                lastC = cl.c;
              }
              lastN = n; cl.heat = TK.heat(); cl.events = ev;
              return cl;
            },
            started: function () { return start != null; }, locked: function () { return L != null; }, released: function () { return rel != null; },
            abort: function () { fresh(); },
            heat: function () { return { H: Hh, Hs: Hs, r: r, band: bandOf(Hh), deg: degOf(Hh), locked: L != null, lockStep: L }; },
            power: function () {
              if (L == null) return null;
              var sp = o.speedFix > 0 ? +o.speedFix : TC.V0 + TC.VH * HL + (HL >= TC.BANDS[2] ? TC.V_FIRE : 0);
              return { H: HL, band: bandOf(HL), deg: degOf(HL), s: sL, W: Wn(), speed: sp, kmh: Math.round(sp * 3.6), coneK: 1 + TC.CONE_K * HL * HL * HL, wobA: TC.WOB_A * (TC.WOB_K[0] + TC.WOB_K[1] * HL) };
            },
            windowNow: Wn,
            grade: function () {
              if (rel == null) return null;
              var Wl = Wn(), e = rel * H - tP, qv = Math.abs(e) / (Wl / 2);
              var g = auto ? 'scuffed' : qv <= TC.PERFECT ? 'perfect' : qv <= 1 ? 'good' : qv <= 3 ? (e < 0 ? 'early' : 'late') : (e < 0 ? 'scuffed' : 'leaned');
              return { err: e, errMs: Math.round(e * 1000), W: Wl, q: qv, grade: g, auto: auto, H: HL, band: bandOf(HL) };
            },
            predictContact: function (n) {
              if (L == null) { var s = sOf(Hh); return (n != null ? n : 0) * H + (plant - c) / s + PC / Math.max(1, s); }
              var sn = TK.seen((n != null ? n : L) * H); return sn ? sn.contact : null;
            },
            // (the steps from n to the lock at the live rate: 0 when it comes at n, or once locked)
            predictLock: function (n) {
              if (L != null) return 0;
              var s1 = sOf(Hh), last = start != null && lastN != null ? lastN : (n != null ? n - 1 : 0), mL = last + Math.max(1, Math.ceil((cJ - c) / (s1 * H) - 1e-9));
              return Math.max(0, mL - (n != null ? n : last + 1));
            },
            nominal: function () { return L == null ? null : { lockStep: L, plantT: tP, contactT: tP + PC / w, s: sL, W: Wn() }; },
            seen: function (ts) {
              var m = Math.floor(ts / H + 1e-6);
              if (L == null) return { contact: TK.predictContact(m), locked: false, hang: false, released: false };
              var rr = relAt(m);
              if (rr != null) return { contact: nCof(rr) * H, hang: false, released: true };
              if (cLine(m) < plant) return { contact: tP + PC / w, hang: false, released: false };
              return { contact: m * H + PC / (w * aOf(m * H - tP)), hang: true, released: false };
            },
            steps: function () { return { start: start, lock: L, release: rel, auto: auto, presses: cnt.presses, accepted: cnt.accepted, ignored: cnt.ignored, mashed: cnt.mashed }; },
            clip: function (n) { return L != null && n >= L ? after(n) : { c: lastC, rate: start == null ? 0 : sOf(Hh), hang: 0, phase: start == null ? 'set' : 'tap' }; },
            tells: function (aimX) { var sx = clamp((aimX || 0) / 3.66, -1, 1), nat = K.foot === 'L' ? 1 : -1; return { aimSide: sx, plantYaw: 0.8 * sx * 20 * Math.PI / 180, hipYaw: sx * 10 * Math.PI / 180, shoulderYaw: sx * 10 * Math.PI / 180, stride: 1 + 0.08 * sx * nat, lastStride: K.lastStride || null, from: cJ, to: plant }; },
            yawAt: function () { return 0; }, aim: function () {},
          };
          return TK;
        }
        function keeper(o) {
          var x0 = ((o.seed >>> 0) % 1000 / 1000 - 0.5) * 0.12, z0 = GZ + 0.15, P = null, tk = null, push = null, last = null;
          return {
            track: function (k) { tk = k; },
            decide: function (q) {
              var f = q.force || {}, r = mulberry((o.seed ^ 0xB2) >>> 0), aimSide = q.aim[0] >= 0 ? 1 : -1;
              var stay = f.stay != null ? !!f.stay : r() < 0.08, delta = f.delta != null ? +f.delta : 0.06 + 0.16 * r();
              var side = f.side === 1 || f.side === -1 ? f.side : (r() < 0.6 ? aimSide : -aimSide);
              P = { side: stay ? 0 : side, stay: stay, delta: delta, x: side * 2.2 };
              return P;
            },
            contact: function () {}, result: function () {},
            state: function (tt) {
              last = tt;
              var root = [x0, 0.88, z0], roll = 0, ph = 'ready', u = 0;
              if (P && push == null && tk) { var ct = tk.predictContact(Math.floor(tt / H + 1e-6)); if (ct != null && tt >= ct - P.delta + 0.12) push = tt; }
              if (P && !P.stay && push != null) {
                u = clamp((tt - push) / 0.55, 0, 1); ph = u < 1 ? 'flight' : 'down';
                root = [x0 + (P.x - x0) * u, 0.88 + Math.sin(u * Math.PI) * 0.35 - 0.6 * u, z0 + 0.3 * u];
                roll = u * 1.4;
              }
              return { t: tt, phase: ph, root: root, roll: roll, pitch: 0, yaw: 0, w: { ready: 1 - u, load: 0, lo: u, hi: 0, land: 0, block: 0 }, side: P ? P.side : 0,
                hands: [[root[0] - 0.4, root[1] + 0.3, root[2] + 0.3], [root[0] + 0.4, root[1] + 0.3, root[2] + 0.3]], reach: [false, false], feet: [[root[0] - 0.3, 0, z0], [root[0] + 0.3, 0, z0]],
                head: [root[0], root[1] + 0.68, root[2]], look: [0, 0.2, SPOT[1]], getupT: 0, mind: { bob: 0.03 * Math.sin(2 * Math.PI * 2.1 * tt), antic: null, w: 0, x: 0 } };
            },
            colliders: function () { return []; },
            round: function (KS) { return KS; },
          };
        }
        return { standIn: true, taker: taker, keeper: keeper };
      }
      // a scripted player (tap-contract §2.10, the brain's pilot in its absence): presses at rate (taps/s, or
      // [[seconds from the start, rate], ...]) from step start, each held duty of its interval; the press whose predicted
      // lock is within stopBefore s is held on, as is one down at the lock; then (unless mash: keep tapping, the first
      // let-go the strike) one press if KICK is up, let go releaseMs off the nominal plant (null: never, the auto strike)
      function standInPilot(spec) {
        var s = spec || {}, start = Math.max(0, Math.round(s.start != null ? +s.start : 24)), duty = clamp(s.duty != null ? +s.duty : 0.45, 0.05, 0.95);
        var stopBefore = Math.max(0, +s.stopBefore || 0), mash = !!s.mash, relMs = s.releaseMs === null ? null : +s.releaseMs || 0, jit = Math.max(0, +s.jitter || 0) / 1000;
        var segs = Array.isArray(s.rate) ? s.rate.filter(function (x) { return Array.isArray(x); }).map(function (x) { return [+x[0] || 0, Math.max(0, +x[1] || 0)]; }).sort(function (a, b) { return a[0] - b[0]; }) : null;
        var r0 = segs ? 0 : Math.max(0, +s.rate || 0), rnd = jit ? mulberry(((s.seed >>> 0) || 1) ^ 0x7A) : null;
        function rateAt(sec) { if (!segs || !segs.length) return r0; var r = segs[0][1]; for (var i = 0; i < segs.length; i++) if (sec >= segs[i][0]) r = segs[i][1]; return r; }
        var down = false, held = false, nextP = start, nextR = null, tS = 0, relT = null, struck = false;
        return { spec: s, edges: function (n, tk) {
          var out = [];
          if (struck) return out;
          var locked = !!(tk && tk.locked && tk.locked());
          // (a let-go due on the lock's own step would be the strike: the press is held through it instead)
          if (down && nextR != null && n >= nextR && !locked && !mash && tk && tk.predictLock && tk.predictLock(n) <= 1) { held = true; nextR = null; nextP = null; }
          if (down && nextR != null && n >= nextR && (!locked || mash)) { out.push([0, n]); down = false; nextR = null; if (locked) { struck = true; return out; } }
          if (locked && !mash) {
            nextP = null;
            if (relT == null) { var nom = tk.nominal ? tk.nominal() : null; relT = relMs == null || !nom ? Infinity : Math.round(nom.plantT / H + relMs / 1000 / H); }
            if (!down) { out.push([1, n]); down = true; }
            if (n >= relT) { out.push([0, n]); down = false; struck = true; }
            return out;
          }
          if (!down && !held && nextP != null && n >= nextP) {
            out.push([1, n]); down = true;
            var r = rateAt((n - start) * H);
            if (!(r > 0)) { held = true; nextP = null; return out; }
            var pl = !mash && stopBefore > 0 && tk && tk.predictLock ? tk.predictLock(n) : null;
            if (pl != null && pl * H <= stopBefore) { held = true; nextP = null; return out; }
            nextR = n + Math.max(1, Math.round(duty / r / H));
            tS += 1 / r;
            nextP = Math.max(nextR, start + Math.round((tS + (rnd ? (rnd() - 0.5) * 2 * jit : 0)) / H));
          }
          return out;
        } };
      }
      function standInGoal() {
        var g = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 24, 16), new THREE.MeshStandardMaterial({ color: '#F4F4F2', roughness: 0.45 }));
        g.castShadow = true; g.position.set(BALL0[0], BALL0[1], BALL0[2]); scene.add(g); envify(g);
        return { standIn: true, ball: g, update: function (s, dt, a) { var p0 = s.p0 || s.p; a = a || 0; g.position.set(p0[0] + (s.p[0] - p0[0]) * a, p0[1] + (s.p[1] - p0[1]) * a, p0[2] + (s.p[2] - p0[2]) * a); }, reset: function () { g.position.set(BALL0[0], BALL0[1], BALL0[2]); }, bulge: function () {} };
      }
      function standInCamera() {
        var SH = {
          WALK: { p: [3.4, 1.55, -15.2], p2: [3.0, 1.55, -18.2], look: 'taker', fov: 26, across: 18 },
          KEEPER: { p: [-1.3, 1.35, -57.3], look: 'keeper', fov: 24, across: 16 },
          BALL: { p: [0.55, 0.24, -40.0], l: [0, 0.14, -41.5], fov: 38, across: 30 },
          HERO: { p: [1.15, 1.62, -32.4], l: [-0.3, 1.35, -52.5], fov: 36, across: 0, pp: [-0.15, 1.78, -33.4], pl: [-0.25, 1.15, -52.5], pfov: 60 },
          REVERSE: { p: [0.9, 1.25, -56.2], l: [-0.4, 1.2, -44], fov: 46, across: 34 },
        };
        var C = { shot: 'HERO', side: 1, tc: 0, init: false, shake: 0, p: new THREE.Vector3(), l: new THREE.Vector3() }, WP = new THREE.Vector3(), WL = new THREE.Vector3(), V3 = new THREE.Vector3();
        return {
          standIn: true,
          cut: function (name, o) { if (!SH[name]) return; C.shot = name; C.tc = 0; C.init = false; if (o && (o.side === 1 || o.side === -1)) C.side = o.side; },
          kick: function (k) { C.shake = Math.max(C.shake, 0.25 * (k || 1)); },
          update: function (dt, L) {
            var s = SH[C.shot], portrait = camera.aspect < 1, fov = s.fov;
            C.tc += dt;
            if (C.shot === 'HERO' && portrait) { WP.fromArray(s.pp); WL.fromArray(s.pl); fov = s.pfov; }
            else if (C.shot === 'REVERSE') { WP.set(-C.side * 0.9, 1.25, -56.2); WL.set(C.side * 0.4, 1.2, -44); }
            else { WP.fromArray(s.p); if (s.p2) WP.lerp(V3.fromArray(s.p2), clamp(C.tc / 6, 0, 1)); if (s.l) WL.fromArray(s.l); else WL.fromArray(s.look === 'keeper' ? L.keeper : L.taker); }
            if (C.shot === 'HERO') { WP.z -= 0.5 * L.runup; if (L.flight) WL.lerp(V3.fromArray(L.ball), 0.15); }
            if (s.across && camera.aspect < 1) fov = Math.max(fov, 2 * Math.atan(Math.tan(s.across * Math.PI / 360) / camera.aspect) * 180 / Math.PI);
            if (!C.init) { C.p.copy(WP); C.l.copy(WL); C.init = true; }
            else { C.p.lerp(WP, 1 - Math.exp(-6 * dt)); C.l.lerp(WL, 1 - Math.exp(-8 * dt)); }
            camera.up.set(0, 1, 0); camera.position.copy(C.p);
            if (C.shake > 0) { var k = C.shake * 0.05; camera.position.x += Math.sin(t * 57) * k; camera.position.y += Math.sin(t * 43) * k; C.shake = Math.max(0, C.shake - dt); }
            camera.lookAt(C.l);
            if (Math.abs(camera.fov - fov) > 0.02) { camera.fov = fov; camera.updateProjectionMatrix(); }
          },
          state: function () { return { shot: C.shot, pos: [+camera.position.x.toFixed(3), +camera.position.y.toFixed(3), +camera.position.z.toFixed(3)], fov: +camera.fov.toFixed(2), standIn: true }; },
        };
      }
      function standInAudio() {
        var n = function () {};
        return { standIn: true, mood: n, sfx: n, heartbeat: n, duck: n, step: n, level: function () { return null; }, SLOTS: {} };
      }
      function standInHud() {
        el('style', null, [
          '#gm .so-pill{position:absolute;left:50%;top:' + TOP + ';transform:translateX(-50%);' + GLASS + ';border-radius:999px;padding:8px 18px;font-size:12px;font-weight:600;letter-spacing:.24em;text-transform:uppercase}',
          '#gm .so-dot{position:absolute;left:0;top:0;width:26px;height:26px;margin:-13px 0 0 -13px;border-radius:50%;border:2px solid #F2D27A;box-shadow:0 0 10px rgba(233,196,106,.9);display:none}',
          '#gm .so-dot.lock{border-color:#fff}',
          '#gm .so-res{position:absolute;left:50%;top:22%;transform:translateX(-50%);' + GLASS + ';border-radius:22px;padding:16px 30px;font-size:26px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;display:none;white-space:nowrap}',
          '#gm.demo .so-pill,#gm.demo .so-dot,#gm.demo .so-res{display:none!important}',
          '#gm.so-scene .tpad,#gm.so-scene .stick{visibility:hidden}',
        ].join('\n'));
        var pill = el('div', 'so-pill', ''), dot = el('div', 'so-dot', ''), res = el('div', 'so-res', ''), PV = new THREE.Vector3(), ringTxt = '';
        var n = function () {};
        return {
          standIn: true,
          phase: function (p) { pill.textContent = p; ringTxt = ''; },
          reticle: function (w, loop, locked) {
            if (!w) { dot.style.display = 'none'; return; }
            PV.set(w[0], w[1], w[2]).project(camera);
            if (PV.z > 1) { dot.style.display = 'none'; return; }
            dot.style.display = 'block'; dot.classList.toggle('lock', !!locked);
            dot.style.transform = 'translate(' + ((PV.x + 1) / 2 * innerWidth).toFixed(1) + 'px,' + ((1 - PV.y) / 2 * innerHeight).toFixed(1) + 'px)';
          },
          ring: function (u) { if (u == null) return; var s = 'run-up ' + Math.round(u * 100) + '%'; if (s !== ringTxt) { ringTxt = s; pill.textContent = s; } },
          result: function (kind, grade, errMs) { if (!kind) { res.style.display = 'none'; return; } res.textContent = kind + (grade ? ' · ' + grade : '') + (errMs != null ? ' · ' + (errMs > 0 ? '+' : '') + errMs + ' ms' : ''); res.style.display = 'block'; },
          flash: n, tracker: n, replay: function (on) { if (on) pill.textContent = 'replay'; }, hint: n, skip: n, retry: n, kick: n, update: n, onboard: n, caption: n,
          heat: function (h) { if (h && h.band) { var s = h.band + ' ' + h.deg + '\u00b0'; if (PH !== 'runup' && s !== ringTxt) { ringTxt = s; pill.textContent = s; } } },
          kickState: function (k) { if (k && k.label) { var b = KB && KB.firstChild; if (b && b.nodeType === 3 && b.nodeValue !== k.label) b.nodeValue = k.label; } },
          perf: function (s) { pill.textContent = s.calls + ' calls'; },
        };
      }
      // the stand-in people: carriers moved along the walk and the run-up, the keeper from the brain's state
      var SI = { lift: null, liftK: null, ref: false };
      function liftOf(e) { var b = new THREE.Box3().setFromObject(e.model || e.object); return b.isEmpty() ? 0 : Math.max(0, -b.min.y + e.object.position.y); }
      function standInTaker(v) {
        var o = P0.object; if (SI.lift === null) SI.lift = liftOf(P0);
        var B = [-0.25, SPOT[1] + 0.35], M2 = MARK, x = M2[0], z = M2[1], yaw = Math.atan2(B[0] - x, B[1] - z);
        var from = [SPOT[0] - 0.2, SPOT[1] + 4.5], at = [SPOT[0], SPOT[1] + 0.55];
        if (v.tk && v.tk.c != null && LK) {
          var u = runupU(v.tk.c, LK);
          x = M2[0] + (B[0] - M2[0]) * u; z = M2[1] + (B[1] - M2[1]) * u;
        } else if (PH === 'walk' && FIRST_WALK) {
          if (PT < WT.t1) { var f = PT / WT.t1; x = from[0] + (at[0] - from[0]) * f; z = from[1] + (at[1] - from[1]) * f; yaw = Math.PI; }
          else if (PT < WT.t2) { x = at[0]; z = at[1]; yaw = Math.PI; }
          else if (PT < WT.t3) { var g = (PT - WT.t2) / (WT.t3 - WT.t2); x = at[0] + (M2[0] - at[0]) * g; z = at[1] + (M2[1] - at[1]) * g; yaw = Math.PI; }
        }
        o.position.set(x, SI.lift, z); o.rotation.set(0, yaw, 0);
      }
      function standInKeeper(ks) {
        var o = KEEPER.object; if (SI.liftK === null) SI.liftK = liftOf(KEEPER);
        if (!ks || !Array.isArray(ks.root)) { o.position.set(0, SI.liftK, GZ + 0.15); return; }
        o.position.set(ks.root[0], SI.liftK + ks.root[1] - 0.88, ks.root[2]);
        o.rotation.set(0, 0, -(ks.roll || 0) * (ks.side || 1));
      }
      function standInRef() { if (SI.ref) return; SI.ref = true; REF.object.position.set(7.5, liftOf(REF), SPOT[1] - 4.5); REF.object.rotation.set(0, -Math.PI / 2, 0); }

      /* ----------------------------------------------------------------------- what tests can read -- */
      function r3(v) { return typeof v === 'number' ? Math.round(v * 1000) / 1000 : v; }
      function roundDeep(o) {
        if (o == null) return o;
        if (typeof o === 'number') return r3(o);
        if (Array.isArray(o)) return o.map(roundDeep);
        if (typeof o === 'object') { var r = {}; for (var k in o) if (typeof o[k] !== 'function') r[k] = roundDeep(o[k]); return r; }
        return o;
      }
      function shootState() {
        var K = LK, R = K && K.rec, tk = K && K.tk, st = K && K.launched ? K.sim.state() : null, g = K && K.launch, o = K && K.outcome;
        var ks = K && K.ks ? (K.kp.round ? K.kp.round(K.ks) : K.ks) : null;
        var ts = K ? tapsOf(K) : null, hv = K ? heatOf(K) : null, pw = tk && tk.power ? tk.power() : null, m = K ? markerNow() : [AIM.x, AIM.y], info = aimInfoOf(m[0], m[1]);
        var locked = !!(tk && tk.locked()), sp = K ? Math.max(0.2, K.meta.contact - (tk && tk.c0 != null ? tk.c0 : K.meta.start)) : 1;
        return {
          phase: state === 'paused' ? 'paused' : demo ? 'demo' : PH, under: PH, sub: PH === 'runup' ? SUB : null, state: state, demo: demo, kick: R ? R.kick : 0, seed: R ? R.seed : null, session: SESS.seed,
          aim: { x: r3(AIM.x), y: r3(AIM.y), marker: m.map(r3), inFrame: !!info.inFrame, nearWood: !!info.nearWood, range: [TC.AIM_X.slice(), TC.AIM_Y.slice()] },
          locked: locked, lockedAim: locked && R && R.aim ? R.aim.map(r3) : null, wobble: m.map(r3),
          step: K ? K.n : 0, n0: R ? R.n0 : 0, setStep: R ? R.setStep : null,
          runup: K ? { sub: PH === 'runup' ? SUB : null, c: K.tko ? r3(K.tko.c) : null, c0: tk && tk.c0 != null ? r3(tk.c0) : null, cJ: tk && tk.cJ != null ? r3(tk.cJ) : null, u: K.tko && tk.started() ? r3(runupU(K.tko.c, K)) : 0,
            rate: K.tko ? r3(K.tko.rate) : null, start: ts ? ts.start : null, lock: ts ? ts.lock : null, release: ts ? ts.release : null, auto: !!K.auto,
            presses: ts ? ts.presses : 0, accepted: ts ? ts.accepted : 0, ignored: ts ? ts.ignored : 0, mashed: ts ? ts.mashed : 0,
            lockIn: tk && !locked && tk.started() && tk.predictLock ? r3(tk.predictLock(K.n) * H) : null, span: r3(sp) } : null,
          heat: hv, power: pw ? roundDeep({ W: pw.W, speed: pw.speed, kmh: pw.kmh != null ? pw.kmh : Math.round(pw.speed * 3.6), coneK: pw.coneK, wobA: pw.wobA, s: pw.s }) : null,
          nominal: tk && tk.nominal && tk.nominal() ? roundDeep(tk.nominal()) : null,
          edges: R ? R.edges.length : 0,
          releaseErrMs: g ? Math.round(g.err * 1000) : null, grade: g ? g.grade : null, kmh: g ? g.kmh : null,
          W: tk && tk.windowNow ? r3(tk.windowNow()) : TC.W_COLD, pressure: 0,
          clipT: K && K.tko ? r3(K.tko.c) : null, rate: K && K.tko ? r3(K.tko.rate) : null, clip: K ? K.meta.clip : CLIP,
          meta: K ? { start: r3(K.meta.start), plant: r3(K.meta.plant), contact: r3(K.meta.contact), standIn: !!K.meta.standIn, preT: r3(R.preT) } : null, mark: MARK.map(r3),
          keeper: roundDeep(ks), plan: K && K.plan ? roundDeep({ side: K.plan.side, stay: K.plan.stay, I: K.plan.I, delta: K.plan.delta, correct: K.plan.correct }) : null,
          ball: st ? { p: st.p.map(r3), v: st.v.map(r3), phase: st.phase } : null,
          outcome: o ? { kind: o.kind, woodwork: !!o.woodwork, part: o.part || null, keeperTouched: !!o.keeperTouched, held: !!o.held, miss: o.miss || null, t: r3(o.t) } : null,
          hash: K ? K.hashAt : null, contacts: K ? K.contacts.length : 0,
          tally: { kicks: SESS.kicks, goals: SESS.goals, list: SESS.list.slice(-10) },
          cam: part('camera', CAM, 'state') || null,
          render: { calls: post ? post.calls : renderer.info.render.calls, tris: post ? post.tris : renderer.info.render.triangles, pixelRatio: renderer.getPixelRatio() },
          hitstop: { real: r3(IMPS.real), game: r3(IMPS.game), held: IMPS.held, n: IMPS.n },
          input: { dev: DEV.last, held: kickDown(), id: KICKS.id, holdDev: KICKS.dev, down: Object.keys(KICKS.src), logging: KICKS.log, presses: KICKS.presses, releases: KICKS.releases, ignored: KICKS.ignored, aborts: KICKS.aborts,
            pad: PAD.on, stick: TK.on, aimV: [r3(AIM.vx), r3(AIM.vy)], tapper: !!TAPPER },
          parts: Object.assign({}, USED), failed: Object.assign({}, FAILED), events: Object.assign({}, EVN), cut: KNOB.cut,
          replay: RP ? { tau: r3(RP.tau), steps: RP.list.length } : null,
        };
      }
      // a debug kick's record (tap-contract §3.5): a fresh kick at the mark with a scripted player, by default from step 24
      // at 8 taps a second (a warm kick), the last press held through the lock and let go releaseMs off the nominal plant;
      // or the edges given. The same record in debug.sim (the brain's own loop) gives the same outcome and hash
      function debugRec(o, kickN) {
        o = o || {};
        var seed = o.seed != null ? (+o.seed >>> 0) : kickSeed(kickN);
        var clip = o.clip === 2 || o.clip === 'fbKick2' ? 'fbKick2' : o.clip ? 'fbKick' : CLIP;
        var pilot = null, edges = null;
        if (Array.isArray(o.edges)) edges = o.edges;
        else if (o.pilot && typeof o.pilot === 'object') pilot = JSON.parse(JSON.stringify(o.pilot));
        else {
          pilot = { start: o.holdStep != null ? Math.max(0, Math.round(+o.holdStep)) : 24, rate: o.rate != null ? (Array.isArray(o.rate) ? o.rate : +o.rate) : 8,
            stopBefore: +o.stopBefore || 0, mash: !!o.mash, releaseMs: o.releaseMs === null || o.release === false ? null : (+o.releaseMs || 0), duty: o.duty != null ? +o.duty : 0.45 };
          if (o.jitter) { pilot.jitter = +o.jitter; pilot.seed = seed; }
        }
        var rec = newRec({ seed: seed, kick: kickN, n0: 0, touch: !!o.touch, clip: clip, pilot: pilot, edges: edges,
          keeper: o.keeper === null || o.keeper === false ? false : o.keeper && typeof o.keeper === 'object' ? JSON.parse(JSON.stringify(o.keeper)) : undefined, cone: o.cone,
          speedFix: o.speed ? clamp(+o.speed, 10, 40) : null, Wfix: o.W ? clamp(+o.W, 0.02, 0.5) : null, skill: o.skill != null ? clamp(+o.skill, 0, 1) : null,
          preT: o.preT > 0 ? +o.preT : preTFor(clip), grace: o.grace != null ? clamp(+o.grace, 0, 300) / 1000 : undefined,
          aim: Array.isArray(o.aim) ? o.aim : [0, 1] });
        rec.setStep = 0;
        return rec;
      }
      // a debug kick played for real (the picture, the sound, the events, the tally)
      function liveKick(rec) {
        hideScreen(); part('hud', HUD, 'retry', null);
        demo = false; root.classList.remove('demo'); root.classList.remove('so-scene'); state = 'race'; paused = false; clearSources(); KICKS.log = false; TAPPER = null;
        planTaker(null, kickMeta(rec.clip));
        LK = newKick(rec); ACC = 0; IMPS.t = 9; RP = null; WOODWORK_IN = null; FIRST_WALK = false;
        handTimeline(LK);
        part('goal', GOAL, 'reset'); part('hud', HUD, 'result', null); part('hud', HUD, 'flash', null);
        if (rec.aim) { AIM.x = rec.aim[0]; AIM.y = rec.aim[1]; AIM.vx = AIM.vy = 0; }
        setPhase('set');
        camCut('HERO');
        part('hud', HUD, 'tracker', tally());
        return LK;
      }
      function sameAs(a, b) {
        return !!(a && b && a.rec && b.rec && a.rec.seed === b.rec.seed && a.hash === b.hash && a.outcome && b.outcome && a.outcome.kind === b.outcome.kind &&
          a.lock === b.lock && (a.heat && a.heat.Hlock) === (b.heat && b.heat.Hlock) && a.grade === b.grade);
      }
      var DEBUG = {
        start: function () { assisted = true; if (state === 'title' || demo || PH === 'retry' || PH === 'start') startCountdown(); return PH; },
        // (the session's seed, and the kick count back to 0: the next debug kick, or kick, has the same seed every time)
        seed: function (n) { assisted = true; if (n != null) { SESS.seed = +n >>> 0; SESS.index = 0; } return SESS.seed; },
        // a kick played for real from a record: { aim, rate | pilot | edges, stopBefore, mash, releaseMs, touch, keeper, cone,
        // speed, W, clip, seed } (a bare { aim, releaseMs } is a warm kick at 8 taps a second)
        kick: function (o) {
          assisted = true; o = o || {};
          SESS.index++;
          planTaker(null, kickMeta(o.clip === 2 || o.clip === 'fbKick2' ? 'fbKick2' : CLIP));
          var rec = debugRec(o, SESS.index);
          liveKick(rec);
          return { kick: rec.kick, seed: rec.seed, pilot: rec.pilot, aim: rec.aim, rec: plain(rec) };
        },
        // the same, with no picture: the brain's own headless loop (ShootBrain.kick, the one sim-check runs in Node), so
        // Chrome and Node compare; the director's own loop where the brain has no tap controller yet
        sim: function (o) {
          o = o || {};
          var kn = o.kick || SESS.index + 1, rec = debugRec(Object.assign({}, o, { seed: o.seed != null ? o.seed : kickSeed(kn) }), kn);
          if (typeof BRAIN.kick !== 'function' || USED.taker !== 'own') { var r0 = DEBUG.simLive(Object.assign({}, o, { seed: rec.seed })); r0.via = 'director (no brain tap loop)'; return r0; }
          var q = Object.assign({}, plain(rec), { dims: o.dims || KDIMS || undefined, meta: o.meta || kickMeta(rec.clip) });
          var r = BRAIN.kick(SIMM, q) || {}, oc = r.outcome, gr = r.grade && typeof r.grade === 'object' ? r.grade : null;
          return { outcome: oc ? { kind: oc.kind, woodwork: !!oc.woodwork, part: oc.part || null, keeperTouched: !!oc.keeperTouched, held: !!oc.held, miss: oc.miss || null, t: oc.t } : null,
            hash: r.hash, contacts: r.contacts || [], grade: gr ? gr.grade : r.grade || null, errMs: gr ? gr.errMs : null, steps: r.steps, lock: r.steps && typeof r.steps === 'object' ? r.steps.lock : null,
            heat: r.heat || null, kmh: r.kmh != null ? r.kmh : null, closest: r.closest,
            events: (r.events || []).filter(function (e) { return e.type !== 'step' && e.type !== 'tap' && e.type !== 'ignored' && e.type !== 'mash'; }).map(function (e) { return { type: e.type, n: e.n, part: e.part || undefined }; }),
            decision: r.decision || null, rec: plain(rec), via: 'ShootBrain.kick' };
        },
        // the director's own loop with no picture, from a debug kick's record (what debug.kick plays, step for step)
        simLive: function (o) { o = o || {}; var kn = o.kick || SESS.index + 1; var K = runHeadless(debugRec(Object.assign({}, o, { seed: o.seed != null ? o.seed : kickSeed(kn) }), kn)); var r = resultOf(K); r.via = 'director'; return r; },
        // a record played again with no picture: .same when the outcome, the hash, the lock, the locked heat and the grade
        // all match the last live kick's
        rekick: function (rec) {
          if (!rec || typeof rec !== 'object') return null;
          var K = runHeadless(JSON.parse(JSON.stringify(rec))), r = resultOf(K);
          r.same = sameAs(LAST, r);
          r.diff = LAST ? { hash: [LAST.hash, r.hash], kind: [LAST.outcome && LAST.outcome.kind, r.outcome && r.outcome.kind], lock: [LAST.lock, r.lock], Hlock: [LAST.heat && LAST.heat.Hlock, r.heat && r.heat.Hlock], grade: [LAST.grade, r.grade] } : null;
          return r;
        },
        last: function () { return LAST; },
        history: function () { return HIST.slice(); },
        phases: function () { return PHLOG.slice(); },
        heat: function () { return LK && LK.tk && LK.tk.heat ? roundDeep(LK.tk.heat()) : null; },
        shot: function (name) { assisted = true; camCut(String(name || 'HERO').toUpperCase()); return part('camera', CAM, 'state') || null; },
        film: function (on) { assisted = true; root.style.visibility = on ? 'hidden' : ''; MASTER = !!on; if (post && post.setGrain) post.setGrain(on ? 0 : G.grade.grain); return !!on; },
        audio: function () { ensureAudio(); return part('audio', SND, 'level') || null; },
        // the HUD's own reading of itself (shootout-hud.js state(): the heat, the KICK label, the reticle, the result, the onboarding)
        hud: function () { var h = part('hud', HUD, 'state'); return h ? roundDeep(plain(h)) : null; },
        // (retired with the heat, B1: the window is the locked heat's alone)
        pressure: function () { return 0; },
        timeScale: function (n) { assisted = true; n = +n || 1; if (n >= 1) { timeScale = clamp(n, 1, 8); DBG.slow = 1; } else { timeScale = 1; DBG.slow = clamp(n, 0.05, 1); } return n; },
        fixedStep: function (fps) { fixedStep = fps ? 1 / clamp(+fps || 60, 24, 120) : 0; if (fps) assisted = true; return fixedStep; },
        skip: function () { skipScene(); return PH; },
        // input as a player gives it (tests): press and let go now, by device
        press: function (dev) { return press(performance.now(), dev || 'key', dev === 'touch' ? 77 : null); },
        release: function (dev) { return release(performance.now(), dev || 'key', dev === 'touch' ? 77 : null); },
        // tap(dev): one tap now; tap(rate, seconds, { releaseMs (vs the plant; null: held, the auto), hold, duty, dev }):
        // KICK tapped at rate for seconds from now, through the same input, each edge an exact step
        tap: function (a, secs, o) {
          if (typeof a === 'number') { assisted = true; return startTapper(a, secs, o); }
          var dev = a || 'key', id = dev === 'touch' ? 77 : null, now = performance.now();
          var p = press(now, dev, id); release(now + 1, dev, id); return p;
        },
        aim: function (x, y) { AIM.x = +x || 0; AIM.y = y == null ? AIM.y : +y; AIM.vx = AIM.vy = 0; clampAim(); return [AIM.x, AIM.y]; },
        // the marker exactly there (in the range, not the goal: x -7..7, y 0.12..4.5), its speed zeroed
        aimAt: function (x, y) { return DEBUG.aim(x, y); },
        parts: function () { return { used: Object.assign({}, USED), failed: Object.assign({}, FAILED), modules: Object.keys(M).filter(function (k) { return !!M[k]; }) }; },
        knobs: function () { return JSON.parse(JSON.stringify(KNOB)); },
        // the rendered keeper against the sim (design §9.2 browser #5): the gloves as drawn and their colliders (the hands
        // of the state they were drawn from: the colliders' centres), the body's own weights (where its tables draw the
        // hands, N3), and the ball's mesh against the sim's ball as drawn
        probe: function () {
          var v = VK, ks = v && v.ks, g = KBODY && KBODY.gloves ? KBODY.gloves() : null, ball = GOAL && GOAL.ball ? GOAL.ball.getWorldPosition(new THREE.Vector3()) : null;
          var s = v && v.sim, p0 = s && (s.p0 || s.p), u = v ? v.alpha || 0 : 0, kd = null;
          try { kd = KBODY && KBODY.debug ? KBODY.debug() : null; } catch (e) { kd = null; }
          return { phase: PH, step: LK ? LK.n : 0, alpha: u,
            gloves: g && ks && ks.hands ? { bone: [g[0].slice(), g[1].slice()], collider: [ks.hands[0].slice(), ks.hands[1].slice()], step: LK && LK.cols ? LK.cols.filter(function (c) { return c.part === 'glove'; }).map(function (c) { return c.a.slice(); }) : null } : null,
            keeper: kd ? roundDeep(plain(kd)) : null,
            ball: s && ball ? { mesh: [ball.x, ball.y, ball.z], sim: [p0[0] + (s.p[0] - p0[0]) * u, p0[1] + (s.p[1] - p0[1]) * u, p0[2] + (s.p[2] - p0[2]) * u] } : null };
        },
        people: function () { return { taker: P0, keeper: KEEPER, ref: REF, rigs: { taker: PEOPLE && PEOPLE.taker ? PEOPLE.taker.rig : null, ref: PEOPLE && PEOPLE.ref ? PEOPLE.ref.rig : null, keeper: KRIG } }; },
        gloves: function () { return { body: KBODY && KBODY.gloves ? roundDeep(KBODY.gloves()) : null, brain: LK && LK.ks ? roundDeep(LK.ks.hands) : null, cols: LK ? roundDeep((LK.cols || []).filter(function (c) { return c.part === 'glove'; }).map(function (c) { return c.a; })) : null }; },
      };

      /* ---------------------------------------------------------------------------- the hand-off -- */
      var FWV = new THREE.Vector3();
      OW = { ready: true, tick: shootTick, shadow: function () {}, state: null, shootout: shootState, shootDebug: DEBUG };
      // (the shadows centred on the box in every shot: v1's heroShadowAt adds 0.3 E along the camera's view; design §6.4)
      OW.hero = function (out) {
        if (CAM && CAM.hero && USED.camera === 'own') { var h = part('camera', CAM, 'hero', out); if (h) return h; }
        camera.getWorldDirection(FWV); FWV.y = 0; if (FWV.lengthSq() < 1e-6) FWV.set(0, 0, -1); FWV.normalize();
        return out.set(0, 0, -47.5).addScaledVector(FWV, -0.3 * (SUNB ? SUNB.E : 22));
      };
      stepLog('director: made (parts ' + Object.keys(USED).map(function (k) { return k + ':' + USED[k]; }).join(' ') + ')');
      startDemo();
    }
