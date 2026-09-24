// Road Race 2028
//
// A first-party GameMog world: endless laps of an Olympic road race circuit
// through a hill town on the coast, on runtime v1 with cinematic graphics and
// the cyclist kit. Not an oval: the start on the main street, the harbour
// front along the sea, a hairpin up the hill, the ridge road with the whole
// bay below, and the descent through S-bends back into town, bending both
// ways and climbing eighteen metres a lap. Stone walls, umbrella pines and
// cypresses, terracotta roofs, crowds on the barriers and bunting across the
// street; road cyclists on deep-section wheels. The rules are the runtime's;
// the circuit is this file's.

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
  // The sea lies to the south (+z); the town climbs the hill to the north.
  var TW = 9, HW = TW / 2, SEA_Z = 46;
  var SUN = (function () { var v = [-0.55, 0.42, 0.72], l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; })();
  // x, height, z: the main street, the harbour, the hairpin, the ridge, the descent
  var ROUTE = [
    [-120, 2.2, 10], [-80, 2.2, 12], [-40, 2.0, 10], [0, 1.9, 14], [40, 1.8, 22], [80, 1.8, 33], [115, 2.0, 37], [145, 2.6, 30],
    [165, 3.6, 12], [170, 5.0, -10], [158, 7.2, -30], [135, 9.6, -38], [100, 12.6, -45], [65, 15.4, -58], [30, 17.6, -72], [0, 18.8, -80],
    [-35, 19.0, -84], [-70, 17.4, -80], [-100, 13.6, -70], [-125, 9.6, -55], [-150, 6.4, -40], [-160, 4.2, -20], [-150, 3.0, -5],
  ];
  var TRACK_POINTS = ROUTE.map(function (p) { return [p[0], p[1], p[2]]; });

  // the land: a hillside rising from the harbour to a ridge, a sea bed below
  function hillAt(x, z) {
    var s = SEA_Z - z; // metres inland from the harbour wall
    var h = s < 0 ? -2 + s * 0.08 : 1.2 + s * 0.12 + smooth(40, 140, s) * 16;
    h += smooth(20, 90, s) * (fbm(x * 0.012 + 4, z * 0.012) - 0.45) * 14;
    h += smooth(120, 260, s) * 45 * (0.7 + 0.5 * noise(x * 0.006, 3.3));
    return h;
  }

  var W = { time: { value: 0 } };

  /* ---------------------------------------------------------- the cast -- */
  var PLAYER = { gender: 'male', name: 'PARKER', code: 'USA', top: '#15264F', trim: '#D22B3A', shorts: '#111111', shoes: '#FFFFFF', skin: 'caucasian', tint: '#F4E6DC', hair: 'none', height: 1.82, muscle: 0.6, frame: '#15264F', btrim: '#D22B3A', helmet: '#FFFFFF', pattern: 'band', number: '51' };
  var RIVALS = [
    { gender: 'male', name: 'DUBOIS', code: 'BEL', top: '#111111', trim: '#FFD83A', shorts: '#111111', shoes: '#FFFFFF', skin: 'caucasian', tint: '#F4E6DC', height: 1.71, muscle: 0.55, frame: '#111111', btrim: '#FFD83A', helmet: '#FFD83A', pattern: 'split' },
    { gender: 'female', name: 'BAKKER', code: 'NED', top: '#F07D1A', trim: '#FFFFFF', shorts: '#111111', shoes: '#FFFFFF', skin: 'caucasian', tint: '#F4E6DC', height: 1.72, muscle: 0.55, frame: '#F07D1A', btrim: '#111111', helmet: '#FFFFFF', pattern: 'plain' },
    { gender: 'male', name: 'KOVAC', code: 'SLO', top: '#FFFFFF', trim: '#0055A4', shorts: '#0055A4', shoes: '#FFFFFF', skin: 'caucasian', tint: '#EAD0B8', height: 1.76, muscle: 0.58, frame: '#FFFFFF', btrim: '#0055A4', helmet: '#0055A4', pattern: 'band' },
    { gender: 'female', name: 'PEETERS', code: 'BEL', top: '#FFD83A', trim: '#111111', shorts: '#111111', shoes: '#111111', skin: 'caucasian', tint: '#F4E6DC', height: 1.7, muscle: 0.6, frame: '#111111', btrim: '#E4002B', helmet: '#111111', pattern: 'sash' },
    { gender: 'male', name: 'TESFAYE', code: 'ERI', top: '#1E9E4A', trim: '#E4002B', shorts: '#1B4FA8', shoes: '#FFFFFF', skin: 'african', tint: '#FFFFFF', height: 1.73, muscle: 0.6, frame: '#1E9E4A', btrim: '#FFFFFF', helmet: '#FFFFFF', pattern: 'yoke' },
    { gender: 'female', name: 'FERRARA', code: 'ITA', top: '#2E6FC4', trim: '#FFFFFF', shorts: '#15264F', shoes: '#FFFFFF', skin: 'caucasian', tint: '#EAD0B8', height: 1.7, muscle: 0.52, frame: '#2E6FC4', btrim: '#FFFFFF', helmet: '#FFFFFF', pattern: 'band' },
    { gender: 'male', name: 'VAN AERT', code: 'BEL', top: '#E4002B', trim: '#FFD83A', shorts: '#111111', shoes: '#FFFFFF', skin: 'caucasian', tint: '#F4E6DC', height: 1.9, muscle: 0.72, frame: '#E4002B', btrim: '#111111', helmet: '#E4002B', pattern: 'split' },
    { gender: 'female', name: 'NIEWIADOMA', code: 'POL', top: '#FFFFFF', trim: '#DC143C', shorts: '#DC143C', shoes: '#FFFFFF', skin: 'caucasian', tint: '#F4E6DC', height: 1.6, muscle: 0.5, frame: '#DC143C', btrim: '#FFFFFF', helmet: '#DC143C', pattern: 'band' },
    { gender: 'male', name: 'ALAPHILIPPE', code: 'FRA', top: '#1D3F9E', trim: '#E4002B', shorts: '#1D3F9E', shoes: '#FFFFFF', skin: 'caucasian', tint: '#EAD0B8', height: 1.73, muscle: 0.58, frame: '#1D3F9E', btrim: '#FFFFFF', helmet: '#FFFFFF', pattern: 'sash' },
    { gender: 'female', name: 'CHABBEY', code: 'SUI', top: '#E4002B', trim: '#FFFFFF', shorts: '#111111', shoes: '#FFFFFF', skin: 'caucasian', tint: '#F4E6DC', height: 1.68, muscle: 0.55, frame: '#E4002B', btrim: '#FFFFFF', helmet: '#FFFFFF', pattern: 'band' },
    { gender: 'male', name: 'CARAPAZ', code: 'ECU', top: '#FFD100', trim: '#0072CE', shorts: '#0072CE', shoes: '#EF3340', skin: 'caucasian', tint: '#C49A7C', height: 1.7, muscle: 0.55, frame: '#0072CE', btrim: '#FFD100', helmet: '#FFD100', pattern: 'yoke' },
    { gender: 'female', name: 'MOOLMAN', code: 'RSA', top: '#007749', trim: '#FFB81C', shorts: '#111111', shoes: '#FFFFFF', skin: 'african', tint: '#FFFFFF', height: 1.67, muscle: 0.55, frame: '#007749', btrim: '#FFB81C', helmet: '#FFB81C', pattern: 'band' },
  ];
  RIVALS.forEach(function (r, i) { r.number = String(3 + i * 11); r.label = r.name.charAt(0) + r.name.slice(1).toLowerCase().replace(/ [a-z]/, function (c) { return c.toUpperCase(); }) + ' (' + r.code + ')'; });
  PLAYER.label = 'Parker (USA)';

  GameMog.world({
    assets: ['human-athlete-male', 'human-athlete-female'],
    theme: { sky: '#86B8E0', fog: '#CFDDE6', ink: '#1B1410', panel: '#FFF8EC', accent: '#D8432B', font: 'Saira Condensed' },
    graphics: {
      exposure: 1.05,
      environment: true,
      bloom: { strength: 0.35, threshold: 1.25, radius: 0.7 },
      grade: { contrast: 1.06, saturation: 1.1, warmth: 0.12, vignette: 0.26, grain: 0.012 },
      shadows: { extent: 36, mapSize: 2048 },
    },
    camera: { distance: 6.2, height: 2.5, fov: 60 },
    track: { width: TW, points: TRACK_POINTS },
    build: build,
    player: function (ctx) { return rider(ctx, PLAYER, 0); },
    rival: function (ctx, k) {
      var base = RIVALS[(k - 1) % RIVALS.length], round = Math.floor((k - 1) / RIVALS.length);
      var r = rider(ctx, Object.assign({}, base, { muscle: Math.min(1, base.muscle + round * 0.06) }), k);
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
      build: { muscle: kit.muscle, lean: 0.75 },
      outfit: { top: kit.top, trim: kit.trim, shorts: kit.shorts, shoes: kit.shoes, pattern: kit.pattern, bib: { name: kit.name, number: kit.number }, glow: k >= 9 ? 2.2 : 0 },
      bike: { kind: 'road', frame: kit.frame, trim: kit.btrim, rear: 'deep', front: 'deep' },
      helmet: { kind: 'road', color: kit.helmet, trim: kit.trim, visor: false },
      name: k === 0 ? PLAYER.label : kit.label, color: kit.top,
    }) : null;
    return r || fallbackRider(ctx, kit, k);
  }
  function fallbackRider(ctx, kit, k) {
    var T = ctx.THREE, o = new T.Group(), dark = new T.MeshStandardMaterial({ color: '#1A1B1E', roughness: 0.4 });
    var frame = new T.MeshStandardMaterial({ color: kit.frame, roughness: 0.3, metalness: 0.3 });
    var wheels = [-0.4, 0.58].map(function (z) { var w = new T.Mesh(new T.TorusGeometry(0.32, 0.03, 8, 24), dark); w.rotation.y = PI / 2; w.position.set(0, 0.34, z); o.add(w); return w; });
    var f = new T.Mesh(new T.BoxGeometry(0.05, 0.05, 0.9), frame); f.position.set(0, 0.7, 0.1); f.rotation.x = -0.15; o.add(f);
    var body = new T.Mesh(new T.CapsuleGeometry(0.18, 0.5, 4, 10), new T.MeshStandardMaterial({ color: kit.top, roughness: 0.5 }));
    body.position.set(0, 1.2, 0.05); body.rotation.x = 0.95; o.add(body);
    var head = new T.Mesh(new T.SphereGeometry(0.13, 12, 10), new T.MeshStandardMaterial({ color: kit.helmet, roughness: 0.3 })); head.position.set(0, 1.42, 0.4); o.add(head);
    o.traverse(function (m) { if (m.isMesh) m.castShadow = true; });
    return { object: o, name: k === 0 ? PLAYER.label : kit.label, color: kit.top, radius: 0.45, animate: function (t, dt, s) { wheels.forEach(function (w) { w.rotation.x += (s.speed || 0) / 0.34 * dt; }); } };
  }

  // merge geometries (same attributes) into one; paint with vertex colours
  function merge(THREE, list) {
    var geoms = list.map(function (g) { return g.index ? g.toNonIndexed() : g; });
    var names = Object.keys(geoms[0].attributes), out = new THREE.BufferGeometry();
    names.forEach(function (n) {
      var size = geoms[0].attributes[n].itemSize, total = 0;
      geoms.forEach(function (g) { total += g.attributes.position.count; });
      var arr = new Float32Array(total * size), o = 0;
      geoms.forEach(function (g) { var a = g.attributes[n]; if (a) arr.set(a.array.subarray(0, a.count * size), o); o += g.attributes.position.count * size; });
      out.setAttribute(n, new THREE.BufferAttribute(arr, size));
    });
    return out;
  }
  function vc(THREE, g, hex) {
    g = g.index ? g.toNonIndexed() : g;
    var c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (var i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return g;
  }

  /* ------------------------------------------------------------ build -- */
  function build(ctx) {
    var THREE = ctx.THREE, scene = ctx.scene, low = ctx.quality === 'low';
    var sun = new THREE.DirectionalLight('#FFE3BA', 3.4);
    sun.position.set(SUN[0] * 200, SUN[1] * 200, SUN[2] * 200); sun.castShadow = true;
    scene.add(sun, new THREE.HemisphereLight('#B9D6F0', '#B9936A', 0.9));
    ctx.sky({ top: '#3A74BE', horizon: '#E8E2D2', bottom: '#6F8FA6', sun: SUN, sunColor: '#FFE6BC', sunSize: 1.8, glow: 1.3, haze: 0.3, sunPower: 16, curve: 0.5 });
    scene.fog = new THREE.Fog('#CFDDE6', 220, 1600);

    terrain(ctx, low);
    sea(ctx);
    road(ctx);
    town(ctx, low);
    trees(ctx, low);
    maquis(ctx, low);
    roadside(ctx, low);
    gantry(ctx);
  }

  function terrain(ctx, low) {
    var THREE = ctx.THREE, trk = ctx.track;
    var X0 = -420, X1 = 420, Z0 = -380, Z1 = 140, step = low ? 5 : 2.5;
    var nx = Math.round((X1 - X0) / step), nz = Math.round((Z1 - Z0) / step);
    var geo = new THREE.PlaneGeometry(X1 - X0, Z1 - Z0, nx, nz); geo.rotateX(-PI / 2); geo.translate((X0 + X1) / 2, 0, (Z0 + Z1) / 2);
    var pos = geo.attributes.position, n = pos.count;
    function nearLoop(x, z) {
      var best = 1e9;
      for (var i = 0; i < ROUTE.length; i++) {
        var a = ROUTE[i], b = ROUTE[(i + 1) % ROUTE.length], abx = b[0] - a[0], abz = b[2] - a[2];
        var t = clamp(((x - a[0]) * abx + (z - a[2]) * abz) / (abx * abx + abz * abz), 0, 1), dx = x - (a[0] + abx * t), dz = z - (a[2] + abz * t);
        best = Math.min(best, dx * dx + dz * dz);
      }
      return Math.sqrt(best);
    }
    var col = new Float32Array(n * 3), c = new THREE.Color();
    var GRASS = new THREE.Color('#8C9A56'), DRY = new THREE.Color('#B8A06A'), ROCK = new THREE.Color('#9A8C78'), SCRUB = new THREE.Color('#5E6E3A'), SAND = new THREE.Color('#D9C39A');
    for (var i = 0; i < n; i++) {
      var x = pos.getX(i), z = pos.getZ(i), h = hillAt(x, z);
      if (nearLoop(x, z) < HW + 30) {
        var nr = trk.nearest(x, z), lat = Math.abs(nr.lateral);
        // the road cut into the hillside: the ground sits just under the road
        // (the terrain's grid must never poke through it), blending out over ten metres
        var dd = Math.min(lat, nr.distance), k = 1 - smooth(HW + 1.2, HW + 11, dd);
        h = lerp(h, nr.y - (dd < HW + 1 ? 0.4 : 0.12), k);
      }
      pos.setY(i, h);
      var s = SEA_Z - z, nz1 = noise(x * 0.07, z * 0.07);
      c.copy(DRY).lerp(GRASS, smooth(0.3, 0.7, fbm(x * 0.02, z * 0.02))).lerp(SCRUB, smooth(25, 60, h) * 0.6).lerp(ROCK, smooth(0.55, 0.8, nz1) * 0.3);
      if (s < 4) c.lerp(SAND, 1 - smooth(-2, 4, s));
      c.multiplyScalar(0.85 + nz1 * 0.25);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    geo.computeVertexNormals();
    // where the road is cut into the hill the bank is steep: bare rock in
    // strata, with scrub hanging on in the ledges
    var nrm = geo.attributes.normal, STRATA = new THREE.Color('#8E7B63'), LEDGE = new THREE.Color('#6B7440');
    for (i = 0; i < n; i++) {
      var st = 1 - smooth(0.62, 0.9, nrm.getY(i));
      if (st <= 0) continue;
      var y0 = pos.getY(i), x0 = pos.getX(i), z0 = pos.getZ(i), band = 0.5 + 0.5 * Math.sin(y0 * 2.3 + noise(x0 * 0.05, z0 * 0.05) * 4);
      c.setRGB(col[i * 3], col[i * 3 + 1], col[i * 3 + 2]).lerp(STRATA, st * 0.85).multiplyScalar(0.8 + band * 0.3);
      if (noise(x0 * 0.3, z0 * 0.3 + y0 * 0.2) > 0.62) c.lerp(LEDGE, st * 0.7);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    // a fine grain of grit and dry grass, so the ground doesn't read as painted
    var grain = ctx.textures.canvas(256, 256, function (g, w, h) {
      g.fillStyle = '#FAFAFA'; g.fillRect(0, 0, w, h);
      var r = rng(33);
      for (var k = 0; k < 90; k++) { var v = 205 + r() * 50 | 0, rad = 8 + r() * 26; g.fillStyle = 'rgba(' + v + ',' + v + ',' + v + ',0.35)'; g.beginPath(); g.ellipse(r() * w, r() * h, rad, rad * 0.7, r() * PI, 0, TAU); g.fill(); }
      for (k = 0; k < 5200; k++) { v = 185 + r() * 70 | 0; g.fillStyle = 'rgba(' + v + ',' + v + ',' + v + ',0.6)'; g.fillRect(r() * w, r() * h, 1 + r() * 2.5, 1 + r() * 2.5); }
    });
    grain.wrapS = grain.wrapT = THREE.RepeatWrapping; grain.repeat.set((X1 - X0) / 7, (Z1 - Z0) / 7);
    var mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, map: grain, roughness: 0.95 }));
    mesh.receiveShadow = true; ctx.scene.add(mesh);
    W.height = function (x, z) {
      var fx = (x - X0) / step, fz = (z - Z0) / step, ix = clamp(Math.floor(fx), 0, nx - 1), iz = clamp(Math.floor(fz), 0, nz - 1), tx = fx - ix, tz = fz - iz;
      function H(a, b) { return pos.getY(b * (nx + 1) + a); }
      return lerp(lerp(H(ix, iz), H(ix + 1, iz), tx), lerp(H(ix, iz + 1), H(ix + 1, iz + 1), tx), tz);
    };
  }

  function sea(ctx) {
    var THREE = ctx.THREE;
    var ripples = ctx.textures.normal(256, 256, function (g, w, h) {
      var r = rng(31);
      for (var k = 0; k < 900; k++) { var x = r() * w, y = r() * h, rad = 3 + r() * 14, gr = g.createRadialGradient(x, y, 0, x, y, rad), v = r() > 0.5 ? 255 : 0; gr.addColorStop(0, 'rgba(' + v + ',' + v + ',' + v + ',0.35)'); gr.addColorStop(1, 'rgba(128,128,128,0)'); g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
    }, 3);
    ripples.repeat.set(160, 90);
    W.ripples = ripples;
    var m = new THREE.Mesh(new THREE.PlaneGeometry(4000, 1800).rotateX(-PI / 2), new THREE.MeshStandardMaterial({ color: '#1C5E8C', roughness: 0.07, metalness: 0, normalMap: ripples, envMapIntensity: 1.2 }));
    m.material.normalScale.set(0.4, 0.4); m.position.set(0, 0.05, SEA_Z + 880); m.receiveShadow = true; ctx.scene.add(m);
    // islands on the horizon
    var R = rng(5);
    for (var i = 0; i < 4; i++) {
      var g = new THREE.SphereGeometry(1, 16, 8, 0, TAU, 0, PI / 2); g.scale(60 + R() * 90, 18 + R() * 30, 30 + R() * 40);
      var isl = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: '#7D8C8F', roughness: 1 })); isl.position.set(-500 + i * 330 + R() * 100, 0, 900 + R() * 300); ctx.scene.add(isl);
    }
    // boats in the harbour, riding the swell in update()
    W.boats = [];
    for (i = 0; i < 7; i++) {
      var b = new THREE.Group(), hull = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.7, 6).translate(0, 0.2, 0), new THREE.MeshStandardMaterial({ color: ['#F4F1EA', '#2F6E8C', '#D8432B', '#F4F1EA'][i % 4], roughness: 0.5 }));
      var cab = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.9, 1.8).translate(0, 1, -0.4), new THREE.MeshStandardMaterial({ color: '#E8E4DA', roughness: 0.6 }));
      var mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 7, 6).translate(0, 3.5, 0.5), new THREE.MeshStandardMaterial({ color: '#D8D2C4' }));
      b.add(hull, cab); if (i % 2) b.add(mast);
      b.position.set(-40 + i * 26 + R() * 8, 0, SEA_Z + 18 + R() * 30); b.rotation.y = R() * 0.6 - 0.3; ctx.scene.add(b); W.boats.push({ o: b, ph: R() * TAU });
    }
  }

  function road(ctx) {
    var THREE = ctx.THREE;
    var asphalt = ctx.textures.canvas(256, 256, function (g, w, h) {
      var r = rng(8); g.fillStyle = '#4A4B4D'; g.fillRect(0, 0, w, h);
      for (var k = 0; k < 7000; k++) { var v = 50 + r() * 60 | 0; g.fillStyle = 'rgba(' + v + ',' + v + ',' + (v + 2) + ',0.6)'; g.fillRect(r() * w, r() * h, 1.5, 1.5); }
      // the darker line worn by tyres down the middle of each lane
      g.fillStyle = 'rgba(20,20,22,0.12)'; g.fillRect(w * 0.18, 0, w * 0.14, h); g.fillRect(w * 0.68, 0, w * 0.14, h);
    });
    var roadMat = new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.86 });
    ctx.scene.add(ctx.track.ribbon({ width: TW + 0.6, material: roadMat, tile: 8, y: 0.03 }));
    // pavements of pale stone beyond the kerbs, sloping down to the ground
    ctx.scene.add(ctx.track.ribbon({ width: 1.6, offset: -HW - 1.3, y: 0.02, material: new THREE.MeshStandardMaterial({ color: '#BDB3A1', roughness: 0.9 }) }));
    ctx.scene.add(ctx.track.ribbon({ width: 1.6, offset: HW + 1.3, y: 0.02, material: new THREE.MeshStandardMaterial({ color: '#BDB3A1', roughness: 0.9 }) }));
    var white = new THREE.MeshStandardMaterial({ color: '#EDEDE8', roughness: 0.6 });
    ctx.scene.add(ctx.track.ribbon({ width: 0.15, offset: -HW + 0.3, y: 0.045, material: white }));
    ctx.scene.add(ctx.track.ribbon({ width: 0.15, offset: HW - 0.3, y: 0.045, material: white }));
    var dash = ctx.textures.canvas(16, 256, function (g, w, h) { g.clearRect(0, 0, w, h); g.fillStyle = '#EDEDE8'; g.fillRect(0, 0, w, h * 0.55); });
    ctx.scene.add(ctx.track.ribbon({ width: 0.14, offset: 0, y: 0.045, tile: 6, material: new THREE.MeshStandardMaterial({ map: dash, alphaTest: 0.5, roughness: 0.6 }) }));
    // kerbs of pale stone at both edges
    ctx.scene.add(ctx.track.ribbon({ width: 0.35, offset: -HW - 0.45, y: 0.06, material: new THREE.MeshStandardMaterial({ color: '#CFC6B4', roughness: 0.8 }) }));
    ctx.scene.add(ctx.track.ribbon({ width: 0.35, offset: HW + 0.45, y: 0.06, material: new THREE.MeshStandardMaterial({ color: '#CFC6B4', roughness: 0.8 }) }));
    // names painted on the climb, as fans do
    var names = ['ALLEZ', 'VAI', 'GO USA', 'HUP', 'VAMOS', 'ALLEZ'];
    var L = ctx.track.length;
    names.forEach(function (nm, i) {
      var tex = ctx.textures.canvas(512, 128, function (g, w, h) { g.clearRect(0, 0, w, h); g.fillStyle = '#F4F1EA'; g.font = '800 96px "Saira Condensed", "Arial Narrow", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(nm, w / 2, h / 2 + 4); });
      var d = L * (0.32 + i * 0.035), F = ctx.track.frameAt(d);
      var m = new THREE.Mesh(new THREE.PlaneGeometry(5, 1.25), new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 0.8, opacity: 0.85 }));
      m.position.copy(F.pos).addScaledVector(F.up, 0.035).addScaledVector(F.right, (i % 2 ? 1.4 : -1.4));
      m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(F.right, F.tan, F.up)); m.rotateZ(PI);
      m.userData.gmTrack = true; ctx.scene.add(m);
    });
  }

  // a hill town: stucco houses in warm colours, terracotta roofs, a church
  function town(ctx, low) {
    var THREE = ctx.THREE, R = rng(19), scene = ctx.scene;
    var facade = ctx.textures.canvas(256, 256, function (g, w, h) {
      g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, w, h);
      var r = rng(3);
      for (var k = 0; k < 1500; k++) { var v = 225 + r() * 30 | 0; g.fillStyle = 'rgba(' + v + ',' + v + ',' + v + ',0.5)'; g.fillRect(r() * w, r() * h, 3, 3); }
      // two windows a floor, with shutters
      [[0.18, 0.2], [0.62, 0.2], [0.18, 0.62], [0.62, 0.62]].forEach(function (p) {
        var x = p[0] * w, y = p[1] * h, ww = w * 0.2, hh = h * 0.24;
        g.fillStyle = '#3B2F28'; g.fillRect(x, y, ww, hh);
        g.fillStyle = r() > 0.5 ? '#3E6B52' : '#2F5E86'; g.fillRect(x - ww * 0.42, y, ww * 0.4, hh); g.fillRect(x + ww * 1.02, y, ww * 0.4, hh);
        g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x, y + hh, ww, 4);
      });
    });
    var tiles = ctx.textures.canvas(128, 128, function (g, w, h) {
      g.fillStyle = '#B5583A'; g.fillRect(0, 0, w, h);
      for (var y = 0; y < h; y += 10) { g.fillStyle = 'rgba(80,30,18,0.4)'; g.fillRect(0, y, w, 2); for (var x = (y / 10 % 2) * 8; x < w; x += 16) { g.fillStyle = 'rgba(210,120,80,0.35)'; g.fillRect(x, y + 2, 10, 7); } }
    });
    var walls = [], roofs = [];
    var colours = ['#F2E8D5', '#EBD9B4', '#E7C48E', '#F0D2C0', '#DCE4E8', '#F4F1EA', '#E4B98A', '#E9DCC5'];
    function house(x, z, yaw, w, d, floors) {
      // stepped into the slope: the walls run down to the lowest corner, so no
      // house stands on air on the downhill side
      var lo = 1e9, hi = -1e9, cy = Math.cos(yaw), sy = Math.sin(yaw);
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (q) {
        var ox = q[0] * w / 2, oz = q[1] * d / 2, h0 = W.height(x + ox * cy + oz * sy, z - ox * sy + oz * cy);
        lo = Math.min(lo, h0); hi = Math.max(hi, h0);
      });
      var y = lo - 0.3, hgt = floors * 3.1 + 0.4 + (hi - lo);
      var g = new THREE.BoxGeometry(w, hgt, d).translate(0, hgt / 2, 0);
      // texture: one window bay per 3 m of wall and per floor
      var uv = g.attributes.uv, p = g.attributes.position, nrm = g.attributes.normal;
      for (var i = 0; i < uv.count; i++) {
        var ax = Math.abs(nrm.getX(i)) > 0.5 ? p.getZ(i) : p.getX(i);
        uv.setXY(i, (ax + 50) / 3.2, (p.getY(i)) / 3.1);
      }
      g.rotateY(yaw); g.translate(x, y, z);
      walls.push(vc(THREE, g, colours[(R() * colours.length) | 0]));
      var r = new THREE.CylinderGeometry(0.01, (Math.max(w, d) + 0.8) / Math.SQRT2, 1.8, 4, 1, false, PI / 4);
      r.scale((w + 0.8) / Math.max(w, d), 1, (d + 0.8) / Math.max(w, d)); r.rotateY(yaw); r.translate(x, y + hgt + 0.9, z);
      var rn = r.toNonIndexed(); var ruv = rn.attributes.uv, rp = rn.attributes.position;
      for (i = 0; i < ruv.count; i++) ruv.setXY(i, rp.getX(i) / 2, rp.getZ(i) / 2 + rp.getY(i) / 2);
      rn.computeVertexNormals(); roofs.push(rn);
    }
    // rows along the main street and the harbour, and houses stepped up the hill
    var placed = 0, guard = 0;
    while (placed < (low ? 70 : 150) && guard++ < 6000) {
      var x = -260 + R() * 520, z = -150 + R() * 190;
      if (SEA_Z - z < 8) continue;
      var nr = ctx.track.nearest(x, z);
      if (nr.distance < HW + 7 || nr.distance > 70) continue;
      // face the road
      var F = ctx.track.frameAt(nr.d), yaw = Math.atan2(F.tan.x, F.tan.z);
      var w = 6 + R() * 5, dd = 6 + R() * 4, fl = 2 + (R() * 2.2 | 0);
      if (!ctx.track.clear(x, z, Math.max(w, dd) * 0.75 + 2)) continue;
      house(x, z, yaw, w, dd, fl); placed++;
    }
    var wallMat = new THREE.MeshStandardMaterial({ map: facade, vertexColors: true, roughness: 0.88 });
    var wm = new THREE.Mesh(merge(THREE, walls), wallMat); wm.castShadow = true; wm.receiveShadow = true; scene.add(wm);
    var rm = new THREE.Mesh(merge(THREE, roofs), new THREE.MeshStandardMaterial({ map: tiles, roughness: 0.8 })); rm.castShadow = true; scene.add(rm);
    // the church on the square below the ridge: nave and bell tower
    var cx = -60, cz = -30, cy = W.height(cx, cz) - 0.3;
    if (ctx.track.clear(cx, cz, 14)) {
      var stone = new THREE.MeshStandardMaterial({ color: '#E3D6BC', roughness: 0.85 });
      var nave = new THREE.Mesh(new THREE.BoxGeometry(12, 11, 22).translate(0, 5.5, 0), stone); nave.position.set(cx, cy, cz); nave.castShadow = true;
      var tower = new THREE.Mesh(new THREE.BoxGeometry(4.6, 26, 4.6).translate(0, 13, 0), stone); tower.position.set(cx + 8, cy, cz - 8); tower.castShadow = true;
      var cap = new THREE.Mesh(new THREE.ConeGeometry(3.6, 5, 4).translate(0, 28.5, 0), new THREE.MeshStandardMaterial({ map: tiles, roughness: 0.8 })); cap.position.copy(tower.position); cap.rotation.y = PI / 4;
      var nroof = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 9.2, 3, 4, 1, false, PI / 4).scale(0.72, 1, 1.35).translate(0, 12.5, 0), new THREE.MeshStandardMaterial({ map: tiles, roughness: 0.8 })); nroof.position.set(cx, cy, cz);
      scene.add(nave, tower, cap, nroof);
    }
  }

  // the maquis: scrub and rock outcrops on the banks of the climb, the ridge
  // and the descent, thickest where the road is cut into the hill
  function maquis(ctx, low) {
    var THREE = ctx.THREE, R = rng(88), L = ctx.track.length, shrubs = [[], [], []], rocks = [];
    for (var d = L * 0.26; d < L * 0.88; d += low ? 3 : 1.4) {
      var F = ctx.track.frameAt(d), rl = Math.hypot(F.right.x, F.right.z), rx = F.right.x / rl, rz = F.right.z / rl;
      for (var sd = -1; sd <= 1; sd += 2) {
        var off = HW + 3 + Math.pow(R(), 1.5) * 26, px = F.pos.x + rx * sd * off, pz = F.pos.z + rz * sd * off;
        if (SEA_Z - pz < 6) continue;
        var h = W.height(px, pz), slope = Math.hypot(W.height(px + 1, pz) - W.height(px - 1, pz), W.height(px, pz + 1) - W.height(px, pz - 1)) / 2;
        if (R() > 0.22 + smooth(0.25, 0.9, slope) * 0.6) continue;
        var rock = R() < 0.25 + smooth(0.5, 1.2, slope) * 0.25, size = rock ? 0.5 + R() * 1.2 : 0.6 + R() * 1.0;
        // clear by the corridor's 1.2 m plus the piece's turned bounding box
        if (!ctx.track.clear(px, pz, 1.6 + size * 2.3)) continue;
        // sunk by the slope, so the downhill side never hangs over the bank
        h -= Math.min(slope, 1.5) * size * 0.6;
        if (rock) rocks.push([px, h, pz, size, R() * TAU, R() - 0.5]);
        else shrubs[(R() * 3) | 0].push([px, h, pz, size, R() * TAU]);
      }
    }
    var bush = new THREE.IcosahedronGeometry(1, 1).scale(1.3, 0.75, 1.1).translate(0, 0.45, 0);
    ['#4F6233', '#5E6E3A', '#3E5230'].forEach(function (col, k) {
      var list = shrubs[k];
      if (!list.length) return;
      var m = ctx.instanced(bush, new THREE.MeshStandardMaterial({ color: col, flatShading: true, roughness: 0.95 }), list.length, function (n, dd) { var p = list[n]; dd.position.set(p[0], p[1] - 0.15, p[2]); dd.scale.setScalar(p[3]); dd.rotation.y = p[4]; });
      m.castShadow = true; m.receiveShadow = true; ctx.scene.add(m);
    });
    var stoneGeo = new THREE.DodecahedronGeometry(1, 0).scale(1.2, 0.7, 1).translate(0, 0.25, 0);
    var rm = ctx.instanced(stoneGeo, new THREE.MeshStandardMaterial({ color: '#A5957C', flatShading: true, roughness: 1 }), rocks.length, function (n, dd) { var p = rocks[n]; dd.position.set(p[0], p[1] - 0.2, p[2]); dd.scale.setScalar(p[3]); dd.rotation.set(p[5] * 0.5, p[4], p[5] * 0.4); });
    rm.castShadow = true; rm.receiveShadow = true; ctx.scene.add(rm);
  }

  // umbrella pines, cypresses and olives, off the road
  function trees(ctx, low) {
    var THREE = ctx.THREE, R = rng(66), scene = ctx.scene, pines = [], cyps = [], olives = [], guard = 0;
    while ((pines.length + cyps.length + olives.length) < (low ? 260 : 620) && guard++ < 40000) {
      var x = -380 + R() * 760, z = -340 + R() * 380;
      if (SEA_Z - z < 6 || !ctx.track.clear(x, z, 9)) continue;
      var y = W.height(x, z), roll = R();
      if (roll < 0.28) pines.push([x, y, z, 0.8 + R() * 0.5, R() * TAU]);
      else if (roll < 0.62) cyps.push([x, y, z, 0.8 + R() * 0.6, R() * TAU]);
      else olives.push([x, y, z, 0.7 + R() * 0.6, R() * TAU]);
    }
    function blob(seed, detail) {
      var g = new THREE.IcosahedronGeometry(1, detail), p = g.attributes.position, v = new THREE.Vector3();
      for (var i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); var n = fbm(v.x * 1.7 + seed, v.z * 1.7 + v.y * 1.3) * 0.5; v.multiplyScalar(0.8 + n); p.setXYZ(i, v.x, v.y, v.z); }
      g.computeVertexNormals(); return g;
    }
    var bark = new THREE.MeshStandardMaterial({ color: '#6B5440', roughness: 0.9 });
    var leafy = ctx.textures.canvas(256, 256, function (g, w, h) { g.fillStyle = '#9A9A9A'; g.fillRect(0, 0, w, h); var r = rng(71); for (var k = 0; k < 2400; k++) { var v = 80 + r() * 175 | 0, rad = 2 + r() * 7; g.fillStyle = 'rgba(' + v + ',' + v + ',' + v + ',0.7)'; g.beginPath(); g.ellipse(r() * w, r() * h, rad, rad * 0.6, r() * PI, 0, TAU); g.fill(); } });
    var leafyN = ctx.textures.normal(256, 256, function (g, w, h) { var r = rng(72); for (var k = 0; k < 1600; k++) { var v = r() * 255 | 0, rad = 2 + r() * 8; g.fillStyle = 'rgba(' + v + ',' + v + ',' + v + ',0.6)'; g.beginPath(); g.arc(r() * w, r() * h, rad, 0, TAU); g.fill(); } }, 4);
    leafy.repeat.set(3, 3); leafyN.repeat.set(3, 3);
    // umbrella pine: a tall bare trunk and a flat, wide crown
    var pineTrunk = new THREE.CylinderGeometry(0.22, 0.34, 9, 7).translate(0, 4.5, 0).rotateZ(0.08);
    var pineCrown = blob(3, 2).scale(5.5, 1.6, 5.5).translate(0.6, 10.2, 0);
    scene.add(ctx.instanced(pineTrunk, bark, pines.length, function (n, d) { var p = pines[n]; d.position.set(p[0], p[1] - 0.2, p[2]); d.scale.setScalar(p[3]); d.rotation.y = p[4]; }));
    var pc = ctx.instanced(pineCrown, new THREE.MeshStandardMaterial({ color: '#4A6A36', map: leafy, normalMap: leafyN, roughness: 0.95 }), pines.length, function (n, d) { var p = pines[n]; d.position.set(p[0], p[1] - 0.2, p[2]); d.scale.setScalar(p[3]); d.rotation.y = p[4]; });
    pc.castShadow = true; scene.add(pc);
    // cypress: a dark flame
    var cyp = new THREE.ConeGeometry(1.3, 11, 10, 4).translate(0, 5.5, 0), cp = cyp.attributes.position;
    for (var i = 0; i < cp.count; i++) { var yy = cp.getY(i) / 11, bulge = Math.sin(yy * PI) * 0.35; cp.setX(i, cp.getX(i) * (1 + bulge)); cp.setZ(i, cp.getZ(i) * (1 + bulge)); }
    cyp.computeVertexNormals();
    var cm = ctx.instanced(cyp, new THREE.MeshStandardMaterial({ color: '#27402A', roughness: 0.9 }), cyps.length, function (n, d) { var p = cyps[n]; d.position.set(p[0], p[1] - 0.2, p[2]); d.scale.set(p[3] * 0.9, p[3], p[3] * 0.9); d.rotation.y = p[4]; });
    cm.castShadow = true; scene.add(cm);
    // olive: a short twisted trunk and a silvery crown
    scene.add(ctx.instanced(new THREE.CylinderGeometry(0.2, 0.3, 2.2, 6).translate(0, 1.1, 0).rotateZ(0.2), bark, olives.length, function (n, d) { var p = olives[n]; d.position.set(p[0], p[1] - 0.1, p[2]); d.scale.setScalar(p[3]); d.rotation.y = p[4]; }));
    var om = ctx.instanced(blob(9, 1).scale(2.3, 1.7, 2.3).translate(0.3, 3.1, 0), new THREE.MeshStandardMaterial({ color: '#8A9A72', map: leafy, normalMap: leafyN, roughness: 0.95 }), olives.length, function (n, d) { var p = olives[n]; d.position.set(p[0], p[1] - 0.1, p[2]); d.scale.setScalar(p[3]); d.rotation.y = p[4]; });
    om.castShadow = true; scene.add(om);
  }

  // stone walls on the climb, barriers and crowds on the main street, bunting overhead
  function roadside(ctx, low) {
    var THREE = ctx.THREE, R = rng(23), scene = ctx.scene, L = ctx.track.length;
    var wallSpots = [], barrierSpots = [], fans = [], poles = [];
    for (var d = 0; d < L; d += 2) {
      var F = ctx.track.frameAt(d), yaw = Math.atan2(F.tan.x, F.tan.z), town = (d < L * 0.26 || d > L * 0.88);
      [-1, 1].forEach(function (sd) {
        if (town) {
          var b = F.pos.clone().addScaledVector(F.right, sd * (HW + 2.85));
          // a straight panel cuts a bend's corner: both its ends must stay off the course
          var e1 = b.clone().addScaledVector(F.tan, 1.2), e2 = b.clone().addScaledVector(F.tan, -1.2);
          if (d % 2.4 < 2 && ctx.track.clear(e1.x, e1.z, 1.6) && ctx.track.clear(e2.x, e2.z, 1.6)) barrierSpots.push([b.x, b.y, b.z, yaw]);
          if (R() < 0.8) for (var r = 0; r < 2; r++) { var f = F.pos.clone().addScaledVector(F.right, sd * (HW + 3.6 + r * 0.8)); fans.push([f.x, W.height(f.x, f.z), f.z, yaw + (sd > 0 ? -PI / 2 : PI / 2) + (R() - 0.5) * 0.5, R(), R()]); }
        } else {
          // a low dry-stone wall at the edge of the climb (under the corridor's 0.8 m)
          var w = F.pos.clone().addScaledVector(F.right, sd * (HW + 0.9));
          wallSpots.push([w.x, w.y, w.z, yaw, 0.55 + R() * 0.2]);
        }
      });
      if (town && d % 24 < 2) { poles.push(F.pos.clone().addScaledVector(F.right, -(HW + 3.2))); poles.push(F.pos.clone().addScaledVector(F.right, HW + 3.2)); }
    }
    var stone = ctx.textures.canvas(128, 64, function (g, w, h) { var r = rng(2); g.fillStyle = '#A99A80'; g.fillRect(0, 0, w, h); for (var k = 0; k < 60; k++) { var v = 140 + r() * 80 | 0; g.fillStyle = 'rgb(' + v + ',' + (v - 10) + ',' + (v - 30) + ')'; g.fillRect(r() * w, r() * h, 12 + r() * 20, 8 + r() * 10); } });
    scene.add(ctx.instanced(new THREE.BoxGeometry(0.6, 1, 2.1).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ map: stone, roughness: 0.95 }), wallSpots.length, function (n, dd) { var w = wallSpots[n]; dd.position.set(w[0], w[1] - 0.1, w[2]); dd.rotation.y = w[3]; dd.scale.y = w[4]; }));
    // crowd barriers: silver rails on feet
    var barrier = new THREE.Group();
    var rails = ctx.textures.canvas(128, 64, function (g, w, h) { g.clearRect(0, 0, w, h); g.fillStyle = '#D5D9DF'; g.fillRect(0, 2, w, 5); g.fillRect(0, h - 10, w, 5); for (var x = 4; x < w; x += 11) g.fillRect(x, 2, 2.5, h - 8); g.fillRect(0, 0, 4, h); g.fillRect(w - 4, 0, 4, h); });
    scene.add(ctx.instanced(new THREE.PlaneGeometry(2.3, 1.05).rotateY(PI / 2).translate(0, 0.55, 0), new THREE.MeshStandardMaterial({ map: rails, alphaTest: 0.5, metalness: 0.6, roughness: 0.35, side: THREE.DoubleSide }), barrierSpots.length, function (n, dd) { var b = barrierSpots[n]; dd.position.set(b[0], b[1], b[2]); dd.rotation.y = b[3]; }));
    // fans: box figures in bright colours, some with flags up
    var body = new THREE.BoxGeometry(0.44, 0.62, 0.28).translate(0, 0.95, 0), legs = new THREE.BoxGeometry(0.34, 0.66, 0.22).translate(0, 0.33, 0), head = new THREE.BoxGeometry(0.2, 0.23, 0.21).translate(0, 1.4, 0), arm = new THREE.BoxGeometry(0.08, 0.5, 0.08).translate(0.3, 1.45, 0);
    var fanG = (function () {
      var list = [legs, body, head, arm], part = [0, 1, 2, 3], pos = [], nor = [], pa = [];
      list.forEach(function (g, i) { g = g.toNonIndexed(); pos.push.apply(pos, g.attributes.position.array); nor.push.apply(nor, g.attributes.normal.array); for (var k = 0; k < g.attributes.position.count; k++) pa.push(part[i]); });
      var G = new THREE.BufferGeometry(); G.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); G.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); G.setAttribute('aPart', new THREE.Float32BufferAttribute(pa, 1)); return G;
    })();
    var fanMat = new THREE.MeshStandardMaterial({ roughness: 0.75 });
    fanMat.onBeforeCompile = function (sh) {
      sh.uniforms.uTime = W.time;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aPart;\nuniform float uTime;\nvarying float vPart;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPart = aPart;\nfloat seed = fract(sin(float(gl_InstanceID) * 12.9898) * 43758.5453);\nif (aPart > 2.5) transformed.y += (0.5 + 0.5 * sin(uTime * (5.0 + seed * 4.0) + seed * 30.0)) * 0.25 * step(1.2, position.y);\ntransformed.y += step(0.7, seed) * abs(sin(uTime * 6.0 + seed * 20.0)) * 0.08;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vPart;')
        .replace('#include <color_fragment>', '#include <color_fragment>\nif (vPart < 0.5) diffuseColor.rgb = vec3(0.16, 0.18, 0.24);\nif (vPart > 1.5 && vPart < 2.5) diffuseColor.rgb = vec3(0.72, 0.52, 0.4);');
    };
    var fm = ctx.instanced(fanG, fanMat, fans.length, function (n, dd) { var f = fans[n]; dd.position.set(f[0], f[1], f[2]); dd.rotation.y = f[3]; dd.scale.setScalar(0.92 + f[4] * 0.16); });
    var shirts = ['#D8432B', '#FFFFFF', '#15264F', '#F07D1A', '#FFD83A', '#1E9E4A', '#2E6FC4', '#111111', '#E4002B', '#F4C542', '#8B1E3F', '#7FB2D8'], c = new THREE.Color();
    for (var i = 0; i < fans.length; i++) fm.setColorAt(i, c.set(shirts[(fans[i][5] * shirts.length) | 0]));
    fm.castShadow = true; scene.add(fm);
    // bunting across the street, well above the riders
    var flagPos = [], flagCol = [], pal = ['#D8432B', '#FFFFFF', '#2E6FC4', '#FFD83A', '#1E9E4A'];
    for (i = 0; i + 1 < poles.length; i += 2) {
      var A = poles[i].clone(), B = poles[i + 1].clone(); A.y += 9.5; B.y += 9.5;
      for (var k = 0; k <= 16; k++) { var t = k / 16, p = A.clone().lerp(B, t); p.y -= Math.sin(t * PI) * 1.1; flagPos.push(p); flagCol.push(pal[k % pal.length]); }
    }
    var tri = new THREE.BufferGeometry(); tri.setAttribute('position', new THREE.Float32BufferAttribute([-0.25, 0, 0, 0.25, 0, 0, 0, -0.5, 0], 3)); tri.computeVertexNormals();
    var fl = ctx.instanced(tri, new THREE.MeshStandardMaterial({ color: '#FFFFFF', side: THREE.DoubleSide, roughness: 0.6 }), flagPos.length, function (n, dd) { dd.position.copy(flagPos[n]); dd.rotation.y = n * 0.3; });
    for (i = 0; i < flagPos.length; i++) fl.setColorAt(i, c.set(flagCol[i]));
    scene.add(fl);
    scene.add(ctx.instanced(new THREE.CylinderGeometry(0.08, 0.1, 10, 6).translate(0, 5, 0), new THREE.MeshStandardMaterial({ color: '#5A5E66', metalness: 0.5, roughness: 0.5 }), poles.length, function (n, dd) { dd.position.set(poles[n].x, W.height(poles[n].x, poles[n].z), poles[n].z); }));
  }

  // the start and finish: a steel gantry, posts outside the corridor, the beam above 7 m
  function gantry(ctx) {
    var THREE = ctx.THREE, F = ctx.track.frameAt(0), X = HW + 2.6, TOP = 8.4;
    var steel = new THREE.MeshStandardMaterial({ color: '#1C1F26', metalness: 0.5, roughness: 0.45 });
    var g = new THREE.Group();
    [-1, 1].forEach(function (sd) { var p = new THREE.Mesh(new THREE.BoxGeometry(0.5, TOP, 0.5).translate(sd * X, TOP / 2, 0), steel); p.castShadow = true; g.add(p); });
    var tex = ctx.textures.canvas(1024, 160, function (gc, w, h) {
      gc.fillStyle = '#D8432B'; gc.fillRect(0, 0, w, h);
      gc.fillStyle = '#FFF8EC'; gc.font = '800 104px "Saira Condensed", "Arial Narrow", Arial, sans-serif'; gc.textAlign = 'center'; gc.textBaseline = 'middle'; gc.fillText('ROAD RACE 2028', w / 2, h / 2 + 4);
    });
    var beam = new THREE.Mesh(new THREE.BoxGeometry(2 * X + 0.5, 1.3, 0.5).translate(0, TOP + 0.2, 0), steel); beam.castShadow = true;
    [-1, 1].forEach(function (sd) { var b = new THREE.Mesh(new THREE.PlaneGeometry(2 * X - 0.4, 1.2), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 })); b.position.set(0, TOP + 0.2, sd * 0.27); if (sd < 0) b.rotation.y = PI; beam.add(b); });
    g.add(beam);
    // the finish line across the road
    var line = new THREE.Mesh(new THREE.PlaneGeometry(TW, 0.6).rotateX(-PI / 2), new THREE.MeshStandardMaterial({ color: '#F4F1EA', roughness: 0.6 }));
    line.position.set(0, 0.035, 0); line.userData.gmTrack = true; g.add(line);
    var chk = ctx.textures.canvas(256, 32, function (gc, w, h) { for (var i = 0; i < 16; i++) for (var j = 0; j < 2; j++) { gc.fillStyle = (i + j) % 2 ? '#111111' : '#F4F1EA'; gc.fillRect(i * w / 16, j * h / 2, w / 16, h / 2); } });
    var c2 = new THREE.Mesh(new THREE.PlaneGeometry(TW, 0.5).rotateX(-PI / 2), new THREE.MeshStandardMaterial({ map: chk, roughness: 0.6 })); c2.position.set(0, 0.04, 0); c2.userData.gmTrack = true; g.add(c2);
    g.position.copy(F.pos); g.lookAt(F.pos.x + F.tan.x, F.pos.y, F.pos.z + F.tan.z);
    ctx.scene.add(g);
  }

  /* -------------------------------------------------------- obstacles -- */
  function obstacles(ctx) {
    var THREE = ctx.THREE, L = ctx.track.length, out = [];
    function add(o, m) { m.castShadow = true; m.receiveShadow = true; o.add(m); return m; }
    function cones() { var o = new THREE.Group(), m = new THREE.MeshStandardMaterial({ color: '#F26B1D', roughness: 0.5 }); for (var i = 0; i < 3; i++) { add(o, new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.7, 12).translate(0, 0.35, 0), m)).position.set((i - 1) * 0.55, 0, 0); add(o, new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.04, 0.42), m)).position.set((i - 1) * 0.55, 0.02, 0); } return o; }
    function bales() { var o = new THREE.Group(), m = new THREE.MeshStandardMaterial({ color: '#D8B868', roughness: 1 }); add(o, new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 0.6).translate(0, 0.25, 0), m)); add(o, new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 0.6).translate(0, 0.75, 0), m)).rotation.y = 0.15; return o; }
    function bottles() { var o = new THREE.Group(), cols = ['#FFFFFF', '#E4002B', '#2E6FC4', '#FFD83A']; for (var i = 0; i < 5; i++) { var b = add(o, new THREE.Mesh(new THREE.CylinderGeometry(0.037, 0.037, 0.21, 10), new THREE.MeshStandardMaterial({ color: cols[i % 4], roughness: 0.35 }))); b.rotation.z = PI / 2; b.rotation.y = i * 1.3; b.position.set((i - 2) * 0.28, 0.04, (i % 2) * 0.22); } var musette = add(o, new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.3, 0.12).translate(0, 0.15, 0), new THREE.MeshStandardMaterial({ color: '#F4F1EA', roughness: 0.8 }))); musette.position.set(0.2, 0, -0.3); return o; }
    function fallen(col) { var o = new THREE.Group(), dark = new THREE.MeshStandardMaterial({ color: '#15161A', roughness: 0.4 }); [-0.48, 0.5].forEach(function (z) { var t = add(o, new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.02, 8, 32), dark)); t.rotation.x = PI / 2; t.position.set(0, 0.03, z); }); add(o, new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.95), new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.3, clearcoat: 1 }))).position.set(0.12, 0.06, 0.02); return o; }
    function moto() {
      var o = new THREE.Group(), body = new THREE.MeshStandardMaterial({ color: '#E8E4DA', roughness: 0.4, metalness: 0.2 }), dark = new THREE.MeshStandardMaterial({ color: '#15161A', roughness: 0.5 });
      [-0.7, 0.72].forEach(function (z) { var t = add(o, new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.08, 8, 24), dark)); t.rotation.y = PI / 2; t.position.set(0, 0.4, z); });
      add(o, new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 1.4), body)).position.set(0, 0.75, 0);
      add(o, new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.5, 4, 10), new THREE.MeshStandardMaterial({ color: '#2E6FC4', roughness: 0.6 }))).position.set(0, 1.35, 0.1);
      var cam = add(o, new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.45, 4, 10), new THREE.MeshStandardMaterial({ color: '#15264F', roughness: 0.6 }))); cam.position.set(0, 1.45, -0.45); cam.rotation.x = -0.3;
      add(o, new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.25, 0.45), dark)).position.set(0.25, 1.75, -0.5);
      return o;
    }
    function put(d, x, o, extra) { var e = { at: d / L, x: x, object: o }; if (extra) Object.assign(e, extra); out.push(e); }
    var n = 0, cols = ['#15264F', '#F07D1A', '#1E9E4A', '#E4002B'];
    for (var d = 60; d < L - 20; d += 24) {
      var side = n % 2 ? 1 : -1, x = side * (1.3 + ((n * 7) % 11) / 11 * 1.6), kind = n % 6;
      if (kind === 0) put(d, x, cones());
      else if (kind === 1) put(d, side * 2.9, bales());
      else if (kind === 2) put(d, x, bottles());
      else if (kind === 3) put(d, x * 0.5, fallen(cols[n % 4]), { move: { amplitude: 1.4, period: 4.2 } });
      else if (kind === 4) put(d, side * 1.6, moto(), { move: { amplitude: 1.0, period: 5.5 } });
      else put(d, x, cones());
      n++;
    }
    return out;
  }

  /* ----------------------------------------------------------- update -- */
  var last = null;
  function update(ctx, t, dt) {
    W.time.value = t;
    if (W.ripples) { W.ripples.offset.x = t * 0.01; W.ripples.offset.y = -t * 0.015; }
    (W.boats || []).forEach(function (b) { b.o.position.y = Math.sin(t * 1.1 + b.ph) * 0.15; b.o.rotation.z = Math.sin(t * 0.9 + b.ph) * 0.04; });
    var p = ctx.camera.position;
    if (last && dt > 0) { var v = Math.hypot(p.x - last.x, p.z - last.z) / dt; W.speed = W.speed == null ? v : W.speed + (v - W.speed) * Math.min(1, dt * 3); }
    last = { x: p.x, z: p.z };
    var A = W.audio;
    if (A) {
      var now = A.ac.currentTime, s = clamp((W.speed || 0) / 28, 0, 1), inTown = p.z > -20;
      A.wind.gain.setTargetAtTime(0.02 + 0.09 * s, now, 0.15);
      A.crowd.gain.setTargetAtTime((inTown ? 0.09 : 0.03) + (t > A.swell ? 0.05 : 0), now, 0.5);
      if (t > A.swell + 3) A.swell = t + 7 + Math.random() * 9;
    }
  }

  function ambient(ctx) {
    var ac = ctx.audio.context, out = ctx.audio.destination;
    function noise(seconds, brown) {
      var n = Math.floor(ac.sampleRate * seconds), b = ac.createBuffer(1, n, ac.sampleRate), d = b.getChannelData(0), l = 0;
      for (var i = 0; i < n; i++) { var w = Math.random() * 2 - 1; if (brown) { l = (l + 0.02 * w) / 1.02; d[i] = l * 3.5; } else d[i] = w; }
      return b;
    }
    function loop(buf) { var s = ac.createBufferSource(); s.buffer = buf; s.loop = true; s.start(); return s; }
    var cs = loop(noise(4, false)), cb = ac.createBiquadFilter(); cb.type = 'bandpass'; cb.frequency.value = 800; cb.Q.value = 0.5;
    var crowd = ac.createGain(); crowd.gain.value = 0.06; cs.connect(cb); cb.connect(crowd); crowd.connect(out);
    var ws = loop(noise(3, true)), wl = ac.createBiquadFilter(); wl.type = 'lowpass'; wl.frequency.value = 420;
    var wind = ac.createGain(); wind.gain.value = 0.03; ws.connect(wl); wl.connect(wind); wind.connect(out);
    W.audio = { ac: ac, crowd: crowd, wind: wind, swell: 5 };
  }
})();
