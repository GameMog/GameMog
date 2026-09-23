// LA Olympics 2028
//
// A first-party GameMog world: an endless 400 metres final in a sold-out Los
// Angeles stadium at golden hour, on runtime v1 with cinematic graphics.
//
// Everything is built here, procedurally: a standard 400m track (84.39m
// straights, 36.5m kerb radius, nine lanes, the 400m stagger), a two-tier bowl
// with a crowd that does the wave, a colonnade at the open east end with the
// cauldron burning on top, and skinned, muscled sprinters running a real
// sprint cycle. The rules are the runtime's; the stadium is this file's.
(function () {
  'use strict';

  /* ---------------------------------------------------- the 400m oval -- */
  var PI = Math.PI, TAU = PI * 2, DEG = PI / 180;
  var STRAIGHT = 84.39, KERB = 36.5, LANE = 1.22, LANES = 9;
  var TRACK_W = LANE * LANES, RC = KERB + TRACK_W / 2, HX = STRAIGHT / 2;
  var OUTER = KERB + TRACK_W, APRON = 4.6, WALL_R = OUTER + APRON + 0.25;
  var LOW = { r0: WALL_R + 3.6, h0: 2.2, rows: 34, depth: 0.84, rise: 0.41 };
  LOW.r1 = LOW.r0 + LOW.rows * LOW.depth; LOW.h1 = LOW.h0 + LOW.rows * LOW.rise;
  // the upper tier overhangs the back of the lower one, so those rows sit in its shade
  var UPP = { r0: LOW.r1 - 5.5, h0: LOW.h1 + 5.1, soffit: LOW.h1 + 2.6, back: LOW.r1 + 3.4, rows: 28, depth: 0.8, rise: 0.52 };
  UPP.r1 = UPP.r0 + UPP.rows * UPP.depth; UPP.h1 = UPP.h0 + UPP.rows * UPP.rise;
  var EAST_OPEN = [0.16, 0.84];          // no upper tier over the east bend: the colonnade stands there
  var COLONNADE_R = LOW.r1 + 9.5, DECK_H = LOW.h1;
  var SUN = [-0.80, 0.50, 0.42];         // towards the sun: west-south-west, 29 degrees up
  var U = { time: { value: 0 } };        // shared by every animated shader
  var W = {};                            // what update() and ambient() share

  function perim(R) { return 2 * STRAIGHT + TAU * R; }
  function bend(cx, R, th, o) { o.x = cx + R * Math.cos(th); o.z = R * Math.sin(th); o.nx = Math.cos(th); o.nz = Math.sin(th); o.tx = Math.sin(th); o.tz = -Math.cos(th); return o; }
  function line(x, z, nz, tx, o) { o.x = x; o.z = z; o.nx = 0; o.nz = nz; o.tx = tx; o.tz = 0; return o; }
  // s metres from the finish line in the running direction (anticlockwise, inside on the left)
  function ovalAt(R, s, o) {
    o = o || {};
    var a = PI * R, P = 2 * STRAIGHT + 2 * a;
    s = ((s % P) + P) % P;
    if (s < a) return bend(HX, R, PI / 2 - s / R, o);
    s -= a;
    if (s < STRAIGHT) return line(HX - s, -R, -1, -1, o);
    s -= STRAIGHT;
    if (s < a) return bend(-HX, R, -PI / 2 - s / R, o);
    return line(-HX + (s - a), R, 1, 1, o);
  }
  // by segment, q in [0, 4): 0-1 east bend, 1-2 back straight, 2-3 west bend, 3-4 home straight.
  // Radially aligned at every R, so rings of stands line up row to row.
  function ovalQ(R, q, o) {
    o = o || {};
    q = ((q % 4) + 4) % 4;
    var seg = Math.floor(q), f = q - seg;
    if (seg === 0) return bend(HX, R, PI / 2 - f * PI, o);
    if (seg === 1) return line(HX - f * STRAIGHT, -R, -1, -1, o);
    if (seg === 2) return bend(-HX, R, -PI / 2 - f * PI, o);
    return line(-HX + f * STRAIGHT, R, 1, 1, o);
  }
  function qList(q0, q1, nb, ns) {
    var out = [q0], q = q0;
    while (q < q1 - 1e-7) {
      var seg = Math.floor(q + 1e-7), isBend = (((seg % 4) + 4) % 4) % 2 === 0;
      var next = Math.min(q1, seg + 1, q + 1 / (isBend ? nb : ns));
      out.push(next); q = next;
    }
    return out;
  }
  function inOpen(q) { q = ((q % 4) + 4) % 4; return q > EAST_OPEN[0] && q < EAST_OPEN[1]; }

  var TRACK_POINTS = [];
  (function () { var P = perim(RC), o = {}; for (var i = 0; i < 72; i++) { ovalAt(RC, i / 72 * P, o); TRACK_POINTS.push([+o.x.toFixed(3), 0, +o.z.toFixed(3)]); } })();

  /* -------------------------------------------------------- utilities -- */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smooth(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function damp(c, t, l, dt) { return lerp(c, t, 1 - Math.exp(-l * dt)); }

  function merge(THREE, geos) {
    var names = Object.keys(geos[0].attributes), data = {}, idx = [], base = 0;
    names.forEach(function (n) { data[n] = []; });
    geos.forEach(function (g) {
      names.forEach(function (n) {
        var a = g.attributes[n]; if (!a) throw new Error('merge: a part has no ' + n);
        var arr = a.array; for (var i = 0; i < arr.length; i++) data[n].push(arr[i]);
      });
      var c = g.attributes.position.count;
      if (g.index) { var ia = g.index.array; for (var i = 0; i < ia.length; i++) idx.push(ia[i] + base); }
      else for (var j = 0; j < c; j++) idx.push(j + base);
      base += c;
    });
    var out = new THREE.BufferGeometry();
    names.forEach(function (n) { out.setAttribute(n, new THREE.Float32BufferAttribute(data[n], geos[0].attributes[n].itemSize)); });
    out.setIndex(idx);
    return out;
  }
  function paint(THREE, g, hex) {
    var c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (var i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return g;
  }
  function box(THREE, w, h, d, x, y, z, hex) { var g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return hex ? paint(THREE, g, hex) : g; }
  function cyl(THREE, r0, r1, h, seg, x, y, z, hex) { var g = new THREE.CylinderGeometry(r0, r1, h, seg); g.translate(x, y, z); return hex ? paint(THREE, g, hex) : g; }

  // a profile [[dr, y], ...] swept round the oval at radius R, every segment a flat face
  function sweep(THREE, R, profile, o) {
    o = o || {};
    var qs = qList(o.q0 == null ? 0 : o.q0, o.q1 == null ? 4 : o.q1, o.nb || 48, o.ns || 12);
    var pos = [], nor = [], uv = [], col = [], idx = [], P = {}, c = new THREE.Color();
    for (var k = 0; k < profile.length - 1; k++) {
      var p0 = profile[k], p1 = profile[k + 1];
      var dr = p1[0] - p0[0], dy = p1[1] - p0[1], len = Math.hypot(dr, dy) || 1, fr = -dy / len, fy = dr / len;
      var base = pos.length / 3, along = 0, px = 0, pz = 0;
      for (var i = 0; i < qs.length; i++) {
        ovalQ(R, qs[i], P);
        if (i) along += Math.hypot(P.x - px, P.z - pz);
        px = P.x; pz = P.z;
        for (var s = 0; s < 2; s++) {
          var p = s ? p1 : p0;
          pos.push(P.x + P.nx * p[0], p[1], P.z + P.nz * p[0]);
          nor.push(P.nx * fr, fy, P.nz * fr);
          uv.push(along / (o.uScale || 1), s);
          if (o.color) { c.set(o.color(k, qs[i])); col.push(c.r, c.g, c.b); }
        }
        if (i) { var a = base + (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      }
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    if (o.color) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    return g;
  }
  // a flat polygon on the ground, from [[x, z], ...]
  function flat(THREE, pts, y) {
    var g = new THREE.ShapeGeometry(new THREE.Shape(pts.map(function (p) { return new THREE.Vector2(p[0], -p[1]); })), 1);
    g.rotateX(-PI / 2); g.translate(0, y, 0);
    return g;
  }
  function arcPts(cx, cz, R, a0, a1, n) { var out = []; for (var i = 0; i <= n; i++) { var a = a0 + (a1 - a0) * i / n; out.push([cx + R * Math.cos(a), cz + R * Math.sin(a)]); } return out; }

  /* ------------------------------------------------------------ world -- */
  GameMog.world({
    // realistic sprinters and a real sky from the platform's licensed library
    assets: ['human-athlete-male', 'hdri-sunset-city'],
    theme: { sky: '#E9A877', fog: '#E4B08C', ink: '#0E1A2B', panel: '#FFF6EA', accent: '#F2553A', font: 'Oswald' },
    graphics: {
      exposure: 1.0,
      environment: { hdri: 'hdri-sunset-city', extras: envExtras, intensity: 1 },
      bloom: { strength: 0.55, threshold: 1.2, radius: 0.8 },
      grade: { contrast: 1.07, saturation: 1.06, warmth: 0.28, vignette: 0.34, grain: 0.018 },
      shadows: { extent: 30, mapSize: 2048 },
    },
    camera: { distance: 6.2, height: 2.6, fov: 55 },
    track: { width: TRACK_W, points: TRACK_POINTS },
    build: build,
    player: function (ctx) { return libraryAthlete(ctx, PLAYER, 0) || athlete(ctx, PLAYER, 0); },
    rival: function (ctx, k) {
      var base = RIVALS[(k - 1) % RIVALS.length], round = Math.floor((k - 1) / RIVALS.length);
      var kit = Object.assign({}, base, { build: base.build + round * 0.04 });
      var r = libraryAthlete(ctx, kit, k) || athlete(ctx, kit, k);
      if (round) r.name += ' ' + (round + 1);
      return r;
    },
    obstacles: obstacles,
    update: update,
    ambient: ambient,
  });

  /* ------------------------------------------------------------ build -- */
  function build(ctx) {
    var THREE = ctx.THREE, scene = ctx.scene, R = ctx.random, track = ctx.track;
    W.ctx = ctx;

    // golden hour: a warm low sun from the west, a cool sky fill
    var sun = new THREE.DirectionalLight('#FFC993', 4.2);
    sun.position.set(SUN[0] * 200, SUN[1] * 200, SUN[2] * 200); sun.castShadow = true;
    scene.add(sun, new THREE.HemisphereLight('#9DB7E0', '#7A5642', 0.7));
    ctx.sky({ top: '#4B7FC0', horizon: '#F7BE85', bottom: '#4A3833', sun: SUN, sunColor: '#FFC68A', sunSize: 1.6, glow: 2.6, haze: 0.9, sunPower: 20, curve: 0.72 });
    scene.fog = new THREE.Fog('#E9B994', 140, 3400);

    var ground = new THREE.Mesh(new THREE.CircleGeometry(2600, 48), new THREE.MeshStandardMaterial({ color: '#5E554C', roughness: 0.95 }));
    ground.rotation.x = -PI / 2; ground.position.y = -0.05; ground.receiveShadow = true;
    scene.add(ground);

    buildTrack(ctx);
    buildInfield(ctx);
    buildStands(ctx);
    buildCrowd(ctx);
    buildColonnade(ctx);
    buildRim(ctx);
    buildScreen(ctx);
    buildBeyond(ctx);
  }

  /* ------------------------------------------------------------ track -- */
  function buildTrack(ctx) {
    var THREE = ctx.THREE, scene = ctx.scene, R = ctx.random, track = ctx.track, hw = track.halfWidth;

    // polyurethane: terracotta with rubber granules, lanes 1 and 2 worn darker
    var tartan = ctx.textures.canvas(512, 512, function (g, w, h) {
      g.fillStyle = '#A8432E'; g.fillRect(0, 0, w, h);
      for (var i = 0; i < 26000; i++) {
        var r = R(); g.fillStyle = r < 0.45 ? 'rgba(198,94,68,0.5)' : r < 0.9 ? 'rgba(118,40,27,0.55)' : 'rgba(40,20,16,0.45)';
        g.fillRect(R() * w, R() * h, 1 + R() * 1.6, 1 + R() * 1.6);
      }
      var wear = g.createLinearGradient(0, 0, w * 0.26, 0);
      wear.addColorStop(0, 'rgba(60,20,14,0.26)'); wear.addColorStop(1, 'rgba(60,20,14,0)');
      g.fillStyle = wear; g.fillRect(0, 0, w * 0.26, h);
    });
    var grain = ctx.textures.normal(256, 256, function (g, w, h) {
      for (var i = 0; i < 9000; i++) { var c = Math.floor(80 + R() * 175); g.fillStyle = 'rgb(' + c + ',' + c + ',' + c + ')'; g.fillRect(R() * w, R() * h, 1 + R() * 2, 1 + R() * 2); }
    }, 3);
    grain.repeat.set(24, 17);
    var trackMat = new THREE.MeshStandardMaterial({ map: tartan, normalMap: grain, normalScale: new THREE.Vector2(0.7, 0.7), roughness: 0.8 });
    scene.add(track.ribbon({ material: trackMat, y: 0.02, tile: 8 }));
    W.tartan = tartan; W.grain = grain;

    // the apron outside lane 9 and a strip inside the kerb
    var apronMat = new THREE.MeshStandardMaterial({ map: tartan, normalMap: grain, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.85, color: '#C9B7B0' });
    scene.add(track.ribbon({ material: apronMat, width: APRON, offset: hw + APRON / 2, y: 0.018, tile: 8 }));
    scene.add(track.ribbon({ material: apronMat, width: 1.2, offset: -hw - 0.6, y: 0.018, tile: 8 }));

    // the aluminium kerb
    var kerb = new THREE.Mesh(sweep(THREE, KERB - 0.03, [[-0.03, 0.01], [-0.03, 0.055], [0.03, 0.055], [0.03, 0.01]], { nb: 96, ns: 8 }),
      new THREE.MeshStandardMaterial({ color: '#D5D9DE', metalness: 0.85, roughness: 0.32, side: THREE.DoubleSide }));
    scene.add(kerb);

    // every white line on the track in one mesh: lane lines, finish line,
    // the 400m stagger, lane numbers. One atlas: cell 0 solid white, 1-9 digits.
    var atlas = ctx.textures.canvas(704, 64, function (g, w, h) {
      g.clearRect(0, 0, w, h);
      g.fillStyle = '#F4F1EA'; g.fillRect(0, 0, 64, 64);
      g.font = '700 58px "Helvetica Neue", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      for (var d = 1; d <= 9; d++) g.fillText(String(d), d * 64 + 32, 35);
    });
    atlas.wrapS = atlas.wrapT = THREE.ClampToEdgeWrapping;
    var parts = [], cell = function (c) { return [(c + 0.08) / 11, (c + 0.92) / 11]; }, white = cell(0);
    function setUV(g, u, v) { var a = g.attributes.uv; for (var i = 0; i < a.count; i++) a.setXY(i, u, v); return g; }
    for (var i = 0; i <= LANES; i++) {
      var rib = track.ribbon({ width: 0.05, offset: -hw + i * LANE, y: 0.03, step: 1.5 });
      rib.material.dispose();
      parts.push(setUV(rib.geometry, (white[0] + white[1]) / 2, 0.5));
    }
    var q = { pos: [], nor: [], uv: [], idx: [] };
    function quad(p0, p1, p2, p3, u, v0, v1) {
      var b = q.pos.length / 3;
      [p0, p1, p2, p3].forEach(function (p) { q.pos.push(p.x, p.y, p.z); q.nor.push(0, 1, 0); });
      q.uv.push(u[0], v0, u[1], v0, u[1], v1, u[0], v1);
      q.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
    var V = THREE.Vector3;
    // the finish line
    quad(track.pointAt(-0.05, -hw, 0.031), track.pointAt(-0.05, hw, 0.031), track.pointAt(0, hw, 0.031), track.pointAt(0, -hw, 0.031), white, 0.4, 0.6);
    // lane numbers just past it, upright for a runner coming in
    for (i = 0; i < LANES; i++) {
      var x = -hw + LANE * (i + 0.5), c = cell(i + 1);
      quad(track.pointAt(1.0, x - 0.42, 0.031), track.pointAt(1.0, x + 0.42, 0.031), track.pointAt(2.0, x + 0.42, 0.031), track.pointAt(2.0, x - 0.42, 0.031), c, 0.05, 0.95);
    }
    // the 400m stagger: every lane starts its own distance round the first bend
    var r1 = KERB + 0.3;
    for (i = 2; i <= LANES; i++) {
      var rr = KERB + (i - 1) * LANE + 0.2, ang = PI / 2 - TAU * (rr - r1) / rr;
      var ca = Math.cos(ang), sa = Math.sin(ang), tx = Math.sin(ang), tz = -Math.cos(ang), rin = KERB + (i - 1) * LANE + 0.03, rout = KERB + i * LANE - 0.03;
      var P = function (r, s) { return new V(HX + r * ca + tx * s, 0.031, r * sa + tz * s); };
      quad(P(rin, -0.05), P(rout, -0.05), P(rout, 0), P(rin, 0), white, 0.4, 0.6);
    }
    var qg = new THREE.BufferGeometry();
    qg.setAttribute('position', new THREE.Float32BufferAttribute(q.pos, 3));
    qg.setAttribute('normal', new THREE.Float32BufferAttribute(q.nor, 3));
    qg.setAttribute('uv', new THREE.Float32BufferAttribute(q.uv, 2));
    qg.setIndex(q.idx);
    parts.push(qg);
    var marks = new THREE.Mesh(merge(THREE, parts.map(function (g) { var n = new THREE.BufferGeometry(); ['position', 'normal', 'uv'].forEach(function (k) { n.setAttribute(k, g.attributes[k]); }); n.setIndex(g.index); return n; })),
      new THREE.MeshStandardMaterial({ map: atlas, alphaTest: 0.5, roughness: 0.55, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));
    marks.receiveShadow = true; marks.userData.gmTrack = true;
    scene.add(marks);

    // the advertising wall behind the apron: LED boards, one long loop of them
    var led = ctx.textures.canvas(2048, 64, function (g, w, h) {
      var ads = [
        ['#0E1A2B', '#F2553A', 'LOS ANGELES 2028'], ['#F2553A', '#FFF6EA', 'GAMEMOG'], ['#111318', '#F6C33B', 'GM  GM  GM'],
        ['#1F6F8B', '#FFF6EA', 'ATHLETICS'], ['#FFF6EA', '#0E1A2B', 'LOS ANGELES 2028'], ['#2E5A99', '#FFC68A', 'GOLDEN HOUR'],
        ['#0E1A2B', '#FFF6EA', 'ENDLESS 400M'], ['#F6C33B', '#111318', 'GM'],
      ];
      var cw = w / ads.length;
      ads.forEach(function (a, i) {
        g.fillStyle = a[0]; g.fillRect(i * cw, 0, cw, h);
        g.fillStyle = a[1]; g.font = '800 38px "Helvetica Neue", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(a[2], i * cw + cw / 2, h / 2 + 2, cw - 24);
      });
      g.fillStyle = 'rgba(0,0,0,0.18)'; for (var y = 0; y < h; y += 3) g.fillRect(0, y, w, 1);
    });
    led.repeat.set(-1 / 64, 1);   // negative: read left to right from the field
    var wall = new THREE.Mesh(sweep(THREE, WALL_R, [[0, 0], [0, 1.1]], { nb: 64, ns: 16 }),
      new THREE.MeshStandardMaterial({ color: '#202020', emissive: '#FFFFFF', emissiveMap: led, emissiveIntensity: 1.35, roughness: 0.5, side: THREE.DoubleSide }));
    var cap = new THREE.Mesh(sweep(THREE, WALL_R, [[0, 1.1], [0.35, 1.1], [0.35, 0]], { nb: 64, ns: 16 }), new THREE.MeshStandardMaterial({ color: '#1A1D24', roughness: 0.7, side: THREE.DoubleSide }));
    scene.add(wall, cap);
    W.led = led;
  }

  /* ---------------------------------------------------------- infield -- */
  function buildInfield(ctx) {
    var THREE = ctx.THREE, scene = ctx.scene, R = ctx.random;
    var RG = KERB - 1.2;

    // grass, mown in stripes across the field
    var grassTex = ctx.textures.canvas(512, 512, function (g, w, h) {
      for (var s = 0; s < 4; s++) { g.fillStyle = s % 2 ? '#4A7A2B' : '#5A9034'; g.fillRect(s * w / 4, 0, w / 4, h); }
      for (var i = 0; i < 30000; i++) { var r = R(); g.fillStyle = r < 0.5 ? 'rgba(36,64,20,0.35)' : 'rgba(122,164,72,0.3)'; g.fillRect(R() * w, R() * h, 1, 2 + R() * 3); }
    });
    grassTex.repeat.set(1 / 20, 1 / 20);
    var blades = ctx.textures.normal(256, 256, function (g, w, h) {
      for (var i = 0; i < 7000; i++) { var c = Math.floor(70 + R() * 185); g.fillStyle = 'rgb(' + c + ',' + c + ',' + c + ')'; g.fillRect(R() * w, R() * h, 1, 3 + R() * 4); }
    }, 2.4);
    blades.repeat.set(1 / 1.3, 1 / 1.3);
    var grassPts = [[HX, -RG]].concat(arcPts(-HX, 0, RG, -PI / 2, -1.5 * PI, 40)).concat([[HX, RG]]);
    var grass = new THREE.Mesh(flat(THREE, grassPts, 0.012), new THREE.MeshStandardMaterial({ map: grassTex, normalMap: blades, roughness: 0.95 }));
    grass.receiveShadow = true; scene.add(grass);

    // the east D in tartan for the high jump
    var dTex = W.tartan.clone(); dTex.needsUpdate = true; dTex.repeat.set(1 / 8, 1 / 8);
    var dGrain = W.grain.clone(); dGrain.needsUpdate = true; dGrain.repeat.set(2, 2);
    var eastD = new THREE.Mesh(flat(THREE, arcPts(HX, 0, RG, PI / 2, -PI / 2, 40), 0.014),
      new THREE.MeshStandardMaterial({ map: dTex, normalMap: dGrain, roughness: 0.82, color: '#E4D2CB' }));
    eastD.receiveShadow = true; scene.add(eastD);

    // field event furniture, grouped by where it stands: a mesh whose bounds
    // straddled the racing corridor would be hidden by the runtime
    var p = [], mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.05 });
    function group() { if (!p.length) return; var m = new THREE.Mesh(merge(THREE, p), mat); m.castShadow = true; m.receiveShadow = true; scene.add(m); p = []; }
    // high jump: mat and standards
    var hjx = HX + 20;
    p.push(box(THREE, 5, 0.62, 3.2, hjx, 0.31, 0, '#1F4FB0'), box(THREE, 5.1, 0.12, 3.3, hjx, 0.68, 0, '#2A62D0'));
    p.push(cyl(THREE, 0.03, 0.03, 2.6, 8, hjx - 0.2, 1.3, -2.1, '#F2F2F2'), cyl(THREE, 0.03, 0.03, 2.6, 8, hjx - 0.2, 1.3, 2.1, '#F2F2F2'));
    var bar = cyl(THREE, 0.015, 0.015, 4.2, 6, 0, 0, 0, '#F6C33B'); bar.rotateX(PI / 2); bar.translate(hjx - 0.2, 2.24, 0); p.push(bar);
    group();
    // long jump runway, board and pit, inside the back straight
    var lz = -(RG - 3.2);
    p.push(box(THREE, 44, 0.02, 1.22, -18, 0.025, lz, '#9C3E2B'), box(THREE, 0.2, 0.025, 1.22, 4.2, 0.03, lz, '#F2F2F2'), box(THREE, 9, 0.03, 2.9, 10, 0.02, lz, '#D8C49A'));
    // javelin runway in the west D
    p.push(box(THREE, 30, 0.02, 4, -HX - 18, 0.025, 0, '#9C3E2B'));
    group();
    // shot put circle
    p.push(cyl(THREE, 1.12, 1.12, 0.03, 32, -8, 0.02, 12, '#F2F2F2'), cyl(THREE, 1.07, 1.07, 0.035, 32, -8, 0.022, 12, '#7F7A73'));
    group();
    // hammer and discus cage posts
    var cage = { x: -HX - 9, z: -17 };
    for (var i = 0; i < 9; i++) { var a = -PI * 0.1 + i * PI * 1.6 / 8; p.push(cyl(THREE, 0.06, 0.06, 7, 6, cage.x + Math.cos(a) * 3.6, 3.5, cage.z + Math.sin(a) * 3.6, '#3B3F46')); }
    p.push(cyl(THREE, 1.3, 1.3, 0.03, 28, cage.x, 0.02, cage.z, '#7F7A73'));
    group();
    // steeplechase water jump inside the west bend, with its barrier
    var wa = -PI * 0.8, wr = KERB - 6.2, wx = -HX + Math.cos(wa) * wr, wz = Math.sin(wa) * wr;
    var barrier = merge(THREE, [box(THREE, 3.66, 0.127, 0.127, 0, 0.85, 0, '#F2F2F2'), box(THREE, 0.1, 0.8, 0.1, -1.7, 0.4, 0, '#2A2A2A'), box(THREE, 0.1, 0.8, 0.1, 1.7, 0.4, 0, '#2A2A2A')]);
    barrier.rotateY(-wa + PI / 2); barrier.translate(wx + Math.cos(wa) * 1.9, 0, wz + Math.sin(wa) * 1.9); p.push(barrier);
    group();
    // the inside finish post (under 0.8m, so it may stand by the kerb) and the photo-finish mast outside
    p.push(box(THREE, 0.09, 0.62, 0.09, HX, 0.31, KERB - 0.4, '#F4F4F4'), box(THREE, 0.1, 0.12, 0.1, HX, 0.68, KERB - 0.4, '#16161A'));
    group();
    p.push(cyl(THREE, 0.07, 0.07, 3.2, 8, HX, 1.6, OUTER + 2.4, '#2A2D33'), box(THREE, 0.4, 0.3, 0.55, HX, 3.3, OUTER + 2.4, '#16161A'));
    group();

    // the cage net
    var netTex = ctx.textures.canvas(64, 64, function (g, w, h) { g.clearRect(0, 0, w, h); g.strokeStyle = 'rgba(40,44,52,0.9)'; g.lineWidth = 2; for (var k = 0; k <= w; k += 8) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k, h); g.moveTo(0, k); g.lineTo(w, k); g.stroke(); } });
    netTex.repeat.set(18, 5);
    var net = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.6, 7, 28, 1, true, PI * 0.5 + PI * 0.1, PI * 1.6),
      new THREE.MeshStandardMaterial({ map: netTex, transparent: true, alphaTest: 0.2, side: THREE.DoubleSide, roughness: 0.9, depthWrite: false }));
    net.position.set(cage.x, 3.5, cage.z); scene.add(net);

    // the water in the water jump
    var water = new THREE.Mesh(new THREE.PlaneGeometry(3.66, 3.66), new THREE.MeshPhysicalMaterial({ color: '#1B4B5E', roughness: 0.04, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.05 }));
    water.rotation.x = -PI / 2; water.rotation.z = -wa; water.position.set(wx, 0.03, wz); scene.add(water);

    // photographers behind the finish line, lenses on the runners coming in
    // kneeling, a white telephoto lens on a monopod
    var headG = paint(THREE, new THREE.IcosahedronGeometry(0.105, 1).translate(0, 1.13, 0.04), '#8A5A3C');
    var capG = paint(THREE, new THREE.SphereGeometry(0.112, 12, 6, 0, TAU, 0, PI * 0.45).translate(0, 1.15, 0.03), '#16181D');
    var photog = merge(THREE, [
      box(THREE, 0.34, 0.14, 0.52, 0, 0.07, -0.16, '#23262D'),
      paint(THREE, new THREE.BoxGeometry(0.34, 0.4, 0.2).rotateX(-0.2).translate(0, 0.33, -0.34), '#2B2F38'),
      paint(THREE, new THREE.BoxGeometry(0.4, 0.56, 0.26).rotateX(0.35).translate(0, 0.78, -0.2), '#1E2128'),
      paint(THREE, new THREE.BoxGeometry(0.42, 0.3, 0.28).rotateX(0.35).translate(0, 0.92, -0.16), '#C9D23A'),
      paint(THREE, new THREE.BoxGeometry(0.09, 0.09, 0.4).rotateY(0.35).translate(0.16, 0.98, 0.1), '#1E2128'),
      paint(THREE, new THREE.BoxGeometry(0.09, 0.09, 0.4).rotateY(-0.35).translate(-0.16, 0.98, 0.1), '#1E2128'),
      box(THREE, 0.15, 0.13, 0.13, 0, 1.08, 0.24, '#141518'),
      cyl(THREE, 0.058, 0.064, 0.44, 12, 0, 0, 0, '#ECE9E1').rotateX(PI / 2).translate(0, 1.07, 0.5),
      cyl(THREE, 0.07, 0.07, 0.1, 12, 0, 0, 0, '#141518').rotateX(PI / 2).translate(0, 1.07, 0.76),
      cyl(THREE, 0.014, 0.014, 1.0, 6, 0, 0.5, 0.46, '#2A2A2A'),
      headG, capG,
    ].map(function (g) { var n = new THREE.BufferGeometry(); ['position', 'normal', 'color'].forEach(function (k) { n.setAttribute(k, g.attributes[k]); }); if (g.index) n.setIndex(g.index); return n; }));
    var spots = [], o = {};
    for (i = 0; i < 14; i++) { ovalAt(OUTER + 2.2 + (i % 2) * 0.9, 3 + i * 0.95, o); spots.push([o.x, o.z, Math.atan2(-o.tx, -o.tz) + (R() - 0.5) * 0.4]); }
    var ph = ctx.instanced(photog, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }), spots.length, function (n, d) { d.position.set(spots[n][0], 0, spots[n][1]); d.rotation.y = spots[n][2]; });
    ph.castShadow = true; scene.add(ph);
  }

  /* ----------------------------------------------------------- stands -- */
  function tierProfile(t, start) {
    var pr = start.slice();
    for (var j = 0; j < t.rows; j++) {
      var dr = j * t.depth, y = t.h0 + j * t.rise;
      pr.push([dr + t.depth, y], [dr + t.depth, y + t.rise]);
    }
    return pr;
  }
  function buildStands(ctx) {
    var THREE = ctx.THREE, scene = ctx.scene;
    var seat = ['#1D6A86', '#18607A', '#2A7F9C', '#1D6A86'], upper = ['#C2553C', '#B44B34', '#CD6246'];
    var mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide });

    // lower bowl, all the way round
    var low = tierProfile(LOW, [[0, 0], [0, LOW.h0]]);
    low.push([LOW.r1 - LOW.r0 + 3.4, LOW.h1]);
    var lowGeo = sweep(THREE, LOW.r0, low, {
      nb: 64, ns: 16, color: function (k, q) {
        if (k === 0) return '#172136';
        if (k === low.length - 2) return '#6F6A64';
        return k % 2 ? seat[Math.floor(q * 9) % seat.length] : '#4A4541';
      },
    });
    // upper bowl, open over the east bend
    var up = tierProfile(UPP, [[UPP.back - UPP.r0, LOW.h1], [UPP.back - UPP.r0, UPP.soffit], [0, UPP.soffit], [0, UPP.h0]]);
    up.push([UPP.r1 - UPP.r0, UPP.h1 + 1.4], [UPP.r1 - UPP.r0 + 0.5, UPP.h1 + 1.4]);
    var upGeo = sweep(THREE, UPP.r0, up, {
      q0: EAST_OPEN[1], q1: 4 + EAST_OPEN[0], nb: 64, ns: 16, color: function (k, q) {
        if (k < 2) return '#23252B';
        if (k === 2) return '#172136';
        if (k >= up.length - 3) return '#D9D2C6';
        return k % 2 ? upper[Math.floor(q * 9) % upper.length] : '#4A4541';
      },
    });
    // the deck under the colonnade, where the upper bowl is not
    var deck = sweep(THREE, UPP.back, [[0, LOW.h1], [COLONNADE_R - UPP.back + 6, LOW.h1]], { q0: EAST_OPEN[0] - 0.02, q1: EAST_OPEN[1] + 0.02, nb: 64, color: function () { return '#7C746B'; } });
    // the upper bowl's two ends, closed
    var caps = [EAST_OPEN[1], EAST_OPEN[0]].map(function (q) {
      var outline = up.slice(); outline.push([UPP.r1 - UPP.r0 + 0.5, LOW.h1]);
      outline = outline.filter(function (p, i) { return i === 0 || p[0] !== outline[i - 1][0] || p[1] !== outline[i - 1][1]; });
      var g = new THREE.ShapeGeometry(new THREE.Shape(outline.map(function (p) { return new THREE.Vector2(p[0], p[1]); })));
      var o = ovalQ(UPP.r0, q, {}), pos = g.attributes.position;
      for (var i = 0; i < pos.count; i++) { var dr = pos.getX(i), y = pos.getY(i); pos.setXYZ(i, o.x + o.nx * dr, y, o.z + o.nz * dr); }
      g.computeVertexNormals();
      return paint(THREE, g, '#C9BFB0');
    });
    var stands = new THREE.Mesh(merge(THREE, [lowGeo, upGeo, deck].map(function (g) { return g; })), mat);
    var capMesh = new THREE.Mesh(merge(THREE, caps.map(function (g) { g.deleteAttribute('uv'); var n = new THREE.BufferGeometry(); ['position', 'normal', 'color'].forEach(function (k) { n.setAttribute(k, g.attributes[k]); }); n.setIndex(g.index); return n; })), mat);
    stands.receiveShadow = true;
    scene.add(stands, capMesh);

    // LED ribbons on the front of the lower bowl and the upper fascia
    var ribbonTex = ctx.textures.canvas(1024, 32, function (g, w, h) {
      var grd = g.createLinearGradient(0, 0, w, 0);
      grd.addColorStop(0, '#F2553A'); grd.addColorStop(0.5, '#F6C33B'); grd.addColorStop(1, '#F2553A');
      g.fillStyle = grd; g.fillRect(0, 0, w, h);
      g.fillStyle = '#0E1A2B'; g.font = '800 22px "Helvetica Neue", Arial, sans-serif'; g.textBaseline = 'middle';
      for (var x = 20; x < w; x += 340) g.fillText('LOS ANGELES 2028', x, h / 2 + 1);
    });
    ribbonTex.repeat.set(-1 / 45, 1);
    var ribMat = new THREE.MeshStandardMaterial({ color: '#111111', emissive: '#FFFFFF', emissiveMap: ribbonTex, emissiveIntensity: 1.1, side: THREE.DoubleSide });
    scene.add(new THREE.Mesh(merge(THREE, [
      sweep(THREE, LOW.r0 - 0.03, [[0, 1.2], [0, 2.05]], { nb: 64, ns: 16 }),
      sweep(THREE, UPP.r0 - 0.03, [[0, UPP.soffit + 0.25], [0, UPP.h0 - 0.3]], { q0: EAST_OPEN[1], q1: 4 + EAST_OPEN[0], nb: 64, ns: 16 }),
    ]), ribMat));
    W.ribbon = ribbonTex;
  }

  /* ------------------------------------------------------------ crowd -- */
  // Sixty thousand people, eight instanced meshes (one per sector, so the ones
  // behind the camera are culled). Every fan has a shirt, a skin tone and a
  // seed; the vertex shader stands them up for the wave that runs round the
  // bowl, and throws random arms in the air.
  function buildCrowd(ctx) {
    var THREE = ctx.THREE, scene = ctx.scene, R = ctx.random;
    var shirts = [['#EEEDE8', 20], ['#1E1F24', 14], ['#1C2A4A', 12], ['#8A8C90', 9], ['#B9B4AA', 6], ['#B8202E', 8], ['#2F5FA8', 6], ['#6FA3D0', 4], ['#E0B43A', 3], ['#2E7D4F', 3], ['#E06B35', 4], ['#D46A8E', 3], ['#6A2334', 2], ['#2B8C8C', 2], ['#6B7342', 3]];
    var skins = ['#F1C8A5', '#E0AC86', '#C68A63', '#A0694A', '#7A4B32', '#5A3524', '#3E2418', '#D9A17A'];
    var total = 0; shirts.forEach(function (s) { total += s[1]; });
    function pickShirt() { var r = R() * total; for (var i = 0; i < shirts.length; i++) { r -= shirts[i][1]; if (r <= 0) return shirts[i][0]; } return shirts[0][0]; }

    var low = ctx.quality === 'low', thin = low ? 1.8 : 1;
    var SECT = 8, bins = []; for (var b = 0; b < SECT; b++) bins.push([]);
    var shadeAt = 1, overhang = false;
    function row(R0, y, q0, q1, spacing, skipOpen) {
      for (var seg = 0; seg < 4; seg++) {
        var isBend = seg % 2 === 0, len = isBend ? PI * R0 : STRAIGHT, n = Math.floor(len / spacing), o = {};
        for (var i = 0; i < n; i++) {
          var q = seg + (i + 0.5) / n;
          if (skipOpen && inOpen(q)) continue;
          if (i % 26 === 0 || i % 26 === 1) continue;   // aisles
          if (R() < 0.035) continue;                    // the odd empty seat
          ovalQ(R0, q, o);
          var ang = Math.atan2(o.z, o.x), bin = Math.floor(((ang + PI) / TAU) * SECT) % SECT;
          bins[bin].push([o.x, y, o.z, Math.atan2(-o.nx, -o.nz) + (R() - 0.5) * 0.35, 0.92 + R() * 0.16, pickShirt(), skins[Math.floor(R() * skins.length)], R(), overhang && !inOpen(q) ? 0.55 : shadeAt]);
        }
      }
    }
    // the back rows of the lower bowl sit under the upper tier's overhang, in its shade
    var under = (UPP.r0 - LOW.r0) / LOW.depth;
    for (var j = 0; j < LOW.rows; j++) { overhang = j > under - 1; shadeAt = 1 - 0.12 * smooth(under - 8, under, j); row(LOW.r0 + j * LOW.depth + LOW.depth * 0.5, LOW.h0 + j * LOW.rise, 0, 4, 0.66 * thin, false); }
    overhang = false;
    for (j = 0; j < UPP.rows; j += low ? 2 : 1) { shadeAt = 0.92; row(UPP.r0 + j * UPP.depth + UPP.depth * 0.5, UPP.h0 + j * UPP.rise, 0, 4, 0.72 * thin, true); }

    // a seated fan: torso, head (hair on top), arms that can go up
    var parts = [];
    function tag(g, part) { g.setAttribute('aPart', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(part), 1)); return g; }
    var torso = new THREE.CylinderGeometry(0.15, 0.17, 0.52, 6, 1); torso.scale(1.15, 1, 0.68); torso.translate(0, 0.72, 0);
    parts.push(tag(torso, 0));
    var head = new THREE.IcosahedronGeometry(0.105, 0); head.scale(0.92, 1.08, 1); head.translate(0, 1.09, 0.01);
    var hp = head.attributes.position, hpart = new Float32Array(hp.count);
    for (var v = 0; v < hp.count; v += 3) { var cy = (hp.getY(v) + hp.getY(v + 1) + hp.getY(v + 2)) / 3, cz = (hp.getZ(v) + hp.getZ(v + 1) + hp.getZ(v + 2)) / 3; hpart[v] = hpart[v + 1] = hpart[v + 2] = (cy > 1.12 || cz < -0.03) ? 3 : 2; }
    head.setAttribute('aPart', new THREE.BufferAttribute(hpart, 1)); parts.push(head);
    [-1, 1].forEach(function (s) { var arm = new THREE.CylinderGeometry(0.045, 0.036, 0.46, 5, 1, true); arm.translate(s * 0.215, 0.72, 0.02); parts.push(tag(arm, 1)); });
    var fan = merge(THREE, parts.map(function (g) { return g.index ? g.toNonIndexed() : g; }));

    var mat = new THREE.MeshStandardMaterial({ roughness: 0.85 });
    mat.onBeforeCompile = function (sh) {
      sh.uniforms.uTime = U.time;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aPart;\nattribute vec3 aSkin;\nattribute float aSeed;\nuniform float uTime;')
        .replace('#include <begin_vertex>', [
          '#include <begin_vertex>',
          'vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);',
          'float wave = pow(max(0.0, cos(atan(ip.z, ip.x) + uTime * 0.26)), 26.0);',
          'float cheer = step(0.962, fract(sin(aSeed * 91.7 + floor(uTime * 0.55 + aSeed * 7.3) * 13.1) * 43758.5));',
          'float up = max(wave, cheer * 0.85);',
          'float lift = up * 0.3 + sin(uTime * (5.0 + aSeed * 6.0) + aSeed * 50.0) * 0.016 * (0.4 + cheer);',
          'if (aPart > 0.5 && aPart < 1.5) { float dy = transformed.y - 0.95; transformed.y = 0.95 + mix(dy, -dy * 1.08, up); transformed.x *= 1.0 + up * 0.3; }',
          'transformed.y += lift;',
        ].join('\n'))
        .replace('#include <color_vertex>', '#include <color_vertex>\n#ifdef USE_INSTANCING_COLOR\nvColor.xyz = aPart < 0.5 ? instanceColor.xyz : (aPart < 2.5 ? aSkin : vec3(0.035, 0.028, 0.024));\n#endif');
    };

    var TMPC = new THREE.Color(), M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
    var count = 0;
    bins.forEach(function (list) {
      if (!list.length) return;
      var g = new THREE.BufferGeometry();
      ['position', 'normal', 'uv', 'aPart'].forEach(function (k) { g.setAttribute(k, fan.attributes[k]); });
      g.setIndex(fan.index);
      var skin = new Float32Array(list.length * 3), seed = new Float32Array(list.length);
      var im = new THREE.InstancedMesh(g, mat, list.length);
      list.forEach(function (f, i) {
        P.set(f[0], f[1], f[2]); Q.setFromAxisAngle(Y, f[3]); S.setScalar(f[4]);
        im.setMatrixAt(i, M.compose(P, Q, S));
        var lum = f[8] * (0.78 + 0.22 * f[7]);
        col.set(f[5]); var gr = (col.r + col.g + col.b) / 3; col.lerp(TMPC.setRGB(gr, gr, gr), 0.18);
        im.setColorAt(i, col.multiplyScalar(lum));
        col.set(f[6]).multiplyScalar(lum); skin[i * 3] = col.r; skin[i * 3 + 1] = col.g; skin[i * 3 + 2] = col.b; seed[i] = f[7];
      });
      g.setAttribute('aSkin', new THREE.InstancedBufferAttribute(skin, 3));
      g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 1));
      im.computeBoundingSphere();
      scene.add(im);
      count += list.length;
    });
    W.fans = count;

    // camera flashes going off round the bowl
    var n = low ? 1600 : 5200, fp = new Float32Array(n * 3), fs = new Float32Array(n);
    var all = []; bins.forEach(function (l) { all = all.concat(l); });
    for (var i = 0; i < n; i++) { var f = all[Math.floor(R() * all.length)]; fp[i * 3] = f[0]; fp[i * 3 + 1] = f[1] + 1.2; fp[i * 3 + 2] = f[2]; fs[i] = R(); }
    var fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.BufferAttribute(fp, 3));
    fg.setAttribute('aSeed', new THREE.BufferAttribute(fs, 1));
    var flashes = new THREE.Points(fg, new THREE.ShaderMaterial({
      uniforms: { uTime: U.time },
      vertexShader: [
        'attribute float aSeed; uniform float uTime; varying float vF;',
        'void main() {',
        '  float ph = fract(aSeed * 17.31 + uTime * (0.02 + fract(aSeed * 7.13) * 0.045));',
        '  vF = ph > 0.9965 ? 1.0 - (ph - 0.9965) / 0.0035 : 0.0;',
        '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
        '  gl_Position = projectionMatrix * mv;',
        '  gl_PointSize = vF > 0.0 ? max(1.5, 0.55 * projectionMatrix[1][1] * 360.0 / -mv.z) : 0.0;',
        '}',
      ].join('\n'),
      fragmentShader: 'varying float vF; void main() { float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(vec3(1.0, 0.97, 0.92) * vF * 16.0 * smoothstep(0.5, 0.0, d), 1.0); }',
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    flashes.frustumCulled = false;
    scene.add(flashes);
  }

  /* -------------------------------------------------------- colonnade -- */
  // The open east end: a curved colonnade of arches on the deck behind the
  // lower bowl, the sky through every arch, the cauldron burning on the crown.
  function buildColonnade(ctx) {
    var THREE = ctx.THREE, scene = ctx.scene, R = ctx.random;
    var stone = ctx.textures.canvas(256, 256, function (g, w, h) {
      g.fillStyle = '#D9C5A2'; g.fillRect(0, 0, w, h);
      for (var i = 0; i < 5000; i++) { g.fillStyle = R() < 0.5 ? 'rgba(170,146,110,0.28)' : 'rgba(240,226,198,0.3)'; g.fillRect(R() * w, R() * h, 1 + R() * 3, 1); }
      g.strokeStyle = 'rgba(120,98,70,0.55)'; g.lineWidth = 2;
      for (var y = 0; y <= h; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); for (var x = (y / 64) % 2 ? 64 : 0; x < w; x += 128) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 64); g.stroke(); } }
    });
    stone.repeat.set(1 / 4, 1 / 4);
    var joints = ctx.textures.normal(256, 256, function (g, w, h) {
      g.fillStyle = '#b0b0b0'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#404040';
      for (var y = 0; y <= h; y += 64) { g.fillRect(0, y - 2, w, 4); for (var x = (y / 64) % 2 ? 64 : 0; x < w; x += 128) g.fillRect(x - 2, y, 4, 64); }
      for (var i = 0; i < 3000; i++) { var c = Math.floor(140 + R() * 80); g.fillStyle = 'rgb(' + c + ',' + c + ',' + c + ')'; g.fillRect(R() * w, R() * h, 2, 2); }
    }, 2.5);
    joints.repeat.set(1 / 4, 1 / 4);
    var mat = new THREE.MeshStandardMaterial({ map: stone, normalMap: joints, roughness: 0.78 });

    function panel(w, h, holeW, holeH) {
      var s = new THREE.Shape();
      s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(w / 2, h); s.lineTo(-w / 2, h); s.lineTo(-w / 2, 0);
      var r = holeW / 2, base = 1.8, spring = base + holeH - r, hole = new THREE.Path();
      hole.moveTo(-r, base); hole.lineTo(-r, spring); hole.absarc(0, spring, r, PI, 0, true); hole.lineTo(r, base); hole.lineTo(-r, base);
      s.holes.push(hole);
      var g = new THREE.ExtrudeGeometry(s, { depth: 3.2, bevelEnabled: false, curveSegments: 18 });
      g.translate(0, 0, -1.6);
      return g;
    }
    var arches = 11, a0 = PI / 2 - EAST_OPEN[0] * PI, a1 = PI / 2 - EAST_OPEN[1] * PI, span = (a0 - a1) * COLONNADE_R, pw = span / arches + 0.4;
    var geos = [];
    for (var i = 0; i < arches; i++) {
      var a = a0 - (i + 0.5) / arches * (a0 - a1), mid = i === (arches - 1) / 2;
      var g = mid ? panel(pw, 27, 12.5, 20) : panel(pw, 20, 11, 14.5);
      g.rotateY(Math.atan2(-Math.cos(a), -Math.sin(a)));
      g.translate(HX + Math.cos(a) * COLONNADE_R, DECK_H, Math.sin(a) * COLONNADE_R);
      geos.push(g);
    }
    // the cornice along the top
    var cornice = sweep(THREE, COLONNADE_R, [[-2.2, DECK_H + 20], [-2.2, DECK_H + 21.4], [2.2, DECK_H + 21.4], [2.2, DECK_H + 20]], { q0: EAST_OPEN[0], q1: EAST_OPEN[1], nb: 64, uScale: 1 });
    geos.push(cornice);
    var col = new THREE.Mesh(merge(THREE, geos.map(function (g) { var n = new THREE.BufferGeometry(); ['position', 'normal', 'uv'].forEach(function (k) { n.setAttribute(k, g.attributes[k]); }); if (g.index) n.setIndex(g.index); return n; })), mat);
    col.receiveShadow = true; scene.add(col);

    // the cauldron on the central arch, and its fire
    var cx = HX + COLONNADE_R, cy = DECK_H + 27;
    var bronze = new THREE.MeshStandardMaterial({ color: '#9A7442', metalness: 1, roughness: 0.32 });
    var ped = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.6, 3.2, 20), bronze); ped.position.set(cx, cy + 1.6, 0);
    var bowl = new THREE.Mesh(new THREE.LatheGeometry([new THREE.Vector2(0.3, 0), new THREE.Vector2(1.4, 0.3), new THREE.Vector2(2.8, 1.6), new THREE.Vector2(3.3, 2.6), new THREE.Vector2(3.1, 2.7), new THREE.Vector2(2.6, 1.8), new THREE.Vector2(0.2, 0.8)], 36), bronze);
    bowl.position.set(cx, cy + 3.2, 0);
    scene.add(ped, bowl);
    var flameMat = new THREE.ShaderMaterial({
      uniforms: { uTime: U.time },
      vertexShader: [
        'uniform float uTime; varying float vH; varying float vS;',
        'void main() {',
        '  vec3 p = position; float h = clamp(p.y / 8.0, 0.0, 1.0); vH = h; vS = uv.x;',
        '  float n = sin(p.y * 1.9 - uTime * 7.0 + p.x * 2.1) * 0.55 + sin(p.y * 3.7 - uTime * 11.0 + p.z * 1.7) * 0.3;',
        '  p.x += n * h * 1.1; p.z += cos(p.y * 2.6 - uTime * 8.3 + p.x) * h * 0.9;',
        '  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);',
        '}',
      ].join('\n'),
      fragmentShader: [
        'uniform float uTime; varying float vH; varying float vS;',
        'void main() {',
        '  float flick = 0.8 + 0.2 * sin(uTime * 23.0 + vS * 40.0);',
        '  vec3 c = mix(vec3(4.2, 1.9, 0.45), vec3(2.6, 0.55, 0.06), smoothstep(0.1, 0.8, vH));',
        '  float a = (1.0 - smoothstep(0.35, 1.0, vH)) * flick;',
        '  gl_FragColor = vec4(c * a, a);',
        '}',
      ].join('\n'),
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    [[2.6, 8, 0], [1.9, 9.5, 1.3], [2.2, 7, 2.6]].forEach(function (f) {
      var cone = new THREE.ConeGeometry(f[0], f[1], 18, 8, true); cone.translate(0, f[1] / 2, 0);
      var m = new THREE.Mesh(cone, flameMat); m.position.set(cx, cy + 5.2, 0); m.rotation.y = f[2]; m.frustumCulled = false;
      scene.add(m);
    });
    var glow = new THREE.Mesh(new THREE.SphereGeometry(2.4, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 0.8, 0.18), transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.position.set(cx, cy + 6.2, 0); scene.add(glow);

    // flags of the nations along the cornice
    var flags = ctx.textures.canvas(512, 256, function (g, w, h) {
      var designs = [
        ['h', '#000000', '#DD0000', '#FFCE00'], ['v', '#0055A4', '#FFFFFF', '#EF4135'], ['v', '#009246', '#FFFFFF', '#CE2B37'], ['h', '#FFFFFF', '#0039A6', '#D52B1E'],
        ['disc', '#FFFFFF', '#BC002D'], ['nordic', '#006AA7', '#FECC00'], ['nordic', '#C8102E', '#FFFFFF'], ['h', '#21468B', '#FFFFFF', '#AE1C28'],
        ['v', '#169B62', '#FFFFFF', '#FF883E'], ['h', '#CE1126', '#FCD116', '#006B3F'], ['h', '#000000', '#BB0000', '#006600'], ['v', '#008751', '#FFFFFF', '#008751'],
        ['h', '#009B3A', '#FED100', '#000000'], ['disc', '#006A4E', '#F42A41'], ['h', '#FFFFFF', '#FF0000', '#FFFFFF'], ['v', '#FF0000', '#FFFFFF', '#FF0000'],
        ['h', '#0038A8', '#FFFFFF', '#CE1126'], ['h', '#AA151B', '#F1BF00', '#AA151B'], ['v', '#000000', '#FFD700', '#ED2939'], ['h', '#FFFFFF', '#E30A17', '#FFFFFF'],
        ['h', '#12131A', '#12131A', '#12131A'], ['nordic', '#FFFFFF', '#003580'], ['h', '#003893', '#FFFFFF', '#003893'], ['v', '#3A75C4', '#FFFFFF', '#3A75C4'],
        ['h', '#8D1B3D', '#FFFFFF', '#8D1B3D'], ['h', '#00247D', '#FFFFFF', '#CF142B'], ['v', '#002395', '#FECB00', '#002395'], ['h', '#EE1C25', '#EE1C25', '#FFFF00'],
        ['h', '#009639', '#FFFFFF', '#000000'], ['disc', '#003DA5', '#FFD100'], ['h', '#DA291C', '#FFFFFF', '#0032A0'], ['v', '#F77F00', '#FFFFFF', '#009E60'],
      ];
      designs.forEach(function (d, i) {
        var x = (i % 8) * 64, y = Math.floor(i / 8) * 64, c = [d[1], d[2], d[3] || d[2]];
        if (d[0] === 'h') for (var k = 0; k < 3; k++) { g.fillStyle = c[k]; g.fillRect(x, y + k * 64 / 3, 64, 64 / 3 + 1); }
        else if (d[0] === 'v') for (k = 0; k < 3; k++) { g.fillStyle = c[k]; g.fillRect(x + k * 64 / 3, y, 64 / 3 + 1, 64); }
        else if (d[0] === 'disc') { g.fillStyle = d[1]; g.fillRect(x, y, 64, 64); g.fillStyle = d[2]; g.beginPath(); g.arc(x + 30, y + 32, 13, 0, TAU); g.fill(); }
        else { g.fillStyle = d[1]; g.fillRect(x, y, 64, 64); g.fillStyle = d[2]; g.fillRect(x + 18, y, 10, 64); g.fillRect(x, y + 27, 64, 10); }
      });
    });
    flags.wrapS = flags.wrapT = THREE.ClampToEdgeWrapping;
    var flagGeo = new THREE.PlaneGeometry(3, 2, 10, 4); flagGeo.translate(1.5, 0, 0);
    var nFlags = arches + 1, fIdx = new Float32Array(nFlags), fPh = new Float32Array(nFlags);
    for (i = 0; i < nFlags; i++) { fIdx[i] = Math.floor(R() * 32); fPh[i] = R() * 6; }
    flagGeo.setAttribute('aFlag', new THREE.InstancedBufferAttribute(fIdx, 1));
    flagGeo.setAttribute('aPh', new THREE.InstancedBufferAttribute(fPh, 1));
    var flagMat = new THREE.MeshStandardMaterial({ map: flags, side: THREE.DoubleSide, roughness: 0.8 });
    flagMat.onBeforeCompile = function (sh) {
      sh.uniforms.uTime = U.time;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aFlag;\nattribute float aPh;\nuniform float uTime;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\nvMapUv = vec2((uv.x + mod(aFlag, 8.0)) / 8.0, (uv.y + 3.0 - floor(aFlag / 8.0)) / 4.0);')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nfloat fw = position.x / 3.0;\ntransformed.z += sin(position.x * 2.1 - uTime * 6.5 + aPh) * 0.28 * fw;\ntransformed.y += sin(position.x * 1.3 - uTime * 4.0 + aPh) * 0.08 * fw;');
    };
    var polePos = [];
    for (i = 0; i < nFlags; i++) { var fa = a0 - i / arches * (a0 - a1); polePos.push([HX + Math.cos(fa) * (COLONNADE_R - 1.4), Math.sin(fa) * (COLONNADE_R - 1.4), fa]); }
    var flagsMesh = ctx.instanced(flagGeo, flagMat, nFlags, function (n, d) { d.position.set(polePos[n][0], DECK_H + 21.4 + 4.6, polePos[n][1]); d.rotation.y = -polePos[n][2] + PI; });
    flagsMesh.frustumCulled = false;
    var poles = ctx.instanced(new THREE.CylinderGeometry(0.06, 0.08, 6, 6).translate(0, 3, 0), new THREE.MeshStandardMaterial({ color: '#E8E4DA', metalness: 0.6, roughness: 0.3 }), nFlags,
      function (n, d) { d.position.set(polePos[n][0], DECK_H + 21.4, polePos[n][1]); });
    scene.add(flagsMesh, poles);
  }

  /* -------------------------------------------------------------- rim -- */
  function buildRim(ctx) {
    var THREE = ctx.THREE, scene = ctx.scene;
    var spots = [], o = {}, R0 = UPP.r1 + 0.9, base = UPP.h1 + 1.4;
    var qs = qList(EAST_OPEN[1] + 0.02, 4 + EAST_OPEN[0] - 0.02, 8, 3);
    qs.forEach(function (q) { ovalQ(R0, q, o); spots.push([o.x, o.z, Math.atan2(-o.nx, -o.nz)]); });
    var masts = ctx.instanced(new THREE.BoxGeometry(0.8, 11, 0.8).translate(0, 5.5, 0), new THREE.MeshStandardMaterial({ color: '#3A3F48', metalness: 0.5, roughness: 0.5 }), spots.length,
      function (n, d) { d.position.set(spots[n][0], base, spots[n][1]); });
    var heads = ctx.instanced(new THREE.BoxGeometry(7.6, 3.6, 1).translate(0, 0, -0.5), new THREE.MeshStandardMaterial({ color: '#2B2F36', metalness: 0.4, roughness: 0.6 }), spots.length,
      function (n, d) { d.position.set(spots[n][0], base + 11.5, spots[n][1]); d.rotation.set(0.42, spots[n][2], 0, 'YXZ'); });
    var lamps = ctx.textures.canvas(128, 64, function (g, w, h) {
      g.fillStyle = '#1A1A1A'; g.fillRect(0, 0, w, h);
      for (var y = 0; y < 3; y++) for (var x = 0; x < 7; x++) { var gr = g.createRadialGradient(x * 18 + 10, y * 21 + 11, 1, x * 18 + 10, y * 21 + 11, 9); gr.addColorStop(0, '#FFFFFF'); gr.addColorStop(0.6, '#FFF1D8'); gr.addColorStop(1, '#2A2A2A'); g.fillStyle = gr; g.fillRect(x * 18 + 1, y * 21 + 2, 18, 19); }
    });
    var panels = ctx.instanced(new THREE.PlaneGeometry(7.2, 3.2).translate(0, 0, 0.02), new THREE.MeshStandardMaterial({ color: '#111111', emissive: '#FFF3E0', emissiveMap: lamps, emissiveIntensity: 6 }), spots.length,
      function (n, d) { d.position.set(spots[n][0], base + 11.5, spots[n][1]); d.rotation.set(0.42, spots[n][2], 0, 'YXZ'); });
    scene.add(masts, heads, panels);
  }

  /* ----------------------------------------------------------- screen -- */
  function buildScreen(ctx) {
    var THREE = ctx.THREE, scene = ctx.scene;
    var names = [PLAYER].concat(RIVALS.slice(0, 8));
    var tex = ctx.textures.canvas(1024, 440, function (g, w, h) {
      var bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#101A33'); bg.addColorStop(1, '#070B16');
      g.fillStyle = bg; g.fillRect(0, 0, w, h);
      // an emblem: a striped sun going down behind two palms
      var sx = 150, sy = 150, sr = 92, sg = g.createLinearGradient(0, sy - sr, 0, sy + sr);
      sg.addColorStop(0, '#FFD36B'); sg.addColorStop(0.55, '#FF7A3D'); sg.addColorStop(1, '#E0337A');
      g.save(); g.beginPath(); g.arc(sx, sy, sr, 0, TAU); g.clip(); g.fillStyle = sg; g.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);
      g.fillStyle = '#101A33'; for (var k = 0; k < 6; k++) g.fillRect(sx - sr, sy + 18 + k * 13, sr * 2, 3 + k);
      g.restore();
      g.fillStyle = '#070B16';
      [[sx - 38, 1], [sx + 44, -1]].forEach(function (p) {
        g.fillRect(p[0] - 3, sy - 40, 6, 135);
        for (var f = 0; f < 7; f++) { g.save(); g.translate(p[0], sy - 40); g.rotate(-PI / 2 + (f - 3) * 0.42 * p[1]); g.beginPath(); g.ellipse(26, 0, 30, 6, 0.25, 0, TAU); g.fill(); g.restore(); }
      });
      g.fillStyle = '#FFF6EA'; g.textBaseline = 'alphabetic';
      g.font = '800 70px "Helvetica Neue", Arial, sans-serif'; g.fillText('LOS ANGELES', 290, 118);
      g.fillStyle = '#FF7A3D'; g.fillText('2028', 290, 190);
      g.fillStyle = '#FFF6EA'; g.font = '700 30px "Helvetica Neue", Arial, sans-serif'; g.fillText("MEN'S 400M  FINAL  STADIUM", 290, 240);
      g.fillStyle = '#E0332F'; g.beginPath(); g.arc(880, 70, 12, 0, TAU); g.fill();
      g.fillStyle = '#FFF6EA'; g.font = '800 34px "Helvetica Neue", Arial, sans-serif'; g.fillText('LIVE', 900, 82);
      g.font = '700 24px "Helvetica Neue", Arial, sans-serif';
      names.forEach(function (k, i) {
        var x = 60 + (i % 3) * 320, y = 300 + Math.floor(i / 3) * 40;
        g.fillStyle = k.top; g.fillRect(x, y - 20, 26, 26);
        g.fillStyle = '#FFF6EA'; g.fillText((i + 1) + '  ' + k.name + '  ' + k.code, x + 38, y);
      });
    });
    var sw = 36, sh = sw * 440 / 1024, x = -HX - UPP.r1 - 4, y0 = UPP.h1 + 3;
    var screen = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), new THREE.MeshStandardMaterial({ color: '#000000', emissive: '#FFFFFF', emissiveMap: tex, emissiveIntensity: 1.25, roughness: 0.4 }));
    screen.position.set(x, y0 + sh / 2, 0); screen.rotation.y = PI / 2;
    var frame = new THREE.Mesh(merge(THREE, [
      box(THREE, 1.2, sh + 1.6, sw + 1.6, x - 0.7, y0 + sh / 2, 0, '#1B1E25'),
      box(THREE, 1, y0 + 2, 1.2, x - 1.2, (y0 + 2) / 2, -sw * 0.3, '#2A2E36'), box(THREE, 1, y0 + 2, 1.2, x - 1.2, (y0 + 2) / 2, sw * 0.3, '#2A2E36'),
    ]), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.3 }));
    // a ticker along the bottom
    var ticker = ctx.textures.canvas(2048, 64, function (g, w, h) {
      g.fillStyle = '#F2553A'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#FFF6EA'; g.font = '800 34px "Helvetica Neue", Arial, sans-serif'; g.textBaseline = 'middle';
      g.fillText('GOLDEN HOUR IN LOS ANGELES     60,000 IN THE STADIUM     EVERY LAP A NEW RIVAL     GRAB THE GM     THE FINAL NEVER ENDS     ', 20, h / 2 + 2);
    });
    var tick = new THREE.Mesh(new THREE.PlaneGeometry(sw, 1.6), new THREE.MeshStandardMaterial({ color: '#000000', emissive: '#FFFFFF', emissiveMap: ticker, emissiveIntensity: 1.3 }));
    tick.position.set(x + 0.02, y0 + 0.8, 0); tick.rotation.y = PI / 2;
    scene.add(screen, frame, tick);
    W.ticker = ticker;
  }

  /* ----------------------------------------------------------- beyond -- */
  // what shows through the arches and over the rim: palms, downtown, a blimp
  function buildBeyond(ctx) {
    var THREE = ctx.THREE, scene = ctx.scene, R = ctx.random;
    var palms = [];
    for (var i = 0; i < 26; i++) { var a = (R() - 0.5) * 2.3, r = COLONNADE_R + 14 + R() * 40; palms.push([HX + Math.cos(a) * r, Math.sin(a) * r, 16 + R() * 12, (R() - 0.5) * 0.12, R() * TAU]); }
    var trunk = new THREE.CylinderGeometry(0.22, 0.4, 1, 7, 1).translate(0, 0.5, 0);
    var fronds = [];
    for (var f = 0; f < 11; f++) {
      var leaf = new THREE.PlaneGeometry(5.2, 0.9, 6, 1); leaf.rotateX(-PI / 2); leaf.translate(2.6, 0, 0);
      var pos = leaf.attributes.position;
      for (var v = 0; v < pos.count; v++) { var x = pos.getX(v); pos.setY(v, x * 0.35 - Math.pow(x / 5.2, 2) * 2.4); }
      leaf.rotateY(f / 11 * TAU + R() * 0.3);
      fronds.push(leaf);
    }
    var crown = merge(THREE, fronds); crown.computeVertexNormals();
    scene.add(ctx.instanced(trunk, new THREE.MeshStandardMaterial({ color: '#6E5A44', roughness: 0.9 }), palms.length, function (n, d) { var p = palms[n]; d.position.set(p[0], 0, p[1]); d.scale.set(1, p[2], 1); d.rotation.z = p[3]; }));
    scene.add(ctx.instanced(crown, new THREE.MeshStandardMaterial({ color: '#3F6128', roughness: 0.8, side: THREE.DoubleSide }), palms.length, function (n, d) { var p = palms[n]; d.position.set(p[0] + Math.sin(-p[3]) * p[2], p[2], p[1]); d.rotation.y = p[4]; }));

    // downtown, hazy in the distance past the colonnade
    var win = ctx.textures.canvas(128, 256, function (g, w, h) {
      g.fillStyle = '#3F4C5E'; g.fillRect(0, 0, w, h);
      for (var y = 2; y < h; y += 8) for (var x = 2; x < w; x += 8) { g.fillStyle = R() < 0.5 ? '#6F8196' : '#566579'; g.fillRect(x, y, 6, 5); }
    });
    var lit = ctx.textures.canvas(128, 256, function (g, w, h) {
      g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
      for (var y = 2; y < h; y += 8) for (var x = 2; x < w; x += 8) if (R() < 0.22) { g.fillStyle = '#FFD9A0'; g.fillRect(x, y, 6, 5); }
    });
    var towers = [];
    for (i = 0; i < 34; i++) { var ta = 0.1 + (R() - 0.5) * 0.7, tr = 950 + R() * 600, th = 50 + Math.pow(R(), 2) * 270; towers.push([Math.cos(ta) * tr, Math.sin(ta) * tr, 22 + R() * 34, th, 22 + R() * 34, R() * PI]); }
    scene.add(ctx.instanced(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ map: win, emissive: '#FFFFFF', emissiveMap: lit, emissiveIntensity: 0.5, metalness: 0.55, roughness: 0.28 }), towers.length,
      function (n, d) { var t = towers[n]; d.position.set(t[0], 0, t[1]); d.scale.set(t[2], t[3], t[4]); d.rotation.y = t[5]; }));

    // the blimp circling overhead
    var blimp = new THREE.Group();
    var hull = new THREE.Mesh(new THREE.SphereGeometry(7.5, 28, 18), new THREE.MeshStandardMaterial({ color: '#E7E4DC', metalness: 0.3, roughness: 0.4 }));
    hull.scale.set(1, 1, 3.9); blimp.add(hull);
    var fin = new THREE.MeshStandardMaterial({ color: '#F2553A', roughness: 0.5 });
    [[0, 5, 0], [0, -5, 0], [5, 0, 0], [-5, 0, 0]].forEach(function (p) { var m = new THREE.Mesh(new THREE.BoxGeometry(p[0] ? 7 : 0.5, p[1] ? 7 : 0.5, 6), fin); m.position.set(p[0], p[1], -25); blimp.add(m); });
    var gondola = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2, 7), new THREE.MeshStandardMaterial({ color: '#2B2F36' })); gondola.position.set(0, -8, 3); blimp.add(gondola);
    var sign = ctx.textures.canvas(512, 96, function (g, w, h) { g.fillStyle = '#0E1A2B'; g.fillRect(0, 0, w, h); g.fillStyle = '#F6C33B'; g.font = '900 64px "Arial Black", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('GAMEMOG', w / 2, h / 2 + 3); });
    [1, -1].forEach(function (s) {
      var m = new THREE.Mesh(new THREE.PlaneGeometry(30, 5.6), new THREE.MeshStandardMaterial({ color: '#000000', emissive: '#FFFFFF', emissiveMap: sign, emissiveIntensity: 1.6 }));
      m.position.set(s * 7.3, 0.5, 0); m.rotation.y = s * PI / 2; blimp.add(m);
    });
    blimp.position.set(520, 260, 0);
    scene.add(blimp);
    W.blimp = blimp;
  }

  // Extra shapes for the image-based light: the stands round the field and
  // the floodlights, so skin, metal and water reflect a stadium and not open sky.
  function envExtras(ctx) {
    var THREE = ctx.THREE, g = new THREE.Group();
    var bowl = new THREE.Mesh(new THREE.CylinderGeometry(95, 75, 34, 48, 1, true), new THREE.MeshBasicMaterial({ color: '#3C2F31', side: THREE.BackSide }));
    bowl.position.y = 15; g.add(bowl);
    var field = new THREE.Mesh(new THREE.CircleGeometry(78, 32), new THREE.MeshBasicMaterial({ color: '#6A4432' }));
    field.rotation.x = -PI / 2; field.position.y = -1.8; g.add(field);
    var lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(9, 8.4, 7.6), side: THREE.DoubleSide });
    for (var i = 0; i < 14; i++) {
      var a = i / 14 * TAU, m = new THREE.Mesh(new THREE.PlaneGeometry(9, 4), lampMat);
      m.position.set(Math.cos(a) * 88, 42, Math.sin(a) * 88); m.lookAt(0, 0, 0); g.add(m);
    }
    return g;
  }

  /* -------------------------------------------------------- obstacles -- */
  // Hurdles set out lane by lane, men's 400m height, and a field-equipment
  // rover that shuttles across the lanes. Every row leaves a way through.
  function obstacles(ctx) {
    var THREE = ctx.THREE, L = ctx.track.length, hw = ctx.track.halfWidth;
    var tex = ctx.textures.canvas(128, 64, function (g, w, h) {
      g.fillStyle = '#F5F4F0'; g.fillRect(0, 0, 64, h);
      g.fillStyle = '#15151A'; [4, 26, 48].forEach(function (x) { g.fillRect(x, 0, 12, h); });
      g.fillStyle = '#8C9096'; g.fillRect(64, 0, 64, h);
    });
    var hurdleMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.45, metalness: 0.3 });
    var parts = [];
    function part(g, rg) { var uv = g.attributes.uv; for (var i = 0; i < uv.count; i++) uv.setXY(i, rg[0] + uv.getX(i) * (rg[1] - rg[0]), rg[2] + uv.getY(i) * (rg[3] - rg[2])); parts.push(g); }
    var BOARD = [0, 0.5, 0, 1], METAL = [0.56, 0.94, 0.1, 0.9];
    part(box(THREE, 1.18, 0.07, 0.022, 0, 0.879, 0), BOARD);
    [-1, 1].forEach(function (s) {
      part(box(THREE, 0.028, 0.8, 0.028, s * 0.575, 0.47, -0.02), METAL);
      part(box(THREE, 0.04, 0.035, 0.7, s * 0.575, 0.02, -0.36), METAL);
      part(box(THREE, 0.07, 0.05, 0.13, s * 0.575, 0.035, -0.66), METAL);
    });
    part(box(THREE, 1.12, 0.03, 0.03, 0, 0.1, -0.02), METAL);
    var hurdleGeo = merge(THREE, parts);
    function hurdle() { var g = new THREE.Group(); g.add(new THREE.Mesh(hurdleGeo, hurdleMat)); return g; }

    var roverGeo = merge(THREE, [
      box(THREE, 0.95, 0.26, 0.62, 0, 0.3, 0, '#F2F2EE'), box(THREE, 0.55, 0.08, 0.5, 0.08, 0.47, 0, '#1E1E22'),
      box(THREE, 0.07, 0.3, 0.5, -0.28, 0.62, 0, '#FF6A2B'), box(THREE, 0.07, 0.3, 0.5, 0.36, 0.62, 0, '#FF6A2B'),
      box(THREE, 0.05, 0.9, 0.05, -0.4, 0.9, 0.25, '#2A2A2A'),
    ]);
    var roverMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.15 });
    var wheelGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.12, 14); wheelGeo.rotateX(PI / 2);
    var tyre = new THREE.MeshStandardMaterial({ color: '#18181B', roughness: 0.8 });
    function rover() {
      var g = new THREE.Group();
      g.add(new THREE.Mesh(roverGeo, roverMat));
      var wheels = [[-0.33, -0.36], [0.33, -0.36], [-0.33, 0.36], [0.33, 0.36]].map(function (p) { var w = new THREE.Mesh(wheelGeo, tyre); w.position.set(p[0], 0.16, p[1]); g.add(w); return w; });
      var beacon = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshStandardMaterial({ color: '#FF7A2B', emissive: '#FF6A1B', emissiveIntensity: 4 }));
      beacon.position.set(-0.4, 1.38, 0.25); g.add(beacon);
      return { object: g, animate: function (t) { wheels.forEach(function (w) { w.rotation.z = t * 7; }); beacon.material.emissiveIntensity = 2 + 5 * Math.max(0, Math.sin(t * 9)); } };
    }

    function laneX(i) { return -hw + LANE * (i + 0.5); }
    var ROWS = [
      [62, [3]], [84, [1, 6]], [104, [4, 8]], [122, 'rover', 0, 3.4, 4.2], [146, [0, 2, 5, 7]], [170, [3, 4]], [192, [6, 7, 8]], [210, [0, 1, 2]],
      [236, [2, 6]], [258, 'rover', 2, 2.8, 3.4], [280, [1, 4, 7]], [302, [3, 5]], [324, [0, 4, 8]], [346, [2, 3, 6]], [366, 'rover', -2, 3, 3.8],
      [388, [1, 5, 6]], [410, [3, 7]],
    ];
    var out = [], k = L / 432.6;
    ROWS.forEach(function (r) {
      var at = r[0] * k / L;
      if (r[1] === 'rover') { var rv = rover(); out.push({ at: at, x: r[2], object: rv.object, animate: rv.animate, move: { amplitude: r[3], period: r[4] } }); }
      else r[1].forEach(function (lane) { out.push({ at: at, x: laneX(lane), object: hurdle() }); });
    });
    return out;
  }

  /* ------------------------------------------------------------ update -- */
  function update(ctx, t, dt) {
    U.time.value = t;
    if (W.led) W.led.offset.x = -t * 0.01;
    if (W.ribbon) W.ribbon.offset.x = t * 0.004;
    if (W.ticker) W.ticker.offset.x = t * 0.03;
    if (W.blimp) { var a = t * 0.018 + 0.6; W.blimp.position.set(Math.cos(a) * 520, 250, Math.sin(a) * 520); W.blimp.rotation.y = -a; }
    var c = W.crowd;
    if (c && dt > 0) {
      var now = c.ac.currentTime;
      if (t > c.next) {
        // a cheer rolls round the stadium
        c.hi.gain.cancelScheduledValues(now);
        c.hi.gain.setTargetAtTime(0.5, now, 0.35);
        c.hi.gain.setTargetAtTime(0.16, now + 1.4, 1.1);
        c.next = t + 5 + Math.random() * 9;
      }
    }
  }

  function ambient(ctx) {
    var ac = ctx.audio.context, out = ctx.audio.destination;
    function pink(sec) {
      var n = Math.floor(ac.sampleRate * sec), buf = ac.createBuffer(2, n, ac.sampleRate);
      for (var ch = 0; ch < 2; ch++) {
        var d = buf.getChannelData(ch), b0 = 0, b1 = 0, b2 = 0;
        for (var i = 0; i < n; i++) { var w = Math.random() * 2 - 1; b0 = 0.99765 * b0 + w * 0.099; b1 = 0.963 * b1 + w * 0.2965; b2 = 0.57 * b2 + w * 1.0526; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.11; }
      }
      return buf;
    }
    // the crowd: a low roar and a bright top that swells for cheers
    var bed = ac.createBufferSource(); bed.buffer = pink(6); bed.loop = true;
    var lo = ac.createBiquadFilter(); lo.type = 'bandpass'; lo.frequency.value = 380; lo.Q.value = 0.55;
    var hi = ac.createBiquadFilter(); hi.type = 'bandpass'; hi.frequency.value = 1450; hi.Q.value = 0.9;
    var gLo = ac.createGain(), gHi = ac.createGain(); gLo.gain.value = 0.0001; gHi.gain.value = 0.0001;
    bed.connect(lo); lo.connect(gLo); gLo.connect(out);
    bed.connect(hi); hi.connect(gHi); gHi.connect(out);
    bed.start();
    gLo.gain.setTargetAtTime(0.6, ac.currentTime, 1.4);
    gHi.gain.setTargetAtTime(0.16, ac.currentTime, 1.4);
    // spikes on polyurethane: a short, bright tick
    var n = Math.floor(ac.sampleRate * 0.03), click = ac.createBuffer(1, n, ac.sampleRate), cd = click.getChannelData(0);
    for (var i = 0; i < n; i++) cd[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 6);
    var hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2200;
    var gStep = ac.createGain(); gStep.gain.value = 0.22; hp.connect(gStep); gStep.connect(out);
    W.crowd = { ac: ac, lo: gLo, hi: gHi, next: 3 };
    W.step = function () { var s = ac.createBufferSource(); s.buffer = click; s.playbackRate.value = 0.85 + Math.random() * 0.3; s.connect(hp); s.start(); };
  }

  /* ---------------------------------------------------------- athletes -- */
  // A sprinter is one skinned mesh: tubes of rings shaped like the muscle
  // underneath (glutes, lats, quads, hamstrings, calves, deltoids), weighted to
  // a skeleton so knees, hips and elbows bend smoothly. Skin, kit and metal.
  var UVR = { shoe: [0, 1, 0.0, 0.16], sock: [0, 1, 0.165, 0.185], trim: [0, 1, 0.19, 0.21], shorts: [0, 1, 0.22, 0.40], singlet: [0, 1, 0.42, 1.0] };
  var PLAYER = { name: 'BANKS', number: '28', code: 'USA', label: 'Banks (USA)', top: '#15264F', trim: '#D22B3A', shorts: '#15264F', shoe: '#F4C542', skin: '#6E4428', hair: '#120D0A', style: 'fade', height: 1.87, build: 1.14, pattern: 'stars' };
  var RIVALS = [
    { name: 'MENSAH', code: 'GHA', top: '#E8B420', trim: '#136B35', shorts: '#136B35', shoe: '#F5F5F5', skin: '#553520', hair: '#0E0A08', style: 'fade', height: 1.83, build: 1.02, pattern: 'band' },
    { name: 'KIPTOO', code: 'KEN', top: '#C8102E', trim: '#141414', shorts: '#141414', shoe: '#2BD17E', skin: '#45291A', hair: '#0C0907', style: 'bald', height: 1.80, build: 0.96, pattern: 'sash' },
    { name: 'LINDQVIST', code: 'SWE', top: '#2F7FD8', trim: '#F7D117', shorts: '#2F7FD8', shoe: '#F7D117', skin: '#D9AE8A', hair: '#C9A461', style: 'fade', height: 1.92, build: 1.06, pattern: 'band' },
    { name: 'CAMPBELL', code: 'JAM', top: '#1F9D55', trim: '#F9D71C', shorts: '#111111', shoe: '#F9D71C', skin: '#3B2416', hair: '#0B0806', style: 'bun', height: 1.88, build: 1.12, pattern: 'sash' },
    { name: 'DE VRIES', code: 'NED', top: '#F07D1A', trim: '#FFFFFF', shorts: '#F07D1A', shoe: '#FFFFFF', skin: '#DCAF8C', hair: '#5E3F24', style: 'fade', beard: true, height: 1.90, build: 1.10, pattern: 'plain' },
    { name: 'TANAKA', code: 'JPN', top: '#F4F4F4', trim: '#D8282F', shorts: '#D8282F', shoe: '#D8282F', skin: '#D6AB84', hair: '#120E0B', style: 'fade', height: 1.78, build: 1.06, pattern: 'band' },
    { name: 'TAUFA', code: 'NZL', top: '#161616', trim: '#FFFFFF', shorts: '#161616', shoe: '#FFFFFF', skin: '#7A4B2E', hair: '#0E0A08', style: 'curly', beard: true, height: 1.93, build: 1.22, pattern: 'plain' },
    { name: 'HADDAD', code: 'QAT', top: '#7A1F3D', trim: '#FFFFFF', shorts: '#7A1F3D', shoe: '#E6E6E6', skin: '#B5825E', hair: '#16100C', style: 'fade', beard: true, height: 1.84, build: 1.14, pattern: 'zigzag' },
    { name: 'SILVA', code: 'BRA', top: '#FFD83A', trim: '#1E9E4A', shorts: '#1F4AA8', shoe: '#1E9E4A', skin: '#8B5A3C', hair: '#120D0A', style: 'curly', height: 1.86, build: 1.16, pattern: 'band' },
    { name: 'MOREAU', code: 'FRA', top: '#1D3F9E', trim: '#E4002B', shorts: '#1D3F9E', shoe: '#FFFFFF', skin: '#6E4630', hair: '#0E0A08', style: 'bald', height: 1.89, build: 1.18, pattern: 'tricolor' },
    { name: 'KOVAC', code: 'CRO', top: '#E22C2C', trim: '#FFFFFF', shorts: '#FFFFFF', shoe: '#E22C2C', skin: '#D8AA85', hair: '#3A2A1C', style: 'fade', height: 1.95, build: 1.2, pattern: 'checker' },
    { name: 'OKAFOR', code: 'NGR', top: '#57C443', trim: '#FFFFFF', shorts: '#0F6B35', shoe: '#FFFFFF', skin: '#4A2D1C', hair: '#0C0907', style: 'curly', height: 1.91, build: 1.24, pattern: 'sash' },
  ];
  RIVALS.forEach(function (r, i) { r.number = String(1100 + i * 37); r.label = r.name.toLowerCase().replace(/\b[a-z]/g, function (c) { return c.toUpperCase(); }) + ' (' + r.code + ')'; });

  // a sprinter from the library: MakeHuman body, motion capture, painted kit
  var PATTERN = { stars: 'band', band: 'band', sash: 'sash', checker: 'checker', tricolor: 'split', zigzag: 'stripes', plain: 'plain' };
  function libraryAthlete(ctx, kit, k) {
    if (!ctx.assets || !ctx.assets.ready('human-athlete-male')) return null;
    var tone = skinKey(kit.skin);
    var r = ctx.assets.human('human-athlete-male', {
      skin: tone.key, skinTint: tone.tint, hair: kit.style === 'bald' ? 'none' : kit.style === 'curly' ? 'afro01' : kit.style === 'bun' ? 'short02' : 'short04',
      hairColor: kit.hair, eyes: tone.key === 'african' ? 'brown' : 'brownlight', height: kit.height,
      build: { muscle: clamp(0.55 + (kit.build - 0.96) * 2.5 + Math.min(k, 12) * 0.02, 0, 1), lean: clamp(0.55 - (kit.build - 0.96) * 1.5, 0, 1) },
      outfit: { top: kit.top, trim: kit.trim, shorts: kit.shorts, shoes: kit.shoe, pattern: PATTERN[kit.pattern] || 'plain', bib: { name: kit.name, number: kit.number }, bibColor: kit.code === 'USA' ? '#F4C542' : '#1C2F5E', glow: k >= 9 ? 2.4 : 0 },
      name: k === 0 ? PLAYER.label : kit.label, color: kit.top,
    });
    if (!r) return null;
    var inner = r.animate;
    r.animate = function (t, dt, s) { inner(t, dt, s); if (k === 0 && W.step && s.speed > 3) { W.stepPh = (W.stepPh || 0) + dt * s.speed / 3.1; if (W.stepPh > 1) { W.stepPh -= 1; W.step(); } } };
    return r;
  }
  // the library has four skin textures; a tint covers the tones in between
  function skinKey(hex) {
    var n = parseInt(hex.slice(1), 16), l = (((n >> 16) & 255) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11) / 255;
    if (l < 0.3) return { key: 'african', tint: l < 0.22 ? '#D8D2CE' : '#FFFFFF' };
    if (l < 0.45) return { key: 'african', tint: '#FFFFFF' };
    if (l < 0.62) return { key: 'caucasian2', tint: '#C49A7C' };
    if (hex === '#D6AB84') return { key: 'asian', tint: '#FFFFFF' };
    return { key: l < 0.7 ? 'caucasian2' : 'caucasian', tint: '#F4E6DC' };
  }

  function kitTexture(ctx, kit, emissive) {
    return ctx.textures.canvas(512, 512, function (g, w, h) {
      var E = !!emissive, trim = E ? '#FFFFFF' : kit.trim;
      function Y(v) { return (1 - v) * h; }
      function band(v0, v1, c) { g.fillStyle = c; g.fillRect(0, Y(v1), w, Y(v0) - Y(v1)); }
      band(0, 1, E ? '#000000' : kit.top);
      // singlet
      g.fillStyle = trim;
      if (kit.pattern === 'band') band(0.76, 0.84, trim);
      if (kit.pattern === 'sash') { g.save(); g.beginPath(); g.rect(0, Y(1), w, Y(0.42) - Y(1)); g.clip(); g.lineWidth = 34; g.strokeStyle = trim; g.beginPath(); g.moveTo(-40, Y(1.02)); g.lineTo(w + 40, Y(0.44)); g.stroke(); g.restore(); }
      if (kit.pattern === 'checker' && !E) { for (var cy = 0; cy < 10; cy++) for (var cx = 0; cx < 16; cx++) if ((cx + cy) % 2) g.fillRect(cx * 32, Y(1) + cy * 30, 32, 30); }
      if (kit.pattern === 'tricolor' && !E) { band(0.42, 0.61, kit.trim); band(0.61, 0.80, '#FFFFFF'); }
      if (kit.pattern === 'zigzag') { g.beginPath(); g.moveTo(0, Y(1)); for (var z = 0; z <= 9; z++) g.lineTo(z % 2 ? 60 : 30, Y(1) + z * 33); g.lineTo(0, Y(0.42)); g.fill(); }
      if (kit.pattern === 'stars') {
        band(0.88, 1, trim);
        if (!E) { g.fillStyle = '#FFFFFF'; for (var s = 0; s < 16; s++) star(g, 16 + s * 32, Y(0.94), 7); }
        g.fillStyle = trim; band(0.845, 0.865, E ? '#000000' : '#FFFFFF');
      }
      g.fillStyle = trim;
      [0.25, 0.75].forEach(function (u) { g.fillRect(u * w - 10, Y(0.88), 20, Y(0.42) - Y(0.88)); });
      if (!E) { bib(0.5 * w); bib(0); bib(w); }
      // shorts
      band(0.22, 0.40, E ? '#000000' : kit.shorts);
      g.fillStyle = trim; [0.25, 0.75].forEach(function (u) { g.fillRect(u * w - 8, Y(0.40), 16, Y(0.22) - Y(0.40)); });
      if (!E) band(0.382, 0.40, shade(kit.shorts));
      // spikes: upper, sole, plate
      band(0, 0.16, E ? '#000000' : kit.shoe);
      if (!E) {
        g.fillStyle = '#F2F2F2'; g.fillRect(w * 0.34, Y(0.16), w * 0.32, Y(0) - Y(0.16));
        g.fillStyle = '#1A1A1C'; g.fillRect(w * 0.39, Y(0.15), w * 0.22, Y(0.08) - Y(0.15));
        g.fillStyle = kit.trim; [0.2, 0.74].forEach(function (u) { g.save(); g.translate(u * w, Y(0.08)); g.rotate(-0.5); g.fillRect(-40, -6, 80, 12); g.restore(); });
        band(0.165, 0.185, '#F4F4F4');
      }
      band(0.19, 0.21, trim);
      function bib(cx) {
        var bw = 118, top = Y(0.875), bh = Y(0.61) - Y(0.875);
        g.fillStyle = '#F7F5EF'; g.fillRect(cx - bw / 2, top, bw, bh);
        g.fillStyle = kit.code === 'USA' ? '#F4C542' : '#1C2F5E'; g.fillRect(cx - bw / 2, top, bw, 12);
        g.fillStyle = '#16161A'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.font = '700 21px "Helvetica Neue", Arial, sans-serif'; g.fillText(kit.name, cx, top + 29, bw - 10);
        g.font = '900 56px "Arial Black", "Helvetica Neue", Arial, sans-serif'; g.fillText(kit.number, cx, top + 29 + (bh - 29) / 2 + 4, bw - 12);
      }
    });
  }
  function shade(hex) { var n = parseInt(hex.slice(1), 16), f = 0.72; return 'rgb(' + Math.round((n >> 16) * f) + ',' + Math.round(((n >> 8) & 255) * f) + ',' + Math.round((n & 255) * f) + ')'; }
  function star(g, x, y, r) { g.beginPath(); for (var i = 0; i < 10; i++) { var a = -PI / 2 + i * PI / 5, rr = i % 2 ? r * 0.45 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.closePath(); g.fill(); }

  function Body(THREE) { this.T = THREE; this.pos = []; this.nor = []; this.uv = []; this.col = []; this.si = []; this.sw = []; this.g = { skin: [], cloth: [], metal: [] }; }
  var WHITE = [1, 1, 1];
  // a tube of elliptical rings from a to b; keys [t, rx, rz, cx, cz]; bulges swell it where muscle sits
  Body.prototype.tube = function (o) {
    var T = this.T, V = T.Vector3, self = this;
    var a = o.a, axis = new V().subVectors(o.b, a), len = axis.length(); axis.divideScalar(len);
    var front = o.front ? o.front.clone() : new V(0, 0, 1);
    front.addScaledVector(axis, -front.dot(axis)).normalize();
    var side = new V().crossVectors(front, axis).normalize();
    var seg = o.seg || 16, keys = o.keys, nr = o.rings || 12;
    var bands = o.bands || [{ t0: 0, t1: 1, group: 'skin', uv: [0, 1, 0, 1] }];
    var ts = [];
    for (var i = 0; i <= nr; i++) ts.push(i / nr);
    bands.forEach(function (bd) { ts.push(bd.t0, bd.t1); });
    ts.sort(function (x, y) { return x - y; });
    ts = ts.filter(function (t, i) { return t >= 0 && t <= 1 && (i === 0 || t - ts[i - 1] > 1e-4); });
    var bul = (o.bulges || []).map(function (b) { var d = b.dir.clone().normalize(); return { th: Math.atan2(d.dot(front), d.dot(side)), amt: b.amt, t: b.t, w: b.w, p: b.p || 2 }; });
    function spline(t, c) {
      var k = 0; while (k < keys.length - 2 && keys[k + 1][0] < t) k++;
      var i0 = Math.max(0, k - 1), i1 = k, i2 = Math.min(keys.length - 1, k + 1), i3 = Math.min(keys.length - 1, k + 2);
      var t1 = keys[i1][0], t2 = keys[i2][0], dt = (t2 - t1) || 1e-6, v1 = keys[i1][c] || 0, v2 = keys[i2][c] || 0;
      var m1 = ((keys[i2][c] || 0) - (keys[i0][c] || 0)) / ((keys[i2][0] - keys[i0][0]) || 1e-6);
      var m2 = ((keys[i3][c] || 0) - (keys[i1][c] || 0)) / ((keys[i3][0] - keys[i1][0]) || 1e-6);
      var f = clamp((t - t1) / dt, 0, 1), f2 = f * f, f3 = f2 * f;
      return (2 * f3 - 3 * f2 + 1) * v1 + (f3 - 2 * f2 + f) * dt * m1 + (3 * f2 - 2 * f3) * v2 + (f3 - f2) * dt * m2;
    }
    var G = [], C = [], N = [];
    for (var r = 0; r < ts.length; r++) {
      var t = ts[r], rx = Math.max(0, spline(t, 1)), rz = Math.max(0, spline(t, 2));
      var c = new V().copy(a).addScaledVector(axis, t * len).addScaledVector(side, spline(t, 3)).addScaledVector(front, spline(t, 4));
      C.push(c);
      var row = [];
      for (var j = 0; j <= seg; j++) {
        var th = -1.5 * PI + TAU * j / seg, ct = Math.cos(th), st = Math.sin(th), bump = 0;
        for (var q = 0; q < bul.length; q++) {
          var B = bul[q], d = Math.abs(t - B.t);
          if (d >= B.w) continue;
          var ca = Math.cos(th - B.th); if (ca <= 0) continue;
          bump += B.amt * 0.5 * (1 + Math.cos(PI * d / B.w)) * Math.pow(ca, B.p);
        }
        var nx = ct * rz, nz = st * rx, nl = Math.hypot(nx, nz) || 1;
        row.push(new V().copy(c).addScaledVector(side, ct * rx + nx / nl * bump).addScaledVector(front, st * rz + nz / nl * bump));
      }
      G.push(row);
    }
    for (r = 0; r < ts.length; r++) {
      var nrow = [];
      for (j = 0; j <= seg; j++) {
        var jm = j === 0 ? seg - 1 : j - 1, jp = j === seg ? 1 : j + 1;
        var du = new V().subVectors(G[r][jp], G[r][jm]), dv = new V().subVectors(G[Math.min(ts.length - 1, r + 1)][j], G[Math.max(0, r - 1)][j]);
        var n = new V().crossVectors(du, dv);
        var out = new V().subVectors(G[r][j], C[r]);
        if (n.lengthSq() < 1e-14 || out.lengthSq() < 1e-12) n.copy(axis).multiplyScalar(ts[r] < 0.5 ? -1 : 1);
        else if (n.dot(out) < 0) n.negate();
        nrow.push(n.normalize());
      }
      N.push(nrow);
    }
    var rm = Math.min(ts.length - 2, Math.floor(ts.length / 2));
    var fn = new V().crossVectors(new V().subVectors(G[rm][1], G[rm][0]), new V().subVectors(G[rm + 1][0], G[rm][0]));
    var flip = fn.dot(new V().subVectors(G[rm][0], C[rm])) < 0;
    bands.forEach(function (bd) {
      var rows = []; for (var r = 0; r < ts.length; r++) if (ts[r] >= bd.t0 - 1e-6 && ts[r] <= bd.t1 + 1e-6) rows.push(r);
      var base = self.pos.length / 3;
      rows.forEach(function (r) {
        var t = ts[r], w = o.weights(t), v = bd.uv[2] + (bd.t1 > bd.t0 ? (t - bd.t0) / (bd.t1 - bd.t0) : 0) * (bd.uv[3] - bd.uv[2]);
        for (var j = 0; j <= seg; j++) {
          var p = G[r][j], n = N[r][j], cc = bd.color ? bd.color(t, n) : WHITE;
          self.pos.push(p.x, p.y, p.z); self.nor.push(n.x, n.y, n.z);
          self.uv.push(bd.uv[0] + j / seg * (bd.uv[1] - bd.uv[0]), v);
          self.col.push(cc[0], cc[1], cc[2]);
          self.si.push(w[0], w[1], 0, 0); self.sw.push(1 - w[2], w[2], 0, 0);
        }
      });
      var grp = self.g[bd.group];
      for (var ri = 0; ri < rows.length - 1; ri++) for (var j = 0; j < seg; j++) {
        var i0 = base + ri * (seg + 1) + j, i1 = i0 + 1, i2 = i0 + seg + 1, i3 = i2 + 1;
        if (flip) grp.push(i0, i2, i1, i1, i2, i3); else grp.push(i0, i1, i2, i1, i3, i2);
      }
    });
  };
  // a small ellipsoid (eyes, shades, a bun, chain links)
  Body.prototype.blob = function (c, rx, ry, rz, group, weights, color) {
    var V = this.T.Vector3;
    this.tube({ a: new V(c.x, c.y - ry, c.z), b: new V(c.x, c.y + ry, c.z), seg: 10, rings: 6, weights: weights,
      keys: [[0, 0, 0], [0.15, rx * 0.72, rz * 0.72], [0.5, rx, rz], [0.85, rx * 0.72, rz * 0.72], [1, 0, 0]],
      bands: [{ t0: 0, t1: 1, group: group, uv: [0, 1, 0.195, 0.205], color: color ? function () { return color; } : null }] });
  };
  Body.prototype.mesh = function (skeleton, mats) {
    var T = this.T, g = new T.BufferGeometry(), self = this, idx = [];
    g.setAttribute('position', new T.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new T.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new T.Float32BufferAttribute(this.col, 3));
    g.setAttribute('skinIndex', new T.Uint16BufferAttribute(this.si, 4));
    g.setAttribute('skinWeight', new T.Float32BufferAttribute(this.sw, 4));
    ['skin', 'cloth', 'metal'].forEach(function (name, mi) { var arr = self.g[name]; if (!arr.length) return; g.addGroup(idx.length, arr.length, mi); for (var i = 0; i < arr.length; i++) idx.push(arr[i]); });
    g.setIndex(idx);
    var mesh = new T.SkinnedMesh(g, mats);
    mesh.bind(skeleton);
    mesh.frustumCulled = false; mesh.castShadow = true; mesh.receiveShadow = true;
    return mesh;
  };

  var LEGK = [0, 0.10, 0.22, 0.32, 0.45, 0.58, 0.70, 0.82, 0.92];
  var HIPV = [28, 8, -18, -22, 8, 52, 68, 58, 40];
  var KNEEV = [22, 38, 25, 70, 125, 105, 60, 25, 18];
  var ANKV = [0, 8, -30, -20, 10, 20, 15, 5, 0];
  function cyc(vals, p) {
    p -= Math.floor(p);
    var n = LEGK.length, i = n - 1;
    for (var k = 1; k < n; k++) if (LEGK[k] > p) { i = k - 1; break; }
    var i1 = (i + 1) % n, k0 = LEGK[i], k1 = i1 === 0 ? 1 : LEGK[i1], f = (p - k0) / (k1 - k0);
    var v0 = vals[(i + n - 1) % n], v1 = vals[i], v2 = vals[i1], v3 = vals[(i1 + 1) % n], f2 = f * f, f3 = f2 * f;
    return 0.5 * (2 * v1 + (v2 - v0) * f + (2 * v0 - 5 * v1 + 4 * v2 - v3) * f2 + (3 * v1 - v0 - 3 * v2 + v3) * f3);
  }

  function athlete(ctx, kit, k) {
    var THREE = ctx.THREE, V = THREE.Vector3, R = ctx.random;
    var H = kit.height / 1.85, m = kit.build * (1 + Math.min(0.12, Math.max(0, k - 1) * 0.012)), g = 0.92 + 0.14 * m, ga = 0.9 + 0.24 * m;
    var root = new THREE.Group(), bones = [], by = {};
    function bone(name, parent, x, y, z) { var b = new THREE.Bone(); b.name = name; b.position.set(x * H, y * H, z * H); (parent ? by[parent] : root).add(b); by[name] = b; b.userData.i = bones.length; bones.push(b); }
    bone('hips', null, 0, 1.0, 0);
    bone('spine', 'hips', 0, 0.12, 0);
    bone('chest', 'spine', 0, 0.18, 0);
    bone('neck', 'chest', 0, 0.21, -0.01);
    bone('head', 'neck', 0, 0.10, 0.01);
    [1, -1].forEach(function (sx) {
      var S = sx > 0 ? 'L' : 'R';
      bone('arm' + S, 'chest', 0.215 * sx, 0.17, -0.005);
      bone('fore' + S, 'arm' + S, 0.02 * sx, -0.30, -0.005);
      bone('hand' + S, 'fore' + S, 0.005 * sx, -0.25, 0.01);
      bone('thigh' + S, 'hips', 0.095 * sx, -0.02, 0);
      bone('shin' + S, 'thigh' + S, 0, -0.45, 0);
      bone('foot' + S, 'shin' + S, 0, -0.445, 0);
    });
    root.updateMatrixWorld(true);
    function at(name, dx, dy, dz) { var v = new V(); by[name].getWorldPosition(v); return v.add(new V((dx || 0) * H, (dy || 0) * H, (dz || 0) * H)); }
    function I(name) { return by[name].userData.i; }
    function sm(x) { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); }
    function rigid(name) { var i = I(name); return function () { return [i, i, 0]; }; }
    function jointW(name, parent, t0, w0) { var i = I(name), p = I(parent); return function (t) { return [i, p, t < t0 ? w0 * sm(1 - t / t0) : 0]; }; }
    function sc(keys, sx) { return keys.map(function (k) { return [k[0], k[1] * H * sx, k[2] * H * sx, (k[3] || 0) * H, (k[4] || 0) * H]; }); }
    var body = new Body(THREE), X = new V(1, 0, 0), Z = new V(0, 0, 1), BK = new V(0, 0, -1);

    var skin = new THREE.Color(kit.skin), hairC = new THREE.Color(kit.hair);
    var hairRatio = [Math.min(1, hairC.r / skin.r), Math.min(1, hairC.g / skin.g), Math.min(1, hairC.b / skin.b)];
    var beardRatio = hairRatio.map(function (v) { return lerp(v, 1, 0.25); });

    // torso: crotch to the base of the neck
    var hipsI = I('hips'), spineI = I('spine'), chestI = I('chest'), neckI = I('neck'), wl = 0.9 + 0.16 * m;
    body.tube({
      a: new V(0, 0.90 * H, 0), b: new V(0, 1.56 * H, 0), seg: 26, rings: 26,
      keys: sc([[0, 0.07, 0.06], [0.045, 0.15, 0.105, 0, -0.005], [0.106, 0.172, 0.118, 0, -0.012], [0.182, 0.168, 0.112, 0, -0.004], [0.273, 0.146, 0.1, 0, 0.008],
        [0.364, 0.15, 0.102, 0, 0.01], [0.47, 0.17, 0.108, 0, 0.012], [0.576, 0.19 * wl, 0.118, 0, 0.014], [0.682, 0.203 * wl, 0.124, 0, 0.012], [0.773, 0.2 * wl, 0.118, 0, 0.004],
        [0.848, 0.172 * wl, 0.102, 0, -0.006], [0.909, 0.11, 0.08, 0, -0.012], [0.962, 0.066, 0.062, 0, -0.01], [1, 0.06, 0.058, 0, -0.008]], 1),
      bulges: [
        { dir: new V(0.45, 0, -1), amt: 0.02 * m * H, t: 0.12, w: 0.09, p: 3 }, { dir: new V(-0.45, 0, -1), amt: 0.02 * m * H, t: 0.12, w: 0.09, p: 3 },
        { dir: new V(0.5, 0, 1), amt: 0.018 * m * H, t: 0.69, w: 0.08, p: 3 }, { dir: new V(-0.5, 0, 1), amt: 0.018 * m * H, t: 0.69, w: 0.08, p: 3 },
        { dir: BK, amt: -0.007 * H, t: 0.55, w: 0.3, p: 40 },
        { dir: new V(0.6, 0, -1), amt: 0.012 * m * H, t: 0.72, w: 0.08, p: 3 }, { dir: new V(-0.6, 0, -1), amt: 0.012 * m * H, t: 0.72, w: 0.08, p: 3 },
        { dir: BK, amt: 0.02 * m * H, t: 0.88, w: 0.07, p: 1.5 },
        { dir: new V(1, 0, -0.3), amt: 0.012 * m * H, t: 0.6, w: 0.12 }, { dir: new V(-1, 0, -0.3), amt: 0.012 * m * H, t: 0.6, w: 0.12 },
      ],
      bands: [{ t0: 0, t1: 0.273, group: 'cloth', uv: [0, 1, 0.31, 0.40] }, { t0: 0.273, t1: 0.848, group: 'cloth', uv: UVR.singlet }, { t0: 0.848, t1: 1, group: 'skin', uv: [0, 1, 0, 1] }],
      weights: function (t) {
        var y = 0.9 + t * 0.66;
        if (y < 1.04) return [hipsI, hipsI, 0];
        if (y < 1.16) return [hipsI, spineI, sm((y - 1.04) / 0.12)];
        if (y < 1.26) return [spineI, spineI, 0];
        if (y < 1.36) return [spineI, chestI, sm((y - 1.26) / 0.1)];
        if (y < 1.5) return [chestI, chestI, 0];
        return [chestI, neckI, 0.5 * sm((y - 1.5) / 0.06)];
      },
    });
    // neck and head
    body.tube({ a: at('neck', 0, -0.02, -0.005), b: at('head', 0, 0.02, 0), seg: 18, rings: 6,
      keys: sc([[0, 0.068, 0.064], [0.4, 0.058, 0.058, 0, 0.004], [1, 0.054, 0.056, 0, 0.006]], g),
      bulges: [{ dir: new V(0.6, 0, 1), amt: 0.006 * H, t: 0.5, w: 0.4 }, { dir: new V(-0.6, 0, 1), amt: 0.006 * H, t: 0.5, w: 0.4 }],
      weights: function (t) { return t < 0.4 ? [neckI, chestI, 0.5 * sm(1 - t / 0.4)] : t > 0.7 ? [neckI, I('head'), 0.5 * sm((t - 0.7) / 0.3)] : [neckI, neckI, 0]; } });
    var style = kit.style;
    function hairAt(t, n) {
      var fz = n.z;
      if (style !== 'bald') {
        var line = fz > 0.35 ? (style === 'curly' ? 0.74 : 0.8) : (style === 'curly' ? 0.5 : 0.55) + 0.08 * Math.max(0, fz);
        var ear = Math.abs(n.x) > 0.8 && t < 0.62;
        if (t > line && !ear) return hairRatio;
      }
      if (kit.beard && t > 0.03 && t < 0.34 && fz > -0.2) return beardRatio;
      return WHITE;
    }
    var headBands = [{ t0: 0, t1: 1, group: 'skin', uv: [0, 1, 0, 1], color: hairAt }];
    var headband = k >= 5 && k % 2 === 1;
    if (headband) headBands = [{ t0: 0, t1: 0.7, group: 'skin', uv: [0, 1, 0, 1], color: hairAt }, { t0: 0.7, t1: 0.78, group: 'cloth', uv: UVR.trim }, { t0: 0.78, t1: 1, group: 'skin', uv: [0, 1, 0, 1], color: hairAt }];
    body.tube({ a: at('head', 0, -0.035, 0), b: at('head', 0, 0.245, 0), seg: 24, rings: 20,
      keys: sc([[0, 0.012, 0.012, 0, 0.045], [0.06, 0.04, 0.038, 0, 0.05], [0.14, 0.058, 0.062, 0, 0.038], [0.26, 0.068, 0.082, 0, 0.022], [0.42, 0.074, 0.096, 0, 0.01],
        [0.58, 0.078, 0.101, 0, 0.002], [0.72, 0.077, 0.098, 0, -0.006], [0.84, 0.068 + (style === 'curly' ? 0.01 : 0), 0.086 + (style === 'curly' ? 0.01 : 0), 0, -0.012], [0.93, 0.05, 0.064, 0, -0.016], [1, 0.01, 0.012, 0, -0.018]], 1),
      bulges: [
        { dir: Z, amt: 0.022 * H, t: 0.45, w: 0.07, p: 40 }, { dir: Z, amt: 0.006 * H, t: 0.62, w: 0.04, p: 6 },
        { dir: new V(1, 0, -0.1), amt: 0.016 * H, t: 0.5, w: 0.07, p: 30 }, { dir: new V(-1, 0, -0.1), amt: 0.016 * H, t: 0.5, w: 0.07, p: 30 },
        { dir: BK, amt: 0.01 * H, t: 0.7, w: 0.15 }, { dir: new V(0.7, 0, 1), amt: 0.006 * H, t: 0.5, w: 0.08, p: 4 }, { dir: new V(-0.7, 0, 1), amt: 0.006 * H, t: 0.5, w: 0.08, p: 4 },
      ],
      bands: headBands, weights: rigid('head') });
    var eye = [0.03, 0.028, 0.03];
    [1, -1].forEach(function (s) { body.blob(at('head', s * 0.031, 0.128, 0.089), 0.012 * H, 0.011 * H, 0.009 * H, 'skin', rigid('head'), eye); });
    if (style === 'bun') body.blob(at('head', 0, 0.2, -0.085), 0.045 * H, 0.04 * H, 0.04 * H, 'skin', rigid('head'), hairRatio);
    if (k >= 3) body.blob(at('head', 0, 0.126, 0.095), 0.08 * H, 0.019 * H, 0.03 * H, 'metal', rigid('head'), [0.03, 0.03, 0.035]);
    if (k >= 8) for (var c = 0; c < 12; c++) { var ca = c / 12 * TAU; body.blob(at('neck', Math.cos(ca) * 0.125, -0.025 - Math.max(0, Math.sin(ca)) * 0.035, Math.sin(ca) * 0.092), 0.009 * H, 0.009 * H, 0.009 * H, 'metal', rigid('chest'), [1, 0.72, 0.28]); }

    [1, -1].forEach(function (sx) {
      var S = sx > 0 ? 'L' : 'R', OUT = new V(sx, 0, 0), IN = new V(-sx, 0, 0), sleeve = k >= 6 && sx > 0;
      // shoulder cap
      body.tube({ a: at('arm' + S, -0.015 * sx, 0.05, 0), b: at('arm' + S, 0.02 * sx, -0.16, 0), seg: 16, rings: 8,
        keys: sc([[0, 0.02, 0.02], [0.15, 0.058, 0.066, 0.004 * sx], [0.45, 0.064, 0.074, 0.01 * sx], [0.75, 0.052, 0.06, 0.005 * sx], [1, 0.03, 0.035]], 0.88 + 0.26 * m),
        bulges: [{ dir: Z, amt: 0.008 * m * H, t: 0.45, w: 0.35 }, { dir: BK, amt: 0.008 * m * H, t: 0.45, w: 0.35 }],
        weights: jointW('arm' + S, 'chest', 0.55, 0.45) });
      body.tube({ a: at('arm' + S), b: at('fore' + S, 0, -0.01, 0), seg: 16, rings: 12,
        keys: sc([[0, 0.05, 0.056], [0.2, 0.05, 0.054], [0.45, 0.048, 0.054, 0, 0.006], [0.72, 0.042, 0.046, 0, 0.004], [0.92, 0.037, 0.04], [1, 0.036, 0.038]], ga),
        bulges: [{ dir: Z, amt: 0.019 * m * H, t: 0.52, w: 0.25 }, { dir: BK, amt: 0.021 * m * H, t: 0.35, w: 0.3 }, { dir: OUT, amt: 0.007 * m * H, t: 0.5, w: 0.3 }],
        weights: jointW('arm' + S, 'chest', 0.15, 0.35) });
      body.tube({ a: at('fore' + S, 0, 0.01, 0), b: at('hand' + S), seg: 14, rings: 10,
        keys: sc([[0, 0.037, 0.04], [0.18, 0.041, 0.044, 0, 0.004], [0.45, 0.035, 0.037], [0.8, 0.026, 0.029], [1, 0.024, 0.027]], (g + ga) / 2),
        bulges: [{ dir: new V(sx, 0, 0.5), amt: 0.007 * m * H, t: 0.2, w: 0.2 }],
        weights: jointW('fore' + S, 'arm' + S, 0.14, 0.5) });
      body.tube({ a: at('hand' + S), b: at('hand' + S, 0, -0.17, 0.01), seg: 10, rings: 7,
        keys: sc([[0, 0.022, 0.028], [0.3, 0.017, 0.044], [0.65, 0.016, 0.04], [0.9, 0.013, 0.028], [1, 0.006, 0.01]], 1),
        weights: jointW('hand' + S, 'fore' + S, 0.3, 0.5) });
      // legs
      body.tube({ a: at('thigh' + S, 0, 0.06, 0), b: at('shin' + S, 0, -0.02, 0), seg: 18, rings: 16,
        keys: sc([[0, 0.08, 0.085], [0.1, 0.092, 0.097], [0.25, 0.094, 0.098, 0, 0.006], [0.45, 0.086, 0.092, 0, 0.01], [0.65, 0.074, 0.08, 0, 0.01], [0.82, 0.062, 0.064, 0, 0.006], [0.93, 0.055, 0.055, 0, 0.002], [1, 0.053, 0.052]], g),
        bulges: [
          { dir: Z, amt: 0.016 * m * H, t: 0.45, w: 0.35 }, { dir: new V(sx, 0, 0.6), amt: 0.013 * m * H, t: 0.5, w: 0.3 },
          { dir: new V(-sx, 0, 0.8), amt: 0.017 * m * H, t: 0.8, w: 0.14, p: 3 }, { dir: BK, amt: 0.016 * m * H, t: 0.45, w: 0.35 }, { dir: IN, amt: 0.006 * H, t: 0.25, w: 0.2 },
        ],
        bands: sleeve ? [{ t0: 0, t1: 1, group: 'cloth', uv: [0, 1, 0.23, 0.30] }] : [{ t0: 0, t1: 0.22, group: 'cloth', uv: [0, 1, 0.23, 0.30] }, { t0: 0.22, t1: 1, group: 'skin', uv: [0, 1, 0, 1] }],
        weights: jointW('thigh' + S, 'hips', 0.16, 0.5) });
      body.tube({ a: at('shin' + S, 0, 0.03, 0), b: at('foot' + S, 0, 0.005, 0), seg: 16, rings: 14,
        keys: sc([[0, 0.054, 0.056], [0.07, 0.052, 0.054, 0, -0.004], [0.22, 0.05, 0.05, 0, -0.012], [0.38, 0.047, 0.046, 0, -0.012], [0.6, 0.036, 0.034, 0, -0.005], [0.85, 0.029, 0.029], [1, 0.031, 0.033, 0, 0.005]], g),
        bulges: [
          { dir: new V(-sx * 0.45, 0, -1), amt: 0.027 * m * H, t: 0.28, w: 0.2, p: 3 }, { dir: new V(sx * 0.45, 0, -1), amt: 0.02 * m * H, t: 0.25, w: 0.18, p: 3 },
          { dir: new V(sx * 0.4, 0, 1), amt: 0.005 * H, t: 0.3, w: 0.25 }, { dir: Z, amt: 0.008 * H, t: 0.02, w: 0.06, p: 4 },
        ],
        bands: sleeve ? [{ t0: 0, t1: 0.9, group: 'cloth', uv: [0, 1, 0.23, 0.30] }, { t0: 0.9, t1: 1, group: 'cloth', uv: UVR.sock }] : [{ t0: 0, t1: 0.9, group: 'skin', uv: [0, 1, 0, 1] }, { t0: 0.9, t1: 1, group: 'cloth', uv: UVR.sock }],
        weights: jointW('shin' + S, 'thigh' + S, 0.12, 0.5) });
      body.tube({ a: at('foot' + S, 0, -0.03, -0.065), b: at('foot' + S, 0, -0.05, 0.19), front: new V(0, 1, 0), seg: 14, rings: 12,
        keys: sc([[0, 0.012, 0.012], [0.06, 0.036, 0.042, 0, 0.004], [0.2, 0.044, 0.05, 0, 0.008], [0.45, 0.046, 0.04, 0, 0.004], [0.7, 0.05, 0.03, 0, -0.004], [0.88, 0.042, 0.022, 0, -0.008], [1, 0.012, 0.01, 0, -0.01]], 1),
        bands: [{ t0: 0, t1: 1, group: 'cloth', uv: UVR.shoe }], weights: rigid('foot' + S) });
    });

    var skeleton = new THREE.Skeleton(bones);
    var glow = k >= 9;
    var kitTex = kitTexture(ctx, kit, false);
    var cloth = new THREE.MeshPhysicalMaterial({ map: kitTex, roughness: 0.55, sheen: 0.6, sheenRoughness: 0.5, sheenColor: new THREE.Color(kit.top).lerp(new THREE.Color('#FFFFFF'), 0.4) });
    if (glow) { cloth.emissive = new THREE.Color(kit.trim); cloth.emissiveMap = kitTexture(ctx, kit, true); cloth.emissiveIntensity = 3.2; }
    var skinMat = new THREE.MeshPhysicalMaterial({ color: kit.skin, vertexColors: true, roughness: 0.46, sheen: 0.35, sheenRoughness: 0.6, sheenColor: new THREE.Color('#FF7A5A'), clearcoat: 0.22, clearcoatRoughness: 0.35 });
    var metal = new THREE.MeshPhysicalMaterial({ vertexColors: true, metalness: 1, roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.08 });
    var mesh = body.mesh(skeleton, [skinMat, cloth, metal]);
    root.add(mesh);

    var st = { p: R(), v0: 0, drive: 0, roll: 0, yaw: null, yr: 0, crash: 0, idle: R() * 10 };
    var B = by, Vq = new V();
    function animate(t, dt, s) {
      if (s.paused || !(dt > 0)) return;
      var v = s.speed || 0;
      if (s.crashed) st.crash += dt;
      else if (st.crash) { st.crash = 0; root.rotation.set(0, 0, 0); root.position.set(0, 0, 0); }
      var acc = (v - st.v0) / dt; st.v0 = v;
      st.drive = damp(st.drive, clamp(acc / 14, 0, 1), 3, dt);
      var run = smooth(0.4, 6, v), amp = 0.55 + 0.45 * smooth(6, 22, v);
      var prev = st.p;
      st.p += v * dt / ((4.6 + 0.07 * v) * H);
      if (k === 0 && W.step && v > 3 && Math.floor(prev * 2) !== Math.floor(st.p * 2)) W.step();
      // lean into the bends, from how fast the runtime is turning us
      var car = root.parent;
      if (car) {
        Vq.set(0, 0, 1).applyQuaternion(car.quaternion);
        var yaw = Math.atan2(Vq.x, Vq.z);
        if (st.yaw !== null) { var dy = yaw - st.yaw; if (dy > PI) dy -= TAU; if (dy < -PI) dy += TAU; st.yr = damp(st.yr, dy / dt, 6, dt); }
        st.yaw = yaw;
      }
      st.roll = damp(st.roll, clamp(-st.yr * v * 0.02 - (s.lateral || 0) * 0.012, -0.26, 0.26), 5, dt);

      var p = st.p, hR = cyc(HIPV, p), kR = cyc(KNEEV, p), aR = cyc(ANKV, p), hL = cyc(HIPV, p + 0.5), kL = cyc(KNEEV, p + 0.5), aL = cyc(ANKV, p + 0.5);
      function A(x) { return 20 + (x - 20) * amp; }
      var ib = Math.sin((t + st.idle) * 3.2);
      var lean = lerp(0.04, 0.12 + 0.38 * st.drive, run);
      var bob = lerp(-0.035 + ib * 0.008, -0.02 - 0.035 * Math.cos(4 * PI * (p - 0.1)) * amp, run);
      B.hips.position.y = (1.0 + bob) * H;
      B.hips.rotation.set(0, run * 0.11 * (A(hR) - A(hL)) / 90, run * 0.04 * Math.sin(TAU * p));
      B.spine.rotation.set(lean * 0.45, -run * 0.07 * (hR - hL) / 90, 0);
      B.chest.rotation.set(lean * 0.35, -run * 0.1 * (hR - hL) / 90, 0);
      B.neck.rotation.x = -lean * 0.4; B.head.rotation.x = -lean * 0.3;
      legs('R', hR, kR, aR); legs('L', hL, kL, aL);
      arms('R', hR, 1); arms('L', hL, -1);
      function legs(S, h, kn, an) {
        B['thigh' + S].rotation.set(-lerp(8 + ib * 2, A(h), run) * DEG, 0, (S === 'L' ? 1 : -1) * 0.03);
        B['shin' + S].rotation.x = lerp(14 + ib * 5, kn * (0.6 + 0.4 * amp), run) * DEG;
        B['foot' + S].rotation.x = -lerp(6, an, run) * DEG;
      }
      function arms(S, h, sgn) {
        var sh = clamp(-1.3 * (A(h) - 22), -65, 80), el = 88 + 0.3 * sh;
        B['arm' + S].rotation.set(-lerp(6 + ib * 2, sh, run) * DEG, 0, (S === 'L' ? 1 : -1) * lerp(0.08, 0.14, run));
        B['fore' + S].rotation.x = -lerp(18, el, run) * DEG;
        B['hand' + S].rotation.x = -10 * DEG;
      }
      root.rotation.set(run * st.drive * 0.28, 0, st.roll);
      if (st.crash) {
        var fall = Math.min(1, st.crash * 3.2);
        root.rotation.x = fall * 1.3; root.position.set(0, -fall * 0.05, fall * 0.5);
        B.armL.rotation.x = B.armR.rotation.x = -lerp(0, 150, fall) * DEG;
        B.foreL.rotation.x = B.foreR.rotation.x = -20 * DEG;
        B.thighL.rotation.x = 15 * DEG * fall; B.thighR.rotation.x = -25 * DEG * fall;
        B.shinL.rotation.x = 40 * DEG; B.shinR.rotation.x = 70 * DEG;
      }
    }
    return { object: root, name: k === 0 ? PLAYER.label : kit.label, color: kit.top, animate: animate };
  }
})();
