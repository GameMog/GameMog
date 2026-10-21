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
  // 1,216 m, closed exactly (designed as pieces: the start straight, the Sweeper (180 degrees left, banked 34, climbing),
  // the Jump straight, the S, the Dive, the Hairpin (150 left, banked 38, walled), the Climb, the Kink, the Home bend,
  // the run-in); [x, y, z, bank]. Its pieces as fractions of the lap, for the course below
  var LAP = [[0.0,30.0,0.0,0],[25.7,30.0,0.0,0],[51.4,30.0,0.0,0],[77.1,30.0,0.0,0],[102.8,30.0,0.0,0],[128.5,30.0,0.0,0],[154.3,30.0,0.0,0],[180.0,30.0,0.0,0],[205.7,30.0,0.0,11.9],[218.5,30.6,-1.3,6.4],[230.9,31.2,-5.0,12.8],[242.3,31.9,-11.1,19.1],[252.3,32.5,-19.3,25.5],[260.5,33.1,-29.3,31.9],[266.6,33.8,-40.7,34],[270.4,34.4,-53.1,34],[271.7,35.0,-66.0,34],[270.4,35.6,-78.9,34],[266.6,36.2,-91.3,34],[260.5,36.9,-102.7,31.9],[252.3,37.5,-112.7,25.5],[242.3,38.1,-120.9,19.1],[230.9,38.8,-127.0,12.8],[218.5,39.4,-130.7,6.4],[205.7,40.0,-132.0,0],[180.7,39.0,-132.0,0],[155.7,38.0,-132.0,0],[130.7,37.0,-132.0,0],[105.7,36.0,-132.0,0],[80.7,35.0,-132.0,0],[55.7,34.0,-132.0,-8.4],[43.2,33.4,-133.6,-14.4],[31.7,32.8,-138.4,-24],[21.7,32.2,-146.1,-24],[14.1,31.6,-156.0,-14.4],[9.3,31.0,-167.6,8.4],[4.5,30.4,-179.2,14.4],[-3.1,29.8,-189.1,24],[-13.1,29.2,-196.7,24],[-24.6,28.6,-201.5,14.4],[-37.1,28.0,-203.2,0],[-63.7,25.7,-203.2,0],[-90.4,23.3,-203.2,0],[-117.1,21.0,-203.2,0],[-143.7,18.7,-203.2,0],[-170.4,16.3,-203.2,0],[-197.1,14.0,-203.2,13.3],[-208.9,14.0,-200.5,19.0],[-218.5,14.0,-193.2,38],[-224.1,14.0,-182.4,38],[-224.6,14.0,-170.3,38],[-220.0,14.0,-159.1,19.0],[-211.1,14.0,-150.9,0],[-191.5,16.5,-139.6,0],[-172.0,19.0,-128.4,-7.7],[-161.7,19.8,-121.2,-11.0],[-152.8,20.7,-112.3,-22],[-145.6,21.5,-102.0,-22],[-140.3,22.3,-90.6,-22],[-137.1,23.2,-78.5,-11.0],[-136.0,24.0,-66.0,10.5],[-134.7,24.5,-53.1,11.2],[-131.0,25.0,-40.7,22.5],[-124.9,25.5,-29.3,30],[-116.7,26.0,-19.3,30],[-106.7,26.5,-11.1,30],[-95.3,27.0,-5.0,22.5],[-82.9,27.5,-1.3,11.2],[-70.0,28.0,0.0,0],[-46.7,28.7,0.0,0],[-23.3,29.3,-0.0,0]];
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
    hazards: [{ kind: 'meteor', from: 0.57, to: 0.69, every: 7 }, { kind: 'topple', at: 0.345, side: 'right', every: 11 }, { kind: 'crossing', at: 0.83, every: 9 }],
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
  // a vinyl toy's materials: soft, a little clearcoat, the colours of the renders
  var T = null, MATS = {};
  function vinyl(c, o) {
    o = o || {};
    var k = c + '|' + (o.r || 0.5) + '|' + (o.e || '') + '|' + (o.m || 0) + '|' + (o.t || '');
    if (MATS[k]) return MATS[k];
    var m = new T.MeshPhysicalMaterial({ color: c, roughness: o.r != null ? o.r : 0.5, metalness: o.m || 0, clearcoat: o.cc != null ? o.cc : 0.35, clearcoatRoughness: 0.4 });
    if (o.e) { m.emissive = new T.Color(o.e); m.emissiveIntensity = o.ei || 1.2; }
    if (o.t) { m.transparent = true; m.opacity = o.t; }
    MATS[k] = m; return m;
  }
  // (a part turned before it is added: Object3D.add returns the parent, so add(part).rotation turns the parent)
  function rot(o, ax, v) { o.rotation[ax] = v; return o; }
  function rotS(o, x, y, z) { o.rotation.set(x, y, z); return o; }
  function mesh(g, m, x, y, z) { var o = new T.Mesh(g, m); o.position.set(x || 0, y || 0, z || 0); o.castShadow = true; return o; }
  function sph(r, m, x, y, z, sx, sy, sz) { var o = mesh(new T.SphereGeometry(r, 20, 14), m, x, y, z); o.scale.set(sx || 1, sy || 1, sz || 1); return o; }
  function cap(r, len, m, x, y, z) { return mesh(new T.CapsuleGeometry(r, len, 6, 14), m, x, y, z); }
  function cyl(r0, r1, h, m, x, y, z, seg) { return mesh(new T.CylinderGeometry(r0, r1, h, seg || 18), m, x, y, z); }
  function box(w, h, d, m, x, y, z) { return mesh(new T.BoxGeometry(w, h, d), m, x, y, z); }
  function tor(r, t, m, x, y, z, arc) { return mesh(new T.TorusGeometry(r, t, 10, 28, arc || Math.PI * 2), m, x, y, z); }
  // a tube between two points (a sleeve, a leg, a stick)
  function limb(a, b, r0, r1, m) {
    var A = new T.Vector3(a[0], a[1], a[2]), B = new T.Vector3(b[0], b[1], b[2]), len = A.distanceTo(B);
    var o = cyl(r1, r0, len, m, 0, 0, 0, 14); o.position.copy(A).add(B).multiplyScalar(0.5);
    o.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), B.clone().sub(A).normalize()); return o;
  }

  // the cartoon glove: a round palm, four chunky fingers curled round the wheel, a thumb, a rolled cuff
  function glove(side) {
    var g = new T.Group(), w = vinyl('#F7F5F0', { r: 0.42 });
    g.add(sph(0.085, w, 0, 0, 0, 1.05, 0.9, 0.85));
    for (var i = 0; i < 4; i++) { var f = cap(0.028, 0.05, w, -0.045 + i * 0.03, 0.02, 0.07); f.rotation.x = 1.2; g.add(f); }
    var th = cap(0.03, 0.05, w, side * 0.075, 0.03, 0.02); th.rotation.z = side * 0.9; g.add(th);
    var cuff = tor(0.072, 0.024, w, 0, -0.02, -0.07); g.add(cuff);
    return g;
  }
  // shoes: big rounded toes, a thick sole; flip-flops and slippers lower
  function shoe(o, side) {
    var g = new T.Group(), up = vinyl(o.color, { r: 0.55 }), sole = vinyl(o.sole || '#EDEDED', { r: 0.7 });
    if (o.kind === 'flipflop') {
      g.add(box(0.15, 0.03, 0.3, up, 0, 0.015, 0.02));
      g.add(limb([0, 0.03, 0.08], [side * 0.05, 0.09, -0.02], 0.012, 0.012, vinyl('#E8E8E8')));
      return g;
    }
    var h = o.kind === 'boot' ? 0.2 : o.kind === 'slipper' ? 0.08 : 0.13;
    g.add(sph(0.11, up, 0, h * 0.5, 0.05, 0.85, h * 6, 1.45));
    g.add(box(0.2, 0.045, 0.36, sole, 0, 0.02, 0.03));
    if (o.kind === 'sneaker') { g.add(tor(0.07, 0.012, vinyl('#FFFFFF'), 0, h * 0.95, -0.03)); }
    if (o.slime) { g.add(sph(0.05, vinyl('#9BE34A', { r: 0.2, cc: 0.9 }), side * 0.06, h * 0.9, 0.12, 1, 0.6, 1)); g.add(sph(0.035, vinyl('#9BE34A', { r: 0.2, cc: 0.9 }), -side * 0.04, h, -0.02, 1, 0.5, 1)); }
    return g;
  }
  // what floats where the head would be: the hat, the glasses, the mouth's and the ear's props. y 0 is the head's middle
  function head(F) {
    var g = new T.Group(), H = F.hat || {}, E = F.eyes || {};
    if (F.top.hood === 'up') {
      // the hood standing up round an invisible head, a glimpse of pink inside (#4958's face)
      var hood = mesh(new T.SphereGeometry(0.2, 22, 16, 0, Math.PI * 2, 0, Math.PI * 0.62), vinyl(F.top.color), 0, 0.02, -0.02); hood.scale.set(1, 1.15, 1.05); hood.rotation.x = -0.35; g.add(hood);
      g.add(sph(0.15, vinyl(F.top.face, { r: 0.6 }), 0, -0.01, 0.05, 1, 1.15, 0.6));
    }
    if (H.kind === 'cap') {
      g.add(mesh(new T.SphereGeometry(0.17, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2), vinyl(H.color), 0, 0.08, 0));
      var br = cyl(0.13, 0.13, 0.025, vinyl(H.brim), 0, 0.09, H.back ? -0.17 : 0.17); br.scale.set(1, 1, 0.75); g.add(br);
      g.add(box(0.12, 0.03, 0.01, vinyl('#3A6FD8'), 0, 0.13, 0.16));
    } else if (H.kind === 'bucket') {
      g.add(cyl(0.15, 0.17, 0.14, vinyl(H.color, { r: 0.75 }), 0, 0.14, 0));
      g.add(cyl(0.26, 0.26, 0.02, vinyl(H.color, { r: 0.75 }), 0, 0.07, 0));
    } else if (H.kind === 'beanie') {
      g.add(mesh(new T.SphereGeometry(0.175, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2), vinyl(H.color, { r: 0.8 }), 0, 0.06, 0));
      g.add(rot(tor(0.165, 0.035, vinyl(H.color, { r: 0.8 }), 0, 0.07, 0), 'x', Math.PI / 2));
    } else if (H.kind === 'helmet') {
      g.add(sph(0.21, vinyl(H.color, { r: 0.3, cc: 0.9 }), 0, 0.05, -0.01, 1, 1, 1.05));
      var cage = vinyl('#E9E9E9');
      for (var b = 0; b < 3; b++) g.add(limb([-0.14, -0.06 + b * 0.05, 0.17], [0.14, -0.06 + b * 0.05, 0.17], 0.012, 0.012, cage));
      g.add(sph(0.12, vinyl('#5A3A26', { r: 0.6 }), 0, -0.02, 0.06, 1, 1, 0.5));
    } else if (H.kind === 'headband') {
      var hb = tor(0.165, 0.035, vinyl(H.color), 0, 0.09, 0); hb.rotation.x = Math.PI / 2; g.add(hb);
      g.add(mesh(new T.SphereGeometry(0.16, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.42), vinyl(H.color), 0, 0.12, 0));
    } else if (H.kind === 'captain') {
      g.add(cyl(0.2, 0.15, 0.1, vinyl(H.color), 0, 0.16, 0));
      g.add(cyl(0.14, 0.14, 0.05, vinyl('#151515'), 0, 0.1, 0));
      var vz = cyl(0.13, 0.13, 0.02, vinyl('#151515', { r: 0.2, cc: 1 }), 0, 0.09, 0.1); vz.scale.set(1, 1, 0.6); g.add(vz);
      g.add(sph(0.035, vinyl('#F2C230', { m: 0.6, r: 0.3 }), 0, 0.15, 0.15));
    }
    // the eyes
    var fr = vinyl(E.color || '#151515', { r: 0.35 });
    if (E.kind === 'shades') {
      [-1, 1].forEach(function (s) { g.add(sph(0.07, vinyl('#0A0A0A', { r: 0.1, cc: 1 }), s * 0.075, 0.0, 0.17, 1.15, 0.85, 0.35)); });
      g.add(box(0.06, 0.018, 0.02, fr, 0, 0.02, 0.18));
    } else if (E.kind === 'nerd') {
      [-1, 1].forEach(function (s) { g.add(tor(0.06, 0.018, fr, s * 0.075, 0.0, 0.17)); g.add(sph(0.055, vinyl('#DDEBF5', { t: 0.35, r: 0.05 }), s * 0.075, 0, 0.165, 1, 1, 0.15)); });
      g.add(box(0.04, 0.016, 0.016, fr, 0, 0.01, 0.17));
    } else if (E.kind === 'rainbow') {
      var cols = ['#E8423A', '#F4A13A', '#F7E04A', '#53C26B', '#3D86E8', '#8A5BE0'];
      [-1, 1].forEach(function (s) { for (var c = 0; c < cols.length; c++) { var r = tor(0.065 - c * 0.01, 0.007, vinyl(cols[c], { e: cols[c], ei: 0.35 }), s * 0.08, 0, 0.17 + c * 0.002); g.add(r); } });
      g.add(box(0.04, 0.016, 0.016, vinyl('#F0F0F0'), 0, 0.01, 0.17));
    } else if (E.kind === 'vr') {
      g.add(box(0.3, 0.1, 0.12, vinyl('#F4F4F4', { r: 0.3, cc: 0.8 }), 0, 0, 0.12));
      g.add(box(0.2, 0.035, 0.01, vinyl('#E2453A', { e: '#FF3A2A', ei: 1.4 }), 0, 0, 0.185));
      // the moon on the visor's screen, floating beside it (the render's panel)
      var scr = box(0.32, 0.3, 0.015, vinyl('#EEF6FA', { t: 0.85, r: 0.1 }), 0.42, 0.12, 0.05); scr.rotation.y = -0.4; g.add(scr);
      g.add(rot(tor(0.05, 0.01, vinyl('#E2453A', { e: '#FF3A2A', ei: 1.2 }), 0.42, 0.14, 0.065), 'y', -0.4));
    } else if (E.kind === 'white') {
      [-1, 1].forEach(function (s) { g.add(tor(0.058, 0.016, vinyl('#F4F4F4'), s * 0.075, 0, 0.17)); });
    }
    // the mouth
    if (F.mouth === 'cigar') { var cg = cyl(0.022, 0.022, 0.16, vinyl('#7A4A2A', { r: 0.7 }), 0.03, -0.12, 0.2); cg.rotation.x = Math.PI / 2 - 0.25; g.add(cg); g.add(sph(0.022, vinyl('#FF5A1A', { e: '#FF4A10', ei: 2.2 }), 0.03, -0.14, 0.28)); }
    if (F.mouth === 'stick') { var st = cyl(0.012, 0.012, 0.14, vinyl('#F7F3EA'), 0.04, -0.12, 0.2); st.rotation.x = Math.PI / 2 - 0.2; st.rotation.z = -0.3; g.add(st); g.add(sph(0.014, vinyl('#E2453A', { e: '#FF4A20', ei: 1.5 }), 0.07, -0.135, 0.27)); }
    if (F.mouth === 'bandana') { var bd = mesh(new T.ConeGeometry(0.17, 0.22, 3), vinyl('#E2352F', { r: 0.8 }), 0, -0.13, 0.08); bd.rotation.set(Math.PI, 0, 0); bd.scale.set(1, 1, 0.45); g.add(bd); }
    if (F.ear === 'pencil') { var pc = cyl(0.014, 0.014, 0.22, vinyl('#F2C230'), 0.17, 0.05, 0.02); pc.rotation.z = 1.2; g.add(pc); }
    if (F.ear === 'buds') { [-1, 1].forEach(function (s) { g.add(sph(0.03, vinyl('#F7F7F7', { cc: 1 }), s * 0.18, -0.02, 0.02)); }); }
    return g;
  }
  // the body: what is worn, shaped round nobody. Seated: the torso upright over the seat, the arms out to the wheel
  function body(F) {
    var g = new T.Group(), O = F.top, c = vinyl(O.color, { r: 0.6 });
    // the torso: a soft barrel, open at the neck
    var tor0 = mesh(new T.CylinderGeometry(0.2, 0.25, 0.42, 22, 1, true), c, 0, 0.21, 0); tor0.material = c; g.add(tor0);
    g.add(sph(0.25, c, 0, 0.0, 0, 1, 0.35, 0.95));
    var neck = O.kind === 'turtleneck' ? 0.11 : 0.04;
    g.add(rot(tor(0.13, 0.05 + neck * 0.3, vinyl(O.kind === 'jacket' ? O.collar : O.kind === 'vest' ? O.shirt : O.color, { r: 0.6 }), 0, 0.43, 0), 'x', Math.PI / 2));
    if (O.kind === 'turtleneck') g.add(cyl(0.12, 0.13, 0.12, c, 0, 0.48, 0));
    if (O.kind === 'jacket') { g.add(box(0.12, 0.36, 0.02, vinyl(O.inner), 0, 0.22, 0.235)); }
    if (O.kind === 'hoodie') { g.add(box(0.26, 0.1, 0.04, vinyl(O.color, { r: 0.7 }), 0, 0.12, 0.22)); if (O.hood === 'down') g.add(sph(0.17, vinyl(O.color, { r: 0.7 }), 0, 0.42, -0.16, 1.2, 0.6, 0.8)); g.add(limb([-0.05, 0.4, 0.2], [-0.06, 0.25, 0.24], 0.01, 0.01, vinyl('#F4F4F4'))); g.add(limb([0.05, 0.4, 0.2], [0.06, 0.25, 0.24], 0.01, 0.01, vinyl('#F4F4F4'))); }
    if (O.kind === 'varsity') { g.add(box(0.03, 0.38, 0.02, vinyl('#F4F1EA'), 0, 0.22, 0.24)); g.add(rot(tor(0.21, 0.025, vinyl('#F4F1EA'), 0, 0.02, 0), 'x', Math.PI / 2)); }
    if (O.kind === 'coat') {
      g.add(box(0.1, 0.36, 0.02, vinyl(O.under), 0, 0.22, 0.235)); g.add(box(0.035, 0.26, 0.015, vinyl(O.tie), 0, 0.24, 0.25));
      var skirt = mesh(new T.CylinderGeometry(0.27, 0.34, 0.24, 22, 1, true), c, 0, -0.1, 0); skirt.material = c; g.add(skirt);
    }
    if (O.kind === 'vest') { var sh = vinyl(O.shirt, { r: 0.6 }); g.add(rotS(mesh(new T.ConeGeometry(0.1, 0.22, 3), sh, 0, 0.33, 0.21), Math.PI, 0, 0)); g.add(rot(tor(0.235, 0.02, vinyl('#F4F4F4'), 0, 0.42, 0), 'x', Math.PI / 2)); }
    if (F.fanny) { var fp = box(0.26, 0.09, 0.07, vinyl(F.fanny, { r: 0.6 }), 0.0, 0.02, 0.24); fp.rotation.x = -0.1; g.add(fp); g.add(rot(tor(0.255, 0.012, vinyl('#2A2A2A'), 0, 0.03, 0), 'x', Math.PI / 2)); }
    return g;
  }
  // the props each one carries, set about the kart (a racer's hands are on the wheel)
  function props(F, kart, drv) {
    var live = [];
    F.props.forEach(function (p) {
      if (p === 'candle') {
        var cd = new T.Group(); cd.add(cyl(0.05, 0.05, 0.03, vinyl('#E9C46A', { m: 0.5, r: 0.3 }), 0, 0, 0)); cd.add(cyl(0.025, 0.025, 0.11, vinyl('#FBF6EC'), 0, 0.07, 0));
        var fl = sph(0.022, new T.MeshBasicMaterial({ color: new T.Color('#FFB43A').multiplyScalar(2.2) }), 0, 0.15, 0, 1, 1.7, 1); cd.add(fl);
        cd.position.set(F.props.length > 2 ? -0.4 : 0.42, 0.62, 0.68); kart.add(cd); live.push(function (t) { fl.scale.set(1 + 0.15 * Math.sin(t * 31), 1.7 + 0.35 * Math.sin(t * 23), 1); });
      } else if (p === 'float') {
        // a pool float round the waist with a duck's head
        var fr = tor(0.3, 0.09, vinyl('#F7D23A', { r: 0.3, cc: 0.9 }), 0, 0.02, 0); fr.rotation.x = Math.PI / 2; drv.add(fr);
        var dk = new T.Group(); dk.add(sph(0.09, vinyl('#F7D23A', { r: 0.3, cc: 0.9 }), 0, 0, 0)); dk.add(sph(0.04, vinyl('#F28A2A'), 0, -0.01, 0.09, 1.3, 0.6, 1)); dk.position.set(0.22, 0.12, 0.22); drv.add(dk);
      } else if (p === 'bucket') {
        var bk = new T.Group(); bk.add(cyl(0.11, 0.08, 0.18, vinyl('#F4F4F4'), 0, 0, 0)); bk.add(sph(0.05, vinyl('#E2453A'), 0, 0.12, 0)); bk.position.set(-0.62, 0.42, -0.35); kart.add(bk);
      } else if (p === 'stick') {
        var hs = limb([0.3, 0.3, -0.7], [0.55, 1.6, -0.9], 0.02, 0.02, vinyl('#A26A3A', { r: 0.7 })); kart.add(hs); kart.add(sph(0.04, vinyl('#E2453A'), 0.55, 1.62, -0.9));
      } else if (p === 'ball') {
        var bb = new T.Group(), bm = sph(0.16, vinyl('#E07A2A', { r: 0.6 }), 0, 0, 0); bb.add(bm); [0, 1].forEach(function (k) { var l = tor(0.162, 0.006, vinyl('#3A1E10'), 0, 0, 0); l.rotation.y = k * Math.PI / 2; bb.add(l); });
        bb.position.set(F.props.indexOf('ball') === 0 ? 0 : 0.45, 0.75, -1.05); kart.add(bb); live.push(function (t, dt, s) { bb.rotation.x += dt * (2 + s.speed * 0.4); });
      } else if (p === 'board') {
        var sk = new T.Group(); sk.add(box(0.22, 0.03, 0.8, vinyl('#F4E1C1'), 0, 0, 0)); [-0.28, 0.28].forEach(function (z) { [-1, 1].forEach(function (s) { sk.add(rot(cyl(0.035, 0.035, 0.03, vinyl('#E2453A'), s * 0.09, -0.04, z), 'z', Math.PI / 2)); }); });
        sk.position.set(0, 0.85, -1.08); sk.rotation.x = -1.35; kart.add(sk);
      } else if (p === 'wand') {
        var wd = limb([0.55, 0.5, -0.9], [0.62, 1.55, -1.0], 0.012, 0.012, vinyl('#1A1A1A')); kart.add(wd);
        var star = mesh(new T.OctahedronGeometry(0.08), new T.MeshBasicMaterial({ color: new T.Color('#FFE86A').multiplyScalar(2) }), 0.62, 1.6, -1.0); kart.add(star); live.push(function (t) { star.rotation.y = t * 3; });
      } else if (p === 'pack') {
        var pk = new T.Group(); pk.add(box(0.36, 0.42, 0.18, vinyl('#4D8A55', { r: 0.7 }), 0, 0, 0)); var mat = cyl(0.08, 0.08, 0.42, vinyl('#E8913A', { r: 0.7 }), 0, 0.27, 0); mat.rotation.z = Math.PI / 2; pk.add(mat);
        pk.add(cyl(0.05, 0.05, 0.2, vinyl('#E85AB0'), 0.22, 0.08, 0)); pk.position.set(0, 0.25, -0.23); drv.add(pk);
      } else if (p === 'flask') {
        var fk = new T.Group(); fk.add(sph(0.1, vinyl('#E6F4EA', { t: 0.45, r: 0.05, cc: 1 }), 0, 0, 0)); fk.add(sph(0.08, vinyl('#7BE34A', { e: '#6AF03A', ei: 0.9, r: 0.2 }), 0, -0.02, 0, 1, 0.7, 1)); fk.add(cyl(0.03, 0.03, 0.1, vinyl('#E6F4EA', { t: 0.45 }), 0, 0.12, 0));
        fk.position.set(-0.42, 0.66, 0.66); kart.add(fk);
      } else if (p === 'rod') {
        // the fishing pole over the bonnet with its fish dangling ahead, swinging with the speed (the carrot on a stick)
        var rod = limb([0.25, 0.75, 0.1], [0.15, 1.35, 1.6], 0.018, 0.01, vinyl('#B87A3A', { r: 0.6 })); kart.add(rod);
        var line = limb([0.15, 1.35, 1.6], [0.15, 0.95, 1.6], 0.004, 0.004, vinyl('#F4F4F4')); kart.add(line);
        var fish = new T.Group(); fish.add(sph(0.13, vinyl('#43C9C2', { r: 0.4 }), 0, 0, 0, 1, 1, 1.25)); fish.add(rot(mesh(new T.ConeGeometry(0.09, 0.14, 3), vinyl('#43C9C2'), 0, 0, -0.18), 'x', Math.PI / 2));
        fish.add(sph(0.035, vinyl('#FFFFFF'), 0.08, 0.05, 0.1)); fish.add(sph(0.03, vinyl('#E85AB0'), 0, 0.12, 0, 1.6, 0.5, 1));
        var hang = new T.Group(); hang.position.set(0.15, 0.95, 1.6); fish.position.set(0, -0.12, 0); hang.add(fish); kart.add(hang);
        live.push(function (t, dt, s) { hang.rotation.x = -0.25 * Math.min(1, s.speed / 30) + 0.12 * Math.sin(t * 5.3); hang.rotation.z = -s.steer * 0.4 + 0.08 * Math.sin(t * 4.1); });
      } else if (p === 'dizzy') {
        var halo = new T.Group(); for (var i = 0; i < 5; i++) { var sp = mesh(new T.OctahedronGeometry(0.045), new T.MeshBasicMaterial({ color: new T.Color('#FFE14D').multiplyScalar(1.8) }), Math.cos(i * 1.256) * 0.22, 0, Math.sin(i * 1.256) * 0.22); halo.add(sp); }
        halo.add(rot(tor(0.22, 0.008, new T.MeshBasicMaterial({ color: '#FFFFFF' }), 0, 0, 0), 'x', Math.PI / 2));
        halo.position.set(0, 1.75, -0.15); kart.add(halo); live.push(function (t) { halo.rotation.y = t * 2.2; halo.position.y = 1.75 + 0.03 * Math.sin(t * 3); });
      }
    });
    return live;
  }
  // the kart's glass: tinted in the racer's colour, an iridescent film, a little glow of its own (glassmorphism)
  function glassOf(c) {
    var k = 'glass|' + c; if (MATS[k]) return MATS[k];
    var m = new T.MeshPhysicalMaterial({ color: c, roughness: 0.06, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, iridescence: 0.9, iridescenceIOR: 1.35, emissive: c, emissiveIntensity: 0.35, transparent: true, opacity: 0.46, iridescenceThicknessRange: [180, 620] });
    MATS[k] = m; return m;
  }
  // the kart: a rounded tub in the racer's colour, side pods, a spoiler, four fat wheels, a wheel to steer
  var GLOW_TEX = null;
  function glowTex(ctx) {
    if (GLOW_TEX) return GLOW_TEX;
    GLOW_TEX = ctx.textures.canvas(128, 128, function (g, W, H) { var rg = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W / 2); rg.addColorStop(0, 'rgba(255,255,255,0.9)'); rg.addColorStop(0.5, 'rgba(255,255,255,0.35)'); rg.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = rg; g.fillRect(0, 0, W, H); });
    return GLOW_TEX;
  }
  function kart(F) {
    var g = new T.Group(), p = glassOf(F.kart), tr = vinyl(F.trim, { r: 0.3, cc: 0.8, e: F.trim, ei: 0.35 }), dk = vinyl('#1C1D22', { r: 0.6 });
    var tub = sph(0.62, p, 0, 0.42, 0.05, 1.0, 0.42, 1.85); g.add(tub);
    g.add(box(1.0, 0.12, 1.5, dk, 0, 0.3, 0.1));
    g.add(sph(0.3, p, 0, 0.42, 1.05, 1.5, 0.6, 1.1));
    [-1, 1].forEach(function (s) { g.add(rot(cap(0.13, 0.9, tr, s * 0.62, 0.36, 0), 'x', Math.PI / 2)); });
    // the seat back, glass; a ring of light round the tub's rim
    g.add(box(0.5, 0.36, 0.08, p, 0, 0.62, -0.42));
    var rimL = tor(0.6, 0.025, new T.MeshBasicMaterial({ color: new T.Color(F.trim).multiplyScalar(1.3) }), 0, 0.6, 0.05); rimL.rotation.x = Math.PI / 2; rimL.scale.set(1, 1.75, 1); g.add(rimL);
    // the underglow: a pool of the racer's colour on the road under it
    var glow = new T.Mesh(new T.PlaneGeometry(2.2, 3.4), new T.MeshBasicMaterial({ map: GLOW_TEX, color: new T.Color(F.kart).multiplyScalar(1.6), transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
    glow.rotation.x = -Math.PI / 2; glow.position.y = 0.06; glow.renderOrder = 3; g.add(glow);
    // the number roundel on the nose
    g.add(rot(cyl(0.16, 0.16, 0.02, vinyl('#FFFFFF'), 0, 0.66, 0.98), 'x', 1.25));
    var wheels = [], wr = 0.27, tyre = vinyl('#16171B', { r: 0.85, cc: 0 }), rim = vinyl(F.trim, { r: 0.25, m: 0.4 });
    [[-0.68, 0.72], [0.68, 0.72], [-0.7, -0.78], [0.7, -0.78]].forEach(function (q, i) {
      var hub = new T.Group(); hub.position.set(q[0], wr, q[1]);
      var w = new T.Group(); var t0 = cyl(wr, wr, i < 2 ? 0.26 : 0.34, tyre, 0, 0, 0, 22); t0.rotation.z = Math.PI / 2; w.add(t0);
      var r0 = cyl(wr * 0.6, wr * 0.6, (i < 2 ? 0.26 : 0.34) + 0.02, rim, 0, 0, 0, 12); r0.rotation.z = Math.PI / 2; w.add(r0);
      hub.add(w); g.add(hub); wheels.push({ hub: hub, spin: w, front: i < 2 });
    });
    var wheelG = new T.Group(); wheelG.position.set(0, 0.86, 0.5); wheelG.rotation.x = -0.55;
    var ring = tor(0.17, 0.028, dk, 0, 0, 0); wheelG.add(ring); wheelG.add(box(0.3, 0.03, 0.03, dk, 0, 0, 0));
    g.add(wheelG);
    return { g: g, wheels: wheels, wheelG: wheelG, wr: wr };
  }
  function friend(ctx, F) {
    T = ctx.THREE; glowTex(ctx);
    var root = new T.Group(), K = kart(F), D = new T.Group();
    root.add(K.g);
    // the driver: hips on the seat, the torso up, the head's things floating over it
    D.position.set(0, 0.55, -0.18); D.scale.setScalar(1.35); K.g.add(D);
    var B = body(F); D.add(B);
    var Hd = head(F); Hd.position.set(0, 0.68, 0.02); D.add(Hd);
    // the legs out to the pedals (thighs and shins in the trousers), the shoes up at the front for the toy look
    var lg = vinyl(F.legs, { r: 0.65 });
    [-1, 1].forEach(function (s) {
      D.add(limb([s * 0.12, 0.0, 0.05], [s * 0.15, 0.08, 0.55], 0.1, 0.09, lg));
      var sh = shoe(F.shoes, s); sh.position.set(s * 0.17, -0.05, 0.62); sh.rotation.x = -0.3; D.add(sh);
    });
    // the arms: the sleeves from the shoulders to the gloves on the wheel; the gloves ride the wheel
    var sl = vinyl(F.top.kind === 'varsity' ? F.top.sleeves : F.top.kind === 'vest' ? F.top.shirt : F.top.color, { r: 0.6 });
    var gl = [], arms = [];
    [-1, 1].forEach(function (s) {
      var gv = glove(s); gv.position.set(s * 0.17, 0.0, 0.03); gv.rotation.x = 0.5; K.wheelG.add(gv); gl.push(gv);
      var short = F.sleeve === 'short';
      var arm = limb([s * 0.24, 0.38, 0.02], [s * 0.2, 0.22, 0.48], 0.075, short ? 0.06 : 0.07, sl); D.add(arm); arms.push(arm);
    });
    var live = props(F, K.g, D);
    // the far kart: the props and the small parts go (detail 'far')
    var small = [Hd]; live.forEach(function () {});
    root.userData.kartRacer = { stats: F.stats, persona: F.persona || undefined };
    root.traverse(function (o) { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    var bob = 0;
    return {
      object: root, name: F.name, color: F.kart, stats: F.stats,
      animate: function (t, dt, s) {
        s = s || {};
        var v = s.speed || 0, st = s.steer || 0;
        K.wheels.forEach(function (w) { w.spin.rotation.x += dt * v / K.wr; if (w.front) w.hub.rotation.y = st * 0.38; });
        K.wheelG.rotation.z = -st * 1.1;
        // the body leans into the bend and the drift, bounces on the road, squashes on a landing, cheers on the podium
        bob += dt * (6 + v * 0.3);
        D.rotation.z = -st * 0.14 - (s.drift || 0) * 0.12; D.position.y = 0.55 + 0.012 * Math.sin(bob) + (s.hop ? 0.05 : 0);
        Hd.rotation.y = s.gaze ? Math.max(-0.6, Math.min(0.6, s.gaze[0] * 0.6)) : (s.back ? 2.6 : st * 0.25);
        Hd.position.y = 0.68 + (s.celebrate ? 0.12 * Math.abs(Math.sin(t * 8)) : 0) + (s.boost ? 0.03 : 0);
        if (s.hit || s.spun) Hd.rotation.z = 0.3 * Math.sin(t * 30); else Hd.rotation.z = 0;
        var far = s.detail === 'far'; for (var i = 0; i < live.length; i++) live[i](t, dt, s, far);
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
    var at = [0.03, 0.12, 0.2, 0.27, 0.36, 0.5, 0.58, 0.64, 0.8, 0.9, 0.97], R = ctx.track.halfWidth + 3.5;
    var glass = new T0.MeshPhysicalMaterial({ color: '#FFFFFF', roughness: 0.05, iridescence: 1, iridescenceIOR: 1.4, clearcoat: 1, emissive: '#B98CFF', emissiveIntensity: 0.55, transparent: true, opacity: 0.7 });
    var shape = new T0.Shape(); for (var k = 0; k < 10; k++) { var a = k / 10 * Math.PI * 2 + Math.PI / 2, r = k % 2 ? 0.42 : 1; if (k) shape.lineTo(Math.cos(a) * r, Math.sin(a) * r); else shape.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
    var starG = new T0.ExtrudeGeometry(shape, { depth: 0.3, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.08, bevelSegments: 2 }); starG.center();
    var pal = ['#FFE14D', '#FF8AD8', '#8AE8FF', '#B8FF8A', '#FFB46A'], spin = [];
    at.forEach(function (f, i) {
      var d = f * L, F = ctx.track.frameAt(d), c = ctx.track.pointAt(d, 0, 2.5), hoop = new T0.Group();
      hoop.position.set(c.x, c.y, c.z); hoop.lookAt(c.x + F.tan.x, c.y + F.tan.y, c.z + F.tan.z);
      var ring = new T0.Mesh(new T0.TorusGeometry(R, 0.32, 12, 72), glass); hoop.add(ring);
      var inner = new T0.Mesh(new T0.TorusGeometry(R - 0.55, 0.08, 6, 72), new T0.MeshBasicMaterial({ color: new T0.Color('#FFFFFF').multiplyScalar(1.5) })); hoop.add(inner);
      var stars = new T0.Group();
      for (var k2 = 0; k2 < 8; k2++) { var a2 = k2 / 8 * Math.PI * 2, st = new T0.Mesh(starG, new T0.MeshBasicMaterial({ color: new T0.Color(pal[(k2 + i) % pal.length]).multiplyScalar(1.7) })); st.position.set(Math.cos(a2) * R, Math.sin(a2) * R, 0); st.scale.setScalar(0.85); stars.add(st); }
      hoop.add(stars); grp.add(hoop); spin.push({ s: stars, w: (i % 2 ? 1 : -1) * 0.35 });
    });
    // (hoops round the road, never across it: the runtime's corridor guard reads their boxes, which do cross it)
    grp.traverse(function (o) { if (o.isMesh) o.userData.gmTrack = true; });
    return { group: grp, update: function (t) { for (var i = 0; i < spin.length; i++) { spin[i].s.rotation.z = t * spin[i].w; for (var q = 0; q < spin[i].s.children.length; q++) spin[i].s.children[q].rotation.z = -t * 1.5; } } };
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
    var planet = new T0.Mesh(new T0.SphereGeometry(140, 48, 32), new T0.MeshStandardMaterial({ map: ptex, roughness: 0.8, emissive: '#3A1660', emissiveIntensity: 0.35, fog: false }));
    planet.position.set(620, 160, -560); planet.rotation.z = 0.35; grp.add(planet);
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
    graphics: { preset: 'kart', exposure: 1.05, bloom: { strength: 0.55, threshold: 1.3, radius: 0.6 }, grade: { contrast: 1.04, saturation: 1.18, warmth: -0.02, vignette: 0.22 }, shadows: { extent: 30, mapSize: 2048 } },
    track: { width: ROAD, points: LAP },
    kart: { laps: 3, class: 'normal', course: COURSE, driftAssist: true,
      fx: { skids: '#FFFFFF', skidOpacity: 0.3, rush: true, hype: true, smoke: '#B9A8FF' } },
    music: { style: 'synthwave', key: 'A', mode: 'minor', tempo: 148, seed: 'Invisible World' },
    build: function (ctx) {
      var T0 = ctx.THREE;
      ctx.scene.background = new T0.Color('#0A0820');
      ctx.scene.fog = new T0.FogExp2('#140B30', 0.0011);
      // the light: a cool key from above the planet's side (the one shadow), a violet sky light, a warm fill from below
      var key = new T0.DirectionalLight('#E8EEFF', 2.6); key.position.set(0.5, 1, 0.35); key.castShadow = true; ctx.scene.add(key);
      ctx.scene.add(new T0.HemisphereLight('#B9A4FF', '#3A1E5A', 1.25));
      var fill = new T0.DirectionalLight('#FF9AD6', 0.7); fill.position.set(-0.4, -0.3, -0.6); ctx.scene.add(fill);
      var R = rainbowRoad(ctx); ctx.scene.add(R.group);
      ctx.scene.add(rails(ctx));
      var S = space(ctx); ctx.scene.add(S.group);
      var RG = starRings(ctx); ctx.scene.add(RG.group);
      LIVE = { road: R, space: S, rings: RG };
    },
    update: function (ctx, t) {
      if (!LIVE) return;
      // the road's light runs towards you, a band of light every second
      LIVE.road.uniforms.uT.value = t;
      LIVE.space.update(t, ctx.camera);
      LIVE.rings.update(t);
    },
    player: function (ctx) { return friend(ctx, FRIENDS[0]); },
    rival: function (ctx, k) { return friend(ctx, FRIENDS[k % FRIENDS.length]); },
  });
})();
