// Tideline
//
// A first-party GameMog world: endless laps of a tropical bay in the late
// afternoon, on runtime v1 with cinematic graphics. The beach leg runs the firm
// sand just above the swash, so every wave washes up beside you; the back leg
// climbs over the berm, crosses a lagoon on a long boardwalk and winds through
// the palms past the fishing shacks.
//
// The look is ported from Tidewater by Dan Greenheck
// (github.com/dgreenheck/tidewater), a WebGPU island on its own engine, to
// three.js and this runtime: the ridge skeleton that shapes the island's hills
// and headlands, the sea stacks off their tips, shore waves that steepen in the
// shallows (Green's law), break and run up the sand as a thin swash sheet
// (uprush for 40% of the period, backwash for 55%, on a 0.066 beach slope)
// leaving the sand dark and glossy behind them, and the coconut palm's spiral
// crown of arching, drooping fronds. Tidewater's code is under the MIT licence:
//
//   Copyright (c) 2026 DRG Software Solutions LLC
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
//
// Everything is built here, procedurally. The rules are the runtime's; the
// bay is this file's.

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
  function fbm(x, z) { return noise(x, z) * 0.5 + noise(x * 2.03 + 17, z * 2.03 - 9) * 0.3 + noise(x * 4.1 - 5, z * 4.1 + 3) * 0.2; }

  /* ----------------------------------------------------------- layout -- */
  // Metres, y up, sea level y = 0. The open sea lies to the south (+z), the
  // island to the north, as in Tidewater; the sun sets in the west, over the sea.
  var TW = 9, HW = TW / 2;
  var SLOPE = 0.066;       // Tidewater's beach slope: run-up height to horizontal excursion
  var WAVE_T = 8.5;        // seconds between waves
  var SUN = (function () { var v = [-0.62, 0.3, 0.72], l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; })();

  // the waterline of the bay: a shallow curve between two headlands
  function shoreZ(x) { var a = Math.abs(x) / 180, u = Math.min(a, 1.25), e = Math.max(a - 1.25, 0); return -4 + 22 * u * u + 55 * e; }
  // metres inland from the waterline (negative offshore)
  function shoreS(x, z) { return shoreZ(x) - z; }
  // the beach's cross-profile: the foreshore at Tidewater's slope, a berm, the back beach
  function profile(s) {
    if (s < -30) return Math.max(-1.98 + (s + 30) * 0.035, -9);
    if (s < 28) return s * SLOPE;
    if (s < 46) return 1.848 + (s - 28) * 0.028;
    return 2.352 + (s - 46) * 0.012;
  }

  // Ridge skeleton, after Tidewater's IslandShape: polylines of [x, z, crest
  // height, half width]; each is the max of its segments, and ridges combine
  // with a p-norm so junctions and saddles round off.
  var RIDGES = [
    [[-460, -250, 60, 140], [-320, -300, 118, 200], [-170, -330, 160, 240], [-20, -350, 185, 260], [120, -335, 150, 230], [270, -300, 118, 200], [430, -250, 60, 140]],
    [[-320, -300, 110, 170], [-282, -170, 70, 120], [-252, -70, 42, 80], [-236, 10, 24, 58], [-228, 70, 7, 36]],
    [[270, -300, 110, 170], [276, -170, 68, 118], [256, -70, 40, 78], [244, 12, 22, 56], [238, 74, 7, 36]],
    [[-170, -330, 150, 200], [-130, -230, 70, 110], [-104, -170, 26, 70]],
    [[120, -335, 140, 190], [100, -230, 64, 100], [86, -172, 24, 66]],
  ];
  var CREST = 0.07, CREST_N = Math.sqrt(1 + CREST * CREST) - CREST;
  function ridgeEnvelope(x, z) {
    var sum = 0;
    for (var r = 0; r < RIDGES.length; r++) {
      var pts = RIDGES[r], best = 0;
      for (var k = 0; k < pts.length - 1; k++) {
        var a = pts[k], b = pts[k + 1], abx = b[0] - a[0], abz = b[1] - a[1];
        var t = clamp(((x - a[0]) * abx + (z - a[1]) * abz) / (abx * abx + abz * abz), 0, 1);
        var dx = x - (a[0] + abx * t), dz = z - (a[1] + abz * t), wd = a[3] + (b[3] - a[3]) * t;
        var u0 = Math.sqrt(dx * dx + dz * dz) / wd;
        if (u0 >= 1) continue;
        var u = (Math.sqrt(u0 * u0 + CREST * CREST) - CREST) / CREST_N, q = 1 - u;
        var v = (a[2] + (b[2] - a[2]) * t) * q * q * (1 + 0.5 * u);
        if (v > best) best = v;
      }
      if (best > 0) { var b2 = best * best; sum += b2 * b2 * b2; }
    }
    return sum > 0 ? Math.pow(sum, 1 / 6) : 0;
  }
  var SEA_STACKS = [[-236, 98, 9, 17], [-212, 114, 6, 11], [-254, 84, 5, 8], [-200, 96, 4.5, 6], [-262, 118, 4, 5],
    [246, 102, 10, 19], [222, 118, 6, 10], [264, 90, 7, 12], [274, 122, 4.5, 7], [210, 98, 4, 5]];

  var LAGOON = { x: -12, z: -66, rx: 40, rz: 14, level: 1.45 };
  function lagoonMask(x, z) {
    var dx = (x - LAGOON.x) / LAGOON.rx, dz = (z - LAGOON.z) / LAGOON.rz;
    var r = Math.sqrt(dx * dx + dz * dz) + (noise(x * 0.06, z * 0.06) - 0.5) * 0.16;
    return smooth(1.04, 0.74, r);
  }
  function baseHeight(x, z) {
    var s = shoreS(x, z), h = profile(s);
    if (s > 38) h += smooth(38, 58, s) * (fbm(x * 0.035 + 3, z * 0.035) - 0.38) * 2.4;   // dunes behind the berm
    var env = ridgeEnvelope(x, z);
    if (env > 0) {
      var hl = env + (fbm(x * 0.02, z * 0.02) - 0.5) * Math.min(env, 30) * 0.35;
      var mask = Math.max(smooth(72, 140, s), smooth(186, 222, Math.abs(x)));
      h = Math.max(h, hl * mask);
    }
    return h;
  }

  // The loop: the beach leg west to east along the swash, up and round the
  // east end, back along the lagoon boardwalk and the palms, down the west end.
  var TRACK_POINTS = [];
  (function () {
    function P(x, z) { TRACK_POINTS.push([x, +baseHeight(x, z).toFixed(3), +z.toFixed(3)]); }
    for (var x = -110; x <= 110; x += 20) P(x, shoreZ(x) - 10);
    P(130, shoreZ(130) - 11.5); P(148, -6); P(158, -20); P(157, -36); P(147, -50); P(130, -59);
    P(106, -64); P(82, -59); P(58, -63); P(34, -67); P(10, -66); P(-14, -65); P(-38, -67); P(-62, -62); P(-86, -57); P(-108, -60);
    P(-128, -56); P(-143, -44); P(-150, -28); P(-146, -13); P(-134, -4.5);
  })();

  // shared state between build(), the characters, update() and ambient()
  var W = { time: { value: 0 }, lap: 0, board: null };

  /* ------------------------------------------------ GLSL: shore and surf -- */
  // The same waves drive the sea's surface, the swash on the sand and the surf
  // sound: a train of crests every WAVE_T seconds that travels shoreward at the
  // shallow-water speed sqrt(g d) over the profile above.
  var SHORE_GLSL = [
    'uniform float uTime;',
    '#define SLOPE 0.066',
    '#define WAVE_T 8.5',
    'float shoreZ(float x) { float a = abs(x) / 180.0; float u = min(a, 1.25); float e = max(a - 1.25, 0.0); return -4.0 + 22.0 * u * u + 55.0 * e; }',
    'float shoreS(vec2 p) { return shoreZ(p.x) - p.y; }',
    'float gmHash(float n) { return fract(sin(n * 12.9898 + 4.1) * 43758.5453); }',
    'float gmHash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
    'float gmNoise(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);',
    '  return mix(mix(gmHash2(i), gmHash2(i + vec2(1.0, 0.0)), u.x), mix(gmHash2(i + vec2(0.0, 1.0)), gmHash2(i + vec2(1.0, 1.0)), u.x), u.y); }',
    'float seaDepth(vec2 p) { float s = shoreS(p); float h = s >= -30.0 ? s * SLOPE : max(-1.98 + (s + 30.0) * 0.035, -9.0); return -h + smoothstep(230.0, 320.0, abs(p.x)) * 6.0; }',
    // seconds for a wave to run from x metres offshore to the waterline
    'float travel(float x) { x = max(x, 0.0); if (x <= 30.0) return 2.0 * sqrt(x / (9.81 * SLOPE)); return 13.61 + 2.0 / (0.035 * sqrt(9.81)) * (sqrt(1.98 + 0.035 * (x - 30.0)) - sqrt(1.98)); }',
    // integers are crests; the along-shore term angles the fronts a little
    'float wavePhase(vec2 p, float t) { return (t + travel(-shoreS(p))) / WAVE_T + p.x * 0.0015; }',
    'float waveAmp(float m) { return 0.32 + 0.3 * gmHash(m) + 0.12 * sin(m * 0.9); }',
    // one wave near the shore: x = height, y = breaking, z = crest face, w = whitewater
    'vec4 shoreWave(vec2 p, float t) {',
    '  float d = seaDepth(p);',
    '  float ph = wavePhase(p, t); float m = floor(ph + 0.5); float w = ph - m;',
    '  float A = waveAmp(m);',
    '  float H = A * pow(3.5 / max(d, 0.35), 0.25);',
    '  float b = smoothstep(0.65, 1.0, H / (0.78 * max(d, 0.05)));',
    '  H = min(H, 0.55 * d + 0.08);',
    '  float kf = mix(5.0, 16.0, b);',
    '  float wf = w * kf; float wb = w * 3.2;',
    '  float prof = w < 0.0 ? exp(-wf * wf) : exp(-wb * wb);',
    '  float env = (1.0 - smoothstep(5.0, 14.0, d)) * smoothstep(0.0, 0.3, d);',
    '  float face = w < 0.0 ? exp(-wf * wf * 0.49) : 0.0;',
    '  float white = b * (w >= 0.0 ? exp(-w * 6.5) : exp(-wf * wf * 1.96));',
    '  return vec4(H * (prof - 0.22) * env, b * env, face * env * H, white * env);',
    '}',
    'float swell(vec2 p, float t) {',
    '  float d = seaDepth(p);',
    '  float k = smoothstep(0.6, 6.0, d);',
    '  return k * (0.16 * sin(dot(p, vec2(0.05, -0.99)) * 0.1496 + t * 1.18) + 0.09 * sin(dot(p, vec2(-0.32, -0.95)) * 0.2732 + t * 1.64) + 0.05 * sin(dot(p, vec2(0.41, -0.91)) * 0.5712 + t * 2.37));',
    '}',
    'float seaHeight(vec2 p, float t) { return shoreWave(p, t).x + swell(p, t); }',
    // the swash: how high up the beach (m above sea level) the latest wave has run
    'vec4 swash(float x, float t) {',
    '  float ph = t / WAVE_T + x * 0.0015; float m = floor(ph); float u = ph - m;',
    '  float Rmax = 0.2 + 0.45 * waveAmp(m) + 0.05 * sin(x * 0.013 + m * 1.7);',
    '  float R = u < 0.4 ? Rmax * sin(u / 0.4 * 1.5708) : Rmax * (1.0 - smoothstep(0.4, 0.95, u));',
    '  return vec4(R, Rmax, u, m);',
    '}',
  ].join('\n');

  // JS twins, for the sound of the surf
  function travelJS(x) { x = Math.max(x, 0); if (x <= 30) return 2 * Math.sqrt(x / (9.81 * SLOPE)); return 13.61 + 2 / (0.035 * Math.sqrt(9.81)) * (Math.sqrt(1.98 + 0.035 * (x - 30)) - Math.sqrt(1.98)); }

  /* ---------------------------------------------------------- the cast -- */
  // Surf-lifesaving beach sprinters: rash vests with a number, board shorts.
  var PLAYER = { gender: 'male', name: 'KAHALE', code: 'USA', label: 'Kahale (USA)', top: '#0F3D6E', trim: '#FF6B3D', shorts: '#0F3D6E', shoe: '#F4F1EA', skin: '#8B5A3C', hair: '#15100C', style: 'short04', height: 1.84, build: 1.1, pattern: 'band' };
  var RIVALS = [
    { gender: 'male', name: 'DUARTE', code: 'BRA', top: '#FFD83A', trim: '#1E9E4A', shorts: '#1F4AA8', shoe: '#1E9E4A', skin: '#8B5A3C', hair: '#120D0A', style: 'afro01', height: 1.82, build: 1.02, pattern: 'band' },
    { gender: 'female', name: 'WALSH', code: 'AUS', top: '#1E7F4F', trim: '#F4C542', shorts: '#10301F', shoe: '#F4C542', skin: '#E2B894', hair: '#C9A461', style: 'short02', height: 1.72, build: 1.0, pattern: 'yoke' },
    { gender: 'male', name: 'TUI', code: 'NZL', top: null, trim: '#FFFFFF', shorts: '#161616', shoe: '#161616', skin: '#7A4B2E', hair: '#0E0A08', style: 'short04', height: 1.9, build: 1.16, pattern: 'plain' },
    { gender: 'female', name: 'MARIN', code: 'ESP', top: '#D7263D', trim: '#F7D117', shorts: '#D7263D', shoe: '#F7D117', skin: '#C99A74', hair: '#2A1A10', style: 'short02', height: 1.7, build: 1.04, pattern: 'band' },
    { gender: 'male', name: 'OKORO', code: 'NGR', top: '#0F8A4B', trim: '#FFFFFF', shorts: '#FFFFFF', shoe: '#0F8A4B', skin: '#4A2D1C', hair: '#0C0907', style: 'afro01', height: 1.9, build: 1.14, pattern: 'sash' },
    { gender: 'female', name: 'NAKAMURA', code: 'JPN', top: '#F4F4F4', trim: '#D8282F', shorts: '#1B1B1B', shoe: '#D8282F', skin: '#E0B48E', hair: '#120E0B', style: 'short04', height: 1.68, build: 1.02, pattern: 'band' },
    { gender: 'male', name: 'REYES', code: 'PUR', top: '#1C4FB0', trim: '#E4002B', shorts: '#FFFFFF', shoe: '#E4002B', skin: '#A8704A', hair: '#16100C', style: 'short04', height: 1.83, build: 1.12, pattern: 'split' },
    { gender: 'female', name: 'LINDGREN', code: 'SWE', top: '#2F7FD8', trim: '#F7D117', shorts: '#2F7FD8', shoe: '#F7D117', skin: '#EFD2BE', hair: '#D8B870', style: 'short02', height: 1.76, build: 1.06, pattern: 'band' },
    { gender: 'male', name: 'VAKA', code: 'FIJ', top: null, trim: '#00A3E0', shorts: '#00A3E0', shoe: '#FFFFFF', skin: '#5E3A24', hair: '#0C0907', style: 'afro01', height: 1.93, build: 1.24, pattern: 'plain' },
    { gender: 'female', name: 'DUBOIS', code: 'FRA', top: '#1D3F9E', trim: '#E4002B', shorts: '#1D3F9E', shoe: '#FFFFFF', skin: '#6E4630', hair: '#0E0A08', style: 'afro01', height: 1.74, build: 1.1, pattern: 'stripes' },
    { gender: 'male', name: 'MENSAH', code: 'GHA', top: '#E8B420', trim: '#136B35', shorts: '#136B35', shoe: '#F5F5F5', skin: '#553520', hair: '#0E0A08', style: 'short04', height: 1.88, build: 1.2, pattern: 'checker' },
    { gender: 'female', name: 'COSTA', code: 'POR', top: '#8B1E3F', trim: '#1E9E4A', shorts: '#8B1E3F', shoe: '#1E9E4A', skin: '#B5825E', hair: '#16100C', style: 'short02', height: 1.73, build: 1.12, pattern: 'sash' },
  ];
  RIVALS.forEach(function (r, i) { r.number = String(210 + i * 17); r.label = r.name.charAt(0) + r.name.slice(1).toLowerCase() + ' (' + r.code + ')'; });
  PLAYER.number = '7';

  GameMog.world({
    // realistic sprinters from the platform's licensed library
    assets: ['human-athlete-male', 'human-athlete-female'],
    theme: { sky: '#8EC5E8', fog: '#C4DCEC', ink: '#0B2233', panel: '#FFF8EC', accent: '#FF6B3D', font: 'Barlow Condensed' },
    graphics: {
      exposure: 1.05,
      environment: true,
      bloom: { strength: 0.4, threshold: 1.25, radius: 0.7 },
      grade: { contrast: 1.06, saturation: 1.12, warmth: 0.07, vignette: 0.24, grain: 0.012 },
      shadows: { extent: 36, mapSize: 2048 },
    },
    camera: { distance: 6.4, height: 2.7, fov: 58 },
    track: { width: TW, points: TRACK_POINTS },
    build: build,
    player: function (ctx) { return libraryAthlete(ctx, PLAYER, 0) || fallbackRunner(ctx, PLAYER, 0); },
    rival: function (ctx, k) {
      var base = RIVALS[(k - 1) % RIVALS.length], round = Math.floor((k - 1) / RIVALS.length);
      var kit = Object.assign({}, base, { build: base.build + round * 0.05 });
      var r = libraryAthlete(ctx, kit, k) || fallbackRunner(ctx, kit, k);
      if (round) r.name += ' ' + (round + 1);
      return r;
    },
    obstacles: obstacles,
    update: update,
    ambient: ambient,
  });

  /* ------------------------------------------------------------ build -- */
  function build(ctx) {
    var THREE = ctx.THREE, scene = ctx.scene, low = ctx.quality === 'low';
    var R = rng(20260924);

    // light: a low sun over the sea to the south-west, a bright tropical sky
    var sun = new THREE.DirectionalLight('#FFD9A8', 3.6);
    sun.position.set(SUN[0] * 200, SUN[1] * 200, SUN[2] * 200); sun.castShadow = true;
    scene.add(sun, new THREE.HemisphereLight('#A9CDF0', '#C9A57A', 0.85));
    ctx.sky({ top: '#2A68B8', horizon: '#CFE4F2', bottom: '#5F90B0', sun: SUN, sunColor: '#FFE6BC', sunSize: 1.8, glow: 1.4, haze: 0.22, sunPower: 16, curve: 0.42 });
    // sea haze: the far headlands soften but the bay stays clear
    scene.fog = new THREE.Fog('#C4DCEC', 260, 2200);

    clouds(ctx, low);
    var terrain = buildTerrain(ctx, low);
    buildSea(ctx, low);
    buildLagoon(ctx);
    buildBoardwalk(ctx);
    rocks(ctx, low);
    palms(ctx, low);
    dunesGrass(ctx, low);
    hillTrees(ctx, low);
    pier(ctx);
    shacks(ctx);
    beachLife(ctx, low);
    courseFlags(ctx);
    startArch(ctx);
    return terrain;
  }

  // merge geometries that share the same attributes into one
  function merge(THREE, list) {
    var geoms = list.map(function (g) { return g.index ? g.toNonIndexed() : g; });
    var names = Object.keys(geoms[0].attributes), out = new THREE.BufferGeometry();
    names.forEach(function (n) {
      var size = geoms[0].attributes[n].itemSize, total = 0;
      geoms.forEach(function (g) { total += g.attributes[n] ? g.attributes[n].count : g.attributes.position.count; });
      var arr = new Float32Array(total * size), o = 0;
      geoms.forEach(function (g) {
        var a = g.attributes[n];
        if (a) { for (var i = 0; i < a.count; i++) for (var c = 0; c < size; c++) arr[o + i * size + c] = a.array[i * size + c]; o += a.count * size; }
        else o += g.attributes.position.count * size;
      });
      out.setAttribute(n, new THREE.BufferAttribute(arr, size));
    });
    return out;
  }
  function tint(THREE, g, hex) {
    var c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (var i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return g;
  }
  function vc(THREE, g, hex) { g = g.index ? g.toNonIndexed() : g; if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); return tint(THREE, g, hex); }

  /* ----------------------------------------------------------- clouds -- */
  // Tidewater's sky has fair-weather cumulus; here they are billboards, one
  // draw call, drawn with a sunlit top and a cool, flat base.
  function clouds(ctx, low) {
    var THREE = ctx.THREE, R = rng(77);
    var tex = ctx.textures.canvas(512, 256, function (g, w, h) {
      g.clearRect(0, 0, w, h);
      for (var i = 0; i < 90; i++) {
        var x = w * (0.14 + 0.72 * R()), y = h * (0.3 + 0.4 * R() - Math.abs(x / w - 0.5) * 0.5), r = h * (0.08 + 0.14 * R());
        var gr = g.createRadialGradient(x - r * 0.2, y - r * 0.35, r * 0.05, x, y, r);
        gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.62, 'rgba(242,245,250,0.92)'); gr.addColorStop(0.86, 'rgba(214,224,238,0.5)'); gr.addColorStop(1, 'rgba(200,214,232,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
      }
      // the flat, shaded base
      var base = g.createLinearGradient(0, h * 0.55, 0, h * 0.8);
      base.addColorStop(0, 'rgba(160,176,196,0)'); base.addColorStop(1, 'rgba(150,166,190,0.55)');
      g.globalCompositeOperation = 'source-atop'; g.fillStyle = base; g.fillRect(0, 0, w, h);
    });
    var mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, color: '#FFFFFF' });
    mat.onBeforeCompile = function (sh) {
      sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>', [
        'vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);',
        'vec3 isc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), 1.0);',
        'mvPosition.xy += position.xy * isc.xy;',
        'gl_Position = projectionMatrix * mvPosition;',
      ].join('\n'));
    };
    var n = low ? 16 : 30;
    var m = ctx.instanced(new THREE.PlaneGeometry(1, 0.5), mat, n, function (i, d) {
      var a = -0.2 * PI + R() * 1.4 * PI + PI * 0.5, r = 900 + R() * 600;
      if (i < 10) a = PI * 0.5 + (R() - 0.5) * 1.8;     // most over the sea, where you look
      d.position.set(Math.cos(a) * r - 100, 160 + R() * 240, Math.sin(a) * r);
      var s = 160 + R() * 260; d.scale.set(s, s, 1);
    });
    m.frustumCulled = false; m.renderOrder = -1;
    ctx.scene.add(m);
  }

  /* ---------------------------------------------------------- terrain -- */
  function buildTerrain(ctx, low) {
    var THREE = ctx.THREE, trk = ctx.track;
    var X0 = -560, X1 = 560, Z0 = -440, Z1 = 220, step = low ? 5 : 2.5;
    var nx = Math.round((X1 - X0) / step), nz = Math.round((Z1 - Z0) / step);
    var geo = new THREE.PlaneGeometry(X1 - X0, Z1 - Z0, nx, nz);
    geo.rotateX(-PI / 2); geo.translate((X0 + X1) / 2, 0, (Z0 + Z1) / 2);
    var pos = geo.attributes.position, n = pos.count;
    var sandA = new Float32Array(n), trackA = new Float32Array(n);
    // a coarse copy of the loop to find the vertices near it quickly
    var coarse = TRACK_POINTS;
    function nearLoop(x, z) {
      var best = 1e9;
      for (var i = 0; i < coarse.length; i++) {
        var a = coarse[i], b = coarse[(i + 1) % coarse.length], abx = b[0] - a[0], abz = b[2] - a[2];
        var t = clamp(((x - a[0]) * abx + (z - a[2]) * abz) / (abx * abx + abz * abz), 0, 1);
        var dx = x - (a[0] + abx * t), dz = z - (a[2] + abz * t), d2 = dx * dx + dz * dz;
        if (d2 < best) best = d2;
      }
      return Math.sqrt(best);
    }
    for (var i = 0; i < n; i++) {
      var x = pos.getX(i), z = pos.getZ(i), h = baseHeight(x, z);
      var lm = lagoonMask(x, z);
      if (lm > 0) h = lerp(h, LAGOON.level - 1.25, lm);
      if (nearLoop(x, z) < HW + 14) {
        var nr = trk.nearest(x, z), lat = Math.abs(nr.lateral), dist = nr.distance;
        var k = 1 - smooth(HW + 1.2, HW + 3.6, Math.min(lat, dist));
        if (lm < 0.02 && k > 0) h = lerp(h, nr.y, k);
        trackA[i] = 1 - smooth(HW - 0.4, HW + 0.4, Math.min(lat, dist));
      }
      pos.setY(i, h);
      var s = shoreS(x, z);
      var nzs = (noise(x * 0.05, z * 0.05) - 0.5);
      sandA[i] = (1 - smooth(84, 104, s + nzs * 18)) * smooth(5.2, 3.2, h + nzs * 2.5);
    }
    geo.computeVertexNormals();
    // colour: sand, the green behind it, rock where it is steep or wave-washed
    var nor = geo.attributes.normal, col = new Float32Array(n * 3), c = new THREE.Color(), tmp = new THREE.Color();
    var DRY = new THREE.Color('#D9B98A'), PALE = new THREE.Color('#E3C9A0'), WARM = new THREE.Color('#C9A574'), SCRUB = new THREE.Color('#8E8F52');
    var GRASS = new THREE.Color('#5E7A36'), JUNGLE = new THREE.Color('#2C4A22'), DEEPG = new THREE.Color('#1E361A');
    var ROCK = new THREE.Color('#6D675E'), DARKR = new THREE.Color('#45413C'), MUD = new THREE.Color('#7A6A4E');
    for (i = 0; i < n; i++) {
      x = pos.getX(i); z = pos.getZ(i); h = pos.getY(i); s = shoreS(x, z);
      var steep = 1 - nor.getY(i), nz1 = noise(x * 0.08, z * 0.08), nz2 = fbm(x * 0.012, z * 0.012);
      c.copy(DRY).lerp(PALE, smooth(24, 44, s) * 0.7).lerp(WARM, nz1 * 0.4);
      // beach vines and scrub in patches on the back beach, under the palms
      c.lerp(SCRUB, smooth(52, 80, s) * smooth(0.45, 0.75, fbm(x * 0.03 + 11, z * 0.03)) * 0.75);
      var green = 1 - sandA[i];
      if (green > 0) {
        var canopy = noise(x * 0.16, z * 0.16) * 0.6 + noise(x * 0.45 + 7, z * 0.45) * 0.4;
        tmp.copy(GRASS).lerp(JUNGLE, 0.45 + smooth(3, 16, h) * 0.5).lerp(DEEPG, smooth(0.35, 0.8, nz2) * 0.7);
        tmp.multiplyScalar(0.62 + canopy * 0.6);
        c.lerp(tmp, green);
      }
      var rock = Math.max(smooth(0.42, 0.62, steep), smooth(186, 222, Math.abs(x)) * smooth(9, 0.5, h) * smooth(0.12, 0.3, steep));
      if (rock > 0) { tmp.copy(ROCK).lerp(DARKR, nz1 * 0.6 + smooth(1.2, -0.5, h) * 0.5); c.lerp(tmp, rock); sandA[i] *= 1 - rock; }
      var lm2 = lagoonMask(x, z);
      if (lm2 > 0.05) c.lerp(MUD, smooth(0.05, 0.6, lm2) * 0.6);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aSand', new THREE.BufferAttribute(sandA, 1));
    geo.setAttribute('aTrack', new THREE.BufferAttribute(trackA, 1));
    // repeat the detail maps many times over the ground
    var uv = geo.attributes.uv;
    for (i = 0; i < n; i++) uv.setXY(i, pos.getX(i) / 3.2, pos.getZ(i) / 3.2);

    var grain = ctx.textures.canvas(512, 512, function (g, w, h) {
      g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, w, h);
      var r = rng(5);
      for (var k = 0; k < 9000; k++) {
        var v = 200 + Math.floor(r() * 55), a = 0.08 + r() * 0.2;
        g.fillStyle = 'rgba(' + v + ',' + (v - 12) + ',' + (v - 30) + ',' + a + ')';
        g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
      }
      for (k = 0; k < 600; k++) { g.fillStyle = 'rgba(70,58,44,' + (0.15 + r() * 0.3) + ')'; g.fillRect(r() * w, r() * h, 1.5, 1.5); }
    });
    // wind ripples, a few centimetres high and forty apart
    var ripples = ctx.textures.normal(512, 512, function (g, w, h) {
      var r = rng(9);
      for (var y = 0; y < h; y++) for (var x = 0; x < w; x += 2) {
        var p = (y + Math.sin(x / w * TAU * 3 + Math.sin(y / h * TAU * 2) * 2) * 9 + (r() - 0.5) * 1.2) / h * 12 * TAU;
        var v = 128 + Math.sin(p + Math.sin(p) * 0.5) * 60;
        g.fillStyle = 'rgb(' + (v | 0) + ',' + (v | 0) + ',' + (v | 0) + ')'; g.fillRect(x, y, 2, 1);
      }
    }, 2.2);
    var mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: grain, normalMap: ripples, roughness: 0.92, metalness: 0 });
    mat.normalScale.set(0.26, 0.26);
    mat.onBeforeCompile = function (sh) {
      sh.uniforms.uTime = W.time;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aSand;\nattribute float aTrack;\nvarying float vSand;\nvarying float vTrackBand;\nvarying vec3 vW;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSand = aSand; vTrackBand = aTrack; vW = (modelMatrix * vec4(position, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vSand;\nvarying float vTrackBand;\nvarying vec3 vW;\n' + SHORE_GLSL + '\nfloat gmWet; float gmFilm; float gmCover; float gmFoam;')
        .replace('#include <color_fragment>', [
          '#include <color_fragment>',
          'gmWet = 0.0; gmFilm = 0.0; gmCover = 0.0; gmFoam = 0.0;',
          'float gs = shoreS(vW.xz);',
          '// the course: sand packed by the runners, a shade darker',
          'diffuseColor.rgb *= 1.0 - vTrackBand * vSand * 0.07;',
          'if (gs > -12.0 && gs < 30.0 && vSand > 0.2) {',
          '  vec4 sw = swash(vW.x, uTime);',
          '  float y = vW.y;',
          '  float th = sw.x - y;',
          '  gmCover = smoothstep(-0.004, 0.012, th);',
          '  float reach = sw.z < 0.4 ? sw.x : sw.y;',
          '  float unc = 0.4 + 0.55 * clamp(1.0 - y / max(sw.y, 0.001), 0.0, 1.0);',
          '  float age = max(sw.z - unc, 0.0) * WAVE_T;',
          '  gmFilm = (y < reach && th < 0.0) ? exp(-age / 1.6) : 0.0;',
          '  float hw = 0.58 + 0.07 * sin(vW.x * 0.021) + 0.04 * gmNoise(vW.xz * 0.15);',
          '  gmWet = max(1.0 - smoothstep(hw - 0.03, hw + 0.05, y), gmFilm);',
          '  float wrack = (1.0 - smoothstep(0.0, 0.035, abs(y - hw - 0.02))) * smoothstep(0.45, 0.7, gmNoise(vW.xz * vec2(0.9, 2.2)));',
          '  if (y < 0.0) gmWet = 1.0;',
          '  // the leading edge of the sheet is a line of foam; lace trails behind it',
          '  float edge = (1.0 - smoothstep(0.0, 0.03 + 0.03 * gmNoise(vW.xz * 0.7), abs(th))) * (sw.z < 0.45 ? 1.0 : 0.45) * step(0.02, sw.x);',
          '  float lace = smoothstep(0.62, 0.86, gmNoise(vW.xz * vec2(0.8, 1.5) + vec2(uTime * 0.05, uTime * 0.21)) * 0.7 + gmNoise(vW.xz * 3.1) * 0.4) * gmCover * (1.0 - smoothstep(0.0, 0.1, th));',
          '  gmFoam = max(edge, lace * 0.75) * vSand;',
          '  vec3 wet = diffuseColor.rgb * vec3(0.56, 0.54, 0.5);',
          '  diffuseColor.rgb = mix(diffuseColor.rgb, wet, gmWet * vSand * 0.9);',
          '  vec3 sheet = mix(wet * 0.8, vec3(0.05, 0.3, 0.3), 0.18 + 0.35 * smoothstep(0.0, 0.12, th));',
          '  diffuseColor.rgb = mix(diffuseColor.rgb, sheet, gmCover * vSand);',
          '  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.95, 0.94), gmFoam);',
          '  // the wrack line the high tide leaves: weed and shell grit',
          '  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.2, 0.17, 0.1), wrack * 0.45 * (1.0 - gmCover));',
          '}',
        ].join('\n'))
        .replace('#include <roughnessmap_fragment>', [
          '#include <roughnessmap_fragment>',
          'roughnessFactor = mix(roughnessFactor, 0.42, gmWet * vSand);',
          'roughnessFactor = mix(roughnessFactor, 0.14, gmFilm * vSand);',
          'roughnessFactor = mix(roughnessFactor, 0.05, gmCover * vSand);',
          'roughnessFactor = mix(roughnessFactor, 0.75, gmFoam);',
        ].join('\n'))
        .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nvec3 gmN0 = normal;')
        .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize(mix(gmN0, normal, vSand * (1.0 - gmCover)));');
    };
    var mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    ctx.scene.add(mesh);
    W.terrainHeight = function (x, z) {
      var fx = (x - X0) / step, fz = (z - Z0) / step, ix = clamp(Math.floor(fx), 0, nx - 1), iz = clamp(Math.floor(fz), 0, nz - 1), tx = fx - ix, tz = fz - iz;
      function H(a, b) { return pos.getY(b * (nx + 1) + a); }
      return lerp(lerp(H(ix, iz), H(ix + 1, iz), tx), lerp(H(ix, iz + 1), H(ix + 1, iz + 1), tx), tz);
    };
    return mesh;
  }

  /* -------------------------------------------------------------- sea -- */
  // A grid laid along the shore, fine through the surf and coarse offshore.
  // The vertex shader lifts the swell and the shore waves; the fragment shader
  // colours the water by its depth (turquoise over the sand, blue beyond),
  // lights the thin crest face from behind and whitens the breakers.
  function buildSea(ctx, low) {
    var THREE = ctx.THREE;
    var rows = [], s;
    for (s = 3; s > -40; s -= low ? 1.4 : 0.8) rows.push(s);
    for (s = -40; s > -120; s -= 2.5) rows.push(s);
    for (s = -120; s > -420; s -= 12) rows.push(s);
    for (s = -420; s >= -1300; s -= 80) rows.push(s);
    var dx = low ? 4 : 2.5, x0 = -900, cols = Math.round(1800 / dx) + 1;
    var pos = new Float32Array(cols * rows.length * 3), idx = [];
    for (var j = 0; j < rows.length; j++) for (var i = 0; i < cols; i++) {
      var x = x0 + i * dx, v = (j * cols + i) * 3;
      pos[v] = x; pos[v + 1] = 0; pos[v + 2] = shoreZ(x) - rows[j];
    }
    for (j = 0; j < rows.length - 1; j++) for (i = 0; i < cols - 1; i++) {
      var a = j * cols + i, b = a + 1, c = a + cols, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(pos.length).fill(0).map(function (_, k) { return k % 3 === 1 ? 1 : 0; }), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(cols * rows.length * 2).map(function (_, k) { var q = k >> 1; return k & 1 ? pos[q * 3 + 2] / 9 : pos[q * 3] / 9; }), 2));
    geo.setIndex(cols * rows.length > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));

    var ripples = ctx.textures.normal(256, 256, function (g, w, h) {
      var r = rng(31);
      for (var k = 0; k < 900; k++) {
        var x = r() * w, y = r() * h, rad = 3 + r() * 14, gr = g.createRadialGradient(x, y, 0, x, y, rad);
        var v = r() > 0.5 ? 255 : 0;
        gr.addColorStop(0, 'rgba(' + v + ',' + v + ',' + v + ',0.35)'); gr.addColorStop(1, 'rgba(128,128,128,0)');
        g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
    }, 3);
    W.seaRipples = ripples;
    var U = { uShallow: { value: new THREE.Color('#34CDBE') }, uMid: { value: new THREE.Color('#0C8DB0') }, uDeep: { value: new THREE.Color('#083E6E') }, uSss: { value: new THREE.Color('#1F8C73') } };
    var mat = new THREE.MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.06, metalness: 0, transparent: true, normalMap: ripples, envMapIntensity: 1.1 });
    mat.normalScale.set(0.35, 0.35);
    mat.onBeforeCompile = function (sh) {
      sh.uniforms.uTime = W.time; Object.keys(U).forEach(function (k) { sh.uniforms[k] = U[k]; });
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\n' + SHORE_GLSL + '\nvarying vec3 vW; varying float vDepth; varying vec4 vWave;')
        .replace('#include <beginnormal_vertex>', [
          'vec2 gp = position.xz;',
          'vec4 gw = shoreWave(gp, uTime);',
          'float gh = gw.x + swell(gp, uTime);',
          'float ge = 0.6;',
          'float ghx = seaHeight(gp + vec2(ge, 0.0), uTime);',
          'float ghz = seaHeight(gp + vec2(0.0, ge), uTime);',
          'vec3 objectNormal = normalize(vec3(gh - ghx, ge, gh - ghz));',
          '#ifdef USE_TANGENT',
          'vec3 objectTangent = vec3(tangent.xyz);',
          '#endif',
        ].join('\n'))
        .replace('#include <begin_vertex>', [
          'vec3 transformed = vec3(position);',
          'transformed.y += gh;',
          'vWave = gw; vDepth = seaDepth(gp);',
          'vW = (modelMatrix * vec4(transformed, 1.0)).xyz;',
        ].join('\n'));
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\n' + SHORE_GLSL + '\nuniform vec3 uShallow; uniform vec3 uMid; uniform vec3 uDeep; uniform vec3 uSss;\nvarying vec3 vW; varying float vDepth; varying vec4 vWave;\nfloat gmFoamW;')
        .replace('#include <color_fragment>', [
          '#include <color_fragment>',
          'float dep = max(vDepth, 0.0);',
          'vec3 wc = mix(uShallow, uMid, smoothstep(0.3, 3.5, dep));',
          'wc = mix(wc, uDeep, smoothstep(3.0, 9.0, dep));',
          '// breakers and the churned water behind them, laced with noise',
          'float n1 = gmNoise(vW.xz * vec2(0.55, 1.4) + vec2(0.0, uTime * 0.35));',
          'float n2 = gmNoise(vW.xz * 3.1 - vec2(uTime * 0.2, 0.0));',
          'float n3 = gmNoise(vW.xz * 7.3 + vec2(uTime * 0.1, -uTime * 0.3));',
          '// lace: the foam breaks into cells and threads, not blobs',
          'float white = vWave.w * smoothstep(0.2, 0.62, n1 * 0.5 + n2 * 0.35 + n3 * 0.3 + vWave.w * 0.35);',
          'float edge = (1.0 - smoothstep(0.02, 0.35, dep)) * smoothstep(0.3, 0.7, n2 + 0.2);',
          'float streak = (1.0 - smoothstep(0.4, 2.2, dep)) * smoothstep(0.72, 0.9, gmNoise(vW.xz * vec2(0.35, 1.2) + vec2(0.0, uTime * 0.12)));',
          'gmFoamW = clamp(max(max(white, edge), streak * 0.6), 0.0, 1.0);',
          'diffuseColor.rgb = mix(wc, vec3(0.94, 0.96, 0.95), gmFoamW);',
          '// thin water over the sand shows it; deep water does not',
          'diffuseColor.a = clamp(1.0 - exp(-dep * 2.2) + gmFoamW, 0.0, 1.0) * smoothstep(-0.02, 0.06, dep + vWave.x);',
        ].join('\n'))
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.8, gmFoamW);')
        .replace('#include <emissivemap_fragment>', [
          '#include <emissivemap_fragment>',
          '// the sun through the thin crest face: Tidewater\'s turquoise scatter colour',
          'totalEmissiveRadiance += uSss * clamp(vWave.z, 0.0, 1.2) * 0.9;',
        ].join('\n'));
    };
    var mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 1;
    ctx.scene.add(mesh);
  }

  function buildLagoon(ctx) {
    var THREE = ctx.THREE;
    var g = new THREE.CircleGeometry(1, 64); g.rotateX(-PI / 2);
    // still, tea-green water over a muddy bed: darker and less reflective than the sea
    var m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: '#23604F', roughness: 0.12, metalness: 0, transparent: true, opacity: 0.93, normalMap: W.seaRipples, envMapIntensity: 0.55 }));
    m.material.normalScale.set(0.2, 0.2);
    m.scale.set(LAGOON.rx * 1.08, 1, LAGOON.rz * 1.1); m.position.set(LAGOON.x, LAGOON.level, LAGOON.z);
    ctx.scene.add(m);
  }

  // the boardwalk: where the loop crosses the lagoon, a plank deck on piles
  function boardSpan(ctx) {
    if (W.board) return W.board;
    var L = ctx.track.length, d0 = -1, d1 = -1;
    for (var d = 0; d < L; d += 1) { var p = ctx.track.pointAt(d, 0, 0); if (lagoonMask(p.x, p.z) > 0.02) { if (d0 < 0) d0 = d; d1 = d; } }
    W.board = d0 < 0 ? null : { d0: d0 - 6, d1: d1 + 6 };
    return W.board;
  }
  function buildBoardwalk(ctx) {
    var THREE = ctx.THREE, span = boardSpan(ctx);
    if (!span) return;
    var planks = [], F, R = rng(3);
    for (var d = span.d0; d < span.d1; d += 0.26) {
      F = ctx.track.frameAt(d);
      var g = new THREE.BoxGeometry(TW + 0.8, 0.07, 0.23);
      var yaw = Math.atan2(F.tan.x, F.tan.z);
      g.rotateY(yaw); g.translate(F.pos.x, F.pos.y - 0.03, F.pos.z);
      var tone = 0.78 + R() * 0.3, c = new THREE.Color('#A37F57').multiplyScalar(tone);
      planks.push(vc(THREE, g, '#' + c.getHexString()));
    }
    var wood = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
    var deck = new THREE.Mesh(merge(THREE, planks), wood); deck.castShadow = true; deck.receiveShadow = true;
    ctx.scene.add(deck);
    // piles and low rails (0.75 m, under the corridor's limit)
    var piles = [], posts = [];
    for (d = span.d0; d < span.d1; d += 3) {
      F = ctx.track.frameAt(d);
      [-1, 1].forEach(function (side) {
        var p = F.pos.clone().addScaledVector(F.right, side * (HW + 0.3));
        piles.push([p.x, p.y, p.z]); posts.push([p.x, p.y, p.z]);
      });
    }
    ctx.scene.add(ctx.instanced(new THREE.CylinderGeometry(0.13, 0.15, 4, 7).translate(0, -2, 0), new THREE.MeshStandardMaterial({ color: '#6B5238', roughness: 0.9 }), piles.length, function (i, dm) { dm.position.set(piles[i][0], piles[i][1], piles[i][2]); }));
    var postM = ctx.instanced(new THREE.BoxGeometry(0.12, 0.75, 0.12).translate(0, 0.375, 0), wood.clone(), posts.length, function (i, dm) { dm.position.set(posts[i][0], posts[i][1], posts[i][2]); });
    postM.material.vertexColors = false; postM.material.color.set('#8C6A48'); postM.castShadow = true; ctx.scene.add(postM);
    var rails = [];
    [-1, 1].forEach(function (side) {
      for (var dd = span.d0; dd < span.d1 - 1.5; dd += 1.5) {
        var A = ctx.track.pointAt(dd, side * (HW + 0.3), 0.72), B = ctx.track.pointAt(dd + 1.5, side * (HW + 0.3), 0.72);
        var len = A.distanceTo(B), g = new THREE.BoxGeometry(0.08, 0.1, len + 0.02);
        g.rotateY(Math.atan2(B.x - A.x, B.z - A.z)); g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
        rails.push(vc(THREE, g, '#9A7650'));
      }
    });
    ctx.scene.add(new THREE.Mesh(merge(THREE, rails), wood));
  }

  /* ------------------------------------------------------------ rocks -- */
  function rockGeometry(THREE, seed, detail) {
    var g = new THREE.IcosahedronGeometry(1, detail), p = g.attributes.position, nrm = g.attributes.normal, v = new THREE.Vector3();
    g.computeVertexNormals();
    var flat = new Float32Array(nrm.array);
    for (var i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      var dir = v.clone().normalize();
      var n = fbm(v.x * 1.6 + seed, v.z * 1.6 + v.y * 1.3) * 0.55 + noise(v.x * 4 + seed, v.y * 4) * 0.15;
      v.multiplyScalar(0.72 + n); v.y = v.y > 0 ? v.y * 1.05 : v.y * 0.5;
      p.setXYZ(i, v.x, v.y, v.z);
      // smooth shading from the sphere, a touch of the facet for chiselled planes
      var fx = lerp(dir.x, flat[i * 3], 0.25), fy = lerp(dir.y * 1.4, flat[i * 3 + 1], 0.25), fz = lerp(dir.z, flat[i * 3 + 2], 0.25), l = Math.hypot(fx, fy, fz);
      nrm.setXYZ(i, fx / l, fy / l, fz / l);
    }
    return g;
  }
  function rocks(ctx, low) {
    var THREE = ctx.THREE, R = rng(41);
    var mat = new THREE.MeshStandardMaterial({ color: '#77716A', roughness: 0.88, metalness: 0 });
    mat.onBeforeCompile = function (sh) {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vRW;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvRW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vRW;')
        .replace('#include <color_fragment>', '#include <color_fragment>\n// wet and dark near the water, weed-stained just above it, lichen higher up\ndiffuseColor.rgb *= mix(0.45, 1.0, smoothstep(-0.4, 1.4, vRW.y));\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.2, 0.26, 0.13), (1.0 - smoothstep(0.6, 1.6, vRW.y)) * smoothstep(-0.6, 0.4, vRW.y) * 0.6);\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.72, 0.7, 0.62), smoothstep(6.0, 12.0, vRW.y) * 0.25);');
    };
    var list = [];
    SEA_STACKS.forEach(function (s) { list.push([s[0], -0.8, s[1], s[2], s[3], R() * TAU]); });
    // boulders at the headland feet, in and out of the surf
    for (var i = 0; i < (low ? 40 : 90); i++) {
      var side = i % 2 ? 1 : -1, x = side * (196 + R() * 50), z = -30 + R() * 110;
      var h = W.terrainHeight(x, z);
      if (h > 7 || h < -3) continue;
      var sc = 1.2 + R() * 3.4;
      list.push([x, h - sc * 0.3, z, sc, sc * (0.6 + R() * 0.5), R() * TAU]);
    }
    // a few rocks at the back of the beach and round the lagoon
    for (i = 0; i < 18; i++) {
      x = -200 + R() * 400; z = -70 - R() * 50;
      if (!ctx.track.clear(x, z, 5) || lagoonMask(x, z) > 0.3) continue;
      sc = 0.6 + R() * 1.4; list.push([x, W.terrainHeight(x, z) - sc * 0.25, z, sc, sc * 0.8, R() * TAU]);
    }
    var geo = rockGeometry(THREE, 3, 2);
    var m = ctx.instanced(geo, mat, list.length, function (n, d) { var r = list[n]; d.position.set(r[0], r[1], r[2]); d.scale.set(r[3], r[4], r[3] * 0.9); d.rotation.y = r[5]; });
    m.castShadow = true; m.receiveShadow = true;
    ctx.scene.add(m);
  }

  /* ------------------------------------------------------------ palms -- */
  // After Tidewater's coconut palm: a ringed trunk flaring at the base, and a
  // crown of fronds in a 2/5 spiral, young ones standing up, older ones arching
  // out and drooping at the tips, the oldest hanging along the trunk.
  var PALM_H = 10;
  function palmRadius(u) {
    var y = u * PALM_H, r = 0.155 + 0.045 * (1 - u) + 0.19 * Math.exp(-Math.max(y, 0) / 0.42);
    r *= 1 + 0.05 * Math.sin(y * 1.7) * (1 - u);
    return r + 0.07 * smooth(0.955, 0.99, u);
  }
  function palmTrunk(THREE) {
    var rad = 9, rows = 24, pos = [], uv = [], idx = [];
    for (var j = 0; j <= rows; j++) {
      var u = j / rows, y = u * PALM_H, r = palmRadius(u);
      for (var i = 0; i <= rad; i++) {
        var a = i / rad * TAU;
        pos.push(Math.cos(a) * r, y, Math.sin(a) * r); uv.push(i / rad, y / 0.35);
      }
    }
    for (j = 0; j < rows; j++) for (i = 0; i < rad; i++) { var a0 = j * (rad + 1) + i, b0 = a0 + rad + 1; idx.push(a0, b0, a0 + 1, a0 + 1, b0, b0 + 1); }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }
  function palmCrown(THREE, R) {
    var pos = [], uv = [], nor = [], aw = [], idx = [], up = new THREE.Vector3(0, 1, 0);
    var count = 18;
    for (var i = 0; i < count; i++) {
      var a = i / (count - 1), hanging = i >= count - 2, len = (3.8 + 1.5 * smooth(0, 0.45, a)) * (0.88 + 0.24 * R());
      var f = {
        a: a, azimuth: i * 2.39996 + (R() - 0.5) * 0.4,
        elevation: hanging ? -1.05 - (i - (count - 2)) * 0.25 : 1.0 - 1.25 * Math.pow(a, 0.8) + (R() - 0.5) * 0.3,
        bend: hanging ? 0.35 : 0.55 + 1.15 * a + R() * 0.4, bendPow: hanging ? 1.2 : 1.9 + R() * 0.5,
        twist: (R() - 0.5) * 0.45, roll: (R() - 0.5) * (hanging ? 0.4 : 0.9), length: hanging ? len * 0.9 : len, attachY: 0.32 - 0.5 * a, dead: hanging,
      };
      frond(f);
    }
    function frond(f) {
      var segs = 8, pts = [], p = new THREE.Vector3(Math.cos(f.azimuth) * 0.14, f.attachY, Math.sin(f.azimuth) * 0.14), v0 = new THREE.Vector3();
      for (var k = 0; k <= segs; k++) {
        pts.push(p.clone());
        var sm = (k + 0.5) / segs, el = f.elevation - f.bend * Math.pow(sm, f.bendPow), az = f.azimuth + f.twist * sm;
        v0.set(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az));
        p.addScaledVector(v0, f.length / segs);
      }
      var azPerp = new THREE.Vector3(-Math.sin(f.azimuth), 0, Math.cos(f.azimuth)), T = new THREE.Vector3(), S = new THREE.Vector3(), N = new THREE.Vector3(), side = new THREE.Vector3(), ld = new THREE.Vector3();
      [-1, 1].forEach(function (sg) {
        var base = pos.length / 3, cross = 2;
        for (var k = 0; k <= segs; k++) {
          var s = k / segs;
          T.subVectors(pts[Math.min(segs, k + 1)], pts[Math.max(0, k - 1)]).normalize();
          S.crossVectors(T, up); if (S.lengthSq() < 0.04) S.copy(azPerp); S.normalize();
          N.crossVectors(S, T).normalize();
          var Ll = Math.max(0.23 * f.length * (smooth(0.14, 0.3, s) * (1 - 0.68 * smooth(0.35, 1, s))), 0.045);
          var al = 1.1 - 0.5 * s, be = (f.dead ? 1.3 : 0.88 + 0.35 * f.a) + 0.45 * s + sg * f.roll * s * s, curl = f.dead ? 0.15 : 0.45;
          side.copy(S).multiplyScalar(sg * Math.cos(be)).addScaledVector(N, -Math.sin(be));
          ld.copy(T).multiplyScalar(Math.cos(al)).addScaledVector(side, Math.sin(al)).normalize();
          for (var j = 0; j <= cross; j++) {
            var t = j / cross, q = pts[k].clone().addScaledVector(ld, Ll * t).addScaledVector(N, -Ll * curl * t * t);
            pos.push(q.x, q.y, q.z); nor.push(N.x, N.y, N.z); uv.push(t, s); aw.push(s * (f.dead ? 0.3 : 1));
          }
        }
        for (k = 0; k < segs; k++) for (var j2 = 0; j2 < cross; j2++) {
          var a0 = base + k * (cross + 1) + j2, b0 = a0 + cross + 1;
          idx.push(a0, b0, a0 + 1, a0 + 1, b0, b0 + 1);
        }
      });
    }
    // a coconut cluster under the crown
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('aWave', new THREE.Float32BufferAttribute(aw, 1)); g.setIndex(idx);
    return g;
  }
  function palms(ctx, low) {
    var THREE = ctx.THREE, R = rng(12), list = [];
    function tryAdd(x, z, lean) {
      if (!ctx.track.clear(x, z, 3.5) || lagoonMask(x, z) > 0.25) return;
      for (var i = 0; i < list.length; i++) if (Math.hypot(list[i].x - x, list[i].z - z) < 4.5) return;
      var h = W.terrainHeight(x, z);
      if (h < 1.4 || h > 30) return;
      var height = 7 + R() * 5.5, dir = -PI / 2 + (R() - 0.5) * 0.8, reach = height * Math.sin(lean);
      // the trunk leans along its local x: the tip lands this far out, and the crown is 5 m across
      var tx = x + reach * Math.cos(dir), tz = z - reach * Math.sin(dir);
      if (!ctx.track.clear(tx, tz, 8.5)) return;
      // the runtime tests the trunk's box, not the trunk: keep all four corners of the box off the course too
      var x0 = Math.min(x, tx) - 0.5, x1 = Math.max(x, tx) + 0.5, z0 = Math.min(z, tz) - 0.5, z1 = Math.max(z, tz) + 0.5;
      if (!ctx.track.clear(x0, z0, 1.8) || !ctx.track.clear(x1, z0, 1.8) || !ctx.track.clear(x0, z1, 1.8) || !ctx.track.clear(x1, z1, 1.8)) return;
      list.push({ x: x, z: z, y: h, height: height, lean: lean, dir: dir, spin: R() * TAU });
    }
    var target = low ? 55 : 115, guard = 0;
    while (list.length < target && guard++ < 6000) {
      var x = -230 + R() * 460, z = -60 - R() * 70 + (R() < 0.35 ? 30 * R() : 0);
      var s = shoreS(x, z);
      if (s < 40 || s > 150) continue;
      tryAdd(x, z, 0.06 + R() * 0.22);
    }
    // a few lean out over the beach, between the legs
    [[-60, -32], [-18, -36], [34, -34], [88, -38], [-120, -34], [120, -36]].forEach(function (p) { tryAdd(p[0], p[1], 0.36 + R() * 0.12); });
    var bark = ctx.textures.canvas(64, 256, function (g, w, h) {
      g.fillStyle = '#8A7760'; g.fillRect(0, 0, w, h);
      for (var y = 0; y < h; y += 8) { g.fillStyle = 'rgba(52,40,30,0.55)'; g.fillRect(0, y, w, 2); g.fillStyle = 'rgba(190,170,140,0.25)'; g.fillRect(0, y + 3, w, 2); }
    });
    var trunkMat = new THREE.MeshStandardMaterial({ map: bark, roughness: 0.92 });
    var trunkGeo = palmTrunk(THREE), crownGeo = palmCrown(THREE, R);
    trunkGeo.computeBoundingBox(); crownGeo.computeBoundingBox();
    // Place every palm as the runtime will see it: it hides any instance whose
    // box comes within the corridor below 7 m, which would leave a crown with
    // no trunk or a trunk with no crown. So test both boxes first and drop the palm.
    var O = new THREE.Object3D(), box = new THREE.Box3(), keep = [], tip = [], crownM = [], trunkM = [];
    function boxClear(b) {
      var cx = [b.min.x, b.max.x, (b.min.x + b.max.x) / 2], cz = [b.min.z, b.max.z, (b.min.z + b.max.z) / 2];
      for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) {
        var nr = ctx.track.nearest(cx[i], cz[j]);
        if (nr.distance < HW + 2.2 && b.min.y < nr.y + 7.5 && b.max.y > nr.y + 0.8) return false;
      }
      return true;
    }
    list.forEach(function (p) {
      O.position.set(p.x, p.y - 0.1, p.z); O.rotation.set(0, 0, 0); O.scale.set(1, p.height / PALM_H, 1); O.rotateY(p.dir); O.rotateZ(-p.lean); O.updateMatrix();
      var tm = O.matrix.clone(), t = new THREE.Vector3(0, PALM_H * 0.995, 0).applyMatrix4(tm);
      if (!boxClear(box.copy(trunkGeo.boundingBox).applyMatrix4(tm))) return;
      O.position.copy(t); O.rotation.set(0, p.spin, 0); O.scale.setScalar(0.85 + (p.height - 7) / 5.5 * 0.3); O.updateMatrix();
      var cm = O.matrix.clone();
      if (!boxClear(box.copy(crownGeo.boundingBox).applyMatrix4(cm))) return;
      keep.push(p); tip.push(t); trunkM.push(tm); crownM.push(cm);
    });
    list = keep;
    var trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, list.length);
    trunkM.forEach(function (m, n) { trunks.setMatrixAt(n, m); });
    trunks.castShadow = true; trunks.receiveShadow = true; ctx.scene.add(trunks);
    var leaf = ctx.textures.canvas(128, 512, function (g, w, h) {
      g.clearRect(0, 0, w, h);
      // leaflets fanning out from the rachis (u = 0) to their tips (u = 1)
      for (var y = 0; y < h; y += 7) {
        var shade = 0.8 + ((y * 7919) % 97) / 97 * 0.35, gr = g.createLinearGradient(0, 0, w, 0);
        gr.addColorStop(0, 'rgb(' + Math.round(96 * shade) + ',' + Math.round(128 * shade) + ',' + Math.round(40 * shade) + ')');
        gr.addColorStop(1, 'rgb(' + Math.round(150 * shade) + ',' + Math.round(170 * shade) + ',' + Math.round(62 * shade) + ')');
        g.fillStyle = gr; g.beginPath(); g.moveTo(0, y); g.lineTo(w, y + 5); g.lineTo(w, y + 6.5); g.lineTo(0, y + 5.5); g.closePath(); g.fill();
      }
      g.fillStyle = '#6E6A3A'; g.fillRect(0, 0, 5, h);
    });
    var crownMat = new THREE.MeshStandardMaterial({ map: leaf, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.7 });
    crownMat.onBeforeCompile = function (sh) {
      sh.uniforms.uTime = W.time;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aWave;\nuniform float uTime;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nfloat ph = instanceMatrix[3][0] * 0.13 + instanceMatrix[3][2] * 0.07;\ntransformed.y += sin(uTime * 1.7 + ph + aWave * 2.0) * 0.12 * aWave;\ntransformed.x += sin(uTime * 1.1 + ph * 1.3) * 0.18 * aWave * aWave;');
    };
    var crowns = new THREE.InstancedMesh(crownGeo, crownMat, list.length);
    crownM.forEach(function (m, n) { crowns.setMatrixAt(n, m); });
    crowns.castShadow = true; ctx.scene.add(crowns);
    // coconuts
    var nuts = [];
    tip.forEach(function (t, n) { for (var k = 0; k < 5; k++) { var a = k * 2.4 + n; nuts.push([t.x + Math.cos(a) * 0.24, t.y - 0.35 - (k % 2) * 0.2, t.z + Math.sin(a) * 0.24]); } });
    ctx.scene.add(ctx.instanced(new THREE.IcosahedronGeometry(0.14, 1), new THREE.MeshStandardMaterial({ color: '#5E6B2A', roughness: 0.6 }), nuts.length, function (n, d) { d.position.set(nuts[n][0], nuts[n][1], nuts[n][2]); d.scale.set(1, 1.12, 1); }));
    W.palms = list;
  }

  function dunesGrass(ctx, low) {
    var THREE = ctx.THREE, R = rng(55), spots = [];
    var tex = ctx.textures.canvas(128, 128, function (g, w, h) {
      g.clearRect(0, 0, w, h);
      for (var i = 0; i < 26; i++) {
        var x = w * (0.2 + R() * 0.6), lean = (R() - 0.5) * 50, hh = h * (0.45 + R() * 0.55);
        g.strokeStyle = R() > 0.3 ? 'rgb(' + (110 + R() * 40 | 0) + ',' + (130 + R() * 40 | 0) + ',60)' : 'rgb(190,170,110)';
        g.lineWidth = 2 + R() * 2; g.beginPath(); g.moveTo(x, h); g.quadraticCurveTo(x + lean * 0.3, h - hh * 0.6, x + lean, h - hh); g.stroke();
      }
    });
    var geo = merge(THREE, [new THREE.PlaneGeometry(1.3, 0.9).translate(0, 0.45, 0), new THREE.PlaneGeometry(1.3, 0.9).translate(0, 0.45, 0).rotateY(PI / 2)]);
    var target = low ? 380 : 900, guard = 0;
    while (spots.length < target && guard++ < 20000) {
      var x = -200 + R() * 400, z = -20 - R() * 110, s = shoreS(x, z);
      if (s < 36 || s > 130 || !ctx.track.clear(x, z, 2.6) || lagoonMask(x, z) > 0.2) continue;
      spots.push([x, W.terrainHeight(x, z) - 0.05, z, 0.6 + R() * 0.9, R() * TAU]);
    }
    var mat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9 });
    mat.onBeforeCompile = function (sh) {
      sh.uniforms.uTime = W.time;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.x += sin(uTime * 2.3 + instanceMatrix[3][0] * 0.4) * 0.08 * position.y;');
    };
    ctx.scene.add(ctx.instanced(geo, mat, spots.length, function (n, d) { var p = spots[n]; d.position.set(p[0], p[1], p[2]); d.scale.setScalar(p[3]); d.rotation.y = p[4]; }));
  }

  // the jungle on the hills: clumps of broadleaf canopy
  function hillTrees(ctx, low) {
    var THREE = ctx.THREE, R = rng(66), spots = [];
    var target = low ? 420 : 1100, guard = 0;
    while (spots.length < target && guard++ < 80000) {
      var x = -460 + R() * 920, z = -400 + R() * 440, s = shoreS(x, z), h = W.terrainHeight(x, z);
      if (s < 92 && Math.abs(x) < 188) continue;
      if (h < 3.5 || !ctx.track.clear(x, z, 8)) continue;
      spots.push([x, h, z, 2.6 + R() * 3.6]);
    }
    var blob = merge(THREE, [rockGeometry(THREE, 1, 1).scale(1, 0.85, 1).translate(0, 0.45, 0), rockGeometry(THREE, 5, 1).scale(0.75, 0.7, 0.75).translate(0.75, 0.8, 0.3), rockGeometry(THREE, 9, 1).scale(0.65, 0.6, 0.65).translate(-0.7, 0.7, -0.45), rockGeometry(THREE, 13, 1).scale(0.55, 0.5, 0.55).translate(0.1, 1.15, -0.6)]);
    var leafy = ctx.textures.canvas(256, 256, function (g, w, h) {
      g.fillStyle = '#9A9A9A'; g.fillRect(0, 0, w, h);
      var r = rng(71);
      for (var k = 0; k < 2400; k++) { var v = 90 + r() * 165 | 0, rad = 2 + r() * 7; g.fillStyle = 'rgba(' + v + ',' + v + ',' + v + ',0.7)'; g.beginPath(); g.ellipse(r() * w, r() * h, rad, rad * 0.6, r() * PI, 0, TAU); g.fill(); }
    });
    var leafyN = ctx.textures.normal(256, 256, function (g, w, h) {
      var r = rng(72);
      for (var k = 0; k < 1600; k++) { var v = r() * 255 | 0, rad = 2 + r() * 8; g.fillStyle = 'rgba(' + v + ',' + v + ',' + v + ',0.6)'; g.beginPath(); g.arc(r() * w, r() * h, rad, 0, TAU); g.fill(); }
    }, 4);
    leafy.repeat.set(3, 3); leafyN.repeat.set(3, 3);
    var mat = new THREE.MeshStandardMaterial({ color: '#FFFFFF', map: leafy, normalMap: leafyN, roughness: 0.95 });
    var m = ctx.instanced(blob, mat, spots.length, function (n, d) { var p = spots[n]; d.position.set(p[0], p[1] - 0.25 * p[3], p[2]); d.scale.set(p[3], p[3] * (0.8 + (n % 5) * 0.08), p[3]); d.rotation.y = n * 1.3; });
    var col = new THREE.Color(), greens = ['#2F5626', '#27491F', '#3A6429', '#224019', '#46703A', '#335A22'];
    for (var i = 0; i < spots.length; i++) { col.set(greens[i % greens.length]).offsetHSL((R() - 0.5) * 0.03, (R() - 0.5) * 0.08, (R() - 0.5) * 0.06); m.setColorAt(i, col); }
    m.receiveShadow = true;
    ctx.scene.add(m);
  }

  /* ------------------------------------------------------------- pier -- */
  function pier(ctx) {
    var THREE = ctx.THREE, X = 178, sLand = 26, sEnd = -86, deckY = 2.3;
    var z0 = shoreZ(X) - sLand, z1 = shoreZ(X) - sEnd, len = z1 - z0;
    var plankTex = ctx.textures.canvas(256, 512, function (g, w, h) {
      var r = rng(8);
      for (var y = 0; y < h; y += 16) { var v = 120 + r() * 50; g.fillStyle = 'rgb(' + (v | 0) + ',' + (v * 0.8 | 0) + ',' + (v * 0.6 | 0) + ')'; g.fillRect(0, y, w, 15); g.fillStyle = 'rgba(40,30,20,0.6)'; g.fillRect(0, y + 15, w, 1); }
    });
    plankTex.repeat.set(1, len / 6);
    var wood = new THREE.MeshStandardMaterial({ map: plankTex, roughness: 0.85 });
    var deck = new THREE.Mesh(new THREE.BoxGeometry(3, 0.22, len), wood); deck.position.set(X, deckY, (z0 + z1) / 2); deck.castShadow = true; deck.receiveShadow = true;
    var head = new THREE.Mesh(new THREE.BoxGeometry(14, 0.22, 7), wood); head.position.set(X, deckY, z1 + 3.5); head.castShadow = true;
    ctx.scene.add(deck, head);
    var piles = [];
    for (var z = z0 + 2; z < z1 + 7; z += 4) { piles.push([X - 1.4, z]); piles.push([X + 1.4, z]); }
    for (var x = -6; x <= 6; x += 3) { piles.push([X + x, z1 + 1]); piles.push([X + x, z1 + 6.5]); }
    ctx.scene.add(ctx.instanced(new THREE.CylinderGeometry(0.16, 0.18, 12, 8).translate(0, -6 + deckY, 0), new THREE.MeshStandardMaterial({ color: '#5C4632', roughness: 0.9 }), piles.length, function (n, d) { d.position.set(piles[n][0], 0, piles[n][1]); }));
    // lanterns on posts, lit for the evening
    var lamps = [];
    for (z = z0 + 8; z < z1; z += 16) lamps.push([X + 1.55, z]);
    lamps.push([X - 6.5, z1 + 6.5]); lamps.push([X + 6.5, z1 + 6.5]);
    ctx.scene.add(ctx.instanced(new THREE.BoxGeometry(0.14, 2.6, 0.14).translate(0, deckY + 1.3, 0), new THREE.MeshStandardMaterial({ color: '#D8D0C0', roughness: 0.8 }), lamps.length, function (n, d) { d.position.set(lamps[n][0], 0, lamps[n][1]); }));
    ctx.scene.add(ctx.instanced(new THREE.BoxGeometry(0.3, 0.42, 0.3).translate(0, deckY + 2.45, 0), new THREE.MeshStandardMaterial({ color: '#2A2A2A', emissive: '#FFB45E', emissiveIntensity: 3.5 }), lamps.length, function (n, d) { d.position.set(lamps[n][0], 0, lamps[n][1]); }));
    // a moored boat off the pier head
    var boat = hull(THREE, 7, 2.4, '#F2EEE6', '#1F6E8C'); boat.position.set(X + 9, 0.05, z1 + 2); boat.rotation.y = 0.1; ctx.scene.add(boat);
    W.bobbers = [{ o: boat, y: 0.05, ph: 0 }];
  }
  // a small open boat: a lathe hull cut in half
  function hull(THREE, len, beam, colTop, colHull) {
    var pts = [];
    for (var i = 0; i <= 10; i++) { var t = i / 10; pts.push(new THREE.Vector2(Math.sin(t * PI) * beam / 2 * (0.25 + 0.75 * Math.sin(t * PI)), (t - 0.5) * len)); }
    var g = new THREE.LatheGeometry(pts, 16, 0, PI); g.rotateZ(PI / 2); g.rotateY(PI / 2); g.rotateZ(PI);
    g.scale(1, 0.45, 1);
    var grp = new THREE.Group();
    var m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: colHull, roughness: 0.5, side: THREE.DoubleSide })); m.castShadow = true;
    var rim = new THREE.Mesh(new THREE.BoxGeometry(beam * 0.9, 0.08, len * 0.86), new THREE.MeshStandardMaterial({ color: colTop, roughness: 0.6 })); rim.position.y = 0.02;
    grp.add(m, rim);
    return grp;
  }

  /* ----------------------------------------------------------- shacks -- */
  function shacks(ctx) {
    var THREE = ctx.THREE, R = rng(19);
    var planks = ctx.textures.canvas(256, 256, function (g, w, h) {
      for (var x = 0; x < w; x += 22) { var v = 0.75 + R() * 0.3; g.fillStyle = 'rgb(' + (235 * v | 0) + ',' + (230 * v | 0) + ',' + (220 * v | 0) + ')'; g.fillRect(x, 0, 21, h); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x + 21, 0, 1, h); }
    });
    var tin = ctx.textures.canvas(128, 128, function (g, w, h) {
      for (var x = 0; x < w; x += 8) { var gr = g.createLinearGradient(x, 0, x + 8, 0); gr.addColorStop(0, '#8E8A82'); gr.addColorStop(0.5, '#C4BEB2'); gr.addColorStop(1, '#7A766E'); g.fillStyle = gr; g.fillRect(x, 0, 8, h); }
      g.fillStyle = 'rgba(140,80,40,0.35)'; for (var i = 0; i < 40; i++) g.fillRect(R() * w, R() * h, 6 + R() * 18, 3 + R() * 10);
    });
    var wallMat = new THREE.MeshStandardMaterial({ map: planks, vertexColors: true, roughness: 0.85 });
    var roofMat = new THREE.MeshStandardMaterial({ map: tin, metalness: 0.45, roughness: 0.55 });
    var walls = [], roofs = [], dark = [];
    var colours = ['#E9D8B8', '#9FC7C9', '#F2B8A0', '#C9D98E', '#F1E29A', '#B8C6E6', '#E8C2D6'];
    var spots = [[-150, -92], [-112, -96], [-74, -90], [46, -94], [84, -90], [118, -96], [150, -84], [-40, -104], [8, -100]];
    spots.forEach(function (p, i) {
      var x = p[0] + (R() - 0.5) * 6, z = p[1] + (R() - 0.5) * 6;
      if (!ctx.track.clear(x, z, 6)) return;
      var y = W.terrainHeight(x, z), w = 4.5 + R() * 2.5, dpt = 3.8 + R() * 1.6, hgt = 2.8 + R() * 0.6, yaw = (R() - 0.5) * 0.4;
      var box = new THREE.BoxGeometry(w, hgt, dpt).translate(0, hgt / 2, 0);
      box.rotateY(yaw); box.translate(x, y - 0.2, z);
      walls.push(vc(THREE, box, colours[i % colours.length]));
      // a gable of corrugated iron
      var roof = new THREE.CylinderGeometry(0.01, (w + 1.2) / Math.SQRT2, 1.6, 4, 1, false, PI / 4);
      roof.scale(1, 1, (dpt + 1.2) / (w + 1.2)); roof.rotateY(yaw); roof.translate(x, y - 0.2 + hgt + 0.8, z);
      roofs.push(roof.index ? roof.toNonIndexed() : roof);
      // a dark doorway facing the beach
      var door = new THREE.PlaneGeometry(1.1, 2).translate(0, 1, dpt / 2 + 0.02); door.rotateY(yaw); door.translate(x, y - 0.2, z);
      dark.push(door);
    });
    if (walls.length) {
      var wm = new THREE.Mesh(merge(THREE, walls), wallMat); wm.castShadow = true; wm.receiveShadow = true; ctx.scene.add(wm);
      var rm = new THREE.Mesh(merge(THREE, roofs.map(function (g) { g.deleteAttribute && g.deleteAttribute('normal'); g.computeVertexNormals(); return g; })), roofMat); rm.castShadow = true; ctx.scene.add(rm);
      ctx.scene.add(new THREE.Mesh(merge(THREE, dark), new THREE.MeshStandardMaterial({ color: '#2A211A', roughness: 0.9 })));
    }
  }

  /* ------------------------------------------------------- beach life -- */
  function beachLife(ctx, low) {
    var THREE = ctx.THREE, R = rng(23), scene = ctx.scene;
    // umbrellas and loungers between the legs
    var stripe = ctx.textures.canvas(256, 32, function (g, w, h) { var cs = ['#FF6B3D', '#FFF4E4']; for (var i = 0; i < 8; i++) { g.fillStyle = cs[i % 2]; g.fillRect(i * w / 8, 0, w / 8, h); } });
    var umb = [], lounge = [];
    for (var i = 0; i < 14; i++) {
      var x = -70 + i * 11 + (R() - 0.5) * 5, s = 24 + R() * 12, z = shoreZ(x) - s;
      if (!ctx.track.clear(x, z, 4)) continue;
      umb.push([x, W.terrainHeight(x, z), z, R() * 0.2 - 0.1, R() * TAU]);
      lounge.push([x + 1.4, W.terrainHeight(x + 1.4, z + 1.2), z + 1.2, -0.3 + R() * 0.3]);
    }
    var canopy = new THREE.ConeGeometry(1.35, 0.55, 16, 1, true).translate(0, 2.25, 0);
    scene.add(ctx.instanced(canopy, new THREE.MeshStandardMaterial({ map: stripe, side: THREE.DoubleSide, roughness: 0.7 }), umb.length, function (n, d) { var p = umb[n]; d.position.set(p[0], p[1], p[2]); d.rotation.set(p[3], p[4], 0); }));
    scene.add(ctx.instanced(new THREE.CylinderGeometry(0.03, 0.03, 2.4, 6).translate(0, 1.2, 0), new THREE.MeshStandardMaterial({ color: '#EDE8DD', roughness: 0.5 }), umb.length, function (n, d) { var p = umb[n]; d.position.set(p[0], p[1] - 0.15, p[2]); d.rotation.set(p[3], 0, 0); }));
    var lng = merge(THREE, [vc(THREE, new THREE.BoxGeometry(0.62, 0.06, 1.3).translate(0, 0.32, 0.1), '#F4F1EA'), vc(THREE, new THREE.BoxGeometry(0.62, 0.06, 0.7).rotateX(-0.9).translate(0, 0.55, -0.75), '#F4F1EA'), vc(THREE, new THREE.BoxGeometry(0.56, 0.3, 0.05).translate(0, 0.15, 0.6), '#B9B2A4'), vc(THREE, new THREE.BoxGeometry(0.56, 0.3, 0.05).translate(0, 0.15, -0.4), '#B9B2A4')]);
    scene.add(ctx.instanced(lng, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }), lounge.length, function (n, d) { var p = lounge[n]; d.position.set(p[0], p[1], p[2]); d.rotation.y = p[3]; }));
    // upturned boats on the sand, as in Tidewater's beach
    [[18, 26, 0.5, '#2F6E5E'], [26, 29, 0.2, '#6E3A2E'], [-96, 30, -0.4, '#2E4E7A']].forEach(function (b) {
      var z = shoreZ(b[0]) - b[1]; if (!ctx.track.clear(b[0], z, 4)) return;
      var o = hull(THREE, 4.6, 1.5, '#D8CCB4', b[3]); o.rotation.set(PI, b[2], 0); o.position.set(b[0], W.terrainHeight(b[0], z) + 0.33, z); scene.add(o);
    });
    // the lifeguard tower
    (function () {
      var x = -60, z = shoreZ(x) - 30; if (!ctx.track.clear(x, z, 5)) return;
      var y = W.terrainHeight(x, z), g = new THREE.Group(), wood = new THREE.MeshStandardMaterial({ color: '#E8E0D0', roughness: 0.7 });
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (c) { var leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.6, 0.14), wood); leg.position.set(c[0] * 1.1, 1.3, c[1] * 1.1); g.add(leg); });
      var hut = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.6, 2.4), new THREE.MeshStandardMaterial({ color: '#D93A2B', roughness: 0.6 })); hut.position.y = 3.4; hut.castShadow = true;
      var roof = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.14, 2.8), new THREE.MeshStandardMaterial({ color: '#F4C542', roughness: 0.6 })); roof.position.y = 4.3;
      var ramp = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06, 3.6), wood); ramp.position.set(0, 1.4, 2.6); ramp.rotation.x = 0.72;
      var flag = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.5), new THREE.MeshStandardMaterial({ color: '#F4C542', side: THREE.DoubleSide })); flag.position.set(1.2, 5.6, 0);
      var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2, 6), wood); pole.position.set(0.8, 5.2, 0);
      g.add(hut, roof, ramp, flag, pole); g.position.set(x, y, z); g.rotation.y = PI + 0.15; scene.add(g);
      W.guardFlag = flag;
    })();
    // a volleyball net
    (function () {
      var x = -100, z = shoreZ(x) - 36; if (!ctx.track.clear(x, z, 8)) return;
      var y = W.terrainHeight(x, z), g = new THREE.Group(), post = new THREE.MeshStandardMaterial({ color: '#D8D2C4', roughness: 0.5 });
      [-4.6, 4.6].forEach(function (px) { var p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 6), post); p.position.set(px, 1.3, 0); g.add(p); });
      var netTex = ctx.textures.canvas(256, 64, function (gc, w, h) { gc.clearRect(0, 0, w, h); gc.strokeStyle = '#1A1A1A'; gc.lineWidth = 1.5; for (var a = 0; a < w; a += 8) { gc.beginPath(); gc.moveTo(a, 0); gc.lineTo(a, h); gc.stroke(); } for (var b = 0; b < h; b += 8) { gc.beginPath(); gc.moveTo(0, b); gc.lineTo(w, b); gc.stroke(); } gc.fillStyle = '#F4F4F4'; gc.fillRect(0, 0, w, 6); });
      var net = new THREE.Mesh(new THREE.PlaneGeometry(9.2, 1), new THREE.MeshStandardMaterial({ map: netTex, alphaTest: 0.3, side: THREE.DoubleSide })); net.position.y = 2.1; g.add(net);
      g.position.set(x, y, z); g.rotation.y = 0.2; scene.add(g);
    })();
    // buoys on the swell and a yacht far out
    var buoys = [];
    for (i = 0; i < 6; i++) { var bx = -150 + i * 60 + (R() - 0.5) * 20, bz = shoreZ(bx) + 70 + R() * 40; var b = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 8), new THREE.MeshStandardMaterial({ color: i % 2 ? '#FF6B3D' : '#F4C542', roughness: 0.4 })); b.position.set(bx, 0, bz); scene.add(b); buoys.push({ o: b, y: 0, ph: R() * TAU }); }
    W.bobbers = (W.bobbers || []).concat(buoys);
    var yacht = new THREE.Group(), yh = hull(THREE, 9, 2.6, '#EFEFEF', '#FFFFFF');
    var sail = new THREE.Mesh(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 1, -2.5), new THREE.Vector3(0, 11, -0.5), new THREE.Vector3(0, 1, 2.5)]), new THREE.MeshStandardMaterial({ color: '#FBF7EE', side: THREE.DoubleSide, roughness: 0.6 }));
    sail.geometry.computeVertexNormals(); yacht.add(yh, sail); yacht.position.set(-320, 0.1, 420); yacht.rotation.y = 1.2; scene.add(yacht);
    W.bobbers.push({ o: yacht, y: 0.1, ph: 1 });
    // gulls wheeling over the surf
    var gull = new THREE.BufferGeometry();
    gull.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.35, -0.12, 0, -0.3, 0.12, 0, -0.3, 0, 0, 0.1, -0.9, 0.05, -0.1, 0, 0, -0.15, 0, 0, 0.1, 0.9, 0.05, -0.1, 0, 0, -0.15], 3));
    gull.setAttribute('aWing', new THREE.Float32BufferAttribute([0, 0, 0, 0, 1, 0, 0, 1, 0], 1));
    gull.computeVertexNormals();
    var gmat = new THREE.MeshStandardMaterial({ color: '#F4F4F2', side: THREE.DoubleSide, roughness: 0.8 });
    gmat.onBeforeCompile = function (sh) {
      sh.uniforms.uTime = W.time;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aWing;\nuniform float uTime;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.y += aWing * sin(uTime * 9.0 + float(gl_InstanceID) * 1.7) * 0.45;');
    };
    var nG = low ? 7 : 14;
    W.gulls = ctx.instanced(gull, gmat, nG, function () {});
    W.gullSeeds = []; for (i = 0; i < nG; i++) W.gullSeeds.push({ cx: -160 + R() * 320, cz: 10 + R() * 60, r: 12 + R() * 30, h: 9 + R() * 14, w: (0.25 + R() * 0.3) * (R() < 0.5 ? -1 : 1), ph: R() * TAU });
    W.gulls.frustumCulled = false; scene.add(W.gulls);
    // small crabs scuttling on the wet sand
    var crabG = merge(THREE, [vc(THREE, new THREE.SphereGeometry(0.1, 8, 6).scale(1.3, 0.45, 1), '#C8553A'), vc(THREE, new THREE.BoxGeometry(0.34, 0.02, 0.03).translate(0, 0.01, 0.03), '#A8452E'), vc(THREE, new THREE.BoxGeometry(0.34, 0.02, 0.03).translate(0, 0.01, -0.04), '#A8452E')]);
    var nC = low ? 8 : 18;
    W.crabs = ctx.instanced(crabG, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 }), nC, function () {});
    W.crabSeeds = []; for (i = 0; i < nC; i++) { var cx = -150 + R() * 300; W.crabSeeds.push({ x: cx, s: 1 + R() * 6, ph: R() * TAU, sp: 0.5 + R() * 0.8 }); }
    W.crabs.frustumCulled = false; scene.add(W.crabs);
    // shells and pebbles
    var shells = [], guard = 0;
    while (shells.length < (low ? 200 : 520) && guard++ < 5000) { var sx = -180 + R() * 360, ss = -1 + R() * 34, sz = shoreZ(sx) - ss; shells.push([sx, W.terrainHeight(sx, sz), sz, 0.03 + R() * 0.06, R() * TAU]); }
    var sm = ctx.instanced(new THREE.IcosahedronGeometry(1, 0).scale(1, 0.4, 0.8), new THREE.MeshStandardMaterial({ color: '#E8DCCB', roughness: 0.5 }), shells.length, function (n, d) { var p = shells[n]; d.position.set(p[0], p[1], p[2]); d.scale.setScalar(p[3]); d.rotation.y = p[4]; });
    var cc = new THREE.Color();
    for (i = 0; i < shells.length; i++) { cc.set(['#EFE3D2', '#D9A48A', '#B7AFA4', '#F4EEE4', '#8D8378'][i % 5]); sm.setColorAt(i, cc); }
    scene.add(sm);
  }

  // the course: pennants on low posts along both edges, off the boardwalk
  function courseFlags(ctx) {
    var THREE = ctx.THREE, L = ctx.track.length, span = boardSpan(ctx), spots = [];
    for (var d = 8; d < L - 4; d += 11) {
      if (span && d > span.d0 - 4 && d < span.d1 + 4) continue;
      [-1, 1].forEach(function (side) {
        var F = ctx.track.frameAt(d), p = F.pos.clone().addScaledVector(F.right, side * (HW + 0.45));
        spots.push([p.x, p.y, p.z, Math.atan2(F.tan.x, F.tan.z), (d / 11 | 0) % 2]);
      });
    }
    var poles = ctx.instanced(new THREE.CylinderGeometry(0.018, 0.022, 0.78, 5).translate(0, 0.39, 0), new THREE.MeshStandardMaterial({ color: '#F4F1EA', roughness: 0.5 }), spots.length, function (n, d) { var p = spots[n]; d.position.set(p[0], p[1] - 0.05, p[2]); });
    var tri = new THREE.BufferGeometry(); tri.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.74, 0, 0, 0.5, 0, 0, 0.62, -0.42], 3)); tri.computeVertexNormals();
    var fm = new THREE.MeshStandardMaterial({ color: '#FFFFFF', side: THREE.DoubleSide, roughness: 0.6 });
    fm.onBeforeCompile = function (sh) {
      sh.uniforms.uTime = W.time;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.x += sin(uTime * 7.0 + instanceMatrix[3][0] * 0.5) * 0.08 * (-position.z);');
    };
    var flags = ctx.instanced(tri, fm, spots.length, function (n, d) { var p = spots[n]; d.position.set(p[0], p[1] - 0.05, p[2]); d.rotation.y = p[3] + PI; });
    var cc = new THREE.Color();
    for (var i = 0; i < spots.length; i++) { flags.setColorAt(i, cc.set(spots[i][4] ? '#FF6B3D' : '#F4C542')); }
    ctx.scene.add(poles, flags);
  }

  // An inflatable arch over the start line. The runtime hides anything under
  // 7 m within the corridor, so it is two pieces: straight posts outside the
  // corridor, and a top (rounded corners, the beam, the banner) that clears it.
  function startArch(ctx) {
    var THREE = ctx.THREE, F = ctx.track.frameAt(0), X = HW + 2.3, TOP = 8.3, RC = 0.8, R0 = 0.48;
    var mat = new THREE.MeshStandardMaterial({ color: '#FF6B3D', roughness: 0.45 });
    var g = new THREE.Group();
    [-1, 1].forEach(function (sd) {
      var post = new THREE.Mesh(new THREE.CylinderGeometry(R0, R0 * 1.1, TOP - RC, 12).translate(sd * X, (TOP - RC) / 2, 0), mat);
      post.castShadow = true; g.add(post);
    });
    var pts = [];
    for (var i = 0; i <= 8; i++) { var a = i / 8 * PI / 2; pts.push(new THREE.Vector3(-X + RC - Math.cos(a) * RC, TOP - RC + Math.sin(a) * RC, 0)); }
    for (i = 0; i <= 8; i++) { a = PI / 2 - i / 8 * PI / 2; pts.push(new THREE.Vector3(X - RC + Math.cos(a) * RC, TOP - RC + Math.sin(a) * RC, 0)); }
    var top = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.1), 64, R0, 12, false), mat);
    top.castShadow = true;
    var banner = ctx.textures.canvas(512, 128, function (gc, w, h) {
      gc.fillStyle = '#FF6B3D'; gc.fillRect(0, 0, w, h);
      gc.fillStyle = '#FFF8EC'; gc.font = '800 78px "Barlow Condensed", "Arial Narrow", Arial, sans-serif'; gc.textAlign = 'center'; gc.textBaseline = 'middle'; gc.fillText('TIDELINE', w / 2, h / 2 + 4);
    });
    // a face on each side, each reading the right way round, their feet above 7 m
    var bannerMat = new THREE.MeshStandardMaterial({ map: banner, roughness: 0.6 });
    [-1, 1].forEach(function (sd) {
      var board = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 1.3), bannerMat);
      board.position.set(0, TOP - 0.55, sd * 0.52); if (sd < 0) board.rotation.y = PI;
      top.add(board);
    });
    g.add(top);
    g.position.copy(F.pos);
    g.lookAt(F.pos.x + F.tan.x, F.pos.y, F.pos.z + F.tan.z);
    ctx.scene.add(g);
  }

  /* -------------------------------------------------------- obstacles -- */
  function obstacles(ctx) {
    var THREE = ctx.THREE, L = ctx.track.length, span = boardSpan(ctx), out = [];
    var M = {
      wood: new THREE.MeshStandardMaterial({ color: '#9C8A72', roughness: 0.95 }),
      bleached: new THREE.MeshStandardMaterial({ color: '#C8BBA4', roughness: 0.95 }),
      sand: new THREE.MeshStandardMaterial({ color: '#D9C198', roughness: 1 }),
      crate: new THREE.MeshStandardMaterial({ color: '#A57F55', roughness: 0.85 }),
      rope: new THREE.MeshStandardMaterial({ color: '#C9B28A', roughness: 0.9 }),
      dark: new THREE.MeshStandardMaterial({ color: '#2B2B2E', roughness: 0.7 }),
    };
    function add(o, m) { m.castShadow = true; m.receiveShadow = true; o.add(m); return m; }
    function log(len) {
      var o = new THREE.Group(), g = new THREE.CylinderGeometry(0.2, 0.26, len, 9, 4); g.rotateZ(PI / 2);
      var p = g.attributes.position; for (var i = 0; i < p.count; i++) { var x = p.getX(i); p.setY(i, p.getY(i) + Math.sin(x * 1.3) * 0.05); } g.computeVertexNormals();
      add(o, new THREE.Mesh(g, M.bleached)).position.y = 0.24;
      var br = new THREE.CylinderGeometry(0.05, 0.09, 0.9, 6); br.rotateZ(0.9); var b = add(o, new THREE.Mesh(br, M.bleached)); b.position.set(len * 0.25, 0.55, 0.05);
      return o;
    }
    function castle() {
      var o = new THREE.Group();
      add(o, new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.72, 0.36, 12), M.sand)).position.y = 0.18;
      add(o, new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.44, 0.34, 10), M.sand)).position.y = 0.53;
      for (var i = 0; i < 4; i++) { var a = i / 4 * TAU, t = add(o, new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.62, 8), M.sand)); t.position.set(Math.cos(a) * 0.52, 0.5, Math.sin(a) * 0.52); }
      var f = add(o, new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.14), new THREE.MeshStandardMaterial({ color: '#FF6B3D', side: THREE.DoubleSide }))); f.position.set(0.11, 1.02, 0);
      add(o, new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.36, 4), M.dark)).position.y = 0.9;
      return o;
    }
    function cooler(col) {
      var o = new THREE.Group();
      add(o, new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.42, 0.48), new THREE.MeshStandardMaterial({ color: col, roughness: 0.45 }))).position.y = 0.21;
      add(o, new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.1, 0.52), new THREE.MeshStandardMaterial({ color: '#F4F4F2', roughness: 0.45 }))).position.y = 0.47;
      return o;
    }
    function kayak(col) {
      var o = new THREE.Group(), g = new THREE.SphereGeometry(1, 16, 8); g.scale(0.36, 0.2, 1.7);
      add(o, new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: col, roughness: 0.35 }))).position.y = 0.18;
      return o;
    }
    function ball() {
      var o = new THREE.Group(), tex = ctx.textures.canvas(256, 128, function (g, w, h) { var cs = ['#FF6B3D', '#FFFFFF', '#2F7FD8', '#FFFFFF', '#F4C542', '#FFFFFF']; for (var i = 0; i < 6; i++) { g.fillStyle = cs[i]; g.fillRect(i * w / 6, 0, w / 6 + 1, h); } });
      var b = add(o, new THREE.Mesh(new THREE.SphereGeometry(0.42, 20, 14), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.3 }))); b.position.y = 0.42;
      return { o: o, b: b };
    }
    function crate() { var o = new THREE.Group(); add(o, new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.62, 0.75), M.crate)).position.y = 0.31; add(o, new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.45, 0.55), M.crate)).position.set(0.05, 0.85, -0.02); return o; }
    function pot() {
      var o = new THREE.Group(), frame = new THREE.MeshStandardMaterial({ color: '#3F5A4E', roughness: 0.6, wireframe: false });
      var g = new THREE.CylinderGeometry(0.45, 0.45, 0.9, 10, 1, true, 0, PI); g.rotateZ(PI / 2);
      add(o, new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: '#4F6B5C', roughness: 0.7, side: THREE.DoubleSide }))).position.y = 0;
      add(o, new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, 0.9), frame)).position.y = 0.02;
      var buoy = add(o, new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshStandardMaterial({ color: '#FF6B3D', roughness: 0.4 }))); buoy.position.set(0.35, 0.55, 0.25);
      return o;
    }
    function barrel() { var o = new THREE.Group(); add(o, new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.3, 0.9, 12), new THREE.MeshStandardMaterial({ color: '#2F6E8C', roughness: 0.5 }))).position.y = 0.45; return o; }
    function coconuts() { var o = new THREE.Group(); for (var i = 0; i < 9; i++) { var a = i * 2.4, r = i < 6 ? 0.34 : 0.14; add(o, new THREE.Mesh(new THREE.IcosahedronGeometry(0.17, 1), new THREE.MeshStandardMaterial({ color: i % 3 ? '#6B4F2E' : '#5E6B2A', roughness: 0.7 }))).position.set(Math.cos(a) * r, i < 6 ? 0.16 : 0.42, Math.sin(a) * r); } return o; }
    function barrow() {
      var o = new THREE.Group(), g = new THREE.BoxGeometry(0.7, 0.36, 1.0);
      add(o, new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: '#3E7F6A', roughness: 0.5 }))).position.y = 0.5;
      add(o, new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.05, 6, 12), M.dark)).position.set(0, 0.2, 0.5);
      for (var i = 0; i < 5; i++) add(o, new THREE.Mesh(new THREE.IcosahedronGeometry(0.15, 1), new THREE.MeshStandardMaterial({ color: '#6B4F2E', roughness: 0.7 }))).position.set((i - 2) * 0.13, 0.78, (i % 2) * 0.2 - 0.1);
      return o;
    }
    function chair() {
      var o = new THREE.Group(), cloth = new THREE.MeshStandardMaterial({ color: '#2F7FD8', roughness: 0.7, side: THREE.DoubleSide });
      add(o, new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.05, 0.55), cloth)).position.set(0, 0.32, 0);
      var back = add(o, new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.62, 0.05), cloth)); back.position.set(0, 0.6, -0.3); back.rotation.x = -0.35;
      [[-0.3, 0.25], [0.3, 0.25], [-0.3, -0.28], [0.3, -0.28]].forEach(function (c) { add(o, new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.36, 4), M.dark)).position.set(c[0], 0.16, c[1]); });
      return o;
    }
    function buoyStand() {
      var o = new THREE.Group();
      add(o, new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.2, 0.12), new THREE.MeshStandardMaterial({ color: '#E8E0D0', roughness: 0.7 }))).position.y = 0.6;
      var ring = add(o, new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.09, 8, 18), new THREE.MeshStandardMaterial({ color: '#FF6B3D', roughness: 0.5 }))); ring.position.set(0, 0.85, 0.08);
      return o;
    }
    function fronds() { var o = new THREE.Group(); for (var i = 0; i < 5; i++) { var f = add(o, new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 1.9), new THREE.MeshStandardMaterial({ color: i % 2 ? '#8C7A3E' : '#6F7E36', roughness: 0.9 }))); f.position.set((i - 2) * 0.16, 0.08 + (i % 3) * 0.08, 0); f.rotation.y = (i - 2) * 0.35; f.rotation.z = (i - 2) * 0.1; } return o; }

    var at = function (d) { return d / L; };
    function put(d, x, o, extra) { var e = { at: at(d), x: x, object: o }; if (extra) Object.assign(e, extra); out.push(e); }
    // the beach leg: driftwood, sandcastles, coolers, kayaks, a ball in the wind
    put(56, 2.4, log(2.6)); put(80, -2.2, castle());
    var b1 = ball(); put(104, 0, b1.o, { move: { amplitude: 2.1, period: 3.6 }, animate: function (t) { b1.b.rotation.z = Math.cos(t * TAU / 3.6) * 2; b1.b.rotation.x = t * 1.2; } });
    put(128, 1.9, kayak('#F4C542')); put(150, -2.6, cooler('#2F7FD8'));
    // a log rolling in and out with the swash
    var sl = log(2.2); put(172, 0.6, sl, { move: { amplitude: 2.6, period: WAVE_T / 2 }, animate: function (t) { sl.rotation.x = Math.sin(t * TAU / (WAVE_T / 2)) * 1.4; } });
    put(196, -1.6, castle()); put(196, 3.3, cooler('#FF6B3D'));
    // the east end
    put(226, -1.5, chair()); put(252, 2.0, buoyStand());
    var b2 = ball(); put(276, 0, b2.o, { move: { amplitude: 2.2, period: 4.2 }, animate: function (t) { b2.b.rotation.z = Math.cos(t * TAU / 4.2) * 2; b2.b.rotation.x = t; } });
    put(300, -2.4, coconuts());
    // the back leg, and the boardwalk
    var d = 324, side = 1;
    var bw = span ? [span.d0 + 8, span.d1 - 8] : [-1, -1];
    for (; d < L - 120; d += 20) {
      var onBoard = d > bw[0] && d < bw[1];
      var o = onBoard ? [crate, pot, barrel, pot][(d / 20 | 0) % 4]() : [barrow, fronds, coconuts][(d / 20 | 0) % 3]();
      put(d, side * (1.3 + ((d * 7) % 13) / 13 * 1.4), o);
      side = -side;
    }
    // the west end, back down to the sea
    put(L - 96, 1.5, log(2.4)); put(L - 74, -2.0, chair()); put(L - 52, 2.4, cooler('#1E9E4A')); put(L - 30, -1.4, castle());
    return out;
  }

  /* ---------------------------------------------------------- athletes -- */
  var PATTERN = { band: 'band', sash: 'sash', checker: 'checker', split: 'split', stripes: 'stripes', yoke: 'yoke', plain: 'plain' };
  function skinKey(hex, female) {
    var n = parseInt(hex.slice(1), 16), l = (((n >> 16) & 255) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11) / 255;
    if (l < 0.45) return { key: 'african', tint: l < 0.22 ? '#D8D2CE' : '#FFFFFF' };
    if (hex === '#E0B48E') return { key: 'asian', tint: '#FFFFFF' };
    if (l < 0.62) return { key: female ? 'caucasian' : 'caucasian2', tint: '#C49A7C' };
    return { key: 'caucasian', tint: '#F4E6DC' };
  }
  function libraryAthlete(ctx, kit, k) {
    var id = kit.gender === 'female' ? 'human-athlete-female' : 'human-athlete-male';
    if (!ctx.assets || !ctx.assets.ready(id)) return null;
    var tone = skinKey(kit.skin, kit.gender === 'female');
    var r = ctx.assets.human(id, {
      skin: tone.key, skinTint: tone.tint, hair: kit.style, hairColor: kit.hair, eyes: tone.key === 'african' ? 'brown' : 'brownlight', height: kit.height,
      build: { muscle: clamp(0.5 + (kit.build - 0.96) * 2.4 + Math.min(k, 12) * 0.02, 0, 1), lean: clamp(0.55 - (kit.build - 0.96) * 1.4, 0, 1) },
      outfit: { top: kit.top, trim: kit.trim, shorts: kit.shorts, shoes: kit.shoe, pattern: PATTERN[kit.pattern] || 'plain', bib: kit.top ? { name: kit.name, number: kit.number } : undefined, glow: k >= 9 ? 2.4 : 0 },
      name: k === 0 ? PLAYER.label : kit.label, color: kit.top || kit.shorts,
    });
    return r || null;
  }
  // if the library cannot load: a simple runner of capsules, arms and legs swinging
  function fallbackRunner(ctx, kit, k) {
    var THREE = ctx.THREE, o = new THREE.Group();
    var skin = new THREE.MeshStandardMaterial({ color: kit.skin, roughness: 0.6 }), top = new THREE.MeshStandardMaterial({ color: kit.top || kit.skin, roughness: 0.6 }), shorts = new THREE.MeshStandardMaterial({ color: kit.shorts, roughness: 0.7 });
    var s = kit.height / 1.8;
    var torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.18 * s, 0.5 * s, 4, 10), top); torso.position.y = 1.25 * s;
    var head = new THREE.Mesh(new THREE.SphereGeometry(0.12 * s, 12, 10), skin); head.position.y = 1.68 * s;
    var hip = new THREE.Mesh(new THREE.CapsuleGeometry(0.17 * s, 0.1 * s, 4, 10), shorts); hip.position.y = 0.92 * s;
    o.add(torso, head, hip);
    function limb(mat, len, x, y) { var p = new THREE.Group(); p.position.set(x, y, 0); var m = new THREE.Mesh(new THREE.CapsuleGeometry(0.06 * s, len, 4, 8), mat); m.position.y = -len / 2 - 0.04; p.add(m); o.add(p); return p; }
    var legs = [limb(skin, 0.72 * s, -0.1 * s, 0.9 * s), limb(skin, 0.72 * s, 0.1 * s, 0.9 * s)], arms = [limb(skin, 0.5 * s, -0.24 * s, 1.5 * s), limb(skin, 0.5 * s, 0.24 * s, 1.5 * s)];
    o.traverse(function (m) { if (m.isMesh) m.castShadow = true; });
    var ph = 0;
    return {
      object: o, name: k === 0 ? PLAYER.label : kit.label, color: kit.top || kit.shorts,
      animate: function (t, dt, st) {
        ph += dt * (st.speed || 0) * 1.25;
        var a = Math.sin(ph) * Math.min((st.speed || 0) / 6, 1) * 0.9;
        legs[0].rotation.x = a; legs[1].rotation.x = -a; arms[0].rotation.x = -a * 0.8; arms[1].rotation.x = a * 0.8;
        o.position.y = Math.abs(Math.sin(ph)) * 0.06; o.rotation.z = -(st.lateral || 0) * 0.03;
      },
    };
  }

  /* ----------------------------------------------------------- update -- */
  var TMPM = null, TMPO = null;
  function update(ctx, t, dt) {
    W.time.value = t;
    if (W.seaRipples) { W.seaRipples.offset.x = t * 0.012; W.seaRipples.offset.y = -t * 0.02; }
    var THREE = ctx.THREE;
    if (!TMPO) { TMPO = new THREE.Object3D(); }
    // boats and buoys ride the swell
    (W.bobbers || []).forEach(function (b) { b.o.position.y = b.y + Math.sin(t * 1.1 + b.ph) * 0.18; b.o.rotation.z = Math.sin(t * 0.9 + b.ph) * 0.05; b.o.rotation.x = Math.sin(t * 0.7 + b.ph * 2) * 0.03; });
    if (W.guardFlag) W.guardFlag.rotation.y = Math.sin(t * 3.1) * 0.35;
    if (W.gulls) {
      W.gullSeeds.forEach(function (g, i) {
        var a = g.ph + t * g.w;
        TMPO.position.set(g.cx + Math.cos(a) * g.r, g.h + Math.sin(t * 0.4 + g.ph) * 2, g.cz + Math.sin(a) * g.r);
        TMPO.rotation.set(0, -a - (g.w > 0 ? 0 : PI), (g.w > 0 ? 1 : -1) * 0.3);
        TMPO.scale.setScalar(1); TMPO.updateMatrix(); W.gulls.setMatrixAt(i, TMPO.matrix);
      });
      W.gulls.instanceMatrix.needsUpdate = true;
    }
    if (W.crabs && W.terrainHeight) {
      W.crabSeeds.forEach(function (c, i) {
        var x = c.x + Math.sin(t * c.sp + c.ph) * 1.6, z = shoreZ(x) - c.s - Math.sin(t * c.sp * 0.7 + c.ph) * 0.6;
        TMPO.position.set(x, W.terrainHeight(x, z) + 0.03, z); TMPO.rotation.set(0, c.ph, 0); TMPO.scale.setScalar(1);
        TMPO.updateMatrix(); W.crabs.setMatrixAt(i, TMPO.matrix);
      });
      W.crabs.instanceMatrix.needsUpdate = true;
    }
    surfSound(ctx, t);
  }

  /* ---------------------------------------------------------- ambient -- */
  // The surf, synthesised: a low roar when a wave breaks, a hiss as the swash
  // runs up the sand, timed to the same waves the sea draws. Wind, and gulls.
  function ambient(ctx) {
    var ac = ctx.audio.context, out = ctx.audio.destination;
    function noiseBuf(seconds, brown) {
      var n = Math.floor(ac.sampleRate * seconds), b = ac.createBuffer(1, n, ac.sampleRate), d = b.getChannelData(0), last = 0;
      for (var i = 0; i < n; i++) { var w = Math.random() * 2 - 1; if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w; }
      return b;
    }
    function loop(buf) { var s = ac.createBufferSource(); s.buffer = buf; s.loop = true; s.start(); return s; }
    var roar = loop(noiseBuf(5, true)), lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520;
    var gRoar = ac.createGain(); gRoar.gain.value = 0; roar.connect(lp); lp.connect(gRoar); gRoar.connect(out);
    var hiss = loop(noiseBuf(3, false)), bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2600; bp.Q.value = 0.5;
    var gHiss = ac.createGain(); gHiss.gain.value = 0; hiss.connect(bp); bp.connect(gHiss); gHiss.connect(out);
    var wind = loop(noiseBuf(4, true)), wl = ac.createBiquadFilter(); wl.type = 'lowpass'; wl.frequency.value = 280;
    var gWind = ac.createGain(); gWind.gain.value = 0.05; wind.connect(wl); wl.connect(gWind); gWind.connect(out);
    W.audio = { ac: ac, out: out, roar: gRoar, hiss: gHiss, wind: gWind, nextGull: 4 };
  }
  function surfSound(ctx, t) {
    var A = W.audio; if (!A) return;
    var cam = ctx.camera.position, s = shoreS(cam.x, cam.z), near = 1 / (1 + Math.max(s, 0) / 22);
    // the breaker line sits about 18 m offshore: the roar peaks as each crest arrives there
    var phB = (t + travelJS(18)) / WAVE_T + cam.x * 0.0015, uB = phB - Math.floor(phB);
    var phS = t / WAVE_T + cam.x * 0.0015, uS = phS - Math.floor(phS);
    var roar = 0.1 + 0.34 * Math.exp(-uB * 5.5), hiss = uS < 0.45 ? Math.sin(uS / 0.45 * PI) * 0.12 : 0.02;
    var now = A.ac.currentTime;
    A.roar.gain.setTargetAtTime(roar * near, now, 0.12);
    A.hiss.gain.setTargetAtTime(hiss * near, now, 0.08);
    A.wind.gain.setTargetAtTime(0.04 + 0.02 * Math.sin(t * 0.21), now, 0.5);
    if (t > A.nextGull) { gullCry(A); A.nextGull = t + 6 + Math.random() * 9; }
  }
  function gullCry(A) {
    var ac = A.ac, t0 = ac.currentTime;
    for (var k = 0; k < 2 + (Math.random() * 2 | 0); k++) {
      var o = ac.createOscillator(), g = ac.createGain(), st = t0 + k * 0.22;
      o.type = 'sawtooth'; o.frequency.setValueAtTime(1500, st); o.frequency.exponentialRampToValueAtTime(820, st + 0.18);
      var f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1300; f.Q.value = 2;
      g.gain.setValueAtTime(0, st); g.gain.linearRampToValueAtTime(0.025, st + 0.02); g.gain.exponentialRampToValueAtTime(0.0005, st + 0.2);
      o.connect(f); f.connect(g); g.connect(A.out); o.start(st); o.stop(st + 0.22);
    }
  }
})();
