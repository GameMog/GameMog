// Aspen GP
//
// A first-party GameMog world, a kart race in the snow (the owner, 9 Oct 2026: a daytime meme kart race on AI Alps'
// mountains, "very chaotic, like a rollercoaster: uphills, downhills to the right and left, 4 laps", drifting on
// winding roads, and breaks in the road where every racer gets air and clears). Eight racers on snowmobiles race four
// laps of a 1.4 km mountain circuit on a bluebird day: the village straight, the First Drop, the Aspen Esses, the
// Crevasse, the Camelback Climb, the Summit Hairpin, Switchback Alley, the Icefall, the Ridge Run, Big Air and the
// Village Hairpin home.
//
// Built from parts (scripts/.scratch/aspen/world/, joined by its assemble.mjs): the lap and its course (course.js),
// the day's light and sky (look.js), the mountains (mountains.js), the snow that meets the road (land.js), the village
// at the line (village.js), the moving things (hazards.js), and the world itself (main.js). The physics, the rules,
// the camera, the HUD and the racers are the runtime's (lib/runtime/kart.js). Everything is built in code or taken
// from the platform's asset library; no brand, no logo.
(function () {
  'use strict';

  /* ------------------------------------------------------------ helpers -- */
  // (owned by the foundation / main.js: shared by every part)
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function smooth(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  // a small seeded generator for textures and placing (the world's own ctx.random is env.random)
  function aspenRng(seed) { var s = seed >>> 0; return function () { s = (s + 0x6d2b79f5) >>> 0; var t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  // The library assets the world loads (ids from public/assets/library.json; no new downloads), two lists that every
  // part ADDS to at its top level, in any order (main.js dedupes both and hands them over as they stand):
  //   ASSETS      what a laptop loads: every id any part uses there;
  //   LOW_ASSETS  what a phone loads (kart.lowAssets): every id any part uses on a phone, itself or a lighter stand-in.
  // Both are always explicit and only ever grow: an id in ASSETS and not in LOW_ASSETS is laptop-only, and no part
  // copies, trims or replaces another part's entries. aspenAssets(ids, lowIds) does both pushes, deduped:
  //   aspenAssets(['texture-snow', 'texture-dark-rock'], ['texture-snow'])   (lowIds omitted = the same ids on a phone,
  //   [] = laptop only). Every id must be in the library, or a phone falls back to the laptop's whole list.
  var ASSETS = [], LOW_ASSETS = [];
  // the race's laps: ONE number for the whole world (main.js kart.laps, village's timing board)
  var ASPEN_LAPS = 4;
  function aspenAssets(ids, lowIds) {
    (ids || []).forEach(function (id) { if (ASSETS.indexOf(id) < 0) ASSETS.push(id); });
    (lowIds === undefined ? ids || [] : lowIds || []).forEach(function (id) { if (LOW_ASSETS.indexOf(id) < 0) LOW_ASSETS.push(id); });
  }

  /* ---------------------------------------------------------- the lap -- */
  // (owned by the TRACK agent after the foundation pass; the tags below are STABLE: other parts dress the lap by
  // them: 'line','drop','esses','gap1','camel','summit','switch','gap2','ridge','gap3','hairpin'; v2 (9 Oct, 12:45)
  // adds 'fall','schrund','icefall','twin','kick','ravine','bigair','landing' among others)
  //
  // The lap as a walk, as Meme Kart's: straights and arcs, each row
  //   [tag, 's' | 'a', length (s) or radius (a), degrees (a; positive turns right), height at its end (eased along it),
  //    control-point spacing (optional), extra control points metres into a straight (optional), the height's ease
  //    (optional: 'l' linear, 'i' steepening, 'o' flattening; smoothstep if left out)]
  // It starts on the line heading east (x east, z south, y up, metres), and is an anticlockwise loop (the turns
  // sum to -360). The two straights named in CLOSE take up whatever the rest leaves, so the loop always closes exactly (their
  // lengths here are a first guess; the walk adds the difference): change any other row freely, then check that
  // the closing lengths stay positive and the lap never crosses itself (tools/course.mjs prints both).
  var SEG = [
    // 1. Village Straight: the line, the lodge, the stands, over the rollers up to the Cornice
    ['line', 's', 84, 0, 67, 42],
    // 2. The Cornice (a drop-off): up the kicker, the snow falls away 13 m under you, a 50% landing slope, a falling left
    ['drop', 's', 10, 0, 69, 10, 0, 'i'],
    ['fall', 's', 13, 0, 60, 13, 0, 'l'],
    ['dropland', 's', 24, 0, 48, 24, 0, 'l'],
    ['drop2', 'a', 21, -115, 38, 14],
    // 3. Aspen Slalom: five linked drift bends, falling, over a crest in the middle
    ['esses', 'a', 21, 80, 30],
    ['esses2', 'a', 20, -100, 20],
    ['esses3', 'a', 20, 100, 23],
    ['esses4', 'a', 21, -90, 11],
    ['esses5', 'a', 22, 78, 6],
    // 4. GAP 1, the Crevasse: the valley floor, a big ramp over 14 m of blue ice
    ['gap1', 's', 56, 0, 2, 19],
    // 5. Camelback Climb: up hard over three rollers, a kink, the Bergschrund (a step UP), on to the top
    ['camel', 's', 62, 0, 34, 31, 0, 'l'],
    ['kink', 'a', 24, -40, 42, 0, 0, 'l'],
    ['kink2', 'a', 24, 40, 50, 0, 0, 'l'],
    ['climb', 's', 26, 0, 63, 26, 0, 'l'],
    ['schrund', 's', 9, 0, 67, 9, 0, 'l'],
    ['climb2', 's', 30, 0, 84, 30, 0, 'l'],
    // 6. Summit Hairpin: 180 degrees left at the top
    ['summit', 'a', 19, -180, 104, 15],
    // 7. Switchback Alley: falling right, the pillar run, falling left
    ['switch', 'a', 21, 138, 96],
    ['switchrun', 's', 28, 0, 88, 28],
    ['switch2', 'a', 21, -150, 82],
    // 8. GAP 2, the Icefall (a drop-off): a big ramp, 12 m down over the frozen fall, a steep run-out
    ['gap2', 's', 24, 0, 84, 24, 0, 'i'],
    ['icefall', 's', 12, 0, 76, 12, 0, 'l'],
    ['icerun', 's', 26, 0, 65, 13, 0, 'l'],
    // 9. The Twins: a small ramp, two cracks with a stride between them (a double jump), stepping down
    ['twin', 's', 50, 0, 52, 25],
    // (the creek: an S down the valley, then the climb along it: CLOSE)
    ['creek', 'a', 22, 70, 46],
    ['creek2', 'a', 22, -85, 48],
    ['creekrun', 's', 90, 0, 66, 45],
    ['kick', 'a', 24, -50, 70, 21],
    ['kick2', 'a', 24, 50, 72, 21],
    // 10. Ridge Run: a flat-out sweeper on the crest, the fence straight
    ['ridge', 'a', 48, 50, 76, 21],
    ['ridge2', 's', 56, 0, 74, 28],
    // 11. GAP 3, the Ravine (a drop-off): a kicker at the crest, 12 m down, then BIG AIR: the big ramp over 20 m, 10 m down
    ['gap3', 's', 8, 0, 75, 8, 0, 'i'],
    ['ravine', 's', 12, 0, 67, 12, 0, 'l'],
    ['ravland', 's', 22, 0, 56, 22, 0, 'l'],
    ['jump3', 's', 18, 0, 57, 18, 0, 'i'],
    ['bigair', 's', 21, 0, 45, 21, 0, 'l'],
    ['landing', 's', 30, 0, 30, 30, 0, 'l'],
    // 12. Village Hairpin: tight, left, back toward the village, then the climb onto the straight (CLOSE)
    ['hairpin', 'a', 20, -156, 26, 14],
    ['run', 's', 112, 0, 64, 40],
  ];
  var CLOSE = ['creekrun', 'run'];
  // walked a metre at a time (the two CLOSE straights first solved so the walk ends where it began); then control
  // points evenly through each piece (about every 25 m on a straight unless it says, closer round the tight arcs),
  // 80 at most
  var WALK = [], AT = {}, SEGLEN = {};
  (function () {
    function walk(push) {
      var x = 0, z = 0, h = 0, y = SEG[SEG.length - 1][4], n0 = 0;
      SEG.forEach(function (s) {
        var len = s[1] === 's' ? s[2] : s[2] * Math.abs(s[3]) * Math.PI / 180, n = Math.max(1, Math.round(len)), y0 = y;
        if (push) { AT[s[0]] = WALK.length; SEGLEN[s[0]] = len; }
        for (var i = 0; i < n; i++) {
          var u = (i + 1) / n;
          y = y0 + (s[4] - y0) * (s[7] === 'l' ? u : s[7] === 'i' ? u * u : s[7] === 'o' ? u * (2 - u) : u * u * (3 - 2 * u));
          if (s[1] === 's') { x += Math.cos(h) * len / n; z += Math.sin(h) * len / n; }
          else { var r = s[2], sg = Math.sign(s[3]), cx = x - Math.sin(h) * r * sg, cz = z + Math.cos(h) * r * sg; h += s[3] * Math.PI / 180 / n; x = cx + Math.sin(h) * r * sg; z = cz - Math.cos(h) * r * sg; }
          if (push) WALK.push([x, y, z, s]);
        }
        n0 += n;
      });
      return [x, z];
    }
    // (the headings of the two closing straights, and how far the walk misses home: solved for the lengths to add)
    var hd = {}, h = 0;
    SEG.forEach(function (s) { if (s[1] === 's') hd[s[0]] = h; else h += s[3] * Math.PI / 180; });
    var e = walk(false), a = hd[CLOSE[0]], b = hd[CLOSE[1]];
    var ax = Math.cos(a), az = Math.sin(a), bx = Math.cos(b), bz = Math.sin(b), det = ax * bz - az * bx;
    if (Math.abs(det) > 1e-6) {
      var p = (-e[0] * bz + e[1] * bx) / det, q = (ax * -e[1] + az * e[0]) / det;
      SEG.forEach(function (s) { if (s[0] === CLOSE[0]) s[2] = +(s[2] + p).toFixed(3); else if (s[0] === CLOSE[1]) s[2] = +(s[2] + q).toFixed(3); });
    }
    walk(true);
    for (var k in AT) AT[k] /= WALK.length;   // where each piece starts, a fraction of the lap
  })();
  var POINTS = (function () {
    var P = [[0, SEG[SEG.length - 1][4], 0]];
    SEG.forEach(function (s, q) {
      var i0 = Math.round(AT[s[0]] * WALK.length), i1 = q + 1 < SEG.length ? Math.round(AT[SEG[q + 1][0]] * WALK.length) : WALK.length;
      var step = s[5] || (s[1] === 'a' ? clamp(s[2] * 0.55, 9, 20) : 25), n = Math.max(1, Math.round((i1 - i0) / step)), M = [];
      for (var j = 1; j <= n; j++) M.push((i1 - i0) * j / n);
      (s[6] || []).forEach(function (m) { if (m > 0 && m < i1 - i0) M.push(m); });
      M.sort(function (a, b) { return a - b; });
      M.forEach(function (m, j) {
        if (q === SEG.length - 1 && j === M.length - 1) return;   // (the lap's last point is its first)
        var w = WALK[Math.min(WALK.length - 1, i0 + Math.round(m) - 1)];
        P.push([+w[0].toFixed(1), +w[1].toFixed(2), +w[2].toFixed(1)]);
      });
    });
    return P;
  })();
  // a place on the lap: a piece's start plus metres (as a fraction, which is how the course is given)
  var LAP = WALK.length;
  function at(tag, m) { if (AT[tag] == null) throw new Error('Aspen GP: no piece of the lap called ' + tag); return +(AT[tag] + (m || 0) / LAP).toFixed(4); }

  /* -------------------------------------------------------- the course -- */
  // (engine opt-ins, notes/engine.md: breakLook 'none' leaves the chasm to land.js ('ice' the engine's daylight crevasse); clear: true the guaranteed air.
  // Both are ignored by an engine that does not have them yet, and Meme Kart names neither)
  // Limits (reviewers): ramps <= road width, at most 4; breaks from/to 2-20 m (len 3-14), at most 8; bumps at most
  // 12; a break spans the whole corridor (shoulders too), so the guaranteed air covers it all.
  var COURSE = {
    shoulder: 4,
    // (the chasms under the gaps are LAND's own (crevasse, icefall, ravine), cut through the snowfield: the engine draws
    // nothing there ('none'); 'ice' is its own daylight crevasse box, the fallback)
    breakLook: 'none',
    // (every break flown: clear: true for all, engine opt-in)
    breakClear: true,
    // (bigger air, engine opt-in: every pop, lip and ramp throws 1.3x as hard; the Icefall's and Big Air's ramps keep
    // lift 1 so they come down on their own slopes, not in the hairpin or past the Twins)
    air: 1.3,
    // (the hazards' warnings and strikes in snow and ice, not Meme Kart's fire: engine opt-in, picture only)
    hazardLook: 'snow',
    // boost pads (8): onto the long straights and the climbs, and on the run-ins to the Crevasse and the Twins
    pads: [
      { at: at('line', 30), x: -3 },
      { at: at('gap1', 8), x: 0 },
      { at: at('camel', 6), x: 3 },
      { at: at('climb', 4), x: -2.5 },
      { at: at('icerun', 6), x: 0 },
      { at: at('creekrun', 18), x: -2.5 },
      { at: at('ridge2', 36), x: 2 },
      { at: at('run', 50), x: 2.5 },
    ],
    // (each the full width of the road: whoever reaches it at any pace jumps what is past it; the Crevasse's is the
    // signature air, lift 1.8 (engine opt-in, bigger air): ~2 s and 8 m up, down onto the long Camelback straight)
    ramps: [
      { at: at('gap1', 22), x: 0, width: 16, size: 'big', lift: 1.8 },
      { at: at('icefall', 0), x: 0, width: 16, size: 'big', lift: 1 },
      { at: at('twin', 12), x: 0, width: 16, size: 'small' },
      { at: at('bigair', 0), x: 0, width: 16, size: 'big', lift: 1 },
    ],
    // the eight gaps, each across the whole corridor, every one cleared (clear: true); kind = the chasm land.js draws
    // (cliff, crevasse, icefall, ravine). Drop-offs: the Cornice, the Icefall and the Ravine (the far side 8-12 m
    // lower), the Bergschrund a step UP, the Twins a double jump, Big Air 20 m (from/to) and 12 m down
    breaks: [
      { from: at('fall', 0.5), len: 12, kind: 'cliff' },
      { from: at('gap1', 22.5), len: 14, kind: 'crevasse' },
      { from: at('schrund', 0.5), len: 8, kind: 'crevasse' },
      { from: at('icefall', 0.5), len: 11, kind: 'icefall' },
      { from: at('twin', 12.5), len: 8, kind: 'crevasse' },
      { from: at('twin', 29), len: 8, kind: 'crevasse' },
      { from: at('ravine', 0.5), len: 11, kind: 'ravine' },
      { from: at('bigair', 0.5), to: at('bigair', 20.5), kind: 'ravine' },
    ],
    // the crest pops (12, every one at the 0.6 m cap but the line's): kickers onto the Cornice, the Bergschrund, the
    // second Twin and the Ravine; rollers on the line, the Camelback, the creek climb and the run home; bumps off the
    // slalom's crest, the Crevasse's landing and the switchback run; the Ridge Fence's kicker
    bumps: [
      { at: at('line', 52), size: 'roller', n: 2, h: 0.5 },
      { at: at('fall', 0), size: 'lip', h: 0.6 },
      { at: at('esses3', 14), size: 'bump', h: 0.6 },
      { at: at('gap1', 46), size: 'bump', h: 0.6 },
      { at: at('camel', 14), size: 'roller', n: 3, h: 0.6 },
      { at: at('schrund', 0), size: 'lip', h: 0.6 },
      { at: at('switchrun', 6), size: 'bump', h: 0.6 },
      { at: at('twin', 28.5), size: 'lip', h: 0.6 },
      { at: at('creekrun', 60), size: 'roller', n: 3, h: 0.6 },
      { at: at('ridge2', 2), x: 6.9, width: 2.4, size: 'lip' },
      { at: at('ravine', 0), size: 'lip', h: 0.6 },
      { at: at('run', 30), size: 'roller', n: 2, h: 0.6 },
    ],
    // the ski-patrol fences, grindable (the engine's rail, dressed as a fence in hazards.js): the Ridge Fence (its
    // kicker pops you up onto it), the Twin Fence down the right after the second crack, the Landing Fence after Big Air
    rails: [
      { from: at('ridge2', 3.5), to: at('ridge2', 44), x: 6.9, h: 0.5 },
      { from: at('twin', 40), to: at('twin', 50), x: 4, h: 0.5 },
      { from: at('landing', 3), to: at('landing', 27), x: 3, h: 0.6 },
    ],
    // the mountain's chaos (model: false: hazards.js draws them from ctx.kart.hazards(), in this order; skin = what):
    // giant snowballs across the Camelback and the creek climb, the ice pillar on the switchback run, a fir across
    // the creek, icicles off the gorge walls onto the creek's S, avalanche chunks on the Ridge Run
    hazards: [
      { kind: 'crossing', at: at('camel', 48), side: 'left', every: 5.5, offset: 2, model: false },
      { kind: 'topple', at: at('switchrun', 16), side: 'left', every: 6.5, offset: 1, model: false },
      { kind: 'meteor', from: at('ridge', 4), to: at('ridge2', 40), every: 3.5, offset: 1.5, model: false },
      { kind: 'crossing', at: at('creekrun', 110), side: 'right', every: 7, offset: 4, model: false },
      { kind: 'topple', at: at('creekrun', 42), side: 'right', every: 6, offset: 3, model: false, skin: 'fir' },
      { kind: 'meteor', from: at('creek', 0), to: at('creekrun', 30), every: 4, offset: 0.5, model: false, skin: 'icicle' },
    ],
    // deep powder (the engine's grass) on the insides of the slalom and the switchbacks, soft snow round the Village
    // Hairpin (none on the summit: its strip's chords sag under that steep crest and the road shows through)
    offroad: [
      { from: at('esses2', 6), to: at('esses2', 30), side: 'inside', width: 2.5, kind: 'grass' },
      { from: at('esses4', 6), to: at('esses4', 28), side: 'inside', width: 2.5, kind: 'grass' },
      { from: at('switch', 8), to: at('switch', 42), side: 'inside', width: 2.5, kind: 'grass' },
      { from: at('switch2', 8), to: at('switch2', 46), side: 'inside', width: 2.5, kind: 'grass' },
      { from: at('creek', 4), to: at('creek2', 20), side: 'inside', width: 2, kind: 'grass' },
      { from: at('hairpin', 8), to: at('hairpin', 50), side: 'outside', width: 3, kind: 'shoulder' },
    ],
    walls: { gaps: [] },
    gm: 'auto',
    // the Airdrop crates: ten rows a lap
    airdrops: [
      { at: at('line', 20), n: 5 },
      { at: at('gap1', 4), n: 4 },
      { at: at('camel', 34), n: 5 },
      { at: at('switchrun', 24), n: 4 },
      { at: at('icerun', 18), n: 5 },
      { at: at('creekrun', 84), n: 5 },
      { at: at('kick2', 6), n: 4 },
      { at: at('ridge2', 24), x: -2, n: 4 },
      { at: at('landing', 22), x: -2, n: 4 },
      { at: at('run', 80), n: 5 },
    ],
  };
  // the stretches the scenery is dressed by (fractions of the lap); add more as the parts need them
  var ZONE = {
    village: [at('run', 0), at('drop', 0)],
    esses: [at('drop2', 0), at('gap1', 0)],
    cornice: [at('fall', 0.5), at('fall', 12.5)],
    cliff: [at('fall', 0.5), at('fall', 12.5)],
    crevasse: [at('gap1', 22.5), at('gap1', 36.5)],
    camel: [at('camel', 0), at('summit', 0)],
    schrund: [at('schrund', 0.5), at('schrund', 8.5)],
    summit: [at('summit', 0), at('switch', 0)],
    switchbacks: [at('switch', 0), at('gap2', 0)],
    creek: [at('icefall', 0.5), at('icefall', 11.5)],
    icefall: [at('icefall', 0.5), at('icefall', 11.5)],
    twins: [at('twin', 12.5), at('twin', 37)],
    valley: [at('icerun', 0), at('ridge', 0)],
    ridge: [at('ridge', 0), at('gap3', 0)],
    ravine: [at('ravine', 0.5), at('ravine', 11.5)],
    bigair: [at('bigair', 0.5), at('bigair', 20.5)],
  };

  /* ------------------------------------------------- the day's look -- */
  // (owned by the LOOK agent) Bluebird noon in the Rockies: a deep cobalt zenith over a pale haze along the horizon, the
  // winter sun low in the south (28 degrees up, a little east of due south) for relief, long blue shadows and backlit
  // powder, snow kept bright but never blown to flat white. ONE shader sky on every device (AI Alps' own sky shader,
  // land.js landSkyMat/lsSky2, re-graded from night to day), the same shader lighting the world as its environment.
  // The lap runs east along the line (x east, z SOUTH, y up), so the sun stands to the right of the start straight
  // (side light, shadows falling across the road), behind the camel climb (the massif to the north front-lit), ahead
  // on the long run south from the switchbacks (backlit snow, the sun's disc in view), and to the left of Big Air.
  //
  // For the other parts (all optional; see notes/look.md):
  //   SUN / KEY             the sun's disc / the key light, unit [x, y, z] from the scene toward the sun
  //   ASPEN_GRAPHICS / ASPEN_CAMERA   the world's graphics and camera blocks (main.js reads them)
  //   ASPEN_SKY             the look's colours (linear RGB) and, once built, its shared uniforms (U) and GLSL (GLSL)
  //   aspenSkyAt(dir)       the sky's colour (linear) along a direction [x, y, z]: for impostors, cards, far scenery
  //   aspenSparkle(mat, o)  sun glints on a snow MeshStandardMaterial (world-anchored, pixel-sized, speed-limited:
  //                         they twinkle, they don't shimmer); o.amount 0..2 (1), o.near metres (18, out to 2x)
  //   aspenAir(mat)         the look's distance haze (fog into the sky's own colour) on a lit material (Standard,
  //                         Physical, Lambert, Phong; chains with aspenSparkle)
  var ASPEN_SUN_EL = 28, ASPEN_SUN_AZ = 18;   // degrees above the horizon, and east of due south
  function aspenDir(el, az) { el *= Math.PI / 180; az *= Math.PI / 180; return [Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)]; }
  var SUN = aspenDir(ASPEN_SUN_EL, ASPEN_SUN_AZ);   // where the sun's disc stands (from the scene toward it)
  var KEY = aspenDir(ASPEN_SUN_EL, ASPEN_SUN_AZ);   // the light itself (the same: the glints and the shadows agree)

  // the palette, linear RGB, before the exposure (the 'kart' preset's neutral curve passes values under ~0.76 as they
  // are, so these are close to what reaches the screen): the sky from the horizon up, the fog, the lights
  var ASPEN_SKY = {
    horizon: [0.66, 0.79, 0.94], low: [0.25, 0.47, 0.86], mid: [0.034, 0.15, 0.6], zenith: [0.008, 0.05, 0.33],
    fog: [0.6, 0.73, 0.88], fogNear: 170, fogFar: 3200,
    sun: '#FFEED6', sunI: 5.2, hemiSky: '#C6D5EA', hemiGround: '#E8ECF2', hemiI: 1.3,
    U: null, GLSL: '', dome: null,
  };

  // the graphics and camera blocks (main.js: graphics: ASPEN_GRAPHICS, camera: ASPEN_CAMERA). The runtime's 'kart'
  // preset (the neutral curve that keeps the racers' colours) with a lower exposure for the snow, a gentle bloom only
  // on the sun and the glints, a cold-shadow / warm-highlight split, and the world lit by its own sky
  var ASPEN_GRAPHICS = {
    preset: 'kart', exposure: 0.88,
    environment: { intensity: 0.6, extras: function (ctx) { return aspenEnvSky(ctx); } },
    bloom: { strength: 0.22, threshold: 1.3, radius: 0.5 },
    grade: { contrast: 1.07, saturation: 1.06, warmth: 0.05, vignette: 0.12, split: 0.08, grain: 0, highlights: 0.96 },
    shadows: { extent: 52 }, motion: 0.3,
  };
  var ASPEN_CAMERA = { fov: 64 };

  // the shared GLSL: hash and noise (AI Alps' lsH/lsN/lsF), the sky along a direction, the haze over far things, and
  // the sun's glints on snow
  var ASPEN_UNI = 'uniform vec3 uAspSun, uAspSunC, uAspFogC, uAspHor, uAspLow, uAspMid, uAspZen; uniform float uAspFogN, uAspFogF, uAspTime, uAspSpeed;\n';
  var ASPEN_GLSL = [
    'float aspH(vec2 p) { vec3 q = fract(vec3(p.xyx)*0.1031); q+=dot(q, q.yzx+33.33); return fract((q.x+q.y)*q.z); }',
    'float aspN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(aspH(i), aspH(i+vec2(1, 0)), f.x), mix(aspH(i+vec2(0, 1)), aspH(i+vec2(1, 1)), f.x), f.y); }',
    'float aspF(vec2 p) { return aspN(p)*0.5+aspN(p*2.03+7.1)*0.25+aspN(p*4.11-3.7)*0.125+aspN(p*8.17+1.3)*0.0625; }',
    // the day sky (from AI Alps' lsSky2, its night stops swapped for day's): a pale haze along the horizon, a clear
    // blue a little above it, deepening to cobalt overhead; paler and brighter on the sun's side, the sun's glow
    'vec3 aspSky(vec3 d) {',
    '  float h = d.y, hp = max(h, 0.0), cs = dot(d, uAspSun), s = max(cs, 0.0);',
    '  vec3 c = mix(uAspHor, uAspLow, smoothstep(0.0, 0.1, hp));',
    '  c = mix(c, uAspMid, smoothstep(0.06, 0.45, hp));',
    '  c = mix(c, uAspZen, smoothstep(0.4, 1.0, hp));',
    '  c = mix(c, c*1.12+vec3(0.06, 0.07, 0.07), pow(s, 3.0)*0.55*(1.0-0.6*hp));',
    '  c *= 0.94+0.06*(cs*0.5+0.5);',
    '  c += vec3(1.0, 0.93, 0.8)*(0.05*pow(s, 6.0)+0.3*pow(s, 90.0));',
    '  return mix(c, uAspHor*0.93, smoothstep(0.0, -0.06, h));',
    '}',
    // far things fade into the haze: the scene fog's own linear ramp (so they meet the near snow), clearer up high,
    // and toward the colour of the sky behind them the farther they are
    'vec3 aspAir(vec3 c, vec3 p) {',
    '  vec3 v = p-cameraPosition; float d = length(v); v/=max(d, 1e-3);',
    '  float f = clamp((d-uAspFogN)/max(uAspFogF-uAspFogN, 1.0), 0.0, 1.0);',
    '  f *= mix(1.0, 0.62, smoothstep(40.0, 700.0, p.y));',
    '  vec3 fc = mix(uAspFogC, aspSky(normalize(vec3(v.x, 0.025+clamp(v.y, -0.2, 0.4)*0.35, v.z))), smoothstep(200.0, 1100.0, d));',
    '  return mix(c, fc, f);',
    '}',
    // the sun's glints on snow: one candidate facet per 25 cm cell, anchored to the world (no camera term in the
    // hash, so the set never reshuffles as you drive), each a random crystal (any tilt: a low sun glints off the
    // side-on ones too) at a random spot in its cell, drawn as a dot about 1.5 PIXELS across whatever the distance
    // and the grazing angle (sized from the cell's own screen footprint: never a sub-pixel flicker), lit only while
    // the half-vector stays within ~8 degrees of it (a glint lives several frames at racing speed: a twinkle, not a
    // shimmer), fewer at speed; sh: the key light's shadow there (0..1), dens: how many (0..2), near: metres
    // (the cell's screen footprint: call aspGlintFx in uniform control flow, before any branch, and pass it in;
    // derivatives taken after a branch are undefined on many GPUs)
    'vec2 aspGlintFx(vec3 p) { vec2 q = p.xz*4.0+p.y*1.3; return vec2(length(vec2(dFdx(q.x), dFdy(q.x))), length(vec2(dFdx(q.y), dFdy(q.y)))); }',
    'vec3 aspGlint(vec3 p, vec3 n, float dist, float sh, float dens, float near, vec2 fx) {',
    '  if (dist > near*2.0 || sh <= 0.01 || dens <= 0.0) return vec3(0.0);',
    '  vec2 q = p.xz*4.0+p.y*1.3, c = floor(q);',
    '  float thin = mix(1.0, 0.5, smoothstep(10.0, 30.0, uAspSpeed));',
    '  if (aspH(c+7.7) > dens*thin*0.5) return vec3(0.0);',
    '  vec3 H = normalize(normalize(cameraPosition-p)+uAspSun);',
    '  vec3 f = normalize(n*0.55+vec3(aspH(c+1.7), aspH(c+9.2), aspH(c+4.4))*2.0-1.0);',
    '  float g = pow(max(dot(H, f), 0.0), 60.0);',
    '  vec2 e = fract(q)-(vec2(aspH(c+3.1), aspH(c+5.3))*0.7+0.15);',
    '  float spot = 1.0-smoothstep(0.6, 1.5, length(e/max(fx, vec2(1e-4))));',
    '  return uAspSunC*g*spot*sh*(1.0-smoothstep(near, near*2.0, dist))*6.0;',
    '}',
  ].join('\n');
  // the key light's shadow at a fragment, for lit materials (AI Alps' LAND_LIT lsShadow)
  var ASPEN_LIT = ['float aspShadow() {',
    '#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0',
    '  DirectionalLightShadow s = directionalLightShadows[ 0 ];',
    '  return receiveShadow ? getShadow( directionalShadowMap[ 0 ], s.shadowMapSize, s.shadowBias, s.shadowRadius, vDirectionalShadowCoord[ 0 ] ) : 1.0;',
    '#else',
    '  return 1.0;',
    '#endif',
    '}'].join('\n');

  // the shared uniforms (one set: every material that uses the look's GLSL holds these same objects)
  function aspenSkyUniforms(THREE) {
    if (ASPEN_SKY.U) return ASPEN_SKY.U;
    var K = ASPEN_SKY, v3 = function (a) { return new THREE.Vector3(a[0], a[1], a[2]); };
    K.U = {
      uAspSun: { value: v3(SUN).normalize() }, uAspSunC: { value: new THREE.Vector3(1, 0.95, 0.87) },
      uAspFogC: { value: new THREE.Color().setRGB(K.fog[0], K.fog[1], K.fog[2]) }, uAspFogN: { value: K.fogNear }, uAspFogF: { value: K.fogFar },
      uAspHor: { value: v3(K.horizon) }, uAspLow: { value: v3(K.low) }, uAspMid: { value: v3(K.mid) }, uAspZen: { value: v3(K.zenith) },
      uAspTime: { value: 0 }, uAspSpeed: { value: 0 },
    };
    K.GLSL = ASPEN_UNI + ASPEN_GLSL;
    return K.U;
  }
  // the sky's colour along [x, y, z] in JS (linear RGB, as aspSky), for things drawn in JS: impostor cards, canvases
  function aspenSkyAt(d) {
    var K = ASPEN_SKY, l = Math.hypot(d[0], d[1], d[2]) || 1, x = d[0] / l, y = d[1] / l, z = d[2] / l, hp = Math.max(y, 0);
    var cs = x * SUN[0] + y * SUN[1] + z * SUN[2], s = Math.max(cs, 0), c = [0, 0, 0];
    for (var i = 0; i < 3; i++) {
      var v = lerp(K.horizon[i], K.low[i], smooth(0, 0.1, hp)); v = lerp(v, K.mid[i], smooth(0.06, 0.45, hp)); v = lerp(v, K.zenith[i], smooth(0.4, 1, hp));
      v = lerp(v, v * 1.12 + [0.06, 0.07, 0.07][i], Math.pow(s, 3) * 0.55 * (1 - 0.6 * hp)); v *= 0.94 + 0.06 * (cs * 0.5 + 0.5);
      c[i] = lerp(v, K.horizon[i] * 0.93, smooth(0, -0.06, y));
    }
    return c;
  }

  // the dome (or, env true, the same sky as the environment's light: the ground below it snow, the sun only a glow)
  function aspenSkyMat(THREE, env) {
    var U = aspenSkyUniforms(THREE);
    return new THREE.ShaderMaterial({
      uniforms: U,
      vertexShader: env ? 'varying vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position, 1.0); }'
        : 'varying vec3 vDir; void main() { vDir = position; vec4 c = projectionMatrix*modelViewMatrix*vec4(position, 1.0); gl_Position = c.xyww; gl_Position.z*=0.99999; }',
      fragmentShader: ASPEN_SKY.GLSL + [
        'varying vec3 vDir;',
        'void main() {',
        '  vec3 d = normalize(vDir); vec3 c = aspSky(d);',
        '  float mc = dot(d, uAspSun), ang = acos(clamp(mc, -1.0, 1.0))*57.2958;',
        '#if ENV == 1',
        // (in the environment the sun only glows: its direct light is the key light's; below the horizon, sunlit snow)
        '  c += vec3(1.0, 0.95, 0.85)*1.5*exp(-ang*0.35);',
        '  c = mix(c, vec3(0.5, 0.56, 0.64)*(0.9+0.2*max(dot(vec3(0.0, 1.0, 0.0), uAspSun), 0.0)), smoothstep(0.0, -0.12, d.y));',
        '#else',
        // the disc (0.6 degrees, its edge antialiased), a bright core for the bloom, and a soft halo
        '  float aa = max(fwidth(ang), 0.01), disc = 1.0-smoothstep(0.6-aa, 0.6+aa, ang);',
        '  c += vec3(1.0, 0.96, 0.88)*(0.6*exp(-ang*1.6)+0.12*exp(-ang*0.25));',
        '  c = mix(c, vec3(1.0, 0.97, 0.9)*36.0, disc);',
        '#endif',
        '  gl_FragColor = vec4(c, 1.0);',
        '}'].join('\n'),
      defines: { ENV: env ? 1 : 0 },
      side: THREE.BackSide, depthWrite: false, fog: false,
    });
  }
  // the environment's extra shapes (graphics.environment.extras): the same sky round the bake's camera
  function aspenEnvSky(ctx) {
    var THREE = ctx.THREE, g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.SphereGeometry(90, 48, 24), aspenSkyMat(THREE, true)));
    return g;
  }

  // sun glints on a snow material (MeshStandardMaterial or MeshPhysicalMaterial): o.amount (density, 1), o.near
  // (metres the near glints reach, 14). Lit by the key light, off in its shadow. Several materials may share it.
  function aspenSparkle(m, o) {
    o = o || {};
    if (!m || !m.isMaterial || m.userData.aspSparkle) return m;
    var THREE = ASPEN_SKY.THREE, U = ASPEN_SKY.U;
    if (!THREE || !U) return m;   // (call it from build(), after aspenLook)
    var own = { uAspGl: { value: o.amount != null ? o.amount : 1 }, uAspGlN: { value: o.near || 18 } };
    m.userData.aspSparkle = own;
    var prev = m.onBeforeCompile;
    m.onBeforeCompile = function (sh, r) {
      if (prev) prev.call(this, sh, r);
      Object.assign(sh.uniforms, U, own);
      // (the world position and normal from three's own view-space ones: no varyings of ours to go stale)
      sh.fragmentShader = sh.fragmentShader.replace('void main() {', ASPEN_SKY.GLSL + 'uniform float uAspGl, uAspGlN;\n' + (sh.fragmentShader.indexOf('<lights_pars_begin>') >= 0 ? ASPEN_LIT : 'float aspShadow() { return 1.0; }') + '\nvoid main() {')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n{ vec3 aP = cameraPosition+(vec4(-vViewPosition, 0.0)*viewMatrix).xyz, aW = normalize((vec4(normal, 0.0)*viewMatrix).xyz);\n  float aD = length(vViewPosition); vec2 aFx = aspGlintFx(aP); float aSh = aspShadow();\n  if (aD < uAspGlN*2.0 && dot(aW, uAspSun) > 0.0) totalEmissiveRadiance += aspGlint(aP, aW, aD, aSh, uAspGl, uAspGlN, aFx); }');
    };
    var base = m.customProgramCacheKey;
    m.customProgramCacheKey = function () { return 'aspSparkle|' + (base ? base.call(m) : ''); };
    m.needsUpdate = true;
    return m;
  }
  // the look's haze on a lit material (far scenery that should fade into the sky's own colour, not the flat fog)
  function aspenAir(m) {
    if (!m || !m.isMaterial || m.userData.aspAir || !ASPEN_SKY.U) return m;
    var U = ASPEN_SKY.U, prev = m.onBeforeCompile; m.userData.aspAir = true;
    m.onBeforeCompile = function (sh, r) {
      if (prev) prev.call(this, sh, r);
      Object.assign(sh.uniforms, U);
      // (the world position from three's own view-space one; the look's GLSL once, if aspenSparkle has not put it in)
      if (sh.fragmentShader.indexOf('vec3 aspAir(') < 0) sh.fragmentShader = sh.fragmentShader.replace('void main() {', ASPEN_SKY.GLSL + '\nvoid main() {');
      sh.fragmentShader = sh.fragmentShader.replace('#include <fog_fragment>', '#ifdef USE_FOG\ngl_FragColor.rgb = aspAir(gl_FragColor.rgb, cameraPosition+(vec4(-vViewPosition, 0.0)*viewMatrix).xyz);\n#endif');
    };
    var base = m.customProgramCacheKey;
    m.customProgramCacheKey = function () { return 'aspAir|' + (base ? base.call(m) : ''); };
    m.needsUpdate = true;
    return m;
  }


  function aspenLook(ctx, env) {
    var THREE = env.THREE, scene = env.scene, K = ASPEN_SKY, low = env.low;
    K.THREE = THREE;
    var U = aspenSkyUniforms(THREE);
    // (the runtime's painted sky, hidden: it keeps the platform's own idea of the day (its sun, its horizon) for
    // anything that asks; the sky you see is the dome below)
    var base = ctx.sky({ top: '#1A4FB4', horizon: '#D2E3F2', bottom: '#DCE4EE', sun: SUN, sunColor: K.sun, sunSize: 1.2, glow: 0.6, haze: 0.4, curve: 0.45 });
    if (base) base.visible = false;
    env.sky = base;
    // the dome: the shader sky round the camera (the far plane), drawn before everything
    var dome = new THREE.Mesh(new THREE.SphereGeometry(1000, low ? 32 : 64, low ? 16 : 32), aspenSkyMat(THREE, false));
    dome.frustumCulled = false; dome.renderOrder = -1000; dome.userData.gmSky = true; dome.userData.noReflection = true; dome.name = 'aspen-sky';
    // (kept on whichever camera draws it, every draw: the race's, a flyover's, a podium's)
    dome.onBeforeRender = function (r, sc2, cam) { dome.position.copy(cam.position); dome.updateMatrixWorld(); };
    scene.add(dome); K.dome = dome; env.dome = dome;
    // the light: a cool sky over sunlit snow (the shadows blue), and the low warm-white sun with its shadows
    env.hemi = new THREE.HemisphereLight(K.hemiSky, K.hemiGround, K.hemiI);
    scene.add(env.hemi);
    env.sun = new THREE.DirectionalLight(K.sun, K.sunI);
    env.sun.position.set(KEY[0] * 200, KEY[1] * 200, KEY[2] * 200); env.sun.castShadow = true;
    env.sun.shadow.bias = -0.0004; env.sun.shadow.normalBias = 0.03;
    scene.add(env.sun);
    var sc = new THREE.Color(K.sun); U.uAspSunC.value.set(sc.r, sc.g, sc.b).multiplyScalar(K.sunI / Math.PI);
    // the haze: the scene's own fog (the near snow, the racers) in the horizon's colour, matched by aspAir
    scene.fog = new THREE.Fog(0xffffff, K.fogNear, K.fogFar);
    scene.fog.color.setRGB(K.fog[0], K.fog[1], K.fog[2]);
    env.fog = scene.fog;
    // each frame: the dome on the camera, the haze uniforms on the fog (the race's high shots push it back), the
    // camera's speed for the glints
    var last = new THREE.Vector3(), has = false;
    env.updates.push(function (c, t, dt) {
      var cam = c.camera; if (!cam) return;
      dome.position.copy(cam.position);
      if (scene.fog) { U.uAspFogN.value = scene.fog.near; U.uAspFogF.value = scene.fog.far; U.uAspFogC.value.copy(scene.fog.color); }
      U.uAspTime.value = t;
      if (has && dt > 0) { var v = cam.position.distanceTo(last) / dt; U.uAspSpeed.value += (Math.min(v, 60) - U.uAspSpeed.value) * Math.min(1, dt * 4); }
      last.copy(cam.position); has = true;
    });
  }

  /* --------------------------------------------------- the mountains -- */
  // (owned by the MOUNTAINS agent) The Rockies round the lap: AI Alps' massif (its scanned heightfield set down where
  // the camera looks longest: north over the camel climb and the summit, west-south-west beyond Big Air), its eroded
  // ridge noise for the ranges between, and its far silhouettes, all day-lit; plus an Aspen touch, a maroon-red twin
  // peak on the skyline over the far end of the start straight, and a forested ski hill with runs cut down it south-east
  // of the lap. Everything is placed round the lap itself (its middle and its outline), so it follows the track.
  //   one ring mesh (rising a little outside the lap's outline to ~1,450 m from its middle: inside the camera's
  //     1,800 m reach from anywhere on the lap; its foot on the plane the lap leans in, MTN.fit, so a lap that climbs
  //     100 m has its high side's mountains standing higher; the low foothills sunk under the land's snowfield and
  //     snow-coloured where they meet it), lit in its own shader: the sun's shadow baked per vertex (the ranges shade
  //     each other), snow on the gentler slopes, dark rock on the steep and the crests, spruce forest below the
  //     treeline (on hills 40 m and more over their foot), the haze of ASPEN_SKY (look.js) by distance
  //   the far silhouettes: two rings of hazy ranges round the camera at the far plane, behind everything
  // Phones (env.low): the same shapes on a coarser ring (~19k triangles), the scan's heights but not its detail
  // texture, fewer octaves in the shader; 2 draws either way. Source: scripts/.scratch/alps/parts-src/land.js (landN, landRidge,
  // landErode, landHf, landStamps, landShade, landSilhouettes).
  // For the land agent: MTN.inner(x, z) is how far (m) a point is inside the mountains' foot (< 0: outside them, on
  // your valley floor), MTN.h(x, z) their height above env.floorY there (their foot lifted with the lap's lean: MTN.fit).
  // (the scanned massif on every device: the ranges keep the same shapes on a phone, its 1.9 MB the price; LOW_ASSETS
  // replaces the whole list on a phone, so a part that needs something there names it there too)
  ASSETS.push('heightfield-massif');
  if (LOW_ASSETS.indexOf('heightfield-massif') < 0) LOW_ASSETS.push('heightfield-massif');
  var MTN = { r1: 1450, stamps: [], twin: [], ski: [112, 154] };

  // AI Alps' noise (land.js landH2 / landN / landRidge / landErode), renamed for this world's one scope; mtnH2 is the
  // whole world's hash (the land's noise and its icicles use it too)
  function mtnH2(a, b) { var s = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return s - Math.floor(s); }
  function mtnN(x, z) {
    var i = Math.floor(x), j = Math.floor(z), u = x - i, v = z - j;
    u = u * u * (3 - 2 * u); v = v * v * (3 - 2 * v);
    var a = mtnH2(i, j), b = mtnH2(i + 1, j), c = mtnH2(i, j + 1), d = mtnH2(i + 1, j + 1);
    return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
  }
  function mtnRidge(x, z, oct) {
    var s = 0, a = 0.56, w = 1;
    for (var o = 0; o < (oct || 6); o++) {
      var n = 1 - Math.abs(mtnN(x + o * 17.3, z - o * 9.1)); n *= n * w; w = clamp(n * 1.9, 0, 1);
      s += n * a; a *= 0.47;
      var t = x; x = (x * 0.8 - z * 0.6) * 2.07; z = (t * 0.6 + z * 0.8) * 2.07;
    }
    return s;
  }
  function mtnErode(x, z, oct) {
    var s = 0, a = 0.5, gx = 0, gz = 0;
    for (var o = 0; o < (oct || 6); o++) {
      var i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j, ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
      var a0 = mtnH2(i, j), k1 = mtnH2(i + 1, j) - a0, k2 = mtnH2(i, j + 1) - a0, k3 = -k1 - mtnH2(i, j + 1) + mtnH2(i + 1, j + 1);
      gx += 12 * fx * (1 - fx) * (k1 + k3 * uz); gz += 12 * fz * (1 - fz) * (k2 + k3 * ux);
      s += a * (2 * (a0 + k1 * ux + k2 * uz + k3 * ux * uz) - 1) / (1 + gx * gx + gz * gz); a *= 0.5;
      var t = x; x = (x * 0.8 - z * 0.6) * 2.03 + 1.7; z = (t * 0.6 + z * 0.8) * 2.03 - 3.1;
    }
    return s;
  }
  // the scanned massif (256 x 256, 0..1), sampled with its edges faded (land.js landHf)
  function mtnHf(u, v) {
    var D = MTN.hf; if (u <= 0 || v <= 0 || u >= 1 || v >= 1) return 0;
    var x = u * 255, y = v * 255, i = x | 0, j = y | 0, fx = x - i, k = j * 256 + i;
    if (i >= 255 || j >= 255) return 0;
    var a = D[k] + (D[k + 1] - D[k]) * fx, b = D[k + 256] + (D[k + 257] - D[k + 256]) * fx;
    return (a + (b - a) * (y - j)) * smooth(0, 0.1, Math.min(u, v, 1 - u, 1 - v));
  }
  // the ring's inner edge (the mountains' foot) at angle th round the lap's middle, from the table built in build
  function mtnRin(th) {
    var n = MTN.NA, f = ((th / (Math.PI * 2)) % 1 + 1) % 1 * n, i = Math.floor(f) % n, u = f - Math.floor(f);
    return MTN.rin[i] * (1 - u) + MTN.rin[(i + 1) % n] * u;
  }
  // the foot's height over the floor at angle th: the lap's lean (MTN.fit) carried out to the foot, 10 m down (so a lap
  // that climbs 100 m has its high side's mountains standing on a higher valley floor, not buried in the snowfield)
  function mtnLift(th) { var F = MTN.fit; return F.y - 10 - MTN.floor + (F.b * Math.cos(th) + F.c * Math.sin(th)) * mtnRin(th); }
  // the mountains' surface over env.floorY (MTN.h): their height on the lifted foot, the low foothills (under ~20 m)
  // sunk under the land's snowfield, so none just breaks its surface (a flat dark puddle seen from above)
  function mtnZ(x, z, out) { var h = mtnHeight(x, z, out); return h - 28 * (1 - smooth(20, 70, h)) + mtnLift(Math.atan2(z - MTN.c.z, x - MTN.c.x)); }
  // the mountains' height above the foot at (x, z) (0 at their foot and inside it); out (optional): [maroon 0..1]
  function mtnHeight(x, z, out) {
    var c = MTN.c, dx = x - c.x, dz = z - c.z, r = Math.sqrt(dx * dx + dz * dz), rin = mtnRin(Math.atan2(dz, dx));
    var t = clamp((r - rin) / Math.max(MTN.r1 - rin, 200), 0, 1.2);
    if (out) { out[0] = 0; out[1] = out[2] = out[3] = out[4] = 0; }
    if (t <= 0) return 0;
    var oct = MTN.low ? 4 : 5;
    var wx = x + 90 * mtnN(x * 0.0017, z * 0.0017), wz = z + 90 * mtnN(x * 0.0017 + 7.7, z * 0.0017 - 3.1);
    var sh = clamp(0.35 + 0.8 * mtnErode(wx * 0.0019, wz * 0.0019, oct) + 0.45 * (mtnRidge(wx * 0.0012 + 5, wz * 0.0012, oct) - 0.3), 0, 1.6);
    // three bands across the ring: forested foothills from the foot, the main range, its back slope down to the rim
    // (so the peaks stand as masses with the far silhouettes behind them, not as a wall along the rim)
    var main = smooth(0.18, 0.55, t) * (1 - 0.6 * smooth(0.78, 1.0, t));
    var h = ((MTN.hf ? 50 : 70) + (MTN.hf ? 150 : 230) * main) * sh * sh * smooth(0.04, 0.35, t);
    h += (42 + 48 * mtnN(x * 0.006 + 3.3, z * 0.006 - 1.9)) * smooth(0, 0.12, t) * (1 - 0.5 * smooth(0.3, 0.6, t));
    // the scanned massif, set down where it shows best
    if (MTN.hf) {
      var hs = 0, top = 0, ws = smooth(0.12, 0.4, t) * (1 - 0.5 * smooth(0.86, 1.0, t));
      for (var i = 0; i < MTN.stamps.length; i++) {
        var S = MTN.stamps[i], sx = x - S[0], sz = z - S[1], L = S[2];
        if (sx * sx + sz * sz > L * L * 0.5) continue;
        var u = 0.5 + (S[4] * sx - S[5] * sz) / L, v = 0.5 - (S[5] * sx + S[4] * sz) / L, e = Math.max(0, mtnHf(u, v) - 0.01) * S[3];
        hs += e;
        // (the stamp that makes most of the height here, for the detail normals and the rock of its own scan)
        if (out && e > top) { top = e; out[1] = u; out[2] = v; out[3] = smooth(15, 110, e * ws); out[4] = i; }
      }
      h += hs * ws;
    }
    // the maroon twin: two steep pyramids and the ridge between, standing over whatever is there
    if (MTN.twin.length) {
      var T = MTN.twin, best = 0;
      for (var k = 0; k < 2; k++) {
        // (a four-faced pyramid, its arêtes where the faces meet, softened toward the base, rough with ridge noise)
        var P = T[k], ex = x - P[0], ez = z - P[1], ra = Math.sqrt(ex * ex + ez * ez), ph = P[4], py = 0;
        for (var f4 = 0; f4 < 4; f4++) { var fa = ph + f4 * Math.PI / 2; py = Math.max(py, ex * Math.cos(fa) + ez * Math.sin(fa)); }
        var dd = lerp(py / (P[3] * 0.74), ra / P[3], 0.3 + 0.4 * smooth(0.5, 1, ra / P[3]));
        if (dd < 1) best = Math.max(best, P[2] * Math.pow(1 - dd, 1.25) * (0.88 + 0.2 * (mtnRidge(x * 0.007 + k * 4, z * 0.007, 4) - 0.35)) * (1 + 0.05 * mtnN(x * 0.03, z * 0.03)));
      }
      // (the ridge: along the segment between the summits, a little lower than the lower one)
      var ax = T[0][0], az = T[0][1], bx = T[1][0] - ax, bz = T[1][1] - az, q = clamp(((x - ax) * bx + (z - az) * bz) / (bx * bx + bz * bz), 0, 1);
      var pd = Math.hypot(ax + bx * q - x, az + bz * q - z), rh = Math.min(T[0][2], T[1][2]) * (0.78 - 0.1 * Math.sin(q * Math.PI));
      if (pd < 260) best = Math.max(best, rh * Math.pow(1 - pd / 260, 1.6));
      if (best > h) { if (out) out[0] = smooth(0.2, 0.45, best / T[0][2]); h = h + (best - h) * smooth(0, 60, best - h); }
    }
    // the ski hill: a broad forested mountain rising straight out of the valley (its runs are cut in the shader)
    if (MTN.hill) {
      var Hh = MTN.hill, hx = x - Hh[0], hz = z - Hh[1], hd = Math.sqrt(hx * hx + hz * hz) / Hh[3];
      if (hd < 1) { var hb = Hh[2] * Math.pow(1 - hd * hd, 1.5) * (0.82 + 0.4 * (mtnRidge(x * 0.0045 + 9, z * 0.0045, 4) - 0.35)) * (1 + 0.12 * Math.sin(Math.atan2(hz, hx) * 3 + 1.1)); if (hb > h) h = h + (hb - h) * smooth(0, 40, hb - h); }
    }
    return h;
  }

  // the scanned massif's own detail (desktop): its slopes per uv as a normal-like pair in RG (gu, gv packed as
  // normalize(-gu / 40, -gv / 40, 1)), the luminance of its colour (snow white, bare rock grey) in B
  function mtnHfTex(ctx, hf) {
    var THREE = ctx.THREE;
    var tex = ctx.textures.canvas(1024, 1024, function (g, w, h) {
      var n = hf.width, D = hf.data, sc = n / w, img = hf.colorMap && hf.colorMap.image, C = null;
      if (img) { try { g.drawImage(img, 0, 0, w, h); C = g.getImageData(0, 0, w, h).data; } catch (e) { C = null; } }
      var out = g.createImageData(w, h), o = out.data;
      function at(i, j) { return D[clamp(j, 0, n - 1) * n + clamp(i, 0, n - 1)]; }
      for (var j = 0; j < h; j++) for (var i = 0; i < w; i++) {
        var x = Math.round(i * sc), y = Math.round(j * sc), gu = (at(x + 1, y) - at(x - 1, y)) * n / 2, gv = (at(x, y + 1) - at(x, y - 1)) * n / 2;
        var a = -gu / 40, b = -gv / 40, l = Math.sqrt(a * a + b * b + 1), q = (j * w + i) * 4;
        o[q] = (a / l * 0.5 + 0.5) * 255; o[q + 1] = (b / l * 0.5 + 0.5) * 255; o[q + 2] = C ? (C[q] + C[q + 1] + C[q + 2]) / 3 : 230; o[q + 3] = 255;
      }
      g.putImageData(out, 0, 0);
    }, { linear: true });
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.needsUpdate = true;
    return tex;
  }

  function aspenMountains(ctx, env) {
    var THREE = env.THREE, low = env.low, c = env.centre, i, j, k;
    MTN.c = c; MTN.floor = env.floorY; MTN.low = low; MTN.stamps = []; MTN.hf = null;   // (a second build starts clean)
    // the lap's outline round its middle: for each of NA directions, the farthest the lap reaches near that ray;
    // the mountains' foot lies 140 m beyond it (smoothed round), so the valley floor between is the land's
    var NA = MTN.NA = 180, rin = new Float32Array(NA), pts = [];
    for (var d = 0; d < env.L; d += 6) { var p = env.frameAt(d).pos; pts.push([p.x - c.x, p.z - c.z, p.y]); }
    for (i = 0; i < NA; i++) {
      var th = i / NA * Math.PI * 2, ux = Math.cos(th), uz = Math.sin(th), far = 60;
      for (k = 0; k < pts.length; k++) { var along = pts[k][0] * ux + pts[k][1] * uz, side = Math.abs(pts[k][0] * uz - pts[k][1] * ux); if (along > 0 && side < 170) far = Math.max(far, along + Math.sqrt(Math.max(0, 170 * 170 - side * side)) * 0.35); }
      rin[i] = far + 140;
    }
    var rs = new Float32Array(NA);
    for (var pass = 0; pass < 3; pass++) { for (i = 0; i < NA; i++) { var s = 0; for (k = -3; k <= 3; k++) s = Math.max(s, rin[(i + k + NA) % NA] - Math.abs(k) * 4); rs[i] = s; } rin.set(rs); }
    MTN.rin = rin;
    // the plane the lap leans in (least squares, eased to 0.8): the land's snowfield and the mountains' foot follow it
    var my = 0, sxx = 0, szz = 0, sxz = 0, sxy = 0, szy = 0;
    pts.forEach(function (q) { my += q[2] / pts.length; });
    pts.forEach(function (q) { var dy = q[2] - my; sxx += q[0] * q[0]; szz += q[1] * q[1]; sxz += q[0] * q[1]; sxy += q[0] * dy; szy += q[1] * dy; });
    var det = (sxx * szz - sxz * sxz) || 1;
    MTN.fit = { x: c.x, z: c.z, y: my, b: 0.8 * (sxy * szz - szy * sxz) / det, c: 0.8 * (szy * sxx - sxy * sxz) / det };
    // where things stand: by bearing (degrees clockwise from north; north is -z) and distance from the lap's middle
    function spot(bearing, r) { var b = bearing * Math.PI / 180; return [c.x + Math.sin(b) * r, c.z - Math.cos(b) * r]; }
    // the scanned massif: [bearing, distance, metres a side, height scale (metres), turn]
    var hf = ctx.assets.heightfield && ctx.assets.heightfield('heightfield-massif');
    if (hf && hf.data && hf.width === hf.height && hf.width >= 256) {
      var n = hf.width, f = n / 256, D = new Float32Array(65536);
      for (j = 0; j < 256; j++) for (i = 0; i < 256; i++) { var sm = 0; for (var b2 = 0; b2 < f; b2++) for (var a2 = 0; a2 < f; a2++) sm += hf.data[(j * f + b2) * n + i * f + a2]; D[j * 256 + i] = sm / (f * f); }
      MTN.hf = D;
      [[358, 1180, 1500, 640, 2.6], [248, 1150, 1400, 600, -2.1], [300, 1250, 1200, 470, 0.9], [200, 1250, 1300, 430, 1.4], [30, 1300, 1100, 420, -0.7]].forEach(function (S) {
        var q = spot(S[0], S[1]); MTN.stamps.push([q[0], q[1], S[2], S[3], Math.cos(S[4]), Math.sin(S[4])]);
      });
    }
    // the maroon twin, over the far end of the start straight (east of the lap): [x, z, height, base radius]
    var t0 = spot(81, 1170), t1 = spot(88, 1200);
    MTN.twin = [[t0[0], t0[1], 600, 400, 0.5], [t1[0], t1[1], 565, 380, 0.15]];
    // the ski hill, south-east of the lap (its lap-facing slopes carry the runs): [x, z, height, radius]
    var sh0 = spot(133, 980); MTN.hill = [sh0[0], sh0[1], 400, 520];
    MTN.h = mtnZ;
    MTN.inner = function (x, z) { var dx = x - c.x, dz = z - c.z; return Math.sqrt(dx * dx + dz * dz) - mtnRin(Math.atan2(dz, dx)); };

    // the ring: NAR directions x NR rows from the foot out to r1 (rows closer near the foot)
    var NAR = low ? 220 : 420, NR = low ? 44 : 110, r1 = MTN.r1, fl = env.floorY;
    var pos = new Float32Array((NAR + 1) * (NR + 1) * 3), aM = new Float32Array((NAR + 1) * (NR + 1) * 4), aH = new Float32Array((NAR + 1) * (NR + 1) * 4), out = [0, 0, 0, 0, 0], idx = [];
    for (i = 0; i <= NAR; i++) {
      var th2 = i / NAR * Math.PI * 2, cx = Math.cos(th2), cz = Math.sin(th2), r0 = mtnRin(th2) - 6, lf = mtnLift(th2);
      for (j = 0; j <= NR; j++) {
        var r = r0 + (r1 - r0) * Math.pow(j / NR, 1.35), x = c.x + cx * r, z = c.z + cz * r, h = mtnZ(x, z, out), q2 = (i * (NR + 1) + j);
        pos[q2 * 3] = x; pos[q2 * 3 + 1] = fl + h; pos[q2 * 3 + 2] = z;
        aM[q2 * 4 + 2] = out[0];
        // (trees only on hills standing 40-110 m over their foot: the low ones that meet the land's snowfield are snow)
        aM[q2 * 4 + 3] = smooth(40, 110, h - lf);
        if (j > 0) { aH[q2 * 4] = out[1]; aH[q2 * 4 + 1] = out[2]; aH[q2 * 4 + 2] = out[3]; aH[q2 * 4 + 3] = out[4]; }
      }
    }
    for (i = 0; i < NAR; i++) for (j = 0; j < NR; j++) { var a = i * (NR + 1) + j, b = a + NR + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }   // (wound to face up)
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    // (the seam where the ring closes on itself: the same normals both sides)
    var nor = geo.attributes.normal.array;
    for (j = 0; j <= NR; j++) { var s0 = j * 3, s1 = (NAR * (NR + 1) + j) * 3; for (k = 0; k < 3; k++) { var m = (nor[s0 + k] + nor[s1 + k]) / 2; nor[s0 + k] = nor[s1 + k] = m; } }
    // the sun's shadow, baked: heights on a coarse grid, then from each vertex a march toward the sun
    var G = low ? 96 : 192, ext = r1 + 60, cs = ext * 2 / G, HG = new Float32Array((G + 1) * (G + 1));
    for (j = 0; j <= G; j++) for (i = 0; i <= G; i++) HG[j * (G + 1) + i] = MTN.h(c.x - ext + i * cs, c.z - ext + j * cs);
    function hg(x, z) {
      var u = clamp((x - c.x + ext) / cs, 0, G - 0.001), w = clamp((z - c.z + ext) / cs, 0, G - 0.001), ia = u | 0, ja = w | 0, fu = u - ia, fw = w - ja, o = ja * (G + 1) + ia;
      return (HG[o] * (1 - fu) + HG[o + 1] * fu) * (1 - fw) + (HG[o + G + 1] * (1 - fu) + HG[o + G + 2] * fu) * fw;
    }
    var sd = SUN, hl = Math.hypot(sd[0], sd[2]), mx = sd[0] / hl, mz = sd[2] / hl, tn = sd[1] / hl;
    for (i = 0; i <= NAR; i++) for (j = 0; j <= NR; j++) {
      var q3 = i * (NR + 1) + j, px = pos[q3 * 3], pz = pos[q3 * 3 + 2], h0 = pos[q3 * 3 + 1] - fl + 3, vis = 1;
      for (var st = 12; st < 2400 && vis > 0; st *= 1.16) vis = Math.min(vis, (h0 + st * tn - hg(px + mx * st, pz + mz * st)) / (3 + st * 0.03) + 0.5);
      aM[q3 * 4] = smooth(0, 1, vis);
      // the crests (higher than the rows either side): bare rock; the hollows hold snow
      var hn = 0, cn = 0;
      [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(function (e) { var ii = i + e[0], jj = j + e[1]; if (ii < 0 || ii > NAR || jj < 0 || jj > NR) return; hn += pos[(ii * (NR + 1) + jj) * 3 + 1]; cn++; });
      var spc = Math.max(4, (r1 - r0) / NR);
      aM[q3 * 4 + 1] = cn ? clamp((pos[q3 * 3 + 1] - hn / cn) / spc * 1.6, -0.6, 0.6) : 0;
    }
    geo.setAttribute('aM', new THREE.BufferAttribute(aM, 4));
    var hfT = !low && MTN.hf && hf ? mtnHfTex(ctx, hf) : null;
    if (hfT) geo.setAttribute('aHf', new THREE.BufferAttribute(aH, 4));
    var stp = []; for (i = 0; i < 5; i++) { var S2 = MTN.stamps[i]; stp.push(S2 ? new THREE.Vector3(S2[4], S2[5], S2[3] / S2[2]) : new THREE.Vector3(1, 0, 0)); }
    var U = aspenSkyUniforms(THREE), mat = new THREE.ShaderMaterial({
      uniforms: Object.assign({}, U, { uMtnC: { value: new THREE.Vector2(c.x, c.z) }, uMtnFl: { value: fl }, uMtnAmb: { value: new THREE.Vector3(0.23, 0.29, 0.41) }, uMtnSunK: { value: 0.66 }, uMtnSki: { value: new THREE.Vector2(MTN.ski[0], MTN.ski[1]) }, uMtnHill: { value: new THREE.Vector3(MTN.hill[0], MTN.hill[1], MTN.hill[3]) }, uHfT: { value: hfT }, uStp: { value: stp } }),
      defines: low ? { MTN_LOW: 1 } : hfT ? { MTN_HF: 1 } : {},
      vertexShader: 'attribute vec4 aM; varying vec4 vM; varying vec3 vP; varying vec3 vN;\n#ifdef MTN_HF\nattribute vec4 aHf; varying vec4 vHf;\n#endif\nvoid main() { vM = aM;\n#ifdef MTN_HF\n vHf = aHf;\n#endif\n vec4 w = modelMatrix*vec4(position, 1.0); vP = w.xyz; vN = normal; gl_Position = projectionMatrix*viewMatrix*w; }',
      fragmentShader: ASPEN_SKY.GLSL + [
        'uniform vec2 uMtnC, uMtnSki; uniform vec3 uMtnHill; uniform float uMtnFl, uMtnSunK; uniform vec3 uMtnAmb; varying vec4 vM; varying vec3 vP; varying vec3 vN;',
        '#ifdef MTN_HF',
        'uniform sampler2D uHfT; uniform vec3 uStp[5]; varying vec4 vHf;',
        '#endif',
        'void main() {',
        '  vec3 n = normalize(vN), n0 = n; float dist = distance(vP, cameraPosition), y = vP.y-uMtnFl, scanRk = -1.0, scanW = 0.0;',
        // (the scanned massif's own slopes and rock at 1.5 m: its gullies and ribs, far finer than the ring's grid)
        '#ifdef MTN_HF',
        '  if (vHf.z > 0.01) { vec4 hq = texture2D(uHfT, vec2(vHf.x, 1.0-vHf.y)); vec2 nq = hq.xy*2.0-1.0; vec2 gq = -nq/sqrt(max(1.0-dot(nq, nq), 0.02))*40.0;',
        '    vec3 sd = uStp[int(clamp(vHf.w+0.5, 0.0, 4.0))]; float gx = sd.z*(gq.x*sd.x-gq.y*sd.y), gz = sd.z*(-gq.x*sd.y-gq.y*sd.x);',
        '    vec3 hn = normalize(vec3(-gx, 1.0, -gz)); n = normalize(mix(n, hn, vHf.z*0.85)); n0 = n; scanRk = smoothstep(0.78, 0.58, hq.b)*vHf.z; scanW = vHf.z; }',
        '#endif',
        '#ifdef MTN_LOW',
        '  float fN = aspN(vP.xz*0.018+vP.y*0.01)*0.65+aspN(vP.xz*0.06)*0.35;',
        '#else',
        '  float fN = aspF(vP.xz*0.018+vP.y*0.01);',
        '  { vec3 dx = dFdx(vP), dy = dFdy(vP); float hd = (aspF(vP.xz*0.035+vec2(3.0, 1.0))-0.5)*16.0+(aspN(vP.xz*0.14)-0.5)*3.0*(1.0-smoothstep(500.0, 1100.0, dist)); float hx = dFdx(hd), hy = dFdy(hd);',
        '    vec3 r1 = cross(dy, n), r2 = cross(n, dx); float det = dot(dx, r1); vec3 bb = abs(det)*n-sign(det)*(hx*r1+hy*r2); if (dot(bb, bb) > 1e-20) n = normalize(mix(n, normalize(bb), 0.6)); }',
        '#endif',
        // the treeline (spruce up the lower slopes, ragged), the steep and the crests bare rock, snow on the rest
        '  vec2 rc = vP.xz-uMtnC; float brg = mod(degrees(atan(rc.x, -rc.y))+360.0, 360.0);',
        // (the ski hill: forested nearly to the top, runs cut down the forest, white ribbons down the fall line, and a cat track across)
        '  float sk = smoothstep(uMtnSki.x, uMtnSki.x+4.0, brg)*(1.0-smoothstep(uMtnSki.y-4.0, uMtnSki.y, brg));',
        '  float tl = 150.0+70.0*aspN(vP.xz*0.004)+30.0*(fN-0.5)+220.0*sk;',
        '  float tree = (1.0-smoothstep(tl-30.0, tl+10.0, y))*smoothstep(0.5, 0.66, n0.y+(fN-0.5)*0.3)*vM.w*(1.0-vM.z);',
        // (the runs fan out from the hill's summit down its lap-facing face, each its own width, some ending in the
        // trees; two cat tracks traverse; the summit is cleared)
        '  vec2 hp = vP.xz-uMtnHill.xy; float hr = length(hp)/uMtnHill.z;',
        '  if (sk > 0.0 && hr < 1.0) { float ha = degrees(atan(hp.x, -hp.y)), face = smoothstep(0.1, 0.4, dot(normalize(hp), normalize(uMtnC-uMtnHill.xy)));',
        '    float u = ha/9.0+(aspN(vec2(hr*3.0, ha*0.04))-0.5)*1.3+(aspN(vec2(hr*11.0, ha*0.2))-0.5)*0.25; vec2 ri = vec2(floor(u), 0.0); float w = 0.08+0.16*aspH(ri+7.0);',
        '    float run = (1.0-smoothstep(w, w+0.05, abs(fract(u)-0.5)))*step(0.28, aspH(ri+3.0))*smoothstep(0.08, 0.14, hr-0.25*aspH(ri+9.0))*(1.0-smoothstep(0.62, 0.8, hr-0.2*aspH(ri+5.0)));',
        '    float cat = (1.0-smoothstep(0.006, 0.012, abs(hr-0.5-0.06*sin(ha*0.11))))*step(0.45, aspN(vec2(ha*0.06, 2.0)));',
        '    tree *= 1.0-max(max(run, min(cat, 1.0)*0.9)*face, 1.0-smoothstep(0.06, 0.1, hr))*sk; }',
        '  float streak = aspN(vec2((vP.x+vP.z)*0.03, vP.y*0.005))*0.6+aspN(vec2((vP.x-vP.z)*0.06, vP.y*0.012))*0.4;',
        '  float rk = smoothstep(0.58, 0.76, (1.0-n0.y)*1.3+vM.y*0.7+(fN-0.5)*0.2+(streak-0.5)*0.55);',
        '  if (scanRk >= 0.0) rk = mix(rk, max(scanRk, smoothstep(0.62, 0.8, (1.0-n0.y)*1.3+(streak-0.5)*0.3)), smoothstep(0.0, 0.5, scanW));',
        // (the maroon twin: maroon mudstone in diagonal beds, snow lying on the ledges between them)
        '  float bed = fract((vP.y+dot(vP.xz, vec2(0.62, -0.35))+(fN-0.5)*40.0)/46.0);',
        '  float ledge = vM.z*smoothstep(0.7, 0.86, bed)*smoothstep(0.35, 0.6, n0.y+(aspN(vP.xz*0.05)-0.5)*0.4);',
        '  rk = max(rk, vM.z*smoothstep(0.82, 0.55, n0.y+(fN-0.5)*0.3))*(1.0-ledge);',
        '  vec3 snowC = vec3(0.84, 0.88, 0.94)*(0.94+0.08*fN);',
        '  vec3 rockC = vec3(0.1, 0.105, 0.12)*(0.75+0.6*aspN(vec2(dot(vP.xz, vec2(0.8, 0.6))*0.03, vP.y*0.07)));',
        '  rockC = mix(rockC, vec3(0.27, 0.075, 0.055)*(0.75+0.5*aspN(vec2(bed*4.0, vP.y*0.04))+0.25*smoothstep(0.3, 0.0, bed)), vM.z);',
        '  float clump = aspN(vP.xz*0.11)*0.6+aspN(vP.xz*0.37)*0.4;',
        '  vec3 treeC = mix(vec3(0.014, 0.03, 0.026)*(0.7+0.6*clump), snowC*0.8, 0.06+0.3*smoothstep(0.62, 0.85, clump));',
        '  vec3 alb = mix(mix(snowC, rockC, rk), treeC, tree*(1.0-rk*0.5));',
        // the light: the low sun (its shadow baked: the ranges shade each other) and the sky's blue in the shade
        '  float sh = vM.x, nl = max(dot(n, uAspSun), 0.0);',
        '  vec3 amb = uMtnAmb*(0.62+0.38*n.y)*(1.0-0.35*rk);',
        '  vec3 col = alb*(uAspSunC*uMtnSunK*nl*sh+amb);',
        '  col = aspAir(col, vP);',
        '  gl_FragColor = vec4(col, 1.0);',
        '}'].join('\n'),
      fog: false,
    });
    var ring = new THREE.Mesh(geo, mat);
    ring.frustumCulled = false; ring.userData.noReflection = true;
    env.scenery.add(env.named('mountains', ring));


    // the far silhouettes: two rings of hazy ranges round the camera, at the far plane (behind everything)
    var NS = low ? 240 : 600, sp = [], suv = [], sidx = [];
    // (the farther, taller, paler ring first: nothing here writes depth, so the nearer is drawn over it)
    [[1.0, 3.7, 210, 1], [0.97, 0.0, 150, 0]].forEach(function (Lr) { var li = Lr[3];
      var b0 = sp.length / 3;
      for (var e = 0; e <= NS; e++) {
        var an2 = e / NS * Math.PI * 2, ax2 = Math.cos(an2), az2 = Math.sin(an2);
        var rr = mtnRidge(ax2 * 3.4 + Lr[1], az2 * 3.4 - Lr[1], 5), hh = -40 + Lr[2] * rr * rr * 1.7 * (0.55 + 0.45 * mtnN(ax2 * 1.3 + li, az2 * 1.3));
        sp.push(ax2 * Lr[0], -0.3, az2 * Lr[0], ax2 * Lr[0], hh / 1650, az2 * Lr[0]); suv.push(li, 0, li, 1);
        if (e < NS) { var o2 = b0 + e * 2; sidx.push(o2, o2 + 2, o2 + 1, o2 + 1, o2 + 2, o2 + 3); }
      }
    });
    var sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3)); sg.setAttribute('uv', new THREE.Float32BufferAttribute(suv, 2)); sg.setIndex(sidx);
    var smat = new THREE.ShaderMaterial({
      uniforms: U, side: THREE.DoubleSide, fog: false, depthWrite: false,
      vertexShader: 'varying vec3 vD; varying vec2 vUv; void main() { vUv = uv; vD = position; vec4 c = projectionMatrix*viewMatrix*vec4(cameraPosition+position*1650.0, 1.0); gl_Position = c; gl_Position.z = c.w*0.99997; }',
      fragmentShader: ASPEN_SKY.GLSL + [
        'varying vec3 vD; varying vec2 vUv;',
        'void main() {',
        '  vec3 d = normalize(vD); vec3 hz = aspSky(normalize(vec3(d.x, 0.02, d.z)));',
        // (hazy blue ranges, their snowy tops a touch brighter on the sun's side, fading up into the sky)
        '  float lit = 0.5+0.5*dot(normalize(d.xz), normalize(uAspSun.xz));',
        '  vec3 c = mix(hz*mix(0.8, 0.86, vUv.x), hz*(0.95+0.12*lit), smoothstep(0.0, 0.08, vD.y));',
        '  gl_FragColor = vec4(c, 1.0);',
        '}'].join('\n'),
    });
    var sil = new THREE.Mesh(sg, smat);
    sil.frustumCulled = false; sil.renderOrder = -999; sil.userData.noReflection = true; sil.userData.gmKart = true; sil.name = 'mountains-far';
    env.scene.add(sil);

  }

  /* ------------------------------------------- the snow and the road -- */
  // (owned by the LAND agent) The ground that meets a rollercoaster road, all of it worked out from the lap itself
  // (track.frameAt, COURSE.breaks and their kind, ZONE), so it follows the track whatever the track agent does to it:
  // - the terrain: a height field round the whole lap. Next to the road it is the road's own height (a smooth blend
  //   of every piece of road near, so two legs of a hairpin meet in one slope), farther out a snowfield tilted the
  //   way the lap climbs (mountains.js MTN.fit, carried no farther than the mountains' foot) and drawn part way to the
  //   road near it, rising toward the mountains. Where the road climbs through it, steep cuttings (~50 degrees, rock
  //   ribs and snow couloirs where over 60); where it drops, embankments. A coarse ring carries it to 1.8 km.
  // - the road (groomed snow, corduroy), blue dye lines, red/white kerbs in the drift bends, pale snow verges, the
  //   snow banks where the kart walls are (env.wall), red/white race padding on the outside of the hairpins and at
  //   the gap lips, and fall-line slalom flags (red and blue panels on poles) down every drop of 20% or more;
  // - a chasm under each full break, cut through the snowfield, by the course's own `kind` (COURSE.breaks[q].kind):
  //   'crevasse' deep blue ice, 'icefall' a crevasse with a frozen creek pouring over its uphill end, 'ravine' a deep
  //   snowy ravine opening wider away from the road, 'cliff' a drop-off (THE CORNICE): a rock face with snow on its
  //   ledges, a short snow apron up to the lower road. Every wall goes down to one floor under the LOWER lip, so a
  //   drop-off (landing 5 m or more lower) has a tall near wall, and its take-off lip carries a big overhanging
  //   snow cornice right across the road. The breaks' look is 'none': this is the whole picture.
  // - firs (branch cards near the road, crossed cards farther), white-trunk winter aspens in the Esses and the
  //   Switchbacks, snow-capped rocks in the cuttings and at the chasm rims; none in a chasm or a crowd (env.crowdAt).
  // Phones (env.low): coarser ground, fewer and lighter trees, no tree shadows, one texture (texture-snow).
  ['texture-snow', 'texture-dark-rock', 'texture-fir-cards'].forEach(function (id) { if (ASSETS.indexOf(id) < 0) ASSETS.push(id); });
  if (LOW_ASSETS.indexOf('texture-snow') < 0) LOW_ASSETS.push('texture-snow');
  // GLSL: hash, value noise, fbm; the sun's shadow here (lit materials)
  var LAND_GLSL = [
    'float ldH(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }',
    'float ldN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(ldH(i), ldH(i + vec2(1, 0)), f.x), mix(ldH(i + vec2(0, 1)), ldH(i + vec2(1, 1)), f.x), f.y); }',
    'float ldF(vec2 p) { return ldN(p) * 0.5 + ldN(p * 2.03 + 7.1) * 0.25 + ldN(p * 4.11 - 3.7) * 0.125; }',
  ].join('\n');
  // (value noise 0..1: mountains.js's mtnN)
  function aspenLandN(x, z) { return 0.5 + 0.5 * mtnN(x, z); }
  function aspenLandF(x, z) { return aspenLandN(x, z) * 0.5 + aspenLandN(x * 2.03 + 7.1, z * 2.03 - 3.3) * 0.25 + aspenLandN(x * 4.1 - 2.2, z * 4.1 + 5.5) * 0.125; }
  // a material's shader extended (chained after any onBeforeCompile it has, e.g. a library surface's)
  function aspenLandWrap(THREE, m, key, fn) {
    var prev = m.onBeforeCompile, base = m.customProgramCacheKey, proto = THREE.Material.prototype.customProgramCacheKey;
    m.onBeforeCompile = function (sh, r) { if (prev) prev.call(this, sh, r); fn(sh); };
    m.customProgramCacheKey = function () { return key + '|' + (base === proto ? (prev ? prev.toString() : '') : base.call(m)); };
    m.needsUpdate = true;
    return m;
  }
  // a shader's vertex stage given declarations and code after the world position; its fragment stage, the
  // declarations and the noise before main(), returned for further replaces
  function aspenLandSh(sh, vDecl, vCode, fDecl) {
    sh.vertexShader = vDecl + '\n' + sh.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n' + vCode);
    return sh.fragmentShader.replace('void main() {', fDecl + LAND_GLSL + '\nvoid main() {');
  }
  // a buffer of triangles (position, colour) filled piece by piece, then one mesh
  function aspenLandAcc() {
    // (d: for the ice, metres below the chasm's lip, or -1 for ice that is not a wall: icicles, the creek)
    var A = { p: [], c: [], i: [], s: [], d: [], k: [], soft: 1 };
    // a grid of points nI+1 by nK+1 from fn(i, k, out[x, y, z, r, g, b, d, cap]); faced toward want(x, y, z) -> [dx, dy, dz]
    // (cap: for the ice, metres more of snow cap under the lip)
    // one vertex: position, colour, and for the ice its depth below the lip and its snow cap
    A.v = function (x, y, z, r, g, b, d, k) { A.p.push(x, y, z); A.c.push(r, g, b); A.s.push(A.soft); A.d.push(d); A.k.push(k); };
    A.sheet = function (nI, nK, fn, want) {
      var o = A.p.length / 3, q = [0, 0, 0, 1, 1, 1, -1, 0], i, k, i0 = A.i.length;
      for (i = 0; i <= nI; i++) for (k = 0; k <= nK; k++) { q[3] = q[4] = q[5] = 1; q[6] = -1; q[7] = 0; fn(i, k, q); A.v(q[0], q[1], q[2], q[3], q[4], q[5], q[6], q[7]); }
      for (i = 0; i < nI; i++) for (k = 0; k < nK; k++) { var a = o + i * (nK + 1) + k, b = a + nK + 1; A.i.push(a, b, a + 1, a + 1, b, b + 1); }
      if (want && A.i.length > i0) {
        // (the facing of the sheet's triangles, area-weighted, against the way it should face; flipped as a whole if
        // wrong: one triangle alone can be edge-on, e.g. a cornice's hanging lip)
        var P = A.p, d = 0;
        for (var t = i0; t < A.i.length; t += 3) {
          var a3 = A.i[t] * 3, b3 = A.i[t + 1] * 3, c3 = A.i[t + 2] * 3;
          var ux = P[b3] - P[a3], uy = P[b3 + 1] - P[a3 + 1], uz = P[b3 + 2] - P[a3 + 2], vx = P[c3] - P[a3], vy = P[c3 + 1] - P[a3 + 1], vz = P[c3 + 2] - P[a3 + 2];
          var w = want(P[a3], P[a3 + 1], P[a3 + 2]), wl = Math.hypot(w[0], w[1], w[2]) || 1;
          d += ((uy * vz - uz * vy) * w[0] + (uz * vx - ux * vz) * w[1] + (ux * vy - uy * vx) * w[2]) / wl;
        }
        if (d < 0) aspenLandFlip(A.i, i0);
      }
    };
    // a geometry's triangles (from env.band, facing up) in white
    A.put = function (g) {
      var o = A.p.length / 3, p = g.attributes.position.array, ix = g.index.array;
      for (var j = 0; j < p.length; j += 3) A.v(p[j], p[j + 1], p[j + 2], 1, 1, 1, -1, 0);
      for (j = 0; j < ix.length; j++) A.i.push(ix[j] + o);
      g.dispose();
    };
    // an icicle: a four-sided spike hanging from (x, y, z), r across at the top, h long, colour c
    A.spike = function (x, y, z, r, h, c) {
      var o = A.p.length / 3, P = [x - r, y, z, x, y, z - r, x + r, y, z, x, y, z + r, x, y - h, z];
      for (var n = 0; n < 5; n++) { var k = n < 4 ? 1 : 0.8; A.v(P[n * 3], P[n * 3 + 1], P[n * 3 + 2], c[0] * k, c[1] * k, c[2] * k, -1, 0); }
      for (n = 0; n < 4; n++) A.i.push(o + n, o + (n + 1) % 4, o + 4);
    };
    A.geo = function (THREE) {
      var at = { position: [A.p, 3], color: [A.c, 3], aLdSoft: [A.s, 1] };
      if (A.dep) { at.aLdDep = [A.d, 1]; at.aLdCap = [A.k, 1]; }
      var g = aspenLandGeo(THREE, at, A.i); g.computeVertexNormals(); g.computeBoundingSphere();
      return g;
    };
    return A;
  }
  // a geometry from { name: [array, itemSize] } and an index
  function aspenLandGeo(THREE, at, ix) {
    var g = new THREE.BufferGeometry();
    for (var n in at) g.setAttribute(n, new THREE.Float32BufferAttribute(at[n][0], at[n][1]));
    if (ix) g.setIndex(ix);
    return g;
  }
  // triangles turned over (from triangle i0 on); a triangle list's first triangle facing up (+) or down (-) in xz
  function aspenLandFlip(I, i0) { for (var j = i0 || 0; j < I.length; j += 3) { var s = I[j + 1]; I[j + 1] = I[j + 2]; I[j + 2] = s; } }
  function aspenLandFace(P, I) { var a = I[0] * 3, b = I[1] * 3, c = I[2] * 3; return (P[b + 2] - P[a + 2]) * (P[c] - P[a]) - (P[b] - P[a]) * (P[c + 2] - P[a + 2]); }

  function aspenLand(ctx, env) {
    var THREE = env.THREE, low = env.low, hw = env.hw, wall = env.wall, L = env.L, track = env.track, i, j, k;
    var R = aspenRng(4711), TAU = Math.PI * 2;

    /* -- the road's line, sampled, and the ground worked out from it -- */
    var NS = Math.ceil(L / 3), SX = new Float32Array(NS), SY = new Float32Array(NS), SZ = new Float32Array(NS);
    var bx0 = 1e9, bx1 = -1e9, bz0 = 1e9, bz1 = -1e9;
    for (i = 0; i < NS; i++) {
      var f0 = track.frameAt(i * L / NS); SX[i] = f0.pos.x; SY[i] = f0.pos.y; SZ[i] = f0.pos.z;
      bx0 = Math.min(bx0, SX[i]); bx1 = Math.max(bx1, SX[i]); bz0 = Math.min(bz0, SZ[i]); bz1 = Math.max(bz1, SZ[i]);
    }
    // a shelf at the road's height beside the village (the lodge and chalets stand on it), eased in and out
    var FLAT = new Float32Array(NS);
    for (i = 0; i < NS; i++) { var fs = 0; for (j = -8; j <= 8; j++) fs += zoneAt(env.wrap((i + j) * L / NS), 'village') ? 1 : 0; FLAT[i] = 26 * fs / 17; }
    // the plane the lap leans in (mountains.js MTN.fit), for the snowfields round it
    var FIT = MTN.fit;
    // PR: the nearest road (distance d, its sample s) and the road's height blended from every piece near (y)
    var PR = { d: 0, y: 0, s: 0, ry: 0 };
    function probe(x, z) {
      var sw = 0, sy = 0, dm = 1e12, im = 0;
      for (var q = 0; q < NS; q++) {
        var dx = SX[q] - x, dz = SZ[q] - z, d2 = dx * dx + dz * dz;
        if (d2 < dm) { dm = d2; im = q; }
        if (d2 > 48400) continue;
        var e = Math.max(0, Math.sqrt(d2) - wall), w = 1 / ((e * e + 9) * (e * e + 9));
        sw += w; sy += w * SY[q];
      }
      PR.d = Math.sqrt(dm); PR.s = im; PR.y = sw > 0 ? sy / sw : SY[im]; PR.ry = SY[im];
      // (the road's own height where the point is square to it: the samples are 3 m apart, and on a 45% grade that is
      // over a metre)
      for (var e2 = -1; e2 <= 1; e2 += 2) {
        var j2 = (im + e2 + NS) % NS, ax = SX[im], az = SZ[im], bx = SX[j2], bz = SZ[j2], ux = bx - ax, uz = bz - az, t = ((x - ax) * ux + (z - az) * uz) / (ux * ux + uz * uz || 1);
        if (t > 0 && t < 1) { var px = ax + ux * t - x, pz = az + uz * t - z, dd = Math.sqrt(px * px + pz * pz); if (dd <= PR.d) { PR.d = dd; PR.ry = SY[im] + (SY[j2] - SY[im]) * t; } }
      }
      return PR;
    }
    // the snowfield without the road: the lap's lean (carried no farther than the mountains' foot, where they stand
    // on it), drawn 40% of the way to the road near it (PR: so a lap 100 m high cuts no 50 m canyons), broad swells,
    // and a rise toward the mountains far out
    function natH(x, z, dm) {
      var dx = x - FIT.x, dz = z - FIT.z, mi = MTN.inner(x, z), p = (FIT.b * dx + FIT.c * dz) * Math.min(1, 1 - mi / (Math.hypot(dx, dz) || 1));
      var n = FIT.y + p + 0.4 * (PR.y - FIT.y - p) * (1 - smooth(60, 250, dm)) + (aspenLandF(x * 0.007, z * 0.007) - 0.44) * 22 +
        (aspenLandN(x * 0.03 + 5, z * 0.03) - 0.5) * 4 + 70 * smooth(90, 700, dm);
      return mi > -12 ? aspenLandDrape(x, z, n) : n;
    }
    // past the mountains' foot their foothills rise through the snowfield: where one only just breaks the surface it
    // showed as a dark puddle on the snow, so the snow is laid over the low ones (the highest of five points round
    // here, as the ring's points are tens of metres apart) and banked up a little round the ones that stand clear
    function aspenLandDrape(x, z, n) {
      var m = -1e9;
      for (var q = 0; q < 5; q++) { var ox = q === 1 ? 14 : q === 2 ? -14 : 0, oz = q === 3 ? 14 : q === 4 ? -14 : 0; m = Math.max(m, MTN.h(x + ox, z + oz)); }
      var dl = env.floorY + m - n;
      return dl <= -1.5 ? n : n + (dl + 1.5) * (1 - smooth(8, 26, dl));
    }
    // the ground (cut down to the road near it): the road's height out to the foot of the bank, then a slope to the
    // snowfield, wider the farther it has to climb or fall (steep: about 50 degrees on average, rock where over 60)
    function groundH(x, z) {
      probe(x, z);
      var n = natH(x, z, PR.d), r = PR.y, w = 7 + 0.8 * Math.abs(n - r), fl = FLAT[PR.s];
      return lerp(r, n, smooth(wall + 2.6 + fl, wall + 2.6 + fl + w, PR.d));
    }
    // the ground as drawn: under the road well down; under the verges just below them; behind the bank never higher
    // than a slope rising from its foot (so no cell of the grid pokes up through the verge or round the bank)
    function groundY(x, z) {
      var h = groundH(x, z), rn = PR.ry, dm = PR.d;
      if (dm < hw - 1) return Math.min(h, rn) - 2.5;
      if (dm < wall + 1.2) return Math.min(h, rn) - 0.35;
      return dm < wall + 14 ? Math.min(h, rn - 0.35 + (dm - wall - 1.2) * 1.25) : h;
    }

    /* -- the chasms under the breaks (in the break's own frame: u along the road from its near edge, v across) -- */
    // (the kind is the course's own: COURSE.breaks[q].kind, 'cliff' | 'crevasse' | 'icefall' | 'ravine'; without one, a
    // cliff where the road lands 5 m or more lower than it took off, else a crevasse)
    var CH = env.BRK.filter(function (B) { return B.full && !B.water; }).map(function (B, n) {
      // (len: how far the far edge is along the ground, not along a steep road)
      var f = track.frameAt(env.wrap(B.d0)), f1 = track.frameAt(env.wrap(B.d1)), T = new THREE.Vector2(f.tan.x, f.tan.z).normalize(), Rr = new THREE.Vector2(-T.y, T.x);
      var len = Math.max(2, (f1.pos.x - f.pos.x) * T.x + (f1.pos.z - f.pos.z) * T.y);
      // (per kind: reach out either side, depth (under the lower lip), widening away from the road, zigzag, walls
      // closing toward the floor)
      var KPS = { ravine: [62, 28, 0.9, 0.15, 0.95], icefall: [42, 24, 0.3, 0.4, 0.9], crevasse: [36, 30, 0.4, 0.4, 0.9], cliff: [30, 2.5, 0.35, 0.3, 0.12] };
      var kind = env.COURSE.breaks[env.BRK.indexOf(B)].kind;
      if (!KPS[kind]) kind = f.pos.y - f1.pos.y < 5 ? 'crevasse' : 'cliff';
      var KP = KPS[kind];
      var C = { B: B, kind: kind, len: len, drop: f.pos.y - f1.pos.y, O: f.pos.clone(), T: T, Rr: Rr, seed: 3.1 + n * 7.7, ice: kind === 'crevasse' || kind === 'icefall', XL: [KP[0], KP[0]], depth: KP[1], grow: KP[2], zig: KP[3], pinch: KP[4], blunt: -1 };
      if (kind === 'icefall') {
        // the creek comes down the uphill side and pours into the crack just past the corridor
        var up = natH(C.O.x + Rr.x * 40, C.O.z + Rr.y * 40, 0) > natH(C.O.x - Rr.x * 40, C.O.z - Rr.y * 40, 0) ? 1 : 0;
        C.blunt = up; C.XL[up] = wall + 5;
      }
      // (each side stops short of any other piece of road it would run into)
      [0, 1].forEach(function (sd) {
        if (sd === C.blunt) return;
        var sg = sd ? 1 : -1, half = len / 2 * (1 + C.grow) + 4;
        for (var t = wall + 2; t <= C.XL[sd]; t += 2) {
          for (var u = -half + len / 2; u <= len / 2 + half; u += half) {
            var x = C.O.x + T.x * u + Rr.x * t * sg, z = C.O.z + T.y * u + Rr.y * t * sg;
            probe(x, z); var dd = lapGap(PR.s * L / NS - B.d0);
            if (dd > 50 && PR.d < wall + 10) { C.XL[sd] = Math.max(wall + 6, t - 8); return; }
          }
        }
      });
      return C;
    });
    function chUV(C, x, z) { var dx = x - C.O.x, dz = z - C.O.z; return [dx * C.T.x + dz * C.T.y, dx * C.Rr.x + dz * C.Rr.y]; }
    function chXZ(C, u, v) { return [C.O.x + C.T.x * u + C.Rr.x * v, C.O.z + C.T.y * u + C.Rr.y * v]; }
    function chSide(v) { return v < 0 ? 0 : 1; }
    function chTaper(C, v) { var t = Math.abs(v), s = chSide(v); if (t <= wall + 1 || s === C.blunt) return 1; return Math.sqrt(Math.max(0, 1 - Math.pow(Math.max(0, t - wall - 1) / (C.XL[s] - wall - 1), 2.5))); }
    function chA(C, v) {   // half its length along the road at v
      var t = Math.abs(v);
      if (t <= wall + 1) return C.len / 2;
      return C.len / 2 * (1 + C.grow * smooth(wall + 1, 50, t)) * chTaper(C, v) * (1 + C.zig * (aspenLandN(t * 0.3 + C.seed, C.seed * 3) - 0.5) * smooth(wall + 1, wall + 7, t));
    }
    function chC(C, v) { return C.len / 2 + (aspenLandN(v * 0.05 + C.seed, 1.7) - 0.5) * 10 * smooth(wall + 1, 35, Math.abs(v)); }
    function chDepth(C, v) { return C.depth * (0.3 + 0.7 * Math.sqrt(chTaper(C, v))); }
    function inChasm(x, z, m) {
      for (var q = 0; q < CH.length; q++) {
        var C = CH[q], uv = chUV(C, x, z);
        if (uv[1] < -C.XL[0] - m || uv[1] > C.XL[1] + m || uv[0] < -C.len * 3 - m || uv[0] > C.len * 4 + m) continue;
        if (Math.abs(uv[0] - chC(C, uv[1])) < chA(C, uv[1]) + m) return C;
      }
      return null;
    }
    // the lip's height: the road's in the corridor, the ground's beyond
    function chLip(C, u, v) {
      var xz = chXZ(C, u, v), g = groundY(xz[0], xz[1]), r = track.frameAt(env.wrap(C.B.d0 + clamp(u / C.len, 0, 1) * (C.B.d1 - C.B.d0))).pos.y;
      return lerp(r, g, smooth(wall + 0.8, wall + 3, Math.abs(v)));
    }

    /* -- the terrain: one grid round the lap, cut open over the chasms; a ring of coarse ground beyond -- */
    var ST = low ? 7 : 4, MG = 104, gx0 = Math.floor((bx0 - MG) / ST) * ST, gz0 = Math.floor((bz0 - MG) / ST) * ST;
    var NX = Math.ceil((bx1 + MG - gx0) / ST / 4) * 4, NZ = Math.ceil((bz1 + MG - gz0) / ST / 4) * 4, NV = (NX + 1) * (NZ + 1);
    var GH = new Float32Array(NV), GD = new Float32Array(NV), GS = new Int32Array(NV), GY = new Float32Array(NV), CUT = new Uint8Array(NV);
    var tpos = new Float32Array(NV * 3);
    for (j = 0; j <= NZ; j++) for (i = 0; i <= NX; i++) {
      var q = j * (NX + 1) + i, x = gx0 + i * ST, z = gz0 + j * ST, h = groundY(x, z);
      GH[q] = h; GD[q] = PR.d; GS[q] = PR.s; GY[q] = h;
      CUT[q] = inChasm(x, z, 0.25) ? 1 : 0;
      tpos[q * 3] = x; tpos[q * 3 + 1] = GY[q]; tpos[q * 3 + 2] = z;
    }
    // (no cell of the grid may poke up through the verge between its corners: wherever a cell covers a point of the
    // verge or the bank's toe, the triangle there has to pass under it. The corners come down: those under the verge
    // (hidden) first, else all three; twice round, as a corner lowered for one cell can be needed by the next)
    (function () {
      var VG = wall + 0.4, NEAR = VG + ST * 1.5, NQ = low ? 3 : 4, k;
      function under(x, z, lim) {   // the triangle of the grid at (x, z) brought under lim there
        var T = gTri(x, z); if (!T) return;
        var V = T[0], W = T[1];
        if (CUT[V[0]] || CUT[V[1]] || CUT[V[2]]) return;
        var ex = gSum(T) - lim;
        if (ex <= 0) return;
        var wi = 0; for (k = 0; k < 3; k++) if (GD[V[k]] <= VG) wi += W[k];
        for (k = 0; k < 3; k++) {
          var dn = wi >= 0.3 ? (GD[V[k]] <= VG ? ex / wi : 0) : ex;
          if (dn > 0) { GY[V[k]] -= dn; GH[V[k]] = GY[V[k]]; tpos[V[k] * 3 + 1] = GY[V[k]]; }
        }
      }
      // (a lattice over every cell near the road, then along the very lines that matter: across the verge and the
      // bank's toe, every 0.6-0.8 m round the lap)
      var LATS = [hw + 0.5, hw + 2, wall - 1.2, wall - 0.5, wall - 0.12, wall + 0.25], stp = low ? 0.6 : 0.8;
      var inBrk = function (d) { return env.BRK.some(function (B) { return B.full && env.inside(d, B.d0 - 0.5, B.d1 + 0.5); }); };
      for (var pass = 0; pass < 2; pass++) {
        for (var cj = 0; cj < NZ; cj++) for (var ci = 0; ci < NX; ci++) {
          var a = cj * (NX + 1) + ci;
          if (Math.min(GD[a], GD[a + 1], GD[a + NX + 1], GD[a + NX + 2]) > NEAR) continue;
          for (var su = 0; su <= NQ; su++) for (var sw = 0; sw <= NQ; sw++) {
            var x = gx0 + (ci + su / NQ) * ST, z = gz0 + (cj + sw / NQ) * ST;
            probe(x, z); if (PR.d <= VG) under(x, z, PR.ry - 0.12);
          }
        }
        for (var dd = 0; dd < L; dd += stp) {
          if (inBrk(dd)) continue;
          var f = track.frameAt(dd);
          for (var sd = -1; sd <= 1; sd += 2) for (var li = 0; li < LATS.length; li++) {
            var lt = LATS[li] * sd; under(f.pos.x + f.right.x * lt, f.pos.z + f.right.z * lt, f.pos.y + f.right.y * lt - 0.12);
          }
        }
      }
    })();
    // the ground as drawn: the very triangles of the grid (outside it, worked out), for what has to sit on it
    function gDraw(x, z) { var T = gTri(x, z); return T ? gSum(T) : groundY(x, z); }
    // the grid's triangle at (x, z): [its corners, their weights], or null outside the grid; its height there
    function gTri(x, z) {
      var u = (x - gx0) / ST, w = (z - gz0) / ST;
      if (u < 0 || w < 0 || u >= NX || w >= NZ) return null;
      var ci = Math.floor(u), cj = Math.floor(w), fu = u - ci, fw = w - cj, a = cj * (NX + 1) + ci, b = a + 1, c = a + NX + 1, d = c + 1;
      return fu + fw <= 1 ? [[a, b, c], [1 - fu - fw, fu, fw]] : [[b, c, d], [1 - fw, 1 - fu, fu + fw - 1]];
    }
    function gSum(T) { var V = T[0], W = T[1]; return W[0] * GY[V[0]] + W[1] * GY[V[1]] + W[2] * GY[V[2]]; }
    // the ground at any point (bilinear in the grid; outside it, worked out)
    function gAt(x, z, A) {
      var u = (x - gx0) / ST, w = (z - gz0) / ST;
      if (u < 0 || w < 0 || u >= NX || w >= NZ) return A === GH ? groundH(x, z) : A === GD ? probe(x, z).d : 0;
      var a = Math.floor(u), b = Math.floor(w), fu = u - a, fw = w - b, q0 = b * (NX + 1) + a;
      return (A[q0] * (1 - fu) + A[q0 + 1] * fu) * (1 - fw) + (A[q0 + NX + 1] * (1 - fu) + A[q0 + NX + 2] * fu) * fw;
    }
    function gNear(x, z) { var a = clamp(Math.round((x - gx0) / ST), 0, NX), b = clamp(Math.round((z - gz0) / ST), 0, NZ); return GS[b * (NX + 1) + a] * L / NS; }
    function gSlope(x, z) { var e = 2.5; return Math.hypot(gAt(x + e, z, GH) - gAt(x - e, z, GH), gAt(x, z + e, GH) - gAt(x, z - e, GH)) / (2 * e); }
    var tidx = [];
    for (j = 0; j < NZ; j++) for (i = 0; i < NX; i++) {
      var a0 = j * (NX + 1) + i, b0 = a0 + 1, c0 = a0 + NX + 1, d0 = c0 + 1;
      if (CUT[a0] || CUT[b0] || CUT[c0] || CUT[d0]) continue;
      tidx.push(a0, c0, b0, b0, c0, d0);
    }
    var tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(tpos, 3));
    tg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(NV * 3).fill(1), 3)); tg.setAttribute('aLdSoft', new THREE.BufferAttribute(new Float32Array(NV), 1));
    if (aspenLandFace(tpos, tidx) < 0) aspenLandFlip(tidx);
    tg.setIndex(tidx); tg.computeVertexNormals();
    // the ring: from the grid's edge out to 1.8 km, coarse, on rays from the grid's middle (its first row IS the edge)
    var per = [];
    for (i = 0; i < NX; i++) per.push(i);
    for (j = 0; j < NZ; j++) per.push(j * (NX + 1) + NX);
    for (i = NX; i > 0; i--) per.push(NZ * (NX + 1) + i);
    for (j = NZ; j > 0; j--) per.push(j * (NX + 1));
    var NP = per.length, KS = 4, NP2 = NP / KS, cx = gx0 + NX * ST / 2, cz = gz0 + NZ * ST / 2, NR = low ? 14 : 24, R1 = 1800;
    var rpos = [], ridx = [];
    per.forEach(function (q) { rpos.push(tpos[q * 3], tpos[q * 3 + 1], tpos[q * 3 + 2]); });
    for (j = 1; j <= NR; j++) for (i = 0; i < NP2; i++) {
      var pq = per[i * KS], px = tpos[pq * 3], pz = tpos[pq * 3 + 2], dx = px - cx, dz = pz - cz, r0 = Math.hypot(dx, dz);
      var rr = r0 + (R1 - r0) * Math.pow(j / NR, 1.6), rx = cx + dx / r0 * rr, rz = cz + dz / r0 * rr;
      probe(rx, rz);
      rpos.push(rx, natH(rx, rz, PR.d), rz);
    }
    for (i = 0; i < NP2; i++) {   // the edge (every point) to the first coarse row (every KS-th)
      var B0 = NP + i, B1 = NP + (i + 1) % NP2;
      for (k = 0; k < KS; k++) { var A0 = i * KS + k, A1 = (i * KS + k + 1) % NP; ridx.push(A0, A1, k < KS / 2 ? B0 : B1); }
      ridx.push(B0, (i * KS + KS / 2) % NP, B1);
    }
    for (j = 1; j < NR; j++) for (i = 0; i < NP2; i++) {
      var p0 = NP + (j - 1) * NP2 + i, p1 = NP + (j - 1) * NP2 + (i + 1) % NP2, p2 = p0 + NP2, p3 = p1 + NP2;
      ridx.push(p0, p1, p2, p1, p3, p2);
    }
    // (the edge winds the other way round from the grid's own; face it up)
    if (aspenLandFace(rpos, ridx) < 0) aspenLandFlip(ridx);
    var rg = aspenLandGeo(THREE, { position: [rpos, 3], color: [new Float32Array(rpos.length).fill(1), 3], aLdSoft: [new Float32Array(rpos.length / 3).fill(1), 1] }, ridx);
    rg.computeVertexNormals();
    // (the ring's first row takes the grid's own normals there, so the seam does not show)
    (function () { var tn = tg.attributes.normal.array, rn = rg.attributes.normal.array; per.forEach(function (q, n) { rn[n * 3] = tn[q * 3]; rn[n * 3 + 1] = tn[q * 3 + 1]; rn[n * 3 + 2] = tn[q * 3 + 2]; }); })();

    /* -- materials -- */
    var snow = aspenLandSnow(ctx, env), MAT = { snow: snow };
    var mkMesh = function (name, g, mat, o) {
      var m = new THREE.Mesh(g, mat); m.receiveShadow = true; m.castShadow = !!(o && o.shadow); m.name = name;
      if (o && o.kart) { m.userData.gmKart = true; env.scene.add(m); } else env.scenery.add(m);
      return m;
    };
    mkMesh('land-ground', tg, snow).renderOrder = 10;
    var ring = mkMesh('land-ring', rg, snow); ring.frustumCulled = false; ring.renderOrder = 11;

    /* -- the road and its edges -- */
    // the runs of road between the breaks (exact edges, so the road meets the chasm's lip)
    var BR = env.BRK.filter(function (B) { return B.full; }).map(function (B) { return [B.d0, B.d1]; }).sort(function (a, b) { return a[0] - b[0]; });
    function openRuns(pad) {
      if (!BR.length) return [[0, L]];
      return BR.map(function (b, n) { var nx = BR[(n + 1) % BR.length], e = nx[0] + (n === BR.length - 1 ? L : 0); return [b[1] + pad, e - pad]; }).filter(function (r) { return r[1] > r[0] + 0.5; });
    }
    // the nearest break edge to d (metres, + after a break's far edge, - before its near edge), for tapering banks
    function edgeGap(d) { var m = 1e9; BR.forEach(function (b) { m = Math.min(m, lapGap(d - b[1]), lapGap(b[0] - d)); }); return m; }
    function lapGap(a) { return Math.abs(env.wrap(a + L / 2) - L / 2); }   // how far a is round the lap, either way
    // the bends: radius and turn every 2 m (positive right), the drift bends (under 40 m) and the hairpins
    var NB = Math.ceil(L / 2), KAP = new Float32Array(NB);
    for (i = 0; i < NB; i++) {
      var fa = track.frameAt(env.wrap(i * 2 - 3)), fb = track.frameAt(env.wrap(i * 2 + 3)), ha = Math.atan2(fa.tan.z, fa.tan.x), hb = Math.atan2(fb.tan.z, fb.tan.x);
      var dh = hb - ha; while (dh > Math.PI) dh -= TAU; while (dh < -Math.PI) dh += TAU; KAP[i] = dh / 6;
    }
    // (smoothed over 14 m: the runtime's frames are sampled unevenly, and a noisy bend made a sawtooth of the banks)
    (function () { var K0 = KAP.slice(); for (var n = 0; n < NB; n++) { var sm = 0; for (var q = -3; q <= 3; q++) sm += K0[((n + q) % NB + NB) % NB]; KAP[n] = sm / 7; } })();
    function bends(rMax) {   // [[d0, d1, turn], ...] where the radius stays under rMax
      var out = [], a = -1, tt = 0, s0 = 0;
      for (var n = 0; n < NB; n++) if (Math.abs(KAP[n]) > 1 / rMax) { if (a < 0) { a = n; tt = 0; s0 = Math.sign(KAP[n]); } if (Math.sign(KAP[n]) !== s0) { out.push([a * 2, n * 2, tt]); a = n; tt = 0; s0 = Math.sign(KAP[n]); } tt += KAP[n] * 2; } else if (a >= 0) { out.push([a * 2, n * 2, tt]); a = -1; }
      if (a >= 0) out.push([a * 2, NB * 2, tt]);
      return out;
    }
    var DRIFT = bends(40), PADS = [];
    bends(32).forEach(function (b) {
      var mid = (b[0] + b[1]) / 2;
      if (Math.abs(b[2]) > 2.3 || (Math.abs(b[2]) > 1.3 && zoneAt(mid, 'switchbacks'))) PADS.push([b[0] - 6, b[1] + 8, b[2] > 0 ? -1 : 1]);
    });
    BR.forEach(function (b) { [-1, 1].forEach(function (s) { PADS.push([b[0] - 20, b[0] - 0.2, s]); PADS.push([b[1] + 0.2, b[1] + 12, s]); }); });
    // (merged where they meet, e.g. between the twin cracks, so no two cushions lie in the same place)
    PADS = PADS.sort(function (a, b) { return a[2] - b[2] || a[0] - b[0]; }).reduce(function (o, p) { var q = o[o.length - 1]; if (q && q[2] === p[2] && p[0] <= q[1]) q[1] = Math.max(q[1], p[1]); else o.push(p); return o; }, []);
    var SNOWSIDE = aspenLandAcc(), LINES = [], ROAD = [];
    var atlas = function (g, a, b) { var uv = g.attributes.uv.array; for (var n = 0; n < uv.length; n += 2) uv[n] = a + (b - a) * uv[n]; return g; };
    function clipRuns(a, b) {   // [a, b] less the breaks
      var out = []; openRuns(0).forEach(function (r) { for (var s = -1; s <= 1; s++) { var lo = Math.max(a, r[0] + s * L), hi = Math.min(b, r[1] + s * L); if (hi > lo + 0.5) out.push([lo, hi]); } });
      return out;
    }
    openRuns(0).forEach(function (r) {
      ROAD.push(env.band(r[0], r[1], [[-hw, 0.02], [0, 0.02], [hw, 0.02]], 0, { step: 2, tile: 4 }));
      [-1, 1].forEach(function (sd) {
        SNOWSIDE.put(env.band(r[0], r[1], [[hw, 0.022], [hw + 1.5, 0.05], [wall - 0.4, 0.07], [wall, 0.04]], sd, { step: 3, tile: 8 }));
        SNOWSIDE.put(env.band(r[0], r[1], function (d, f) {
          // (a bank ploughed up by hand: its height wanders 1.1 to 1.7 m along the lap)
          var e = smooth(0.3, 5, edgeGap(d)) * (0.8 + 0.4 * aspenLandN(d * 0.045 + sd * 7.3, sd)), k = 1;
          // (the ground behind the bank, relative to the road: the bank's back rides over it and its foot dives just under)
          var tr = function (x) { return gDraw(f.pos.x + f.right.x * sd * x, f.pos.z + f.right.z * sd * x) - f.pos.y; };
          // (on the inside of a tight bend the bank is squeezed short of the bend's middle, or it folds over itself)
          var km = KAP[Math.round(env.wrap(d) / 2) % NB] * sd;
          if (km > 0) k = clamp((0.9 / km - wall - 0.4) / 4.8, 0.15, 1);
          var x3 = wall + 2.2 * k, x4 = wall + 3.4 * k, x5 = wall + 4.8 * k;
          return [[wall, 0.0], [wall + 0.3 * k, 1.0 * e], [wall + 1.0 * k, 1.42 * e], [x3, Math.max(1.25 * e, tr(x3) + 0.15)], [x4, Math.max(0.3 * e, tr(x4) + 0.12)], [x5, tr(x5) - 0.45]];
        }, sd, { step: 3, tile: 6 }));
      });
    });
    // the blue dye lines, where there are no kerbs
    (function () {
      var cut = DRIFT.map(function (b) { return [b[0] - 4, b[1] + 4]; });
      openRuns(0).forEach(function (r) {
        var pieces = [[r[0], r[1]]];
        cut.forEach(function (c) { var nx = []; pieces.forEach(function (p) { for (var s2 = -1; s2 <= 1; s2++) { var a = c[0] + s2 * L, b = c[1] + s2 * L; if (b <= p[0] || a >= p[1]) continue; if (a > p[0]) nx.push([p[0], a]); p = [b, p[1]]; } if (p[1] > p[0]) nx.push(p); }); pieces = nx; });
        pieces.forEach(function (p) { if (p[1] - p[0] > 1) [-1, 1].forEach(function (sd) { LINES.push(atlas(env.band(p[0], p[1], [[hw - 0.62, 0.032], [hw - 0.34, 0.032]], sd, { step: 3, tile: 6 }), 0.27, 0.48)); }); });
      });
    })();
    DRIFT.forEach(function (b) { clipRuns(b[0] - 4, b[1] + 4).forEach(function (r) { [-1, 1].forEach(function (sd) { LINES.push(atlas(env.band(r[0], r[1], [[hw - 0.95, 0.036], [hw + 0.2, 0.036]], sd, { step: 1.5, tile: 3 }), 0.02, 0.23)); }); }); });
    PADS.forEach(function (p) {
      clipRuns(p[0], p[1]).forEach(function (r) {
        LINES.push(atlas(env.band(r[0], r[1], [[wall - 0.02, -0.1], [wall - 0.18, 0.12], [wall - 0.18, 1.2], [wall - 0.02, 1.42], [wall + 0.45, 1.5]], p[2], { step: 1.25, tile: 5 }), 0.52, 0.98));
      });
    });
    mkMesh('land-road', env.merge(ROAD), aspenLandRoadMat(ctx, env), { kart: true });
    ROAD.forEach(function (g) { g.dispose(); });
    // fall-line markers down the steep drops (20% and steeper): on each bank every 8 m a slalom panel on two upright
    // poles, red and blue by turns (the atlas' kerb red, dye blue, kerb white)
    (function () {
      var P = [], U = [], I = [], last = -99, red = 0;
      function quad(a, b, h0, h1, uv) { var o = P.length / 3; P.push(a[0], h0, a[1], b[0], h0, b[1], b[0], h1, b[1], a[0], h1, a[1]); U.push.apply(U, uv.concat(uv, uv, uv)); I.push(o, o + 1, o + 2, o, o + 2, o + 3); }
      for (var fd = 0; fd < L; fd += 2) {
        var f = track.frameAt(fd), y = f.pos.y;
        if (f.tan.y > -0.2 || fd - last < 8 || BR.some(function (b) { return env.inside(fd, b[0] - 3, b[1] + 3); })) continue;
        last = fd; red = 1 - red;
        [-1, 1].forEach(function (sd) {
          var at = function (x, t) { return [f.pos.x + f.right.x * sd * x + f.tan.x * t, f.pos.z + f.right.z * sd * x + f.tan.z * t]; };
          [wall + 0.25, wall + 1.2].forEach(function (x) { quad(at(x - 0.05, 0), at(x + 0.05, 0), y - 0.3, y + 2.5, [0.12, 0.25]); });
          quad(at(wall + 0.25, 0), at(wall + 1.2, 0), y + 1.65, y + 2.35, red ? [0.12, 0.75] : [0.37, 0.5]);
        });
      }
      if (I.length) { var g = aspenLandGeo(THREE, { position: [P, 3], uv: [U, 2] }, I); g.computeVertexNormals(); LINES.push(g); }
    })();
    mkMesh('land-lines', env.merge(LINES), aspenLandLinesMat(ctx, env), { kart: true, shadow: !low });
    LINES.forEach(function (g) { g.dispose(); });

    /* -- the chasms: walls (blue ice, or snow and rock for the ravine), the floor, a snow collar over the cut edge,
       the icefall's frozen face and its creek -- */
    var UPW = function () { return [0, 1, 0]; };
    var ICE = aspenLandAcc(), K = low ? 5 : 7; ICE.dep = true; var TK = low ? [0, 0.08, 0.3, 0.6, 0.85, 1] : [0, 0.04, 0.12, 0.27, 0.46, 0.66, 0.85, 1];
    var ICEC = [[0.9, 0.95, 1.0], [0.6, 0.84, 0.97], [0.3, 0.64, 0.9], [0.11, 0.38, 0.74], [0.045, 0.18, 0.48], [0.02, 0.07, 0.24], [0.008, 0.025, 0.09]];
    function iceCol(t, out, n) {
      var x = Math.pow(clamp(t, 0, 1), 0.62) * (ICEC.length - 1), a = Math.floor(Math.min(x, ICEC.length - 2)), f = x - a, s = 0.88 + 0.24 * n;
      for (var c = 0; c < 3; c++) out[3 + c] = lerp(ICEC[a][c], ICEC[a + 1][c], f) * (c < 2 ? s : 1);
    }
    var COLW = ST * 1.45 + 0.8, RIMS = [];
    CH.forEach(function (C) {
      var v0 = -C.XL[0], v1 = C.XL[1], VS = [], dv = low ? 2 : 1.2;
      for (var v = v0; v < v1; v += dv) VS.push(v);
      VS.push(v1); [-(wall + 1), wall + 1].forEach(function (e) { if (e > v0 && e < v1) VS.push(e); }); VS.sort(function (a, b) { return a - b; });
      var LIP = VS.map(function (v) { return [chLip(C, chC(C, v) - chA(C, v), v), chLip(C, chC(C, v) + chA(C, v), v)]; });
      var acc = C.ice ? ICE : SNOWSIDE, cf = C.kind === 'cliff'; acc.soft = cf ? 0.12 : 0.35; var mid = function (x, y, z) { var v = chUV(C, x, z)[1], p = chXZ(C, chC(C, v), v); return [p[0] - x, 0, p[1] - z]; };
      function wallPt(n, kk, e, out) {
        var v = VS[n], t = TK[kk], a = chA(C, v), c = chC(C, v), corr = Math.abs(v) <= wall + 1.01, jf = C.blunt >= 0 && chSide(v) === C.blunt ? smooth(0, 4, C.XL[C.blunt] - Math.abs(v)) : 1;
        var u = c + e * a * (1 - (cf && e > 0 ? 0.9 : C.pinch) * Math.pow(t, 1.3)) + jf * (kk ? (aspenLandN(v * 0.45 + C.seed, t * 4 + e) - 0.5) * (corr ? 0.8 * t * t : 1.6 * t) : 0);
        var lp = LIP[n][e < 0 ? 0 : 1], y = lp + (kk ? 0 : corr ? 0.02 : 0.06) - (lp - Math.min(LIP[n][0], LIP[n][1]) + chDepth(C, v)) * t, xz = chXZ(C, u, v);
        out[0] = xz[0]; out[1] = y; out[2] = xz[1];
        var nz = aspenLandN(v * 0.7 + e * 3, t * 6 + C.seed);
        // (a cliff's face: rock bands with snow lying on the ledges between, row by row)
        if (cf) acc.soft = kk % 2 ? 0.1 + 0.7 * nz : 0.04;
        // (out along the arms, where the walls climb the slopes in full view, the cap of snow over the ice is thicker)
        if (C.ice) { iceCol(t * (C.kind === 'icefall' ? 0.9 : 1), out, nz); out[6] = Math.max(0, LIP[n][e < 0 ? 0 : 1] - y); out[7] = smooth(wall + 1, wall + 12, Math.abs(v)) * (0.2 + 0.03 * chDepth(C, v)); } else { var s = (1 - (cf ? 0.08 : 0.5) * Math.pow(t, 0.8)) * (0.88 + 0.24 * nz) * (0.9 + 0.1 * Math.sin(t * 23 + v * 0.13)); out[3] = s * 0.93; out[4] = s * 0.97; out[5] = s; }
      }
      [-1, 1].forEach(function (e) { acc.sheet(VS.length - 1, K, function (n, kk, out) { wallPt(n, kk, e, out); }, mid); });
      acc.soft = 1;
      // icicles hanging off both lips where the karts fly over (and a little past the corridor)
      if (C.ice) [-1, 1].forEach(function (e) {
        for (var vi = -(wall + 6); vi <= wall + 6; vi += low ? 1.6 : 0.8) {
          if (vi < -C.XL[0] || vi > C.XL[1]) continue;
          var ui = chC(C, vi) + e * (chA(C, vi) - 0.25), xi = chXZ(C, ui, vi), yi = chLip(C, chC(C, vi) + e * chA(C, vi), vi) - 0.05, hr = mtnH2(vi * 3.1 + e, C.seed);
          ICE.spike(xi[0], yi, xi[1], 0.07 + hr * 0.08, 0.5 + hr * hr * 2.2, [0.86, 0.95, 1.0]);
        }
      });
      // the floor between the walls' feet (a ravine's or a cliff's: drifted snow, not grey rock)
      acc.sheet(VS.length - 1, 1, function (n, kk, out) { wallPt(n, K, kk ? 1 : -1, out); out[1] -= 0.4; if (out[6] >= 0) out[6] += 0.4; if (!C.ice) out[3] = out[4] = out[5] = 0.9; }, UPW);
      // the collar: a snow cornice along the lip, rounded, overhanging the crack a little (its underside hangs below
      // the lip, so the walls' tops read snow-capped), then out over the cut edge of the ground past the grid's
      // ragged edge
      [-1, 1].forEach(function (e) {
        // (a drop-off's take-off lip (5 m or more down to the landing): one cornice right across, through the corridor
        // too, bigger, its top under the road's)
        var cl = C.drop >= 5 && e < 0, lo = v0 - (C.blunt === 0 ? 0 : 6), hi = v1 + (C.blunt === 1 ? 0 : 6);
        (cl ? [[lo, hi]] : [[lo, -(wall + 0.6)], [wall + 0.6, hi]]).forEach(function (span) {
          var n = Math.max(2, Math.ceil((span[1] - span[0]) / (low ? 2.5 : 1.2)));
          SNOWSIDE.sheet(n, 4, function (s, kk, out) {
            var v = lerp(span[0], span[1], s / n), a = Math.abs(v) > C.XL[chSide(v)] ? 0 : chA(C, v), c = chC(C, v);
            var big = smooth(0.2, 2.5, a) * (cl ? 1.8 : smooth(wall + 0.6, wall + 3, Math.abs(v))), ov = (0.3 + 0.45 * aspenLandN(v * 0.31 + C.seed, e * 2.1)) * big, cp = (0.3 + 0.32 * aspenLandN(v * 0.17 - C.seed, e * 3.3 + 1)) * big;
            var u = c + e * (a + [-ov, -ov * 0.65, 0.4, 1.7, COLW][kk]), xz = chXZ(C, u, v), lip = chLip(C, c + e * a, v);
            var g = kk === 0 ? lip + 0.06 - 0.6 * cp : kk === 1 ? lip + 0.06 + 0.65 * cp : kk === 2 ? lip + 0.06 + cp : gDraw(xz[0], xz[1]) + (kk === 3 ? 0.16 + 0.3 * cp : 0.05);
            if (kk === 2) g = Math.max(g, gDraw(xz[0], xz[1]) + 0.2);
            if (cl && kk) g = Math.min(g, lip - 0.08 + 9 * smooth(hw, wall + 1, Math.abs(v)));
            out[0] = xz[0]; out[1] = g; out[2] = xz[1];
          }, UPW);
        });
      });
      // rocks round the rim
      for (var r = 0; r < (low ? 4 : 9); r++) { var vr = (R() < 0.5 ? -1 : 1) * (wall + 6 + R() * 26), er = R() < 0.5 ? -1 : 1, ur = chC(C, vr) + er * (chA(C, vr) + COLW + 1 + R() * 5); if (Math.abs(vr) < C.XL[chSide(vr)]) { var xr = chXZ(C, ur, vr); RIMS.push([xr[0], xr[1], 1.2 + R() * 2.4]); } }
      if (C.blunt >= 0) {
        // the icefall: the frozen creek's face down the blunt end, fluted, white to turquoise; the creek above it
        var sb = C.blunt ? 1 : -1, vb = sb * C.XL[C.blunt], nU = low ? 6 : 12, li = LIP[C.blunt ? VS.length - 1 : 0];
        ICE.sheet(nU, K, function (n, kk, out) {
          var t = TK[kk], a = chA(C, vb) * (1 - C.pinch * Math.pow(t, 1.3)), c = chC(C, vb), u = c - a + 2 * a * n / nU, sn = Math.sin(Math.PI * n / nU);
          var fl = sn * (0.25 + 1.1 * Math.pow(t, 0.6) * (0.5 + 0.5 * Math.sin(u * 2.3 + C.seed))), xz = chXZ(C, u, vb - sb * fl);
          out[0] = xz[0]; out[1] = lerp(li[0], li[1], n / nU) + (kk ? 0 : 0.06) - chDepth(C, vb) * t; out[2] = xz[1];
          var w = 0.92 - 0.45 * t + 0.1 * Math.sin(u * 2.3 + C.seed); out[3] = w * 0.9; out[4] = w * 0.98 + 0.03; out[5] = Math.min(1, w + 0.12);
        }, function (x, y, z) { var uv = chUV(C, x, z); var p = chXZ(C, uv[0], uv[1] - sb * 5); return [p[0] - x, 0, p[1] - z]; });
        var nC = low ? 14 : 30;
        ICE.sheet(nC, 2, function (n, kk, out) {
          var s = n / nC, v = vb + sb * s * 60, w = lerp(chA(C, vb) * 0.95, 2.2, smooth(0, 0.3, s)), u = chC(C, vb) + (aspenLandN(s * 3 + C.seed, 2.2) - 0.5) * 14 * smooth(0, 0.4, s) + (kk - 1) * w;
          var xz = chXZ(C, u, v); out[0] = xz[0]; out[1] = (s === 0 ? Math.max(gDraw(xz[0], xz[1]), li[0]) : gDraw(xz[0], xz[1])) + 0.2; out[2] = xz[1];
          var c = kk === 1 ? 0.62 : 0.86; out[3] = c * 0.78; out[4] = c * 0.92; out[5] = Math.min(1, c * 1.1);
        }, UPW);
        // (and the snow collar across the top of the face)
        SNOWSIDE.sheet(6, 2, function (n, kk, out) {
          var a = chA(C, vb) + COLW, u = chC(C, vb) - a + 2 * a * n / 6, xz = chXZ(C, u, vb + sb * [0, 1.2, COLW][kk]);
          out[0] = xz[0]; out[1] = gDraw(xz[0], xz[1]) + [0.08, 0.16, 0.05][kk]; out[2] = xz[1];
        }, UPW);
      }
    });
    // the snow at the road's side (verges, banks), the ravine's walls and the collars: one mesh
    mkMesh('land-roadside', SNOWSIDE.geo(THREE), snow, { kart: true, shadow: !low });
    if (ICE.i.length) mkMesh('land-ice', ICE.geo(THREE), aspenLandIceMat(ctx, env), { kart: true });

    /* -- trees and rocks: placed on the ground worked out above -- */
    var FIR = [], CARD = [], ASP = [], ROCK = RIMS.slice();
    var nearMax = low ? 60 : 280, nearD = low ? 40 : 62;
    function clump(x, z) { return smooth(0.3, 0.75, aspenLandN(x * 0.045 + 5.3, z * 0.045) * 0.7 + aspenLandN(x * 0.15, z * 0.15 + 2.2) * 0.3); }
    function zoneAt(d, name) { return env.ZONE[name] && env.inZone(d, name); }
    // (none in a chasm or where the village's crowds stand at the jumps: env.crowdAt)
    var sp = low ? 8 : 5.5, list = [], crowd = function (x, z) { return env.crowdAt && env.crowdAt(x, z, 2); };
    for (var tx = gx0 + sp / 2; tx < gx0 + NX * ST; tx += sp) for (var tz = gz0 + sp / 2; tz < gz0 + NZ * ST; tz += sp) {
      var jx = tx + (R() - 0.5) * sp * 0.9, jz = tz + (R() - 0.5) * sp * 0.9, dm = gAt(jx, jz, GD), rnd = R();
      if (dm < wall + 6 || dm > 190) continue;
      var dn = gNear(jx, jz);
      if (zoneAt(dn, 'village') && dm < 75) continue;
      if (dm < 62 && env.inside(dn, env.at('hairpin', -10), env.at('run', 10))) { var hf = track.frameAt(dn); if ((jx - hf.pos.x) * hf.right.x + (jz - hf.pos.z) * hf.right.z > 0) continue; }
      if (inChasm(jx, jz, 5) || crowd(jx, jz)) continue;
      var sl = gSlope(jx, jz), y = gAt(jx, jz, GH), cl = clump(jx, jz);
      if (sl > 0.75) { if (rnd < 0.025 && dm < 70) ROCK.push([jx, jz, 1.5 + R() * 2.5]); continue; }
      if (sl > 0.45 && rnd < 0.06 && dm < 60) { ROCK.push([jx, jz, 1 + R() * 2.5]); continue; }
      var aspen = (zoneAt(dn, 'esses') || zoneAt(dn, 'switchbacks')) && dm < 58;
      if (aspen) { if (dm > wall + 9 && rnd < 0.62 * (0.35 + 0.65 * cl)) ASP.push([jx, y, jz, 11 + R() * 7, R() * TAU, 0.8 + R() * 0.4]); continue; }
      var p = dm < 40 ? 0.62 : dm < 80 ? 0.5 : 0.36;
      if (rnd > p * cl * (1 - smooth(55, 75, y - FIT.y))) continue;
      list.push([jx, y, jz, (7 + R() * 6 + cl * 5) * (0.85 + R() * 0.3), R() * TAU, 0.8 + R() * 0.4, dm]);
    }
    list.sort(function (a, b) { return a[6] - b[6]; });
    list.forEach(function (t) { if (FIR.length < nearMax && t[6] < nearD) FIR.push(t); else CARD.push(t); });
    // (no tree reaches into the racing corridor: its widest branches, turned any way, stay 10 m off the line of every
    // piece of road, measured exactly, not from the grid; one too wide is made smaller, down to 6 m, or left out)
    var fits = function (k) { return function (t) { var room = probe(t[0], t[2]).d - (hw + 2.2), w = k * t[5]; if (t[3] * w <= room) return true; if (room / w < 6) return false; t[3] = room / w; return true; }; };
    FIR = FIR.filter(fits(0.33)); CARD = CARD.filter(fits(0.42)); ASP = ASP.filter(fits(0.5));
    // the forest beyond the grid, on the ring: cards only
    for (var fc = 0, tries = 0; fc < (low ? 360 : 1100) && tries < 6000; tries++) {
      var an = R() * TAU, rr = Math.max(NX, NZ) * ST * 0.5 + 20 + Math.pow(R(), 1.5) * 520, fx = cx + Math.cos(an) * rr, fz = cz + Math.sin(an) * rr;
      if (fx > gx0 && fx < gx0 + NX * ST && fz > gz0 && fz < gz0 + NZ * ST) continue;
      if (R() > clump(fx * 0.5, fz * 0.5) * 0.9 + 0.1) continue;
      probe(fx, fz); var fy = natH(fx, fz, PR.d);
      if (fy - FIT.y > 120) continue;
      CARD.push([fx, fy, fz, (8 + R() * 8) * (0.9 + R() * 0.3), R() * TAU, 0.8 + R() * 0.4]); fc++;
    }
    aspenLandTrees(ctx, env, FIR, CARD, ASP);
    ROCK = ROCK.filter(function (r) { return gAt(r[0], r[1], GD) > wall + 3 + r[2] && probe(r[0], r[1]).d - 2.5 * r[2] > hw + 2.2 && !crowd(r[0], r[1]); }).slice(0, low ? 30 : 80);
    aspenLandRocks(ctx, env, ROCK.map(function (r) { return [r[0], gAt(r[0], r[1], GH), r[1], r[2]]; }));
    // what the other parts can use: the ground's height anywhere (not cut down under the road) and the chasms
    env.groundAt = function (x, z) { return gAt(x, z, GH); };
    env.chasmAt = function (x, z, m) { return !!inChasm(x, z, m || 0); };
  }

  /* -- the snow: the library's scanned snow, its own colour cooled, rock where the ground is steep, sun glints -- */
  function aspenLandSnow(ctx, env) {
    var THREE = env.THREE, low = env.low;
    var m = ctx.assets.surface('texture-snow', { size: 2.4, normal: 0.85, roughness: 0.95, mottle: 0.06, color: '#FFFFFF' });
    if (!m) return new THREE.MeshStandardMaterial({ color: '#E4EAF2', roughness: 0.92, vertexColors: true });
    m.vertexColors = true;
    // (the scanned rock for the steep ground, on desktops)
    var rk = !low && ctx.assets.texture && ctx.assets.texture('texture-dark-rock'), defs = rk && rk.map ? '#define LD_ROCK\nuniform sampler2D uLdRk;\n' : '';
    if (defs) rk.map.wrapS = rk.map.wrapT = THREE.RepeatWrapping;
    // (the sun's glints: the look's own aspenSparkle, world-anchored and shimmer-free at speed, added after ours)
    return aspenSparkle(aspenLandWrap(THREE, m, 'aspenSnow' + defs.length, function (sh) {
      if (defs) sh.uniforms.uLdRk = { value: rk.map };
      sh.fragmentShader = aspenLandSh(sh, 'attribute float aLdSoft; varying float vLdSoft;', 'vLdSoft = aLdSoft;', 'varying float vLdSoft;\n' + defs)
        .replace('#include <color_fragment>', [
          'vec3 ldW = normalize(vGmN);',
          'float ldBn = ldF(vGmP.xz * 0.06 + vec2(vGmP.y * 0.13, -vGmP.y * 0.05));',
          // (rock only where the ground is really steep, over 60 degrees, in patches with crisp edges: a band of rock
          // fading in and out along a 50-degree cutting read as a dark smudge from the road; broken by snow couloirs down
          // the fall line, so a tall cutting reads as rock ribs, not a dark blob from afar)
          'float ldRk = smoothstep(0.5, 0.465, ldW.y + (ldBn - 0.44) * 0.3 - (ldN(vGmP.xz * 0.025 + 11.0) - 0.5) * 0.1 + (ldN(vec2((vGmP.x + vGmP.z) * 0.3 + (vGmP.x - vGmP.z) * 0.17, vGmP.y * 0.04)) - 0.45) * 0.45) * (1.0 - vLdSoft);',
          'float ldTx = dot(diffuseColor.rgb, vec3(0.3333)), ldMac = ldN(vGmP.xz * 0.012) * 0.6 + ldN(vGmP.xz * 0.045 + 3.1) * 0.4;',
          'vec3 ldC = vec3(0.83, 0.875, 0.95) * (0.9 + 0.12 * ldMac) * (0.84 + 0.2 * ldTx);',
          'vec3 ldRc = vec3(0.2, 0.2, 0.215) * (0.6 + 0.8 * ldBn);',
          '#ifdef LD_ROCK',
          'if (ldRk > 0.01) { vec3 bw = pow(abs(ldW), vec3(4.0)); bw /= bw.x + bw.y + bw.z; vec3 q = vGmP / 3.2;',
          '  ldRc = vec3(dot(texture2D(uLdRk, q.zy).rgb * bw.x + texture2D(uLdRk, q.xz).rgb * bw.y + texture2D(uLdRk, q.xy).rgb * bw.z, vec3(0.333))) * vec3(1.25, 1.33, 1.5) * (0.8 + 0.5 * ldBn); }',
          '#endif',
          'diffuseColor.rgb = mix(ldC, ldRc, ldRk);',
          '#include <color_fragment>'].join('\n'))
        .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nroughnessFactor = mix(roughnessFactor * 0.92, 0.96, ldRk);');
    }), { amount: 1, near: 18 });
  }

  /* -- the road: groomed snow, corduroy along it, a little blue-grey, packed on the line -- */
  function aspenLandRoadMat(ctx, env) {
    var THREE = env.THREE, low = env.low;
    var draw = function (g, w, h, hgt) {
      var r = aspenRng(5);
      g.fillStyle = hgt ? '#808080' : '#B9C5D3'; g.fillRect(0, 0, w, h);
      for (var x = 0; x < w; x += 8) {   // corduroy: ridges along the road, 0.25 m apart
        var a = 0.6 + 0.4 * r();
        g.fillStyle = 'rgba(255,255,255,' + ((hgt ? 0.5 : 0.16) * a).toFixed(2) + ')'; g.fillRect(x, 0, 4, h);
        g.fillStyle = hgt ? 'rgba(0,0,0,0.35)' : 'rgba(70,90,120,0.09)'; g.fillRect(x + 5, 0, 2, h);
      }
      for (var i = 0; i < 1400; i++) { var lt = r() < 0.5; g.fillStyle = 'rgba(' + (lt ? '255,255,255' : '80,96,124') + ',' + (0.05 + r() * (hgt ? 0.3 : 0.11)).toFixed(2) + ')'; g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 5); }
      if (!hgt) for (var s = 0; s < 5; s++) { g.fillStyle = 'rgba(150,165,190,0.10)'; g.fillRect(r() * w, 0, 3 + r() * 5, h); }
    };
    var map = ctx.textures.canvas(128, 256, function (g, w, h) { draw(g, w, h, false); });
    map.wrapS = map.wrapT = THREE.RepeatWrapping; map.repeat.set(8, 1);
    // (pushed back a little in depth: the engine's own marks on the road, e.g. an offroad shoulder strip, lie on it
    // and must win, or they shred into slivers on a steep hairpin)
    var o = { map: map, roughness: 0.82, metalness: 0, color: '#FFFFFF', polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 2 };
    if (!low && ctx.textures.normal) { var nm = ctx.textures.normal(128, 256, function (g, w, h) { draw(g, w, h, true); }, 1.0); nm.wrapS = nm.wrapT = THREE.RepeatWrapping; nm.repeat.set(8, 1); o.normalMap = nm; o.normalScale = new THREE.Vector2(0.6, 0.6); }
    var m = new THREE.MeshStandardMaterial(o);
    // (the line through the middle of the road a touch more packed and darker, the edges powdery)
    return aspenLandWrap(THREE, m, 'aspenRoad', function (sh) {
      sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n{ float ac = abs(vMapUv.x / 8.0 - 0.5) * 2.0; diffuseColor.rgb *= mix(0.94, 1.04, smoothstep(0.15, 0.9, ac)); }');
    });
  }

  /* -- the lines atlas: red/white kerb (u 0-0.25), blue dye line (0.25-0.5), red/white race padding (0.5-1) -- */
  function aspenLandLinesMat(ctx, env) {
    var THREE = env.THREE;
    var tex = ctx.textures.canvas(256, 256, function (g, w, h) {
      var r = aspenRng(17);
      g.fillStyle = '#D9283E'; g.fillRect(0, 0, w * 0.25, h / 2); g.fillStyle = '#F2F4F7'; g.fillRect(0, h / 2, w * 0.25, h / 2);
      g.fillStyle = '#2756C8'; g.fillRect(w * 0.25, 0, w * 0.25, h);
      for (var i = 0; i < 260; i++) { g.fillStyle = 'rgba(' + (r() < 0.5 ? '255,255,255' : '10,30,90') + ',' + (0.06 + r() * 0.18).toFixed(2) + ')'; g.fillRect(w * 0.25 + r() * w * 0.25, r() * h, 2, 2 + r() * 6); }
      // the padding: a red cushion and a white one along the wall (v), seams between, a rolled top and a dark foot
      g.fillStyle = '#D9283E'; g.fillRect(w * 0.5, 0, w * 0.5, h / 2); g.fillStyle = '#F4F5F8'; g.fillRect(w * 0.5, h / 2, w * 0.5, h / 2);
      g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(w * 0.5, h / 2 - 3, w * 0.5, 6); g.fillRect(w * 0.5, 0, w * 0.5, 3); g.fillRect(w * 0.5, h - 3, w * 0.5, 3);
      g.fillStyle = 'rgba(0,0,0,0.12)'; for (var s = 0; s < 4; s++) g.fillRect(w * 0.5, s * h / 4 + h / 8, w * 0.5, 2);
      g.fillStyle = '#2B2E36'; g.fillRect(w * 0.5, 0, w * 0.06, h);
      g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(w * 0.84, 0, w * 0.05, h);
    });
    tex.wrapT = THREE.RepeatWrapping;
    return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide });
  }

  /* -- ice: vertex colours from the lip's white to the deep's cobalt, lit a little from within; on the crevasse walls
     (aLdDep >= 0: metres below the lip) a wavy cap of old snow under the lip and the layers of years of snow, thin
     pale lines and broad bands, so the walls read as snow-capped glacier ice, not glass -- */
  function aspenLandIceMat(ctx, env) {
    var THREE = env.THREE, m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0, side: THREE.DoubleSide });
    return aspenLandWrap(THREE, m, 'aspenIce2', function (sh) {
      sh.fragmentShader = aspenLandSh(sh, 'attribute float aLdDep, aLdCap; varying vec3 vLdP; varying float vLdDep, vLdCap;', 'vLdP = (modelMatrix * vec4(transformed, 1.0)).xyz; vLdDep = aLdDep; vLdCap = aLdCap;', 'varying vec3 vLdP; varying float vLdDep, vLdCap;\n')
        .replace('#include <color_fragment>', [
          '#include <color_fragment>',
          'float ldCap = 0.0;',
          '{ float s = ldF(vec2(vLdP.x + vLdP.z, vLdP.y * 3.0) * 0.35), b = ldN(vec2(vLdP.y * 1.3, (vLdP.x - vLdP.z) * 0.05)); float gr = ldN(vec2((vLdP.x + vLdP.z) * 1.7, vLdP.y * 0.12)); diffuseColor.rgb *= (0.82 + 0.28 * s) * (0.87 + 0.26 * b) * (vLdDep >= 0.0 ? 0.9 + 0.16 * gr : 0.82 + 0.3 * gr); }',
          'if (vLdDep >= 0.0) {',
          // (the layers of years of snow lie parallel to the surface: depth below the lip, warped; faint thin lines,
          // broken along their length, and broad bands, fading out with depth)
          '  float h = vLdP.x * 0.71 + vLdP.z * 0.71, dp = vLdDep + (ldF(vec2(h * 0.07, vLdDep * 0.08)) - 0.5) * 2.6;',
          '  float lay = fract(dp * 0.42), ly = floor(dp * 0.42), ln = smoothstep(0.0, 0.04, lay) * (1.0 - smoothstep(0.06, 0.13, lay));',
          '  ln *= smoothstep(0.3, 0.62, ldN(vec2(h * 0.09 + ly * 5.3, ly * 1.7))) * (1.0 - smoothstep(4.0, 14.0, vLdDep));',
          '  float bd = ldN(vec2(h * 0.02 + 3.0, dp * 0.55));',
          '  diffuseColor.rgb *= 0.9 + 0.16 * bd;',
          '  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.8, 0.9, 0.97), ln * 0.32);',
          // (the cap of old snow: from the lip down 1.2-3.2 m, its foot wavy, firn grading into the ice under it, and a
          // few runs of snow lower down)
          '  float edge = 1.0 + vLdCap + 1.7 * ldF(vec2(h * 0.22, 4.0)), run = smoothstep(0.8, 0.92, ldN(vec2(h * 1.1, 7.0))) * (1.0 - smoothstep(edge, edge + 3.0, vLdDep));',
          '  ldCap = max(1.0 - smoothstep(edge - 0.5, edge + 0.35, vLdDep), run * 0.8);',
          '  float firn = (1.0 - smoothstep(edge, edge + 2.5, vLdDep)) * 0.35;',
          '  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.84, 0.885, 0.95) * (0.93 + 0.1 * ldN(vec2(h * 2.0, vLdDep * 2.0))), max(ldCap, firn));',
          '}'].join('\n'))
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.93, ldCap);')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * 0.1 * (1.0 - ldCap);');
    });
  }

  /* -- trees: firs of branch cards (AI Alps' spruce, by day), crossed cards farther off, winter aspens -- */
  function aspenLandSil(g, cx, w, h, R, v, lump) {
    // a spruce's outline in the canvas, coded: red the needles' shade, green the snow on them, alpha the cover
    var nT = 15 + v * 2, wide = 0.82 + v * 0.08, sx = w / 128, sy = h / 256, ls = lump || 1;
    g.fillStyle = 'rgb(40,0,0)'; g.fillRect(cx - 3 * sx, h - 22 * sy, 6 * sx, 22 * sy);
    for (var k = 0; k < nT; k++) {
      var t = k / (nT - 1), y = (6 + t * 226) * sy, hw = (5 + t * 50 * wide) * (0.85 + R() * 0.3) * sx, dr = (8 + t * 10) * sy;
      g.fillStyle = 'rgb(' + (30 + R() * 50 | 0) + ',0,0)'; g.beginPath(); g.moveTo(cx, y - 10 * sy);
      for (var e = 0; e <= 10; e++) { var u = e / 10; g.lineTo(cx - hw + u * hw * 2, y + dr * (1 - Math.abs(u - 0.5) * 0.6) + (R() - 0.5) * 7 * sy); }
      g.closePath(); g.fill();
      for (var sd = -1; sd <= 1; sd += 2) for (var l = 0; l < 6 / ls; l++) {
        var uu = 0.15 + R() * 0.8;
        g.fillStyle = 'rgb(' + (40 + R() * 40 | 0) + ',255,0)'; g.beginPath(); g.ellipse(cx + sd * hw * uu * 0.95, y - 9 * sy + (dr + 4 * sy) * uu * 0.95 + R() * 2 * sy, (2 + R() * 4 * (1 + t)) * sx * ls, (1.5 + R() * 2) * sy * ls, sd * 0.45, 0, Math.PI * 2); g.fill();
      }
    }
  }
  function aspenLandTrees(ctx, env, FIR, CARD, ASP) {
    var THREE = env.THREE, low = env.low, fir = !low && ctx.assets.texture('texture-fir-cards');
    // the branch atlas: left half one fir-cards spray (grey, its alpha), right half a spruce outline (the cores, the cards)
    var tex = ctx.textures.canvas(low ? 512 : 1024, low ? 512 : 1024, function (g, W, h) {
      var R = aspenRng(77), w = W / 2; g.clearRect(0, 0, W, h);
      aspenLandSil(g, w * 1.5, w * 0.94, h, R, 2, 0.55);
      if (!(fir && fir.map && fir.alphaMap && fir.cards)) { aspenLandSil(g, w / 2, w * 0.9, h, R, 1, 1); return; }
      var c = fir.cards.reduce(function (p, q) { return (q.uv[2] - q.uv[0]) * (q.uv[3] - q.uv[1]) > (p.uv[2] - p.uv[0]) * (p.uv[3] - p.uv[1]) ? q : p; });
      var put = function (img) { g.save(); g.beginPath(); g.rect(0, 0, w, h); g.clip(); g.translate(w / 2, 0); g.rotate(Math.PI / 2); g.drawImage(img, c.uv[0] * img.width, c.uv[1] * img.height, (c.uv[2] - c.uv[0]) * img.width, (c.uv[3] - c.uv[1]) * img.height, 0, -w / 2, h, w); g.restore(); };
      put(fir.alphaMap.image); var A = g.getImageData(0, 0, w, h); put(fir.map.image); var C = g.getImageData(0, 0, w, h);
      for (var q = 0; q < C.data.length; q += 4) { var lum = Math.min(255, (C.data[q] + C.data[q + 1] * 1.4 + C.data[q + 2]) / 2.2); C.data[q] = C.data[q + 1] = C.data[q + 2] = lum; C.data[q + 3] = A.data[q]; }
      g.putImageData(C, 0, 0);
    }, { linear: true });
    var mat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.92, color: '#FFFFFF' });
    aspenLandWrap(THREE, mat, 'aspenFir', function (sh) {
      sh.fragmentShader = aspenLandSh(sh, 'attribute float aPart; varying float vPart; varying vec3 vSpP;', 'vPart = aPart;\n{ vec4 sp = vec4(position, 1.0);\n#ifdef USE_INSTANCING\nsp = instanceMatrix * sp;\n#endif\nvSpP = (modelMatrix * sp).xyz; }', 'varying float vPart; varying vec3 vSpP;\n')
        .replace('#include <color_fragment>', [
          '#include <color_fragment>',
          'float spShade = diffuseColor.r; vec2 spUv = vec2(vMapUv.x * 2.0, vMapUv.y);',
          'float spCen = 1.0 - abs(spUv.x - 0.5) * 2.0, spL = ldF(spUv * vec2(5.0, 11.0) + vSpP.xz * 0.37) + 0.45 * ldN(spUv * vec2(17.0, 31.0) + vSpP.y);',
          'float spSnow = vPart < 0.5 && gl_FrontFacing ? smoothstep(0.66, 0.88, spL + spCen * 0.38) * smoothstep(0.08, 0.3, spUv.y) : 0.0;',
          'if (vPart > 0.5 && vPart < 1.5) { spSnow = smoothstep(0.3, 0.95, diffuseColor.g) * 0.45; spShade = diffuseColor.r * 1.7; }',
          'if (vPart > 1.5) diffuseColor.a = 1.0;',
          'vec3 spNeedle = vec3(0.032, 0.06, 0.042) * (0.45 + spShade * 1.9) * (0.8 + 0.4 * ldH(floor(vSpP.xz * 0.5)));',
          'if (vPart > 1.5) spNeedle = vec3(0.075, 0.055, 0.045);',
          'diffuseColor.rgb = mix(spNeedle, vec3(0.84, 0.88, 0.95), spSnow);'].join('\n'));
    });
    function place(list, k) { return function (n, o) { var t = list[n]; o.position.set(t[0], t[1] - 0.3, t[2]); o.rotation.y = t[4]; o.scale.set(t[3] * k * t[5], t[3], t[3] * k * t[5]); }; }
    function chunked(list, geo, m, name, shadow) {
      // (in quarters round the lap's middle, so the ones behind the camera are not drawn)
      var c = env.centre, parts = low ? 2 : 4;
      for (var q = 0; q < parts; q++) {
        var part = list.filter(function (t) { var a = Math.atan2(t[2] - c.z, t[0] - c.x) + Math.PI; return Math.min(parts - 1, Math.floor(a / (Math.PI * 2) * parts)) === q; });
        if (!part.length) continue;
        aspenLandShow(env, ctx.instanced(geo, m, part.length, place(part, 0.62)), name, shadow);
      }
    }
    if (FIR.length) chunked(FIR, aspenLandSpruceGeo(THREE, low ? 9 : 11, low ? 6 : 7), mat, 'land-firs', !low);
    if (CARD.length) {
      // two crossed cards, the outline in the atlas' right half (as the firs' cores: aPart 1)
      var P = [], N = [], U = [], K = [], I = [];
      for (var s = 0; s < 2; s++) {
        var a = s * Math.PI / 2 + 0.3, cx = Math.cos(a) * 0.5, sz = Math.sin(a) * 0.5, o = s * 4;
        [[-1, 0], [1, 0], [1, 1], [-1, 1]].forEach(function (v) { P.push(cx * v[0], v[1] * 1.04, sz * v[0]); N.push(0, 1, 0); U.push(v[0] < 0 ? 0.5 : 1, v[1]); K.push(1); });
        I.push(o, o + 1, o + 2, o, o + 2, o + 3);
      }
      var cg = aspenLandGeo(THREE, { position: [P, 3], normal: [N, 3], uv: [U, 2], aPart: [K, 1] }, I);
      aspenLandShow(env, ctx.instanced(cg, mat, CARD.length, place(CARD, 0.6)), 'land-fir-cards');
    }
    if (ASP.length) aspenLandAspens(ctx, env, ASP);
  }
  // an instanced mesh finished and shown (shadow: it casts them, and takes them; left out, as made)
  function aspenLandShow(env, im, name, shadow) {
    if (shadow != null) { im.castShadow = shadow; im.receiveShadow = true; }
    im.computeBoundingSphere(); im.name = name; env.scenery.add(im);
  }
  function aspenLandSpruceGeo(THREE, whorls, per) {
    // AI Alps' spruce: a trunk, three crossed core cards, and whorls of drooping branch cards (aPart 2, 1, 0)
    var P = [], Nn = [], UV = [], K = [], R = aspenRng(31 + whorls), i, s, TAU = Math.PI * 2;
    function v(x, y, z, nx, ny, nz, u, w, k) { P.push(x, y, z); Nn.push(nx, ny, nz); UV.push(u, w); K.push(k); }
    for (s = 0; s < 6; s++) [0, 1, 2, 1, 3, 2].forEach(function (q) { var a = (s + (q & 1)) / 6 * TAU, c = Math.cos(a), n = Math.sin(a), r = q < 2 ? 0.016 : 0.01; v(c * r, q < 2 ? -0.03 : 0.35, n * r, c, 0, n, 0.25, 0.02, 2); });
    for (s = 0; s < 3; s++) {
      var ca = Math.cos(s * Math.PI / 3 + 0.3) * 0.21, sa = Math.sin(s * Math.PI / 3 + 0.3) * 0.21;
      v(-ca, 0.02, -sa, 0, 1, 0, 0.5, 0, 1); v(ca, 0.02, sa, 0, 1, 0, 1, 0, 1); v(ca, 1.0, sa, 0, 1, 0, 1, 1, 1);
      v(-ca, 0.02, -sa, 0, 1, 0, 0.5, 0, 1); v(ca, 1.0, sa, 0, 1, 0, 1, 1, 1); v(-ca, 1.0, -sa, 0, 1, 0, 0.5, 1, 1);
    }
    for (i = 0; i < whorls; i++) {
      var tw = i / (whorls - 1), y0 = 0.1 + tw * 0.86, L0 = 0.035 + 0.215 * Math.pow(1 - tw, 0.9), rot = R() * TAU, nb = Math.max(5, Math.round(per * (1 - tw * 0.4)));
      for (var b = 0; b < nb; b++) {
        var an = rot + b / nb * TAU + (R() - 0.5) * 0.6, dx = Math.cos(an), dz = Math.sin(an), sx = -dz, sz = dx, Lb = L0 * (0.75 + R() * 0.5);
        var droop = (0.2 + 0.5 * (1 - tw)) * (0.55 + R() * 0.9), lift = (R() - 0.3) * 0.25, roll = (R() - 0.5) * 0.6, nx = dx * 0.6, nz = dz * 0.6, seg = [];
        for (var f = 0; f <= 3; f++) { var ff = f / 3, px = dx * Lb * ff, py = y0 + Lb * ((0.15 + lift) * ff - droop * ff * ff), pz = dz * Lb * ff, hw2 = Lb * (0.16 + 0.38 * ff); seg.push([px - sx * hw2, py - roll * hw2, pz - sz * hw2, px + sx * hw2, py + roll * hw2, pz + sz * hw2, ff]); }
        for (f = 0; f < 3; f++) [0, 1, 2, 1, 3, 2].forEach(function (q) { var E = seg[f + (q >> 1)], o = (q & 1) * 3; v(E[o], E[o + 1], E[o + 2], nx, 0.8, nz, (q & 1) * 0.5, E[6], 0); });
      }
    }
    for (i = 0; i < Nn.length; i += 3) { var l = Math.hypot(Nn[i], Nn[i + 1], Nn[i + 2]); Nn[i] /= l; Nn[i + 1] /= l; Nn[i + 2] /= l; }
    return aspenLandGeo(THREE, { position: [P, 3], normal: [Nn, 3], uv: [UV, 2], aPart: [K, 1] });
  }
  function aspenLandAspens(ctx, env, ASP) {
    // bare winter aspens: a slim white trunk with dark eyes, darker at the foot; a haze of grey-violet twigs (two
    // crossed cards) from half way up
    var THREE = env.THREE, low = env.low;
    var bark = ctx.textures.canvas(64, 512, function (g, w, h) {
      var r = aspenRng(23), gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, '#ECE9E0'); gr.addColorStop(0.82, '#E2DFD4'); gr.addColorStop(0.9, '#A9A69C'); gr.addColorStop(1, '#3C3A36');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      for (var i = 0; i < 70; i++) { g.fillStyle = 'rgba(40,36,34,' + (0.5 + r() * 0.5).toFixed(2) + ')'; g.beginPath(); g.ellipse(r() * w, r() * h * 0.92, 2 + r() * 7, 1 + r() * 2.2, 0, 0, Math.PI * 2); g.fill(); }
      for (i = 0; i < 26; i++) { g.fillStyle = 'rgba(30,28,26,0.85)'; var x = r() * w, y = r() * h * 0.85; g.beginPath(); g.moveTo(x - 7, y); g.quadraticCurveTo(x, y - 6, x + 7, y); g.quadraticCurveTo(x, y + 3, x - 7, y); g.fill(); }
      for (i = 0; i < 300; i++) { g.fillStyle = 'rgba(120,115,105,0.35)'; g.fillRect(r() * w, r() * h, 2 + r() * 3, 1); }
    });
    var twig = ctx.textures.canvas(256, 256, function (g, w, h) {
      var r = aspenRng(29); g.clearRect(0, 0, w, h); g.lineCap = 'round';
      function br(x, y, a, len, wd, n) {
        var x2 = x + Math.cos(a) * len, y2 = y - Math.sin(a) * len;
        g.strokeStyle = 'rgba(' + (92 + r() * 20 | 0) + ',' + (84 + r() * 14 | 0) + ',' + (88 + r() * 16 | 0) + ',0.95)'; g.lineWidth = wd; g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.stroke();
        if (n <= 0 || len < 6) return;
        for (var k = 0; k < 2 + (r() < 0.4 ? 1 : 0); k++) br(x2, y2, a + (r() - 0.5) * 1.3, len * (0.62 + r() * 0.2), Math.max(0.6, wd * 0.62), n - 1);
      }
      for (var m = 0; m < 7; m++) br(w / 2 + (r() - 0.5) * 8, h * (0.98 - m * 0.06), Math.PI / 2 + (r() - 0.5) * 1.6, 40 + r() * 30, 3.2, 5);
    });
    var tm = new THREE.MeshStandardMaterial({ map: bark, roughness: 0.82 });
    var cm = new THREE.MeshStandardMaterial({ map: twig, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.95, color: '#E8E0E8' });
    var sides = low ? 4 : 6, tg = new THREE.CylinderGeometry(0.0085, 0.017, 1, sides, 1, true); tg.translate(0, 0.5, 0);
    var P = [], N = [], U = [], I = [];
    for (var s = 0; s < 2; s++) {
      var a = s * Math.PI / 2, cx = Math.cos(a) * 0.32, sz = Math.sin(a) * 0.32, o = s * 4;
      [[-1, 0.42], [1, 0.42], [1, 1.04], [-1, 1.04]].forEach(function (v, n) { P.push(cx * v[0], v[1], sz * v[0]); N.push(0, 1, 0); U.push(n === 1 || n === 2 ? 1 : 0, n < 2 ? 0 : 1); });
      I.push(o, o + 1, o + 2, o, o + 2, o + 3);
    }
    var cg = aspenLandGeo(THREE, { position: [P, 3], normal: [N, 3], uv: [U, 2] }, I);
    var put = function (n, o2) { var t = ASP[n]; o2.position.set(t[0], t[1] - 0.2, t[2]); o2.rotation.set((t[5] - 1) * 0.12, t[4], (t[5] - 1) * 0.1); o2.scale.set(t[3] * t[5], t[3], t[3] * t[5]); };
    aspenLandShow(env, ctx.instanced(tg, tm, ASP.length, put), 'land-aspens', !low);
    aspenLandShow(env, ctx.instanced(cg, cm, ASP.length, put), 'land-aspen-twigs', false);
  }

  /* -- rocks: AI Alps' lumpy boulder, dark rock with snow on what faces up -- */
  function aspenLandRocks(ctx, env, list) {
    if (!list.length) return;
    var THREE = env.THREE, low = env.low;
    var g = new THREE.IcosahedronGeometry(1, low ? 1 : 2), p = g.attributes.position, key = {}, P = [], I = [], sd = 3.3;
    for (var i = 0; i < p.count; i++) {
      var x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = Math.round(x * 1e4) + ',' + Math.round(y * 1e4) + ',' + Math.round(z * 1e4);
      if (key[k] == null) {
        var d = 1 + 0.3 * aspenLandN(x * 1.6 + sd, z * 1.6 + y) + 0.12 * aspenLandN(y * 3.1 - sd, x * 3.1 + z);
        d = Math.round(d * 7) / 7 * 0.5 + d * 0.5;
        key[k] = P.length / 3; P.push(x * d * 1.1, Math.max(y * d * 0.8, -0.3), z * d * 0.95);
      }
      I.push(key[k]);
    }
    var rg = aspenLandGeo(THREE, { position: [P, 3] }, I); rg.computeVertexNormals();
    var m = (!low && ctx.assets.surface('texture-dark-rock', { project: 'box', size: 2.6, color: '#D2D8E0', roughness: 0.95 })) || new THREE.MeshStandardMaterial({ color: '#4A4C53', roughness: 0.92 });
    aspenLandWrap(THREE, m, 'aspenRock', function (sh) {
      sh.fragmentShader = aspenLandSh(sh, 'varying vec3 vRkP; varying vec3 vRkN;', '{ vec4 sp = vec4(position, 1.0); vec3 sn = normal;\n#ifdef USE_INSTANCING\nsp = instanceMatrix * sp; sn = mat3(instanceMatrix) * sn;\n#endif\nvRkP = (modelMatrix * sp).xyz; vRkN = normalize(mat3(modelMatrix) * sn); }', 'varying vec3 vRkP; varying vec3 vRkN;\n')
        .replace('#include <color_fragment>', '#include <color_fragment>\nfloat rkS = smoothstep(0.22, 0.46, normalize(vRkN).y + (ldF(vRkP.xz * 1.4 + vRkP.y) - 0.45) * 0.5);\ndiffuseColor.rgb = mix(diffuseColor.rgb * vec3(0.95, 0.97, 1.05), vec3(0.84, 0.88, 0.95), rkS);')
        .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.9, rkS);');
    });
    var R = aspenRng(808);
    aspenLandShow(env, ctx.instanced(rg, m, list.length, function (n, o) { var r = list[n], f = R(); o.position.set(r[0], r[1] - r[3] * 0.3, r[2]); o.rotation.set((f - 0.5) * 0.4, R() * Math.PI * 2, (f - 0.5) * 0.3); o.scale.set(r[3] * (0.8 + f * 0.5), r[3] * (0.7 + f * 0.4), r[3]); }), 'land-rocks', !low);
  }

  /* ---------------------------------------------------- the village -- */
  // (owned by the VILLAGE agent) The start and the Village Hairpin, dressed from the course (env.frameAt, env.at), so
  // it follows the lap when the lap changes: a glass-front lodge in Colorado cedar under dark metal roofs on the sunny
  // side of the straight with ASPEN GP in big letters on its terrace, cedar chalets, the start/finish gantry with its
  // banner and a live timing board, the chequered line and the grid, grandstands both sides of the grid and round the
  // hairpin's outside, packed with a crowd in ski wear (cards from a baked film: VIL_CROWD); and out on the lap, crowds
  // where the action is (grandstands at the gaps' landings, banks at their take-offs, the drops and the S-bends:
  // aspenCrowdPlan), each group cheering on its own when a racer flies or lands near it (the engine's ctx.kart.crowd).
  // Boxes and quads gathered into one mesh a material (9 draws in all, the crowd, its flags and what it throws three
  // of them). Every building and stand checks the whole lap in plan before it stands: it moves out, or is left out, if
  // another part of the lap (or a chasm) comes near. No resort marks.
  // (the words on the boards and banners: [words, ground, ink])
  var VIL_WORDS = [
    ['ASPEN GP', '#1F4FA8', '#FFFFFF'], ['GM', '#FFC93C', '#14203A'], ['WAGMI', '#FF3B5C', '#FFFFFF'], ['HODL', '#14203A', '#FFC93C'],
    ['SEND IT', '#FFFFFF', '#FF3B5C'], ['POWDER DAY', '#7FC4F0', '#14203A'], ['GM', '#14203A', '#FFFFFF'], ['SEND IT', '#FF3B5C', '#FFFFFF'],
  ];
  // The crowd's 18 looks, in the baked sheet's order: [the move it plays, 1 if it holds up words]. Who they are (the
  // library's people in ski wear) and what they hold is the film's, in scripts/.scratch/aspen/village/crowd-bake.mts:
  // bake again when they change, and keep this list in step (the bake checks it)
  var VIL_FAN_LOOKS = [
    ['cheer', 1], ['danceTwist', 0], ['cheer', 1], ['cheer', 1], ['danceCabbage', 0], ['cheer', 1], ['danceLambada', 0], ['cheer', 1], ['cheer', 1],
    ['danceTwist', 0], ['danceTwist', 0], ['cheer', 1], ['cheer', 1], ['cheer', 1], ['danceCabbage', 0], ['cheer', 1], ['danceLambada', 1], ['cheer', 1],
  ];
  // The crowd's film, baked (crowd-bake.mts films the looks in a daylight studio, a laptop's sheet and a phone's, into
  // library pictures): its looks' frames in cells, cols across, the first row at the bottom (no crowd if it fails to
  // load)
  var VIL_CROWD = { high: { id: 'crowd-aspen-gp', frames: 12, cell: [96, 216], cols: 24 }, low: { id: 'crowd-aspen-gp-lo', frames: 10, cell: [64, 144], cols: 20 } };
  // (the prelude's two lists: a laptop loads the laptop's sheet, a phone only the phone's)
  aspenAssets([VIL_CROWD.high.id], [VIL_CROWD.low.id]);

  // Where the crowds stand out on the lap (the start's stands are the village's own): [d0, d1, side, kind, group] runs:
  // the gaps, longest first (six at most), grandstands both sides of the landing ('jump') and a bank both sides of
  // the take-off or its lip ('take'), one group a gap; the two steepest drops, a bank both sides of the lip ('drop'); the three
  // tightest S-bends, a bank on the outside of the switch, and round the outside of the hairpins ('bend'). From the course, so they follow the lap; none
  // overlaps another, the start or a hazard. main.js calls it before the land is laid: env.crowdAt(x, z) tells the land
  // where to keep its trees off them
  function aspenCrowdPlan(env) {
    var L = env.L, P = [], busy = [[AT.hairpin != null ? env.at('hairpin', -4) : -60, 78]], pts = [], nj = 0, nd = 0, nb = 0, ld = -1e4, G = [], S = [];
    function near(a, b) { return busy.some(function (r) { return env.inside(a, r[0], r[1]) || env.inside(b, r[0], r[1]) || env.inside(r[0], a, b); }); }
    function add(d0, d1, sd, kind, key) { if (near(d0, d1)) return 0; busy.push([d0, d1]); (sd ? [sd] : [1, -1]).forEach(function (s) { P.push([d0, d1, s, kind, key]); }); return 1; }
    (COURSE.hazards || []).forEach(function (h) { busy.push([(h.from != null ? h.from : h.at) * L - 12, (h.to != null ? h.to : h.at) * L + 12]); });
    env.BRK.filter(function (B) { return B.full; }).sort(function (a, b) { return b.d1 - b.d0 - a.d1 + a.d0; }).forEach(function (B) {
      if (nj < 6 && (add(B.d1 + 5, B.d1 + 42, 0, 'jump', 'j' + nj) || add(B.d1 + 4, B.d1 + 24, 0, 'jump', 'j' + nj))) { busy.push([B.d0, B.d1]); add(B.d0 - 34, B.d0 - 7, 0, 'take', 'j' + nj) || add(B.d0 - 14, B.d0 - 1, 0, 'take', 'j' + nj); nj++; }
    });
    // (the drops: the road's fall over 24 m, 150 m apart; the S-bends: an arc into one the other way, by their radii)
    for (var d = 0; d < L; d += 4) G.push([env.frameAt(d + 12).pos.y - env.frameAt(d - 12).pos.y, d]);
    G.sort(function (a, b) { return a[0] - b[0]; }).forEach(function (g) { if (nd < 2 && g[0] < -4 && Math.abs(env.wrap(g[1] - ld + L / 2) - L / 2) > 150 && add(g[1] - 30, g[1] + 12, 0, 'drop', 'd' + nd)) { nd++; ld = g[1]; } });
    SEG.forEach(function (s, i) { var n = SEG[i + 1]; if (n && s[1] === 'a' && n[1] === 'a' && s[3] * n[3] < 0) S.push([s[2] + n[2], env.at(n[0], 0), n[3] < 0 ? 1 : -1]); });
    S.sort(function (a, b) { return a[0] - b[0]; }).forEach(function (s) { if (nb < 3 && add(s[1] - 18, s[1] + 18, s[2], 'bend', 'b' + nb)) nb++; });
    // (and the hairpins out on the lap, a bank round the outside)
    SEG.forEach(function (s) { var n = s[2] * Math.abs(s[3]) * Math.PI / 180; if (s[1] === 'a' && Math.abs(s[3]) >= 135 && s[0] !== 'hairpin') add(env.at(s[0], n * 0.35), env.at(s[0], n - 4), s[3] < 0 ? 1 : -1, 'bend', s[0]); });
    P.forEach(function (r) { for (var d = r[0]; d <= r[1]; d += 4) { var f = env.frameAt(d), l = Math.hypot(f.right.x, f.right.z) || 1, o = (env.wall + 6) * r[2] / l; pts.push(f.pos.x + f.right.x * o, f.pos.z + f.right.z * o); } });
    env.crowdAt = function (x, z, m) { m = 7.5 + (m || 0); for (var i = 0; i < pts.length; i += 2) if ((x - pts[i]) * (x - pts[i]) + (z - pts[i + 1]) * (z - pts[i + 1]) < m * m) return true; return false; };
    return P;
  }

  function aspenVillage(ctx, env) {
    var THREE = env.THREE, track = env.track, hw = env.hw, wall = env.wall, L = env.L, low = env.low;
    var R = aspenRng(5150), PI = Math.PI;
    var LAPS = ASPEN_LAPS;

    /* -------- the kit: geometry gathered by material, world space, a colour a vertex, uv in metres -- */
    function acc() { return { p: [], n: [], uv: [], c: [], i: [] }; }
    var G = { wood: acc(), paint: acc(), glass: acc(), snow: acc(), sign: acc(), clock: acc(), flag: acc() };
    var COL = [1, 1, 1], FR = { x: 0, y: 0, z: 0, c: 1, s: 0 }, TMPC = new THREE.Color();
    function col(h) { TMPC.set(h); COL = [TMPC.r, TMPC.g, TMPC.b]; }
    // the current frame: a place in the world and a turn about the upright; local x along, y up, z out of the front
    function frame(x, y, z, yaw) { FR.x = x; FR.y = y; FR.z = z; FR.c = Math.cos(yaw); FR.s = Math.sin(yaw); }
    function W(p) { return [FR.x + p[0] * FR.c + p[2] * FR.s, FR.y + p[1], FR.z - p[0] * FR.s + p[2] * FR.c]; }
    function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
    function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
    function norm(a) { var l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
    // a polygon of world points (3 or 4, counter-clockwise from its front); uv given, or worked out in metres (planks
    // run level: v is the height on an upright face, x and z on a flat one)
    function polyW(A, P, uv, nWant) {
      var n = norm(cross(sub(P[1], P[0]), sub(P[P.length - 1], P[0])));
      if (nWant && n[0] * nWant[0] + n[1] * nWant[1] + n[2] * nWant[2] < 0) { P = P.slice().reverse(); if (uv) uv = uv.slice().reverse(); n = [-n[0], -n[1], -n[2]]; }
      var base = A.p.length / 3, flat = Math.abs(n[1]) > 0.7, hx = Math.hypot(n[0], n[2]) || 1, tx = -n[2] / hx, tz = n[0] / hx;
      P.forEach(function (q, k) {
        A.p.push(q[0], q[1], q[2]); A.n.push(n[0], n[1], n[2]); A.c.push(COL[0], COL[1], COL[2]);
        if (uv) A.uv.push(uv[k][0], uv[k][1]); else if (flat) A.uv.push(q[0], q[2]); else A.uv.push(q[0] * tx + q[2] * tz, q[1]);
      });
      for (var k = 1; k < P.length - 1; k++) A.i.push(base, base + k, base + k + 1);
    }
    function poly(A, P, uv, nL) { polyW(A, P.map(W), uv, nL ? [nL[0] * FR.c + nL[2] * FR.s, nL[1], -nL[0] * FR.s + nL[2] * FR.c] : null); }
    // a box in the frame: centre, half sizes
    function box(A, x, y, z, hx, hy, hz) {
      var a = [x - hx, y - hy, z - hz], b = [x + hx, y + hy, z + hz];
      poly(A, [[a[0], a[1], b[2]], [b[0], a[1], b[2]], [b[0], b[1], b[2]], [a[0], b[1], b[2]]]);   // front (+z)
      poly(A, [[b[0], a[1], a[2]], [a[0], a[1], a[2]], [a[0], b[1], a[2]], [b[0], b[1], a[2]]]);   // back
      poly(A, [[b[0], a[1], b[2]], [b[0], a[1], a[2]], [b[0], b[1], a[2]], [b[0], b[1], b[2]]]);   // +x
      poly(A, [[a[0], a[1], a[2]], [a[0], a[1], b[2]], [a[0], b[1], b[2]], [a[0], b[1], a[2]]]);   // -x
      poly(A, [[a[0], b[1], b[2]], [b[0], b[1], b[2]], [b[0], b[1], a[2]], [a[0], b[1], a[2]]]);   // top
      poly(A, [[a[0], a[1], a[2]], [b[0], a[1], a[2]], [b[0], a[1], b[2]], [a[0], a[1], b[2]]]);   // bottom
    }
    // a beam w by h from a to b (local points)
    function beam(A, a, b, w, h) {
      var t = norm(sub(b, a)), up = Math.abs(t[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0], s = norm(cross(t, up)), u = cross(s, t);
      function P(p, i, j) { return [p[0] + s[0] * i * w / 2 + u[0] * j * h / 2, p[1] + s[1] * i * w / 2 + u[1] * j * h / 2, p[2] + s[2] * i * w / 2 + u[2] * j * h / 2]; }
      var Q = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
      for (var k = 0; k < 4; k++) { var q0 = Q[k], q1 = Q[(k + 1) % 4]; poly(A, [P(a, q0[0], q0[1]), P(b, q0[0], q0[1]), P(b, q1[0], q1[1]), P(a, q1[0], q1[1])]); }
    }
    // people standing about on a terrace (crowd cards, as the stands'): n of them over local [x0,x1] x [z0,z1]
    function folk(n, x0, x1, z0, z1) {
      for (var k = 0; k < n; k++) { var p = W([x0 + (x1 - x0) * R(), 0, z0 + (z1 - z0) * R()]); FANS.push([p[0], p[1], p[2], 0, 0.85 + R() * 0.3, R(), 0, 0, 0, CG]); }
    }
    // a pitched roof, its ridge along local z, the walls at x = +-hx, z = +-hz, eaves at e, pitch tp (rise a metre
    // out), overhangs ox (sides) and oz (gables), a slab th thick in metal (paint) with a snow cap on top
    function roof(hx, hz, e, tp, ox, oz, th) {
      var ry = e + hx * tp, xe = hx + ox, ye = e - ox * tp, z0 = -hz - oz, z1 = hz + oz;
      [1, -1].forEach(function (sx) {
        col('#2B2F35');
        poly(G.paint, sx > 0 ? [[0, ry + th, z1], [xe, ye + th, z1], [xe, ye + th, z0], [0, ry + th, z0]] : [[0, ry + th, z0], [-xe, ye + th, z0], [-xe, ye + th, z1], [0, ry + th, z1]]);
        poly(G.paint, sx > 0 ? [[0, ry, z0], [xe, ye, z0], [xe, ye, z1], [0, ry, z1]] : [[0, ry, z1], [-xe, ye, z1], [-xe, ye, z0], [0, ry, z0]]);
        poly(G.paint, sx > 0 ? [[xe, ye, z1], [xe, ye, z0], [xe, ye + th, z0], [xe, ye + th, z1]] : [[-xe, ye, z0], [-xe, ye, z1], [-xe, ye + th, z1], [-xe, ye + th, z0]]);
        poly(G.paint, [[0, ry, z1], [sx * xe, ye, z1], [sx * xe, ye + th, z1], [0, ry + th, z1]], null, [0, 0, 1]);
        poly(G.paint, [[sx * xe, ye, z0], [0, ry, z0], [0, ry + th, z0], [sx * xe, ye + th, z0]], null, [0, 0, -1]);
        // (the snow on it: a cap a little short of the edges, thick at the ridge, a rounded lip at the eaves)
        col('#F4F8FC');
        var s0 = th + 0.02, T = 0.32, xs = xe - 0.05, ys = ye + s0, zs0 = z0 + 0.12, zs1 = z1 - 0.04;
        poly(G.snow, sx > 0 ? [[0, ry + s0 + T, zs1], [xs, ys + T * 0.8, zs1], [xs, ys + T * 0.8, zs0], [0, ry + s0 + T, zs0]] : [[0, ry + s0 + T, zs0], [-xs, ys + T * 0.8, zs0], [-xs, ys + T * 0.8, zs1], [0, ry + s0 + T, zs1]]);
        poly(G.snow, sx > 0 ? [[xs, ys + T * 0.8, zs1], [xs + 0.12, ys + T * 0.2, zs1], [xs + 0.12, ys + T * 0.2, zs0], [xs, ys + T * 0.8, zs0]] : [[-xs, ys + T * 0.8, zs0], [-xs - 0.12, ys + T * 0.2, zs0], [-xs - 0.12, ys + T * 0.2, zs1], [-xs, ys + T * 0.8, zs1]]);
        poly(G.snow, [[0, ry + s0, zs1], [sx * xs, ys, zs1], [sx * xs, ys + T * 0.8, zs1], [0, ry + s0 + T, zs1]], null, [0, 0, 1]);
        poly(G.snow, [[sx * xs, ys, zs0], [0, ry + s0, zs0], [0, ry + s0 + T, zs0], [sx * xs, ys + T * 0.8, zs0]], null, [0, 0, -1]);
      });
      return ry;
    }
    // a wall face in cedar: the plane z = zf (front +1 / back -1 by fz), x0..x1, y0..y1
    function wallZ(x0, x1, y0, y1, zf, fz) { col('#FFFFFF'); poly(G.wood, fz > 0 ? [[x0, y0, zf], [x1, y0, zf], [x1, y1, zf], [x0, y1, zf]] : [[x1, y0, zf], [x0, y0, zf], [x0, y1, zf], [x1, y1, zf]]); }
    function wallX(z0, z1, y0, y1, xf, fx) { col('#FFFFFF'); poly(G.wood, fx > 0 ? [[xf, y0, z1], [xf, y0, z0], [xf, y1, z0], [xf, y1, z1]] : [[xf, y0, z0], [xf, y0, z1], [xf, y1, z1], [xf, y1, z0]]); }
    // a gable's triangle on the face z = zf, from y = e at x = +-hx up to ry at x = 0
    function gableZ(hx, e, ry, zf, fz, A) { col('#FFFFFF'); poly(A || G.wood, fz > 0 ? [[-hx, e, zf], [hx, e, zf], [0, ry, zf]] : [[hx, e, zf], [-hx, e, zf], [0, ry, zf]]); }
    // a window: glass on the face z = zf (facing +z), x0..x1, y0..y1, in a dark frame; panes about pw by ph metres
    function windowZ(x0, x1, y0, y1, zf, pw, ph) {
      var u = (x1 - x0) / (pw || 1.4), v = (y1 - y0) / (ph || 2.2);
      col('#FFFFFF'); poly(G.glass, [[x0, y0, zf + 0.03], [x1, y0, zf + 0.03], [x1, y1, zf + 0.03], [x0, y1, zf + 0.03]], [[0, 0], [u, 0], [u, v], [0, v]]);
      col('#1E2126');
      box(G.paint, (x0 + x1) / 2, y1 + 0.06, zf + 0.06, (x1 - x0) / 2 + 0.12, 0.08, 0.08); box(G.paint, (x0 + x1) / 2, y0 - 0.06, zf + 0.08, (x1 - x0) / 2 + 0.16, 0.07, 0.12);
      box(G.paint, x0 - 0.06, (y0 + y1) / 2, zf + 0.06, 0.07, (y1 - y0) / 2, 0.08); box(G.paint, x1 + 0.06, (y0 + y1) / 2, zf + 0.06, 0.07, (y1 - y0) / 2, 0.08);
    }
    // a terrace of snow under a building, its top at y = 0 (the road's height there), down 7 m to whatever ground
    function plinth(x0, x1, z0, z1) { col('#E9F0F8'); box(G.snow, (x0 + x1) / 2, -3.5, (z0 + z1) / 2, (x1 - x0) / 2, 3.5, (z1 - z0) / 2); }

    /* -------- the lap in plan, to keep clear of it -- */
    var LAPPTS = [];
    for (var dd = 0; dd < L; dd += 3) { var fq = track.frameAt(dd); LAPPTS.push([fq.pos.x, fq.pos.z, dd]); }
    function lapGap(a, b) { var g = Math.abs(a - b) % L; return Math.min(g, L - g); }
    // is a disc (x, z, r) clear of the corridor everywhere but the lap near dSelf (within near metres)?
    function clear(x, z, r, dSelf, near) {
      for (var q = 0; q < LAPPTS.length; q++) { var P = LAPPTS[q]; if (lapGap(P[2], dSelf) < near) continue; if (Math.hypot(P[0] - x, P[1] - z) < wall + 2 + r) return false; }
      return true;
    }
    function flatR(f) { var l = Math.hypot(f.right.x, f.right.z) || 1; return [f.right.x / l, f.right.z / l]; }
    // a site by the lap: d, the side (1 right, -1 left), out (metres from the road's middle to the site's centre);
    // the frame there, facing the road (+ turn); null if it is not clear (tried further out, twice)
    function site(d, sd, out, r, turn) {
      for (var tr = 0; tr < 3; tr++, out += 8) {
        var f = env.frameAt(d), rr = flatR(f), x = f.pos.x + rr[0] * sd * out, z = f.pos.z + rr[1] * sd * out;
        if (!clear(x, z, r, d, out + r + 30)) continue;
        var nx = -rr[0] * sd, nz = -rr[1] * sd;
        return { x: x, y: f.pos.y, z: z, yaw: Math.atan2(nx, nz) + (turn || 0), d: d, sd: sd, out: out };
      }
      return null;
    }

    /* -------- the materials (each one draw) -- */
    var cedar = ctx.textures.canvas(256, 256, function (g, w, h) {
      var r = aspenRng(31);
      for (var k = 0; k < 8; k++) {
        var c = [168 + r() * 26, 104 + r() * 18, 62 + r() * 14];
        g.fillStyle = 'rgb(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ')'; g.fillRect(0, k * 32, w, 32);
        for (var q = 0; q < 26; q++) { g.fillStyle = 'rgba(' + (r() < 0.5 ? '90,52,28' : '214,160,112') + ',' + (0.12 + r() * 0.18).toFixed(2) + ')'; g.fillRect(r() * w, k * 32 + 3 + r() * 26, 20 + r() * 90, 1 + r() * 1.5); }
        g.fillStyle = 'rgba(40,22,12,0.85)'; g.fillRect(0, k * 32 + 29, w, 3);
        g.fillStyle = 'rgba(255,224,190,0.25)'; g.fillRect(0, k * 32, w, 2);
      }
    });
    cedar.repeat.set(0.5, 0.5);
    var glassTex = ctx.textures.canvas(128, 256, function (g, w, h) {
      // (a pane in daylight: the sky over it, the snow and the far ridges under it, a sheen across, the mullions)
      var gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#5E8FD0'); gr.addColorStop(0.55, '#A9C8EA'); gr.addColorStop(0.62, '#E4EEF8'); gr.addColorStop(1, '#C6D6E6');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(232,242,252,0.9)'; g.beginPath(); g.moveTo(0, h * 0.62); g.lineTo(w * 0.2, h * 0.5); g.lineTo(w * 0.42, h * 0.58); g.lineTo(w * 0.7, h * 0.44); g.lineTo(w, h * 0.56); g.lineTo(w, h * 0.66); g.lineTo(0, h * 0.66); g.fill();
      g.fillStyle = 'rgba(40,58,84,0.55)'; g.fillRect(0, h * 0.7, w, h * 0.3);
      var sh = g.createLinearGradient(0, 0, w, h); sh.addColorStop(0.3, 'rgba(255,255,255,0)'); sh.addColorStop(0.45, 'rgba(255,255,255,0.35)'); sh.addColorStop(0.55, 'rgba(255,255,255,0)');
      g.fillStyle = sh; g.fillRect(0, 0, w, h);
      g.fillStyle = '#1A1D22'; g.fillRect(0, 0, 5, h); g.fillRect(w - 5, 0, 5, h); g.fillRect(0, 0, w, 5); g.fillRect(0, h - 5, w, 5);
    });
    var M = {
      wood: new THREE.MeshStandardMaterial({ map: cedar, vertexColors: true, roughness: 0.82 }),
      paint: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.2 }),
      glass: new THREE.MeshStandardMaterial({ map: glassTex, emissiveMap: glassTex, emissive: new THREE.Color(0.42, 0.42, 0.42), vertexColors: true, roughness: 0.1, metalness: 0.1 }),
      snow: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 }),
    };

    /* -------- the words: one atlas for the letters, the banners, the boards and the line -- */
    // (rows from the top: the big letters 0..256 on clear, the gantry banner 256..384, eight boards 512 x 128 in
    // 384..896, the chequer 896..960)
    var FONT = '"Bungee", "Arial Black", Impact, sans-serif';
    function fit(g, txt, size, maxW) { var sz = size; g.font = '900 ' + sz + 'px ' + FONT; while (g.measureText(txt).width > maxW && sz > 14) { sz -= 4; g.font = '900 ' + sz + 'px ' + FONT; } return sz; }
    var atlas = ctx.textures.canvas(1024, 1024, function (g, w, h) {
      g.clearRect(0, 0, w, h);
      g.textAlign = 'center'; g.textBaseline = 'middle';
      fit(g, 'ASPEN GP', 220, 980); g.lineJoin = 'round'; g.lineWidth = 22; g.strokeStyle = '#FFFFFF'; g.strokeText('ASPEN GP', 512, 136); g.fillStyle = '#E8213F'; g.fillText('ASPEN GP', 512, 136);
      g.fillStyle = '#1F4FA8'; g.fillRect(0, 256, 1024, 128); g.fillStyle = '#FF3B5C'; g.fillRect(0, 256, 1024, 14); g.fillRect(0, 370, 1024, 14);
      g.fillStyle = '#FFFFFF'; fit(g, 'ASPEN GP  •  GM  •  SEND IT', 84, 990); g.fillText('ASPEN GP  •  GM  •  SEND IT', 512, 322);
      VIL_WORDS.forEach(function (Wd, q) {
        var x = (q % 2) * 512, y = 384 + Math.floor(q / 2) * 128;
        g.fillStyle = Wd[1]; g.fillRect(x, y, 512, 128); g.strokeStyle = Wd[2]; g.lineWidth = 6; g.strokeRect(x + 10, y + 10, 492, 108);
        g.fillStyle = Wd[2]; fit(g, Wd[0], 86, 460); g.fillText(Wd[0], x + 256, y + 68);
      });
      for (var cx = 0; cx < 16; cx++) for (var cy = 0; cy < 2; cy++) { g.fillStyle = (cx + cy) % 2 ? '#14141C' : '#F4F2FA'; g.fillRect(cx * 32, 896 + cy * 32, 32, 32); }
    });
    atlas.wrapS = atlas.wrapT = THREE.ClampToEdgeWrapping;
    M.sign = new THREE.MeshStandardMaterial({ map: atlas, vertexColors: true, alphaTest: 0.5, roughness: 0.5, emissiveMap: atlas, emissive: new THREE.Color(0.22, 0.22, 0.22), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    // (the flags wave, harder while their group cheers: CR = each group's excitement 0..1 and its own clock; a flag's
    // vertex colour carries how far out from its pole, its group, and which face)
    var CR = { ex: new Float32Array(16), gt: new Float32Array(16) };
    M.flag = new THREE.MeshStandardMaterial({ map: atlas, roughness: 0.6, emissiveMap: atlas, emissive: new THREE.Color(0.22, 0.22, 0.22) });
    M.flag.onBeforeCompile = function (sh) {
      sh.uniforms.uEx = { value: CR.ex }; sh.uniforms.uGT = { value: CR.gt };
      sh.vertexShader = 'attribute vec3 color; uniform float uEx[16], uGT[16];\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  int fg = int(color.g * 16.0 + 0.5); float fe = uEx[fg];\n  transformed += objectNormal * (color.b * 2.0 - 1.0) * color.r * (0.12 + 0.45 * fe) * sin(uGT[fg] * 5.0 - color.r * 4.0 + (position.x + position.z) * 0.3);');
    };
    function UVR(px0, py0, px1, py1) { return [px0 / 1024, 1 - py1 / 1024, px1 / 1024, 1 - py0 / 1024]; }
    var UV_LETTERS = UVR(8, 20, 1016, 250), UV_BANNER = UVR(0, 256, 1024, 384), UV_CHEQ = UVR(0, 896, 512, 960);
    function UV_BOARD(q) { q = q % VIL_WORDS.length; var x = (q % 2) * 512, y = 384 + Math.floor(q / 2) * 128; return UVR(x + 2, y + 2, x + 510, y + 126); }
    // a sign quad in the frame: the plane z = zf facing +z (fz -1: facing -z, read the right way from there)
    function signZ(x0, x1, y0, y1, zf, fz, r, A) {
      var uv = [[r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]]];
      if (fz > 0) poly(A || G.sign, [[x0, y0, zf], [x1, y0, zf], [x1, y1, zf], [x0, y1, zf]], uv);
      else poly(A || G.sign, [[x1, y0, zf], [x0, y0, zf], [x0, y1, zf], [x1, y1, zf]], uv);
    }

    /* -------- the line, the grid -- */
    (function () {
      col('#FFFFFF');
      var r = UV_CHEQ, A = track.pointAt(env.wrap(-1), -hw, 0.05), B = track.pointAt(env.wrap(-1), hw, 0.05), C = track.pointAt(1, hw, 0.05), D = track.pointAt(1, -hw, 0.05);
      polyW(G.sign, [[A.x, A.y, A.z], [B.x, B.y, B.z], [C.x, C.y, C.z], [D.x, D.y, D.z]], [[r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]]], [0, 1, 0]);
      col('#F4F4F4');
      for (var s = 0; s < 8; s++) {
        var row = Math.floor(s / 2), cl = s % 2, d = L - (5 + row * 6 + cl * 3) + 1.6, xc = cl ? -1.6 : 1.6;
        var P = [[d - 0.11, xc - 1.2], [d - 0.11, xc + 1.2], [d + 0.11, xc + 1.2], [d + 0.11, xc - 1.2]].map(function (q) { var p = track.pointAt(env.wrap(q[0]), q[1], 0.05); return [p.x, p.y, p.z]; });
        polyW(G.paint, P, [[0, 0], [1, 0], [1, 1], [0, 1]], [0, 1, 0]);
      }
    })();

    /* -------- the gantry over the line: two lattice towers, a truss, the banner, the timing board -- */
    var CLOCK = null;
    (function () {
      var f = env.frameAt(0), tl = Math.hypot(f.tan.x, f.tan.z) || 1;
      frame(f.pos.x, f.pos.y, f.pos.z, Math.atan2(-f.tan.x / tl, -f.tan.z / tl));   // local +z: toward the racers coming
      var X = wall + 1.4, H = 8.6, w = 0.55;
      col('#30353D');
      [-1, 1].forEach(function (sx) {
        var cx = sx * X;
        [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (q) { box(G.paint, cx + q[0] * w, H / 2 + 0.6, q[1] * w, 0.09, H / 2 + 0.6, 0.09); });
        for (var y = 0.2; y < H; y += 1.4) {
          beam(G.paint, [cx - w, y, w], [cx + w, y + 1.4, w], 0.06, 0.06); beam(G.paint, [cx - w, y, -w], [cx + w, y + 1.4, -w], 0.06, 0.06);
          beam(G.paint, [cx + sx * w, y, -w], [cx + sx * w, y + 1.4, w], 0.06, 0.06); beam(G.paint, [cx - sx * w, y + 1.4, -w], [cx - sx * w, y, w], 0.06, 0.06);
        }
        col('#7D7A76'); box(G.paint, cx, 0.35, 0, 0.9, 0.5, 0.9); col('#30353D');
      });
      // (the truss: four chords and the zigzag on both faces)
      [[H, w], [H, -w], [H + 1.3, w], [H + 1.3, -w]].forEach(function (c) { box(G.paint, 0, c[0], c[1], X + w, 0.1, 0.1); });
      for (var x = -X; x < X - 0.1; x += 1.6) [-w, w].forEach(function (z) { beam(G.paint, [x, H, z], [x + 1.6, H + 1.3, z], 0.07, 0.07); box(G.paint, x, H + 0.65, z, 0.05, 0.65, 0.05); });
      // (the banner under it, both faces, and the timing board standing on it: the clock to the racers coming,
      // the race's name the other way, to the podium)
      col('#FFFFFF'); signZ(-10.5, 10.5, H - 2.05, H - 0.15, w + 0.02, 1, UV_BANNER); signZ(-10.5, 10.5, H - 2.05, H - 0.15, -w - 0.02, -1, UV_BANNER);
      col('#30353D'); box(G.paint, 0, H - 1.1, 0, 10.6, 0.98, 0.04);
      col('#121418'); box(G.paint, 0, H + 2.55, 0, 3.7, 1.0, 0.3);
      col('#30353D'); box(G.paint, -2.2, H + 1.45, 0, 0.12, 0.2, 0.12); box(G.paint, 2.2, H + 1.45, 0, 0.12, 0.2, 0.12);
      col('#FFFFFF'); signZ(-3.5, 3.5, H + 1.7, H + 3.4, -0.32, -1, UV_BOARD(0));
      col('#FFFFFF'); poly(G.clock, [[-3.55, H + 1.65, 0.32], [3.55, H + 1.65, 0.32], [3.55, H + 3.45, 0.32], [-3.55, H + 3.45, 0.32]], [[0, 0], [1, 0], [1, 1], [0, 1]]);
      var cv = document.createElement('canvas'); cv.width = 512; cv.height = 128;
      // (redrawn while racing: no mipmaps to rebuild on each upload)
      var ctex = new THREE.CanvasTexture(cv); ctex.colorSpace = THREE.SRGBColorSpace; ctex.generateMipmaps = false; ctex.minFilter = THREE.LinearFilter;
      CLOCK = { cv: cv, g: cv.getContext('2d'), tex: ctex, t0: -1, lap: 1, done: false, last: '' };
    })();
    function drawClock(left, right) {
      var C = CLOCK, key = left + '|' + right; if (!C || key === C.last) return; C.last = key;
      var g = C.g; g.fillStyle = '#0B0D10'; g.fillRect(0, 0, 512, 128);
      g.fillStyle = '#FF3B5C'; g.fillRect(0, 0, 512, 6); g.fillRect(0, 122, 512, 6);
      g.textBaseline = 'middle'; g.font = '900 50px ' + FONT;
      g.textAlign = 'left'; g.fillStyle = '#FFC93C'; g.fillText(left, 20, 68);
      g.textAlign = 'right'; g.fillStyle = '#F4F8FC'; g.fillText(right, 494, 68);
      C.tex.needsUpdate = true;
    }
    drawClock('LAP 1/' + LAPS, 'GM');

    /* -------- the lodge, on the sunny side of the straight -- */
    var KX = typeof KEY !== 'undefined' ? KEY : [-0.6, 0.55, -0.58];
    var f0 = env.frameAt(env.at('line', 30)), r0 = flatR(f0), SUNNY = r0[0] * KX[0] + r0[1] * KX[2] < 0 ? 1 : -1, SHADY = -SUNNY;
    // (the shade across the road: a thing H high on the sun's side of the lap at d (side sd), x from the road's middle,
    // shades the ground out to x - H * shadeK(d, sd) toward the road (0 on the other side). The grid, the line and the
    // straight stay in the sun: what stands on the SHADY side there is set back (or kept low) so its shade stops at KEEP)
    var KEEP = hw + 0.5;
    function shadeK(d, sd) { var rr = flatR(env.frameAt(d)), k = (rr[0] * KX[0] + rr[1] * KX[2]) * sd; return k > 0 ? k / Math.max(0.15, KX[1]) : 0; }
    function lodge(S) {
      frame(S.x, S.y, S.z, S.yaw);
      var hx = 7, hz = 7, e = 7.6, tp = 0.78;
      plinth(-21, 21, -11, S.out - wall - 2.2);
      col('#8C8882'); box(G.paint, 0, 0.45, 0, 17.2, 0.5, 7.4);
      // the great hall: its gable to the road, glass from the floor to the ridge
      wallZ(-hx, hx, 0.9, e, -hz, -1); wallX(-hz, hz, 0.9, e, hx, 1); wallX(-hz, hz, 0.9, e, -hx, -1); gableZ(hx, e, e + hx * tp, -hz, -1);
      var ry = roof(hx, hz, e, tp, 0.7, 1.4, 0.3);
      col('#FFFFFF');
      poly(G.glass, [[-hx + 0.3, 0.9, hz], [hx - 0.3, 0.9, hz], [hx - 0.3, e, hz], [0, ry - 0.35, hz], [-hx + 0.3, e, hz]], [[0, 0], [9.4, 0], [9.4, 3], [4.7, 4.8], [0, 3]]);
      col('#5A3A24');
      [[-hx, e, 0.32, ry], [hx, e, 0.32, ry]].forEach(function (b) { beam(G.paint, [b[0], b[1], hz + 0.2], [0, b[3], hz + 0.2], 0.3, 0.4); });
      beam(G.paint, [-hx, e, hz + 0.25], [hx, e, hz + 0.25], 0.3, 0.36); beam(G.paint, [0, e, hz + 0.25], [0, ry, hz + 0.25], 0.26, 0.3);
      beam(G.paint, [-hx + 0.2, 0.9, hz + 0.18], [-hx + 0.2, e, hz + 0.18], 0.36, 0.36); beam(G.paint, [hx - 0.2, 0.9, hz + 0.18], [hx - 0.2, e, hz + 0.18], 0.36, 0.36);
      [-1, 1].forEach(function (sx) {
        // the wings: two floors, eaves to the road, ribbon windows, a balcony along the upper floor
        frame(S.x, S.y, S.z, S.yaw);
        var cx = sx * 11.6, wx = 4.6, wz = 6, we = 6.6;
        wallZ(cx - wx, cx + wx, 0.9, 1.3, wz, 1); wallZ(cx - wx, cx + wx, 3.5, 4.3, wz, 1); wallZ(cx - wx, cx + wx, 6.1, we, wz, 1);
        wallZ(cx - wx, cx + wx, 0.9, we, -wz, -1); wallX(-wz, wz, 0.9, we, cx + sx * wx, sx);
        for (var k = 0; k < 3; k++) { var x0 = cx - wx + 0.3 + k * 3.0; windowZ(x0, x0 + 2.6, 1.3, 3.5, wz, 1.3, 2.2); windowZ(x0, x0 + 2.6, 4.3, 6.1, wz, 1.3, 1.8); }
        col('#FFFFFF'); [-1, 1].forEach(function (s2) { poly(G.wood, s2 > 0 ? [[cx + wx, we, wz], [cx + wx, we, -wz], [cx + wx, we + wz * 0.5, 0]] : [[cx - wx, we, -wz], [cx - wx, we, wz], [cx - wx, we + wz * 0.5, 0]]); });
        frame(S.x + Math.cos(S.yaw) * cx, S.y, S.z - Math.sin(S.yaw) * cx, S.yaw + PI / 2);
        roof(wz, wx, we, 0.5, 0.9, 0.5, 0.26);
        frame(S.x, S.y, S.z, S.yaw);
        col('#2A2D33'); box(G.paint, cx, 4.2, wz + 0.9, wx, 0.1, 0.9);
        col('#1E2126'); box(G.paint, cx, 5.15, wz + 1.75, wx, 0.04, 0.04); box(G.paint, cx, 4.65, wz + 1.75, wx, 0.03, 0.03);
        for (var p = -wx; p <= wx + 0.01; p += 1.15) box(G.paint, cx + p, 4.7, wz + 1.75, 0.03, 0.45, 0.03);
        col('#F4F8FC'); box(G.snow, cx, 4.34, wz + 0.95, wx - 0.1, 0.05, 0.8);
        if (!low) { var o4 = W([0, 4.3, 0]); folk(4, cx - wx + 0.5, cx + wx - 0.5, wz + 0.6, wz + 1.4); for (var fq = FANS.length - 4; fq < FANS.length; fq++) FANS[fq][1] = o4[1]; }
      });
      // a stone chimney through the hall's roof
      frame(S.x, S.y, S.z, S.yaw);
      col('#8C8882'); box(G.paint, -4.2, ry - 0.5, -3, 0.75, 3.4, 0.75); col('#2B2F35'); box(G.paint, -4.2, ry + 3.0, -3, 0.95, 0.1, 0.95);
      col('#F4F8FC'); box(G.snow, -4.2, ry + 3.16, -3, 0.9, 0.08, 0.9);
      // the terrace: people about
      frame(S.x, S.y, S.z, S.yaw); folk(low ? 10 : 22, -19, -10, 8, 12); folk(low ? 4 : 8, -8, 8, 7.6, 8.8);
      frame(S.x, S.y, S.z, S.yaw);
      // ASPEN GP, big, on the terrace before it: red letters on clear, a dark copy behind for their depth, on a
      // timber plinth
      var lz = S.out - wall - 4.6, lw = 9.2;
      col('#FFFFFF'); signZ(-lw, lw, 0.5, 4.9, lz, 1, UV_LETTERS);
      col('#3A1018'); signZ(-lw, lw, 0.5, 4.9, lz - 0.22, 1, UV_LETTERS); signZ(-lw, lw, 0.5, 4.9, lz - 0.24, -1, UV_LETTERS);
      col('#5A3A24'); box(G.paint, 0, 0.3, lz - 0.1, lw - 0.4, 0.32, 0.5);
      col('#F4F8FC'); box(G.snow, 0, 0.66, lz - 0.1, lw - 0.5, 0.06, 0.45);
    }

    /* -------- a cedar chalet: stone base, two floors, a metal roof deep in snow, a balcony, a chimney -- */
    function chaletDims(k) { var r = aspenRng(900 + k * 17); return { hx: 3.8 + r() * 0.8, hz: 3.6 + r() * 0.6, e: 5.2 + r() * 0.5, tp: 0.62 + r() * 0.12 }; }
    // (how far from the road's middle a chalet must stand on the sun's side (shade K, eaves to the road, standing
    // `lift` over the road) for its shade to stop at KEEP: the ridge, the eaves' snow lip, the chimney, the balcony)
    function chaletOut(k, K, lift) {
      var D = chaletDims(k), ridge = K * (lift + D.e + D.hz * D.tp + 0.62), lip = D.hz + 1.0 + K * (lift + D.e - 0.9 * D.tp + 0.62);
      var chim = -0.4 * D.hz + 0.5 + K * (lift + D.e + 3.43), bal = D.hz + 1.5 + K * (lift + 4.35);
      return KEEP + Math.max(ridge, lip, chim, bal) + 0.2 * D.hx + 0.6;
    }
    function chalet(S, k, eaves) {
      var D = chaletDims(k), hx = D.hx, hz = D.hz, e = D.e, tp = D.tp, gf = !eaves && k % 2 === 0;
      frame(S.x, S.y, S.z, S.yaw);
      plinth(-hx - 2.5, hx + 2.5, -hz - 2.5, hz + 3.5);
      col('#8C8882'); box(G.paint, 0, 0.5, 0, hx + 0.05, 0.55, hz + 0.05);
      wallZ(-hx, hx, 1.05, e, -hz, -1); wallX(-hz, hz, 1.05, e, hx, 1); wallX(-hz, hz, 1.05, e, -hx, -1);
      // the front: a door, windows, the balcony over them
      wallZ(-hx, hx, 1.05, 1.4, hz, 1); wallZ(-hx, hx, 3.0, 3.6, hz, 1); wallZ(-hx, hx, 5.0, e, hz, 1);
      wallZ(-hx, -hx + 0.5, 1.4, 3.0, hz, 1); wallZ(hx - 0.5, hx, 1.4, 3.0, hz, 1); wallZ(-0.6, 0.6, 1.4, 3.0, hz, 1);
      wallZ(-hx, -hx + 0.5, 3.6, 5.0, hz, 1); wallZ(hx - 0.5, hx, 3.6, 5.0, hz, 1); wallZ(-0.6, 0.6, 3.6, 5.0, hz, 1);
      windowZ(-hx + 0.5, -0.6, 1.4, 3.0, hz, 1.2, 1.6); windowZ(0.6, hx - 0.5, 1.4, 3.0, hz, 1.2, 1.6);
      windowZ(-hx + 0.5, -0.6, 3.6, 5.0, hz, 1.2, 1.4); windowZ(0.6, hx - 0.5, 3.6, 5.0, hz, 1.2, 1.4);
      col('#2A2D33'); box(G.paint, 0, 3.35, hz + 0.75, hx + 0.2, 0.09, 0.75);
      col('#1E2126'); box(G.paint, 0, 4.3, hz + 1.45, hx + 0.2, 0.04, 0.04);
      for (var p = -hx - 0.2; p <= hx + 0.21; p += 0.9) box(G.paint, p, 3.85, hz + 1.45, 0.03, 0.45, 0.03);
      col('#F4F8FC'); box(G.snow, 0, 3.47, hz + 0.78, hx + 0.1, 0.04, 0.68);
      var ry;
      if (gf) {
        // gable to the road: a big window in it
        gableZ(hx, e, e + hx * tp, hz, 1); gableZ(hx, e, e + hx * tp, -hz, -1);
        windowZ(-1.1, 1.1, e + 0.2, e + Math.min(2.2, hx * tp - 0.5), hz, 1.1, 1.0);
        ry = roof(hx, hz, e, tp, 0.8, 1.1, 0.26);
      } else {
        // eaves to the road: the gables at the sides
        col('#FFFFFF');
        [-1, 1].forEach(function (sx) { poly(G.wood, sx > 0 ? [[hx, e, hz], [hx, e, -hz], [hx, e + hz * tp, 0]] : [[-hx, e, -hz], [-hx, e, hz], [-hx, e + hz * tp, 0]]); });
        frame(S.x, S.y, S.z, S.yaw + PI / 2);
        ry = roof(hz, hx, e, tp, 0.9, 0.8, 0.26);
        frame(S.x, S.y, S.z, S.yaw);
      }
      if (k === 2 || k === 0) { frame(S.x, S.y, S.z, S.yaw); folk(low ? 3 : 6, -hx - 1.5, hx + 1.5, hz + 1.8, hz + 3.2); frame(S.x, S.y, S.z, S.yaw); }
      var cxh = (gf ? 1 : -1) * hx * 0.45;
      col('#8C8882'); box(G.paint, cxh, e + 1.3, -hz * 0.4, 0.45, 2.0, 0.45);
      col('#F4F8FC'); box(G.snow, cxh, e + 3.36, -hz * 0.4, 0.5, 0.07, 0.5);
      return ry;
    }

    /* -------- grandstands: stepped seats under a canopy, a board along the front, banners at the back -- */
    var FANS = [], STANDS = 0;
    // the crowd's groups (16 at most), each cheering on its own (the engine's crowd: ctx.kart.crowd); CG = the group
    // being placed
    var GRP = [], CG = 0;
    function grp(kind) { if (GRP.length > 15) return CG = 15; GRP.push({ kind: kind, x: 0, y: 0, z: 0, n: 0, r: 0, fans: [] }); return CG = GRP.length - 1; }
    // a fan at d, side sd, out metres from the road's middle, y over it, facing it: [x, y, z, facing, size, die, row,
    // d, side, group]
    function fan(d, sd, out, y, row) { var f = env.frameAt(d), rr = flatR(f); FANS.push([f.pos.x + rr[0] * sd * out, f.pos.y + y, f.pos.z + rr[1] * sd * out, Math.atan2(-rr[0] * sd, -rr[1] * sd) + (R() - 0.5) * 0.6, 0.85 + R() * 0.3, R(), row, d, sd, CG]); }
    // is the place out metres from the road's middle at d (side sd) clear of the rest of the lap and of the chasms?
    function free(d, sd, out, r, nr) { var f = env.frameAt(d), rr = flatR(f), x = f.pos.x + rr[0] * sd * out, z = f.pos.z + rr[1] * sd * out; return clear(x, z, r, d, nr) && !(env.chasmAt && env.chasmAt(x, z, r)); }
    // how far under the road the ground falls, out metres from its middle from d0 to d1 (a stand's or bank's skirt)
    function foot(d0, d1, sd, out) {
      var m = -7;
      if (env.groundAt) for (var d = d0; d <= d1; d += 3) { var f = env.frameAt(d), rr = flatR(f); m = Math.min(m, env.groundAt(f.pos.x + rr[0] * sd * out, f.pos.z + rr[1] * sd * out) - f.pos.y - 1); }
      return Math.max(m, -40);
    }
    // flags on poles every step metres from d0 to d1 (side sd, out from the road's middle, standing y over it), top
    // metres tall, the words of board b and on down them; one mesh for every flag (village-flags), waving
    function flags(d0, d1, step, sd, out, y, top, b) {
      for (var d = d0, k = 0; d < d1; d += step, k++) {
        var f = env.frameAt(d), rr = flatR(f), r = UV_BOARD(b + k);
        frame(f.pos.x + rr[0] * sd * out, f.pos.y + y, f.pos.z + rr[1] * sd * out, Math.atan2(-rr[0] * sd, -rr[1] * sd));
        col('#30353D'); box(G.paint, 0, top / 2 + 0.2, 0, 0.07, top / 2 + 0.2, 0.07);
        [1, -1].forEach(function (fz) {
          var A = G.flag, q0 = A.p.length / 3;
          for (var j = 0; j <= 4; j++) {
            var u = j / 4, v = fz > 0 ? r[3] + (r[1] - r[3]) * u : r[1] + (r[3] - r[1]) * u;
            [[top - Math.min(4.6, top / 2), r[0]], [top, r[2]]].forEach(function (Y) { var p = W([0.08 + 1.32 * u, Y[0], 0.06 * fz]); A.p.push(p[0], p[1], p[2]); A.n.push(FR.s * fz, 0, FR.c * fz); A.uv.push(Y[1], v); A.c.push(u, CG / 16, fz > 0 ? 1 : 0); });
            var q = q0 + j * 2 - 2;
            if (j) { if (fz > 0) A.i.push(q, q + 2, q + 3, q, q + 3, q + 1); else A.i.push(q, q + 3, q + 2, q, q + 1, q + 3); }
          }
        });
      }
    }
    // a bank of standing fans on groomed snow beside the road, level with the snow bank's top, flags along its back:
    // d0..d1 on side sd, in the stretches of it (12 m or more) clear of the rest of the lap and of the chasms
    function bank(d0, d1, sd, b) {
      var ok = [], a = -1;
      for (var d = d0; d <= d1; d += 2) ok.push(free(d, sd, wall + 5, 3, 30));
      for (var i = 0; i <= ok.length; i++) {
        if (i < ok.length && ok[i]) { if (a < 0) a = i; continue; }
        if (a >= 0 && i - a >= 6) {
          // (its back a steep snow slope down to the ground, not a wall, where the ground falls away behind it)
          var e0 = d0 + a * 2, e1 = d0 + (i - 1) * 2, ft = foot(e0, e1, sd, wall + 12);
          col('#E9F0F8'); sweep(G.snow, e0, e1, [[wall + 2.2, -2], [wall + 2.2, 1.3], [wall + 7.5, 1.3], [wall + 7.5 + (1.3 - ft) * 0.4, ft]], sd, 3);
          for (var dd = e0 + 1; dd < e1 - 1; dd += low ? 1.6 : 0.7) if (R() > 0.15) fan(dd + (R() - 0.5) * 0.4, sd, wall + 3.2 + R() * 3.6, 1.3, 0);
          flags(e0 + 4, e1 - 2, low ? 18 : 12, sd, wall + 7.2, 1.3, 7, b + (sd > 0 ? 1 : 4));
        }
        a = -1;
      }
    }
    // a band swept upright (world up, not tilted with the road's climb) from d0 to d1 on side sd, prof [[out, up], ...]
    // from the road outward; the faces turned to the road and the sky
    function sweep(A, d0, d1, prof, sd, step) {
      var n = Math.max(1, Math.ceil((d1 - d0) / step)), rows = [];
      for (var i = 0; i <= n; i++) {
        var d = d0 + (d1 - d0) * i / n, f = env.frameAt(d), rr = flatR(f);
        rows.push(prof.map(function (q) { return [f.pos.x + rr[0] * sd * q[0], f.pos.y + q[1], f.pos.z + rr[1] * sd * q[0]]; }));
        rows[i].rr = rr;
      }
      for (i = 0; i < n; i++) for (var j = 0; j < prof.length - 1; j++) {
        var t = [prof[j + 1][0] - prof[j][0], prof[j + 1][1] - prof[j][1]], rr2 = rows[i].rr, nW = [rr2[0] * sd * -t[1], t[0], rr2[1] * sd * -t[1]];
        polyW(A, [rows[i][j], rows[i + 1][j], rows[i + 1][j + 1], rows[i][j + 1]], null, nW);
      }
    }
    function stand(d0, d1, sd, opt) {
      opt = opt || {};
      // (clear of the rest of the lap all along, or cut short where it is not)
      var o = wall + 3.2, ok = [], K = opt.sun ? shadeK((d0 + d1) / 2, sd) : 0;
      // (on the sun's side of the grid (opt.sun): set back till the canopy's shade stops at KEEP, the grid and the line
      // in the sun, with a terrace of standing fans in front of it, level with the snow bank's top)
      if (K > 0) o = Math.max(o, KEEP + K * 7.08 + 0.75);
      var terrace = o > wall + 5;
      for (var d = d0; d <= d1; d += 2) ok.push(free(d, sd, o + 3, 4, 40));
      var a = ok.indexOf(true); if (a < 0) return;
      var b = a; while (b + 1 < ok.length && ok[b + 1]) b++;
      d0 = d0 + a * 2; d1 = Math.min(d1, d0 + (b - a) * 2);
      if (d1 - d0 < 10) return;
      STANDS++;
      var ft = foot(d0, d1, sd, o + 10), ob = o + 5.65 + (0.4 - ft) * 0.4, TY = [1.6, 2.35, 3.1, 3.85], prof = [[o, 0.3], [o, 2.2], [o + 0.25, 2.2], [o + 0.25, TY[0]], [o + 1.45, TY[0]], [o + 1.45, TY[1]], [o + 2.65, TY[1]], [o + 2.65, TY[2]], [o + 3.85, TY[2]], [o + 3.85, TY[3]], [o + 5.05, TY[3]], [o + 5.05, 7.2], [o + 5.35, 7.2], [o + 5.35, 0.3]];
      col('#C3CCD8'); sweep(G.paint, d0, d1, prof, sd, 3);
      // (on a block of snow down to the ground, its back sloping; its ends closed: the steps' outline as upright strips)
      col('#E9F0F8'); sweep(G.snow, d0, d1, [[o - 0.3, ft], [o - 0.3, 0.4], [o + 5.65, 0.4], [ob, ft]], sd, 3);
      [[d0, -1], [d1, 1]].forEach(function (e) {
        var f = env.frameAt(e[0]), rr = flatR(f), tl = Math.hypot(f.tan.x, f.tan.z) || 1, nW = [f.tan.x / tl * e[1], 0, f.tan.z / tl * e[1]], P = function (a, y) { return [f.pos.x + rr[0] * sd * a, f.pos.y + y, f.pos.z + rr[1] * sd * a]; };
        var tops = [[o, o + 0.25, 2.2], [o + 0.25, o + 1.45, TY[0]], [o + 1.45, o + 2.65, TY[1]], [o + 2.65, o + 3.85, TY[2]], [o + 3.85, o + 5.05, TY[3]], [o + 5.05, o + 5.35, 7.2]];
        col('#C3CCD8'); tops.forEach(function (q) { polyW(G.paint, [P(q[0], 0.3), P(q[1], 0.3), P(q[1], q[2]), P(q[0], q[2])], null, nW); });
        col('#E9F0F8'); polyW(G.snow, [P(o - 0.3, ft), P(ob, ft), P(o + 5.65, 0.4), P(o - 0.3, 0.4)], null, nW);
      });
      col('#E8213F'); sweep(G.paint, d0, d1, [[o - 0.03, 2.2], [o - 0.03, 2.45], [o + 0.28, 2.45]], sd, 3);
      if (terrace) {
        col('#E9F0F8'); sweep(G.snow, d0, d1, [[wall + 2.2, -2], [wall + 2.2, 1.3], [o + 0.05, 1.3]], sd, 3);
        [[d0, -1], [d1, 1]].forEach(function (e) {
          var f = env.frameAt(e[0]), rr = flatR(f), tl = Math.hypot(f.tan.x, f.tan.z) || 1, P = function (a, y) { return [f.pos.x + rr[0] * sd * a, f.pos.y + y, f.pos.z + rr[1] * sd * a]; };
          polyW(G.snow, [P(wall + 2.2, -2), P(o, -2), P(o, 1.3), P(wall + 2.2, 1.3)], null, [f.tan.x / tl * e[1], 0, f.tan.z / tl * e[1]]);
        });
      }
      // (the benches, in runs of colour)
      var SEAT = ['#1F4FA8', '#E8213F', '#F4F6FA', '#2E7BEA'];
      for (var t = 0; t < 4; t++) for (var ds = d0, ns = 0; ds < d1 - 0.5; ds += 6, ns++) {
        var x0 = o + 1.1 + t * 1.2; col(SEAT[(ns + t) % 4]);
        sweep(G.paint, ds, Math.min(d1, ds + 5.8), [[x0, TY[t]], [x0, TY[t] + 0.42], [x0 + 0.3, TY[t] + 0.42]], sd, 3);
      }
      // (the canopy, its front posts, and its snow)
      col('#E9EDF2'); sweep(G.paint, d0 - 1, d1 + 1, [[o - 0.4, 6.7], [o + 5.9, 7.5]], sd, 3);
      col('#1F4FA8'); sweep(G.paint, d0 - 1, d1 + 1, [[o + 5.9, 7.3], [o - 0.4, 6.5]], sd, 3);
      col('#E8213F'); sweep(G.paint, d0 - 1, d1 + 1, [[o - 0.4, 6.5], [o - 0.4, 6.7]], sd, 3);
      col('#F4F8FC'); sweep(G.snow, d0 - 0.8, d1 + 0.8, [[o - 0.3, 6.92], [o - 0.15, 7.08], [o + 5.8, 7.78]], sd, 3);
      col('#30353D');
      for (var dp = d0 + 1; dp < d1; dp += 9) { var fp = env.frameAt(dp), rp = flatR(fp); frame(fp.pos.x + rp[0] * sd * (o + 0.15), fp.pos.y, fp.pos.z + rp[1] * sd * (o + 0.15), 0); box(G.paint, 0, 4.4, 0, 0.09, 2.25, 0.09); }
      // (the boards along the front, to the road)
      col('#FFFFFF');
      var nb = 0;
      for (var db = d0 + 0.5; db + 6 <= d1; db += 6.4, nb++) {
        // (seen from the road, a board's left end is up the lap on the right-hand side, back down it on the left)
        var fa = env.frameAt(db), fb = env.frameAt(db + 6), ra = flatR(fa), rb = flatR(fb), x1 = terrace ? wall + 2.3 : o - 0.03, r = UV_BOARD(nb + (opt.board || 0)), y0 = terrace ? 1.3 : 1.25, y1 = y0 + 0.85;
        var A0 = [fa.pos.x + ra[0] * sd * x1, fa.pos.z + ra[1] * sd * x1, fa.pos.y], B0 = [fb.pos.x + rb[0] * sd * x1, fb.pos.z + rb[1] * sd * x1, fb.pos.y];
        var Lf = sd > 0 ? B0 : A0, Rt = sd > 0 ? A0 : B0;
        polyW(G.sign, [[Lf[0], Lf[2] + y0, Lf[1]], [Rt[0], Rt[2] + y0, Rt[1]], [Rt[0], Rt[2] + y1, Rt[1]], [Lf[0], Lf[2] + y1, Lf[1]]], [[r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]]]);
      }
      // (flags on poles along the back, their words down them, to the road; on the sun's side, no taller than keeps
      // their shade off the road)
      var bTop = K > 0 ? Math.min(10.6, (o + 5.2 - KEEP) / K) : 10.6;
      if (bTop > 8.5) flags(d0 + 3, d1 - 2, low ? 16 : 11, sd, o + 5.7, 0, bTop, 2 + (opt.board || 0));
      // the fans' places: four rows, and standing on the terrace, three loose rows behind the boards
      var gap = opt.gap || (low ? 1.25 : 0.85);
      for (var tier = 0; tier < 4; tier++) for (var df = d0 + 0.8; df < d1 - 0.8; df += gap) if (R() > 0.12) fan(df + (R() - 0.5) * 0.3, sd, o + 0.85 + tier * 1.2 + (R() - 0.5) * 0.2, TY[tier], tier);
      if (terrace) for (var row = 0; row < 3 && wall + 3.1 + row * 1.5 < o - 0.8; row++) for (var dt2 = d0 + 0.6; dt2 < d1 - 0.6; dt2 += low ? 2.2 : 1.05) if (R() > 0.25) fan(dt2 + (R() - 0.5) * 0.5, sd, wall + 3.1 + row * 1.5 + (R() - 0.5) * 0.5, 1.3, 0);
    }

    /* -------- the place: where everything stands, from the course -- */
    var built = { lodge: 0, chalets: 0 };
    var dl = env.at('line', 0);
    // the stands both sides of the grid (the start's group, with the lodge's and chalets' people), and round the
    // hairpin's outside
    grp('line');
    stand(dl - 48, dl + 6, SHADY, { board: 0, sun: true });
    stand(dl - 48, dl + 4, SUNNY, { board: 3 });
    var HP = (SEG.filter(function (s) { return s[0] === 'hairpin'; })[0]) || null, hpOut = HP && HP[3] < 0 ? 1 : -1, dh = HP ? env.at('hairpin', 0) : dl - 120, hpLen = HP ? HP[2] * Math.abs(HP[3]) * PI / 180 : 50;
    if (HP) { grp('hairpin'); stand(dh + 4, dh + hpLen - 3, hpOut, { board: 5, gap: low ? 1.6 : 0.95 }); }
    // the timing pylon by the line, past the sunny stand's end (its shade falls away from the road there): the gantry
    // board's own picture (no draw of its own)
    (function () {
      var d = dl + 7.5, f = env.frameAt(d), rr = flatR(f), x = wall + 3.4, P = [f.pos.x + rr[0] * SUNNY * x, f.pos.z + rr[1] * SUNNY * x];
      if (!clear(P[0], P[1], 2, d, 30)) return;
      frame(P[0], f.pos.y, P[1], Math.atan2(-rr[0] * SUNNY, -rr[1] * SUNNY) - SUNNY * 0.5);
      col('#30353D'); box(G.paint, 0, 4.0, 0, 0.35, 4.0, 0.35); col('#121418'); box(G.paint, 0, 9.0, 0, 2.3, 1.15, 0.28);
      col('#E8213F'); box(G.paint, 0, 10.25, 0, 2.3, 0.1, 0.3);
      col('#FFFFFF'); poly(G.clock, [[-2.2, 8.0, 0.3], [2.2, 8.0, 0.3], [2.2, 10.0, 0.3], [-2.2, 10.0, 0.3]], [[0, 0], [1, 0], [1, 1], [0, 1]]);
      signZ(-2.2, 2.2, 8.0, 10.0, -0.3, -1, UV_BOARD(5));
      col('#7D7A76'); box(G.paint, 0, 0.3, 0, 0.8, 0.5, 0.8);
    })();
    // spectators along the climb from the hairpin to the stands
    if (HP) { grp('run'); var c0 = dh + hpLen + 6, c1 = dl - 50; while (c1 < c0) c1 += L; if (c1 - c0 >= 12 && c1 - c0 <= 400) { bank(c0, c1, -1, 0); bank(c0, c1, 1, 0); } }
    // the crowds out on the lap (aspenCrowdPlan): grandstands both sides of every gap's landing, banks at its take-off,
    // at the drops and the S-bends, each its own group
    var keys = {};
    (env.crowdPlan || aspenCrowdPlan(env)).forEach(function (r, q) {
      CG = keys[r[4]] != null ? keys[r[4]] : (keys[r[4]] = grp(r[3]));
      if (r[3] === 'jump') stand(r[0], r[1], r[2], { board: q }); else bank(r[0], r[1], r[2], q);
    });
    CG = 0;
    // the lodge past the line, on the sunny side
    var LS = site(env.at('line', 30), SUNNY, wall + 15, 18);
    // (the terraces stand level with the top of the snow bank along the road, so what is on them shows over it)
    var LIFT = 1.3;
    if (LS) { LS.y += LIFT; lodge(LS); built.lodge = 1; }
    // the chalets: past the lodge, across the road from it, and by the hairpin (a phone: three)
    var CH = [[env.at('line', 66), SUNNY, wall + 10, 0.12], [env.at('line', 30), SHADY, wall + 10, -0.08], HP ? [dh - 10, hpOut, wall + 10, 0.1] : [env.at('line', 100), SHADY, wall + 10, 0.1],
      [env.at('line', 86), SUNNY, wall + 11, -0.15], [env.at('line', 52), SHADY, wall + 12, 0.18]];
    // (one on the sun's side of the straight turns its eaves to the road and stands back till its shade stops at KEEP)
    CH.slice(0, low ? 3 : 5).forEach(function (c, k) {
      CG = HP && k === 2 ? 1 : 0;
      var K = HP && k === 2 ? 0 : shadeK(c[0], c[1]), out = K > 0 ? Math.max(c[2], chaletOut(k, K, LIFT)) : c[2];
      // (on the ground where it falls away from the road)
      var S = site(c[0], c[1], out, 8, c[3]); if (S && !env.crowdAt(S.x, S.z, 2)) { S.y = Math.min(S.y, env.groundAt ? env.groundAt(S.x, S.z) : S.y) + LIFT; chalet(S, k, K > 0); built.chalets++; }
    });

    /* -------- the meshes -- */
    var meshes = [];
    function mesh(name, A, mat, cast) {
      if (!A.i.length) return null;
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(A.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(A.n, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(A.uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(A.c, 3));
      g.setIndex(A.i); g.computeBoundingSphere();
      var m = new THREE.Mesh(g, mat); m.castShadow = !!cast && !low; m.receiveShadow = true; m.userData.gmKart = true;
      env.scene.add(env.named('village-' + name, m)); meshes.push(m);
      return m;
    }
    mesh('wood', G.wood, M.wood, true); mesh('paint', G.paint, M.paint, true); mesh('glass', G.glass, M.glass); mesh('snow', G.snow, M.snow, true);
    mesh('sign', G.sign, M.sign, true); mesh('flags', G.flag, M.flag);
    if (CLOCK) mesh('clock', G.clock, new THREE.MeshBasicMaterial({ map: CLOCK.tex, toneMapped: false }));

    /* -------- the timing board, live: the lap and the clock, from GO ('start' is the 3-2-1's start: GO 3 s on) -- */
    // (and the start's crowd cheers: at the 3-2-1, louder at GO, every lap, the finish)
    ctx.on('start', function () { cheer(0, 0.6); if (CLOCK) { CLOCK.t0 = -2; CLOCK.lap = 1; CLOCK.done = false; CLOCK.go = 0; } });
    ctx.on('lap', function (e) { cheer(0, 0.7); if (CLOCK && e && e.lap) CLOCK.lap = e.lap; });
    ctx.on('finish', function () { cheer(0, 1); if (CLOCK) CLOCK.done = true; });
    var tick = 0;
    env.updates.push(function (c2, t, dt) {
      if (!CLOCK) return;
      if (CLOCK.t0 === -2) CLOCK.t0 = t + 3;
      if (CLOCK.t0 > 0 && !CLOCK.go && t >= CLOCK.t0) { CLOCK.go = 1; cheer(0, 1); }
      tick += dt; if (tick < 0.2) return; tick = 0;
      if (CLOCK.t0 < 0) { drawClock('LAP 1/' + LAPS, 'GM'); return; }
      if (CLOCK.done) { drawClock('FINISH', 'WAGMI'); return; }
      var s = Math.max(0, t - CLOCK.t0), m = Math.floor(s / 60), sec = s - m * 60;
      drawClock('LAP ' + Math.min(CLOCK.lap, LAPS) + '/' + LAPS, m + ':' + (sec < 10 ? '0' : '') + sec.toFixed(1));
    });

    /* -------- the crowd, its groups, and what they do when they cheer: they play faster and jump, their flags fly,
    // snow and paper go up (village-toss: points, one draw; the dead ones parked far below) -- */
    var crowdInfo = FANS.length ? vilCrowd(ctx, env, FANS, CR) : null;
    if (crowdInfo) crowdInfo.cheer = cheer;
    FANS.forEach(function (F0, q) { var g = GRP[F0[9]]; g.fans.push(q); g.x += F0[0]; g.y += F0[1]; g.z += F0[2]; g.n++; });
    GRP.forEach(function (g) { if (g.n) { g.x /= g.n; g.y /= g.n; g.z /= g.n; } g.fans.forEach(function (q) { g.r = Math.max(g.r, Math.hypot(FANS[q][0] - g.x, FANS[q][2] - g.z)); }); });
    var NP = low ? 140 : 320, PP = new Float32Array(NP * 3).fill(-1e4), PV = new Float32Array(NP * 3), PL = new Float32Array(NP), PC = [], pn = 0, hooked = false;
    for (var q = 0; q < NP; q++) { TMPC.set(['#FFFFFF', '#F4F8FC', '#E8213F', '#FFC93C', '#1F4FA8', '#7FC4F0'][q % 6]); PC.push(TMPC.r, TMPC.g, TMPC.b); }
    var pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(PP, 3)); pg.setAttribute('color', new THREE.Float32BufferAttribute(PC, 3));
    var toss = new THREE.Points(pg, new THREE.PointsMaterial({ size: 0.55, vertexColors: true })); toss.frustumCulled = false; toss.userData.gmKart = true; env.scene.add(env.named('village-toss', toss));
    // group id cheers, k 0..1 (a fresh cheer throws its snow and paper)
    function cheer(id, k) {
      var g = GRP[id]; if (!g || !g.n || !(k > 0)) return;
      // (thrown up and out over the road, from in front of the fans: clear of a stand's canopy)
      if (k > CR.ex[id] + 0.3) for (var j = Math.round(k * (low ? 28 : 64)); j > 0; j--) {
        var F0 = FANS[g.fans[(R() * g.n) | 0]], i = (pn++ % NP) * 3, fx = Math.sin(F0[3]), fz = Math.cos(F0[3]), o = 1 + R() * 2.5;
        PP[i] = F0[0] + fx; PP[i + 1] = F0[1] + 1.6; PP[i + 2] = F0[2] + fz; PV[i] = fx * o + R() - 0.5; PV[i + 1] = 3 + R() * 4 * k; PV[i + 2] = fz * o + R() - 0.5; PL[i / 3] = 2 + R();
      }
      CR.ex[id] = Math.max(CR.ex[id], Math.min(1, k));
    }
    env.updates.push(function (c2, t, dt) {
      dt = dt > 0 ? Math.min(dt, 0.1) : 0;
      for (var q = 0; q < 16; q++) { CR.ex[q] = Math.max(0, CR.ex[q] - dt * 0.4); CR.gt[q] += dt * (1 + 1.3 * CR.ex[q]); }
      var live = 0;
      for (var j = 0; j < NP; j++) if (PL[j] > 0) {
        var i = j * 3, dr = 1 - 1.2 * dt; live++; PL[j] -= dt;
        PV[i] *= dr; PV[i + 2] *= dr; PV[i + 1] = Math.max(-2.2, PV[i + 1] - 7 * dt);
        PP[i] += PV[i] * dt; PP[i + 1] = PL[j] > 0 ? PP[i + 1] + PV[i + 1] * dt : -1e4; PP[i + 2] += PV[i + 2] * dt;
      }
      if (live || toss.userData.live) pg.attributes.position.needsUpdate = true;
      toss.userData.live = live;
      // (the engine's crowd, from its first update on: the groups registered once, its cheers move them; big air and
      // big landings move every group in reach too, whoever flies)
      if (hooked || !c2.kart || !c2.kart.on) return;
      hooked = true;
      c2.kart.crowd(GRP.map(function (g, id) { return { id: id, pos: [g.x, g.y, g.z], n: g.n, r: g.r + 30 }; }).filter(function (g) { return g.n; }));
      c2.kart.on('cheer', function (e) { cheer(e.id, e.k); });
      ['air', 'land'].forEach(function (n) {
        c2.kart.on(n, function (e) { if (e.big && e.pos) GRP.forEach(function (g, q) { var d = Math.hypot(e.pos.x - g.x, e.pos.z - g.z); if (d < g.r + 40) cheer(q, (e.trick ? 1 : 0.8) * Math.min(1, 1 - (d - g.r) / 40)); }); });
      });
    });
    env.village = { built: built, stands: STANDS, fans: FANS.length, crowd: crowdInfo, meshes: meshes.length, sunny: SUNNY, groups: GRP, cheer: cheer, ex: CR.ex };
  }

  // The crowd: every fan a card of one of the looks, turned to the camera, playing its frames (one draw for them all),
  // from the baked film (VIL_CROWD; the bake films it live here, through the kart kit's ctx.kart.impostors); none if
  // the sheet is not there
  function vilCrowd(ctx, env, FANS, CR) {
    var THREE = env.THREE, low = env.low, AS = ctx.assets, RF = aspenRng(4417);
    var MOVE = { cheer: [1.15, 1], danceTwist: [4 / 3, 0], danceLambada: [1, 0], danceCabbage: [1.25, 0] };
    var CW = 1.24, CH = 2.8, FOOT = 0.06, n, F, COLS, ROWS, atlas = null, atlasTex = null, cycles = [];
    if (ctx.kart && ctx.kart.step) ctx.kart.step('crowd');
    var t0 = performance.now();
    if (AS && AS.texture) {
      var SH = VIL_CROWD[low ? 'low' : 'high'], bk = AS.ready(SH.id) ? AS.texture(SH.id) : null, bt = bk && bk.map;
      if (!bt && low) { SH = VIL_CROWD.high; bk = AS.ready(SH.id) ? AS.texture(SH.id) : null; bt = bk && bk.map; }
      var bROWS = Math.ceil(VIL_FAN_LOOKS.length * SH.frames / SH.cols);
      if (bt && bt.image && bt.image.width === SH.cols * SH.cell[0] && bt.image.height === bROWS * SH.cell[1]) {
        n = VIL_FAN_LOOKS.length; F = SH.frames; COLS = SH.cols; ROWS = bROWS;
        bt.colorSpace = THREE.NoColorSpace; bt.wrapS = bt.wrapT = THREE.ClampToEdgeWrapping; bt.anisotropy = 1;
        bt.minFilter = THREE.LinearMipmapLinearFilter; bt.magFilter = THREE.LinearFilter; bt.generateMipmaps = true; bt.needsUpdate = true;
        atlasTex = bt; cycles = VIL_FAN_LOOKS.map(function (lk) { return (MOVE[lk[0]] || MOVE.cheer)[0]; });
      }
    }
    if (!atlasTex) return null;
    var NFAN = FANS.length, look = new Int16Array(NFAN), lastK = -1, lastK2 = -1;
    FANS.forEach(function (F0, q) { var k, tries = 0; do { k = Math.floor(RF() * n); } while (tries++ < 10 && (k === lastK || k === lastK2)); lastK2 = lastK; lastK = k; look[q] = k; });
    var quad = new THREE.PlaneGeometry(CW, CH).translate(0, CH / 2 - FOOT, 0);
    // (aDim: dim, hue, group, and the cheering look a dancer turns to while its group cheers)
    var aFan = new Float32Array(NFAN * 4), aDim = new Float32Array(NFAN * 4), HUES = [0.9, 1.8, 2.7, 3.6, 4.6], CHEERS = [];
    VIL_FAN_LOOKS.forEach(function (lk, k) { if (lk[0] === 'cheer') CHEERS.push(k); });
    FANS.forEach(function (F0, q) {
      var lk = VIL_FAN_LOOKS[look[q]] || [], words = !!lk[1];
      aFan[q * 4] = look[q]; aFan[q * 4 + 1] = RF(); aFan[q * 4 + 2] = (0.9 + RF() * 0.2) / (cycles[look[q]] || 1.15); aFan[q * 4 + 3] = words || RF() < 0.5 ? 1 : -1;
      aDim[q * 4] = 0.9 + RF() * 0.1; aDim[q * 4 + 1] = RF() < 0.55 ? HUES[Math.floor(RF() * HUES.length)] : 0; aDim[q * 4 + 2] = F0[9] || 0; aDim[q * 4 + 3] = lk[0] === 'cheer' ? look[q] : CHEERS[Math.floor(RF() * CHEERS.length)];
    });
    quad.setAttribute('aFan', new THREE.InstancedBufferAttribute(aFan, 4)); quad.setAttribute('aDim', new THREE.InstancedBufferAttribute(aDim, 4));
    // (each fan plays on its group's clock, faster and jumping while the group cheers: CR)
    var U = { uAtlas: { value: atlasTex }, uEx: { value: CR.ex }, uGT: { value: CR.gt }, uF: { value: F }, uCols: { value: COLS }, uRows: { value: ROWS }, uTint: { value: new THREE.Color(1, 1, 1) } };
    var cardMat = new THREE.ShaderMaterial({
      uniforms: Object.assign(THREE.UniformsUtils.clone(THREE.UniformsLib.fog), U), fog: true,
      vertexShader: [
        'attribute vec4 aFan; attribute vec4 aDim; uniform float uEx[16], uGT[16], uF, uCols, uRows; varying vec2 vUv; varying vec2 vDim;',
        '#include <fog_pars_vertex>',
        'void main() {',
        '  vec4 c = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0); float s = length((modelMatrix * instanceMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xyz);',
        '  vec3 tc = cameraPosition - c.xyz; tc.y = 0.0; float tl = length(tc); vec3 rt = tl > 1e-4 ? vec3(tc.z, 0.0, -tc.x) / tl : vec3(1.0, 0.0, 0.0);',
        '  int g = int(aDim.z + 0.5); float T = uGT[g], ex = uEx[g];',
        '  float ph = fract(T * aFan.z + aFan.y), fr = min(floor(ph * uF), uF - 1.0), cell = (ex > 0.4 ? aDim.w : aFan.x) * uF + fr, row = floor(cell / uCols), col = cell - row * uCols;',
        '  vUv = vec2((col + (aFan.w > 0.0 || ex > 0.4 ? uv.x : 1.0 - uv.x)) / uCols, (row + uv.y) / uRows);',
        '  float hop = ex * (0.12 + 0.4 * ex) * max(0.0, sin(T * 9.0 + aFan.y * 40.0));',
        '  vec3 p = c.xyz + rt * position.x * s + vec3(0.0, position.y * s + hop, 0.0);',
        '  vec4 mvPosition = viewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mvPosition; vDim = aDim.xy;',
        '  #include <fog_vertex>',
        '}',
      ].join('\n'),
      fragmentShader: [
        'uniform sampler2D uAtlas; uniform vec3 uTint; varying vec2 vUv; varying vec2 vDim;',
        '#include <fog_pars_fragment>',
        'vec3 hue(vec3 c, float a) { vec3 y = mat3(0.299, 0.596, 0.211, 0.587, -0.274, -0.523, 0.114, -0.322, 0.312) * c; float cs = cos(a), sn = sin(a); y.yz = vec2(y.y * cs - y.z * sn, y.y * sn + y.z * cs); return max(mat3(1.0, 1.0, 1.0, 0.956, -0.272, -1.106, 0.621, -0.647, 1.703) * y, 0.0); }',
        'void main() {',
        '  vec4 e = texture2D(uAtlas, vUv); if (e.a < 0.42) discard;',
        '  vec3 c = e.rgb; if (vDim.y > 0.0) c = mix(c, hue(c, vDim.y), smoothstep(0.26, 0.42, max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b))));',
        '  gl_FragColor = vec4(c * c * 2.0 * uTint * vDim.x, 1.0);',
        '  #include <tonemapping_fragment>',
        '  #include <colorspace_fragment>',
        '  #include <fog_fragment>',
        '}',
      ].join('\n'),
    });
    var cards = new THREE.InstancedMesh(quad, cardMat, NFAN); cards.name = 'village-fans';
    FANS.forEach(function (F0, q) { var s = 0.95 + (F0[4] - 0.85) / 3; cards.setMatrixAt(q, new THREE.Matrix4().makeScale(s, s, s).setPosition(F0[0], F0[1], F0[2])); });
    cards.instanceMatrix.needsUpdate = true; cards.userData.gmKart = true; cards.userData.atlas = atlas; cards.frustumCulled = false; env.scenery.add(cards);
    var info = cards.userData.crowd = { cards: NFAN, looks: n, frames: F, baked: !atlas, ms: Math.round(performance.now() - t0) };
    return info;
  }

  /* --------------------------------------------------- the hazards -- */
  // (owned by the TRACK agent) The mountain's own chaos, at zero engine cost: the course's hazards (COURSE.hazards in
  // course.js, all model: false) drawn here from ctx.kart.hazards() each frame, in the course's order:
  //   crossing: a giant snowball (a lost ski and pole rolled up in it) that waits in the bank and rolls across the
  //     Camelback (and a second down the creek climb), its line lit first (the engine's);
  //   topple: an ice pillar at the side of the switchback run that shudders (its shadow across the road, the
  //     engine's), falls across the road in a burst of powder, lies there as a log to jump off, and stands up again;
  //   meteor: avalanche chunks off the ridge: a block of snow and ice coming down its powder trail onto the ring (the
  //     engine's) on the Ridge Run, bursting into powder where it lands.
  // A hazard's skin (course.js, the engine ignores it) swaps the look: topple 'fir' a snow-laden spruce, meteor
  // 'icicle' a cluster of icicles off the gorge walls over the creek's S.
  // And the ski-patrol fences round the engine's grind rails (COURSE.rails): orange B-net under the rail, padded posts,
  // banded marker poles with pennants at both ends.
  // Everything is placed by the course (its fractions, the track's frames), never by metres, so it follows the lap.
  // Phone ('low'): fewer facets; about 4.5k triangles and 16 meshes for six hazards and three fences (most of them only
  // drawn near their hazard: the puffs, the falling chunks, the heaps).
  function aspenHazards(ctx, env) {
    var THREE = env.THREE, low = env.low, L = env.L, wrap = env.wrap;
    var HZ = { models: [], meshes: [] }, list = env.COURSE.hazards || [], span = env.wall + 1.5;
    var BASIS = new THREE.Matrix4(), VA = new THREE.Vector3(), VB = new THREE.Vector3(), VQ = new THREE.Vector3(), VUP = new THREE.Vector3(0, 1, 0);
    // (set on the road's frame at d metres, x right of the centre and y up, facing along it: local x is the road's
    // left, y up, z along)
    function place(o, d, x, y) { var f = env.frameAt(d); o.position.copy(f.pos).addScaledVector(f.right, x).addScaledVector(f.up, y); BASIS.makeBasis(f.left, f.up, f.tan); o.quaternion.setFromRotationMatrix(BASIS); }

    /* the kit: low-poly lumps and prisms, painted per vertex and merged, one draw per model */
    // (a lump: an icosahedron pushed in and out by a smooth field of its own position, so its shared corners stay
    // together; flat-shaded, as packed snow and ice read)
    function lump(r, detail, amp, seed, sx, sy, sz) {
      var g = new THREE.IcosahedronGeometry(r, detail), p = g.attributes.position, a = seed * 1.37;
      for (var i = 0; i < p.count; i++) {
        var x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 1 + amp * (Math.sin(x * 2.3 + a) * Math.sin(y * 2.9 + a * 0.7) + 0.6 * Math.sin(z * 3.7 + y * 1.3 + a * 1.9));
        p.setXYZ(i, x * k * (sx || 1), y * k * (sy || 1), z * k * (sz || 1));
      }
      g.computeVertexNormals();
      return g;
    }
    // (painted: one colour, or a function of the vertex position, and a slight jitter face by face)
    function paint(g, col, jit) {
      if (g.index) g = g.toNonIndexed();
      if (g.attributes.uv) g.deleteAttribute('uv');
      if (!g.attributes.normal) g.computeVertexNormals();
      var p = g.attributes.position, c = new Float32Array(p.count * 3), C = new THREE.Color();
      for (var i = 0; i < p.count; i++) {
        if (typeof col === 'function') C.set(col(p.getX(i), p.getY(i), p.getZ(i))); else C.set(col);
        var j = 1 - (jit || 0) * (((Math.floor(i / 3) * 7919) % 11) / 11);
        c[i * 3] = C.r * j; c[i * 3 + 1] = C.g * j; c[i * 3 + 2] = C.b * j;
      }
      g.setAttribute('color', new THREE.BufferAttribute(c, 3));
      return g;
    }
    // (painted pieces into one geometry: position, normal, colour)
    function mergeVC(parts) {
      var n = 0; parts.forEach(function (g) { n += g.attributes.position.count; });
      var P = new Float32Array(n * 3), N = new Float32Array(n * 3), C = new Float32Array(n * 3), o = 0;
      parts.forEach(function (g) { P.set(g.attributes.position.array, o); N.set(g.attributes.normal.array, o); C.set(g.attributes.color.array, o); o += g.attributes.position.count * 3; });
      var out = new THREE.BufferGeometry();
      out.setAttribute('position', new THREE.BufferAttribute(P, 3)); out.setAttribute('normal', new THREE.BufferAttribute(N, 3)); out.setAttribute('color', new THREE.BufferAttribute(C, 3));
      out.computeBoundingSphere();
      return out;
    }
    function vcMat(o) { return new THREE.MeshStandardMaterial(Object.assign({ vertexColors: true, roughness: 0.82, metalness: 0, flatShading: true }, o || {})); }
    function add(m, shadow) { m.name = 'aspen-hz'; m.userData.gmKart = true; m.castShadow = !!shadow && !low; m.receiveShadow = false; env.scene.add(m); HZ.meshes.push(m); return m; }
    var SNOW = '#F2F6FA', SNOW2 = '#DCE6F0', ICE = '#9ED3EE', ICE2 = '#5FA7D6', ICE3 = '#D6F0FB';

    // a burst of powder (one per hazard that makes one): white blobs, out and up and fading, thinned near the lens
    function puff() {
      var parts = [], n = low ? 6 : 10;
      // (soft: each blob's normals straight out from its middle, so it shades round, not faceted)
      function soft(g) { var p = g.attributes.position, nn = new Float32Array(p.count * 3), v = new THREE.Vector3(); for (var i = 0; i < p.count; i++) { v.set(p.getX(i), p.getY(i), p.getZ(i)).normalize(); nn[i * 3] = v.x; nn[i * 3 + 1] = v.y; nn[i * 3 + 2] = v.z; } g.setAttribute('normal', new THREE.BufferAttribute(nn, 3)); return g; }
      for (var q = 0; q < n; q++) { var a = q / n * Math.PI * 2 + (q % 2) * 0.4, r0 = 0.45 + (q % 3) * 0.3; parts.push(paint(soft(lump(0.42 + (q % 3) * 0.14, 1, 0.06, q + 3)).translate(Math.cos(a) * r0, 0.3 + (q % 4) * 0.22, Math.sin(a) * r0), SNOW)); }
      parts.push(paint(soft(lump(0.7, 1, 0.05, 21)).translate(0, 0.6, 0), SNOW));
      var m = add(new THREE.Mesh(mergeVC(parts), vcMat({ transparent: true, opacity: 0.5, depthWrite: false, roughness: 1, flatShading: false, emissive: '#B8C8DA', emissiveIntensity: 0.35 })));
      m.renderOrder = 2; m.visible = false;
      return { m: m, t: -1, T: 0.9, s0: 1, s1: 3 };
    }
    function firePuff(P, at, T, s0, s1) { P.m.position.copy(at); P.m.quaternion.identity(); P.t = 0; P.T = T; P.s0 = s0; P.s1 = s1; P.m.visible = true; }
    function stepPuff(P, dt, cam) {
      if (P.t < 0) return;
      P.t += dt; var u = P.t / P.T;
      if (u >= 1) { P.t = -1; P.m.visible = false; return; }
      var e = 1 - (1 - u) * (1 - u);
      P.m.scale.set(P.s0 + (P.s1 - P.s0) * e, (P.s0 + (P.s1 - P.s0) * e) * (0.6 + 0.4 * (1 - u)), P.s0 + (P.s1 - P.s0) * e);
      P.m.position.y += dt * 0.6;
      // (never a white-out: a quarter as thick within 4 m of the lens, full past 12)
      P.m.material.opacity = 0.5 * (1 - u) * (1 - u) * (0.25 + 0.75 * smooth(4, 12, P.m.position.distanceTo(cam.position)));
    }

    /* the giant snowball (crossing): r 1.4, the engine's own reach for a crossing */
    function snowball(q) {
      var r = 1.4, parts = [];
      parts.push(paint(lump(r, 2, 0.07, 5), function (x, y, z) { return y < -0.6 ? SNOW2 : SNOW; }, 0.06));
      // (clumps it has picked up, a lost ski and pole)
      for (var c = 0; c < (low ? 3 : 6); c++) { var a = c * 2.1, b = c * 1.3 - 1.2; parts.push(paint(lump(0.32 + (c % 3) * 0.08, 0, 0.15, c + 9).translate(Math.cos(a) * Math.cos(b) * r, Math.sin(b) * r, Math.sin(a) * Math.cos(b) * r), c % 2 ? SNOW : SNOW2, 0.05)); }
      // (the ski and its tip; the pole and its grip)
      [new THREE.BoxGeometry(0.11, 1.9, 0.05).translate(0, 1.55, 0), new THREE.BoxGeometry(0.11, 0.25, 0.05).rotateX(0.5).translate(0, 2.55, 0.12)].forEach(function (g) { parts.push(paint(g.rotateZ(0.5).rotateY(0.6), '#E0263C')); });
      [[0.025, 1.6, 1.6, '#2A2F38'], [0.045, 0.22, 2.3, '#FFC93C']].forEach(function (c) { parts.push(paint(new THREE.CylinderGeometry(c[0], c[0], c[1], 5).translate(0, c[2], 0).rotateX(-0.7).rotateY(-1.1), c[3])); });
      var m = add(new THREE.Mesh(mergeVC(parts), vcMat({ roughness: 0.9 })), true); m.name = 'aspen-hz-snowball';
      return function (h, t, dt, cam) {
        // (before GO, and between rolls, it waits in the bank on its side; never parked in the road)
        var x = h.phase === 'roll' || Math.abs(h.x) > span * 0.8 ? h.x : (h.side || 1) * span;
        place(m, h.d, x, r - 0.05); m.rotateZ(x / r);
        m.updateMatrixWorld();
        m.visible = !h.lens && m.position.distanceTo(cam.position) > r + 1.2;
      };
    }

    /* the ice pillar (topple): its length the engine's (the road, the shoulder its foot stands on, and a metre) */
    function pillar(q, C) {
      var len = 2 * env.hw + Math.max(0.6, Math.min(2, env.shoulder - 0.6)) + 1, foot = env.hw + Math.max(0.6, Math.min(2, env.shoulder - 0.6));
      var parts = [], seg = low ? 5 : 7, shaftH = len - 2.4, fir = list[q].skin === 'fir';
      // (a fir: a trunk and tiers of branches, snow on each, as slim as the engine's 1 m either side it hits)
      if (fir) {
        var tr = new THREE.CylinderGeometry(0.16, 0.34, len, 6); tr.translate(0, len / 2, 0); parts.push(paint(tr, '#4E3A2C', 0.1));
        for (var i = 0, n = low ? 6 : 9; i < n; i++) { var y0 = 1.6 + i * (len - 4) / n, cr = 1.25 - 0.8 * i / n, cg = new THREE.ConeGeometry(cr, 3.4, low ? 5 : 7); cg.translate(0, y0 + 1.7, 0); parts.push(paint(cg, (function (b) { return function (x, y, z) { return y > b + 2.4 || x > 0.75 ? SNOW : '#2E5440'; }; })(y0), 0.14)); }
      } else {
      var shaft = new THREE.CylinderGeometry(0.55, 0.85, shaftH, seg, low ? 3 : 6, false); shaft.translate(0, shaftH / 2, 0);
      shaft = shaft.toNonIndexed();
      // (faceted ice: its rings pushed in and out, and twisted a little up its height)
      var sp = shaft.attributes.position;
      for (var i = 0; i < sp.count; i++) { var x = sp.getX(i), y = sp.getY(i), z = sp.getZ(i), tw = y * 0.035, k = 1 + 0.12 * Math.sin(y * 1.7 + Math.atan2(z, x) * 3); sp.setXYZ(i, (x * Math.cos(tw) - z * Math.sin(tw)) * k, y, (x * Math.sin(tw) + z * Math.cos(tw)) * k); }
      shaft.computeVertexNormals();
      parts.push(paint(shaft, function (x, y) { var b = y / shaftH; return Math.abs(b - 0.33) < 0.035 || Math.abs(b - 0.71) < 0.025 ? SNOW : b < 0.15 ? ICE2 : b > 0.85 ? ICE3 : ICE; }, 0.12));
      // (the crown: a cluster of crystals, and snow lying on it)
      [[0, 0, 0, 2.6, 0.5], [0.45, 0.2, 0.5, 1.8, 0.35], [-0.4, -0.3, -0.45, 1.6, 0.32]].forEach(function (c, n) {
        var g = new THREE.ConeGeometry(c[4], c[3], 5); g.translate(0, c[3] / 2, 0); g.rotateZ(c[0]); g.rotateX(c[2]); g.translate(c[1], shaftH - 0.2, c[1] * 0.5);
        parts.push(paint(g, n ? ICE3 : ICE, 0.1));
      });
      parts.push(paint(lump(0.75, 0, 0.18, 31, 1.1, 0.45, 1.1).translate(0, shaftH + 0.05, 0), SNOW));
      parts.push(paint(lump(0.95, 0, 0.12, 37, 1.15, 0.35, 1.15).translate(0, shaftH * 0.33, 0), SNOW));
      }
      var foot0 = new THREE.Group(), pivot = new THREE.Group(); foot0.add(pivot); env.scene.add(foot0);
      var m = new THREE.Mesh(mergeVC(parts), fir ? vcMat() : vcMat({ roughness: 0.25, metalness: 0.05, emissive: '#1B4A70', emissiveIntensity: 0.18 }));
      m.userData.gmKart = true; m.castShadow = !low; m.name = fir ? 'aspen-hz-fir' : 'aspen-hz-pillar'; pivot.add(m); HZ.meshes.push(m);
      // (its footing, still: a drift of snow and two rocks, into the static mesh)
      C.push(function (side, d) {
        var g0 = paint(lump(1.7, low ? 0 : 1, 0.12, 41, 1.2, 0.42, 1.0), SNOW, 0.05), g1 = paint(lump(0.7, 0, 0.2, 43, 1, 0.7, 1).translate(0.9 * side, 0.2, 1.1), '#5B6470', 0.1), g2 = paint(lump(0.5, 0, 0.2, 47, 1, 0.7, 1).translate(1.3 * side, 0.1, -1.0), '#6E7783', 0.1);
        return [[g0, d, side * (foot + 0.4), -0.1], [g1, d, side * (foot + 0.4), 0], [g2, d, side * (foot + 0.4), 0]];
      });
      var P = puff(), prev = 'idle';
      return function (h, t, dt, cam) {
        var side = h.side || 1, u = h.u, ph = h.phase;
        place(foot0, h.d, side * foot, 0);
        var ang = ph === 'fall' ? u * u * Math.PI / 2 : ph === 'lie' ? Math.PI / 2 : ph === 'rise' ? (1 - smooth(0, 1, u)) * Math.PI / 2 : ph === 'warn' ? (Math.sin(t * 24) * 0.035 + 0.05 * u) * u : 0;
        pivot.rotation.set(0, 0, -side * ang);
        // (the slam: powder all along it as it lands)
        if (ph === 'lie' && prev !== 'lie' && dt > 0) { foot0.updateMatrixWorld(); env.track.pointAt(h.d, side * (foot - len * 0.45), 0.2, VQ); firePuff(P, VQ, 0.8, 1.4, 3.2); }
        prev = ph;
        stepPuff(P, dt, cam);
      };
    }

    /* the avalanche chunk (meteor): down from the ridge (the engine's path: 34 m back, 46 m up) onto its ring */
    function avalanche(q) {
      var parts = [], ice = list[q].skin === 'icicle';
      // (icicles: long blue spikes in a frozen clump, tips down; or a block of snow and ice)
      if (ice) {
        parts.push(paint(lump(0.75, 0, 0.15, 63, 1.3, 0.5, 1.1).translate(0, 0.9, 0), SNOW, 0.06));
        [[0, 0, 3.4, 0.42], [0.55, 0.3, 2.5, 0.3], [-0.5, -0.2, 2.8, 0.34], [0.15, -0.5, 2, 0.26], [-0.3, 0.5, 1.7, 0.22]].forEach(function (c, n) { var g = new THREE.ConeGeometry(c[3], c[2], 5); g.rotateX(Math.PI); g.translate(c[0], 0.8 - c[2] / 2, c[1]); parts.push(paint(g, n % 2 ? ICE3 : ICE, 0.12)); });
      } else {
        parts.push(paint(lump(1.0, low ? 0 : 1, 0.16, 51, 1.15, 0.85, 1), SNOW, 0.08));
        parts.push(paint(lump(0.7, 0, 0.2, 53).translate(0.8, 0.35, 0.3), ICE, 0.1));
        parts.push(paint(lump(0.6, 0, 0.2, 57).translate(-0.7, -0.2, -0.5), SNOW2, 0.06));
        if (!low) parts.push(paint(lump(0.45, 0, 0.2, 59).translate(0.1, 0.8, -0.7), ICE3, 0.1));
      }
      var rock = add(new THREE.Mesh(mergeVC(parts), vcMat(ice ? { roughness: 0.2, emissive: '#1B4A70', emissiveIntensity: 0.25 } : { roughness: 0.6, emissive: '#1B3A58', emissiveIntensity: 0.12 })), true); rock.name = ice ? 'aspen-hz-icicle' : 'aspen-hz-avalanche';
      // (its trail: a cone of powder streaming back up its path)
      var trail = new THREE.ConeGeometry(1.15, 7.5, low ? 6 : 10, 1, true); trail.translate(0, 3.9, 0);
      var trailM = new THREE.MeshBasicMaterial({ color: '#EEF5FC', transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide });
      var tail = add(new THREE.Mesh(trail, trailM)); tail.renderOrder = 2;
      rock.visible = tail.visible = false;
      // (what it leaves: a heap of snow on the road, sinking away)
      var heap = add(new THREE.Mesh(mergeVC([paint(lump(1.3, low ? 0 : 1, 0.15, 61, 1.3, 0.45, 1.2), ice ? ICE3 : SNOW, 0.06)]), vcMat({ roughness: ice ? 0.3 : 0.95 })));
      heap.visible = false; heap.name = 'aspen-hz-heap';
      var P = puff(), prev = 'idle', spin = 0;
      return function (h, t, dt, cam) {
        var ph = h.phase, fallU = ph === 'warn' ? clamp((h.u - 0.3) / 0.7, 0, 1) : 0;
        rock.visible = tail.visible = fallU > 0;
        if (rock.visible) {
          env.track.pointAt(wrap(h.d - 34), h.x * 0.5, 46, VA); env.track.pointAt(wrap(h.d), h.x, 0.9, VB);
          rock.position.copy(VA).lerp(VB, fallU * fallU);
          spin += dt * 5; if (ice) rock.rotation.set(0.25 * Math.sin(spin), spin * 0.3, 0); else rock.rotation.set(spin, spin * 0.7, spin * 0.4);
          // (shrunk away near the lens, as the engine's own: one coming down on your kart passes the camera)
          var sc = Math.max(0.01, smooth(3, 10, rock.position.distanceTo(cam.position)));
          rock.scale.setScalar(sc);
          tail.position.copy(rock.position); tail.quaternion.setFromUnitVectors(VUP, VQ.copy(VA).sub(VB).normalize()); tail.scale.set(sc, sc * (0.6 + 0.6 * fallU), sc);
          trailM.opacity = 0.45 * sc;
        }
        // (the strike: powder thrown up and out, and the heap left on the road)
        if (ph === 'smoke' && prev === 'warn' && dt > 0) { env.track.pointAt(wrap(h.d), h.x, 0.1, VQ); firePuff(P, VQ, 1.0, 1.0, 3.6); }
        heap.visible = ph === 'smoke';
        if (heap.visible) { place(heap, h.d, h.x, -0.05 - 0.9 * h.u * h.u); heap.scale.setScalar(1 - 0.3 * h.u); }
        prev = ph;
        stepPuff(P, dt, cam);
      };
    }

    /* the static dressing, in one mesh: the pillar's footing, the fences' posts, sleeves and marker poles */
    var STATIC = [], FOOT = [];
    var draw = list.map(function (h, q) {
      if (h.model !== false) return null;
      if (h.kind === 'crossing') return snowball(q);
      if (h.kind === 'topple') return pillar(q, FOOT);
      if (h.kind === 'meteor') return avalanche(q);
      return null;
    });
    // (each pillar's footing where the race stands it: the course's place and side, read as the engine reads them)
    var k0 = 0;
    list.forEach(function (h) {
      if (h.kind !== 'topple' || h.model !== false) return;
      var mk = FOOT[k0++], v = Number(h.at); if (!mk || !isFinite(v)) return;
      mk(h.side === 'left' ? -1 : 1, wrap(Math.abs(v) <= 1 ? v * L : v)).forEach(function (e) { var o = new THREE.Object3D(); place(o, e[1], e[2], e[3]); o.updateMatrix(); e[0].applyMatrix4(o.matrix); STATIC.push(e[0]); });
    });

    /* the ski-patrol fences round the grind rails: B-net, padding, marker poles */
    var RAIL = (env.COURSE.rails || []).map(function (R) {
      if (R.from == null || R.to == null) return null;
      var d0 = (Math.abs(R.from) <= 1 ? R.from * L : R.from), d1 = (Math.abs(R.to) <= 1 ? R.to * L : R.to), x = Array.isArray(R.x) ? +R.x[0] : +R.x || 0;
      return { d0: wrap(d0), len: wrap(d1 - d0), x: clamp(x, -(env.wall - 0.6), env.wall - 0.6), h: clamp(R.h != null ? R.h : 0.5, 0.3, 1.2) };
    }).filter(Boolean);
    if (RAIL.length) {
      // (the net: orange mesh, see-through, from the snow up to under the rail)
      var cv = document.createElement('canvas'); cv.width = cv.height = 64;
      var g2 = cv.getContext('2d'); g2.clearRect(0, 0, 64, 64); g2.strokeStyle = '#FF6A13'; g2.lineWidth = 5;
      g2.beginPath(); g2.moveTo(0, 0); g2.lineTo(64, 64); g2.moveTo(64, 0); g2.lineTo(0, 64); g2.moveTo(-32, 32); g2.lineTo(32, -32); g2.moveTo(32, 96); g2.lineTo(96, 32); g2.moveTo(-32, 32); g2.lineTo(32, 96); g2.moveTo(32, -32); g2.lineTo(96, 32); g2.stroke();
      g2.fillStyle = '#FF6A13'; g2.fillRect(0, 0, 64, 5);
      var tex = new THREE.CanvasTexture(cv); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = low ? 1 : 4;
      if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
      var nets = RAIL.map(function (R) { return env.band(R.d0 + 0.2, R.d0 + R.len - 0.2, [[R.x, 0.05], [R.x, R.h - 0.13]], 0, { step: 2, tile: 0.9 }); });
      var net = add(new THREE.Mesh(env.merge(nets), new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.9 })));
      net.name = 'aspen-hz-net';
      RAIL.forEach(function (R) {
        // (orange padding on the engine's posts, every 2.5 m from 0.6 in, as it puts them)
        for (var u = 0.6; u < R.len; u += 2.5) {
          var pad = paint(new THREE.BoxGeometry(0.2, 0.3, 0.2), '#FF6A13'); var o = new THREE.Object3D(); place(o, R.d0 + u, R.x, R.h - 0.3); o.updateMatrix(); pad.applyMatrix4(o.matrix); STATIC.push(pad);
        }
        // (a banded marker pole and its pennant at both ends)
        [0, R.len].forEach(function (u, e) {
          var bands = [];
          for (var b = 0; b < 4; b++) { var c = new THREE.CylinderGeometry(0.06, 0.06, 0.55, 6); c.translate(0, 0.275 + b * 0.55, 0); bands.push(paint(c, b % 2 ? '#F4F6FA' : '#FF6A13')); }
          var fl = new THREE.BufferGeometry(); fl.setAttribute('position', new THREE.Float32BufferAttribute([0, 2.15, 0, 0, 1.75, 0, 0, 1.95, e ? -0.55 : 0.55, 0, 1.75, 0, 0, 2.15, 0, 0, 1.95, e ? -0.55 : 0.55], 3)); fl.computeVertexNormals();
          bands.push(paint(fl, '#FFC93C'));
          var o = new THREE.Object3D(); place(o, R.d0 + u, R.x + (R.x > 0 ? 0.25 : -0.25), 0); o.updateMatrix();
          bands.forEach(function (g) { g.applyMatrix4(o.matrix); STATIC.push(g); });
        });
      });
    }
    if (STATIC.length) add(new THREE.Mesh(mergeVC(STATIC), vcMat({ roughness: 0.75, side: THREE.DoubleSide }))).name = 'aspen-hz-static';

    // each frame: every hazard drawn where the race says it is (ctx.kart.hazards(), the course's order)
    env.updates.push(function (ctx2, t, dt) {
      var HS = ctx2.kart && ctx2.kart.hazards ? ctx2.kart.hazards() : null, cam = ctx2.camera || ctx.camera;
      if (!HS) return;
      for (var q = 0; q < draw.length; q++) if (draw[q] && HS[q]) draw[q](HS[q], t, dt || 0, cam);
    });
    return HZ;
  }

  /* ------------------------------------------------------- the racers -- */
  // The eight, in order: the four STARS first (White Whale, Lux, Pepe, Doge: a Mog keeps them), then Lord Black
  // Diamond, Whiteout One, Whiteout Two and Moon Cat, every one on a snowmobile (ride: 'sled', notes/roster.md 7).
  // Bike Tyson sits this one out (his body is his bike).
  // A slot races as its own racer (id = slot: letters only, as the roster's add-on registers them) the moment the
  // runtime lists that id in ctx.kart.racers; until then its stand-in (`stand`), renamed, on the slot's own sled.
  // Each row: the racer's colour (HUD, standings: the cast colours of aspen-gp.json), its sled (body, trim: the
  // character's own def, so a stand-in's sled already looks like the real one's) and a race number of its own
  // (single digits: no two alike in the field).
  var SLEDS = true;
  var ROSTER = [
    { slot: 'whitewhale', name: 'White Whale', stand: 'whale', color: '#1FB5C9', sled: ['#1B3A6B', '#EEF3F8'], number: 7 },
    { slot: 'lux', name: 'Lux', stand: 'shiba', color: '#E8B830', sled: ['#1E2129', '#E8B830'], number: 3 },
    { slot: 'pepe', name: 'Pepe', stand: 'pepe', color: '#4FA03A', number: 1 },
    { slot: 'doge', name: 'Doge', stand: 'doge', color: '#F2DDB4', number: 2 },
    { slot: 'lordblackdiamond', name: 'Lord Black Diamond', stand: 'bear', color: '#FF2E3A', sled: ['#16171C', '#FF2E3A'], number: 6 },
    { slot: 'whiteoutone', name: 'Whiteout One', stand: 'bull', color: '#FF6A1A', sled: ['#FF6A1A', '#1B1E24'], number: 4 },
    { slot: 'whiteouttwo', name: 'Whiteout Two', stand: 'bull', color: '#18B8A8', sled: ['#18B8A8', '#1B1E24'], number: 5 },
    { slot: 'mooncat', name: 'Moon Cat', stand: 'mooncat', color: '#9B5DE5', number: 8 },
  ];
  function racer(ctx, k) {
    var R = ROSTER[k % ROSTER.length], K = ctx.kart, own = K && Array.isArray(K.racers) && K.racers.indexOf(R.slot) >= 0;
    var o = { name: R.name, number: R.number };
    if (SLEDS) o.ride = 'sled';
    // (a stand-in rides the slot's sled and wears its colour; a racer of its own paints its sled as its def says)
    if (!own && R.sled) { o.paint = R.sled[0]; o.accent = R.sled[1]; o.jersey = R.color; }
    if (K && typeof K.racer === 'function') { var e = K.racer(own ? R.slot : R.stand, o); if (e && e.object) { e.color = R.color; return e; } }
    return K.greybox({ paint: R.color, helmet: '#F4F6FA', driver: '#E9C29A', name: R.name });
  }

  /* ------------------------------------------------------- the world -- */
  // the world's own state for update(): the build's env (below), once built
  var ENV = null;
  // (the parts' asset lists, deduped in place: a part may have pushed an id another part also uses)
  [ASSETS, LOW_ASSETS].forEach(function (A) { var u = A.filter(function (id, i) { return typeof id === 'string' && A.indexOf(id) === i; }); A.length = 0; u.forEach(function (id) { A.push(id); }); });

  GameMog.world({
    assets: ASSETS,
    theme: { sky: '#1F4FA8', fog: '#D6E6F4', ink: '#14203A', panel: '#F4F8FC', accent: '#FF3B5C', font: 'Bungee' },
    // the runtime's 'kart' preset graded for daylight snow, the world lit by its own sky (look.js: ASPEN_GRAPHICS)
    graphics: ASPEN_GRAPHICS,
    camera: ASPEN_CAMERA,
    track: { width: 16, points: POINTS },
    // the soundtrack: the library's drum and bass track (a first-party world plays its own music; loads with the rest)
    music: { track: 'music-hyper-ultra-racing' },
    // four laps. The engine's Aspen opt-ins (notes/engine.md; each ignored by an engine without it, none of them
    // named by Meme Kart): drift assist (tap + steer drifts), drift charge 1.6 (Gold and MOG about once a lap for tap
    // drivers on this lap's short bends: notes/engine.md 8), and the snow effects (powder, snow kicked up by every
    // impact, the hype flashes and whooshes, the downhill rush and its wind, pale ruts, snow off the road). The course
    // carries the rest: every gap cleared (breakClear), the bigger air and the hazards' snow look (course.js);
    // the crowd's groups are village.js's (ctx.kart.crowd)
    kart: { laps: ASPEN_LAPS, class: 'normal', course: COURSE, driftAssist: true, driftCharge: 1.6,
      fx: { powder: true, impacts: true, hype: true, rush: true, wind: true, skids: '#DCE8F4', skidOpacity: 0.5, offroad: { grass: '#EEF3F8', shoulder: '#E2EAF2', mud: '#C9D6E2' } },
      // a phone's own list (prelude: every part adds its phone needs to LOW_ASSETS; none = the laptop's list)
      lowAssets: LOW_ASSETS.length ? LOW_ASSETS : undefined },

    build: function (ctx) {
      var THREE = ctx.THREE, track = ctx.track, L = track.length, hw = track.halfWidth;
      function wrap(d) { d %= L; return d < 0 ? d + L : d; }
      function inside(d, a, b) { d = wrap(d); a = wrap(a); b = wrap(b); return a <= b ? d >= a && d < b : d >= a || d < b; }
      // the breaks in metres (x across: the whole corridor unless the course says)
      var wall = hw + COURSE.shoulder;
      var BRK = COURSE.breaks.map(function (b) {
        var d0 = b.from * L, d1 = b.to != null ? b.to * L : d0 + (b.len || 8), x = b.x || [-wall - 1, wall + 1];
        return { d0: d0, d1: d1, x0: x[0], x1: x[1], water: !!b.water, full: x[0] <= -hw && x[1] >= hw, look: b.look || COURSE.breakLook || 'void' };
      });
      // the lap's middle (for things placed round it), and its lowest road
      var c = new THREE.Vector3(), ymin = 1e9;
      POINTS.forEach(function (p) { c.x += p[0] / POINTS.length; c.z += p[2] / POINTS.length; ymin = Math.min(ymin, p[1]); });
      var env = ENV = {
        THREE: THREE, scene: ctx.scene, scenery: ctx.scenery, track: track,
        L: L, hw: hw, shoulder: COURSE.shoulder, wall: wall, low: ctx.quality === 'low',
        COURSE: COURSE, ZONE: ZONE, BRK: BRK,
        centre: c, floorY: ymin - 12,
        wrap: wrap, inside: inside,
        frameAt: function (d) { return track.frameAt(wrap(d)); },
        // a place on the lap in METRES: a piece's start (a SEG tag) plus m metres (at() outside build is a fraction)
        at: function (tag, m) { return wrap(at(tag, m) * L); },
        // whether d is in a zone (ZONE, course.js)
        inZone: function (d, name) { var z = ZONE[name]; return inside(d, z[0] * L, z[1] * L); },
        named: function (n, o) { o.name = n; return o; },
        updates: [],
      };
      // a band swept along the lap from d0 to d1 (d0 may be negative: round the line): prof is [[across, up], ...]
      // (or a function (d, frame) giving them), on one side (1 right, -1 left, mirrored) or 0 (across as given); a
      // BufferGeometry with normals and uv (u across the profile 0..1, v the distance / tile). A flat profile run
      // left to right (across rising) faces up, on either side (9 Oct: it faced down before; land.js probes it)
      env.band = function (d0, d1, prof, side, o) {
        o = o || {}; if (d1 < d0) d1 += L;
        var n = Math.max(1, Math.round((d1 - d0) / (o.step || 2))), pos = [], uv = [], idx = [], m = 0, tile = o.tile || 8;
        for (var i = 0; i <= n; i++) {
          var d = d0 + (d1 - d0) * i / n, f = track.frameAt(wrap(d)), P = typeof prof === 'function' ? prof(d, f) : prof;
          m = P.length;
          for (var j = 0; j < m; j++) {
            var a = side === 0 ? P[j][0] : side * P[j][0], up = P[j][1];
            pos.push(f.pos.x + f.right.x * a + f.up.x * up, f.pos.y + f.right.y * a + f.up.y * up, f.pos.z + f.right.z * a + f.up.z * up);
            uv.push(j / Math.max(1, m - 1), d / tile);
          }
          // (wound so a flat band faces UP: normal = right x tan; a mirrored side (-1) runs its profile the other way)
          if (i < n) for (var q = 0; q < m - 1; q++) { var p0 = i * m + q, p1 = p0 + m; if (side < 0) idx.push(p0, p1, p0 + 1, p0 + 1, p1, p1 + 1); else idx.push(p0, p0 + 1, p1, p0 + 1, p1 + 1, p1); }
        }
        var g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        g.setIndex(idx); g.computeVertexNormals();
        return g;
      };
      // indexed geometries with the same attributes merged into one (one draw)
      env.merge = function (list) {
        list = list.filter(Boolean);
        var names = Object.keys(list[0].attributes), out = new THREE.BufferGeometry(), idx = [], base = 0;
        names.forEach(function (k) {
          var size = list[0].attributes[k].itemSize, arr = [];
          list.forEach(function (g) { var a = g.attributes[k].array; for (var i = 0; i < a.length; i++) arr.push(a[i]); });
          out.setAttribute(k, new THREE.Float32BufferAttribute(arr, size));
        });
        list.forEach(function (g) { var ix = g.index ? g.index.array : null, n = g.attributes.position.count; if (ix) for (var i = 0; i < ix.length; i++) idx.push(ix[i] + base); else for (var j = 0; j < n; j++) idx.push(j + base); base += n; });
        out.setIndex(idx);
        return out;
      };
      // the parts, in order (each may push per-frame work onto env.updates)
      aspenLook(ctx, env);
      aspenMountains(ctx, env);
      // (where the crowds stand out on the lap, before the land: it keeps its trees off them, env.crowdAt)
      env.crowdPlan = aspenCrowdPlan(env);
      aspenLand(ctx, env);
      aspenVillage(ctx, env);
      env.hazards = aspenHazards(ctx, env);
    },

    update: function (ctx, t, dt) {
      if (!ENV) return;
      for (var i = 0; i < ENV.updates.length; i++) ENV.updates[i](ctx, t, dt);
    },

    player: function (ctx) { return racer(ctx, 0); },
    rival: function (ctx, k) { return racer(ctx, k); },
  });
})();
