/* GameMog Runtime v1.
 *
 * The platform's game framework: the part of every world that is the same.
 * A world module (written by Claude Opus 5.5 from a creator's prompt) supplies
 * what makes a world itself: the track's shape, the scenery, the player's and
 * every rival's look and animation, the obstacles, ambient life and sound.
 * This file supplies the rules, and a world cannot change them:
 *
 *   - endless laps; level = the lap you are on
 *   - one rival lines up beside you on the start line; every lap another
 *     joins at the line, faster and more aggressive than the last
 *   - every lap everyone runs faster: you, the whole field, moving obstacles
 *   - the only way to die is to touch a rival or an obstacle
 *   - golden GM coins along the track, re-laid every lap
 *   - arrow keys (and WASD) steer and change speed; Space jumps; P pauses; on-screen
 *     buttons on touch screens
 *   - title, countdown, HUD, level-up banners, pause, results, restart
 *   - result reporting to the leaderboard through GameMog.finish
 *
 * A world may opt into platform options (`play`, the owner's, 25 Sep), each
 * the same in every world that turns it on:
 *   - play.coins: false  no GM coins on the track
 *   - play.bounty        each finished lap pays GM, more every lap
 *   - play.combat        X (or J, or the sword button) swings a sword; a
 *                        rival you cut down falls and runs again from the
 *                        line next lap; touching one you have not cut still
 *                        ends your run
 *   - play.hazards       obstacles each lap: 'fewer', 'same' or 'more' (the
 *                        creator's choice on Create and Mog, 26 Sep): more
 *                        lays copies of the world's own obstacles every lap,
 *                        fewer clears some; never two in a row, never past the
 *                        track's density
 *   - play.vehicle       a world of cars (the owner, 25 Sep: "car speeds,
 *                        same rhythm"): every speed and every distance along
 *                        the track is 2.2 times a runner's, so a lap takes as
 *                        long and a rival joins as often, at car speeds;
 *                        hitboxes are a car's length and width
 *
 * It also guards the world against itself: hitboxes are measured from the
 * models rather than trusted, obstacle rows that close the whole track are
 * thinned, scenery that would block the chase camera is hidden, and every
 * repair is reported so the playtest can send it back to the model.
 *
 * Load order in the game document: host contract, three.js r157, this file,
 * then the world module, which calls GameMog.world({...}).
 */
(function () {
  'use strict';

  var GM = window.GameMog;
  var diag = window.__gm || (window.__gm = { ready: false, results: [], errors: [] });
  diag.warnings = diag.warnings || [];
  function warn(m) { m = String(m).slice(0, 320); if (diag.warnings.indexOf(m) < 0 && diag.warnings.length < 40) diag.warnings.push(m); }
  function fail(m) { m = String(m).slice(0, 400); if (diag.errors.indexOf(m) < 0 && diag.errors.length < 40) diag.errors.push(m); try { console.error('[gamemog] ' + m); } catch (e) {} }

  /* ------------------------------------------------------------ rules -- */
  var RULES = Object.freeze({
    version: 1,
    // lap 1 speeds; every lap multiplies them by pace(level)
    baseSpeed: 20, fastSpeed: 28, slowSpeed: 12, accel: 16,
    lateralSpeed: 10, lateralAccel: 48,
    // Every lap, everything gets a little faster: you, every rival already
    // on the track, and the obstacles that move. Your cruising, fast and slow
    // speeds are multiplied by pace(level); steering by its square root.
    pace: function (level) { return Math.min(1.6, 1 + 0.05 * (Math.max(1, level) - 1)); },
    obstaclePace: function (level) { return Math.min(1.5, 1 + 0.04 * (Math.max(1, level) - 1)); },
    // Rival k joins at the start line on lap k (rival 1 lines up beside you
    // at the start). Its speed is a multiple of your cruising speed on the
    // current lap, and it hunts you harder every lap it has been racing:
    // each newcomer arrives faster and meaner than the last, and every lap
    // the whole field gains on you.
    rivalSpeed: function (k, level) { level = Math.max(k, level || k); return Math.min(1.36, 0.8 + 0.05 * (k - 1) + 0.015 * (level - k)); },
    rivalAggression: function (k, level) { level = Math.max(k, level || k); return Math.min(0.95, 0.15 + 0.07 * (k - 1) + 0.02 * (level - k)); },
    // seconds a newcomer holds its own lane before it starts hunting, and
    // how far past the line it appears (in view of the chase camera)
    joinGrace: 2.5, joinAhead: 6,
    lapMin: 320, lapMax: 900,
    // the steepest a track may bank (a velodrome's turns are 40 to 45 degrees)
    bankMax: 45,
    halfWidthMin: 4, halfWidthMax: 9,
    startClear: 45,
    obstacleSpacing: 11,
    coinGroupEvery: 105, coinsPerGroup: 5, coinSpacing: 3.2,
    corridorHeight: 7,
    // worlds that turn combat on (play.combat): a swing of the sword cuts
    // between swingHit[0] and swingHit[1] seconds after the key, anything
    // up to swingReach metres ahead, swingBehind metres back and swingWidth
    // either side; another swing is ready swingCooldown seconds later
    swingContact: 0.15, swingHit: [0.06, 0.28], swingLength: 0.52, swingCooldown: 0.3,
    swingReach: 3.4, swingBehind: 1.6, swingWidth: 2.6,
    // a rival cut down lies where it fell and runs again from the line next lap
    slainFade: 2.4,
    // play.vehicle: speeds and distances along the track times `scale`,
    // steering times `lateral`, and a wider road allowed
    vehicle: Object.freeze({ scale: 2.2, lateral: 1.3, halfWidthMin: 5, halfWidthMax: 12 }),
  });
  GM.rules = RULES;

  var worldDef = null;
  GM.world = function (def) {
    if (worldDef) { warn('GameMog.world() was called more than once; only the first definition is used.'); return; }
    worldDef = def || {};
  };

  /* -------------------------------------------------------------- maths -- */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function damp(cur, tgt, lambda, dt) { return lerp(cur, tgt, 1 - Math.exp(-lambda * dt)); }
  function smooth(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function approach(cur, tgt, step) { return cur < tgt ? Math.min(tgt, cur + step) : Math.max(tgt, cur - step); }
  function mulberry(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6d2b79f5) >>> 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashStr(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function isHex(c) { return typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c); }
  function num(v, d, a, b) { if (v == null || v === '') return d; v = Number(v); return isFinite(v) ? clamp(v, a, b) : d; }
  // looks a world can opt into (1 Oct): graphics.preset fills only what the world
  // leaves unset, so a world without one is exactly as it was. sky: how bright the
  // photographed sky is drawn (the 90th percentile of its sky, which draws without
  // tone mapping, so over 1 is white); light: the photograph's strength as the light
  // on every surface, apart from how bright it looks
  var PRESETS = {
    daylight: { exposure: 1, bloom: { strength: 0.3, threshold: 1.3 }, grade: { contrast: 1.04, saturation: 1.05, warmth: 0.05 }, sky: 0.85, light: 1 },
    golden: { exposure: 1.05, bloom: { strength: 0.5, threshold: 1.1 }, grade: { contrast: 1.06, saturation: 1.1, warmth: 0.3 }, sky: 0.95, light: 0.9 },
    moonlit: { exposure: 0.95, bloom: { strength: 0.6, threshold: 0.9, radius: 0.5 }, grade: { contrast: 1.08, saturation: 0.85, warmth: -0.3, vignette: 0.35 }, sky: 0.3, light: 0.35 },
    toy: { exposure: 1.1, bloom: { strength: 0.25, threshold: 1.4 }, grade: { contrast: 1.06, saturation: 1.25, warmth: 0.08, vignette: 0.15, grain: 0 }, sky: 0.85, light: 1.15 },
  };
  function withPreset(g) {
    if (g.preset == null) return { g: g, P: null };
    var P = typeof g.preset === 'string' && Object.prototype.hasOwnProperty.call(PRESETS, g.preset) ? PRESETS[g.preset] : null;
    if (!P) { warn('graphics.preset "' + String(g.preset).slice(0, 24) + '" is not one of daylight, golden, moonlit, toy; no preset was used.'); return { g: g, P: null }; }
    var o = {}; for (var k in g) o[k] = g[k];
    if (o.exposure == null) o.exposure = P.exposure;
    if (o.bloom !== false) { var bl = {}, k1; for (k1 in P.bloom) bl[k1] = P.bloom[k1]; if (o.bloom && typeof o.bloom === 'object') for (k1 in o.bloom) bl[k1] = o.bloom[k1]; o.bloom = bl; }
    var gd = {}, k2; for (k2 in P.grade) gd[k2] = P.grade[k2]; if (o.grade && typeof o.grade === 'object') for (k2 in o.grade) gd[k2] = o.grade[k2]; o.grade = gd;
    return { g: o, P: { name: g.preset, sky: P.sky, light: P.light } };
  }
  // a world's `graphics`, bounded: every value has a floor and a ceiling
  function readGraphics(g) {
    if (!g || typeof g !== 'object') return null;
    var wp = withPreset(g), preset = wp.P; g = wp.g;
    var b = g.bloom === false ? null : (g.bloom && typeof g.bloom === 'object' ? g.bloom : {});
    var gr = g.grade && typeof g.grade === 'object' ? g.grade : {};
    var sh = g.shadows === false ? null : (g.shadows && typeof g.shadows === 'object' ? g.shadows : {});
    var env = g.environment === false ? null : g.environment == null ? true : g.environment;
    return {
      exposure: num(g.exposure, 1, 0.3, 3),
      environment: env,
      envIntensity: env && typeof env === 'object' && env.intensity != null ? num(env.intensity, 1, 0, 4) : null,
      bloom: b && { strength: num(b.strength, 0.5, 0, 2), threshold: num(b.threshold, 1, 0.2, 6), radius: num(b.radius, 0.7, 0.2, 1.6) },
      grade: { contrast: num(gr.contrast, 1.04, 0.8, 1.3), saturation: num(gr.saturation, 1.05, 0.5, 1.5), warmth: num(gr.warmth, 0, -1, 1), vignette: num(gr.vignette, 0.25, 0, 0.8), grain: num(gr.grain, 0.015, 0, 0.08),
        // a painter's dusk (Shinobi Duel's grade, MIT): split toning that lifts
        // the shadows cold and warms the highlights, highlights that keep
        // their heat while the mid-tones stay muted, and a still paper grain
        split: num(gr.split, 0, 0, 1), highlights: num(gr.highlights, 1, 0.6, 1.6), paper: num(gr.paper, 0, 0, 0.08) },
      shadows: sh && { follow: sh.follow !== false, extent: num(sh.extent, 38, 16, 90), mapSize: Number(sh.mapSize) === 1024 ? 1024 : 2048 },
      msaa: g.antialias !== false,
      // the street itself in the paint: a cube of the world around the player, kept live
      reflections: g.reflections === true,
      // a radial blur that grows with speed, 0 to 1
      motion: num(g.motion, 0, 0, 1),
      preset: preset,
    };
  }

  // a world's platform options (see the header), bounded
  function readPlay(p) {
    p = p && typeof p === 'object' ? p : {};
    var c = p.combat === true ? {} : p.combat && typeof p.combat === 'object' ? p.combat : null;
    var b = p.bounty === true ? {} : p.bounty && typeof p.bounty === 'object' ? p.bounty : null;
    var word = function (v, d, n) { return typeof v === 'string' && v.trim() ? v.trim().replace(/[<>&]/g, '').slice(0, n) : d; };
    return {
      coins: p.coins !== false,
      bounty: b && { base: Math.round(num(b.base, 100, 10, 1000)), step: Math.round(num(b.step, 50, 0, 1000)), name: word(b.name, 'Lap bounty', 28) },
      combat: c && { mark: word(c.mark, '!', 2), verb: word(c.verb, 'Cut down', 18) },
      vehicle: p.vehicle === true,
      hazards: p.hazards === 'more' || p.hazards === 'fewer' ? p.hazards : 'same',
    };
  }

  /* ------------------------------------------------------ asset library -- */
  // The platform's library of licensed, hash-checked assets (/assets/):
  // realistic humans with motion capture, skies for image-based light. A
  // world lists the ids it uses in `assets`; they are fetched and checked
  // before the world is built, and ctx.assets hands them to the world.
  var ASSET_BASE = (function () { try { return new URL('/assets/', location.href).href; } catch (e) { return '/assets/'; } })();
  var ASSETS = {};
  function lowQuality() {
    var coarse = false; try { coarse = window.matchMedia('(pointer: coarse)').matches; } catch (e) {}
    return coarse || Math.min(window.screen.width || 1280, window.screen.height || 720) < 600;
  }
  function hexOf(buf) { var a = new Uint8Array(buf), s = ''; for (var i = 0; i < a.length; i++) s += (a[i] < 16 ? '0' : '') + a[i].toString(16); return s; }
  function fetchChecked(id, name, entry) {
    var f = entry.files[name];
    if (!f) return Promise.reject(new Error(id + '/' + name + ' is not in the library'));
    // asked for by its hash: a rebuilt file has a new address, so caches never serve an old one
    // (h=, not v=: v= addresses were cached for a year by browsers while an edge
    // cache was recompressing JPEGs, 1 Oct; new addresses leave those copies behind)
    return fetch(ASSET_BASE + id + '/' + name + '?h=' + String(f.sha256).slice(0, 16)).then(function (r) { if (!r.ok) throw new Error(id + '/' + name + ' returned ' + r.status); return r.arrayBuffer(); })
      .then(function (buf) {
        if (!(window.crypto && crypto.subtle)) return buf;
        // a file that is not the one the library licensed is refused
        return crypto.subtle.digest('SHA-256', buf).then(function (d) { if (hexOf(d) !== f.sha256) throw new Error(id + '/' + name + ' does not match the library'); return buf; });
      });
  }
  function inflate(buf) { return new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer(); }
  function bitmapOf(buf, name, keep) {
    return createImageBitmap(new Blob([buf], { type: /\.png$/.test(name) ? 'image/png' : 'image/jpeg' }), { imageOrientation: keep ? 'none' : 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  }
  function loadAssets(ids, low, progress) {
    var done = 0, total = 1;
    function tick() { done++; progress(done / total); }
    return fetch(ASSET_BASE + 'library.json', { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error('library.json returned ' + r.status); return r.json(); }).then(function (lib) {
      return Promise.all(ids.map(function (id) {
        var e = lib.assets[id];
        if (!e) { warn('The asset "' + id + '" is not in the library; the world must use its own fallback.'); return null; }
        return fetchChecked(id, 'asset.json', e).then(function (b) {
          var json = JSON.parse(new TextDecoder().decode(b)), A = { id: id, entry: e, json: json, images: {} }, jobs = [];
          function bin(name, key) { total++; jobs.push(fetchChecked(id, name, e).then(inflate).then(function (x) { A[key] = x; tick(); })); }
          function img(name, keep) { total++; jobs.push(fetchChecked(id, name, e).then(function (x) { return bitmapOf(x, name, keep); }).then(function (bm) { A.images[name] = bm; tick(); })); }
          if (json.kind === 'human') {
            bin(json.body, 'body'); bin(json.clips.file, 'clips'); bin(json.kit.file, 'kit');
            for (var s in json.textures.skins) img(low ? json.textures.skins[s].lo : json.textures.skins[s].hi);
            for (var h in json.textures.hair) img(json.textures.hair[h]);
            for (var y in json.textures.eyes) img(json.textures.eyes[y]);
            img(json.textures.brows); img(json.textures.lashes);
          } else if (json.kind === 'hdri') bin(json.file, 'rgbe');
          else if (json.kind === 'texture') { for (var mk in json.maps) img(json.maps[mk]); }
          else if (json.kind === 'model') {
            bin(json.file, 'model');
            var seen = {};
            json.materials.forEach(function (m) { ['map', 'normalMap', 'armMap', 'alphaMap'].forEach(function (k) { if (m[k] && !seen[m[k]]) { seen[m[k]] = 1; img(m[k], true); } }); });
          }
          else if (json.kind === 'music') {
            // decoded now, off the page's own audio (which waits for a key): an
            // AudioBuffer plays in any context
            total++;
            jobs.push(fetchChecked(id, json.file, e).then(function (x) {
              var OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
              return OAC ? new OAC(2, 1, json.sampleRate || 44100).decodeAudioData(x) : null;
            }).then(function (buf) { A.buffer = buf; tick(); }).catch(function (err) { warn('The music "' + id + '" could not be decoded (' + (err && err.message || err) + ').'); tick(); }));
          }
          return Promise.all(jobs).then(function () { return A; });
        });
      }));
    }).then(function (list) { list.forEach(function (a) { if (a) ASSETS[a.id] = a; }); });
  }

  /* --------------------------------------------------------------- you -- */
  // "You are the main character" (docs/PRODUCT.md): the page passes the
  // player's own character in the frame's URL fragment (#me=, base64url JSON;
  // a fragment never reaches a server) and may change it later by message.
  // Whenever there is one, it replaces the world's player(). Every field is
  // bounded here again; the site's own rules are in lib/me.ts.
  var ME_BODY = { a: 'human-athlete-male', b: 'human-athlete-female' };
  function readMe(m) {
    if (!m || typeof m !== 'object') return null;
    function hx(v, d) { return isHex(v) ? v : d; }
    function one(v, list, d) { return list.indexOf(v) >= 0 ? v : d; }
    var k = m.kit && typeof m.kit === 'object' ? m.kit : {};
    var name = String(m.name || '').replace(/[^\p{L}\p{N} .'-]/gu, '').trim().slice(0, 14);
    return {
      name: name || 'YOU', body: m.body === 'b' ? 'b' : 'a', tone: hx(m.tone, '#C98F6B'),
      face: [0, 1, 2, 3].indexOf(m.face) >= 0 ? m.face : 0,
      hair: one(m.hair, ['short02', 'short04', 'afro01', 'none'], 'short04'), hairColor: hx(m.hairColor, '#1A1410'),
      eyes: one(m.eyes, ['brown', 'brownlight', 'blue'], 'brown'), build: one(m.build, ['slim', 'athletic', 'strong'], 'athletic'),
      kit: { top: hx(k.top, '#15264F'), trim: hx(k.trim, '#D22B3A'), pattern: one(k.pattern, ['plain', 'band', 'sash', 'stripes', 'split'], 'band'),
             number: String(k.number == null ? '7' : k.number).replace(/\D/g, '').slice(0, 3) || '7' },
    };
  }
  var ME = (function () {
    try {
      var h = /[#&]me=([A-Za-z0-9_-]+)/.exec(location.hash); if (!h) return null;
      var bin = atob(h[1].replace(/-/g, '+').replace(/_/g, '/')), bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return readMe(JSON.parse(new TextDecoder().decode(bytes)));
    } catch (e) { return null; }
  })();

  document.addEventListener('DOMContentLoaded', function () {
    if (!window.THREE) { fail('three.js did not load, so the game cannot start.'); return; }
    if (!worldDef) { fail('The world module never called GameMog.world({...}).'); return; }
    function start() {
      try { boot(worldDef); }
      catch (e) { fail('The world failed to build: ' + (e && e.message || e)); try { console.error(e); } catch (e2) {} }
    }
    var ids = Array.isArray(worldDef.assets) ? worldDef.assets.filter(function (id) { return typeof id === 'string' && /^[a-z0-9-]{2,60}$/.test(id); }).slice(0, 24) : [];
    if (ME && ids.indexOf(ME_BODY[ME.body]) < 0) ids.push(ME_BODY[ME.body]);
    // a recorded track the world plays loads with the rest
    var go = GM.options && typeof GM.options === 'object' ? GM.options : null;
    var tr = go ? (typeof go.music === 'string' ? go.music : null) : worldDef.music && typeof worldDef.music.track === 'string' ? worldDef.music.track : null;
    if (tr && !/^[a-z0-9-]{2,60}$/.test(tr)) tr = null;
    if (tr && ids.indexOf(tr) < 0) ids.push(tr);
    if (!ids.length) return start();
    // a quiet loading card while the library streams in
    var card = document.createElement('div');
    card.style.cssText = 'position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:#0c0f14;color:#e9e6df;font:600 15px system-ui,sans-serif;letter-spacing:.04em';
    var label = document.createElement('div'); label.textContent = 'Loading';
    var bar = document.createElement('div'); bar.style.cssText = 'width:220px;height:4px;background:#2a2f38;border-radius:2px;overflow:hidden';
    var fill = document.createElement('div'); fill.style.cssText = 'height:100%;width:0;background:#e9e6df';
    bar.appendChild(fill); card.appendChild(label); card.appendChild(bar); document.body.appendChild(card);
    loadAssets(ids, lowQuality(), function (p) { fill.style.width = Math.round(Math.min(1, p) * 100) + '%'; })
      .catch(function (e) { warn('The asset library could not be loaded (' + (e && e.message || e) + '); the world uses its own fallbacks.'); })
      .then(function () { card.remove(); start(); });
  });

  function boot(def) {
    var THREE = window.THREE;
    var meta = GM.meta || { title: GM.title || 'GameMog', tagline: '' };
    // an open world (open.js): a place to roam, not a lap to race
    var OPEN = def.open && typeof def.open === 'object' ? def.open : null;

    /* ------------------------------------------------------------ theme -- */
    var theme = def.theme || {};
    var T = {
      sky: isHex(theme.sky) ? theme.sky : '#8FB8D8',
      fog: isHex(theme.fog) ? theme.fog : (isHex(theme.sky) ? theme.sky : '#A9C4D8'),
      ink: isHex(theme.ink) ? theme.ink : '#1E1A16',
      panel: isHex(theme.panel) ? theme.panel : '#FFF6E6',
      accent: isHex(theme.accent) ? theme.accent : '#FF8A3D',
      font: typeof theme.font === 'string' && /^[A-Za-z0-9 ]{2,40}$/.test(theme.font) ? theme.font : 'Fredoka',
    };
    var G = readGraphics(def.graphics);
    var PLAY = readPlay(def.play);
    // the creator's options from the page (lib/world-options.ts) override the
    // world's own: obstacles each lap, and music on or off
    var OPTS = GM.options && typeof GM.options === 'object' ? GM.options : null;
    if (OPTS && /^(fewer|same|more)$/.test(OPTS.hazards)) PLAY.hazards = OPTS.hazards;
    // the rules this world plays by: a world of cars (play.vehicle) drives
    // every speed and distance along the track at 2.2 times a runner's
    var VS = PLAY.vehicle ? RULES.vehicle.scale : 1, VL = PLAY.vehicle ? RULES.vehicle.lateral : 1;
    var R = !PLAY.vehicle ? RULES : Object.freeze(Object.assign({}, RULES, {
      baseSpeed: RULES.baseSpeed * VS, fastSpeed: RULES.fastSpeed * VS, slowSpeed: RULES.slowSpeed * VS, accel: RULES.accel * VS,
      lateralSpeed: RULES.lateralSpeed * VL, lateralAccel: RULES.lateralAccel * VL,
      lapMin: RULES.lapMin * VS, lapMax: RULES.lapMax * VS, halfWidthMin: RULES.vehicle.halfWidthMin, halfWidthMax: RULES.vehicle.halfWidthMax,
      startClear: RULES.startClear * VS, obstacleSpacing: RULES.obstacleSpacing * VS, coinGroupEvery: RULES.coinGroupEvery * VS, coinSpacing: RULES.coinSpacing * VS,
      joinAhead: RULES.joinAhead * VS,
    }));
    // the platform's score (lib/runtime/music.js): composed from the world's
    // music option, measured offline while the world builds, so it plays at the
    // same loudness as every other world's from its first bar
    var MUSIC = null;
    // or a recorded track from the library, measured and made to loop when it was built
    var TRACK = OPTS ? (typeof OPTS.music === 'string' ? OPTS.music : null) : def.music && typeof def.music.track === 'string' ? def.music.track : null;
    if (!OPTS && def.music && !TRACK && typeof GameMogMusic !== 'undefined') {
      try { MUSIC = GameMogMusic.read(def.music, meta.title || 'GameMog', warn); } catch (e) { warn('music could not be composed: ' + (e && e.message || e)); }
      if (MUSIC) GameMogMusic.measure(MUSIC).then(function (r) { MUSIC.measured = r; if (audio && audio.music) audio.music.setLevel(r ? r.lufs : null); }).catch(function (e) { warn('music could not be measured: ' + (e && e.message || e)); });
    }
    // set before anything is built: rivals are prebuilt before the graphics
    // start, and envify() must not scale their materials by an unset value
    var envScale = 1;

    /* --------------------------------------------------------- renderer -- */
    // a cinematic world renders into its own multisampled HDR target, so the
    // canvas itself needs no antialiasing
    // a test drive in the browser copies frames for the cover (lib/runtime/drive.js)
    var renderer = new THREE.WebGLRenderer({ antialias: !G, powerPreference: 'high-performance', preserveDrawingBuffer: !!window.__gmDrive });
    var basePixelRatio = Math.min(window.devicePixelRatio || 1, G ? 1.5 : 2);
    renderer.setPixelRatio(basePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    // a material whose shader will not compile draws nothing, silently: say so,
    // with the first line of the driver's complaint
    renderer.debug.onShaderError = function (gl, program, vs, fs) {
      var log = (gl.getShaderInfoLog(fs) || '') + (gl.getShaderInfoLog(vs) || '') || gl.getProgramInfoLog(program) || '';
      fail('A material\'s shader did not compile, so it draws nothing: ' + (log.split('\n').filter(Boolean)[0] || 'no log'));
    };
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    if (G) renderer.toneMappingExposure = G.exposure;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(renderer.domElement);

    var scene = new THREE.Scene();
    scene.background = new THREE.Color(T.sky);
    scene.fog = new THREE.Fog(T.fog, 70, 380);
    var cam = def.camera || {};
    var camDist = clamp(Number(cam.distance) || 9, 3, 14);
    var camHeight = clamp(Number(cam.height) || 4, 1.8, 6.5);
    // over the shoulder (metres to the right of the runner) and where it aims
    // (a height 9 m ahead): a close camera aims lower to keep the runner's feet in frame
    var camSide = clamp(Number(cam.side) || 0, -2, 2);
    var camAim = clamp(Number(cam.look) || 1.3, 0.3, 3);
    var camera = new THREE.PerspectiveCamera(clamp(Number(cam.fov) || 64, 50, 78), window.innerWidth / window.innerHeight, 0.1, 1800);
    var baseFov = camera.fov;
    // a phone held upright would see a sliver of track through a landscape
    // lens: keep at least 60 degrees across, whatever the screen's shape
    function fovFor(aspect) {
      var across = 2 * Math.atan(Math.tan(30 * Math.PI / 180) / Math.max(0.2, aspect)) * 180 / Math.PI;
      return clamp(Math.max(baseFov, across), baseFov, 96);
    }
    window.addEventListener('resize', function () {
      renderer.setSize(window.innerWidth, window.innerHeight);
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      if (post) post.resize();
    });
    var post = null;

    /* ------------------------------------------------------------ track -- */
    // an open world races no lap: the runtime keeps a loop of its own, far
    // under the ground, so everything built for a track has one to stand on
    if (OPEN && !def.track) {
      def.track = { width: 12, points: [] };
      for (var oi0 = 0; oi0 < 12; oi0++) def.track.points.push([Math.cos(oi0 / 12 * Math.PI * 2) * 80, -3000, Math.sin(oi0 / 12 * Math.PI * 2) * 80]);
    }
    var trackDef = def.track || {};
    var raw = Array.isArray(trackDef.points) ? trackDef.points : [];
    var pts = raw.filter(function (p) { return Array.isArray(p) && p.length >= 2 && p.every(function (v) { return typeof v === 'number' && isFinite(v); }); })
      .map(function (p) { return p.length === 2 ? new THREE.Vector3(p[0], 0, p[1]) : new THREE.Vector3(p[0], p[1], p[2]); });
    // an optional fourth value banks the track there: degrees, raising the
    // right-hand edge (the outside of a left-hand bend), as a velodrome's turns
    var banks = raw.filter(function (p) { return Array.isArray(p) && p.length >= 2 && p.every(function (v) { return typeof v === 'number' && isFinite(v); }); })
      .map(function (p) { return p.length >= 4 ? clamp(p[3], -R.bankMax, R.bankMax) * Math.PI / 180 : 0; });
    if (raw.some(function (p) { return Array.isArray(p) && p.length >= 4 && Math.abs(p[3]) > R.bankMax; })) warn('Track banking is limited to ' + R.bankMax + ' degrees; steeper banks were clamped.');
    if (pts.length < 6) throw new Error('track.points needs at least 6 [x, y, z] control points forming a closed loop; got ' + pts.length + '.');
    if (pts.length > 80) { warn('track.points had ' + pts.length + ' points; the first 80 were used.'); pts = pts.slice(0, 80); banks = banks.slice(0, 80); }
    var banked = banks.some(function (b) { return b !== 0; });
    var hw = clamp((Number(trackDef.width) || 12) / 2, R.halfWidthMin, R.halfWidthMax);
    if (trackDef.width && Math.abs(trackDef.width / 2 - hw) > 0.01) warn('track.width must be between ' + R.halfWidthMin * 2 + ' and ' + R.halfWidthMax * 2 + ' metres; it was clamped to ' + hw * 2 + '.');

    var curve = new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.5);
    var rawLen = curve.getLength();
    if (rawLen < R.lapMin || rawLen > R.lapMax) {
      var target = clamp(rawLen, R.lapMin, R.lapMax), k = target / rawLen;
      var c = new THREE.Vector3(); pts.forEach(function (p) { c.add(p); }); c.divideScalar(pts.length);
      pts.forEach(function (p) { p.x = c.x + (p.x - c.x) * k; p.z = c.z + (p.z - c.z) * k; });
      curve = new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.5);
      warn('The track loop was ' + Math.round(rawLen) + 'm; laps must be ' + R.lapMin + ' to ' + R.lapMax + 'm, so it was scaled to ' + Math.round(curve.getLength()) + 'm. Everything placed with ctx.track helpers moved with it.');
    }

    var NS = 2400, P = [], CUM = new Float64Array(NS + 1), BANK = new Float32Array(NS + 1);
    for (var i = 0; i <= NS; i++) {
      P.push(curve.getPoint(i / NS));
      // the curve passes control point j at i / NS = j / n; ease the bank between them
      if (banked) { var u = i / NS * pts.length, j0 = Math.floor(u) % pts.length, j1 = (j0 + 1) % pts.length, fu = u - Math.floor(u); BANK[i] = banks[j0] + (banks[j1] - banks[j0]) * fu * fu * (3 - 2 * fu); }
    }
    for (i = 1; i <= NS; i++) CUM[i] = CUM[i - 1] + P[i].distanceTo(P[i - 1]);
    var L = CUM[NS];
    var UP = new THREE.Vector3(0, 1, 0);
    function wrapD(d) { d = d % L; return d < 0 ? d + L : d; }
    function rel(a, b) { var x = wrapD(a - b); return x > L / 2 ? x - L : x; } // a relative to b, shortest
    var BK_R = new THREE.Vector3(), BK_U = new THREE.Vector3();
    function Frame() { return { pos: new THREE.Vector3(), tan: new THREE.Vector3(), right: new THREE.Vector3(), up: new THREE.Vector3(), left: new THREE.Vector3(), bank: 0 }; }
    function frameAt(d, out) {
      out = out || Frame();
      var x = wrapD(d), lo = 0, hi = NS;
      while (lo < hi - 1) { var m = (lo + hi) >> 1; if (CUM[m] <= x) lo = m; else hi = m; }
      var seg = CUM[lo + 1] - CUM[lo], f = seg > 1e-6 ? (x - CUM[lo]) / seg : 0;
      out.pos.copy(P[lo]).lerp(P[lo + 1], f);
      out.tan.subVectors(P[(lo + 4) % NS], P[(lo + NS - 3) % NS]).normalize();
      out.right.crossVectors(out.tan, UP).normalize();
      out.up.crossVectors(out.right, out.tan).normalize();
      if (banked) {
        // roll the frame about the direction of travel: the right-hand edge rises
        var bk = BANK[lo] + (BANK[lo + 1] - BANK[lo]) * f, cb = Math.cos(bk), sb = Math.sin(bk);
        BK_R.copy(out.right); BK_U.copy(out.up);
        out.right.copy(BK_R).multiplyScalar(cb).addScaledVector(BK_U, sb);
        out.up.copy(BK_U).multiplyScalar(cb).addScaledVector(BK_R, -sb);
        out.bank = bk;
      } else out.bank = 0;
      out.left.copy(out.right).negate();
      return out;
    }
    var TMP = Frame(), BASIS = new THREE.Matrix4();
    function pointAt(d, x, y, out) { frameAt(d, TMP); return (out || new THREE.Vector3()).copy(TMP.pos).addScaledVector(TMP.right, x || 0).addScaledVector(TMP.up, y || 0); }
    // world objects are authored facing +Z with +Y up; the runtime turns them to face along the track
    function place(obj, d, x, y, yaw) {
      frameAt(d, TMP);
      obj.position.copy(TMP.pos).addScaledVector(TMP.right, x).addScaledVector(TMP.up, y || 0);
      BASIS.makeBasis(TMP.left, TMP.up, TMP.tan);
      obj.quaternion.setFromRotationMatrix(BASIS);
      if (yaw) obj.rotateY(yaw);
    }
    // a person stands plumb on a slope (a runner on steep stairs does not lean
    // back with the steps); a banked turn still rolls them with the track, and
    // anything that is not a person (a bicycle, a sled) lies along the surface
    var LV = { tan: new THREE.Vector3(), right: new THREE.Vector3(), up: new THREE.Vector3(), left: new THREE.Vector3() };
    function placeBody(e, d, x, y, yaw) {
      if (!e.upright) return place(e.object, d, x, y, yaw);
      var obj = e.object;
      frameAt(d, TMP);
      obj.position.copy(TMP.pos).addScaledVector(TMP.right, x).addScaledVector(TMP.up, y || 0);
      LV.tan.set(TMP.tan.x, 0, TMP.tan.z).normalize();
      LV.right.crossVectors(LV.tan, UP).normalize(); LV.up.copy(UP);
      if (TMP.bank) { var cb = Math.cos(TMP.bank), sb = Math.sin(TMP.bank); BK_R.copy(LV.right); LV.right.multiplyScalar(cb).addScaledVector(LV.up, sb); LV.up.multiplyScalar(cb).addScaledVector(BK_R, -sb); }
      LV.left.copy(LV.right).negate();
      BASIS.makeBasis(LV.left, LV.up, LV.tan);
      obj.quaternion.setFromRotationMatrix(BASIS);
      if (yaw) obj.rotateY(yaw);
    }

    // coarse samples for "where is the track" queries
    var COARSE = [];
    for (var cd = 0; cd < L; cd += 3) { var cf = frameAt(cd, Frame()); COARSE.push({ d: cd, x: cf.pos.x, y: cf.pos.y, z: cf.pos.z, rx: cf.right.x, ry: cf.right.y, rz: cf.right.z }); }
    // metres across the track from sample s to (x, z): on a banked track the
    // right vector climbs, so its level part is shorter than a metre
    function lateralOf(s, x, z) { return ((x - s.x) * s.rx + (z - s.z) * s.rz) / Math.max(s.rx * s.rx + s.rz * s.rz, 0.05); }
    function nearest(x, z) {
      var best = null, bd = Infinity;
      for (var j = 0; j < COARSE.length; j++) { var s = COARSE[j], dd = (s.x - x) * (s.x - x) + (s.z - z) * (s.z - z); if (dd < bd) { bd = dd; best = s; } }
      var lat = lateralOf(best, x, z);
      // y: the track surface's height there (the banking carried out to that point)
      return { d: best.d, distance: Math.sqrt(bd), lateral: lat, y: best.y + lat * best.ry, bank: Math.asin(clamp(best.ry, -1, 1)) };
    }

    // the loop must not run through itself
    for (var a = 0; a < COARSE.length; a += 2) for (var b = a + 12; b < COARSE.length; b += 2) {
      var A = COARSE[a], B = COARSE[b];
      if (Math.abs(A.d - B.d) < 30 || L - Math.abs(A.d - B.d) < 30) continue;
      if (Math.hypot(A.x - B.x, A.z - B.z) < hw * 2 + 2 && Math.abs(A.y - B.y) < 6) {
        warn('The track passes within ' + Math.round(Math.hypot(A.x - B.x, A.z - B.z)) + 'm of itself at ' + Math.round(A.d / L * 100) + '% and ' + Math.round(B.d / L * 100) + '% of the lap; spread the loop so it never overlaps.');
        a = COARSE.length; break;
      }
    }

    function ribbon(opts) {
      opts = opts || {};
      var w = opts.width != null ? opts.width : hw * 2, lift = opts.y != null ? opts.y : 0.02, off = opts.offset || 0;
      var n = Math.max(80, Math.round(L / (opts.step || 2)));
      var pos = new Float32Array((n + 1) * 2 * 3), uv = new Float32Array((n + 1) * 2 * 2), idx = [];
      var F = Frame(), tile = opts.tile || w;
      for (var s = 0; s <= n; s++) {
        var d = (s / n) * L; frameAt(d, F);
        for (var side = 0; side < 2; side++) {
          var lx = off + (side ? w / 2 : -w / 2), v = (s * 2 + side) * 3;
          pos[v] = F.pos.x + F.right.x * lx + F.up.x * lift;
          pos[v + 1] = F.pos.y + F.right.y * lx + F.up.y * lift;
          pos[v + 2] = F.pos.z + F.right.z * lx + F.up.z * lift;
          uv[(s * 2 + side) * 2] = side; uv[(s * 2 + side) * 2 + 1] = d / tile;
        }
        if (s < n) { var q = s * 2; idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); }
      }
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      g.setIndex(idx); g.computeVertexNormals();
      var mat = opts.material || new THREE.MeshStandardMaterial({ color: opts.color || '#8A6A4A', roughness: 0.95 });
      mat.side = THREE.DoubleSide;
      var mesh = new THREE.Mesh(g, mat);
      mesh.receiveShadow = true;
      mesh.userData.gmTrack = true;
      return mesh;
    }

    var ANISO = G ? Math.min(8, renderer.capabilities.getMaxAnisotropy()) : 4;
    function canvasTexture(w, h, draw, opts) {
      var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      draw(cv.getContext('2d'), w, h);
      var tex = new THREE.CanvasTexture(cv);
      // colour maps are sRGB; roughness, bump and other data maps are linear
      tex.colorSpace = opts && opts.linear ? THREE.NoColorSpace : THREE.SRGBColorSpace; tex.anisotropy = ANISO;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      return tex;
    }
    // a tangent-space normal map from a height field drawn in greys (white is
    // high): grain on a running track, weave in cloth, mortar between bricks
    function normalTexture(w, h, draw, strength) {
      var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      var g = cv.getContext('2d', { willReadFrequently: true });
      g.fillStyle = '#808080'; g.fillRect(0, 0, w, h);
      draw(g, w, h);
      var src = g.getImageData(0, 0, w, h).data, out = g.createImageData(w, h), o = out.data, k = Number(strength) || 2;
      function H(x, y) { x = (x + w) % w; y = (y + h) % h; return src[(y * w + x) * 4] / 255; }
      for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
        var nx = -(H(x + 1, y) - H(x - 1, y)) * k, ny = (H(x, y + 1) - H(x, y - 1)) * k, len = Math.sqrt(nx * nx + ny * ny + 1), q = (y * w + x) * 4;
        o[q] = (nx / len * 0.5 + 0.5) * 255; o[q + 1] = (ny / len * 0.5 + 0.5) * 255; o[q + 2] = (1 / len * 0.5 + 0.5) * 255; o[q + 3] = 255;
      }
      g.putImageData(out, 0, 0);
      var tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.NoColorSpace; tex.anisotropy = ANISO;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      return tex;
    }

    /* -------------------------------------------------------------- sky -- */
    // A sky dome with a sun: a gradient from the zenith to the horizon to the
    // ground, a warm haze on the horizon under the sun, and a glowing disc. It
    // is also what a cinematic world's image-based light is baked from, so the
    // light on every surface matches the sky above it.
    var skies = [], skyParams = null;
    function skyMaterial(p, sunScale) {
      return new THREE.ShaderMaterial({
        uniforms: {
          uTop: { value: new THREE.Color(p.top) }, uHorizon: { value: new THREE.Color(p.horizon) }, uBottom: { value: new THREE.Color(p.bottom) },
          uSunDir: { value: p.sunDir.clone() }, uSunColor: { value: new THREE.Color(p.sunColor) },
          uSunSize: { value: p.sunSize }, uGlow: { value: p.glow }, uSunPower: { value: p.sunPower * sunScale }, uHaze: { value: p.haze }, uCurve: { value: p.curve },
        },
        vertexShader: 'varying vec3 vDir; void main() { vDir = position; vec4 c = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = c.xyww; gl_Position.z *= 0.99999; }',
        fragmentShader: [
          'uniform vec3 uTop, uHorizon, uBottom, uSunDir, uSunColor; uniform float uSunSize, uGlow, uSunPower, uHaze, uCurve; varying vec3 vDir;',
          'void main() {',
          '  vec3 d = normalize(vDir); float h = d.y;',
          '  vec3 col = h > 0.0 ? mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), uCurve)) : mix(uHorizon, uBottom, pow(clamp(-h, 0.0, 1.0), 0.35));',
          '  float c = max(dot(d, uSunDir), 0.0);',
          '  col = mix(col, uSunColor, clamp(uHaze * pow(c, 4.0) * pow(1.0 - abs(h), 6.0), 0.0, 1.0));',
          '  col += uSunColor * uGlow * (0.3 * pow(c, 10.0) + 1.2 * pow(c, 220.0));',
          '  col += uSunColor * uSunPower * smoothstep(cos(uSunSize), cos(uSunSize * 0.8), dot(d, uSunDir));',
          '  gl_FragColor = vec4(col, 1.0);',
          '  #include <tonemapping_fragment>',
          '  #include <colorspace_fragment>',
          '}',
        ].join('\n'),
        side: THREE.BackSide, depthWrite: false, fog: false,
      });
    }
    // photographed skies are decoded once, for the visible sky and for the light
    var skyHdri = null, HDRI_TEX = {}, SKY_P90 = {};
    function sky(o) {
      o = o || {};
      var dir = Array.isArray(o.sun) && o.sun.length === 3 ? new THREE.Vector3(o.sun[0], o.sun[1], o.sun[2]) : new THREE.Vector3(0.45, 0.35, 0.3);
      if (dir.lengthSq() < 1e-6) dir.set(0.45, 0.35, 0.3);
      // a photographed sky from the library (ctx.sky({ hdri: 'sky-noon' })): turned
      // so its sun stands where the world's key light comes from, at the height
      // it was photographed at; mesh.userData.sun is that direction, for the light
      var HA = typeof o.hdri === 'string' && ASSETS[o.hdri] && ASSETS[o.hdri].rgbe ? ASSETS[o.hdri] : null;
      if (typeof o.hdri === 'string' && !HA) warn('ctx.sky: the sky "' + o.hdri + '" is not loaded; list it in assets. A painted sky was used.');
      if (HA) {
        // face: [x, z]: a photograph with land in it (a beach, a skyline) turned so
        // what it looks at (the sea, the towers) lies that way in the world; the
        // sun then stands where the photograph has it
        if (Array.isArray(o.face) && typeof HA.json.view === 'number' && (o.face[0] || o.face[1])) {
          var H0 = hdriTexture(HA), vphi = 2 * Math.PI * HA.json.view, vaz = Math.atan2(-Math.cos(vphi), Math.sin(vphi));
          var turn = Math.atan2(+o.face[0] || 0, +o.face[1] || 0) - vaz, saz = H0.az + turn;
          dir.set(Math.sin(saz), Math.max(0.05, Math.tan(H0.el)), Math.cos(saz));
        } else if (o.face && typeof HA.json.view !== 'number') warn('ctx.sky: the sky "' + o.hdri + '" has nothing to face (open sky all round); face was ignored.');
        // how bright it looks: as asked; under a preset (opt-in), exposed so its sky
        // sits at the preset's brightness whichever photograph it is (the library's
        // skies differ 25 times over), brought down as far as it needs but lifted only
        // a little (a deep blue noon pales if pushed); and, apart from that, how
        // strongly it lights the world (light), which otherwise follows the exposure
        var PS = G && G.preset, look = o.exposure != null ? num(o.exposure, 1, 0.1, 4) : PS ? clamp(PS.sky / skyP90(HA), 0.1, 1.25) : 1;
        var lit = o.light != null ? num(o.light, 1, 0, 4) : PS ? PS.light : look;
        var hm = hdriSphere(HA, dir.clone().normalize(), 1000, look);
        hm.frustumCulled = false; hm.renderOrder = -1000; hm.userData.gmSky = true;
        scene.add(hm); skies.push(hm); skyHdri = { A: HA, dir: dir.clone().normalize(), exposure: lit };
        return hm;
      }
      var p = {
        top: isHex(o.top) ? o.top : T.sky, horizon: isHex(o.horizon) ? o.horizon : T.fog, bottom: isHex(o.bottom) ? o.bottom : '#3A3A34',
        sunDir: dir.normalize(), sunColor: isHex(o.sunColor) ? o.sunColor : '#FFF1D6',
        sunSize: clamp(Number(o.sunSize) || 1.4, 0.3, 8) * Math.PI / 180,
        glow: clamp(o.glow == null ? 1 : Number(o.glow), 0, 6), sunPower: clamp(o.sunPower == null ? 12 : Number(o.sunPower), 0, 60), haze: clamp(o.haze == null ? 0.5 : Number(o.haze), 0, 1),
        curve: clamp(o.curve == null ? 0.45 : Number(o.curve), 0.15, 2.5),
      };
      var mesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24), skyMaterial(p, 1));
      mesh.frustumCulled = false; mesh.renderOrder = -1000; mesh.userData.gmSky = true;
      scene.add(mesh); skies.push(mesh); skyParams = p;
      return mesh;
    }

    /* ------------------------------------------------------------ water -- */
    // ctx.water(options): a sea, a lake or a river to the horizon. A grid
    // round the camera rolls with a few long Gerstner swells; the surface
    // ripples with two wind-blown normal maps crossing each other; it takes
    // the world's reflection from the runtime's mirror (at its height) or from
    // the sky; the sun glitters on the ripples; looking down, it deepens to
    // its deep colour. With a shore (a line of [x, z] points along the
    // waterline), surf breaks along it in lines of foam and the sand beside
    // it is wet. Returns the water mesh.
    var WATER = null;
    function water(o) {
      o = o || {};
      if (WATER) { warn('ctx.water was called twice; one water surface per world.'); return WATER.mesh; }
      var y = num(o.y, 0, -50, 200), waves = num(o.waves, 0.6, 0, 2), wind = Array.isArray(o.wind) ? new THREE.Vector2(o.wind[0] || 1, o.wind[1] || 0).normalize() : new THREE.Vector2(1, 0.25).normalize();
      var R0 = mulberry(911);
      // ripples: a height field of many soft bumps, wrapped, turned into a normal map
      var ripple = normalTexture(256, 256, function (g, w, h) {
        for (var i = 0; i < 900; i++) {
          var x = R0() * w, yy = R0() * h, r = 3 + R0() * 14, v = Math.round(128 + (R0() - 0.5) * 120);
          for (var dx = -1; dx <= 1; dx++) for (var dy = -1; dy <= 1; dy++) {
            var gr = g.createRadialGradient(x + dx * w, yy + dy * h, 0, x + dx * w, yy + dy * h, r);
            gr.addColorStop(0, 'rgba(' + v + ',' + v + ',' + v + ',0.5)'); gr.addColorStop(1, 'rgba(' + v + ',' + v + ',' + v + ',0)');
            g.fillStyle = gr; g.fillRect(x + dx * w - r, yy + dy * h - r, r * 2, r * 2);
          }
        }
      }, 3);
      ripple.wrapS = ripple.wrapT = THREE.RepeatWrapping;
      // the colour is what little light the water scatters back; the reflection of the
      // sky and the world does the rest, as it does on a real sea
      var shallow = new THREE.Color(isHex(o.color) ? o.color : '#1C9C9A'), deep = new THREE.Color(isHex(o.deep) ? o.deep : '#06303C');
      // with a shore, the water is only on its own side of it: the shore line and
      // two points far out to sea make the sea's outline, drawn soft into a mask
      // the surface is cut by (the swell dies away as it reaches the beach)
      var shorePts = Array.isArray(o.shore) ? o.shore.filter(function (q) { return Array.isArray(q) && isFinite(q[0]) && isFinite(q[1]); }).map(function (q) { return [+q[0], +q[1]]; }) : [];
      var mask = null, mMin = new THREE.Vector2(), mSize = 1, trackPts = [];
      for (var tk = 0; tk < 96; tk++) { var tp0 = pointAt(tk / 96 * L, 0, 0); trackPts.push([tp0.x, tp0.z]); }
      if (shorePts.length >= 2) {
        // the sea is never on the track's side of the shore: whichever way round
        // the shore was walked, it is turned so the sea lies on its left
        var votes = 0;
        trackPts.forEach(function (tq) {
          var best = Infinity, sd = 0;
          for (var si = 1; si < shorePts.length; si++) {
            var ax = shorePts[si - 1][0], az = shorePts[si - 1][1], dx = shorePts[si][0] - ax, dz = shorePts[si][1] - az, ll = dx * dx + dz * dz || 1;
            var uu = clamp(((tq[0] - ax) * dx + (tq[1] - az) * dz) / ll, 0, 1), px = ax + dx * uu, pz = az + dz * uu, dd = (tq[0] - px) * (tq[0] - px) + (tq[1] - pz) * (tq[1] - pz);
            if (dd < best) { best = dd; sd = -dz * (tq[0] - px) + dx * (tq[1] - pz); }
          }
          votes += sd > 0 ? 1 : sd < 0 ? -1 : 0;
        });
        if (votes > 0) { shorePts.reverse(); warn('ctx.water: the shore was walked with the track on its left, where the sea goes; it was turned round so the sea lies away from the track.'); }
        // the mask covers the shore and the track with room round them, about 2 m a pixel
        var bx0 = Infinity, bz0 = Infinity, bx1 = -Infinity, bz1 = -Infinity;
        shorePts.concat(trackPts).forEach(function (q) { bx0 = Math.min(bx0, q[0]); bx1 = Math.max(bx1, q[0]); bz0 = Math.min(bz0, q[1]); bz1 = Math.max(bz1, q[1]); });
        var span = clamp(Math.max(bx1 - bx0, bz1 - bz0) + 1600, 1200, 8000); mMin.set((bx0 + bx1) / 2 - span / 2, (bz0 + bz1) / 2 - span / 2); mSize = span;
        var first = shorePts[0], second = shorePts[1], last = shorePts[shorePts.length - 1], prev = shorePts[shorePts.length - 2];
        var lx = -(second[1] - first[1]), lz = second[0] - first[0], l0 = Math.hypot(lx, lz) || 1, ex = -(last[1] - prev[1]), ez = last[0] - prev[0], l1 = Math.hypot(ex, ez) || 1;
        var far = span * 2;
        var poly = [[first[0] - (second[0] - first[0]) / l0 * far + lx / l0 * far, first[1] - (second[1] - first[1]) / l0 * far + lz / l0 * far]].concat(shorePts, [[last[0] + (last[0] - prev[0]) / l1 * far + ex / l1 * far, last[1] + (last[1] - prev[1]) / l1 * far + ez / l1 * far]]);
        var MPX = 2048;
        mask = canvasTexture(MPX, MPX, function (g, w, h) {
          var mpp = mSize / w;
          g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
          // the shallows fade over about 15 m, whatever the mask's scale
          g.filter = 'blur(' + Math.max(1, 15 / mpp / 2).toFixed(1) + 'px)'; g.fillStyle = '#FFF'; g.beginPath();
          poly.forEach(function (q, k) { var px = (q[0] - mMin.x) / mSize * w, py = (q[1] - mMin.y) / mSize * h; if (k) g.lineTo(px, py); else g.moveTo(px, py); });
          g.closePath(); g.fill();
          // and never on the road: the track and a margin beside it are land
          g.filter = 'blur(' + Math.max(1, 2 / mpp).toFixed(1) + 'px)'; g.strokeStyle = '#000'; g.lineJoin = g.lineCap = 'round'; g.lineWidth = (hw + 4) * 2 / mpp; g.beginPath();
          trackPts.concat([trackPts[0]]).forEach(function (q, k) { var px = (q[0] - mMin.x) / mSize * w, py = (q[1] - mMin.y) / mSize * h; if (k) g.lineTo(px, py); else g.moveTo(px, py); });
          g.stroke();
        }, { linear: true });
        mask.wrapS = mask.wrapT = THREE.ClampToEdgeWrapping; mask.flipY = false; mask.needsUpdate = true;
      }
      var mat = new THREE.MeshPhysicalMaterial({ color: deep, roughness: 0.05, metalness: 0, normalMap: ripple, normalScale: new THREE.Vector2(0.5, 0.5), specularIntensity: 1, envMapIntensity: 1.2, transparent: true });
      var U = { uTime: { value: 0 }, uWaves: { value: waves }, uWind: { value: wind }, uDeep: { value: deep }, uCam: { value: new THREE.Vector3() },
        uMask: { value: mask }, uMaskOn: { value: mask ? 1 : 0 }, uMaskMin: { value: mMin }, uMaskSize: { value: mSize }, uShallow: { value: shallow } };
      mat.onBeforeCompile = function (sh) {
        Object.assign(sh.uniforms, U);
        sh.vertexShader = 'uniform float uTime, uWaves, uMaskOn, uMaskSize; uniform vec2 uWind, uMaskMin; uniform sampler2D uMask; varying vec3 vWWorld;\n' + sh.vertexShader
          // the swell (three long Gerstner waves from the wind's quarter), worked out
          // where the normal is, so the lighting rolls with it; it fades at the grid's rim
          .replace('#include <beginnormal_vertex>', [
            '#include <beginnormal_vertex>',
            'vec4 gmW0 = modelMatrix * vec4( position, 1.0 );',
            'vec3 gmDisp = vec3( 0.0 ); vec2 gmSlope = vec2( 0.0 );',
            'for ( int k = 0; k < 3; k++ ) {',
            '  float fk = float( k ); vec2 dir = normalize( uWind + vec2( sin( fk * 2.1 ), cos( fk * 1.7 ) ) * 0.35 );',
            '  float lambda = 42.0 / ( 1.0 + fk * 0.9 ), kk = 6.2831 / lambda, amp = uWaves * 0.5 / ( 1.0 + fk * 1.1 ), sp = sqrt( 9.8 / kk );',
            '  float ph = kk * dot( dir, gmW0.xz ) - sp * kk * uTime;',
            '  gmDisp.xz += dir * amp * 0.5 * cos( ph ); gmDisp.y += amp * sin( ph );',
            '  gmSlope += dir * kk * amp * cos( ph );',
            '}',
            'float gmFade = 1.0 - smoothstep( 300.0, 900.0, length( gmW0.xz - cameraPosition.xz ) );',
            'if ( uMaskOn > 0.5 ) gmFade *= smoothstep( 0.35, 1.0, texture2D( uMask, ( gmW0.xz - uMaskMin ) / uMaskSize ).r );',
            'gmDisp *= gmFade; objectNormal = normalize( vec3( -gmSlope.x * gmFade, 1.0, -gmSlope.y * gmFade ) );',
          ].join('\n'))
          .replace('#include <begin_vertex>', '#include <begin_vertex>\n  transformed += gmDisp;')
          .replace('#include <project_vertex>', '#include <project_vertex>\n  vWWorld = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
        sh.fragmentShader = 'uniform float uTime, uMaskOn, uMaskSize; uniform vec2 uWind, uMaskMin; uniform sampler2D uMask; uniform vec3 uDeep, uShallow; varying vec3 vWWorld;\n' + sh.fragmentShader
          .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n  if ( uMaskOn > 0.5 && texture2D( uMask, ( vWWorld.xz - uMaskMin ) / uMaskSize ).r < 0.5 ) discard;')
          .replace('#include <normal_fragment_maps>', [
            // two ripple layers blown across each other, applied in the world (the
            // water lies flat) on top of the swell's own tilt
            'vec2 wuv = vWWorld.xz;',
            'vec3 rn1 = texture2D( normalMap, wuv / 9.0 + uWind * uTime * 0.035 ).xyz * 2.0 - 1.0;',
            'vec3 rn2 = texture2D( normalMap, wuv / 23.0 - vec2( uWind.y, -uWind.x ) * uTime * 0.02 ).xyz * 2.0 - 1.0;',
            'vec2 rip = ( rn1.xy + rn2.xy ) * normalScale;',
            'vec3 nW = normalize( ( vec4( normal, 0.0 ) * viewMatrix ).xyz );',
            'nW = normalize( nW + vec3( rip.x, 0.0, -rip.y ) );',
            'normal = normalize( ( viewMatrix * vec4( nW, 0.0 ) ).xyz );',
          ].join('\n'))
          .replace('#include <color_fragment>', [
            '#include <color_fragment>',
            // by the shore the water is shallow: turquoise, and clear enough to see the sand
            'float sea = uMaskOn > 0.5 ? texture2D( uMask, ( vWWorld.xz - uMaskMin ) / uMaskSize ).r : 1.0;',
            'float shallowK = 1.0 - smoothstep( 0.5, 0.9, sea );',
            'float lookDown = clamp( abs( normalize( cameraPosition - vWWorld ).y ), 0.0, 1.0 );',
            'diffuseColor.rgb = mix( uDeep * ( 0.7 + 0.3 * lookDown ), uShallow, shallowK );',
            'diffuseColor.a = mix( 1.0, 0.45 + 0.25 * ( 1.0 - lookDown ), shallowK );',
          ].join('\n'));
      };
      // a grid round the camera, dense near and sparse far, riding with it
      var segs = quality === 'low' ? 96 : 192, size = num(o.size, 3000, 200, 12000);
      var geo = new THREE.PlaneGeometry(size, size, segs, segs); geo.rotateX(-Math.PI / 2);
      var gp = geo.attributes.position;
      for (var i = 0; i < gp.count; i++) { var x = gp.getX(i), z = gp.getZ(i), r = Math.hypot(x, z) / (size / 2), k = Math.pow(r, 2.2) / Math.max(r, 1e-4); gp.setX(i, x * k); gp.setZ(i, z * k); }
      geo.computeBoundingSphere(); geo.boundingSphere.radius = size;
      var mesh = new THREE.Mesh(geo, mat); mesh.position.y = y; mesh.frustumCulled = false; mesh.receiveShadow = true; mesh.userData.gmTrack = true;
      // the world's reflection, when no other mirror sits at another height
      if (o.reflect !== false && (!MIR || Math.abs(MIR.y - y) < 1e-3)) mirror(mat, { y: y, strength: num(o.reflect, 0.9, 0, 2), blur: 0.08, distortion: 0.05 });
      scene.add(mesh);
      WATER = { mesh: mesh, U: U, y: y, grid: size / segs };
      // a beach (o.beach: { land, width, texture }): sand from the land's height at
      // the top of the shore down under the water, so the waterline is where the
      // two meet, the shallows show sand through them, and the surf runs up it
      if (o.beach && shorePts.length >= 2) {
        var B = o.beach === true ? {} : o.beach, landY = num(B.land, y + 0.3, -50, 200), bw = num(B.width, 40, 6, 200), up = bw * 0.35, back = num(B.back, 20, 0, 200);
        WATER.beachAt = function (off) { return off < 0 ? landY + (y - landY) * Math.max(0, 1 + off / up) : y - Math.pow(off / bw, 1.3) * 2.2; };
        var bsrc = typeof B.texture === 'string' && ASSETS[B.texture] ? ASSETS[B.texture] : ASSETS['texture-sand'];
        var bpos = [], buv = [], bidx = [], along = 0, rows = 8;
        for (var bj = 0; bj < shorePts.length; bj++) {
          var ba = shorePts[Math.max(0, bj - 1)], bb = shorePts[Math.min(shorePts.length - 1, bj + 1)], btxv = bb[0] - ba[0], btz = bb[1] - ba[1], btl = Math.hypot(btxv, btz) || 1;
          var bnx = -btz / btl, bnz = btxv / btl; // toward the water
          if (bj) along += Math.hypot(shorePts[bj][0] - shorePts[bj - 1][0], shorePts[bj][1] - shorePts[bj - 1][1]);
          // a flat backshore first (to meet the world's own ground), then the beach
          for (var br = 0; br <= rows; br++) {
            var off = br === 0 ? -up - back : -up + (up + bw) * (br - 1) / (rows - 1);
            // a gentle beach above the waterline, then shelving away under it
            var hy = WATER.beachAt(off);
            bpos.push(shorePts[bj][0] + bnx * off, hy, shorePts[bj][1] + bnz * off); buv.push(off / 4, along / 4);
          }
          if (bj) for (var br2 = 0; br2 < rows; br2++) { var qa = (bj - 1) * (rows + 1) + br2, qb = qa + rows + 1; bidx.push(qa, qa + 1, qb, qa + 1, qb + 1, qb); }
        }
        var bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.Float32BufferAttribute(bpos, 3)); bg.setAttribute('uv', new THREE.Float32BufferAttribute(buv, 2)); bg.setIndex(bidx); bg.computeVertexNormals();
        var bmat = bsrc && bsrc.json.kind === 'texture' ? surfaceMaterial(bsrc, {}) : new THREE.MeshStandardMaterial({ color: '#D9C7A0', roughness: 0.95 });
        var bm = new THREE.Mesh(bg, bmat); bm.receiveShadow = true; bm.userData.gmTrack = true; scene.add(bm);
        WATER.beach = bm;
      }
      // surf: foam lines that roll in along the shore, and wet sand behind them
      if (shorePts.length >= 2) {
        var pts = shorePts;
        var fpos = [], fuv = [], fidx = [], acc = 0, W = num(o.surf, 14, 2, 60), FC = 8;
        for (var j = 0; j < pts.length; j++) {
          var a = pts[Math.max(0, j - 1)], b = pts[Math.min(pts.length - 1, j + 1)], tx = b[0] - a[0], tz = b[1] - a[1], tl = Math.hypot(tx, tz) || 1;
          // the side toward the water is the left of the line's direction
          var nx = -tz / tl, nz = tx / tl;
          if (j) acc += Math.hypot(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1]);
          // across the strip in steps, lying on the beach above the waterline and
          // just over the water below it
          for (var fc = 0; fc <= FC; fc++) {
            var fu = fc / FC, off = -W * 0.35 + W * 1.35 * fu, fy = y + 0.05;
            if (WATER.beachAt && off < 0) fy = WATER.beachAt(off) + 0.03;
            fpos.push(pts[j][0] + nx * off, fy, pts[j][1] + nz * off); fuv.push(fu, acc);
          }
          if (j) for (var fc2 = 0; fc2 < FC; fc2++) { var q0 = (j - 1) * (FC + 1) + fc2, q1 = q0 + FC + 1; fidx.push(q0, q0 + 1, q1, q0 + 1, q1 + 1, q1); }
        }
        var fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.Float32BufferAttribute(fpos, 3)); fg.setAttribute('uv', new THREE.Float32BufferAttribute(fuv, 2)); fg.setIndex(fidx); fg.computeVertexNormals();
        var foam = new THREE.ShaderMaterial({
          uniforms: Object.assign({ uTime: U.uTime }, THREE.UniformsUtils.clone(THREE.UniformsLib.fog)), transparent: true, depthWrite: false, fog: true, side: THREE.DoubleSide,
          vertexShader: '#include <fog_pars_vertex>\nvarying vec2 vUv; void main() { vUv = uv; vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 ); gl_Position = projectionMatrix * mvPosition;\n#include <fog_vertex>\n}',
          fragmentShader: [
            '#include <fog_pars_fragment>',
            'uniform float uTime; varying vec2 vUv;',
            'float h( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }',
            'float n( vec2 p ) { vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f ); return mix( mix( h( i ), h( i + vec2( 1, 0 ) ), f.x ), mix( h( i + vec2( 0, 1 ) ), h( i + vec2( 1, 1 ) ), f.x ), f.y ); }',
            'void main() {',
            // across: 0 is up the sand, 0.26 the waterline, 1 out at sea; waves roll in every 7 s
            '  float x = vUv.x, along = vUv.y;',
            '  float wet = smoothstep( 0.04, 0.2, x ) * ( 1.0 - smoothstep( 0.26, 0.32, x ) );',
            '  float f = 0.0;',
            '  for ( int k = 0; k < 3; k++ ) { float ph = fract( uTime / 7.0 + float( k ) / 3.0 ); float line = mix( 1.0, 0.1, ph * ( 2.0 - ph ) ); float w = 0.03 + 0.05 * ph;',
            '    float band = 1.0 - smoothstep( 0.0, w, abs( x - line - n( vec2( along * 0.08, uTime * 0.2 + float( k ) * 9.0 ) ) * 0.05 ) );',
            '    f = max( f, band * ( 1.0 - ph * 0.6 ) * smoothstep( 0.2, 0.7, n( vec2( along * 0.3, float( k ) * 3.0 + floor( uTime / 7.0 + float( k ) / 3.0 ) ) ) + 0.4 ) ); }',
            // foam is lace: broad patches with holes worn through them
            '  float lace = n( vec2( along * 0.6, x * 30.0 + uTime ) ) * 0.6 + n( vec2( along * 2.7, x * 95.0 - uTime * 0.7 ) ) * 0.4;',
            '  float a = clamp( f * smoothstep( 0.2, 0.62, lace ) * 1.3, 0.0, 1.0 );',
            '  float wa = wet * 0.32; float al = a + wa * ( 1.0 - a );',
            '  vec3 col = ( vec3( 0.92, 0.95, 0.96 ) * a + vec3( 0.05, 0.04, 0.03 ) * wa * ( 1.0 - a ) ) / max( al, 1e-4 );',
            '  gl_FragColor = vec4( col, al );',
            '  #include <fog_fragment>',
            '}',
          ].join('\n'),
        });
        var fm = new THREE.Mesh(fg, foam); fm.renderOrder = 2; fm.userData.gmTrack = true; fm.userData.noReflection = true; scene.add(fm);
        WATER.foam = fm;
      }
      return mesh;
    }
    function stepWater(t) {
      if (!WATER) return;
      WATER.U.uTime.value = t;
      // the grid rides with the camera, snapped to its own spacing so the swell does not swim
      var g = WATER.grid * 4;
      WATER.mesh.position.x = Math.round(camera.position.x / g) * g; WATER.mesh.position.z = Math.round(camera.position.z / g) * g;
    }

    var DUMMY = new THREE.Object3D();
    function instanced(geometry, material, count, fn) {
      var im = new THREE.InstancedMesh(geometry, material, count);
      for (var n = 0; n < count; n++) { DUMMY.position.set(0, 0, 0); DUMMY.rotation.set(0, 0, 0); DUMMY.scale.set(1, 1, 1); fn(n, DUMMY); DUMMY.updateMatrix(); im.setMatrixAt(n, DUMMY.matrix); }
      im.instanceMatrix.needsUpdate = true;
      return im;
    }


    /* ---------------------------------------------------------- mirrors -- */
    // ctx.mirror(material, options): a level surface (ice, still water, a
    // polished floor) that reflects the world as it moves. Each frame the
    // runtime renders the scene once more from the camera mirrored under the
    // plane, at part of the screen's resolution, with everything under the
    // plane clipped away. The material takes that picture as its reflection:
    // its clear coat's when it has one (ice over paint, varnish over wood),
    // bent by its normal map, softened by its roughness and weighted by
    // Fresnel like any other light, so it shines at a glance and fades when
    // looked down on. Every mirror in a world lies at one height.
    /* -------------------------------------------------------- broadcast -- */
    // ctx.broadcast(): a live television picture of the race, for a world's
    // big screens. The runtime's own TV camera cuts between a rail camera
    // alongside the player, a long lens head-on from down the track and a
    // high wide shot, and renders the world through it every other frame at
    // 640 by 360. Returns a texture (linear light, for an emissiveMap), or
    // null on phones and tablets, where it would cost too much.
    var BC = null;
    function broadcast() {
      if (BC) return BC.rt ? BC.rt.texture : null;
      BC = { rt: null, cam: new THREE.PerspectiveCamera(24, 16 / 9, 0.5, 900), shot: 0, t: 0, n: 0, look: new THREE.Vector3(), pos: new THREE.Vector3(), F: Frame(), G: Frame() };
      if (quality === 'low') return null;
      var half = renderer.capabilities.isWebGL2 || renderer.extensions.has('OES_texture_half_float');
      BC.rt = new THREE.WebGLRenderTarget(640, 360, { type: half ? THREE.HalfFloatType : THREE.UnsignedByteType, samples: renderer.capabilities.isWebGL2 ? 4 : 0 });
      return BC.rt.texture;
    }
    var BC_SHOTS = [
      // rail: beside the player on the outside, a long lens
      function (c, F) { c.fov = 26; BC.pos.copy(pointAt(player.d - 1.5 * VS, hw + 3.4, 1.7, BC.pos)); BC.look.copy(pointAt(player.d + 0.6 * VS, player.x, 0.85, BC.look)); },
      // head-on from 30 m down the track: the lens stacks the pack up
      function (c, F) { c.fov = 13; BC.pos.copy(pointAt(player.d + 30 * VS, player.x * 0.4, 1.5, BC.pos)); BC.look.copy(pointAt(player.d - 2 * VS, player.x, 0.8, BC.look)); },
      // high and wide from the inside
      function (c, F) { c.fov = 34; BC.pos.copy(pointAt(player.d - 10 * VS, -hw - 16, 14, BC.pos)); BC.look.copy(pointAt(player.d + 8 * VS, player.x, 0.5, BC.look)); },
    ];
    function broadcastPass(dt) {
      if (!BC || !BC.rt) return;
      BC.t += dt; BC.n++;
      if (BC.t > 6.5) { BC.t = 0; BC.shot = (BC.shot + 1) % BC_SHOTS.length; }
      if (BC.n % 2) return;
      BC.frames = (BC.frames || 0) + 1;
      var c = BC.cam; BC_SHOTS[BC.shot](c);
      c.position.copy(BC.pos); c.lookAt(BC.look); c.updateProjectionMatrix(); c.updateMatrixWorld();
      var rt0 = renderer.getRenderTarget(), sm = renderer.shadowMap.autoUpdate, i;
      renderer.shadowMap.autoUpdate = false;
      if (MIR) for (i = 0; i < MIR.mats.length; i++) MIR.mats[i].visible = true;
      renderer.setRenderTarget(BC.rt); renderer.render(scene, c);
      renderer.setRenderTarget(rt0); renderer.shadowMap.autoUpdate = sm;
    }
    var MIR = null;
    var MV = { n: new THREE.Vector3(0, 1, 0), p: new THREE.Vector3(), c: new THREE.Vector3(), view: new THREE.Vector3(), look: new THREE.Vector3(), target: new THREE.Vector3(), rot: new THREE.Matrix4(), plane: new THREE.Plane(), clip: new THREE.Vector4(), q: new THREE.Vector4(), size: new THREE.Vector2() };
    function mirror(material, o) {
      if (!material || !material.isMeshStandardMaterial) { warn('ctx.mirror needs a MeshStandardMaterial or MeshPhysicalMaterial.'); return material; }
      o = o || {};
      if (!MIR) MIR = { y: num(o.y, 0, -50, 200), mats: [], rt: null, cam: new THREE.PerspectiveCamera(), scale: quality === 'low' ? 0.35 : 0.5, on: true, frames: 0,
        uniforms: { tex: { value: null }, mat: { value: new THREE.Matrix4() }, on: { value: 0 } } };
      else if (o.y != null && Math.abs(Number(o.y) - MIR.y) > 1e-3) warn('Every mirror in a world lies at one height (' + MIR.y + ' m); ctx.mirror at ' + o.y + ' m used ' + MIR.y + ' m.');
      var U = { gmMirror: MIR.uniforms.tex, gmMirrorMatrix: MIR.uniforms.mat, gmMirrorOn: MIR.uniforms.on,
        gmMirrorStrength: { value: num(o.strength, 1, 0, 2) }, gmMirrorBlur: { value: num(o.blur, 0.15, 0, 1) }, gmMirrorDistort: { value: num(o.distortion, 0.015, 0, 0.2) } };
      var prev = material.onBeforeCompile;
      material.onBeforeCompile = function (sh, r) {
        if (prev) prev.call(this, sh, r);
        Object.assign(sh.uniforms, U);
        sh.vertexShader = 'varying vec3 vGmWorld;\n' + sh.vertexShader.replace('#include <project_vertex>', [
          '#include <project_vertex>',
          '{ vec4 gw = vec4( transformed, 1.0 );',
          '#ifdef USE_INSTANCING',
          '  gw = instanceMatrix * gw;',
          '#endif',
          '  vGmWorld = ( modelMatrix * gw ).xyz; }',
        ].join('\n'));
        sh.fragmentShader = 'varying vec3 vGmWorld;\nuniform sampler2D gmMirror; uniform mat4 gmMirrorMatrix; uniform float gmMirrorOn, gmMirrorStrength, gmMirrorBlur, gmMirrorDistort;\n' +
          sh.fragmentShader.replace('#include <lights_fragment_maps>', [
            '#include <lights_fragment_maps>',
            '#if defined( RE_IndirectSpecular )',
            'if ( gmMirrorOn > 0.5 ) {',
            '  vec3 gmWN = normalize( ( vec4( geometryNormal, 0.0 ) * viewMatrix ).xyz );',
            '  vec4 gmP = gmMirrorMatrix * vec4( vGmWorld, 1.0 );',
            '  vec2 gmUv = gmP.xy / gmP.w + gmWN.xz * gmMirrorDistort;',
            '  float gmEdge = smoothstep( 0.0, 0.03, gmUv.x ) * smoothstep( 0.0, 0.03, 1.0 - gmUv.x ) * smoothstep( 0.0, 0.03, gmUv.y ) * smoothstep( 0.0, 0.03, 1.0 - gmUv.y );',
            '  #ifdef USE_CLEARCOAT',
            '  float gmR = material.clearcoatRoughness;',
            '  #else',
            '  float gmR = material.roughness;',
            '  #endif',
            // sharp at a glance along the surface, softer looking down into it,
            // where what it reflects is far overhead
            '  float gmNdV = clamp( dot( geometryNormal, geometryViewDir ), 0.0, 1.0 );',
            '  vec3 gmC = texture2D( gmMirror, clamp( gmUv, 0.001, 0.999 ), gmMirrorBlur * ( 2.0 + 36.0 * gmNdV * gmNdV ) + gmR * 7.0 ).rgb * gmMirrorStrength;',
            '  #if __VERSION__ >= 300',
            '  if ( any( isnan( gmC ) ) || any( isinf( gmC ) ) ) gmC = vec3( 0.0 );',
            '  #endif',
            '  #ifdef USE_CLEARCOAT',
            '  clearcoatRadiance = mix( clearcoatRadiance, gmC, gmEdge );',
            '  #else',
            '  radiance = mix( radiance, gmC, gmEdge );',
            '  #endif',
            '}',
            '#endif',
          ].join('\n'));
      };
      material.needsUpdate = true;
      if (MIR.mats.indexOf(material) < 0) MIR.mats.push(material);
      return material;
    }
    // the camera mirrored under the plane (after three.js's Reflector), and an
    // oblique near plane so nothing below the surface gets into the picture
    function mirrorPass() {
      if (!MIR) return;
      MIR.uniforms.on.value = 0;
      if (!MIR.on) return;
      camera.updateMatrixWorld();
      MV.c.setFromMatrixPosition(camera.matrixWorld);
      if (MV.c.y <= MIR.y + 0.02) return;
      var bs = renderer.getDrawingBufferSize(MV.size), w = Math.max(16, Math.round(bs.x * MIR.scale)), h = Math.max(16, Math.round(bs.y * MIR.scale));
      if (!MIR.rt) {
        var half = renderer.capabilities.isWebGL2 || renderer.extensions.has('OES_texture_half_float');
        MIR.rt = new THREE.WebGLRenderTarget(w, h, { type: half ? THREE.HalfFloatType : THREE.UnsignedByteType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
      } else if (MIR.rt.width !== w || MIR.rt.height !== h) MIR.rt.setSize(w, h);
      MV.p.set(MV.c.x, MIR.y, MV.c.z);
      MV.view.subVectors(MV.p, MV.c).reflect(MV.n).negate().add(MV.p);
      MV.rot.extractRotation(camera.matrixWorld);
      MV.look.set(0, 0, -1).applyMatrix4(MV.rot).add(MV.c);
      MV.target.subVectors(MV.p, MV.look).reflect(MV.n).negate().add(MV.p);
      var vc = MIR.cam;
      vc.position.copy(MV.view);
      vc.up.set(0, 1, 0).applyMatrix4(MV.rot).reflect(MV.n);
      vc.lookAt(MV.target);
      vc.far = camera.far; vc.near = camera.near;
      vc.updateMatrixWorld();
      vc.projectionMatrix.copy(camera.projectionMatrix);
      MIR.uniforms.mat.value.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1).multiply(vc.projectionMatrix).multiply(vc.matrixWorldInverse);
      MV.plane.setFromNormalAndCoplanarPoint(MV.n, MV.p).applyMatrix4(vc.matrixWorldInverse);
      MV.clip.set(MV.plane.normal.x, MV.plane.normal.y, MV.plane.normal.z, MV.plane.constant);
      var pe = vc.projectionMatrix.elements;
      MV.q.set((Math.sign(MV.clip.x) + pe[8]) / pe[0], (Math.sign(MV.clip.y) + pe[9]) / pe[5], -1, (1 + pe[10]) / pe[14]);
      MV.clip.multiplyScalar(2 / MV.clip.dot(MV.q));
      pe[2] = MV.clip.x; pe[6] = MV.clip.y; pe[10] = MV.clip.z + 1 - 0.003; pe[14] = MV.clip.w;
      vc.projectionMatrixInverse.copy(vc.projectionMatrix).invert();
      // the mirrors sit their own picture out, as does anything a world marked
      // userData.noReflection (a far crowd, roof clutter); the shadow maps are the main pass's
      if (!MIR.skip || MIR.frames % 120 === 0) { MIR.skip = []; scene.traverse(function (ob) { if (ob.userData && ob.userData.noReflection && ob.visible) MIR.skip.push(ob); }); }
      var i, rt0 = renderer.getRenderTarget(), sm = renderer.shadowMap.autoUpdate;
      for (i = 0; i < MIR.mats.length; i++) MIR.mats[i].visible = false;
      for (i = 0; i < MIR.skip.length; i++) MIR.skip[i].visible = false;
      renderer.shadowMap.autoUpdate = false;
      renderer.setRenderTarget(MIR.rt);
      renderer.render(scene, vc);
      renderer.setRenderTarget(rt0);
      renderer.shadowMap.autoUpdate = sm;
      for (i = 0; i < MIR.mats.length; i++) MIR.mats[i].visible = true;
      for (i = 0; i < MIR.skip.length; i++) MIR.skip[i].visible = true;
      MIR.uniforms.tex.value = MIR.rt.texture; MIR.uniforms.on.value = 1; MIR.frames++;
    }

    var scenery = new THREE.Group(); scenery.name = 'scenery'; scene.add(scenery);
    // phones and tablets get 'low': a world builds lighter there (fewer
    // instances, simpler meshes); the rules and the track stay the same
    var coarse = false; try { coarse = window.matchMedia('(pointer: coarse)').matches; } catch (e) {}
    var quality = coarse || Math.min(window.screen.width || 1280, window.screen.height || 720) < 600 ? 'low' : 'high';
    var ctx = {
      THREE: THREE, scene: scene, scenery: scenery, camera: camera, renderer: renderer,
      rules: R, theme: T, quality: quality,
      random: mulberry(hashStr(meta.title || 'world')),
      track: {
        length: L, halfWidth: hw, width: hw * 2,
        frameAt: function (d) { return frameAt(d, Frame()); },
        pointAt: pointAt, nearest: nearest, ribbon: ribbon,
        // is (x, z) far enough from the racing line to put scenery there?
        clear: function (x, z, margin) { return nearest(x, z).distance > hw + (margin == null ? 3 : margin); },
      },
      textures: { canvas: canvasTexture, normal: normalTexture },
      instanced: instanced,
      mirror: mirror,
      water: water,
      broadcast: broadcast,
      sky: sky,
      audio: null,
      // the world's platform options, as the runtime read them
      play: { coins: PLAY.coins, bounty: PLAY.bounty ? Object.assign({}, PLAY.bounty) : null, combat: !!PLAY.combat, vehicle: PLAY.vehicle, hazards: PLAY.hazards },
      // moments a world can stage: 'lap' ({ lap, bounty, gm }), 'swing' ({ n }),
      // 'slay' ({ name, slain }), 'crash' ({ into }), 'start' ({})
      on: function (name, fn) { if (typeof fn === 'function' && /^(lap|swing|slay|crash|start|beat)$/.test(name)) (EVENTS[name] || (EVENTS[name] = [])).push(fn); },
    };
    var EVENTS = {};
    function emit(name, data) {
      (EVENTS[name] || []).forEach(function (fn) { try { fn(data || {}); } catch (e) { fail('A ' + name + ' handler threw: ' + (e && e.message || e)); } });
    }

    /* ------------------------------------------------ library humans -- */
    // ctx.assets.human(id, options): a realistic, rigged, motion-captured
    // person from the library, dressed and animated, returned in exactly the
    // shape player() and rival() return. Geometry and motion are shared by
    // every instance; each instance gets its own skeleton, kit and mixer.
    var LOWQ = lowQuality(), factories = {};
    function hexRgb(h, d) { h = isHex(h) ? h : d; var n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
    function humanFactory(A) {
      var J = A.json, L = J.layout;
      var TYPES = { Float32Array: Float32Array, Int16Array: Int16Array, Uint16Array: Uint16Array, Uint32Array: Uint32Array, Uint8Array: Uint8Array, Int8Array: Int8Array };
      function view(buf, e) { return new TYPES[e.type](buf, e.offset, e.length); }
      var geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(view(A.body, L.position), 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(view(A.body, L.normal), 3, true));
      geo.setAttribute('uv', new THREE.BufferAttribute(view(A.body, L.uv), 2, true));
      geo.setAttribute('skinIndex', new THREE.BufferAttribute(view(A.body, L.skinIndex), 4));
      // each vertex's weights sum to one: a few hair vertices in the library's
      // athletes were weighted twice over and stood a spike twice head height
      var swv = view(A.body, L.skinWeight);
      for (var wi = 0; wi < swv.length; wi += 4) {
        var ws = swv[wi] + swv[wi + 1] + swv[wi + 2] + swv[wi + 3];
        if (ws > 256) { var wr = 255, wb = 0; for (var wk = 0; wk < 4; wk++) { swv[wi + wk] = Math.round(swv[wi + wk] * 255 / ws); wr -= swv[wi + wk]; if (swv[wi + wk] > swv[wi + wb]) wb = wk; } swv[wi + wb] += wr; }
      }
      geo.setAttribute('skinWeight', new THREE.BufferAttribute(swv, 4, true));
      geo.setIndex(new THREE.BufferAttribute(view(A.body, L.index), 1));
      var morphNames = Object.keys(J.morphs);
      geo.morphAttributes.position = morphNames.map(function (m) {
        var src = view(A.body, L['morph:' + m]), f = new Float32Array(src.length), k = J.morphs[m];
        for (var i = 0; i < src.length; i++) f[i] = src[i] * k;
        return new THREE.BufferAttribute(f, 3);
      });
      geo.morphTargetsRelative = true;
      J.groups.forEach(function (g, i) { geo.addGroup(g.start, g.count, i); });
      // the parts by name, in group order (body, eyes, brows, hair:...), for worlds that fit gear to a face
      geo.userData.groups = J.groups.map(function (g) { return g.name; });
      geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, J.height / 2, 0), J.height);

      function tex(name, srgb) {
        var bm = A.images[name]; if (!bm) return null;
        var t = new THREE.Texture(bm); t.flipY = false; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        t.anisotropy = ANISO; t.needsUpdate = true; return t;
      }
      var skins = {}, hairs = {}, eyes = {};
      for (var s in J.textures.skins) skins[s] = tex(LOWQ ? J.textures.skins[s].lo : J.textures.skins[s].hi, true);
      for (var h in J.textures.hair) hairs[h] = tex(J.textures.hair[h], true);
      // the eye's texture coordinates run the other way up from the body's:
      // unflipped, both eyes sample the grey between the two eyeballs in the
      // atlas and render solid white, which only shows in a close-up
      for (var y in J.textures.eyes) { eyes[y] = tex(J.textures.eyes[y], true); eyes[y].wrapT = THREE.RepeatWrapping; eyes[y].repeat.set(1, -1); eyes[y].offset.set(0, 1); }
      var brows = tex(J.textures.brows, true), lashes = tex(J.textures.lashes, true);
      var HIDDEN = new THREE.MeshBasicMaterial({ visible: false });

      // tone ('#RRGGBB'): the darkest skin texture still at least as light as
      // the tone, tinted down to it (a tint can only darken), so any skin
      // colour can be matched from the textures the library has
      var skinAvg = {};
      function avgSkin(key) {
        if (skinAvg[key]) return skinAvg[key];
        var bm = A.images[LOWQ ? J.textures.skins[key].lo : J.textures.skins[key].hi], cv = document.createElement('canvas');
        cv.width = cv.height = 32; var g = cv.getContext('2d'); g.drawImage(bm, 0, 0, 32, 32);
        var d = g.getImageData(0, 0, 32, 32).data, r = 0, gg = 0, b = 0, n = 0;
        for (var i = 0; i < d.length; i += 4) { var lum = d[i] + d[i + 1] + d[i + 2]; if (d[i + 3] < 200 || lum < 60 || lum > 735) continue; r += d[i]; gg += d[i + 1]; b += d[i + 2]; n++; }
        n = n || 1;
        return (skinAvg[key] = new THREE.Color().setRGB(r / n / 255, gg / n / 255, b / n / 255, THREE.SRGBColorSpace));
      }
      function lumOf(c) { return c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722; }
      function matchTone(hex) {
        var want = new THREE.Color(hex), wl = lumOf(want), best = null;
        Object.keys(skins).forEach(function (k) {
          var a = avgSkin(k), gap = lumOf(a) - wl, score = gap >= 0 ? gap : 10 - gap;
          if (!best || score < best.score) best = { key: k, avg: a, score: score };
        });
        var a = best.avg;
        return { key: best.key, tint: new THREE.Color(Math.min(1, want.r / Math.max(a.r, 1e-3)), Math.min(1, want.g / Math.max(a.g, 1e-3)), Math.min(1, want.b / Math.max(a.b, 1e-3))) };
      }

      // motion: one AnimationClip per captured clip, shared by every instance
      var boneNames = J.skeleton.map(function (b) { return b.name.replace(/\./g, '_'); });
      var CL = {};
      J.clips.list.forEach(function (c) {
        var q = view(A.clips, J.clips.layout[c.name + ':q']), r = view(A.clips, J.clips.layout[c.name + ':root']);
        var nb = boneNames.length, n = c.frames, m = n + (c.loop ? 1 : 0), times = new Float32Array(m), tracks = [];
        for (var f = 0; f < m; f++) times[f] = f / c.fps;
        for (var b = 0; b < nb; b++) {
          var vals = new Float32Array(m * 4);
          for (f = 0; f < m; f++) {
            var o = ((f % n) * nb + b) * 4, x = q[o] / 32767, yy = q[o + 1] / 32767, z = q[o + 2] / 32767, w = q[o + 3] / 32767, l = Math.hypot(x, yy, z, w) || 1;
            vals[f * 4] = x / l; vals[f * 4 + 1] = yy / l; vals[f * 4 + 2] = z / l; vals[f * 4 + 3] = w / l;
          }
          tracks.push(new THREE.QuaternionKeyframeTrack(boneNames[b] + '.quaternion', times, vals));
        }
        var rv = new Float32Array(m * 3);
        for (f = 0; f < m; f++) { rv[f * 3] = r[(f % n) * 3]; rv[f * 3 + 1] = r[(f % n) * 3 + 1]; rv[f * 3 + 2] = r[(f % n) * 3 + 2]; }
        tracks.push(new THREE.VectorKeyframeTrack(boneNames[0] + '.position', times, rv));
        CL[c.name] = { clip: new THREE.AnimationClip(c.name, (m - 1) / c.fps, tracks), meta: c };
      });

      // the kit, painted in body space: every texel knows where on the body it is
      var K = new Uint8Array(A.kit), KN = J.kit.size, KB = J.kit.bounds, LM = J.landmarks;
      function bibPixels(bib, accent) {
        var cv = document.createElement('canvas'); cv.width = 220; cv.height = 150;
        var g = cv.getContext('2d');
        g.fillStyle = '#F7F5EF'; g.fillRect(0, 0, 220, 150);
        g.fillStyle = accent; g.fillRect(0, 0, 220, 16);
        g.fillStyle = '#16161A'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.font = '700 26px "Helvetica Neue", Arial, sans-serif'; g.fillText(String(bib.name || '').slice(0, 14), 110, 40, 200);
        g.font = '900 70px "Arial Black", "Helvetica Neue", Arial, sans-serif'; g.fillText(String(bib.number || '').slice(0, 5), 110, 102, 204);
        return g.getImageData(0, 0, 220, 150).data;
      }
      // the same kit painted twice is the same texture (a crowd in street
      // clothes wears only the kit's shoes, often the same ones)
      var KITS = {};
      function paintKit(o, glow) {
        var kkey = (glow ? 'g:' : 'k:') + JSON.stringify(o || {});
        if (KITS[kkey]) return KITS[kkey];
        return (KITS[kkey] = paintKitNow(o, glow));
      }
      function paintKitNow(o, glow) {
        var cv = document.createElement('canvas'); cv.width = cv.height = KN;
        var g = cv.getContext('2d'), img = g.createImageData(KN, KN), D = img.data, N2 = KN * KN * 4;
        var top = hexRgb(o.top, '#F4F4F4'), trim = hexRgb(o.trim, '#16161A'), shorts = hexRgb(o.shorts || o.top, '#1C1C22'), shoe = hexRgb(o.shoes, '#F2F2F2'), sole = hexRgb(o.sole, '#EFEFEF');
        var pattern = o.pattern || 'plain', bib = o.bib ? bibPixels(o.bib, o.bibColor || o.trim || '#1C2F5E') : null;
        var chest = LM.armpit - 0.1, bibTop = LM.armpit - 0.045, bibH = 0.15, bibW = 0.2;
        var x0 = Math.floor(J.kit.rect[0] * KN), y0 = Math.floor(J.kit.rect[1] * KN), x1 = Math.ceil(J.kit.rect[2] * KN), y1 = Math.ceil(J.kit.rect[3] * KN);
        for (var yy = y0; yy < y1; yy++) for (var xx = x0; xx < x1; xx++) {
          var q = (yy * KN + xx) * 4, r = K[q + 3]; if (!r) continue;
          var px = KB.min[0] + K[q] / 255 * (KB.max[0] - KB.min[0]), py = KB.min[1] + K[q + 1] / 255 * (KB.max[1] - KB.min[1]), pz = KB.min[2] + K[q + 2] / 255 * (KB.max[2] - KB.min[2]);
          var nx = K[N2 + q] / 127.5 - 1, ny = K[N2 + q + 1] / 127.5 - 1, nz = K[N2 + q + 2] / 127.5 - 1;
          var c = top, isTrim = false;
          if (r === 60) {
            if (Math.abs(nx) > 0.9) isTrim = true;
            else if (pattern === 'band') isTrim = py > chest - 0.035 && py < chest + 0.035;
            else if (pattern === 'sash') isTrim = Math.abs(px * 0.9 + (py - chest)) < 0.032;
            else if (pattern === 'stripes') isTrim = Math.floor((px + 1) / 0.055) % 2 === 0;
            else if (pattern === 'split') isTrim = py > chest;
            else if (pattern === 'checker') isTrim = ((Math.floor((px + 1) / 0.045) + Math.floor(py / 0.045)) & 1) === 1;
            else if (pattern === 'yoke') isTrim = py > LM.armpit + 0.03 - Math.abs(px) * 0.35;
            if (bib && Math.abs(nz) > 0.45 && py < bibTop && py > bibTop - bibH && Math.abs(px) < bibW / 2) {
              var u = nz < 0 ? (bibW / 2 - px) / bibW : (px + bibW / 2) / bibW, v = (bibTop - py) / bibH;
              var bq = (Math.min(149, Math.floor(v * 150)) * 220 + Math.min(219, Math.floor(u * 220))) * 4;
              c = [bib[bq], bib[bq + 1], bib[bq + 2]]; isTrim = false;
            } else if (isTrim) c = trim;
          } else if (r === 120) {
            c = shorts;
            if (Math.abs(nx) > 0.86) { c = trim; isTrim = true; }
            else if (py > LM.waist - 0.025) c = [shorts[0] * 0.75, shorts[1] * 0.75, shorts[2] * 0.75];
          } else {
            c = shoe;
            if (py < 0.02) c = sole;
            if (py < 0.013 && ny < -0.4 && pz > 0.03) c = [28, 28, 30];
            else if (Math.abs(nx) > 0.55 && py > 0.028 && py < 0.05 && pz > -0.02) { c = trim; isTrim = true; }
          }
          // a little weave, so a flat colour reads as fabric
          var gr = 0.955 + 0.09 * (((xx * 73856093) ^ (yy * 19349663)) >>> 0) % 1000 / 1000;
          if (glow) { var gv = isTrim ? 255 : 0; D[q] = D[q + 1] = D[q + 2] = gv; }
          else { D[q] = Math.min(255, c[0] * gr); D[q + 1] = Math.min(255, c[1] * gr); D[q + 2] = Math.min(255, c[2] * gr); }
          D[q + 3] = 255;
        }
        g.putImageData(img, 0, 0);
        var t = new THREE.CanvasTexture(cv); t.colorSpace = glow ? THREE.NoColorSpace : THREE.SRGBColorSpace; t.anisotropy = ANISO;
        return t;
      }

      // a skinsuit, painted on the body itself from where each point sits on
      // it at rest: hood (the face left open), panels in the team's colours,
      // gloves, the country and number on the back and thighs, a glossy torso
      // and matte, grippy limbs. The feet are cut away: skates stand in.
      var SB = {}; J.skeleton.forEach(function (b) { SB[b.name.replace(/\./g, '_')] = b; });
      var hk = J.height / 1.869, headB = SB.head, eyeY = headB.head[1] + 0.4 * (headB.tail[1] - headB.head[1]);
      var SUITC = {
        face: new THREE.Vector4(eyeY - 0.03 * hk, headB.head[2] + 0.018 * hk, 0.061 * hk, 0.086 * hk),
        limb: new THREE.Vector4(LM.ankle + 0.05 * hk, LM.knee, LM.hip, LM.waist),
        arm: new THREE.Vector4(SB.upperarm01_L.head[0], SB.upperarm01_L.head[1], SB.wrist_L.head[0], SB.wrist_L.head[1]),
        back: new THREE.Vector4(LM.armpit - 0.02 * hk, 0.12 * hk, 0.075 * hk, 0),
        thigh: new THREE.Vector4((LM.hip + LM.knee) / 2 + 0.03 * hk, 0.05 * hk, 0.07 * hk, 0.03 * hk),
      };
      var SUIT_PATTERNS = { plain: 0, panels: 1, split: 2, band: 3, chevron: 4, stripes: 5 };
      function suitText(o) {
        var cv = document.createElement('canvas'); cv.width = 512; cv.height = 256;
        var g = cv.getContext('2d'); g.clearRect(0, 0, 512, 256);
        g.fillStyle = isHex(o.textColor) ? o.textColor : '#FFFFFF'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.font = '900 104px "Arial Black", "Helvetica Neue", Arial, sans-serif'; g.fillText(String(o.code || '').slice(0, 4).toUpperCase(), 256, 64, 480);
        g.font = '900 120px "Arial Black", "Helvetica Neue", Arial, sans-serif'; g.fillText(String(o.number || '').slice(0, 3), 256, 192, 300);
        var t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = ANISO; return t;
      }
      function dressSuit(mat, so) {
        var top = new THREE.Color(isHex(so.color) ? so.color : '#1D3F9E'), trim = new THREE.Color(isHex(so.trim) ? so.trim : '#F4F4F4'), accent = new THREE.Color(isHex(so.accent) ? so.accent : (isHex(so.trim) ? so.trim : '#E4002B'));
        var U = {
          gsTop: { value: top }, gsTrim: { value: trim }, gsAccent: { value: accent }, gsGlove: { value: new THREE.Color(isHex(so.gloves) ? so.gloves : '#1A1A1E') },
          gsSheen: { value: top.clone().lerp(new THREE.Color('#FFFFFF'), 0.35) }, gsPattern: { value: SUIT_PATTERNS[so.pattern] != null ? SUIT_PATTERNS[so.pattern] : 1 },
          gsFace: { value: SUITC.face }, gsLimb: { value: SUITC.limb }, gsArm: { value: SUITC.arm }, gsBack: { value: SUITC.back }, gsThigh: { value: SUITC.thigh },
          gsArmpit: { value: LM.armpit }, gsText: { value: suitText(so) }, gsHood: { value: so.hood === false ? 0 : 1 },
        };
        mat.onBeforeCompile = function (sh) {
          Object.assign(sh.uniforms, U);
          sh.vertexShader = 'varying vec3 vRest; varying vec3 vRestN;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vRest = position; vRestN = normal;');
          sh.fragmentShader = [
            'varying vec3 vRest; varying vec3 vRestN;',
            'uniform vec3 gsTop, gsTrim, gsAccent, gsGlove, gsSheen; uniform float gsPattern, gsArmpit, gsHood;',
            'uniform vec4 gsFace, gsLimb, gsArm, gsBack, gsThigh; uniform sampler2D gsText;',
          ].join('\n') + '\n' + sh.fragmentShader
            .replace('#include <map_fragment>', [
              '#include <map_fragment>',
              'vec3 gp = vRest, gn = normalize( vRestN );',
              'if ( gp.y < gsLimb.x ) discard;',
              'float gax = abs( gp.x );',
              // the hood leaves an oval of the face open
              'vec2 gfq = vec2( gp.x / gsFace.z, ( gp.y - gsFace.x ) / gsFace.w );',
              'float gfr = dot( gfq, gfq ), gFront = step( gsFace.y, gp.z ) * smoothstep( 0.05, 0.3, gn.z );',
              'float gHead = step( gsFace.x - gsFace.w * 1.4, gp.y );',
              'float gFace = gHead * ( gsHood < 0.5 ? 1.0 : gFront * ( 1.0 - smoothstep( 0.9, 1.0, gfr ) ) );',
              'float gHoodEdge = gsHood * gFront * gHead * smoothstep( 0.9, 1.0, gfr ) * ( 1.0 - smoothstep( 1.12, 1.3, gfr ) );',
              // along the arm, shoulder (0) to wrist (1)
              'vec2 gad = gsArm.zw - gsArm.xy; float gt = dot( vec2( gax, gp.y ) - gsArm.xy, gad ) / dot( gad, gad );',
              'float gArmD = length( vec2( gax, gp.y ) - gsArm.xy - gad * clamp( gt, 0.0, 1.0 ) );',
              'float gArm = step( gsArm.x - 0.03, gax ) * step( gArmD, 0.085 + 0.07 * step( 0.9, gt ) ) * step( -0.05, gt ) * step( gp.y, gsArmpit + 0.12 );',
              'float gGlove = gArm * smoothstep( 0.955, 0.985, gt );',
              'float gLeg = step( gp.y, gsLimb.z - 0.08 ) * ( 1.0 - gArm );',
              'vec3 gc = gsTop; float gm = 0.0;',
              'if ( gsPattern > 0.5 && gsPattern < 1.5 ) gm = smoothstep( 0.55, 0.7, abs( gn.x ) ) * ( 1.0 - gArm ) * step( gp.y, gsArmpit + 0.02 );',
              'else if ( gsPattern < 2.5 ) gm = step( gp.y, gsLimb.w - 0.04 ) * ( 1.0 - gArm );',
              'else if ( gsPattern < 3.5 ) gm = step( abs( gp.y - ( gsArmpit - 0.09 ) ), 0.045 ) * ( 1.0 - gArm );',
              'else if ( gsPattern < 4.5 ) gm = step( abs( gp.y - ( gsArmpit - 0.12 ) + abs( gp.x ) * 0.9 ), 0.035 ) * ( 1.0 - gArm ) + gArm * step( 0.62, gt );',
              'else if ( gsPattern < 5.5 ) gm = step( 0.5, fract( gp.y * 9.0 ) ) * gLeg;',
              'gc = mix( gc, gsTrim, clamp( gm, 0.0, 1.0 ) );',
              // an accent stripe down the outside of each leg and arm
              'float gStripe = gLeg * step( gsLimb.y - 0.25, gp.y ) * smoothstep( 0.86, 0.93, gn.x * sign( gp.x ) );',
              'gStripe += gArm * step( gt, 0.95 ) * smoothstep( 0.8, 0.9, dot( vec2( gn.x * sign( gp.x ), gn.y ), normalize( vec2( -gad.y, gad.x ) ) ) );',
              'gc = mix( gc, gsAccent, clamp( gStripe, 0.0, 1.0 ) );',
              'gc = mix( gc, gsTrim, gHoodEdge );',
              'gc = mix( gc, gsGlove, gGlove );',
              // the country and number across the shoulders, the number on each thigh
              'vec2 gbq = vec2( 0.5 - gp.x / gsBack.y * 0.5, ( gp.y - gsBack.x ) / gsBack.z * 0.5 + 0.5 );',
              'if ( gn.z < -0.35 && gbq.x > 0.0 && gbq.x < 1.0 && gbq.y > 0.0 && gbq.y < 1.0 && gArm < 0.5 ) { vec4 gtx = texture2D( gsText, gbq ); gc = mix( gc, gtx.rgb, gtx.a ); }',
              'vec2 gtq = vec2( 0.5 - ( gp.z - gsThigh.w ) / gsThigh.z * 0.5 * sign( gp.x ), ( gp.y - gsThigh.x ) / gsThigh.y * 0.5 + 0.5 );',
              'if ( gn.x * sign( gp.x ) > 0.5 && gLeg > 0.5 && gtq.x > 0.0 && gtq.x < 1.0 && gtq.y > 0.0 && gtq.y < 1.0 ) { vec4 gtx = texture2D( gsText, vec2( gtq.x, gtq.y * 0.5 ) ); gc = mix( gc, gtx.rgb, gtx.a ); }',
              'float gSuit = 1.0 - gFace;',
              'diffuseColor.rgb = mix( diffuseColor.rgb, gc, gSuit );',
              // glossy torso and hood; matte, textured limbs; grippy gloves
              'float gRough = mix( 0.36, 0.64, max( gLeg * step( gp.y, gsLimb.z - 0.14 ), gArm ) );',
              'gRough = mix( gRough, 0.75, gGlove );',
            ].join('\n'))
            .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = mix( roughnessFactor, gRough, gSuit );')
            .replace('#include <lights_physical_fragment>', [
              '#include <lights_physical_fragment>',
              '#ifdef USE_SHEEN',
              '  material.sheenColor = mix( material.sheenColor, gsSheen * 0.55, gSuit ); material.sheenRoughness = mix( material.sheenRoughness, 0.3, gSuit );',
              '#endif',
              '#ifdef USE_CLEARCOAT',
              '  material.clearcoat = mix( material.clearcoat, 0.18 * ( 1.0 - step( 0.5, max( gLeg, gArm ) ) ), gSuit ); material.clearcoatRoughness = mix( material.clearcoatRoughness, 0.25, gSuit );',
              '#endif',
            ].join('\n'));
        };
        mat.needsUpdate = true;
      }


      /* ------------------------------------------------- street clothes -- */
      // o.clothes: street wear painted onto the body itself, from where each
      // point sits on it at rest, like the skinsuit: a shirt (a tank, a tee,
      // long sleeves, an open short-sleeved shirt, a police uniform, a polo)
      // in a print (plain, floral, stripes, camo, check), trousers (jeans,
      // trousers, shorts) with a belt, a leather vest or an open jacket over
      // them, ink on the skin that shows, and a beard. The kit's singlet and
      // shorts come off; its shoes stay.
      var SHIRTS = { none: 0, tank: 1, tee: 2, long: 3, open: 4, uniform: 5, polo: 6, hoodie: 3 };
      var PRINTS = { plain: 0, floral: 1, stripes: 2, camo: 3, check: 4 };
      var PANTS = { none: 0, jeans: 1, trousers: 2, shorts: 3 };
      var JACKETS = { none: 0, vest: 1, jacket: 2, leather: 2 };
      var BEARDS = { none: 0, stubble: 1, full: 2, goatee: 3 };
      function dressClothes(mat, c, hairHex) {
        var sh = c.shirt || {}, pa = c.pants || {}, ja = c.jacket || {}, tt = c.tattoos || {};
        function col(v, d) { return new THREE.Color(isHex(v) ? v : d); }
        var pk = typeof pa === 'string' ? pa : pa.kind;
        var U = {
          ccShirt: { value: col(sh.color, '#F2F0EA') }, ccShirt2: { value: col(sh.color2, '#E0445C') }, ccShirtKind: { value: SHIRTS[typeof sh === 'string' ? sh : sh.kind] != null ? SHIRTS[typeof sh === 'string' ? sh : sh.kind] : 2 },
          ccPrint: { value: PRINTS[sh.print] || 0 }, ccBadge: { value: col(sh.badge, '#D9B44A') },
          ccPants: { value: col(pa.color, pk === 'jeans' || !pk ? '#2E4468' : '#23262C') }, ccPantsKind: { value: PANTS[pk] != null ? PANTS[pk] : 1 }, ccDenim: { value: pk === 'jeans' || !pk ? 1 : 0 },
          ccBelt: { value: col(c.belt, '#1C1410') }, ccBeltOn: { value: c.belt === false ? 0 : 1 },
          ccJacket: { value: col(ja.color, '#15130F') }, ccJacketKind: { value: JACKETS[typeof ja === 'string' ? ja : ja.kind] || 0 },
          ccInk: { value: col(tt.color, '#1C2A38') }, ccTat: { value: new THREE.Vector4(tt.arms ? 1 : 0, tt.chest ? 1 : 0, tt.neck ? 1 : 0, 0) },
          ccBeard: { value: col(c.beardColor || hairHex, '#1E1812') }, ccBeardKind: { value: BEARDS[c.beard] || 0 },
          ccArm: { value: SUITC.arm }, ccLimb: { value: new THREE.Vector4(LM.ankle, LM.knee, LM.hip, LM.waist) },
          ccFace: { value: new THREE.Vector4(eyeY, headB.head[2] + 0.02 * hk, 0.062 * hk, 0) }, ccNeck: { value: new THREE.Vector2(LM.neck, LM.armpit) },
          ccSick: { value: 0 },
        };
        mat.userData.ccU = U;
        mat.onBeforeCompile = function (s) {
          Object.assign(s.uniforms, U);
          s.vertexShader = 'varying vec3 vRest; varying vec3 vRestN;\n' + s.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vRest = position; vRestN = normal;');
          s.fragmentShader = [
            'varying vec3 vRest; varying vec3 vRestN;',
            'uniform vec3 ccShirt, ccShirt2, ccBadge, ccPants, ccBelt, ccJacket, ccInk, ccBeard;',
            'uniform float ccShirtKind, ccPrint, ccPantsKind, ccDenim, ccBeltOn, ccJacketKind, ccBeardKind;',
            'uniform vec4 ccTat, ccArm, ccLimb, ccFace; uniform vec2 ccNeck; uniform float ccSick;',
            'float ccH( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }',
            'float ccN( vec2 p ) { vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f ); return mix( mix( ccH( i ), ccH( i + vec2( 1, 0 ) ), f.x ), mix( ccH( i + vec2( 0, 1 ) ), ccH( i + vec2( 1, 1 ) ), f.x ), f.y ); }',
          ].join('\n') + '\n' + s.fragmentShader
            .replace('#include <map_fragment>', [
              '#include <map_fragment>',
              'vec3 cp = vRest, cn = normalize( vRestN ); float cax = abs( cp.x );',
              'vec2 cad = ccArm.zw - ccArm.xy; float ct = dot( vec2( cax, cp.y ) - ccArm.xy, cad ) / dot( cad, cad );',
              'float cArmD = length( vec2( cax, cp.y ) - ccArm.xy - cad * clamp( ct, 0.0, 1.0 ) );',
              'float cArm = step( ccArm.x - 0.03, cax ) * step( cArmD, 0.09 + 0.07 * step( 0.9, ct ) ) * step( -0.05, ct ) * step( cp.y, ccNeck.y + 0.12 );',
              'float cHand = cArm * step( 0.95, ct );',
              'float cTorso = ( 1.0 - cArm ) * step( ccLimb.w - 0.04, cp.y ) * step( cp.y, ccNeck.x - 0.005 );',
              'float cLeg = ( 1.0 - cArm ) * step( ccLimb.x + 0.015, cp.y ) * step( cp.y, ccLimb.w + 0.02 );',
              // the shirt: body, sleeves to its length, the neck and the armholes cut
              'float sleeve = ccShirtKind < 1.5 ? -1.0 : ccShirtKind < 2.5 ? 0.36 : ccShirtKind < 3.5 ? 0.94 : ccShirtKind < 4.5 ? 0.34 : ccShirtKind < 5.5 ? 0.4 : 0.36;',
              'float cShirt = ccShirtKind > 0.5 ? cTorso + cArm * step( ct, sleeve ) * ( 1.0 - cHand ) : 0.0;',
              'if ( ccShirtKind > 0.5 && ccShirtKind < 1.5 ) {',
              '  cShirt *= 1.0 - step( ccArm.x - 0.075, cax ) * step( ccNeck.y - 0.06, cp.y );',
              '  cShirt *= 1.0 - step( 0.0, cp.z ) * step( ccNeck.x - 0.14 + cax * 0.9, cp.y ) * step( cax, 0.1 );',
              '} else if ( ccShirtKind > 1.5 ) cShirt *= 1.0 - step( ccNeck.x - 0.03 + cax * 0.25, cp.y ) * step( cax, 0.075 );',
              'float cOpen = ( ccShirtKind > 3.5 && ccShirtKind < 4.5 ) ? step( 0.0, cp.z ) * step( 0.2, cn.z ) * step( cax, 0.012 + ( ccNeck.x - cp.y ) * 0.24 ) * step( ccNeck.y - 0.16, cp.y ) : 0.0;',
              'cShirt = clamp( cShirt, 0.0, 1.0 ) * ( 1.0 - cOpen );',
              'float cPants = ccPantsKind > 0.5 ? cLeg * step( ccPantsKind < 2.5 ? ccLimb.x + 0.015 : ccLimb.y + 0.07, cp.y ) : 0.0;',
              'float cJacket = 0.0;',
              'if ( ccJacketKind > 0.5 ) {',
              '  cJacket = cTorso * ( 1.0 - step( 0.0, cp.z ) * step( 0.25, cn.z ) * step( cax, 0.09 - ( ccNeck.x - cp.y ) * 0.04 ) );',
              '  if ( ccJacketKind > 1.5 ) cJacket = clamp( cJacket + cArm * step( ct, 0.93 ) * ( 1.0 - cHand ), 0.0, 1.0 );',
              '}',
              'vec3 cc = diffuseColor.rgb; float cRough = 0.8;',
              'if ( cShirt > 0.5 ) {',
              '  vec3 sc = ccShirt;',
              '  if ( ccPrint > 0.5 && ccPrint < 1.5 ) {',
              '    vec2 q = vec2( cp.x + cp.z * sign( cp.x + 1e-4 ) * 0.7, cp.y ) * 15.0; vec2 cell = floor( q ), fq = fract( q ) - 0.5; float h = ccH( cell );',
              '    vec2 d = fq - ( vec2( ccH( cell + 3.1 ), ccH( cell + 7.7 ) ) - 0.5 ) * 0.36; float r = length( d ), an = atan( d.y, d.x );',
              '    float petal = step( r, 0.19 + 0.09 * cos( 5.0 * an + h * 6.28 ) ) * step( 0.3, h );',
              '    float leaf = step( abs( r - 0.31 ), 0.06 ) * step( 0.55, ccH( cell + 1.3 ) ) * step( 0.2, sin( an * 2.0 + h * 5.0 ) );',
              '    sc = mix( sc, vec3( 0.12, 0.42, 0.26 ), leaf * 0.85 ); sc = mix( sc, ccShirt2, petal ); sc = mix( sc, vec3( 1.0, 0.86, 0.32 ), step( r, 0.05 ) * petal );',
              '  } else if ( ccPrint > 1.5 && ccPrint < 2.5 ) sc = mix( sc, ccShirt2, step( 0.5, fract( cp.x * 13.0 ) ) );',
              '  else if ( ccPrint > 2.5 && ccPrint < 3.5 ) { float cm = ccN( cp.xy * 9.0 + cp.z * 5.0 ) * 0.6 + ccN( cp.xy * 23.0 ) * 0.4; sc = mix( sc, ccShirt2, step( 0.52, cm ) ); sc = mix( sc, sc * 0.55, step( 0.68, cm ) ); }',
              '  else if ( ccPrint > 3.5 ) { vec2 g = step( 0.5, fract( vec2( cp.x + cp.z, cp.y ) * 11.0 ) ); sc = mix( sc, ccShirt2, max( g.x, g.y ) * 0.6 ); }',
              '  if ( ccShirtKind > 4.5 && ccShirtKind < 5.5 ) {',
              // a police shirt: the badge on the left chest, a patch on each shoulder, a dark collar
              '    float badge = step( 0.0, cp.z ) * step( length( ( vec2( cp.x - 0.085, cp.y - ccNeck.y ) ) * vec2( 1.0, 0.8 ) ), 0.021 );',
              '    sc = mix( sc, ccBadge, badge );',
              '    sc = mix( sc, ccShirt2, cArm * step( 0.07, ct ) * step( ct, 0.2 ) * step( 0.4, cn.x * sign( cp.x ) ) );',
              '    sc = mix( sc, sc * 0.55, step( ccNeck.x - 0.05, cp.y ) * ( 1.0 - cArm ) );',
              '  }',
              '  sc *= 0.93 + 0.1 * ccN( cp.xy * 260.0 );',
              '  cc = sc; cRough = 0.82;',
              '}',
              'if ( cJacket > 0.5 ) { cc = ccJacket * ( 0.88 + 0.14 * ccN( cp.xy * 90.0 ) ); cRough = ccJacketKind < 1.5 ? 0.4 : 0.55; }',
              'if ( cPants > 0.5 ) {',
              '  vec3 pc = ccPants;',
              '  if ( ccDenim > 0.5 ) { pc *= 0.9 + 0.14 * step( 0.5, fract( ( cp.x + cp.y ) * 220.0 ) ); pc = mix( pc, pc * 1.4 + 0.035, smoothstep( 0.35, 0.95, ccN( vec2( cp.x * 6.0, cp.y * 3.0 ) ) ) * step( 0.0, cp.z ) * 0.55 ); }',
              '  float belt = ccBeltOn * step( ccLimb.w - 0.012, cp.y ) * step( cp.y, ccLimb.w + 0.02 );',
              '  pc = mix( pc, ccBelt, belt ); pc = mix( pc, vec3( 0.86, 0.7, 0.34 ), belt * step( 0.0, cp.z ) * step( cax, 0.024 ) );',
              '  cc = pc; cRough = mix( ccDenim > 0.5 ? 0.9 : 0.7, 0.35, belt );',
              '}',
              'float cCloth = clamp( cShirt + cJacket + cPants, 0.0, 1.0 );',
              // ink where the skin shows
              'if ( cCloth < 0.5 && dot( ccTat.xyz, vec3( 1.0 ) ) > 0.5 ) {',
              '  float zone = ccTat.x * cArm * step( 0.04, ct ) * step( ct, 0.9 ) + ccTat.y * cTorso * step( ccNeck.y - 0.22, cp.y ) + ccTat.z * step( ccNeck.x - 0.02, cp.y ) * step( cp.y, ccNeck.x + 0.075 ) * step( cax, 0.07 );',
              '  float n1 = ccN( vec2( cax * 55.0 + cp.z * 40.0, cp.y * 38.0 ) ), n2 = ccN( vec2( cax * 140.0 + cp.z * 90.0, cp.y * 120.0 ) );',
              '  float lines = smoothstep( 0.46, 0.5, n1 ) * ( 1.0 - smoothstep( 0.5, 0.54, n1 ) ) + smoothstep( 0.62, 0.66, n2 ) * 0.8;',
              '  float ink = clamp( zone, 0.0, 1.0 ) * clamp( lines + smoothstep( 0.67, 0.71, n1 ) * 0.9, 0.0, 1.0 );',
              '  cc = mix( cc, cc * ccInk * 1.4, ink * 0.88 );',
              '}',
              'if ( ccBeardKind > 0.5 ) {',
              // the jaw and chin, the moustache, the lower cheeks for a full beard; never the lips
              '  float fy = cp.y - ccFace.x, face = step( ccFace.y - 0.075, cp.z ) * ( 1.0 - smoothstep( ccFace.z - 0.004, ccFace.z + 0.01, cax ) );',
              '  float chin = smoothstep( -0.152, -0.138, fy ) * ( 1.0 - smoothstep( -0.09, -0.082, fy ) );',
              '  float cheek = smoothstep( -0.125, -0.105, fy ) * ( 1.0 - smoothstep( -0.05, -0.038, fy ) ) * smoothstep( 0.036, 0.05, cax ) * step( cp.z, ccFace.y + 0.03 );',
              '  float stache = smoothstep( -0.071, -0.066, fy ) * ( 1.0 - smoothstep( -0.058, -0.053, fy ) ) * ( 1.0 - smoothstep( 0.027, 0.034, cax ) );',
              '  float lips = ( 1.0 - smoothstep( 0.021, 0.027, cax ) ) * smoothstep( -0.087, -0.083, fy ) * ( 1.0 - smoothstep( -0.069, -0.065, fy ) );',
              '  float bd = chin + stache + ( ccBeardKind > 1.5 && ccBeardKind < 2.5 ? cheek : 0.0 );',
              '  if ( ccBeardKind > 2.5 ) bd = chin * ( 1.0 - smoothstep( 0.024, 0.032, cax ) ) + stache;',
              '  bd = clamp( bd, 0.0, 1.0 ) * face * ( 1.0 - lips );',
              // hair under the skin's own light: the skin darkened toward the hair
              // colour, finely mottled, so it reads as growth rather than paint
              '  float grain = ccN( vec2( cp.x * 2400.0 + cp.z * 1100.0, cp.y * 2400.0 ) ) * 0.5 + ccN( vec2( cp.x * 600.0, cp.y * 700.0 ) ) * 0.5;',
              '  float dens = bd * ( ccBeardKind < 1.5 ? 0.42 : 0.82 ) * ( 0.7 + 0.3 * grain );',
              '  cc = mix( cc, cc * 0.32 + ccBeard * 0.45, clamp( dens, 0.0, 1.0 ) );',
              '}',
              // an infection: the skin gone pale and grey-green, the eyes sunk, dark veins
              // showing through (sick(k) sets it, 0 healthy to 1; clothes stay as they are)
              'if ( ccSick > 0.001 && cCloth < 0.5 ) {',
              '  float sy = cp.y - ccFace.x, sface = step( ccFace.y - 0.075, cp.z );',
              '  float sock = sface * exp( -pow( ( sy + 0.006 ) / 0.017, 2.0 ) ) * exp( -pow( ( cax - 0.033 ) / 0.019, 2.0 ) );',
              '  float vn = ccN( vec2( cax * 95.0 + cp.z * 70.0, cp.y * 64.0 ) ), vn2 = ccN( vec2( cax * 210.0 + cp.z * 160.0, cp.y * 150.0 ) );',
              '  float veins = ( smoothstep( 0.47, 0.5, vn ) * ( 1.0 - smoothstep( 0.5, 0.53, vn ) ) + 0.6 * smoothstep( 0.48, 0.5, vn2 ) * ( 1.0 - smoothstep( 0.5, 0.52, vn2 ) ) ) * ( 1.0 - sface * 0.6 );',
              '  cc = mix( cc, dot( cc, vec3( 0.3, 0.55, 0.15 ) ) * vec3( 0.74, 0.86, 0.7 ), ccSick * 0.85 );',
              '  cc = mix( cc, cc * vec3( 0.36, 0.3, 0.34 ), clamp( sock, 0.0, 1.0 ) * ccSick * 0.85 );',
              '  cc = mix( cc, cc * vec3( 0.42, 0.5, 0.62 ), clamp( veins, 0.0, 1.0 ) * ccSick * 0.6 );',
              '}',
              'diffuseColor.rgb = cc;',
            ].join('\n'))
            .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = mix( roughnessFactor, cRough, cCloth );')
            .replace('#include <lights_physical_fragment>', [
              '#include <lights_physical_fragment>',
              '#ifdef USE_CLEARCOAT',
              '  material.clearcoat *= 1.0 - cCloth;',
              '#endif',
              '#ifdef USE_SHEEN',
              '  material.sheenColor = mix( material.sheenColor, diffuseColor.rgb * 0.35, cCloth );',
              '#endif',
            ].join('\n'));
        };
        mat.needsUpdate = true;
      }
      // Desert and armoured gear (1 Oct, for MogDune; any world may use it):
      //   robe: { color, hem, hood: true, length }   a long hooded cloak, open in front, tattered at
      //                                              the hem, that the wind works at
      //   scarf: color                               a thick wrap round the neck
      //   respirator: color                          a mouth filter with a tube down to the chest
      //   helmet: { color, visor, crest }            a close helmet with a dark visor slit
      //   armor: { color, trim }                     a chest and back plate and pauldrons
      var CLOTH_T = { value: 0 };
      function windCloth(mat, k) {
        mat.onBeforeCompile = function (sh) {
          sh.uniforms.uClothT = CLOTH_T;
          sh.vertexShader = 'uniform float uClothT;\n' + sh.vertexShader.replace('#include <begin_vertex>', [
            '#include <begin_vertex>',
            // the hem (local y below 0) moves most; the shoulders not at all
            'float wk = clamp(-position.y / ' + k.toFixed(3) + ', 0.0, 1.0); wk *= wk;',
            'transformed.x += sin(uClothT * 2.3 + position.y * 5.0 + position.z * 7.0) * 0.035 * wk;',
            'transformed.z -= (0.5 + 0.5 * sin(uClothT * 1.7 + position.x * 6.0)) * 0.07 * wk;',
          ].join('\n'));
        };
        mat.customProgramCacheKey = function () { return 'gmcloth' + k.toFixed(3); };
        return mat;
      }
      var CLOTHTEX = {};
      function clothTexture(color, hem, ragged) {
        var key = color + '|' + hem + '|' + !!ragged; if (CLOTHTEX[key]) return CLOTHTEX[key];
        var t = canvasTexture(256, 512, function (g, w, h) {
          var base = new THREE.Color(color), dark = base.clone().multiplyScalar(0.62), lite = base.clone().lerp(new THREE.Color('#E8D2AE'), 0.25);
          var rgb = function (c) { return Math.round(c.r * 255) + ',' + Math.round(c.g * 255) + ',' + Math.round(c.b * 255); };
          g.fillStyle = '#' + base.getHexString(); g.fillRect(0, 0, w, h);
          // the weave, faded streaks, and the dust of the hem
          for (var i = 0; i < 1400; i++) { g.fillStyle = 'rgba(' + rgb(Math.random() < 0.5 ? dark : lite) + ',' + (0.05 + Math.random() * 0.12) + ')'; g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 2 + Math.random() * 18); }
          for (var y = 0; y < h; y += 3) { g.fillStyle = 'rgba(0,0,0,' + (0.03 + (y % 6 ? 0 : 0.03)) + ')'; g.fillRect(0, y, w, 1); }
          if (hem !== 'none') { var gr = g.createLinearGradient(0, h * 0.55, 0, h); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, hem || 'rgba(150,104,62,0.65)'); g.fillStyle = gr; g.fillRect(0, h * 0.55, w, h * 0.45); }
          // a ragged hem: torn strips cut out of the bottom (alpha)
          if (ragged) {
            g.globalCompositeOperation = 'destination-out';
            for (var x = 0; x < w; x += 3 + Math.random() * 7) { var len = 6 + Math.random() * Math.random() * 70; g.fillRect(x, h - len, 1 + Math.random() * 3, len); }
            g.globalCompositeOperation = 'source-over';
          }
        });
        return (CLOTHTEX[key] = t);
      }
      function duneGear(B, gear, eye, hy, hz, o) {
        if (!gear) return;
        var head = B.head, chest = B.spine01, neck = B.neck01 || chest;
        function M(c, r, m) { return new THREE.MeshStandardMaterial({ color: c, roughness: r == null ? 0.6 : r, metalness: m || 0 }); }
        var sb = SB.spine01, nb = SB.neck01 || sb, deep = 0.02 * clamp(Number((o.build || {}).muscle) || 0, 0, 1);
        if (gear.robe && chest) {
          var rb = typeof gear.robe === 'object' ? gear.robe : { color: gear.robe };
          var col = isHex(rb.color) ? rb.color : '#8A6E4E', len = clamp(Number(rb.length) || 1.2, 0.5, 1.45);
          var top = LM.shoulder + 0.05, rg = new THREE.Group();
          var cloth = windCloth(new THREE.MeshStandardMaterial({ map: clothTexture(col, isHex(rb.hem) ? rb.hem : null, true), roughness: 0.96, side: THREE.DoubleSide, alphaTest: 0.5 }), len * 0.8);
          // open in front (40 degrees each side of +z), flaring to the hem
          var cyl = new THREE.CylinderGeometry(0.2, 0.44, len, 36, 12, true, 0.72, Math.PI * 2 - 1.44);
          var cp = cyl.attributes.position;
          for (var i = 0; i < cp.count; i++) {
            var cy = cp.getY(i), u = (len / 2 - cy) / len, x = cp.getX(i), z = cp.getZ(i);
            // over the shoulders, then hanging; folds deepen toward the hem
            var ang = Math.atan2(x, z), fold = Math.sin(ang * 9 + u * 2) * 0.022 * u;
            cp.setX(i, x * (1.18 - 0.25 * u) * (1 + fold)); cp.setZ(i, z * (0.82 + 0.1 * u) * (1 + fold) - 0.02 - 0.05 * u);
          }
          cyl.translate(0, -len / 2, 0); cyl.computeVertexNormals();
          var robe = new THREE.Mesh(cyl, cloth); robe.castShadow = true;
          rg.add(robe);
          rg.position.set(0, top - sb.head[1], 0.03 - sb.head[2] - deep * 0.5);
          chest.add(rg);
          if (rb.hood !== false && head) {
            var hoodMat = new THREE.MeshStandardMaterial({ map: clothTexture(col, 'none', false), roughness: 0.96, side: THREE.DoubleSide });
            var hood = new THREE.SphereGeometry(0.15, 28, 16, Math.PI / 2 + 0.85, Math.PI * 2 - 1.7, 0, 2.15);
            hood.scale(1.04, 1.12, 1.16);
            var hm = new THREE.Mesh(hood, hoodMat);
            hm.position.set(0, 0.085, -0.012); hm.castShadow = true; head.add(hm);
            // the hood's fall onto the shoulders
            var fall = new THREE.CylinderGeometry(0.15, 0.24, 0.2, 26, 1, true, 0.85, Math.PI * 2 - 1.7); fall.scale(1.05, 1, 0.92);
            var fm = new THREE.Mesh(fall, hoodMat); fm.position.set(0, LM.neck - 0.02 - nb.head[1], -0.02 - nb.head[2]); fm.castShadow = true; neck.add(fm);
          }
        }
        if (gear.scarf && neck) {
          var sm = new THREE.MeshStandardMaterial({ map: clothTexture(isHex(gear.scarf) ? gear.scarf : '#7A5A3C', 'none', false), roughness: 0.98 }), sg = new THREE.Group();
          for (var k = 0; k < 3; k++) { var ring = new THREE.TorusGeometry(0.092 + k * 0.012, 0.034 - k * 0.004, 8, 28); ring.rotateX(Math.PI / 2 + 0.18 - k * 0.1); ring.scale(1.12, 1, 1.05); ring.translate(0, -k * 0.035, 0.005); sg.add(new THREE.Mesh(ring, sm)); }
          var tail2 = new THREE.BoxGeometry(0.1, 0.32, 0.02); tail2.translate(0.05, -0.2, 0.09); tail2.rotateZ(0.15); sg.add(new THREE.Mesh(tail2, sm));
          sg.position.set(0, LM.neck - 0.04 - nb.head[1], 0.01 - nb.head[2]); neck.add(sg);
          sg.traverse(function (m) { if (m.isMesh) m.castShadow = true; });
        }
        if (gear.respirator && head) {
          var rc = isHex(gear.respirator) ? gear.respirator : '#2B2621', rm = M(rc, 0.55, 0.15), rgp = new THREE.Group();
          var cup = new THREE.SphereGeometry(0.06, 20, 12, Math.PI / 2 - 1.1, 2.2, 0.9, 1.5); cup.scale(1.15, 0.9, 0.9);
          rgp.add(new THREE.Mesh(cup, new THREE.MeshStandardMaterial({ color: rc, roughness: 0.55, metalness: 0.15, side: THREE.DoubleSide })));
          var grill = new THREE.CylinderGeometry(0.018, 0.018, 0.012, 16); grill.rotateX(Math.PI / 2); grill.translate(0, -0.01, 0.06); rgp.add(new THREE.Mesh(grill, M('#121110', 0.4, 0.6)));
          var curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0.035, -0.02, 0.045), new THREE.Vector3(0.07, -0.08, 0.05), new THREE.Vector3(0.08, -0.17, 0.07), new THREE.Vector3(0.06, -0.26, 0.1)]);
          rgp.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 18, 0.009, 7, false), rm));
          // the nose plugs' fine tube, the stillsuit's catch
          var nc = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.012, 0.03, 0.075), new THREE.Vector3(-0.045, 0.0, 0.06), new THREE.Vector3(-0.07, -0.05, 0.03)]);
          rgp.add(new THREE.Mesh(new THREE.TubeGeometry(nc, 10, 0.004, 5, false), rm));
          rgp.position.set(0, eye.y - hy - 0.06, eye.z - hz - 0.045); head.add(rgp);
        }
        if (gear.helmet && head) {
          var hl = typeof gear.helmet === 'object' ? gear.helmet : { color: gear.helmet };
          var hc = isHex(hl.color) ? hl.color : '#2E2E30', hg = new THREE.Group();
          var shellMat = new THREE.MeshPhysicalMaterial({ color: hc, roughness: 0.42, metalness: 0.55, clearcoat: 0.4, side: THREE.DoubleSide });
          var shell = new THREE.SphereGeometry(0.112, 30, 18, 0, Math.PI * 2, 0, 1.95); shell.scale(0.96, 1.0, 1.1);
          hg.add(new THREE.Mesh(shell, shellMat));
          var vis = new THREE.CylinderGeometry(0.115, 0.108, 0.03, 26, 1, true, -0.95, 1.9); vis.scale(0.97, 1, 1.12);
          var vm = new THREE.Mesh(vis, new THREE.MeshPhysicalMaterial({ color: isHex(hl.visor) ? hl.visor : '#0B0B0C', roughness: 0.08, metalness: 0.8, clearcoat: 1, side: THREE.DoubleSide }));
          vm.position.y = eye.y - hy - 0.075; hg.add(vm);
          var jaw = new THREE.CylinderGeometry(0.106, 0.088, 0.08, 24, 1, true, -1.1, 2.2); jaw.scale(0.97, 1, 1.1);
          var jm = new THREE.Mesh(jaw, shellMat); jm.position.y = eye.y - hy - 0.15; hg.add(jm);
          if (hl.crest) { var cr = new THREE.BoxGeometry(0.018, 0.04, 0.24); cr.translate(0, 0.128, -0.01); hg.add(new THREE.Mesh(cr, M(isHex(hl.crest) ? hl.crest : '#8C1C1C', 0.6))); }
          hg.position.set(0, 0.058, -0.004); hg.traverse(function (m) { if (m.isMesh) m.castShadow = true; }); head.add(hg);
        }
        if (gear.armor && chest) {
          var ar = typeof gear.armor === 'object' ? gear.armor : { color: gear.armor };
          var am = new THREE.MeshPhysicalMaterial({ color: isHex(ar.color) ? ar.color : '#1A1A1C', roughness: 0.38, metalness: 0.7, clearcoat: 0.3, side: THREE.DoubleSide }), tm = M(isHex(ar.trim) ? ar.trim : '#5A5A5E', 0.35, 0.8), ag = new THREE.Group();
          var front = new THREE.SphereGeometry(1, 24, 14, Math.PI / 2 - 1.05, 2.1, 0.75, 1.35); front.scale(0.17, 0.27, 0.15);
          var back = new THREE.SphereGeometry(1, 24, 14, -Math.PI / 2 - 1.05, 2.1, 0.75, 1.35); back.scale(0.17, 0.27, 0.14);
          ag.add(new THREE.Mesh(front, am), new THREE.Mesh(back, am));
          for (var rI = 0; rI < 3; rI++) { var rib = new THREE.TorusGeometry(0.17 - rI * 0.004, 0.006, 4, 24, 1.9); rib.rotateX(Math.PI / 2); rib.rotateY(Math.PI / 2 - 0.95); rib.scale(1, 1, 0.9); rib.translate(0, -0.1 - rI * 0.05, 0.01); ag.add(new THREE.Mesh(rib, tm)); }
          ag.position.set(0, LM.armpit - 0.12 - sb.head[1], 0.015 - sb.head[2] + deep); chest.add(ag);
          ['shoulder01_L', 'shoulder01_R'].forEach(function (bn, j) {
            var sh = B[bn]; if (!sh) return;
            var pd = new THREE.SphereGeometry(0.085, 18, 10, 0, Math.PI * 2, 0, 1.25); pd.scale(1.1, 0.85, 1.05);
            var pm = new THREE.Mesh(pd, am); pm.position.set((j ? -1 : 1) * 0.075, 0.02, 0); pm.rotation.z = (j ? 1 : -1) * 0.55; pm.castShadow = true; sh.add(pm);
          });
          ag.traverse(function (m) { if (m.isMesh) m.castShadow = true; });
        }
      }
      // o.gear: small things worn, on the bones that carry them: a gold chain
      // on the chest, a cap (on backwards, if asked), sunglasses, a bandana, a
      // police cap. { chain: '#D4AF37', cap: { color, backwards }, shades: '#111',
      // bandana: '#8C1C1C', police: '#101828' }
      function wearGear(boneByName, gear, mesh, scaleK, o) {
        var head = boneByName.head, chest = boneByName.spine01 || boneByName.neck01;
        if (!gear || !head) return;
        var hb = SB.head, hy = hb.head[1], hz = hb.head[2];
        function M(c, r, m) { return new THREE.MeshStandardMaterial({ color: c, roughness: r == null ? 0.5 : r, metalness: m || 0 }); }
        // the eyes as the mesh has them, in the rest pose, for glasses
        var eye = new THREE.Vector3(0, eyeY, hz + 0.09), ei = J.groups.map(function (g) { return g.name; }).indexOf('eyes');
        if (ei >= 0 && (gear.shades || gear.mask || gear.respirator || gear.helmet)) {
          var eg = mesh.geometry.groups[ei], ix = mesh.geometry.index, n = 0, ev = new THREE.Vector3(), zMax = -9, sum = new THREE.Vector3();
          for (var k = eg.start; k < eg.start + eg.count; k += 3) { mesh.getVertexPosition(ix.getX(k), ev); sum.add(ev); n++; zMax = Math.max(zMax, ev.z); }
          if (n) { eye.copy(sum.divideScalar(n)); eye.z = zMax; eye.x = 0; }
        }
        if (gear.chain) {
          var cm = M(isHex(gear.chain) ? gear.chain : '#D4AF37', 0.22, 1), g = new THREE.Group();
          // round the back of the neck, hanging onto the upper chest in front
          var ring = new THREE.TorusGeometry(0.135, 0.0068, 6, 48); ring.rotateX(Math.PI / 2); ring.rotateX(1.0); ring.scale(0.9, 1, 1);
          var pend = new THREE.BoxGeometry(0.02, 0.032, 0.007); pend.translate(0, -0.13, 0.078);
          g.add(new THREE.Mesh(ring, cm), new THREE.Mesh(pend, cm));
          // out from the neck by the chest's depth, which the build (muscle) pushes forward
          var cb = SB.spine01 || SB.neck01, deep = 0.07 + 0.025 * clamp(Number((o.build || {}).muscle) || 0, 0, 1);
          g.position.set(0, LM.neck - 0.085 - cb.head[1], deep - cb.head[2]);
          chest.add(g);
        }
        if (gear.cap) {
          var cap = typeof gear.cap === 'object' ? gear.cap : { color: gear.cap };
          var cc = M(isHex(cap.color) ? cap.color : '#141418', 0.7), gc = new THREE.Group();
          var dome = new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.52); dome.scale(0.1, 0.085, 0.112);
          var brim = new THREE.CircleGeometry(0.085, 24, 0, Math.PI); brim.rotateX(-Math.PI / 2); brim.scale(1.05, 1, 0.9); brim.rotateX(0.18); brim.translate(0, 0.004, 0.092);
          var button = new THREE.SphereGeometry(0.008, 8, 6); button.translate(0, 0.085, 0);
          var mc = new THREE.Mesh(dome, cc), mb = new THREE.Mesh(brim, new THREE.MeshStandardMaterial({ color: cc.color, roughness: 0.7, side: THREE.DoubleSide }));
          gc.add(mc, mb, new THREE.Mesh(button, cc));
          gc.position.set(0, 0.098, hz > 0 ? -0.004 : 0.004); if (cap.backwards) gc.rotation.y = Math.PI;
          head.add(gc);
        }
        if (gear.bandana) {
          var bm = M(isHex(gear.bandana) ? gear.bandana : '#8C1C1C', 0.75), bg = new THREE.Group();
          var band = new THREE.TorusGeometry(0.086, 0.017, 6, 30); band.rotateX(Math.PI / 2); band.scale(1, 1, 1.16);
          var knot = new THREE.SphereGeometry(0.022, 8, 6); knot.translate(0, 0, -0.1);
          var tail = new THREE.BoxGeometry(0.03, 0.08, 0.006); tail.translate(0.012, -0.045, -0.103); tail.rotateZ(0.25);
          bg.add(new THREE.Mesh(band, bm), new THREE.Mesh(knot, bm), new THREE.Mesh(tail, bm));
          bg.position.set(0, 0.09, 0.008); head.add(bg);
        }
        if (gear.police) {
          var pm = M(isHex(gear.police) ? gear.police : '#121A2C', 0.6), pg = new THREE.Group();
          var crown = new THREE.CylinderGeometry(0.108, 0.094, 0.07, 26); crown.translate(0, 0.035, 0);
          var top = new THREE.CylinderGeometry(0.112, 0.108, 0.012, 26); top.translate(0, 0.074, 0.005);
          var pbrim = new THREE.CircleGeometry(0.075, 20, 0, Math.PI); pbrim.rotateX(-Math.PI / 2 + 0.35); pbrim.translate(0, -0.004, 0.09);
          var badge = new THREE.CircleGeometry(0.014, 12); badge.translate(0, 0.036, 0.105);
          pg.add(new THREE.Mesh(crown, pm), new THREE.Mesh(top, pm), new THREE.Mesh(pbrim, M('#060607', 0.25)), new THREE.Mesh(badge, M('#D9B44A', 0.25, 1)));
          pg.position.set(0, 0.085, 0.004); head.add(pg);
        }
        if (gear.shades) {
          var lens = new THREE.MeshPhysicalMaterial({ color: isHex(gear.shades) ? gear.shades : '#0E0F12', metalness: 0.9, roughness: 0.08, clearcoat: 1 });
          var fm = M('#101012', 0.35, 0.6), sg = new THREE.Group();
          [-1, 1].forEach(function (sd) {
            var l = new THREE.CircleGeometry(0.021, 20); l.scale(1.18, 0.86, 1); l.translate(sd * 0.032, 0, 0.004); sg.add(new THREE.Mesh(l, lens));
            var rim = new THREE.TorusGeometry(0.021, 0.0022, 5, 20); rim.scale(1.18, 0.86, 1); rim.translate(sd * 0.032, 0, 0.004); sg.add(new THREE.Mesh(rim, fm));
            var arm = new THREE.BoxGeometry(0.003, 0.004, 0.1); arm.translate(sd * 0.064, 0.004, -0.045); sg.add(new THREE.Mesh(arm, fm));
          });
          var bridge = new THREE.BoxGeometry(0.018, 0.003, 0.003); bridge.translate(0, 0.008, 0.006); sg.add(new THREE.Mesh(bridge, fm));
          sg.position.set(0, eye.y - hy + 0.004, eye.z - hz + 0.012); head.add(sg);
        }
        if (gear.mask) {
          // a surgical mask: a pleated band over the nose and mouth, loops to the ears
          var mm = new THREE.MeshStandardMaterial({ color: isHex(gear.mask) ? gear.mask : '#9CCBE6', roughness: 0.92, side: THREE.DoubleSide }), mg = new THREE.Group();
          var r = 0.074, face = new THREE.CylinderGeometry(r, r * 0.93, 0.072, 20, 3, true, -1.05, 2.1);
          var fp = face.attributes.position; for (var fi = 0; fi < fp.count; fi++) { var fy = fp.getY(fi); fp.setY(fi, fy + Math.sin(fy * 90) * 0.0012); }
          face.computeVertexNormals();
          mg.add(new THREE.Mesh(face, mm));
          [-1, 1].forEach(function (sd) { var loop = new THREE.TorusGeometry(0.03, 0.0016, 4, 16, Math.PI); loop.rotateY(sd * Math.PI / 2); loop.translate(sd * r * 0.88, 0.004, -0.028); mg.add(new THREE.Mesh(loop, M('#E8EEF2', 0.9))); });
          mg.position.set(0, eye.y - hy - 0.062, eye.z - hz - r + 0.016); head.add(mg);
        }
        duneGear(boneByName, gear, eye, hy, hz, o);
        void scaleK;
      }

      /* -------------------------------------------------- the sword arm -- */
      // In a world with combat on, a cut is laid over the upper body while
      // the legs keep running: each cut clip plays from a little before its
      // measured moment of contact, fast enough that the contact lands
      // R.swingContact seconds after the key, when the runtime checks the
      // hit. A death plays in full, like a fall.
      var UPPER = /^(spine0[123]|neck|head|clavicle|shoulder|upperarm|lowerarm|wrist|finger)/;
      var CUTS = ['slash1', 'slash2', 'slash3'].filter(function (n) { return CL[n]; }).map(function (n) {
        var c = CL[n], m = c.meta, contact = m.contact != null ? m.contact : m.duration * 0.5;
        var pre = Math.min(contact, 0.34), parts = [];
        c.clip.tracks.forEach(function (tr) {
          var bn = tr.name.split('.')[0], j = boneNames.indexOf(bn);
          if (j < 0 || !/quaternion$/.test(tr.name) || !UPPER.test(J.skeleton[j].name)) return;
          parts.push({ j: j, interp: tr.createInterpolant() });
        });
        return { from: contact - pre, rate: pre / R.swingContact, end: m.duration, parts: parts };
      });
      var CUTQ = new THREE.Quaternion();

      // a katana, built once: a curved single-edged blade, a gold collar, an
      // oval guard and a bound grip; +Y along the blade, the edge toward +Z,
      // the grip running down -Y from the guard
      var swordParts = null;
      function swordGeometry() {
        if (swordParts) return swordParts;
        var N = 28, len = 0.74, width = 0.031, thick = 0.0075, sori = 0.02, pos = [], idx = [];
        for (var i = 0; i <= N; i++) {
          var u = i / N, y = u * len, tipU = smooth(0.86, 1, u);
          var bend = -sori * Math.sin(u * Math.PI * 0.5) * u;
          var w = width * (1 - 0.22 * u) * (1 - tipU) + 0.0006, t = thick * (1 - 0.35 * u) * (1 - tipU) + 0.0002;
          // the kissaki: the edge sweeps up to meet the back at the point
          var zb = bend - w * 0.3, ze = bend + w * 0.7 - tipU * w * 0.4;
          pos.push(-t / 2, y, zb, t / 2, y, zb, 0, y, ze);
        }
        for (i = 0; i < N; i++) {
          var a = i * 3, b = (i + 1) * 3;
          idx.push(a, b, a + 2, b, b + 2, a + 2, a + 1, a + 2, b + 1, b + 1, a + 2, b + 2, a, a + 1, b, a + 1, b + 1, b);
        }
        var blade = new THREE.BufferGeometry();
        blade.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); blade.setIndex(idx); blade.computeVertexNormals();
        var wrapTex = canvasTexture(64, 256, function (g, w, h) {
          g.fillStyle = '#E9E2D2'; g.fillRect(0, 0, w, h);
          g.fillStyle = '#16120F';
          for (var yy = -32; yy < h + 32; yy += 32) { g.beginPath(); g.moveTo(0, yy); g.lineTo(w / 2, yy + 16); g.lineTo(w, yy); g.lineTo(w, yy + 12); g.lineTo(w / 2, yy + 28); g.lineTo(0, yy + 12); g.closePath(); g.fill(); }
        });
        wrapTex.wrapS = wrapTex.wrapT = THREE.RepeatWrapping; wrapTex.repeat.set(2, 3);
        var grip = new THREE.CylinderGeometry(0.0152, 0.0168, 0.25, 14); grip.translate(0, -0.13, 0);
        var guard = new THREE.CylinderGeometry(0.041, 0.041, 0.0075, 24); guard.scale(1, 1, 0.84);
        var collar = new THREE.BoxGeometry(0.012, 0.03, 0.036); collar.translate(0, 0.016, 0.004);
        var cap = new THREE.CylinderGeometry(0.0172, 0.0165, 0.018, 14); cap.translate(0, -0.264, 0);
        swordParts = {
          blade: blade, grip: grip, guard: guard, collar: collar, cap: cap,
          steel: new THREE.MeshStandardMaterial({ color: '#E3E8EE', metalness: 1, roughness: 0.14, side: THREE.DoubleSide }),
          wrap: new THREE.MeshStandardMaterial({ map: wrapTex, roughness: 0.85 }),
          iron: new THREE.MeshStandardMaterial({ color: '#2B2723', metalness: 0.85, roughness: 0.45 }),
          gold: new THREE.MeshStandardMaterial({ color: '#C99A3A', metalness: 1, roughness: 0.3 }),
        };
        return swordParts;
      }
      function makeSword(spec) {
        var S = swordGeometry(), g = new THREE.Group();
        var steel = S.steel;
        if (spec && isHex(spec.blade)) { steel = S.steel.clone(); steel.color.set(spec.blade); }
        var wrap = S.wrap;
        if (spec && isHex(spec.grip)) { wrap = S.wrap.clone(); wrap.color.set(spec.grip); }
        [[S.blade, steel], [S.grip, wrap], [S.guard, S.iron], [S.collar, S.gold], [S.cap, S.iron]].forEach(function (p) {
          var m = new THREE.Mesh(p[0], p[1]); m.castShadow = true; g.add(m);
        });
        return g;
      }
      // street weapons for open worlds, laid out like the sword (up the prop's
      // y from the top of the grip, the hand 7 cm below): a turned ash bat, a
      // police baton, a steel pipe, a length of chain
      var PROPS = {};
      function mergeGeometries(list) {
        var n = 0; list = list.map(function (g) { g = g.index ? g.toNonIndexed() : g; n += g.attributes.position.count; return g; });
        var pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), o = 0;
        list.forEach(function (g) { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count; });
        var m = new THREE.BufferGeometry(); m.setAttribute('position', new THREE.BufferAttribute(pos, 3)); m.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
        return m;
      }
      function makeWeapon(spec) {
        var kind = spec && typeof spec.kind === 'string' ? spec.kind : 'sword';
        if (kind === 'sword' || !{ bat: 1, baton: 1, pipe: 1, chain: 1, syringe: 1, staff: 1, knife: 1 }[kind]) return makeSword(spec);
        var g = new THREE.Group(), col = spec && isHex(spec.color) ? spec.color : null;
        if (!PROPS[kind]) {
          if (kind === 'bat') {
            var prof = [[0.0, -0.26], [0.021, -0.26], [0.022, -0.24], [0.013, -0.22], [0.012, -0.05], [0.014, 0.1], [0.024, 0.3], [0.031, 0.5], [0.033, 0.6], [0.028, 0.63], [0.0, 0.635]];
            var wood = canvasTexture(32, 256, function (c, w, h) { c.fillStyle = '#C8A27A'; c.fillRect(0, 0, w, h); for (var i = 0; i < 40; i++) { c.fillStyle = 'rgba(92,60,34,' + (0.05 + Math.random() * 0.12) + ')'; c.fillRect(0, Math.random() * h, w, 1 + Math.random() * 2); } });
            PROPS.bat = [[new THREE.LatheGeometry(prof.map(function (p) { return new THREE.Vector2(p[0], p[1]); }), 18), new THREE.MeshStandardMaterial({ map: wood, roughness: 0.55 })],
              [new THREE.CylinderGeometry(0.0135, 0.0135, 0.16, 12).translate(0, -0.15, 0), new THREE.MeshStandardMaterial({ color: '#1A1A1C', roughness: 0.8 })]];
          } else if (kind === 'baton') {
            PROPS.baton = [[new THREE.CylinderGeometry(0.016, 0.017, 0.62, 12).translate(0, 0.2, 0), new THREE.MeshStandardMaterial({ color: '#141416', roughness: 0.42 })],
              [new THREE.CylinderGeometry(0.019, 0.019, 0.16, 12).translate(0, -0.13, 0), new THREE.MeshStandardMaterial({ color: '#0B0B0C', roughness: 0.9 })]];
          } else if (kind === 'syringe') {
            // a doctor's syringe: a clear barrel with the dose in it, the plunger, the needle
            PROPS.syringe = [[new THREE.CylinderGeometry(0.0095, 0.0095, 0.085, 14).translate(0, 0.02, 0), new THREE.MeshPhysicalMaterial({ color: '#E8F4FA', roughness: 0.05, transmission: 0.6, transparent: true, opacity: 0.55 })],
              [new THREE.CylinderGeometry(0.0078, 0.0078, 0.05, 12).translate(0, 0.035, 0), new THREE.MeshStandardMaterial({ color: '#62E0B0', emissive: '#1E8A62', roughness: 0.3 })],
              [new THREE.CylinderGeometry(0.0022, 0.0022, 0.06, 6).translate(0, -0.045, 0), new THREE.MeshStandardMaterial({ color: '#F2F2F2', roughness: 0.4 })],
              [new THREE.CylinderGeometry(0.014, 0.014, 0.003, 14).translate(0, -0.076, 0), new THREE.MeshStandardMaterial({ color: '#F2F2F2', roughness: 0.4 })],
              [new THREE.CylinderGeometry(0.0006, 0.0006, 0.035, 4).translate(0, 0.08, 0), new THREE.MeshStandardMaterial({ color: '#C8CDD2', metalness: 1, roughness: 0.2 })]];
          } else if (kind === 'staff') {
            // a fighting staff, held a third of the way up: weathered wood, bound grips, worn metal caps
            var grain = canvasTexture(32, 512, function (c, w, h) { c.fillStyle = '#6E5236'; c.fillRect(0, 0, w, h); for (var i = 0; i < 70; i++) { c.fillStyle = 'rgba(' + (Math.random() < 0.5 ? '40,26,14,' : '150,118,82,') + (0.06 + Math.random() * 0.14) + ')'; c.fillRect(Math.random() * w, 0, 1 + Math.random() * 2, h); } });
            var bind = new THREE.MeshStandardMaterial({ color: '#3A2C20', roughness: 0.95 }), cap = new THREE.MeshStandardMaterial({ color: '#8C7A62', metalness: 0.85, roughness: 0.42 });
            PROPS.staff = [[new THREE.CylinderGeometry(0.019, 0.021, 1.72, 12).translate(0, 0.34, 0), new THREE.MeshStandardMaterial({ map: grain, roughness: 0.78 })],
              [mergeGeometries([new THREE.CylinderGeometry(0.0235, 0.0235, 0.2, 12).translate(0, -0.04, 0), new THREE.CylinderGeometry(0.0235, 0.0235, 0.16, 12).translate(0, 0.62, 0)]), bind],
              [mergeGeometries([new THREE.CylinderGeometry(0.024, 0.02, 0.07, 12).translate(0, 1.18, 0), new THREE.CylinderGeometry(0.02, 0.024, 0.07, 12).translate(0, -0.5, 0)]), cap]];
          } else if (kind === 'knife') {
            // a long curved knife: a milky, faintly translucent blade, a bound grip
            var kb = [], N = 10; for (var j = 0; j <= N; j++) { var u = j / N, bw = 0.024 * (1 - u * u * 0.85) + 0.002, bx = Math.sin(u * 1.4) * 0.03; kb.push(new THREE.Vector2(bw, u * 0.27)); void bx; }
            var bladeG = new THREE.LatheGeometry(kb, 3); bladeG.scale(1, 1, 0.22); bladeG.translate(0, 0.0, 0);
            var bp = bladeG.attributes.position; for (var q = 0; q < bp.count; q++) { var yy = bp.getY(q); bp.setZ(q, bp.getZ(q) + Math.sin(yy / 0.27 * 1.3) * 0.035); }
            bladeG.computeVertexNormals();
            PROPS.knife = [[bladeG, new THREE.MeshPhysicalMaterial({ color: '#EDE6D6', roughness: 0.32, sheen: 0.4, sheenColor: new THREE.Color('#FFF6E0'), clearcoat: 0.5 })],
              [new THREE.CylinderGeometry(0.014, 0.016, 0.12, 10).translate(0, -0.07, 0), new THREE.MeshStandardMaterial({ color: '#2E2219', roughness: 0.92 })]];
          } else if (kind === 'pipe') {
            PROPS.pipe = [[new THREE.CylinderGeometry(0.016, 0.016, 0.8, 14, 1, true).translate(0, 0.14, 0), new THREE.MeshStandardMaterial({ color: '#7E8388', roughness: 0.38, metalness: 1, side: THREE.DoubleSide })]];
          } else {
            // a chain hangs from the fist, curving out a little, until it is swung
            var links = [], n = 24;
            for (var i = 0; i < n; i++) { var u = i / n, lk = new THREE.TorusGeometry(0.018, 0.0045, 5, 10); lk.scale(1, 1.5, 1); if (i % 2) lk.rotateY(Math.PI / 2); lk.translate(0, -0.1 - u * 0.62, Math.sin(u * 1.6) * 0.12 * u); links.push(lk); }
            PROPS.chain = [[mergeGeometries(links), new THREE.MeshStandardMaterial({ color: '#9A9EA3', roughness: 0.3, metalness: 1 })],
              [new THREE.CylinderGeometry(0.015, 0.015, 0.12, 10).translate(0, -0.1, 0), new THREE.MeshStandardMaterial({ color: '#2A1E16', roughness: 0.9 })]];
          }
        }
        PROPS[kind].forEach(function (p, k) { var mt = p[1]; if (col && k === 0) { mt = mt.clone(); mt.color.set(col); } var m = new THREE.Mesh(p[0], mt); m.castShadow = true; g.add(m); });
        g.userData.kind = kind;
        return g;
      }
      // the sword trail: a fading ribbon between the blade's tip and its middle
      var TRAIL_N = 14;
      var trailMat = new THREE.ShaderMaterial({
        uniforms: { color: { value: new THREE.Color('#EAF2FF') } },
        vertexShader: 'attribute float fade; varying float vFade; void main() { vFade = fade; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'uniform vec3 color; varying float vFade; void main() { float a = vFade * vFade * 0.55; gl_FragColor = vec4(color * a, a); }',
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      });

      return function (o) {
        o = o || {};
        var root = new THREE.Group();
        var bones = J.skeleton.map(function (b, i) { var bone = new THREE.Bone(); bone.name = boneNames[i]; return bone; });
        J.skeleton.forEach(function (b, i) {
          if (b.parent < 0) { bones[i].position.fromArray(b.head); root.add(bones[i]); }
          else { var p = J.skeleton[b.parent]; bones[i].position.set(b.head[0] - p.head[0], b.head[1] - p.head[1], b.head[2] - p.head[2]); bones[b.parent].add(bones[i]); }
        });
        root.updateMatrixWorld(true);
        var skeleton = new THREE.Skeleton(bones);
        var skinKey = skins[o.skin] ? o.skin : Object.keys(skins)[0], toneTint = null;
        if (!skins[o.skin] && isHex(o.tone)) { var mt = matchTone(o.tone); skinKey = mt.key; toneTint = mt.tint; }
        var hairKey = o.hair === 'none' ? null : hairs[o.hair] ? o.hair : Object.keys(hairs)[0];
        var hairColor = new THREE.Color(isHex(o.hairColor) ? o.hairColor : '#2A211B');
        var kit = paintKit(o.outfit || {}, false), glow = o.outfit && Number(o.outfit.glow) > 0;
        var skinMat = new THREE.MeshPhysicalMaterial({ map: skins[skinKey], color: toneTint || (isHex(o.skinTint) ? o.skinTint : '#FFFFFF'), roughness: 0.5, sheen: 0.25, sheenRoughness: 0.5, sheenColor: new THREE.Color('#FF9A80'), clearcoat: o.sweat == null ? 0.14 : clamp(Number(o.sweat), 0, 1), clearcoatRoughness: 0.4 });
        // performance fabric: a soft sheen in the kit's own colour, not a white haze over it
        var suitO = o.suit && typeof o.suit === 'object' ? o.suit : null;
        var clothesO = !suitO && o.clothes && typeof o.clothes === 'object' ? o.clothes : null;
        if (suitO) dressSuit(skinMat, suitO);
        else if (clothesO) dressClothes(skinMat, clothesO, isHex(o.hairColor) ? o.hairColor : '#2A211B');
        // sick(k): how ill the skin looks, 0 healthy to 1 (a story's infection, healed on cue)
        var skinBase = skinMat.color.clone(), sickK = 0, SICKC = new THREE.Color(0.66, 0.78, 0.62);
        function sick(k) {
          if (k == null) return sickK;
          sickK = clamp(Number(k) || 0, 0, 1);
          if (skinMat.userData.ccU) skinMat.userData.ccU.ccSick.value = sickK;
          else skinMat.color.copy(skinBase).multiply(SICKC.clone().lerp(new THREE.Color(1, 1, 1), 1 - sickK));
          return sickK;
        }
        if (o.sick) sick(o.sick);
        var kitMat = new THREE.MeshPhysicalMaterial({ map: kit, roughness: 0.58, sheen: 0.35, sheenRoughness: 0.35, sheenColor: new THREE.Color(isHex((o.outfit || {}).top) ? o.outfit.top : '#888888').lerp(new THREE.Color('#FFFFFF'), 0.25), specularIntensity: 0.6 });
        if (glow) { kitMat.emissive = new THREE.Color(o.outfit.trim || '#FFFFFF'); kitMat.emissiveMap = paintKit(o.outfit, true); kitMat.emissiveIntensity = clamp(Number(o.outfit.glow), 0, 6); }
        var eyeMat = new THREE.MeshPhysicalMaterial({ map: eyes[o.eyes] || eyes[Object.keys(eyes)[0]], roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05 });
        var browMat = new THREE.MeshStandardMaterial({ map: brows, color: hairColor, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.8 });
        var lashMat = new THREE.MeshStandardMaterial({ map: lashes, color: hairColor, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.8 });
        var hairMat = hairKey ? new THREE.MeshStandardMaterial({ map: hairs[hairKey], color: hairColor.clone().multiplyScalar(2.2), alphaTest: 0.3, alphaToCoverage: true, side: THREE.DoubleSide, roughness: 0.62 }) : HIDDEN;
        var outfit = o.outfit || {};
        var mats = J.groups.map(function (g) {
          if (g.name === 'body') return skinMat;
          // in a skinsuit the body is the suit: no kit over it, and the hood covers the hair
          if (suitO && (g.name === 'top' || g.name === 'shorts' || g.name === 'shoes')) return HIDDEN;
          if (suitO && suitO.hood !== false && /^hair:/.test(g.name)) return HIDDEN;
          // in street clothes the kit's singlet and shorts come off; its shoes stay
          if (clothesO && (g.name === 'top' || g.name === 'shorts')) return HIDDEN;
          if (clothesO && (clothesO.gear || o.gear) && ((o.gear || {}).police || (o.gear || {}).cap) && /^hair:/.test(g.name)) return HIDDEN;
          if (g.name === 'top') return outfit.top === null ? HIDDEN : kitMat;
          if (g.name === 'shorts' || g.name === 'shoes') return kitMat;
          if (g.name === 'eyes') return eyeMat;
          if (g.name === 'brows') return browMat;
          if (g.name === 'lashes') return LOWQ ? HIDDEN : lashMat;
          if (g.name === 'hair:' + hairKey) return hairMat;
          return HIDDEN;
        });
        var mesh = new THREE.SkinnedMesh(geo, mats);
        mesh.bind(skeleton);
        mesh.frustumCulled = false; mesh.castShadow = true; mesh.receiveShadow = true;
        root.add(mesh);
        var gearAfterMorph = o.gear && typeof o.gear === 'object' ? o.gear : null;
        // body: muscle, lean, and the face and build of an ethnicity
        var inf = mesh.morphTargetInfluences, bld = o.build || {}, face = o.face || { african: skinKey === 'african' ? 1 : 0, asian: skinKey === 'asian' ? 1 : 0, caucasian: /^caucasian/.test(skinKey) ? 1 : 0 };
        if (typeof face === 'string') { var fs = {}; fs[face] = 1; face = fs; }
        morphNames.forEach(function (m, i) { inf[i] = clamp(Number(m === 'muscle' || m === 'lean' ? bld[m] : face[m]) || 0, 0, 1); });
        var scale = clamp(Number(o.height) || J.height, 1.4, 2.2) / J.height;
        root.scale.setScalar(scale);
        if (gearAfterMorph) {
          var byName = {}; ['head', 'spine01', 'spine02', 'neck01', 'shoulder01_L', 'shoulder01_R'].forEach(function (n) { var i = boneNames.indexOf(n); if (i >= 0) byName[n] = bones[i]; });
          wearGear(byName, gearAfterMorph, mesh, scale, o);
        }

        // motion: idle, a standing start, run and sprint in step, and a fall;
        // a sword fighter stands on guard and dies when cut down
        var guard = o.stance === 'guard' && !!CL.guard;
        var mixer = new THREE.AnimationMixer(root), act = {};
        ['idle', 'start', 'run', 'sprint', 'fall', 'guard', 'death'].forEach(function (n) {
          if (!CL[n] || (n === 'guard' && !guard)) return;
          var a = mixer.clipAction(CL[n].clip);
          if (!CL[n].meta.loop) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
          a.setEffectiveWeight(n === (guard ? 'guard' : 'idle') ? 1 : 0); act[n] = a;
          if (CL[n].meta.loop) a.play();
        });
        var ph0 = Math.random();
        if (act.idle) act.idle.time = ph0 * CL.idle.clip.duration;
        if (act.guard) act.guard.time = ph0 * CL.guard.clip.duration;
        if (act.run) { act.run.time = ph0 * CL.run.clip.duration; if (act.sprint) act.sprint.time = act.run.time; }
        var W = { idle: guard ? 0 : 1, start: 0, run: 0, sprint: 0, fall: 0, guard: guard ? 1 : 0, death: 0 }, st = { v0: 0, startT: -1, crash: false, dead: false, yaw: null, yr: 0, roll: 0, drive: 0, cutW: 0 }, V = new THREE.Vector3();

        // the sword, in the right hand: its grip lies along the knuckles, the
        // edge the way the fingers point, set a little into the palm
        // (arm(spec) puts one in the hand at any time, or takes it away with null:
        // an open world's weapons are picked up, swapped, dropped and broken)
        var sword = null, trail = null;
        function arm(spec) {
          if (sword) { if (sword.parent) sword.parent.remove(sword); sword = null; }
          if (trail) { scene.remove(trail.mesh); trail.mesh.geometry.dispose(); if (trail.mesh.material !== trailMat) trail.mesh.material.dispose(); trail = null; }
          if (!spec) return null;
          var H = function (n) { return new THREE.Vector3().fromArray(J.skeleton[boneNames.indexOf(n)].head); };
          var wr = H('wrist_R'), ix = H('finger2-1_R'), pk = H('finger5-1_R'), md = H('finger3-1_R');
          var axis = ix.clone().sub(pk).normalize(), fing = md.clone().sub(wr);
          var edge = fing.sub(axis.clone().multiplyScalar(fing.dot(axis))).normalize();
          var palm = new THREE.Vector3().crossVectors(axis, edge); if (palm.x * -wr.x < 0) palm.negate();
          var gripAt = ix.clone().add(pk).multiplyScalar(0.5).addScaledVector(palm, 0.02).addScaledVector(edge, 0.012);
          sword = makeWeapon(typeof spec === 'object' ? spec : null);
          // two grips on the same point of the handle: forward, the blade out
          // of the thumb side, for a cut and on guard; reversed, the blade
          // laid back along the forearm, while running. Between them the
          // sword turns about the palm's normal (its own x axis).
          var grip = { fwd: new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(axis, edge), axis, edge)),
            at: gripAt.sub(wr), w: 0, q: new THREE.Quaternion(), turn: new THREE.Quaternion(), off: new THREE.Vector3(), X: new THREE.Vector3(1, 0, 0) };
          sword.userData.grip = grip;
          bones[boneNames.indexOf('wrist_R')].add(sword);
          var tg = new THREE.BufferGeometry(), tp = new Float32Array(TRAIL_N * 2 * 3), tf = new Float32Array(TRAIL_N * 2), ti = [];
          for (var k = 0; k < TRAIL_N - 1; k++) { var a0 = k * 2; ti.push(a0, a0 + 1, a0 + 2, a0 + 1, a0 + 3, a0 + 2); }
          tg.setAttribute('position', new THREE.BufferAttribute(tp, 3)); tg.setAttribute('fade', new THREE.BufferAttribute(tf, 1)); tg.setIndex(ti);
          var tmat = trailMat;
          if (typeof spec === 'object' && isHex(spec.trail)) { tmat = trailMat.clone(); tmat.uniforms.color.value = new THREE.Color(spec.trail); }
          trail = { mesh: new THREE.Mesh(tg, tmat), pts: [], tip: new THREE.Vector3(0, 0.74, 0), mid: new THREE.Vector3(0, 0.3, 0) };
          trail.mesh.frustumCulled = false; trail.mesh.visible = false; trail.mesh.renderOrder = 5;
          scene.add(trail.mesh);
          setGrip(1);
          return sword;
        }
        function setGrip(fwd) {
          var g = sword.userData.grip; g.w = fwd;
          g.turn.setFromAxisAngle(g.X, Math.PI * (1 - fwd) * 0.94);
          g.q.copy(g.fwd).multiply(g.turn);
          sword.quaternion.copy(g.q);
          // the hand holds the handle 7 cm below the guard, whichever way it points
          sword.position.copy(g.at).add(g.off.set(0, 0.07, 0).applyQuaternion(g.q));
        }
        if (o.weapon) arm(o.weapon);
        function stepTrail(active) {
          if (!trail) return;
          var P = trail.pts;
          if (active) { root.updateMatrixWorld(true); P.unshift([sword.localToWorld(trail.tip.clone()), sword.localToWorld(trail.mid.clone())]); }
          else if (P.length) P.splice(Math.max(0, P.length - 3), 3);
          if (P.length > TRAIL_N) P.length = TRAIL_N;
          trail.mesh.visible = P.length > 1;
          if (P.length < 2) return;
          var pa = trail.mesh.geometry.attributes.position, fa = trail.mesh.geometry.attributes.fade;
          for (var k = 0; k < TRAIL_N; k++) {
            var e = P[Math.min(k, P.length - 1)], f = k < P.length ? Math.pow(1 - k / (P.length - 1 || 1), 1.6) : 0;
            pa.setXYZ(k * 2, e[0].x, e[0].y, e[0].z); pa.setXYZ(k * 2 + 1, e[1].x, e[1].y, e[1].z);
            fa.setX(k * 2, f); fa.setX(k * 2 + 1, f * 0.15);
          }
          pa.needsUpdate = true; fa.needsUpdate = true;
        }
        var stepLen = function (v) { return (4.6 + 0.07 * v) * scale * J.height / 1.85; };
        var runDur = CL.run ? CL.run.clip.duration : 0.7, startDur = CL.start ? CL.start.clip.duration : 1;
        // a jump (s.air): the run held at its longest stride, one leg reaching
        // and one trailing, the hurdler's line (the library has no jump of its
        // own); the moment is where the two thighs are furthest apart
        var LEAP = (function () {
          var c = CL.run && CL.run.clip; if (!c) return 0;
          var tr = c.tracks.filter(function (k) { return /^upperleg.*\.quaternion$/.test(k.name); });
          if (tr.length < 2) return c.duration * 0.25;
          var ia = tr[0].createInterpolant(), ib = tr[1].createInterpolant(), qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), best = -1, bt = 0;
          for (var i = 0; i < 48; i++) { var u = i / 48 * c.duration; qa.fromArray(ia.evaluate(u)); qb.fromArray(ib.evaluate(u)); var ang = qa.angleTo(qb); if (ang > best) { best = ang; bt = u; } }
          return bt;
        })();
        // the captured clavicles hang lower than this rig's rest pose, which
        // collapses the shoulders into slopes that show in any close-up: keep
        // most of the rest pose and a quarter of the captured motion
        var clav = ['clavicle_L', 'clavicle_R'].map(function (n) { var b = bones[boneNames.indexOf(n)]; return b ? { b: b, rest: b.quaternion.clone() } : null; }).filter(Boolean);
        // Open worlds: on foot at any pace, fighting, and the street's own life.
        // s.brawl = { stance, action: { name, id, rate }, ko }: a stance at rest
        // (idle, fight, phone, arms, talk, dance, sit, shield), walk, jog, run
        // and sprint by speed, one move at a time over them (a punch, a hit, a
        // roll, a swing), and a knockout that stays down. The carrier the
        // runtime moves faces where the body goes; the clips play in place.
        var BR = null, rootBone = bones[boneNames.indexOf('root')] || bones[0], rootRest = rootBone.position.clone();
        var BLOOP = ['walk', 'walkCool', 'walkHeavy', 'walkF', 'walkBack', 'jog', 'fight', 'guard', 'guardF', 'guardB', 'guardL', 'guardR', 'phone', 'arms', 'talk', 'dance', 'sit', 'shield', 'shift', 'argue'];
        var BONCE = ['jab', 'cross', 'hook', 'upperL', 'uppercut', 'body', 'hitHead', 'hitChest', 'hit', 'getup', 'roll', 'shieldDash', 'shieldBreak', 'slash1', 'slash2', 'slash3', 'dash', 'pickup', 'shrug', 'wave'];
        var GAITS = ['walk', 'walkCool', 'walkHeavy', 'walkF'], STEPS = ['guardF', 'guardB', 'guardL', 'guardR'];
        // The body in two halves: the legs and hips (root, pelvis, legs), and the
        // spine up. A weapon's guard held while stepping, and a punch or a swing
        // thrown on the move, play on the upper half over whatever the legs do.
        var UPPER = {};
        J.skeleton.forEach(function (b, i) { if (!/^(root|pelvis|upperleg|lowerleg|foot|toe)/.test(b.name)) UPPER[boneNames[i]] = true; });
        var UPPERS = ['fight', 'guard', 'jab', 'cross', 'hook', 'upperL', 'uppercut', 'body', 'slash1', 'slash2', 'slash3', 'pickup', 'hitHead', 'hitChest'];
        function upperClip(c) { return new THREE.AnimationClip(c.name + ':up', c.duration, c.tracks.filter(function (tr) { return UPPER[tr.name.split('.')[0]]; })); }
        function wrapA(a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }
        // Open worlds: people move on captured motion (CMU, the owner, 28 Sep).
        // s.brawl = { stance, action: { name, id, rate }, ko, dir, gait }. dir is
        // where the body is going against where it faces (0 ahead, +PI/2 to its
        // left); gait picks the walk (walk, walkCool, walkHeavy, walkF). A fighter
        // (stance fight or guard) moves on a boxer's footwork, blended by dir from
        // steps in, back, left and right; faster, he jogs and runs. Walking
        // backwards has its own capture. Every loop plays at the pace it was
        // captured at, scaled to the speed the body goes.
        function brawl(t, dt, s) {
          var b = s.brawl, v = s.speed || 0;
          if (!BR) {
            BR = { W: {}, A: {}, U: {}, UW: {}, id: null, one: null, up: false, t: 0, d: 0, ko: false, pitch: 0, roll: 0, v0: 0 };
            ['idle', 'run', 'sprint', 'death'].forEach(function (n) { if (act[n]) BR.A[n] = act[n]; });
            BLOOP.concat(BONCE).forEach(function (n) {
              if (!CL[n] || BR.A[n]) return;
              var a = mixer.clipAction(CL[n].clip);
              if (!CL[n].meta.loop) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
              else { a.play(); a.time = Math.random() * CL[n].clip.duration; }
              a.setEffectiveWeight(0); BR.A[n] = a;
            });
            UPPERS.forEach(function (n) {
              if (!CL[n]) return;
              var a = mixer.clipAction(upperClip(CL[n].clip));
              if (!CL[n].meta.loop) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; } else a.play();
              a.setEffectiveWeight(0); BR.U[n] = a; BR.UW[n] = 0;
            });
            for (var n0 in act) if (!BR.A[n0]) act[n0].setEffectiveWeight(0);
            for (var n1 in BR.A) BR.W[n1] = n1 === 'idle' ? 1 : 0;
          }
          var car = root.parent;
          if (car) {
            V.set(0, 0, 1).applyQuaternion(car.quaternion);
            var yaw = Math.atan2(V.x, V.z);
            if (st.yaw !== null) st.yr = damp(st.yr, wrapA(yaw - st.yaw) / dt, 8, dt);
            st.yaw = yaw;
          }
          var A = BR.A, T = {}, U = {}, sc = scale * J.height / 1.85;
          for (var n2 in A) T[n2] = 0;
          for (var u2 in BR.U) U[u2] = 0;
          var rel = wrapA(Number(b.dir) || 0), stance = b.stance && A[b.stance] ? b.stance : 'idle';
          var fighting = (stance === 'fight' || stance === 'guard') && STEPS.every(function (n) { return A[n]; });
          // turning on the spot takes small steps (a fighter pivots in his guard)
          var vl = v < 0.6 && !fighting ? Math.max(v, Math.min(1.0, Math.abs(st.yr) * 0.32)) : v;
          var mv = smooth(0.12, 0.9, vl), jk = smooth(fighting ? 2.0 : 2.2, fighting ? 3.0 : 3.2, vl), rk = smooth(4.2, 5.4, vl), sk = smooth(6.8, 8.6, vl);
          var gait = b.gait && A[b.gait] ? b.gait : 'walk', back = !fighting && A.walkBack && Math.abs(rel) > 2.2 ? 1 : 0;
          if (b.ko) {
            if (!BR.ko && A.death) { BR.ko = true; A.death.reset(); A.death.play(); if (BR.one) { (BR.up ? BR.U : A)[BR.one].stop(); } BR.one = null; }
            T.death = 1;
          } else {
            if (BR.ko) { BR.ko = false; if (A.death) A.death.stop(); }
            // armed, the legs stand as a boxer's and the arms hold the weapon up
            var armedK = stance === 'guard' && A.fight && BR.U.guard ? 1 : 0;
            T[armedK ? 'fight' : stance] = (T[armedK ? 'fight' : stance] || 0) + 1 - mv;
            var slow = mv * (1 - jk);
            if (fighting) {
              // footwork: each step clip by how nearly it goes the way the body goes
              var ws = 0, wk = {};
              STEPS.forEach(function (n) { var c = Math.max(0, Math.cos(rel - (CL[n].meta.dir || 0))); wk[n] = c * c * c; ws += wk[n]; });
              STEPS.forEach(function (n) { T[n] = slow * wk[n] / (ws || 1); });
            } else if (back) T.walkBack = slow;
            else if (A[gait]) T[gait] = slow; else T.run = slow;
            if (A.jog) T.jog = mv * jk * (1 - rk); else T.run = (T.run || 0) + mv * jk * (1 - rk);
            T.run = (T.run || 0) + mv * rk * (1 - sk); T.sprint = mv * sk;
            // the guard stays up over the stepping legs (the fists, or the weapon)
            if (fighting && BR.U[stance]) U[stance] = (armedK ? 1 - jk : mv * (1 - jk)) * 3;
            if (b.action && A[b.action.name] && b.action.id !== BR.id) {
              if (BR.one) (BR.up ? BR.U : A)[BR.one].stop();
              BR.id = b.action.id; BR.one = b.action.name; BR.t = 0;
              // thrown on the move: the arms throw it and the legs keep stepping
              BR.up = v > 0.8 && !!BR.U[BR.one];
              var rate = clamp(Number(b.action.rate) || 1, 0.3, 3), ac = (BR.up ? BR.U : A)[BR.one];
              ac.reset(); ac.timeScale = rate; ac.play(); BR.d = CL[BR.one].clip.duration / rate;
            }
            if (BR.one) {
              BR.t += dt;
              var w = smooth(0, 0.07, BR.t) * (1 - smooth(BR.d - 0.14, BR.d, BR.t));
              if (BR.up) U[BR.one] = (U[BR.one] || 0) + w * 5;
              else { for (var n3 in T) T[n3] *= 1 - w; T[BR.one] = (T[BR.one] || 0) + w; for (var u3 in U) U[u3] *= 1 - w; }
              if (BR.t >= BR.d) { (BR.up ? BR.U : A)[BR.one].stop(); BR.one = null; }
            }
          }
          // in the air: the leap, whatever was going on
          var air = !!s.air && !b.ko && !!A.run;
          if (air) {
            if (BR.one) { (BR.up ? BR.U : A)[BR.one].stop(); BR.one = null; }
            for (var na in T) T[na] = 0; for (var ua in U) U[ua] = 0; T.run = 1;
            if (!BR.air) { A.run.time = LEAP; if (A.sprint) A.sprint.time = LEAP; }
          }
          BR.air = air;
          var sum = 0; for (var n4 in T) sum += T[n4]; sum = sum || 1;
          var k = 1 - Math.exp(-(b.ko ? 16 : air ? 22 : 10) * dt);
          for (var n5 in A) { BR.W[n5] += (T[n5] / sum - BR.W[n5]) * k; A[n5].setEffectiveWeight(BR.W[n5]); }
          // (the upper half's weights are not normalised: over the full body's, they take the arms)
          for (var u5 in BR.U) { BR.UW[u5] += (U[u5] - BR.UW[u5]) * k; BR.U[u5].setEffectiveWeight(BR.UW[u5]); }
          // every loop at the pace it was captured at, for the speed the body goes
          GAITS.concat(STEPS, ['walkBack', 'jog']).forEach(function (n) { if (A[n] && CL[n].meta.speed > 0) A[n].timeScale = clamp(vl / (CL[n].meta.speed * sc), 0.55, 1.9); });
          if (A.run) A.run.timeScale = vl > 0.5 ? clamp((vl / stepLen(vl)) * runDur, 0.5, 3.2) : 1;
          if (A.sprint) A.sprint.timeScale = A.run ? A.run.timeScale : 1;
          if (air) { A.run.timeScale = 0; if (A.sprint) A.sprint.timeScale = 0; }
          if (A.death) A.death.timeScale = 1.15;
          mixer.update(dt);
          for (var ci = 0; ci < clav.length; ci++) clav[ci].b.quaternion.slerp(clav[ci].rest, 0.75);
          if (!b.ko) { rootBone.position.x = rootRest.x; rootBone.position.z = rootRest.z; }
          // a runner leans: forward as he drives on, into a curve; walking and fighting, the capture is enough
          var accel = (v - BR.v0) / dt, runK = smooth(2.5, 5, v); BR.v0 = v;
          BR.pitch = damp(BR.pitch, b.ko ? 0 : air ? 0.14 : (clamp(accel * 0.01, -0.05, 0.08) + 0.04) * runK, 5, dt);
          BR.roll = damp(BR.roll, b.ko ? 0 : clamp(-st.yr * v * 0.015, -0.14, 0.14) * runK, 5, dt);
          root.rotation.set(BR.pitch, 0, BR.roll);
          if (sword) {
            var swinging = BR.one && /^(slash|dash)/.test(BR.one) && BR.t > 0.05 && BR.t < BR.d - 0.15;
            stepTrail(!!swinging);
            setGrip(damp(sword.userData.grip.w, b.ko ? 1 : swinging ? 1 : sword.userData.kind ? 1 : 1 - smooth(0.4, 2.5, v), 10, dt));
          }
          return BR.one;
        }
        function animate(t, dt, s) {
          CLOTH_T.value = t;
          if (s.paused || !(dt > 0)) return;
          if (s.brawl) return brawl(t, dt, s);
          var v = s.speed || 0, target = { idle: 0, start: 0, run: 0, sprint: 0, fall: 0, guard: 0, death: 0 };
          if (s.slain && act.death) {
            if (!st.dead) { st.dead = true; act.death.reset(); act.death.play(); }
            target.death = 1;
          } else if (s.crashed) {
            if (!st.crash && act.fall) { st.crash = true; act.fall.reset(); act.fall.play(); }
            target.fall = 1;
          } else {
            if (st.crash) { st.crash = false; if (act.fall) act.fall.stop(); }
            if (st.dead) { st.dead = false; act.death.stop(); }
            // a standing start from the line; a rival joining on the move just runs
            if (v > 0.3 && st.v0 <= 0.3 && v < 6 && act.start) { act.start.reset(); act.start.play(); st.startT = 0; }
            if (v <= 0.3) st.startT = -1; else if (st.startT >= 0) st.startT += dt;
            var moving = smooth(0.3, 3, v), starting = st.startT >= 0 && st.startT < startDur * 0.7 ? 1 - smooth(startDur * 0.45, startDur * 0.7, st.startT) : 0;
            var sprint = smooth(7, 15, v);
            target.idle = 1 - moving; target.start = moving * starting;
            target.run = moving * (1 - starting) * (1 - sprint); target.sprint = moving * (1 - starting) * sprint;
            if (guard) { target.guard = target.idle; target.idle = 0; }
          }
          // in the air: the leap
          var air = !!s.air && !s.crashed && !s.slain && !!act.run;
          if (air) { for (var tn in target) target[tn] = 0; target.run = 1; if (!st.air) { act.run.time = LEAP; if (act.sprint) act.sprint.time = LEAP; } }
          st.air = air;
          var acc = (v - st.v0) / dt; st.v0 = v;
          st.drive = damp(st.drive, clamp(acc / 16, 0, 1), 3, dt);
          var k = 1 - Math.exp(-(s.crashed || s.slain ? 14 : air ? 22 : 7) * dt);
          for (var n in act) { W[n] += (target[n] - W[n]) * k; act[n].setEffectiveWeight(W[n]); }
          // cadence follows speed: longer strides as the runner goes faster
          var ts = v > 0.5 ? clamp((v / stepLen(v)) * runDur, 0.5, 3.2) : 1;
          if (act.run) act.run.timeScale = air ? 0 : ts; if (act.sprint) act.sprint.timeScale = air ? 0 : ts;
          if (act.start) act.start.timeScale = 1.35;
          // the runtime slows time after a crash; the fall still has to land
          if (act.fall) act.fall.timeScale = 2.6;
          if (act.death) act.death.timeScale = 1.25;
          mixer.update(dt);
          for (var ci = 0; ci < clav.length; ci++) clav[ci].b.quaternion.slerp(clav[ci].rest, 0.75);
          // the cut, over whatever the legs are doing
          var cut = s.attack && CUTS.length && !s.slain && !s.crashed ? CUTS[(s.attack.n || 0) % CUTS.length] : null;
          st.cutW = cut ? smooth(0, 0.05, s.attack.t) * (1 - smooth(R.swingLength - 0.16, R.swingLength, s.attack.t)) : damp(st.cutW, 0, 18, dt);
          if (cut && st.cutW > 0.001) {
            var ct = Math.min(cut.from + s.attack.t * cut.rate, cut.end);
            for (var pi = 0; pi < cut.parts.length; pi++) { var cp = cut.parts[pi]; CUTQ.fromArray(cp.interp.evaluate(ct)); bones[cp.j].quaternion.slerp(CUTQ, st.cutW); }
          }
          stepTrail(!!cut && s.attack.t > 0.02 && s.attack.t < R.swingHit[1] + 0.06);
          // on the move the blade lies back along the forearm; it comes round
          // for a cut, and stands forward on guard and in a fall
          if (sword) {
            var fwd = s.slain || s.crashed ? 1 : Math.max(st.cutW > 0.001 ? smooth(0, 0.6, st.cutW) : 0, 1 - smooth(0.4, 2.5, v));
            setGrip(damp(sword.userData.grip.w, fwd, st.cutW > 0.001 ? 40 : 10, dt));
          }
          // lean into bends and steering, and forward through the drive phase
          var car = root.parent;
          if (car) {
            V.set(0, 0, 1).applyQuaternion(car.quaternion);
            var yaw = Math.atan2(V.x, V.z);
            if (st.yaw !== null) { var dy = yaw - st.yaw; if (dy > Math.PI) dy -= Math.PI * 2; if (dy < -Math.PI) dy += Math.PI * 2; st.yr = damp(st.yr, dy / dt, 6, dt); }
            st.yaw = yaw;
          }
          st.roll = damp(st.roll, s.crashed ? 0 : clamp(-st.yr * v * 0.018 - (s.lateral || 0) * 0.01, -0.24, 0.24), 5, dt);
          root.rotation.set(s.crashed || s.slain ? 0 : st.drive * 0.22 * smooth(0.3, 3, v), 0, st.roll);
        }
        // clips: the body's motion, for a driver of its own (open.traversal's animation layer)
        return { object: root, animate: animate, name: o.name, color: o.color, falls: !!act.death, sword: sword, upright: true, arm: arm, prop: makeWeapon, sick: sick, sick0: clamp(Number(o.sick) || 0, 0, 1),
          clips: function () { return Object.keys(CL).map(function (n) { return CL[n].clip; }); } };
      };
    }
    /* ---------------------------------------------------------- cyclist -- */
    // A library athlete on a racing bicycle. The bike is built here and fitted
    // to the rider: the saddle height from the legs, the reach of the bars
    // from the arms. Every frame the athlete's own skeleton is posed on it:
    // hips on the saddle, back flat, head up, and feet and hands placed by
    // two-bone IK on the turning pedals and the drops. The IK, the crank's
    // ankle path, the ankling and the knee and elbow poles follow Summer Cycle
    // (github.com/StarKnightt/summer-cycle). The bike leans at the angle a real
    // one would (the one whose tangent is v squared over g r), less the track's
    // own banking and softened on the flat, rocks when the rider stands to
    // sprint, and goes down with them in a crash. Summer Cycle's code is under
    // the MIT licence:
    //
    //   Copyright (c) 2026 Prasenjit
    //
    //   Permission is hereby granted, free of charge, to any person obtaining a copy
    //   of this software and associated documentation files (the "Software"), to deal
    //   in the Software without restriction, including without limitation the rights
    //   to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    //   copies of the Software, and to permit persons to whom the Software is
    //   furnished to do so, subject to the following conditions:
    //
    //   The above copyright notice and this permission notice shall be included in all
    //   copies or substantial portions of the Software.
    //
    //   THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    //   IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    //   FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    //   AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    //   LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    //   OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
    //   SOFTWARE.
    // helpers the rider and skater kits share: two-bone IK, an orthonormal
    // basis, vertex-coloured parts merged into one mesh, tubes and sweeps
    var KIT = (function () {
      var _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _q = new THREE.Quaternion(), _x = new THREE.Vector3(), _y = new THREE.Vector3();
      // Two-bone IK (Summer Cycle): the middle joint for a limb from a to c.
      function ik(a, c, l1, l2, pole, mid) {
        var d = _a.subVectors(c, a), len = d.length();
        len = Math.min(Math.max(len, Math.abs(l1 - l2) + 1e-3), l1 + l2 - 1e-3);
        d.normalize();
        var cosA = (l1 * l1 + len * len - l2 * l2) / (2 * l1 * len), sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
        var perp = _b.copy(pole).sub(_c.copy(d).multiplyScalar(pole.dot(d))).normalize();
        return mid.copy(a).addScaledVector(d, l1 * cosA).addScaledVector(perp, l1 * sinA);
      }
      // an orthonormal basis whose z is dir and whose y leans toward up
      function basis(dir, up, m) {
        _y.copy(up).sub(_x.copy(dir).multiplyScalar(up.dot(dir))); if (_y.lengthSq() < 1e-8) _y.set(0, 1, 0); _y.normalize();
        _x.crossVectors(_y, dir).normalize();
        return m.makeBasis(_x, _y, dir);
      }

      // geometry helpers: parts in one merged, vertex-coloured mesh per group
      function Parts() { this.list = []; }
      Parts.prototype.add = function (g, hex) {
        g = g.index ? g.toNonIndexed() : g;
        var c = new THREE.Color(hex), n = g.attributes.position.count, col = new Float32Array(n * 3);
        for (var i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
        g.setAttribute('color', new THREE.BufferAttribute(col, 3));
        this.list.push(g); return g;
      };
      Parts.prototype.mesh = function (mat) {
        var n = 0; this.list.forEach(function (g) { n += g.attributes.position.count; });
        var pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3), o = 0;
        this.list.forEach(function (g) { pos.set(g.attributes.position.array, o); nor.set(g.attributes.normal.array, o); col.set(g.attributes.color.array, o); o += g.attributes.position.count * 3; });
        var geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
        var m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; return m;
      };
      function tube(a, b, rx, rz, sides) {
        var len = a.distanceTo(b), g = new THREE.CylinderGeometry(1, 1, len, sides || 10, 1, false);
        g.scale(rx, 1, rz == null ? rx : rz);
        _q.setFromUnitVectors(_d.set(0, 1, 0), _c.subVectors(b, a).normalize());
        g.applyQuaternion(_q); g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
        return g;
      }
      function sweep(points, r, segs) { return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), segs || 24, r, 8, false); }
      return { ik: ik, basis: basis, Parts: Parts, tube: tube, sweep: sweep };
    })();
    // A person at the wheel (ctx.assets.car({ driver: { human } })): one of the
    // library's scanned people in the car's own seat, hips on the cushion, back
    // against the squab, feet out to the pedals, hands at a quarter to three on
    // the wheel and turning it with the car, the head up and into the bend.
    function seatedFactory(A, human) {
      var J = A.json, REST = {};
      J.skeleton.forEach(function (b) { var n = b.name.replace(/\./g, '_'); REST[n] = { head: new THREE.Vector3().fromArray(b.head), tail: new THREE.Vector3().fromArray(b.tail || b.head) }; });
      function seg(a, b) { return REST[b].head.clone().sub(REST[a].head); }
      var THIGH = seg('upperleg01_L', 'lowerleg01_L').length(), SHIN = seg('lowerleg01_L', 'foot_L').length();
      var UPPER = seg('upperarm01_L', 'lowerarm01_L').length(), FORE = seg('lowerarm01_L', 'wrist_L').length();
      var SPINE = ['spine05', 'spine04', 'spine03', 'spine02', 'spine01'], SW = [0.12, 0.2, 0.24, 0.24, 0.2], NECK = ['neck01', 'neck02', 'neck03', 'head'];
      var ik = KIT.ik, basis = KIT.basis, FWD = new THREE.Vector3(0, 0, 1), BACK = new THREE.Vector3(0, 0, -1), UPV = new THREE.Vector3(0, 1, 0);
      return function (o, cp) {
        var H = human(o), hroot = H.object, s = hroot.scale.x;
        var bones = {}; hroot.traverse(function (b) { if (b.isBone) bones[b.name] = b; if (b.isMesh) { b.castShadow = true; b.receiveShadow = true; } });
        var seat = new THREE.Group(); seat.add(hroot); cp.body.add(seat);
        var QR = new THREE.Quaternion(), QP = new THREE.Quaternion(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m0 = new THREE.Matrix4(), _m1 = new THREE.Matrix4();
        var tA = new THREE.Vector3(), tB = new THREE.Vector3(), tC = new THREE.Vector3(), tD = new THREE.Vector3(), el = new THREE.Vector3(), hw = new THREE.Vector3(), pole = new THREE.Vector3();
        // turn bone b so its rest direction (model space) points along dirW (world), its restUp toward upW
        function aim(b, restDir, restUp, dirW, upW) {
          hroot.getWorldQuaternion(QR);
          basis(tA.copy(restDir).normalize().applyQuaternion(QR), tB.copy(restUp).applyQuaternion(QR), _m0);
          basis(dirW.clone().normalize(), upW, _m1);
          _q.setFromRotationMatrix(_m1).multiply(_q2.setFromRotationMatrix(_m0).invert()).multiply(QR);
          b.parent.getWorldQuaternion(QP);
          b.quaternion.copy(QP.invert().multiply(_q));
          b.updateMatrixWorld(true);
        }
        function toWorld(v) { return seat.localToWorld(v); }
        function dirW(v) { return v.clone().transformDirection(seat.matrixWorld); }
        // the back leans with the seat; the spine curls just enough to bring the head upright
        var tilt = -cp.recline * 0.85, spine = Math.min(0.5, cp.recline * 0.55);
        var HIP = cp.hip.clone().add(new THREE.Vector3(0, 0.1, 0.02));
        function sitDown() {
          cp.body.updateMatrixWorld(true);
          var rb = bones.root;
          rb.quaternion.setFromEuler(new THREE.Euler(tilt, 0, 0)); rb.position.set(0, 0, 0); hroot.updateMatrixWorld(true);
          var hipNow = tD.copy(bones.upperleg01_L.getWorldPosition(tA)).add(bones.upperleg01_R.getWorldPosition(tB)).multiplyScalar(0.5);
          seat.worldToLocal(hipNow);
          rb.position.copy(tC.copy(HIP).sub(hipNow).divideScalar(s));
          for (var i = 0; i < SPINE.length; i++) if (bones[SPINE[i]]) bones[SPINE[i]].quaternion.setFromEuler(new THREE.Euler(spine * SW[i], 0, 0));
          hroot.updateMatrixWorld(true);
          // the legs out to the pedals, knees up a little, toes up on the pedals
          var reach = (THIGH + SHIN) * s;
          [['L', 1], ['R', -1]].forEach(function (Lg) {
            var hipW = bones['upperleg01_' + Lg[0]].getWorldPosition(new THREE.Vector3());
            var hipL = seat.worldToLocal(hipW.clone());
            var ank = new THREE.Vector3(hipL.x + Lg[1] * 0.02, Math.max(cp.floor + 0.09, hipL.y - reach * 0.5), hipL.z + reach * 0.8);
            var ankW = toWorld(ank), knee = new THREE.Vector3();
            pole.copy(dirW(new THREE.Vector3(Lg[1] * 0.15, 1, 0.3)));
            ik(hipW, ankW, THIGH * s, SHIN * s, pole, knee);
            aim(bones['upperleg01_' + Lg[0]], seg('upperleg01_' + Lg[0], 'lowerleg01_' + Lg[0]), FWD, knee.clone().sub(hipW), pole);
            var kneeW = bones['lowerleg01_' + Lg[0]].getWorldPosition(new THREE.Vector3());
            aim(bones['lowerleg01_' + Lg[0]], seg('lowerleg01_' + Lg[0], 'foot_' + Lg[0]), FWD, ankW.clone().sub(kneeW), pole);
            var fb = bones['foot_' + Lg[0]];
            if (fb) aim(fb, REST['foot_' + Lg[0]].tail.clone().sub(REST['foot_' + Lg[0]].head), UPV, dirW(new THREE.Vector3(0, 0.55, 1)), dirW(UPV));
          });
        }
        // the arms to the rim, the head into the bend: every frame, with the wheel
        var look = 0;
        function hands(turn, dt) {
          cp.body.updateMatrixWorld(true);
          look = dt ? damp(look, clamp(turn * 0.12, -0.3, 0.3), 4, dt) : 0;
          var neckTilt = -(tilt + spine) * 0.9;
          for (var i = 0; i < NECK.length; i++) if (bones[NECK[i]]) bones[NECK[i]].quaternion.setFromEuler(new THREE.Euler(neckTilt / NECK.length, -look / NECK.length * 2, 0, 'YXZ'));
          hroot.updateMatrixWorld(true);
          cp.wheel.updateMatrix();
          [['L', 1], ['R', -1]].forEach(function (Ar) {
            var ga = Ar[1] > 0 ? 0.25 : Math.PI - 0.25;
            hw.set(Math.cos(ga + turn) * cp.rimR, Math.sin(ga + turn) * cp.rimR, -0.02).applyMatrix4(cp.wheel.matrix);
            var wristW = toWorld(hw.clone());
            var shW = bones['upperarm01_' + Ar[0]].getWorldPosition(new THREE.Vector3());
            var ep = dirW(new THREE.Vector3(Ar[1] * 0.7, -0.7, -0.15));
            ik(shW, wristW, UPPER * s, FORE * s, ep, el);
            aim(bones['upperarm01_' + Ar[0]], seg('upperarm01_' + Ar[0], 'lowerarm01_' + Ar[0]), BACK, el.clone().sub(shW), ep);
            var elW = bones['lowerarm01_' + Ar[0]].getWorldPosition(new THREE.Vector3());
            aim(bones['lowerarm01_' + Ar[0]], seg('lowerarm01_' + Ar[0], 'wrist_' + Ar[0]), BACK, wristW.clone().sub(elW), ep);
          });
        }
        sitDown(); hands(0, 0);
        cp.person.forEach(function (m) { m.visible = false; });
        cp.onSteer = function (turn, dt) { hands(turn, dt); };
        return { object: seat, bones: bones };
      };
    }
    function cyclistFactory(A, human) {
      var PI = Math.PI, TAU = PI * 2;
      var J = A.json, IDX = {}, REST = {};
      J.skeleton.forEach(function (b, i) { var n = b.name.replace(/\./g, '_'); IDX[n] = i; REST[n] = { head: new THREE.Vector3().fromArray(b.head), tail: new THREE.Vector3().fromArray(b.tail || b.head) }; });
      function seg(a, b) { return REST[b].head.clone().sub(REST[a].head); }
      var THIGH = seg('upperleg01_L', 'lowerleg01_L').length(), SHIN = seg('lowerleg01_L', 'foot_L').length();
      var UPPER = seg('upperarm01_L', 'lowerarm01_L').length(), FORE = seg('lowerarm01_L', 'wrist_L').length();
      var WR = 0.335;
      var _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m0 = new THREE.Matrix4(), _m1 = new THREE.Matrix4(), _x = new THREE.Vector3(), _y = new THREE.Vector3();

      var ik = KIT.ik, basis = KIT.basis, Parts = KIT.Parts, tube = KIT.tube, sweep = KIT.sweep;
      var V = function (x, y, z) { return new THREE.Vector3(x, y, z); };

      function wheel(kind, tyre, rimHex, hubHex) {
        var p = new Parts(), g;
        p.add(new THREE.TorusGeometry(WR - 0.012, 0.012, 8, 48).rotateY(PI / 2), tyre);
        if (kind === 'disc') {
          g = new THREE.CylinderGeometry(WR - 0.02, WR - 0.02, 0.022, 48, 1); g.rotateZ(PI / 2);
          var pa = g.attributes.position; for (var i = 0; i < pa.count; i++) { var r = Math.hypot(pa.getY(i), pa.getZ(i)); pa.setX(i, pa.getX(i) * (1.35 - r / WR)); }
          g.computeVertexNormals(); p.add(g, rimHex);
        } else {
          var depth = kind === 'deep' ? 0.075 : 0.045;
          g = new THREE.CylinderGeometry(WR - 0.02, WR - 0.02, 0.024, 48, 1, true); g.rotateZ(PI / 2); p.add(g, rimHex);
          g = new THREE.CylinderGeometry(WR - 0.02 - depth, WR - 0.02 - depth, 0.02, 48, 1, true); g.rotateZ(PI / 2); p.add(g, rimHex);
          p.add(new THREE.RingGeometry(WR - 0.02 - depth, WR - 0.02, 48).rotateY(PI / 2).translate(0.012, 0, 0), rimHex);
          p.add(new THREE.RingGeometry(WR - 0.02 - depth, WR - 0.02, 48).rotateY(-PI / 2).translate(-0.012, 0, 0), rimHex);
          var n = kind === 'five' ? 5 : 20;
          for (var s = 0; s < n; s++) {
            var ang = s / n * TAU, side = s % 2 ? 1 : -1, ex = V(0, Math.cos(ang) * (WR - 0.02 - depth), Math.sin(ang) * (WR - 0.02 - depth));
            if (kind === 'five') p.add(tube(V(0, 0, 0), ex, 0.006, 0.022, 6), rimHex);
            else p.add(tube(V(side * 0.03, 0, 0), ex, 0.0012, null, 4), '#C8CCD2');
          }
        }
        p.add(new THREE.CylinderGeometry(0.02, 0.02, 0.1, 12).rotateZ(PI / 2), hubHex);
        var mat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.15, clearcoat: 0.8, clearcoatRoughness: 0.2 });
        return p.mesh(mat);
      }

      function helmet(kind, hex, trim, visor) {
        var p = new Parts(), g = new THREE.SphereGeometry(1, 28, 18, 0, TAU, 0, PI * 0.62);
        var pa = g.attributes.position;
        for (var i = 0; i < pa.count; i++) {
          var x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i);
          if (kind === 'aero' && z < 0) { var t = -z; z = -t * (1 + 1.25 * t * t); x *= 1 - 0.5 * t * t; y = y * (1 - 0.35 * t * t) + 0.06 * t * t; }
          pa.setXYZ(i, x * 0.106, y * 0.128, z * 0.132);
        }
        g.computeVertexNormals(); p.add(g, hex);
        // a stripe of the trim colour, and the visor (track) or dark lenses (road)
        var st = new THREE.TorusGeometry(0.1, 0.007, 6, 32, PI); st.rotateY(PI / 2); st.scale(1, 1.24, 1.3); p.add(st, trim);
        if (visor) { var vg = new THREE.SphereGeometry(0.132, 24, 8, PI * 0.2, PI * 0.6, PI * 0.5, PI * 0.17); p.add(vg, '#15181D'); }
        var m = p.mesh(new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.08, metalness: 0.1 }));
        return m;
      }

      return function (o) {
        o = o || {};
        var bk = o.bike || {}, kind = bk.kind === 'road' ? 'road' : 'track';
        var ho = Object.assign({}, o, { hair: o.helmet === false ? o.hair : 'none' });
        var H = human(ho), hroot = H.object, s = hroot.scale.x;
        var bones = {}; hroot.traverse(function (b) { if (b.isBone) bones[b.name] = b; });
        var legK = (THIGH + SHIN) * s / 0.929;
        var root = new THREE.Group(), lean = new THREE.Group(), bike = new THREE.Group();
        root.add(lean); lean.add(bike); lean.add(hroot);

        /* --- fit: saddle, cranks and bars for this rider --- */
        var BB = V(0, 0.28, 0), CR = 0.1725 * Math.min(1.05, Math.max(0.95, legK));
        var SEAT = V(0, BB.y + 0.69 * legK, -0.2 * legK);
        var HIP = SEAT.clone().add(V(0, 0.085 * legK, 0.03));
        var RA = V(0, WR, -0.405), FA = V(0, WR, kind === 'track' ? 0.575 : 0.59);
        var HT = V(0, 0.79 + 0.08 * (legK - 1), 0.44), HB = V(0, 0.655, 0.48);
        var GEAR = kind === 'track' ? 3.9 : 3.5;
        // cruising pose: pelvis tilted, spine flat, head up
        var POSE = kind === 'track' ? { hip: 0.46, spine: 0.84, arm: 0.5 } : { hip: 0.38, spine: 0.62, arm: 0.42 };
        var SPINE = ['spine05', 'spine04', 'spine03', 'spine02', 'spine01'], SW = [0.12, 0.2, 0.24, 0.24, 0.2];
        var NECK = ['neck01', 'neck02', 'neck03', 'head'];
        var st = { crank: 1.0, wheel: 0, v0: 0, acc: 0, stand: 0, yaw: null, yr: 0, roll: 0, fall: 0, fallSide: 1, t: 0 };
        function poseTorso(tilt, spine, stand, sway) {
          var rb = bones.root;
          var up = stand * 0.13 * legK, fw = stand * 0.12 * legK;
          // the hip joints' midpoint lands on HIP (model units: the human root's scale is s)
          rb.quaternion.setFromEuler(new THREE.Euler(tilt, 0, sway * 0.6));
          rb.position.set(0, 0, 0); hroot.updateMatrixWorld(true);
          var hipNow = _d.copy(bones.upperleg01_L.getWorldPosition(_a)).add(bones.upperleg01_R.getWorldPosition(_b)).multiplyScalar(0.5);
          lean.worldToLocal(hipNow);
          var target = _c.copy(HIP).add(V(0, up, fw));
          rb.position.copy(target.sub(hipNow).divideScalar(s));
          for (var i = 0; i < SPINE.length; i++) if (bones[SPINE[i]]) bones[SPINE[i]].quaternion.setFromEuler(new THREE.Euler(spine * SW[i], 0, -sway * 0.35 * SW[i] * 5));
          var total = tilt + spine, look = 0.3 - total;
          for (i = 0; i < NECK.length; i++) if (bones[NECK[i]]) bones[NECK[i]].quaternion.setFromEuler(new THREE.Euler(look / NECK.length, 0, 0));
          hroot.updateMatrixWorld(true);
        }
        // fit the bars to this rider's reach in the cruising pose
        root.updateMatrixWorld(true);
        poseTorso(POSE.hip, POSE.spine, 0, 0);
        var shL = lean.worldToLocal(bones.upperarm01_L.getWorldPosition(new THREE.Vector3()));
        var armLen = (UPPER + FORE) * s;
        var dirArm = V(0, -Math.cos(POSE.arm), Math.sin(POSE.arm));
        var GRIP = shL.clone().addScaledVector(dirArm, armLen * 0.9);
        var gripX = Math.max(0.17, Math.abs(shL.x) * 0.9);
        GRIP.z = Math.max(GRIP.z, HT.z + 0.1);
        var BAR = V(0, GRIP.y + 0.12, GRIP.z - 0.03);

        /* --- the bike --- */
        var frameHex = isHex(bk.frame) ? bk.frame : '#E8E4DA', trimHex = isHex(bk.trim) ? bk.trim : '#1B1B1D', carbon = '#1A1B1E';
        var P = new Parts();
        var SC = BB.clone().lerp(SEAT, 0.78);
        [[BB, HB, 0.024, 0.032], [SC, HT, 0.02, 0.024], [BB, SC, 0.02, 0.026], [HB, HT, 0.024, 0.024]].forEach(function (t) { P.add(tube(t[0], t[1], t[2], t[3], 12), frameHex); });
        [-1, 1].forEach(function (sd) {
          P.add(tube(V(sd * 0.02, SC.y - 0.02, SC.z), V(sd * 0.062, RA.y, RA.z), 0.009, 0.012, 8), frameHex);
          P.add(tube(V(sd * 0.03, BB.y, BB.z - 0.02), V(sd * 0.064, RA.y, RA.z), 0.011, 0.014, 8), frameHex);
          P.add(tube(V(sd * 0.02, HB.y, HB.z), V(sd * 0.052, FA.y, FA.z), 0.012, 0.018, 8), kind === 'track' ? frameHex : carbon);
        });
        // accent band on the down tube in the trim colour
        P.add(tube(BB.clone().lerp(HB, 0.55), BB.clone().lerp(HB, 0.75), 0.025, 0.033, 12), trimHex);
        P.add(tube(SC, SEAT.clone().add(V(0, -0.02, 0)), 0.013, 0.013, 8), carbon);
        var sad = new THREE.BoxGeometry(0.13, 0.035, 0.27); var sp = sad.attributes.position;
        for (var i = 0; i < sp.count; i++) { var z = sp.getZ(i); sp.setX(i, sp.getX(i) * (z > 0.02 ? 0.35 : 1)); }
        sad.computeVertexNormals(); sad.translate(SEAT.x, SEAT.y - 0.005, SEAT.z + 0.02); P.add(sad, carbon);
        P.add(tube(HT, V(0, BAR.y, BAR.z - 0.01), 0.014, 0.014, 8), carbon);
        [-1, 1].forEach(function (sd) {
          var gx = sd * gripX;
          P.add(sweep([V(0, BAR.y, BAR.z), V(gx * 0.6, BAR.y, BAR.z + 0.01), V(gx, BAR.y, BAR.z + 0.02), V(gx, BAR.y - 0.01, BAR.z + 0.09), V(gx, BAR.y - 0.07, BAR.z + 0.12), V(gx, BAR.y - 0.12, BAR.z + 0.07), V(gx, BAR.y - 0.13, BAR.z - 0.04)], 0.012, 20), trimHex);
        });
        P.add(new THREE.CylinderGeometry(0.035, 0.035, 0.07, 14).rotateZ(PI / 2).translate(BB.x, BB.y, BB.z), '#2A2B2E');
        var paint = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.25, clearcoat: 1, clearcoatRoughness: 0.07 });
        bike.add(P.mesh(paint));
        var rear = wheel(bk.rear || (kind === 'track' ? 'disc' : 'deep'), '#141414', kind === 'track' ? carbon : carbon, '#8E949B');
        var front = wheel(bk.front || (kind === 'track' ? 'five' : 'deep'), '#141414', carbon, '#8E949B');
        rear.position.copy(RA); front.position.copy(FA); bike.add(rear, front);
        var crankG = new THREE.Group(), CP = new Parts();
        CP.add(new THREE.TorusGeometry(kind === 'track' ? 0.118 : 0.105, 0.006, 6, 40).rotateY(PI / 2).translate(0.045, 0, 0), '#B9BEC6');
        CP.add(new THREE.CylinderGeometry(kind === 'track' ? 0.112 : 0.1, kind === 'track' ? 0.112 : 0.1, 0.004, 40, 1).rotateZ(PI / 2).translate(0.045, 0, 0), '#2A2B2E');
        CP.add(new THREE.BoxGeometry(0.016, CR, 0.03).translate(0.058, CR / 2, 0), carbon);
        CP.add(new THREE.BoxGeometry(0.016, CR, 0.03).translate(-0.058, -CR / 2, 0), carbon);
        crankG.add(CP.mesh(paint)); crankG.position.copy(BB); bike.add(crankG);
        var pedals = [-1, 1].map(function (sd) { var m = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.018, 0.095), new THREE.MeshStandardMaterial({ color: '#202124', roughness: 0.5 })); m.castShadow = true; bike.add(m); return m; });
        // a chain from the ring to the cog
        var chain = new THREE.Mesh(tube(V(0.045, BB.y + 0.1, BB.z), V(0.045, RA.y + 0.04, RA.z), 0.004, null, 4).clone(), new THREE.MeshStandardMaterial({ color: '#3A3C40', metalness: 0.8, roughness: 0.4 }));
        bike.add(chain);
        if (o.helmet !== false) {
          var hm = o.helmet || {};
          var hel = helmet(hm.kind || (kind === 'track' ? 'aero' : 'road'), isHex(hm.color) ? hm.color : '#F4F4F2', isHex(hm.trim) ? hm.trim : trimHex, hm.visor != null ? !!hm.visor : kind === 'track');
          // centred on the cranium, a little above and ahead of the head joint
          var hb = bones.head; if (hb) { hel.position.set(0, 0.056, 0.036); hb.add(hel); }
        }

        /* --- every frame --- */
        var legs = [{ s: 'L', side: 1 }, { s: 'R', side: -1 }], arms = [{ s: 'L', side: 1 }, { s: 'R', side: -1 }];
        var tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), knee = new THREE.Vector3(), pole = new THREE.Vector3(), QR = new THREE.Quaternion(), QP = new THREE.Quaternion();
        // turn bone b so its rest direction (model space) points along dirW, twisted so restUp follows upW
        function aim(b, restDir, restUp, dirW, upW) {
          hroot.getWorldQuaternion(QR);
          basis(tmpA.copy(restDir).normalize().applyQuaternion(QR), tmpB.copy(restUp).applyQuaternion(QR), _m0);
          basis(dirW.clone().normalize(), upW, _m1);
          _q.setFromRotationMatrix(_m1).multiply(_q2.setFromRotationMatrix(_m0).invert()).multiply(QR);
          b.parent.getWorldQuaternion(QP);
          b.quaternion.copy(QP.invert().multiply(_q));
          b.updateMatrixWorld(true);
        }
        // lean-group space to world: points and directions
        function toWorld(v) { return lean.localToWorld(v); }
        function dirW(v) { return v.clone().transformDirection(lean.matrixWorld); }
        var FWD = V(0, 0, 1), BACK = V(0, 0, -1), UPV = V(0, 1, 0);
        function pose(standK, sway) {
          poseTorso(POSE.hip - standK * 0.12, POSE.spine - standK * 0.22, standK, sway);
          for (var i = 0; i < 2; i++) {
            var L = legs[i], a = st.crank + (i ? PI : 0), side = L.side;
            // the pedal on the crank circle; the ankle sits above and behind it,
            // and the foot tips through the stroke (ankling)
            var ped = V(side * 0.105, BB.y + Math.cos(a) * CR, BB.z + Math.sin(a) * CR);
            pedals[i].position.copy(ped);
            var toe = V(0, -0.15 + 0.2 * Math.cos(a), 1).normalize();
            var ank = V(side * 0.118, ped.y, ped.z).add(V(0, 0.065 * legK, 0)).addScaledVector(toe, -0.1 * legK);
            var hipW = bones['upperleg01_' + L.s].getWorldPosition(new THREE.Vector3());
            var ankW = toWorld(ank);
            pole.copy(dirW(V(side * 0.12, 0.35, 1)));
            ik(hipW, ankW, THIGH * s, SHIN * s, pole, knee);
            aim(bones['upperleg01_' + L.s], seg('upperleg01_' + L.s, 'lowerleg01_' + L.s), FWD, knee.clone().sub(hipW), pole);
            var kneeW = bones['lowerleg01_' + L.s].getWorldPosition(new THREE.Vector3());
            aim(bones['lowerleg01_' + L.s], seg('lowerleg01_' + L.s, 'foot_' + L.s), FWD, ankW.clone().sub(kneeW), pole);
            var fb = bones['foot_' + L.s];
            if (fb) aim(fb, REST['foot_' + L.s].tail.clone().sub(REST['foot_' + L.s].head), UPV, dirW(toe), dirW(UPV));
          }
          for (i = 0; i < 2; i++) {
            var Aa = arms[i], sd = Aa.side;
            var shW = bones['upperarm01_' + Aa.s].getWorldPosition(new THREE.Vector3());
            var wristW = toWorld(V(sd * gripX, BAR.y - 0.105 + standK * 0.02, BAR.z + 0.03));
            // elbows out, down and back (Summer Cycle's pole), bent the way elbows bend
            var ep = dirW(V(sd * 0.45, -0.8, -0.45));
            var elbow = ik(shW, wristW, UPPER * s, FORE * s, ep, new THREE.Vector3());
            aim(bones['upperarm01_' + Aa.s], seg('upperarm01_' + Aa.s, 'lowerarm01_' + Aa.s), BACK, elbow.clone().sub(shW), ep);
            var elW = bones['lowerarm01_' + Aa.s].getWorldPosition(new THREE.Vector3());
            aim(bones['lowerarm01_' + Aa.s], seg('lowerarm01_' + Aa.s, 'wrist_' + Aa.s), BACK, wristW.clone().sub(elW), ep);
          }
        }
        function animate(t, dt, S) {
          if (S.paused || !(dt > 0)) return;
          var v = S.speed || 0;
          st.acc = damp(st.acc, (v - st.v0) / dt, 4, dt); st.v0 = v;
          // wheels and crank turn with the road; a fixed gear, as on the track
          st.wheel += v / WR * dt; st.crank += v / WR / GEAR * dt;
          rear.rotation.x = st.wheel; front.rotation.x = st.wheel; crankG.rotation.x = st.crank;
          // out of the saddle when accelerating hard or getting away from the line
          var standT = S.crashed ? 0 : Math.max(smooth(2, 7, st.acc), v > 0.3 && v < 8 ? 0.8 : 0);
          st.stand = damp(st.stand, standT, 5, dt);
          // lean into the bend like a bicycle: tan(lean) = v * yaw rate / g, less the track's bank
          var car = root.parent;
          var bankNow = 0;
          if (car) {
            _d.set(0, 0, 1).applyQuaternion(car.getWorldQuaternion(_q));
            // the runtime turns a carrier a little toward its steering (about
            // 0.047 rad per m/s sideways); take that out, or every quick steer
            // reads as a hairpin and the bike lies down
            var yaw = Math.atan2(_d.x, _d.z) + (S.lateral || 0) * 0.047;
            if (st.yaw !== null) { var dy = yaw - st.yaw; if (dy > PI) dy -= TAU; if (dy < -PI) dy += TAU; st.yr = damp(st.yr, clamp(dy / dt, -1.5, 1.5), 4, dt); }
            st.yaw = yaw;
            _c.set(1, 0, 0).applyQuaternion(_q); bankNow = Math.asin(clamp(-_c.y, -1, 1));
          }
          // the bend's lean (a rider tops out near 45 degrees; the runtime's
          // speeds would ask for more), less the bank the carrier already has.
          // What the surface doesn't give is softened: on a flat road the full
          // lean at these speeds reads as a motorbike, while on a velodrome's
          // 42-degree bends the rider still ends up square to the boards
          var phys = clamp(Math.atan(v * st.yr / 9.81), -0.78, 0.78);
          var want = -clamp((phys - bankNow) * 0.7, -0.6, 0.6) + clamp(S.lateral || 0, -10, 10) * 0.018;
          st.roll = damp(st.roll, clamp(want, -0.75, 0.75), 7, dt);
          var rock = Math.sin(st.crank) * 0.13 * st.stand;
          if (S.crashed) st.fall = Math.min(1, st.fall + dt * 3.2); else st.fall = Math.max(0, st.fall - dt * 2);
          if (st.fall === 0) st.fallSide = st.roll >= 0 ? 1 : -1;
          lean.rotation.set(-st.fall * 0.25, 0, st.roll + rock * 0.6 + st.fallSide * st.fall * 1.35);
          lean.position.y = -st.fall * 0.1;
          pose(st.stand, -rock);
        }
        root.updateMatrixWorld(true);
        pose(0, 0);
        return { object: root, animate: animate, name: o.name, color: o.color, radius: 0.45 };
      };
    }
    var capturingPlayer = false, playerRide = null, playerSkate = null, playerArms = null, playerCar = null;
    // A scanned surface as a ready material (ctx.assets.surface): its maps are
    // laid on by where each point is in the world, a tile to the metres the
    // scan covers, so ground, walls and rocks of any size come out at true
    // scale with no UVs to set. Across a big field the tiles would repeat in
    // rows, so each map is read twice, the second copy turned and shifted,
    // and the two are mixed by a slow noise, with a broad light and dark
    // mottle on top: sand, grass and concrete read as one surface to the
    // horizon. 'ground' lays the maps from above; 'box' (walls, rocks, props)
    // from whichever of the three sides a face looks toward, blended.
    function surfaceMaterial(a, o) {
      o = o || {};
      var J = a.json, maps = {};
      [['color', 'map', true], ['normal', 'normalMap', false], ['roughness', 'roughnessMap', false]].forEach(function (m) {
        var f = J.maps[m[0]], bm = f && a.images[f]; if (!bm) return;
        var t = new THREE.Texture(bm); t.flipY = false; t.colorSpace = m[2] ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = ANISO; t.needsUpdate = true; maps[m[1]] = t;
      });
      var P = { color: isHex(o.color) ? o.color : '#FFFFFF', roughness: num(o.roughness, 1, 0, 2), metalness: num(o.metalness, 0, 0, 1), envMapIntensity: num(o.envMapIntensity, 1, 0, 4),
        map: maps.map || null, normalMap: maps.normalMap || null, roughnessMap: maps.roughnessMap || null, side: o.side === 'double' ? THREE.DoubleSide : THREE.FrontSide };
      var physical = o.clearcoat != null || o.sheen != null;
      if (physical) { P.clearcoat = num(o.clearcoat, 0, 0, 1); P.clearcoatRoughness = num(o.clearcoatRoughness, 0.1, 0, 1); }
      var mat = physical ? new THREE.MeshPhysicalMaterial(P) : new THREE.MeshStandardMaterial(P);
      var bump = num(o.normal, 1, 0, 3);
      mat.normalScale.set(bump, bump);
      var box = o.project === 'box', mix2 = quality !== 'low' && o.variety !== false;
      mat.defines = Object.assign(mat.defines || {}, { GM_SURF: 1 }, box ? { GM_SURF_BOX: 1 } : {}, mix2 ? { GM_SURF_MIX: 1 } : {});
      // some scans lean: their normal map tilts, on average, one way (the sand's
      // by about 9 degrees), which would light the whole ground as a slope and,
      // turned region by region, as rings. The lean is measured once and taken off.
      if (maps.normalMap && !a.nLean) {
        a.nLean = [0, 0];
        try {
          var nc = document.createElement('canvas'); nc.width = nc.height = 64; var ng = nc.getContext('2d', { willReadFrequently: true });
          ng.drawImage(maps.normalMap.image, 0, 0, 64, 64); var nd = ng.getImageData(0, 0, 64, 64).data, sx = 0, sy = 0;
          for (var ni = 0; ni < nd.length; ni += 4) { sx += nd[ni]; sy += nd[ni + 1]; }
          a.nLean = [sx / 4096 / 255 * 2 - 1, sy / 4096 / 255 * 2 - 1];
        } catch (e) {}
      }
      var U = { uSurfSize: { value: num(o.size, J.size || 1, 0.05, 200) }, uSurfMottle: { value: num(o.mottle, 0.14, 0, 0.6) }, uSurfLean: { value: new THREE.Vector2().fromArray(a.nLean || [0, 0]) } };
      mat.onBeforeCompile = function (sh) {
        Object.assign(sh.uniforms, U);
        sh.vertexShader = 'varying vec3 vGmP; varying vec3 vGmN;\n' + sh.vertexShader.replace('#include <project_vertex>', [
          '#include <project_vertex>',
          'vec4 gmP = vec4( transformed, 1.0 ); vec3 gmN = objectNormal;',
          '#ifdef USE_INSTANCING',
          'gmP = instanceMatrix * gmP; gmN = mat3( instanceMatrix ) * gmN;',
          '#endif',
          'vGmP = ( modelMatrix * gmP ).xyz; vGmN = normalize( mat3( modelMatrix ) * gmN );',
        ].join('\n'));
        var head = [
          'uniform float uSurfSize, uSurfMottle; uniform vec2 uSurfLean; varying vec3 vGmP; varying vec3 vGmN;',
          'float gmH( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }',
          'float gmV( vec2 p ) { vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f ); return mix( mix( gmH( i ), gmH( i + vec2( 1, 0 ) ), f.x ), mix( gmH( i + vec2( 0, 1 ) ), gmH( i + vec2( 1, 1 ) ), f.x ), f.y ); }',
          // one projection: the colour, the normal map turned into the world
          // (along u and v), the roughness. Mixed, each region a few tiles
          // across takes the scan at its own shift and turn, and neighbouring
          // regions blend, so no row of repeats survives to the horizon
          // (gradients passed explicitly, so the jumps leave no seams)
          'struct GmS { vec4 c; vec3 n; float r; };',
          'mat2 gmRot( float a ) { float c = cos( a ), s = sin( a ); return mat2( c, s, -s, c ); }',
          'void gmTap( vec2 uv, vec2 gx, vec2 gy, float i, out vec4 c, out vec2 t, out float r ) {',
          '  float a = fract( sin( i * 12.9898 ) * 4375.85 ) * 6.2831; mat2 R = gmRot( a );',
          '  vec2 q = R * uv + sin( vec2( 3.0, 7.0 ) * i ) * 7.0, qx = R * gx, qy = R * gy;',
          '  c = vec4( 1.0 ); t = vec2( 0.0 ); r = 1.0;',
          '  #ifdef USE_MAP',
          '  c = textureGrad( map, q, qx, qy );',
          '  #endif',
          '  #ifdef USE_NORMALMAP',
          // a map texel's x runs along u, its y up the picture (against v, as the maps are not flipped)
          '  t = gmRot( -a ) * ( ( textureGrad( normalMap, q, qx, qy ).xy * 2.0 - 1.0 - uSurfLean ) * vec2( 1.0, -1.0 ) );',
          '  #endif',
          '  #ifdef USE_ROUGHNESSMAP',
          '  r = textureGrad( roughnessMap, q, qx, qy ).g;',
          '  #endif',
          '}',
          'GmS gmRead( vec2 uv, vec3 du, vec3 dv ) {',
          '  GmS s; vec2 gx = dFdx( uv ), gy = dFdy( uv ); vec4 c; vec2 t; float r;',
          '  #ifdef GM_SURF_MIX',
          '  float l = gmV( uv * 0.16 ) * 8.0, ia = floor( l ), f = fract( l );',
          '  vec4 c2; vec2 t2; float r2;',
          '  gmTap( uv, gx, gy, ia, c, t, r ); gmTap( uv, gx, gy, ia + 1.0, c2, t2, r2 );',
          '  float k = smoothstep( 0.2, 0.8, f - 0.1 * dot( c.rgb - c2.rgb, vec3( 1.0 ) ) );',
          '  c = mix( c, c2, k ); t = mix( t, t2, k ); r = mix( r, r2, k );',
          '  #else',
          '  gmTap( uv, gx, gy, 0.0, c, t, r );',
          '  #endif',
          '  #ifdef USE_NORMALMAP',
          '  t *= normalScale;',
          '  #endif',
          '  s.c = c; s.n = du * t.x + dv * t.y; s.r = r;',
          '  return s;',
          '}',
        ].join('\n');
        // after three's own declarations (the maps, normalScale), before main
        sh.fragmentShader = sh.fragmentShader.replace('void main() {', head + '\nvoid main() {')
          .replace('#include <map_fragment>', [
            'vec3 gmWN = normalize( vGmN ); vec3 gmP = vGmP / uSurfSize;',
            'GmS gmS;',
            '#ifdef GM_SURF_BOX',
            // three sides, each taken by the faces that look toward it, the
            // picture upright on the walls and never mirrored
            'vec3 gmW = pow( abs( gmWN ), vec3( 6.0 ) ); gmW /= gmW.x + gmW.y + gmW.z;',
            'float sx = gmWN.x < 0.0 ? -1.0 : 1.0, sz = gmWN.z < 0.0 ? -1.0 : 1.0, sy = gmWN.y < 0.0 ? -1.0 : 1.0;',
            'GmS gA = gmRead( vec2( -sx * gmP.z, -gmP.y ), vec3( 0.0, 0.0, -sx ), vec3( 0.0, -1.0, 0.0 ) );',
            'GmS gB = gmRead( vec2( gmP.x, sy * gmP.z ), vec3( 1.0, 0.0, 0.0 ), vec3( 0.0, 0.0, sy ) );',
            'GmS gC = gmRead( vec2( sz * gmP.x, -gmP.y ), vec3( sz, 0.0, 0.0 ), vec3( 0.0, -1.0, 0.0 ) );',
            'gmS.c = gA.c * gmW.x + gB.c * gmW.y + gC.c * gmW.z; gmS.n = gA.n * gmW.x + gB.n * gmW.y + gC.n * gmW.z; gmS.r = gA.r * gmW.x + gB.r * gmW.y + gC.r * gmW.z;',
            '#else',
            'gmS = gmRead( gmP.xz, vec3( 1.0, 0.0, 0.0 ), vec3( 0.0, 0.0, 1.0 ) );',
            '#endif',
            // a broad mottle, lighter and darker over tens of metres
            'float gmM = gmV( vGmP.xz / ( uSurfSize * 9.0 ) ) * 0.65 + gmV( vGmP.xz / ( uSurfSize * 31.0 ) + 5.0 ) * 0.35;',
            'diffuseColor *= gmS.c; diffuseColor.rgb *= 1.0 + ( gmM - 0.5 ) * 2.0 * uSurfMottle;',
          ].join('\n'))
          .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = min( roughness * gmS.r, 1.0 );')
          .replace('#include <normal_fragment_maps>', [
            // the normal the lighting uses, in the world, tipped by the maps
            'vec3 gmNW = normalize( ( vec4( normal, 0.0 ) * viewMatrix ).xyz );',
            'gmNW = normalize( gmNW + gmS.n - gmNW * dot( gmNW, gmS.n ) );',
            'normal = normalize( ( viewMatrix * vec4( gmNW, 0.0 ) ).xyz );',
          ].join('\n'));
      };
      mat.userData.gmSurface = { id: a.id || null, size: U.uSurfSize.value, project: box ? 'box' : 'ground', lean: +Math.hypot(U.uSurfLean.value.x, U.uSurfLean.value.y).toFixed(3) };
      return mat;
    }
    // A scanned model (kind 'model'): its parts' geometry and its scanned
    // materials are built once and shared by every copy a world places. A
    // world takes the whole model, one part (a rock of a set), or an
    // instanced batch of it for scenery repeated along the track.
    function modelKit(A) {
      var J = A.json, buf = A.model, TYPES = { Float32Array: Float32Array, Int8Array: Int8Array, Uint16Array: Uint16Array, Uint32Array: Uint32Array };
      function view(key) { var L = J.layout[key], Ty = TYPES[L.type]; return new Ty(buf, L.offset, L.length); }
      function tex(name, srgb) {
        var bm = name && A.images[name]; if (!bm) return null;
        var t = new THREE.Texture(bm); t.flipY = false; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = ANISO; t.needsUpdate = true; return t;
      }
      var mats = J.materials.map(function (m) {
        var arm = tex(m.armMap, false), c = m.color || [1, 1, 1, 1];
        var mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(c[0], c[1], c[2]), map: tex(m.map, true), normalMap: tex(m.normalMap, false),
          aoMap: arm, roughnessMap: arm, metalnessMap: arm, roughness: m.roughness == null ? 1 : m.roughness, metalness: m.metalness == null ? 1 : m.metalness,
          side: m.doubleSided ? THREE.DoubleSide : THREE.FrontSide });
        if (m.alphaMap) { mat.alphaMap = tex(m.alphaMap, false); mat.alphaTest = m.alpha && m.alpha.test ? m.alpha.test : 0.45; mat.alphaToCoverage = !!(G && G.msaa); }
        else if (m.alpha && m.alpha.blend) { mat.transparent = true; mat.opacity = Math.min(c[3] == null ? 0.4 : c[3], 0.45); mat.depthWrite = false; mat.roughness = 0.05; }
        if (m.emissive && (m.emissive[0] + m.emissive[1] + m.emissive[2]) > 0) { mat.emissive = new THREE.Color(m.emissive[0], m.emissive[1], m.emissive[2]); mat.emissiveIntensity = 3; }
        return mat;
      });
      var PARTS = {}, lo = new THREE.Vector3(Infinity, Infinity, Infinity), hi = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
      Object.keys(J.parts).forEach(function (name) {
        var P = J.parts[name];
        lo.min(new THREE.Vector3().fromArray(P.min)); hi.max(new THREE.Vector3().fromArray(P.max));
        PARTS[name] = P.subs.map(function (sub) {
          var g = new THREE.BufferGeometry();
          g.setAttribute('position', new THREE.BufferAttribute(view(sub.key + ':pos'), 3));
          g.setAttribute('normal', new THREE.BufferAttribute(view(sub.key + ':nor'), 3, true));
          g.setAttribute('uv', new THREE.BufferAttribute(view(sub.key + ':uv'), 2));
          g.setIndex(new THREE.BufferAttribute(view(sub.key + ':idx'), 1));
          g.computeBoundingSphere(); g.computeBoundingBox();
          return { geometry: g, material: mats[sub.material] };
        });
      });
      var names = Object.keys(PARTS), size = hi.clone().sub(lo);
      function pick(list) { return (Array.isArray(list) ? list : list ? [list] : names).filter(function (n) { return PARTS[n]; }); }
      function group(list) {
        var gr = new THREE.Group();
        pick(list).forEach(function (n) { PARTS[n].forEach(function (s) { var m = new THREE.Mesh(s.geometry, s.material); m.castShadow = true; m.receiveShadow = true; gr.add(m); }); });
        return gr;
      }
      return function () {
        return {
          object: group(), parts: names.slice(), size: size.toArray(),
          part: function (n) { return group(n); },
          // count copies placed by fn(i, dummy), one instanced mesh per part and material
          instanced: function (count, fn, list) {
            var gr = new THREE.Group(), D = new THREE.Object3D(), mats4 = [];
            for (var i = 0; i < count; i++) { D.position.set(0, 0, 0); D.rotation.set(0, 0, 0); D.scale.set(1, 1, 1); fn(i, D); D.updateMatrix(); mats4.push(D.matrix.clone()); }
            pick(list).forEach(function (n) { PARTS[n].forEach(function (s) {
              var im = new THREE.InstancedMesh(s.geometry, s.material, count);
              for (var k = 0; k < count; k++) im.setMatrixAt(k, mats4[k]);
              im.instanceMatrix.needsUpdate = true; im.castShadow = true; im.receiveShadow = true; gr.add(im);
            }); });
            return gr;
          },
        };
      };
    }
    // the car kit, built once for the world that asks for a car
    var VK = null;
    function vehicles() { return VK || (VK = GameMogVehicles.kit(THREE, { canvas: canvasTexture, normal: normalTexture, quality: quality, aniso: ANISO, scene: scene, day: isDay })); }
    // is it day? (headlight beams are for the night): a photographed sky with a
    // bright horizon and the sun up, or a painted one with a light horizon
    function isDay() {
      if (skyHdri) { var H = hdriTexture(skyHdri.A); return H.el > 0.03 && H.haze.r * 0.2126 + H.haze.g * 0.7152 + H.haze.b * 0.0722 > 0.12; }
      if (skyParams) { var c = new THREE.Color(skyParams.horizon); return skyParams.sunDir.y > 0.05 && c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722 > 0.2; }
      return false;
    }
    /* ----------------------------------------------------------- skater -- */
    // A library athlete in a speed-skating skinsuit (hood, gloves, glasses)
    // on clap skates, posed every frame through the stroke: a deep sit with
    // the trunk near level, a glide over one skate while the other pushes out
    // sideways until the leg is straight and the clap's heel lifts off the
    // blade, then the recovery that swings it back in under the hip. In the
    // bends the skater leans in hard and the outside skate crosses over the
    // inside one. The hands rest on the back while cruising, both swing when
    // the skater drives, and the outside one swings through the bends. From
    // a standstill the first strides are a run on the blades, toes out. The
    // skates are set on the ice first and the body is posed over them, so a
    // blade never leaves the ice unless its leg is recovering.
    function skaterFactory(A, human) {
      var PI = Math.PI, ik = KIT.ik, basis = KIT.basis, Parts = KIT.Parts, tube = KIT.tube;
      var J = A.json, REST = {};
      J.skeleton.forEach(function (b) { REST[b.name.replace(/\./g, '_')] = { head: new THREE.Vector3().fromArray(b.head), tail: new THREE.Vector3().fromArray(b.tail || b.head) }; });
      function seg(a, b) { return REST[b].head.clone().sub(REST[a].head); }
      var THIGH = seg('upperleg01_L', 'lowerleg01_L').length(), SHIN = seg('lowerleg01_L', 'foot_L').length();
      var UPPER = seg('upperarm01_L', 'lowerarm01_L').length(), FORE = seg('lowerarm01_L', 'wrist_L').length();
      var ANK = REST.foot_L.head.y, HIPY = REST.upperleg01_L.head.y, HEAD = REST.head.head, EYE_Y = HEAD.y + 0.4 * (REST.head.tail.y - HEAD.y);
      var V = function (x, y, z) { return new THREE.Vector3(x, y, z); };
      function sm(u) { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); }
      // the skate, in metres: the blade assembly lifts the boot's sole SOLE off
      // the ice; the blade runs from BL0 behind the ankle to BL1 in front of it,
      // and the boot hinges at the front mount, HZ ahead of the ankle
      var SOLE = 0.078, BL0 = -0.19, BL1 = 0.26, HZ = 0.105;

      function skate(bootHex, trimHex, tubeHex) {
        var g = new THREE.Group(), blade = new Parts(), boot = new Parts(), i;
        // a rockered edge and a rounded nose; 1.1 mm steel, drawn a little thicker
        var sh = new THREE.Shape(), n = 24, z0 = BL0 + 0.012, z1 = BL1 - 0.03;
        sh.moveTo(BL0, 0.012);
        for (i = 0; i <= n; i++) { var z = z0 + (z1 - z0) * i / n, u = (z - 0.035) / 0.23; sh.lineTo(z, 0.0012 * u * u); }
        sh.quadraticCurveTo(BL1 + 0.004, 0.003, BL1, 0.018);
        sh.quadraticCurveTo(BL1 - 0.004, 0.029, BL1 - 0.03, 0.03);
        sh.lineTo(BL0 + 0.012, 0.03);
        sh.quadraticCurveTo(BL0, 0.03, BL0, 0.012);
        var bg = new THREE.ExtrudeGeometry(sh, { depth: 0.0024, bevelEnabled: false, curveSegments: 6 });
        bg.rotateY(-PI / 2); bg.translate(0.0012, 0, 0);
        blade.add(bg, '#DDE1E7');
        blade.add(tube(V(0, 0.037, BL0 + 0.02), V(0, 0.037, BL1 - 0.045), 0.0085, 0.0095, 12), tubeHex);
        // the front mount and its hinge, and the rear bridge the heel lifts off
        blade.add(new THREE.BoxGeometry(0.03, SOLE - 0.04, 0.045).translate(0, (SOLE + 0.04) / 2 - 0.002, HZ), tubeHex);
        blade.add(new THREE.CylinderGeometry(0.0055, 0.0055, 0.05, 10).rotateZ(PI / 2).translate(0, SOLE - 0.004, HZ + 0.012), '#A6ACB4');
        blade.add(new THREE.BoxGeometry(0.028, SOLE - 0.046, 0.035).translate(0, (SOLE + 0.036) / 2 - 0.004, -0.075), tubeHex);
        var bm = blade.mesh(new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.95, roughness: 0.2 }));
        g.add(bm);
        // the boot: low, moulded carbon, hinged at the front mount
        var bp = new THREE.Group(); bp.position.set(0, SOLE, HZ); g.add(bp);
        function B(geo, hex) { geo.translate(0, -SOLE, -HZ); boot.add(geo, hex); }
        B(new THREE.BoxGeometry(0.078, 0.009, 0.262).translate(0, SOLE + 0.0045, 0.035), '#141518');
        var shell = new THREE.SphereGeometry(1, 28, 14, 0, PI * 2, 0, PI * 0.52); shell.scale(0.046, 0.072, 0.135); shell.translate(0, SOLE + 0.006, 0.042); B(shell, bootHex);
        var cuff = new THREE.CylinderGeometry(0.047, 0.05, 0.13, 24, 1, true); cuff.translate(0, SOLE + 0.07, -0.012); B(cuff, bootHex);
        B(new THREE.TorusGeometry(0.047, 0.007, 8, 24).rotateX(PI / 2).translate(0, SOLE + 0.134, -0.012), '#18191C');
        B(new THREE.BoxGeometry(0.095, 0.014, 0.05).translate(0, SOLE + 0.075, 0.06), trimHex);
        B(new THREE.BoxGeometry(0.098, 0.03, 0.02).translate(0, SOLE + 0.03, -0.075), trimHex);
        var bootMesh = boot.mesh(new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.4, clearcoat: 1, clearcoatRoughness: 0.07, side: THREE.DoubleSide }));
        bp.add(bootMesh);
        return { group: g, boot: bp };
      }

      // wraparound glasses: a mirrored, iridescent lens and a thin frame
      function glasses(lensHex, frameHex) {
        var g = new THREE.Group(), r = 0.105;
        var lens = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.97, 0.042, 40, 1, true, -1.3, 2.6),
          new THREE.MeshPhysicalMaterial({ color: lensHex, metalness: 1, roughness: 0.05, iridescence: 1, iridescenceIOR: 1.8, iridescenceThicknessRange: [180, 620], side: THREE.DoubleSide }));
        g.add(lens);
        var fp = new Parts();
        fp.add(new THREE.TorusGeometry(r + 0.002, 0.0035, 6, 40, 2.6).rotateX(PI / 2).rotateY(1.3 - PI / 2).translate(0, 0.021, 0), frameHex);
        [-1, 1].forEach(function (sd) { fp.add(new THREE.BoxGeometry(0.005, 0.009, 0.1).translate(sd * r * Math.sin(1.3), 0.016, r * Math.cos(1.3) - 0.05), frameHex); });
        g.add(fp.mesh(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45 })));
        g.traverse(function (m) { if (m.isMesh) m.castShadow = false; });
        return g;
      }

      // one leg's stroke at phase p (0 to 1): where its skate sits on the ice
      // (x across, z along, y lifted), turned out (yaw), on edge (edge, the
      // inside edge positive), the clap's heel lift and the nose's pitch
      function straight(p, side, W, o) {
        var G = 0.3, E = 0.62, u, e;
        if (p < G) { u = p / G; o.x = side * (0.07 + 0.05 * u); o.z = 0.12 - 0.08 * u; o.y = 0; o.yaw = side * 0.05; o.edge = 0.06; o.clap = 0; o.pitch = 0; }
        else if (p < E) { u = (p - G) / (E - G); e = sm(u); o.x = side * (0.12 + (W - 0.12) * e); o.z = 0.04 - 0.14 * e; o.y = 0; o.yaw = side * (0.05 + 0.12 * e); o.edge = 0.06 + 0.52 * e; o.clap = 0.55 * sm((u - 0.7) / 0.3); o.pitch = 0; }
        else {
          u = (p - E) / (1 - E);
          o.x = side * (W + (0.07 - W) * sm((u - 0.1) / 0.8));
          o.z = -0.1 - 0.22 * Math.sin(PI * Math.min(1, u * 1.2)) + 0.22 * sm((u - 0.5) / 0.5);
          o.y = 0.14 * Math.sin(PI * u); o.yaw = side * (0.17 - 0.12 * sm(u / 0.5)); o.edge = 0.58 * (1 - sm(u / 0.35)) + 0.06 * sm(u / 0.35);
          o.clap = 0.55 * (1 - sm(u / 0.18)); o.pitch = -0.25 * Math.sin(PI * u);
        }
      }
      // a left-hand bend (mirrored for a right-hand one): the inside leg
      // pushes out under the body, the outside one pushes wide and recovers
      // across in front of the inside skate
      function bend(p, side, W, o) {
        var G = 0.28, E = 0.6, u, e;
        if (side > 0) {
          if (p < G) { u = p / G; o.x = 0.13 - 0.04 * u; o.z = 0.1 - 0.06 * u; o.y = 0; o.yaw = 0.1; o.edge = -0.12; o.clap = 0; o.pitch = 0; }
          else if (p < E) { u = (p - G) / (E - G); e = sm(u); o.x = 0.09 - 0.36 * W / 0.5 * e; o.z = 0.04 - 0.1 * e; o.y = 0; o.yaw = 0.1 - 0.14 * e; o.edge = -0.12 - 0.26 * e; o.clap = 0.45 * sm((u - 0.7) / 0.3); o.pitch = 0; }
          else {
            u = (p - E) / (1 - E); e = sm(u); var x0 = 0.09 - 0.36 * W / 0.5;
            o.x = x0 + (0.13 - x0) * e; o.z = -0.06 - 0.1 * Math.sin(PI * u) + 0.16 * sm((u - 0.5) / 0.5); o.y = 0.1 * Math.sin(PI * u);
            o.yaw = -0.04 + 0.14 * e; o.edge = -0.38 + 0.26 * sm(u / 0.5); o.clap = 0.45 * (1 - sm(u / 0.2)); o.pitch = -0.2 * Math.sin(PI * u);
          }
        } else {
          if (p < G) { u = p / G; o.x = 0.02 - 0.06 * u; o.z = 0.17 - 0.1 * u; o.y = 0; o.yaw = 0.14; o.edge = 0.08; o.clap = 0; o.pitch = 0; }
          else if (p < E) { u = (p - G) / (E - G); e = sm(u); o.x = -0.04 - (W - 0.04) * e; o.z = 0.07 - 0.15 * e; o.y = 0; o.yaw = 0.14 - 0.18 * e; o.edge = 0.08 + 0.46 * e; o.clap = 0.5 * sm((u - 0.7) / 0.3); o.pitch = 0; }
          else {
            u = (p - E) / (1 - E); e = sm(u);
            o.x = -W + (W + 0.02) * sm((u - 0.15) / 0.85); o.z = -0.08 - 0.12 * Math.sin(PI * u) + 0.25 * sm((u - 0.4) / 0.6);
            o.y = 0.15 * Math.sin(PI * u) + 0.03 * Math.sin(PI * sm((u - 0.3) / 0.7));
            o.yaw = -0.04 + 0.18 * e; o.edge = 0.54 * (1 - sm(u / 0.4)) + 0.08 * sm(u / 0.4); o.clap = 0.5 * (1 - sm(u / 0.2)); o.pitch = -0.22 * Math.sin(PI * u);
          }
        }
      }
      // the first strides from a standstill: a run on the blades, toes out
      function run(p, side, o) {
        var G = 0.46, u;
        if (p < G) { u = p / G; o.x = side * 0.17; o.z = 0.16 - 0.4 * u; o.y = 0; o.yaw = side * 0.72; o.edge = 0.3; o.clap = 0.4 * sm((u - 0.65) / 0.35); o.pitch = 0; }
        else { u = (p - G) / (1 - G); o.x = side * (0.17 + 0.05 * Math.sin(PI * u)); o.z = -0.24 + 0.4 * sm(u); o.y = 0.17 * Math.sin(PI * u); o.yaw = side * (0.72 - 0.1 * Math.sin(PI * u)); o.edge = 0.3 * (1 - Math.sin(PI * u)); o.clap = 0.4 * (1 - sm(u / 0.25)); o.pitch = -0.15 * Math.sin(PI * u); }
      }
      function still(side, o) { o.x = side * 0.14; o.z = side > 0 ? 0.05 : -0.03; o.y = 0; o.yaw = side * 0.1; o.edge = 0; o.clap = 0; o.pitch = 0; }
      var KEYS = ['x', 'y', 'z', 'yaw', 'edge', 'clap', 'pitch'];
      function mix(out, parts) {
        for (var k = 0; k < KEYS.length; k++) { var key = KEYS[k], v = 0, w = 0; for (var i = 0; i < parts.length; i++) { v += parts[i][0][key] * parts[i][1]; w += parts[i][1]; } out[key] = w > 0 ? v / w : 0; }
        return out;
      }

      return function (o) {
        o = o || {};
        var of = o.outfit || {}, so = o.suit || {};
        var suit = {
          color: isHex(so.color) ? so.color : isHex(of.top) ? of.top : '#1D3F9E', trim: isHex(so.trim) ? so.trim : isHex(of.trim) ? of.trim : '#F4F4F4',
          accent: isHex(so.accent) ? so.accent : isHex(of.trim) ? of.trim : '#E4002B', pattern: so.pattern || (of.pattern === 'plain' ? 'plain' : 'panels'),
          gloves: so.gloves, code: so.code != null ? so.code : '', number: so.number != null ? so.number : of.bib && of.bib.number, textColor: so.textColor, hood: so.hood,
        };
        var H = human(Object.assign({}, o, { suit: suit, hair: 'none' })), hroot = H.object, s = hroot.scale.x;
        var bones = {}; hroot.traverse(function (b) { if (b.isBone) bones[b.name] = b; });
        // a skater's bounds hold every pose, so off-screen skaters are skipped
        hroot.traverse(function (m) { if (m.isSkinnedMesh) { m.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.8, 0), 1.7); m.frustumCulled = true; } });
        var legK = (THIGH + SHIN) * s / 0.925, reach = (THIGH + SHIN) * s * 0.985;
        var root = new THREE.Group(), lean = new THREE.Group();
        root.add(lean); lean.add(hroot);
        var ko = o.skates || {};
        var bootHex = isHex(ko.boot) ? ko.boot : '#F3F3F1', kTrim = isHex(ko.trim) ? ko.trim : suit.color, tubeHex = isHex(ko.tube) ? ko.tube : '#1B1C20';
        var legs = [{ s: 'L', side: 1 }, { s: 'R', side: -1 }];
        legs.forEach(function (L) { L.k = skate(bootHex, kTrim, tubeHex); root.add(L.k.group); L.o = {}; L.a = {}; L.b = {}; L.c = {}; L.d = {}; });
        if (bones.head && o.glasses !== false) {
          var go = o.glasses || {}, gl = glasses(isHex(go.lens) ? go.lens : '#C9A45A', isHex(go.frame) ? go.frame : '#141416');
          // the lens a finger's width in front of the eyes. The body's shape
          // (muscle, build, face) moves the face off its bones, so the eyes
          // are found on this skater's own mesh, still in its rest pose
          var eye = V(0, EYE_Y, HEAD.z + 0.09), em = null, ei = J.groups.map(function (g) { return g.name; }).indexOf('eyes');
          hroot.traverse(function (m) { if (m.isSkinnedMesh) em = m; });
          if (em && ei >= 0) {
            var eg = em.geometry.groups[ei], ix = em.geometry.index, n = 0, ev = V(0, 0, 0), zMax = -9;
            eye.set(0, 0, 0);
            for (var q = eg.start; q < eg.start + eg.count; q += 7) { em.getVertexPosition(ix.getX(q), ev); eye.add(ev); zMax = Math.max(zMax, ev.z); n++; }
            eye.divideScalar(Math.max(1, n)); eye.z = zMax;
          }
          gl.position.set(0, eye.y - HEAD.y + 0.004, eye.z - HEAD.z + 0.016 - 0.105);
          bones.head.add(gl);
        }

        // ice spray: a few flakes kicked up at the end of each push
        var SP = 40, spPos = new Float32Array(SP * 3), spVel = new Float32Array(SP * 3), spAge = new Float32Array(SP).fill(9), spA = new Float32Array(SP), spI = 0;
        var spGeo = new THREE.BufferGeometry();
        spGeo.setAttribute('position', new THREE.BufferAttribute(spPos, 3)); spGeo.setAttribute('alpha', new THREE.BufferAttribute(spA, 1));
        var spray = new THREE.Points(spGeo, new THREE.ShaderMaterial({
          transparent: true, depthWrite: false,
          vertexShader: 'attribute float alpha; varying float vA; void main() { vA = alpha; vec4 mv = modelViewMatrix * vec4( position, 1.0 ); gl_PointSize = 34.0 * ( 0.5 + alpha * 0.5 ) / max( 0.5, -mv.z ); gl_Position = projectionMatrix * mv; }',
          fragmentShader: 'varying float vA; void main() { vec2 q = gl_PointCoord - 0.5; float d = dot( q, q ); if ( d > 0.25 || vA < 0.01 ) discard; gl_FragColor = vec4( vec3( 1.25, 1.3, 1.4 ), vA * ( 1.0 - d * 4.0 ) * 0.85 ); }',
        }));
        spray.frustumCulled = false; root.add(spray);
        function kick(x, z, side, v) {
          var i = spI++ % SP;
          spPos[i * 3] = x; spPos[i * 3 + 1] = 0.02; spPos[i * 3 + 2] = z;
          spVel[i * 3] = side * (0.8 + Math.random() * 1.6); spVel[i * 3 + 1] = 0.4 + Math.random() * 0.9; spVel[i * 3 + 2] = -Math.random() * 1.5 + v * 0.1;
          spAge[i] = 0;
        }

        var SPINE = ['spine05', 'spine04', 'spine03', 'spine02', 'spine01'], SW = [0.12, 0.2, 0.24, 0.24, 0.2];
        var NECK = ['neck01', 'neck02', 'neck03', 'head'];
        var E1 = new THREE.Euler(), st = { ph: Math.random(), v0: 0, acc: 0, yaw: null, yr: 0, roll: 0, fall: 0, fallSide: 1, run: 0, bend: 0, dir: 1, drive: 0, idle: 1, prev: [0, 0] };
        var _m0 = new THREE.Matrix4(), _m1 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), QR = new THREE.Quaternion(), QP = new THREE.Quaternion(), QB = new THREE.Quaternion();
        var tA = new THREE.Vector3(), tB = new THREE.Vector3(), tC = new THREE.Vector3(), tD = new THREE.Vector3(), knee = new THREE.Vector3(), elbow = new THREE.Vector3(), pole = new THREE.Vector3();
        // turn bone b so its rest direction (model space) points along dirW, twisted so restUp follows upW
        var aA = new THREE.Vector3(), aB = new THREE.Vector3(), aC = new THREE.Vector3(), aU = new THREE.Vector3();
        function aim(b, restDir, restUp, dirW, upW) {
          aC.copy(dirW).normalize(); aU.copy(upW);
          hroot.getWorldQuaternion(QR);
          basis(aA.copy(restDir).normalize().applyQuaternion(QR), aB.copy(restUp).applyQuaternion(QR), _m0);
          basis(aC, aU, _m1);
          _q.setFromRotationMatrix(_m1).multiply(_q2.setFromRotationMatrix(_m0).invert()).multiply(QR);
          b.parent.getWorldQuaternion(QP);
          b.quaternion.copy(QP.invert().multiply(_q));
          b.updateMatrixWorld(true);
        }
        function dirL(x, y, z) { return V(x, y, z).transformDirection(lean.matrixWorld); }
        var FWD = V(0, 0, 1), BACK = V(0, 0, -1), UPV = V(0, 1, 0);
        var segs = {
          L: { th: seg('upperleg01_L', 'lowerleg01_L'), sh: seg('lowerleg01_L', 'foot_L'), ft: REST.foot_L.tail.clone().sub(REST.foot_L.head), ua: seg('upperarm01_L', 'lowerarm01_L'), fa: seg('lowerarm01_L', 'wrist_L') },
          R: { th: seg('upperleg01_R', 'lowerleg01_R'), sh: seg('lowerleg01_R', 'foot_R'), ft: REST.foot_R.tail.clone().sub(REST.foot_R.head), ua: seg('upperarm01_R', 'lowerarm01_R'), fa: seg('lowerarm01_R', 'wrist_R') },
        };

        // the trunk: pitched forward from the hips, back rounded, head up to the track ahead
        function poseTorso(tilt, spine, hip, roll, turn) {
          var rb = bones.root;
          rb.quaternion.setFromEuler(E1.set(tilt, turn * 0.2, roll, 'YXZ'));
          rb.position.set(0, 0, 0); hroot.updateMatrixWorld(true);
          var hipNow = tD.copy(bones.upperleg01_L.getWorldPosition(tA)).add(bones.upperleg01_R.getWorldPosition(tB)).multiplyScalar(0.5);
          lean.worldToLocal(hipNow);
          rb.position.copy(tC.copy(hip).sub(hipNow).divideScalar(s));
          for (var i = 0; i < SPINE.length; i++) if (bones[SPINE[i]]) bones[SPINE[i]].quaternion.setFromEuler(E1.set(spine * SW[i], turn * 0.12, -roll * 0.5 * SW[i], 'YXZ'));
          var total = tilt + spine, look = 0.25 - total;
          for (i = 0; i < NECK.length; i++) if (bones[NECK[i]]) bones[NECK[i]].quaternion.setFromEuler(E1.set(look / NECK.length, turn * 0.25 / NECK.length, 0, 'YXZ'));
          hroot.updateMatrixWorld(true);
        }
        // a skate on the ice at stroke o, rolled with the body; the ankle it holds, in world space
        function placeSkate(L, oo, roll) {
          var k = L.k;
          k.group.position.set(oo.x * legK, oo.y, oo.z * legK);
          // on edge, but never flatter to the ice than a skater's boot allows
          k.group.rotation.set(oo.pitch, oo.yaw, clamp(roll + L.side * oo.edge, -0.98, 0.98), 'YXZ');
          k.boot.rotation.x = oo.clap;
          k.group.updateMatrixWorld(true);
          return k.boot.localToWorld(L.ank.set(0, ANK * s, -HZ));
        }
        legs.forEach(function (L) { L.ank = new THREE.Vector3(); L.hip = new THREE.Vector3(); });

        function pose(ph, W, cr, tilt, spine, roll, turn) {
          var i, L;
          // the body: its hips swing over whichever skate is gliding
          var straightW = (1 - st.run) * (1 - st.bend) * (1 - st.idle), sway = Math.cos(2 * PI * ph) * straightW;
          var hip = V(0.1 * legK * sway + (st.bend * -0.05 * st.dir), SOLE + ANK * s + (HIPY - ANK) * s * cr + 0.012 * Math.sin(4 * PI * ph) * (1 - st.idle), -0.06 * legK);
          lean.rotation.set(0, 0, roll - 0.06 * sway);
          lean.updateMatrixWorld(true);
          poseTorso(tilt, spine, hip, -0.05 * sway, turn);
          for (i = 0; i < 2; i++) {
            L = legs[i];
            var p = (ph + (i ? 0.5 : 0)) % 1, sd = L.side;
            straight(p, sd, W, L.a);
            if (st.dir > 0) bend(p, sd, W, L.b); else { bend(p, -sd, W, L.b); L.b.x = -L.b.x; L.b.yaw = -L.b.yaw; }
            run(p, sd, L.c); still(sd, L.d);
            mix(L.o, [[L.a, straightW + 1e-4], [L.b, (1 - st.run) * st.bend * (1 - st.idle)], [L.c, st.run * (1 - st.idle)], [L.d, st.idle]]);
            // on the ice, and within the leg's reach of the hip
            var ank = placeSkate(L, L.o, roll);
            bones['upperleg01_' + L.s].getWorldPosition(L.hip);
            for (var it = 0; it < 3 && ank.distanceTo(L.hip) > reach; it++) {
              var hl = root.worldToLocal(tA.copy(L.hip)), f = Math.max(0.2, 1 - (ank.distanceTo(L.hip) - reach) / Math.max(0.05, Math.hypot(L.o.x * legK - hl.x, L.o.z * legK - hl.z)));
              L.o.x = (hl.x + (L.o.x * legK - hl.x) * f) / legK; L.o.z = (hl.z + (L.o.z * legK - hl.z) * f) / legK;
              ank = placeSkate(L, L.o, roll);
            }
            // the leg by IK, knee ahead over the toes; the foot follows its boot
            pole.copy(dirL(sd * 0.25, 0.05, 1));
            ik(L.hip, ank, THIGH * s, SHIN * s, pole, knee);
            var sg = segs[L.s];
            aim(bones['upperleg01_' + L.s], sg.th, FWD, tA.copy(knee).sub(L.hip), pole);
            var kneeW = bones['lowerleg01_' + L.s].getWorldPosition(tD);
            aim(bones['lowerleg01_' + L.s], sg.sh, FWD, tB.copy(ank).sub(kneeW), pole);
            L.k.boot.getWorldQuaternion(QB);
            aim(bones['foot_' + L.s], sg.ft, UPV, tA.copy(sg.ft).normalize().applyQuaternion(QB), tB.set(0, 1, 0).applyQuaternion(QB));
          }
          // the arms: on the back, swinging, or resting on the thighs
          var pel = bones.spine05.getWorldPosition(V(0, 0, 0)), mid = bones.spine03.getWorldPosition(V(0, 0, 0)), top = bones.spine01.getWorldPosition(V(0, 0, 0));
          var trunk = top.clone().sub(pel).normalize(), X = dirL(1, 0, 0), backN = trunk.clone().cross(X).normalize();
          var lumbar = pel.clone().lerp(mid, 0.45).addScaledVector(backN, 0.11 * s);
          var driveW = Math.max(st.run, st.drive);
          for (i = 0; i < 2; i++) {
            var A = legs[i], sd2 = A.side, sg2 = segs[A.s];
            var shW = bones['upperarm01_' + A.s].getWorldPosition(V(0, 0, 0)), shL = lean.worldToLocal(shW.clone());
            // swinging across: forward to under the chest, back and up behind
            var a = (1 - Math.cos(2 * PI * (ph - (sd2 > 0 ? 0.45 : 0.95)))) / 2;
            var P0 = V(-sd2 * 0.2, -0.46, 0.24), P1 = V(sd2 * 0.34, -0.6, -0.12), P2 = V(sd2 * 0.2, 0.02, -0.5);
            var sw = P0.clone().multiplyScalar((1 - a) * (1 - a)).addScaledVector(P1, 2 * a * (1 - a)).addScaledVector(P2, a * a).multiplyScalar(legK).add(shL);
            var swingW = clamp(Math.max(driveW, st.bend * (sd2 === -st.dir ? 1 : 0)) * (1 - st.idle), 0, 1);
            var swingT = lean.localToWorld(sw);
            var backT = lumbar.clone().addScaledVector(X, sd2 * 0.035 * s).addScaledVector(trunk, sd2 * 0.03 * s).addScaledVector(backN, sd2 > 0 ? 0.025 * s : 0);
            var kneeA = bones['lowerleg01_' + A.s].getWorldPosition(V(0, 0, 0)), hipA = bones['upperleg01_' + A.s].getWorldPosition(V(0, 0, 0));
            var thighT = hipA.lerp(kneeA, 0.82).addScaledVector(dirL(0, 1, 0), 0.07 * s).addScaledVector(X, sd2 * 0.02 * s);
            var wrist = backT.multiplyScalar((1 - swingW) * (1 - st.idle)).addScaledVector(swingT, swingW * (1 - st.idle)).addScaledVector(thighT, st.idle);
            var ep = dirL(sd2 * 0.9, 0.35, -0.4).multiplyScalar((1 - swingW) * (1 - st.idle)).add(dirL(sd2 * 0.45, -0.1, -0.9).multiplyScalar(swingW)).add(dirL(sd2, 0, -0.2).multiplyScalar(st.idle)).normalize();
            ik(shW, wrist, UPPER * s, FORE * s, ep, elbow);
            aim(bones['upperarm01_' + A.s], sg2.ua, BACK, tA.copy(elbow).sub(shW), ep);
            var elW = bones['lowerarm01_' + A.s].getWorldPosition(tD);
            aim(bones['lowerarm01_' + A.s], sg2.fa, BACK, tB.copy(wrist).sub(elW), ep);
          }
        }

        function animate(t, dt, S) {
          if (S.paused || !(dt > 0)) return;
          var v = S.speed || 0;
          st.acc = damp(st.acc, (v - st.v0) / dt, 4, dt); st.v0 = v;
          // a bend is the yaw rate at speed: tan(lean) = v * yaw rate / g
          var car = root.parent, bankNow = 0;
          if (car) {
            tA.set(0, 0, 1).applyQuaternion(car.getWorldQuaternion(_q));
            var yaw = Math.atan2(tA.x, tA.z) + (S.lateral || 0) * 0.047;
            if (st.yaw !== null) { var dy = yaw - st.yaw; if (dy > PI) dy -= 2 * PI; if (dy < -PI) dy += 2 * PI; st.yr = damp(st.yr, clamp(dy / dt, -1.5, 1.5), 4, dt); }
            st.yaw = yaw;
            tB.set(1, 0, 0).applyQuaternion(_q); bankNow = Math.asin(clamp(-tB.y, -1, 1));
          }
          var g = v * st.yr / 9.81;
          st.bend = damp(st.bend, S.crashed ? st.bend : sm((Math.abs(g) - 0.1) / 0.25), 5, dt);
          if (Math.abs(g) > 0.08) st.dir = g > 0 ? 1 : -1;
          st.run = damp(st.run, v > 0.3 && st.v0 < 9 ? 1 - sm((v - 4) / 5) : 0, 6, dt);
          st.idle = damp(st.idle, v < 0.3 && !S.crashed ? 1 : 0, 5, dt);
          st.drive = damp(st.drive, S.crashed ? 0 : sm((st.acc - 0.6) / 2.4), 3, dt);
          // cadence: long glides at speed, quick strides off the line
          var f = (1 - st.run) * clamp(0.42 + v * 0.026, 0.5, 1.05) + st.run * 1.7;
          if (!S.crashed) st.ph = (st.ph + f * dt * (1 - st.idle * 0.9)) % 1;
          // lean in like a skater: as far as the speed asks, less the bank, softened
          var phys = clamp(Math.atan(g), -0.95, 0.95);
          st.roll = damp(st.roll, S.crashed ? st.roll : clamp(-(phys - bankNow) * 0.8 + clamp(S.lateral || 0, -10, 10) * 0.012, -0.82, 0.82), 6, dt);
          if (S.crashed) st.fall = Math.min(1, st.fall + dt * 3); else st.fall = Math.max(0, st.fall - dt * 2);
          if (st.fall === 0) st.fallSide = st.roll >= 0 ? 1 : -1;
          var W = (0.5 + 0.06 * st.bend) * (0.8 + 0.2 * sm((v - 6) / 10));
          var cr = 0.745 - 0.025 * st.bend + 0.09 * st.run + 0.12 * st.idle;
          var tilt = 0.95 + 0.05 * st.bend - 0.3 * st.run - 0.35 * st.idle, spine = 0.3 - 0.1 * st.idle;
          pose(st.ph, W, cr, tilt, spine, st.roll, st.bend * st.dir);
          // a fall: down on the hip, sliding
          root.rotation.set(0, 0, st.fallSide * st.fall * 1.25);
          root.position.y = -st.fall * 0.05;
          // ice spray off the blade that is finishing its push
          if (v > 6 && !S.crashed) for (var i = 0; i < 2; i++) {
            var p = (st.ph + (i ? 0.5 : 0)) % 1, L = legs[i];
            if (p > 0.52 && p < 0.62 && Math.random() < dt * 60 * 0.45) kick(L.k.group.position.x, L.k.group.position.z - 0.12, L.side, v);
          }
          for (var j = 0; j < SP; j++) {
            if (spAge[j] > 1) { spA[j] = 0; continue; }
            spAge[j] += dt;
            spVel[j * 3 + 1] -= 9.8 * dt;
            spPos[j * 3] += spVel[j * 3] * dt; spPos[j * 3 + 1] = Math.max(0.01, spPos[j * 3 + 1] + spVel[j * 3 + 1] * dt); spPos[j * 3 + 2] += (spVel[j * 3 + 2] - v) * dt;
            spA[j] = Math.max(0, 1 - spAge[j] / 0.7);
          }
          spGeo.attributes.position.needsUpdate = true; spGeo.attributes.alpha.needsUpdate = true;
        }
        root.updateMatrixWorld(true);
        pose(st.ph, 0.5, 0.86, 0.6, 0.2, 0, 0);
        return { object: root, animate: animate, name: o.name, color: o.color };
      };
    }
    ctx.assets = {
      ready: function (id) { return !!ASSETS[id]; },
      info: function (id) {
        var a = ASSETS[id]; if (!a) return null; var j = a.json;
        return j.kind === 'human' ? { kind: 'human', height: j.height, skins: Object.keys(j.textures.skins), hair: Object.keys(j.textures.hair), eyes: Object.keys(j.textures.eyes), morphs: Object.keys(j.morphs), clips: j.clips.list.map(function (c) { return c.name; }) }
          : j.kind === 'model' ? { kind: 'model', parts: Object.keys(j.parts), triangles: j.triangles.kept }
          : j.kind === 'hdri' ? Object.assign({ kind: 'hdri', sunElevation: +(hdriTexture(a).el * 180 / Math.PI).toFixed(1) }, typeof j.view === 'number' ? { faces: true } : {})
          : { kind: j.kind };
      },
      human: function (id, o) {
        // the world's own player carries a sword: "you" carry the same one
        if (capturingPlayer && o && o.weapon) playerArms = { weapon: o.weapon, stance: o.stance };
        var a = ASSETS[id]; if (!a || a.json.kind !== 'human') return null;
        return (factories[id] || (factories[id] = humanFactory(a)))(o || {});
      },
      // the same athlete on a racing bicycle: { object, animate, name, color, radius }
      cyclist: function (id, o) {
        // the world's own player rides: remember the bike, so "you" ride it too
        if (capturingPlayer) playerRide = { bike: (o || {}).bike, helmet: (o || {}).helmet };
        var a = ASSETS[id]; if (!a || a.json.kind !== 'human') return null;
        var h = factories[id] || (factories[id] = humanFactory(a));
        return (factories[id + ':cyclist'] || (factories[id + ':cyclist'] = cyclistFactory(a, h)))(o || {});
      },
      // a scanned surface from the library: { map, normalMap, roughnessMap, size } (size: metres a tile covers)
      texture: function (id) {
        var a = ASSETS[id]; if (!a || a.json.kind !== 'texture') return null;
        var out = { size: a.json.size || 1 };
        [['color', 'map', true], ['normal', 'normalMap', false], ['roughness', 'roughnessMap', false]].forEach(function (m) {
          var f = a.json.maps[m[0]], bm = f && a.images[f]; if (!bm) return;
          var t = new THREE.Texture(bm); t.flipY = false; t.colorSpace = m[2] ? THREE.SRGBColorSpace : THREE.NoColorSpace;
          t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = ANISO; t.needsUpdate = true; out[m[1]] = t;
        });
        return out;
      },
      // the same surface as a material laid on by world position at true scale:
      // { color, roughness, normal, size, project: 'ground' | 'box', variety, mottle, clearcoat }
      surface: function (id, o) {
        var a = ASSETS[id]; if (!a || a.json.kind !== 'texture') return null;
        return surfaceMaterial(a, o);
      },
      // a scanned model from the library: { object, parts, size, part(name), instanced(count, fn, parts) }
      model: function (id) {
        var a = ASSETS[id]; if (!a || a.json.kind !== 'model') return null;
        return (factories[id] || (factories[id] = modelKit(a)))();
      },
      // anything that is not a person (lib/runtime/creature.js): { object, animate, height, radius, timing }
      creature: function (o) {
        if (typeof GameMogCreatures === 'undefined') return null;
        var c = GameMogCreatures.make(THREE, o || {});
        c.name = o && typeof o.name === 'string' ? o.name : ''; c.color = o && o.skin && o.skin.color || (o && o.color) || '#5DBB46';
        return c;
      },
      // a racing car (lib/runtime/vehicle.js): { object, animate, name, color, vehicle }
      car: function (o) {
        // the world's own player drives: remember the car, so "you" drive it too
        if (capturingPlayer) playerCar = Object.assign({}, o || {});
        if (typeof GameMogVehicles === 'undefined') return null;
        var made = vehicles().car(o || {});
        // one of the library's people at the wheel: driver: { human: 'human-athlete-male', outfit, hair, ... }
        var dh = o && o.driver && o.driver.human;
        if (made && dh) {
          var ha = ASSETS[dh];
          if (!ha || ha.json.kind !== 'human') warn('ctx.assets.car: the driver "' + dh + '" is not loaded; list it in assets. The car keeps its own driver.');
          else {
            var hf = factories[dh] || (factories[dh] = humanFactory(ha));
            var sf = factories[dh + ':seated'] || (factories[dh + ':seated'] = seatedFactory(ha, hf));
            var person = sf(Object.assign({}, o.driver, { name: undefined }), made.cockpit);
            made.driver = person;
          }
        }
        return made;
      },
      // the same athlete in a skinsuit on clap skates: { object, animate, name, color }
      skater: function (id, o) {
        // the world's own player skates: remember the kit, so "you" skate too
        if (capturingPlayer) playerSkate = { skates: (o || {}).skates, glasses: (o || {}).glasses, suit: (o || {}).suit };
        var a = ASSETS[id]; if (!a || a.json.kind !== 'human') return null;
        var h = factories[id] || (factories[id] = humanFactory(a));
        return (factories[id + ':skater'] || (factories[id + ':skater'] = skaterFactory(a, h)))(o || {});
      },
    };

    /* -------------------------------------------------------- the world -- */
    function call(name) {
      var fn = def[name];
      if (typeof fn !== 'function') return undefined;
      return fn.apply(def, [ctx].concat([].slice.call(arguments, 1)));
    }
    // An open world's colliders are registered while it builds (the API says
    // so), but the open world starts after build() returns (1 Oct: they were
    // lost, and generated worlds learned to skip them). Taken now, measured now
    // (an object where it stands), and handed to its collision as it starts,
    // before anyone moves. ctx.open exists from the start too.
    var EARLY_SOLIDS = [];
    if (OPEN) {
      ctx.open = { map: null, heat: 1 };
      ctx.solid = function (s) {
        if (!s) return;
        if (s.isObject3D) { s.updateWorldMatrix(true, true); var sb = new THREE.Box3().setFromObject(s); if (!sb.isEmpty()) EARLY_SOLIDS.push({ min: sb.min.clone(), max: sb.max.clone() }); return; }
        EARLY_SOLIDS.push(s);
      };
    }
    call('build');

    var lights = 0, loud = null; scene.traverse(function (o) {
      if (!o.isLight) return; lights++;
      // the runtime's lights are three.js's legacy units (1 Oct): a lamp of 1 to 4 is strong and,
      // without a distance, never fades; physical values (hundreds) flood the picture white.
      // Told to the builder, never changed: a published world looks as it did
      var lim = o.isPointLight || o.isSpotLight || o.isDirectionalLight ? 12 : 6;
      if (o.intensity > lim && (!loud || o.intensity / lim > loud.intensity / loud.lim)) loud = { type: o.type, intensity: o.intensity, lim: lim };
    });
    if (loud) warn('A ' + loud.type + ' has intensity ' + Math.round(loud.intensity) + '. The runtime uses legacy light units: a sun of 2 to 4, a sky light of 0.4 to 1.5, a lamp of 0.5 to 4 with a distance (it fades to nothing there; without one it never fades). Values over ' + loud.lim + ' wash the picture out white.');
    // an open world on a library map is lit by the map's own sun and sky
    if (!lights && !(OPEN && typeof OPEN.map === 'string')) {
      warn('build() added no lights, so default ones were used. Add a HemisphereLight and a DirectionalLight in the world\'s own colours.');
      scene.add(new THREE.HemisphereLight('#ffffff', '#445533', 1.0));
      var sun = new THREE.DirectionalLight('#fff4dd', 1.6); sun.position.set(60, 120, 40); scene.add(sun);
    }

    function asEntity(r, label, defaultRadius) {
      if (!r || !r.object || !r.object.isObject3D) throw new Error(label + ' must return { object: <THREE.Object3D>, ... }.');
      if (r.vehicle && r.vehicle.length > 0 && r.vehicle.width > 0) {
        // a car: as wide as it is across the track, as long as it is along it
        var vc = new THREE.Group(); vc.add(r.object);
        return { object: vc, model: r.object, radius: r.vehicle.width / 2 * 0.92, half: r.vehicle.length / 2 * 0.9, height: r.vehicle.height || 1.2, animate: typeof r.animate === 'function' ? r.animate : null, name: r.name, color: r.color, falls: true, upright: false, vehicle: r.vehicle };
      }
      var box = new THREE.Box3().setFromObject(r.object), size = box.getSize(new THREE.Vector3());
      var measured = size.x > 0 ? Math.max(size.x, size.z) / 2 * 0.82 : defaultRadius;
      var declared = Number(r.radius);
      var radius = declared > 0 ? clamp(declared, measured * 0.7, measured * 1.1) : measured;
      if (declared > 0 && Math.abs(radius - declared) > 0.05) warn(label + ' declared radius ' + declared.toFixed(2) + ' but its model is about ' + measured.toFixed(2) + ' across; the hitbox follows the model (' + radius.toFixed(2) + ').');
      // the runtime moves a carrier; the world's own object inside it is the
      // world's to animate (hops, leans, tumbles) without fighting the runtime
      var carrier = new THREE.Group(); carrier.add(r.object);
      return { object: carrier, model: r.object, radius: radius, half: radius, height: size.y, animate: typeof r.animate === 'function' ? r.animate : null, name: r.name, color: r.color, falls: !!r.falls, upright: !!r.upright,
        arm: typeof r.arm === 'function' ? r.arm : null, prop: typeof r.prop === 'function' ? r.prop : null, sick: typeof r.sick === 'function' ? r.sick : null, sick0: r.sick0 || 0,
        clips: typeof r.clips === 'function' ? r.clips : null };
    }

    // the player: you, whenever the page passed your character in. The
    // world's own player() still runs, so a world that keeps references to
    // its hero does not break, but its hero is not shown.
    function meOptions(m) {
      var build = { slim: { muscle: 0.25, lean: 0.85 }, athletic: { muscle: 0.6, lean: 0.55 }, strong: { muscle: 0.95, lean: 0.3 } }[m.build];
      var o = { tone: m.tone, hair: m.hair, hairColor: m.hairColor, eyes: m.eyes, build: build, height: m.body === 'b' ? 1.7 : 1.8,
        outfit: { top: m.kit.top, trim: m.kit.trim, shorts: m.kit.top, shoes: '#F2F2F2', pattern: m.kit.pattern, bib: { name: m.name.toUpperCase(), number: m.kit.number } },
        name: m.name, color: m.kit.top };
      var face = [null, { caucasian: 1 }, { african: 1 }, { asian: 1 }][m.face];
      if (face) o.face = face;
      return o;
    }
    function youEntity() {
      if (!ME) return null;
      // in a world whose player rides, you ride the same bike in your own kit;
      // where the player skates, you skate, in a skinsuit of your own colours
      var mo = meOptions(ME);
      if (playerCar) {
        // in a world of cars, you drive the world's car in your own colours, your number on it
        var hc = ctx.assets.car(Object.assign({}, playerCar, { driver: { suit: ME.kit.top, helmet: ME.kit.trim }, number: ME.kit.number, name: ME.name }));
        return hc ? asEntity(hc, 'you', 0.9) : null;
      }
      var h = playerRide ? ctx.assets.cyclist(ME_BODY[ME.body], Object.assign(mo, { bike: playerRide.bike, helmet: playerRide.helmet }))
        : playerSkate ? ctx.assets.skater(ME_BODY[ME.body], Object.assign(mo, { skates: playerSkate.skates, glasses: playerSkate.glasses, suit: { pattern: playerSkate.suit && playerSkate.suit.pattern, number: ME.kit.number } }))
        : ctx.assets.human(ME_BODY[ME.body], playerArms ? Object.assign(mo, playerArms) : mo);
      return h ? asEntity(h, 'you', 0.9) : null;
    }
    capturingPlayer = true;
    var worldPlayer = asEntity(call('player'), 'player()', 0.9);
    capturingPlayer = false;
    var P0 = youEntity() || worldPlayer, youShown = P0 !== worldPlayer;
    P0.radius = clamp(P0.radius, 0.45, P0.vehicle ? 1.7 : 1.6); P0.half = P0.half || P0.radius;
    scene.add(P0.object);
    P0.object.traverse(function (o) { if (o.isMesh) o.castShadow = true; });

    // a new look from the page (the adjust step): rebuilt in place, so the
    // run, its position and its speed carry on
    function setMe(m) {
      if (!m) return;
      ME = m;
      var id = ME_BODY[m.body];
      (ASSETS[id] ? Promise.resolve() : loadAssets([id], LOWQ, function () {})).then(function () {
        var E = youEntity(); if (!E) return;
        E.radius = clamp(E.radius, 0.45, 1.6);
        E.object.position.copy(P0.object.position); E.object.quaternion.copy(P0.object.quaternion);
        E.object.traverse(function (o) { if (o.isMesh) o.castShadow = true; });
        envify(E.object);
        if (LIVE) liveMaterials(E.object);
        scene.remove(P0.object); scene.add(E.object);
        P0.object = E.object; P0.model = E.model; P0.animate = E.animate; P0.radius = E.radius; P0.half = E.half || E.radius; P0.height = E.height; P0.name = E.name; P0.color = E.color; P0.vehicle = E.vehicle;
        youShown = true;
      }).catch(function (e) { warn('Your character could not be loaded (' + (e && e.message || e) + ').'); });
    }
    // the page can change your look, and ask for a close-up of you on the
    // title screen (the "looks like you?" step); nothing else
    var portrait = false;
    window.addEventListener('message', function (e) {
      if (e.source !== window.parent && e.source !== window) return;
      var d = e.data; if (!d || d.source !== 'gamemog-host') return;
      if (d.type === 'me') setMe(readMe(d.me));
      // the page's Play button: bring up the start screen, unless a run is on
      else if (d.type === 'play') { if (demo || state === 'results' || (state === 'title' && !screen && !portrait)) showStart(); }
      else if (d.type === 'view') {
        portrait = d.view === 'portrait';
        if (portrait) { hideScreen(); demo = false; root.classList.remove('demo'); reset(); state = 'title'; }
        else if (state === 'title') startDemo();
        if (root) root.style.visibility = portrait ? 'hidden' : '';
      }
    });

    // rivals are built on demand, but the first dozen are built now so a
    // broken rival() shows up in the playtest rather than at level 9
    var rivalCache = {};
    function makeRival(k) {
      if (rivalCache[k]) return rivalCache[k];
      var e;
      try { e = asEntity(call('rival', k), 'rival(ctx, ' + k + ')', 0.9); }
      catch (err) {
        fail('rival(ctx, ' + k + ') failed: ' + (err && err.message || err));
        var g = new THREE.Mesh(new THREE.CapsuleGeometry(0.7, 0.8, 4, 12), new THREE.MeshStandardMaterial({ color: '#888888' }));
        e = { object: g, radius: 0.8, height: 2, animate: null };
      }
      e.radius = clamp(e.radius, 0.45, 1.8); e.half = e.half || e.radius;
      e.name = typeof e.name === 'string' && e.name.trim() ? e.name.trim().slice(0, 18) : 'Rival ' + k;
      e.color = isHex(e.color) ? e.color : T.accent;
      e.object.traverse(function (o) { if (o.isMesh) o.castShadow = !(o.material && o.material.transparent) && !o.userData.gmFx; });
      envify(e.object);
      if (LIVE) liveMaterials(e.object);
      rivalCache[k] = e;
      return e;
    }
    if (!OPEN) for (var rk = 1; rk <= 12; rk++) makeRival(rk);

    // How high an obstacle stands, for a jump: the height under which nearly all of
    // its surface is (by area, 92%), so a hurdle's board counts and a rover's thin
    // aerial or a cone's flag does not; its box's top if it has no surface to weigh
    function obstacleTop(obj) {
      var hs = [], total = 0, va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
      obj.updateMatrixWorld(true);
      obj.traverse(function (m) {
        if (!m.isMesh || !m.geometry || !m.geometry.attributes.position || m.visible === false) return;
        var g = m.geometry, pa = g.attributes.position, ix = g.index, n = ix ? ix.count : pa.count;
        if (n > 60000) return;
        for (var i = 0; i + 2 < n; i += 3) {
          var a = ix ? ix.getX(i) : i, b = ix ? ix.getX(i + 1) : i + 1, c = ix ? ix.getX(i + 2) : i + 2;
          va.fromBufferAttribute(pa, a).applyMatrix4(m.matrixWorld); vb.fromBufferAttribute(pa, b).applyMatrix4(m.matrixWorld); vc.fromBufferAttribute(pa, c).applyMatrix4(m.matrixWorld);
          var ar = e1.subVectors(vb, va).cross(e2.subVectors(vc, va)).length() / 2;
          if (ar > 0) { hs.push([Math.max(va.y, vb.y, vc.y), ar]); total += ar; }
        }
      });
      var box = new THREE.Box3().setFromObject(obj).max.y;
      if (!hs.length || !(total > 0)) return box;
      hs.sort(function (p, q) { return p[0] - q[0]; });
      var acc = 0; for (var k = 0; k < hs.length; k++) { acc += hs[k][1]; if (acc >= total * 0.92) return Math.min(box, hs[k][0]); }
      return box;
    }
    // obstacles
    var obstacles = [];
    var rawObs = [];
    try { rawObs = call('obstacles') || []; } catch (e) { fail('obstacles() failed: ' + (e && e.message || e)); }
    if (!Array.isArray(rawObs)) { warn('obstacles() must return an array.'); rawObs = []; }
    rawObs.forEach(function (o, n) {
      try {
        var e = asEntity(o, 'obstacles()[' + n + ']', 1);
        var d = o.at != null ? Number(o.at) * L : Number(o.d);
        if (!isFinite(d)) throw new Error('needs at (0 to 1, fraction of the lap)');
        d = wrapD(d);
        var x = clamp(Number(o.x) || 0, -hw, hw);
        var mv = o.move && Number(o.move.amplitude) > 0 ? { amp: Number(o.move.amplitude), period: clamp(Number(o.move.period) || 3, 1.2, 12), phase: n * 1.7 } : null;
        e.radius = clamp(e.radius, 0.3, hw * 0.8);
        // how high it stands off the track: what a jump has to clear
        var top = obstacleTop(e.object), ob = new THREE.Box3().setFromObject(e.object);
        // and how deep it is along the track (a hurdle is a board, not a disc): what a jump has to pass over
        var deep = clamp(isFinite(ob.max.z - ob.min.z) ? (ob.max.z - ob.min.z) / 2 : e.radius, 0.05, e.radius);
        obstacles.push({ d: d, x: x, x0: x, radius: e.radius, half: e.radius, object: e.object, animate: e.animate, move: mv, ph: mv ? mv.phase : 0, w: mv ? Math.PI * 2 / mv.period : 0, top: isFinite(top) && top > 0 ? top : 1, deep: deep });
      } catch (err) { warn('obstacles()[' + n + '] was skipped: ' + (err && err.message || err)); }
    });
    // clear start zone
    obstacles.forEach(function (o) { if (o.d < R.startClear || o.d > L - 8 * VS) { o.d = R.startClear + (o.d % 10); warn('An obstacle sat on the start line; it was moved to ' + Math.round(o.d) + 'm. Keep the first ' + R.startClear + 'm clear.'); } });
    // density
    var maxObs = Math.floor(L / R.obstacleSpacing);
    if (obstacles.length > maxObs) {
      warn(obstacles.length + ' obstacles is too dense for a ' + Math.round(L) + 'm lap; ' + maxObs + ' were kept, evenly spread.');
      obstacles.sort(function (p, q) { return p.d - q.d; });
      var kept = []; for (var oi = 0; oi < maxObs; oi++) kept.push(obstacles[Math.floor(oi * obstacles.length / maxObs)]);
      obstacles = kept;
    }
    // fairness: every row must leave a gap the player fits through
    function rowBlocked(row) {
      var spans = row.map(function (o) { var sw = o.move ? o.move.amp : 0; return [o.x - o.radius - sw - P0.radius, o.x + o.radius + sw + P0.radius]; }).sort(function (p, q) { return p[0] - q[0]; });
      var need = P0.radius * 0.6, edge = -hw + P0.radius;
      for (var s = 0; s < spans.length; s++) { if (spans[s][0] - edge > need) return false; edge = Math.max(edge, spans[s][1]); }
      return hw - P0.radius - edge <= need;
    }
    obstacles.sort(function (p, q) { return p.d - q.d; });
    for (var guard = 0; guard < 200; guard++) {
      var changed = false;
      for (var r0 = 0; r0 < obstacles.length && !changed; r0++) {
        var row = obstacles.filter(function (o) { return Math.abs(rel(o.d, obstacles[r0].d)) < 3.5 * VS; });
        if (row.length && rowBlocked(row)) {
          var big = row.slice().sort(function (p, q) { return (q.radius + (q.move ? q.move.amp : 0)) - (p.radius + (p.move ? p.move.amp : 0)); })[0];
          if (big.move && big.move.amp > 0.5) big.move.amp *= 0.5; else obstacles.splice(obstacles.indexOf(big), 1);
          warn('Obstacles at ' + Math.round(big.d / L * 100) + '% of the lap closed the whole track; one was ' + (obstacles.indexOf(big) >= 0 ? 'slowed' : 'removed') + '. Always leave a gap wider than the player.');
          changed = true;
        }
      }
      if (!changed) break;
    }
    obstacles.forEach(function (o) {
      o.object.traverse(function (m) { if (m.isMesh) m.castShadow = true; });
      scene.add(o.object); place(o.object, o.d, o.x, 0);
    });

    // GM coins: golden, the same in every world
    var coinTex = canvasTexture(256, 256, function (g, w, h) {
      var grd = g.createRadialGradient(w * 0.4, h * 0.35, 10, w / 2, h / 2, w / 2);
      grd.addColorStop(0, '#FFF0A8'); grd.addColorStop(0.55, '#F6C33B'); grd.addColorStop(1, '#C8871A');
      g.fillStyle = grd; g.beginPath(); g.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2); g.fill();
      g.lineWidth = 14; g.strokeStyle = '#B7771A'; g.beginPath(); g.arc(w / 2, h / 2, w / 2 - 18, 0, Math.PI * 2); g.stroke();
      g.font = '900 104px Arial Black, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = '#9A5F0E'; g.fillText('GM', w / 2 + 4, h / 2 + 8);
      g.fillStyle = '#FFE68A'; g.fillText('GM', w / 2, h / 2 + 3);
    });
    coinTex.wrapS = coinTex.wrapT = THREE.ClampToEdgeWrapping;
    var coinGeo = new THREE.CylinderGeometry(0.62, 0.62, 0.14, 32);
    coinGeo.rotateX(Math.PI / 2);
    // GM must read as gold under any world's light, dusk swamp or night city,
    // so the coin carries its own glow rather than relying on the scene's
    var coinSide = new THREE.MeshStandardMaterial({ color: '#F2B632', metalness: 0.6, roughness: 0.35, emissive: '#C98A12', emissiveIntensity: 0.55 });
    var coinFace = new THREE.MeshStandardMaterial({ map: coinTex, metalness: 0.45, roughness: 0.35, emissive: '#FFFFFF', emissiveMap: coinTex, emissiveIntensity: 0.7 });
    var MAX_COINS = 90;
    var coinMesh = new THREE.InstancedMesh(coinGeo, [coinSide, coinFace, coinFace], MAX_COINS);
    coinMesh.frustumCulled = false; scene.add(coinMesh);
    // an open world drops its own coins (open.js); the lap's are never laid, so never shown
    if (OPEN) coinMesh.visible = false;
    var coins = [];

    // hide scenery that would block the chase camera (the classic: a start
    // arch whose banner fills the screen for the first seconds of the race)
    (function guardCorridor() {
      var grid = {};
      COARSE.forEach(function (s) { var key = Math.floor(s.x / 12) + ',' + Math.floor(s.z / 12); (grid[key] = grid[key] || []).push(s); });
      function intrudes(minX, maxX, minY, maxY, minZ, maxZ) {
        for (var gx = Math.floor((minX - hw - 3) / 12); gx <= Math.floor((maxX + hw + 3) / 12); gx++)
          for (var gz = Math.floor((minZ - hw - 3) / 12); gz <= Math.floor((maxZ + hw + 3) / 12); gz++) {
            var cell = grid[gx + ',' + gz]; if (!cell) continue;
            for (var j = 0; j < cell.length; j++) {
              var s = cell[j];
              var px = clamp(s.x, minX, maxX), pz = clamp(s.z, minZ, maxZ);
              // distance across the track's own surface: up a banked bend a metre
              // of slope is less than a metre on the level, and still off the track
              var hd = Math.hypot(px - s.x, pz - s.z), la = lateralOf(s, px, pz), h2 = s.rx * s.rx + s.rz * s.rz;
              if (Math.sqrt(hd * hd + la * la * Math.max(0, 1 - h2)) > hw + 1.2) continue;
              // measured from the surface there, which climbs across a banked track
              var sy = s.y + clamp(lateralOf(s, px, pz), -hw - 1.2, hw + 1.2) * s.ry;
              if (maxY > sy + 0.8 && minY < sy + R.corridorHeight) return s;
            }
          }
        return null;
      }
      var hidden = 0, B = new THREE.Box3(), S = new THREE.Sphere(), M = new THREE.Matrix4(), ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
      scene.updateMatrixWorld(true);
      var skip = new Set([P0.object, coinMesh]); obstacles.forEach(function (o) { skip.add(o.object); });
      scene.traverse(function (o) {
        if (!o.isMesh || o.userData.gmTrack) return;
        for (var p = o; p; p = p.parent) if (skip.has(p)) return;
        if (o.isInstancedMesh) {
          // each instance's real box, not a bounding sphere: a sphere round a
          // flat plank reaches up into the corridor, and hiding the planks of a
          // boardwalk track because they "intrude" on it is exactly wrong
          if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
          var changed = false, IB = new THREE.Box3();
          for (var n = 0; n < o.count; n++) {
            o.getMatrixAt(n, M);
            IB.copy(o.geometry.boundingBox).applyMatrix4(M).applyMatrix4(o.matrixWorld);
            if (IB.max.y - IB.min.y < 0.8 || Math.max(IB.max.x - IB.min.x, IB.max.z - IB.min.z) > 140) continue;
            if (intrudes(IB.min.x, IB.max.x, IB.min.y, IB.max.y, IB.min.z, IB.max.z)) { o.setMatrixAt(n, ZERO); hidden++; changed = true; }
          }
          if (changed) o.instanceMatrix.needsUpdate = true;
          return;
        }
        B.setFromObject(o);
        var size = B.getSize(new THREE.Vector3());
        if (size.y < 0.8 || Math.max(size.x, size.z) > 140) return; // ground, water, sky: not in the way
        if (intrudes(B.min.x, B.max.x, B.min.y, B.max.y, B.min.z, B.max.z)) { o.visible = false; hidden++; }
      });
      if (hidden) warn(hidden + ' scenery piece' + (hidden > 1 ? 's were' : ' was') + ' inside the racing corridor (within ' + (hw + 1.2).toFixed(1) + 'm of the centre line and under ' + R.corridorHeight + 'm high) and were hidden so they cannot block the camera. Keep scenery off the track; overhead arches must clear ' + R.corridorHeight + 'm.');
    })();

    /* ---------------------------------------------------------- the jump -- */
    // The jump (the owner, 1 Oct: "retire the ROLL ... in favor of jump ... make
    // sure users are able to clear hurdles and obstacles so height of jump needs
    // to uniformly be useful"). One rule in every world: anything up to nine
    // tenths of the hero's height (or a metre and a half) can be jumped; anything taller is steered
    // round. The height is sized to the world: the tallest obstacle a jump
    // may clear, cleared with a third to spare, never less than about half the
    // hero's own height, and the time in the air is the same everywhere, so
    // the rhythm of a jump never changes from world to world. At the slowest
    // pace the window over an obstacle is several times longer than it takes
    // to pass it.
    var JUMP = (function () {
      // (a car is low; a barrier as tall as a person's chest is still a jump for it)
      var ph = clamp(Number(P0.height) || 1.8, 0.8, 4), low = Math.max(ph * 0.9, 1.5), tall = 0;
      obstacles.forEach(function (o) { if (o.top <= low && o.top > tall) tall = o.top; });
      var H = clamp(Math.max(ph * 0.55, tall * 1.35 + 0.08), 0.6, ph * 1.3 + 0.3), T = PLAY.vehicle ? 0.8 : 0.72;
      return { H: H, T: T, g: 8 * H / (T * T), v0: 4 * H / T, low: low };
    })();
    function jumpable(o) { return o.top <= JUMP.low; }
    // would a jump (the one in the air, or one taken now) be above `top` the whole
    // time from tau - span to tau + span seconds from now
    function clears(tau, top, span) {
      var y0 = player.y > 0 ? player.y : 0, vy = player.y > 0 ? player.vy : JUMP.v0;
      for (var k = -1; k <= 1; k += 2) { var tt = Math.max(0, tau + k * span); if (y0 + vy * tt - JUMP.g * tt * tt / 2 < top - 0.05) return false; }
      return true;
    }

    /* ---------------------------------------------- obstacles each lap -- */
    // play.hazards (the creator's choice): 'more' lays copies of the world's
    // own obstacles each lap, about 15% more a lap, up to double (and never
    // past the track's density); 'fewer' clears about 10% a lap, down to a
    // third. A copy is never put in a row with another obstacle, so the gap
    // a player needs is always there. Each run lays them out afresh.
    var HZ = { mode: PLAY.hazards, base: obstacles.slice(), extra: [], rank: [] };
    if (HZ.mode === 'more' && HZ.base.length) {
      var room = Math.max(0, Math.floor(L / R.obstacleSpacing) - HZ.base.length), nx = Math.min(HZ.base.length, room);
      for (var hx = 0; hx < nx; hx++) {
        var src = HZ.base[hx % HZ.base.length], cp = src.object.clone(true);
        cp.visible = false; scene.add(cp);
        HZ.extra.push({ d: 0, x: 0, x0: 0, radius: src.radius, half: src.half, top: src.top, deep: src.deep, object: cp, animate: null,
          move: src.move ? { amp: src.move.amp, period: src.move.period, phase: src.move.phase + hx * 0.9 } : null, ph: 0, w: src.w, copy: true });
      }
    }
    function layHazards() {
      if (HZ.mode === 'same' || !HZ.base.length) return;
      var n = HZ.base.length, i;
      if (HZ.mode === 'fewer') {
        var keep = Math.max(Math.ceil(n / 3), Math.round(n * (1 - 0.1 * (level - 1))));
        obstacles = HZ.base.filter(function (o, k) { var on = HZ.rank[k] < keep; o.object.visible = on; return on; });
        return;
      }
      var add = Math.min(HZ.extra.length, Math.round(n * 0.15 * (level - 1))), on = HZ.base.slice();
      for (i = 0; i < HZ.extra.length; i++) {
        var e = HZ.extra[i], placed = false;
        if (i < add) {
          for (var tries = 0; tries < 40 && !placed; tries++) {
            var d = wrapD(player.d + R.startClear + runRandom() * (L - R.startClear - 8 * VS));
            var span = (e.move ? e.move.amp : 0) + e.radius, x = (runRandom() * 2 - 1) * Math.max(0, hw - span);
            // alone in its row: nothing else within a row's length either side
            var clear = on.every(function (o) { return Math.abs(rel(o.d, d)) > 3.5 * VS + o.half + e.half; });
            if (clear) { e.d = d; e.x = e.x0 = x; placed = true; }
          }
        }
        e.object.visible = placed;
        if (placed) { e.ph = e.move ? e.move.phase : 0; place(e.object, e.d, e.x, 0); on.push(e); }
      }
      obstacles = on;
    }
    function resetHazards() {
      HZ.base.forEach(function (o) { o.object.visible = true; });
      HZ.extra.forEach(function (e) { e.object.visible = false; });
      obstacles = HZ.base.slice();
      // which obstacles a 'fewer' run clears first: different every run
      HZ.rank = HZ.base.map(function (o, k) { return { k: k, r: runRandom() }; }).sort(function (a, b) { return a.r - b.r; })
        .reduce(function (acc, v, i) { acc[v.k] = i; return acc; }, []);
    }

    /* --------------------------------------------------------- graphics -- */
    // Opt-in cinematic rendering: image-based light baked from the world's own
    // sky, a sharp shadow map that follows the player, bloom, colour grading
    // and a resolution that adapts to hold 60 fps. Worlds without `graphics`
    // render exactly as before.
    var sunLight = null, sunOffset = null, SUNB = null, LIVE = null;
    function envify(root) {
      if (!G || envScale === 1 || !isFinite(envScale)) return;
      root.traverse(function (o) {
        if (!o.isMesh) return;
        (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) {
          if (m && m.envMapIntensity !== undefined && !m.userData.gmEnv) { m.userData.gmEnv = true; m.envMapIntensity *= envScale; }
        });
      });
    }
    if (G) {
      try {
        scene.traverse(function (o) { if (!sunLight && o.isDirectionalLight && o.castShadow) sunLight = o; });
        if (G.environment) {
          var envScene = new THREE.Scene(), hemi = null;
          scene.traverse(function (o) { if (!hemi && o.isHemisphereLight) hemi = o; });
          var sp = skyParams || {
            top: T.sky, horizon: T.fog, bottom: hemi ? '#' + hemi.groundColor.getHexString() : '#3A3A34',
            sunDir: sunLight ? sunLight.position.clone().sub(sunLight.target.position).normalize() : new THREE.Vector3(0.45, 0.35, 0.3).normalize(),
            sunColor: sunLight ? '#' + sunLight.color.getHexString() : '#FFF1D6', sunSize: 3 * Math.PI / 180, glow: 1, sunPower: 12, haze: 0.5, curve: 0.45,
          };
          var envOpt = typeof G.environment === 'object' ? G.environment : {};
          var hd = envOpt.hdri && ASSETS[envOpt.hdri] && ASSETS[envOpt.hdri].rgbe ? ASSETS[envOpt.hdri] : skyHdri ? skyHdri.A : null;
          if (hd) envScene.add(hdriSphere(hd, skyHdri && hd === skyHdri.A ? skyHdri.dir : sp.sunDir, 100, skyHdri && hd === skyHdri.A ? skyHdri.exposure : 1));
          // the sun's direct light is the key light's job; in the environment it
          // only glows, or every surface would catch it twice
          else envScene.add(new THREE.Mesh(new THREE.SphereGeometry(100, 48, 24), skyMaterial(sp, 0.06)));
          if (envOpt.hdri && !hd) warn('graphics.environment.hdri "' + envOpt.hdri + '" is not loaded; list it in assets. The sky was used instead.');
          var extraFn = typeof G.environment === 'function' ? G.environment : typeof envOpt.extras === 'function' ? envOpt.extras : null;
          if (extraFn) { var extra = extraFn(ctx); if (extra && extra.isObject3D) envScene.add(extra); }
          if (envOpt.intensity != null) envScale = clamp(Number(envOpt.intensity) || 1, 0, 4);
          if (G.envIntensity != null) envScale = G.envIntensity;
          var pmrem = new THREE.PMREMGenerator(renderer);
          scene.environment = pmrem.fromScene(envScene, 0.02, 0.1, 400).texture;
          pmrem.dispose();
          envify(scene); for (var ek in rivalCache) envify(rivalCache[ek].object);
        }
        if (sunLight && G.shadows && G.shadows.follow) {
          scene.add(sunLight.target);
          var E = G.shadows.extent;
          sunOffset = sunLight.position.clone().sub(sunLight.target.position);
          if (sunOffset.lengthSq() < 1) sunOffset.set(40, 80, 30);
          sunOffset.setLength(Math.max(E * 3, 150));
          var sc = sunLight.shadow.camera;
          sc.left = -E; sc.right = E; sc.top = E; sc.bottom = -E; sc.near = 1; sc.far = sunOffset.length() + E * 3; sc.updateProjectionMatrix();
          sunLight.shadow.mapSize.set(G.shadows.mapSize, G.shadows.mapSize);
          if (sunLight.shadow.map) { sunLight.shadow.map.dispose(); sunLight.shadow.map = null; }
          if (!sunLight.shadow.normalBias) sunLight.shadow.normalBias = 0.025;
          if (!sunLight.shadow.bias) sunLight.shadow.bias = -0.0002;
          var fwd = sunOffset.clone().normalize().negate(), lr = new THREE.Vector3().crossVectors(fwd, Math.abs(fwd.y) > 0.99 ? new THREE.Vector3(1, 0, 0) : UP).normalize();
          SUNB = { fwd: fwd, right: lr, up: new THREE.Vector3().crossVectors(lr, fwd).normalize(), texel: 2 * E / G.shadows.mapSize, E: E, c: new THREE.Vector3() };
        }
        post = makePost();
      } catch (e) {
        warn('The cinematic graphics could not start on this device (' + (e && e.message || e) + '); the world renders without them.');
        post = null;
      }
      // live reflections (graphics.reflections): a cube of the world round the
      // player, one face a frame, filtered for rough and glossy surfaces alike,
      // in everything a car kit marked as reflective. Paint shows the street
      // going by, not a sky painted once.
      if (G.reflections && quality !== 'low') {
        try {
          var lrt = new THREE.WebGLCubeRenderTarget(256, { type: renderer.capabilities.isWebGL2 ? THREE.HalfFloatType : THREE.UnsignedByteType, generateMipmaps: false });
          LIVE = { rt: lrt, cam: new THREE.CubeCamera(0.3, 900, lrt), face: 0, frames: 0, on: true };
          LIVE.cam.coordinateSystem = renderer.coordinateSystem; LIVE.cam.updateCoordinateSystem();
          liveMaterials(scene); for (var lk in rivalCache) liveMaterials(rivalCache[lk].object);
        } catch (e) { LIVE = null; warn('Live reflections could not start (' + (e && e.message || e) + ').'); }
      }
    }
    function liveMaterials(root) {
      if (!LIVE) return;
      root.traverse(function (o) {
        if (!o.isMesh) return;
        (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { if (m && m.userData.gmLive && m.envMap !== LIVE.rt.texture) { m.envMap = LIVE.rt.texture; m.needsUpdate = true; } });
      });
    }
    function livePass() {
      if (!LIVE || !LIVE.on || document.hidden) return;
      var c = LIVE.cam, f = LIVE.face, i;
      // a fresh cube starts where the player is now: a metre up, in the car's own space
      if (f === 0) { pointAt(player.d, player.x, 1.1, c.position); c.updateMatrixWorld(true); }
      if (!MIR || !MIR.skip) { LIVE.skip = LIVE.skip || []; if (!LIVE.skip.length || LIVE.frames % 20 === 0) { LIVE.skip = []; scene.traverse(function (ob) { if (ob.userData && ob.userData.noReflection && ob.visible) LIVE.skip.push(ob); }); } }
      var skip = MIR && MIR.skip ? MIR.skip : LIVE.skip, rt0 = renderer.getRenderTarget(), sm = renderer.shadowMap.autoUpdate, mon = MIR ? MIR.uniforms.on.value : 0;
      var pv = P0.object.visible; P0.object.visible = false;
      for (i = 0; i < skip.length; i++) skip[i].visible = false;
      for (i = 0; i < skies.length; i++) skies[i].position.copy(c.position);
      if (MIR) MIR.uniforms.on.value = 0;
      renderer.shadowMap.autoUpdate = false;
      // each face is drawn aside and copied in clean: one bad pixel (a NaN from
      // a surface seen exactly edge on) would otherwise be blurred over the
      // whole cube when it is filtered, and every car would reflect black
      if (!LIVE.tmp) {
        LIVE.tmp = new THREE.WebGLRenderTarget(256, 256, { type: LIVE.rt.texture.type, depthBuffer: true });
        LIVE.scrub = new THREE.ShaderMaterial({
          uniforms: { tSrc: { value: LIVE.tmp.texture } }, depthTest: false, depthWrite: false, toneMapped: false,
          vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
          fragmentShader: ['uniform sampler2D tSrc; varying vec2 vUv;', 'void main() {', '  vec3 c = texture2D(tSrc, vUv).rgb;', '#if __VERSION__ >= 300', '  if (any(isnan(c)) || any(isinf(c))) c = vec3(0.0);', '#endif', '  gl_FragColor = vec4(clamp(c, vec3(0.0), vec3(48.0)), 1.0);', '}'].join('\n'),
        });
        var tri = new THREE.BufferGeometry();
        tri.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
        tri.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2));
        var qm = new THREE.Mesh(tri, LIVE.scrub); qm.frustumCulled = false;
        LIVE.qs = new THREE.Scene(); LIVE.qs.add(qm); LIVE.qc = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      }
      renderer.setRenderTarget(LIVE.tmp); renderer.render(scene, c.children[f]);
      renderer.setRenderTarget(LIVE.rt, f); renderer.render(LIVE.qs, LIVE.qc);
      renderer.setRenderTarget(rt0); renderer.shadowMap.autoUpdate = sm;
      if (MIR) MIR.uniforms.on.value = mon;
      for (i = 0; i < skip.length; i++) skip[i].visible = true;
      for (i = 0; i < skies.length; i++) skies[i].position.copy(camera.position);
      P0.object.visible = pv;
      LIVE.face = (f + 1) % 6;
      if (LIVE.face === 0) { LIVE.rt.texture.needsPMREMUpdate = true; LIVE.frames++; }
    }
    // a library sky, decoded from RGBE to half floats once, turned so its sun
    // sits where the world's key light comes from
    function hdriTexture(A) {
      if (HDRI_TEX[A.id]) return HDRI_TEX[A.id];
      var w = A.json.width, h = A.json.height, src = new Uint8Array(A.rgbe), out = new Uint16Array(w * h * 4), toHalf = THREE.DataUtils.toHalfFloat;
      var best = 0, bx = 0, by = 0, hz = [0, 0, 0], hn = 0, y0 = Math.floor(h * 0.44), y1 = Math.floor(h * 0.49);
      for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
        var i = (y * w + x) * 4, o = ((h - 1 - y) * w + x) * 4, e = src[i + 3], f = e ? Math.pow(2, e - 136) : 0;
        var r = Math.min(60000, src[i] * f), g = Math.min(60000, src[i + 1] * f), b = Math.min(60000, src[i + 2] * f);
        out[o] = toHalf(r); out[o + 1] = toHalf(g); out[o + 2] = toHalf(b); out[o + 3] = toHalf(1);
        var lum = r * 0.2126 + g * 0.7152 + b * 0.0722; if (lum > best) { best = lum; bx = x; by = y; }
        // the band just above the horizon, all the way round, sun excluded: the haze
        if (y >= y0 && y < y1 && lum < 4) { hz[0] += r; hz[1] += g; hz[2] += b; hn++; }
      }
      var t = new THREE.DataTexture(out, w, h, THREE.RGBAFormat, THREE.HalfFloatType);
      t.colorSpace = THREE.LinearSRGBColorSpace; t.magFilter = t.minFilter = THREE.LinearFilter; t.needsUpdate = true;
      var phi = 2 * Math.PI * (bx + 0.5) / w, theta = Math.PI * (by + 0.5) / h;
      var haze = new THREE.Color(); if (hn) haze.setRGB(hz[0] / hn, hz[1] / hn, hz[2] / hn, THREE.LinearSRGBColorSpace);
      return (HDRI_TEX[A.id] = { tex: t, az: Math.atan2(-Math.cos(phi) * Math.sin(theta), Math.sin(phi) * Math.sin(theta)), el: Math.PI / 2 - theta, haze: haze });
    }
    // the 90th-percentile brightness of a photograph's sky (above the horizon), for a preset's exposure
    function skyP90(A) {
      if (SKY_P90[A.id]) return SKY_P90[A.id];
      var w = A.json.width, h = A.json.height, src = new Uint8Array(A.rgbe), bins = new Float64Array(200), n = 0;
      for (var y = 0; y < (h >> 1); y += 2) for (var x = 0; x < w; x += 2) {
        var i = (y * w + x) * 4, e = src[i + 3], f = e ? Math.pow(2, e - 136) : 0;
        var lum = (src[i] * 0.2126 + src[i + 1] * 0.7152 + src[i + 2] * 0.0722) * f;
        bins[clamp(Math.floor((Math.log2(Math.max(lum, 1e-4)) + 14) * 8), 0, 199)]++; n++;
      }
      var want = n * 0.9, c = 0, b = 0;
      for (; b < 200 && c + bins[b] < want; b++) c += bins[b];
      return (SKY_P90[A.id] = Math.max(0.02, Math.pow(2, (b + 0.5) / 8 - 14)));
    }
    function hdriSphere(A, sunDir, radius, exposure) {
      var H = hdriTexture(A);
      var mat = new THREE.MeshBasicMaterial({ map: H.tex, side: THREE.BackSide, toneMapped: false, fog: false, depthWrite: false });
      if (exposure && exposure !== 1) mat.color.setScalar(exposure);
      var m = new THREE.Mesh(new THREE.SphereGeometry(radius || 100, 64, 32), mat);
      var az = Math.atan2(sunDir.x, sunDir.z);
      m.rotation.y = az - H.az;
      // the sun as photographed: the world's azimuth, the photograph's height;
      // the haze: the colour of the photograph's horizon, for the world's fog
      m.userData.sun = new THREE.Vector3(Math.sin(az) * Math.cos(H.el), Math.sin(H.el), Math.cos(az) * Math.cos(H.el));
      m.userData.haze = H.haze.clone().multiplyScalar(exposure || 1);
      return m;
    }
    // The player in a frame, for the test drive's look (1 Oct): the player drawn alone
    // as a mask, then among everything else, at the size of the measured frame. size:
    // the share of the frame the player fills; seen: how much of the player is not
    // hidden by scenery; apart: how far the player's colour stands from what is
    // right around it (0 to 441, the distance between average colours in RGB)
    function playerView(w, h, d) {
      if (!P0 || !P0.object || !P0.object.visible) return null;
      var mine = new Set(); P0.object.traverse(function (o) { mine.add(o); });
      var white = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false, toneMapped: false }), black = new THREE.MeshBasicMaterial({ color: 0x000000, fog: false, toneMapped: false });
      var rt = new THREE.WebGLRenderTarget(w, h), saved = [], bg = scene.background, fog = scene.fog, buf = new Uint8Array(w * h * 4), A = new Uint8Array(w * h), B = new Uint8Array(w * h);
      scene.traverse(function (o) {
        if (!(o.isMesh || o.isPoints || o.isLine || o.isSprite)) return;
        // a mirror or a water surface that draws itself before it renders must not draw the mask
        saved.push([o, o.material, o.visible, o.onBeforeRender]); o.onBeforeRender = function () {};
        var m = Array.isArray(o.material) ? o.material[0] : o.material, see = m && m.transparent && (m.opacity < 0.6 || m.depthWrite === false);
        if (mine.has(o)) o.material = white; else if (see || o.isPoints || o.isLine || o.isSprite) o.visible = false; else o.material = black;
      });
      scene.background = null; scene.fog = null;
      var old = renderer.getRenderTarget(), cc = renderer.getClearColor(new THREE.Color()), ca = renderer.getClearAlpha(), sa = renderer.shadowMap.autoUpdate;
      try {
        renderer.shadowMap.autoUpdate = false; renderer.setClearColor(0x000000, 1); renderer.setRenderTarget(rt);
        renderer.clear(); renderer.render(scene, camera); renderer.readRenderTargetPixels(rt, 0, 0, w, h, buf);
        for (var i = 0; i < w * h; i++) B[i] = buf[i * 4] > 127 ? 1 : 0;
        saved.forEach(function (s) { if (!mine.has(s[0])) s[0].visible = false; });
        renderer.clear(); renderer.render(scene, camera); renderer.readRenderTargetPixels(rt, 0, 0, w, h, buf);
        for (i = 0; i < w * h; i++) A[i] = buf[i * 4] > 127 ? 1 : 0;
      } finally {
        saved.forEach(function (s) { s[0].material = s[1]; s[0].visible = s[2]; s[0].onBeforeRender = s[3]; });
        scene.background = bg; scene.fog = fog; renderer.shadowMap.autoUpdate = sa; renderer.setRenderTarget(old); renderer.setClearColor(cc, ca); rt.dispose(); white.dispose(); black.dispose();
      }
      // a render target reads bottom up; the frame top down
      var all = 0, shown = 0, x0 = w, x1 = -1, y0 = h, y1 = -1, x, y, k;
      for (y = 0; y < h; y++) for (x = 0; x < w; x++) { k = y * w + x; if (A[k]) { all++; if (B[k]) shown++; var fy = h - 1 - y; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, fy); y1 = Math.max(y1, fy); } }
      if (all < 4) return { size: +(all / (w * h)).toFixed(4), seen: 0, apart: 0 };
      // its colour where it shows, against a band round it (its box grown by half) where it does not
      var pin = [0, 0, 0, 0], pout = [0, 0, 0, 0], gx = Math.ceil((x1 - x0 + 1) * 0.5), gy = Math.ceil((y1 - y0 + 1) * 0.5);
      for (y = Math.max(0, y0 - gy); y <= Math.min(h - 1, y1 + gy); y++) for (x = Math.max(0, x0 - gx); x <= Math.min(w - 1, x1 + gx); x++) {
        k = (h - 1 - y) * w + x; var q = (y * w + x) * 4, into = A[k] && B[k] ? pin : !A[k] ? pout : null;
        if (into) { into[0] += d[q]; into[1] += d[q + 1]; into[2] += d[q + 2]; into[3]++; }
      }
      var apart = pin[3] && pout[3] ? Math.hypot(pin[0] / pin[3] - pout[0] / pout[3], pin[1] / pin[3] - pout[1] / pout[3], pin[2] / pin[3] - pout[2] / pout[3]) : 0;
      return { size: +(all / (w * h)).toFixed(4), seen: +(shown / all).toFixed(2), apart: Math.round(apart) };
    }
    // keep the shadow map on what the camera sees, snapped to whole texels so
    // shadow edges do not crawl as the player moves
    function followShadow() {
      if (!SUNB) return;
      var c = pointAt(player.d + SUNB.E * 0.35, player.x * 0.5, 0, SUNB.c);
      var a = Math.round(c.dot(SUNB.right) / SUNB.texel) * SUNB.texel, b = Math.round(c.dot(SUNB.up) / SUNB.texel) * SUNB.texel, f = c.dot(SUNB.fwd);
      c.set(0, 0, 0).addScaledVector(SUNB.right, a).addScaledVector(SUNB.up, b).addScaledVector(SUNB.fwd, f);
      sunLight.target.position.copy(c); sunLight.position.copy(c).add(sunOffset);
      sunLight.target.updateMatrixWorld();
    }

    function makePost() {
      var VS = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
      var tri = new THREE.BufferGeometry();
      tri.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
      tri.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2));
      var quad = new THREE.Mesh(tri); quad.frustumCulled = false;
      var qScene = new THREE.Scene(); qScene.add(quad);
      var qCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      var webgl2 = renderer.capabilities.isWebGL2;
      var hdrType = webgl2 || renderer.extensions.has('OES_texture_half_float') ? THREE.HalfFloatType : THREE.UnsignedByteType;
      var P = { msaa: G.msaa && webgl2, bloomOn: !!G.bloom, calls: 0 };
      var hdr = new THREE.WebGLRenderTarget(1, 1, { type: hdrType, samples: P.msaa ? 4 : 0 });
      var LEVELS = 6, mips = [];
      for (var i = 0; i < LEVELS; i++) mips.push(new THREE.WebGLRenderTarget(1, 1, { type: hdrType, depthBuffer: false }));
      function mat(fs, uniforms, extra) { var m = new THREE.ShaderMaterial(Object.assign({ uniforms: uniforms, vertexShader: VS, fragmentShader: fs, depthTest: false, depthWrite: false, toneMapped: false }, extra || {})); return m; }
      var down = mat([
        'uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uPrefilter, uThreshold, uKnee; varying vec2 vUv;',
        // one NaN or infinite pixel from a broken material must not bloom into a halo
        'vec3 s(vec2 o) {',
        '  vec3 c = texture2D(tSrc, vUv + o * uTexel).rgb;',
        '#if __VERSION__ >= 300',
        '  if (any(isnan(c)) || any(isinf(c))) c = vec3(0.0);',
        '#endif',
        '  return min(c, vec3(64.0));',
        '}',
        'float karis(vec3 c) { return 1.0 / (1.0 + max(c.r, max(c.g, c.b))); }',
        'void main() {',
        '  vec3 a = s(vec2(-2.0, 2.0)), b = s(vec2(0.0, 2.0)), c = s(vec2(2.0, 2.0)), d = s(vec2(-2.0, 0.0)), e = s(vec2(0.0)), f = s(vec2(2.0, 0.0));',
        '  vec3 g = s(vec2(-2.0, -2.0)), h = s(vec2(0.0, -2.0)), i = s(vec2(2.0, -2.0)), j = s(vec2(-1.0, 1.0)), k = s(vec2(1.0, 1.0)), l = s(vec2(-1.0, -1.0)), m = s(vec2(1.0, -1.0));',
        '  vec3 g0 = (a + b + d + e) * 0.25, g1 = (b + c + e + f) * 0.25, g2 = (d + e + g + h) * 0.25, g3 = (e + f + h + i) * 0.25, g4 = (j + k + l + m) * 0.25;',
        '  vec3 col;',
        '  if (uPrefilter > 0.5) {',
        '    float w0 = karis(g0), w1 = karis(g1), w2 = karis(g2), w3 = karis(g3), w4 = karis(g4);',
        '    col = (g4 * w4 * 0.5 + (g0 * w0 + g1 * w1 + g2 * w2 + g3 * w3) * 0.125) / (w4 * 0.5 + (w0 + w1 + w2 + w3) * 0.125);',
        '    float br = max(col.r, max(col.g, col.b)), soft = clamp(br - uThreshold + uKnee, 0.0, 2.0 * uKnee);',
        '    soft = soft * soft / (4.0 * uKnee + 1e-4);',
        '    col *= max(soft, br - uThreshold) / max(br, 1e-4);',
        '  } else col = g4 * 0.5 + (g0 + g1 + g2 + g3) * 0.125;',
        '  gl_FragColor = vec4(min(col, vec3(64.0)), 1.0);',
        '}',
      ].join('\n'), { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uPrefilter: { value: 0 }, uThreshold: { value: 1 }, uKnee: { value: 0.5 } });
      var up = mat([
        'uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uRadius, uWeight; varying vec2 vUv;',
        'vec3 s(float x, float y) { return texture2D(tSrc, vUv + vec2(x, y) * uTexel * uRadius).rgb; }',
        'void main() {',
        '  vec3 c = s(0.0, 0.0) * 4.0 + (s(-1.0, 0.0) + s(1.0, 0.0) + s(0.0, -1.0) + s(0.0, 1.0)) * 2.0 + s(-1.0, -1.0) + s(1.0, -1.0) + s(-1.0, 1.0) + s(1.0, 1.0);',
        '  gl_FragColor = vec4(c / 16.0 * uWeight, 1.0);',
        '}',
      ].join('\n'), { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uRadius: { value: 1 }, uWeight: { value: 1 } }, { blending: THREE.AdditiveBlending });
      var comp = mat([
        'uniform sampler2D tScene, tBloom; uniform float uBloom, uExposure, uContrast, uSat, uWarm, uVig, uGrain, uTime, uSplit, uHiSat, uPaper, uBlur; uniform vec2 uRes, uCenter; varying vec2 vUv;',
        'float gH(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }',
        'float gN(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f); return mix(mix(gH(i), gH(i + vec2(1, 0)), u.x), mix(gH(i + vec2(0, 1)), gH(i + vec2(1, 1)), u.x), u.y); }',
        'vec3 fit(vec3 v) { vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }',
        'vec3 aces(vec3 c) {',
        '  const mat3 IN = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));',
        '  const mat3 OUT = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));',
        '  return clamp(OUT * fit(IN * (c * uExposure / 0.6)), 0.0, 1.0);',
        '}',
        'vec3 srgb(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }',
        'float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }',
        'void main() {',
        '  vec3 c = texture2D(tScene, vUv).rgb;',
        // speed: the picture streams out from where you are heading, the middle stays sharp
        '  if (uBlur > 0.001) { vec2 q = (vUv - uCenter) * vec2(uRes.x / uRes.y, 1.0); vec2 dv = (vUv - uCenter) * uBlur * 0.06 * smoothstep(0.32, 0.95, length(q * vec2(1.0, 1.5))); vec3 acc = c; for (int i = 1; i < 8; i++) acc += texture2D(tScene, vUv - dv * float(i) / 7.0).rgb; c = acc / 8.0; }',
        '#if __VERSION__ >= 300',
        '  if (any(isnan(c)) || any(isinf(c))) c = vec3(0.0);',
        '#endif',
        '  c += texture2D(tBloom, vUv).rgb * uBloom;',
        '  c = aces(c);',
        '  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));',
        '  c = srgb(max(mix(vec3(l), c, uSat * mix(1.0, uHiSat, smoothstep(0.35, 0.85, l))), 0.0));',
        '  float ld = dot(c, vec3(0.2126, 0.7152, 0.0722));',
        '  c = c * mix(vec3(1.0), vec3(1.04, 0.99, 0.93), uSplit * smoothstep(0.35, 1.0, ld)) + vec3(0.008, 0.02, 0.05) * uSplit * (1.0 - smoothstep(0.0, 0.5, ld));',
        '  c *= mix(vec3(1.0), vec3(0.9, 0.97, 1.08), uSplit * (1.0 - smoothstep(0.12, 0.55, ld)));',
        '  c = (c - 0.5) * uContrast + 0.5;',
        '  c += vec3(uWarm, uWarm * 0.25, -uWarm) * 0.05;',
        '  if (uPaper > 0.0) { vec2 fc = gl_FragCoord.xy; float paper = gN(fc * 0.35) * 0.5 + gN(fc * 0.09 + 7.0) * 0.5, fib = gN(vec2(fc.x * 0.02, fc.y * 0.6)); c *= 1.0 + (paper - 0.5) * uPaper + (fib - 0.5) * uPaper * 0.35; }',
        '  vec2 q = vUv - 0.5; q.x *= uRes.x / uRes.y;',
        '  c *= 1.0 - uVig * smoothstep(0.3, 1.1, length(q));',
        '  c += (hash(vUv * uRes + fract(uTime * 7.31) * 113.0) - 0.5) * uGrain;',
        '  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);',
        '}',
      ].join('\n'), {
        tScene: { value: hdr.texture }, tBloom: { value: mips[0].texture }, uBloom: { value: G.bloom ? G.bloom.strength : 0 }, uExposure: { value: G.exposure },
        uContrast: { value: G.grade.contrast }, uSat: { value: G.grade.saturation }, uWarm: { value: G.grade.warmth }, uVig: { value: G.grade.vignette },
        uGrain: { value: G.grade.grain }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) },
        uSplit: { value: G.grade.split }, uHiSat: { value: G.grade.highlights }, uPaper: { value: G.grade.paper },
        uBlur: { value: 0 }, uCenter: { value: new THREE.Vector2(0.5, 0.5) },
      });
      var black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); black.needsUpdate = true;
      function pass(m, target) { quad.material = m; renderer.setRenderTarget(target); renderer.render(qScene, qCam); }
      P.resize = function () {
        var v = renderer.getDrawingBufferSize(new THREE.Vector2()), w = Math.max(1, v.x), h = Math.max(1, v.y);
        hdr.setSize(w, h);
        for (var i = 0; i < LEVELS; i++) mips[i].setSize(Math.max(1, w >> (i + 1)), Math.max(1, h >> (i + 1)));
        comp.uniforms.uRes.value.set(w, h);
      };
      P.setGrain = function (g) { comp.uniforms.uGrain.value = g; };
      P.setExposure = function (e) { comp.uniforms.uExposure.value = e; };
      P.setMotion = function (k) { comp.uniforms.uBlur.value = MASTER ? k * 0.6 : k; };
      P.setMsaa = function (on) { P.msaa = on; hdr.dispose(); hdr = new THREE.WebGLRenderTarget(1, 1, { type: hdrType, samples: on ? 4 : 0 }); comp.uniforms.tScene.value = hdr.texture; P.resize(); };
      P.render = function (time) {
        renderer.setRenderTarget(hdr);
        renderer.render(scene, camera);
        P.calls = renderer.info.render.calls; P.tris = renderer.info.render.triangles;
        if (P.bloomOn && G.bloom) {
          var src = hdr.texture, sw = hdr.width, sh = hdr.height;
          down.uniforms.uThreshold.value = G.bloom.threshold; down.uniforms.uKnee.value = G.bloom.threshold * 0.5;
          for (var i = 0; i < LEVELS; i++) {
            down.uniforms.tSrc.value = src; down.uniforms.uTexel.value.set(1 / sw, 1 / sh); down.uniforms.uPrefilter.value = i === 0 ? 1 : 0;
            pass(down, mips[i]); src = mips[i].texture; sw = mips[i].width; sh = mips[i].height;
          }
          var auto = renderer.autoClear; renderer.autoClear = false;
          for (i = LEVELS - 1; i > 0; i--) {
            up.uniforms.tSrc.value = mips[i].texture; up.uniforms.uTexel.value.set(1 / mips[i].width, 1 / mips[i].height);
            up.uniforms.uRadius.value = G.bloom.radius * 1.6; up.uniforms.uWeight.value = 0.55 + G.bloom.radius * 0.45;
            pass(up, mips[i - 1]);
          }
          renderer.autoClear = auto;
          comp.uniforms.tBloom.value = mips[0].texture;
        } else comp.uniforms.tBloom.value = black;
        comp.uniforms.uTime.value = time;
        pass(comp, null);
      };
      P.resize();
      return P;
    }

    // hold 60 fps: when frames run long, render fewer pixels, then drop the
    // multisampling, then the bloom. A world never has to guess the device.
    var Q = { acc: 0, n: 0, min: Math.max(0.5, Math.min(1, basePixelRatio * 0.6)) };
    var MASTER = false;
    function adapt(delta) {
      if (MASTER || !post || state === 'paused' || document.hidden || delta > 0.1) return;
      Q.acc += delta; Q.n++;
      if (Q.n < 50) return;
      var ms = Q.acc / Q.n * 1000; Q.acc = 0; Q.n = 0;
      if (ms < 19.5) return;
      var pr = renderer.getPixelRatio();
      if (pr > Q.min + 0.01) { renderer.setPixelRatio(Math.max(Q.min, pr * 0.85)); renderer.setSize(window.innerWidth, window.innerHeight); post.resize(); }
      else if (post.msaa) post.setMsaa(false);
      else if (MIR && MIR.on && MIR.scale > 0.3) MIR.scale = 0.3;
      else if (LIVE && LIVE.on) LIVE.on = false;
      else if (post.bloomOn) post.bloomOn = false;
      else if (MIR && MIR.on) MIR.on = false;
    }

    /* ------------------------------------------------------------ audio -- */
    var audio = null;
    function ensureAudio() {
      if (audio) { if (audio.ctx.state === 'suspended' && !paused) audio.ctx.resume(); return audio; }
      var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
      var ac = new AC(), master = ac.createGain(); master.gain.value = 0.55;
      // a limiter on everything, so no world, effect or score can clip
      var limiter = ac.createDynamicsCompressor(); limiter.threshold.value = -1.5; limiter.knee.value = 0; limiter.ratio.value = 20; limiter.attack.value = 0.002; limiter.release.value = 0.12;
      master.connect(limiter); limiter.connect(ac.destination);
      var fx = ac.createGain(); fx.connect(master);
      var world = ac.createGain(); world.gain.value = 0.8; world.connect(master);
      var music = null;
      if (MUSIC) { try { music = GameMogMusic.player(ac, master, MUSIC, { target: -16 }); } catch (e) { warn('music could not start: ' + (e && e.message || e)); } }
      else if (TRACK && ASSETS[TRACK] && ASSETS[TRACK].buffer) { try { music = GameMogMusic.track(ac, master, ASSETS[TRACK], { target: -16 }); } catch (e) { warn('the music could not start: ' + (e && e.message || e)); } }
      // engines: yours, and the rivals nearest you
      var engines = ac.createGain(); engines.gain.value = 0.9; engines.connect(master);
      audio = { ctx: ac, master: master, fx: fx, world: world, limiter: limiter, music: music, engines: engines, voices: [] };
      ctx.audio = { context: ac, destination: world };
      try { call('ambient'); } catch (e) { warn('ambient() failed: ' + (e && e.message || e)); }
      return audio;
    }
    function tone(freq, t0, dur, type, gain, slideTo) {
      if (!audio) return; var ac = audio.ctx, o = ac.createOscillator(), g = ac.createGain();
      o.type = type || 'sine'; o.frequency.setValueAtTime(freq, ac.currentTime + t0);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ac.currentTime + t0 + dur);
      g.gain.setValueAtTime(0.0001, ac.currentTime + t0); g.gain.exponentialRampToValueAtTime(gain || 0.2, ac.currentTime + t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + t0 + dur);
      o.connect(g); g.connect(audio.fx); o.start(ac.currentTime + t0); o.stop(ac.currentTime + t0 + dur + 0.05);
    }
    function noiseBand(dur, gain, f0, f1) {
      if (!audio) return; var ac = audio.ctx, n = Math.floor(ac.sampleRate * dur), buf = ac.createBuffer(1, n, ac.sampleRate), ch = buf.getChannelData(0);
      for (var i = 0; i < n; i++) { var u = i / n; ch[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * u) * (1 - u); }
      var src = ac.createBufferSource(), g = ac.createGain(), f = ac.createBiquadFilter();
      f.type = 'bandpass'; f.Q.value = 1.2; f.frequency.setValueAtTime(f0, ac.currentTime); f.frequency.exponentialRampToValueAtTime(f1, ac.currentTime + dur);
      g.gain.value = gain; src.buffer = buf; src.connect(f); f.connect(g); g.connect(audio.fx); src.start();
    }
    function noise(dur, gain) {
      if (!audio) return; var ac = audio.ctx, n = Math.floor(ac.sampleRate * dur), buf = ac.createBuffer(1, n, ac.sampleRate), ch = buf.getChannelData(0);
      for (var i = 0; i < n; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2);
      var s = ac.createBufferSource(), g = ac.createGain(), f = ac.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 900; g.gain.value = gain || 0.6;
      s.buffer = buf; s.connect(f); f.connect(g); g.connect(audio.fx); s.start();
    }
    var SFX = {
      coin: function () { tone(988, 0, 0.08, 'square', 0.08); tone(1318, 0.06, 0.14, 'square', 0.08); },
      level: function () { if (audio && audio.music && audio.music.sting('lap') !== false) return; [523, 659, 784, 1046].forEach(function (f, i) { tone(f, i * 0.09, 0.22, 'triangle', 0.14); }); },
      tick: function (hi) { tone(hi ? 880 : 440, 0, 0.12, 'sine', 0.18); },
      crash: function () {
        noise(0.7, 0.8); tone(140, 0, 0.5, 'sawtooth', 0.25, 40);
        // a car: metal torn and glass after it
        if (P0.vehicle) { noiseBand(0.9, 0.7, 2400, 380); noiseBand(0.5, 0.5, 5200, 1800); for (var g = 0; g < 7; g++) tone(2600 + Math.random() * 3400, 0.08 + g * 0.05 + Math.random() * 0.04, 0.18, 'sine', 0.04); }
      },
      spawn: function () { tone(220, 0, 0.3, 'sawtooth', 0.08, 330); },
      // off the ground, and back on it
      jump: function () { noiseBand(0.18, 0.12, 700, 2400); tone(300, 0, 0.12, 'sine', 0.06, 520); },
      land: function () { noiseBand(0.12, 0.14, 1600, 300); tone(90, 0, 0.1, 'sine', 0.12, 55); },
      // a blade through the air, and through a rival
      swing: function () { noiseBand(0.22, 0.35, 2600, 5200); },
      slay: function () { tone(1760, 0, 0.35, 'triangle', 0.1, 1320); tone(2637, 0.005, 0.22, 'sine', 0.06); noise(0.18, 0.5); },
      // a lap's bounty: a drum and a rising chord
      bounty: function () { tone(70, 0, 0.5, 'sine', 0.5, 45); if (audio && audio.music && audio.music.sting('bounty') !== false) return; [392, 523, 659, 784, 1046].forEach(function (f, i) { tone(f, 0.08 + i * 0.07, 0.5, 'triangle', 0.12); }); },
    };

    /* --------------------------------------------------------------- ui -- */
    // the world's own font stays loaded (worlds letter their scenery with it);
    // the HUD is the platform's, the same in every world: Oxanium, on glass
    var fontLink = document.createElement('link');
    fontLink.rel = 'stylesheet';
    fontLink.href = 'https://fonts.googleapis.com/css2?family=' + encodeURIComponent(T.font).replace(/%20/g, '+') + ':wght@500;700&family=Oxanium:wght@300;400;500;600;700&display=swap';
    document.head.appendChild(fontLink);
    // a demo run is silent
    var DUCK = { crash: 9, slay: 5, swing: 2.5, coin: 2, level: 0, bounty: 0, tick: 1.5, spawn: 2 };
    Object.keys(SFX).forEach(function (k) { var f = SFX[k]; if (typeof f === 'function') SFX[k] = function () { if (demo) return; if (audio && audio.music && DUCK[k]) audio.music.duck(DUCK[k]); return f.apply(SFX, arguments); }; });
    // how much of the score plays: the start screen hears it quietly, every lap adds weight
    function musicEnergy() {
      if (demo) return -1;
      if (state === 'title') return 0;
      if (state === 'countdown') return 1;
      if (state === 'race' || state === 'paused') return level >= 3 ? 3 : level >= 2 ? 2 : 1;
      return -1;
    }
    // engine voices: yours at the front of the mix, and the two rivals nearest
    // you, panned to where they are, louder as they close, the pitch bent by
    // their speed toward or away from you
    var ENG = { pop: 0 };
    function stepEngines() {
      if (!audio || !audio.voices) return;
      var V = audio.voices, silent = demo || state === 'results' || state === 'paused';
      function voice(slot, type) {
        var v = V[slot];
        if (v && v.type !== type) { v.stop(); v = null; }
        if (!v) { try { v = V[slot] = GameMogVehicles.engine(audio.ctx, audio.engines, type); } catch (e) { return null; } }
        return v;
      }
      if (silent || typeof GameMogVehicles === 'undefined') { V.forEach(function (v) { if (v) v.mix(0, 0); }); return; }
      if (P0.vehicle) {
        var st = P0.vehicle.state, pv = voice(0, P0.vehicle.engine);
        if (pv) {
          // before the gun, blip the throttle with up
          var rpm = state === 'countdown' || state === 'title' ? (input.up ? P0.vehicle.redline * 0.7 : P0.vehicle.idle * 1.05) : st.rpm;
          pv.set(player.alive ? rpm : Math.max(P0.vehicle.idle * 0.6, st.rpm * 0.4), player.alive ? st.throttle : 0, player.v);
          // louder with the revs and the throttle: an idle burbles, a full-throttle scream fills the mix
          var rf = clamp((rpm - P0.vehicle.idle) / (P0.vehicle.redline - P0.vehicle.idle), 0, 1);
          pv.mix(player.alive ? 0.42 + 0.58 * Math.max(rf * (0.55 + 0.45 * st.throttle), 0.1) : 0.2, 0);
          if (st.pop > ENG.pop + 0.03) pv.pop(1);
          ENG.pop = st.pop;
        }
      }
      var near = rivals.filter(function (r) { return r.e.vehicle && !r.out; }).map(function (r) { return { r: r, dd: rel(r.d, player.d) }; })
        .filter(function (q) { return Math.abs(q.dd) < 90; }).sort(function (a, b) { return Math.abs(a.dd) - Math.abs(b.dd); }).slice(0, 2);
      for (var i = 0; i < 2; i++) {
        var q = near[i], v = q ? voice(i + 1, q.r.e.vehicle.engine) : V[i + 1];
        if (!v) continue;
        if (!q) { v.mix(0, 0); continue; }
        var dist = Math.hypot(q.dd, q.r.x - player.x), closing = (q.dd < 0 ? 1 : -1) * (q.r.v - player.v);
        var doppler = clamp((343 + closing) / 343, 0.8, 1.25);
        v.set((q.r.e.vehicle.state.rpm || 6000) * doppler, 0.8, q.r.v);
        v.mix(Math.pow(clamp(1 - dist / 90, 0, 1), 1.6) * 0.9, clamp((q.r.x - player.x) / 12, -0.9, 0.9));
      }
    }
    function stepMusic() {
      if (!audio || !audio.music) return;
      var me = musicEnergy(), mp = audio.music;
      if (me < 0) { if (mp.state.playing && !mp.state.stopping) mp.stop(1.6); return; }
      if (!mp.state.playing || mp.state.stopping) mp.start(state === 'title');
      mp.update(me, function (b) { emit('beat', { bar: b.bar, beat: b.beat, section: b.section }); });
    }

    // the world's accent at an alpha, for glows and tints
    function acc(a) { var n = parseInt(T.accent.slice(1), 16); return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')'; }
    // frosted glass: a dark tint under the blur keeps white type legible over
    // snow and sunlit stands alike, a hairline edge and a lit top rim
    var GLASS = 'background:linear-gradient(150deg,rgba(255,255,255,.15),rgba(255,255,255,.03) 62%) rgba(10,12,18,.34);' +
      '-webkit-backdrop-filter:blur(16px) saturate(170%);backdrop-filter:blur(16px) saturate(170%);' +
      'border:1px solid rgba(255,255,255,.2);box-shadow:inset 0 1px 0 rgba(255,255,255,.24),0 12px 32px rgba(0,0,0,.2)';
    var TOP = 'calc(14px + env(safe-area-inset-top,0px))';
    var css = document.createElement('style');
    css.textContent = [
      '#gm{position:fixed;inset:0;pointer-events:none;font-family:"Oxanium",system-ui,sans-serif;color:#F4F6FA;-webkit-font-smoothing:antialiased;font-variant-numeric:tabular-nums}',
      '@supports not ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){#gm .board,#gm .rivals,#gm .card,#gm .tpad button,#gm .pause,#gm .banner span{background-color:rgba(10,12,18,.66)!important}}',
      '#gm .board{position:absolute;top:' + TOP + ';' + GLASS + ';border-radius:16px;padding:8px 16px 9px;min-width:96px}',
      // a short lit bar in the world's colour along the top edge
      '#gm .board::before{content:"";position:absolute;left:16px;top:-1px;width:22px;height:2px;border-radius:2px;background:' + T.accent + ';box-shadow:0 0 10px ' + acc(0.9) + '}',
      '#gm .board small{display:block;font-size:10px;font-weight:500;letter-spacing:.26em;text-transform:uppercase;opacity:.64}',
      '#gm .board b{display:block;font-size:30px;line-height:1.08;font-weight:400;letter-spacing:.02em;text-shadow:0 1px 14px rgba(0,0,0,.35)}',
      '#gm .lvl{left:14px}#gm .time{left:50%;transform:translateX(-50%);text-align:center}#gm .time::before{left:50%;margin-left:-11px}',
      // the speedometer: bottom centre on a screen, above the thumbs on a phone
      '#gm .speed{top:auto;bottom:calc(18px + env(safe-area-inset-bottom,0px));left:50%;transform:translateX(-50%);display:grid;grid-template-columns:auto auto;align-items:end;column-gap:10px;min-width:170px;padding:8px 16px 9px}',
      '#gm .speed::before{left:50%;margin-left:-11px}',
      '#gm .speed .bar{grid-column:1/3;height:3px;border-radius:2px;background:rgba(255,255,255,.14);overflow:hidden;margin-bottom:6px}',
      '#gm .speed .bar i{display:block;height:100%;width:0;background:' + T.accent + ';box-shadow:0 0 10px ' + acc(0.9) + '}',
      '#gm .speed.red .bar i{background:#FF4D4D;box-shadow:0 0 12px rgba(255,77,77,.9)}',
      '#gm .speed b{font-size:40px;line-height:1;font-weight:500}#gm .speed small{align-self:end;padding-bottom:4px}',
      '#gm .speed em{position:absolute;right:14px;top:14px;font-style:normal;font-size:13px;font-weight:600;letter-spacing:.1em;opacity:.8}',
      '@media (pointer:coarse){#gm .speed{bottom:calc(104px + env(safe-area-inset-bottom,0px));min-width:130px}#gm .speed b{font-size:30px}}',
      '#gm.demo .speed{display:none!important}',
      '#gm .gm{right:14px;display:flex;align-items:center;gap:10px}#gm .gm::before{left:auto;right:16px}',
      '#gm .gm i{width:26px;height:26px;border-radius:50%;background:radial-gradient(circle at 36% 32%,#FFF4C2,#F6C33B 52%,#B97A12);border:1px solid rgba(255,226,150,.9);box-shadow:0 0 14px rgba(246,195,59,.45);display:flex;align-items:center;justify-content:center;font:700 9px "Oxanium",sans-serif;letter-spacing:.02em;color:#5E3805;font-style:normal}',
      '#gm .rivals{position:absolute;top:calc(88px + env(safe-area-inset-top,0px));left:14px;' + GLASS + ';border-radius:999px;padding:5px 13px 5px 11px;font-size:12px;font-weight:500;letter-spacing:.08em}',
      '#gm .rivals::before{content:"";display:inline-block;width:6px;height:6px;border-radius:50%;background:' + T.accent + ';box-shadow:0 0 8px ' + acc(0.9) + ';margin-right:8px;vertical-align:1px}',
      '#gm .warn{position:absolute;bottom:22%;font-size:13px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;white-space:nowrap;padding:9px 15px;border-radius:12px;opacity:0;' +
        'background:linear-gradient(90deg,' + acc(0.55) + ',' + acc(0.16) + ') rgba(10,12,18,.3);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);border:1px solid ' + acc(0.85) + ';box-shadow:0 0 24px ' + acc(0.35) + '}',
      // max-content: centred from the middle, it would otherwise get half the screen to wrap in
      '#gm .banner{position:absolute;left:50%;top:24%;transform:translate(-50%,-50%);width:max-content;max-width:92vw;text-align:center;opacity:0;transition:none}',
      '#gm .banner b{display:block;font-size:64px;line-height:1;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:#fff;text-shadow:0 0 28px ' + acc(0.7) + ',0 2px 18px rgba(0,0,0,.45)}',
      '#gm .banner span{display:inline-block;max-width:min(560px,88vw);margin-top:12px;font-size:15px;line-height:1.4;font-weight:500;letter-spacing:.03em;' + GLASS + ';border-radius:18px;padding:7px 16px}',
      '#gm .banner.prize b{font-size:78px;background:linear-gradient(180deg,#FFF6D0,#F6C33B 55%,#C98A18);-webkit-background-clip:text;background-clip:text;color:transparent;text-shadow:none;filter:drop-shadow(0 0 22px rgba(246,195,59,.55)) drop-shadow(0 2px 10px rgba(0,0,0,.4))}',
      '#gm .screen{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:radial-gradient(ellipse at center,rgba(6,8,14,.18),rgba(6,8,14,.5));pointer-events:auto}',
      '#gm .card{' + GLASS + ';background-color:rgba(12,14,22,.46);-webkit-backdrop-filter:blur(22px) saturate(170%);backdrop-filter:blur(22px) saturate(170%);border-radius:24px;padding:26px 30px;max-width:min(560px,90vw);text-align:center}',
      '#gm .card h1{margin:0;font-size:clamp(32px,5.5vw,54px);line-height:1.02;font-weight:600;letter-spacing:.02em;color:#fff;text-shadow:0 0 30px ' + acc(0.5) + '}',
      '#gm .card p{margin:10px 0 0;font-size:16px;line-height:1.5;font-weight:400;opacity:.86}',
      '#gm .card .rules{margin-top:16px;font-size:14px;line-height:1.5;text-align:left;display:grid;gap:8px;opacity:.9}',
      '#gm .card kbd{display:inline-block;min-width:24px;padding:2px 7px;border:1px solid rgba(255,255,255,.28);border-radius:7px;font:600 12px "Oxanium",sans-serif;text-align:center;background:rgba(255,255,255,.1);color:#fff;box-shadow:inset 0 -1px 0 rgba(255,255,255,.12)}',
      '#gm .card .go{display:inline-block;margin-top:18px;padding:10px 22px;border-radius:999px;font-size:13px;font-weight:600;letter-spacing:.22em;text-transform:uppercase;color:#fff;background:' + acc(0.3) + ';border:1px solid ' + acc(0.9) + ';box-shadow:0 0 22px ' + acc(0.35) + '}',
      '#gm .card .stats{display:flex;gap:30px;justify-content:center;margin-top:16px}',
      '#gm .card .stats b{display:block;font-size:32px;font-weight:400}#gm .card .stats small{font-size:10px;font-weight:500;letter-spacing:.24em;text-transform:uppercase;opacity:.64}',
      '#gm .count{position:absolute;left:50%;top:40%;transform:translate(-50%,-50%);white-space:nowrap;font-size:132px;font-weight:300;letter-spacing:.02em;color:#fff;text-shadow:0 0 40px ' + acc(0.6) + ',0 4px 30px rgba(0,0,0,.35)}',
      // touch, the same in every world (Zombie Beach's, the owner, 30 Sep): a
      // stick wherever the left thumb lands, round buttons on the right
      '#gm .stick{position:absolute;left:0;bottom:0;width:50%;height:60%;pointer-events:auto;touch-action:none;display:none}',
      '#gm .stick i{position:absolute;width:110px;height:110px;margin:-55px 0 0 -55px;border-radius:50%;border:2px solid rgba(255,255,255,.35);display:none}',
      '#gm .stick i b{position:absolute;left:50%;top:50%;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;background:rgba(255,255,255,.55)}',
      '#gm .tpad{position:absolute;right:calc(18px + env(safe-area-inset-right,0px));bottom:calc(22px + env(safe-area-inset-bottom,0px));display:none;gap:14px;align-items:flex-end;pointer-events:auto}',
      '#gm .tpad button{width:76px;height:76px;border-radius:50%;' + GLASS + ';color:#fff;font:700 13px Oxanium,system-ui;letter-spacing:.08em;touch-action:none;-webkit-tap-highlight-color:transparent}',
      '#gm .tpad button.big{width:96px;height:96px;font-size:15px}',
      '#gm .tpad button.on{background-color:' + acc(0.45) + '}',
      // the sword rides above up and down, under the right thumb
      '#gm .feed{position:absolute;left:50%;bottom:30%;transform:translateX(-50%);font-size:16px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:#fff;text-shadow:0 0 16px ' + acc(0.8) + ',0 1px 8px rgba(0,0,0,.6);opacity:0;white-space:nowrap}',
      '#gm.demo .feed{display:none!important}',
      '#gm .pause{position:absolute;top:calc(88px + env(safe-area-inset-top,0px));right:14px;width:46px;height:46px;border-radius:50%;' + GLASS + ';color:#fff;display:none;align-items:center;justify-content:center;pointer-events:auto}',
      '@media (pointer:coarse){#gm .tpad{display:flex}#gm .stick{display:block}#gm .pause{display:flex}}',
      '#gm.touch .tpad{display:flex}#gm.touch .stick{display:block}#gm.touch .pause{display:flex}',
      // phones: three boards across a narrow top edge
      '@media (max-width:440px){#gm .board{min-width:0;padding:6px 12px 7px;border-radius:14px}#gm .board b{font-size:24px}#gm .board small{font-size:9px;letter-spacing:.22em}#gm .rivals{top:calc(74px + env(safe-area-inset-top,0px))}#gm .pause{top:calc(74px + env(safe-area-inset-top,0px))}#gm .banner b{font-size:44px}#gm .banner.prize b{font-size:54px}#gm .count{font-size:104px}}',
      // attract: the world races itself with nothing over it
      '#gm .tapstart{position:absolute;inset:0;display:none;pointer-events:auto;cursor:pointer}',
      '#gm.demo .tapstart{display:block}',
      '#gm.demo .board,#gm.demo .rivals,#gm.demo .warn,#gm.demo .banner,#gm.demo .tpad,#gm.demo .pause{display:none!important}',
      // pause and results: a bar along the bottom, the world still in view
      '#gm .screen.bar{align-items:flex-end;padding-bottom:calc(22px + env(safe-area-inset-bottom,0px));background:linear-gradient(0deg,rgba(6,8,14,.4),transparent 45%)}',
      '#gm .screen.bar .card{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:10px 24px;padding:12px 22px;border-radius:20px;max-width:min(820px,94vw)}',
      '#gm .screen.bar .card h1{font-size:26px}#gm .screen.bar .card p{margin:0;font-size:14px}',
      '#gm .screen.bar .card .stats{margin:0;gap:20px}#gm .screen.bar .card .stats b{font-size:22px}',
      '#gm .screen.bar .card .go{margin:0;padding:8px 16px;font-size:12px}',
    ].join('\n');
    document.head.appendChild(css);

    function el(tag, cls, html, parent) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; (parent || root).appendChild(e); return e; }
    function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    var root = document.createElement('div'); root.id = 'gm'; document.body.appendChild(root);
    if ('ontouchstart' in window) root.classList.add('touch');
    var hudLvl = el('div', 'board lvl', '<small>Level</small><b>1</b>');
    var hudTime = el('div', 'board time', '<small>Time</small><b>0:00</b>');
    var hudGm = el('div', 'board gm', '<i>GM</i><div><small>GM</small><b>0</b></div>');
    var hudRivals = el('div', 'rivals', '');
    var hudWarn = el('div', 'warn', '');
    var banner = el('div', 'banner', '<b></b><span></span>');
    var countEl = el('div', 'count', '');
    var feed = el('div', 'feed', ''), feedT = 0;
    // a car's dash: speed and gear, on the same glass
    var hudSpeed = PLAY.vehicle ? el('div', 'board speed', '<div class="bar"><i></i></div><b>0</b><small>km/h</small><em>N</em>') : null;
    if (hudSpeed) hudSpeed.style.display = 'none';
    var speedN = 0;
    function stepHudSpeed() {
      if (!hudSpeed || !P0.vehicle) return;
      var show = !demo && (state === 'race' || state === 'countdown' || state === 'crashed');
      hudSpeed.style.display = show ? '' : 'none';
      if (!show || (speedN++ % 3)) return;
      var st = P0.vehicle.state, kmh = Math.round(player.alive && state === 'race' ? player.v * 3.6 : 0);
      hudSpeed.querySelector('b').textContent = kmh;
      hudSpeed.querySelector('em').textContent = kmh < 1 ? 'N' : String(st.gear);
      hudSpeed.querySelector('.bar i').style.width = Math.round(clamp((st.rpm - P0.vehicle.idle) / (P0.vehicle.redline - P0.vehicle.idle), 0, 1) * 100) + '%';
      hudSpeed.classList.toggle('red', st.rpm > P0.vehicle.redline * 0.94);
    }
    function say(text) { feed.textContent = text; feedT = 1.4; }
    [hudLvl, hudTime, hudGm, hudRivals].forEach(function (e) { e.style.display = 'none'; });

    var CHEV = {
      left: '<svg width="34" height="34" viewBox="0 0 20 20" fill="currentColor"><path d="M12.8 3.6L6.4 10l6.4 6.4 1.6-1.6L9.6 10l4.8-4.8z"/></svg>',
      right: '<svg width="34" height="34" viewBox="0 0 20 20" fill="currentColor"><path d="M7.2 3.6L13.6 10l-6.4 6.4-1.6-1.6 4.8-4.8-4.8-4.8z"/></svg>',
      up: '<svg width="34" height="34" viewBox="0 0 20 20" fill="currentColor"><path d="M3.6 12.8L10 6.4l6.4 6.4-1.6 1.6L10 9.6l-4.8 4.8z"/></svg>',
      down: '<svg width="34" height="34" viewBox="0 0 20 20" fill="currentColor"><path d="M3.6 7.2L10 13.6l6.4-6.4-1.6-1.6L10 10.4 5.2 5.6z"/></svg>',
      pause: '<svg width="22" height="22" viewBox="0 0 20 20" fill="currentColor"><path d="M5 3h3.5v14H5zM11.5 3H15v14h-3.5z"/></svg>',
    };
    // Touch (the owner, 30 Sep: "the controls should be consistent on mobile
    // for all games with Zombie Beach as the master ... the buttons on the far
    // right can change per game"): a stick wherever the left thumb lands, and
    // round buttons on the right, the main one biggest and furthest right.
    // An open world names its own (open.js); a race has its pace, and a sword.
    var TK = { jx: 0, jy: 0, on: false, move: null };
    var stick = el('div', 'stick', '<i><b></b></i>'), ring = stick.querySelector('i'), knob = ring.querySelector('b'), sid = null, s0 = null;
    stick.addEventListener('pointerdown', function (e) { e.preventDefault(); ensureAudio(); if (demo) { showStart(); return; } sid = e.pointerId; s0 = { x: e.clientX, y: e.clientY }; ring.style.display = 'block'; ring.style.left = e.clientX + 'px'; ring.style.top = (e.clientY - stick.getBoundingClientRect().top) + 'px'; try { stick.setPointerCapture(sid); } catch (x) {} });
    stick.addEventListener('pointermove', function (e) {
      if (e.pointerId !== sid) return;
      var dx = e.clientX - s0.x, dy = e.clientY - s0.y, d = Math.hypot(dx, dy), m = Math.min(d, 48);
      TK.jx = d ? dx / d * m / 48 : 0; TK.jy = d ? dy / d * m / 48 : 0; TK.on = true;
      knob.style.transform = 'translate(' + TK.jx * 32 + 'px,' + TK.jy * 32 + 'px)';
      if (TK.move) TK.move();
    });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (ev) { stick.addEventListener(ev, function () { sid = null; TK.on = false; TK.jx = TK.jy = 0; ring.style.display = 'none'; knob.style.transform = ''; if (TK.move) TK.move(); }); });
    var tpad = el('div', 'tpad', '');
    function tbtn(label, cls, fn) {
      var b = el('button', cls, label, tpad);
      b.addEventListener('pointerdown', function (e) { e.preventDefault(); ensureAudio(); if (demo) { showStart(); return; } b.classList.add('on'); fn(true); });
      ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) { b.addEventListener(ev, function () { b.classList.remove('on'); fn(false); }); });
      return b;
    }
    // a race: the stick steers, and pushed up or down sets the pace; the
    // buttons hold the pace, and swing the sword in a world that has one
    var held = { up: false, down: false };
    function raceTouch() {
      input.left = TK.jx < -0.3; input.right = TK.jx > 0.3;
      input.up = held.up || TK.jy < -0.45; input.down = held.down || TK.jy > 0.45;
    }
    TK.move = raceTouch;
    // the far right: the pace, and the jump big (with a sword, the stick sets
    // the pace alone and the sword is biggest)
    if (!PLAY.combat) tbtn(PLAY.vehicle ? 'BRAKE' : 'SLOW', '', function (on) { held.down = on; raceTouch(); });
    tbtn(PLAY.vehicle ? 'GAS' : 'SPRINT', '', function (on) { held.up = on; raceTouch(); });
    tbtn('JUMP', PLAY.combat ? '' : 'big', function (on) { if (on) jump(); });
    if (PLAY.combat) tbtn('SLASH', 'big', function (on) { if (on) swing(); });
    var pauseBtn = el('button', 'pause', CHEV.pause); pauseBtn.setAttribute('aria-label', 'pause');
    pauseBtn.addEventListener('click', function () { togglePause(); });

    var screen = null;
    function showScreen(html, onGo, variant) {
      hideScreen();
      screen = el('div', 'screen' + (variant ? ' ' + variant : ''), '<div class="card">' + html + '</div>');
      screen.addEventListener('pointerdown', function (e) { e.preventDefault(); ensureAudio(); onGo(); });
      screen._go = onGo;
    }
    function hideScreen() { if (screen) { screen.remove(); screen = null; } }

    var CONTROLS = '<div class="rules">' +
      '<div><kbd>&larr;</kbd> <kbd>&rarr;</kbd> steer &nbsp; <kbd>&uarr;</kbd> faster &nbsp; <kbd>&darr;</kbd> slower' + (PLAY.combat ? ' &nbsp; <kbd>X</kbd> sword' : '') + ' &nbsp; <kbd>Space</kbd> jump &nbsp; <kbd>P</kbd> pause</div>' +
      '<div>Jump anything lower than you (hurdles, barriers, logs); steer round anything taller.</div>' +
      '<div>Endless laps. One rival lines up beside you; every lap another joins at the line, and everyone ' + (PLAY.vehicle ? 'drives' : 'runs') + ' faster and meaner.</div>' +
      (PLAY.combat ? '<div>Cut a rival down before it touches you: a rival you cut falls, and runs again next lap. Touch one standing, or an obstacle, and your run is over.</div>'
        : '<div>Touch a rival or an obstacle and your run is over.' + (PLAY.coins ? ' Grab the golden GM.' : '') + '</div>') +
      (PLAY.bounty ? '<div>Every lap you finish pays a GM bounty, bigger every lap.</div>' : '') + '</div>';

    // attract (the owner, 23 Sep): until someone asks to play, the world races
    // itself with nothing over it, so a visitor sees the game. A demo run
    // steers itself, cannot crash, makes no sound, is never scored or posted,
    // and starts over every few laps. The start screen (you and one rival on
    // the line, the controls, "Enter or tap to start") appears only when
    // someone asks: the page's Play button, or a tap or a key on the demo.
    var demo = false, resultsT = 0;
    var tapStart = el('div', 'tapstart');
    tapStart.addEventListener('pointerdown', function (e) { if (!demo) return; e.preventDefault(); ensureAudio(); showStart(); });
    function startDemo() {
      hideScreen(); reset();
      demo = true; state = 'race'; root.classList.add('demo');
    }
    function showStart() {
      demo = false; root.classList.remove('demo');
      reset(); state = 'title';
      showScreen('<h1>' + esc(meta.title || 'GameMog') + '</h1>' + (meta.tagline ? '<p>' + esc(meta.tagline) + '</p>' : '') + CONTROLS + '<div class="go">Enter or tap to start</div>', startCountdown);
    }

    /* ------------------------------------------------------------ input -- */
    var input = { left: false, right: false, up: false, down: false };
    var KEYMAP = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down' };
    var CUTKEYS = { KeyX: 1, KeyJ: 1, KeyK: 1 };
    window.addEventListener('keydown', function (e) {
      if (OPEN) return;   // an open world reads its own keys
      if (demo && (KEYMAP[e.code] || e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyR' || (PLAY.combat && CUTKEYS[e.code]))) {
        e.preventDefault(); ensureAudio(); if (!e.repeat) showStart(); return;
      }
      var k = KEYMAP[e.code];
      if (k) { input[k] = true; e.preventDefault(); ensureAudio(); return; }
      if (PLAY.combat && CUTKEYS[e.code]) { e.preventDefault(); ensureAudio(); if (!e.repeat) swing(); return; }
      // Space jumps (it paused, before the jump); P or Esc pauses
      if (e.code === 'Space' && state === 'race' && !screen) { e.preventDefault(); ensureAudio(); if (!e.repeat) jump(); return; }
      if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyP' || e.code === 'Escape' || e.code === 'KeyR') {
        e.preventDefault(); ensureAudio();
        if (e.repeat) return;
        if (screen && (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyR')) { screen._go(); return; }
        if (state === 'race' || state === 'paused') { if (e.code === 'KeyP' || e.code === 'Escape') togglePause(); }
      }
    });
    window.addEventListener('keyup', function (e) { var k = KEYMAP[e.code]; if (k) input[k] = false; });
    window.addEventListener('blur', function () { input.left = input.right = input.up = input.down = false; if (state === 'race' && !demo) togglePause(); });
    document.addEventListener('visibilitychange', function () { if (document.hidden && state === 'race' && !demo) togglePause(); });

    /* ------------------------------------------------------------ state -- */
    var state = 'title', paused = false;
    var runRandom = mulberry((Date.now() ^ hashStr(meta.title || '')) >>> 0);
    var player = { d: 0, x: 0, v: 0, vx: 0, alive: true, y: 0, vy: 0, buf: 0 };
    var rivals = [];
    var level = 1, gm = 0, raceTime = 0, countdown = 0, crashT = 0, bannerT = 0, shake = 0, assisted = false;
    // combat: the current swing, cut rivals so far, and a hit's brief freeze
    var cut = { t: -1, n: 0, last: -9 }, slain = 0, hitstop = 0;
    var crashedInto = '';
    var autopilot = false, timeScale = 1, invincible = false, fixedStep = 0;
    // a recording's camera (debug.film): closer and lower than play, for the homepage film; never set in play
    var film = null;

    function layCoins() {
      coins.length = 0;
      if (!PLAY.coins) { coinMesh.visible = false; syncCoins(0); return; }
      var groups = Math.max(4, Math.round(L / R.coinGroupEvery));
      for (var g = 0; g < groups; g++) {
        var d0 = R.startClear + ((g + runRandom() * 0.7) / groups) * (L - R.startClear - 20);
        var pattern = Math.floor(runRandom() * 3), x0 = (runRandom() * 2 - 1) * (hw - 1.4);
        for (var c = 0; c < R.coinsPerGroup && coins.length < MAX_COINS; c++) {
          var d = d0 + c * R.coinSpacing, x;
          if (pattern === 0) x = x0;
          else if (pattern === 1) x = x0 + Math.sin(c * 1.1) * 2.2;
          else x = x0 + (c - 2) * 1.1;
          x = clamp(x, -hw + 1, hw - 1);
          var blocked = obstacles.some(function (o) { return Math.abs(rel(o.d, d)) < o.radius + 1.6 * VS && Math.abs(o.x0 - x) < o.radius + (o.move ? o.move.amp : 0) + 1.2; });
          if (!blocked) coins.push({ d: wrapD(d), x: x, taken: false });
        }
      }
      syncCoins(0);
    }
    var ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
    function syncCoins(t) {
      for (var n = 0; n < MAX_COINS; n++) {
        var c = coins[n];
        if (!c || c.taken) { coinMesh.setMatrixAt(n, ZERO); continue; }
        place(DUMMY, c.d, c.x, 1.25 + Math.sin(t * 3 + n) * 0.18, t * 3 + n * 0.4);
        DUMMY.scale.set(1, 1, 1); DUMMY.updateMatrix(); coinMesh.setMatrixAt(n, DUMMY.matrix);
      }
      coinMesh.instanceMatrix.needsUpdate = true;
    }

    // Rivals join at the start line: a lane of their own, clear of you and of
    // anyone else crossing the line, at a standing or rolling start.
    function spawnRival(k, atD, v0) {
      var e = makeRival(k), Rr = e.radius, best = 0, bestScore = -Infinity;
      for (var s = 0; s <= 20; s++) {
        var x = -hw + Rr + 0.2 + (2 * hw - 2 * Rr - 0.4) * s / 20;
        var room = Math.abs(x - player.x) - (Rr + P0.radius);
        for (var j = 0; j < rivals.length; j++) if (Math.abs(rel(rivals[j].d, atD)) < 8 * VS) room = Math.min(room, Math.abs(x - rivals[j].x) - (Rr + rivals[j].e.radius));
        var score = Math.min(room, 2.6) + runRandom() * 0.3;
        if (score > bestScore) { bestScore = score; best = x; }
      }
      var r = {
        k: k, e: e, ratio: R.rivalSpeed(k, level), aggro: R.rivalAggression(k, level),
        d: atD, d0: atD, x: best, vx: 0, v: v0 || 0, grace: R.joinGrace,
        pref: best, wf: 0.35 + runRandom() * 0.5, ph: runRandom() * 6.28,
        out: false, outT: 0, cutT: -1, cutN: 0, cutNext: 0,
      };
      e.object.visible = true;
      if (e.model) e.model.rotation.set(0, 0, 0);
      scene.add(e.object);
      placeBody(e, r.d, r.x, 0);
      rivals.push(r);
      return r;
    }
    // in a combat world, a mark over a rival in the sword's reach: now
    var markTex = null;
    function markFor(e) {
      if (e.mark || !PLAY.combat) return e.mark;
      markTex = markTex || canvasTexture(128, 128, function (g, w, h) {
        g.font = '900 96px "Hiragino Mincho ProN", "Noto Serif CJK JP", "Songti SC", serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.lineWidth = 12; g.strokeStyle = 'rgba(12,8,6,0.9)'; g.strokeText(PLAY.combat.mark, w / 2, h / 2 + 4);
        g.fillStyle = '#E8332A'; g.fillText(PLAY.combat.mark, w / 2, h / 2 + 4);
      });
      e.mark = new THREE.Sprite(new THREE.SpriteMaterial({ map: markTex, transparent: true, depthTest: false, opacity: 0 }));
      e.mark.scale.setScalar(0.62); e.mark.position.set(0, (e.height || 1.9) + 0.45, 0); e.mark.renderOrder = 10;
      e.object.add(e.mark);
      return e.mark;
    }
    function cruise() { return R.baseSpeed * R.pace(level); }
    function rivalTarget(r) { return cruise() * r.ratio; }
    // a new lap: everyone on the track, and the obstacles, pick up the pace
    function setPace() {
      rivals.forEach(function (r) { r.ratio = R.rivalSpeed(r.k, level); r.aggro = R.rivalAggression(r.k, level); });
      var w = R.obstaclePace(level);
      HZ.base.concat(HZ.extra).forEach(function (o) { if (o.move) o.w = Math.PI * 2 / o.move.period * w; });
    }

    function reset() {
      rivals.forEach(function (r) { scene.remove(r.e.object); });
      rivals = [];
      player.d = 0; player.x = 0; player.v = 0; player.vx = 0; player.alive = true; player.y = 0; player.vy = 0; player.buf = 0;
      level = 1; gm = 0; raceTime = 0; crashT = 0; bannerT = 0; crashedInto = ''; assisted = autopilot || timeScale !== 1;
      cut.t = -1; cut.last = -9; cut.n = 0; slain = 0; hitstop = 0;
      resetHazards();
      obstacles.forEach(function (o) { if (o.move) o.ph = o.move.phase; });
      setPace();
      layCoins();
      // one competitor on the start line beside you, standing, from the gun
      spawnRival(1, 0, 0);
      updateHud();
    }

    function startCountdown() {
      demo = false; root.classList.remove('demo');
      // the demo steered with the same controls: a run starts with hands off
      input.left = input.right = input.up = input.down = false;
      hideScreen(); reset();
      state = 'countdown'; countdown = 3; emit('start', {});
      [hudLvl, hudTime, hudGm, hudRivals].forEach(function (e) { e.style.display = ''; });
      SFX.tick(false);
    }
    function togglePause() {
      if (state === 'race') { state = 'paused'; paused = true; if (audio) audio.ctx.suspend(); showScreen('<h1>Paused</h1><p>Level ' + level + ', ' + gm + ' GM' + (PLAY.combat ? ', ' + slain + ' cut down' : '') + '</p><div class="go">P, Space or tap to carry on</div>', togglePause, 'bar'); }
      else if (state === 'paused') { hideScreen(); state = 'race'; paused = false; if (audio) audio.ctx.resume(); }
    }
    function levelUp() {
      var lap = level, pay = PLAY.bounty ? PLAY.bounty.base + PLAY.bounty.step * (lap - 1) : 0;
      level++;
      setPace();
      layHazards();
      if (pay) gm += pay;
      // rivals cut down last lap run again from the line, behind the newcomer
      var fallen = rivals.filter(function (x) { return x.out; });
      fallen.forEach(function (x) { scene.remove(x.e.object); rivals.splice(rivals.indexOf(x), 1); });
      // the newcomer joins at the line as you cross it: a few metres past it,
      // where the chase camera can see it arrive, at your speed or its own
      var r = spawnRival(level, player.d + R.joinAhead, Math.min(player.v, cruise() * R.rivalSpeed(level, level)));
      fallen.forEach(function (x, i) { spawnRival(x.k, player.d + R.joinAhead - (3 + i * 3.5) * VS, Math.min(player.v, cruise() * R.rivalSpeed(x.k, level))); });
      layCoins();
      banner.classList.toggle('prize', !!pay);
      banner.querySelector('b').textContent = pay ? '+' + pay + ' GM' : 'Level ' + level;
      banner.querySelector('span').textContent = pay ? PLAY.bounty.name + ' for lap ' + lap + '. ' + r.e.name + ' joins at the line.'
        : r.e.name + ' joins at the line. Everyone speeds up.';
      bannerT = pay ? 3 : 2.4; SFX.level(); SFX.spawn(); if (pay) SFX.bounty();
      emit('lap', { lap: lap, level: level, bounty: pay, gm: gm });
      updateHud();
    }
    // a swing of the sword: a cut between R.swingHit[0] and [1] seconds
    // from now, a combo of up to three different cuts when pressed in rhythm
    function swing() {
      if (!PLAY.combat || state !== 'race' || !player.alive) return;
      if (raceTime - cut.last < R.swingCooldown) return;
      cut.n = raceTime - cut.last < R.swingLength + 0.4 ? (cut.n + 1) % 3 : 0;
      cut.t = 0; cut.last = raceTime;
      SFX.swing(); emit('swing', { n: cut.n });
    }
    // off the ground: a jump pressed in the air is kept for a moment, and taken on landing
    function jump() {
      if (state !== 'race' || !player.alive) return;
      if (player.y > 0.001) { player.buf = 0.14; return; }
      player.vy = JUMP.v0; player.y = 0.001; player.buf = 0;
      SFX.jump(); emit('jump', {});
    }
    // up and back down under the world's gravity for a jump; true on the landing
    function stepAir(b, dt) {
      if (!(b.y > 0) && !(b.vy > 0)) return false;
      b.vy -= JUMP.g * dt; b.y += b.vy * dt;
      if (b.y <= 0) { b.y = 0; b.vy = 0; return true; }
      return false;
    }
    function inReach(r) {
      var dd = rel(r.d, player.d);
      return !r.out && dd > -R.swingBehind && dd < R.swingReach + r.e.radius && Math.abs(r.x - player.x) < R.swingWidth + r.e.radius * 0.5;
    }
    function stepCut(dt) {
      if (cut.t < 0) return;
      cut.t += dt;
      if (cut.t >= R.swingHit[0] && cut.t <= R.swingHit[1]) {
        for (var i = 0; i < rivals.length; i++) if (inReach(rivals[i])) slay(rivals[i]);
      }
      if (cut.t > R.swingLength) cut.t = -1;
    }
    function slay(r) {
      r.out = true; r.outT = 0; slain++;
      hitstop = 0.07; shake = Math.max(shake, 0.35);
      SFX.slay();
      var at = pointAt(r.d, r.x, 1.3);
      burst(at, '#FFF1C8', 22);
      say(PLAY.combat.verb + ' ' + r.e.name);
      emit('slay', { name: r.e.name, slain: slain });
      updateHud();
    }
    function crash(who) {
      if (!player.alive) return;
      player.alive = false; state = 'crashed'; crashT = 0; shake = 1; crashedInto = who;
      SFX.crash(); burst(pointAt(player.d, player.x, 1), '#E9DCC8', 40);
      emit('crash', { into: who });
    }
    function showResults() {
      state = 'results'; resultsT = 0;
      var t = Math.floor(raceTime);
      showScreen(
        '<h1>Level ' + level + '</h1><p>' + (crashedInto ? 'You hit ' + esc(crashedInto) + '.' : 'Run over.') + '</p>' +
        '<div class="stats"><div><b>' + level + '</b><small>Level</small></div><div><b>' + gm + '</b><small>GM</small></div>' + (PLAY.combat ? '<div><b>' + slain + '</b><small>Cut down</small></div>' : '') + '<div><b>' + Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0') + '</b><small>Time</small></div></div>' +
        '<div class="go">Enter, Space or tap to go again</div>', startCountdown, 'bar');
      try { GM.finish({ won: false, place: 0, timeMs: Math.round(raceTime * 1000), score: level * 1000 + gm, level: level, gm: gm, assisted: assisted }); } catch (e) {}
    }
    function updateHud() {
      hudLvl.querySelector('b').textContent = level;
      hudGm.querySelector('b').textContent = gm;
      var standing = rivals.filter(function (r) { return !r.out; }).length;
      hudRivals.textContent = (standing === 1 ? '1 rival' : standing + ' rivals') + (PLAY.combat ? ', ' + slain + ' cut down' : '');
    }

    // particles
    var partGeo = new THREE.BufferGeometry(), PMAX = 240, pPos = new Float32Array(PMAX * 3), pVel = new Float32Array(PMAX * 3), pLife = new Float32Array(PMAX), pNext = 0;
    partGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    // soft round puffs, not squares: they have to survive a cinematic renderer
    var puff = canvasTexture(64, 64, function (g, w, h) { var r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.45, 'rgba(255,255,255,0.55)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, w, h); });
    var parts = new THREE.Points(partGeo, new THREE.PointsMaterial({ size: 0.22, map: puff, color: '#FFE070', transparent: true, depthWrite: false, alphaTest: 0.02 }));
    parts.frustumCulled = false; scene.add(parts);
    function burst(p, color, n) {
      parts.material.color.set(color);
      for (var i = 0; i < n; i++) {
        var j = pNext++ % PMAX;
        pPos[j * 3] = p.x; pPos[j * 3 + 1] = p.y; pPos[j * 3 + 2] = p.z;
        pVel[j * 3] = (Math.random() - 0.5) * 9; pVel[j * 3 + 1] = Math.random() * 7 + 2; pVel[j * 3 + 2] = (Math.random() - 0.5) * 9;
        pLife[j] = 0.8 + Math.random() * 0.5;
      }
    }
    function stepParticles(dt) {
      for (var i = 0; i < PMAX; i++) {
        if (pLife[i] <= 0) { pPos[i * 3 + 1] = -9999; continue; }
        pLife[i] -= dt; pVel[i * 3 + 1] -= 14 * dt;
        pPos[i * 3] += pVel[i * 3] * dt; pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt; pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
      }
      partGeo.attributes.position.needsUpdate = true;
    }

    /* --------------------------------------------------------- the race -- */
    // a moving obstacle's phase accumulates, so its tempo can rise lap by lap
    // without a jump; tq may be ahead of now, for anyone predicting it
    function obstacleX(o, tq) { return o.move ? clamp(o.x0 + Math.sin(o.ph + (tq - t) * o.w) * o.move.amp, -hw + o.radius, hw - o.radius) : o.x0; }

    // two footprints touch: rounded boxes, `radius` across the track and
    // `half` along it (a runner's is a circle, a car's a long rounded box)
    function touching(dd, dx, ra, ha, rb, hb) {
      var c = Math.min(ra + rb, ha + hb), ex = Math.max(0, Math.abs(dd) - (ha + hb - c)), ez = Math.max(0, Math.abs(dx) - (ra + rb - c));
      return ex * ex + ez * ez < c * c * 0.92;
    }
    // the only way to die: touching a rival or an obstacle
    function collide(t) {
      var pr = P0.radius, ph = P0.half;
      for (var i = 0; i < obstacles.length; i++) {
        var o = obstacles[i], dd = rel(o.d, player.d);
        if (Math.abs(dd) > o.half + ph + 0.5) continue;
        if (player.y > o.top - 0.05) continue;   // cleared
        // in the air, it is only as deep as it really is (rising to it or coming down past it)
        if (touching(dd, obstacleX(o, t) - player.x, o.radius, player.y > 0.02 ? Math.min(o.half, o.deep + 0.1) : o.half, pr, ph)) return 'an obstacle';
      }
      for (var j = 0; j < rivals.length; j++) {
        var r = rivals[j], dd2 = rel(r.d, player.d);
        if (r.out || Math.abs(dd2) > r.e.half + ph + 0.5) continue;
        if (player.y > (r.e.height || 1.8) - 0.05 || (r.y || 0) > (P0.height || 1.8) - 0.05) continue;   // one over the other
        if (touching(dd2, r.x - player.x, r.e.radius, r.e.half, pr, ph)) return r.e.name;
      }
      return null;
    }

    function freeLateral(fromD, lookAhead, radius, t, ignoreRival) {
      // lateral positions blocked within lookAhead metres ahead of fromD
      var spans = [];
      obstacles.forEach(function (o) { if (ignoreRival !== undefined && jumpable(o)) return; var dd = rel(o.d, fromD); if (dd > -2 && dd < lookAhead) { var ox = obstacleX(o, t + dd / cruise()); spans.push([ox - o.radius - radius - 0.4, ox + o.radius + radius + 0.4, dd]); } });
      if (ignoreRival !== undefined) rivals.forEach(function (r) { if (r === ignoreRival || r.out) return; var dd = rel(r.d, fromD); if (dd > -6 * VS && dd < lookAhead * 0.6) spans.push([r.x - r.e.radius - radius - 0.5, r.x + r.e.radius + radius + 0.5, dd]); });
      return spans;
    }
    function bestX(spans, want, radius) {
      var best = want, cost = Infinity;
      for (var s = 0; s <= 24; s++) {
        var x = -hw + radius + (2 * hw - 2 * radius) * s / 24, c = Math.abs(x - want) * 0.4;
        for (var i = 0; i < spans.length; i++) if (x > spans[i][0] && x < spans[i][1]) c += 40 / (1 + Math.max(0, spans[i][2]) * 0.08);
        if (c < cost) { cost = c; best = x; }
      }
      return { x: best, cost: cost };
    }

    function stepRivals(dt, t) {
      for (var i = 0; i < rivals.length; i++) {
        var r = rivals[i], Rr = r.e.radius;
        if (r.out) {
          // cut down: carried a few metres by its own speed, then down where it
          // fell; a body without a death of its own topples; then it sinks away
          r.outT += dt; r.v = damp(r.v, 0, 4, dt); r.d += r.v * dt;
          if (r.e.mark) r.e.mark.visible = false;
          var sink = smooth(R.slainFade - 0.6, R.slainFade, r.outT) * 2.4;
          placeBody(r.e, r.d, r.x, -sink);
          if (!r.e.falls && r.e.model) r.e.model.rotation.set(-smooth(0, 0.5, r.outT) * 1.45, 0, 0);
          if (r.outT > R.slainFade) r.e.object.visible = false;
          if (r.e.animate && r.e.object.visible) try { r.e.animate(t, dt, { speed: r.v, lateral: 0, crashed: false, paused: false, slain: true }); } catch (e) { fail('A rival animate() threw: ' + (e && e.message || e)); r.e.animate = null; }
          continue;
        }
        r.v = damp(r.v, rivalTarget(r), 2, dt);
        r.d += r.v * dt;
        // a newcomer holds its lane for a moment before it starts hunting
        if (r.grace > 0) { r.grace -= dt; if (r.grace <= 0) r.pref = (runRandom() * 2 - 1) * (hw - Rr - 0.6); }
        var toPlayer = rel(player.d, r.d); // >0: the player is ahead of this rival
        var engage = player.alive && r.grace <= 0 && Math.abs(toPlayer) < (14 + 22 * r.aggro) * VS;
        var wander = r.pref + (r.grace > 0 ? 0 : Math.sin(t * r.wf + r.ph) * (0.6 + 2.4 * r.aggro));
        var want = engage ? lerp(wander, player.x + player.vx * 0.3, r.aggro) : wander;
        want = bestX(freeLateral(r.d, 20 * VS, Rr, t, r), want, Rr).x;
        var maxLat = 2.2 + 7 * r.aggro;
        r.vx = clamp(damp(r.vx, (want - r.x) * (1.6 + 3 * r.aggro), 6, dt), -maxLat, maxLat);
        r.x = clamp(r.x + r.vx * dt, -hw + Rr, hw - Rr);
        // a rival hurdles a low obstacle in its line, taking off so the top of its jump is over it
        if (!(r.y > 0) && wantsJump(r.d, r.x, Rr, r.v, t)) { r.y = 0.001; r.vy = JUMP.v0; }
        stepAir(r, dt);
        placeBody(r.e, r.d, r.x, r.y || 0, r.e.vehicle ? -Math.atan2(r.vx, Math.max(r.v, 5)) * 0.8 : -r.vx * 0.05);
        // a rival alongside you, hunting, swings back: the sword is for show
        // (only a touch ends a run), but every pass reads as a fight
        if (PLAY.combat) {
          if (r.cutT >= 0) { r.cutT += dt; if (r.cutT > R.swingLength) r.cutT = -1; }
          else if (player.alive && r.grace <= 0 && t >= r.cutNext && Math.abs(rel(r.d, player.d)) < 3.4 && Math.abs(r.x - player.x) < 3) {
            r.cutT = 0; r.cutN = (r.cutN + 1) % 3; r.cutNext = t + 0.8 + runRandom() * 0.7;
          }
        }
        var mk = markFor(r.e);
        if (mk) { var near = rel(r.d, player.d); mk.material.opacity = damp(mk.material.opacity, player.alive && inReach(r) ? 1 : Math.abs(near) < 9 && Math.abs(r.x - player.x) < 4 ? 0.28 : 0, 16, dt); mk.visible = mk.material.opacity > 0.02; }
        if (r.e.animate) try { r.e.animate(t, dt, { speed: r.v, lateral: r.vx, crashed: false, paused: false, attack: r.cutT >= 0 ? { t: r.cutT, n: r.cutN } : null, air: r.y > 0.02 ? 1 : 0, height: r.y || 0 }); } catch (e) { fail('A rival animate() threw: ' + (e && e.message || e)); r.e.animate = null; }
      }
    }
    // a jumpable obstacle in this line, close enough that a jump now tops out over it
    function wantsJump(d, x, radius, v, t) {
      for (var i = 0; i < obstacles.length; i++) {
        var o = obstacles[i]; if (!jumpable(o)) continue;
        // the top of the jump comes half its time later: take off when that is over the obstacle's middle
        var dd = rel(o.d, d); if (dd < -o.half || dd > Math.max(v, 4) * JUMP.T * 0.5) continue;
        if (Math.abs(obstacleX(o, t + Math.max(0, dd) / Math.max(v, 4)) - x) < o.radius + radius + 0.25) return true;
      }
      return false;
    }

    // before the gun: on the line, standing, ready
    function holdRivals(dt, t) {
      for (var i = 0; i < rivals.length; i++) {
        var r = rivals[i];
        placeBody(r.e, r.d, r.x, 0);
        if (r.e.animate) try { r.e.animate(t, dt, { speed: 0, lateral: 0, crashed: false, paused: false }); } catch (e) { fail('A rival animate() threw: ' + (e && e.message || e)); r.e.animate = null; }
      }
    }

    // Test-only driver. It plans the way a player does: for each lane it
    // could steer toward, where will it actually be when it reaches each
    // hazard, given how fast it can move sideways, and will it be clear?
    function runAutopilot(t) {
      var px = player.x, v = Math.max(player.v, 6), latV = R.lateralSpeed * Math.sqrt(R.pace(level)) * 0.85, rp = P0.radius;
      var hazards = [];
      obstacles.forEach(function (o) {
        var dd = rel(o.d, player.d); if (dd < -1 - P0.half || dd > 42 * VS) return;
        var tau = Math.max(0, dd) / v, span = (Math.min(o.half, o.deep + 0.1) + P0.half) / v;
        // a low one is jumped, if a jump can still get over it: grounded and far enough
        // out for the jump to top out over it, or a jump (now, or the one in the air) that clears it
        var hop = jumpable(o) && (player.y > 0 ? clears(tau, o.top, span) : tau >= JUMP.T * 0.5 || clears(tau, o.top, span));
        hazards.push({ tau: tau, x: obstacleX(o, t + tau), r: o.radius, dd: dd, jump: hop });
        // a moving one keeps moving while a long car is alongside it: check the whole pass
        if (o.move) { var pass = (o.half + P0.half) / v; [-1, -0.5, 0.5, 1].forEach(function (k) { var tk = Math.max(0, tau + k * pass); hazards.push({ tau: tk, x: obstacleX(o, t + tk), r: o.radius, dd: dd }); }); }
      });
      if (PLAY.combat && rivals.some(inReach)) swing();
      rivals.forEach(function (r) {
        if (r.out) return;
        var dd = rel(r.d, player.d), closing = v - r.v, tau;
        if (dd >= 0 && closing > 0.3) tau = dd / closing;
        else if (dd < 0 && closing < -0.3) tau = dd / closing;
        else if (Math.abs(dd) < r.e.half + P0.half + 1.5) tau = 0;
        else return;
        if (tau > 3.5) return;
        // with a sword, a rival is only a hazard to touch, not to pass close by
        hazards.push({ tau: tau, x: r.x + r.vx * Math.min(tau, 0.6), r: r.e.radius + (PLAY.combat ? 0.15 : 0.5), dd: dd });
      });
      // with a sword, close on the nearest rival to cutting range, beside it
      var prey = null;
      if (PLAY.combat) rivals.forEach(function (r) { var dd = rel(r.d, player.d); if (!r.out && dd > -2 && dd < 22 && (!prey || dd < rel(prey.d, player.d))) prey = r; });
      var coin = coins.filter(function (c) { var dd = rel(c.d, player.d); return !c.taken && dd > 3 * VS && dd < 24 * VS; })[0];
      var best = px, bestCost = Infinity, lim = hw - rp;
      for (var s = 0; s <= 30; s++) {
        var x = -lim + 2 * lim * s / 30, cost = Math.abs(x - px) * 0.15 + (coin ? Math.abs(x - coin.x) * 0.1 : 0);
        if (prey) { var side = prey.x > 0 ? -1 : 1; cost += Math.abs(x - (prey.x + side * (prey.e.radius + P0.radius + 0.7))) * 0.35; }
        for (var i = 0; i < hazards.length; i++) {
          var h = hazards[i], reach = latV * h.tau;
          var at = px + Math.sign(x - px) * Math.min(Math.abs(x - px), reach);
          var gap = Math.abs(at - h.x) - (h.r + rp + 0.35);
          if (gap < 0) cost += (h.jump ? 4 : 60) / (1 + h.tau * 1.5);
          else if (gap < 1 && !h.jump) cost += (1 - gap) * 4;
        }
        if (cost < bestCost) { bestCost = cost; best = x; }
      }
      input.left = best < px - 0.25; input.right = best > px + 0.25;
      input.down = bestCost > 25; input.up = bestCost < 3;
      if (!(player.y > 0) && wantsJump(player.d, px, rp, v, t)) jump();
    }

    function stepPlayer(dt, t) {
      if (autopilot || demo) runAutopilot(t);
      // this lap's pace: every lap you run a little faster, and steer a little quicker
      var pace = R.pace(level);
      var tv = (input.up ? R.fastSpeed : input.down ? R.slowSpeed : R.baseSpeed) * pace;
      player.v = approach(player.v, tv, R.accel * pace * dt);
      var lat = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      player.vx = approach(player.vx, lat * R.lateralSpeed * Math.sqrt(pace), R.lateralAccel * pace * dt);
      player.x += player.vx * dt;
      var lim = hw - P0.radius;
      if (player.x > lim) { player.x = lim; player.vx = 0; } else if (player.x < -lim) { player.x = -lim; player.vx = 0; }
      var before = Math.floor(player.d / L);
      player.d += player.v * dt;
      if (Math.floor(player.d / L) > before) levelUp();
      // in the air: the landing kicks up a little dust, and a jump pressed just before it goes again
      player.buf = Math.max(0, player.buf - dt);
      if (stepAir(player, dt)) { SFX.land(); burst(pointAt(player.d, player.x, 0.1), '#D9CFC0', 8); if (player.buf > 0) jump(); }

      // coins
      for (var i = 0; i < coins.length; i++) {
        var c = coins[i]; if (c.taken) continue;
        var dd = rel(c.d, player.d); if (dd > P0.half + 0.8 || dd < -(P0.half + 0.8 + player.v * dt)) continue;
        if (Math.abs(c.x - player.x) < P0.radius + 0.7) { c.taken = true; gm++; SFX.coin(); burst(pointAt(c.d, c.x, 1.2), '#FFD54A', 10); updateHud(); }
      }
      stepCut(dt);
      var hit = invincible || demo ? null : collide(t);
      if (hit) crash(hit);
    }

    // rear warning: a faster rival closing from behind, in your lane or near it
    function updateWarn() {
      var show = null;
      for (var i = 0; i < rivals.length; i++) {
        var r = rivals[i], dd = rel(r.d, player.d);
        if (!r.out && dd < 0 && dd > -24 * VS && r.v > player.v + 0.5 && Math.abs(r.x - player.x) < 3.2 * VL) { show = r; break; }
      }
      if (show) {
        hudWarn.textContent = show.e.name + ' behind you';
        hudWarn.style.left = show.x > player.x ? '62%' : '24%';
        hudWarn.style.opacity = '1';
      } else hudWarn.style.opacity = '0';
    }

    /* ----------------------------------------------------------- camera -- */
    var camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), camInit = false, camRide = new THREE.Vector3(), CAMV = new THREE.Vector3();
    var CF = Frame(), PF = Frame();
    function stepCamera(dt, t) {
      var pp = pointAt(player.d, player.x, 1.1);
      var want = new THREE.Vector3(), look = new THREE.Vector3();
      if (state === 'title' && portrait) {
        // you, head to toe, from a three-quarter front view that drifts slowly:
        // a character-select shot, not a close-up (the library's bodies are
        // built to be seen at race distance)
        var sw = 0.45 + Math.sin(t * 0.3) * 0.35;
        frameAt(player.d, PF);
        want.copy(pp).addScaledVector(PF.tan, Math.cos(sw) * 4.4).addScaledVector(PF.right, Math.sin(sw) * 4.4).addScaledVector(UP, 0.15);
        look.copy(pp).addScaledVector(UP, -0.05);
      } else if (state === 'title') {
        var ang = t * 0.12;
        frameAt(0, PF);
        want.copy(PF.pos).addScaledVector(PF.tan, Math.cos(ang) * 11).addScaledVector(PF.right, Math.sin(ang) * 11).addScaledVector(UP, 4.5);
        look.copy(PF.pos).addScaledVector(UP, 1.2);
      } else {
        var facesPlayer = film && film.target === 'player';
        // a close camera (under 6 m) frames the runner, not the ground: it keeps
        // its height over the runner's own footing, tips down with a drop but
        // never up a climb (it would lose the runner's feet), and follows her
        // across the lane more closely
        var close = facesPlayer ? 0 : clamp((6 - (film ? film.distance : camDist)) / 2.5, 0, 1);
        frameAt(player.d - (film ? film.distance : camDist), CF); frameAt(facesPlayer ? player.d : player.d + 9 * (PLAY.vehicle ? 1.6 : 1), PF);
        // a car on a wide street is followed further across it, or it drives out of a narrow picture
        var follow = PLAY.vehicle ? 0.22 : 0;
        want.copy(CF.pos).addScaledVector(CF.right, player.x * (facesPlayer ? 1 : 0.65 + 0.2 * close + follow) + (film ? film.side : camSide)).addScaledVector(UP, film ? film.height : camHeight);
        look.copy(PF.pos).addScaledVector(PF.right, player.x * (facesPlayer ? 1 : 0.5 + 0.3 * close + follow)).addScaledVector(UP, film ? film.look : camAim);
        if (close > 0) {
          var foot = pointAt(player.d, 0, 0).y, drop = PF.pos.y - foot;
          want.y += (foot - CF.pos.y) * close;
          look.y += (foot + Math.min(0, drop) * 0.35 - PF.pos.y) * close;
        }
      }
      // the camera rides along the track with you and eases only the rest (side
      // to side, height, the turn of a bend): eased whole, it fell back by
      // speed/8 metres, and at race pace that halved the runner on screen
      var ride = pointAt(player.d, 0, 0);
      if (camInit && state !== 'title') { ride.sub(camRide); camPos.add(ride); camLook.add(ride); ride.add(camRide); }
      camRide.copy(ride);
      if (!camInit) { camPos.copy(want); camLook.copy(look); camInit = true; }
      camPos.lerp(want, 1 - Math.exp(-8 * dt)); camLook.lerp(look, 1 - Math.exp(-10 * dt));
      camera.up.copy(UP);
      if (camera.zoom !== 1) { camera.zoom = 1; camera.updateProjectionMatrix(); }
      camera.position.copy(camPos);
      if (shake > 0) { camera.position.x += (Math.random() - 0.5) * shake * 0.8; camera.position.y += (Math.random() - 0.5) * shake * 0.6; shake = Math.max(0, shake - dt * 1.8); }
      camera.lookAt(camLook);
      // the camera is never inside a rival: one it would be inside is not drawn
      // for that moment (a truck passing a close camera fills the screen black)
      for (var ri = 0; ri < rivals.length; ri++) {
        var re = rivals[ri].e, ro = re.object; if (rivals[ri].out && !ro.visible) continue;
        var rr = Math.max(re.half || re.radius, (re.height || 1.8) * 0.5) * 0.95 + 0.4;
        CAMV.copy(ro.position).addScaledVector(UP, (re.height || 1.8) * 0.5);
        var inside = CAMV.distanceToSquared(camera.position) < rr * rr;
        if (inside !== !!re.camHidden) { re.camHidden = inside; ro.visible = !inside; }
      }
      var wantFov = film ? film.fov : portrait && state === 'title' ? 34 : fovFor(camera.aspect) + clamp((player.v - R.baseSpeed) / VS * 0.35, -4, 9);
      // at car speeds the road buzzes through the chassis into the lens
      if (PLAY.vehicle && state === 'race' && player.alive && !film) { var buzz = smooth(R.baseSpeed, R.fastSpeed * 1.5, player.v) * 0.02; camera.position.x += (Math.random() - 0.5) * buzz; camera.position.y += (Math.random() - 0.5) * buzz; }
      if (Math.abs(camera.fov - wantFov) > 0.05) { camera.fov = damp(camera.fov, wantFov, 4, dt); camera.updateProjectionMatrix(); }
      void pp;
    }

    /* ------------------------------------------------------------- loop -- */
    var clock = new THREE.Clock(), t = 0, readySent = false, frames = 0, drawWarned = false;
    function frame() {
      requestAnimationFrame(frame);
      // (fixedStep, for films: the same time every frame, however long the frame took to draw)
      var delta = clock.getDelta(), raw = fixedStep || Math.min(delta, 0.05);
      var steps = Math.max(1, Math.round(timeScale));
      var dt = raw * timeScale / steps;
      for (var s = 0; s < steps; s++) tick(dt);
      stepMusic();
      if (!OW) { stepEngines(); stepHudSpeed(); syncCoins(t); }
      for (var k = 0; k < skies.length; k++) skies[k].position.copy(camera.position);
      followShadow();
      try {
        livePass();
        broadcastPass(Math.min(delta, 0.1));
        mirrorPass();
        if (post && post.setMotion) post.setMotion(G.motion > 0 && state === 'race' && player.alive && !demo ? G.motion * smooth(R.baseSpeed * 0.95, R.fastSpeed * 1.45, player.v) : 0);
        if (post) post.render(t);
        else renderer.render(scene, camera);
      } catch (e) {
        if (post) { post = null; renderer.setRenderTarget(null); warn('The cinematic graphics failed on this device (' + (e && e.message || e) + '); the world renders without them.'); }
        else fail('Rendering failed: ' + (e && e.message || e));
      }
      if (frames > 30) adapt(delta);
      frames++;
      if (!readySent && (!OPEN || (OW && OW.ready))) { readySent = true; GM.ready(); }
      var calls = post ? post.calls : renderer.info.render.calls;
      if (frames === 240 && !drawWarned && calls > 450) { drawWarned = true; warn('The scene takes ' + calls + ' draw calls a frame. Merge or instance repeated scenery (ctx.instanced) to stay well under 300.'); }
    }
    function tick(dt) {
      if (OW) { OW.tick(dt); return; }
      var slow = state === 'crashed' ? 0.25 : 1;
      // a cut lands with a moment's stillness
      if (hitstop > 0) { hitstop -= dt; slow *= 0.12; }
      var sdt = state === 'paused' ? 0 : dt * slow;
      t += sdt;
      if (state === 'title' || state === 'countdown') holdRivals(dt, t);
      if (state === 'countdown') {
        var prev = Math.ceil(countdown); countdown -= dt;
        var now = Math.ceil(countdown);
        countEl.textContent = countdown > 0 ? String(now) : 'GO';
        if (now !== prev && now > 0) SFX.tick(false);
        if (countdown <= 0) { state = 'race'; SFX.tick(true); setTimeout(function () { if (countEl.textContent === 'GO') countEl.textContent = ''; }, 500); }
      } else if (state === 'race') {
        raceTime += sdt;
        stepPlayer(sdt, t);
        stepRivals(sdt, t);
        updateWarn();
        var secs = Math.floor(raceTime); hudTime.querySelector('b').textContent = Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0');
        // the demo starts over every few laps, so a visitor sees the start
        if (demo && (level >= 4 || raceTime > 50)) startDemo();
      } else if (state === 'crashed') {
        crashT += dt;
        stepAir(player, sdt);
        stepRivals(sdt, t);
        if (crashT > 1.4) showResults();
      } else if (state === 'results') {
        // left alone, the results give way to the world racing itself again
        resultsT += dt;
        if (resultsT > 12) startDemo();
      }
      if (state !== 'race' && state !== 'crashed') hudWarn.style.opacity = '0';
      if (bannerT > 0) { bannerT -= dt; banner.style.opacity = String(clamp(bannerT, 0, 1)); }
      if (feedT > 0) { feedT -= dt; feed.style.opacity = String(clamp(feedT * 2, 0, 1)); }

      // obstacles that move
      obstacles.forEach(function (o) {
        if (o.move) { o.ph += sdt * o.w; place(o.object, o.d, obstacleX(o, t), 0); }
        if (o.animate) try { o.animate(t, sdt, {}); } catch (e) { fail('An obstacle animate() threw: ' + (e && e.message || e)); o.animate = null; }
      });
      placeBody(P0, player.d, player.x, player.y, P0.vehicle ? -Math.atan2(player.vx, Math.max(player.v, 5)) * 0.8 : -player.vx * 0.045);
      if (P0.animate) try { P0.animate(t, sdt, { speed: state === 'race' ? player.v : 0, lateral: player.vx, crashed: !player.alive, paused: state === 'paused', attack: cut.t >= 0 ? { t: cut.t, n: cut.n } : null, boost: input.up && state === 'race', brake: input.down && state === 'race', air: player.y > 0.02 ? 1 : 0, height: player.y }); } catch (e) { fail('player animate() threw: ' + (e && e.message || e)); P0.animate = null; }
      if (typeof def.update === 'function') try { def.update(ctx, t, sdt); } catch (e) { fail('update() threw: ' + (e && e.message || e)); def.update = null; }
      stepParticles(sdt || dt * 0.25);
      stepWater(t);
      if (VK) VK.step(sdt || dt * 0.25);
      stepCamera(dt, t);
    }

    /*@include open.js*/

    if (OPEN) openWorld(); else startDemo();
    requestAnimationFrame(frame);

    // for the platform's playtest, never for players: any use marks the run
    // as assisted, and assisted runs are refused by the leaderboard
    window.__gmRuntime = {
      version: R.version,
      state: function () {
        return { open: OW && OW.state ? OW.state() : null, state: state, level: level, gm: gm, alive: player.alive, pace: R.pace(level), cruise: cruise(),
          rivals: rivals.map(function (r) { var j = wrapD(r.d0); return { k: r.k, name: r.e.name, ratio: r.ratio, aggro: r.aggro, speed: r.v, ahead: rel(r.d, player.d), x: r.x, joinedFromLine: Math.min(j, L - j), out: r.out, inReach: inReach(r), mark: r.e.mark ? +r.e.mark.material.opacity.toFixed(2) : null }; }),
          lap: L, halfWidth: hw, obstacles: obstacles.length, hazards: { mode: HZ.mode, base: HZ.base.length, copies: HZ.extra.length }, coins: coins.length, playerRadius: P0.radius, playerHalf: P0.half, time: raceTime,
          play: { coins: PLAY.coins, bounty: PLAY.bounty, combat: !!PLAY.combat, vehicle: PLAY.vehicle }, scale: VS,
          vehicle: P0.vehicle ? { kind: P0.vehicle.kind, kmh: Math.round(player.v * 3.6), gear: P0.vehicle.state.gear, rpm: Math.round(P0.vehicle.state.rpm), engine: !!(audio && audio.voices && audio.voices[0]) } : null,
          track: TRACK ? { id: TRACK, lufs: ASSETS[TRACK] ? ASSETS[TRACK].json.lufs : null, loaded: !!(ASSETS[TRACK] && ASSETS[TRACK].buffer), playing: !!(audio && audio.music && audio.music.state.playing && !audio.music.state.stopping), energy: audio && audio.music ? audio.music.state.energy : null, gain: audio && audio.music ? audio.music.state.gain : null, position: audio && audio.music && audio.music.position ? +audio.music.position().toFixed(2) : null, duck: audio && audio.music ? audio.music.duckLevel() : null } : null,
          music: MUSIC ? { style: MUSIC.style, key: MUSIC.key, mode: MUSIC.mode, tempo: MUSIC.tempo, meter: MUSIC.meter, measured: MUSIC.measured || null,
            gain: audio && audio.music ? audio.music.state.gain : null, playing: !!(audio && audio.music && audio.music.state.playing && !audio.music.state.stopping),
            energy: audio && audio.music ? audio.music.state.energy : null, bar: audio && audio.music ? audio.music.state.bar : null, duck: audio && audio.music ? audio.music.duckLevel() : null } : null,
          slain: slain, swinging: cut.t >= 0, fallen: rivals.filter(function (r) { return r.out; }).length,
          playerSword: !!P0.model && (function () { var k = false; P0.model.traverse(function (o) { if (o.isMesh && o.geometry && o.geometry.attributes.position && o.geometry.attributes.position.count > 60 && o.material && o.material.metalness === 1) k = true; }); return k; })(),
          x: player.x, d: player.d, speed: player.v, paused: state === 'paused', y: +player.y.toFixed(3), jump: { H: +JUMP.H.toFixed(2), T: JUMP.T, low: +JUMP.low.toFixed(2), obstacles: obstacles.map(function (o) { return +o.top.toFixed(2); }) },
          assets: Object.keys(ASSETS), me: youShown, demo: demo, playerSkinned: (function () { var k = false; P0.object.traverse(function (o) { if (o.isSkinnedMesh) k = true; }); return k; })(),
          render: { live: LIVE ? { on: LIVE.on, frames: LIVE.frames } : null, calls: post ? post.calls : renderer.info.render.calls, triangles: post ? post.tris : renderer.info.render.triangles, quality: quality, pixelRatio: renderer.getPixelRatio(), cinematic: !!post, msaa: !!(post && post.msaa), bloom: !!(post && post.bloomOn), mirror: MIR ? { on: MIR.on, scale: MIR.scale, frames: MIR.frames, materials: MIR.mats.length } : null, broadcast: BC && BC.rt ? { shot: BC.shot, frames: BC.frames || 0 } : null }, input: { left: input.left, right: input.right, up: input.up, down: input.down }, crashedInto: crashedInto };
      },
      debug: {
        // an open world's own hooks: spawn one, raise the heat, take a hit, call the police
        open: function () { return OW && OW.debug ? OW.debug : null; },
        // start the sound as a key press would (tests; a page needs a gesture)
        audio: function () { ensureAudio(); return !!audio; },
        musicScore: function () { return MUSIC ? GameMogMusic.score(MUSIC) : null; },
        sfx: function (name) { if (SFX[name]) SFX[name](); },
        autopilot: function (on) { autopilot = !!on; assisted = true; },
        invincible: function (on) { invincible = !!on; assisted = true; },
        // hide the HUD for a clean cover shot of the world
        cinematic: function (on) { root.style.visibility = on ? 'hidden' : ''; },
        // filming a master: full resolution that never adapts down, and no film
        // grain (it only turns to noise in a compressed video). Never affects play.
        master: function (on) { MASTER = !!on; if (post && post.setGrain) post.setGrain(on ? 0 : G.grade.grain); },
        timeScale: function (n) { timeScale = clamp(Number(n) || 1, 1, 8); assisted = true; },
        fixedStep: function (fps) { fixedStep = fps ? 1 / clamp(Number(fps) || 60, 24, 120) : 0; if (fps) assisted = true; },
        // frame a recording: target:'player' permits a negative distance, putting
        // the camera ahead of the runner for key art. This never affects play.
        film: function (c) {
          var d = c && Number(c.distance);
          if (!isFinite(d)) d = camDist;
          film = c ? { target: c.target === 'player' ? 'player' : 'track', distance: clamp(d, c.target === 'player' ? -20 : 2, 20), height: clamp(Number(c.height) || camHeight, 0.4, 10), fov: clamp(Number(c.fov) || baseFov, 20, 90), side: Number(c.side) || 0, look: Number(c.look) || 1.3 } : null;
          assisted = true;
        },
        // what a frame looks like, measured (the test drive's "looks basic" check
        // and its cover choice): colour variety in bits, the share of the one
        // commonest colour, the share of pixels on an edge, contrast (the 5th to
        // the 95th percentile of brightness) and mean brightness, on a 320x180
        // copy read straight after a render, so no kept drawing buffer is needed
        look: function () {
          try { if (post) post.render(t); else renderer.render(scene, camera); } catch (e) { return null; }
          var w = 320, h = 180, o = document.createElement('canvas'); o.width = w; o.height = h;
          var g = o.getContext('2d', { willReadFrequently: true }); g.drawImage(renderer.domElement, 0, 0, w, h);
          var d = g.getImageData(0, 0, w, h).data, n = w * h, bins = new Uint32Array(4096), lum = new Float32Array(n), i, j;
          for (i = 0; i < n; i++) { var r = d[i * 4], gr = d[i * 4 + 1], b = d[i * 4 + 2]; bins[(r >> 4) << 8 | (gr >> 4) << 4 | (b >> 4)]++; lum[i] = 0.2126 * r + 0.7152 * gr + 0.0722 * b; }
          var ent = 0, dom = 0; for (i = 0; i < 4096; i++) { if (!bins[i]) continue; var p = bins[i] / n; ent -= p * Math.log2(p); if (bins[i] > dom) dom = bins[i]; }
          var edges = 0, seen = 0; for (j = 1; j < h - 1; j++) for (i = 1; i < w - 1; i++) { var q = j * w + i; if (Math.hypot(lum[q + 1] - lum[q - 1], lum[q + w] - lum[q - w]) > 40) edges++; seen++; }
          var sorted = Array.from(lum).sort(function (x, y) { return x - y; }), mean = 0, clip = 0; for (i = 0; i < n; i++) { mean += lum[i]; if (d[i * 4] > 249 && d[i * 4 + 1] > 249 && d[i * 4 + 2] > 249) clip++; }
          var out = { entropy: +ent.toFixed(2), dominant: +(dom / n).toFixed(3), edges: +(edges / seen).toFixed(3), contrast: Math.round(sorted[Math.floor(n * 0.95)] - sorted[Math.floor(n * 0.05)]), mean: Math.round(mean / n),
            // 1 Oct: how much of the frame is pure white (blown out), and how bright its darkest part is (a veil of bloom or fog lifts it)
            clipped: +(clip / n).toFixed(3), floor: Math.round(sorted[Math.floor(n * 0.05)]) };
          var pv = null; try { pv = playerView(w, h, d); } catch (e) { pv = null; }
          if (pv) { out.player = pv.size; out.seen = pv.seen; out.apart = pv.apart; }
          return out;
        },
        art: function () { return { title: meta.title || 'GameMog', theme: { ink: T.ink, accent: T.accent, font: T.font }, keyArt: OPEN && OPEN.keyArt && Array.isArray(OPEN.keyArt.at) ? OPEN.keyArt : null }; },
        // the renderer's own parts, for the platform's checks of what it drew (never for play)
        internals: function () { return { scene: scene, camera: camera, renderer: renderer, live: LIVE, mirror: MIR, water: WATER, skies: skies, player: P0, obstacles: obstacles, audio: audio, THREE: THREE }; },
        start: function () { if (state === 'title' || state === 'results' || demo) { if (OW) OW.introSkip = true; startCountdown(); } },
        // the sword key, for the playtest (does nothing unless combat is on)
        swing: function () { swing(); },
        // put a rival beside you, n metres ahead (the playtest's sparring partner)
        rivalAt: function (k, ahead, x) { assisted = true; var r = rivals.filter(function (q) { return q.k === k; })[0]; if (!r) return false; r.d = player.d + (Number(ahead) || 0); r.x = Number(x) || player.x; r.grace = 9; return true; },
        // the jump, pressed (the checks); its height and time in the air
        jump: function () { jump(); return { y: player.y, vy: player.vy, H: JUMP.H, T: JUMP.T, low: JUMP.low }; },
        // stand the player `ahead` metres short of the next still obstacle it can jump (or of one it
        // cannot, tall: true), lined up on it, on the ground; what it is
        lineUp: function (ahead, tall) {
          assisted = true;
          var best = null, bd = Infinity;
          obstacles.forEach(function (o) { if (o.move || (tall ? jumpable(o) : !jumpable(o))) return; var dd = rel(o.d, player.d + 30); if (dd >= 0 && dd < bd) { bd = dd; best = o; } });
          if (!best) return null;
          player.d = best.d - (Number(ahead) || 6); player.x = clamp(best.x0, -hw + P0.radius, hw - P0.radius); player.vx = 0; player.y = 0; player.vy = 0;
          return { top: +best.top.toFixed(2), d: best.d, v: player.v, H: JUMP.H, T: JUMP.T };
        },
        crashInto: function () { assisted = true; player.y = 0; player.vy = 0; if (obstacles[0]) { player.d = obstacles[0].d - 0.2; player.x = obstacleX(obstacles[0], t); } else if (rivals[0]) { player.d = rivals[0].d; player.x = rivals[0].x; } },
      },
    };
  }
})();
