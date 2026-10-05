// AI Alps: an official open world (the owner, 4 Oct 2026: "an amazing ...
// inspired game where the setting is open world Courchevel ski resort. He
// infiltrates a DJ ski resort party looking for a boy. He needs to collect 10K
// GM to bribe the owner of the resort to get information where his target is
// staying. In the meantime, party goers try to take him down but he packs a
// mean punch ... no kicks. just an array of punches, no jumping but he can pick
// up bottles, glasses and beat club goers over the head in pursuit of the big
// boss. The snow, resort surroundings need to be AAA hyperrealistic and
// impressive WOW ... a Cut scene explaining the next level mission every 1500
// GM ... name is AI Alps"). The owner's choices (4 Oct): the hero replicates
// the owner's reference photo of a chrome endoskeleton (the human kit's `endo`
// option); one party with rising stakes, not new zones; a tank who never
// dodges; Funky House from the DJ booth. Every name here is invented: the
// resort's owner, the DJ, the club, the chalet; no real person, venue or brand.
(function () {
  var PI = Math.PI, TAU = PI * 2;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function smooth(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
  function damp(a, b, k, dt) { return a + (b - a) * (1 - Math.exp(-k * dt)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function pick(list, i) { return list[i % list.length]; }
  function hash(n) { var s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
  function rng(seed) { var s = seed >>> 0 || 1; return function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

  /* ------------------------------------------------------ the site plan -- */
  // AI Alps: one party at the foot of the pistes, Courchevel 1850 style, on a
  // winter night. Metres. +z is uphill (north: the club, the pistes, the
  // peaks); -z is downhill (south: the stone balustrade over the valley and the
  // village lights far below). Every part (land, resort, party) builds on these
  // anchors, so they must stay where they are; a part that needs to move one
  // changes it here, for all of them.
  var SITE = {
    bounds: { x: [-104, 104], z: [-92, 112] },     // walkable; the edges are walls of chalets, trees, fences and the balustrade
    spawn: [-84, -84, 35],                          // he walks up out of the dark woods on the south-west shoulder
    terrace: { x: 0, z: 0, w: 66, d: 46, y: 3.0 },  // the party deck: flat, packed snow and boards
    stage: { x: 0, z: 25, w: 20, d: 9, top: 1.25, face: 180 },  // DJ stage at the north edge of the deck, facing south (-z); its floor is 1.25 m above the deck
    booth: [0, 5.2, 24],                            // the DJ booth / the PA's centre: where the music comes from
    dance: { x: 0, z: 8, r: 13 },                   // the dance floor in front of the stage
    iceBar: { x: -27, z: 4, len: 11, yaw: 90 },     // a bar of ice blocks, lit blue from inside, its long side facing the floor (+x)
    champBar: { x: 27, z: 4, len: 11, yaw: -90 },   // the champagne bar: timber, backlit shelves of bottles
    lounges: [[-24, -15], [24, -15], [0, -19]],     // fire pits ringed by lounge chairs and heaters
    vip: { x: 40, z: 24, w: 15, d: 11, y: 5.4 },    // the raised VIP deck where the owner watches; a ramp comes down to the terrace at its south-west corner
    club: { x: 0, z: 39, w: 36, d: 16, h: 13 },     // the club chalet behind the stage: stone base, timber, a glass front
    balustrade: { z: -64, x: [-70, 70] },           // stone balustrade along the valley edge
    path: [[-88, -91], [-80, -76], [-66, -60], [-48, -45], [-30, -32], [-16, -24]], // the trodden path up from the woods to the deck
    piste: { x: [-48, 22], z: [62, 260] },          // the floodlit piste climbing north behind the club
    lift: { a: [56, 48], b: [96, 420] },            // a chairlift up the east side (bottom station inside the bounds' north-east corner)
    chalets: [                                      // hotel chalets: [x, z, width, depth, floors, yawDeg]; they wall the east and west sides
      [-72, 34, 22, 14, 4, 90], [-76, 6, 18, 13, 5, 90], [-72, -22, 20, 14, 4, 90], [-90, -48, 14, 12, 3, 90],
      [74, 2, 20, 14, 4, -90], [78, -28, 18, 13, 5, -90], [66, -52, 16, 12, 3, -70], [76, 34, 16, 12, 3, -90],
      [-40, 66, 18, 12, 3, 180], [34, 70, 16, 12, 3, 180],
    ],
    valley: { y: -260, z: -900 },                   // where the village lights lie below the balustrade
  };
  SITE.vipRamp = { x: SITE.vip.x - 4, half: 2.2, z1: SITE.vip.z - SITE.vip.d / 2, z0: SITE.vip.z - SITE.vip.d / 2 - 10 };
  // A phone or a small screen (the runtime's own rule for ctx.quality 'low', which is not known until build): a smaller
  // crowd there (main.js civilians, party.js ZONES), since a phone draws and animates every person the desktop does.
  var LOWQ = (function () { try { return matchMedia('(pointer: coarse)').matches || Math.min(screen.width || 1280, screen.height || 720) < 600; } catch (e) { return false; } })();
  // The snow behind the chalets' ring of fences, the shoulder under the west chalet and the piste above the club's fence:
  // open ground nobody can walk to from the party. A metre cell of the runtime's walking map that is open but never reached
  // from the deck, covered (play/apply/enclosed.py, from the world's colliders) with these [x0, z0, x1, z1] and closed with
  // colliders in main.js, so the heat never sends a man in there where he cannot get out (the fight playtest found them
  // stuck at the fences, 90 m off). Run it again when a fence, a chalet or a collider of the deck moves.
  SITE.enclosed = [[-104,-92,-91,112],[-104,-88,-90,112],[-104,-86,-89,112],[-104,-82,-87,112],[-104,-79,-86,112],[-104,-77,-85,112],[-104,-74,-84,112],[-104,-39,-83,112],[-104,-37,-82,112],[-104,-35,-81,112],[-104,-34,-80,112],[-104,-32,-68,-4],[-104,23,-65,112],[-104,47,-63,112],[-104,49,-61,112],[-104,51,-59,112],[-104,53,-57,112],[-104,54,-56,112],[-104,55,-54,112],[-104,57,-52,112],[-104,59,-50,112],[-104,61,-12,112],[-104,62,4,112],[-104,63,17,112],[-104,64,104,112],[-84,-92,104,-90],[-83,-92,104,-88],[-82,-92,104,-86],[-81,-92,104,-85],[-80,-92,104,-83],[-79,-92,104,-82],[-78,-92,104,-80],[-77,-92,104,-79],[-76,-92,104,-77],[-75,-92,104,-76],[-73,-92,104,-74],[43,60,104,112],[44,59,104,112],[45,42,104,112],[65,-61,104,-41],[67,-61,104,-40],[68,-61,104,-39],[68,-9,104,19],[69,-9,104,22],[70,-92,104,-38],[70,-10,104,112],[72,-12,104,112],[73,-92,104,112]];

  // The ground: a gentle slope up to the north, flat pads where things stand,
  // the piste steepening behind the club, a lip at the balustrade with the
  // valley falling away below it, and a little roll so it never reads as a
  // plane. The runtime walks on this (open.ground) and the snow mesh is built
  // from it, so feet meet snow. Cheap: it runs for every actor every frame.
  // (land, 4 Oct: inside the bounds rise() is exactly what it was. Beyond them each term now eases off with a
  // matched slope instead of growing without end, so H stays the ground you see out to the mountains: the piste
  // climbs ~180 m by z 420 (it was 585), the sides level out ~115 m up, and the valley floor settles near
  // SITE.valley.y = -260 from z -700 on (the old curve was 14 km down at z -900). Build anything beyond the bounds
  // on H as before; land.js adds the far mountains on top of it as LAND.h(x, z). No anchor moved.)
  // (land, 5 Oct: beyond the bounds' south edge (z < -92) the walls framing the valley at the balustrade's ends
  // widen faster (fw grows 1.8 m per metre, was 0.35), so they are 40-45 degree wooded slopes with cliff bands, not
  // 60-75 degree walls. H inside the bounds is unchanged (w is 0 there). No anchor moved.)
  function rise(x, z) {
    var ax = Math.abs(x), w = 0;
    var y = z > -92 ? 0.045 * (z + 64) : -1.26 - 4.5 * (1 - Math.exp((z + 92) / 100));   // the long slope
    if (z > 52) { var u = z - 52; y += u < 60 ? 0.004 * u * u + 0.12 * u : 21.6 + 300 * (1 - Math.exp((60 - u) / 500)); }   // the piste steepens
    if (z < -64) {                                                    // the valley falls away past the balustrade, but not on the
      var v = -64 - z; w = Math.max(0, v - 28);                       // wooded shoulders beyond its ends (which, far out, fall too)
      var hw = 60 + w * 0.4, fw = 14 + w * 1.8, k = ax < hw ? 1 : ax > hw + fw ? 0 : 1 - (ax - hw) / fw;
      k = k * k * (3 - 2 * k);
      y -= (v < 28 ? 0.02 * v * v + 0.35 * v : 25.48 + 235 * (1 - Math.exp(-w / 160))) * (k + (1 - k) * 0.9 * smooth(w / 500));
    }
    if (ax > 58) { var s = ax - 58; y += (s < 46 ? 0.012 * s * s : 25.392 + 88.3 * (1 - Math.exp((46 - s) / 80))) * (1 - 0.85 * smooth(w / 350)); }   // the sides climb into a bowl
    return y + Math.sin(x * 0.043 + z * 0.021) * 0.55 + Math.sin(z * 0.067 - x * 0.019 + 1.3) * 0.35;
  }
  // pads: [x, z, halfW, halfD, falloff, y?]; y defaults to the slope at the centre
  var PADS = [
    [SITE.terrace.x, SITE.terrace.z, SITE.terrace.w / 2, SITE.terrace.d / 2, 7, SITE.terrace.y],
    [SITE.club.x, SITE.club.z, SITE.club.w / 2 + 3, SITE.club.d / 2 + 3, 6, SITE.terrace.y + 0.4],
    [SITE.vip.x, SITE.vip.z, SITE.vip.w / 2, SITE.vip.d / 2, 2.5, SITE.vip.y],
  ];
  // (party, 4 Oct: the VIP pad's falloff is 2.5 m (was 5): its bank no longer climbs over the terrace's north-east
  // corner, so the deck stays flat to x 30; the VIP deck reads as a raised deck with snow banked against it. No anchor moved.)
  // (resort, 4 Oct: a chalet's width runs along its local x, which its yaw turns; the pad takes the turned footprint's
  // extents, so a chalet yawed 90 degrees, whose width runs along z, stands wholly on flat ground. No anchor moved.)
  // (resort, 5 Oct: a chalet's pad now lies at the height of the ground 4.5 m out from its front (local +z), not at
  // its centre, so every entrance opens level onto the lawn instead of standing 2-7 m up a bank; the chalets are
  // cut into the slope behind them instead (falloff 6 m). No anchor moved; SITE.chalets is unchanged.)
  SITE.chalets.forEach(function (c) { var a = c[5] * PI / 180, cs = Math.abs(Math.cos(a)), sn = Math.abs(Math.sin(a)), f = c[3] / 2 + 4.5; PADS.push([c[0], c[1], (c[2] * cs + c[3] * sn) / 2 + 2, (c[2] * sn + c[3] * cs) / 2 + 2, 6, rise(c[0] + Math.sin(a) * f, c[1] + Math.cos(a) * f)]); });
  PADS.forEach(function (p) { if (p[5] == null) p[5] = rise(p[0], p[1]); });
  function boxK(x, z, p) {           // 1 inside the pad, falling to 0 over its falloff (rotation-free rectangles)
    var dx = Math.max(0, Math.abs(x - p[0]) - p[2]), dz = Math.max(0, Math.abs(z - p[1]) - p[3]);
    var d = Math.sqrt(dx * dx + dz * dz); if (d >= p[4]) return 0; var t = 1 - d / p[4]; return t * t * (3 - 2 * t);
  }
  function H(x, z) {
    var h = rise(x, z);
    for (var i = 0; i < PADS.length; i++) { var k = boxK(x, z, PADS[i]); if (k > 0) h = h * (1 - k) + PADS[i][5] * k; }
    // the VIP ramp: 10 m long, 4.4 m wide, down the south side of the VIP deck to the terrace's level
    var R = SITE.vipRamp;
    if (Math.abs(x - R.x) < R.half && z > R.z0 && z < R.z1) { var t = (z - R.z0) / (R.z1 - R.z0); h = SITE.terrace.y + (SITE.vip.y - SITE.terrace.y) * t; }
    return h;
  }

  /* ======== land ======== */
  //: AI Alps · land.js: snow, mountains, forests, valley, night. Gives LOOK, LAND_ASSETS, LIGHTS_FOR_SNOW (push
  //: [x, y, z, r, g, b, range(, dx, dy, dz, cosHalf)] or { x, y, z, c, p, r, d, cos }, read every frame), snowCover(m, o)
  //: (o: amount, edge, soft, scale, pools, sparkle, tint, skirt; snowCover(ctx, o) makes a snow material) and
  //: LAND { moon, west, h(x, z), piste { pts, w, masts } }. +z north, +x east.
  //: Generated: edit scripts/.scratch/alps/parts-src/land.js (readable, commented), then run
  //: python3 scripts/.scratch/alps/compact.py scripts/.scratch/alps/parts-src/land.js scripts/.scratch/alps/parts/land.js
  var LIGHTS_FOR_SNOW = [];
  var LAND_ASSETS = ['texture-snow', 'texture-snow-aerial', 'texture-snow-trodden', 'texture-dark-rock', 'heightfield-massif', 'texture-fir-cards'];
  var LAND_MOON = [0.406, 0.643, -0.65], LAND_WEST = [-0.86, -0.51];
  var LAND = { moon: LAND_MOON, west: LAND_WEST, h: null, piste: null };
  var LW = { U: null, hf: null, tex: {} };
  var LOOK = {
    graphics: {
      preset: 'moonlit', exposure: 1.0,
      bloom: { strength: 0.5, threshold: 1.1, radius: 0.42 },
      grade: { contrast: 1.05, saturation: 1.0, warmth: -0.04, vignette: 0.3, grain: 0.012, split: 0.3, highlights: 1.05 },
      // (assembly, 5 Oct: the platform's own hero-following shadow map, graphics.shadows.follow 'hero', replaces the one
      // landUpdate used to steer: centred a little ahead of him where the camera looks, ahead of the camera in a scene)
      shadows: { follow: 'hero', extent: 44, mapSize: 2048 },
      environment: { intensity: 1, extras: function (ctx) { return landEnv(ctx); } },
    },
    camera: { distance: 4.4, height: 1.8, fov: 52 },
  };

  /* -- the terrain -- */
  function landH2(a, b) { var s = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return s - Math.floor(s); }
  function landN(x, z) {
    var i = Math.floor(x), j = Math.floor(z), u = x - i, v = z - j;
    u = u * u * (3 - 2 * u); v = v * v * (3 - 2 * v);
    var a = landH2(i, j), b = landH2(i + 1, j), c = landH2(i, j + 1), d = landH2(i + 1, j + 1);
    return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
  }
  function landRidge(x, z) {
    var s = 0, a = 0.56, w = 1;
    for (var o = 0; o < 6; o++) {
      var n = 1 - Math.abs(landN(x + o * 17.3, z - o * 9.1)); n *= n * w; w = clamp(n * 1.9, 0, 1);
      s += n * a; a *= 0.47;
      var t = x; x = (x * 0.8 - z * 0.6) * 2.07; z = (t * 0.6 + z * 0.8) * 2.07;
    }
    return s;
  }
  function landErode(x, z) {
    var s = 0, a = 0.5, gx = 0, gz = 0;
    for (var o = 0; o < 6; o++) {
      var i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j, ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
      var a0 = landH2(i, j), k1 = landH2(i + 1, j) - a0, k2 = landH2(i, j + 1) - a0, k3 = -k1 - landH2(i, j + 1) + landH2(i + 1, j + 1);
      gx += 12 * fx * (1 - fx) * (k1 + k3 * uz); gz += 12 * fz * (1 - fz) * (k2 + k3 * ux);
      s += a * (2 * (a0 + k1 * ux + k2 * uz + k3 * ux * uz) - 1) / (1 + gx * gx + gz * gz); a *= 0.5;
      var t = x; x = (x * 0.8 - z * 0.6) * 2.03 + 1.7; z = (t * 0.6 + z * 0.8) * 2.03 - 3.1;
    }
    return s;
  }
  // the scanned massif set down six times [x, z, metres a side, turn, height scale]
  var LAND_STAMPS = [[620, -1180, 1500, 2.4, 0.4], [-680, -1150, 1400, -2.2, 0.38], [60, -1400, 1000, 0.5, 0.22],
    [-200, 1260, 1800, PI, 0.32], [1400, 240, 1600, 1.7, 0.3], [-1400, 320, 1600, -1.4, 0.34]];
  function landHf(u, v) {
    var D = LW.hf; if (u <= 0 || v <= 0 || u >= 1 || v >= 1) return 0;
    var x = u * 255, y = v * 255, i = x | 0, j = y | 0, fx = x - i, k = j * 256 + i;
    var a = D[k] + (D[k + 1] - D[k]) * fx, b = D[k + 256] + (D[k + 257] - D[k + 256]) * fx;
    return (a + (b - a) * (y - j)) * smooth(Math.min(u, v, 1 - u, 1 - v) / 0.1);
  }
  function landSh(x, z) { var w = Math.max(0, -92 - z); return (Math.abs(x) - 60 - w * 0.4) / (14 + w * 1.8); }   // 0..1 across the slopes framing the valley
  function landStamps(x, z, out) {
    var s = 0, top = 0;
    for (var i = 0; i < LAND_STAMPS.length; i++) {
      var S = LAND_STAMPS[i], sx = x - S[0], sz = z - S[1], L = S[2], c = Math.cos(S[3]), sn = Math.sin(S[3]);
      if (sx * sx + sz * sz > L * L * 0.5) continue;
      var u = 0.5 + (c * sx - sn * sz) / L, v = 0.5 - (sn * sx + c * sz) / L, h = Math.max(0, landHf(u, v) - 0.01) * S[4] * 1988;
      s += h; if (out && h > top) { top = h; out[0] = u; out[1] = v; out[2] = smooth((h - 30) / 120); out[3] = i; }
    }
    return s;
  }
  function landT(x, z) {   // the ground everywhere: H, and beyond the bounds the mountains
    var h = H(x, z), ox = Math.max(0, Math.abs(x) - 110), oz = Math.max(0, z - 118, -98 - z), i;
    if (ox <= 0 && oz <= 0) return h;
    var o = Math.sqrt(ox * ox + oz * oz), dz = z - 20, r = Math.sqrt(x * x + dz * dz), hf = LW.hf;
    var vf = smooth((-z - 640) / 120) * Math.max(1 - smooth((-z - 1060) / 150), (1 - smooth((Math.abs(x + 0.15 * (z + 640)) - 300) / 260)) * (1 - smooth((-z - 1180) / 140)));
    var env = (40 + 80 * smooth((r - 300) / 800)) * (hf ? 0.5 : 2);
    var wx = x + 90 * landN(x * 0.0017, z * 0.0017), wz = z + 90 * landN(x * 0.0017 + 7.7, z * 0.0017 - 3.1);
    var sh = clamp(0.32 + 0.85 * landErode(wx * 0.0019, wz * 0.0019) + 0.55 * (landRidge(wx * 0.0013 + 5, wz * 0.0013) - 0.3), 0, 1.7);
    var mt = env * (1 - 0.94 * vf) * sh * sh;
    if (hf) mt += landStamps(x, z) * (1 - 0.8 * vf);
    var cr = 0;
    if (z < -92) { var t = landSh(x, z); if (t > -0.1 && t < 1.3) cr = (5 + Math.min(-92 - z, 300) * 0.05) * Math.sin(PI * (t + 0.1) / 1.4) * (landRidge(x * 0.023 + 7, z * 0.019) - 0.32) * 2.2 * smooth((-98 - z) / 18); }
    return h + cr + mt * smooth(o / 220) - 320 * smooth((r - 1480) / 170);
  }
  LAND.h = landT;
  // ski runs [half width, x, z, ...]; the first is the floodlit piste
  var LAND_RUNS = [[32, -13, 62, -6, 200, -22, 380, -64, 600, -96, 820], [9, 56, 48, 96, 420, 128, 700],
    [16, 70, 140, 130, 320, 220, 540, 300, 780], [15, -110, 150, -230, 360, -330, 600, -380, 800]];
  function landRunD(x, z) {
    var best = 1e9;
    for (var i = 0; i < LAND_RUNS.length; i++) for (var R = LAND_RUNS[i], k = 1; k + 3 < R.length; k += 2) {
      var ax = R[k], az = R[k + 1], ux = R[k + 2] - ax, uz = R[k + 3] - az, t = clamp(((x - ax) * ux + (z - az) * uz) / (ux * ux + uz * uz), 0, 1);
      best = Math.min(best, Math.hypot(ax + ux * t - x, az + uz * t - z) - R[0]);
    }
    return best;
  }
  // villages [x, z, radius, lights]
  var LAND_VILLAGES = [[-130, -820, 120, 260], [200, -950, 95, 170], [-40, -1150, 80, 110], [-330, -1050, 60, 60], [330, -1110, 50, 40],
    [-470, -760, 60, 60], [470, -790, 60, 60], [-250, -330, 55, 40], [280, -290, 50, 36], [-560, -470, 45, 26], [600, -420, 45, 26]];
  var LAND_ROADS = [[-200, -700, -60, -900, 140, -1000, -10, -1180, -180, -1290, -290, -1420],
    [140, -1000, 330, -820, 430, -640, 180, -530, 390, -390, 160, -250, 310, -130, 126, -58], [-130, -820, -470, -760, -700, -640]];
  function landForest(x, z, y, ny, nx, nz) {
    var ox = Math.abs(x) - 104, oz = Math.max(z - 112, -92 - z), o = Math.max(ox, oz);
    if (o < 2 || ny < 0.5) return 0;
    var far = smooth((Math.hypot(x, z - 20) - 500) / 400);
    var f = smooth((landN(x * 0.0075 + 3.1, z * 0.0075 - 1.7) * 0.65 + landN(x * 0.026, z * 0.026) * 0.35 + 0.42 + far * 0.45 + 0.4 * smooth((-60 - y) / 120)) / 0.4);
    if (nx != null && ny < 0.9 && Math.hypot(x, z - 20) > 420) { var g = Math.hypot(nx, nz) || 1, u = (x * -nz + z * nx) / g; f *= 1 - smooth((landN(u * 0.018, 3.7) - 0.3) / 0.2) * smooth((0.9 - ny) / 0.15); }   // avalanche paths
    if (y < -180) {
      f *= 1 - 0.3 * smooth((ny - 0.96) / 0.03);
      for (var v = 0; v < LAND_VILLAGES.length; v++) { var V = LAND_VILLAGES[v], d = Math.hypot(x - V[0], z - V[1]); if (d < V[2] * 1.5) f *= smooth((d - V[2] * 0.7) / (V[2] * 0.8)); }
    }
    f = Math.max(f, 1 - smooth((o - 30) / 40));
    f *= smooth((y + 275) / 10) * (1 - smooth((y - 260 - 60 * landN(x * 0.012, z * 0.012)) / 60)) * smooth((ny - 0.5) / 0.14) * smooth(landRunD(x, z) / 9);
    if (z < -60 && z > -400 && Math.abs(x) < 58 + (-64 - z) * 0.4) f *= smooth((-z - 108) / 45);
    return f;
  }

  /* -- shared shaders -- */
  var LAND_GLSL = [
    'float lsH(vec2 p) { vec3 q = fract(vec3(p.xyx)*0.1031); q+=dot(q, q.yzx+33.33); return fract((q.x+q.y)*q.z); }',
    'float lsN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(lsH(i), lsH(i+vec2(1, 0)), f.x), mix(lsH(i+vec2(0, 1)), lsH(i+vec2(1, 1)), f.x), f.y); }',
    'float lsF(vec2 p) { return lsN(p)*0.5+lsN(p*2.03+7.1)*0.25+lsN(p*4.11-3.7)*0.125+lsN(p*8.17+1.3)*0.0625; }',
    'vec3 lsSky2(vec3 d, float warm) {',
    '  float h = d.y, hp = max(h, 0.0); vec2 dh = normalize(d.xz+vec2(1e-5));',
    '  float wv = max(dot(dh, vec2(-0.86, -0.51)), 0.0);',
    '  vec3 c = mix(vec3(0.052, 0.088, 0.138), vec3(0.024, 0.04, 0.078), smoothstep(0.0, 0.2, hp));',
    '  c = mix(c, vec3(0.0145, 0.018, 0.036), smoothstep(0.1, 0.85, hp));',
    '  c+=(vec3(0.14, 0.05, 0.016)*pow(wv, 4.0)*exp(-max(h, -0.02)*14.0)+vec3(0.03, 0.016, 0.03)*pow(wv, 2.0)*exp(-hp*4.0))*warm;',
    '  float mc = max(dot(d, normalize(uMoonDir*vec3(1.0, 0.47, 1.0))), 0.0);',
    '  c+=vec3(0.018, 0.03, 0.052)*pow(mc, 6.0)+vec3(0.05, 0.06, 0.08)*pow(mc, 90.0);',
    '  return mix(c, vec3(0.036, 0.054, 0.088), smoothstep(0.0, -0.08, h));',
    '}',
    'vec3 lsSky(vec3 d) { return lsSky2(d, 1.0); }',
    'vec3 lsAir(vec3 c, vec3 p) {',
    '  vec3 v = p-cameraPosition; float d = length(v); v/=max(d, 1e-3);',
    '  float f = 1.0-exp(-uFogD*uFogD*d*d);',
    '  f = max(f, 1.0 - exp(-d * 0.0003 * exp(-(p.y + 130.0) / 100.0)));',
    '  vec3 fc = mix(uFogC, lsSky2(normalize(vec3(v.x, 0.03+clamp(v.y, -0.3, 0.3)*0.25, v.z)), 0.35)*1.08, smoothstep(120.0, 700.0, d));',
    '  return mix(c, fc, clamp(f, 0.0, 1.0));',
    '}',
    'vec3 lsBump(vec3 p, vec3 n, float h) {',
    '  vec3 dx = dFdx(p), dy = dFdy(p); float hx = dFdx(h), hy = dFdy(h);',
    '  vec3 r1 = cross(dy, n), r2 = cross(n, dx); float det = dot(dx, r1);',
    '  vec3 b = abs(det)*n-sign(det)*(hx*r1+hy*r2);',
    '  return dot(b, b)>1e-20?normalize(b):n;',
    '}',
    'vec3 lsPools(vec3 p, vec3 n) {',
    '  vec3 s = vec3(0.0);',
    '  for (int i = 0; i<16; i++) { if (i>=uLN) break; vec3 L = uLP[i].xyz-p; float d = length(L); float a = clamp(1.0-d/uLP[i].w, 0.0, 1.0);',
    '    s += uLC[i] * a * a * (0.6 + 1.6 / (1.0 + d * d * 0.2)) * clamp((dot(n, L) / max(d, 0.01) + 0.3) / 1.3, 0.0, 1.0); }',
    '  return s;',
    '}',
    'vec3 lsGlint(vec3 p, vec3 n, float dist, float sh, float dens) {',
    '  vec3 V = normalize(cameraPosition-p), o = vec3(0.0);',
    '  for (int k = 0; k < 2; k++) {',
    '    float cs = k==0?64.0:20.0; vec2 c = floor(p.xz*cs+p.y*3.0);',
    '    if (lsH(c + floor(cameraPosition.xz * 2.5) * 0.173 + float(k) * 19.1) < 1.0 - dens * (k == 0 ? 0.008 : 0.004)) continue;',
    '    vec3 f = normalize(n+vec3(lsH(c+1.7)-0.5, 0.0, lsH(c+9.2)-0.5)*1.3);',
    '    vec3 g = uMoonCol*pow(max(dot(normalize(V+uMoonDir), f), 0.0), 28.0)*sh;',
    '    for (int i = 0; i<6; i++) { if (i>=uLN) break; vec3 L = uLP[i].xyz-p; float d = max(length(L), 0.01); float a = clamp(1.0-d/(uLP[i].w*1.3), 0.0, 1.0);',
    '      g+=uLC[i]*a*pow(max(dot(normalize(V+L/d), f), 0.0), 28.0)*2.0; }',
    '    o+=g*(k==0?1.0-smoothstep(3.0, 11.0, dist):smoothstep(4.0, 9.0, dist)*(1.0-smoothstep(16.0, 36.0, dist)));',
    '  }',
    '  return o * 5.0;',
    '}',
    'void lsNear(vec3 p) { if (smoothstep(1.0, 3.0, distance(p, cameraPosition))<fract(52.98*fract(dot(gl_FragCoord.xy, vec2(0.0671, 0.00584))))) discard; }',
  ].join('\n');
  var LAND_LIT = ['float lsShadow() {',   // the moon's shadow here, for lit materials only
    '#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0',
    '  DirectionalLightShadow s = directionalLightShadows[ 0 ];',
    '  return receiveShadow ? getShadow( directionalShadowMap[ 0 ], s.shadowMapSize, s.shadowBias, s.shadowRadius, vDirectionalShadowCoord[ 0 ] ) : 1.0;',
    '#else',
    '  return 1.0;',
    '#endif',
    '}'].join('\n');
  var LAND_UNI = 'uniform vec4 uLP[16]; uniform vec3 uLC[16]; uniform int uLN; uniform vec3 uMoonDir, uMoonCol, uFogC; uniform float uFogD, uTime;\n';
  function landUniforms(THREE) {
    if (LW.U) return LW.U;
    var lp = [], lc = []; for (var i = 0; i < 16; i++) { lp.push(new THREE.Vector4(0, -999, 0, 1)); lc.push(new THREE.Vector3()); }
    LW.U = { uLP: { value: lp }, uLC: { value: lc }, uLN: { value: 0 }, uMoonDir: { value: new THREE.Vector3().fromArray(LAND_MOON).normalize() },
      uMoonCol: { value: new THREE.Vector3(0.62, 0.8, 1.25) }, uFogC: { value: new THREE.Color('#0F1C2C') }, uFogD: { value: 0.0007 }, uTime: { value: 0 } };
    return LW.U;
  }
  function landAt(a, n) { return new THREE.Float32BufferAttribute(a, n); }
  function landWrap(m, key, fn) {
    var prev = m.onBeforeCompile, base = m.customProgramCacheKey, proto = THREE.Material.prototype.customProgramCacheKey;
    m.onBeforeCompile = function (sh, r) { if (prev) prev.call(this, sh, r); fn(sh); };
    m.customProgramCacheKey = function () { return key + '|' + (base === proto ? (prev ? prev.toString() : '') : base.call(m)); };
    m.needsUpdate = true;
    return m;
  }
  function landSurf(ctx, id, o) {
    var m = ctx.assets.surface(id, o), c = LW.tex[id]; if (!m) return null;
    if (c) ['map', 'normalMap', 'roughnessMap'].forEach(function (k) { if (m[k] && c[k]) { m[k].dispose(); m[k] = c[k]; } });
    else LW.tex[id] = { map: m.map, normalMap: m.normalMap, roughnessMap: m.roughnessMap };
    return m;
  }

  /* -- snowCover -- */
  function snowCover(m, o) {
    o = o || {};
    if (m && m.THREE && m.scene) {
      m = landSurf(m, 'texture-snow', { project: o.project || 'box', size: 2.2, roughness: 0.95, normal: 0.8, mottle: 0, color: '#FFFFFF' }) || new THREE.MeshStandardMaterial({ color: '#E2E8F2', roughness: 0.92 });
      o = Object.assign({}, o, { edge: -3 });
    }
    if (!m || !m.isMaterial || m.userData.landSnow) return m;
    var U = landUniforms(THREE), tn = o.tint || [1, 1, 1], own = {
      uSnA: { value: o.amount != null ? o.amount : 1 }, uSnE: { value: o.edge != null ? o.edge : 0.55 }, uSnS: { value: o.soft != null ? o.soft : 0.2 },
      uSnK: { value: o.scale || 2.5 }, uSnP: { value: o.pools != null ? o.pools : 1 }, uSnG: { value: o.sparkle != null ? o.sparkle : 1 },
      uSnT: { value: new THREE.Vector3(tn[0], tn[1], tn[2]) }, uSnY: { value: o.skirt != null ? o.skirt : -1e4 } };
    m.userData.landSnow = own;
    return landWrap(m, 'landSnow', function (sh) {
      Object.assign(sh.uniforms, U, own);
      sh.vertexShader = 'varying vec3 vSnP; varying vec3 vSnN; varying float vSnY;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', [
      '#include <worldpos_vertex>',
      '{ vec4 sp = vec4(position, 1.0); vec3 sn = normal; vSnY = position.y;',
      '#ifdef USE_INSTANCING',
      '  sp = instanceMatrix * sp; sn = mat3(instanceMatrix) * sn;',
      '#endif',
      '  vSnP = (modelMatrix*sp).xyz; vSnN = normalize(mat3(modelMatrix)*sn); }'].join('\n'));
      sh.fragmentShader = sh.fragmentShader.replace('void main() {', LAND_UNI + 'uniform float uSnA, uSnE, uSnS, uSnK, uSnP, uSnG, uSnY; uniform vec3 uSnT; varying vec3 vSnP; varying vec3 vSnN; varying float vSnY;\n' + LAND_GLSL + '\n' + (sh.fragmentShader.indexOf('<lights_pars_begin>') >= 0 ? LAND_LIT : 'float lsShadow() { return 1.0; }') + '\nvoid main() {')
        .replace('#include <color_fragment>', [
      '#include <color_fragment>',
      'vec3 snW = normalize(vSnN); if (!gl_FrontFacing) snW = -snW; float snF = lsF(vSnP.xz*uSnK+vSnP.y*0.7);',
      'float snK = max(smoothstep(uSnE-uSnS, uSnE+uSnS, snW.y+(snF-0.47)*0.55), smoothstep(uSnY+0.1, uSnY-0.06, vSnY+(snF-0.47)*0.25))*uSnA;',
      'diffuseColor.rgb = mix(diffuseColor.rgb*uSnT, vec3(0.86, 0.9, 0.96)*(0.92+0.12*lsN(vSnP.xz*9.0)), snK);'].join('\n'))
        .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.82, snK); metalnessFactor *= 1.0 - snK;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\nfloat snD = distance(vSnP, cameraPosition);\nif (uSnG>0.0&&snK>0.5&&snD<36.0) totalEmissiveRadiance+=lsGlint(vSnP, snW, snD, lsShadow(), uSnG*0.6)*snK;')
        .replace('#include <aomap_fragment>', 'if (uSnP>0.0) reflectedLight.directDiffuse+=diffuseColor.rgb*lsPools(vSnP, snW)*uSnP;\n#include <aomap_fragment>');
    });
  }

  /* -- the build -- */
  function landBuild(ctx) {
    var THREE = ctx.THREE, scene = ctx.scene, low = ctx.quality === 'low', U = landUniforms(THREE), i, j;
    var md = U.uMoonDir.value;
    LW.low = low; LW.tex = {};
    var hf = ctx.assets.heightfield && ctx.assets.heightfield('heightfield-massif');
    LW.hf = LW.hfTex = null;
    if (hf && hf.data && hf.width === hf.height && hf.width >= 256) {
      var n = hf.width, f = n / 256, D = new Float32Array(65536);
      for (j = 0; j < 256; j++) for (i = 0; i < 256; i++) { var s = 0; for (var b = 0; b < f; b++) for (var a = 0; a < f; a++) s += hf.data[(j * f + b) * n + i * f + a]; D[j * 256 + i] = s / (f * f); }
      LW.hf = D; LW.hfTex = landHfTex(ctx, hf);
    }
    var moon = new THREE.DirectionalLight('#A3BCFF', 1.3);
    moon.position.copy(md).multiplyScalar(150); moon.castShadow = true;
    moon.shadow.mapSize.set(low ? 1024 : 2048, low ? 1024 : 2048);
    LW.shE = low ? 34 : 46;
    var sc = moon.shadow.camera; sc.left = -LW.shE; sc.right = LW.shE; sc.top = LW.shE; sc.bottom = -LW.shE; sc.near = 1; sc.far = 340; sc.updateProjectionMatrix();
    moon.shadow.bias = -0.0003; moon.shadow.normalBias = 0.035; moon.shadow.radius = 2;
    scene.add(moon); scene.add(moon.target); LW.moon = moon;
    U.uMoonCol.value.set(moon.color.r, moon.color.g, moon.color.b).multiplyScalar(0.44);
    scene.add(new THREE.HemisphereLight('#4A67A0', '#202C44', 0.42));
    scene.fog = new THREE.FogExp2('#0F1C2C', U.uFogD.value);
    U.uFogC.value.copy(scene.fog.color);
    var RN = LAND_RUNS[0], masts = [];
    for (var k = 1; k + 3 < RN.length; k += 2) {
      var ax = RN[k], az = RN[k + 1], bx = RN[k + 2], bz = RN[k + 3], L = Math.hypot(bx - ax, bz - az), nx = (bz - az) / L, nz = -(bx - ax) / L;
      for (var s2 = (k === 1 ? 13 : 0); s2 < L; s2 += 50) { var px = ax + (bx - ax) * s2 / L, pz = az + (bz - az) * s2 / L; if (pz > 430) break; masts.push([px + nx * (RN[0] + 4), pz + nz * (RN[0] + 4)], [px - nx * (RN[0] + 4), pz - nz * (RN[0] + 4)]); }
    }
    LAND.piste = { pts: RN.slice(1), w: RN[0], masts: masts };
    landShade();
    LW.rock = landSurf(ctx, 'texture-dark-rock', { project: 'box', size: 2.6, roughness: 0.95, color: '#FFFFFF' });
    landSky(ctx);
    landGround(ctx);
    landSilhouettes(ctx);
    landTrees(ctx);
    landRocks(ctx);
    landValley(ctx);
    landSnowfall(ctx);
    [[-72, 72, -92, -64.6], [-76, -72, -92, -80], [-80, -76, -92, -86.5], [-83, -80, -92, -90]].forEach(function (q) { ctx.solid({ min: { x: q[0], y: -40, z: q[2] }, max: { x: q[1], y: 0.4, z: q[3] } }); });
  }

  function landHfTex(ctx, hf) {
    return ctx.textures.canvas(1024, 1024, function (g, w, h) {
      var n = hf.width, D = hf.data, sc = n / w, img = hf.colorMap && hf.colorMap.image, C = null, k = (hf.range[1] - hf.range[0]) / (hf.size / n) / 2;
      if (img) { g.drawImage(img, 0, 0, w, h); C = g.getImageData(0, 0, w, h).data; }
      var out = g.createImageData(w, h), o = out.data;
      function at(i, j) { return D[clamp(j, 0, n - 1) * n + clamp(i, 0, n - 1)]; }
      for (var j = 0; j < h; j++) for (var i = 0; i < w; i++) {
        var x = Math.round(i * sc), y = Math.round(j * sc), gx = (at(x + 1, y) - at(x - 1, y)) * k, gn = (at(x, y - 1) - at(x, y + 1)) * k, l = Math.sqrt(gx * gx + gn * gn + 1), q = (j * w + i) * 4;
        o[q] = (0.5 - gx / l * 0.5) * 255; o[q + 1] = (0.5 - gn / l * 0.5) * 255; o[q + 2] = C ? (C[q] + C[q + 1] + C[q + 2]) / 3 : 255; o[q + 3] = 255;
      }
      g.putImageData(out, 0, 0);
    }, { linear: true });
  }
  function landShade() {
    var G = 128, C = 30, md = LAND_MOON, hl = Math.hypot(md[0], md[2]), mx = md[0] / hl, mz = md[2] / hl, tn = md[1] / hl, V = new Float32Array(G * G);
    for (var j = 0; j < G; j++) for (var i = 0; i < G; i++) {
      var x = (i - G / 2) * C, z = (j - G / 2) * C + 20, h0 = landT(x, z) + 2, v = 1;
      if (Math.abs(x) > 110 || z < -98 || z > 118) for (var s = 30; s < 1600 && v > 0; s *= 1.14) v = Math.min(v, (h0 + s * tn - landT(x + mx * s, z + mz * s)) / (4 + s * 0.035) + 0.5);
      V[j * G + i] = smooth(v);
    }
    LW.vis = function (x, z) {
      var u = clamp(x / C + G / 2, 0, G - 1.001), w = clamp((z - 20) / C + G / 2, 0, G - 1.001), a = u | 0, b = w | 0, fu = u - a, fw = w - b, q = b * G + a;
      return (V[q] * (1 - fu) + V[q + 1] * fu) * (1 - fw) + (V[q + G] * (1 - fu) + V[q + G + 1] * fu) * fw;
    };
  }

  var LAND_SKYV = 'varying vec3 vDir; void main() { vDir = position; vec4 c = projectionMatrix*modelViewMatrix*vec4(position, 1.0); gl_Position = c.xyww; gl_Position.z*=0.99999; }';
  function landSkyMat(env) {
    return new THREE.ShaderMaterial({
      uniforms: landUniforms(THREE), vertexShader: env ? 'varying vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position, 1.0); }' : LAND_SKYV,
      fragmentShader: LAND_UNI + LAND_GLSL + [
      '\nvarying vec3 vDir;',
      'void main() {',
      '  vec3 d = normalize(vDir); vec3 c = lsSky(d);',
      '  vec3 mD = normalize(uMoonDir*vec3(1.0, 0.47, 1.0));',
      '  vec3 R = normalize(cross(mD, vec3(0.0, 1.0, 0.0))), Up = cross(R, mD);',
      '  vec2 q = vec2(dot(d, R), dot(d, Up))/0.019; float r = length(q), mc = max(dot(d, mD), 0.0);',
      '  float ang = sqrt(max(2.0*(1.0-mc), 0.0))/0.019, aa = max(fwidth(r), 0.02), disc = (1.0-smoothstep(1.0-aa, 1.0+aa, r))*step(0.0, dot(d, mD));',
      '  c+=vec3(0.08, 0.1, 0.14)*exp(-max(ang-1.0, 0.0)*1.7)+vec3(0.03, 0.04, 0.058)*exp(-ang*0.14)+vec3(0.012, 0.016, 0.024)*exp(-ang*0.03);',
      '  if (disc > 0.0) {',
      '    float mar = lsF(q*1.4+vec2(3.1, 1.7));',
      '    float alb = 1.0-0.42*smoothstep(0.42, 0.58, mar)-0.16*lsN(q*5.0+2.0)+0.08*lsN(q*15.0)-0.1*smoothstep(0.3, 0.0, length(q-vec2(-0.25, -0.55)));',
      '    c = mix(c, vec3(1.0, 0.975, 0.93)*ENVK*alb*(0.8+0.2*pow(max(1.0-r*r, 0.0), 0.3)), disc);',
      '  }',
      '#if ENV == 1',
      '  if (d.y<0.0) c = mix(c, vec3(0.16, 0.22, 0.36), smoothstep(0.0, -0.15, d.y));',
      '#endif',
      '  gl_FragColor = vec4(c, 1.0);',
      '}'].join('\n'),
      defines: { ENV: env ? 1 : 0, ENVK: env ? '1.5' : '3.2' },
      side: THREE.BackSide, depthWrite: false, fog: false,
    });
  }
  function landSky(ctx) {
    var THREE = ctx.THREE;
    var dome = new THREE.Mesh(new THREE.SphereGeometry(1000, 64, 32), landSkyMat(false));
    dome.frustumCulled = false; dome.renderOrder = 13; dome.userData.noReflection = true; ctx.scene.add(dome); LW.dome = dome;
    var N = LW.low ? 1400 : 3000, R = rng(901), pos = [], bri = [], col = [];
    for (var i = 0; i < N; i++) {
      var y = R() * 1.02 - 0.02, a = R() * TAU, s = Math.sqrt(1 - y * y);
      pos.push(Math.cos(a) * s, y, Math.sin(a) * s);
      bri.push(Math.pow(R(), 7) * 3.2 + 0.06);
      var t = R(); col.push(t < 0.15 ? 1.0 : t < 0.7 ? 0.86 : 0.75, t < 0.15 ? 0.82 : t < 0.7 ? 0.92 : 0.86, t < 0.15 ? 0.62 : 1.0);
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', landAt(pos, 3)); g.setAttribute('aB', landAt(bri, 1)); g.setAttribute('aC', landAt(col, 3));
    var m = new THREE.ShaderMaterial({
      uniforms: landUniforms(THREE),
      vertexShader: 'attribute float aB; attribute vec3 aC; uniform float uTime; uniform vec3 uMoonDir; varying vec3 vC;\nvoid main() {\n vec3 d = normalize(position);\n vec4 c = projectionMatrix*viewMatrix*vec4(cameraPosition+d*900.0, 1.0); gl_Position = c; gl_Position.z = c.w*0.99998;\n float tw = 0.7+0.3*sin(uTime*(1.3+aB*4.0)+aB*917.0);\n float w = pow(max(dot(normalize(d.xz+1e-4), vec2(-0.86, -0.51)), 0.0), 3.0)*exp(-max(d.y, 0.0)*5.0);\n vC = aC*aB*tw*smoothstep(0.0, 0.22, d.y)*(1.0-0.95*pow(max(dot(d, normalize(uMoonDir*vec3(1.0, 0.47, 1.0))), 0.0), 40.0))*(1.0-0.85*w);\n gl_PointSize = 1.2+min(aB, 2.0)*0.9;\n}',
      fragmentShader: 'varying vec3 vC; void main() { float r = length(gl_PointCoord-0.5); gl_FragColor = vec4(vC*(1.0-smoothstep(0.15, 0.5, r)), 1.0); }',
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    });
    var stars = new THREE.Points(g, m); stars.frustumCulled = false; stars.renderOrder = -999; stars.userData.noReflection = true; ctx.scene.add(stars);
  }
  function landEnv(ctx) {
    var g = new ctx.THREE.Group();
    g.add(new ctx.THREE.Mesh(new ctx.THREE.SphereGeometry(90, 48, 24), landSkyMat(true)));
    [typeof RESORT_ENV === 'function' ? RESORT_ENV : null, typeof PARTY_ENV === 'function' ? PARTY_ENV : null].forEach(function (f) {
      if (!f) return;
      try { var o = f(ctx); if (o && o.isObject3D) { o.traverse(function (m) { if (m.material && m.material.color) m.material.color.multiplyScalar(0.6); }); g.add(o); } } catch (e) { void e; }
    });
    return g;
  }

  /* -- the snow -- */
  function landSnowMat(ctx) {
    var THREE = ctx.THREE, U = landUniforms(THREE), low = LW.low, i;
    var m = landSurf(ctx, 'texture-snow', { size: 2.2, normal: 1.0, roughness: 0.95, mottle: 0.0, color: '#FFFFFF', variety: false }) || new THREE.MeshStandardMaterial({ color: '#E8EEF6', roughness: 0.9 });
    var seg = [], P = SITE.path, T = SITE.terrace;
    for (i = 0; i < 6; i++) { var a = P[Math.min(i, P.length - 1)], b = i + 1 < P.length ? P[i + 1] : [T.x - T.w / 2 + 6, T.z - T.d / 2 + 4]; seg.push(new THREE.Vector4(a[0], a[1], b[0], b[1])); }
    [[-74, 34], [-77, 6], [-72, -22], [74, 2], [78, -28], [76, 34]].forEach(function (c) { var e = c[0] < 0 ? -1 : 1, z = clamp(c[1], -18, 18); seg.push(new THREE.Vector4(c[0] - e * 10, c[1], e * (c[1] > 20 && e > 0 ? 46 : T.w / 2 + 1), c[1] > 20 && e > 0 ? 28 : z)); });
    var run = [], RN = LAND_RUNS[0]; for (i = 0; i < 5; i++) run.push(new THREE.Vector2(RN[1 + i * 2], RN[2 + i * 2]));
    var pools = LAND.piste.masts.slice(0, 18).map(function (q, k) { var o = LAND.piste.masts[k ^ 1]; return new THREE.Vector2(lerp(q[0], o[0], 0.36), lerp(q[1], o[1], 0.36)); });
    while (pools.length < 18) pools.push(new THREE.Vector2(0, -1e4));
    var own = { uSeg: { value: seg }, uDeck: { value: new THREE.Vector4(T.x, T.z, T.w / 2, T.d / 2) }, uRun: { value: run }, uRunW: { value: RN[0] }, uMast: { value: pools },
      uStamp: { value: LAND_STAMPS.map(function (S) { return new THREE.Vector3(Math.cos(S[3]), Math.sin(S[3]), S[4] * 5000 / S[2]); }) } }, defs = '';
    var aer = !low && ctx.assets.texture('texture-snow-aerial'), trod = !low && ctx.assets.texture('texture-snow-trodden');
    if (aer && aer.map) { own.uAer = { value: aer.map }; defs += '#define LAND_AER\nuniform sampler2D uAer;\n'; }
    if (trod && trod.map && trod.normalMap) { own.uTrC = { value: trod.map }; own.uTrN = { value: trod.normalMap }; defs += '#define LAND_TROD\nuniform sampler2D uTrC, uTrN;\n'; }
    if (LW.rock && LW.rock.map) { own.uRkC = { value: LW.rock.map }; defs += '#define LAND_ROCK\nuniform sampler2D uRkC;\n'; }
    if (LW.hfTex) { own.uHfC = { value: LW.hfTex }; defs += '#define LAND_HFC\nuniform sampler2D uHfC;\n'; }
    return landWrap(m, 'landGround' + defs.length, function (sh) {
      Object.assign(sh.uniforms, U, own);
      sh.vertexShader = 'attribute vec4 aLand, aHf; varying vec4 vLand, vHf;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvLand = aLand; vHf = aHf;');
      sh.fragmentShader = sh.fragmentShader.replace('void main() {', LAND_UNI + 'uniform vec4 uSeg[12]; uniform vec4 uDeck; uniform vec2 uRun[5]; uniform vec2 uMast[18]; uniform float uRunW; uniform vec3 uStamp[6]; varying vec4 vLand, vHf;\n' + defs + LAND_GLSL + '\n' + LAND_LIT + [
      '',
      'float lsTrod(vec2 p) {',
      '  if (abs(p.x) > 112.0 || p.y < -100.0 || p.y > 70.0) return 0.0;',
      '  float d = 1e5;',
      '  for (int i = 0; i<12; i++) { vec2 a = uSeg[i].xy, ab = uSeg[i].zw-a; float t = clamp(dot(p-a, ab)/max(dot(ab, ab), 1e-3), 0.0, 1.0); d = min(d, length(p-a-ab*t)+(i>5?0.6:0.0)); }',
      '  float w = 1.3+1.1*lsN(p*0.13);',
      '  float k = 1.0-smoothstep(w*0.6, w+0.5, d+(lsN(p*1.7)-0.5)*0.8);',
      '  vec2 q = abs(p-uDeck.xy)-uDeck.zw; float dd = length(max(q, 0.0))+min(max(q.x, q.y), 0.0);',
      '  return max(k, 1.0-smoothstep(0.5, 2.0+3.5*lsN(p*0.17), dd+(lsN(p*1.3)-0.5)*1.6));',
      '}',
      'vec2 lsRun(vec2 p) {',
      '  if (p.y < 40.0 || p.y > 900.0 || abs(p.x) > 220.0) return vec2(0.0);',
      '  float best = 1e5, acr = 0.0;',
      '  for (int i = 0; i<4; i++) { vec2 a = uRun[i], ab = uRun[i+1]-a; float t = clamp(dot(p-a, ab)/dot(ab, ab), 0.0, 1.0); vec2 e = p-a-ab*t; float d = length(e);',
      '    if (d<best) { best = d; acr = dot(e, normalize(vec2(ab.y, -ab.x))); } }',
      '  return vec2(1.0-smoothstep(uRunW-3.0, uRunW+1.0, best+(lsN(p*0.2)-0.5)*3.0), acr);',
      '}',
      'float lsTri(sampler2D t, vec3 q, vec3 bw, vec3 gx, vec3 gy) { return dot(vec3(textureGrad(t, q.zy, gx.zy, gy.zy).g, textureGrad(t, q.xz, gx.xz, gy.xz).g, textureGrad(t, q.xy, gx.xy, gy.xy).g), bw); }',
      'void main() {'].join('\n'))
        .replace('#include <color_fragment>', [
      '#include <color_fragment>',
      'vec3 lsP = vGmP; float lsD = distance(lsP, cameraPosition); vec3 lsW = normalize(vGmN);',
      'float lsSt = smoothstep(0.86, 0.62, lsW.y), lsNr = 1.0-smoothstep(150.0, 420.0, lsD);',
      'float lsTr = lsTrod(lsP.xz)*(1.0-lsSt); vec2 lsRn = lsRun(lsP.xz); float lsPi = lsRn.x*step(55.0, lsP.z);',
      'vec2 lsQ3 = vec2(lsP.x+lsP.y*0.8, lsP.z-lsP.y*0.6);',
      'float lsBn = lsF(lsQ3*0.008)+0.5*lsN(lsQ3.yx*0.035+3.0)-0.02+0.35*(lsN(lsQ3*0.2)-0.5)*lsNr;',
      'float lsRk = smoothstep(0.5, 0.62, vLand.x+(1.0-lsW.y)*1.45-vLand.z+(lsBn-0.74)*0.6);',
      'vec3 lsHn = vec3(0.0, 1.0, 0.0);',
      '#ifdef LAND_HFC',
      'vec4 lsHq = texture2D(uHfC, vec2(vHf.x, 1.0-vHf.y)); vec3 lsSd = uStamp[int(clamp(vHf.w+0.5, 0.0, 5.0))]; vec2 lsNq = lsHq.xy*2.0-1.0;',
      'lsHn = normalize(vec3(lsNq.x*lsSd.z, sqrt(max(1.0-dot(lsNq, lsNq), 0.0)), lsNq.y*lsSd.z)); lsHn = vec3(lsSd.x*lsHn.x+lsSd.y*lsHn.z, lsHn.y, lsSd.x*lsHn.z-lsSd.y*lsHn.x);',
      'lsRk = mix(lsRk, max(smoothstep(0.8, 0.62, lsHq.b+(lsBn-0.74)*0.12), smoothstep(0.54, 0.38, lsHn.y+(lsBn-0.74)*0.25)), vHf.z);',
      '#endif',
      'float lsFo = vLand.y*smoothstep(0.15, 0.65, vLand.y+(lsN(lsP.xz*0.05)-0.5)*0.5)*(1.0-lsRk)*smoothstep(300.0, 600.0, lsD)*smoothstep(0.62, 0.8, lsW.y);',
      'float lsTx = mix(dot(diffuseColor.rgb, vec3(0.3333)), 0.9, lsSt), lsMac = lsN(lsP.xz*0.017);',
      '#ifdef LAND_AER',
      'lsMac = mix(lsMac, smoothstep(0.15, 0.75, dot(texture2D(uAer, lsP.xz/80.0+0.37).rgb, vec3(0.333))), 0.55);',
      '#endif',
      'vec2 lsTn = vec2(0.0); vec3 lsC = vec3(0.86, 0.9, 0.96)*(0.92+0.13*lsMac)*mix(1.0, 0.8+0.28*lsTx, 0.35+0.5*lsTr);',
      '#ifdef LAND_TROD',
      'vec2 lsTu = lsP.xz/2.0, lsGx = dFdx(lsTu), lsGy = dFdy(lsTu);',
      'if (lsTr>0.01&&lsD<70.0) { lsC*=mix(vec3(1.0), clamp(textureGrad(uTrC, lsTu, lsGx, lsGy).rgb*1.1, 0.0, 1.0)*vec3(0.92, 0.93, 0.96), lsTr*0.9); lsTn = (textureGrad(uTrN, lsTu, lsGx, lsGy).xy*2.0-1.0)*vec2(1.0, -1.0)*(1.0-smoothstep(25.0, 70.0, lsD)); }',
      '#else',
      'lsC*=mix(vec3(1.0), vec3(0.76, 0.77, 0.8), lsTr*0.9);',
      '#endif',
      'float lsAc = lsRn.y/4.3, lsSm = min(fract(lsAc), 1.0-fract(lsAc))*4.3, lsCw = fwidth(lsRn.y);',
      'lsC*=1.0+lsPi*((lsH(vec2(floor(lsAc), 3.0))-0.5)*0.12-0.05*(1.0-smoothstep(0.05, 0.16+lsCw*1.5, lsSm))+0.05*sin(lsRn.y*18.0)*(1.0-smoothstep(0.08, 0.3, lsCw*2.9)));',
      'vec3 lsRc = vec3(0.1, 0.112, 0.14)*(0.7+0.6*lsBn); float lsRh = 0.5;',
      '#ifdef LAND_ROCK',
      'vec3 lsBw = pow(abs(lsW), vec3(4.0)); lsBw/=lsBw.x+lsBw.y+lsBw.z; vec3 lsQx = dFdx(lsP), lsQy = dFdy(lsP);',
      'if (lsRk > 0.01 && lsD < 1300.0) {',
      '  float t = lsTri(uRkC, lsP/23.0, lsBw, lsQx/23.0, lsQy/23.0);',
      '  if (lsD<180.0) t = mix(lsTri(uRkC, lsP/5.5, lsBw, lsQx/5.5, lsQy/5.5), t, smoothstep(50.0, 180.0, lsD));',
      '  t = clamp((t-0.03)*40.0, -1.6, 1.6); lsRh = 0.5+t*0.5; lsRc = mix(vec3(0.13, 0.145, 0.18)*(1.0+0.36*t)*(0.7+0.6*lsBn), lsRc, smoothstep(600.0, 1300.0, lsD));',
      '}',
      '#endif',
      'vec2 lsCc = lsP.xz/4.6, lsCi = floor(lsCc); vec2 lsCf = fract(lsCc)-0.5-(vec2(lsH(lsCi), lsH(lsCi+3.7))-0.5)*0.45;',
      'float lsCr = mix(1.0-smoothstep(0.26, 0.4, length(lsCf)), 0.45+0.3*lsN(lsP.xz*0.09), smoothstep(250.0, 450.0, lsD));',
      'vec3 lsFc = mix(lsC*0.92, mix(vec3(0.016, 0.024, 0.02), lsC*0.75, 0.32+0.2*lsH(lsCi+5.1)*(1.0-smoothstep(250.0, 450.0, lsD))), lsCr);',
      'lsFc = mix(lsFc, lsC*(0.22+0.2*lsN(lsP.xz*0.03)), smoothstep(600.0, 1200.0, lsD));',
      'diffuseColor.rgb = mix(mix(lsC, lsRc, lsRk), lsFc, lsFo);'].join('\n'))
        .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nroughnessFactor = mix(mix(roughnessFactor, 0.6, lsTr * 0.7 + lsPi * 0.25), 0.92, max(lsRk, lsFo));')
        .replace('#include <clearcoat_normal_fragment_begin>', [
      '{',
      '  normal = normalize(mix(normal, nonPerturbedNormal, max(lsSt, vHf.z)));',
      '  if (vHf.z>0.01) normal = normalize(mix(normal, (viewMatrix*vec4(lsHn, 0.0)).xyz, vHf.z));',
      '  vec2 q = lsP.xz; float lsHt = 0.0;',
      '  float un = (1.0-lsTr)*(1.0-lsPi)*(1.0-lsRk)*(1.0-lsFo)*(1.0-lsSt);',
      '  if (lsD < 30.0 && un > 0.01) {',
      '    float ph = dot(q, vec2(0.86, 0.51))*6.5*(1.0+0.15*lsN(q*0.05))+sin(q.y*0.21+sin(q.x*0.07)*2.1)*1.4+lsN(q*0.3)*1.8;',
      '    lsHt+=(sin(ph)+0.3*sin(2.0*ph+0.7))*0.008*un*(1.0-smoothstep(5.0, 30.0, lsD))*(0.3+0.9*lsN(q*0.07));',
      '  }',
      '  if (lsD<160.0) lsHt+=((lsF(q*0.32)-0.47)*0.16+(lsN(q*0.09+4.0)-0.5)*0.35)*(1.0-lsTr*0.6)*(1.0-lsRk)*(1.0-smoothstep(30.0, 160.0, lsD));',
      '  lsHt+=lsPi*(sin(lsRn.y*251.3)*0.003*(1.0-smoothstep(0.12, 0.35, lsCw*40.0))+sin(lsRn.y*18.0)*0.012*(1.0-smoothstep(0.12, 0.35, lsCw*2.9)));',
      '  lsHt+=lsRk*(lsRh-0.5)*(lsD<180.0?0.35:1.6)*(1.0-smoothstep(300.0, 900.0, lsD));',
      '  if (lsD>120.0) { vec2 lsQf = lsP.xz+lsP.y*vec2(0.7, -0.5);',
      '    lsHt+=((lsN(lsQf/34.0)-0.5)*7.0*(1.0-vHf.z)+(lsF(lsQf/11.0+5.0)-0.47)*2.6)*smoothstep(120.0, 320.0, lsD)*(0.35+0.65*smoothstep(0.95, 0.7, lsW.y)); }',
      '  normal = lsBump(-vViewPosition, normal, lsHt);',
      '#ifdef LAND_TROD',
      '  if (lsTr>0.01) { vec3 nw = normalize((vec4(normal, 0.0)*viewMatrix).xyz), tp = vec3(lsTn.x, 0.0, lsTn.y)*lsTr*1.3; nw = normalize(nw+tp-nw*dot(nw, tp)); normal = normalize((viewMatrix*vec4(nw, 0.0)).xyz); }',
      '#endif',
      '  float ny2 = normalize((vec4(normal, 0.0)*viewMatrix).xyz).y;',
      '  lsRk*=1.0-0.94*smoothstep(0.74, 0.88, ny2+(lsN(q*0.5+lsP.y*0.37)-0.5)*0.3*lsNr-(lsRh-0.5)*0.2);',
      '  diffuseColor.rgb = mix(mix(lsC, lsRc, lsRk), lsFc, lsFo);',
      '}',
      '#include <clearcoat_normal_fragment_begin>'].join('\n'))
        .replace('#include <emissivemap_fragment>', [
      '#include <emissivemap_fragment>',
      'float lsSh = lsShadow()*vLand.w;',
      'if (lsD < 36.0) totalEmissiveRadiance += lsGlint(lsP, lsW, lsD, lsSh, (1.0 - lsTr * 0.85) * (1.0 - lsRk) * (1.0 - lsFo));',
      'totalEmissiveRadiance+=vec3(1.0, 0.4, 0.3)*0.2*smoothstep(380.0, 820.0, lsP.y)*pow(max(dot(lsW.xz, vec2(-0.86, -0.51))+0.25, 0.0)/1.25, 1.4)*(1.0-0.5*lsRk)*(1.0-lsFo);'].join('\n'))
        .replace('#include <aomap_fragment>', [
      'reflectedLight.directDiffuse *= vLand.w; reflectedLight.directSpecular *= vLand.w;',
      'vec3 lsPl = lsD<240.0?lsPools(lsP, lsW)*(1.0-lsSt):vec3(0.0);',
      'float lsFl = 0.0; if (lsPi>0.0) { for (int i = 0; i<18; i++) { vec2 e = lsP.xz-uMast[i]; lsFl+=exp(-dot(e, e)*0.0032); } }',
      'lsPl+=vec3(0.15, 0.143, 0.128)*lsPi*(1.0-smoothstep(330.0, 450.0, lsP.z))*(0.14+0.86*min(lsFl, 1.4));',
      'reflectedLight.directDiffuse += diffuseColor.rgb * lsPl;',
      'reflectedLight.directDiffuse += diffuseColor.rgb * uMoonCol * 0.05 * clamp((dot(lsW, uMoonDir) + 0.5) / 1.5, 0.0, 1.0) * (1.0 - lsRk) * (0.4 + 0.6 * lsSh);',
      'reflectedLight.indirectDiffuse*=mix(vec3(1.0), vec3(0.86, 0.96, 1.12), 1.0-lsRk)*(1.0-0.4*smoothstep(200.0, 900.0, lsD));',
      'reflectedLight.indirectDiffuse+=diffuseColor.rgb*vec3(0.012, 0.02, 0.04)*smoothstep(250.0, 1200.0, lsD);',
      '#include <aomap_fragment>'].join('\n'))
        .replace('#include <fog_fragment>', '#ifdef USE_FOG\ngl_FragColor.rgb = lsAir(gl_FragColor.rgb, lsP);\n#endif');
    });
  }
  function landGround(ctx) {
    var THREE = ctx.THREE, low = LW.low, mat = landSnowMat(ctx), B = SITE.bounds;
    var X0 = -150, Z0 = -130, S = 300, st = low ? 2.5 : 1.25, n = Math.round(S / st), C = [0, 20];
    function fdN(x, z, out, o) {
      var e = clamp(Math.hypot(x - C[0], z - C[1]) * 0.012, 1.25, 20);
      var nx = landT(x - e, z) - landT(x + e, z), nz = landT(x, z - e) - landT(x, z + e), l = Math.sqrt(nx * nx + 4 * e * e + nz * nz);
      out[o] = nx / l; out[o + 1] = 2 * e / l; out[o + 2] = nz / l;
    }
    function masks(pos, nor, idx) {
      var c = pos.length / 3, a = new Float32Array(c * 4), uv = new Float32Array(c * 4), sum = new Float32Array(c), cnt = new Float32Array(c), len = new Float32Array(c), i, k;
      for (k = 0; k < idx.length; k += 3) for (var e = 0; e < 3; e++) {
        var p = idx[k + e], q = idx[k + (e + 1) % 3], l = Math.hypot(pos[p * 3] - pos[q * 3], pos[p * 3 + 2] - pos[q * 3 + 2]);
        sum[p] += pos[q * 3 + 1]; cnt[p]++; len[p] += l; sum[q] += pos[p * 3 + 1]; cnt[q]++; len[q] += l;
      }
      for (i = 0; i < c; i++) {
        var x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2], ny = nor[i * 3 + 1];
        var crest = Math.abs(x) + Math.abs(z) > 300 ? smooth((landRidge(x * 0.0085 + 3.3, z * 0.0085 - 1.1) - 0.5) / 0.3) * smooth((y - 60) / 200) : 0;
        var inside = x > B.x[0] - 2 && x < B.x[1] + 2 && z > B.z[0] - 2 && z < B.z[1] + 2 && !(z < -67 && Math.abs(x) < 76);
        a[i * 4] = inside ? -3 : crest * 0.35 + smooth((y - 380) / 300) * (0.12 + 0.18 * landN(x * 0.01, z * 0.01));
        a[i * 4 + 1] = landForest(x, z, y, ny, nor[i * 3], nor[i * 3 + 2]);
        a[i * 4 + 2] = cnt[i] ? clamp((sum[i] / cnt[i] - y) / Math.max(len[i] / cnt[i], 1) * 2.2, -0.6, 0.6) : 0;
        a[i * 4 + 3] = inside ? 1 : LW.vis(x, z) * (1 - 0.8 * smooth((-170 - y) / 60));
        if (LW.hf && Math.abs(x) + Math.abs(z) > 500) { var st = [0, 0, 0, 0]; landStamps(x, z, st); uv.set(st, i * 4); }
      }
      return [a, uv];
    }
    function mesh(pos, idx, fix) {
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', landAt(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
      var nor = g.attributes.normal.array; fix(nor);
      var M = masks(pos, nor, idx); g.setAttribute('aLand', landAt(M[0], 4)); g.setAttribute('aHf', landAt(M[1], 4));
      var m = new THREE.Mesh(g, mat); m.receiveShadow = true; m.name = 'land-ground'; ctx.scene.add(m);
      return m;
    }
    var pos = [], idx = [], i, j;
    for (j = 0; j <= n; j++) for (i = 0; i <= n; i++) { var x = X0 + i * st, z = Z0 + j * st; pos.push(x, landT(x, z), z); }
    for (j = 0; j < n; j++) for (i = 0; i < n; i++) { var a = j * (n + 1) + i, b = a + 1, c = a + n + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
    function up(P, I) { var a = I[0] * 3, b = I[1] * 3, c = I[2] * 3; return (P[b + 2] - P[a + 2]) * (P[c] - P[a]) - (P[b] - P[a]) * (P[c + 2] - P[a + 2]) > 0; }
    function flip(I) { for (var k = 0; k < I.length; k += 3) { var tt = I[k + 1]; I[k + 1] = I[k + 2]; I[k + 2] = tt; } }
    if (!up(pos, idx)) flip(idx);
    LW.near = mesh(pos, idx, function (nor) {
      for (var k = 0; k <= n; k++) [[k, 0], [k, n], [0, k], [n, k]].forEach(function (q) { fdN(X0 + q[0] * st, Z0 + q[1] * st, nor, (q[1] * (n + 1) + q[0]) * 3); });
    });
    var per = [];
    for (i = 0; i < n; i++) per.push([X0 + i * st, Z0]);
    for (i = 0; i < n; i++) per.push([X0 + S, Z0 + i * st]);
    for (i = 0; i < n; i++) per.push([X0 + S - i * st, Z0 + S]);
    for (i = 0; i < n; i++) per.push([X0, Z0 + S - i * st]);
    var N = per.length, R1 = 1640, NR = low ? 80 : 150, JD = low ? 999 : Math.round(NR * 0.14), rpos = [], rows = [];
    function ray(px, pz) { var dx = px - C[0], dz = pz - C[1], r0 = Math.sqrt(dx * dx + dz * dz); return [dx / r0, dz / r0, r0]; }
    var rays = per.map(function (p) { return ray(p[0], p[1]); }), rays2 = [];
    for (i = 0; i < N; i++) { var p0 = per[i], p1 = per[(i + 1) % N]; rays2.push(rays[i], ray((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2)); }
    for (j = 0; j <= NR; j++) {
      var RS = j < JD ? rays : rays2;
      rows.push([rpos.length / 3, RS.length]);
      for (i = 0; i < RS.length; i++) {
        var q = RS[i], r = q[2] + (R1 - q[2]) * Math.pow(j / NR, 1.4);
        var x2 = j === 0 ? per[i][0] : C[0] + q[0] * r, z2 = j === 0 ? per[i][1] : C[1] + q[1] * r;
        rpos.push(x2, landT(x2, z2), z2);
      }
    }
    var ridx = [];
    for (j = 0; j < NR; j++) {
      var A = rows[j], Bq = rows[j + 1];
      if (A[1] === Bq[1]) for (i = 0; i < A[1]; i++) { var a0 = A[0] + i, a1 = A[0] + (i + 1) % A[1], b0 = Bq[0] + i, b1 = Bq[0] + (i + 1) % Bq[1]; ridx.push(a0, a1, b0, a1, b1, b0); }
      else for (i = 0; i < A[1]; i++) { var c0 = A[0] + i, c1 = A[0] + (i + 1) % A[1], f0 = Bq[0] + 2 * i, f1 = Bq[0] + 2 * i + 1, f2 = Bq[0] + (2 * i + 2) % Bq[1]; ridx.push(c0, f1, f0, c0, c1, f1, c1, f2, f1); }
    }
    if (!up(rpos, ridx)) flip(ridx);
    LW.ring = mesh(rpos, ridx, function (nor) { for (var k = 0; k < N; k++) fdN(per[k][0], per[k][1], nor, k * 3); });
    LW.ring.frustumCulled = false; LW.near.renderOrder = 10; LW.ring.renderOrder = 11;   // last of the opaque things: what stands on the snow hides it before it is shaded
  }

  /* -- the farthest ranges -- */
  function landSilhouettes(ctx) {
    var THREE = ctx.THREE, N = LW.low ? 360 : 720, pos = [], uv = [], idx = [];
    [[1590, 0.0, 200], [1700, 3.7, 260]].forEach(function (L, li) {
      var b = pos.length / 3;
      for (var i = 0; i <= N; i++) {
        var a = i / N * TAU, cx = Math.cos(a), sz = Math.sin(a);
        var rr = landRidge(cx * 3.4 + L[1], sz * 3.4 - L[1]), h = -60 + L[2] * rr * rr * 1.6 * (0.55 + 0.45 * landN(cx * 1.3 + li, sz * 1.3));
        pos.push(cx * L[0], -420, sz * L[0], cx * L[0], h, sz * L[0]); uv.push(li, 0, li, 1);
        if (i < N) { var q = b + i * 2; idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); }
      }
    });
    var g = new THREE.BufferGeometry(); g.setAttribute('position', landAt(pos, 3)); g.setAttribute('uv', landAt(uv, 2)); g.setIndex(idx);
    var m = new THREE.ShaderMaterial({
      uniforms: landUniforms(THREE), side: THREE.DoubleSide, fog: false,
      vertexShader: 'varying vec3 vW; varying vec2 vUv; void main() { vUv = uv; vec4 w = modelMatrix*vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }',
      fragmentShader: LAND_UNI + LAND_GLSL + [
      '\nvarying vec3 vW; varying vec2 vUv;',
      'void main() {',
      '  vec3 d = normalize(vW-cameraPosition), hz = lsSky2(normalize(vec3(d.x, 0.015, d.z)), 0.3)*1.08;',
      '  vec3 c = hz*(mix(0.8, 0.9, vUv.x)+mix(0.28, 0.16, vUv.x)*smoothstep(-20.0, 220.0, vW.y));',
      '  c+=vec3(1.0, 0.45, 0.32)*0.02*pow(max(dot(normalize(d.xz+1e-4), vec2(-0.86, -0.51)), 0.0), 4.0)*smoothstep(150.0, 400.0, vW.y);',
      '  gl_FragColor = vec4(c, 1.0);',
      '}'].join('\n'),
    });
    var mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 12; mesh.userData.noReflection = true; ctx.scene.add(mesh); LW.sil = mesh;
  }

  /* -- the forest -- */
  function landSpruceSil(g, cx, w, h, R, v, lump) {
    var nT = 15 + v * 2, wide = 0.82 + v * 0.08, sx = w / 128, sy = h / 256, ls = lump || 1;
    g.fillStyle = 'rgb(40,0,0)'; g.fillRect(cx - 3 * sx, h - 22 * sy, 6 * sx, 22 * sy);
    for (var k = 0; k < nT; k++) {
      var t = k / (nT - 1), y = (6 + t * 226) * sy, hw = (5 + t * 50 * wide) * (0.85 + R() * 0.3) * sx, dr = (8 + t * 10) * sy;
      g.fillStyle = 'rgb(' + (30 + R() * 50 | 0) + ',0,0)'; g.beginPath(); g.moveTo(cx, y - 10 * sy);
      for (var e = 0; e <= 10; e++) { var u = e / 10; g.lineTo(cx - hw + u * hw * 2, y + dr * (1 - Math.abs(u - 0.5) * 0.6) + (R() - 0.5) * 7 * sy); }
      g.closePath(); g.fill();
      for (var sd = -1; sd <= 1; sd += 2) for (var l = 0; l < 6 / ls; l++) {
        var uu = 0.15 + R() * 0.8;
        g.fillStyle = 'rgb(' + (40 + R() * 40 | 0) + ',255,0)'; g.beginPath(); g.ellipse(cx + sd * hw * uu * 0.95, y - 9 * sy + (dr + 4 * sy) * uu * 0.95 + R() * 2 * sy, (2 + R() * 4 * (1 + t)) * sx * ls, (1.5 + R() * 2) * sy * ls, sd * 0.45, 0, TAU); g.fill();
      }
    }
  }
  function landBranchTex(ctx) {
    var fir = ctx.assets.texture('texture-fir-cards');
    return ctx.textures.canvas(1024, 1024, function (g, W, h) {
      var R = rng(77), w = W / 2; g.clearRect(0, 0, W, h);
      landSpruceSil(g, w * 1.5, w * 0.94, h, R, 2, 0.55);
      if (!(fir && fir.map && fir.alphaMap && fir.cards)) { landSpruceSil(g, w / 2, w * 0.9, h, R, 1, 1); return; }
      var c = fir.cards.reduce(function (p, q) { return (q.uv[2] - q.uv[0]) * (q.uv[3] - q.uv[1]) > (p.uv[2] - p.uv[0]) * (p.uv[3] - p.uv[1]) ? q : p; });
      var put = function (img) { g.save(); g.beginPath(); g.rect(0, 0, w, h); g.clip(); g.translate(w / 2, 0); g.rotate(PI / 2); g.drawImage(img, c.uv[0] * img.width, c.uv[1] * img.height, (c.uv[2] - c.uv[0]) * img.width, (c.uv[3] - c.uv[1]) * img.height, 0, -w / 2, h, w); g.restore(); };
      put(fir.alphaMap.image); var A = g.getImageData(0, 0, w, h); put(fir.map.image); var C = g.getImageData(0, 0, w, h);
      for (var q = 0; q < C.data.length; q += 4) { var lum = Math.min(255, (C.data[q] + C.data[q + 1] * 1.4 + C.data[q + 2]) / 2.2); C.data[q] = C.data[q + 1] = C.data[q + 2] = lum; C.data[q + 3] = A.data[q]; }
      g.putImageData(C, 0, 0);
    }, { linear: true });
  }
  function landSpruceGeo(whorls, per) {
    var P = [], Nn = [], UV = [], K = [], R = rng(31 + whorls), i, s;
    function v(x, y, z, nx, ny, nz, u, w, k) { P.push(x, y, z); Nn.push(nx, ny, nz); UV.push(u, w); K.push(k); }
    for (s = 0; s < 6; s++) [0, 1, 2, 1, 3, 2].forEach(function (q) {
      var a = (s + (q & 1)) / 6 * TAU, c = Math.cos(a), n = Math.sin(a), r = q < 2 ? 0.016 : 0.01; v(c * r, q < 2 ? -0.03 : 0.35, n * r, c, 0, n, 0.25, 0.02, 2);
    });
    for (s = 0; s < 3; s++) {
      var ca = Math.cos(s * PI / 3 + 0.3) * 0.21, sa = Math.sin(s * PI / 3 + 0.3) * 0.21;
      v(-ca, 0.02, -sa, 0, 1, 0, 0.5, 0, 1); v(ca, 0.02, sa, 0, 1, 0, 1, 0, 1); v(ca, 1.0, sa, 0, 1, 0, 1, 1, 1);
      v(-ca, 0.02, -sa, 0, 1, 0, 0.5, 0, 1); v(ca, 1.0, sa, 0, 1, 0, 1, 1, 1); v(-ca, 1.0, -sa, 0, 1, 0, 0.5, 1, 1);
    }
    for (i = 0; i < whorls; i++) {
      var tw = i / (whorls - 1), y0 = 0.1 + tw * 0.86, L = 0.035 + 0.215 * Math.pow(1 - tw, 0.9), rot = R() * TAU, nb = Math.max(5, Math.round(per * (1 - tw * 0.4)));
      for (var b = 0; b < nb; b++) {
        var an = rot + b / nb * TAU + (R() - 0.5) * 0.6, dx = Math.cos(an), dz = Math.sin(an), sx = -dz, sz = dx, Lb = L * (0.75 + R() * 0.5);
        var droop = (0.2 + 0.5 * (1 - tw)) * (0.55 + R() * 0.9), lift = (R() - 0.3) * 0.25, roll = (R() - 0.5) * 0.6, nx = dx * 0.6, nz = dz * 0.6, seg = [];
        for (var f = 0; f <= 3; f++) {
          var ff = f / 3, cx = dx * Lb * ff, cy = y0 + Lb * ((0.15 + lift) * ff - droop * ff * ff), cz = dz * Lb * ff, hw = Lb * (0.16 + 0.38 * ff);
          seg.push([cx - sx * hw, cy - roll * hw, cz - sz * hw, cx + sx * hw, cy + roll * hw, cz + sz * hw, ff]);
        }
        for (f = 0; f < 3; f++) {
          [0, 1, 2, 1, 3, 2].forEach(function (q) { var E = seg[f + (q >> 1)], o = (q & 1) * 3; v(E[o], E[o + 1], E[o + 2], nx, 0.8, nz, (q & 1) * 0.5, E[6], 0); });
        }
      }
    }
    for (i = 0; i < Nn.length; i += 3) { var l = Math.hypot(Nn[i], Nn[i + 1], Nn[i + 2]); Nn[i] /= l; Nn[i + 1] /= l; Nn[i + 2] /= l; }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', landAt(P, 3)); g.setAttribute('normal', landAt(Nn, 3));
    g.setAttribute('uv', landAt(UV, 2)); g.setAttribute('aPart', landAt(K, 1));
    return g;
  }
  function landSpruceMat(ctx) {
    var THREE = ctx.THREE, m = new THREE.MeshStandardMaterial({ map: landBranchTex(ctx), alphaTest: 0.1, side: THREE.DoubleSide, roughness: 0.92, color: '#FFFFFF' });
    m.alphaToCoverage = true;
    return landWrap(m, 'landSpruce', function (sh) {
      Object.assign(sh.uniforms, landUniforms(THREE));
      sh.vertexShader = 'attribute float aPart; varying float vPart; varying vec3 vSpP;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvPart = aPart;\n{ vec4 sp = vec4(position, 1.0);\n#ifdef USE_INSTANCING\nsp = instanceMatrix*sp;\n#endif\nvSpP = (modelMatrix*sp).xyz; }');
      sh.fragmentShader = sh.fragmentShader.replace('void main() {', LAND_UNI + 'varying float vPart; varying vec3 vSpP;\n' + LAND_GLSL + '\n' + LAND_LIT + '\nvoid main() {\nlsNear(vSpP);')
        .replace('#include <color_fragment>', [
      '#include <color_fragment>',
      'float spShade = diffuseColor.r; vec2 spUv = vec2(vMapUv.x*2.0, vMapUv.y);',
      'float spCen = 1.0-abs(spUv.x-0.5)*2.0, spL = lsF(spUv*vec2(5.0, 11.0)+vSpP.xz*0.37)+0.45*lsN(spUv*vec2(17.0, 31.0)+vSpP.y)+0.22*lsN(spUv*vec2(48.0, 96.0));',
      'float spSnow = vPart<0.5&&gl_FrontFacing?smoothstep(0.72, 0.9, spL+spCen*0.38)*smoothstep(0.08, 0.3, spUv.y):0.0;',
      'if (vPart>0.5&&vPart<1.5) { spSnow = smoothstep(0.2, 0.95, diffuseColor.g)*0.5; spShade = diffuseColor.r*2.5; }',
      'if (vPart > 1.5) diffuseColor.a = 1.0;',
      'diffuseColor.a = clamp((diffuseColor.a - 0.45) / max(fwidth(diffuseColor.a), 1e-3) + 0.5, 0.0, 1.0);',
      'vec3 spNeedle = vec3(0.035, 0.06, 0.048)*(0.25+spShade*2.2)*(0.8+0.4*lsH(floor(vSpP.xz*0.5)));',
      'if (vPart>1.5) spNeedle = vec3(0.06, 0.045, 0.035);',
      'diffuseColor.rgb = mix(spNeedle, vec3(0.84, 0.88, 0.95)*(0.8+0.2*smoothstep(0.6, 1.0, spL+spCen*0.3)), spSnow);'].join('\n'))
        .replace('#include <clearcoat_normal_fragment_begin>', 'normal = lsBump(-vViewPosition, normal, spShade*0.025+spSnow*spL*0.03+(spUv.x-0.5)*(spUv.x-0.5)*-0.06*step(vPart, 0.5));\nif (spSnow>0.5) normal = normalize(mix(normal, (viewMatrix*vec4(0.0, 1.0, 0.0, 0.0)).xyz, 0.6));\n#include <clearcoat_normal_fragment_begin>')
        .replace('#include <aomap_fragment>', 'reflectedLight.directDiffuse+=diffuseColor.rgb*lsPools(vSpP, vec3(0.0, 1.0, 0.0))*0.6;\n#include <aomap_fragment>')
        .replace('#include <fog_fragment>', '#ifdef USE_FOG\ngl_FragColor.rgb = lsAir(gl_FragColor.rgb, vSpP);\n#endif');
    });
  }
  function landTrees(ctx) {
    var THREE = ctx.THREE, low = LW.low, R = rng(4242), near = [], mid = [], far = [], B = SITE.bounds;
    function inBounds(x, z, m) { return x > B.x[0] - m && x < B.x[1] + m && z > B.z[0] - m && z < B.z[1] + m; }
    var keep = [[-40, -30, 40, 30], [-24, 26, 24, 52], [30, 6, 50, 32], [-75, -96, 75, -56], [-52, 56, 28, 120], [44, 36, 70, 60]];
    SITE.chalets.forEach(function (c) { var a = c[5] * PI / 180, cs = Math.abs(Math.cos(a)), sn = Math.abs(Math.sin(a)), hx = (c[2] * cs + c[3] * sn) / 2 + 4, hz = (c[2] * sn + c[3] * cs) / 2 + 4; keep.push([c[0] - hx, c[1] - hz, c[0] + hx, c[1] + hz]); });
    function blocked(x, z) {
      for (var i = 0; i < keep.length; i++) { var k = keep[i]; if (x > k[0] && x < k[2] && z > k[1] && z < k[3]) return true; }
      var P = SITE.path;
      for (i = 0; i + 1 < P.length; i++) { var ax = P[i][0], az = P[i][1], ux = P[i + 1][0] - ax, uz = P[i + 1][1] - az, t = clamp(((x - ax) * ux + (z - az) * uz) / (ux * ux + uz * uz), 0, 1); if (Math.hypot(ax + ux * t - x, az + uz * t - z) < 6) return true; }
      var ex = P[0][0] - P[1][0], ez = P[0][1] - P[1][1], el = Math.hypot(ex, ez), et = clamp(((x - P[0][0]) * ex + (z - P[0][1]) * ez) / (el * el), 0, 2.4);
      if (Math.hypot(P[0][0] + ex * et - x, P[0][1] + ez * et - z) < 6) return true;
      return Math.hypot(x - SITE.spawn[0], z - SITE.spawn[1]) < 7 || landRunD(x, z) < 4;
    }
    function clump(x, z) { return smooth((landN(x * 0.075 + 5.3, z * 0.075) + landN(x * 0.21, z * 0.21 + 2.2) * 0.35 + 0.3) / 0.6); }
    function tree(x, y, z, k) { return [x, y, z, (6 + R() * 7 + k * 9) * (0.85 + R() * 0.3), R() * TAU, 0.8 + R() * 0.4]; }
    var tries = 0;
    while (near.length < (low ? 70 : 110) && tries++ < 6000) {
      var x = B.x[0] + 3 + R() * (B.x[1] - B.x[0] - 6), z = B.z[0] + 3 + R() * (B.z[1] - B.z[0] - 6);
      if (Math.min(x - B.x[0], B.x[1] - x, z - B.z[0], B.z[1] - z) > 18 || blocked(x, z) || landN(x * 0.06, z * 0.06) < -0.15) continue;
      near.push(tree(x, H(x, z), z, 0.4 + 0.6 * clump(x, z)));
    }
    var sp = low ? 7.5 : 5.2;
    for (x = -420; x <= 420; x += sp) for (z = -720; z <= 520; z += sp) {
      var jx = x + (R() - 0.5) * sp, jz = z + (R() - 0.5) * sp, cl = clump(jx, jz);
      if (inBounds(jx, jz, 1.5)) {
        if (!(jz < -54 && Math.abs(jx) > 62) || blocked(jx, jz) || R() > 0.3 + 0.4 * cl) continue;
        near.push(tree(jx, H(jx, jz), jz, cl)); continue;
      }
      var o = Math.max(Math.abs(jx) - 104, jz - 112, -92 - jz);
      if (o < 50 && blocked(jx, jz)) continue;
      if (o > 60 && (Math.abs(jx) > 260 || jz > 330 || jz < -330) && R() > 0.35) continue;
      var yy = landT(jx, jz), e = 2, ny = 2 * e / Math.sqrt(Math.pow(landT(jx - e, jz) - landT(jx + e, jz), 2) + 4 * e * e + Math.pow(landT(jx, jz - e) - landT(jx, jz + e), 2));
      if (R() > landForest(jx, jz, yy, ny) * (o < 18 ? 1 : 0.35 + 0.75 * cl)) continue;
      var tr = tree(jx, yy, jz, cl); tr.push(LW.vis(jx, jz) * (1 - 0.8 * smooth((-170 - yy) / 60)));
      if (o < 18) near.push(tr); else if (o < 46) mid.push(tr); else far.push(tr);
    }
    near.forEach(function (t) { if (inBounds(t[0], t[2], 0.5)) ctx.solid({ x: t[0], z: t[2], r: 0.55 + t[3] * 0.035 }); });
    var mat = landSpruceMat(ctx);
    function place(list) { return function (k, o) { var t = list[k]; o.position.set(t[0], t[1] - 0.25, t[2]); o.rotation.y = t[4]; o.scale.set(t[3] * 0.62 * t[5], t[3], t[3] * 0.62 * t[5]); }; }
    var gNear = landSpruceGeo(low ? 11 : 15, low ? 6 : 8), gMid = landSpruceGeo(low ? 8 : 10, 6);
    [[near, gNear, true], [mid, gMid, false]].forEach(function (S) {
      [0, 1, 2, 3].forEach(function (q) {
        var part = S[0].filter(function (t) { return (t[0] < 0 ? 0 : 1) + (t[2] < 10 ? 0 : 2) === q; });
        if (!part.length) return;
        var m = ctx.instanced(S[1], mat, part.length, place(part)); m.castShadow = S[2]; m.receiveShadow = true; m.computeBoundingSphere(); m.name = 'land-trees'; ctx.scene.add(m);
      });
    });
    if (far.length) {
      var P = [], Cn = [], Sz = [], I = [];
      far.forEach(function (t, q) {
        var vv = Math.floor(hash(t[0] * 0.37 + t[2] * 1.3) * 4), w = t[3] * 0.55 * t[5];
        [[-1, 0], [1, 0], [1, 1], [-1, 1]].forEach(function (c) { P.push(t[0], t[1] - 0.4, t[2]); Cn.push(c[0], c[1], vv); Sz.push(w, t[3], t[6]); });
        I.push(q * 4, q * 4 + 1, q * 4 + 2, q * 4, q * 4 + 2, q * 4 + 3);
      });
      var g = new THREE.BufferGeometry(); g.setAttribute('position', landAt(P, 3)); g.setAttribute('aC', landAt(Cn, 3)); g.setAttribute('aS', landAt(Sz, 3)); g.setIndex(I);
      var im = new THREE.ShaderMaterial({
        uniforms: Object.assign({ uMap: { value: ctx.textures.canvas(512, 256, function (g2, w2, h2) { var R2 = rng(55); g2.clearRect(0, 0, w2, h2); for (var v = 0; v < 4; v++) landSpruceSil(g2, v * 128 + 64, 128, h2, R2, v); }, { linear: true }) } }, landUniforms(THREE)),
        fog: false, side: THREE.DoubleSide,
        vertexShader: 'attribute vec3 aC, aS; uniform vec3 uMoonDir; varying vec2 vUv; varying vec3 vP; varying float vSide, vVis;\nvoid main() {\n vec2 dz = normalize(cameraPosition.xz-position.xz+1e-4); vec3 r = vec3(dz.y, 0.0, -dz.x);\n vec3 p = position+r*aC.x*aS.x*0.5+vec3(0.0, aC.y*aS.y, 0.0);\n vP = p; vVis = aS.z; vUv = vec2((aC.z+aC.x*0.5+0.5)/4.0, aC.y); vSide = aC.x*dot(r.xz, normalize(uMoonDir.xz));\n gl_Position = projectionMatrix*viewMatrix*vec4(p, 1.0);\n}',
        fragmentShader: LAND_UNI + LAND_GLSL + '\nuniform sampler2D uMap; varying vec2 vUv; varying vec3 vP; varying float vSide, vVis;\nvoid main() {\n vec4 t = texture2D(uMap, vUv); if (t.a<0.3) discard;\n vec3 nd = vec3(0.013, 0.02, 0.017)*(0.6+t.r*3.0);\n vec3 sn = vec3(0.16, 0.22, 0.38)*(0.6+0.4*vSide)*(0.4+0.6*vVis);\n gl_FragColor = vec4(lsAir(mix(nd, sn, smoothstep(0.4, 0.7, t.g)), vP), smoothstep(0.3, 0.6, t.a));\n}',
      });
      im.alphaToCoverage = true;
      var fm = new THREE.Mesh(g, im); fm.frustumCulled = false; fm.userData.noReflection = true; fm.name = 'land-cards'; ctx.scene.add(fm);
    }
  }

  /* -- the rocks -- */
  function landRockGeo(seed) {
    var g = new THREE.IcosahedronGeometry(1, 2), p = g.attributes.position, key = {}, P = [], I = [];
    for (var i = 0; i < p.count; i++) {
      var x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = Math.round(x * 1e4) + ',' + Math.round(y * 1e4) + ',' + Math.round(z * 1e4);
      if (key[k] == null) {
        var d = 1 + 0.3 * landN(x * 1.6 + seed, z * 1.6 + y) + 0.12 * landN(y * 3.1 - seed, x * 3.1 + z) + 0.35 * Math.max(0, landRidge(x * 0.9 + seed, z * 0.9 - y * 0.7) - 0.25);
        d = Math.round(d * 7) / 7 * 0.5 + d * 0.5;
        key[k] = P.length / 3; P.push(x * d * 1.15, Math.max(y * d * 0.62, -0.25), z * d * 0.9);
      }
      I.push(key[k]);
    }
    var out = new THREE.BufferGeometry(); out.setAttribute('position', landAt(P, 3)); out.setIndex(I); out.computeVertexNormals();
    return out;
  }
  function landRocks(ctx) {
    var THREE = ctx.THREE, R = rng(808), list = [], B = SITE.bounds, want = LW.low ? 45 : 90, tries = 0;
    var mat = LW.rock || new THREE.MeshStandardMaterial({ color: '#3A3C40', roughness: 0.95 });
    snowCover(mat, { edge: 0.62, soft: 0.12, scale: 1.4, tint: [4.3, 4.7, 5.5], skirt: 0.45 });
    while (list.length < want && tries++ < 9000) {
      var x = -280 + R() * 560, z = -320 + R() * 600, o = Math.max(Math.abs(x) - 104, z - 112, -92 - z), t = landSh(x, z), rim = z < -76 && z > -300 && t > 0.45 && t < 1.05, cliff = z < -68 && z > -200 && Math.abs(x) < 66;
      if (o < -2 && !(cliff && z < -70)) continue;
      if (landRunD(x, z) < 3) continue;
      var y = landT(x, z), e = 2, sl = Math.abs(landT(x + e, z) - landT(x - e, z)) + Math.abs(landT(x, z + e) - landT(x, z - e));
      if (!rim && !cliff && (sl < 1.5 || R() > 0.35)) continue;
      for (var k = 0, nk = 1 + (R() * (rim ? 4 : 3) | 0); k < nk && list.length < want; k++) {
        var gx = x + (R() - 0.5) * 10 * k, gz = z + (R() - 0.5) * 10 * k, s = (rim || cliff ? 2.5 + R() * 4.5 : 1.2 + R() * 3) * (k ? 0.6 : 1);
        if (k && Math.max(Math.abs(gx) - 104, gz - 112, -92 - gz) < -2 && !cliff) continue;
        list.push([gx, landT(gx, gz) - s * 0.32, gz, s, R() * TAU, R()]);
      }
    }
    var m = ctx.instanced(landRockGeo(3.3), mat, list.length, function (k, o) { var r = list[k]; o.position.set(r[0], r[1], r[2]); o.rotation.set((r[5] - 0.5) * 0.4, r[4], (r[5] - 0.5) * 0.3); o.scale.set(r[3] * (0.8 + r[5] * 0.5), r[3] * (0.7 + r[5] * 0.4), r[3]); });
    m.castShadow = true; m.receiveShadow = true; m.name = 'land-rocks'; ctx.scene.add(m);
    list.forEach(function (r) { if (r[0] > B.x[0] - 1 && r[0] < B.x[1] + 1 && r[2] > B.z[0] - 1 && r[2] < B.z[1] + 1) ctx.solid({ x: r[0], z: r[2], r: r[3] * 0.85 }); });
  }

  /* -- the valley -- */
  function landValley(ctx) {
    var THREE = ctx.THREE, low = LW.low, R = rng(7070), P = [], C = [], S = [], k;
    function light(x, z, warm, b, s, up) {
      var c = warm > 0.12 ? (warm > 0.75 ? [1.0, 0.66, 0.34] : [1.0, 0.44, 0.12]) : [0.8, 0.88, 1.0];
      P.push(x, landT(x, z) + (up || 2), z); C.push(c[0] * b, c[1] * b, c[2] * b); S.push(s);
    }
    LAND_VILLAGES.forEach(function (v) {
      var n = (v[3] * (low ? 0.35 : 0.8)) | 0, st = 3 + (R() * 3 | 0), a0 = R() * TAU;
      for (var i = 0; i < n; i++) {
        var a, r;
        if (i < n * 0.45) { a = R() * TAU; r = v[2] * 0.32 * Math.sqrt(R()); }   // the core
        else { a = a0 + (i % st) / st * TAU + (R() - 0.5) * 0.25; r = v[2] * (0.25 + 0.75 * Math.pow(R(), 0.8)); }   // its streets
        light(v[0] + Math.cos(a) * r, v[1] + Math.sin(a) * r * 0.75, R(), (0.8 + R() * 1.6) * (i < n * 0.45 ? 1.2 : 1), 1.6 + R() * 1.8, 1.5 + R() * 7);
      }
    });
    LW.roads = [];
    LAND_ROADS.forEach(function (rd, ri) {
      var pts = [], L = 0;
      for (var i = 0; i + 1 < rd.length; i += 2) { var p = [rd[i], landT(rd[i], rd[i + 1]) + 1.2, rd[i + 1]]; if (pts.length) L += Math.hypot(p[0] - pts[pts.length - 1][0], p[2] - pts[pts.length - 1][2]); p.push(L); pts.push(p); }
      for (var s = 0; s < L; s += 26) { var q = landRoadAt(pts, s); light(q[0], q[2], 0.5, 1.5, 1.6, 6); if (R() < 0.18) { var sd = (R() < 0.5 ? -25 : 25) / (Math.hypot(q[3], q[4]) || 1); light(q[0] + q[4] * sd, q[2] - q[3] * sd, R(), 1.2, 1.5, 3); } }
      LW.roads.push(pts);
    });
    for (k = 0; k < (low ? 30 : 70); k++) { var lx = -1100 + R() * 2200, lz = -700 - R() * 900; if (landT(lx, lz) < 160) light(lx, lz, R(), 0.9 + R() * 1.2, 1.3 + R(), 2); }   // lone chalets on the far slopes
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', landAt(P, 3)); g.setAttribute('aC', landAt(C, 3)); g.setAttribute('aS', landAt(S, 1));
    var pm = new THREE.ShaderMaterial({ uniforms: landUniforms(THREE), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      vertexShader: 'attribute vec3 aC; attribute float aS; uniform float uTime; varying vec3 vC; varying float vK;\nvoid main() {\n vec4 mv = viewMatrix*modelMatrix*vec4(position, 1.0); gl_Position = projectionMatrix*mv;\n float d = -mv.z, s = clamp(aS*900.0/max(d, 1.0), 1.3, 1.3+aS*0.8);\n vC = aC*exp(-d*0.0005)*(0.88+0.12*sin(uTime*3.0+position.x*0.37+position.z));\n gl_PointSize = s*5.0; vK = 5.0;\n}',
      fragmentShader: 'varying vec3 vC; varying float vK; void main() { float r = length(gl_PointCoord-0.5)*vK; gl_FragColor = vec4(vC*(1.0-smoothstep(0.15, 0.55, r)+0.07*exp(-r*1.1)), 1.0); }' });
    var pts = new THREE.Points(g, pm); pts.frustumCulled = false; pts.renderOrder = 5; pts.userData.noReflection = true; ctx.scene.add(pts);
    var NC = low ? 6 : 12, cp = new Float32Array(NC * 3), cc = new Float32Array(NC * 3), cs = new Float32Array(NC);
    LW.cars = [];
    for (k = 0; k < NC; k++) { LW.cars.push({ road: k % LW.roads.length, s: R() * 1500, v: (R() < 0.5 ? -1 : 1) * (7 + R() * 6) }); cs[k] = 2.2; }
    var cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.BufferAttribute(cp, 3)); cg.setAttribute('aC', new THREE.BufferAttribute(cc, 3)); cg.setAttribute('aS', new THREE.BufferAttribute(cs, 1));
    var cm = new THREE.Points(cg, pm); cm.frustumCulled = false; cm.renderOrder = 5; ctx.scene.add(cm); LW.carPts = cg;
    var glow = ctx.textures.canvas(256, 128, function (g2, w, h) {
      g2.fillStyle = '#000'; g2.fillRect(0, 0, w, h);
      LAND_VILLAGES.forEach(function (v) { var x = (v[0] + 1600) / 3200 * w, y = (v[1] + 1700) / 1200 * h, r = v[2] * 2.4 / 3200 * w, gr = g2.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,150,70,' + Math.min(1, v[3] / 200) + ')'); gr.addColorStop(1, 'rgba(255,150,70,0)'); g2.fillStyle = gr; g2.fillRect(x - r, y - r, r * 2, r * 2); });
    }, { linear: true });
    var mg = new THREE.PlaneGeometry(3200, 1200, 64, 24).rotateX(-PI / 2), mp = mg.attributes.position, gap = [];
    for (k = 0; k < mp.count; k++) gap.push(-232 - landT(mp.getX(k), mp.getZ(k) - 1100));
    mg.setAttribute('aGap', landAt(gap, 1));
    var mist = new THREE.Mesh(mg, new THREE.ShaderMaterial({
      uniforms: Object.assign({ uGlow: { value: glow } }, landUniforms(THREE)), transparent: true, depthWrite: false, fog: false,
      vertexShader: 'attribute float aGap; varying vec3 vW; varying float vG; void main() { vec4 w = modelMatrix*vec4(position, 1.0); vW = w.xyz; vG = aGap; gl_Position = projectionMatrix*viewMatrix*w; }',
      fragmentShader: LAND_UNI + LAND_GLSL + '\nuniform sampler2D uGlow; varying vec3 vW; varying float vG;\nvoid main() {\n vec2 p = vW.xz*0.004+vec2(uTime*0.003, 0.0);\n float n = lsF(p+lsF(p*1.7+3.0)*0.9);\n float a = (0.12+0.2*smoothstep(0.35, 0.8, n))*smoothstep(0.0, 30.0, vG)*smoothstep(80.0, 400.0, distance(vW, cameraPosition));\n vec3 gl = texture2D(uGlow, vec2((vW.x+1600.0)/3200.0, 1.0-(vW.z+1700.0)/1200.0)).rgb;\n vec3 c = lsSky2(normalize(vec3(vW.x-cameraPosition.x, 0.1, vW.z-cameraPosition.z)), 0.2)*0.9+vec3(0.2, 0.1, 0.045)*gl*(0.6+0.6*n);\n gl_FragColor = vec4(c, a*(1.0+gl.r));\n}',
    }));
    mist.position.set(0, -232, -1100); mist.renderOrder = 4; mist.userData.noReflection = true; ctx.scene.add(mist);
  }
  function landRoadAt(pts, s) {
    var L = pts[pts.length - 1][3]; s = ((s % L) + L) % L;
    for (var i = 1; i < pts.length; i++) if (pts[i][3] >= s) { var a = pts[i - 1], b = pts[i], t = (s - a[3]) / Math.max(1e-3, b[3] - a[3]); return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t), b[0] - a[0], b[2] - a[2]]; }
    return pts[0];
  }

  /* -- falling snow -- */
  function landSnowfall(ctx) {
    var THREE = ctx.THREE, N = LW.low ? 2200 : 4800, M = LW.low ? 90 : 200, R = rng(4711), pos = new Float32Array((N + M) * 3), seed = new Float32Array(N + M), i;
    for (i = 0; i < N + M; i++) { var nr = i >= N; pos[i * 3] = R() * (nr ? 8 : 56); pos[i * 3 + 1] = R() * (nr ? 5 : 26); pos[i * 3 + 2] = R() * (nr ? 8 : 56); seed[i] = R() + (nr ? 2 : 0); }
    var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    var fl = [], fc = [], fd = []; for (i = 0; i < 12; i++) { fl.push(new THREE.Vector4(0, -999, 0, 1)); fc.push(new THREE.Vector3()); fd.push(new THREE.Vector4(0, -1, 0, -2)); }
    LW.snowU = Object.assign({ uCam: { value: new THREE.Vector3() }, uScale: { value: 800 }, uFL: { value: fl }, uFC: { value: fc }, uFD: { value: fd } }, landUniforms(THREE));
    var m = new THREE.ShaderMaterial({
      uniforms: LW.snowU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      vertexShader: [
      'attribute float aSeed; uniform float uTime, uScale; uniform vec3 uCam, uMoonCol; uniform vec4 uFL[12]; uniform vec3 uFC[12]; uniform vec4 uFD[12]; varying vec3 vC; varying float vA, vNr;',
      'void main() {',
      '  vNr = step(1.5, aSeed); float sd = fract(aSeed); vec3 box = mix(vec3(56.0, 26.0, 56.0), vec3(8.0, 5.0, 8.0), vNr), p = position;',
      '  p+=vec3(0.5, 0.0, -0.3)*uTime*(0.5+sd*0.6); p.y-=uTime*(0.5+sd*0.55);',
      '  p.x += sin(uTime * (0.7 + sd) + sd * 40.0) * 0.35; p.z += cos(uTime * (0.5 + sd * 0.7) + sd * 23.0) * 0.35;',
      '  vec3 o = uCam-box*0.5; o.y = uCam.y-mix(9.0, 2.5, vNr); p = mod(p-o, box)+o;',
      '  vec4 mv = viewMatrix*vec4(p, 1.0); gl_Position = projectionMatrix*mv; float d = -mv.z;',
      '  gl_PointSize = clamp(mix(0.032+sd*0.04, 0.02+sd*0.016, vNr)*uScale/d, 1.5, mix(13.0, 46.0, vNr));',
      '  vA = mix(smoothstep(0.4, 1.6, d)*(1.0-smoothstep(20.0, 28.0, d))*(0.55+0.45*sd), smoothstep(0.5, 1.2, d)*(1.0-smoothstep(3.5, 5.0, d))*1.1, vNr);',
      '  vec3 c = uMoonCol*0.3+vec3(0.04, 0.05, 0.08);',
      '  for (int i = 0; i<12; i++) { vec3 L = p-uFL[i].xyz; float dd = length(L); float a = clamp(1.0-dd/(uFL[i].w*1.3), 0.0, 1.0);',
      '    float cone = uFD[i].w<-1.0?1.0:smoothstep(uFD[i].w, mix(uFD[i].w, 1.0, 0.5)+1e-4, dot(L/max(dd, 0.01), uFD[i].xyz));',
      '    c += uFC[i] * a * a * cone * 2.2; }',
      '  vC = c;',
      '}'].join('\n'),
      fragmentShader: 'varying vec3 vC; varying float vA, vNr; void main() { float r = length((gl_PointCoord-0.5)*vec2(mix(1.0, 2.4, vNr), 1.0)); gl_FragColor = vec4(vC*(1.0-smoothstep(mix(0.12, 0.02, vNr), 0.5, r))*vA, 1.0); }',
    });
    var pts = new THREE.Points(g, m); pts.frustumCulled = false; pts.renderOrder = 6; pts.userData.noReflection = true; ctx.scene.add(pts);
  }

  /* -- per frame -- */
  function landLight(e) {
    if (!e) return null;
    if (e.length >= 7) return e;
    if (e.x == null) return null;
    var a = e._land || (e._land = []), p = e.p != null ? e.p : 1;
    if (e._cs !== e.c) { e._cs = e.c; e._c = Array.isArray(e.c) ? e.c : new THREE.Color(e.c || '#FFFFFF').toArray(); }
    var c = Array.isArray(e.c) ? e.c : e._c;
    a[0] = e.x; a[1] = e.y; a[2] = e.z; a[3] = c[0] * p; a[4] = c[1] * p; a[5] = c[2] * p; a[6] = e.r || 4;
    if (e.d) { a[7] = e.d[0]; a[8] = e.d[1]; a[9] = e.d[2]; a[10] = e.cos != null ? e.cos : 0.97; } else a.length = 7;
    return a;
  }
  function landUpdate(ctx, t, dt) {
    var cam = ctx.camera; if (!cam || !LW.U) return;
    var U = LW.U, cp = cam.position, i;
    U.uTime.value = t;
    if (LW.dome) LW.dome.position.copy(cp);
    if (LW.sil) LW.sil.position.set(cp.x, 0, cp.z);
    // (the moon's shadow map is kept on the hero by the platform: graphics.shadows.follow 'hero')
    var L = LIGHTS_FOR_SNOW, order = LW.order || (LW.order = []);
    order.length = 0;
    for (i = 0; i < L.length; i++) { var e = landLight(L[i]); if (e) order.push([(e[0] - cp.x) * (e[0] - cp.x) + (e[1] - cp.y) * (e[1] - cp.y) + (e[2] - cp.z) * (e[2] - cp.z) - e[6] * e[6] * 4, e]); }
    order.sort(function (p, q) { return p[0] - q[0]; });
    var m = Math.min(16, order.length);
    for (i = 0; i < m; i++) { var l = order[i][1]; U.uLP.value[i].set(l[0], l[1], l[2], Math.max(0.5, l[6])); U.uLC.value[i].set(l[3], l[4], l[5]); }
    U.uLN.value = m;
    var S = LW.snowU;
    if (S) {
      S.uCam.value.copy(cp); S.uScale.value = (typeof innerHeight === 'number' ? innerHeight : 900) * 0.9;
      for (i = 0; i < 12; i++) {
        var f = order[i] && order[i][1];
        if (f) { S.uFL.value[i].set(f[0], f[1], f[2], Math.max(0.5, f[6])); S.uFC.value[i].set(f[3], f[4], f[5]); if (f.length >= 11) S.uFD.value[i].set(f[7], f[8], f[9], Math.min(f[10], 0.999)); else S.uFD.value[i].set(0, -1, 0, -2); }
        else S.uFL.value[i].set(0, -999, 0, 1);
      }
    }
    if (LW.carPts) {
      var pa = LW.carPts.attributes.position, ca = LW.carPts.attributes.aC;
      for (i = 0; i < LW.cars.length; i++) {
        var car = LW.cars[i], rd = LW.roads[car.road]; car.s += car.v * dt;
        var q = landRoadAt(rd, car.s), toward = (q[3] * (cp.x - q[0]) + q[4] * (cp.z - q[2])) * car.v > 0;
        pa.setXYZ(i, q[0], q[1] + 0.8, q[2]); if (toward) ca.setXYZ(i, 5.0, 4.6, 4.0); else ca.setXYZ(i, 3.0, 0.15, 0.08);
      }
      pa.needsUpdate = true; ca.needsUpdate = true;
    }
    if (LW.wind && LW.ac) LW.wind.gain.setTargetAtTime(0.35 + 0.65 * smooth((Math.hypot(cp.x - SITE.terrace.x, cp.z - SITE.terrace.z) - 25) / 70), LW.ac.currentTime, 0.6);   // quieter by the party
  }

  /* -- the wind -- */
  function landAmbient(ctx) {
    var A = ctx.audio; if (!A || !A.context) return;
    var ac = A.context, len = ac.sampleRate * 3, buf = ac.createBuffer(1, len, ac.sampleRate), ch = buf.getChannelData(0), last = 0;
    for (var i = 0; i < len; i++) { last = last * 0.97 + (Math.random() * 2 - 1) * 0.03; ch[i] = (Math.random() * 2 - 1) * 0.6 + last * 6; }
    var out = ac.createGain(); out.gain.value = 0.6; out.connect(A.destination); LW.wind = out; LW.ac = ac;
    function bed(freq, q, gain, lfo, sweep) {
      var src = ac.createBufferSource(); src.buffer = buf; src.loop = true; src.loopStart = Math.random();
      var f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
      var g = ac.createGain(); g.gain.value = gain;
      var o = ac.createOscillator(), og = ac.createGain(); o.frequency.value = lfo; og.gain.value = gain * 0.8; o.connect(og); og.connect(g.gain); o.start();
      if (sweep) { var o2 = ac.createOscillator(), og2 = ac.createGain(); o2.frequency.value = lfo * 0.7; og2.gain.value = sweep; o2.connect(og2); og2.connect(f.frequency); o2.start(); }
      src.connect(f); f.connect(g); g.connect(out); src.start(0, Math.random() * 2);
    }
    bed(260, 0.6, 0.05, 0.06, 90); bed(900, 1.4, 0.014, 0.11, 260); bed(2600, 4.0, 0.004, 0.17, 700); bed(110, 0.5, 0.03, 0.045, 30);
  }

  /* ------------------------------------------------------------- the resort -- */
  //: AI Alps resort. Generated: edit scripts/.scratch/alps/parts-src/resort.js (readable, commented), then run
  //: python3 scripts/.scratch/alps/compact.py scripts/.scratch/alps/parts-src/resort.js scripts/.scratch/alps/parts/resort.js
  //: Gives RESORT_ASSETS, resortBuild, resortUpdate, RESORT_ENV; RS.planks: the planks maps, for party to share.
  // Savoyard hotel chalets round the deck, the club behind the stage, the balustrade, fences closing the play
  // area, the chairlift, the piste's masts and groomers, torches and lamps. One mesh per material; windows are
  // glass over rooms drawn in the shader; lamp light is baked into vertices; roof and sill snow is land's
  // snowCover. Party may take RS.planks (the planks surface's maps) instead of uploading a second copy.
  var RESORT_ASSETS = ['texture-chalet-planks', 'texture-stone-wall'];
  var RS = { L: [], solids: [], smoke: [], halo: [], pool: [], fir: [], torch: [], gl: [], doors: [], env: [], A: null, U: null };
  var RF = { x: 0, y: 0, z: 0, c: 1, s: 0 }, RC = [1, 1, 1], RQ = [0, 0, 0, 0], RS_W1 = [1, 1, 1];

  /* -- geometry: one growing buffer per material, written in a local frame --- */
  function rsFrame(x, y, z, yaw) { RF.x = x; RF.y = y; RF.z = z; RF.c = Math.cos(yaw || 0); RF.s = Math.sin(yaw || 0); }
  function rsW(x, z) { return [RF.x + x * RF.c + z * RF.s, RF.z - x * RF.s + z * RF.c]; }   // local xz -> world xz
  function rsGy(x, z) { var w = rsW(x, z); return H(w[0], w[1]) - RF.y; }                 // the ground under a local point
  function rsAcc() { return { p: [], uv: [], c: [], q: [], i: [], n: 0 }; }
  function rsLin(h) { var n = parseInt(h.slice(1), 16); return [Math.pow((n >> 16 & 255) / 255, 2.2), Math.pow((n >> 8 & 255) / 255, 2.2), Math.pow((n & 255) / 255, 2.2)]; }
  //: rsPaint: colour, roughness, metalness, glow (colour x glow is its light), clear (1: no snow on it)
  function rsPaint(h, r, m, g, cl) { RC = typeof h === 'string' ? rsLin(h) : h; RQ = [r == null ? 0.6 : r, m || 0, g || 0, cl || 0]; }
  function rsV(A, x, y, z, u, v) {
    A.p.push(RF.x + x * RF.c + z * RF.s, RF.y + y, RF.z - x * RF.s + z * RF.c); A.uv.push(u || 0, v || 0);
    A.c.push(RC[0], RC[1], RC[2]); A.q.push(RQ[0], RQ[1], RQ[2], RQ[3]); return A.n++;
  }
  // a quad from four local points, counter-clockwise from the side it faces; rsQuadN turns it to face (nx, ny, nz)
  function rsQuad(A, a, b, c, d, uv) {
    var u = uv || [0, 0, 1, 1], i = rsV(A, a[0], a[1], a[2], u[0], u[1]);
    rsV(A, b[0], b[1], b[2], u[2], u[1]); rsV(A, c[0], c[1], c[2], u[2], u[3]); rsV(A, d[0], d[1], d[2], u[0], u[3]);
    A.i.push(i, i + 1, i + 2, i, i + 2, i + 3);
  }
  function rsQuadN(A, a, b, c, d, nx, ny, nz) {
    var ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
    if ((uy * vz - uz * vy) * nx + (uz * vx - ux * vz) * ny + (ux * vy - uy * vx) * nz < 0) rsQuad(A, a, d, c, b); else rsQuad(A, a, b, c, d);
  }
  // a box: centre o and three half-axes (a right-handed set)
  function rsOBox(A, o, ex, ey, ez) {
    function P(a, b, c) { return [o[0] + ex[0] * a + ey[0] * b + ez[0] * c, o[1] + ex[1] * a + ey[1] * b + ez[1] * c, o[2] + ex[2] * a + ey[2] * b + ez[2] * c]; }
    var p = [P(-1, -1, -1), P(1, -1, -1), P(1, 1, -1), P(-1, 1, -1), P(-1, -1, 1), P(1, -1, 1), P(1, 1, 1), P(-1, 1, 1)];
    rsQuad(A, p[4], p[5], p[6], p[7]); rsQuad(A, p[1], p[0], p[3], p[2]); rsQuad(A, p[5], p[1], p[2], p[6]);
    rsQuad(A, p[0], p[4], p[7], p[3]); rsQuad(A, p[7], p[6], p[2], p[3]); rsQuad(A, p[0], p[1], p[5], p[4]);
  }
  function rsBox(A, x, y, z, hx, hy, hz) { rsOBox(A, [x, y, z], [hx, 0, 0], [0, hy, 0], [0, 0, hz]); }
  // a beam w wide and h tall from a to b (local points)
  function rsBeam(A, a, b, w, h) {
    var dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], sx = -dz, sz = dx, sl = Math.sqrt(sx * sx + sz * sz);
    if (sl < 1e-6) { sx = 1; sz = 0; sl = 1; }
    var ex = [dx / 2, dy / 2, dz / 2], ez = [sx / sl * w / 2, 0, sz / sl * w / 2];
    var ux = ez[1] * ex[2] - ez[2] * ex[1], uy = ez[2] * ex[0] - ez[0] * ex[2], uz = ez[0] * ex[1] - ez[1] * ex[0], ul = Math.sqrt(ux * ux + uy * uy + uz * uz) || 1;
    rsOBox(A, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], ex, [ux / ul * h / 2, uy / ul * h / 2, uz / ul * h / 2], ez);
  }
  function rsCyl(A, x, y, z, r0, r1, h, seg, cap) {
    var b = A.n, i, a;
    for (i = 0; i <= seg; i++) { a = i / seg * TAU; rsV(A, x + Math.cos(a) * r0, y, z + Math.sin(a) * r0, i / seg, 0); rsV(A, x + Math.cos(a) * r1, y + h, z + Math.sin(a) * r1, i / seg, 1); }
    for (i = 0; i < seg; i++) { var k = b + i * 2; A.i.push(k, k + 1, k + 3, k, k + 3, k + 2); }
    if (cap && r1 > 0) { var c0 = rsV(A, x, y + h, z), s0 = A.n; for (i = 0; i < seg; i++) { a = i / seg * TAU; rsV(A, x + Math.cos(a) * r1, y + h, z + Math.sin(a) * r1); } for (i = 0; i < seg; i++) A.i.push(c0, s0 + (i + 1) % seg, s0 + i); }
  }
  function rsLathe(A, x, y, z, prof, seg) {   // prof: [radius, height] from the bottom up; faces out (in, if it runs down)
    var b = A.n, m = prof.length, i, j;
    for (j = 0; j < m; j++) for (i = 0; i <= seg; i++) { var a = i / seg * TAU; rsV(A, x + Math.cos(a) * prof[j][0], y + prof[j][1], z + Math.sin(a) * prof[j][0]); }
    for (j = 0; j < m - 1; j++) for (i = 0; i < seg; i++) { var k = b + j * (seg + 1) + i, k2 = k + seg + 1; A.i.push(k, k2, k2 + 1, k, k2 + 1, k + 1); }
  }
  // an open cone from apex a to the centre of its mouth b (beams of light); uv.y runs 0 at the apex to 1 at the mouth
  function rsCone(A, a, b, r0, r1, seg) {
    var ax = b[0] - a[0], ay = b[1] - a[1], az = b[2] - a[2], L = Math.sqrt(ax * ax + ay * ay + az * az); ax /= L; ay /= L; az /= L;
    var ux = Math.abs(ay) > 0.9 ? 1 : 0, uy = Math.abs(ay) > 0.9 ? 0 : 1;
    var px = uy * az, py = -ux * az, pz = ux * ay - uy * ax, pl = Math.sqrt(px * px + py * py + pz * pz); px /= pl; py /= pl; pz /= pl;
    var qx = ay * pz - az * py, qy = az * px - ax * pz, qz = ax * py - ay * px, b0 = A.n, i;
    for (i = 0; i <= seg; i++) {
      var t = i / seg * TAU, cs = Math.cos(t), sn = Math.sin(t), dx = px * cs + qx * sn, dy = py * cs + qy * sn, dz = pz * cs + qz * sn;
      rsV(A, a[0] + dx * r0, a[1] + dy * r0, a[2] + dz * r0, i / seg, 0); rsV(A, b[0] + dx * r1, b[1] + dy * r1, b[2] + dz * r1, i / seg, 1);
    }
    for (i = 0; i < seg; i++) { var k = b0 + i * 2; A.i.push(k, k + 1, k + 3, k, k + 3, k + 2); }
  }
  // a quad grid lying on the ground over [x0,x1] x [z0,z1], dy above it, cells about s wide
  function rsFlat(A, x0, x1, z0, z1, dy, s) {
    var nx = Math.max(1, Math.round((x1 - x0) / s)), nz = Math.max(1, Math.round((z1 - z0) / s)), b = A.n, i, j;
    for (j = 0; j <= nz; j++) for (i = 0; i <= nx; i++) { var x = x0 + (x1 - x0) * i / nx, z = z0 + (z1 - z0) * j / nz; rsV(A, x, rsGy(x, z) + dy, z); }
    for (j = 0; j < nz; j++) for (i = 0; i < nx; i++) { var a = b + j * (nx + 1) + i; A.i.push(a, a + nx + 1, a + nx + 2, a, a + nx + 2, a + 1); }
  }
  function rsNz(x) { return Math.sin(x * 1.71) * 0.5 + Math.sin(x * 0.63 + 1.3) * 0.32 + Math.sin(x * 3.9 + 0.4) * 0.18; }
  // samples over [a, b], packed near both ends (rounded edges) and at the extra points (a ridge)
  function rsSamp(a, b, step, extra) {
    var s = [], E = [0, 0.03, 0.09, 0.2, 0.38, 0.62], i;
    E.forEach(function (e) { if (e < (b - a) / 2) { s.push(a + e); s.push(b - e); } });
    var n = Math.max(1, Math.round((b - a) / step)); for (i = 1; i < n; i++) s.push(a + (b - a) * i / n);
    (extra || []).forEach(function (x) { if (x > a && x < b) { s.push(x); s.push(x - 0.25); s.push(x + 0.25); } });
    s.sort(function (p, q) { return p - q; });
    return s.filter(function (v, k) { return k === 0 || v - s[k - 1] > 0.012; });
  }
  // a pillow of snow on the surface yf(x, z) over [x0,x1] x [z0,z1], T thick, rounded at its edges. ox, oz run it
  // past the edges as a cornice that droops below the roof's edge, scalloped between the rafters along the x edges
  // and bluish (the tint the snow shader reads) where it thins; near the eaves it sags a little between rafters
  function rsPillow(A, x0, x1, z0, z1, yf, T, ridge, seed, ox, oz) {
    ox = ox || 0; oz = oz || 0;
    var K = RC, F = [1, 0.86, 0.6, 0.3], xs = [], zs = [], b = A.n, i, j, R0 = Math.max(T * 1.1, ox, oz);
    function side(lo, hi, o, st, ex, out) { var q; if (o) for (q = 0; q < 4; q++) out.push([lo, -F[q]]); rsSamp(lo, hi, st, ex).forEach(function (v) { out.push([v, 0]); }); if (o) for (q = 3; q >= 0; q--) out.push([hi, F[q]]); }
    side(x0, x1, ox, RS.step, ridge, xs); side(z0, z1, oz, ox ? RS.step * 0.45 : RS.step, null, zs);
    for (j = 0; j < zs.length; j++) for (i = 0; i < xs.length; i++) {
      var zq = zs[j], xq = xs[i], z = zq[0] + zq[1] * oz, ow = ox * (0.74 + 0.26 * Math.cos(z * 6.83 + seed)), x = xq[0] + xq[1] * ow, ix = Math.min(x - x0, x1 - x);
      var d = Math.min(xq[1] ? (1 - Math.abs(xq[1])) * ow : ix + ow, zq[1] ? (1 - Math.abs(zq[1])) * oz : Math.min(z - z0, z1 - z) + oz), k = Math.min(d / R0, 1);
      var th = d < 0.004 ? -Math.min(0.3, T * 0.6) - (ox ? T * 0.3 : 0) : T * Math.sqrt(1 - (1 - k) * (1 - k)) * (1 + 0.16 * rsNz(x * 0.8 + z * 0.37 + seed) * k);
      if (ridge) th *= 0.86 + 0.14 * Math.min(1, Math.abs(x - ridge[0]) / 2.5);
      if (ox && !xq[1]) th *= 1 - 0.1 * (0.5 + 0.5 * Math.cos(z * 6.83 + seed + PI)) * smooth(1 - ix / 1.4);
      var u = Math.max(Math.abs(xq[1]), Math.abs(zq[1])); RC = [1 - 0.22 * u, 1 - 0.1 * u, 1];
      rsV(A, x, yf(x, z) + th, z);
    }
    RC = K;
    var nx = xs.length; for (j = 0; j < zs.length - 1; j++) for (i = 0; i < nx - 1; i++) { var a = b + j * nx + i; A.i.push(a, a + nx, a + nx + 1, a, a + nx + 1, a + 1); }
  }
  // a rounded bead of snow along a rail or sill from a to b (its top surface), w wide and h high
  function rsBead(A, a, b, w, h, seed) {
    var K = RC, dx = b[0] - a[0], dz = b[2] - a[2], L = Math.sqrt(dx * dx + dz * dz) || 1e-3, sx = -dz / L * w / 2, sz = dx / L * w / 2;
    var n = Math.max(2, Math.ceil(L / 0.45)), b0 = A.n, i, k; RC = RS_W1;
    for (i = 0; i <= n; i++) {
      var t = i / n, e = Math.min(1, Math.min(t, 1 - t) * L / 0.18), hh = h * Math.sqrt(e) * (1 + 0.25 * rsNz(t * L * 2.3 + seed));
      for (k = 0; k <= 5; k++) { var th = k / 5 * PI, c = Math.cos(th), s = Math.sin(th); rsV(A, a[0] + dx * t + sx * c * 1.08, a[1] + (b[1] - a[1]) * t + s * hh - 0.012, a[2] + dz * t + sz * c * 1.08); }
    }
    for (i = 0; i < n; i++) for (k = 0; k < 5; k++) { var q = b0 + i * 6 + k; A.i.push(q, q + 1, q + 7, q, q + 7, q + 6); }
    RC = K;
  }
  // icicles in clusters along a drip edge from a to b (local [x, z]) hanging from y: a few long ones with shorter
  // ones round them, gaps between the clusters, 5 to 60 cm long (times sc)
  function rsIcicles(a, b, y, sc, seed) {
    var A = RS.A.ice, R = rng(seed * 131 + 7), L = Math.hypot(b[0] - a[0], b[1] - a[1]), s = R() * 1.6 * RS.ice;
    while (s < L) {
      var n = 2 + (R() * 6 | 0), Lm = (0.1 + Math.pow(R(), 1.5) * 0.5) * sc, st = 0.07 + R() * 0.07;
      for (var k = 0; k < n && s < L; k++, s += st) {
        var t = s / L, h = Math.max(0.05, Lm * (0.3 + 0.7 * Math.sin(PI * (0.15 + 0.7 * k / Math.max(1, n - 1)))) * (0.6 + 0.5 * R())), r = 0.012 + h * 0.055;
        rsLathe(A, a[0] + (b[0] - a[0]) * t + (R() - 0.5) * 0.04, y - h, a[1] + (b[1] - a[1]) * t, [[0.001, 0], [r * 0.45, h * 0.55], [r, h]], 4);
      }
      s += (0.5 + R() * 2.3) * RS.ice;
    }
  }
  // a wall face from local point o along the unit vector t (horizontal), length L, y0..y1, less the holes
  function rsWallFace(A, o, t, L, y0, y1, holes, cell) {
    var us = [0, L], vs = [y0, y1], i, j, nu = Math.max(1, Math.round(L / cell)), nv = Math.max(1, Math.round((y1 - y0) / cell));
    for (i = 1; i < nu; i++) us.push(L * i / nu); for (i = 1; i < nv; i++) vs.push(y0 + (y1 - y0) * i / nv);
    holes.forEach(function (h) { us.push(h[0], h[1]); vs.push(h[2], h[3]); });
    function uniq(a, lo, hi) { a = a.filter(function (v) { return v >= lo - 1e-6 && v <= hi + 1e-6; }).sort(function (p, q) { return p - q; }); return a.filter(function (v, k) { return k === 0 || v - a[k - 1] > 1e-4; }); }
    us = uniq(us, 0, L); vs = uniq(vs, y0, y1);
    var map = {}, NU = us.length;
    function vid(a, b) { var key = b * NU + a; if (map[key] == null) map[key] = rsV(A, o[0] + t[0] * us[a], vs[b], o[1] + t[1] * us[a]); return map[key]; }
    for (j = 0; j < vs.length - 1; j++) for (i = 0; i < NU - 1; i++) {
      var cu = (us[i] + us[i + 1]) / 2, cv = (vs[j] + vs[j + 1]) / 2, hit = false;
      for (var k = 0; k < holes.length; k++) { var h = holes[k]; if (cu > h[0] && cu < h[1] && cv > h[2] && cv < h[3]) { hit = true; break; } }
      if (!hit) { var a = vid(i, j), b = vid(i + 1, j), c = vid(i + 1, j + 1), d = vid(i, j + 1); A.i.push(a, b, c, a, c, d); }
    }
  }
  // a gable: the triangle over a wall of length L from yb up to yb + gh at its middle, less one hole
  function rsGable(A, o, t, L, yb, gh, hole) {
    var vs = [yb], n = Math.ceil(gh / 0.6), i, P = function (u, v) { return [o[0] + t[0] * u, v, o[1] + t[1] * u]; };
    for (i = 1; i < n; i++) vs.push(yb + gh * i / n); if (hole) vs.push(hole[2], hole[3]);
    vs.sort(function (a, b) { return a - b; }); vs.push(yb + gh);
    function half(v) { return L / 2 * (1 - (v - yb) / gh); }
    function trap(a0, a1, b0, b1, va, vb) {   // a trapezoid in columns about a metre wide (for the baked light)
      var m = Math.max(1, Math.ceil((a1 - a0) / 1.1));
      for (var j = 0; j < m; j++) { var f = j / m, g = (j + 1) / m; rsQuad(A, P(a0 + (a1 - a0) * f, va), P(a0 + (a1 - a0) * g, va), P(b0 + (b1 - b0) * g, vb), P(b0 + (b1 - b0) * f, vb)); }
    }
    for (i = 0; i < vs.length - 1; i++) {
      var va = vs[i], vb = vs[i + 1]; if (vb - va < 1e-4) continue;
      var ha = half(va), hb = half(vb), mid = (va + vb) / 2;
      if (hole && mid > hole[2] && mid < hole[3]) { trap(L / 2 - ha, hole[0], L / 2 - hb, hole[0], va, vb); trap(hole[1], L / 2 + ha, hole[1], L / 2 + hb, va, vb); }
      else trap(L / 2 - ha, L / 2 + ha, L / 2 - hb, L / 2 + hb, va, vb);
    }
  }
  // a light the vertices take in (and a halo in the air, a pool on land's snow): local point, colour, power, reach,
  // the way it faces (0 0 0: all round)
  function rsLight(x, y, z, col, I, r, nx, ny, nz, halo, pool) {
    var w = rsW(x, z), d = rsW(nx || 0, nz || 0); d[0] -= RF.x; d[1] -= RF.z;
    var L = { x: w[0], y: RF.y + y, z: w[1], c: col, I: I, r: r, nx: d[0], ny: ny || 0, nz: d[1] }; RS.L.push(L);
    if (halo) RS.halo.push([L.x, L.y, L.z, col[0] * halo, col[1] * halo, col[2] * halo, halo > 2 ? 3.2 : 1.3]);
    if (pool) RS.pool.push([L.x, L.y, L.z, col[0] * I * 0.3, col[1] * I * 0.3, col[2] * I * 0.3, pool]);
    return L;
  }
  function rsSolid(xa, xb, za, zb, y0, y1, n) {   // a local rectangle as world boxes (n slices along x if askew)
    for (var q = 0; q < (n || 1); q++) {
      var a = xa + (xb - xa) * q / (n || 1), b = xa + (xb - xa) * (q + 1) / (n || 1), p = [rsW(a, za), rsW(b, za), rsW(b, zb), rsW(a, zb)];
      RS.solids.push({ min: { x: Math.min(p[0][0], p[1][0], p[2][0], p[3][0]), y: RF.y + y0, z: Math.min(p[0][1], p[1][1], p[2][1], p[3][1]) }, max: { x: Math.max(p[0][0], p[1][0], p[2][0], p[3][0]), y: RF.y + y1, z: Math.max(p[0][1], p[1][1], p[2][1], p[3][1]) } });
    }
  }
  function rsRing(x, z, r) { var w = rsW(x, z); RS.solids.push({ x: w[0], z: w[1], r: r }); }
  // a sign board from the atlas, readable from both faces: centre, size, the way it faces (local yaw), uv
  function rsPlate(x, y, z, w, h, an, uv) {
    var tx = Math.cos(an) * w / 2, tz = -Math.sin(an) * w / 2, nx = Math.sin(an) * 0.012, nz = Math.cos(an) * 0.012, A = RS.A.rail;
    rsQuad(A, [x - tx + nx, y - h / 2, z - tz + nz], [x + tx + nx, y - h / 2, z + tz + nz], [x + tx + nx, y + h / 2, z + tz + nz], [x - tx + nx, y + h / 2, z - tz + nz], uv);
    rsQuad(A, [x + tx - nx, y - h / 2, z + tz - nz], [x - tx - nx, y - h / 2, z - tz - nz], [x - tx - nx, y + h / 2, z - tz - nz], [x + tx - nx, y + h / 2, z + tz - nz], uv);
  }
  var RS_Q4 = [[-1, -1], [1, -1], [1, 1], [-1, 1]], RS_WARM = [1.0, 0.56, 0.24], RS_LAMP = [1.0, 0.64, 0.32], RS_LED = [1.0, 0.86, 0.66];

  /* -- props: lanterns, lamps, torches, racks, sleds ----------------------- */
  // a wrought-iron lantern hung off a wall on a bracket; (x, y, z) its centre, (nx, nz) the wall's outward normal
  function rsLantern(x, y, z, nx, nz) {
    var P = RS.A.props;
    rsPaint('#16130F', 0.55, 0.6); rsBeam(P, [x - nx * 0.32, y + 0.28, z - nz * 0.32], [x, y + 0.28, z], 0.035, 0.035);
    rsBox(P, x, y - 0.21, z, 0.12, 0.025, 0.12); rsBox(P, x, y + 0.21, z, 0.14, 0.03, 0.14); rsCyl(P, x, y + 0.24, z, 0.13, 0.02, 0.13, 4);
    RS_Q4.forEach(function (q) { rsBox(P, x + q[0] * 0.105, y, z + q[1] * 0.105, 0.012, 0.2, 0.012); });
    rsPaint(RS_LAMP, 0.3, 0, 5); rsBox(P, x, y, z, 0.095, 0.18, 0.095);
    rsBead(RS.A.snow, [x - 0.09, y + 0.38, z], [x + 0.09, y + 0.38, z], 0.16, 0.07, x);
    rsLight(x + nx * 0.1, y, z + nz * 0.1, RS_LAMP, 4.2, 7, 0, 0, 0, 2.2, 4.5);
  }
  // a cast-iron lamp post: a fluted pole and a lantern head with a snowy cap
  function rsLampPost(x, y, z, h) {
    var P = RS.A.props; rsPaint('#121315', 0.5, 0.7);
    rsLathe(P, x, y, z, [[0.17, 0], [0.17, 0.32], [0.11, 0.42], [0.075, 0.6], [0.06, h - 0.35], [0.09, h - 0.28], [0.06, h - 0.2]], 8);
    rsBox(P, x, y + h - 0.18, z, 0.17, 0.03, 0.17); rsBox(P, x, y + h + 0.42, z, 0.2, 0.035, 0.2); rsCyl(P, x, y + h + 0.45, z, 0.2, 0.03, 0.2, 4);
    RS_Q4.forEach(function (q) { rsBox(P, x + q[0] * 0.15, y + h + 0.12, z + q[1] * 0.15, 0.015, 0.29, 0.015); });
    rsPaint(RS_LAMP, 0.3, 0, 5.5); rsBox(P, x, y + h + 0.12, z, 0.13, 0.26, 0.13);
    rsBead(RS.A.snow, [x - 0.12, y + h + 0.6, z], [x + 0.12, y + h + 0.6, z], 0.28, 0.1, z);
    rsLight(x, y + h + 0.1, z, RS_LAMP, 3.4, 7, 0, 0, 0, 3, 6.5); rsRing(x, z, 0.22);
  }
  // a torch on a pole by the path: an iron bowl and a flame whose halo and snow pool flicker (resortUpdate)
  function rsTorch(x, z) {
    var P = RS.A.props, g = H(x, z); rsFrame(0, 0, 0, 0);
    rsPaint('#2A1C12', 0.85); rsCyl(P, x, g - 0.2, z, 0.055, 0.045, 1.85, 6); rsPaint('#141416', 0.5, 0.8); rsCyl(P, x, g + 1.6, z, 0.06, 0.16, 0.17, 8, true);
    rsPaint([1, 0.42, 0.1], 0.5, 0, 7, 1); rsCyl(P, x, g + 1.76, z, 0.12, 0, 0.44, 6); rsPaint([1, 0.78, 0.36], 0.5, 0, 10, 1); rsCyl(P, x, g + 1.76, z, 0.07, 0, 0.27, 5);
    RS.halo.push([x, g + 1.98, z, 1.8, 0.66, 0.2, -2.4]);
    var e = [x, g + 1.9, z, 2.1, 0.85, 0.28, 6.5]; RS.pool.push(e); RS.torch.push([e, 2.1, 0.85, 0.28]); rsRing(x, z, 0.16);
  }
  // a ski rack against a wall: two posts, two rails, skis and boards leaning on it; local (x, z), along +x
  function rsRack(x, z, len, seed) {
    var P = RS.A.props, W = RS.A.wood, R = rng(seed), y = rsGy(x, z), cols = ['#E8E6E0', '#B3241C', '#141518', '#1C4B8C', '#D9A21A', '#E8E6E0', '#2E7A54', '#141518'];
    [-len / 2, len / 2].forEach(function (u) { rsBox(W, x + u, y + 0.6, z, 0.06, 0.65, 0.06); });
    rsBox(W, x, y + 1.15, z, len / 2 + 0.06, 0.04, 0.05); rsBox(W, x, y + 0.3, z - 0.25, len / 2, 0.03, 0.04);
    rsBead(RS.A.snow, [x - len / 2, y + 1.19, z], [x + len / 2, y + 1.19, z], 0.12, 0.07, seed);
    for (var u = -len / 2 + 0.2; u < len / 2 - 0.1; u += 0.22 + R() * 0.12) {
      var board = R() < 0.25, L = board ? 1.5 : 1.7 + R() * 0.12; rsPaint(pick(cols, (R() * 8) | 0), 0.35, 0.1);
      var top = [x + u, y + Math.min(L * 0.96, 1.62), z + 0.03], bot = [x + u + (R() - 0.5) * 0.08, y + 0.02, z + 0.55];
      if (board) rsBeam(P, bot, top, 0.27, 0.02); else { rsBeam(P, [bot[0] - 0.045, bot[1], bot[2]], [top[0] - 0.045, top[1] + 0.05, top[2]], 0.08, 0.02); rsBeam(P, [bot[0] + 0.045, bot[1], bot[2]], [top[0] + 0.045, top[1] + 0.05, top[2]], 0.08, 0.02); u += 0.06; }
    }
    rsSolid(x - len / 2 - 0.1, x + len / 2 + 0.1, z - 0.1, z + 0.7, y - 0.3, y + 1.7, 1);
  }
  // a parked snowmobile at world (x, z) facing yaw
  function rsSled(x, z, yaw, paint, seed) {
    var P = RS.A.props; rsFrame(x, H(x, z), z, yaw);
    rsPaint('#202226', 0.4, 0.8); [-0.48, 0.48].forEach(function (sx) { rsBox(P, sx, 0.04, 1.05, 0.07, 0.025, 0.75); rsBeam(P, [sx, 0.03, 1.78], [sx, 0.22, 2.02], 0.14, 0.04); rsBeam(P, [sx, 0.05, 1.2], [sx * 0.7, 0.45, 1.1], 0.05, 0.05); });
    rsPaint('#0E0F11', 0.9, 0); rsBox(P, 0, 0.27, -0.55, 0.33, 0.2, 0.95);
    rsPaint(paint, 0.22, 0.25); rsOBox(P, [0, 0.55, 0.85], [0.5, 0, 0], [0, 0.24, 0.06], [0, -0.04, 0.7]); rsBeam(P, [0, 0.5, 1.5], [0, 0.3, 2.0], 0.85, 0.32); rsBox(P, 0, 0.5, -0.65, 0.42, 0.12, 0.85);
    rsPaint('#121316', 0.7, 0); rsBox(P, 0, 0.74, -0.35, 0.27, 0.11, 0.62);
    rsPaint('#1A2230', 0.08, 0.4); rsOBox(P, [0, 1.0, 0.98], [0.36, 0, 0], [0, 0.2, -0.07], [0, 0.02, 0.02]);
    rsPaint('#2A2C30', 0.4, 0.7); rsBeam(P, [-0.42, 0.95, 0.65], [0.42, 0.95, 0.65], 0.04, 0.04);
    rsPaint('#FFFFFF', 0.2, 0, 0.6); rsBox(P, 0, 0.62, 1.42, 0.16, 0.05, 0.08);
    rsPillow(RS.A.snow, -0.24, 0.24, -0.92, 0.2, function () { return 0.85; }, 0.08, null, seed);
    rsRing(0, 0, 0.95); rsRing(0, 1.1, 0.7);
  }

  /* -- windows: an opening in a wall, its reveals, glass, sill, casing, shutters -- */
  // o, t: the wall (local); u0..u1, v0..v1 the opening; dep the reveal; wall the material of the reveal; kind 0 a
  // room, 1 the club, 2 dark, 3 a lobby; the glass carries [seed, w, h, kind + sill / 10] for the room shader
  //: rsOpen kind: 0 a room, 1 the club, 2 dark, 3 a lobby
  function rsOpen(o, t, u0, u1, v0, v1, dep, wall, kind, sill, seed, sh) {
    var A = RS.A, n = [-t[1], t[0]], w = u1 - u0, h = v1 - v0;
    function P(u, v, d) { return [o[0] + t[0] * u + n[0] * d, v, o[1] + t[1] * u + n[1] * d]; }
    rsQuadN(wall, P(u0, v0, 0), P(u0, v0, -dep), P(u0, v1, -dep), P(u0, v1, 0), t[0], 0, t[1]);
    rsQuadN(wall, P(u1, v0, 0), P(u1, v1, 0), P(u1, v1, -dep), P(u1, v0, -dep), -t[0], 0, -t[1]);
    rsQuadN(wall, P(u0, v1, 0), P(u0, v1, -dep), P(u1, v1, -dep), P(u1, v1, 0), 0, -1, 0);
    rsQuadN(wall, P(u0, v0, 0), P(u1, v0, 0), P(u1, v0, -dep), P(u0, v0, -dep), 0, 1, 0);
    RQ = [seed, w, h, kind + Math.min(sill, 0.95) / 10]; rsQuad(A.glass, P(u0, v0, -dep), P(u1, v0, -dep), P(u1, v1, -dep), P(u0, v1, -dep));
    var stone = wall === A.stone, cu = (u0 + u1) / 2;
    if (v0 > 0.2) {   // a sill with a bead of snow on it
      var sa = P(u0 - 0.08, v0 - 0.035, 0.1), sb = P(u1 + 0.08, v0 - 0.035, 0.1);
      rsOBox(stone ? A.stone : A.wood, P(cu, v0 - 0.035, 0.03), [t[0] * (w / 2 + 0.08), 0, t[1] * (w / 2 + 0.08)], [0, 0.04, 0], [n[0] * 0.09, 0, n[1] * 0.09]);
      rsBead(A.snow, [sa[0] - n[0] * 0.04, v0 + 0.005, sa[2] - n[1] * 0.04], [sb[0] - n[0] * 0.04, v0 + 0.005, sb[2] - n[1] * 0.04], 0.15, 0.06 + seed * 0.05, seed * 50);
    }
    if (stone) rsOBox(A.wood, P(cu, v1 + 0.13, 0.02), [t[0] * (w / 2 + 0.25), 0, t[1] * (w / 2 + 0.25)], [0, 0.13, 0], [n[0] * 0.04, 0, n[1] * 0.04]);
    else {   // a timber casing round it, shutters on some
      [[u0 - 0.07, v0 - 0.05, u0, v1 + 0.05], [u1, v0 - 0.05, u1 + 0.07, v1 + 0.05], [u0 - 0.07, v1, u1 + 0.07, v1 + 0.12]].forEach(function (b) {
        rsOBox(A.wood, P((b[0] + b[2]) / 2, (b[1] + b[3]) / 2, 0.025), [t[0] * (b[2] - b[0]) / 2, 0, t[1] * (b[2] - b[0]) / 2], [0, (b[3] - b[1]) / 2, 0], [n[0] * 0.03, 0, n[1] * 0.03]);
      });
      if (sh) [-1, 1].forEach(function (sd) { rsOBox(A.wood, P(sd < 0 ? u0 - 0.1 - w / 4 : u1 + 0.1 + w / 4, (v0 + v1) / 2, 0.05), [t[0] * w / 4, 0, t[1] * w / 4], [0, h / 2, 0], [n[0] * 0.03, 0, n[1] * 0.03]); });
    }
    if (kind !== 2) { var lp = P(cu, (v0 + v1) / 2, 0.35); rsLight(lp[0], lp[1], lp[2], RS_WARM, (kind === 1 ? 0.7 : 1.7) * Math.min(3.2, w * h) / 2.4, 5, n[0], 0, n[1]); }
  }

  /* -- the hotel chalets ----------------------------------------------------- */
  // per chalet: [roof: 0 its gable to the front, 1 its eaves to the front under a projecting cross gable; the door's
  // offset (of the half width); a lower wing on local x side (+-1, 0 none); window rhythm: 0 even, 1 paired, 2 wide
  // and narrow; extra floors (the tower); 1: a hot tub on the second floor's terrace]
  //: RS_STY per chalet: [roof 0 gable front / 1 eaves front + cross gable, door offset, wing side, window rhythm, extra floors, hot tub]
  var RS_STY = [[1, 0.3, 0, 1], [0, 0, -1, 2, 1], [0, -0.3, -1, 0], [0, 0.2, 0, 1], [1, -0.28, 0, 2, 0, 1], [0, 0.22, 1, 0], [0, 0, 0, 2], [1, 0, 0, 1], [0, 0.25, 0, 0], [1, 0.2, 0, 2]];
  function rsChalet(c, k) {
    var A = RS.A, R = rng(7919 + k * 104729), S = RS_STY[k], X = S[0], W = c[2], D = c[3], F = c[4] + (S[4] || 0), hw = W / 2, hd = D / 2, yaw = c[5] * PI / 180, i, j, f, u;
    var gy = H(c[0], c[1]); rsFrame(c[0], gy, c[1], yaw);
    var hb = 3.6, hf = 3.05, hs = k % 3 === 2 ? hb + hf : hb, eave = hb + (F - 1) * hf, tp = Math.tan(((S[4] ? 33 : 22) + R() * 6) * PI / 180), rT = 0.34, oS = 1.3 + R() * 0.4, oF = 2.1 + R() * 0.7;
    var xd = S[1] * hw, cw = X ? Math.min(8.4, W * 0.44) : W, hc = cw / 2, pj = X ? 2.1 : 0, xc = X ? xd : 0, zf = hd + pj, tc = X ? Math.min(0.84, hd * tp / hc * 0.97) : tp;
    function yb(x, z) { return X ? eave + (hd - Math.abs(z)) * tp : eave + (hw - Math.abs(x)) * tp; }   // under the main roof
    var faces = [[[-hw, hd], [1, 0], W], [[hw, hd], [0, -1], D], [[hw, -hd], [-1, 0], W], [[-hw, -hd], [0, 1], D]];
    if (X) faces.push([[xc - hc, zf], [1, 0], cw], [[xc + hc, zf], [0, -1], pj], [[xc - hc, hd], [0, 1], pj]);   // the projecting bay
    var fr = X ? 4 : 0, holes = [], wood = [], ops = [], s0 = X ? hw + xc - hc - 0.2 : 1e9, s1 = X ? hw + xc + hc + 0.2 : -1e9;
    faces.forEach(function () { holes.push([]); wood.push([]); });
    function op(fc, u0, u1, v0, v1, kind, sill, sh) { if (fc === 0 && u1 > s0 && u0 < s1) return; (v1 <= hs + 0.01 ? holes : wood)[fc].push([u0, u1, v0, v1]); ops.push([fc, u0, u1, v0, v1, kind, sill, sh]); }
    function dk(p) { return R() < p ? 2 : 0; }
    // the entrance and lobby windows, french windows onto the balconies in this chalet's rhythm, sides and back
    var ud = X ? hc : hw + xd;
    op(fr, ud - 1.2, ud + 1.2, 0, 2.8, 3, 0);
    for (var sd = -1; sd <= 1; sd += 2) { for (u = hw + xd + sd * 2.95; u > 1 && u < W - 1; u += sd * 2.7) op(0, u - 0.85, u + 0.85, 0.7, 2.9, 3, 0.7); if (X) op(fr, hc + sd * 2.65 - 0.8, hc + sd * 2.65 + 0.8, 0.7, 2.9, 3, 0.7); }
    for (f = 1; f < F; f++) {
      var y0 = hb + (f - 1) * hf + 0.06, y1 = y0 + 2.34, P = S[3], nb = Math.max(2, Math.round(W / (P === 1 ? 4.4 : 3.5))), bs = W / nb, bw = Math.min(1.9, bs - 1.25);
      if (P === 2) for (u = 0.9 + (k % 2) * 0.6, j = 0; u < W - 1.9; j++) { var ww = j % 2 ? 1.0 : 2.4; if (u + ww > W - 0.8) break; op(0, u, u + ww, y0, y1, dk(0.16), 0.04); u += ww + 1.15; }
      else for (j = 0; j < nb; j++) { var bu = (j + 0.5) * bs; if (P === 1) { op(0, bu - 1.25, bu - 0.2, y0, y1, dk(0.16), 0.04); op(0, bu + 0.2, bu + 1.25, y0, y1, dk(0.16), 0.04); } else op(0, bu - bw / 2, bu + bw / 2, y0, y1, dk(0.16), 0.04); }
      if (X) { op(fr, hc - 1.6, hc - 0.2, y0, y1, dk(0.1), 0.04); op(fr, hc + 0.2, hc + 1.6, y0, y1, dk(0.1), 0.04); op(5, 0.5, 1.6, y0 + 0.8, y1, dk(0.3), 0.9); op(6, 0.5, 1.6, y0 + 0.8, y1, dk(0.3), 0.9); }
    }
    [1, 3].forEach(function (fc) {
      var n = Math.max(2, Math.floor(D / 4.2)), m = Math.max(2, Math.floor(D / 3.4)), s1 = D / n, ms = D / m;
      for (j = 0; j < n; j++) op(fc, (j + 0.5) * s1 - 0.55, (j + 0.5) * s1 + 0.55, 1.15, 2.55, dk(0.3), 1.0);
      for (f = 1; f < F; f++) for (j = 0; j < m; j++) op(fc, (j + 0.5) * ms - 0.62, (j + 0.5) * ms + 0.62, hb + (f - 1) * hf + 0.9, hb + (f - 1) * hf + 2.45, dk(0.2), 0.9, 1);
    });
    op(2, 1.4, 2.6, 0, 2.3, 2, 0);
    var nk = Math.max(2, Math.floor(W / 5)); for (f = 1; f < F; f++) for (j = 0; j < nk; j++) op(2, (j + 0.5) * W / nk - 0.6, (j + 0.5) * W / nk + 0.6, hb + (f - 1) * hf + 0.95, hb + (f - 1) * hf + 2.4, dk(0.3), 0.95, 1);
    // walls: stone below, timber above, a sill beam and a band at each floor; log ends crossing at the corners
    faces.forEach(function (fc, q) {
      rsWallFace(A.stone, fc[0], fc[1], fc[2], -1.2, hs, holes[q], 0.85); rsWallFace(A.wood, fc[0], fc[1], fc[2], hs, eave, wood[q], 1.0);
      var n = [-fc[1][1], fc[1][0]], cx = fc[0][0] + fc[1][0] * fc[2] / 2 + n[0] * 0.06, cz = fc[0][1] + fc[1][1] * fc[2] / 2 + n[1] * 0.06;
      for (f = hs > hb ? 1 : 0; f < F; f++) rsOBox(A.wood, [cx, hb + f * hf - (f ? 0.02 : 0.05), cz], [fc[1][0] * (fc[2] / 2 + 0.06), 0, fc[1][1] * (fc[2] / 2 + 0.06)], [0, f ? 0.09 : 0.14, 0], [n[0] * 0.08, 0, n[1] * 0.08]);
    });
    var cor = [[-hw, -hd, -1, -1], [hw, -hd, 1, -1], [hw, hd, 1, 1], [-hw, hd, -1, 1]]; if (X) cor.push([xc - hc, zf, -1, 1], [xc + hc, zf, 1, 1]);
    cor.forEach(function (q) { for (var y = hs + 0.3, a = 0; y < eave - 0.1; y += 0.26, a++) { if (a & 1) rsBox(A.wood, q[0] + q[2] * 0.14, y, q[1] - q[3] * 0.11, 0.14, 0.11, 0.11); else rsBox(A.wood, q[0] - q[2] * 0.11, y, q[1] + q[3] * 0.14, 0.11, 0.11, 0.14); } });
    ops.forEach(function (p) { var fc = faces[p[0]], st = p[4] <= hs + 0.01; rsOpen(fc[0], fc[1], p[1], p[2], p[3], p[4], st ? 0.36 : 0.2, st ? A.stone : A.wood, p[5], p[6], R(), p[7]); });
    // gables: the front one (the bay's, under the cross gable) with a tall attic window; side gables under eaves
    var gh = hc * tc, gw = Math.min(3.4, cw * 0.36), gwin = [hc - gw / 2, hc + gw / 2, eave + 0.4, eave + gh * 0.62], fo = faces[fr][0];
    rsGable(A.wood, fo, [1, 0], cw, eave, gh, gwin); rsOpen(fo, [1, 0], gwin[0], gwin[1], gwin[2], gwin[3], 0.22, A.wood, 0, 0.05, R());
    if (X) [1, 3].forEach(function (q) { var h2 = [D / 2 - 0.7, D / 2 + 0.7, eave + 0.35, eave + Math.min(1.9, hd * tp * 0.6)]; rsGable(A.wood, faces[q][0], faces[q][1], D, eave, hd * tp, h2); rsOpen(faces[q][0], faces[q][1], h2[0], h2[1], h2[2], h2[3], 0.2, A.wood, dk(0.3), 0.05, R()); });
    else rsGable(A.wood, faces[2][0], faces[2][1], W, eave, gh, null);
    // balconies on every upper floor, their lengths varying floor to floor; the first floor's leaves room for the
    // entrance canopy; one chalet has a deep terrace with a hot tub on the second floor
    for (f = 1; f < F; f++) {
      var yf = hb + (f - 1) * hf, pt = [1, 0.62, 0.86][(k + f) % 3], bx = hw * pt - 0.25;
      if (X) {
        [[-hw + 0.1, xc - hc], [xc + hc, hw - 0.1]].forEach(function (g, q) {
          var a = q ? g[0] : g[1] - (g[1] - g[0]) * pt, b = q ? g[0] + (g[1] - g[0]) * pt : g[1];
          if (S[5] && f === 2 && q) { rsBalcony(a, b, hd, hd + 3.0, yf, k * 10 + f, 1); rsTub((a + b) / 2 + 0.5, yf + 0.3, hd + 1.65); } else rsBalcony(a, b, hd, hd + 1.45, yf, k * 10 + f + q);
        });
        if (f > 1) rsBalcony(xc - hc + 0.35, xc + hc - 0.35, zf, zf + 1.2, yf, k * 10 + f + 5);
      } else if (f === 1) { rsBalcony(-bx, Math.min(bx, xd - 2.75), hd, hd + 1.45, yf, k * 10 + f); rsBalcony(Math.max(-bx, xd + 2.75), bx, hd, hd + 1.45, yf, k * 10 + f + 3); }
      else rsBalcony(-bx, bx, hd, hd + 1.45, yf, k * 10 + f);
    }
    if (X || !(k % 2)) rsBalcony(xc - gw / 2 - 1.1, xc + gw / 2 + 1.1, zf, zf + 1.1, eave + 0.38, k * 10 + 9);
    // the roofs: deep, under thick snow; purlins and struts under the front overhang; dormers on the long slopes
    var T0 = 0.5 + R() * 0.16, wc = rsW(xc, 0), dms = [];
    if (X) {
      [-1, 1].forEach(function (s) { var x = xc + s * (hc + 2.6); if (Math.abs(x) < hw - 1.6) dms.push([x, hd - 1.3, yaw]); });
      rsFrame(c[0], gy, c[1], yaw + PI / 2); rsRoof(hd, eave, tp, oS, -hw - 0.9, hw + 0.9, rT, T0, k, 1, -hw - 0.9);
      rsFrame(wc[0], gy, wc[1], yaw); rsRoof(hc, eave, tc, 0.7, 0, zf + 1.1, rT, T0 * 0.9, k + 50, 1, hd);
      [0, -1, 1].forEach(function (s) { var x = s * (hc - 0.35); rsBox(A.wood, x, eave + (hc - Math.abs(x)) * tc - 0.17, zf + 0.45, 0.12, 0.16, 0.65); });
      rsFrame(c[0], gy, c[1], yaw);
    } else {
      [1, -1].forEach(function (sx) {
        [0.04, hw * 0.5, hw - 0.45].forEach(function (px) {
          var x = sx * px, y = yb(x, 0) - 0.17; rsBox(A.wood, x, y, (hd - 0.5 + hd + oF) / 2, 0.13, 0.17, (oF + 0.5) / 2); rsBox(A.wood, x, y, -hd - 0.35, 0.13, 0.17, 0.85);
          if (px > 0.1) rsBeam(A.wood, [x, y - 1.73, hd + 0.05], [x, y - 0.13, hd + oF * 0.55], 0.15, 0.15);
        });
        (hw < 9 ? [hd * 0.3] : [hd * 0.5, -hd * 0.12]).forEach(function (z) { dms.push([sx * (hw - 1.5), z, yaw + sx * PI / 2]); });
      });
      rsRoof(hw, eave, tp, oS, -hd - 1.2, hd + oF, rT, T0, k, 1, -hd - 1.2);
    }
    dms.forEach(function (d, q) { var w0 = rsW(d[0], d[1]); rsFrame(w0[0], gy + yb(d[0], d[1]) + rT, w0[1], d[2]); rsDormer(2.4, tp, k * 10 + q); rsFrame(c[0], gy, c[1], yaw); });
    // lights under the front eaves, washing the gable and the balconies
    (X ? [[xc - hc * 0.5, zf + 0.45, eave + hc * 0.5 * tc], [xc + hc * 0.5, zf + 0.45, eave + hc * 0.5 * tc], [-hw + 2.2, hd + 0.5, eave - 0.2], [hw - 2.2, hd + 0.5, eave - 0.2]] : [[-hw * 0.5, hd + oF * 0.5, yb(hw * 0.5, 0)], [hw * 0.5, hd + oF * 0.5, yb(hw * 0.5, 0)]]).forEach(function (q) {
      rsPaint(RS_LED, 0.3, 0, 3.5); rsCyl(A.props, q[0], q[2] - 0.36, q[1], 0.09, 0.09, 0.03, 8); rsLight(q[0], q[2] - 0.5, q[1], RS_LED, 4.5, 9, 0, -1, 0);
    });
    [-gw / 2 - 0.6, gw / 2 + 0.6].forEach(function (x) { rsLight(xc + x, eave + 0.2, zf + 0.5, RS_LAMP, 5, 8, 0, 1, 0); });
    // chimneys, capped, smoking
    for (i = 0; i < (W > 18 ? 2 : 1); i++) {
      var cxl = (W > 18 && i ? 1 : -1) * hw * (X ? 0.45 + R() * 0.2 : 0.22 + R() * 0.18), czl = -hd * (X ? 0.3 + R() * 0.2 : 0.45 + R() * 0.3), yr = yb(cxl, czl), top = yr + rT + 1.6;
      rsBox(A.stone, cxl, (yr - 0.6 + top) / 2, czl, 0.48, (top - yr + 0.6) / 2, 0.48);
      RS_Q4.forEach(function (q) { rsBox(A.stone, cxl + q[0] * 0.38, top + 0.2, czl + q[1] * 0.38, 0.08, 0.2, 0.08); });
      rsBox(A.wood, cxl, top + 0.46, czl, 0.72, 0.07, 0.72);
      rsPillow(A.snow, cxl - 0.78, cxl + 0.78, czl - 0.78, czl + 0.78, function () { return top + 0.53; }, 0.22, null, i + k);
      var wq = rsW(cxl, czl); RS.smoke.push([wq[0], gy + top + 0.25, wq[1]]);
    }
    // the entrance, drifts against the walls (none on the forecourt), a ski rack, a wing on some
    rsEntry(xd, zf, k, R);
    faces.forEach(function (fc, q) { if (q === fr) rsDrift(fc[0], fc[1], fc[2], [[ud - 3.9, ud + 3.9]], k * 5 + q); else if (q && q < 4) rsDrift(fc[0], fc[1], fc[2], q === 2 ? [[1.1, 2.9]] : [], k * 5 + q); });
    if (X) { rsDrift([-hw, hd], [1, 0], hw + xc - hc, [], k); rsDrift([xc + hc, hd], [1, 0], hw - xc - hc, [], k + 1); }
    var rx = xd + (xd > 0 ? -1 : 1) * (X ? hc + 1.9 : 5.2); if (Math.abs(rx) < hw - 1.6) rsRack(rx, hd + 0.35, 2.4, k * 13 + 1);
    if (S[2]) rsWing(S[2], hw, hd, k);
    // colliders: the footprint (in slices when it stands askew) and the bay
    var sl = Math.abs(Math.sin(yaw) * Math.cos(yaw)) > 0.05 ? 4 : 1;
    rsSolid(-hw - 0.2, hw + 0.2, -hd - 0.2, hd + 0.25, -2, eave + hw * tp + 1, sl); if (X) rsSolid(xc - hc - 0.2, xc + hc + 0.2, hd, zf + 0.25, -2, eave + 3, 1);
    RS.doors.push(rsW(xd, zf + 3.2));
    RS.env.push([rsW(0, hd + 2), gy + eave * 0.55, W, eave]);
  }
  // a lower wing on one side (s: local x side): stone, big lit windows, a low gable roof deep in snow
  function rsWing(s, hw, hd, k) {
    var A = RS.A, x0 = s > 0 ? hw : -hw - 6.5, x1 = x0 + 6.5, zF = hd - 1.4, zB = -hd + 1.2, e = 3.8, tw = 0.36, h0 = [[0.5, 2.9, 0.55, 2.95], [3.6, 6.0, 0.55, 2.95]], h1 = [[0.8, 2.2, 1.0, 2.6], [3.2, 4.6, 1.0, 2.6]];
    var fs = [[[x0, zF], [1, 0], 6.5, h0, 3], [[x1, zB], [-1, 0], 6.5, [h1[0]], 2], s > 0 ? [[x1, zF], [0, -1], zF - zB, h1, 0] : [[x0, zB], [0, 1], zF - zB, h1, 0]];
    fs.forEach(function (f, q) { rsWallFace(A.stone, f[0], f[1], f[2], -1.2, e, f[3], 0.85); f[3].forEach(function (h) { rsOpen(f[0], f[1], h[0], h[1], h[2], h[3], 0.34, A.stone, f[4] === 3 ? 3 : q === 2 && h[0] > 2 ? 2 : f[4], h[2], 0.13 + q * 0.29 + h[0] * 0.07); }); if (q < 2) rsGable(A.wood, f[0], f[1], 6.5, e, 3.25 * tw, null); });
    var wc = rsW((x0 + x1) / 2, 0), keep = [RF.x, RF.z, Math.atan2(RF.s, RF.c)];
    rsFrame(wc[0], RF.y, wc[1], keep[2]); rsRoof(3.25, e, tw, 0.75, zB - 0.6, zF + 0.9, 0.28, 0.5, k * 7 + 3, 0.8, zB - 0.6); rsFrame(keep[0], RF.y, keep[1], keep[2]);
    rsDrift(fs[2][0], fs[2][1], fs[2][2], [], k * 3); rsDrift([x0, zF], [1, 0], 6.5, [], k * 3 + 1);
    rsSolid(x0 - 0.1, x1 + 0.2, zB - 0.2, zF + 0.25, -2, e + 3, 1);
  }
  // the entrance at local (x, z) on the front wall: a cleared, wet flagstone forecourt with a kerb and the plough's
  // berm, a stone step, a timber canopy deep in snow with downlights and the hotel's name on its fascia, lanterns,
  // and two potted firs (land's spruce) strung with fairy lights
  function rsEntry(x, z, k, R) {
    var A = RS.A, P = A.props, a = x - 3.7, b = x + 3.7, e = z + 4.5, zz = z + 0.05, dz, xx, dx, i;
    rsPaint('#0D0D0E', 0.85, 0, 0, 1); rsFlat(P, a, b, z, e, 0.025, 1.2);
    while (zz < e - 0.2) { dz = Math.min(0.42 + R() * 0.3, e - zz); for (xx = a - R() * 0.5; xx < b - 0.15; xx += dx) { dx = 0.38 + R() * 0.55; var v = 0.75 + R() * 0.5; rsPaint([0.06 * v, 0.056 * v, 0.052 * v], 0.24 + R() * 0.3, 0, 0, 1); rsFlat(P, Math.max(a, xx) + 0.022, Math.min(b, xx + dx) - 0.022, zz + 0.022, zz + dz - 0.022, 0.05, 9); } zz += dz; }
    rsPaint('#8F8A82', 0.7);
    [[a, z, a, e], [a, e, b, e], [b, e, b, z]].forEach(function (s) { var n = Math.ceil(Math.hypot(s[2] - s[0], s[3] - s[1]) / 1.2); for (i = 0; i < n; i++) { var p = [s[0] + (s[2] - s[0]) * i / n, 0, s[1] + (s[3] - s[1]) * i / n], q = [s[0] + (s[2] - s[0]) * (i + 1) / n, 0, s[1] + (s[3] - s[1]) * (i + 1) / n]; p[1] = rsGy(p[0], p[2]) + 0.06; q[1] = rsGy(q[0], q[2]) + 0.06; rsBeam(P, p, q, 0.2, 0.14); } });
    [[a - 0.55, z + 0.9, a - 0.55, e + 0.3], [b + 0.55, z + 0.9, b + 0.55, e + 0.3], [a - 0.3, e + 0.55, x - 1.7, e + 0.55], [x + 1.7, e + 0.55, b + 0.3, e + 0.55]].forEach(function (s, q) { rsBead(A.snow, [s[0], rsGy(s[0], s[1]) - 0.06, s[1]], [s[2], rsGy(s[2], s[3]) - 0.06, s[3]], 0.95, 0.3 + 0.08 * q, k + q); });
    rsPaint('#A29C92', 0.55, 0, 0, 1); rsBox(P, x, rsGy(x, z + 0.3) + 0.06, z + 0.3, 1.45, 0.08, 0.3);
    // the canopy
    var cz = z + 2.7, w = 2.45, yw = 3.22, yl = 2.98, n = k % 6;
    rsBeam(A.wood, [x, yw, z + 0.02], [x, yl, cz + 0.3], 2 * w + 0.3, 0.18);
    rsOBox(A.wood, [x, yl - 0.2, cz + 0.33], [w + 0.15, 0, 0], [0, 0.25, 0], [0, 0, 0.05]); rsBox(A.wood, x, yl - 0.32, cz, w, 0.12, 0.13);
    [-1, 1].forEach(function (s) { var px = x + s * (w - 0.12), g = rsGy(px, cz); rsBox(A.wood, px, (g + yl - 0.42) / 2, cz, 0.11, (yl - 0.42 - g) / 2, 0.11); rsPaint('#8F8A82', 0.7); rsBox(P, px, g + 0.12, cz, 0.18, 0.2, 0.18); rsBeam(A.wood, [px, yl - 1.05, cz], [px, yl - 0.42, cz - 0.7], 0.09, 0.12); rsRing(px, cz, 0.22); });
    rsPillow(A.snow, x - w - 0.15, x + w + 0.15, z + 0.1, cz + 0.36, function (px, pz) { return yw + (yl - yw) * (pz - z) / (cz + 0.3 - z) + 0.09; }, 0.32, null, k, 0.1, 0.24);
    rsIcicles([x - w, cz + 0.38], [x + w, cz + 0.38], yl - 0.44, 0.7, k * 3 + 1);
    rsPaint(RS_LED, 0.3, 0, 4); [[-1.3, 0.8], [1.3, 0.8], [-1.3, 1.9], [1.3, 1.9]].forEach(function (q) { rsCyl(P, x + q[0], yw + (yl - yw) * q[1] / 2.98 - 0.12, z + q[1], 0.07, 0.07, 0.02, 8); });
    rsLight(x, 2.7, z + 1.4, RS_LAMP, 6, 8, 0, -1, 0, 0, 6.5);
    rsPlate(x, yl - 0.2, cz + 0.4, 1.84, 0.46, 0, [(n % 2) * 0.5, 0.625 - (n >> 1) * 0.125, (n % 2) * 0.5 + 0.5, 0.75 - (n >> 1) * 0.125]);
    rsLight(x, yl + 0.35, cz + 1.0, RS_LAMP, 2.2, 3, 0, -1, -1);
    rsLantern(x - 1.75, 2.35, z + 0.22, 0, 1); rsLantern(x + 1.75, 2.35, z + 0.22, 0, 1);
    [-1, 1].forEach(function (s) {
      var px = x + s * 3.15, pz = z + 0.8, g = rsGy(px, pz), fh = 2.2 + R() * 0.5, wp = rsW(px, pz);
      rsPaint('#202226', 0.45, 0.7); rsBox(P, px, g + 0.36, pz, 0.38, 0.38, 0.38); rsPaint('#131417', 0.4, 0.75); rsBox(P, px, g + 0.75, pz, 0.42, 0.03, 0.42);
      rsPillow(A.snow, px - 0.36, px + 0.36, pz - 0.36, pz + 0.36, function () { return g + 0.76; }, 0.06, null, s + k);
      RS.fir.push([wp[0], RF.y + g + 0.74, wp[1], fh, R() * TAU]); rsRing(px, pz, 0.55);
      if (!RS.tree) { rsPaint('#15241B', 0.85); for (i = 0; i < 6; i++) rsLathe(P, px, g + 0.85 + i * fh * 0.14, pz, [[0.04, -0.08], [0.5 * fh * 0.2 * (1 - i / 7), 0.02], [0.02, fh * 0.2]], 9); }
      rsPaint(RS_LED, 0.3, 0, 9); for (i = 0; i < 26; i++) { var t = i / 26, an = t * TAU * 4.5 + s, rr = 0.17 * fh * (1 - t) + 0.05; rsBox(P, px + Math.cos(an) * rr, g + 0.74 + fh * (0.1 + 0.84 * t), pz + Math.sin(an) * rr, 0.022, 0.022, 0.022); }
      rsLight(px, g + 1.6, pz, RS_LED, 0.6, 3);
    });
  }
  // a gable roof in the current frame, its ridge along z: two slabs from the ridge out past walls at +-hw (eaves
  // at e), rafters under the overhangs, icicles from iz on, a cornice of snow over it
  function rsRoof(hw, e, tp, oS, z0, z1, rT, T, seed, ice, iz) {
    var A = RS.A, xe = hw + oS, ridge = e + hw * tp, ye = e - oS * tp, nl = Math.sqrt(tp * tp + 1);
    [1, -1].forEach(function (sx) {
      var ex = [sx * xe / 2, (ye - ridge) / 2, 0], ey = [sx * tp / nl * rT / 2, 1 / nl * rT / 2, 0];
      rsOBox(A.wood, [sx * xe / 2 + ey[0], (ridge + ye) / 2 + ey[1], (z1 + z0) / 2], ex, ey, [0, 0, sx * (z1 - z0) / 2]);
      for (var z = Math.max(z0, iz) + 0.4; z < z1 - 0.3; z += 0.92) rsBeam(A.wood, [sx * (hw - 0.3), e + 0.3 * tp - 0.11, z], [sx * (xe - 0.06), e - (oS - 0.06) * tp - 0.11, z], 0.13, 0.2);
      if (ice) rsIcicles([sx * (xe + 0.03), Math.max(z0, iz) + 0.1], [sx * (xe + 0.03), z1 - 0.1], ye - 0.02, ice, seed * 7 + sx);
    });
    rsPillow(A.snow, -xe, xe, z0, z1, function (x) { return e + (hw - Math.abs(x)) * tp + rT; }, T, [0], seed * 3.7, Math.min(0.34, hw * 0.15), 0.16);
  }
  // a dormer on a roof sloping down toward +z (pitch mtp): front wall at z 0 from y 0 (the roof's top)
  function rsDormer(w, mtp, seed) {
    var A = RS.A, hw = w / 2, e = 1.95, tpd = Math.tan(40 * PI / 180), back = (e + hw * tpd) / mtp + 0.4, cb = e / mtp + 0.3;
    rsWallFace(A.wood, [-hw, 0], [1, 0], w, -0.5, e, [[0.34, w - 0.34, 0.74, 1.66]], 0.6);
    rsOpen([-hw, 0], [1, 0], 0.34, w - 0.34, 0.74, 1.66, 0.14, A.wood, 0, 0.75, rng(seed)());
    rsGable(A.wood, [-hw, 0], [1, 0], w, e, hw * tpd, null);
    rsWallFace(A.wood, [hw, 0], [0, -1], cb, -0.5, e, [], 1.2); rsWallFace(A.wood, [-hw, -cb], [0, 1], cb, -0.5, e, [], 1.2);
    rsRoof(hw, e, tpd, 0.35, -back, 0.55, 0.18, 0.3, seed, 0.5, -1.2);
  }
  // a balcony from x0 to x1, out from the wall at z0 to z1, its floor at yf: slab, carved consoles, rails, snow
  function rsBalcony(x0, x1, z0, z1, yf, seed, open) {
    if (x1 - x0 < 1.2) return;
    var A = RS.A, R = rng(seed * 31 + 7), zr = z1 - 0.07, x, dp = z1 - z0;
    rsBox(A.wood, (x0 + x1) / 2, yf - 0.1, (z0 + z1) / 2, (x1 - x0) / 2, 0.1, dp / 2);
    for (x = x0 + 0.3; x <= x1 - 0.29; x += (x1 - x0 - 0.6) / Math.max(1, Math.round((x1 - x0 - 0.6) / 1.7))) { rsBox(A.wood, x, yf - 0.32, z0 + dp * 0.47, 0.09, 0.12, dp * 0.47); rsBox(A.wood, x, yf - 0.6, z0 + dp * 0.27, 0.09, 0.16, dp * 0.27); }
    var posts = Math.max(1, Math.round((x1 - x0) / 2.3));
    for (var p = 0; p <= posts; p++) rsBox(A.wood, x0 + 0.06 + (x1 - x0 - 0.12) * p / posts, yf + 0.55, zr, 0.065, 0.55, 0.065);
    [[x0, zr, x1, zr], [x0 + 0.06, z0, x0 + 0.06, zr], [x1 - 0.06, z0, x1 - 0.06, zr]].forEach(function (s, q) {
      rsBeam(A.wood, [s[0], yf + 1.03, s[1]], [s[2], yf + 1.03, s[3]], 0.15, 0.09); rsBeam(A.wood, [s[0], yf + 0.12, s[1]], [s[2], yf + 0.12, s[3]], 0.1, 0.07);
      var L = Math.hypot(s[2] - s[0], s[3] - s[1]); if (!open) rsQuad(A.rail, [s[0], yf + 0.15, s[1]], [s[2], yf + 0.15, s[3]], [s[2], yf + 0.99, s[3]], [s[0], yf + 0.99, s[1]], [0, 0.75, L / 1.4, 1]);
      rsBead(A.snow, [s[0], yf + 1.075, s[1]], [s[2], yf + 1.075, s[3]], 0.17, 0.09 + R() * 0.06, seed * 3 + q);
    });
    rsIcicles([x0 + 0.2, z1 + 0.01], [x1 - 0.2, z1 + 0.01], yf - 0.2, 0.4, seed);
  }
  // a cedar hot tub on a terrace: steel bands, turquoise water lit from below, steam
  function rsTub(x, y, z) {
    var P = RS.A.props; rsPaint('#3A3A3C', 0.7, 0, 0, 1); rsBox(P, x, y - 0.15, z, 1.3, 0.15, 1.3); rsPaint('#5A3A26', 0.75, 0, 0, 1); rsCyl(P, x, y, z, 1.1, 1.12, 0.92, 22); rsLathe(P, x, y + 0.79, z, [[0.98, 0.13], [0.98, 0]], 22); rsCyl(P, x, y + 0.92, z, 1.12, 0.98, 0.001, 22);
    rsPaint('#16171A', 0.4, 0.8, 0, 1); [0.18, 0.66].forEach(function (h) { rsCyl(P, x, y + h, z, 1.125, 1.125, 0.05, 22); });
    rsPaint([0.06, 0.6, 0.66], 0.04, 0, 1.8, 1); rsCyl(P, x, y + 0.8, z, 0.98, 0.98, 0.001, 22, true);
    rsLight(x, y + 1.3, z, [0.3, 0.85, 1.0], 6, 8, 0, 0, 0, 2.6);
    var w = rsW(x, z); RS.smoke.push([w[0] - 0.3, RF.y + y + 0.95, w[1], 1], [w[0] + 0.35, RF.y + y + 0.95, w[1] + 0.2, 1]);
  }
  // snow banked against a wall's foot, broken where a door opens
  function rsDrift(o, t, L, gaps, seed) {
    var A = RS.A.snow, K = RC, n = [-t[1], t[0]], S = [-0.06, 0.12, 0.3, 0.55, 0.8, 1], b = A.n, N = Math.ceil(L / 0.55), Wd = 0.9 + (seed % 3) * 0.25, i, k; RC = RS_W1;
    for (i = 0; i <= N; i++) {
      var u = L * i / N, g = Math.min(1, u / 0.6, (L - u) / 0.6);
      gaps.forEach(function (gp) { g = Math.min(g, Math.max(0, Math.abs(u - (gp[0] + gp[1]) / 2) - (gp[1] - gp[0]) / 2) / 0.7); });
      var hd = (0.32 + 0.28 * rsNz(u * 0.45 + seed)) * g, wd = Wd * (0.8 + 0.3 * rsNz(u * 0.3 + seed * 2));
      for (k = 0; k < 6; k++) { var s = S[k] * wd, x = o[0] + t[0] * u + n[0] * s, z = o[1] + t[1] * u + n[1] * s; rsV(A, x, rsGy(x, z) + hd * Math.pow(Math.max(0, 1 - Math.max(0, S[k])), 1.6) - 0.04, z); }
    }
    for (i = 0; i < N; i++) for (k = 0; k < 5; k++) { var q = b + i * 6 + k; A.i.push(q, q + 1, q + 7, q, q + 7, q + 6); }
    RC = K;
  }

  /* -- the club behind the stage: stone plinth, timber, a great glass gable --- */
  function rsClub() {
    var A = RS.A, C = SITE.club, W = C.w, D = C.d, hw = W / 2, hd = D / 2, gy = SITE.terrace.y + 0.4, eave = 8.6, tp = Math.tan(22 * PI / 180), rT = 0.4, i;
    rsFrame(C.x, gy, C.z, PI);   // its front (local +z) faces the stage, south
    function yb(x) { return eave + (hw - Math.abs(x)) * tp; }
    var ridge = yb(0), oF = 3.2, oS = 1.5, zf = hd + oF, zb = -hd - 1.2;
    rsWallFace(A.stone, [-hw, hd], [1, 0], W, -1, 0.9, [], 1.2);
    // the glass: one interior across the whole front, rectangle and gable triangle, its room 15 m deep
    RQ = [0.5, W, ridge - 0.9, 1]; var g0 = A.glass.n, P = function (x, y) { rsV(A.glass, x, y, hd - 0.25, (x + hw) / W, (y - 0.9) / (ridge - 0.9)); };
    P(-hw, 0.9); P(hw, 0.9); P(hw, eave); P(-hw, eave); P(0, ridge); A.glass.i.push(g0, g0 + 1, g0 + 2, g0, g0 + 2, g0 + 3, g0 + 3, g0 + 2, g0 + 4);
    for (i = 0; i <= 12; i++) { var x = -hw + 0.18 + (W - 0.36) * i / 12, top = yb(x) - 0.05; rsBox(A.wood, x, (0.9 + top) / 2, hd - 0.1, 0.17, (top - 0.9) / 2, 0.17); }
    rsBox(A.wood, 0, eave - 0.05, hd - 0.05, hw, 0.28, 0.22); rsBox(A.wood, 0, 4.5, hd - 0.12, hw, 0.12, 0.14); rsBox(A.wood, 0, (eave + ridge) / 2, hd - 0.05, 0.22, (ridge - eave) / 2, 0.2);
    rsPaint('#1B1D21', 0.4, 0.8); for (i = 0; i < 12; i++) rsBox(A.props, -hw + 0.18 + (W - 0.36) * (i + 0.5) / 12, 2.7, hd - 0.18, (W - 0.36) / 24 - 0.17, 0.03, 0.05);
    [-1, 1].forEach(function (sx) { rsBeam(A.wood, [sx * 0.2, eave + 0.25, hd - 0.02], [sx * hw * 0.55, yb(hw * 0.55) - 0.25, hd - 0.02], 0.2, 0.2); });
    [[[hw, hd], [0, -1], D], [[hw, -hd], [-1, 0], W], [[-hw, -hd], [0, 1], D]].forEach(function (fc, q) {
      var hs = [], ws = [], n = q === 1 ? 5 : 3, s = fc[2] / n;
      for (i = 0; i < n; i++) { var u = (i + 0.5) * s; (q === 1 ? hs : ws).push([u - 0.7, u + 0.7, q === 1 ? 0.8 : 1.8, q === 1 ? 2.6 : 7.2]); }
      rsWallFace(A.stone, fc[0], fc[1], fc[2], -1, 2.4, hs, 0.9);
      rsWallFace(A.wood, fc[0], fc[1], fc[2], 2.4, eave, ws.map(function (w) { return [w[0], w[1], 2.4, w[3]]; }), 1.0);
      if (q === 1) hs.forEach(function (w, m) { rsOpen(fc[0], fc[1], w[0], w[1], w[2], w[3], 0.36, A.stone, 0, 0.8, 0.3 + m * 0.1); }); else ws.forEach(function (w, m) { rsOpen(fc[0], fc[1], w[0], w[1], 2.4, w[3], 0.22, A.wood, 1, 0, 0.2 + m * 0.2); });
      if (q === 1) rsGable(A.wood, fc[0], fc[1], fc[2], eave, ridge - eave, null);
    });
    rsRoof(hw, eave, tp, oS, zb, zf, rT, 0.62, 11, 1.2, zb);
    [1, -1].forEach(function (sx) {
      [0.05, hw * 0.33, hw * 0.66, hw - 0.4].forEach(function (px) { var x = sx * px; rsBox(A.wood, x, yb(x) - 0.2, (hd - 0.4 + zf) / 2, 0.16, 0.2, (zf - hd + 0.4) / 2); });
      [hw * 0.33, hw * 0.75].forEach(function (px) { var x = sx * px; rsPaint(RS_LED, 0.3, 0, 3.5); rsCyl(A.props, x, yb(x) - 0.43, hd + oF * 0.55, 0.1, 0.1, 0.03, 8); rsLight(x, yb(x) - 0.6, hd + oF * 0.55, RS_LED, 2.6, 8, 0, -1, 0); });
    });
    var cx = -hw * 0.62, top = yb(cx) + rT + 1.9; rsBox(A.stone, cx, (yb(cx) - 0.6 + top) / 2, -2, 0.6, (top - yb(cx) + 0.6) / 2, 0.6);
    rsBox(A.wood, cx, top + 0.45, -2, 0.85, 0.07, 0.85); RS_Q4.forEach(function (q) { rsBox(A.stone, cx + q[0] * 0.48, top + 0.2, -2 + q[1] * 0.48, 0.09, 0.2, 0.09); });
    rsPillow(A.snow, cx - 0.9, cx + 0.9, -2.9, -1.1, function () { return top + 0.52; }, 0.25, null, 4); var wc = rsW(cx, -2); RS.smoke.push([wc[0], gy + top + 0.25, wc[1]]);
    rsDrift([hw, hd], [0, -1], D, [], 41); rsDrift([hw, -hd], [-1, 0], W, [], 42); rsDrift([-hw, -hd], [0, 1], D, [], 43);
    for (i = 0; i < 4; i++) rsLight(-hw + 4 + i * (W - 8) / 3, 4.5, hd + 1.2, [1.0, 0.3, 0.75], 1.4, 7, 0, 0, 1);
    RS.solids.push({ min: { x: C.x - hw - 0.3, y: gy - 2, z: C.z - hd - 0.2 }, max: { x: C.x + hw + 0.3, y: gy + ridge + 1, z: C.z + hd + 0.3 } });
    RS.env.push([[C.x, C.z - hd - 1], gy + 6, W, 12, 1]);
  }

  /* -- the stone balustrade over the valley: stacked-stone piers, dressed balusters, lamps -- */
  function rsBalustrade() {
    var A = RS.A, B = SITE.balustrade, z = B.z, x0 = B.x[0], x1 = B.x[1], P = SITE.path, i, j;
    for (i = 0; i < P.length - 1; i++) if ((P[i][1] - z) * (P[i + 1][1] - z) <= 0) { var t = (z - P[i][1]) / (P[i + 1][1] - P[i][1]), px = P[i][0] + (P[i + 1][0] - P[i][0]) * t; if (px < x0 + 6 && px > x0 - 6) x0 = px + 5.6; }
    RS.balX0 = x0; rsFrame(0, 0, 0, 0);
    var n = Math.round((x1 - x0) / 4.6), seg = (x1 - x0) / n;
    for (i = 0; i <= n; i++) {
      var x = x0 + seg * i, g = H(x, z);
      rsBox(A.stone, x, g + 0.3, z, 0.34, 1.0, 0.34); rsPaint('#A8A194', 0.75); rsBox(A.props, x, g + 1.36, z, 0.4, 0.07, 0.4);
      rsPillow(A.snow, x - 0.42, x + 0.42, z - 0.42, z + 0.42, (function (gg) { return function () { return gg + 1.43; }; })(g), 0.17, null, i);
      if (i % 3 === 0) rsLampPost(x, g + 1.44, z, 2.0);
      RS.solids.push({ x: x, z: z, r: 0.45 });
      if (i === n) break;
      var xa = x + 0.34, xb = x + seg - 0.34, gb = H(x + seg, z), m = Math.round((xb - xa) / 0.31);
      rsBeam(A.stone, [xa, g + 0.12, z], [xb, gb + 0.12, z], 0.46, 0.3); rsPaint('#A8A194', 0.75); rsBeam(A.props, [xa, g + 1.05, z], [xb, gb + 1.05, z], 0.5, 0.16); rsBeam(A.props, [xa, g + 0.31, z], [xb, gb + 0.31, z], 0.36, 0.08);
      rsBead(A.snow, [xa, g + 1.13, z], [xb, gb + 1.13, z], 0.48, 0.12 + 0.06 * Math.abs(rsNz(i)), i * 7);
      rsPaint('#B4AD9F', 0.72); for (j = 0; j < m; j++) { var u = (j + 0.5) / m, bx = xa + (xb - xa) * u; rsLathe(A.props, bx, g + (gb - g) * u + 0.35, z, [[0.075, 0], [0.055, 0.06], [0.1, 0.26], [0.11, 0.34], [0.06, 0.54], [0.05, 0.6], [0.08, 0.62]], 8); }
      for (var xx = xa; xx < xb; xx += 6) RS.solids.push({ min: { x: xx, y: Math.min(g, gb) - 0.6, z: z - 0.3 }, max: { x: Math.min(xb, xx + 6), y: Math.max(g, gb) + 1.3, z: z + 0.3 } });
    }
  }

  /* -- fences: they close the play area between the chalets, round the lift, across the piste's foot -- */
  function rsFence(pts) {
    var A = RS.A, i, k; rsFrame(0, 0, 0, 0);
    for (i = 0; i < pts.length - 1; i++) {
      var a = pts[i], b = pts[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], n = Math.max(1, Math.round(Math.hypot(dx, dz) / 2.6)), prev = null;
      for (k = 0; k <= n; k++) {
        var x = a[0] + dx * k / n, z = a[1] + dz * k / n, g = H(x, z);
        rsBox(A.wood, x, g + 0.55, z, 0.075, 0.75, 0.075); rsPillow(A.snow, x - 0.1, x + 0.1, z - 0.1, z + 0.1, (function (gg) { return function () { return gg + 1.3; }; })(g), 0.07, null, k);
        if (prev) {
          [0.45, 0.95].forEach(function (h, q) { rsBeam(A.wood, [prev[0], prev[2] + h, prev[1]], [x, g + h, z], 0.07, 0.11); if (q) rsBead(A.snow, [prev[0], prev[2] + h + 0.055, prev[1]], [x, g + h + 0.055, z], 0.09, 0.06, k + i * 9); });
          if (Math.abs(dx) < 0.01 || Math.abs(dz) < 0.01) RS.solids.push({ min: { x: Math.min(prev[0], x) - 0.2, y: Math.min(prev[2], g) - 0.6, z: Math.min(prev[1], z) - 0.2 }, max: { x: Math.max(prev[0], x) + 0.2, y: Math.max(prev[2], g) + 1.3, z: Math.max(prev[1], z) + 0.2 } });
          else { RS.solids.push({ x: (prev[0] + x) / 2, z: (prev[1] + z) / 2, r: 0.75 }); RS.solids.push({ x: x, z: z, r: 0.5 }); if (k === 1) RS.solids.push({ x: prev[0], z: prev[1], r: 0.5 }); }
        }
        prev = [x, z, g];
      }
    }
  }
  // a chalet's corner in the world (local x side sx, front sz 1 / back -1), or its wing's outer front corner
  function rsCorner(k, sx, sz) {
    var c = SITE.chalets[k], hw = c[2] / 2, hd = c[3] / 2, a = c[5] * PI / 180, w = RS_STY[k][2] === sx, x = sx * (hw + (w ? 6.65 : 0.15)), z = w ? hd - 1.3 : sz * (hd + 0.1);
    return [c[0] + x * Math.cos(a) + z * Math.sin(a), c[1] - x * Math.sin(a) + z * Math.cos(a)];
  }
  function rsFences() {
    var P = SITE.path, bz = SITE.balustrade.z, zg = SITE.bounds.z[0] + 0.7, gx0 = P[0][0] - 3.3, gx1 = P[0][0] + 3.3, w = [[RS.balX0 - 0.4, bz]], i;
    // the path's valley side from the balustrade's end down to the gate; its other side up to the corner chalet
    for (i = 3; i > 1; i--) { var a = P[i - 1], b = P[i], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz); if (i === 3) w.push([b[0] + dz / l * 3.6, b[1] - dx / l * 3.6]); w.push([a[0] + dz / l * 3.6, a[1] - dx / l * 3.6]); }
    w = w.filter(function (p, q) { return !q || p[1] < bz - 1; }); w.push([gx1, zg]); rsFence(w);
    var n0 = [P[0][1] - P[1][1], P[1][0] - P[0][0]], n1 = [P[1][1] - P[2][1], P[2][0] - P[1][0]], l0 = Math.hypot(n0[0], n0[1]), l1 = Math.hypot(n1[0], n1[1]), nx = n0[0] / l0 + n1[0] / l1, nz = n0[1] / l0 + n1[1] / l1, nl = Math.hypot(nx, nz);
    rsFence([[gx0, zg], [P[1][0] + nx / nl * 4.6, P[1][1] + nz / nl * 4.6], rsCorner(3, 1, 1)]);
    rsGate(gx0, gx1, zg);
    [[0, 1, 1, 1, -1, 1], [1, 1, 1, 2, -1, 1], [2, 1, -1, 3, -1, 1], [0, -1, 1, 8, 1, 1], [8, -1, 1, 9, 1, 1], [7, -1, 1, 4, 1, 1], [4, -1, 1, 5, 1, 1], [5, -1, 1, 6, 1, 1]].forEach(function (q) { rsFence([rsCorner(q[0], q[1], q[2]), rsCorner(q[3], q[4], q[5])]); });
    var S = RS.stA; rsFence([rsCorner(9, -1, 1), [S[0] - 0.1, S[3] + 0.1]]); rsFence([[S[2] + 0.1, S[1] - 0.1], rsCorner(7, 1, 1)]);
    rsFence([rsCorner(6, -1, -1), [SITE.balustrade.x[1] + 0.4, bz]]);
    // the piste is closed at night: signs on its fence
    var c8 = rsCorner(8, -1, 1), c9 = rsCorner(9, 1, 1); rsFrame(0, 0, 0, 0);
    [0.3, 0.7].forEach(function (t) { var x = c8[0] + (c9[0] - c8[0]) * t, z = c8[1] + (c9[1] - c8[1]) * t - 0.1; rsPlate(x, H(x, z) + 0.72, z, 1.3, 0.33, PI, [0, 0.125, 0.5, 0.25]); });
  }
  // a closed timber gate where the path leaves the bounds: stone posts with lanterns, braced leaves, a sign
  function rsGate(x0, x1, z) {
    var A = RS.A, m = (x0 + x1) / 2, g = H(m, z); rsFrame(0, 0, 0, 0);
    [x0, x1].forEach(function (x) { var gp = H(x, z); rsBox(A.stone, x, gp + 0.55, z, 0.32, 1.25, 0.32); rsPaint('#A8A194', 0.75); rsBox(A.props, x, gp + 1.84, z, 0.38, 0.05, 0.38); rsPillow(A.snow, x - 0.38, x + 0.38, z - 0.38, z + 0.38, function () { return gp + 1.89; }, 0.16, null, x); rsLantern(x, gp + 1.45, z + 0.55, 0, 1); });
    [[x0 + 0.34, m - 0.03], [m + 0.03, x1 - 0.34]].forEach(function (l, q) {
      for (var x = l[0] + 0.07; x < l[1] - 0.05; x += 0.2) rsBox(A.wood, x, g + 0.78, z, 0.075, 0.62 + 0.05 * Math.sin(x * 3), 0.03);
      [0.35, 1.2].forEach(function (y) { rsBox(A.wood, (l[0] + l[1]) / 2, g + y, z + 0.05, (l[1] - l[0]) / 2, 0.06, 0.03); rsBead(A.snow, [l[0], g + y + 0.065, z + 0.05], [l[1], g + y + 0.065, z + 0.05], 0.09, 0.05, q + y); });
      rsBeam(A.wood, [q ? l[1] : l[0], g + 0.4, z + 0.07], [q ? l[0] : l[1], g + 1.15, z + 0.07], 0.1, 0.05);
    });
    rsPlate(m, g + 0.78, z + 0.1, 1.0, 0.25, 0, [0.5, 0.125, 1, 0.25]);
    RS.solids.push({ min: { x: x0 - 0.35, y: g - 0.6, z: z - 0.3 }, max: { x: x1 + 0.35, y: g + 1.6, z: z + 0.3 } });
  }

  /* -- the chairlift: towers, cables, a detachable terminal, chairs going round -- */
  function rsLift() {
    var A = RS.A, a = SITE.lift.a, b = SITE.lift.b, dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L, px = -uz, pz = ux, r = 2.6, i;
    var sup = [[0, H(a[0], a[1]) + 3.4]], n = Math.floor((L - 40) / 36);
    for (i = 1; i <= n; i++) { var s = 26 + (L - 52) * (i - 1) / (n - 1 || 1), g = H(a[0] + ux * s, a[1] + uz * s); sup.push([s, g + 9.5 + (i % 3) * 1.5, g]); }
    sup.push([L, H(b[0], b[1]) + 3.4]);
    function cy(s) { for (var j = 0; j < sup.length - 1; j++) if (s <= sup[j + 1][0]) { var u = (s - sup[j][0]) / (sup[j + 1][0] - sup[j][0]); return sup[j][1] + (sup[j + 1][1] - sup[j][1]) * u - 0.022 * (sup[j + 1][0] - sup[j][0]) * 4 * u * (1 - u); } return sup[sup.length - 1][1]; }
    RS.lift = { a: a, L: L, ux: ux, uz: uz, px: px, pz: pz, r: r, cy: cy };
    rsFrame(0, 0, 0, 0); var P = A.props;
    for (i = 1; i < sup.length - 1; i++) {
      var s2 = sup[i][0], x = a[0] + ux * s2, z = a[1] + uz * s2, g2 = sup[i][2], top = sup[i][1];
      rsPaint('#5D646C', 0.45, 0.75); rsCyl(P, x, g2 - 0.5, z, 0.42, 0.3, top - g2 + 0.3, 10); rsBox(P, x, g2 + 0.1, z, 0.7, 0.6, 0.7);
      rsBeam(P, [x - px * (r + 0.6), top + 0.3, z - pz * (r + 0.6)], [x + px * (r + 0.6), top + 0.3, z + pz * (r + 0.6)], 0.32, 0.4);
      [-1, 1].forEach(function (sd) { rsBeam(P, [x + px * r * sd - ux * 1.2, top + 0.02, z + pz * r * sd - uz * 1.2], [x + px * r * sd + ux * 1.2, top + 0.02, z + pz * r * sd + uz * 1.2], 0.18, 0.22); });
      rsPaint('#FFD9A0', 0.3, 0, 2.5); rsBox(P, x - px * (r + 0.7), top + 0.32, z - pz * (r + 0.7), 0.07, 0.07, 0.07);
    }
    rsPaint('#1E2024', 0.5, 0.8);
    [-1, 1].forEach(function (sd) { var prev = null; for (var s3 = 0; s3 <= L + 0.01; s3 += 6) { var q = [a[0] + ux * s3 + px * r * sd, cy(s3), a[1] + uz * s3 + pz * r * sd]; if (prev) rsBeam(A.thin, prev, q, 0.07, 0.07); prev = q; } });
    var yaw = Math.atan2(ux, uz); rsFrame(a[0], H(a[0], a[1]), a[1], yaw); rsStation(P, A, r, 1);
    var c = [rsW(-11.4, -6.6), rsW(4.0, -6.6), rsW(4.0, 9.0), rsW(-11.4, 9.0)];
    RS.stA = [Math.min(c[0][0], c[1][0], c[2][0], c[3][0]), Math.min(c[0][1], c[1][1], c[2][1], c[3][1]), Math.max(c[0][0], c[1][0], c[2][0], c[3][0]), Math.max(c[0][1], c[1][1], c[2][1], c[3][1])];
    RS.solids.push({ min: { x: RS.stA[0], y: RF.y - 2, z: RS.stA[1] }, max: { x: RS.stA[2], y: RF.y + 7, z: RS.stA[3] } });
    rsFrame(b[0], H(b[0], b[1]), b[1], yaw + PI); rsStation(P, A, r, 0);
  }
  // a stadium in plan (round end about the origin at z < 0, straight on to Lz), walls y0..y1, lids (1 top, 2 under)
  function rsStad(A, R, Lz, y0, y1, lids) {
    var p = [], i; for (i = 0; i <= 14; i++) { var t = PI + PI * i / 14; p.push([Math.cos(t) * R, Math.sin(t) * R]); } p.push([R, Lz], [-R, Lz], [-R, 0]);
    for (i = 0; i < p.length - 1; i++) {
      var a = p[i], b = p[i + 1], mz = (a[1] + b[1]) / 2;
      rsQuadN(A, [a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]], (a[0] + b[0]) / 2, 0, mz > Lz - 0.01 ? 1 : Math.min(mz, 0));
      if (lids & 1) rsQuadN(A, [0, y1, Lz * 0.45], [a[0], y1, a[1]], [b[0], y1, b[1]], [b[0], y1, b[1]], 0, 1, 0);
      if (lids & 2) rsQuadN(A, [0, y0, Lz * 0.45], [a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y0, b[1]], 0, -1, 0);
    }
  }
  // a detachable terminal in the current frame (+z up the line, the uphill lane at x -r): a steel housing round the
  // bullwheel on two columns, lit underneath; at the bottom also the loading lane and gates, the queue's maze under a
  // timber canopy with downlights and the lift's name, the operator's cabin
  function rsStation(P, A, r, bottom) {
    var R0 = r + 1.0, Lz = 8.5, y0 = 3.8, y1 = 4.95, i;
    rsPaint('#3B4048', 0.45, 0.7); [0, 6.4].forEach(function (z) { rsCyl(P, 0, -0.3, z, 0.5, 0.42, y0 + 0.3, 12); rsBox(P, 0, 0.25, z, 0.85, 0.3, 0.85); });
    rsPaint('#C5CCD4', 0.32, 0.65); rsStad(P, R0, Lz, y0 + 0.2, y1, 1); rsPaint('#B3241C', 0.4, 0.3); rsStad(P, R0 + 0.02, Lz + 0.02, y0, y0 + 0.2, 0); rsPaint('#202429', 0.6, 0.5); rsStad(P, R0, Lz, y0, y0, 2);
    rsPaint('#D89A16', 0.45, 0.5); rsCyl(P, 0, 3.22, 0, r + 0.05, r + 0.05, 0.3, 28); rsLathe(P, 0, 3.22, 0, [[r - 0.1, 0.3], [r - 0.1, 0]], 28);
    for (i = 0; i < 8; i++) { var an = i / 8 * TAU; rsBeam(P, [Math.cos(an) * 0.45, 3.37, Math.sin(an) * 0.45], [Math.cos(an) * (r - 0.1), 3.37, Math.sin(an) * (r - 0.1)], 0.14, 0.16); }
    rsPaint('#2E3238', 0.5, 0.7); rsCyl(P, 0, 3.1, 0, 0.5, 0.5, y0 - 3.1, 12, true);
    rsPaint(RS_LED, 0.3, 0, 5); [-r, r].forEach(function (x) { rsBox(P, x, y0 - 0.02, 3.6, 0.05, 0.02, 4.6); if (bottom) rsLight(x, y0 - 0.3, 3.6, RS_LED, 3.5, 8, 0, -1, 0, 0, 4); });
    rsLight(0, y0 - 0.2, 0, RS_LED, 3, 6, 0, -1, 0);
    rsPillow(A.snow, -R0 + 0.35, R0 - 0.35, -R0 + 1.0, Lz - 0.3, function () { return y1; }, 0.3, null, 21);
    if (!bottom) return;
    // the loading lane and its gates, the maze, the canopy over the queue, the sign, the cabin
    rsPaint('#1C1D20', 0.9, 0, 0, 1); rsBox(P, -r, 0.08, 2.6, 1.75, 0.1, 2.2);
    rsPaint('#9AA1A9', 0.4, 0.7); for (i = 0; i < 4; i++) { var gx = -r - 1.6 + i * 1.07; rsBox(P, gx, 0.5, 0.35, 0.05, 0.5, 0.05); if (i < 3) rsBox(P, gx + 0.52, 0.78, 0.35, 0.46, 0.03, 0.03); }
    rsPaint('#8C939B', 0.4, 0.75);
    for (var j = 0; j < 5; j++) { var x = -r - 1.9 - j * 1.3, za = j % 2 ? -5.2 : -3.8, zb = j % 2 ? 2.0 : 3.4; for (i = 0; i <= 4; i++) rsBox(P, x, 0.55, za + (zb - za) * i / 4, 0.035, 0.55, 0.035); [0.55, 1.05].forEach(function (y) { rsBox(P, x, y, (za + zb) / 2, 0.025, 0.025, (zb - za) / 2); }); }
    var xo = -r - 8.3, yi = 4.62, yo = 4.2;
    rsBeam(A.wood, [-R0 + 0.1, yi, -0.9], [xo - 0.2, yo, -0.9], 10.6, 0.2); rsBox(A.wood, xo, yo - 0.18, -0.9, 0.15, 0.13, 5.3);
    [-5.6, -0.9, 3.8].forEach(function (z) { rsBox(A.wood, xo, (yo - 0.3) / 2, z, 0.13, (yo - 0.3) / 2, 0.13); });
    rsPillow(A.snow, xo - 0.2, -R0 + 0.1, -6.2, 4.4, function (x) { return yo + 0.1 + (yi - yo) * (x - xo) / (-R0 - xo); }, 0.36, null, 7, 0.28, 0.16);
    rsIcicles([xo - 0.25, -6.0], [xo - 0.25, 4.2], yo - 0.1, 0.7, 77);
    rsPaint(RS_LED, 0.3, 0, 4); [[-5.6, -4], [-5.6, 1.5], [-8.6, -4], [-8.6, 1.5]].forEach(function (q) { rsCyl(P, q[0], yo + (yi - yo) * (q[0] - xo) / (-R0 - xo) - 0.14, q[1], 0.08, 0.08, 0.02, 8); });
    rsLight(-6.4, 3.4, -3.2, RS_LAMP, 6, 9, 0, -1, 0, 0, 6); rsLight(-6.4, 3.4, 2.0, RS_LAMP, 6, 9, 0, -1, 0, 0, 6);
    rsPlate(xo - 0.32, yo - 0.18, -0.9, 6.6, 0.82, -PI / 2, [0, 0.25, 1, 0.375]); rsLight(xo - 1.2, yo + 0.5, -0.9, RS_LED, 3, 4, 1, -1, 0);
    var cf = [[[-7.4, 8.0], [1, 0]], [[-4.2, 8.0], [0, -1]], [[-4.2, 4.8], [-1, 0]], [[-7.4, 4.8], [0, 1]]];
    cf.forEach(function (f, q) { rsWallFace(A.wood, f[0], f[1], 3.2, -0.3, 2.7, [[0.35, 2.85, 1.0, 2.3]], 0.8); rsOpen(f[0], f[1], 0.35, 2.85, 1.0, 2.3, 0.1, A.wood, 0, 0.9, 0.31 + q * 0.17); });
    rsBox(A.wood, -5.8, 2.82, 6.4, 1.95, 0.12, 1.95); rsPillow(A.snow, -7.75, -3.85, 4.45, 8.35, function () { return 2.94; }, 0.3, null, 3, 0.14, 0.14);
    rsIcicles([-7.8, 4.5], [-7.8, 8.3], 2.7, 0.5, 31); rsLantern(-4.0, 2.3, 4.6, 1, 0);
  }
  // a four-seat chair hanging from its grip: padded seats and backs, armrests, the safety bar down, footrests
  function rsChairGeo(T) {
    var A = rsAcc(); rsFrame(0, 0, 0, 0);
    rsPaint('#8A9098', 0.35, 0.8); rsBox(A, 0, -0.12, 0, 0.1, 0.12, 0.3); rsBeam(A, [0, -0.2, 0], [0, -1.35, -0.32], 0.09, 0.09); rsBeam(A, [0, -1.35, -0.32], [0, -1.62, -0.48], 0.09, 0.09);
    rsBeam(A, [-1.22, -1.62, -0.48], [1.22, -1.62, -0.48], 0.07, 0.07);
    [-1.22, 1.22].forEach(function (x) { rsBeam(A, [x, -1.62, -0.48], [x, -2.28, -0.22], 0.06, 0.06); rsBeam(A, [x, -2.28, -0.22], [x, -2.3, 0.42], 0.06, 0.06); rsBeam(A, [x, -1.9, -0.36], [x, -1.9, 0.62], 0.05, 0.05); });
    rsBeam(A, [-1.22, -1.9, 0.62], [1.22, -1.9, 0.62], 0.05, 0.05);
    [-0.62, 0.62].forEach(function (x) { rsBeam(A, [x, -1.9, 0.62], [x, -2.62, 0.66], 0.04, 0.04); rsBeam(A, [x - 0.35, -2.64, 0.66], [x + 0.35, -2.64, 0.66], 0.08, 0.025); });
    rsPaint('#1A2230', 0.65, 0.05); for (var i = 0; i < 4; i++) { var cx = -0.9 + i * 0.6; rsBox(A, cx, -2.25, 0.1, 0.27, 0.06, 0.3); rsOBox(A, [cx, -1.95, -0.33], [0.27, 0, 0], [0, 0.3, -0.12], [0, 0.03, 0.08]); }
    rsPaint(RS_LED, 0.3, 0, 6); rsBox(A, 0, -0.28, 0.28, 0.1, 0.035, 0.035);
    return rsGeom(T, A, 'props', 1);
  }

  /* -- floodlight masts and groomers on the piste --------------------------- */
  // the floodlit run (land's: a centre line and half width), or the site's piste as a straight one
  function rsRun() {
    if (typeof LAND !== 'undefined' && LAND.piste && LAND.piste.pts) return LAND.piste;
    var P = SITE.piste, cx = (P.x[0] + P.x[1]) / 2, m = [];
    for (var z = 75; z < 430; z += 50) m.push([P.x[0] - 4, z], [P.x[1] + 4, z]);
    return { pts: [cx, P.z[0], cx, P.z[1], cx, 430], w: (P.x[1] - P.x[0]) / 2, masts: m };
  }
  function rsRunAt(s) {   // centre and unit direction a distance s up the run
    var p = RS.run.pts;
    for (var k = 0; k + 3 < p.length; k += 2) { var dx = p[k + 2] - p[k], dz = p[k + 3] - p[k + 1], l = Math.hypot(dx, dz); if (s <= l || k + 5 >= p.length) return [p[k] + dx * s / l, p[k + 1] + dz * s / l, dx / l, dz / l]; s -= l; }
  }
  function rsMasts() {
    var A = RS.A, run = RS.run = rsRun();
    rsFrame(0, 0, 0, 0);
    run.masts.forEach(function (m) {
      var x = m[0], z = m[1], g = H(x, z), h = 18, top = g + h, best = 1e9, cx = x, cz = z, p = run.pts;
      for (var k = 0; k + 3 < p.length; k += 2) { var ax = p[k], az = p[k + 1], ux = p[k + 2] - ax, uz = p[k + 3] - az, t = clamp(((x - ax) * ux + (z - az) * uz) / (ux * ux + uz * uz), 0, 1), qx = ax + ux * t, qz = az + uz * t, d = Math.hypot(qx - x, qz - z); if (d < best) { best = d; cx = qx; cz = qz; } }
      var tx = x + (cx - x) * 0.62, tz = z + (cz - z) * 0.62 + 10, dx = tx - x, dz = tz - z, l = Math.hypot(dx, dz); dx /= l; dz /= l;
      rsPaint('#4A5058', 0.45, 0.75); rsCyl(A.props, x, g - 0.3, z, 0.34, 0.18, h + 0.3, 8); rsBox(A.props, x, g + 0.2, z, 0.55, 0.5, 0.55);
      rsBeam(A.props, [x - dz * 1.7, top, z + dx * 1.7], [x + dz * 1.7, top, z - dx * 1.7], 0.16, 0.16); rsBeam(A.props, [x - dz * 1.7, top + 1.1, z + dx * 1.7], [x + dz * 1.7, top + 1.1, z - dx * 1.7], 0.12, 0.12);
      for (var k2 = -1; k2 <= 1; k2 += 2) for (var m2 = 0; m2 < 2; m2++) {
        var lx = x + dz * 1.1 * k2 + dx * 0.25, lz = z - dx * 1.1 * k2 + dz * 0.25, ly = top + 0.3 + m2 * 0.62;
        rsPaint('#2A2D32', 0.5, 0.6); rsOBox(A.props, [lx, ly, lz], [dz * 0.34, 0, -dx * 0.34], [0, 0.25, 0], [dx * 0.15, 0, dz * 0.15]);
        rsPaint(RS_LED, 0.2, 0, 10); rsOBox(A.props, [lx + dx * 0.16, ly, lz + dz * 0.16], [dz * 0.29, 0, -dx * 0.29], [0, 0.2, 0], [dx * 0.02, 0, dz * 0.02]);
      }
      var gx = x + dx * l * 1.05, gz = z + dz * l * 1.05, gg = H(gx, gz), bl = Math.hypot(gx - x, gg - top, gz - z);
      RC = [0.07, 0.068, 0.062]; rsCone(A.beam, [x + dx * 0.3, top + 0.6, z + dz * 0.3], [gx, gg + 0.3, gz], 0.6, 13, 18);
      RS.halo.push([x + dx * 0.45, top + 0.6, z + dz * 0.45, 5, 4.7, 4.2, 4.5]);
      RS.pool.push([x, top + 0.6, z, 0.9, 0.95, 1.05, 30, (gx - x) / bl, (gg - top) / bl, (gz - z) / bl, 0.86]);
    });
  }
  // a piste groomer: tracks with grousers, a red body with a sloped hood and a white stripe, a glass cab glowing
  // faintly from its dash, the blade on its arms, the tiller and its comb, work lights and amber beacons on the roof;
  // its headlights' cones are a second mesh (the beam material)
  function rsGroomerGeo(T) {
    var A = rsAcc(), B = rsAcc(); rsFrame(0, 0, 0, 0);
    rsPaint('#141518', 0.85, 0.1); [-1.6, 1.6].forEach(function (x) { rsBox(A, x, 0.55, 0, 0.55, 0.52, 2.35); for (var z = -2.1; z < 2.3; z += 0.42) rsBox(A, x, 1.08, z, 0.57, 0.03, 0.07); rsBox(A, x * 0.98, 0.55, 0, 0.5, 0.3, 2.42); });
    rsPaint('#9E140E', 0.3, 0.3); rsBox(A, 0, 1.4, -0.55, 1.12, 0.55, 1.95); rsBeam(A, [0, 1.95, 1.0], [0, 1.6, 2.5], 2.1, 0.75);
    rsPaint('#E8E8E6', 0.4, 0.2); [-1.13, 1.13].forEach(function (x) { rsBox(A, x, 1.45, -0.55, 0.012, 0.07, 1.9); });
    rsPaint([0.05, 0.035, 0.02], 0.05, 0, 1.2); rsBox(A, 0, 2.6, 0.45, 0.98, 0.62, 0.95);
    rsPaint('#9E140E', 0.3, 0.3); RS_Q4.forEach(function (q) { rsBox(A, q[0] * 1.0, 2.6, 0.45 + q[1] * 0.97, 0.05, 0.64, 0.05); });
    rsPaint('#E8E8E6', 0.35, 0.2); rsBox(A, 0, 3.28, 0.4, 1.1, 0.06, 1.1);
    rsPaint('#C9CDD2', 0.3, 0.8); rsOBox(A, [0, 0.62, 3.25], [2.85, 0, 0], [0, 0.48, 0.1], [0, -0.02, 0.1]); rsOBox(A, [0, 1.2, 3.42], [2.85, 0, 0], [0, 0.14, 0.12], [0, -0.06, 0.1]);
    rsPaint('#2A2C30', 0.5, 0.7); [-1.0, 1.0].forEach(function (x) { rsBeam(A, [x, 1.0, 2.0], [x, 0.75, 3.1], 0.2, 0.2); });
    rsPaint('#202226', 0.6, 0.5); rsBox(A, 0, 0.62, -3.15, 2.6, 0.42, 0.62); rsPaint('#0B0B0C', 0.9); rsOBox(A, [0, 0.25, -3.95], [2.6, 0, 0], [0, 0.3, -0.08], [0, 0.01, 0.03]);
    rsPaint([1, 1, 1], 0.2, 0, 7); [-0.75, 0.75].forEach(function (x) { rsBox(A, x, 1.72, 2.48, 0.2, 0.08, 0.03); }); [-0.75, -0.25, 0.25, 0.75].forEach(function (x) { rsBox(A, x, 3.42, 1.4, 0.16, 0.07, 0.06); });
    rsPaint([1, 0.42, 0.05], 0.3, 0, 6); rsBox(A, -0.85, 3.44, -0.4, 0.11, 0.11, 0.11); rsBox(A, 0.85, 3.44, -0.4, 0.11, 0.11, 0.11);
    RC = [0.5, 0.48, 0.44]; [-0.75, 0.75].forEach(function (x) { rsCone(B, [x, 1.72, 2.55], [x * 3, 0.0, 22], 0.15, 5, 12); });
    RC = [0.3, 0.29, 0.27]; rsCone(B, [0, 3.42, 1.5], [0, 0.0, 13], 0.3, 6.5, 12);
    return [rsGeom(T, A, 'props', 1), rsGeom(T, B, 'beam')];
  }
  // groomer k at (gx, gz) heading (fx, fz), lying on the slope; its light entry for land's snow and flakes follows it
  function rsGroPlace(k, gx, gz, fx, fz) {
    var e = 0.6, nx = H(gx - e, gz) - H(gx + e, gz), nz = H(gx, gz - e) - H(gx, gz + e), ny = 2 * e, nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
    var fd = fx * nx + fz * nz, Fx = fx - nx * fd, Fy = -ny * fd, Fz = fz - nz * fd, fl = Math.hypot(Fx, Fy, Fz); Fx /= fl; Fy /= fl; Fz /= fl;
    var gy = H(gx, gz); RS_M.set(ny * Fz - nz * Fy, nx, Fx, gx, nz * Fx - nx * Fz, ny, Fy, gy, nx * Fy - ny * Fx, nz, Fz, gz, 0, 0, 0, 1);
    RS.gro[0].setMatrixAt(k, RS_M); RS.gro[1].setMatrixAt(k, RS_M);
    var L = RS.gl[k], dl = Math.hypot(Fx, Fy - 0.22, Fz); L[0] = gx + Fx * 3.4; L[1] = gy + 1.9; L[2] = gz + Fz * 3.4; L[7] = Fx / dl; L[8] = (Fy - 0.22) / dl; L[9] = Fz / dl;
  }

  /* -- the lawn and the path: lamps, torches for the last stretch, sleds, a parked groomer -- */
  function rsLawn() {
    var P = SITE.path, sg = [], tot = 0, i;
    for (i = 0; i < P.length - 1; i++) { var l = Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]); sg.push(l); tot += l; }
    function at(s) { for (var q = 0; q < sg.length; q++) { if (s <= sg[q] || q === sg.length - 1) { var t = s / sg[q], a = P[q], b = P[q + 1]; return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, (b[0] - a[0]) / sg[q], (b[1] - a[1]) / sg[q]]; } s -= sg[q]; } }
    rsFrame(0, 0, 0, 0);
    for (var s = 9, sd = 1; s < tot - 31; s += 15, sd = -sd) { var q = at(s), x = q[0] + q[3] * 2.6 * sd, z = q[1] - q[2] * 2.6 * sd; rsLampPost(x, H(x, z), z, 3.1); }
    for (s = tot - 30; s < tot - 4; s += 6.5) [-1, 1].forEach(function (d) { var q = at(s); rsTorch(q[0] + q[3] * 2.3 * d, q[1] - q[2] * 2.3 * d); });
    [[50, 33, 0.5, '#B3241C'], [53.2, 33.6, 0.55, '#141518'], [56.4, 34.2, 0.5, '#141518'], [59.6, 34.8, 0.6, '#E8E6E0'], [-24, 41, -1.4, '#141518'], [-24.5, 44.2, -1.5, '#B3241C']].forEach(function (q, k) { rsSled(q[0], q[1], q[2], q[3], k * 3); });
    // the parked groomer, lights on, on the lawn west of the deck (its body is the 4th instance)
    var gx = -49, gz = -24, ga = Math.atan2(-gx, -gz); RS.park = [gx, gz, Math.sin(ga), Math.cos(ga)];
    rsFrame(gx, H(gx, gz), gz, ga); [-2.2, 0.2, 2.6].forEach(function (z) { rsRing(0, z, 2.0); });
  }

  /* -- materials -------------------------------------------------------------- */
  function rsSurf(ctx, ids, o) {
    for (var i = 0; i < ids.length; i++) if (ctx.assets.ready(ids[i])) return ctx.assets.surface(ids[i], o);
    return new ctx.THREE.MeshStandardMaterial({ color: o.color, roughness: 0.9 });
  }
  // the light baked into each vertex (aSpill) is added as albedo times light; frag replaces that line; tint reads aTint
  function rsChain(mat, key, frag, tint) {
    var prev = mat.onBeforeCompile;
    mat.onBeforeCompile = function (sh, r) {
      if (prev) prev.call(this, sh, r);
      sh.vertexShader = 'attribute vec3 aSpill; varying vec3 vRsS;' + (tint ? 'attribute vec3 aTint; varying vec3 vRsT;' : '') + '\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvRsS = aSpill;' + (tint ? 'vRsT = aTint;' : ''));
      sh.fragmentShader = 'varying vec3 vRsS;' + (tint ? 'varying vec3 vRsT;' : '') + '\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + (frag || 'totalEmissiveRadiance += diffuseColor.rgb * vRsS;'));
    };
    mat.customProgramCacheKey = function () { return 'rs-' + key; };
    return mat;
  }
  // the atlas: carved balcony boards, the hotels' names, the lift's name, the closed piste, the private gate
  function rsRailMat(ctx) {
    var T = ctx.THREE, R = rng(5), names = ['MAISON GIVRE', 'LE FAUCON GRIS', 'LA PLUME DE NEIGE', 'L’ÉTOILE DU NÉVÉ', 'LE LYNX D’ARGENT', 'CHALET MINUIT'];
    var tex = ctx.textures.canvas(1024, 1024, function (g, w) {
      g.clearRect(0, 0, w, w);
      var bw = w / 8, i, k;
      for (i = 0; i < 8; i++) {
        var x0 = i * bw, gr = g.createLinearGradient(x0, 0, x0 + bw, 0); gr.addColorStop(0, '#2E1D12'); gr.addColorStop(0.45, '#4E3322'); gr.addColorStop(1, '#2A1A10');
        g.fillStyle = gr; g.fillRect(x0 + 4, 0, bw - 8, 256);
        for (k = 0; k < 26; k++) { g.strokeStyle = 'rgba(18,9,4,' + (0.12 + R() * 0.25) + ')'; g.lineWidth = 1 + R() * 1.5; var gx = x0 + 6 + R() * (bw - 12); g.beginPath(); g.moveTo(gx, 0); g.bezierCurveTo(gx + (R() - 0.5) * 8, 38, gx + (R() - 0.5) * 8, 90, gx + (R() - 0.5) * 6, 256); g.stroke(); }
      }
      g.globalCompositeOperation = 'destination-out';
      for (i = 1; i < 8; i += 2) {   // a heart cut half from each board of a pair, a diamond below it
        var cx = i * bw + bw, cy = 51; g.beginPath(); g.moveTo(cx, cy + 34); g.bezierCurveTo(cx - 46, cy + 4, cx - 30, cy - 34, cx, cy - 12); g.bezierCurveTo(cx + 30, cy - 34, cx + 46, cy + 4, cx, cy + 34); g.fill();
        g.beginPath(); g.moveTo(cx, 84); g.lineTo(cx + 14, 97); g.lineTo(cx, 110); g.lineTo(cx - 14, 97); g.fill();
        g.beginPath(); g.arc(cx - bw, 95, 9, 0, TAU); g.fill();
      }
      g.globalCompositeOperation = 'source-over'; g.textAlign = 'center'; g.textBaseline = 'middle';
      function board(x, y, bw2, bg, edge, ink, font, text) { g.fillStyle = bg; g.fillRect(x + 6, y + 8, bw2 - 12, 112); g.strokeStyle = edge; g.lineWidth = 5; g.strokeRect(x + 14, y + 16, bw2 - 28, 96); g.fillStyle = ink; g.font = font; g.fillText(text, x + bw2 / 2, y + 66, bw2 - 64); }
      for (i = 0; i < 6; i++) board((i % 2) * 512, 256 + (i >> 1) * 128, 512, '#24170E', '#8A6A3A', '#E7C78A', '600 46px Georgia, serif', names[i]);
      board(0, 640, 1024, '#14212E', '#C9D2DA', '#F2F5F7', '700 60px "Helvetica Neue", Arial, sans-serif', 'TÉLÉSIÈGE DES CORBEAUX');
      board(0, 768, 512, '#F2F2F0', '#C21A12', '#C21A12', '800 52px "Helvetica Neue", Arial, sans-serif', 'PISTE FERMÉE');
      board(512, 768, 512, '#24170E', '#8A6A3A', '#E7C78A', '600 56px Georgia, serif', 'PRIVÉ');
    });
    var m = new T.MeshStandardMaterial({ map: tex, alphaTest: 0.5, side: T.DoubleSide, roughness: 0.82 }); m.alphaToCoverage = true;
    return rsChain(m, 'rail');
  }
  // props: vertex colour with roughness, metalness and glow per vertex; swept surfaces (aPm.w 1) take no snow
  function rsPropsMat(T, cover) {
    var m = new T.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 1 });
    m.onBeforeCompile = function (sh) {
      sh.vertexShader = 'attribute vec4 aPm; varying vec4 vPm;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvPm = aPm;');
      sh.fragmentShader = 'varying vec4 vPm;\n' + sh.fragmentShader.replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vPm.x;').replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vPm.y;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vColor.rgb * vPm.z;');
    };
    m = cover(rsChain(m, 'props'), { edge: 0.72, soft: 0.08, pools: 0, amount: 0.8, sparkle: 0.5 });
    var pv = m.onBeforeCompile;
    m.onBeforeCompile = function (sh, r) { pv.call(this, sh, r); sh.fragmentShader = sh.fragmentShader.replace(/\*\s*uSnA\s*;/, '*uSnA*(1.0-vPm.w);'); };
    m.customProgramCacheKey = function () { return 'rs-propsC'; };
    return m;
  }
  // glass over a room: the eye's ray goes through the pane into a box (walls, floor, ceiling), furniture, people and
  // lamps placed by the window's seed; the club's is one deep room with its crowd, light shafts and the deck's
  // festoons reflected on the glass. Light from 2700 K to 3500 K, curtains, sheers, dark rooms, a TV's flicker.
  var RS_ROOM = [
    'uniform float uRsT,uRsGlow; varying vec4 vWin; varying vec2 vWUv; varying vec3 vWP; varying vec3 vWN;',
    'float rsH1(float n){return fract(sin(n*91.3458)*47453.5453);}',
    'vec3 rsRoomC,rsO,rsD,rsLp,rsWm; float rsFrM,rsT,rsFl;',
    'vec3 rsLit(vec3 a,vec3 p){float l=length(p-rsLp);return a*rsWm*(0.05+1.6/(1.0+1.8*l*l));}',
    'void rsBx(vec3 a,vec3 b,vec3 c,inout vec3 col){vec3 q1=(a-rsO)/rsD,q2=(b-rsO)/rsD,n=min(q1,q2),x=max(q1,q2);float tn=max(max(n.x,n.y),n.z),tx=min(min(x.x,x.y),x.z);if(tn<tx&&tn>0.0&&tn<rsT){rsT=tn;col=rsLit(c,rsO+rsD*tn);}}',
    'void rsGl(vec3 p,float s,inout vec3 col){vec3 q=p-rsO;float u=dot(q,rsD);if(u>0.0&&u<rsT+0.2){vec3 e=q-rsD*u;col+=rsWm*s/(dot(e,e)*90.0+0.015);}}',
    'void rsMan(float zp,float xp,float hh,inout vec3 col){float sp=zp/rsD.z;if(sp<rsT){vec2 r=(rsO+rsD*sp).xy-vec2(xp,rsFl);if(step(abs(r.x),0.23-0.06*smoothstep(0.8,1.3*hh,r.y))*step(r.y,1.45*hh)+step(length(r-vec2(0.0,1.6*hh)),0.12)>0.5){col=rsWm*0.012;rsT=sp;}}}',
    'void rsRoom(){',
    ' float sd=vWin.x,ww=vWin.y,wh=vWin.z,kind=floor(vWin.w+0.001),sill=fract(vWin.w+0.001)*10.0;',
    ' float club=kind>0.5&&kind<1.5?1.0:0.0,lobby=kind>2.5?1.0:0.0,dark=kind>1.5&&kind<2.5?1.0:0.0;',
    ' vec3 N=normalize(vWN),Tg=normalize(cross(vec3(0.0,1.0,0.0),N)),Bt=cross(N,Tg),rd=normalize(vWP-cameraPosition);',
    ' vec3 d=vec3(dot(rd,Tg),dot(rd,Bt),-dot(rd,N));d.x=abs(d.x)<1e-4?1e-4:d.x;d.y=abs(d.y)<1e-4?1e-4:d.y;d.z=max(d.z,1e-3);',
    ' vec3 o=vec3(vWUv.x*ww,vWUv.y*wh,0.0);rsO=o;rsD=d;',
    ' float dep=club>0.5?15.0:lobby>0.5?7.0:3.8+sd*1.8,sid=club>0.5?0.0:lobby>0.5?2.6:0.8+fract(sd*7.7)*0.9;',
    ' vec3 lo=vec3(-sid,-sill-0.02,0.0),hi=vec3(ww+sid,club>0.5?wh:max(wh+0.45,2.7-sill),dep);',
    ' vec3 tf=max((lo-o)/d,(hi-o)/d);rsT=min(min(tf.x,tf.y),tf.z);vec3 h=o+d*rsT;',
    ' bool isB=tf.z<=rsT+1e-4,isS=!isB&&tf.x<=rsT+1e-4;',
    ' float ex=min(h.x-lo.x,hi.x-h.x),ey=min(h.y-lo.y,hi.y-h.y),ez=min(h.z,dep-h.z),ao=0.35+0.65*smoothstep(0.0,0.9,max(min(ex,ey),min(max(ex,ey),ez)));',
    ' float ct=fract(sd*5.31),fl=lo.y,pan=step(0.45,fract(sd*6.1));rsFl=fl;vec3 alb;',
    ' rsWm=(ct<0.14?vec3(1.0,0.4,0.13):ct>0.88?vec3(1.0,0.74,0.5):mix(vec3(1.0,0.5,0.2),vec3(1.0,0.66,0.4),(ct-0.14)/0.74))*(0.6+0.8*fract(sd*7.13));',
    ' rsLp=vec3(ww*(0.2+0.6*fract(sd*3.7)),fl+1.2+0.9*fract(sd*8.9),dep*(0.5+0.3*fract(sd*2.3)));',
    ' if(isB){alb=pan>0.5?vec3(0.34,0.2,0.1)*(0.82+0.18*step(0.035,fract(h.x*2.4))):vec3(0.58,0.46,0.34);',
    '  if(h.y<fl+0.95)alb=vec3(0.26,0.15,0.08)*(0.82+0.18*step(0.5,fract(h.x*3.0)));',
    '  vec2 pq=abs(h.xy-vec2(ww*0.5+(fract(sd*13.1)-0.5)*ww*0.8,fl+1.75))-vec2(0.5,0.36);float pm=max(pq.x,pq.y);',
    '  if(pm<0.0)alb=mix(vec3(0.08,0.12,0.18),vec3(0.5,0.28,0.12),fract(sd*29.0))*(0.7+0.3*sin(h.x*7.0+h.y*4.0+sd*9.0));else if(pm<0.06)alb=vec3(0.6,0.44,0.16);',
    '  if(lobby>0.5)alb=abs(h.x-ww*0.5)<1.3?vec3(0.3,0.28,0.26)*(0.75+0.25*step(0.07,fract((h.y-fl)*3.3))):vec3(0.14,0.09,0.05)*(1.0+3.0*step(0.9,fract((h.y-fl)*2.2)));',
    ' }else if(isS){alb=vec3(0.36,0.22,0.11)*(0.78+0.22*step(0.05,fract(h.z*1.3)));',
    ' }else if(d.y<0.0){alb=vec3(0.26,0.15,0.08)*(0.72+0.28*rsH1(floor(h.x*6.0)*7.0+floor(h.z*0.8)));',
    '  vec2 rq=abs(vec2(h.x-ww*0.5,h.z-dep*0.55))-vec2(ww*0.3+0.5,dep*0.22);if(max(rq.x,rq.y)<0.0)alb=mix(vec3(0.42,0.1,0.06),vec3(0.55,0.45,0.3),fract(sd*3.3));',
    ' }else{alb=mix(vec3(0.62,0.55,0.46),vec3(0.16,0.09,0.05),step(fract(h.z*0.9+sd),0.16));}',
    ' vec3 col=rsLit(alb,h)*ao;',
    ' if(lobby>0.5){col*=1.35;if(isB&&abs(h.x-ww*0.5)<0.6&&h.y<fl+0.8)col=vec3(1.0,0.4,0.09)*(1.5+0.6*sin(uRsT*9.0+h.x*20.0)*sin(uRsT*5.3+h.y*9.0))*smoothstep(fl+0.85,fl,h.y);else if(isB&&abs(h.x-ww*0.5)<0.9&&h.y<fl+1.15)col=vec3(0.05,0.045,0.04);}',
    ' if(club<0.5){float cx=ww*0.5+(sd-0.5);',
    '  rsBx(vec3(cx-1.1,fl,dep-1.0),vec3(cx+1.1,fl+0.6,dep-0.05),mix(vec3(0.5,0.36,0.25),vec3(0.16,0.2,0.28),fract(sd*41.0)),col);',
    '  if(lobby>0.5){for(int i=0;i<2;i++){float fi=float(i),s=fi*2.0-1.0,ax=ww*0.5+s*(1.3+0.4*fract(sd*9.0)),az=2.4+fi*1.5;',
    '    rsBx(vec3(ax-0.42,fl,az-0.4),vec3(ax+0.42,fl+0.45,az+0.4),vec3(0.42,0.3,0.22),col);rsBx(vec3(ax-0.42,fl,az+0.25),vec3(ax+0.42,fl+0.95,az+0.42),vec3(0.36,0.24,0.17),col);',
    '    rsGl(vec3(ww*(0.25+0.5*fi)+0.3*s,fl+2.5-0.3*fi,1.6+fi*2.4),0.7,col);}',
    '   rsBx(vec3(ww*0.5-0.5,fl,3.1),vec3(ww*0.5+0.5,fl+0.42,3.7),vec3(0.2,0.13,0.08),col);',
    '   rsMan(2.2+3.0*fract(sd*17.3),ww*fract(sd*11.7),1.0,col);if(fract(sd*31.0)>0.5)rsMan(4.6,ww*fract(sd*5.9),0.95,col);}',
    '  else{if(fract(sd*17.3)>0.62)rsMan(dep*0.5,ww*(0.2+0.6*fract(sd*11.7)),1.0,col);rsBx(vec3(-0.2,fl,1.0+fract(sd*3.0)),vec3(0.6,fl+0.85,1.8+fract(sd*3.0)),vec3(0.3,0.2,0.14),col);}',
    '  float s0=dot(rsLp-o,d);if(s0>0.0&&s0<rsT+0.3){vec3 lq=o+d*s0-rsLp;col=mix(col,rsWm*1.7,length(lq.xz)<0.24&&abs(lq.y)<0.17?1.0:0.0);col+=rsWm*0.025/(dot(lq,lq)+0.04);}',
    '  if(kind<0.5&&fract(sd*41.0)<0.12)col=alb*ao*vec3(0.05,0.08,0.16)*(1.0+0.7*sin(uRsT*6.0+sd*40.0)*sin(uRsT*2.3+sd));',
    ' }else{',
    '  float beat=pow(max(0.5+0.5*sin(uRsT*13.4),0.0),6.0);vec3 mg=vec3(1.0,0.06,0.5),cy=vec3(0.04,0.55,1.0);col=alb*0.03*ao;',
    '  vec2 s1=vec2(ww*(0.5+0.38*sin(uRsT*0.61)),fl+3.2+1.8*sin(uRsT*0.93)),s2=vec2(ww*(0.5+0.38*sin(uRsT*0.47+2.0)),fl+3.0+1.6*sin(uRsT*1.17+1.0));',
    '  if(isB)col+=mg*smoothstep(1.7,0.1,length(h.xy-s1))*0.55+cy*smoothstep(1.7,0.1,length(h.xy-s2))*0.55;',
    '  if(!isB&&!isS&&d.y<0.0)col+=mix(mg,cy,0.5+0.5*sin(h.x*0.4+uRsT))*0.03*(0.4+beat);',
    '  if(isB&&h.y>fl+0.9&&h.y<fl+3.2){float sh=fract((h.y-fl)/0.55);col=vec3(1.0,0.56,0.2)*(0.35+1.3*step(0.82,sh))*(0.55+0.45*step(0.5,fract(h.x*5.0+floor((h.y-fl)/0.55)*0.37)));}',
    '  if(!isB&&!isS&&d.y>0.0)col+=vec3(1.0,0.8,0.6)*step(0.95,rsH1(floor(h.x*3.0)+floor(h.z*3.0)*17.0))*1.4;',
    '  float my=fl+4.6;if(d.y>0.0&&o.y<my){float tm=(my-o.y)/d.y;vec3 hm=o+d*tm;if(tm<rsT&&hm.z<5.0){col=vec3(0.015)+vec3(1.0,0.75,0.5)*step(0.9,rsH1(floor(hm.x*0.8)+floor(hm.z*1.2)*7.0))*1.6;rsT=tm;}}',
    '  float t5=5.0/d.z;vec3 h5=o+d*t5;if(t5<rsT&&h5.y>my-0.35&&h5.y<my+1.0){col=h5.y<my?mix(mg,cy,step(0.5,fract(h5.x*0.1+uRsT*0.2)))*1.2:vec3(0.02,0.02,0.025)+mix(mg,cy,0.5)*0.05;rsT=t5;}',
    '  vec3 wash=mix(mg,cy,0.5+0.5*sin(uRsT*1.3+o.x*0.25));',
    // three rows of dancers, each bobbing to the beat, some with arms up, lit at the rim by the stage colours
    '  for(int i=0;i<3;i++){float fi=float(i),zp=5.0+fi*2.8,sp=zp/d.z;if(sp<rsT){vec3 hp=o+d*sp;float xx=hp.x*(2.2-fi*0.35)+fi*0.37,id=floor(xx),f=fract(xx)-0.5,ht=1.3+0.35*rsH1(id+fi*13.0)+0.07*sin(uRsT*8.4+id*1.9)*(0.4+beat),y=hp.y-fl;',
    '   if(y<ht+0.22*sqrt(max(0.0,1.0-f*f*9.0))-0.1||(rsH1(id*3.1+fi)>0.78&&abs(f-0.25*sin(uRsT*4.0+id))<0.06&&y<ht+0.75)){col=wash*(0.012+0.03*fi)+mix(mg,cy,step(0.5,rsH1(id)))*0.12*smoothstep(ht-0.25,ht+0.1,y);rsT=sp;}}}',
    '  col+=wash*0.004*min(rsT,12.0);',
    '  for(int i=0;i<4;i++){float fi=float(i);vec3 A=vec3(ww*(0.14+0.24*fi)+2.5*sin(uRsT*(0.5+0.13*fi)+fi),wh-0.6,dep*0.55);',
    '   vec3 Bv=normalize(vec3(0.6*sin(uRsT*(0.7+0.2*fi)+fi*2.0),-1.0,-0.35+0.3*sin(uRsT*0.4+fi))),w0=o-A;float bb=dot(d,Bv),dd=dot(d,w0),ee=dot(Bv,w0),dn=max(1.0-bb*bb,1e-3),sR=(bb*ee-dd)/dn,uB=(ee-bb*dd)/dn;',
    '   if(sR>0.0&&sR<rsT&&uB>0.0){vec3 pc=o+d*sR-A-Bv*uB;col+=(mod(fi,2.0)<0.5?mg:cy)*exp(-dot(pc,pc)*5.0)*0.6*exp(-uB*0.07);}}',
    '  vec3 r=reflect(rd,N);if(r.y>0.0){vec3 p=vWP+r*((9.1-vWP.y)/r.y);float u=(p.z+22.4)/42.0;if(u>0.0&&u<1.0&&abs(p.x)<32.4){float g=min(abs(fract((p.x-5.4*u)/10.8+0.5)-0.5),abs(fract((p.x+5.4*u)/10.8+0.5)-0.5))*10.8;',
    '   col+=vec3(1.0,0.6,0.28)*3.0*smoothstep(0.1,0.0,g)*smoothstep(0.25,0.1,abs(fract(u*58.0)-0.5))*(0.08+0.9*pow(1.0-abs(dot(rd,N)),4.0));}}',
    ' }',
    ' if(club<0.5&&lobby<0.5){float cm=fract(sd*19.0),cc=fract(sd*23.0),cw=ww*(cm<0.32?0.12+0.1*fract(sd*11.0):0.3+0.25*fract(sd*11.0));',
    '  vec3 cu=(cc<0.45?vec3(0.8,0.6,0.38):cc<0.82?vec3(0.42,0.36,0.3):vec3(0.55,0.13,0.07))*rsWm*(0.35+0.15*sin(o.x*36.0+sd*10.0))*(0.5+0.5*fract(sd*31.0));',
    '  if(cm<0.55&&(cm<0.32?min(o.x,ww-o.x):fract(sd*3.1)<0.5?o.x:ww-o.x)<cw)col=mix(col,cu,0.92);',
    '  if(cm>0.84)col=mix(col,rsWm*(0.45+0.08*sin(o.x*28.0+sd*7.0)),0.8);}',
    ' if(dark>0.5)col=alb*vec3(0.012,0.018,0.035);',
    ' float dist=length(vWP-cameraPosition);',
    ' col=mix(col,club>0.5?vec3(0.22,0.06,0.2):dark>0.5?vec3(0.008,0.012,0.02):rsWm*0.32,smoothstep(70.0,220.0,dist));',
    ' vec2 e=vec2(min(o.x,ww-o.x),min(o.y,wh-o.y));float fr=club>0.5?0.0:step(min(e.x,e.y),0.065);',
    ' if(club<0.5&&ww>1.25)fr=max(fr,step(abs(o.x-ww*0.5),0.045));',
    ' if(kind<0.5){fr=max(fr,step(abs(o.y-wh*0.36),0.022));fr=max(fr,step(abs(o.y-wh*0.68),0.022));}',
    ' rsFrM=fr*(1.0-smoothstep(40.0,130.0,dist));rsRoomC=col*1.6*uRsGlow;',
    '}',
  ].join('\n');
  function rsGlassMat(T) {
    var m = new T.MeshStandardMaterial({ color: '#030406', roughness: 0.06, metalness: 0, envMapIntensity: 1.2 }), U = RS.U;
    m.onBeforeCompile = function (sh) {
      sh.uniforms.uRsT = U.t; sh.uniforms.uRsGlow = U.glow;
      sh.vertexShader = 'attribute vec4 aWin; varying vec4 vWin; varying vec2 vWUv; varying vec3 vWP; varying vec3 vWN;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvWin = aWin; vWUv = uv; vWP = (modelMatrix * vec4(transformed, 1.0)).xyz; vWN = normalize(mat3(modelMatrix) * objectNormal);');
      sh.fragmentShader = RS_ROOM + '\n' + sh.fragmentShader
        .replace('#include <color_fragment>', '#include <color_fragment>\nrsRoom(); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.07, 0.045, 0.03), rsFrM);')
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.7, rsFrM);')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += rsRoomC * (1.0 - rsFrM);');
    };
    m.customProgramCacheKey = function () { return 'rs-glass'; };
    return m;
  }
  // light beams: open cones, bright face-on, soft at the rims, fading along their length
  function rsBeamMat(T) {
    return new T.ShaderMaterial({
      vertexShader: 'attribute vec3 color; varying vec3 vC; varying vec3 vN; varying vec3 vV; varying float vY; void main() { vec4 p = vec4(position, 1.0); vec3 n = normal;\n#ifdef USE_INSTANCING\np = instanceMatrix * p; n = mat3(instanceMatrix) * n;\n#endif\nvec4 mv = modelViewMatrix * p; vN = normalize(normalMatrix * n); vV = -mv.xyz; vC = color; vY = uv.y; gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'varying vec3 vC; varying vec3 vN; varying vec3 vV; varying float vY; void main() { float L = length(vV), rim = abs(dot(normalize(vN), vV / L)); float a = pow(clamp(rim, 0.0, 1.0), 2.2) * pow(clamp(1.0 - vY, 0.0, 1.0), 1.3) * smoothstep(0.0, 0.06, vY) * exp(-L * 0.0022); gl_FragColor = vec4(vC * a, 1.0); }',
      transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide,
    });
  }
  function rsGeom(T, A, kind, nob) {
    var g = new T.BufferGeometry(), F = function (a, n) { return new T.Float32BufferAttribute(a, n); };
    g.setAttribute('position', F(A.p, 3)); g.setAttribute('uv', F(A.uv, 2));
    if (kind === 'props' || kind === 'beam') g.setAttribute('color', F(A.c, 3));
    if (kind === 'snow') g.setAttribute('aTint', F(A.c, 3));
    if (kind === 'props') g.setAttribute('aPm', F(A.q, 4));
    if (kind === 'glass') g.setAttribute('aWin', F(A.q, 4));
    g.setIndex(A.n > 65535 ? new T.Uint32BufferAttribute(A.i, 1) : new T.Uint16BufferAttribute(A.i, 1));
    g.computeVertexNormals();
    if (kind !== 'glass' && kind !== 'beam') g.setAttribute('aSpill', F(nob ? new Float32Array(A.n * 3) : rsBake(g), 3));
    g.computeBoundingSphere();
    return g;
  }
  // the lamplight each vertex takes from every light within reach, and a cool bounce off the snow near the ground
  function rsBake(g) {
    var p = g.attributes.position.array, n = g.attributes.normal.array, out = new Float32Array(p.length), cell = {}, i, k;
    RS.L.forEach(function (L) { if (!L.I) return; var key = Math.floor(L.x / 8) + ':' + Math.floor(L.z / 8); (cell[key] = cell[key] || []).push(L); });
    for (i = 0; i < p.length; i += 3) {
      var x = p[i], y = p[i + 1], z = p[i + 2], cx = Math.floor(x / 8), cz = Math.floor(z / 8), r = 0, gg = 0, b = 0;
      for (var a = -1; a <= 1; a++) for (var c = -1; c <= 1; c++) {
        var list = cell[(cx + a) + ':' + (cz + c)]; if (!list) continue;
        for (k = 0; k < list.length; k++) {
          var L = list[k], dx = L.x - x, dy = L.y - y, dz = L.z - z, d2 = dx * dx + dy * dy + dz * dz; if (d2 > L.r * L.r) continue;
          var d = Math.sqrt(d2) + 1e-4, lam = ((n[i] * dx + n[i + 1] * dy + n[i + 2] * dz) / d + 0.15) / 1.15; if (lam <= 0) continue;
          if (L.nx || L.ny || L.nz) { var fw = -(L.nx * dx + L.ny * dy + L.nz * dz) / d; if (fw <= 0) continue; lam *= fw; }
          var f = 1 - d2 / (L.r * L.r), att = L.I * lam * f * f / (1 + d2 * 0.9);
          r += L.c[0] * att; gg += L.c[1] * att; b += L.c[2] * att;
        }
      }
      var bo = 0.07 * (0.55 - 0.45 * n[i + 1]) * Math.exp(-Math.max(0, y - H(x, z)) / 5); r += bo * 0.55; gg += bo * 0.7; b += bo;
      var m = Math.max(r, gg, b); if (m > 2.5) { r *= 2.5 / m; gg *= 2.5 / m; b *= 2.5 / m; }
      out[i] = r; out[i + 1] = gg; out[i + 2] = b;
    }
    return out;
  }

  /* -- build ------------------------------------------------------------------ */
  var RS_M = null;
  function resortBuild(ctx) {
    var T = ctx.THREE, S = ctx.scene, low = ctx.quality === 'low';
    RS.U = { t: { value: 0 }, glow: { value: 1 } }; RS.step = low ? 1.6 : 1.05; RS.ice = low ? 2 : 1; RS_M = new T.Matrix4();
    S.traverse(function (o) { if (!RS.tree && o.isInstancedMesh && o.name === 'land-trees') RS.tree = o; });   // land's spruce, for the potted firs
    RS.A = { stone: rsAcc(), wood: rsAcc(), snow: rsAcc(), glass: rsAcc(), rail: rsAcc(), ice: rsAcc(), props: rsAcc(), thin: rsAcc(), beam: rsAcc() };
    SITE.chalets.forEach(rsChalet);
    rsClub(); rsBalustrade(); rsLift(); rsMasts(); rsFences(); rsLawn();
    // meshes, one per material
    var cover = typeof snowCover === 'function' ? snowCover : function (m) { return m; };
    var stone = cover(rsChain(rsSurf(ctx, ['texture-stone-wall', 'texture-rock'], { project: 'box', color: '#E6E1DA', roughness: 1, normal: 1.4, mottle: 0.18, variety: false }), 'stone'), { edge: 0.6, soft: 0.1, pools: 0 });
    var wood = cover(rsChain(rsSurf(ctx, ['texture-chalet-planks', 'texture-planks'], { project: 'box', color: '#F2E6DA', roughness: 0.95, normal: 1.2, mottle: 0.14, variety: false }), 'wood'), { edge: 0.62, soft: 0.1, pools: 0, amount: 0.95 });
    if (wood.map) RS.planks = { map: wood.map, normalMap: wood.normalMap, roughnessMap: wood.roughnessMap };
    var snow = rsChain(new T.MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.9 }), 'snow', 'diffuseColor.rgb *= vRsT; totalEmissiveRadiance += diffuseColor.rgb * vRsS + (1.0 - vRsT.r) * vec3(0.06, 0.15, 0.3);', 1);
    if (typeof snowCover === 'function') snow = snowCover(snow, { edge: -2, soft: 0.01, pools: 0, scale: 1.6 });
    var ice = rsChain(new T.MeshStandardMaterial({ color: '#4A6680', roughness: 0.05, metalness: 0, envMapIntensity: 1.6 }), 'ice', 'float rsF = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 2.0); totalEmissiveRadiance += vec3(0.09, 0.16, 0.26) * (0.3 + rsF) + vRsS * (0.4 + 1.5 * rsF);');
    var props = rsPropsMat(T, cover);
    [[RS.A.stone, stone, 'lit', 1], [RS.A.wood, wood, 'lit', 1], [RS.A.snow, snow, 'snow', 1], [RS.A.rail, rsRailMat(ctx), 'lit', 1], [RS.A.ice, ice, 'lit', 0], [RS.A.glass, rsGlassMat(T), 'glass', 0], [RS.A.props, props, 'props', 1], [RS.A.thin, props, 'props', 0]].forEach(function (e) {
      if (!e[0].n) return; var m = new T.Mesh(rsGeom(T, e[0], e[2]), e[1]); m.castShadow = !!e[3]; m.receiveShadow = true; S.add(m);
    });
    var beams = new T.Mesh(rsGeom(T, RS.A.beam, 'beam'), rsBeamMat(T)); beams.renderOrder = 5; beams.userData.noReflection = true; S.add(beams);
    // the chairs going round, the groomers (three on the piste, one parked on the lawn), the potted firs
    var nC = Math.round((2 * RS.lift.L + TAU * RS.lift.r) / (low ? 30 : 15));
    RS.chairs = new T.InstancedMesh(rsChairGeo(T), props, nC); RS.chairs.frustumCulled = false; S.add(RS.chairs);
    var gg = rsGroomerGeo(T); RS.gro = [new T.InstancedMesh(gg[0], props, 4), new T.InstancedMesh(gg[1], rsBeamMat(T), 4)];
    RS.gro.forEach(function (m) { m.frustumCulled = false; S.add(m); }); RS.gro[1].renderOrder = 5; RS.gro[0].castShadow = true;
    for (var k = 0; k < 4; k++) RS.gl.push([0, -999, 0, 1.3, 1.25, 1.15, 13, 0, -1, 0, 0.86]);
    rsGroPlace(3, RS.park[0], RS.park[1], RS.park[2], RS.park[3]);
    if (RS.tree && RS.fir.length) {
      var fm = new T.InstancedMesh(RS.tree.geometry, RS.tree.material, RS.fir.length), o = new T.Object3D();
      RS.fir.forEach(function (f, i) { o.position.set(f[0], f[1], f[2]); o.rotation.y = f[4]; o.scale.set(f[3] * 0.59, f[3], f[3] * 0.59); o.updateMatrix(); fm.setMatrixAt(i, o.matrix); });
      fm.castShadow = true; fm.receiveShadow = true; fm.computeBoundingSphere(); S.add(fm);
    }
    rsHalos(ctx); rsSmoke(ctx, low);
    RS.solids.forEach(function (s) { ctx.solid(s); });
    if (typeof LIGHTS_FOR_SNOW !== 'undefined' && LIGHTS_FOR_SNOW.push) RS.pool.concat(RS.gl).forEach(function (p) { LIGHTS_FOR_SNOW.push(p); });
    resortUpdate(ctx, 0, 0);
  }
  // a soft glow in the air round every lamp: points, additive, sized in metres; a negative size flickers (a flame)
  function rsHalos(ctx) {
    var T = ctx.THREE, n = RS.halo.length, p = new Float32Array(n * 3), c = new Float32Array(n * 3), s = new Float32Array(n);
    RS.halo.forEach(function (h, i) { p.set([h[0], h[1], h[2]], i * 3); c.set([h[3], h[4], h[5]], i * 3); s[i] = h[6]; });
    var g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(p, 3)); g.setAttribute('color', new T.BufferAttribute(c, 3)); g.setAttribute('aSize', new T.BufferAttribute(s, 1));
    RS.haloU = { uScale: { value: 600 }, uT: RS.U.t };
    var m = new T.ShaderMaterial({ uniforms: RS.haloU, transparent: true, depthWrite: false, blending: T.AdditiveBlending,
      vertexShader: 'attribute vec3 color; attribute float aSize; uniform float uScale, uT; varying vec3 vC; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; float fl = aSize < 0.0 ? 0.8 + 0.2 * sin(uT * 17.0 + position.x * 3.0) * sin(uT * 7.3 + position.z) : 1.0; gl_PointSize = clamp(abs(aSize) * fl * uScale / -mv.z, 1.0, 220.0); vC = color * fl * 0.11 * (1.0 - smoothstep(60.0, 260.0, -mv.z) * 0.5); }',
      fragmentShader: 'varying vec3 vC; void main() { float d = length(gl_PointCoord - 0.5) * 2.0; float a = exp(-d * d * 5.0) * (1.0 - d); gl_FragColor = vec4(vC * max(a, 0.0), 1.0); }' });
    var pts = new T.Points(g, m); pts.renderOrder = 7; pts.userData.noReflection = true; ctx.scene.add(pts);
  }
  // chimney smoke and hot-tub steam: puffs rising, drifting, swelling and thinning, drawn as camera-facing cards
  function rsSmoke(ctx, low) {
    var T = ctx.THREE, per = low ? 6 : 12, n = RS.smoke.length * per, base = new T.PlaneGeometry(1, 1), g = new T.InstancedBufferGeometry(), a = new Float32Array(n * 4), R = rng(77);
    g.index = base.index; g.setAttribute('position', base.attributes.position); g.setAttribute('uv', base.attributes.uv);
    RS.smoke.forEach(function (c, i) { for (var k = 0; k < per; k++) a.set([c[0], c[1], c[2], (k / per + R() * 0.05 + i * 0.37) % 1 + (c[3] ? 1000 : 0)], (i * per + k) * 4); });
    g.setAttribute('aSm', new T.InstancedBufferAttribute(a, 4)); g.instanceCount = n;
    var m = new T.ShaderMaterial({ uniforms: { uT: RS.U.t }, transparent: true, depthWrite: false,
      vertexShader: 'attribute vec4 aSm; uniform float uT; varying vec2 vUv; varying float vA; varying float vS; varying float vSt; void main() { float st = step(500.0, aSm.w), ph = fract(aSm.w), life = fract(uT * mix(0.055, 0.17, st) + ph); vec3 c = aSm.xyz + mix(vec3(2.2, 0.0, 0.9) * life * life * 5.0 + vec3(0.0, life * 7.5, 0.0), vec3(0.5, 2.2, 0.3) * life, st);' +
        ' float s = mix(0.7 + life * 4.2, 0.35 + life * 1.5, st); vec3 r = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]), u = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]); float an = ph * 40.0 + life * 1.5; vec2 q = mat2(cos(an), sin(an), -sin(an), cos(an)) * position.xy;' +
        ' vec4 mv = viewMatrix * vec4(c + (r * q.x + u * q.y) * s, 1.0); gl_Position = projectionMatrix * mv; vUv = uv; vS = ph * 7.0 + st * 3.0; vSt = st; vA = smoothstep(0.0, 0.12, life) * pow(1.0 - life, 1.4) * mix(0.42, 0.3, st) * exp(-length(mv.xyz) * 0.003); }',
      fragmentShader: 'varying vec2 vUv; varying float vA; varying float vS; varying float vSt; float hs(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); } float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hs(i), hs(i + vec2(1, 0)), f.x), mix(hs(i + vec2(0, 1)), hs(i + vec2(1, 1)), f.x), f.y); }' +
        ' void main() { vec2 p = vUv - 0.5; float d = length(p) * 2.0; float n = vn(vUv * 4.0 + vS) * 0.6 + vn(vUv * 9.0 - vS) * 0.4; float a = smoothstep(1.0, 0.2, d + (n - 0.5) * 0.7) * vA; gl_FragColor = vec4(mix(vec3(0.42, 0.47, 0.56), vec3(0.6, 0.68, 0.72), vSt) * (0.7 + n * 0.5), a); }' });
    var mesh = new T.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 4; mesh.userData.noReflection = true; ctx.scene.add(mesh);
  }
  /* -- every frame: the chairs, the groomers and their lights, the torches, the clock -- */
  function resortUpdate(ctx, t) {
    if (!RS.U) return;
    RS.U.t.value = t; if (RS.haloU) RS.haloU.uScale.value = (typeof innerHeight !== 'undefined' ? innerHeight : 900) * 0.5 / Math.tan(((ctx.camera.fov || 50) * PI / 180) / 2);
    var Lf = RS.lift, C = RS.chairs, i;
    if (C) {
      var n = C.count, P = 2 * Lf.L + TAU * Lf.r, arr = C.instanceMatrix.array;
      for (i = 0; i < n; i++) {
        var s = (i * P / n + t * 2.3) % P, al, off, yaw, cs = Lf.r;
        if (s < Lf.L) { al = s; off = cs; yaw = 0; }
        else if (s < Lf.L + PI * cs) { var th = (s - Lf.L) / cs; al = Lf.L + Math.sin(th) * cs; off = Math.cos(th) * cs; yaw = th; }
        else if (s < 2 * Lf.L + PI * cs) { al = Lf.L - (s - Lf.L - PI * cs); off = -cs; yaw = PI; }
        else { var th2 = (s - 2 * Lf.L - PI * cs) / cs; al = -Math.sin(th2) * cs; off = -Math.cos(th2) * cs; yaw = PI + th2; }
        var x = Lf.a[0] + Lf.ux * al + Lf.px * off, z = Lf.a[1] + Lf.uz * al + Lf.pz * off, y = Lf.cy(clamp(al, 0, Lf.L)), hy = Math.atan2(Lf.ux, Lf.uz) + yaw, c = Math.cos(hy), sn = Math.sin(hy), o = i * 16;
        arr[o] = c; arr[o + 1] = 0; arr[o + 2] = -sn; arr[o + 3] = 0; arr[o + 4] = 0; arr[o + 5] = 1; arr[o + 6] = 0; arr[o + 7] = 0;
        arr[o + 8] = sn; arr[o + 9] = 0; arr[o + 10] = c; arr[o + 11] = 0; arr[o + 12] = x; arr[o + 13] = y; arr[o + 14] = z; arr[o + 15] = 1;
      }
      C.instanceMatrix.needsUpdate = true;
    }
    if (RS.gro) {
      var hwp = RS.run.w - 8;
      for (var k = 0; k < 3; k++) {
        var tau = t * 0.05 + k * 2.1, q = rsRunAt(75 + k * 85 + 22 * Math.sin(tau * 0.43 + k)), a = hwp * Math.sin(tau);
        rsGroPlace(k, q[0] + q[3] * a, q[1] - q[2] * a, q[3] * hwp * Math.cos(tau) + q[2] * 9.5 * Math.cos(tau * 0.43 + k), -q[2] * hwp * Math.cos(tau) + q[3] * 9.5 * Math.cos(tau * 0.43 + k));
      }
      RS.gro[0].instanceMatrix.needsUpdate = true; RS.gro[1].instanceMatrix.needsUpdate = true;
    }
    RS.torch.forEach(function (q, j) { var f = 0.78 + 0.22 * Math.sin(t * 13 + j * 2.1) * Math.sin(t * 7.7 + j); q[0][3] = q[1] * f; q[0][4] = q[2] * f; q[0][5] = q[3] * f; });
  }

  // bright panels for the environment bake: the chalets' lit fronts and the club's glass, so chrome and glass
  // reflect warm windows and the club's magenta
  function RESORT_ENV(ctx) {
    var T = ctx.THREE, g = new T.Group();
    RS.env.forEach(function (e) {
      var m = new T.Mesh(new T.PlaneGeometry(e[2], e[3]), new T.MeshBasicMaterial({ color: e[4] ? new T.Color(0.3, 0.05, 0.22) : new T.Color(0.2, 0.09, 0.03), side: T.DoubleSide }));
      m.position.set(e[0][0], e[1], e[0][1]); m.lookAt(0, e[1], 0); g.add(m);
    });
    return g;
  }

  /* ================================================================ party -- */
  //: AI Alps party: deck, DJ stage and light show, ice and champagne bars, lounges, festoons, VIP deck, ice arch.
  //: Generated: edit scripts/.scratch/alps/parts-src/party.js (readable, commented), then run
  //: python3 scripts/.scratch/alps/compact.py scripts/.scratch/alps/parts-src/party.js scripts/.scratch/alps/parts/party.js
  //: Gives PARTY_ASSETS, PARTY_MUSIC, PARTY_ENV(ctx), PARTY_DJ (Névé's head), SPOTS, ZONES, partyBuild, partyUpdate, partyFireworks(ctx), partyAmbient(ctx); uses the land's snowCover, LIGHTS_FOR_SNOW and site.js's LOWQ.
  var PARTY_ASSETS = ['texture-chalet-planks', 'model-lounge-chair', 'model-coffee-table', 'model-bar-stool'];
  // the set plays from the DJ booth (music.source): full on the floor, falling away up the mountain, on through the scenes
  var PARTY_MUSIC = { track: 'music-funky-house', source: { at: SITE.booth, near: 12, far: 150, floor: 0.12, boost: 1.6, sub: 0.9, crowd: 0.7, keep: true } };
  var partyDY = SITE.terrace.y, partyST = partyDY + SITE.stage.top, partyVY = SITE.vip.y, partyZ0 = SITE.stage.z - SITE.stage.d / 2, partyState = { ready: false };
  // Névé, the DJ, on her riser behind the decks: [x, y, z] of her head, for the scenes' cameras to look at
  var PARTY_DJ = [0.1, partyST + 0.3 + 1.55, 24.58];

  /* ------------------------------------------------------------ layout -- */
  function partyBar(b, s) { return { x: b.x, z: b.z, z0: b.z - b.len / 2, z1: b.z + b.len / 2, front: b.x + s * 0.42, back: b.x - s * 3.35, top: partyDY + 1.14 }; }
  var partyIce = partyBar(SITE.iceBar, 1), partyChamp = partyBar(SITE.champBar, -1);
  var partyLounge = SITE.lounges.map(function (c) {
    var o = Math.atan2(SITE.dance.z - c[1], SITE.dance.x - c[0]);
    function at(k, r) { var a = o + 0.95 + k * 1.1; return { x: c[0] + Math.cos(a) * r, z: c[1] + Math.sin(a) * r, a: a }; }
    return { x: c[0], z: c[1], chairs: [0, 1, 2, 3, 4].map(function (k) { return at(k, 2.75); }), tables: [at(1.5, 2.85), at(3.7, 2.85)], heaters: [at(1.43, 4.6), at(2.56, 4.6)], lanterns: [at(0.55, 3.6), at(2.5, 4), at(4.9, 3.6)] };
  });
  var partyHeaters = [[-14.5, -7.5], [14.5, -7.5], [-23.6, -4.4], [-23.6, 12.6], [23.6, -4.4], [23.6, 12.6], [-17, 15.5], [17, 15.5]];
  partyLounge.forEach(function (L) { L.heaters.forEach(function (h) { partyHeaters.push([h.x, h.z]); }); });
  partyHeaters.push([44.6, 20.6]);   // the last stands on the VIP deck
  var partyVip = { x0: SITE.vip.x - SITE.vip.w / 2, x1: SITE.vip.x + SITE.vip.w / 2, z0: SITE.vip.z - SITE.vip.d / 2, z1: SITE.vip.z + SITE.vip.d / 2, rx0: SITE.vipRamp.x - SITE.vipRamp.half, rx1: SITE.vipRamp.x + SITE.vipRamp.half, table: [43.2, 24.4] };
  // festoon poles (none on the x = 0 sightline) and the spans between them: [a, b, sag]
  var partyPS = [[-32.4, -22.4], [-23, -22.4], [-9.4, -22.4], [9.4, -22.4], [23, -22.4], [32.4, -22.4]], partyPN = [[-32.4, 19.6], [-23, 19.6], [-13.2, 19.6], [13.2, 19.6], [23, 19.6], [30.2, 19.6]];
  var partyPW = [[-32.4, -11.5], [-32.4, 13.5]], partyPE = [[32.4, -11.5], [32.4, 13.5]], partyPoleH = 6.6;
  var partySpans = (function () {
    var S = partyPS, N = partyPN, W = partyPW, E = partyPE;
    return [[S[0], N[1]], [N[1], S[1]], [S[1], N[2]], [N[2], S[2]], [S[2], N[3]], [N[2], S[3]], [S[3], N[3]], [N[3], S[4]], [S[4], N[4]], [N[4], S[5]]].map(function (p) { return [p[0], p[1], 0.038]; })
      .concat([[S[0], S[1]], [S[1], S[2]], [S[2], S[3]], [S[3], S[4]], [S[4], S[5]], [S[0], W[0]], [W[0], W[1]], [W[1], N[0]], [N[0], N[1]], [N[1], N[2]], [N[3], N[4]], [N[4], N[5]], [S[5], E[0]], [E[0], E[1]], [E[1], N[5]]].map(function (p) { return [p[0], p[1], 0.05]; }));
  })();
  var partyFlags = [[-30.5, -25], [30.5, -25], [35.2, 6.4], [-25.4, -26.6], [-8.6, -25.6]], partySubs = [-8.6, 8.6];
  var partyTorches = (function () {   // pairs along the last 30 m of the path
    var P = SITE.path.slice().reverse(), out = [];
    [6, 12, 18, 24, 30].forEach(function (s) {
      for (var i = 0; i < P.length - 1; i++) {
        var a = P[i], b = P[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), dx = (b[0] - a[0]) / L, dz = (b[1] - a[1]) / L;
        if (s <= L) { out.push([a[0] + dx * s - dz * 2.2, a[1] + dz * s + dx * 2.2], [a[0] + dx * s + dz * 2.2, a[1] + dz * s - dx * 2.2]); break; }
        s -= L;
      }
    });
    return out;
  })();

  /* ------------------------------------- pick-ups and the crowd, for the runtime -- */
  // SPOTS stand on bar tops, lounge tables, the subs before the stage, heater ledges and the VIP table; yaw in radians
  var SPOTS = (function () {
    var s = [], I = partyIce, C = partyChamp, V = partyVip.table, DY = partyDY, Y = partyVY + 0.41;
    function add(x, z, y, kind, yaw) { s.push({ x: +x.toFixed(2), z: +z.toFixed(2), y: +y.toFixed(3), kind: kind, stand: true, yaw: +(yaw || 0).toFixed(2) }); }
    [0.6, 2.4, 4.4, 6.6, 8.6, 10.4].forEach(function (d, i) { add(I.front - 0.32, I.z0 + d, I.top, i % 3 === 1 ? 'glass' : 'bottle', PI / 2); add(C.front + 0.32, C.z0 + d, C.top, i === 2 ? 'bucket' : i === 4 ? 'magnum' : i % 2 ? 'glass' : 'bottle', -PI / 2); });
    partyLounge.forEach(function (L) { L.tables.forEach(function (t, j) { add(t.x, t.z, DY + 0.49, j ? 'glass' : 'bottle', t.a); }); });
    partySubs.forEach(function (x, i) { add(x - 0.3, partyZ0 - 0.7, DY + 1.1, i ? 'glass' : 'bottle', PI); add(x + 0.3, partyZ0 - 0.7, DY + 1.1, i ? 'bottle' : 'glass', PI); });
    partyHeaters.slice(0, 6).forEach(function (h, i) { add(h[0] + 0.14, h[1], DY + 1.095, i % 3 ? 'glass' : 'bottle', 0); });
    add(V[0] - 0.25, V[1] - 0.4, Y, 'magnum', 0.4); add(V[0] + 0.25, V[1] + 0.3, Y, 'bucket', 0); add(V[0] + 0.1, V[1] + 0.75, Y, 'glass', 0);
    return s;
  })();
  // ZONES: the crowd's places, as open.civilians.zones reads them ({ x, z, r, count, stance, face }; at most 16, filled in
  // order up to the crowd's count). (assembly, 5 Oct: the runtime places a zone's people at random in its disc, keeps them
  // out of colliders (0.45 m) and off closed metre cells, and reads no strip or seats, so:)
  // - leanBar: one small zone per leaner, its middle just inside the bar front, so the only free ground is the sliver
  //   along the front (feet 0.5 to 0.65 m from the bar's edge) or, failing that, the middle, from which the bar's collider
  //   pushes them out to 0.36 m; facing straight across the bar. The champagne bar's between its stools.
  // - sitTalk: no seats in the runtime (a person cannot stand inside a chair's collider, and a zone gives no seat height),
  //   so nobody sits: the lounges are people standing at the fire pits, by the crowd's stances.
  // (apply pass, 5 Oct: on phones and slow devices (LOWQ, site.js) the crowd is 14, not 22, and the floor takes 5 + 1 + 1
  // of them, so the bar leaners and the VIP pair are still there; the VIP pair stands in the deck's north-east corner,
  // clear of Vasseur's marks and of the cameras that film him)
  var ZONES = (function () {
    var I = partyIce, C = partyChamp, Z = [
      { x: 0, z: 5, r: 7.5, count: LOWQ ? 5 : 8, stance: 'dance', face: [0, 25] }, { x: -6.5, z: 13.5, r: 4, count: LOWQ ? 1 : 2, stance: 'dance', face: [0, 25] }, { x: 6.5, z: 13.5, r: 4, count: LOWQ ? 1 : 2, stance: 'dance', face: [0, 25] }];
    [1.9, 4.0, 8.0].forEach(function (z) { Z.push({ x: I.front + 0.08 + 0.15, z: z, r: 0.5, count: 1, stance: 'leanBar', face: [I.x - 60, z] }); });
    [2.16, 5.84].forEach(function (z) { Z.push({ x: C.front - 0.12 - 0.11, z: z, r: 0.5, count: 1, stance: 'leanBar', face: [C.x + 60, z] }); });
    Z.push({ x: 40.2, z: 27.6, r: 0.8, count: 2, stance: 'talk', face: [0, 10] });
    partyLounge.forEach(function (L) { Z.push({ x: L.x, z: L.z, r: 3.4, count: 1, face: [L.x, L.z] }); });
    return Z;
  })();
  // the light baked on the deck: [x, z, colour, strength, radius]
  var partyLamps = (function () {
    var L = [], I = partyIce, C = partyChamp;
    function add(x, z, c, k, r) { L.push([x, z, c, k, r]); }
    partyLounge.forEach(function (lo) { add(lo.x, lo.z, '#FF8A3A', 1.4, 4.6); lo.lanterns.forEach(function (l) { add(l.x, l.z, '#FFB060', 0.35, 1.2); }); });
    partyHeaters.forEach(function (h) { add(h[0], h[1], '#FF6A26', 1.0, 2.2); });
    [I.z0 + 1.5, I.z, I.z1 - 1.5].forEach(function (z) { add(I.front + 0.9, z, '#1EA8FF', 1.3, 2.6); }); add(I.back + 1.5, I.z, '#1EA8FF', 1.0, 3);
    [[C.z, 1.5, 5.5], [C.z0 + 1.5, 0.7, 3.5], [C.z1 - 1.5, 0.7, 3.5]].forEach(function (q) { add(C.front - 0.8, q[0], '#FFB266', q[1], q[2]); });
    add(0, 18.5, '#9A5AFF', 0.5, 7); add(-7, 18.5, '#26D8FF', 0.3, 5); add(7, 18.5, '#FF3AD0', 0.3, 5); add(SITE.vip.x, SITE.vip.z, '#FFB060', 0.6, 5);
    partySpans.forEach(function (s) { var a = s[0], b = s[1], n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 2.4); for (var k = 1; k < n; k++) add(lerp(a[0], b[0], k / n), lerp(a[1], b[1], k / n), '#FFB060', 0.2, 2.6); });
    return L;
  })();
  // the stronger lamps as pools for the land's snow and flakes (no beams: its pools have no cone, and the party lights its own flakes)
  function partySnowLights() {
    if (typeof LIGHTS_FOR_SNOW === 'undefined' || !LIGHTS_FOR_SNOW || !LIGHTS_FOR_SNOW.push) return;
    partyLamps.concat(partyTorches.map(function (t) { return [t[0], t[1], '#FF8A3A', 0.6, 3, H(t[0], t[1]) + 2]; }), [[-16, -23.4, '#6FD8FF', 0.7, 4]]).forEach(function (l) {
      if (l[3] >= 0.5) LIGHTS_FOR_SNOW.push({ x: l[0], y: l[5] || (l[0] > 32 && l[1] > 18 ? partyVY : partyDY) + 1.2, z: l[1], c: l[2], p: l[3] * 2.2, r: l[4] * 1.3 });
    });
  }

  /* ----------------------------------------------------------- helpers -- */
  function partyCol(hex, k) { var c = new THREE.Color(hex); k = k == null ? 1 : k; return [c.r * k, c.g * k, c.b * k]; }
  function partyPut(g, x, y, z, ry, rx, rz) { if (rx) g.rotateX(rx); if (rz) g.rotateZ(rz); if (ry) g.rotateY(ry); return g.translate(x || 0, y || 0, z || 0); }
  function partyBox(w, h, d, x, y, z, ry, rx, rz) { return partyPut(new THREE.BoxGeometry(w, h, d), x, y, z, ry, rx, rz); }
  function partyCyl(r0, r1, h, seg, x, y, z, ry, rx, rz, open) { return partyPut(new THREE.CylinderGeometry(r0, r1, h, seg || 12, 1, !!open), x, y, z, ry, rx, rz); }
  function partyRBox(w, h, d, r, seg) {
    var g = new THREE.BoxGeometry(w, h, d, seg, seg, seg), p = g.attributes.position, n = g.attributes.normal, v = new THREE.Vector3(), c = new THREE.Vector3();
    for (var i = 0; i < p.count; i++) {
      v.set(p.getX(i), p.getY(i), p.getZ(i)); c.set(clamp(v.x, r - w / 2, w / 2 - r), clamp(v.y, r - h / 2, h / 2 - r), clamp(v.z, r - d / 2, d / 2 - r));
      var e = v.sub(c); if (e.lengthSq() < 1e-9) e.set(n.getX(i), n.getY(i), n.getZ(i)); e.normalize();
      p.setXYZ(i, c.x + e.x * r, c.y + e.y * r, c.z + e.z * r); n.setXYZ(i, e.x, e.y, e.z);
    }
    return g;
  }
  function partyGeo(P, I, U) { var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); if (U) g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setIndex(I); g.computeVertexNormals(); return g; }
  function partyTint(g, f) { var p = g.attributes.position, c = new Float32Array(p.count * 3); for (var i = 0; i < p.count; i++) c.set(f(p.getX(i), p.getY(i), p.getZ(i), i), i * 3); g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g; }   // vertex colours
  function partyAdd(key, g, c, ch) { var B = partyState.B; (B[key] || (B[key] = [])).push({ g: g, c: c, ch: ch || 0 }); return g; }
  function partyMerge(items) {   // one geometry from many, with colour (item colour x vertex colour) and a pulse channel
    var nv = 0, ni = 0, i, k;
    items.forEach(function (it) { var g = it.g; nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; });
    var P = new Float32Array(nv * 3), N = new Float32Array(nv * 3), U = new Float32Array(nv * 2), C = new Float32Array(nv * 3), Hc = new Float32Array(nv), I = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni), vo = 0, io = 0;
    for (i = 0; i < items.length; i++) {
      var it = items[i], g = it.g, p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv, gc = g.attributes.color, c = it.c || [1, 1, 1], cnt = p.count;
      for (k = 0; k < cnt; k++) {
        var o = vo + k;
        P[o * 3] = p.getX(k); P[o * 3 + 1] = p.getY(k); P[o * 3 + 2] = p.getZ(k);
        if (n) { N[o * 3] = n.getX(k); N[o * 3 + 1] = n.getY(k); N[o * 3 + 2] = n.getZ(k); } else N[o * 3 + 1] = 1;
        if (u) { U[o * 2] = u.getX(k); U[o * 2 + 1] = u.getY(k); }
        C[o * 3] = c[0] * (gc ? gc.getX(k) : 1); C[o * 3 + 1] = c[1] * (gc ? gc.getY(k) : 1); C[o * 3 + 2] = c[2] * (gc ? gc.getZ(k) : 1); Hc[o] = it.ch || 0;
      }
      if (g.index) for (k = 0; k < g.index.count; k++) I[io++] = g.index.getX(k) + vo; else for (k = 0; k < cnt; k++) I[io++] = vo + k;
      vo += cnt;
    }
    var out = new THREE.BufferGeometry(), BA = THREE.BufferAttribute;
    out.setAttribute('position', new BA(P, 3)); out.setAttribute('normal', new BA(N, 3)); out.setAttribute('uv', new BA(U, 2)); out.setAttribute('color', new BA(C, 3)); out.setAttribute('chan', new BA(Hc, 1));
    out.setIndex(new BA(I, 1)); out.computeBoundingSphere();
    return out;
  }
  function partyFlush(ctx, key, mat, shadow) {
    var list = partyState.B[key]; if (!list || !list.length) return null;
    var m = new THREE.Mesh(partyMerge(list), mat); m.castShadow = !!shadow; m.receiveShadow = true; m.matrixAutoUpdate = false; m.updateMatrix();
    ctx.scene.add(m); partyState.B[key] = []; return m;
  }
  function partySolid(ctx, x0, x1, z0, z1, y0, y1) { ctx.solid({ min: { x: Math.min(x0, x1), y: y0, z: Math.min(z0, z1) }, max: { x: Math.max(x0, x1), y: y1, z: Math.max(z0, z1) } }); }
  function partyRing(ctx, x, z, r) { ctx.solid({ x: x, z: z, r: r }); }
  function partyNoShadow(o) { o.traverse(function (m) { m.castShadow = false; }); return o; }
  function partyInst(ctx, geo, mat, n, order) { var m = new THREE.InstancedMesh(geo, mat, n); m.frustumCulled = false; m.userData.noReflection = true; m.renderOrder = order || 0; ctx.scene.add(m); return m; }
  function partyGrG(w, h) { var g = new THREE.PlaneGeometry(w, h), uv = g.attributes.uv; for (var i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / 0.24, uv.getY(i) * h / 0.24); return g; }   // a speaker grille
  var partyGLSL = 'float pH(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}\n' +
    'float pN(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(pH(i),pH(i+vec2(1.0,0.0)),f.x),mix(pH(i+vec2(0.0,1.0)),pH(i+vec2(1.0,1.0)),f.x),f.y);}\n' +
    'float pF(vec2 p){float a=0.5,s=0.0;for(int i=0;i<4;i++){s+=a*pN(p);p=p*2.03+17.1;a*=0.5;}return s;}\n' +
    'float pN3(vec3 p){return mix(pN(p.xy+p.z*1.7),pN(p.yx*1.3+3.1+floor(p.z)*7.3),fract(p.z));}\n' +
    // where people walk (the dance floor, the bar fronts, the path from the steps), and where that is wet
    'float pTr(vec2 q){float t=max(smoothstep(14.5,8.5,length((q-vec2(0.0,7.0))*vec2(0.82,1.0))),smoothstep(2.8,1.0,abs(abs(q.x)-24.6))*smoothstep(8.5,6.5,abs(q.y-4.0)));' +
    'vec2 a=q-vec2(-16.0,-23.0),b=vec2(10.0,22.0);return max(t,smoothstep(2.6,0.8,length(a-b*clamp(dot(a,b)/dot(b,b),0.0,1.0))));}\n' +
    'float pWet(vec2 q){return pTr(q)*smoothstep(0.3,0.6,pF(q*vec2(0.2,0.45)+4.0));}\n';
  var partyMV = 'vec4 mvPosition=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*mvPosition;', partyWV = 'vec4 mvPosition=viewMatrix*wp;gl_Position=projectionMatrix*mvPosition;';
  function partyShader(o) {
    var U = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {}]);
    for (var k in o.uniforms) U[k] = o.uniforms[k];
    return new THREE.ShaderMaterial({
      uniforms: U, fog: !o.additive, transparent: !!o.additive, depthWrite: !o.additive, side: o.side || THREE.FrontSide, blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending, vertexColors: !!o.vertexColors,
      vertexShader: '#include <common>\n#include <fog_pars_vertex>\n' + (o.vhead || '') + '\nvoid main() {\n' + o.vmain + '\n#include <fog_vertex>\n}',
      fragmentShader: '#include <common>\n#include <fog_pars_fragment>\n' + partyGLSL + (o.fhead || '') + '\nvoid main() {\n' + o.fmain + '\n#include <fog_fragment>\n}',
    });
  }

  /* --------------------------------------------------------- materials -- */
  function partyMaterials(ctx) {
    var M = {}, AS = ctx.assets, S = partyState, LM = S.lm, T = THREE;
    function chain(mat, key, fn) { var prev = mat.onBeforeCompile; mat.onBeforeCompile = function (sh, r) { if (prev) prev.call(this, sh, r); fn(sh); }; mat.customProgramCacheKey = function () { return key; }; return mat; }
    function std(o) { return new T.MeshStandardMaterial(Object.assign({ color: '#FFFFFF', vertexColors: true }, o)); }
    // the deck: weathered grey larch, frosted where nobody walks and wet where they do, a crisp band of snow along its
    // edges and thin lines of it in the board gaps (the scan has 14 boards a 1.75 m tile), the baked lamps, and the
    // moving heads' gobos sweeping the boards
    M.deck = AS.surface('texture-chalet-planks', { size: 1.75, variety: false, roughness: 0.85, normal: 1.1, mottle: 0.1 }) || std({ color: '#4A4440', roughness: 0.85, vertexColors: false });
    chain(M.deck, 'party-deck', function (sh) {
      Object.assign(sh.uniforms, S.bu, { uPLm: { value: LM.tex }, uPLmBox: { value: new T.Vector4(LM.x0, LM.z0, 1 / LM.w, 1 / LM.d) }, uPMoon: { value: new T.Vector3(0.476, 0.438, -0.762) } });
      sh.vertexShader = 'varying vec3 vPW;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\nvPW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('void main() {', 'varying vec3 vPW;uniform sampler2D uPLm;uniform vec4 uPLmBox;uniform vec3 uPMoon;uniform float uTime;' + S.BU + '\n' + partyGLSL +
        'vec3 partyLm(){float b=(vPW.x>32.0&&vPW.z>18.0)?' + partyVY.toFixed(2) + ':' + partyDY.toFixed(2) + ';return texture2D(uPLm,(vPW.xz-uPLmBox.xy)*uPLmBox.zw).rgb*4.0*smoothstep(b+2.6,b+0.6,vPW.y);}\nvoid main() {')
        .replace('#include <metalnessmap_fragment>', ['vec2 pq=vPW.xz;',
          'float pE=max(max(min(min(pq.x+33.0,33.0-pq.x),min(pq.y+23.0,20.4-pq.y)),min(min(pq.x-32.5,47.5-pq.x),min(pq.y-18.5,29.5-pq.y))),min(min(pq.x-33.8,38.2-pq.x),min(pq.y-6.2,18.6-pq.y))+0.6);',
          'float pT=pTr(pq),pU=1.0-pT,pL=dot(diffuseColor.rgb,vec3(0.3,0.59,0.11));',
          'diffuseColor.rgb=mix(vec3(pL),diffuseColor.rgb,0.42)*vec3(1.05,1.0,0.94)*2.5;',
          'float pSn=smoothstep(0.62,0.28,pE+(pN(pq*2.3)-0.5)*0.4)*(1.0-pT*0.5);',
          'pSn=max(pSn,smoothstep(0.11,0.03,abs(fract(pq.y*8.0-0.02)-0.5))*smoothstep(0.05,0.026,pL)*pU*(0.3+0.7*smoothstep(7.0,0.5,pE))*smoothstep(0.3,0.62,pN(pq*vec2(0.5,1.3)+3.0))*0.9);',
          'float pWt=pWet(pq)*(1.0-pSn);',
          'diffuseColor.rgb=mix(mix(diffuseColor.rgb,vec3(0.42,0.46,0.52),0.16*pU)*(1.0-pWt*0.45),vec3(0.8,0.85,0.93),pSn);',
          'roughnessFactor=mix(mix(roughnessFactor,0.16,pWt*0.9),0.7,pSn);',
          '#ifdef GM_SURF', 'gmS.n*=1.0-pSn*0.8;', '#endif', '#include <metalnessmap_fragment>'].join('\n'))
        .replace('#include <emissivemap_fragment>', ['#include <emissivemap_fragment>',
          '{float ph=pH(floor(vPW.xz*46.0)+floor(cameraPosition.xz*1.7)*0.37),pd=length(vPW-cameraPosition);vec3 pV=normalize(vViewPosition),pLv=normalize((viewMatrix*vec4(uPMoon,0.0)).xyz);',
          ' float pg=step(0.995,ph)*pow(max(dot(normal,normalize(pV+pLv)),0.0),5.0)*smoothstep(16.0,2.0,pd)*max(pSn,0.05*pU);',
          ' totalEmissiveRadiance+=vec3(0.85,0.92,1.0)*pg*2.6+partyLm()*step(0.993,ph)*smoothstep(12.0,1.5,pd)*pSn*2.0;}'].join('\n'))
        .replace('#include <aomap_fragment>', ['reflectedLight.indirectDiffuse+=diffuseColor.rgb*partyLm();',
          '{vec3 pGo=vec3(0.0);for(int i=0;i<' + S.NB + ';i++){vec3 d=vPW-uBO[i];float a=dot(d,uBD[i]);if(a<1.0)continue;vec3 e=d-uBD[i]*a;float r=length(e)/(0.15+a*0.07);if(r>1.0)continue;',
          ' pGo+=uBC[i]*smoothstep(1.0,0.82,r)*(0.55+0.45*smoothstep(-0.3,0.3,sin(atan(e.z,e.x)*5.0+r*7.0+uTime*0.9+float(i))))*(1.0+2.0*exp(-r*r*8.0))/(1.0+a*0.05);}',
          ' reflectedLight.directDiffuse+=diffuseColor.rgb*pGo*5.0;reflectedLight.directSpecular+=pGo*pWt*0.5;}', '#include <aomap_fragment>'].join('\n'));
    });
    M.snow = (typeof snowCover === 'function' && snowCover(ctx, { project: 'ground' })) || AS.surface('texture-snow', { size: 2.2, color: '#EEF2F8', roughness: 0.9, normal: 0.8 }) || std({ color: '#E6ECF5', roughness: 0.85, vertexColors: false });
    M.wood = AS.surface('texture-chalet-planks', { project: 'box', size: 1.4, variety: false, roughness: 0.88 }) || std({ color: '#4A3A30', roughness: 0.85, vertexColors: false });
    M.wood.vertexColors = true; M.wood.color.setRGB(1.75, 1.6, 1.45);
    if (typeof snowCover === 'function') snowCover(M.wood, { amount: 0.9, edge: 0.6, pools: 0 });
    M.stone = AS.surface('texture-stone-wall', { project: 'box', size: 2.2, color: '#A09A94', roughness: 0.95 }) || std({ color: '#4C4A48', roughness: 0.9, vertexColors: false });
    M.stone.vertexColors = true; M.stone.color.multiplyScalar(1.5);
    M.metal = std({ metalness: 0.55, roughness: 0.42 }); M.chrome = std({ metalness: 1, roughness: 0.2, envMapIntensity: 1.4 }); M.fabric = std({ roughness: 0.94, envMapIntensity: 0.6 });
    M.glass = new T.MeshPhysicalMaterial({ color: '#DDEEFF', roughness: 0.04, transparent: true, opacity: 0.16, depthWrite: false, envMapIntensity: 2, side: T.DoubleSide });
    M.grille = std({ map: ctx.textures.canvas(128, 128, function (g, w) { g.fillStyle = '#2A2B2F'; g.fillRect(0, 0, w, w); g.fillStyle = '#050506'; for (var i = 0; i < 256; i++) { g.beginPath(); g.arc((i % 16) * 8 + 4 + (i >> 4) % 2 * 4, (i >> 4) * 8 + 4, 2.7, 0, TAU); g.fill(); } }), metalness: 0.4, roughness: 0.55 });
    M.truss = new T.MeshStandardMaterial({ map: ctx.textures.canvas(128, 128, function (g, w, h) { g.strokeStyle = '#fff'; g.lineWidth = 7; g.lineCap = 'round'; g.beginPath(); g.moveTo(6, 0); g.lineTo(w - 6, h / 2); g.lineTo(6, h); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke(); }), color: '#B8BCC2', metalness: 0.85, roughness: 0.35, alphaTest: 0.5, side: T.DoubleSide });
    S.pulse = new T.Vector4(1, 1, 1, 1);
    M.glow = chain(new T.MeshBasicMaterial({ color: '#FFFFFF', vertexColors: true }), 'party-glow', function (sh) {   // chan 1-3 pulse with the kick, breathe, flicker
      sh.uniforms.uPulse = { value: S.pulse };
      sh.vertexShader = 'attribute float chan;uniform vec4 uPulse;\n' + sh.vertexShader.replace('#include <color_vertex>', '#include <color_vertex>\nvColor *= chan < 0.5 ? 1.0 : chan < 1.5 ? uPulse.x : chan < 2.5 ? uPulse.y : uPulse.z;');
    });
    // bottles: the glass takes the instance's tint and glows with the light behind it; foil and label keep theirs
    M.bottle = chain(std({ roughness: 0.12, metalness: 0.1, envMapIntensity: 1.6 }), 'party-bottle', function (sh) {
      sh.vertexShader = 'varying float vGl;\n' + sh.vertexShader.replace('#include <color_vertex>', '#include <color_vertex>\nvGl=0.0;\n#ifdef USE_INSTANCING_COLOR\nvGl=step(dot(color,vec3(1.0)),0.01);vColor=mix(color,instanceColor,vGl);\n#endif');
      sh.fragmentShader = 'varying float vGl;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance+=vColor*vGl*0.7;');
    });
    return M;
  }
  function partyLightmap() {
    var x0 = -58, z0 = -36, w = 116, d = 80, W = w * 2, Dd = d * 2, acc = new Float32Array(W * Dd * 3), data = new Uint8Array(W * Dd * 4);
    partyLamps.forEach(function (l) {
      var c = new THREE.Color(l[2]), R = l[4] * 2.2;
      for (var j = Math.max(0, Math.floor((l[1] - R - z0) * 2)); j <= Math.min(Dd - 1, Math.ceil((l[1] + R - z0) * 2)); j++)
        for (var i = Math.max(0, Math.floor((l[0] - R - x0) * 2)); i <= Math.min(W - 1, Math.ceil((l[0] + R - x0) * 2)); i++) {
          var dx = (i + 0.5) / 2 + x0 - l[0], dz = (j + 0.5) / 2 + z0 - l[1], k = l[3] * Math.exp(-(dx * dx + dz * dz) / (l[4] * l[4]) * 1.6), o = (j * W + i) * 3;
          acc[o] += c.r * k; acc[o + 1] += c.g * k; acc[o + 2] += c.b * k;
        }
    });
    for (var n = 0; n < W * Dd * 4; n++) data[n] = n % 4 === 3 ? 255 : Math.min(255, Math.round(acc[(n >> 2) * 3 + n % 4] / 4 * 255));
    var tex = new THREE.DataTexture(data, W, Dd, THREE.RGBAFormat, THREE.UnsignedByteType);
    tex.magFilter = tex.minFilter = THREE.LinearFilter; tex.colorSpace = THREE.NoColorSpace; tex.needsUpdate = true;
    return { tex: tex, x0: x0, z0: z0, w: w, d: d };
  }

  /* ---------------------------------------------- neon signs, one atlas -- */
  function partyAtlas(ctx) {
    return ctx.textures.canvas(2048, 1024, function (g, w, h) {
      g.fillStyle = '#000'; g.fillRect(0, 0, w, h); g.globalCompositeOperation = 'lighter'; g.lineJoin = g.lineCap = 'round';
      function tube(draw, glow, core) { [['rgb(255,0,0)', glow, 1.6, 2], ['rgb(0,255,0)', core, 1.2, 1]].forEach(function (L) { g.save(); g.strokeStyle = g.shadowColor = L[0]; g.lineWidth = L[1]; g.shadowBlur = L[1] * L[2]; for (var i = 0; i < L[3]; i++) draw(); g.restore(); }); }
      function words(s, x, y, size, track, weight) { return function () { g.font = (weight || 600) + ' ' + size + 'px "Helvetica Neue", Helvetica, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; try { g.letterSpacing = track + 'px'; } catch (e) { void e; } g.strokeText(s, x, y); }; }
      function peak(cx, cy, s) {
        return function () {
          function path(pts, close) { g.beginPath(); pts.forEach(function (p, i) { g[i ? 'lineTo' : 'moveTo'](cx + p[0] * s, cy + p[1] * s); }); if (close) g.closePath(); g.stroke(); }
          path([[-1.25, 0.55], [-0.45, -0.35], [-0.18, -0.05], [0.25, -0.75], [1.25, 0.55]], true); path([[0.02, -0.38], [0.25, -0.2], [0.48, -0.38]]);
          g.beginPath(); g.arc(cx + 0.95 * s, cy - 0.85 * s, 0.11 * s, 0, TAU); g.stroke();
        };
      }
      tube(words('LE SOMMET', 1024, 128, 170, 26), 16, 6); tube(peak(300, 400, 110), 14, 5); tube(words('VIP', 960, 384, 160, 30), 14, 5); tube(words('NUIT BLANCHE', 1620, 384, 72, 12, 500), 9, 4);
      tube(words('BAR À GLACE', 1024, 640, 150, 22), 14, 5); tube(words('CHAMPAGNE', 1024, 896, 150, 24), 14, 5);
    }, { linear: true });
  }
  var partyReg = { name: [0.08, 0.76, 0.92, 0.99], peak: [0.05, 0.53, 0.25, 0.73], vip: [0.36, 0.53, 0.58, 0.73], nuit: [0.6, 0.55, 0.97, 0.71], ice: [0.14, 0.27, 0.86, 0.48], champ: [0.18, 0.02, 0.82, 0.23] };
  function partySignMat(atlas) {
    return partyShader({ uniforms: { uAtlas: { value: atlas }, uPulse: { value: partyState.pulse } }, additive: true, vertexColors: true,
      vhead: 'attribute float chan;uniform vec4 uPulse;varying vec2 vUv;varying vec3 vC;', vmain: 'vUv=uv;vC=color*(chan<0.5?1.0:chan<1.5?uPulse.x:uPulse.y);' + partyMV,
      fhead: 'uniform sampler2D uAtlas;varying vec2 vUv;varying vec3 vC;', fmain: 'vec4 s=texture2D(uAtlas,vUv);gl_FragColor=vec4(vC*s.r*0.55+mix(vC,vec3(dot(vC,vec3(0.33)))*1.4,0.55)*s.g*1.5,1.0);' });
  }
  function partySign(w, h, reg, x, y, z, ry, tint, ch) {   // one face, turned by ry to the reader (a plane faces +z)
    var g = new THREE.PlaneGeometry(w, h), uv = g.attributes.uv;
    for (var i = 0; i < uv.count; i++) uv.setXY(i, lerp(reg[0], reg[2], uv.getX(i)), lerp(reg[1], reg[3], uv.getY(i)));
    partyAdd('sign', partyPut(g, x, y, z, ry), tint, ch);
  }

  /* ------------------------------------------------------- snow shapes -- */
  function partyDrift(pts, w, h, seed, onto) {   // a ridge of snow along a line (onto: a raised floor)
    var R = rng(seed || 7), P = [], I = [], NS = 7, rows = 0, ph0 = R() * 9, ph1 = R() * 9;
    for (var s = 0; s < pts.length - 1; s++) {
      var a = pts[s], b = pts[s + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(2, Math.ceil(L / 0.45)), tx = (b[0] - a[0]) / L, tz = (b[1] - a[1]) / L;
      for (var k = (s ? 1 : 0); k <= n; k++, rows++) {
        var u = k / n, x = lerp(a[0], b[0], u), z = lerp(a[1], b[1], u), along = (s + u) / (pts.length - 1), dd = (s + u) * L;
        var wob = 0.5 + 0.25 * Math.sin(dd * 0.7 + ph0) + 0.25 * Math.sin(dd * 0.23 + ph1), end = smooth(Math.min(along, 1 - along) * (pts.length - 1) * L / 2.2);
        var hh = h * (0.6 + 0.7 * wob) * (0.35 + 0.65 * end), ww = w * (0.8 + 0.4 * wob) * (0.5 + 0.5 * end);
        for (var c = 0; c <= NS; c++) { var q = c / NS * 2 - 1, px = x - tz * q * ww / 2, pz = z + tx * q * ww / 2; P.push(px, (onto ? Math.max(H(px, pz), onto) : H(px, pz)) + hh * Math.pow(Math.max(0, 1 - q * q), 1.4) - 0.05, pz); }
      }
    }
    for (var r = 0; r < rows - 1; r++) for (var c2 = 0; c2 < NS; c2++) { var i0 = r * (NS + 1) + c2; I.push(i0, i0 + NS + 1, i0 + 1, i0 + 1, i0 + NS + 1, i0 + NS + 2); }
    return partyGeo(P, I);
  }
  function partyMound(x, z, r, h, base) {
    var P = [], I = [], R = rng(Math.floor(x * 13 + z * 7) + 99);
    for (var i = 0; i <= 4; i++) for (var j = 0; j < 12; j++) { var rr = r * i / 4 * (0.85 + 0.3 * R()), a = j / 12 * TAU, px = x + Math.cos(a) * rr, pz = z + Math.sin(a) * rr; P.push(px, (base == null ? H(px, pz) : base) + (i === 4 ? 0 : h * Math.pow(1 - i / 4, 1.2)) - 0.03, pz); }
    for (var i2 = 0; i2 < 48; i2++) { var b0 = i2 - i2 % 12 + (i2 + 1) % 12; I.push(i2, b0, i2 + 12, b0, b0 + 12, i2 + 12); }
    return partyGeo(P, I);
  }
  function partySnowCap(w, d, h, x, y, z, ry, seed) {
    var N = 10, M = Math.max(4, Math.round(N * d / w)), P = [], I = [], R = rng(seed || 3);
    for (var j = 0; j <= M; j++) for (var i = 0; i <= N; i++) { var u = i / N * 2 - 1, v = j / M * 2 - 1, m = Math.pow(Math.pow(Math.abs(u), 6) + Math.pow(Math.abs(v), 6), 1 / 6); P.push(u * (w / 2 + 0.04), Math.sqrt(Math.max(0, 1 - Math.pow(Math.min(m, 1), 5))) * (0.85 + 0.25 * R()) * h - 0.01, v * (d / 2 + 0.04)); }
    for (var j2 = 0; j2 < M; j2++) for (var i2 = 0; i2 < N; i2++) { var a = j2 * (N + 1) + i2; I.push(a, a + N + 1, a + 1, a + 1, a + N + 1, a + N + 2); }
    return partyPut(partyGeo(P, I), x, y, z, ry);
  }

  /* ---------------------------------------------------------- the deck -- */
  function partyGrid(x0, x1, z0, z1, step, flat) {
    var nx = Math.max(1, Math.round((x1 - x0) / step)), nz = Math.max(1, Math.round((z1 - z0) / step)), P = [], I = [], U = [];
    for (var j = 0; j <= nz; j++) for (var i = 0; i <= nx; i++) { var x = x0 + (x1 - x0) * i / nx, z = z0 + (z1 - z0) * j / nz; P.push(x, (flat == null ? H(x, z) : flat) + 0.035, z); U.push(x, z); }
    for (var j2 = 0; j2 < nz; j2++) for (var i2 = 0; i2 < nx; i2++) { var a = j2 * (nx + 1) + i2; I.push(a, a + nx + 1, a + 1, a + 1, a + nx + 1, a + nx + 2); }
    return { g: partyGeo(P, I, U) };
  }
  function partyDeck(ctx) {
    var T = THREE, V = partyVip, R = SITE.vipRamp, A = partyAdd, C = partyCol, B = partyBox, Y = partyCyl, DY = partyDY, VY = partyVY, e = 0.15;
    var dm = new T.Mesh(partyMerge([partyGrid(-33, 33, -23, 23, 1.5, DY), partyGrid(33, V.rx1, 6.2, R.z0, 0.6), partyGrid(V.rx0, V.rx1, R.z0, R.z1, 0.5), partyGrid(V.x0, V.x1, V.z0, V.z1, 1.5)]), partyState.M.deck);
    dm.receiveShadow = true; ctx.scene.add(dm);
    [[66.3, 0.16, 0, -23.08], [0.16, 46.2, -33.08, 0], [0.16, 29.2, 33.08, -8.4], [0.16, 4.4, 33.08, 20.8]].forEach(function (t) { A('wood', B(t[0], 0.09, t[1], t[2], DY + 0.03, t[3]), C('#A89888')); });
    A('wood', B(66.3, 0.5, 0.14, 0, DY - 0.22, -23.12), C('#988878'));
    for (var s = 0; s < 3; s++) A('wood', B(6, 0.12, 0.42, -16, DY - 0.1 - s * 0.16, -23.4 - s * 0.42), C('#B8A898'));
    [V.rx0, V.rx1].forEach(function (x, i) {   // the ramp's timber sides, down into the snow
      var P = [], I = [];
      for (var k = 0; k <= 10; k++) { var z = lerp(R.z0, R.z1, k / 10), top = H(x + (i ? -0.05 : 0.05), z); P.push(x, top + 0.04, z, x, Math.min(top, DY) - 0.6, z); if (k < 10) I.push.apply(I, i ? [k * 2, k * 2 + 1, k * 2 + 2, k * 2 + 2, k * 2 + 1, k * 2 + 3] : [k * 2, k * 2 + 2, k * 2 + 1, k * 2 + 1, k * 2 + 2, k * 2 + 3]); }
      A('wood', partyGeo(P, I), C('#C0B0A0'));
    });
    [[V.x1 - V.x0 + 0.4, 0.4, SITE.vip.x, V.z0 - 0.2], [0.4, V.z1 - V.z0 + 0.4, V.x1 + 0.2, SITE.vip.z], [0.4, V.z1 - V.z0 + 0.4, V.x0 - 0.2, SITE.vip.z], [V.x1 - V.x0 + 0.4, 0.4, SITE.vip.x, V.z1 + 0.2]].forEach(function (k) { A('stone', B(k[0], 0.7, k[1], k[2], VY - 0.3, k[3]), C('#8E8984')); });
    [[[-33.6, -14], [-33.7, -23.8], [-25, -23.9], [-21.2, -23.8]], [[-10.8, -23.8], [0, -23.9], [14, -23.8], [33.7, -23.8], [33.7, -10], [33.6, 5.8]], [[-33.6, -12], [-33.7, 2], [-33.6, 22.6]], [[33.6, 9], [33.7, 15.6]]].forEach(function (p, i) { A('snow', partyDrift(p, 1.9, 0.55, 11 + i)); });
    A('snow', partyDrift([[-10.4, 20.25], [10.4, 20.25]], 0.9, 0.32, 21, DY)); A('snow', partyDrift([[-31.6, -1.8], [-31.6, 10.2]], 1.0, 0.4, 23, DY)); A('snow', partyDrift([[31.5, -2.6], [31.5, 10.6]], 0.9, 0.35, 25, DY));
    A('snow', partyDrift([[V.x0 - 0.5, V.z1 + 0.6], [V.x1 + 0.6, V.z1 + 0.6], [V.x1 + 0.6, V.z0 - 0.5]], 1.4, 0.7, 27));
    // (apply pass, 5 Oct: each collider reaches 0.6 m out on its outer side (ox, oz), 0.12 m in: 0.24 m thick, the walking
    // map's metre cells never saw the glass, and crew were routed into the ramp's sides and stuck there)
    function run(x0, z0, x1, z1, y0, y1, ox, oz) {   // glass balustrade with a snowy rail; colliders in 2 m pieces
      var L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(L / 1.5)), ry = Math.atan2(-(z1 - z0), x1 - x0), pitch = Math.atan2(y1 - y0, L), k;
      for (k = 0; k <= n; k++) {
        var xa = lerp(x0, x1, k / n), za = lerp(z0, z1, k / n), ya = lerp(y0, y1, k / n), xb = lerp(x0, x1, (k + 1) / n), zb = lerp(z0, z1, (k + 1) / n), yb = lerp(y0, y1, (k + 1) / n);
        A('chrome', B(0.05, 1.08, 0.05, xa, ya + 0.54, za), C('#C8CCD2')); if (k < n) A('glass', partyGeo([xa, ya + 0.08, za, xb, yb + 0.08, zb, xa, ya + 1.0, za, xb, yb + 1.0, zb], [0, 1, 2, 2, 1, 3]));
      }
      A('wood', partyPut(new T.BoxGeometry(L + 0.06, 0.06, 0.12).rotateZ(pitch), (x0 + x1) / 2, (y0 + y1) / 2 + 1.06, (z0 + z1) / 2, ry), C('#C8B8A8'));
      A('snow', partyPut(partySnowCap(L, 0.13, 0.08, 0, 0, 0, 0, Math.floor(x0 * 7)).rotateZ(pitch), (x0 + x1) / 2, (y0 + y1) / 2 + 1.09, (z0 + z1) / 2, ry));
      for (k = 0; k < Math.ceil(L / 2); k++) {
        var ua = k * 2 / L, ub = Math.min(1, ua + 2 / L), cx0 = Math.min(lerp(x0, x1, ua), lerp(x0, x1, ub)) - 0.12, cx1 = Math.max(lerp(x0, x1, ua), lerp(x0, x1, ub)) + 0.12, cz0 = Math.min(lerp(z0, z1, ua), lerp(z0, z1, ub)) - 0.12, cz1 = Math.max(lerp(z0, z1, ua), lerp(z0, z1, ub)) + 0.12;
        partySolid(ctx, cx0 + Math.min(0, ox) * 0.48, cx1 + Math.max(0, ox) * 0.48, cz0 + Math.min(0, oz) * 0.48, cz1 + Math.max(0, oz) * 0.48, Math.min(y0, y1) + Math.abs(y1 - y0) * ua - 0.4, Math.min(y0, y1) + Math.abs(y1 - y0) * ub + 1.1);
      }
    }
    run(V.x0 + e, V.z0 + e, V.rx0, V.z0 + e, VY, VY, 0, -1); run(V.rx1, V.z0 + e, V.x1 - e, V.z0 + e, VY, VY, 0, -1); run(V.x1 - e, V.z0 + e, V.x1 - e, V.z1 - e, VY, VY, 1, 0);
    run(V.x1 - e, V.z1 - e, V.x0 + e, V.z1 - e, VY, VY, 0, 1); run(V.x0 + e, V.z1 - e, V.x0 + e, V.z0 + e, VY, VY, -1, 0);
    run(V.rx0 + e, R.z0 + 0.6, V.rx0 + e, R.z1, DY + 0.13, VY, -1, 0); run(V.rx1 - e, R.z0 + 0.6, V.rx1 - e, R.z1, DY + 0.13, VY, 1, 0);
    [[V.rx0 + e, V.rx0 - 1.1], [V.rx1 - e, V.rx1 + 1.1]].forEach(function (pr) {   // velvet ropes out from the rails' feet
      var z = R.z0 + 0.6, x = pr[1], yy = H(x, z), pts = [], gold = C('#D4A84E');
      A('chrome', Y(0.025, 0.025, 0.95, 8, x, yy + 0.48, z), gold); A('chrome', Y(0.17, 0.19, 0.04, 16, x, yy + 0.02, z), gold); A('chrome', partyPut(new T.SphereGeometry(0.05, 10, 8), x, yy + 0.98, z), gold);
      for (var k = 0; k <= 8; k++) pts.push(new T.Vector3(lerp(pr[0], x, k / 8), yy + 0.9 - Math.sin(k / 8 * PI) * 0.18, z));
      A('fabric', new T.TubeGeometry(new T.CatmullRomCurve3(pts), 12, 0.03, 6), C('#7A0A18')); partySolid(ctx, pr[0], x + (x > pr[0] ? 0.2 : -0.2), z - 0.2, z + 0.2, yy - 0.3, yy + 1.0);
    });
    [V.rx0 + 0.2, V.rx1 - 0.2].forEach(function (x) { A('chrome', Y(0.045, 0.045, 2.75, 10, x, VY + 1.37, V.z0 + 0.25), C('#C9A35A')); partyRing(ctx, x, V.z0 + 0.25, 0.12); });
    A('chrome', Y(0.04, 0.04, V.rx1 - V.rx0 - 0.3, 10, R.x, VY + 2.72, V.z0 + 0.25, 0, 0, PI / 2), C('#C9A35A')); partySign(1.7, 0.78, partyReg.vip, R.x, VY + 2.18, V.z0 + 0.25, PI, C('#FFC46A', 2.6), 2);
    A('snow', partySnowCap(V.rx1 - V.rx0 - 0.3, 0.1, 0.07, R.x, VY + 2.76, V.z0 + 0.25, 0, 81));
    // the snow bank under the VIP's west and south-west faces is scenery: nobody climbs it from the deck
    partySolid(ctx, 30.3, V.x0, 15.8, V.z1 + 0.3, DY - 0.2, DY + 1.95); partySolid(ctx, V.x0, V.rx0, 15.8, V.z0, DY - 0.2, DY + 1.95);
    for (var k3 = 0; k3 < 44; k3++) {   // flush LED inlays round the dance floor, pulsing with the kick
      var a = k3 / 44 * TAU, b = a + TAU / 44 * 0.62, xa = Math.cos(a) * 14.6, za = 7 + Math.sin(a) * 12, dx = Math.cos(b) * 14.6 - xa, dz = 7 + Math.sin(b) * 12 - za;
      if (za < 19.4) A('glow', B(Math.hypot(dx, dz), 0.012, 0.06, xa + dx / 2, DY + 0.042, za + dz / 2, -Math.atan2(dz, dx)), C(k3 % 2 ? '#FF2BD6' : '#2BE0FF', 1.6), 1);
    }
  }

  /* --------------------------------------------------------- the stage -- */
  function partyTruss(x0, y0, z0, x1, y1, z1, s) {
    s = s || 0.4; var T = THREE, L = Math.hypot(x1 - x0, y1 - y0, z1 - z0);
    var m = new T.Matrix4().compose(new T.Vector3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), new T.Vector3(x1 - x0, y1 - y0, z1 - z0).normalize()), new T.Vector3(1, 1, 1));
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (c, f) {
      partyAdd('chrome', new T.CylinderGeometry(0.026, 0.026, L, 6, 1, true).translate(c[0] * s / 2, 0, c[1] * s / 2).applyMatrix4(m), partyCol('#AEB2B8'));
      var g = new T.PlaneGeometry(s, L), uv = g.attributes.uv; for (var i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * L / s);
      partyAdd('truss', g.translate(0, 0, s / 2).rotateY(f * PI / 2).applyMatrix4(m));
    });
  }
  function partyStage(ctx) {
    var T = THREE, S = partyState, A = partyAdd, C = partyCol, B = partyBox, DY = partyDY, st = SITE.stage, x1 = st.w / 2, z0 = partyZ0, z1 = z0 + st.d, top = partyST, low = ctx.quality === 'low', black = new T.Color(0, 0, 0), dark = C('#18181B');
    A('metal', B(st.w, top - DY + 0.6, st.d, 0, (top + DY - 0.6) / 2, st.z), C('#0E0E10')); A('grille', partyPut(partyGrG(st.w, top - DY - 0.14), 0, (top + DY) / 2 - 0.02, z0 - 0.02, PI), C('#8A8C92'));   // the skirt
    A('glow', B(st.w, 0.045, 0.05, 0, top - 0.03, z0 - 0.05), C('#3FE6FF', 3), 1); A('glow', B(st.w, 0.03, 0.04, 0, DY + 0.06, z0 - 0.05), C('#FF2BD6', 2), 1);
    for (var k = 0; k < 4; k++) A('wood', B(1.4, 0.3, 0.42, x1 + 0.75, DY + 0.15 + k * 0.3, z0 + 1.6 + k * 0.42), C('#A09080'));
    A('wood', B(1.4, 1.25, 1.2, x1 + 0.75, DY + 0.62, z0 + 3.9), C('#A09080')); partySolid(ctx, -x1 - 0.1, x1 + 1.5, z0 - 0.15, z1 + 0.1, DY - 0.5, top + 0.1);
    partySubs.forEach(function (x) {   // sub stacks on the floor against the stage: pick-ups stand on them
      for (var s = 0; s < 2; s++) { A('metal', B(1.3, 0.54, 0.85, x, DY + 0.28 + s * 0.55, z0 - 0.43), C('#121214')); A('grille', partyPut(partyGrG(1.18, 0.44), x, DY + 0.28 + s * 0.55, z0 - 0.865, PI), C('#9A9CA2')); }
      partySolid(ctx, x - 0.66, x + 0.66, z0 - 0.88, z0, DY - 0.2, DY + 1.1);
    });
    var TY = top + 8.6, tz0 = z0 + 0.35, tz1 = z1 - 0.25, tx = x1 + 0.6, tzm = (tz0 + tz1) / 2;
    [[-tx, tz0], [tx, tz0], [-tx, tz1], [tx, tz1]].forEach(function (p) { partyTruss(p[0], top, p[1], p[0], TY + 0.2, p[1], 0.45); A('metal', B(0.9, 0.12, 0.9, p[0], top + 0.06, p[1]), C('#1A1A1C')); });
    [[-tx, tz0, tx, tz0], [-tx, tz1, tx, tz1], [-tx, tzm, tx, tzm], [-tx, tz0, -tx, tz1], [tx, tz0, tx, tz1]].forEach(function (q, i) { partyTruss(q[0], TY, q[1], q[2], TY, q[3]); A('snow', partySnowCap(Math.abs(q[2] - q[0]) + 0.3, Math.abs(q[3] - q[1]) + 0.3, 0.07, (q[0] + q[2]) / 2, TY + 0.21, (q[1] + q[3]) / 2, 0, 40 + i)); });
    partyTruss(-tx, TY, tz0, -tx - 2.4, TY, tz0, 0.3); partyTruss(tx, TY, tz0, tx + 2.4, TY, tz0, 0.3); partyRing(ctx, -tx, tz0, 0.4); partyRing(ctx, tx, tz0, 0.4);
    // black scrims down the sides with the peak printed on them; line arrays of ten cabinets in a J under bumpers
    [-1, 1].forEach(function (sd) {
      var hx = sd * (tx + 1.9), y = TY - 0.3, z = tz0, a = 0, c;
      A('fabric', B(0.03, TY - top - 0.6, tz1 - tz0 - 0.5, sd * (tx + 0.25), (TY + top) / 2 + 0.2, tzm), C('#17181C')); partySign(2.6, 1.4, partyReg.peak, sd * (tx + 0.28), top + 4.6, tzm, sd * PI / 2, C('#2BE0FF', 0.8), 2);
      A('metal', B(1.3, 0.1, 0.8, hx, y + 0.05, z), C('#2A2B2E')); A('metal', B(0.05, 0.6, 0.05, hx - 0.45, y + 0.4, z), C('#3A3B3F')); A('metal', B(0.05, 0.6, 0.05, hx + 0.45, y + 0.4, z), C('#3A3B3F'));
      for (c = 0; c < 10; c++) {
        A('metal', new T.BoxGeometry(1.12, 0.3, 0.6).translate(0, -0.15, 0.02).rotateX(a).translate(hx, y, z), C('#161618')); A('grille', partyGrG(1.04, 0.25).rotateY(PI).translate(0, -0.15, -0.285).rotateX(a).translate(hx, y, z), C('#8A8C92'));
        y -= Math.cos(a) * 0.3; z -= Math.sin(a) * 0.3; a += 0.02 + c * 0.014;
      }
    });
    // the LED wall and its two wings: one picture of three abstract scenes, changed every four bars
    var LW = 16, LH = 6.8, ly = top + 0.55 + LH / 2, lz = z1 - 0.55, wingW = 1.7, total = LW + 2 * wingW + 0.3, wa = 0.42, wx = LW / 2 + 0.25, P = [], U = [], I = [];
    function quad(ax, az, bx, bz, u0, u1) { var b = P.length / 3; P.push(ax, ly - LH / 2, az, bx, ly - LH / 2, bz, ax, ly + LH / 2, az, bx, ly + LH / 2, bz); U.push(u0, 0, u1, 0, u0, 1, u1, 1); I.push(b, b + 1, b + 2, b + 2, b + 1, b + 3); }
    quad(wx + Math.cos(wa) * wingW, lz - Math.sin(wa) * wingW, wx, lz, 0, wingW / total); quad(LW / 2, lz, -LW / 2, lz, (wingW + 0.15) / total, (wingW + 0.15 + LW) / total); quad(-wx, lz, -wx - Math.cos(wa) * wingW, lz - Math.sin(wa) * wingW, 1 - wingW / total, 1);
    S.ledU = { uTime: S.time, uBeat: { value: 0 }, uScene: { value: 0 }, uFade: { value: 0 }, uBright: { value: 1 }, uC1: { value: new T.Color('#FF2BD6') }, uC2: { value: new T.Color('#2BE0FF') }, uC3: { value: new T.Color('#FFFFFF') }, uAspect: { value: total / LH }, uGrid: { value: new T.Vector2(Math.round(total / 0.06), Math.round(LH / 0.06)) } };
    var ledHead = ['uniform float uTime,uBeat,uScene,uFade,uBright,uAspect;uniform vec3 uC1,uC2,uC3;uniform vec2 uGrid;',
      'vec3 pal(float x){x=fract(x)*3.0;return x<1.0?mix(uC1,uC2,smoothstep(0.0,1.0,x)):x<2.0?mix(uC2,uC3,smoothstep(1.0,2.0,x)):mix(uC3,uC1,smoothstep(2.0,3.0,x));}',
      'vec3 scene(float k,vec2 p){float t=uTime;',
      ' if(k<0.5){float r=length(p),a=atan(p.y,p.x),v=sin(10.0*log(r+0.05)-t*3.2+0.7*sin(a*5.0+t*0.8));',   // a tunnel
      '  return pal(a/6.2831+t*0.04+r*0.2)*(smoothstep(0.55,0.95,v)+smoothstep(0.92,1.0,sin(a*10.0+t*1.1+r*3.0))*0.5)*smoothstep(0.02,0.35,r)+uC3*exp(-r*7.0)*(0.5+uBeat*2.0);}',
      ' if(k<1.5){vec3 c=vec3(0.0);for(int i=0;i<7;i++){float fi=float(i),d=p.y+0.8-fi*0.25-(pF(vec2(p.x*0.9+fi*3.7+t*0.07*(1.0+fi*0.5),fi*1.3))-0.5)*0.7+abs(p.x)*0.05;',   // ridgelines
      '  c+=pal(fi*0.11+t*0.03)*(exp(-abs(d)*70.0)*1.4+step(d,0.0)*exp(d*6.0)*0.06)*(0.4+0.6*fract(fi*0.618+0.2));}return c+uC3*smoothstep(0.985,1.0,pH(floor(p*40.0)+floor(t*6.0)))*0.8;}',
      ' vec2 q=p*1.2;q+=vec2(pF(q+t*0.13),pF(q-t*0.11+4.0))*1.4;float v=sin(q.x*3.0+q.y*2.2+t*1.1);return pal(v*0.22+t*0.05+q.y*0.12)*smoothstep(0.1,1.0,v)*1.2+pal(q.x*0.1)*0.05;}',   // an aurora
      'vec3 ledAt(vec2 cuv){vec2 p=(cuv-0.5)*vec2(uAspect,1.0)*2.0;float k0=floor(uScene);vec3 c=scene(k0,p);if(uFade>0.001)c=mix(c,scene(mod(k0+1.0,3.0),p),smoothstep(0.0,1.0,uFade));return c*uBright*(0.8+uBeat*0.55);}'].join('\n');
    var led = new T.Mesh(partyGeo(P, I, U), partyShader({ uniforms: S.ledU, side: T.DoubleSide, vhead: 'varying vec2 vUv;', vmain: 'vUv=uv;' + partyMV, fhead: ledHead + '\nvarying vec2 vUv;',
      fmain: ['vec2 f=fract(vUv*uGrid)-0.5,cuv=(floor(vUv*uGrid)+0.5)/uGrid;vec3 c=ledAt(cuv);',   // LED dots up close, even far off; module seams
        'float px=max(fwidth(vUv.x*uGrid.x),fwidth(vUv.y*uGrid.y)),dotm=mix(smoothstep(0.5,0.22,length(f))*1.7,0.85,smoothstep(0.35,1.0,px));',
        'float seam=1.0-0.35*(1.0-smoothstep(0.0,0.08,min(fract(cuv.x*uGrid.x/8.0),fract(cuv.y*uGrid.y/8.0))))*(1.0-smoothstep(0.3,0.8,px));gl_FragColor=vec4(c*dotm*seam+vec3(0.006,0.007,0.01),1.0);'].join('\n') }));
    led.userData.noReflection = true; ctx.scene.add(led);
    // the wall in the wet boards: each floor pixel's reflected ray met with the wall's plane, board by board
    var wet = new T.Mesh(new T.PlaneGeometry(30, 26.5).rotateX(-PI / 2).translate(0, DY + 0.05, 7.25), partyShader({
      uniforms: Object.assign({ uWall: { value: new T.Vector4(lz, ly - LH / 2, LH, LW / 2) }, uU: { value: new T.Vector2((wingW + 0.15) / total, LW / total) } }, S.ledU), additive: true,
      vhead: 'varying vec3 vW;', vmain: 'vec4 wp=modelMatrix*vec4(position,1.0);vW=wp.xyz;' + partyWV, fhead: ledHead + '\nuniform vec4 uWall;uniform vec2 uU;varying vec3 vW;',
      fmain: ['vec3 V=normalize(vW-cameraPosition),R=vec3(V.x,-V.y,V.z);vec3 h=vW+R*(uWall.x-vW.z)/max(R.z,1e-3);float u=uU.x+(uWall.w-h.x)/(2.0*uWall.w)*uU.y,v=(h.y-uWall.y)/uWall.z;',
        'float inside=step(0.0,R.z)*smoothstep(uWall.w,uWall.w-1.5,abs(h.x))*smoothstep(0.0,0.12,v)*smoothstep(1.0,0.85,v),bd=floor(vW.z*8.0-0.52),wet=pWet(vW.xz)*(0.45+0.55*pH(vec2(bd,floor(vW.x/1.6+pH(vec2(bd,1.0))*3.0))));',
        'vec3 c=vec3(0.0);if(inside*wet>0.0)c=(ledAt(vec2(u,clamp(v-0.035,0.0,1.0)))+ledAt(vec2(u,clamp(v+0.035,0.0,1.0))))*0.5;',
        'gl_FragColor=vec4(max(c*inside*wet*(0.03+0.97*pow(1.0-abs(V.y),5.0))*smoothstep(-6.0,4.0,vW.z)*smoothstep(16.0,11.0,abs(vW.x))*0.5,0.0),1.0);'].join('\n') }));
    wet.renderOrder = 3; wet.userData.noReflection = true; ctx.scene.add(wet);
    A('metal', B(LW + 0.5, LH + 0.4, 0.35, 0, ly, lz + 0.22), C('#0A0A0C'));
    [-1, 1].forEach(function (sd) { A('metal', B(wingW + 0.1, LH + 0.3, 0.25, 0, 0, 0, sd * wa).translate(sd * (wx + Math.cos(wa) * wingW / 2), ly, lz - Math.sin(wa) * wingW / 2 + 0.16), C('#0A0A0C')); });
    partySolid(ctx, -tx - 0.6, tx + 0.6, lz - 1.2, z1 + 0.3, DY - 0.5, TY + 0.5);
    A('metal', B(12.8, 0.1, 0.1, 0, TY + 0.72, tz0 + 0.08), C('#141416')); A('metal', B(0.12, 0.6, 0.12, -5, TY + 0.4, tz0 + 0.1), dark); A('metal', B(0.12, 0.6, 0.12, 5, TY + 0.4, tz0 + 0.1), dark);
    partySign(12.6, 1.72, partyReg.name, 0, TY + 1.62, tz0, PI, C('#FF3FCF', 2.6), 2);
    // the booth: decks and a mixer glowing on a black desk, the DJ on a riser behind under a white downlight
    var by = top + 1.0, bz = 23.6;
    A('metal', B(3.8, 1.0, 0.95, 0, top + 0.5, bz + 0.15), C('#101012')); A('metal', B(3.9, 0.05, 1.05, 0, by + 0.025, bz + 0.15), C('#0B0B0C')); A('metal', B(3.6, 0.3, 1.6, 0, top + 0.15, bz + 1.15), C('#121214'));
    partySign(1.4, 0.75, partyReg.peak, -0.9, top + 0.52, bz - 0.34, PI, C('#2BE0FF', 2.2), 1); partySign(1.9, 0.41, partyReg.nuit, 0.9, top + 0.5, bz - 0.34, PI, C('#FF3FCF', 2), 1);
    [-1, 1].forEach(function (x) { A('metal', B(0.34, 0.1, 0.44, x, by + 0.1, bz + 0.15), C('#1A1A1D')); A('glow', partyPut(new T.RingGeometry(0.09, 0.115, 24), x, by + 0.155, bz + 0.22, 0, -PI / 2), C('#3FE6FF', 2.2), 1); A('glow', B(0.2, 0.012, 0.11, x, by + 0.156, bz), C('#9FD8FF', 1.8)); });
    A('metal', B(0.42, 0.11, 0.44, 0, by + 0.1, bz + 0.15), C('#16161A')); A('glow', B(0.38, 0.22, 0.01, 0, by + 0.28, bz + 0.48, 0, -0.35), C('#7FB8FF', 1.2));
    for (var m = 0; m < 12; m++) A('glow', B(0.025, 0.01, 0.025, -0.15 + (m % 4) * 0.1, by + 0.157, bz + 0.02 + Math.floor(m / 4) * 0.11), C(m % 3 ? '#FF3FCF' : '#3FFF8A', 2.5), 1);
    // (assembly, 5 Oct: the DJ is the story's Névé, in the look main.js gave her, so the scenes film her here on her riser:
    // a scene's cast stands on the ground, never up on the stage)
    var dj = ctx.assets.human && ctx.assets.human('human-athlete-female', { height: 1.7, skin: 'caucasian', hair: 'ponytail01', hairColor: '#E8E2D6', outfit: { shoes: '#F2EFE8' },
      clothes: { shirt: { kind: 'hoodie', color: '#F2F0EA' }, pants: { kind: 'joggers', color: '#141416' }, boots: '#F2EFE8' } });
    if (dj && dj.object) { var dg = new T.Group(); dg.add(dj.object); dg.position.set(PARTY_DJ[0], top + 0.3, PARTY_DJ[2]); dg.rotation.y = PI; ctx.scene.add(partyNoShadow(dg)); S.dj = dj; }
    // moving heads: eight on the front truss and four on the middle pointing down, six on the lip pointing up (not on low), the DJ's
    S.heads = [];
    for (var i = 0; i < 12; i++) S.heads.push(i < 8 ? { x: -8.4 + i * 2.4, y: TY - 0.62, z: tz0, i: i } : { x: -6.6 + (i - 8) * 4.4, y: TY - 0.62, z: tzm, i: i });
    if (!low) [-8.8, -5.2, -1.6, 1.6, 5.2, 8.8].forEach(function (x, j) { S.heads.push({ x: x, y: top + 0.42, z: z0 + 0.45, up: true, i: 12 + j }); });
    S.heads.push({ x: 0.1, y: TY - 0.62, z: bz + 0.95, dj: true, i: 18 });
    S.heads.forEach(function (h) { h.dir = new T.Vector3(0, h.up ? 1 : -1, h.dj ? 0 : -0.2).normalize(); h.want = h.dir.clone(); A('metal', h.up ? B(0.42, 0.18, 0.36, h.x, h.y - 0.33, h.z) : B(0.36, 0.3, 0.3, h.x, h.y + 0.42, h.z), dark); });
    var NB = S.heads.length, beamL = low ? 34 : 46;
    S.beams = partyInst(ctx, new T.CylinderGeometry(beamL * 0.07, 0.09, beamL, 22, 1, true).translate(0, beamL / 2, 0), partyShader({ uniforms: { uTime: S.time, uL: { value: beamL } }, additive: true, side: T.DoubleSide,
      vhead: 'uniform float uL;varying float vA;varying float vR;varying vec3 vW;varying vec3 vC;',
      vmain: 'vec4 wp=modelMatrix*instanceMatrix*vec4(position,1.0);vW=wp.xyz;vA=position.y/uL;vR=abs(dot(normalize(mat3(modelMatrix)*mat3(instanceMatrix)*normal),normalize(cameraPosition-wp.xyz)));vC=instanceColor;' + partyWV,
      fhead: 'uniform float uTime;varying float vA;varying float vR;varying vec3 vW;varying vec3 vC;',   // clamped: edge-on triangles interpolate past 0..1, and pow() of a negative is NaN
      fmain: 'float bR=clamp(vR,0.0,1.0),bA=clamp(vA,0.0,1.0),n=pN3(vW*0.32+vec3(0.0,-uTime*0.35,uTime*0.12))*0.7+pN3(vW*1.1+vec3(uTime*0.2,0.0,0.0))*0.3;\ngl_FragColor=vec4(max(vC*(pow(bR,2.4)*pow(1.0-bA,2.0)*(0.4+0.95*n)*0.3+pow(bR,9.0)*exp(-bA*16.0)*0.5),0.0),1.0);' }), NB, 8);
    S.lenses = partyInst(ctx, new T.CircleGeometry(0.15, 20).rotateX(-PI / 2).translate(0, 0.02, 0), new T.MeshBasicMaterial({ color: '#FFFFFF' }), NB);
    S.bodies = partyInst(ctx, partyRBox(0.36, 0.5, 0.36, 0.1, 2).translate(0, -0.24, 0), new T.MeshStandardMaterial({ color: '#15151A', metalness: 0.5, roughness: 0.4 }), NB);
    for (var b = 0; b < NB; b++) { S.beams.setColorAt(b, black); S.lenses.setColorAt(b, black); }
    // lasers: two on the truss, one on a stand at the lip; ribbons turned to the eye, never thinner than a few pixels
    S.lasers = [];
    [[-5.4, TY - 0.3, tz0 - 0.1, 7], [5.4, TY - 0.3, tz0 - 0.1, 7], [0, DY + 4.0, z0 + 0.5, 8]].forEach(function (e, ei) { for (var l = 0; l < e[3]; l++) S.lasers.push({ x: e[0], y: e[1], z: e[2], e: ei, l: l, n: e[3] }); });
    A('metal', B(0.08, DY + 3.85 - top, 0.08, 0, (DY + 3.85 + top) / 2, z0 + 0.5), C('#1A1A1C')); A('metal', B(0.36, 0.2, 0.3, 0, DY + 3.93, z0 + 0.55), dark); A('metal', B(0.4, 0.22, 0.32, -5.4, TY - 0.2, tz0), dark); A('metal', B(0.4, 0.22, 0.32, 5.4, TY - 0.2, tz0), dark);
    S.laserMesh = partyInst(ctx, new T.PlaneGeometry(1, 1).translate(0, 0.5, 0), partyShader({ uniforms: { uH: S.uH }, additive: true, side: T.DoubleSide,
      vhead: 'uniform float uH;varying vec2 vUv;varying vec3 vC;varying float vK;varying float vWd;varying float vN;',
      vmain: 'vUv=uv;vC=instanceColor;vec3 o=(modelMatrix*instanceMatrix*vec4(0.0,0.0,0.0,1.0)).xyz,e=(modelMatrix*instanceMatrix*vec4(0.0,1.0,0.0,1.0)).xyz,p=mix(o,e,position.y);float d=max(-(viewMatrix*vec4(p,1.0)).z,0.1);vWd=max(0.22,d*5.0/(projectionMatrix[1][1]*uH));vK=0.014/vWd;vN=smoothstep(1.5,5.0,d);p+=normalize(cross(normalize(e-o),normalize(cameraPosition-p)))*position.x*2.0*vWd;vec4 mvPosition=viewMatrix*vec4(p,1.0);gl_Position=projectionMatrix*mvPosition;',
      fhead: 'varying vec2 vUv;varying vec3 vC;varying float vK;varying float vWd;varying float vN;',
      fmain: 'float x=abs(vUv.x-0.5)*2.0,fw=fwidth(x)*1.2,k=max(vK,fw);gl_FragColor=vec4(vC*((1.0-smoothstep(0.0,k,x))*2.6*min(1.0,vK/fw+0.25)+exp(-x*vWd*16.0)*0.09)*smoothstep(0.0,0.015,vUv.y)*(1.0-smoothstep(0.5,1.0,vUv.y))*vN,1.0);' }), S.lasers.length, 9);
    for (var l2 = 0; l2 < S.lasers.length; l2++) S.laserMesh.setColorAt(l2, black);
    if (!low) {   // the haze: a sheet over the floor that glows where the beams cross it, faded out over 4 m at every border
      var haze = new T.Mesh(new T.PlaneGeometry(36, 11).translate(0, top + 5.5, 14), partyShader({ uniforms: Object.assign({ uTint: { value: new T.Color('#4A3A8A') } }, S.bu), additive: true, side: T.DoubleSide,
        vhead: 'varying vec3 vW;varying float vF;', vmain: 'vec4 wp=modelMatrix*vec4(position,1.0);vW=wp.xyz;vF=abs(dot(normalize(mat3(modelMatrix)*normal),normalize(cameraPosition-wp.xyz)));' + partyWV,
        fhead: 'uniform float uTime;' + S.BU + ' uniform vec3 uTint;varying vec3 vW;varying float vF;',
        fmain: 'float n=pF(vW.xy*0.16+vec2(uTime*0.05,-uTime*0.03));vec3 acc=uTint*n*0.03;\nfor(int i=0;i<' + NB + ';i++){vec3 d=vW-uBO[i];float a=dot(d,uBD[i]);if(a<0.0)continue;float r=length(d-uBD[i]*a),R=a*0.11+0.35;acc+=uBC[i]*exp(-r*r/(R*R)*1.2)*exp(-a*0.03)*(0.35+n*0.9);}\n' +
          'gl_FragColor=vec4(max(acc,0.0)*smoothstep(18.0,13.0,abs(vW.x))*smoothstep(' + (top + 0.2).toFixed(2) + ',' + (top + 4).toFixed(2) + ',vW.y)*smoothstep(' + (top + 11).toFixed(2) + ',' + (top + 7).toFixed(2) + ',vW.y)*smoothstep(0.0,0.4,vF)*smoothstep(3.0,9.0,length(vW-cameraPosition))*1.8,1.0);' }));
      haze.renderOrder = 7; haze.userData.noReflection = true; ctx.scene.add(haze);
    }
    var NF = low ? 1200 : 2800, FR = rng(77), fp = new Float32Array(NF * 3), fs = new Float32Array(NF), fg = new T.BufferGeometry();
    for (var f = 0; f < NF; f++) { fp.set([FR(), FR(), FR()], f * 3); fs[f] = FR(); }
    fg.setAttribute('position', new T.BufferAttribute(fp, 3)); fg.setAttribute('aSeed', new T.BufferAttribute(fs, 1));
    S.flakeU = Object.assign({ uScale: { value: 800 } }, S.bu);
    var flakes = new T.Points(fg, partyShader({ uniforms: S.flakeU, additive: true,   // snowflakes lit where they fall through a beam
      vhead: 'attribute float aSeed;uniform float uTime,uScale;' + S.BU + ' varying vec3 vC;',
      vmain: 'vec3 box=vec3(44.0,15.0,44.0),p=position*box;p.y-=uTime*(0.55+aSeed*0.6);p.x+=uTime*0.35+sin(uTime*(0.7+aSeed)+aSeed*40.0)*0.5;p.z+=cos(uTime*0.5+aSeed*23.0)*0.5;p=mod(p,box)+vec3(-22.0,' + (DY + 0.2).toFixed(2) + ',-14.0);vec3 c=vec3(0.0);\n' +
        'for(int i=0;i<' + NB + ';i++){vec3 d=p-uBO[i];float a=dot(d,uBD[i]);if(a<0.0)continue;float r=length(d-uBD[i]*a),R=a*0.075+0.1;c+=uBC[i]*smoothstep(R,R*0.35,r)*exp(-a*0.02);}\n' +
        'vC=c*2.4;vec4 mvPosition=viewMatrix*vec4(p,1.0);gl_Position=projectionMatrix*mvPosition;gl_PointSize=step(0.004,dot(c,vec3(1.0)))*clamp((0.03+aSeed*0.035)*uScale/-mvPosition.z,1.0,9.0);',
      fhead: 'varying vec3 vC;', fmain: 'gl_FragColor=vec4(max(vC,0.0)*(1.0-smoothstep(0.1,0.5,length(gl_PointCoord-0.5))),1.0);' }));
    flakes.frustumCulled = false; flakes.renderOrder = 9; flakes.userData.noReflection = true; ctx.scene.add(flakes);
    S.spots = [-3.6, 3.6].map(function (x) { var s = new T.SpotLight('#FF40D0', 9, 42, 0.36, 0.65, 1); s.position.set(x, TY - 0.7, tz0); s.target.position.set(x * 0.8, DY, 8); ctx.scene.add(s, s.target); return s; });
  }

  /* ---------------------------------------------------------- the bars -- */
  function partyBars(ctx) {
    var T = THREE, S = partyState, A = partyAdd, C = partyCol, B = partyBox, Y = partyCyl, DY = partyDY, IB = partyIce, CB = partyChamp, Rr = rng(31), D = new T.Object3D(), ice = [], tints = ['#2F7A40', '#8A4A12', '#8FA8B0', '#1F5A2E', '#6A3A10', '#3A8A50'];
    var bgeo = partyTint(new T.LatheGeometry([[0, 0], [0.036, 0.0], [0.043, 0.006], [0.045, 0.03], [0.045, 0.19], [0.042, 0.215], [0.031, 0.245], [0.019, 0.272], [0.0145, 0.29], [0.0145, 0.312], [0.017, 0.318], [0.016, 0.326], [0, 0.326]].map(function (p) { return new T.Vector2(p[0], p[1]); }), 12),
      function (x, y) { return y > 0.235 ? [0.95, 0.72, 0.28] : (y > 0.07 && y < 0.15) ? [0.85, 0.8, 0.68] : [0, 0, 0]; });   // black: the glass, tinted per instance
    /* the ice bar: clear blocks lit from below, an ice back wall with shelves of bottles; the ice arch over the steps */
    function block(w, h, d, x, y, z) { var g = partyRBox(w, h, d, 0.05, 2).translate(x, y, z); g.userData.seed = Rr(); ice.push({ g: g }); }
    var len = IB.z1 - IB.z0, bl = len / 10, ay = DY + 3.4, k;
    for (var c = 0; c < 2; c++) for (k = 0; k < 10 + c; k++) { var z = IB.z0 + (k + (c ? -0.5 : 0) + 0.5) * bl, za = Math.max(IB.z0, z - bl / 2), zb = Math.min(IB.z1, z + bl / 2); block(0.78, 0.5, zb - za - 0.02, IB.front - 0.4, DY + 0.25 + c * 0.51, (za + zb) / 2); }
    block(1.0, 0.12, len + 0.3, IB.front - 0.42, IB.top - 0.06, IB.z);
    for (c = 0; c < 5; c++) for (k = 0; k < 11; k++) { var zw = IB.z0 + (k + (c % 2) * 0.5); if (zw + 1 <= IB.z1 + 0.6) block(0.5, 0.5, 0.98, IB.back + 0.25, DY + 0.25 + c * 0.51, zw + 0.5); }
    [1.25, 1.8].forEach(function (h) { block(0.42, 0.07, len - 0.6, IB.back + 0.72, DY + h, IB.z); });
    [IB.z0 - 0.5, IB.z1 + 0.5].forEach(function (z) { block(0.7, 2.9, 0.7, IB.front - 0.45, DY + 1.45, z); block(0.8, 0.3, 0.8, IB.front - 0.45, DY + 3.05, z); A('snow', partySnowCap(0.85, 0.85, 0.16, IB.front - 0.45, DY + 3.2, z, 0, 61)); });
    [-20.3, -11.7].forEach(function (x) { var y = H(x, -23.4) - 0.1; for (var k3 = 0; k3 < 3; k3++) block(0.9, (ay - y) / 3 - 0.01, 0.9, x, y + (k3 + 0.5) * (ay - y) / 3, -23.4); partySolid(ctx, x - 0.5, x + 0.5, -23.9, -22.9, y - 0.3, ay); });
    for (k = 0; k < 4; k++) block(2.28, 0.7, 0.9, -16 + (k - 1.5) * 2.3, ay + 0.36, -23.4);
    partySign(7.2, 1.0, partyReg.name, -16, ay + 0.36, -23.87, PI, C('#BFF4FF', 2.4), 2); partySign(7.2, 1.0, partyReg.name, -16, ay + 0.36, -22.93, 0, C('#BFF4FF', 2.4), 2); A('snow', partySnowCap(9.3, 0.95, 0.16, -16, ay + 0.72, -23.4, 0, 64));
    var ig = partyMerge(ice), seeds = new Float32Array(ig.attributes.position.count), o = 0;
    ice.forEach(function (it) { var n = it.g.attributes.position.count; seeds.fill(it.g.userData.seed, o, o + n); o += n; });
    ig.setAttribute('aSeed', new T.BufferAttribute(seeds, 1));
    ctx.scene.add(new T.Mesh(ig, partyShader({ uniforms: { uPulse: { value: S.pulse } },
      vhead: 'attribute float aSeed;varying vec3 vW;varying float vS;varying vec2 vUv;', vmain: 'vS=aSeed;vUv=uv;vec4 wp=modelMatrix*vec4(position,1.0);vW=wp.xyz;' + partyWV,
      fhead: 'uniform vec4 uPulse;varying vec3 vW;varying float vS;varying vec2 vUv;',
      fmain: [   // a dark clear core lit from below, frosted chisel edges, cloud and bubbles at depth (parallax), frosted wet tops
        'vec3 V=normalize(cameraPosition-vW),N=normalize(cross(dFdx(vW),dFdy(vW)));N*=sign(dot(N,V));vec3 Rf=reflect(-V,N);float fr=pow(1.0-clamp(dot(N,V),0.0,1.0),3.0);',
        'float e=min(min(vUv.x,1.0-vUv.x),min(vUv.y,1.0-vUv.y)),edge=smoothstep(0.09,0.0,e),bev=smoothstep(0.03,0.0,e);',
        'float hy=fract(clamp((vW.y-' + DY.toFixed(2) + ')/0.51,0.0,9.0)),hi=exp(-hy*2.0)*(0.6+0.8*vS)*(0.85+0.15*uPulse.y);',
        'vec3 d1=vW-V*(0.12+0.15*vS),d2=vW-V*0.32;float f1=pF(d1.xz*1.9+d1.y*1.1+vS*11.0),f2=pF(d2.zy*1.3+d2.x*1.1+vS*7.0);',
        'float cr=smoothstep(0.03,0.0,abs(pF(d2.xz*0.8+d2.y*0.6+5.0+vS*3.0)-0.5));vec2 bq=vec2(d1.x+d1.z,d1.y)*30.0;float bub=step(0.95,pH(floor(bq)+vS*7.0))*smoothstep(0.3,0.12,length(fract(bq)-0.5));',
        'vec3 lit=vec3(0.2,0.62,1.0),frost=vec3(0.66,0.8,0.94),c=vec3(0.003,0.016,0.03)+lit*hi*(0.2+0.3*f2)+frost*smoothstep(0.55,0.85,f1)*0.06*(0.3+hi);',
        'c+=frost*(bev*0.32+edge*0.14)*(0.3+hi)+frost*cr*0.14*(0.4+hi)+vec3(0.8,0.95,1.0)*bub*0.3*(0.3+hi)+frost*fr*0.12;c=mix(c,frost*(0.15+0.3*hi),0.12*vS*(1.0-fr));',
        'float top=smoothstep(0.7,0.95,N.y);c=mix(c,frost*0.42+mix(vec3(0.02,0.04,0.08),vec3(0.1,0.17,0.28),clamp(Rf.y,0.0,1.0))*0.6,top*0.85);',
        'c+=top*pow(max(dot(Rf,normalize(vec3(0.476,0.438,-0.762))),0.0),60.0)*1.6*smoothstep(0.35,0.65,pF(vW.xz*3.0));gl_FragColor=vec4(c,1.0);'].join('\n') })));
    partySign(4.8, 0.7, partyReg.ice, IB.back + 0.53, DY + 2.32, IB.z, PI / 2, C('#7FE8FF', 2.2), 2); partySign(1.3, 0.65, partyReg.peak, IB.back + 0.53, DY + 0.75, IB.z, PI / 2, C('#BFF4FF', 1.2), 2);
    A('snow', partyDrift([[IB.back + 0.25, IB.z0 - 0.4], [IB.back + 0.25, IB.z1 + 0.4]], 0.6, 0.12, 63, DY + 2.55)); A('snow', partyDrift([[IB.back - 0.3, IB.z0 - 1.2], [IB.back - 0.3, IB.z1 + 1.2]], 1.1, 0.4, 65, DY));
    partySolid(ctx, IB.back - 0.1, IB.front + 0.08, IB.z0 - 0.9, IB.z1 + 0.9, DY - 0.3, DY + 3.1);
    var ib = partyInst(ctx, bgeo, S.M.bottle, 26);
    for (var b = 0; b < 26; b++) { D.position.set(IB.back + 0.72, DY + (b < 13 ? 1.32 : 1.87), IB.z0 + 0.6 + (b % 13) * 0.8 + Rr() * 0.2); D.rotation.set(0, Rr() * TAU, 0); D.scale.set(0.9, 1 + Rr() * 0.15, 0.9); D.updateMatrix(); ib.setMatrixAt(b, D.matrix); ib.setColorAt(b, new T.Color(tints[Math.floor(Rr() * 6)]).multiplyScalar(1.4)); }
    /* the champagne bar: timber and brass under a snow-laden pergola, backlit shelves of bottles */
    var cz = CB.z, cl = CB.z1 - CB.z0, bx = CB.back - 0.3, brass = C('#C9A35A'), cb = [];
    A('wood', B(0.72, 1.02, cl, CB.front + 0.36, DY + 0.51, cz), C('#D8C8B8'));
    for (var sl = 0; sl < 58; sl++) A('wood', B(0.03, 0.86, 0.12, CB.front - 0.03, DY + 0.52, CB.z0 + 0.15 + sl * (cl - 0.3) / 57), C('#B0A090'));
    A('glow', partyTint(B(0.01, 0.84, cl - 0.2, CB.front - 0.008, DY + 0.52, cz), function (x, y) { var v = 0.35 + 0.9 * clamp(1 - (y - DY - 0.1) / 0.84, 0, 1); return [v, v, v]; }), C('#FF9A50', 0.65), 2);
    A('chrome', B(0.86, 0.06, cl + 0.12, CB.front + 0.36, CB.top - 0.03, cz), brass); A('chrome', Y(0.025, 0.025, cl - 0.2, 10, CB.front - 0.28, DY + 0.22, cz, 0, PI / 2), brass);
    A('glow', B(0.03, 0.03, cl - 0.1, CB.front - 0.06, CB.top - 0.12, cz), C('#FFB266', 3), 2); A('glow', B(0.03, 0.03, cl - 0.1, CB.front - 0.04, DY + 0.06, cz), C('#FF9A40', 2.2), 2);
    A('wood', B(0.6, 1.0, cl, bx, DY + 0.5, cz), C('#C0AE9C')); A('chrome', B(0.64, 0.04, cl + 0.04, bx, DY + 1.02, cz), brass);
    A('wood', B(0.1, 1.85, cl, bx + 0.33, DY + 1.95, cz), C('#9C8C7C')); A('wood', B(0.5, 0.12, cl + 0.1, bx, DY + 2.84, cz), C('#9C8C7C'));
    [1.08, 1.5, 1.92, 2.34].forEach(function (h, j) {
      A('glow', partyTint(B(0.04, 0.42, cl - 0.4, bx + 0.26, DY + h + 0.29, cz), function (x, y) { var f = clamp((y - DY - h - 0.08) / 0.42, 0, 1), v = 1.1 * (1 - f) * (1 - f) + 0.1; return [v, v, v]; }), C('#FFA04E'), 2);
      A('chrome', B(0.42, 0.025, cl - 0.4, bx + 0.05, DY + h + 0.07, cz), j ? C('#B7BCC4') : brass);
      for (var z = CB.z0 + 0.45; z < CB.z1 - 0.35; z += 0.22 + Rr() * 0.08) if (Rr() >= 0.1) cb.push([bx + (Rr() - 0.5) * 0.12, DY + h + 0.105, z, j === 0 && Rr() < 0.4 ? 1.45 : 1, tints[Math.floor(Rr() * 6)], 0]);
    });
    [CB.z0 + 1.2, CB.z0 + 3.6, CB.z1 - 3.6, CB.z1 - 1.2].forEach(function (z) { cb.push([bx - 0.08, DY + 1.08, z, 1, '#1F5A2E', 0.3]); A('chrome', Y(0.12, 0.09, 0.22, 16, bx - 0.08, DY + 1.15, z, 0, 0, 0, true), C('#D9DCE0')); A('glass', Y(0.11, 0.11, 0.02, 12, bx - 0.08, DY + 1.2, z)); });
    var cbi = partyInst(ctx, bgeo, S.M.bottle, cb.length);
    cb.forEach(function (q, i) { D.position.set(q[0], q[1], q[2]); D.rotation.set(q[5], Rr() * TAU, 0); D.scale.setScalar(q[3]); D.updateMatrix(); cbi.setMatrixAt(i, D.matrix); cbi.setColorAt(i, new T.Color(q[4])); });
    var px0 = CB.front - 1.3, px1 = CB.back + 0.15, pz0 = CB.z0 - 1.2, pz1 = CB.z1 + 1.2, ph = DY + 3.4, pxm = (px0 + px1) / 2;
    [[px0, pz0], [px0, pz1], [px1, pz0], [px1, pz1]].forEach(function (p) { A('wood', B(0.24, ph - DY, 0.24, p[0], (ph + DY) / 2, p[1]), C('#C0AE9C')); partyRing(ctx, p[0], p[1], 0.3); A('snow', partyMound(p[0], p[1], 0.55, 0.22, DY)); });
    [px0, px1].forEach(function (x) { A('wood', B(0.3, 0.42, pz1 - pz0 + 0.5, x, ph + 0.2, cz), C('#B4A494')); });
    for (var r = 0; r < 9; r++) A('wood', B(px1 - px0 + 0.8, 0.22, 0.16, pxm, ph + 0.52, pz0 + r * (pz1 - pz0) / 8), C('#B4A494'));
    A('wood', B(px1 - px0 + 1.0, 0.1, pz1 - pz0 + 0.9, pxm, ph + 0.68, cz), C('#B0A090')); A('snow', partySnowCap(px1 - px0 + 1.0, pz1 - pz0 + 0.9, 0.48, pxm, ph + 0.73, cz, 0, 71));
    A('wood', B(0.12, 0.7, pz1 - pz0 + 0.9, px0 - 0.5, ph + 0.35, cz), C('#9A8A7A')); partySign(6.2, 1.02, partyReg.champ, px0 - 0.58, ph + 0.33, cz, -PI / 2, C('#FFC46A', 2.4), 2);
    for (var dl = 0; dl < 5; dl++) A('glow', partyPut(new T.CircleGeometry(0.07, 12), CB.front - 0.3, ph + 0.08, CB.z0 + 0.8 + dl * (cl - 1.6) / 4, 0, PI / 2), C('#FFD9A0', 3));
    partySolid(ctx, CB.front - 0.12, CB.back + 0.25, CB.z0 - 0.3, CB.z1 + 0.3, DY - 0.3, ph + 0.8); partySolid(ctx, CB.back - 0.6, px1 + 0.32, pz0 - 0.32, pz1 + 0.32, DY - 0.3, DY + 2.1);
    var stools = [0, 1, 2, 3, 4, 5].map(function (s) { var p = [CB.front - 0.55, CB.z0 + 0.9 + s * (cl - 1.8) / 5]; partyRing(ctx, p[0], p[1], 0.22); return p; }), sm = ctx.assets.model('model-bar-stool');
    if (sm) ctx.scene.add(partyNoShadow(sm.instanced(6, function (i, d) { d.position.set(stools[i][0], DY, stools[i][1]); d.rotation.y = -PI / 2; })));
  }

  /* ------------------------------------ lounges, heaters, lanterns, flames -- */
  // a mushroom heater: brushed steel, an exposed emitter glowing orange under the hood, its glow on the hood's underside
  function partyHeater(x, z, y) {
    var A = partyAdd, C = partyCol, Y = partyCyl, steel = C('#C4C9D0');
    A('metal', Y(0.26, 0.3, 0.1, 18, x, y + 0.05, z), C('#3A3C40')); A('metal', Y(0.04, 0.045, 1.68, 10, x, y + 0.94, z), steel); A('metal', Y(0.24, 0.24, 0.03, 18, x, y + 1.08, z), steel); A('metal', Y(0.06, 0.06, 0.1, 10, x, y + 1.78, z), C('#2A2B2E'));
    A('glow', partyTint(Y(0.1, 0.1, 0.4, 16, x, y + 2.0, z, 0, 0, 0, true), function (a, b, c, i) { return (i % 17) % 2 ? [1, 1, 1] : [0.45, 0.45, 0.45]; }), C('#FF5A1E', 3.6), 3);
    for (var i = 0; i < 3; i++) A('metal', Y(0.012, 0.012, 0.44, 4, x + Math.cos(i * 2.1) * 0.15, y + 2.0, z + Math.sin(i * 2.1) * 0.15), C('#8A8F96'));
    A('metal', partyPut(new THREE.ConeGeometry(0.46, 0.16, 24, 1, true), x, y + 2.3, z), steel);
    A('glow', partyTint(partyPut(new THREE.CircleGeometry(0.44, 20), x, y + 2.215, z, 0, PI / 2), function (a, b, c, i) { return i ? [0.14, 0.14, 0.14] : [1, 1, 1]; }), C('#FF7A3A', 1.8), 3);
    partyState.fl.push([x, y + 1.86, z, 1.3, 1.1, 2]);
  }
  function partyLantern(x, z, y, s) {   // a hurricane lantern (s = 1: 0.38 m)
    var A = partyAdd, Y = partyCyl, k = partyCol('#141416');
    A('glow', partyTint(Y(0.085 * s, 0.085 * s, 0.26 * s, 12, x, y + 0.175 * s, z), function (a, b) { var f = (b - y) / s - 0.13, v = 0.22 + 1.5 * Math.exp(-f * f * 60); return [v, v, v]; }), partyCol('#FF9A48', 0.75), 3);
    A('metal', Y(0.11 * s, 0.12 * s, 0.05 * s, 12, x, y + 0.025 * s, z), k); A('metal', Y(0.03 * s, 0.1 * s, 0.07 * s, 12, x, y + 0.34 * s, z), k);
    for (var i = 0; i < 4; i++) A('metal', partyBox(0.012 * s, 0.27 * s, 0.012 * s, x + Math.cos(i * PI / 2 + 0.78) * 0.095 * s, y + 0.18 * s, z + Math.sin(i * PI / 2 + 0.78) * 0.095 * s), k);
    A('metal', partyPut(new THREE.TorusGeometry(0.06 * s, 0.006 * s, 4, 14, PI), x, y + 0.38 * s, z), k);
  }
  function partyLounges(ctx) {
    var T = THREE, S = partyState, A = partyAdd, C = partyCol, B = partyBox, Y = partyCyl, DY = partyDY, VY = partyVY, V = partyVip, chairs = [], tops = [], lanterns = [], R = rng(5);
    S.fires = [];
    partyLounge.forEach(function (L) {
      // a wool rug with the fire's warmth baked in, a stone fire table, flames (a dim back layer, a ring of tongues, a hot core, a halo)
      A('fabric', partyTint(partyPut(new T.RingGeometry(0, 3.35, 48, 6), L.x, DY + 0.05, L.z, 0, -PI / 2), function (x, y, z) { var w = Math.exp(-((x - L.x) * (x - L.x) + (z - L.z) * (z - L.z)) / 5); return [1 + 2.2 * w, 1 + 1.4 * w, 1 + 0.7 * w]; }), C('#A89C90'));
      A('fabric', partyPut(new T.RingGeometry(3.12, 3.3, 48), L.x, DY + 0.052, L.z, 0, -PI / 2), C('#5A4A40'));
      A('stone', Y(0.85, 0.9, 0.44, 28, L.x, DY + 0.22, L.z), C('#E8E2DA')); A('chrome', partyPut(new T.TorusGeometry(0.82, 0.035, 6, 36), L.x, DY + 0.45, L.z, 0, PI / 2), C('#3A3B3E'));
      A('metal', Y(0.8, 0.8, 0.02, 28, L.x, DY + 0.43, L.z), C('#0E0C0B')); A('glow', Y(0.5, 0.5, 0.01, 20, L.x, DY + 0.442, L.z), C('#FF4A10', 1.6), 3);
      partyRing(ctx, L.x, L.z, 1.0); S.fires.push({ x: L.x, y: DY + 0.45, z: L.z });
      for (var k = 0; k < 12; k++) { var a = k / 4 * TAU + R(), r = k < 4 ? 0.22 : k < 10 ? 0.3 + R() * 0.12 : 0; S.fl.push(k === 11 ? [L.x, DY + 0.45, L.z, 2.6, 2.2, 2] : [L.x + Math.cos(a) * r, DY + 0.45, L.z + Math.sin(a) * r, k < 4 ? 0.62 : k < 10 ? 0.32 + R() * 0.22 : 0.48, k < 4 ? 0.7 : k < 10 ? 0.55 + R() * 0.35 : 1.15, k < 4 ? 0.5 : 1]); }
      L.chairs.forEach(function (c) { chairs.push([c.x, DY, c.z, Math.atan2(L.x - c.x, L.z - c.z)]); partyRing(ctx, c.x, c.z, 0.5); });
      L.tables.forEach(function (t) { tops.push(t); partyRing(ctx, t.x, t.z, 0.62); lanterns.push([t.x + 0.28, t.z - 0.22, DY + 0.49, 0.62]); });
      L.lanterns.forEach(function (l) { lanterns.push([l.x, l.z, DY, 1.25]); });
    });
    [[46.3, 23.4, -PI / 2, 4.8], [43.2, 27.9, PI, 3.6]].forEach(function (s) {   // the VIP's sofas
      var w = s[3], cs = Math.abs(Math.cos(s[2])), sn = Math.abs(Math.sin(s[2]));
      function put(g, c) { A(c ? 'fabric' : 'wood', g.rotateY(s[2]).translate(s[0], VY, s[1]), C(c || '#B0A090')); }
      put(B(w, 0.28, 0.95, 0, 0.14, 0)); put(partyRBox(w - 0.1, 0.2, 0.86, 0.06, 3).translate(0, 0.38, 0.03), '#E9E4DA'); put(partyRBox(w - 0.1, 0.55, 0.2, 0.08, 3).rotateX(-0.2).translate(0, 0.66, -0.36), '#E1DBD0');
      for (var k = 0; k < Math.floor(w / 1.2); k++) put(partyRBox(0.42, 0.4, 0.14, 0.06, 3).rotateX(-0.3).translate(-w / 2 + 0.7 + k * 1.2, 0.68, -0.18), k % 2 ? '#7A1E2A' : '#B9AFA2');
      partySolid(ctx, s[0] - cs * w / 2 - sn * 0.5, s[0] + cs * w / 2 + sn * 0.5, s[1] - sn * w / 2 - cs * 0.5, s[1] + sn * w / 2 + cs * 0.5, VY - 0.2, VY + 0.95);
    });
    A('stone', B(1.1, 0.38, 1.8, V.table[0], VY + 0.19, V.table[1]), C('#3A3836')); A('chrome', B(1.14, 0.03, 1.84, V.table[0], VY + 0.395, V.table[1]), C('#C9A35A'));
    partySolid(ctx, V.table[0] - 0.65, V.table[0] + 0.65, V.table[1] - 1.0, V.table[1] + 1.0, VY - 0.2, VY + 0.5); lanterns.push([V.table[0] - 0.2, V.table[1] - 0.15, VY + 0.41, 0.62]);
    [[40.6, 25.6, 2.1], [40.4, 22.4, 1.0]].forEach(function (c) { chairs.push([c[0], VY, c[1], c[2]]); partyRing(ctx, c[0], c[1], 0.5); });
    var lc = ctx.assets.model('model-lounge-chair'), ct = ctx.assets.model('model-coffee-table');
    if (lc) ctx.scene.add(lc.instanced(chairs.length, function (i, d) { var c = chairs[i]; d.position.set(c[0], c[1], c[2]); d.rotation.y = c[3]; }));
    if (ct) ctx.scene.add(partyNoShadow(ct.instanced(tops.length, function (i, d) { d.position.set(tops[i].x, DY, tops[i].z); })));
    var flute = new T.LatheGeometry([[0, 0], [0.035, 0], [0.035, 0.006], [0.004, 0.012], [0.004, 0.11], [0.022, 0.13], [0.026, 0.2], [0.024, 0.235], [0, 0.235]].map(function (p) { return new T.Vector2(p[0], p[1]); }), 10);
    tops.forEach(function (t) { A('glass', flute.clone().translate(t.x - 0.16, DY + 0.49, t.z + 0.12)); A('glass', flute.clone().translate(t.x + 0.1, DY + 0.49, t.z + 0.22)); });
    lanterns.forEach(function (l) { partyLantern(l[0], l[1], l[2], l[3]); if (l[3] > 1) partyRing(ctx, l[0], l[1], 0.16); });
    partyHeaters.forEach(function (h, i) { partyHeater(h[0], h[1], i === partyHeaters.length - 1 ? VY : DY); partyRing(ctx, h[0], h[1], 0.32); });
    S.fireLights = S.fires.map(function (f) { var l = new T.PointLight('#FF7A30', 7, 10, 2); l.position.set(f.x, f.y + 0.75, f.z); ctx.scene.add(l); return l; });
  }
  // every flame card in one batch: [x, y, z, width, height, kind (1 a tongue, 0.5 a dim back tongue, 2 a halo)]; embers over the fires
  function partyFlames(ctx) {
    var T = THREE, S = partyState, D = new T.Object3D(), NE = S.fires.length * (ctx.quality === 'low' ? 18 : 40), ep = new Float32Array(NE * 3), es = new Float32Array(NE), FR = rng(6), eg = new T.BufferGeometry();
    var fl = partyInst(ctx, new T.PlaneGeometry(1, 1).translate(0, 0.5, 0), partyShader({ uniforms: { uTime: S.time }, additive: true, side: T.DoubleSide, vhead: 'varying vec2 vUv;varying float vS;varying float vK;',
      vmain: 'vUv=uv;vec3 c=(modelMatrix*instanceMatrix*vec4(0.0,0.0,0.0,1.0)).xyz;vS=fract(c.x*3.7+c.z*1.3+instanceMatrix[3].y*9.1);vK=length(instanceMatrix[2].xyz);float h=length(instanceMatrix[1].xyz);' +
        'vec3 wp=c+vec3(viewMatrix[0][0],viewMatrix[1][0],viewMatrix[2][0])*position.x*length(instanceMatrix[0].xyz)+vec3(0.0,position.y*h-step(1.5,vK)*h*0.3,0.0);vec4 mvPosition=viewMatrix*vec4(wp,1.0);gl_Position=projectionMatrix*mvPosition;',
      fhead: 'uniform float uTime;varying vec2 vUv;varying float vS;varying float vK;',
      fmain: ['vec2 p=vUv;float t=uTime*(1.6+vS*0.8)+vS*30.0;',
        'if(vK>1.5){float r=length((p-vec2(0.5,0.42))*vec2(1.0,1.3));gl_FragColor=vec4(vec3(1.0,0.36,0.08)*exp(-r*r*14.0)*0.22*(0.85+0.15*sin(uTime*9.0+vS*5.0)),1.0);}',
        'else{float n=pF(vec2(p.x*2.4+vS*7.0,p.y*1.7-t)),n2=pN(vec2(p.x*8.0-vS*3.0,p.y*6.0-t*1.9)),x=p.x-0.5+(n-0.5)*0.42*p.y+(n2-0.5)*0.1*p.y,w=(1.0-p.y*0.92)*(0.32+0.16*n)*smoothstep(0.0,0.15,p.y+0.05);',
        ' float sh=smoothstep(w,w*0.1,abs(x))*smoothstep(1.0,0.25,p.y+(n-0.5)*0.6+(n2-0.5)*0.2);vec3 c=mix(vec3(0.9,0.12,0.02),vec3(2.8,1.25,0.32),smoothstep(0.1,0.8,sh))*sh+vec3(3.2,2.6,1.6)*smoothstep(0.7,1.0,sh)*smoothstep(0.55,0.0,p.y);',
        ' gl_FragColor=vec4(c*(vK<0.75?vec3(0.6,0.3,0.2):vec3(1.15)),1.0);}'].join('\n') }), S.fl.length, 5);
    S.fl.forEach(function (f, i) { D.position.set(f[0], f[1], f[2]); D.scale.set(f[3], f[4], f[5]); D.updateMatrix(); fl.setMatrixAt(i, D.matrix); });
    for (var e = 0; e < NE; e++) { var fr = S.fires[e % S.fires.length]; ep.set([fr.x, fr.y, fr.z], e * 3); es[e] = FR(); }
    eg.setAttribute('position', new T.BufferAttribute(ep, 3)); eg.setAttribute('aSeed', new T.BufferAttribute(es, 1));
    var embers = new T.Points(eg, partyShader({ uniforms: { uTime: S.time }, additive: true, vhead: 'attribute float aSeed;uniform float uTime;varying float vA;',
      vmain: 'float life=fract(uTime*(0.25+aSeed*0.3)+aSeed*7.0);vec3 p=position+vec3(sin(aSeed*50.0+uTime*1.3)*0.5*life+(aSeed-0.5)*0.4,life*(2.0+aSeed*2.5),cos(aSeed*31.0+uTime)*0.5*life);vA=(1.0-life)*smoothstep(0.0,0.05,life);vec4 mvPosition=modelViewMatrix*vec4(p,1.0);gl_Position=projectionMatrix*mvPosition;gl_PointSize=clamp(18.0/-mvPosition.z,1.0,5.0);',
      fhead: 'varying float vA;', fmain: 'gl_FragColor=vec4(vec3(3.0,1.1,0.25)*vA*(1.0-smoothstep(0.15,0.5,length(gl_PointCoord-0.5))),1.0);' }));
    embers.frustumCulled = false; ctx.scene.add(embers);
  }

  /* ------------------------------ firs, torches, VIP pergola, festoons, flags -- */
  function partyFirs(ctx) {   // firs in timber planters, snow on their boughs, fairy lights wound up each; torches along the path
    var T = THREE, S = partyState, A = partyAdd, C = partyCol, R = rng(41), list = [], VZ = partyVip;
    [[-30.6, -21.9, 3], [30.6, -21.9, 3], [-15.6, 21.4, 2.8], [15.6, 21.4, 2.8], [VZ.x0 + 0.75, VZ.z1 - 0.75, 2.4], [VZ.x0 + 0.75, VZ.z0 + 0.75, 2.6], [-31.9, 20.0, 2.8], [31.9, 15.6, 2.6]].forEach(function (f, i) {
      var y = (f[0] > 32 && f[1] > 18 ? partyVY : H(f[0], f[1])) + 0.03, ht = f[2], pl = 0.62;
      A('wood', partyBox(0.86, pl, 0.86, f[0], y + pl / 2, f[1]), C('#B4A494')); A('wood', partyBox(0.96, 0.06, 0.96, f[0], y + pl, f[1]), C('#9C8C7C')); A('snow', partySnowCap(0.78, 0.78, 0.08, f[0], y + pl + 0.02, f[1], 0, 90 + i));
      for (var k = 0; k < 5; k++) {
        var u = k / 5, h = ht * 0.36, g = new T.ConeGeometry(0.62 * (1 - u * 0.78) * (0.9 + R() * 0.2), h, 11, 1), pp = g.attributes.position;
        for (var v = 0; v < pp.count; v++) if (pp.getY(v) < 0) { var j = 1 + (R() - 0.5) * 0.35; pp.setXYZ(v, pp.getX(v) * j, pp.getY(v) - R() * 0.06, pp.getZ(v) * j); }
        g.computeVertexNormals(); list.push({ g: g.rotateY(R() * TAU).translate(f[0], y + pl + 0.1 + u * ht * 0.72 + h / 2, f[1]), c: C(['#24402E', '#1E3828', '#2A4632'][k % 3]) });
      }
      for (var b = 0; b < 26; b += ctx.quality === 'low' ? 2 : 1) { var t = b / 26, a = b * 1.05 + i, rr = 0.62 * (1 - t * 0.85) + 0.04; S.fairy.push([f[0] + Math.cos(a) * rr, y + pl + 0.2 + t * ht * 0.92, f[1] + Math.sin(a) * rr, 0.42]); }
      partyRing(ctx, f[0], f[1], 0.55);
    });
    var mat = new T.MeshStandardMaterial({ color: '#FFFFFF', vertexColors: true, roughness: 0.92 });
    if (typeof snowCover === 'function') snowCover(mat, { amount: 0.9, edge: 0.52, soft: 0.12, scale: 5, pools: 0.6 });
    var m = new T.Mesh(partyMerge(list), mat); m.castShadow = m.receiveShadow = true; ctx.scene.add(m);
    partyTorches.forEach(function (p) {
      var y = H(p[0], p[1]); A('metal', partyCyl(0.03, 0.04, 1.9, 6, p[0], y + 0.95, p[1]), C('#1C1C1E')); A('metal', partyCyl(0.1, 0.06, 0.16, 10, p[0], y + 1.94, p[1]), C('#2A2622')); A('snow', partyMound(p[0], p[1], 0.35, 0.14)); partyRing(ctx, p[0], p[1], 0.12);
      S.fl.push([p[0], y + 2.0, p[1], 0.22, 0.55, 1], [p[0] + 0.03, y + 2.0, p[1], 0.15, 0.4, 1], [p[0], y + 2.0, p[1], 1.0, 0.95, 2]);
    });
  }
  function partyPergola(ctx) {
    var A = partyAdd, C = partyCol, B = partyBox, y = partyVY, x0 = 41.3, x1 = 47.1, z0 = 20.6, z1 = 29.0, ht = 3.1, xm = (x0 + x1) / 2, zm = (z0 + z1) / 2;
    [[x0, z0], [x1, z0], [x0, z1], [x1, z1]].forEach(function (p) { A('wood', B(0.2, ht, 0.2, p[0], y + ht / 2, p[1]), C('#B4A494')); partyRing(ctx, p[0], p[1], 0.18); });
    [x0, x1].forEach(function (x) { A('wood', B(0.24, 0.3, z1 - z0 + 0.6, x, y + ht + 0.1, zm), C('#A09080')); });
    for (var k = 0; k < 10; k++) A('wood', B(x1 - x0 + 0.7, 0.14, 0.12, xm, y + ht + 0.32, z0 - 0.2 + k * (z1 - z0 + 0.4) / 9), C('#A09080'));
    A('wood', B(x1 - x0 + 0.8, 0.08, z1 - z0 + 0.8, xm, y + ht + 0.43, zm), C('#9A8A7A')); A('snow', partySnowCap(x1 - x0 + 0.8, z1 - z0 + 0.8, 0.42, xm, y + ht + 0.47, zm, 0, 88));
    for (var r = 0; r < 3; r++) for (var b = 0; b <= 12; b++) partyState.fairy.push([lerp(x0 + 0.6, x1 - 0.6, (r + 0.5) / 3), y + ht - 0.1 - Math.sin(b / 12 * PI) * 0.35, lerp(z0 + 0.3, z1 - 0.3, b / 12), 0.85]);
  }
  // poles round the deck and warm bulbs on catenaries (with the firs' and pergola's): round sprites with a hot core, and
  // their streaks in the wet boards
  function partyFestoons(ctx) {
    var T = THREE, S = partyState, low = ctx.quality === 'low', bulbs = [], wires = [], top = partyDY + partyPoleH, D = new T.Object3D(), R = rng(9), c = new T.Color();
    partyPS.concat(partyPN, partyPW, partyPE).forEach(function (p) {
      partyAdd('wood', partyCyl(0.11, 0.14, partyPoleH + 0.3, 10, p[0], partyDY + partyPoleH / 2 - 0.15, p[1]), partyCol('#B0A090')); partyAdd('metal', partyCyl(0.15, 0.15, 0.06, 10, p[0], top - 0.2, p[1]), partyCol('#1A1A1C'));
      partyAdd('snow', partySnowCap(0.26, 0.26, 0.12, p[0], top, p[1], 0, Math.floor(p[0] + p[1] * 3))); partyAdd('snow', partyMound(p[0], p[1], 0.55, 0.25)); partyRing(ctx, p[0], p[1], 0.16);
    });
    partySpans.forEach(function (s) {
      var a = s[0], b = s[1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.ceil(L / 1.2), nb = Math.floor(L / (low ? 1.4 : 0.72));
      function y(u) { return top - 0.25 - 4 * u * (1 - u) * s[2] * L; }
      for (var k = 0; k < n; k++) wires.push(lerp(a[0], b[0], k / n), y(k / n), lerp(a[1], b[1], k / n), lerp(a[0], b[0], (k + 1) / n), y((k + 1) / n), lerp(a[1], b[1], (k + 1) / n));
      for (var j = 1; j < nb; j++) bulbs.push([lerp(a[0], b[0], j / nb), y(j / nb) - 0.1, lerp(a[1], b[1], j / nb)]);
    });
    bulbs = bulbs.concat(S.fairy);
    var bm = partyInst(ctx, new T.PlaneGeometry(1, 1), partyShader({ uniforms: { uH: S.uH }, additive: true, vhead: 'uniform float uH;varying vec2 vUv;varying vec3 vC;varying float vK;varying float vP;varying float vN;',
      vmain: 'vUv=uv;vC=instanceColor;vec4 mv=viewMatrix*modelMatrix*instanceMatrix*vec4(0.0,0.0,0.0,1.0);float s=length(instanceMatrix[0].xyz),px=2.0*max(-mv.z,0.1)/(projectionMatrix[1][1]*uH),R=max(0.22*s,px*3.0);vK=0.042*s/R;vP=px/R;vN=smoothstep(0.5,4.0,-mv.z);vC*=smoothstep(0.4,1.6,-mv.z);mv.xy+=position.xy*2.0*R;gl_Position=projectionMatrix*mv;',
      fhead: 'varying vec2 vUv;varying vec3 vC;varying float vK;varying float vP;varying float vN;',
      fmain: 'float r=length(vUv-0.5)*2.0,k=max(vK,vP);gl_FragColor=vec4(vC*(smoothstep(k,k*0.45,r)*1.5*vK*vK/(k*k)+(exp(-r*r/(k*k*5.0))*0.22*min(1.0,vK/vP)+exp(-r*r*6.0)*0.035)*vN),1.0);' }), bulbs.length, 6);
    bulbs.forEach(function (b, i) { D.position.set(b[0], b[1], b[2]); D.scale.setScalar(b[3] || 1); D.updateMatrix(); bm.setMatrixAt(i, D.matrix); var k = (b[3] ? 3.2 : 2.8) * (R() < 0.05 ? 0.2 : 0.8 + R() * 0.45), w = R(); bm.setColorAt(i, c.setRGB(k, k * (0.56 + 0.14 * w), k * (0.22 + 0.18 * w))); });
    var rf = partyInst(ctx, new T.PlaneGeometry(1, 1), partyShader({ uniforms: {}, additive: true, vhead: 'varying vec2 vUv;varying vec3 vC;varying vec3 vW;',   // each bulb mirrored in the boards, a short streak toward the eye
      vmain: 'vUv=uv;vec3 b=(modelMatrix*instanceMatrix*vec4(0.0,0.0,0.0,1.0)).xyz,C=cameraPosition;float y0=' + (partyDY + 0.045).toFixed(3) + ';vec3 m=vec3(b.x,2.0*y0-b.y,b.z),f=C+(m-C)*((C.y-y0)/max(C.y-m.y,0.01));vec2 g=C.xz-f.xz;g/=max(length(g),0.001);' +
        'float sn=(C.y-y0)/length(C-f),w=0.012+0.0025*length(m-f),l=min(w*3.0/max(sn,0.05),1.2);vC=instanceColor*step(abs(f.x),32.8)*step(abs(f.z),22.8)*step(0.3,C.y-y0)*(0.04+0.96*pow(1.0-sn,5.0))*0.34;' +
        'vW=f+vec3(-g.y,0.0,g.x)*position.x*2.0*w+vec3(g.x,0.0,g.y)*position.y*2.0*l;vec4 mvPosition=viewMatrix*vec4(vW,1.0);gl_Position=projectionMatrix*mvPosition;',
      fhead: 'varying vec2 vUv;varying vec3 vC;varying vec3 vW;', fmain: 'vec2 q=(vUv-0.5)*2.0;gl_FragColor=vec4(vC*exp(-q.x*q.x*5.0-q.y*q.y*4.0)*smoothstep(0.2,0.7,pWet(vW.xz)),1.0);' }), bulbs.length, 2);
    rf.instanceMatrix = bm.instanceMatrix; rf.instanceColor = bm.instanceColor;
    var wg = new T.BufferGeometry(); wg.setAttribute('position', new T.Float32BufferAttribute(wires, 3)); ctx.scene.add(new T.LineSegments(wg, new T.LineBasicMaterial({ color: '#0A0A0C', transparent: true, opacity: 0.55 })));
  }
  function partyFlagsBuild(ctx) {   // feather flags with the peak and SOMMET; they wave, and their backs read the right way round
    var T = THREE, S = partyState, list = [], mat = new T.MeshStandardMaterial({ side: T.DoubleSide, roughness: 0.75, map: ctx.textures.canvas(256, 1024, function (g, w, h) {
      g.fillStyle = '#0F1A36'; g.fillRect(0, 0, w, h); g.fillStyle = '#C8A15A'; g.fillRect(0, 0, 10, h);
      var cx = w / 2 + 6; g.strokeStyle = g.fillStyle = '#F4F6FA'; g.lineWidth = 9; g.lineJoin = 'round'; g.beginPath();
      [[-1.25, 0.55], [-0.45, -0.35], [-0.18, -0.05], [0.25, -0.75], [1.25, 0.55]].forEach(function (p, i) { g[i ? 'lineTo' : 'moveTo'](cx + p[0] * 70, 170 + p[1] * 70); }); g.closePath(); g.stroke();
      g.font = '700 74px "Helvetica Neue", Arial, sans-serif'; g.textAlign = 'center'; 'SOMMET'.split('').forEach(function (ch, i) { g.fillText(ch, cx, 330 + i * 92); });
    }) });
    mat.onBeforeCompile = function (sh) {
      sh.uniforms.uPTime = S.time; sh.vertexShader = 'uniform float uPTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nfloat fw=uv.x*uv.x;transformed.z+=sin(uPTime*2.6+position.y*1.3)*0.12*fw+sin(uPTime*4.1+position.y*2.0)*0.04*fw;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', 'diffuseColor*=texture2D(map,gl_FrontFacing?vMapUv:vec2(1.0-vMapUv.x,vMapUv.y));');
    };
    mat.customProgramCacheKey = function () { return 'party-flag'; };
    partyFlags.forEach(function (f, i) {
      var y = H(f[0], f[1]), g = new T.PlaneGeometry(0.85, 3.2, 6, 12), p = g.attributes.position;
      for (var k = 0; k < p.count; k++) { var u = p.getX(k) / 0.85 + 0.5, v = p.getY(k) / 3.2 + 0.5; p.setX(k, 0.03 + u * 0.82 * (0.62 + 0.38 * smooth(v * 1.6)) * (v > 0.84 ? Math.sqrt(Math.max(0, 1 - Math.pow((v - 0.84) / 0.16, 2))) : 1)); p.setZ(k, -Math.sin(u * 1.4) * 0.12 * (0.3 + v)); }
      g.computeVertexNormals(); list.push({ g: g.translate(0, 2.5, 0).rotateY(-0.6 + i * 0.3).translate(f[0], y, f[1]) });
      partyAdd('metal', partyCyl(0.022, 0.026, 4.25, 6, f[0], y + 2.1, f[1]), partyCol('#26272A')); partyAdd('snow', partyMound(f[0], f[1], 0.45, 0.2)); partyRing(ctx, f[0], f[1], 0.14);
    });
    var m = new T.Mesh(partyMerge(list), mat); m.castShadow = true; ctx.scene.add(m);
  }
  function PARTY_ENV(ctx) {   // hot panels for the baked environment light
    var T = ctx.THREE, g = new T.Group();
    function panel(w, h, x, y, z, hex, k) { var m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ color: new T.Color(hex).multiplyScalar(k), side: T.DoubleSide })); m.position.set(x, y, z); m.lookAt(0, 2, 0); g.add(m); }
    [[30, 12, 0, 10, 50, '#7A2BD6', 1.4], [10, 12, -22, 9, 46, '#2BC8FF', 1.2], [10, 12, 22, 9, 46, '#FF2BB8', 1.2], [16, 5, -55, 3, 8, '#2A90FF', 0.9], [16, 5, 55, 3, 8, '#FFA040', 1.6], [26, 6, 0, 3, -50, '#FF7A30', 0.7]].forEach(function (q) { panel.apply(null, q); });
    for (var i = 0; i < 10; i++) panel(5, 1.2, Math.cos(i * 0.63) * 40, 14, Math.sin(i * 0.63) * 40, '#FFB060', 1.4);
    return g;
  }

  /* ------------------------------------------------------------- build -- */
  function partyBuild(ctx) {
    var S = partyState, T = THREE, M;
    S.B = {}; S.fairy = []; S.fl = []; S.time = { value: 0 }; S.uH = { value: 900 }; S.NB = ctx.quality === 'low' ? 13 : 19; S.bO = []; S.bD = []; S.bC = [];
    for (var i = 0; i < S.NB; i++) { S.bO.push(new T.Vector3(0, -99, 0)); S.bD.push(new T.Vector3(0, -1, 0)); S.bC.push(new T.Vector3()); }
    S.bu = { uTime: S.time, uBO: { value: S.bO }, uBD: { value: S.bD }, uBC: { value: S.bC } }; S.BU = 'uniform vec3 uBO[' + S.NB + '];uniform vec3 uBD[' + S.NB + '];uniform vec3 uBC[' + S.NB + '];';
    S.lm = partyLightmap(); S.M = M = partyMaterials(ctx); S.atlas = partyAtlas(ctx); partySnowLights();
    partyDeck(ctx); partyStage(ctx); partyBars(ctx); partyLounges(ctx); partyFirs(ctx); partyPergola(ctx); partyFestoons(ctx); partyFlagsBuild(ctx); partyFlames(ctx);
    [['wood', 1], ['metal', 1], ['chrome', 1], ['fabric', 1], ['stone', 1], ['grille', 0], ['snow', 0], ['truss', 0]].forEach(function (b) { partyFlush(ctx, b[0], M[b[0]], b[1]); });
    var gm = partyFlush(ctx, 'glow', M.glow, false), gs = partyFlush(ctx, 'glass', M.glass, false), sg = partyFlush(ctx, 'sign', partySignMat(S.atlas), false);
    if (gm) gm.userData.noReflection = true; if (gs) gs.renderOrder = 4; if (sg) { sg.renderOrder = 6; sg.userData.noReflection = true; }
    S.beat = { n: -1, ext: -10, extN: 0, bar: 0 };   // the track's beat when it plays, a 128 BPM clock when it is silent
    ctx.on('beat', function (b) { S.beat.ext = S.now || 0; S.beat.extN = (b.bar || 0) * 4 + (b.beat || 0); });
    S.pal = [['#FF2BD6', '#22D8FF', '#FFFFFF'], ['#3A6BFF', '#FFFFFF', '#FF2BD6'], ['#FF8A2A', '#FF2BD6', '#FFE2B0'], ['#22FFC8', '#2B6BFF', '#FFFFFF'], ['#B23BFF', '#FF3A7A', '#5AE0FF']].map(function (p) { return p.map(function (h) { return new T.Color(h); }); });
    S.lcol = [new T.Color(0.2, 2.4, 0.45), new T.Color(0.15, 1.3, 2.6)]; S.v = new T.Vector3(); S.v2 = new T.Vector3(); S.q = new T.Quaternion(); S.up = new T.Vector3(0, 1, 0); S.D = new T.Object3D(); S.c = new T.Color(); S.warm = new T.Color(1, 0.86, 0.7);
    partyFwBuild(ctx);
    S.ready = true;
  }

  /* --------------------------------------------------------- fireworks -- */
  // Vasseur's fireworks over the peaks behind the club (the owner's fourth chapter: "Every night at one, Vasseur buys
  // fireworks"; and the win): rockets up off the piste with a spark trail, peonies bursting 46-60 m over it, white-hot at
  // the break and fading through their colour (2 to 5: the bloom takes them), a gold willow now and then that hangs and
  // twinkles, and a boom that arrives as late as the distance says. One pool of additive points, one draw call, made at
  // build (so open.warm compiles it) and drawn empty until partyFireworks(ctx) queues a show of about seven seconds.
  var partyFwCols = ['#FF2A1A', '#FFC86A', '#8FDCFF', '#FF4FD8', '#FFFFFF', '#FFB0A0'];
  function partyFwBuild(ctx) {
    var T = THREE, N = ctx.quality === 'low' ? 900 : 1800, g = new T.BufferGeometry();
    var F = partyState.fw = { N: N, n: 0, t: 0, q: [], rk: [], low: ctx.quality === 'low', cols: partyFwCols.map(function (h) { return new T.Color(h); }),
      p: new Float32Array(N * 3), v: new Float32Array(N * 3), c: new Float32Array(N * 3), k: new Float32Array(N * 3), age: new Float32Array(N), life: new Float32Array(N), sz: new Float32Array(N), oc: new Float32Array(N * 3), os: new Float32Array(N) };
    g.setAttribute('position', new T.BufferAttribute(F.p, 3)); g.setAttribute('aCol', new T.BufferAttribute(F.oc, 3)); g.setAttribute('aSize', new T.BufferAttribute(F.os, 1));
    ['position', 'aCol', 'aSize'].forEach(function (a) { g.attributes[a].setUsage(T.DynamicDrawUsage); });
    g.setDrawRange(0, 0);
    var m = new T.Points(g, new T.ShaderMaterial({ uniforms: { uH: partyState.uH }, transparent: true, depthWrite: false, blending: T.AdditiveBlending,
      vertexShader: 'attribute vec3 aCol;attribute float aSize;uniform float uH;varying vec3 vC;void main(){vC=aCol;vec4 mv=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*mv;float s=aSize*projectionMatrix[1][1]*0.5*uH/max(-mv.z,1.0);gl_PointSize=s>0.0?clamp(s,1.5,160.0):0.0;}',
      fragmentShader: 'varying vec3 vC;void main(){vec2 q=gl_PointCoord-0.5;float a=max(0.0,1.0-dot(q,q)*4.0);a*=a;gl_FragColor=vec4(vC*(a+a*a*a*2.0),1.0);}' }));
    m.frustumCulled = false; m.renderOrder = 7; m.userData.noReflection = true; ctx.scene.add(m); F.mesh = m;
  }
  // a show: eight shells one after another, then a finale of three together
  function partyFireworks(ctx) {
    var F = partyState.fw; if (!F) return;
    for (var k = 0; k < 11; k++) F.q.push({ at: F.t + (k < 8 ? k * 0.62 + Math.random() * 0.3 : 5.6 + Math.random() * 0.25), ci: Math.floor(Math.random() * F.cols.length), w: k % 4 === 3 });
    void ctx;
  }
  function partyFwAdd(F, x, y, z, vx, vy, vz, col, k, life, size, drag, grav, flick) {
    if (F.n >= F.N) return;
    var i = F.n++, j = i * 3;
    F.p[j] = x; F.p[j + 1] = y; F.p[j + 2] = z; F.v[j] = vx; F.v[j + 1] = vy; F.v[j + 2] = vz;
    F.c[j] = col.r * k; F.c[j + 1] = col.g * k; F.c[j + 2] = col.b * k; F.k[j] = drag; F.k[j + 1] = grav; F.k[j + 2] = flick;
    F.age[i] = 0; F.life[i] = life; F.sz[i] = size;
  }
  function partyFwBurst(F, r, cam) {
    var col = F.cols[r.ci], R = Math.random, n = r.w ? (F.low ? 50 : 90) : (F.low ? 60 : 120), gold = F.cols[1], i;
    partyFwAdd(F, r.x, r.y, r.z, 0, 0, 0, F.cols[4], 3.2, 0.24, 11, 0, 0, 0);   // the flash
    for (i = 0; i < n; i++) {
      var u = R() * 2 - 1, a = R() * TAU, h = Math.sqrt(1 - u * u), sp = r.pow * (0.86 + 0.14 * R());
      if (r.w) partyFwAdd(F, r.x, r.y, r.z, Math.cos(a) * h * sp * 0.8, u * sp * 0.8 + 2, Math.sin(a) * h * sp * 0.8, gold, 2.2 + R(), 3 + R() * 0.8, 0.8, 1.0, 5.5, 1);
      else partyFwAdd(F, r.x, r.y, r.z, Math.cos(a) * h * sp, u * sp, Math.sin(a) * h * sp, i % 7 ? col : F.cols[4], 2.6 + R() * 1.6, 1.6 + R() * 0.7, 1.15, 1.4, 3.2, 0);
    }
    if (cam) partyFwBoom(Math.hypot(r.x - cam.x, r.y - cam.y, r.z - cam.z), r.w);
  }
  function partyFwStep(ctx, dt) {
    var F = partyState.fw; if (!F || (!F.n && !F.q.length && !F.rk.length)) return;
    var R = Math.random, cam = ctx.camera && ctx.camera.position, warm = F.cols[5], i, j;
    F.t += dt;
    for (i = F.q.length - 1; i >= 0; i--) if (F.q[i].at <= F.t) {
      var s = F.q.splice(i, 1)[0], x = -40 + R() * 58, z = 110 + R() * 40, fuse = 1.5 + R() * 0.4, ht = 46 + R() * 14;
      F.rk.push({ x: x, y: H(x, z), z: z, vx: (R() - 0.5) * 4, vz: (R() - 0.5) * 3, vy: 2 * ht / fuse, dec: 2 * ht / fuse / fuse, age: 0, fuse: fuse, ci: s.ci, w: s.w, pow: 18 + R() * 7 });
    }
    for (i = F.rk.length - 1; i >= 0; i--) {
      var r = F.rk[i]; r.age += dt; r.x += r.vx * dt; r.z += r.vz * dt; r.y += r.vy * dt; r.vy -= r.dec * dt;
      partyFwAdd(F, r.x, r.y, r.z, 0, 0, 0, warm, 4, 0.05, 1.3, 0, 0, 0);
      for (j = F.low ? 1 : 2; j > 0; j--) partyFwAdd(F, r.x, r.y, r.z, (R() - 0.5) * 1.2, -1.5 + R(), (R() - 0.5) * 1.2, warm, 1.6 + R(), 0.4 + R() * 0.3, 0.55, 2, 2, 0);
      if (r.age >= r.fuse) { partyFwBurst(F, r, cam); F.rk.splice(i, 1); }
    }
    for (i = 0; i < F.n; i++) {
      F.age[i] += dt;
      if (F.age[i] >= F.life[i]) {   // spent: the last one takes its place
        var l = --F.n, a3 = i * 3, b3 = l * 3;
        F.age[i] = F.age[l]; F.life[i] = F.life[l]; F.sz[i] = F.sz[l];
        for (j = 0; j < 3; j++) { F.p[a3 + j] = F.p[b3 + j]; F.v[a3 + j] = F.v[b3 + j]; F.c[a3 + j] = F.c[b3 + j]; F.k[a3 + j] = F.k[b3 + j]; }
        i--; continue;
      }
      var o = i * 3, f = F.age[i] / F.life[i], dr = Math.exp(-F.k[o] * dt), al = Math.pow(1 - f, 1.6), hot = Math.max(0, 1 - F.age[i] / 0.15);
      F.v[o] *= dr; F.v[o + 1] = F.v[o + 1] * dr - F.k[o + 1] * dt; F.v[o + 2] *= dr;
      F.p[o] += F.v[o] * dt; F.p[o + 1] += F.v[o + 1] * dt; F.p[o + 2] += F.v[o + 2] * dt;
      if (F.k[o + 2] && f > 0.45 && R() < 0.5) al *= 0.15;   // the willow's twinkle
      for (j = 0; j < 3; j++) F.oc[o + j] = (F.c[o + j] * (1 - hot * 0.5) + hot * 2.4) * al;
      F.os[i] = F.sz[i] * (1 + hot);
    }
    var G = F.mesh.geometry; G.setDrawRange(0, F.n);
    ['position', 'aCol', 'aSize'].forEach(function (a) { G.attributes[a].needsUpdate = true; });
  }
  // the boom, heard from the camera as late as the burst is far (sound at 340 m/s), duller with the distance
  function partyAmbient(ctx) {
    var A = ctx.audio; if (!A || !A.context) return;
    var ac = A.context, len = ac.sampleRate * 2, buf = ac.createBuffer(1, len, ac.sampleRate), ch = buf.getChannelData(0);
    for (var i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.exp(-i / len * 6);
    partyState.fwA = { ac: ac, out: A.destination, buf: buf };
  }
  function partyFwBoom(d, big) {
    var A = partyState.fwA; if (!A) return;
    try {
      var ac = A.ac, t0 = ac.currentTime + d / 340, s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
      s.buffer = A.buf; s.playbackRate.value = 0.45 + Math.random() * 0.2; f.type = 'lowpass'; f.frequency.value = Math.max(220, 1100 - d * 3);
      g.gain.setValueAtTime(0.0001, ac.currentTime); g.gain.setValueAtTime(Math.min(1, 70 / Math.max(d, 1)) * (big ? 1.1 : 0.8), t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 2.2);
      s.connect(f); f.connect(g); g.connect(A.out); s.start(t0); s.stop(t0 + 2.4);
    } catch (e) { partyState.fwA = null; }
  }

  /* ------------------------------------------------------------ update -- */
  function partyUpdate(ctx, t, dt) {
    var S = partyState; if (!S.ready) return;
    var cv = ctx.renderer && ctx.renderer.domElement, B = S.beat, spb = 60 / 128, n, ph;
    S.now = t; S.time.value = t; S.uH.value = cv && cv.height ? cv.height : 900; S.flakeU.uScale.value = S.uH.value * 0.9;
    if (t - B.ext < 1.2) { n = B.extN; ph = clamp((t - B.ext) / spb, 0, 0.999); } else { n = Math.floor(t / spb); ph = t / spb - n; }   // phase-locked to the track's beats, else the clock
    if (n !== B.n) { B.n = n; B.bar = Math.floor(n / 4); }
    var beatIn = n % 4, bar = B.bar, kick = Math.exp(-ph * 5), down = beatIn === 0 ? Math.exp(-ph * 3) : 0, scene = Math.floor(bar / 4) % 5, palI = Math.floor(bar / 8) % S.pal.length, pal = S.pal[palI], drop = (bar % 16) >= 12, strobe = (bar % 16) === 15;
    var U = S.ledU, heads = S.heads, v = S.v, D = S.D, q = S.q, up = S.up, deckY = partyDY, k = 1 - Math.exp(-dt * (scene === 3 ? 9 : 4.5)), i;
    S.pulse.set(0.55 + 0.9 * kick, 0.85 + 0.15 * Math.sin(t * 1.3), 0.86 + 0.14 * Math.sin(t * 13.1) * Math.sin(t * 7.3 + 1.2), 1);
    U.uBeat.value = kick * (drop ? 1.3 : 0.8); U.uScene.value = Math.floor(bar / 4) % 3; U.uFade.value = (bar % 4 === 3 && beatIn === 3) ? ph : 0;
    U.uC1.value.copy(pal[0]); U.uC2.value.copy(pal[1]); U.uC3.value.copy(pal[2]); U.uBright.value = strobe ? (Math.floor(ph * 4) % 2 ? 0.25 : 1.3) : 1;
    for (i = 0; i < heads.length; i++) {   // the moving heads: five looks, changed every four bars
      var h = heads[i], hx = h.x, w = h.want, j = h.i, col, amt;
      if (h.dj) { col = S.warm; amt = 0.55 + 0.25 * kick; } else {
        if (h.up) w.set(hx * 0.03 + (scene === 1 ? Math.sin(t * 0.7 + j * 0.9) * 0.55 : scene === 3 ? Math.sin(t * 2.2 + j) * 0.35 : Math.sin(t * 0.45 + j * 0.6) * 0.3), 1, -0.35 - 0.25 * Math.sin(t * 0.5 + j)).normalize();
        else if (scene === 0) w.copy(v.set(hx * 1.35 + Math.sin(t * 0.8 + j) * 2.5, deckY, 6 + 6 * Math.sin(t * 0.9 + j * 0.45))).sub(S.v2.set(hx, h.y, h.z)).normalize();
        else if (scene === 1) w.set(Math.sin(t * 0.55 + j * 0.7) * 0.6 + hx * 0.04, 0.25 + 0.3 * Math.sin(t * 0.8 + j), -1).normalize();
        else if (scene === 2) w.copy(v.set(-hx * 1.6 + Math.sin(t * 1.1) * 4, deckY, 2 + (j % 2) * 9 + Math.sin(t * 0.7) * 3)).sub(S.v2.set(hx, h.y, h.z)).normalize();
        else if (scene === 3) { var pa = t * 1.6 + j * 0.8; w.set(Math.cos(pa) * 0.58, -0.81, Math.sin(pa) * 0.58 - 0.3).normalize(); }
        else w.copy(v.set(Math.cos(t * 1.2) * 6, deckY, 7 + Math.sin(t * 1.2) * 5)).sub(S.v2.set(hx, h.y, h.z)).normalize();
        h.dir.lerp(w, k).normalize();
        var lv = strobe ? (Math.floor(ph * 8 + j) % 2 ? 1.6 : 0.05) : (scene === 4 ? ((n + j) % 4 === 0 ? 1 : 0.45) : 0.75 + 0.25 * kick) + down * 0.6;
        col = pal[(j + (scene === 2 ? Math.floor(n / 2) : 0)) % 2]; amt = lv * (h.up ? 0.85 : 1.0) * (col.r + col.g + col.b > 2.4 ? 0.55 : 1);
      }
      q.setFromUnitVectors(up, h.dir); D.position.set(hx, h.y, h.z); D.quaternion.copy(q); D.scale.set(1, 1, 1); D.updateMatrix();
      S.beams.setMatrixAt(i, D.matrix); S.lenses.setMatrixAt(i, D.matrix); S.bodies.setMatrixAt(i, D.matrix);
      S.beams.setColorAt(i, S.c.copy(col).multiplyScalar(amt)); S.lenses.setColorAt(i, S.c.copy(col).multiplyScalar(2 + amt * 5));
      S.bO[i].set(hx, h.y, h.z); S.bD[i].copy(h.dir); S.bC[i].set(col.r, col.g, col.b).multiplyScalar(amt * 0.35);
    }
    // lasers: the truss pair sheet, scan or cone; the lip unit fans flat sheets over the crowd on the drops and into the sky
    // otherwise; each stops where it meets the ground or the club and fades out before its end
    var Ls = S.lasers, mode = scene % 3, lcol = S.lcol[palI % 2];
    for (i = 0; i < Ls.length; i++) {
      var L = Ls[i], u = L.l / (L.n - 1) - 0.5, yaw, pit, len = 42, lit = drop || scene === 1 || scene === 4;
      if (L.e === 2) { lit = drop || scene !== 0; if (drop) { yaw = u * 1.7 + Math.sin(t * 0.7) * 0.15; pit = 0.004 + 0.01 * Math.sin(t * 1.3 + L.l); } else { yaw = u * 1.9 + Math.sin(t * 0.4) * 0.2; pit = 0.3 + 0.38 * (1 + Math.sin(t * 0.6 + L.l * 0.9)); len = 60; } }
      else if (mode === 0) { yaw = u * 1.3 + Math.sin(t * 0.6 + L.e) * 0.3; pit = -0.2 + 0.05 * Math.sin(t * 0.9); }
      else if (mode === 1) { yaw = Math.sin(t * 2.4 + L.e * 1.7) * 0.6 + u * 0.16; pit = -0.18 + u * 0.05; }
      else { var ca = t * 2.0 + L.l / L.n * TAU; yaw = Math.cos(ca) * 0.3 + (L.e - 0.5) * 0.3; pit = -0.24 + Math.sin(ca) * 0.12; }
      v.set(Math.sin(yaw) * Math.cos(pit), Math.sin(pit), -Math.cos(yaw) * Math.cos(pit));
      for (var s2 = 2; s2 < len; s2 += 1.5) { var px = L.x + v.x * s2, py = L.y + v.y * s2, pz = L.z + v.z * s2; if (py < H(px, pz) + 0.1 || (pz > 30 && Math.abs(px) < 19 && py < deckY + 14)) { len = s2; break; } }
      q.setFromUnitVectors(up, v); D.position.set(L.x, L.y, L.z); D.quaternion.copy(q); D.scale.set(1, len, 1); D.updateMatrix(); S.laserMesh.setMatrixAt(i, D.matrix);
      S.laserMesh.setColorAt(i, S.c.copy(lcol).multiplyScalar(lit ? ((Math.floor(ph * 4) + i) % 3 === 0 && mode === 1 && L.e < 2 ? 0.15 : 1) * (0.65 + 0.35 * kick) : 0));
    }
    [S.beams, S.lenses, S.bodies, S.laserMesh].forEach(function (o) { o.instanceMatrix.needsUpdate = true; if (o.instanceColor) o.instanceColor.needsUpdate = true; });
    for (i = 0; i < 2; i++) {   // the two spots follow two heads onto the floor
      var sp = S.spots[i], hd = heads[i ? 5 : 2], sh = (sp.position.y - deckY) / Math.max(0.2, -hd.dir.y);
      sp.target.position.set(clamp(sp.position.x + hd.dir.x * sh, -14, 14), deckY, clamp(sp.position.z + hd.dir.z * sh, -8, 19));
      sp.color.copy(pal[i]); sp.intensity = strobe ? (Math.floor(ph * 8) % 2 ? 14 : 0) : 7 + 5 * kick;
    }
    if (S.dj && S.dj.animate) { try { S.dj.animate(t, dt, { speed: 0, brawl: { stance: 'dance' } }); } catch (e) { S.dj = null; } }
    S.fireLights.forEach(function (l, i) { l.intensity = 6.5 + Math.sin(t * 11 + i * 3) * 0.9 + Math.sin(t * 17.3 + i) * 0.6; });
    partyFwStep(ctx, dt);
  }

  /* --------------------------------------------------------- the people -- */
  // Party guests dress for a Courchevel night: puffers, camel coats,
  // turtlenecks, beanies with poms, dark glasses; the older money in the
  // people pack's middle and old skins. One look serves the dancing crowd and
  // the guests who turn on him, so a man who swings at you is someone you saw
  // dancing a minute ago.
  var MAIN_SKIN = ['caucasian', 'caucasian2', 'asian', 'african', 'caucasian-middle', 'caucasian', 'asian-middle', 'caucasian-old'];
  var MAIN_PUFF = ['#F2F0EA', '#111114', '#B3122E', '#C9CCD2', '#1E2A44', '#E7DCC8', '#3A1F2B', '#0E3B3A'];
  // (assembly, 5 Oct: an ivory long coat and a silver dress for the guests: the painted coat and dress follow the body,
  // and in camel ('#B48A5A', and a deeper '#7A5236') or champagne ('#C9B48A') a guest seen from behind under the bars' and
  // the floor's light read as undressed; Vasseur wears a wine burgundy coat over the black turtleneck)
  var MAIN_CAMEL = '#E6DED0';
  function guestLook(ctx, i) {
    var woman = i % 3 === 1, old = i % 7 === 5;
    var skin = pick(MAIN_SKIN, i + (woman ? 3 : 0));
    if (woman) skin = skin.replace('caucasian2', 'caucasian');
    var o = {
      body: woman ? 'human-athlete-female' : 'human-athlete-male',
      skin: skin, height: woman ? 1.66 + (i % 4) * 0.03 : 1.76 + (i % 5) * 0.03,
      build: { muscle: woman ? 0.2 : 0.35 + (i % 3) * 0.15, lean: 0.5, age: old ? 0.75 : (i % 5) * 0.08, weight: old ? 0.4 : 0.15 },
      hair: woman ? pick(['long01', 'bob01', 'ponytail01', 'braid01', 'bob02'], i) : pick(['short01', 'short03', 'short02', 'short04'], i),
      hairColor: pick(['#1B130E', '#3A2618', '#C9A46A', '#6B4A2F', '#0E0C0B', '#D8D2C8'], i + (old ? 5 : 0)),
      outfit: { shoes: pick(['#EDEBE6', '#141416', '#5A3A22'], i) },
    };
    // (look pass, 5 Oct: the blond and the grey-white were tints over dark textures and drew dark: dyed, they are the
    // colours named; and the party's dyed heads compile the dye before the run, not at Vasseur's first shot)
    if (o.hairColor === '#C9A46A' || o.hairColor === '#D8D2C8') o.hairDye = true;
    var k = i % 5;
    if (woman) o.clothes = k < 2
      ? { shirt: { kind: 'dress', color: pick(['#0D0D10', '#7A0F24', '#A7A9B2', '#1C2D4E'], i) }, pants: { kind: 'none' }, jacket: { kind: 'puffer', color: pick(MAIN_PUFF, i) }, boots: pick(['#F2EFE8', '#141416'], i) }
      : { shirt: { kind: 'turtleneck', color: pick(['#F2EEE6', '#141416', '#8C1C2C'], i) }, jacket: { kind: k === 4 ? 'coat' : 'puffer', color: k === 4 ? MAIN_CAMEL : pick(MAIN_PUFF, i + 2) }, pants: { kind: 'leggings', color: '#111114' }, boots: pick(['#F2EFE8', '#3A2A1E'], i), gloves: '#141416' };
    else o.clothes = k === 0
      ? { shirt: { kind: 'turtleneck', color: '#141416' }, jacket: { kind: 'coat', color: pick([MAIN_CAMEL, '#26262B', '#4A3A2E'], i) }, pants: { kind: 'trousers', color: '#1A1A1E' }, boots: '#2A1D14', beard: pick(['none', 'stubble'], i) }
      : k === 1
        ? { shirt: { kind: 'shirt', color: '#F4F2EE', tie: false }, jacket: { kind: 'blazer', color: pick(['#0E0E12', '#2A2140', '#3B2A1E'], i) }, pants: { kind: 'trousers', color: '#121216' }, beard: pick(['stubble', 'none', 'full'], i) }
        : { shirt: { kind: pick(['sweater', 'turtleneck', 'hoodie'], i), color: pick(['#E9E4DA', '#1A1A1E', '#7A1E2B', '#2E4A6B'], i) }, jacket: { kind: 'puffer', color: pick(MAIN_PUFF, i + 1) }, pants: { kind: pick(['trousers', 'jeans', 'cargo'], i), color: pick(['#1B1B1F', '#23324A', '#3A3A3E'], i) }, boots: pick(['#EDEBE6', '#141416', '#5A3A22'], i), beard: pick(['none', 'stubble', 'none', 'full'], i) };
    o.gear = i % 4 === 0 ? { beanie: { color: pick(['#F2F2EE', '#141416', '#B3122E'], i), pom: pick(['#B3122E', '#F2F2EE', '#C9A46A'], i) } } : i % 4 === 2 ? { shades: pick(['#1A0E06', '#0B0B0D'], i) } : null;
    // (apply pass, 5 Oct: now and then a man in the people pack's dark suit, the VIP money; and with one at the party from
    // the start its material is compiled in the warm-up, not at the first suited guard's arrival)
    if (!woman && i % 11 === 6) { delete o.clothes; delete o.outfit; o.wear = ['male_elegantsuit01', { name: 'shoes03', color: '#0B0B0C' }]; }
    return o;
  }

  /* ------------------------------------------------------------ the tune -- */
  // The numbers the fight is paced by, in one place (the tune pass, 5 Oct: the owner's "straightforward realistic
  // gameplay", 10,000 GM in 15 to 25 minutes for a good player, the stakes rising chapter by chapter and no sudden cliff).
  // - The heat by the clock alone (a level every 3 minutes, never past 7), not by the takedowns: the story's beats raise it a
  //   level a chapter (2 to 7) and bring its six named bosses, one at a time, each with one man while there is room; the
  //   heat itself sends no boss and no police (it is a private party). Before, 8 takedowns raised it too, every third level
  //   sent a boss and three men on top of the house, and a good player was at heat 13 with two bosses on him at 4:30.
  // - Five on him at most; the more of them, the more the heat's own mix brings the door staff and the patrol (turn: a
  //   little over a third of the trouble is a guest turning, the rest walks in).
  // - The guests carry the money (trust funds, bankers' wallets); the door staff, the patrol and the guard carry their
  //   tips. The heat adds 12% a level to every takedown, and the staff and the patrol come more often as it rises, so the
  //   GM keeps its pace while they get harder to put down: a guest is a combo (8), a doorman nearly two (14), a patrolman
  //   or a guard two and more (18), each more as the heat rises.
  // Played on the keys by the fight bot (scripts/.scratch/alps/play/fight/run.ts, three runs each): the skilled bot reached
  // 10,000 GM in 15.4 to 17.0 minutes of play, never under 66% health; the human-paced one (slower, a quarter of its
  // presses fumbled) in 18.5 to 18.9, its least health falling chapter by chapter to 16-22% in the last two.
  var MAIN_TUNE = {
    health: 400, maxEnemies: 5, turn: 0.35,
    heat: { every: 180, kos: 0, max: 7, bosses: false, police: false, escort: 1, room: true },
    thug: { gm: 31, hp: 8, damage: 4.5 }, biker: { gm: 8, hp: 14, damage: 5.5 }, cop: { gm: 8, hp: 18, damage: 6.5 }, boss: { gm: 60, hp: 20, damage: 11 },
  };

  /* ------------------------------------------------------------ the crew -- */
  // The stakes rise in what comes for him: guests first, then the door
  // staff, then Vasseur's own guard (ski patrol in red and men in black), and
  // at every turn of the story a named man Vasseur trusts.
  var MAIN_CREW = {
    thug: {
      gm: MAIN_TUNE.thug.gm, hp: MAIN_TUNE.thug.hp, damage: MAIN_TUNE.thug.damage,
      names: ['Après-ski bro', 'Trust-fund kid', 'Hedge-fund guy', 'Ski instructor', 'Drunk banker', 'Chalet host', 'Party crasher', 'Brother-in-law'],
      look: function (ctx, i) { var o = guestLook(ctx, i * 2); o.body = 'human-athlete-male'; if (o.clothes && o.clothes.shirt && o.clothes.shirt.kind === 'dress') o.clothes = { shirt: { kind: 'sweater', color: '#E9E4DA' }, jacket: { kind: 'puffer', color: pick(MAIN_PUFF, i) }, pants: { kind: 'jeans', color: '#23324A' }, boots: '#EDEBE6' }; if (i % 3 === 2) o.weapon = { kind: 'bottle' }; return o; },
    },
    biker: {
      gm: MAIN_TUNE.biker.gm, hp: MAIN_TUNE.biker.hp, damage: MAIN_TUNE.biker.damage,
      names: ['Door staff', 'Bouncer', 'Doorman', 'Security', 'Bouncer', 'Door staff'],
      look: function (ctx, i) {
        return { skin: pick(['caucasian2', 'african', 'caucasian', 'asian'], i), hair: 'short02', height: 1.88 + (i % 3) * 0.04, build: { muscle: 0.95, lean: 0.2 },
          outfit: { shoes: '#0B0B0C' },
          clothes: { shirt: { kind: 'turtleneck', color: '#0D0D0F' }, jacket: { kind: 'puffer', color: '#0B0B0D' }, pants: { kind: 'trousers', color: '#0E0E10' }, gloves: '#0B0B0C', boots: '#0B0B0C', beard: pick(['full', 'stubble', 'none'], i) },
          gear: { beanie: { color: '#0B0B0D' } }, weapon: { kind: 'baton' } };
      },
    },
    cop: {
      gm: MAIN_TUNE.cop.gm, hp: MAIN_TUNE.cop.hp, damage: MAIN_TUNE.cop.damage,
      names: ['Ski patrol', 'Guard', 'Patroller', 'Bodyguard', 'Ski patrol', 'Bodyguard'],
      look: function (ctx, i) {
        if (i % 2) return { skin: pick(['caucasian2', 'caucasian', 'african'], i), hair: 'short04', height: 1.9, build: { muscle: 1, lean: 0.25 },
          wear: ['male_elegantsuit01', { name: 'shoes03', color: '#0B0B0C' }], gear: { shades: '#060607' }, weapon: { kind: 'baton' } };
        return { skin: pick(['caucasian', 'caucasian2', 'asian'], i), hair: 'short02', height: 1.84, build: { muscle: 0.8, lean: 0.35 },
          outfit: { shoes: '#1A1A1C' },
          clothes: { shirt: { kind: 'turtleneck', color: '#141416' }, jacket: { kind: 'puffer', color: '#C1121F' }, pants: { kind: 'cargo', color: '#141416' }, gloves: '#141416', boots: '#1A1A1C' },
          gear: { beanie: { color: '#C1121F', pom: '#F2F2EE' } }, weapon: { kind: 'baton' } };
      },
    },
    // (apply pass, 5 Oct: the heat's bosses go by titles, not the story's names, and each title has its own look, so a
    // name never comes on in another man's clothes; a chapter's boss (BEATS[].boss) comes in that man's look, MAIN_STORY_BOSS,
    // claimed by the 'chapter' handler in build: the runtime names a boss after it has dressed him, by the order he came in)
    boss: {
      gm: MAIN_TUNE.boss.gm, hp: MAIN_TUNE.boss.hp, damage: MAIN_TUNE.boss.damage,
      names: ['Head doorman', 'Patrol captain', 'Private guard', 'Chalet muscle', 'Night manager'],
      look: function (ctx, i) {
        var k = MAIN_BOSS_NEXT, o = k != null && MAIN_STORY_BOSS[k] ? MAIN_STORY_BOSS[k] : MAIN_HEAT_BOSS[i % MAIN_HEAT_BOSS.length];
        MAIN_BOSS_NEXT = null;
        return JSON.parse(JSON.stringify(o));   // a look of his own, as the runtime is given a fresh one for everyone
      },
    },
  };
  var MAIN_SUIT = ['male_elegantsuit01', { name: 'shoes03', color: '#0B0B0C' }];
  // the story's bosses, by beat: Big Dédé (the door), Chief Morel (the patrol), Kessler (the show), Roux (the guard), Le Géant
  // and The Champion (last call)
  var MAIN_STORY_BOSS = [
    { skin: 'caucasian2', hair: 'none', height: 2.04, build: { muscle: 1, lean: 0.1, weight: 0.5 }, outfit: { shoes: '#0B0B0C' },
      clothes: { shirt: { kind: 'turtleneck', color: '#0D0D0F' }, jacket: { kind: 'puffer', color: '#0B0B0D' }, pants: { kind: 'trousers', color: '#0E0E10' }, beard: 'full', gloves: '#0B0B0C', boots: '#0B0B0C' }, weapon: { kind: 'magnum' } },
    { skin: 'caucasian-middle', hair: 'short04', hairColor: '#8A8378', height: 1.92, build: { muscle: 0.9, lean: 0.3, age: 0.45 }, outfit: { shoes: '#1A1A1C' },
      clothes: { shirt: { kind: 'turtleneck', color: '#141416' }, jacket: { kind: 'puffer', color: '#9E0E1A' }, pants: { kind: 'cargo', color: '#141416' }, beard: 'stubble', gloves: '#141416', boots: '#1A1A1C' }, gear: { beanie: { color: '#9E0E1A' } }, weapon: { kind: 'pipe' } },
    { skin: 'caucasian', hair: 'short01', hairColor: '#C9C2B4', height: 1.96, build: { muscle: 1, lean: 0.2 }, wear: MAIN_SUIT, gear: { shades: '#060607' }, weapon: { kind: 'bat' } },
    { skin: 'caucasian2', hair: 'short02', hairColor: '#1B130E', height: 1.98, build: { muscle: 1, lean: 0.25 }, wear: MAIN_SUIT, gear: { shades: '#060607' }, weapon: { kind: 'baton' } },
    { skin: 'caucasian2', hair: 'none', height: 2.2, build: { muscle: 1, lean: 0, weight: 0.8 }, outfit: { shoes: '#2A1D14' },
      clothes: { shirt: { kind: 'tank', color: '#E9E4DA' }, pants: { kind: 'cargo', color: '#2E2A24' }, beard: 'full', tattoos: { arms: true, chest: true }, boots: '#2A1D14' }, weapon: { kind: 'bucket' } },
    { skin: 'african', hair: 'short02', height: 2.08, build: { muscle: 1, lean: 0.15 }, wear: MAIN_SUIT, gear: { shades: '#060607' }, weapon: { kind: 'bat' } },
  ];
  // the heat's bosses, in the order of crew.boss.names
  var MAIN_HEAT_BOSS = [
    { skin: 'african', hair: 'none', height: 2.0, build: { muscle: 1, lean: 0.15, weight: 0.4 }, outfit: { shoes: '#0B0B0C' },
      clothes: { shirt: { kind: 'turtleneck', color: '#0D0D0F' }, jacket: { kind: 'puffer', color: '#0B0B0D' }, pants: { kind: 'trousers', color: '#0E0E10' }, beard: 'stubble', gloves: '#0B0B0C', boots: '#0B0B0C' }, gear: { beanie: { color: '#0B0B0D' } }, weapon: { kind: 'baton' } },
    { skin: 'caucasian', hair: 'short02', hairColor: '#3A2618', height: 1.9, build: { muscle: 0.9, lean: 0.3 }, outfit: { shoes: '#1A1A1C' },
      clothes: { shirt: { kind: 'turtleneck', color: '#141416' }, jacket: { kind: 'puffer', color: '#C1121F' }, pants: { kind: 'cargo', color: '#141416' }, beard: 'full', gloves: '#141416', boots: '#1A1A1C' }, gear: { beanie: { color: '#C1121F', pom: '#F2F2EE' } }, weapon: { kind: 'pipe' } },
    { skin: 'asian', hair: 'short02', height: 1.94, build: { muscle: 1, lean: 0.25 }, wear: MAIN_SUIT, gear: { shades: '#060607' }, weapon: { kind: 'baton' } },
    { skin: 'caucasian', hair: 'short02', hairColor: '#6B4A2F', height: 2.08, build: { muscle: 1, lean: 0.05, weight: 0.6 }, outfit: { shoes: '#2A1D14' },
      clothes: { shirt: { kind: 'tank', color: '#3A3A3E' }, pants: { kind: 'cargo', color: '#2E2A24' }, beard: 'stubble', tattoos: { arms: true }, boots: '#2A1D14' }, weapon: { kind: 'bucket' } },
    { skin: 'caucasian-middle', hair: 'short04', hairColor: '#6E6A64', height: 1.9, build: { muscle: 0.85, lean: 0.3, age: 0.5 }, wear: MAIN_SUIT, gear: { shades: '#060607' }, weapon: { kind: 'magnum' } },
  ];
  var MAIN_BOSS_NEXT = null;

  /* ----------------------------------------------------------- the cast -- */
  // Lucien Vasseur owns the mountain; Névé plays the decks (the party's DJ on her riser, PARTY_DJ). Both invented.
  // (look pass, 5 Oct: his silver-white hair is dyed (hairDye), a tint alone drew it black; and his coat is a wine
  // burgundy light enough to read as a coat at night: '#4A1020' read as one black figure, coat, trousers and all)
  var VASSEUR = { kind: 'civ', name: 'Lucien Vasseur', look: { body: 'human-athlete-male', weapon: { kind: 'glass' }, skin: 'caucasian-old', hair: 'short01', hairColor: '#DDDAD3', hairDye: true, height: 1.84, build: { muscle: 0.3, lean: 0.5, age: 0.7, weight: 0.3 }, outfit: { shoes: '#2A1D14' },
    clothes: { shirt: { kind: 'turtleneck', color: '#0E0E10' }, jacket: { kind: 'coat', color: '#7A2232' }, pants: { kind: 'trousers', color: '#16161A' }, gloves: '#2A1D14', boots: '#2A1D14' }, gear: { shades: '#1A0E06' } } };
  var GUARD = { kind: 'cop', look: { skin: 'caucasian2', hair: 'short04', height: 1.9, build: { muscle: 1, lean: 0.25 }, wear: ['male_elegantsuit01', { name: 'shoes03', color: '#0B0B0C' }], gear: { shades: '#060607' } } };
  function cast(base, o) { var c = {}; for (var k in base) c[k] = base[k]; for (var j in o) c[j] = o[j]; return c; }

  // Marks. The VIP deck stands at SITE.vip (y 5.4), its ramp comes down its
  // south side; the stage floor is 1.25 m over the deck.
  var OWNER_AT = [SITE.vip.x - 4.5, SITE.vip.z - 3.2];
  var HERO_MID = [-4, 2];          // where a scene finds him on the deck
  // (assembly, 5 Oct: the close-ups on him stand the camera on the ground he stands on: the deck, or the path's snow)
  var DECK_Y = SITE.terrace.y, PATH_Y = H(-16, -25);
  var RED = '#FF1A1A';

  /* ---------------------------------------------------------- the scenes -- */
  var INTRO = { shots: [
    { t: 7, fade: 'in', place: 'COURCHEVEL 1850', time: '23:47  ·  -14°C',
      cam: { from: [40, 70, -200], to: [14, 34, -120], look: [0, 8, 10], lookTo: [0, 5, 14], fov: 40, fovTo: 36 },
      cast: [{ id: 'og', at: [SITE.path[0][0], SITE.path[0][1]], path: SITE.path.slice(1, 3), speed: 1.3, gait: 'walkHeavy' }] },
    { t: 6.5, say: 'It came down out of the trees at midnight. It is looking for a boy.',
      cam: { from: [-62, 3.4, -50], to: [-61, 3.0, -52], look: 'og', fov: 34 },
      cast: [{ id: 'og', at: [-80, -76], path: [[-66, -60], [-56, -50]], speed: 1.35, gait: 'walkHeavy' }] },
    { t: 7.5, vision: { tint: RED, lines: ['SCAN: 211 GUESTS', 'TARGET: MALE CHILD, AGE 12', 'MATCH: NEGATIVE', 'RESORT OWNER: L. VASSEUR'], track: 'owner' },
      cam: { from: [-15, 5.0, -24], to: [-13.5, 5.0, -21], look: [36.5, SITE.vip.y + 1.6, 24.0], lookTo: [36.5, SITE.vip.y + 1.7, 24.0], fov: 30, fovTo: 22 },
      cast: [{ id: 'og', at: [-16, -25], face: [36.5, 24.0] }, cast(VASSEUR, { id: 'owner', at: [36.5, 24.0], face: [0, 6], stance: 'arms', ghost: true })] },
    { t: 6.5, say: 'Lucien Vasseur owns this mountain. Every room, every guest, every name. And he sells all of it.',
      cam: { from: [36.3, 6.55, 13.6], to: [36.0, 6.75, 15.4], look: 'owner', fov: 28 },
      cast: [cast(VASSEUR, { id: 'owner', at: OWNER_AT, face: [36.2, 14.5], stance: 'shift', act: [['toast', 2.2, 1]], ghost: true })] },
    { t: 6, vision: { tint: RED, lines: ['PRICE OF A NAME: 10,000 GM', 'FUNDS: 0', 'ACQUIRE BY FORCE'] },
      cam: { from: [-15.6, PATH_Y + 2.05, -23.2], to: [-15.7, PATH_Y + 2.0, -23.6], look: [-16, PATH_Y + 1.8, -25], fov: 30 },
      cast: [{ id: 'og', at: [-16, -25], face: [-15.6, -23.2], stance: 'shift' },
        { id: 'g1', kind: 'thug', at: [-8, -12], path: [[-12, -18]], speed: 1.4, gait: 'walkCool', stance: 'fight', face: 'og', stay: true },
        { id: 'g2', kind: 'thug', at: [-20, -10], path: [[-18, -19]], speed: 1.5, gait: 'walkCool', stance: 'fight', face: 'og', stay: true }] },
    { t: 6, fade: 'out', title: 'AI ALPS', tagline: 'He came for one boy. He will take the whole party apart to buy one name.',
      cam: { from: [-14.5, 2.6, -31], to: [-22, 9, -40], look: [-12, 3.2, -18], lookTo: [0, 4, 12], fov: 44 },
      cast: [{ id: 'og', at: [-16, -25], face: 'g1', stance: 'fight' }, { id: 'g1', at: [-12, -18], stance: 'fight', face: 'og', stay: true }, { id: 'g2', at: [-18, -19], stance: 'fight', face: 'og', stay: true }] },
  ] };

  // A scene every 1,500 GM: what changed, and what he must do now.
  var BEATS = [
    { gm: 1500, banner: 'Chapter 2  ·  The door', objective: 'Break the door staff. Vasseur is watching.', heat: 2, boss: 'Big Dédé',
      shots: [
        { t: 5.5, fade: 'in', say: 'From the booth, Névé sees the machine. She does not stop the music.',
          cam: { from: [3.2, 5.9, 17.6], to: [2.6, 5.8, 18.6], look: PARTY_DJ, fov: 32 },
          cast: [{ id: 'og', at: HERO_MID, face: [0, 22], stance: 'fight' }] },
        { t: 6, vision: { tint: RED, lines: ['THREAT: DOOR STAFF', 'COUNT: 3', 'RISK: NEGLIGIBLE'], track: 'b2' },
          cam: { from: [-2.9, DECK_Y + 2.45, -0.6], to: [-2.85, DECK_Y + 2.4, -0.1], look: [0.5, DECK_Y + 1.8, 16], fov: 48 },
          cast: [{ id: 'og', at: HERO_MID, face: [0, 22] },
            { id: 'b1', kind: 'biker', at: [-12.8, 27.5], path: [[-12.6, 20.5], [-6, 9.5], [-3, 7]], speed: 2.2, gait: 'walkHeavy', stance: 'fight', face: 'og', stay: true },
            { id: 'b2', kind: 'biker', at: [13.2, 27.5], path: [[13.0, 20.8], [5, 10], [1, 7.5]], speed: 2.0, gait: 'walkHeavy', stance: 'fight', face: 'og', stay: true },
            { id: 'b3', kind: 'biker', at: [14.6, 25.0], path: [[14.2, 19.0], [7, 9], [4, 6]], speed: 2.1, gait: 'walkHeavy', stance: 'fight', face: 'og', stay: true }] },
      ] },
    { gm: 3000, banner: 'Chapter 3  ·  The patrol', objective: 'Hold the deck against the ski patrol.', heat: 3, boss: 'Chief Morel',
      shots: [
        { t: 5.5, fade: 'in', say: 'Vasseur makes a call. Up the mountain, the ski patrol starts down.',
          cam: { from: [33.0, SITE.vip.y + 1.65, 21.6], to: [33.3, SITE.vip.y + 1.6, 21.4], look: 'owner', fov: 36 },
          cast: [cast(VASSEUR, { id: 'owner', look: Object.assign({}, VASSEUR.look, { weapon: null }), at: OWNER_AT, face: [33.0, 21.5], stance: 'phone', ghost: true })] },
        { t: 6, say: 'Every one of them on his payroll.',
          // (assembly, 5 Oct: from west of the club, which stood in the old view; the patrol comes down past its west wall)
          cam: { from: [-31, 5.6, 21.5], to: [-30.2, 5.4, 22.3], look: [-24.5, 5.5, 54], lookTo: [-23.5, 5.0, 42], fov: 36 },
          cast: [{ id: 'og', at: HERO_MID, face: [-8, 40], stance: 'fight' },
            { id: 'p1', kind: 'cop', at: [-26.5, 57], path: [[-25, 44], [-23, 30], [-12, 14]], speed: 2.4, gait: 'walk', stance: 'fight', face: 'og', stay: true },
            { id: 'p2', kind: 'cop', at: [-22, 58.5], path: [[-22, 44], [-21, 30], [-6, 15]], speed: 2.3, gait: 'walk', stance: 'fight', face: 'og', stay: true }] },
      ] },
    { gm: 4500, banner: 'Chapter 4  ·  The show', objective: 'Keep the fund growing. Make him want the deal.', heat: 4, boss: 'Kessler',
      shots: [
        { t: 6, fade: 'in', say: 'Every night at one, Vasseur buys fireworks. Tonight he has a better show.',
          cam: { from: [2, 3.6, -36], to: [1, 4.2, -34], look: [0, 58, 160], lookTo: [0, 48, 130], fov: 46 },
          cast: [{ id: 'og', at: HERO_MID, face: [0, 30], stance: 'fight' }] },
        { t: 6, vision: { tint: RED, lines: ['OWNER: WATCHING', 'INTEREST: RISING', 'OFFER: PENDING'], track: 'owner' },
          // (assembly, 5 Oct: from the west, over the floor: the champagne bar's pergola, then the VIP deck's fir, stood in the old view)
          cam: { from: [OWNER_AT[0] - 15.5, SITE.vip.y + 2.8, OWNER_AT[1] + 0.7], to: [OWNER_AT[0] - 14.3, SITE.vip.y + 2.7, OWNER_AT[1] + 0.5], look: 'owner', fov: 26 },
          cast: [cast(VASSEUR, { id: 'owner', at: OWNER_AT, face: [HERO_MID[0], HERO_MID[1]], stance: 'shift', act: [['toast', 1.4, 1]], ghost: true })] },
      ] },
    { gm: 6000, banner: 'Chapter 5  ·  The guard', objective: '4,000 GM to go. Go through his guard.', heat: 5, boss: 'Roux',
      shots: [
        { t: 6, fade: 'in', say: 'Vasseur’s private guard. In twenty winters nobody has stood up after meeting them.',
          cam: { from: [32.2, 4.6, 1.4], to: [32.4, 4.5, 2.2], look: [36, 5.6, 18.5], lookTo: [35, 4.9, 12], fov: 36 },
          cast: [
            cast(GUARD, { id: 'k1', at: [35.0, 13.8], path: [[35.0, 7.0], [32.6, 6.4], [HERO_MID[0] + 3, HERO_MID[1] + 2]], speed: 2.0, gait: 'walkHeavy', stance: 'fight', face: 'og', stay: true }),
            cast(GUARD, { id: 'k2', at: [37.0, 14.4], path: [[37.0, 7.0], [33.6, 4.6], [HERO_MID[0] + 4, HERO_MID[1] - 1]], speed: 2.0, gait: 'walkHeavy', stance: 'fight', face: 'og', stay: true }),
            { id: 'og', at: HERO_MID, face: [SITE.vipRamp.x, SITE.vipRamp.z0], stance: 'fight' }] },
      ] },
    { gm: 7500, banner: 'Chapter 6  ·  The giant', objective: '2,500 GM to go.', heat: 6, boss: 'Le Géant',
      shots: [
        { t: 5.5, fade: 'in', vision: { tint: RED, lines: ['HULL INTEGRITY: 61%', 'LEFT HAND: SERVO DAMAGE', 'MISSION PRIORITY: UNCHANGED'] },
          cam: { from: [-3.4, DECK_Y + 1.95, 3.55], to: [-3.45, DECK_Y + 1.92, 3.3], look: [-4, DECK_Y + 1.78, 2], fov: 32 },
          cast: [{ id: 'og', at: HERO_MID, face: [HERO_MID[0] + 0.5, HERO_MID[1] + 1.4], stance: 'shift' }] },
        { t: 5.5, say: 'Vasseur sets down his glass. “Wake up Le Géant.”',
          cam: { from: [37.9, SITE.vip.y + 1.6, 19.45], to: [37.6, SITE.vip.y + 1.58, 19.6], look: 'owner', fov: 30 },
          cast: [cast(VASSEUR, { id: 'owner', at: OWNER_AT, face: [37.75, 19.5], stance: 'arms', ghost: true })] },
      ] },
    { gm: 9000, banner: 'Chapter 7  ·  Last call', objective: '1,000 GM. Then Vasseur talks.', heat: 7, boss: 'The Champion',
      shots: [
        { t: 5, fade: 'in', say: 'Névé: “Last call, Courchevel!”',
          cam: { from: [0.6, 5.0, 19.2], to: [0.5, 5.2, 19.8], look: PARTY_DJ, fov: 34 } },
        { t: 5.5, say: 'At last call, his regulars put their drinks down.',
          cam: { from: [HERO_MID[0] - 9, 7.5, HERO_MID[1] - 12], to: [HERO_MID[0] - 7, 6.2, HERO_MID[1] - 10], look: [HERO_MID[0], 3.6, HERO_MID[1]], fov: 42 },
          cast: [{ id: 'og', at: HERO_MID, face: [0, 22], stance: 'fight' },
            { id: 'x1', kind: 'thug', at: [HERO_MID[0] + 6, HERO_MID[1] + 6], to: [HERO_MID[0] + 2, HERO_MID[1] + 2], speed: 1.8, stance: 'fight', face: 'og', stay: true },
            { id: 'x2', kind: 'thug', at: [HERO_MID[0] - 6, HERO_MID[1] + 5], to: [HERO_MID[0] - 2, HERO_MID[1] + 2], speed: 1.8, stance: 'fight', face: 'og', stay: true },
            { id: 'x3', kind: 'biker', at: [HERO_MID[0] + 1, HERO_MID[1] - 7], to: [HERO_MID[0] + 0.5, HERO_MID[1] - 2.4], speed: 1.8, stance: 'fight', face: 'og', stay: true }] },
      ] },
  ];

  // 10,000 GM: the bribe, and the name.
  var OUTRO = { shots: [
    { t: 6, fade: 'in', place: '10,000 GM', time: 'THE VIP DECK  ·  01:52',
      cam: { from: [38.0, 5.0, 2.8], to: [37.6, 5.5, 5.6], look: [35.6, 6.6, 19.6], lookTo: [35.6, 6.9, 20.4], fov: 34 },
      cast: [{ id: 'og', at: [SITE.vipRamp.x, SITE.vipRamp.z0 - 2], path: [[SITE.vipRamp.x, SITE.vipRamp.z1 + 0.5], [OWNER_AT[0] - 0.4, OWNER_AT[1] - 1.6]], speed: 1.25, gait: 'walkHeavy' },
        cast(VASSEUR, { id: 'owner', at: OWNER_AT, face: 'og', stance: 'arms', ghost: true }),
        cast(GUARD, { id: 'k1', at: [37.1, 23.4], face: 'og', stance: 'arms', ghost: true })] },
    { t: 6, say: 'Vasseur: “Ten thousand. You know, most people just ask nicely.”',
      cam: { from: [32.9, SITE.vip.y + 1.65, 20.3], to: [33.1, SITE.vip.y + 1.6, 20.2], look: [35.3, SITE.vip.y + 1.55, 20.0], fov: 40 },
      cast: [{ id: 'og', at: [OWNER_AT[0] - 0.4, OWNER_AT[1] - 1.6], face: 'owner', stance: 'shift' }, cast(VASSEUR, { id: 'owner', at: OWNER_AT, face: 'og', stance: 'shift', ghost: true })] },
    { t: 7, say: 'Vasseur: “The boy checked in this morning, with his mother. Chalet Edelweiss. Top floor.”',
      cam: { from: [OWNER_AT[0] + 0.6, SITE.vip.y + 1.85, OWNER_AT[1] + 0.3], to: [OWNER_AT[0] + 0.5, SITE.vip.y + 1.85, OWNER_AT[1] + 0.1], look: 'og', fov: 30 },
      cast: [cast(VASSEUR, { id: 'owner', at: OWNER_AT, face: 'og', stance: 'shift', act: [['toast', 4.2, 1]], ghost: true })] },
    { t: 6.5, vision: { tint: RED, lines: ['TARGET LOCATED', 'CHALET EDELWEISS  ·  LEVEL 3', 'DISTANCE: 80 M', 'PROCEEDING'] },
      cam: { from: [34.75, SITE.vip.y + 1.85, 19.3], to: [34.75, SITE.vip.y + 1.85, 19.25], look: [61, 8.8, -50], lookTo: [61, 8.6, -50], fov: 26, fovTo: 12 } },
    { t: 7, fade: 'out', title: 'LOCATION ACQUIRED', tagline: 'Ten thousand GM bought one name. AI Alps will be back for the boy.',
      cam: { from: [OWNER_AT[0] - 4, SITE.vip.y + 2, OWNER_AT[1] - 6], to: [OWNER_AT[0] - 14, SITE.vip.y + 12, OWNER_AT[1] - 22], look: [36.7, 7.0, 17.2], lookTo: [39.8, 5.35, 3.3], fov: 42 },
      cast: [{ id: 'og', at: [OWNER_AT[0] - 0.4, OWNER_AT[1] - 1.6], path: [[SITE.vipRamp.x, SITE.vipRamp.z1 + 0.5], [SITE.vipRamp.x, SITE.vipRamp.z0 - 4], [60, -10]], speed: 1.3, gait: 'walkHeavy' }] },
  ] };

  /* ----------------------------------------------------------- the world -- */
  var MAIN_ASSETS = ['human-athlete-male', 'human-athlete-female', 'human-pack-male', 'human-pack-female', 'human-moves-male', 'human-moves-female'];
  GameMog.world({
    assets: (function () {
      var a = MAIN_ASSETS.slice();
      [LAND_ASSETS, RESORT_ASSETS, PARTY_ASSETS].forEach(function (l) { (l || []).forEach(function (id) { if (a.indexOf(id) < 0) a.push(id); }); });
      return a;
    })(),
    theme: { sky: '#0B1424', fog: '#1A2638', ink: '#F4F6FA', accent: '#FF2A1A', font: 'Oxanium' },
    graphics: LOOK.graphics,
    camera: LOOK.camera,
    music: PARTY_MUSIC,
    open: {
      bounds: { x: SITE.bounds.x, z: SITE.bounds.z }, ground: H, spawn: SITE.spawn,
      // the hero the owner chose: punches only, no jump, no dodge, and he walks through what comes at him
      // (apply pass, 5 Oct: the fight playtest's w2 numbers, a sturdier hero, fewer men on him at once, a level of heat by the
      // clock every 3 minutes (the takedowns raise it every 8 anyway) and a line for every level; then, with every doorman
      // armed, no batons dropped for him and nobody left stuck behind the fences, 400 health and the crew's blows (MAIN_CREW
      // damage) eased until a good player reached 10,000 again (4:30 of play) and a slower one fell at 8,500 to 9,800)
      // (the tune pass, 5 Oct: that was minutes, not the owner's 15 to 25; the pace is now MAIN_TUNE's, above)
      kicks: false, jump: false, dodge: false, tank: { block: 0.25 },
      health: MAIN_TUNE.health, maxEnemies: MAIN_TUNE.maxEnemies,
      // (the tune pass, 5 Oct: the clock's lines say only that the pressure grows; the chapters name who comes, and the clock
      // takes the heat no further than 7 now, so a line for each of heat 2 to 7)
      heat: Object.assign({ say: ['The guests are turning on the machine', 'More of them push through the crowd', 'The door staff call in more men',
        'Nobody leaves until the machine is down', 'Every man Vasseur pays is on the deck', 'The last ones standing'] }, MAIN_TUNE.heat),
      hud: { gm: 'Bribe fund', banner: 'Raise 10,000 GM. Vasseur sells names.' },
      words: { kos: 'Takedowns', kod: 'taken down', health: 'Integrity', down: 'Offline', by: ' shut you down.', won: 'The party won.' },
      goal: { gm: 10000, title: 'Location acquired', text: 'Ten thousand GM bought one name. The boy is at Chalet Edelweiss.' },
      // bottles, magnums, glasses and ice buckets stand on the bars and tables
      // (apply pass, 5 Oct: every spot filled (the runtime's default with spots), and nothing dropped by the crew: his weapons are
      // what the bars hold, not a doorman's baton)
      weapons: { spots: SPOTS, kinds: { bottle: 5, glass: 3, magnum: 2, bucket: 1 }, every: 25, drops: false },
      // the dance floor, a leaner at each bar, a pair on the VIP deck and one at each fire pit (party ZONES, filled in order);
      // those of a zone that names no stance (the fire pits) talk, stand, fold their arms, phone or sway
      civilians: { count: LOWQ ? 14 : 22, look: guestLook, zones: ZONES, stances: { talk: 3, shift: 2, arms: 1, phone: 1, drunkIdle: 1 }, wander: false, turn: { kind: 'thug', share: MAIN_TUNE.turn } },
      steps: 'snow', warm: true,
      // a knockout's coins out low, away from the camera (they had arced up into it as the man dropped), and the faces' small
      // parts left off the crowd from 10 m (the tune pass, 5 Oct)
      coinFly: 'low', lod: 10,
      story: { objective: 'Raise 10,000 GM. Vasseur sells names.', beats: BEATS },
      intro: INTRO, outro: OUTRO,
      crew: MAIN_CREW,
      keyArt: { at: [-6, -2], look: 20, tilt: 0.12 },
    },
    build: function (ctx) {
      landBuild(ctx); resortBuild(ctx); partyBuild(ctx);
      // the ground nobody can reach from the party, closed (SITE.enclosed), so nobody is sent in there
      SITE.enclosed.forEach(function (r) { ctx.solid({ min: { x: r[0], y: -60, z: r[1] }, max: { x: r[2], y: 400, z: r[3] } }); });
      // the show at the fourth chapter, and on the way out
      ctx.on('chapter', function (e) {
        if (typeof partyFireworks === 'function' && e && e.beat === 2) partyFireworks(ctx);
        // the boss the beat sends (2.8 s after the scene) is the next one dressed
        MAIN_BOSS_NEXT = e && BEATS[e.beat] && typeof BEATS[e.beat].boss === 'string' ? e.beat : null;
      });
      ctx.on('start', function () { MAIN_BOSS_NEXT = null; });
      ctx.on('goal', function () { if (typeof partyFireworks === 'function') partyFireworks(ctx); });
    },
    update: function (ctx, t, dt) { landUpdate(ctx, t, dt); resortUpdate(ctx, t, dt); partyUpdate(ctx, t, dt); },
    ambient: function (ctx) { landAmbient(ctx); if (typeof partyAmbient === 'function') partyAmbient(ctx); },
    // (look pass, 5 Oct: the night's chrome reflected the colours round him, cool snow, ice and a dark deck, and on the
    // deck he read as a grey shape on grey (the gate's colour distance 13 to 22 of 441; 7 on the open deck, 4 at the
    // ice bar from the side). A warmer nickel (the photograph's), a warm rim on his edges, colours the night has nowhere
    // else, and optics that carry: 39 on the open deck, 41 to 68 by the stage, 33 at the ice bar, 95 in the snow, and
    // 41 and 38 in two gate covers. A cool rim was tried first: it matched the cyan ice and fell to 12 there)
    player: function (ctx) { return ctx.assets.human('human-athlete-male', { endo: { metal: '#E6C89A', rim: 0.8, rimColor: '#FFDCB4', glow: 2 }, height: 1.95, build: { muscle: 1, lean: 0.4 } }); },
  });

})();
