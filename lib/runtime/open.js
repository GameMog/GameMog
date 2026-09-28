    /* ======================================================= open worlds == */
    // Included into boot() in v1.js (lib/custom-game.ts puts it at the marker),
    // so it shares the runtime's closure: three.js, the scene, camera and
    // renderer, the library's people and their kits, the cinematic renderer,
    // the HUD's glass, the screens and the loop.
    //
    // An open world (the owner, 27 Sep: "a GTA blueprint game builder") is not
    // a lap race. The world is a place you roam on foot, a map from the library
    // or the world's own, and the game is survival: people come for you, you
    // knock them out, their GM spills on the street, and the heat rises with
    // time and with every knockout. More of them come at once, each takes more
    // punches to put down, new kinds join (thugs, then bikers, then the police
    // by patrol car) and every third level brings a boss. You last as long as
    // you can; the board ranks the time. The world says who they are (their
    // looks, names, weapons, how hard they hit); the runtime runs the fight.
    var OW = null;
    function openWorld() {
      var O = OPEN;
      var MAPS = { 'ocean-drive': typeof GameMogOceanDrive !== 'undefined' ? GameMogOceanDrive : null };
      var lowQ = quality === 'low';
      var cfg = {
        map: typeof O.map === 'string' ? O.map : null,
        heatEvery: num(O.heat && O.heat.every, 40, 15, 180),
        maxEnemies: num(O.maxEnemies, lowQ ? 8 : 12, 2, 20),
        civilians: num(O.civilians, lowQ ? 6 : 12, 0, 24),
        body: typeof O.body === 'string' ? O.body : 'human-athlete-male',
        // hidden weapons (the owner, 28 Sep): on unless the world says weapons: false
        weapons: O.weapons === false ? null : (function (w) {
          w = w && typeof w === 'object' ? w : {};
          return { count: num(w.count, 8, 0, 30), kinds: w.kinds && typeof w.kinds === 'object' ? w.kinds : null, drops: w.drops !== false };
        })(O.weapons),
      };
      var PI = Math.PI, TAU = PI * 2;
      OW = { ready: false, tick: null, shadow: null, state: null, map: null };
      ctx.open = { map: null, heat: 1 };

      /* ---------------------------------------------------------- place -- */
      // where you can walk: bounds, solid boxes and circles (trunks, posts),
      // and the ground's height; a map brings its own, a world adds to them
      var W = { x0: -60, x1: 60, z0: -60, z1: 60, boxes: [], circles: [], height: function () { return 0; } };
      if (O.bounds && Array.isArray(O.bounds.x) && Array.isArray(O.bounds.z)) { W.x0 = +O.bounds.x[0]; W.x1 = +O.bounds.x[1]; W.z0 = +O.bounds.z[0]; W.z1 = +O.bounds.z[1]; }
      ctx.solid = function (s) {
        if (!s) return;
        if (s.isObject3D) { var bb = new THREE.Box3().setFromObject(s); W.boxes.push({ min: bb.min.clone(), max: bb.max.clone() }); return; }
        if (s.r != null) W.circles.push({ x: +s.x, z: +s.z, r: +s.r });
        else if (s.min && s.max) W.boxes.push({ min: { x: +s.min.x, y: s.min.y == null ? 0 : +s.min.y, z: +s.min.z }, max: { x: +s.max.x, y: s.max.y == null ? 3 : +s.max.y, z: +s.max.z } });
      };
      var GRID = null, CELL = 8;
      function buildGrid() {
        GRID = {};
        function add(key, kind, c) { var g = GRID[key] || (GRID[key] = { b: [], c: [] }); g[kind].push(c); }
        W.boxes.forEach(function (b) {
          if (b.max.y - Math.max(b.min.y, -1) < 0.35 || b.max.y < 0.3) return;   // kerbs and steps are walked over
          for (var gx = Math.floor(b.min.x / CELL); gx <= Math.floor(b.max.x / CELL); gx++)
            for (var gz = Math.floor(b.min.z / CELL); gz <= Math.floor(b.max.z / CELL); gz++) add(gx + ',' + gz, 'b', b);
        });
        W.circles.forEach(function (c) {
          for (var gx = Math.floor((c.x - c.r) / CELL); gx <= Math.floor((c.x + c.r) / CELL); gx++)
            for (var gz = Math.floor((c.z - c.r) / CELL); gz <= Math.floor((c.z + c.r) / CELL); gz++) add(gx + ',' + gz, 'c', c);
        });
      }
      function cellAt(x, z) { return GRID && GRID[Math.floor(x / CELL) + ',' + Math.floor(z / CELL)]; }
      function solidAt(x, z, r) {
        var g = cellAt(x, z); if (!g) return false;
        for (var i = 0; i < g.b.length; i++) { var b = g.b[i]; if (x > b.min.x - r && x < b.max.x + r && z > b.min.z - r && z < b.max.z + r) return true; }
        for (i = 0; i < g.c.length; i++) { var c = g.c[i]; if (Math.hypot(x - c.x, z - c.z) < c.r + r) return true; }
        return false;
      }
      // keep a body out of everything solid: pushed out along the shortest way
      function collide(a) {
        if (!a.free) { a.x = clamp(a.x, W.x0 + a.r, W.x1 - a.r); a.z = clamp(a.z, W.z0 + a.r, W.z1 - a.r); }
        var g = cellAt(a.x, a.z); if (!g) return;
        for (var i = 0; i < g.c.length; i++) {
          var c = g.c[i], dx = a.x - c.x, dz = a.z - c.z, d = Math.hypot(dx, dz), m = c.r + a.r;
          if (d < m && d > 1e-5) { a.x = c.x + dx / d * m; a.z = c.z + dz / d * m; }
        }
        for (i = 0; i < g.b.length; i++) {
          var b = g.b[i], cx = clamp(a.x, b.min.x, b.max.x), cz = clamp(a.z, b.min.z, b.max.z), ex = a.x - cx, ez = a.z - cz, e = Math.hypot(ex, ez);
          if (e >= a.r) continue;
          if (e > 1e-5) { a.x = cx + ex / e * a.r; a.z = cz + ez / e * a.r; }
          else {
            // inside: out through the nearest face
            var dl = a.x - b.min.x, dr = b.max.x - a.x, dn = a.z - b.min.z, ds = b.max.z - a.z, mn = Math.min(dl, dr, dn, ds);
            if (mn === dl) a.x = b.min.x - a.r; else if (mn === dr) a.x = b.max.x + a.r; else if (mn === dn) a.z = b.min.z - a.r; else a.z = b.max.z + a.r;
          }
        }
      }
      // a walking map: which metre squares are open, for routes round walls
      var NAV = null;
      function buildNav() {
        var nx = Math.ceil(W.x1 - W.x0), nz = Math.ceil(W.z1 - W.z0);
        if (nx * nz > 400000) { NAV = null; return; }
        var open = new Uint8Array(nx * nz);
        for (var j = 0; j < nz; j++) for (var i = 0; i < nx; i++) open[j * nx + i] = solidAt(W.x0 + i + 0.5, W.z0 + j + 0.5, 0.32) ? 0 : 1;
        NAV = { nx: nx, nz: nz, open: open };
      }
      function navOpen(x, z) { if (!NAV) return true; var i = Math.floor(x - W.x0), j = Math.floor(z - W.z0); return i >= 0 && j >= 0 && i < NAV.nx && j < NAV.nz && NAV.open[j * NAV.nx + i] === 1; }
      // can one walk straight from a to b?
      function clearLine(ax, az, bx, bz) {
        var d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / 0.5);
        for (var k = 1; k < n; k++) { var u = k / n; if (!navOpen(ax + (bx - ax) * u, az + (bz - az) * u)) return false; }
        return true;
      }
      // A* over the metre grid, in a window round the two ends
      function route(ax, az, bx, bz) {
        if (!NAV) return null;
        var pad = 24, i0 = Math.max(0, Math.floor(Math.min(ax, bx) - W.x0 - pad)), i1 = Math.min(NAV.nx - 1, Math.ceil(Math.max(ax, bx) - W.x0 + pad));
        var j0 = Math.max(0, Math.floor(Math.min(az, bz) - W.z0 - pad)), j1 = Math.min(NAV.nz - 1, Math.ceil(Math.max(az, bz) - W.z0 + pad));
        var w = i1 - i0 + 1, h = j1 - j0 + 1, N = w * h;
        if (N > 60000) return null;
        function nearestOpen(x, z) {
          var ci = Math.floor(x - W.x0), cj = Math.floor(z - W.z0);
          for (var r = 0; r < 6; r++) for (var dj = -r; dj <= r; dj++) for (var di = -r; di <= r; di++) {
            var ii = ci + di, jj = cj + dj; if (ii < i0 || jj < j0 || ii > i1 || jj > j1) continue;
            if (NAV.open[jj * NAV.nx + ii]) return (jj - j0) * w + (ii - i0);
          }
          return -1;
        }
        var s0 = nearestOpen(ax, az), g0 = nearestOpen(bx, bz);
        if (s0 < 0 || g0 < 0) return null;
        var gi = g0 % w, gj = (g0 / w) | 0;
        var cost = new Float32Array(N).fill(1e9), from = new Int32Array(N).fill(-1), closed = new Uint8Array(N), heap = [s0], f = new Float32Array(N);
        cost[s0] = 0; f[s0] = Math.hypot(s0 % w - gi, ((s0 / w) | 0) - gj);
        function push(n) { heap.push(n); var k = heap.length - 1; while (k > 0) { var pk = (k - 1) >> 1; if (f[heap[pk]] <= f[heap[k]]) break; var tmp = heap[pk]; heap[pk] = heap[k]; heap[k] = tmp; k = pk; } }
        function pop() { var top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; var k = 0; for (;;) { var l = k * 2 + 1, r = l + 1, m = k; if (l < heap.length && f[heap[l]] < f[heap[m]]) m = l; if (r < heap.length && f[heap[r]] < f[heap[m]]) m = r; if (m === k) break; var tmp = heap[m]; heap[m] = heap[k]; heap[k] = tmp; k = m; } } return top; }
        var steps = 0;
        while (heap.length && steps++ < 30000) {
          var c = pop(); if (closed[c]) continue; closed[c] = 1;
          if (c === g0) break;
          var ci2 = c % w, cj2 = (c / w) | 0;
          for (var dj2 = -1; dj2 <= 1; dj2++) for (var di2 = -1; di2 <= 1; di2++) {
            if (!di2 && !dj2) continue;
            var ni = ci2 + di2, nj = cj2 + dj2; if (ni < 0 || nj < 0 || ni >= w || nj >= h) continue;
            var nIdx = nj * w + ni; if (closed[nIdx] || !NAV.open[(nj + j0) * NAV.nx + (ni + i0)]) continue;
            if (di2 && dj2 && (!NAV.open[(cj2 + j0) * NAV.nx + (ni + i0)] || !NAV.open[(nj + j0) * NAV.nx + (ci2 + i0)])) continue;
            var nc = cost[c] + (di2 && dj2 ? 1.414 : 1);
            if (nc < cost[nIdx]) { cost[nIdx] = nc; from[nIdx] = c; f[nIdx] = nc + Math.hypot(ni - gi, nj - gj); push(nIdx); }
          }
        }
        if (from[g0] < 0 && g0 !== s0) return null;
        var pts = [], c2 = g0;
        while (c2 >= 0 && c2 !== s0) { pts.push({ x: W.x0 + (c2 % w) + i0 + 0.5, z: W.z0 + ((c2 / w) | 0) + j0 + 0.5 }); c2 = from[c2]; }
        pts.reverse();
        // keep only the corners: from each point, the farthest one in plain sight
        var out = [], cx = ax, cz = az, k2 = 0;
        while (k2 < pts.length) {
          var far = k2; for (var q = pts.length - 1; q > k2; q--) if (clearLine(cx, cz, pts[q].x, pts[q].z)) { far = q; break; }
          out.push(pts[far]); cx = pts[far].x; cz = pts[far].z; k2 = far + 1;
        }
        return out;
      }
      // where to head for, on the way to (tx, tz): straight there if the way is
      // clear, otherwise along a route, planned again now and then
      function steer(a, tx, tz) {
        if (clearLine(a.x, a.z, tx, tz)) { a.path = null; return { x: tx, z: tz }; }
        var now = DIR.time;
        if (!a.path || now > a.pathT || Math.hypot(a.pathTo.x - tx, a.pathTo.z - tz) > 4) { a.path = route(a.x, a.z, tx, tz); a.pathT = now + 1.2 + Math.random() * 0.6; a.pathTo = { x: tx, z: tz }; }
        if (!a.path || !a.path.length) return { x: tx, z: tz };
        while (a.path.length > 1 && (Math.hypot(a.path[0].x - a.x, a.path[0].z - a.z) < 0.9 || clearLine(a.x, a.z, a.path[1].x, a.path[1].z))) a.path.shift();
        return a.path[0];
      }
      function groundAt(x, z) { try { var h = W.height(x, z); return isFinite(h) ? h : 0; } catch (e) { return 0; } }
      // somewhere open to stand, from ring r0..r1 round (cx, cz)
      function openSpot(cx, cz, r0, r1, rnd) {
        rnd = rnd || Math.random;
        for (var k = 0; k < 40; k++) {
          var a = rnd() * TAU, r = r0 + rnd() * (r1 - r0), x = clamp(cx + Math.sin(a) * r, W.x0 + 2, W.x1 - 2), z = clamp(cz + Math.cos(a) * r, W.z0 + 2, W.z1 - 2);
          if (!solidAt(x, z, 0.6) && navOpen(x, z)) return { x: x, z: z };
        }
        return { x: clamp(cx, W.x0 + 2, W.x1 - 2), z: clamp(cz + r0, W.z0 + 2, W.z1 - 2) };
      }

      /* --------------------------------------------------------- people -- */
      var ACTID = 0, actors = [], player = null;
      function clipInfo(body, name) {
        var a = ASSETS[body], list = a && a.json.clips ? a.json.clips.list : [];
        for (var i = 0; i < list.length; i++) if (list[i].name === name) return { duration: list[i].duration, contact: list[i].contact != null ? list[i].contact : list[i].duration * 0.45 };
        return { duration: 0.8, contact: 0.35 };
      }
      function makeActor(kind, ent, o) {
        var g = new THREE.Group(); g.add(ent.object); scene.add(g);
        ent.object.traverse(function (m) { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; } });
        var a = {
          kind: kind, e: ent, g: g, body: o.body || cfg.body, name: o.name || '', color: o.color || '#FFFFFF',
          x: o.x || 0, z: o.z || 0, y: 0, yaw: o.yaw || 0, vx: 0, vz: 0, speed: 0, r: o.radius || 0.36,
          hp: o.hp || 3, max: o.hp || 3, state: 'idle', t: 0, act: null, busy: 0, stance: o.stance || 'idle', ko: false, koT: 0,
          stats: o.stats || {}, token: false, cool: 1 + Math.random() * 1.5, slot: Math.random() * TAU, hurtT: 9, stun: 0, fade: 1, id: ++ACTID,
          goal: null, idleT: 0, flee: 0, boss: !!o.boss, weapon: o.weapon || null, lastHit: '',
          kx: 0, kz: 0, mdir: o.yaw || 0, wet: 0,
        };
        a.y = groundAt(a.x, a.z);
        actors.push(a);
        return a;
      }
      function removeActor(a) {
        scene.remove(a.g);
        a.g.traverse(function (m) { if (m.isMesh && m.material) { (Array.isArray(m.material) ? m.material : [m.material]).forEach(function (mt) { if (mt.userData && mt.userData.gmOwned) mt.dispose(); }); } });
        var i = actors.indexOf(a); if (i >= 0) actors.splice(i, 1);
      }
      function play(a, name, rate) { a.act = { name: name, id: ++ACTID, rate: rate || 1 }; var ci = clipInfo(a.body, name); a.busy = ci.duration / (rate || 1); return ci; }
      function face(a, yaw, k) { var d = yaw - a.yaw; while (d > PI) d -= TAU; while (d < -PI) d += TAU; a.yaw += d * clamp(k, 0, 1); }
      function yawTo(a, x, z) { return Math.atan2(x - a.x, z - a.z); }
      function dist(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }
      function inFront(a, b, cone) { var y = yawTo(a, b.x, b.z) - a.yaw; while (y > PI) y -= TAU; while (y < -PI) y += TAU; return Math.abs(y) < cone; }

      // who they are: the world's own looks, or the runtime's street defaults
      var CREW = O.crew && typeof O.crew === 'object' ? O.crew : {};
      var STREET = ['#2B2F38', '#6B1E2A', '#1F4E5F', '#3E3A34', '#D9D4C8', '#2F5B3A', '#7A5C2E', '#101014', '#4A2B5E', '#B8452E'];
      var KIND = {
        thug:  { hp: 3, dmg: 7,  speed: 4.0, reach: 1.25, windup: 0.62, moves: ['jab', 'cross', 'hook'], gm: 2, names: ['Street thug'] },
        biker: { hp: 4, dmg: 10, speed: 4.4, reach: 1.75, windup: 0.66, moves: ['slash1', 'slash2'], gm: 3, weapon: { kind: 'chain' }, names: ['Biker'] },
        cop:   { hp: 5, dmg: 9,  speed: 4.2, reach: 1.65, windup: 0.56, moves: ['slash1', 'slash3'], gm: 3, weapon: { kind: 'baton' }, names: ['Officer'] },
        boss:  { hp: 14, dmg: 18, speed: 3.7, reach: 1.95, windup: 0.8, moves: ['slash2', 'slash3', 'dash'], gm: 20, weapon: { kind: 'bat' }, names: ['The Boss'], boss: true },
      };
      function spec(kind) {
        var k = KIND[kind] || KIND.thug, w = CREW[kind] || {};
        return {
          hp: num(w.hp, k.hp, 1, 60), dmg: num(w.damage, k.dmg, 1, 60), speed: num(w.speed, k.speed, 1.5, 7), reach: num(w.reach, k.reach, 0.8, 2.6),
          windup: num(w.windup, k.windup, 0.25, 1.5), moves: Array.isArray(w.moves) && w.moves.length ? w.moves : k.moves, gm: num(w.gm, k.gm, 0, 60),
          weapon: w.weapon === null ? null : (w.weapon || k.weapon || null), names: Array.isArray(w.names) && w.names.length ? w.names : (typeof w.name === 'string' ? [w.name] : k.names),
          look: typeof w.look === 'function' ? w.look : null, body: typeof w.body === 'string' ? w.body : null, boss: !!k.boss,
        };
      }
      var RND = mulberry(hashStr((meta.title || 'open') + ':crew'));
      // the runtime's own street looks, for a world that gives none
      function dressDefault(kind, i) {
        var skin = ['african', 'caucasian', 'asian', 'caucasian2'][i % 4], hair = ['short04', 'afro01', 'short02'][i % 3];
        var beard = ['stubble', 'none', 'full', 'goatee'][i % 4], sneakers = { top: '#101010', shoes: ['#F2F2F2', '#111111', '#C8102E'][i % 3] };
        if (kind === 'cop') return { skin: skin, hair: 'short02', height: 1.8, outfit: { shoes: '#0C0C0E' },
          clothes: { shirt: { kind: 'uniform', color: '#1D2B4B', color2: '#2E5DA8' }, pants: { kind: 'trousers', color: '#141D33' }, belt: '#0B0B0C', beard: i % 3 ? 'none' : 'stubble' }, gear: { police: '#111827' } };
        if (kind === 'biker') return { skin: ['caucasian', 'caucasian2', 'african'][i % 3], hair: hair, height: 1.84, build: { muscle: 0.8, lean: 0.25 }, outfit: { shoes: '#2A1D14' },
          clothes: { shirt: { kind: ['tee', 'tank'][i % 2], color: ['#2B2B2E', '#6B6B6E'][i % 2] }, jacket: { kind: 'vest', color: '#121012' }, pants: { kind: 'jeans', color: '#27364F' }, tattoos: { arms: true }, beard: ['full', 'goatee'][i % 2] }, gear: { bandana: ['#1A1A1A', '#8C1C1C', '#15305A'][i % 3] } };
        if (kind === 'boss') return { skin: ['caucasian2', 'african', 'asian'][i % 3], hair: 'short04', height: 2.02, build: { muscle: 1, lean: 0.15 }, outfit: { shoes: '#0C0C0E' },
          clothes: { shirt: { kind: 'open', color: '#F4F0E6', color2: '#C8102E', print: 'floral' }, pants: { kind: 'trousers', color: '#E6DCC6' }, beard: 'full', tattoos: { chest: true } }, gear: { chain: '#D4AF37', shades: '#101014' } };
        if (kind === 'civ') return { skin: skin, hair: hair, height: 1.6 + (i % 5) * 0.06, outfit: { shoes: ['#F2F2F2', '#D8C8A8', '#1B1B1D'][i % 3] },
          clothes: { shirt: { kind: ['tee', 'tank', 'open', 'polo', 'tee', 'tank'][i % 6], color: ['#F4E8D0', '#E86A92', '#3BB3C3', '#FFFFFF', '#F2C94C', '#9AD0EC'][i % 6], color2: ['#2A7F62', '#FFFFFF', '#F2F2F2', '#1C3F7A'][i % 4], print: ['plain', 'plain', 'floral', 'stripes', 'plain', 'plain'][i % 6] },
            pants: { kind: ['shorts', 'jeans', 'shorts', 'trousers'][i % 4], color: ['#D6C7A8', '#3E5A80', '#FFFFFF', '#6F7F5A'][i % 4] }, belt: i % 2 ? false : '#3A2A1E', beard: i % 2 ? 'none' : ['stubble', 'none', 'full'][i % 3] }, gear: i % 3 === 0 ? { shades: '#1A1A1E' } : i % 5 === 1 ? { cap: { color: ['#FFFFFF', '#1F4E8C', '#C8102E'][i % 3] } } : null };
        return { skin: skin, hair: hair, height: 1.76 + (i % 4) * 0.04, build: { muscle: 0.5 + (i % 3) * 0.2, lean: 0.4 }, outfit: sneakers,
          clothes: { shirt: { kind: ['tee', 'long', 'tank', 'tee', 'polo'][i % 5], color: ['#1F1F24', '#7A1E2B', '#2C4A63', '#E8E1D2', '#3B5B3A', '#5A2E6B'][i % 6], color2: '#0F0F12', print: i % 7 === 3 ? 'camo' : 'plain' },
            pants: { kind: ['jeans', 'trousers', 'jeans'][i % 3], color: ['#23324A', '#1B1B1F', '#39506E', '#2E3B2A'][i % 4] }, tattoos: { arms: i % 2 === 0, neck: i % 3 === 0 }, beard: beard }, gear: i % 4 === 0 ? { cap: { color: ['#101012', '#7A1E2B', '#F2F2F2'][i % 3], backwards: true } } : i % 4 === 2 ? { chain: '#D4AF37' } : null };
      }
      var made = { thug: 0, biker: 0, cop: 0, boss: 0, civ: 0 };
      function person(kind, sp, extra) {
        var i = made[kind]++, look = null;
        if (sp && sp.look) { try { look = sp.look(ctx, i, DIR.heat); } catch (e) { warn('open.crew.' + kind + '.look() threw: ' + (e && e.message || e)); } }
        var o = Object.assign({}, dressDefault(kind, i), look || {});
        var weapon = o.weapon !== undefined ? o.weapon : sp && sp.weapon;
        if (weapon) o.weapon = weapon; else delete o.weapon;
        var body = (look && look.body) || (sp && sp.body) || (kind === 'civ' ? (i % 2 ? 'human-athlete-female' : 'human-athlete-male') : cfg.body);
        if (!ASSETS[body]) body = ASSETS[cfg.body] ? cfg.body : Object.keys(ASSETS).filter(function (k) { return ASSETS[k].json && ASSETS[k].json.kind === 'human'; })[0];
        if (!body) return null;
        var ent = ctx.assets.human(body, o);
        if (!ent) return null;
        return makeActor(kind, ent, Object.assign({ body: body, name: (look && look.name) || (sp ? sp.names[i % sp.names.length] : ''), weapon: o.weapon || null }, extra || {}));
      }

      /* ------------------------------------------------------- director -- */
      var DIR = { heat: 1, heatT: 0, spawnT: 2, bossN: 0, kos: 0, koHeat: 0, time: 0, police: [], boss: null, lastWave: 0 };
      function stars(h) { var n = Math.min(5, h); return n; }

      /* -------------------------------------------------------- the HUD -- */
      var hudCss = document.createElement('style');
      hudCss.textContent = [
        '#gm .ow{position:absolute;top:' + TOP + ';left:calc(14px + env(safe-area-inset-left,0px));' + GLASS + ';border-radius:16px;padding:10px 14px 11px;width:230px}',
        '#gm .ow small{display:block;font-size:10px;font-weight:500;letter-spacing:.26em;text-transform:uppercase;opacity:.64;margin-bottom:6px}',
        '#gm .ow .hp{height:10px;border-radius:6px;background:rgba(255,255,255,.12);overflow:hidden}',
        '#gm .ow .hp i{display:block;height:100%;width:100%;border-radius:6px;background:' + T.accent + ';box-shadow:0 0 12px ' + acc(0.8) + '}',
        '#gm .ow .hp i.low{background:#FF3B3B;box-shadow:0 0 12px rgba(255,59,59,.8)}',
        '#gm .ow .st{display:flex;gap:4px;margin-top:9px;align-items:center}',
        '#gm .ow .st svg{width:17px;height:17px;fill:rgba(255,255,255,.18)}',
        '#gm .ow .st svg.on{fill:#FFD34D;filter:drop-shadow(0 0 6px rgba(255,211,77,.8))}',
        '#gm .ow .st b{font-size:12px;margin-left:6px;opacity:.8}',
        '#gm .owr{position:absolute;top:' + TOP + ';right:calc(14px + env(safe-area-inset-right,0px));display:flex;gap:8px}',
        '#gm .owr .board{position:relative;top:0}',
        '#gm .boss{position:absolute;top:calc(' + TOP + ' + 6px);left:50%;transform:translateX(-50%);width:min(420px,56vw);text-align:center;display:none}',
        '#gm .boss b{display:block;font-size:15px;letter-spacing:.2em;text-transform:uppercase;margin-bottom:6px;text-shadow:0 1px 8px rgba(0,0,0,.6)}',
        '#gm .boss .hp{height:9px;border-radius:5px;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.25);overflow:hidden}',
        '#gm .boss .hp i{display:block;height:100%;width:100%;background:#FF4040;box-shadow:0 0 14px rgba(255,64,64,.7)}',
        '#gm .radar{position:absolute;left:calc(14px + env(safe-area-inset-left,0px));bottom:calc(14px + env(safe-area-inset-bottom,0px));width:156px;height:156px;border-radius:50%;' + GLASS + ';overflow:hidden}',
        '#gm .radar canvas{width:100%;height:100%;display:block}',
        '#gm.touch .radar{width:112px;height:112px;bottom:auto;top:calc(' + TOP + ' + 104px)}',
        '#gm .owpad{position:absolute;right:calc(18px + env(safe-area-inset-right,0px));bottom:calc(22px + env(safe-area-inset-bottom,0px));display:none;gap:14px;align-items:flex-end;pointer-events:auto}',
        '#gm.touch .owpad{display:flex}',
        '#gm .owpad button{width:76px;height:76px;border-radius:50%;' + GLASS + ';color:#fff;font:700 13px Oxanium,system-ui;letter-spacing:.08em;touch-action:none}',
        '#gm .owpad button.big{width:96px;height:96px;font-size:15px}',
        '#gm .owpad button.on{background-color:' + acc(0.45) + '}',
        '#gm .stick{position:absolute;left:0;bottom:0;width:50%;height:60%;pointer-events:auto;touch-action:none;display:none}',
        '#gm.touch .stick{display:block}',
        '#gm .stick i{position:absolute;width:110px;height:110px;margin:-55px 0 0 -55px;border-radius:50%;border:2px solid rgba(255,255,255,.35);display:none}',
        '#gm .stick i b{position:absolute;left:50%;top:50%;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;background:rgba(255,255,255,.55)}',
        '#gm .ow .wp{display:none;margin-top:9px;align-items:center;gap:8px}',
        '#gm .ow .wp b{font-size:12px;letter-spacing:.18em;text-transform:uppercase;min-width:54px}',
        '#gm .ow .wp span{flex:1;height:5px;border-radius:3px;background:rgba(255,255,255,.14);overflow:hidden}',
        '#gm .ow .wp span i{display:block;height:100%;width:100%;background:#FFD34D;box-shadow:0 0 8px rgba(255,211,77,.7)}',
        '#gm .owp{position:absolute;left:50%;bottom:calc(128px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);' + GLASS + ';border-radius:12px;padding:8px 14px;font-size:13px;letter-spacing:.05em;display:none;white-space:nowrap}',
        '#gm .owp kbd{display:inline-block;min-width:20px;padding:1px 6px;margin-right:8px;border-radius:5px;background:rgba(255,255,255,.2);font:700 12px Oxanium,system-ui;text-align:center}',
        '#gm .owpad button.grab{display:none}',
        '#gm.demo .ow,#gm.demo .owr,#gm.demo .radar,#gm.demo .boss,#gm.demo .owp{display:none!important}',
      ].join('\n');
      document.head.appendChild(hudCss);
      var STAR = '<svg viewBox="0 0 24 24"><path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z"/></svg>';
      var hudHp = el('div', 'ow', '<small>Health</small><div class="hp"><i></i></div><div class="st">' + STAR + STAR + STAR + STAR + STAR + '<b></b></div><div class="wp"><b></b><span><i></i></span></div>');
      var hudPick = el('div', 'owp', '');
      var hudR = el('div', 'owr', '');
      var hudT = el('div', 'board', '<small>Survived</small><b>0:00</b>', hudR), hudK = el('div', 'board', '<small>KOs</small><b>0</b>', hudR), hudG = el('div', 'board gm', '<i>GM</i><div><small>GM</small><b>0</b></div>', hudR);
      var hudBoss = el('div', 'boss', '<b></b><div class="hp"><i></i></div>');
      var radar = el('div', 'radar', ''), rc = document.createElement('canvas'); rc.width = rc.height = 256; radar.appendChild(rc);
      var rg = rc.getContext('2d');
      [hudHp, hudR, hudBoss, radar].forEach(function (e) { e.style.display = 'none'; });
      // the race's own HUD stays hidden in an open world
      [hudLvl, hudTime, hudGm, hudRivals, padL, padR].forEach(function (e) { if (e) e.style.display = 'none'; });
      function showHud(on) { [hudHp, hudR, radar].forEach(function (e) { e.style.display = on ? '' : 'none'; }); if (!on) hudBoss.style.display = 'none'; }
      var lastHud = '';
      function stepHud() {
        if (!player) return;
        var key = Math.ceil(player.hp) + '|' + DIR.heat + '|' + Math.floor(DIR.time) + '|' + DIR.kos + '|' + gm + '|' + (PL.weapon ? PL.weapon.kind + PL.weapon.hits : '');
        if (key !== lastHud) {
          lastHud = key;
          var f = hudHp.querySelector('.hp i'); f.style.width = Math.max(0, player.hp / player.max * 100) + '%'; f.classList.toggle('low', player.hp / player.max < 0.3);
          var sv = hudHp.querySelectorAll('.st svg'); for (var i = 0; i < sv.length; i++) sv[i].classList.toggle('on', i < stars(DIR.heat));
          hudHp.querySelector('.st b').textContent = 'HEAT ' + DIR.heat;
          var s = Math.floor(DIR.time); hudT.querySelector('b').textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
          hudK.querySelector('b').textContent = DIR.kos; hudG.querySelector('b').textContent = gm;
          var wp = hudHp.querySelector('.wp'); wp.style.display = PL.weapon ? 'flex' : 'none';
          if (PL.weapon) { wp.querySelector('b').textContent = WEAPONS[PL.weapon.kind].name; wp.querySelector('span i').style.width = Math.max(0, PL.weapon.hits / PL.weapon.max * 100) + '%'; }
        }
        var near = state === 'race' && !demo ? PL.near : null, pk = near ? near.kind + (PL.weapon ? 's' : 'p') : '';
        if (pk !== hudPick.dataset.k) {
          hudPick.dataset.k = pk; hudPick.style.display = near && PL.weapon ? 'block' : 'none';
          if (near) hudPick.innerHTML = '<kbd>E</kbd>Swap for the ' + WEAPONS[near.kind].name.toLowerCase();
          grabBtn.style.display = near && PL.weapon ? 'block' : 'none';
        }
        var bs = DIR.boss && !DIR.boss.ko ? DIR.boss : null;
        hudBoss.style.display = bs && !demo && state === 'race' ? 'block' : 'none';
        if (bs) { hudBoss.querySelector('b').textContent = bs.name; hudBoss.querySelector('.hp i').style.width = Math.max(0, bs.hp / bs.max * 100) + '%'; }
      }
      // the radar: what is round you, the way the camera looks at the top
      var RADAR_R = 55;
      function stepRadar() {
        if (!player || radar.style.display === 'none') return;
        var S = rc.width, h = S / 2, k = h / RADAR_R, c = Math.cos(CAM.yaw), sn = Math.sin(CAM.yaw);
        function P(x, z) { var dx = x - player.x, dz = z - player.z; return [h + (dx * c - dz * sn) * k, h + (dx * sn + dz * c) * k]; }
        rg.clearRect(0, 0, S, S);
        rg.fillStyle = 'rgba(8,10,16,.35)'; rg.fillRect(0, 0, S, S);
        if (OW.map && OW.map.layout) {
          var L = OW.map.layout;
          rg.lineCap = 'round';
          function band(x0, x1, col) { var a = P(x0, player.z - 200), b = P(x0, player.z + 200), cc = P(x1, player.z + 200), d = P(x1, player.z - 200); rg.fillStyle = col; rg.beginPath(); rg.moveTo(a[0], a[1]); rg.lineTo(b[0], b[1]); rg.lineTo(cc[0], cc[1]); rg.lineTo(d[0], d[1]); rg.closePath(); rg.fill(); }
          band(L.HOTEL.backX, L.HOTEL.frontX, 'rgba(236,196,176,.28)');
          band(L.PARKING.x0, L.LANES.x1, 'rgba(40,44,52,.75)');
          band(L.PARK.x0, L.PARK.x1, 'rgba(80,150,90,.35)');
          band(L.SAND.x0, L.OCEAN.x0, 'rgba(230,210,160,.35)');
          band(L.OCEAN.x0, L.OCEAN.x0 + 300, 'rgba(40,120,170,.5)');
          (L.CROSS_STREETS || []).forEach(function (s) { if (Math.abs(s.z - player.z) > RADAR_R + 10) return; var a = P(L.HOTEL.frontX, s.z), b = P(L.HOTEL.backX - 30, s.z); rg.strokeStyle = 'rgba(40,44,52,.75)'; rg.lineWidth = L.CROSS.hw * 2 * k; rg.beginPath(); rg.moveTo(a[0], a[1]); rg.lineTo(b[0], b[1]); rg.stroke(); });
        }
        coins.forEach(function (q) { if (!q.on) return; var p = P(q.x, q.z); rg.fillStyle = '#FFD34D'; rg.beginPath(); rg.arc(p[0], p[1], 3, 0, TAU); rg.fill(); });
        actors.forEach(function (a) {
          if (a === player || a.fade < 0.5) return;
          var p = P(a.x, a.z); if (Math.hypot(p[0] - h, p[1] - h) > h) return;
          var col = a.kind === 'civ' ? 'rgba(255,255,255,.55)' : a.kind === 'cop' ? '#4DA3FF' : a.boss ? '#FF2E63' : '#FF5040';
          if (a.ko) col = 'rgba(160,160,160,.5)';
          rg.fillStyle = col; rg.beginPath(); rg.arc(p[0], p[1], a.boss ? 7 : a.kind === 'civ' ? 3 : 5, 0, TAU); rg.fill();
        });
        DIR.police.forEach(function (pc) { var p = P(pc.x, pc.z); rg.fillStyle = (Math.floor(DIR.time * 4) % 2) ? '#FF3030' : '#3070FF'; rg.fillRect(p[0] - 5, p[1] - 5, 10, 10); });
        // you: an arrow, the way you face against the camera's
        rg.save(); rg.translate(h, h); rg.rotate(-(player.yaw - CAM.yaw) + PI);
        rg.fillStyle = '#FFFFFF'; rg.beginPath(); rg.moveTo(0, -11); rg.lineTo(8, 9); rg.lineTo(0, 4); rg.lineTo(-8, 9); rg.closePath(); rg.fill(); rg.restore();
      }

      /* ----------------------------------------------------------- input -- */
      var IN = { f: 0, b: 0, l: 0, r: 0, sprint: false, jx: 0, jy: 0, jOn: false };
      var KEYS = { KeyW: 'f', ArrowUp: 'f', KeyS: 'b', ArrowDown: 'b', KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r' };
      window.addEventListener('keydown', function (e) {
        var k = KEYS[e.code], act = e.code === 'KeyJ' || e.code === 'KeyX' || e.code === 'KeyF' ? 'punch' : e.code === 'Space' || e.code === 'KeyK' || e.code === 'KeyC' ? 'roll' : null;
        if (demo && (k || act || e.code === 'Enter')) { e.preventDefault(); ensureAudio(); if (!e.repeat) showStart(); return; }
        if (screen && (e.code === 'Enter' || e.code === 'Space')) { e.preventDefault(); ensureAudio(); if (!e.repeat) screen._go(); return; }
        if (k) { IN[k] = 1; e.preventDefault(); ensureAudio(); return; }
        if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') { IN.sprint = true; return; }
        if (act && state === 'race') { e.preventDefault(); ensureAudio(); if (!e.repeat) (act === 'punch' ? punch : roll)(); return; }
        if (e.code === 'KeyE' && state === 'race' && !demo) { e.preventDefault(); if (!e.repeat) grab(); return; }
        if (e.code === 'KeyP' || e.code === 'Escape') { e.preventDefault(); if (!e.repeat && (state === 'race' || state === 'paused')) togglePause(); }
      });
      window.addEventListener('keyup', function (e) { var k = KEYS[e.code]; if (k) IN[k] = 0; if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') IN.sprint = false; });
      window.addEventListener('blur', function () { IN.f = IN.b = IN.l = IN.r = 0; IN.sprint = false; });
      // the mouse: a click punches; a drag turns the camera round you
      var drag = null;
      renderer.domElement.addEventListener('pointerdown', function (e) {
        if (e.pointerType === 'touch') return;
        ensureAudio(); drag = { x: e.clientX, y: e.clientY, moved: false, button: e.button };
      });
      window.addEventListener('pointermove', function (e) {
        if (!drag) return;
        var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (!drag.moved && Math.hypot(dx, dy) > 6) drag.moved = true;
        if (drag.moved) { CAM.yaw -= dx * 0.0055; CAM.pitch = clamp(CAM.pitch + dy * 0.004, -0.1, 0.9); CAM.userT = 0; drag.x = e.clientX; drag.y = e.clientY; }
      });
      window.addEventListener('pointerup', function () {
        if (drag && !drag.moved && drag.button === 0 && state === 'race' && !demo) punch();
        drag = null;
      });
      // touch: a stick where the left thumb lands, and buttons on the right
      var stick = el('div', 'stick', '<i><b></b></i>'), ring = stick.querySelector('i'), knob = ring.querySelector('b'), sid = null, s0 = null;
      stick.addEventListener('pointerdown', function (e) { e.preventDefault(); ensureAudio(); if (demo) { showStart(); return; } sid = e.pointerId; s0 = { x: e.clientX, y: e.clientY }; ring.style.display = 'block'; ring.style.left = e.clientX + 'px'; ring.style.top = (e.clientY - stick.getBoundingClientRect().top) + 'px'; try { stick.setPointerCapture(sid); } catch (x) {} });
      stick.addEventListener('pointermove', function (e) {
        if (e.pointerId !== sid) return;
        var dx = e.clientX - s0.x, dy = e.clientY - s0.y, d = Math.hypot(dx, dy), m = Math.min(d, 48);
        IN.jx = d ? dx / d * m / 48 : 0; IN.jy = d ? dy / d * m / 48 : 0; IN.jOn = true;
        knob.style.transform = 'translate(' + IN.jx * 32 + 'px,' + IN.jy * 32 + 'px)';
      });
      ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (ev) { stick.addEventListener(ev, function () { sid = null; IN.jOn = false; IN.jx = IN.jy = 0; ring.style.display = 'none'; knob.style.transform = ''; }); });
      var pad = el('div', 'owpad', '');
      function padBtn(label, cls, fn) {
        var b = el('button', cls, label, pad);
        b.addEventListener('pointerdown', function (e) { e.preventDefault(); ensureAudio(); if (demo) { showStart(); return; } b.classList.add('on'); fn(true); });
        ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) { b.addEventListener(ev, function () { b.classList.remove('on'); fn(false); }); });
        return b;
      }
      padBtn('RUN', '', function (on) { IN.sprint = on; });
      padBtn('ROLL', '', function (on) { if (on && state === 'race') roll(); });
      padBtn('PUNCH', 'big', function (on) { if (on && state === 'race') punch(); });
      var grabBtn = padBtn('GRAB', 'grab', function (on) { if (on && state === 'race') grab(); });

      /* ---------------------------------------------------------- camera -- */
      var fc = def.camera || {};
      var CAM = { yaw: 0, pitch: 0.2, dist: clamp(Number(fc.distance) || 5.2, 2.6, 12), h: clamp(Number(fc.height) || 1.5, 0.8, 5), userT: 9, pos: new THREE.Vector3(), look: new THREE.Vector3(), shake: 0, init: false };
      var camTmp = new THREE.Vector3();
      function camBlocked(x, y, z) {
        var g = cellAt(x, z); if (!g) return false;
        for (var i = 0; i < g.b.length; i++) { var b = g.b[i]; if (b.max.y > y - 0.3 && x > b.min.x && x < b.max.x && z > b.min.z && z < b.max.z && b.max.y - b.min.y > 2.2) return true; }
        return false;
      }
      function stepCam(dt) {
        if (!player) return;
        var fl = film && typeof film === 'object' ? film : null;
        var dist = fl ? clamp(fl.distance, -20, 20) : CAM.dist, hgt = fl ? fl.height : CAM.h;
        CAM.userT += dt;
        // behind you as you move, unless someone has just turned it
        if (player.speed > 1.2 && CAM.userT > 1.6 && !fl) face(CAM, player.yaw + PI, 1 - Math.exp(-1.6 * dt));
        var tx = player.x, ty = player.y + (fl && fl.look > 0.5 && fl.look < 2.2 ? fl.look : 1.4), tz = player.z;
        var cp = Math.cos(CAM.pitch), fx = -Math.sin(CAM.yaw) * cp, fz = -Math.cos(CAM.yaw) * cp;
        var side = fl ? fl.side || 0 : 0;
        var d = dist, x = tx - fx * d + Math.cos(CAM.yaw) * side, y = ty + hgt - 1.4 + Math.sin(CAM.pitch) * d * 0.6, z = tz - fz * d - Math.sin(CAM.yaw) * side;
        // pulled in, never through a wall
        for (var k = 1; k <= 8; k++) { var u = k / 8, sx = tx + (x - tx) * u, sy = ty + (y - ty) * u, sz = tz + (z - tz) * u; if (camBlocked(sx, sy, sz)) { var u2 = Math.max(0.15, (k - 1.3) / 8); x = tx + (x - tx) * u2; y = ty + (y - ty) * u2; z = tz + (z - tz) * u2; break; } }
        y = Math.max(y, groundAt(x, z) + 0.35);
        if (!CAM.init) { CAM.pos.set(x, y, z); CAM.look.set(tx, ty, tz); CAM.init = true; }
        var kk = 1 - Math.exp(-10 * dt);
        CAM.pos.lerp(camTmp.set(x, y, z), kk); CAM.look.lerp(camTmp.set(tx, ty, tz), 1 - Math.exp(-14 * dt));
        camera.position.copy(CAM.pos);
        CAM.shake = Math.max(0, CAM.shake - dt * 2.8);
        if (CAM.shake > 0) camera.position.add(camTmp.set((Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5)).multiplyScalar(CAM.shake * 0.16));
        camera.lookAt(CAM.look);
        var fov = fl ? fl.fov : (Number(fc.fov) || 55);
        if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
      }

      /* ------------------------------------------------------- GM drops -- */
      var COINMAX = 80, coins = [], cm = new THREE.InstancedMesh(coinGeo, [coinSide, coinFace, coinFace], COINMAX);
      cm.frustumCulled = false; cm.castShadow = false; scene.add(cm);
      for (var ci = 0; ci < COINMAX; ci++) coins.push({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, t: 0 });
      var cDummy = new THREE.Object3D();
      function drop(x, y, z, n) {
        for (var i = 0; i < n; i++) {
          var q = coins.filter(function (c) { return !c.on; })[0]; if (!q) return;
          var a = Math.random() * TAU, s = 1.5 + Math.random() * 2.5;
          q.on = true; q.x = x; q.y = y + 1; q.z = z; q.vx = Math.sin(a) * s; q.vz = Math.cos(a) * s; q.vy = 4 + Math.random() * 3; q.t = 0;
        }
      }
      function stepCoins(dt) {
        var any = false;
        for (var i = 0; i < COINMAX; i++) {
          var q = coins[i];
          if (!q.on) { cDummy.position.set(0, -999, 0); cDummy.scale.setScalar(0.0001); cDummy.updateMatrix(); cm.setMatrixAt(i, cDummy.matrix); continue; }
          any = true; q.t += dt;
          var gy = groundAt(q.x, q.z) + 0.45;
          if (player && player.alive !== false && !player.ko) {
            var dx = player.x - q.x, dz = player.z - q.z, d = Math.hypot(dx, dz);
            if (d < 3.6 && q.t > 0.45) { var pull = 22 * (1 - d / 3.6) + 6; q.vx += dx / (d || 1) * pull * dt; q.vz += dz / (d || 1) * pull * dt; }
            if (d < 0.8 && q.t > 0.35) { q.on = false; if (!demo) { gm++; SFX.coin(); } continue; }
          }
          q.vy -= 18 * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
          if (q.y < gy) { q.y = gy; q.vy = Math.abs(q.vy) > 2 ? -q.vy * 0.35 : 0; q.vx *= 0.8; q.vz *= 0.8; }
          if (q.t > 25) q.on = false;
          cDummy.position.set(q.x, q.y + Math.sin(q.t * 3) * 0.06, q.z); cDummy.rotation.set(0, q.t * 3.2, 0); cDummy.scale.setScalar(0.42); cDummy.updateMatrix(); cm.setMatrixAt(i, cDummy.matrix);
        }
        cm.instanceMatrix.needsUpdate = true; void any;
      }

      /* ------------------------------------------------------ the surf -- */
      // wading: spray kicked up round the shins, a ring of foam where the legs
      // go into the water, and the slosh of each step
      var SPN = 220, spPos = new Float32Array(SPN * 3), spVel = new Float32Array(SPN * 3), spLife = new Float32Array(SPN), spNext = 0;
      var spGeo = new THREE.BufferGeometry(); spGeo.setAttribute('position', new THREE.BufferAttribute(spPos, 3));
      var spTex = canvasTexture(32, 32, function (g, w, h) { var r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.5, 'rgba(255,255,255,.5)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, w, h); });
      var spray = new THREE.Points(spGeo, new THREE.PointsMaterial({ size: 0.075, map: spTex, color: '#EEF6FA', transparent: true, depthWrite: false, opacity: 0.9 }));
      spray.frustumCulled = false; scene.add(spray);
      for (var si0 = 0; si0 < SPN; si0++) spPos[si0 * 3 + 1] = -9999;
      var ringGeo = new THREE.RingGeometry(0.2, 0.36, 28).rotateX(-PI / 2), RINGS = [];
      function ringFor(a) {
        if (a.ring) return a.ring;
        var r = RINGS.filter(function (q) { return !q.who; })[0];
        if (!r) { if (RINGS.length >= 14) return null; r = { mesh: new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#F4FAFC', transparent: true, opacity: 0, depthWrite: false })), who: null }; r.mesh.renderOrder = 4; scene.add(r.mesh); RINGS.push(r); }
        r.who = a; a.ring = r; return r;
      }
      function splashes(a, dt) {
        var depth = a.wet, sp = a.speed + Math.hypot(a.kx, a.kz), sy = groundAt(a.x, a.z) + depth;
        var r = ringFor(a);
        if (r) { r.mesh.visible = true; r.mesh.position.set(a.x, sy + 0.01, a.z); var sc = 0.9 + Math.min(1.2, sp * 0.2) + Math.sin(t * 5 + a.id) * 0.06; r.mesh.scale.set(sc, 1, sc); r.mesh.material.opacity = Math.min(0.55, 0.2 + sp * 0.08) * smooth(0.015, 0.08, depth); }
        if (sp < 0.4) return;
        a.splashT = (a.splashT || 0) - dt;
        var n = Math.min(6, Math.round(sp * dt * 14 + Math.random()));
        for (var i = 0; i < n; i++) {
          var j = spNext++ % SPN, an = Math.random() * TAU, v = 0.6 + Math.random() * 1.2;
          spPos[j * 3] = a.x + Math.sin(an) * 0.22; spPos[j * 3 + 1] = sy + 0.02; spPos[j * 3 + 2] = a.z + Math.cos(an) * 0.22;
          spVel[j * 3] = Math.sin(an) * v + Math.sin(a.mdir) * sp * 0.3; spVel[j * 3 + 1] = 1.2 + Math.random() * (1 + sp * 0.35); spVel[j * 3 + 2] = Math.cos(an) * v + Math.cos(a.mdir) * sp * 0.3;
          spLife[j] = 0.45 + Math.random() * 0.35;
        }
        if (a === player && a.splashT <= 0 && audio && !demo) { a.splashT = 0.36 - Math.min(0.16, sp * 0.02); noiseBand(0.14, 0.05 + Math.min(0.06, depth * 0.1), 500, 2400); }
      }
      function stepSpray(dt) {
        for (var i = 0; i < SPN; i++) {
          if (spLife[i] <= 0) { spPos[i * 3 + 1] = -9999; continue; }
          spLife[i] -= dt; spVel[i * 3 + 1] -= 9.8 * dt;
          spPos[i * 3] += spVel[i * 3] * dt; spPos[i * 3 + 1] += spVel[i * 3 + 1] * dt; spPos[i * 3 + 2] += spVel[i * 3 + 2] * dt;
        }
        spGeo.attributes.position.needsUpdate = true;
        // a ring lets go of whoever has walked out of the water
        RINGS.forEach(function (r) { if (r.who && (r.who.wet <= 0.015 || actors.indexOf(r.who) < 0 || !r.who.g.visible)) { r.who.ring = null; r.who = null; r.mesh.visible = false; } });
      }

      /* -------------------------------------------------------- sounds -- */
      function thud(power) {
        if (!audio || demo) return;
        var ac = audio.ctx, t0 = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
        o.type = 'sine'; o.frequency.setValueAtTime(120 + power * 30, t0); o.frequency.exponentialRampToValueAtTime(45, t0 + 0.16);
        g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.5 + power * 0.25, t0 + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2);
        o.connect(g); g.connect(audio.fx); o.start(t0); o.stop(t0 + 0.22);
        noiseBand(0.09, 0.35 + power * 0.2, 2400, 500);
      }
      function whoosh() { if (audio && !demo) noiseBand(0.16, 0.12, 900, 2600); }
      var siren = null;
      function sirenOn(on) {
        if (!audio || demo) { if (siren) { siren.stop(); siren = null; } return; }
        if (on && !siren) {
          var ac = audio.ctx, o = ac.createOscillator(), lfo = ac.createOscillator(), lg = ac.createGain(), g = ac.createGain();
          o.type = 'sawtooth'; o.frequency.value = 760; lfo.type = 'square'; lfo.frequency.value = 1.4; lg.gain.value = 170; lfo.connect(lg); lg.connect(o.frequency);
          var f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 1.2;
          g.gain.value = 0; o.connect(f); f.connect(g); g.connect(audio.world); o.start(); lfo.start();
          siren = { g: g, stop: function () { g.gain.setTargetAtTime(0, ac.currentTime, 0.2); setTimeout(function () { try { o.stop(); lfo.stop(); } catch (x) {} }, 900); } };
        } else if (!on && siren) { siren.stop(); siren = null; }
      }
      function sirenLevel(d) { if (siren && audio) siren.g.gain.setTargetAtTime(clamp(0.16 * (1 - d / 120), 0, 0.16), audio.ctx.currentTime, 0.1); }

      /* ------------------------------------------------------ weapons -- */
      // Hidden weapons (the owner, 28 Sep: "he should be able to obtain hidden
      // weapons and use them"): street weapons lie about the map, leaning in an
      // alley, on a bin, under a lifeguard tower, glinting now and then for
      // whoever looks. Walk over one to take it (E swaps it for the one in your
      // hand); it swings harder and further than a fist, and wears out. A biker
      // or an officer put down may drop his. Melee only, as the owner chose.
      var WEAPONS = {
        bat:   { name: 'Bat',    power: [2, 2, 3],       reach: 1.75, rate: 1.2,  hits: 16 },
        pipe:  { name: 'Pipe',   power: [2, 2, 3],       reach: 1.7,  rate: 1.15, hits: 22 },
        baton: { name: 'Baton',  power: [1.5, 1.5, 2.5], reach: 1.55, rate: 1.4,  hits: 26 },
        chain: { name: 'Chain',  power: [2, 2, 2.5],     reach: 2.1,  rate: 1.1,  hits: 18 },
        sword: { name: 'Katana', power: [3, 3, 4.5],     reach: 1.95, rate: 1.3,  hits: 12 },
      };
      var WCHAIN = ['slash1', 'slash2', 'slash1'];
      var PICKS = [], HIDE = [], hideT = 0;
      var glintTex = canvasTexture(64, 64, function (g, w, h) {
        var r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.18, 'rgba(255,244,210,.7)'); r.addColorStop(1, 'rgba(255,240,200,0)');
        g.fillStyle = r; g.fillRect(0, 0, w, h);
        g.fillStyle = 'rgba(255,255,255,.9)'; g.fillRect(w / 2 - 1, 4, 2, h - 8); g.fillRect(4, h / 2 - 1, w - 8, 2);
      });
      var glintMat = new THREE.SpriteMaterial({ map: glintTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: '#FFF4D8' });
      function kindsTable() {
        var k = cfg.weapons && cfg.weapons.kinds, out = [];
        var base = k || { bat: 3, pipe: 3, chain: 2, baton: 2, sword: 1 };
        for (var n in base) if (WEAPONS[n] && +base[n] > 0) out.push([n, +base[n]]);
        return out.length ? out : [['bat', 1]];
      }
      function pickKind() {
        var tb = kindsTable(), sum = 0, i; for (i = 0; i < tb.length; i++) sum += tb[i][1];
        var r = Math.random() * sum; for (i = 0; i < tb.length; i++) { r -= tb[i][1]; if (r <= 0) return tb[i][0]; }
        return tb[0][0];
      }
      // a weapon lying (or leaning) where it was left
      function placePick(kind, x, z, o) {
        o = o || {};
        if (!player || !player.e.prop) return null;
        var w = player.e.prop({ kind: kind }), g = new THREE.Group(); g.add(w);
        var y = o.y != null ? o.y : groundAt(x, z);
        if (o.lean != null) {
          // stood on its end against a wall, tipped back into it
          w.position.y = 0.27; w.rotation.x = 0.32; g.rotation.y = o.lean;
        } else { w.rotation.z = PI / 2; w.position.y = kind === 'chain' ? 0.02 : 0.035; g.rotation.y = Math.random() * TAU; }
        g.position.set(x, y, z);
        g.traverse(function (m) { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
        var gl = new THREE.Sprite(glintMat.clone()); gl.scale.setScalar(0.001); gl.position.set(x, y + (o.lean != null ? 0.55 : 0.12), z); gl.renderOrder = 6;
        scene.add(g); scene.add(gl);
        var q = { kind: kind, x: x, z: z, y: y, obj: g, glint: gl, t: 0, ph: Math.random() * 3, hits: o.hits || WEAPONS[kind].hits, dropped: !!o.dropped, spot: o.spot || null };
        PICKS.push(q);
        return q;
      }
      function removePick(q) {
        scene.remove(q.obj); scene.remove(q.glint); q.glint.material.dispose();
        var i = PICKS.indexOf(q); if (i >= 0) PICKS.splice(i, 1);
        if (q.spot) q.spot.used = false;
      }
      // the places things get hidden: the map's own, or anywhere open
      function hideouts() {
        var m = OW.map, list = m && Array.isArray(m.hideouts) ? m.hideouts : [];
        HIDE = list.filter(function (h) { return isFinite(h.x) && isFinite(h.z) && h.x >= W.x0 && h.x <= W.x1 && h.z >= W.z0 && h.z <= W.z1 && (h.y != null || !solidAt(h.x, h.z, 0.04)); }).map(function (h) { return { x: +h.x, z: +h.z, y: h.y, lean: h.lean, used: false }; });
        if (HIDE.length < 6) for (var i = 0; i < 24; i++) { var p = openSpot((W.x0 + W.x1) / 2, (W.z0 + W.z1) / 2, 0, Math.max(W.x1 - W.x0, W.z1 - W.z0) / 2); HIDE.push({ x: p.x, z: p.z, used: false }); }
      }
      function hideOne(far) {
        var free = HIDE.filter(function (h) { return !h.used && (!player || Math.hypot(h.x - player.x, h.z - player.z) > far); });
        if (!free.length) return null;
        var h = free[Math.floor(Math.random() * free.length)]; h.used = true;
        return placePick(pickKind(), h.x, h.z, { y: h.y, lean: h.lean, spot: h });
      }
      function hideAll() {
        PICKS.slice().forEach(removePick);
        HIDE.forEach(function (h) { h.used = false; });
        if (!cfg.weapons || !player || !player.e.prop) return;
        for (var i = 0; i < cfg.weapons.count; i++) hideOne(6);
        hideT = 0;
      }
      function stepPicks(dt) {
        if (!cfg.weapons) return;
        // another turns up somewhere else now and then, out of sight
        hideT += dt;
        if (hideT > 30 && state === 'race') { hideT = 0; if (PICKS.filter(function (q) { return !q.dropped; }).length < cfg.weapons.count) hideOne(28); }
        PL.near = null;
        var nd = 1.15;
        for (var i = PICKS.length - 1; i >= 0; i--) {
          var q = PICKS[i]; q.t += dt;
          if (q.dropped && q.t > 45) { removePick(q); continue; }
          // a glint every few seconds, brief, as if the sun caught it
          var far = player ? Math.hypot(q.x - player.x, q.z - player.z) : 99;
          var c = (q.t + q.ph) % 3.2, g = far < 32 && c < 0.35 ? Math.sin(c / 0.35 * PI) : 0;
          q.glint.scale.setScalar(0.001 + g * 0.55); q.glint.material.opacity = g;
          if (player && !player.ko && far < nd && Math.abs(q.y - player.y) < 1.2) { nd = far; PL.near = q; }
        }
        // bare hands take the first one they come to
        if (PL.near && !PL.weapon && state === 'race' && PL.pickT <= 0 && PL.punching <= 0 && PL.rollT <= 0 && !player.ko) grab();
      }
      function grab() {
        var q = PL.near;
        if (!q || !player || player.ko || PL.pickT > 0 || PL.rollT > 0 || player.stun > 0) return;
        PL.pickT = 0.42; PL.picking = q; PL.punching = 0; PL.queued = false;
        player.yaw = yawTo(player, q.x, q.z);
        play(player, 'pickup', 1.6);
      }
      // the hand closes on it halfway through the reach
      function takePick(q) {
        if (PICKS.indexOf(q) < 0) return;
        var had = PL.weapon;
        removePick(q);
        PL.weapon = { kind: q.kind, hits: q.hits, max: WEAPONS[q.kind].hits };
        player.e.arm({ kind: q.kind });
        // a swap leaves the old one where the new one was
        if (had && had.hits > 0) placePick(had.kind, player.x + Math.sin(player.yaw + 1.2) * 0.7, player.z + Math.cos(player.yaw + 1.2) * 0.7, { hits: had.hits, dropped: true });
        say((had ? 'Swapped for ' : 'Found ') + (q.kind === 'sword' ? 'a katana' : 'a ' + WEAPONS[q.kind].name.toLowerCase()));
        emit('weapon', { kind: q.kind });
        SFX.coin();
        lastHud = '';
      }
      function breakWeapon() {
        var k = PL.weapon && PL.weapon.kind; if (!k) return;
        PL.weapon = null; player.e.arm(null); lastHud = '';
        say('The ' + WEAPONS[k].name.toLowerCase() + ' broke');
        if (audio && !demo) noiseBand(0.22, 0.2, 1800, 5200);
      }
      function disarm() { PL.weapon = null; if (player && player.e.arm) player.e.arm(null); lastHud = ''; }

      /* ---------------------------------------------------------- you -- */
      var PL = { combo: 0, until: 0, queued: false, rollT: 0, rollCool: 0, hitAt: -1, hitPower: 0, punching: 0, lock: null, regenT: 0, weapon: null, near: null, pickT: 0, picking: null, fightT: -9 };
      var CHAIN = [['jab', 1.7, 1, 1.05], ['cross', 1.55, 1, 1.1], ['hook', 1.35, 2, 1.2]];
      function punch() {
        if (!player || player.ko || player.stun > 0 || PL.rollT > 0 || PL.pickT > 0) return;
        if (PL.punching > 0) { if (PL.punching < PL.len * 0.65) PL.queued = true; return; }
        var step = DIR.time < PL.until ? (PL.combo + 1) % 3 : 0;
        startPunch(step);
      }
      function startPunch(step) {
        var c = CHAIN[step]; PL.combo = step; PL.queued = false; PL.fightT = DIR.time;
        // armed: the weapon's three swings, the third the hardest
        if (PL.weapon) { var wd = WEAPONS[PL.weapon.kind]; c = [WCHAIN[step], wd.rate * (step === 2 ? 0.85 : 1), wd.power[step], wd.reach]; }
        // square up to whoever is in front, close
        var best = null, bd = 3.4;
        actors.forEach(function (a) { if (a === player || a.ko || a.fade < 1) return; var d = dist(player, a); if (d < bd && (inFront(player, a, 1.9) || d < 1.6)) { bd = d; best = a; } });
        PL.lock = best;
        if (best) player.yaw = yawTo(player, best.x, best.z);
        // the weight goes into it: a half step in toward whoever it is for
        if (best && bd > 0.95) { player.kx += Math.sin(player.yaw) * 1.7; player.kz += Math.cos(player.yaw) * 1.7; }
        var ci = play(player, c[0], c[1]);
        PL.len = player.busy; PL.punching = PL.len; PL.hitAt = ci.contact / c[1]; PL.hitPower = c[2]; PL.reach = c[3];
        PL.until = DIR.time + PL.len + 0.55;
        whoosh();
      }
      function roll() {
        if (!player || player.ko || PL.rollT > 0 || PL.rollCool > 0) return;
        var mv = moveVec(); var yaw = mv.len > 0.1 ? Math.atan2(mv.x, mv.z) : player.yaw;
        player.yaw = yaw; play(player, 'roll', 1.35); PL.rollT = Math.min(0.62, player.busy); PL.rollCool = 0.9; PL.punching = 0; PL.queued = false; PL.pickT = 0; PL.picking = null;
      }
      function hitCheck() {
        var hit = 0;
        actors.forEach(function (a) {
          if (a === player || a.ko || a.fade < 1) return;
          var d = dist(player, a);
          if (d < PL.reach + a.r + 0.25 && (inFront(player, a, 1.05) || d < 0.9)) { hurt(a, PL.hitPower, player); hit++; }
        });
        if (hit) { thud(PL.hitPower); CAM.shake = Math.max(CAM.shake, 0.18 + PL.hitPower * 0.12); hitstop = 0.045 + PL.hitPower * 0.02; }
        // every blow wears the weapon down
        if (hit && PL.weapon) { PL.weapon.hits -= hit; lastHud = ''; if (PL.weapon.hits <= 0) breakWeapon(); }
      }
      function moveVec() {
        var fx = IN.f - IN.b, sx = IN.r - IN.l;
        if (IN.jOn) { fx = -IN.jy; sx = IN.jx; }
        var len = Math.min(1, Math.hypot(fx, sx));
        if (len < 0.08) return { x: 0, z: 0, len: 0 };
        // along the camera's view, flat on the ground
        var s = Math.sin(CAM.yaw), c = Math.cos(CAM.yaw);
        var x = -s * fx + c * sx, z = -c * fx - s * sx, n = Math.hypot(x, z) || 1;
        return { x: x / n * len, z: z / n * len, len: len };
      }

      /* ---------------------------------------------------- the fighting -- */
      function hurt(a, power, by) {
        if (a.ko) return;
        if (a === player) {
          if (invincible || demo || PL.rollT > 0) return;
          a.hp -= power; a.hurtT = 0; PL.regenT = 0; PL.fightT = DIR.time;
          CAM.shake = Math.max(CAM.shake, 0.5); thud(1.4);
          var py = by && by.x != null ? yawTo(by, a.x, a.z) : a.yaw + PI; a.kx += Math.sin(py) * 1.6; a.kz += Math.cos(py) * 1.6;
          PL.pickT = 0; PL.picking = null;
          if (a.hp <= 0) { a.hp = 0; knockout(a, by); return; }
          play(a, power >= 14 ? 'hitChest' : 'hitHead', 1.4); a.stun = 0.32; PL.punching = 0; PL.queued = false;
          return;
        }
        a.hp -= power; a.hurtT = 0;
        // the blow carries them: a slide back that slows, never a jump
        var pushed = a.boss ? 0.15 : 0.45 * power;
        var yaw = yawTo(by, a.x, a.z); a.kx += Math.sin(yaw) * pushed * 6; a.kz += Math.cos(yaw) * pushed * 6;
        if (a.hp <= 0) { knockout(a, by); return; }
        // a boss shrugs off a jab; a finisher staggers anyone; a heavy swing knocks them back
        if (!a.boss || power >= 2) { play(a, power >= 3 && !a.boss ? 'hit' : Math.random() < 0.5 ? 'hitHead' : 'hitChest', power >= 3 ? 1.15 : 1.3); a.stun = a.boss ? 0.3 : power >= 3 ? 0.8 : 0.55; if (a.token) { a.token = false; a.state = 'circle'; } else if (a.state === 'windup') a.state = 'circle'; }
        if (a.kind === 'civ') a.flee = 6;
        a.face = true;
      }
      function knockout(a, by) {
        a.ko = true; a.koT = 0; a.token = false; a.act = null; a.busy = 0; a.state = 'ko';
        if (a === player) { crashOpen(by); return; }
        DIR.kos++; DIR.koHeat++;
        if (a.weapon && cfg.weapons && cfg.weapons.drops && by === player && WEAPONS[a.weapon.kind] && Math.random() < 0.4 && a.e.arm) {
          var wk = a.weapon.kind; a.e.arm(null); a.weapon = null;
          placePick(wk, a.x + Math.sin(a.yaw + 1.4) * 0.6, a.z + Math.cos(a.yaw + 1.4) * 0.6, { hits: Math.ceil(WEAPONS[wk].hits * 0.5), dropped: true });
        }
        var sp = spec(a.kind === 'civ' ? 'thug' : a.kind);
        var n = a.kind === 'civ' ? 1 : sp.gm + Math.floor(DIR.heat / 3);
        drop(a.x, a.y, a.z, n);
        if (a.kind === 'civ') DIR.heatT += cfg.heatEvery * 0.12;
        if (a.boss) { say(a.name + ' is down'); hitstop = 0.35; CAM.shake = 0.8; DIR.boss = null; SFX.level(); }
        else say(a.kind === 'civ' ? 'Knocked out a bystander' : 'Knockout +' + n + ' GM');
        emit('knockout', { kind: a.kind, name: a.name, kos: DIR.kos, heat: DIR.heat });
        // the whole street sees it
        actors.forEach(function (b) { if (b.kind === 'civ' && !b.ko && dist(a, b) < 18) b.flee = 7; });
      }

      function stepPlayer(dt) {
        var a = player;
        if (a.ko) { a.speed = 0; return; }
        PL.rollCool = Math.max(0, PL.rollCool - dt);
        a.stun = Math.max(0, a.stun - dt); a.hurtT += dt; PL.regenT += dt;
        if (PL.regenT > 4 && a.hp < a.max) a.hp = Math.min(a.max, a.hp + 7 * dt);
        var mv = moveVec(), want = 0, dirX = 0, dirZ = 0;
        if (autopilot || demo) { var ap = pilot(dt); mv = ap; }
        // squared up when there is trouble near; the weapon's guard when armed
        var foe = 99; for (var fi = 0; fi < actors.length; fi++) { var fa = actors[fi]; if (fa !== a && fa.kind !== 'civ' && !fa.ko) foe = Math.min(foe, dist(a, fa)); }
        a.stance = foe < 9 || DIR.time - PL.fightT < 4 ? (PL.weapon ? 'guard' : 'fight') : 'idle';
        if (PL.pickT > 0) { PL.pickT -= dt; if (PL.pickT <= 0 && PL.picking) { takePick(PL.picking); PL.picking = null; } }
        if (PL.rollT > 0) {
          PL.rollT -= dt; want = 6.4; dirX = Math.sin(a.yaw); dirZ = Math.cos(a.yaw);
        } else if (a.stun > 0 || PL.pickT > 0) {
          want = 0;
        } else {
          var sprint = (IN.sprint || (autopilot || demo) && mv.sprint) && PL.punching <= 0;
          want = mv.len * (sprint ? 7.4 : 4.7) * (PL.punching > 0 ? 0.22 : 1);
          if (mv.len > 0.05) { dirX = mv.x / mv.len; dirZ = mv.z / mv.len; a.mdir = Math.atan2(dirX, dirZ); if (PL.punching <= 0) face(a, a.mdir, 1 - Math.exp(-14 * dt)); }
        }
        want *= wade(a);
        a.speed = damp(a.speed, want, want > a.speed ? 9 : 14, dt);
        a.x += dirX * a.speed * dt; a.z += dirZ * a.speed * dt;
        if (want === 0) { a.x += a.vx * dt; a.z += a.vz * dt; }
        collide(a);
        // the punch lands at its moment of contact; a queued one follows on
        if (PL.punching > 0) {
          var before = PL.len - PL.punching; PL.punching -= dt; var now = PL.len - PL.punching;
          if (PL.lock && !PL.lock.ko) face(a, yawTo(a, PL.lock.x, PL.lock.z), 1 - Math.exp(-18 * dt));
          if (before < PL.hitAt && now >= PL.hitAt) hitCheck();
          if (PL.queued && PL.punching < PL.len * 0.38) { startPunch((PL.combo + 1) % 3); }
          if (PL.punching <= 0) PL.punching = 0;
        }
      }

      /* ---------------------------------------------------- the others -- */
      var tokens = 0;
      function maxTokens() { return Math.min(4, 1 + Math.floor(DIR.heat / 2)); }
      function stepEnemy(a, dt) {
        var sp = a.sp, P = player;
        a.stun = Math.max(0, a.stun - dt); a.cool -= dt; a.t += dt;
        var d = dist(a, P), want = 0, dx = 0, dz = 0;
        if (P.ko) { a.state = 'idle'; a.stance = 'arms'; }
        if (a.stun > 0) { a.speed = damp(a.speed, 0, 12, dt); return; }
        switch (a.state) {
          case 'idle': want = 0; a.stance = 'arms'; if (!P.ko && d < 60) a.state = 'chase'; break;
          case 'chase': {
            a.stance = a.weapon ? 'guard' : 'fight';
            var ax = P.x + Math.sin(a.slot) * 2.8, az = P.z + Math.cos(a.slot) * 2.8, wp = steer(a, ax, az);
            dx = wp.x - a.x; dz = wp.z - a.z; var n = Math.hypot(dx, dz) || 1; dx /= n; dz /= n;
            want = d > 12 ? sp.speed * 1.15 : d > 5 ? sp.speed : sp.speed * 0.6;
            face(a, Math.atan2(dx, dz), 1 - Math.exp(-8 * dt));
            if (d < 3.4) { a.state = 'circle'; a.t = 0; }
            break;
          }
          case 'circle': {
            a.stance = a.weapon ? 'guard' : 'fight';
            if (d > 5) { a.state = 'chase'; break; }
            a.slot += dt * (a.id % 2 ? 0.35 : -0.35);
            var tx = P.x + Math.sin(a.slot) * 2.5, tz = P.z + Math.cos(a.slot) * 2.5;
            dx = tx - a.x; dz = tz - a.z; var m = Math.hypot(dx, dz);
            if (m > 0.2) { dx /= m; dz /= m; want = Math.min(1.6, m * 1.5); }
            face(a, yawTo(a, P.x, P.z), 1 - Math.exp(-10 * dt));
            if (a.cool <= 0 && tokens < maxTokens() && !P.ko) { a.token = true; tokens++; a.state = 'close'; a.t = 0; }
            break;
          }
          case 'close': {
            // step in to reach
            face(a, yawTo(a, P.x, P.z), 1 - Math.exp(-12 * dt));
            if (d > sp.reach + 0.25) { var wq = steer(a, P.x, P.z), dq = Math.hypot(wq.x - a.x, wq.z - a.z) || 1; dx = (wq.x - a.x) / dq; dz = (wq.z - a.z) / dq; want = sp.speed * 0.8; }
            else { a.state = 'windup'; a.t = 0; a.stance = a.weapon ? 'guard' : 'fight'; }
            if (a.t > 3) { a.token = false; tokens = Math.max(0, tokens - 1); a.state = 'circle'; a.cool = 1; }
            break;
          }
          case 'windup': {
            face(a, yawTo(a, P.x, P.z), 1 - Math.exp(-12 * dt));
            if (a.t > sp.windup) {
              var mvn = sp.moves[Math.floor(Math.random() * sp.moves.length)];
              var rate = /slash|dash/.test(mvn) ? 1.25 : 1.45;
              var ci = play(a, mvn, rate); a.strikeAt = ci.contact / rate; a.state = 'strike'; a.t = 0; a.struck = false;
              if (d > 0.9) { var sy = yawTo(a, P.x, P.z); a.kx += Math.sin(sy) * 1.5; a.kz += Math.cos(sy) * 1.5; }
            }
            break;
          }
          case 'strike': {
            if (!a.struck && a.t >= a.strikeAt) {
              a.struck = true;
              if (d < sp.reach + P.r + 0.2 && inFront(a, P, 0.9)) hurt(P, sp.dmg * (1 + (DIR.heat - 1) * 0.07), a);
              else whoosh();
            }
            if (a.t >= a.busy) { a.state = 'recover'; a.t = 0; }
            break;
          }
          case 'recover': {
            if (a.t > 0.35) { a.token = false; tokens = Math.max(0, tokens - 1); a.cool = Math.max(0.5, 2.2 - DIR.heat * 0.15) + Math.random() * 0.8; a.state = 'circle'; }
            break;
          }
        }
        want *= wade(a);
        if (want > 0.05 && (dx || dz)) a.mdir = Math.atan2(dx, dz);
        a.speed = damp(a.speed, want, 8, dt);
        a.x += dx * a.speed * dt; a.z += dz * a.speed * dt;
      }
      function stepCivilian(a, dt) {
        a.t += dt; a.flee = Math.max(0, a.flee - dt);
        var want = 0, dx = 0, dz = 0;
        if (a.flee > 0 && player) {
          dx = a.x - player.x; dz = a.z - player.z; var n = Math.hypot(dx, dz) || 1; dx /= n; dz /= n; want = 5.2; a.stance = 'idle';
          face(a, Math.atan2(dx, dz), 1 - Math.exp(-8 * dt));
        } else if (a.idleT > 0) {
          a.idleT -= dt;
        } else {
          if (!a.goal || Math.hypot(a.goal.x - a.x, a.goal.z - a.z) < 1.2 || a.t > 40) {
            if (Math.random() < 0.35 && a.goal) { a.idleT = 6 + Math.random() * 14; a.stance = ['phone', 'talk', 'arms', 'dance', 'idle'][Math.floor(Math.random() * 5)]; a.goal = null; return; }
            a.goal = openSpot(a.x, a.z, 12, 50); a.t = 0;
          }
          var wc = steer(a, a.goal.x, a.goal.z);
          dx = wc.x - a.x; dz = wc.z - a.z; var m = Math.hypot(dx, dz) || 1; dx /= m; dz /= m; want = a.walk || 1.35; a.stance = 'idle';
          face(a, Math.atan2(dx, dz), 1 - Math.exp(-4 * dt));
        }
        want *= wade(a);
        if (want > 0.05 && (dx || dz)) a.mdir = Math.atan2(dx, dz);
        a.speed = damp(a.speed, want, 6, dt);
        a.x += dx * a.speed * dt; a.z += dz * a.speed * dt;
      }
      // the sea: how deep it is round someone's legs, and how much it holds them back
      function waterAt(x, z) {
        var w = OW.map && OW.map.water; if (!w || x < w.from) return 0;
        try { return Math.max(0, +w.depthAt(x, z) || 0); } catch (e) { return 0; }
      }
      function wade(a) { return 1 - 0.55 * smooth(0.05, 0.6, a.wet || 0); }

      // spawning: out of sight round you, never on top of you. Building a
      // person takes a moment, so a crowd arriving at once (a boss and his
      // escort, a patrol car's officers) comes a person every fifth of a second
      var QUEUE = [], queueT = 0;
      function enqueue(kind, at, extra, then) { QUEUE.push({ kind: kind, at: at, extra: extra, then: then }); }
      function stepQueue(dt) {
        queueT -= dt;
        if (queueT > 0 || !QUEUE.length || !player || player.ko) return;
        var q = QUEUE.shift(), a = spawnKind(q.kind, q.at, q.extra);
        if (a && q.then) q.then(a);
        queueT = 0.2;
      }
      function spawnKind(kind, at, extra) {
        var sp = spec(kind), p = at || openSpot(player.x, player.z, 26, 42);
        var a = person(kind, sp, Object.assign({ x: p.x, z: p.z, hp: 0 }, extra || {}));
        if (!a) return null;
        var hp = sp.hp + Math.floor((DIR.heat - 1) * (kind === 'boss' ? 2.5 : 0.7)) + (kind === 'boss' ? (DIR.bossN - 1) * 5 : 0);
        a.hp = a.max = hp; a.sp = Object.assign({}, sp, { speed: sp.speed * (1 + Math.min(0.25, (DIR.heat - 1) * 0.03)), windup: sp.windup * Math.max(0.6, 1 - (DIR.heat - 1) * 0.05) });
        a.state = 'chase'; a.yaw = yawTo(a, player.x, player.z); a.boss = kind === 'boss';
        return a;
      }
      function spawnBoss() {
        DIR.bossN++;
        var sp = spec('boss'), n = DIR.bossN;
        enqueue('boss', null, null, function (a) {
          a.name = sp.names[(n - 1) % sp.names.length];
          DIR.boss = a;
          showBanner(a.name, 'is coming for you');
          SFX.level(); CAM.shake = 0.3;
          for (var i = 0; i < Math.min(3, 1 + Math.floor(n / 2)); i++) enqueue(DIR.heat >= 4 ? 'biker' : 'thug', openSpot(a.x, a.z, 1.5, 4));
        });
      }
      function dispatchPolice() {
        if (!OW.map || !OW.map.sedan) { for (var i = 0; i < 2; i++) enqueue('cop'); return; }
        // it comes up the street from whichever end has room: never through the roadblocks
        var L = OW.map.layout, zE = W.z1 - 6, dir = Math.random() < 0.5 ? 1 : -1;
        if ((player.z - dir * 110) * -dir > zE) dir = -dir;
        var lane = L.LANES.centerX + (dir > 0 ? -1.75 : 1.75);
        var car = OW.map.sedan('#101216', 'sedan'), obj = car.object;
        // a patrol car: white doors, a light bar, a lamp that blinks red and blue
        var white = new THREE.MeshStandardMaterial({ color: '#F4F4F2', roughness: 0.35, metalness: 0.1 });
        [-1, 1].forEach(function (sd) { var p = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.42, 1.9), white); p.position.set(sd * 0.93, 0.62, -0.1); obj.add(p); });
        var red = new THREE.MeshBasicMaterial({ color: new THREE.Color('#FF2020').multiplyScalar(6) }), blue = new THREE.MeshBasicMaterial({ color: new THREE.Color('#2050FF').multiplyScalar(6) });
        var bar = new THREE.Group(), lr = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.24), red), lb = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.24), blue);
        lr.position.x = -0.3; lb.position.x = 0.3; bar.add(lr, lb); bar.position.set(0, car.height + 0.07, -0.2); obj.add(bar);
        var light = new THREE.PointLight('#FF2020', 0, 18, 2); light.position.set(0, car.height + 0.4, 0); obj.add(light);
        obj.traverse(function (m) { if (m.isMesh) m.castShadow = true; });
        var z0 = clamp(player.z - dir * 110, -zE, zE), stopZ = clamp(player.z - dir * 11, -zE, zE);
        if ((stopZ - z0) * dir < 8) stopZ = z0 + dir * 8;
        obj.position.set(lane, groundAt(lane, z0), z0); obj.rotation.y = dir > 0 ? 0 : PI;
        scene.add(obj);
        DIR.police.push({ obj: obj, x: lane, z: z0, dir: dir, stopZ: stopZ, v: 17, state: 'drive', t: 0, lr: lr, lb: lb, light: light, len: car.length, cops: Math.min(4, 2 + Math.floor(DIR.heat / 4)) });
        say('Police on the way'); sirenOn(true);
      }
      function stepPolice(dt) {
        var any = false;
        for (var i = DIR.police.length - 1; i >= 0; i--) {
          var p = DIR.police[i]; p.t += dt;
          var on = Math.floor(p.t * 5) % 2;
          p.lr.visible = !!on; p.lb.visible = !on; p.light.color.set(on ? '#FF2020' : '#2050FF'); p.light.intensity = p.state === 'gone' ? 0 : 3;
          if (p.state === 'drive') {
            any = true;
            var left = (p.stopZ - p.z) * p.dir;
            p.v = left < 25 ? Math.max(0, left * 0.7) : 17;
            p.z += p.dir * p.v * dt;
            if (left < 0.4) {
              p.state = 'parked'; p.t = 0;
              W.boxes.push(p.box = { min: { x: p.x - 1, y: 0, z: p.z - p.len / 2 }, max: { x: p.x + 1, y: 1.5, z: p.z + p.len / 2 } }); buildGrid();
              for (var k = 0; k < p.cops; k++) enqueue('cop', { x: p.x + 2.2 + (k % 2) * 0.8, z: p.z + (k - p.cops / 2) * 1.4 });
            }
            // anyone in the road is run down
            actors.forEach(function (a) { if (!a.ko && Math.abs(a.x - p.x) < 1.1 && Math.abs(a.z - p.z) < p.len / 2 + 0.3 && p.v > 4) hurt(a, a === player ? 34 : 99, { x: p.x, z: p.z - p.dir * 3 }); });
          } else if (p.state === 'parked') {
            if (p.t < 4) any = true;
            if (p.t > 70 && Math.hypot(player.x - p.x, player.z - p.z) > 70) { scene.remove(p.obj); var bi = W.boxes.indexOf(p.box); if (bi >= 0) W.boxes.splice(bi, 1); buildGrid(); DIR.police.splice(i, 1); continue; }
          }
          p.obj.position.set(p.x, groundAt(p.x, p.z), p.z);
          if (p.state === 'drive' && player) sirenLevel(Math.hypot(player.x - p.x, player.z - p.z));
        }
        if (!any) sirenOn(false);
      }

      function heatUp() {
        DIR.heat++; DIR.heatT = 0; ctx.open.heat = DIR.heat;
        showBanner('Heat ' + DIR.heat, DIR.heat >= 3 ? 'The police are coming' : DIR.heat === 2 ? 'Bikers ride in' : 'They are coming');
        SFX.level();
        if (DIR.heat % 3 === 0) spawnBoss();
        if (DIR.heat >= 3) dispatchPolice();
        emit('heat', { heat: DIR.heat });
      }
      function showBanner(big, small) {
        banner.querySelector('b').textContent = big; banner.querySelector('span').textContent = small || '';
        bannerT = 2.6; banner.style.opacity = '1';
      }
      function stepDirector(dt) {
        if (!player || player.ko) return;
        DIR.heatT += dt;
        if (DIR.heatT >= cfg.heatEvery || DIR.koHeat >= 8) { DIR.koHeat = 0; heatUp(); }
        var enemies = actors.filter(function (a) { return a.kind !== 'civ' && !a.ko && a !== player; }).length;
        var target = Math.min(cfg.maxEnemies, 2 + Math.floor(DIR.heat * 1.6));
        DIR.spawnT -= dt;
        if (enemies < target && DIR.spawnT <= 0) {
          DIR.spawnT = Math.max(1.1, 4.5 - DIR.heat * 0.35);
          var r = Math.random(), kind = DIR.heat >= 2 && r < 0.35 ? 'biker' : DIR.heat >= 4 && r < 0.55 ? 'cop' : 'thug';
          if (QUEUE.length < 3) enqueue(kind);
        }
      }

      /* --------------------------------------------------------- pilot -- */
      // the runtime's own player, for the attract demo, the films and the checks:
      // it walks the street, goes for the nearest one, punches, rolls away when hurt
      var AP = { goal: null, t: 0 };
      function pilot(dt) {
        AP.t -= dt;
        var foe = null, fd = 40;
        actors.forEach(function (a) { if (a === player || a.ko || a.kind === 'civ' || a.fade < 1) return; var d = dist(player, a); if (d < fd) { fd = d; foe = a; } });
        // bare-handed, it goes for a weapon it can see before the trouble gets close
        if (!PL.weapon && cfg.weapons && fd > 7) {
          var wq = null, wd = 26;
          PICKS.forEach(function (q) { var d = Math.hypot(q.x - player.x, q.z - player.z); if (d < wd) { wd = d; wq = q; } });
          if (wq) { var ws = steer(player, wq.x, wq.z), wx0 = ws.x - player.x, wz0 = ws.z - player.z, wn0 = Math.hypot(wx0, wz0) || 1; return { x: wx0 / wn0, z: wz0 / wn0, len: 1, sprint: wd > 10 }; }
        }
        if (foe) {
          var wf = steer(player, foe.x, foe.z), dx = foe.x - player.x, dz = foe.z - player.z, n = Math.hypot(dx, dz) || 1;
          if (fd < 1.55) {
            if (player.hp < player.max * 0.25 && PL.rollCool <= 0 && Math.random() < 0.02) { roll(); return { x: -dx / n, z: -dz / n, len: 1 }; }
            if (PL.punching <= 0 || PL.punching < PL.len * 0.5) punch();
            player.yaw = Math.atan2(dx, dz);
            return { x: 0, z: 0, len: 0 };
          }
          var wx = wf.x - player.x, wz = wf.z - player.z, wn = Math.hypot(wx, wz) || 1;
          return { x: wx / wn, z: wz / wn, len: 1, sprint: fd > 14 };
        }
        if (!AP.goal || Math.hypot(AP.goal.x - player.x, AP.goal.z - player.z) < 2 || AP.t < 0) { AP.goal = openSpot(player.x, player.z, 18, 45); AP.t = 12; }
        var wg = steer(player, AP.goal.x, AP.goal.z), gx = wg.x - player.x, gz = wg.z - player.z, gn = Math.hypot(gx, gz) || 1;
        return { x: gx / gn, z: gz / gn, len: 0.55 };
      }

      /* ------------------------------------------------------ the frame -- */
      var sep = 1.05;
      function stepActors(dt) {
        tokens = actors.filter(function (a) { return a.token && !a.ko; }).length;
        for (var i = 0; i < actors.length; i++) {
          var a = actors[i];
          if (a === player) continue;
          if (a.ko) {
            a.koT += dt; a.speed = 0;
            if (a.koT > 7) { a.fade -= dt * 0.8; if (a.fade <= 0) { removeActor(a); i--; continue; } }
            continue;
          }
          if (a.kind === 'civ') stepCivilian(a, dt); else stepEnemy(a, dt);
        }
        // nobody stands inside anybody
        for (i = 0; i < actors.length; i++) for (var j = i + 1; j < actors.length; j++) {
          var p = actors[i], q = actors[j]; if (p.ko || q.ko) continue;
          var dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz), m = p.r + q.r + (p === player || q === player ? 0.15 : 0.25);
          if (d < m && d > 1e-4) { var push = (m - d) * 0.5; dx /= d; dz /= d; if (p !== player) { p.x -= dx * push; p.z -= dz * push; } else { q.x += dx * push; q.z += dz * push; } if (q !== player) { q.x += dx * push; q.z += dz * push; } else { p.x -= dx * push; p.z -= dz * push; } }
        }
        void sep;
        for (i = 0; i < actors.length; i++) {
          var b = actors[i];
          // a blow's momentum, sliding out
          if (b.kx || b.kz) { var kf = Math.exp(-6 * dt); b.x += b.kx * dt; b.z += b.kz * dt; b.kx *= kf; b.kz *= kf; if (Math.abs(b.kx) + Math.abs(b.kz) < 0.02) b.kx = b.kz = 0; }
          if (b === player || !b.ko) collide(b);
          b.wet = waterAt(b.x, b.z);
          if (b.wet > 0.015) splashes(b, dt);
          b.y = damp(b.y, groundAt(b.x, b.z), 16, dt);
          b.g.position.set(b.x, b.y, b.z); b.g.rotation.y = b.yaw;
          var far = Math.hypot(b.x - camera.position.x, b.z - camera.position.z);
          b.g.visible = far < 140 && b.fade > 0.02;
          if (!b.g.visible) continue;
          if (b.fade < 1) b.g.traverse(function (m) { if (m.isMesh) { m.material.transparent = true; m.material.opacity = b.fade; } });
          var shadowOn = far < 34;
          if (b.shadowOn !== shadowOn) { b.shadowOn = shadowOn; b.g.traverse(function (m) { if (m.isMesh) m.castShadow = shadowOn; }); }
          // far away, half the animation
          if (far > 55 && (frames + b.id) % 2) continue;
          if (b.busy > 0) { b.busy -= dt; if (b.busy <= 0) b.act = null; }
          var rel = b.speed > 0.25 ? b.mdir - b.yaw : 0;
          try { b.e.animate(t, far > 55 ? dt * 2 : dt, { speed: b.speed, brawl: { stance: b.stance, action: b.act, ko: b.ko, dir: rel } }); } catch (e) { fail('A person in the open world could not move: ' + (e && e.message || e)); b.e.animate = function () {}; }
        }
      }
      function openTick(dt) {
        var slow = state === 'crashed' ? 0.3 : 1;
        if (hitstop > 0) { hitstop -= dt; slow *= 0.15; }
        var sdt = state === 'paused' ? 0 : dt * slow;
        t += sdt;
        if (state === 'race') {
          DIR.time += sdt; raceTime = DIR.time;
          stepPlayer(sdt);
          stepDirector(sdt);
          stepQueue(sdt);
          stepPolice(sdt);
          if (demo && DIR.time > 75) startDemo();
        } else if (state === 'crashed') {
          crashT += dt;
          if (crashT > 2.6) showResults();
        } else if (state === 'results') {
          resultsT += dt; if (resultsT > 14) startDemo();
        } else if (state === 'title') {
          stepPolice(sdt);
        }
        if (state !== 'paused') { stepActors(sdt); stepCoins(sdt); stepPicks(sdt); stepSpray(sdt); }
        if (bannerT > 0) { bannerT -= dt; banner.style.opacity = String(clamp(bannerT, 0, 1)); }
        if (feedT > 0) { feedT -= dt; feed.style.opacity = String(clamp(feedT * 2, 0, 1)); }
        if (OW.map) { try { OW.map.update(sdt || dt * 0.2, camera); } catch (e) { fail('The map could not update: ' + (e && e.message || e)); OW.map.update = function () {}; } }
        if (typeof def.update === 'function') try { def.update(ctx, t, sdt); } catch (e) { fail('update() threw: ' + (e && e.message || e)); def.update = null; }
        stepParticles(sdt || dt * 0.25);
        stepWater(t);
        if (VK) VK.step(sdt || dt * 0.25);
        stepCam(dt);
        stepHud(); if (frames % 2 === 0) stepRadar();
      }

      /* ------------------------------------------------------ the states -- */
      function clearAll() {
        QUEUE.length = 0;
        actors.slice().forEach(function (a) { if (a !== player) removeActor(a); });
        DIR.police.forEach(function (p) { scene.remove(p.obj); if (p.box) { var bi = W.boxes.indexOf(p.box); if (bi >= 0) W.boxes.splice(bi, 1); } });
        DIR.police = []; buildGrid(); sirenOn(false);
        coins.forEach(function (q) { q.on = false; });
        made.thug = made.biker = made.cop = made.boss = 0;
      }
      function openReset() {
        clearAll();
        DIR.heat = 1; DIR.heatT = 0; DIR.spawnT = 2.5; DIR.bossN = 0; DIR.kos = 0; DIR.koHeat = 0; DIR.time = 0; DIR.boss = null; ctx.open.heat = 1;
        gm = 0; raceTime = 0; crashT = 0; bannerT = 0; hitstop = 0; assisted = autopilot || timeScale !== 1;
        PL.combo = 0; PL.punching = 0; PL.queued = false; PL.rollT = 0; PL.rollCool = 0; PL.regenT = 9; PL.pickT = 0; PL.picking = null; PL.near = null; PL.fightT = -9;
        disarm(); player.kx = player.kz = 0;
        var sp = SPAWN();
        player.x = sp.x; player.z = sp.z; player.yaw = sp.yaw; player.hp = player.max; player.ko = false; player.act = null; player.busy = 0; player.stun = 0; player.speed = 0; player.state = 'idle';
        CAM.yaw = sp.yaw + PI; CAM.pitch = 0.2; CAM.init = false; CAM.userT = 9;
        // the street's own people
        for (var i = 0; i < cfg.civilians; i++) {
          var c = person('civ', spec('civ') && null, { x: 0, z: 0 });
          if (!c) break;
          var p = openSpot(player.x, player.z, 8, 90);
          c.x = p.x; c.z = p.z; c.hp = c.max = 1; c.walk = 1.1 + Math.random() * 0.5; c.stance = ['phone', 'talk', 'idle', 'arms', 'dance'][i % 5]; c.idleT = Math.random() * 8; c.yaw = Math.random() * TAU;
        }
        // one of them already there, sizing you up
        spawnKind('thug', openSpot(player.x, player.z, 12, 16));
        hideAll();
        stepHud();
      }
      function SPAWN() {
        var s = Array.isArray(O.spawn) ? O.spawn : null;
        if (s) return { x: +s[0] || 0, z: +s[1] || 0, yaw: (+s[2] || 0) * PI / 180 };
        return { x: (W.x0 + W.x1) / 2, z: (W.z0 + W.z1) / 2, yaw: PI };
      }
      function crashOpen(by) {
        state = 'crashed'; crashT = 0; CAM.shake = 1; crashedInto = by && by.name ? by.name : '';
        SFX.crash(); emit('crash', { into: crashedInto });
      }
      var CONTROLS_OW = '<div class="how"><div><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> move &nbsp; <kbd>Shift</kbd> run &nbsp; <kbd>J</kbd> or click: punch (jab, cross, hook) &nbsp; <kbd>Space</kbd> roll &nbsp; <kbd>E</kbd> grab &nbsp; drag: look &nbsp; <kbd>P</kbd> pause</div>' +
        '<div>Survive. Knock them out and take their GM. Weapons are hidden about the streets: find one and it hits harder, until it breaks. Every minute the heat rises: more of them at once, each harder to put down, bikers, then the police, and a boss every third level.</div></div>';
      showStart = function () {
        demo = false; root.classList.remove('demo');
        openReset(); state = 'title'; showHud(false);
        showScreen('<h1>' + esc(meta.title || 'GameMog') + '</h1>' + (meta.tagline ? '<p>' + esc(meta.tagline) + '</p>' : '') + CONTROLS_OW + '<div class="go">Enter or tap to start</div>', startCountdown);
      };
      startCountdown = function () {
        demo = false; root.classList.remove('demo'); IN.f = IN.b = IN.l = IN.r = 0;
        hideScreen(); openReset(); state = 'race'; showHud(true);
        showBanner('Survive', 'Knock them out. Take their GM.');
        emit('start', {});
        SFX.tick(true);
      };
      startDemo = function () { hideScreen(); openReset(); demo = true; state = 'race'; root.classList.add('demo'); showHud(false); };
      reset = openReset;
      togglePause = function () {
        if (state === 'race') { state = 'paused'; paused = true; if (audio) audio.ctx.suspend(); var s = Math.floor(DIR.time); showScreen('<h1>Paused</h1><p>' + Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') + ' survived, ' + DIR.kos + ' knocked out, ' + gm + ' GM</p><div class="go">P or tap to carry on</div>', togglePause, 'bar'); }
        else if (state === 'paused') { hideScreen(); state = 'race'; paused = false; if (audio) audio.ctx.resume(); }
      };
      showResults = function () {
        state = 'results'; resultsT = 0; showHud(false);
        var s = Math.floor(DIR.time);
        showScreen(
          '<h1>Knocked out</h1><p>' + (crashedInto ? esc(crashedInto) + ' put you down.' : 'The street won.') + '</p>' +
          '<div class="stats"><div><b>' + Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') + '</b><small>Survived</small></div><div><b>' + DIR.kos + '</b><small>KOs</small></div><div><b>' + gm + '</b><small>GM</small></div><div><b>' + DIR.heat + '</b><small>Heat</small></div></div>' +
          '<div class="go">Enter, Space or tap to go again</div>', startCountdown, 'bar');
        try { GM.finish({ won: false, place: 0, timeMs: Math.round(DIR.time * 1000), score: Math.round(DIR.time * 10) + gm, level: DIR.heat, gm: gm, kos: DIR.kos, survival: true, assisted: assisted }); } catch (e) {}
      };

      OW.tick = openTick;
      OW.shadow = function () {};
      OW.state = function () {
        return {
          heat: DIR.heat, time: +DIR.time.toFixed(2), kos: DIR.kos, gm: gm, boss: DIR.boss ? { name: DIR.boss.name, hp: DIR.boss.hp, max: DIR.boss.max } : null,
          player: player ? { x: +player.x.toFixed(2), z: +player.z.toFixed(2), y: +player.y.toFixed(2), hp: +player.hp.toFixed(1), max: player.max, ko: player.ko, speed: +player.speed.toFixed(2), act: player.act && player.act.name, combo: PL.combo, stance: player.stance, wet: +(player.wet || 0).toFixed(2) } : null,
          weapon: PL.weapon ? { kind: PL.weapon.kind, hits: PL.weapon.hits, max: PL.weapon.max } : null,
          pickups: PICKS.map(function (q) { return { kind: q.kind, x: +q.x.toFixed(1), z: +q.z.toFixed(1), dropped: q.dropped }; }),
          enemies: actors.filter(function (a) { return a.kind !== 'civ' && a !== player; }).map(function (a) { return { kind: a.kind, name: a.name, hp: a.hp, max: a.max, state: a.state, ko: a.ko, d: player ? +dist(a, player).toFixed(1) : 0 }; }),
          civilians: actors.filter(function (a) { return a.kind === 'civ'; }).length, police: DIR.police.map(function (p) { return p.state; }),
          map: cfg.map, ready: OW.ready, colliders: { boxes: W.boxes.length, circles: W.circles.length },
        };
      };
      OW.debug = {
        spawn: function (kind) { return !!spawnKind(kind || 'thug', player ? openSpot(player.x, player.z, 3, 6) : null); },
        heat: function (h) { while (DIR.heat < h) heatUp(); return DIR.heat; },
        hurt: function (n) { hurt(player, n || 10, { name: 'the check' }); return player.hp; },
        punch: punch, roll: roll,
        police: function () { dispatchPolice(); return DIR.police.length; },
        map: function () { return OW.map; },
        // a weapon at your feet (or at x, z), for the checks and the films
        weapon: function (kind, x, z) { if (!player) return false; var k = WEAPONS[kind] ? kind : 'bat'; return !!placePick(k, x == null ? player.x + Math.sin(player.yaw) * 0.6 : +x, z == null ? player.z + Math.cos(player.yaw) * 0.6 : +z, { dropped: true }); },
        grab: function () { grab(); return !!PL.picking; },
        bounds: function () { return { x0: W.x0, x1: W.x1, z0: W.z0, z1: W.z1 }; },
        // stand the player somewhere, the camera looking along yaw (0 = north, -PI/2 = east, to the sea)
        place: function (x, z, yaw, pitch, free) {
          if (!player) return false;
          player.x = free ? +x : clamp(+x, W.x0, W.x1); player.z = free ? +z : clamp(+z, W.z0, W.z1); player.y = groundAt(player.x, player.z);
          if (free) player.free = true;
          if (yaw != null) { CAM.yaw = +yaw; player.yaw = +yaw + PI; }
          if (pitch != null) CAM.pitch = clamp(+pitch, -0.1, 0.9);
          CAM.init = false; CAM.userT = 0;
          return { x: player.x, z: player.z, y: player.y };
        },
      };

      /* ------------------------------------------------------- building -- */
      function finish() {
        buildGrid(); buildNav(); hideouts();
        var sp = SPAWN();
        player = makeActor('player', P0, { body: cfg.body, x: sp.x, z: sp.z, yaw: sp.yaw, hp: num(O.health, 100, 20, 1000), name: P0.name || 'You' });
        player.r = 0.34;
        OW.ready = true;
        startDemo();
      }
      var mapLib = cfg.map ? MAPS[cfg.map] : null;
      if (cfg.map && !mapLib) warn('open.map "' + cfg.map + '" is not a library map; the world stands on its own ground.');
      if (mapLib) {
        mapLib.build({ renderer: renderer, scene: scene, frame: function () { return new Promise(function (r) { setTimeout(r, 0); }); }, traffic: lowQ ? 2 : 3 })
          .then(function (m) {
            OW.map = m; ctx.open.map = m;
            W.x0 = m.walk.bounds.x0; W.x1 = m.walk.bounds.x1; W.z0 = m.walk.bounds.z0; W.z1 = m.walk.bounds.z1;
            W.boxes = W.boxes.concat(m.walk.boxes); W.circles = W.circles.concat(m.walk.circles);
            W.height = m.walk.heightAt;
            // the map's sun lights the people too, and its shadows follow the camera;
            // a soft fill from the sky and the street keeps a face in shadow readable
            renderer.shadowMap.autoUpdate = false;
            var fill = new THREE.HemisphereLight('#BFD6F2', '#C8A27A', 0.45); fill.userData.gmOpenFill = true; scene.add(fill);
            try { if (typeof def.onMap === 'function') def.onMap(ctx, m); } catch (e) { warn('onMap() threw: ' + (e && e.message || e)); }
            finish();
          })
          .catch(function (e) { fail('The map "' + cfg.map + '" could not be built: ' + (e && e.message || e)); try { console.error(e); } catch (x) {} finish(); });
      } else finish();
    }
