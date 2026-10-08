// Meme Kart: To The Moon
//
// A first-party GameMog world, and the kart kind's showcase (the owner, 6 Oct 2026: "AAA Nintendo quality ... Meme
// Kart starring Pepe. featuring Doge, Shibu Inu & Bike Tyson"; his answers: 3 laps, 8 karts, contact never ends the
// run, the track To The Moon; and on 7 Oct: "needs more chaotic fun, in terms of roads, breaks, jumps and players
// interacting with each other in terms of bumps, road rage etc."). Eight karts race three laps of a circuit that leaves
// Pepe's swamp at dusk, climbs a green candlestick chart, launches off its top into space, laps a glowing moon, and
// buys the dip home, with something going on in every part of it:
//
//   the boardwalk start (the line, the grid behind it) on the still swamp water at dusk, humps off the line;
//   the lily-pad esses: right, a long left round the pond (a log wall afloat on its outside), right, mud either side
//     of the exit and a cypress log rolling across it;
//   a run past the swamp gas vents (the mud boils, then goes up in green) and a row of Airdrops to a tight corner;
//   the Candle Climb: 215 m up a rising run of giant green candles, 37 m in all, the sky going from dusk to space as
//     you rise: the chart line itself a rail to grind up its left, the step jump over Gap Up, the wick rollers, a
//     giant GM coin rolling across, three Green Candle pads;
//   the launch: a big ramp at the top of the chart under a gantry, then 14 m of nothing but the stars, through three
//     hoops of light, down onto the moon and the Moon Rail down the right of the landing;
//   the lunar circuit: a small grey world 44 m up in black space under the stars, meteors coming down in
//     red rings, a sweeper, the crater straight past a rocket and a lander with the crater gap across its left (the
//     shortcut), the Moon-crown hairpin round the glowing crater with the Crown Rail round its outside, the lunar
//     swells, round the crater's rim and off the brink, the big ramp on the rim straight;
//   Buy the Dip: the road down the red chart in four steps, a lip off every ledge, red candles toppling across two of
//     them;
//   home through the swamp: the log jump over a channel of open water, a log rolling across the straight, a tight
//     chicane in off the open water;
//   the Bayou (the faster race, 7 Oct, round 3): the Gator Rail over a channel of open water, the bayou's sweeper, the
//     Gator hairpin out at the swamp's far side, and the boardwalk's S onto the line, mud on the inside of its last
//     bend.
//
// About 1,575 m a lap and 16 m wide, with a drift in each of the pond's left, the moon's hairpin and the Gator
// hairpin. At the faster race (7 Oct, round 3: 31 m/s, 26.5 before) the lap grew from 1,300 m so that a race still
// takes its time: a lap on the autopilot is about 48 to 51 s (and never off into a gap: every full-width one has a
// full-width ramp before it, and a jump comes down where the road runs straight), and Play to the results (the
// flyover, the countdown, three laps, the podium) about 2:40 to 2:50.
// The racers are the roster's (ctx.kart.racer) where the runtime has it, and stand-in karts in their colours where it
// does not. The physics, the rules, the camera and the HUD are the runtime's (lib/runtime/kart.js).
//
// Everything is built here in code (no download, no library asset): the painted dusk sky and the space it turns to
// as you climb, the stars, the water (the runtime's), cypress, reeds, lily pads, lanterns, fireflies, the
// stands and their fans, the candles, the tickers, the moon, its rocket and its lander.
// The look is "toy-PBR": clean shapes, glossy candles, one low sun and a fill, light only where something glows, and
// the road the brightest, clearest surface near the line in every section (the owner, 7 Oct: "sometimes the road can
// be too dark against background"): light and finely grained, lane lines, a bright painted edge and a dark gutter
// under the kerb's line of light, so it parts from the water, the decks, the dust and space at a glance, and the
// racers read off it by their saturated colours and their own shadows on it (GM gold #FFC93C, MOG magenta #FF3EA5,
// boost mint #5CFFC0). No brand, no logo, no other kart racer's shapes.
(function () {
  'use strict';

  /* ------------------------------------------------------------ helpers -- */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function smooth(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  /* ---------------------------------------------------------- the lap -- */
  // The lap as a walk: straights and arcs (radius, degrees; positive turns right), each with the height the road
  // reaches by its end, eased along it, and (sixth) how far apart its control points stand. The 'top' and 'jog' of
  // the boardwalk's S are the lengths that close the loop. It starts on the line, heading east (x east, z south, y
  // up, metres).
  var SEG = [
    ['start', 's', 65, 0, 0.6, 33],
    ['lily1', 'a', 40, 45, 0.6],
    ['lily2', 'a', 28, -110, 0.6],
    ['lily3', 'a', 40, 65, 0.6],
    ['run', 's', 58.5, 0, 0.6, 33],
    ['corner', 'a', 22, 80, 1.6],
    ['climb', 's', 215, 0, 38, 36],
    ['launch', 's', 50, 0, 41.5],
    ['moon1', 'a', 60, -25, 43, 26],
    ['crater', 's', 48, 0, 44],
    ['hairpin', 'a', 19.5, 185, 44],
    ['moon2', 's', 23, 0, 44],
    // off the brink: a bend left round the crater's rim, then the rim straight, the big ramp off its edge over the
    // gap and a long straight to land on before the chute (the jump square to the road: at the faster race, 7 Oct,
    // round 3, it carried 40 to 50 m, and off the old ramp in the bend the karts came down on the verge)
    ['brink', 'a', 40, -40, 43],
    ['dip', 's', 63, 0, 42, 32],
    // Buy the Dip: the chart's own steps down, a ledge (a lip at its edge) and a drop, four times
    ['drop1', 's', 18, 0, 32, 18],
    ['ledge2', 's', 34, 0, 31, 34],
    ['drop2', 's', 18, 0, 21, 18],
    ['ledge3', 's', 34, 0, 20, 34],
    ['drop3', 's', 18, 0, 10, 18],
    ['ledge4', 's', 30, 0, 9, 30],
    ['drop4', 's', 22, 0, 1.2, 22],
    ['swamp1', 'a', 34, 40, 0.6],
    // the chicane after the log jump (8 Oct: radius 24 m, 45 degrees each way, from 16 m and 65; and a control point
    // on each straight a bend's spacing from it, its seventh field): the old one's curve overshot where the log
    // straight's points, 45 m apart, met the chicane's, 7 m apart, a kink of 3 m radius into it and of 7 m into its
    // right-hander, and a person on the keys at 31 m/s met the wall there square and bounced back at 6 m/s on lap
    // after lap (a controlled test, scripts/.scratch/kart/wall/bend.mjs: 64 bonks in 160 runs, 13 after; the
    // person models' whole races: 6 in 200, none after). 'top' and 'jog' close the loop again (27.7 and 15 m before)
    ['logs', 's', 135.6, 0, 0.6, 45, [125.6]],
    ['chic1', 'a', 24, -45, 0.6],
    ['chic2', 'a', 24, 45, 0.6],
    // the Bayou (the faster race, 7 Oct, round 3: a lap about 1,550 m, so three laps still take about 2:30): the
    // Gator Rail over the channel, the bayou's sweeper, the reeds, the Gator hairpin out at the swamp's far side, and
    // the boardwalk's S onto the line
    ['logs2', 's', 60, 0, 0.6, 30, [10]],
    ['bayou', 'a', 60, -25, 0.6, 26],
    ['reeds', 's', 40, 0, 0.6, 40],
    ['gator', 'a', 32, 145, 0.6, 13],
    ['top', 's', 26.38, 0, 0.6, 40],
    ['dive', 'a', 30, 90, 0.6, 16],
    ['jog', 's', 21.52, 0, 0.6],
    ['home', 'a', 30, -90, 0.6, 14],
    ['straight', 's', 40, 0, 0.6, 40],
  ];
  // walked a metre at a time; then control points evenly through each piece (about every 25 m on a straight unless
  // it says, closer round the tight arcs, one at each end of the chute's ledges and drops so its steps stay steps),
  // 80 at most
  var WALK = [], AT = {};
  (function () {
    var x = 0, z = 0, h = 0, y = SEG[SEG.length - 1][4];
    SEG.forEach(function (s) {
      var len = s[1] === 's' ? s[2] : s[2] * Math.abs(s[3]) * Math.PI / 180, n = Math.max(1, Math.round(len)), y0 = y;
      AT[s[0]] = WALK.length;
      for (var i = 0; i < n; i++) {
        var u = (i + 1) / n;
        y = y0 + (s[4] - y0) * u * u * (3 - 2 * u);
        if (s[1] === 's') { x += Math.cos(h) * len / n; z += Math.sin(h) * len / n; }
        else { var r = s[2], sg = Math.sign(s[3]), cx = x - Math.sin(h) * r * sg, cz = z + Math.cos(h) * r * sg; h += s[3] * Math.PI / 180 / n; x = cx + Math.sin(h) * r * sg; z = cz - Math.cos(h) * r * sg; }
        WALK.push([x, y, z, s]);
      }
    });
    for (var k in AT) AT[k] /= WALK.length;   // where each piece starts, a fraction of the lap
  })();
  var POINTS = (function () {
    var P = [[0, SEG[SEG.length - 1][4], 0]];
    SEG.forEach(function (s, q) {
      var i0 = Math.round(AT[s[0]] * WALK.length), i1 = q + 1 < SEG.length ? Math.round(AT[SEG[q + 1][0]] * WALK.length) : WALK.length;
      var step = s[5] || (s[1] === 'a' ? clamp(s[2] * 0.42, 7, 17) : 25), n = Math.max(1, Math.round((i1 - i0) / step)), M = [];
      for (var j = 1; j <= n; j++) M.push((i1 - i0) * j / n);
      // (and a straight's own extra points, metres into it (seventh): one a bend's spacing from the bend it meets, so
      // the curve through them does not overshoot where a long straight's points meet a tight bend's)
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
  function at(tag, m) { return +(AT[tag] + (m || 0) / LAP).toFixed(4); }

  /* -------------------------------------------------------- the course -- */
  // (the owner, 7 Oct: "needs more chaotic fun, in terms of roads, breaks, jumps and players interacting with each
  // other in terms of bumps, road rage etc.") Every section has something going on, and a forgiving line through all
  // of it: the full-width gaps are each jumped off a full-width ramp (hold the gas and you fly them), the ones you
  // charge-jump leave a lane round them, the rails and the shortcut are there to be taken or left, and a fall is the
  // Rescue Claw's, never the end of the run.
  //   the boardwalk: the humps off the line, the pack bouncing into the esses;
  //   the esses: a gator log rolling across the pond's exit, mud on both sides of it squeezing the pack;
  //   the run: mud geysers going off under a warning ring, a row of Airdrops;
  //   the Candle Climb: the chart line itself a rail to grind up its left (+12%), the step jump over Gap Up (a candle
  //     missing from the chart), the wick rollers to trick off, a giant GM coin rolling across, a pad onto the launch;
  //   the launch: the big ramp, nothing under you for 14 m but the stars, through the hoops, and down onto the Moon
  //     Rail to grind;
  //   the moon: meteors; the shortcut, the crater gap across the left of the straight: charge-jump it (or hit the
  //     narrow lip at its inner edge) to keep the wide line into the hairpin and line up for the Crown Rail round its
  //     outside, or squeeze through the lane on the right with everyone else; then the lunar swells;
  //   off the brink: round the crater's rim and the big ramp off its edge, under the BUY THE DIP arch;
  //   Buy the Dip: the road down the chart in four steps, a lip off every ledge, red candles toppling across two of
  //     them (their shadow first), Airdrops and a pad on the ledges;
  //   home: the log jump over a channel of open water, a log rolling across the straight, the chicane;
  //   the Bayou: a channel of open water across the right of the road (the outside of the bayou's sweeper, off the
  //     line), a narrow lip at its edge, and the Gator Rail running on over the water from just past it (off the lip,
  //     or a charge jump, and down onto the rail to grind it; or keep to the line on the left with everyone else),
  //     the bayou's sweeper, the Airdrops in the reeds, the Gator hairpin out at the swamp's far side, and the
  //     boardwalk's S onto the line (mud on the inside of its last bend).
  var COURSE = {
    shoulder: 4,
    pads: [
      { at: at('start', 26), x: -3 },
      { at: at('lily3', 30), x: 2.5 },
      { at: at('climb', 52), x: -3.5 },
      { at: at('climb', 128), x: 3.5 },
      { at: at('climb', 204), x: 0 },
      { at: at('dip', 58), x: -2.5 },
      { at: at('ledge3', 5), x: 2.5 },
      { at: at('logs2', 8), x: -2 },
    ],
    // (each the full width of the road: whoever reaches it at any pace jumps what is past it)
    ramps: [
      { at: at('climb', 92), x: 0, width: 16, size: 'small' },
      { at: at('launch', 1), x: 0, width: 16, size: 'big' },
      { at: at('dip', 12), x: 0, width: 16, size: 'big' },
      { at: at('logs', 62), x: 0, width: 16, size: 'small' },
    ],
    breaks: [
      { from: at('climb', 93.5), len: 9 },
      { from: at('launch', 2.5), len: 14 },
      { from: at('crater', 2.5), len: 9, x: [-12.6, -2.2], guard: true },
      { from: at('dip', 13.5), len: 10 },
      { from: at('logs', 63.5), len: 8, water: true },
      { from: at('logs2', 26), len: 14, x: [2.6, 13], water: true, guard: true },
    ],
    bumps: [
      { at: at('start', 36), size: 'roller', n: 3 },
      { at: at('climb', 160), size: 'roller', n: 3 },
      { at: at('crater', 2.5), x: -3.6, width: 2.6, size: 'lip' },
      { at: at('moon2', 4), size: 'roller', n: 2 },
      { at: at('drop1', 0), size: 'lip' },
      { at: at('drop2', 0), size: 'lip' },
      { at: at('drop3', 0), size: 'lip' },
      { at: at('drop4', 0), size: 'lip' },
      { at: at('logs2', 26), x: 5.2, width: 2.6, size: 'lip' },
    ],
    // the chart line up the climb's left (a lane past it along the kerb), the Moon Rail down the right of the
    // launch's landing (take the launch on the right, come down on it and grind on into the moon's first bend; down
    // the middle until 7 Oct, round 3, where at the faster race a kart going round the crater gap ahead met its end
    // and stuck), the Crown Rail round the outside of the hairpin, and the Gator Rail over the bayou's channel (come
    // down onto it off the lip at the water's edge)
    rails: [
      { points: [[at('climb', 36), -6.4], [at('climb', 56), -5.8], [at('climb', 70), -6.6], [at('climb', 84), -5.9], [at('climb', 98), -6.7], [at('climb', 112), -5.8], [at('climb', 126), -6.5], [at('climb', 140), -6.0], [at('climb', 150), -6.3]], h: 0.55 },
      { from: at('launch', 24), to: at('moon1', 16), x: 4, h: 0.9 },
      { points: [[at('crater', 26), -6.8], [at('hairpin', 60), -6.8]], h: 0.6 },
      { from: at('logs2', 31), to: at('logs2', 58), x: 5.4, h: 0.5 },
    ],
    // (the swamp's own: a log that rolls, mud that erupts; drawn here, from ctx.kart.hazards(), in this order)
    hazards: [
      { kind: 'crossing', at: at('lily3', 10), side: 'left', every: 7, offset: 2, model: false },
      { kind: 'meteor', from: at('run', 8), to: at('run', 50), every: 3.5, offset: 1, model: false },
      { kind: 'crossing', at: at('climb', 182), side: 'right', every: 6 },
      { kind: 'meteor', from: at('moon1', 0), to: at('crater', 46), every: 4, offset: 0.5 },
      { kind: 'meteor', from: at('moon2', 0), to: at('brink', 4), every: 4.5, offset: 2.5 },
      { kind: 'topple', at: at('ledge2', 18), side: 'right', every: 7, offset: 1 },
      { kind: 'topple', at: at('ledge3', 22), side: 'left', every: 7, offset: 4.5 },
      { kind: 'crossing', at: at('logs', 40), side: 'right', every: 6, offset: 3, model: false },
    ],
    offroad: [
      { from: at('lily2', 8), to: at('lily2', 40), side: 'left', width: 3, kind: 'mud' },
      { from: at('lily3', 14), to: at('lily3', 40), side: 'left', width: 2.5, kind: 'mud' },
      { from: at('hairpin', 10), to: at('hairpin', 56), side: 'right', width: 3, kind: 'shoulder' },
      { from: at('moon1', 2), to: at('moon1', 24), side: 'right', width: 2.5, kind: 'shoulder' },
      { from: at('chic2', 3), to: at('chic2', 17), side: 'left', width: 3, kind: 'mud' },
      { from: at('home', 8), to: at('home', 32), side: 'left', width: 2.5, kind: 'mud' },
      { from: at('gator', 10), to: at('gator', 72), side: 'right', width: 0.5, kind: 'shoulder' },
    ],
    walls: {
      gaps: [
        { from: at('launch', 1.5), to: at('launch', 15.5), side: 'both', water: false },
        { from: at('logs', 104), to: at('chic1', 3), side: 'right', water: true },
      ],
    },
    gm: 'auto',
    // the Airdrop crates: seven rows a lap, one in every section
    airdrops: [
      { at: at('run', 30), n: 5 },
      { at: at('climb', 26), n: 5 },
      { at: at('crater', 17), x: 3, n: 4 },
      { at: at('brink', 9), n: 5 },
      { at: at('ledge2', 6), n: 5 },
      { at: at('logs', 24), n: 4 },
      { at: at('reeds', 18), n: 5 },
    ],
  };
  // the stretches the scenery is dressed by (fractions of the lap): the light bridge's gap, the moon, the chute
  var ZONE = { lip: at('launch', 1), bridge: at('launch', 15.5), moon1: at('dip', 13.5), dipEnd: at('swamp1', 0) };

  /* ------------------------------------------------------- the racers -- */
  // Pepe (you) and the seven: the four stars, then four originals. The roster's own racer where the runtime has one
  // (ctx.kart.racer(id)); otherwise a stand-in kart in the racer's colours, with the cast's handling between them
  var ROSTER = [
    { id: 'pepe', name: 'Pepe', paint: '#4FA03A', helmet: '#2E62B8', stats: {} },
    { id: 'doge', name: 'Doge', paint: '#F2DDB4', helmet: '#D9A55B', stats: { top: 0.974, accel: 1.16, handling: 1.075, mass: 0.85 } },
    { id: 'shiba', name: 'Shiba', paint: '#C9622A', helmet: '#FBF3E6', stats: { top: 0.985, accel: 1.06, handling: 1.04, mass: 0.9, drift: 1.12 } },
    { id: 'bike', name: 'Bike Tyson', paint: '#D7263D', helmet: '#FFC93C', stats: { top: 0.98, accel: 1.12, handling: 1.06, mass: 0.82 } },
    { id: 'bull', name: 'Bull Run', paint: '#1FB86A', helmet: '#F4F4F4', stats: { top: 1.03, accel: 0.875, handling: 0.925, mass: 1.35, drift: 0.92 } },
    { id: 'bear', name: 'Big Bear', paint: '#B23A48', helmet: '#3B2A22', stats: { top: 1.02, accel: 0.9, handling: 0.94, mass: 1.3 } },
    { id: 'whale', name: 'The Whale', paint: '#2E7BEA', helmet: '#DCEBFF', stats: { top: 1.035, accel: 0.86, handling: 0.92, mass: 1.4, drift: 0.9 } },
    { id: 'mooncat', name: 'Moon Cat', paint: '#9B5DE5', helmet: '#F4F0FF', stats: { top: 0.985, accel: 1.05, handling: 1.06, mass: 0.88, drift: 1.15 } },
  ];
  function racer(ctx, k) {
    var R = ROSTER[k % ROSTER.length];
    if (ctx.kart && typeof ctx.kart.racer === 'function') { var e = ctx.kart.racer(R.id); if (e && e.object) return e; }
    return ctx.kart.greybox({ paint: R.paint, helmet: R.helmet, driver: '#E9C29A', name: R.name, stats: R.stats });
  }

  /* --------------------------------------------------------- the crowd -- */
  // Who is in the stands (the owner, 7 Oct: "need real people in stands with distinct looks like AI Alps. but could be
  // aliens or a mix"): the library's people in race-day clothes, young and old, and four aliens; each with what it
  // does (m: a clip of the motion capture, or an alien's own) and what it holds up (a sign, a foam hand)
  var FAN_WORDS = [
    ['WAGMI', '#5CFFC0', '#14121F'], ['GM', '#FFC93C', '#14121F'], ['HODL', '#FF3EA5', '#FFFFFF'], ['TO THE|MOON', '#1B1446', '#FFC93C'],
    ['PEPE', '#4FA03A', '#FFFFFF'], ['DOGE', '#F2DDB4', '#7A3E0E'], ['SHIBA', '#C9622A', '#FBF3E6'], ['BIKE|TYSON', '#D7263D', '#FFC93C'],
    ['LFG', '#9B5DE5', '#5CFFC0'], ['MOON|CAT', '#F4F0FF', '#9B5DE5'], ['BULL|RUN', '#1FB86A', '#F4F4F4'], ['BUY THE|DIP', '#FF3B5C', '#FFFFFF'],
    ['THE|WHALE', '#F4F6FA', '#2E7BEA'], ['BIG|BEAR', '#B23A48', '#FFE6C8'], ['#1', '#FFC93C', '#14121F'], ['GM', '#5CFFC0', '#14121F'],
  ];
  var WHITE_SHOES = { shoes: '#F4F2EE' }, BLACK_SHOES = { shoes: '#141416' };
  var FAN_LOOKS = [
    // the men
    { o: { skin: 'african', hair: 'short02', height: 1.84, build: { muscle: 0.6 }, outfit: WHITE_SHOES,
      clothes: { shirt: { kind: 'tee', color: '#5CFFC0' }, pants: { kind: 'jeans', color: '#2E4A6B' }, beard: 'stubble' }, gear: { cap: { color: '#14121F', backwards: true }, chain: '#E8B84A' } },
      m: 'cheer', hold: { foam: 1, c: '#FFC93C' } },
    { o: { skin: 'caucasian2', hair: 'short04', hairColor: '#5A3A22', height: 1.8, build: { muscle: 0.4 }, outfit: BLACK_SHOES,
      clothes: { shirt: { kind: 'hoodie', color: '#FF3EA5' }, pants: { kind: 'joggers', color: '#2A2A30' } }, gear: { shades: '#0B0B0D' } }, m: 'danceTwist' },
    { o: { skin: 'asian', hair: 'short02', height: 1.74, build: { muscle: 0.35 }, wear: ['male_casualsuit04', 'shoes05'], gear: { glasses: '#1A1A1C' } },
      m: 'cheer', hold: { sign: 0 } },
    { o: { skin: 'caucasian-old', hair: 'short01', hairColor: '#D8D2C8', hairDye: true, height: 1.76, build: { muscle: 0.3, lean: 0.3, age: 0.85, weight: 0.45 }, wear: ['male_casualsuit05', 'shoes01'] },
      m: 'cheer', hold: { sign: 2 } },
    { o: { skin: 'african-middle', hair: 'afro01', height: 1.82, build: { muscle: 0.5, lean: 0.3, age: 0.4, weight: 0.35 }, outfit: WHITE_SHOES,
      clothes: { shirt: { kind: 'tank', color: '#FFC93C' }, pants: { kind: 'shorts', color: '#1B1446' } }, gear: { shades: '#120A04' } }, m: 'danceCabbage' },
    { o: { skin: 'caucasian', hair: 'short03', hairColor: '#B5562A', hairDye: true, height: 1.86, build: { muscle: 0.5 }, outfit: { shoes: '#3A2A1E' },
      clothes: { shirt: { kind: 'tee', color: '#4FA03A' }, pants: { kind: 'cargo', color: '#6B6A4E' }, beard: 'full' }, gear: { cap: { color: '#2E62B8' } } },
      m: 'cheer', hold: { sign: 4 } },
    { o: { skin: 'asian-middle', hair: 'short04', hairColor: '#1B130E', height: 1.72, build: { muscle: 0.3, lean: 0.4, age: 0.45 }, outfit: BLACK_SHOES,
      clothes: { shirt: { kind: 'sweater', color: '#9B5DE5' }, jacket: { kind: 'puffer', color: '#14121F' }, pants: { kind: 'trousers', color: '#23324A' } }, gear: { beanie: { color: '#FF3EA5', pom: '#FFFFFF' } } },
      m: 'danceLambada' },
    { o: { skin: 'caucasian2', hair: 'short02', hairColor: '#3A2618', height: 1.83, build: { muscle: 0.55, lean: 0.25, weight: 0.6 }, wear: ['male_worksuit01', 'shoes02'], clothes: { beard: 'full' } },
      m: 'cheer', hold: { foam: 14, c: '#FF3EA5' } },
    { o: { skin: 'african', hair: 'short04', height: 1.9, build: { muscle: 0.75 }, outfit: WHITE_SHOES,
      clothes: { shirt: { kind: 'long', color: '#D7263D' }, pants: { kind: 'track', color: '#14121F', color2: '#FFC93C' } }, gear: { shades: '#0B0B0D', chain: '#E8B84A' } },
      m: 'cheer', hold: { sign: 7 } },
    { o: { skin: 'caucasian', hair: 'short01', hairColor: '#C9A46A', hairDye: true, height: 1.78, build: { muscle: 0.4 }, wear: ['male_casualsuit06', 'shoes06'] }, m: 'danceTwist' },
    // the women
    { f: 1, o: { skin: 'african', hair: 'braid01', height: 1.7, build: { muscle: 0.4 }, wear: ['female_sportsuit01', 'shoes05'] }, m: 'danceTwist' },
    { f: 1, o: { skin: 'caucasian', hair: 'long01', hairColor: '#D9B77A', hairDye: true, height: 1.68, build: { muscle: 0.2 }, outfit: WHITE_SHOES,
      clothes: { shirt: { kind: 'tee', color: '#FF3EA5' }, pants: { kind: 'jeans', color: '#4A6A92' } } }, m: 'cheer', hold: { sign: 3 } },
    { f: 1, o: { skin: 'asian', hair: 'bob01', height: 1.62, build: { muscle: 0.2 }, outfit: WHITE_SHOES,
      clothes: { shirt: { kind: 'hoodie', color: '#9B5DE5' }, pants: { kind: 'leggings', color: '#14121F' } } }, m: 'cheer', hold: { foam: 0, c: '#5CFFC0' } },
    { f: 1, o: { skin: 'caucasian-old', hair: 'bob02', hairColor: '#E4E1DA', hairDye: true, height: 1.64, build: { muscle: 0.15, lean: 0.4, age: 0.85, weight: 0.3 }, outfit: { shoes: '#3A2A1E' },
      clothes: { shirt: { kind: 'sweater', color: '#2E7BEA' }, pants: { kind: 'trousers', color: '#2A2A30' } }, gear: { glasses: '#5A3A22' } }, m: 'cheer', hold: { sign: 1 } },
    { f: 1, o: { skin: 'african-middle', hair: 'ponytail01', height: 1.72, build: { muscle: 0.3, lean: 0.45, age: 0.4 }, outfit: WHITE_SHOES,
      clothes: { shirt: { kind: 'tank', color: '#1FB86A' }, pants: { kind: 'shorts', color: '#F2DDB4' } } }, m: 'danceCabbage' },
    { f: 1, o: { skin: 'caucasian', hair: 'ponytail01', hairColor: '#A8381C', hairDye: true, height: 1.69, build: { muscle: 0.25 }, outfit: WHITE_SHOES,
      clothes: { shirt: { kind: 'tee', color: '#FFC93C' }, pants: { kind: 'shorts', color: '#2E4A6B' } } }, m: 'cheer', hold: { sign: 5 } },
    { f: 1, o: { skin: 'asian', hair: 'long01', hairColor: '#1B130E', height: 1.66, build: { muscle: 0.2 }, outfit: BLACK_SHOES,
      clothes: { shirt: { kind: 'long', color: '#F4F2FA', print: 'stripes', color2: '#2E7BEA' }, pants: { kind: 'jeans', color: '#1B1B1F' } } }, m: 'danceLambada', hold: { sign: 6 } },
    { f: 1, o: { skin: 'caucasian-middle', hair: 'short03', hairColor: '#3A2618', height: 1.7, build: { muscle: 0.25, lean: 0.45, age: 0.45 }, outfit: BLACK_SHOES,
      clothes: { shirt: { kind: 'turtleneck', color: '#F4F2FA' }, jacket: { kind: 'puffer', color: '#5CFFC0' }, pants: { kind: 'leggings', color: '#14121F' } }, gear: { shades: '#0B0B0D' } }, m: 'cheer' },
    // the aliens (the runtime's creature kit): small, big-headed, in fan colours
    { alien: { plan: 'biped', height: 1.35, skin: { color: '#7BD86A', color2: '#CFF5B8', glow: '#5CFFC0' }, head: { shape: 'dome', size: 1.6, eyes: { count: 2, size: 1.35, color: '#0B0D10' }, antennae: 2 },
      body: { build: 0.35, arms: 1.0, legs: 0.95, neck: 0.8 }, suit: { color: '#FF3EA5', metalness: 0.05, roughness: 0.6, sleeves: false } }, m: 'pump', hold: { sign: 1 } },
    { alien: { plan: 'biped', height: 1.25, skin: { color: '#B79CF2', glow: '#FFC93C', pattern: 'spots' }, head: { shape: 'round', size: 1.6, eyes: { count: 3, size: 1.1, shape: 'round', color: '#120A1E' }, antennae: 1 },
      body: { build: 0.4, neck: 0.7 }, suit: { color: '#FFC93C', metalness: 0.1, roughness: 0.55 } }, m: 'hail' },
    { alien: { plan: 'floater', height: 1.2, skin: { color: '#6FC8FF', glow: '#FF3EA5', spots: 6 }, head: { shape: 'round', size: 1.3, eyes: { count: 2, size: 1.5, shape: 'round' } },
      body: { tendrils: 6, arms: 0.9 } }, m: 'pump', hold: { sign: 3 } },
    { alien: { plan: 'biped', height: 1.4, skin: { color: '#FF9E5E', color2: '#FFE2C4', glow: '#5CFFC0', pattern: 'stripes' }, head: { shape: 'long', size: 1.25, eyes: { count: 2, size: 1.2, glow: '#5CFFC0' }, horns: 2 },
      body: { build: 0.3 }, suit: { color: '#14121F', sleeves: false } }, m: 'hail', hold: { foam: 15, c: '#5CFFC0' } },
  ];

  // the crowd's film, baked (scripts/kart-crowd-bake.mts, from FAN_WORDS and FAN_LOOKS above: bake again when they
  // change): a library picture a tier, its looks' frames in cells, cols across, the first row at the bottom
  var CROWD_SHEETS = {
    high: { id: 'crowd-meme-kart', frames: 12, cell: [96, 216], cols: 24 },
    low: { id: 'crowd-meme-kart-lo', frames: 10, cell: [64, 144], cols: 20 },
  };

  /* ------------------------------------------------- the world's look -- */
  var SUN = [-0.55, 0.15, -0.82];                    // low in the north-west: behind you on the line and up the chart
  var KEY = [-0.5, 0.46, -0.73];                     // the light itself stands higher than the sun's disc, so the road is lit
  var WY = 0.3;                                      // the swamp's water, 0.3 m under its road
  var C = {
    road: '#D6CABC', kerbA: '#EDEAF6', kerbB: '#6A5BC9', moss: '#3D4A2C', mud: '#4A3A2A', plank: '#5B4636',
    candle: '#2BE07A', red: '#FF3B5C', moon: '#DAD4E8', moonDark: '#A39CBB', mint: '#5CFFC0', gold: '#FFC93C', mog: '#FF3EA5',
    cypress: '#2F3B26', trunk: '#4A3A2E', lily: '#3F8A3A',
  };

  // the world's own state for update(): what moves, and what changes with the climb into space
  var W = { t: 0, space: 0 };

  GameMog.world({
    // the people in the stands (the crowd, above): the crowd's baked film, and for a laptop's people by the grid the
    // library's two bodies, their people packs (clothes, hair, older people) and their motion packs (the cheer, the dances)
    assets: ['crowd-meme-kart', 'human-athlete-male', 'human-athlete-female', 'human-pack-male', 'human-pack-female', 'human-moves-male', 'human-moves-female'],
    theme: { sky: '#1B1446', fog: '#FF8E6B', ink: '#1B1446', panel: '#F6F2FF', accent: '#5CFFC0', font: 'Bungee' },
    // the runtime's 'kart' preset (the racers graded as their sheets were drawn, the neutral curve, the speed blur),
    // with the twilight's own exposure, bloom and grade over it
    graphics: {
      preset: 'kart', exposure: 1.02,
      bloom: { strength: 0.42, threshold: 1.12, radius: 0.6 },
      grade: { contrast: 1.08, saturation: 1.08, warmth: 0.05, vignette: 0.16, split: 0.14, grain: 0 },
      shadows: { extent: 52 }, motion: 0.3,
    },
    camera: { fov: 64 },
    track: { width: 16, points: POINTS },
    // the score is the race's own (kart.score): the jazz-funk kart theme, Bb at 160 BPM, a layer more each lap and
    // up a semitone to 168 for the last, so no music of the platform's here
    kart: { laps: 3, class: 'normal', course: COURSE, score: true,
      // (a phone: the crowd's film baked at its size, and nothing else: no people packs, no people built, 8 Oct)
      lowAssets: ['crowd-meme-kart-lo'] },

    build: function (ctx) {
      var THREE = ctx.THREE, scene = ctx.scene, scenery = ctx.scenery, track = ctx.track, random = ctx.random, low = ctx.quality === 'low';
      var L = track.length, hw = track.halfWidth, wall = hw + COURSE.shoulder;
      var lip = ZONE.lip * L, bridge = ZONE.bridge * L, moonEnd = ZONE.moon1 * L, dipEnd = ZONE.dipEnd * L;
      function wrap(d) { d %= L; return d < 0 ? d + L : d; }
      function named(n, o) { o.name = n; return o; }
      function inside(d, a, b) { d = wrap(d); a = wrap(a); b = wrap(b); return a <= b ? d >= a && d < b : d >= a || d < b; }
      var onMoon = function (d) { return inside(d, bridge, moonEnd); };
      var onBridge = function (d) { return inside(d, lip, bridge); };
      var roadY = function (d) { return track.frameAt(d).pos.y; };

      /* -------- light and sky: a dusk over the swamp that gives way to space as you climb -- */
      // (W.space, 0 in the swamp to 1 on the moon, set by the camera's height in update(): the zenith goes first, then
      // the whole sky to black, the stars and the Milky Way come out, the sun goes white and the haze clears)
      var sky = ctx.sky({ top: '#22185A', horizon: '#FF9468', bottom: '#1A1830', sun: SUN, sunColor: '#FFB27A', sunSize: 2.6, glow: 1.5, haze: 0.8, curve: 0.3 });
      void sky;
      var hemi = new THREE.HemisphereLight('#B6B0E6', '#3A4A3C', 1.15);
      scene.add(hemi);
      var sun = new THREE.DirectionalLight('#FFBE92', 2.7);
      sun.position.set(KEY[0] * 200, KEY[1] * 200, KEY[2] * 200); sun.castShadow = true;
      scene.add(sun);
      W.hemi = hemi; W.sun = sun;
      W.lit = { sky0: new THREE.Color('#B6B0E6'), sky1: new THREE.Color('#8E9AC4'), gnd0: new THREE.Color('#3A4A3C'), gnd1: new THREE.Color('#26262E'), sun0: new THREE.Color('#FFBE92'), sun1: new THREE.Color('#FFF6EC') };
      scene.fog = new THREE.Fog('#8C6688', 110, 820);
      W.fog = scene.fog; W.fogNear = 110; W.fogFar = 820;
      // (up in space the far swamp fogs into the faint violet of the airglow along the horizon, not black: from the
      // top of the chute it read as a black band under the stars)
      W.fogLow = new THREE.Color('#8C6688'); W.fogHigh = new THREE.Color().setRGB(0.034, 0.022, 0.07);

      // space: a dome round the camera, black with the Milky Way's dust lane across it and a white sun, drawn over
      // the dusk sky from the zenith down; by the moon it covers it all, horizon and all
      var spaceMat = new THREE.ShaderMaterial({
        uniforms: { uSpace: { value: 0 }, uSun: { value: new THREE.Vector3(SUN[0], SUN[1] + 0.12, SUN[2]).normalize() } },
        vertexShader: 'varying vec3 vDir; void main() { vDir = position; vec4 c = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = c.xyww; gl_Position.z *= 0.999985; }',
        fragmentShader: [
          'uniform float uSpace; uniform vec3 uSun; varying vec3 vDir;',
          'float h3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }',
          'float n3(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y), mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z); }',
          'void main() {',
          '  vec3 d = normalize(vDir);',
          '  float a = clamp(uSpace * (smoothstep(-0.1, 0.45, d.y) + uSpace * uSpace * 1.25), 0.0, 1.0);',
          // (the galaxy: a band round a tilted great circle, mottled, a dark lane down it, faint violet and teal)
          '  vec3 ax = normalize(vec3(0.35, 0.55, -0.76)); float b = dot(d, ax), band = exp(-b * b * 18.0) * (0.55 + 0.45 * n3(d * 3.0));',
          '  float m = n3(d * 9.0) * 0.6 + n3(d * 23.0) * 0.4, lane = smoothstep(0.05, 0.0, abs(b + 0.04 * (n3(d * 5.0) - 0.5))) * (0.4 + 0.6 * n3(d * 13.0));',
          '  vec3 col = vec3(0.006, 0.006, 0.02) + band * (0.05 + 0.11 * m) * mix(vec3(0.55, 0.42, 0.9), vec3(0.35, 0.75, 0.85), n3(d * 4.0)) * (1.0 - 0.45 * lane);',
          '  float c = max(dot(d, uSun), 0.0); col += vec3(1.0, 0.97, 0.92) * (smoothstep(0.99975, 0.99985, c) * 6.0 + pow(c, 900.0) * 0.5 + pow(c, 60.0) * 0.02);',
          // (the airglow: a thin violet band along the horizon, the colour the far swamp fogs into up here)
          '  col = mix(col, vec3(0.034, 0.022, 0.07), exp(-abs(d.y) * 14.0));',
          '  gl_FragColor = vec4(col, a);',
          '}',
        ].join('\n'),
        side: THREE.BackSide, transparent: true, depthWrite: false, fog: false,
      });
      var space = new THREE.Mesh(new THREE.SphereGeometry(980, 40, 20), spaceMat);
      space.frustumCulled = false; space.renderOrder = -999; space.userData.gmSky = true; scene.add(space);
      // the stars: thousands, a few bright, crowded along the galaxy; below the horizon too once the sky is black
      var NS = low ? 1300 : 3200, sp = new Float32Array(NS * 3), sa = new Float32Array(NS * 2), GX = new THREE.Vector3(0.35, 0.55, -0.76).normalize(), sv = new THREE.Vector3();
      for (var i = 0; i < NS; i++) {
        sv.set(random() * 2 - 1, random() * 2 - 1, random() * 2 - 1); if (sv.lengthSq() < 0.01) sv.set(0, 1, 0);
        sv.normalize(); if (i % 3 === 0) sv.addScaledVector(GX, -sv.dot(GX) * (0.75 + random() * 0.2)).normalize();
        if (sv.y < -0.35) sv.y = -sv.y;
        sp[i * 3] = sv.x * 900; sp[i * 3 + 1] = sv.y * 900; sp[i * 3 + 2] = sv.z * 900;
        sa[i * 2] = random() * 6.28; sa[i * 2 + 1] = 0.35 + Math.pow(random(), 4) * 2.2;
      }
      var sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3)); sg.setAttribute('aStar', new THREE.BufferAttribute(sa, 2));
      var starMat = new THREE.ShaderMaterial({
        uniforms: { uT: { value: 0 }, uSpace: { value: 0 }, uPx: { value: low ? 1.7 : 2.3 } },
        vertexShader: 'attribute vec2 aStar; uniform float uT, uSpace, uPx; varying float vA; void main() { vec3 d = normalize(position); float tw = 0.7 + 0.3 * sin(uT * (1.3 + aStar.y) + aStar.x * 7.0); vA = tw * aStar.y * mix(smoothstep(0.04, 0.4, d.y), 1.0, uSpace * uSpace) * (0.05 + 0.95 * uSpace); vec4 c = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = c.xyww; gl_Position.z *= 0.99998; gl_PointSize = uPx * (0.6 + aStar.y * 0.55); }',
        fragmentShader: 'varying float vA; void main() { vec2 q = gl_PointCoord - 0.5; float r = dot(q, q); if (r > 0.25) discard; gl_FragColor = vec4(vec3(1.0, 0.97, 1.08) * vA * 1.7 * (1.0 - r * 4.0), 1.0); }',
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      });
      var stars = new THREE.Points(sg, starMat);
      stars.frustumCulled = false; stars.renderOrder = -998; scene.add(stars);
      // (no planet in the sky, on any lap: the owner, 7 Oct, "remove planet earth from sky from all laps, it is
      // distracting"; space is the stars, the galaxy and the white sun)
      W.stars = starMat; W.spaceMat = spaceMat; W.spaceDome = space; W.starPts = stars;

      /* -------- the water: the runtime's, still and dark, holding the sky (its reflection on laptops only) -- */
      // (it lies 0.3 m under the swamp's road: through the swamp it comes right up to a low bank at the kerb)
      // (it takes no shadows: a still mirror shows the sky, and the moon's shadow on it ended square at the shadow
      // map's edge; and update() dims the dusk it holds as you climb, so on a phone, with no live reflection, it
      // never lies sunset-lit under a black sky)
      W.water = ctx.water({ y: WY, color: '#2E6660', deep: '#10283A', waves: 0, wind: [1, 0.35], reflect: low ? false : 0.9, size: 2400 });
      if (W.water) W.water.receiveShadow = false;

      /* -------- geometry along the lap: bands swept along it, merged by material -- */
      var BUILD = {};
      function bucket(name) { return BUILD[name] || (BUILD[name] = { p: [], u: [], c: [], i: [], n: 0 }); }
      // sweep a profile ([across, up] pairs, or a function of d giving them) from d0 to d1 on one side (1 right,
      // -1 left: across is mirrored) into a bucket; tile: metres of lap a texture's v runs over; ur: the part of
      // the texture's width it uses ([u0, u1], for an atlas); col: a colour for every vertex (a glow's, say)
      function sweep(name, d0, d1, prof, side, step, tile, ur, col) {
        var B = bucket(name), n = Math.max(1, Math.round((d1 - d0) / (step || 2))), base = B.n, m = 0, u0 = ur ? ur[0] : 0, u1 = ur ? ur[1] : 1;
        for (var s = 0; s <= n; s++) {
          var d = d0 + (d1 - d0) * s / n, f = track.frameAt(d), P = typeof prof === 'function' ? prof(d, f) : prof;
          m = P.length;
          for (var q = 0; q < m; q++) {
            var a = P[q][0] * side, h = P[q][1];
            B.p.push(f.pos.x + f.right.x * a + f.up.x * h, f.pos.y + f.right.y * a + f.up.y * h, f.pos.z + f.right.z * a + f.up.z * h);
            B.u.push(u0 + (u1 - u0) * (m > 1 ? q / (m - 1) : 0), d / (tile || 8));
            if (col) B.c.push(col.r, col.g, col.b);
          }
          if (s < n) for (q = 0; q < m - 1; q++) { var A = base + s * m + q, Bq = A + m; if (side > 0) B.i.push(A, A + 1, Bq, A + 1, Bq + 1, Bq); else B.i.push(A, Bq, A + 1, A + 1, Bq, Bq + 1); }
        }
        B.n += (n + 1) * m;
      }
      function meshOf(name, mat, opts) {
        var B = BUILD[name]; if (!B || !B.n) return null;
        var g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(B.p, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(B.u, 2));
        if (B.c.length === B.p.length) g.setAttribute('color', new THREE.Float32BufferAttribute(B.c, 3));
        g.setIndex(B.i); g.computeVertexNormals();
        var m = new THREE.Mesh(g, mat);
        m.name = name; m.receiveShadow = true; m.castShadow = !!(opts && opts.cast);
        m.userData.gmKart = true;
        if (opts && opts.track) m.userData.gmTrack = true;
        scene.add(m); return m;
      }
      // a lit shape (already where it stands) put into the lap's one mesh of light, in its own colours or in col
      function toGlow(geo, col) {
        var B = bucket('glow'), g = geo.index ? geo : geo, pa = g.attributes.position, ca = g.attributes.color, base = B.n;
        for (var v = 0; v < pa.count; v++) { B.p.push(pa.getX(v), pa.getY(v), pa.getZ(v)); B.u.push(0, 0); if (ca) B.c.push(ca.getX(v), ca.getY(v), ca.getZ(v)); else B.c.push(col.r, col.g, col.b); }
        if (g.index) for (var q = 0; q < g.index.count; q++) B.i.push(base + g.index.getX(q)); else for (q = 0; q < pa.count; q++) B.i.push(base + q);
        B.n += pa.count;
      }
      // the lap in runs, cut where a stretch is left out (the light bridge, the moon, the chute) or the course opens
      function runs(skip) {
        var out = [], s = null, STEP = 0.5;
        for (var d = 0; d <= L; d += STEP) {
          var off = skip(Math.min(d, L - 0.01));
          if (!off && s == null) s = d;
          if ((off || d + STEP > L) && s != null) { out.push([s, off ? d : L]); s = null; }
        }
        return out.filter(function (r) { return r[1] - r[0] >= 1; });
      }
      // a run cut again wherever key(d) changes (the zone, the kind of kerb): fn(from, to, key)
      function pieces(r, key, fn) {
        var d = r[0];
        while (d < r[1]) { var k0 = key(d), e = d; while (e < r[1] && key(e) === k0) e += 0.5; fn(d, Math.min(e, r[1]), k0); d = e; }
      }
      var GAPS = COURSE.walls.gaps.map(function (g) { return { d0: g.from * L, d1: g.to * L, side: g.side === 'left' ? -1 : g.side === 'right' ? 1 : 0, water: g.water }; });
      function gapAt(d, side) { for (var q = 0; q < GAPS.length; q++) { var G = GAPS[q]; if ((G.side === 0 || G.side === side) && inside(d, G.d0, G.d1)) return G; } return null; }
      // the course's breaks, where the road is gone: none of the lap's own road, kerb, verge or wall is drawn over
      // one (the runtime draws the drop, or the swamp's water shows), only the road left beside one across part of it
      var BRK = COURSE.breaks.map(function (b) { var x = b.x || [-wall - 1, wall + 1]; return { d0: b.from * L, d1: b.from * L + b.len, x0: x[0], x1: x[1], water: !!b.water, full: x[0] <= -hw && x[1] >= hw }; });
      function holeAt(d, x) { for (var q = 0; q < BRK.length; q++) { var B = BRK[q]; if (inside(d, B.d0, B.d1) && x >= B.x0 && x <= B.x1) return B; } return null; }
      function full(d) { var B = holeAt(d, 0); return !!(B && B.full); }
      // (a break across part of the road at d: its index, or -1; and the road left beside it, [from, to] across)
      function partAt(d) { for (var q = 0; q < BRK.length; q++) { var B = BRK[q]; if (!B.full && inside(d, B.d0, B.d1) && B.x1 > -hw && B.x0 < hw) return q; } return -1; }
      function leftOf(q) { var B = BRK[q]; return B.x0 <= -hw ? [B.x1, hw] : [-hw, B.x0]; }
      // what is under the road here: the swamp (a bank into the water), a deck (the chart's, high on its candles),
      // the moon (its own ground), or the light bridge (nothing)
      function zoneAt(d) { return onBridge(d) ? 'bridge' : onMoon(d) ? 'moon' : inside(d, moonEnd, dipEnd) ? 'dip' : inside(d, AT.climb * L, lip) ? 'climb' : 'swamp'; }
      // the piece of the lap at d (a SEG row), and whether it is a bend tight enough for a rumble kerb
      function pieceAt(d) { var fr = wrap(d) / L, best = SEG[0]; SEG.forEach(function (s) { if (AT[s[0]] <= fr) best = s; }); return best; }
      function tight(d) { var s = pieceAt(d); return s[1] === 'a' && s[2] <= 42; }
      var ZC = { swamp: '#FFC98A', climb: C.mint, moon: '#8FE9FF', dip: C.red, bridge: C.mint };
      var boardwalk = function (d) { return inside(d, AT.home * L, AT.lily1 * L + 4); };

      // the road: the brightest, clearest surface by the line in every section (the owner, 7 Oct: "sometimes the
      // road can be too dark against background"), a light surface with a fine grain, lane lines, a bright painted
      // edge and a dark gutter for the kerb's line of light to run in, so it parts from the water, the decks, the
      // dust and the black of space at a glance; one atlas, a column a section, and its light (the lines that glow)
      // in a second, smaller one: one mesh, one draw. Through the swamp light warm asphalt (cream edges, cream
      // dashes); up the chart pale glass on a chart's grid, the grid lit mint; on the moon light lavender panels,
      // their seams the lanes, neon ice edges; down the dip light grey asphalt, red steps down each edge, red dashes.
      // (a square metre is 32 px, 16 on a phone; every column is the road's 16 m across and 16 m of it along)
      var RC = { swamp: 0, climb: 1, moon: 2, dip: 3 };
      function roadPaint(lit) {
        return function (g, w, h) {
          var cw = w / 4, pm = cw / 16, R = mulberryLike(lit ? 37 : 31), n, q, k, y, gr;
          var X = function (m) { return n * cw + (m + 8) * pm; };
          // (a band across, from m0 to m1 out from the centre, on both sides)
          var band = function (m0, m1, col) { g.fillStyle = col; g.fillRect(X(m0), 0, (m1 - m0) * pm, h); g.fillRect(X(-m1), 0, (m1 - m0) * pm, h); };
          var dashes = function (m, wid, dash, gap, col) { g.fillStyle = col; for (y = 0; y < h; y += (dash + gap) * pm) [-m, m].forEach(function (s) { g.fillRect(X(s - wid / 2), y, wid * pm, dash * pm); }); };
          // (the grain: specks dark and light, scaled to the column's size)
          var specks = function (dark, light, count) { for (q = 0; q < count; q++) { var v = R(); g.fillStyle = v < 0.5 ? dark : light; g.fillRect(n * cw + R() * cw, R() * h, v > 0.97 ? 2 : 1, 1); } };
          var mottle = function (dark, light, count) {
            g.save(); g.beginPath(); g.rect(n * cw, 0, cw, h); g.clip();
            for (q = 0; q < count; q++) { var x = n * cw + R() * cw, yy = R() * h, r = (2 + R() * 5) * pm, c = R() < 0.5 ? dark : light; [-h, 0, h].forEach(function (oy) { gr = g.createRadialGradient(x, yy + oy, 0, x, yy + oy, r); gr.addColorStop(0, c); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - r, yy + oy - r, r * 2, r * 2); }); }
            g.restore();
          };
          var area = cw * h / (512 * 512);
          g.fillStyle = '#000000'; g.fillRect(0, 0, w, h);
          // the swamp: light warm asphalt
          n = RC.swamp;
          if (!lit) {
            g.fillStyle = '#D6CABC'; g.fillRect(n * cw, 0, cw, h);
            mottle('rgba(84,70,66,0.10)', 'rgba(236,222,206,0.10)', 22);
            // (the wheel tracks, a shade polished; a sealed crack or two)
            [-3.2, 3.2].forEach(function (m) { gr = g.createLinearGradient(X(m - 1.4), 0, X(m + 1.4), 0); gr.addColorStop(0, 'rgba(70,58,56,0)'); gr.addColorStop(0.5, 'rgba(70,58,56,0.09)'); gr.addColorStop(1, 'rgba(70,58,56,0)'); g.fillStyle = gr; g.fillRect(X(m - 1.4), 0, 2.8 * pm, h); });
            g.strokeStyle = 'rgba(70,58,60,0.22)'; g.lineWidth = Math.max(1, pm / 24);
            for (q = 0; q < 4; q++) { var px = X(-6 + R() * 12), py = R() * h; g.beginPath(); g.moveTo(px, py); for (k = 0; k < 4; k++) { px += (R() - 0.5) * pm; py += pm * (0.6 + R()); g.lineTo(px, py); } g.stroke(); }
            specks('rgba(64,52,50,0.22)', 'rgba(255,246,230,0.16)', 20000 * area);
            dashes(2.67, 0.16, 4, 4, '#FFF2DA');
            band(6.75, 7.0, '#FFEFC9');
            band(7.0, 8.0, '#2E2632');
          } else {
            // (and a faint warmth of its own, the lanterns' and the dusk's, so it holds its value backlit at sundown)
            g.fillStyle = '#3A3028'; g.fillRect(X(-7.0), 0, 14 * pm, h); band(6.75, 7.0, '#3A2C16');
          }
          // the chart: pale glass on the chart's grid (a line every 2 m, a strong one every 8)
          n = RC.climb;
          if (!lit) {
            g.fillStyle = '#B9E0CF'; g.fillRect(n * cw, 0, cw, h);
            for (var gx = -6; gx < 6; gx += 2) for (var gy = 0; gy < 16; gy += 2) { g.fillStyle = R() < 0.5 ? 'rgba(255,255,255,0.10)' : 'rgba(40,110,84,0.06)'; g.fillRect(X(gx) + 1, gy * pm + 1, 2 * pm - 2, 2 * pm - 2); }
            specks('rgba(40,90,70,0.10)', 'rgba(255,255,255,0.14)', 9000 * area);
          }
          for (var gm = -6; gm <= 6; gm += 2) { g.fillStyle = lit ? (gm % 8 ? '#123E2E' : '#2A8C64') : (gm % 8 ? '#86CDB0' : '#3FB585'); g.fillRect(X(gm) - (gm % 8 ? 1 : 2), 0, gm % 8 ? 2 : 4, h); }
          for (var gv = 0; gv < 16; gv += 2) { g.fillStyle = lit ? (gv % 8 ? '#123E2E' : '#2A8C64') : (gv % 8 ? '#86CDB0' : '#3FB585'); g.fillRect(X(-6.75), gv * pm - (gv % 8 ? 1 : 2), 13.5 * pm, gv % 8 ? 2 : 4); }
          band(6.75, 7.0, lit ? '#2E9C70' : '#EAFFF5');
          if (!lit) band(7.0, 8.0, '#0F2A22');
          // the moon: light lavender panels, 4 m square, their seams the lanes, lit softly from within
          n = RC.moon;
          if (!lit) {
            g.fillStyle = '#8C88AC'; g.fillRect(n * cw, 0, cw, h);
            for (var px0 = -6.75; px0 < 6.7; px0 += 13.5 / 3) for (var py0 = 0; py0 < 16; py0 += 4) {
              var x0 = X(px0) + 0.05 * pm, x1 = X(px0 + 4.5) - 0.05 * pm, y0 = py0 * pm + 0.05 * pm, y1 = (py0 + 4) * pm - 0.05 * pm;
              gr = g.createRadialGradient((x0 + x1) / 2, (y0 + y1) / 2, 0, (x0 + x1) / 2, (y0 + y1) / 2, 3 * pm);
              var alt = (Math.round(px0) + py0) % 8 === 0;
              gr.addColorStop(0, alt ? '#E0DCF8' : '#DCE0F6'); gr.addColorStop(1, alt ? '#C2BAE4' : '#BCC4E6'); g.fillStyle = gr; g.fillRect(x0, y0, x1 - x0, y1 - y0);
            }
            specks('rgba(90,84,130,0.12)', 'rgba(255,255,255,0.16)', 9000 * area);
            band(6.75, 7.0, '#D8FAFF');
            band(7.0, 8.0, '#141430');
          } else {
            for (var px1 = -6.75; px1 < 6.7; px1 += 13.5 / 3) { g.fillStyle = '#1E1C34'; g.fillRect(X(px1) + 0.05 * pm, 0, 4.4 * pm, h); }
            // (a stud of light at every panel's corner along the lanes)
            g.fillStyle = '#5FB8D0'; [-2.25, 2.25].forEach(function (m) { for (y = 0; y < 16; y += 4) g.fillRect(X(m) - 0.12 * pm, y * pm - 0.12 * pm, 0.24 * pm, 0.24 * pm); });
            band(6.75, 7.0, '#6FC8E0');
          }
          // the dip: light grey asphalt, red steps down each edge, red dashes
          n = RC.dip;
          if (!lit) {
            g.fillStyle = '#D0CCD8'; g.fillRect(n * cw, 0, cw, h);
            mottle('rgba(70,64,80,0.10)', 'rgba(240,236,246,0.10)', 22);
            specks('rgba(60,56,72,0.22)', 'rgba(255,255,255,0.16)', 20000 * area);
            dashes(2.67, 0.16, 4, 4, '#E0294A');
            band(7.0, 8.0, '#2A1018');
          }
          if (lit) { g.fillStyle = '#1C1A22'; g.fillRect(X(-7.0), 0, 14 * pm, h); }
          // (the steps: inside each edge a fine red line falls a stair inward, three steps every 8 m, a chart going
          // down, and climbs back to the edge to fall again)
          g.fillStyle = lit ? '#4A0814' : '#FF3B5C';
          var lw = 0.14 * pm;
          for (y = 0; y < 16; y += 8) [-1, 1].forEach(function (s) {
            for (k = 0; k < 3; k++) {
              var m0 = 6.3 - k * 0.5, xa = X(s * m0), xb = X(s * (m0 - 0.5));
              g.fillRect(xa - lw / 2, (y + k * 2) * pm, lw, 2 * pm);
              if (k < 2) g.fillRect(Math.min(xa, xb) - lw / 2, (y + k * 2 + 2) * pm - lw / 2, Math.abs(xb - xa) + lw, lw);
            }
            g.fillRect(Math.min(X(s * 5.3), X(s * 6.3)) - lw / 2, (y + 6) * pm - lw / 2, pm + lw, lw);
            g.fillRect(X(s * 6.3) - lw / 2, (y + 6) * pm, lw, 2 * pm);
          });
          band(6.75, 7.0, lit ? '#4A0814' : '#FF3B5C');
        };
      }
      var asphalt = ctx.textures.canvas(low ? 1024 : 2048, low ? 256 : 512, roadPaint(false));
      var roadLit = ctx.textures.canvas(low ? 512 : 1024, low ? 128 : 256, roadPaint(true));
      var grain = ctx.textures.normal(256, 256, function (g, w, h) { var R = mulberryLike(5); for (var q = 0; q < 7000; q++) { var v = Math.round(90 + R() * 140); g.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')'; g.fillRect(R() * w, R() * h, 1 + (R() < 0.3 ? 1 : 0), 1 + (R() < 0.3 ? 1 : 0)); } }, 1.8);
      grain.repeat.set(4, 1);
      var roadMat = new THREE.MeshStandardMaterial({ map: asphalt, emissiveMap: roadLit, emissive: '#FFFFFF', emissiveIntensity: 1, normalMap: grain, normalScale: new THREE.Vector2(0.35, 0.35), roughness: 0.66, metalness: 0.02 });
      var offRoad = function (d) { return onBridge(d) || full(d); };
      runs(offRoad).forEach(function (r) {
        pieces(r, function (d) { return zoneAt(d) + '|' + partAt(d); }, function (a, b, key) {
          var q = +key.split('|')[1], z = RC[key.split('|')[0]] || 0, x = q < 0 ? [-hw, hw] : leftOf(q), c0 = z / 4 + 0.002, c1 = (z + 1) / 4 - 0.002;
          sweep('road', a, b, [[x[0], 0.02], [x[1], 0.02]], 1, 2, 16, [c0 + (c1 - c0) * (x[0] + hw) / (2 * hw), c0 + (c1 - c0) * (x[1] + hw) / (2 * hw)]);
        });
      });
      meshOf('road', roadMat, { track: true });
      // the racing line: rubber laid down where the karts run, swinging to the inside of each bend (a soft band a
      // shade darker, streaked along its length: the asphalt's only, never the chart's glass or the moon's panels)
      var KAP = [];
      for (var dk = 0; dk < L; dk += 2) { var fa = track.frameAt(dk - 4), fb = track.frameAt(dk + 4); KAP.push((Math.atan2(fb.tan.x, fb.tan.z) - Math.atan2(fa.tan.x, fa.tan.z) + 3 * Math.PI) % (2 * Math.PI) - Math.PI); }
      function kap(d, span) { var n = KAP.length, i0 = Math.round(wrap(d) / 2), s = 0, wsum = 0; for (var j = -span; j <= span; j++) { var wgt = 1 - Math.abs(j) / (span + 1); s += KAP[((i0 + j) % n + n) % n] * wgt; wsum += wgt; } return s / wsum; }
      var rubber = ctx.textures.canvas(64, 256, function (g, w, h) {
        var R = mulberryLike(9);
        for (var x = 0; x < w; x++) { var a = Math.pow(Math.sin(Math.PI * x / (w - 1)), 1.6) * 0.2; g.fillStyle = 'rgba(14,14,24,' + a.toFixed(3) + ')'; g.fillRect(x, 0, 1, h); }
        for (var q = 0; q < 160; q++) { g.fillStyle = 'rgba(8,8,16,' + (0.04 + R() * 0.1).toFixed(2) + ')'; g.fillRect(w * (0.15 + R() * 0.7), R() * h, 1, 20 + R() * 80); }
      });
      rubber.wrapT = THREE.RepeatWrapping;
      if (!low) runs(function (d) { var z = zoneAt(d); return offRoad(d) || partAt(d) >= 0 || z === 'climb' || z === 'moon'; }).forEach(function (r) {
        sweep('rubber', r[0], r[1], function (d) { var o = clamp(-kap(d, 7) * 9 * (hw - 3), -(hw - 3), hw - 3); return [[o - 2.4, 0.03], [o + 2.4, 0.03]]; }, 1, 2, 12);
      });
      meshOf('rubber', new THREE.MeshStandardMaterial({ map: rubber, transparent: true, depthWrite: false, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }), { track: true });

      // the kerbs: one atlas, a colourway a section (lily green and cream in the swamp, mint up the chart, ice blue on
      // the moon, red down the dip); flat and narrow on the straights, wide raised rumble strips through the bends
      var kerbTex = ctx.textures.canvas(256, 128, function (g, w, h) {
        [['#F1E6C8', '#3F8A3A'], ['#F2FFF8', '#1FB86A'], ['#EEF2FA', '#4FA9D8'], ['#FFF0F2', '#E0294A']].forEach(function (cw, n) {
          var x0 = n * w / 4, cw2 = w / 4;
          g.fillStyle = cw[0]; g.fillRect(x0, 0, cw2, h); g.fillStyle = cw[1]; g.fillRect(x0, 0, cw2, h / 2);
          // (each stripe a little lit along its leading edge and shaded along its trailing one: it reads raised)
          g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(x0, 0, cw2, 4); g.fillRect(x0, h / 2, cw2, 4);
          g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(x0, h / 2 - 5, cw2, 5); g.fillRect(x0, h - 5, cw2, 5);
          g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(x0 + cw2 - 5, 0, 5, h);
        });
      });
      var KU = { swamp: [0.005, 0.245], climb: [0.255, 0.495], moon: [0.505, 0.745], dip: [0.755, 0.995] };
      var kerbFlat = [[hw - 0.35, 0.03], [hw + 0.12, 0.06], [hw + 0.55, 0.06], [hw + 0.68, 0.0]];
      var kerbWide = [[hw - 0.7, 0.03], [hw - 0.3, 0.11], [hw + 0.75, 0.11], [hw + 1.2, 0.04], [hw + 1.3, -0.02]];
      [-1, 1].forEach(function (sd) {
        runs(function (d) { return onBridge(d) || !!holeAt(d, sd * hw); }).forEach(function (r) {
          pieces(r, function (d) { return zoneAt(d) + (tight(d) ? '+' : ''); }, function (a, b, k) {
            var z = k.replace('+', ''); sweep('kerb', a, b, k.indexOf('+') > 0 ? kerbWide : kerbFlat, sd, 2, k.indexOf('+') > 0 ? 3 : 4, KU[z] || KU.swamp);
          });
        });
      });
      meshOf('kerb', new THREE.MeshStandardMaterial({ map: kerbTex, roughness: 0.5 }), { track: true });

      // every line of light along the lap in one mesh, coloured by vertex (bright enough to bloom): a fine line inside
      // each kerb in the section's colour, the tops of the chart's walls, the moon's berm lights, the decks' seams
      function glowCol(hex, k) { return new THREE.Color(hex).multiplyScalar(k); }
      [-1, 1].forEach(function (sd) {
        runs(function (d) { return onBridge(d) || !!holeAt(d, sd * hw); }).forEach(function (r) {
          pieces(r, zoneAt, function (a, b, z) { sweep('glow', a, b, [[hw - 0.55, 0.035], [hw - 0.4, 0.035]], sd, 2, 8, null, glowCol(ZC[z], z === 'swamp' ? 1.3 : 2.5)); });
        });
      });
      function glow(hex, k) { return new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }); }

      // the edge lights: studs along both edges of the road, in the section's colour; ahead of a bend and through it
      // they run toward the corner in pulses (a shader on the instance's place along the lap), elsewhere they glow
      var STUD = [];
      for (var ds = 1; ds < L; ds += low ? 4 : 3) {
        if (onBridge(ds)) continue;
        var bend = tight(ds) || tight(ds + 30) || tight(ds + 15);
        [-1, 1].forEach(function (sd) { if (!holeAt(ds, sd * hw)) STUD.push([ds, sd, bend ? 1 : 0, zoneAt(ds)]); });
      }
      var studMat = new THREE.MeshBasicMaterial({ color: '#FFFFFF' }), studU = { uT: { value: 0 } };
      studMat.onBeforeCompile = function (sh) {
        sh.uniforms.uT = studU.uT;
        sh.vertexShader = 'attribute vec2 aStud; uniform float uT; varying float vStud;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vStud = aStud.y > 0.5 ? 0.25 + 2.6 * pow(0.5 + 0.5 * sin(aStud.x * 0.32 - uT * 9.0), 8.0) : 0.55;');
        sh.fragmentShader = 'varying float vStud;\n' + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.rgb *= vStud;');
      };
      var studGeo = new THREE.BoxGeometry(0.22, 0.09, 0.42), studs = ctx.instanced(studGeo, studMat, STUD.length, function (q, o) {
        var S0 = STUD[q], f = track.frameAt(S0[0]); o.position.copy(track.pointAt(S0[0], S0[1] * (hw + (tight(S0[0]) ? 1.32 : 0.74)), 0.08)); o.rotation.y = Math.atan2(f.tan.x, f.tan.z);
      });
      var aStud = new Float32Array(STUD.length * 2); STUD.forEach(function (S0, q) { aStud[q * 2] = S0[0]; aStud[q * 2 + 1] = S0[2]; studs.setColorAt(q, glowCol(ZC[S0[3]], S0[3] === 'swamp' ? 1.6 : 2.2)); });
      studGeo.setAttribute('aStud', new THREE.InstancedBufferAttribute(aStud, 2));
      studs.userData.gmKart = true; scenery.add(studs); W.studU = studU;

      // chevron boards round the outside of every tight bend, facing the karts coming into it: the bend ahead framed
      // in light (one merged mesh: a dark board, its arrows the section's colour)
      var chevTex = ctx.textures.canvas(256, 128, function (g, w, h) {
        g.fillStyle = '#121022'; g.fillRect(0, 0, w, h);
        [0, 1].forEach(function (n) {
          var x0 = n * w / 2, dir = n ? -1 : 1;
          g.fillStyle = '#FFFFFF';
          for (var k = 0; k < 2; k++) { var cx = x0 + w / 4 + (k - 0.5) * 34 * dir; g.beginPath(); g.moveTo(cx - 16 * dir, 22); g.lineTo(cx + 14 * dir, h / 2); g.lineTo(cx - 16 * dir, h - 22); g.lineTo(cx - 30 * dir, h - 22); g.lineTo(cx, h / 2); g.lineTo(cx - 30 * dir, 22); g.closePath(); g.fill(); }
          g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 4; g.strokeRect(x0 + 5, 5, w / 2 - 10, h - 10);
        });
      });
      var CHEV = { p: [], u: [], c: [], i: [] };
      SEG.forEach(function (s) {
        if (s[1] !== 'a' || s[2] > 42) return;
        // (on the bend's outside, along it and facing in: whichever side, u runs the way the karts go, so the arrows
        // point on round the bend)
        var d0 = AT[s[0]] * L, len = s[2] * Math.abs(s[3]) * Math.PI / 180, sd = s[3] > 0 ? -1 : 1;
        for (var dd = d0 - 4; dd < d0 + len - 4; dd += 6.5) {
          if (gapAt(dd, sd) || onBridge(dd) || holeAt(dd, sd * wall)) continue;
          var z = zoneAt(dd), c = glowCol(ZC[z], 2.4), base = CHEV.p.length / 3, y0 = z === 'swamp' ? 0.7 : z === 'moon' ? 1.0 : 1.25;
          for (var v = 0; v < 4; v++) {
            var P = track.pointAt(dd + (v % 2 ? 0.95 : -0.95), sd * (wall + 0.45), y0 + (v < 2 ? 0 : 0.9));
            CHEV.p.push(P.x, P.y, P.z); CHEV.u.push(v % 2 ? 0.5 : 0, v < 2 ? 0 : 1); CHEV.c.push(c.r, c.g, c.b);
          }
          CHEV.i.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
        }
      });
      if (CHEV.p.length) {
        var cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.Float32BufferAttribute(CHEV.p, 3)); cg.setAttribute('uv', new THREE.Float32BufferAttribute(CHEV.u, 2)); cg.setAttribute('color', new THREE.Float32BufferAttribute(CHEV.c, 3)); cg.setIndex(CHEV.i);
        var chev = new THREE.Mesh(cg, new THREE.MeshBasicMaterial({ map: chevTex, vertexColors: true, side: THREE.DoubleSide }));
        chev.userData.gmKart = true; scenery.add(chev);
      }

      // the light bridge: a deck of violet glass over the gap, mint rails along its edges with gold runway lights,
      // lit lanes and cross-bars, and bold magenta arrows racing up it toward the moon (no white: it must not glare)
      var bridgeTex = ctx.textures.canvas(128, 256, function (g, w, h) {
        var gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, 'rgba(70,34,130,0.94)'); gr.addColorStop(0.22, 'rgba(26,20,70,0.86)'); gr.addColorStop(0.5, 'rgba(18,16,52,0.84)'); gr.addColorStop(0.78, 'rgba(26,20,70,0.86)'); gr.addColorStop(1, 'rgba(70,34,130,0.94)');
        g.fillStyle = gr; g.fillRect(0, 0, w, h);
        g.strokeStyle = 'rgba(92,255,192,0.4)'; g.lineWidth = 1.5;
        for (var q = 1; q < 8; q++) { g.beginPath(); g.moveTo(q * w / 8, 0); g.lineTo(q * w / 8, h); g.stroke(); }
        g.strokeStyle = 'rgba(92,255,192,0.28)'; for (q = 0; q < 4; q++) { g.beginPath(); g.moveTo(0, q * h / 4 + 2); g.lineTo(w, q * h / 4 + 2); g.stroke(); }
        // (three arrows to a half, nested, glowing)
        g.shadowColor = '#FF3EA5'; g.shadowBlur = 9; g.fillStyle = 'rgba(255,62,165,0.95)';
        for (var k = 0; k < 6; k++) { var y = k * h / 6 + 10, sc = k % 3 === 0 ? 1 : 0.8; g.beginPath(); g.moveTo(w * (0.5 - 0.24 * sc), y + 26 * sc); g.lineTo(w * 0.5, y); g.lineTo(w * (0.5 + 0.24 * sc), y + 26 * sc); g.lineTo(w * (0.5 + 0.13 * sc), y + 26 * sc); g.lineTo(w * 0.5, y + 12 * sc); g.lineTo(w * (0.5 - 0.13 * sc), y + 26 * sc); g.closePath(); g.fill(); }
        g.shadowBlur = 0;
        g.fillStyle = 'rgba(92,255,192,0.95)'; g.fillRect(0, 0, 5, h); g.fillRect(w - 5, 0, 5, h);
        g.shadowColor = '#FFC93C'; g.shadowBlur = 6; g.fillStyle = '#FFC93C';
        for (q = 0; q < 8; q++) { g.beginPath(); g.arc(9, q * h / 8 + 16, 2.6, 0, 6.28); g.arc(w - 9, q * h / 8 + 16, 2.6, 0, 6.28); g.fill(); }
        g.shadowBlur = 0;
      });
      bridgeTex.wrapS = bridgeTex.wrapT = THREE.RepeatWrapping;
      // (since the chaos, 7 Oct, the launch's gap is 14 m of nothing but the stars, right off the lip: the glass is
      // drawn only where the course leaves road over the void, its mint edges lit over it as runway lights)
      var gap0 = lip; while (gap0 < bridge && !full(gap0)) gap0 += 0.25;
      if (gap0 - lip > 3) {
        sweep('bridge', lip, gap0, [[-hw, 0.0], [hw, 0.0]], 1, 1, 6);
        var bm = meshOf('bridge', new THREE.MeshBasicMaterial({ map: bridgeTex, color: new THREE.Color(1.25, 1.3, 1.4), transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false }), { track: true });
        if (bm) { bm.receiveShadow = false; W.bridgeMat = bm.material; }
      }
      // the launch ramp itself (the runtime's wedge, 7 m up to the lip): mint rails lit up its sides, and a gold bar
      // of light along its lip, so the leap reads from far down the chart
      [-1, 1].forEach(function (sd) { sweep('glow', lip - 7, lip, function (d) { var y = 0.75 * clamp((d - lip + 7) / 7, 0, 1); return [[hw - 0.32, y + 0.02], [hw - 0.02, y + 0.02], [hw - 0.02, y + 0.16], [hw - 0.32, y + 0.16]]; }, sd, 1, 8, null, glowCol(C.mint, 2.4)); });
      sweep('glow', lip - 0.32, lip, [[-hw, 0.77], [hw, 0.77]], 1, 1, 8, null, glowCol(C.gold, 2.6));
      [-1, 1].forEach(function (sd) { sweep('glow', lip, bridge, [[hw - 0.1, -0.05], [hw + 0.25, -0.05], [hw + 0.25, 0.18], [hw - 0.1, 0.18]], sd, 1, 8, null, glowCol(C.mint, 1.5)); });
      // the hoops: three rings of light stood over the leap, mint, gold, magenta, the last a gate on the moon's edge,
      // the karts' arc through their middles (in the lap's mesh of light): the leap reads as flight, not a hop
      (function () {
        var H = [], cols = [C.mint, C.gold, C.mog];
        [[8, 3.0, 7.2], [17, 3.7, 8.4], [28, 3.4, 11.6]].forEach(function (h, n) {
          var f = track.frameAt(lip + h[0]), g = new THREE.TorusGeometry(h[2], 0.2, 6, 48), c = glowCol(cols[n], 2.8), cs = [];
          g.applyMatrix4(new THREE.Matrix4().makeBasis(f.right, f.up, f.tan).setPosition(f.pos.x + f.up.x * h[1], f.pos.y + f.up.y * h[1], f.pos.z + f.up.z * h[1]));
          for (var v = 0; v < g.attributes.position.count; v++) cs.push(c.r, c.g, c.b);
          g.setAttribute('color', new THREE.Float32BufferAttribute(cs, 3)); H.push(g.toNonIndexed());
        });
        H.forEach(function (g) { toGlow(g); });
      })();

      // the ground beside the road, out to the walls: through the swamp a low bank of moss and mud and then the water
      // itself (planks along the boardwalk), a steel grating on the chart's decks, grey dust on the moon
      var mossTex = noiseTex('#3B4A2A', '#2A3520', '#56653A', 51);
      var dustTex = noiseTex('#8F8F98', '#6E6E78', '#B9B9C2', 53);
      // (the verge is slow ground, so it must not read as more road: on the decks a steel grating, darker than the
      // road and full of holes, with hazard chevrons along the kerb; on the boardwalk rough, gappy planks gone to moss)
      var deckTex = ctx.textures.canvas(256, 256, function (g, w, h) {
        g.fillStyle = '#6B7088'; g.fillRect(0, 0, w, h);
        // (its first quarter lies under the kerb: the chevrons start where the kerb ends)
        var n = 16, cw = w / n, rows = 18, ch = h / rows, c0 = 4 * cw, c1 = 6 * cw;
        for (var j = 0; j < rows; j++) for (var i = 7; i < n; i++) { g.fillStyle = '#15172A'; g.fillRect(i * cw + 3, j * ch + 3, cw - 6, ch - 6); g.fillStyle = 'rgba(255,255,255,0.22)'; g.fillRect(i * cw + 2, j * ch + 1, cw - 4, 2); }
        g.fillStyle = '#20223A'; g.fillRect(c0, 0, c1 - c0, h);
        g.save(); g.beginPath(); g.rect(c0, 0, c1 - c0, h); g.clip(); g.fillStyle = '#E8C552';
        for (j = -1; j < 9; j++) { var y0 = j * h / 8; g.beginPath(); g.moveTo(c0, y0); g.lineTo(c1, y0 + 24); g.lineTo(c1, y0 + 24 + h / 16); g.lineTo(c0, y0 + h / 16); g.closePath(); g.fill(); }
        g.restore();
        g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(c1, 0, 3, h);
      });
      var plankTex = ctx.textures.canvas(256, 256, function (g, w, h) {
        var R = mulberryLike(61);
        g.fillStyle = '#10201E'; g.fillRect(0, 0, w, h);
        for (var q = 0; q < 12; q++) {
          var y = q * h / 12, gap = 3 + R() * 5, v = 62 + Math.floor(R() * 30), x0 = R() < 0.25 ? R() * w * 0.5 : 0, x1 = R() < 0.25 ? w - R() * w * 0.4 : w;
          g.fillStyle = 'rgb(' + (v + 20) + ',' + (v + 2) + ',' + (v - 16) + ')'; g.fillRect(x0, y + gap * 0.5, x1 - x0, h / 12 - gap);
          g.fillStyle = 'rgba(0,0,0,0.3)'; for (var k = 0; k < 4; k++) g.fillRect(x0 + R() * (x1 - x0), y + gap * 0.5 + R() * (h / 12 - gap), 20 + R() * 40, 1.2);
        }
        g.filter = 'blur(2px)'; g.fillStyle = 'rgba(72,104,46,0.75)';
        for (q = 0; q < 70; q++) { g.beginPath(); g.ellipse(R() * w, R() * h, 4 + R() * 14, 3 + R() * 7, R() * 3, 0, 6.28); g.fill(); }
        g.filter = 'none';
      });
      // (the bank: from under the kerb down into the water 1.7 m out, wherever the swamp is not boardwalk)
      var bankTex = noiseTex('#3E4A2C', '#2B2A1E', '#5A6A3C', 57);
      // (on a phone the verge, the walls and the decks' skirts are all one mesh, from an atlas of their textures side by
      // side and a plain white column, in vertex colours: five draws fewer)
      var vergeAtlas = null, VA = { bank: [0.002, 0.198], plank: [0.202, 0.398], climb: [0.402, 0.598], moon: [0.602, 0.798], white: [0.802, 0.998] }, WHITE = new THREE.Color(1, 1, 1);
      if (low) { vergeAtlas = ctx.textures.canvas(1280, 256, function (g) { [bankTex, plankTex, deckTex, dustTex].forEach(function (t, n) { g.drawImage(t.image, n * 256, 0, 256, 256); }); g.fillStyle = '#FFFFFF'; g.fillRect(1024, 0, 256, 256); }); vergeAtlas.wrapT = THREE.RepeatWrapping; }
      function bankProf(d, f) { var dn = f.pos.y - WY + 0.12; return [[hw - 0.4, 0.0], [hw + 0.9, -0.06], [hw + 1.5, -dn * 0.7], [hw + 2.4, -dn - 0.5]]; }
      [-1, 1].forEach(function (sd) {
        runs(function (d) { return onBridge(d) || !!holeAt(d, sd * (hw + 1)); }).forEach(function (r) {
          pieces(r, function (d) { var z = zoneAt(d); return z === 'swamp' ? (boardwalk(d) ? 'plank' : 'bank') : z; }, function (a, b, k) {
            // (on a phone all four in one mesh, from an atlas of their textures side by side: three draws fewer)
            var col = VA[k] || VA.climb;
            if (k === 'bank') sweep(low ? 'verge' : 'vergeBank', a, b, bankProf, sd, 2, 6, low ? col : null, low ? WHITE : null);
            else sweep(low ? 'verge' : k === 'moon' ? 'vergeMoon' : k === 'plank' ? 'vergePlank' : 'vergeDeck', a, b, [[hw - 0.4, 0.0], [wall + 0.8, 0.0]], sd, 2, 6, low ? col : null, low ? WHITE : null);
          });
        });
      });
      meshOf('vergeBank', new THREE.MeshStandardMaterial({ map: bankTex, roughness: 0.9 }), { track: true });
      meshOf('vergePlank', new THREE.MeshStandardMaterial({ map: plankTex, roughness: 0.9 }), { track: true });
      meshOf('vergeDeck', new THREE.MeshStandardMaterial({ map: deckTex, roughness: 0.55, metalness: 0.45 }), { track: true });
      meshOf('vergeMoon', new THREE.MeshStandardMaterial({ map: dustTex, roughness: 0.95 }), { track: true });
      var VERGE_MAT = low ? new THREE.MeshStandardMaterial({ map: vergeAtlas, vertexColors: true, roughness: 0.85, metalness: 0.1, side: THREE.DoubleSide }) : null;

      // the walls, the runtime's, open where the course opens them: a log afloat in the swamp, candles' glass on the
      // chart (green up, red down, one mesh in vertex colours), a rock berm on the moon; lights along the tops
      var SKIRTC = new THREE.Color('#1A1C30');
      var logProf = [];
      for (var lq = 0; lq <= 8; lq++) { var la = Math.PI * lq / 8; logProf.push([wall + 0.38 - Math.cos(la) * 0.4, -0.3 + Math.sin(la) * 0.4]); }
      var boxProf = [[wall, -0.1], [wall, 1.0], [wall + 0.6, 1.0], [wall + 0.6, -0.1]];
      var bermProf = [[wall - 0.2, -0.05], [wall + 0.15, 0.36], [wall + 0.55, 0.48], [wall + 1.2, 0.3], [wall + 1.8, -0.2]];
      var CG = new THREE.Color('#1C7A4E'), CR = new THREE.Color('#8A1E33'), CG2 = new THREE.Color('#2A9E64'), CR2 = new THREE.Color('#B02840'), LOGC = new THREE.Color('#9A8068'), MOONC = new THREE.Color('#B4B4BC');
      [-1, 1].forEach(function (sd) {
        runs(function (d) { return onBridge(d) || !!gapAt(d, sd) || !!holeAt(d, sd * wall); }).forEach(function (r) {
          pieces(r, zoneAt, function (a, b, z) {
            if (z === 'swamp') { if (low) sweep('verge', a, b, logProf, sd, 2, 3, VA.bank, LOGC); else sweep('wallLog', a, b, logProf, sd, 2, 3); }
            else if (z === 'moon') { if (low) sweep('verge', a, b, bermProf, sd, 2, 6, VA.moon, MOONC); else sweep('wallMoon', a, b, bermProf, sd, 2, 6); sweep('glow', a, b, [[wall + 0.3, 0.42], [wall + 0.75, 0.49]], sd, 2, 8, null, glowCol('#7FE8FF', 2.2)); }
            else { sweep(low ? 'verge' : 'wallChart', a, b, boxProf, sd, 2, 4, low ? VA.white : null, low ? (z === 'climb' ? CG2 : CR2) : z === 'climb' ? CG : CR); sweep('glow', a, b, [[wall + 0.02, 1.01], [wall + 0.58, 1.01]], sd, 2, 8, null, glowCol(z === 'climb' ? C.mint : C.red, 2.3)); }
          });
        });
      });
      var barkTex = noiseTex('#4A3A2E', '#33281F', '#5C4A3A', 71);
      // (on a phone the walls cast no shadow: three draws fewer, and the kerbs' own shading still shows where they stand)
      meshOf('wallLog', new THREE.MeshStandardMaterial({ map: barkTex, roughness: 0.85 }), { cast: !low });
      meshOf('wallChart', new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.25, metalness: 0.1, emissive: '#FFFFFF', emissiveIntensity: 0.12 }), { cast: !low });
      meshOf('wallMoon', new THREE.MeshStandardMaterial({ map: dustTex, color: '#B4B4BC', roughness: 0.9, flatShading: true }), { cast: !low });

      // under the road: through the swamp the bank runs on down under the water; on the chart a deck, its sides dark
      // glass and its edge a lit seam; nothing under the moon (its own ground) or the light bridge
      [-1, 1].forEach(function (sd) {
        runs(function (d) { var z = zoneAt(d); return z === 'moon' || z === 'bridge' || roadY(d) < 2.2 || full(d); }).forEach(function (r) {
          sweep(low ? 'verge' : 'skirt', r[0], r[1], function (d, f) {
            var y = f.pos.y, deck = smooth(2.2, 4.5, y), down = lerp(y + 0.6, 1.5, deck), x0 = wall + 0.75, slope = lerp(4.5, 0.25, deck);
            return [[x0 - 0.1, 0.0], [x0 + slope, -down], [x0 + slope, -down - 0.05], [0, -down - 0.05]];
          }, sd, 2, 6, low ? VA.white : null, low ? SKIRTC : null);
        });
        runs(function (d) { var z = zoneAt(d); return !(z === 'climb' || z === 'dip') || roadY(d) < 4 || full(d); }).forEach(function (r) {
          sweep('glow', r[0], r[1], [[wall + 1.0, -1.5], [wall + 1.0, -1.25]], sd, 2, 8, null, glowCol(zoneAt(r[0]) === 'climb' ? C.mint : C.red, 2.0));
        });
      });
      meshOf('skirt', new THREE.MeshStandardMaterial({ color: '#1A1C30', roughness: 0.3, metalness: 0.4, side: THREE.DoubleSide }));
      if (low) meshOf('verge', VERGE_MAT, { track: true });

      /* -------- the start: the chequered line, the grid, an arch with the race's name -- */
      var chequer = ctx.textures.canvas(128, 32, function (g, w, h) { for (var y = 0; y < 2; y++) for (var x = 0; x < 8; x++) { g.fillStyle = (x + y) % 2 ? '#14141C' : '#F4F2FA'; g.fillRect(x * w / 8, y * h / 2, w / 8, h / 2); } });
      chequer.repeat.set(2, 1);
      sweep('line', -1.1, 1.1, [[-hw, 0.045], [hw, 0.045]], 1, 2.2, 2.2);
      meshOf('line', new THREE.MeshStandardMaterial({ map: chequer, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }), { track: true });
      var slotMat = new THREE.MeshStandardMaterial({ color: '#2A2440', roughness: 0.7 });
      var slots = named('slots', ctx.instanced(new THREE.BoxGeometry(2.4, 0.02, 0.22), slotMat, 8, function (s, o) {
        var row = Math.floor(s / 2), col = s % 2, d = L - (5 + row * 6 + col * 3) + 1.6, f = track.frameAt(d);
        o.position.copy(track.pointAt(d, col ? -1.6 : 1.6, 0.05)); o.rotation.y = Math.atan2(f.tan.x, f.tan.z);
      }));
      slots.userData.gmKart = true; scene.add(slots);
      arch(0, 'TO THE MOON', C.mint, 9.2, 'gantry');
      var dipArch = arch(AT.dip * L + 28, 'BUY THE DIP', C.red, 8.4, 'dipArch');
      // (small things far down the course, put away while the camera is far from them: from the Bayou the whole of
      // the chute is in view across the water, and on a phone each is a draw; 7 Oct, round 3)
      W.far = [];
      function farOff(o, c, r) { W.far.push([o, c, r]); }
      farOff(dipArch, dipArch.position.clone(), 190);

      // painted on the road, worn by the tyres: the race's name past the line, each section's name where it begins
      // (one atlas, four rows; one mesh). Each reads from the seat as you drive at it, the tops of its letters
      // farthest, and is drawn out 8 m along the road (letters some 5 m long, as road paint is) so it still reads
      // from a kart's low eye 20 m back
      var paint = ctx.textures.canvas(1024, 1024, function (g, w, h) {
        var R = mulberryLike(13);
        [['TO THE MOON', C.mint, '#1B1446'], ['CANDLE CLIMB', '#1FB86A', '#0F2A22'], ['BUY THE DIP', C.red, '#2A1018'], ['WAGMI', C.gold, '#2E2632']].forEach(function (row, n) {
          var y = n * h / 4 + h / 8;
          g.font = '900 170px Bungee, "Arial Black", Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
          var fit = Math.min(1, w * 0.88 / g.measureText(row[0]).width); g.font = '900 ' + Math.floor(170 * fit) + 'px Bungee, "Arial Black", Impact, sans-serif';
          g.lineWidth = 16; g.strokeStyle = row[2]; g.strokeText(row[0], w / 2, y); g.fillStyle = row[1]; g.fillText(row[0], w / 2, y);
        });
        // (worn: the paint scuffed away in specks and in two wheel tracks)
        g.globalCompositeOperation = 'destination-out';
        for (var q = 0; q < 6000; q++) { g.fillStyle = 'rgba(0,0,0,' + (0.2 + R() * 0.5).toFixed(2) + ')'; g.fillRect(R() * w, R() * h, 1 + R() * 3, 1 + R() * 2); }
        [0.3, 0.7].forEach(function (cx) { var gr = g.createLinearGradient(w * (cx - 0.08), 0, w * (cx + 0.08), 0); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, 'rgba(0,0,0,0.3)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
        g.globalCompositeOperation = 'source-over';
      });
      var DEC = { p: [], u: [], i: [] };
      function decal(d, row, len) {
        var n = 6, base = DEC.p.length / 3, v0 = 1 - (row + 1) / 4, v1 = 1 - row / 4;
        for (var s = 0; s <= n; s++) for (var e = 0; e < 2; e++) {
          var P = track.pointAt(d - len / 2 + len * s / n, (e ? 1 : -1) * (hw - 1.2), 0.045);
          DEC.p.push(P.x, P.y, P.z); DEC.u.push(e, v0 + (v1 - v0) * s / n);
        }
        for (s = 0; s < n; s++) { var a = base + s * 2; DEC.i.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      }
      // (the race's name 58 m past the line: behind the podium's camera, which looks back up the straight from
      // past the blocks (26 m), 11 to 25 m further on, so it never reads upside down under the winners)
      decal(58, 0, 8); decal(AT.climb * L + 12, 1, 8); decal(AT.dip * L + 40, 2, 8); decal(AT.logs * L + 8, 3, 8);
      var dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.Float32BufferAttribute(DEC.p, 3)); dg.setAttribute('uv', new THREE.Float32BufferAttribute(DEC.u, 2)); dg.setIndex(DEC.i); dg.computeVertexNormals();
      var decals = new THREE.Mesh(dg, new THREE.MeshStandardMaterial({ map: paint, transparent: true, depthWrite: false, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
      decals.receiveShadow = true; decals.userData.gmKart = decals.userData.gmTrack = true; scene.add(decals);

      // the stands along the start straight, both sides, on piles over the water: four steps of seats under a
      // canopy, packed with the crowd, banners on poles along the back
      var SD0 = L - 34, SD1 = 46, standOut = [[wall + 2.4, -0.4], [wall + 2.4, 0.5], [wall + 3.6, 0.5], [wall + 3.6, 1.2], [wall + 4.8, 1.2], [wall + 4.8, 1.9], [wall + 6.0, 1.9], [wall + 6.0, 2.6], [wall + 7.2, 2.6], [wall + 7.2, 4.4], [wall + 7.6, 4.4], [wall + 7.6, -0.4]];
      [-1, 1].forEach(function (sd) {
        if (low && sd > 0) return;
        sweep('stand', SD0 - L, SD1, standOut, sd, 3, 6);
        sweep('canopy', SD0 - L, SD1, [[wall + 3.0, 5.9], [wall + 8.0, 6.8]], sd, 3, 6);
        sweep('glow', SD0 - L, SD1, [[wall + 2.95, 5.84], [wall + 3.05, 5.98]], sd, 3, 8, null, glowCol(C.mint, 2.4));
      });
      meshOf('stand', new THREE.MeshStandardMaterial({ color: '#2C2E48', roughness: 0.6, metalness: 0.3 }), { cast: !low });
      // (a bench at the back of every step, in runs of colour)
      var SEATC = ['#2E6A64', '#74335E', '#7E6638', '#4C3C78'].map(function (h) { return new THREE.Color(h); });
      [-1, 1].forEach(function (sd) {
        if (low && sd > 0) return;
        for (var tr = 0; tr < 4; tr++) for (var ds = SD0 - L, ns = 0; ds < SD1 - 0.5; ds += 6, ns++) {
          var x0 = wall + 3.32 + tr * 1.2, y0 = 0.5 + tr * 0.7;
          sweep('seats', ds, Math.min(SD1, ds + 5.8), [[x0, y0], [x0, y0 + 0.4], [x0 + 0.26, y0 + 0.44], [x0 + 0.26, y0]], sd, 3, 6, null, SEATC[(ns + tr) % 4]);
        }
      });
      meshOf('seats', new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.05 }));
      var can = meshOf('canopy', new THREE.MeshStandardMaterial({ color: '#3B2D5E', roughness: 0.5, side: THREE.DoubleSide }));
      if (can) can.castShadow = !low;
      // the fans: four rows a stand (one stand on a phone), a spot each ([x, y, z, facing, size, die, row, d, side]);
      // crowd() fills them, blockyFans() only if the library's people could not load
      var FANS = [];
      [-1, 1].forEach(function (sd) {
        if (low && sd > 0) return;
        for (var tier = 0; tier < 4; tier++) for (var df = SD0 - L + 1; df < SD1 - 1; df += low ? 1.3 : 0.85) {
          if (random() < 0.12) continue;
          var dj = df + (random() - 0.5) * 0.3, P = track.pointAt(dj, sd * (wall + 3.0 + tier * 1.2 + (random() - 0.5) * 0.2), 0.5 + tier * 0.7), f = track.frameAt(df);
          FANS.push([P.x, P.y, P.z, Math.atan2(-f.right.x * sd, -f.right.z * sd) + (random() - 0.5) * 0.6, 0.85 + random() * 0.3, random(), tier, dj, sd]);
        }
      });
      if (!crowd()) blockyFans();

      // The crowd: each look in FAN_LOOKS built once and filmed (by the kart kit, ctx.kart.impostors) before the first
      // frame, through F frames of what it does into an atlas; every fan is a card of one of them, turned to the
      // camera, playing its frames (one draw for them all). On a laptop the front row by the grid is the people
      // themselves, one of each, in place of their cards within 26 m of the camera; the rest of the cast is let go.
      // Nothing of it is made in a race
      function crowd() {
        var AS = ctx.assets, REN = ctx.renderer, MB = 'human-athlete-male', FB = 'human-athlete-female';
        if (!AS || !REN || !ctx.kart) return false;
        if (ctx.kart.step) ctx.kart.step('crowd');
        var t0 = performance.now(), RF = mulberryLike(4417), V3 = THREE.Vector3;
        // what each look does: its cycle (s), and how (1: the clip thrown once a cycle; 0: looped; 2: an alien's own)
        var MOVE = { cheer: [1.15, 1], danceTwist: [4 / 3, 0], danceLambada: [1, 0], danceCabbage: [1.25, 0], pump: [0.9, 2], hail: [1.1, 2] };
        var people0 = AS.human && AS.ready(MB) && AS.ready(FB), kit = null, cast = [], CW = 1.24, CH = 2.8, FOOT = 0.06, n, F, PX, PY, COLS, ROWS, atlas = null, atlasTex = null;
        // a look of the library's built: a person (or, filmed live, an alien) in its race-day things, its moves
        function make(lk) {
          var p = null;
          try { p = lk.alien ? AS.creature(lk.alien) : AS.human(lk.f ? FB : MB, lk.o); } catch (e) { p = null; }
          if (!p || !p.object) return null;
          p.look = lk; p.rig = lk.alien ? alienRig(p.object) : null;
          if (lk.hold) kit.hold(p, lk.hold);
          p.object.traverse(function (o) { if (o.isMesh) { o.castShadow = o.receiveShadow = false; o.userData.gmKart = true; } });
          // (settled into its stance in the studio, or in its seat, before it is seen)
          var mv = MOVE[lk.m] || MOVE.cheer, clk = 0, c0 = 0, B = { stance: mv[1] === 0 ? lk.m : 'idle', action: null }, S = { speed: 0, brawl: B };
          p.cycle = mv[0];
          p.step = function (dt, sub) { for (var k = 0; k < sub; k++) { clk += dt / sub; p.animate(clk, dt / sub, S); if (p.rig) alienPose(p.rig, lk.m, (clk - c0) / mv[0]); } if (p.fix) p.fix(); };
          p.settle = function () { p.step(1.6, 48); c0 = clk; if (mv[1] === 1) B.action = { name: lk.m, id: 1, rate: 1 }; };
          return p;
        }
        // The film, baked (8 Oct): the sheet below was filmed once, by scripts/kart-crowd-bake.mts, from these very looks
        // (CROWD_SHEETS: a laptop's, and a phone's at its smaller cells), and is a library picture now: a phone loads it
        // alone (kart.lowAssets), not the six people packs and 22 people to film, which took its tab down while loading
        var SH = CROWD_SHEETS[low ? 'low' : 'high'], bk = AS.ready(SH.id) && AS.texture ? AS.texture(SH.id) : null, bt = bk && bk.map;
        var bROWS = Math.ceil(FAN_LOOKS.length * SH.frames / SH.cols);
        if (bt && bt.image && bt.image.width === SH.cols * SH.cell[0] && bt.image.height === bROWS * SH.cell[1]) {
          n = FAN_LOOKS.length; F = SH.frames; PX = SH.cell[0]; PY = SH.cell[1]; COLS = SH.cols; ROWS = bROWS;
          // (as the film left it: the colour kept as its square root, no colour space, clamped, mipmapped)
          bt.colorSpace = THREE.NoColorSpace; bt.wrapS = bt.wrapT = THREE.ClampToEdgeWrapping; bt.anisotropy = 1;
          bt.minFilter = THREE.LinearMipmapLinearFilter; bt.magFilter = THREE.LinearFilter; bt.generateMipmaps = true; bt.needsUpdate = true;
          atlasTex = bt;
          cast = FAN_LOOKS.map(function (lk) { return { look: lk, cycle: (MOVE[lk.m] || MOVE.cheer)[0] }; });
          // (a laptop's people by the grid are still the people themselves: their packs load on a laptop only)
          if (!low && people0) {
            kit = propKit();
            FAN_LOOKS.forEach(function (lk, i) { if (lk.alien) return; var p = make(lk); if (p) { p.settle(); cast[i] = p; } });
          }
        } else {
          // the film, live (no baked sheet: the bake itself, or a library without it): each look built and filmed by the
          // kart kit (ctx.kart.impostors) before the first frame, through F frames of what it does, into the sheet
          if (!people0 || !ctx.kart.impostors) return false;
          kit = propKit();
          FAN_LOOKS.forEach(function (lk) { var p = make(lk); if (p) cast.push(p); });
          if (cast.length < 4) return false;
          n = cast.length; F = low ? 10 : 12; PX = low ? 64 : 96; PY = low ? 144 : 216; COLS = 2 * F;
          // the film: each of the cast alone through F frames of its cycle, in a studio lit as the stands are at dusk,
          // into the sheet (look i's frame f at cell i * F + f, 2F across)
          var sheet = ctx.kart.impostors({ cast: cast.map(function (p) { return { object: p.object, cycle: p.cycle, settle: p.settle, step: function (dt) { p.step(dt, 3); } }; }), frames: F, cell: [PX, PY], size: [CW, CH], foot: FOOT, cols: COLS });
          if (!sheet) return false;
          atlas = sheet.target; atlasTex = atlas.texture; ROWS = sheet.rows;
        }

        // the cards: one a fan (a phone fills its wider rows in between), of a look (none twice running), a phase, a
        // pace, and either way round unless it holds words
        if (low) FANS.slice().forEach(function (F0) {
          var dj = F0[7] + 0.62 + (RF() - 0.5) * 0.2; if (dj > SD1 - 1) return;
          var P = track.pointAt(dj, F0[8] * (wall + 3.0 + F0[6] * 1.2 + (RF() - 0.5) * 0.2), 0.5 + F0[6] * 0.7), f = track.frameAt(dj);
          FANS.push([P.x, P.y, P.z, Math.atan2(-f.right.x * F0[8], -f.right.z * F0[8]) + (RF() - 0.5) * 0.6, 0.85 + RF() * 0.3, RF(), F0[6], dj, F0[8]]);
        });
        var NFAN = FANS.length, look = new Int16Array(NFAN), lastK = -1, lastK2 = -1, people = [];
        cast.forEach(function (p, i) { if (p.object && !p.look.alien) people.push(i); });
        // (the laptop's people, one of each, in the front row by the grid, both sides)
        var realAt = {};
        if (!low) [-1, 1].forEach(function (sd, h) {
          var row = [];
          FANS.forEach(function (F0, q) { if (F0[8] === sd && F0[6] === 0 && F0[7] > -21 && F0[7] < -4) row.push(q); });
          row.sort(function (a, b) { return Math.abs(FANS[a][7] + 12.5) - Math.abs(FANS[b][7] + 12.5); });
          var mine = people.filter(function (k, j) { return j % 2 === h; });
          row.slice(0, mine.length).forEach(function (q, j) { realAt[q] = mine[j]; });
        });
        FANS.forEach(function (F0, q) {
          var k = realAt[q];
          if (k == null) { var tries = 0; do { k = Math.floor(RF() * n); } while (tries++ < 10 && (k === lastK || k === lastK2)); }
          lastK2 = lastK; lastK = k; look[q] = k;
        });
        var quad = new THREE.PlaneGeometry(CW, CH).translate(0, CH / 2 - FOOT, 0);
        var aFan = new Float32Array(NFAN * 4), aDim = new Float32Array(NFAN * 2), HUES = [0.9, 1.8, 2.7, 3.6, 4.6];
        FANS.forEach(function (F0, q) {
          var p = cast[look[q]], words = !!(p.look.hold && p.look.hold.sign != null) || !!(p.look.hold && p.look.hold.foam != null);
          aFan[q * 4] = look[q]; aFan[q * 4 + 1] = RF(); aFan[q * 4 + 2] = (0.9 + RF() * 0.2) / p.cycle; aFan[q * 4 + 3] = words || RF() < 0.5 ? 1 : -1;
          aDim[q * 2] = 0.84 + RF() * 0.16; aDim[q * 2 + 1] = realAt[q] == null && RF() < 0.55 ? HUES[Math.floor(RF() * HUES.length)] : 0;
        });
        quad.setAttribute('aFan', new THREE.InstancedBufferAttribute(aFan, 4)); quad.setAttribute('aDim', new THREE.InstancedBufferAttribute(aDim, 2));
        var U = { uAtlas: { value: atlasTex }, uT: { value: 0 }, uHop: { value: 0 }, uF: { value: F }, uCols: { value: COLS }, uRows: { value: ROWS }, uTint: { value: new THREE.Color(1, 1, 1) } };
        var cardMat = new THREE.ShaderMaterial({
          uniforms: Object.assign(THREE.UniformsUtils.clone(THREE.UniformsLib.fog), U), fog: true,
          vertexShader: [
            'attribute vec4 aFan; attribute vec2 aDim; uniform float uT, uHop, uF, uCols, uRows; varying vec2 vUv; varying vec2 vDim;',
            '#include <fog_pars_vertex>',
            'void main() {',
            '  vec4 c = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0); float s = length((modelMatrix * instanceMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xyz);',
            // (turned about the upright to face the camera)
            '  vec3 tc = cameraPosition - c.xyz; tc.y = 0.0; float tl = length(tc); vec3 rt = tl > 1e-4 ? vec3(tc.z, 0.0, -tc.x) / tl : vec3(1.0, 0.0, 0.0);',
            '  float ph = fract(uT * aFan.z + aFan.y), fr = min(floor(ph * uF), uF - 1.0), cell = aFan.x * uF + fr, row = floor(cell / uCols), col = cell - row * uCols;',
            '  vUv = vec2((col + (aFan.w > 0.0 ? uv.x : 1.0 - uv.x)) / uCols, (row + uv.y) / uRows);',
            // (the whole stand up on its toes for a moment at GO and every lap)
            '  float hop = uHop * 0.16 * max(0.0, sin(uT * 8.0 + aFan.y * 40.0));',
            '  vec3 p = c.xyz + rt * position.x * s + vec3(0.0, position.y * s + hop, 0.0);',
            '  vec4 mvPosition = viewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mvPosition; vDim = aDim;',
            '  #include <fog_vertex>',
            '}',
          ].join('\n'),
          fragmentShader: [
            'uniform sampler2D uAtlas; uniform vec3 uTint; varying vec2 vUv; varying vec2 vDim;',
            '#include <fog_pars_fragment>',
            // (the strong colours turned round the hue circle, skin, hair and denim kept: one look is several people)
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
        var cards = named('fans', new THREE.InstancedMesh(quad, cardMat, NFAN)), MQ = [];
        FANS.forEach(function (F0, q) {
          var s = realAt[q] != null ? 1 : 0.95 + (F0[4] - 0.85) / 3;
          var m = new THREE.Matrix4().makeScale(s, s, s).setPosition(F0[0], F0[1], F0[2]); MQ.push(m); cards.setMatrixAt(q, m);
        });
        cards.instanceMatrix.needsUpdate = true; cards.userData.gmKart = true; cards.userData.atlas = atlas; scenery.add(cards);

        // the laptop's people in their places; the rest of the cast let go
        var real = [], folk = new THREE.Group(); folk.name = 'folk'; scenery.add(folk);
        Object.keys(realAt).forEach(function (q) {
          q = +q; var F0 = FANS[q], p = cast[realAt[q]], mv = MOVE[p.look.m] || MOVE.cheer;
          p.real = true; p.object.position.set(F0[0], F0[1], F0[2]); p.object.rotation.set(0, F0[3], 0); p.object.visible = false; folk.add(p.object);
          // (the eyes, brows and lashes only from near)
          var small = [];
          p.object.traverse(function (o) {
            var gs = o.isSkinnedMesh && o.geometry.userData.groups; if (!gs || !Array.isArray(o.material)) return;
            gs.forEach(function (gn, gi) { var m = o.material[gi]; if (/^(eyes|brows|lashes)$/.test(gn) && m && m.visible) small.push(m); });
          });
          real.push({ p: p, q: q, m: MQ[q], at: new V3(F0[0], F0[1], F0[2]), on: false, face: true, small: small, n: 0, acc: 0, clock: 0, next: 0.4 + RF() * 3, id: 1,
            act: null, stance: mv[1] === 0 ? p.look.m : 'idle', move: 'cheer', hold: !!p.look.hold });
        });
        cast.forEach(function (p) {
          if (p.real || !p.object) return;
          // (an alien's parts are its own; a person's body is the library's: a phone lets its textures go too)
          p.object.traverse(function (o) {
            if (!o.isMesh) return;
            if (p.rig && (!kit || o.material !== kit.mat)) o.geometry.dispose();
            (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) {
              if (!m || (kit && m === kit.mat)) return;
              if (low || p.rig) ['map', 'normalMap', 'bumpMap', 'roughnessMap', 'emissiveMap', 'alphaMap'].forEach(function (k) { if (m[k] && m[k].dispose) m[k].dispose(); });
              m.dispose();
            });
          });
        });
        W.crowd = { U: U, t: 0, cheer: 0, real: real, mesh: cards, zero: new THREE.Matrix4().makeScale(0, 0, 0), pv: new THREE.Matrix4(), fr: new THREE.Frustum(), sph: new THREE.Sphere(new V3(), 1.6), rnd: RF };
        cards.userData.crowd = { cards: NFAN, looks: n, people: real.length, frames: F, atlas: [COLS * PX, ROWS * PY], baked: !atlas, ms: Math.round(performance.now() - t0) };
        var up = function () { var C = W.crowd; C.cheer = 1; C.real.forEach(function (h) { h.next = Math.min(h.next, h.clock + RF() * 0.4); }); };
        ctx.on('start', up); ctx.on('lap', up); ctx.on('finish', up);
        return true;

        // an alien's arms (the creature kit's joints: a shoulder, an elbow, a hand), found by their shape
        function alienRig(o) {
          var rig = o.children[0], hips = rig && rig.children[0], arms = [];
          if (!hips) return null;
          hips.traverse(function (g) {
            if (!g.isGroup || g === hips || Math.abs(g.position.x) < 1e-3 || g.position.y < 1e-3 || !g.children[0] || !g.children[0].isGroup) return;
            var sh = g.children[0], el = sh.children.filter(function (c) { return c.isGroup; })[0], hand = el && el.children.filter(function (c) { return c.isGroup; })[0];
            if (hand) arms.push({ sh: sh, el: el, hand: hand, side: g.position.x > 0 ? 1 : -1 });
          });
          return arms.length ? { root: rig, arms: arms } : null;
        }
        // an alien's own moves, u cycles in: pump (both arms punching the air, a hop), hail (the right arm waving)
        function alienPose(R, m, u) {
          var s = Math.sin(u * Math.PI * 2), up = Math.max(0, s);
          R.root.position.y = (m === 'pump' ? 0.14 : 0.05) * up;
          R.arms.forEach(function (a) {
            if (m === 'pump' || a.side > 0) {
              var k = m === 'pump' ? 1 : 0.45;
              a.sh.rotation.x = -(1.25 + 1.2 * k) - 0.6 * s * k; a.sh.rotation.z = a.side * (0.25 + 0.3 * up); a.el.rotation.x = -0.2 - 0.9 * Math.max(0, -s) * k;
            } else { a.sh.rotation.x = -2.7; a.sh.rotation.z = a.side * (0.4 + 0.5 * Math.sin(u * Math.PI * 2)); a.el.rotation.x = -0.3 + 0.3 * Math.sin(u * Math.PI * 2); }
          });
        }
      }

      // what the fans hold up, each one draw of one material (the words' atlas, white elsewhere, tinted)
      function propKit() {
        var V3 = THREE.Vector3;
        var PC = 4, PW = 256, PH = 172;
        var tex = ctx.textures.canvas(1024, 1024, function (g, w, h) {
          g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, w, h);
          FAN_WORDS.forEach(function (Fw, q) {
            var x = (q % PC) * PW, y = Math.floor(q / PC) * PH, lines = Fw[0].split('|');
            g.fillStyle = Fw[1]; g.fillRect(x + 5, y + 5, PW - 10, PH - 10);
            g.strokeStyle = Fw[2]; g.lineWidth = 5; g.strokeRect(x + 14, y + 14, PW - 28, PH - 28);
            g.fillStyle = Fw[2]; g.textAlign = 'center'; g.textBaseline = 'middle';
            var size = lines.length > 1 ? 50 : 84;
            lines.forEach(function (ln, li) {
              var sz = size; g.font = '900 ' + sz + 'px Bungee, "Arial Black", Impact, sans-serif';
              while (g.measureText(ln).width > PW - 44 && sz > 20) { sz -= 4; g.font = '900 ' + sz + 'px Bungee, "Arial Black", Impact, sans-serif'; }
              g.fillText(ln, x + PW / 2, y + PH / 2 + (li - (lines.length - 1) / 2) * size * 1.05 + 3);
            });
          });
        });
        var mat = new THREE.MeshStandardMaterial({ map: tex, vertexColors: true, roughness: 0.62 });
        var WHITE = [1012 / 1024, 12 / 1024];
        function face(q) { var x = (q % PC) * PW, y = Math.floor(q / PC) * PH; return [(x + 5) / 1024, 1 - (y + PH - 5) / 1024, (x + PW - 5) / 1024, 1 - (y + 5) / 1024]; }
        // parts [geometry, colour, uv rect (none: the white)], merged
        function build(parts) {
          var P = [], N = [], UV = [], CC = [], cl = new THREE.Color();
          parts.forEach(function (it) {
            var g = it[0].index ? it[0].toNonIndexed() : it[0], r = it[2], uv = g.attributes.uv; cl.set(it[1]);
            P.push.apply(P, g.attributes.position.array); N.push.apply(N, g.attributes.normal.array);
            for (var q = 0; q < g.attributes.position.count; q++) {
              var rr = typeof r === 'function' ? r(q) : r;
              if (rr && uv) UV.push(rr[0] + uv.getX(q) * (rr[2] - rr[0]), rr[1] + uv.getY(q) * (rr[3] - rr[1])); else UV.push(WHITE[0], WHITE[1]);
              CC.push(cl.r, cl.g, cl.b);
            }
          });
          var out = new THREE.BufferGeometry();
          out.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); out.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
          out.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2)); out.setAttribute('color', new THREE.Float32BufferAttribute(CC, 3));
          return out;
        }
        var made = {};
        function sign(q) {
          // (a board 0.54 by 0.36 m on a stick, its words on both faces)
          var r = face(q);
          return made['s' + q] || (made['s' + q] = build([
            [new THREE.CylinderGeometry(0.012, 0.012, 0.44, 6).translate(0, 0.14, 0), '#D9C9A8'],
            [new THREE.BoxGeometry(0.54, 0.36, 0.014).translate(0, 0.53, 0), '#FFFFFF', function (v) { return v >= 24 ? r : null; }],
          ]));
        }
        function foam(q, c) {
          // (a foam hand: a puffy palm, the finger, a thumb, a cuff; words front and back)
          var r = face(q);
          return made['f' + q + c] || (made['f' + q + c] = build([
            [new THREE.SphereGeometry(1, 14, 10).scale(0.13, 0.16, 0.06).translate(0, 0.14, 0), c],
            [new THREE.CapsuleGeometry(0.045, 0.2, 4, 10).translate(0, 0.38, 0.0), c],
            [new THREE.CapsuleGeometry(0.035, 0.08, 4, 8).rotateZ(-0.7).translate(0.13, 0.12, 0.01), c],
            [new THREE.CylinderGeometry(0.075, 0.08, 0.07, 12).translate(0, -0.01, 0), c],
            [new THREE.PlaneGeometry(0.2, 0.134).translate(0, 0.14, 0.062), '#FFFFFF', r],
            [new THREE.PlaneGeometry(0.2, 0.134).rotateY(Math.PI).translate(0, 0.14, -0.062), '#FFFFFF', r],
          ]));
        }
        return {
          mat: mat,
          // into the right hand: a sign's stick through the fist, a foam hand along the fingers; an alien's along its arm
          hold: function (p, h) {
            var g = h.sign != null ? sign(h.sign) : foam(h.foam, h.c || '#FFC93C'), m = new THREE.Mesh(g, mat), B = new THREE.Matrix4();
            m.castShadow = m.receiveShadow = false;
            if (p.rig) {
              var arm = p.rig.arms.filter(function (a) { return a.side < 0; })[0] || p.rig.arms[0];
              B.makeBasis(new V3(1, 0, 0), new V3(0, -1, 0), new V3(0, 0, -1)); m.quaternion.setFromRotationMatrix(B);
              m.position.set(0, -0.06, 0); m.scale.setScalar(0.85); arm.hand.add(m); return;
            }
            var o = p.object; o.updateMatrixWorld(true);
            var wr = o.getObjectByName('wrist_R'), at = function (nm) { var b = o.getObjectByName(nm); return b ? b.getWorldPosition(new V3()) : null; };
            var w0 = at('wrist_R'), mid = at('finger3-1_R'), ix = at('finger2-1_R'), pk = at('finger5-1_R');
            if (!wr || !mid || !ix || !pk) return;
            var fing = mid.clone().sub(w0).normalize(), across = ix.clone().sub(pk); across.addScaledVector(fing, -across.dot(fing)).normalize();
            var palm = new V3().crossVectors(across, fing).normalize(); if (palm.x * -w0.x < 0) palm.negate();
            if (h.sign != null) {
              // (a sign upright, facing where its holder faces, leaning out as the hand goes out)
              var sh = o.getObjectByName('upperarm01_R'), qW = new THREE.Quaternion(), qR = new THREE.Quaternion(), hp = new V3(), sp = new V3(), ZA = new V3(0, 0, 1);
              m.position.copy(wr.worldToLocal(ix.clone().add(pk).multiplyScalar(0.5).addScaledVector(palm, 0.03).addScaledVector(fing, -0.01)));
              m.scale.setScalar(1 / wr.getWorldScale(new V3()).x); wr.add(m);
              p.fix = function () {
                o.updateMatrixWorld(true);
                o.worldToLocal(m.getWorldPosition(hp)); o.worldToLocal(sh ? sh.getWorldPosition(sp) : sp.set(-0.2, 1.4, 0));
                o.getWorldQuaternion(qR).multiply(qW.setFromAxisAngle(ZA, clamp(-(hp.x - sp.x) * 1.4, -0.55, 0.55)));
                m.quaternion.copy(wr.getWorldQuaternion(qW).invert().multiply(qR));
              };
              p.fix(); return;
            }
            var Y = fing.clone(), Z = palm.clone().negate(), X = new V3().crossVectors(Y, Z).normalize();
            Z.crossVectors(X, Y).normalize();
            var qi = wr.getWorldQuaternion(new THREE.Quaternion()).invert();
            B.makeBasis(X.applyQuaternion(qi), Y.applyQuaternion(qi), Z.applyQuaternion(qi)); m.quaternion.setFromRotationMatrix(B);
            m.position.copy(wr.worldToLocal(w0.clone().addScaledVector(fing, 0.02))); m.scale.setScalar(1 / wr.getWorldScale(new V3()).x);
            wr.add(m);
          },
        };
      }

      // the toy fans of before (no library): a body, arms up, and a head, bouncing on a shader clock
      function blockyFans() {
        var fan = merge([[new THREE.CylinderGeometry(0.2, 0.26, 0.62, 8).translate(0, 0.31, 0), '#FFFFFF'], [new THREE.BoxGeometry(0.09, 0.5, 0.09).translate(0, 0.25, 0).rotateZ(0.5).translate(-0.22, 0.52, 0), '#FFFFFF'],
          [new THREE.BoxGeometry(0.09, 0.5, 0.09).translate(0, 0.25, 0).rotateZ(-0.5).translate(0.22, 0.52, 0), '#FFFFFF'], [new THREE.SphereGeometry(0.24, 10, 7).scale(1.1, 0.95, 1).translate(0, 0.86, 0), '#E8C27A']]);
        var fanU = { uT: { value: 0 } }, mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 }), aF = new Float32Array(FANS.length);
        mat.onBeforeCompile = function (sh) {
          sh.uniforms.uT = fanU.uT;
          sh.vertexShader = 'attribute float aFan; uniform float uT;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  transformed.y += max(0.0, sin(uT * (6.0 + aFan * 3.0) + aFan * 40.0)) * 0.2;');
        };
        FANS.forEach(function (F0, q) { aF[q] = F0[5]; }); fan.setAttribute('aFan', new THREE.InstancedBufferAttribute(aF, 1));
        var SHIRT = ['#FF3EA5', '#5CFFC0', '#FFC93C', '#2E7BEA', '#9B5DE5', '#F4F2FA', '#1FB86A', '#FF7A3C'].map(function (h) { return new THREE.Color(h); });
        var im = named('im', ctx.instanced(fan, mat, FANS.length, function (q, o) { var F0 = FANS[q]; o.position.set(F0[0], F0[1], F0[2]); o.rotation.y = F0[3]; o.scale.setScalar(F0[4]); }));
        FANS.forEach(function (F0, q) { im.setColorAt(q, SHIRT[Math.floor(F0[5] * 9973) % SHIRT.length]); });
        im.userData.gmKart = true; scenery.add(im); W.fanU = fanU;
      }
      // (the start's stands, put away up in space, where they are specks far below)
      W.stands = [];
      scenery.children.concat(scene.children).forEach(function (o) { if (o.name === 'stand' || o.name === 'canopy' || o.name === 'seats' || o.name === 'im' || o.name === 'fans' || o.name === 'line' || o.name === 'slots') W.stands.push(o); });
      // the banners: original designs (a frog's face, GM, a rocket, a green candle, WAGMI, HODL, a crescent, WOW),
      // two to a pole along the stands' backs; one mesh from an atlas (turned over on the right, so from the road
      // the words read the right way round on both sides)
      var bannerTex = ctx.textures.canvas(1024, 512, function (g, w, h) {
        var bw = w / 8;
        function face(n, bg, fg) { g.fillStyle = bg; g.fillRect(n * bw, 0, bw, h); g.fillStyle = fg; g.strokeStyle = fg; g.lineWidth = 6; g.strokeRect(n * bw + 8, 8, bw - 16, h - 16); }
        function words(n, txt, fg, size) { g.save(); g.translate(n * bw + bw / 2, h / 2); g.rotate(-Math.PI / 2); g.font = '900 ' + size + 'px Bungee, "Arial Black", Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = fg; g.fillText(txt, 0, 4); g.restore(); }
        face(0, '#3B1F6E', '#5CFFC0'); g.fillStyle = '#4FA03A'; g.beginPath(); g.ellipse(bw / 2, h * 0.5, 46, 40, 0, 0, 6.28); g.fill();
        g.fillStyle = '#FFFFFF'; [-1, 1].forEach(function (s2) { g.beginPath(); g.arc(bw / 2 + s2 * 22, h * 0.5 - 34, 20, 0, 6.28); g.fill(); }); g.fillStyle = '#111'; [-1, 1].forEach(function (s2) { g.beginPath(); g.arc(bw / 2 + s2 * 22 + 4, h * 0.5 - 32, 9, 0, 6.28); g.fill(); });
        g.strokeStyle = '#2B5A22'; g.lineWidth = 5; g.beginPath(); g.arc(bw / 2, h * 0.5 + 2, 26, 0.3, Math.PI - 0.3); g.stroke();
        face(1, '#14121F', '#FFC93C'); words(1, 'GM', '#FFC93C', 96);
        face(2, '#1B1446', '#FF3EA5'); g.fillStyle = '#F4F2FA'; g.beginPath(); g.moveTo(2.5 * bw, 120); g.quadraticCurveTo(2.5 * bw + 40, 220, 2.5 * bw + 28, 340); g.lineTo(2.5 * bw - 28, 340); g.quadraticCurveTo(2.5 * bw - 40, 220, 2.5 * bw, 120); g.fill();
        g.fillStyle = '#FF3EA5'; g.fillRect(2.5 * bw - 46, 300, 18, 56); g.fillRect(2.5 * bw + 28, 300, 18, 56); g.fillStyle = '#FFC93C'; g.beginPath(); g.moveTo(2.5 * bw - 18, 345); g.lineTo(2.5 * bw, 420); g.lineTo(2.5 * bw + 18, 345); g.fill(); g.fillStyle = '#5CFFC0'; g.beginPath(); g.arc(2.5 * bw, 230, 13, 0, 6.28); g.fill();
        face(3, '#0E1A14', '#2BE07A'); g.fillStyle = '#2BE07A'; [[0.28, 300, 120], [0.5, 230, 170], [0.72, 140, 230]].forEach(function (c2) { g.fillRect(3 * bw + bw * c2[0] - 14, c2[1], 28, c2[2]); g.fillRect(3 * bw + bw * c2[0] - 3, c2[1] - 30, 6, c2[2] + 60); });
        face(4, '#5CFFC0', '#14121F'); words(4, 'WAGMI', '#14121F', 70);
        face(5, '#FF3EA5', '#FFFFFF'); words(5, 'HODL', '#FFFFFF', 84);
        face(6, '#101436', '#FFC93C'); g.fillStyle = '#FFE9A8'; g.beginPath(); g.arc(6.5 * bw, h / 2, 46, 0, 6.28); g.fill(); g.fillStyle = '#101436'; g.beginPath(); g.arc(6.5 * bw + 22, h / 2 - 14, 42, 0, 6.28); g.fill();
        g.fillStyle = '#FFFFFF'; [[20, 90], [96, 140], [40, 400], [100, 380], [70, 60]].forEach(function (s2) { g.fillRect(6 * bw + s2[0], s2[1], 4, 4); });
        face(7, '#FFC93C', '#7A3E0E'); words(7, 'WOW', '#7A3E0E', 100);
      });
      var BAN = { p: [], u: [], i: [] }, POLES = [], nb = 0;
      [-1, 1].forEach(function (sd) {
        if (low && sd > 0) return;
        for (var db = SD0 - L + 3; db < SD1 - 2; db += 7.5) {
          var P0 = track.pointAt(db, sd * (wall + 7.4), 0); POLES.push(P0);
          for (var e2 = 0; e2 < 2; e2++) {
            var base = BAN.p.length / 3, u0 = (nb++ % 8) / 8;
            for (var v = 0; v < 4; v++) {
              var Pv = track.pointAt(db + (e2 ? 0.25 : -1.65) + (v % 2) * 1.4, sd * (wall + 7.45), 4.6 + (v < 2 ? 0 : 3.6));
              BAN.p.push(Pv.x, Pv.y, Pv.z); BAN.u.push(u0 + ((v % 2) !== (sd > 0 ? 1 : 0) ? 1 / 8 : 0), v < 2 ? 0 : 1);
            }
            BAN.i.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
          }
        }
      });
      var bg2 = new THREE.BufferGeometry(); bg2.setAttribute('position', new THREE.Float32BufferAttribute(BAN.p, 3)); bg2.setAttribute('uv', new THREE.Float32BufferAttribute(BAN.u, 2)); bg2.setIndex(BAN.i); bg2.computeVertexNormals();
      var banners = named('banners', new THREE.Mesh(bg2, new THREE.MeshStandardMaterial({ map: bannerTex, emissive: '#FFFFFF', emissiveMap: bannerTex, emissiveIntensity: 0.45, roughness: 0.7, side: THREE.DoubleSide })));
      banners.userData.gmKart = true; scenery.add(banners); W.stands.push(banners);
      var poles = named('poles', ctx.instanced(new THREE.CylinderGeometry(0.07, 0.09, 8.6, 6), new THREE.MeshStandardMaterial({ color: '#C9C6D8', roughness: 0.4, metalness: 0.7 }), POLES.length, function (q, o) { o.position.copy(POLES[q]).setY(POLES[q].y + 4.3); }));
      poles.userData.gmKart = true; scenery.add(poles); W.stands.push(poles);

      // an arch over the road at d: two towers past the walls, a beam above the camera's corridor with a sign
      function arch(d, words, hex, hgt, name) {
        var f = track.frameAt(d), g = new THREE.Group(), span = (wall + 2.2) * 2;
        // (its steel in one mesh, its sign another, its light the lap's: two draws, not a dozen)
        var STEEL = [], LIT = [];
        [-1, 1].forEach(function (sd) {
          STEEL.push(new THREE.BoxGeometry(1.4, hgt + 3.5, 1.4).translate(sd * span / 2, (hgt + 3.5) / 2 - 1, 0));
          LIT.push(new THREE.BoxGeometry(0.18, hgt + 3.3, 0.18).translate(sd * (span / 2 - 0.72), (hgt + 3.5) / 2 - 1, 0.72));
        });
        STEEL.push(new THREE.BoxGeometry(span + 1.4, 2.6, 1.0).translate(0, hgt + 1.3, 0));
        LIT.push(new THREE.BoxGeometry(span + 1.4, 0.16, 1.04).translate(0, hgt - 0.02, 0));
        var steel = new THREE.Mesh(mergeRaw(STEEL), new THREE.MeshStandardMaterial({ color: '#2A2C3E', roughness: 0.45, metalness: 0.6 }));
        g.add(steel);
        // (its light into the lap's mesh of light, where it stands)
        toGlow(mergeRaw(LIT).applyMatrix4(new THREE.Matrix4().makeRotationY(Math.atan2(f.tan.x, f.tan.z)).setPosition(f.pos)), glowCol(hex, 2.6));
        var sign = ctx.textures.canvas(1024, 128, function (cx, w, h) {
          cx.fillStyle = '#12101E'; cx.fillRect(0, 0, w, h);
          cx.font = '900 92px Bungee, "Arial Black", Impact, sans-serif'; cx.textAlign = 'center'; cx.textBaseline = 'middle';
          cx.shadowColor = hex; cx.shadowBlur = 18; cx.fillStyle = hex; cx.fillText(words, w / 2, h / 2 + 4); cx.shadowBlur = 0; cx.fillStyle = '#FFFFFF'; cx.globalAlpha = 0.85; cx.fillText(words, w / 2, h / 2 + 4);
        });
        var faces = [-1, 1].map(function (fb) { var p = new THREE.PlaneGeometry(span * 0.62, span * 0.62 / 8); if (fb < 0) p.rotateY(Math.PI); return p.translate(0, hgt + 1.3, fb * 0.52); });
        var fg = new THREE.BufferGeometry(), f0 = faces[0].toNonIndexed(), f1 = faces[1].toNonIndexed();
        ['position', 'normal', 'uv'].forEach(function (at0) { var a0 = f0.attributes[at0], a1 = f1.attributes[at0], arr = new Float32Array(a0.array.length + a1.array.length); arr.set(a0.array); arr.set(a1.array, a0.array.length); fg.setAttribute(at0, new THREE.BufferAttribute(arr, a0.itemSize)); });
        g.add(new THREE.Mesh(fg, new THREE.MeshBasicMaterial({ map: sign, color: new THREE.Color(1.5, 1.5, 1.5) })));
        g.position.copy(f.pos); g.rotation.y = Math.atan2(f.tan.x, f.tan.z);
        // (only its steel casts a shadow: the light and the sign would only darken the road under the steel's)
        g.traverse(function (o) { if (o.isMesh) { o.castShadow = o === steel; o.userData.gmKart = true; } });
        g.name = name; scenery.add(g);
        return g;
      }

      /* -------- the Candle Climb and Buy the Dip: a chart of giant candles, green up, red down -- */
      // each candle a glossy body (open to close) on a thin wick (high to low), in one instanced draw, its colour per
      // candle; the decks stand on candles under them, and more line the outside, the chart's price line over them
      var CANDLE = [], WICK = [], CAPS = [], line0 = [];
      function candle(x, z, y0, y1, w, dpt, rot, up, wick) {
        CANDLE.push({ x: x, z: z, y0: y0, y1: y1, w: w, d: dpt, r: rot, up: up });
        if (wick) WICK.push({ x: x, z: z, y0: y0 - wick[0], y1: y1 + wick[1], r: rot, up: up });
        if (wick) CAPS.push({ x: x, z: z, y: y1, w: w, d: dpt, r: rot, up: up });
      }
      function chart(d0, d1, up) {
        var n = Math.round((d1 - d0) / 7.5), drift = 0;
        for (var q = 0; q <= n; q++) {
          var d = d0 + (d1 - d0) * q / n, f = track.frameAt(d), y = f.pos.y, rot = Math.atan2(f.tan.x, f.tan.z);
          // under the deck, every other step: a candle the deck stands on (once it is up off the water)
          if (q % 2 === 0 && y > 3.2) candle(f.pos.x, f.pos.z, -1, y - 1.6, 7.2, 5.5, rot, up, null);
          // beside it the chart itself, floating: a candle each side, its body the open and close, its wick the high
          // and the low, riding a price that trends with the road and wanders round it; one in six the other colour
          drift = clamp(drift + (random() - 0.5) * 2.4, -2.5, 3.5);
          [-1, 1].forEach(function (sd) {
            var lat = sd * (wall + 5.2 + random() * 2.6), p = track.pointAt(d, lat, 0), other = random() < 0.17;
            var mid = y + (sd > 0 ? 4.5 : 2.5) + drift + (random() - 0.5) * 2, len = 2.5 + random() * 6;
            var bot = Math.max(1.2, mid - len / 2), top = Math.max(bot + 1.5, mid + len / 2);
            candle(p.x, p.z, bot, top, 2.3 + random() * 0.7, 2.3 + random() * 0.7, rot, other ? !up : up, [1.2 + random() * 3.5, 1.2 + random() * 4.5]);
            if (sd > 0) line0.push(new THREE.Vector3(p.x, top + 1.4, p.z));
          });
        }
      }
      chart(AT.climb * L + 6, lip - 4, true);
      var chartLineUp = line0.slice(); line0.length = 0;
      chart(moonEnd + 12, dipEnd - 6, false);
      var chartLineDown = line0.slice();
      // a candle's body: a box with rounded edges (it catches the light along them), standing on y = 0
      var cs = new THREE.Shape(), ra = 0.5, rb = 0.36;
      cs.moveTo(-ra, -rb); cs.lineTo(-ra, rb); cs.quadraticCurveTo(-ra, ra, -rb, ra); cs.lineTo(rb, ra); cs.quadraticCurveTo(ra, ra, ra, rb);
      cs.lineTo(ra, -rb); cs.quadraticCurveTo(ra, -ra, rb, -ra); cs.lineTo(-rb, -ra); cs.quadraticCurveTo(-ra, -ra, -ra, -rb);
      var candleGeo = new THREE.ExtrudeGeometry(cs, { depth: 1, bevelEnabled: false, curveSegments: 3 }); candleGeo.rotateX(-Math.PI / 2); candleGeo.computeVertexNormals();
      var bodyMat = new THREE.MeshStandardMaterial({ roughness: 0.22, metalness: 0.05, envMapIntensity: 1.4 });
      var bodies = named('bodies', ctx.instanced(candleGeo, bodyMat, CANDLE.length, function (q, o) { var c = CANDLE[q]; o.position.set(c.x, c.y0, c.z); o.rotation.y = c.r; o.scale.set(c.w, Math.max(0.3, c.y1 - c.y0), c.d); }));
      var GREEN = new THREE.Color(C.candle), RED = new THREE.Color(C.red);
      CANDLE.forEach(function (c, q) { bodies.setColorAt(q, c.up ? GREEN : RED); });
      bodies.castShadow = !low; bodies.receiveShadow = true; scenery.add(bodies);
      // (the wicks glow: neon threads through the bodies, brightest where they stand clear of them; and each body's
      // top edge lit (bloom), a thin frame of light coloured per candle: both one instanced draw of the body's shape)
      var LIT = WICK.map(function (c) { return [c.x, c.y0, c.z, c.r, 0.26, c.y1 - c.y0, 0.26, c.up ? 0 : 1]; }).concat(CAPS.map(function (c) { return [c.x, c.y - 0.1, c.z, c.r, c.w * 1.05, 0.16, c.d * 1.05, c.up ? 2 : 3]; }));
      var wicks = named('wicks', ctx.instanced(candleGeo, new THREE.MeshBasicMaterial({ color: '#FFFFFF' }), LIT.length, function (q, o) { var c = LIT[q]; o.position.set(c[0], c[1], c[2]); o.rotation.y = c[3]; o.scale.set(c[4], c[5], c[6]); }));
      var LC = [new THREE.Color(0.6, 2.4, 1.4), new THREE.Color(2.4, 0.5, 0.75), new THREE.Color(0.9, 3.0, 1.9), new THREE.Color(3.0, 0.75, 1.0)];
      LIT.forEach(function (c, q) { wicks.setColorAt(q, LC[c[7]]); });
      scenery.add(wicks);
      // (the candles under a deck stand under the road, never in the camera's way: the course's own, as the walls are)
      bodies.userData.gmKart = wicks.userData.gmKart = true;
      // the price line: from candle to candle over the chart's right-hand side, mint up the climb, red down the dip
      // (both in the lap's mesh of light)
      var PL = [];
      [[chartLineUp, C.mint], [chartLineDown, C.red]].forEach(function (pair) { if (pair[0].length >= 3) PL.push([new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pair[0], false, 'catmullrom', 0.1), pair[0].length * 6, 0.22, 6, false), pair[1]]); });
      if (PL.length) { var plg = merge(PL), plc = plg.attributes.color; for (var pv = 0; pv < plc.count; pv++) plc.setXYZ(pv, plc.getX(pv) * 3, plc.getY(pv) * 3, plc.getZ(pv) * 3); toGlow(plg); }

      // the chart's paper: beyond the candles on both sides a grid of faint mint lines, the price levels across it
      // every 10 m of height (1x, 10x, 100x, 1000x by the road as it climbs past them), a time line every 15 m
      var LV = [[9, '1X'], [19, '10X'], [29, '100X'], [39, '1000X']], gd0 = AT.climb * L - 10, gd1 = lip + 8;
      [1].forEach(function (sd) {
        LV.forEach(function (lv, n) {
          sweep('grid', gd0, gd1, function (d, f) { return [[wall + 11, lv[0] - f.pos.y], [wall + 11, lv[0] - f.pos.y + (n === 3 ? 0.22 : 0.12)]]; }, sd, 4, 8, null, glowCol(C.mint, n === 3 ? 2.2 : 1.2));
        });
        for (var dv = gd0; dv <= gd1; dv += 15) {
          var fv = track.frameAt(dv);
          sweep('grid', dv, dv + 0.18, [[wall + 11, 4 - fv.pos.y], [wall + 11, 40 - fv.pos.y]], sd, 1, 8, null, glowCol(C.mint, 0.45));
        }
      });
      // (seen from afar it would read as scaffolding: it is drawn only while the camera is up on the chart)
      var gridM = meshOf('grid', new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
      if (gridM) { gridM.receiveShadow = false; gridM.visible = false; W.grid = gridM; W.gridAt = track.frameAt((gd0 + gd1) / 2).pos.clone(); }
      // the levels' labels, and the ticker boards: made-up tickers (none of them a real coin's) running across LED
      // screens on posts by the road, green up the climb and red down the dip; one texture scrolls under them all
      var tick = ctx.textures.canvas(1024, 256, function (g, w, h) {
        g.fillStyle = '#05070A'; g.fillRect(0, 0, w, h);
        var rows = [['$CROAK +420.69%', '$LILY +69%', '$RIBBIT +1337%', '$WICK +88%'], ['$HOPS +250%', '$SWAMP +77%', '$CNDL +404%', '$LFG +900%'],
          ['$FOMO -42%', '$REKT -69%', '$BAGS -33%', '$DUMP -51%'], ['$OOPS -88%', '$COPE -27%', '$PAPER -61%', '$NGMI -99%']];
        g.font = '700 40px "Courier New", monospace'; g.textBaseline = 'middle';
        rows.forEach(function (r, n) {
          var y = n * h / 4 + h / 8, col = n < 2 ? '#3CFF9A' : '#FF4D6A';
          r.forEach(function (txt, k) { var x = 12 + k * w / 4; g.fillStyle = col; g.fillText((n < 2 ? '▲ ' : '▼ ') + txt, x, y); });
        });
        // (the LEDs' dot screen over it)
        g.fillStyle = 'rgba(0,0,0,0.45)'; for (var x = 0; x < w; x += 4) g.fillRect(x, 0, 1, h); for (var y2 = 0; y2 < h; y2 += 4) g.fillRect(0, y2, w, 1);
      });
      tick.wrapS = THREE.RepeatWrapping; W.tick = tick;
      var labels = ctx.textures.canvas(512, 256, function (g, w, h) {
        g.font = '900 52px Bungee, "Arial Black", Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        LV.forEach(function (lv, n) { g.fillStyle = 'rgba(8,26,20,0.85)'; g.fillRect(4, n * h / 4 + 4, w - 8, h / 4 - 8); g.fillStyle = '#7CFFCB'; g.fillText(lv[1], w / 2, n * h / 4 + h / 8 + 2); });
      });
      var SCR = { p: [], u: [], i: [] }, LAB = { p: [], u: [], i: [] }, FRAMES = [];
      function quad(Q, P, u0, u1, v0, v1) { var base = Q.p.length / 3; P.forEach(function (p, k) { Q.p.push(p.x, p.y, p.z); Q.u.push(k % 2 ? u1 : u0, k < 2 ? v0 : v1); }); Q.i.push(base, base + 1, base + 2, base + 1, base + 3, base + 2); }
      // (a board stands past the wall, turned 30 degrees from the road toward the karts coming up to it; its text
      // runs left to right as they see it)
      function board(d, sd, row, y) {
        var f = track.frameAt(d), c = track.pointAt(d, sd * (wall + 3.2), y), n = new THREE.Vector3().copy(f.tan).multiplyScalar(-Math.sin(0.5)).addScaledVector(f.right, -sd * Math.cos(0.5)); n.y = 0; n.normalize();
        var ax = new THREE.Vector3(n.z, 0, -n.x), w2 = 3.4, h2 = 0.8;
        var P = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(function (k) { return c.clone().addScaledVector(ax, k[0] * w2).add(new THREE.Vector3(0, k[1] * h2, 0)).addScaledVector(n, 0.18); });
        quad(SCR, P, (row * 0.37) % 1, (row * 0.37) % 1 + 0.5, 1 - (row + 1) / 4 + 0.01, 1 - row / 4 - 0.01);
        FRAMES.push([c, Math.atan2(-ax.z, ax.x), y]);
      }
      [[AT.climb * L + 40, 1, 0], [AT.climb * L + 78, -1, 1], [AT.climb * L + 140, 1, 1], [AT.climb * L + 178, -1, 0], [moonEnd + 40, -1, 2], [moonEnd + 110, 1, 3], [moonEnd + 160, -1, 2]].forEach(function (b) { board(b[0], b[1], b[2], 3.6); });
      LV.forEach(function (lv, n) {
        // (where the road passes each level, a label on the grid beside it)
        var dl = gd0; while (dl < gd1 && roadY(dl) < lv[0] - 1.5) dl += 2;
        [1].forEach(function (sd) { var P = [[-1, 0], [1, 0], [-1, 1], [1, 1]].map(function (k) { return track.pointAt(dl + k[0] * 2.6 * -sd, sd * (wall + 10.9), lv[0] - roadY(dl) + 0.3 + k[1] * 1.3); }); quad(LAB, P, 0, 1, 1 - (n + 1) / 4, 1 - n / 4); });
      });
      [[SCR, tick, 1.9], [LAB, labels, 1.6]].forEach(function (Q) {
        var gq = new THREE.BufferGeometry(); gq.setAttribute('position', new THREE.Float32BufferAttribute(Q[0].p, 3)); gq.setAttribute('uv', new THREE.Float32BufferAttribute(Q[0].u, 2)); gq.setIndex(Q[0].i);
        var mq = new THREE.Mesh(gq, new THREE.MeshBasicMaterial({ map: Q[1], color: new THREE.Color(Q[2], Q[2], Q[2]), side: THREE.DoubleSide, transparent: Q[1] === labels }));
        mq.userData.gmKart = true; scenery.add(mq); if (Q[1] === labels) W.labels = mq;
        if (Q[1] === tick) { gq.computeBoundingSphere(); farOff(mq, gq.boundingSphere.center.clone(), gq.boundingSphere.radius + 150); }
      });
      var frames = named('frames', ctx.instanced(new THREE.BoxGeometry(7.2, 2.0, 0.3), new THREE.MeshStandardMaterial({ color: '#1C1E2E', roughness: 0.5, metalness: 0.5 }), FRAMES.length * 2, function (q, o) {
        var F0 = FRAMES[q >> 1];
        o.position.copy(F0[0]); o.rotation.y = F0[1];
        if (q % 2) { o.position.y -= F0[2] / 2 + 0.5; o.scale.set(0.05, (F0[2] - 1) / 2, 0.8); }
      }));
      frames.userData.gmKart = true; scenery.add(frames);
      (function () { var c = new THREE.Vector3(); FRAMES.forEach(function (F0) { c.add(F0[0]); }); c.multiplyScalar(1 / Math.max(1, FRAMES.length)); var r = 0; FRAMES.forEach(function (F0) { r = Math.max(r, F0[0].distanceTo(c)); }); farOff(frames, c, r + 150); })();

      /* -------- the launch gantry: towers either side of the lip, a beam and a ring of lights over the leap -- */
      (function () {
        var f = track.frameAt(lip), g = new THREE.Group(), span = (wall + 3) * 2, hgt = 11;
        // (its steel merged into one mesh, its lamps and ring into the lap's mesh of light: one draw, where it was 36)
        var STEEL = [], LIT = [];
        [-1, 1].forEach(function (sd) {
          for (var k = 0; k < 4; k++) STEEL.push(new THREE.BoxGeometry(0.5, hgt + 25, 0.5).translate(sd * span / 2 + (k % 2 ? 1.6 : -1.6), (hgt + 25) / 2 - 25, k < 2 ? -1.6 : 1.6));
          for (var j = 0; j < 11; j++) STEEL.push(new THREE.BoxGeometry(3.7, 0.25, 0.25).translate(sd * span / 2, -22 + j * 3.2, 1.6));
          LIT.push([new THREE.SphereGeometry(0.55, 12, 8).translate(sd * span / 2, hgt + 0.6, 0), C.mog]);
        });
        STEEL.push(new THREE.BoxGeometry(span + 4, 1.4, 2.0).translate(0, hgt - 0.7, 0));
        var ring = new THREE.TorusGeometry(span / 2 - 0.5, 0.22, 8, 64, Math.PI); ring.scale(1, (hgt - 0.6) / (span / 2 - 0.5), 1); ring.translate(0, -0.4, 0);
        LIT.push([ring, C.mint]);
        var steel = new THREE.Mesh(mergeRaw(STEEL), new THREE.MeshStandardMaterial({ color: '#2A2C3E', roughness: 0.4, metalness: 0.65 }));
        var lg = merge(LIT), lc0 = lg.attributes.color; for (var v = 0; v < lc0.count; v++) lc0.setXYZ(v, lc0.getX(v) * 3.1, lc0.getY(v) * 3.1, lc0.getZ(v) * 3.1);
        steel.castShadow = true; steel.userData.gmKart = true; g.add(steel);
        g.position.copy(f.pos); g.rotation.y = Math.atan2(f.tan.x, f.tan.z);
        scenery.add(g);
        toGlow(lg.applyMatrix4(new THREE.Matrix4().makeRotationY(g.rotation.y).setPosition(f.pos)));
      })();

      /* -------- the moon: a small grey world hung in the sky, its ground curving away to a near horizon -- */
      (function () {
        // the moon's stretch of the lap, sampled
        var S = [], d0 = bridge + 0.5, d1 = moonEnd + 3;
        for (var d = d0; d <= d1; d += 2) { var f = track.frameAt(d); S.push({ x: f.pos.x, y: f.pos.y, z: f.pos.z, rx: f.right.x, rz: f.right.z, tx: f.tan.x, tz: f.tan.z, d: d }); }
        // (its ground runs REACH m past the walls, falling away as a sphere of radius RC does: from the road the
        // horizon is a curve some 16 m out, and from the air the whole moon's dome)
        var REACH = low ? 50 : 64, RC = 95, x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, reach = wall + REACH;
        S.forEach(function (s) { x0 = Math.min(x0, s.x); x1 = Math.max(x1, s.x); z0 = Math.min(z0, s.z); z1 = Math.max(z1, s.z); });
        x0 -= reach; x1 += reach; z0 -= reach; z1 += reach;
        var cell = low ? 4 : 2.5, nx = Math.ceil((x1 - x0) / cell), nz = Math.ceil((z1 - z0) / cell);
        var pos = new Float32Array((nx + 1) * (nz + 1) * 3), col = new Float32Array((nx + 1) * (nz + 1) * 3), ok = new Uint8Array((nx + 1) * (nz + 1)), PAST = new Float32Array((nx + 1) * (nz + 1)), idx = [];
        var cA = new THREE.Color('#E2E2E8'), cB = new THREE.Color('#9C9CA6'), cc = new THREE.Color();
        var R = mulberryLike(83);
        function drop(p) { return p * p / (2 * RC); }
        for (var j = 0; j <= nz; j++) for (var i = 0; i <= nx; i++) {
          var x = x0 + i * cell, z = z0 + j * cell, best = null, bd = Infinity;
          for (var q = 0; q < S.length; q++) { var s = S[q], dd = (s.x - x) * (s.x - x) + (s.z - z) * (s.z - z); if (dd < bd) { bd = dd; best = s; } }
          var lo = (x - best.x) * best.rx + (z - best.z) * best.rz, lat = Math.abs(lo), dist = Math.sqrt(bd), side = lo > 0 ? 1 : -1;
          // (only where the moon's road is the nearest of the lap: the chute and the climb keep clear of it)
          var nr = track.nearest(x, z), mine = onMoon(nr.d) || nr.distance > reach;
          // the rim: just past the berm round the hairpin's outside (the moon's edge there, a drop to the stars
          // beyond a wall that holds), far out elsewhere
          var edge = side < 0 && inside(best.d, AT.hairpin * L + 14, AT.hairpin * L + 56) ? wall + 2.2 : reach;
          var v = j * (nx + 1) + i, past = Math.max(0, lat - wall - 0.8);
          ok[v] = dist < edge && mine ? 1 : 0; PAST[v] = past;
          var y = best.y - 0.14 - drop(past) - Math.pow(Math.min(past, 4), 1.35) * 0.06 + (past > 1 ? (R() - 0.5) * 0.3 + Math.sin(x * 0.21) * Math.sin(z * 0.17) * 0.5 * Math.min(1, past / 8) : 0);
          pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z;
          cc.copy(cA).lerp(cB, clamp(0.3 + (Math.sin(x * 0.07 + z * 0.05) * 0.5 + Math.sin(z * 0.13) * 0.3) * 0.5 + (R() - 0.5) * 0.25, 0, 1)); col[v * 3] = cc.r; col[v * 3 + 1] = cc.g; col[v * 3 + 2] = cc.b;
        }
        for (j = 0; j < nz; j++) for (i = 0; i < nx; i++) {
          var a = j * (nx + 1) + i, b = a + 1, c2 = a + nx + 1, e = c2 + 1;
          if (ok[a] && ok[b] && ok[c2] && ok[e]) idx.push(a, c2, b, b, c2, e);
        }
        var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
        // (its uvs from above, so the dust's grain lies flat)
        var uv = new Float32Array((nx + 1) * (nz + 1) * 2); for (var u = 0; u < uv.length / 2; u++) { uv[u * 2] = pos[u * 3] / 7; uv[u * 2 + 1] = pos[u * 3 + 2] / 7; }
        g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        var top = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: dustTex, vertexColors: true, roughness: 0.97, emissive: '#30303E', emissiveIntensity: 0.4 }));
        top.receiveShadow = true; top.userData.gmTrack = true; scene.add(top);
        function groundAt(x, z) { var ix = Math.round((x - x0) / cell), iz = Math.round((z - z0) / cell); if (ix < 0 || iz < 0 || ix > nx || iz > nz) return null; var v = iz * (nx + 1) + ix; return ok[v] ? { y: pos[v * 3 + 1], past: PAST[v] } : null; }

        // the underside: the moon's rocky belly hanging over the swamp (its bumps a function of place, so the faces
        // that share a corner keep it: no cracks), lilac where it meets the dust and a deep indigo beneath
        function hash3(x, y, z) { x = Math.round(x * 1e3) / 1e3; y = Math.round(y * 1e3) / 1e3; z = Math.round(z * 1e3) / 1e3; var h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return h - Math.floor(h); }
        var rock = new THREE.IcosahedronGeometry(1, low ? 1 : 2), rp = rock.attributes.position, RR = mulberryLike(97);
        for (var k = 0; k < rp.count; k++) { var vx = rp.getX(k), vy = rp.getY(k), vz = rp.getZ(k), nn = 1 + (Math.sin(vx * 5.1 + vz * 3.3) * 0.08 + Math.sin(vy * 7.7 + vx * 2.1) * 0.06 + (hash3(vx, vy, vz) - 0.5) * 0.06); rp.setXYZ(k, vx * nn * (vy < 0 ? 1 + vy * 0.35 : 1), vy * nn * (vy > 0 ? 0.3 : 1.35), vz * nn * (vy < 0 ? 1 + vy * 0.35 : 1)); }
        rock.computeVertexNormals();
        var rcol = [], rc0 = new THREE.Color('#7E7B92'), rc1 = new THREE.Color('#100E22'), rcc = new THREE.Color();
        for (k = 0; k < rp.count; k++) { rcc.copy(rc0).lerp(rc1, smooth(0.3, -0.35, rp.getY(k))); rcol.push(rcc.r, rcc.g, rcc.b); }
        rock.setAttribute('color', new THREE.Float32BufferAttribute(rcol, 3));
        // (each blob [x, y, z, across, height, along, heading]: none under the light bridge, which leaps a real void,
        // nor over the top of the climb, nor up through the chute where the road falls away below the moon)
        var blobs = [], FOOT = [];
        for (var fd = lip - 70; fd <= bridge + 0.5; fd += 1.5) for (var fx = -(wall + 3); fx <= wall + 3; fx += 2) { var fp0 = track.pointAt(fd, fx, 0); FOOT.push([fp0.x, fp0.z, fp0.y, Infinity]); }
        for (fd = moonEnd - 4; fd <= moonEnd + 120; fd += 2) for (fx = -(wall + 1); fx <= wall + 1; fx += 2) { fp0 = track.pointAt(fd, fx, 0); FOOT.push([fp0.x, fp0.z, fp0.y, 0.8]); }
        function clearOf(B) {
          var cs = Math.cos(B[6]), sn = Math.sin(B[6]);
          for (var q = 0; q < FOOT.length; q++) {
            var F = FOOT[q], dx = F[0] - B[0], dz = F[1] - B[2], ax = (dx * cs - dz * sn) / B[3], az = (dx * sn + dz * cs) / B[5], e = ax * ax + az * az;
            if (e >= 1) continue;
            if (F[3] === Infinity || B[1] + B[4] * 0.36 * Math.sqrt(1 - e) > F[2] - F[3]) return false;
          }
          return true;
        }
        function hangRock(x, y, z, rx, h, rz, hd) {
          var B = [x, y, z, rx, h, rz, hd];
          for (var n = 0; n < 14 && !clearOf(B); n++) { B[3] *= 0.9; B[5] *= 0.9; }
          if (clearOf(B) && B[3] > 3) blobs.push(B);
        }
        // a cliff at the moon's near edge (short along the road, and set back under the dust a little, so the bridge
        // lands on an overhang and its void runs on under it), then the belly: rocks under the whole dome, each sunk
        // just under the ground above it
        var e0 = track.frameAt(bridge + 11.5);
        hangRock(e0.pos.x, e0.pos.y - 0.6 - 14 * 0.32, e0.pos.z, wall + 8, 14, 8.5, Math.atan2(e0.tan.x, e0.tan.z));
        var step = low ? 30 : 22;
        for (var bz = z0 + step / 2; bz < z1; bz += step) for (var bx = x0 + step / 2; bx < x1; bx += step) {
          var gb = groundAt(bx, bz); if (!gb) continue;
          var hb = 20 + RR() * 14 + Math.max(0, 40 - gb.past) * 0.5, rb = step * (0.7 + RR() * 0.2) + 4;
          hangRock(bx, gb.y - 0.9 - hb * 0.33 - gb.past * 0.08, bz, rb, hb, rb * (0.85 + RR() * 0.3), RR() * 6.28);
        }
        var under = named('under', ctx.instanced(rock, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true, emissive: '#1C1640', emissiveIntensity: 0.35 }), blobs.length, function (q, o) { var B = blobs[q]; o.position.set(B[0], B[1], B[2]); o.scale.set(B[3], B[4], B[5]); o.rotation.y = B[6]; }));
        under.userData.gmTrack = true; scenery.add(under);

        // the crater inside the hairpin, glowing; and craters all over the dust, rimmed and dished
        // (at the hairpin's middle, its own radius in: the centre of its arc)
        var HPS = SEG.filter(function (s) { return s[0] === 'hairpin'; })[0], hp = track.frameAt(AT.hairpin * L + HPS[2] * HPS[3] * Math.PI / 360), cen = hp.pos.clone().addScaledVector(hp.right, HPS[2]);
        var poolTex = ctx.textures.canvas(256, 256, function (cx, w, h) { var gr = cx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(180,255,240,1)'); gr.addColorStop(0.55, 'rgba(70,200,230,0.85)'); gr.addColorStop(0.9, 'rgba(40,40,110,0.3)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); cx.fillStyle = gr; cx.fillRect(0, 0, w, h); });
        var pool = new THREE.Mesh(new THREE.CircleGeometry(5.2, 40), new THREE.MeshBasicMaterial({ map: poolTex, color: new THREE.Color(1.8, 2.2, 2.4), transparent: true, depthWrite: false, fog: false }));
        pool.rotation.x = -Math.PI / 2; pool.position.set(cen.x, hp.pos.y - 0.12, cen.z); pool.userData.gmTrack = true; scene.add(pool); W.pool = pool;
        var rimG = lathe([[0, 0.03], [0.55, 0.05], [0.84, 0.13], [0.98, 0.32], [1.12, 0.27], [1.46, -0.1]], low ? 14 : 22), rc = [], cr = new THREE.Color();
        for (var rv = 0; rv < rimG.attributes.position.count; rv++) { var rr = Math.hypot(rimG.attributes.position.getX(rv), rimG.attributes.position.getZ(rv)); cr.set('#56565E').lerp(new THREE.Color('#D2D2D8'), smooth(0.55, 1.0, rr)); rc.push(cr.r, cr.g, cr.b); }
        rimG.setAttribute('color', new THREE.Float32BufferAttribute(rc, 3));
        var craters = [[cen.x, hp.pos.y - 0.2, cen.z, 6.2, 1.6]], ROCKS = [];
        for (var t2 = 0; t2 < 3000 && craters.length < (low ? 22 : 44); t2++) {
          var px = x0 + RR() * (x1 - x0), pz = z0 + RR() * (z1 - z0), gc = groundAt(px, pz);
          if (!gc || gc.past < 1.5 || gc.past > 32) continue;
          craters.push([px, gc.y + 0.02, pz, 1.2 + RR() * (gc.past > 10 ? 5 : 2.6), 1 + RR()]);
        }
        var rims = named('rims', ctx.instanced(rimG, new THREE.MeshStandardMaterial({ map: dustTex, vertexColors: true, roughness: 0.95 }), craters.length, function (q, o) { var c3 = craters[q]; o.position.set(c3[0], c3[1], c3[2]); o.scale.set(c3[3], 0.9 + c3[3] * 0.25 * c3[4], c3[3]); }));
        rims.receiveShadow = true; rims.userData.gmTrack = true; scenery.add(rims);
        // moon rocks: boulders and stones strewn over the dust, half sunk, grey and sharp
        for (t2 = 0; t2 < 4000 && ROCKS.length < (low ? 34 : 90); t2++) {
          var qx = x0 + RR() * (x1 - x0), qz = z0 + RR() * (z1 - z0), gq = groundAt(qx, qz);
          if (!gq || gq.past < 0.8 || gq.past > 26) continue;
          var sc = 0.2 + Math.pow(RR(), 2.2) * (gq.past > 6 ? 1.8 : 0.7);
          ROCKS.push([qx, gq.y - sc * 0.3, qz, sc, RR() * 6.28, RR() * 6.28]);
        }
        var stone = new THREE.IcosahedronGeometry(1, 1), sp2 = stone.attributes.position;
        for (k = 0; k < sp2.count; k++) { var s0 = 0.75 + hash3(sp2.getX(k), sp2.getY(k), sp2.getZ(k)) * 0.5; sp2.setXYZ(k, sp2.getX(k) * s0 * 1.2, sp2.getY(k) * s0 * 0.75, sp2.getZ(k) * s0); }
        stone.computeVertexNormals();
        var stones = named('stones', ctx.instanced(stone, new THREE.MeshStandardMaterial({ color: '#8C8C94', roughness: 0.92, flatShading: true }), ROCKS.length, function (q, o) { var Rk = ROCKS[q]; o.position.set(Rk[0], Rk[1], Rk[2]); o.scale.setScalar(Rk[3]); o.rotation.set(Rk[5] * 0.2, Rk[4], 0); }));
        stones.castShadow = !low; stones.receiveShadow = true; stones.userData.gmTrack = true; scenery.add(stones);

        // a rocket standing on the moon past the crater straight (the race's name, as a landmark): a white hull in
        // panels, a magenta nose and four swept fins, three lit portholes, a dark bell, scorch on the dust under it
        var LS = low ? 14 : 24, hull = [[0.02, 16.4], [0.55, 15.9], [1.05, 14.9], [1.5, 13.4], [1.86, 11.6], [2.08, 9.6], [2.16, 7.4], [2.12, 5.2], [1.98, 3.3], [1.74, 1.9]];
        var parts = [
          [lathe(hull.slice(0, 4), LS), C.mog], [lathe(hull.slice(3), LS), '#F1EEF6'],
          [lathe([[2.11, 10.0], [2.13, 9.3]], LS), C.mint], [lathe([[2.17, 4.6], [2.16, 4.0]], LS), C.mint],
          [lathe([[1.75, 1.95], [1.85, 1.6], [1.6, 1.35]], LS), '#9A97AE'],
          [lathe([[0.9, 1.4], [1.2, 0.8], [1.55, 0.05], [1.45, 0.0], [1.05, 0.7], [0.75, 1.3]], LS), '#3A3D52'],
        ];
        [12.2, 8.2, 6.2, 2.6].forEach(function (yb) { var rr2 = 2.0 + (yb > 9 ? -0.1 : 0.15); parts.push([lathe([[rr2 + 0.04, yb + 0.06], [rr2 + 0.04, yb - 0.06]], LS), '#B9B6C8']); });
        for (var fq = 0; fq < 4; fq++) parts.push([fin(fq * Math.PI / 2 + Math.PI / 4), C.mog]);
        for (var wq = 0; wq < 3; wq++) parts.push([new THREE.TorusGeometry(0.5, 0.1, 6, 16).applyMatrix4(new THREE.Matrix4().makeRotationY(wq * 2.094).multiply(new THREE.Matrix4().makeTranslation(0, 11.2, 1.93))), '#B9B6C8']);
        var rk = merge(parts);
        var fr = track.frameAt(AT.crater * L + 22), rp2 = track.pointAt(AT.crater * L + 22, -(wall + 6.5), 0), gr2 = groundAt(rp2.x, rp2.z);
        var rocket = new THREE.Mesh(rk, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.2, flatShading: false }));
        rocket.position.set(rp2.x, (gr2 ? gr2.y : fr.pos.y) - 0.1, rp2.z); rocket.rotation.set(0, 0.6, 0); rocket.castShadow = !low; scenery.add(rocket);
        var portG = mergeRaw([0, 1, 2].map(function (n) { return new THREE.CircleGeometry(0.44, 16).applyMatrix4(new THREE.Matrix4().makeRotationY(n * 2.094).multiply(new THREE.Matrix4().makeTranslation(0, 11.2, 1.97))); }));
        rocket.add(new THREE.Mesh(portG, new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 2.4, 2.0) })));
        var scorch = new THREE.Mesh(new THREE.CircleGeometry(6, 24), new THREE.MeshBasicMaterial({ map: ctx.textures.canvas(128, 128, function (cx, w, h) { var gr = cx.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(10,10,14,0.85)'); gr.addColorStop(0.5, 'rgba(20,18,24,0.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); cx.fillStyle = gr; cx.fillRect(0, 0, w, h); }), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
        scorch.rotation.x = -Math.PI / 2; scorch.position.set(rp2.x, (gr2 ? gr2.y : fr.pos.y) + 0.05, rp2.z); if (!low) scenery.add(scorch);
        function fin(a0) { var sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(2.6, -0.9); sh.quadraticCurveTo(2.9, 0.4, 2.2, 1.6); sh.quadraticCurveTo(0.9, 3.6, 0, 5.0); sh.lineTo(0, 0); var g2 = new THREE.ExtrudeGeometry(sh, { depth: 0.18, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 1, curveSegments: 4 }); g2.translate(1.6, 0.9, -0.09); g2.rotateY(a0); return g2; }

        // a lander (an original: a gold-foil stage on four legs, a silver cabin with a lit window, a dish) parked on
        // the far side of the crater straight, and flags (made-up: a green candle, a crescent and frog's eyes)
        function strut(a, b, r) { var dv = new THREE.Vector3().subVectors(b, a), gS = new THREE.CylinderGeometry(r, r, dv.length(), 6); gS.translate(0, dv.length() / 2, 0); gS.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dv.clone().normalize())); gS.translate(a.x, a.y, a.z); return gS; }
        var LP = [[new THREE.CylinderGeometry(1.35, 1.35, 1.2, 8).translate(0, 1.75, 0), '#D9A93A'], [new THREE.CylinderGeometry(0.95, 1.15, 1.1, 6).translate(0, 2.9, 0), '#C9CCD6'],
          [new THREE.BoxGeometry(0.7, 0.5, 0.12).translate(0, 3.0, 0.98), '#1C2236'], [new THREE.ConeGeometry(0.55, 0.3, 12, 1, true).rotateX(Math.PI).translate(0.6, 4.0, -0.3), '#E6E6EE'],
          [strut(new THREE.Vector3(0.6, 3.4, -0.3), new THREE.Vector3(0.6, 3.9, -0.3), 0.04), '#E6E6EE'], [new THREE.CylinderGeometry(0.5, 0.7, 0.5, 10, 1, true).translate(0, 0.95, 0), '#3A3D52']];
        [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(function (c4) {
          var top0 = new THREE.Vector3(c4[0] * 0.95, 1.4, c4[1] * 0.95), foot = new THREE.Vector3(c4[0] * 2.1, 0.12, c4[1] * 2.1);
          LP.push([strut(top0, foot, 0.08), '#B8B8C0'], [strut(new THREE.Vector3(c4[0] * 0.9, 2.2, c4[1] * 0.9), foot.clone().multiplyScalar(0.62).setY(0.6), 0.05), '#B8B8C0'], [new THREE.CylinderGeometry(0.42, 0.48, 0.12, 10).translate(foot.x, 0.06, foot.z), '#A8A8B2']);
        });
        var lander = new THREE.Mesh(merge(LP), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.55, flatShading: true }));
        var lf = track.frameAt(AT.crater * L + 18), lp = track.pointAt(AT.crater * L + 18, wall + 5, 0), gl = groundAt(lp.x, lp.z);
        lander.position.set(lp.x, gl ? gl.y - 0.05 : lf.pos.y, lp.z); lander.rotation.y = 2.2; lander.castShadow = !low; scenery.add(lander);
        var flagTex = ctx.textures.canvas(512, 128, function (cx, w, h) {
          cx.fillStyle = '#F4F2FA'; cx.fillRect(0, 0, w / 2, h); cx.fillStyle = '#2BE07A'; cx.fillRect(w * 0.2 - 16, 26, 32, 76); cx.fillRect(w * 0.2 - 3, 12, 6, 104);
          cx.font = '900 46px Bungee, "Arial Black", Impact, sans-serif'; cx.textBaseline = 'middle'; cx.fillStyle = '#14121F'; cx.fillText('GM', w * 0.28, h / 2 + 2);
          cx.fillStyle = '#1B2A6E'; cx.fillRect(w / 2, 0, w / 2, h); cx.fillStyle = '#FFC93C'; cx.beginPath(); cx.arc(w * 0.65, h / 2, 34, 0, 6.28); cx.fill(); cx.fillStyle = '#1B2A6E'; cx.beginPath(); cx.arc(w * 0.65 + 16, h / 2 - 8, 30, 0, 6.28); cx.fill();
          cx.fillStyle = '#4FA03A'; cx.beginPath(); cx.ellipse(w * 0.84, h / 2 + 8, 40, 26, 0, 0, 6.28); cx.fill(); cx.fillStyle = '#FFFFFF'; [-1, 1].forEach(function (s2) { cx.beginPath(); cx.arc(w * 0.84 + s2 * 18, h / 2 - 14, 13, 0, 6.28); cx.fill(); }); cx.fillStyle = '#111'; [-1, 1].forEach(function (s2) { cx.beginPath(); cx.arc(w * 0.84 + s2 * 18 + 3, h / 2 - 13, 6, 0, 6.28); cx.fill(); });
        });
        var FL = { p: [], u: [], i: [] }, FP = [];
        [[AT.crater * L + 38, wall + 4, 0], [AT.moon2 * L + 24, wall + 4, 1], [AT.moon2 * L + 20, -(wall + 4), 0], [AT.moon1 * L + 30, -(wall + 5), 1]].forEach(function (fl) {
          var pf = track.pointAt(fl[0], fl[1], 0), gf = groundAt(pf.x, pf.z), y0 = (gf ? gf.y : pf.y) + 2.0, ff = track.frameAt(fl[0]), base = FL.p.length / 3;
          FP.push([pf.x, (gf ? gf.y : pf.y), pf.z]);
          // (the cloth on a cross-bar, as flags are where nothing blows: a ripple set into it)
          for (var vv = 0; vv <= 1; vv++) for (var uu = 0; uu <= 6; uu++) {
            var along = uu / 6 * 1.7, ox = ff.tan.x * along * -1, oz = ff.tan.z * along * -1, rip = Math.sin(uu * 1.4) * 0.09;
            FL.p.push(pf.x + ox + ff.right.x * rip, y0 + vv * 1.05 - uu * 0.01, pf.z + oz + ff.right.z * rip); FL.u.push(fl[2] * 0.5 + uu / 6 * 0.5, vv);
          }
          for (uu = 0; uu < 6; uu++) { var a2 = base + uu, b2 = base + 7 + uu; FL.i.push(a2, a2 + 1, b2, a2 + 1, b2 + 1, b2); }
        });
        var fgm = new THREE.BufferGeometry(); fgm.setAttribute('position', new THREE.Float32BufferAttribute(FL.p, 3)); fgm.setAttribute('uv', new THREE.Float32BufferAttribute(FL.u, 2)); fgm.setIndex(FL.i); fgm.computeVertexNormals();
        var cloth = new THREE.Mesh(fgm, new THREE.MeshStandardMaterial({ map: flagTex, roughness: 0.7, side: THREE.DoubleSide })); cloth.userData.gmKart = true;
        // (the scorch under the rocket and the flags: not on a phone, three draws on the moon where it is busiest)
        if (!low) scenery.add(cloth);
        var flagPoles = named('flagPoles', ctx.instanced(new THREE.CylinderGeometry(0.04, 0.05, 3.2, 6).translate(0, 1.6, 0), new THREE.MeshStandardMaterial({ color: '#E4E4EC', roughness: 0.3, metalness: 0.7 }), FP.length, function (q, o) { o.position.set(FP[q][0], FP[q][1], FP[q][2]); }));
        flagPoles.castShadow = !low; if (!low) scenery.add(flagPoles);

        // dust: fine grey motes drifting low over the regolith (a shader moves them), and its soft haze in hollows
        var ND = low ? 120 : 320, dp = new Float32Array(ND * 3), da = new Float32Array(ND * 2), nd = 0;
        for (t2 = 0; t2 < ND * 6 && nd < ND; t2++) {
          var dx2 = x0 + RR() * (x1 - x0), dz2 = z0 + RR() * (z1 - z0), gd = groundAt(dx2, dz2);
          if (!gd || gd.past > 24) continue;
          dp[nd * 3] = dx2; dp[nd * 3 + 1] = gd.y + 0.15 + Math.pow(RR(), 2) * 2.2; dp[nd * 3 + 2] = dz2; da[nd * 2] = RR() * 6.28; da[nd * 2 + 1] = 0.4 + RR(); nd++;
        }
        var dgm = new THREE.BufferGeometry(); dgm.setAttribute('position', new THREE.BufferAttribute(dp.subarray(0, nd * 3), 3)); dgm.setAttribute('aFly', new THREE.BufferAttribute(da.subarray(0, nd * 2), 2));
        var dustMat = new THREE.ShaderMaterial({
          uniforms: { uT: { value: 0 }, uPx: { value: (low ? 420 : 620) * Math.min(2, window.devicePixelRatio || 1) / 2 } },
          vertexShader: 'attribute vec2 aFly; uniform float uT, uPx; varying float vA; void main() { vec3 p = position; float t = uT * 0.12 * aFly.y + aFly.x; p += vec3(sin(t * 1.1) * 2.2, sin(t * 0.7 + 1.3) * 0.3, cos(t * 0.9) * 2.2); vA = 0.35 + 0.25 * sin(uT * 0.8 + aFly.x * 3.0); vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = clamp(uPx * 0.18 / -mv.z, 1.5, 9.0); }',
          fragmentShader: 'varying float vA; void main() { vec2 q = gl_PointCoord - 0.5; float r = dot(q, q) * 4.0; if (r > 1.0) discard; gl_FragColor = vec4(vec3(0.85, 0.86, 0.95) * vA * (1.0 - r), 1.0); }',
          transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
        });
        var motes = new THREE.Points(dgm, dustMat); motes.frustumCulled = false; scene.add(motes); W.dust = dustMat;

        // beacons along the berms: a post and a blinking light every 14 m
        var BEA = [];
        for (var bd2 = bridge + 4; bd2 < moonEnd - 4; bd2 += 14) [-1, 1].forEach(function (sd) { if (!gapAt(bd2, sd)) BEA.push(track.pointAt(bd2, sd * (wall + 1.9), 0)); });
        var post = named('post', ctx.instanced(new THREE.CylinderGeometry(0.08, 0.12, 1.6, 6), new THREE.MeshStandardMaterial({ color: '#2A2C3E', roughness: 0.5, metalness: 0.5 }), BEA.length, function (q, o) { o.position.copy(BEA[q]).setY(BEA[q].y + 0.8); }));
        var bulbs = named('bulbs', ctx.instanced(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.8, 2.6, 3.0) }), BEA.length, function (q, o) { o.position.copy(BEA[q]).setY(BEA[q].y + 1.7); }));
        post.userData.gmKart = bulbs.userData.gmKart = true; scenery.add(post, bulbs); W.bulbs = bulbs.material;
        // (the moon's small things, put away while the camera is below it or far from it: from the swamp or the chart
        // they are specks, and each is a draw)
        W.moonAt = new THREE.Vector3((x0 + x1) / 2, S[0].y, (z0 + z1) / 2); W.moonSmall = [rims, stones, scorch, lander, cloth, flagPoles, motes, post, bulbs];
      })();

      /* -------- the swamp: cypress on islets, moss, reeds, lily pads and flowers, mist, fireflies, a far treeline -- */
      // spots out in the water, clear of the road and its walls at any height (the chart and the moon stand over it)
      var X0 = -200, X1 = 420, Z0 = -150, Z1 = 500;
      function spot(margin, tries) {
        for (var q = 0; q < (tries || 60); q++) { var x = X0 + random() * (X1 - X0), z = Z0 + random() * (Z1 - Z0); if (track.clear(x, z, margin)) return [x, z]; }
        return null;
      }
      // a bald cypress: a flared trunk, knees round it, flat clouds of needles, Spanish moss hanging from them (one
      // merged mesh in vertex colours, drawn as one instanced mesh)
      var tree = merge([
        [lathe([[1.6, 0], [1.0, 0.8], [0.62, 2.2], [0.5, 5], [0.42, 9], [0.3, 13]], 9), C.trunk],
        [blob(3.6, 1.1, 3.4, 0.3, 12.6, 0.2), C.cypress],
        [blob(2.8, 0.9, 2.6, 1.6, 11.2, -1.1), '#374530'],
        [blob(2.6, 0.9, 2.8, -1.7, 10.4, 0.9), C.cypress],
        [blob(1.9, 0.8, 1.8, 0.2, 14.0, -0.4), '#3A4A2E'],
        [hang(2.6, 11.6, 0.8, 5, 2.4), '#7E8B6C'],
        [hang(-1.5, 9.8, 1.4, 4, 2.0), '#76826A'],
        [knee(1.9, 0.4), C.trunk], [knee(-1.4, 1.6), C.trunk], [knee(0.3, -2.0), C.trunk],
      ]);
      var TREES = [];
      for (var tq = 0; tq < (low ? 46 : 110); tq++) { var at0 = spot(COURSE.shoulder + 16); if (at0) TREES.push([at0[0], at0[1], 0.7 + random() * 0.75, random() * 6.28]); }
      // and a few right under the light bridge, their crowns well below it, so the leap has the swamp to measure by
      [[0.25, -4, 1.05], [0.6, 5, 0.9], [0.95, -9, 0.8], [0.4, 15, 1.1], [0.7, -17, 1.0]].forEach(function (u) { var pb = track.pointAt(lerp(lip, bridge, u[0]), u[1], 0); TREES.push([pb.x, pb.z, u[2], u[0] * 9]); });
      var trees = named('trees', ctx.instanced(tree, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }), TREES.length, function (q, o) { var T = TREES[q]; o.position.set(T[0], WY - 0.6, T[1]); o.scale.setScalar(T[2]); o.rotation.y = T[3]; }));
      trees.castShadow = !low; trees.receiveShadow = true; scenery.add(trees);
      // the islets the cypress stand on
      var islet = new THREE.SphereGeometry(1, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2);
      var islets = named('islets', ctx.instanced(islet, new THREE.MeshStandardMaterial({ map: mossTex, roughness: 0.95 }), TREES.length, function (q, o) { var T = TREES[q]; o.position.set(T[0], WY - 0.55, T[1]); o.scale.set(4.2 * T[2], 0.7, 3.6 * T[2]); o.rotation.y = T[3]; }));
      islets.receiveShadow = true; scenery.add(islets);
      // lily pads: small ones in the water between the bank and the logs, giant ones past them, a notch in each, a
      // flower on some (none under the stands)
      var standAt = function (d) { return inside(d, SD0, SD1); };
      var pad = new THREE.CircleGeometry(1, 16, 0.35, Math.PI * 2 - 0.5); pad.rotateX(-Math.PI / 2);
      var PADS = [];
      for (var pq = 0; pq < (low ? 220 : 560); pq++) {
        var kind = random(), P0, size = 0;
        if (kind < 0.75) {
          var dd0 = random() * L; if (zoneAt(dd0) !== 'swamp' && random() < 0.8) continue;
          var sd0 = random() < 0.5 ? -1 : 1, open = gapAt(dd0, sd0), verge = kind < 0.35 && zoneAt(dd0) === 'swamp' && !boardwalk(dd0);
          var lat0 = verge ? hw + 2.1 + random() * (COURSE.shoulder - 2.6) : wall + (open ? 1.5 : 1.2) + Math.pow(random(), 1.6) * 30;
          if (standAt(dd0) && lat0 < wall + 9) continue;
          var pp = track.pointAt(dd0, sd0 * lat0, 0); P0 = [pp.x, pp.z];
          if (!track.clear(P0[0], P0[1], verge ? 2.0 : COURSE.shoulder + 1.0)) continue;
          size = verge ? 0.45 + random() * 0.9 : 0.7 + Math.pow(random(), 1.7) * 4.4;
        } else { P0 = spot(COURSE.shoulder + 2, 4); size = 0.7 + Math.pow(random(), 1.7) * 2.4; }
        if (!P0) continue;
        PADS.push([P0[0], P0[1], size, random() * 6.28, random()]);
      }
      // (and big ones afloat in the open channels the course cuts through the road: the log jump's, the Lily Hop's)
      BRK.forEach(function (B) {
        if (!B.water) return;
        for (var k3 = 0; k3 < 3; k3++) { var x3 = clamp(lerp(B.x0, B.x1, 0.2 + 0.3 * k3) + (random() - 0.5) * 2, Math.max(B.x0, -wall) + 1.2, Math.min(B.x1, wall) - 1.2), p3 = track.pointAt(lerp(B.d0, B.d1, 0.25 + 0.25 * (k3 % 3)), x3, 0); PADS.push([p3.x, p3.z, 1.0 + random() * 0.7, random() * 6.28, random()]); }
      });
      var pads = named('pads', ctx.instanced(pad, new THREE.MeshStandardMaterial({ roughness: 0.45, side: THREE.DoubleSide }), PADS.length, function (q, o) { var Pq = PADS[q]; o.position.set(Pq[0], WY + 0.03 + (q % 3) * 0.005, Pq[1]); o.scale.setScalar(Pq[2]); o.rotation.y = Pq[3]; }));
      var lc = new THREE.Color();
      PADS.forEach(function (Pq, q) { lc.set(C.lily).offsetHSL((Pq[4] - 0.5) * 0.06, (Pq[4] - 0.5) * 0.2, (Pq[4] - 0.5) * 0.12); pads.setColorAt(q, lc); });
      pads.receiveShadow = true; scenery.add(pads);
      var flower = merge([[petals(6, 0.55, 0.22, 0.5), '#FFD1E6'], [petals(5, 0.34, 0.3, 0.2), '#FF8FC4'], [new THREE.SphereGeometry(0.12, 6, 4).translate(0, 0.28, 0), '#FFE27A']]);
      // (none on a phone: a draw for a speck of pink)
      var FL = low ? [] : PADS.filter(function (Pq) { return Pq[4] < 0.24 && Pq[2] > 0.6; });
      var flowers = named('flowers', ctx.instanced(flower, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, emissive: '#5A2A44', emissiveIntensity: 0.5 }), FL.length, function (q, o) { var Pq = FL[q]; o.position.set(Pq[0] + Math.cos(Pq[3]) * Pq[2] * 0.3, WY + 0.05, Pq[1] + Math.sin(Pq[3]) * Pq[2] * 0.3); o.scale.setScalar(0.6 + Pq[2] * 0.25); o.rotation.y = Pq[3]; }));
      if (FL.length) scenery.add(flowers);
      // reeds and cattails: clumps where the bank meets the water by the road, and along the banks past the walls
      var reed = merge([[stems(9, 2.3), '#5F7A3A'], [heads(9, 2.3), '#5A3A24']]);
      var REEDS = [];
      for (var rq = 0; rq < (low ? 120 : 320); rq++) {
        var dr = random() * L; if (zoneAt(dr) !== 'swamp') continue;
        var sr = random() < 0.5 ? -1 : 1, bank = random() < 0.4 && !boardwalk(dr); if (gapAt(dr, sr) && random() < 0.6 && !bank) continue;
        var lr = bank ? hw + 2.5 + random() * 0.8 : wall + 1.6 + random() * 9; if (standAt(dr) && lr < wall + 9) continue;
        var pr = track.pointAt(dr, sr * lr, 0); if (!track.clear(pr.x, pr.z, bank ? 1.8 : COURSE.shoulder + 1.4)) continue;
        REEDS.push([pr.x, pr.z, (bank ? 0.45 : 0.7) + random() * 0.6, random() * 6.28]);
      }
      var reeds = named('reeds', ctx.instanced(reed, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide }), REEDS.length, function (q, o) { var Rq = REEDS[q]; o.position.set(Rq[0], WY - 0.5, Rq[1]); o.scale.setScalar(Rq[2]); o.rotation.y = Rq[3]; }));
      reeds.castShadow = !low; scenery.add(reeds);
      // posts along the boardwalk with a warm lantern on each
      var POSTS = [];
      for (var dp = AT.home * L + 4; dp < L + AT.lily1 * L; dp += 9) if (Math.abs(dp - L) > 4) [-1, 1].forEach(function (sd) { POSTS.push(track.pointAt(dp, sd * (wall + 1.1), 0)); });
      var posts = named('posts', ctx.instanced(new THREE.CylinderGeometry(0.14, 0.18, 2.6, 6), new THREE.MeshStandardMaterial({ map: barkTex, roughness: 0.85 }), POSTS.length, function (q, o) { o.position.copy(POSTS[q]).setY(POSTS[q].y + 0.3); }));
      var lanterns = named('lanterns', ctx.instanced(new THREE.SphereGeometry(0.22, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.0, 1.9, 0.9) }), POSTS.length, function (q, o) { o.position.copy(POSTS[q]).setY(POSTS[q].y + 1.75); }));
      posts.castShadow = !low; posts.userData.gmKart = lanterns.userData.gmKart = true; scenery.add(posts, lanterns);
      // paper lanterns afloat on the water by the road, warm, a few drifted out among the pads
      var FLOAT = [];
      for (var lq2 = 0; lq2 < (low ? 40 : 110); lq2++) {
        var dl2 = random() * L; if (zoneAt(dl2) !== 'swamp' || boardwalk(dl2)) continue;
        var sl2 = random() < 0.5 ? -1 : 1, ll2 = random() < 0.6 ? hw + 2.3 + random() * (COURSE.shoulder - 2.8) : wall + 1.4 + random() * 14;
        var pl2 = track.pointAt(dl2, sl2 * ll2, 0); if (!track.clear(pl2.x, pl2.z, 2.0)) continue;
        FLOAT.push([pl2.x, pl2.z, 0.7 + random() * 0.5]);
      }
      var floats = named('floats', ctx.instanced(new THREE.SphereGeometry(0.3, 8, 6).scale(1, 0.8, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 1.6, 0.7) }), FLOAT.length, function (q, o) { var F0 = FLOAT[q]; o.position.set(F0[0], WY + 0.2 * F0[2], F0[1]); o.scale.setScalar(F0[2]); }));
      floats.userData.gmKart = true; scenery.add(floats);
      W.swamp = [trees, islets, reeds, floats, flowers, posts, lanterns];
      // (on a phone the small ones go sooner, halfway up the chart: from up there they are specks on the water)
      W.swampSmall = low ? [pads, reeds, floats, posts, lanterns] : null;
      // mist lying on the water
      var mistTex = ctx.textures.canvas(128, 128, function (cx, w, h) { var gr = cx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); cx.fillStyle = gr; cx.fillRect(0, 0, w, h); });
      var mistGeo = new THREE.PlaneGeometry(1, 1); mistGeo.rotateX(-Math.PI / 2);
      var MIST = []; for (var mq = 0; mq < (low ? 0 : 26); mq++) { var ms = spot(COURSE.shoulder + 4, 10); if (ms) MIST.push([ms[0], 0.35 + random() * 1.2, ms[1], 40 + random() * 50]); }
      var mist = MIST.length && named('mist', ctx.instanced(mistGeo, new THREE.MeshBasicMaterial({ map: mistTex, color: '#E6C8E8', transparent: true, opacity: 0.09, depthWrite: false }), MIST.length, function (q, o) { var M = MIST[q]; o.position.set(M[0], M[1], M[2]); o.scale.set(M[3], 1, M[3] * 0.6); o.rotation.y = q; }));
      if (mist) { mist.renderOrder = 3; scenery.add(mist); } W.mist = mist || null;
      // the far treeline: two rings of cypress silhouettes against the dusk, the nearer one darker (they sink away as
      // you climb into space, so the moon's horizon is the sky's)
      var CX = 110, CZ = 180;
      [[560, 46, '#1A1828', 0.0], [760, 64, '#2A2236', 0.5]].forEach(function (rg, n) {
        var tex = ctx.textures.canvas(1024, 128, function (cx, w, h) {
          var R2 = mulberryLike(400 + n);
          cx.fillStyle = '#fff';
          cx.fillRect(0, h - 10, w, 10);
          for (var q = 0; q < 46; q++) {
            var x = R2() * w, th = h * (0.35 + R2() * 0.6), tw = 4 + R2() * 6;
            cx.fillRect(x - tw / 2, h - th, tw, th);
            for (var c3 = 0; c3 < 4; c3++) { cx.beginPath(); cx.ellipse(x + (R2() - 0.5) * 30, h - th + R2() * th * 0.3, 14 + R2() * 18, 4 + R2() * 5, 0, 0, 6.28); cx.fill(); }
            for (var m3 = 0; m3 < 5; m3++) cx.fillRect(x + (R2() - 0.5) * 34, h - th + 4, 1.5, 8 + R2() * 20);
          }
          for (var b3 = 0; b3 < 120; b3++) { cx.beginPath(); cx.ellipse(R2() * w, h - 8 - R2() * 18, 12 + R2() * 24, 6 + R2() * 10, 0, 0, 6.28); cx.fill(); }
        });
        tex.repeat.set(5 + n, 1); tex.wrapS = THREE.RepeatWrapping;
        var ring = new THREE.Mesh(new THREE.CylinderGeometry(rg[0], rg[0], rg[1], 64, 1, true), new THREE.MeshBasicMaterial({ map: tex, color: rg[2], transparent: true, alphaTest: 0.45, side: THREE.BackSide, alphaMap: tex, fog: true }));
        ring.position.set(CX, rg[1] / 2 - 2, CZ); ring.userData.gmTrack = true; ring.renderOrder = -10; scenery.add(ring);
        (W.rings || (W.rings = [])).push([ring, rg[1] / 2 - 2, rg[1] + 30]);
      });
      // fireflies: drifting points of warm light over the water and the banks (a shader moves them; none in the road)
      var NF = low ? 160 : 460, fp = new Float32Array(NF * 3), fa = new Float32Array(NF * 2), nf = 0;
      for (var fq = 0; fq < NF * 3 && nf < NF; fq++) {
        var df = random() * L; if (zoneAt(df) !== 'swamp' && random() < 0.85) continue;
        var sf = random() < 0.5 ? -1 : 1, pf = track.pointAt(df, sf * (hw + 1.8 + Math.pow(random(), 1.4) * 36), 0);
        if (!track.clear(pf.x, pf.z, 1.5)) continue;
        fp[nf * 3] = pf.x; fp[nf * 3 + 1] = 0.6 + Math.pow(random(), 1.5) * 4; fp[nf * 3 + 2] = pf.z; fa[nf * 2] = random() * 6.28; fa[nf * 2 + 1] = 0.5 + random(); nf++;
      }
      var fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.BufferAttribute(fp.subarray(0, nf * 3), 3)); fg.setAttribute('aFly', new THREE.BufferAttribute(fa.subarray(0, nf * 2), 2));
      var flyMat = new THREE.ShaderMaterial({
        uniforms: { uT: { value: 0 }, uPx: { value: (low ? 520 : 760) * Math.min(2, window.devicePixelRatio || 1) / 2 } },
        vertexShader: 'attribute vec2 aFly; uniform float uT, uPx; varying float vA; void main() { vec3 p = position; float t = uT * 0.35 * aFly.y + aFly.x; p += vec3(sin(t * 1.3) * 1.6, sin(t * 0.9 + 1.7) * 0.7, cos(t * 1.1) * 1.6); vA = smoothstep(0.15, 1.0, 0.5 + 0.5 * sin(uT * (1.4 + aFly.y) + aFly.x * 5.0)); vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = clamp(uPx * 0.26 / -mv.z, 2.0, 14.0); }',
        fragmentShader: 'varying float vA; void main() { vec2 q = gl_PointCoord - 0.5; float r = dot(q, q) * 4.0; if (r > 1.0) discard; float k = (1.0 - r); k = k * k; gl_FragColor = vec4(vec3(1.7, 2.5, 0.35) * vA * k, 1.0); }',
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      });
      var flies = new THREE.Points(fg, flyMat); flies.frustumCulled = false; scene.add(flies); W.flies = flyMat; W.fliesPts = flies;

      /* -------- the chaos, the world's half: the rails' fins, the swamp's own hazards, pads in the channels -- */
      // under each rail a fin of light down to the road, so it reads from far off as the chart's own line (mint up the
      // climb, ice blue on the moon, lantern-warm over the bayou's channel) and, on the ground, as the wall it is
      COURSE.rails.forEach(function (R) {
        var P = R.points ? R.points.map(function (p) { return [p[0] * L, p[1]]; }) : [[R.from * L, R.x], [R.to * L, R.x]], h = R.h || 0.5;
        var xAt = function (d) { for (var q = 1; q < P.length; q++) if (d <= P[q][0]) return lerp(P[q - 1][1], P[q][1], (d - P[q - 1][0]) / Math.max(1e-6, P[q][0] - P[q - 1][0])); return P[P.length - 1][1]; };
        var z0 = zoneAt(P[0][0]), hex = z0 === 'climb' ? C.mint : z0 === 'swamp' ? ZC.swamp : '#8FE9FF';
        sweep('glow', P[0][0], P[P.length - 1][0], function (d) { var x = xAt(d); return [[x, 0.05], [x, h - 0.17]]; }, 1, 1, 8, null, glowCol(hex, 0.75));
        sweep('glow', P[0][0], P[P.length - 1][0], function (d) { var x = xAt(d); return [[x, h - 0.2], [x, h - 0.16]]; }, 1, 1, 8, null, glowCol(hex, 2.6));
      });
      // a cypress log that lies at the road's side and rolls across it (the esses, the log straight), and the swamp
      // gas vents down the run: the mud boils under the warning ring, then the gas goes up (the runtime's burst of
      // flame) in a glowing green plume that billows and thins, and throws the mud out round it. Each drawn where
      // ctx.kart.hazards() says
      var mudMat = new THREE.MeshStandardMaterial({ color: '#4A3626', roughness: 0.28, metalness: 0.05 });
      var mudVC = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.05 });
      // (the plume: puffs stacked and bunched at the top, a soft toxic mint; the splash: lumps of mud and weed)
      var PUF = [];
      [[0, 0.5, 0, 0.75], [0.1, 1.4, 0.05, 0.9], [-0.1, 2.4, 0, 1.05], [0, 3.4, 0.1, 1.25], [0.9, 3.7, 0.3, 0.9], [-0.8, 3.8, -0.4, 0.95], [0.3, 4.3, -0.8, 0.85], [-0.3, 4.2, 0.8, 0.9]].forEach(function (b0) { PUF.push(blob(b0[3], b0[3] * 0.9, b0[3], b0[0], b0[1], b0[2])); });
      var plumeG = mergeRaw(PUF);
      var SPL = [];
      for (var sp0 = 0; sp0 < 10; sp0++) { var sa = sp0 / 10 * Math.PI * 2 + (sp0 % 2) * 0.3, sr = 0.9 + (sp0 % 3) * 0.3; SPL.push([blob(0.3 + (sp0 % 2) * 0.12, 0.22, 0.3, Math.cos(sa) * sr, 0.25 + (sp0 % 3) * 0.2, Math.sin(sa) * sr), sp0 % 4 === 0 ? '#56703A' : sp0 % 2 ? '#7E5E3E' : '#5A4230']); }
      var splashG = merge(SPL);
      // (the log's ends: pale wood, its rings darker; its bark ridged)
      var LOGP = [[new THREE.CylinderGeometry(0.9, 0.9, 3.2, 14, 1, true), '#5A4634']];
      [-1, 1].forEach(function (e) {
        var lay = function (g, z) { g.rotateX(-e * Math.PI / 2); g.translate(0, e * (1.6 + z), 0); return g; };
        LOGP.push([lay(new THREE.CircleGeometry(0.9, 14), 0), '#C69A66']);
        [[0.18, 0.24], [0.42, 0.48], [0.66, 0.71], [0.82, 0.9]].forEach(function (r0, n) { LOGP.push([lay(new THREE.RingGeometry(r0[0], r0[1], 14), 0.004), n === 3 ? '#6A4A30' : '#9A7048']); });
      });
      for (var lr = 0; lr < 7; lr++) { var la0 = lr / 7 * Math.PI * 2; LOGP.push([new THREE.BoxGeometry(0.12, 3.1, 0.1).translate(Math.cos(la0) * 0.9, 0, Math.sin(la0) * 0.9), '#45362A']); }
      LOGP.push([blob(0.5, 0.18, 0.7, 0.72, 0.4, 0.2), '#56703A'], [blob(0.4, 0.16, 0.5, -0.5, -0.9, 0.6), '#4E6834'], [new THREE.CylinderGeometry(0.18, 0.24, 0.5, 6).rotateZ(Math.PI / 2).translate(0.95, -0.4, -0.2), '#4A3A2E']);
      var HZ = [];
      COURSE.hazards.forEach(function (H, q) {
        if (H.model !== false) return;
        if (H.kind === 'crossing') {
          var logG = merge(LOGP);
          logG.rotateX(Math.PI / 2);
          var log = new THREE.Mesh(logG, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }));
          log.castShadow = true; log.userData.gmKart = true; scenery.add(log);
          HZ.push({ q: q, kind: 'log', m: log, r: 0.9 });
        } else {
          var mound = new THREE.Mesh(new THREE.SphereGeometry(1.7, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2), mudMat);
          var plume = new THREE.Mesh(plumeG, new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 1.5, 0.75), transparent: true, opacity: 0.7, depthWrite: false }));
          var splash = new THREE.Mesh(splashG, mudVC);
          [mound, plume, splash].forEach(function (m) { m.visible = false; m.userData.gmKart = true; scenery.add(m); });
          plume.renderOrder = 2; splash.castShadow = true;
          HZ.push({ q: q, kind: 'geyser', mound: mound, plume: plume, splash: splash });
        }
      });
      W.hz = HZ; W.basis = new THREE.Matrix4(); W.lens = new THREE.Vector3();
      // (set on the road's frame at d, x across and y up, facing along it)
      W.place = function (o, d, x, y) { var f = track.frameAt(d); o.position.copy(f.pos).addScaledVector(f.right, x).addScaledVector(f.up, y); W.basis.makeBasis(f.left, f.up, f.tan); o.quaternion.setFromRotationMatrix(W.basis); };

      // every line of light, gathered above, in one draw
      meshOf('glow', new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), { track: true });

      // (helpers that build the swamp's shapes, each a geometry for merge())
      function lathe(prof, seg) { return new THREE.LatheGeometry(prof.map(function (p) { return new THREE.Vector2(p[0], p[1]); }), seg); }
      function blob(rx, ry, rz, x, y, z) { var g = new THREE.SphereGeometry(1, 10, 6); g.scale(rx, ry, rz); g.translate(x, y, z); return g; }
      function hang(x, y, z, n, len) { var out = []; for (var q = 0; q < n; q++) { var g = new THREE.ConeGeometry(0.22 + (q % 2) * 0.1, len * (0.7 + (q % 3) * 0.25), 4, 1, true); g.rotateX(Math.PI); g.translate(x + (q - n / 2) * 0.45, y - len * 0.45, z + ((q * 37) % 5 - 2) * 0.3); out.push(g); } return mergeRaw(out); }
      function knee(x, z) { var g = new THREE.ConeGeometry(0.28, 0.9, 5); g.translate(x, 0.45, z); return g; }
      function petals(n, len, lift, w) { var out = []; for (var q = 0; q < n; q++) { var g = new THREE.SphereGeometry(1, 6, 4); g.scale(w * 0.35, 0.12, len * 0.5); g.rotateX(-lift); g.translate(0, 0.12 + lift * 0.3, len * 0.42); g.rotateY(q / n * Math.PI * 2); out.push(g); } return mergeRaw(out); }
      function stems(n, h) { var out = []; for (var q = 0; q < n; q++) { var a = q / n * 6.28, r = 0.25 + (q % 3) * 0.12, hh = h * (0.75 + ((q * 7) % 5) * 0.08); var g = new THREE.BoxGeometry(0.05, hh, 0.02); g.translate(0, hh / 2, 0); g.rotateZ(Math.cos(a) * 0.12); g.rotateX(Math.sin(a) * 0.12); g.translate(Math.cos(a) * r, 0, Math.sin(a) * r); out.push(g); } return mergeRaw(out); }
      function heads(n, h) { var out = []; for (var q = 0; q < n; q += 2) { var a = q / n * 6.28, r = 0.25 + (q % 3) * 0.12, hh = h * (0.75 + ((q * 7) % 5) * 0.08); var g = new THREE.CylinderGeometry(0.07, 0.07, 0.36, 6); g.translate(0, hh - 0.25, 0); g.rotateZ(Math.cos(a) * 0.12); g.rotateX(Math.sin(a) * 0.12); g.translate(Math.cos(a) * r, 0, Math.sin(a) * r); out.push(g); } return mergeRaw(out); }
      function mergeRaw(list) {
        var P = [], N = [];
        list.forEach(function (g) { var gg = g.index ? g.toNonIndexed() : g; P.push.apply(P, gg.attributes.position.array); gg.computeVertexNormals(); N.push.apply(N, gg.attributes.normal.array); });
        var out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); out.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); return out;
      }
      // geometries with a colour each, merged into one in vertex colours
      function merge(list) {
        var P = [], N = [], Cc = [], cl = new THREE.Color();
        list.forEach(function (it) {
          var g = it[0].index ? it[0].toNonIndexed() : it[0]; if (!g.attributes.normal) g.computeVertexNormals();
          cl.set(it[1]); P.push.apply(P, g.attributes.position.array); N.push.apply(N, g.attributes.normal.array);
          for (var q = 0; q < g.attributes.position.count; q++) Cc.push(cl.r, cl.g, cl.b);
        });
        var out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); out.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); out.setAttribute('color', new THREE.Float32BufferAttribute(Cc, 3)); return out;
      }
      // a soft mottle: round smudges of two tones, blurred, then a fine speck over them (no square pixels up close)
      function noiseTex(c0, c1, c2, seed) {
        var t = ctx.textures.canvas(256, 256, function (g, w, h) {
          var R = mulberryLike(seed); g.fillStyle = c0; g.fillRect(0, 0, w, h);
          g.filter = 'blur(2px)';
          for (var q = 0; q < 900; q++) {
            var x = R() * w, y = R() * h, r = 2 + Math.pow(R(), 2) * 12; g.fillStyle = R() < 0.6 ? c1 : c2; g.globalAlpha = 0.18 + R() * 0.4;
            [-w, 0, w].forEach(function (ox) { [-h, 0, h].forEach(function (oy) { g.beginPath(); g.ellipse(x + ox, y + oy, r, r * (0.6 + R() * 0.4), R() * 3, 0, 6.28); g.fill(); }); });
          }
          g.filter = 'blur(0.6px)';
          for (q = 0; q < 2600; q++) { g.fillStyle = R() < 0.5 ? c1 : c2; g.globalAlpha = 0.3 + R() * 0.4; g.beginPath(); g.arc(R() * w, R() * h, 0.7 + R() * 1.1, 0, 6.28); g.fill(); }
          g.filter = 'none'; g.globalAlpha = 1;
        });
        return t;
      }
    },

    update: function (ctx, t, dt) {
      W.t = t;
      var cam = ctx.camera.position;
      // the climb into space: the zenith darkens, the stars come out, the haze thins
      var want = cam.y > 110 ? 0 : smooth(16, 40, cam.y);   // (a shot from high over the whole circuit keeps the dusk)
      W.space += (want - W.space) * 0.08;
      if (W.hemi) {
        var sl = smooth(0.3, 1, W.space);
        W.hemi.color.copy(W.lit.sky0).lerp(W.lit.sky1, sl); W.hemi.groundColor.copy(W.lit.gnd0).lerp(W.lit.gnd1, sl); W.hemi.intensity = lerp(1.15, 0.85, sl);
        W.sun.color.copy(W.lit.sun0).lerp(W.lit.sun1, sl); W.sun.intensity = lerp(2.7, 3.1, sl);
      }
      if (W.spaceMat) W.spaceMat.uniforms.uSpace.value = W.space;
      if (W.stars) { W.stars.uniforms.uT.value = t; W.stars.uniforms.uSpace.value = W.space; }
      if (W.spaceDome) { W.spaceDome.position.copy(cam); W.spaceDome.visible = W.space > 0.01; }
      if (W.starPts) { W.starPts.position.copy(cam); W.starPts.visible = W.space > 0.01; }
      // (unless the runtime has pushed the fog back itself, for a shot from high above the whole circuit)
      if (W.fog && W.fog.near < 1000) { W.fog.near = lerp(W.fogNear, 140, W.space); W.fog.far = lerp(W.fogFar, 620, W.space); W.fog.color.copy(W.fogLow).lerp(W.fogHigh, smooth(0.2, 0.9, W.space)); }
      // (the water's held sky: the painted dusk fades out of it as the real sky goes black)
      if (W.water && W.water.material) {
        if (W.waterEnv == null) W.waterEnv = W.water.material.envMapIntensity;   // (as the runtime left it)
        W.water.material.envMapIntensity = W.waterEnv * lerp(1, 0.03, smooth(0.15, 0.75, W.space));
      }
      if (W.flies) W.flies.uniforms.uT.value = t;
      if (W.fliesPts) W.fliesPts.visible = W.space < 0.6;
      if (W.stands) for (var sq2 = 0; sq2 < W.stands.length; sq2++) W.stands[sq2].visible = W.space < 0.5;
      // (the moon's small things only from up at its height, near it: the launch, the moon, the top of the chute)
      if (W.far) for (var fq = 0; fq < W.far.length; fq++) W.far[fq][0].visible = cam.distanceTo(W.far[fq][1]) < W.far[fq][2];
      if (W.moonSmall) { var mfar = cam.y < 39 || cam.distanceTo(W.moonAt) > 220; for (var mq = 0; mq < W.moonSmall.length; mq++) W.moonSmall[mq].visible = !mfar; }
      if (W.studU) W.studU.uT.value = t;
      if (W.fanU) W.fanU.uT.value = t;
      if (W.crowd) stepCrowd(ctx, t, dt > 0 ? Math.min(dt, 0.1) : 0);
      if (W.tick) W.tick.offset.x = t * 0.06;
      if (W.dust) W.dust.uniforms.uT.value = t;
      // (mist lies along the water; from high above it would only smudge the view)
      if (W.mist) W.mist.visible = cam.y < 80;
      if (W.grid) { var gx = cam.x - W.gridAt.x, gz = cam.z - W.gridAt.z; W.grid.visible = W.labels.visible = gx * gx + gz * gz < 150 * 150 && cam.y > 5 && cam.y < 90; }
      // (and up on the moon the swamp's trees, reeds and lanterns far below are put away: from up there it is space)
      if (W.swamp) for (var sq = 0; sq < W.swamp.length; sq++) W.swamp[sq].visible = W.space < 0.92;
      if (W.swampSmall) for (var sq3 = 0; sq3 < W.swampSmall.length; sq3++) W.swampSmall[sq3].visible = W.space < 0.45;
      if (W.rings) W.rings.forEach(function (R) { R[0].position.y = R[1] - R[2] * W.space; R[0].visible = W.space < 0.97; });
      if (W.bridgeMat && W.bridgeMat.map) W.bridgeMat.map.offset.y = -t * 1.6;
      if (W.bulbs) W.bulbs.color.setRGB(0.8, 2.6, 3.0).multiplyScalar(0.55 + 0.45 * (Math.sin(t * 3.2) > 0.3 ? 1 : 0.2));
      if (W.pool) W.pool.material.color.setRGB(1.8, 2.2, 2.4).multiplyScalar(0.85 + 0.15 * Math.sin(t * 1.7));
      // the swamp's hazards, where the race has them: the log rolling across (its roll the distance it has come), the
      // mud boiling up under its ring and then the geyser, up 7 m and falling back
      var HS = W.hz && W.hz.length && ctx.kart && typeof ctx.kart.hazards === 'function' ? ctx.kart.hazards() : null;
      if (HS) W.hz.forEach(function (Z) {
        var h = HS[Z.q]; if (!h) return;
        if (Z.kind === 'log') {
          W.place(Z.m, h.d, h.x, Z.r); Z.m.rotateZ(h.x / Z.r);
          // (put away while it is under the camera behind your kart, as the race says (h.lens), or the lens within 2 m
          // of it out along its length. 8 Oct, the round-3 film: after the whale had thrown a kart, the log rolled
          // under the lens behind it and filled the foot of the frame)
          Z.m.updateMatrixWorld(); var lp = Z.m.worldToLocal(W.lens.copy(ctx.camera.position));
          Z.m.visible = !h.lens && Math.hypot(Math.hypot(lp.x, lp.y), Math.max(0, Math.abs(lp.z) - 1.55)) > 2;
        } else {
          var warn = h.phase === 'warn', up = h.phase === 'smoke';
          Z.mound.visible = warn || up; Z.plume.visible = Z.splash.visible = up;
          if (!Z.mound.visible) return;
          W.place(Z.mound, h.d, h.x, -0.05);
          var bub = warn ? 0.25 + 0.75 * h.u + 0.08 * Math.sin(t * 23) : 1 - 0.6 * h.u;
          Z.mound.scale.set(bub, warn ? 0.35 + 0.5 * h.u + 0.1 * Math.sin(t * 17 + 1) : 0.8 * (1 - h.u), bub);
          if (up) {
            // (the plume up fast and billowing out as it thins; the mud thrown out and falling back round the vent)
            var rise = Math.min(1, h.u / 0.25), wd = 0.6 + 1.3 * h.u + 0.4 * rise;
            W.place(Z.plume, h.d, h.x, 0); Z.plume.scale.set(wd, 0.3 + 1.2 * rise + 0.5 * h.u, wd); Z.plume.material.opacity = 0.75 * (1 - h.u * h.u);
            W.place(Z.splash, h.d, h.x, 2.2 * Math.sin(Math.PI * Math.min(1, h.u * 1.4))); Z.splash.scale.setScalar(0.8 + 2.4 * h.u);
          }
        }
      });
    },

    player: function (ctx) { return racer(ctx, 0); },
    rival: function (ctx, k) { return racer(ctx, k); },
  });

  // the crowd, every frame: the cards' clock (quicker, and the stands up on their toes, for a few seconds after GO,
  // every lap and the finish), and a laptop's people by the grid in place of their cards near the camera, moving
  // every frame up close, every second or third further off, and not at all out of view
  function stepCrowd(ctx, t, dt) {
    var C = W.crowd, cam = ctx.camera, show = W.space < 0.5, dirty = false;
    C.cheer = Math.max(0, C.cheer - dt * 0.3); C.t += dt * (1 + 0.5 * C.cheer); C.U.uT.value = C.t; C.U.uHop.value = C.cheer;
    if (!C.real.length) return;
    C.pv.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); C.fr.setFromProjectionMatrix(C.pv);
    for (var i = 0; i < C.real.length; i++) {
      var h = C.real[i], d2 = h.at.distanceToSquared(cam.position), on = show && d2 < 26 * 26;
      h.clock += dt;
      if (on !== h.on) { h.on = on; h.p.object.visible = on; C.mesh.setMatrixAt(h.q, on ? C.zero : h.m); dirty = true; }
      if (!on) continue;
      h.acc = Math.min(0.25, h.acc + dt);
      C.sph.center.set(h.at.x, h.at.y + 0.9, h.at.z);
      if (!C.fr.intersectsSphere(C.sph)) continue;
      var face = d2 < 110; if (face !== h.face) { h.face = face; for (var k = 0; k < h.small.length; k++) h.small[k].visible = face; }
      if (++h.n < (d2 < 150 ? 1 : d2 < 400 ? 2 : 3)) continue;
      h.n = 0;
      // (a cheer now and then, a wave every so often from those with nothing in their hands)
      if (h.clock >= h.next) { h.id++; h.act = { name: !h.hold && h.id % 3 === 0 ? 'wave' : h.move, id: h.id }; h.next = h.clock + 2.2 + C.rnd() * 3.5; }
      h.p.animate(t, h.acc, { speed: 0, brawl: { stance: h.stance, action: h.act } });
      if (h.p.fix) h.p.fix();
      h.acc = 0;
    }
    if (dirty) C.mesh.instanceMatrix.needsUpdate = true;
  }

  // a small seeded generator for the textures (the world's own random() is for placing things)
  function mulberryLike(seed) { var s = seed >>> 0; return function () { s = (s + 0x6d2b79f5) >>> 0; var t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
})();
