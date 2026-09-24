// Speed Skating 2030
//
// A first-party GameMog world: endless laps of an Olympic long-track oval, on
// runtime v1 with cinematic graphics, mirror ice and the skater kit. A 400 m
// track of two 4 m lanes and a warm-up lane, painted under ice that reflects
// the whole hall as the skaters cross it; lane blocks through the bends and
// safety pads all the way round; a two-tier bowl of fans who do the wave
// under rows of LED ribbon boards; a barrel roof of steel trusses carrying
// long rows of lights that run down the straights (and down the ice again);
// giant national flags over an infield with a rink, team cabins and a lap
// counter; and skaters in national skinsuits, hoods and mirrored glasses on
// clap skates, sitting deep, pushing out sideways, crossing over through the
// bends. The rules are the runtime's; the oval is this file's.
(function () {
  var PI = Math.PI, TAU = PI * 2;
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function smooth(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function rng(seed) { var s = seed >>> 0; return function () { s = (s + 0x6D2B79F5) >>> 0; var t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  /* ------------------------------------------------------------ the oval -- */
  // The racing line is the line between the two lanes: bends of radius 30 m
  // round two 112 m straights. Everything else is the same oval at another
  // radius: the inner lane 26 to 30 m, the outer 30 to 34, the warm-up lane
  // inside it, the pads at 38.3, the stands from 44.
  var HS = 56, R = 30, RI = 26, RO = 34, RW = 21.6, RPAD = 38.4, RSTAND = 44;
  function per(r) { return 4 * HS + 2 * PI * r; }
  // the point u metres round the oval of radius r, from the start of the home straight
  function ovalAt(u, r, o) {
    o = o || {};
    var P = per(r), S = 2 * HS, B = PI * r; u = ((u % P) + P) % P;
    if (u < S) { o.x = -HS + u; o.z = r; o.nx = 0; o.nz = 1; o.tx = 1; o.tz = 0; }
    else if (u < S + B) { var a = (u - S) / r; o.x = HS + Math.sin(a) * r; o.z = Math.cos(a) * r; o.nx = Math.sin(a); o.nz = Math.cos(a); o.tx = Math.cos(a); o.tz = -Math.sin(a); }
    else if (u < 2 * S + B) { o.x = HS - (u - S - B); o.z = -r; o.nx = 0; o.nz = -1; o.tx = -1; o.tz = 0; }
    else { var b = (u - 2 * S - B) / r; o.x = -HS - Math.sin(b) * r; o.z = -Math.cos(b) * r; o.nx = -Math.sin(b); o.nz = -Math.cos(b); o.tx = -Math.cos(b); o.tz = Math.sin(b); }
    return o;
  }
  // stations round the oval for sweeps: the two straights are single spans
  function ringU(r, n) {
    var S = 2 * HS, B = PI * r, u = [0];
    for (var k = 0; k <= n; k++) u.push(S + B * k / n);
    for (k = 0; k <= n; k++) u.push(2 * S + B + B * k / n);
    return u;
  }
  var TRACK = [];
  for (var i = 0; i < 56; i++) { var q = ovalAt(i / 56 * per(R), R); TRACK.push([q.x, 0, q.z]); }

  /* -------------------------------------------------------------- nations -- */
  // suit colour, trim, accent, and a flag drawn from bands (h: horizontal, v: vertical)
  var NATIONS = {
    USA: { suit: '#14264F', trim: '#D22B3A', accent: '#FFFFFF', flag: 'usa' },
    NED: { suit: '#F36C21', trim: '#1B1B1B', accent: '#FFFFFF', flag: ['h', '#AE1C28', '#FFFFFF', '#21468B'] },
    NOR: { suit: '#BA0C2F', trim: '#FFFFFF', accent: '#00205B', flag: ['cross', '#BA0C2F', '#FFFFFF', '#00205B'] },
    JPN: { suit: '#F4F4F2', trim: '#BC002D', accent: '#101A3A', flag: ['disc', '#FFFFFF', '#BC002D'] },
    CAN: { suit: '#D52B1E', trim: '#1A1A1A', accent: '#FFFFFF', flag: ['v', '#D52B1E', '#FFFFFF', '#D52B1E'] },
    GER: { suit: '#161616', trim: '#DD0000', accent: '#FFCE00', flag: ['h', '#000000', '#DD0000', '#FFCE00'] },
    ITA: { suit: '#1B4FA8', trim: '#FFFFFF', accent: '#009246', flag: ['v', '#009246', '#FFFFFF', '#CE2B37'] },
    POL: { suit: '#F4F4F2', trim: '#DC143C', accent: '#1A1A1A', flag: ['h', '#FFFFFF', '#DC143C'] },
    CHN: { suit: '#DE2910', trim: '#FFDE00', accent: '#FFFFFF', flag: ['star', '#DE2910', '#FFDE00'] },
    KAZ: { suit: '#00AFCA', trim: '#FEC50C', accent: '#FFFFFF', flag: ['disc', '#00AFCA', '#FEC50C'] },
    BEL: { suit: '#1A1A1A', trim: '#FDDA24', accent: '#EF3340', flag: ['v', '#000000', '#FDDA24', '#EF3340'] },
    FRA: { suit: '#0B2E73', trim: '#FFFFFF', accent: '#E1000F', flag: ['v', '#0055A4', '#FFFFFF', '#EF4135'] },
    AUT: { suit: '#ED2939', trim: '#FFFFFF', accent: '#1A1A1A', flag: ['h', '#ED2939', '#FFFFFF', '#ED2939'] },
    SWE: { suit: '#006AA7', trim: '#FECC00', accent: '#FFFFFF', flag: ['cross', '#006AA7', '#FECC00'] },
    SUI: { suit: '#DA291C', trim: '#FFFFFF', accent: '#1A1A1A', flag: ['swiss', '#DA291C', '#FFFFFF'] },
    CZE: { suit: '#11457E', trim: '#D7141A', accent: '#FFFFFF', flag: ['cze'] },
  };
  var FLAG_ORDER = ['NED', 'NOR', 'JPN', 'USA', 'CAN', 'GER', 'ITA', 'POL', 'CHN', 'KAZ', 'BEL', 'FRA', 'AUT', 'SWE', 'SUI', 'CZE'];
  function drawFlag(g, x, y, w, h, f) {
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
    if (f === 'usa') {
      for (var s = 0; s < 13; s++) { g.fillStyle = s % 2 ? '#FFFFFF' : '#B22234'; g.fillRect(x, y + s * h / 13, w, h / 13 + 1); }
      g.fillStyle = '#3C3B6E'; g.fillRect(x, y, w * 0.4, h * 7 / 13);
      g.fillStyle = '#FFFFFF';
      for (var r = 0; r < 9; r++) for (var c = 0; c < (r % 2 ? 5 : 6); c++) { g.beginPath(); g.arc(x + w * 0.4 * ((c + (r % 2 ? 1 : 0.5)) / 6.2), y + h * 7 / 13 * (r + 0.6) / 9.6, h * 0.012, 0, TAU); g.fill(); }
    } else if (f[0] === 'h' || f[0] === 'v') {
      var n = f.length - 1;
      for (var k = 0; k < n; k++) { g.fillStyle = f[k + 1]; if (f[0] === 'h') g.fillRect(x, y + k * h / n, w, h / n + 1); else g.fillRect(x + k * w / n, y, w / n + 1, h); }
    } else if (f[0] === 'cross') {
      g.fillStyle = f[1]; g.fillRect(x, y, w, h);
      var cx = x + w * 0.36, t = h * (f[3] ? 0.26 : 0.2);
      g.fillStyle = f[2]; g.fillRect(cx - t / 2, y, t, h); g.fillRect(x, y + h / 2 - t / 2, w, t);
      if (f[3]) { var t2 = t * 0.5; g.fillStyle = f[3]; g.fillRect(cx - t2 / 2, y, t2, h); g.fillRect(x, y + h / 2 - t2 / 2, w, t2); }
    } else if (f[0] === 'disc') {
      g.fillStyle = f[1]; g.fillRect(x, y, w, h); g.fillStyle = f[2]; g.beginPath(); g.arc(x + w / 2, y + h / 2, h * 0.3, 0, TAU); g.fill();
    } else if (f[0] === 'star') {
      g.fillStyle = f[1]; g.fillRect(x, y, w, h); g.fillStyle = f[2];
      [[0.17, 0.25, 0.15], [0.33, 0.1, 0.05], [0.4, 0.2, 0.05], [0.4, 0.35, 0.05], [0.33, 0.45, 0.05]].forEach(function (s) { star(g, x + w * s[0], y + h * s[1], h * s[2]); });
    } else if (f[0] === 'swiss') {
      g.fillStyle = f[1]; g.fillRect(x, y, w, h); g.fillStyle = f[2]; var a = h * 0.12; g.fillRect(x + w / 2 - a / 2, y + h * 0.2, a, h * 0.6); g.fillRect(x + w / 2 - h * 0.3, y + h / 2 - a / 2, h * 0.6, a);
    } else if (f[0] === 'cze') {
      g.fillStyle = '#FFFFFF'; g.fillRect(x, y, w, h / 2); g.fillStyle = '#D7141A'; g.fillRect(x, y + h / 2, w, h / 2);
      g.fillStyle = '#11457E'; g.beginPath(); g.moveTo(x, y); g.lineTo(x + w * 0.5, y + h / 2); g.lineTo(x, y + h); g.fill();
    }
    g.restore();
  }
  function star(g, cx, cy, r) {
    g.beginPath();
    for (var k = 0; k < 10; k++) { var a = -PI / 2 + k * PI / 5, rr = k % 2 ? r * 0.4 : r; g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
    g.fill();
  }

  // the field: a new national skater every lap, meaner as the laps go on
  var FIELD = [
    { nat: 'NED', name: 'Mulder', g: 'female', skin: 'caucasian' }, { nat: 'NOR', name: 'Haugen', g: 'male', skin: 'caucasian' },
    { nat: 'JPN', name: 'Tanabe', g: 'female', skin: 'asian' }, { nat: 'CAN', name: 'Beaulieu', g: 'male', skin: 'caucasian2' },
    { nat: 'GER', name: 'Albrecht', g: 'female', skin: 'caucasian' }, { nat: 'CHN', name: 'Liang', g: 'male', skin: 'asian' },
    { nat: 'ITA', name: 'Ferri', g: 'female', skin: 'caucasian' }, { nat: 'POL', name: 'Wrona', g: 'male', skin: 'caucasian2' },
    { nat: 'KAZ', name: 'Serikbay', g: 'male', skin: 'asian' }, { nat: 'BEL', name: 'Maes', g: 'female', skin: 'african' },
    { nat: 'FRA', name: 'Garnier', g: 'male', skin: 'african' }, { nat: 'SWE', name: 'Lindgren', g: 'female', skin: 'caucasian' },
  ];
  var PLAYER = { nat: 'USA', name: 'Reyes', g: 'male', skin: 'caucasian2' };

  /* ---------------------------------------------------------------- world -- */
  var W = {};
  GameMog.world({
    assets: ['human-athlete-male', 'human-athlete-female'],
    theme: { sky: '#0E1624', fog: '#1A2334', ink: '#0B1422', panel: '#F4F8FC', accent: '#1FA2FF', font: 'Saira Condensed' },
    graphics: {
      exposure: 0.92,
      environment: { intensity: 0.8, extras: envExtras },
      bloom: { strength: 0.42, threshold: 1.6, radius: 0.75 },
      grade: { contrast: 1.07, saturation: 1.08, warmth: -0.06, vignette: 0.3, grain: 0.012 },
      shadows: { extent: 34, mapSize: 2048 },
    },
    camera: { distance: 6, height: 2.5, fov: 52 },
    track: { width: 12, points: TRACK },
    build: build,
    player: function (ctx) { return skater(ctx, PLAYER, 0); },
    rival: function (ctx, k) {
      var f = FIELD[(k - 1) % FIELD.length], round = Math.floor((k - 1) / FIELD.length);
      return skater(ctx, Object.assign({}, f, { name: f.name + (round ? ' ' + (round + 1) : '') }), k);
    },
    obstacles: obstacles,
    update: update,
    ambient: ambient,
  });

  function skater(ctx, f, k) {
    var n = NATIONS[f.nat], label = f.name + ' (' + f.nat + ')';
    // later rivals come bigger and meaner: stronger builds, darker lenses that glow
    var mean = clamp((k - 6) / 8, 0, 1);
    var o = {
      skin: f.skin, height: (f.g === 'female' ? 1.71 : 1.83) + (k % 3) * 0.02 + mean * 0.05,
      build: { muscle: 0.75 + 0.2 * mean, lean: 0.55 - 0.2 * mean },
      suit: { color: n.suit, trim: n.trim, accent: n.accent, code: f.nat, number: String(k === 0 ? 7 : 10 + k * 3 % 90), pattern: ['panels', 'split', 'chevron', 'band', 'panels', 'stripes'][k % 6], textColor: n.suit === '#F4F4F2' || n.suit === '#FFFFFF' ? '#1A1A1A' : '#FFFFFF', gloves: '#16171A' },
      skates: { boot: k % 2 ? '#F2F2F0' : '#1C1D21', trim: n.trim, tube: k % 3 ? '#1B1C20' : '#C9CDD3' },
      glasses: { lens: mean > 0.3 ? '#FF2A2A' : ['#C9A45A', '#4AA3FF', '#9A7BFF', '#E0E4EA'][k % 4] },
      name: label, color: n.suit === '#F4F4F2' ? n.trim : n.suit,
    };
    var s = ctx.assets.ready(f.g === 'female' ? 'human-athlete-female' : 'human-athlete-male') && ctx.assets.skater(f.g === 'female' ? 'human-athlete-female' : 'human-athlete-male', o);
    if (s) return s;
    return fallbackSkater(ctx, n, label);
  }
  // if the library cannot load: a plain crouched figure in the suit's colours
  function fallbackSkater(ctx, n, label) {
    var T = ctx.THREE, g = new T.Group(), m = new T.MeshStandardMaterial({ color: n.suit, roughness: 0.4 });
    var body = new T.Mesh(new T.CapsuleGeometry(0.2, 0.7, 6, 12), m); body.rotation.x = 1.1; body.position.set(0, 1.0, 0.1); g.add(body);
    var head = new T.Mesh(new T.SphereGeometry(0.12, 16, 12), m); head.position.set(0, 1.25, 0.55); g.add(head);
    [-1, 1].forEach(function (sd) { var l = new T.Mesh(new T.CapsuleGeometry(0.09, 0.7, 4, 8), m); l.position.set(sd * 0.14, 0.45, 0.05); l.rotation.x = 0.35; g.add(l); });
    return { object: g, name: label, color: n.suit };
  }

  /* ---------------------------------------------------------------- build -- */
  function build(ctx) {
    var T = ctx.THREE, scene = ctx.scene, low = ctx.quality === 'low';
    W.T = T; W.low = low;
    var key = new T.DirectionalLight('#F3F6FF', 1.7);
    key.position.set(18, 110, 26); key.castShadow = true;
    scene.add(key, new T.HemisphereLight('#DCE6F4', '#8FA0B4', 0.6));
    scene.background = new T.Color('#0B111C');
    scene.fog = new T.Fog('#1A2436', 150, 520);
    ice(ctx);
    markings(ctx);
    rimAndPads(ctx);
    stands(ctx);
    crowd(ctx);
    hall(ctx);
    roofLights(ctx);
    bigFlags(ctx);
    infield(ctx);
    trackside(ctx);
  }

  // extra bright shapes in the environment: the light rows, the LED boards and
  // a bright floor, so suits, visors and boots catch the hall's own light
  function envExtras(ctx) {
    var T = ctx.THREE, g = new T.Group();
    var lamp = new T.MeshBasicMaterial({ color: new T.Color('#FFFFFF').multiplyScalar(9) });
    for (var z = -48; z <= 48; z += 8) { var m = new T.Mesh(new T.BoxGeometry(220, 0.6, 1.2), lamp); m.position.set(0, 25, z); g.add(m); }
    var ring = new T.Mesh(new T.CylinderGeometry(80, 80, 12, 48, 1, true), new T.MeshBasicMaterial({ color: '#3A4A66', side: T.BackSide }));
    ring.scale.set(1.5, 1, 0.8); ring.position.y = 7; g.add(ring);
    var band = new T.Mesh(new T.CylinderGeometry(79, 79, 1.2, 48, 1, true), new T.MeshBasicMaterial({ color: new T.Color('#2B8CFF').multiplyScalar(2.5), side: T.BackSide }));
    band.scale.set(1.5, 1, 0.8); band.position.y = 1.2; g.add(band);
    var floor = new T.Mesh(new T.CircleGeometry(90, 32).rotateX(-PI / 2), new T.MeshBasicMaterial({ color: new T.Color('#EAF1F8').multiplyScalar(0.9) }));
    floor.scale.set(1.5, 1, 0.75); g.add(floor);
    var roof = new T.Mesh(new T.CircleGeometry(140, 32).rotateX(PI / 2), new T.MeshBasicMaterial({ color: '#141A24' }));
    roof.position.y = 32; g.add(roof);
    return g;
  }

  // a surface swept round the oval: profile points [dr, y, colour] from radius r0
  function sweep(T, profile, r0, n, opts) {
    opts = opts || {};
    var us = ringU(r0, n), rows = profile.length, cols = us.length, P = new Float32Array(rows * cols * 3), C = new Float32Array(rows * cols * 3), UV = new Float32Array(rows * cols * 2), idx = [], o = {}, c = new T.Color();
    for (var j = 0; j < rows; j++) {
      var pr = profile[j], r = r0 + pr[0], s = 2 * HS, B = PI * r;
      c.set(pr[2] || '#FFFFFF');
      for (var i = 0; i < cols; i++) {
        // the same station at this radius: straights keep their length, bends scale
        var u0 = us[i], uu;
        if (u0 <= s) uu = u0; else if (u0 <= s + PI * r0) uu = s + (u0 - s) / (PI * r0) * B; else if (u0 <= 2 * s + PI * r0) uu = s + B + (u0 - s - PI * r0); else uu = 2 * s + B + (u0 - 2 * s - PI * r0) / (PI * r0) * B;
        ovalAt(uu, r, o);
        var k = (j * cols + i) * 3;
        P[k] = o.x; P[k + 1] = pr[1]; P[k + 2] = o.z; C[k] = c.r; C[k + 1] = c.g; C[k + 2] = c.b;
        UV[(j * cols + i) * 2] = -uu / (opts.uScale || 1); UV[(j * cols + i) * 2 + 1] = opts.v ? opts.v[j] : j / (rows - 1);
      }
    }
    for (j = 0; j < rows - 1; j++) for (i = 0; i < cols - 1; i++) {
      var a = j * cols + i, b = a + 1, d = a + cols, e = d + 1;
      if (opts.skip && opts.skip(j)) continue;
      idx.push(a, d, b, b, d, e);
    }
    var g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(P, 3)); g.setAttribute('color', new T.BufferAttribute(C, 3)); g.setAttribute('uv', new T.BufferAttribute(UV, 2));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  }
  // a flat stadium-shaped ring between two radii at height y (r0 = 0 fills it)
  function ovalShape(T, r) {
    var s = new T.Shape();
    s.moveTo(-HS, r); s.lineTo(HS, r); s.absarc(HS, 0, r, PI / 2, -PI / 2, true); s.lineTo(-HS, -r); s.absarc(-HS, 0, r, -PI / 2, PI / 2, true);
    return s;
  }
  function flatRing(T, r0, r1, seg) {
    var s = ovalShape(T, r1);
    if (r0 > 0) { var h = new T.Path(); h.moveTo(-HS, r0); h.absarc(-HS, 0, r0, PI / 2, -PI / 2, false); h.lineTo(HS, -r0); h.absarc(HS, 0, r0, -PI / 2, PI / 2, false); h.lineTo(-HS, r0); s.holes.push(h); }
    // ShapeGeometry's x, y become x, z
    var g = new T.ShapeGeometry(s, seg || 48); g.rotateX(PI / 2);
    return g;
  }

  /* ------------------------------------------------------------------ ice -- */
  function ice(ctx) {
    var T = ctx.THREE, R0 = rng(11);
    // white paint under clear ice: faint snow dust and the ghosts of old laps
    var tex = ctx.textures.canvas(1024, 1024, function (g, w, h) {
      g.fillStyle = '#F2F6FA'; g.fillRect(0, 0, w, h);
      for (var k = 0; k < 260; k++) { var x = R0() * w, y = R0() * h, r = 20 + R0() * 120; var gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(210,222,236,' + (0.08 + R0() * 0.1) + ')'); gr.addColorStop(1, 'rgba(210,222,236,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
      g.lineCap = 'round';
      for (k = 0; k < 900; k++) {
        var y0 = R0() * h, x0 = R0() * w, len = 60 + R0() * 380, bend = (R0() - 0.5) * 40;
        g.strokeStyle = 'rgba(' + (R0() < 0.5 ? '255,255,255' : '190,204,220') + ',' + (0.12 + R0() * 0.25) + ')'; g.lineWidth = 0.6 + R0() * 1.4;
        g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(x0 + len / 2, y0 + bend, x0 + len, y0 + bend * 0.3); g.stroke();
      }
    });
    tex.wrapS = tex.wrapT = T.RepeatWrapping; tex.repeat.set(1 / 7, 1 / 7);
    // the skate cuts: fine grooves, mostly along the track
    var cuts = ctx.textures.normal(512, 512, function (g, w, h) {
      g.fillStyle = '#808080'; g.fillRect(0, 0, w, h);
      for (var k = 0; k < 700; k++) {
        var y0 = R0() * h, x0 = R0() * w, len = 40 + R0() * 260, bend = (R0() - 0.5) * 24;
        g.strokeStyle = R0() < 0.6 ? 'rgba(60,60,60,0.5)' : 'rgba(190,190,190,0.45)'; g.lineWidth = 0.5 + R0() * 1.5;
        g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(x0 + len / 2, y0 + bend, x0 + len, y0 + bend * 0.5); g.stroke();
      }
    }, 1.2);
    cuts.wrapS = cuts.wrapT = T.RepeatWrapping; cuts.repeat.set(1 / 3.5, 1 / 3.5);
    var mat = new T.MeshPhysicalMaterial({ color: '#D9E1EA', map: tex, roughness: 0.42, normalMap: cuts, normalScale: new T.Vector2(0.35, 0.35), clearcoat: 1, clearcoatRoughness: 0.035 });
    ctx.mirror(mat, { y: 0, strength: 0.85, blur: 0.2, distortion: 0.012 });
    W.iceMat = mat;
    var g = new T.ShapeGeometry(ovalShape(T, RPAD - 0.3), 64);
    g.rotateX(-PI / 2);
    var m = new T.Mesh(g, mat); m.receiveShadow = true; ctx.scene.add(m);
  }

  /* ---------------------------------------------------------- markings -- */
  // painted under the ice, so they shine and reflect with it
  function markings(ctx) {
    var T = ctx.THREE, tr = ctx.track;
    function paint(hex) { var m = new T.MeshPhysicalMaterial({ color: hex, roughness: 0.5, clearcoat: 1, clearcoatRoughness: 0.035 }); ctx.mirror(m, { y: 0, strength: 0.96, blur: 0.2, distortion: 0.012 }); return m; }
    var blue = paint('#1C63D8'), red = paint('#D7263D'), black = paint('#16181D');
    [[RI - R, blue], [0, blue], [RO - R, blue], [RW - R, red]].forEach(function (l) { ctx.scene.add(tr.ribbon({ width: 0.06, offset: l[0], y: 0.003, material: l[1] })); });
    // the warm-up lane, tinted
    ctx.scene.add(tr.ribbon({ width: RI - RW - 0.1, offset: (RI + RW) / 2 - R, y: 0.002, material: paint('#DCE9F6') }));
    // the finish line across both lanes, and the start lines
    var L = tr.length, lines = [];
    function across(d, w, len, x0, mat) {
      var F = tr.frameAt(d), m = new T.Mesh(new T.PlaneGeometry(len, w).rotateX(-PI / 2), mat);
      m.position.copy(F.pos).addScaledVector(F.right, x0).setY(0.004);
      m.rotation.y = Math.atan2(F.tan.x, F.tan.z);
      ctx.scene.add(m);
    }
    across(0, 0.35, 8, 0, red);
    for (var k = 0; k < 8; k++) across(0.3 + 0.08, 0.2, 1, -3.5 + k, k % 2 ? black : paint('#FFFFFF'));
    [L * 0.22, L * 0.47, L * 0.72].forEach(function (d) { across(d, 0.12, 8, 0, red); });
    // the crossing zone on the back straight: dashes on the lane line
    var dash = paint('#FFFFFF');
    for (var d = L * 0.61; d < L * 0.84; d += 3) { var F = tr.frameAt(d), m = new T.Mesh(new T.PlaneGeometry(0.16, 1.4).rotateX(-PI / 2), dash); m.position.copy(F.pos).setY(0.004); m.rotation.y = Math.atan2(F.tan.x, F.tan.z); ctx.scene.add(m); }
    // lane blocks through the bends, along the inside of the racing corridor
    var spots = [], o = {};
    var rb = R - 6.4;
    for (var u = 0; u < per(rb); u += 1.7) { ovalAt(u, rb, o); if (Math.abs(o.x) > HS + 0.5) spots.push([o.x, o.z]); }
    var blk = new T.Group();
    var geo = new T.CylinderGeometry(0.075, 0.09, 0.11, 10).translate(0, 0.055, 0);
    var im = ctx.instanced(geo, new T.MeshStandardMaterial({ color: '#15171B', roughness: 0.7 }), spots.length, function (n, dd) { dd.position.set(spots[n][0], 0, spots[n][1]); });
    im.castShadow = true; blk.add(im);
    var cap = ctx.instanced(new T.CylinderGeometry(0.076, 0.076, 0.02, 10).translate(0, 0.11, 0), new T.MeshStandardMaterial({ color: '#1FA2FF', emissive: '#1FA2FF', emissiveIntensity: 0.6, roughness: 0.4 }), spots.length, function (n, dd) { dd.position.set(spots[n][0], 0, spots[n][1]); });
    blk.add(cap); ctx.scene.add(blk);
  }

  /* ----------------------------------------------------- rim and pads -- */
  function rimAndPads(ctx) {
    var T = ctx.THREE, low = W.low;
    // crash pads round the whole oval, in three colours with a white band
    var padTex = ctx.textures.canvas(256, 128, function (g, w, h) {
      g.fillStyle = '#0D3B8C'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#FFFFFF'; g.fillRect(0, h * 0.14, w, h * 0.08);
      g.fillStyle = '#1FA2FF'; g.fillRect(0, h * 0.72, w, h * 0.1);
      g.fillStyle = 'rgba(255,255,255,0.08)'; for (var k = 0; k < 6; k++) g.fillRect(k * w / 6, 0, 2, h);
    });
    var spots = [], o = {};
    for (var u = 0; u < per(RPAD); u += 1.6) { ovalAt(u + 0.8, RPAD, o); spots.push([o.x, o.z, Math.atan2(o.nx, o.nz)]); }
    var pad = new T.BoxGeometry(1.56, 1.05, 0.62).translate(0, 0.525, 0);
    var pm = ctx.instanced(pad, new T.MeshStandardMaterial({ map: padTex, roughness: 0.75 }), spots.length, function (n, dd) { dd.position.set(spots[n][0], 0, spots[n][1]); dd.rotation.y = spots[n][2]; });
    pm.castShadow = true; pm.receiveShadow = true; ctx.scene.add(pm);
    // the concourse: a dark rubber ring between the ice and the stands
    var floor = new T.Mesh(flatRing(T, RPAD - 0.3, RSTAND + 1, 48), new T.MeshStandardMaterial({ color: '#1B1F27', roughness: 0.9, side: T.DoubleSide }));
    floor.position.y = -0.01; floor.receiveShadow = true; ctx.scene.add(floor);
  }

  /* ------------------------------------------------------------ stands -- */
  var ROWS = [];
  function stands(ctx) {
    var T = ctx.THREE, low = W.low, prof = [], y = 0, dr = 0;
    // a front wall with an LED board, twenty rows, a mezzanine with another
    // board, sixteen more rows, and the back wall up into the roof
    prof.push([0, 0, '#23272F'], [0, 1.35, '#23272F'], [0.5, 1.35, '#2A2E36']);
    y = 1.35; dr = 0.5;
    function rows(n, tag) {
      for (var i = 0; i < n; i++) {
        prof.push([dr, y, '#3A3F48'], [dr, y + 0.42, '#3A3F48']);
        ROWS.push({ dr: dr + 0.52, y: y + 0.42, tier: tag, i: i });
        y += 0.42; prof.push([dr + 0.86, y, '#4A4F58']); dr += 0.86;
      }
    }
    rows(18, 0);
    prof.push([dr + 1.6, y, '#2A2E36'], [dr + 1.6, y + 1.5, '#1E2229'], [dr + 2.1, y + 1.5, '#2A2E36']);
    W.midBoard = { dr: dr + 1.6, y: y }; dr += 2.1; y += 1.5;
    rows(16, 1);
    prof.push([dr + 0.6, y, '#2A2E36'], [dr + 0.6, 30, '#171A20']);
    W.backR = RSTAND + dr + 0.6;
    var g = sweep(T, prof, RSTAND, low ? 18 : 36);
    var m = new T.Mesh(g, new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: T.DoubleSide }));
    m.receiveShadow = true; ctx.scene.add(m);
    // LED ribbon boards: along the front wall and the mezzanine
    var led = ctx.textures.canvas(2048, 64, function (g2, w, h) {
      var segs = [['#0B2E73', 'SPEED SKATING'], ['#1FA2FF', 'LONG TRACK'], ['#0D1B2E', '2030'], ['#E1000F', 'MASS START'], ['#0B2E73', 'LAP AFTER LAP'], ['#1FA2FF', 'GAMEMOG']];
      var sw = w / segs.length;
      segs.forEach(function (s, k) {
        var gr = g2.createLinearGradient(k * sw, 0, (k + 1) * sw, 0); gr.addColorStop(0, s[0]); gr.addColorStop(1, '#0A0F18'); g2.fillStyle = gr; g2.fillRect(k * sw, 0, sw, h);
        g2.fillStyle = '#FFFFFF'; g2.font = '700 40px "Saira Condensed", "Arial Narrow", sans-serif'; g2.textBaseline = 'middle'; g2.fillText(s[1], k * sw + 18, h / 2 + 2);
      });
    });
    led.wrapS = T.RepeatWrapping;
    var ledMat = new T.MeshStandardMaterial({ color: '#000000', emissive: '#FFFFFF', emissiveMap: led, emissiveIntensity: 2.2, roughness: 0.3, side: T.DoubleSide });
    W.led = led;
    var front = sweep(T, [[-0.02, 0.25], [-0.02, 1.15]], RSTAND, low ? 18 : 36, { uScale: 60 });
    ctx.scene.add(new T.Mesh(front, ledMat));
    var mid = sweep(T, [[W.midBoard.dr - 0.02, W.midBoard.y + 0.2], [W.midBoard.dr - 0.02, W.midBoard.y + 1.3]], RSTAND, low ? 18 : 36, { uScale: 60 });
    ctx.scene.add(new T.Mesh(mid, ledMat));
    // hospitality suites along the back wall above the top row: lit glass,
    // people inside, and a last ribbon board under the roof line
    var top = ROWS[ROWS.length - 1], sy = top.y + 1.2, R2 = rng(31);
    var suites = ctx.textures.canvas(1024, 128, function (g2, w, h) {
      g2.fillStyle = '#0A0D12'; g2.fillRect(0, 0, w, h);
      for (var k = 0; k < 16; k++) {
        var x = k * w / 16 + 4, ww = w / 16 - 8, warm = 150 + R2() * 80;
        var gr = g2.createLinearGradient(0, 10, 0, h - 10); gr.addColorStop(0, 'rgb(' + (warm + 40) + ',' + warm + ',' + (warm - 50) + ')'); gr.addColorStop(1, 'rgb(' + (warm * 0.5) + ',' + (warm * 0.42) + ',' + (warm * 0.3) + ')');
        g2.fillStyle = gr; g2.fillRect(x, 12, ww, h - 30);
        for (var q = 0; q < 5; q++) { g2.fillStyle = 'rgba(20,22,28,' + (0.5 + R2() * 0.4) + ')'; var px = x + 6 + R2() * (ww - 20); g2.fillRect(px, h * 0.45, 9, h * 0.4); g2.beginPath(); g2.arc(px + 4.5, h * 0.4, 5, 0, TAU); g2.fill(); }
        g2.fillStyle = '#12151B'; g2.fillRect(x, h - 22, ww, 4);
      }
    });
    suites.wrapS = T.RepeatWrapping;
    var sm = new T.MeshStandardMaterial({ color: '#000000', emissive: '#FFFFFF', emissiveMap: suites, emissiveIntensity: 1.3, roughness: 0.2, side: T.DoubleSide });
    ctx.scene.add(new T.Mesh(sweep(T, [[W.backR - RSTAND - 0.05, sy], [W.backR - RSTAND - 0.05, sy + 2.8]], RSTAND, low ? 18 : 36, { uScale: 80 }), sm));
    ctx.scene.add(new T.Mesh(sweep(T, [[W.backR - RSTAND - 0.06, sy + 3.4], [W.backR - RSTAND - 0.06, sy + 4.2]], RSTAND, low ? 18 : 36, { uScale: 60 }), ledMat));
  }

  /* ------------------------------------------------------------- crowd -- */
  // fans in the seats: a few thousand low figures, instanced, in team colours
  // by section; they bob, cheer, and every half a minute a wave goes round
  function crowd(ctx) {
    var T = ctx.THREE, low = W.low, R1 = rng(77);
    // one low figure, indexed: torso, head, thighs and two arms
    var parts = [];
    function add(geo, part) { var n = geo.attributes.position.count, a = new Float32Array(n); a.fill(part); geo.setAttribute('part', new T.BufferAttribute(a, 1)); parts.push(geo); }
    add(new T.BoxGeometry(0.38, 0.52, 0.24).translate(0, 0.42, -0.02), 0);
    add(new T.SphereGeometry(0.11, 7, 5).scale(1, 1.12, 1).translate(0, 0.83, 0), 1);
    add(new T.BoxGeometry(0.34, 0.16, 0.42).translate(0, 0.1, 0.18), 2);
    [-1, 1].forEach(function (sd) { add(new T.BoxGeometry(0.1, 0.48, 0.1).translate(sd * 0.23, 0.43, 0), 3); });
    var nv = 0, ni = 0; parts.forEach(function (g) { nv += g.attributes.position.count; ni += g.index.count; });
    var pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), part = new Float32Array(nv), ind = new Uint32Array(ni), o = 0, oi = 0;
    parts.forEach(function (g) {
      pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); part.set(g.attributes.part.array, o);
      for (var k = 0; k < g.index.count; k++) ind[oi + k] = g.index.array[k] + o;
      o += g.attributes.position.count; oi += g.index.count;
    });
    var geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(pos, 3)); geo.setAttribute('normal', new T.BufferAttribute(nor, 3)); geo.setAttribute('part', new T.BufferAttribute(part, 1)); geo.setIndex(new T.BufferAttribute(ind, 1));
    // who sits where: sections of one nation's colours, the rest mixed
    var SECT = [['#F36C21', '#F36C21', '#FF8C2E', '#FFFFFF'], ['#BA0C2F', '#FFFFFF', '#00205B'], ['#14264F', '#D22B3A', '#FFFFFF'], ['#F4F4F2', '#BC002D'], ['#D52B1E', '#FFFFFF'], ['#16171A', '#DD0000', '#FFCE00'], ['#1B4FA8', '#FFFFFF', '#009246'], ['#0B2E73', '#FFFFFF', '#E1000F']];
    var MIX = ['#1E2735', '#2D3E57', '#6E1C28', '#C9C3B6', '#1D4B3A', '#3B2F4F', '#8A6A2E', '#26292F', '#34383F', '#2E5C99', '#B64A1E', '#15171B'];
    var seats = [], o2 = {};
    ROWS.forEach(function (row) {
      if (low && row.i % 2) return;
      var r = RSTAND + row.dr, P = per(r), step = 0.58;
      for (var u = 0; u < P; u += step) {
        if (R1() < 0.1) continue;
        ovalAt(u + (row.i % 2) * 0.29, r, o2);
        // a nation's fans in its colours every other section, half of them in their coats
        var sect = Math.floor(u / P * 16), pal = sect % 2 === 0 && R1() < 0.6 ? SECT[(sect / 2) % SECT.length] : MIX;
        seats.push({ x: o2.x, y: row.y, z: o2.z, yaw: Math.atan2(-o2.nx, -o2.nz), c: pal[Math.floor(R1() * pal.length)], s: R1(), w: u / P, big: 0.92 + R1() * 0.16 });
      }
    });
    var mat = new T.MeshStandardMaterial({ roughness: 0.85 });
    W.crowdU = { uTime: { value: 0 } };
    var seedA = new Float32Array(seats.length * 2);
    seats.forEach(function (s, k) { seedA[k * 2] = s.s; seedA[k * 2 + 1] = s.w; });
    mat.onBeforeCompile = function (sh) {
      sh.uniforms.uTime = W.crowdU.uTime;
      sh.vertexShader = 'attribute float part; attribute vec2 aSeed; uniform float uTime;\n' + sh.vertexShader
        .replace('#include <begin_vertex>', [
          '#include <begin_vertex>',
          // the wave: a crest that runs round the bowl; and fans who jump up on their own
          'float wv = fract( aSeed.y - uTime / 26.0 ); float up = smoothstep( 0.0, 0.012, wv ) * ( 1.0 - smoothstep( 0.02, 0.05, wv ) );',
          'float own = smoothstep( 0.9, 0.98, sin( uTime * ( 0.7 + aSeed.x * 1.3 ) + aSeed.x * 60.0 ) );',
          'float cheer = max( up, own );',
          'if ( part > 2.5 ) {',
          '  float side = sign( transformed.x ); vec3 sh0 = vec3( side * 0.23, 0.67, 0.0 );',
          '  float a = -cheer * ( 2.6 + 0.3 * sin( uTime * 9.0 + aSeed.x * 20.0 ) );',
          '  vec3 p = transformed - sh0; float c = cos( a ), s = sin( a );',
          '  transformed = sh0 + vec3( p.x, p.y * c - p.z * s, p.y * s + p.z * c );',
          '}',
          'transformed.y += up * 0.32 + 0.02 * sin( uTime * 3.0 + aSeed.x * 40.0 ) * ( 0.3 + own );',
        ].join('\n'))
        .replace('#include <color_vertex>', [
          '#include <color_vertex>',
          '#ifdef USE_INSTANCING_COLOR',
          'float tone = fract( aSeed.x * 7.13 );',
          'vec3 skin = mix( mix( vec3( 0.93, 0.72, 0.58 ), vec3( 0.55, 0.36, 0.24 ), smoothstep( 0.35, 0.75, tone ) ), vec3( 0.28, 0.18, 0.12 ), smoothstep( 0.8, 0.98, tone ) );',
          'if ( part > 0.5 && part < 1.5 ) vColor = skin;',
          'else if ( part > 1.5 && part < 2.5 ) vColor = mix( vec3( 0.07, 0.08, 0.1 ), vec3( 0.2, 0.26, 0.38 ), step( 0.6, aSeed.x ) );',
          '#endif',
        ].join('\n'));
    };
    var im = new T.InstancedMesh(geo, mat, seats.length), D = new T.Object3D(), col = new T.Color();
    seats.forEach(function (s, k) { D.position.set(s.x, s.y, s.z); D.rotation.set(0, s.yaw, 0); D.scale.setScalar(s.big); D.updateMatrix(); im.setMatrixAt(k, D.matrix); im.setColorAt(k, col.set(s.c)); });
    geo.setAttribute('aSeed', new T.InstancedBufferAttribute(seedA, 2));
    im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true;
    // the ice mirrors the track and the lights; the far bowl of fans is left out of it
    im.frustumCulled = false; im.userData.noReflection = true;
    ctx.scene.add(im);
    // flags held up in the crowd, waving
    var atlas = W.flags || (W.flags = flagAtlas(ctx, 1024, 256));
    var fl = seats.filter(function (s) { return s.s > (low ? 0.992 : 0.978); });
    var fg = new T.PlaneGeometry(0.95, 0.62, 8, 2).translate(0.5, 1.45, 0.08);
    var fa = new Float32Array(fl.length * 2);
    fl.forEach(function (s, k) { var f = Math.floor(s.s * 1000) % 16; fa[k * 2] = (f % 4) * 0.25; fa[k * 2 + 1] = 0.75 - Math.floor(f / 4) * 0.25; });
    fg.setAttribute('aFlag', new T.InstancedBufferAttribute(fa, 2));
    var fmat = new T.MeshStandardMaterial({ map: atlas, side: T.DoubleSide, roughness: 0.8 });
    fmat.onBeforeCompile = function (sh) {
      sh.uniforms.uTime = W.crowdU.uTime;
      sh.vertexShader = 'attribute vec2 aFlag; uniform float uTime;\n' + sh.vertexShader
        .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\n  vMapUv = vMapUv * 0.25 + aFlag;\n#endif')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n  float fx = max( 0.0, transformed.x - 0.02 ); transformed.z += sin( fx * 7.0 - uTime * 7.0 + aFlag.x * 13.0 ) * 0.09 * fx; transformed.x += sin( uTime * 2.0 + aFlag.y * 9.0 ) * 0.04;');
    };
    var fim = new T.InstancedMesh(fg, fmat, fl.length);
    fl.forEach(function (s, k) { D.position.set(s.x, s.y, s.z); D.rotation.set(0, s.yaw + (s.s - 0.985) * 30, 0); D.scale.setScalar(1); D.updateMatrix(); fim.setMatrixAt(k, D.matrix); });
    fim.instanceMatrix.needsUpdate = true; fim.frustumCulled = false; fim.userData.noReflection = true; ctx.scene.add(fim);
    var sticks = ctx.instanced(new T.CylinderGeometry(0.01, 0.01, 1.0, 4).translate(0, 1.2, 0.08), new T.MeshStandardMaterial({ color: '#CFC9BD' }), fl.length, function (k, dd) { var s = fl[k]; dd.position.set(s.x, s.y, s.z); dd.rotation.y = s.yaw + (s.s - 0.985) * 30; });
    sticks.frustumCulled = false; sticks.userData.noReflection = true; ctx.scene.add(sticks);
    // phone cameras going off round the bowl
    var nf = low ? 160 : 520, fp = new Float32Array(nf * 3), fs = new Float32Array(nf);
    for (var k = 0; k < nf; k++) { var st = seats[Math.floor(R1() * seats.length)]; fp[k * 3] = st.x; fp[k * 3 + 1] = st.y + 1.05; fp[k * 3 + 2] = st.z; fs[k] = R1(); }
    var fgeo = new T.BufferGeometry(); fgeo.setAttribute('position', new T.BufferAttribute(fp, 3)); fgeo.setAttribute('seed', new T.BufferAttribute(fs, 1));
    var flashes = new T.Points(fgeo, new T.ShaderMaterial({
      transparent: true, depthWrite: false, blending: T.AdditiveBlending, uniforms: { uTime: W.crowdU.uTime },
      vertexShader: 'attribute float seed; uniform float uTime; varying float vF; void main() { float c = fract( uTime * ( 0.13 + seed * 0.21 ) + seed * 17.0 ); vF = smoothstep( 0.0, 0.01, c ) * ( 1.0 - smoothstep( 0.012, 0.03, c ) ); vec4 mv = modelViewMatrix * vec4( position, 1.0 ); gl_PointSize = vF > 0.0 ? 900.0 / -mv.z : 0.0; gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'varying float vF; void main() { vec2 q = gl_PointCoord - 0.5; float d = dot( q, q ); if ( d > 0.25 ) discard; gl_FragColor = vec4( vec3( 6.0, 6.2, 6.6 ) * vF * pow( 1.0 - d * 4.0, 3.0 ), 1.0 ); }',
    }));
    flashes.frustumCulled = false; flashes.userData.noReflection = true; ctx.scene.add(flashes);
  }
  // sixteen flags in a 4 x 4 atlas
  function flagAtlas(ctx, w, h) {
    return ctx.textures.canvas(w, h * 2, function (g, cw, ch) {
      var fw = cw / 4, fh = ch / 4;
      FLAG_ORDER.forEach(function (code, k) { drawFlag(g, (k % 4) * fw, Math.floor(k / 4) * fh, fw, fh, NATIONS[code].flag); });
    });
  }

  /* -------------------------------------------------------------- hall -- */
  // a barrel roof on long-span trusses over the whole bowl, dark walls
  var ROOF_H = 25, ROOF_RISE = 9, HALL_X = 128, HALL_Z = 72;
  function roofY(z) { var t = z / HALL_Z; return ROOF_H + ROOF_RISE * (1 - t * t); }
  function hall(ctx) {
    var T = ctx.THREE, low = W.low;
    var rg = new T.PlaneGeometry(HALL_X * 2, HALL_Z * 2, 1, 24); rg.rotateX(PI / 2);
    var p = rg.attributes.position; for (var i = 0; i < p.count; i++) p.setY(i, roofY(p.getZ(i)));
    rg.computeVertexNormals();
    var deck = ctx.textures.canvas(256, 256, function (g, w, h) { g.fillStyle = '#1C2029'; g.fillRect(0, 0, w, h); g.fillStyle = '#23283292'; for (var k = 0; k < 16; k++) g.fillRect(k * w / 16, 0, w / 32, h); });
    deck.wrapS = deck.wrapT = T.RepeatWrapping; deck.repeat.set(40, 1);
    ctx.scene.add(new T.Mesh(rg, new T.MeshStandardMaterial({ map: deck, roughness: 0.9, side: T.DoubleSide })));
    // the end walls under the barrel, and the long walls
    var wallMat = new T.MeshStandardMaterial({ color: '#161A21', roughness: 0.95, side: T.DoubleSide });
    [-1, 1].forEach(function (sd) {
      var s = new T.Shape(); s.moveTo(-HALL_Z, 0); for (var k = 0; k <= 24; k++) { var z = -HALL_Z + 2 * HALL_Z * k / 24; s.lineTo(z, roofY(z)); } s.lineTo(HALL_Z, 0);
      var eg = new T.ShapeGeometry(s); eg.rotateY(PI / 2); var e = new T.Mesh(eg, wallMat); e.position.x = sd * HALL_X; ctx.scene.add(e);
      var lw = new T.Mesh(new T.PlaneGeometry(HALL_X * 2, ROOF_H), wallMat); lw.position.set(0, ROOF_H / 2, sd * HALL_Z); ctx.scene.add(lw);
    });
    // long-span trusses every 12 m: chords following the barrel and a web between
    var tp = [], TR = [];
    function tube(a, b, r) { var len = a.distanceTo(b), g = new T.CylinderGeometry(r, r, len, 6, 1, true); g.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), b.clone().sub(a).normalize())); g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2); tp.push(g); }
    var N = 20, prev = null, prevB = null;
    for (var k = 0; k <= N; k++) {
      var z = -HALL_Z + 2 * HALL_Z * k / N, top = new T.Vector3(0, roofY(z) - 0.4, z), bot = new T.Vector3(0, roofY(z) - 3.2 + 1.2 * Math.abs(z / HALL_Z), z);
      if (prev) { tube(prev, top, 0.18); tube(prevB, bot, 0.16); tube(k % 2 ? prev : prevB, k % 2 ? bot : top, 0.08); }
      tube(top, bot, 0.07); prev = top; prevB = bot;
    }
    var truss = mergeGeo(T, tp);
    for (var x = -HALL_X + 8; x <= HALL_X - 8; x += 12) TR.push(x);
    var tm = ctx.instanced(truss, new T.MeshStandardMaterial({ color: '#5C6370', metalness: 0.6, roughness: 0.5 }), TR.length, function (n, dd) { dd.position.x = TR[n]; });
    ctx.scene.add(tm);
    W.trussX = TR;
    // purlins: steel lines between the trusses
    var pz = []; for (var q2 = -60; q2 <= 60; q2 += 10) pz.push(q2);
    ctx.scene.add(ctx.instanced(new T.BoxGeometry(HALL_X * 2 - 16, 0.3, 0.2), new T.MeshStandardMaterial({ color: '#3C424D', metalness: 0.5, roughness: 0.6 }), pz.length, function (n, dd) { dd.position.set(0, roofY(pz[n]) - 0.5, pz[n]); }));
    // the giant screens at each end, over the bends
    // the live television picture of the race, where the device can afford
    // it, under the broadcaster's graphics; otherwise the results board
    var tv = ctx.broadcast ? ctx.broadcast() : null;
    [-1, 1].forEach(function (sd) {
      var tex = ctx.textures.canvas(1024, 576, function (g, w, h) { screenArt(g, w, h, sd); });
      var sc = new T.Mesh(new T.PlaneGeometry(30, 16.9), new T.MeshStandardMaterial({ color: '#000000', emissive: '#FFFFFF', emissiveMap: tv || tex, emissiveIntensity: tv ? 1.25 : 1.7, roughness: 0.4 }));
      sc.position.set(sd * (HALL_X - 1.5), 20, 0); sc.rotation.y = -sd * PI / 2; ctx.scene.add(sc);
      if (tv) {
        var over = ctx.textures.canvas(1024, 576, function (g, w, h) { overlayArt(g, w, h, sd); });
        var ov = new T.Mesh(new T.PlaneGeometry(30, 16.9), new T.MeshBasicMaterial({ map: over, transparent: true, depthWrite: false, toneMapped: false }));
        ov.position.copy(sc.position); ov.position.x -= sd * 0.05; ov.rotation.copy(sc.rotation); ctx.scene.add(ov);
      }
      var frame = new T.Mesh(new T.BoxGeometry(1.2, 18.4, 31.5), new T.MeshStandardMaterial({ color: '#0C0E12', roughness: 0.6 })); frame.position.set(sd * (HALL_X - 0.8), 20, 0); ctx.scene.add(frame);
    });
  }
  function mergeGeo(T, list) {
    var n = 0; list.forEach(function (g) { g = g.index ? g : g; n += (g.index ? g.index.count : g.attributes.position.count); });
    var pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), o = 0;
    list.forEach(function (g) { g = g.index ? g.toNonIndexed() : g; pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count; });
    var m = new T.BufferGeometry(); m.setAttribute('position', new T.BufferAttribute(pos, 3)); m.setAttribute('normal', new T.BufferAttribute(nor, 3)); return m;
  }
  function mergeIndexed(T, list) {
    var nv = 0, ni = 0; list.forEach(function (g) { nv += g.attributes.position.count; ni += g.index.count; });
    var pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), part = new Float32Array(nv), ind = new Uint32Array(ni), o = 0, oi = 0;
    list.forEach(function (g) {
      pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); if (g.attributes.part) part.set(g.attributes.part.array, o);
      for (var k = 0; k < g.index.count; k++) ind[oi + k] = g.index.array[k] + o;
      o += g.attributes.position.count; oi += g.index.count;
    });
    var m = new T.BufferGeometry(); m.setAttribute('position', new T.BufferAttribute(pos, 3)); m.setAttribute('normal', new T.BufferAttribute(nor, 3)); m.setAttribute('part', new T.BufferAttribute(part, 1)); m.setIndex(new T.BufferAttribute(ind, 1));
    return m;
  }
  // the broadcaster's graphics over the live picture: a bug, a clock, a lower third
  function overlayArt(g, w, h, sd) {
    g.clearRect(0, 0, w, h);
    g.fillStyle = 'rgba(8,14,26,0.82)'; g.fillRect(36, 30, 250, 52);
    g.fillStyle = '#E1000F'; g.fillRect(36, 30, 64, 52);
    g.fillStyle = '#FFFFFF'; g.font = '800 30px "Saira Condensed", "Arial Narrow", sans-serif'; g.textBaseline = 'middle'; g.fillText('LIVE', 44, 57);
    g.font = '700 26px "Saira Condensed", "Arial Narrow", sans-serif'; g.fillText(sd > 0 ? 'MASS START' : 'LONG TRACK', 114, 57);
    var y = h - 118;
    g.fillStyle = 'rgba(8,14,26,0.86)'; g.fillRect(36, y, 560, 70);
    g.fillStyle = '#1FA2FF'; g.fillRect(36, y, 8, 70);
    drawFlag(g, 60, y + 16, 57, 38, NATIONS.USA.flag);
    g.fillStyle = '#FFFFFF'; g.font = '800 40px "Saira Condensed", "Arial Narrow", sans-serif'; g.fillText('REYES', 134, y + 36);
    g.fillStyle = '#9FD3FF'; g.font = '600 28px "Saira Condensed", "Arial Narrow", sans-serif'; g.fillText('USA  /  SPEED SKATING 2030', 250, y + 37);
    g.fillStyle = 'rgba(8,14,26,0.86)'; g.fillRect(w - 250, 30, 214, 52);
    g.fillStyle = '#FFC400'; g.font = '800 30px "Saira Condensed", "Arial Narrow", sans-serif'; g.fillText('LAPS TO GO  \u221E', w - 236, 57);
  }
  function screenArt(g, w, h, sd) {
    var gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#07122A'); gr.addColorStop(1, '#0B3A7A'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(31,162,255,0.35)'; g.lineWidth = 3; for (var k = 0; k < 7; k++) { g.beginPath(); g.ellipse(w * 0.78, h * 0.62, 90 + k * 40, 40 + k * 18, 0, 0, TAU); g.stroke(); }
    g.fillStyle = '#FFFFFF'; g.textBaseline = 'alphabetic';
    g.font = '800 64px "Saira Condensed", "Arial Narrow", sans-serif'; g.fillText(sd > 0 ? 'MASS START' : 'LONG TRACK', 48, 96);
    g.font = '600 30px "Saira Condensed", "Arial Narrow", sans-serif'; g.fillStyle = '#9FD3FF'; g.fillText(sd > 0 ? 'SPEED SKATING  /  LAP AFTER LAP' : 'SPEED SKATING  /  2030', 50, 138);
    var rows = sd > 0 ? [['1', 'NED', 'MULDER', '5:58.21'], ['2', 'NOR', 'HAUGEN', '+0.14'], ['3', 'USA', 'REYES', '+0.19'], ['4', 'JPN', 'TANABE', '+0.46'], ['5', 'CAN', 'BEAULIEU', '+0.71']]
      : [['LAP', '', '', ''], ['', '', '', '']];
    if (sd > 0) rows.forEach(function (r, k) {
      var y = 200 + k * 64;
      g.fillStyle = k % 2 ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.12)'; g.fillRect(48, y - 44, 560, 56);
      drawFlag(g, 104, y - 34, 54, 36, NATIONS[r[1]].flag);
      g.fillStyle = '#FFFFFF'; g.font = '700 36px "Saira Condensed", "Arial Narrow", sans-serif'; g.fillText(r[0], 64, y); g.fillText(r[1], 176, y); g.fillText(r[2], 256, y);
      g.fillStyle = '#9FD3FF'; g.fillText(r[3], 470, y);
    });
    else {
      g.font = '800 300px "Saira Condensed", "Arial Narrow", sans-serif'; g.fillStyle = '#FFFFFF'; g.fillText('∞', 70, 480);
      g.font = '700 44px "Saira Condensed", "Arial Narrow", sans-serif'; g.fillStyle = '#9FD3FF'; g.fillText('LAPS TO GO', 90, 230);
    }
  }

  /* -------------------------------------------------------- roof lights -- */
  // long rows of luminaires down the length of the hall, and a ring of
  // floodlights over the track: the lines of light the ice gives back
  function roofLights(ctx) {
    var T = ctx.THREE, spots = [];
    for (var z = -48; z <= 48; z += 8) for (var x = -110; x <= 110; x += 3.2) spots.push([x, z]);
    var lampMat = new T.MeshStandardMaterial({ color: '#10131A', emissive: '#F2F6FF', emissiveIntensity: 6, roughness: 0.4 });
    var lamps = ctx.instanced(new T.BoxGeometry(2.4, 0.18, 0.55), lampMat, spots.length, function (n, dd) { dd.position.set(spots[n][0], roofY(spots[n][1]) - 3.6, spots[n][1]); });
    ctx.scene.add(lamps);
    var housing = ctx.instanced(new T.BoxGeometry(2.6, 0.3, 0.8).translate(0, 0.22, 0), new T.MeshStandardMaterial({ color: '#2B303A', metalness: 0.5, roughness: 0.5 }), spots.length, function (n, dd) { dd.position.set(spots[n][0], roofY(spots[n][1]) - 3.6, spots[n][1]); });
    ctx.scene.add(housing);
    // floodlights ringing the track
    var fl = [], o = {};
    for (var u = 0; u < per(R + 2); u += 7) { ovalAt(u, R + 2, o); fl.push([o.x, o.z]); }
    var flood = ctx.instanced(new T.CylinderGeometry(0.45, 0.35, 0.4, 16), new T.MeshStandardMaterial({ color: '#10131A', emissive: '#FFF8EE', emissiveIntensity: 11 }), fl.length, function (n, dd) { dd.position.set(fl[n][0], roofY(fl[n][1]) - 4.4, fl[n][1]); });
    ctx.scene.add(flood);
  }

  /* ----------------------------------------------------------- big flags -- */
  // national flags, six metres long, hanging over the infield and moving in
  // the hall's air
  function bigFlags(ctx) {
    var T = ctx.THREE, atlas = W.flags || (W.flags = flagAtlas(ctx, 1024, 256)), spots = [];
    [-42, -21, 0, 21, 42].forEach(function (x, i) { [-9, 0, 9].forEach(function (z, j) { spots.push([x, z, (i * 3 + j) % 16]); }); });
    var g = new T.PlaneGeometry(4, 6, 6, 10).translate(0, -3, 0);
    var fa = new Float32Array(spots.length * 2);
    spots.forEach(function (s, k) { fa[k * 2] = (s[2] % 4) * 0.25; fa[k * 2 + 1] = 0.75 - Math.floor(s[2] / 4) * 0.25; });
    g.setAttribute('aFlag', new T.InstancedBufferAttribute(fa, 2));
    var mat = new T.MeshStandardMaterial({ map: atlas, side: T.DoubleSide, roughness: 0.85 });
    mat.onBeforeCompile = function (sh) {
      sh.uniforms.uTime = W.crowdU.uTime;
      // hung by the short edge: the flag's width runs down, so its picture is turned a quarter
      sh.vertexShader = 'attribute vec2 aFlag; uniform float uTime;\n' + sh.vertexShader
        .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\n  vMapUv = vec2( 1.0 - vMapUv.y, vMapUv.x ) * 0.25 + aFlag;\n#endif')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n  float dn = -transformed.y / 6.0; transformed.z += sin( dn * 5.0 - uTime * 1.6 + aFlag.x * 11.0 + aFlag.y * 7.0 ) * 0.35 * dn + sin( transformed.x * 2.0 + uTime ) * 0.05 * dn;');
    };
    var im = new T.InstancedMesh(g, mat, spots.length), D = new T.Object3D();
    spots.forEach(function (s, k) { D.position.set(s[0], roofY(s[1]) - 6.2, s[1]); D.rotation.set(0, PI / 2, 0); D.updateMatrix(); im.setMatrixAt(k, D.matrix); });
    im.instanceMatrix.needsUpdate = true; im.frustumCulled = false; ctx.scene.add(im);
  }

  /* ------------------------------------------------------------ infield -- */
  function infield(ctx) {
    var T = ctx.THREE, low = W.low;
    // a rink in the middle: boards, a rail and glass at the ends
    var rink = new T.Shape(), RW2 = 30, RH = 14, RC = 7;
    rink.moveTo(-RW2 + RC, -RH); rink.lineTo(RW2 - RC, -RH); rink.absarc(RW2 - RC, -RH + RC, RC, -PI / 2, 0); rink.lineTo(RW2, RH - RC); rink.absarc(RW2 - RC, RH - RC, RC, 0, PI / 2); rink.lineTo(-RW2 + RC, RH); rink.absarc(-RW2 + RC, RH - RC, RC, PI / 2, PI); rink.lineTo(-RW2, -RH + RC); rink.absarc(-RW2 + RC, -RH + RC, RC, PI, 1.5 * PI);
    var pts = rink.getSpacedPoints(160);
    var bp = [], bc = [], bv = [];
    function wall(y0, y1, hex, off) {
      var c = new T.Color(hex), base = bp.length / 3;
      for (var i = 0; i < pts.length; i++) { var p = pts[i]; bp.push(p.x, y0, p.y, p.x, y1, p.y); bc.push(c.r, c.g, c.b, c.r, c.g, c.b); }
      for (i = 0; i < pts.length - 1; i++) { var a = base + i * 2; bv.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    wall(0, 0.22, '#F5C518'); wall(0.22, 1.05, '#F4F6F8'); wall(1.05, 1.12, '#1FA2FF');
    var bg = new T.BufferGeometry(); bg.setAttribute('position', new T.Float32BufferAttribute(bp, 3)); bg.setAttribute('color', new T.Float32BufferAttribute(bc, 3)); bg.setIndex(bv); bg.computeVertexNormals();
    var boards = new T.Mesh(bg, new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, side: T.DoubleSide })); boards.castShadow = true; ctx.scene.add(boards);
    var gp = [], gv = [];
    for (var i = 0; i < pts.length; i++) { gp.push(pts[i].x, 1.12, pts[i].y, pts[i].x, 2.4, pts[i].y); }
    for (i = 0; i < pts.length - 1; i++) { var a = i * 2; if (Math.abs(pts[i].x) > RW2 - RC - 2) gv.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    var gg = new T.BufferGeometry(); gg.setAttribute('position', new T.Float32BufferAttribute(gp, 3)); gg.setIndex(gv); gg.computeVertexNormals();
    ctx.scene.add(new T.Mesh(gg, new T.MeshPhysicalMaterial({ color: '#DDEBF5', roughness: 0.05, transmission: 0, transparent: true, opacity: 0.18, side: T.DoubleSide, depthWrite: false })));
    // team zones between the rink and the warm-up lane: a low padded wall in
    // each nation's colours, coaches in team jackets behind it
    var codes = FLAG_ORDER, zones = [];
    for (var x = -46; x <= 46; x += 4.1) [-1, 1].forEach(function (sd) { zones.push([x, sd * 19.9, codes[zones.length % codes.length]]); });
    var zoneTex = ctx.textures.canvas(1024, 256, function (g, w, h) {
      codes.forEach(function (c, k) {
        var fw = w / 8, fh = h / 2, x0 = (k % 8) * fw, y0 = Math.floor(k / 8) * fh;
        g.fillStyle = '#0E1522'; g.fillRect(x0, y0, fw, fh);
        drawFlag(g, x0 + 6, y0 + 8, fw * 0.42, fh * 0.56, NATIONS[c].flag);
        g.fillStyle = '#FFFFFF'; g.font = '800 38px "Saira Condensed", "Arial Narrow", sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(c, x0 + fw * 0.5, y0 + fh * 0.38);
        g.fillStyle = NATIONS[c].suit === '#F4F4F2' ? NATIONS[c].trim : NATIONS[c].suit; g.fillRect(x0, y0 + fh - 18, fw, 12);
        g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x0 + fw - 2, y0, 2, fh);
      });
    });
    var zg = new T.BoxGeometry(4.0, 1.05, 0.3).translate(0, 0.525, 0);
    var za = new Float32Array(zones.length * 2);
    zones.forEach(function (c, k) { var n = codes.indexOf(c[2]); za[k * 2] = (n % 8) / 8; za[k * 2 + 1] = 0.5 - Math.floor(n / 8) * 0.5; });
    zg.setAttribute('aTeam', new T.InstancedBufferAttribute(za, 2));
    var zmat = new T.MeshStandardMaterial({ map: zoneTex, roughness: 0.7 });
    zmat.onBeforeCompile = function (sh) { sh.vertexShader = 'attribute vec2 aTeam;\n' + sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\n  vMapUv = vMapUv * vec2( 0.125, 0.5 ) + aTeam;\n#endif'); };
    var zm = new T.InstancedMesh(zg, zmat, zones.length), D = new T.Object3D();
    zones.forEach(function (c, k) { D.position.set(c[0], 0, c[1]); D.rotation.set(0, c[1] > 0 ? 0 : PI, 0); D.updateMatrix(); zm.setMatrixAt(k, D.matrix); });
    zm.instanceMatrix.needsUpdate = true; zm.castShadow = true; ctx.scene.add(zm);
    // coaches and staff: standing figures in team jackets, some watching the
    // race, some talking to each other
    var staff = [], R3 = rng(8);
    zones.forEach(function (z, k) { var n = 1 + Math.floor(R3() * 2.2); for (var q = 0; q < n; q++) staff.push({ x: z[0] + (R3() - 0.5) * 3.2, z: z[1] - Math.sign(z[1]) * (0.9 + R3() * 1.6), yaw: (z[1] > 0 ? 0 : PI) + (R3() - 0.5) * 1.6, c: NATIONS[z[2]].suit === '#F4F4F2' ? NATIONS[z[2]].trim : NATIONS[z[2]].suit, s: R3() }); });
    var sp = [], add = function (g, part) { var n = g.attributes.position.count, a = new Float32Array(n); a.fill(part); g.setAttribute('part', new T.BufferAttribute(a, 1)); sp.push(g); };
    add(new T.BoxGeometry(0.42, 0.62, 0.26).translate(0, 1.2, 0), 0); add(new T.SphereGeometry(0.11, 8, 6).scale(1, 1.12, 1).translate(0, 1.66, 0), 1);
    add(new T.BoxGeometry(0.36, 0.86, 0.22).translate(0, 0.46, 0), 2);
    [-1, 1].forEach(function (sd) { add(new T.BoxGeometry(0.11, 0.58, 0.11).translate(sd * 0.27, 1.18, 0), 0); });
    var sg = mergeIndexed(T, sp);
    var smat = new T.MeshStandardMaterial({ roughness: 0.8 });
    smat.onBeforeCompile = function (sh) {
      sh.vertexShader = 'attribute float part;\n' + sh.vertexShader.replace('#include <color_vertex>', '#include <color_vertex>\n#ifdef USE_INSTANCING_COLOR\n  if ( part > 0.5 && part < 1.5 ) vColor = vec3( 0.72, 0.52, 0.4 ); else if ( part > 1.5 ) vColor = vec3( 0.06, 0.07, 0.09 );\n#endif');
    };
    var stm = new T.InstancedMesh(sg, smat, staff.length), col = new T.Color();
    staff.forEach(function (f, k) { D.position.set(f.x, 0, f.z); D.rotation.set(0, f.yaw, 0); D.scale.setScalar(0.95 + f.s * 0.1); D.updateMatrix(); stm.setMatrixAt(k, D.matrix); stm.setColorAt(k, col.set(f.c)); });
    stm.instanceMatrix.needsUpdate = true; stm.instanceColor.needsUpdate = true; stm.castShadow = true; ctx.scene.add(stm);
    // rubber matting under them
    var mat = new T.Mesh(new T.PlaneGeometry(100, 5.4).rotateX(-PI / 2), new T.MeshStandardMaterial({ color: '#20242C', roughness: 0.95 }));
    [-1, 1].forEach(function (sd) { var m = mat.clone(); m.position.set(0, 0.012, sd * 17.6); ctx.scene.add(m); });
    // two skaters warming up round the rink, and a few more resting
    if (!low) W.warm = [0, 1].map(function (k) {
      var f = FIELD[(k * 5 + 3) % FIELD.length], sk = skater(ctx, Object.assign({}, f, { name: f.name }), 20 + k);
      var holder = new T.Group(); holder.add(sk.object); ctx.scene.add(holder);
      return { holder: holder, s: sk, u: k * 0.5 };
    });
    // the judges' tower and the lap counter by the finish line
    var tw = new T.Group();
    var legs = new T.Mesh(new T.BoxGeometry(3.2, 3.2, 2.6).translate(0, 1.6, 0), new T.MeshStandardMaterial({ color: '#2B303A', roughness: 0.6 }));
    var box = new T.Mesh(new T.BoxGeometry(4, 2.4, 3).translate(0, 4.4, 0), new T.MeshStandardMaterial({ color: '#E9EEF3', roughness: 0.5 }));
    var glass = new T.Mesh(new T.BoxGeometry(4.05, 1.1, 3.05).translate(0, 4.7, 0), new T.MeshStandardMaterial({ color: '#0A1622', roughness: 0.08, metalness: 0.4 }));
    tw.add(legs, box, glass); tw.position.set(-HS + 3, 0, 17.5); ctx.scene.add(tw);
    var lapTex = ctx.textures.canvas(256, 256, function (g, w, h) {
      g.fillStyle = '#0A0B0D'; g.fillRect(0, 0, w, h); g.fillStyle = '#FFC400'; g.font = '800 190px "Saira Condensed", "Arial Narrow", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('∞', w / 2, h * 0.47);
      g.font = '700 30px "Saira Condensed", "Arial Narrow", sans-serif'; g.fillText('LAPS TO GO', w / 2, h * 0.88);
    });
    var lap = new T.Group();
    var face = new T.Mesh(new T.PlaneGeometry(2.2, 2.2), new T.MeshStandardMaterial({ color: '#000000', emissive: '#FFFFFF', emissiveMap: lapTex, emissiveIntensity: 2.4 }));
    face.position.set(0, 2.9, 0.16); lap.add(face);
    lap.add(new T.Mesh(new T.BoxGeometry(2.4, 2.4, 0.3).translate(0, 2.9, 0), new T.MeshStandardMaterial({ color: '#16181D', roughness: 0.5 })));
    lap.add(new T.Mesh(new T.CylinderGeometry(0.06, 0.06, 1.8, 8).translate(0, 0.9, 0), new T.MeshStandardMaterial({ color: '#3A3F48', metalness: 0.6, roughness: 0.4 })));
    var bell = new T.Mesh(new T.SphereGeometry(0.22, 16, 10, 0, TAU, 0, PI * 0.6), new T.MeshStandardMaterial({ color: '#D9B04A', metalness: 1, roughness: 0.25, side: T.DoubleSide }));
    bell.position.set(1.4, 3.8, 0); bell.rotation.x = PI; lap.add(bell);
    lap.position.set(-HS + 12, 0, 19.2); ctx.scene.add(lap);
    // warm-up bikes on trainers behind the cabins
    var bikes = [];
    for (var bx = -40; bx <= 40; bx += 10) bikes.push([bx + 2, -15.6]);
    var bk = new T.Group(), bm = new T.MeshStandardMaterial({ color: '#2A2D33', metalness: 0.5, roughness: 0.4 });
    bk.add(new T.Mesh(new T.TorusGeometry(0.33, 0.025, 6, 24).rotateY(PI / 2).translate(0, 0.35, -0.5), bm), new T.Mesh(new T.TorusGeometry(0.33, 0.025, 6, 24).rotateY(PI / 2).translate(0, 0.35, 0.5), bm), new T.Mesh(new T.BoxGeometry(0.05, 0.05, 1).rotateX(-0.4).translate(0, 0.62, 0), bm));
    bikes.forEach(function (b) { var c = bk.clone(); c.position.set(b[0], 0, b[1]); c.rotation.y = PI / 2; ctx.scene.add(c); });
  }

  /* ---------------------------------------------------------- trackside -- */
  // the TV rail camera that rides alongside the skaters down the home
  // straight, and the timing posts at the finish line
  function trackside(ctx) {
    var T = ctx.THREE, rz = RPAD + 1.3;
    var rail = new T.Mesh(new T.BoxGeometry(2 * HS + 8, 0.12, 0.5).translate(0, 0.06, 0), new T.MeshStandardMaterial({ color: '#3A3F48', metalness: 0.7, roughness: 0.35 }));
    rail.position.set(0, 0, rz); ctx.scene.add(rail);
    var dolly = new T.Group(), dm = new T.MeshStandardMaterial({ color: '#16181D', metalness: 0.4, roughness: 0.4 });
    dolly.add(new T.Mesh(new T.BoxGeometry(1.2, 0.35, 0.8).translate(0, 0.3, 0), dm));
    dolly.add(new T.Mesh(new T.CylinderGeometry(0.06, 0.06, 0.9, 8).translate(0, 0.9, 0), dm));
    var head = new T.Mesh(new T.BoxGeometry(0.34, 0.32, 0.62), new T.MeshStandardMaterial({ color: '#E8ECF0', roughness: 0.4 })); head.position.set(0, 1.45, 0); dolly.add(head);
    var lens = new T.Mesh(new T.CylinderGeometry(0.1, 0.1, 0.3, 16).rotateX(PI / 2), new T.MeshStandardMaterial({ color: '#0A0B0D', roughness: 0.1, metalness: 0.8 })); lens.position.set(0, 1.45, -0.42); head.add(lens); lens.position.set(0, 0, -0.42);
    var tally = new T.Mesh(new T.BoxGeometry(0.06, 0.04, 0.04), new T.MeshStandardMaterial({ color: '#300', emissive: '#FF1A1A', emissiveIntensity: 6 })); tally.position.set(0.12, 0.18, 0.2); head.add(tally);
    dolly.position.set(0, 0.12, rz); ctx.scene.add(dolly);
    W.dolly = dolly; W.dollyHead = head;
    [-1, 1].forEach(function (sd) {
      var post = new T.Mesh(new T.BoxGeometry(0.22, 1.6, 0.22).translate(0, 0.8, 0), new T.MeshStandardMaterial({ color: '#16181D', roughness: 0.5 }));
      post.position.set(-HS, 0, sd > 0 ? RPAD + 0.6 : RW - 1.4); ctx.scene.add(post);
      var eye = new T.Mesh(new T.BoxGeometry(0.1, 0.1, 0.1), new T.MeshStandardMaterial({ color: '#200', emissive: '#FF3030', emissiveIntensity: 5 })); eye.position.set(-HS, 1.35, sd > 0 ? RPAD + 0.48 : RW - 1.28); ctx.scene.add(eye);
    });
  }

  /* --------------------------------------------------------- obstacles -- */
  function obstacles(ctx) {
    var T = ctx.THREE, list = [];
    function blocks() {
      var g = new T.Group(), m = new T.MeshStandardMaterial({ color: '#15171B', roughness: 0.7 }), cap = new T.MeshStandardMaterial({ color: '#1FA2FF', emissive: '#1FA2FF', emissiveIntensity: 0.6 });
      [[-0.45, 0.2, 0.3], [0, -0.1, 1.2], [0.42, 0.25, 2.1], [0.1, 0.45, 0.6]].forEach(function (b) {
        var h = new T.Mesh(new T.CylinderGeometry(0.075, 0.09, 0.11, 10).translate(0, 0.055, 0), m); h.position.set(b[0], 0, b[1]); if (b[2] > 1.5) { h.rotation.z = PI / 2; h.position.y = 0.08; }
        var c = new T.Mesh(new T.CylinderGeometry(0.076, 0.076, 0.02, 10).translate(0, 0.11, 0), cap); h.add(c); h.castShadow = true; g.add(h);
      });
      return g;
    }
    function pad() {
      var g = new T.Group(), m = new T.Mesh(new T.BoxGeometry(1.5, 0.55, 0.9).translate(0, 0.28, 0), new T.MeshStandardMaterial({ color: '#0D3B8C', roughness: 0.75 }));
      m.rotation.set(0, 0.5, 0.18); m.castShadow = true; g.add(m);
      var band = new T.Mesh(new T.BoxGeometry(1.52, 0.06, 0.92).translate(0, 0.46, 0), new T.MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.6 })); band.rotation.copy(m.rotation); g.add(band);
      return g;
    }
    function snow() {
      var g = new T.SphereGeometry(0.55, 18, 10, 0, TAU, 0, PI / 2); g.scale(1.1, 0.42, 0.8);
      var p = g.attributes.position, r = rng(9); for (var i = 0; i < p.count; i++) { var k = 0.9 + r() * 0.2; p.setXYZ(i, p.getX(i) * k, p.getY(i) * (0.85 + r() * 0.3), p.getZ(i) * k); }
      g.computeVertexNormals();
      var m = new T.Mesh(g, new T.MeshStandardMaterial({ color: '#F4F8FC', roughness: 0.95 })); m.castShadow = true;
      var o = new T.Group(); o.add(m); return o;
    }
    // the ice resurfacer: tank, cab and driver, conditioner behind
    function resurfacer() {
      var g = new T.Group(), body = new T.MeshPhysicalMaterial({ color: '#E8ECF1', roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1 }), blue = new T.MeshPhysicalMaterial({ color: '#1C63D8', roughness: 0.35, clearcoat: 0.8 }), dark = new T.MeshStandardMaterial({ color: '#1A1C21', roughness: 0.6 });
      g.add(new T.Mesh(new T.BoxGeometry(2.1, 1.25, 3.4).translate(0, 0.95, -0.2), body));
      g.add(new T.Mesh(new T.BoxGeometry(2.14, 0.3, 3.44).translate(0, 0.42, -0.2), blue));
      g.add(new T.Mesh(new T.BoxGeometry(2.0, 0.8, 1.2).translate(0, 1.95, -0.6), body));
      g.add(new T.Mesh(new T.BoxGeometry(1.2, 0.08, 1.0).translate(0, 1.62, 1.0), dark));
      var seat = new T.Mesh(new T.BoxGeometry(0.5, 0.5, 0.5).translate(0.4, 1.85, 0.9), dark); g.add(seat);
      var driver = new T.Group(), jacket = new T.MeshStandardMaterial({ color: '#1C63D8', roughness: 0.8 }), skin = new T.MeshStandardMaterial({ color: '#C99A7A', roughness: 0.6 });
      driver.add(new T.Mesh(new T.BoxGeometry(0.46, 0.6, 0.3).translate(0, 0.3, 0), jacket), new T.Mesh(new T.SphereGeometry(0.12, 12, 8).translate(0, 0.74, 0), skin), new T.Mesh(new T.SphereGeometry(0.125, 12, 6, 0, TAU, 0, PI / 2).translate(0, 0.76, 0), dark));
      driver.position.set(0.4, 2.1, 0.9); g.add(driver);
      g.add(new T.Mesh(new T.BoxGeometry(2.3, 0.35, 0.5).translate(0, 0.25, -2.1), dark));
      [[-0.95, 0.9], [0.95, 0.9], [-0.95, -1.3], [0.95, -1.3]].forEach(function (w) { var t = new T.Mesh(new T.CylinderGeometry(0.34, 0.34, 0.26, 18).rotateZ(PI / 2).translate(w[0], 0.34, w[1]), dark); g.add(t); });
      var beacon = new T.Mesh(new T.CylinderGeometry(0.09, 0.09, 0.14, 12).translate(0, 2.42, -0.6), new T.MeshStandardMaterial({ color: '#3A2400', emissive: '#FFA800', emissiveIntensity: 8 })); g.add(beacon);
      W.beacons = (W.beacons || []).concat([beacon]);
      g.traverse(function (m) { if (m.isMesh) m.castShadow = true; });
      g.rotation.y = PI / 2;
      var o = new T.Group(); o.add(g); return o;
    }
    // stray blocks and snow in the lanes, loose pads, and the resurfacer
    // crossing the back straight, wiping the ice
    [[0.16, -2.2, blocks], [0.27, 2.6, pad], [0.36, 0.4, snow], [0.43, -3.4, blocks], [0.52, 3.2, snow], [0.58, -1.2, pad], [0.66, 0, 'rs'], [0.75, 2.4, blocks], [0.83, -2.8, snow], [0.91, 1.6, pad]].forEach(function (s) {
      if (s[2] === 'rs') list.push({ at: s[0], x: s[1], object: resurfacer(), move: { amplitude: 2.6, period: 9 } });
      else list.push({ at: s[0], x: s[1], object: s[2]() });
    });
    return list;
  }

  /* ------------------------------------------------------------ update -- */
  function update(ctx, t, dt) {
    if (W.crowdU) W.crowdU.uTime.value = t;
    if (W.led) W.led.offset.x = (t * 0.018) % 1;
    // the rail camera keeps abreast of the chase camera down the home straight
    if (W.dolly) {
      var c = ctx.camera.position, want = clamp(c.x + 4, -HS - 2, HS + 2);
      if (c.z > 0) W.dolly.position.x += (want - W.dolly.position.x) * Math.min(1, dt * 3);
      W.dollyHead.rotation.y = Math.atan2(c.x - W.dolly.position.x, c.z - W.dolly.position.z) + PI;
    }
    if (W.beacons) W.beacons.forEach(function (b) { b.material.emissiveIntensity = 3 + 7 * Math.max(0, Math.sin(t * 9)); });
    // the warm-up skaters lap the rink anticlockwise at an easy pace
    if (W.warm) W.warm.forEach(function (w) {
      var sp = 6.5, A = 23, B = 8.5, per2 = 2 * PI * Math.sqrt((A * A + B * B) / 2);
      w.u = (w.u + sp * dt / per2) % 1;
      var a = w.u * TAU, x = Math.cos(a) * A, z = -Math.sin(a) * B, dx = -Math.sin(a) * A, dz = -Math.cos(a) * B;
      w.holder.position.set(x, 0, z); w.holder.rotation.set(0, Math.atan2(dx, dz), 0); w.holder.updateMatrixWorld(true);
      if (w.s.animate) w.s.animate(t, dt, { speed: sp, lateral: 0, crashed: false, paused: false });
    });
  }

  /* ----------------------------------------------------------- ambient -- */
  // the hall: a crowd's roar that swells and settles, a horn now and then,
  // and the scrape and hiss of blades on hard ice
  function ambient(ctx) {
    var ac = ctx.audio.context, out = ctx.audio.destination;
    var len = ac.sampleRate * 3, buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0), b0 = 0, b1 = 0, b2 = 0;
    for (var i = 0; i < len; i++) { var wn = Math.random() * 2 - 1; b0 = 0.997 * b0 + wn * 0.029; b1 = 0.985 * b1 + wn * 0.032; b2 = 0.95 * b2 + wn * 0.048; d[i] = (b0 + b1 + b2) * 0.3; }
    var src = ac.createBufferSource(); src.buffer = buf; src.loop = true;
    var bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.5;
    var g = ac.createGain(); g.gain.value = 0.16;
    var lfo = ac.createOscillator(), lg = ac.createGain(); lfo.frequency.value = 0.07; lg.gain.value = 0.06; lfo.connect(lg); lg.connect(g.gain); lfo.start();
    src.connect(bp); bp.connect(g); g.connect(out); src.start();
    // blades: short hiss bursts, left and right, at a skater's stroke rate
    var hiss = ac.createBufferSource(); hiss.buffer = buf; hiss.loop = true;
    var hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3800;
    var hg = ac.createGain(); hg.gain.value = 0;
    var pan = ac.createStereoPanner ? ac.createStereoPanner() : null;
    hiss.connect(hp); hp.connect(hg); if (pan) { hg.connect(pan); pan.connect(out); } else hg.connect(out); hiss.start();
    var t0 = ac.currentTime + 0.2;
    for (var k = 0; k < 1200; k++) {
      var tt = t0 + k * 0.52;
      hg.gain.setValueAtTime(0, tt); hg.gain.linearRampToValueAtTime(0.09, tt + 0.08); hg.gain.exponentialRampToValueAtTime(0.002, tt + 0.42);
      if (pan) pan.pan.setValueAtTime(k % 2 ? 0.35 : -0.35, tt);
    }
  }
})();
