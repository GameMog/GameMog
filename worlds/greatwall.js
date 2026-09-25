// Great Wall Shinobi
//
// A first-party GameMog world: endless laps of the Great Wall at a winter
// dusk, run by shinobi with swords drawn. The wall rides the crest of a ring
// of ridges round a valley drowned in mist: out through the Grand Gate, up
// over the high towers, along the ridge with the whole range falling away on
// both sides, and down through the watchtowers back to the Gate. Rivals are
// a clan of assassins, then armoured guards; cut them down before they touch
// you. No coins on the Wall: every lap you finish pays the Emperor's bounty.
//
// Combat, the lap bounty and the grade are the runtime's platform options
// (play.combat, play.bounty, graphics.grade.split); the wall is this file's.
//
// The look and the sound follow Shinobi Duel (github.com/StarKnightt/
// shinobi-duel): the low hazy sun behind drifting mist banks, falling snow
// that catches the light, brush lettering drawn in code, and a score and
// ambience synthesized in the browser (o-daiko, nagado and shime drums, a
// breathy shakuhachi, a Karplus-Strong koto, a bonsho bell, the wind). Its
// fighters are Mixamo files and are not used; ours are the library's CC0
// runners with Quaternius CC0 sword motion. Shinobi Duel's code is under the
// MIT licence:
//
//   Copyright (c) 2026 Prasenjit Nayak (StarKnightt)
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

(function () {
  var PI = Math.PI, TAU = PI * 2;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function smooth(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function hash2(x, z) { var s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); }
  function noise(x, z) {
    var ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz, ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
    return lerp(lerp(hash2(ix, iz), hash2(ix + 1, iz), ux), lerp(hash2(ix, iz + 1), hash2(ix + 1, iz + 1), ux), uz);
  }
  function fbm(x, z) { return noise(x, z) * 0.5 + noise(x * 2.03 + 17, z * 2.03 - 9) * 0.28 + noise(x * 4.1 - 5, z * 4.1 + 3) * 0.14 + noise(x * 8.3 + 2, z * 8.3 - 7) * 0.08; }
  function ridged(x, z) { var n = 1 - Math.abs(noise(x, z) * 2 - 1), m = 1 - Math.abs(noise(x * 2.1 + 5, z * 2.1 - 3) * 2 - 1); return n * n * 0.65 + m * m * 0.35; }

  /* ----------------------------------------------------------- layout -- */
  // The Wall rings a valley: the Grand Gate at the low pass (start), the
  // high towers on the far ridge. Twelve metres of climb a lap, never more
  // than a nine percent grade. The paved walk is wider than the racing lane,
  // so the parapets stand clear of the runners.
  var TW = 9, HW = TW / 2, WALK = 6.1, PARA = 0.85, PARA_H = 1.05, MERLON_H = 0.95, BASE = 7.5;
  // the sun low ahead down the first straight: out of the Gate straight into it
  var SUN = (function () { var v = [-0.28, 0.13, 0.95], l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; })();
  var ROUTE = [];
  for (var i = 0; i < 30; i++) {
    var a = i / 30 * TAU, r = 116 + 17 * Math.sin(2 * a + 0.7) + 9 * Math.sin(3 * a + 2.1) + 4 * Math.sin(5 * a + 0.3);
    ROUTE.push([Math.cos(a) * r * 1.12, 5.5 - 5.5 * Math.cos(a) + 2 * Math.sin(2 * a + 0.9) + 0.8 * Math.sin(3 * a + 1.3), Math.sin(a) * r]);
  }
  var TOWERS = 7; // watchtowers between the Gate and itself, evenly along the lap

  var W = { time: { value: 0 }, level: 1, scarves: [], fires: [], lanterns: null, fireworks: null, flare: 0 };

  /* ---------------------------------------------------------- the cast -- */
  // you: a kunoichi in indigo with a crimson scarf. Them: the Kurokage clan
  // in black and ash, then the Iron Guard in lacquered armour.
  var PLAYER = { gender: 'female', name: 'Kage', suit: '#1B2233', trim: '#8E1B1B', accent: '#C8B18A', scarf: '#B3261E', skin: 'asian', height: 1.7, muscle: 0.62, lean: 0.62, hair: 'short02', mask: '#15171D', blade: '#E9EEF3', grip: '#2B1A14', trail: '#FFE3C2' };
  var RIVALS = [
    { gender: 'male', name: 'Kurogane', suit: '#141416', trim: '#3A3A3E', accent: '#6B6B70', scarf: '#5B5E66', skin: 'asian', height: 1.78, muscle: 0.8, kind: 'shinobi' },
    { gender: 'female', name: 'Tsubame', suit: '#1A1618', trim: '#4A2A2E', accent: '#8B6E6A', scarf: '#6E2F35', skin: 'asian', height: 1.68, muscle: 0.68, kind: 'shinobi' },
    { gender: 'male', name: 'Hayate', suit: '#18191C', trim: '#2E3B4A', accent: '#8A96A8', scarf: '#2E3B4A', skin: 'caucasian', height: 1.82, muscle: 0.82, kind: 'shinobi' },
    { gender: 'male', name: 'Tetsu', suit: '#26140F', trim: '#7A1C14', accent: '#C9A45C', scarf: '#7A1C14', skin: 'asian', height: 1.84, muscle: 0.92, kind: 'guard', armour: '#7A1C14', crest: '#D4A63A' },
    { gender: 'female', name: 'Oboro', suit: '#16161A', trim: '#40405A', accent: '#9A9AB8', scarf: '#40405A', skin: 'asian', height: 1.7, muscle: 0.7, kind: 'shinobi' },
    { gender: 'male', name: 'Raiden', suit: '#141216', trim: '#1E1E22', accent: '#B89A4E', scarf: '#1E1E22', skin: 'african', height: 1.88, muscle: 0.95, kind: 'guard', armour: '#141416', crest: '#D4A63A' },
    { gender: 'male', name: 'Kagero', suit: '#1C1A18', trim: '#5A5048', accent: '#A89A88', scarf: '#8A7F72', skin: 'caucasian', height: 1.76, muscle: 0.78, kind: 'shinobi' },
    { gender: 'female', name: 'Shiden', suit: '#1A1216', trim: '#5E1A2A', accent: '#C0A060', scarf: '#5E1A2A', skin: 'asian', height: 1.72, muscle: 0.78, kind: 'guard', armour: '#5E1A2A', crest: '#E0C070' },
    { gender: 'male', name: 'Yamikaze', suit: '#0F0F11', trim: '#26262B', accent: '#56565E', scarf: '#26262B', skin: 'asian', height: 1.8, muscle: 0.86, kind: 'shinobi' },
    { gender: 'male', name: 'Genbu', suit: '#1A1A14', trim: '#3A4A2A', accent: '#B8A060', scarf: '#3A4A2A', skin: 'african', height: 1.86, muscle: 0.96, kind: 'guard', armour: '#23301C', crest: '#D4A63A' },
  ];

  GameMog.world({
    assets: ['human-athlete-male', 'human-athlete-female'],
    // the owner's rules for this world (25 Sep): cut rivals down; no coins,
    // only the bounty for every lap you finish
    play: { coins: false, bounty: { base: 100, step: 50, name: 'The Emperor’s bounty' }, combat: { mark: '斬', verb: 'Cut down' } },
    theme: { sky: '#E7B894', fog: '#C9B6AC', ink: '#17110D', panel: '#F2E8D6', accent: '#A8231C', font: 'Shippori Mincho' },
    graphics: {
      exposure: 1.0,
      environment: true,
      bloom: { strength: 0.6, threshold: 1.05, radius: 0.85 },
      grade: { contrast: 1.07, saturation: 0.92, highlights: 1.3, split: 1, paper: 0.035, warmth: 0.05, vignette: 0.34, grain: 0.006 },
      shadows: { extent: 40, mapSize: 2048 },
    },
    camera: { distance: 6.4, height: 2.7, fov: 58 },
    track: { width: TW, points: ROUTE },
    build: build,
    player: function (ctx) { return fighter(ctx, PLAYER, 0); },
    rival: function (ctx, k) {
      var base = RIVALS[(k - 1) % RIVALS.length], round = Math.floor((k - 1) / RIVALS.length);
      var f = fighter(ctx, Object.assign({}, base, { muscle: Math.min(1, base.muscle + round * 0.05) }), k);
      if (round) f.name += ' ' + ['II', 'III', 'IV', 'V'][Math.min(3, round - 1)];
      return f;
    },
    obstacles: obstacles,
    update: update,
    ambient: ambient,
  });

  /* ------------------------------------------------------- materials -- */
  // textures drawn in code: grey Ming brick, granite flagstones with snow in
  // the joints (and their relief), roof tiles, lacquer, a grain for the snow
  function textures(ctx) {
    var T = ctx.textures.canvas, N = ctx.textures.normal, THREE = ctx.THREE;
    // one brick course pattern for the colour and the relief
    function bricks(g, w, h, relief) {
      var r = rng(4), bh = 32, bw = 96;
      g.fillStyle = relief ? '#303030' : '#6F6C68'; g.fillRect(0, 0, w, h);
      for (var y = 0; y < h; y += bh) for (var x = -((y / bh) % 2) * bw / 2; x < w; x += bw) {
        var v = 128 + r() * 36 | 0, t = r() * 10 - 5, soot = r(), bloom = r();
        if (relief) { g.fillStyle = 'rgb(' + (170 + r() * 50 | 0) + ',0,0)'; g.fillRect(x + 3, y + 3, bw - 5, bh - 5); continue; }
        g.fillStyle = 'rgb(' + (v + t | 0) + ',' + (v + 1 | 0) + ',' + (v - 2 - t | 0) + ')'; g.fillRect(x + 3, y + 3, bw - 5, bh - 5);
        g.fillStyle = 'rgba(30,28,30,' + (0.1 + soot * 0.22) + ')'; g.fillRect(x + 3, y + 3, bw - 5, 3 + soot * 6);
        if (bloom > 0.72) { g.fillStyle = 'rgba(236,234,226,' + (0.12 + r() * 0.18) + ')'; g.fillRect(x + 6 + r() * 40, y + 8 + r() * 8, 18 + r() * 34, 8 + r() * 6); }
        for (var k = 0; k < 22; k++) { var q = 80 + r() * 110 | 0; g.fillStyle = 'rgba(' + q + ',' + q + ',' + q + ',0.28)'; g.fillRect(x + r() * bw, y + r() * bh, 2, 2); }
      }
    }
    var brick = T(512, 512, function (g, w, h) { bricks(g, w, h, false); });
    var brickN = N(512, 512, function (g, w, h) { bricks(g, w, h, true); }, 2.4);
    // flagstones: irregular courses laid across the walk, worn and snowed into
    var R0 = rng(12), rows = [0], stones = [];
    while (rows[rows.length - 1] < 512) rows.push(Math.min(512, rows[rows.length - 1] + 70 + R0() * 60));
    for (var j = 0; j < rows.length - 1; j++) { var x0 = -R0() * 90; while (x0 < 512) { var sw = 80 + R0() * 110; stones.push([x0, rows[j], sw, rows[j + 1] - rows[j], R0(), R0(), R0()]); x0 += sw; } }
    function flags(g, w, h, relief) {
      var r = rng(19);
      g.fillStyle = relief ? '#202020' : '#6A655F'; g.fillRect(0, 0, w, h);
      stones.forEach(function (st) {
        var x = st[0], y = st[1], sw = st[2], sh = st[3], v = 104 + st[4] * 62 | 0, hue = (st[5] - 0.5) * 14;
        for (var wrap = -1; wrap <= 1; wrap++) {
          var xx = x + wrap * w;
          if (relief) {
            // each stone a little proud, its edges worn round
            var gr = g.createLinearGradient(xx, y, xx, y + sh); var hv = 150 + st[5] * 60 | 0;
            g.fillStyle = 'rgb(' + hv + ',0,0)'; g.fillRect(xx + 4, y + 4, sw - 8, sh - 8);
            g.fillStyle = 'rgba(' + (hv - 40) + ',0,0,0.6)'; g.fillRect(xx + 4, y + 4, sw - 8, 5); g.fillRect(xx + 4, y + 4, 5, sh - 8);
            void gr; continue;
          }
          g.fillStyle = 'rgb(' + (v + 4 + hue | 0) + ',' + v + ',' + (v - 6 - hue | 0) + ')'; g.fillRect(xx + 2, y + 2, sw - 4, sh - 4);
          // a darker, wetter rim, and the grit of five hundred winters
          g.strokeStyle = 'rgba(40,36,34,0.22)'; g.lineWidth = 5; g.strokeRect(xx + 5, y + 5, sw - 10, sh - 10);
          for (var k = 0; k < 60; k++) { var q = 70 + r() * 120 | 0; g.fillStyle = 'rgba(' + q + ',' + q + ',' + (q - 4) + ',0.25)'; g.fillRect(xx + 3 + r() * (sw - 6), y + 3 + r() * (sh - 6), 2 + r() * 3, 2 + r() * 3); }
          if (st[6] > 0.8) { g.fillStyle = 'rgba(30,26,24,0.25)'; g.beginPath(); g.moveTo(xx + sw * 0.2, y + 4); g.lineTo(xx + sw * (0.3 + st[4] * 0.3), y + sh * 0.6); g.lineTo(xx + sw * 0.6, y + sh - 4); g.lineWidth = 2; g.stroke(); }
        }
      });
      if (relief) return;
      // snow packed into the joints and drifted into the corners
      // snow lies in some joints, not all: in drifts where the wind drops it
      for (var k2 = 0; k2 < 220; k2++) {
        var st2 = stones[(r() * stones.length) | 0], edge = r();
        var ex = st2[0] + (edge < 0.5 ? r() * st2[2] : (r() < 0.5 ? 0 : st2[2])), ey = st2[1] + (edge < 0.5 ? (r() < 0.5 ? 0 : st2[3]) : r() * st2[3]);
        if (noise(ex * 0.012, ey * 0.012) < 0.45) continue;
        g.fillStyle = 'rgba(232,236,244,' + (0.18 + r() * 0.3) + ')'; g.beginPath(); g.ellipse(((ex % w) + w) % w, ey, 6 + r() * 14, 1.5 + r() * 2.5, edge < 0.5 ? 0 : PI / 2, 0, TAU); g.fill();
      }
      // a few thin veils of blown snow across the stone
      for (var k3 = 0; k3 < 9; k3++) { var cx = r() * w, cy = r() * h, rg = g.createRadialGradient(cx, cy, 0, cx, cy, 40 + r() * 60); rg.addColorStop(0, 'rgba(230,234,242,0.28)'); rg.addColorStop(1, 'rgba(230,234,242,0)'); g.fillStyle = rg; g.fillRect(cx - 100, cy - 100, 200, 200); }
    }
    var flag = T(512, 512, function (g, w, h) { flags(g, w, h, false); });
    var flagN = N(512, 512, function (g, w, h) { flags(g, w, h, true); }, 2.2);
    var tiles = T(256, 256, function (g, w, h) {
      // rows of barrel tiles: pale crowns, dark channels, a course line every row
      g.fillStyle = '#23272D'; g.fillRect(0, 0, w, h);
      for (var x = 0; x < w; x += 32) { var gr = g.createLinearGradient(x, 0, x + 32, 0); gr.addColorStop(0, '#1B1E22'); gr.addColorStop(0.5, '#59606A'); gr.addColorStop(1, '#1B1E22'); g.fillStyle = gr; g.fillRect(x + 2, 0, 18, h); }
      for (var y = 0; y < h; y += 26) { g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(0, y, w, 3); g.fillStyle = 'rgba(160,170,180,0.18)'; g.fillRect(0, y + 3, w, 2); }
    });
    tiles.wrapS = tiles.wrapT = THREE.RepeatWrapping;
    var grain = T(256, 256, function (g, w, h) {
      g.fillStyle = '#F4F4F4'; g.fillRect(0, 0, w, h);
      var r = rng(33);
      for (var k = 0; k < 4200; k++) { var v = 205 + r() * 50 | 0; g.fillStyle = 'rgba(' + v + ',' + v + ',' + (v + 4) + ',0.6)'; g.fillRect(r() * w, r() * h, 1 + r() * 2.5, 1 + r() * 2.5); }
    });
    [brick, brickN, flag, flagN, grain].forEach(function (t) { t.wrapS = t.wrapT = THREE.RepeatWrapping; });
    return {
      brick: new THREE.MeshStandardMaterial({ map: brick, normalMap: brickN, normalScale: new THREE.Vector2(0.7, 0.7), roughness: 0.93, color: '#DAD6CF' }),
      walk: new THREE.MeshStandardMaterial({ map: flag, normalMap: flagN, normalScale: new THREE.Vector2(0.8, 0.8), roughness: 0.82 }),
      roof: new THREE.MeshStandardMaterial({ map: tiles, roughness: 0.55, metalness: 0.15, side: THREE.DoubleSide }),
      plaster: new THREE.MeshStandardMaterial({ color: '#D9CFC0', roughness: 0.95 }),
      lacquer: new THREE.MeshPhysicalMaterial({ color: '#7E1F18', roughness: 0.45, clearcoat: 0.6, clearcoatRoughness: 0.4 }),
      wood: new THREE.MeshStandardMaterial({ color: '#4A2E20', roughness: 0.8 }),
      iron: new THREE.MeshStandardMaterial({ color: '#2A2624', roughness: 0.6, metalness: 0.7 }),
      gold: new THREE.MeshStandardMaterial({ color: '#C8A04A', roughness: 0.3, metalness: 1 }),
      snow: new THREE.MeshStandardMaterial({ color: '#EEF2F8', roughness: 0.85 }),
      ridge: new THREE.MeshStandardMaterial({ color: '#15181C', roughness: 0.6 }),
      grain: grain, brickTex: brick,
    };
  }

  // brush lettering (Shinobi Duel's brush.ts, simplified): a heavy serif
  // glyph smeared with jittered copies, eroded by bristle streaks and
  // thresholded back into dry ink with ragged edges and a few splatters
  function brush(ctx, text, o) {
    o = o || {};
    var size = o.size || 180, cols = o.vertical ? 1 : [].concat(text).join('').length, rows = o.vertical ? [].concat(text).join('').length : 1;
    var w = o.w || Math.ceil(size * 1.15 * cols + size * 0.5), h = o.h || Math.ceil(size * 1.2 * rows + size * 0.5);
    return ctx.textures.canvas(w, h, function (g) {
      var r = rng(o.seed || 7), chars = [].concat(text).join('').split('');
      if (o.paper) { g.fillStyle = o.paper; g.fillRect(0, 0, w, h); } else g.clearRect(0, 0, w, h);
      var m = document.createElement('canvas'); m.width = w; m.height = h;
      var mg = m.getContext('2d');
      mg.font = (o.weight || 800) + ' ' + size + 'px "Hiragino Mincho ProN", "Yu Mincho", "Songti SC", "Noto Serif CJK JP", "Noto Serif JP", serif';
      mg.textAlign = 'center'; mg.textBaseline = 'middle'; mg.fillStyle = '#FFFFFF';
      chars.forEach(function (c, k) {
        var cx = o.vertical ? w / 2 : w / 2 + (k - (chars.length - 1) / 2) * size * 1.08, cy = o.vertical ? h / 2 + (k - (chars.length - 1) / 2) * size * 1.12 : h / 2;
        for (var s = 0; s < 9; s++) {
          mg.save(); mg.translate(cx + (r() - 0.5) * size * 0.05 - s * size * 0.004, cy + (r() - 0.5) * size * 0.04 + s * size * 0.006);
          mg.rotate((r() - 0.5) * 0.06); mg.globalAlpha = 0.5; mg.fillText(c, 0, 0); mg.restore();
        }
      });
      var img = mg.getImageData(0, 0, w, h), d = img.data, ink = new THREE_Color(o.color || '#15100C');
      var streak = function (x, y) { return noise(x * 0.012, y * 0.35) * 0.6 + noise(x * 0.05, y * 0.9) * 0.4; };
      for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
        var q = (y * w + x) * 4, a = d[q + 3] / 255 * (d[q] / 255);
        var v = a - (streak(x, y) - 0.5) * 0.7 * (o.dry == null ? 0.8 : o.dry);
        var alpha = v > 0.42 ? 1 : v > 0.34 ? (v - 0.34) / 0.08 : 0;
        d[q] = ink[0]; d[q + 1] = ink[1]; d[q + 2] = ink[2]; d[q + 3] = alpha * 255;
      }
      mg.putImageData(img, 0, 0);
      for (var k = 0; k < (o.splatter == null ? 7 : o.splatter); k++) {
        var sx = w * (0.15 + r() * 0.7), sy = h * (0.15 + r() * 0.7), rad = size * (0.008 + r() * 0.02);
        mg.fillStyle = o.color || '#15100C'; mg.beginPath(); mg.arc(sx, sy, rad, 0, TAU); mg.fill();
      }
      g.drawImage(m, 0, 0);
    });
  }
  function THREE_Color(hex) { var n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }

  /* ------------------------------------------------------------ build -- */
  function build(ctx) {
    var THREE = ctx.THREE, scene = ctx.scene, low = ctx.quality === 'low';
    W.M = textures(ctx);
    var sun = new THREE.DirectionalLight('#FFC49A', 3.3);
    sun.position.set(SUN[0] * 200, SUN[1] * 200, SUN[2] * 200); sun.castShadow = true;
    scene.add(sun, new THREE.HemisphereLight('#9AAED0', '#5E5260', 0.95));
    // a low winter sun, huge and hazy, behind the far ridge
    ctx.sky({ top: '#4A5A7E', horizon: '#F2B48A', bottom: '#6A6478', sun: SUN, sunColor: '#FFD1A0', sunSize: 3.4, glow: 2.4, haze: 0.95, sunPower: 13, curve: 0.55 });
    scene.fog = new THREE.Fog('#C9B6AC', 150, 1500);

    terrain(ctx, low);
    wall(ctx, low);
    towers(ctx, low);
    gate(ctx);
    ranges(ctx, low);
    mist(ctx, low);
    pines(ctx, low);
    snowfall(ctx, low);
    fireworks(ctx);

    // the moments the runtime tells us about
    ctx.on('start', function () { W.level = 1; W.started = W.time.value; });
    ctx.on('lap', function (e) { W.level = e.level; lapPrize(ctx, e); });
    ctx.on('crash', function () { if (W.audio) W.audio.death(); });
    ctx.on('slay', function () { if (W.audio) W.audio.slay(); });
  }

  // the land: the wall's ridge round a valley, mountains beyond
  function terrain(ctx, low) {
    var THREE = ctx.THREE, trk = ctx.track;
    var X0 = -560, X1 = 560, Z0 = -520, Z1 = 520, step = low ? 8 : 4;
    var nx = Math.round((X1 - X0) / step), nz = Math.round((Z1 - Z0) / step);
    var geo = new THREE.PlaneGeometry(X1 - X0, Z1 - Z0, nx, nz); geo.rotateX(-PI / 2); geo.translate((X0 + X1) / 2, 0, (Z0 + Z1) / 2);
    var pos = geo.attributes.position, n = pos.count;
    var col = new Float32Array(n * 3), c = new THREE.Color();
    for (var i = 0; i < n; i++) {
      var x = pos.getX(i), z = pos.getZ(i), h = landAt(x, z, trk);
      pos.setY(i, h);
    }
    geo.computeVertexNormals();
    var nrm = geo.attributes.normal;
    var SNOW = new THREE.Color('#F2F4F8'), SNOW2 = new THREE.Color('#DDE3EE'), ROCK = new THREE.Color('#58545A'), ROCK2 = new THREE.Color('#7A7472'), SCRUB = new THREE.Color('#3E463F');
    for (i = 0; i < n; i++) {
      var x0 = pos.getX(i), z0 = pos.getZ(i), y0 = pos.getY(i), ny = nrm.getY(i);
      // snow lies on anything short of a cliff; rock shows in patches on the
      // steepest faces, more of it toward the crests where the wind strips it
      var steep = 1 - smooth(0.48, 0.78, ny), patch = smooth(0.38, 0.72, fbm(x0 * 0.011 + 3, z0 * 0.011 - 2));
      var rock = clamp(steep * (0.35 + 0.9 * patch) + smooth(60, 160, y0) * steep * 0.3, 0, 1), nz1 = noise(x0 * 0.06, z0 * 0.06);
      c.copy(SNOW).lerp(SNOW2, nz1 * 0.6);
      c.lerp(ROCK.clone().lerp(ROCK2, noise(x0 * 0.05, z0 * 0.05)), rock * 0.82);
      if (rock > 0.3 && noise(x0 * 0.2, z0 * 0.2) > 0.7) c.lerp(SCRUB, 0.35);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    W.M.grain.repeat.set((X1 - X0) / 9, (Z1 - Z0) / 9);
    var mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, map: W.M.grain, roughness: 0.9 }));
    mesh.receiveShadow = true; ctx.scene.add(mesh);
    W.height = function (x, z) {
      var fx = (x - X0) / step, fz = (z - Z0) / step, ix = clamp(Math.floor(fx), 0, nx - 1), iz = clamp(Math.floor(fz), 0, nz - 1), tx = fx - ix, tz = fz - iz;
      function H(a, b) { return pos.getY(b * (nx + 1) + a); }
      return lerp(lerp(H(ix, iz), H(ix + 1, iz), tx), lerp(H(ix, iz + 1), H(ix + 1, iz + 1), tx), tz);
    };
  }
  // the height of the land at (x, z): under the wall it is the wall's
  // foundation; the ridge falls away on both sides, into the valley within
  // the ring and to the foot of the mountains beyond it
  function landAt(x, z, trk) {
    var r = Math.hypot(x / 1.12, z), nr = trk.nearest(x, z), d = nr.distance;
    var floor = -34 + fbm(x * 0.008, z * 0.008) * 10;
    // beyond the ring the mountains rise, crag on crag
    var outside = smooth(150, 420, r);
    var mount = outside * (40 + 150 * ridged(x * 0.004 + 3, z * 0.004 - 1) + 60 * fbm(x * 0.01, z * 0.01)) * smooth(160, 330, r);
    var land = floor + mount;
    var foot = nr.y - BASE;
    var fall = d < WALK + PARA + 1.5 ? 0 : Math.pow(d - WALK - PARA - 1.5, 1.12) * (0.46 + 0.2 * noise(x * 0.02, z * 0.02));
    var ridge = foot - fall + (d > 12 ? (fbm(x * 0.03, z * 0.03) - 0.5) * 6 * smooth(12, 40, d) : 0);
    var h = Math.max(ridge, land);
    // never above the walk's foundation near the wall
    if (d < WALK + PARA + 6) h = Math.min(h, foot + smooth(WALK + PARA + 1, WALK + PARA + 6, d) * 2.5);
    return h;
  }

  // the wall: a paved walk, a parapet on each side topped with merlons, and
  // the brick faces running down to the rock
  function wall(ctx, low) {
    var THREE = ctx.THREE, M = W.M, L = ctx.track.length, trk = ctx.track;
    var walk = trk.ribbon({ width: WALK * 2, material: M.walk, tile: 5.2, y: 0.02, step: 1.5 });
    walk.material.map.repeat.set(2.3, 1); walk.material.normalMap.repeat.set(2.3, 1); ctx.scene.add(walk);
    // a line of packed snow down each side of the racing lane, and the lane's edge in brick
    // snow drifted against the parapets, feathering out onto the stone
    var drift = ctx.textures.canvas(64, 256, function (g, w, h) {
      g.clearRect(0, 0, w, h);
      for (var y = 0; y < h; y++) { var reach = 0.55 + 0.35 * noise(y * 0.05, 1.3) + 0.1 * noise(y * 0.3, 4.1); var gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, 'rgba(236,240,246,1)'); gr.addColorStop(reach * 0.7, 'rgba(236,240,246,0.9)'); gr.addColorStop(reach, 'rgba(236,240,246,0)'); g.fillStyle = gr; g.fillRect(0, y, w, 1); }
    });
    drift.wrapT = THREE.RepeatWrapping;
    [-1, 1].forEach(function (sd) {
      var m = new THREE.MeshStandardMaterial({ map: drift, transparent: true, depthWrite: false, roughness: 0.9 });
      var rb = trk.ribbon({ width: 1.8, offset: sd * (WALK - 0.9), y: 0.05, tile: 9, material: m });
      // the ribbon's u runs across the lane; the drift must thicken toward the wall on both sides
      if (sd < 0) { var uv = rb.geometry.attributes.uv; for (var q = 0; q < uv.count; q++) uv.setX(q, 1 - uv.getX(q)); }
      rb.renderOrder = 1; ctx.scene.add(rb);
    });
    // the tower footprints: the parapet steps round them
    var towerAt = [];
    for (var k = 0; k <= TOWERS; k++) towerAt.push(k / (TOWERS + 1) * L);
    W.towerAt = towerAt;
    function inTower(d) { for (var q = 0; q < towerAt.length; q++) { var dd = Math.abs(((d - towerAt[q]) % L + L * 1.5) % L - L / 2); if (dd < (q === 0 ? 9.5 : 5.5)) return true; } return false; }
    // both sides as one strip each: the inner face of the parapet, its top,
    // and the outer face all the way down to the ground
    var step = 1.5, nS = Math.round(L / step), F = { pos: new THREE.Vector3(), right: new THREE.Vector3() };
    [-1, 1].forEach(function (sd) {
      var P = [], UV = [], I = [], row = 0;
      for (var s = 0; s <= nS; s++) {
        var d = s / nS * L, fr = trk.frameAt(d);
        var inner = sd * WALK, outer = sd * (WALK + PARA), topY = PARA_H;
        var ox = fr.pos.x + fr.right.x * outer, oz = fr.pos.z + fr.right.z * outer;
        var ground = Math.min(W.height(ox, oz), fr.pos.y - BASE) - 1.2;
        // four points across: walk level inside, the top inside and outside, the ground outside
        var pts = [[inner, fr.pos.y], [inner, fr.pos.y + topY], [outer, fr.pos.y + topY], [outer, ground]];
        var vv = [0, topY, topY + PARA, topY + PARA + (fr.pos.y + topY - ground)];
        pts.forEach(function (p, j) {
          P.push(fr.pos.x + fr.right.x * p[0], p[1], fr.pos.z + fr.right.z * p[0]);
          UV.push(d / 3.0, vv[j] / 1.9);
        });
        if (s < nS) for (var j = 0; j < 3; j++) { var a0 = row + j, b0 = row + 4 + j; if (sd > 0) I.push(a0, b0, a0 + 1, a0 + 1, b0, b0 + 1); else I.push(a0, a0 + 1, b0, a0 + 1, b0 + 1, b0); }
        row += 4;
      }
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2)); g.setIndex(I); g.computeVertexNormals();
      var m = new THREE.Mesh(g, M.brick); m.castShadow = true; m.receiveShadow = true; m.userData.gmTrack = true;
      ctx.scene.add(m);
    });
    // merlons: brick teeth along both parapets, a loophole in every other one
    var list = [];
    for (var d2 = 0.8; d2 < L; d2 += 1.7) { if (inTower(d2)) continue; list.push([d2, -1], [d2, 1]); }
    var mg = new THREE.BoxGeometry(1.0, MERLON_H, PARA).translate(0, MERLON_H / 2, 0); setUV(mg, 3);
    var mer = ctx.instanced(mg, M.brick, list.length, function (n, o) {
      var fr = trk.frameAt(list[n][0]), sd = list[n][1], off = sd * (WALK + PARA / 2);
      o.position.set(fr.pos.x + fr.right.x * off, fr.pos.y + PARA_H, fr.pos.z + fr.right.z * off);
      o.rotation.y = Math.atan2(fr.tan.x, fr.tan.z);
    });
    // the parapets stand clear of the lane by construction (their inner face is
    // WALK metres from the centre line, over a metre beyond the corridor); the
    // runtime's guard boxes each tooth square to the world, which on a
    // diagonal reaches in, so the teeth are marked as part of the track
    mer.castShadow = true; mer.receiveShadow = true; mer.userData.gmTrack = true; ctx.scene.add(mer);
    // a cap of snow on each merlon, and along the parapet tops
    var cap = ctx.instanced(new THREE.BoxGeometry(1.06, 0.08, PARA + 0.06).translate(0, MERLON_H + 0.04, 0), M.snow, list.length, function (n, o) {
      var fr = trk.frameAt(list[n][0]), sd = list[n][1], off = sd * (WALK + PARA / 2);
      o.position.set(fr.pos.x + fr.right.x * off, fr.pos.y + PARA_H, fr.pos.z + fr.right.z * off);
      o.rotation.y = Math.atan2(fr.tan.x, fr.tan.z);
    });
    cap.userData.gmTrack = true; ctx.scene.add(cap);
    // lanterns on posts set into the parapet, on alternate sides
    var lamp = [];
    for (var d3 = 12.3; d3 < L; d3 += 25.5) if (!inTower(d3)) lamp.push([d3, (Math.round(d3 / 25.5) % 2) ? 1 : -1]);
    W.lampPts = lamp.map(function (l) { var fr = trk.frameAt(l[0]); var off = l[1] * (WALK + PARA / 2); return new THREE.Vector3(fr.pos.x + fr.right.x * off, fr.pos.y + PARA_H, fr.pos.z + fr.right.z * off); });
    var post = ctx.instanced(new THREE.CylinderGeometry(0.06, 0.08, 1.9, 6).translate(0, 0.95, 0), M.wood, lamp.length, function (n, o) { o.position.copy(W.lampPts[n]); });
    ctx.scene.add(post);
    lanterns(ctx, W.lampPts.map(function (p) { return p.clone().add(new THREE.Vector3(0, 1.62, 0)); }), 0.3);
    // banners on tall poles above the parapets, every sixth lantern
    var bannerPts = [];
    for (var d4 = 30; d4 < L; d4 += 64) if (!inTower(d4)) { var fr4 = trk.frameAt(d4), sd4 = (Math.round(d4 / 64) % 2) ? 1 : -1, off4 = sd4 * (WALK + PARA / 2); bannerPts.push({ p: new THREE.Vector3(fr4.pos.x + fr4.right.x * off4, fr4.pos.y + PARA_H + MERLON_H, fr4.pos.z + fr4.right.z * off4), yaw: Math.atan2(fr4.tan.x, fr4.tan.z) }); }
    banners(ctx, bannerPts, low);
  }

  // red paper lanterns that glow: one instanced mesh, their flicker in update
  function lanterns(ctx, pts, size) {
    var THREE = ctx.THREE;
    var body = new THREE.SphereGeometry(size, 14, 10); body.scale(1, 1.18, 1);
    var mat = new THREE.MeshStandardMaterial({ color: '#A8231C', emissive: '#FF6A2A', emissiveIntensity: 2.4, roughness: 0.6 });
    var im = ctx.instanced(body, mat, pts.length, function (n, o) { o.position.copy(pts[n]); });
    ctx.scene.add(im);
    var capG = new THREE.CylinderGeometry(size * 0.55, size * 0.55, size * 0.18, 12);
    var caps = ctx.instanced(capG, W.M.iron, pts.length * 2, function (n, o) { o.position.copy(pts[n >> 1]).add(new THREE.Vector3(0, (n & 1 ? -1 : 1) * size * 1.12, 0)); });
    ctx.scene.add(caps);
    (W.lanternMats || (W.lanternMats = [])).push(mat);
    return im;
  }

  // tall nobori banners in brush lettering that ripple in the wind
  function banners(ctx, pts, low) {
    var THREE = ctx.THREE, words = ['長城', '忍', '風', '雪', '刃'];
    var poles = ctx.instanced(new THREE.CylinderGeometry(0.05, 0.06, 5.2, 6).translate(0, 2.6, 0), W.M.wood, pts.length, function (n, o) { o.position.copy(pts[n].p); });
    ctx.scene.add(poles);
    var geo = new THREE.PlaneGeometry(0.9, 3.2, 1, 12).translate(0.45, 3.2, 0);
    words.forEach(function (wd, wi) {
      var mine = pts.filter(function (_, n) { return n % words.length === wi; });
      if (!mine.length) return;
      var tex = brush(ctx, wd, { size: 150, vertical: true, w: 256, h: 820, paper: '#D9CBB0', color: '#16100C', seed: 11 + wi, dry: 0.7, splatter: 3 });
      var mat = new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.9 });
      wave(mat, 0.9);
      // the cloth hangs along the wall, off the pole, never over the lane
      mine.forEach(function (b) { var m = new THREE.Mesh(geo, mat); m.position.copy(b.p); m.rotation.y = b.yaw - PI / 2; m.castShadow = true; ctx.scene.add(m); });
    });
  }
  // a cloth ripple in the vertex shader: stronger away from the pole
  function wave(mat, width) {
    mat.onBeforeCompile = function (sh) {
      sh.uniforms.uTime = W.time;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', [
        '#include <begin_vertex>',
        'float k = clamp(position.x / ' + width.toFixed(2) + ', 0.0, 1.0);',
        'transformed.z += sin(uTime * 3.1 + position.y * 1.7 - position.x * 4.0) * 0.16 * k + sin(uTime * 5.3 + position.y * 3.1) * 0.04 * k;',
      ].join('\n'));
    };
  }

  // a Chinese hip roof: a concave pyramid over a rectangle, its eaves swept
  // up at the corners, with a thickness (a fascia under the eave line), four
  // hip ridges and a main ridge in dark clay, and snow on the upper slopes
  function hipRoof(THREE, w, d, h, over, lift) {
    var N = 18, P = [], I = [], UVs = [];
    var W2 = w / 2 + over, D2 = d / 2 + over;
    function y(u, v) { var m = Math.max(Math.abs(u), Math.abs(v)); return h * Math.pow(1 - m, 0.85) + lift * Math.pow(Math.abs(u * v), 2.2) * Math.pow(m, 3); }
    for (var j = 0; j <= N; j++) for (var i = 0; i <= N; i++) {
      var u = i / N * 2 - 1, v = j / N * 2 - 1;
      P.push(u * W2, y(u, v), v * D2); UVs.push(u * W2 / 2.4, v * D2 / 2.4 + y(u, v) / 2.4);
    }
    for (j = 0; j < N; j++) for (i = 0; i < N; i++) { var a = j * (N + 1) + i; I.push(a, a + N + 1, a + 1, a + 1, a + N + 1, a + N + 2); }
    // the fascia: a band hanging from the eave line all round
    var base = P.length / 3, ring = [];
    for (i = 0; i <= N; i++) ring.push([i, 0]); for (j = 1; j <= N; j++) ring.push([N, j]); for (i = N - 1; i >= 0; i--) ring.push([i, N]); for (j = N - 1; j >= 1; j--) ring.push([0, j]);
    ring.forEach(function (rc) { var u = rc[0] / N * 2 - 1, v = rc[1] / N * 2 - 1, yy = y(u, v); P.push(u * W2, yy, v * D2, u * W2 * 0.985, yy - 0.32, v * D2 * 0.985); UVs.push(0, 0, 0, 0.2); });
    for (var k = 0; k < ring.length; k++) { var q = base + k * 2, q2 = base + ((k + 1) % ring.length) * 2; I.push(q, q + 1, q2, q2, q + 1, q2 + 1); }
    var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(UVs, 2)); g.setIndex(I); g.computeVertexNormals();
    return { geo: g, y: y, W2: W2, D2: D2, h: h };
  }
  function roofWith(ctx, parts, w, d, h, over, lift, yOff) {
    var THREE = ctx.THREE, M = W.M, R = hipRoof(THREE, w, d, h, over, lift);
    parts.put(R.geo, M.roof, 0, yOff, 0);
    // ridges: tubes along the four hips and the main ridge, and a curl at each corner
    function along(pts, r) { parts.put(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, r, 6, false), W.M.ridge, 0, yOff, 0); }
    var top = R.y(0, 0);
    [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(function (c) {
      var pts = []; for (var k = 0; k <= 8; k++) { var t = k / 8; pts.push(new THREE.Vector3(c[0] * R.W2 * t, R.y(c[0] * t, c[1] * t) + 0.12, c[1] * R.D2 * t)); }
      along(pts, 0.14);
      parts.put(new THREE.ConeGeometry(0.16, 0.9, 6), W.M.ridge, c[0] * R.W2, R.y(c[0], c[1]) + 0.45 + yOff, c[1] * R.D2, c[1] * -0.5, 0, c[0] * 0.5);
    });
    var long = w > d, rl = Math.abs((long ? w : d) - (long ? d : w)) / 2 + 0.3;
    along([new THREE.Vector3(long ? -rl : 0, top + 0.16, long ? 0 : -rl), new THREE.Vector3(long ? rl : 0, top + 0.16, long ? 0 : rl)], 0.2);
    // snow on the upper slopes: the same surface a hand's breadth above, clipped to its crown
    var S = hipRoof(THREE, w * 0.86, d * 0.86, h * 0.9, over * 0.6, lift * 0.2);
    parts.put(S.geo, M.snow, 0, yOff + 0.18 + h * 0.08, 0);
    return R;
  }
  // a tower's parts, merged by material into one mesh each, so a tower costs
  // a handful of draw calls instead of fifty
  function Parts(THREE) {
    var list = [], dummy = new THREE.Object3D();
    return {
      put: function (geo, mat, x, y, z, rx, ry, rz) {
        dummy.position.set(x || 0, y || 0, z || 0); dummy.rotation.set(rx || 0, ry || 0, rz || 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
        list.push({ geo: geo, mat: mat, m: dummy.matrix.clone() });
      },
      flush: function (parent, flags) {
        var byMat = new Map();
        list.forEach(function (p) { if (!byMat.has(p.mat)) byMat.set(p.mat, []); byMat.get(p.mat).push(p); });
        byMat.forEach(function (ps, mat) {
          var geos = ps.map(function (p) { var g = (p.geo.index ? p.geo.toNonIndexed() : p.geo.clone()); g.applyMatrix4(p.m); if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); return g; });
          var n = 0; geos.forEach(function (g) { n += g.attributes.position.count; });
          var P = new Float32Array(n * 3), N = new Float32Array(n * 3), U = new Float32Array(n * 2), o = 0;
          geos.forEach(function (g) { P.set(g.attributes.position.array, o * 3); N.set(g.attributes.normal.array, o * 3); U.set(g.attributes.uv.array.subarray(0, g.attributes.position.count * 2), o * 2); o += g.attributes.position.count; });
          var out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(P, 3)); out.setAttribute('normal', new THREE.BufferAttribute(N, 3)); out.setAttribute('uv', new THREE.BufferAttribute(U, 2));
          var mesh = new THREE.Mesh(out, mat); mesh.castShadow = true; mesh.receiveShadow = true;
          if (flags) Object.assign(mesh.userData, flags);
          parent.add(mesh);
        });
      },
    };
  }

  // one watchtower across the walk: two bastions outside the lane, a vault
  // over it well above the corridor, a room with arched windows, merlons, a
  // pavilion roof, lanterns at the passage
  function tower(ctx, d, big) {
    var THREE = ctx.THREE, M = W.M, trk = ctx.track, L = trk.length;
    var depth = big ? 16 : 9, half = big ? 15 : 10.5, deck = big ? 10 : 8.6;
    // the highest the walk rises under the tower: the vault clears it by the corridor and more
    var top = -1e9, fr = trk.frameAt(d);
    for (var s2 = -depth / 2; s2 <= depth / 2; s2 += 1) top = Math.max(top, trk.frameAt(((d + s2) % L + L) % L).pos.y);
    var g = new THREE.Group();
    g.position.copy(fr.pos); g.position.y = top; g.rotation.y = Math.atan2(fr.tan.x, fr.tan.z);
    var parts = Parts(THREE);
    function box(w, h, dd, uv) { var b = new THREE.BoxGeometry(w, h, dd); if (uv) setUV(b, 3); return b; }
    // everything below is in the tower's own frame, whose origin is the walk's highest point under it
    var ground = -BASE - 7;
    // bastions: brick, from the rock to the deck, outside the lane (they stand
    // clear of it by construction; see wall())
    [-1, 1].forEach(function (sd) {
      var inner = WALK + 0.05, w = half - inner, hgt = deck - ground;
      parts.put(box(w, hgt, depth, true), M.brick, sd * (inner + w / 2), ground + hgt / 2, 0);
    });
    // the vault over the lane, its underside above the corridor, and a
    // plaster lintel on each face of it
    var vb = deck - 7.8;
    parts.put(box(2 * WALK + 0.2, vb, depth, true), M.brick, 0, 7.8 + vb / 2, 0);
    [-1, 1].forEach(function (sd) { parts.put(box(2 * WALK + 0.8, 0.5, 0.3), M.plaster, 0, 8.05, sd * (depth / 2 + 0.1)); });
    // the room above: walls with windows drawn on, merlons round the deck
    parts.put(box(half * 2 - 1.2, 3.6, depth - 1.2), roomMat(ctx), 0, deck + 1.8, 0);
    for (var x = -half + 0.9; x <= half - 0.9; x += 1.8) { parts.put(box(0.9, 0.9, 0.9, true), M.brick, x, deck + 0.45, depth / 2 - 0.4); parts.put(box(0.9, 0.9, 0.9, true), M.brick, x, deck + 0.45, -depth / 2 + 0.4); }
    for (var z = -depth / 2 + 1.6; z <= depth / 2 - 1.6; z += 1.8) { parts.put(box(0.9, 0.9, 0.9, true), M.brick, half - 0.4, deck + 0.45, z); parts.put(box(0.9, 0.9, 0.9, true), M.brick, -half + 0.4, deck + 0.45, z); }
    parts.put(box(half * 2, 0.4, depth, true), M.brick, 0, deck - 0.2, 0);
    // the pavilion: red columns and a swept roof of dark tiles, snow on it
    var ph = big ? 4.2 : 3.4, pw = half * 2 - 3, pd = depth - 2.4;
    [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1]].forEach(function (c) {
      parts.put(new THREE.CylinderGeometry(0.22, 0.24, ph, 10), M.lacquer, c[0] * (pw / 2 - 0.4), deck + 3.6 + ph / 2, c[1] * (pd / 2 - 0.4));
    });
    roofWith(ctx, parts, pw, pd, big ? 5.2 : 4.2, 1.3, 1.8, deck + 3.6 + ph);
    if (big) {
      // the Gate's upper storey and second roof
      parts.put(box(pw * 0.62, 2.6, pd * 0.62), roomMat(ctx), 0, deck + 3.6 + ph + 2.4, 0);
      roofWith(ctx, parts, pw * 0.66, pd * 0.66, 3.8, 1.1, 1.5, deck + 3.6 + ph + 3.7);
    }
    parts.flush(g, { gmTrack: true });
    // lanterns at the passage, on the bastion corners, outside the lane
    var lp = [];
    [-1, 1].forEach(function (sd) { [-1, 1].forEach(function (fz) { lp.push(new THREE.Vector3(sd * (WALK + 1.25), 5.6, fz * (depth / 2 + 0.45))); }); });
    g.updateMatrixWorld(true);
    lanterns(ctx, lp.map(function (p) { return p.applyMatrix4(g.matrixWorld); }), big ? 0.55 : 0.42);
    ctx.scene.add(g);
    return g;
  }
  function setUV(geo, s) {
    var uv = geo.attributes.uv, p = geo.attributes.position, nm = geo.attributes.normal;
    for (var i = 0; i < uv.count; i++) {
      var ax = Math.abs(nm.getX(i)) > 0.5 ? p.getZ(i) : p.getX(i);
      uv.setXY(i, ax / s, p.getY(i) / (s * 0.633));
    }
  }
  var roomM = null;
  function roomMat(ctx) {
    if (roomM) return roomM;
    var tex = ctx.textures.canvas(512, 256, function (g, w, h) {
      g.fillStyle = '#8C8176'; g.fillRect(0, 0, w, h);
      var r = rng(8);
      for (var y = 0; y < h; y += 16) for (var x = -((y / 16) % 2) * 24; x < w; x += 48) { var v = 110 + r() * 40 | 0; g.fillStyle = 'rgb(' + (v + 10) + ',' + v + ',' + (v - 10) + ')'; g.fillRect(x + 2, y + 2, 45, 13); }
      // three arched windows, warm light inside
      for (var k = 0; k < 3; k++) {
        var cx = w * (0.2 + k * 0.3), top = h * 0.3, ww = w * 0.08;
        g.fillStyle = '#2A1A12'; g.beginPath(); g.moveTo(cx - ww, h * 0.85); g.lineTo(cx - ww, top + ww); g.arc(cx, top + ww, ww, PI, 0); g.lineTo(cx + ww, h * 0.85); g.fill();
        g.fillStyle = 'rgba(255,150,70,0.55)'; g.fillRect(cx - ww * 0.7, top + ww, ww * 1.4, h * 0.85 - top - ww);
      }
    });
    tex.wrapS = ctx.THREE.RepeatWrapping; roomM = new ctx.THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, emissive: '#FF8A3A', emissiveMap: tex, emissiveIntensity: 0.25 });
    return roomM;
  }

  function towers(ctx) { for (var k = 1; k <= TOWERS; k++) tower(ctx, W.towerAt[k], false); }

  // the Grand Gate: the start and finish, a great tower with a two-tier
  // roof, a plaque in brush lettering, and the Emperor's lanterns
  function gate(ctx) {
    var THREE = ctx.THREE, g = tower(ctx, 0, true);
    var plaque = brush(ctx, '天下第一關', { size: 150, w: 1024, h: 230, paper: '#1E2A3A', color: '#E3C27A', seed: 3, dry: 0.5, splatter: 0 });
    var frame = new THREE.Mesh(new THREE.BoxGeometry(9.6, 2.3, 0.3), W.M.lacquer);
    [-1, 1].forEach(function (sd) {
      var f = frame.clone(); f.position.set(0, 9.2, sd * 8.3); g.add(f);
      var p = new THREE.Mesh(new THREE.PlaneGeometry(9, 2), new THREE.MeshStandardMaterial({ map: plaque, roughness: 0.6, emissive: '#FFFFFF', emissiveMap: plaque, emissiveIntensity: 0.18 }));
      p.position.set(0, 9.2, sd * 8.47); if (sd < 0) p.rotation.y = PI; g.add(p);
    });
    // the line: a band of red lacquer and gold across the walk
    var F = ctx.track.frameAt(0);
    var band = new THREE.Mesh(new THREE.PlaneGeometry(WALK * 2, 0.7).rotateX(-PI / 2), new THREE.MeshStandardMaterial({ color: '#8E1B1B', roughness: 0.5 }));
    band.position.copy(F.pos).add(new THREE.Vector3(0, 0.04, 0)); band.rotation.y = Math.atan2(F.tan.x, F.tan.z); band.userData.gmTrack = true; ctx.scene.add(band);
    W.gate = g;
  }

  // the ranges beyond: layered ridgelines paling into the haze, the Wall
  // snaking over the nearest of them with its towers
  function ranges(ctx, low) {
    var THREE = ctx.THREE;
    var layers = [[620, 150, '#5C5A6E', 0.004], [900, 230, '#7A7488', 0.003], [1250, 320, '#9C8F9C', 0.0022]];
    layers.forEach(function (Lr, li) {
      var R = Lr[0], H = Lr[1], N = low ? 180 : 360, P = [], I = [];
      for (var i = 0; i <= N; i++) {
        var a = i / N * TAU, x = Math.cos(a) * R, z = Math.sin(a) * R;
        var h = H * (0.35 + 0.65 * ridged(x * Lr[3] + li * 7, z * Lr[3] - li * 3)) * (0.7 + 0.3 * noise(a * 3 + li, 1.3));
        P.push(x, -80, z, x, h, z);
        if (i < N) { var q = i * 2; I.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
        if (li === 0) (W.farRidge || (W.farRidge = [])).push([x, h, z]);
      }
      var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(I); g.computeVertexNormals();
      var m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: Lr[2], side: THREE.DoubleSide, fog: true }));
      m.userData.noReflection = true; m.renderOrder = -10 + li; ctx.scene.add(m);
    });
    // the Wall on the far ridge: a band just under the crest, a tower every so often
    var fr = W.farRidge, P = [], I = [], towersAt = [];
    for (var i2 = 0; i2 < fr.length; i2++) {
      var p = fr[i2], k = 0.985; // just inside the ridge, so it rides the crest
      P.push(p[0] * k, p[1] - 9, p[2] * k, p[0] * k, p[1] - 1.5, p[2] * k);
      if (i2 < fr.length - 1) { var q = i2 * 2; I.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
      if (i2 % 14 === 0) towersAt.push(new THREE.Vector3(p[0] * k, p[1] - 1.5, p[2] * k));
    }
    var wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); wg.setIndex(I);
    var far = new THREE.Mesh(wg, new THREE.MeshBasicMaterial({ color: '#4A4658', side: THREE.DoubleSide })); far.userData.noReflection = true; ctx.scene.add(far);
    ctx.scene.add(ctx.instanced(new THREE.BoxGeometry(9, 9, 9).translate(0, 4.5, 0), new THREE.MeshBasicMaterial({ color: '#433F50' }), towersAt.length, function (n, o) { o.position.copy(towersAt[n]); }));
  }

  // drifting mist banks at several depths in the valleys, and curtains of
  // haze round the horizon (Shinobi Duel's Surround.ts)
  function mist(ctx, low) {
    var THREE = ctx.THREE, sunV = new THREE.Vector3(SUN[0], SUN[1], SUN[2]);
    var VERT = 'varying vec3 vW; varying vec2 vUv; void main() { vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }';
    var NOISE = [
      'float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
      'float n2(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }',
      'float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * n2(p); p = p * 2.02 + 1.7; a *= 0.5; } return s; }',
    ].join('\n');
    var MIST = [
      'uniform float uTime, uAlpha, uScale; uniform vec3 uSun, uCold, uWarm; varying vec3 vW; varying vec2 vUv;', NOISE,
      'void main() {',
      '  vec2 p = vW.xz * uScale + vec2(uTime * 0.012, uTime * 0.004);',
      '  float n = fbm(p + fbm(p * 0.7 - uTime * 0.01) * 1.4);',
      '  float edge = 1.0 - smoothstep(0.35, 0.5, length(vUv - 0.5));',
      '  float a = smoothstep(0.3, 0.75, n) * uAlpha * edge;',
      '  vec3 v = normalize(vW - cameraPosition);',
      '  float s = pow(max(dot(normalize(v.xz), normalize(uSun.xz)), 0.0), 3.0);',
      '  gl_FragColor = vec4(mix(uCold, uWarm, s) * (0.75 + n * 0.5), a);',
      '}',
    ].join('\n');
    var CURTAIN = [
      'uniform float uTime, uAlpha; uniform vec3 uSun, uCold, uWarm; varying vec3 vW; varying vec2 vUv;', NOISE,
      'void main() {',
      '  vec2 p = vec2(vUv.x * 40.0 + uTime * 0.01, vUv.y * 3.0);',
      '  float n = fbm(p);',
      '  float fade = (1.0 - smoothstep(0.15, 0.95, vUv.y)) * smoothstep(0.0, 0.08, vUv.y);',
      '  float a = clamp(n * 1.4 - 0.25, 0.0, 1.0) * fade * uAlpha;',
      '  vec3 v = normalize(vW - cameraPosition);',
      '  float s = pow(max(dot(normalize(v.xz), normalize(uSun.xz)), 0.0), 2.5);',
      '  gl_FragColor = vec4(mix(uCold, uWarm, s) * (0.8 + n * 0.4), a);',
      '}',
    ].join('\n');
    function sheet(y, size, alpha, scale, cold, warm) {
      var m = new THREE.ShaderMaterial({ uniforms: { uTime: W.time, uSun: { value: sunV }, uCold: { value: new THREE.Color().setRGB(cold[0], cold[1], cold[2]) }, uWarm: { value: new THREE.Color().setRGB(warm[0], warm[1], warm[2]) }, uAlpha: { value: alpha }, uScale: { value: scale } },
        vertexShader: VERT, fragmentShader: MIST, transparent: true, depthWrite: false, fog: false });
      var mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size).rotateX(-PI / 2), m);
      mesh.position.y = y; mesh.renderOrder = 2; mesh.userData.noReflection = true; mesh.userData.gmTrack = true; ctx.scene.add(mesh);
    }
    sheet(-31, 1500, 0.95, 0.012, [0.27, 0.26, 0.34], [0.95, 0.52, 0.34]);
    sheet(-25, 1200, 0.62, 0.02, [0.3, 0.29, 0.37], [1.0, 0.56, 0.37]);
    if (!low) sheet(-18, 900, 0.34, 0.032, [0.33, 0.32, 0.4], [1.05, 0.6, 0.4]);
    // long cloud banks round the horizon, lit from the low sun, streaked like brushwork
    var CLOUD = [
      'uniform float uTime; uniform vec3 uSun; varying vec3 vW; varying vec2 vUv;', NOISE,
      'void main() {',
      '  vec2 p = vec2(vUv.x * 60.0 + uTime * 0.004, vUv.y * 5.0);',
      '  float n = fbm(p * vec2(1.0, 1.6)) * 0.7 + fbm(p * vec2(0.35, 3.2) + 9.0) * 0.5;',
      '  float band = smoothstep(0.08, 0.3, vUv.y) * (1.0 - smoothstep(0.45, 0.85, vUv.y));',
      '  float a = smoothstep(0.4, 0.8, n) * band * 0.85;',
      '  vec3 v = normalize(vW - cameraPosition);',
      '  float s = pow(max(dot(normalize(v.xz), normalize(uSun.xz)), 0.0), 3.0);',
      '  vec3 lit = mix(vec3(0.62, 0.6, 0.72), vec3(1.25, 0.78, 0.55), s) * (0.8 + n * 0.35);',
      '  gl_FragColor = vec4(lit, a);',
      '}',
    ].join('\n');
    var cm = new THREE.ShaderMaterial({ uniforms: { uTime: W.time, uSun: { value: sunV } }, vertexShader: VERT, fragmentShader: CLOUD, transparent: true, depthWrite: false, side: THREE.BackSide, fog: false });
    var clouds = new THREE.Mesh(new THREE.CylinderGeometry(1350, 1350, 520, 96, 1, true), cm);
    clouds.position.y = 190; clouds.renderOrder = -5; clouds.userData.noReflection = true; clouds.userData.gmTrack = true; ctx.scene.add(clouds);
    [[480, 60, -40, 0.32], [760, 120, -50, 0.4], [1100, 220, -60, 0.55]].forEach(function (c) {
      var m = new THREE.ShaderMaterial({ uniforms: { uTime: W.time, uSun: { value: sunV }, uCold: { value: new THREE.Color().setRGB(0.3, 0.28, 0.36) }, uWarm: { value: new THREE.Color().setRGB(1.05, 0.58, 0.4) }, uAlpha: { value: c[3] } },
        vertexShader: VERT, fragmentShader: CURTAIN, transparent: true, depthWrite: false, side: THREE.BackSide, fog: false });
      var mesh = new THREE.Mesh(new THREE.CylinderGeometry(c[0], c[0], c[1], 64, 1, true), m);
      mesh.position.y = c[2] + c[1] / 2; mesh.renderOrder = 1; mesh.userData.noReflection = true; mesh.userData.gmTrack = true; ctx.scene.add(mesh);
    });
  }

  // snow-laden pines on the slopes below the wall
  function pines(ctx, low) {
    var THREE = ctx.THREE, R = rng(21), spots = [], trk = ctx.track;
    var want = low ? 700 : 1800, guard = 0;
    while (spots.length < want && guard++ < 40000) {
      var x = -520 + R() * 1040, z = -480 + R() * 960, nr = trk.nearest(x, z);
      if (nr.distance < WALK + 14) continue;
      var h = W.height(x, z);
      if (h > nr.y - BASE + 1) continue; // not up on the ridge beside the walk
      if (noise(x * 0.018, z * 0.018) < 0.42) continue; // in stands, not evenly
      var dh = Math.abs(W.height(x + 3, z) - h) + Math.abs(W.height(x, z + 3) - h);
      if (dh > 5) continue; // not on sheer rock
      spots.push([x, h, z, 0.7 + R() * 0.8, R() * TAU]);
    }
    // a spruce: tiers of drooping, ragged skirts, narrower as they climb
    var tiers = [], TR = rng(5);
    for (var ti = 0; ti < 6; ti++) {
      var r0 = 2.5 - ti * 0.36, y0 = 1.0 + ti * 1.05, hh = 1.9 - ti * 0.12;
      var cg = new THREE.ConeGeometry(r0, hh, 12, 2, true);
      var cp = cg.attributes.position;
      for (var q = 0; q < cp.count; q++) {
        var cx = cp.getX(q), cy = cp.getY(q), cz = cp.getZ(q), rad = Math.hypot(cx, cz);
        if (rad > 0.05) { var a2 = Math.atan2(cz, cx), jag = 1 + (TR() - 0.5) * 0.25 + 0.12 * Math.sin(a2 * 5 + ti); cp.setXYZ(q, cx * jag, cy - (cy < 0 ? 0.25 * (jag - 0.9) : 0), cz * jag); }
      }
      cg.translate(0, y0 + hh / 2, 0); cg.computeVertexNormals(); tiers.push(cg);
    }
    function mergeAll(list) {
      var n = 0; list.forEach(function (g) { n += g.toNonIndexed().attributes.position.count; });
      var pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), o = 0;
      list.forEach(function (g) { g = g.toNonIndexed(); g.computeVertexNormals(); pos.set(g.attributes.position.array, o); nor.set(g.attributes.normal.array, o); o += g.attributes.position.count * 3; });
      var out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); return out;
    }
    var place = function (n, o) { var s = spots[n]; o.position.set(s[0], s[1] - 0.3, s[2]); o.scale.setScalar(s[3]); o.rotation.y = s[4]; };
    // snow settles on whatever faces up; the rest is dark needles
    var needleMat = new THREE.MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.9, side: THREE.DoubleSide });
    needleMat.onBeforeCompile = function (sh) {
      sh.vertexShader = 'varying vec3 vWN; varying vec3 vWP;\n' + sh.vertexShader.replace('#include <begin_vertex>', [
        '#include <begin_vertex>',
        '#ifdef USE_INSTANCING',
        '  vWN = normalize((modelMatrix * instanceMatrix * vec4(objectNormal, 0.0)).xyz); vWP = (modelMatrix * instanceMatrix * vec4(position, 1.0)).xyz;',
        '#else',
        '  vWN = normalize((modelMatrix * vec4(objectNormal, 0.0)).xyz); vWP = (modelMatrix * vec4(position, 1.0)).xyz;',
        '#endif',
      ].join('\n'));
      sh.fragmentShader = 'varying vec3 vWN; varying vec3 vWP;\n' + sh.fragmentShader.replace('#include <color_fragment>', [
        '#include <color_fragment>',
        'float speck = fract(sin(dot(floor(vWP.xz * 7.0), vec2(12.9898, 78.233))) * 43758.5453);',
        'float snowK = smoothstep(0.42, 0.78, (gl_FrontFacing ? vWN.y : -vWN.y) + (speck - 0.5) * 0.45) * 0.92;',
        'diffuseColor.rgb = mix(vec3(0.06, 0.095, 0.07) * (0.75 + speck * 0.5), vec3(0.93, 0.95, 0.98), snowK);',
      ].join('\n'));
    };
    var a = ctx.instanced(mergeAll(tiers), needleMat, spots.length, place);
    var trunk = ctx.instanced(new THREE.CylinderGeometry(0.14, 0.22, 1.6, 6).translate(0, 0.8, 0), new THREE.MeshStandardMaterial({ color: '#3A2A20', roughness: 1 }), spots.length, place);
    var b = trunk;
    a.castShadow = true; [a, trunk].forEach(function (m) { ctx.scene.add(m); }); void b;
  }

  // falling snow in a box that travels with the camera; flakes toward the
  // sun catch it and glint (Shinobi Duel's Snow.ts)
  function snowfall(ctx, low) {
    var THREE = ctx.THREE, count = low ? 2500 : 7000, R = rng(42);
    var pos = new Float32Array(count * 3), seed = new Float32Array(count);
    for (var i = 0; i < count; i++) { pos[i * 3] = R() * 60; pos[i * 3 + 1] = R() * 26; pos[i * 3 + 2] = R() * 60; seed[i] = R(); }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    W.snowU = { uTime: W.time, uCam: { value: new THREE.Vector3() }, uWind: { value: new THREE.Vector3(-1.4, 0, 0.6) }, uSun: { value: new THREE.Vector3(SUN[0], SUN[1], SUN[2]) }, uScale: { value: 600 } };
    var mat = new THREE.ShaderMaterial({
      uniforms: W.snowU,
      vertexShader: [
        'attribute float aSeed; uniform float uTime; uniform vec3 uCam, uWind, uSun; uniform float uScale; varying float vA, vGlint;',
        'void main() {',
        '  vec3 box = vec3(60.0, 26.0, 60.0), p = position;',
        '  float fall = 0.7 + aSeed * 0.9;',
        '  p += uWind * uTime * (0.6 + aSeed * 0.6); p.y -= uTime * fall;',
        '  p.x += sin(uTime * (0.8 + aSeed) + aSeed * 40.0) * 0.4; p.z += cos(uTime * (0.6 + aSeed * 0.7) + aSeed * 23.0) * 0.4;',
        '  vec3 origin = uCam - box * 0.5; origin.y = uCam.y - 10.0;',
        '  p = mod(p - origin, box) + origin;',
        '  vec4 mv = viewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;',
        '  gl_PointSize = clamp((0.028 + aSeed * 0.035) * uScale / -mv.z, 1.0, 14.0);',
        '  vGlint = pow(max(dot(normalize(p - cameraPosition), uSun), 0.0), 6.0);',
        '  float dist = -mv.z; vA = smoothstep(0.3, 1.2, dist) * (1.0 - smoothstep(22.0, 32.0, dist));',
        '}',
      ].join('\n'),
      fragmentShader: 'varying float vA, vGlint; void main() { float d = length(gl_PointCoord - 0.5); float a = (1.0 - smoothstep(0.1, 0.5, d)) * vA; vec3 col = mix(vec3(0.62, 0.68, 0.86), vec3(3.8, 1.75, 0.8), vGlint); gl_FragColor = vec4(col * a, a * 0.9); }',
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    var pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = 6; pts.userData.noReflection = true; ctx.scene.add(pts);
  }

  // the bounty: fireworks bursting ahead over the Wall, the lanterns flaring
  function fireworks(ctx) {
    var THREE = ctx.THREE, MAX = 1400;
    var pos = new Float32Array(MAX * 3), col = new Float32Array(MAX * 3), vel = new Float32Array(MAX * 3), life = new Float32Array(MAX);
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    var mat = new THREE.ShaderMaterial({
      vertexShader: 'attribute vec3 color; varying vec3 vC; void main() { vC = color; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = clamp(1600.0 / -mv.z, 2.0, 30.0); }',
      fragmentShader: 'varying vec3 vC; void main() { float d = length(gl_PointCoord - 0.5); float a = 1.0 - smoothstep(0.05, 0.5, d); gl_FragColor = vec4(vC * a, a); }',
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    var pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = 7; pts.userData.noReflection = true; ctx.scene.add(pts);
    for (var i = 0; i < MAX; i++) pos[i * 3 + 1] = -9999;
    var next = 0, queue = [];
    W.fireworks = {
      burst: function (at, hex, n) {
        var c = new THREE.Color(hex);
        for (var k = 0; k < n; k++) {
          var j = next++ % MAX, u = Math.random() * 2 - 1, th = Math.random() * TAU, s = Math.sqrt(1 - u * u), sp = 14 + Math.random() * 6;
          pos[j * 3] = at.x; pos[j * 3 + 1] = at.y; pos[j * 3 + 2] = at.z;
          vel[j * 3] = s * Math.cos(th) * sp; vel[j * 3 + 1] = u * sp + 2; vel[j * 3 + 2] = s * Math.sin(th) * sp;
          life[j] = 1.6 + Math.random() * 0.8;
          col[j * 3] = c.r * 4; col[j * 3 + 1] = c.g * 4; col[j * 3 + 2] = c.b * 4;
        }
      },
      later: function (t, fn) { queue.push([t, fn]); },
      step: function (t, dt) {
        for (var q = queue.length - 1; q >= 0; q--) if (queue[q][0] <= t) { var f = queue[q][1]; queue.splice(q, 1); f(); }
        for (var i = 0; i < MAX; i++) {
          if (life[i] <= 0) { pos[i * 3 + 1] = -9999; continue; }
          life[i] -= dt; var drag = Math.exp(-1.6 * dt);
          vel[i * 3] *= drag; vel[i * 3 + 1] = vel[i * 3 + 1] * drag - 5.5 * dt; vel[i * 3 + 2] *= drag;
          pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
          var k = clamp(life[i] / 1.2, 0, 1); col[i * 3] *= 0.992; col[i * 3 + 1] *= 0.985; col[i * 3 + 2] *= 0.98;
          if (k < 0.05) life[i] = 0;
        }
        geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true;
      },
    };
  }
  function lapPrize(ctx, e) {
    var THREE = ctx.THREE, cam = ctx.camera, t = W.time.value;
    var fwd = new THREE.Vector3(); cam.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
    var right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0));
    var palette = ['#FF4A2A', '#FFC24A', '#FFE9B8', '#FF7A3A', '#E8F0FF'];
    for (var k = 0; k < 9; k++) (function (k) {
      W.fireworks.later(t + 0.15 + k * 0.32, function () {
        var at = cam.position.clone().addScaledVector(fwd, 55 + (k % 3) * 18).addScaledVector(right, (k % 2 ? 1 : -1) * (8 + k * 3.5)).add(new THREE.Vector3(0, 16 + (k % 4) * 5, 0));
        W.fireworks.burst(at, palette[k % palette.length], 160);
        if (W.audio) W.audio.pop(0.4 + (k % 3) * 0.2);
      });
    })(k);
    W.flare = 1;
    if (W.audio) W.audio.bounty(e.lap);
  }

  /* ---------------------------------------------------------- fighters -- */
  // a library runner in a hooded skinsuit with a katana, dressed as a
  // shinobi (a cloth mask, a scarf that streams behind) or as a guard of
  // the Wall (a helmet with a crest and a neck guard, shoulder plates)
  function fighter(ctx, spec, k) {
    var id = spec.gender === 'female' ? 'human-athlete-female' : 'human-athlete-male';
    var h = ctx.assets && ctx.assets.ready && ctx.assets.ready(id) ? ctx.assets.human(id, {
      skin: spec.skin, hair: spec.hair || 'short04', hairColor: '#0E0B09', eyes: 'brown', height: spec.height, build: { muscle: spec.muscle, lean: spec.lean || 0.55 },
      suit: { color: spec.suit, trim: spec.trim, accent: spec.accent, pattern: spec.kind === 'guard' ? 'split' : 'panels' },
      weapon: { blade: spec.blade || '#DDE3EA', grip: spec.grip || '#1E1A18', trail: spec.trail || '#E9F0FF' }, stance: 'guard',
      name: spec.name, color: spec.scarf,
    }) : null;
    if (!h) return fallback(ctx, spec);
    gear(ctx, h, spec);
    return h;
  }
  function fallback(ctx, spec) {
    var THREE = ctx.THREE, o = new THREE.Group();
    var body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 1.0, 4, 10), new THREE.MeshStandardMaterial({ color: spec.suit, roughness: 0.6 })); body.position.y = 0.95; o.add(body);
    var head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), new THREE.MeshStandardMaterial({ color: spec.scarf, roughness: 0.6 })); head.position.y = 1.72; o.add(head);
    return { object: o, name: spec.name, color: spec.scarf, radius: 0.45 };
  }
  function bonesOf(root) { var b = {}; root.traverse(function (o) { if (o.isBone) b[o.name] = o; }); return b; }
  function gear(ctx, h, spec) {
    var THREE = ctx.THREE, root = h.object, B = bonesOf(root);
    // the scarf: a ribbon streaming from the neck, simulated in update()
    W.scarves.push({ h: h, bone: B.neck02 || B.neck01, len: spec.kind === 'guard' ? 0.9 : 1.6, width: spec.kind === 'guard' ? 0.1 : 0.13, color: spec.scarf, pts: null, ctx: ctx });
    // the head, measured on this fighter's own mesh: the body's shape
    // (muscle, build, face) moves it off its bone by centimetres, so the gear
    // is fitted to the vertices, not the bone. It is measured and built
    // standing upright in the mesh's own space at bind time, whatever pose the
    // body is in now, then carried into the head bone's frame (which leans
    // with the neck, not with the face).
    var head = B.head, skinned = null;
    root.traverse(function (o) { if (o.isSkinnedMesh) skinned = o; });
    if (!skinned || !head) return;
    var skullPts = [], eyePts = [], browPts = [], toHead = new THREE.Matrix4();
    var G = skinned.geometry, P = G.attributes.position, MP = G.morphAttributes.position || [], INF = skinned.morphTargetInfluences || [];
    var hi = skinned.skeleton.bones.indexOf(head), si = G.attributes.skinIndex, sw = G.attributes.skinWeight, d = new THREE.Vector3();
    toHead.multiplyMatrices(skinned.skeleton.boneInverses[hi], skinned.bindMatrix);
    var hp = new THREE.Vector3().applyMatrix4(toHead.clone().invert());
    // which part each vertex belongs to: the body's own surface (the mesh
    // also carries every hairstyle, hidden or not), the eyes, the brows
    var names = G.userData.groups || [], part = new Int8Array(P.count), IX = G.index;
    G.groups.forEach(function (g, gi) {
      var n = names[gi] || (gi === 0 ? 'body' : ''), tag = n === 'body' ? 1 : n === 'eyes' ? 2 : n === 'brows' ? 3 : 0;
      if (tag) for (var e = g.start; e < g.start + g.count; e++) part[IX.getX(e)] = tag;
    });
    for (var i = 0; i < si.count; i++) {
      if (!part[i]) continue;
      var mine = false; for (var q = 0; q < 4; q++) if (si.getComponent(i, q) === hi && sw.getComponent(i, q) > 0.9) mine = true;
      if (!mine) continue;
      var v = new THREE.Vector3().fromBufferAttribute(P, i);
      for (var m = 0; m < MP.length; m++) if (INF[m]) v.addScaledVector(d.fromBufferAttribute(MP[m], i), INF[m]);
      if (v.distanceTo(hp) < 0.3) (part[i] === 1 ? skullPts : part[i] === 2 ? eyePts : browPts).push(v);
    }
    var skull = new THREE.Box3().setFromPoints(skullPts);
    if (skull.isEmpty()) return;
    // a piece placed in the upright mesh space, baked into the head's frame
    function wear(mesh) { mesh.updateMatrix(); mesh.geometry.applyMatrix4(mesh.matrix).applyMatrix4(toHead); mesh.position.set(0, 0, 0); mesh.rotation.set(0, 0, 0); mesh.scale.set(1, 1, 1); mesh.castShadow = true; head.add(mesh); return mesh; }
    var mid = skull.getCenter(new THREE.Vector3()), size = skull.getSize(new THREE.Vector3());
    function mean(ps, ax, or) { if (!ps.length) return or; var t = 0; ps.forEach(function (p) { t += p[ax]; }); return t / ps.length; }
    var eyeY = mean(eyePts, 'y', mid.y), browY = browPts.length ? Math.max.apply(null, browPts.map(function (p) { return p.y; })) : eyeY + 0.03;
    // a slice of the skull between two heights
    function slice(lo, hi) { return skullPts.filter(function (p) { return p.y >= lo && p.y <= hi; }); }
    var cloth = new THREE.MeshStandardMaterial({ color: spec.mask || spec.suit, roughness: 0.85 });
    if (spec.kind !== 'guard') {
      // the headband: a ring hugging the forehead just above the brows
      var by = browY + 0.014, ring = slice(by - 0.008, by + 0.008);
      if (ring.length) {
        var rx = 0, z0 = Infinity, z1 = -Infinity;
        ring.forEach(function (p) { rx = Math.max(rx, Math.abs(p.x)); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); });
        var bg = new THREE.TorusGeometry(1, 0.1, 6, 32); bg.rotateX(PI / 2); bg.scale(rx + 0.004, 0.11, (z1 - z0) / 2 + 0.004);
        var band = new THREE.Mesh(bg, new THREE.MeshStandardMaterial({ color: spec.trim, roughness: 0.7 }));
        band.position.set(0, by, (z0 + z1) / 2); wear(band);
      }
      // the mask: cloth from the bridge of the nose to under the chin, tied
      // behind. It is lofted through slices of this face (one ellipse per
      // height, each just around the slice), so any nose and chin sit inside.
      var my = eyeY - 0.013, zc = mid.z, front = skullPts.filter(function (p) { return p.z > zc + size.z * 0.2 && p.y < my; });
      var chin = front.length ? Math.min.apply(null, front.map(function (p) { return p.y; })) : my - 0.11, R = 10, rows = [];
      for (var r = 0; r < R; r++) {
        var y = my - (my - chin) * r / (R - 1), sl = skullPts.filter(function (p) { return Math.abs(p.y - y) < 0.007 && p.z > zc - 0.03; }), ax = 0, az = 0, f = 0;
        sl.forEach(function (p) { ax = Math.max(ax, Math.abs(p.x)); az = Math.max(az, p.z - zc); });
        sl.forEach(function (p) { f = Math.max(f, p.x * p.x / (ax * ax) + (p.z - zc) * (p.z - zc) / (az * az)); });
        rows.push(sl.length > 3 ? { y: y, ax: ax * Math.sqrt(f) + 0.005, az: az * Math.sqrt(f) + 0.006 } : null);
      }
      for (r = 0; r < R; r++) if (!rows[r]) rows[r] = rows[r - 1] || rows.filter(Boolean)[0] || { y: my, ax: 0.08, az: 0.1 };
      rows.forEach(function (w, r) { if (!w.y) w.y = my - (my - chin) * r / (R - 1); });
      // smooth the profile, keep the widest of neighbours so nothing pokes through
      rows = rows.map(function (w, r) { var a = rows[Math.max(0, r - 1)], c = rows[Math.min(R - 1, r + 1)]; return { y: w.y, ax: Math.max(w.ax, (a.ax + c.ax) / 2), az: Math.max(w.az, (a.az + c.az) / 2) }; });
      var last = rows[R - 1]; rows.push({ y: chin - 0.022, ax: last.ax * 0.82, az: last.az * 0.66 });
      var C = 22, mp = [], mi = [];
      rows.forEach(function (w) { for (var c = 0; c <= C; c++) { var an = (c / C - 0.5) * PI * 1.24; mp.push(w.ax * Math.sin(an), w.y, zc + w.az * Math.cos(an)); } });
      for (r = 0; r < rows.length - 1; r++) for (var c = 0; c < C; c++) { var i0 = r * (C + 1) + c, i1 = i0 + C + 1; mi.push(i0, i0 + 1, i1, i0 + 1, i1 + 1, i1); }
      var mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.Float32BufferAttribute(mp, 3)); mg.setIndex(mi); mg.computeVertexNormals();
      cloth.side = THREE.DoubleSide;
      wear(new THREE.Mesh(mg, cloth));
    } else {
      // the helmet is drawn for a head 0.194 wide, 0.24 tall, 0.221 deep,
      // fitted on each axis, its rim resting just above the brows
      var K = new THREE.Vector3(size.x / 0.194, size.y / 0.24, size.z / 0.221), top = new THREE.Vector3(mid.x, browY + 0.014, mid.z - size.z * 0.06);
      var onHead = function (mesh, off) { mesh.position.copy(top).add(off.clone().multiply(K)); mesh.scale.copy(K); return wear(mesh); };
      // the helmet: a lacquered bowl, a peak, a three-lame neck guard, a gold crescent with its horns up
      var lac = new THREE.MeshPhysicalMaterial({ color: spec.armour, roughness: 0.38, clearcoat: 0.8, clearcoatRoughness: 0.25 });
      var gold = new THREE.MeshStandardMaterial({ color: spec.crest, roughness: 0.28, metalness: 1 });
      var bg2 = new THREE.SphereGeometry(1, 22, 12, 0, TAU, 0, PI * 0.54); bg2.scale(0.118, 0.13, 0.126);
      var bowl = new THREE.Mesh(bg2, lac); onHead(bowl, new THREE.Vector3(0, 0.0, -0.004));
      for (var j = 0; j < 3; j++) {
        var lame = new THREE.Mesh(new THREE.CylinderGeometry(0.128 + j * 0.026, 0.14 + j * 0.03, 0.045, 22, 1, true, PI * 0.25, PI * 1.5), lac);
        lame.material.side = THREE.DoubleSide; onHead(lame, new THREE.Vector3(0, -0.02 - j * 0.04, -0.012));
      }
      var peak = new THREE.Mesh(new THREE.CylinderGeometry(0.128, 0.15, 0.012, 22, 1, false, -PI * 0.28, PI * 0.56), lac); onHead(peak, new THREE.Vector3(0, 0.025, 0.012));
      var crest = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.01, 6, 20, PI * 0.9), gold); crest.rotation.z = PI * 1.05; onHead(crest, new THREE.Vector3(0, 0.13, 0.132));
      // shoulder plates on the upper arms
      ['upperarm01_L', 'upperarm01_R'].forEach(function (bn, i) {
        var b = B[bn]; if (!b) return;
        var plate = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.2, 12, 1, true, i ? PI * 0.2 : PI * 1.2, PI * 0.9), lac);
        plate.material.side = THREE.DoubleSide; plate.position.set(i ? -0.02 : 0.02, -0.06, 0); b.add(plate); plate.castShadow = true;
      });
    }
  }
  function scarfStep(ctx, sc, dt) {
    var THREE = ctx.THREE, N = 11;
    if (!sc.mesh) {
      var g = new THREE.BufferGeometry(), P = new Float32Array(N * 2 * 3), I = [];
      for (var i = 0; i < N - 1; i++) { var a = i * 2; I.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setIndex(I);
      sc.mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: sc.color, roughness: 0.8, side: THREE.DoubleSide }));
      sc.mesh.frustumCulled = false; sc.mesh.castShadow = true; ctx.scene.add(sc.mesh);
      sc.pts = []; sc.prev = [];
    }
    var obj = sc.h.object, vis = true;
    for (var o = obj; o; o = o.parent) if (!o.visible) vis = false;
    var inScene = false; for (o = obj; o; o = o.parent) if (o === ctx.scene) inScene = true;
    sc.mesh.visible = vis && inScene;
    if (!sc.mesh.visible) { sc.pts.length = 0; return; }
    var anchor = sc.bone.getWorldPosition(new THREE.Vector3());
    var q = obj.getWorldQuaternion(new THREE.Quaternion()), back = new THREE.Vector3(0, 0, -1).applyQuaternion(q), side = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
    anchor.addScaledVector(back, 0.08).add(new THREE.Vector3(0, -0.02, 0));
    var seg = sc.len / (N - 1);
    if (!sc.pts.length || sc.pts[0].distanceTo(anchor) > 3) {
      sc.pts = []; sc.prev = [];
      for (var i = 0; i < N; i++) { var p = anchor.clone().addScaledVector(back, i * seg); sc.pts.push(p); sc.prev.push(p.clone()); }
    }
    var wind = new THREE.Vector3(-1.2, 0, 0.5), grav = new THREE.Vector3(0, -3.2, 0), sdt = Math.min(dt, 1 / 30);
    sc.pts[0].copy(anchor); sc.prev[0].copy(anchor);
    for (i = 1; i < N; i++) {
      var p2 = sc.pts[i], v = p2.clone().sub(sc.prev[i]).multiplyScalar(0.96);
      sc.prev[i].copy(p2);
      var flutter = Math.sin(W.time.value * 9 + i * 0.9) * 0.6;
      p2.add(v).addScaledVector(grav, sdt * sdt).addScaledVector(wind, sdt * sdt).addScaledVector(side, flutter * sdt * sdt * 6);
    }
    for (var it = 0; it < 3; it++) for (i = 1; i < N; i++) {
      var a0 = sc.pts[i - 1], b0 = sc.pts[i], dv = b0.clone().sub(a0), l = dv.length() || 1e-6;
      b0.copy(a0).addScaledVector(dv, seg / l);
    }
    var P = sc.mesh.geometry.attributes.position;
    for (i = 0; i < N; i++) {
      var w = sc.width * (1 - i / N * 0.5);
      P.setXYZ(i * 2, sc.pts[i].x + side.x * w / 2, sc.pts[i].y + side.y * w / 2, sc.pts[i].z + side.z * w / 2);
      P.setXYZ(i * 2 + 1, sc.pts[i].x - side.x * w / 2, sc.pts[i].y - side.y * w / 2, sc.pts[i].z - side.z * w / 2);
    }
    P.needsUpdate = true; sc.mesh.geometry.computeVertexNormals();
  }

  /* -------------------------------------------------------- obstacles -- */
  // what the Wall has in the way: fallen masonry, spiked barricades, braziers,
  // supply carts pushed across, stacked barrels of powder
  function obstacles(ctx) {
    var THREE = ctx.THREE, L = ctx.track.length, out = [], M = W.M;
    function add(o, m) { m.castShadow = true; m.receiveShadow = true; o.add(m); return m; }
    function rubble() { var o = new THREE.Group(), R = rng(out.length + 3); for (var i = 0; i < 6; i++) { var b = add(o, new THREE.Mesh(new THREE.BoxGeometry(0.5 + R() * 0.4, 0.3 + R() * 0.2, 0.3 + R() * 0.2), M.brick)); b.position.set((R() - 0.5) * 1.2, 0.15 + (i > 3 ? 0.3 : 0), (R() - 0.5) * 0.8); b.rotation.set(R() * 0.4, R() * PI, R() * 0.3); } add(o, new THREE.Mesh(new THREE.SphereGeometry(0.7, 10, 6, 0, TAU, 0, PI / 2), M.snow)).scale.set(1, 0.35, 0.8); return o; }
    function barricade() {
      var o = new THREE.Group();
      add(o, new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 2.4, 8).rotateZ(PI / 2).translate(0, 0.62, 0), M.wood));
      for (var i = 0; i < 5; i++) {
        var x = (i - 2) * 0.5;
        [-1, 1].forEach(function (s) { var st = add(o, new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 1.5, 6), M.wood)); st.position.set(x, 0.62, 0); st.rotation.x = s * 0.9; });
        [-1, 1].forEach(function (s) { var tip = add(o, new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.2, 6), M.iron)); tip.position.set(x, 0.62 + Math.cos(0.9) * 0.8, s * Math.sin(0.9) * 0.8); tip.rotation.x = s * 0.9; });
      }
      return o;
    }
    function brazier() {
      var o = new THREE.Group();
      [0, 1, 2].forEach(function (i) { var l = add(o, new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.0, 6), M.iron)); var a = i / 3 * TAU; l.position.set(Math.cos(a) * 0.22, 0.48, Math.sin(a) * 0.22); l.rotation.set(Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25); });
      add(o, new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.26, 0.3, 14, 1, true), M.iron)).position.y = 1.02;
      var fire = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.8, 10, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 1.6, 0.4), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
      fire.position.y = 1.45; o.add(fire); W.fires.push(fire);
      return o;
    }
    function cart() {
      var o = new THREE.Group();
      add(o, new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.12, 1.1).translate(0, 0.75, 0), M.wood));
      [-1, 1].forEach(function (s) { add(o, new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.4, 1.1).translate(s * 0.72, 0.98, 0), M.wood)); var w = add(o, new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.06, 6, 16), M.wood)); w.rotation.y = PI / 2; w.position.set(s * 0.82, 0.45, 0); });
      for (var i = 0; i < 3; i++) add(o, new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.34, 0.42), new THREE.MeshStandardMaterial({ color: '#6B4A2E', roughness: 0.9 }))).position.set((i - 1) * 0.46, 1.0, (i % 2) * 0.2 - 0.1);
      add(o, new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.6, 6).rotateX(PI / 2).translate(0, 0.8, 1.2), M.wood));
      return o;
    }
    function barrels() {
      var o = new THREE.Group(), red = new THREE.MeshStandardMaterial({ color: '#6E2A1E', roughness: 0.75 });
      [[0, 0, 0], [0.56, 0, 0.1], [0.28, 0.66, 0.05]].forEach(function (p) {
        var b = add(o, new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.62, 14).translate(0, 0.31, 0), red)); b.position.set(p[0] - 0.28, p[1], p[2]);
        [0.1, 0.52].forEach(function (y) { var h = add(o, new THREE.Mesh(new THREE.TorusGeometry(0.275, 0.018, 4, 20), M.iron)); h.rotation.x = PI / 2; h.position.set(p[0] - 0.28, p[1] + y, p[2]); });
      });
      return o;
    }
    function put(d, x, o, extra) { var e = { at: d / L, x: x, object: o }; if (extra) Object.assign(e, extra); out.push(e); }
    function nearTower(d) { for (var q = 0; q < W.towerAt.length; q++) { var dd = Math.abs(((d - W.towerAt[q]) % L + L * 1.5) % L - L / 2); if (dd < (q === 0 ? 30 : 12)) return true; } return false; }
    var n = 0;
    for (var d = 60; d < L - 30; d += 23) {
      if (nearTower(d)) continue;
      var side = n % 2 ? 1 : -1, x = side * (1.1 + ((n * 7) % 11) / 11 * 1.9), kind = n % 6;
      if (kind === 0) put(d, x, rubble());
      else if (kind === 1) put(d, side * 2.2, barricade());
      else if (kind === 2) put(d, side * 3.1, brazier());
      else if (kind === 3) put(d, x * 0.4, cart(), { move: { amplitude: 1.6, period: 5 } });
      else if (kind === 4) put(d, x, barrels());
      else put(d, -side * 2.4, brazier());
      n++;
    }
    return out;
  }

  /* ----------------------------------------------------------- update -- */
  var lastCam = null;
  function update(ctx, t, dt) {
    W.time.value = t;
    var cam = ctx.camera.position;
    if (W.snowU) { W.snowU.uCam.value.copy(cam); W.snowU.uScale.value = window.innerHeight * 0.9; }
    if (W.fireworks) W.fireworks.step(t, dt);
    // lanterns breathe; the bounty makes them flare
    W.flare = Math.max(0, W.flare - dt * 0.5);
    (W.lanternMats || []).forEach(function (m, i) { m.emissiveIntensity = 2.2 + Math.sin(t * 6 + i * 2.1) * 0.25 + W.flare * 4; });
    W.fires.forEach(function (f, i) { var s = 1 + Math.sin(t * 17 + i) * 0.12 + Math.sin(t * 29 + i * 3) * 0.08; f.scale.set(1 / s, s, 1 / s); f.rotation.y = t * 2 + i; });
    W.scarves.forEach(function (sc) { scarfStep(ctx, sc, dt); });
    if (lastCam && dt > 0) { var v = Math.hypot(cam.x - lastCam.x, cam.z - lastCam.z) / dt; W.speed = W.speed == null ? v : W.speed + (v - W.speed) * Math.min(1, dt * 3); }
    lastCam = { x: cam.x, z: cam.z };
    if (W.audio) W.audio.tick(t);
  }

  /* ------------------------------------------------------------ sound -- */
  // Everything synthesized (Shinobi Duel's Audio.ts, music.ts and synth.ts,
  // condensed): the wind over the Wall, a slow drone, taiko that thicken
  // lap by lap, shakuhachi phrases on the miyako-bushi scale, a koto, a
  // bronze bell and fireworks for the bounty.
  function ambient(ctx) {
    var ac = ctx.audio.context, out = ctx.audio.destination, sr = ac.sampleRate;
    function noiseBuf(sec, brown) { var n = Math.floor(sr * sec), b = ac.createBuffer(1, n, sr), d = b.getChannelData(0), l = 0; for (var i = 0; i < n; i++) { var w = Math.random() * 2 - 1; if (brown) { l = (l + 0.02 * w) / 1.02; d[i] = l * 3.5; } else d[i] = w; } return b; }
    var NOISE = noiseBuf(2, false);
    // an open-air reverb: sparse early reflections, a long darkening tail
    function ir(secs) {
      var len = Math.floor(sr * secs), b = ac.createBuffer(2, len, sr);
      for (var c = 0; c < 2; c++) { var ch = b.getChannelData(c), lp = 0, R = rng(11 + c * 7), e = 0; for (var i = 0; i < len; i++) { var t = i / sr, k = Math.min(0.93, 0.18 + t * 0.34); lp = lp * k + (R() * 2 - 1) * (1 - k); var v = lp * Math.min(1, t / 0.06) * Math.exp(-t * 3.4) * 0.9; ch[i] = v; e += v * v; } var nrm = 0.9 / Math.sqrt(e + 1e-9); for (i = 0; i < len; i++) ch[i] *= nrm; }
      return b;
    }
    var music = ac.createGain(); music.gain.value = 0.55; music.connect(out);
    var verb = ac.createConvolver(); verb.buffer = ir(2.6); var vg = ac.createGain(); vg.gain.value = 0.5; verb.connect(vg); vg.connect(out);
    var drums = ac.createGain(); drums.gain.value = 0.9; drums.connect(music); var dsend = ac.createGain(); dsend.gain.value = 0.25; drums.connect(dsend); dsend.connect(verb);
    var flute = ac.createGain(); flute.gain.value = 0.8; flute.connect(music);
    // wind: brown noise, low-passed, rising with speed
    var ws = ac.createBufferSource(); ws.buffer = noiseBuf(4, true); ws.loop = true; var wl = ac.createBiquadFilter(); wl.type = 'lowpass'; wl.frequency.value = 520;
    var wind = ac.createGain(); wind.gain.value = 0.05; ws.connect(wl); wl.connect(wind); wind.connect(out); ws.start();
    // the drone: D2 and A2, slowly beating
    var drone = ac.createGain(); drone.gain.value = 0.03; var dl = ac.createBiquadFilter(); dl.type = 'lowpass'; dl.frequency.value = 420; drone.connect(dl); dl.connect(music);
    [[73.42, 0], [73.42, 7], [110, -4], [146.8, 3]].forEach(function (f) { var o = ac.createOscillator(); o.type = 'triangle'; o.frequency.value = f[0]; o.detune.value = f[1]; o.connect(drone); o.start(); });

    function osc(dest, t, f0, f1, dur, gain, glide, type) {
      var s = ac.createOscillator(), e = ac.createGain(); s.type = type || 'sine';
      s.frequency.setValueAtTime(f0, t); if (f1 !== f0) s.frequency.exponentialRampToValueAtTime(f1, t + (glide || dur));
      e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(gain, t + 0.002); e.gain.exponentialRampToValueAtTime(0.0002, t + dur);
      s.connect(e); e.connect(dest); s.start(t); s.stop(t + dur + 0.02);
    }
    function hit(dest, t, dur, type, freq, q, gain) {
      var s = ac.createBufferSource(), f = ac.createBiquadFilter(), e = ac.createGain(); s.buffer = NOISE;
      f.type = type; f.frequency.value = freq; f.Q.value = q;
      e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(gain, t + 0.002); e.gain.exponentialRampToValueAtTime(0.0003, t + dur);
      s.connect(f); f.connect(e); e.connect(dest); s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.02);
    }
    function odaiko(t, v, big) { var f = big ? 52 : 62 + Math.random() * 4, g = 0.55 * v * (big ? 1.4 : 1); osc(drums, t, f * 1.7, f, big ? 1.8 : 1.1, g, 0.04); osc(drums, t, f * 2.07, f * 1.59, 0.35, g * 0.35, 0.03); hit(drums, t, 0.09, 'lowpass', 900, 0.7, g * 0.5); hit(drums, t, 0.012, 'bandpass', 2600, 1.2, g * 0.25); }
    function nagado(t, v) { var f = 118 + Math.random() * 6, g = 0.32 * v; osc(drums, t, f * 1.5, f, 0.4, g, 0.025); hit(drums, t, 0.05, 'bandpass', 1100, 0.8, g * 0.45); }
    function shime(t, v) { var g = 0.2 * v; osc(drums, t, 520, 430, 0.1, g, 0.01); hit(drums, t, 0.035, 'bandpass', 3200, 1.4, g * 0.9); }
    function ka(t, v) { hit(drums, t, 0.022, 'bandpass', 2300, 5, 0.22 * v); }
    // a koto string (Karplus-Strong), rendered once and repitched
    var koto = (function () {
      var len = Math.floor(sr * 3.2), b = ac.createBuffer(1, len, sr), o = b.getChannelData(0), period = sr / 293.66, n = Math.ceil(period) + 2, line = new Float32Array(n), R = rng(9);
      for (var i = 0; i < n; i++) line[i] = (R() * 2 - 1) * 0.8 + (i / n < 0.18 ? 0.5 * (1 - i / n / 0.18) : 0);
      var w = 0, frac = period - Math.floor(period), prev = 0, a2 = 0.77;
      for (i = 0; i < len; i++) { var rp = w - Math.floor(period), i0 = (rp + n * 4) % n, i1 = (i0 - 1 + n) % n, y = line[i0] * (1 - frac) + line[i1] * frac, v2 = (a2 * y + (1 - a2) * prev) * 0.9992; prev = v2; line[w % n] = v2; o[i] = y; w++; }
      var pk = 0; for (i = 0; i < len; i++) pk = Math.max(pk, Math.abs(o[i])); for (i = 0; i < len; i++) o[i] = o[i] / pk * 0.8 * Math.min(1, (len - i) / (sr * 0.25));
      return b;
    })();
    var SCALE = [0, 1, 5, 7, 8], D4 = 293.66;
    function note(deg) { return D4 * Math.pow(2, (SCALE[((deg % 5) + 5) % 5] + 12 * Math.floor(deg / 5)) / 12); }
    function kotoNote(t, deg, gain) { var s = ac.createBufferSource(), g = ac.createGain(); s.buffer = koto; s.playbackRate.value = note(deg) / D4; g.gain.value = gain; s.connect(g); g.connect(flute); var sd = ac.createGain(); sd.gain.value = 0.6; g.connect(sd); sd.connect(verb); s.start(t); }
    function shakuhachi(t, f, dur, gain) {
      var env = ac.createGain(); env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(gain, t + 0.12); env.gain.setTargetAtTime(gain * 0.75, t + 0.12, dur * 0.5); env.gain.setTargetAtTime(0, t + dur, 0.12);
      var lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200; env.connect(lp); lp.connect(flute); var sd = ac.createGain(); sd.gain.value = 0.9; lp.connect(sd); sd.connect(verb);
      var o = ac.createOscillator(); o.frequency.setValueAtTime(f * 0.94, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.16); o.connect(env);
      var o2 = ac.createOscillator(); o2.type = 'triangle'; o2.frequency.setValueAtTime(f * 1.88, t); o2.frequency.exponentialRampToValueAtTime(f * 2, t + 0.16); var o2g = ac.createGain(); o2g.gain.value = 0.12; o2.connect(o2g); o2g.connect(env);
      var lfo = ac.createOscillator(); lfo.frequency.value = 4.8 + Math.random(); var lg = ac.createGain(); lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(0, t + Math.min(0.5, dur * 0.4)); lg.gain.linearRampToValueAtTime(14, t + dur); lfo.connect(lg); lg.connect(o.detune); lg.connect(o2.detune);
      var nb = ac.createBufferSource(); nb.buffer = NOISE; nb.loop = true; var bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 9; var ng = ac.createGain(); ng.gain.value = 1.6; nb.connect(bp); bp.connect(ng); ng.connect(env);
      hit(flute, t, 0.08, 'bandpass', f * 3, 3, gain * 0.35);
      [o, o2, lfo, nb].forEach(function (s) { s.start(t); s.stop(t + dur + 0.7); });
    }
    // a bonsho temple bell: inharmonic partials, a long bloom
    function bell(t, gain) {
      [[1, 1], [2.02, 0.6], [2.76, 0.45], [4.07, 0.3], [5.4, 0.2], [0.5, 0.5]].forEach(function (p) { osc(music, t, 98 * p[0], 98 * p[0] * 0.998, 5.5 / Math.sqrt(p[0]), gain * p[1], 5); });
      hit(music, t, 0.05, 'bandpass', 1400, 2, gain * 0.4);
    }
    // the score's clock: sixteenths at 76 bpm, the drums thickening each lap
    var ODAIKO = [1, 0, 0, 0, 0, 0, 0, 0, 0.8, 0, 0, 0, 0, 0, 0.45, 0], ODAIKO2 = [1, 0, 0, 0.5, 0, 0, 0.7, 0, 0.9, 0, 0, 0.45, 0, 0, 0.75, 0.5];
    var NAGADO = [0, 0, 0.6, 0, 0.8, 0, 0, 0.5, 0, 0, 0.6, 0, 0.8, 0, 0, 0], SHIME = [0.7, 0, 0.35, 0, 0.6, 0, 0.35, 0.3, 0.7, 0, 0.35, 0, 0.6, 0.3, 0.45, 0.35], KA = [0, 0, 0, 0, 0.5, 0, 0, 0, 0, 0, 0, 0, 0.5, 0, 0.35, 0];
    var next = ac.currentTime + 0.3, stepN = 0, phraseAt = ac.currentTime + 3, lastDeg = 5;
    W.audio = {
      tick: function () {
        var now = ac.currentTime, s = clamp((W.speed || 0) / 28, 0, 1);
        wind.gain.setTargetAtTime(0.03 + 0.08 * s, now, 0.2);
        var L = clamp((W.level - 1) / 5, 0, 1) * 0.8 + (W.speed > 5 ? 0.2 : 0);
        drone.gain.setTargetAtTime(W.speed > 5 ? 0.022 : 0.05, now, 1.2);
        if (next < now - 0.3) next = now + 0.02;
        while (next < now + 0.16) {
          var st = stepN % 16, v = function () { return next + (Math.random() - 0.5) * 0.008; };
          if (W.speed > 5) {
            var od = L > 0.62 ? ODAIKO2 : ODAIKO, k = 1 - 0.25 * L;
            if (od[st]) odaiko(v(), od[st] * (0.75 + L * 0.3) * k);
            if (L > 0.3 && NAGADO[st]) nagado(v(), NAGADO[st] * Math.min(1, (L - 0.3) * 3) * k);
            if (L > 0.55 && SHIME[st]) shime(v(), SHIME[st] * Math.min(1, (L - 0.55) * 3.5) * k);
            if (L > 0.2 && KA[st]) ka(v(), KA[st]);
          }
          stepN++; next += 60 / 76 / 4;
        }
        if (now >= phraseAt) {
          var busy = W.speed > 5 ? L : 0;
          if (busy < 0.85) {
            var n = 2 + Math.floor(Math.random() * (busy > 0.5 ? 2 : 4)), at = now + 0.05, deg = lastDeg;
            for (var i = 0; i < n; i++) {
              deg = clamp(deg + [-2, -1, -1, 1, 1, 2][Math.floor(Math.random() * 6)], 2, 9); if (i === n - 1) deg = Math.max(2, deg - 1);
              var len = (i === n - 1 ? 2.2 : 0.9 + Math.random() * 0.9) * (busy > 0.5 ? 0.8 : 1);
              if (Math.random() < 0.3 && busy < 0.6) kotoNote(at, deg - 5, 0.45);
              shakuhachi(at, note(deg), len, 0.22 - busy * 0.08);
              at += len * (0.85 + Math.random() * 0.2);
            }
            lastDeg = deg;
          }
          phraseAt = now + 8 + Math.random() * (5 + busy * 8);
        }
      },
      // the bounty: a roll into one great drum, the bell, a rising koto
      bounty: function (lap) {
        var t = ac.currentTime + 0.05;
        for (var i = 0; i < 6; i++) odaiko(t + i * 0.09 * (1 - i * 0.06), 0.35 + i * 0.08);
        odaiko(t + 0.55, 1.2, true); bell(t + 0.58, 0.16);
        for (i = 0; i < 5; i++) kotoNote(t + 0.7 + i * 0.12, [0, 2, 3, 4, 5][i] + (lap % 2), 0.5);
      },
      pop: function (g) { var t = ac.currentTime; hit(music, t, 0.4, 'lowpass', 700, 0.7, g * 0.6); hit(music, t + 0.05, 1.2, 'highpass', 3000, 0.5, g * 0.12); },
      slay: function () { var t = ac.currentTime; odaiko(t + 0.02, 0.6); ka(t, 1); },
      death: function () {
        var t = ac.currentTime + 0.05; odaiko(t, 1, true);
        shakuhachi(t + 0.3, note(6), 0.5, 0.18); shakuhachi(t + 0.8, note(4) * 0.97, 1.8, 0.16);
      },
    };
  }
})();
