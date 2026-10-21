// INVISIBLE WORLD. A kart race on a road of light through deep space (a first-party world, 21 Oct 2026).
//
// The owner, 21 Oct: "a 3 lap course that will be a showcase for GameMog ... 8 unique [3D Invisible Friends] into an
// amazing race called 'Invisible World' ... that blows away the competition in visual experience, scope, feel and
// chaotic fun". The eight racers are the owner's own 3D Invisible Friends (tokens 2211, 4958, 3057, 3074, 2443, 4915,
// 4732, 4370; the owner holds them and their usage rights), modelled here from their traits and renders: no body, only
// what they wear and carry, white cartoon gloves, big shoes, the hat, the glasses and the mouth prop floating where a
// head would be. The road is our own: a ribbon of rainbow light 1.2 km round, three laps, open to space on most of its
// length (drive off and you fall, and the Rescue Claw puts you back), banked sweepers, a big-air jump over a gap, a dive,
// a walled hairpin, rails, boost pads, item crates, meteors and a toppling candle. Every name in it is the world's own.

(function () {
  /* ------------------------------------------------------------ the lap -- */
  // 1,512 m, closed exactly, 18 m to 70 m up (21 Oct, v2, the owner: "Aspen GP jumps and drops, Magma Crown climbing, Meme
  // Kart obstacles"): a rectangle run anticlockwise with the Dream Tower in its north-west corner, a spiral of one turn and
  // a quarter round the dream castle climbing 30 m (its turns 24 m apart in height: the runtime's self-pass rule wants 6).
  // Pieces as fractions: start 0-0.073, Daybreak Drop 0.073-0.152 (down 22 m), Sweeper 0.152-0.204, Bubbles 0.204-0.236,
  // Crest 0.236-0.283, Switchback (two hairpins) 0.283-0.403, Slalom 0.403-0.481, Whale Run 0.481-0.615 (up 17 m),
  // Dream Tower 0.615-0.822 (up 30 m), Skyfall 0.822-0.922 (down 30 m), Home 0.922-0.974, run-in. Every bank is 0 (the
  // kart kit rides the centre line's height across the road: a banked road and its karts part)
  var LAP = [[0.0,40.0,0.0,0],[27.5,40.0,0.0,0],[55.0,40.0,0.0,0],[82.5,40.0,0.0,0],[110.0,40.0,0.0,0],[140.0,34.5,0.0,0],[170.0,29.0,0.0,0],[200.0,23.5,0.0,0],[230.0,18.0,0.0,0],[249.1,18.8,-3.8,0],[265.4,19.5,-14.6,0],[276.2,20.2,-30.9,0],[280.0,21.0,-50.0,0],[280.0,23.0,-74.5,0],[280.0,25.0,-99.0,0],[276.6,24.5,-116.2,0],[266.8,24.0,-130.8,0],[252.2,23.5,-140.6,0],[235.0,23.0,-144.0,0],[218.0,23.0,-151.0,0],[211.0,23.0,-168.0,0],[218.0,23.0,-185.0,0],[235.0,23.0,-192.0,0],[265.0,23.0,-192.0,0],[282.0,23.0,-199.0,0],[289.0,23.0,-216.0,0],[282.0,23.0,-233.0,0],[265.0,23.0,-240.0,0],[235.0,23.0,-240.0,0],[227.7,23.0,-240.7,0],[220.7,23.0,-242.9,0],[214.4,23.0,-246.5,0],[201.0,23.0,-252.3,0],[186.4,23.0,-252.3,0],[173.1,23.0,-246.5,0],[166.7,23.0,-242.9,0],[159.7,23.0,-240.7,0],[152.4,23.0,-240.0,0],[123.5,25.4,-240.0,0],[94.6,27.9,-240.0,0],[65.7,30.3,-240.0,0],[36.7,32.7,-240.0,0],[7.8,35.1,-240.0,0],[-21.1,37.6,-240.0,0],[-50.0,40.0,-240.0,0],[-68.9,41.9,-235.3,0],[-83.3,43.8,-222.2,0],[-89.8,45.6,-203.9,0],[-87.0,47.5,-184.7,0],[-75.4,49.4,-169.1,0],[-57.8,51.2,-160.8,0],[-38.4,53.1,-161.7,0],[-21.7,55.0,-171.7,0],[-11.7,56.9,-188.4,0],[-10.8,58.8,-207.8,0],[-19.1,60.6,-225.4,0],[-34.7,62.5,-237.0,0],[-53.9,64.4,-239.8,0],[-72.2,66.2,-233.3,0],[-85.3,68.1,-218.9,0],[-90.0,70.0,-200.0,0],[-90.0,64.0,-170.0,0],[-90.0,58.0,-140.0,0],[-90.0,52.0,-110.0,0],[-90.0,46.0,-80.0,0],[-90.0,40.0,-50.0,0],[-86.2,40.0,-30.9,0],[-75.4,40.0,-14.6,0],[-59.1,40.0,-3.8,0],[-40.0,40.0,-0.0,0]];
  var ROAD = 16;
  // start 0-0.169, Sweeper 0.169-0.34, Jump 0.34-0.463, S 0.463-0.566, Dive 0.566-0.698, Hairpin 0.698-0.758,
  // Climb 0.758-0.795, Kink 0.795-0.857, Home 0.857-0.942, run-in 0.942-1

  // the course: the walls stand only round the Hairpin and on the outside of the Sweeper and the Home bend; everywhere
  // else the road is open to space (gaps with no water: a void). A big ramp throws you over the gap on the Jump
  // straight (miss it and you fall); a lip and a gap on the Dive that every kart flies (clear); rails up the Climb;
  // rollers through the S; pads on the straights; crates; a meteor shower on the Dive, a candle that topples at the
  // Sweeper's exit, a rolling coin on the Kink
  var COURSE = {
    shoulder: 0.6,
    pads: [{ at: 0.03, x: -3 }, { at: 0.03, x: 3 }, { at: 0.21, x: 0 }, { at: 0.42, x: -3 }, { at: 0.5, x: 3 }, { at: 0.72, x: -4 }, { at: 0.8, x: -4 }, { at: 0.95, x: 0 }],
    // the Daybreak Drop: a big ramp at the lip and a gap the flight carries you over, a long fall to the bottom
    ramps: [{ at: 0.077, x: 0, width: 14, size: 'big', lift: 1.75 }, { at: 0.837, x: 0, width: 12, size: 'small', lift: 1.6 }],
    breaks: [{ from: 0.081, len: 14, clear: true }, { from: 0.841, len: 12, clear: true }, { from: 0.885, len: 10, clear: true }],
    breakLook: 'none',   // (no pit drawn: the gap in the glass shows the clouds below)
    bumps: [{ at: 0.5, size: 'roller', n: 4 }, { at: 0.882, size: 'lip' }],   // (lips only on straights: a lip in a bend throws the kart off the open edge)
    rails: [{ points: [[0.52, -5.5], [0.6, -5.5]] }, { points: [[0.52, 5.5], [0.6, 5.5]] }],
    // the walls: round the Sweeper's and Home's outsides, both sides of the Switchback, the Dream Tower's inside; open
    // to the sky everywhere else (a gap with no water is a void: fall, and the Claw puts you back)
    walls: { gaps: [
      { from: 0.974, to: 0.118, side: 'both', water: false },   // (the Drop's landing, 0.118 on, walled: a fast landing slid off it)
      { from: 0.152, to: 0.204, side: 'left', water: false },
      { from: 0.204, to: 0.283, side: 'left', water: false },   // (the Crest's outside walled: karts slid off its bend)
      { from: 0.403, to: 0.48, side: 'both', water: false },    // (the Whale Run walled through its rollers, 0.48 to 0.6)
      { from: 0.6, to: 0.822, side: 'right', water: false },
      { from: 0.822, to: 0.922, side: 'both', water: false },
    ] },
    airdrops: [{ at: 0.05, n: 5 }, { at: 0.22, n: 4 }, { at: 0.56, n: 5 }, { at: 0.7, n: 4 }, { at: 0.95, n: 5 }],
    gm: 'auto',
    air: { lift: 1.6, hang: 0.36 },
    hazards: [
      { kind: 'topple', at: 0.43, side: 'left', every: 9, model: false },
      { kind: 'topple', at: 0.465, side: 'right', every: 9, offset: 4.5, model: false },
      { kind: 'crossing', at: 0.343, every: 7 },
      { kind: 'crossing', at: 0.57, every: 8, offset: 3 },
      { kind: 'meteor', from: 0.83, to: 0.92, every: 5 },
    ],
  };


  /* -------------------------------------------------------- the friends -- */
  // the eight, from their traits (OpenSea, 3D Invisible Friends) and their renders. kart: the kart's paint; trim: its
  // second colour; the rest is what each one wears and carries. Names are the owner's to change
  var FRIENDS = [
    { id: 2211, name: 'Slime #2211', kart: '#2E7BFF', trim: '#F4F4F4', persona: 'ram', stats: { top: 1.03, accel: 0.95, handling: 1, mass: 1.1, drift: 1 },
      top: { kind: 'jacket', color: '#3F7FD8', inner: '#F3EEE4', collar: '#F3EEE4' }, sleeve: 'long', legs: '#B8B2E6', shoes: { kind: 'sneaker', color: '#5BBF4A', sole: '#F2F2F2', slime: true },
      hat: { kind: 'cap', color: '#F4F1EA', brim: '#E2453A', back: true }, eyes: { kind: 'shades' }, mouth: 'cigar', ear: 'pencil', props: ['candle'] },
    { id: 4958, name: 'Floaty #4958', kart: '#FF6FB5', trim: '#FFE14D', persona: 'block', stats: { top: 0.98, accel: 1.08, handling: 1.04, mass: 0.95, drift: 1.05 },
      top: { kind: 'hoodie', color: '#F2B9D8', hood: 'up', face: '#E35AA5' }, sleeve: 'long', legs: '#3E6FC9', shoes: { kind: 'boot', color: '#2F9A45', sole: '#1F6A2E' },
      eyes: { kind: 'nerd', color: '#1A1A1A' }, fanny: '#F7D23A', props: ['float', 'bucket', 'candle'] },
    { id: 3057, name: 'Bucket #3057', kart: '#7E5BEF', trim: '#E8E2D0', persona: 'draft', stats: { top: 1, accel: 1, handling: 1.08, mass: 0.95, drift: 1.1 },
      top: { kind: 'hoodie', color: '#C9C9CC', hood: 'down' }, sleeve: 'long', legs: '#3E9A4A', shoes: { kind: 'sneaker', color: '#8A2A2E', sole: '#F2F2F2' },
      hat: { kind: 'bucket', color: '#E9D8A6' }, eyes: { kind: 'rainbow' }, ear: 'buds', props: ['stick'] },
    { id: 3074, name: 'Moon #3074', kart: '#22C8F0', trim: '#FFFFFF', persona: 'risky', stats: { top: 1.04, accel: 0.96, handling: 0.96, mass: 1, drift: 1.12 },
      top: { kind: 'shirt', color: '#F1EEE6' }, sleeve: 'long', legs: '#3D63B8', shoes: { kind: 'flipflop', color: '#F28BB7' },
      hat: { kind: 'beanie', color: '#8EC3EA' }, eyes: { kind: 'vr' }, props: ['ball'] },
    { id: 2443, name: 'Wizard #2443', kart: '#FFC93C', trim: '#2E9A4A', persona: null, stats: { top: 0.99, accel: 1.06, handling: 1.02, mass: 0.9, drift: 1.04 },
      top: { kind: 'turtleneck', color: '#F4D23C' }, sleeve: 'long', legs: '#2F9A4A', shoes: { kind: 'slipper', color: '#27346E' },
      hat: { kind: 'helmet', color: '#3FAF55' }, eyes: { kind: 'nerd', color: '#F4F4F4' }, fanny: '#EDE3C8', props: ['board', 'wand'] },
    { id: 4915, name: 'Lab #4915', kart: '#22B45E', trim: '#FFFFFF', persona: 'bully', stats: { top: 1.02, accel: 0.94, handling: 0.98, mass: 1.25, drift: 0.96 },
      top: { kind: 'varsity', color: '#2E9A55', sleeves: '#F4F1EA' }, sleeve: 'long', legs: '#D8352F', shoes: { kind: 'sneaker', color: '#2F6FD8', sole: '#F2F2F2' },
      hat: { kind: 'headband', color: '#E2352F' }, mouth: 'bandana', fanny: '#3E9A4A', props: ['pack', 'flask', 'ball'] },
    { id: 4732, name: 'Fisher #4732', kart: '#FF3B30', trim: '#1D2A5C', persona: 'ram', stats: { top: 1.05, accel: 0.92, handling: 0.95, mass: 1.3, drift: 0.95 },
      top: { kind: 'coat', color: '#E0302B', under: '#22357A', tie: '#F2C230' }, sleeve: 'long', legs: '#D9A066', shoes: { kind: 'sneaker', color: '#3E8C5A', sole: '#E89AB8' },
      hat: { kind: 'beanie', color: '#8EC3EA' }, eyes: { kind: 'nerd', color: '#F4F4F4' }, mouth: 'stick', props: ['rod'] },
    { id: 4370, name: 'Captain #4370', kart: '#1E2A5A', trim: '#F2C230', persona: 'draft', stats: { top: 1.01, accel: 1.02, handling: 1.03, mass: 1.05, drift: 1.02 },
      top: { kind: 'vest', color: '#22284F', shirt: '#F3EEE4' }, sleeve: 'short', legs: '#F1EEE6', shoes: { kind: 'boot', color: '#D9A23A', sole: '#8A5A22' },
      hat: { kind: 'captain', color: '#F4F4F4' }, eyes: { kind: 'nerd', color: '#F4F4F4' }, mouth: 'stick', props: ['dizzy'] },
  ];

  /* ------------------------------------------------------- the modelling -- */
  // (21 Oct, the owner: "the entire experience should feel like a PIXAR movie") a toy studio's way: every form turned
  // (lathe) or swept (tube) from a smooth profile, finely divided so no silhouette facets; fabric with a velvet sheen,
  // vinyl with a soft clearcoat, glass with an iridescent film; arms that bend at the elbow and follow the wheel, a head
  // that lags on a spring, a body that squashes on landing and cheers on the podium. Each racer's still parts are merged
  // by material into a handful of draw calls (bake), the moving ones kept apart
  var T = null, MATS = {}, LOWQ = false;
  function cached(k, make) { if (!MATS[k]) MATS[k] = make(); return MATS[k]; }
  function lighter(c, k) { return new T.Color(c).lerp(new T.Color('#FFFFFF'), k); }
  function fabric(c) { return cached('fab|' + c, function () { return new T.MeshPhysicalMaterial({ color: c, roughness: 0.78, sheen: 1, sheenRoughness: 0.42, sheenColor: lighter(c, 0.55), clearcoat: 0 }); }); }
  function vinyl(c, o) {
    o = o || {};
    return cached('vin|' + c + '|' + (o.r != null ? o.r : 0.34) + '|' + (o.e || '') + '|' + (o.ei || '') + '|' + (o.m || 0) + '|' + (o.t || ''), function () {
      var m = new T.MeshPhysicalMaterial({ color: c, roughness: o.r != null ? o.r : 0.34, metalness: o.m || 0, clearcoat: o.cc != null ? o.cc : 0.7, clearcoatRoughness: 0.22 });
      if (o.e) { m.emissive = new T.Color(o.e); m.emissiveIntensity = o.ei || 1; }
      if (o.t) { m.transparent = true; m.opacity = o.t; }
      return m;
    });
  }
  function rubber(c) { return cached('rub|' + c, function () { return new T.MeshPhysicalMaterial({ color: c, roughness: 0.62, clearcoat: 0.15, clearcoatRoughness: 0.6 }); }); }
  function chrome(c) { return cached('chr|' + c, function () { return new T.MeshPhysicalMaterial({ color: c, roughness: 0.18, metalness: 0.9, clearcoat: 1, clearcoatRoughness: 0.1 }); }); }
  function light(c, k) { return cached('lit|' + c + '|' + k, function () { return new T.MeshBasicMaterial({ color: new T.Color(c).multiplyScalar(k), toneMapped: true }); }); }
  function glassOf(c) {
    return cached('glass|' + c, function () {
      return new T.MeshPhysicalMaterial({ color: c, roughness: 0.04, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03, iridescence: 1, iridescenceIOR: 1.33, iridescenceThicknessRange: [180, 640],
        emissive: c, emissiveIntensity: 0.12, transparent: true, opacity: 0.5, side: T.DoubleSide, depthWrite: false });
    });
  }
  // geometry, finely divided (a phone a step coarser)
  function SEG(n) { return LOWQ ? Math.max(8, Math.round(n * 0.6)) : n; }
  function put(parent, geo, m, x, y, z, rx, ry, rz, sx, sy, sz) {
    var o = new T.Mesh(geo, m); o.position.set(x || 0, y || 0, z || 0); o.rotation.set(rx || 0, ry || 0, rz || 0);
    if (sx != null) o.scale.set(sx, sy != null ? sy : sx, sz != null ? sz : sx);
    o.castShadow = true; o.receiveShadow = true; if (parent) parent.add(o); return o;
  }
  function ball(r) { return new T.SphereGeometry(r, SEG(40), SEG(28)); }
  function pill(r, len) { return new T.CapsuleGeometry(r, len, SEG(10), SEG(24)); }
  function ringG(r, t) { return new T.TorusGeometry(r, t, SEG(14), SEG(48)); }
  // a smooth solid of turning: a profile [[radius, height], ...] through Catmull-Rom, closed at its ends where the radius is 0
  function lathe(pro, n) {
    var pts = [], k, s;
    for (k = 0; k < pro.length - 1; k++) {
      var p0 = pro[Math.max(0, k - 1)], p1 = pro[k], p2 = pro[k + 1], p3 = pro[Math.min(pro.length - 1, k + 2)];
      for (s = 0; s < 6; s++) {
        var t = s / 6, t2 = t * t, t3 = t2 * t;
        var cr = function (a, b, c, d) { return 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3); };
        pts.push(new T.Vector2(Math.max(0, cr(p0[0], p1[0], p2[0], p3[0])), cr(p0[1], p1[1], p2[1], p3[1])));
      }
    }
    pts.push(new T.Vector2(pro[pro.length - 1][0], pro[pro.length - 1][1]));
    return new T.LatheGeometry(pts, SEG(n || 44));
  }
  // a swept tube through points, with round ends
  function tube(parent, pts, r, m) {
    var curve = new T.CatmullRomCurve3(pts.map(function (p) { return new T.Vector3(p[0], p[1], p[2]); }));
    put(parent, new T.TubeGeometry(curve, SEG(40), r, SEG(14), false), m);
    put(parent, ball(r), m, pts[0][0], pts[0][1], pts[0][2]); var e = pts[pts.length - 1]; put(parent, ball(r), m, e[0], e[1], e[2]);
  }
  // a rounded slab: a rounded rectangle extruded with a soft bevel
  function slab(w, d, h, r, bev) {
    var s = new T.Shape(), x = -w / 2, y = -d / 2;
    s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + d - r); s.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
    s.lineTo(x + r, y + d); s.quadraticCurveTo(x, y + d, x, y + d - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
    var g = new T.ExtrudeGeometry(s, { depth: Math.max(0.001, h - 2 * bev), bevelEnabled: true, bevelSize: bev, bevelThickness: bev, bevelSegments: SEG(5), curveSegments: SEG(12) });
    g.translate(0, 0, -(h - 2 * bev) / 2); g.rotateX(-Math.PI / 2); return g;
  }
  // a part that moves on its own: kept out of the bake
  function live(o) { o.userData.iwLive = true; return o; }
  // the bake: a group's still meshes merged by material into one mesh each (their places folded in), the moving parts
  // (iwLive) and anything under them left as they are
  function bake(group) {
    group.updateMatrixWorld(true);
    var inv = new T.Matrix4().copy(group.matrixWorld).invert(), buckets = {}, drop = [];
    (function walk(o) {
      for (var i = 0; i < o.children.length; i++) {
        var c = o.children[i]; if (c.userData.iwLive) continue;
        if (c.isMesh && !c.isInstancedMesh && !Array.isArray(c.material)) {
          var key = c.material.uuid, g = c.geometry.index ? c.geometry.toNonIndexed() : c.geometry.clone();
          g.applyMatrix4(new T.Matrix4().multiplyMatrices(inv, c.matrixWorld));
          if (!g.attributes.uv) g.setAttribute('uv', new T.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
          (buckets[key] = buckets[key] || { m: c.material, gs: [] }).gs.push(g); drop.push(c);
        }
        walk(c);
      }
    })(group);
    drop.forEach(function (c) { if (c.parent) c.parent.remove(c); });
    Object.keys(buckets).forEach(function (k) {
      var B = buckets[k], n = 0; B.gs.forEach(function (g) { n += g.attributes.position.count; });
      // (vertex colours carried through, white where a part has none: a whale's back and belly, the tower's bands)
      var hasC = B.gs.some(function (g) { return !!g.attributes.color; });
      var P = new Float32Array(n * 3), N = new Float32Array(n * 3), U = new Float32Array(n * 2), Cc = hasC ? new Float32Array(n * 3).fill(1) : null, o = 0;
      B.gs.forEach(function (g) { P.set(g.attributes.position.array, o * 3); N.set(g.attributes.normal.array, o * 3); U.set(g.attributes.uv.array, o * 2); if (Cc && g.attributes.color && g.attributes.color.itemSize === 3) Cc.set(g.attributes.color.array, o * 3); o += g.attributes.position.count; g.dispose(); });
      var G = new T.BufferGeometry(); G.setAttribute('position', new T.BufferAttribute(P, 3)); G.setAttribute('normal', new T.BufferAttribute(N, 3)); G.setAttribute('uv', new T.BufferAttribute(U, 2)); if (Cc) G.setAttribute('color', new T.BufferAttribute(Cc, 3));
      var m = new T.Mesh(G, B.m); m.castShadow = !B.m.transparent; m.receiveShadow = true; group.add(m);
    });
  }

  // ---- the glove: a plump cartoon glove, four fingers curled round the wheel, a thumb on top, a rolled cuff
  function glove(side) {
    var g = new T.Group(), w = vinyl('#ECE8E2', { r: 0.55, cc: 0.3 });
    put(g, ball(0.075), w, 0, 0, 0, 0, 0, 0, 1.12, 0.92, 0.95);
    for (var i = 0; i < 4; i++) {
      var x = -0.05 + i * 0.033, fl = 0.034 - (i === 0 || i === 3 ? 0.006 : 0);
      tube(g, [[x, 0.015, 0.05], [x, 0.03, 0.095], [x, -0.005, 0.125], [x, -0.04, 0.105]], fl * 0.62, w);
    }
    tube(g, [[side * 0.06, 0.02, 0.0], [side * 0.085, 0.05, 0.05], [side * 0.06, 0.055, 0.085]], 0.024, w);
    put(g, lathe([[0.06, -0.02], [0.078, 0], [0.084, 0.03], [0.07, 0.05], [0.058, 0.045]], 32), w, 0, 0, -0.065, Math.PI / 2, 0, 0);
    return g;
  }
  // ---- the shoes: chunky, round-toed, a fat sole, laces on a sneaker, a shaft on a boot, a strap on a flip-flop
  function shoe(o, side) {
    var g = new T.Group(), up = vinyl(o.color, { r: 0.42, cc: 0.4 }), sole = rubber(o.sole || '#F2F2EE');
    if (o.kind === 'flipflop') {
      put(g, slab(0.16, 0.32, 0.04, 0.07, 0.012), rubber(o.color), 0, 0.02, 0.03);
      tube(g, [[-0.05, 0.04, 0.02], [0, 0.07, 0.1], [0.05, 0.04, 0.02]], 0.011, vinyl('#F7F3EA'));
      put(g, ball(0.02), vinyl('#F7F3EA'), 0, 0.06, 0.1);
      return g;
    }
    var tall = o.kind === 'boot' ? 0.16 : o.kind === 'slipper' ? 0.05 : 0.1;
    put(g, slab(0.2, 0.36, 0.06, 0.09, 0.02), sole, 0, 0.03, 0.035);
    put(g, ball(0.1), up, 0, 0.07 + tall * 0.25, 0.07, 0, 0, 0, 1, 0.8 + tall, 1.45);
    if (o.kind === 'boot') put(g, lathe([[0, 0], [0.085, 0.01], [0.09, 0.12], [0.085, 0.24], [0, 0.245]], 36), up, 0, 0.06, -0.035);
    if (o.kind === 'sneaker') {
      put(g, lathe([[0.075, 0], [0.085, 0.03], [0.07, 0.06]], 32), vinyl('#FFFFFF', { r: 0.5 }), 0, 0.15, -0.03, 0.25, 0, 0);
      for (var l = 0; l < 3; l++) put(g, pill(0.008, 0.07), vinyl('#FFFFFF', { r: 0.5 }), 0, 0.165 - l * 0.012, 0.03 + l * 0.04, 0, 0, Math.PI / 2);
      put(g, ball(0.05), vinyl('#FFFFFF', { r: 0.4 }), 0, 0.075, 0.2, 0, 0, 0, 1.3, 0.55, 0.7);   // the toe cap
    }
    if (o.slime) { var sl = vinyl('#9BE34A', { r: 0.15, cc: 1 }); put(g, ball(0.045), sl, side * 0.07, 0.14, 0.12, 0, 0, 0, 1, 0.55, 1.2); put(g, ball(0.03), sl, -side * 0.05, 0.17, 0.0, 0, 0, 0, 1, 0.5, 1); put(g, pill(0.012, 0.05), sl, side * 0.09, 0.1, 0.13); }
    return g;
  }

  // ---- the head's things: nobody's head, its hat, its glasses, its mouth's and ear's things. y 0 is the head's middle
  function head(F) {
    var g = new T.Group(), H = F.hat || {}, E = F.eyes || {};
    if (F.top.hood === 'up') {
      var hm = fabric(F.top.color);
      put(g, lathe([[0.0, 0.25], [0.12, 0.23], [0.2, 0.15], [0.23, 0.0], [0.21, -0.12], [0.16, -0.19]], 48), hm, 0, -0.01, -0.03, -0.25, 0, 0, 1, 1, 1.05);
      put(g, ball(0.16), vinyl(F.top.face, { r: 0.6, cc: 0.2 }), 0, -0.02, 0.06, 0, 0, 0, 0.95, 1.08, 0.55);
      put(g, ringG(0.15, 0.03), hm, 0, -0.02, 0.1, 0, 0, 0, 1, 1.12, 1);
    }
    if (H.kind === 'cap') {
      var cm = fabric(H.color);
      put(g, lathe([[0, 0.2], [0.09, 0.19], [0.155, 0.13], [0.18, 0.04], [0.18, 0.0]], 48), cm, 0, 0.05, 0);
      put(g, ball(0.02), cm, 0, 0.255, 0);
      var brim = put(g, slab(0.22, 0.17, 0.022, 0.08, 0.008), vinyl(H.brim, { r: 0.5 }), 0, 0.07, H.back ? -0.2 : 0.2, H.back ? 0.12 : -0.12, 0, 0);
      put(g, slab(0.08, 0.05, 0.012, 0.02, 0.004), vinyl('#3A6FD8'), 0, 0.17, 0.155, -0.9, 0, 0);
    } else if (H.kind === 'bucket') {
      put(g, lathe([[0, 0.2], [0.11, 0.19], [0.15, 0.13], [0.165, 0.04], [0.2, 0.0], [0.27, -0.04], [0.28, -0.05]], 48), fabric(H.color), 0, 0.05, 0);
      put(g, ringG(0.165, 0.012), fabric('#C9B67E'), 0, 0.08, 0, Math.PI / 2, 0, 0);
    } else if (H.kind === 'beanie') {
      var bm = fabric(H.color);
      put(g, lathe([[0, 0.25], [0.1, 0.235], [0.16, 0.17], [0.18, 0.06], [0.18, 0.0]], 48), bm, 0, 0.03, 0);
      put(g, ringG(0.178, 0.04), bm, 0, 0.05, 0, Math.PI / 2, 0, 0);
    } else if (H.kind === 'helmet') {
      var hel = vinyl(H.color, { r: 0.18, cc: 1 });
      put(g, ball(0.19), hel, 0, 0.04, -0.01, 0, 0, 0, 1, 1.02, 1.08);
      put(g, pill(0.022, 0.32), vinyl('#FFFFFF', { r: 0.3 }), 0, 0.2, -0.02, Math.PI / 2, 0, 0);
      var cage = chrome('#E8E8EC');
      tube(g, [[-0.16, -0.02, 0.15], [0, -0.03, 0.24], [0.16, -0.02, 0.15]], 0.012, cage);
      tube(g, [[-0.15, -0.09, 0.13], [0, -0.1, 0.22], [0.15, -0.09, 0.13]], 0.012, cage);
      tube(g, [[0, 0.02, 0.2], [0, -0.1, 0.22]], 0.012, cage);
      put(g, ball(0.12), vinyl('#5A3A26', { r: 0.6, cc: 0.1 }), 0, -0.04, 0.08, 0, 0, 0, 1, 1, 0.45);
    } else if (H.kind === 'headband') {
      put(g, ringG(0.17, 0.045), fabric(H.color), 0, 0.08, 0, Math.PI / 2, 0, 0, 1, 1, 0.7);
      put(g, lathe([[0, 0.2], [0.1, 0.19], [0.155, 0.13], [0.17, 0.06]], 40), fabric(H.color), 0, 0.03, 0);
    } else if (H.kind === 'captain') {
      var wt = fabric(H.color), bl = vinyl('#141418', { r: 0.2, cc: 1 });
      put(g, lathe([[0, 0.2], [0.17, 0.2], [0.23, 0.18], [0.22, 0.15], [0.16, 0.1], [0.155, 0.04]], 48), wt, 0, 0.06, 0);
      put(g, lathe([[0.15, 0], [0.16, 0.02], [0.16, 0.06], [0.15, 0.065]], 44), bl, 0, 0.05, 0);
      put(g, slab(0.22, 0.12, 0.018, 0.06, 0.006), bl, 0, 0.065, 0.17, -0.3, 0, 0);
      put(g, ball(0.035), chrome('#F2C230'), 0, 0.16, 0.17, 0, 0, 0, 1, 1, 0.4);
      tube(g, [[-0.15, 0.09, 0.08], [0, 0.1, 0.17], [0.15, 0.09, 0.08]], 0.008, chrome('#F2C230'));
    }
    // the eyes: frames swept round their lenses, glass that catches the light
    var fr = vinyl(E.color || '#151515', { r: 0.25, cc: 0.9 });
    function frame(x, rx, ry, m) { var pts = []; for (var k = 0; k <= 24; k++) { var a = k / 24 * Math.PI * 2; pts.push([x + Math.cos(a) * rx, Math.sin(a) * ry, 0.175 + 0.01 * Math.cos(a)]); } tube(g, pts, 0.013, m); }
    if (E.kind === 'shades') {
      [-1, 1].forEach(function (s) { put(g, ball(0.068), vinyl('#0B0B10', { r: 0.05, cc: 1 }), s * 0.078, -0.005, 0.175, 0, 0, 0, 1.2, 0.85, 0.3); frame(s * 0.078, 0.082, 0.058, fr); });
      tube(g, [[-0.012, 0.01, 0.185], [0.012, 0.01, 0.185]], 0.012, fr);
    } else if (E.kind === 'nerd') {
      [-1, 1].forEach(function (s) { frame(s * 0.078, 0.064, 0.058, fr); put(g, ball(0.062), vinyl('#E8F4FF', { r: 0.02, cc: 1, t: 0.28 }), s * 0.078, 0, 0.172, 0, 0, 0, 1, 0.95, 0.18); });
      tube(g, [[-0.015, 0.012, 0.18], [0, 0.02, 0.185], [0.015, 0.012, 0.18]], 0.012, fr);
    } else if (E.kind === 'rainbow') {
      var cols = ['#FF4A5C', '#FF9A3A', '#FFE24A', '#4ADB7A', '#3A9BFF', '#9A5BFF'];
      [-1, 1].forEach(function (s) { frame(s * 0.08, 0.07, 0.07, vinyl('#F6F6F2')); for (var c = 0; c < cols.length; c++) put(g, ringG(0.058 - c * 0.0095, 0.0052), light(cols[c], 1.1), s * 0.08, 0, 0.176); });
      tube(g, [[-0.012, 0.01, 0.185], [0.012, 0.01, 0.185]], 0.012, vinyl('#F6F6F2'));
    } else if (E.kind === 'vr') {
      put(g, slab(0.3, 0.12, 0.1, 0.045, 0.02), vinyl('#F6F6F4', { r: 0.25, cc: 1 }), 0, -0.05, 0.13, Math.PI / 2, 0, 0);
      put(g, slab(0.2, 0.04, 0.012, 0.018, 0.005), light('#FF4A3A', 1.6), 0, 0.0, 0.185, Math.PI / 2, 0, 0);
      put(g, ringG(0.2, 0.014), fabric('#3A3A44'), 0, 0, 0.02, Math.PI / 2, 0, 0, 1, 1, 0.9);
      // its screen, floating beside it with the moon and a target on it
      var scr = live(new T.Group()); scr.position.set(0.44, 0.1, 0.04); scr.rotation.y = -0.45; g.add(scr);
      put(scr, slab(0.3, 0.3, 0.02, 0.05, 0.008), vinyl('#F2F8FF', { r: 0.05, cc: 1, t: 0.72 }), 0, 0, 0, Math.PI / 2, 0, 0);
      put(scr, ringG(0.05, 0.009), light('#FF3A2A', 1.4), -0.03, 0.03, 0.015); put(scr, ball(0.012), light('#FF3A2A', 1.6), -0.03, 0.03, 0.015);
      put(scr, ball(0.05), vinyl('#9ED8C8', { r: 0.4 }), 0.07, -0.07, 0.012, 0, 0, 0, 1, 1, 0.2);
    }
    // the mouth
    if (F.mouth === 'cigar') { put(g, pill(0.021, 0.12), vinyl('#7A4A2A', { r: 0.7, cc: 0.1 }), 0.04, -0.13, 0.22, Math.PI / 2 - 0.25, 0, 0.1); put(g, ball(0.021), light('#FF6A20', 2.4), 0.046, -0.16, 0.29); put(g, ringG(0.022, 0.006), vinyl('#C8A14A'), 0.042, -0.14, 0.255, -0.25, 0, 0); }
    if (F.mouth === 'stick') { put(g, pill(0.011, 0.12), vinyl('#F7F3EA', { r: 0.5 }), 0.05, -0.13, 0.22, Math.PI / 2 - 0.2, 0, -0.35); put(g, ball(0.013), light('#FF5A30', 1.8), 0.075, -0.15, 0.285); }
    if (F.mouth === 'bandana') {
      var bdm = fabric('#E2352F');
      put(g, lathe([[0.0, -0.2], [0.07, -0.17], [0.15, -0.09], [0.185, -0.02], [0.19, 0.0]], 44), bdm, 0, 0, 0.0, 0, 0, 0, 1, 1, 1.05);
      put(g, ball(0.035), bdm, 0, -0.03, -0.18);
      for (var dt = 0; dt < 7; dt++) put(g, ball(0.01), vinyl('#FFFFFF'), Math.cos(dt) * 0.13, -0.07 - (dt % 3) * 0.03, 0.12 + 0.02 * Math.sin(dt * 2), 0, 0, 0, 1, 1, 0.4);
    }
    if (F.ear === 'pencil') {
      var pc = new T.Group(); pc.position.set(0.18, 0.04, 0.02); pc.rotation.set(0, 0, 1.25); g.add(pc);
      put(pc, new T.CylinderGeometry(0.014, 0.014, 0.17, 6), vinyl('#F4C430', { r: 0.4 }), 0, 0, 0);
      put(pc, new T.ConeGeometry(0.014, 0.04, 6), vinyl('#E9D2A6', { r: 0.7 }), 0, 0.105, 0);
      put(pc, pill(0.015, 0.012), vinyl('#F08AA0', { r: 0.6 }), 0, -0.095, 0);
    }
    if (F.ear === 'buds') { [-1, 1].forEach(function (s) { put(g, ball(0.028), vinyl('#FBFBFB', { cc: 1 }), s * 0.19, -0.03, 0.03); tube(g, [[s * 0.19, -0.05, 0.03], [s * 0.17, -0.18, 0.02], [0, -0.3, 0.05]], 0.004, vinyl('#FBFBFB')); }); }
    return g;
  }

  // ---- the body: what is worn, round nobody. y 0 is the hips; the collar is open (there is no one inside)
  function torso(F) {
    var g = new T.Group(), O = F.top, c = fabric(O.color), inside = fabric(new T.Color(O.color).multiplyScalar(0.55).getStyle());
    var wide = O.kind === 'shirt' ? 1.08 : 1;
    // the garment: a soft barrel from the hem to the shoulders, curling in to an open collar
    var pro = [[0, -0.02], [0.2, -0.01], [0.245, 0.06], [0.262, 0.2], [0.25, 0.34], [0.2, 0.43], [0.13, 0.475], [0.11, 0.48]];
    if (O.kind === 'coat') pro = [[0, -0.16], [0.3, -0.15], [0.29, 0.0], [0.27, 0.18], [0.26, 0.34], [0.2, 0.43], [0.13, 0.475], [0.11, 0.48]];
    put(g, lathe(pro, 48), c, 0, 0, 0, 0, 0, 0, wide, 1, 0.86);
    // the inside of the collar, darker: you look into the empty clothes
    put(g, lathe([[0.105, 0.48], [0.1, 0.4], [0.06, 0.3], [0, 0.28]], 36), inside, 0, 0, 0, 0, 0, 0, 1, 1, 0.86);
    var collarC = O.kind === 'jacket' ? O.collar : O.kind === 'vest' ? O.shirt : O.color;
    put(g, ringG(0.112, O.kind === 'turtleneck' ? 0.045 : 0.026), fabric(collarC), 0, 0.48, 0, Math.PI / 2, 0, 0, 1, 0.86, 1);
    if (O.kind === 'turtleneck') { put(g, lathe([[0.12, 0.47], [0.125, 0.53], [0.118, 0.6], [0.11, 0.62]], 40), c, 0, 0, 0, 0, 0, 0, 1, 1, 0.86); put(g, ringG(0.115, 0.03), c, 0, 0.6, 0, Math.PI / 2, 0, 0, 1, 0.86, 1); }
    // the hem
    put(g, ringG(0.2, 0.022), c, 0, -0.005, 0, Math.PI / 2, 0, 0, wide, 0.86, 1);
    if (O.kind === 'jacket') {
      // open down the front: the shirt inside, the lapels folded back, a zip
      put(g, slab(0.12, 0.012, 0.36, 0.03, 0.004), fabric(O.inner), 0, 0.24, 0.222, Math.PI / 2, 0, 0);
      [-1, 1].forEach(function (s) { put(g, pill(0.03, 0.16), fabric(O.collar), s * 0.075, 0.38, 0.19, 0.5, 0, s * 0.45); });
      put(g, pill(0.008, 0.32), chrome('#D8D8DC'), 0.07, 0.22, 0.222);
    }
    if (O.kind === 'hoodie') {
      put(g, slab(0.26, 0.02, 0.12, 0.05, 0.01), c, 0, 0.12, 0.215, Math.PI / 2 - 0.05, 0, 0);
      [-1, 1].forEach(function (s) { tube(g, [[s * 0.05, 0.45, 0.17], [s * 0.055, 0.36, 0.215], [s * 0.06, 0.28, 0.222]], 0.007, vinyl('#FFFFFF', { r: 0.5 })); put(g, pill(0.011, 0.02), vinyl('#F0F0F0'), s * 0.06, 0.26, 0.225); });
      if (O.hood === 'down') put(g, lathe([[0, 0.0], [0.13, 0.03], [0.17, 0.1], [0.14, 0.16], [0, 0.17]], 40), c, 0, 0.42, -0.16, -0.5, 0, 0, 1.05, 0.8, 0.85);
    }
    if (O.kind === 'varsity') {
      put(g, ringG(0.245, 0.025), fabric('#F4F1EA'), 0, 0.03, 0, Math.PI / 2, 0, 0, 1, 0.86, 1);
      for (var b = 0; b < 4; b++) put(g, ball(0.016), vinyl('#F4F1EA'), 0, 0.12 + b * 0.08, 0.226);
      put(g, slab(0.1, 0.01, 0.09, 0.02, 0.003), fabric('#F4F1EA'), -0.12, 0.3, 0.205, Math.PI / 2, 0.45, 0);
    }
    if (O.kind === 'coat') {
      put(g, slab(0.11, 0.012, 0.36, 0.03, 0.004), fabric(O.under), 0, 0.25, 0.222, Math.PI / 2, 0, 0);
      put(g, lathe([[0, 0.0], [0.03, 0.02], [0.022, 0.2], [0, 0.24]], 12), fabric(O.tie), 0, 0.16, 0.232, 0, 0, 0, 1, 1, 0.3);
      [-1, 1].forEach(function (s) { put(g, pill(0.035, 0.2), c, s * 0.085, 0.33, 0.2, 0.35, 0, s * 0.35); });
      [0.15, 0.06].forEach(function (y) { put(g, ball(0.018), vinyl('#F2C230', { m: 0.5 }), 0.17, y, 0.225); });
    }
    if (O.kind === 'vest') {
      put(g, lathe([[0, 0.22], [0.07, 0.3], [0.095, 0.42]], 12), fabric(O.shirt), 0, 0.03, 0.17, 0, 0, 0, 1, 1, 0.5);
      put(g, ringG(0.245, 0.022), fabric('#F4F4F4'), 0, 0.05, 0, Math.PI / 2, 0, 0, 1, 0.86, 1);
      tube(g, [[-0.12, 0.43, 0.15], [0, 0.26, 0.225], [0.12, 0.43, 0.15]], 0.012, fabric('#F4F4F4'));
    }
    if (F.fanny) {
      var fm = fabric(F.fanny);
      put(g, slab(0.24, 0.08, 0.1, 0.035, 0.02), fm, 0.0, 0.04, 0.235, Math.PI / 2 - 0.15, 0, 0);
      put(g, pill(0.006, 0.18), chrome('#D0D0D0'), 0, 0.08, 0.275, 0, 0, Math.PI / 2);
      put(g, ringG(0.255, 0.012), rubber('#26262A'), 0, 0.05, 0, Math.PI / 2, 0, 0, 1, 0.86, 1);
    }
    return g;
  }

  // ---- the props, set about the kart and the driver; the ones that move are live
  function props(F, kartG, drv, liveFns) {
    F.props.forEach(function (p) {
      if (p === 'candle') {
        var cd = new T.Group(); cd.position.set(F.props.length > 2 ? -0.42 : 0.44, 0.6, 0.62); kartG.add(cd);
        put(cd, lathe([[0, 0], [0.07, 0.005], [0.075, 0.02], [0.03, 0.03], [0.028, 0.04]], 32), chrome('#E9C46A'), 0, 0, 0);
        put(cd, lathe([[0, 0.03], [0.027, 0.032], [0.026, 0.13], [0.02, 0.145], [0, 0.146]], 28), vinyl('#FBF6EC', { r: 0.6 }), 0, 0, 0);
        var fl = live(put(cd, ball(0.022), light('#FFB43A', 2.6), 0, 0.18, 0, 0, 0, 0, 1, 1.8, 1));
        liveFns.push(function (t) { fl.scale.set(1 + 0.15 * Math.sin(t * 31), 1.8 + 0.4 * Math.sin(t * 23), 1); });
      } else if (p === 'float') {
        var ym = vinyl('#FFD43A', { r: 0.16, cc: 1 });
        put(drv, ringG(0.31, 0.1), ym, 0, 0.05, 0, Math.PI / 2, 0, 0, 1, 0.86, 1);
        var dk = new T.Group(); dk.position.set(0.24, 0.16, 0.2); drv.add(dk);
        put(dk, ball(0.1), ym, 0, 0, 0); put(dk, ball(0.035), vinyl('#F28A2A'), 0, -0.01, 0.1, 0, 0, 0, 1.3, 0.55, 1.2);
        [-1, 1].forEach(function (s) { put(dk, ball(0.016), vinyl('#141414', { r: 0.1 }), s * 0.04, 0.03, 0.085); });
      } else if (p === 'bucket') {
        var bk = new T.Group(); bk.position.set(-0.64, 0.46, -0.32); kartG.add(bk);
        put(bk, lathe([[0, -0.09], [0.08, -0.09], [0.11, 0.09], [0.115, 0.095]], 32), vinyl('#F4F4F4', { r: 0.4 }), 0, 0, 0);
        put(bk, ringG(0.11, 0.01), vinyl('#E2453A'), 0, 0.085, 0, Math.PI / 2, 0, 0);
        tube(bk, [[-0.1, 0.09, 0], [0, 0.2, 0], [0.1, 0.09, 0]], 0.008, vinyl('#E2453A'));
        put(bk, ball(0.05), vinyl('#E2453A'), 0.02, 0.1, 0.02, 0, 0, 0, 1, 0.8, 1);
      } else if (p === 'stick') {
        tube(kartG, [[0.36, 0.42, -0.72], [0.48, 1.0, -0.82], [0.6, 1.6, -0.92]], 0.022, vinyl('#A86E3C', { r: 0.6 }));
        put(kartG, ball(0.045), rubber('#2A2A2A'), 0.36, 0.4, -0.72);
        put(kartG, pill(0.03, 0.08), rubber('#E2453A'), 0.6, 1.62, -0.92);
      } else if (p === 'ball') {
        var bb = live(new T.Group()); bb.position.set(F.props.indexOf('ball') === 0 ? 0 : 0.42, 0.82, -1.0); kartG.add(bb);
        put(bb, ball(0.16), rubber('#E57A2E'), 0, 0, 0);
        [0, 1, 2].forEach(function (k) { put(bb, ringG(0.161, 0.005), rubber('#3A1E10'), 0, 0, 0, k === 2 ? Math.PI / 2 : 0, k * Math.PI / 2, 0); });
        liveFns.push(function (t, dt, s) { bb.rotation.x += dt * (2 + (s.speed || 0) * 0.4); });
      } else if (p === 'board') {
        var sk = new T.Group(); sk.position.set(0, 0.92, -1.06); sk.rotation.x = -1.3; kartG.add(sk);
        put(sk, slab(0.22, 0.8, 0.025, 0.1, 0.008), vinyl('#F4E1C1', { r: 0.5 }), 0, 0, 0);
        put(sk, slab(0.2, 0.7, 0.004, 0.09, 0.001), vinyl('#E2453A', { r: 0.5 }), 0, 0.016, 0);
        [-0.27, 0.27].forEach(function (z) { [-1, 1].forEach(function (s) { put(sk, new T.CylinderGeometry(0.035, 0.035, 0.03, 24), rubber('#F7E04A'), s * 0.085, -0.04, z, 0, 0, Math.PI / 2); }); });
      } else if (p === 'wand') {
        tube(kartG, [[0.56, 0.45, -0.88], [0.6, 1.0, -0.95], [0.63, 1.5, -1.0]], 0.013, vinyl('#151515'));
        var star = live(new T.Mesh(STAR_G(), light('#FFE86A', 2.2))); star.position.set(0.63, 1.58, -1.0); star.scale.setScalar(0.09); kartG.add(star);
        liveFns.push(function (t) { star.rotation.y = t * 3; });
      } else if (p === 'pack') {
        var pk = new T.Group(); pk.position.set(0, 0.26, -0.25); drv.add(pk);
        put(pk, slab(0.36, 0.18, 0.42, 0.07, 0.03), fabric('#4D8A55'), 0, 0, 0, Math.PI / 2, 0, 0);
        put(pk, pill(0.075, 0.32), fabric('#E8913A'), 0, 0.27, -0.02, 0, 0, Math.PI / 2);
        put(pk, pill(0.045, 0.12), vinyl('#E85AB0'), 0.21, 0.08, 0);
      } else if (p === 'flask') {
        var fk = new T.Group(); fk.position.set(-0.44, 0.62, 0.62); kartG.add(fk);
        put(fk, lathe([[0, -0.08], [0.09, -0.075], [0.11, -0.02], [0.08, 0.05], [0.03, 0.08], [0.028, 0.15]], 36), vinyl('#E8F6EE', { r: 0.03, cc: 1, t: 0.4 }), 0, 0, 0);
        put(fk, lathe([[0, -0.075], [0.085, -0.07], [0.1, -0.02], [0.075, 0.03], [0, 0.03]], 32), light('#7BEA4A', 1.15), 0, 0, 0);
        put(fk, pill(0.03, 0.02), vinyl('#B87A4A', { r: 0.7 }), 0, 0.17, 0);
      } else if (p === 'rod') {
        tube(kartG, [[0.26, 0.74, 0.08], [0.22, 1.1, 0.8], [0.15, 1.38, 1.62]], 0.016, vinyl('#B87A3A', { r: 0.5 }));
        put(kartG, new T.CylinderGeometry(0.05, 0.05, 0.04, 24), chrome('#C8C8CC'), 0.28, 0.8, 0.18, 0, 0, Math.PI / 2);
        var hang = live(new T.Group()); hang.position.set(0.15, 1.38, 1.62); kartG.add(hang);
        put(hang, new T.CylinderGeometry(0.003, 0.003, 0.42, 6), vinyl('#F4F4F4'), 0, -0.21, 0);
        var fish = new T.Group(); fish.position.set(0, -0.5, 0); hang.add(fish);
        var fm = vinyl('#4ACFC6', { r: 0.3, cc: 0.9 });
        put(fish, ball(0.13), fm, 0, 0, 0, 0, 0, 0, 0.9, 1, 1.3);
        put(fish, lathe([[0, 0], [0.09, 0.06], [0.11, 0.13], [0, 0.11]], 24), fm, 0, 0, -0.17, -Math.PI / 2, 0, 0, 1, 1, 0.35);
        put(fish, ball(0.04), vinyl('#FFFFFF', { r: 0.1 }), 0.075, 0.04, 0.1); put(fish, ball(0.022), vinyl('#141414', { r: 0.1 }), 0.095, 0.045, 0.12);
        put(fish, ball(0.05), vinyl('#F27AB0'), 0, 0.12, 0, 0, 0, 0, 1.4, 0.5, 1);
        liveFns.push(function (t, dt, s) { hang.rotation.x = -0.3 * Math.min(1, (s.speed || 0) / 30) + 0.12 * Math.sin(t * 5.3); hang.rotation.z = -(s.steer || 0) * 0.45 + 0.08 * Math.sin(t * 4.1); fish.rotation.y = 0.3 * Math.sin(t * 3); });
      } else if (p === 'dizzy') {
        var halo = live(new T.Group()); halo.position.set(0, 1.72, -0.16); kartG.add(halo);
        for (var i = 0; i < 5; i++) { var sp = new T.Mesh(STAR_G(), light('#FFE14D', 2)); sp.position.set(Math.cos(i * 1.256) * 0.24, 0, Math.sin(i * 1.256) * 0.24); sp.scale.setScalar(0.055); halo.add(sp); }
        put(halo, ringG(0.24, 0.006), light('#FFFFFF', 1.2), 0, 0, 0, Math.PI / 2, 0, 0);
        liveFns.push(function (t) { halo.rotation.y = t * 2.2; halo.position.y = 1.72 + 0.03 * Math.sin(t * 3); });
      }
    });
  }
  var STAR_GEO = null;
  function STAR_G() {
    if (STAR_GEO) return STAR_GEO;
    var sh = new T.Shape(); for (var k = 0; k < 10; k++) { var a = k / 10 * Math.PI * 2 + Math.PI / 2, r = k % 2 ? 0.45 : 1; if (k) sh.lineTo(Math.cos(a) * r, Math.sin(a) * r); else sh.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
    STAR_GEO = new T.ExtrudeGeometry(sh, { depth: 0.35, bevelEnabled: true, bevelSize: 0.12, bevelThickness: 0.12, bevelSegments: 3 }); STAR_GEO.center();
    return STAR_GEO;
  }

  // ---- the kart: a bubble of tinted glass on a pearl chassis, soft side pods, fat round tyres, twin thrusters behind
  var GLOW_TEX = null;
  function glowTex(ctx) {
    if (GLOW_TEX) return GLOW_TEX;
    GLOW_TEX = ctx.textures.canvas(128, 128, function (g, W, H) { var rg = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W / 2); rg.addColorStop(0, 'rgba(255,255,255,0.9)'); rg.addColorStop(0.5, 'rgba(255,255,255,0.35)'); rg.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = rg; g.fillRect(0, 0, W, H); });
    return GLOW_TEX;
  }
  function kart(F, liveFns) {
    var g = new T.Group(), gl = glassOf(F.kart), pearl = vinyl('#DCD6E2', { r: 0.25, cc: 1 }), trim = vinyl(F.trim, { r: 0.25, cc: 1 }), tl = light(F.trim, 0.85);
    // the chassis: a rounded pearl slab, a soft nose bumper, a tail
    put(g, slab(1.05, 2.1, 0.12, 0.42, 0.05), pearl, 0, 0.27, 0.05);
    put(g, pill(0.11, 0.86), trim, 0, 0.3, 1.13, 0, 0, Math.PI / 2);
    // the bubble: the lower half of a glass egg, open on top, with a ring of light round its rim
    var bub = new T.SphereGeometry(1, SEG(56), SEG(30), 0, Math.PI * 2, Math.PI * 0.47, Math.PI * 0.53);
    put(g, bub, gl, 0, 0.62, 0.05, 0, 0, 0, 0.62, 0.36, 1.18);
    put(g, ringG(1, 0.022), tl, 0, 0.655, 0.05, Math.PI / 2, 0, 0, 0.62, 1.18, 1);
    // the nose: a glass dome over the front with the racer's number roundel behind it
    put(g, ball(0.3), gl, 0, 0.42, 0.95, 0, 0, 0, 1.15, 0.6, 1.0);
    put(g, new T.CylinderGeometry(0.13, 0.13, 0.02, SEG(36)), pearl, 0, 0.6, 0.98, 1.2, 0, 0);
    // the side pods: soft glass capsules on pearl rails
    [-1, 1].forEach(function (s) {
      put(g, pill(0.15, 0.82), gl, s * 0.6, 0.38, -0.02, Math.PI / 2, 0, 0);
      put(g, pill(0.05, 0.9), trim, s * 0.6, 0.27, -0.02, Math.PI / 2, 0, 0);
    });
    // the seat: a plump cushion and a back, in the trim colour
    put(g, slab(0.5, 0.42, 0.12, 0.14, 0.05), trim, 0, 0.46, -0.22);
    put(g, slab(0.5, 0.12, 0.26, 0.1, 0.04), trim, 0, 0.62, -0.46, -0.2, 0, 0);
    // the thrusters: two pearl cans behind, their glow live (it grows with the speed and the boost)
    var flames = live(new T.Group()); flames.position.set(0, 0.42, -1.2); g.add(flames);
    var fm = new T.MeshBasicMaterial({ color: new T.Color(F.kart).lerp(new T.Color('#FFFFFF'), 0.4).multiplyScalar(1.4), transparent: true, opacity: 0.4, depthWrite: false, blending: T.AdditiveBlending });
    [-0.28, 0.28].forEach(function (x) {
      put(g, lathe([[0, 0], [0.11, 0.0], [0.13, 0.1], [0.12, 0.2], [0.09, 0.22]], 32), pearl, x, 0.42, -1.0, -Math.PI / 2, 0, 0);
      put(g, ringG(0.1, 0.018), trim, x, 0.42, -1.2);
      put(flames, new T.ConeGeometry(0.085, 0.5, SEG(24), 1, true), fm, x, 0, -0.25, -Math.PI / 2, 0, 0);
    });
    bake(flames);
    liveFns.push(function (t, dt, s) { var k = 0.6 + Math.min(1, (s.speed || 0) / 30) * 0.7 + (s.boost ? 0.9 : 0), w = k * (0.92 + 0.12 * Math.sin(t * 40)); flames.scale.set(1, 1, w); flames.visible = s.detail !== 'far'; });
    // the wheels: fat round tyres (a torus), pearl hubs with a light at their middle
    var wheels = [], wr = 0.26;
    [[0.66, 0.76, 1], [0.68, -0.74, 1.25]].forEach(function (ax, i) {
      var hub = live(new T.Group()); hub.position.set(0, wr, ax[1]); g.add(hub);
      var spin = new T.Group(); hub.add(spin);
      [-1, 1].forEach(function (sd) {
        var x = sd * ax[0];
        put(spin, ringG(wr - 0.085, 0.085), rubber('#1E1F25'), x, 0, 0, 0, Math.PI / 2, 0, 1, 1, ax[2]);
        put(spin, ball(0.13), trim, x + sd * 0.03, 0, 0, 0, 0, 0, 0.55, 1, 1);
        put(spin, ball(0.05), tl, x + sd * 0.1, 0, 0, 0, 0, 0, 0.5, 1, 1);
        for (var k = 0; k < 5; k++) put(spin, pill(0.022, 0.1), trim, x + sd * 0.06, Math.cos(k * 1.2566) * 0.08, Math.sin(k * 1.2566) * 0.08, k * 1.2566, 0, 0);
      });
      bake(spin);
      wheels.push({ hub: hub, spin: spin, front: i === 0 });
    });
    // the steering wheel: a rim and a hub on a short column
    var wheelG = live(new T.Group()); wheelG.position.set(0, 0.9, 0.34); wheelG.rotation.x = -0.6; g.add(wheelG);
    put(wheelG, ringG(0.16, 0.026), rubber('#24242A'), 0, 0, 0);
    put(wheelG, ball(0.05), trim, 0, 0, 0, 0, 0, 0, 1, 1, 0.5);
    [0, 2.1, 4.2].forEach(function (a) { put(wheelG, pill(0.014, 0.12), rubber('#24242A'), Math.sin(a) * 0.08, Math.cos(a) * 0.08, 0, 0, 0, -a); });
    bake(wheelG);
    put(g, pill(0.025, 0.3), pearl, 0, 0.74, 0.5, 0.9, 0, 0);
    // a soft contact shadow under it, tinted with the kart's colour (it grounds the kart on the glass)
    var glow = live(new T.Mesh(new T.PlaneGeometry(2.0, 3.2), new T.MeshBasicMaterial({ map: GLOW_TEX, color: new T.Color(F.kart).multiplyScalar(0.18), transparent: true, opacity: 0.6, depthWrite: false })));
    glow.rotation.x = -Math.PI / 2; glow.position.y = 0.05; glow.renderOrder = 3; g.add(glow);
    return { g: g, wheels: wheels, wheelG: wheelG, wr: wr, glow: glow };
  }

  // ---- a racer: the kart, the empty clothes at its wheel, their head's things, their props, and how they move
  function friend(ctx, F) {
    T = ctx.THREE; LOWQ = ctx.quality === 'low'; glowTex(ctx);
    var liveFns = [], root = new T.Group(), K = kart(F, liveFns);
    root.add(K.g);
    // the driver: hips on the seat; everything in the driver's frame (y 0 at the hips)
    var D = live(new T.Group()); D.position.set(0, 0.52, -0.2); K.g.add(D);
    var body = torso(F); body.scale.setScalar(1.36); D.add(body);
    var Hd = live(head(F)); var HEAD_Y = 0.94; Hd.position.set(0, HEAD_Y, 0.02); Hd.scale.setScalar(1.3); D.add(Hd);
    // the legs: thighs out to the knees, shins down to the pedals, the shoes up on the toe board for the toy look
    var lg = fabric(F.legs);
    [-1, 1].forEach(function (s) {
      tube(D, [[s * 0.13, 0.06, 0.02], [s * 0.15, 0.14, 0.38], [s * 0.16, 0.07, 0.6]], 0.078, lg);
      put(D, ringG(0.075, 0.02), lg, s * 0.16, 0.06, 0.63, 0, 0, 0);
      var sh = shoe(F.shoes, s); sh.position.set(s * 0.17, -0.06, 0.66); sh.rotation.x = -0.25; sh.scale.setScalar(1.15); D.add(sh);
    });
    props(F, K.g, D, liveFns);
    // the arms: two-bone, from the shoulders to the gloves, which hold the wheel (or go up on the podium)
    var slC = F.top.kind === 'varsity' ? F.top.sleeves : F.top.kind === 'vest' ? F.top.shirt : F.top.color, slM = fabric(slC);
    var UPPER = 0.31, LOWER = 0.3, AR = F.sleeve === 'short' ? 0.06 : 0.068;
    var arms = [-1, 1].map(function (s) {
      var up = live(put(D, pill(AR, UPPER), slM)), lo = live(put(D, pill(AR * 0.92, LOWER), F.sleeve === 'short' ? vinyl('#ECE8E2', { r: 0.55, cc: 0.3 }) : slM));
      var cuff = live(put(D, ringG(AR * 0.95, 0.018), slM)); var gv = live(glove(s)); bake(gv); gv.scale.setScalar(1.3); D.add(gv);
      return { s: s, up: up, lo: lo, cuff: cuff, gv: gv, sh: new T.Vector3(s * 0.31, 0.56, 0.0) };
    });
    // the still parts, merged by material: the kart, the driver, the head's things
    bake(K.g); bake(D); bake(Hd);
    root.userData.kartRacer = { stats: F.stats, persona: F.persona || undefined };
    // what moves: the wheels and the wheel, the arms (IK), the head on a spring, the body's lean, squash and cheer
    var v3 = new T.Vector3(), v4 = new T.Vector3(), Y = new T.Vector3(0, 1, 0), E = new T.Vector3(), P0 = new T.Vector3(), dir = new T.Vector3(), pole = new T.Vector3();
    var spring = { x: 0, z: 0, vx: 0, vz: 0 }, lastV = 0, wasAir = false, squash = 0, cheer = 0;
    function seg(m, a, b) { m.position.copy(a).add(b).multiplyScalar(0.5); dir.copy(b).sub(a).normalize(); m.quaternion.setFromUnitVectors(Y, dir); }
    function solve(arm, target) {
      var S = arm.sh, d = v3.copy(target).sub(S), L = Math.min(UPPER + LOWER - 0.002, Math.max(0.05, d.length())); d.normalize();
      var x = (UPPER * UPPER - LOWER * LOWER + L * L) / (2 * L), h = Math.sqrt(Math.max(0, UPPER * UPPER - x * x));
      pole.set(arm.s * 0.8, -0.6, -0.2); pole.sub(v4.copy(d).multiplyScalar(pole.dot(d))).normalize();
      E.copy(S).addScaledVector(d, x).addScaledVector(pole, h); P0.copy(S).addScaledVector(d, L);
      seg(arm.up, S, E); seg(arm.lo, E, P0); arm.cuff.position.copy(P0).addScaledVector(dir, -0.02); arm.cuff.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), dir);
      arm.gv.position.copy(P0).addScaledVector(dir, 0.06);
    }
    var grip = [new T.Vector3(-0.15, 0, 0.02), new T.Vector3(0.15, 0, 0.02)], tgt = new T.Vector3();
    return {
      object: root, name: F.name, color: F.kart, stats: F.stats,
      animate: function (t, dt, s) {
        s = s || {}; dt = Math.min(0.05, dt || 0);
        var v = s.speed || 0, st = s.steer || 0, air = !!(s.air || s.hop);
        K.wheels.forEach(function (w) { w.spin.rotation.x += dt * v / K.wr; if (w.front) w.hub.rotation.y = st * 0.2; });
        K.wheelG.rotation.z = -st * 1.2;
        // the head's spring: it lags the turns and the throttle, and settles
        var acc = dt > 0 ? (v - lastV) / dt : 0; lastV = v;
        var tx = -st * Math.min(1, v / 28) * 0.07, tz = -Math.max(-25, Math.min(25, acc)) * 0.0022;
        spring.vx += ((tx - spring.x) * 90 - spring.vx * 9) * dt; spring.vz += ((tz - spring.z) * 90 - spring.vz * 9) * dt; spring.x += spring.vx * dt; spring.z += spring.vz * dt;
        // a landing squashes the driver, then it springs back
        if (wasAir && !air) squash = 1; wasAir = air; squash = Math.max(0, squash - dt * 4.5);
        var sq = Math.sin(squash * Math.PI) * 0.14;
        cheer = Math.max(0, Math.min(1, cheer + (s.celebrate ? dt * 3 : -dt * 3)));
        D.rotation.z = -st * 0.13 - (s.drift || 0) * 0.1 + spring.x * 0.6;
        D.scale.set(1 + sq * 0.5, 1 - sq, 1 + sq * 0.5);
        D.position.y = 0.52 + 0.01 * Math.sin(t * 9 + v * 0.1) + (air ? 0.04 : 0) + cheer * 0.08 * Math.abs(Math.sin(t * 8));
        Hd.position.set(spring.x, HEAD_Y + spring.z * 0.4 + cheer * 0.1 * Math.abs(Math.sin(t * 8 + 0.6)) + sq * 0.05, 0.02 + spring.z);
        Hd.rotation.y = s.gaze ? Math.max(-0.7, Math.min(0.7, s.gaze[0] * 0.7)) : (s.back ? 2.5 : st * 0.3);
        Hd.rotation.z = (s.hit || s.spun) ? 0.35 * Math.sin(t * 28) : -spring.x * 2.2;
        Hd.rotation.x = spring.z * 2;
        // the arms: to the wheel's grips, or up in a cheer
        K.wheelG.updateMatrixWorld(true); D.updateMatrixWorld(true);
        arms.forEach(function (a, i) {
          if (cheer > 0.01) { tgt.set(a.s * 0.32, 0.95 + 0.06 * Math.sin(t * 9 + i), 0.12); }
          if (cheer < 0.99) { v3.copy(grip[i]); K.wheelG.localToWorld(v3); D.worldToLocal(v3); tgt.lerpVectors(v3, tgt.set(a.s * 0.32, 0.95 + 0.06 * Math.sin(t * 9 + i), 0.12), cheer); }
          solve(a, tgt);
          a.gv.rotation.set(-0.5 - cheer * 1.2, 0, -st * 1.0 * (1 - cheer));
        });
        K.glow.material.opacity = air ? 0.3 : 0.6;
        for (var i = 0; i < liveFns.length; i++) liveFns[i](t, dt, s);
      },
    };
  }

  /* -------------------------------------------------------- the space -- */
  // the road of glass: tiles 2 m square, eight across, a holographic film whose colour runs across the rainbow and turns
  // with the angle you see it at, bright seams, edges of light, a pulse running down it and a sparkle; see-through, so
  // the clouds show under it (a shader on the runtime's ribbon: u across 0 to 1, v down it in tiles)
  var GLASS_FRAG = [
    'uniform float uT; uniform vec3 uW; varying vec2 vUv; varying vec3 vW; varying vec3 vN;',
    'float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
    'vec3 hue(float x) { return clamp(abs(mod(x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }',
    'void main() {',
    '  vec2 cell = vec2(vUv.x * 8.0, vUv.y); vec2 f = fract(cell), id = floor(cell);',
    '  float e = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)), seam = 1.0 - smoothstep(0.0, 0.028, e);',
    '  vec3 V = normalize(cameraPosition - vW); float ndv = abs(dot(normalize(vN), V)), fr = pow(1.0 - ndv, 2.0);',
    '  float hh = min(0.97, 0.38 + vUv.x * 0.54 + fr * 0.08 + 0.03 * sin(vUv.y * 0.21 + uT * 0.7) + (h2(id) - 0.5) * 0.04);',   // (mint, aqua, sky, blue, violet, pink: the aqua end of the rainbow)
    '  vec3 film = mix(hue(fract(hh)), vec3(1.0), 0.1);',
    '  float pulse = smoothstep(0.9, 1.0, sin(vUv.y * 0.25 - uT * 5.0) * 0.5 + 0.5);',
    '  float edge = smoothstep(0.035, 0.0, vUv.x) + smoothstep(0.965, 1.0, vUv.x);',
    '  float sp = step(0.992, h2(floor(vec2(vUv.x * 48.0, vUv.y * 6.0)) + floor(uT * 4.0)));',
    '  vec3 c = film * (0.8 + 0.3 * h2(id + 3.1)) * (0.95 + 0.35 * fr) + seam * vec3(0.9, 0.85, 1.0) + pulse * film * 0.6 + edge * vec3(1.3, 1.2, 1.4) + sp * 1.6;',
    '  c = mix(c, c * vec3(0.55, 1.05, 1.12), uW.y * 0.55); c *= 0.78 + 0.45 * uW.z; c += seam * uW.z * vec3(0.4, 0.2, 0.6);',   // (a step under white by day: the burnt-out line)
    '  float a = 0.55 + 0.3 * fr + seam * 0.3 + edge * 0.5 + pulse * 0.1;',
    '  gl_FragColor = vec4(c, clamp(a, 0.0, 1.0));',
    '  #include <tonemapping_fragment>',
    '  #include <colorspace_fragment>',
    '}',
  ].join('\n');
  var GLASS_VERT = 'varying vec2 vUv; varying vec3 vW; varying vec3 vN; void main() { vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }';
  function rainbowRoad(ctx) {
    var T0 = ctx.THREE, U = { uT: { value: 0 }, uW: { value: new T0.Vector3(1, 0, 0) } };
    var m = new T0.ShaderMaterial({ uniforms: U, vertexShader: GLASS_VERT, fragmentShader: GLASS_FRAG, transparent: true, depthWrite: false, side: T0.DoubleSide });
    var road = ctx.track.ribbon({ material: m, tile: 2, step: 1.5 });
    road.name = 'iw-road'; road.renderOrder = 2;
    // under it, a faint violet glow, so from the side and from below the road is a slab of glass, not a decal
    var under = ctx.track.ribbon({ y: -0.3, material: new T0.MeshBasicMaterial({ color: '#7A5CFF', transparent: true, opacity: 0.22, depthWrite: false, blending: T0.AdditiveBlending }) });
    under.name = 'iw-road-under'; under.renderOrder = 1;
    // the edges: lines of white-pink light either side
    var edgeM = new T0.MeshBasicMaterial({ color: new T0.Color('#FFE6FA').multiplyScalar(1.6) });
    var hw = ctx.track.halfWidth, eL = ctx.track.ribbon({ width: 0.3, offset: -hw, y: 0.05, material: edgeM }), eR = ctx.track.ribbon({ width: 0.3, offset: hw, y: 0.05, material: edgeM });
    var g = new T0.Group(); g.add(road, under, eL, eR); g.name = 'iw-road-group';
    return { group: g, uniforms: U };
  }
  // the star rings: hoops of iridescent glass the road runs through, studded with stars of light, turning slowly
  function starRings(ctx) {
    var T0 = ctx.THREE, L = ctx.track.length, grp = new T0.Group(); grp.name = 'iw-rings';
    var at = [0.02, 0.1, 0.18, 0.26, 0.345, 0.45, 0.53, 0.59, 0.66, 0.73, 0.79, 0.865, 0.96], R = ctx.track.halfWidth + 3.5, NS = 8;
    var glass = new T0.MeshPhysicalMaterial({ color: '#FFFFFF', roughness: 0.05, iridescence: 1, iridescenceIOR: 1.4, clearcoat: 1, emissive: '#B98CFF', emissiveIntensity: 0.45, transparent: true, opacity: 0.7 });
    var shape = new T0.Shape(); for (var k = 0; k < 10; k++) { var a = k / 10 * Math.PI * 2 + Math.PI / 2, r = k % 2 ? 0.42 : 1; if (k) shape.lineTo(Math.cos(a) * r, Math.sin(a) * r); else shape.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
    var starG = new T0.ExtrudeGeometry(shape, { depth: 0.3, bevelEnabled: true, bevelSize: 0.1, bevelThickness: 0.1, bevelSegments: 3 }); starG.center();
    var pal = ['#FFE14D', '#FF8AD8', '#8AE8FF', '#B8FF8A', '#FFB46A'];
    // the hoops: every ring's glass torus and its inner line of light, merged (two draw calls for all of them)
    var tor = [], inn = [], hoops = [], m4 = new T0.Matrix4(), o3 = new T0.Object3D();
    at.forEach(function (f) {
      var d = f * L, F = ctx.track.frameAt(d), c = ctx.track.pointAt(d, 0, 2.5);
      o3.position.set(c.x, c.y, c.z); o3.lookAt(c.x + F.tan.x, c.y + F.tan.y, c.z + F.tan.z); o3.updateMatrix();
      tor.push(new T0.TorusGeometry(R, 0.32, 14, 96).applyMatrix4(o3.matrix)); inn.push(new T0.TorusGeometry(R - 0.55, 0.08, 6, 96).applyMatrix4(o3.matrix));
      hoops.push(o3.matrix.clone());
    });
    function merged(list, mat, name) {
      var n = 0; list = list.map(function (g) { var q = g.toNonIndexed(); g.dispose(); n += q.attributes.position.count; return q; });
      var P = new Float32Array(n * 3), N = new Float32Array(n * 3), o = 0;
      list.forEach(function (g) { P.set(g.attributes.position.array, o * 3); N.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count; g.dispose(); });
      var G = new T0.BufferGeometry(); G.setAttribute('position', new T0.BufferAttribute(P, 3)); G.setAttribute('normal', new T0.BufferAttribute(N, 3));
      var me = new T0.Mesh(G, mat); me.name = name; me.userData.gmTrack = true; me.frustumCulled = false; grp.add(me); return me;
    }
    merged(tor, glass, 'iw-ring-glass'); merged(inn, new T0.MeshBasicMaterial({ color: new T0.Color('#FFFFFF').multiplyScalar(1.4) }), 'iw-ring-light');
    // the stars: one instanced mesh for every star on every ring, turned round its ring each frame
    var stars = new T0.InstancedMesh(starG, new T0.MeshBasicMaterial({ color: '#FFFFFF' }), at.length * NS);
    for (var q = 0; q < at.length * NS; q++) stars.setColorAt(q, new T0.Color(pal[(q + Math.floor(q / NS)) % pal.length]).multiplyScalar(1.6));
    stars.instanceColor.needsUpdate = true; stars.userData.gmTrack = true; stars.frustumCulled = false; stars.name = 'iw-ring-stars'; grp.add(stars);
    var loc = new T0.Matrix4(), sc = new T0.Vector3(0.85, 0.85, 0.85), qq = new T0.Quaternion(), zz = new T0.Vector3(0, 0, 1), pp = new T0.Vector3();
    return { group: grp, update: function (t) {
      for (var h = 0; h < hoops.length; h++) {
        var w = (h % 2 ? 1 : -1) * 0.35;
        for (var k2 = 0; k2 < NS; k2++) {
          var a2 = k2 / NS * Math.PI * 2 + t * w; pp.set(Math.cos(a2) * R, Math.sin(a2) * R, 0); qq.setFromAxisAngle(zz, -t * 1.5);
          loc.compose(pp, qq, sc); m4.multiplyMatrices(hoops[h], loc); stars.setMatrixAt(h * NS + k2, m4);
        }
      }
      stars.instanceMatrix.needsUpdate = true;
    } };
  }
  // the toppling candle (the course's 'topple' hazard, drawn by the world: model false): a giant birthday candle of
  // striped glass on a gold flower base, its flame alive; it stands where the runtime's does (hw + 0.6 out, 17.6 m long)
  // and falls across the road on the hazard's own clock (ctx.kart.hazards(), the runtime's angles)
  function candle(ctx, cfg) {
    glowTex(ctx);
    var T0 = ctx.THREE, H = null;
    var side = cfg.side === 'left' ? -1 : 1, foot = ctx.track.halfWidth + Math.max(0.6, Math.min(2, COURSE.shoulder - 0.6)), len = 2 * ctx.track.halfWidth + Math.max(0.6, Math.min(2, COURSE.shoulder - 0.6)) + 1;
    var d = cfg.at * ctx.track.length, F = ctx.track.frameAt(d), p0 = ctx.track.pointAt(d, side * foot, 0);
    var base = new T0.Group(); base.position.set(p0.x, p0.y, p0.z);
    var X = new T0.Vector3(F.right.x, F.right.y, F.right.z), Y = new T0.Vector3(F.up.x, F.up.y, F.up.z), Z = new T0.Vector3().crossVectors(X, Y);
    base.quaternion.setFromRotationMatrix(new T0.Matrix4().makeBasis(X, Y, Z));
    var pivot = new T0.Group(); base.add(pivot);
    var stripes = ctx.textures.canvas(128, 512, function (g, W, H2) {
      var cols = ['#FFB3D9', '#FFFFFF', '#B3E5FF', '#FFFFFF', '#FFF0A8', '#FFFFFF', '#C8B3FF', '#FFFFFF'];
      for (var y = -W; y < H2 + W; y += 32) { g.fillStyle = cols[((y / 32) % cols.length + cols.length) % cols.length]; g.beginPath(); g.moveTo(0, y); g.lineTo(W, y - W * 0.6); g.lineTo(W, y - W * 0.6 + 32); g.lineTo(0, y + 32); g.closePath(); g.fill(); }
    });
    stripes.wrapS = stripes.wrapT = T0.RepeatWrapping; stripes.repeat.set(1, 4);
    var wax = new T0.MeshPhysicalMaterial({ map: stripes, roughness: 0.12, clearcoat: 1, transmission: 0, iridescence: 0.6, transparent: true, opacity: 0.88, emissive: '#FFFFFF', emissiveMap: stripes, emissiveIntensity: 0.25 });
    var bodyLen = len - 1.6;
    var body = new T0.Mesh(new T0.CylinderGeometry(0.62, 0.66, bodyLen, 48, 1), wax); body.position.y = 0.9 + bodyLen / 2; pivot.add(body);
    var top = new T0.Mesh(new T0.TorusGeometry(0.58, 0.1, 12, 48), wax); top.rotation.x = Math.PI / 2; top.position.y = 0.9 + bodyLen; pivot.add(top);
    var wick = new T0.Mesh(new T0.CylinderGeometry(0.05, 0.05, 0.5, 8), new T0.MeshStandardMaterial({ color: '#2A2430', roughness: 0.7 })); wick.position.y = 0.9 + bodyLen + 0.25; pivot.add(wick);
    var flame = new T0.Mesh(new T0.SphereGeometry(0.32, 24, 16), new T0.MeshBasicMaterial({ color: new T0.Color('#FFC14A').multiplyScalar(2.2) })); flame.scale.set(1, 2, 1); flame.position.y = 0.9 + bodyLen + 0.95; pivot.add(flame);
    var halo = new T0.Mesh(new T0.PlaneGeometry(3.4, 3.4), new T0.MeshBasicMaterial({ map: GLOW_TEX, color: new T0.Color('#FFB14A').multiplyScalar(1.4), transparent: true, depthWrite: false, blending: T0.AdditiveBlending })); halo.position.y = flame.position.y; pivot.add(halo);
    var gold = new T0.MeshPhysicalMaterial({ color: '#F2C24A', metalness: 0.85, roughness: 0.22, clearcoat: 1 });
    for (var k = 0; k < 6; k++) { var pet = new T0.Mesh(new T0.SphereGeometry(0.6, 24, 12), gold); pet.scale.set(1, 0.25, 0.55); pet.position.set(Math.cos(k * 1.047) * 0.75, 0.3, Math.sin(k * 1.047) * 0.75); pet.rotation.y = -k * 1.047; pivot.add(pet); }
    var cup = new T0.Mesh(new T0.CylinderGeometry(0.8, 0.7, 0.8, 40), gold); cup.position.y = 0.45; pivot.add(cup);
    pivot.traverse(function (o) { if (o.isMesh) { o.castShadow = o.material !== halo.material; o.userData.gmKart = true; } });
    var q = COURSE.hazards.indexOf(cfg);
    return { group: base, update: function (ctx2, t) {
      var hz = ctx2.kart && ctx2.kart.hazards ? ctx2.kart.hazards() : null, h = hz && hz[q];
      var ph = h ? h.phase : 'idle', u = h ? h.u : 0, PI = Math.PI;
      var ang = ph === 'fall' ? u * u * PI / 2 : ph === 'lie' ? PI / 2 : ph === 'rise' ? (1 - (u * u * (3 - 2 * u))) * PI / 2 : ph === 'warn' ? (Math.sin(t * 24) * 0.035 + 0.05 * u) * u : 0;
      pivot.rotation.z = side * ang;
      flame.scale.set(1 + 0.12 * Math.sin(t * 27), 2 + 0.3 * Math.sin(t * 19), 1); halo.quaternion.copy(ctx2.camera.quaternion); halo.quaternion.premultiply(new T0.Quaternion().copy(pivot.getWorldQuaternion(new T0.Quaternion())).invert());
    } };
  }
  // the lanterns: glass orbs floating just off the road's open edges, a glow inside each, bobbing (two draw calls)
  function lanterns(ctx) {
    var T0 = ctx.THREE, L = ctx.track.length, hw = ctx.track.halfWidth, low = ctx.quality === 'low', spots = [], step = low ? 70 : 38;
    for (var d = 10; d < L; d += step) { [-1, 1].forEach(function (s) { spots.push({ d: d + (s > 0 ? step / 2 : 0), s: s }); }); }
    var glassM = new T0.MeshPhysicalMaterial({ color: '#FFFFFF', roughness: 0.03, iridescence: 1, iridescenceIOR: 1.35, clearcoat: 1, transparent: true, opacity: 0.4, depthWrite: false });
    var orb = new T0.InstancedMesh(new T0.SphereGeometry(0.9, 24, 16), glassM, spots.length), core = new T0.InstancedMesh(new T0.SphereGeometry(0.42, 16, 12), new T0.MeshBasicMaterial({ color: '#FFFFFF' }), spots.length);
    var pal = ['#FFE8A0', '#A0F0FF', '#FFB8E0', '#C8B8FF', '#B8FFD8'], P = [], o3 = new T0.Object3D();
    spots.forEach(function (q, i) { var p = ctx.track.pointAt(q.d % L, q.s * (hw + 2.6), 2.4); P.push(p); core.setColorAt(i, new T0.Color(pal[i % 5]).multiplyScalar(1.6)); });
    core.instanceColor.needsUpdate = true; orb.frustumCulled = core.frustumCulled = false;
    var g = new T0.Group(); g.name = 'iw-lanterns'; g.add(orb, core);
    g.traverse(function (o) { if (o.isMesh) o.userData.gmTrack = true; });   // (beside the road, never on it)
    return { group: g, update: function (t) {
      for (var i = 0; i < P.length; i++) { var p = P[i]; o3.position.set(p.x, p.y + Math.sin(t * 1.6 + i) * 0.35, p.z); o3.scale.setScalar(1); o3.updateMatrix(); orb.setMatrixAt(i, o3.matrix); o3.scale.setScalar(0.85 + 0.15 * Math.sin(t * 3 + i * 0.7)); o3.updateMatrix(); core.setMatrixAt(i, o3.matrix); }
      orb.instanceMatrix.needsUpdate = core.instanceMatrix.needsUpdate = true;
    } };
  }
  // the walls where they stand: low glass rails of light (the Hairpin, the Sweeper's and the Home bend's outsides)
  function rails(ctx) {
    var T0 = ctx.THREE, L = ctx.track.length, hw = ctx.track.halfWidth + COURSE.shoulder, pos = [], idx = [];
    var spans = [[0.118, 0.283, 1], [0.118, 0.152, -1], [0.283, 0.403, -1], [0.283, 0.403, 1], [0.48, 0.6, -1], [0.48, 0.6, 1], [0.6, 0.822, -1], [0.922, 0.974, -1], [0.922, 0.974, 1]];
    spans.forEach(function (sp) {
      var a = sp[0] * L, b = sp[1] * L, n = Math.ceil((b - a) / 2);
      for (var i = 0; i <= n; i++) {
        var d = a + (b - a) * i / n, p0 = ctx.track.pointAt(d, sp[2] * hw, 0), p1 = ctx.track.pointAt(d, sp[2] * hw, 0.9), base = pos.length / 3;
        pos.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z);
        if (i < n) idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
      }
    });
    var g = new T0.BufferGeometry(); g.setAttribute('position', new T0.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    var m = new T0.MeshBasicMaterial({ color: new T0.Color('#9FE8FF').multiplyScalar(1.1), transparent: true, opacity: 0.45, side: T0.DoubleSide, depthWrite: false, blending: T0.AdditiveBlending });
    var me = new T0.Mesh(g, m); me.name = 'iw-rails'; return me;
  }
  /* -------------------------------------------------------- the dream -- */
  // (21 Oct, v2, the owner: "think dream like Pixar with each lap entering a new phase or world of the dream. base tone
  // color should lean more blue aqua ... chaotic fun with scenery like Wonderwake") Three phases, one a lap, blended over
  // about three seconds as you cross the line (before the race, the title cycles them):
  //   0 DAYDREAM: an aqua morning, white and pink clouds, floating toy-town islands, sky whales, hot-air balloons,
  //     paper planes
  //   1 DEEP DREAM: a teal dusk under an aurora, jellyfish lanterns rising, bubbles, the first stars
  //   2 LUCID DREAM: a cosmic night: the stars, a nebula, a ringed planet, a galaxy, comets and fireworks
  // The Dream Tower (the castle the road spirals round) and the star rings stand through all three.
  var PHASES = [
    { name: 'DAYDREAM', top: '#3A9EF0', mid: '#79D3F2', glow: '#FFE6F2', low: '#C4F0F7', fog: '#A9E4F2', fogD: 0.0009, neb: 0, stars: 0,
      key: ['#FFF3DE', 2.5], hemi: ['#D2F0FF', '#7FB0D0', 1.05], fill: ['#FFD0E8', 0.5], clouds: ['#FFFFFF', '#FFE8F2', '#DDF6FF', '#FFF4DC', '#EDE4FF', '#E2FBF6'], road: 0 },
    { name: 'DEEP DREAM', top: '#0A2A52', mid: '#17689A', glow: '#7BFFE0', low: '#2C5C86', fog: '#2E6E8E', fogD: 0.0011, neb: 0.35, stars: 0.55,
      key: ['#BFE9FF', 1.8], hemi: ['#72D4FF', '#1C2E54', 0.95], fill: ['#7BFFE0', 0.6], clouds: ['#7FD9E8', '#9FB7F0', '#6FE3D2', '#B49CF0', '#88C8F0', '#A0F0E0'], road: 1 },
    { name: 'LUCID DREAM', top: '#04081F', mid: '#1B2266', glow: '#FF7BD8', low: '#2A1C5E', fog: '#21185A', fogD: 0.0012, neb: 0.9, stars: 1,
      key: ['#E2D6FF', 1.6], hemi: ['#9A88FF', '#1E1038', 0.85], fill: ['#FF8AD8', 0.7], clouds: ['#8A6CE0', '#C27AE8', '#6A7EF0', '#E07AC8', '#7A9CF0', '#A06AE8'], road: 2 },
  ];
  function phaseW(ph, i) { var w = Math.max(0, 1 - Math.abs(ph - i)); return w * w * (3 - 2 * w); }
  function pop(w) { if (w <= 0) return 0; var c = 1.70158, x = w - 1; return 1 + (c + 1) * x * x * x + c * x * x; }   // ease out, a little overshoot

  // ---- the sky: a dome whose colours are the phases', a nebula and stars that come with the night
  function dreamSky(ctx) {
    var T0 = ctx.THREE, low = ctx.quality === 'low', rnd = ctx.random, grp = new T0.Group(); grp.name = 'iw-sky';
    var U = { uT: { value: 0 }, uTop: { value: new T0.Color() }, uMid: { value: new T0.Color() }, uGlow: { value: new T0.Color() }, uLow: { value: new T0.Color() }, uNeb: { value: 0 } };
    var dome = new T0.Mesh(new T0.SphereGeometry(1500, 48, 24), new T0.ShaderMaterial({
      side: T0.BackSide, depthWrite: false, fog: false, uniforms: U,
      vertexShader: 'varying vec3 vD; void main() { vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: [
        'varying vec3 vD; uniform float uT, uNeb; uniform vec3 uTop, uMid, uGlow, uLow;',
        'float h(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }',
        'float n(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);',
        '  return mix(mix(mix(h(i), h(i + vec3(1,0,0)), f.x), mix(h(i + vec3(0,1,0)), h(i + vec3(1,1,0)), f.x), f.y), mix(mix(h(i + vec3(0,0,1)), h(i + vec3(1,0,1)), f.x), mix(h(i + vec3(0,1,1)), h(i + vec3(1,1,1)), f.x), f.y), f.z); }',
        'float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int k = 0; k < 5; k++) { s += a * n(p); p *= 2.03; a *= 0.5; } return s; }',
        'void main() { vec3 d = normalize(vD); float y = d.y;',
        '  vec3 base = y > 0.0 ? mix(mix(uGlow, uMid, smoothstep(0.0, 0.22, y)), uTop, smoothstep(0.22, 0.85, y)) : mix(uGlow, uLow, smoothstep(0.0, -0.25, y));',
        '  float q = fbm(d * 2.6 + vec3(0.0, uT * 0.006, 0.0)), r = fbm(d * 5.0 + q * 1.8);',
        '  vec3 neb = mix(vec3(0.6, 0.3, 1.0), vec3(0.2, 0.9, 1.0), smoothstep(0.35, 0.75, r)) * smoothstep(0.42, 0.85, q * r * 1.6) * smoothstep(0.02, 0.35, y);',
        '  float wisp = smoothstep(0.55, 0.8, fbm(d * vec3(1.2, 6.0, 1.2) + vec3(uT * 0.01, 0.0, 0.0))) * smoothstep(0.0, 0.3, y) * (1.0 - uNeb);',
        '  gl_FragColor = vec4(base + neb * uNeb * 0.75 + wisp * 0.12, 1.0);',
        '  #include <tonemapping_fragment>',
        '  #include <colorspace_fragment>',
        '}',
      ].join('\n'),
    }));
    dome.frustumCulled = false; dome.name = 'iw-dome'; grp.add(dome);
    var N = low ? 1400 : 4200, sp = new Float32Array(N * 3), sc = new Float32Array(N * 3);
    for (var i = 0; i < N; i++) {
      var u = rnd() * 1.1 - 0.1, a = rnd() * Math.PI * 2, rr = 900 + rnd() * 400, s = Math.sqrt(Math.max(0, 1 - u * u));
      sp[i * 3] = Math.cos(a) * s * rr; sp[i * 3 + 1] = u * rr; sp[i * 3 + 2] = Math.sin(a) * s * rr;
      var c = new T0.Color().setHSL(0.5 + rnd() * 0.35, 0.6, 0.85).multiplyScalar(rnd() < 0.08 ? 2.2 : 1); sc[i * 3] = c.r; sc[i * 3 + 1] = c.g; sc[i * 3 + 2] = c.b;
    }
    var sg = new T0.BufferGeometry(); sg.setAttribute('position', new T0.BufferAttribute(sp, 3)); sg.setAttribute('color', new T0.BufferAttribute(sc, 3));
    var stars = new T0.Points(sg, new T0.PointsMaterial({ size: 3, sizeAttenuation: false, vertexColors: true, fog: false, depthWrite: false, transparent: true, opacity: 0 }));
    stars.frustumCulled = false; grp.add(stars);
    return { group: grp, U: U, stars: stars, update: function (t, cam) { U.uT.value = t; if (cam) { dome.position.copy(cam.position); stars.position.copy(cam.position); } } };
  }

  // ---- the sea of cloud under the road: pastel puffs, billboards, their colours the phase's
  function cloudSea(ctx) {
    var T0 = ctx.THREE, low = ctx.quality === 'low', rnd = ctx.random;
    var ctex = ctx.textures.canvas(256, 256, function (g, W, H) {
      g.clearRect(0, 0, W, H);
      for (var b = 0; b < 16; b++) { var x = W * (0.2 + 0.6 * ((b * 37) % 11) / 10), y = H * (0.42 + 0.3 * ((b * 53) % 7) / 6), rr = W * (0.11 + 0.13 * ((b * 29) % 5) / 4);
        var rg = g.createRadialGradient(x, y - rr * 0.2, 0, x, y, rr); rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.55, 'rgba(244,248,255,0.75)'); rg.addColorStop(1, 'rgba(220,230,255,0)'); g.fillStyle = rg; g.fillRect(0, 0, W, H); }
      // a soft shade on the underside, so they read round
      var sh = g.createLinearGradient(0, H * 0.35, 0, H); sh.addColorStop(0, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(150,170,210,0.35)');
      g.globalCompositeOperation = 'source-atop'; g.fillStyle = sh; g.fillRect(0, 0, W, H); g.globalCompositeOperation = 'source-over';
    });
    var CL = low ? 120 : 300, cm = new T0.MeshBasicMaterial({ map: ctex, transparent: true, depthWrite: false, fog: false, opacity: 0.95 });
    cm.onBeforeCompile = function (sh) { sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>', 'vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);\nvec2 sz = vec2(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz));\nmvPosition.xy += position.xy * sz;\ngl_Position = projectionMatrix * mvPosition;'); };
    cm.customProgramCacheKey = function () { return 'iw-cloud'; };
    var clouds = new T0.InstancedMesh(new T0.PlaneGeometry(1, 0.62), cm, CL), o3 = new T0.Object3D();
    for (var c = 0; c < CL; c++) {
      var far = c > CL * 0.68, ang = rnd() * Math.PI * 2, dist = far ? 700 + rnd() * 500 : rnd() * 650;
      var x = 100 + Math.cos(ang) * dist, z = -126 + Math.sin(ang) * dist, y = far ? -50 + rnd() * 110 : -40 + rnd() * 40, size = far ? 170 + rnd() * 240 : 50 + rnd() * 120;
      o3.position.set(x, y, z); o3.scale.set(size, size, 1); o3.updateMatrix(); clouds.setMatrixAt(c, o3.matrix); clouds.setColorAt(c, new T0.Color('#FFFFFF'));
    }
    clouds.instanceMatrix.needsUpdate = true; clouds.frustumCulled = false; clouds.name = 'iw-clouds'; clouds.userData.gmTrack = true;
    var tmp = new T0.Color(), a = new T0.Color(), b = new T0.Color(), lastPh = -1;
    return { mesh: clouds, tint: function (ph) {
      if (Math.abs(ph - lastPh) < 0.004) return; lastPh = ph;
      var i0 = Math.min(1, Math.floor(ph)), f = ph - i0;
      for (var k = 0; k < CL; k++) { a.set(PHASES[i0].clouds[k % 6]); b.set(PHASES[Math.min(2, i0 + 1)].clouds[k % 6]); tmp.copy(a).lerp(b, f); clouds.setColorAt(k, tmp); }
      clouds.instanceColor.needsUpdate = true;
    } };
  }

  // ---- the Dream Tower: a pearl tower the road spirals round, and on it a candy castle with a star of light
  function dreamTower(ctx) {
    var T0 = ctx.THREE, L = ctx.track.length, cx = 0, cz = 0, n = 64;
    for (var i = 0; i < n; i++) { var p = ctx.track.pointAt(L * (0.615 + 0.1656 * i / n), 0, 0); cx += p.x; cz += p.z; }
    cx /= n; cz /= n;
    var g = new T0.Group(); g.name = 'iw-tower'; g.position.set(cx, 0, cz);
    T = T0;
    var pearl = new T0.MeshPhysicalMaterial({ color: '#EAF4FF', roughness: 0.2, clearcoat: 1, iridescence: 1, iridescenceIOR: 1.3, sheen: 0.6, sheenColor: new T0.Color('#BFE8FF') });
    var pink = vinyl('#FFB8D8', { r: 0.3, cc: 1 }), sky = vinyl('#8ED0FF', { r: 0.25, cc: 1 }), gold = chrome('#F2C24A'), mint = vinyl('#9FF0D8', { r: 0.3, cc: 1 });
    // the shaft: rings of pearl swelling and narrowing up to the castle's terrace (y -40 under the clouds to 82)
    var pro = [[0, -40]], k;
    for (k = 0; k <= 20; k++) { var yy = -40 + k * 6; pro.push([17.5 - k * 0.2 + (k % 2 ? 1.1 : 0), yy]); }
    pro.push([21, 80], [22, 83], [0, 83.5]);
    var shaft = lathe(pro, 64), sp0 = shaft.attributes.position, scol = new Float32Array(sp0.count * 3), bands = ['#FFD6EC', '#CFF3FF', '#E6DCFF', '#D4FFEE', '#FFF1CC'].map(function (c) { return new T0.Color(c); });
    for (var v0 = 0; v0 < sp0.count; v0++) { var hy = (sp0.getY(v0) + 40) / 12, b0 = Math.floor(hy), fb = hy - b0, cA = bands[((b0 % 5) + 5) % 5], cB = bands[(((b0 + 1) % 5) + 5) % 5], cc = cA.clone().lerp(cB, fb * fb * (3 - 2 * fb)); scol[v0 * 3] = cc.r; scol[v0 * 3 + 1] = cc.g; scol[v0 * 3 + 2] = cc.b; }
    shaft.setAttribute('color', new T0.BufferAttribute(scol, 3));
    pearl.vertexColors = true; pearl.color.set('#FFFFFF');
    put(g, shaft, pearl, 0, 0, 0);
    // a spiral of light up the shaft, and round windows lit warm
    var spiral = []; for (k = 0; k <= 120; k++) { var a = k / 120 * Math.PI * 10, yy2 = -20 + k * 0.85; spiral.push([Math.cos(a) * 19.5, yy2, Math.sin(a) * 19.5]); }
    tube(g, spiral, 0.35, light('#FFE9B0', 1.3));
    for (k = 0; k < 18; k++) { var a2 = k * 2.4, y3 = 5 + (k % 9) * 8; put(g, ball(0.9), light('#FFD9A0', 1.6), Math.cos(a2) * 19.8, y3, Math.sin(a2) * 19.8, 0, 0, 0, 1, 1.3, 0.5).lookAt(0, y3, 0); }
    // the castle on the terrace: a round keep, four turrets with cone roofs and gold balls, flags, a gate
    var C = new T0.Group(); C.position.y = 83; g.add(C);
    put(C, lathe([[0, 0], [9, 0], [9, 12], [9.6, 12.5], [9.6, 14], [0, 14]], 48), pink, 0, 0, 0);
    for (k = 0; k < 12; k++) { var a3 = k / 12 * Math.PI * 2; put(C, slab(1.6, 1, 1.6, 0.25, 0.12), pink, Math.cos(a3) * 9.2, 14.5, Math.sin(a3) * 9.2); }
    put(C, new T0.ConeGeometry(9.8, 14, 48), sky, 0, 21, 0);
    [0, 1, 2, 3].forEach(function (q) {
      var a4 = q * Math.PI / 2 + Math.PI / 4, tx = Math.cos(a4) * 11, tz = Math.sin(a4) * 11;
      put(C, lathe([[0, 0], [3.2, 0], [3, 16], [3.5, 16.5], [3.5, 18], [0, 18]], 32), q % 2 ? mint : pink, tx, 0, tz);
      put(C, new T0.ConeGeometry(4, 8, 32), q % 2 ? pink : sky, tx, 22, tz);
      put(C, ball(0.8), gold, tx, 26.4, tz);
      tube(C, [[tx, 26.5, tz], [tx, 30, tz]], 0.12, gold);
      put(C, slab(2.6, 0.08, 1.5, 0.3, 0.03), light(['#FF8AD8', '#7BE0FF', '#FFE14D', '#8AFFB8'][q], 1.1), tx + 1.35, 29.2, tz, Math.PI / 2, 0, 0);
      for (var w = 0; w < 3; w++) put(C, ball(0.55), light('#FFD9A0', 1.5), tx + Math.cos(a4) * 3.1, 5 + w * 4.5, tz + Math.sin(a4) * 3.1, 0, 0, 0, 1, 1.4, 0.5);
    });
    bake(g);
    // the star of dreams over it all, turning
    var star = live(new T0.Mesh(STAR_G(), light('#FFE87A', 2.2))); star.scale.setScalar(5); star.position.set(0, 83 + 34, 0); g.add(star);
    var halo = new T0.Mesh(new T0.PlaneGeometry(40, 40), new T0.MeshBasicMaterial({ map: GLOW_TEX, color: new T0.Color('#FFE6A0').multiplyScalar(1.2), transparent: true, depthWrite: false, blending: T0.AdditiveBlending, fog: false }));
    halo.position.copy(star.position); g.add(halo);
    g.traverse(function (o) { if (o.isMesh) o.userData.gmTrack = true; });   // (round the road, never on it)
    return { group: g, center: { x: cx, z: cz }, update: function (t, cam) { star.rotation.y = t * 0.8; star.position.y = 117 + Math.sin(t * 1.3) * 1.2; if (cam) halo.quaternion.copy(cam.quaternion); } };
  }

  // a spot for scenery: round the course, clear of the road (in plan, or well above or below it)
  function freeSpot(ctx, rnd, r0, r1, y0, y1, clear) {
    for (var tries = 0; tries < 40; tries++) {
      var a = rnd() * Math.PI * 2, r = r0 + rnd() * (r1 - r0), x = 100 + Math.cos(a) * r * 1.25, z = -126 + Math.sin(a) * r, y = y0 + rnd() * (y1 - y0);
      var nr = ctx.track.nearest(x, z), p = ctx.track.pointAt(nr.d, 0, 0);
      if (nr.distance > clear || Math.abs(y - p.y) > clear + 10) return { x: x, y: y, z: z };
    }
    return { x: 100 + r1 * 1.25, y: y1, z: -126 };
  }

  // ---- DAYDREAM: floating toy-town islands, sky whales, hot-air balloons, paper planes
  function island(T0, rnd, s) {
    var g = new T0.Group(), rock = vinyl(['#B7A9E8', '#9FC3EE', '#C9B2E6'][Math.floor(rnd() * 3)], { r: 0.6, cc: 0.2 }), grass = vinyl(['#9FF0C8', '#BFF5A8', '#A8F0E0'][Math.floor(rnd() * 3)], { r: 0.55, cc: 0.2 });
    put(g, lathe([[0, -16], [2.2, -14], [5, -10], [8.5, -5], [10.5, -1.5], [11, 0]], 32), rock, 0, 0, 0);
    put(g, lathe([[0, 0.1], [11, 0], [11.4, 0.5], [11, 1.1], [0, 1.2]], 40), grass, 0, 0, 0);
    var walls = ['#FFE9D6', '#FFD6E6', '#D9F0FF', '#FFF4C8', '#E6DCFF'], roofs = ['#FF8FA8', '#7EC8F2', '#FFB86A', '#8FD99A', '#B49CF0'];
    var nh = 2 + Math.floor(rnd() * 2);
    for (var h = 0; h < nh; h++) {
      var a = h / nh * Math.PI * 2 + rnd(), r = 3 + rnd() * 4, hx = Math.cos(a) * r, hz = Math.sin(a) * r, hh = 3.5 + rnd() * 2.5, ww = 3.4 + rnd() * 1.4;
      var H = new T0.Group(); H.position.set(hx, 1.1, hz); H.rotation.y = rnd() * 6; g.add(H);
      put(H, slab(ww, ww, hh, 0.5, 0.25), vinyl(walls[(h * 3 + Math.floor(rnd() * 5)) % 5], { r: 0.5, cc: 0.4 }), 0, hh / 2, 0);
      put(H, new T0.ConeGeometry(ww * 0.82, hh * 0.75, 4, 1), vinyl(roofs[Math.floor(rnd() * 5)], { r: 0.35, cc: 0.8 }), 0, hh + hh * 0.37, 0, 0, Math.PI / 4, 0);
      put(H, ball(0.55), light('#FFE2A6', 1.3), 0, hh * 0.62, ww / 2 + 0.02, 0, 0, 0, 1, 1, 0.35);
      put(H, slab(0.9, 0.1, 1.5, 0.3, 0.04), vinyl('#B87A5A', { r: 0.6 }), ww * 0.2, 0.75, ww / 2 + 0.03, Math.PI / 2, 0, 0);
    }
    for (var tr = 0; tr < 3; tr++) {
      var ta = rnd() * 6.28, trr = 6 + rnd() * 3.5;
      put(g, new T0.CylinderGeometry(0.22, 0.3, 2.4, 10), vinyl('#B98A6A', { r: 0.7 }), Math.cos(ta) * trr, 2.3, Math.sin(ta) * trr);
      put(g, ball(1.5), vinyl(['#9FF0B0', '#FFB8D8', '#B8E8FF'][tr % 3], { r: 0.45, cc: 0.4 }), Math.cos(ta) * trr, 4.2, Math.sin(ta) * trr);
    }
    // bunting between two poles
    var p0 = [-8, 1.1, -3], p1 = [8, 1.1, 3];
    tube(g, [[p0[0], 1.1, p0[2]], [p0[0], 6, p0[2]]], 0.12, vinyl('#FFFFFF')); tube(g, [[p1[0], 1.1, p1[2]], [p1[0], 6, p1[2]]], 0.12, vinyl('#FFFFFF'));
    var flags = ['#FF8FA8', '#FFE14D', '#7EE0F2', '#9FF0B0', '#C8A0FF'];
    for (var f = 0; f < 9; f++) { var u = (f + 0.5) / 9, x = p0[0] + (p1[0] - p0[0]) * u, z = p0[2] + (p1[2] - p0[2]) * u, y = 6 - Math.sin(u * Math.PI) * 1.2;
      var fl = put(g, new T0.ConeGeometry(0.45, 0.9, 3), vinyl(flags[f % 5], { r: 0.5 }), x, y - 0.5, z, Math.PI, Math.atan2(p1[0] - p0[0], p1[2] - p0[2]), 0); fl.scale.set(1, 1, 0.2); }
    g.scale.setScalar(s);
    return g;
  }
  function skyWhale(T0) {
    var g = new T0.Group(), body = new T0.Group(); g.add(body);
    var geo = lathe([[0, -9], [0.8, -8.4], [1.6, -6], [2.9, -2], [3.5, 1], [3.3, 4], [2.6, 6.4], [1.4, 7.8], [0, 8.3]], 48); geo.rotateX(Math.PI / 2);
    // the colours by the normal: a blue back, a cream belly with its pleats
    var pos = geo.attributes.position, nor = geo.attributes.normal, col = new Float32Array(pos.count * 3), top = new T0.Color('#7FCBF2'), bel = new T0.Color('#FFF6EA');
    for (var i = 0; i < pos.count; i++) { var k = Math.min(1, Math.max(0, (-nor.getY(i) + 0.15) * 2.2)); var c = top.clone().lerp(bel, k); if (k > 0.5 && Math.sin(pos.getX(i) * 6) > 0.6) c.multiplyScalar(0.94); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    geo.setAttribute('color', new T0.BufferAttribute(col, 3));
    put(body, geo, new T0.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.42, clearcoat: 0.5, sheen: 0.5, sheenColor: new T0.Color('#D8F0FF'), emissive: '#3A7FA8', emissiveIntensity: 0.25, fog: false }), 0, 0, 0);
    [-1, 1].forEach(function (s) {
      put(body, ball(0.75), vinyl('#FFFFFF', { r: 0.2, cc: 1 }), s * 2.9, 0.6, 5.4, 0, 0, 0, 0.6, 1, 1);
      put(body, ball(0.42), vinyl('#14162A', { r: 0.1, cc: 1 }), s * 3.25, 0.65, 5.75, 0, 0, 0, 0.5, 1, 1);
      put(body, ball(0.13), light('#FFFFFF', 1.4), s * 3.4, 0.85, 5.95);
      var fin = put(body, ball(1.6), vinyl('#5DB6E8', { r: 0.42 }), s * 3.6, -1.6, 2.6, 0.3, s * 0.4, s * 0.7, 1.4, 0.22, 0.7);
    });
    put(body, ball(0.9), vinyl('#FF9AC0', { r: 0.6, cc: 0.2 }), 2.2, -0.2, 6.4, 0, 0, 0, 0.6, 0.35, 0.5); put(body, ball(0.9), vinyl('#FF9AC0', { r: 0.6, cc: 0.2 }), -2.2, -0.2, 6.4, 0, 0, 0, 0.6, 0.35, 0.5);
    var tail = live(new T0.Group()); tail.position.set(0, 0, -8.6); body.add(tail);
    [-1, 1].forEach(function (s) { put(tail, ball(2.2), vinyl('#5DB6E8', { r: 0.42 }), s * 1.9, 0, -0.8, 0, s * 0.5, 0, 1, 0.16, 0.55); });
    bake(tail); bake(body);
    return { group: g, tail: tail, body: body };
  }
  function daySet(ctx) {
    var T0 = ctx.THREE, rnd = ctx.random, low = ctx.quality === 'low', g = new T0.Group(); g.name = 'iw-daydream'; T = T0;
    // the islands
    var isl = new T0.Group(); g.add(isl);
    for (var i = 0; i < (low ? 5 : 10); i++) { var p = freeSpot(ctx, rnd, 220, 520, 10, 110, 40), I = island(T0, rnd, 0.9 + rnd() * 0.8); I.position.set(p.x, p.y, p.z); I.rotation.y = rnd() * 6; isl.add(I); }
    bake(isl);
    // the whales: three, swimming slow circles round the course
    var whales = [];
    for (var w = 0; w < 3; w++) { var W = skyWhale(T0); W.group.scale.setScalar(3.2 + w * 0.8); g.add(W.group); whales.push({ W: W, r: 230 + w * 90, y: 75 + w * 28, sp: (w % 2 ? -1 : 1) * (0.035 + w * 0.008), ph: w * 2.1 }); }
    // the balloons: an instanced envelope and basket
    var stripes = ctx.textures.canvas(256, 64, function (gg, Wd, Hd) { var cols = ['#FFFFFF', '#FFD0E2', '#FFFFFF', '#CFEFFF', '#FFFFFF', '#FFF0B8', '#FFFFFF', '#D8C8FF']; for (var k = 0; k < 16; k++) { gg.fillStyle = cols[k % 8]; gg.fillRect(k * 16, 0, 16, Hd); } });
    var env = lathe([[0, 0], [0.5, 0.2], [2.2, 1.4], [3.1, 3.4], [2.8, 5.5], [1.6, 6.8], [0, 7.2]], 40), NB = low ? 5 : 11;
    var em = new T0.MeshPhysicalMaterial({ map: stripes, roughness: 0.45, clearcoat: 0.6, sheen: 0.5 });
    var bal = new T0.InstancedMesh(env, em, NB), bas = new T0.InstancedMesh(slab(1.1, 1.1, 0.8, 0.2, 0.08), vinyl('#C08A5A', { r: 0.7 }), NB), balls = [], o3 = new T0.Object3D();
    var tints = ['#FFFFFF', '#FF8FB0', '#7ED0FF', '#FFD36A', '#A8F0B8', '#C8A8FF'];
    for (var b = 0; b < NB; b++) { var q = freeSpot(ctx, rnd, 120, 420, 40, 140, 30); balls.push({ x: q.x, y: q.y, z: q.z, s: 2 + rnd() * 2, ph: rnd() * 6 }); bal.setColorAt(b, new T0.Color(tints[b % 6])); }
    bal.instanceColor.needsUpdate = true; bal.frustumCulled = bas.frustumCulled = false; g.add(bal, bas);
    // the paper planes: white darts gliding loops
    var pg = new T0.BufferGeometry(); pg.setAttribute('position', new T0.Float32BufferAttribute([0, 0, 1.2, -0.7, 0.1, -0.6, 0, -0.15, -0.6, 0, 0, 1.2, 0, -0.15, -0.6, 0.7, 0.1, -0.6], 3)); pg.computeVertexNormals();
    var NP = low ? 6 : 16, planes = new T0.InstancedMesh(pg, new T0.MeshPhysicalMaterial({ color: '#FFFFFF', roughness: 0.6, side: T0.DoubleSide, sheen: 0.4 }), NP), pl = [];
    for (var k = 0; k < NP; k++) { var c = freeSpot(ctx, rnd, 60, 300, 50, 120, 25); pl.push({ x: c.x, y: c.y, z: c.z, r: 15 + rnd() * 25, sp: 0.4 + rnd() * 0.4, ph: rnd() * 6 }); }
    planes.frustumCulled = false; g.add(planes);
    return { group: g, update: function (t, w) {
      isl.position.y = Math.sin(t * 0.4) * 1.5;
      whales.forEach(function (o) { var a = o.ph + t * o.sp, x = 100 + Math.cos(a) * o.r * 1.2, z = -126 + Math.sin(a) * o.r; o.W.group.position.set(x, o.y + Math.sin(t * 0.5 + o.ph) * 4, z); o.W.group.rotation.y = -a + (o.sp > 0 ? 0 : Math.PI); o.W.tail.rotation.x = Math.sin(t * 1.6 + o.ph) * 0.35; o.W.body.rotation.x = Math.sin(t * 1.6 + o.ph - 0.8) * 0.05; });
      balls.forEach(function (o, i) { o3.position.set(o.x, o.y + Math.sin(t * 0.6 + o.ph) * 3, o.z); o3.rotation.set(0, t * 0.1 + o.ph, Math.sin(t * 0.4 + o.ph) * 0.05); o3.scale.setScalar(o.s * w); o3.updateMatrix(); bal.setMatrixAt(i, o3.matrix); o3.position.y -= 1.4 * o.s * w; o3.updateMatrix(); bas.setMatrixAt(i, o3.matrix); });
      bal.instanceMatrix.needsUpdate = bas.instanceMatrix.needsUpdate = true;
      pl.forEach(function (o, i) { var a = t * o.sp + o.ph; o3.position.set(o.x + Math.cos(a) * o.r, o.y + Math.sin(a * 2) * 3, o.z + Math.sin(a) * o.r); o3.rotation.set(Math.sin(a * 2) * 0.2, -a, -0.5); o3.scale.setScalar(1.6 * w); o3.updateMatrix(); planes.setMatrixAt(i, o3.matrix); });
      planes.instanceMatrix.needsUpdate = true;
    } };
  }

  // ---- DEEP DREAM: jellyfish lanterns, an aurora, bubbles
  function deepSet(ctx) {
    var T0 = ctx.THREE, rnd = ctx.random, low = ctx.quality === 'low', g = new T0.Group(); g.name = 'iw-deepdream'; T = T0;
    var bell = lathe([[0.95, 0], [1.05, 0.25], [1.0, 0.7], [0.7, 1.05], [0, 1.15]], 32), tent = new T0.BufferGeometry(), tp = [];
    for (var k = 0; k < 8; k++) { var a = k / 8 * Math.PI * 2; for (var s = 0; s < 6; s++) { var y0 = -s * 0.5, y1 = -(s + 1) * 0.5, wob0 = Math.sin(s * 1.3 + k) * 0.12, wob1 = Math.sin((s + 1) * 1.3 + k) * 0.12; tp.push(Math.cos(a) * (0.7 + wob0), y0, Math.sin(a) * (0.7 + wob0), Math.cos(a) * (0.7 + wob1), y1, Math.sin(a) * (0.7 + wob1)); } }
    tent.setAttribute('position', new T0.Float32BufferAttribute(tp, 3));
    var NJ = low ? 12 : 30, jm = new T0.MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.65, depthWrite: false, blending: T0.AdditiveBlending, side: T0.DoubleSide, fog: false });
    var jel = new T0.InstancedMesh(bell, jm, NJ), ten = new T0.InstancedMesh(new T0.CylinderGeometry(0.04, 0.04, 3, 4), jm, NJ * 4), jl = [], o3 = new T0.Object3D();
    var jc = ['#7BFFE0', '#8AB8FF', '#FF9AE0', '#B8A0FF', '#80E8FF'];
    for (var j = 0; j < NJ; j++) { var p = freeSpot(ctx, rnd, 40, 380, -10, 110, 22); jl.push({ x: p.x, y: p.y, z: p.z, s: 2 + rnd() * 3, ph: rnd() * 6 }); jel.setColorAt(j, new T0.Color(jc[j % 5]).multiplyScalar(1.3)); for (var q = 0; q < 4; q++) ten.setColorAt(j * 4 + q, new T0.Color(jc[j % 5])); }
    jel.instanceColor.needsUpdate = ten.instanceColor.needsUpdate = true; jel.frustumCulled = ten.frustumCulled = false; g.add(jel, ten);
    // the aurora: three great curtains far off, bands of light swaying
    var AU = { uT: { value: 0 }, uA: { value: 0 } }, aurora = [];
    for (var c = 0; c < 3; c++) {
      var pg = new T0.PlaneGeometry(900, 260, 80, 1), pp = pg.attributes.position;
      for (var v = 0; v < pp.count; v++) { var x = pp.getX(v); pp.setZ(v, Math.sin(x / 140 + c) * 90); }
      var am = new T0.Mesh(pg, new T0.ShaderMaterial({ uniforms: AU, transparent: true, depthWrite: false, blending: T0.AdditiveBlending, side: T0.DoubleSide, fog: false,
        vertexShader: 'varying vec2 vU; void main() { vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'varying vec2 vU; uniform float uT, uA; void main() { float band = 0.5 + 0.5 * sin(vU.x * 40.0 + uT * 0.8 + sin(vU.x * 9.0 - uT * 0.5) * 2.0); float f = smoothstep(0.0, 0.3, vU.y) * (1.0 - smoothstep(0.45, 1.0, vU.y)) * pow(band, 3.0); vec3 col = mix(vec3(0.15, 1.0, 0.6), vec3(0.65, 0.35, 1.0), vU.y * 1.3 + 0.25 * sin(vU.x * 6.0 + uT * 0.2)); gl_FragColor = vec4(col * f * uA * 0.42, 1.0); }' }));
      var ang = c * 2.1 + 0.6; am.position.set(100 + Math.cos(ang) * 760, 230, -126 + Math.sin(ang) * 760); am.lookAt(100, 230, -126); g.add(am); aurora.push(am);
    }
    // bubbles rising out of the clouds
    var NB = low ? 40 : 120, bub = new T0.InstancedMesh(ball(1), new T0.MeshPhysicalMaterial({ color: '#E8FBFF', roughness: 0.02, iridescence: 1, iridescenceIOR: 1.3, clearcoat: 1, transparent: true, opacity: 0.32, depthWrite: false }), NB), bl = [];
    for (var b = 0; b < NB; b++) { var s2 = freeSpot(ctx, rnd, 30, 420, -30, -30, 14); bl.push({ x: s2.x, z: s2.z, s: 0.6 + rnd() * 2.2, sp: 4 + rnd() * 6, ph: rnd() * 200 }); }
    bub.frustumCulled = false; g.add(bub);
    return { group: g, update: function (t, w) {
      jl.forEach(function (o, i) {
        var pulse = 1 + 0.12 * Math.sin(t * 2.2 + o.ph), y = o.y + Math.sin(t * 0.5 + o.ph) * 6;
        o3.position.set(o.x, y, o.z); o3.rotation.set(0, 0, 0); o3.scale.set(o.s * w / pulse, o.s * w * pulse, o.s * w / pulse); o3.updateMatrix(); jel.setMatrixAt(i, o3.matrix);
        for (var q = 0; q < 4; q++) { var a = q * 1.57 + o.ph; o3.position.set(o.x + Math.cos(a) * 0.5 * o.s, y - 1.6 * o.s * w, o.z + Math.sin(a) * 0.5 * o.s); o3.rotation.set(Math.sin(t * 1.8 + q + o.ph) * 0.2, 0, Math.cos(t * 1.5 + q) * 0.2); o3.scale.set(o.s * w, o.s * w, o.s * w); o3.updateMatrix(); ten.setMatrixAt(i * 4 + q, o3.matrix); }
      });
      jel.instanceMatrix.needsUpdate = ten.instanceMatrix.needsUpdate = true;
      AU.uT.value = t; AU.uA.value = w;
      bl.forEach(function (o, i) { var y = -30 + ((t * o.sp + o.ph) % 160); o3.position.set(o.x + Math.sin(t + o.ph) * 2, y, o.z); o3.rotation.set(0, 0, 0); o3.scale.setScalar(o.s * w); o3.updateMatrix(); bub.setMatrixAt(i, o3.matrix); });
      bub.instanceMatrix.needsUpdate = true;
    } };
  }

  // ---- LUCID DREAM: a ringed planet, a galaxy, comets and fireworks
  function lucidSet(ctx, tower) {
    var T0 = ctx.THREE, rnd = ctx.random, low = ctx.quality === 'low', g = new T0.Group(); g.name = 'iw-luciddream';
    var ptex = ctx.textures.canvas(512, 256, function (gg, W, H) { for (var y = 0; y < H; y++) { var k = y / H, b = Math.sin(k * 23) * 0.5 + Math.sin(k * 61 + 1) * 0.25; gg.fillStyle = 'hsl(' + (260 + b * 50) + ',70%,' + (55 + b * 14) + '%)'; gg.fillRect(0, y, W, 1); } });
    var planet = new T0.Mesh(new T0.SphereGeometry(170, 64, 40), new T0.MeshBasicMaterial({ map: ptex, fog: false, transparent: true }));
    planet.position.set(820, 380, -900); g.add(planet);
    var rg = new T0.RingGeometry(220, 360, 96, 1), rp = rg.attributes.position, ru = rg.attributes.uv; for (var q = 0; q < rp.count; q++) { var rr = Math.hypot(rp.getX(q), rp.getY(q)); ru.setXY(q, (rr - 220) / 140, 0.5); }
    var rtex = ctx.textures.canvas(512, 8, function (gg, W, H) { for (var x = 0; x < W; x++) { var k = x / W; gg.fillStyle = 'rgba(' + Math.round(220 + 30 * Math.sin(k * 40)) + ',' + Math.round(190 + 50 * Math.sin(k * 17)) + ',255,' + (0.2 + 0.6 * Math.abs(Math.sin(k * 9 + 1)) * (k > 0.04 && k < 0.96 ? 1 : 0)).toFixed(2) + ')'; gg.fillRect(x, 0, 1, H); } });
    var ring = new T0.Mesh(rg, new T0.MeshBasicMaterial({ map: rtex, transparent: true, side: T0.DoubleSide, depthWrite: false, fog: false })); ring.position.copy(planet.position); ring.rotation.set(-1.2, 0.25, 0.3); g.add(ring);
    // fireworks: bursts over the castle and the line, a point each spark
    var NBu = low ? 3 : 6, NS = 70, fp = new Float32Array(NBu * NS * 3), fc = new Float32Array(NBu * NS * 3), dirs = [];
    for (var i = 0; i < NBu * NS; i++) { var u = rnd() * 2 - 1, a = rnd() * 6.283, s = Math.sqrt(1 - u * u); dirs.push([Math.cos(a) * s, u, Math.sin(a) * s, 0.7 + rnd() * 0.3]); }
    var fg = new T0.BufferGeometry(); fg.setAttribute('position', new T0.BufferAttribute(fp, 3)); fg.setAttribute('color', new T0.BufferAttribute(fc, 3));
    var fw = new T0.Points(fg, new T0.PointsMaterial({ size: 3.4, map: GLOW_TEX, vertexColors: true, transparent: true, depthWrite: false, blending: T0.AdditiveBlending, fog: false }));
    fw.frustumCulled = false; g.add(fw);
    var fcol = ['#FF8AD8', '#7BE0FF', '#FFE14D', '#8AFFB8', '#C8A0FF', '#FFB46A'], spots = [];
    for (var b = 0; b < NBu; b++) spots.push(b % 2 ? { x: tower.x + (rnd() - 0.5) * 80, y: 130 + rnd() * 40, z: tower.z + (rnd() - 0.5) * 80 } : { x: 40 + rnd() * 120, y: 70 + rnd() * 30, z: -40 - rnd() * 60 });
    var tmp = new T0.Color();
    return { group: g, update: function (t, w) {
      planet.rotation.y = t * 0.02; planet.material.opacity = w; ring.material.opacity = w;
      planet.visible = ring.visible = w > 0.01;
      for (var b2 = 0; b2 < NBu; b2++) {
        var per = 3.2 + b2 * 0.45, ph = ((t + b2 * 1.1) % per) / per, S = spots[b2], rad = (1 - Math.pow(1 - Math.min(1, ph * 1.6), 3)) * 22, fall = ph * ph * 10, fade = Math.max(0, 1 - ph) * w;
        tmp.set(fcol[(b2 + Math.floor((t + b2 * 1.1) / per)) % 6]);
        for (var k = 0; k < NS; k++) { var d = dirs[b2 * NS + k], o = (b2 * NS + k) * 3; fp[o] = S.x + d[0] * rad * d[3]; fp[o + 1] = S.y + d[1] * rad * d[3] - fall; fp[o + 2] = S.z + d[2] * rad * d[3]; fc[o] = tmp.r * fade * 2; fc[o + 1] = tmp.g * fade * 2; fc[o + 2] = tmp.b * fade * 2; }
      }
      fg.attributes.position.needsUpdate = fg.attributes.color.needsUpdate = true; fw.visible = w > 0.01;
    } };
  }

  /* -------------------------------------------------------- the world -- */
  // (for the studio sheet of the eight: scripts/.scratch/iw/studio.mts)
  try { window.__IW = { friend: friend, FRIENDS: FRIENDS }; } catch (e) {}
  var LIVE = null;
  GameMog.world({
    theme: { sky: '#79D3F2', fog: '#A9E4F2', ink: '#FFFFFF', panel: '#0A1E34', accent: '#FFE13A', font: 'Oxanium' },
    // the kart preset under a dream's light: aqua by day, teal at dusk, violet at night (the phases set the lights)
    graphics: { preset: 'kart', exposure: 1.0, bloom: { strength: 0.42, threshold: 1.4, radius: 0.55 }, grade: { contrast: 1.04, saturation: 1.18, warmth: -0.02, vignette: 0.22 }, shadows: { extent: 30, mapSize: 2048 } },
    track: { width: ROAD, points: LAP },
    kart: { laps: 3, class: 'normal', course: COURSE, driftAssist: true,
      fx: { skids: '#FFFFFF', skidOpacity: 0.3, rush: true, hype: true, smoke: '#B9E8FF', engine: 0.4 } },
    // the soundtrack: the library's Slampe, dreamy synthwave house (the owner: "will need new music")
    music: { track: 'music-slampe' },
    build: function (ctx) {
      var T0 = ctx.THREE; T = T0; glowTex(ctx);
      ctx.scene.background = new T0.Color(PHASES[0].fog);
      ctx.scene.fog = new T0.FogExp2(PHASES[0].fog, PHASES[0].fogD);
      // the light: a warm key from high over the castle (the one shadow), a sky light, a soft fill from below; each
      // takes the phase's colour
      var key = new T0.DirectionalLight('#FFF3DE', 2.5); key.position.set(0.45, 1, 0.3); key.castShadow = true; ctx.scene.add(key);
      var hemi = new T0.HemisphereLight('#D2F0FF', '#7FB0D0', 1.05); ctx.scene.add(hemi);
      var fill = new T0.DirectionalLight('#FFD0E8', 0.5); fill.position.set(-0.4, -0.3, -0.6); ctx.scene.add(fill);
      var R = rainbowRoad(ctx); ctx.scene.add(R.group);
      ctx.scene.add(rails(ctx));
      var SKY = dreamSky(ctx); ctx.scene.add(SKY.group);
      var CLOUD = cloudSea(ctx); ctx.scene.add(CLOUD.mesh);
      var TOWER = dreamTower(ctx); ctx.scene.add(TOWER.group);
      var DAY = daySet(ctx), DEEP = deepSet(ctx), LUCID = lucidSet(ctx, TOWER.center); ctx.scene.add(DAY.group, DEEP.group, LUCID.group);
      var RG = starRings(ctx); ctx.scene.add(RG.group);
      var LN = lanterns(ctx); ctx.scene.add(LN.group);
      var CD = COURSE.hazards.filter(function (h) { return h.kind === 'topple'; }).map(function (h) { var c = candle(ctx, h); ctx.scene.add(c.group); return c; });
      var PH = { ph: 0, target: 0, raced: false };
      // the dream's phase: the title cycles the three; the race starts in the first, and each lap crossing the line goes on
      ctx.on('start', function () { PH.raced = true; PH.target = 0; });
      ctx.on('lap', function (e) { PH.raced = true; PH.target = Math.max(0, Math.min(2, (e && e.lap ? e.lap : 1) - 1)); });
      LIVE = { road: R, sky: SKY, clouds: CLOUD, tower: TOWER, day: DAY, deep: DEEP, lucid: LUCID, rings: RG, lanterns: LN, candle: CD, key: key, hemi: hemi, fill: fill, PH: PH, c: [new T0.Color(), new T0.Color(), new T0.Color()] };
    },
    update: function (ctx, t, dt) {
      if (!LIVE) return;
      var PH = LIVE.PH;
      if (!PH.raced) PH.target = Math.floor(t / 9) % 3;
      var step = Math.min(0.1, dt || 0.016) * 0.38; PH.ph += Math.max(-step, Math.min(step, PH.target - PH.ph));
      var w = [phaseW(PH.ph, 0), phaseW(PH.ph, 1), phaseW(PH.ph, 2)], sum = w[0] + w[1] + w[2] || 1;
      w = w.map(function (v) { return v / sum; });
      var mix = function (key, out) { out.setRGB(0, 0, 0); var c = LIVE.c[2]; for (var i = 0; i < 3; i++) { c.set(Array.isArray(PHASES[i][key]) ? PHASES[i][key][0] : PHASES[i][key]); out.r += c.r * w[i]; out.g += c.g * w[i]; out.b += c.b * w[i]; } return out; };
      var num = function (f) { return f(PHASES[0]) * w[0] + f(PHASES[1]) * w[1] + f(PHASES[2]) * w[2]; };
      var U = LIVE.sky.U; mix('top', U.uTop.value); mix('mid', U.uMid.value); mix('glow', U.uGlow.value); mix('low', U.uLow.value);
      U.uNeb.value = num(function (p) { return p.neb; }); LIVE.sky.stars.material.opacity = num(function (p) { return p.stars; });
      mix('fog', ctx.scene.fog.color); ctx.scene.fog.density = num(function (p) { return p.fogD; }); if (ctx.scene.background && ctx.scene.background.isColor) ctx.scene.background.copy(ctx.scene.fog.color);
      mix('key', LIVE.key.color); LIVE.key.intensity = num(function (p) { return p.key[1]; });
      LIVE.hemi.color.copy(mix('hemi', LIVE.c[0])); LIVE.c[1].setRGB(0, 0, 0); for (var i = 0; i < 3; i++) { LIVE.c[2].set(PHASES[i].hemi[1]); LIVE.c[1].r += LIVE.c[2].r * w[i]; LIVE.c[1].g += LIVE.c[2].g * w[i]; LIVE.c[1].b += LIVE.c[2].b * w[i]; } LIVE.hemi.groundColor.copy(LIVE.c[1]);
      LIVE.hemi.intensity = num(function (p) { return p.hemi[2]; });
      mix('fill', LIVE.fill.color); LIVE.fill.intensity = num(function (p) { return p.fill[1]; });
      LIVE.road.uniforms.uT.value = t; LIVE.road.uniforms.uW.value.set(w[0], w[1], w[2]);
      LIVE.clouds.tint(PH.ph);
      LIVE.sky.update(t, ctx.camera);
      LIVE.tower.update(t, ctx.camera);
      // each phase's set pieces: they come up out of the clouds (the islands) or pop in, and go as the next arrives
      var pw = [pop(w[0]), pop(w[1]), pop(w[2])];
      LIVE.day.group.visible = w[0] > 0.01; if (LIVE.day.group.visible) { LIVE.day.update(t, pw[0]); LIVE.day.group.children[0].position.y = Math.sin(t * 0.4) * 1.5 - (1 - pw[0]) * 170; }
      LIVE.deep.group.visible = w[1] > 0.01; if (LIVE.deep.group.visible) LIVE.deep.update(t, pw[1]);
      LIVE.lucid.group.visible = w[2] > 0.01; if (LIVE.lucid.group.visible) LIVE.lucid.update(t, w[2]);
      LIVE.rings.update(t);
      LIVE.lanterns.update(t);
      LIVE.candle.forEach(function (c) { c.update(ctx, t); });
    },
    player: function (ctx) { return friend(ctx, FRIENDS[0]); },
    rival: function (ctx, k) { return friend(ctx, FRIENDS[k % FRIENDS.length]); },
  });
})();
