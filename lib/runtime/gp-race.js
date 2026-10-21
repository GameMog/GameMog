    /* ======================================================================== Grand Prix: the race (the rules) == */
    // gp-race.js (ARTIFICIAL1 M1, lane R; M2, lane A). Pasted into boot() by gp.js at /*@include gp-race.js*/. ONE
    // top-level binding, GpRace; every other name lives inside it, so nothing of v1's boot() is shadowed.
    //
    // PURE (all of it, since M2): no window, no document, no THREE, no clock, no Math.random, no console. Loaded by Node
    // with vm.runInNewContext(src + ';GpRace', {}). The sim (GpSim) and the AI (GpAI) come in as arguments, never by
    // name, and nothing here uses instanceof on another module's data. M1's two views moved out in M2, their code
    // unchanged: the cameras to gp-cam.js (GpCam.camera, lane B), the HUD to gp-hud.js (GpHud.hud, lane E).
    //
    //   GpRace.read(G, T, warn)            -> Cfg: def.gp normalised, every anchor turned into plan metres (T.at)
    //   GpRace.rules(T, cfg, aux?)         -> (S) => ({ pre(S, H), post(S, H) }): the race's rules, run inside the
    //                                         sim's 120 Hz step (aux: { line, place } for the recovery of stuck cars)
    //   GpRace.race(mods, T, G, o)         -> R: the one composition root (sim + AI + rules), the same in the page and
    //                                         in Node; mods = { GpSim, GpAI }
    //
    // The run's tags (the owner, 15 Oct, D3): a race the player drove with the driving aids is tagged aids 'on' (Pro:
    // 'pro'; 'off' is kept for a middle setting) and is never 'assisted'; 'assisted' is only the autopilot and the
    // platform's test controls, which the scores route, dares and the page's counting refuse. The player's grid slot
    // (D4) comes in as o.slot; the CLUB field (D4's pace fallback, off unless the measured check fails) as o.field.
    //
    // The rules (INTERFACES.md 2.8, the owner's 14 Oct decisions): a grid of staggered slots 8 m apart behind the line;
    // five red lights a second apart, then a random hold (the race stream), then lights out (no beeps anywhere);
    // laps through all 16 gates; places; sectors; last and best laps; track limits (all four wheels past the kerb in
    // a corner's zone: a strike, the lap deleted, and every third strike +5 s); the Flap (armed at a detection point
    // within 1.0 s of the car ahead, from lap 2; opened on request in its zone, or at the zone's start when the player
    // asked for it once it was armed; shut by the brake or the zone's end); overtakes (held for 1 s); the player's
    // getaway (a throttle press after lights out, timed; held through them, a slow getaway); the chequered flag (the
    // first car home ends its race, and then each car at its next
    // line crossing); the end 60 s after the winner, the rest classified by distance; stuck cars put back on the
    // line (contact never ends a race).
    //
    // M2 (lane A): the start as one rule on every device (X29: BRAKE is the clutch on the grid; the rev phase, the lights,
    // the hold; a launch event for every car with its reaction and mode; EARLY with the aids, a jump start in Pro); passes
    // classified and held 2 s (X24: dive, tow, switchback, outside, gift, contact, cut; GIVE IT BACK); the final lap, the
    // nemesis (X08, X15); the Flap's ready state and the aids' auto-Flap (X14); the gaps at the line (X27); the events the
    // sound and the director read (the tow, crests, tunnels, side by side).
    var GpRace = (function () {
      var PI = Math.PI, TAU = 2 * PI, abs = Math.abs, min = Math.min, max = Math.max, floor = Math.floor;
      var sqrt = Math.sqrt, sin = Math.sin, cos = Math.cos, atan = Math.atan, atan2 = Math.atan2, tan = Math.tan;
      var DEG = PI / 180;
      var MODES = ['chase', 'tcam', 'cockpit'];
      // the numbers the rules use (the world may set the ones read() reads; the rest are the design's)
      var K = {
        laps: 3, field: 20, endAfter: 60, gates: 16, strikes: 3, penalty: 5, gap: 1, hold: [0.2, 3], gridHold: 1.5,
        flapFromLap: 2, flapWindow: 1.0, flapBrake: 0.2, recoverAfter: 4, recoverV: 10, stuckV: 2,
        slot: 8, slotLat: 3.5, passHold: 1, passAway: 1000, half: 1.0, kerb: 0.8, zoneIn: 20, zoneOut: 40,
        moved: 0.5, pendMax: 64,
        // the player's getaway (fix, 15 Oct: holding the throttle through the lights started at 0.000 s, the AI at 0.15 to
        // 0.35): the car leaves on a throttle press made after lights out (its reaction, timed); the throttle held through
        // lights out is a slow getaway, bog s; on touch, with no tap, it leaves at touchGo s; after launchMax s the hold ends
        bog: 0.3, touchGo: 0.6, launchMax: 1.0, launchOn: 0.5,
        // the CLUB field (D4): every agent at this share of its pace
        club: 0.98,
        // the start (X29, D5: one launch on every device, BRAKE is the clutch on the grid): armed while BRAKE >= armOn;
        // armed at lights out, the car leaves on the release; not armed, on a throttle press (rising edge) after lights out;
        // neither, heldGo s after lights out. An armed BRAKE let go during the lights: with the aids an EARLY (held, may
        // re-arm, no penalty), in Pro a jump start (+jumpPen s, the clutch slips: the car creeps at creep m/s). A release
        // with the aids gets launch control (the throttle held open for lc s unless BRAKE comes back)
        armOn: 0.5, heldGo: 0.3, jumpPen: 5, creep: 1.0, lc: 1.0,
        // passes (X24): one pass event once the new order has held passHold2 s; the move's window looks passWin s back for
        // the tow, contact and cut, gift s back for the other car's mistake, switch s back for a place lost to the same car
        passHold2: 2, passWin: 3, gift: 3, switchT: 8, cornerPre: 150, cornerPost: 40,
        // a place gained by cutting (a strike in the move): give it back within giveBack s, or +giveBackPen s
        giveBack: 10, giveBackPen: 5,
        // the auto-Flap with the aids (X14): opens in the zone at throttle >= flapThr with the steering within flapSteer
        flapThr: 0.95, flapSteer: 0.25,
        // the nemesis (X15): named at the player's first line crossing, the closest pace within nemesisWin s on the road
        nemesisWin: 3,
        // events for the sound and the picker: the tow (draft in at towIn, out under towOut), a crest (load under crestG,
        // landed over landG), side by side (two cars overlapping alongside within sbsLat m for sbsMin s through a corner)
        towIn: 0.35, towOut: 0.12, towHold: 0.4, crestG: 0.55, landG: 0.85, sbsLat: 3.6, sbsMin: 0.6,
      };

      /* ---------------------------------------------------------------------------------------- helpers -- */
      function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
      function numOr(v, d) { v = +v; return v === v && isFinite(v) ? v : d; }
      function clamp01(v, d) { return clamp(numOr(v, d), 0, 1); }
      function isObj(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }
      function str(s, d) { return typeof s === 'string' && s.trim() ? s.trim() : d; }
      // a plain-data copy (finite numbers, strings, booleans, arrays, plain objects; at most 6 deep, 4,096 entries an array)
      function plain(v, dep) {
        if (typeof v === 'number') return isFinite(v) ? v : undefined;
        if (typeof v === 'string') return v.slice(0, 200);
        if (typeof v === 'boolean') return v;
        if (dep >= 6 || !v || typeof v !== 'object') return undefined;
        if (Array.isArray(v)) { var a = []; for (var i = 0; i < v.length && i < 4096; i++) { var x = plain(v[i], dep + 1); a.push(x === undefined ? null : x); } return a; }
        var o = {}; for (var k in v) if (Object.prototype.hasOwnProperty.call(v, k)) { var y = plain(v[k], dep + 1); if (y !== undefined) o[k] = y; }
        return o;
      }
      function hexOr(c, d) { return typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c) ? c.toUpperCase() : d; }
      function angDiff(a, b) { var d = (a - b) % TAU; if (d <= -PI) d += TAU; else if (d > PI) d -= TAU; return d; }
      function wrapL(L, d) { d = d % L; return d < 0 ? d + L : d; }
      // d inside the span from a to b along the lap (it may run over the line)
      function inSpan(L, d, a, b) { return wrapL(L, d - a) <= wrapL(L, b - a); }
      // a colour's saturation and lightness (0..1), to pick a team's colour for the tower
      function satLight(hex) {
        var n = parseInt(hex.slice(1), 16), r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
        var mx = max(r, g, b), mn = min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
        return { s: d === 0 ? 0 : d / (1 - abs(2 * l - 1)), l: l };
      }
      function towerColour(c) { var u = satLight(c.upper); return u.s < 0.25 || u.l > 0.85 || u.l < 0.12 ? c.coach : c.upper; }
      // a 3-capital code from a name ('Waypoint' -> 'WAY')
      function tlaOf(name) { var s = String(name || '').toUpperCase().replace(/[^A-Z]/g, ''); return (s + 'XXX').slice(0, 3); }
      // a position along the lap: metres, or an anchor [segId, fraction(, metres)] through the track's own T.at
      function anchor(T, pos, warn, what) {
        try {
          if (typeof pos === 'number' && isFinite(pos)) return wrapL(T.L, pos);
          if (Array.isArray(pos) && typeof T.at === 'function') { var d = T.at(pos); if (typeof d === 'number' && isFinite(d)) return wrapL(T.L, d); }
        } catch (e) { warn(what + ': ' + (e && e.message ? e.message : String(e))); return null; }
        warn(what + ': not a position on the lap (metres, or [segment, fraction] or [segment, fraction, metres])');
        return null;
      }
      function trackKerb(T) { return numOr(T.kerb, K.kerb); }
      function hwOf(T, d) { return typeof T.hwAt === 'function' ? T.hwAt(d) : numOr(T.hwMax, 7); }
      // a deep copy of plain data (no structuredClone in a vm realm)
      function copy(x) {
        if (x === null || typeof x !== 'object') return x;
        if (Array.isArray(x)) { var a = new Array(x.length); for (var i = 0; i < x.length; i++) a[i] = copy(x[i]); return a; }
        if (ArrayBuffer.isView(x)) return Array.prototype.slice.call(x);
        var o = {}; for (var k in x) if (Object.prototype.hasOwnProperty.call(x, k)) o[k] = copy(x[k]); return o;
      }

      /* ------------------------------------------------- read: def.gp normalised (INTERFACES.md 2.8) -- */
      function read(G, T, warn) {
        warn = typeof warn === 'function' ? warn : function () {};
        G = isObj(G) ? G : {};
        var L = T.L;
        var cfg = {
          laps: clamp(Math.round(numOr(G.laps, K.laps)), 1, 5),
          field: clamp(Math.round(numOr(G.field, K.field)), 1, 20),
          you: null, specs: [], grid: 'quali', endAfter: clamp(numOr(G.endAfter, K.endAfter), 10, 300), gates: K.gates,
          limits: { strikes: K.strikes, penalty: K.penalty, zones: [] },
          lights: { gap: K.gap, hold: K.hold.slice(), gridHold: K.gridHold },
          flaps: [], flapFromLap: K.flapFromLap, sectors: [], corners: {},
          cameras: { start: 'chase', allow: MODES.slice() },
          // (the driving aids each device starts with: on everywhere, Pro opt-in on every device; the owner's 15 Oct
          // "all recommended", read by the main session for keys and pads too, since a first desktop race in Pro ran far
          // off the pace)
          assists: { touch: { brake: true, steer: true }, keys: { brake: true, steer: true } },
          gearbox: G.gearbox === 'manual' ? 'manual' : 'auto', recoverAfter: K.recoverAfter, chequer: G.chequer !== false,
          slot: clamp(numOr(G.slot, K.slot), 6, 16), slotLat: clamp(numOr(G.slotLat, K.slotLat), 1.5, 6),
          // (21 Oct, Superintelligence Sprint: opt-in) the pack: the field kept round the player as in a kart race (gp.pack:
          // true, or { ahead: s, slow: the least of its target speed a car up the road keeps, k: per s past ahead, behind: s,
          // push: pace added past behind }); the grid slot of a session's first race (gp.firstSlot, else the back)
          pack: G.pack ? { ahead: clamp(numOr(G.pack.ahead, 1.2), 0.3, 10), slow: clamp(numOr(G.pack.slow, 0.8), 0.6, 1), k: clamp(numOr(G.pack.k, 0.06), 0.01, 0.3),
            behind: clamp(numOr(G.pack.behind, 1.5), 0.3, 10), push: clamp(numOr(G.pack.push, 0.01), 0, 0.02) } : null,
          firstSlot: G.firstSlot != null && isFinite(+G.firstSlot) ? Math.round(+G.firstSlot) : null,
        };
        // teams and drivers (cut order); a driver's team must be listed
        var teams = {}, tlist = Array.isArray(G.teams) ? G.teams : [];
        tlist.forEach(function (t, i) {
          if (!isObj(t) || !str(t.id)) { warn('gp.teams[' + i + '] needs an id'); return; }
          teams[t.id] = t;
        });
        var drivers = Array.isArray(G.drivers) ? G.drivers.filter(function (d, i) {
          if (!isObj(d) || !str(d.id)) { warn('gp.drivers[' + i + '] needs an id'); return false; }
          return true;
        }) : [];
        var seen = {}, perTeam = {};
        drivers = drivers.filter(function (d) { if (seen[d.id]) { warn('gp.drivers: "' + d.id + '" is listed twice'); return false; } seen[d.id] = 1; return true; });
        if (!drivers.length) { warn('gp.drivers is empty: one stand-in driver races'); drivers = [{ id: 'car', name: 'Car', tla: 'CAR', num: '1' }]; }
        var all = drivers.map(function (d, i) {
          var t = teams[d.team];
          if (!t) { if (d.team) warn('gp.drivers "' + d.id + '": team "' + d.team + '" is not in gp.teams'); t = { id: d.team || 'none', name: '' }; }
          var mate = perTeam[t.id] = (perTeam[t.id] || 0) + 1;
          return specOf(d, t, i, mate > 1);
        });
        cfg.all = all;
        cfg.field = min(cfg.field, all.length);
        cfg.specs = all.slice(0, cfg.field);
        var you = str(G.you, null);
        cfg.you = you && seen[you] ? you : all[0].id;
        if (you && !seen[you]) warn('gp.you "' + you + '" is not a driver: ' + cfg.you + ' drives');
        // every car is driven by an agent (the owner, 15 Oct, D1): the player's seat is shown as the agent's name and this
        // tag ("MUSE · DRIVEN BY YOU"), never as a person
        cfg.youTag = str(G.youTag, 'DRIVEN BY YOU').slice(0, 24);
        // the field's pace (D4): 'real' (the decided default), or 'club' only if the measured check fails
        cfg.fieldPace = G.fieldPace === 'club' ? 'club' : 'real';
        if (Array.isArray(G.grid)) cfg.grid = G.grid.filter(function (id) { return typeof id === 'string' && seen[id]; });
        // the limits: a zone round every corner (d0 - 20 .. d1 + 40), zones that touch merged (a chicane is one zone)
        var LI = isObj(G.limits) ? G.limits : {};
        cfg.limits.strikes = clamp(Math.round(numOr(LI.strikes, K.strikes)), 1, 10);
        cfg.limits.penalty = clamp(numOr(LI.penalty, K.penalty), 0, 60);
        if (LI.off === true) cfg.limits.zones = [];
        else if (Array.isArray(LI.zones)) {
          LI.zones.forEach(function (z, i) {
            var a = anchor(T, z && z.from, warn, 'gp.limits.zones[' + i + '].from'), b = anchor(T, z && z.to, warn, 'gp.limits.zones[' + i + '].to');
            if (a != null && b != null) cfg.limits.zones.push({ id: str(z.id, 'Z' + (i + 1)), d0: a, d1: b });
          });
        } else cfg.limits.zones = cornerZones(T);
        var LG = isObj(G.lights) ? G.lights : {};
        cfg.lights.gap = clamp(numOr(LG.gap, K.gap), 0.5, 2);
        if (Array.isArray(LG.hold) && LG.hold.length === 2) {
          var h0 = clamp(numOr(LG.hold[0], K.hold[0]), 0, 5), h1 = clamp(numOr(LG.hold[1], K.hold[1]), 0, 5);
          cfg.lights.hold = [min(h0, h1), max(h0, h1)];
        }
        cfg.lights.gridHold = clamp(numOr(LG.gridHold, K.gridHold), 0, 10);
        // the Flap zones: a detection point, then the zone from .. to
        (Array.isArray(G.flaps) ? G.flaps : []).forEach(function (f, i) {
          if (!isObj(f)) return;
          var id = str(f.id, 'Z' + (i + 1)), w = 'gp.flaps "' + id + '"';
          var det = anchor(T, f.detect != null ? f.detect : f.det, warn, w + ' detect'), a = anchor(T, f.from, warn, w + ' from'), b = anchor(T, f.to, warn, w + ' to');
          if (det == null || a == null || b == null) return;
          if (wrapL(L, b - a) < 50) { warn(w + ': the zone is under 50 m long'); return; }
          if (inSpan(L, det, a, b)) { warn(w + ': the detection point is inside its own zone'); return; }
          cfg.flaps.push({ id: id, name: str(f.name, id), det: det, from: a, to: b });
        });
        cfg.flapFromLap = clamp(Math.round(numOr(G.flapFromLap, K.flapFromLap)), 1, 5);
        // the sectors: two boundaries in lap order (the line is the third)
        if (Array.isArray(G.sectors)) {
          var sd = G.sectors.slice(0, 2).map(function (p, i) { return anchor(T, p, warn, 'gp.sectors[' + i + ']'); }).filter(function (d) { return d != null && d > 1 && d < L - 1; });
          sd.sort(function (a, b) { return a - b; });
          if (sd.length === 2 && sd[1] - sd[0] > 50) cfg.sectors = sd;
          else if (G.sectors.length) warn('gp.sectors: two positions in lap order, at least 50 m apart, are needed');
        }
        if (isObj(G.corners)) for (var c in G.corners) if (typeof G.corners[c] === 'string') cfg.corners[c] = G.corners[c].slice(0, 40);
        var CA = isObj(G.cameras) ? G.cameras : {};
        if (Array.isArray(CA.allow)) { var al = CA.allow.filter(function (m) { return MODES.indexOf(m) >= 0; }); if (al.length) cfg.cameras.allow = al; }
        cfg.cameras.start = cfg.cameras.allow.indexOf(CA.start) >= 0 ? CA.start : cfg.cameras.allow[0];
        // (the director's and the camera's own data, as plain data: they validate it, lane B; 'glass': true = the world draws its own cockpit dash, the HUD hides its copies there)
        ['tv', 'look', 'demo', 'house', 'eyes', 'exposure', 'tunnelEv', 'glass'].forEach(function (k) { if (CA[k] != null) { var v = plain(CA[k], 0); if (v !== undefined) cfg.cameras[k] = v; } });
        var AS = isObj(G.assists) ? G.assists : {};
        ['touch', 'keys'].forEach(function (k) { if (isObj(AS[k])) { if (AS[k].brake != null) cfg.assists[k].brake = !!AS[k].brake; if (AS[k].steer != null) cfg.assists[k].steer = !!AS[k].steer; } });
        cfg.recoverAfter = clamp(numOr(G.recoverAfter, K.recoverAfter), 2, 15);
        // covered stretches (the tunnel events for the sound and the cameras): [{ id, from, to }], anchors or metres
        cfg.tunnels = [];
        (Array.isArray(G.tunnels) ? G.tunnels : []).slice(0, 8).forEach(function (u, i) {
          if (Array.isArray(u) && u.length === 2) u = { from: u[0], to: u[1] };
          if (!isObj(u)) return;
          var a = anchor(T, u.from, warn, 'gp.tunnels[' + i + '].from'), b = anchor(T, u.to, warn, 'gp.tunnels[' + i + '].to');
          if (a != null && b != null && wrapL(L, b - a) > 10) cfg.tunnels.push({ id: str(u.id, 'tunnel' + (i + 1)), from: a, to: b });
        });
        return cfg;
      }
      function specOf(d, t, n, mate) {
        var colors = {
          upper: hexOr(d.upper, hexOr(t.upper, '#C8CCD2')), lower: hexOr(d.lower, hexOr(t.lower, '#141518')),
          coach: hexOr(d.coach, hexOr(t.coach, '#DD6135')), letters: str(t.letters, str(t.name, '')), number: hexOr(d.number, hexOr(t.number, '#FFFFFF')),
        };
        var sh = isObj(d.shift) ? d.shift : {};
        var tla = typeof d.tla === 'string' && /^[A-Z]{3}$/.test(d.tla) ? d.tla : tlaOf(d.name || d.id);
        var arc = typeof d.arc === 'number' && isFinite(d.arc) ? clamp(d.arc, -0.3, 0.3) : typeof d.arc === 'string' && /^late:[1-5]$/.test(d.arc) ? d.arc : 0;
        return {
          n: n, id: d.id, name: str(d.name, d.id).slice(0, 24), tla: tla, num: String(d.num != null ? d.num : n + 1).slice(0, 3),
          team: t.id, teamName: str(t.name, ''), colors: colors, color: hexOr(d.color, hexOr(t.color, towerColour(colors))),
          tcam: hexOr(d.tcam, mate ? '#E8FF2A' : '#111111'), form: ['plush', 'chrome', 'suited'].indexOf(d.form) >= 0 ? d.form : 'suited',
          pace: clamp(numOr(d.pace, 1), 0.9, 1.02), start: clamp(numOr(d.start, 220), 100, 600),
          aggression: clamp01(d.aggression, 0.5), defend: clamp01(d.defend, 0.5), consistency: clamp01(d.consistency, 0.9), tow: clamp01(d.tow, 0.5),
          arc: arc, shift: { up: clamp(numOr(sh.up, 0.975), 0.85, 1), blip: clamp01(sh.blip, 1), coast: !!sh.coast },
          // the roster's words and looks (the world's data, read by the views; the race never reads them): the agent's
          // family, what it is in a line, its voice, its radio lines, its helmet's colour
          row: str(d.row, d.id), family: str(d.family, '').slice(0, 24), look: str(d.look, '').slice(0, 120), voice: str(d.voice, '').slice(0, 160),
          radio: Array.isArray(d.radio) ? d.radio.filter(function (x) { return typeof x === 'string' && x.trim(); }).slice(0, 12).map(function (x) { return x.trim().slice(0, 120); }) : [],
          helmet: hexOr(d.helmet, null),
        };
      }
      function cornerZones(T) {
        var L = T.L, out = [];
        (Array.isArray(T.corners) ? T.corners : []).forEach(function (c) {
          if (!c || typeof c.d0 !== 'number' || typeof c.d1 !== 'number') return;
          out.push({ id: String(c.id || ('T' + c.n)), s: c.d0 - K.zoneIn, e: c.d1 + K.zoneOut });
        });
        out.sort(function (a, b) { return a.s - b.s; });
        var m = [];
        out.forEach(function (z) { var p = m[m.length - 1]; if (p && z.s <= p.e) { p.e = max(p.e, z.e); p.id += '-' + z.id; } else m.push({ id: z.id, s: z.s, e: z.e }); });
        return m.map(function (z) { return { id: z.id, d0: wrapL(L, z.s), d1: wrapL(L, z.e) }; });
      }

      /* ------------------------------------------- rules: inside the sim's step (INTERFACES.md 2.5, 2.8) -- */
      // Every per-race value lives on S (S.race, the cars' R fields), so a snapshot, a restore and a replay see all of
      // it; the factory closes over T and cfg only. What the returned object keeps is scratch, rewritten each step.
      function rules(T, cfg, aux) {
        aux = aux || {};
        var L = T.L, GATES = cfg.gates, GL = L / GATES, NG = cfg.laps * GATES;
        var line = aux.line || null, placeFn = typeof aux.place === 'function' ? aux.place : null;
        var LG = cfg.lights, LGAP = max(1, Math.round(LG.gap * 120)), LGRID = Math.round(LG.gridHold * 120);
        // the corners (a pass's corner and the side it was on) and the braking zones (GpAI.zonesOf on the pace-1 profile,
        // aux.zones: a pass on a straight is named after the braking zone it leads into)
        var CORN = Array.isArray(T.corners) ? T.corners : [], ZL = aux.zones && Array.isArray(aux.zones.list) ? aux.zones.list : [];
        var TUN = Array.isArray(cfg.tunnels) ? cfg.tunnels : [];
        function cornerAt(d) {
          for (var k = 0; k < CORN.length; k++) {
            var c = CORN[k], a = c.d0 - K.cornerPre;
            if (wrapL(L, d - a) <= c.d1 - c.d0 + K.cornerPre + K.cornerPost) return { id: String(c.id), dir: c.dir || 1, apex: c.apex, inC: true };
          }
          // (on a straight: the braking zone it leads into, else the next corner)
          var best = null, bd = 1e9;
          for (k = 0; k < ZL.length; k++) { var z = ZL[k], dz = wrapL(L, z.b0 * T.ds - d); if (z.corner && dz < bd) { bd = dz; best = { id: z.corner, dir: z.side, apex: null, inC: false }; } }
          if (best) return best;
          for (k = 0; k < CORN.length; k++) { var c2 = CORN[k], dc = wrapL(L, c2.d0 - d); if (dc < bd) { bd = dc; best = { id: String(c2.id), dir: c2.dir || 1, apex: null, inC: false }; } }
          return best || { id: '', dir: 1, apex: null, inC: false };
        }
        return function (S) {
          var prevPos = [], cmpS = null;
          function byPlace(a, b) {
            var A = cmpS.cars[a], B = cmpS.cars[b], qa = cmpS.race.cars[a], qb = cmpS.race.cars[b];
            if (A.fin && B.fin) return qa.fo - qb.fo;
            if (A.fin) return -1; if (B.fin) return 1;
            var ka = min(A.prog, (qa.g + 1) * GL), kb = min(B.prog, (qb.g + 1) * GL);
            return kb - ka || a - b;
          }
          function ev(S, o) { S.events.push(o); }
          function init(S) {
            var R = S.race;
            if (R && R.v === 1) return;
            if (!R || typeof R !== 'object') R = S.race = {};
            var N = S.cars.length;
            R.v = 1; R.ps = 0; R.lights = 0; R.hold = -1; R.goT = null; R.winner = -1; R.winT = null; R.endT = null; R.reason = null;
            R.finishers = 0; R.order = []; R.changes = { total: 0, away: 0 }; R.pend = []; R.fast = null; R.assisted = false; R.aided = false;
            // (M2) the start's phase ('rev', 'lights', 'hold', 'out'), the passes waiting out their 2 s (pp), the raw swaps
            // (sw: switchbacks), the give-back requests (gb), the nemesis, side by side pairs (sb), the passes and the
            // earned ones so far
            R.sp = 'rev'; R.pp = []; R.sw = []; R.gb = []; R.nem = -1; R.sb = {}; R.passes = 0; R.earned = 0;
            R.gt = []; for (var g = 0; g <= NG; g++) R.gt.push(-1);
            R.det = cfg.flaps.map(function () { return { t: -1, n: -1 }; });
            R.cars = []; R.secB = [null, null, null];
            for (var n = 0; n < N; n++) {
              var c = S.cars[n], tg = [];
              for (g = 0; g <= NG; g++) tg.push(-1);
              R.cars.push({ g: floor(c.prog / GL), pp: c.prog, p0: c.prog, si: 0, fo: 0, fz: false, fl: false, react: -1, jump: false, lg: 0, lgHeld: false, lgOn: false, bog: false, tg: tg, zl: cfg.limits.zones.map(function () { return -1; }),
                arm: false, armed: false, armGo: false, early: 0, earlyT: -1, jumpT: -1, mode: '', gas: false, twT: -1, stT: -1, offT: -1, tw: false, twA: -1, twC: 0, cr: false, crG: 1, tn: -1, passes: 0, earned: 0, bk: false, bkD: -1, bkT: -1, secB: [null, null, null], am: null });
              c.held = true; c.flap = { armed: false, open: false, zone: -1 }; c.creep = 0; c.lc = 0; c.lastPass = null;
              c.lap = 0; c.gate = 0; c.missed = false; c.lapT0 = 0; c.last = null; c.best = null; c.sectors = [null, null, null]; c.deleted = false;
              c.strikes = 0; c.penalty = 0; c.place = n + 1; c.fin = false; c.finT = null; c.raceT = null; c.stuck = 0; c.off = 0; c.recovers = 0;
              R.order.push(n);
            }
            S.phase = 'grid'; S.go = false;
            places(S);
            ev(S, { e: 'grid', t: S.t });
            ev(S, { e: 'rev', t: S.t });
          }
          function holdAll(S, on) { for (var n = 0; n < S.cars.length; n++) S.cars[n].held = on; }
          function lightsOut(S, hold) {
            var R = S.race; S.phase = 'race'; S.go = true; R.lights = -1; R.goT = S.t; R.ps = 0; R.sp = 'out';
            for (var n = 0; n < S.cars.length; n++) { var c = S.cars[n], q = R.cars[n]; c.held = false; c.lapT0 = S.t; q.lg = 1; }
            // the player's car waits for its launch (not on the autopilot, whose AI hands launch as the AI's do, nor with the
            // lights skipped); armed at lights out, it leaves on the release
            var hc = S.human >= 0 ? S.cars[S.human] : null, hq = hc ? R.cars[S.human] : null;
            if (hc && hq) {
              if (cfg.skipLights) hq.lg = 2;
              else if (!hc.auto) { hq.armGo = hq.arm; hq.lgHeld = (+((hc.inp || {}).throttle) || 0) >= K.launchOn; hc.held = true; }
            }
            ev(S, { e: 'go', t: S.t, hold: hold });
          }
          // a car's launch (X29): its reaction (s from lights out; a jump start's is negative), the way it left, whether the
          // player let an armed BRAKE go early before re-arming. M1's react / why / bog are kept beside them for the HUD
          function launch(S, c, q, mode, reaction, why) {
            var R = S.race, inp = c.inp || {};
            q.lg = 2; c.held = false; c.creep = 0; q.mode = mode; q.react = reaction;
            if (mode === 'release' && c.n === S.human && !c.auto && (inp.abrake || inp.asteer)) c.lc = K.lc;
            if (mode === 'held') q.bog = true;
            ev(S, { e: 'launch', t: S.t, car: c.n, reaction: reaction, mode: mode, early: q.early > 0, react: max(0, reaction), why: why || mode, bog: mode === 'held' });
          }
          // before lights out, the player: BRAKE held is armed (the HOLD); in the lights, an armed BRAKE let go is an EARLY
          // with the aids (no penalty, re-arm) and a jump start in Pro (+jumpPen s, the car creeps); revving is never early.
          // The rev phase is free. A throttle press on the grid is the grid's gas (the field answers it: the sound's)
          function arming(S) {
            var R = S.race, n = S.human, c = S.cars[n], q = R.cars[n];
            if (!c || !q || c.auto || cfg.skipLights) return;
            var inp = c.inp || {}, b = (+inp.brake || 0) >= K.armOn, on = (+inp.throttle || 0) >= K.launchOn, aids = !!(inp.abrake || inp.asteer);
            if (on && !q.gas) ev(S, { e: 'grid-gas', t: S.t, car: n, rpm: c.rpm });
            q.gas = on;
            if (q.jump) { if (abs(c.prog - q.p0) > 4) c.creep = 0; return; }
            if (b) { if (!q.arm) { q.arm = true; q.armed = true; } return; }
            if (!q.arm) return;
            q.arm = false;
            if (S.phase !== 'lights') return;
            if (aids) { q.early++; q.earlyT = S.t; ev(S, { e: 'early', t: S.t, car: n, n: q.early }); }
            else {
              q.jump = true; q.jumpT = S.t; c.creep = K.creep; c.penalty += K.jumpPen;
              ev(S, { e: 'jump', t: S.t, car: n, penalty: K.jumpPen });
              ev(S, { e: 'penalty', t: S.t, car: n, seconds: K.jumpPen, total: c.penalty });
            }
          }
          // after lights out, the player's launch: armed at the lights, on the release; not armed, on a throttle press;
          // neither, heldGo s after (a novice is never stranded); a jump start at once
          function getaway(S) {
            var R = S.race, n = S.human, c = n >= 0 ? S.cars[n] : null, q = c ? R.cars[n] : null;
            if (!c || !q) return;
            var inp = c.inp || {}, on = (+inp.throttle || 0) >= K.launchOn, b = (+inp.brake || 0) >= K.armOn;
            if (q.lg === 1 && !c.auto && S.go) {
              var dt = S.t - R.goT, mode = '';
              if (q.jump) mode = 'jump';
              else if (q.armGo) { if (!b) mode = 'release'; }
              else if (on && !q.lgOn && dt > 0) mode = 'press';
              else if (dt >= K.heldGo - 1e-9) mode = 'held';
              if (mode) launch(S, c, q, mode, mode === 'jump' ? q.jumpT - R.goT : dt);
              else c.held = true;
            }
            q.lgOn = on;
          }
          // every other car (and the player's on the autopilot): launched on the first step its BRAKE is under armOn
          function launches(S) {
            var R = S.race;
            for (var n = 0; n < S.cars.length; n++) {
              var c = S.cars[n], q = R.cars[n];
              if (q.lg !== 1 || (n === S.human && !c.auto)) continue;
              c.held = false;
              if ((+((c.inp || {}).brake) || 0) < K.armOn) launch(S, c, q, 'release', S.t - R.goT, 'auto');
            }
          }
          function pre(S, H) {
            init(S);
            var R = S.race, n, c, q;
            if (S.human >= 0 && !S.go) arming(S);
            if (S.phase === 'grid') {
              holdAll(S, true);
              if (cfg.skipLights) lightsOut(S, 0);
              else if (R.ps >= LGRID) { S.phase = 'lights'; R.ps = 0; R.sp = 'lights'; }
            }
            if (S.phase === 'lights') {
              holdAll(S, true);
              var k = min(5, 1 + floor(R.ps / LGAP));
              while (R.lights < k) { R.lights++; ev(S, { e: 'light', t: S.t, n: R.lights }); }
              // the hold, drawn from the race's stream at the step the fifth light comes on
              if (R.lights === 5 && R.hold < 0) { R.hold = LG.hold[0] + (LG.hold[1] - LG.hold[0]) * S.rng.race.next(); R.sp = 'hold'; }
              if (R.hold >= 0 && R.ps * H >= 4 * LGAP * H + R.hold - 1e-9) lightsOut(S, R.hold);
            }
            R.ps++;
            if (S.human >= 0) getaway(S);
            if (S.go) launches(S);
            // a car that moves before lights out is a jump start: noted (the player's in Pro is penalised above)
            if (!S.go) for (n = 0; n < S.cars.length; n++) {
              c = S.cars[n]; q = R.cars[n];
              if (!q.jump && abs(c.prog - q.p0) > K.moved) { q.jump = true; ev(S, { e: 'jump', t: S.t, car: n }); }
            }
            // the player's driving aids: an aided race, tagged aids 'on' (D3, 15 Oct: it counts); the autopilot: an
            // assisted race (the device layer adds the time controls and the debug hooks, R.markAssisted), which never does
            if (S.human >= 0 && S.cars[S.human]) {
              c = S.cars[S.human];
              if (!c.fin && c.inp && S.phase !== 'done') {
                if (c.inp.auto || c.auto) R.assisted = true;
                else if (c.inp.abrake || c.inp.asteer) R.aided = true;
              }
            }
            if (!S.go || !cfg.flaps.length) return;
            // the Flap: opened on a request inside its zone, shut by the brake (and at the zone's end, in post). The player's
            // request made once it is armed, before the zone, is kept and opens it where the zone starts (fix 15 Oct: a
            // press on the lit pill was a lost one-frame edge). With the aids it opens by itself in the zone, flat out and
            // straight (X14: the auto-Flap)
            for (n = 0; n < S.cars.length; n++) {
              c = S.cars[n]; var f = c.flap, inp = c.inp || {}, qf = R.cars[n];
              if (!f.armed) { qf.fl = false; continue; }
              var Z = cfg.flaps[f.zone], inZ = inSpan(L, c.d, Z.from, Z.to);
              var autoF = n === S.human && !c.auto && !!(inp.abrake || inp.asteer) && (+inp.throttle || 0) >= K.flapThr && abs(+inp.steer || 0) <= K.flapSteer && !((+inp.brake || 0) > 0.05);
              if (f.open) { if ((+inp.brake || 0) > K.flapBrake) { f.open = false; f.armed = false; f.zone = -1; qf.fz = false; qf.fl = false; ev(S, { e: 'flap', t: S.t, car: n, zone: Z.id, state: 'closed' }); } }
              else if ((inp.flap || qf.fl || autoF) && !c.fin && inZ) { f.open = true; qf.fl = false; ev(S, { e: 'flap', t: S.t, car: n, zone: Z.id, state: 'open', auto: !!(autoF && !inp.flap && !qf.fl) }); }
              else if (inp.flap && n === S.human && !c.fin && !inZ && !qf.fl) { qf.fl = true; ev(S, { e: 'flap', t: S.t, car: n, zone: Z.id, state: 'set' }); }
            }
          }
          function post(S, H) {
            init(S);
            var R = S.race, N = S.cars.length, n, c, q;
            for (n = 0; n < N; n++) prevPos[n] = S.cars[n].place;
            if (S.go && S.phase !== 'done') for (n = 0; n < N; n++) {
              c = S.cars[n]; q = R.cars[n];
              var pp = q.pp, p = c.prog;
              if (q.react < 0 && !c.held && (+((c.inp || {}).throttle) || 0) >= 0.5) q.react = S.t - R.goT;
              progress(S, c, q, pp, p, H);
              if (!c.fin) { limits(S, c, q); flapZone(S, c, q, pp, p, H); stuck(S, c, q, H); }
              notes(S, c, q);
              q.pp = c.prog;
            } else for (n = 0; n < N; n++) R.cars[n].pp = S.cars[n].prog;
            if (S.phase === 'done') return;
            places(S);
            if (S.go) { overtakes(S, H); passes(S, H); giveBacks(S); sideBySide(S); }
            if (S.phase === 'cooldown') {
              var all = true; for (n = 0; n < N; n++) if (!S.cars[n].fin) { all = false; break; }
              if (all) end(S, 'all', H); else if (S.t + H >= R.endT - 1e-9) end(S, 'time', H);
            }
          }
          // the time the car's progress crossed `at` inside this step (S.t is the step's start; the move is done)
          function tAt(S, pp, p, at, H) { return S.t + H * (p > pp ? clamp((at - pp) / (p - pp), 0, 1) : 1); }
          // a sector's best: { all: the field's fastest so far, own: the car's } (a deleted lap counts for neither)
          function secBest(S, c, q, s, tm) {
            var R = S.race, i = s - 1, ok = !c.deleted && isFinite(tm) && tm > 0;
            var all = ok && (R.secB[i] == null || tm < R.secB[i] - 1e-9), own = ok && (q.secB[i] == null || tm < q.secB[i] - 1e-9);
            if (all) R.secB[i] = tm; if (own) q.secB[i] = tm;
            return { all: all, own: own };
          }
          function progress(S, c, q, pp, p, H) {
            var R = S.race, g = floor(p / GL);
            if (g === q.g + 1) {
              q.g = g; c.missed = false;
              if (g >= 0 && g <= NG) { var tc = tAt(S, pp, p, g * GL, H); if (R.gt[g] < 0) R.gt[g] = tc; q.tg[g] = tc; }
            } else if (g < q.g) q.g = g;
            else if (g > q.g + 1 && !c.missed) { c.missed = true; ev(S, { e: 'missed', t: S.t, car: c.n, gate: q.g + 1 }); }
            // the sectors of this lap
            if (!c.fin && cfg.sectors.length === 2) {
              var base = c.lap * L;
              while (q.si < 2 && p >= base + cfg.sectors[q.si] && pp < base + cfg.sectors[q.si] && q.g >= c.lap * GATES) {
                var ts = tAt(S, pp, p, base + cfg.sectors[q.si], H), sTime = ts - c.lapT0 - (q.si ? c.sectors[0] : 0);
                c.sectors[q.si] = sTime; q.si++;
                ev(S, { e: 'sector', t: S.t, car: c.n, lap: c.lap + 1, s: q.si, time: sTime, best: secBest(S, c, q, q.si, sTime) });
              }
            }
            var done = floor(max(0, q.g) / GATES);
            if (done > c.lap && !c.fin) {
              var tl = tAt(S, pp, p, done * L, H), lt = tl - c.lapT0;
              if (cfg.sectors.length === 2 && c.sectors[0] != null && c.sectors[1] != null) {
                c.sectors[2] = lt - c.sectors[0] - c.sectors[1];
                ev(S, { e: 'sector', t: S.t, car: c.n, lap: done, s: 3, time: c.sectors[2], best: secBest(S, c, q, 3, c.sectors[2]) });
              }
              c.lap = done; c.last = lt;
              if (!c.deleted && (c.best == null || lt < c.best)) c.best = lt;
              if (!c.deleted && (!R.fast || lt < R.fast.time)) R.fast = { n: c.n, time: lt, lap: done };
              // (the player's lap carries the aids' share of it: the steering and the braking the assists added, X21)
              var le = { e: 'lap', t: S.t, car: c.n, lap: done, time: lt, best: c.best, deleted: c.deleted };
              if (c.n === S.human && c.as) { le.aid = { steer: c.as.ls > 0 ? c.as.la / (c.as.ls + c.as.la) : 0, brake: c.as.lb > 0 ? c.as.lba / c.as.lb : 0 }; c.as.la = c.as.ls = c.as.lb = c.as.lba = 0; }
              ev(S, le);
              c.lapT0 = tl; c.deleted = false; q.si = 0;
              c.sectors = [null, null, null];
              // home: the full distance, or (the chequered flag) the first line crossing after the winner's
              if (done >= cfg.laps || (cfg.chequer && R.winner >= 0 && tl >= R.winT)) finish(S, c, q, tl);
              else if (done === cfg.laps - 1) ev(S, { e: 'finalLap', t: S.t, car: c.n });
              // the nemesis (X15): at the player's first line crossing, the car nearest in time on the road, within
              // nemesisWin s (ahead: its own crossing; behind: its distance at its speed). Narrative only: no help
              if (c.n === S.human && done === 1 && R.nem < 0) nemesis(S, c, tl);
            } else if (done < c.lap && !c.fin) c.lap = max(c.lap, done);
            c.gate = max(0, q.g - c.lap * GATES);
          }
          function nemesis(S, me, tl) {
            var R = S.race, best = -1, bg = 1e9;
            for (var m = 0; m < S.cars.length; m++) {
              if (m === me.n) continue;
              var o = S.cars[m], qo = R.cars[m], gap;
              if (o.fin) continue;
              if (qo.tg[GATES] >= 0) gap = tl - qo.tg[GATES];
              else gap = (me.prog - o.prog) / max(10, o.v);
              gap = abs(gap);
              var lp = o.lastPass, passedMe = lp && lp.by === m ? 0 : 1;
              var key = gap + passedMe * 1e-3 + (1 - ((o.spec || {}).aggression || 0)) * 1e-4;
              if (gap <= K.nemesisWin && key < bg) { bg = key; best = m; }
            }
            if (best >= 0) { R.nem = best; ev(S, { e: 'nemesis', t: S.t, car: best, gap: bg }); }
          }
          function finish(S, c, q, tc) {
            var R = S.race, gapAhead = null, gapBehind = null;
            // (X27: the gaps at the line. Ahead: the previous finisher's interpolated crossing. Behind: the car next in the
            // order, timed at the last gate both have passed: a timing loop's fact, never a guess)
            if (R.finishers > 0) for (var m = 0; m < S.cars.length; m++) if (S.cars[m].fin && R.cars[m].fo === R.finishers) gapAhead = tc - S.cars[m].finT;
            var oi = R.order.indexOf(c.n), nb = oi >= 0 && oi + 1 < R.order.length ? R.order[oi + 1] : -1;
            if (nb >= 0 && !S.cars[nb].fin) {
              var qb = R.cars[nb];
              for (var g = min(q.g, NG); g >= max(0, q.g - GATES); g--) if (qb.tg[g] >= 0 && q.tg[g] >= 0) { gapBehind = qb.tg[g] - q.tg[g]; break; }
            }
            c.fin = true; c.finT = tc; c.raceT = tc - R.goT; R.finishers++; q.fo = R.finishers;
            if (c.flap.open) ev(S, { e: 'flap', t: S.t, car: c.n, zone: cfg.flaps[c.flap.zone].id, state: 'closed' });
            c.flap.armed = false; c.flap.open = false; c.flap.zone = -1; c.stuck = 0;
            ev(S, { e: 'finish', t: S.t, car: c.n, place: R.finishers, time: c.raceT, gapAhead: gapAhead, gapBehind: gapBehind, behind: nb });
            if (R.winner < 0) { R.winner = c.n; R.winT = tc; R.endT = tc + cfg.endAfter; S.phase = 'cooldown'; }
          }
          // the end: the order and every car's distance frozen as they are (the cars may drive on for the picture)
          function end(S, reason, H) {
            var R = S.race; S.phase = 'done'; R.reason = reason; R.doneT = S.t + H;
            for (var n = 0; n < S.cars.length; n++) R.cars[n].pf = S.cars[n].prog;
            ev(S, { e: 'end', t: S.t, reason: reason });
          }
          // track limits: all four wheels past the white line and the kerb, inside a corner's zone, once a zone a lap
          function limits(S, c, q) {
            var Z = cfg.limits.zones; if (!Z.length) return;
            if (abs(c.lat) - K.half <= hwOf(T, c.d) + trackKerb(T)) return;
            for (var zi = 0; zi < Z.length; zi++) {
              if (q.zl[zi] === c.lap || !inSpan(L, c.d, Z[zi].d0, Z[zi].d1)) continue;
              q.zl[zi] = c.lap; c.strikes++; c.deleted = true; q.stT = S.t;
              ev(S, { e: 'limits', t: S.t, car: c.n, corner: Z[zi].id, strikes: c.strikes });
              if (c.strikes % cfg.limits.strikes === 0 && cfg.limits.penalty > 0) {
                c.penalty += cfg.limits.penalty;
                ev(S, { e: 'penalty', t: S.t, car: c.n, seconds: cfg.limits.penalty, total: c.penalty });
              }
            }
          }
          // the Flap's detection points (a timing loop: the gap to whichever car crossed it last) and the zone's end
          function flapZone(S, c, q, pp, p, H) {
            var F = cfg.flaps; if (!F.length) return;
            var R = S.race, base = c.lap * L;
            for (var zi = 0; zi < F.length; zi++) {
              var at = base + F[zi].det;
              if (!(pp < at && p >= at)) continue;
              var tc = tAt(S, pp, p, at, H), last = R.det[zi];
              if (c.lap + 1 >= cfg.flapFromLap && last.n >= 0 && last.n !== c.n && tc - last.t <= K.flapWindow + 1e-9) {
                if (c.flap.open) ev(S, { e: 'flap', t: S.t, car: c.n, zone: F[c.flap.zone].id, state: 'closed' });
                c.flap.armed = true; c.flap.open = false; c.flap.zone = zi; q.fz = false; q.fl = false;
                ev(S, { e: 'flap', t: S.t, car: c.n, zone: F[zi].id, state: 'armed' });
              }
              last.t = tc; last.n = c.n;
            }
            var f = c.flap;
            if (f.armed) {
              var Zf = F[f.zone];
              if (inSpan(L, c.d, Zf.from, Zf.to)) { if (!q.fz) { q.fz = true; ev(S, { e: 'flap', t: S.t, car: c.n, zone: Zf.id, state: 'ready' }); } }
              else if (q.fz) {
                if (f.open) ev(S, { e: 'flap', t: S.t, car: c.n, zone: Zf.id, state: 'closed' });
                f.armed = false; f.open = false; f.zone = -1; q.fz = false; q.fl = false;
              }
            }
          }
          // stuck (under 2 m/s while racing) for more than recoverAfter s: back on the line where it is, at 10 m/s
          function stuck(S, c, q, H) {
            c.stuck = abs(c.v) < K.stuckV ? c.stuck + H : 0;
            c.off = abs(c.lat) > hwOf(T, c.d) + 1 ? c.off + H : 0;
            if (c.stuck <= cfg.recoverAfter) return;
            var d = c.d, lat = line && line.lat && T.idx ? +line.lat[T.idx(d)] || 0 : 0;
            lat = clearLat(S, c, d, lat);
            if (typeof S.putOn === 'function') S.putOn(c.n, d, lat, K.recoverV);
            else if (placeFn) placeFn(S, c.n, d, lat, K.recoverV);
            else putBack(c, d, lat, K.recoverV);
            c.stuck = 0; c.off = 0; c.recovers++;
            ev(S, { e: 'recover', t: S.t, car: c.n });
          }
          // the notes a pass's kind and the sound read: the last tow or open Flap, the last time off the road or on a
          // barrier; and the events: the tow (in / out), a crest and its landing, a covered stretch (in / out)
          // a defence (the picker's, gp.js): an attack that made its move (the pull-out step came) ends; held when the
          // attacker is still behind its target. One event an attack: { car: the defender, by, held, corner, lap }
          function defence(S, c, q) {
            var m = c.mind, on = !!(m && m.state === 'ATTACK' && m.target >= 0 && !c.fin), A = q.am;
            if (A && (!on || m.target !== A.target)) {
              q.am = null;
              var X = S.cars[A.target];
              if (A.moved && X && !X.fin && !c.fin) ev(S, { e: 'defence', t: S.t, car: A.target, by: c.n, held: !(c.place < X.place), corner: A.corner, lap: X.lap + 1 });
              A = null;
            }
            if (on && !A) A = q.am = { target: m.target, corner: m.corner || '', moved: false };
            if (A && m.actStep >= 0 && S.steps >= m.actStep) A.moved = true;
          }
          function notes(S, c, q) {
            var R = S.race, dr = c.draft || 0;
            if (dr > 0.25 || (c.flap && c.flap.open)) q.twT = S.t;
            if (c.off > 0 || c.wall > 0.3) q.offT = S.t;
            // (the braking point: where the brake went on at speed, for a pass's margin, "braked 12 m later")
            var bOn = (c.brk || 0) >= 0.3 && c.v > 25;
            if (bOn && !q.bk) { q.bkD = c.prog; q.bkT = S.t; }
            q.bk = (c.brk || 0) >= 0.3;
            defence(S, c, q);
            if (c.fin) return;
            // (in after towHold s over towIn, out after towHold s under towOut: one event a tow, not one a flicker)
            var flip = q.tw ? dr < K.towOut : dr >= K.towIn;
            q.twC = flip ? (q.twC || 0) + S.H : 0;
            if (q.twC >= K.towHold - 1e-9) {
              q.twC = 0; q.tw = !q.tw;
              if (q.tw) { q.twA = c.ahead; ev(S, { e: 'tow', t: S.t, a: c.n, b: c.ahead, state: 'in' }); }
              else ev(S, { e: 'tow', t: S.t, a: c.n, b: q.twA, state: 'out' });
            }
            var ld = c.load == null ? 1 : c.load;
            if (!q.cr && ld < K.crestG) { q.cr = true; q.crG = ld; ev(S, { e: 'crest', t: S.t, car: c.n, g: ld }); }
            else if (q.cr) { if (ld < q.crG) q.crG = ld; if (ld > K.landG) { q.cr = false; ev(S, { e: 'land', t: S.t, car: c.n, g: ld, low: q.crG }); } }
            if (TUN.length) {
              var tn = -1; for (var k = 0; k < TUN.length; k++) if (inSpan(L, c.d, TUN[k].from, TUN[k].to)) { tn = k; break; }
              if (tn !== q.tn) { if (q.tn >= 0) ev(S, { e: 'tunnel', t: S.t, car: c.n, id: TUN[q.tn].id, state: 'out' }); if (tn >= 0) ev(S, { e: 'tunnel', t: S.t, car: c.n, id: TUN[tn].id, state: 'in' }); q.tn = tn; }
            }
          }
          // (the line's lateral, or whichever of it and the two sides of the road is clearest of cars within 40 m)
          function clearLat(S, c, d, lat) {
            var hw = hwOf(T, d) - 1.6, opts = [lat, hw, -hw], best = lat, bestGap = -1;
            for (var o = 0; o < 3; o++) {
              var gap = 1e9;
              for (var m = 0; m < S.cars.length; m++) {
                if (m === c.n) continue;
                var b = S.cars[m], dd = T.rel ? T.rel(b.d, d) : wrapL(L, b.d - d + L / 2) - L / 2;
                if (abs(dd) < 40) gap = min(gap, abs(b.lat - opts[o]) + abs(dd) * 0.1);
              }
              if (gap > bestGap + 0.5) { bestGap = gap; best = opts[o]; }
            }
            return best;
          }
          // (only for a sim without its own placement, S.putOn(n, d, lat, v): the test stand-ins)
          function putBack(c, d, lat, v) {
            var P = T.posAt(d, lat, 0, {}), h = typeof T.headingAt === 'function' ? T.headingAt(d) : c.h;
            c.x = c.px = P.x; c.y = c.py = P.y; c.z = c.pz = P.z;
            c.h = c.ph = c.h + angDiff(h, c.h); c.v = v; c.vlat = 0; c.r = 0;
            c.d = c.dPrev = d; c.lat = lat; if (T.idx) c.i = T.idx(d);
          }
          // places: the finished in the order they came home, then everyone by legitimate progress
          function places(S) {
            var R = S.race, o = R.order; cmpS = S;
            if (o.length !== S.cars.length) { o.length = 0; for (var i = 0; i < S.cars.length; i++) o.push(i); }
            o.sort(byPlace);
            for (var j = 0; j < o.length; j++) S.cars[o[j]].place = j + 1;
          }
          // overtakes: a swap in the running order, held for 1 s; away from the start once the passer has 1,000 m (M1's raw
          // count). The same swap also starts a pass (X24), which waits out passHold2 s and is then classified
          function overtakes(S, H) {
            var R = S.race, N = S.cars.length, a, b, A, B;
            for (a = 0; a < N; a++) {
              A = S.cars[a]; if (A.fin || A.place >= prevPos[a]) continue;
              for (b = 0; b < N; b++) {
                if (b === a) continue; B = S.cars[b];
                if (B.fin || !(prevPos[b] < prevPos[a] && B.place > A.place)) continue;
                // (taking back a place lost less than 1 s ago is no pass at all: the order is as it was)
                var back = false;
                for (var k = R.pend.length - 1; k >= 0; k--) if (R.pend[k].a === b && R.pend[k].b === a) { R.pend.splice(k, 1); back = true; }
                // (and a place taken back within the pass's 2 s: the pass was never made)
                var back2 = false;
                for (k = R.pp.length - 1; k >= 0; k--) if (R.pp[k].a === b && R.pp[k].b === a) { R.pp.splice(k, 1); back2 = true; }
                // (the raw swap, for switchbacks: a place lost to this car a moment ago and taken back)
                var sw = false;
                for (k = R.sw.length - 1; k >= 0; k--) if (R.sw[k].a === b && R.sw[k].b === a && S.t - R.sw[k].t <= K.switchT) { sw = true; break; }
                R.sw.push({ a: a, b: b, t: S.t }); if (R.sw.length > K.pendMax) R.sw.shift();
                if (!back2) {
                  var cn = cornerAt(A.d), ins = (A.lat - B.lat) * cn.dir >= 0, qa0 = R.cars[a], qb0 = R.cars[b];
                  // (the margin: how much later the passer braked for this corner, metres; the Flap's speed over the car)
                  var mg = qa0.bkT >= 0 && qb0.bkT >= 0 && S.t - qa0.bkT <= K.passWin + 2 && S.t - qb0.bkT <= K.passWin + 2 ? qa0.bkD - qb0.bkD : 0;
                  var fk = A.flap && A.flap.open ? (A.v - B.v) * 3.6 : 0;
                  R.pp.push({ a: a, b: b, t: S.t, d: A.d, lap: A.lap + 1, corner: cn.id, inC: cn.inC, inside: ins, sw: sw, mg: mg > 0 && mg < 80 ? mg : 0, fk: fk > 0 ? fk : 0 });
                  if (R.pp.length > K.pendMax) R.pp.shift();
                }
                if (back) continue;
                R.pend.push({ a: a, b: b, t: S.t, d: A.d, lap: A.lap + 1 });
                if (R.pend.length > K.pendMax) R.pend.shift();
              }
            }
            for (var p = R.pend.length - 1; p >= 0; p--) {
              var P = R.pend[p]; A = S.cars[P.a]; B = S.cars[P.b];
              if (A.place > B.place || (B.fin && !A.fin)) { R.pend.splice(p, 1); continue; }
              if (S.t + H - P.t >= K.passHold - 1e-9) {
                R.pend.splice(p, 1); R.changes.total++;
                if (A.prog > K.passAway) R.changes.away++;
                ev(S, { e: 'overtake', t: S.t, car: P.a, passed: P.b, d: P.d, lap: P.lap });
              }
            }
          }
          // a pass's kind (X24, the-race 4.6): cut (a strike in the move) > contact (the two touched in it) > gift (the other
          // car's mistake, or it was off the road or on a barrier, just before) > switchback (a place lost to it moments ago,
          // taken back) > dive (in a corner, on the inside) > outside (in a corner, on the outside) > tow (on a straight).
          // Earned: dive, tow, switchback, outside
          function kindOf(S, P, A, B, qa, qb) {
            var N = S.cars.length, i = min(P.a, P.b), j = max(P.a, P.b), lc = S.pairT ? S.pairT[i * N + j] - 0.5 : -1;
            if (qa.stT >= 0 && qa.stT >= P.t - K.passWin) return 'cut';
            if (lc >= 0 && lc >= P.t - K.passWin) return 'contact';
            var mt = B.ai && B.ai.mt != null ? +B.ai.mt : -1;
            if ((mt >= 0 && mt >= P.t - K.gift) || (qb.offT >= 0 && qb.offT >= P.t - K.gift)) return 'gift';
            if (P.sw) return 'switchback';
            if (P.inC) return P.inside ? 'dive' : 'outside';
            return 'tow';
          }
          function passes(S, H) {
            var R = S.race;
            for (var p = R.pp.length - 1; p >= 0; p--) {
              var P = R.pp[p], A = S.cars[P.a], B = S.cars[P.b];
              if (A.place > B.place || (B.fin && !A.fin)) { R.pp.splice(p, 1); continue; }
              if (S.t + H - P.t < K.passHold2 - 1e-9) continue;
              R.pp.splice(p, 1);
              var qa = R.cars[P.a], qb = R.cars[P.b], kind = kindOf(S, P, A, B, qa, qb), earned = kind === 'dive' || kind === 'tow' || kind === 'switchback' || kind === 'outside';
              R.passes++; qa.passes++; if (earned) { R.earned++; qa.earned++; }
              B.lastPass = { by: P.a, corner: P.corner, kind: kind, lap: P.lap, t: S.t };
              ev(S, { e: 'pass', t: S.t, car: P.a, passed: P.b, corner: P.corner, kind: kind, earned: earned, lap: P.lap, d: P.d, at: P.t, margin: P.mg || 0, flapKmh: P.fk || 0 });
              if (kind === 'cut') { R.gb.push({ a: P.a, b: P.b, t0: S.t }); ev(S, { e: 'giveBack', t: S.t, car: P.a, passed: P.b, state: 'asked' }); }
            }
          }
          // GIVE IT BACK (X24): a place gained by cutting is handed back within giveBack s, or costs giveBackPen s
          function giveBacks(S) {
            var R = S.race;
            for (var g = R.gb.length - 1; g >= 0; g--) {
              var G = R.gb[g], A = S.cars[G.a], B = S.cars[G.b];
              if (A.place > B.place) { R.gb.splice(g, 1); ev(S, { e: 'giveBack', t: S.t, car: G.a, passed: G.b, state: 'given' }); continue; }
              if (S.t - G.t0 >= K.giveBack - 1e-9) {
                R.gb.splice(g, 1); A.penalty += K.giveBackPen;
                ev(S, { e: 'giveBack', t: S.t, car: G.a, passed: G.b, state: 'penalty' });
                ev(S, { e: 'penalty', t: S.t, car: G.a, seconds: K.giveBackPen, total: A.penalty });
              }
            }
          }
          // side by side through a corner (the picker's): two cars overlapping alongside for sbsMin s or more
          function sideBySide(S) {
            var R = S.race, N = S.cars.length, sb = R.sb;
            for (var a = 0; a < N; a++) {
              var A = S.cars[a]; if (A.fin) continue;
              for (var b = a + 1; b < N; b++) {
                var B = S.cars[b], key = a * 32 + b, on = !B.fin && abs(T.rel(B.d, A.d)) < 5 && abs(A.lat - B.lat) < K.sbsLat, P = sb[key];
                if (on) {
                  if (!P) P = sb[key] = { t0: S.t, corner: '' };
                  if (!P.corner) { var cn = cornerAt(A.d); if (cn.inC) P.corner = cn.id; }
                } else if (P) {
                  var dur = S.t - P.t0; delete sb[key];
                  if (dur >= K.sbsMin && P.corner) ev(S, { e: 'sideBySide', t: S.t, a: a, b: b, corner: P.corner, dur: dur });
                }
              }
            }
          }
          if (S && S.cars && S.cars.length) init(S);
          return { pre: pre, post: post };
        };
      }

      /* -------------------------------------------------- the race: one composition root (INTERFACES.md 2.8) -- */
      function race(mods, T, G, o) {
        o = o || {};
        var GpSim = mods && mods.GpSim, GpAI = mods && mods.GpAI;
        if (!GpSim || typeof GpSim.create !== 'function') throw new Error('Grand Prix: the sim (gp-sim.js) is not in this runtime');
        if (!GpAI || typeof GpAI.line !== 'function') throw new Error('Grand Prix: the drivers (gp-ai.js) are not in this runtime');
        var warn = typeof o.warn === 'function' ? o.warn : function () {};
        var cfg = read(G, T, warn), seed = (numOr(o.seed, 1) >>> 0) || 1;
        if (o.laps != null) cfg.laps = clamp(Math.round(numOr(o.laps, cfg.laps)), 1, 5);
        // the rev phase's length before the first red light (X29, D5: the page's: 3.0 s the first race, 1.2 s a race again,
        // 2.0 s after a skip); none: the world's lights.gridHold (1.5 s)
        if (o.rev != null) cfg.lights.gridHold = clamp(numOr(o.rev, cfg.lights.gridHold), 0, 10);
        cfg.skipLights = !!(o.skipLights || (o.demo && o.skipLights !== false));
        var demo = !!o.demo, youId = demo ? null : (o.you === undefined ? cfg.you : o.you);
        if (youId != null && !cfg.all.some(function (s) { return s.id === youId; })) { warn('Grand Prix: no driver "' + youId + '": spectating'); youId = null; }
        var P = GpSim.CAR;
        // the line (M3 bakes it at publish into gp.line) and the pace-1 profile on it
        var line = o.line || GpAI.line(T, { iterations: numOr(o.lineIterations, 600), margin: 1.2, baked: typeof G.line === 'string' ? G.line : null });
        var prof = GpAI.profile(T, line, GpSim, P, { pace: 1, flap: false });
        var lapModel = typeof GpAI.lapTime === 'function' ? GpAI.lapTime(T, line, prof) : null;
        // the field: solo is one car; otherwise the world's field, the player's driver always in it
        var pool = cfg.specs.slice();
        if (youId != null && !pool.some(function (s) { return s.id === youId; })) pool[pool.length - 1] = cfg.all.filter(function (s) { return s.id === youId; })[0];
        if (o.solo) pool = [cfg.all.filter(function (s) { return s.id === (youId != null ? youId : cfg.all[0].id); })[0]];
        // the grid: 'quali' sorts by the lap model over the driver's pace plus N(0, 0.25 s) from its own stream
        // (drawn before the sim exists, from GpSim.stream(seed, 0x47), not the race's stream)
        var order;
        if (Array.isArray(cfg.grid) && !o.solo) {
          var ids = cfg.grid; order = pool.slice().sort(function (a, b) { var ia = ids.indexOf(a.id), ib = ids.indexOf(b.id); return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib) || a.n - b.n; });
        } else {
          var gs = GpSim.stream(seed, 0x47), base = lapModel || 89;
          var keyed = pool.map(function (s) { var u1 = max(1e-12, gs.next()), u2 = gs.next(); return { s: s, k: base / s.pace + 0.25 * sqrt(-2 * Math.log(u1)) * cos(TAU * u2) }; });
          keyed.sort(function (a, b) { return a.k - b.k || a.s.n - b.s.n; });
          order = keyed.map(function (x) { return x.s; });
        }
        // the player's grid slot (D4, the owner 15 Oct): the session's rule (the first race from the back of the grid,
        // later ones from the last finish + 3, a dare from the sender's slot) is the page's; here o.gridSlot (1-based)
        // only moves the player's car to that slot, every other car keeping its order. None: the order above (M1)
        var gridSlot = null;
        if (youId != null && !o.solo && o.gridSlot != null && isFinite(+o.gridSlot)) {
          var at = order.findIndex(function (s) { return s.id === youId; });
          if (at >= 0) { var mine = order.splice(at, 1)[0]; gridSlot = clamp(Math.round(+o.gridSlot), 1, order.length + 1); order.splice(gridSlot - 1, 0, mine); }
        }
        var specs = order.map(function (s, i) { var c = copy(s); c.n = i; c.cut = s.n; return c; });
        var human = youId == null ? -1 : specs.findIndex(function (s) { return s.id === youId; });
        // the CLUB field (D4's pace fallback, pre-approved and OFF: switched on only if the measured "everyone has a
        // race" check fails): every agent at K.club of its pace, the run tagged field 'club'
        var field = (o.field || cfg.fieldPace) === 'club' ? 'club' : 'real';
        if (field === 'club') specs.forEach(function (s, i) { if (i !== human) s.pace = clamp(s.pace * K.club, 0.9, 1.02); });
        cfg.specs = specs; cfg.field = specs.length;
        // slot k (1-based) at d = L - 8k, the odd slots on the right
        var grid = specs.map(function (s, i) { var k = i + 1; return { d: wrapL(T.L, T.L - cfg.slot * k), lat: k % 2 ? cfg.slotLat : -cfg.slotLat }; });
        var driver = typeof GpAI.driver === 'function' ? GpAI.driver(T, line, prof, GpSim, specs, { laps: cfg.laps, car: P, pack: cfg.pack }) : null;
        var place = typeof GpSim.place === 'function' ? GpSim.place : null;
        // (the braking zones the AI races by, for the rules' corner names: the driver's own when it has them)
        var zones = driver && driver.zones ? driver.zones : typeof GpAI.zonesOf === 'function' ? GpAI.zonesOf(T, line, prof) : null;
        var S = GpSim.create(T, {
          seed: seed, specs: specs, human: human, car: P, grid: grid,
          aid: line && prof ? { lat: line.lat, v: prof, ceil: GpAI.profile(T, line, GpSim, P, { pace: 1, ceiling: true }) } : null,
          driver: driver, rules: rules(T, cfg, { line: line, place: place, zones: zones }),
        });
        var started = false, auto = !!o.autopilot, focusN = null, helped = !!(o.autopilot);
        var assists = { brake: !!(o.assists && o.assists.brake), steer: !!(o.assists && o.assists.steer) };
        var gearbox = o.gearbox === 'manual' || o.gearbox === 'auto' ? o.gearbox : cfg.gearbox;
        if (o.autoStart || demo) started = true;
        // the player's command as the sim takes it: the assists and the gearbox from the race's settings unless the
        // device layer says, and the AI's hands (the auto bit) on the autopilot and once the car is home
        var lastIn = {}, sentAuto = null;
        function compose(inp) {
          var c = S.cars[human];
          return {
            steer: clamp(+inp.steer || 0, -1, 1), throttle: clamp(+inp.throttle || 0, 0, 1), brake: clamp(+inp.brake || 0, 0, 1),
            up: !!inp.up, down: !!inp.down, flap: !!inp.flap,
            manual: inp.manual != null ? !!inp.manual : gearbox === 'manual',
            abrake: inp.abrake != null ? !!inp.abrake : assists.brake, asteer: inp.asteer != null ? !!inp.asteer : assists.steer,
            analog: !!inp.analog, touch: !!inp.touch,
            auto: !!(auto || inp.auto || (c && c.fin)),
          };
        }
        function send(inp) { var x = compose(inp); sentAuto = x.auto; S.setInput(x); }
        // (no device layer calls setInput in Node: the autopilot and the finish still reach the sim)
        function keep() { if (human >= 0 && sentAuto !== !!(auto || lastIn.auto || S.cars[human].fin)) send({ steer: lastIn.steer, throttle: lastIn.throttle, brake: lastIn.brake, manual: lastIn.manual, abrake: lastIn.abrake, asteer: lastIn.asteer, analog: lastIn.analog, touch: lastIn.touch, auto: lastIn.auto }); }
        var R = {
          S: S, cfg: cfg, T: T, line: line, prof: prof, lapModel: lapModel, human: human, seed: seed, demo: demo, gridSlot: gridSlot, field: field,
          start: function () { started = true; keep(); return R; },
          started: function () { return started; },
          step: function () { if (started) { keep(); S.step(); } },
          advance: function (dt) { if (!started) return 0; keep(); return S.advance(dt); },
          setInput: function (inp) { if (human < 0 || !inp) return; lastIn = inp; send(inp); },
          autopilot: function (on) { if (on != null) { auto = !!on; if (auto) helped = true; keep(); } return auto; },
          assists: function (a) { if (a) { if (a.brake != null) assists.brake = !!a.brake; if (a.steer != null) assists.steer = !!a.steer; } return { brake: assists.brake, steer: assists.steer }; },
          gearbox: function (g) { if (g === 'auto' || g === 'manual') gearbox = g; return gearbox; },
          // a debug control, a time scale: this race (and the page's later ones: the device layer keeps that) is helped
          markAssisted: function () { helped = true; },
          focus: function (n) { if (n !== undefined) focusN = n == null || n < 0 || n >= S.cars.length ? null : n | 0; return focusOf(); },
          state: function (out) { return stateOf(out); },
          classification: function () { return classify(); },
          // (every event as the one schema has it, INTERFACES 8 M2: { e, t, step, you }, you true when it is about the
          // player's car; the writers may set step and you themselves)
          drain: function () {
            var ev = S.drain(), H = S.H || 1 / 120;
            for (var i = 0; i < ev.length; i++) {
              var e = ev[i];
              if (e.step == null) e.step = Math.round((+e.t || 0) / H);
              if (e.you == null) e.you = human >= 0 && (e.car === human || e.a === human || e.b === human);
            }
            return ev;
          },
          hash: function () { return S.hash(); },
          replay: function () { var S2 = S.replay(), h = S2.hash(), live = S.hash(); return { hash: h, steps: S2.steps, live: live, equal: h === live }; },
        };
        function focusOf() {
          if (focusN != null) return focusN;
          if (human >= 0) return human;
          var o2 = S.race && S.race.order; return o2 && o2.length ? o2[0] : 0;
        }
        function stateOf(out) {
          var Rr = S.race || {}, cars = S.cars, N = cars.length, Rc = Rr.cars || [], order = Rr.order || [];
          var lead = order.length ? order[0] : 0, gL = Rc[lead] ? Rc[lead].g : -1, firstHome = -1;
          for (var i = 0; i < N; i++) if (cars[i].fin && Rc[i] && Rc[i].fo === 1) firstHome = i;
          var st = out || {};
          st.phase = S.phase; st.go = !!S.go; st.t = S.t; st.raceT = Rr.goT != null ? (Rr.doneT != null ? Rr.doneT : S.t) - Rr.goT : 0;
          st.lights = Rr.lights == null ? 0 : Rr.lights; st.laps = cfg.laps;
          st.leaderLap = cars[lead] ? min(cfg.laps, cars[lead].lap + 1) : 1;
          st.you = human; st.focus = focusOf(); st.assisted = !!(Rr.assisted || helped); st.done = S.phase === 'done';
          // (D3: the player's run is tagged aids 'on' when it used the driving aids, 'pro' when it never did; 'off' is kept
          // for a middle setting, not built. D4: the player's grid slot and the field's pace)
          st.aids = human < 0 ? null : Rr.aided ? 'on' : 'pro'; st.gridSlot = human >= 0 ? human + 1 : null; st.field = field; st.youTag = cfg.youTag;
          st.order = order.slice(); st.changes = Rr.changes ? { total: Rr.changes.total, away: Rr.changes.away } : { total: 0, away: 0 };
          st.winner = Rr.winner == null ? -1 : Rr.winner; st.endT = Rr.endT == null ? null : Rr.endT; st.reason = Rr.reason || null;
          st.fast = Rr.fast ? { n: Rr.fast.n, time: Rr.fast.time, lap: Rr.fast.lap } : null;
          st.started = started;
          // (M2, lane A) the start as the player sees it (X29): the phase ('rev', 'lights', 'hold', 'out'), the HOLD armed, the
          // EARLY let-gos, a jump start, the launch (its mode and reaction) and its rank among the cars launched so far
          // (final when every car has launched: of === field); the nemesis (X15); the field's passes and the earned ones
          // (X24); the open GIVE IT BACK requests; the leader on its final lap (X08)
          var hq = human >= 0 && Rc[human] ? Rc[human] : null, rk = null, nl = 0;
          for (i = 0; i < N; i++) if (Rc[i] && Rc[i].lg === 2) nl++;
          if (hq && hq.lg === 2 && hq.mode !== 'jump') { rk = 1; for (i = 0; i < N; i++) if (i !== human && Rc[i] && Rc[i].lg === 2 && (Rc[i].react < hq.react || (Rc[i].react === hq.react && i < human))) rk++; }
          st.start = hq ? { phase: Rr.sp || 'rev', armed: !!hq.arm, armedGo: !!hq.armGo, early: hq.early | 0, jump: !!hq.jump, launched: hq.lg === 2,
            mode: hq.mode || '', reaction: hq.lg === 2 ? hq.react : null, rank: rk, of: nl, lc: human >= 0 ? cars[human].lc || 0 : 0 } : { phase: Rr.sp || 'rev' };
          st.nemesis = Rr.nem == null ? -1 : Rr.nem;
          st.passes = { total: Rr.passes | 0, earned: Rr.earned | 0 };
          st.giveBack = Rr.gb ? Rr.gb.map(function (g) { return { car: g.a, passed: g.b, left: max(0, K.giveBack - (S.t - g.t0)) }; }) : [];
          st.finalLap = cars[lead] ? cars[lead].lap >= cfg.laps - 1 && cfg.laps > 1 : false;
          var list = st.cars && st.cars.length === N ? st.cars : (st.cars = []);
          for (i = 0; i < N; i++) {
            var c = cars[i], s = c.spec || specs[i], q = Rc[i] || { g: -1, tg: [] }, row = list[i] || (list[i] = {});
            var g = q.g, gapLead = null, gapAhead = null, down = 0;
            if (c.fin && firstHome >= 0) gapLead = c.finT - cars[firstHome].finT;
            else if (g >= 0 && g < q.tg.length && q.tg[g] >= 0 && Rr.gt[g] >= 0) { gapLead = q.tg[g] - Rr.gt[g]; down = gL > g ? floor((gL - g) / cfg.gates) : 0; }
            var ahead = c.place > 1 ? order[c.place - 2] : -1;
            if (ahead >= 0) {
              var A = cars[ahead], qa = Rc[ahead];
              if (c.fin && A.fin) gapAhead = c.finT - A.finT;
              else if (g >= 0 && qa && g < qa.tg.length && qa.tg[g] >= 0 && q.tg[g] >= 0) gapAhead = q.tg[g] - qa.tg[g];
            }
            row.n = i; row.id = s.id; row.name = s.name; row.tla = s.tla; row.num = s.num; row.team = s.team; row.teamName = s.teamName; row.color = s.color;
            row.place = c.place; row.lap = c.lap; row.cur = c.fin ? c.last : S.go && c.lapT0 != null ? S.t - c.lapT0 : 0; row.prog = c.prog; row.d = c.d; row.lat = c.lat; row.v = c.v;
            row.gear = c.gear; row.rpm = c.rpm; row.thr = c.thr; row.brk = c.brk; row.fin = !!c.fin; row.finT = c.finT; row.raceT = c.raceT;
            row.gapLead = gapLead; row.gapAhead = gapAhead; row.down = down; row.last = c.last; row.best = c.best;
            row.sectors = c.sectors ? c.sectors.slice() : [null, null, null]; row.deleted = !!c.deleted; row.strikes = c.strikes | 0; row.penalty = c.penalty || 0;
            var fz = c.flap && c.flap.armed && c.flap.zone >= 0 ? cfg.flaps[c.flap.zone] : null, fin2 = fz ? inSpan(T.L, c.d, fz.from, fz.to) : false;
            row.flap = { armed: !!(c.flap && c.flap.armed), open: !!(c.flap && c.flap.open), set: !!q.fl, inZone: fin2, to: fz && !fin2 ? wrapL(T.L, fz.from - c.d) : 0 };
            // (the chip, X30: '' for RACE, else the AI's state as EXPERIENCE 8's intent, { state, side, corner, target })
            var cm = c.mind; row.intent = cm && cm.state && cm.state !== 'RACE' ? { state: cm.state, side: cm.side, corner: cm.corner, target: cm.target } : '';
            row.auto = !!c.auto; row.stuck = c.stuck || 0; row.off = c.off || 0; row.contacts = c.contacts | 0; row.recovers = c.recovers | 0;
            row.react = q.react != null ? q.react : -1; row.jump = !!q.jump; row.missed = !!c.missed; row.scuff = c.scuff || 0;
            row.held = !!c.held; row.bog = !!q.bog; row.launched = q.lg === 2 || (q.lg == null && !c.held);
            // (M2, lane A) the agent's mind, the chip's only source (X30: the AI's own state, so it cannot lie): { state, target,
            // corner, side, shownStep, actStep }; the launch's mode; the passes made (earned); the aids' share this step (X21)
            var md = c.mind; row.mind = md ? { state: md.state, target: md.target, corner: md.corner, side: md.side, shownStep: md.shownStep, actStep: md.actStep } : { state: 'RACE', target: -1, corner: '', side: '', shownStep: -1, actStep: -1 };
            row.launch = q.mode || ''; row.passes = q.passes | 0; row.earned = q.earned | 0; row.nemesis = Rr.nem === i;
            row.aid = c.aid ? { brake: c.aid.brake, steer: c.aid.steer, throttle: c.aid.throttle } : null;
          }
          return st;
        }
        // the classification: by laps completed, then by when the last of them was completed (penalties added); a car
        // still on its first lap by distance (frozen at the end). Home cars are 'fin', the rest 'classified'
        function classify() {
          var cars = S.cars, Rr = S.race || {}, Rc = Rr.cars || [], g0 = Rr.goT || 0, rows = [];
          for (var i = 0; i < cars.length; i++) {
            var c = cars[i], s = c.spec || specs[i], q = Rc[i] || {}, pen = c.penalty || 0;
            var at = c.fin ? c.finT : c.lap > 0 ? c.lapT0 : null;
            rows.push({ n: i, id: s.id, name: s.name, tla: s.tla, team: s.team, teamName: s.teamName, color: s.color, laps: c.lap,
              time: c.fin ? c.raceT + pen : null, best: c.best, penalty: pen, strikes: c.strikes | 0,
              status: c.fin ? 'fin' : 'classified', key: at == null ? Infinity : at - g0 + pen, prog: q.pf != null ? q.pf : c.prog });
          }
          rows.sort(function (a, b) { return b.laps - a.laps || (a.key === b.key ? 0 : a.key < b.key ? -1 : 1) || b.prog - a.prog || a.n - b.n; });
          var w = rows[0];
          rows.forEach(function (r, j) {
            r.pos = j + 1;
            if (j === 0) r.gap = 0;
            else if (r.status === 'fin' && r.laps === w.laps && w.status === 'fin') r.gap = r.time - w.time;
            else { var dn = max(1, w.laps - r.laps); r.gap = '+' + dn + ' lap' + (dn > 1 ? 's' : ''); }
            delete r.prog; delete r.key;
          });
          return rows;
        }
        return R;
      }

      return { K: K, MODES: MODES, read: read, rules: rules, race: race, clamp: clamp, angDiff: angDiff };
    })();
