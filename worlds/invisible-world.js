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
  // 1,216 m, closed exactly (designed as pieces: the start straight, the Sweeper (180 degrees left, climbing), the Jump
  // straight, the S, the Dive, the Hairpin (150 left, walled), the Climb, the Kink, the Home bend, the run-in); [x, y, z,
  // bank]. Every bank is 0 (21 Oct, the owner's screenshot: a kart under the glass on a banked bend): the kart kit rides
  // the centre line's height across the whole road, so a tilted road and its karts part by up to hw x sin(bank)
  var LAP = [[0.0,30.0,0.0,0],[25.7,30.0,0.0,0],[51.4,30.0,0.0,0],[77.1,30.0,0.0,0],[102.8,30.0,0.0,0],[128.5,30.0,0.0,0],[154.3,30.0,0.0,0],[180.0,30.0,0.0,0],[205.7,30.0,0.0,0],[218.5,30.6,-1.3,0],[230.9,31.2,-5.0,0],[242.3,31.9,-11.1,0],[252.3,32.5,-19.3,0],[260.5,33.1,-29.3,0],[266.6,33.8,-40.7,0],[270.4,34.4,-53.1,0],[271.7,35.0,-66.0,0],[270.4,35.6,-78.9,0],[266.6,36.2,-91.3,0],[260.5,36.9,-102.7,0],[252.3,37.5,-112.7,0],[242.3,38.1,-120.9,0],[230.9,38.8,-127.0,0],[218.5,39.4,-130.7,0],[205.7,40.0,-132.0,0],[180.7,39.0,-132.0,0],[155.7,38.0,-132.0,0],[130.7,37.0,-132.0,0],[105.7,36.0,-132.0,0],[80.7,35.0,-132.0,0],[55.7,34.0,-132.0,0],[43.2,33.4,-133.6,0],[31.7,32.8,-138.4,0],[21.7,32.2,-146.1,0],[14.1,31.6,-156.0,0],[9.3,31.0,-167.6,0],[4.5,30.4,-179.2,0],[-3.1,29.8,-189.1,0],[-13.1,29.2,-196.7,0],[-24.6,28.6,-201.5,0],[-37.1,28.0,-203.2,0],[-63.7,25.7,-203.2,0],[-90.4,23.3,-203.2,0],[-117.1,21.0,-203.2,0],[-143.7,18.7,-203.2,0],[-170.4,16.3,-203.2,0],[-197.1,14.0,-203.2,0],[-208.9,14.0,-200.5,0],[-218.5,14.0,-193.2,0],[-224.1,14.0,-182.4,0],[-224.6,14.0,-170.3,0],[-220.0,14.0,-159.1,0],[-211.1,14.0,-150.9,0],[-191.5,16.5,-139.6,0],[-172.0,19.0,-128.4,0],[-161.7,19.8,-121.2,0],[-152.8,20.7,-112.3,0],[-145.6,21.5,-102.0,0],[-140.3,22.3,-90.6,0],[-137.1,23.2,-78.5,0],[-136.0,24.0,-66.0,0],[-134.7,24.5,-53.1,0],[-131.0,25.0,-40.7,0],[-124.9,25.5,-29.3,0],[-116.7,26.0,-19.3,0],[-106.7,26.5,-11.1,0],[-95.3,27.0,-5.0,0],[-82.9,27.5,-1.3,0],[-70.0,28.0,0.0,0],[-46.7,28.7,0.0,0],[-23.3,29.3,-0.0,0]];
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
    pads: [{ at: 0.06, x: -3 }, { at: 0.12, x: 3 }, { at: 0.36, x: 0 }, { at: 0.6, x: -3 }, { at: 0.62, x: 3 }, { at: 0.8, x: 0 }, { at: 0.96, x: 0 }],
    ramps: [{ at: 0.4, x: 0, width: 14, size: 'big', lift: 1.7 }],
    breaks: [{ from: 0.403, len: 11 }, { from: 0.652, len: 9, clear: true }],
    breakLook: 'none',   // (no pit drawn: the gap in the glass shows the clouds below)
    bumps: [{ at: 0.47, size: 'roller', n: 3 }, { at: 0.648, size: 'lip' }],
    rails: [{ points: [[0.762, -5], [0.792, -5]] }, { points: [[0.762, 5], [0.792, 5]] }],
    walls: { gaps: [
      { from: 0.0, to: 0.169, side: 'both', water: false },
      { from: 0.169, to: 0.34, side: 'left', water: false },
      { from: 0.34, to: 0.693, side: 'both', water: false },
      { from: 0.763, to: 0.857, side: 'both', water: false },
      { from: 0.857, to: 0.942, side: 'left', water: false },
      { from: 0.942, to: 1.0, side: 'both', water: false },
    ] },
    airdrops: [{ at: 0.09, n: 5 }, { at: 0.3, n: 4 }, { at: 0.52, n: 5 }, { at: 0.82, n: 4 }],
    gm: 'auto',
    air: { lift: 1.45, hang: 0.4 },
    hazards: [{ kind: 'meteor', from: 0.57, to: 0.69, every: 7 }, { kind: 'topple', at: 0.345, side: 'right', every: 11, model: false }, { kind: 'crossing', at: 0.83, every: 9 }],
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
      var P = new Float32Array(n * 3), N = new Float32Array(n * 3), U = new Float32Array(n * 2), o = 0;
      B.gs.forEach(function (g) { P.set(g.attributes.position.array, o * 3); N.set(g.attributes.normal.array, o * 3); U.set(g.attributes.uv.array, o * 2); o += g.attributes.position.count; g.dispose(); });
      var G = new T.BufferGeometry(); G.setAttribute('position', new T.BufferAttribute(P, 3)); G.setAttribute('normal', new T.BufferAttribute(N, 3)); G.setAttribute('uv', new T.BufferAttribute(U, 2));
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
    'uniform float uT; varying vec2 vUv; varying vec3 vW; varying vec3 vN;',
    'float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
    'vec3 hue(float x) { return clamp(abs(mod(x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }',
    'void main() {',
    '  vec2 cell = vec2(vUv.x * 8.0, vUv.y); vec2 f = fract(cell), id = floor(cell);',
    '  float e = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)), seam = 1.0 - smoothstep(0.0, 0.028, e);',
    '  vec3 V = normalize(cameraPosition - vW); float ndv = abs(dot(normalize(vN), V)), fr = pow(1.0 - ndv, 2.0);',
    '  float hh = vUv.x * 0.82 + fr * 0.45 + 0.04 * sin(vUv.y * 0.21 + uT * 0.7) + (h2(id) - 0.5) * 0.06;',
    '  vec3 film = mix(hue(fract(hh)), vec3(1.0), 0.1);',
    '  float pulse = smoothstep(0.9, 1.0, sin(vUv.y * 0.25 - uT * 5.0) * 0.5 + 0.5);',
    '  float edge = smoothstep(0.035, 0.0, vUv.x) + smoothstep(0.965, 1.0, vUv.x);',
    '  float sp = step(0.992, h2(floor(vec2(vUv.x * 48.0, vUv.y * 6.0)) + floor(uT * 4.0)));',
    '  vec3 c = film * (0.8 + 0.3 * h2(id + 3.1)) * (0.95 + 0.35 * fr) + seam * vec3(0.9, 0.85, 1.0) + pulse * film * 0.6 + edge * vec3(1.8, 1.6, 1.9) + sp * 2.0;',
    '  float a = 0.55 + 0.3 * fr + seam * 0.3 + edge * 0.5 + pulse * 0.1;',
    '  gl_FragColor = vec4(c, clamp(a, 0.0, 1.0));',
    '  #include <tonemapping_fragment>',
    '  #include <colorspace_fragment>',
    '}',
  ].join('\n');
  var GLASS_VERT = 'varying vec2 vUv; varying vec3 vW; varying vec3 vN; void main() { vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }';
  function rainbowRoad(ctx) {
    var T0 = ctx.THREE, U = { uT: { value: 0 } };
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
    var at = [0.03, 0.12, 0.2, 0.27, 0.36, 0.5, 0.58, 0.64, 0.8, 0.9, 0.97], R = ctx.track.halfWidth + 3.5, NS = 8;
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
  function candle(ctx) {
    glowTex(ctx);
    var T0 = ctx.THREE, H = null, cfg = COURSE.hazards.filter(function (h) { return h.kind === 'topple'; })[0]; if (!cfg) return null;
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
  // the walls where they stand: low glass rails of light (the Hairpin, the Sweeper's and the Home bend's outsides)
  function rails(ctx) {
    var T0 = ctx.THREE, L = ctx.track.length, hw = ctx.track.halfWidth + COURSE.shoulder, pos = [], idx = [];
    var spans = [[0.693, 0.763, -1], [0.693, 0.763, 1], [0.169, 0.34, 1], [0.857, 0.942, 1]];
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
  // deep space round it all: a nebula dome, stars, a ringed planet, a far galaxy, drifting crystals and shooting stars
  function space(ctx) {
    var T0 = ctx.THREE, grp = new T0.Group(); grp.name = 'iw-space';
    var low = ctx.quality === 'low';
    // the dome: a nebula of purple, magenta and teal over deep blue (a shader on the inside of a sphere)
    var dome = new T0.Mesh(new T0.SphereGeometry(1500, 48, 24), new T0.ShaderMaterial({
      side: T0.BackSide, depthWrite: false, fog: false,
      uniforms: { uT: { value: 0 } },
      vertexShader: 'varying vec3 vD; void main() { vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: [
        'varying vec3 vD; uniform float uT;',
        'float h(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }',
        'float n(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);',
        '  return mix(mix(mix(h(i), h(i + vec3(1,0,0)), f.x), mix(h(i + vec3(0,1,0)), h(i + vec3(1,1,0)), f.x), f.y), mix(mix(h(i + vec3(0,0,1)), h(i + vec3(1,0,1)), f.x), mix(h(i + vec3(0,1,1)), h(i + vec3(1,1,1)), f.x), f.y), f.z); }',
        'float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int k = 0; k < 5; k++) { s += a * n(p); p *= 2.03; a *= 0.5; } return s; }',
        'void main() { vec3 d = normalize(vD); float q = fbm(d * 2.6 + vec3(0.0, uT * 0.004, 0.0)); float r = fbm(d * 5.0 + q * 1.8);',
        // (a twilight over a sea of cloud: indigo overhead, violet, a pink and peach glow at the horizon, pale lilac below)
        '  float y = d.y; vec3 top = vec3(0.07, 0.05, 0.22), mid = vec3(0.32, 0.2, 0.62), glow = vec3(1.0, 0.62, 0.78), low = vec3(0.78, 0.7, 0.95);',
        '  vec3 base = y > 0.0 ? mix(mix(glow, mid, smoothstep(0.0, 0.25, y)), top, smoothstep(0.25, 0.85, y)) : mix(glow, low, smoothstep(0.0, -0.3, y));',
        '  base += vec3(0.45, 0.75, 1.0) * 0.35 * exp(-abs(y) * 14.0);',
        '  vec3 neb = mix(vec3(0.75, 0.3, 0.95), vec3(0.2, 0.75, 0.95), smoothstep(0.35, 0.75, r)) * smoothstep(0.42, 0.85, q * r * 1.6) * smoothstep(0.05, 0.4, y);',
        '  gl_FragColor = vec4(base + neb * 0.6, 1.0);',
        '  #include <tonemapping_fragment>',
        '  #include <colorspace_fragment>',
        '}',
      ].join('\n'),
    }));
    dome.name = 'iw-dome'; dome.frustumCulled = false; grp.add(dome);
    // the stars: points on a far shell, a few big and bright
    var N = low ? 1400 : 4200, sp = new Float32Array(N * 3), sc = new Float32Array(N * 3), rnd = ctx.random;
    for (var i = 0; i < N; i++) {
      var u = rnd() * 2 - 1, a = rnd() * Math.PI * 2, r = 900 + rnd() * 400, s = Math.sqrt(1 - u * u);
      sp[i * 3] = Math.cos(a) * s * r; sp[i * 3 + 1] = u * r; sp[i * 3 + 2] = Math.sin(a) * s * r;
      var c = new T0.Color().setHSL(0.55 + rnd() * 0.5, 0.6, 0.8 + rnd() * 0.2).multiplyScalar(rnd() < 0.08 ? 2.4 : 1);
      sc[i * 3] = c.r; sc[i * 3 + 1] = c.g; sc[i * 3 + 2] = c.b;
    }
    var sg = new T0.BufferGeometry(); sg.setAttribute('position', new T0.BufferAttribute(sp, 3)); sg.setAttribute('color', new T0.BufferAttribute(sc, 3));
    var stars = new T0.Points(sg, new T0.PointsMaterial({ size: 3.2, sizeAttenuation: false, vertexColors: true, fog: false, depthWrite: false }));
    stars.name = 'iw-stars'; stars.frustumCulled = false; grp.add(stars);
    // the planet: banded, ringed, lit from the side, hanging past the Sweeper
    var ptex = ctx.textures.canvas(512, 256, function (g, W, H) {
      for (var y = 0; y < H; y++) { var k = y / H, b = Math.sin(k * 23) * 0.5 + Math.sin(k * 61 + 1) * 0.25; g.fillStyle = 'hsl(' + (275 + b * 40) + ',65%,' + (48 + b * 14) + '%)'; g.fillRect(0, y, W, 1); }
      g.fillStyle = 'rgba(255,170,230,0.35)'; g.beginPath(); g.ellipse(W * 0.62, H * 0.58, 46, 20, 0, 0, 7); g.fill();
    });
    var planet = new T0.Mesh(new T0.SphereGeometry(170, 64, 40), new T0.MeshStandardMaterial({ map: ptex, roughness: 0.8, emissive: '#3A1660', emissiveIntensity: 0.35, fog: false }));
    planet.position.set(900, 330, -820); planet.rotation.z = 0.35; grp.add(planet);
    var rtex = ctx.textures.canvas(512, 32, function (g, W, H) { for (var x = 0; x < W; x++) { var k = x / W; g.fillStyle = 'rgba(' + Math.round(220 + 30 * Math.sin(k * 40)) + ',' + Math.round(170 + 60 * Math.sin(k * 17)) + ',255,' + (0.15 + 0.6 * Math.abs(Math.sin(k * 9 + 1)) * (k > 0.05 && k < 0.95 ? 1 : 0)).toFixed(2) + ')'; g.fillRect(x, 0, 1, H); } });
    var ringG = new T0.RingGeometry(190, 330, 96, 1), ruv = ringG.attributes.uv, rp = ringG.attributes.position;
    for (var q = 0; q < rp.count; q++) { var rr = Math.hypot(rp.getX(q), rp.getY(q)); ruv.setXY(q, (rr - 190) / 140, 0.5); }
    var ring = new T0.Mesh(ringG, new T0.MeshBasicMaterial({ map: rtex, transparent: true, side: T0.DoubleSide, depthWrite: false, fog: false }));
    ring.position.copy(planet.position); ring.rotation.set(-1.15, 0.2, 0.35); grp.add(ring);
    // a far galaxy: a spiral of light on a card
    var gtex = ctx.textures.canvas(256, 256, function (g, W, H) {
      g.fillStyle = 'rgba(0,0,0,0)'; g.clearRect(0, 0, W, H);
      for (var k = 0; k < 1600; k++) { var t = k / 1600, arm = k % 2, ang = t * 9 + arm * Math.PI, rad = t * 110; var x = W / 2 + Math.cos(ang) * rad + (Math.sin(k * 7.1) * 8) * t, y = H / 2 + Math.sin(ang) * rad * 0.55 + (Math.cos(k * 3.3) * 8) * t; g.fillStyle = 'rgba(' + (180 + 70 * t | 0) + ',' + (200 - 60 * t | 0) + ',255,' + (0.6 - 0.4 * t).toFixed(2) + ')'; g.fillRect(x, y, 2, 2); }
      var rg = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, 40); rg.addColorStop(0, 'rgba(255,240,220,0.95)'); rg.addColorStop(1, 'rgba(255,200,240,0)'); g.fillStyle = rg; g.fillRect(0, 0, W, H);
    });
    var gal = new T0.Mesh(new T0.PlaneGeometry(420, 420), new T0.MeshBasicMaterial({ map: gtex, transparent: true, blending: T0.AdditiveBlending, depthWrite: false, fog: false }));
    gal.position.set(-700, 260, 520); gal.lookAt(0, 30, 0); grp.add(gal);
    // drifting crystals round the course: low-poly gems in the rainbow's colours, turning slowly
    var CN = low ? 30 : 90, cry = new T0.InstancedMesh(new T0.OctahedronGeometry(1.6, 0), new T0.MeshPhysicalMaterial({ color: '#FFFFFF', roughness: 0.05, metalness: 0, iridescence: 1, iridescenceIOR: 1.35, clearcoat: 1, emissive: '#6A3AC0', emissiveIntensity: 0.45, transparent: true, opacity: 0.62 }), CN);
    var cdat = [], o3 = new T0.Object3D(), L = ctx.track.length, pal = ['#FF3B5C', '#FFE13A', '#3BE07A', '#2FC8FF', '#B44DFF', '#FF8A2A'];
    for (var j = 0; j < CN; j++) {
      var d = rnd() * L, side = rnd() < 0.5 ? -1 : 1, off = 22 + rnd() * 70, p = ctx.track.pointAt(d, side * off, -12 + rnd() * 40);
      cdat.push({ x: p.x, y: p.y, z: p.z, s: 0.6 + rnd() * 2.2, r: rnd() * 6, w: 0.2 + rnd() * 0.6 });
      cry.setColorAt(j, new T0.Color(pal[j % pal.length]));
    }
    cry.name = 'iw-crystals'; cry.frustumCulled = false; grp.add(cry);
    // the sea of cloud under the road: soft puffs, pastel, always turned to the camera (a billboard in the shader)
    var ctex = ctx.textures.canvas(256, 256, function (g, W, H) {
      g.clearRect(0, 0, W, H);
      for (var b = 0; b < 14; b++) { var x = W * (0.25 + 0.5 * ((b * 37) % 11) / 10), y = H * (0.45 + 0.25 * ((b * 53) % 7) / 6), rr = W * (0.12 + 0.12 * ((b * 29) % 5) / 4);
        var rg = g.createRadialGradient(x, y, 0, x, y, rr); rg.addColorStop(0, 'rgba(255,255,255,0.95)'); rg.addColorStop(0.55, 'rgba(255,255,255,0.6)'); rg.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = rg; g.fillRect(0, 0, W, H); }
    });
    var CL = low ? 110 : 280, cpal = ['#FFD6EC', '#E2D4FF', '#CDE8FF', '#FFE6D2', '#F6D2FF', '#D2F2FF'];
    var cm = new T0.MeshBasicMaterial({ map: ctex, transparent: true, depthWrite: false, fog: false, opacity: 0.92 });
    cm.onBeforeCompile = function (sh) { sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>', 'vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);\nvec2 sz = vec2(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz));\nmvPosition.xy += position.xy * sz;\ngl_Position = projectionMatrix * mvPosition;'); };
    cm.customProgramCacheKey = function () { return 'iw-cloud'; };
    var clouds = new T0.InstancedMesh(new T0.PlaneGeometry(1, 0.62), cm, CL);
    for (var cc = 0; cc < CL; cc++) {
      var far = cc > CL * 0.7, ang = rnd() * Math.PI * 2, dist = far ? 650 + rnd() * 500 : rnd() * 620, cxx = 25 + Math.cos(ang) * dist, czz = -100 + Math.sin(ang) * dist;
      var cyy = far ? -40 + rnd() * 90 : -30 + rnd() * 34, size = far ? 160 + rnd() * 220 : 50 + rnd() * 110;
      o3.position.set(cxx, cyy, czz); o3.rotation.set(0, 0, 0); o3.scale.set(size, size, 1); o3.updateMatrix(); clouds.setMatrixAt(cc, o3.matrix);
      clouds.setColorAt(cc, new T0.Color(cpal[cc % cpal.length]));
    }
    clouds.instanceMatrix.needsUpdate = true; clouds.frustumCulled = false; clouds.name = 'iw-clouds'; clouds.renderOrder = 0; clouds.userData.gmTrack = true; grp.add(clouds);   // (soft, under the road: never in the way)
    // shooting stars: a few streaks crossing the dome on their own clocks
    var SN = 6, streak = new T0.InstancedMesh(new T0.PlaneGeometry(1, 1), new T0.MeshBasicMaterial({ color: new T0.Color('#FFFFFF').multiplyScalar(1.6), transparent: true, opacity: 0.85, depthWrite: false, fog: false, side: T0.DoubleSide, blending: T0.AdditiveBlending }), SN);
    streak.frustumCulled = false; grp.add(streak);
    return {
      group: grp,
      update: function (t, cam) {
        dome.material.uniforms.uT.value = t;
        if (cam) { dome.position.copy(cam.position); stars.position.copy(cam.position); }
        planet.rotation.y = t * 0.02;
        for (var k = 0; k < cdat.length; k++) { var c = cdat[k]; o3.position.set(c.x, c.y + Math.sin(t * c.w + c.r) * 1.5, c.z); o3.rotation.set(t * c.w * 0.5 + c.r, t * c.w + c.r, 0); o3.scale.setScalar(c.s); o3.updateMatrix(); cry.setMatrixAt(k, o3.matrix); }
        cry.instanceMatrix.needsUpdate = true;
        for (var m = 0; m < SN; m++) {
          var per = 9 + m * 2.3, ph = ((t + m * 3.7) % per) / per, live = ph < 0.12, a = m * 1.7;
          var cx = cam ? cam.position.x : 0, cz = cam ? cam.position.z : 0;
          o3.position.set(cx + Math.cos(a) * 700 - ph * 1600 * Math.sin(a), 260 + m * 40 - ph * 900, cz + Math.sin(a) * 700 + ph * 1600 * Math.cos(a));
          o3.rotation.set(0, -a, 0.55); o3.scale.set(live ? 160 : 0.001, live ? 1.6 : 0.001, 1); o3.updateMatrix(); streak.setMatrixAt(m, o3.matrix);
        }
        streak.instanceMatrix.needsUpdate = true;
      },
    };
  }

  /* -------------------------------------------------------- the world -- */
  // (for the studio sheet of the eight: scripts/.scratch/iw/studio.mts)
  try { window.__IW = { friend: friend, FRIENDS: FRIENDS }; } catch (e) {}
  var LIVE = null;
  GameMog.world({
    theme: { sky: '#0A0820', fog: '#140B30', ink: '#FFFFFF', panel: '#0B0A1A', accent: '#FFE13A', font: 'Oxanium' },
    // the kart preset, a night of neon: the road and the stars carry the light, the karts lit by a cool key and a warm rim
    graphics: { preset: 'kart', exposure: 1.05, bloom: { strength: 0.42, threshold: 1.4, radius: 0.55 }, grade: { contrast: 1.04, saturation: 1.18, warmth: -0.02, vignette: 0.22 }, shadows: { extent: 30, mapSize: 2048 } },
    track: { width: ROAD, points: LAP },
    kart: { laps: 3, class: 'normal', course: COURSE, driftAssist: true,
      fx: { skids: '#FFFFFF', skidOpacity: 0.3, rush: true, hype: true, smoke: '#B9A8FF' } },
    music: { style: 'synthwave', key: 'A', mode: 'minor', tempo: 148, seed: 'Invisible World' },
    build: function (ctx) {
      var T0 = ctx.THREE;
      ctx.scene.background = new T0.Color('#0A0820');
      ctx.scene.fog = new T0.FogExp2('#140B30', 0.0011);
      // the light: a cool key from above the planet's side (the one shadow), a violet sky light, a warm fill from below
      var key = new T0.DirectionalLight('#FFF1E6', 2.2); key.position.set(0.5, 1, 0.35); key.castShadow = true; ctx.scene.add(key);
      ctx.scene.add(new T0.HemisphereLight('#B9A4FF', '#3A1E5A', 0.9));
      var fill = new T0.DirectionalLight('#FF9AD6', 0.7); fill.position.set(-0.4, -0.3, -0.6); ctx.scene.add(fill);
      var R = rainbowRoad(ctx); ctx.scene.add(R.group);
      ctx.scene.add(rails(ctx));
      var S = space(ctx); ctx.scene.add(S.group);
      var RG = starRings(ctx); ctx.scene.add(RG.group);
      var CD = candle(ctx); if (CD) ctx.scene.add(CD.group);
      LIVE = { road: R, space: S, rings: RG, candle: CD };
    },
    update: function (ctx, t) {
      if (!LIVE) return;
      // the road's light runs towards you, a band of light every second
      LIVE.road.uniforms.uT.value = t;
      LIVE.space.update(t, ctx.camera);
      LIVE.rings.update(t);
      if (LIVE.candle) LIVE.candle.update(ctx, t);
    },
    player: function (ctx) { return friend(ctx, FRIENDS[0]); },
    rival: function (ctx, k) { return friend(ctx, FRIENDS[k % FRIENDS.length]); },
  });
})();
