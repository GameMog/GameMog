// MOGATRON
//
// A first-party GameMog world, a lightbike race through a neon machine at night (the owner, 18 Oct 2026: a
// hyperreal night-neon race of lightbikes down glowing tunnels, film-inspired but entirely our own: eight riders,
// three laps, the hazards on and the item weapons off, black glass and light). Eight lightbikes race three laps of
// Voltline Circuit, a 1.4 km loop that runs from tube to bridge to hall and back:
//   Ignition Bore        the start: a long ringed tube straight out of the line
//   The Helix Drain      a ribbed, banked right-hander that tightens as it falls 12 m, windows on the city outside
//   Splitwire Esses      a left, a tight right drift bend and a left, split by a hanging blade of light, climbing
//   Overclock Span       the open bridge over the night city: up over the lip and across a 9 m gap in the deck
//   Dynamo Drum          a big banked right sweeper round a turning dynamo core inside a cylinder of light
//   Last Light Straight  the roofless trench home under high arches, to the checker of light
// The hazards are the machine's own: corrupted data cubes falling through the Helix's roof, plasma wheels rolling
// out of doorways across the esses and the final straight, and data pylons toppling across the bridge and the drum.
//
// The riders (each a lightbike of its own shape: long, low, a black glass shell enclosing two big wheels ringed in
// light, a rider crouched along its back, a ribbon of light streaming behind): Cryo Vector (cyan, the player), Ember
// Torque (orange), Fuchsia Glitch (magenta), Acid Sprint (lime), Violet Vortex (violet), Aurum Dash (gold), Redline
// Rook (red) and Cobalt Drift (blue).
//
// The look: black glass floors with bright cyan lane lines and orange secondary lines, dark structure outlined in
// light, haze shafts and data streams, a vast neon city below the bridge, an indigo-black sky with no sun. The
// soundtrack is the library's electro track (a first-party world plays its own music).
//
// Built from parts, joined in this order: the shared helpers, the circuit (the lap, its sections, the course and the
// hazards' neon models), the lightbikes (riders, models and light trails), the look (the place, its light and its
// sky), then the world itself. The physics, the rules, the camera, the HUD and the race are the runtime's
// (lib/runtime/kart.js). Everything is built in code; no brand, no logo.
(function () {
  'use strict';

  /* ------------------------------------------------------------ helpers -- */
  // (shared by every part)
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function smooth(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function hexColor(h) { return new THREE.Color(h); }

  /* ======================================================== lane A: the circuit -- */
  // The lap, its six sections, the course (pads, the lip and the jump, rollers, rails, hazards) and the hazards'
  // own neon models. The lap is walked as straights and arcs and closed (scripts/.scratch/mogatron/tools/
  // circuit-gen.mjs, which also measures it as the runtime builds it: a closed Catmull-Rom, tension 0.5):
  //   lap 1,381 m; 71 control points; x east, z south, y up, metres; a clockwise loop starting east from the line.
  //   Ignition Bore (launch)   0 -  196 m  flat straight from the line
  //   The Helix Drain (spiral) 196 -  427 m  a 180-degree right, tightening r 70 > 56 > 46, down 12 m, banked to 15
  //   Splitwire Esses (chicane) 427 - 598 m  left r 36, the 21 m right (the drift), left r 36, then climbing out
  //   Overclock Span (skyline)  598 - 896 m  the open bridge: up 8 m, then flat; the lip and the 9 m gap at 851 m
  //   Dynamo Drum (drum)        896 - 1133 m a 180-degree right sweeper, r 59, banked 16
  //   Last Light Straight (final) 1133 - 1381 m the long run home (the starting boxes stand in its last 30 m)
  // Every course place is given as a fraction of the lap (a_at(m): metres on the measured lap), so it follows the
  // track whatever the runtime's own length comes to.
  var ROAD_WIDTH = 16;
  var SHOULDER = 3;
  var LAPS = 3;
  var CIRCUIT_NAME = 'Voltline Circuit';
  // (the lap's length as measured, metres: only to turn metres into fractions)
  var A_LAP_M = 1381.0;
  function a_at(m) { return +(m / A_LAP_M).toFixed(4); }

  var LAP_POINTS = [
  [0, 0, 0, 0], [24.5, 0, 0, 0], [49, 0, 0, 0], [73.5, 0, 0, 0],
  [98, 0, 0, 0], [122.5, 0, 0, 0], [147, 0, 0, 0], [171.5, 0, 0, 0],
  [196, 0, 0, -1.5], [212, -0.6, 0, -3], [228.8, -1.57, 2.1, -12], [244.9, -2.56, 8.2, -12],
  [258.8, -3.54, 17.9, -12], [270.1, -4.53, 30.9, -12], [277.8, -5.5, 46.1, -12], [280.9, -6.38, 60.4, -14],
  [280.3, -7.26, 75.1, -14], [275.9, -8.12, 88.8, -14], [268.1, -9, 101.2, -14], [258, -9.87, 110.1, -15],
  [246.1, -10.73, 115.7, -15], [232.8, -11.6, 117.6, -8.5], [217.8, -11.8, 117.6, -2], [202.8, -12, 117.6, -2],
  [190.8, -11.74, 119.7, 6], [180.4, -11.26, 125.5, 6], [172.3, -11, 134.6, 6], [166.5, -10.79, 140.7, -8],
  [158.7, -10.3, 144, -8], [150.3, -9.7, 144, -8], [142.5, -9.21, 140.7, -8], [136.7, -9, 134.6, -8],
  [128.6, -8.48, 125.5, 6], [118.1, -7.52, 119.7, 6], [106.1, -7, 117.6, 3], [87.4, -6.22, 117.6, 0],
  [68.9, -4.78, 117.6, 0], [50.1, -4, 117.6, 0], [24.1, -3.17, 117.6, 0], [-1.9, -1.18, 117.6, 0],
  [-27.9, 1.18, 117.6, 0], [-53.9, 3.17, 117.6, 0], [-79.9, 4, 117.6, 0], [-103.9, 4, 117.6, 0],
  [-127.9, 4, 117.6, 0], [-151.9, 4, 117.6, 0], [-175.9, 4, 117.6, 0], [-199.9, 4, 117.6, 0],
  [-223.9, 4, 117.6, 0], [-247.9, 4, 117.6, -2], [-260.9, 3.75, 117.6, -4], [-273.9, 3.5, 117.6, -4],
  [-294, 3.45, 114.1, -16], [-311.6, 3.31, 103.9, -16], [-324.8, 3.11, 88.3, -16], [-331.8, 2.88, 69.1, -16],
  [-331.8, 2.62, 48.5, -16], [-324.8, 2.39, 29.3, -16], [-311.6, 2.19, 13.7, -16], [-294, 2.05, 3.5, -16],
  [-273.9, 2, 0, -10], [-260.9, 1.75, 0, -4], [-247.9, 1.5, 0, -2], [-220.3, 1.45, 0, 0],
  [-192.8, 1.31, 0, 0], [-165.3, 1.11, 0, 0], [-137.8, 0.88, 0, 0], [-110, 0.62, 0, 0],
  [-82.5, 0.39, 0, 0], [-55, 0.19, 0, 0], [-27.5, 0.05, 0, 0],
  ];

  // the six sections, in lap order, contiguous from 0 to 1 (fractions of the lap); m is the measured length,
  // turn the way the section bends ('right', 'left', 'S' or ''), drop the height change over it (metres)
  var SECTIONS = [
    { id: 'launch', name: 'Ignition Bore', from: 0, to: a_at(196), kind: 'launch', m: 196, turn: '', drop: 0 },
    { id: 'spiral', name: 'The Helix Drain', from: a_at(196), to: a_at(427), kind: 'spiral', m: 231, turn: 'right', drop: -12 },
    { id: 'chicane', name: 'Splitwire Esses', from: a_at(427), to: a_at(598), kind: 'chicane', m: 171, turn: 'S', drop: 8 },
    { id: 'skyline', name: 'Overclock Span', from: a_at(598), to: a_at(896), kind: 'skyline', m: 298, turn: '', drop: 8 },
    { id: 'drum', name: 'Dynamo Drum', from: a_at(896), to: a_at(1133), kind: 'drum', m: 237, turn: 'right', drop: -2.5 },
    { id: 'final', name: 'Last Light Straight', from: a_at(1133), to: 1, kind: 'final', m: 248, turn: '', drop: -1.5 },
  ];

  // the course (lib/runtime/API.md "Kart races"). Hazards, every one on its own clock, all model: false (drawn by
  // buildHazards below from ctx.kart.hazards(), in this order); never two within 80 m, none in the first 95 m or
  // the starting boxes, each with the runtime's own warning (a lit line, a shadow, a ring) plus ours (a portal glow, a pylon's
  // pulse, a targeting beam)
  var COURSE = {
    shoulder: SHOULDER,
    // Green Candle pads: the launch, the spiral's exit, out of the esses, the run-up to the gap, the drum's exit,
    // the final straight
    pads: [
      { at: a_at(110), x: -3 },
      { at: a_at(405), x: 0 },
      { at: a_at(560), x: 2.5 },
      { at: a_at(800), x: 0 },
      { at: a_at(1112), x: -2.5 },
      { at: a_at(1232), x: 3 },
    ],
    // the gap on the bridge: a full-width lip with its edge just before a 9 m break, every kart flown over it
    // (clear: true); then rollers out of the drum
    bumps: [
      { at: a_at(851.5), size: 'lip', h: 0.6 },
      { at: a_at(1150), size: 'roller', n: 3, h: 0.4 },
    ],
    breaks: [{ from: a_at(852), len: 9, clear: true }],
    // a little more air off every pop, a little floatier (Aspen GP's opt-in, gentler)
    air: { lift: 1.25, hang: 0.45 },
    // two grind rails: one down the left after the gap's landing (a flight from the left comes down onto it), one
    // down the right of the final straight
    rails: [
      { from: a_at(867), to: a_at(893), x: -5.5, h: 0.5 },
      { from: a_at(1245), to: a_at(1290), x: 5.5, h: 0.5 },
    ],
    // the inside of the 21 m right: a dark shoulder strip, so the cut over the apex costs a little
    offroad: [{ from: a_at(468), to: a_at(500), side: 'inside', width: 2, kind: 'shoulder' }],
    walls: { gaps: [] },
    airdrops: false,
    gm: 'auto',
    hazards: [
      // a data cube out of the bore's ceiling, somewhere in 95-175 m (one strike in two aimed at the leader)
      { kind: 'meteor', from: a_at(95), to: a_at(175), every: 5, offset: 1, model: false },
      // another down the Helix, 262-338 m
      { kind: 'meteor', from: a_at(262), to: a_at(338), every: 5.5, offset: 3, model: false },
      // a plasma wheel rolling out of the left wall across the esses' exit
      { kind: 'crossing', at: a_at(575), side: 'left', every: 6, offset: 2, model: false },
      // a data pylon at the right of the bridge's climb (roofless: it stands 19 m tall)
      { kind: 'topple', at: a_at(668), side: 'right', every: 8, offset: 1, model: false },
      // a data pylon on the outside of the drum (the hall must clear 20 m over the road's left edge here)
      { kind: 'topple', at: a_at(1010), side: 'left', every: 7.5, offset: 4, model: false },
      // a plasma wheel out of the right wall across the final straight
      { kind: 'crossing', at: a_at(1205), side: 'right', every: 6.5, offset: 0.5, model: false },
    ],
  };

  // the other kart options (to be written out inline in kart: { ... } by the integrator)
  var KART_EXTRA = {
    driftAssist: true,
    driftCharge: 1.3,
    fx: { skids: '#3FF4FF', skidOpacity: 0.35, rush: true, hype: true, smoke: '#4A5878', offroad: { shoulder: '#1A2236' } },
  };

  // for the look (lane C), read at build time: where each crossing's wheel comes out of the walls (leave a doorway in
  // BOTH walls, at: a fraction of the lap, half: metres either side of it along the lap, h: its height; buildHazards
  // draws a neon frame round it at the wall line), and where each pylon stands (at, side: -1 left / 1 right, need:
  // the clear height over the road there, metres: no roof, rib or arch lower than that within 12 m along of it)
  var HAZARD_PORTALS = COURSE.hazards.filter(function (h) { return h.kind === 'crossing'; }).map(function (h) { return { at: h.at, half: 2.4, h: 3.6 }; });
  var HAZARD_PYLONS = COURSE.hazards.filter(function (h) { return h.kind === 'topple'; }).map(function (h) { return { at: h.at, side: h.side === 'left' ? -1 : 1, need: 21 }; });

  /* the hazards' models: neon, cheap (two draws each, the falling cube three), all userData.gmKart */
  function buildHazards(ctx) {
    var T3 = ctx.THREE, low = ctx.quality === 'low', track = ctx.track, L = track.length, hw = track.halfWidth;
    var sh = Math.max(1.5, Math.min(12, SHOULDER)), wall = hw + sh, span = wall + 1.5;
    // (the runtime's own numbers: a topple's foot and length, a crossing's radius)
    var ext = Math.max(0.6, Math.min(2, sh - 0.6)), FOOT = hw + ext, LEN = 2 * hw + ext + 1, WR = 1.4;
    var BASIS = new T3.Matrix4(), VA = new T3.Vector3(), VB = new T3.Vector3(), VQ = new T3.Vector3(), O = new T3.Object3D();
    function wrapD(d) { d %= L; return d < 0 ? d + L : d; }
    function dOf(v) { v = Number(v); return wrapD(Math.abs(v) <= 1 ? v * L : v); }
    // (on the road's frame at d: local x the road's left, y its up, z along it; x given here is metres to the right)
    function place(o, d, x, y) {
      var f = track.frameAt(d);
      o.position.copy(f.pos).addScaledVector(f.right, x).addScaledVector(f.up, y);
      BASIS.makeBasis(f.left, f.up, f.tan); o.quaternion.setFromRotationMatrix(BASIS);
    }
    function hdr(r, g, b) { return [r, g, b]; }
    // (pieces into one geometry: position, normal and an HDR colour per vertex)
    function merge(parts) {
      var n = 0, gs = parts.map(function (p) { var g = p[0].index ? p[0].toNonIndexed() : p[0]; if (!g.attributes.normal) g.computeVertexNormals(); n += g.attributes.position.count; return [g, p[1]]; });
      var P = new Float32Array(n * 3), N = new Float32Array(n * 3), C = new Float32Array(n * 3), o = 0;
      gs.forEach(function (p) {
        var g = p[0], c = p[1] || [1, 1, 1], k = g.attributes.position.count;
        P.set(g.attributes.position.array, o * 3); N.set(g.attributes.normal.array, o * 3);
        for (var i = 0; i < k; i++) { C[(o + i) * 3] = c[0]; C[(o + i) * 3 + 1] = c[1]; C[(o + i) * 3 + 2] = c[2]; }
        o += k;
      });
      var out = new T3.BufferGeometry();
      out.setAttribute('position', new T3.BufferAttribute(P, 3)); out.setAttribute('normal', new T3.BufferAttribute(N, 3)); out.setAttribute('color', new T3.BufferAttribute(C, 3));
      out.computeBoundingSphere();
      return out;
    }
    function solidMat() { return new T3.MeshStandardMaterial({ vertexColors: true, roughness: 0.22, metalness: 0.65 }); }
    function glowMat(add) {
      var m = new T3.MeshBasicMaterial({ vertexColors: true });
      if (add) { m.transparent = true; m.blending = T3.AdditiveBlending; m.depthWrite = false; m.side = T3.DoubleSide; m.forceSinglePass = true; }
      return m;
    }
    function mark(m) { m.userData.gmKart = true; m.traverse(function (c) { c.userData.gmKart = true; }); return m; }
    function addTo(parent, m) { mark(m); parent.add(m); return m; }
    function box(w, h, l, x, y, z) { return new T3.BoxGeometry(w, h, l).translate(x || 0, y || 0, z || 0); }
    var DARK = [0.03, 0.035, 0.06], RED = hdr(3.2, 0.42, 0.3), AMBER = hdr(3.0, 1.35, 0.28), HOT = hdr(3.2, 2.6, 2.2), MAG = hdr(2.8, 0.3, 1.9);
    var cam = function () { return ctx.camera; };
    var statS = [], statG = [];

    /* a plasma wheel (crossing): radius 1.4 (the runtime's reach), its axle along the road, rolling across it */
    function wheel(H) {
      var seg = low ? 28 : 48, g = new T3.Group(), spin = new T3.Group(); g.add(spin);
      var solid = merge([
        [new T3.TorusGeometry(1.22, 0.18, low ? 6 : 10, seg), DARK],
        [new T3.CylinderGeometry(1.08, 1.08, 0.1, seg, 1).rotateX(Math.PI / 2), [0.02, 0.025, 0.045]],
      ]);
      var parts = [[new T3.TorusGeometry(1.37, 0.06, 6, seg), RED], [new T3.TorusGeometry(0.78, 0.045, 5, seg).translate(0, 0, 0.09), MAG], [new T3.TorusGeometry(0.78, 0.045, 5, seg).translate(0, 0, -0.09), MAG],
        [new T3.CylinderGeometry(0.22, 0.22, 0.34, 12).rotateX(Math.PI / 2), HOT]];
      for (var i = 0; i < 6; i++) parts.push([box(0.07, 1.1, 0.05, 0, 0.67, 0.08).rotateZ(i * Math.PI / 3), AMBER], [box(0.07, 1.1, 0.05, 0, 0.67, -0.08).rotateZ(i * Math.PI / 3 + Math.PI / 6), AMBER]);
      var gm = glowMat(false);
      addTo(spin, new T3.Mesh(solid, solidMat())); addTo(spin, new T3.Mesh(merge(parts), gm));
      mark(g); g.visible = false; ctx.scene.add(g);
      // (its doorways, both walls: a neon frame, into the static meshes)
      var d = dOf(H.at);
      [-1, 1].forEach(function (s) {
        var x = s * (wall + 0.15);
        [[box(0.18, 3.5, 0.18, 0, 1.75, -2.1), RED], [box(0.18, 3.5, 0.18, 0, 1.75, 2.1), RED], [box(0.18, 0.18, 4.38, 0, 3.5, 0), AMBER], [box(0.05, 0.05, 4.2, 0, 0.04, 0), RED]].forEach(function (p) {
          place(O, d, x, 0); O.updateMatrix(); p[0].applyMatrix4(O.matrix); statG.push(p);
        });
      });
      return function (h, t, dt) {
        var ph = h.phase, show = ph === 'roll' || ph === 'warn';
        if (!show || h.lens) { g.visible = false; return; }
        // (waiting in its doorway through the warning, pulsing; rolling across after)
        var x = ph === 'roll' ? h.x : (h.side || 1) * span * 0.93;
        place(g, h.d, x, WR + 0.02);
        spin.rotation.z = h.x / WR;
        var k = ph === 'warn' ? 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(t * 26)) * h.u + 0.3 * h.u : 1.15;
        gm.color.setRGB(k, k, k);
        g.updateMatrixWorld();
        g.visible = g.position.distanceTo(cam().position) > WR + 1.2;
      };
    }

    /* a data pylon (topple): 1.1 m square, the runtime's length (19 m on a 16 m road and a 3 m shoulder) */
    function pylon(H) {
      var len = LEN, foot0 = new T3.Group(), pivot = new T3.Group(); foot0.add(pivot); mark(foot0); ctx.scene.add(foot0);
      var body = len - 1.2, parts = [];
      var solid = merge([[box(1.1, body, 1.1, 0, 0.2 + body / 2, 0), DARK], [new T3.ConeGeometry(0.8, 1.0, 4).rotateY(Math.PI / 4).translate(0, body + 0.7, 0), DARK]]);
      // (its four edges lit red, amber bands up it every 2.4 m, a white-hot beacon on top)
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (c) { parts.push([box(0.07, body - 0.4, 0.07, c[0] * 0.56, 0.4 + (body - 0.4) / 2, c[1] * 0.56), RED]); });
      for (var y = 1.4; y < body - 0.5; y += 2.4) parts.push([box(1.17, 0.08, 1.17, 0, y, 0), AMBER]);
      parts.push([new T3.OctahedronGeometry(0.34, 0).translate(0, body + 1.45, 0), HOT]);
      // (a data stripe down the road-facing side: short glyph bars)
      for (var j = 0; j < (low ? 4 : 9); j++) parts.push([box(0.5 - (j % 3) * 0.12, 0.12, 0.04, 0, 2.2 + j * 1.6, 0.57), MAG]);
      var gm = glowMat(false);
      addTo(pivot, new T3.Mesh(solid, solidMat())); addTo(pivot, new T3.Mesh(merge(parts), gm));
      // (its plinth on the shoulder, and a lit ring round it: static)
      var side = H.side === 'left' ? -1 : 1, d = dOf(H.at);
      place(O, d, side * FOOT, 0); O.updateMatrix();
      // (standing at its foot from the start: the race's list is read only from the first update)
      place(foot0, d, side * FOOT, 0);
      var pl = new T3.CylinderGeometry(0.95, 1.15, 0.34, 6).translate(0, 0.17, 0); pl.applyMatrix4(O.matrix); statS.push([pl, DARK]);
      var rg = new T3.TorusGeometry(1.2, 0.05, 4, 24).rotateX(Math.PI / 2).translate(0, 0.36, 0); rg.applyMatrix4(O.matrix); statG.push([rg, RED]);
      return function (h, t, dt) {
        var s = h.side || side, u = h.u, ph = h.phase;
        place(foot0, h.d, s * FOOT, 0);
        var ang = ph === 'fall' ? u * u * Math.PI / 2 : ph === 'lie' ? Math.PI / 2 : ph === 'rise' ? (1 - smooth(0, 1, u)) * Math.PI / 2 : ph === 'warn' ? (Math.sin(t * 24) * 0.035 + 0.05 * u) * u : 0;
        pivot.rotation.set(0, 0, -s * ang);
        // (dim standing, a hard red-white strobe through its warning, bright lying across the road)
        var k = ph === 'warn' ? 0.7 + 0.8 * u * (0.5 + 0.5 * Math.sin(t * 30)) : ph === 'fall' || ph === 'lie' ? 1.25 : 0.6;
        gm.color.setRGB(k, k * (ph === 'warn' ? 0.8 : 1), k * (ph === 'warn' ? 0.8 : 1));
      };
    }

    /* a corrupted data cube (meteor): a targeting beam from the ceiling for the whole warning, the cube down it, and
       a burst of shards where it strikes */
    function cube() {
      var g = new T3.Group(); mark(g); g.visible = false; ctx.scene.add(g);
      var s = 0.75, sp = [[box(1.5, 1.5, 1.5), DARK], [box(0.55, 0.55, 0.55, 0.85, 0.5, -0.3), DARK], [box(0.4, 0.4, 0.4, -0.6, -0.75, 0.55), DARK]], gp = [];
      // (its twelve edges lit, the glitch fragments' too, a white-hot core showing through a slot)
      for (var a = -1; a <= 1; a += 2) for (var b = -1; b <= 1; b += 2) {
        gp.push([box(1.56, 0.07, 0.07, 0, a * s, b * s), MAG], [box(0.07, 1.56, 0.07, a * s, 0, b * s), MAG], [box(0.07, 0.07, 1.56, a * s, b * s, 0), MAG]);
      }
      gp.push([box(0.6, 0.06, 0.06, 0.85, 0.78, -0.3), RED], [box(0.06, 0.6, 0.06, -0.6, -0.75, 0.76), RED], [box(1.2, 0.18, 0.05, 0, 0.1, 0.77), HOT], [box(0.05, 0.18, 1.2, 0.77, -0.25, 0), HOT]);
      var rock = new T3.Group(); g.add(rock);
      addTo(rock, new T3.Mesh(merge(sp), solidMat())); addTo(rock, new T3.Mesh(merge(gp), glowMat(false)));
      // (the beam: a thin open column of added light, 12 m, standing on the strike's spot)
      var beamM = new T3.MeshBasicMaterial({ color: new T3.Color(2.4, 0.3, 1.2), transparent: true, opacity: 0, blending: T3.AdditiveBlending, depthWrite: false, side: T3.DoubleSide, forceSinglePass: true });
      var beam = new T3.Mesh(new T3.CylinderGeometry(0.16, 0.34, 12, low ? 6 : 10, 1, true).translate(0, 6, 0), beamM); mark(beam); beam.visible = false; ctx.scene.add(beam);
      // (the burst: eight shards flung out flat and a square shock ring, added light)
      var bp = [], ring = new T3.RingGeometry(0.85, 1, 4, 1).rotateZ(Math.PI / 4).rotateX(-Math.PI / 2);
      bp.push([ring, MAG]);
      for (var i = 0; i < 8; i++) { var an = i / 8 * Math.PI * 2 + 0.2; bp.push([new T3.TetrahedronGeometry(0.16, 0).translate(Math.cos(an) * 0.7, 0.25 + (i % 3) * 0.18, Math.sin(an) * 0.7), i % 2 ? HOT : RED]); }
      var burstM = glowMat(true); burstM.opacity = 1;
      var burst = new T3.Mesh(merge(bp), burstM); mark(burst); burst.visible = false; ctx.scene.add(burst);
      var spin = 0;
      return function (h, t, dt) {
        var ph = h.phase, u = h.u, c = cam().position;
        // the beam, all through the warning, brighter as the strike nears; thinned near the lens
        beam.visible = ph === 'warn';
        if (beam.visible) {
          place(beam, h.d, h.x, 0); beam.updateMatrixWorld();
          var near = smooth(2.5, 9, Math.hypot(beam.position.x - c.x, beam.position.z - c.z));
          beamM.opacity = (0.18 + 0.62 * u) * (0.75 + 0.25 * Math.sin(t * 34)) * near;
          beam.scale.set(1 + 0.6 * u, 1, 1 + 0.6 * u);
        }
        // the cube down the beam's line over the warning's last 70% (from 11 m up and 8 m back)
        var fu = ph === 'warn' ? clamp((u - 0.3) / 0.7, 0, 1) : 0;
        g.visible = fu > 0;
        if (g.visible) {
          track.pointAt(wrapD(h.d - 8), h.x, 11, VA); track.pointAt(h.d, h.x, 0.9, VB);
          g.position.copy(VA).lerp(VB, fu * fu);
          spin += (dt || 0) * 4; rock.rotation.set(spin, spin * 0.6, spin * 0.3);
          g.scale.setScalar(Math.max(0.01, smooth(3, 10, g.position.distanceTo(c))));
        }
        // the burst, half a second
        burst.visible = ph === 'smoke' && u < 0.42;
        if (burst.visible) {
          place(burst, h.d, h.x, 0.12); burst.updateMatrixWorld();
          var e = smooth(0, 0.42, u);
          burst.scale.set(1 + 6.5 * e, 1 + 1.5 * e, 1 + 6.5 * e);
          burstM.opacity = (1 - u / 0.42) * (0.25 + 0.75 * smooth(4, 12, burst.position.distanceTo(c)));
        }
      };
    }

    var list = COURSE.hazards || [];
    var steps = list.map(function (H) {
      if (H.model !== false) return null;
      if (H.kind === 'crossing') return wheel(H);
      if (H.kind === 'topple') return pylon(H);
      if (H.kind === 'meteor') return cube();
      return null;
    });
    // the static dressing (plinths, doorway frames) in two meshes
    if (statS.length) addTo(ctx.scene, new T3.Mesh(merge(statS), solidMat()));
    if (statG.length) addTo(ctx.scene, new T3.Mesh(merge(statG), glowMat(false)));

    return {
      update: function (ctx2, t, dt) {
        var K = ctx2 && ctx2.kart;
        if (!K || typeof K.hazards !== 'function') return;
        var HS = K.hazards();
        if (!HS) return;
        for (var q = 0; q < steps.length; q++) if (steps[q] && HS[q]) steps[q](HS[q], t, dt || 0);
      },
    };
  }

  /* ======================================================== lane B: the lightbikes -- */
  // The eight lightbikes, their riders, how they move and the ribbons of light they drag. Each bike is the world's own
  // racer ({ object, name, color, stats, animate }), built facing +Z on y = 0: a long, low, enclosed-wheel shell lofted
  // from superellipse sections (its nose, tail, canopy, side pods and wheel lights vary per rider), a rider crouched
  // along its back, and two wheels whose lights spin with the speed. Three levels of detail ('near', 'mid', 'far'),
  // each one merged per material (b_merge: no addons here), so a bike near is five or six draw calls (body, trim, glow,
  // two wheels' lights, the canopy's glass where it has one), mid three, far two.
  //   model (the runtime's to pitch, roll and squash) > lean (into the turns) > pivot (a wheelie, at the rear tyre)
  //   > inner (the bike) > near | mid | far
  // Glow parts are unlit (MeshBasicMaterial, vertex colours past 1 in linear light) so the bloom catches them; the
  // shell is a dark clearcoat that shows the scene's environment (lane C: give graphics.environment some neon in it).
  // The light trail is one world-space ribbon per bike (b_trail), drawn additive, fading to nothing at its tail, near
  // the lens and far away; it never collides with anything.

  var RIDERS = [
    { id: 'cryo', name: 'Cryo Vector', color: '#21E6FF', accent: '#E6FDFF', persona: '',
      stats: { top: 1.0, accel: 1.05, handling: 1.05, mass: 1.0, drift: 1.05 },
      look: { nose: 'needle', tail: 'fin', canopy: true, wheel: 'ring', h: 1.0, pods: false, seam: 'spine' } },
    { id: 'ember', name: 'Ember Torque', color: '#FF7A1A', accent: '#FFE0B0', persona: 'ram',
      stats: { top: 1.04, accel: 0.9, handling: 0.94, mass: 1.3, drift: 0.95 },
      look: { nose: 'blunt', tail: 'spoiler', canopy: false, wheel: 'slots', h: 1.06, pods: true, seam: 'twin' } },
    { id: 'fuchsia', name: 'Fuchsia Glitch', color: '#FF2BD6', accent: '#FFD0F4', persona: 'risky',
      stats: { top: 1.02, accel: 1.08, handling: 0.96, mass: 0.88, drift: 1.12 },
      look: { nose: 'wedge', tail: 'twin', canopy: false, wheel: 'double', h: 0.94, pods: false, seam: 'spine' } },
    { id: 'acid', name: 'Acid Sprint', color: '#9DFF2E', accent: '#EFFFD0', persona: 'draft',
      stats: { top: 1.03, accel: 1.12, handling: 0.98, mass: 0.85, drift: 1.0 },
      look: { nose: 'needle', tail: 'blade', canopy: true, wheel: 'spokes', h: 0.92, pods: false, seam: 'twin' } },
    { id: 'vortex', name: 'Violet Vortex', color: '#9A5BFF', accent: '#E2D2FF', persona: 'block',
      stats: { top: 0.99, accel: 0.95, handling: 1.02, mass: 1.22, drift: 1.0 },
      look: { nose: 'blunt', tail: 'twin', canopy: true, wheel: 'ring', h: 1.04, pods: true, seam: 'spine' } },
    { id: 'aurum', name: 'Aurum Dash', color: '#FFC93C', accent: '#FFF4C8', persona: 'punch',
      stats: { top: 1.01, accel: 1.0, handling: 1.04, mass: 1.05, drift: 1.06 },
      look: { nose: 'wedge', tail: 'fin', canopy: false, wheel: 'spokes', h: 0.98, pods: false, seam: 'twin' } },
    { id: 'redline', name: 'Redline Rook', color: '#FF2E4A', accent: '#FFD6DC', persona: 'bully',
      stats: { top: 1.03, accel: 0.93, handling: 0.95, mass: 1.35, drift: 0.96 },
      look: { nose: 'wedge', tail: 'spoiler', canopy: false, wheel: 'slots', h: 1.02, pods: true, seam: 'spine' } },
    { id: 'cobalt', name: 'Cobalt Drift', color: '#2E6BFF', accent: '#D6E4FF', persona: '',
      stats: { top: 0.98, accel: 1.06, handling: 1.08, mass: 0.95, drift: 1.14 },
      look: { nose: 'needle', tail: 'none', canopy: true, wheel: 'double', h: 0.96, pods: false, seam: 'twin' } }
  ];

  // the bike's fixed measures (metres): the wheels' axle height and radius, where they stand, the shell's flat flank
  var B_AXLE = 0.43, B_WR = 0.43, B_WZ = 0.68, B_FLANK = 0.30;
  // per level: radial steps of the shell, samples per span of its stations, a tube's radial steps, its samples per span
  var B_LOD = {
    near: { rad: 36, seg: 6, tube: 12, tseg: 5, tyre: [10, 40], disc: 32, ring: 48 },
    mid: { rad: 14, seg: 2, tube: 6, tseg: 2, tyre: [5, 18], disc: 14, ring: 20 },
    far: { rad: 8, seg: 1, tube: 4, tseg: 1, tyre: [3, 10], disc: 0, ring: 12 }
  };

  /* -- the merge helper: buckets of plain triangles, one per material, made into one BufferGeometry each -- */
  function b_bucket(lit, colored) { return { lit: lit, colored: colored, pos: [], nrm: [], col: [], idx: [] }; }
  var B_V = null, B_N = null, B_NM = null; // made on first use: the module is also read where THREE is not loaded
  // add a geometry (indexed or not; its position and, for a lit bucket, its normals) under a matrix, in a colour
  function b_add(bk, geom, matrix, color) {
    if (!B_V) { B_V = new THREE.Vector3(); B_N = new THREE.Vector3(); B_NM = new THREE.Matrix3(); }
    var p = geom.getAttribute('position');
    if (bk.lit && !geom.getAttribute('normal')) geom.computeVertexNormals();
    var nA = bk.lit ? geom.getAttribute('normal') : null, base = bk.pos.length / 3, i;
    if (matrix) B_NM.getNormalMatrix(matrix);
    for (i = 0; i < p.count; i++) {
      B_V.set(p.getX(i), p.getY(i), p.getZ(i)); if (matrix) B_V.applyMatrix4(matrix);
      bk.pos.push(B_V.x, B_V.y, B_V.z);
      if (nA) { B_N.set(nA.getX(i), nA.getY(i), nA.getZ(i)); if (matrix) B_N.applyMatrix3(B_NM).normalize(); bk.nrm.push(B_N.x, B_N.y, B_N.z); }
      if (bk.colored) bk.col.push(color.r, color.g, color.b);
    }
    var ix = geom.getIndex();
    if (ix) for (i = 0; i < ix.count; i++) bk.idx.push(base + ix.getX(i));
    else for (i = 0; i < p.count; i++) bk.idx.push(base + i);
    geom.dispose();
  }
  // merge any number of buckets into one geometry (the far level folds its body and trim into one)
  function b_merge(list) {
    var pos = [], nrm = [], col = [], idx = [], lit = list[0].lit, colored = list[0].colored;
    list.forEach(function (bk) {
      var base = pos.length / 3;
      Array.prototype.push.apply(pos, bk.pos); if (lit) Array.prototype.push.apply(nrm, bk.nrm); if (colored) Array.prototype.push.apply(col, bk.col);
      for (var i = 0; i < bk.idx.length; i++) idx.push(bk.idx[i] + base);
    });
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    if (lit) g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    if (colored) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }

  /* -- lofting: rings of points (all the same count, closed round) joined into a skin, capped at both ends -- */
  function b_loft(rings) {
    var M = rings[0].length, R = rings.length, pos = [], idx = [], i, j;
    for (i = 0; i < R; i++) for (j = 0; j < M; j++) pos.push(rings[i][j][0], rings[i][j][1], rings[i][j][2]);
    for (i = 0; i < R - 1; i++) for (j = 0; j < M; j++) {
      var a = i * M + j, b = (i + 1) * M + j, c = i * M + (j + 1) % M, d = (i + 1) * M + (j + 1) % M;
      idx.push(a, c, b, b, c, d);
    }
    // the caps: a fan to each end ring's middle (the start faces back along the loft, the end along it)
    [0, R - 1].forEach(function (r) {
      var cx = 0, cy = 0, cz = 0; for (j = 0; j < M; j++) { cx += rings[r][j][0]; cy += rings[r][j][1]; cz += rings[r][j][2]; }
      var ci = pos.length / 3; pos.push(cx / M, cy / M, cz / M);
      for (j = 0; j < M; j++) { var p0 = r * M + j, p1 = r * M + (j + 1) % M; if (r === 0) idx.push(ci, p1, p0); else idx.push(ci, p0, p1); }
    });
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    return g;
  }
  // a strip of quads between two rows of points (a seam of light lying on a surface): flat, unlit
  function b_strip(rowA, rowB) {
    var pos = [], idx = [], n = rowA.length, i;
    for (i = 0; i < n; i++) pos.push(rowA[i][0], rowA[i][1], rowA[i][2], rowB[i][0], rowB[i][1], rowB[i][2]);
    for (i = 0; i < n - 1; i++) idx.push(2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2);
    var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
    return g;
  }
  function b_sp(v, e) { return v < 0 ? -Math.pow(-v, e) : Math.pow(v, e); }
  function b_cr(p0, p1, p2, p3, t) { var t2 = t * t, t3 = t2 * t; return 0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (3 * p1 - p0 - 3 * p2 + p3) * t3); }
  // stations [[k0, k1, ...], ...] sampled smoothly (Catmull-Rom on each value), seg samples a span
  function b_sample(st, seg) {
    var out = [], n = st.length, i, s, k;
    for (i = 0; i < n - 1; i++) for (s = 0; s < (i === n - 2 ? seg + 1 : seg); s++) {
      var t = s / seg, a = st[Math.max(0, i - 1)], b = st[i], c = st[i + 1], d = st[Math.min(n - 1, i + 2)], row = [];
      for (k = 0; k < b.length; k++) row.push(b_cr(a[k], b[k], c[k], d[k], t));
      out.push(row);
    }
    for (i = 1; i < out.length; i++) if (out[i][0] < out[i - 1][0] + 1e-4) out[i][0] = out[i - 1][0] + 1e-4;
    return out;
  }
  // a point on a shell section [z, top, bottom, half-width, exponent] at angle th (0: its +x flank, PI/2: its top),
  // pushed out along the section by off metres
  function b_sec(s, th, off) {
    var yc = (s[1] + s[2]) / 2, hh = (s[1] - s[2]) / 2, e = 2 / s[4];
    var x = s[3] * b_sp(Math.cos(th), e), y = hh * b_sp(Math.sin(th), e);
    if (off) { var l = Math.hypot(x, y) || 1; x += x / l * off; y += y / l * off; }
    return [x, yc + y, s[0]];
  }
  function b_shellRings(samples, M, cx) {
    return samples.map(function (s) { var r = []; for (var j = 0; j < M; j++) { var p = b_sec(s, j / M * Math.PI * 2, 0); p[0] += cx || 0; r.push(p); } return r; });
  }
  // a seam of light along a shell at angle th, from z0 to z1 (wide w metres)
  function b_seam(samples, th, z0, z1, w, cx) {
    var A = [], B = [], d = w / 2 / Math.max(0.12, (samples[Math.floor(samples.length / 2)][1] - samples[Math.floor(samples.length / 2)][2]) / 2);
    samples.forEach(function (s) {
      if (s[0] < z0 || s[0] > z1) return;
      var a = b_sec(s, th - d, 0.004), b = b_sec(s, th + d, 0.004); a[0] += cx || 0; b[0] += cx || 0; A.push(a); B.push(b);
    });
    return A.length > 1 ? b_strip(A, B) : null;
  }
  // a band of light round a shell, between two of its samples, from angle th0 to th1
  function b_band(samples, iA, iB, th0, th1, steps) {
    var A = [], B = [];
    for (var k = 0; k <= steps; k++) { var th = th0 + (th1 - th0) * k / steps; A.push(b_sec(samples[iA], th, 0.004)); B.push(b_sec(samples[iB], th, 0.004)); }
    return b_strip(A, B);
  }
  // a tube along points with radii (each [x, y, z, r]), elliptic by sx (across) and sy (up), M round, seg a span
  function b_tube(pts, M, seg, sx, sy) {
    var S = b_sample(pts.map(function (p, i) { return [i, p[0], p[1], p[2], p[3]]; }), seg), rings = [], up = new THREE.Vector3(0, 1, 0);
    var t = new THREE.Vector3(), n = new THREE.Vector3(), b = new THREE.Vector3();
    for (var i = 0; i < S.length; i++) {
      var p = S[i], q0 = S[Math.max(0, i - 1)], q1 = S[Math.min(S.length - 1, i + 1)];
      t.set(q1[1] - q0[1], q1[2] - q0[2], q1[3] - q0[3]).normalize();
      n.crossVectors(up, t); if (n.lengthSq() < 1e-6) n.set(1, 0, 0); n.normalize(); b.crossVectors(t, n);
      var r = Math.max(0.002, p[4]), ring = [];
      for (var j = 0; j < M; j++) {
        var a = j / M * Math.PI * 2, c = Math.cos(a) * r * (sx || 1), s = Math.sin(a) * r * (sy || 1);
        ring.push([p[1] + n.x * c + b.x * s, p[2] + n.y * c + b.y * s, p[3] + n.z * c + b.z * s]);
      }
      rings.push(ring);
    }
    return b_loft(rings);
  }
  // an extruded profile (pts [[z, y], ...] in the bike's side plane) thick metres, centred on x
  function b_fin(pts, thick, x, tilt) {
    var sh = new THREE.Shape(); sh.moveTo(pts[0][0], pts[0][1]); for (var i = 1; i < pts.length; i++) sh.lineTo(pts[i][0], pts[i][1]);
    var g = new THREE.ExtrudeGeometry(sh, { depth: thick, bevelEnabled: true, bevelThickness: thick * 0.4, bevelSize: thick * 0.4, bevelSegments: 1, curveSegments: 4 });
    g.translate(0, 0, -thick / 2); g.rotateY(-Math.PI / 2);
    var m = new THREE.Matrix4().makeRotationZ(tilt || 0); m.premultiply(new THREE.Matrix4().makeTranslation(x || 0, 0, 0));
    // (a tilted fin leans from its own foot)
    if (tilt) { var foot = pts[0][1]; g.translate(0, -foot, 0); g.applyMatrix4(m); g.translate(0, foot, 0); } else g.applyMatrix4(m);
    return g;
  }
  // arcs of an annulus in the wheel's side plane (x = sideX), centred on the axle (0, 0, 0): from radius r0 to r1,
  // angle a0 to a1
  function b_arc(sideX, r0, r1, a0, a1, segs) {
    var A = [], B = [];
    for (var k = 0; k <= segs; k++) { var a = a0 + (a1 - a0) * k / segs; A.push([sideX, r0 * Math.sin(a), r0 * Math.cos(a)]); B.push([sideX, r1 * Math.sin(a), r1 * Math.cos(a)]); }
    return b_strip(A, B);
  }

  /* -- the shared materials (made once: every bike's shell, trim and glass are one program each) -- */
  var B_MATS = null;
  function b_mats() {
    if (B_MATS) return B_MATS;
    B_MATS = {
      body: new THREE.MeshPhysicalMaterial({ color: '#0B0E15', metalness: 0.55, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.06 }),
      trim: new THREE.MeshStandardMaterial({ color: '#171A22', metalness: 0.25, roughness: 0.55 }),
      glass: new THREE.MeshPhysicalMaterial({ color: '#0A1018', metalness: 0, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.03, transparent: true, opacity: 0.38, depthWrite: false, forceSinglePass: true })
    };
    return B_MATS;
  }

  /* -- one level of one bike: its buckets filled from the rider's look -- */
  function b_level(L, look, col, acc) {
    var h = look.h || 1;
    function hy(y) { return y <= B_AXLE ? y : B_AXLE + (y - B_AXLE) * h; }
    var body = b_bucket(true, false), trim = b_bucket(true, false), glow = b_bucket(false, true), glass = b_bucket(true, false);
    var wheels = [b_bucket(false, true), b_bucket(false, true)];
    var near = L === B_LOD.near, far = L === B_LOD.far;
    // the shell's stations [z, top, bottom, half-width, exponent], tail to nose
    var tail = look.tail === 'none' ? [[-1.30, 0.46, 0.34, 0.04, 2.5], [-1.24, 0.62, 0.24, 0.16, 2.8], [-1.16, 0.74, 0.16, 0.25, 3.5]]
      : [[-1.22, 0.50, 0.30, 0.05, 2.5], [-1.17, 0.70, 0.18, 0.22, 3]];
    var mid = [[-1.08, 0.80, 0.14, 0.29, 4.5], [-0.68, 0.88, 0.14, B_FLANK, 5], [-0.30, 0.84, 0.14, B_FLANK, 5], [-0.05, 0.72, 0.20, 0.27, 4],
      [0.22, 0.74, 0.22, 0.25, 4], [0.42, 0.86, 0.14, B_FLANK, 5], [0.68, 0.90, 0.14, B_FLANK, 5], [0.98, 0.80, 0.14, 0.29, 4.5]];
    var nose = look.nose === 'blunt' ? [[1.10, 0.76, 0.16, 0.27, 3.2], [1.18, 0.62, 0.20, 0.20, 2.4], [1.23, 0.48, 0.26, 0.08, 2.2]]
      : look.nose === 'wedge' ? [[1.08, 0.62, 0.16, 0.27, 6], [1.17, 0.44, 0.18, 0.20, 6], [1.24, 0.28, 0.20, 0.06, 4]]
      : [[1.10, 0.60, 0.18, 0.22, 3], [1.20, 0.42, 0.24, 0.11, 2.6], [1.27, 0.33, 0.28, 0.025, 2.2]];
    var st = tail.concat(mid, nose).map(function (s) { return [s[0], hy(s[1]), hy(s[2]), s[3], s[4]]; });
    var S = b_sample(st, L.seg);
    b_add(body, b_loft(b_shellRings(S, L.rad)));
    var zT = S[0][0], zN = S[S.length - 1][0];

    // the wheels: a tyre each (trim, under the shell), a cover plate on each flank and the lights that spin
    for (var w = 0; w < 2; w++) {
      var wz = w ? B_WZ : -B_WZ, tm = new THREE.Matrix4().makeTranslation(0, B_AXLE, wz);
      var ty = new THREE.TorusGeometry(B_WR - 0.1, 0.1, L.tyre[0], L.tyre[1]); ty.rotateY(Math.PI / 2); ty.scale(1.3, 1, 1);
      b_add(far ? body : trim, ty, tm);
      if (L.disc) for (var sd = -1; sd <= 1; sd += 2) {
        var dc = new THREE.CircleGeometry(0.31, L.disc); dc.rotateY(sd * Math.PI / 2);
        b_add(body, dc, new THREE.Matrix4().makeTranslation(sd * (B_FLANK + 0.001), B_AXLE, wz));
      }
      var wb = near ? wheels[w] : glow, wm = near ? null : tm, R = L.ring, c = col;
      for (sd = -1; sd <= 1; sd += 2) {
        var X = sd * (B_FLANK + 0.006), k;
        if (far) { b_add(wb, b_arc(X, 0.24, 0.29, 0, Math.PI * 2, R), wm, c); continue; }
        if (look.wheel === 'slots') for (k = 0; k < 6; k++) b_add(wb, b_arc(X, 0.2, 0.29, k * Math.PI / 3, k * Math.PI / 3 + 0.72, Math.max(3, R >> 3)), wm, c);
        else {
          b_add(wb, b_arc(X, 0.255, 0.29, 0, Math.PI * 2, R), wm, c);
          if (look.wheel === 'double') b_add(wb, b_arc(X, 0.17, 0.195, 0, Math.PI * 2, R), wm, c);
          if (look.wheel === 'spokes') for (k = 0; k < 3; k++) { var a = k * Math.PI * 2 / 3; b_add(wb, b_arc(X, 0.05, 0.26, a - 0.07, a + 0.07, 1), wm, c); }
          if (look.wheel === 'spokes') b_add(wb, b_arc(X, 0.0, 0.06, 0, Math.PI * 2, Math.max(6, R >> 2)), wm, acc);
          // (two bright notches, so the spin reads on a plain ring)
          if (look.wheel !== 'spokes') for (k = 0; k < 2; k++) b_add(wb, b_arc(X, 0.07, look.wheel === 'double' ? 0.15 : 0.23, k * Math.PI + 0.3, k * Math.PI + 0.62, 2), wm, acc);
        }
      }
    }

    // seams of light: the belt line down both flanks, a spine or twin lines on the nose, a V of headlight, a tail band
    if (!far) {
      var sw = near ? 0.024 : 0.04;
      [0.5, Math.PI - 0.5].forEach(function (th) { var g = b_seam(S, th, zT + 0.1, Math.min(1.12, zN - 0.08), sw); if (g) b_add(glow, g, null, col); });
      if (look.seam === 'spine') { var gs = b_seam(S, Math.PI / 2, 0.56, zN - 0.04, sw); if (gs) b_add(glow, gs, null, col); }
      else [1.15, Math.PI - 1.15].forEach(function (th) { var g = b_seam(S, th, 0.6, zN - 0.06, sw * 0.8); if (g) b_add(glow, g, null, col); });
      [0.12, -0.12, Math.PI - 0.12, Math.PI + 0.12].forEach(function (th) { var g = b_seam(S, th, zN - 0.24, zN - 0.01, sw * 1.2); if (g) b_add(glow, g, null, acc); });
      var iA = 0, iB; while (iA < S.length - 2 && S[iA][0] < zT + 0.035) iA++; iB = iA + 1; while (iB < S.length - 1 && S[iB][0] < zT + 0.07) iB++;
      b_add(glow, b_band(S, iA, iB, -0.35, Math.PI + 0.35, near ? 16 : 6), null, col);
    } else {
      [0.5, Math.PI - 0.5].forEach(function (th) { var g = b_seam(S, th, zT + 0.1, zN - 0.1, 0.06); if (g) b_add(glow, g, null, col); });
    }

    // the tail: a fin, twin fins, a wing, a long blade, or the bare cone
    var finG = far ? body : body, ft = 0.035;
    if (look.tail === 'fin') {
      var fp = [[-1.18, hy(0.62)], [-1.04, hy(1.22)], [-0.93, hy(1.24)], [-0.64, hy(0.84)]];
      b_add(finG, b_fin(fp, ft, 0, 0));
      if (!far) b_add(glow, b_tube([[0, fp[3][1] + 0.02, -0.66, 0.012], [0, fp[2][1] + 0.02, -0.93, 0.012], [0, fp[1][1] + 0.02, -1.04, 0.012]], 4, L.tseg), null, col);
    } else if (look.tail === 'twin') {
      [-1, 1].forEach(function (sd) {
        var tp = [[-1.16, hy(0.62)], [-1.06, hy(1.04)], [-0.98, hy(1.04)], [-0.76, hy(0.80)]];
        b_add(finG, b_fin(tp, ft * 0.8, sd * 0.17, -sd * 0.32));
        if (!far) { var lx = sd * 0.17 + sd * Math.sin(0.32) * (hy(1.04) - hy(0.62)); b_add(glow, b_tube([[sd * 0.17 + sd * 0.12, hy(0.9), -0.82, 0.011], [lx, hy(1.06), -0.98, 0.011], [lx, hy(1.06), -1.06, 0.011]], 4, L.tseg), null, col); }
      });
    } else if (look.tail === 'spoiler') {
      var wing = new THREE.Shape(); wing.moveTo(0.12, 0); wing.lineTo(-0.02, 0.035); wing.lineTo(-0.14, 0.012); wing.lineTo(-0.13, -0.008); wing.lineTo(0.12, 0);
      var wg = new THREE.ExtrudeGeometry(wing, { depth: 0.86, bevelEnabled: false, curveSegments: 2 });
      wg.rotateY(Math.PI / 2); wg.translate(-0.43, hy(1.04), -1.08);
      b_add(finG, wg);
      [-1, 1].forEach(function (sd) { b_add(far ? body : trim, b_tube([[sd * 0.2, hy(0.78), -0.98, 0.022], [sd * 0.2, hy(1.04), -1.06, 0.018]], Math.max(4, L.tube >> 1), 1)); });
      if (!far) b_add(glow, b_tube([[-0.43, hy(1.055), -1.215, 0.009], [0.43, hy(1.055), -1.215, 0.009]], 4, 1), null, col);
    } else if (look.tail === 'blade') {
      var bp = [[-1.10, hy(0.56)], [-1.33, hy(0.92)], [-1.22, hy(0.98)], [-0.48, hy(0.86)], [-0.48, hy(0.80)]];
      b_add(finG, b_fin(bp, ft * 0.9, 0, 0));
      if (!far) b_add(glow, b_tube([[0, hy(0.89), -0.52, 0.011], [0, hy(1.0), -1.20, 0.011], [0, hy(0.94), -1.32, 0.011]], 4, L.tseg), null, col);
    }

    // side pods: two intakes between the wheels, a slit of light down each
    if (look.pods) [-1, 1].forEach(function (sd) {
      var ps = b_sample([[-0.36, 0.43, 0.41, 0.01, 3], [-0.28, 0.48, 0.34, 0.06, 4], [0.0, 0.53, 0.31, 0.085, 4], [0.24, 0.50, 0.33, 0.07, 4], [0.34, 0.44, 0.40, 0.012, 3]], Math.max(1, L.seg));
      b_add(body, b_loft(b_shellRings(ps, Math.max(6, L.rad >> 1), sd * (B_FLANK + 0.01))));
      if (!far) { var g = b_seam(ps, sd > 0 ? 0 : Math.PI, -0.22, 0.24, near ? 0.03 : 0.05, sd * (B_FLANK + 0.01)); if (g) b_add(glow, g, null, col); }
    });

    // the rider, crouched along the bike: a body suit (trim), a helmet, lines of light on the suit and a visor
    var tor = [[0, 0.84, -0.44, 0.12], [0, 0.93, -0.20, 0.14], [0, 0.98, 0.06, 0.15], [0, 1.0, 0.22, 0.09], [0, 1.0, 0.27, 0.03]].map(function (p) { return [p[0], hy(p[1]), p[2], p[3]]; });
    b_add(far ? body : trim, b_tube(tor, L.tube, L.tseg, 1.3, 0.85));
    var hc = new THREE.Vector3(0, hy(1.06), 0.36);
    var hg = new THREE.SphereGeometry(0.135, far ? 6 : near ? 20 : 9, far ? 4 : near ? 14 : 6); hg.scale(1, 0.92, 1.28); hg.rotateX(0.18);
    b_add(far ? body : trim, hg, new THREE.Matrix4().makeTranslation(hc.x, hc.y, hc.z));
    if (!far) {
      var vg = new THREE.SphereGeometry(0.139, near ? 18 : 8, near ? 4 : 2, Math.PI / 2 - 0.95, 1.9, 1.32, 0.34); vg.scale(1, 0.92, 1.28); vg.rotateX(0.18);
      b_add(glow, vg, new THREE.Matrix4().makeTranslation(hc.x, hc.y, hc.z), acc);
      b_add(glow, b_tube(tor.slice(0, 4).map(function (p) { return [0, p[1] + p[3] * 0.85 + 0.004, p[2], 0.011]; }), 4, L.tseg), null, col);
      [-1, 1].forEach(function (sd) {
        var arm = [[sd * 0.18, 0.96, 0.10, 0.055], [sd * 0.26, 0.86, 0.26, 0.05], [sd * 0.17, 0.89, 0.50, 0.045]].map(function (p) { return [p[0], hy(p[1]), p[2], p[3]]; });
        var leg = [[sd * 0.13, 0.82, -0.40, 0.085], [sd * 0.30, 0.66, -0.02, 0.07], [sd * 0.33, 0.40, -0.30, 0.055], [sd * 0.33, 0.34, -0.18, 0.04]].map(function (p) { return [p[0], hy(p[1]), p[2], p[3]]; });
        b_add(trim, b_tube(arm, Math.max(5, L.tube - 4), L.tseg)); b_add(trim, b_tube(leg, Math.max(5, L.tube - 2), L.tseg));
        var fist = new THREE.SphereGeometry(0.055, near ? 10 : 6, near ? 8 : 4); b_add(trim, fist, new THREE.Matrix4().makeTranslation(sd * 0.17, hy(0.89), 0.52));
        b_add(glow, b_tube(arm.map(function (p) { return [p[0] + sd * (p[3] + 0.003), p[1], p[2], 0.009]; }), 3, L.tseg), null, col);
        b_add(glow, b_tube(leg.slice(0, 3).map(function (p) { return [p[0] + sd * (p[3] + 0.003), p[1], p[2], 0.01]; }), 3, L.tseg), null, col);
      });
    }
    // the canopy: a bubble of smoked glass over the rider (near only)
    if (look.canopy && near) {
      var cs = [[-0.52, 0.86, 0.78, 0.05, 2.4], [-0.40, 1.04, 0.76, 0.24, 2.4], [-0.10, 1.18, 0.74, 0.34, 2.6], [0.22, 1.25, 0.74, 0.34, 2.6], [0.46, 1.18, 0.76, 0.28, 2.4], [0.62, 0.94, 0.78, 0.08, 2.2]]
        .map(function (s) { return [s[0], hy(s[1]), hy(s[2]), s[3], s[4]]; });
      var CS = b_sample(cs, 4);
      b_add(glass, b_loft(b_shellRings(CS, 24)));
      [0.0, Math.PI].forEach(function (th) { var g = b_seam(CS, th, -0.45, 0.58, 0.016); if (g) b_add(glow, g, null, col); });
    }
    return { body: body, trim: trim, glow: glow, glass: glass, wheels: wheels };
  }

  /* -- the light trail: one ribbon in world space, its history sampled every few decimetres -- */
  function b_trail(ctx, color) {
    var low = ctx.quality === 'low', N = low ? 16 : 36, LEN = low ? 9 : 16, STEP = LEN / N;
    var V = (N + 2) * 2, pos = new Float32Array(V * 3), uv = new Float32Array(V * 2), idx = [];
    for (var i = 0; i < N + 1; i++) idx.push(2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2);
    var geo = new THREE.BufferGeometry();
    var pA = new THREE.BufferAttribute(pos, 3); pA.setUsage(THREE.DynamicDrawUsage);
    var uA = new THREE.BufferAttribute(uv, 2); uA.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', pA); geo.setAttribute('aUV', uA); geo.setIndex(idx); geo.setDrawRange(0, 0);
    var mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color) }, uK: { value: 1 } },
      vertexShader: [
        'attribute vec2 aUV; varying vec2 vUV; varying float vFade;',
        'void main() {',
        '  vUV = aUV; vec4 wp = modelMatrix * vec4(position, 1.0); float d = distance(wp.xyz, cameraPosition);',
        // (gone within two and a half metres of the lens, faint until nine, and faded out far away)
        '  vFade = smoothstep(2.5, 9.0, d) * (1.0 - smoothstep(60.0, 120.0, d));',
        '  gl_Position = projectionMatrix * viewMatrix * wp;',
        '}'].join('\n'),
      fragmentShader: [
        'uniform vec3 uColor; uniform float uK; varying vec2 vUV; varying float vFade;',
        'void main() {',
        '  float u = clamp(vUV.x, 0.0, 1.0), v = vUV.y;',
        '  float along = pow(1.0 - u, 2.2) * smoothstep(0.0, 0.03, u + 0.004);',
        '  float body = mix(0.1, 0.28, v) + smoothstep(0.8, 0.94, v) * (1.0 - smoothstep(0.97, 1.0, v)) * 1.8 + (1.0 - smoothstep(0.0, 0.08, v)) * 0.35;',
        '  gl_FragColor = vec4(uColor * body * 1.25, clamp(along * vFade * uK, 0.0, 1.0));',
        '  #include <tonemapping_fragment>',
        '  #include <colorspace_fragment>',
        '}'].join('\n'),
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, forceSinglePass: true, fog: false
    });
    var mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false; mesh.renderOrder = 2; mesh.userData.gmKart = mesh.userData.gmFx = true;
    // (a bike the runtime stops animating, put away off the podium, takes its trail with it: no animate() for a few
    // drawn frames and the ribbon draws nothing)
    var T = { mesh: mesh, miss: 0, n: 0, hist: new Float32Array(N * 6), last: null, N: N, LEN: LEN, STEP: STEP };
    mesh.onBeforeRender = function () { if (++T.miss > 6) geo.setDrawRange(0, 0); };
    ctx.scene.add(mesh);
    return T;
  }
  var B_P0 = null, B_P1 = null; // made on first use, as B_V
  // the trail after this frame: the bike's rear (bottom and top of the ribbon) from its own frame, lenK of its length
  function b_trailStep(T, inner, show, lenK, k) {
    if (!B_P0) { B_P0 = new THREE.Vector3(); B_P1 = new THREE.Vector3(); }
    T.miss = 0;
    var geo = T.mesh.geometry;
    if (!show || lenK <= 0) { T.mesh.visible = false; geo.setDrawRange(0, 0); return; }
    T.mesh.visible = true;
    inner.updateWorldMatrix(true, false);
    B_P0.set(0, 0.04, -1.12).applyMatrix4(inner.matrixWorld); B_P1.set(0, 0.62, -1.12).applyMatrix4(inner.matrixWorld);
    var H = T.hist, N = T.N, i;
    // (moved more than 8 m since the last frame: the grid, the rescue claw, the podium: the history starts again)
    if (T.last && T.last.distanceTo(B_P0) > 8) T.n = 0;
    (T.last || (T.last = new THREE.Vector3())).copy(B_P0);
    if (!T.n || Math.hypot(B_P0.x - H[0], B_P0.y - H[1], B_P0.z - H[2]) >= T.STEP) {
      for (i = Math.min(T.n, N - 1) * 6 - 1; i >= 0; i--) H[i + 6] = H[i];
      H[0] = B_P0.x; H[1] = B_P0.y; H[2] = B_P0.z; H[3] = B_P1.x; H[4] = B_P1.y; H[5] = B_P1.z;
      T.n = Math.min(N, T.n + 1);
    }
    var pos = geo.attributes.position.array, uv = geo.attributes.aUV.array, maxL = T.LEN * lenK, L = 0, v = 0;
    pos[0] = B_P0.x; pos[1] = B_P0.y; pos[2] = B_P0.z; pos[3] = B_P1.x; pos[4] = B_P1.y; pos[5] = B_P1.z;
    uv[0] = 0; uv[1] = 0; uv[2] = 0; uv[3] = 1; v = 1;
    var px = B_P0.x, py = B_P0.y, pz = B_P0.z;
    for (i = 0; i < T.n && L < maxL; i++) {
      var o = i * 6, seg = Math.hypot(H[o] - px, H[o + 1] - py, H[o + 2] - pz);
      if (seg < 1e-4 && i === 0) continue;
      L += seg; px = H[o]; py = H[o + 1]; pz = H[o + 2];
      for (var q = 0; q < 6; q++) pos[v * 6 + q] = H[o + q];
      var u = L / maxL; uv[v * 4] = u; uv[v * 4 + 1] = 0; uv[v * 4 + 2] = u; uv[v * 4 + 3] = 1; v++;
    }
    geo.attributes.position.needsUpdate = true; geo.attributes.aUV.needsUpdate = true;
    geo.setDrawRange(0, Math.max(0, v - 1) * 6);
    T.mesh.material.uniforms.uK.value = k;
  }
  function b_shown(o) { while (o) { if (!o.visible) return false; if (o.isScene) return true; o = o.parent; } return false; }

  /* -- a lightbike: the racer the runtime drives -- */
  function makeLightbike(ctx, rider) {
    var M = b_mats(), col = new THREE.Color(rider.color), acc = new THREE.Color(rider.accent || '#FFFFFF');
    // (unlit glow: the colour carried in the vertices, past 1, so the bloom takes it; the material's own colour is the
    // pulse, 1 at rest)
    var cG = col.clone().multiplyScalar(2.8), aG = acc.clone().multiplyScalar(2.2);
    var glowMat = new THREE.MeshBasicMaterial({ color: '#FFFFFF', vertexColors: true, side: THREE.DoubleSide });
    var root = new THREE.Group(), lean = new THREE.Group(), pivot = new THREE.Group(), inner = new THREE.Group();
    pivot.position.z = -B_WZ; inner.position.z = B_WZ;
    root.add(lean); lean.add(pivot); pivot.add(inner);
    var LV = {}, wheelMeshes = [];
    ['near', 'mid', 'far'].forEach(function (name) {
      var B = b_level(B_LOD[name], rider.look || {}, cG, aG), g = new THREE.Group(); g.name = name;
      function add(geo, mat) { var m = new THREE.Mesh(geo, mat); m.castShadow = false; m.receiveShadow = name === 'near' && mat !== glowMat; g.add(m); return m; }
      if (name === 'far') add(b_merge([B.body]), M.body);
      else { add(b_merge([B.body]), M.body); add(b_merge([B.trim]), M.trim); }
      add(b_merge([B.glow]), glowMat);
      if (B.glass.pos.length) add(b_merge([B.glass]), M.glass).renderOrder = 1;
      if (name === 'near') B.wheels.forEach(function (wb, w) {
        var wm = add(b_merge([wb]), glowMat); wm.position.set(0, B_AXLE, w ? B_WZ : -B_WZ); wheelMeshes.push(wm);
      });
      g.visible = name === 'mid'; inner.add(g); LV[name] = g;
    });
    var stats = rider.stats;
    root.userData.kartRacer = { stats: stats, persona: rider.persona || null };
    var trail = b_trail(ctx, rider.color), lowQ = ctx.quality === 'low';
    var st = { detail: 'mid', lean: 0, wheelie: 0, spin: 0, glow: 1 };
    function animate(t, dt, s) {
      s = s || {}; dt = Math.min(0.1, Math.max(0, dt || 0));
      var det = s.detail === 'near' || s.detail === 'far' ? s.detail : 'mid';
      if (det !== st.detail) { LV[st.detail].visible = false; LV[det].visible = true; st.detail = det; }
      // lean into the turn (steer +1 is a left turn: the top toward +x), harder in a drift, little in the air
      var want = s.celebrate ? 0 : clamp(-((s.steer || 0) * 0.42 + (s.drift || 0) * 0.2), -0.66, 0.66) * (s.air ? 0.45 : 1);
      st.lean += (want - st.lean) * (1 - Math.exp(-dt * 7));
      lean.rotation.z = st.lean;
      // a celebration: a wheelie, front up from the rear tyre, rocking
      var wh = s.celebrate ? 0.32 + 0.06 * Math.sin(t * 5) : 0;
      st.wheelie += (wh - st.wheelie) * (1 - Math.exp(-dt * 5));
      pivot.rotation.x = -st.wheelie;
      // the wheels' lights turn with the speed (forward: the top of the wheel toward +z)
      st.spin = (st.spin + (s.speed || 0) / B_WR * dt) % (Math.PI * 2);
      if (det === 'near') for (var w = 0; w < wheelMeshes.length; w++) wheelMeshes[w].rotation.x = st.spin;
      // the glow: brighter on a boost, a quick pulse with the drift's charge, a flicker when hit, dim when out of it
      var g = 1 + (s.boost ? 0.55 + 0.15 * Math.sin(t * 40) : 0) + (s.tier ? 0.08 * s.tier * (0.5 + 0.5 * Math.sin(t * (10 + 6 * s.tier))) : 0);
      if (s.hit || s.spun) g *= 0.55 + 0.45 * (Math.sin(t * 55) > 0 ? 1 : 0.2);
      if (s.sad) g *= 0.6;
      st.glow += (g - st.glow) * (1 - Math.exp(-dt * 18));
      glowMat.color.setScalar(st.glow);
      // the trail: full length near and mid, half far (none far on a phone), none while it celebrates on the podium
      var lenK = det === 'far' ? (lowQ ? 0 : 0.5) : 1;
      b_trailStep(trail, inner, b_shown(root) && !(s.celebrate && (s.speed || 0) < 1), lenK, (s.boost ? 1.35 : 1) * Math.min(1, st.glow));
    }
    return { object: root, name: rider.name, color: rider.color, stats: stats, animate: animate };
  }

  /* ========================================================== lane C: the look -- */
  // The place: a film-inspired neon night. A black glass road split by razor-thin cyan lane lines, orange secondary
  // lines, circuit-trace shoulders; a continuous tube from the bore's mouth to the end of the esses (rings in the
  // bore, dense ribs down the Helix with windows on its outside wall, a hanging blade of light splitting the esses),
  // then the open bridge over the city (suspension towers, cables, data ribbons), the drum (a tall banked cylinder
  // wall round a turning dynamo core, open to the sky), and the roofless trench of the final straight (high arches
  // the flyover passes under, the grid, the line and the bore's facade with the circuit's name).
  // Everything along the lap is swept from 2D profiles on the road's own banked frame (c_sweep) into a few merged
  // meshes, one per material: the floor, the structure, the light lines, the haze, the data streams, the signs.
  // The city is three instanced meshes (towers, roofs, neon crowns), a backdrop ring that stays round the camera and
  // a street grid far below. Lights: one hemisphere, one dim cool key, one point light in the drum's core.
  // Rules kept: nothing taller than 0.8 m within the road's half width + 1.2 m below 7 m (the haze sheets stay out at
  // the shoulders, the gates' posts at the walls); every roof, rib, gate and sign at 8.5 m or more over the road;
  // the final straight's arches at 17 m (the flyover comes down it 13 m up); nothing overhead lower than a pylon's
  // fall height within 14 m of it; the road and walls open over every break, the walls at gaps and hazard doorways.

  var THEME = { sky: '#04051A', fog: '#0D0B26', ink: '#E6FCFF', panel: '#08101C', accent: '#21E6FF', font: 'Orbitron' };

  // the kart preset (the racers graded as drawn, the neutral curve, the speed blur), darker, cooler and harder than it
  // comes: bloom only on what is lit past white (the lines, the strips, the crowns), restrained
  var GRAPHICS = {
    preset: 'kart', exposure: 1.0,
    environment: { intensity: 1.0, extras: c_envExtras },
    bloom: { strength: 0.5, threshold: 1.05, radius: 0.55 },
    grade: { contrast: 1.14, saturation: 1.06, warmth: -0.12, vignette: 0.24, split: 0.08, grain: 0, highlights: 1.1 },
    shadows: { extent: 40, mapSize: 2048 },
    motion: 0.35,
  };
  // a little wider than the kart camera's own: the corridor's depth reads, the next corner comes into the frame sooner
  var CAMERA = { fov: 66 };

  // the environment the glossy surfaces reflect (the floor's damp-glass sheen, the bikes' paint): a ring of cyan
  // light strips just over the horizon and another higher up, a few orange ones low, on the night sky
  function c_envExtras(ctx) {
    var T = ctx.THREE, g = new T.Group();
    function bar(w, h, r, y, ang, hex, k) {
      var m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ color: new T.Color(hex).multiplyScalar(k), side: T.DoubleSide }));
      m.position.set(Math.cos(ang) * r, y, Math.sin(ang) * r); m.lookAt(0, y, 0); g.add(m);
    }
    for (var i = 0; i < 12; i++) bar(14, 0.7, 40, 6, i * Math.PI / 6, '#21E6FF', 4);
    for (i = 0; i < 8; i++) bar(20, 0.5, 40, 18, i * Math.PI / 4 + 0.2, '#BFF8FF', 3);
    for (i = 0; i < 4; i++) bar(10, 0.4, 40, 1.5, i * Math.PI / 2 + 0.6, '#FF7A1A', 3);
    return g;
  }

  // a colour brighter than white, for anything that should bloom (linear, times k)
  function c_hot(hex, k) { return new THREE.Color(hex).multiplyScalar(k); }

  // a bucket of merged geometry: positions, uvs, colours (when coloured), indices
  function c_bucket(colored) { return { p: [], u: [], c: [], i: [], n: 0, colored: !!colored }; }

  // sweep a profile ([x, y] pairs: x metres right of the centre line, y metres up off the road, both on the road's
  // banked frame, so the tunnel banks with it) along the lap from d0 to d1 into a bucket. side -1 mirrors x (the left).
  // o: step (m), tu (profile metres per texture u), tv (lap metres per texture v), us (explicit u per point), col (a
  // colour, or one per point), fade (the colours fade in and out along the sweep: a segment of haze)
  function c_sweep(track, B, d0, d1, prof, side, o) {
    o = o || {};
    var step = o.step || 2, n = Math.max(o.fade ? 3 : 1, Math.ceil((d1 - d0) / step)), base = B.n, m = 0;
    for (var s = 0; s <= n; s++) {
      var d = d0 + (d1 - d0) * s / n, f = track.frameAt(d), P = typeof prof === 'function' ? prof(d) : prof, acc = 0;
      var k = o.fade ? Math.pow(Math.sin(Math.PI * s / n), 0.7) : 1;
      m = P.length;
      for (var q = 0; q < m; q++) {
        if (q) acc += Math.sqrt((P[q][0] - P[q - 1][0]) * (P[q][0] - P[q - 1][0]) + (P[q][1] - P[q - 1][1]) * (P[q][1] - P[q - 1][1]));
        var a = P[q][0] * side, h = P[q][1];
        B.p.push(f.pos.x + f.right.x * a + f.up.x * h, f.pos.y + f.right.y * a + f.up.y * h, f.pos.z + f.right.z * a + f.up.z * h);
        B.u.push(o.us ? o.us[q] : acc / (o.tu || 8), d / (o.tv || 8));
        if (B.colored) { var cc = o.col ? (o.col.length ? o.col[q] : o.col) : null; if (cc) B.c.push(cc.r * k, cc.g * k, cc.b * k); else B.c.push(k, k, k); }
      }
      if (s < n) for (q = 0; q < m - 1; q++) { var A = base + s * m + q, Bq = A + m; B.i.push(A, Bq, A + 1, A + 1, Bq, Bq + 1); }
    }
    B.n += (n + 1) * m;
  }

  // a shape already built (a box, a torus), placed by a matrix, into a bucket
  function c_addGeo(B, geo, M, col) {
    var pa = geo.attributes.position, ua = geo.attributes.uv, base = B.n, v = new THREE.Vector3();
    for (var q = 0; q < pa.count; q++) {
      v.set(pa.getX(q), pa.getY(q), pa.getZ(q)); if (M) v.applyMatrix4(M);
      B.p.push(v.x, v.y, v.z); B.u.push(ua ? ua.getX(q) : 0, ua ? ua.getY(q) : 0);
      if (B.colored) { if (col) B.c.push(col.r, col.g, col.b); else B.c.push(1, 1, 1); }
    }
    if (geo.index) for (q = 0; q < geo.index.count; q++) B.i.push(base + geo.index.getX(q));
    else for (q = 0; q < pa.count; q++) B.i.push(base + q);
    B.n += pa.count;
    geo.dispose();
  }

  // a quad from four corners (a, b along the bottom, c, d along the top), with its own uvs
  function c_quad(B, a, b, c, d, col, uv) {
    var base = B.n; uv = uv || [0, 0, 1, 0, 1, 1, 0, 1];
    [a, b, c, d].forEach(function (p, q) { B.p.push(p.x, p.y, p.z); B.u.push(uv[q * 2], uv[q * 2 + 1]); if (B.colored) B.c.push(col ? col.r : 1, col ? col.g : 1, col ? col.b : 1); });
    B.i.push(base, base + 1, base + 2, base, base + 2, base + 3); B.n += 4;
  }

  // a thin line of light between two points: two crossed quads
  function c_line(B, a, b, w, col) {
    var dir = new THREE.Vector3().subVectors(b, a).normalize(), p1 = new THREE.Vector3().crossVectors(dir, Math.abs(dir.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)).normalize().multiplyScalar(w / 2);
    var p2 = new THREE.Vector3().crossVectors(dir, p1).normalize().multiplyScalar(w / 2);
    [p1, p2].forEach(function (p) { c_quad(B, a.clone().sub(p), a.clone().add(p), b.clone().add(p), b.clone().sub(p), col); });
  }

  // the matrix that stands a shape on the road's frame at d, x metres right of the centre and y up (local x the
  // road's left, y its up, z along it: right-handed)
  function c_frameMat(track, d, x, y) {
    var f = track.frameAt(d), M = new THREE.Matrix4().makeBasis(f.left, f.up, f.tan);
    var p = f.pos.clone().addScaledVector(f.right, x).addScaledVector(f.up, y);
    M.setPosition(p); return M;
  }

  // the parts of the lap (from 0 to L, sampled every half metre) where want(d) holds, as [from, to] runs
  function c_runs(L, want) {
    var out = [], s = null, STEP = 0.5;
    for (var d = 0; d <= L; d += STEP) {
      var dd = Math.min(d, L - 0.001), on = want(dd);
      if (on && s == null) s = d;
      if ((!on || d + STEP > L) && s != null) { out.push([s, on ? L : d]); s = null; }
    }
    return out;
  }

  function c_mesh(scene, B, mat, name, opts) {
    if (!B.n) return null;
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(B.p, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(B.u, 2));
    if (B.colored) g.setAttribute('color', new THREE.Float32BufferAttribute(B.c, 3));
    g.setIndex(B.i);
    if (!opts || opts.normals !== false) g.computeVertexNormals();
    g.computeBoundingSphere();
    var m = new THREE.Mesh(g, mat);
    m.name = name; m.castShadow = false; m.receiveShadow = !!(opts && opts.shadow);
    m.userData.gmKart = true; if (opts && opts.track) m.userData.gmTrack = true;
    if (opts && opts.order != null) m.renderOrder = opts.order;
    B.p = B.u = B.c = B.i = null;
    scene.add(m); return m;
  }

  // the textures, drawn once (seeded: the same place every time)
  function c_textures(ctx, W, SH) {
    var low = ctx.quality === 'low', R = ctx.random, X = {}, S = low ? 512 : 1024, S2 = low ? 256 : 512;
    function traces(g, x0, x1, h, n, col, wid) {
      // circuit traces: right-angled runs with a pad at each end
      g.strokeStyle = col; g.fillStyle = col; g.lineWidth = wid;
      for (var i = 0; i < n; i++) {
        var x = x0 + R() * (x1 - x0), y = R() * h, segs = 2 + Math.floor(R() * 3);
        g.beginPath(); g.moveTo(x, y); g.fillRect(x - wid * 1.5, y - wid * 1.5, wid * 3, wid * 3);
        for (var s = 0; s < segs; s++) {
          if (s % 2) x = Math.max(x0, Math.min(x1, x + (R() - 0.5) * (x1 - x0) * 0.8)); else y += (R() - 0.3) * h * 0.25;
          g.lineTo(x, y);
        }
        g.stroke(); g.fillRect(x - wid * 1.5, y - wid * 1.5, wid * 3, wid * 3);
      }
    }
    // the floor across its whole width (u: -W..W), 2W metres along: black glass road, seams, the shoulders' circuits
    var rx0 = S * SH / (2 * W), rx1 = S - rx0;
    X.floor = ctx.textures.canvas(S, S, function (g, w, h) {
      g.fillStyle = '#0B0D13'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#06070B'; g.fillRect(rx0, 0, rx1 - rx0, h);
      g.fillStyle = '#0F131B'; for (var k = 0; k < 4; k++) g.fillRect(rx0, k * h / 4, rx1 - rx0, Math.max(1, S / 512));
      g.fillStyle = '#0A0C12'; for (k = 0; k < 2200; k++) g.fillRect(rx0 + R() * (rx1 - rx0), R() * h, 1, 1 + R() * 3);
      g.fillStyle = '#05060A'; g.fillRect(rx0 - 2, 0, 3, h); g.fillRect(rx1 - 1, 0, 3, h);
      traces(g, 2, rx0 - 4, h, low ? 24 : 40, '#132A33', Math.max(1, S / 512));
      traces(g, rx1 + 4, w - 2, h, low ? 24 : 40, '#132A33', Math.max(1, S / 512));
    });
    X.floor.anisotropy = 8;
    X.floorRough = ctx.textures.canvas(S2, S2, function (g, w, h) {
      g.fillStyle = 'rgb(92,92,92)'; g.fillRect(0, 0, w, h);
      // damp patches (smoother) and long streaks along the lap where the wheels polish it
      for (var k = 0; k < 46; k++) {
        var x = R() * w, y = R() * h, r = 10 + R() * w * 0.12, gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, 'rgba(28,28,28,0.85)'); gr.addColorStop(1, 'rgba(28,28,28,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
      }
      g.fillStyle = 'rgba(40,40,40,0.45)'; for (k = 0; k < 30; k++) g.fillRect(R() * w, 0, 1 + R() * 4, h);
      g.fillStyle = 'rgba(150,150,150,0.35)'; for (k = 0; k < 600; k++) g.fillRect(R() * w, R() * h, 1, 1);
    }, { linear: true });
    X.floorGlow = ctx.textures.canvas(S2, S2, function (g, w, h) {
      g.fillStyle = '#000000'; g.fillRect(0, 0, w, h);
      var a = w * SH / (2 * W);
      traces(g, 2, a - 3, h, low ? 14 : 22, 'rgba(33,230,255,0.55)', 1);
      traces(g, w - a + 3, w - 2, h, low ? 14 : 22, 'rgba(33,230,255,0.55)', 1);
      g.fillStyle = '#FF7A1A'; for (var k = 0; k < 18; k++) { var x = R() < 0.5 ? R() * (a - 6) + 3 : w - a + 3 + R() * (a - 6); g.fillRect(x, R() * h, 2, 2); }
    });
    // the walls and roof: dark panels with seams, 8 x 8 m; their own faint circuits
    X.wall = ctx.textures.canvas(S2, S2, function (g, w, h) {
      g.fillStyle = '#0E121B'; g.fillRect(0, 0, w, h);
      var c = w / 4;
      for (var i = 0; i < 4; i++) for (var j = 0; j < 4; j++) {
        g.fillStyle = (i + j) % 3 ? '#11161F' : '#0C1018'; g.fillRect(i * c + 3, j * c + 3, c - 6, c - 6);
        g.fillStyle = '#18202C'; g.fillRect(i * c + 3, j * c + 3, c - 6, 2);
        if (R() < 0.25) { g.fillStyle = '#080A10'; for (var v = 0; v < 6; v++) g.fillRect(i * c + c * 0.2, j * c + c * 0.25 + v * c * 0.09, c * 0.6, c * 0.04); }
      }
      g.fillStyle = '#05070B'; for (i = 0; i <= 4; i++) { g.fillRect(i * c - 2, 0, 4, h); g.fillRect(0, i * c - 2, w, 4); }
    });
    X.wallGlow = ctx.textures.canvas(S2, S2, function (g, w, h) {
      g.fillStyle = '#000000'; g.fillRect(0, 0, w, h);
      traces(g, 6, w - 6, h, low ? 18 : 30, 'rgba(33,230,255,0.75)', 2);
      traces(g, 6, w - 6, h, 5, 'rgba(255,122,26,0.7)', 2);
    });
    // haze: bright at u = 0 fading to nothing at u = 1, broken into soft rays along v
    X.haze = ctx.textures.canvas(128, 128, function (g, w, h) {
      g.fillStyle = '#000000'; g.fillRect(0, 0, w, h);
      for (var y = 0; y < h; y++) {
        var ray = 0.35 + 0.65 * Math.pow(0.5 + 0.5 * Math.sin(y * 0.29 + Math.sin(y * 0.071) * 3), 2) * (0.6 + 0.4 * R());
        var gr = g.createLinearGradient(0, 0, w, 0);
        gr.addColorStop(0, 'rgba(255,255,255,' + ray.toFixed(3) + ')'); gr.addColorStop(0.55, 'rgba(255,255,255,' + (ray * 0.3).toFixed(3) + ')'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr; g.fillRect(0, y, w, 1);
      }
    });
    // data: dashes of light running along v
    X.stream = ctx.textures.canvas(32, 256, function (g, w, h) {
      g.fillStyle = '#000000'; g.fillRect(0, 0, w, h);
      for (var k = 0; k < 26; k++) {
        var y = R() * h, len = 3 + R() * 34, a = 0.35 + R() * 0.65, x = R() < 0.5 ? 2 : Math.floor(R() * 3) * 10 + 2;
        g.fillStyle = 'rgba(255,255,255,' + (a * 0.55).toFixed(2) + ')'; g.fillRect(x, y, 8, len);
        g.fillStyle = 'rgba(255,255,255,' + a.toFixed(2) + ')'; g.fillRect(x, y + len - 2, 8, 2);
      }
    });
    // the towers' windows: 16 x 16 m of facade, four bays by five floors
    X.tower = ctx.textures.canvas(low ? 128 : 256, low ? 128 : 256, function (g, w, h) {
      g.fillStyle = '#05060B'; g.fillRect(0, 0, w, h);
      var cols = ['#FFE7C2', '#C9F2FF', '#FFFFFF', '#AFC2FF', '#FFC9EE'], bw = w / 4, fh = h / 5;
      for (var i = 0; i < 4; i++) for (var j = 0; j < 5; j++) {
        var lit = R() < 0.5, x = i * bw + bw * 0.12, y = j * fh + fh * 0.25;
        g.fillStyle = lit ? cols[Math.floor(R() * cols.length)] : '#0B0E18'; g.globalAlpha = lit ? 0.45 + R() * 0.55 : 1;
        g.fillRect(x, y, bw * 0.76, fh * 0.5); g.globalAlpha = 1;
      }
      if (R() < 0.7) { g.fillStyle = '#7FF6FF'; g.fillRect(w * 0.5 - 1, 0, 2, h); }
    });
    // the city's streets far below, a glowing grid
    X.ground = ctx.textures.canvas(256, 256, function (g, w, h) {
      g.fillStyle = '#020206'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#1A2648'; for (var k = 0; k < 8; k++) { g.fillRect(k * 32, 0, 2, h); g.fillRect(0, k * 32, w, 2); }
      g.fillStyle = '#5A2A10'; g.fillRect(0, 128, w, 3); g.fillRect(64, 0, 3, h);
      g.fillStyle = '#2A6A80'; for (k = 0; k < 40; k++) g.fillRect(Math.floor(R() * 8) * 32, R() * h, 2, 4);
    });
    // the far city all round: silhouettes on a glow of light pollution, transparent above
    X.skyline = ctx.textures.canvas(low ? 512 : 1024, 256, function (g, w, h) {
      g.clearRect(0, 0, w, h);
      var gr = g.createLinearGradient(0, h * 0.45, 0, h);
      gr.addColorStop(0, 'rgba(70,30,120,0)'); gr.addColorStop(0.6, 'rgba(90,40,140,0.35)'); gr.addColorStop(1, 'rgba(40,20,70,0.9)');
      g.fillStyle = gr; g.fillRect(0, h * 0.45, w, h * 0.55);
      for (var layer = 0; layer < 2; layer++) {
        var x = 0;
        while (x < w) {
          var bw = 4 + R() * (layer ? 22 : 14), bh = (layer ? 20 : 40) + Math.pow(R(), 2) * (layer ? 90 : 110);
          g.fillStyle = layer ? '#070719' : '#0B0A22'; g.fillRect(x, h * 0.72 - bh, bw, bh + h * 0.28);
          for (var k = 0; k < bw * bh / 30; k++) { g.fillStyle = R() < 0.7 ? 'rgba(255,220,170,0.6)' : 'rgba(120,240,255,0.7)'; g.fillRect(x + R() * bw, h * 0.72 - bh + R() * bh, 1, 1); }
          if (R() < 0.12) { g.fillStyle = R() < 0.5 ? '#21E6FF' : '#FF2BD6'; g.fillRect(x, h * 0.72 - bh, bw, 1); }
          x += bw + R() * 3;
        }
      }
    });
    // the dynamo's core: bands and rising lines of light
    X.core = ctx.textures.canvas(256, 256, function (g, w, h) {
      g.fillStyle = '#03101A'; g.fillRect(0, 0, w, h);
      for (var i = 0; i < 16; i++) { g.fillStyle = i % 4 ? 'rgba(33,230,255,0.35)' : 'rgba(191,248,255,0.95)'; g.fillRect(i * w / 16, 0, i % 4 ? 2 : 4, h); }
      for (i = 0; i < 6; i++) { g.fillStyle = i % 3 ? 'rgba(33,230,255,0.5)' : 'rgba(255,122,26,0.9)'; g.fillRect(0, i * h / 6, w, 3); }
    });
    // the drum's infield: rings and spokes of circuitry
    X.infield = ctx.textures.canvas(S2, S2, function (g, w, h) {
      g.fillStyle = '#05070C'; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(33,230,255,0.45)'; g.lineWidth = 2;
      for (var r = 0.12; r < 0.5; r += 0.07) { g.beginPath(); g.arc(w / 2, h / 2, r * w, 0, Math.PI * 2); g.stroke(); }
      g.strokeStyle = 'rgba(33,230,255,0.25)'; g.lineWidth = 1;
      for (var a = 0; a < 24; a++) { g.beginPath(); g.moveTo(w / 2 + Math.cos(a * 0.2618) * w * 0.12, h / 2 + Math.sin(a * 0.2618) * w * 0.12); g.lineTo(w / 2 + Math.cos(a * 0.2618) * w * 0.49, h / 2 + Math.sin(a * 0.2618) * w * 0.49); g.stroke(); }
      g.strokeStyle = 'rgba(255,122,26,0.6)'; g.lineWidth = 3; g.beginPath(); g.arc(w / 2, h / 2, w * 0.475, 0, Math.PI * 2); g.stroke();
    });
    return X;
  }

  // the signs: one atlas, a row each (the circuit's name first, then each section's), lettered to fit
  function c_signAtlas(ctx, rows) {
    var low = ctx.quality === 'low', S = low ? 512 : 1024, RH = S / 8, font = THEME.font;
    var tex = ctx.textures.canvas(S, S, function (g, w, h) {
      g.fillStyle = '#03050B'; g.fillRect(0, 0, w, h);
      rows.forEach(function (r, i) {
        var y0 = i * RH;
        g.fillStyle = '#060B16'; g.fillRect(0, y0, w, RH);
        g.fillStyle = '#21E6FF'; g.fillRect(RH * 0.15, y0 + RH * 0.08, w - RH * 0.3, Math.max(2, RH * 0.025)); g.fillRect(RH * 0.15, y0 + RH * 0.89, w - RH * 0.3, Math.max(2, RH * 0.025));
        g.fillStyle = '#FF7A1A'; g.fillRect(RH * 0.15, y0 + RH * 0.3, RH * 0.06, RH * 0.4); g.fillRect(w - RH * 0.21, y0 + RH * 0.3, RH * 0.06, RH * 0.4);
        if (r.tag) {
          g.font = '700 ' + Math.round(RH * 0.17) + 'px ' + font + ', "Arial Black", sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle';
          g.fillStyle = '#FF9A4A'; g.fillText(r.tag, RH * 0.32, y0 + RH * 0.5);
        }
        var x0 = r.tag ? RH * 1.3 : RH * 0.4, x1 = w - RH * 0.4, size = Math.round(RH * 0.58);
        g.font = '900 ' + size + 'px ' + font + ', "Arial Black", sans-serif';
        var tw = g.measureText(r.text).width, fit = Math.min(1, (x1 - x0) / Math.max(1, tw));
        size = Math.max(10, Math.floor(size * fit)); g.font = '900 ' + size + 'px ' + font + ', "Arial Black", sans-serif';
        g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#9FF8FF';
        g.fillText(r.text, (x0 + x1) / 2, y0 + RH * 0.52);
      });
    });
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.anisotropy = 8;
    return tex;
  }

  // a circle through points [[x, z], ...] by least squares (x^2 + z^2 + Dx + Ez + F = 0): [cx, cz, r]
  function c_circle(P) {
    var a = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], b = [0, 0, 0];
    P.forEach(function (p) { var r = [p[0], p[1], 1], k = -(p[0] * p[0] + p[1] * p[1]); for (var i = 0; i < 3; i++) { b[i] += r[i] * k; for (var j = 0; j < 3; j++) a[i][j] += r[i] * r[j]; } });
    // Cramer's rule
    function det(m) { return m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]); }
    var D0 = det(a) || 1e-9, x = [0, 1, 2].map(function (c) { var m = a.map(function (row, i) { return row.map(function (v, j) { return j === c ? b[i] : v; }); }); return det(m) / D0; });
    var cx = -x[0] / 2, cz = -x[1] / 2; return [cx, cz, Math.sqrt(Math.max(1, cx * cx + cz * cz - x[2]))];
  }

  function buildLook(ctx) {
    var T = THREE, scene = ctx.scene, track = ctx.track, L = track.length, hw = track.halfWidth, low = ctx.quality === 'low', R = ctx.random;
    var SH = Math.max(1.5, Math.min(12, typeof SHOULDER === 'number' ? SHOULDER : 3)), W = hw + SH;
    var CEIL = 11, WALLH = 7, STEP = low ? 3 : 2;
    function wrapD(d) { d %= L; return d < 0 ? d + L : d; }
    function dOf(v) { v = Number(v) || 0; return Math.abs(v) <= 1 ? v * L : v; }
    function near(d, at, r) { var x = Math.abs(wrapD(d - at)); return Math.min(x, L - x) <= r; }

    /* -------- the lap's places, read from the circuit at build time -- */
    var SEC = (typeof SECTIONS !== 'undefined' && SECTIONS && SECTIONS.length ? SECTIONS : [{ kind: 'launch', name: 'MOGATRON', from: 0, to: 1 }]).map(function (s, i) {
      return { kind: s.kind, name: s.name, i: i, d0: dOf(s.from), d1: s.to >= 1 ? L : dOf(s.to) };
    });
    function secAt(d) { d = wrapD(d); for (var i = 0; i < SEC.length; i++) if (d >= SEC[i].d0 && d < SEC[i].d1) return SEC[i]; return SEC[SEC.length - 1]; }
    var CO = typeof COURSE !== 'undefined' && COURSE ? COURSE : {};
    var BRK = (CO.breaks || []).map(function (b) { var a = dOf(b.from != null ? b.from : b.at); var e = b.to != null ? dOf(b.to) : a + (Number(b.len) || 8); return [a, e]; });
    var GAPS = ((CO.walls && CO.walls.gaps) || []).map(function (g) { return { a: dOf(g.from), b: dOf(g.to), side: g.side === 'left' ? -1 : g.side === 'right' ? 1 : 0 }; });
    var PORT = (typeof HAZARD_PORTALS !== 'undefined' && HAZARD_PORTALS ? HAZARD_PORTALS : []).map(function (p) { return { d: dOf(p.at), half: (p.half || 2.4) + 0.3, h: p.h || 3.6 }; });
    var PYL = (typeof HAZARD_PYLONS !== 'undefined' && HAZARD_PYLONS ? HAZARD_PYLONS : []).map(function (p) { return { d: dOf(p.at), need: p.need || 21 }; });
    function inBreak(d) { d = wrapD(d); for (var i = 0; i < BRK.length; i++) if (d >= BRK[i][0] - 0.05 && d <= BRK[i][1] + 0.05) return true; return false; }
    function inGap(d, side) { d = wrapD(d); for (var i = 0; i < GAPS.length; i++) if ((!GAPS[i].side || GAPS[i].side === side) && d >= GAPS[i].a && d <= GAPS[i].b) return true; return false; }
    function inPortal(d, pad) { for (var i = 0; i < PORT.length; i++) if (near(d, PORT[i].d, PORT[i].half + (pad || 0))) return true; return false; }
    // nothing overhead lower than a pylon's fall within 14 m of it
    function pylonNear(d) { for (var i = 0; i < PYL.length; i++) if (near(d, PYL[i].d, 14)) return PYL[i].need; return 0; }

    // which way a stretch turns, and its outside: +1 a right-hand bend (its outside the left, -1)
    function turnOf(a, b) {
      var s = 0, n = 0; for (var d = a; d < b - 4; d += 4) { var f = track.frameAt(d), g = track.frameAt(d + 4); s += g.tan.dot(f.right); n++; }
      return n ? s : 0;
    }
    SEC.forEach(function (s) { var t = turnOf(s.d0, s.d1); s.turn = t > 0.05 ? 1 : t < -0.05 ? -1 : 0; s.outer = s.turn ? -s.turn : 0; });

    // the build's modes along the lap: 'tube' (the bore from its mouth, the Helix, the esses), 'open' (the bridge),
    // 'drum', 'trench' (the final straight, and the bore's first metres before its mouth)
    var MOUTH = 8;
    function modeAt(d) {
      var s = secAt(d);
      if (s.kind === 'launch') return wrapD(d) - s.d0 < MOUTH ? 'trench' : 'tube';
      if (s.kind === 'spiral' || s.kind === 'chicane') return 'tube';
      if (s.kind === 'skyline') return 'open';
      if (s.kind === 'drum') return 'drum';
      return 'trench';
    }
    // windows onto the city: the Helix's outside wall, both walls of the esses
    function windowAt(d, side) {
      var s = secAt(d), x = wrapD(d) - s.d0;
      if (inPortal(d, 5)) return false;
      if (s.kind === 'spiral') return side === (s.outer || -1) && x > 8 && x < s.d1 - s.d0 - 8 && (x % 16) >= 3 && (x % 16) < 13;
      if (s.kind === 'chicane') return x > 8 && x < s.d1 - s.d0 - 8 && ((x + (side > 0 ? 10 : 0)) % 20) >= 4 && ((x + (side > 0 ? 10 : 0)) % 20) < 14;
      return false;
    }

    /* -------- light and sky -- */
    ctx.sky({ top: '#020210', horizon: '#1A1340', bottom: '#05040C', sun: [0.2, 0.6, -0.7], sunColor: '#6A5CFF', sunSize: 0.5, glow: 0, sunPower: 0, haze: 0, curve: 0.55 });
    scene.fog = new T.Fog(THEME.fog, 45, 1150);
    scene.add(new T.HemisphereLight('#3A4C96', '#030308', 0.55));
    var key = new T.DirectionalLight('#9AB0FF', 0.55);
    key.position.set(60, 200, 40); key.castShadow = true; key.shadow.mapSize.set(1024, 1024);
    scene.add(key); scene.add(key.target);

    var TX = c_textures(ctx, W, SH);

    /* -------- materials (one draw call each) -- */
    var floorMat = new T.MeshStandardMaterial({ color: '#FFFFFF', map: TX.floor, roughness: 0.75, roughnessMap: TX.floorRough, metalness: 0.15, emissive: '#FFFFFF', emissiveMap: TX.floorGlow, emissiveIntensity: 0.55, envMapIntensity: 2.2 });
    var wallMat = new T.MeshStandardMaterial({ color: '#FFFFFF', map: TX.wall, roughness: 0.38, metalness: 0.65, emissive: '#FFFFFF', emissiveMap: TX.wallGlow, emissiveIntensity: 0.6, side: T.DoubleSide });
    var glowMat = new T.MeshBasicMaterial({ vertexColors: true, side: T.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    var hazeMat = new T.MeshBasicMaterial({ vertexColors: true, map: TX.haze, transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide, fog: false, forceSinglePass: true });
    var streamMat = new T.MeshBasicMaterial({ vertexColors: true, map: TX.stream, transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide, fog: false, forceSinglePass: true });

    var FLOOR = c_bucket(false), WALL = c_bucket(false), GLOW = c_bucket(true), HAZE = c_bucket(true), STREAM = c_bucket(true);
    var CY = '#21E6FF', ICE = '#BFF8FF', OR = '#FF7A1A';

    /* -------- the floor: the black glass road and its shoulders, open over every break -- */
    c_runs(L, function (d) { return !inBreak(d); }).forEach(function (r) {
      c_sweep(track, FLOOR, r[0], r[1], [[-W, 0], [-hw, 0], [hw, 0], [W, 0]], 1, { step: STEP, tu: 2 * W, tv: 2 * W });
      // (and its underside: a deck with thickness, for the views from the bridge and the flyover)
      [-1, 1].forEach(function (sd) { c_sweep(track, WALL, r[0], r[1], [[W, 0], [W, -1.2], [0, -1.6]], sd, { step: STEP * 2 }); });
    });

    /* -------- the lines on the road: lane lines, edges, orange secondaries (the esses: a split down the middle) -- */
    function roadLine(x, w, col, want) {
      c_runs(L, function (d) { return !inBreak(d) && (!want || want(d)); }).forEach(function (r) {
        c_sweep(track, GLOW, r[0], r[1], [[x - w / 2, 0.025], [x + w / 2, 0.025]], 1, { step: STEP, col: col });
      });
    }
    var isChicane = function (d) { return secAt(d).kind === 'chicane'; };
    var lane = hw / 2;
    roadLine(-lane, 0.1, c_hot(CY, 2.3)); roadLine(lane, 0.1, c_hot(CY, 2.3));
    roadLine(0, 0.12, c_hot(CY, 2.6), function (d) { return !isChicane(d); });
    roadLine(-0.22, 0.07, c_hot(OR, 2.6), isChicane); roadLine(0.22, 0.07, c_hot(OR, 2.6), isChicane);
    roadLine(-(hw - 0.15), 0.22, c_hot(ICE, 3.2)); roadLine(hw - 0.15, 0.22, c_hot(ICE, 3.2));
    roadLine(-(hw + 0.45), 0.08, c_hot(OR, 2.2)); roadLine(hw + 0.45, 0.08, c_hot(OR, 2.2));
    // the break's lips: cyan on the take-off side, orange on the landing
    BRK.forEach(function (b) {
      c_sweep(track, GLOW, b[0] - 0.3, b[0] - 0.05, [[-W, 0.03], [W, 0.03]], 1, { col: c_hot(CY, 2.4) });
      c_sweep(track, GLOW, b[1] + 0.05, b[1] + 0.35, [[-W, 0.03], [W, 0.03]], 1, { col: c_hot(OR, 2.6) });
    });

    /* -------- the walls, per mode, in bands (so a doorway, a window or a gap opens only its band) -- */
    // the tube's half profile: wall, chamfer, roof (the two halves meet over the centre line)
    var TUBE = [[W, 0], [W, WALLH], [W - 2.5, CEIL], [0, CEIL]];
    var BANDS = {
      tube: [
        { id: 'A', p: [[W, 0], [W, 3.9]], low: true },
        { id: 'B', p: [[W, 3.9], [W, 4.6]] },
        { id: 'C', p: [[W, 4.6], [W, 6.6]], win: true },
        { id: 'D', p: [[W, 6.6], [W, WALLH], [W - 2.5, CEIL], [0, CEIL]], roof: true },
      ],
      open: [{ id: 'A', p: [[W, 0], [W, 1.1], [W + 0.45, 1.1], [W + 0.45, -0.6], [W - 1, -2.8], [0, -3.2]], low: true }],
      trench: [
        { id: 'A', p: [[W, 0], [W, 3.9]], low: true },
        { id: 'B', p: [[W, 3.9], [W, 5], [W + 0.6, 5], [W + 0.6, -1.2]] },
      ],
      drumOuter: [
        { id: 'A', p: [[W, -6], [W, 0], [W, 3.9]], low: true },
        { id: 'B', p: [[W, 3.9], [W, 26], [W + 1.5, 26]] },
      ],
      drumInner: [{ id: 'A', p: [[W, 0], [W, 1.2], [W + 0.5, 1.2], [W + 0.5, -4]], low: true }],
    };
    function bandsFor(mode, side, d) {
      if (mode !== 'drum') return BANDS[mode];
      var s = secAt(d); return side === (s.outer || -1) ? BANDS.drumOuter : BANDS.drumInner;
    }
    ['tube', 'open', 'trench', 'drum'].forEach(function (mode) {
      [-1, 1].forEach(function (sd) {
        // the drum's two sides differ; sweep each band id the mode has
        var ids = mode === 'drum' ? ['A', 'B'] : BANDS[mode].map(function (b) { return b.id; });
        ids.forEach(function (id) {
          var want = function (d) {
            if (modeAt(d) !== mode) return false;
            var bs = bandsFor(mode, sd, d), b = null; for (var i = 0; i < bs.length; i++) if (bs[i].id === id) b = bs[i];
            if (!b) return false;
            if (b.roof) return true;
            if (inBreak(d) || inGap(d, sd)) return false;
            if (b.low && inPortal(d)) return false;
            if (b.win && windowAt(d, sd)) return false;
            return true;
          };
          c_runs(L, want).forEach(function (r) {
            // (a run never mixes the drum's sides: its outer side is fixed per section)
            var bs = bandsFor(mode, sd, (r[0] + r[1]) / 2), b = null; for (var i = 0; i < bs.length; i++) if (bs[i].id === id) b = bs[i];
            c_sweep(track, WALL, r[0], r[1], b.p, sd, { step: STEP, tu: 8, tv: 8 });
          });
        });
      });
    });

    /* -------- light strips along walls and roof, per mode -- */
    function strip(mode, sd, prof, col, extra) {
      c_runs(L, function (d) { return modeAt(d) === mode && !inBreak(d) && !inGap(d, sd) && (!extra || extra(d)); }).forEach(function (r) {
        c_sweep(track, GLOW, r[0], r[1], prof, sd, { step: STEP, col: col });
      });
    }
    var WS = W - 0.02, notDoor = function (d) { return !inPortal(d); };
    [-1, 1].forEach(function (sd) {
      // the tube: an orange line at the foot, cyan at 3.9 m and at the chamfer, two cyan-white strips in the roof
      strip('tube', sd, [[WS, 0.3], [WS, 0.42]], c_hot(OR, 2.4), notDoor);
      strip('tube', sd, [[WS, 3.86], [WS, 3.98]], c_hot(CY, 3));
      strip('tube', sd, [[WS, 6.93], [W - 0.08, 7.08]], c_hot(CY, 2.6));
      strip('tube', sd, [[5.15, CEIL - 0.03], [5.6, CEIL - 0.03]], c_hot(CY, 1.6));
      strip('tube', sd, [[WS, 4.56], [WS, 4.63]], c_hot(CY, 2.2), function (d) { return windowAt(d, sd); });
      strip('tube', sd, [[WS, 6.57], [WS, 6.64]], c_hot(CY, 2.2), function (d) { return windowAt(d, sd); });
      // the bridge: the parapet's top lit, an orange line along its face, the deck's edge (the bridge seen from afar)
      strip('open', sd, [[W - 0.02, 1.11], [W + 0.47, 1.11]], c_hot(CY, 3));
      strip('open', sd, [[WS, 0.45], [WS, 0.55]], c_hot(OR, 2.2));
      strip('open', sd, [[W + 0.47, -0.32], [W + 0.47, -0.16]], c_hot(CY, 2.2));
      // the trench: orange foot, cyan line, the wall's lit top
      strip('trench', sd, [[WS, 0.3], [WS, 0.42]], c_hot(OR, 2.4), notDoor);
      strip('trench', sd, [[WS, 3.86], [WS, 3.98]], c_hot(CY, 3));
      strip('trench', sd, [[W - 0.02, 5.01], [W + 0.62, 5.01]], c_hot(CY, 2.4));
    });
    // the roof's centre: a thin orange line (the esses have the blade instead)
    strip('tube', 1, [[-0.04, CEIL - 0.03], [0.04, CEIL - 0.03]], c_hot(OR, 1.8), function (d) { return !isChicane(d); });
    // the drum: bands of light up its tall outside wall, a lit top to the low inside one
    SEC.filter(function (s) { return s.kind === 'drum'; }).forEach(function (s) {
      var out = s.outer || -1, inn = -out;
      [[0.3, 0.42, OR, 2.4], [3.86, 3.98, CY, 3], [9, 9.1, CY, 2.6], [15, 15.1, CY, 2.2], [21, 21.1, CY, 2], [25.85, 25.98, ICE, 3]].forEach(function (b) {
        c_runs(L, function (d) { return d >= s.d0 && d < s.d1 && !inGap(d, out) && !(b[0] < 4 && inPortal(d)); }).forEach(function (r) { c_sweep(track, GLOW, r[0], r[1], [[WS, b[0]], [WS, b[1]]], out, { step: STEP, col: c_hot(b[2], b[3]) }); });
      });
      c_sweep(track, GLOW, s.d0, s.d1, [[W - 0.02, 1.21], [W + 0.52, 1.21]], inn, { step: STEP, col: c_hot(CY, 3) });
      c_sweep(track, GLOW, s.d0, s.d1, [[WS, 0.5], [WS, 0.6]], inn, { step: STEP, col: c_hot(OR, 2.2) });
      // vertical ribs of light up the outside wall: the speed reads off them
      for (var d = s.d0 + 4; d < s.d1 - 2; d += low ? 13.5 : 9) {
        if (inPortal(d, 1) || inGap(d, out)) continue;
        c_sweep(track, GLOW, d, d + 0.16, [[WS - 0.01, 0.7], [WS - 0.01, 25.6]], out, { col: c_hot(CY, 1.8) });
      }
      // light falling down the tall wall into the hall (it ends 9 m up: out of the corridor)
      for (d = s.d0 + 10; d < s.d1 - 8; d += low ? 36 : 18) {
        if (pylonNear(d) || pylonNear(d + 7)) continue;
        c_sweep(track, HAZE, d, d + 7, [[W - 0.3, 24.5], [W - 3.2, 9]], out, { step: 1.5, us: [0, 1], col: c_hot(CY, 0.3), fade: true });
      }
    });

    /* -------- ribs and rings: the bore's rings of light, the Helix's dense ribs, the esses' alternating frames -- */
    // the tube's outline inset toward the inside by k metres (each point moved along its corner's inward normal)
    function inset(prof, k) {
      return prof.map(function (p, q) {
        var a = prof[Math.max(0, q - 1)], b = prof[Math.min(prof.length - 1, q + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.sqrt(dx * dx + dy * dy) || 1;
        return [p[0] - dy / l * k, p[1] + dx / l * k];
      });
    }
    var TUBE_IN = inset(TUBE, 0.55), TUBE_GLOW = inset(TUBE, 0.06);
    // a closed rib (the wall's outline and the inset one) for the structure
    var RIB = TUBE.concat(TUBE_IN.slice().reverse());
    function overheadOK(d, h) { var need = pylonNear(d); return !need || h >= need; }
    SEC.forEach(function (s) {
      if (s.kind !== 'launch' && s.kind !== 'spiral' && s.kind !== 'chicane') return;
      var every = s.kind === 'spiral' ? 6 : s.kind === 'chicane' ? 10 : 12;
      if (low) every *= 1.5;
      var n = 0;
      for (var d = s.d0 + (s.kind === 'launch' ? MOUTH + 6 : 3); d < s.d1 - 2; d += every, n++) {
        if (modeAt(d) !== 'tube' || inPortal(d, 1) || !overheadOK(d, CEIL)) continue;
        var ribHere = s.kind === 'spiral' || s.kind === 'chicane' || n % 3 === 0;
        var col = s.kind === 'chicane' && n % 2 ? c_hot(OR, 2.4) : c_hot(CY, s.kind === 'spiral' ? 2.2 : 2.6);
        [-1, 1].forEach(function (sd) {
          if (ribHere) {
            c_sweep(track, WALL, d, d + 0.8, RIB, sd, { tu: 4, tv: 4 });
            c_sweep(track, GLOW, d - 0.02, d + 0.14, inset(TUBE, 0.57), sd, { col: col });
          } else c_sweep(track, GLOW, d, d + 0.2, TUBE_GLOW, sd, { col: col });
        });
      }
    });
    // window mullions: thin dark posts across the window band, every 4 m
    [-1, 1].forEach(function (sd) {
      c_runs(L, function (d) { return modeAt(d) === 'tube' && windowAt(d, sd); }).forEach(function (r) {
        for (var d = r[0] + 2; d < r[1] - 1; d += 4) c_sweep(track, WALL, d, d + 0.25, [[W, 4.6], [W, 6.6]], sd, {});
      });
    });

    /* -------- the esses' divider: a blade of light hanging over the centre line, off the road (8.7 m up) -- */
    SEC.filter(function (s) { return s.kind === 'chicane'; }).forEach(function (s) {
      c_sweep(track, HAZE, s.d0 + 6, s.d1 - 6, [[0, 8.75], [0, CEIL - 0.05]], 1, { step: STEP, us: [0, 1], col: c_hot(OR, 0.9), tv: 12 });
      c_sweep(track, GLOW, s.d0 + 6, s.d1 - 6, [[-0.04, 8.72], [0.04, 8.72]], 1, { step: STEP, col: c_hot(OR, 3) });
      c_sweep(track, GLOW, s.d0 + 6, s.d1 - 6, [[0, 8.7], [0, 8.82]], 1, { step: STEP, col: c_hot(OR, 3) });
    });

    /* -------- haze: shafts down from the roof strips to the shoulders, the strips' reflections in the wet glass -- */
    [-1, 1].forEach(function (sd) {
      c_runs(L, function (d) { return modeAt(d) === 'tube'; }).forEach(function (r) {
        for (var d = r[0] + 6; d < r[1] - 8; d += low ? 40 : 20) {
          // (from the roof strip at 5.4 m across down to the shoulder: under 7 m it is outside 8.7 m across)
          c_sweep(track, HAZE, d, d + 6, [[7.6, CEIL - 0.1], [10.6, 0.3]], sd, { step: 1.5, us: [0, 1], col: c_hot(CY, 0.22), fade: true });
        }
        c_sweep(track, HAZE, r[0], r[1], [[4.6, 0.03], [5.4, 0.03], [6.2, 0.03]], sd, { step: STEP, us: [1, 0, 1], tv: 5, col: c_hot(ICE, 0.12) });
        c_sweep(track, HAZE, r[0], r[1], [[W - 1.2, 0.03], [W - 0.6, 0.03], [W - 0.05, 0.03]], sd, { step: STEP, us: [1, 0, 1], tv: 4, col: c_hot(OR, 0.1) });
      });
    });

    /* -------- data streams: dashes of light running with the racers -- */
    var sCy = c_hot(CY, 1.6), sOr = c_hot(OR, 1.4);
    [-1, 1].forEach(function (sd) {
      // the tube: along the chamfer
      c_runs(L, function (d) { return modeAt(d) === 'tube'; }).forEach(function (r) {
        c_sweep(track, STREAM, r[0], r[1], [[W - 0.79, 8.2], [W - 1.41, 9.2]], sd, { step: STEP, us: [0, 1], tv: 24, col: sCy });
      });
      // the bridge: ribbons floating out over the city, rising and falling
      c_runs(L, function (d) { return modeAt(d) === 'open'; }).forEach(function (r) {
        var ph = sd > 0 ? 0 : 2.1;
        c_sweep(track, STREAM, r[0], r[1], function (d) { var y = 7 + 2.5 * Math.sin(d * 0.045 + ph); return [[W + 6, y - 0.35], [W + 6, y + 0.35]]; }, sd, { step: STEP, us: [0, 1], tv: 20, col: sCy });
        if (!low) c_sweep(track, STREAM, r[0], r[1], function (d) { var y = 13 + 3 * Math.sin(d * 0.03 + ph + 1); return [[W + 11, y - 0.3], [W + 11, y + 0.3]]; }, sd, { step: STEP, us: [0, 1], tv: 30, col: sOr });
      });
      // the trench: along the inside of the wall's top
      c_runs(L, function (d) { return modeAt(d) === 'trench' && !inGap(d, sd); }).forEach(function (r) {
        c_sweep(track, STREAM, r[0], r[1], [[W - 0.03, 4.35], [W - 0.03, 4.8]], sd, { step: STEP, us: [0, 1], tv: 24, col: sd > 0 ? sCy : sOr });
      });
    });
    SEC.filter(function (s) { return s.kind === 'drum'; }).forEach(function (s) {
      var out = s.outer || -1;
      c_sweep(track, STREAM, s.d0, s.d1, [[W - 0.04, 6.0], [W - 0.04, 6.7]], out, { step: STEP, us: [0, 1], tv: 24, col: sCy });
      c_sweep(track, STREAM, s.d0, s.d1, [[W - 0.04, 12.0], [W - 0.04, 12.5]], out, { step: STEP, us: [0, 1], tv: 32, col: sOr });
    });

    /* -------- gates, signs, the bore's facade, the final straight's arches, the line and the grid -- */
    var rows = [{ text: String(typeof CIRCUIT_NAME === 'string' ? CIRCUIT_NAME : 'MOGATRON').toUpperCase(), tag: '' }];
    SEC.forEach(function (s, i) { rows.push({ text: String(s.name || s.kind).toUpperCase(), tag: 'S' + (i + 1) }); });
    rows = rows.slice(0, 7);
    var signTex = c_signAtlas(ctx, rows), SIGN = c_bucket(false);
    // a sign at d, w metres wide (the row's 8:1), its foot y metres up, facing the racers coming up to it (its back a
    // blank panel): makeBasis(right, up, -tan) is right-handed, so its words read the right way round
    function sign(d, row, w, y) {
      var f = track.frameAt(d), h = w / 8, c = f.pos.clone().addScaledVector(f.up, y);
      var r = f.right.clone().multiplyScalar(w / 2), u = f.up.clone().multiplyScalar(h);
      var v0 = 1 - (row + 1) / 8, v1 = 1 - row / 8, bl = c.clone().sub(r), br = c.clone().add(r);
      c_quad(SIGN, bl, br, br.clone().add(u), bl.clone().add(u), null, [0, v0, 1, v0, 1, v1, 0, v1]);
      var back = f.tan.clone().multiplyScalar(0.06), vb0 = 0, vb1 = 1 / 8 * 0.5;
      c_quad(SIGN, br.clone().add(back), bl.clone().add(back), bl.clone().add(back).add(u), br.clone().add(back).add(u), null, [0.5, vb0, 0.5, vb0, 0.5, vb1, 0.5, vb1]);
    }
    var holoCol = c_hot(CY, 0.16);
    function gate(s, d) {
      var mode = modeAt(d);
      if (!overheadOK(d, 12)) return;
      if (mode === 'tube') {
        // a frame of light just inside the tube's outline, a second fainter one behind it
        [-1, 1].forEach(function (sd) {
          c_sweep(track, GLOW, d, d + 0.18, inset(TUBE, 0.9), sd, { col: c_hot(ICE, 3) });
          c_sweep(track, GLOW, d + 1.2, d + 1.32, inset(TUBE, 0.9), sd, { col: c_hot(CY, 1.6) });
        });
        sign(d + 0.1, s.i + 1, 10, 8.9);
        c_sweep(track, HAZE, d + 0.4, d + 1.1, [[-8.4, 10.35], [8.4, 10.35]], 1, { us: [0.2, 0.2], col: holoCol });
      } else {
        // a free-standing arch: posts at the walls' line, a beam 11.2 m up, its inner edges lit
        var hgt = 11.2, M;
        [-1, 1].forEach(function (sd) {
          M = c_frameMat(track, d, sd * (W + 0.6), 0);
          var g = new T.BoxGeometry(0.7, hgt + 0.8, 0.7); g.translate(0, (hgt + 0.8) / 2, 0); c_addGeo(WALL, g, M);
          c_sweep(track, GLOW, d - 0.1, d + 0.1, [[W + 0.24, 0.2], [W + 0.24, hgt]], sd, { col: c_hot(ICE, 2.8) });
        });
        M = c_frameMat(track, d, 0, hgt + 0.4); var gb = new T.BoxGeometry(2 * (W + 0.95), 0.8, 0.7); c_addGeo(WALL, gb, M);
        c_sweep(track, GLOW, d - 0.1, d + 0.1, [[-(W + 0.25), hgt - 0.01], [W + 0.25, hgt - 0.01]], 1, { col: c_hot(ICE, 2.8) });
        sign(d - 0.4, s.i + 1, 10, hgt - 1.6);
        c_sweep(track, HAZE, d + 0.1, d + 0.8, [[-(W + 0.2), hgt - 1.8], [W + 0.2, hgt - 1.8]], 1, { us: [0.2, 0.2], col: holoCol });
      }
    }
    SEC.forEach(function (s) { gate(s, s.d0 + (s.kind === 'launch' ? MOUTH + 4 : 4)); });

    // the bore's mouth: a facade round the tube with the circuit's name over it, lit round the opening
    var launch = SEC.filter(function (s) { return s.kind === 'launch'; })[0];
    if (launch) {
      var dm = launch.d0 + MOUTH, Mf;
      [-1, 1].forEach(function (sd) {
        Mf = c_frameMat(track, dm - 1, sd * (W + 2.2), 0); var gp = new T.BoxGeometry(4.4, 19, 2); gp.translate(0, 7.5, 0); c_addGeo(WALL, gp, Mf);
        c_sweep(track, GLOW, dm - 2.05, dm - 1.95, TUBE_GLOW, sd, { col: c_hot(ICE, 3.2) });
      });
      Mf = c_frameMat(track, dm - 1, 0, 13.25); c_addGeo(WALL, new T.BoxGeometry(2 * (W + 4.4), 4.5, 2), Mf);
      sign(dm - 2.08, 0, 2 * W - 1, 11.8);
    }
    // where the tube ends (the esses into the bridge): a collar round the opening
    c_runs(L, function (d) { return modeAt(d) === 'tube'; }).forEach(function (r) {
      [-1, 1].forEach(function (sd) {
        c_sweep(track, WALL, r[1] - 1.5, r[1], [[W, -1.2], [W + 1.6, -1.2], [W + 1.6, WALLH + 0.8], [W - 2.2, CEIL + 1.6], [0, CEIL + 1.6]], sd, {});
        c_sweep(track, GLOW, r[1] + 0.02, r[1] + 0.06, TUBE.map(function (p) { return [p[0] + 0.3, p[1] + 0.3]; }), sd, { col: c_hot(CY, 2.4) });
      });
    });

    // the final straight's arches: 17 m up (the flyover comes down this straight 13 m over the road)
    SEC.filter(function (s) { return s.kind === 'final'; }).forEach(function (s) {
      for (var d = s.d0 + 22; d < s.d1 - 10; d += 36) {
        if (!overheadOK(d, 17) || inPortal(d, 2)) continue;
        [-1, 1].forEach(function (sd) {
          var M = c_frameMat(track, d, sd * (W + 0.9), 0), g = new T.BoxGeometry(0.8, 17.8, 0.8); g.translate(0, 8.9, 0); c_addGeo(WALL, g, M);
          c_sweep(track, GLOW, d - 0.12, d + 0.12, [[W + 0.48, 5.2], [W + 0.48, 17]], sd, { col: c_hot(CY, 2.4) });
        });
        var Mb = c_frameMat(track, d, 0, 17.4); c_addGeo(WALL, new T.BoxGeometry(2 * (W + 1.3), 0.8, 0.8), Mb);
        c_sweep(track, GLOW, d - 0.12, d + 0.12, [[-(W + 0.5), 16.99], [W + 0.5, 16.99]], 1, { col: c_hot(ICE, 2.6) });
      }
    });

    // the line: a checker of light across the road at 0, the grid's boxes behind it (two by two, 6 m a row)
    var chk = c_hot(ICE, 1.9);
    for (var cx = -hw; cx < hw - 0.01; cx += 1) for (var row = 0; row < 2; row++) {
      if ((Math.round(cx + hw) + row) % 2) continue;
      c_sweep(track, GLOW, -0.6 + row * 0.6, row * 0.6, [[cx, 0.03], [cx + 1, 0.03]], 1, { col: chk });
    }
    c_sweep(track, GLOW, 0.6, 0.75, [[-W, 0.03], [W, 0.03]], 1, { col: c_hot(CY, 3) });
    var gcol = c_hot(OR, 2);
    for (var gs = 0; gs < 8; gs++) {
      var gr = Math.floor(gs / 2), gc = gs % 2, gd = -(5 + gr * 6 + gc * 3), gx = gc ? -1.6 : 1.6;
      c_sweep(track, GLOW, gd - 1.6, gd + 1.4, [[gx - 0.95, 0.03], [gx - 0.87, 0.03]], 1, { step: 1, col: gcol });
      c_sweep(track, GLOW, gd - 1.6, gd + 1.4, [[gx + 0.87, 0.03], [gx + 0.95, 0.03]], 1, { step: 1, col: gcol });
      c_sweep(track, GLOW, gd + 1.32, gd + 1.4, [[gx - 0.95, 0.03], [gx + 0.95, 0.03]], 1, { col: gcol });
    }

    /* -------- the bridge: suspension towers beside the deck, cables of light down to it -- */
    SEC.filter(function (s) { return s.kind === 'skyline'; }).forEach(function (s) {
      for (var d = s.d0 + 30; d < s.d1 - 20; d += 70) {
        var bad = false; BRK.forEach(function (b) { if (near(d, b[0], 22)) bad = true; });
        if (bad || pylonNear(d)) continue;
        [-1, 1].forEach(function (sd) {
          var M = c_frameMat(track, d, sd * (W + 3.2), 0), g = new T.BoxGeometry(2.2, 78, 2.2); g.translate(0, -5, 0); c_addGeo(WALL, g, M);
          var top = track.pointAt(d, sd * (W + 3.2), 33.5);
          c_sweep(track, GLOW, d - 0.15, d + 0.15, [[W + 2.08, 1.5], [W + 2.08, 33.8]], sd, { col: c_hot(CY, 2.2) });
          c_addGeo(GLOW, new T.SphereGeometry(0.45, 8, 6), new T.Matrix4().makeTranslation(top.x, top.y + 0.7, top.z), c_hot('#FF2E4A', 5));
          [-30, -20, -10, 10, 20, 30].forEach(function (k) {
            if (inBreak(d + k)) return;
            c_line(GLOW, top, track.pointAt(d + k, sd * (W + 0.45), 1.1), 0.07, c_hot(ICE, 1.5));
          });
        });
      }
    });

    /* -------- the drum's heart: the dynamo core at the bend's centre, its rings turning, the infield -- */
    var DRUM = null;
    SEC.filter(function (s) { return s.kind === 'drum'; }).forEach(function (s) {
      if (DRUM) return;
      // the bend's centre and radius: a circle fitted (least squares) through the middle of its centre line
      var ys = 0, n = 0, lowY = Infinity, len = s.d1 - s.d0, FP = [];
      for (var d = s.d0; d <= s.d1 - 2; d += 2) {
        var f = track.frameAt(d); ys += f.pos.y; n++;
        lowY = Math.min(lowY, track.pointAt(d, (s.outer || -1) * -W, 0).y);
        if (d > s.d0 + len * 0.15 && d < s.d1 - len * 0.15) FP.push([f.pos.x, f.pos.z]);
      }
      var fit = c_circle(FP), cxc = fit[0], czc = fit[1], rad = fit[2], cy = ys / n, inner = Math.max(12, rad - W - 2);
      var core = new T.Mesh(new T.CylinderGeometry(9, 11, 110, low ? 20 : 32, 1, true), new T.MeshBasicMaterial({ map: TX.core, color: new T.Color(1.35, 1.35, 1.35) }));
      TX.core.repeat.set(2, 3);
      core.position.set(cxc, cy - 15, czc); core.userData.gmKart = true; scene.add(core);
      var RG = c_bucket(true);
      [[15, 0.32, 8, 0.12, ICE, 3.4], [19.5, 0.24, 16, -0.18, CY, 2.8], [24, 0.2, 24, 0.08, OR, 2.6]].forEach(function (r) {
        var tg = new T.TorusGeometry(r[0], r[1], 6, low ? 48 : 80); tg.rotateX(Math.PI / 2); tg.rotateZ(r[3]); tg.translate(0, r[2], 0);
        c_addGeo(RG, tg, null, c_hot(r[4], r[5]));
      });
      var rings = c_mesh(scene, RG, new T.MeshBasicMaterial({ vertexColors: true }), 'drum-rings', { normals: false });
      rings.position.set(cxc, cy, czc);
      var disc = new T.Mesh(new T.CircleGeometry(inner, low ? 48 : 96), new T.MeshBasicMaterial({ map: TX.infield, color: new T.Color(1.2, 1.2, 1.2) }));
      disc.rotation.x = -Math.PI / 2; disc.position.set(cxc, lowY - 0.6, czc); disc.userData.gmKart = true; scene.add(disc);
      var pl = null;
      if (!low) { pl = new T.PointLight('#5FEFFF', 2.2, 95, 1.2); pl.position.set(cxc, cy + 6, czc); scene.add(pl); }
      DRUM = { rings: rings, core: core, c: [cxc, czc], r: rad };
    });

    /* -------- under the deck: columns down to the city -- */
    var CITY_Y = -140, colsAt = [];
    for (var dc = 18; dc < L; dc += 36) { if (!inBreak(dc)) colsAt.push(dc); }
    var colGeo = new T.BoxGeometry(1, 1, 1); colGeo.translate(0, 0.5, 0);
    var cols = ctx.instanced(colGeo, new T.MeshStandardMaterial({ color: '#0B0E15', roughness: 0.6, metalness: 0.5, emissive: '#21E6FF', emissiveIntensity: 0.02 }), colsAt.length, function (i, dm) {
      var f = track.frameAt(colsAt[i]); dm.position.set(f.pos.x, CITY_Y, f.pos.z); dm.rotation.y = Math.atan2(f.tan.x, f.tan.z); dm.scale.set(3, Math.max(4, f.pos.y - 1.6 - CITY_Y), 3);
    });
    cols.userData.gmKart = true; cols.castShadow = false; scene.add(cols);

    /* -------- the city: towers (windows), their roofs, neon crowns; the streets below; the far skyline round it -- */
    var bx0 = Infinity, bx1 = -Infinity, bz0 = Infinity, bz1 = -Infinity;
    for (var ds = 0; ds < L; ds += 10) { var pp = track.frameAt(ds).pos; bx0 = Math.min(bx0, pp.x); bx1 = Math.max(bx1, pp.x); bz0 = Math.min(bz0, pp.z); bz1 = Math.max(bz1, pp.z); }
    var ccx = (bx0 + bx1) / 2, ccz = (bz0 + bz1) / 2, NT = low ? 160 : 380, TW = [];
    for (var tries = 0; TW.length < NT && tries < NT * 6; tries++) {
      var ang = R() * Math.PI * 2, rr = 40 + Math.pow(R(), 1.5) * 1000, tx = ccx + Math.cos(ang) * rr, tz = ccz + Math.sin(ang) * rr * 0.85;
      var tw = 12 + R() * 22, th = 50 + Math.pow(R(), 2.2) * 290;
      var nr = track.nearest(tx, tz); if (!nr || nr.distance < 26 + tw * 0.75) continue;
      if (DRUM && Math.hypot(tx - DRUM.c[0], tz - DRUM.c[1]) < DRUM.r + W + 6 + tw) continue;
      TW.push([tx, tz, tw, th, R() * 1.6]);
    }
    // windows: a square prism without caps, its uvs scaled to metres in the vertex shader (16 m a tile)
    var prism = new T.CylinderGeometry(Math.SQRT1_2, Math.SQRT1_2, 1, 4, 1, true); prism.rotateY(Math.PI / 4); prism.translate(0, 0.5, 0);
    var towerMat = new T.MeshBasicMaterial({ map: TX.tower });
    towerMat.onBeforeCompile = function (sh) {
      sh.vertexShader = sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n#if defined( USE_INSTANCING ) && defined( USE_MAP )\n  vMapUv = vMapUv * vec2(4.0 * length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz)) / 16.0;\n#endif');
    };
    var tint = ['#FFFFFF', '#BFEFFF', '#FFD9B0', '#C9B8FF', '#9FE8FF', '#FFC0E8'];
    var towers = ctx.instanced(prism, towerMat, TW.length, function (i, dm) { var t = TW[i]; dm.position.set(t[0], CITY_Y, t[1]); dm.rotation.y = t[4]; dm.scale.set(t[2], t[3], t[2]); });
    var roofs = ctx.instanced(new T.BoxGeometry(1, 1, 1), new T.MeshBasicMaterial({ color: '#05060C' }), TW.length, function (i, dm) { var t = TW[i]; dm.position.set(t[0], CITY_Y + t[3], t[1]); dm.rotation.y = t[4]; dm.scale.set(t[2] * 1.02, 1.2, t[2] * 1.02); });
    var crowns = ctx.instanced(new T.CylinderGeometry(Math.SQRT1_2, Math.SQRT1_2, 1, 4, 1, true).rotateY(Math.PI / 4), new T.MeshBasicMaterial({ color: '#FFFFFF', side: T.DoubleSide }), TW.length, function (i, dm) { var t = TW[i]; dm.position.set(t[0], CITY_Y + t[3] + 0.9, t[1]); dm.rotation.y = t[4]; dm.scale.set(t[2] * 1.04, 0.45, t[2] * 1.04); });
    var crownCols = [c_hot(CY, 2.4), c_hot('#FF2BD6', 2.2), c_hot(OR, 2.2), c_hot('#9A5BFF', 2.2), c_hot(ICE, 1.6)];
    for (var ti = 0; ti < TW.length; ti++) {
      towers.setColorAt(ti, new T.Color(tint[Math.floor(R() * tint.length)]).multiplyScalar(0.75 + R() * 0.35));
      crowns.setColorAt(ti, R() < 0.55 ? crownCols[Math.floor(R() * crownCols.length)] : new T.Color(0.02, 0.02, 0.04));
    }
    [towers, roofs, crowns].forEach(function (m) { if (m.instanceColor) m.instanceColor.needsUpdate = true; m.userData.gmKart = true; m.castShadow = m.receiveShadow = false; scene.add(m); });
    TX.ground.repeat.set(36, 36);
    var ground = new T.Mesh(new T.PlaneGeometry(4200, 4200), new T.MeshBasicMaterial({ map: TX.ground }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(ccx, CITY_Y, ccz); ground.userData.gmKart = true; scene.add(ground);
    TX.skyline.repeat.set(3, 1); TX.skyline.wrapT = T.ClampToEdgeWrapping;
    var back = new T.Mesh(new T.CylinderGeometry(1500, 1500, 460, low ? 40 : 64, 1, true), new T.MeshBasicMaterial({ map: TX.skyline, transparent: true, depthWrite: false, side: T.BackSide, fog: false }));
    back.position.set(ccx, -40, ccz); back.renderOrder = -900; back.frustumCulled = false; back.userData.gmKart = true; scene.add(back);

    /* -------- the merged meshes -- */
    c_mesh(scene, FLOOR, floorMat, 'floor', { shadow: true, track: true });
    c_mesh(scene, WALL, wallMat, 'structure', { shadow: true });
    c_mesh(scene, GLOW, glowMat, 'lines', { normals: false });
    c_mesh(scene, HAZE, hazeMat, 'haze', { normals: false, order: 2 });
    c_mesh(scene, STREAM, streamMat, 'streams', { normals: false, order: 3 });
    c_mesh(scene, SIGN, new T.MeshBasicMaterial({ map: signTex, color: new T.Color(1.6, 1.6, 1.6) }), 'signs', { normals: false });

    return {
      update: function (ctx, t) {
        TX.stream.offset.y = -((t * 0.55) % 1);
        TX.haze.offset.y = (t * 0.015) % 1;
        if (DRUM) { DRUM.rings.rotation.y = t * 0.35; TX.core.offset.x = (t * 0.04) % 1; }
        var cp = ctx.camera && ctx.camera.position; if (cp) { back.position.x = cp.x; back.position.z = cp.z; }
      },
    };
  }

  /* ------------------------------------------------------- the world -- */
  // the parts' per-frame work, once built
  var LOOK = null, HAZ = null;

  GameMog.world({
    theme: THEME,
    // the runtime's 'kart' preset, darker, cooler and harder (look.js: GRAPHICS, its neon environment for the glass)
    graphics: GRAPHICS,
    camera: CAMERA,
    track: { width: ROAD_WIDTH, points: LAP_POINTS },
    // the soundtrack: the library's electro track (CC0; a first-party world plays its own music)
    music: { track: 'music-vengeance-electro' },
    // three laps, no item weapons (so no airdrops: the course says so), the hazards on (the course's). Drift assist
    // (tap + steer drifts) and a drift charge of 1.3 for the esses' one tight bend; the neon effects: cyan skid
    // marks, the hype flashes, the rush, a cold smoke and dark shoulders
    kart: { laps: LAPS, class: 'normal', course: COURSE, items: false,
      driftAssist: true, driftCharge: 1.3,
      fx: { skids: '#3FF4FF', skidOpacity: 0.35, rush: true, hype: true, smoke: '#26344A', offroad: { shoulder: '#1A2236' } } },

    build: function (ctx) {
      LOOK = buildLook(ctx);
      HAZ = buildHazards(ctx);
    },

    update: function (ctx, t, dt) {
      if (LOOK) LOOK.update(ctx, t, dt);
      if (HAZ) HAZ.update(ctx, t, dt);
    },

    player: function (ctx) { return makeLightbike(ctx, RIDERS[0]); },
    rival: function (ctx, k) { return makeLightbike(ctx, RIDERS[k % RIDERS.length]); },
  });
})();
