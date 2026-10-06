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
      var MAPS = { 'ocean-drive': typeof GameMogOceanDrive !== 'undefined' ? GameMogOceanDrive : null, city: typeof GameMogCity !== 'undefined' ? GameMogCity : null };
      var lowQ = quality === 'low';
      var cfg = {
        map: typeof O.map === 'string' ? O.map : null,
        heatEvery: num(O.heat && O.heat.every, 40, 15, 180),
        // what raises the heat and what it sends (open.heat.kos, max, bosses, police, escort, room; AI Alps, 5 Oct: a run
        // whose heat ran away with the takedowns, two bosses and their men at once at heat 12, was over in minutes). Each
        // left out is as it was: a level every 8 takedowns as well as by the clock, no top, a boss at every third level
        // with up to 3 men, the police from heat 3, all of them on top of maxEnemies
        heatKos: O.heat && O.heat.kos != null ? Math.round(num(O.heat.kos, 8, 0, 100)) : 8,
        heatMax: O.heat && O.heat.max != null ? Math.round(num(O.heat.max, 99, 1, 99)) : 0,
        heatBosses: !(O.heat && O.heat.bosses === false),
        heatPolice: !(O.heat && O.heat.police === false),
        heatEscort: O.heat && O.heat.escort != null ? Math.round(num(O.heat.escort, 3, 0, 3)) : 3,
        heatRoom: !!(O.heat && O.heat.room === true),
        maxEnemies: num(O.maxEnemies, lowQ ? 8 : 12, 2, 20),
        // (a crowd, open.civilians as an object, gives its number as count)
        civilians: num(O.civilians && typeof O.civilians === 'object' && !Array.isArray(O.civilians) ? O.civilians.count : O.civilians, lowQ ? 6 : 12, 0, 24),
        body: typeof O.body === 'string' ? O.body : 'human-athlete-male',
        // hidden weapons (the owner, 28 Sep): on unless the world says weapons: false
        // a goal (the owner, 28 Sep: "you need 10000 GM to purchase the vaccine"): reach it
        // and the run ends in the world's closing scene, won
        // always a goal (the owner, 1 Oct): 10,000 GM unless the world names its own
        goal: { gm: O.goal && +O.goal.gm > 0 ? num(O.goal.gm, 10000, 50, 1e7) : 10000, title: O.goal && typeof O.goal.title === 'string' ? O.goal.title.slice(0, 40) : 'Mission complete', text: O.goal && typeof O.goal.text === 'string' ? O.goal.text.slice(0, 200) : '' },
        // no GM (the owner, 1 Oct, for MogDune; also a creator's option): no coins, no goal,
        // the board ranks the time survived and then the takedowns
        coins: O.coins !== false && !(OPTS && OPTS.coins === false),
        // the hero's own weapon (MogDune's staff): always in hand, never worn out
        // how the hero fights bare-handed: freeflow (Spiderbench's moves, kicks and a dash) unless the world asks for
        // a boxer's punches
        fight: O.fight === 'boxing' ? 'boxing' : 'freeflow',
        // a hero who only punches (open.kicks: false; AI Alps, the owner 4 Oct: "no kicks. just an array of punches"):
        // no kick anywhere, the chain widened with the boxer's blows, a held attack a haymaker, the finisher a punch
        kicks: O.kicks !== false,
        // every landed punch made to connect (the owner, 5 Oct, on the first Mog of AI Alps: "punches don't feel
        // satisfying like are connecting and giving me the feeling of a hit"): on for the punch-only family (open.kicks:
        // false) and for any world that asks (open.impact: true); open.impact: false keeps it off (the impact, below)
        impact: O.impact === true || (O.kicks === false && O.impact !== false),
        // a hero who never leaves the ground (open.jump: false; "no jumping"): Space, K and JUMP do nothing, and the
        // air game, where he rises with the man he launched, is off
        jump: O.jump !== false,
        // a hero who never flips or rolls (open.dodge: false): no dodge, no counter, and no warning that says to dodge
        dodge: O.dodge !== false,
        // a tank (open.tank: true, or { block: 0.4 }; "He walks through hits and blocks with his forearms"): no shove and
        // no flinch from an ordinary blow, and one from in front of him lands on his forearms for a fraction of its harm
        // (true or an object only, the two the game page's controls line knows: a stray truthy value is no tank)
        tank: O.tank === true || (O.tank && typeof O.tank === 'object') ? { block: num(O.tank.block, 0.4, 0, 1) } : null,
        heroWeapon: O.hero && O.hero.weapon ? String(typeof O.hero.weapon === 'object' ? O.hero.weapon.kind : O.hero.weapon) : null,
        weapons: O.weapons === false ? null : (function (w) {
          w = w && typeof w === 'object' ? w : {};
          // the world's own places for them (open.weapons.spots; AI Alps' bottles on its bars and tables): only there,
          // a spot's own kind if it names one, stood upright on a bar top (stand) at its height; then a party's worth
          // (count up to 60) and how soon a taken one is replaced (every, seconds)
          var fin = function (v) { return typeof v === 'number' && isFinite(v); };
          var spots = Array.isArray(w.spots) ? w.spots.slice(0, 200).filter(function (s) { return s && fin(s.x) && fin(s.z); }).map(function (s) {
            return { x: s.x, z: s.z, y: fin(s.y) ? s.y : null, kind: typeof s.kind === 'string' ? s.kind : null, stand: !!s.stand, lean: fin(s.lean) ? s.lean : null, yaw: fin(s.yaw) ? s.yaw : null };
          }) : [];
          // (with spots, every one of them is filled unless the world says how many)
          var out = { count: num(w.count, spots.length ? Math.min(60, spots.length) : 8, 0, spots.length ? 60 : 30), kinds: w.kinds && typeof w.kinds === 'object' ? w.kinds : null, drops: w.drops !== false };
          if (spots.length) out.spots = spots;
          if (w.every != null) out.every = num(w.every, 30, 3, 600);
          return out;
        })(O.weapons),
        // a story told as the GM comes in (open.story; AI Alps, the owner 4 Oct: "with a Cut scene explaining the next
        // level mission every 1500 GM", and "One party, rising stakes"): each beat is a scene in the intro's shots at its
        // GM (or every `every` GM, in order), then the run goes on where it was with a new objective, the heat at least
        // `heat` and, if it says so, a boss on his way
        story: (function (s) {
          if (!s || typeof s !== 'object' || !Array.isArray(s.beats) || !s.beats.length) return null;
          var line = function (v, n) { return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : ''; };
          var every = s.every != null ? num(s.every, 1500, 50, 1e7) : 0, beats = [];
          s.beats.slice(0, 40).forEach(function (b, i) {
            if (!b || typeof b !== 'object') return;
            var at = +b.gm > 0 ? num(b.gm, 1500, 1, 1e7) : every * (i + 1);
            if (!(at > 0)) return;
            beats.push({ gm: at, shots: Array.isArray(b.shots) ? b.shots.slice(0, 24) : [], objective: line(b.objective, 80), banner: line(b.banner, 40),
              heat: b.heat != null ? Math.round(num(b.heat, 1, 1, 12)) : 0, boss: typeof b.boss === 'string' && b.boss.trim() ? line(b.boss, 30) : b.boss ? true : null });
          });
          beats.sort(function (p, q) { return p.gm - q.gm; });
          // (how long a beat that is due waits for a boss who is on him or on his way, seconds: story.wait, 0 to 120)
          return beats.length ? { beats: beats, objective: line(s.objective, 80), wait: s.wait != null ? num(s.wait, 20, 0, 120) : 20 } : null;
        })(O.story),
        // a crowd the world dresses and places (open.civilians as an object; AI Alps, the owner 4 Oct: "he can pick up
        // bottles, glasses and beat club goers over the head", and "One party, rising stakes: all the action stays at the
        // DJ party"): its look (or crew.civ's), what they do where they stand (stances, by weight), the zones they stand in
        // (a dance floor facing the booth, a bar), whether they move about (wander), and a share of the trouble that comes
        // out of the crowd (turn). A plain number is the street's people as they always were
        crowd: O.civilians && typeof O.civilians === 'object' && !Array.isArray(O.civilians) ? (function (c) {
          var fin = function (v) { return typeof v === 'number' && isFinite(v); }, word = function (v) { return typeof v === 'string' && /^[A-Za-z][A-Za-z0-9]{0,23}$/.test(v) ? v : null; };
          var civ = O.crew && O.crew.civ && typeof O.crew.civ === 'object' ? O.crew.civ : null;
          var st = {}, any = false;
          if (c.stances && typeof c.stances === 'object') Object.keys(c.stances).slice(0, 16).forEach(function (k) { var w = +c.stances[k]; if (word(k) && w > 0 && isFinite(w)) { st[k] = Math.min(100, w); any = true; } });
          // (a crowd that names no stances stands about as the street's people do between walks)
          if (!any) st = { phone: 1, argue: 1, arms: 1, shift: 2, dance: 1 };
          var zones = Array.isArray(c.zones) ? c.zones.slice(0, 16).filter(function (z) { return z && fin(z.x) && fin(z.z); }).map(function (z) {
            return { x: z.x, z: z.z, r: num(z.r, 4, 0.5, 60), count: z.count != null && isFinite(+z.count) ? Math.round(num(z.count, 0, 0, 24)) : null, stance: word(z.stance),
              face: Array.isArray(z.face) && fin(z.face[0]) && fin(z.face[1]) ? [z.face[0], z.face[1]] : null };
          }) : [];
          var tk = c.turn && typeof c.turn === 'object' ? c.turn : null;
          return { look: typeof c.look === 'function' ? c.look : civ && typeof civ.look === 'function' ? civ.look : null, stances: st, zones: zones, wander: c.wander !== false,
            turn: tk ? { kind: tk.kind === 'biker' || tk.kind === 'cop' ? tk.kind : 'thug', share: num(tk.share, 0.5, 0, 1) } : null };
        })(O.civilians) : null,
        // footsteps (open.steps: 'snow'; AI Alps' terrace): a crunch under the hero at his stride, and quieter under
        // anyone walking near him. Nothing is heard underfoot in a world without it
        steps: O.steps === 'snow' ? 'snow' : null,
        // every material compiled and every texture on the graphics card before the world is ready (open.warm: true; AI
        // Alps' glints, shards and beams), as a library map's are, so nothing stalls a frame the first time it is seen
        warm: O.warm === true,
        // people far from the camera drawn without the face's small parts (open.lod: true, or the metres from which; AI
        // Alps' party): the eyeballs, brows and lashes are a pixel or two there, and each is a draw of its own
        lod: O.lod === true ? 12 : typeof O.lod === 'number' && isFinite(O.lod) && O.lod > 0 ? num(O.lod, 12, 4, 80) : 0,
        // how a knockout's coins fly (open.coinFly: 'low'; AI Alps' frames: they arced up into the chase camera and
        // filled the frame as the man dropped): low along the ground, away from the camera, and to the hero at his waist
        coinFly: O.coinFly === 'low' ? 'low' : null,
      };
      if (!cfg.coins) cfg.goal = null;
      // no GM, no story told by it; and the goal comes first: a beat at or past it never plays
      if (!cfg.coins) cfg.story = null;
      if (cfg.story && cfg.goal) { cfg.story.beats = cfg.story.beats.filter(function (b) { return b.gm < cfg.goal.gm; }); if (!cfg.story.beats.length) cfg.story = null; }
      var PI = Math.PI, TAU = PI * 2;
      OW = { ready: false, tick: null, shadow: null, state: null, map: null };
      // scratch for the map's hooks (its cars' pushes, the player as the street sees them)
      var V3A = new THREE.Vector3(), V3B = new THREE.Vector3(), mapFeed = new THREE.Vector3();
      ctx.open = { map: null, heat: 1 };
      // the words the screens use, for a fight on foot (a derby has its own)
      var TX = { kos: 'KOs', kod: 'knocked out', health: 'Health', down: 'Knocked out', by: ' put you down.', won: 'The street won.' };
      /*@include derby.js*/
      // the traversal (open.traversal): Spiderbench's, with its author's permission (lib/runtime/traversal);
      // its levels (roofs as ground, crews who climb, falls) are climb.js's
      /*@include climb.js*/
      /*@include trav.js*/
      if (DERBY) TX = { kos: 'Wrecks', kod: 'wrecked', health: 'Armor', down: 'Wrecked', by: ' wrecked you.', won: 'The derby won.' };
      // a world's own words for them (MogDune: "Takedowns", "The desert won.")
      if (O.words && typeof O.words === 'object') for (var tk in TX) if (typeof O.words[tk] === 'string' && O.words[tk].trim()) TX[tk] = O.words[tk].replace(/[<>&]/g, '').slice(0, 40);

      /* ---------------------------------------------------------- place -- */
      // where you can walk: bounds, solid boxes and circles (trunks, posts),
      // and the ground's height; a map brings its own, a world adds to them
      var W = { x0: -60, x1: 60, z0: -60, z1: 60, boxes: [], circles: [], height: function () { return 0; } };
      if (O.bounds && Array.isArray(O.bounds.x) && Array.isArray(O.bounds.z)) { W.x0 = +O.bounds.x[0]; W.x1 = +O.bounds.x[1]; W.z0 = +O.bounds.z[0]; W.z1 = +O.bounds.z[1]; }
      // a world's own ground need not be flat (MogDune's dunes): open.ground(x, z) is its height
      if (typeof O.ground === 'function' && !O.map) W.height = O.ground;
      ctx.solid = function (s) {
        if (!s) return;
        if (s.isObject3D) { var bb = new THREE.Box3().setFromObject(s); W.boxes.push({ min: bb.min.clone(), max: bb.max.clone() }); return; }
        if (s.r != null) W.circles.push({ x: +s.x, z: +s.z, r: +s.r });
        else if (s.min && s.max) W.boxes.push({ min: { x: +s.min.x, y: s.min.y == null ? 0 : +s.min.y, z: +s.min.z }, max: { x: +s.max.x, y: s.max.y == null ? 3 : +s.max.y, z: +s.max.z } });
      };
      // the ones the world registered while it built (v1.js): in, before the grid is built and anyone moves
      var early = typeof EARLY_SOLIDS !== 'undefined' ? EARLY_SOLIDS.splice(0) : [];
      early.forEach(function (s) { try { ctx.solid(s); } catch (e) { warn('ctx.solid() was given something it could not use: ' + (e && e.message || e)); } });
      OW.early = early.length;
      var GRID = null, CELL = 8;
      function buildGrid() {
        GRID = {};
        function add(key, kind, c) { var g = GRID[key] || (GRID[key] = { b: [], c: [] }); g[kind].push(c); }
        W.boxes.forEach(function (b) {
          if (b.max.y - Math.max(b.min.y, -1) < 0.35 || b.max.y < 0.3) return;   // kerbs and steps are walked over
          // filed a metre wide of its walls, so a body against one, in the next cell, still finds it
          for (var gx = Math.floor((b.min.x - 1) / CELL); gx <= Math.floor((b.max.x + 1) / CELL); gx++)
            for (var gz = Math.floor((b.min.z - 1) / CELL); gz <= Math.floor((b.max.z + 1) / CELL); gz++) add(gx + ',' + gz, 'b', b);
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
        if (a.ghost) return;
        if (!a.free) { a.x = clamp(a.x, W.x0 + a.r, W.x1 - a.r); a.z = clamp(a.z, W.z0 + a.r, W.z1 - a.r); }
        var g = cellAt(a.x, a.z); if (!g) return;
        for (var i = 0; i < g.c.length; i++) {
          var c = g.c[i], dx = a.x - c.x, dz = a.z - c.z, d = Math.hypot(dx, dz), m = c.r + a.r;
          if (d < m && d > 1e-5) { a.x = c.x + dx / d * m; a.z = c.z + dz / d * m; }
        }
        // in a jump, whatever is lower than the feet passes under them
        var feet = a === player ? (climbOn() ? TRV.y + 0.3 : PL.air > 0 ? groundAt(a.x, a.z) + PL.air : -Infinity) : climbOn() && a.fy != null ? a.fy + 0.3 : -Infinity;
        for (i = 0; i < g.b.length; i++) {
          var b = g.b[i]; if (b.max.y < feet) continue;
          var cx = clamp(a.x, b.min.x, b.max.x), cz = clamp(a.z, b.min.z, b.max.z), ex = a.x - cx, ez = a.z - cz, e = Math.hypot(ex, ez);
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
        // up on a roof the way is open: the street's map is for the street
        if (climbOn() && a.fy != null && a.fy - groundAt(a.x, a.z) > 1) { a.path = null; return { x: tx, z: tz }; }
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
        if (DERBY) return derbySpot(cx, cz, r0, r1);
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
        // A library person other than the hero is drawn only where some of them could be seen (or could cast a shadow
        // into the view): each skinned mesh carries a bound round the whole body in any pose (v1.js hBound), the gear and
        // the weapon their own shapes'. Before, every person was drawn every frame wherever the camera looked, twice with
        // the shadows: a party of 22 and the crew behind the hero cost half the frame's draw calls. Bodies the runtime
        // cannot bound (a creature, a world's own, a car) are drawn always, as before
        var cull = kind !== 'player' && typeof ent.dispose === 'function';
        ent.object.traverse(function (m) { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = cull && (!m.isSkinnedMesh || !!m.boundingSphere); } });
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
        // what a library person alone owns (their materials, gear, bone texture, a weapon's trail) goes with them: the
        // graphics card's memory grew by four shapes and a texture for every person ever removed (v1.js dispose)
        if (a !== player && a.e && typeof a.e.dispose === 'function') { try { a.e.dispose(); } catch (e) {} }
        var i = actors.indexOf(a); if (i >= 0) actors.splice(i, 1);
        // a swing never turns you toward someone who has gone
        if (PL && PL.lock === a) PL.lock = null;
      }
      function creatureTiming(e, name) { var k = GameMogCreatures.kindOf(name), m = (e.timing && e.timing[k]) || GameMogCreatures.timing[k]; return { duration: m.duration, contact: m.contact }; }
      function play(a, name, rate) {
        a.act = { name: name, id: ++ACTID, rate: rate || 1 }; var ci = a.creature ? creatureTiming(a.e, name) : clipInfo(a.body, name); a.busy = ci.duration / (rate || 1);
        // the traversal animates the hero: the move plays over it, once
        // (from the start every time: a blow on the same clip as the one before, a hook then a haymaker, swings again)
        if (a === player && travOn()) TRAV.oneShot(name, { timeScale: rate || 1, restart: true });
        return ci;
      }
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
      // a party's weapons named by a word (crew.<kind>.weapon: 'bottle', or a look's): the prop itself, as { kind } is
      // (any other word is left as it was)
      var PARTYW = { bottle: 1, magnum: 1, glass: 1, bucket: 1 };
      function crewWeapon(w) { return typeof w === 'string' && PARTYW[w] ? { kind: w } : w; }
      function spec(kind) {
        var k = KIND[kind] || KIND.thug, w = CREW[kind] || {};
        return {
          hp: num(w.hp, k.hp, 1, 60), dmg: num(w.damage, k.dmg, 1, 60), speed: num(w.speed, k.speed, 1.5, 7), reach: num(w.reach, k.reach, 0.8, 2.6),
          windup: num(w.windup, k.windup, 0.25, 1.5), moves: Array.isArray(w.moves) && w.moves.length ? w.moves : k.moves, gm: num(w.gm, k.gm, 0, 60),
          weapon: w.weapon === null ? null : (crewWeapon(w.weapon) || k.weapon || null), names: Array.isArray(w.names) && w.names.length ? w.names : (typeof w.name === 'string' ? [w.name] : k.names),
          look: typeof w.look === 'function' ? w.look : null, body: typeof w.body === 'string' ? w.body : null, boss: !!k.boss,
          // anything that is not a person (the owner, 1 Oct): a creature from the kit, or the world's own body
          make: typeof w.body === 'function' ? w.body : w.body && typeof w.body === 'object' ? function (c, i) { return c.assets.creature(Object.assign({}, w.body, { seed: i })); }
            // a car (a derby, open.vehicle): options for the car kit, or a function returning them
            : w.car ? function (c, i, heat) { return c.assets.car(typeof w.car === 'function' ? w.car(c, i, heat) || {} : Object.assign({}, w.car)); }
            : DERBY && kind !== 'civ' ? function (c, i) { return c.assets.car(derbyDefaultCar(kind, i)); } : null,
          ranged: readRanged(w.ranged),
          // in a world with the traversal (open.traversal): the share of this crew who climb walls after you
          climb: w.climb === true ? 1 : num(w.climb, 0, 0, 1),
        };
      }
      // shots: fireballs, bolts, spit (open.crew.<kind>.ranged)
      function readRanged(r) {
        if (!r) return null;
        if (r === true) r = {};
        return { every: num(r.every, 3, 0.8, 20), range: num(r.range, 16, 4, 40), speed: num(r.speed, 15, 4, 60), damage: num(r.damage, 9, 1, 60),
          size: num(r.size, 0.28, 0.08, 1.2), color: typeof r.color === 'string' ? r.color : '#7CFF4F', keep: r.keep !== false, melee: r.melee !== false };
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
        if (DERBY) return sp && sp.make ? derbyCrewCar(kind, sp, i, extra) : null;
        if (sp && sp.look) { try { look = sp.look(ctx, i, DIR.heat); } catch (e) { warn('open.crew.' + kind + '.look() threw: ' + (e && e.message || e)); } }
        var o = Object.assign({}, dressDefault(kind, i), look || {});
        var weapon = crewWeapon(o.weapon !== undefined ? o.weapon : sp && sp.weapon);
        if (weapon) o.weapon = weapon; else delete o.weapon;
        // a creature, or any body the world builds: { object, animate, height?, radius?, timing? }
        if (sp && sp.make) {
          var own = null;
          try { own = sp.make(ctx, i, DIR.heat); } catch (e) { warn('open.crew.' + kind + '.body() threw: ' + (e && e.message || e)); }
          if (own && own.object && own.object.isObject3D && typeof own.animate === 'function') {
            var ca = makeActor(kind, own, Object.assign({ body: 'creature', name: own.name || (sp.names[i % sp.names.length]), radius: num(own.radius, 0.45, 0.2, 2) }, extra || {}));
            ca.h = num(own.height, 1.8, 0.3, 12);
            ca.creature = true;
            return ca;
          }
          if (own) warn('open.crew.' + kind + '.body() must return { object, animate }; a person stands in.');
        }
        var body = (look && look.body) || (sp && sp.body) || (kind === 'civ' ? (i % 2 ? 'human-athlete-female' : 'human-athlete-male') : cfg.body);
        if (!ASSETS[body]) body = ASSETS[cfg.body] ? cfg.body : Object.keys(ASSETS).filter(function (k) { return ASSETS[k].json && ASSETS[k].json.kind === 'human'; })[0];
        if (!body) return null;
        var ent = ctx.assets.human(body, o);
        if (!ent) return null;
        // how they walk: the street's cool walk, a big man's roll, a woman's walk, or an everyday walk
        var fem = /female/.test(body), gait = (look && look.gait) || (fem ? 'walkF' : kind === 'thug' ? 'walkCool' : kind === 'biker' || kind === 'boss' ? 'walkHeavy' : kind === 'civ' ? ['walk', 'walk', 'walkCool'][i % 3] : 'walk');
        var act = makeActor(kind, ent, Object.assign({ body: body, name: (look && look.name) || (sp ? sp.names[i % sp.names.length] : ''), weapon: o.weapon || null }, extra || {}));
        act.h = clamp(Number(o.height) || 1.8, 1.3, 2.6);
        act.gait = gait;
        return act;
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
        // in a row: the race HUD's right:14px would slide the GM board onto the KOs
        '#gm .owr .board{position:relative;top:0;right:auto}',
        // the boss's bar in a row of its own under the stats, never across them
        '#gm .boss{position:absolute;top:calc(' + TOP + ' + 78px);left:50%;transform:translateX(-50%);width:min(420px,56vw);text-align:center;display:none}',
        '#gm .boss b{display:block;font-size:15px;letter-spacing:.2em;text-transform:uppercase;margin-bottom:6px;text-shadow:0 1px 8px rgba(0,0,0,.6)}',
        '#gm .boss .hp{height:9px;border-radius:5px;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.25);overflow:hidden}',
        '#gm .boss .hp i{display:block;height:100%;width:100%;background:#FF4040;box-shadow:0 0 14px rgba(255,64,64,.7)}',
        '#gm .radar{position:absolute;left:calc(14px + env(safe-area-inset-left,0px));bottom:calc(14px + env(safe-area-inset-bottom,0px));width:156px;height:156px;border-radius:50%;' + GLASS + ';overflow:hidden}',
        '#gm .radar canvas{width:100%;height:100%;display:block}',
        '#gm.touch .radar{width:112px;height:112px;bottom:auto;top:calc(' + TOP + ' + 104px)}',
        '#gm .ow .wp{display:none;margin-top:9px;align-items:center;gap:8px}',
        '#gm .ow .wp b{font-size:12px;letter-spacing:.18em;text-transform:uppercase;min-width:54px}',
        '#gm .ow .wp span{flex:1;height:5px;border-radius:3px;background:rgba(255,255,255,.14);overflow:hidden}',
        '#gm .ow .wp span i{display:block;height:100%;width:100%;background:#FFD34D;box-shadow:0 0 8px rgba(255,211,77,.7)}',
        // focus (stage 3): three bars that fill with the fight, spent on a finisher or a heal
        '#gm .ow .fo{display:flex;align-items:center;gap:6px;margin-top:8px}',
        '#gm .ow .fo small{margin:0 4px 0 0;min-width:44px}',
        '#gm .ow .fo i{flex:1;height:7px;transform:skewX(-18deg);background:rgba(255,255,255,.14);overflow:hidden;border-radius:1px}',
        '#gm .ow .fo i u{display:block;height:100%;width:100%;transform-origin:left;transform:scaleX(0);background:#7FD3FF}',
        '#gm .ow .fo i.full u{background:#C9F1FF;box-shadow:0 0 10px rgba(127,211,255,.95)}',
        '#gm .owp{position:absolute;left:50%;bottom:calc(128px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);' + GLASS + ';border-radius:12px;padding:8px 14px;font-size:13px;letter-spacing:.05em;display:none;white-space:nowrap}',
        '#gm .owp kbd{display:inline-block;min-width:20px;padding:1px 6px;margin-right:8px;border-radius:5px;background:rgba(255,255,255,.2);font:700 12px Oxanium,system-ui;text-align:center}',
        '#gm .tpad button.grab{display:none}',
        '#gm .tpad button.fin,#gm .tpad button.heal{position:absolute;bottom:calc(100% + 14px)}#gm .tpad button.fin{right:0}#gm .tpad button.heal{right:90px}',
        '@media (max-height:360px){#gm .tpad button.fin,#gm .tpad button.heal{width:64px;height:64px;font-size:12px;bottom:calc(100% + 10px)}#gm .tpad button.fin{right:70px}#gm .tpad button.heal{right:144px}}',
        '#gm.demo .ow,#gm.demo .owr,#gm.demo .radar,#gm.demo .boss,#gm.demo .owp{display:none!important}',
        // phones (the owner, 30 Sep): health is a percentage, not a bar, and it
        // never sits under the stats. Portrait stacks it in a row of its own,
        // with the radar and the boss's bar below; the fund's goal shortens.
        '#gm .ow .pct{display:none;font-size:20px;line-height:1;letter-spacing:.02em}',
        '#gm .ow .pct.low{color:#FF5A5A;text-shadow:0 0 10px rgba(255,59,59,.7)}',
        '#gm .owr .gm em{display:none;font-style:normal;font-size:12px;opacity:.72;margin-left:3px}',
        '#gm.touch .ow{width:auto;padding:7px 12px 8px;border-radius:14px;display:flex;flex-wrap:wrap;align-items:center;gap:5px 10px}',
        '#gm.touch .ow small{margin:0}',
        '#gm.touch .ow .hp,#gm.touch .ow .st b{display:none}',
        '#gm.touch .ow .pct{display:block}',
        '#gm.touch .ow .st{margin:0;gap:2px}',
        '#gm.touch .ow .st svg{width:12px;height:12px}',
        '#gm.touch .ow .wp{margin:0;flex-basis:100%}',
        '#gm.touch .ow .fo{position:absolute;left:12px;right:12px;bottom:2px;margin:0;gap:4px}#gm.touch .ow .fo small{display:none}#gm.touch .ow .fo i{height:4px}',
        '@media (max-width:600px){'
          + '#gm.touch .ow{top:calc(' + TOP + ' + 62px)}'
          + '#gm.touch .owr{left:calc(14px + env(safe-area-inset-left,0px));justify-content:flex-end}'
          + '#gm.touch .owr .board{min-width:0}'
          + '#gm.touch .owr .board small{white-space:nowrap}'
          + '#gm.touch .owr .gm .of{display:none}'
          + '#gm.touch .owr .gm em{display:inline}'
          + '#gm.touch .owr .gm b{display:inline}'
          + '#gm.touch .radar{top:calc(' + TOP + ' + 112px)}'
          + '#gm.touch .boss{top:calc(' + TOP + ' + 124px);left:calc(140px + env(safe-area-inset-left,0px));right:calc(14px + env(safe-area-inset-right,0px));width:auto;transform:none}'
          + '#gm.touch .boss b{font-size:12px;letter-spacing:.16em}'
        + '}',
      ].join('\n');
      document.head.appendChild(hudCss);
      // 10000 -> 10K, for a goal beside the fund on a phone
      function shortGm(n) { return n >= 1000 && n % 100 === 0 ? (n / 1000) + 'K' : n.toLocaleString('en-US'); }
      var STAR = '<svg viewBox="0 0 24 24"><path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z"/></svg>';
      var hudHp = el('div', 'ow', '<small>' + TX.health + '</small><b class="pct">100%</b><div class="hp"><i></i></div><div class="st">' + STAR + STAR + STAR + STAR + STAR + '<b></b></div><div class="wp"><b></b><span><i></i></span></div><div class="fo"><small>Focus</small><i><u></u></i><i><u></u></i><i><u></u></i></div>');
      var foRow = hudHp.querySelector('.fo'); if (DERBY) foRow.style.display = 'none';
      var hudPick = el('div', 'owp', '');
      var hudR = el('div', 'owr', '');
      var hudT = el('div', 'board', '<small>Survived</small><b>0:00</b>', hudR), hudK = el('div', 'board', '<small>' + TX.kos + '</small><b>0</b>', hudR), hudG = el('div', 'board gm', '<i>GM</i><div><small>' + esc(O.hud && typeof O.hud.gm === 'string' ? O.hud.gm.slice(0, 18) : 'GM') + (cfg.goal ? '<span class="of"> &middot; of ' + cfg.goal.gm.toLocaleString('en-US') + '</span>' : '') + '</small><b>0</b>' + (cfg.goal ? '<em>/' + shortGm(cfg.goal.gm) + '</em>' : '') + '</div>', hudR);
      if (!cfg.coins) hudG.style.display = 'none';
      var hudBoss = el('div', 'boss', '<b></b><div class="hp"><i></i></div>');
      var radar = el('div', 'radar', ''), rc = document.createElement('canvas'); rc.width = rc.height = 256; radar.appendChild(rc);
      var rg = rc.getContext('2d');
      [hudHp, hudR, hudBoss, radar].forEach(function (e) { e.style.display = 'none'; });
      // the race's own HUD stays hidden in an open world
      [hudLvl, hudTime, hudGm, hudRivals].forEach(function (e) { if (e) e.style.display = 'none'; });
      function showHud(on) { [hudHp, hudR, radar].forEach(function (e) { e.style.display = on ? '' : 'none'; }); if (!on) hudBoss.style.display = 'none'; }
      var lastHud = '';
      function stepHud() {
        if (!player) return;
        var key = Math.ceil(player.hp) + '|' + DIR.heat + '|' + Math.floor(DIR.time) + '|' + DIR.kos + '|' + gm + '|' + (PL.weapon ? PL.weapon.kind + PL.weapon.hits : '') + '|' + Math.round((PL.focus || 0) * 40);
        if (key !== lastHud) {
          lastHud = key;
          var f = hudHp.querySelector('.hp i'); f.style.width = Math.max(0, player.hp / player.max * 100) + '%'; f.classList.toggle('low', player.hp / player.max < 0.3);
          var pc = hudHp.querySelector('.pct'); pc.textContent = Math.max(0, Math.ceil(player.hp / player.max * 100)) + '%'; pc.classList.toggle('low', player.hp / player.max < 0.3);
          var sv = hudHp.querySelectorAll('.st svg'); for (var i = 0; i < sv.length; i++) sv[i].classList.toggle('on', i < stars(DIR.heat));
          hudHp.querySelector('.st b').textContent = 'HEAT ' + DIR.heat;
          var s = Math.floor(DIR.time); hudT.querySelector('b').textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
          hudK.querySelector('b').textContent = DIR.kos; hudG.querySelector('b').textContent = cfg.goal ? gm.toLocaleString('en-US') : gm;
          var wp = hudHp.querySelector('.wp'); wp.style.display = PL.weapon ? 'flex' : 'none';
          if (PL.weapon) { wp.querySelector('b').textContent = WEAPONS[PL.weapon.kind].name; wp.querySelector('span i').style.width = PL.weapon.keep ? '100%' : Math.max(0, PL.weapon.hits / PL.weapon.max * 100) + '%'; }
          var fo = hudHp.querySelectorAll('.fo i');
          for (var fi = 0; fi < fo.length; fi++) { var fk = clamp((PL.focus || 0) - fi, 0, 1); fo[fi].firstChild.style.transform = 'scaleX(' + fk.toFixed(3) + ')'; fo[fi].classList.toggle('full', fk >= 1); }
          foRow.style.display = DERBY || player && player.creature ? 'none' : '';
          if (finBtn) { finBtn.style.display = state === 'race' && !demo && finTarget() ? 'block' : 'none'; healBtn.style.display = state === 'race' && !demo && canHeal() ? 'block' : 'none'; }
        }
        var near = state === 'race' && !demo ? PL.near : null, pk = near ? near.kind + (PL.weapon ? 's' : 'p') : '';
        if (pk !== hudPick.dataset.k) {
          hudPick.dataset.k = pk; hudPick.style.display = near && PL.weapon ? 'block' : 'none';
          if (near) hudPick.innerHTML = '<kbd>E</kbd>Swap for the ' + WEAPONS[near.kind].name.toLowerCase();
          grabBtn.style.display = near && PL.weapon ? 'block' : 'none';
        }
        if (DERBY) derbyHud();
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
        if (DERBY) derbyRadar(P, k);
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
      var IN = { f: 0, b: 0, l: 0, r: 0, sprint: false, jx: 0, jy: 0, jOn: false, fire: false, hand: false };
      var KEYS = { KeyW: 'f', ArrowUp: 'f', KeyS: 'b', ArrowDown: 'b', KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r' };
      window.addEventListener('keydown', function (e) {
        // J punches, K jumps, L (or C) dodges; Space jumps too
        var k = KEYS[e.code], act = e.code === 'KeyJ' || e.code === 'KeyX' || e.code === 'KeyF' ? 'punch' : e.code === 'Space' || e.code === 'KeyK' ? 'jump' : e.code === 'KeyC' || e.code === 'KeyL' ? 'dodge' : null;
        if (demo && (k || act || e.code === 'Enter')) { e.preventDefault(); ensureAudio(); if (!e.repeat) showStart(); return; }
        if (state === 'intro' && (e.code === 'Enter' || e.code === 'Space' || e.code === 'Escape')) { e.preventDefault(); if (!e.repeat && !(IX && IX.hold > performance.now())) endIntro(); return; }
        if (screen && (e.code === 'Enter' || e.code === 'Space')) { e.preventDefault(); ensureAudio(); if (!e.repeat) screen._go(); return; }
        if (DERBY && derbyKey(e, true)) { ensureAudio(); return; }
        if (k) { IN[k] = 1; e.preventDefault(); ensureAudio(); return; }
        if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') { IN.sprint = true; return; }
        if (act && state === 'race') { e.preventDefault(); ensureAudio(); if (!e.repeat) { if (act === 'punch') { punch(); atkDown(); } else if (act === 'dodge') dodge(); else jump(); } return; }
        // focus: R the finisher, Z a heal
        if ((e.code === 'KeyR' || e.code === 'KeyZ') && state === 'race' && !demo && !DERBY) { e.preventDefault(); if (!e.repeat) { if (e.code === 'KeyR') finisher(); else heal(); } return; }
        // with the traversal, E zips (trav.js) and G picks a weapon up
        if (e.code === (TRAVO ? 'KeyG' : 'KeyE') && state === 'race' && !demo) { e.preventDefault(); if (!e.repeat) grab(); return; }
        if (e.code === 'KeyP' || e.code === 'Escape') { e.preventDefault(); if (!e.repeat && (state === 'race' || state === 'paused')) togglePause(); }
      });
      window.addEventListener('keyup', function (e) { if (DERBY) derbyKey(e, false); var k = KEYS[e.code]; if (k) IN[k] = 0; if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') IN.sprint = false; if (e.code === 'KeyJ' || e.code === 'KeyX' || e.code === 'KeyF') IN.atk = false; });
      // a held attack (stage 3): pressed and held a fifth of a second, it launches (in the air, it slams)
      function atkDown() { IN.atk = true; PL.atkT = performance.now(); PL.holdFired = false; }
      window.addEventListener('blur', function () { IN.f = IN.b = IN.l = IN.r = 0; IN.sprint = false; IN.fire = IN.hand = false; IN.atk = false; });
      // the mouse: a click punches; a drag turns the camera round you
      var drag = null;
      renderer.domElement.addEventListener('pointerdown', function (e) {
        if (e.pointerType === 'touch') return;
        ensureAudio(); drag = { x: e.clientX, y: e.clientY, moved: false, button: e.button };
        if (e.button === 0 && !DERBY && state === 'race' && !demo) atkDown();
        // a derby: a held click fires
        if (DERBY && e.button === 0 && state === 'race' && !demo) { IN.fire = true; drag.fire = true; }
      });
      window.addEventListener('pointermove', function (e) {
        if (!drag) return;
        var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (!drag.moved && Math.hypot(dx, dy) > 6) { drag.moved = true; IN.atk = false; if (drag.fire) { IN.fire = false; drag.fire = false; } }
        if (drag.moved) { CAM.yaw -= dx * 0.0055; CAM.pitch = clamp(CAM.pitch + dy * 0.004, -0.1, 0.9); CAM.userT = 0; drag.x = e.clientX; drag.y = e.clientY; }
      });
      window.addEventListener('pointerup', function (e) {
        if (DERBY) { if (drag && drag.fire) IN.fire = false; drag = null; return; }
        if (drag && !drag.moved && drag.button === 0 && state === 'race' && !demo && !PL.holdFired) punch();
        if (e.pointerType !== 'touch') IN.atk = false;
        drag = null;
      });
      // a finger dragged across the screen (anywhere the stick and the buttons are not) turns the camera
      var tdrag = null;
      renderer.domElement.addEventListener('pointerdown', function (e) { if (e.pointerType === 'touch' && !tdrag) tdrag = { id: e.pointerId, x: e.clientX, y: e.clientY }; });
      window.addEventListener('pointermove', function (e) {
        if (!tdrag || e.pointerId !== tdrag.id) return;
        var dx = e.clientX - tdrag.x, dy = e.clientY - tdrag.y; tdrag.x = e.clientX; tdrag.y = e.clientY;
        if (travOn()) { TRAV.input.mouse.dx += dx * 3.3; TRAV.input.mouse.dy += dy * 3.3; }
        else { CAM.yaw -= dx * 0.0075; CAM.pitch = clamp(CAM.pitch + dy * 0.005, -0.1, 0.9); CAM.userT = 0; }
      });
      function tdragEnd(e) { if (tdrag && e.pointerId === tdrag.id) tdrag = null; }
      window.addEventListener('pointerup', tdragEnd); window.addEventListener('pointercancel', tdragEnd);
      // touch: the runtime's stick and buttons (v1.js, the same in every
      // world), its buttons named for a street fight
      tpad.innerHTML = '';
      TK.move = function () { IN.jx = TK.jx; IN.jy = TK.jy; IN.jOn = TK.on; };
      var grabBtn, finBtn = null, healBtn = null;
      if (DERBY) grabBtn = derbyTouch();
      else {
        tbtn('RUN', '', function (on) { IN.sprint = on; if (TRAVO) travKey('ShiftLeft', on); });
        // (a hero who never jumps or never dodges has no button for it; with the traversal, Space is the traversal's own)
        if (cfg.jump || TRAVO) tbtn('JUMP', '', function (on) { if (TRAVO) { travKey('Space', on); return; } if (on && state === 'race') jump(); });
        if (cfg.dodge) tbtn('DODGE', '', function (on) { if (on && state === 'race') dodge(); });
        finBtn = tbtn('FINISH', 'fin', function (on) { if (on && state === 'race') finisher(); }); finBtn.style.display = 'none';
        healBtn = tbtn('HEAL', 'heal', function (on) { if (on && state === 'race') heal(); }); healBtn.style.display = 'none';
        tbtn('PUNCH', 'big', function (on) { if (on && state === 'race') { punch(); atkDown(); } else IN.atk = false; });
        grabBtn = tbtn('GRAB', 'grab', function (on) { if (on && state === 'race') grab(); });
        if (TRAVO) travTouch();
      }

      /* ------------------------------------------------- the big fight -- */
      // the boss close by, or four or more on you at once: the camera comes in
      // over your shoulder, framing you and them (the owner, 30 Sep)
      var BIG = { on: false, k: 0, hold: 0, focus: null, n: 0 };
      function stepBig(dt) {
        var foes = 0, cx = 0, cz = 0, boss = null;
        if (player && !player.ko && state === 'race' && !demo && !IX) {
          if (DIR.boss && !DIR.boss.ko && dist(DIR.boss, player) < 12) boss = DIR.boss;
          for (var i = 0; i < actors.length; i++) { var a = actors[i]; if (a === player || a.ko || a.kind === 'civ' || a.scripted) continue; if (climbOn() && Math.abs(a.y - player.y) > 3) continue; if (dist(a, player) < 9) { foes++; cx += a.x; cz += a.z; } }
        }
        BIG.n = foes;
        if (boss || foes >= 4) BIG.hold = 2.5; else BIG.hold = Math.max(0, BIG.hold - dt);
        BIG.on = BIG.hold > 0 && !!player && !player.ko;
        // the fight's middle, while there is one: once nobody is left the camera stops turning to where it was
        if (boss) BIG.focus = { x: boss.x, z: boss.z }; else if (foes) BIG.focus = { x: cx / foes, z: cz / foes }; else BIG.focus = null;
        BIG.k += ((BIG.on ? 1 : 0) - BIG.k) * (1 - Math.exp(-(BIG.on ? 2.4 : 1.2) * dt));
      }

      // a fight one on one (the owner, 3 Oct: "more close up fighting"): while the hero trades blows with someone close,
      // or someone close is coming at him, the camera comes in over his shoulder and turns, gently, to take the man in
      var DUEL = { k: 0, hold: 0, focus: null, a: null };
      function stepDuel(dt) {
        var L = null;
        if (player && !player.ko && !DERBY && !player.car && state === 'race' && !demo && !IX) {
          // the man he is hitting (while he is), else the nearest one coming at him; the one already framed is kept unless
          // another is a good metre nearer, so the camera does not swing across him between two
          var hitting = DIR.time - (PL.fightT || -9) < 2.5;
          L = hitting && PL.lock && !PL.lock.ko && PL.lock.fade >= 1 && PL.lock !== player && dist(PL.lock, player) < 5 ? PL.lock : null;
          if (!L) for (var i = 0, bd = 4; i < actors.length; i++) {
            var a = actors[i]; if (a === player || a.ko || a.kind === 'civ' || a.scripted || a.fade < 1 || (climbOn() && Math.abs(a.y - player.y) > 1.8)) continue;
            var d = dist(a, player) - (a === DUEL.a ? 1 : 0); if (d < bd && (a.token || a.state === 'windup' || a.state === 'strike')) { bd = d; L = a; }
          }
        }
        // the focus goes with the man (a fight that is over frames nobody: W walks where the camera looks); only the
        // closeness eases out
        if (L) { DUEL.focus = { x: L.x, z: L.z }; DUEL.hold = 1.2; } else { DUEL.hold = Math.max(0, DUEL.hold - dt); DUEL.focus = null; }
        DUEL.a = L;
        var on = DUEL.hold > 0 ? 1 : 0;
        DUEL.k += (on - DUEL.k) * (1 - Math.exp(-(on ? 2.2 : 1.0) * dt));
      }

      /* ---------------------------------------------------------- camera -- */
      var fc = def.camera || {};
      var CAM = { yaw: 0, pitch: 0.2, dist: clamp(Number(fc.distance) || 5.2, 2.6, 12), h: clamp(Number(fc.height) || 1.5, 0.8, 5), userT: 9, pos: new THREE.Vector3(), look: new THREE.Vector3(), shake: 0, init: false };
      var camTmp = new THREE.Vector3();
      function camBlocked(x, y, z) {
        var g = cellAt(x, z); if (!g) return false;
        for (var i = 0; i < g.b.length; i++) { var b = g.b[i]; if (b.max.y > y - 0.3 && x > b.min.x && x < b.max.x && z > b.min.z && z < b.max.z && b.max.y - b.min.y > 2.2) return true; }
        // a palm's trunk too, or the camera sits behind it
        for (i = 0; i < g.c.length; i++) { var c = g.c[i]; if (c.r >= 0.2 && Math.hypot(x - c.x, z - c.z) < c.r + 0.2) return true; }
        return false;
      }
      function stepCam(dt) {
        if (DERBY) { derbyCam(dt); return; }
        if (!player) return;
        var fl = film && typeof film === 'object' ? film : null;
        var dist = fl ? clamp(fl.distance, -20, 20) : CAM.dist, hgt = fl ? fl.height : CAM.h;
        CAM.userT += dt;
        // behind you as you move, unless someone has just turned it
        var bk = fl ? 0 : BIG.k, dk = fl ? 0 : DUEL.k * (1 - BIG.k);
        if (player.speed > 1.2 && CAM.userT > 1.6 && !fl) face(CAM, player.yaw + PI, (1 - Math.exp(-1.6 * dt)) * (1 - (player.speed < 3.5 ? 0.75 * dk : 0)));
        // a big fight: in close, lower, over the shoulder, turned to take them in
        if (bk > 0.01) {
          dist += (Math.min(dist, 3.2) - dist) * bk; hgt += (Math.min(hgt, 1.3) - hgt) * bk;
          if (BIG.focus && CAM.userT > 1.6) face(CAM, yawTo(player, BIG.focus.x, BIG.focus.z) + PI + 0.22, (1 - Math.exp(-2.6 * dt)) * bk);
        }
        // one on one: closer still and lower, turned well across him so the man he fights is not behind him (not while he runs)
        if (dk > 0.01) {
          dist += (Math.min(dist, 3.0) - dist) * dk; hgt += (Math.min(hgt, 1.25) - hgt) * dk;
          if (DUEL.focus && CAM.userT > 1.6 && player.speed < 3.5) face(CAM, yawTo(player, DUEL.focus.x, DUEL.focus.z) + PI + 0.62, (1 - Math.exp(-1.8 * dt)) * dk);
        }
        // a heavy blow lands: the camera punches in, and eases back
        CAM.kick = Math.max(0, (CAM.kick || 0) - dt * 2.4); dist *= 1 - 0.14 * CAM.kick * Math.max(bk, dk);
        var tx = player.x, ty = player.y + (fl && fl.look > 0.5 && fl.look < 2.2 ? fl.look : 1.4), tz = player.z;
        if (bk > 0.01 && BIG.focus) { var fdx = BIG.focus.x - tx, fdz = BIG.focus.z - tz, fdd = Math.hypot(fdx, fdz) || 1, fsh = Math.min(1.3, fdd * 0.35) * bk; tx += fdx / fdd * fsh; tz += fdz / fdd * fsh; ty -= 0.1 * bk; }
        if (dk > 0.01 && DUEL.focus) { var ddx = DUEL.focus.x - tx, ddz = DUEL.focus.z - tz, ddd = Math.hypot(ddx, ddz) || 1, dsh = Math.min(0.9, ddd * 0.3) * dk; tx += ddx / ddd * dsh; tz += ddz / ddd * dsh; ty -= 0.08 * dk; }
        var cp = Math.cos(CAM.pitch), fx = -Math.sin(CAM.yaw) * cp, fz = -Math.cos(CAM.yaw) * cp;
        var side = fl ? fl.side || 0 : 0.36 * bk + 0.42 * dk;
        var d = dist, x = tx - fx * d + Math.cos(CAM.yaw) * side, y = ty + hgt - 1.4 + Math.sin(CAM.pitch) * d * 0.6, z = tz - fz * d - Math.sin(CAM.yaw) * side;
        // a finisher: in close from the side, the two of them in frame (real time, so it eases in and out at its own pace)
        var C = CAM.cine;
        if (C && !fl) {
          C.t += dt;
          var T = C.a, mx = (player.x + T.x) / 2, mz = (player.z + T.z) / 2, my = Math.max(player.y, T.y || 0) + 1.2, lx = T.x - player.x, lz = T.z - player.z, span = Math.hypot(lx, lz) || 1;
          var px = -lz / span, pz = lx / span;
          if (!C.side) C.side = (x - mx) * px + (z - mz) * pz >= 0 ? 1 : -1;
          var cr = 2.6 + span * 0.8 + C.t * 0.35, ck = smooth(0, 0.22, C.t) * (1 - smooth(C.dur - 0.3, C.dur, C.t));
          x += (mx + px * C.side * cr - x) * ck; y += (my + 0.35 - y) * ck; z += (mz + pz * C.side * cr - z) * ck;
          tx += (mx - tx) * ck; ty += (my - ty) * ck; tz += (mz - tz) * ck;
          if (C.t >= C.dur) CAM.cine = null;
        }
        // pulled in, never through a wall
        for (var k = 1; k <= 8; k++) { var u = k / 8, sx = tx + (x - tx) * u, sy = ty + (y - ty) * u, sz = tz + (z - tz) * u; if (camBlocked(sx, sy, sz)) { var u2 = Math.max(0.15, (k - 1.3) / 8); x = tx + (x - tx) * u2; y = ty + (y - ty) * u2; z = tz + (z - tz) * u2; break; } }
        y = Math.max(y, groundAt(x, z) + 0.35);
        // over a world's own terrain (open.ground), the camera rises just enough to see the
        // player over a crest between them, rather than looking into the sand
        if (typeof O.ground === 'function' && !O.map) {
          var lift = 0;
          // from the player's middle, so the body shows, not just the top of the head
          for (var lk = 1; lk <= 6; lk++) { var lu = lk / 7, lb = ty - 0.7, lx = tx + (x - tx) * lu, lz = tz + (z - tz) * lu, ly = lb + (y - lb) * lu, lg = groundAt(lx, lz) + 0.4; if (ly < lg) lift = Math.max(lift, (lg - ly) / lu); }
          y += Math.min(lift, 6);
        }
        if (!CAM.init) { CAM.pos.set(x, y, z); CAM.look.set(tx, ty, tz); CAM.init = true; }
        var kk = 1 - Math.exp(-10 * dt);
        CAM.pos.lerp(camTmp.set(x, y, z), kk); CAM.look.lerp(camTmp.set(tx, ty, tz), 1 - Math.exp(-14 * dt));
        camera.position.copy(CAM.pos);
        CAM.shake = Math.max(0, CAM.shake - dt * 2.8);
        if (CAM.shake > 0) camera.position.add(camTmp.set((Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5)).multiplyScalar(CAM.shake * 0.16));
        // (open.impact: a blow landing kicks the camera along it and a little down, rolls it a touch and narrows the lens,
        // all at once and eased back over a tenth of a second, in real time, so it plays out in the stop)
        var Ci = CAM.imp, ke = 0, fe = 0;
        if (Ci && !fl) { Ci.t += dt; ke = (1 - Math.exp(-Ci.t / 0.012)) * Math.exp(-Ci.t / 0.08); fe = (1 - Math.exp(-Ci.t / 0.015)) * Math.exp(-Ci.t / 0.12); camera.position.x += Ci.bx * Ci.amp * ke; camera.position.y -= Ci.amp * 0.35 * ke; camera.position.z += Ci.bz * Ci.amp * ke;
          // (a knockout: in toward him by a share of the way, in a twentieth of a second, held a moment and eased back by
          // half a second)
          if (Ci.push) { var pe = Ci.push * smooth(0, 0.05, Ci.t) * (1 - smooth(0.15, 0.5, Ci.t)); camTmp.copy(CAM.look).sub(camera.position); camera.position.addScaledVector(camTmp, pe); if (IMP.last && camTmp.length() * pe > (IMP.last.push || 0)) IMP.last.push = camTmp.length() * pe; }
          if (Ci.t > 0.7) CAM.imp = null; }
        camera.lookAt(CAM.look);
        if (ke) camera.rotateZ(Ci.roll * ke);
        var fov = (fl ? fl.fov : (Number(fc.fov) || 55) + 5 * bk) - (Ci && !fl ? Ci.fov * fe : 0);
        if (Ci && !fl && IMP.last && Ci.fov * fe > IMP.last.lens) IMP.last.lens = Ci.fov * fe;
        if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
      }

      /* ------------------------------------------------------- GM drops -- */
      var COINMAX = 80, coins = [], cm = new THREE.InstancedMesh(coinGeo, [coinSide, coinFace, coinFace], COINMAX);
      cm.frustumCulled = false; cm.castShadow = false; scene.add(cm);
      for (var ci = 0; ci < COINMAX; ci++) coins.push({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, t: 0 });
      var cDummy = new THREE.Object3D();
      // (wait: seconds before they fly, unseen till then; a bottle's knockout, so its shards burst on his head first)
      function drop(x, y, z, n, wait) {
        if (!cfg.coins) return;
        // up to a dozen coins, the GM shared between them
        var k = Math.max(1, Math.min(12, n)), each = Math.floor(n / k), extra = n - each * k;
        // (open.coinFly: 'low': a quarter of a second after he drops, so the fall reads first; out from his knees, low along
        // the ground and away from the camera, in the half of the ground in front of it)
        var low = cfg.coinFly === 'low', away = Math.atan2(x - camera.position.x, z - camera.position.z);
        if (low) wait = Math.max(wait || 0, 0.25);
        for (var i = 0; i < k; i++) {
          var q = coins.filter(function (c) { return !c.on; })[0]; if (!q) return;
          var a = low ? away + (Math.random() - 0.5) * 2.1 : Math.random() * TAU, s = low ? 1.2 + Math.random() * 1.6 : 1.5 + Math.random() * 2.5;
          q.on = true; q.x = x; q.y = y + (low ? 0.35 : 1); q.z = z; q.vx = Math.sin(a) * s; q.vz = Math.cos(a) * s; q.vy = low ? 1.6 + Math.random() * 1.2 : 4 + Math.random() * 3; q.t = 0; q.v = each + (i < extra ? 1 : 0);
          q.pulled = false;
          if (wait) q.wait = wait;
        }
      }
      // every GM the hero earns comes in here (a coin taken, a derby's spin or wreck): the goal first, which ends the
      // run in its closing scene; short of it, the story's beats it has passed are noted, to play when the fight allows
      function earnGm(n) {
        gm += n; SFX.coin();
        if (cfg.goal && gm >= cfg.goal.gm && state === 'race' && !IX) reachGoal();
        else if (STORY) while (STORY.crossed < STORY.beats.length && gm >= STORY.beats[STORY.crossed].gm) STORY.crossed++;
      }
      function stepCoins(dt) {
        var any = false;
        for (var i = 0; i < COINMAX; i++) {
          var q = coins[i];
          if (!q.on || q.wait > 0) { if (q.on) q.wait -= dt; cDummy.position.set(0, -999, 0); cDummy.scale.setScalar(0.0001); cDummy.updateMatrix(); cm.setMatrixAt(i, cDummy.matrix); continue; }
          any = true; q.t += dt;
          var gy = (climbOn() ? floorAt(q.x, q.z, q.y) : groundAt(q.x, q.z)) + 0.45;
          if (player && player.alive !== false && !player.ko) {
            // in a climbing world, only coins on your own level (not the street under your roof)
            var dx = player.x - q.x, dz = player.z - q.z, d = climbOn() && Math.abs(q.y - player.y - 0.45) > 2.2 ? 99 : Math.hypot(dx, dz);
            var reach = DERBY ? 7 : 3.6, take = DERBY ? 2.6 : 0.8;
            if (d < reach && q.t > 0.45) { var pull = 22 * (1 - d / reach) + 6; q.vx += dx / (d || 1) * pull * dt; q.vz += dz / (d || 1) * pull * dt; q.pulled = true; }
            if (d < take && q.t > 0.35) { q.on = false; if (!demo) earnGm(q.v || 1); continue; }
          }
          // (open.coinFly: 'low': once they come to him they come at his waist, not over his head)
          if (cfg.coinFly === 'low' && q.pulled && player && !player.ko) { var wy = (player.y || 0) + 0.5 * clamp(Number(P0.height) || 1.8, 1.2, 2.6); q.vy = 0; q.y += (wy - q.y) * (1 - Math.exp(-7 * dt)); q.x += q.vx * dt; q.z += q.vz * dt; }
          else { q.vy -= 18 * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt; }
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
      // A tank's block (open.tank): sparks off his forearms where the blow meets them, white-hot and quick, thrown back
      // the way the blow came. They are their own few points with their own colours, made the first time he blocks (so no
      // other world carries them), because burst() recolours every particle alive.
      var SPK = null;
      function blockSparks(x, y, z, dx, dz) {
        if (!SPK) {
          var n = 96, g = new THREE.BufferGeometry(), P = new Float32Array(n * 3), C = new Float32Array(n * 3);
          g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('color', new THREE.BufferAttribute(C, 3));
          var pts = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.12, map: spTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
          pts.frustumCulled = false; pts.renderOrder = 5; scene.add(pts);
          SPK = { n: n, g: g, pos: P, col: C, vel: new Float32Array(n * 3), life: new Float32Array(n), max: new Float32Array(n), next: 0, live: 0 };
          for (var i0 = 0; i0 < n; i0++) P[i0 * 3 + 1] = -9999;
        }
        var back = Math.atan2(dx, dz);
        for (var i = 0; i < 30; i++) {
          // a few hang at the point of impact as its flash; the rest fly back and out, and fall
          var j = SPK.next++ % SPK.n, core = i < 5, an = back + (Math.random() - 0.5) * 2.6, v = core ? 0.3 : 2.5 + Math.random() * 5.5;
          SPK.pos[j * 3] = x; SPK.pos[j * 3 + 1] = y; SPK.pos[j * 3 + 2] = z;
          SPK.vel[j * 3] = Math.sin(an) * v; SPK.vel[j * 3 + 1] = core ? 0 : 0.5 + Math.random() * 3.2; SPK.vel[j * 3 + 2] = Math.cos(an) * v;
          SPK.life[j] = SPK.max[j] = core ? 0.09 : 0.16 + Math.random() * 0.26;
        }
        SPK.live = SPK.n;
      }
      function stepSparks(dt) {
        var S = SPK, live = 0;
        // (nothing alive last frame and none thrown since: the buffers are as they were, and nothing is sent again)
        if (!S.live) return;
        for (var i = 0; i < S.n; i++) {
          if (S.life[i] <= 0) { S.pos[i * 3 + 1] = -9999; continue; }
          live++; S.life[i] -= dt; S.vel[i * 3 + 1] -= 9.8 * dt;
          S.pos[i * 3] += S.vel[i * 3] * dt; S.pos[i * 3 + 1] += S.vel[i * 3 + 1] * dt; S.pos[i * 3 + 2] += S.vel[i * 3 + 2] * dt;
          // white-hot, cooling to orange as it dies (added light: darker is fainter)
          var k = clamp(S.life[i] / S.max[i], 0, 1);
          S.col[i * 3] = 1.6 * k + 0.2; S.col[i * 3 + 1] = 1.35 * k * k + 0.08; S.col[i * 3 + 2] = 0.95 * k * k * k;
        }
        S.g.attributes.position.needsUpdate = true; S.g.attributes.color.needsUpdate = true; S.live = live;
      }

      /* -------------------------------------------------------- sounds -- */
      function thud(power, taken) {
        if (!audio || demo) return;
        var ac = audio.ctx, t0 = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
        o.type = 'sine'; o.frequency.setValueAtTime(120 + power * 30, t0); o.frequency.exponentialRampToValueAtTime(45, t0 + 0.16);
        g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.5 + power * 0.25, t0 + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2);
        o.connect(g); g.connect(audio.fx); o.start(t0); o.stop(t0 + 0.22);
        noiseBand(0.09, 0.35 + power * 0.2, 2400, 500);
        // music from a place in the world (music.source): a blow he lands near the booth cuts through the set a little,
        // at most every 0.4 s (every blow of a fight, his and theirs, kept the set pumping and never let it settle)
        if (audio.venue && audio.venue.close && audio.music && audio.music.duck && !taken && ac.currentTime - venueDuckT > 0.4) { venueDuckT = ac.currentTime; audio.music.duck(2.5, 0.1); }
      }
      var venueDuckT = -9;
      function whoosh() { if (audio && !demo) noiseBand(0.16, 0.12, 900, 2600); }
      // Short grains of noise strewn through one buffer and band-passed together, each with its own small swell, louder
      // early: snow crushed under a boot (gravel or falling shards are the same thing tuned another way). Synthesised, as
      // every sound here is.
      // (the grains are strewn once, into six buffers, three sparse and three dense, and each sound plays one of them at
      // a pitch of its own: a new buffer for every footstep, a dozen a second in a crowd, would churn a phone's memory)
      var GRAIN = null;
      function grainBuf(ac, n, span) {
        var len = Math.max(1, Math.floor(ac.sampleRate * span)), buf = ac.createBuffer(1, len, ac.sampleRate), ch = buf.getChannelData(0);
        for (var k = 0; k < n; k++) {
          var at = Math.floor(Math.random() * len * 0.85), gl = Math.floor(ac.sampleRate * (0.002 + Math.random() * 0.006)), amp = (0.4 + Math.random() * 0.6) * (1 - at / len);
          for (var i = 0; i < gl && at + i < len; i++) ch[at + i] += (Math.random() * 2 - 1) * amp * Math.sin(Math.PI * i / gl);
        }
        return buf;
      }
      function grains(n, span, f0, f1, gain, q) {
        if (!audio || !(gain > 0)) return;
        var ac = audio.ctx;
        if (!GRAIN || GRAIN.ac !== ac) { GRAIN = { ac: ac, b: [] }; for (var j = 0; j < 6; j++) GRAIN.b.push(grainBuf(ac, j < 3 ? 10 : 16, j < 3 ? 0.1 : 0.13)); }
        var s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain(), t0 = ac.currentTime, rate = 0.9 + Math.random() * 0.22;
        s.buffer = GRAIN.b[(n > 12 ? 3 : 0) + Math.floor(Math.random() * 3)]; s.playbackRate.value = rate;
        span = s.buffer.duration / rate;
        f.type = 'bandpass'; f.Q.value = q || 0.9; f.frequency.setValueAtTime(f0, t0); f.frequency.exponentialRampToValueAtTime(f1, t0 + span);
        g.gain.value = gain; s.connect(f); f.connect(g); g.connect(audio.fx); s.start(t0);
      }
      // Footsteps (open.steps: 'snow'): a foot comes down at the stride for his pace (about 0.85 m a step walking, 1.5 m
      // running, 1.9 m flat out), and with it the crunch of packed snow: a scatter of dry grains over the soft press of
      // the heel, harder on a run. His own steps are heard in full; anyone else's within 8 m of him (of the camera, in a
      // scene) fainter by the distance, a few at a time, so a crowd walking by is not a din. None in the demo, none while he
      // is in the air or wading.
      var FOOT = cfg.steps ? { kind: cfg.steps, hero: 0, near: 0, win: 0, winT: -1 } : null;
      function snowStep(k, v) {
        var run = smooth(2.2, 6, v);
        grains(Math.round(9 + run * 7), 0.1 + run * 0.03, 2700 + Math.random() * 700, 1300 + Math.random() * 400, (0.22 + run * 0.12) * k, 0.9);
        tone(80 + Math.random() * 20, 0, 0.06 + run * 0.02, 'sine', (0.05 + run * 0.05) * k, 55);
      }
      function stepFeet(a, dt) {
        var v = a.speed || 0;
        if (a.ko || (a.wet || 0) > 0.015 || (a === player && PL.air > 0.05) || v < 0.45) { a.stepT = Math.min(a.stepT == null ? 0.12 : a.stepT, 0.12); return; }
        a.stepT = (a.stepT == null ? 0.12 : a.stepT) - dt;
        if (a.stepT > 0) return;
        a.stepT = Math.max(0.05, a.stepT + clamp(0.55 + 0.2 * v, 0.7, 1.9) / v);
        if (!audio || demo || (state !== 'race' && state !== 'intro')) return;
        var k = 1;
        if (a !== player || state !== 'race') {
          var lx = state === 'race' ? player.x : camera.position.x, lz = state === 'race' ? player.z : camera.position.z, d = Math.hypot(a.x - lx, a.z - lz);
          k = d < 8 ? 0.4 * Math.pow(1 - d / 8, 1.5) : 0;
          if (k < 0.04) return;
          var win = Math.floor(t * 4); if (FOOT.winT !== win) { FOOT.winT = win; FOOT.win = 0; }
          if (FOOT.win >= 3) return;
          FOOT.win++; FOOT.near++;
        } else FOOT.hero++;
        snowStep(k, v);
      }
      // a blow on a tank's forearms (open.tank): a clank of metal, synthesised as every fight sound is (the owner sent
      // recorded impacts back): a struck bar's out-of-tune partials ringing briefly over a hard click and a dull knock
      function clank() {
        if (!audio || demo) return;
        var f = 760 + Math.random() * 110;
        tone(f, 0, 0.34, 'sine', 0.1); tone(f * 2.76, 0, 0.26, 'sine', 0.07); tone(f * 5.4, 0, 0.15, 'sine', 0.045); tone(f * 8.93, 0, 0.08, 'sine', 0.03);
        tone(f * 1.5, 0, 0.05, 'square', 0.045, f);
        noiseBand(0.05, 0.5, 6400, 2600); tone(150, 0, 0.11, 'sine', 0.22, 70);
      }
      // A party's weapons (weapons kind bottle, magnum, glass, bucket), synthesised as every fight sound is. A bottle
      // smashed on a head: the clonk on the skull (harder than a fist), the blow's weight, the crack as the glass gives,
      // the last ring of its body, its shards pinging as they rain down; a glass (thin) is all ring and little knock, a
      // magnum (heavy) lower and longer. A smash cuts through the music a moment.
      function glassSmash(thin, heavy, power) {
        if (!audio || demo) return;
        GLS.smashes++;
        var p = Math.min(4, power || 2);
        tone(thin ? 420 : heavy ? 200 : 260, 0, 0.07, 'sine', thin ? 0.18 : 0.38, thin ? 180 : heavy ? 80 : 95);
        thud(p * (thin ? 0.35 : 0.7));
        noiseBand(0.03, thin ? 0.4 : 0.55, 8000, 4200);
        tone(thin ? 2200 : (heavy ? 880 : 1150) + Math.random() * 200, 0.004, thin ? 0.09 : heavy ? 0.16 : 0.12, 'triangle', thin ? 0.05 : 0.07, thin ? 1900 : heavy ? 760 : 980);
        for (var i = 0, n = thin ? 10 : heavy ? 11 : 8; i < n; i++) tone((thin ? 3400 : 2600) + Math.random() * 3600, 0.015 + i * 0.022 + Math.random() * 0.025, 0.07 + Math.random() * 0.1, 'sine', (thin ? 0.034 : 0.042) * (1 - i / (n + 3)));
        noiseBand(thin ? 0.32 : heavy ? 0.56 : 0.48, thin ? 0.28 : 0.4, 5600, 1700);
        if (audio.music && audio.music.duck) audio.music.duck(4, 0.18);
      }
      // a heavy bottle that holds (a magnum's first blow): a dull knock of thick glass on bone and its short ring
      function glassKnock(power) {
        if (!audio || demo) return;
        GLS.knocks++;
        tone(300, 0, 0.08, 'sine', 0.35, 120); thud(Math.min(4, power || 2) * 0.8);
        tone(1080 + Math.random() * 120, 0.003, 0.2, 'triangle', 0.06, 1020); tone(2650, 0.003, 0.12, 'sine', 0.025);
      }
      // the ice bucket on a head: struck steel, a bowl's out-of-tune partials beating a little over the blow, the ice
      // rattling in it; when it gives out, the ice spills
      function steelClang(last) {
        if (!audio || demo) return;
        GLS.clangs++;
        var f = 300 + Math.random() * 40;
        tone(f, 0, 0.5, 'sine', 0.12); tone(f * 1.012, 0, 0.5, 'sine', 0.06); tone(f * 2.32, 0, 0.36, 'sine', 0.08); tone(f * 4.25, 0, 0.22, 'sine', 0.05); tone(f * 6.63, 0, 0.12, 'sine', 0.03);
        noiseBand(0.06, 0.5, 5200, 2000); thud(1.6);
        for (var i = 0; i < 6; i++) tone(3200 + Math.random() * 2400, 0.02 + i * 0.03 + Math.random() * 0.02, 0.05, 'sine', 0.025);
        if (last) noiseBand(0.4, 0.38, 4200, 1300);
      }
      // picked up: the clink of glass (the bucket's ice rattling)
      function glassClink(ice) {
        if (!audio || demo) return;
        tone(2900, 0, 0.05, 'sine', 0.05); tone(4300, 0.03, 0.08, 'sine', 0.035);
        if (ice) noiseBand(0.09, 0.12, 5200, 3000);
      }
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
      // The hit (open.impact, the punch-only family: AI Alps and its Mogs): the fist's thud as it always was, louder and
      // heavier. A clean crack in its place came back as a tap (the owner, 5 Oct: "u downgraded punch sound effect to sound
      // like a tap, go back to prior sound effect just make it louder and experience more dramatic"), so: thud's own tone (a
      // sine falling from 120 + 30 x power Hz to 45 Hz) and its own band of noise (2.4 kHz falling to 500 Hz, as noiseBand
      // plays it), each twice as loud (+6 dB), the tone held fuller as it falls (thud's had died away by 20 dB in 50 ms)
      // and a little longer: 0.2 s, a heavy blow 0.24 s, a knockout 0.26 s. A heavy blow's tone stops at the ceiling (the
      // old haymaker already reached the master's limiter: more would only be squashed, and pump the music under it) and
      // takes its weight from a sub instead, a sine falling from 70 to 32 Hz over 0.3 s that swells in 40 ms after the
      // blow; a knockout, a short dark room after it (the hit through a 0.7 s room, low-passed at 600 Hz). Nothing bright:
      // no crack, no click. One body, one sub, one room, never a stack of low layers (the owner sent recorded, layered
      // impacts back as "muddled").
      // [x, peak, x; s (a blow, heavy, knockout); [share, s] the tone held to; sub [Hz, Hz, s, s, peak, knockout's peak];
      // room [s, s before, s decay, Hz, gain]]
      var THUD = { loud: 2, cap: 1.75, noise: 2.2, len: [0.2, 0.24, 0.26], held: [[0.42, 0.035], [0.68, 0.07]], sub: [70, 32, 0.3, 0.04, 0.6, 0.75], room: [0.7, 0.03, 0.16, 600, 0.42] };
      var NOISE1 = null, ROOM = null;
      function noise1(ac) { if (!NOISE1 || NOISE1.ac !== ac) { var n = ac.sampleRate, b = ac.createBuffer(1, n, ac.sampleRate), ch = b.getChannelData(0); for (var i = 0; i < n; i++) ch[i] = Math.random() * 2 - 1; NOISE1 = { ac: ac, b: b }; } return NOISE1.b; }
      // (into any context and output at any time, so the checks can render it offline and measure it)
      function thudLayers(ac, out, t0, kind, power, ko) {
        var p = clamp(power || 1, 0.5, 4), heavy = p >= 3 || kind === 'heavy' || !!ko, len = THUD.len[ko ? 2 : heavy ? 1 : 0], hd = THUD.held[heavy ? 1 : 0];
        var A = (0.5 + 0.25 * p) * THUD.loud, bus = ac.createGain(); if (heavy) A = Math.min(A, THUD.cap);
        bus.connect(out);
        // the tone
        var o = ac.createOscillator(), g = ac.createGain();
        o.type = 'sine'; o.frequency.setValueAtTime(120 + p * 30, t0); o.frequency.exponentialRampToValueAtTime(45, t0 + len * 0.8);
        g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(A, t0 + 0.006); g.gain.exponentialRampToValueAtTime(A * hd[0], t0 + hd[1]); g.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
        o.connect(g); g.connect(bus); o.start(t0); o.stop(t0 + len + 0.02);
        // the band of noise
        var nd = heavy ? 0.11 : 0.09, n = Math.floor(ac.sampleRate * nd), nb = ac.createBuffer(1, n, ac.sampleRate), ch = nb.getChannelData(0);
        for (var i = 0; i < n; i++) { var u = i / n; ch[i] = (Math.random() * 2 - 1) * Math.sin(PI * u) * (1 - u); }
        var s = ac.createBufferSource(), ng = ac.createGain(), f = ac.createBiquadFilter();
        f.type = 'bandpass'; f.Q.value = 1.2; f.frequency.setValueAtTime(2400, t0); f.frequency.exponentialRampToValueAtTime(500, t0 + nd);
        ng.gain.value = (0.35 + 0.2 * Math.min(p, 2)) * THUD.noise; s.buffer = nb; s.connect(f); f.connect(ng); ng.connect(bus); s.start(t0);
        // a heavy blow or a knockout: the sub
        if (heavy) {
          var S = THUD.sub, so = ac.createOscillator(), sg = ac.createGain();
          so.type = 'sine'; so.frequency.setValueAtTime(S[0], t0); so.frequency.exponentialRampToValueAtTime(S[1], t0 + S[2]);
          sg.gain.setValueAtTime(0.0001, t0); sg.gain.exponentialRampToValueAtTime(ko ? S[5] : S[4], t0 + S[3]); sg.gain.exponentialRampToValueAtTime(0.0001, t0 + S[2]);
          so.connect(sg); sg.connect(out); so.start(t0); so.stop(t0 + S[2] + 0.02);
        }
        // a knockout: the room (noise dying away, made once for the context, its energy one, so the room is as loud as
        // what goes into it; then dark)
        if (ko) {
          var R = THUD.room;
          if (!ROOM || ROOM.ac !== ac) {
            var sr = ac.sampleRate, m = Math.round(sr * R[0]), pd = Math.round(sr * R[1]), rb = ac.createBuffer(1, m, sr), rc = rb.getChannelData(0), e = 0, j;
            for (j = pd; j < m; j++) { var tt = (j - pd) / sr; rc[j] = (Math.random() * 2 - 1) * Math.exp(-tt / R[2]) * Math.min(1, tt / 0.004); e += rc[j] * rc[j]; }
            e = 1 / Math.sqrt(e || 1); for (j = 0; j < m; j++) rc[j] *= e;
            ROOM = { ac: ac, b: rb };
          }
          var cv = ac.createConvolver(), l1 = ac.createBiquadFilter(), l2 = ac.createBiquadFilter(), wg = ac.createGain();
          cv.normalize = false; cv.buffer = ROOM.b; l1.type = l2.type = 'lowpass'; l1.frequency.value = l2.frequency.value = R[3]; l1.Q.value = l2.Q.value = 0.5; wg.gain.value = R[4];
          bus.connect(cv); cv.connect(l1); l1.connect(l2); l2.connect(wg); wg.connect(out);
        }
      }
      function impactSound(kind, power, ko) {
        if (!audio || demo) return;
        var ac = audio.ctx; thudLayers(ac, audio.fx, ac.currentTime, kind, power, ko); IMP.sounds++;
        if (audio.venue && audio.venue.close && audio.music && audio.music.duck && ac.currentTime - venueDuckT > 0.4) { venueDuckT = ac.currentTime; audio.music.duck(2.5, 0.1); }
      }
      // A crowd's "ooh" on a big blow (open.impact, and a crowd the world placed: open.civilians as an object, a few of
      // them near): a cluster of voices, men's and women's, sung on the vowel through its two formants (about 330 and
      // 900 Hz, with nothing kept under 160 Hz), swelling in over a fifth of a second, rising a little and falling away
      // over a second; at most one every 1.6 s.
      function crowdOoh(k, ac, out, t0) {
        var live = !ac;
        if (live) {
          if (!audio || demo || !cfg.crowd || !player || DIR.time - (IMP.oohT == null ? -9 : IMP.oohT) < 1.6) return false;
          var n = 0; for (var i = 0; i < actors.length; i++) { var c = actors[i]; if (c.party && !c.ko && !c.turned && dist(c, player) < 24) n++; }
          if (n < 3) return false;
          k *= 0.6 + 0.4 * Math.min(1, n / 10); IMP.oohT = DIR.time; IMP.oohs++;
          ac = audio.ctx; out = audio.fx; t0 = ac.currentTime;
        }
        var bus = ac.createGain(), hp = ac.createBiquadFilter(), f1 = ac.createBiquadFilter(), f2 = ac.createBiquadFilter(), g2 = ac.createGain();
        hp.type = 'highpass'; hp.frequency.value = 160; hp.Q.value = 0.7;
        f1.type = 'bandpass'; f1.frequency.value = 330; f1.Q.value = 2.6; f2.type = 'bandpass'; f2.frequency.value = 900; f2.Q.value = 3.5; g2.gain.value = 0.45;
        bus.connect(f1); bus.connect(f2); f2.connect(g2); f1.connect(hp); g2.connect(hp);
        var env = ac.createGain(), peak = 0.42 * clamp(k, 0.3, 1.3);
        env.gain.setValueAtTime(0, t0); env.gain.linearRampToValueAtTime(peak, t0 + 0.22); env.gain.setTargetAtTime(peak * 0.75, t0 + 0.22, 0.2); env.gain.setTargetAtTime(0, t0 + 0.55, 0.22);
        hp.connect(env); env.connect(out);
        var lfo = ac.createOscillator(), lg = ac.createGain(); lfo.frequency.value = 5.3; lg.gain.value = 22; lfo.connect(lg); lfo.start(t0); lfo.stop(t0 + 1.5);
        [112, 128, 141, 166, 196, 218, 247].forEach(function (f0, j) {
          var o = ac.createOscillator(), g = ac.createGain(), d = t0 + Math.random() * 0.07, f = f0 * (0.97 + Math.random() * 0.06);
          o.type = 'sawtooth'; o.frequency.setValueAtTime(f * 0.94, d); o.frequency.linearRampToValueAtTime(f * 1.03, d + 0.25); o.frequency.exponentialRampToValueAtTime(f * 0.88, d + 1.15);
          o.detune.value = (Math.random() - 0.5) * 30; lg.connect(o.detune);
          g.gain.value = j < 4 ? 0.16 : 0.12; o.connect(g); g.connect(bus); o.start(d); o.stop(t0 + 1.5);
        });
        // breath under the voices
        var s = ac.createBufferSource(), sg = ac.createGain(); s.buffer = noise1(ac); sg.gain.value = 0.05; s.connect(sg); sg.connect(bus); s.start(t0, Math.random() * 0.4, 1.4);
        return true;
      }

      /* ------------------------------------------------------ weapons -- */
      // Hidden weapons (the owner, 28 Sep: "he should be able to obtain hidden
      // weapons and use them"): street weapons lie about the map, leaning in an
      // alley, on a bin, under a lifeguard tower, glinting now and then for
      // whoever looks. Walk over one to take it (E swaps it for the one in your
      // hand); it swings harder and further than a fist, and wears out. A biker
      // or an officer put down may drop his. Melee only, as the owner chose.
      // A weapon hits like one (the owner, 3 Oct: "the weapons should pack way more punch and destruction, otherwise
      // the game is nearly impossible"): any swing puts a street fighter down, a knockout sends him flying into whoever
      // stands behind him, the swing sweeps a wide arc, and it lasts half as long again. A boss takes half of it.
      var WEAPONS = {
        bat:   { name: 'Bat',    power: [5, 5, 8],    reach: 1.95, rate: 1.2,  hits: 24 },
        pipe:  { name: 'Pipe',   power: [5, 5, 8],    reach: 1.9,  rate: 1.15, hits: 33 },
        baton: { name: 'Baton',  power: [4, 4, 6],    reach: 1.75, rate: 1.4,  hits: 39 },
        chain: { name: 'Chain',  power: [4, 4, 7],    reach: 2.3,  rate: 1.1,  hits: 27 },
        sword: { name: 'Katana', power: [7, 7, 11],   reach: 2.15, rate: 1.3,  hits: 18 },
        // a fighting staff (MogDune's hero): the longest reach, a third blow that sweeps
        staff: { name: 'Staff',  power: [6, 6, 10],   reach: 2.5,  rate: 1.2,  hits: 45, chain: ['slash1', 'slash2', 'slash3'] },
        knife: { name: 'Knife',  power: [4, 4, 6],    reach: 1.5,  rate: 1.5,  hits: 45 },
        // A party's weapons (AI Alps, the owner 4 Oct: "he can pick up bottles, glasses and beat club goers over the
        // head"). They turn up only where a world names them (weapons.kinds, or a spot's kind), so every other world keeps
        // the street's mix. Short reach, thrown with the right hand as punches are (the freeflow cross first, whose fist
        // comes in high and brings a bottle, tipped forward in the hand, down onto the head; a list is the first of them
        // the body has), from a boxer's stance rather than the sword's guard. A
        // bottle or a glass breaks on the head it lands on, the first time; a magnum takes two; the ice bucket dents twice
        // and gives out on the third. fly: a knockout's flight against a street weapon's; shove: how far a blow slides
        // him; react: his flinch; glass: its shards and what was in it; dent: dents instead of breaking, its ice spilling
        // when it gives out; base: the end it stands on (1, the far end, so it is turned over to stand); glint: false, no
        // glint while it stands on a bar or a table (it is in plain sight)
        bottle: { name: 'Bottle', power: [6, 6, 8], reach: 1.25, rate: 1.4, hits: 1, chain: [['ffCross', 'cross'], ['ffHook', 'hook'], 'cross'], stance: 'fight', fly: 0, shove: 0.3, react: 'hitHead', glass: { shard: '#2E6B40', liquid: '#5C0B1E', n: 26 }, base: 1, glint: false },
        magnum: { name: 'Magnum', power: [8, 8, 10], reach: 1.35, rate: 1.3, hits: 2, chain: [['ffCross', 'cross'], 'cross', ['ffHook', 'hook']], stance: 'fight', fly: 0.35, shove: 0.45, react: 'hitHead', glass: { shard: '#235A36', liquid: '#F1D98A', n: 34, heavy: true }, base: 1, glint: false },
        glass:  { name: 'Glass',  power: [4, 4, 6], reach: 1.15, rate: 1.55, hits: 1, chain: ['cross', ['ffHook', 'hook'], ['ffCross', 'cross']], stance: 'fight', fly: 0, shove: 0.3, react: 'hitHead', glass: { shard: '#DCE8EC', liquid: '#C27A2A', n: 20, thin: true }, base: -1, glint: false },
        bucket: { name: 'Ice bucket', power: [5, 5, 7], reach: 1.4, rate: 1.3, hits: 3, chain: [['ffCross', 'cross'], ['ffHook', 'hook'], 'cross'], stance: 'fight', fly: 0.5, shove: 0.55, react: 'hitHead', dent: { shard: '#E4F2F8', liquid: '#CFE6F2', n: 16, big: true }, base: -1, glint: false },
      };
      var WCHAIN = ['slash1', 'slash2', 'slash1'];
      // a weapon's own say in how it is held and what it does (a party's: its stance, flight, shove, flinch); a street
      // weapon has none, so it keeps the sword's guard and everything else as it was
      function wStat(w, key, d) { var x = w && WEAPONS[w.kind]; return x && x[key] != null ? x[key] : d; }
      // a blow named in a weapon's chain: the clip, or the first of a list the body has
      // (open.impact: past the freeflow hook to the boxer's, whose fist reaches the head: FFPI)
      function wclip(e) { if (typeof e === 'string') return e; for (var i = 0; i < e.length; i++) if (hasMove(player, e[i]) && !(cfg.impact && e[i] === 'ffHook' && i < e.length - 1)) return e[i]; return e[e.length - 1]; }
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
        var y = o.y != null ? o.y : groundAt(x, z), wk = WEAPONS[kind], party = !!(wk && (wk.glass || wk.dent));
        if (o.stand) {
          // stood upright where it was put (a bottle on a bar top, a glass on a table), turned over if its foot is the
          // far end from the hand
          var tilt = w.children && w.children[0] && w.children[0].geometry ? w.children[0].geometry.userData.tilt || 0 : 0;
          if (wk && wk.base > 0) w.rotation.x = PI - tilt;
          g.rotation.y = o.yaw != null ? o.yaw : Math.random() * TAU;
        } else if (o.lean != null) {
          // stood on its end against a wall, tipped back into it
          w.position.y = 0.27; w.rotation.x = 0.32; g.rotation.y = o.lean;
        } else { w.rotation.z = PI / 2; w.position.y = kind === 'chain' ? 0.02 : 0.035; g.rotation.y = o.yaw != null ? o.yaw : Math.random() * TAU; }
        // a party's props sit on the surface by their own measure (a magnum lying down is 11 cm across)
        if (o.stand || party) { w.position.y = 0; g.updateMatrixWorld(true); w.position.y = -new THREE.Box3().setFromObject(w, true).min.y + 0.001; }
        g.position.set(x, y, z);
        g.traverse(function (m) { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
        var gl = new THREE.Sprite(glintMat.clone()); gl.scale.setScalar(0.001); gl.position.set(x, y + (o.lean != null ? 0.55 : 0.12), z); gl.renderOrder = 6;
        scene.add(g); scene.add(gl);
        var q = { kind: kind, x: x, z: z, y: y, obj: g, glint: gl, t: 0, ph: Math.random() * 3, hits: o.hits || WEAPONS[kind].hits, dropped: !!o.dropped, spot: o.spot || null };
        if (o.stand && wk && wk.glint === false) q.still = true;
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
        // the world's own places (open.weapons.spots: its bars and tables), and then nowhere else
        var sp = cfg.weapons && cfg.weapons.spots;
        if (sp) { sp.forEach(function (h) { if (h.x >= W.x0 && h.x <= W.x1 && h.z >= W.z0 && h.z <= W.z1) HIDE.push({ x: h.x, z: h.z, y: h.y, lean: h.lean, kind: h.kind, stand: h.stand, yaw: h.yaw, used: false }); }); return; }
        if (HIDE.length < 6) for (var i = 0; i < 24; i++) { var p = openSpot((W.x0 + W.x1) / 2, (W.z0 + W.z1) / 2, 0, Math.max(W.x1 - W.x0, W.z1 - W.z0) / 2); HIDE.push({ x: p.x, z: p.z, used: false }); }
      }
      function hideOne(far) {
        var free = HIDE.filter(function (h) { return !h.used && (!player || Math.hypot(h.x - player.x, h.z - player.z) > far); });
        if (!free.length) return null;
        var h = free[Math.floor(Math.random() * free.length)]; h.used = true;
        return placePick(h.kind && WEAPONS[h.kind] ? h.kind : pickKind(), h.x, h.z, { y: h.y, lean: h.lean, spot: h, stand: h.stand, yaw: h.yaw });
      }
      function hideAll() {
        PICKS.slice().forEach(removePick);
        HIDE.forEach(function (h) { h.used = false; });
        if (!cfg.weapons || !player || !player.e.prop) return;
        // (a world's own spots are all there from the start, the one beside him too: they stand on its bars)
        for (var i = 0; i < cfg.weapons.count; i++) hideOne(cfg.weapons.spots ? 0 : 6);
        hideT = 0;
      }
      function stepPicks(dt) {
        if (!cfg.weapons) return;
        // another turns up somewhere else now and then, out of sight
        // (on a world's own spots, its bars and tables, a taken one is put back once he is out of arm's reach of it: a
        // party's bars all stand within the fight, and 28 m off would never restock them)
        hideT += dt;
        if (hideT > (cfg.weapons.every || 30) && state === 'race') { hideT = 0; if (PICKS.filter(function (q) { return !q.dropped; }).length < cfg.weapons.count) hideOne(cfg.weapons.spots ? 2.5 : 28); }
        PL.near = null;
        var nd = 1.15;
        for (var i = PICKS.length - 1; i >= 0; i--) {
          var q = PICKS[i]; q.t += dt;
          if (q.dropped && q.t > 45) { removePick(q); continue; }
          // a glint every few seconds, brief, as if the sun caught it
          var far = player ? Math.hypot(q.x - player.x, q.z - player.z) : 99;
          var c = (q.t + q.ph) % 3.2, g = far < 32 && c < 0.35 && !q.still ? Math.sin(c / 0.35 * PI) : 0;
          q.glint.scale.setScalar(0.001 + g * 0.55); q.glint.material.opacity = g;
          if (player && !player.ko && far < nd && Math.abs(q.y - player.y) < 1.2) { nd = far; PL.near = q; }
        }
        // bare hands take the first one they come to
        if (PL.near && !PL.weapon && state === 'race' && PL.pickT <= 0 && PL.punching <= 0 && PL.air <= 0 && !PL.dodge && !PL.dash && !player.ko) grab();
      }
      function grab() {
        var q = PL.near;
        if (!q || !player || player.ko || PL.pickT > 0 || PL.air > 0 || player.stun > 0 || PL.dodge || PL.dash || PL.fin) return;
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
        PL.prop = player.e.arm({ kind: q.kind });
        // a swap leaves the old one where the new one was
        if (had && had.hits > 0) placePick(had.kind, player.x + Math.sin(player.yaw + 1.2) * 0.7, player.z + Math.cos(player.yaw + 1.2) * 0.7, { hits: had.hits, dropped: true });
        say((had ? 'Swapped for ' : 'Found ') + (q.kind === 'sword' ? 'a katana' : (/^[aeiou]/i.test(WEAPONS[q.kind].name) ? 'an ' : 'a ') + WEAPONS[q.kind].name.toLowerCase()));
        emit('weapon', { kind: q.kind });
        // a party's: the clink of glass picked up (the rattle of the bucket's ice)
        if (WEAPONS[q.kind].glass || WEAPONS[q.kind].dent) glassClink(!!WEAPONS[q.kind].dent); else SFX.coin();
        lastHud = '';
      }
      // (on: the man the last blow landed on, where a party's weapon breaks)
      function breakWeapon(on) {
        var k = PL.weapon && PL.weapon.kind; if (!k || PL.weapon.keep) return;
        var wk = WEAPONS[k], party = !!(wk.glass || wk.dent);
        if (party) partyBreak(k, wk, on);
        PL.weapon = null; PL.prop = null; player.e.arm(null); lastHud = '';
        if (party) return;
        say('The ' + WEAPONS[k].name.toLowerCase() + ' broke');
        if (audio && !demo) noiseBand(0.22, 0.2, 1800, 5200);
      }
      function disarm() {
        PL.weapon = null; lastHud = '';
        // the hero's own weapon goes back in hand
        if (cfg.heroWeapon && WEAPONS[cfg.heroWeapon]) PL.weapon = { kind: cfg.heroWeapon, hits: Infinity, max: Infinity, keep: true };
        if (player && player.e.arm) player.e.arm(PL.weapon ? { kind: PL.weapon.kind } : null);
      }
      // A party's weapon breaking (a bottle, a magnum, a glass): it shatters on the head it hit, at the blow: shards of
      // its own glass thrown on the way the blow went, spinning, falling, skittering on the ground and gone in a second
      // and a bit, a spray of what was in it (wine, champagne, whisky) and the smash. The ice bucket gives out instead:
      // its ice and water spill, it clangs, and it lies crumpled on the floor a while. (the man it hit; without one, where
      // the prop is.) Their own pools, made the first time anything breaks, so no other world carries them, because
      // burst() recolours every particle alive.
      var SHDN = 72, LQN = 160, SHD = null, GLS = { smashes: 0, knocks: 0, clangs: 0, shattered: 0, last: null };
      function shardPools() {
        if (SHD) return SHD;
        var geo = new THREE.TetrahedronGeometry(1, 0); geo.scale(0.013, 0.0028, 0.021);
        var mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.05, metalness: 0.45, envMapIntensity: 3, emissive: '#3A3A3A', transparent: true, opacity: 0.9 }), SHDN);
        var d = new THREE.Object3D(); d.position.set(0, -9999, 0); d.scale.setScalar(0.0001); d.updateMatrix();
        for (var i = 0; i < SHDN; i++) { mesh.setMatrixAt(i, d.matrix); mesh.setColorAt(i, new THREE.Color('#FFFFFF')); }
        mesh.frustumCulled = false; mesh.renderOrder = 5; scene.add(mesh);
        var lg = new THREE.BufferGeometry(), LP = new Float32Array(LQN * 3), LC = new Float32Array(LQN * 3);
        for (var j = 0; j < LQN; j++) LP[j * 3 + 1] = -9999;
        lg.setAttribute('position', new THREE.BufferAttribute(LP, 3)); lg.setAttribute('color', new THREE.BufferAttribute(LC, 3));
        var pts = new THREE.Points(lg, new THREE.PointsMaterial({ size: 0.065, map: spTex, vertexColors: true, transparent: true, depthWrite: false, opacity: 0.95 }));
        pts.frustumCulled = false; pts.renderOrder = 5; scene.add(pts);
        SHD = { mesh: mesh, d: d, c: new THREE.Color(), next: 0, live: 0, P: new Float32Array(SHDN * 3), V: new Float32Array(SHDN * 3), R: new Float32Array(SHDN * 3), W: new Float32Array(SHDN * 3), S: new Float32Array(SHDN), life: new Float32Array(SHDN),
          lg: lg, LP: LP, LC: LC, LV: new Float32Array(LQN * 3), LL: new Float32Array(LQN), lnext: 0, wet: 0, junk: [] };
        return SHD;
      }
      // (from: where the bottle was in his hand: the shards burst along the last of its swing into the head)
      function shatter(x, y, z, dx, dz, look, from) {
        var S = shardPools(), n = look.n || 24, k, j, u;
        for (var i = 0; i < n; i++) {
          j = S.next++ % SHDN; k = j * 3; u = from ? 0.35 + Math.random() * 0.65 : 1;
          var fw = 0.6 + Math.random() * 2.6, side = (Math.random() - 0.5) * 2.2;
          S.P[k] = (from ? from.x + (x - from.x) * u : x) + (Math.random() - 0.5) * 0.12; S.P[k + 1] = (from ? from.y + (y - from.y) * u : y) + (Math.random() - 0.5) * 0.1; S.P[k + 2] = (from ? from.z + (z - from.z) * u : z) + (Math.random() - 0.5) * 0.12;
          // on the way the blow went, spread either side of it, and up
          S.V[k] = dx * fw + dz * side * 1.7 + (Math.random() - 0.5) * 0.8; S.V[k + 1] = 0.4 + Math.random() * 2.3; S.V[k + 2] = dz * fw - dx * side * 1.7 + (Math.random() - 0.5) * 0.8;
          S.R[k] = Math.random() * TAU; S.R[k + 1] = Math.random() * TAU; S.R[k + 2] = Math.random() * TAU;
          S.W[k] = (Math.random() - 0.5) * 34; S.W[k + 1] = (Math.random() - 0.5) * 20; S.W[k + 2] = (Math.random() - 0.5) * 34;
          S.S[j] = (look.big ? 1.8 : 1) + Math.random() * (look.big ? 1.6 : 1.4);
          S.life[j] = 1 + Math.random() * 0.45;
          S.mesh.setColorAt(j, S.c.set(look.shard).offsetHSL(0, 0, (Math.random() - 0.3) * 0.12));
        }
        S.mesh.instanceColor.needsUpdate = true; S.live = Math.min(SHDN, S.live + n);
        // what was in it, flung off his head; and a few drops catching the light
        var m = n * 2 + 10;
        for (i = 0; i < m; i++) {
          j = S.lnext++ % LQN; k = j * 3;
          var glint = i >= m - 8, an = Math.atan2(dx, dz) + (Math.random() - 0.5) * 2.6, v = 0.8 + Math.random() * (glint ? 3.2 : 2.4);
          S.LP[k] = x; S.LP[k + 1] = y + (Math.random() - 0.3) * 0.12; S.LP[k + 2] = z;
          S.LV[k] = Math.sin(an) * v; S.LV[k + 1] = 0.4 + Math.random() * 2.4; S.LV[k + 2] = Math.cos(an) * v;
          S.LL[j] = glint ? 0.12 + Math.random() * 0.16 : 0.35 + Math.random() * 0.45;
          S.c.set(glint ? '#FFFFFF' : look.liquid); S.LC[k] = S.c.r; S.LC[k + 1] = S.c.g; S.LC[k + 2] = S.c.b;
        }
        S.lg.attributes.color.needsUpdate = true; S.wet = Math.min(LQN, S.wet + m);
      }
      function stepShards(dt) {
        var S = SHD, d = S.d, live = 0, k, gy, i;
        // a crumpled bucket lies where it fell a while, then sinks away
        for (i = S.junk.length - 1; i >= 0; i--) { var J = S.junk[i]; J.t += dt; if (J.t > 7) J.g.position.y -= dt * 0.25; if (J.t > 8) { scene.remove(J.g); S.junk.splice(i, 1); } }
        // (no shard and no drop alive last frame, and none thrown since: the buffers are as they were, and nothing is
        // sent to the graphics card again; the pools are made before the first frame with open.warm)
        if (!S.live && !S.wet) return;
        for (i = 0; i < SHDN; i++) {
          if (S.life[i] <= 0) continue;
          S.life[i] -= dt; k = i * 3;
          if (S.life[i] <= 0) { d.position.set(0, -9999, 0); d.rotation.set(0, 0, 0); d.scale.setScalar(0.0001); d.updateMatrix(); S.mesh.setMatrixAt(i, d.matrix); continue; }
          live++;
          S.V[k + 1] -= 9.8 * dt;
          S.P[k] += S.V[k] * dt; S.P[k + 1] += S.V[k + 1] * dt; S.P[k + 2] += S.V[k + 2] * dt;
          gy = groundAt(S.P[k], S.P[k + 2]) + 0.003;
          if (S.P[k + 1] < gy) {
            S.P[k + 1] = gy;
            // a bounce off the floor, then a skitter that dies, lying flat
            if (S.V[k + 1] < -0.9) { S.V[k + 1] *= -0.28; S.V[k] *= 0.55; S.V[k + 2] *= 0.55; S.W[k] *= 0.5; S.W[k + 1] *= 0.5; S.W[k + 2] *= 0.5; }
            else { var fr = Math.max(0, 1 - 7 * dt); S.V[k + 1] = 0; S.V[k] *= fr; S.V[k + 2] *= fr; S.W[k] = S.W[k + 2] = 0; S.W[k + 1] *= fr; S.R[k] = S.R[k + 2] = 0; }
          }
          S.R[k] += S.W[k] * dt; S.R[k + 1] += S.W[k + 1] * dt; S.R[k + 2] += S.W[k + 2] * dt;
          d.position.set(S.P[k], S.P[k + 1], S.P[k + 2]); d.rotation.set(S.R[k], S.R[k + 1], S.R[k + 2]); d.scale.setScalar(S.S[i] * Math.min(1, S.life[i] / 0.35)); d.updateMatrix(); S.mesh.setMatrixAt(i, d.matrix);
        }
        S.mesh.instanceMatrix.needsUpdate = true; S.live = live;
        var wet = 0;
        for (i = 0; i < LQN; i++) {
          k = i * 3;
          if (S.LL[i] <= 0) { S.LP[k + 1] = -9999; continue; }
          S.LL[i] -= dt; S.LV[k + 1] -= 9.8 * dt; wet++;
          S.LP[k] += S.LV[k] * dt; S.LP[k + 1] += S.LV[k + 1] * dt; S.LP[k + 2] += S.LV[k + 2] * dt;
          if (S.LP[k + 1] < groundAt(S.LP[k], S.LP[k + 2])) S.LL[i] = 0;
        }
        S.lg.attributes.position.needsUpdate = true; S.wet = wet;
      }
      // a party's weapon dented by the blows it has landed (the ice bucket): squashed the way it was swung, wider across
      function dentProp(g, n) {
        if (!g || !g.children || !g.children.length || !g.children[0].geometry) return;
        var g0 = g.children[0].geometry; if (!g0.boundingBox) g0.computeBoundingBox();
        var c = g0.boundingBox.getCenter(V3A), sx = 1 + 0.07 * n, sy = 1 - 0.04 * n, sz = 1 - 0.15 * n;
        g.children.forEach(function (m) { m.scale.set(sx, sy, sz); m.position.set(c.x * (1 - sx), c.y * (1 - sy), c.z * (1 - sz)); });
      }
      // a blow that lands and does not break it: the knock of a heavy bottle, or the bucket's clang and a dent
      function partyKnock(wk, on) {
        void on;
        if (wk.dent) { steelClang(false); if (!PL.weapon.keep) dentProp(PL.prop, PL.weapon.max - PL.weapon.hits); }
        else glassKnock(PL.hitPower);
      }
      function partyBreak(k, wk, on) {
        var x, y, z, dx = Math.sin(player.yaw), dz = Math.cos(player.yaw), from = null;
        if (PL.prop && PL.prop.parent) { PL.prop.updateMatrixWorld(true); from = PL.prop.getWorldPosition(new THREE.Vector3()); }
        if (on) {
          // on his head, the near side of it
          var dd = dist(player, on) || 1; dx = (on.x - player.x) / dd; dz = (on.z - player.z) / dd;
          x = on.x - dx * 0.12; y = (on.y || 0) + (on.lift || 0) + (on.h || 1.8) * 0.9; z = on.z - dz * 0.12;
        } else if (from) { x = from.x; y = from.y; z = from.z; from = null; }
        else { x = player.x + dx * 0.7; y = (player.y || 0) + 1.5; z = player.z + dz * 0.7; }
        var look = wk.glass || wk.dent;
        // (a bottle further from his head than a swing could carry it breaks on the head alone)
        if (from && Math.hypot(from.x - x, from.y - y, from.z - z) > 1.2) from = null;
        shatter(x, y, z, dx, dz, look, from);
        GLS.shattered++; GLS.last = { kind: k, x: +x.toFixed(2), y: +y.toFixed(2), z: +z.toFixed(2), on: on ? on.id : null };
        if (wk.glass) {
          glassSmash(!!look.thin, !!look.heavy, PL.hitPower);
          // (and the knockout it gave, said in the same line: said alone, the knockout's line was gone at once)
          say('The ' + wk.name.toLowerCase() + ' shattered' + (on && on.ko && on.koT === 0 && on.koSay ? '. ' + on.koSay : ''));
          emit('shatter', { kind: k });
          return;
        }
        // the bucket: crumpled at his feet
        steelClang(true);
        var jb = player.e.prop ? player.e.prop({ kind: k }) : null;
        if (jb) {
          dentProp(jb, 4); jb.rotation.z = PI / 2;
          var jg = new THREE.Group(); jg.add(jb); jg.updateMatrixWorld(true); jb.position.y = -new THREE.Box3().setFromObject(jb, true).min.y;
          var jx = on ? on.x + dx * 0.5 : x, jz = on ? on.z + dz * 0.5 : z;
          jg.position.set(jx, groundAt(jx, jz), jz); jg.rotation.y = Math.random() * TAU; scene.add(jg);
          SHD.junk.push({ g: jg, t: 0 });
        }
        say('The ' + wk.name.toLowerCase() + ' gave out' + (on && on.ko && on.koT === 0 && on.koSay ? '. ' + on.koSay : ''));
      }

      /* ---------------------------------------------------------- you -- */
      var PL = { combo: 0, until: 0, queued: false, air: 0, vy: 0, jumpBuf: 0, hitAt: -1, hitPower: 0, punching: 0, lock: null, regenT: 0, weapon: null, near: null, pickT: 0, picking: null, fightT: -9,
        dodge: null, counterUntil: 0, slowT: 0, slowK: 1, warned: 0 };
      // [clip, rate, power, reach]
      var BLOW = { jab: [1.7, 1, 1.05], cross: [1.55, 1, 1.1], hook: [1.35, 2, 1.2], upperL: [1.5, 1, 1.0], uppercut: [1.3, 2, 1.05], body: [1.5, 1, 1.05] };
      var CHAIN = [['jab'], ['cross'], ['hook']];
      // a big fight (the boss, or four or more at once) runs longer and mixes it
      // up: to the body, uppercuts from either hand, a heavy uppercut to finish
      // (the owner, 30 Sep: "more variations in punches")
      var BIGCHAIN = [['jab', 'body'], ['cross', 'upperL'], ['hook', 'body'], ['upperL', 'jab'], ['uppercut']];
      // Freeflow (the owner, 3 Oct: Spiderbench's combat, "more style and speed when fighting, including kicks"; later
      // the same day: "it should kick much less"): a four-blow chain of punches that ends on a rising uppercut or a
      // haymaker, now and then a roundhouse (one ender in five), thrown a third faster, and a dash in to whoever you go
      // for (up to 5.2 m; only from 4.4 m is the blow the leaping kick). A list names a blow twice to throw it twice as often.
      // Bare hands only: a weapon keeps its own three swings. [clip, rate, power, reach]
      var FF = {
        jab: ['ffJab', 1.3, 1, 1.0], cross: ['ffCross', 1.3, 1, 1.0], hook: ['ffHook', 1.35, 1.5, 1.05], kick: ['ffKick', 1.4, 1.5, 1.2],
        roundhouse: ['ffKick', 1.15, 3, 1.25], riser: ['ffRiser', 1.2, 3, 1.05], leap: ['ffLeap', 1.15, 3, 1.15], haymaker: ['ffHook', 1.15, 3, 1.1],
      };
      var FFCHAIN = [['jab', 'cross'], ['cross', 'hook'], ['hook', 'jab'], ['riser', 'riser', 'haymaker', 'haymaker', 'roundhouse']];
      // A hero who only punches (open.kicks: false; AI Alps, the owner 4 Oct: "no kicks. just an array of punches"):
      // the freeflow punches and the boxer's captured blows (the body shot, the lead and the rear uppercut, each checked
      // on a body frame by frame), a five-blow chain that ends on the rear uppercut or the haymaker, and a held attack
      // (heavy) that throws the haymaker with everything behind it. No riser: its knee comes up as if he would jump.
      // [clip, rate, power, reach]
      var FFP = {
        jab: FF.jab, cross: FF.cross, hook: FF.hook, body: ['body', 1.4, 1.5, 1.0], upperL: ['upperL', 1.4, 1, 1.0],
        // (the held one is the boxer's own looping hook, not the chain's: a hold should look like more than a tap)
        uppercut: ['uppercut', 1.25, 3, 1.05], haymaker: FF.haymaker, heavy: ['hook', 0.9, 5, 1.2],
      };
      var FFPCHAIN = [['jab', 'cross'], ['cross', 'hook'], ['hook', 'body'], ['body', 'upperL', 'hook'], ['uppercut', 'haymaker']];
      // (open.impact: the hook and the haymaker on the boxer's looping hook, whose fist reaches the face: the freeflow
      // hook's never goes 0.4 m out from him, so it could not land on anyone standing in front of him. The chain's
      // hook, a touch quicker than the freeflow one, so it lands by a quarter of a second as that did, and his guard is back
      // as soon (the tank's forearms: TANK.open)
      var FFPI = Object.assign({}, FFP, { hook: ['hook', 1.4, 1.5, 1.05], haymaker: ['hook', 1.15, 3, 1.1] });
      // (and so the held haymaker, the slow boxer's hook, would be the motion just thrown after the chain's hook or
      // haymaker, or after a held one: then the hold throws the boxer's rear uppercut instead, at its captured pace (it
      // lands 0.42 s in, from the fist's own moment: IMPF), with the held blow's power and reach, and HEAVY's falloff and
      // rest as for the hook. Never the motion just thrown, held or not: startFlow)
      var HEAVYUP = ['uppercut', 1.0, 5, 1.2];
      // the clip the last blow threw (a held one's as it was thrown)
      function lastClip() { var BT = cfg.kicks ? FF : cfg.impact ? FFPI : FFP; return PL.last === 'heavy' && PL.heavyClip ? PL.heavyClip : PL.last && BT[PL.last] ? BT[PL.last][0] : null; }
      var DASH = { max: 5.2, leap: 4.4, speed: 12, within: 1.35 };
      // Dodge, counter and the warning (stage 2 of Spiderbench's combat, the owner 3 Oct): C or L (DODGE on a touch
      // screen) flips the hero clear, a back flip away from the blow, or a side flip where the stick points, safe from
      // harm for 0.55 s. A man winding up shows the warning over his head in the last 0.8 s before his blow lands, and a
      // dodge in its last 0.3 s is perfect: time slows, and the next blow is a counter, an ender 1.6 times as hard.
      // [clip, rate, metres, delay]
      var DODGE = { back: ['ffDodge', 1.45, 3.4, 0.1], side: ['ffDodgeSide', 1.35, 3.2, 0.05], ease: 0.48, safe: 0.55, again: 0.4, perfect: 0.3, late: 0.05, counter: 1.4, mult: 1.6, warn: 0.8 };
      // the safety runs on its own clock: a counter thrown out of the flip does not end it
      function dodgeSafe() { return DIR.time < (PL.safeUntil || 0); }
      // the blow coming soonest: the man whose blow lands next, within the warning
      function threat() {
        var b = null;
        for (var i = 0; i < actors.length; i++) {
          var a = actors[i]; if (a === player || a.ko || a.hitT == null || !(a.state === 'windup' || a.state === 'strike' && !a.struck)) continue;
          var r = a.hitT - DIR.time; if (r < -0.08 || r > DODGE.warn) continue;
          if (!b || a.hitT < b.hitT) b = a;
        }
        return b;
      }
      function slowmo(dur, k) { if (PL.slowT > 0 && PL.slowK < k) return; PL.slowT = Math.max(PL.slowT || 0, dur); PL.slowK = k; }
      // he commits to his blow as he winds up, so the warning knows when it lands
      function warnOf(a) {
        var sp = a.sp, mvs = BIG.on && !a.weapon && sp.moves.indexOf('jab') >= 0 ? sp.moves.concat(['upperL', 'uppercut', 'body'].filter(function (n) { return hasMove(a, n); })) : sp.moves;
        a.next = mvs[Math.floor(Math.random() * mvs.length)]; a.hinted = false; a.pilotSaw = false;
        var rate = /slash|dash/.test(a.next) ? 1.25 : 1.45, ci = a.creature ? creatureTiming(a.e, a.next) : clipInfo(a.body, a.next);
        a.hitT = DIR.time + sp.windup + ci.contact / rate;
      }
      // the warning (the owner, 3 Oct: no icon over his head, it distracted): the first two blows of a run slow time a
      // moment as they near and say how to dodge; after that the wind-up is the warning
      var TOUCHY = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
      function stepWarnings() {
        // (a hero who cannot dodge, open.dodge: false, is never told to)
        if (demo || state !== 'race' || (PL.warned || 0) >= 2 || !cfg.dodge) return;
        for (var i = 0; i < actors.length; i++) {
          var a = actors[i]; if (a === player || a.ko || a.hitT == null || a.hinted || !(a.state === 'windup' || a.state === 'strike' && !a.struck)) continue;
          var r = a.hitT - DIR.time; if (r >= 0.5 || r <= 0.2) continue;
          a.hinted = true;
          if (PL.air <= 0 && canDodge() && (!TRAV || travLive && TRAV.state.mode === 'ground')) { PL.warned = (PL.warned || 0) + 1; slowmo(0.28, 0.45); say(TOUCHY ? 'Dodge!' : 'Dodge: C'); }
        }
      }
      // Focus, the finisher and the heal (stage 3 of Spiderbench's combat): every blow that lands fills focus (a heavy one
      // twice as much, more the longer the run of blows), a perfect dodge a good deal; three bars at most. R spends one on a
      // finisher (two on a boss): the hero closes in and a flying kick puts the man down for good, the camera in close and
      // time slowed, no harm to him meanwhile. Z spends one on a heal.
      var FOCUS = { light: 0.075, heavy: 0.14, perfect: 0.35, max: 3, chain: 15, lapse: 3.2, heal: 35 };
      function gainFocus(n, power) {
        if (DERBY || !player || player.creature) return;
        if (DIR.time - (PL.lastHitT || -9) > FOCUS.lapse) PL.chain = 0;
        for (var i = 0; i < n; i++) { PL.chain = (PL.chain || 0) + 1; PL.focus = Math.min(FOCUS.max, (PL.focus || 0) + (power >= 3 ? FOCUS.heavy : FOCUS.light) * (1 + Math.min(1, PL.chain / FOCUS.chain))); }
        PL.lastHitT = DIR.time;
      }
      function finCost(a) { return a && a.boss ? 2 : 1; }
      // a world of levels: the edge of a roof between the hero and him (the street below it)
      function dropBetween(p, q) { var n = Math.max(1, Math.ceil(dist(p, q) / 0.5)), hi = Math.max(p.y, q.y) + 0.4, lo = Math.min(p.y, q.y) - 0.65; for (var k = 1; k < n; k++) { var u = k / n; if (floorAt(p.x + (q.x - p.x) * u, p.z + (q.z - p.z) * u, hi) < lo) return true; } return false; }
      // the one a finisher is for: the nearest foe within 7 m (less wading) that he faces most nearly, on his own level and
      // with no drop between them, if there is focus to spend on him
      function finTarget() {
        if (!player || player.ko || DERBY || player.creature || PL.fin || PL.air > 0 || (TRAV && (!travLive || TRAV.state.mode !== 'ground'))) return null;
        var best = null, bs = 1e9;
        for (var i = 0; i < actors.length; i++) {
          var a = actors[i]; if (a === player || a.ko || a.kind === 'civ' || a.fade < 1 || a.car || a.air || (a.lift || 0) > 0.3 || a.downT > 0 || (climbOn() && Math.abs(a.y - player.y) > 1.8)) continue;
          var d = dist(player, a); if (d > 7 * wade(player) || (climbOn() && dropBetween(player, a))) continue;
          var y = yawTo(player, a.x, a.z) - player.yaw; while (y > PI) y -= TAU; while (y < -PI) y += TAU;
          var sc = d * 0.6 + Math.abs(y) * 3.2; if (sc < bs) { bs = sc; best = a; }
        }
        return best && (PL.focus || 0) >= finCost(best) ? best : null;
      }
      function finisher() {
        var a = finTarget();
        if (!a) { if (player && !DERBY && !player.creature && (PL.focus || 0) < 1 && state === 'race') say('Need focus'); return null; }
        PL.focus -= finCost(a); PL.fin = { a: a, t: 0, done: false }; PL.finishers = (PL.finishers || 0) + 1; PL.imp = null;
        PL.dodge = null; PL.dash = null; PL.punching = 0; PL.queued = false; PL.safeUntil = DIR.time + 1.5;
        // he is held for it: no blow of his own, no warning
        a.stun = 3; a.hitT = null; a.next = null; if (a.token) { a.token = false; tokens = Math.max(0, tokens - 1); } a.state = 'circle';
        player.yaw = yawTo(player, a.x, a.z);
        if (!cfg.kicks) finPunch(a);
        else {
          var fc = hasMove(player, 'ffFinisher') ? 'ffFinisher' : 'uppercut'; PL.finPlayed = [fc];
          play(player, fc, 1);
          slowmo(1.2, 0.45); if (!travOn()) CAM.cine = { a: a, t: 0, dur: 1.45, side: 0 };
        }
        whoosh(); say('Finisher');
        emit('finisher', { name: a.name, kind: a.kind });
        return { name: a.name, kind: a.kind };
      }
      function stepFin(a, dt) {
        var F = PL.fin, T = F.a; F.t += dt;
        if (!T || T.fade < 1) { if (!F.done && T) PL.focus = Math.min(FOCUS.max, (PL.focus || 0) + finCost(T)); PL.fin = null; return 0; }
        var d = dist(a, T); a.yaw = yawTo(a, T.x, T.z);
        // (open.impact: turned so the haymaker's fist, out to his side, comes onto the face; eased in, and out after it)
        if (F.p && F.p.aim) a.yaw -= F.p.aim * (F.t < F.p.hit ? smooth(0, 0.15, F.t) : 1 - smooth(F.p.hit, F.p.hit + 0.25, F.t));
        if (F.p) return stepFinP(a, F, T, d, dt);
        // the KO kick lands 0.57 s in (the clip's own moment)
        if (!F.done && F.t >= 0.567) {
          F.done = true;
          if (!T.ko && d < 2.4 && Math.abs((T.y || 0) - (a.y || 0)) < 1.8) { T.hp = 0; PL.finKO = true; knockout(T, a); PL.finKO = false; if (cfg.impact) impLand(T, [T], 6, { kind: 'heavy', noSlow: true }); else { hitstop = 0.12; CAM.shake = Math.max(CAM.shake, 0.6); thud(4); } burst({ x: T.x, y: (T.y || 0) + 1.1, z: T.z }, '#FFE2A0', 24); }
          // it did not land (he went down to someone else first, or got away): the focus comes back
          else PL.focus = Math.min(FOCUS.max, (PL.focus || 0) + finCost(T));
        }
        if (F.t > 1.38) PL.fin = null;
        // closing in over the first 0.4 s, to arm's length
        return F.t < 0.45 && d > 1.15 ? Math.min(12, (d - 1.15) * 9) : 0;
      }
      // The finisher of a hero who only punches (open.kicks: false; AI Alps, the owner 4 Oct: "The finisher is a
      // skull-crushing overhead punch"): a haymaker with everything behind it spins the man round and drops him, and as
      // he falls the hero drives his fist down onto his head (the slam's touchdown, a fist to the ground), which puts him
      // down for good. Its moments come from the clips' own timing (the haymaker's contact, the fall to the ground, the
      // slam's contact), so each blow lands where the bodies are. His fall is played half as fast again (fall), so the fist
      // comes down straight out of the haymaker, with no beat stood still between them; and the hero keeps the distance
      // (head) at which the slam's fist, 0.7 m before him, lands on the head of a man fallen back toward him (measured
      // in Chrome: the head comes to rest about 1.2 m from his feet). [clip, rate]
      // A body with the motion pack's crush (human-moves-<gender> listed, as AI Alps does) throws that instead of the
      // slam (the owner, 5 Oct, on the slam's frames: it read as a dive onto him): he steps in, drops to one knee, the
      // fist high overhead, and drives it straight down onto the head, holds it there and rises back into his guard. Its
      // fist lands at crushFist ([to his right, ahead, up], m: on the head of a man the haymaker drops, where it comes to
      // rest, measured in Chrome), so he keeps the slam's distance from the man. [clip, rate]
      var FINP = { hay: ['ffHook', 1.0], slam: ['ffSlamLand', 1.0], push: 3.6, slow: 0.7, spin: 0.3, head: 1.85, land: 0.97, fall: 1.5,
        crush: ['crush', 1.0], crushFist: [0.25, 0.57, 0.25] };
      function finPunch(a) {
        // the blow to the ground: [clip, rate], and where its fist lands [to the right, ahead, up] of the hero
        var B = hasMove(player, FINP.crush[0]) ? { c: FINP.crush, fist: FINP.crushFist } : { c: FINP.slam, fist: [0, 0.85, 0.15] };
        // (open.impact: the haymaker is the boxer's looping hook, whose fist reaches the face, as in the chain: FFPI)
        var HAY = cfg.impact && hasMove(player, 'hook') ? ['hook', FINP.hay[1]] : FINP.hay;
        var hay = clipInfo(player.body, HAY[0]), slam = clipInfo(player.body, B.c[0]);
        // (the fall a knockout plays reaches the ground at its contact; the kit plays it at 1.15, and the finisher faster)
        var fall = !a.creature && hasMove(a, 'death') ? clipInfo(a.body, 'death').contact / (1.15 * FINP.fall) : 0.3;
        var P = { hit: hay.contact / HAY[1], hayEnd: hay.duration / HAY[1], blow: B };
        // (and where to stand for it, turned so its fist comes onto the face: impStep's reckoning, from the table)
        if (cfg.impact && IMPF[HAY[0]]) { var H = impH(), hf = IMPF[HAY[0]].f; P.aim = clamp(Math.atan2(hf[0], hf[2]), -IMPACT.aim, IMPACT.aim); P.want = Math.hypot(hf[0] * H, hf[2] * H) + 0.13; }
        // the fist lands as his head reaches the ground (or, the crush, once it is down: the knee, the fist raised); the
        // blow starts its own contact's length before that
        P.ko = P.hit + fall * FINP.land; P.slamAt = Math.max(P.hayEnd * 0.8, P.ko - slam.contact / B.c[1]); P.ko = P.slamAt + slam.contact / B.c[1];
        P.end = P.slamAt + slam.duration / B.c[1];
        PL.fin.p = P; PL.finPlayed = [HAY[0]]; PL.safeUntil = DIR.time + P.end + 0.1;
        play(player, HAY[0], HAY[1]);
        // time slows until just after the fist lands (easing back over its last 0.35 s), and the camera stays in close,
        // in real time, until the finisher ends: the slowed part, then the rest at full speed
        var k = FINP.slow, S = (P.ko + 0.1 - 0.35 * (1 + k) / 2) / k + 0.35;
        slowmo(S, k); if (!travOn()) CAM.cine = { a: a, t: 0, dur: S + Math.max(0, P.end - P.ko - 0.1) + 0.1, side: 0 };
      }
      function stepFinP(a, F, T, d, dt) {
        var P = F.p;
        // the haymaker lands: he goes down (the fall a knockout plays), or, out of reach, the focus comes back
        if (!P.down && !F.done && F.t >= P.hit) {
          if (!T.ko && d < 2.4 && Math.abs((T.y || 0) - (a.y || 0)) < 1.8) {
            P.down = true; var fy = yawTo(a, T.x, T.z); T.kx += Math.sin(fy) * FINP.push; T.kz += Math.cos(fy) * FINP.push;
            T.stun = Math.max(T.stun || 0, 3); T.act = null; T.busy = 0; T.speed = 0;
            if (!T.creature && hasMove(T, 'death')) { T.downT = Math.max(T.downT || 0, 3); P.spin = { from: T.yaw, t: 0 }; T.finFall = FINP.fall; }
            if (cfg.impact) impLand(T, [T], 3, { kind: 'heavy', noSlow: true }); else { hitstop = 0.07; CAM.shake = Math.max(CAM.shake, 0.4); thud(3); }
          } else { F.done = true; PL.focus = Math.min(FOCUS.max, (PL.focus || 0) + finCost(T)); P.end = Math.min(P.end, P.hayEnd); }
        }
        // the haymaker spins him round as he goes, so he falls back toward the hero, his head at the hero's feet
        if (P.spin && P.spin.t < FINP.spin) { P.spin.t = Math.min(FINP.spin, P.spin.t + dt); T.yaw = P.spin.from + PI * smooth(0, FINP.spin, P.spin.t); }
        if (P.down && !P.slam && F.t >= P.slamAt) { P.slam = true; play(a, P.blow.c[0], P.blow.c[1]); PL.finPlayed.push(P.blow.c[0]); }
        // the fist comes down on him: down for good
        if (P.down && !F.done && F.t >= P.ko) {
          F.done = true;
          if (!T.ko) {
            T.hp = 0; knockout(T, a);
            // (no flight, whatever is in the hero's hand: he is already on the ground)
            if (T.vy != null) { T.vy = null; T.lift = 0; T.kx = T.kz = 0; T.bowl = null; }
            var fr = P.blow.fist[0], ff = P.blow.fist[1], bp = { x: a.x + Math.sin(a.yaw) * ff - Math.cos(a.yaw) * fr, y: (a.y || 0) + P.blow.fist[2], z: a.z + Math.cos(a.yaw) * ff + Math.sin(a.yaw) * fr };
            if (cfg.impact) impLand(T, [T], 6, { kind: 'heavy', noSlow: true, noSnap: true, at: new THREE.Vector3(bp.x, bp.y, bp.z) }); else { hitstop = 0.12; CAM.shake = Math.max(CAM.shake, 0.7); thud(4); }
            burst(bp, '#FFE2A0', 24);
          } else PL.focus = Math.min(FOCUS.max, (PL.focus || 0) + finCost(T));
        }
        if (F.t > P.end) PL.fin = null;
        // in to arm's length for the haymaker; then, as he goes down, in after him or a step back, to stand where the
        // slam's fist comes down on his head (a negative speed is a step back)
        var reach = P.want || 1.15;
        if (F.t < P.hit) return d > reach ? Math.min(12, (d - reach) * 9) : 0;
        if (!P.down || F.t >= P.ko) return 0;
        return d > FINP.head ? Math.min(6, (d - FINP.head) * 6) : d < FINP.head - 0.08 ? -Math.min(3, (FINP.head - d) * 6) : 0;
      }
      function canHeal() { return !!player && !player.ko && !DERBY && !player.creature && (PL.focus || 0) >= 1 && player.hp < player.max && PL.air <= 0; }
      function heal() {
        if (!canHeal()) { if (player && !DERBY && !player.creature && state === 'race') say((PL.focus || 0) < 1 ? 'Need focus' : PL.air > 0 ? 'Not in the air' : 'Health full'); return false; }
        PL.focus -= 1; player.hp = Math.min(player.max, player.hp + FOCUS.heal); PL.heals = (PL.heals || 0) + 1;
        burst({ x: player.x, y: player.y + 1, z: player.z }, '#7DFFB0', 24); say('Healed'); SFX.tick(true);
        emit('heal', { hp: player.hp });
        return true;
      }
      // The air game (stage 3): a held attack launches the man in front (an uppercut, and the hero rises with him); in the
      // air, attack runs two blows and a slam, which drives him into the ground, and the hero's landing knocks down anyone
      // close by. Bare hands only; a boss is too heavy unless he is reeling.
      var AIR = { reach: 3.2, rate: 1.2, rise: 0.38, idle: 0.9, launchVy: 10.2, juggle: 1.7, hitJuggle: 1.2, slamVy: -18, pound: 2.8, segs: ['ffAir1', 'ffAir2', 'ffAirSlam'] };
      function launchTarget() {
        var best = null, bd = AIR.reach;
        for (var i = 0; i < actors.length; i++) {
          var a = actors[i]; if (a === player || a.ko || a.kind === 'civ' || a.fade < 1 || a.car || a.air || (a.boss && !(a.stun > 0))) continue;
          if (climbOn() && (Math.abs(a.y - player.y) > 1.2 || dropBetween(player, a))) continue;
          var d = dist(player, a); if (d < bd && (inFront(player, a, 1.2) || d < 1.6)) { bd = d; best = a; }
        }
        return best;
      }
      // a move still running that a launcher must not cut off: a dodge in its first moments (as a punch waits), a dash,
      // a stagger, or a blow (a counter most of all) that has not landed yet
      function launchWait() { return !!(PL.dash || player.stun > 0 || PL.dodge && PL.dodge.t < (PL.dodge.perfect ? 0.08 : 0.38) || PL.punching > 0 && PL.len - PL.punching < PL.hitAt); }
      function launcher() {
        // (no air game for a hero who only punches or never leaves the ground: the launch is an uppercut he rises with)
        if (!cfg.kicks || !cfg.jump) return null;
        if (player && launchWait()) return null;
        if (!player || player.ko || DERBY || player.creature || PL.weapon || PL.hang || PL.fin || PL.air > 0 || PL.pickT > 0 || !hasMove(player, 'ffLaunch')) return null;
        if (TRAV && (!travLive || TRAV.state.mode !== 'ground')) return null;
        var T = launchTarget(); if (!T) return null;
        PL.dash = null; PL.dodge = null; PL.queued = false;
        player.yaw = yawTo(player, T.x, T.z);
        // the lunge in (in a traversal world on its carry, which it decays a little faster: the ground speed is its own)
        var d = dist(player, T), lv = d > 1.3 ? Math.min(8, (d - 1.1) * 5) : 0;
        if (lv && TRAV) { TRAV.state.carry.x = Math.sin(player.yaw) * lv * 1.1; TRAV.state.carry.z = Math.cos(player.yaw) * lv * 1.1; }
        else if (lv) { player.kx += Math.sin(player.yaw) * lv; player.kz += Math.cos(player.yaw) * lv; }
        var ci = play(player, 'ffLaunch', 1.25);
        PL.len = player.busy; PL.punching = PL.len; PL.hitAt = ci.contact / 1.25; PL.hitPower = 1; PL.reach = 1.5; PL.lock = T; PL.launchOf = T; PL.airSeg = null;
        PL.until = DIR.time + PL.len + 0.55; PL.fightT = DIR.time;
        whoosh();
        return { name: T.name };
      }
      // he goes up: no longer fighting, just flying; he hangs near the top while blows keep landing
      function launch(T) {
        T.air = { vy: AIR.launchVy, juggle: AIR.juggle, y0: T.y || 0, slam: false }; T.lift = Math.max(T.lift || 0, 0.001); T.vy = null; T.liftBase = T.y || 0;
        T.stun = 9; T.speed = 0; T.kx *= 0.3; T.kz *= 0.3; T.hitT = null; T.next = null;
        if (T.token) { T.token = false; tokens = Math.max(0, tokens - 1); } T.state = 'circle';
        play(T, 'hit', 0.55);
        PL.hang = { a: T, t: 0, rise: AIR.rise, from: PL.air, fromY: player.y, idle: 0, seg: -1 }; PL.launches = (PL.launches || 0) + 1;
        CAM.shake = Math.max(CAM.shake, 0.2);
      }
      function stepFoeAir(a, dt) {
        var A = a.air; A.juggle -= dt;
        var hang = A.juggle > 0 && A.vy < 1.5;
        A.vy -= (hang ? 22 * 0.12 : 22) * dt; if (hang && A.vy < -1) A.vy = -1;
        a.lift += A.vy * dt; a.stun = Math.max(a.stun, 0.3); a.speed = 0;
        var kf = Math.exp(-3 * dt); a.kx *= kf; a.kz *= kf;
        if (a.lift <= 0) {
          a.lift = 0; a.air = null;
          if (A.slam) { a.stun = 1.6; play(a, 'getup', 1); CAM.shake = Math.max(CAM.shake, 0.25); thud(2); burst({ x: a.x, y: a.y + 0.2, z: a.z }, '#C9B89A', 16); }
          else { a.stun = 0.7; play(a, 'hitChest', 1.2); }
        }
      }
      // the hero in the air beside him: a held air attack slams at once
      function airStrike(force) {
        var H = PL.hang; if (!H || !H.a || H.a.ko && !(H.a.lift > 0.3)) return;
        if (H.t < H.rise) { PL.queued = true; return; }
        if (PL.punching > 0 && !force) { if (PL.punching < PL.len * 0.6) PL.queued = true; return; }
        var seg = force ? 2 : (H.seg + 1) % 3; H.seg = seg; H.idle = 0;
        var ci = play(player, AIR.segs[seg], AIR.rate);
        PL.len = player.busy; PL.punching = PL.len; PL.hitAt = ci.contact / AIR.rate; PL.hitPower = seg === 2 ? 2.5 : 0.75; PL.reach = 1.8; PL.airSeg = seg; PL.launchOf = null; PL.lock = H.a;
        PL.until = DIR.time + PL.len + 0.55; PL.fightT = DIR.time; PL.queued = false;
        whoosh();
      }
      function airHit() {
        var H = PL.hang, T = H && H.a, seg = PL.airSeg; PL.airSeg = null;
        if (!T || T.fade < 1 || (T.ko && !(T.lift > 0.3))) return 0;
        if (seg === 2) {
          // the slam: he is driven down, and so is the hero, onto the ground and whoever is close
          if (T.air) { T.air.vy = AIR.slamVy; T.air.juggle = 0; T.air.slam = true; }
          PL.noPush = true; hurt(T, 2.5, player); PL.noPush = false;
          if (T.ko && T.lift > 0) T.vy = AIR.slamVy;
          endHang(true);
          hitstop = 0.065; CAM.shake = Math.max(CAM.shake, 0.3); thud(3);
        } else {
          if (T.air) { T.air.juggle = AIR.hitJuggle; T.air.vy = Math.max(T.air.vy, 1.4); }
          PL.noPush = true; hurt(T, 0.75, player); PL.noPush = false;
          if (!T.ko) play(T, 'hit', 0.8);
          hitstop = 0.035; CAM.shake = Math.max(CAM.shake, 0.12); thud(1.5);
        }
        gainFocus(1, seg === 2 ? 3 : 1);
        burst({ x: T.x, y: (T.y || 0) + 1, z: T.z }, '#FFFFFF', seg === 2 ? 14 : 6);
        return 1;
      }
      function endHang(slam) {
        var H = PL.hang; PL.hang = null; if (!H) return;
        if (H.a && H.a.air && !slam) H.a.air.juggle = Math.min(H.a.air.juggle, 0);
        PL.vy = slam ? -14 : -1; PL.slamDown = !!slam; PL.slamT = DIR.time;
        // in a traversal world: handed back to it as a fall (the slam, a fast one), its own landing to follow
        if (TRAV && travLive) { try { TRAV.player.traversal.toAir(new THREE.Vector3(0, slam ? -14 : -1, 0)); } catch (e) {} }
      }
      // the slam's landing: whoever is close is knocked down
      function groundPound() {
        play(player, 'ffSlamLand', 1.3); CAM.shake = Math.max(CAM.shake, 0.35); thud(3.5);
        burst({ x: player.x, y: player.y + 0.1, z: player.z }, '#C9B89A', 26);
        for (var i = 0; i < actors.length; i++) { var o = actors[i]; if (o === player || o.ko || o.kind === 'civ' || o.air || o.fade < 1 || dist(player, o) > AIR.pound || (climbOn() && Math.abs((o.y || 0) - player.y) > 1.8)) continue; hurt(o, 1.5, player); if (!o.ko && !o.boss) knockDown(o); }
      }
      // knocked off his feet by the landing: thrown back, down on the ground a moment (the fall a knockout plays), then up
      function knockDown(o) {
        var y = yawTo(player, o.x, o.z); o.kx += Math.sin(y) * 5; o.kz += Math.cos(y) * 5;
        o.speed = 0; o.hitT = null; o.next = null;
        // (the fall reaches the ground about 0.85 s in; a body without a fall and a get-up is only thrown back, staggering)
        if (!o.creature && hasMove(o, 'death') && hasMove(o, 'getup')) { o.downT = 1.25; o.stun = Math.max(o.stun || 0, 1.5); o.act = null; o.busy = 0; }
        else { o.stun = Math.max(o.stun || 0, 0.9); play(o, 'hit', 0.8); }
        if (o.token) { o.token = false; tokens = Math.max(0, tokens - 1); } o.state = 'circle';
        PL.knocked = (PL.knocked || 0) + 1;
      }
      // a held attack
      function stepHold() {
        if (!IN.atk || PL.holdFired || state !== 'race' || demo || performance.now() - (PL.atkT || 0) < 220) return;
        if (PL.hang) { PL.holdFired = true; airStrike(true); }
        else if (!player || launchWait()) return;   // the hold waits for the move to finish
        // (a hero who only punches: the next haymaker waits for the last to be done, and a breath after it)
        else if (!cfg.kicks && PL.heavyEnd != null && DIR.time < PL.heavyEnd + HEAVY.rest) return;
        else if (cfg.kicks ? launcher() : chargedBlow()) PL.holdFired = true;
        else IN.atk = false;   // nothing to launch (a weapon, no one in reach): the click's release still punches
      }
      // a held attack for a hero who only punches (open.kicks: false): the haymaker with everything behind it, wound up a
      // moment (it lands about a third of a second in), at whoever is in front, charging in to him if he is out of reach
      // (Thrown back to back it is a wilder swing each time, and the chain is the stronger way to fight (AI Alps' playtest,
      // 5 Oct: holding J over and over out-hit every combo, and the man it staggered could never swing back). A haymaker
      // thrown within HEAVY.window s of the last, with no other blow landed between them, hits for HEAVY.fall of its
      // power: 5, then 3, then 2 (the 3 still staggers him; the 2 does not); and once one has landed, the next is not
      // wound up until HEAVY.rest s after it is done. A blow of the chain landing resets it: a combo ending on a held
      // haymaker is the full 5.)
      var HEAVY = { window: 2.4, fall: [1, 0.6, 0.4], rest: 0.3 };
      function chargedBlow() {
        if (!player || player.ko || DERBY || player.creature || PL.weapon || PL.fin || PL.air > 0 || PL.pickT > 0 || !freeflow()) return null;
        if (TRAV && (!travLive || TRAV.state.mode !== 'ground')) return null;
        PL.dash = null; PL.dodge = null; PL.queued = false; PL.punching = 0; PL.heavies = (PL.heavies || 0) + 1;
        var run = DIR.time - (PL.heavyT == null ? -99 : PL.heavyT) < HEAVY.window && !PL.chainHit ? Math.min(HEAVY.fall.length - 1, (PL.heavyRun || 0) + 1) : 0;
        PL.heavyRun = run; PL.heavyT = DIR.time; PL.chainHit = false; PL.heavyK = HEAVY.fall[run];
        startFlow(chainLen() - 1, null, 'heavy');
        return true;
      }
      // a hero the world built itself (a creature, MogDune's) has no flip: the dodge key jumps for him, as C always did
      function canDodge() { return !!player && !player.creature && (hasMove(player, 'ffDodge') || hasMove(player, 'roll')); }
      function dodge(dir) {
        var P = player;
        // a hero who never flips or rolls (open.dodge: false): nothing, and not the jump either
        if (!cfg.dodge) return null;
        if (P && !canDodge()) { jump(); return null; }
        if (PL.fin) return null;
        if (!P || P.ko || state !== 'race' || DERBY || P.car || PL.pickT > 0 || PL.air > 0) return null;
        if (TRAV && (!travLive || TRAV.state.mode !== 'ground')) return null;
        if (PL.dodge && PL.dodge.t < DODGE.again) return null;
        // where to: the stick, else away from the blow coming, else straight back
        var mv = dir || moveVec(), w = threat(), stick = !!dir || mv.len > 0.3, mx, mz;
        if (stick) { var ml = Math.hypot(mv.x, mv.z) || 1; mx = mv.x / ml; mz = mv.z / ml; }
        else if (w) { var ty = yawTo(w, P.x, P.z); mx = Math.sin(ty); mz = Math.cos(ty); }
        else { mx = -Math.sin(P.yaw); mz = -Math.cos(P.yaw); }
        // the back flip faces away from where it goes; the side flip has it on his left, whichever turns him least
        var my = Math.atan2(mx, mz), yb = my + PI, ys = my - PI / 2;
        var turn = function (y) { var d = y - P.yaw; while (d > PI) d -= TAU; while (d < -PI) d += TAU; return Math.abs(d); };
        var side = stick && turn(ys) + 0.25 < turn(yb), D = side ? DODGE.side : DODGE.back, own = hasMove(P, D[0]);
        var r = w ? w.hitT - DIR.time : 9, perfect = !!w && r <= DODGE.perfect && r > -DODGE.late;
        P.yaw = side ? ys : yb; P.stun = 0;
        play(P, own ? D[0] : 'roll', own ? D[1] : 2);
        PL.dodge = { t: 0, mx: mx, mz: mz, dist: D[2], go: D[3], side: side, perfect: perfect, yaw: P.yaw, of: w }; PL.safeUntil = DIR.time + DODGE.safe;
        PL.punching = 0; PL.queued = false; PL.dash = null; PL.dodges = (PL.dodges || 0) + 1;
        // in a traversal world the traversal moves him: a shove the way he goes
        if (TRAV) TRAV.state.facing = P.yaw;
        whoosh();
        if (perfect) {
          PL.counterUntil = DIR.time + DODGE.counter; PL.perfects = (PL.perfects || 0) + 1; if (!P.creature) PL.focus = Math.min(FOCUS.max, (PL.focus || 0) + FOCUS.perfect);
          slowmo(0.85, 0.22); say('Perfect dodge: counter!'); CAM.shake = Math.max(CAM.shake, 0.15);
        }
        emit('dodge', { perfect: perfect, side: side });
        return { perfect: perfect, side: side };
      }
      function freeflow() { return !PL.weapon && cfg.fight === 'freeflow' && !!player && hasMove(player, 'ffKick'); }
      function hasMove(a, n) { var A = ASSETS[a.body], l = A && A.json.clips ? A.json.clips.list : []; for (var i = 0; i < l.length; i++) if (l[i].name === n) return true; return false; }
      function chainLen() { return freeflow() ? (cfg.kicks ? FFCHAIN : FFPCHAIN).length : !PL.weapon && BIG.on && hasMove(player, 'uppercut') ? BIGCHAIN.length : CHAIN.length; }
      function punch() {
        if (PL.hang) { airStrike(); return; }
        // with the traversal, a punch is thrown on the ground only (in the air, C dives)
        if (TRAV && (!travLive || TRAV.state.mode !== 'ground')) return;
        if (!player || player.ko || player.stun > 0 || PL.air > 0 || PL.pickT > 0) return;
        if (PL.dash || PL.fin) return;
        // out of a dodge: at once after a perfect one (the counter), a moment after a plain one
        if (PL.dodge) { if (PL.dodge.t < (PL.dodge.perfect ? 0.08 : 0.38)) return; PL.dodge = null; }
        if (PL.punching > 0) { if (PL.punching < PL.len * 0.65) PL.queued = true; return; }
        var step = DIR.time < PL.until ? (PL.combo + 1) % chainLen() : 0;
        startPunch(step);
      }
      // a freeflow blow: whoever is in front within the dash is the one it is for; out of reach, the hero dashes in first
      // (force names the blow: a held attack's haymaker, carried through the dash)
      function startFlow(step, to, force) {
        PL.launchOf = null; PL.airSeg = null;
        var best = to || null, bd = to ? dist(player, to) : DASH.max;
        if (!to) actors.forEach(function (a) { if (a === player || a.ko || a.fade < 1 || a.kind === 'civ') return; var d = dist(player, a); if (d < bd && (inFront(player, a, 1.3) || d < 1.6)) { bd = d; best = a; } });
        // (in a traversal world the traversal moves the hero: no dash there, the blow is thrown where he stands)
        // (a hero who only punches charges in and throws a punch: never the leaping kick)
        if (!to && best && bd > DASH.within + best.r && !TRAV) { PL.dash = { a: best, t: 0, step: step, leap: cfg.kicks && bd > DASH.leap, force: force }; PL.dashes = (PL.dashes || 0) + 1; PL.queued = false; PL.fightT = DIR.time; PL.lock = best; whoosh(); return; }
        if (!best) actors.forEach(function (a) { if (a === player || a.ko || a.fade < 1) return; var d = dist(player, a); if (d < 3.4 && (inFront(player, a, 1.9) || d < 1.6) && (!best || d < bd)) { bd = d; best = a; } });
        // a counter (the blow after a perfect dodge): an ender, 1.6 times as hard
        var counter = DIR.time < PL.counterUntil; if (counter) { PL.counterUntil = 0; PL.countered = (PL.countered || 0) + 1; }
        var CH = cfg.kicks ? FFCHAIN : FFPCHAIN, opts = force ? [force] : PL.dashLeap ? ['leap'] : counter ? CH[CH.length - 1] : CH[step % CH.length];
        // (never the same blow twice running; for a hero who only punches, never the same clip either: the hook and the
        // haymaker are one motion)
        var BT = cfg.kicks ? FF : cfg.impact ? FFPI : FFP, lc = lastClip(), pick = opts.filter(function (n) { return n !== PL.last && (cfg.kicks || !lc || !BT[n] || BT[n][0] !== lc); }); pick = pick.length ? pick : opts;
        var mv = pick[Math.floor(Math.random() * pick.length)], b = BT[mv];
        // (open.impact: a held haymaker never the motion just thrown either: after the boxer's hook, the rear uppercut, HEAVYUP)
        if (mv === 'heavy' && cfg.impact && b[0] === lc && hasMove(player, HEAVYUP[0])) b = HEAVYUP;
        // (counted for the checks: a punch's motion thrown twice running in a chain, which should never happen)
        if (!cfg.kicks && !force && lc && lc === b[0]) PL.repeats = (PL.repeats || 0) + 1;
        if (mv === 'heavy') PL.heldAfter = lc;
        PL.last = mv; PL.heavyClip = mv === 'heavy' ? b[0] : null; PL.combo = step; PL.queued = false; PL.fightT = DIR.time; PL.lock = best; PL.thrown = PL.thrown || {}; PL.thrown[mv] = (PL.thrown[mv] || 0) + 1;
        if (best) player.yaw = yawTo(player, best.x, best.z);
        if (best && bd > 0.95) { player.kx += Math.sin(player.yaw) * 1.7; player.kz += Math.cos(player.yaw) * 1.7; }
        var ci = play(player, b[0], b[1]);
        PL.len = player.busy; PL.punching = PL.len; PL.hitAt = ci.contact / b[1]; PL.hitPower = b[2] * (counter ? DODGE.mult : 1); PL.reach = b[3];
        PL.until = DIR.time + PL.len + 0.55;
        // (a held haymaker thrown back to back hits for less, and the next waits for this one to be done: HEAVY)
        if (force === 'heavy' && PL.heavyK != null) { PL.hitPower *= PL.heavyK; PL.heavyEnd = DIR.time + PL.len; }
        impBegin(b[0], b[1]);
        whoosh();
      }
      function startPunch(step) {
        PL.launchOf = null; PL.airSeg = null;
        if (freeflow()) return startFlow(step);
        var big = chainLen() === BIGCHAIN.length, opts = (big ? BIGCHAIN : CHAIN)[step % (big ? BIGCHAIN.length : CHAIN.length)];
        // never the same blow twice running
        var pick = opts.filter(function (n) { return n !== PL.last; }); pick = pick.length ? pick : opts;
        var mv = pick[Math.floor(Math.random() * pick.length)], b = BLOW[mv];
        var c = [mv, b[0], big && step === BIGCHAIN.length - 1 ? 3 : b[1], b[2]]; PL.last = mv;
        PL.combo = step; PL.queued = false; PL.fightT = DIR.time;
        // armed: the weapon's three swings, the third the hardest
        if (PL.weapon) { var wd = WEAPONS[PL.weapon.kind]; c = [wclip((wd.chain || WCHAIN)[step]), wd.rate * (step === 2 ? 0.85 : 1), wd.power[step], wd.reach]; }
        if (DIR.time < PL.counterUntil) { PL.counterUntil = 0; PL.countered = (PL.countered || 0) + 1; c[2] *= DODGE.mult; }
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
        impBegin(c[0], c[1]);
        whoosh();
      }
      // The jump (the owner, 1 Oct: the roll retired for a jump on the whole
      // platform): three quarters of the hero's height at the top, the same
      // seven tenths of a second in the air as a race's. It carries the run's
      // momentum over benches, barriers and low walls (anything solid lower
      // than the feet at that moment), and over a punch or a low shot.
      var JUMPOW = (function () { var h = clamp(Number(P0.height) || 1.8, 1.2, 2.6), H = h * 0.75, T = 0.7; return { H: H, T: T, g: 8 * H / (T * T), v0: 4 * H / T }; })();
      function jump() {
        if (TRAV) return;   // the traversal's own Space (trav.js)
        // a hero who never leaves the ground (open.jump: false): Space, K, JUMP, the pilot and the checks all come here
        if (!cfg.jump) return;
        if (!player || player.ko || player.stun > 0 || PL.pickT > 0) return;
        if (PL.air > 0.001) { PL.jumpBuf = 0.14; return; }
        if (PL.dodge) { if (PL.dodge.t < 0.45) return; PL.dodge = null; }
        if (PL.fin) return;
        PL.vy = JUMPOW.v0; PL.air = 0.001; PL.jumpBuf = 0; PL.punching = 0; PL.queued = false; PL.picking = null;
        whoosh(); emit('jump', {});
      }
      function roll() { jump(); }
      // whether the blow thrown reaches him, d m off: what a blow lands on (hitCheck), and the only man the impact's
      // magnetism pulls in (impStep), so nothing it would have missed lands
      function blowReaches(a, T, d) { return d < PL.reach + T.r + 0.25 && (inFront(a, T, PL.weapon ? 1.5 : 1.05) || d < 0.9); }
      function hitCheck() {
        if (PL.airSeg != null) { airHit(); return; }
        var L = PL.launchOf; PL.launchOf = null;
        if (L) {
          // the launcher: up he goes (if it reached him)
          if (!L.ko && !L.air && L.fade >= 1 && dist(player, L) < 2.3) { PL.noPush = true; hurt(L, 1, player); PL.noPush = false; gainFocus(1, 3); if (!L.ko) launch(L); hitstop = 0.065; thud(2.5); }
          return;
        }
        var hit = 0, on = null, onD = 99, list = [];
        actors.forEach(function (a) {
          if (a === player || a.ko || a.fade < 1) return;
          if (climbOn() && Math.abs(a.y - TRV.y) > 1.8) return;
          var d = dist(player, a);
          if (blowReaches(player, a, d)) { hurt(a, PL.hitPower, player); hit++; list.push(a); if (d < onD) { onD = d; on = a; } }
        });
        if (hit) gainFocus(hit, PL.hitPower);
        // (a blow of the chain landed: the next held haymaker is a full one again, HEAVY)
        if (hit && PL.last !== 'heavy') PL.chainHit = true;
        // a party's weapon makes its own sound (glass knocks or shatters, the bucket clangs); a fist or a street weapon thuds
        var pw = PL.weapon && WEAPONS[PL.weapon.kind], party = !!(pw && (pw.glass || pw.dent));
        // (a held haymaker, open.kicks: false, kicks the camera as a weapon's heavy blow does)
        // (open.impact: the man it was for, everyone it caught, the stop, the camera, the flash, the hit: impLand)
        if (hit && cfg.impact && !DERBY) impLand(PL.imp && PL.imp.len === PL.len && PL.imp.a && list.indexOf(PL.imp.a) >= 0 ? PL.imp.a : on, list, PL.hitPower, { party: party, street: !!PL.weapon && !party });
        else if (hit) { if (!party) thud(Math.min(4, PL.hitPower)); CAM.shake = Math.max(CAM.shake, Math.min(0.7, 0.18 + PL.hitPower * 0.12)); hitstop = Math.min(0.13, 0.045 + PL.hitPower * 0.02); if ((BIG.on || PL.weapon || PL.last === 'heavy') && PL.hitPower >= 2) CAM.kick = Math.min(1, 0.45 + PL.hitPower * 0.15); }
        // every blow wears the weapon down
        // (a bottle breaks on the head it hit, the nearest of them)
        if (hit && PL.weapon) { PL.weapon.hits -= hit; lastHud = ''; if (PL.weapon.hits <= 0) breakWeapon(on); else if (party) partyKnock(pw, on); }
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

      /* ------------------------------------------------------ the impact -- */
      // Every landed punch made to connect (open.impact: on for the punch-only family, open.kicks: false, which is AI Alps
      // and its Mogs, and for any world that sets impact: true; off everywhere else). The owner, 5 Oct, on the first Mog
      // of AI Alps: "punches don't feel satisfying like are connecting and giving me the feeling of a hit". Filmed frame
      // by frame before: at the moment a blow counted the fist was 0.3 to 1.2 m short of the face (the clips are thrown in
      // place, and a blow counted from up to 1.8 m); the man's head did not move for eight frames (his flinch blends in
      // over a tenth of a second, and the hit-stop held it there); the world crawled at 15% rather than stopping; the
      // camera only jittered; nothing showed at the fist; and the thud was a tone falling from 150 to 45 Hz. So, here:
      //  - magnetism: in the last IMPACT.win s before contact the hero closes (or opens) the gap so his fist lands on the
      //    face (the chin for an uppercut, the ribs for a body shot), turned so a hook's fist, out to his side, comes onto
      //    it, and leaning in over a shorter man (or back from a taller one, a little); the man stops and squares up. Only
      //    a man the blow would have reached anyway is pulled in (the reach and the cone it lands by, blowReaches, with
      //    nothing added), so nothing that missed before lands now
      //  - the man reacts on the contact frame: his head, neck and upper back snapped away the way the fist was going (a
      //    hook turns his head, an uppercut lifts his chin, a body shot folds him), by its power, over his own flinch
      //  - the hit-stop: a short true freeze, longer for a heavy blow and longest for a knockout, eased out; he shudders in
      //    it; a knockout then falls in a moment of slow motion
      //  - the camera kicked along the blow, a touch of roll and a narrower lens for an instant
      //  - a flash, a ring and a spray of sweat at the fist (one pool for the world, drawn hot for the bloom, small and
      //    gone in a tenth of a second so the face is not hidden)
      //  - the hit (thudLayers, in the sounds) and a crowd's "ooh" on a big one
      // [s, m, s, m/s, m/s, share, rad, [rad, rad]]
      // (and the drama: the stop held for a jab, a hook, a heavy blow and a knockout; a heavy blow's kick against a light
      // one's; how far in a knockout punches the camera, as a share of its distance; the knockout's slow motion)
      // [s, m, s, m/s, m/s, share, rad, [rad, rad], [s, s, s, s], x, share, s]
      var IMPACT = { win: 0.12, sep: 0.62, sepHold: 0.3, heroV: 9, foeV: 3, foeShare: 0.25, aim: 0.7, pitch: [-0.14, 0.32], hold: [0.055, 0.07, 0.11, 0.15], kick: 1.3, push: 0.12, slow: 0.7 };
      // Where the punching fist is when each clip's blow lands (measured in Chrome on the library athlete from his fight
      // stance, at the rates the game throws them): f [to his left, up, ahead] as shares of his head's height in that
      // stance; at, the moment it lands (clip seconds) where the clip's own is early (the freeflow jab and cross reach
      // their furthest a twentieth of a second after it, an uppercut's fist is still coming in from the side); on, what it
      // is aimed at. The freeflow hook's fist never goes more than 0.4 m out (its clip was made with a step in that is
      // pinned here); a hero who only punches throws the boxer's hook instead (FFPI).
      var IMPF = {
        jab: { f: [0.05, 1.03, 0.5] }, cross: { f: [-0.02, 1.08, 0.483] }, hook: { f: [-0.355, 0.874, 0.509] },
        upperL: { f: [0.195, 0.946, 0.375], at: 0.225, on: 'chin' }, uppercut: { f: [-0.21, 0.994, 0.347], at: 0.42, on: 'chin' }, body: { f: [0.041, 0.786, 0.363], on: 'body' },
        ffJab: { f: [-0.024, 1.024, 0.377], at: 0.26 }, ffCross: { f: [0.06, 1.038, 0.44], at: 0.273 }, ffHook: { f: [0.072, 0.956, 0.2] },
      };
      var IMP = { H: 0, hits: 0, sounds: 0, oohs: 0, oohT: null, last: null, snaps: 0 };
      // the hit-stop's curve: held (real seconds) then eased out
      var IMPS = { t: 9, hold: 0, ease: 0, rdt: 0 };
      var IV1 = new THREE.Vector3(), IV2 = new THREE.Vector3(), IV3 = new THREE.Vector3(), IQ1 = new THREE.Quaternion(), IQ2 = new THREE.Quaternion(), IQ3 = new THREE.Quaternion();
      function impFreeze() { return IMPS.t < IMPS.hold + IMPS.ease; }
      // a library person's bones for it (a creature, a car or a world's own body has none, and gets the rest without them)
      function impBones(a) {
        if (a.ib !== undefined) return a.ib;
        var by = {}, B = null;
        if (!a.creature && !a.car && a.e && a.e.object) a.e.object.traverse(function (o) { if (o.isBone && !by[o.name]) by[o.name] = o; });
        if (by.head && by.neck01 && by.spine02 && by.spine03 && by.spine02.parent) B = { head: by.head, neck: by.neck01, chest: by.spine02, back: by.spine03, kl: by['finger3-1_L'] || by.wrist_L || null, kr: by['finger3-1_R'] || by.wrist_R || null };
        a.ib = B; return B;
      }
      // a bone's place in the world now (its matrices are the last frame's; the body may have moved since)
      function impAt(a, bone, out) { bone.getWorldPosition(out); out.x += a.x - a.g.position.x; out.y += (a.y || 0) - a.g.position.y; out.z += a.z - a.g.position.z; return out; }
      // what a blow is aimed at: the face (a little over the head's joint), the chin, or the ribs
      function impPoint(T, on, out) {
        var B = impBones(T);
        if (!B) return out.set(T.x, (T.y || 0) + (on === 'body' ? 1.1 : 1.55), T.z);
        impAt(T, on === 'body' ? B.chest : B.head, out); out.y += on === 'head' ? 0.06 : on === 'chin' ? -0.01 : 0.02;
        return out;
      }
      // the hero's head's height in his stance (the measure of the table above), eased over his punches
      function impH() {
        var B = player && impBones(player);
        if (B) { impAt(player, B.head, IV1); var h = IV1.y - (player.y || 0); if (h > 0.6 && h < 3.2) IMP.H = IMP.H ? IMP.H * 0.85 + h * 0.15 : h; }
        return IMP.H || 0.85 * clamp(Number(P0.height) || 1.8, 1.2, 2.6);
      }
      // a blow is thrown (after play(): its contact is PL.hitAt): what it is for and where it lands
      function impBegin(clip, rate) {
        var was = PL.imp; PL.imp = null;
        if (!cfg.impact || DERBY || !player || player.creature) return;
        var E = IMPF[clip] || null, A = PL.lock && PL.lock !== player && !PL.lock.ko ? PL.lock : null;
        // (the blow lands as the fist arrives, where the clip's own moment is early)
        if (E && E.at != null) { var ci = clipInfo(player.body, clip); if (E.at > ci.contact && E.at < ci.duration * 0.9) PL.hitAt = E.at / rate; }
        // (a street weapon sweeps its own arc: no magnetism for it)
        var party = PL.weapon && (wStat(PL.weapon, 'glass', null) || wStat(PL.weapon, 'dent', null));
        if (PL.weapon && !party) E = null;
        impH();
        // (fl, fr: where the fists were last frame; vl, vr: their speeds; fn: frames followed, so 2 or more when the speeds are
        // good: made with the blow and filled in place each frame)
        PL.imp = { len: PL.len, a: A, clip: clip, E: E, on: E && E.on || 'head', mag: null, aim: 0, pitch: 0, done: false, moved: 0, fl: [0, 0, 0], fr: [0, 0, 0], vl: [0, 0, 0], vr: [0, 0, 0], fn: 0, party: !!party, wasK: was ? was.k || 0 : 0, k: 0 };
      }
      // each frame of a blow until it lands: his aim, and in its last moments the magnetism. True when it turned him.
      function impStep(a, dt, now) {
        var I = PL.imp, T = I && I.a; if (!I || I.done) return false;
        var B = impBones(a);
        // (both fists followed, for the speed of the one that lands)
        if (B && B.kl && B.kr && dt > 0) {
          impAt(a, B.kl, IV1); impAt(a, B.kr, IV3);
          var L = I.fl, R = I.fr;
          if (I.fn) { I.vl[0] = (IV1.x - L[0]) / dt; I.vl[1] = (IV1.y - L[1]) / dt; I.vl[2] = (IV1.z - L[2]) / dt; I.vr[0] = (IV3.x - R[0]) / dt; I.vr[1] = (IV3.y - R[1]) / dt; I.vr[2] = (IV3.z - R[2]) / dt; }
          L[0] = IV1.x; L[1] = IV1.y; L[2] = IV1.z; R[0] = IV3.x; R[1] = IV3.y; R[2] = IV3.z; I.fn++;
        }
        if (!I.E || !T || T.ko || T.air || T.car || T.downT > 0 || T.fade < 1 || (T.lift || 0) > 0.05 || TRAV || (climbOn() && Math.abs((T.y || 0) - (a.y || 0)) > 1.2)) { I.k = 0; return false; }
        var tp = impPoint(T, I.on, IV2), H = IMP.H || impH(), f = I.E.f, fx = f[0] * H, fy = f[1] * H, fz = f[2] * H, fr = Math.hypot(fx, fz);
        var al = clamp(Math.atan2(fx, fz), -IMPACT.aim, IMPACT.aim), be = Math.atan2(tp.x - a.x, tp.z - a.z);
        // the lean that brings the fist to his height, from the chest (a tall hero on a shorter man leans in over him)
        var pv = B ? impAt(a, B.chest, IV3).y - (a.y || 0) : fy * 0.7;
        var pitch = clamp(((a.y || 0) + fy - tp.y) / Math.max(0.3, fr), IMPACT.pitch[0], IMPACT.pitch[1]);
        // eased in over the wind-up to the contact (from wherever the last blow left it)
        I.k = I.wasK + (1 - I.wasK) * smooth(0, 1, clamp(now / Math.max(0.05, PL.hitAt), 0, 1)); I.aim = al; I.pitch = pitch;
        face(a, be - al, 1 - Math.exp(-22 * dt));
        var rem = PL.hitAt - now;
        if (rem > IMPACT.win || rem < -dt) return true;
        // only a man the blow would have reached as it was (the reach and the cone it lands by: blowReaches)
        if (I.mag == null) {
          I.mag = blowReaches(a, T, dist(a, T));
          if (I.mag) PL.impSep = { a: T, until: DIR.time + Math.max(0, rem) + IMPACT.sepHold };
        }
        if (!I.mag) return true;
        // where he must stand when it lands (his fist that far ahead, plus the lean's reach), and his share of the way there
        var want = fr + pitch * Math.max(0, fy - pv) + (I.on === 'body' ? 0.13 : I.on === 'chin' ? 0.07 : 0.09) + (I.party ? 0.12 : 0);
        var gx = tp.x - Math.sin(be) * want - a.x, gz = tp.z - Math.cos(be) * want - a.z, gl = Math.hypot(gx, gz);
        if (gl > 1e-4) {
          var k = clamp(dt / Math.max(1e-3, rem + dt), 0, 1), sh = gx * Math.sin(be) + gz * Math.cos(be) > 0 && !T.boss ? IMPACT.foeShare : 0;
          var mh = Math.min(gl * k * (1 - sh), IMPACT.heroV * dt), mf = Math.min(gl * k * sh, IMPACT.foeV * dt);
          a.x += gx / gl * mh; a.z += gz / gl * mh; T.x -= gx / gl * mf; T.z -= gz / gl * mf; I.moved += mh + mf;
          a.kx *= 0.5; a.kz *= 0.5; collide(a); collide(T);
        }
        // he stops and squares up to it
        T.speed = 0; T.kx *= 0.6; T.kz *= 0.6; face(T, yawTo(T, a.x, a.z), 1 - Math.exp(-16 * dt));
        return true;
      }
      // it landed (hitCheck, or a finisher's blow): on, the man it was for; list, everyone it hit; o: { party, street, kind,
      // at (where it landed, if not at the fist), noSlow (no knockout slow motion: a finisher has its own), noSnap (he is
      // on the ground: his head stays where the fist meets it) }
      function impLand(on, list, power, o) {
        o = o || {}; IMP.hits++;
        var I = PL.imp && PL.imp.len === PL.len ? PL.imp : null, a = player, B = impBones(a), ko = false, boss = false;
        list.forEach(function (x) { if (x.ko) { ko = true; if (x.boss) boss = true; } });
        var tp = on ? impPoint(on, I && I.on || 'head', IV2) : null, bx = 0, bz = 1, gap = null, hand = null, fist = null;
        if (on) { bx = on.x - a.x; bz = on.z - a.z; var bl = Math.hypot(bx, bz) || 1; bx /= bl; bz /= bl; }
        if (B && B.kl && B.kr && tp) { impAt(a, B.kl, IV1); impAt(a, B.kr, IV3); var dl = IV1.distanceTo(tp), dr = IV3.distanceTo(tp); hand = dl < dr ? 'L' : 'R'; gap = Math.min(dl, dr); fist = hand === 'L' ? IV1 : IV3; }
        // where it lands: on the fist when the fist is there, else on the near side of what it hit
        var p = o.at ? o.at.clone() : tp ? (fist && gap < 0.35 ? fist.clone().lerp(tp, 0.35) : tp.clone().addScaledVector(IV1.set(bx, 0, bz), -0.1)) : null;
        // the way the fist was going (its speed this frame), else along the blow
        var v = I && I.fn > 1 ? (hand === 'L' ? I.vl : I.vr) : null, vx = bx * 5, vy = 0, vz = bz * 5;
        if (v && Math.hypot(v[0], v[1], v[2]) > 0.8) { vx = v[0]; vy = v[1]; vz = v[2]; }
        var kind = o.kind || impKind(I ? I.clip : null, power);
        // the man (and anyone else it caught, less) snapped away from it (not a man already on the ground: noSnap)
        if (!o.noSnap) list.forEach(function (x) { impSnap(x, bx, bz, vx, vy, vz, power, kind, x === on ? 1 : 0.6, x.ko); });
        // the stop: held, then eased (a knockout longest, and then a moment of slow motion as he falls). A heavy blow and a
        // knockout held a little longer than at first, and the knockout's slow motion longer (the owner, 5 Oct: "make it
        // louder and experience more dramatic"); the jab, the cross and the hook as they were, so the chain stays quick
        var heavy = ko || power >= 3, hold = ko ? IMPACT.hold[3] : power >= 3 ? IMPACT.hold[2] : power >= 1.5 ? IMPACT.hold[1] : IMPACT.hold[0], ease = ko ? 0.07 : power >= 3 ? 0.05 : 0.035;
        if (!impFreeze() || IMPS.hold + IMPS.ease - IMPS.t < hold + ease) { IMPS.t = 0; IMPS.hold = hold; IMPS.ease = ease; }
        if (ko && !boss && !o.noSlow) slowmo(IMPACT.slow, 0.45);
        // the camera: kicked along the blow (a heavy blow and a knockout harder), rolled a touch the way the fist went
        // across the view, the lens narrowed; a knockout punches it in toward him a moment as well (push)
        var cr = Math.cos(CAM.yaw), cs = -Math.sin(CAM.yaw), vh = Math.hypot(vx, vz) || 1, lat = (vx * cr + vz * cs) / vh;
        var big = ko ? 1.6 : power >= 3 ? 1.25 : power >= 1.5 ? 1 : 0.8, kick = big * (heavy ? IMPACT.kick : 1);
        CAM.imp = { t: 0, bx: bx, bz: bz, amp: 0.06 * kick, roll: -lat * 0.018 * kick, fov: 1.6 * big, push: ko ? IMPACT.push : 0 };
        CAM.shake = Math.max(CAM.shake, 0.04 + 0.03 * Math.min(3, power));
        if (ko || power >= 3 || PL.weapon) CAM.kick = Math.max(CAM.kick || 0, Math.min(1, (ko ? 0.8 : 0.55) * (heavy ? IMPACT.kick : 1)));
        // the flash, the ring and the sweat (a party's glass has its own shards; a street weapon its own swing)
        if (p && !o.party) impFx(p, bx, bz, vx, vy, vz, power, ko);
        // the sound: a party's weapon has its own (glass, the bucket); a street weapon thuds as it always did
        if (o.street) thud(Math.min(4, power)); else if (!o.party) impactSound(kind, power, ko);
        if (ko || power >= 3) crowdOoh(ko ? 1.1 : 0.8);
        if (I) I.done = true;
        IMP.last = { clip: I ? I.clip : null, kind: kind, power: +(+power).toFixed(2), ko: ko, gap: gap == null ? null : +gap.toFixed(3), hand: hand, on: I ? I.on : null, magnet: I ? I.mag : null, moved: I ? +I.moved.toFixed(3) : 0,
          aim: I ? Math.round(I.aim * 180 / PI) : 0, pitch: I ? Math.round(I.pitch * 180 / PI) : 0, d: on ? +dist(a, on).toFixed(3) : null, stop: [hold, ease], fx: !!(p && !o.party), time: +DIR.time.toFixed(3), hits: list.length,
          react: null, reactAfter: null, froze: null, lens: 0, kick: +CAM.imp.amp.toFixed(4), slow: ko && !boss && !o.noSlow ? IMPACT.slow : 0, push: 0 };
        if (on && on.snap) on.snap.last = IMP.last;
      }
      // (for the checks: the last blow's record as they read it, its lens and its stop rounded; the game keeps raw numbers)
      function impLastOut() {
        var L = IMP.last; if (!L) return null;
        var o = {}; for (var k in L) o[k] = L[k];
        o.lens = +(L.lens || 0).toFixed(2); o.push = +(L.push || 0).toFixed(3); if (L.froze) o.froze = { real: +L.froze.real.toFixed(4), game: +L.froze.game.toFixed(4), held: L.froze.held };
        return o;
      }
      function impKind(clip, power) {
        if (PL.last === 'heavy') return 'heavy';
        if (/body/.test(clip || '')) return 'body';
        if (/upper/i.test(clip || '')) return 'upper';
        if (/hook/i.test(clip || '')) return power >= 3 ? 'heavy' : 'hook';
        if (/jab/i.test(clip || '')) return 'jab';
        return 'cross';
      }
      // The man's reaction on the contact frame (over his flinch): his head, neck and upper back turned away from the blow
      // the way the fist went, at once (six tenths of it on the contact frame, all of it in the next thirtieth of a
      // second), then back with no bounce over a quarter of a second as his own flinch takes over. A hook (the fist going
      // across him) turns his head; an uppercut (going up) lifts the chin further; a body shot folds him over it.
      function impSnap(x, bx, bz, vx, vy, vz, power, kind, share, ko) {
        if (!impBones(x)) return;
        var A = clamp(0.26 + 0.08 * power, 0.26, 0.6) * share * (ko ? 1.25 : 1), vh = Math.hypot(vx, vz) || 1, vv = Math.hypot(vx, vy, vz) || 1;
        // the push, mostly away from the hero, bent the way the fist went
        var px = bx * 0.6 + vx / vh * 0.4, pz = bz * 0.6 + vz / vh * 0.4, pl = Math.hypot(px, pz) || 1; px /= pl; pz /= pl;
        var up = Math.max(0, vy / vv), lx = vx / vh - bx * (vx / vh * bx + vz / vh * bz), lz = vz / vh - bz * (vx / vh * bx + vz / vh * bz);
        var turn = (-lx * bz + lz * bx) * 0.9;
        x.snap = { t: 0, ax: pz, az: -px, tilt: A * (1 + 0.7 * up), twist: A * turn, fold: kind === 'body' ? A * 1.1 : 0, bx: bx, bz: bz, pw: power };
        IMP.snaps++;
      }
      function impEnv(t) { if (t < 0.03) return 0.6 + 0.4 * smooth(0, 0.03, t); var u = (t - 0.03) / 0.07; return (1 + u) * Math.exp(-u); }
      // a turn about a world axis, given to a bone (and so to everything it carries)
      function boneTurn(b, ax, ay, az, ang) {
        if (!b || !b.parent || !(Math.abs(ang) > 1e-5)) return;
        b.parent.getWorldQuaternion(IQ1); IQ2.setFromAxisAngle(IV3.set(ax, ay, az), ang);
        IQ2.premultiply(IQ3.copy(IQ1).invert()).multiply(IQ1); b.quaternion.premultiply(IQ2);
      }
      // (what the turns were given to, put back before the body is animated again, so nothing builds up on a bone the
      // clip does not move)
      // (each person's own store of them, made the first time and filled in place: iq, how many are kept)
      function impUndo(x) { var S = x.iqs; for (var i = 0; i < x.iq; i++) S[i].b.quaternion.copy(S[i].q); x.iq = 0; }
      function impKeep(x, b0, b1, b2, b3) {
        var S = x.iqs || (x.iqs = [{ b: null, q: new THREE.Quaternion() }, { b: null, q: new THREE.Quaternion() }, { b: null, q: new THREE.Quaternion() }, { b: null, q: new THREE.Quaternion() }]), n = 0;
        if (b0) { S[n].b = b0; S[n++].q.copy(b0.quaternion); }
        if (b1) { S[n].b = b1; S[n++].q.copy(b1.quaternion); }
        if (b2) { S[n].b = b2; S[n++].q.copy(b2.quaternion); }
        if (b3) { S[n].b = b3; S[n++].q.copy(b3.quaternion); }
        x.iq = n;
      }
      // after the body is animated: the man's snap, and the hero's lean into his blow
      function impPose(x, dt) {
        var B = impBones(x); if (!B) return;
        if (x === player) {
          var I = PL.imp, want = I && !I.done ? I.pitch * I.k : 0;
          PL.lean = damp(PL.lean || 0, want, I && !I.done ? 30 : 9, dt);
          if (Math.abs(PL.lean) > 0.004) { impKeep(x, B.chest); boneTurn(B.chest, Math.cos(x.yaw), 0, -Math.sin(x.yaw), PL.lean); }
          return;
        }
        var S = x.snap; if (!S) return;
        var first = !S.seen; S.seen = true;
        S.t += dt + (impFreeze() ? IMPS.rdt * 0.25 : 0);
        if (S.t > 0.45) { x.snap = null; return; }
        var e = impEnv(S.t);
        impKeep(x, B.back, B.chest, B.neck, B.head);
        // (for the checks: how far his head turned on the first frame drawn after the blow, and when that was)
        if (first) { B.head.getWorldQuaternion(IQ1); S.q0 = [IQ1.x, IQ1.y, IQ1.z, IQ1.w]; }
        if (S.fold) { boneTurn(B.back, S.ax, 0, S.az, -S.fold * 0.45 * e); boneTurn(B.chest, S.ax, 0, S.az, -S.fold * 0.45 * e); boneTurn(B.head, S.ax, 0, S.az, -S.fold * 0.3 * e); }
        else {
          boneTurn(B.chest, S.ax, 0, S.az, S.tilt * 0.2 * e);
          boneTurn(B.neck, S.ax, 0, S.az, S.tilt * 0.3 * e); boneTurn(B.neck, 0, 1, 0, S.twist * 0.4 * e);
          boneTurn(B.head, S.ax, 0, S.az, S.tilt * 0.5 * e); boneTurn(B.head, 0, 1, 0, S.twist * 0.6 * e);
        }
        if (first && S.last && IMP.last === S.last) { B.head.getWorldQuaternion(IQ1); var dq = Math.abs(IQ1.x * S.q0[0] + IQ1.y * S.q0[1] + IQ1.z * S.q0[2] + IQ1.w * S.q0[3]); S.last.react = Math.round(2 * Math.acos(Math.min(1, dq)) * 180 / PI); S.last.reactAfter = +(DIR.time - S.last.time).toFixed(3); }
      }
      // The flash, the ring and the sweat: one pool for the world, made with it (so open.warm compiles them, and a world
      // without it compiles just these, before the first blow), parked out of sight when idle. Hot colours, not tone
      // mapped, for the bloom; the flash small and gone in under a tenth of a second.
      var IFX = null;
      function impFxInit() {
        if (IFX) return IFX;
        var star = canvasTexture(64, 64, function (g, w, h) {
          var r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.16, 'rgba(255,250,235,.85)'); r.addColorStop(0.42, 'rgba(255,235,200,.18)'); r.addColorStop(1, 'rgba(255,230,190,0)');
          g.fillStyle = r; g.fillRect(0, 0, w, h);
          g.translate(w / 2, h / 2); g.fillStyle = 'rgba(255,248,230,.55)';
          for (var k = 0; k < 6; k++) { g.rotate(PI / 3); g.beginPath(); g.moveTo(0, -2.2); g.lineTo(w * 0.47, 0); g.lineTo(0, 2.2); g.fill(); }
        });
        var grp = new THREE.Group(); grp.name = 'impact-fx'; scene.add(grp);
        IFX = { grp: grp, flashes: [], rings: [], n: 72, live: 0, next: 0 };
        for (var i = 0; i < 4; i++) {
          var s = new THREE.Sprite(new THREE.SpriteMaterial({ map: star, color: new THREE.Color(3.2, 2.75, 2.25), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false, fog: false }));
          s.position.set(0, -9999, 0); s.renderOrder = 6; grp.add(s); IFX.flashes.push({ s: s, t: 9, life: 1, size: 0 });
          var r = new THREE.Mesh(new THREE.RingGeometry(0.88, 1, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.7, 1.6, 1.4), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false }));
          r.position.set(0, -9999, 0); r.renderOrder = 6; grp.add(r); IFX.rings.push({ m: r, t: 9, life: 1, r0: 0, r1: 0 });
        }
        var g = new THREE.BufferGeometry(), P = new Float32Array(IFX.n * 3), C = new Float32Array(IFX.n * 3);
        g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('color', new THREE.BufferAttribute(C, 3));
        for (var j = 0; j < IFX.n; j++) P[j * 3 + 1] = -9999;
        var pts = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.035, map: spTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false }));
        pts.frustumCulled = false; pts.renderOrder = 6; grp.add(pts);
        IFX.pts = pts; IFX.g = g; IFX.pos = P; IFX.col = C; IFX.vel = new Float32Array(IFX.n * 3); IFX.life = new Float32Array(IFX.n); IFX.max = new Float32Array(IFX.n); IFX.tint = new Float32Array(IFX.n * 3);
        return IFX;
      }
      // (a world without open.warm: just these few compiled now, for where the frame is drawn, as warmUp does)
      function impFxWarm() {
        var F = impFxInit(), sc = new THREE.Scene(), rt0 = renderer.getRenderTarget(), wrt = post ? new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType }) : null;
        sc.add(F.grp);
        try { if (wrt) renderer.setRenderTarget(wrt); renderer.compile(sc, camera); } catch (e) {}
        finally { renderer.setRenderTarget(rt0); if (wrt) wrt.dispose(); scene.add(F.grp); }
      }
      function impFx(p, bx, bz, vx, vy, vz, power, ko) {
        var F = impFxInit(), pw = Math.min(4, power) * (ko ? 1.3 : 1);
        // the flash on the hero's side of the contact, so it lights the face rather than hides it
        var fl = F.flashes[0], rg = F.rings[0], i;
        for (i = 0; i < F.flashes.length; i++) if (F.flashes[i].t >= F.flashes[i].life) { fl = F.flashes[i]; break; }
        fl.t = 0; fl.life = 0.06 + 0.012 * pw; fl.size = Math.min(0.46, 0.17 + 0.055 * pw); fl.s.position.set(p.x - bx * 0.05, p.y, p.z - bz * 0.05); fl.s.material.rotation = Math.random() * PI;
        // the ring stands square to the blow
        for (i = 0; i < F.rings.length; i++) if (F.rings[i].t >= F.rings[i].life) { rg = F.rings[i]; break; }
        rg.t = 0; rg.life = ko ? 0.15 : 0.11; rg.r0 = 0.05; rg.r1 = Math.min(0.42, 0.15 + 0.05 * pw); rg.m.position.copy(p); rg.m.lookAt(p.x + bx, p.y, p.z + bz);
        // the sweat (and a little spit), thrown on the way the blow went, a cone of it
        var vh = Math.hypot(vx, vz) || 1, dx = bx * 0.75 + vx / vh * 0.35, dz = bz * 0.75 + vz / vh * 0.35, dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
        var n = Math.min(40, Math.round(10 + 5 * pw));
        for (i = 0; i < n; i++) {
          var j = F.next++ % F.n, an = Math.atan2(dx, dz) + (Math.random() - 0.5) * 1.1, sp = (1.8 + Math.random() * 2.8) * (0.85 + 0.1 * pw);
          F.pos[j * 3] = p.x + (Math.random() - 0.5) * 0.06; F.pos[j * 3 + 1] = p.y + (Math.random() - 0.5) * 0.06; F.pos[j * 3 + 2] = p.z + (Math.random() - 0.5) * 0.06;
          F.vel[j * 3] = Math.sin(an) * sp; F.vel[j * 3 + 1] = 0.4 + Math.random() * 2.2 + Math.max(0, vy) * 0.2; F.vel[j * 3 + 2] = Math.cos(an) * sp;
          F.life[j] = F.max[j] = 0.22 + Math.random() * 0.3;
          var spit = Math.random() < 0.2; F.tint[j * 3] = spit ? 1.25 : 1.05; F.tint[j * 3 + 1] = spit ? 1.15 : 1.12; F.tint[j * 3 + 2] = spit ? 1.0 : 1.2;
        }
        F.live = F.n;
      }
      // (rdt: real time, for the flash and the ring, which play out in the stop; vdt: the game's, a little of it in the
      // stop, so the sweat leaves the face in slow motion)
      function impFxStep(rdt, vdt) {
        var F = IFX; if (!F) return;
        for (var a = 0; a < F.flashes.length; a++) {
          var q = F.flashes[a];
          if (q.t >= q.life) { if (q.s.position.y > -9000) q.s.position.y = -9999; continue; }
          q.t += rdt; var k = clamp(q.t / q.life, 0, 1), sc = q.size * (0.55 + 0.45 * smooth(0, 0.25, k)) * (1 - 0.3 * k);
          q.s.scale.set(sc, sc, 1); q.s.material.opacity = Math.pow(1 - k, 1.5);
        }
        for (var b = 0; b < F.rings.length; b++) {
          var g = F.rings[b];
          if (g.t >= g.life) { if (g.m.position.y > -9000) g.m.position.y = -9999; continue; }
          g.t += rdt; var u = clamp(g.t / g.life, 0, 1), r = g.r0 + (g.r1 - g.r0) * (1 - Math.pow(1 - u, 3));
          g.m.scale.set(r, r, r); g.m.material.opacity = 0.55 * (1 - u) * (1 - u);
        }
        if (!F.live) return;
        var live = 0;
        for (var i = 0; i < F.n; i++) {
          if (F.life[i] <= 0) { F.pos[i * 3 + 1] = -9999; continue; }
          live++; F.life[i] -= vdt; F.vel[i * 3 + 1] -= 9.8 * vdt;
          F.pos[i * 3] += F.vel[i * 3] * vdt; F.pos[i * 3 + 1] += F.vel[i * 3 + 1] * vdt; F.pos[i * 3 + 2] += F.vel[i * 3 + 2] * vdt;
          var k = clamp(F.life[i] / F.max[i], 0, 1); F.col[i * 3] = F.tint[i * 3] * k; F.col[i * 3 + 1] = F.tint[i * 3 + 1] * k; F.col[i * 3 + 2] = F.tint[i * 3 + 2] * k;
        }
        F.g.attributes.position.needsUpdate = true; F.g.attributes.color.needsUpdate = true; F.live = live;
      }

      /* ---------------------------------------------------- the fighting -- */
      function hurt(a, power, by) {
        if (a.car) { derbyHurt(a, power, by); return; }
        if (a.ko) return;
        // a fight in the street: the map's people scatter from it and its cars stop short (the city's crowd and traffic)
        if (OW.map && OW.map.alarm && DIR.time - (OW.alarmT || -9) > 1) { OW.alarmT = DIR.time; try { OW.map.alarm(V3A.set(a.x, a.y || 0, a.z), 18); } catch (e) {} }
        if (a === player) {
          if (invincible || demo || dodgeSafe()) return;
          if (cfg.tank) { tankHurt(a, power, by); return; }
          a.hp -= power; a.hurtT = 0; PL.regenT = 0; PL.fightT = DIR.time; PL.chain = 0;
          CAM.shake = Math.max(CAM.shake, 0.5); thud(1.4, true);
          var py = by && by.x != null ? yawTo(by, a.x, a.z) : a.yaw + PI; a.kx += Math.sin(py) * 1.6; a.kz += Math.cos(py) * 1.6;
          PL.pickT = 0; PL.picking = null;
          if (a.hp <= 0) { a.hp = 0; knockout(a, by); return; }
          play(a, power >= 14 ? 'hitChest' : 'hitHead', 1.4); a.stun = 0.32; PL.punching = 0; PL.queued = false;
          return;
        }
        if (a.boss && by === player && PL.weapon) power *= 0.5;
        a.hp -= power; a.hurtT = 0;
        // the blow carries them: a slide back that slows, never a jump
        // (a party's weapon slides him less than its harm would: a bottle over the head drops a man where he stands)
        var pushed = PL.noPush ? 0 : a.boss ? 0.15 : 0.45 * power * (by === player && PL.weapon ? wStat(PL.weapon, 'shove', 1) : 1);
        var yaw = yawTo(by, a.x, a.z); a.kx += Math.sin(yaw) * pushed * 6; a.kz += Math.cos(yaw) * pushed * 6;
        if (a.hp <= 0) { knockout(a, by); return; }
        // a boss shrugs off a jab; a finisher staggers anyone; a heavy swing knocks them back
        var rc = by === player && PL.weapon ? wStat(PL.weapon, 'react', null) : null;
        if (!a.boss || power >= 2) { play(a, rc || (power >= 3 && !a.boss ? 'hit' : Math.random() < 0.5 ? 'hitHead' : 'hitChest'), power >= 3 ? 1.15 : 1.3); a.stun = a.boss ? 0.3 : power >= 3 ? 0.8 : 0.55; if (a.token) { a.token = false; a.state = 'circle'; } else if (a.state === 'windup') a.state = 'circle'; }
        if (a.kind === 'civ') a.flee = 6;
        a.face = true;
      }
      // A tank (open.tank; AI Alps, the owner 4 Oct: "He walks through hits and blocks with his forearms"): an ordinary
      // blow neither shoves him nor makes him flinch, nor cuts off the punch he is throwing or the pick-up he is making.
      // One from in front of him (within 70 degrees of where he faces) while he is not throwing a punch (its wind-up and
      // strike; once it has landed his guard is back up) lands on his forearms, his guard (the boxer's, fists at his
      // temples, forearms before his face) held up for it: a fraction of its harm (open.tank.block, 0.4), the moment held
      // a beat, sparks where it meets them and a clank of metal. A heavy blow (a boss's, or 14 or more before the heat
      // adds to it) still rocks him back, blocked or not. (A block clip of its own was tried: the shield arm's pose read
      // as reaching out, and a stance clip played as a move stops the stance for good.)
      var TANK = { cone: 70 * PI / 180, heavy: 14, arms: 0.8, out: 0.36, stop: 0.035, open: 0.05 };
      function tankHurt(a, power, by) {
        // (heavy by who struck, not by the harm the heat has grown: from heat 7 an ordinary biker's blow is past 14, and
        // a world whose chapters raise the heat would have him rocked by every man mid-run)
        var heavy = !!(by && by.boss) || power / (1 + (DIR.heat - 1) * 0.07) >= TANK.heavy, from = !!by && by !== a && by.x != null;
        var open = PL.punching > 0 && PL.len - PL.punching < PL.hitAt + TANK.open;
        var blocked = from && !open && inFront(a, by, TANK.cone);
        if (blocked) { power *= cfg.tank.block; PL.blocked = (PL.blocked || 0) + 1; }
        a.hp -= power; a.hurtT = 0; PL.regenT = 0; PL.fightT = DIR.time; PL.chain = 0;
        if (blocked) {
          var bw = yawTo(a, by.x, by.z), h = clamp(Number(P0.height) || 1.8, 1.2, 2.6);
          blockSparks(a.x + Math.sin(bw) * TANK.out, (a.y || 0) + h * TANK.arms, a.z + Math.cos(bw) * TANK.out, Math.sin(bw), Math.cos(bw));
          clank(); CAM.shake = Math.max(CAM.shake, heavy ? 0.5 : 0.22); hitstop = Math.max(hitstop, TANK.stop);
        } else { CAM.shake = Math.max(CAM.shake, 0.5); thud(1.4, true); }
        if (a.hp <= 0) { a.hp = 0; knockout(a, by); return; }
        if (heavy) {
          // rocked back, as anyone is: a shove, the flinch, and his punch and his pick-up cut off
          var py = from ? yawTo(by, a.x, a.z) : a.yaw + PI; a.kx += Math.sin(py) * 1.6; a.kz += Math.cos(py) * 1.6;
          PL.pickT = 0; PL.picking = null;
          play(a, 'hitChest', 1.4); a.stun = 0.32; PL.punching = 0; PL.queued = false;
        }
      }
      function knockout(a, by) {
        if (a.car) { derbyWreck(a, by); return; }
        a.ko = true; a.koT = 0; a.token = false; a.act = null; a.busy = 0; a.state = 'ko';
        if (a === player) { crashOpen(by); return; }
        // knocked out in the air: he falls from there
        if (a.air) { a.vy = a.air.vy; a.lift = Math.max(a.lift || 0, 0.001); a.air = null; }
        // a weapon's knockout sends him flying, up and back, into whoever stands behind him
        // (a finisher's kick throws anyone, a boss too, as far as the heaviest swing)
        // (a party's weapon throws him its own distance: fly 0, a bottle, drops him where he stands)
        var flyP = PL.finKO ? 8 : PL.weapon ? PL.hitPower * wStat(PL.weapon, 'fly', 1) : 0;
        if (by === player && flyP && (!a.boss || PL.finKO)) { if (!(a.lift > 0)) a.liftBase = a.y || 0; var fy = yawTo(player, a.x, a.z), fs = 12 + flyP * 1.5; a.kx = Math.sin(fy) * fs; a.kz = Math.cos(fy) * fs; a.vy = 3.6 + flyP * 0.3; a.lift = 0.001; a.bowl = {}; a.flown = 0; }
        DIR.kos++; DIR.koHeat++;
        if (a.weapon && cfg.weapons && cfg.weapons.drops && by === player && WEAPONS[a.weapon.kind] && Math.random() < 0.4 && a.e.arm) {
          var wk = a.weapon.kind; a.e.arm(null); a.weapon = null;
          placePick(wk, a.x + Math.sin(a.yaw + 1.4) * 0.6, a.z + Math.cos(a.yaw + 1.4) * 0.6, { hits: Math.ceil(WEAPONS[wk].hits * 0.5), dropped: true });
        }
        var sp = spec(a.kind === 'civ' ? 'thug' : a.kind);
        var n = a.kind === 'civ' ? 1 : Math.max(1, Math.round(sp.gm * (1 + 0.12 * (DIR.heat - 1))));
        // (a party's glass broken over his head: the coins fly a moment after the shards, which they would hide)
        var gw = by === player && PL.weapon && !PL.weapon.keep && WEAPONS[PL.weapon.kind];
        drop(a.x, a.y, a.z, n, gw && gw.glass ? 0.3 : 0);
        if (a.kind === 'civ') DIR.heatT += cfg.heatEvery * 0.12;
        if (a.boss) { say(a.koSay = a.name + ' is down'); hitstop = 0.35; CAM.shake = 0.8; DIR.boss = null; SFX.level(); }
        else say(a.koSay = a.kind === 'civ' ? 'Knocked out a bystander' : cfg.coins ? 'Knockout +' + n + ' GM' : (a.name ? a.name + ' ' : '') + TX.kod);
        emit('knockout', { kind: a.kind, name: a.name, kos: DIR.kos, heat: DIR.heat, x: a.x, z: a.z });
        // the whole street sees it
        actors.forEach(function (b) { if (b.kind === 'civ' && !b.ko && dist(a, b) < 18) b.flee = 7; });
      }

      function stepPlayer(dt) {
        if (DERBY) { derbyPlayer(dt); return; }
        var a = player;
        if (a.ko) { a.speed = 0; return; }
        a.stun = Math.max(0, a.stun - dt); a.hurtT += dt; PL.regenT += dt; PL.jumpBuf = Math.max(0, PL.jumpBuf - dt);
        if (PL.regenT > 4 && a.hp < a.max) a.hp = Math.min(a.max, a.hp + 7 * dt);
        var mv = moveVec(), want = 0, dirX = 0, dirZ = 0;
        if (autopilot || demo) { var ap = pilot(dt); mv = ap; }
        // squared up when there is trouble near; the weapon's guard when armed
        var foe = 99; for (var fi = 0; fi < actors.length; fi++) { var fa = actors[fi]; if (fa !== a && fa.kind !== 'civ' && !fa.ko) foe = Math.min(foe, dist(a, fa)); }
        if (PL.pose && PL.faceHold != null) a.yaw = PL.faceHold;
        a.stance = PL.pose || (foe < 9 || DIR.time - PL.fightT < 4 ? (PL.weapon ? wStat(PL.weapon, 'stance', 'guard') : 'fight') : 'idle');
        if (PL.pickT > 0) { PL.pickT -= dt; if (PL.pickT <= 0 && PL.picking) { takePick(PL.picking); PL.picking = null; } }
        // the traversal (trav.js) moves, turns and animates the hero itself; the punches are still the fight's
        if (TRAV) {
          // a dodge in a traversal world: the traversal's ground motion is its facing times its speed plus a carry, and a
          // back flip goes the other way to its facing, so the flip rides on the carry along the same eased path
          if (PL.dodge) {
            var Dt = PL.dodge, ts = TRAV.state; Dt.t += dt;
            var Tu = clamp((Dt.t - Dt.go) / DODGE.ease, 0, 1), Tv = Tu > 0 && Tu < 1 ? Dt.dist * 2.2 * Math.pow(1 - Tu, 1.2) / DODGE.ease : 0;
            if (ts.mode === 'ground' && Tu > 0) { ts.carry.x = Dt.mx * Tv; ts.carry.z = Dt.mz * Tv; ts.speed = 0; ts.facing = Dt.yaw; }
            if (Dt.t > (Dt.side ? 0.6 : 0.7)) PL.dodge = null;
          }
          if (PL.hang) {
            // the air game in a traversal world: the hero placed beside the man he launched each step (the traversal's own
            // scripted move), rising with him, then level with him
            var Hh2 = PL.hang, Ht2 = Hh2.a, tsh = TRAV.state; Hh2.t += dt; Hh2.idle += dt;
            if (!Ht2 || Ht2.fade < 1 || (Ht2.ko && !(Ht2.lift > 0.3)) || (!Ht2.air && !Ht2.ko) || Hh2.idle > AIR.idle) endHang(false);
            else {
              var Hb = (Ht2.liftBase != null ? Ht2.liftBase : Ht2.y) + (Ht2.lift || 0) + 0.1, Hf = Hh2.t < Hh2.rise ? Hh2.fromY + (Hb - Hh2.fromY) * smooth(0, Hh2.rise, Hh2.t) : Hb;
              var Hy2 = yawTo(a, Ht2.x, Ht2.z), Hp = new THREE.Vector3(Ht2.x - Math.sin(Hy2) * 0.95, Hf + TRAV.H, Ht2.z - Math.cos(Hy2) * 0.95);
              if (tsh.mode !== 'air') { try { TRAV.player.traversal.toAir(new THREE.Vector3(0, 0, 0)); } catch (e) {} }
              tsh.vel.set(0, 0, 0); tsh.facing = Hy2;
              tsh.kin = { type: 'cmb', t: 0, dur: 1e-4, p0: tsh.pos.clone(), p1: tsh.pos.clone().lerp(Hp, 0.5), p2: Hp };
              if (Hh2.t >= Hh2.rise && PL.queued && PL.punching <= 0) airStrike();
            }
          }
          if (PL.slamDown && (TRAV.state.mode !== 'air' || DIR.time - (PL.slamT || 0) > 1.5)) { var slamM = TRAV.state.mode; PL.slamDown = false; if (slamM === 'ground') groundPound(); }
          if (PL.fin) { var Tf = Math.max(0, stepFin(a, dt)), tsf = TRAV.state; if (Tf > 0 && floorAt(a.x + Math.sin(a.yaw) * 0.6, a.z + Math.cos(a.yaw) * 0.6, a.y + 0.4) < a.y - 0.65) Tf = 0; if (tsf.mode === 'ground') { tsf.carry.x = Math.sin(a.yaw) * Tf; tsf.carry.z = Math.cos(a.yaw) * Tf; tsf.speed = 0; tsf.facing = a.yaw; } }
          travStep(a, dt); stepPunch(a, dt); return;
        }
        if (PL.hang) {
          // in the air beside the man he launched: rising with him, then held level with him, facing him
          var Hh = PL.hang, Ht = Hh.a; Hh.t += dt; Hh.idle += dt;
          if (!Ht || Ht.fade < 1 || (Ht.ko && !(Ht.lift > 0.3)) || (!Ht.air && !Ht.ko) || Hh.idle > AIR.idle) endHang(false);
          else {
            var Hw = (Ht.lift || 0) + 0.1;
            PL.air = Hh.t < Hh.rise ? Hh.from + (Hw - Hh.from) * smooth(0, Hh.rise, Hh.t) : damp(PL.air, Hw, 14, dt); PL.vy = 0;
            var Hy = yawTo(a, Ht.x, Ht.z), Hx = Ht.x - Math.sin(Hy) * 0.95, Hz = Ht.z - Math.cos(Hy) * 0.95;
            a.x = damp(a.x, Hx, 14, dt); a.z = damp(a.z, Hz, 14, dt); a.yaw = Hy; want = 0;
            if (Hh.t >= Hh.rise && PL.queued && PL.punching <= 0) airStrike();
          }
        } else if (PL.fin) {
          // the finisher: closing in, then the kick; nothing moves him off it
          // (a step back is a negative speed: only the punch finisher's, open.kicks: false, ever asks for one)
          // (open.impact: turned off the line to him for the haymaker, he still walks along it: stepFin's aim)
          var Fv = stepFin(a, dt), Fb = Fv < 0 ? -1 : 1, Fy = PL.fin && PL.fin.p && PL.fin.p.aim && PL.fin.a ? yawTo(a, PL.fin.a.x, PL.fin.a.z) : a.yaw; want = Fv * Fb; if (Fv) { dirX = Math.sin(Fy) * Fb; dirZ = Math.cos(Fy) * Fb; }
        } else if (PL.dodge && PL.air <= 0) {
          // the flip: carried its distance on the ease's own speed (so a wall or a car stops it, never jumps it), the body
          // held the way it faces (the clip turns it over)
          var Dg = PL.dodge; Dg.t += dt; a.yaw = Dg.yaw;
          var Du = clamp((Dg.t - Dg.go) / DODGE.ease, 0, 1);
          want = Du > 0 && Du < 1 ? Math.min(16, Dg.dist * 2.2 * Math.pow(1 - Du, 1.2) / DODGE.ease) : 0; dirX = Dg.mx; dirZ = Dg.mz;
          if (Dg.t > (Dg.side ? 0.6 : 0.7)) PL.dodge = null;
        } else if (PL.air > 0) {
          // in the air: the run's momentum carries on, the stick bends it a little
          PL.vy -= JUMPOW.g * dt; PL.air += PL.vy * dt;
          if (mv.len > 0.05) { var tg = Math.atan2(mv.x, mv.z), dy0 = tg - a.mdir; while (dy0 > PI) dy0 -= TAU; while (dy0 < -PI) dy0 += TAU; a.mdir += clamp(dy0, -2.5 * dt, 2.5 * dt); }
          want = a.speed; dirX = Math.sin(a.mdir); dirZ = Math.cos(a.mdir); face(a, a.mdir, 1 - Math.exp(-6 * dt));
          if (PL.air <= 0) {
            PL.air = 0; PL.vy = 0; thud(0.5);
            if (PL.slamDown) { PL.slamDown = false; groundPound(); }
            for (var lk = 0; lk < 6; lk++) { var lj = spNext++ % SPN, la = Math.random() * TAU; spPos[lj * 3] = a.x + Math.sin(la) * 0.25; spPos[lj * 3 + 1] = groundAt(a.x, a.z) + 0.05; spPos[lj * 3 + 2] = a.z + Math.cos(la) * 0.25; spVel[lj * 3] = Math.sin(la) * 1.2; spVel[lj * 3 + 1] = 0.8; spVel[lj * 3 + 2] = Math.cos(la) * 1.2; spLife[lj] = 0.35; }
            if (PL.jumpBuf > 0) jump();
          }
        } else if (a.stun > 0 || PL.pickT > 0) {
          want = 0; PL.dash = null;
        } else if (PL.dash) {
          // the dash: straight in at the one the blow is for, on the run, and the blow when he is in reach
          var Dh = PL.dash, Dt = Dh.a; Dh.t += dt;
          if (!Dt || Dt.ko || Dt.fade < 1 || Dh.t > 0.8) { PL.dash = null; want = 0; }
          else {
            var Dy = yawTo(a, Dt.x, Dt.z); a.yaw = Dy; a.mdir = Dy;
            if (dist(a, Dt) <= DASH.within + Dt.r * 0.5) { PL.dash = null; PL.dashLeap = Dh.leap; startFlow(Dh.step, Dt, Dh.force); PL.dashLeap = false; want = 0; }
            else { want = DASH.speed; dirX = Math.sin(Dy); dirZ = Math.cos(Dy); }
          }
        } else {
          var sprint = (IN.sprint || (autopilot || demo) && mv.sprint) && PL.punching <= 0;
          // someone within reach and you not running: squared up to him, moving on your
          // feet like a boxer (in, back, round him) instead of turning your back
          var near = null, nd = 3.2;
          if (!sprint) for (var ni = 0; ni < actors.length; ni++) { var na = actors[ni]; if (na !== a && na.kind !== 'civ' && !na.ko && na.fade >= 1) { var dd = dist(a, na); if (dd < nd) { nd = dd; near = na; } } }
          want = mv.len * (sprint ? 7.4 : near ? 1.9 : 4.7) * (PL.punching > 0 ? 0.22 : 1);
          if (mv.len > 0.05) { dirX = mv.x / mv.len; dirZ = mv.z / mv.len; a.mdir = Math.atan2(dirX, dirZ); if (PL.punching <= 0 && !near) face(a, a.mdir, 1 - Math.exp(-14 * dt)); }
          if (near && PL.punching <= 0) face(a, yawTo(a, near.x, near.z), 1 - Math.exp(-9 * dt));
        }
        want *= wade(a);
        a.speed = PL.air > 0 || PL.dash || PL.dodge || PL.fin || PL.hang ? want : damp(a.speed, want, want > a.speed ? 9 : 14, dt);
        a.x += dirX * a.speed * dt; a.z += dirZ * a.speed * dt;
        if (want === 0) { a.x += a.vx * dt; a.z += a.vz * dt; }
        // the map's cars (the city's traffic): stepped out of their way, not through them
        if (OW.map && OW.map.collide) { var cr = OW.map.collide(V3A.set(a.x, a.y, a.z), 0.4, 1.8); if (cr && cr.push) { a.x += cr.push.x; a.z += cr.push.z; } }
        collide(a);
        stepPunch(a, dt);
      }
      // the punch lands at its moment of contact; a queued one follows on
      function stepPunch(a, dt) {
        if (PL.punching > 0) {
          var before = PL.len - PL.punching; PL.punching -= dt; var now = PL.len - PL.punching;
          // (open.impact: aimed so the fist lands, and pulled in to it in the last moments: impStep)
          var aimed = PL.imp && PL.imp.len === PL.len && before < PL.hitAt ? impStep(a, dt, now) : false;
          if (!aimed && PL.lock && !PL.lock.ko) face(a, yawTo(a, PL.lock.x, PL.lock.z), 1 - Math.exp(-18 * dt));
          if (before < PL.hitAt && now >= PL.hitAt) hitCheck();
          // (never before this blow's own contact: the launcher's comes late in its move)
          if (PL.queued && PL.punching < PL.len * 0.38 && now >= PL.hitAt) { if (PL.hang) airStrike(); else startPunch((PL.combo + 1) % chainLen()); }
          if (PL.punching <= 0) PL.punching = 0;
        }
      }

      /* ---------------------------------------------- shots (ranged) -- */
      // the owner, 1 Oct ("aliens that shoot fireballs"): a glowing shot from
      // range, led a little, that a jump clears and a wall stops
      var SHOTS = [], shotGeo = new THREE.SphereGeometry(1, 16, 12), shotGlow = null;
      function aim(a) {
        if (!a.sp.ranged.melee) a.token = false;
        a.state = 'aim'; a.t = 0; a.shot = false;
        var ci = play(a, a.creature ? 'cast' : 'cross', 1.1); a.shotAt = ci.contact / 1.1;
        a.rcool = a.sp.ranged.every * (0.8 + Math.random() * 0.5);
        if (a.token) { a.token = false; tokens = Math.max(0, tokens - 1); }
      }
      function fire(a) {
        var r = a.sp.ranged, P = player; if (!P) return;
        if (!shotGlow) shotGlow = canvasTexture(64, 64, function (g, w, h) { var rg = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.35, 'rgba(255,255,255,0.55)'); rg.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = rg; g.fillRect(0, 0, w, h); });
        var mz = a.e.muzzle ? a.e.muzzle() : { y: 1.35, forward: 0.55 };
        var sx = a.x + Math.sin(a.yaw) * mz.forward, sz = a.z + Math.cos(a.yaw) * mz.forward, sy = a.y + mz.y;
        // where the player will be, roughly
        var lead = dist(a, P) / r.speed * 0.6, px = P.x + Math.sin(P.mdir || P.yaw) * P.speed * lead, pz = P.z + Math.cos(P.mdir || P.yaw) * P.speed * lead;
        var dx = px - sx, dz = pz - sz, dy = (P.y + 1.15) - sy, n = Math.hypot(dx, dy, dz) || 1;
        var col = new THREE.Color(r.color), g = new THREE.Group();
        var core = new THREE.Mesh(shotGeo, new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(4), toneMapped: false })); core.scale.setScalar(r.size);
        var halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: shotGlow, color: col, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false })); halo.scale.setScalar(r.size * 5);
        g.add(core, halo); g.position.set(sx, sy, sz); scene.add(g);
        SHOTS.push({ g: g, x: sx, y: sy, z: sz, vx: dx / n * r.speed, vy: dy / n * r.speed, vz: dz / n * r.speed, life: r.range / r.speed + 0.5, dmg: r.damage, by: a, col: r.color, trail: 0 });
        whoosh();
      }
      function endShot(s, i) {
        burst({ x: s.x, y: s.y, z: s.z }, s.col, 14);
        scene.remove(s.g); s.g.traverse(function (m) { if (m.material) m.material.dispose(); });
        SHOTS.splice(i, 1);
      }
      function stepShots(dt) {
        for (var i = SHOTS.length - 1; i >= 0; i--) {
          var s = SHOTS[i], P = player;
          s.life -= dt; s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt; s.g.position.set(s.x, s.y, s.z);
          s.g.children[1].material.rotation += dt * 6;
          s.trail -= dt; if (s.trail <= 0) { s.trail = 0.05; burst({ x: s.x, y: s.y, z: s.z }, s.col, 1); }
          var hit = false;
          var into = P && P.car ? (function () { var lp = toLocal(P, s.x, s.z); return Math.abs(lp.z) < P.car.hl + 0.3 && Math.abs(lp.x) < P.car.hw + 0.3 && s.y < P.y + P.car.h + 0.2; })() : P && Math.hypot(P.x - s.x, P.z - s.z) < P.r + 0.32 && s.y > P.y + 0.15 && s.y < P.y + 2.1;
          if (P && !P.ko && into && !(P === player && dodgeSafe())) {
            // jumped over it, it flies on underneath (the height test above)
            hurt(P, s.dmg * (1 + (DIR.heat - 1) * 0.07), s.by); hit = true;
          }
          if (!hit && (s.life <= 0 || s.y < groundAt(s.x, s.z) + 0.05 || camBlocked(s.x, s.y, s.z))) hit = true;
          if (hit) endShot(s, i);
        }
      }
      function clearShots() { for (var i = SHOTS.length - 1; i >= 0; i--) endShot(SHOTS[i], i); }

      /* ---------------------------------------------------- the others -- */
      var tokens = 0;
      function maxTokens() { return Math.min(4, 1 + Math.floor(DIR.heat / 2)); }
      function stepEnemy(a, dt) {
        var sp = a.sp, P = player;
        a.stun = Math.max(0, a.stun - dt); a.cool -= dt; a.t += dt;
        if (sp.ranged) { if (a.rcool == null) a.rcool = Math.random() * sp.ranged.every; a.rcool -= dt; }
        // a player on another level: up a wall after him, or off a roof (climb.js)
        if (climbOn() && climbFoe(a, dt)) { foePose(a); return; }
        var d = dist(a, P), want = 0, dx = 0, dz = 0;
        if (P.ko) { a.state = 'idle'; a.stance = 'arms'; }
        if (a.stun > 0) { a.speed = damp(a.speed, 0, 12, dt); return; }
        switch (a.state) {
          case 'idle': want = 0; a.stance = 'shift'; if (!P.ko && d < 60) a.state = 'chase'; break;
          case 'aim': {
            // a shot: face the player, wind up, let it go at the moment of release
            face(a, yawTo(a, P.x, P.z), 1 - Math.exp(-12 * dt));
            if (!a.shot && a.t >= a.shotAt) { a.shot = true; fire(a); }
            if (a.t >= a.busy + 0.1) { a.state = sp.ranged.keep && d > 4 ? 'hold' : 'circle'; a.t = 0; }
            break;
          }
          case 'hold': {
            // a shooter keeps its distance, sidling round, until it can shoot again
            a.stance = 'fight';
            face(a, yawTo(a, P.x, P.z), 1 - Math.exp(-8 * dt));
            var hr = sp.ranged.range * 0.7, hx = P.x + Math.sin(a.slot) * hr, hz = P.z + Math.cos(a.slot) * hr; a.slot += dt * (a.id % 2 ? 0.25 : -0.25);
            var hw2 = steer(a, hx, hz), hd = Math.hypot(hw2.x - a.x, hw2.z - a.z);
            if (hd > 0.6) { dx = (hw2.x - a.x) / hd; dz = (hw2.z - a.z) / hd; want = Math.min(sp.speed * 0.7, hd); }
            if (a.rcool <= 0 && d < sp.ranged.range && !P.ko) aim(a);
            else if (d < 3 || (!sp.ranged.keep && a.t > 2)) { a.state = 'circle'; a.t = 0; }
            else if (d > sp.ranged.range * 1.3) { a.state = 'chase'; a.t = 0; }
            break;
          }
          case 'chase': {
            if (sp.ranged && a.rcool <= 0 && d > 3.5 && d < sp.ranged.range && !P.ko) { aim(a); break; }
            if (sp.ranged && sp.ranged.keep && d < sp.ranged.range * 0.75 && d > 3.5) { a.state = 'hold'; a.t = 0; break; }
            a.stance = a.weapon ? wStat(a.weapon, 'stance', 'guard') : 'fight';
            var ax = P.x + Math.sin(a.slot) * 2.8, az = P.z + Math.cos(a.slot) * 2.8, wp = steer(a, ax, az);
            dx = wp.x - a.x; dz = wp.z - a.z; var n = Math.hypot(dx, dz) || 1; dx /= n; dz /= n;
            want = d > 12 ? sp.speed * 1.15 : d > 5 ? sp.speed : sp.speed * 0.6;
            face(a, Math.atan2(dx, dz), 1 - Math.exp(-8 * dt));
            if (d < 3.4) { a.state = 'circle'; a.t = 0; }
            break;
          }
          case 'circle': {
            a.stance = a.weapon ? wStat(a.weapon, 'stance', 'guard') : 'fight';
            if (d > 5) { a.state = 'chase'; break; }
            a.slot += dt * (a.id % 2 ? 0.35 : -0.35);
            var tx = P.x + Math.sin(a.slot) * 2.5, tz = P.z + Math.cos(a.slot) * 2.5;
            dx = tx - a.x; dz = tz - a.z; var m = Math.hypot(dx, dz);
            if (m > 0.2) { dx /= m; dz /= m; want = Math.min(0.95, m * 1.1); }
            face(a, yawTo(a, P.x, P.z), 1 - Math.exp(-10 * dt));
            if (a.cool <= 0 && tokens < maxTokens() && !P.ko) { a.token = true; tokens++; a.state = 'close'; a.t = 0; }
            break;
          }
          case 'close': {
            // step in to reach
            face(a, yawTo(a, P.x, P.z), 1 - Math.exp(-12 * dt));
            if (d > sp.reach + 0.25) { var wq = steer(a, P.x, P.z), dq = Math.hypot(wq.x - a.x, wq.z - a.z) || 1; dx = (wq.x - a.x) / dq; dz = (wq.z - a.z) / dq; want = sp.speed * 0.8; }
            else { a.state = 'windup'; a.t = 0; a.stance = a.weapon ? wStat(a.weapon, 'stance', 'guard') : 'fight'; warnOf(a); }
            if (a.t > 3) { a.token = false; tokens = Math.max(0, tokens - 1); a.state = 'circle'; a.cool = 1; }
            break;
          }
          case 'windup': {
            face(a, yawTo(a, P.x, P.z), 1 - Math.exp(-12 * dt));
            if (a.t > sp.windup) {
              var mvs = BIG.on && !a.weapon && sp.moves.indexOf('jab') >= 0 ? sp.moves.concat(['upperL', 'uppercut', 'body'].filter(function (n) { return hasMove(a, n); })) : sp.moves;
              var mvn = a.next || mvs[Math.floor(Math.random() * mvs.length)]; a.next = null;
              var rate = /slash|dash/.test(mvn) ? 1.25 : 1.45;
              var ci = play(a, mvn, rate); a.strikeAt = ci.contact / rate; a.state = 'strike'; a.t = 0; a.struck = false;
              if (d > 0.9) { var sy = yawTo(a, P.x, P.z); a.kx += Math.sin(sy) * 1.5; a.kz += Math.cos(sy) * 1.5; }
            }
            break;
          }
          case 'strike': {
            if (!a.struck && a.t >= a.strikeAt) {
              a.struck = true;
              // a blow at someone who jumped clear of it swings under
              // ... and a dodge in time takes no harm from it
              if (d < sp.reach + P.r + 0.2 && inFront(a, P, 0.9) && !(P === player && PL.air > 0.45) && !(P === player && dodgeSafe()) && !(P === player && climbOn() && Math.abs(a.y - TRV.y) > 1.6)) hurt(P, sp.dmg * (1 + (DIR.heat - 1) * 0.07), a);
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
          dx = a.x - player.x; dz = a.z - player.z; var n = Math.hypot(dx, dz) || 1; dx /= n; dz /= n; want = 5.2; a.stance = 'shift';
          face(a, Math.atan2(dx, dz), 1 - Math.exp(-8 * dt));
        } else if (a.idleT > 0) {
          a.idleT -= dt;
        } else {
          if (!a.goal || Math.hypot(a.goal.x - a.x, a.goal.z - a.z) < 1.2 || a.t > 40) {
            if (Math.random() < 0.35 && a.goal) { a.idleT = 6 + Math.random() * 14; a.stance = ['phone', 'argue', 'arms', 'shift', 'shift', 'dance'][Math.floor(Math.random() * 6)]; a.goal = null; return; }
            a.goal = openSpot(a.x, a.z, 12, 50); a.t = 0;
          }
          var wc = steer(a, a.goal.x, a.goal.z);
          dx = wc.x - a.x; dz = wc.z - a.z; var m = Math.hypot(dx, dz) || 1; dx /= m; dz /= m; want = a.walk || 1.25; a.stance = 'shift';
          face(a, Math.atan2(dx, dz), 1 - Math.exp(-4 * dt));
        }
        want *= wade(a);
        if (want > 0.05 && (dx || dz)) a.mdir = Math.atan2(dx, dz);
        a.speed = damp(a.speed, want, 6, dt);
        a.x += dx * a.speed * dt; a.z += dz * a.speed * dt;
      }
      // A crowd (open.civilians as an object; AI Alps' party): dressed by the world's look, standing in the world's zones
      // (a dance floor, a bar), each on a spot of their own, doing what the zone says (or what the crowd's weights pick)
      // and facing where it says (the booth). They flee a fight as anyone does, then drift back to their spot. The library
      // has one dance, a one-second loop, and a floor of it would move in lock-step, so each dancer keeps a pace of their
      // own (0.85 to 1.15, over the loop's own random start) and now and then steps off it to talk, fold their arms or
      // shift their weight. With the motion pack listed, a dancer may dance any of its dances too. Only a world with a
      // crowd has any of this; the street's people of a plain number are stepCivilian's, as they always were.
      var CROWD = cfg.crowd ? Object.assign(cfg.crowd, { free: [], refillT: 0, turned: 0, refills: 0, breaks: 0, last: null, dances: {}, sp: null }) : null;
      if (CROWD && CROWD.look) {
        // dressed from a plain body: the street's mix of skin, hair and height, and only what the look puts on them (none
        // of the beach's tees, caps and shades left under a party's coats)
        var crowdLook = CROWD.look;
        CROWD.sp = { names: [''], weapon: null, body: null, make: null, look: function (c, i, h) {
          var r = crowdLook(c, i, h); CROWD.last = r && typeof r === 'object' ? r : null;
          return Object.assign({ clothes: null, gear: null }, CROWD.last || {});
        } };
      }
      // a stance they can hold: a looped clip on their body (a one-off move held as a stance would freeze on its first frame)
      function crowdHas(a, n) {
        if (n === 'idle') return true;
        var A = ASSETS[a.body], l = A && A.json.clips ? A.json.clips.list : [];
        for (var i = 0; i < l.length; i++) if (l[i].name === n) return !!l[i].loop;
        return false;
      }
      // the dances a body has: the library's loop, and the motion pack's when the world lists it
      function crowdDances(a) {
        var d = CROWD.dances[a.body];
        if (!d) { var A = ASSETS[a.body], l = A && A.json.clips ? A.json.clips.list : []; d = ['dance']; l.forEach(function (c) { if (/^dance[A-Z]/.test(c.name) && c.loop !== false) d.push(c.name); }); CROWD.dances[a.body] = d; }
        return d;
      }
      // what a party-goer does at their spot: their zone's own (a dance floor dances), or one by the crowd's weights
      function crowdStance(a) {
        var H = a.party.home, z = H.zone >= 0 ? CROWD.zones[H.zone] : null, s = z && z.stance && crowdHas(a, z.stance) ? z.stance : null, k;
        if (!s) {
          var tot = 0; for (k in CROWD.stances) if (crowdHas(a, k)) tot += CROWD.stances[k];
          var r = Math.random() * tot; s = 'shift';
          for (k in CROWD.stances) { if (!crowdHas(a, k)) continue; r -= CROWD.stances[k]; if (r <= 0) { s = k; break; } }
        }
        if (s === 'dance') { var d = crowdDances(a); s = d[Math.floor(Math.random() * d.length)]; }
        return crowdHas(a, s) ? s : 'idle';
      }
      // where they face at their spot: whoever they talk to, the zone's point (the booth), or the zone's middle; out of
      // the zones, whichever way they came (null)
      function crowdYaw(a) {
        var P = a.party, H = P.home, z = H.zone >= 0 ? CROWD.zones[H.zone] : null, jit = (Math.random() - 0.5) * 0.6;
        if (P.stance === 'talk' || P.stance === 'argue') {
          var nb = null, nd = 2.4;
          actors.forEach(function (b) { if (b === a || !b.party || b.ko) return; var d = Math.hypot(b.party.home.x - H.x, b.party.home.z - H.z); if (d < nd && d > 0.3) { nd = d; nb = b.party.home; } });
          if (nb) return yawTo(H, nb.x, nb.z) + jit * 0.3;
        }
        if (z && z.face) return yawTo(H, z.face[0], z.face[1]) + jit;
        if (z && Math.hypot(z.x - H.x, z.z - H.z) > 0.6) return yawTo(H, z.x, z.z) + jit;
        return z ? a.yaw + jit : null;
      }
      // a new spell at their spot: a dancer steps off the floor a while (then back on, to a dance of their choosing),
      // anyone else picks again
      function crowdMood(a) {
        var P = a.party;
        if (/^dance/.test(P.stance) && !P.rest && Math.random() < 0.35) {
          var off = ['talk', 'arms', 'shift'].filter(function (n) { return crowdHas(a, n); });
          if (off.length) { P.stance = off[Math.floor(Math.random() * off.length)]; P.rest = true; P.t = 3 + Math.random() * 5; P.yaw = crowdYaw(a); CROWD.breaks++; return; }
        }
        P.rest = false; P.stance = crowdStance(a); P.t = (/^dance/.test(P.stance) ? 6 : 8) + Math.random() * 10; P.yaw = crowdYaw(a);
      }
      // a spot of their own in a zone: open ground, a step from everyone else's (and from those kept for newcomers)
      function crowdSpot(zi, who) {
        var z = CROWD.zones[zi], best = null, bd = -1;
        for (var k = 0; k < 30; k++) {
          var an = Math.random() * TAU, r = z.r * Math.sqrt(Math.random()), x = z.x + Math.sin(an) * r, zz = z.z + Math.cos(an) * r;
          if (x < W.x0 + 1 || x > W.x1 - 1 || zz < W.z0 + 1 || zz > W.z1 - 1 || solidAt(x, zz, 0.45) || !navOpen(x, zz)) continue;
          var md = 9;
          for (var i = 0; i < actors.length; i++) { var b = actors[i]; if (b !== who && b.party && !b.ko) md = Math.min(md, Math.hypot(b.party.home.x - x, b.party.home.z - zz)); }
          CROWD.free.forEach(function (h) { md = Math.min(md, Math.hypot(h.x - x, h.z - zz)); });
          if (md >= 1.05) return { zone: zi, x: x, z: zz };
          if (md > bd) { bd = md; best = { zone: zi, x: x, z: zz }; }
        }
        return best || { zone: zi, x: z.x, z: z.z };
      }
      function crowdRing() { var p = openSpot(player.x, player.z, 8, 90); return { zone: -1, x: p.x, z: p.z }; }
      // one of them, at home, or (a newcomer) arriving from somewhere else
      function partyGoer(home, at) {
        var p = at || home; CROWD.last = null;
        var c = person('civ', CROWD.sp, { x: p.x, z: p.z });
        if (!c) return null;
        c.hp = c.max = 1; c.walk = 1.1 + Math.random() * 0.5; c.y = groundAt(c.x, c.z); c.yaw = Math.random() * TAU;
        c.party = { home: home, stance: 'shift', t: 0, stay: 0, rate: 0.85 + Math.random() * 0.3, rest: false, away: !!at, late: !!at, yaw: null, look: CROWD.last };
        // (their first spell and stay cut short at random, so they do not all change at once)
        crowdMood(c); c.party.t *= Math.random(); c.party.stay = (home.zone >= 0 ? 25 + Math.random() * 35 : 6 + Math.random() * 14) * Math.random();
        if (c.party.yaw != null && !at) c.yaw = c.party.yaw;
        c.stance = c.party.stance;
        return c;
      }
      function crowdReset() {
        CROWD.free = []; CROWD.refillT = 4;
        var Z = CROWD.zones, n = cfg.civilians, plan = [], k, j;
        // the zones that give a count take theirs first, in order; the rest are shared out among the zones that give
        // none (or, when every zone gives its own, stand about the place as the street's people do)
        for (k = 0; k < Z.length; k++) for (j = 0; j < (Z[k].count || 0) && plan.length < n; j++) plan.push(k);
        var open = []; for (k = 0; k < Z.length; k++) if (Z[k].count == null) open.push(k);
        for (k = 0; plan.length < n; k++) plan.push(open.length ? open[k % open.length] : -1);
        for (k = 0; k < plan.length; k++) if (!partyGoer(plan[k] >= 0 ? crowdSpot(plan[k], null) : crowdRing(), null)) break;
      }
      // somewhere else to stand (open.civilians.wander, on unless false): mostly in the same zone, now and then another;
      // out of the zones, a spot 12 to 50 m off, as the street's people walk to
      function crowdMove(a) {
        var P = a.party, H = P.home;
        P.stay = H.zone >= 0 ? 25 + Math.random() * 35 : 6 + Math.random() * 14;
        if (Math.random() < 0.5) return;
        if (H.zone >= 0) P.home = crowdSpot(CROWD.zones.length > 1 && Math.random() < 0.35 ? Math.floor(Math.random() * CROWD.zones.length) : H.zone, a);
        else { var p = openSpot(a.x, a.z, 12, 50); P.home = { zone: -1, x: p.x, z: p.z }; }
        crowdMood(a); P.away = true;
      }
      // A party backs off from a fight rather than running off as the street does: clear of him (8 m), for a couple of
      // seconds at most, watching it, and then back to their spots at a brisk walk. (Run off at the street's pace for the
      // street's seven seconds, one knockout emptied the dance floor to the edge of the map for a quarter of a minute.)
      var CROWDBACK = { clear: 8, flee: 2, back: 2.2, brisk: 3 };
      function stepParty(a, dt) {
        var P = a.party, H = P.home;
        a.t += dt; a.flee = Math.min(CROWDBACK.flee, Math.max(0, a.flee - dt));
        var want = 0, dx = 0, dz = 0;
        if (a.flee > 0 && player) {
          // away from the fight until clear of it, then watching it
          dx = a.x - player.x; dz = a.z - player.z; var n = Math.hypot(dx, dz) || 1; dx /= n; dz /= n; a.stance = 'shift'; P.away = true; P.back = true;
          if (n < CROWDBACK.clear) { want = 5.2; face(a, Math.atan2(dx, dz), 1 - Math.exp(-8 * dt)); }
          else { face(a, Math.atan2(-dx, -dz), 1 - Math.exp(-6 * dt)); dx = dz = 0; }
        } else {
          var hd = Math.hypot(H.x - a.x, H.z - a.z);
          if (hd > (P.away ? 0.3 : 0.9)) {
            // back to their spot (pushed off it, after running, or new to it), slowing as they come to it; briskly from a
            // fight they backed off from
            P.away = true;
            var w = steer(a, H.x, H.z); dx = w.x - a.x; dz = w.z - a.z; var m = Math.hypot(dx, dz) || 1; dx /= m; dz /= m;
            want = Math.min(P.back && hd > CROWDBACK.brisk ? CROWDBACK.back : a.walk || 1.25, 0.3 + hd * 1.5); a.stance = 'shift';
            face(a, Math.atan2(dx, dz), 1 - Math.exp(-5 * dt));
          } else {
            P.away = false; P.back = false; P.t -= dt; P.stay -= dt;
            if (P.t <= 0) crowdMood(a);
            if (P.yaw == null) P.yaw = a.yaw;
            a.stance = P.stance;
            face(a, P.yaw, 1 - Math.exp(-3 * dt));
            if (CROWD.wander && P.stay <= 0) crowdMove(a);
          }
        }
        want *= wade(a);
        if (want > 0.05 && (dx || dz)) a.mdir = Math.atan2(dx, dz);
        a.speed = damp(a.speed, want, 6, dt);
        a.x += dx * a.speed * dt; a.z += dz * a.speed * dt;
      }
      // trouble out of the crowd (open.civilians.turn): one of the party 6 to 30 m from him turns on him, dressed as they
      // were, instead of one more arriving out of sight. Their spot is taken a while later by someone new
      function crowdTurn() {
        if (!player) return false;
        var pool = actors.filter(function (a) { if (!a.party || a.ko || a.scripted || a.fade < 1 || a.party.home.zone < 0) return false; var d = dist(a, player); return d >= 6 && d <= 30; });
        if (!pool.length) return false;
        var a = pool[Math.floor(Math.random() * pool.length)], kind = CROWD.turn.kind, sp = spec(kind);
        CROWD.free.push(a.party.home); a.party = null; a.turned = true; CROWD.turned++;
        // as spawnKind makes one of them, for the heat
        a.kind = kind; a.hp = a.max = sp.hp + Math.floor((DIR.heat - 1) * 0.7);
        a.sp = Object.assign({}, sp, { speed: sp.speed * (1 + Math.min(0.25, (DIR.heat - 1) * 0.03)), windup: sp.windup * Math.max(0.6, 1 - (DIR.heat - 1) * 0.05) });
        a.name = sp.names[Math.floor(Math.random() * sp.names.length)]; a.boss = false; a.flee = 0; a.token = false; a.cool = 0.8 + Math.random(); a.t = 0; a.state = 'chase';
        // their kind's weapon in hand, if it carries one and they came with none
        if (!a.weapon && sp.weapon && a.e.arm) { try { a.e.arm(sp.weapon); a.weapon = sp.weapon; } catch (e) {} }
        a.stance = a.weapon ? wStat(a.weapon, 'stance', 'guard') : 'fight';
        return true;
      }
      // the party kept full: a spot left by someone knocked out or turned on him is taken, a while later, by a newcomer who
      // walks in from out of sight
      function stepCrowd(dt) {
        for (var i = 0; i < actors.length; i++) { var a = actors[i]; if (a.party && a.ko && !a.party.left) { a.party.left = true; if (a.party.home.zone >= 0) CROWD.free.push(a.party.home); } }
        CROWD.refillT -= dt;
        if (!CROWD.free.length || CROWD.refillT > 0) return;
        CROWD.refillT = 3 + Math.random() * 2;
        var live = 0; for (i = 0; i < actors.length; i++) if (actors[i].party && !actors[i].ko) live++;
        if (live >= cfg.civilians) { CROWD.free.length = 0; return; }
        if (partyGoer(CROWD.free.shift(), openSpot(player.x, player.z, 26, 42))) CROWD.refills++;
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
        var sp = spec(kind), p = at || (DERBY ? derbySpot(player.x, player.z) : openSpot(player.x, player.z, 26, 42));
        var a = person(kind, sp, Object.assign({ x: p.x, z: p.z, hp: 0 }, extra || {}));
        if (!a) return null;
        var hp = sp.hp + Math.floor((DIR.heat - 1) * (kind === 'boss' ? 2.5 : 0.7)) + (kind === 'boss' ? (DIR.bossN - 1) * 5 : 0);
        a.hp = a.max = hp * (a.car ? ARMOR : 1); a.sp = Object.assign({}, sp, { speed: sp.speed * (1 + Math.min(0.25, (DIR.heat - 1) * 0.03)), windup: sp.windup * Math.max(0.6, 1 - (DIR.heat - 1) * 0.05) });
        a.state = 'chase'; a.yaw = yawTo(a, player.x, player.z); a.boss = kind === 'boss';
        return a;
      }
      function spawnBoss(name) {
        DIR.bossN++;
        var sp = spec('boss'), n = DIR.bossN;
        enqueue('boss', null, null, function (a) {
          // (a story's beat may name the one it sends)
          a.name = name || sp.names[(n - 1) % sp.names.length];
          DIR.boss = a;
          showBanner(a.name, 'is coming for you');
          SFX.level(); CAM.shake = 0.3;
          // his men: up to open.heat.escort of them (3), and with open.heat.room only as many as maxEnemies has room for
          var men = Math.min(cfg.heatEscort, 1 + Math.floor(n / 2)); if (cfg.heatRoom) men = Math.min(men, roomLeft());
          for (var i = 0; i < men; i++) enqueue(DIR.heat >= 4 ? 'biker' : 'thug', openSpot(a.x, a.z, 1.5, 4));
        });
      }
      // how many more of the crew maxEnemies has room for: those standing and those on their way (open.heat.room)
      function roomLeft() { var n = QUEUE.length; for (var i = 0; i < actors.length; i++) { var a = actors[i]; if (a !== player && a.kind !== 'civ' && !a.ko) n++; } return Math.max(0, cfg.maxEnemies - n); }
      function dispatchPolice() {
        var cops = Math.min(4, 2 + Math.floor(DIR.heat / 4));
        // a map that plans the patrol car's way and lends it a vehicle (the city): down the avenue to the player, in
        // the world's own livery (open.patrol: { car, color, lights })
        if (OW.map && OW.map.patrol && OW.map.vehicle) {
          var PO = O.patrol && typeof O.patrol === 'object' ? O.patrol : {}, lc = Array.isArray(PO.lights) && PO.lights.length >= 2 ? [String(PO.lights[0]), String(PO.lights[1])] : ['#FF2020', '#2050FF'];
          var plan = null, veh = null;
          try { plan = OW.map.patrol(player.x, player.z); } catch (e) { plan = null; }
          if (plan) try { veh = OW.map.vehicle(typeof PO.car === 'string' ? PO.car : 'suv', typeof PO.color === 'string' ? PO.color : '#F2F2EE', lc); } catch (e) { veh = null; }
          if (!veh) { for (var j = 0, jn = cfg.heatRoom ? Math.min(2, roomLeft()) : 2; j < jn; j++) enqueue('cop'); return; }
          var vb = new THREE.Group(), vr = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.24), new THREE.MeshBasicMaterial({ color: new THREE.Color(lc[0]).multiplyScalar(6) })), vl = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.24), new THREE.MeshBasicMaterial({ color: new THREE.Color(lc[1]).multiplyScalar(6) }));
          // its body faces +x: the bar lies across it
          vr.position.x = -0.3; vl.position.x = 0.3; vb.add(vr, vl); vb.rotation.y = PI / 2; vb.position.set(0, veh.height + 0.07, 0); veh.object.add(vb);
          scene.add(veh.object);
          var pc = { obj: veh.object, veh: veh, x: plan.from.x, z: plan.from.z, x0: plan.from.x, z0: plan.from.z, dx: plan.dx, dz: plan.dz, s: 0,
            stopS: Math.hypot(plan.to.x - plan.from.x, plan.to.z - plan.from.z), side: plan.side, v: 17, state: 'drive', t: 0, lr: vr, lb: vl, light: null, len: veh.length, cops: cops };
          veh.place(pc.x, pc.z, Math.atan2(-pc.dz, pc.dx)); veh.flash(true);
          DIR.police.push(pc);
          say('Police on the way'); sirenOn(true);
          return;
        }
        if (!OW.map || !OW.map.sedan) { for (var i = 0, pn = cfg.heatRoom ? Math.min(2, roomLeft()) : 2; i < pn; i++) enqueue('cop'); return; }
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
        DIR.police.push({ obj: obj, x: lane, z: z0, x0: lane, z0: z0, dx: 0, dz: dir, s: 0, stopS: (stopZ - z0) * dir, side: { x: 1, z: 0 }, v: 17, state: 'drive', t: 0, lr: lr, lb: lb, light: light, len: car.length, cops: cops });
        say('Police on the way'); sirenOn(true);
      }
      // a patrol car gone: its body, its box, and (the city's) its vehicle and its light on the street
      function dropPatrol(p) {
        if (p.veh) { try { p.veh.remove(); } catch (e) {} } else scene.remove(p.obj);
        if (p.box) { var bi = W.boxes.indexOf(p.box); if (bi >= 0) W.boxes.splice(bi, 1); }
      }
      function stepPolice(dt) {
        var any = false;
        for (var i = DIR.police.length - 1; i >= 0; i--) {
          var p = DIR.police[i]; p.t += dt;
          var on = Math.floor(p.t * 5) % 2;
          p.lr.visible = !!on; p.lb.visible = !on;
          if (p.light) { p.light.color.set(on ? '#FF2020' : '#2050FF'); p.light.intensity = p.state === 'gone' ? 0 : 3; }
          if (p.veh) p.veh.flash(p.state !== 'gone', dt);
          if (p.state === 'drive') {
            any = true;
            // along its way: up Ocean Drive's street, down a city avenue
            var left = p.stopS - p.s;
            p.v = left < 25 ? Math.max(0, left * 0.7) : 17;
            p.s += p.v * dt; p.x = p.x0 + p.dx * p.s; p.z = p.z0 + p.dz * p.s;
            if (left < 0.4) {
              p.state = 'parked'; p.t = 0;
              var hx = Math.abs(p.dx) * p.len / 2 + Math.abs(p.dz), hz = Math.abs(p.dz) * p.len / 2 + Math.abs(p.dx);
              W.boxes.push(p.box = { min: { x: p.x - hx, y: 0, z: p.z - hz }, max: { x: p.x + hx, y: 1.5, z: p.z + hz } }); buildGrid();
              // the officers get out on the player's side
              var ax = p.veh ? p.dx : 0, az = p.veh ? p.dz : 1;
              for (var k = 0, kn = cfg.heatRoom ? Math.min(p.cops, roomLeft()) : p.cops; k < kn; k++) { var so = 2.2 + (k % 2) * 0.8, al = (k - p.cops / 2) * 1.4; enqueue('cop', { x: p.x + p.side.x * so + ax * al, z: p.z + p.side.z * so + az * al }); }
            }
            // anyone in the road is run down
            actors.forEach(function (a) { if (a.ko) return; var rx = a.x - p.x, rz = a.z - p.z; if (Math.abs(rx * p.dz - rz * p.dx) < 1.1 && Math.abs(rx * p.dx + rz * p.dz) < p.len / 2 + 0.3 && p.v > 4) hurt(a, a === player ? 34 : 99, { x: p.x - p.dx * 3, z: p.z - p.dz * 3 }); });
          } else if (p.state === 'parked') {
            if (p.t < 4) any = true;
            if (p.t > 70 && Math.hypot(player.x - p.x, player.z - p.z) > 70) { dropPatrol(p); buildGrid(); DIR.police.splice(i, 1); continue; }
          }
          if (p.veh) p.veh.place(p.x, p.z, Math.atan2(-p.dz, p.dx)); else p.obj.position.set(p.x, groundAt(p.x, p.z), p.z);
          if (p.state === 'drive' && player) sirenLevel(Math.hypot(player.x - p.x, player.z - p.z));
        }
        if (!any) sirenOn(false);
      }

      function heatUp() {
        DIR.heat++; DIR.heatT = 0; ctx.open.heat = DIR.heat;
        // what each level brings, in the world's words (open.heat.say: from heat 2 up)
        var hs = O.heat && Array.isArray(O.heat.say) ? O.heat.say : null, hl = hs && hs.length ? String(hs[Math.min(hs.length - 1, DIR.heat - 2)] || '').slice(0, 60) : '';
        showBanner('Heat ' + DIR.heat, hl || (DIR.heat >= 3 ? 'The police are coming' : DIR.heat === 2 ? 'Bikers ride in' : 'They are coming'));
        SFX.level();
        // (open.heat.bosses: false, the heat sends no boss, a story's beats bring them; open.heat.police: false, no police)
        if (DIR.heat % 3 === 0 && cfg.heatBosses) spawnBoss();
        if (DIR.heat >= 3 && cfg.heatPolice) dispatchPolice();
        emit('heat', { heat: DIR.heat });
      }
      function showBanner(big, small) {
        banner.querySelector('b').textContent = big; banner.querySelector('span').textContent = small || '';
        bannerT = 2.6; banner.style.opacity = '1';
      }
      function stepDirector(dt) {
        if (!player || player.ko) return;
        DIR.heatT += dt;
        // a level by the clock, and by the takedowns (every open.heat.kos of them, 8; 0, by the clock alone), up to
        // open.heat.max if the world sets one
        if (DIR.heatT >= cfg.heatEvery || (cfg.heatKos > 0 && DIR.koHeat >= cfg.heatKos)) { DIR.koHeat = 0; if (cfg.heatMax && DIR.heat >= cfg.heatMax) DIR.heatT = 0; else heatUp(); }
        var enemies = actors.filter(function (a) { return a.kind !== 'civ' && !a.ko && a !== player; }).length;
        // (with open.heat.room, those on their way count too)
        if (cfg.heatRoom) enemies += QUEUE.length;
        var target = Math.min(cfg.maxEnemies, 2 + Math.floor(DIR.heat * 1.6));
        DIR.spawnT -= dt;
        if (enemies < target && DIR.spawnT <= 0) {
          DIR.spawnT = Math.max(1.1, 4.5 - DIR.heat * 0.35);
          var r = Math.random(), kind = DIR.heat >= 2 && r < 0.35 ? 'biker' : DIR.heat >= 4 && r < 0.55 ? 'cop' : 'thug';
          // (a crowd that turns: by its share, one of the party near him comes at him instead, when there is one)
          if (!(CROWD && CROWD.turn && Math.random() < CROWD.turn.share && crowdTurn()) && QUEUE.length < 3) enqueue(kind);
        }
        if (CROWD) stepCrowd(dt);
      }

      /* --------------------------------------------------------- pilot -- */
      // the runtime's own player, for the attract demo, the films and the checks:
      // it walks the street, goes for the nearest one, punches, jumps clear when hurt
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
            if (player.hp < player.max * 0.25 && PL.air <= 0 && Math.random() < 0.02) { jump(); return { x: -dx / n, z: -dz / n, len: 1 }; }
            // half the blows it sees coming, it dodges (and counters, once the blow it dodged has passed), if the hero can
            if (PL.dodge && PL.dodge.of && !PL.dodge.of.struck && !PL.dodge.of.ko) return { x: 0, z: 0, len: 0 };
            var tw = threat(), twr = tw ? tw.hitT - DIR.time : 9;
            if (cfg.dodge && tw && twr > 0 && twr < 0.26 && !PL.dodge && !tw.pilotSaw) { tw.pilotSaw = true; if (Math.random() < 0.5) { dodge(); return { x: 0, z: 0, len: 0 }; } }
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
        if (DERBY) { derbyActors(dt); return; }
        tokens = actors.filter(function (a) { return a.token && !a.ko; }).length;
        for (var i = 0; i < actors.length; i++) {
          var a = actors[i];
          if (a === player) continue;
          if (a.ko) {
            a.koT += dt; a.speed = 0;
            // flying from a weapon: up and down again, and down goes anyone in the way
            if (a.vy != null) {
              a.lift += a.vy * dt; a.vy -= 22 * dt; a.flown += Math.hypot(a.kx, a.kz) * dt;
              if (a.lift <= 0) { a.lift = 0; a.vy = null; CAM.shake = Math.max(CAM.shake, 0.22); thud(1.5); }
            }
            if (a.bowl && Math.hypot(a.kx, a.kz) > 2.5) for (var bi = 0; bi < actors.length; bi++) {
              var bb = actors[bi];
              if (bb === a || bb === player || bb.ko || bb.kind === 'civ' || a.bowl[bb.id] || bb.fade < 1) continue;
              if (dist(a, bb) < a.r + bb.r + 0.3) { a.bowl[bb.id] = 1; OW.bowled = (OW.bowled || 0) + 1; hurt(bb, 3, a); }
            }
            if (a.koT > 7) { a.fade -= dt * 0.8; if (a.fade <= 0) { removeActor(a); i--; continue; } }
            continue;
          }
          if (a.air) { stepFoeAir(a, dt); continue; }
          // down from the pound: he lies there, then gets up
          if (a.downT > 0) { a.downT -= dt; a.speed = 0; if (a.downT <= 0) play(a, 'getup', 1.1); continue; }
          if (a.scripted) continue;
          if (a.kind === 'civ') { if (a.party) stepParty(a, dt); else stepCivilian(a, dt); } else stepEnemy(a, dt);
        }
        // nobody stands inside anybody
        for (i = 0; i < actors.length; i++) for (var j = i + 1; j < actors.length; j++) {
          var p = actors[i], q = actors[j]; if (p.ko || q.ko) continue;
          if ((climbOn() || p.air || q.air || PL.hang && (p === player || q === player)) && Math.abs(p.y - q.y) > 1.2) continue;
          var dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz), m = p.r + q.r + (p === player || q === player ? 0.15 : 0.25);
          // (open.impact: the hero and the man his blow lands on stand as close as it needs, a moment: impStep)
          if (PL.impSep && (p === player && q === PL.impSep.a || q === player && p === PL.impSep.a)) { if (DIR.time < PL.impSep.until) m = Math.min(m, IMPACT.sep); else PL.impSep = null; }
          if (d < m && d > 1e-4) { var push = (m - d) * 0.5; dx /= d; dz /= d; if (p !== player) { p.x -= dx * push; p.z -= dz * push; } else { q.x += dx * push; q.z += dz * push; } if (q !== player) { q.x += dx * push; q.z += dz * push; } else { p.x -= dx * push; p.z -= dz * push; } }
        }
        void sep;
        for (i = 0; i < actors.length; i++) {
          var b = actors[i], tv = b === player && travOn();
          // a blow's momentum, sliding out
          if (!tv && (b.kx || b.kz)) { var kf = Math.exp(-6 * dt); b.x += b.kx * dt; b.z += b.kz * dt; b.kx *= kf; b.kz *= kf; if (Math.abs(b.kx) + Math.abs(b.kz) < 0.02) b.kx = b.kz = 0; }
          if (!tv && (b === player || !b.ko || b.lift > 0 || Math.abs(b.kx) + Math.abs(b.kz) > 1)) collide(b);
          b.wet = waterAt(b.x, b.z);
          if (b.wet > 0.015) splashes(b, dt);
          if (FOOT) stepFeet(b, dt);
          // the traversal has put the hero where he is and turned him (trav.js)
          if (!tv) {
            b.y = b === player && climbOn() ? TRV.y : b !== player && (b.ko || b.air) && b.lift > 0 ? (climbOn() && b.liftBase != null ? b.liftBase : groundAt(b.x, b.z)) + b.lift : climbOn() ? foeY(b, dt) : b === player && PL.air > 0 ? groundAt(b.x, b.z) + PL.air : damp(b.y, groundAt(b.x, b.z), 16, dt);
            b.g.position.set(b.x, b.y, b.z); b.g.rotation.y = b.yaw;
            // (open.impact: the man a blow landed on shudders in its stop)
            if (b.snap && b.snap.t < 0.3 && impFreeze()) { var jj = (frames % 2 ? 1 : -1) * 0.011 * Math.min(2, b.snap.pw); b.g.position.x += b.snap.bx * jj; b.g.position.z += b.snap.bz * jj; }
          }
          var far = Math.hypot(b.x - camera.position.x, b.z - camera.position.z);
          b.g.visible = far < 140 && b.fade > 0.02;
          if (!b.g.visible) continue;
          // (on his own materials: a weapon's are every weapon of its kind's, and a fading man's baton faded every baton in
          // the world, the ones in other hands and on the ground, to nothing; a car's are copied the same way, derby.js)
          if (b.fade < 1) b.g.traverse(function (m) { if (m.isMesh && m.material && !Array.isArray(m.material)) { if (!m.material.userData.gmFade) { var m0 = m.material; m.material = m0.clone(); if (m0.onBeforeCompile && m.material.onBeforeCompile !== m0.onBeforeCompile) { m.material.onBeforeCompile = m0.onBeforeCompile; m.material.customProgramCacheKey = m0.customProgramCacheKey; } m.material.userData.gmFade = true; m.material.userData.gmOwned = true; m.material.transparent = true; } m.material.opacity = b.fade; } });
          var shadowOn = far < 34;
          if (b.shadowOn !== shadowOn) { b.shadowOn = shadowOn; b.g.traverse(function (m) { if (m.isMesh) m.castShadow = shadowOn; }); }
          // (open.lod: the face's small parts left out past cfg.lod metres, as far as the lens makes it: a scene's long lens
          // sees them from further off; a little nearer to come back than to go, so nobody flickers at the line)
          if (cfg.lod && b !== player && b.e.detail) { var lk = far * Math.tan(camera.fov * PI / 360) / 0.5206; b.faceFar = !b.e.detail(lk < cfg.lod * (b.faceFar ? 0.9 : 1)); }
          // far away, half the animation
          if (far > 55 && (frames + b.id) % 2) continue;
          if (b.busy > 0) { b.busy -= dt; if (b.busy <= 0) b.act = null; }
          if (tv) continue;   // and animates him
          var rel = b.speed > 0.25 ? b.mdir - b.yaw : 0, adt = far > 55 ? dt * 2 : dt;
          // one of a crowd, standing at their spot, moves at a pace of their own (so a dance floor is never in step)
          if (b.party && !b.ko && b.speed < 0.3) adt *= b.party.rate;
          // a man the punch finisher drops (open.kicks: false) falls faster, for as long as the finisher is his
          if (b.finFall && !(PL.fin && PL.fin.a === b)) b.finFall = 0;
          if (b.finFall) adt *= b.finFall;
          if (b.iq) impUndo(b);
          try { b.e.animate(t, adt, { speed: b.speed, brawl: { stance: b.stance, action: b.act, ko: b.ko || b.downT > 0, dir: rel, gait: b.gait }, air: b === player && PL.air > 0.05 ? 1 : 0, airPose: b === player && PL.hang ? 'ffAirHold' : null }); } catch (e) { fail('A person in the open world could not move: ' + (e && e.message || e)); b.e.animate = function () {}; }
          // (open.impact: the man's snap from a blow, and the hero's lean into his, over what the body plays)
          if (b.snap || b === player && (PL.imp || PL.lean)) impPose(b, dt);
        }
      }
      function openTick(dt) {
        var slow = state === 'crashed' ? 0.3 : 1;
        if (hitstop > 0) { hitstop -= dt; slow *= 0.15; }
        // (open.impact: a blow's stop, held still and then eased out: impLand)
        IMPS.rdt = dt;
        if (impFreeze() && state !== 'paused') {
          IMPS.t += dt; var isl = 0.03 + 0.97 * (IMPS.t <= IMPS.hold ? 0 : smooth(0, IMPS.ease, IMPS.t - IMPS.hold)); slow *= isl;
          // (for the checks: how much game time passed in how much real time, and the frames held still)
          if (IMP.last && IMPS.t <= IMPS.hold + IMPS.ease) { var Fz = IMP.last.froze = IMP.last.froze || { real: 0, game: 0, held: 0 }; Fz.real += dt; Fz.game += dt * isl; if (isl <= 0.05) Fz.held++; }
        }
        // a perfect dodge's (and the warning's lesson's) slow motion, easing back over its last 0.35 s
        if (PL.slowT > 0) { if (state !== 'paused') PL.slowT -= dt; slow *= 1 - (1 - PL.slowK) * clamp(PL.slowT / 0.35, 0, 1); }
        stepWarnings(); stepHold();
        var sdt = state === 'paused' ? 0 : dt * slow;
        t += sdt;
        // out of a run (knocked out, the results, a new run): the hero is the open world's again
        if (travLive && ((state !== 'race' && state !== 'paused') || !player || player.ko)) travStop();
        if (state === 'race') {
          DIR.time += sdt; raceTime = DIR.time;
          stepPlayer(sdt);
          stepDirector(sdt);
          stepQueue(sdt);
          stepPolice(sdt);
          if (STORY) stepStory(sdt);
          if (demo && DIR.time > 75) startDemo();
        } else if (state === 'crashed') {
          crashT += dt;
          if (crashT > 2.6) showResults();
        } else if (state === 'results') {
          resultsT += dt; if (resultsT > 14) startDemo();
        } else if (state === 'title') {
          stepPolice(sdt);
        } else if (state === 'intro' && IX) {
          stepIntro(sdt);
        }
        if (state !== 'paused') { stepActors(sdt); stepShots(sdt); stepCoins(sdt); stepPicks(sdt); stepSpray(sdt); }
        if (SPK && state !== 'paused') stepSparks(sdt);
        if (IFX && state !== 'paused') impFxStep(dt, sdt + (impFreeze() ? dt * 0.25 : 0));
        if (SHD && state !== 'paused') stepShards(sdt);
        if (bannerT > 0) { bannerT -= dt; banner.style.opacity = String(clamp(bannerT, 0, 1)); }
        if (feedT > 0) { feedT -= dt; feed.style.opacity = String(clamp(feedT * 2, 0, 1)); }
        if (OW.map && OW.map.yieldTo && frames % 3 === 0) {
          var inRoad = []; for (var yi = 0; yi < actors.length; yi++) { var ya = actors[yi]; if (!ya.ko && ya.g.visible) inRoad.push({ x: ya.x, z: ya.z }); }
          try { OW.map.yieldTo(inRoad); } catch (e) {}
        }
        // the street sees the player (the traversal says so itself while it runs: trav.js)
        if (OW.map && OW.map.setPlayer && player && !travOn()) {
          var fdt = Math.max(1e-3, sdt || dt);
          V3B.set((player.x - mapFeed.x) / fdt, (player.y - mapFeed.y) / fdt, (player.z - mapFeed.z) / fdt); if (V3B.lengthSq() > 900) V3B.set(0, 0, 0);
          mapFeed.set(player.x, player.y, player.z);
          try { OW.map.setPlayer(mapFeed, V3B); } catch (e) {}
        }
        if (OW.map) { try { OW.map.update(sdt || dt * 0.2, camera); } catch (e) { fail('The map could not update: ' + (e && e.message || e)); OW.map.update = function () {}; } }
        if (typeof def.update === 'function') try { def.update(ctx, t, sdt); } catch (e) { fail('update() threw: ' + (e && e.message || e)); def.update = null; }
        stepParticles(sdt || dt * 0.25);
        stepWater(t);
        if (VK) VK.step(sdt || dt * 0.25);
        stepBig(dt); stepDuel(dt);
        if (state !== 'intro' && !travOn()) stepCam(dt);
        stepHud(); if (STORY) storyHud(); if (frames % 2 === 0) stepRadar();
      }

      /* ------------------------------------------------------- the intro -- */
      // An opening scene (the owner, 28 Sep: "an opening cinema scene introducing
      // the OG and his mission"): the world scripts the shots (a camera move, who
      // is where and what they do, a line of text) and the runtime plays them
      // letterboxed before the first run of a visit, skippable. Who is told to
      // `stay` is still standing there when the run begins, and comes for you.
      //   intro: { shots: [{ t: 5, fade: 'in', cam: { from: [x,y,z], to: [x,y,z], look: [x,y,z] | 'og', lookTo, fov, fovTo },
      //     cast: [{ id: 'og' | name, kind: 'thug', at: [x,z], to: [x,z], speed, face: deg | 'og' | 'cam' | [x,z],
      //              stance, gait, act: [['shrug', 1.2]], stay: true }],
      //     place: 'SOUTH BEACH', time: '6:12 AM', say: 'a line', title: 'MIAMI OG', tagline: 'the mission' }] }
      var INTRO = O.intro && Array.isArray(O.intro.shots) && O.intro.shots.length ? O.intro : null;
      var IX = null, introSeen = false;
      var ixCss = document.createElement('style');
      ixCss.textContent = [
        '#gm .owi{position:absolute;inset:0;display:none;pointer-events:none;z-index:40}',
        // (a scene, the intro's, the outro's or a beat's: the touch pad and its stick are put away. Nothing on them does
        // anything in a scene, every button asks for a run and the hero is the scene's, and they stood over the subtitles)
        '#gm.owscene .tpad,#gm.owscene .stick{visibility:hidden}',
        '#gm .owi .bar{position:absolute;left:0;right:0;height:11vh;background:#000}',
        '#gm .owi .bar.t{top:0}#gm .owi .bar.b{bottom:0}',
        '#gm .owi .fade{position:absolute;inset:0;background:#000;opacity:0}',
        '#gm .owi .loc{position:absolute;left:calc(6vw + env(safe-area-inset-left,0px));bottom:calc(11vh + 5vh);opacity:0;text-shadow:0 2px 12px rgba(0,0,0,.6)}',
        '#gm .owi .loc b{display:block;font-size:clamp(20px,3.2vw,40px);letter-spacing:.3em;font-weight:700}',
        '#gm .owi .loc span{display:block;margin-top:6px;font-size:clamp(12px,1.4vw,17px);letter-spacing:.34em;opacity:.8}',
        '#gm .owi .say{position:absolute;left:50%;bottom:calc(11vh + 3vh);transform:translateX(-50%);width:min(900px,86vw);text-align:center;font-size:clamp(15px,1.9vw,24px);line-height:1.35;opacity:0;text-shadow:0 2px 10px rgba(0,0,0,.85),0 0 2px #000}',
        '#gm .owi .ttl{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;opacity:0}',
        '#gm .owi .ttl b{font-size:clamp(46px,10vw,132px);letter-spacing:.08em;font-weight:800;line-height:.95;color:#fff;text-shadow:0 0 30px ' + acc(0.75) + ',0 6px 30px rgba(0,0,0,.6)}',
        '#gm .owi .ttl span{margin-top:18px;max-width:min(760px,84vw);font-size:clamp(14px,1.8vw,21px);letter-spacing:.06em;line-height:1.45;text-shadow:0 2px 10px rgba(0,0,0,.8)}',
        '#gm .owi .skip{position:absolute;right:calc(3vw + env(safe-area-inset-right,0px));bottom:calc(11vh + 2vh);pointer-events:auto;' + GLASS + ';border-radius:999px;color:#fff;font:600 13px Oxanium,system-ui;letter-spacing:.14em;padding:9px 16px;text-transform:uppercase;cursor:pointer}',
      ].join('\n');
      document.head.appendChild(ixCss);
      var ixEl = el('div', 'owi', '<i class="bar t"></i><i class="bar b"></i><div class="loc"><b></b><span></span></div><div class="say"></div><div class="ttl"><b></b><span></span></div><div class="fade"></div><button class="skip">Skip &rsaquo;</button>');
      var ixQ = function (c) { return ixEl.querySelector(c); };
      ixQ('.skip').addEventListener('pointerdown', function (e) { e.preventDefault(); e.stopPropagation(); if (IX && !(IX.hold > performance.now())) endIntro(); });
      function v3(a, d) { return Array.isArray(a) && a.length >= 3 ? new THREE.Vector3(+a[0] || 0, +a[1] || 0, +a[2] || 0) : d; }
      // a mark: [x, z], or [x, z, y] for a level above the street (a roof, with the traversal's levels on)
      function ixAt(p) { return Array.isArray(p) && p.length >= 2 ? { x: +p[0] || 0, z: +p[1] || 0, y: p.length >= 3 && isFinite(+p[2]) ? +p[2] : null } : null; }
      function ixY(p) { return p.y != null && climbOn() ? floorAt(p.x, p.z, p.y) : groundAt(p.x, p.z); }
      // stand someone at a height: the levels keep their own (the hero's TRV.y, a foe's fy)
      function ixStand(a, y) {
        a.y = y;
        if (!climbOn()) return;
        if (a === player) { TRV.mode = 'ground'; TRV.vx = TRV.vy = TRV.vz = 0; TRV.wall = null; TRV.y = y; PL.air = 0; }
        else { a.fy = y; a.fall = null; a.fvy = 0; a.wall = null; }
      }
      function playIntro(done) {
        introSeen = true;
        hideScreen(); openReset();
        playScene(INTRO, done);
      }
      // a scene over the street as it is: the street's own people stay; nobody comes
      // for him but whom the scene brings
      function playScene(script, done) {
        QUEUE.length = 0;
        actors.slice().forEach(function (a) { if (a !== player && a.kind !== 'civ') removeActor(a); });
        DIR.police.forEach(dropPatrol);
        DIR.police = []; buildGrid(); sirenOn(false); coins.forEach(function (q) { q.on = false; });
        player.kx = player.kz = 0; player.act = null; player.busy = 0; PL.punching = 0; PL.air = 0; PL.vy = 0;
        bannerT = 0; banner.style.opacity = '0'; feedT = 0; feed.style.opacity = '0'; hudPick.style.display = 'none';
        IX = { i: -1, t: 0, shots: script.shots.slice(0, 24), cast: {}, stay: [], done: done };
        state = 'intro'; showHud(false); ixEl.style.display = 'block'; root.classList.add('owscene');
        emit('intro', {});
      }
      function ixActor(d) {
        if (d.id === 'og' || d.id === 'player') return player;
        var a = IX.cast[d.id];
        if (!a && d.kind) {
          var p = ixAt(d.at) || { x: player.x + 4, z: player.z + 4 };
          var lk = d.look && typeof d.look === 'object' ? d.look : null;
          a = person(d.kind === 'civ' ? 'civ' : d.kind, lk ? { look: function () { return lk; }, names: [d.name || ''], weapon: lk.weapon || null, body: typeof lk.body === 'string' ? lk.body : null } : d.kind === 'civ' ? null : spec(d.kind), { x: p.x, z: p.z });
          if (!a) return null;
          a.scripted = true; a.hp = a.max = 3; IX.cast[d.id] = a; a.ixKind = d.kind;
          if (d.name) a.name = String(d.name).slice(0, 30);
        }
        return a || null;
      }
      function enterShot(sh) {
        (Array.isArray(sh.cast) ? sh.cast : []).forEach(function (d) {
          var a = ixActor(d); if (!a) return;
          var p = ixAt(d.at); if (p) { a.x = p.x; a.z = p.z; ixStand(a, ixY(p)); a.kx = a.kz = 0; }
          a.ixPath = Array.isArray(d.path) ? d.path.map(ixAt).filter(Boolean) : null;
          a.ixTo = a.ixPath && a.ixPath.length ? a.ixPath.shift() : ixAt(d.to); a.ixSpeed = clamp(+d.speed || 1.3, 0.3, a.car ? 30 : 7); a.ixFace = d.face; a.ixActs = Array.isArray(d.act) ? d.act.map(function (q) { return [String(q[0]), +q[1] || 0, +q[2] || 1, false]; }) : [];
          if (typeof d.stance === 'string') a.stance = d.stance; if (typeof d.gait === 'string') a.gait = d.gait;
          if (d.face != null && !a.ixTo) a.yaw = ixYaw(a, d.face, a.yaw);
          if (d.stay) a.ixStay = true;
          if (d.ghost) a.ghost = true;
        });
        // the map's own people (the city's crowd) keep out of a scene played on the street: round its cast and a
        // camera down at their level
        if (OW.map && OW.map.stage) {
          var pts = [];
          (Array.isArray(sh.cast) ? sh.cast : []).forEach(function (d) { var a = d.id === 'og' || d.id === 'player' ? player : IX.cast[d.id]; if (a && a.y < 6) { pts.push([a.x, a.z]); var t = a.ixTo; if (t) pts.push([t.x, t.z]); } });
          var cm = sh.cam || {}; [cm.from, cm.to].forEach(function (c) { if (Array.isArray(c) && c.length >= 3 && +c[1] < 6) pts.push([+c[0] || 0, +c[2] || 0]); });
          if (pts.length) {
            var x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; pts.forEach(function (q) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]); });
            try { OW.map.stage((x0 + x1) / 2, (z0 + z1) / 2, Math.min(25, Math.hypot(x1 - x0, z1 - z0) / 2 + 4)); } catch (e) {}
          } else try { OW.map.stage(null); } catch (e) {}
        }
        // the words
        var loc = ixQ('.loc'), say = ixQ('.say'), ttl = ixQ('.ttl');
        loc.querySelector('b').textContent = sh.place ? String(sh.place).slice(0, 60) : ''; loc.querySelector('span').textContent = sh.time ? String(sh.time).slice(0, 60) : '';
        say.textContent = sh.say ? String(sh.say).slice(0, 220) : '';
        ttl.querySelector('b').textContent = sh.title ? String(sh.title).slice(0, 40) : ''; ttl.querySelector('span').textContent = sh.tagline ? String(sh.tagline).slice(0, 240) : '';
        if (sh.title && audio) SFX.level();
        // through a machine's eyes, for this shot only
        if (sh.vision || VIS) visionShot(sh);
      }
      function ixYaw(a, f, cur) {
        if (typeof f === 'number') return f * PI / 180;
        if (f === 'og' && a !== player) return yawTo(a, player.x, player.z);
        if (f === 'cam') return yawTo(a, camera.position.x, camera.position.z);
        if (Array.isArray(f)) return yawTo(a, +f[0] || 0, +f[1] || 0);
        if (typeof f === 'string' && IX.cast[f]) return yawTo(a, IX.cast[f].x, IX.cast[f].z);
        return cur;
      }
      var ixLook = new THREE.Vector3(), ixA = new THREE.Vector3(), ixB = new THREE.Vector3();
      function ixPoint(v, out) {
        if (v === 'og' || v === 'player') return out.set(player.x, player.y + 1.55, player.z);
        if (typeof v === 'string' && IX.cast[v]) { var a = IX.cast[v]; return out.set(a.x, a.y + 1.5, a.z); }
        var p = v3(v, null); return p ? out.copy(p) : out.set(player.x, player.y + 1.4, player.z);
      }
      function stepIntro(dt) {
        var sh = IX.shots[IX.i];
        if (!sh || IX.t >= (+sh.t || 4)) {
          IX.i++; IX.t = 0; sh = IX.shots[IX.i];
          if (!sh) { endIntro(); return; }
          enterShot(sh);
        }
        IX.t += dt;
        var T = clamp(+sh.t || 4, 0.5, 20), u = clamp(IX.t / T, 0, 1), e = u * u * (3 - 2 * u);
        // who moves, where they look, what they do
        (Array.isArray(sh.cast) ? sh.cast : []).forEach(function (d) {
          var a = d.id === 'og' || d.id === 'player' ? player : IX.cast[d.id]; if (!a) return;
          var want = 0;
          if (a.ixTo) {
            var dx = a.ixTo.x - a.x, dz = a.ixTo.z - a.z, m = Math.hypot(dx, dz);
            // a path is walked point by point, without stopping at the corners
            if (m < 0.45 && a.ixPath && a.ixPath.length) { a.ixTo = a.ixPath.shift(); dx = a.ixTo.x - a.x; dz = a.ixTo.z - a.z; m = Math.hypot(dx, dz); }
            if (m > 0.15) { want = Math.min(a.ixSpeed, m * 2 + (a.ixPath && a.ixPath.length ? a.ixSpeed : 0)); a.mdir = Math.atan2(dx, dz); a.x += dx / m * a.speed * dt; a.z += dz / m * a.speed * dt; }
          }
          a.speed = damp(a.speed, want, 6, dt);
          var fy = a.ixFace != null && (!a.ixTo || a.speed < 0.3) ? ixYaw(a, a.ixFace, a.yaw) : a.speed > 0.2 ? a.mdir : a.yaw;
          face(a, fy, 1 - Math.exp(-5 * dt));
          (a.ixActs || []).forEach(function (q) {
            if (q[3] || IX.t < q[1]) return;
            q[3] = true;
            // 'heal': the sickness drains out of him over q[2] seconds, in a warm light
            if (q[0] === 'heal') { a.heal = { t: 0, d: clamp(q[2], 0.5, 8), k0: a.e.sick ? a.e.sick() : 0 }; return; }
            play(a, q[0], q[2]);
          });
          if (a.heal) stepHeal(a, dt);
        });
        // the camera
        var c = sh.cam || {};
        ixA.copy(v3(c.from, camera.position)); ixB.copy(v3(c.to, ixA));
        camera.position.lerpVectors(ixA, ixB, e);
        ixPoint(c.look, ixA); if (c.lookTo != null) { ixPoint(c.lookTo, ixB); ixA.lerp(ixB, e); }
        ixLook.lerp(ixA, IX.t < dt * 1.5 ? 1 : 1 - Math.exp(-8 * dt));
        camera.lookAt(ixLook);
        var fov = clamp(+c.fov || 45, 15, 80), fov2 = c.fovTo != null ? clamp(+c.fovTo, 15, 80) : fov, fv = fov + (fov2 - fov) * e;
        if (Math.abs(camera.fov - fv) > 0.01) { camera.fov = fv; camera.updateProjectionMatrix(); }
        // the words come and go; a fade from black or to it
        var inK = smooth(0.25, 0.9, IX.t), outK = 1 - smooth(T - 0.7, T - 0.1, IX.t);
        ixQ('.loc').style.opacity = sh.place ? String(Math.min(inK, outK)) : '0';
        ixQ('.say').style.opacity = sh.say ? String(Math.min(smooth(0.15, 0.6, IX.t), outK)) : '0';
        ixQ('.ttl').style.opacity = sh.title ? String(Math.min(smooth(0.2, 1.2, IX.t), 1 - smooth(T - 0.9, T - 0.2, IX.t))) : '0';
        var fd = 0; if (sh.fade === 'in' || sh.fade === 'both') fd = Math.max(fd, 1 - smooth(0, 1.1, IX.t)); if (sh.fade === 'out' || sh.fade === 'both') fd = Math.max(fd, smooth(T - 0.9, T, IX.t));
        ixQ('.fade').style.opacity = String(fd);
        if (VIS && VIS.on) stepVision(dt);
      }
      var healLight = null;
      function stepHeal(a, dt) {
        var h = a.heal; h.t += dt;
        var u = clamp(h.t / h.d, 0, 1), glow = Math.sin(Math.min(1, h.t / (h.d * 1.2)) * PI);
        if (a.e.sick) a.e.sick(h.k0 * (1 - u * u * (3 - 2 * u)));
        if (!healLight) { healLight = new THREE.PointLight('#FFD89A', 0, 6, 2); scene.add(healLight); }
        healLight.position.set(a.x, a.y + 1.3, a.z); healLight.intensity = glow * 16;
        // sparks rising round him, and a warmth on his skin
        spray.material.color.set('#FFE2A0'); spray.material.size = 0.11;
        for (var i = 0; i < Math.round(glow * 7); i++) {
          var j = spNext++ % SPN, an = Math.random() * TAU, r = 0.25 + Math.random() * 0.25;
          spPos[j * 3] = a.x + Math.sin(an) * r; spPos[j * 3 + 1] = a.y + 0.2 + Math.random() * 1.4; spPos[j * 3 + 2] = a.z + Math.cos(an) * r;
          spVel[j * 3] = Math.sin(an) * 0.2; spVel[j * 3 + 1] = 11 + Math.random() * 2; spVel[j * 3 + 2] = Math.cos(an) * 0.2; spLife[j] = 0.5 + Math.random() * 0.4;
        }
        if (u >= 1 && h.t > h.d * 1.2) { a.heal = null; healLight.intensity = 0; spray.material.color.set('#EEF6FA'); spray.material.size = 0.075; }
      }
      function endIntro() {
        if (!IX) return;
        var stay = [], done = IX.done, finished = IX.i >= IX.shots.length;
        // where the script leaves each of them: the last mark it gives (for a skip, as if it had played out)
        var last = {}, kinds = {};
        IX.shots.forEach(function (sh) { (Array.isArray(sh.cast) ? sh.cast : []).forEach(function (d) {
          var L = last[d.id] || (last[d.id] = {}); if (d.kind) kinds[d.id] = d.kind; if (d.stay) L.stay = true;
          var pt = Array.isArray(d.path) && d.path.length ? ixAt(d.path[d.path.length - 1]) : ixAt(d.to) || ixAt(d.at); if (pt) L.p = pt;
          if (d.name) L.name = d.name;
        }); });
        for (var id in last) {
          if (id === 'og' || id === 'player' || !last[id].stay || !kinds[id]) continue;
          var a = IX.cast[id], p = finished && a ? { x: a.x, z: a.z, y: a.y } : last[id].p && { x: last[id].p.x, z: last[id].p.z, y: ixY(last[id].p) };
          if (p && !(a && a.ko)) stay.push({ kind: kinds[id], x: p.x, z: p.z, y: p.y, name: a ? a.name : last[id].name });
        }
        for (var cid in IX.cast) removeActor(IX.cast[cid]);
        // the run begins where the scene leaves him, facing whoever stays
        var og = last.og || last.player, at = finished || !og || !og.p ? { x: player.x, z: player.z, y: player.y } : { x: og.p.x, z: og.p.z, y: ixY(og.p) };
        var yaw = stay.length ? Math.atan2(stay[0].x - at.x, stay[0].z - at.z) : player.yaw;
        stay.at = { x: at.x, z: at.z, y: at.y, yaw: yaw };
        IX = null; ixEl.style.display = 'none'; ixQ('.fade').style.opacity = '0'; root.classList.remove('owscene');
        if (VIS) visionOff();
        if (OW.map && OW.map.stage) try { OW.map.stage(null); } catch (e) {}
        if (healLight) healLight.intensity = 0; spray.material.color.set('#EEF6FA'); spray.material.size = 0.075;
        actors.forEach(function (x) { x.heal = null; });
        player.ixTo = null; player.ixFace = null; player.ixActs = null;
        done(stay);
      }

      /* ------------------------------------------------------- the story -- */
      // A story told as the GM comes in (open.story; AI Alps, the owner 4 Oct: "with a Cut scene explaining the next
      // level mission every 1500 GM", and the choice "One party, rising stakes: all the action stays at the DJ party;
      // each cut scene gives a new mission line and tougher people"). Once a beat's GM is in, its scene plays (the
      // intro's shots, skipped the same way) as soon as no blow, finisher or dash is in the air, and the run goes on
      // where it was: the GM, the heat, the knockouts, the time and his health are still his. The scene clears the
      // fight it cut away from, as any scene does; whoever it marks `stay` is there when the run goes on, the heat is at
      // least the beat's, and a boss may be on his way. Never while the autopilot drives, in a film or in a playtest
      // that has taken the controls (its boss is still to come), unless a check asks for one (debug.open().beat).
      var STORY = cfg.story ? { beats: cfg.story.beats, next: 0, crossed: 0, chapter: 1, objective: cfg.story.objective, bossT: 0, bossName: null, shown: null, shownText: '', grace: 0.7, waitT: 0, held: null, waited: 0 } : null;
      var hudObj = null;
      if (STORY) {
        // the mission in a line of the HUD's glass under the GM board (on a phone's portrait, beside the radar, the
        // boss's bar a row lower to make room)
        var stCss = document.createElement('style');
        stCss.textContent = [
          '#gm .owo{position:absolute;top:calc(' + TOP + ' + 70px);right:calc(14px + env(safe-area-inset-right,0px));max-width:min(340px,calc(50vw - 230px));' + GLASS + ';border-radius:12px;padding:7px 13px 8px;font-size:13px;line-height:1.35;letter-spacing:.03em;text-align:right}',
          '#gm .owo::before{content:"";position:absolute;right:16px;top:-1px;width:22px;height:2px;border-radius:2px;background:' + T.accent + ';box-shadow:0 0 10px ' + acc(0.9) + '}',
          '#gm .owo small{font-size:10px;font-weight:500;letter-spacing:.26em;text-transform:uppercase;opacity:.64;margin-right:8px}',
          // a new mission flares once in the world's colour
          '#gm .owo.new{animation:gmObjNew 1.8s ease-out}',
          '@keyframes gmObjNew{0%{box-shadow:0 0 0 1px ' + acc(0.95) + ',0 0 28px ' + acc(0.75) + '}100%{box-shadow:inset 0 1px 0 rgba(255,255,255,.24),0 12px 32px rgba(0,0,0,.2)}}',
          '#gm.demo .owo{display:none!important}',
          '@media (max-width:600px){#gm.touch .owo{top:calc(' + TOP + ' + 126px);left:calc(140px + env(safe-area-inset-left,0px));max-width:none;font-size:12px;padding:5px 10px 6px;text-align:left}#gm.touch .boss{top:calc(' + TOP + ' + 172px)}}',
          // (a touch screen wider than a phone's portrait, a phone held sideways or a tablet: under the GM board it would sit
          // on the pause button, and on a phone run into the boss's bar, so it is centred under the bar instead, clear of
          // the pad and the radar)
          '@media (pointer:coarse) and (min-width:601px){#gm .owo{top:calc(' + TOP + ' + 124px);right:auto;left:50%;transform:translateX(-50%);max-width:min(400px,56vw);font-size:12px;padding:5px 11px 6px;text-align:center}#gm .owo::before{right:auto;left:50%;margin-left:-11px}}',
          // a beat's scene (it breaks into a fight): the touch pad put away, and Skip at the top right, not where PUNCH was
          '#gm.owbeat .tpad,#gm.owbeat .stick{visibility:hidden}',
          '#gm.owbeat .owi .skip{top:calc(11vh + 2vh);bottom:auto}',
        ].join('\n');
        document.head.appendChild(stCss);
        hudObj = el('div', 'owo', '<small>Objective</small><span></span>'); hudObj.style.display = 'none';
      }
      function storyReset() {
        STORY.next = 0; STORY.crossed = 0; STORY.chapter = 1; STORY.objective = cfg.story.objective; STORY.bossT = 0; STORY.bossName = null; STORY.shown = null; STORY.waitT = 0;
        if (STORY.held) { removeActor(STORY.held); STORY.held = null; }
        root.classList.remove('owbeat');
      }
      function stepStory(dt) {
        // the boss a beat sent, once its banner has been read
        if (STORY.bossT > 0 && (STORY.bossT -= dt) <= 0) spawnBoss(STORY.bossName);
        if (!(STORY.next < STORY.crossed)) { STORY.waitT = 0; return; }
        // (the drivers themselves are asked, as a new run counts a run only invincible as unassisted for the board)
        if (!(state === 'race' && !IX && !demo && !assisted && !autopilot && !invincible && !film && timeScale === 1 && player && !player.ko && !PL.fin && !PL.dash && !PL.hang)) return;
        // A boss on him or on his way (the heat's or a beat's): the beat waits for him to go down, but only so long
        // (story.wait, 20 s of the fight). (It waited for good before: a boss nobody could put down held the story back
        // for the rest of the run; a chapter never played from 7,656 GM to the end.) What becomes of him is playBeat's
        var on = DIR.boss && !DIR.boss.ko && actors.indexOf(DIR.boss) >= 0, coming = STORY.bossT > 0 || QUEUE.some(function (q) { return q.kind === 'boss'; });
        if (on || coming) {
          STORY.waitT += dt;
          if (STORY.waitT < cfg.story.wait) return;
          STORY.waited++;
        }
        STORY.waitT = 0;
        playBeat();
      }
      // a beat that sends a boss of its own: it names one, or its heat passes a third level that sends the heat's
      function beatBrings(b) { return !!b.boss || (cfg.heatBosses && b.heat > DIR.heat && Math.floor(b.heat / 3) > Math.floor(DIR.heat / 3)); }
      function playBeat() {
        var i = STORY.next, b = STORY.beats[i]; if (!b) return false;
        STORY.next = i + 1;
        if (b.shots.length) {
          // the GM still on the street is his: banked before the scene clears the street (and if it reaches the goal,
          // the goal's scene plays instead)
          var bank = 0; coins.forEach(function (q) { if (q.on) { bank += q.v || 1; q.on = false; } });
          if (bank) { earnGm(bank); if (state !== 'race') return false; }
          // nothing of the fight carries into the scene or out of it: no slow motion (it would slow the scene), no
          // finisher's camera, nobody in the air, no boss's bar for a boss the scene takes away
          hitstop = 0; IMPS.t = 9; CAM.imp = null; PL.imp = null; PL.impSep = null; PL.slowT = 0; PL.fin = null; PL.finKO = false; PL.hang = null; PL.slamDown = false; PL.launchOf = null; PL.airSeg = null; PL.dodge = null; PL.dash = null; PL.dashLeap = false;
          // A boss still on him (the beat waited for him as long as it would): if the beat sends a boss of its own he goes
          // with the scene, one boss at a time; otherwise he is set aside for it and comes back after it, as hurt as he was
          var bs = DIR.boss && !DIR.boss.ko && actors.indexOf(DIR.boss) >= 0 ? DIR.boss : null;
          if (bs && !beatBrings(b)) {
            actors.splice(actors.indexOf(bs), 1); scene.remove(bs.g); STORY.held = bs;
            if (PL.lock === bs) PL.lock = null;
          }
          PL.combo = 0; PL.last = null; PL.queued = false; PL.pickT = 0; PL.picking = null; IN.atk = false; CAM.cine = null; DIR.boss = null;
          BIG.on = false; BIG.k = 0; BIG.hold = 0; BIG.focus = null; DUEL.k = 0; DUEL.hold = 0; DUEL.focus = null; DUEL.a = null;
        }
        STORY.chapter = i + 2; if (b.objective) STORY.objective = b.objective;
        emit('chapter', { chapter: STORY.chapter, beat: i, gm: gm, objective: STORY.objective });
        if (b.shots.length) {
          playScene(b, function (stay) { resumeRun(stay, b); });
          // a beat breaks into a fight: the punch still being mashed (a key, a thumb on PUNCH) must not skip it at once,
          // so a skip waits STORY.grace; and on a touch screen the pad is put away and Skip moved off where PUNCH was
          IX.hold = performance.now() + STORY.grace * 1000; root.classList.add('owbeat');
        } else resumeRun(null, b);
        return true;
      }
      // beginRun without the reset: the run goes on from the scene
      function resumeRun(stay, b) {
        root.classList.remove('owbeat');
        if (stay) {
          IN.f = IN.b = IN.l = IN.r = 0; IN.atk = false;
          state = 'race'; showHud(true);
          // where the scene left him, facing whoever it leaves there, the camera behind him again
          if (stay.at) { player.x = stay.at.x; player.z = stay.at.z; player.yaw = stay.at.yaw; ixStand(player, stay.at.y != null ? stay.at.y : groundAt(player.x, player.z)); CAM.yaw = player.yaw + PI; }
          stay.forEach(function (q) { if (q.kind === 'civ') return; var a = spawnKind(q.kind, { x: q.x, z: q.z }); if (!a) return; if (q.name) a.name = q.name; if (q.y != null) ixStand(a, q.y); });
          // the HUD redrawn whole (the scene hid the pick-up prompt; a weapon still at his feet asks again)
          CAM.init = false; lastHud = ''; hudPick.dataset.k = '';
          // the boss set aside for the scene, back from out of the crowd a few metres off, after him again
          if (STORY.held) {
            var hb = STORY.held, hp = openSpot(player.x, player.z, 9, 14); STORY.held = null;
            hb.x = hp.x; hb.z = hp.z; hb.y = groundAt(hb.x, hb.z); hb.kx = hb.kz = 0; hb.vx = hb.vz = 0; hb.speed = 0; hb.yaw = yawTo(hb, player.x, player.z);
            hb.state = 'chase'; hb.t = 0; hb.stun = 0; hb.act = null; hb.busy = 0; hb.hitT = null; hb.next = null; hb.token = false; hb.cool = 1 + Math.random(); hb.path = null; hb.fade = 1;
            hb.air = null; hb.lift = 0; hb.vy = null; hb.downT = 0;
            hb.g.position.set(hb.x, hb.y, hb.z); hb.g.rotation.y = hb.yaw;
            actors.push(hb); scene.add(hb.g); DIR.boss = hb;
          }
        }
        // tougher people: the heat at least the beat's, without a banner for each level it passes (the chapter has its own),
        // but with what the heat brings as it rises: a boss if it passes a third level (the beat's own, if it names one)
        // and, from heat 3, the police
        var h0 = DIR.heat, third = false;
        if (b.heat > DIR.heat) {
          DIR.heat = b.heat; DIR.heatT = 0; DIR.koHeat = 0; ctx.open.heat = DIR.heat; emit('heat', { heat: DIR.heat });
          // (as the heat's own rise: no boss for it with open.heat.bosses: false, no police with open.heat.police: false)
          third = cfg.heatBosses && Math.floor(DIR.heat / 3) > Math.floor(h0 / 3);
          if (DIR.heat >= 3 && cfg.heatPolice) dispatchPolice();
        }
        showBanner(b.banner || 'Chapter ' + STORY.chapter, b.objective || '');
        SFX.level();
        if (b.boss || third) { STORY.bossT = 2.8; STORY.bossName = typeof b.boss === 'string' ? b.boss : null; }
        STORY.shown = null;
      }
      function storyHud() {
        var on = !!STORY.objective && hudR.style.display !== 'none' && !demo, key = on ? STORY.objective : '';
        if (key === STORY.shown) return;
        STORY.shown = key; hudObj.style.display = on ? '' : 'none';
        if (!on) return;
        hudObj.lastChild.textContent = STORY.objective;
        if (STORY.shownText && STORY.shownText !== STORY.objective) { hudObj.classList.remove('new'); void hudObj.offsetWidth; hudObj.classList.add('new'); }
        STORY.shownText = STORY.objective;
      }

      /* -------------------------------------------------- machine vision -- */
      // A shot seen through a machine's eyes (shot.vision: { tint: '#FF1A1A', lines: ['TARGET: ...'], track: castId }; AI
      // Alps' cyborg, and any world's robot, drone or android), in an intro, an outro or a story's beat: the frame
      // washed in one colour over its own light and dark, fine scanlines, the lines typed out one by one in a monospace
      // face, and a box that holds a cast member's head wherever the camera goes. The colour is three layers over the
      // canvas itself (under the HUD, which keeps its own): the tint's hue on the frame's brightness, the tint
      // multiplied in, and its glow lifting the blacks. Built the first time a shot asks for it; a world whose shots
      // never do has none of it.
      var VIS = null, visP = new THREE.Vector3(), visN = new THREE.Vector3(), visU = new THREE.Vector3();
      function visionBuild() {
        var vc = document.createElement('style');
        vc.textContent = [
          '.gmvis{position:fixed;inset:0;pointer-events:none;display:none}',
          '.gmvis.hue{mix-blend-mode:color}.gmvis.mul{mix-blend-mode:multiply}.gmvis.lift{mix-blend-mode:screen}',
          '#gm .owv{position:absolute;inset:0;display:none;overflow:hidden;font-family:ui-monospace,"SF Mono",SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace}',
          '#gm .owv .vig{position:absolute;inset:0;background:radial-gradient(ellipse at center,rgba(0,0,0,0) 50%,rgba(0,0,0,.55) 100%)}',
          '#gm .owv .scan{position:absolute;inset:0;background:repeating-linear-gradient(to bottom,rgba(0,0,0,.22) 0,rgba(0,0,0,.22) 1px,rgba(0,0,0,0) 1px,rgba(0,0,0,0) 3px)}',
          '#gm .owv .sweep{position:absolute;left:0;right:0;top:0;height:14%;background:linear-gradient(to bottom,rgba(255,255,255,0),rgba(255,255,255,.07),rgba(255,255,255,0));animation:gmVisSweep 3.4s linear infinite}',
          '@keyframes gmVisSweep{from{transform:translateY(-100%)}to{transform:translateY(720%)}}',
          '#gm .owv .txt{position:absolute;left:calc(4vw + env(safe-area-inset-left,0px));top:calc(11vh + 2.4vh);font-size:clamp(11px,1.2vw,16px);line-height:1.6;letter-spacing:.12em;white-space:pre;text-transform:uppercase}',
          '#gm .owv .tgt{position:absolute;left:0;top:0;display:none;will-change:transform}',
          '#gm .owv .tgt i{position:absolute;width:26%;height:26%;border:2px solid currentColor;filter:drop-shadow(0 0 4px currentColor)}',
          '#gm .owv .tgt .a{left:0;top:0;border-right:0;border-bottom:0}#gm .owv .tgt .b{right:0;top:0;border-left:0;border-bottom:0}#gm .owv .tgt .c{left:0;bottom:0;border-right:0;border-top:0}#gm .owv .tgt .d{right:0;bottom:0;border-left:0;border-top:0}',
          // (the name beside the box, level with its top, never across the body under it)
          '#gm .owv .tgt b{position:absolute;left:calc(100% + 8px);top:0;font-size:11px;font-weight:600;letter-spacing:.16em;white-space:nowrap;text-transform:uppercase}',
        ].join('\n');
        document.head.appendChild(vc);
        // the colour goes between the canvas and the HUD's layer, so it blends with the frame (inside the HUD's layer
        // it would only tint the HUD)
        var lay = ['hue', 'mul', 'lift'].map(function (k) { var d = document.createElement('div'); d.className = 'gmvis ' + k; document.body.insertBefore(d, root); return d; });
        var ov = document.createElement('div'); ov.className = 'owv';
        ov.innerHTML = '<i class="vig"></i><i class="scan"></i><i class="sweep"></i><div class="txt"></div><div class="tgt"><i class="a"></i><i class="b"></i><i class="c"></i><i class="d"></i><b></b></div>';
        // under the letterbox, the words and the skip button
        ixEl.insertBefore(ov, ixEl.firstChild);
        VIS = { on: false, t: 0, lay: lay, el: ov, txt: ov.querySelector('.txt'), tgt: ov.querySelector('.tgt'), label: ov.querySelector('.tgt b'), lines: [], track: null, text: '', shown: false, x: 0, y: 0, s: 0, tint: '' };
      }
      function visionShot(sh) {
        var v = sh.vision && typeof sh.vision === 'object' ? sh.vision : null;
        if (!v) { visionOff(); return; }
        if (!VIS) visionBuild();
        var tint = isHex(v.tint) ? v.tint : '#FF1A1A', c = hexRgb(tint, '#FF1A1A'), rgba = function (a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; };
        VIS.lay[0].style.background = tint; VIS.lay[1].style.background = rgba(0.5); VIS.lay[2].style.background = rgba(0.16);
        VIS.lay.forEach(function (d) { d.style.display = 'block'; });
        // the type and the box in the tint, lightened, with its glow
        VIS.el.style.color = 'rgb(' + c.map(function (x) { return Math.round(x + (255 - x) * 0.55); }).join(',') + ')'; VIS.el.style.textShadow = '0 0 8px ' + rgba(0.9);
        VIS.el.style.display = 'block';
        VIS.lines = Array.isArray(v.lines) ? v.lines.slice(0, 10).map(function (s) { return String(s).replace(/\s+/g, ' ').slice(0, 60); }) : [];
        VIS.track = v.track != null ? String(v.track) : null; VIS.tint = tint;
        VIS.on = true; VIS.t = 0; VIS.text = ''; VIS.txt.textContent = ''; VIS.tgt.style.display = 'none'; VIS.shown = false;
      }
      function visionOff() {
        if (!VIS || !VIS.on) return;
        VIS.on = false; VIS.shown = false; VIS.text = ''; VIS.txt.textContent = '';
        VIS.lay.forEach(function (d) { d.style.display = 'none'; }); VIS.el.style.display = 'none'; VIS.tgt.style.display = 'none';
      }
      function stepVision(dt) {
        VIS.t += dt;
        // the lines, a character at a time (42 a second), each after the one before with a breath between; a block
        // cursor where the typing is, blinking once it is done
        var tt = VIS.t - 0.3, out = [], typing = false;
        for (var i = 0; i < VIS.lines.length && tt > 0; i++) {
          var L = VIS.lines[i], n = Math.min(L.length, Math.floor(tt * 42));
          out.push(L.slice(0, n));
          if (n < L.length) { typing = true; break; }
          tt -= L.length / 42 + 0.22;
        }
        var text = VIS.lines.length ? out.join('\n') + (typing || Math.floor(VIS.t * 3) % 2 === 0 ? '█' : '') : '';
        if (text !== VIS.text) { VIS.text = text; VIS.txt.textContent = text; }
        // the box on the tracked one's head: his head (the skeleton's, else near the top of him) on the screen this frame
        var id = VIS.track, a = id == null || !IX ? null : id === 'og' || id === 'player' ? player : IX.cast[id] || null, shown = false;
        if (a && a.g && !(a.fade < 0.05)) {
          if (a.visHead === undefined) { a.visHead = null; a.g.traverse(function (o) { if (!a.visHead && o.isBone && o.name === 'head') a.visHead = o; }); }
          if (a.visHead) { a.visHead.getWorldPosition(visP); visP.y += 0.1; } else visP.set(a.x, (a.y || 0) + (a.h || 1.8) * 0.93, a.z);
          camera.updateMatrixWorld();
          visN.copy(visP).project(camera); visU.copy(visP); visU.y += 0.22; visU.project(camera);
          if (visN.z > -1 && visN.z < 1 && Math.abs(visN.x) < 1.05 && Math.abs(visN.y) < 1.05) {
            var R = renderer.domElement.getBoundingClientRect(), x = R.left + (visN.x + 1) / 2 * R.width, y = R.top + (1 - visN.y) / 2 * R.height;
            // it closes in on him as it locks
            var k = smooth(0, 0.55, VIS.t), s = clamp(Math.abs(visU.y - visN.y) / 2 * R.height * 2.2, 26, R.height * 0.5) * (1.9 - 0.9 * k);
            VIS.tgt.style.transform = 'translate(' + (x - s / 2).toFixed(1) + 'px,' + (y - s / 2).toFixed(1) + 'px)'; VIS.tgt.style.width = VIS.tgt.style.height = s.toFixed(1) + 'px';
            VIS.x = x; VIS.y = y; VIS.s = s; shown = true;
            var nm = a.name || '';
            if (VIS.label.textContent !== nm) VIS.label.textContent = nm;
          }
        }
        if (shown !== VIS.shown) { VIS.shown = shown; VIS.tgt.style.display = shown ? 'block' : 'none'; }
      }

      /* ------------------------------------------------------ the states -- */
      function clearAll() {
        QUEUE.length = 0;
        actors.slice().forEach(function (a) { if (a !== player) removeActor(a); });
        DIR.police.forEach(dropPatrol);
        DIR.police = []; buildGrid(); sirenOn(false);
        coins.forEach(function (q) { q.on = false; });
        made.thug = made.biker = made.cop = made.boss = 0;
      }
      function openReset() {
        // the traversal lets go; the next step takes the hero again where the reset puts him (trav.js)
        if (travLive) travStop();
        clearAll();
        DIR.heat = 1; DIR.heatT = 0; DIR.spawnT = 2.5; DIR.bossN = 0; DIR.kos = 0; DIR.koHeat = 0; DIR.time = 0; DIR.boss = null; ctx.open.heat = 1;
        gm = 0; raceTime = 0; crashT = 0; bannerT = 0; hitstop = 0; assisted = autopilot || timeScale !== 1;
        IMPS.t = 9; CAM.imp = null; PL.imp = null; PL.impSep = null; PL.lean = 0;
        clearShots(); PL.heavyT = null; PL.heavyRun = 0; PL.heavyK = null; PL.heavyEnd = null; PL.chainHit = false; PL.combo = 0; PL.last = null; PL.heavyClip = null; PL.heldAfter = null; PL.dash = null; PL.dashLeap = false; PL.dodge = null; PL.safeUntil = 0; PL.counterUntil = 0; PL.countered = 0; PL.focus = 0; PL.chain = 0; PL.fin = null; PL.finKO = false; PL.finishers = 0; PL.heals = 0; CAM.cine = null; PL.hang = null; PL.slamDown = false; PL.launchOf = null; PL.airSeg = null; PL.launches = 0; IN.atk = false; PL.perfects = 0; PL.dodges = 0; PL.warned = 0; PL.slowT = 0; BIG.on = false; BIG.k = 0; BIG.hold = 0; BIG.focus = null; DUEL.k = 0; DUEL.hold = 0; DUEL.focus = null; DUEL.a = null; PL.punching = 0; PL.queued = false; PL.air = 0; PL.vy = 0; PL.jumpBuf = 0; PL.regenT = 9; PL.pickT = 0; PL.picking = null; PL.near = null; PL.fightT = -9;
        disarm(); player.kx = player.kz = 0;
        if (player.e.sick) player.e.sick(player.sick0 || 0);
        var sp = SPAWN();
        player.x = sp.x; player.z = sp.z; player.yaw = sp.yaw; player.hp = player.max; player.ko = false; player.act = null; player.busy = 0; player.stun = 0; player.speed = 0; player.state = 'idle';
        if (DERBY) derbyReset();
        if (CLIMB) climbReset();
        CAM.yaw = sp.yaw + PI; CAM.pitch = 0.2; CAM.init = false; CAM.userT = 9;
        // the street's own people (or the world's crowd, dressed and placed as it says)
        if (CROWD) crowdReset();
        else for (var i = 0; i < cfg.civilians; i++) {
          var c = person('civ', spec('civ') && null, { x: 0, z: 0 });
          if (!c) break;
          var p = openSpot(player.x, player.z, 8, 90);
          c.x = p.x; c.z = p.z; c.hp = c.max = 1; c.walk = 1.1 + Math.random() * 0.5; c.stance = ['phone', 'argue', 'shift', 'arms', 'shift'][i % 5]; c.idleT = Math.random() * 8; c.yaw = Math.random() * TAU;
        }
        // one of them already there, sizing you up
        spawnKind('thug', openSpot(player.x, player.z, 12, 16));
        hideAll();
        // a new run is the story's first chapter again
        if (STORY) storyReset();
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
      var CONTROLS_OW = '<div class="how"><div><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> move &nbsp; <kbd>Shift</kbd> run &nbsp; <kbd>J</kbd> or click: punch and kick (combos; out of reach, you dash in; hold: launch him) &nbsp; <kbd>C</kbd> or <kbd>L</kbd> dodge (just before his blow lands: a counter) &nbsp; <kbd>R</kbd> finisher, <kbd>Z</kbd> heal (with focus) &nbsp; <kbd>Space</kbd> jump &nbsp; <kbd>E</kbd> grab &nbsp; drag: look &nbsp; <kbd>P</kbd> pause</div>' +
        '<div>Survive. Knock them out and take their GM. Weapons are hidden about the streets: find one and it hits harder, until it breaks. Every minute the heat rises: more of them at once, each harder to put down, bikers, then the police, and a boss every third level.</div></div>';
      if (DERBY) CONTROLS_OW = '<div class="how"><div><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> drive (S brakes, then reverses) &nbsp; <kbd>Space</kbd> handbrake &nbsp; <kbd>Shift</kbd> boost &nbsp; <kbd>J</kbd> or hold click: guns &nbsp; drag: look &nbsp; <kbd>P</kbd> pause</div>' +
        '<div>Ram them, spin them, wreck them. A spin pays by how far it turns (90, 180, 360), a wreck pays most and spills its GM on the floor. Your nose is your weak point; your tail is your strongest. The guns heat up: let them cool. Every minute the heat rises: more of them, harder hitters, the law, and a boss every third level.</div></div>';
      if (TRAVO) CONTROLS_OW = '<div class="how"><div><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> move &nbsp; mouse: look (click to lock it) &nbsp; <kbd>Space</kbd> jump (hold: higher) &nbsp; hold right click: swing &nbsp; <kbd>E</kbd> zip to the mark &nbsp; <kbd>C</kbd> dive (in the air), dodge (on the ground) &nbsp; <kbd>R</kbd> finisher, <kbd>Z</kbd> heal (with focus) &nbsp; <kbd>Shift</kbd> run up walls &nbsp; <kbd>Q</kbd> boost &nbsp; <kbd>J</kbd> or click: punch (hold: launch him) &nbsp; <kbd>G</kbd> grab &nbsp; <kbd>P</kbd> pause</div>' +
        '<div>The roofs are yours: swing between them on the line, run up the walls, zip to an edge, and dive on them from above. Some of them climb too. Every minute the heat rises: more of them at once, each harder to put down, and a boss every third level.</div></div>';
      // a hero with fewer moves (open.kicks, open.jump or open.dodge: false, or open.tank; AI Alps, 4 Oct) is told only
      // what he can do; the street's story after it is the card's own
      if (!DERBY && !TRAVO && (!cfg.kicks || !cfg.jump || !cfg.dodge || cfg.tank)) CONTROLS_OW = '<div class="how"><div><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> move &nbsp; <kbd>Shift</kbd> run &nbsp; ' +
        (cfg.kicks ? '<kbd>J</kbd> or click: punch and kick (combos; out of reach, you dash in' + (cfg.jump ? '; hold: launch him)' : ')') : '<kbd>J</kbd> or click: punch (combos of jabs, crosses, hooks, body shots and uppercuts; out of reach, you charge in; hold: a haymaker)') +
        (cfg.dodge ? ' &nbsp; <kbd>C</kbd> or <kbd>L</kbd> dodge (just before his blow lands: a counter)' : '') + ' &nbsp; <kbd>R</kbd> finisher, <kbd>Z</kbd> heal (with focus)' +
        (cfg.jump ? ' &nbsp; <kbd>Space</kbd> jump' : '') + ' &nbsp; <kbd>E</kbd> grab &nbsp; drag: look &nbsp; <kbd>P</kbd> pause</div>' +
        CONTROLS_OW.slice(CONTROLS_OW.indexOf('<div>Survive.')).replace('<div>Survive.', '<div>' + (cfg.tank ? 'You walk through their blows, and the ones from in front land on your forearms. ' : '') + 'Survive.');
      showStart = function () {
        demo = false; root.classList.remove('demo');
        openReset(); state = 'title'; showHud(false);
        showScreen('<h1>' + esc(meta.title || 'GameMog') + '</h1>' + (meta.tagline ? '<p>' + esc(meta.tagline) + '</p>' : '') + (player && player.creature ? CONTROLS_OW.replace(' &nbsp; <kbd>R</kbd> finisher, <kbd>Z</kbd> heal (with focus)', '') : CONTROLS_OW) + '<div class="go">Enter or tap to start</div>', startCountdown);
      };
      var OUTRO = O.outro && Array.isArray(O.outro.shots) && O.outro.shots.length ? O.outro : null;
      function reachGoal() {
        emit('goal', { gm: gm, time: DIR.time });
        say(cfg.goal.title);
        if (OUTRO) { hudBoss.style.display = 'none'; playScene(OUTRO, function () { showWin(); }); }
        else showWin();
      }
      function showWin() {
        state = 'results'; resultsT = 0; showHud(false);
        var s = Math.floor(DIR.time);
        showScreen(
          '<h1>' + esc(cfg.goal.title) + '</h1><p>' + esc(cfg.goal.text || '') + '</p>' +
          '<div class="stats"><div><b>' + Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') + '</b><small>Survived</small></div><div><b>' + DIR.kos + '</b><small>' + TX.kos + '</small></div><div><b>' + gm.toLocaleString('en-US') + '</b><small>GM</small></div><div><b>' + DIR.heat + '</b><small>Heat</small></div></div>' +
          '<div class="go">Enter, Space or tap to go again</div>', startCountdown, 'bar');
        try { GM.finish({ won: true, place: 1, timeMs: Math.round(DIR.time * 1000), score: Math.round(DIR.time * 10) + gm, level: DIR.heat, gm: gm, kos: DIR.kos, survival: true, goal: true, assisted: assisted }); } catch (e) {}
      }
      function beginRun(stay) {
        demo = false; root.classList.remove('demo'); IN.f = IN.b = IN.l = IN.r = 0;
        hideScreen(); openReset(); state = 'race'; showHud(true);
        // where the opening scene left them, on the street or up on a roof
        if (stay && stay.at) { player.x = stay.at.x; player.z = stay.at.z; player.yaw = stay.at.yaw; ixStand(player, stay.at.y != null ? stay.at.y : groundAt(player.x, player.z)); CAM.yaw = player.yaw + PI; CAM.init = false; }
        if (stay && stay.length) {
          actors.slice().forEach(function (a) { if (a !== player && a.kind !== 'civ') removeActor(a); });
          stay.forEach(function (q) { if (q.kind === 'civ') return; var a = spawnKind(q.kind, { x: q.x, z: q.z }); if (!a) return; if (q.name) a.name = q.name; if (q.y != null) ixStand(a, q.y); });
        }
        showBanner('Survive', O.hud && typeof O.hud.banner === 'string' ? O.hud.banner.slice(0, 60) : 'Knock them out. Take their GM.');
        emit('start', {});
        SFX.tick(true);
      }
      startCountdown = function () {
        demo = false; root.classList.remove('demo');
        if (INTRO && !introSeen && !OW.introSkip) { hideScreen(); playIntro(beginRun); return; }
        OW.introSkip = false;
        beginRun(null);
      };
      startDemo = function () { hideScreen(); openReset(); demo = true; state = 'race'; root.classList.add('demo'); showHud(false); };
      reset = openReset;
      togglePause = function () {
        if (state === 'race') { state = 'paused'; paused = true; if (audio) audio.ctx.suspend(); var s = Math.floor(DIR.time); showScreen('<h1>Paused</h1><p>' + Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') + ' survived, ' + DIR.kos + ' ' + TX.kod + (cfg.coins ? ', ' + gm + ' GM' : '') + '</p><div class="go">P or tap to carry on</div>', togglePause, 'bar'); }
        else if (state === 'paused') { hideScreen(); state = 'race'; paused = false; if (audio) audio.ctx.resume(); }
      };
      showResults = function () {
        state = 'results'; resultsT = 0; showHud(false);
        var s = Math.floor(DIR.time);
        showScreen(
          '<h1>' + TX.down + '</h1><p>' + (crashedInto ? esc(crashedInto) + TX.by : TX.won) + '</p>' +
          '<div class="stats"><div><b>' + Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') + '</b><small>Survived</small></div><div><b>' + DIR.kos + '</b><small>' + TX.kos + '</small></div>' + (cfg.coins ? '<div><b>' + gm + '</b><small>GM</small></div>' : '') + '<div><b>' + DIR.heat + '</b><small>Heat</small></div></div>' +
          '<div class="go">Enter, Space or tap to go again</div>', startCountdown, 'bar');
        try { GM.finish({ won: false, place: 0, timeMs: Math.round(DIR.time * 1000), score: Math.round(DIR.time * 10) + gm, level: DIR.heat, gm: gm, kos: DIR.kos, survival: true, assisted: assisted }); } catch (e) {}
      };

      OW.tick = openTick;
      OW.shadow = function () {};
      // where the hero stands (his feet), into `out`, for what the runtime keeps round him: the shadows and the live
      // reflections of a world on its own ground (graphics.shadows.follow / reflections: 'hero') and where the music of
      // music.source is heard from; null before he is made
      OW.hero = function (out) { return player ? out.set(player.x, player.y || 0, player.z) : null; };
      OW.state = function () {
        return {
          heat: DIR.heat, time: +DIR.time.toFixed(2), kos: DIR.kos, gm: gm, boss: DIR.boss ? { name: DIR.boss.name, hp: DIR.boss.hp, max: DIR.boss.max } : null,
          // whether the heat sends bosses (open.heat.bosses: false, a story's beats bring them): the publish gate, whose
          // autopilot plays no beat, then asks for its boss directly
          bosses: cfg.heatBosses,
          player: player ? { x: +player.x.toFixed(2), z: +player.z.toFixed(2), y: +player.y.toFixed(2), hp: +player.hp.toFixed(1), max: player.max, ko: player.ko, speed: +player.speed.toFixed(2), act: player.act && player.act.name, combo: PL.combo, stance: player.stance, wet: +(player.wet || 0).toFixed(2) } : null,
          weapon: PL.weapon ? { kind: PL.weapon.kind, hits: PL.weapon.hits, max: PL.weapon.max } : null,
          goal: cfg.goal ? cfg.goal.gm : null, sick: player && player.e.sick ? +player.e.sick().toFixed(2) : 0,
          pickups: PICKS.map(function (q) { return { kind: q.kind, x: +q.x.toFixed(1), z: +q.z.toFixed(1), dropped: q.dropped }; }),
          enemies: actors.filter(function (a) { return a.kind !== 'civ' && a !== player; }).map(function (a) { return { kind: a.kind, name: a.name, hp: a.hp, max: a.max, state: a.state, ko: a.ko, d: player ? +dist(a, player).toFixed(1) : 0, y: +(a.y || 0).toFixed(1), climbing: !!a.wall }; }),
          civilians: actors.filter(function (a) { return a.kind === 'civ'; }).length, police: DIR.police.map(function (p) { return p.state; }),
          map: cfg.map, ready: OW.ready, colliders: { boxes: W.boxes.length, circles: W.circles.length, early: OW.early || 0 }, trav: TRAVO ? travDebug.state() : null,
          // the story (open.story): the chapter he is in, the GM of the next beat, his objective, and a beat waiting to play
          story: STORY ? { chapter: STORY.chapter, next: STORY.next < STORY.beats.length ? STORY.beats[STORY.next].gm : null, objective: STORY.objective, due: STORY.next < STORY.crossed, beats: STORY.beats.length,
            // (how long a due beat has waited on a boss, the beats that stopped waiting, and a boss set aside for a scene)
            waiting: +STORY.waitT.toFixed(2), waited: STORY.waited, held: STORY.held ? STORY.held.name : null } : null,
          derby: DERBY && player && player.car ? { log: DERBY.log.slice(-12), speed: +player.car.u.toFixed(2), armor: Math.round(health(player) * 100), guns: +player.car.heat.toFixed(2), hot: player.car.hot, spins: DERBY.spins, wrecks: DERBY.wrecks,
            zones: player.car.zones, cars: actors.filter(function (a) { return a.car && a !== player; }).map(function (a) { return { kind: a.kind, name: a.name, armor: Math.round(health(a) * 100), wreck: a.car.wreck, x: +a.x.toFixed(1), z: +a.z.toFixed(1), mode: a.car.ai ? a.car.ai.mode : null }; }) } : null,
        };
      };
      OW.debug = {
        spawn: function (kind, x, z) { return !!spawnKind(kind || 'thug', x != null ? { x: +x, z: +z } : player ? openSpot(player.x, player.z, 3, 6) : null); },
        // what the weapons did: how far the last knocked-out foes flew, how many they bowled over
        flow: function () {
          var w = threat(), r = w ? w.hitT - DIR.time : 0;
          return { hang: PL.hang ? { t: +PL.hang.t.toFixed(2), seg: PL.hang.seg, air: +PL.air.toFixed(2), foe: PL.hang.a ? +(PL.hang.a.lift || 0).toFixed(2) : null } : null, launches: PL.launches || 0, slamDown: !!PL.slamDown, focus: +(PL.focus || 0).toFixed(3), fin: PL.fin ? { t: +PL.fin.t.toFixed(2), done: PL.fin.done } : null, finishers: PL.finishers || 0, heals: PL.heals || 0, on: freeflow(), dash: PL.dash ? { t: +PL.dash.t.toFixed(2), leap: PL.dash.leap } : null, last: PL.last || null, duel: +DUEL.k.toFixed(2), thrown: PL.thrown || {}, camD: player ? +Math.hypot(camera.position.x - player.x, camera.position.z - player.z).toFixed(2) : null, combo: PL.combo, punching: +(PL.punching || 0).toFixed(2), chain: player ? chainLen() : 0,
            warn: w ? { r: +r.toFixed(2) } : null, knocked: PL.knocked || 0,
            // the hero's moves (open.kicks, jump, dodge, tank), what the finisher played, the blows he blocked, the held haymakers,
            // the clip the last blow threw (clip), the clip thrown before the last held one (heldAfter), and what the last
            // blow that landed did (open.impact: impact)
            can: { kicks: cfg.kicks, jump: cfg.jump, dodge: cfg.dodge, tank: cfg.tank ? cfg.tank.block : null }, finPlayed: PL.finPlayed || null, blocked: PL.blocked || 0, heavies: PL.heavies || 0, heavyK: PL.heavyK == null ? null : PL.heavyK, dashes: PL.dashes || 0, repeats: PL.repeats || 0,
            act: player && player.act ? player.act.name : null, clip: lastClip(), heldAfter: PL.heldAfter || null, impact: cfg.impact ? impLastOut() : null,
            dodge: PL.dodge ? { t: +PL.dodge.t.toFixed(2), side: PL.dodge.side, perfect: PL.dodge.perfect } : null, safe: dodgeSafe(),
            counter: DIR.time < PL.counterUntil, countered: PL.countered || 0, perfects: PL.perfects || 0, dodges: PL.dodges || 0, power: PL.hitPower, slow: +(PL.slowT || 0).toFixed(2),
            // what would stop a punch now
            blocks: player ? { stun: +player.stun.toFixed(2), air: +PL.air.toFixed(2), pick: +PL.pickT.toFixed(2), punching: +PL.punching.toFixed(2) } : null };
        },
        dodge: function (x, z) { return dodge(x != null ? { x: +x, z: +z, len: 1 } : null); },
        // open.impact: on or off (on, for the checks and the films, it can be turned off and on in one world to compare),
        // and what the last blow did: the fist's distance from what it was aimed at as it landed (gap, m), how far the
        // magnetism moved the two of them, the aim and the lean (degrees), the stop, the snaps, the sounds and the oohs, and
        // what of the flash, the ring and the sweat is alive
        impact: function (on) {
          if (on != null) { cfg.impact = !!on && !DERBY; if (cfg.impact) impFxInit(); }
          return { on: cfg.impact, H: +(IMP.H || 0).toFixed(3), hits: IMP.hits, blow: PL.imp ? { clip: PL.imp.clip, magnet: PL.imp.mag, moved: +PL.imp.moved.toFixed(3), done: PL.imp.done } : null, snaps: IMP.snaps, sounds: IMP.sounds, oohs: IMP.oohs, last: impLastOut(), stop: impFreeze() ? +IMPS.t.toFixed(3) : null,
            camera: CAM.imp ? { t: +CAM.imp.t.toFixed(3), amp: +CAM.imp.amp.toFixed(3), fov: +CAM.imp.fov.toFixed(2) } : null, fov: +camera.fov.toFixed(2),
            fx: IFX ? { flashes: IFX.flashes.filter(function (q) { return q.t < q.life; }).length, rings: IFX.rings.filter(function (q) { return q.t < q.life; }).length, sweat: IFX.live, made: true } : null,
            snapping: actors.filter(function (a) { return !!a.snap; }).length, lean: +((PL.lean || 0) * 180 / PI).toFixed(1) };
        },
        // the hit (or the crowd's ooh), rendered offline as the game plays it (into the effects' bus), for the checks to
        // measure and for listening: { sr, at (s), samples }; chain: on through a copy of the master as the game has it set
        // (its gain and its limiter), the hit half a second in so the limiter has settled
        impactAudio: function (kind, power, ko, ooh, chain) {
          var OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext; if (!OAC) return null;
          var sr = 48000, at = chain ? 0.5 : 0.01, oc = new OAC(1, Math.round(sr * (at + (ooh ? 1.7 : 1))), sr), out = oc.createGain(), end = out;
          if (chain) {
            var D = { threshold: -1.5, knee: 0, ratio: 20, attack: 0.002, release: 0.12 }, mg = oc.createGain(), lim = oc.createDynamicsCompressor();
            mg.gain.value = audio ? audio.master.gain.value : 0.55; for (var k in D) lim[k].value = audio ? audio.limiter[k].value : D[k];
            out.connect(mg); mg.connect(lim); end = lim;
          }
          end.connect(oc.destination);
          if (ooh) crowdOoh(1, oc, out, at); else thudLayers(oc, out, at, kind || 'cross', power || 1, !!ko);
          return oc.startRendering().then(function (b) { return { sr: sr, at: at, samples: Array.prototype.slice.call(b.getChannelData(0)) }; });
        },
        focus: function (n) { if (n != null) PL.focus = clamp(+n, 0, FOCUS.max); return +(PL.focus || 0).toFixed(3); },
        finisher: function () { return finisher(); },
        launch: function () { return launcher(); },
        // throw the held haymaker now, as a hold of J would (for checks that must not depend on key timing)
        heavy: function () { return chargedBlow(); },
        heal: function () { return heal(); },
        // the nearest man winds up now (for the checks): the seconds until his blow lands
        attack: function () {
          var b = null, bd = 99; actors.forEach(function (a) { if (a !== player && !a.ko && a.kind !== 'civ' && dist(player, a) < bd) { bd = dist(player, a); b = a; } });
          if (!b) return null; if (!b.token) { b.token = true; tokens++; } b.state = 'windup'; b.t = 0; b.stun = 0; warnOf(b); return +(b.hitT - DIR.time).toFixed(2);
        },
        flown: function () { return { flown: actors.filter(function (a) { return a.ko && a.flown != null; }).map(function (a) { return +a.flown.toFixed(2); }), bowled: OW.bowled || 0 }; },
        heat: function (h) { while (DIR.heat < h) heatUp(); return DIR.heat; },
        // (from: where the blow comes from, in radians off the way the hero faces: 0 in front, PI behind)
        hurt: function (n, from) { var by = { name: 'the check' }; if (from != null && player) { var fy = player.yaw + +from; by.x = player.x + Math.sin(fy) * 1.2; by.z = player.z + Math.cos(fy) * 1.2; } hurt(player, n || 10, by); return player.hp; },
        punch: punch, jump: jump, roll: jump,
        foes: function () { return actors.filter(function (a) { return a !== player && a.kind !== 'civ'; }).map(function (a) { return { kind: a.kind, x: +a.x.toFixed(2), z: +a.z.toFixed(2), y: +a.y.toFixed(2), ko: a.ko, hp: a.hp, wall: !!a.wall, climber: !!a.climber }; }); },
        police: function () { dispatchPolice(); return DIR.police.length; },
        patrol: function () { return DIR.police.map(function (p) { return { state: p.state, x: +p.x.toFixed(2), z: +p.z.toFixed(2), vehicle: !!p.veh }; }); },
        boss: function () { spawnBoss(); return DIR.bossN; },
        big: function () { return { on: BIG.on, k: +BIG.k.toFixed(2), foes: BIG.n, chain: player ? chainLen() : 0, last: PL.last || null, shots: SHOTS.length, creatures: actors.filter(function (a) { return a.creature; }).length }; },
        map: function () { return OW.map; },
        // a weapon at your feet (or at x, z), for the checks and the films
        weapon: function (kind, x, z) { if (!player) return false; var k = WEAPONS[kind] ? kind : 'bat'; return !!placePick(k, x == null ? player.x + Math.sin(player.yaw) * 0.6 : +x, z == null ? player.z + Math.cos(player.yaw) * 0.6 : +z, { dropped: true }); },
        grab: function () { grab(); return !!PL.picking; },
        // a party's weapons (bottle, magnum, glass, bucket): shards and drops in the air, what was heard, where the last
        // one broke, how far the one in hand is dented (its depth against new)
        glass: function () { return { shards: SHD ? SHD.live : 0, drops: SHD ? SHD.wet : 0, junk: SHD ? SHD.junk.length : 0, smashes: GLS.smashes, knocks: GLS.knocks, clangs: GLS.clangs, shattered: GLS.shattered, last: GLS.last,
          dent: PL.prop && PL.prop.children && PL.prop.children[0] ? +PL.prop.children[0].scale.z.toFixed(2) : null, stance: player ? player.stance : null,
          // what stands on the world's own spots (its foot's height, how tall against how wide), and the crew who carry one
          stood: PICKS.filter(function (q) { return q.spot && q.spot.stand; }).map(function (q) { var b = new THREE.Box3().setFromObject(q.obj, true), z = b.getSize(V3A); return { kind: q.kind, x: q.x, foot: +b.min.y.toFixed(3), tall: +(z.y / Math.max(z.x, z.z)).toFixed(2), glint: !q.still }; }),
          armed: actors.filter(function (a) { return a !== player && !a.ko && a.weapon && WEAPONS[a.weapon.kind] && (WEAPONS[a.weapon.kind].glass || WEAPONS[a.weapon.kind].dent); }).map(function (a) {
            var held = null; a.e.object.traverse(function (m) { if (!held && m.userData && m.userData.grip && m.userData.kind) held = m.userData.kind; });
            return { kind: a.weapon.kind, held: held, stance: a.stance, act: a.act ? a.act.name : null, state: a.state, d: +dist(a, player).toFixed(2) }; }) }; },
        // hold the player in a stance, or play one move on him (looking at the motion)
        pose: function (stance, move, rate) { PL.pose = stance || null; if (move && player) play(player, move, rate || 1); return true; },
        bounds: function () { return { x0: W.x0, x1: W.x1, z0: W.z0, z1: W.z1 }; },
        // the opening scene, on purpose (the checks and the tools start straight into a run)
        intro: function () { if (!INTRO || !player) return false; introSeen = false; OW.introSkip = false; startCountdown(); return state === 'intro'; },
        // the nearest n of the crew knocked out as by his fist (the checks: the heat, the coins), their GM spilled as usual
        takedown: function (n) {
          if (!player) return 0;
          var live = actors.filter(function (a) { return a !== player && a.kind !== 'civ' && !a.ko; }).sort(function (p, q) { return dist(p, player) - dist(q, player); }).slice(0, Math.max(1, +n || 1));
          live.forEach(function (a) { a.hp = 0; knockout(a, player); });
          return live.length;
        },
        // the people as the renderer sees them: drawn only where they could be seen (culled), their bound's radius in
        // metres, the face's small parts drawn or not (open.lod), how far from the camera, and their gear's meshes
        people: function () {
          return actors.filter(function (a) { return a === player || a.e && typeof a.e.dispose === 'function'; }).map(function (a) {
            var sk = [], gear = 0, face = null;
            a.e.object.traverse(function (m) {
              if (m.isSkinnedMesh) { sk.push({ culled: m.frustumCulled, r: m.boundingSphere ? +(m.boundingSphere.radius * a.e.object.scale.x).toFixed(2) : null });
                if (Array.isArray(m.material) && face == null && m.name !== 'pack' && m.name !== 'endo') { var gi = (m.geometry.userData.groups || []).indexOf('eyes'); if (gi >= 0) face = !!(m.material[gi] && m.material[gi].visible); } }
              else if (m.isMesh && !(m.parent && m.parent.userData && m.parent.userData.kind)) gear++;
            });
            var wo = null; a.e.object.traverse(function (m) { if (m.isMesh && m.parent && m.parent.userData && m.parent.userData.kind) { var mt = m.material; wo = wo || { kind: m.parent.userData.kind, opacity: 1, transparent: false }; wo.opacity = Math.min(wo.opacity, mt.opacity); wo.transparent = wo.transparent || !!mt.transparent; } });
            return { kind: a.kind, hero: a === player, ko: a.ko, fade: +a.fade.toFixed(2), x: +a.x.toFixed(1), z: +a.z.toFixed(1), cam: +Math.hypot(a.x - camera.position.x, a.z - camera.position.z).toFixed(1), skinned: sk, gear: gear, face: face, weapon: wo };
          });
        },
        // Every clip of a library person's body against the bound the culling uses (v1.js hBound): a person of `kind` is
        // made out of the way, each clip played on him (a loop as his stance, a one-off as a move), then running, then
        // knocked out lying down, and at moments through each the farthest of his vertices from the bound's middle is
        // measured as a share of its radius; under 1 everywhere means he is never drawn where the culling would skip him
        bound: function (kind, step) {
          if (!player) return null;
          var a = person(kind || 'thug', kind === 'civ' ? null : spec(kind || 'thug'), { x: player.x + 30, z: player.z + 30 }); if (!a) return null;
          var list = (ASSETS[a.body] && ASSETS[a.body].json.clips ? ASSETS[a.body].json.clips.list : []), v = new THREE.Vector3(), worst = { k: 0, clip: null }, n = 0, id = 1e6;
          var meshes = []; a.e.object.traverse(function (m) { if (m.isSkinnedMesh && m.boundingSphere && m.visible) meshes.push(m); });
          var S = Math.max(1, Math.round(+step || 17));
          function measure(clip) {
            a.g.updateMatrixWorld(true);
            meshes.forEach(function (m) {
              var B = m.boundingSphere, pos = m.geometry.attributes.position, vis = Array.isArray(m.material) ? m.geometry.groups.filter(function (g) { var mt = m.material[g.materialIndex]; return mt && mt.visible; }) : null;
              var idx = m.geometry.index;
              // (the vertices drawn: those of the groups whose material is visible)
              var seen = {};
              (vis || [{ start: 0, count: idx ? idx.count : pos.count }]).forEach(function (g) {
                for (var k = g.start; k < g.start + g.count; k += S) { var vi = idx ? idx.getX(k) : k; if (seen[vi]) continue; seen[vi] = 1; m.getVertexPosition(vi, v); var r = v.distanceTo(B.center) / B.radius; n++; if (r > worst.k) worst = { k: r, clip: clip }; }
              });
            });
          }
          function run(clip, s, secs) { for (var t = 0; t <= secs + 1e-6; t += 1 / 30) { a.e.animate(t, 1 / 30, s); if (Math.round(t * 30) % 6 === 3) measure(clip); } }
          list.forEach(function (c) {
            var loop = !!c.loop, d = Math.min(3, (c.duration || 1) + 0.2);
            run(c.name, { speed: 0, brawl: loop ? { stance: c.name, action: null, ko: false, dir: 0, gait: 'walk' } : { stance: 'idle', action: { name: c.name, id: ++id, rate: 1 }, ko: false, dir: 0, gait: 'walk' } }, d);
          });
          run('(running)', { speed: 7, brawl: { stance: 'idle', action: null, ko: false, dir: 0, gait: 'walk' } }, 1.5);
          run('(knocked out)', { speed: 0, brawl: { stance: 'idle', action: null, ko: true, dir: 0, gait: 'walk' } }, 3);
          removeActor(a);
          return { body: a.body, clips: list.length, vertices: n, worst: +worst.k.toFixed(3), clip: worst.clip, radius: meshes.length ? +(meshes[0].boundingSphere.radius * a.e.object.scale.x).toFixed(2) : null };
        },
        // nobody after you (for checks that walk somewhere)
        clear: function () { QUEUE.length = 0; actors.slice().forEach(function (a) { if (a !== player && a.kind !== 'civ') removeActor(a); }); DIR.spawnT = 6; return true; },
        // the street's people, or the world's crowd (open.civilians as an object), and those of it who turned on him: where
        // each stands and their spot, what they do at what pace, the clothes the human kit painted on them (its kinds:
        // shirt 1 tank, 2 tee, 4 open, 6 polo, 8 sweater, 11 turtleneck; jacket 0 none, 3 coat, 4 puffer, 5 blazer),
        // what their look asked for, and a shoulder's and a hip's turn (two dancers in step turn them alike)
        crowd: function () {
          var q = function (o) { return o ? [o.quaternion.x, o.quaternion.y, o.quaternion.z, o.quaternion.w].map(function (v) { return +v.toFixed(4); }) : null; };
          var dress = function (a) {
            var u = null;
            a.e.object.traverse(function (m) { if (u || !m.isSkinnedMesh) return; (Array.isArray(m.material) ? m.material : [m.material]).forEach(function (mt) { if (!u && mt && mt.userData && mt.userData.ccU) u = mt.userData.ccU; }); });
            return u ? { shirt: u.ccShirtKind.value, jacket: u.ccJacketKind.value, pants: u.ccPantsKind.value, color: '#' + u.ccShirt.value.getHexString(), coat: '#' + u.ccJacket.value.getHexString() } : null;
          };
          var asked = function (l) { try { return l ? JSON.parse(JSON.stringify({ body: l.body || null, clothes: l.clothes || null, gear: l.gear || null })) : null; } catch (e) { return null; } };
          return { on: !!CROWD, turned: CROWD ? CROWD.turned : 0, refills: CROWD ? CROWD.refills : 0, breaks: CROWD ? CROWD.breaks : 0, waiting: CROWD ? CROWD.free.length : 0,
            people: actors.filter(function (a) { return a !== player && (a.kind === 'civ' || a.turned); }).map(function (a) {
              var P = a.party, H = P && P.home;
              return { kind: a.kind, state: a.state, turned: !!a.turned, ko: a.ko, x: +a.x.toFixed(2), z: +a.z.toFixed(2), yaw: +a.yaw.toFixed(3), speed: +a.speed.toFixed(2), flee: +(a.flee || 0).toFixed(2),
                d: player ? +dist(a, player).toFixed(1) : null, body: a.body, stance: a.stance, zone: H ? H.zone : null, home: H ? [+H.x.toFixed(2), +H.z.toFixed(2)] : null, rate: P ? +P.rate.toFixed(3) : null,
                rest: P ? P.rest : null, late: P ? P.late : null, dress: dress(a), asked: asked(P && P.look), arm: q(a.e.object.getObjectByName('upperarm01_L')), hip: q(a.e.object.getObjectByName('upperleg01_R')) };
            }) };
        },
        // footsteps heard (open.steps): his own, and others' near him
        steps: function () { return FOOT ? { kind: FOOT.kind, hero: FOOT.hero, near: FOOT.near } : null; },
        // the goal, reached at once (the closing scene, for the checks and the films)
        ending: function () { if (!cfg.goal || !player || state !== 'race') return false; gm = Math.max(gm, cfg.goal.gm); reachGoal(); return true; },
        introState: function () { return IX ? { shot: IX.i, t: +IX.t.toFixed(2), cast: Object.keys(IX.cast) } : null; },
        // GM earned as a coin taken earns it (the goal, the story's beats), for the checks
        gm: function (n) { if (n > 0 && player && state === 'race' && !demo) earnGm(Math.round(n)); return gm; },
        // a story's beat i, now, even with the autopilot driving (the checks and the films)
        beat: function (i) {
          if (!STORY || !player || player.ko || state !== 'race' || IX || demo) return false;
          i = clamp(Math.round(+i || 0), 0, STORY.beats.length - 1); STORY.next = i; STORY.crossed = Math.max(STORY.crossed, i + 1);
          return playBeat();
        },
        // the machine's view (shot.vision) as it is on the screen: its colour, the lines typed so far, the box on the head
        vision: function () { return VIS ? { on: VIS.on, tint: VIS.tint, text: VIS.text, track: VIS.track, box: VIS.on && VIS.shown ? { x: +VIS.x.toFixed(1), y: +VIS.y.toFixed(1), size: +VIS.s.toFixed(1) } : null } : null; },
        // stand the player somewhere, the camera looking along yaw (0 = north, -PI/2 = east, to the sea)
        place: function (x, z, yaw, pitch, free, face) {
          if (!player) return false;
          player.x = free ? +x : clamp(+x, W.x0, W.x1); player.z = free ? +z : clamp(+z, W.z0, W.z1); player.y = groundAt(player.x, player.z);
          // a climber put on a building stands on its roof
          if (climbOn()) { TRV.mode = 'ground'; TRV.vx = TRV.vy = TRV.vz = 0; TRV.y = floorAt(player.x, player.z, 999); player.y = TRV.y; PL.air = 0; }
          if (free) player.free = true;
          // a car stands where it is put: no slide, no spin carried over
          if (player.car) { player.vx = player.vz = 0; player.w = 0; player.car.loose = 0; }
          if (yaw != null) { CAM.yaw = +yaw; player.yaw = +yaw + PI; }
          if (pitch != null) CAM.pitch = clamp(+pitch, -0.1, 0.9);
          if (face != null) { player.yaw = +face; PL.faceHold = +face; }
          CAM.init = false; CAM.userT = 0;
          // the traversal takes him there too, facing the way the camera looks
          if (travOn()) { TRAV.teleport(player.x, player.y, player.z, face != null ? +face : player.yaw); PL.faceHold = null; }
          return { x: player.x, z: player.z, y: player.y };
        },
        traversal: travDebug,
      };

      /* ------------------------------------------------------- building -- */
      function finish() {
        buildGrid(); buildNav(); hideouts();
        var sp = SPAWN();
        player = makeActor('player', P0, { body: cfg.body, x: sp.x, z: sp.z, yaw: sp.yaw, hp: num(O.health, 100, 20, 1000), name: P0.name || 'You' });
        player.r = 0.34; player.gait = typeof O.gait === 'string' ? O.gait : 'walkCool';
        // a hero with its own body (not a library person: MogDune's plush) times its moves as a creature does
        if (P0.creature || P0.timing) player.creature = true;
        disarm();
        if (TRAVO) { climbReset(); travSetup(); }
        if (DERBY) { derbyCar(player, P0.vehicle || {}); derbySetup(); }
        // the world's hero may be ill (you, playing as yourself, catch it too)
        player.sick0 = (typeof worldPlayer !== 'undefined' && worldPlayer && worldPlayer.sick0) || 0;
        if (player.e.sick) player.e.sick(player.sick0);
        // every material the map and the world brought, compiled now, under the title, and not in the first seconds of
        // play (the city: its facades, its crowd and its cars would each stall a frame the first time they are seen)
        if (OW.map && !window.__gmNoWarm) {
          var hid = [];
          scene.traverse(function (o) { if (!o.visible && (o.isMesh || o.isGroup || o.isPoints || o.isLine)) { hid.push(o); o.visible = true; } });
          try { renderer.compile(scene, camera); } catch (e) {}
          // and their textures sent to the graphics card now, not on first sight
          if (renderer.initTexture && !window.__gmNoTex) {
            var seen = new Set(), up = function (t) { if (t && t.isTexture && !seen.has(t)) { seen.add(t); try { renderer.initTexture(t); } catch (e) {} } };
            scene.traverse(function (o) {
              (Array.isArray(o.material) ? o.material : o.material ? [o.material] : []).forEach(function (m) {
                for (var k in m) up(m[k]);
                if (m.uniforms) for (var u in m.uniforms) { var v = m.uniforms[u] && m.uniforms[u].value; if (Array.isArray(v)) v.forEach(up); else up(v); }
              });
            });
          }
          hid.forEach(function (o) { o.visible = false; });
        }
        OW.ready = true;
        startDemo();
        // (open.warm) and a world on its own ground that asks: with what the run starts with (its people, its weapons laid
        // out) among them, still before the first frame and the world's ready
        // (open.impact: its flash, ring and sweat made now, to be compiled with the rest, or on their own: impFxWarm)
        if (cfg.impact && !DERBY) { impFxInit(); if (!cfg.warm && !window.__gmNoWarm) impFxWarm(); }
        if (cfg.warm && !window.__gmNoWarm) warmUp();
      }
      // Every material in the world compiled now and its textures sent to the graphics card (open.warm: true), as a
      // library map's are above, so a glint, a shard or a beam does not stall a frame the first time it comes into view.
      // A party's shards are made now to be among them (otherwise they are made at the first bottle broken). Compiled
      // for where the frame is drawn: the cinematic renderer draws into an HDR target, and a program built for the
      // screen (tone mapped, sRGB) is not the one used there.
      function warmUp() {
        var glassy = function (k) { return !!(k && WEAPONS[k] && (WEAPONS[k].glass || WEAPONS[k].dent)); };
        if (cfg.weapons && (kindsTable().some(function (r) { return glassy(r[0]); }) || (cfg.weapons.spots || []).some(function (q) { return glassy(q.kind); }))) shardPools();
        var rt0 = renderer.getRenderTarget(), wrt = post ? new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType }) : null;
        try { if (wrt) renderer.setRenderTarget(wrt); renderer.compile(scene, camera); } catch (e) {}
        finally { renderer.setRenderTarget(rt0); if (wrt) wrt.dispose(); }
        if (renderer.initTexture && !window.__gmNoTex) {
          var seen = new Set(), up = function (t) { if (t && t.isTexture && !seen.has(t)) { seen.add(t); try { renderer.initTexture(t); } catch (e) {} } };
          scene.traverse(function (o) {
            (Array.isArray(o.material) ? o.material : o.material ? [o.material] : []).forEach(function (m) {
              for (var k in m) up(m[k]);
              if (m.uniforms) for (var u in m.uniforms) { var v = m.uniforms[u] && m.uniforms[u].value; if (Array.isArray(v)) v.forEach(up); else up(v); }
            });
          });
        }
      }
      var mapLib = cfg.map ? MAPS[cfg.map] : null;
      if (cfg.map && !mapLib) warn('open.map "' + cfg.map + '" is not a library map; the world stands on its own ground.');
      if (mapLib) {
        // the city map takes the district, the time of day and the world's own copy for its billboards and shop signs
        // (open.city: { district, time: 'day' | 'dusk' | 'night', ads: [[title, line, bg, bg2, ink, accent]], signs: [[name, bg, ink]] })
        var cityRows = function (list, n) { return Array.isArray(list) ? list.filter(function (r) { return Array.isArray(r) && r.length >= n && r.every(function (v) { return typeof v === 'string' && v.length <= 60; }); }).slice(0, 64) : undefined; };
        // and its life: traffic / people false for empty streets, a number for more or fewer (1 as made, up to 2)
        var CO = O.city && typeof O.city === 'object' ? O.city : {};
        var life = function (v, low) { return v === false ? false : typeof v === 'number' && v >= 0 ? Math.min(2, v) : lowQ ? low : true; };
        var mapOpts = cfg.map === 'city' ? { district: typeof CO.district === 'string' ? CO.district : undefined, time: typeof CO.time === 'string' ? CO.time : undefined,
          ads: cityRows(CO.ads, 6), signs: cityRows(CO.signs, 3), traffic: life(CO.traffic, 0.6), people: life(CO.people, 0.6) } : {};
        mapLib.build(Object.assign({ renderer: renderer, scene: scene, frame: function () { return new Promise(function (r) { setTimeout(r, 0); }); }, traffic: lowQ ? 2 : 3 }, mapOpts))
          .then(function (m) {
            OW.map = m; ctx.open.map = m;
            // a big map settles its resolution sooner (v1.js adapt)
            if (m.adapt === 'fast' && typeof Q !== 'undefined') Q.fast = true;
            W.x0 = m.walk.bounds.x0; W.x1 = m.walk.bounds.x1; W.z0 = m.walk.bounds.z0; W.z1 = m.walk.bounds.z1;
            W.boxes = W.boxes.concat(m.walk.boxes); W.circles = W.circles.concat(m.walk.circles);
            W.height = m.walk.heightAt;
            // the map's sun lights the people too, and its shadows follow the camera;
            // a soft fill from the sky and the street keeps a face in shadow readable
            renderer.shadowMap.autoUpdate = false;
            // a map that lights itself for its own exposure (the city after dark) says by how much to raise the world's (m.exposure)
            if (typeof m.exposure === 'number' && m.exposure > 0 && m.exposure !== 1) {
              var mk = Math.min(6, m.exposure);
              if (G) { G.exposure *= mk; if (post && post.setExposure) post.setExposure(G.exposure); } else renderer.toneMappingExposure *= mk;
            }
            // (a map that lights itself for its own exposure, the city at night, says how much fill it wants: m.fill)
            var fill = new THREE.HemisphereLight('#BFD6F2', '#C8A27A', typeof m.fill === 'number' ? m.fill : 0.45); fill.userData.gmOpenFill = true; scene.add(fill);
            try { if (typeof def.onMap === 'function') def.onMap(ctx, m); } catch (e) { warn('onMap() threw: ' + (e && e.message || e)); }
            finish();
          })
          .catch(function (e) { fail('The map "' + cfg.map + '" could not be built: ' + (e && e.message || e)); try { console.error(e); } catch (x) {} finish(); });
      } else finish();
    }
