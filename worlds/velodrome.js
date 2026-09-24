// Velodrome 2028
//
// A first-party GameMog world: endless laps of an indoor velodrome, on runtime
// v1 with cinematic graphics, banked tracks and the cyclist kit. A 333 m
// board track of Siberian pine, 8 m wide, banked 42 degrees through the bends
// and 13 on the straights, with the blue côte d'azur inside it and the black,
// red and blue lines painted round it; stands full of fans rising behind the
// safety glass, a steel roof of trusses and light rigs, the infield's team
// pens, and track sprinters on disc-wheeled bikes who lean into the bends at
// the angle the banking was built for. The rules are the runtime's; the
// velodrome is this file's.

(function () {
  var PI = Math.PI, TAU = PI * 2;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function smooth(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  /* ----------------------------------------------------------- layout -- */
  // Anticlockwise, as every velodrome is ridden: the infield on the left, the
  // banking rising to the right. Centre line: two straights of S metres and
  // two bends of radius R round the ends. The inner edge sits 0.9 m above the
  // infield, so the côte d'azur below it clears the floor even at 42 degrees;
  // the centre line rises with the bank.
  var TW = 8, HW = TW / 2, S = 60, R = 34, EDGE = 0.9;
  var BEND = 42, STRAIGHT = 13;
  function bankAt(u) {
    // u: 0..1 round the lap; bends between the straights, eased in and out
    var per = 2 * S + 2 * PI * R, d = u * per;
    function inBend(x) { return smooth(-6, 10, x) * (1 - smooth(PI * R - 10, PI * R + 6, x)); }
    var b1 = inBend(d - S), b2 = inBend(d - 2 * S - PI * R);
    return STRAIGHT + (BEND - STRAIGHT) * Math.max(b1, b2);
  }
  function centreAt(u) {
    var per = 2 * S + 2 * PI * R, d = u * per, x, z;
    if (d < S) { x = -S / 2 + d; z = R; }
    else if (d < S + PI * R) { var a = (d - S) / R; x = S / 2 + Math.sin(a) * R; z = Math.cos(a) * R; }
    else if (d < 2 * S + PI * R) { x = S / 2 - (d - S - PI * R); z = -R; }
    else { var b = (d - 2 * S - PI * R) / R; x = -S / 2 - Math.sin(b) * R; z = -Math.cos(b) * R; }
    return [x, z];
  }
  var TRACK_POINTS = [];
  (function () {
    var n = 56;
    for (var i = 0; i < n; i++) {
      var u = (i + 0.5) / n, c = centreAt(u), bank = bankAt(u);
      TRACK_POINTS.push([+c[0].toFixed(3), +(EDGE + HW * Math.sin(bank * PI / 180)).toFixed(3), +c[1].toFixed(3), +bank.toFixed(2)]);
    }
  })();

  var W = { time: { value: 0 } };

  /* ---------------------------------------------------------- the cast -- */
  var PLAYER = { gender: 'male', name: 'HOLLAND', code: 'USA', top: '#15264F', trim: '#D22B3A', shorts: '#15264F', shoes: '#FFFFFF', skin: 'african', tint: '#FFFFFF', hair: 'none', height: 1.84, muscle: 0.85, frame: '#D22B3A', btrim: '#FFFFFF', helmet: '#FFFFFF', pattern: 'band', number: '11' };
  var RIVALS = [
    { gender: 'female', name: 'ASHWORTH', code: 'GBR', top: '#0B2A63', trim: '#E4002B', shorts: '#0B2A63', shoes: '#FFFFFF', skin: 'caucasian', tint: '#F4E6DC', height: 1.66, muscle: 0.7, frame: '#0B2A63', btrim: '#E4002B', helmet: '#0B2A63', pattern: 'band' },
    { gender: 'male', name: 'VISSER', code: 'NED', top: '#F07D1A', trim: '#FFFFFF', shorts: '#F07D1A', shoes: '#FFFFFF', skin: 'caucasian', tint: '#F4E6DC', height: 1.85, muscle: 0.9, frame: '#F07D1A', btrim: '#111111', helmet: '#F07D1A', pattern: 'plain' },
    { gender: 'female', name: 'LAROCHE', code: 'CAN', top: '#D8282F', trim: '#FFFFFF', shorts: '#111111', shoes: '#FFFFFF', skin: 'african', tint: '#FFFFFF', height: 1.69, muscle: 0.75, frame: '#D8282F', btrim: '#FFFFFF', helmet: '#FFFFFF', pattern: 'sash' },
    { gender: 'male', name: 'OKADA', code: 'JPN', top: '#FFFFFF', trim: '#D8282F', shorts: '#1B1B1B', shoes: '#D8282F', skin: 'asian', tint: '#FFFFFF', height: 1.76, muscle: 0.8, frame: '#FFFFFF', btrim: '#D8282F', helmet: '#D8282F', pattern: 'band' },
    { gender: 'female', name: 'HARTMANN', code: 'GER', top: '#111111', trim: '#FFCE00', shorts: '#111111', shoes: '#FFFFFF', skin: 'caucasian', tint: '#F4E6DC', height: 1.7, muscle: 0.75, frame: '#111111', btrim: '#FFCE00', helmet: '#111111', pattern: 'band' },
    { gender: 'male', name: 'CALLOWAY', code: 'AUS', top: '#1E7F4F', trim: '#F4C542', shorts: '#10301F', shoes: '#F4C542', skin: 'caucasian', tint: '#EAD0B8', height: 1.88, muscle: 0.88, frame: '#1E7F4F', btrim: '#F4C542', helmet: '#F4C542', pattern: 'yoke' },
    { gender: 'female', name: 'GROS', code: 'FRA', top: '#1D3F9E', trim: '#E4002B', shorts: '#1D3F9E', shoes: '#FFFFFF', skin: 'caucasian', tint: '#F4E6DC', height: 1.68, muscle: 0.72, frame: '#FFFFFF', btrim: '#1D3F9E', helmet: '#1D3F9E', pattern: 'split' },
    { gender: 'male', name: 'PAUL', code: 'TTO', top: '#E4002B', trim: '#111111', shorts: '#111111', shoes: '#FFFFFF', skin: 'african', tint: '#FFFFFF', height: 1.83, muscle: 0.95, frame: '#E4002B', btrim: '#FFFFFF', helmet: '#FFFFFF', pattern: 'sash' },
    { gender: 'female', name: 'ANDREWS', code: 'NZL', top: '#161616', trim: '#FFFFFF', shorts: '#161616', shoes: '#FFFFFF', skin: 'caucasian', tint: '#EAD0B8', height: 1.73, muscle: 0.8, frame: '#161616', btrim: '#FFFFFF', helmet: '#FFFFFF', pattern: 'band' },
    { gender: 'male', name: 'VIGIER', code: 'BEL', top: '#FFD83A', trim: '#E4002B', shorts: '#111111', shoes: '#111111', skin: 'caucasian', tint: '#F4E6DC', height: 1.8, muscle: 0.86, frame: '#111111', btrim: '#FFD83A', helmet: '#FFD83A', pattern: 'split' },
    { gender: 'female', name: 'ZHONG', code: 'CHN', top: '#DE2910', trim: '#FFDE00', shorts: '#DE2910', shoes: '#FFFFFF', skin: 'asian', tint: '#FFFFFF', height: 1.67, muscle: 0.74, frame: '#DE2910', btrim: '#FFDE00', helmet: '#DE2910', pattern: 'band' },
    { gender: 'male', name: 'QUINTERO', code: 'COL', top: '#FCD116', trim: '#003893', shorts: '#003893', shoes: '#CE1126', skin: 'caucasian', tint: '#C49A7C', height: 1.78, muscle: 0.84, frame: '#003893', btrim: '#FCD116', helmet: '#FCD116', pattern: 'yoke' },
  ];
  RIVALS.forEach(function (r, i) { r.number = String(20 + i * 7); r.label = r.name.charAt(0) + r.name.slice(1).toLowerCase() + ' (' + r.code + ')'; });
  PLAYER.label = 'Holland (USA)';

  GameMog.world({
    assets: ['human-athlete-male', 'human-athlete-female'],
    theme: { sky: '#1C2433', fog: '#3A342D', ink: '#0E1320', panel: '#FFFFFF', accent: '#E4002B', font: 'Saira Condensed' },
    graphics: {
      exposure: 1.15,
      environment: { extras: lightRigs, intensity: 1.2 },
      bloom: { strength: 0.5, threshold: 1.15, radius: 0.7 },
      grade: { contrast: 1.07, saturation: 1.06, warmth: 0.06, vignette: 0.3, grain: 0.014 },
      shadows: { extent: 34, mapSize: 2048 },
    },
    camera: { distance: 6.0, height: 2.4, fov: 60 },
    track: { width: TW, points: TRACK_POINTS },
    build: build,
    player: function (ctx) { return rider(ctx, PLAYER, 0); },
    rival: function (ctx, k) {
      var base = RIVALS[(k - 1) % RIVALS.length], round = Math.floor((k - 1) / RIVALS.length);
      var r = rider(ctx, Object.assign({}, base, { muscle: Math.min(1, base.muscle + round * 0.05) }), k);
      if (round) r.name += ' ' + (round + 1);
      return r;
    },
    obstacles: obstacles,
    update: update,
    ambient: ambient,
  });

  function rider(ctx, kit, k) {
    var id = kit.gender === 'female' ? 'human-athlete-female' : 'human-athlete-male';
    var r = ctx.assets && ctx.assets.ready && ctx.assets.ready(id) && ctx.assets.cyclist ? ctx.assets.cyclist(id, {
      skin: kit.skin, skinTint: kit.tint, hair: 'none', eyes: kit.skin === 'african' ? 'brown' : 'brownlight', height: kit.height,
      build: { muscle: kit.muscle, lean: 0.45 },
      outfit: { top: kit.top, trim: kit.trim, shorts: kit.shorts, shoes: kit.shoes, pattern: kit.pattern, bib: { name: kit.name, number: kit.number }, glow: k >= 9 ? 2.2 : 0 },
      bike: { kind: 'track', frame: kit.frame, trim: kit.btrim, rear: 'disc', front: 'five' },
      helmet: { kind: 'aero', color: kit.helmet, trim: kit.trim, visor: true },
      name: k === 0 ? PLAYER.label : kit.label, color: kit.top,
    }) : null;
    return r || fallbackRider(ctx, kit, k);
  }
  // if the library cannot load: a rider of capsules on a bike of tubes
  function fallbackRider(ctx, kit, k) {
    var T = ctx.THREE, o = new T.Group(), dark = new T.MeshStandardMaterial({ color: '#1A1B1E', roughness: 0.4 });
    var frame = new T.MeshStandardMaterial({ color: kit.frame, roughness: 0.3, metalness: 0.3 });
    var wheels = [-0.4, 0.58].map(function (z) { var w = new T.Mesh(new T.TorusGeometry(0.32, 0.03, 8, 24), dark); w.rotation.y = PI / 2; w.position.set(0, 0.34, z); o.add(w); return w; });
    var f = new T.Mesh(new T.BoxGeometry(0.05, 0.05, 0.9), frame); f.position.set(0, 0.7, 0.1); f.rotation.x = -0.15; o.add(f);
    var body = new T.Mesh(new T.CapsuleGeometry(0.18, 0.5, 4, 10), new T.MeshStandardMaterial({ color: kit.top, roughness: 0.5 }));
    body.position.set(0, 1.2, 0.05); body.rotation.x = 1.1; o.add(body);
    var head = new T.Mesh(new T.SphereGeometry(0.13, 12, 10), new T.MeshStandardMaterial({ color: kit.helmet, roughness: 0.3 })); head.position.set(0, 1.35, 0.42); o.add(head);
    o.traverse(function (m) { if (m.isMesh) m.castShadow = true; });
    return { object: o, name: k === 0 ? PLAYER.label : kit.label, color: kit.top, radius: 0.45, animate: function (t, dt, s) { wheels.forEach(function (w) { w.rotation.x += (s.speed || 0) / 0.34 * dt; }); } };
  }

  /* ------------------------------------------------------------ build -- */
  // the light rigs, also given to the image-based light so the varnish shines
  function lightRigs(ctx) {
    var T = ctx.THREE, g = new T.Group(), m = new T.MeshBasicMaterial({ color: '#FFF6E6' });
    for (var i = -3; i <= 3; i++) for (var j = -1; j <= 1; j++) {
      var p = new T.Mesh(new T.PlaneGeometry(10, 2.2), m); p.rotation.x = PI / 2; p.position.set(i * 16, 30, j * 22); g.add(p);
    }
    return g;
  }

  function build(ctx) {
    var THREE = ctx.THREE, scene = ctx.scene, low = ctx.quality === 'low';
    // light: rigs overhead, the hall's bounce warm off the pine
    // indoors the "sky" is the hall itself: warm grey above, the pine's glow below
    var key = new THREE.DirectionalLight('#FFF1DE', 3.4);
    key.position.set(24, 110, 40); key.castShadow = true;
    scene.add(key, new THREE.HemisphereLight('#FFF4E6', '#C08A55', 1.7));
    ctx.sky({ top: '#8C8478', horizon: '#BBAE9A', bottom: '#7A5F44', sun: [0.2, 0.9, 0.35], sunColor: '#FFF3E2', sunSize: 2, glow: 0.3, haze: 0.2 });
    scene.fog = new THREE.Fog('#3A342D', 160, 460);

    trackSurface(ctx);
    infield(ctx, low);
    stands(ctx, low);
    hall(ctx, low);
    scoreboards(ctx);
  }

  // Siberian pine: boards 5 cm wide running with the track, varnished
  function trackSurface(ctx) {
    var THREE = ctx.THREE, R0 = rng(4);
    var boards = ctx.textures.canvas(512, 256, function (g, w, h) {
      var n = 96, bw = w / n;
      for (var i = 0; i < n; i++) {
        var tone = 0.86 + R0() * 0.2, r = 214 * tone, gg = 170 * tone, b = 112 * tone;
        g.fillStyle = 'rgb(' + (r | 0) + ',' + (gg | 0) + ',' + (b | 0) + ')'; g.fillRect(i * bw, 0, bw, h);
        // grain and the end joints of the boards
        for (var k = 0; k < 6; k++) { g.fillStyle = 'rgba(110,70,32,' + (0.1 + R0() * 0.14) + ')'; g.fillRect(i * bw + R0() * bw, 0, 0.8, h); }
        var jy = R0() * h; g.fillStyle = 'rgba(70,45,20,0.45)'; g.fillRect(i * bw, jy, bw, 1);
        g.fillStyle = 'rgba(60,40,20,0.35)'; g.fillRect(i * bw + bw - 0.7, 0, 0.7, h);
      }
    });
    var wood = new THREE.MeshPhysicalMaterial({ map: boards, roughness: 0.28, clearcoat: 0.8, clearcoatRoughness: 0.12 });
    // the boards run on past the edge to the safety glass (the runtime keeps the corridor)
    var tr = ctx.track.ribbon({ width: TW + 3.1, offset: 1.55, y: 0.0, material: wood, tile: 5 });
    tr.receiveShadow = true; ctx.scene.add(tr);
    // a concrete walkway from the top of the boards to the stands
    ctx.scene.add(ctx.track.ribbon({ width: 2.4, offset: HW + 4.3, y: -0.01, material: new THREE.MeshStandardMaterial({ color: '#5A5F68', roughness: 0.9 }) }));
    // the côte d'azur: the pale blue band inside the track, and the flat apron below it
    ctx.scene.add(ctx.track.ribbon({ width: 1.2, offset: -HW - 0.6, y: 0.001, material: new THREE.MeshStandardMaterial({ color: '#7FB2D8', roughness: 0.5 }) }));
    // a skirt from the apron's lower edge down to the infield floor, all the way round
    var sk = [], idx = [], n = 0;
    for (var dd = 0; dd <= ctx.track.length + 0.01; dd += 1.5) {
      var Fk = ctx.track.frameAt(dd), a = Fk.pos.clone().addScaledVector(Fk.right, -HW - 1.2);
      sk.push(a.x, a.y, a.z, a.x, 0, a.z);
      if (n) idx.push((n - 1) * 2, n * 2, (n - 1) * 2 + 1, (n - 1) * 2 + 1, n * 2, n * 2 + 1);
      n++;
    }
    var skg = new THREE.BufferGeometry(); skg.setAttribute('position', new THREE.Float32BufferAttribute(sk, 3)); skg.setIndex(idx); skg.computeVertexNormals();
    var skm = new THREE.Mesh(skg, new THREE.MeshStandardMaterial({ color: '#2B4A6E', roughness: 0.7, side: THREE.DoubleSide })); skm.userData.gmTrack = true; ctx.scene.add(skm);
    // lines: black measurement line, red sprinters' line, blue stayers' line
    var line = function (off, col, w) { var m = ctx.track.ribbon({ width: w || 0.05, offset: off, y: 0.004, material: new THREE.MeshStandardMaterial({ color: col, roughness: 0.4 }) }); ctx.scene.add(m); return m; };
    line(-HW + 0.2, '#101010', 0.05); line(-HW + 0.85, '#C8102E', 0.05); line(-HW + TW / 3 + 0.1, '#1F4FA8', 0.05); line(HW + 2.9, '#101010', 0.05);
    // lines across: the finish (black on white), the 200 m line, and the pursuit lines at mid-straight
    var L = ctx.track.length;
    function across(d, depth, col) {
      var pos = [], F = ctx.track.frameAt(d);
      [[-HW - 1.1, -depth / 2], [HW + 3.1, -depth / 2], [-HW - 1.1, depth / 2], [HW + 3.1, depth / 2]].forEach(function (p) {
        var v = F.pos.clone().addScaledVector(F.right, p[0]).addScaledVector(F.tan, p[1]).addScaledVector(F.up, 0.006); pos.push(v.x, v.y, v.z);
      });
      var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex([0, 2, 1, 1, 2, 3]); g.computeVertexNormals();
      var m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: col, roughness: 0.4, side: THREE.DoubleSide })); m.receiveShadow = true; m.userData.gmTrack = true;
      ctx.scene.add(m);
    }
    across(L - 3, 0.72, '#F4F4F2'); across(L - 3, 0.04, '#0E0E0E');
    across((L - 3 - 200 + L) % L, 0.05, '#F4F4F2');
    across(S / 2 + 2, 0.05, '#C8102E'); across(S + PI * R + S / 2 + 2, 0.05, '#C8102E');
  }

  function infield(ctx, low) {
    var THREE = ctx.THREE, R1 = rng(9), scene = ctx.scene;
    var floor = new THREE.Mesh(new THREE.PlaneGeometry(S, 2 * (R - HW - 1.2)).rotateX(-PI / 2), new THREE.MeshStandardMaterial({ color: '#27313F', roughness: 0.6 }));
    floor.receiveShadow = true; scene.add(floor);
    var ends = [-1, 1].map(function (sd) { var c = new THREE.Mesh(new THREE.CircleGeometry(R - HW - 1.2, 48, sd < 0 ? PI / 2 : -PI / 2, PI).rotateX(-PI / 2), floor.material); c.position.x = sd * S / 2; c.receiveShadow = true; scene.add(c); return c; });
    // team pens: low boards, chairs, bikes on stands, rollers
    var pens = [], chairs = [], bikes = [];
    for (var i = 0; i < 8; i++) {
      var x = -S / 2 + 6 + i * (S - 12) / 7, z = i % 2 ? 6 : -6;
      pens.push([x, z]);
      for (var c = 0; c < 3; c++) chairs.push([x - 2 + c * 1.6, z + (z > 0 ? 1.4 : -1.4), R1()]);
      for (c = 0; c < 2; c++) bikes.push([x - 1.2 + c * 2.2, z - (z > 0 ? 1 : -1) * 0.8, R1()]);
    }
    var cols = ['#15264F', '#0B2A63', '#F07D1A', '#D8282F', '#FFFFFF', '#111111', '#1E7F4F', '#1D3F9E'];
    var boardG = new THREE.BoxGeometry(6.4, 0.9, 0.08).translate(0, 0.45, 0);
    var pm = ctx.instanced(boardG, new THREE.MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.6 }), pens.length, function (n, d) { d.position.set(pens[n][0], 0, pens[n][1] + (pens[n][1] > 0 ? 2.4 : -2.4)); });
    for (i = 0; i < pens.length; i++) pm.setColorAt(i, new THREE.Color(cols[i]));
    scene.add(pm);
    scene.add(ctx.instanced(new THREE.BoxGeometry(0.5, 0.9, 0.5).translate(0, 0.45, 0), new THREE.MeshStandardMaterial({ color: '#2A2D33', roughness: 0.7 }), chairs.length, function (n, d) { d.position.set(chairs[n][0], 0, chairs[n][1]); d.rotation.y = chairs[n][2]; }));
    var bikeG = new THREE.Group();
    // bikes on stands: two wheels and a frame, instanced as one
    var parts = [new THREE.TorusGeometry(0.32, 0.025, 6, 20).rotateY(PI / 2).translate(0, 0.34, -0.45), new THREE.TorusGeometry(0.32, 0.025, 6, 20).rotateY(PI / 2).translate(0, 0.34, 0.55), new THREE.BoxGeometry(0.04, 0.04, 0.9).rotateX(-0.12).translate(0, 0.7, 0.05), new THREE.BoxGeometry(0.04, 0.5, 0.04).translate(0, 0.55, -0.15)];
    parts.forEach(function (g, gi) {
      scene.add(ctx.instanced(g, new THREE.MeshStandardMaterial({ color: gi < 2 ? '#15161A' : '#C8CCD2', roughness: 0.4, metalness: gi < 2 ? 0 : 0.5 }), bikes.length, function (n, d) { d.position.set(bikes[n][0], 0, bikes[n][1]); d.rotation.y = PI / 2 + bikes[n][2] * 0.2; }));
    });
  }

  // the stands: rows of seats and fans rising behind the glass all the way round
  function stands(ctx, low) {
    var THREE = ctx.THREE, R2 = rng(33), scene = ctx.scene, L = ctx.track.length;
    var rows = low ? 7 : 11, step = low ? 1.0 : 0.72, fans = [], seats = [];
    var glass = [], glassPos = [];
    for (var d = 0; d < L; d += step) {
      var F = ctx.track.frameAt(d), yaw = Math.atan2(-F.right.x, -F.right.z);
      var base = F.pos.clone().addScaledVector(F.right, HW + 3.1);
      if (Math.abs(d % 2.4) < step) glassPos.push([base.x, base.y, base.z, Math.atan2(F.tan.x, F.tan.z)]);
      var out = new THREE.Vector3(F.right.x, 0, F.right.z).normalize();
      for (var r = 0; r < rows; r++) {
        var p = base.clone().addScaledVector(out, 1.6 + r * 0.95); p.y = base.y + 1.2 + r * 0.55;
        seats.push([p.x, p.y, p.z, yaw]);
        if (R2() < 0.86) fans.push([p.x, p.y, p.z, yaw + (R2() - 0.5) * 0.4, R2(), R2(), R2()]);
      }
    }
    // the tiers themselves: a stepped concrete shell under the seats
    var shell = [];
    for (d = 0; d < L; d += 3) {
      var F2 = ctx.track.frameAt(d), o2 = new THREE.Vector3(F2.right.x, 0, F2.right.z).normalize(), b2 = F2.pos.clone().addScaledVector(F2.right, HW + 3.1);
      shell.push([b2.x + o2.x * (2.4 + rows * 0.475), b2.y + 0.6 + rows * 0.275, b2.z + o2.z * (2.4 + rows * 0.475), Math.atan2(F2.tan.x, F2.tan.z)]);
    }
    var tier = new THREE.BoxGeometry(3.4, rows * 0.55 + 1.2, rows * 0.95 + 1.6);
    tier.rotateX(-Math.atan2(0.55, 0.95) * 0.0);
    var shellM = ctx.instanced(new THREE.BoxGeometry(3.3, 1, rows * 0.95 - 0.6), new THREE.MeshStandardMaterial({ color: '#3B414B', roughness: 0.85 }), shell.length, function (n, d2) { var s = shell[n]; d2.position.set(s[0], s[1] - rows * 0.12, s[2]); d2.rotation.y = s[3]; d2.rotation.x = 0; d2.scale.y = rows * 0.55 + 0.6; });
    shellM.receiveShadow = true; scene.add(shellM);
    var seatM = ctx.instanced(new THREE.BoxGeometry(0.5, 0.42, 0.5).translate(0, -0.21, 0), new THREE.MeshStandardMaterial({ color: '#B8252F', roughness: 0.7 }), seats.length, function (n, d2) { var s = seats[n]; d2.position.set(s[0], s[1], s[2]); d2.rotation.y = s[3]; });
    scene.add(seatM);
    // a fan: body, head and arms, coloured per fan; the vertex shader cheers
    var body = new THREE.BoxGeometry(0.42, 0.58, 0.28).translate(0, 0.32, 0);
    var head = new THREE.BoxGeometry(0.19, 0.22, 0.2).translate(0, 0.74, 0);
    var armL = new THREE.BoxGeometry(0.08, 0.42, 0.08).translate(-0.24, 0.42, 0), armR = new THREE.BoxGeometry(0.08, 0.42, 0.08).translate(0.24, 0.42, 0);
    var fanG = (function () {
      var list = [body, head, armL, armR], parts = [0, 1, 2, 2], pos = [], nor = [], part = [];
      list.forEach(function (g, i) { g = g.toNonIndexed(); pos.push.apply(pos, g.attributes.position.array); nor.push.apply(nor, g.attributes.normal.array); for (var k = 0; k < g.attributes.position.count; k++) part.push(parts[i]); });
      var G = new THREE.BufferGeometry(); G.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); G.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); G.setAttribute('aPart', new THREE.Float32BufferAttribute(part, 1));
      return G;
    })();
    var fanMat = new THREE.MeshStandardMaterial({ roughness: 0.75 });
    fanMat.onBeforeCompile = function (sh) {
      sh.uniforms.uTime = W.time;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aPart;\nuniform float uTime;\nvarying float vPart;')
        .replace('#include <begin_vertex>', [
          '#include <begin_vertex>', 'vPart = aPart;',
          'float seed = fract(sin(float(gl_InstanceID) * 12.9898) * 43758.5453);',
          'float cheer = step(0.93, fract(sin(seed * 91.7 + floor(uTime * 0.7 + seed * 5.0) * 13.1) * 43758.5));',
          'if (aPart > 1.5) { transformed.y += cheer * 0.42 * step(0.4, position.y); }',
          'transformed.y += cheer * 0.06 * abs(sin(uTime * 9.0 + seed * 40.0));',
        ].join('\n'));
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vPart;')
        .replace('#include <color_fragment>', '#include <color_fragment>\nif (vPart > 0.5 && vPart < 1.5) diffuseColor.rgb = vec3(0.62, 0.45, 0.33);');
    };
    var fm = ctx.instanced(fanG, fanMat, fans.length, function (n, d2) { var f = fans[n]; d2.position.set(f[0], f[1], f[2]); d2.rotation.y = f[3]; d2.scale.setScalar(0.92 + f[4] * 0.2); });
    var shirts = ['#E4002B', '#FFFFFF', '#15264F', '#F07D1A', '#FFD83A', '#1E7F4F', '#1D3F9E', '#111111', '#7FB2D8', '#D8282F', '#F4C542', '#8B1E3F'];
    var c = new THREE.Color();
    for (var i = 0; i < fans.length; i++) fm.setColorAt(i, c.set(shirts[(fans[i][5] * shirts.length) | 0]).multiplyScalar(0.8 + fans[i][6] * 0.3));
    scene.add(fm);
    // the safety glass along the top of the boards: posts and a clear panel
    var glassMat = new THREE.MeshPhysicalMaterial({ color: '#CFE3F2', roughness: 0.05, transmission: 0, transparent: true, opacity: 0.18, side: THREE.DoubleSide });
    scene.add(ctx.instanced(new THREE.PlaneGeometry(2.42, 1.1).translate(0, 0.55, 0), glassMat, glassPos.length, function (n, d2) { var g = glassPos[n]; d2.position.set(g[0], g[1], g[2]); d2.rotation.y = g[3] + PI / 2; }));
    scene.add(ctx.instanced(new THREE.BoxGeometry(0.06, 1.15, 0.06).translate(0, 0.575, 0), new THREE.MeshStandardMaterial({ color: '#B8BCC4', metalness: 0.7, roughness: 0.3 }), glassPos.length, function (n, d2) { var g = glassPos[n]; d2.position.set(g[0], g[1], g[2]); }));
  }

  // the hall: walls, a steel roof on arched trusses, light rigs and banners
  function hall(ctx, low) {
    var THREE = ctx.THREE, scene = ctx.scene;
    var LX = S + 2 * R + 60, LZ = 2 * R + 60;
    var wallMat = new THREE.MeshStandardMaterial({ color: '#2E333B', roughness: 0.8 });
    [[0, LZ / 2, LX, 0], [0, -LZ / 2, LX, PI], [LX / 2, 0, LZ, -PI / 2], [-LX / 2, 0, LZ, PI / 2]].forEach(function (w) {
      var m = new THREE.Mesh(new THREE.PlaneGeometry(w[2], 26).translate(0, 13, 0), wallMat); m.position.set(w[0], 0, w[1]); m.rotation.y = w[3] + PI; scene.add(m);
    });
    // the roof: a shallow barrel vault, dark, over trusses
    var roof = new THREE.Mesh(new THREE.CylinderGeometry(LZ * 0.9, LZ * 0.9, LX, 48, 1, true, -0.62, 1.24), new THREE.MeshStandardMaterial({ color: '#1E2229', roughness: 0.9, side: THREE.DoubleSide }));
    roof.rotation.z = PI / 2; roof.position.y = 26 - LZ * 0.9 + 12; scene.add(roof);
    var trusses = [];
    for (var x = -LX / 2 + 8; x < LX / 2; x += 12) trusses.push(x);
    var arch = new THREE.TorusGeometry(LZ * 0.9 - 0.8, 0.35, 6, 40, 1.24); arch.rotateZ(PI / 2 - 0.62); arch.rotateY(PI / 2);
    scene.add(ctx.instanced(arch, new THREE.MeshStandardMaterial({ color: '#8D96A3', metalness: 0.6, roughness: 0.4 }), trusses.length, function (n, d) { d.position.set(trusses[n], 26 - LZ * 0.9 + 12, 0); }));
    // light rigs: bright panels over the track, for bloom and for the varnish
    var rigs = [];
    for (var i = -3; i <= 3; i++) for (var j = -1; j <= 1; j++) rigs.push([i * 16, 29, j * 22]);
    scene.add(ctx.instanced(new THREE.BoxGeometry(10, 0.3, 2.2), new THREE.MeshStandardMaterial({ color: '#111111', emissive: '#FFF4E4', emissiveIntensity: 5 }), rigs.length, function (n, d) { d.position.set(rigs[n][0], rigs[n][1], rigs[n][2]); }));
    // banners of flags round the upper walls
    var flagTex = ctx.textures.canvas(1024, 64, function (g, w, h) {
      var fl = [['#15264F', '#D22B3A', '#FFFFFF'], ['#0B2A63', '#FFFFFF', '#E4002B'], ['#F07D1A', '#FFFFFF', '#F07D1A'], ['#D8282F', '#FFFFFF', '#D8282F'], ['#FFFFFF', '#D8282F', '#FFFFFF'], ['#111111', '#DD0000', '#FFCE00'], ['#1E7F4F', '#F4C542', '#1E7F4F'], ['#1D3F9E', '#FFFFFF', '#E4002B'], ['#E4002B', '#111111', '#E4002B'], ['#161616', '#FFFFFF', '#161616'], ['#FFD83A', '#111111', '#E4002B'], ['#DE2910', '#FFDE00', '#DE2910']];
      for (var k = 0; k < 16; k++) { var f = fl[k % fl.length], x0 = k * w / 16; for (var b = 0; b < 3; b++) { g.fillStyle = f[b]; g.fillRect(x0 + b * w / 48, 0, w / 48, h); } g.fillStyle = '#20242B'; g.fillRect(x0 + w / 16 - 4, 0, 4, h); }
    });
    [[0, LZ / 2 - 0.2, LX, PI], [0, -LZ / 2 + 0.2, LX, 0]].forEach(function (w) {
      var m = new THREE.Mesh(new THREE.PlaneGeometry(w[2] * 0.9, 3), new THREE.MeshStandardMaterial({ map: flagTex, emissive: '#FFFFFF', emissiveMap: flagTex, emissiveIntensity: 0.35 })); m.position.set(w[0], 19, w[1]); m.rotation.y = w[3]; scene.add(m);
    });
  }

  function scoreboards(ctx) {
    var THREE = ctx.THREE;
    var tex = ctx.textures.canvas(1024, 384, function (g, w, h) {
      g.fillStyle = '#05070B'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#E4002B'; g.fillRect(0, 0, w, 64);
      g.fillStyle = '#FFFFFF'; g.font = '700 44px "Saira Condensed", "Arial Narrow", Arial, sans-serif'; g.textBaseline = 'middle'; g.fillText('TRACK CYCLING  ·  KEIRIN', 28, 34);
      g.font = '800 120px "Saira Condensed", "Arial Narrow", Arial, sans-serif'; g.fillText('VELODROME 2028', 28, 170);
      g.font = '600 48px "Saira Condensed", "Arial Narrow", Arial, sans-serif'; g.fillStyle = '#F4C542'; g.fillText('ENDLESS LAPS  ·  A NEW RIVAL EVERY LAP', 28, 290);
    });
    [[-S / 2 - 6, 0], [S / 2 + 6, 0]].forEach(function (p, i) {
      var box = new THREE.Mesh(new THREE.BoxGeometry(12.4, 4.8, 0.8), new THREE.MeshStandardMaterial({ color: '#15171C', roughness: 0.6 }));
      var scr = new THREE.Mesh(new THREE.PlaneGeometry(12, 4.5), new THREE.MeshStandardMaterial({ color: '#000000', emissive: '#FFFFFF', emissiveMap: tex, emissiveIntensity: 1.4 }));
      scr.position.z = 0.42; box.add(scr);
      var back = scr.clone(); back.position.z = -0.42; back.rotation.y = PI; box.add(back);
      box.position.set(p[0], 17, p[1]); box.rotation.y = PI / 2; ctx.scene.add(box);
    });
  }

  /* -------------------------------------------------------- obstacles -- */
  function obstacles(ctx) {
    var THREE = ctx.THREE, L = ctx.track.length, out = [];
    function add(o, m) { m.castShadow = true; m.receiveShadow = true; o.add(m); return m; }
    var dark = new THREE.MeshStandardMaterial({ color: '#15161A', roughness: 0.4 });
    function blocks() { // the blue foam blocks that mark the inside of the track
      var o = new THREE.Group(), m = new THREE.MeshStandardMaterial({ color: '#2E6FC4', roughness: 0.9 });
      for (var i = 0; i < 3; i++) add(o, new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.3, 0.55), m)).position.set((i - 1) * 0.42, 0.15, 0);
      return o;
    }
    function bottles() {
      var o = new THREE.Group(), cols = ['#FFFFFF', '#E4002B', '#2E6FC4'];
      for (var i = 0; i < 4; i++) { var b = add(o, new THREE.Mesh(new THREE.CylinderGeometry(0.037, 0.037, 0.21, 10), new THREE.MeshStandardMaterial({ color: cols[i % 3], roughness: 0.35 }))); b.rotation.z = PI / 2; b.rotation.y = i * 1.3; b.position.set((i - 1.5) * 0.25, 0.04, (i % 2) * 0.2); }
      var box = add(o, new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.35), new THREE.MeshStandardMaterial({ color: '#E8E4DA', roughness: 0.7 }))); box.position.set(0.1, 0.175, -0.35);
      return o;
    }
    function wheelUp() { // a loose disc wheel, upright, rolling across the track
      var o = new THREE.Group(), w = new THREE.Group();
      var disc = new THREE.Mesh(new THREE.CylinderGeometry(0.315, 0.315, 0.02, 40).rotateZ(PI / 2), new THREE.MeshPhysicalMaterial({ color: '#1A1B1E', roughness: 0.3, clearcoat: 1 }));
      var tyre = new THREE.Mesh(new THREE.TorusGeometry(0.323, 0.012, 8, 40).rotateY(PI / 2), dark);
      add(w, disc); add(w, tyre); w.position.y = 0.335; w.rotation.y = PI / 2; o.add(w);
      return { o: o, w: w };
    }
    function fallenBike(col) { // a bike on its side, sliding down the banking
      var o = new THREE.Group(), m = new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.3, clearcoat: 1 });
      [-0.48, 0.5].forEach(function (z) { var t = add(o, new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.018, 8, 32), dark)); t.rotation.x = PI / 2; t.position.set(0, 0.03, z); });
      var f = add(o, new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.95), m)); f.position.set(0.12, 0.06, 0.02);
      var d = add(o, new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.02, 32), new THREE.MeshPhysicalMaterial({ color: '#1A1B1E', roughness: 0.3, clearcoat: 1 }))); d.position.set(0, 0.025, -0.48);
      var bars = add(o, new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.012, 6, 16, PI), dark)); bars.position.set(0.25, 0.06, 0.55);
      return o;
    }
    function derny() { // the keirin pacer: a motorbike and its rider, in black
      var o = new THREE.Group(), body = new THREE.MeshStandardMaterial({ color: '#111216', roughness: 0.5, metalness: 0.3 });
      [-0.6, 0.62].forEach(function (z) { var t = add(o, new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.05, 8, 24), dark)); t.rotation.y = PI / 2; t.position.set(0, 0.35, z); });
      add(o, new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.36, 0.9), body)).position.set(0, 0.62, 0);
      add(o, new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.4, 12).rotateX(PI / 2), new THREE.MeshStandardMaterial({ color: '#C8CCD2', metalness: 0.8, roughness: 0.3 }))).position.set(0, 0.5, 0.05);
      var rider = add(o, new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.5, 4, 10), new THREE.MeshStandardMaterial({ color: '#1C1D22', roughness: 0.7 }))); rider.position.set(0, 1.12, -0.12); rider.rotation.x = -0.25;
      add(o, new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), new THREE.MeshStandardMaterial({ color: '#E4002B', roughness: 0.3 }))).position.set(0, 1.55, -0.02);
      return o;
    }
    function put(d, x, o, extra) { var e = { at: d / L, x: x, object: o }; if (extra) Object.assign(e, extra); out.push(e); }
    var bikeCols = ['#0B2A63', '#F07D1A', '#1E7F4F', '#DE2910'];
    // every 16 m or so, alternating sides and kinds, never closing the track
    var kinds = ['blocks', 'bottles', 'wheel', 'fallen', 'blocks', 'derny', 'bottles', 'fallen'];
    var n = 0;
    for (var d = 52; d < L - 12; d += 17) {
      var k = kinds[n % kinds.length], side = n % 2 ? 1 : -1, x = side * (1.1 + (n * 7 % 11) / 11 * 1.6);
      if (k === 'blocks') put(d, -HW + 1.0, blocks());
      else if (k === 'bottles') put(d, x, bottles());
      else if (k === 'wheel') { var wu = wheelUp(); put(d, 0, wu.o, { move: { amplitude: 2.4, period: 3.2 }, animate: function (w) { return function (t) { w.rotation.x = Math.cos(t * TAU / 3.2) * 4; }; }(wu.w) }); }
      else if (k === 'fallen') put(d, x * 0.6, fallenBike(bikeCols[n % bikeCols.length]), { move: { amplitude: 1.6, period: 4.4 } });
      else if (k === 'derny') put(d, side * 1.7, derny(), { move: { amplitude: 0.9, period: 6.5 } });
      n++;
    }
    return out;
  }

  /* ----------------------------------------------------------- update -- */
  var last = null;
  function update(ctx, t, dt) {
    W.time.value = t;
    // the whirr of wheels on boards: how fast the camera is travelling
    var p = ctx.camera.position;
    if (last && dt > 0) { var v = Math.hypot(p.x - last.x, p.z - last.z) / dt; W.speed = W.speed == null ? v : W.speed + (v - W.speed) * Math.min(1, dt * 3); }
    last = { x: p.x, z: p.z };
    var A = W.audio;
    if (A) {
      var now = A.ac.currentTime, s = clamp((W.speed || 0) / 28, 0, 1);
      A.whirr.gain.setTargetAtTime(0.02 + 0.11 * s, now, 0.1);
      A.bp.frequency.setTargetAtTime(180 + 520 * s, now, 0.2);
      A.crowd.gain.setTargetAtTime(0.06 + 0.04 * Math.sin(t * 0.3) + (t > A.swell ? 0.05 : 0), now, 0.6);
      if (t > A.swell + 3) A.swell = t + 8 + Math.random() * 10;
    }
  }

  /* ---------------------------------------------------------- ambient -- */
  // the hall: a crowd murmur that swells, and the low whirr of disc wheels
  function ambient(ctx) {
    var ac = ctx.audio.context, out = ctx.audio.destination;
    function noise(seconds, brown) {
      var n = Math.floor(ac.sampleRate * seconds), b = ac.createBuffer(1, n, ac.sampleRate), d = b.getChannelData(0), l = 0;
      for (var i = 0; i < n; i++) { var w = Math.random() * 2 - 1; if (brown) { l = (l + 0.02 * w) / 1.02; d[i] = l * 3.5; } else d[i] = w; }
      return b;
    }
    function loop(buf) { var s = ac.createBufferSource(); s.buffer = buf; s.loop = true; s.start(); return s; }
    var crowdSrc = loop(noise(4, false)), cb = ac.createBiquadFilter(); cb.type = 'bandpass'; cb.frequency.value = 700; cb.Q.value = 0.6;
    var crowd = ac.createGain(); crowd.gain.value = 0.06; crowdSrc.connect(cb); cb.connect(crowd); crowd.connect(out);
    var wh = loop(noise(3, true)), bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 300; bp.Q.value = 1.2;
    var whirr = ac.createGain(); whirr.gain.value = 0.02; wh.connect(bp); bp.connect(whirr); whirr.connect(out);
    W.audio = { ac: ac, crowd: crowd, whirr: whirr, bp: bp, swell: 6 };
  }
})();
