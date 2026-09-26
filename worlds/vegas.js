// Las Vegas Night GP
//
// A first-party GameMog world: endless laps of a street circuit laid through
// the Las Vegas Strip at night. Off the grid on the pit straight, a hard left
// up the long back straight past the Sphere, round it and west to the Strip,
// then flat out south down the Strip itself between the resorts (the
// fountains, a half-size Eiffel Tower, a volcano, a bell tower, a wheel of
// light, pylons of neon, a pyramid's beam in the sky) to the hairpin at the
// Welcome sign and the chicane back to the line. It has rained: the street is
// wet, and every light in the city lies in it.
//
// You drive a silver hypercar. The field: single-seaters, stock cars and
// monster trucks, one more every lap, faster and meaner (the later ones glow
// underneath and grow spikes). The platform's options this world turns on:
// play.vehicle (cars: 2.2 times a runner's speed on a lap up to 2 km, the
// owner's "car speeds, same rhythm", 25 Sep 2026), live reflections, speed
// blur, and a recorded track (music-hyper-ultra-racing, CC0, by cynicmusic).
// The road is scanned race-track asphalt from the library (Poly Haven, CC0).
//
// Everything else is built here in code. No brand is copied: the cars follow
// their class, not a maker, and the resorts are their landmark shapes with
// made-up names. The Welcome sign's design is in the public domain.
(function () {
  'use strict';

  /* ------------------------------------------------------------ helpers -- */
  function rng(seed) { var s = seed >>> 0; return function () { s = (s + 0x6d2b79f5) >>> 0; var t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smooth(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }

  /* --------------------------------------------------------- the circuit -- */
  // Street corners (x east, z south, metres) with the radius each corner is
  // taken at, in the order they are driven: the pit straight east on
  // Harmon, left up Koval, the kink, round the Sphere, west on Sands, left
  // down the Strip, the hairpin at its south end, and the chicane home. The
  // corners are filleted and the loop resampled at even steps, so the
  // runtime's spline runs smoothly through it.
  var CORNERS = [[330, 250, 34], [345, -40, 120], [320, -300, 90], [240, -470, 60], [40, -480, 40], [20, 220, 38], [130, 262, 34], [185, 238, 34]];
  function route(V, step, startAt) {
    var n = V.length, path = [], i, k;
    for (i = 0; i < n; i++) {
      var a = V[(i + n - 1) % n], b = V[i], c = V[(i + 1) % n], r = b[2];
      var l1 = Math.hypot(b[0] - a[0], b[1] - a[1]), l2 = Math.hypot(c[0] - b[0], c[1] - b[1]);
      var d1 = [(b[0] - a[0]) / l1, (b[1] - a[1]) / l1], d2 = [(c[0] - b[0]) / l2, (c[1] - b[1]) / l2];
      var th = Math.atan2(d1[0] * d2[1] - d1[1] * d2[0], d1[0] * d2[0] + d1[1] * d2[1]), tl = r * Math.tan(Math.abs(th) / 2);
      var p1 = [b[0] - d1[0] * tl, b[1] - d1[1] * tl], nr = th > 0 ? [-d1[1], d1[0]] : [d1[1], -d1[0]];
      var cen = [p1[0] + nr[0] * r, p1[1] + nr[1] * r], a0 = Math.atan2(p1[1] - cen[1], p1[0] - cen[0]);
      var m = Math.max(2, Math.ceil(Math.abs(th) * r / 1.5));
      for (k = 0; k <= m; k++) { var aa = a0 + th * k / m; path.push([cen[0] + Math.cos(aa) * r, cen[1] + Math.sin(aa) * r]); }
    }
    var cum = [0];
    for (i = 1; i <= path.length; i++) { var p = path[i % path.length], q = path[i - 1]; cum.push(cum[i - 1] + Math.hypot(p[0] - q[0], p[1] - q[1])); }
    var L = cum[path.length], N = Math.round(L / step), out = [];
    for (var s = 0; s < N; s++) {
      var d = (s * L / N + startAt) % L; i = 0; while (cum[i + 1] < d) i++;
      var f = (d - cum[i]) / (cum[i + 1] - cum[i]), P = path[i], Q = path[(i + 1) % path.length];
      out.push([+(P[0] + (Q[0] - P[0]) * f).toFixed(2), 0, +(P[1] + (Q[1] - P[1]) * f).toFixed(2)]);
    }
    return out;
  }
  // the line is on the pit straight, out of the chicane, 100 m before turn 1
  var ROUTE = route(CORNERS, 25, 1815);
  var HW = 8;   // half the road: 16 m of street between the walls

  var W = { t: 0, beat: 0, bar: 0, lap: 1, start: -9, fireworks: [], shows: 0 };

  /* ------------------------------------------------------ materials kit -- */
  // parts by material, merged into one mesh each at the end
  function Bin(T) { this.T = T; this.by = new Map(); }
  Bin.prototype.add = function (g, m) { if (!this.by.has(m)) this.by.set(m, []); this.by.get(m).push(g.index ? g.toNonIndexed() : g); return g; };
  Bin.prototype.flush = function (parent, opts) {
    var T = this.T; opts = opts || {};
    this.by.forEach(function (list, m) {
      var n = 0, hasC = list.some(function (g) { return g.attributes.color; }), hasU1 = list.some(function (g) { return g.attributes.uv1; });
      list.forEach(function (g) { n += g.attributes.position.count; });
      var pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), col = hasC ? new Float32Array(n * 3) : null, uv1 = hasU1 ? new Float32Array(n * 2) : null, o = 0;
      list.forEach(function (g) {
        if (!g.attributes.normal) g.computeVertexNormals();
        var c = g.attributes.position.count;
        pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3);
        if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
        if (col) { if (g.attributes.color) col.set(g.attributes.color.array, o * 3); else col.fill(1, o * 3, (o + c) * 3); }
        if (uv1 && g.attributes.uv1) uv1.set(g.attributes.uv1.array, o * 2);
        o += c;
      });
      var geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.BufferAttribute(pos, 3)); geo.setAttribute('normal', new T.BufferAttribute(nor, 3)); geo.setAttribute('uv', new T.BufferAttribute(uv, 2));
      if (col) geo.setAttribute('color', new T.BufferAttribute(col, 3));
      if (uv1) geo.setAttribute('uv1', new T.BufferAttribute(uv1, 2));
      var mesh = new T.Mesh(geo, m);
      mesh.castShadow = !!opts.shadow; mesh.receiveShadow = opts.receive !== false;
      if (opts.noReflection) mesh.userData.noReflection = true;
      if (opts.track) mesh.userData.gmTrack = true;
      parent.add(mesh);
    });
    this.by.clear();
  };
  function tint(g, hex, T) {
    var c = new T.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (var i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    g.setAttribute('color', new T.BufferAttribute(a, 3)); return g;
  }
  // a colour brighter than white, for anything that should bloom
  function hot(T, hex, k) { return new T.Color(hex).multiplyScalar(k); }

  // lights the street is lit by: the road's light is baked from these
  var LIGHTS = [];
  function light(x, y, z, hex, power, reach) { LIGHTS.push({ x: x, y: y, z: z, c: hex, p: power, r: reach || 18 }); }

  /* ----------------------------------------------------------- the sky -- */
  function sky(ctx) {
    var T = ctx.THREE, R = rng(11);
    // a night sky the city lights from below: orange and violet at the horizon
    ctx.sky({ top: '#0B0B1A', horizon: '#4E3440', bottom: '#120E14', sun: [-0.35, 0.42, -0.62], sunColor: '#C9D4FF', sunSize: 0.8, glow: 0.3, sunPower: 5, haze: 0.18, curve: 0.55 });
    // what stars the glow allows
    var n = 520, p = new Float32Array(n * 3), s = new Float32Array(n);
    for (var i = 0; i < n; i++) {
      var u = R() * Math.PI * 2, v = 0.18 + R() * 0.8, rr = 900;
      p[i * 3] = Math.cos(u) * Math.cos(v) * rr; p[i * 3 + 1] = Math.sin(v) * rr; p[i * 3 + 2] = Math.sin(u) * Math.cos(v) * rr; s[i] = R();
    }
    var g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(p, 3)); g.setAttribute('seed', new T.BufferAttribute(s, 1));
    W.stars = new T.Points(g, new T.ShaderMaterial({
      uniforms: { uTime: { value: 0 } }, transparent: true, depthWrite: false, blending: T.AdditiveBlending,
      vertexShader: 'attribute float seed; uniform float uTime; varying float vA; void main() { vA = (0.25 + 0.75 * seed) * (0.75 + 0.25 * sin(uTime * (1.0 + seed * 3.0) + seed * 40.0)) * smoothstep(0.1, 0.5, normalize(position).y); vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = 1.2 + seed * 1.6; gl_Position = projectionMatrix * mv; gl_Position.z = gl_Position.w * 0.9999; }',
      fragmentShader: 'varying float vA; void main() { vec2 q = gl_PointCoord - 0.5; if (dot(q, q) > 0.25) discard; gl_FragColor = vec4(vec3(0.9, 0.93, 1.0) * vA, 1.0); }',
    }));
    W.stars.frustumCulled = false; W.stars.userData.noReflection = true; ctx.scene.add(W.stars);
    // the ranges round the valley, black against the glow
    var ring = [], m = 180;
    for (i = 0; i <= m; i++) {
      var a = i / m * Math.PI * 2, west = Math.max(0, -Math.cos(a)), hgt = 120 + 260 * Math.pow(Math.sin(a * 3 + 1) * 0.5 + 0.5, 2) * (0.4 + west) + 60 * Math.sin(a * 17) + 30 * Math.sin(a * 41);
      ring.push(a, Math.max(60, hgt));
    }
    var mp = [], idx = [], rad = 3200;
    for (i = 0; i <= m; i++) { var aa = ring[i * 2], hh = ring[i * 2 + 1]; mp.push(Math.cos(aa) * rad + 150, -30, Math.sin(aa) * rad - 150, Math.cos(aa) * rad + 150, hh, Math.sin(aa) * rad - 150); }
    for (i = 0; i < m; i++) { var q0 = i * 2; idx.push(q0, q0 + 1, q0 + 2, q0 + 1, q0 + 3, q0 + 2); }
    var mg = new T.BufferGeometry(); mg.setAttribute('position', new T.Float32BufferAttribute(mp, 3)); mg.setIndex(idx);
    var mt = new T.Mesh(mg, new T.MeshBasicMaterial({ color: '#07070B', side: T.DoubleSide, fog: false }));
    mt.userData.noReflection = true; ctx.scene.add(mt);
    ctx.scene.fog = new T.FogExp2('#1A1222', 0.00055);
  }

  /* ------------------------------------------------------------ the road -- */
  function road(ctx) {
    var T = ctx.THREE, L = ctx.track.length, low = ctx.quality === 'low';
    var tx = ctx.assets.texture('texture-asphalt-track');
    if (!tx) {
      // without the library: an asphalt of our own, grains and cracks in greys
      var R0 = rng(5);
      tx = { size: 2, map: ctx.textures.canvas(512, 512, function (g, w, h) { g.fillStyle = '#3A3A3C'; g.fillRect(0, 0, w, h); for (var i = 0; i < 9000; i++) { var v = 40 + R0() * 50; g.fillStyle = 'rgb(' + v + ',' + v + ',' + (v + 2) + ')'; g.fillRect(R0() * w, R0() * h, 1 + R0() * 2, 1 + R0() * 2); } }),
        normalMap: ctx.textures.normal(256, 256, function (g, w, h) { for (var i = 0; i < 4000; i++) { var v = Math.round(100 + R0() * 120); g.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')'; g.fillRect(R0() * w, R0() * h, 2, 2); } }, 2.5) };
    }
    var rep = 16 / (tx.size || 2);
    [tx.map, tx.normalMap, tx.roughnessMap].forEach(function (t) { if (t) t.repeat.set(rep, rep); });
    // standing water: a film over the asphalt, pooled in the low spots
    var R1 = rng(21);
    var puddles = ctx.textures.canvas(512, 512, function (g, w, h) {
      g.fillStyle = '#6A6A6A'; g.fillRect(0, 0, w, h);
      for (var i = 0; i < 70; i++) {
        var x = R1() * w, y = R1() * h, r = 18 + R1() * 70, gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, r, r * (0.4 + R1() * 0.5), R1() * 3, 0, Math.PI * 2); g.fill();
      }
      // tyre lines: the racing line dries first, two darker bands where the cars run
      g.fillStyle = 'rgba(40,40,40,0.35)'; g.fillRect(w * 0.3, 0, w * 0.08, h); g.fillRect(w * 0.6, 0, w * 0.08, h);
    }, { linear: true });
    puddles.repeat.set(1, 0.25);
    var mat = new T.MeshPhysicalMaterial({
      color: '#8E8E90', map: tx.map, normalMap: tx.normalMap, normalScale: new T.Vector2(0.9, 0.9), roughnessMap: tx.roughnessMap || null, roughness: 0.92, metalness: 0,
      clearcoat: 1, clearcoatMap: puddles, clearcoatRoughness: 0.07,
    });
    W.roadMat = mat;
    // the painted lines and the kerbs, in the road's own shader: edge lines,
    // the old lane lines of the street (faded), the start line's chequers and
    // the grid boxes, and red and white kerbs on the inside of every bend
    var U = { gmL: { value: L }, gmHW: { value: HW }, gmKerb: { value: null } };
    mat.onBeforeCompile = function (sh) {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = 'varying vec2 vGmRoad;\n' + sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n  vGmRoad = vec2( uv.x, uv.y );');
      sh.fragmentShader = 'varying vec2 vGmRoad; uniform float gmL, gmHW; uniform sampler2D gmKerb;\n' + sh.fragmentShader.replace('#include <map_fragment>', [
        '#include <map_fragment>',
        '{',
        '  float lat = ( vGmRoad.x - 0.5 ) * gmHW * 2.0, d = mod( vGmRoad.y * gmHW * 2.0, gmL );',
        '  float line = step( gmHW - 0.62, abs( lat ) ) * step( abs( lat ), gmHW - 0.36 );',
        '  float lane = ( step( abs( abs( lat ) - 2.9 ), 0.07 ) + step( abs( lat ), 0.07 ) ) * step( fract( d / 9.0 ), 0.34 ) * 0.28;',
        '  float st = step( d, 1.4 ) + step( gmL - 0.001, d );',
        '  float chq = mod( floor( d / 0.7 ) + floor( lat / 0.7 ), 2.0 );',
        '  float kerb = texture2D( gmKerb, vec2( d / gmL, 0.5 ) ).r * 2.0 - 1.0;',
        '  float onK = step( 0.5, abs( kerb ) ) * step( gmHW - 1.25, lat * sign( kerb ) );',
        '  float kst = step( 0.5, fract( d / 2.4 ) );',
        // the grid: boxes behind the line, two by two
        '  float gd = gmL - d; float slot = step( 6.0, gd ) * step( gd, 46.0 ) * step( fract( ( gd - 6.0 ) / 10.0 ), 0.06 ) * step( abs( abs( lat ) - 3.0 ), 1.2 );',
        '  vec3 paint = vec3( 0.86, 0.86, 0.84 );',
        '  diffuseColor.rgb = mix( diffuseColor.rgb, paint, clamp( line + lane + slot, 0.0, 1.0 ) * 0.9 );',
        '  diffuseColor.rgb = mix( diffuseColor.rgb, mix( vec3( 0.02 ), vec3( 0.9 ), chq ), st * step( abs( lat ), gmHW - 0.36 ) );',
        '  diffuseColor.rgb = mix( diffuseColor.rgb, mix( vec3( 0.42, 0.03, 0.03 ), vec3( 0.5 ), kst ), onK );',
        '}',
      ].join('\n'));
    };
    // the road, and its light: pools under the street lamps, the colours of the
    // neon beside it, baked once from every light the world placed (uv1)
    var ribbon = ctx.track.ribbon({ width: HW * 2, material: mat, step: 1.5, y: 0 });
    addLightUV(ctx, ribbon.geometry, -HW, HW);
    ctx.mirror(mat, { y: 0, strength: 1.0, blur: 0.18, distortion: 0.02 });
    ribbon.userData.gmTrack = true; ctx.scene.add(ribbon);
    W.roadRibbon = ribbon; W.kerbU = U.gmKerb;
    // the pavements beyond the walls, and the ground under the city
    var paving = ctx.textures.canvas(512, 512, function (g, w, h) {
      g.fillStyle = '#6E6A66'; g.fillRect(0, 0, w, h);
      var R2 = rng(8); for (var y = 0; y < 8; y++) for (var x = 0; x < 8; x++) { var v = 96 + R2() * 26; g.fillStyle = 'rgb(' + v + ',' + (v - 3) + ',' + (v - 6) + ')'; g.fillRect(x * 64 + 2, y * 64 + 2, 60, 60); }
    });
    paving.repeat.set(3, 1);
    var pmat = new T.MeshPhysicalMaterial({ map: paving, color: '#6A6A6E', roughness: 0.8, clearcoat: 0.6, clearcoatRoughness: 0.12 });
    [-1, 1].forEach(function (sd) {
      var rb = ctx.track.ribbon({ width: 11, offset: sd * (HW + 6.8), material: pmat, step: 3, y: 0.02, tile: 11 });
      addLightUV(ctx, rb.geometry, sd * (HW + 6.8) - 5.5, sd * (HW + 6.8) + 5.5);
      rb.userData.gmTrack = true; ctx.scene.add(rb);
    });
    W.pavMat = pmat;
    var ground = new T.Mesh(new T.PlaneGeometry(9000, 9000), new T.MeshStandardMaterial({ color: '#121216', roughness: 0.95 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.05; ground.receiveShadow = true; ground.userData.noReflection = true; ctx.scene.add(ground);
  }
  // a ribbon's second uv: across the baked light map (lateral -24 to 24 m) and along the lap
  var LM_W = 48, LM_SPAN = 24;
  function addLightUV(ctx, geo, a, b) {
    var n = geo.attributes.position.count / 2, uv1 = new Float32Array(n * 4);
    for (var s = 0; s < n; s++) {
      uv1[s * 4] = (a + LM_SPAN) / (LM_SPAN * 2); uv1[s * 4 + 1] = s / (n - 1);
      uv1[s * 4 + 2] = (b + LM_SPAN) / (LM_SPAN * 2); uv1[s * 4 + 3] = s / (n - 1);
    }
    geo.setAttribute('uv1', new ctx.THREE.BufferAttribute(uv1, 2));
  }
  // bake: every light near the track adds its pool to the map, falling off
  // with distance and its height above the road
  function bakeLight(ctx) {
    var T = ctx.THREE, L = ctx.track.length, NL = ctx.quality === 'low' ? 1024 : 2048, data = new Float32Array(NL * LM_W * 3);
    var c = new T.Color();
    LIGHTS.forEach(function (li) {
      var nn = ctx.track.nearest(li.x, li.z); if (nn.distance > li.r + LM_SPAN + 4) return;
      c.set(li.c);
      var span = li.r * 1.6, d0 = nn.d - span, d1 = nn.d + span;
      for (var dd = d0; dd <= d1; dd += L / NL) {
        var j = Math.floor(((dd % L) + L) % L / L * NL), F = ctx.track.frameAt(dd);
        for (var x = 0; x < LM_W; x++) {
          var lat = (x + 0.5) - LM_SPAN, px = F.pos.x + F.right.x * lat, pz = F.pos.z + F.right.z * lat;
          var d2 = (px - li.x) * (px - li.x) + (pz - li.z) * (pz - li.z) + li.y * li.y * 0.6;
          var k = 0.6 * li.p / (1 + d2 / (li.r * li.r * 0.25)); k *= Math.max(0, 1 - d2 / (li.r * li.r * 4));
          if (k <= 0.001) continue;
          var o = (j * LM_W + x) * 3; data[o] += c.r * k; data[o + 1] += c.g * k; data[o + 2] += c.b * k;
        }
      }
    });
    var half = new Uint16Array(NL * LM_W * 4), toH = T.DataUtils.toHalfFloat;
    for (var i = 0; i < NL * LM_W; i++) { half[i * 4] = toH(Math.min(60, data[i * 3])); half[i * 4 + 1] = toH(Math.min(60, data[i * 3 + 1])); half[i * 4 + 2] = toH(Math.min(60, data[i * 3 + 2])); half[i * 4 + 3] = toH(1); }
    var tex = new T.DataTexture(half, LM_W, NL, T.RGBAFormat, T.HalfFloatType);
    tex.magFilter = tex.minFilter = T.LinearFilter; tex.channel = 1; tex.colorSpace = T.LinearSRGBColorSpace; tex.needsUpdate = true;
    [W.roadMat, W.pavMat].forEach(function (m) { m.lightMap = tex; m.lightMapIntensity = 1; m.needsUpdate = true; });
    // the kerbs: which side of the road is the inside of a bend, lap-long
    var K = 1024, kd = new Uint8Array(K * 4), F0 = ctx.track.frameAt(0);
    for (var s = 0; s < K; s++) {
      var d = s / K * L, a = ctx.track.frameAt(d - 6), b = ctx.track.frameAt(d + 6);
      var turn = a.tan.x * b.tan.z - a.tan.z * b.tan.x; // > 0: a right-hand bend (the runtime's right is tan x up)
      var ang = Math.asin(clamp(turn, -1, 1));
      var side = Math.abs(ang) > 0.1 ? (ang > 0 ? 1 : -1) : 0;
      kd[s * 4] = side ? (side > 0 ? 255 : 0) : 128; kd[s * 4 + 3] = 255;
    }
    void F0;
    var kt = new T.DataTexture(kd, K, 1, T.RGBAFormat); kt.magFilter = kt.minFilter = T.NearestFilter; kt.needsUpdate = true;
    W.kerbU.value = kt;
  }

  /* ---------------------------------------------- walls, fence, the gantry -- */
  function furniture(ctx) {
    var T = ctx.THREE, L = ctx.track.length, low = ctx.quality === 'low';
    // concrete walls with the circuit's boards on them, lit from behind
    var boards = ctx.textures.canvas(2048, 128, function (g, w, h) {
      var words = ['NIGHT GP', 'GAMEMOG', 'JACKPOT', 'LAS VEGAS', 'FULL THROTTLE', 'HIGH ROLLER', 'OPEN 24/7', 'NEON'], cols = ['#0B0B10', '#E8E6E0', '#C8102E', '#101828', '#F2B705', '#141416', '#00A3AD', '#1A1030'];
      var bw = w / words.length;
      words.forEach(function (wd, i) {
        g.fillStyle = cols[i]; g.fillRect(i * bw, 0, bw, h);
        var light = ['#E8E6E0', '#F2B705'].indexOf(cols[i]) >= 0;
        g.fillStyle = light ? '#111111' : ['#FF2E88', '#FFFFFF', '#FFD100', '#2EE6FF'][i % 4];
        g.font = '900 64px "Arial Black", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(wd, i * bw + bw / 2, h * 0.52, bw * 0.86);
      });
    });
    var wallMat = new T.MeshStandardMaterial({ map: boards, emissive: '#FFFFFF', emissiveMap: boards, emissiveIntensity: 0.32, roughness: 0.55 });
    var fenceTex = ctx.textures.canvas(64, 64, function (g, w, h) {
      g.clearRect(0, 0, w, h); g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 1.5;
      for (var i = -w; i < w * 2; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h, h); g.stroke(); g.beginPath(); g.moveTo(i, h); g.lineTo(i + h, 0); g.stroke(); }
    });
    fenceTex.repeat.set(1, 1);
    // dark coated wire: close to, a fine mesh; further off, it fades into a faint veil
    var fenceMat = new T.MeshStandardMaterial({ map: fenceTex, color: '#3A3E46', transparent: true, depthWrite: false, metalness: 0.4, roughness: 0.6, side: T.DoubleSide });
    // a Jersey wall's profile, swept along both edges
    var PROF = [[0.0, 0], [0.0, 0.08], [0.1, 0.32], [0.22, 1.05], [0.38, 1.05], [0.5, 0.32], [0.6, 0.08], [0.6, 0]];
    [-1, 1].forEach(function (sd) {
      var n = Math.round(L / 3), pos = [], uvs = [], idx = [], fpos = [], fuv = [], fidx = [];
      for (var s = 0; s <= n; s++) {
        var d = s / n * L, F = ctx.track.frameAt(d);
        for (var k = 0; k < PROF.length; k++) {
          var lat = sd * (HW + 0.35 + PROF[k][0]), p = ctx.track.pointAt(d, lat, PROF[k][1]);
          pos.push(p.x, p.y, p.z); uvs.push(sd > 0 ? d / 24 : -d / 24, k / (PROF.length - 1));
        }
        [1.05, 3.9].forEach(function (y) { var q = ctx.track.pointAt(d, sd * (HW + 0.66), y); fpos.push(q.x, q.y, q.z); fuv.push(d / 0.9, y / 0.9); });
        void F;
      }
      for (s = 0; s < n; s++) for (var k2 = 0; k2 < PROF.length - 1; k2++) {
        var a = s * PROF.length + k2, b = a + 1, c = a + PROF.length, dd = c + 1;
        if (sd > 0) idx.push(a, c, b, b, c, dd); else idx.push(a, b, c, b, dd, c);
      }
      for (s = 0; s < n; s++) { var fa = s * 2; fidx.push(fa, fa + 2, fa + 1, fa + 1, fa + 2, fa + 3); }
      var g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2)); g.setIndex(idx); g.computeVertexNormals();
      // the boards face the road; the top and back are bare concrete
      var wall = new T.Mesh(g, wallMat); wall.receiveShadow = true; wall.castShadow = false; wall.userData.gmTrack = true; ctx.scene.add(wall);
      var fg = new T.BufferGeometry(); fg.setAttribute('position', new T.Float32BufferAttribute(fpos, 3)); fg.setAttribute('uv', new T.Float32BufferAttribute(fuv, 2)); fg.setIndex(fidx); fg.computeVertexNormals();
      var fence = new T.Mesh(fg, fenceMat); fence.userData.gmTrack = true; fence.userData.noReflection = low; ctx.scene.add(fence);
    });
    // fence posts and the top cable
    var np = Math.round(L / 6) * 2;
    var posts = ctx.instanced(new T.CylinderGeometry(0.05, 0.06, 4.0, 6).translate(0, 2.0, 0), new T.MeshStandardMaterial({ color: '#30333A', metalness: 0.6, roughness: 0.5 }), np, function (i, D) {
      var sd = i % 2 ? 1 : -1, d = Math.floor(i / 2) * 6, p = ctx.track.pointAt(d, sd * (HW + 0.7), 0); D.position.copy(p);
    });
    posts.userData.gmTrack = true; posts.userData.noReflection = low; ctx.scene.add(posts);
    // street lamps: tall poles every 38 m on both sides, heads over the kerb
    var lampN = Math.round(L / 38) * 2, lampPole = new T.MeshStandardMaterial({ color: '#3A3D44', metalness: 0.7, roughness: 0.45 });
    var poleG = new T.CylinderGeometry(0.11, 0.16, 11.5, 8).translate(0, 5.75, 0);
    var armG = new T.BoxGeometry(0.1, 0.1, 3.2).translate(0, 11.4, 1.5);
    var headG = new T.BoxGeometry(0.5, 0.14, 1.0).translate(0, 11.3, 3.0);
    var pb = new Bin(T);
    var headMat = new T.MeshBasicMaterial({ color: hot(T, '#FFE2B8', 5) });
    for (var i = 0; i < lampN; i++) {
      var sd = i % 2 ? 1 : -1, d = Math.floor(i / 2) * 38 + (sd > 0 ? 19 : 0), F = ctx.track.frameAt(d), p = ctx.track.pointAt(d, sd * (HW + 4.6), 0);
      var yaw = Math.atan2(-F.right.x * sd, -F.right.z * sd);
      [poleG, armG].forEach(function (g0) { var g = g0.clone(); g.rotateY(yaw); g.translate(p.x, 0, p.z); pb.add(g, lampPole); });
      var h = headG.clone(); h.rotateY(yaw); h.translate(p.x, 0, p.z); pb.add(h, headMat);
      var q = ctx.track.pointAt(d, sd * (HW + 1.6), 0);
      light(q.x, 11, q.z, '#FFD7A8', 26, 15);
    }
    pb.flush(ctx.scene, { noReflection: false });
    /* the gantry over the line: a truss, the five red lights, the clock */
    var F0 = ctx.track.frameAt(0);
    var truss = new Bin(T), steel = new T.MeshStandardMaterial({ color: '#1B1D22', metalness: 0.8, roughness: 0.35 });
    [-1, 1].forEach(function (s2) { truss.add(new T.BoxGeometry(0.9, 11, 0.9).translate(s2 * (HW + 2.6), 5.5, 0), steel); });
    // the two legs stand off the road: one mesh spans it, so it is marked as the track's own
    var legs = new T.Group(); truss.flush(legs, { shadow: true, track: true });
    var top = new Bin(T);
    top.add(new T.BoxGeometry(HW * 2 + 6, 1.2, 1.6).translate(0, 8.6, 0), steel);
    var clockTex = ctx.textures.canvas(1024, 128, function (g, w, h) { g.fillStyle = '#050507'; g.fillRect(0, 0, w, h); g.fillStyle = '#FFFFFF'; g.font = '900 78px "Arial Black", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('LAS VEGAS NIGHT GP', w / 2, h * 0.54, w * 0.92); });
    var clock = new T.Mesh(new T.PlaneGeometry(HW * 2, 1.9), new T.MeshBasicMaterial({ map: clockTex, color: hot(T, '#FFFFFF', 1.8) }));
    clock.position.set(0, 10.3, -0.81); clock.rotation.y = Math.PI;
    top.add(new T.BoxGeometry(HW * 2 + 0.4, 2.2, 0.3).translate(0, 10.3, -0.62), steel);
    var bulbs = [];
    var tops = new T.Group(); top.flush(tops, { shadow: true }); tops.add(clock);
    for (var b = 0; b < 5; b++) for (var r2 = 0; r2 < 2; r2++) {
      var bm = new T.Mesh(new T.CircleGeometry(0.34, 20), new T.MeshBasicMaterial({ color: hot(T, '#FF1010', 0.001) }));
      bm.position.set((b - 2) * 1.5, 7.95 + r2 * 0.85, -0.82); bm.rotation.y = Math.PI; tops.add(bm); bulbs.push(bm);
    }
    [legs, tops].forEach(function (grp) { grp.position.copy(F0.pos); grp.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(F0.left, F0.up, F0.tan)); ctx.scene.add(grp); });
    W.startLights = bulbs;
  }

  /* ---------------------------------------------------------- the city -- */
  // hotel glass: rows of rooms, some lit warm, some cool, some floors all dark
  function windowTex(ctx) {
    var R = rng(3), cells = 32;
    var base = ctx.textures.canvas(512, 512, function (g, w, h) {
      var s = w / cells;
      g.fillStyle = '#20232B'; g.fillRect(0, 0, w, h);
      for (var y = 0; y < cells; y++) for (var x = 0; x < cells; x++) { var v = 34 + R() * 20; g.fillStyle = 'rgb(' + (v - 6) + ',' + v + ',' + (v + 12) + ')'; g.fillRect(x * s + 3, y * s + 4, s - 6, s - 7); }
    });
    var R2 = rng(4);
    var lit = ctx.textures.canvas(512, 512, function (g, w, h) {
      var s = w / cells; g.fillStyle = '#000000'; g.fillRect(0, 0, w, h);
      for (var y = 0; y < cells; y++) {
        var floor = R2(), all = floor > 0.95, none = floor < 0.15;
        for (var x = 0; x < cells; x++) {
          var on = all || (!none && R2() < 0.3); if (!on) continue;
          var k = R2(), col = k < 0.62 ? [255, 214, 160] : k < 0.9 ? [214, 232, 255] : [120, 170, 255];
          var br = 0.18 + R2() * 0.45;
          g.fillStyle = 'rgb(' + Math.round(col[0] * br) + ',' + Math.round(col[1] * br) + ',' + Math.round(col[2] * br) + ')';
          g.fillRect(x * s + 3, y * s + 4, s - 6, s - 7);
        }
      }
    });
    return { base: base, lit: lit };
  }
  // a tower's faces with rooms mapped in metres: 3.4 m a room across, 3.3 m a floor
  function faceUV(g, wAcross, hUp, off) {
    var uv = g.attributes.uv; for (var i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * wAcross / 1.8 + off) / 32, uv.getY(i) * hUp / 3.1 / 32);
    return g;
  }
  function boxTower(T, w, d, h, x, z, yaw, off) {
    var parts = [];
    // four walls (no roof in the glass: the roof is its own dark cap)
    [[w, 0, d / 2, 0], [w, Math.PI, -d / 2, 0], [d, Math.PI / 2, 0, w / 2], [d, -Math.PI / 2, 0, -w / 2]].forEach(function (f, i) {
      var g = new T.PlaneGeometry(f[0], h); faceUV(g, f[0], h, off + i * 5);
      g.translate(0, h / 2, 0); g.rotateY(f[1]); g.translate(f[3], 0, f[2]);
      g.rotateY(yaw || 0); g.translate(x, 0, z); parts.push(g);
    });
    return parts;
  }
  function slabArc(T, R, a0, a1, t, h, x, z, off) {
    // a curved slab tower (the kind that wraps round a lake): outer and inner walls
    var n = 28, parts = [];
    [R + t / 2, R - t / 2].forEach(function (rr, side) {
      var pos = [], uv = [], idx = [];
      for (var i = 0; i <= n; i++) {
        var a = a0 + (a1 - a0) * i / n, px = x + Math.cos(a) * rr, pz = z + Math.sin(a) * rr, u = (a - a0) * rr / 3.4;
        u = (a - a0) * rr / 1.8; pos.push(px, 0, pz, px, h, pz); uv.push((u + off) / 32, 0, (u + off) / 32, h / 3.1 / 32);
      }
      for (i = 0; i < n; i++) { var q = i * 2; if (side) idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); else idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
      var g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
      parts.push(g);
    });
    return parts;
  }
  function cityscape(ctx) {
    var T = ctx.THREE, R = rng(31), low = ctx.quality === 'low';
    var WT = windowTex(ctx);
    var glass = new T.MeshStandardMaterial({ map: WT.base, emissive: '#FFFFFF', emissiveMap: WT.lit, emissiveIntensity: 1.35, roughness: 0.18, metalness: 0.6, vertexColors: true });
    var roof = new T.MeshStandardMaterial({ color: '#15161B', roughness: 0.8 });
    var neon = new T.MeshBasicMaterial({ vertexColors: true });
    var bin = new Bin(T), glow = new Bin(T);
    W.glass = glass;
    function crown(x, z, w, d, h, yaw, hex, k) {
      // a band of light round the top and lines down the corners
      var g = new T.BoxGeometry(w + 0.6, 1.1, d + 0.6); g.translate(0, h - 2.5, 0); g.rotateY(yaw); g.translate(x, 0, z); glow.add(tint(g, '#' + hot(T, hex, k || 3).getHexString(), T), neon);
      [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(function (c) {
        var e = new T.BoxGeometry(0.35, h * 0.9, 0.35); e.translate(c[0] * (w / 2 + 0.1), h * 0.45, c[1] * (d / 2 + 0.1)); e.rotateY(yaw); e.translate(x, 0, z);
        var col = hot(T, hex, (k || 3) * 0.55); e.setAttribute('color', tint(e, '#000000', T).attributes.color);
        var ca = e.attributes.color; for (var i = 0; i < ca.count; i++) ca.setXYZ(i, col.r, col.g, col.b);
        glow.add(e, neon);
      });
    }
    function tower(x, z, w, d, h, yaw, glassHex, crownHex) {
      if (!ctx.track.clear(x, z, Math.max(w, d) * 0.72 + 14)) return false;
      boxTower(T, w, d, h, x, z, yaw, R() * 16).forEach(function (g) { bin.add(tint(g, glassHex, T), glass); });
      var rf = new T.BoxGeometry(w, 0.8, d); rf.translate(0, h, 0); rf.rotateY(yaw); rf.translate(x, 0, z); bin.add(rf, roof);
      if (crownHex) crown(x, z, w, d, h, yaw, crownHex);
      return true;
    }
    W.tower = tower;
    // the resorts along the Strip's west side, and their neighbours round the circuit
    var HOTELS = [
      // x, z, w, d, h, yaw, glass tint, crown
      [-150, -430, 34, 26, 140, 0.2, '#E8D9B8', '#FFC870'], [-190, -470, 30, 22, 118, -0.3, '#E8D9B8', null],       // the palazzo's towers
      [-175, -265, 30, 30, 112, 0.785, '#F2C46A', '#FFD27A'],                                                          // the gold tower behind the volcano
      [-185, -130, 44, 22, 130, 0.1, '#F0EEE8', '#9FC4FF'], [-150, -40, 26, 26, 96, 0.4, '#F0EEE8', null],             // the palace
      [-120, 300, 22, 22, 184, 0, '#9DB6D6', '#FF3FA4'], [-60, 340, 22, 22, 170, 0.2, '#9DB6D6', '#2EE6FF'],           // two glass towers at the south end
      [120, 370, 40, 26, 150, 0, '#C9B8E8', '#B04DFF'],                                                                // a tower behind the hairpin
      [175, 90, 38, 28, 118, -0.1, '#EFE2C8', '#FFC870'],                                                              // the tower behind the Eiffel Tower
      [420, 120, 36, 24, 100, 0.3, '#D9E2F0', '#FF2E88'], [430, -120, 30, 30, 84, 0, '#D0D0D8', '#2EE6FF'], [440, -330, 40, 24, 120, -0.2, '#E0D6C8', '#FFD100'],
      [80, -560, 30, 30, 130, 0.1, '#D8CCB8', '#FF6A3D'], [-60, -600, 26, 26, 150, 0, '#C8D8E8', '#7DF9FF'],
      [270, 360, 40, 30, 90, 0, '#DAD3C8', '#FFB000'], [370, 320, 26, 26, 72, 0.3, '#C8D0E0', null],
    ];
    HOTELS.forEach(function (H) { tower(H[0], H[1], H[2], H[3], H[4], H[5], H[6], H[7]); });
    // the curved bronze pair to the north, and the lake's great curve to the west
    [[230, -560, 150, 3.35, 4.0, 26, 172, '#B8864E', '#FFD27A'], [360, -560, 110, 3.6, 4.3, 24, 150, '#B8864E', null]].forEach(function (S) {
      var mid = (S[3] + S[4]) / 2;
      slabArc(T, S[2], S[3], S[4], S[5], S[6], S[0] - S[2] * Math.cos(mid), S[1] - S[2] * Math.sin(mid), R() * 16).forEach(function (g) { bin.add(tint(g, S[7], T), glass); });
    });
    slabArc(T, 230, Math.PI - 0.45, Math.PI + 0.45, 26, 128, -20, 120, 3).forEach(function (g) { bin.add(tint(g, '#F2E6CF', T), glass); });
    // the skyline beyond: a few hundred towers, taller toward the Strip
    var placed = 0, want = low ? 90 : 190;
    for (var tries = 0; placed < want && tries < 3000; tries++) {
      var a = R() * Math.PI * 2, rr = 330 + Math.pow(R(), 0.7) * 1500, x = 170 + Math.cos(a) * rr * 1.1, z = -120 + Math.sin(a) * rr * 1.6;
      var nearStrip = Math.exp(-Math.pow((x + 60) / 420, 2)), h = 30 + R() * 70 + nearStrip * R() * 150;
      var w = 18 + R() * 26, d = 16 + R() * 22;
      var tones = ['#C9D2E0', '#E3D6BE', '#B8C8DC', '#D8C8E8', '#E8D8A8', '#A8B8C8'];
      if (tower(x, z, w, d, h, R() * Math.PI, tones[Math.floor(R() * tones.length)], R() < 0.45 ? ['#FF2E88', '#2EE6FF', '#FFD100', '#B04DFF', '#FF6A3D', '#7DF9FF', '#FFFFFF'][Math.floor(R() * 7)] : null)) placed++;
    }
    bin.flush(ctx.scene, { shadow: false });
    glow.flush(ctx.scene, { receive: false });
    W.glowMat = neon;
  }

  /* ------------------------------------------------------ the landmarks -- */
  function landmarks(ctx) {
    var T = ctx.THREE, low = ctx.quality === 'low', R = rng(41);
    /* the Sphere: a globe of light, round the corner at the top of the circuit */
    var sphereMat = new T.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uMode: { value: 0 }, uMix: { value: 0 }, uLook: { value: new T.Vector3(0, 0, 1) }, uBeat: { value: 0 }, uTV: { value: null }, uHasTV: { value: 0 } },
      vertexShader: 'varying vec3 vN; varying vec2 vUv; void main() { vN = normalize(position); vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: [
        'uniform float uTime, uMode, uMix, uBeat, uHasTV; uniform vec3 uLook; uniform sampler2D uTV; varying vec3 vN; varying vec2 vUv;',
        'float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
        'float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }',
        'float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * n2(p); p *= 2.03; a *= 0.5; } return s; }',
        // the eye: an iris that follows the cars
        'vec3 eye(vec3 n) { float c = dot(n, normalize(uLook)); float iris = smoothstep(0.86, 0.87, c), pupil = smoothstep(0.955, 0.96, c); float ang = atan(n.y, n.x) * 20.0; vec3 w = vec3(0.95, 0.93, 0.9) - vec3(0.4, 0.05, 0.05) * pow(max(0.0, 1.0 - c), 5.0) * (0.5 + 0.5 * sin(ang * 3.0)); vec3 ir = mix(vec3(0.05, 0.35, 0.55), vec3(0.3, 0.75, 0.9), fbm(vec2(ang, c * 40.0))) * (0.6 + 0.4 * smoothstep(0.87, 0.95, c)); vec3 col = mix(w, ir, iris); col = mix(col, vec3(0.01), pupil); col += vec3(1.0) * smoothstep(0.985, 0.99, dot(n, normalize(uLook + vec3(0.06, 0.08, 0.0)))); return col; }',
        // a planet turning
        'vec3 planet(vec3 n) { float a = atan(n.z, n.x) + uTime * 0.05; vec2 p = vec2(a * 2.0, n.y * 3.0); float land = smoothstep(0.52, 0.56, fbm(p * 1.6)); vec3 sea = vec3(0.02, 0.12, 0.38) + 0.08 * fbm(p * 6.0); vec3 gr = mix(vec3(0.12, 0.38, 0.12), vec3(0.55, 0.45, 0.25), fbm(p * 4.0)); vec3 col = mix(sea, gr, land); float cl = smoothstep(0.55, 0.8, fbm(p * 2.5 + vec2(uTime * 0.03, 0.0))); col = mix(col, vec3(0.95), cl * 0.8); col = mix(col, vec3(0.9, 0.95, 1.0), smoothstep(0.8, 0.95, abs(n.y))); return col; }',
        // the chequered flag, waving, with the beat in it
        'vec3 flag(vec3 n) { float a = atan(n.z, n.x); vec2 p = vec2(a * 6.0 + sin(n.y * 4.0 + uTime * 2.0) * 0.4, n.y * 6.0 + sin(a * 3.0 + uTime * 3.0) * 0.3); float c = mod(floor(p.x) + floor(p.y), 2.0); return mix(vec3(0.03), vec3(0.95), c) * (0.8 + 0.4 * uBeat); }',
        // a neon storm: rings of colour on the beat
        'vec3 rings(vec3 n) { float r = acos(clamp(n.y, -1.0, 1.0)); float w = sin(r * 18.0 - uTime * 4.0) * 0.5 + 0.5; vec3 c1 = vec3(1.0, 0.18, 0.55), c2 = vec3(0.18, 0.9, 1.0); return mix(c1, c2, w) * (0.6 + 0.6 * uBeat) * (0.4 + 0.6 * smoothstep(0.3, 0.9, w)); }',
        'vec3 show(float m, vec3 n) { if (m < 0.5) return eye(n); if (m < 1.5) return planet(n); if (m < 2.5) return flag(n); if (m < 3.5) return rings(n); return uHasTV > 0.5 ? texture2D(uTV, vec2(fract(vUv.x * 2.0 + 0.25), clamp((vUv.y - 0.3) * 2.2, 0.0, 1.0))).rgb * 1.3 : rings(n); }',
        'void main() {',
        '  vec3 n = normalize(vN);',
        '  vec3 col = mix(show(uMode, n), show(mod(uMode + 1.0, 5.0), n), uMix);',
        // the LEDs themselves: a fine grid of points
        '  vec2 g = fract(vUv * vec2(900.0, 450.0)) - 0.5; col *= 0.55 + 0.6 * smoothstep(0.5, 0.2, length(g));',
        '  gl_FragColor = vec4(col * 3.2, 1.0);',
        '}',
      ].join('\n'),
    });
    var sph = new T.Mesh(new T.SphereGeometry(44, low ? 48 : 96, low ? 24 : 48), sphereMat);
    sph.position.set(200, 36, -395); sph.userData.gmTrack = true; ctx.scene.add(sph);
    W.sphere = sph; W.sphereMat = sphereMat;
    light(200, 30, -395, '#A8D8FF', 40, 60);
    /* the Eiffel Tower, half size, lit gold, with a searchlight on top */
    (function () {
      var x = 90, z = 40, H = 104, bin = new Bin(T);
      var lattice = ctx.textures.canvas(128, 256, function (g, w, h) {
        g.clearRect(0, 0, w, h); g.strokeStyle = '#FFFFFF'; g.lineWidth = 7;
        g.strokeRect(4, 4, w - 8, h - 8);
        for (var y = 0; y < h; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y + 64); g.stroke(); g.beginPath(); g.moveTo(w, y); g.lineTo(0, y + 64); g.stroke(); }
      });
      var iron = new T.MeshStandardMaterial({ map: lattice, color: '#8A6A3A', emissive: '#FFB347', emissiveMap: lattice, emissiveIntensity: 1.6, alphaTest: 0.5, side: T.DoubleSide, roughness: 0.6, metalness: 0.5 });
      // the legs: four curved, tapering columns meeting at the top
      function half(t) { return 21 * Math.pow(1 - t, 2.2) + 1.6; }
      for (var leg = 0; leg < 4; leg++) {
        var ang = leg * Math.PI / 2 + Math.PI / 4, n = 14;
        for (var i = 0; i < n; i++) {
          var t0 = i / n, t1 = (i + 1) / n, y0 = t0 * H, y1 = t1 * H;
          var r0 = half(t0), r1 = half(t1), w0 = Math.max(1.2, 6.5 * (1 - t0)), w1 = Math.max(1.2, 6.5 * (1 - t1));
          if (t0 > 0.36) break;
          var g = new T.CylinderGeometry(w1 * 0.5, w0 * 0.5, y1 - y0, 4, 1, true);
          g.rotateY(Math.PI / 4); g.translate(Math.cos(ang) * (r0 + r1) / 2, (y0 + y1) / 2, Math.sin(ang) * (r0 + r1) / 2);
          bin.add(g, iron);
        }
      }
      // the upper shaft, the two platforms, the top
      var shaft = new T.CylinderGeometry(1.4, 7.2, H * 0.62, 4, 6, true); shaft.rotateY(Math.PI / 4); shaft.translate(0, H * 0.35 + H * 0.31, 0); bin.add(shaft, iron);
      var deck = new T.MeshStandardMaterial({ color: '#3A2A18', emissive: '#FFB347', emissiveIntensity: 0.6, roughness: 0.6 });
      bin.add(new T.BoxGeometry(34, 2.2, 34).translate(0, H * 0.17, 0), deck);
      bin.add(new T.BoxGeometry(16, 1.6, 16).translate(0, H * 0.37, 0), deck);
      bin.add(new T.CylinderGeometry(0.4, 1.2, 8, 6).translate(0, H + 3, 0), deck);
      var grp = new T.Group(); bin.flush(grp, { shadow: false }); grp.position.set(x, 0, z); grp.userData.gmTrack = true; ctx.scene.add(grp);
      grp.traverse(function (o) { o.userData.gmTrack = true; });
      // sparkles running up and down the iron
      var np = low ? 300 : 900, sp = new Float32Array(np * 3), ss = new Float32Array(np), R3 = rng(9);
      for (var k = 0; k < np; k++) { var tt = Math.pow(R3(), 1.3), rr = tt < 0.35 ? half(tt) * (0.6 + R3() * 0.5) : 7 * (1 - tt), aa = R3() * Math.PI * 2; sp[k * 3] = x + Math.cos(aa) * rr; sp[k * 3 + 1] = tt * H; sp[k * 3 + 2] = z + Math.sin(aa) * rr; ss[k] = R3(); }
      var sg = new T.BufferGeometry(); sg.setAttribute('position', new T.BufferAttribute(sp, 3)); sg.setAttribute('seed', new T.BufferAttribute(ss, 1));
      var sparkle = new T.Points(sg, new T.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uOn: { value: 0 } }, transparent: true, depthWrite: false, blending: T.AdditiveBlending,
        vertexShader: 'attribute float seed; uniform float uTime, uOn; varying float vA; void main() { vA = uOn * step(0.82, fract(sin(floor(uTime * 12.0 + seed * 91.0) * 12.9898 + seed * 78.2) * 43758.5)); vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = vA * 700.0 / -mv.z; gl_Position = projectionMatrix * mv; }',
        fragmentShader: 'varying float vA; void main() { vec2 q = gl_PointCoord - 0.5; float d = dot(q, q); if (d > 0.25) discard; gl_FragColor = vec4(vec3(8.0, 8.0, 7.0) * pow(1.0 - d * 4.0, 4.0), 1.0); }',
      }));
      sparkle.frustumCulled = false; sparkle.userData.noReflection = true; ctx.scene.add(sparkle);
      W.eiffelSparkle = sparkle.material;
      light(x, 20, z, '#FFB347', 30, 40);
      W.beams = W.beams || [];
      W.beams.push({ x: x, y: H + 6, z: z, hex: '#FFF4DE', len: 900, w: 9, speed: 0.35, phase: 0 });
    })();
    /* the lake and its fountains, west of the Strip */
    (function () {
      var water = new T.MeshPhysicalMaterial({ color: '#05080D', roughness: 0.06, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.02 });
      ctx.mirror(water, { y: 0, strength: 1.1, blur: 0.05, distortion: 0.04 });
      var lake = new T.Mesh(new T.PlaneGeometry(1, 1), water);
      lake.scale.set(170, 230, 1); lake.rotation.x = -Math.PI / 2; lake.position.set(-125, 0, 110); ctx.scene.add(lake);
      // the balustrade round it
      var bal = new Bin(T), stone = new T.MeshStandardMaterial({ color: '#D8CFC0', roughness: 0.7, emissive: '#FFD9A0', emissiveIntensity: 0.12 });
      bal.add(new T.BoxGeometry(2, 1.1, 230).translate(-39, 0.55, 110), stone);
      bal.add(new T.BoxGeometry(170, 1.1, 2).translate(-125, 0.55, -5), stone);
      bal.add(new T.BoxGeometry(170, 1.1, 2).translate(-125, 0.55, 225), stone);
      bal.flush(ctx.scene);
      // lamp posts along the rail
      for (var i = 0; i < 12; i++) light(-39, 5, -5 + i * 21, '#FFE0A8', 10, 10);
      // the jets: lines and an arc of columns of water that rise and fall with the music
      var jets = [];
      for (i = 0; i < 28; i++) jets.push([-60, -2 + i * 8, 0]);
      for (i = 0; i < 22; i++) { var a = Math.PI * (0.25 + 0.5 * i / 21); jets.push([-150 + Math.cos(a + Math.PI / 2) * 70, 110 + Math.sin(a + Math.PI / 2) * 95, 1]); }
      for (i = 0; i < 16; i++) jets.push([-100 - (i % 8) * 12, 40 + Math.floor(i / 8) * 140, 2]);
      var jg = new T.CylinderGeometry(1.1, 0.2, 1, 10, 6, true).translate(0, 0.5, 0);
      var jm = new T.ShaderMaterial({
        uniforms: { uTime: { value: 0 } }, transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide,
        vertexShader: 'varying float vY; varying float vR; void main() { vY = uv.y; vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0); vec3 n = normalize(mat3(modelMatrix * instanceMatrix) * normal); vR = abs(dot(n, normalize(cameraPosition - wp.xyz))); gl_Position = projectionMatrix * viewMatrix * wp; }',
        fragmentShader: 'varying float vY; varying float vR; void main() { float a = pow(vR, 1.2) * (1.0 - pow(vY, 3.0)) * (0.55 + 0.45 * vY); gl_FragColor = vec4(vec3(2.2, 2.4, 2.8) * a, 1.0); }',
      });
      var im = new T.InstancedMesh(jg, jm, jets.length); im.frustumCulled = false; im.userData.noReflection = false; ctx.scene.add(im);
      W.jets = { mesh: im, list: jets, h: new Float32Array(jets.length), D: new T.Object3D(), show: 0 };
      light(-70, 2, 100, '#DCEBFF', 20, 40);
    })();
    /* the volcano in its lagoon, and a bell tower on a canal */
    (function () {
      var rock = new T.MeshStandardMaterial({ color: '#2A1F1A', roughness: 0.95, flatShading: true });
      var vg = new T.ConeGeometry(34, 26, 24, 6, true); var p = vg.attributes.position, R4 = rng(12);
      for (var i = 0; i < p.count; i++) { var y = p.getY(i); if (y < 12.9) { p.setX(i, p.getX(i) * (0.9 + R4() * 0.3)); p.setZ(i, p.getZ(i) * (0.9 + R4() * 0.3)); } }
      vg.computeVertexNormals(); vg.translate(0, 13, 0);
      var v = new T.Mesh(vg, rock); v.position.set(-80, 0, -270); v.userData.gmTrack = true; ctx.scene.add(v);
      var lava = new T.Mesh(new T.CircleGeometry(6, 20), new T.MeshBasicMaterial({ color: hot(T, '#FF5A10', 3) })); lava.rotation.x = -Math.PI / 2; lava.position.set(-80, 25.8, -270); ctx.scene.add(lava);
      W.volcano = { x: -80, y: 26, z: -270, t: -9 };
      light(-80, 10, -270, '#FF6A20', 18, 30);
      // the campanile: a tall square bell tower with a pyramid roof, lit warm
      var bt = new Bin(T), brick = new T.MeshStandardMaterial({ color: '#C98E6A', roughness: 0.8, emissive: '#FFB070', emissiveIntensity: 0.3 });
      bt.add(new T.BoxGeometry(9, 62, 9).translate(0, 31, 0), brick);
      var belfry = ctx.textures.canvas(128, 64, function (g, w, h) { g.fillStyle = '#F0E4CC'; g.fillRect(0, 0, w, h); g.fillStyle = '#FFD890'; for (var k = 0; k < 3; k++) { g.beginPath(); g.moveTo(10 + k * 40, h - 6); g.lineTo(10 + k * 40, 26); g.arc(24 + k * 40, 26, 14, Math.PI, 0); g.lineTo(38 + k * 40, h - 6); g.fill(); } });
      bt.add(new T.BoxGeometry(11, 8, 11).translate(0, 64, 0), new T.MeshStandardMaterial({ map: belfry, emissive: '#FFFFFF', emissiveMap: belfry, emissiveIntensity: 1.3 }));
      for (var fl = 0; fl < 5; fl++) bt.add(new T.BoxGeometry(9.4, 0.5, 9.4).translate(0, 12 + fl * 10, 0), new T.MeshStandardMaterial({ color: '#E8D8C0', emissive: '#FFD8A0', emissiveIntensity: 0.5 }));
      bt.add(new T.ConeGeometry(7.5, 14, 4).rotateY(Math.PI / 4).translate(0, 75, 0), new T.MeshStandardMaterial({ color: '#2E6B4E', roughness: 0.5, metalness: 0.4 }));
      var gb = new T.Group(); bt.flush(gb); gb.position.set(-60, 0, -405); gb.traverse(function (o) { o.userData.gmTrack = true; }); ctx.scene.add(gb);
      light(-60, 8, -405, '#FFC890', 16, 25);
    })();
    /* the wheel of light: an observation wheel inside the circuit */
    (function () {
      var cx = 215, cz = -200, cy = 64, r = 56, grp = new T.Group();
      var ringMat = new T.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uBeat: { value: 0 } },
        vertexShader: 'varying vec3 vP; void main() { vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'uniform float uTime, uBeat; varying vec3 vP; void main() { float a = atan(vP.y, vP.z); vec3 c = 0.5 + 0.5 * cos(6.2831 * (a / 6.2831 * 3.0 - uTime * 0.12 + vec3(0.0, 0.33, 0.67))); gl_FragColor = vec4(c * (2.4 + 1.6 * uBeat), 1.0); }',
      });
      var rim = new T.Mesh(new T.TorusGeometry(r, 0.9, 8, 120).rotateY(Math.PI / 2), ringMat); grp.add(rim);
      var steelM = new T.MeshStandardMaterial({ color: '#C8CCD4', metalness: 0.8, roughness: 0.35 });
      var bin = new Bin(T);
      for (var i = 0; i < 28; i++) { var a = i / 28 * Math.PI * 2; var g = new T.CylinderGeometry(0.15, 0.15, r, 4); g.translate(0, r / 2, 0); g.rotateX(a); bin.add(g, steelM); }
      [-1, 1].forEach(function (sd) { bin.add(new T.CylinderGeometry(1.2, 2.4, cy, 8).translate(0, -cy / 2, sd * 14).rotateX(sd * 0.22), steelM); });
      bin.flush(grp);
      var cabins = new T.InstancedMesh(new T.SphereGeometry(3.4, 14, 10).scale(1, 0.8, 1.4), new T.MeshStandardMaterial({ color: '#CFE8FF', emissive: '#9FD8FF', emissiveIntensity: 1.2, roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.9 }), 28);
      var D = new T.Object3D();
      for (i = 0; i < 28; i++) { var a2 = i / 28 * Math.PI * 2; D.position.set(0, Math.sin(a2) * (r + 3), Math.cos(a2) * (r + 3)); D.updateMatrix(); cabins.setMatrixAt(i, D.matrix); }
      grp.add(cabins);
      grp.position.set(cx, cy, cz); grp.traverse(function (o) { o.userData.gmTrack = true; }); ctx.scene.add(grp);
      W.wheel = { grp: grp, mat: ringMat, spin: cabins };
    })();
    /* the pyramid and its beam, down the Strip to the south; a needle tower to the north */
    (function () {
      var pg = new T.ConeGeometry(120, 110, 4, 1).rotateY(Math.PI / 4).translate(0, 55, 0);
      var py = new T.Mesh(pg, new T.MeshStandardMaterial({ color: '#0C0D12', roughness: 0.15, metalness: 0.9, emissive: '#1A1418', emissiveIntensity: 0.4 }));
      py.position.set(-160, 0, 1300); py.userData.noReflection = true; ctx.scene.add(py);
      var edges = new Bin(T), eMat = new T.MeshBasicMaterial({ color: hot(T, '#FFE6B0', 2.4) });
      [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(function (c) { var a = new T.Vector3(c[0] * 85, 0, c[1] * 85), b = new T.Vector3(0, 110, 0); var g = new T.CylinderGeometry(0.8, 0.8, a.distanceTo(b), 4); g.translate(0, a.distanceTo(b) / 2, 0); g.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), b.clone().sub(a).normalize())); g.translate(a.x, a.y, a.z); edges.add(g, eMat); });
      var eg = new T.Group(); edges.flush(eg); eg.position.set(-160, 0, 1300); ctx.scene.add(eg);
      W.beams = W.beams || [];
      W.beams.push({ x: -160, y: 110, z: 1300, hex: '#EAF2FF', len: 3200, w: 7, fixed: true });
      // a needle tower on the skyline, a pod of light near its top
      var ng = new Bin(T), concrete = new T.MeshStandardMaterial({ color: '#8A8A90', roughness: 0.7, emissive: '#FFFFFF', emissiveIntensity: 0.06 });
      ng.add(new T.CylinderGeometry(6, 14, 300, 12).translate(0, 150, 0), concrete);
      ng.add(new T.CylinderGeometry(24, 18, 26, 20).translate(0, 285, 0), new T.MeshStandardMaterial({ color: '#2A2E38', emissive: '#FFFFFF', emissiveMap: W.glass ? W.glass.emissiveMap : null, emissiveIntensity: 1.2 }));
      ng.add(new T.CylinderGeometry(0.8, 1.6, 60, 6).translate(0, 328, 0), concrete);
      ng.add(new T.SphereGeometry(2, 8, 6).translate(0, 360, 0), new T.MeshBasicMaterial({ color: hot(T, '#FF2020', 6) }));
      var ngg = new T.Group(); ng.flush(ngg); ngg.position.set(-80, 0, -2300); ngg.traverse(function (o) { o.userData.noReflection = true; }); ctx.scene.add(ngg);
    })();
    /* the Welcome sign at the hairpin, where the Strip ends */
    (function () {
      var tex = ctx.textures.canvas(1024, 1024, function (g, w, h) {
        g.clearRect(0, 0, w, h);
        // the diamond
        g.beginPath(); g.moveTo(w / 2, 40); g.lineTo(w - 30, h * 0.52); g.lineTo(w / 2, h - 40); g.lineTo(30, h * 0.52); g.closePath();
        g.fillStyle = '#F4F1E6'; g.fill(); g.lineWidth = 16; g.strokeStyle = '#1A1A1A'; g.stroke();
        // WELCOME in red on white discs
        var L7 = 'WELCOME';
        for (var i = 0; i < 7; i++) {
          var x = w * (0.2 + i * 0.1), y = h * 0.34;
          g.beginPath(); g.arc(x, y, 44, 0, Math.PI * 2); g.fillStyle = '#FFFFFF'; g.fill(); g.lineWidth = 6; g.strokeStyle = '#C8102E'; g.stroke();
          g.fillStyle = '#C8102E'; g.font = '900 56px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(L7[i], x, y + 3);
        }
        g.fillStyle = '#1E3A8A'; g.font = 'italic 700 60px Georgia, serif'; g.textAlign = 'center'; g.fillText('to  Fabulous', w / 2, h * 0.47);
        g.fillStyle = '#C8102E'; g.font = '900 150px Georgia, serif'; g.fillText('LAS VEGAS', w / 2, h * 0.6, w * 0.8);
        g.fillStyle = '#1E3A8A'; g.font = '900 64px Georgia, serif'; g.fillText('NEVADA', w / 2, h * 0.73);
        // the star on top
        g.fillStyle = '#C8102E'; g.beginPath(); for (var k = 0; k < 10; k++) { var a = k / 10 * Math.PI * 2 - Math.PI / 2, rr = k % 2 ? 28 : 64; g.lineTo(w / 2 + Math.cos(a) * rr, 150 + Math.sin(a) * rr); } g.fill();
      });
      var sign = new T.Mesh(new T.PlaneGeometry(14, 14), new T.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.3, emissive: '#FFFFFF', emissiveMap: tex, emissiveIntensity: 1.1, side: T.DoubleSide }));
      sign.position.set(8, 13.5, 296); sign.rotation.y = Math.PI; ctx.scene.add(sign);
      var posts = new Bin(T), wh = new T.MeshStandardMaterial({ color: '#E8E4DA', roughness: 0.5 });
      [-3, 3].forEach(function (x) { posts.add(new T.BoxGeometry(0.6, 8, 0.6).translate(8 + x, 4, 296), wh); });
      posts.flush(ctx.scene);
      // the bulbs round its edge, chasing
      var nb = 64, bp = new Float32Array(nb * 3), bs = new Float32Array(nb);
      for (var i2 = 0; i2 < nb; i2++) {
        var t = i2 / nb * 4, seg = Math.floor(t), f = t - seg, P = [[0, 6.3], [6.6, 0.3], [0, -5.7], [-6.6, 0.3]], a0 = P[seg], a1 = P[(seg + 1) % 4];
        bp[i2 * 3] = 8 - lerp(a0[0], a1[0], f); bp[i2 * 3 + 1] = 13.5 + lerp(a0[1], a1[1], f); bp[i2 * 3 + 2] = 295.8; bs[i2] = i2 / nb;
      }
      W.bulbs = bulbPoints(T, bp, bs, '#FFE8A0', 260); ctx.scene.add(W.bulbs);
      light(8, 8, 290, '#FFF0D0', 16, 18);
    })();
  }
  // marquee bulbs: points that chase round a sign
  function bulbPoints(T, pos, seed, hex, size) {
    var g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('seed', new T.BufferAttribute(seed, 1));
    var c = new T.Color(hex);
    var p = new T.Points(g, new T.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uColor: { value: new T.Vector3(c.r, c.g, c.b) }, uSize: { value: size || 200 } }, transparent: true, depthWrite: false, blending: T.AdditiveBlending,
      vertexShader: 'attribute float seed; uniform float uTime, uSize; varying float vA; void main() { vA = 0.25 + 0.75 * step(0.5, fract(seed * 8.0 - uTime * 2.2)); vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = uSize / -mv.z; gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform vec3 uColor; varying float vA; void main() { vec2 q = gl_PointCoord - 0.5; float d = dot(q, q); if (d > 0.25) discard; gl_FragColor = vec4(uColor * 5.0 * vA * pow(1.0 - d * 4.0, 2.0), 1.0); }',
    }));
    p.frustumCulled = false; W.chasers = W.chasers || []; W.chasers.push(p.material);
    return p;
  }

  /* ------------------------------------------------- neon and the screens -- */
  // a neon word: a bright core and a glow, drawn once, on its own plane
  function neonWord(ctx, text, hex, w, h) {
    var T = ctx.THREE;
    var tex = ctx.textures.canvas(1024, 256, function (g, cw, ch) {
      g.clearRect(0, 0, cw, ch); g.font = '900 150px "Arial Black", "Helvetica Neue", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.shadowColor = hex; g.shadowBlur = 38; g.lineWidth = 14; g.strokeStyle = hex; g.strokeText(text, cw / 2, ch / 2, cw * 0.9);
      g.shadowBlur = 12; g.lineWidth = 6; g.strokeStyle = '#FFFFFF'; g.strokeText(text, cw / 2, ch / 2, cw * 0.9);
    });
    tex.wrapS = tex.wrapT = T.ClampToEdgeWrapping;
    var m = new T.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: T.AdditiveBlending, color: hot(T, '#FFFFFF', 2.2), side: T.DoubleSide });
    return new T.Mesh(new T.PlaneGeometry(w, h), m);
  }
  function signs(ctx) {
    var T = ctx.THREE, L = ctx.track.length, low = ctx.quality === 'low';
    // pylons of neon down the Strip's pavements and round the circuit
    var WORDS = [['CASINO', '#FF2E88'], ['SLOTS', '#FFD100'], ['LIVE SHOWS', '#2EE6FF'], ['JACKPOT', '#FF6A3D'], ['BUFFET', '#7DF9FF'], ['WEDDING CHAPEL', '#FF7AD9'], ['OPEN 24 HRS', '#39FF14'], ['POKER', '#FF2E2E'], ['LUCKY 7', '#FFB000'], ['BLACKJACK', '#B04DFF'], ['HOTEL', '#FFFFFF'], ['GRAND PRIX', '#FF2E88']];
    var pyl = new Bin(T), frame = new T.MeshStandardMaterial({ color: '#15161C', metalness: 0.6, roughness: 0.4 });
    var at = [0.08, 0.16, 0.24, 0.3, 0.4, 0.47, 0.53, 0.58, 0.63, 0.68, 0.73, 0.79, 0.86, 0.93];
    var R = rng(51), bulbsP = [], bulbsS = [];
    at.forEach(function (u, i) {
      var sd = i % 2 ? 1 : -1, d = u * L, F = ctx.track.frameAt(d), lat = sd * (HW + 18 + R() * 6), p = ctx.track.pointAt(d, lat, 0);
      if (!ctx.track.clear(p.x, p.z, 12)) return;
      var wd = WORDS[i % WORDS.length], h = 16 + R() * 10, w = 13 + wd[0].length * 0.9;
      var yaw = Math.atan2(F.tan.x, F.tan.z) + (sd > 0 ? -1 : 1) * 0.55 + Math.PI;
      var face = new T.Group(); face.position.set(p.x, 0, p.z); face.rotation.y = yaw;
      var g = new T.BoxGeometry(1.2, h, 1.2).translate(0, h / 2, 0); g.rotateY(yaw); g.translate(p.x, 0, p.z); pyl.add(g, frame);
      var b = new T.BoxGeometry(w + 1.4, 6.6, 1.0).translate(0, h + 3.3, 0); b.rotateY(yaw); b.translate(p.x, 0, p.z); pyl.add(b, frame);
      var nw = neonWord(ctx, wd[0], wd[1], w, w / 4); nw.position.set(0, h + 3.3, 0.56); face.add(nw);
      ctx.scene.add(face);
      // chasing bulbs round the board
      var n = 40;
      for (var k = 0; k < n; k++) {
        var t = k / n * 2 * (w + 7.2), bx, by;
        if (t < w + 1.4) { bx = -w / 2 - 0.7 + t; by = h + 6.6; } else if (t < w + 8) { bx = w / 2 + 0.7; by = h + 6.6 - (t - w - 1.4); } else if (t < 2 * w + 9.4) { bx = w / 2 + 0.7 - (t - w - 8); by = h; } else { bx = -w / 2 - 0.7; by = h + (t - 2 * w - 9.4); }
        var v = new T.Vector3(bx, by, 0.6).applyAxisAngle(new T.Vector3(0, 1, 0), yaw);
        bulbsP.push(p.x + v.x, v.y, p.z + v.z); bulbsS.push(k / n);
      }
      var c = new T.Color(wd[1]);
      light(p.x, h, p.z, '#' + c.getHexString(), 22, 26);
    });
    pyl.flush(ctx.scene);
    ctx.scene.add(bulbPoints(T, new Float32Array(bulbsP), new Float32Array(bulbsS), '#FFE9A8', 150));
    // big screens: the race live on some, the city's own shows on the rest
    var tv = ctx.broadcast();
    var showMat = new T.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uBeat: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: [
        'uniform float uTime, uBeat; varying vec2 vUv;',
        'void main() {',
        '  float k = floor(mod(uTime / 6.0, 3.0));',
        '  vec3 c;',
        // three reels of sevens, spinning, stopping in turn
        '  if (k < 0.5) { float col = floor(vUv.x * 3.0); float sp = max(0.0, 4.0 - mod(uTime, 6.0) * (1.0 + col * 0.35)); float y = fract(vUv.y * 1.5 + uTime * sp); float seven = step(0.25, y) * step(y, 0.75) * step(abs(fract(vUv.x * 3.0) - 0.5), 0.3); c = mix(vec3(0.08, 0.0, 0.12), vec3(1.0, 0.15, 0.2), seven) + vec3(1.0, 0.8, 0.2) * step(0.97, fract(vUv.x * 3.0)); }',
        // light waves
        '  else if (k < 1.5) { float w = sin(vUv.x * 12.0 + uTime * 3.0) * 0.5 + 0.5; c = mix(vec3(0.9, 0.1, 0.6), vec3(0.1, 0.8, 1.0), w) * (0.5 + 0.5 * sin(vUv.y * 20.0 - uTime * 6.0)); }',
        // a chequered flag waving
        '  else { vec2 p = vUv * vec2(12.0, 7.0); p.y += sin(p.x * 0.8 + uTime * 3.0) * 0.4; c = vec3(mod(floor(p.x) + floor(p.y), 2.0)); }',
        '  gl_FragColor = vec4(c * (1.6 + 0.8 * uBeat), 1.0);',
        '}',
      ].join('\n'),
    });
    W.showMat = showMat;
    var tvMat = tv ? new T.MeshBasicMaterial({ map: tv, color: hot(T, '#FFFFFF', 1.25) }) : showMat;
    var SCREENS = [[0.07, 1, tvMat], [0.2, -1, showMat], [0.36, 1, tvMat], [0.5, -1, showMat], [0.62, 1, showMat], [0.7, -1, tvMat], [0.83, -1, showMat], [0.9, 1, tvMat]];
    var sb = new Bin(T);
    SCREENS.forEach(function (S, i) {
      var d = S[0] * L, sd = S[1], F = ctx.track.frameAt(d), p = ctx.track.pointAt(d, sd * (HW + 26), 0);
      if (!ctx.track.clear(p.x, p.z, 14)) return;
      var yaw = Math.atan2(F.tan.x, F.tan.z) + (sd > 0 ? -0.9 : 0.9) + Math.PI;
      var w = 26, h = 14.6, y = 14 + (i % 3) * 3;
      var scr = new T.Mesh(new T.PlaneGeometry(w, h), S[2]); scr.position.set(p.x, y, p.z); scr.rotation.y = yaw; ctx.scene.add(scr);
      var bk = new T.BoxGeometry(w + 1, h + 1, 1.2).translate(0, 0, -0.65); bk.rotateY(yaw); bk.translate(p.x, y, p.z); sb.add(bk, frame);
      var leg = new T.BoxGeometry(1.4, y - h / 2, 1.4).translate(0, (y - h / 2) / 2, -1.2); leg.rotateY(yaw); leg.translate(p.x, 0, p.z); sb.add(leg, frame);
      light(p.x, y, p.z, S[2] === tvMat ? '#BCD4FF' : '#FF7AD9', 24, 30);
    });
    sb.flush(ctx.scene);
    // the balloon of light by the Eiffel Tower, and a guitar of neon on the back straight
    var bal = new T.Mesh(new T.SphereGeometry(8, 24, 16).scale(1, 1.2, 1), new T.MeshStandardMaterial({ color: '#1A2A6C', emissive: '#FFFFFF', emissiveMap: ctx.textures.canvas(256, 128, function (g, w, h) { var cols = ['#FF3B3B', '#FFD100', '#3BA0FF', '#FFFFFF']; for (var i = 0; i < 16; i++) { g.fillStyle = cols[i % 4]; g.fillRect(i * w / 16, 0, w / 16, h); } }), emissiveIntensity: 1.6, roughness: 0.5 }));
    bal.position.set(66, 24, -6); ctx.scene.add(bal); light(66, 16, -6, '#FFD27A', 16, 22);
    var gt = neonWord(ctx, 'ROCK', '#FF2E2E', 30, 7.5); gt.position.set(372, 30, 40); gt.rotation.y = -Math.PI / 2; ctx.scene.add(gt);
    light(372, 20, 40, '#FF4040', 18, 26);
  }

  /* --------------------------------------------------------- palms -- */
  function palms(ctx) {
    var T = ctx.THREE, L = ctx.track.length, low = ctx.quality === 'low', R = rng(61), spots = [];
    for (var d = 12; d < L; d += low ? 30 : 17) [-1, 1].forEach(function (sd) {
      var lat = sd * (HW + 13 + R() * 2.5), p = ctx.track.pointAt(d + R() * 4, lat, 0);
      if (ctx.track.clear(p.x, p.z, 10) && R() < 0.8) spots.push({ x: p.x, z: p.z, h: 11 + R() * 6, lean: (R() - 0.5) * 0.18, yaw: R() * 6.28 });
    });
    var trunk = new T.CylinderGeometry(0.22, 0.38, 1, 7, 6).translate(0, 0.5, 0);
    var tp = trunk.attributes.position; for (var i = 0; i < tp.count; i++) tp.setX(i, tp.getX(i) + Math.pow(tp.getY(i), 2) * 0.6);
    trunk.computeVertexNormals();
    var bark = ctx.textures.normal(64, 256, function (g, w, h) { for (var y = 0; y < h; y += 10) { g.fillStyle = '#FFFFFF'; g.fillRect(0, y, w, 4); } }, 3);
    var tm = new T.MeshStandardMaterial({ color: '#6B5540', roughness: 0.9, normalMap: bark, emissive: '#FFB070', emissiveIntensity: 0.08 });
    // a crown of fronds: nine drooping blades
    var parts = [];
    for (var f = 0; f < 9; f++) {
      var g = new T.PlaneGeometry(1.7, 5.2, 2, 8); var p = g.attributes.position;
      for (var k = 0; k < p.count; k++) { var y = p.getY(k) + 2.6; p.setXYZ(k, p.getX(k) * (1 - y / 6.2), Math.sin(y / 5.2 * 1.9) * 1.3 - Math.pow(y / 5.2, 2) * 2.3 - Math.abs(p.getX(k)) * 0.35, y); }
      g.rotateY(f / 9 * Math.PI * 2); parts.push(g);
    }
    var crownG = mergeGeos(T, parts);
    var frond = ctx.textures.canvas(64, 256, function (g, w, h) { g.clearRect(0, 0, w, h); g.fillStyle = '#FFFFFF'; g.fillRect(w / 2 - 2, 0, 4, h); for (var y = 4; y < h - 6; y += 6) { g.beginPath(); g.moveTo(w / 2, y); g.lineTo(3, y + 14); g.lineTo(6, y + 17); g.lineTo(w / 2, y + 5); g.lineTo(w - 6, y + 17); g.lineTo(w - 3, y + 14); g.closePath(); g.fill(); } });
    var fm = new T.MeshStandardMaterial({ color: '#3C6E34', map: frond, alphaTest: 0.4, side: T.DoubleSide, roughness: 0.75, emissive: '#4A7A30', emissiveIntensity: 0.22 });
    var tr = ctx.instanced(trunk, tm, spots.length, function (n, D) { var s = spots[n]; D.position.set(s.x, 0, s.z); D.scale.set(1, s.h, 1); D.rotation.set(0, s.yaw, s.lean); });
    var M = new T.Object3D(), top = new T.Vector3();
    var cr = ctx.instanced(crownG, fm, spots.length, function (n, D) {
      var s = spots[n]; M.position.set(s.x, 0, s.z); M.rotation.set(0, s.yaw, s.lean); M.scale.set(1, s.h, 1); M.updateMatrix();
      top.set(0.6, 1, 0).applyMatrix4(M.matrix); D.position.copy(top); D.rotation.set(0, s.yaw, 0);
    });
    [tr, cr].forEach(function (m) { m.castShadow = false; ctx.scene.add(m); });
    spots.forEach(function (s, n) { if (n % 3 === 0) light(s.x, 1, s.z, '#FFC98A', 5, 6); });
  }
  function mergeGeos(T, list) {
    var n = 0; list.forEach(function (g) { g = g.index ? g.toNonIndexed() : g; n += g.attributes.position.count; });
    var pos = new Float32Array(n * 3), uv = new Float32Array(n * 2), o = 0;
    list.forEach(function (g) { g = g.index ? g.toNonIndexed() : g; pos.set(g.attributes.position.array, o * 3); uv.set(g.attributes.uv.array, o * 2); o += g.attributes.position.count; });
    var geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(pos, 3)); geo.setAttribute('uv', new T.BufferAttribute(uv, 2)); geo.computeVertexNormals(); return geo;
  }

  /* --------------------------------------------------------- the crowd -- */
  function crowds(ctx) {
    var T = ctx.THREE, L = ctx.track.length, low = ctx.quality === 'low', R = rng(71), people = [];
    // along the pavements behind the fence, thickest down the Strip and on the pit straight
    for (var d = 0; d < L; d += low ? 2.4 : 1.1) {
      var u = d / L, dense = (u > 0.5 && u < 0.86) || u < 0.06 || u > 0.93 ? 1 : 0.35;
      [-1, 1].forEach(function (sd) {
        for (var row = 0; row < 3; row++) {
          if (R() > dense * (row ? 0.55 : 0.9)) continue;
          var p = ctx.track.pointAt(d + R() * 0.8, sd * (HW + 2.8 + row * 1.1 + R() * 0.4), 0), F = ctx.track.frameAt(d);
          people.push({ x: p.x, y: 0, z: p.z, yaw: Math.atan2(-F.right.x * sd, -F.right.z * sd), s: R() });
        }
      });
    }
    // grandstands: rows rising away from the road on the pit straight and the Strip
    [[0.965, 0.03, 1], [0.6, 0.66, -1], [0.72, 0.76, -1]].forEach(function (G) {
      for (var d2 = G[0] * L; d2 < (G[1] < G[0] ? G[1] + 1 : G[1]) * L; d2 += low ? 1.6 : 0.8) {
        var dd = d2 % L, F2 = ctx.track.frameAt(dd);
        for (var r2 = 0; r2 < (low ? 6 : 12); r2++) {
          if (R() < 0.12) continue;
          var q = ctx.track.pointAt(dd, G[2] * (HW + 14 + r2 * 0.9), 0);
          people.push({ x: q.x, y: 0.5 + r2 * 0.55, z: q.z, yaw: Math.atan2(-F2.right.x * G[2], -F2.right.z * G[2]), s: R(), stand: true });
        }
      }
      // the stand itself
    });
    var parts = [];
    function add(geo, part) { var n = geo.attributes.position.count, a = new Float32Array(n); a.fill(part); geo.setAttribute('part', new T.BufferAttribute(a, 1)); parts.push(geo.index ? geo.toNonIndexed() : geo); }
    add(new T.BoxGeometry(0.42, 0.62, 0.26).translate(0, 1.18, 0), 0);
    add(new T.SphereGeometry(0.12, 7, 5).scale(1, 1.15, 1).translate(0, 1.64, 0), 1);
    add(new T.BoxGeometry(0.36, 0.86, 0.24).translate(0, 0.43, 0), 2);
    [-1, 1].forEach(function (sd) { add(new T.BoxGeometry(0.11, 0.58, 0.11).translate(sd * 0.27, 1.2, 0), 3); });
    var nv = 0; parts.forEach(function (g) { nv += g.attributes.position.count; });
    var pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), part = new Float32Array(nv), o = 0;
    parts.forEach(function (g) { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); part.set(g.attributes.part.array, o); o += g.attributes.position.count; });
    var geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(pos, 3)); geo.setAttribute('normal', new T.BufferAttribute(nor, 3)); geo.setAttribute('part', new T.BufferAttribute(part, 1));
    var seed = new Float32Array(people.length); people.forEach(function (p, k) { seed[k] = p.s; });
    geo.setAttribute('aSeed', new T.InstancedBufferAttribute(seed, 1));
    var mat = new T.MeshStandardMaterial({ roughness: 0.8 });
    W.crowdU = { uTime: { value: 0 }, uBeat: { value: 0 }, uNear: { value: new T.Vector3() } };
    mat.onBeforeCompile = function (sh) {
      Object.assign(sh.uniforms, W.crowdU);
      sh.vertexShader = 'attribute float part; attribute float aSeed; uniform float uTime, uBeat; uniform vec3 uNear;\n' + sh.vertexShader
        .replace('#include <begin_vertex>', [
          '#include <begin_vertex>',
          // everyone near the cars jumps and throws their arms up as they pass
          'vec4 gw = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);',
          'float near = 1.0 - smoothstep(10.0, 60.0, distance(gw.xz, uNear.xz));',
          'float own = smoothstep(0.85, 0.98, sin(uTime * (0.8 + aSeed * 1.4) + aSeed * 60.0));',
          'float cheer = max(near * (0.6 + 0.4 * sin(uTime * 7.0 + aSeed * 30.0)), own) ;',
          'if (part > 2.5) { float side = sign(transformed.x); vec3 s0 = vec3(side * 0.27, 1.46, 0.0); float a = -cheer * 2.8; vec3 p = transformed - s0; float c = cos(a), s = sin(a); transformed = s0 + vec3(p.x * c - p.y * s * side * 0.0 + p.x * 0.0, p.y * c + 0.0, p.y * s + p.z * c); }',
          'transformed.y += (near * 0.25 + uBeat * 0.08) * max(0.0, sin(uTime * 9.0 + aSeed * 40.0));',
        ].join('\n'))
        .replace('#include <color_vertex>', [
          '#include <color_vertex>',
          '#ifdef USE_INSTANCING_COLOR',
          'float tone = fract(aSeed * 7.13);',
          'vec3 skin = mix(mix(vec3(0.93, 0.72, 0.58), vec3(0.55, 0.36, 0.24), smoothstep(0.35, 0.75, tone)), vec3(0.28, 0.18, 0.12), smoothstep(0.8, 0.98, tone));',
          'if (part > 0.5 && part < 1.5) vColor = skin;',
          'else if (part > 1.5 && part < 2.5) vColor = mix(vec3(0.07, 0.08, 0.1), vec3(0.18, 0.24, 0.36), step(0.55, aSeed));',
          '#endif',
        ].join('\n'));
    };
    var im = new T.InstancedMesh(geo, mat, people.length), D = new T.Object3D(), col = new T.Color();
    var TOPS = ['#E8E6E0', '#15161B', '#C8102E', '#1B3FA6', '#F2B705', '#00A3AD', '#FF7AD9', '#6E6E78', '#2E8B57', '#F36C21', '#101828', '#B04DFF'];
    people.forEach(function (p, k) { D.position.set(p.x, p.y, p.z); D.rotation.set(0, p.yaw, 0); D.scale.setScalar(0.9 + p.s * 0.2); D.updateMatrix(); im.setMatrixAt(k, D.matrix); im.setColorAt(k, col.set(TOPS[Math.floor(p.s * 997) % TOPS.length])); });
    im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true;
    im.frustumCulled = false; im.userData.noReflection = true; ctx.scene.add(im);
    // the stands' steps under the fans
    var sb = new Bin(T), steel = new T.MeshStandardMaterial({ color: '#2A2C33', roughness: 0.6, metalness: 0.4 });
    [[0.965, 0.03, 1], [0.6, 0.66, -1], [0.72, 0.76, -1]].forEach(function (G) {
      for (var d3 = G[0] * L; d3 < (G[1] < G[0] ? G[1] + 1 : G[1]) * L; d3 += 6) {
        var dd = d3 % L, F3 = ctx.track.frameAt(dd), yaw = Math.atan2(F3.tan.x, F3.tan.z);
        for (var r3 = 0; r3 < 12; r3 += 1) { var q = ctx.track.pointAt(dd, G[2] * (HW + 14 + r3 * 0.9), 0); var g = new T.BoxGeometry(6.2, 0.5 + r3 * 0.55, 0.9).translate(0, (0.5 + r3 * 0.55) / 2, 0); g.rotateY(yaw); g.translate(q.x, 0, q.z); sb.add(g, steel); }
        if (Math.round(d3 / 6) % 3 === 0) { var fl = ctx.track.pointAt(dd, G[2] * (HW + 26), 0); light(fl.x, 14, fl.z, '#E8F0FF', 8, 22); }
      }
    });
    sb.flush(ctx.scene);
    // phones held up, flashing
    var nf = low ? 180 : 620, fp = new Float32Array(nf * 3), fs = new Float32Array(nf);
    for (var k = 0; k < nf; k++) { var st = people[Math.floor(R() * people.length)]; fp[k * 3] = st.x; fp[k * 3 + 1] = st.y + 2.0; fp[k * 3 + 2] = st.z; fs[k] = R(); }
    var fgeo = new T.BufferGeometry(); fgeo.setAttribute('position', new T.BufferAttribute(fp, 3)); fgeo.setAttribute('seed', new T.BufferAttribute(fs, 1));
    var flashes = new T.Points(fgeo, new T.ShaderMaterial({
      transparent: true, depthWrite: false, blending: T.AdditiveBlending, uniforms: { uTime: W.crowdU.uTime },
      vertexShader: 'attribute float seed; uniform float uTime; varying float vF; void main() { float c = fract(uTime * (0.16 + seed * 0.22) + seed * 17.0); vF = smoothstep(0.0, 0.01, c) * (1.0 - smoothstep(0.012, 0.035, c)); vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = vF > 0.0 ? 700.0 / -mv.z : 0.0; gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'varying float vF; void main() { vec2 q = gl_PointCoord - 0.5; float d = dot(q, q); if (d > 0.25) discard; gl_FragColor = vec4(vec3(6.0, 6.2, 6.6) * vF * pow(1.0 - d * 4.0, 3.0), 1.0); }',
    }));
    flashes.frustumCulled = false; flashes.userData.noReflection = true; ctx.scene.add(flashes);
    // footbridges over the Strip, with people on them
    [0.585, 0.78].forEach(function (u) {
      var d = u * L, F = ctx.track.frameAt(d), yaw = Math.atan2(F.tan.x, F.tan.z), c0 = ctx.track.pointAt(d, 0, 0);
      var deck = new T.Mesh(new T.BoxGeometry(HW * 2 + 26, 1.4, 6), new T.MeshStandardMaterial({ color: '#DADCE2', roughness: 0.5, metalness: 0.3, emissive: '#FFFFFF', emissiveIntensity: 0.05 }));
      deck.geometry.rotateY(yaw + Math.PI / 2); deck.position.set(c0.x, 9.6, c0.z); ctx.scene.add(deck);
      var glassSide = new T.Mesh(new T.BoxGeometry(HW * 2 + 26, 1.4, 0.1), new T.MeshBasicMaterial({ color: hot(T, '#2EE6FF', 2.2) }));
      glassSide.geometry.rotateY(yaw + Math.PI / 2); glassSide.position.set(c0.x, 8.8, c0.z); ctx.scene.add(glassSide);
      [-1, 1].forEach(function (sd) { var t = ctx.track.pointAt(d, sd * (HW + 16), 0); var tw = new T.Mesh(new T.BoxGeometry(7, 11, 7), new T.MeshStandardMaterial({ color: '#C8CAD0', roughness: 0.6 })); tw.position.set(t.x, 5.5, t.z); ctx.scene.add(tw); });
      light(c0.x, 8, c0.z, '#BCEFFF', 16, 18);
    });
  }

  /* -------------------------------------------- the sky show: drones, fireworks, searchlights -- */
  function skyShow(ctx) {
    var T = ctx.THREE, low = ctx.quality === 'low', N = low ? 260 : 600;
    // drones: a swarm that draws shapes over the south end of the Strip
    var dp = new Float32Array(N * 3), dc = new Float32Array(N * 3);
    var g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(dp, 3)); g.setAttribute('color', new T.BufferAttribute(dc, 3));
    var drones = new T.Points(g, new T.ShaderMaterial({
      transparent: true, depthWrite: false, blending: T.AdditiveBlending, vertexColors: true,
      vertexShader: 'varying vec3 vC; void main() { vC = color; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = 2600.0 / -mv.z; gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'varying vec3 vC; void main() { vec2 q = gl_PointCoord - 0.5; float d = dot(q, q); if (d > 0.25) discard; gl_FragColor = vec4(vC * 4.0 * pow(1.0 - d * 4.0, 2.0), 1.0); }',
    }));
    drones.frustumCulled = false; drones.userData.noReflection = true; ctx.scene.add(drones);
    // shapes: words and pictures drawn on a canvas and sampled into points
    function sample(draw) {
      var cv = { w: 256, h: 96 }, pts = [];
      var tex = ctx.textures.canvas(cv.w, cv.h, function (gg, w, h) { gg.fillStyle = '#000'; gg.fillRect(0, 0, w, h); gg.fillStyle = '#FFF'; draw(gg, w, h); });
      var img = tex.image.getContext('2d').getImageData(0, 0, cv.w, cv.h).data;
      for (var y = 0; y < cv.h; y += 2) for (var x = 0; x < cv.w; x += 2) if (img[(y * cv.w + x) * 4] > 128) pts.push([x / cv.w - 0.5, 0.5 - y / cv.h]);
      tex.dispose();
      var out = new Float32Array(N * 2), R = rng(pts.length);
      for (var i = 0; i < N; i++) { var p = pts.length ? pts[Math.floor(R() * pts.length)] : [0, 0]; out[i * 2] = p[0]; out[i * 2 + 1] = p[1]; }
      return out;
    }
    function text(s, size) { return function (gg, w, h) { gg.font = '900 ' + (size || 64) + 'px "Arial Black", Arial, sans-serif'; gg.textAlign = 'center'; gg.textBaseline = 'middle'; gg.fillText(s, w / 2, h / 2, w * 0.95); }; }
    var SHAPES = [
      { pts: sample(text('LAS VEGAS', 50)), col: ['#FF2E88', '#FFD100'] },
      { pts: sample(function (gg, w, h) { for (var y = 0; y < 4; y++) for (var x = 0; x < 10; x++) if ((x + y) % 2) gg.fillRect(58 + x * 14, 20 + y * 14, 14, 14); gg.fillRect(54, 16, 3, 76); }), col: ['#FFFFFF', '#FFFFFF'] },
      { pts: sample(text('NIGHT GP', 54)), col: ['#2EE6FF', '#B04DFF'] },
      { pts: sample(function (gg, w, h) { gg.beginPath(); gg.moveTo(40, 70); gg.lineTo(80, 70); gg.lineTo(95, 50); gg.lineTo(150, 45); gg.lineTo(185, 55); gg.lineTo(215, 60); gg.lineTo(220, 70); gg.lineTo(40, 72); gg.fill(); gg.beginPath(); gg.arc(80, 74, 11, 0, 7); gg.arc(190, 74, 11, 0, 7); gg.fill(); }), col: ['#C9CED6', '#00B8AE'] },
      { pts: sample(text('777', 80)), col: ['#FF2E2E', '#FFB000'] },
    ];
    W.drones = { geo: g, pos: dp, col: dc, shapes: SHAPES, cur: 0, t: 0, from: new Float32Array(N * 2), to: SHAPES[0].pts, N: N, sample: sample, text: text, cx: -40, cy: 175, cz: 420, w: 240, h: 90 };
    for (var i = 0; i < N * 2; i++) W.drones.from[i] = W.drones.to[i];
    // fireworks: shells that burst over the lake on every lap
    var FN = low ? 700 : 1800, fp = new Float32Array(FN * 3), fv = new Float32Array(FN * 3), fl = new Float32Array(FN), fc = new Float32Array(FN * 3);
    var fg = new T.BufferGeometry(); fg.setAttribute('position', new T.BufferAttribute(fp, 3)); fg.setAttribute('color', new T.BufferAttribute(fc, 3)); fg.setAttribute('life', new T.BufferAttribute(fl, 1));
    var fw = new T.Points(fg, new T.ShaderMaterial({
      transparent: true, depthWrite: false, blending: T.AdditiveBlending, vertexColors: true,
      vertexShader: 'attribute float life; varying vec3 vC; varying float vL; void main() { vC = color; vL = life; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = life > 0.0 ? 2200.0 * (0.4 + life) / -mv.z : 0.0; gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'varying vec3 vC; varying float vL; void main() { vec2 q = gl_PointCoord - 0.5; float d = dot(q, q); if (d > 0.25) discard; gl_FragColor = vec4(vC * 5.0 * min(1.0, vL * 1.4) * pow(1.0 - d * 4.0, 2.0), 1.0); }',
    }));
    fw.frustumCulled = false; fw.userData.noReflection = true; ctx.scene.add(fw);
    W.fw = { geo: fg, p: fp, v: fv, life: fl, c: fc, n: FN, next: 0, queue: [] };
    // searchlights sweeping from the rooftops, and the fixed beams
    var beamMat = new T.ShaderMaterial({
      uniforms: { uColor: { value: new T.Vector3(1, 1, 1) } }, transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide,
      vertexShader: 'varying float vY; varying float vR; void main() { vY = uv.y; vec4 wp = modelMatrix * vec4(position, 1.0); vec3 n = normalize(mat3(modelMatrix) * normal); vR = abs(dot(n, normalize(cameraPosition - wp.xyz))); gl_Position = projectionMatrix * viewMatrix * wp; }',
      fragmentShader: 'uniform vec3 uColor; varying float vY; varying float vR; void main() { float a = pow(vR, 2.4) * pow(1.0 - vY, 1.8) * 0.3; gl_FragColor = vec4(uColor * a, 1.0); }',
    });
    W.beams = W.beams || [];
    [[-185, 150, -130, '#E8F0FF'], [-120, 186, 300, '#FFD6F0'], [230, 172, -560, '#FFE9C8'], [420, 102, 120, '#D8F4FF']].forEach(function (b, i) { W.beams.push({ x: b[0], y: b[1], z: b[2], hex: b[3], len: 1300, w: 6, speed: 0.22 + i * 0.05, phase: i * 1.7 }); });
    W.beams.forEach(function (b) {
      var m = beamMat.clone(); var c = new T.Color(b.hex); m.uniforms.uColor.value.set(c.r, c.g, c.b);
      var cone = new T.Mesh(new T.CylinderGeometry(b.w * (b.fixed ? 1 : 6), b.w * 0.25, b.len, 20, 1, true).translate(0, b.len / 2, 0), m);
      cone.position.set(b.x, b.y, b.z); cone.userData.noReflection = true; cone.frustumCulled = false; ctx.scene.add(cone); b.mesh = cone;
    });
  }
  // a shell: a burst of a few hundred stars in one or two colours
  function burst(x, y, z, hexA, hexB, n) {
    var F = W.fw; if (!F) return;
    var ca = new (W.T.Color)(hexA), cb = new (W.T.Color)(hexB);
    for (var i = 0; i < n; i++) {
      var j = F.next++ % F.n, u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u), sp = 22 + Math.random() * 10;
      F.p[j * 3] = x; F.p[j * 3 + 1] = y; F.p[j * 3 + 2] = z;
      F.v[j * 3] = Math.cos(a) * s * sp; F.v[j * 3 + 1] = u * sp; F.v[j * 3 + 2] = Math.sin(a) * s * sp;
      F.life[j] = 1.4 + Math.random() * 0.8; var c = i % 2 ? ca : cb; F.c[j * 3] = c.r; F.c[j * 3 + 1] = c.g; F.c[j * 3 + 2] = c.b;
    }
  }

  /* -------------------------------------------------- the cars on the grid -- */
  var PLAYER = { kind: 'hypercar', paint: '#BCC1C7', trim: '#16181B', accent: '#00B8AE', pattern: 'arrow', number: '7', livery: 'SILVER ARROW', rims: '#A5ACB5', calipers: '#00B8AE', driver: { suit: '#16181B', helmet: '#D8DCE0' }, name: 'Silver Arrow', color: '#BCC1C7' };
  var FIELD = [
    { kind: 'formula', name: 'Aurora GP', number: '27', paint: '#0E7C86', trim: '#F2F2F2', accent: '#FFB000', pattern: 'split', livery: 'AURORA' },
    { kind: 'stockcar', name: 'Strip King', number: '88', paint: '#1B3FA6', trim: '#F4F4F2', accent: '#E03030', pattern: 'bands', livery: 'STRIP KING' },
    { kind: 'monster', name: 'Big Iron', number: '1', paint: '#1E7A34', trim: '#F2B705', accent: '#E0401B', pattern: 'flames', livery: 'BIG IRON' },
    { kind: 'formula', name: 'Scuderia Neon', number: '16', paint: '#C8102E', trim: '#1A1A1A', accent: '#FFD100', pattern: 'split', livery: 'NEON', glow: '#FF2A2A' },
    { kind: 'stockcar', name: 'Midnight Bandit', number: '3', paint: '#141416', trim: '#D4A537', accent: '#D4A537', pattern: 'bands', livery: 'BANDIT', glow: '#FFB020' },
    { kind: 'monster', name: 'Jackpot Jaws', number: '777', paint: '#5B2A86', trim: '#F2F2F2', accent: '#FF3B8A', pattern: 'teeth', livery: 'JACKPOT JAWS', spikes: true, glow: '#B04DFF' },
    { kind: 'formula', name: 'Desert Viper', number: '99', paint: '#101311', trim: '#39FF14', accent: '#39FF14', pattern: 'arrow', livery: 'VIPER', iridescent: true, glow: '#39FF14' },
    { kind: 'stockcar', name: 'High Roller', number: '13', paint: '#C9CCD1', trim: '#101010', accent: '#FF2E88', pattern: 'stripes', livery: 'HIGH ROLLER', chrome: true, glow: '#FF2E88' },
    { kind: 'monster', name: 'Sin City Smasher', number: '66', paint: '#8E0F14', trim: '#111111', accent: '#FF6A00', pattern: 'flames', livery: 'SIN CITY', spikes: true, glow: '#FF3000' },
  ];
  var ROMAN = ['', ' II', ' III', ' IV', ' V', ' VI'];
  function fallbackCar(ctx, hex) {
    // without the platform's car kit: a wedge of a car, still a car
    var T = ctx.THREE, g = new T.Group(), m = new T.MeshStandardMaterial({ color: hex, roughness: 0.3, metalness: 0.5 });
    var b = new T.Mesh(new T.BoxGeometry(1.9, 0.7, 4.6), m); b.position.y = 0.55; g.add(b);
    var c = new T.Mesh(new T.BoxGeometry(1.3, 0.5, 1.8), new T.MeshStandardMaterial({ color: '#111318', roughness: 0.1 })); c.position.set(0, 1.1, -0.2); g.add(c);
    [[0.9, 1.4], [-0.9, 1.4], [0.9, -1.4], [-0.9, -1.4]].forEach(function (w) { var t = new T.Mesh(new T.CylinderGeometry(0.34, 0.34, 0.3, 16).rotateZ(Math.PI / 2), new T.MeshStandardMaterial({ color: '#111' })); t.position.set(w[0], 0.34, w[1]); g.add(t); });
    return { object: g, radius: 1.0, name: 'Car', color: hex };
  }

  /* ------------------------------------------------------------ the world -- */
  GameMog.world({
    assets: ['texture-asphalt-track'],
    play: { vehicle: true, bounty: { base: 250, step: 250, name: 'Jackpot' } },
    music: { track: 'music-hyper-ultra-racing' },
    theme: { sky: '#0A0B14', fog: '#1A1222', ink: '#FFFFFF', accent: '#00D1C1', font: 'Bungee' },
    graphics: {
      exposure: 1.1,
      environment: { extras: function (ctx) {
        // the city's colours for every glossy surface: signs and screens round the horizon, the glow of the street below
        var T = ctx.THREE, g = new T.Group();
        [['#FF2E88', 0.3, 8], ['#2EE6FF', 1.4, 6], ['#FFD100', 2.3, 7], ['#B04DFF', 3.3, 6], ['#FF6A3D', 4.2, 6], ['#FFFFFF', 5.2, 4], ['#FFC870', 5.8, 7]].forEach(function (s) {
          var m = new T.Mesh(new T.PlaneGeometry(18, 7), new T.MeshBasicMaterial({ color: hot(T, s[0], s[2]), side: T.DoubleSide }));
          m.position.set(Math.cos(s[1]) * 60, 8, Math.sin(s[1]) * 60); m.lookAt(0, 4, 0); g.add(m);
        });
        var street = new T.Mesh(new T.PlaneGeometry(300, 300), new T.MeshBasicMaterial({ color: hot(T, '#3A2A24', 1), side: T.DoubleSide })); street.rotation.x = -Math.PI / 2; street.position.y = -3; g.add(street);
        return g;
      } },
      bloom: { strength: 0.9, threshold: 1.15, radius: 0.8 },
      grade: { contrast: 1.08, saturation: 1.14, warmth: 0.04, vignette: 0.34, grain: 0.012 },
      shadows: { extent: 40, mapSize: 2048 },
      reflections: true,
      motion: 0.5,
    },
    camera: { distance: 6.6, height: 2.1, fov: 62, look: 1.0 },
    track: { points: ROUTE, width: HW * 2 },

    build: function (ctx) {
      var T = ctx.THREE; W.T = T; W.ctx = ctx; W.low = ctx.quality === 'low';
      sky(ctx);
      ctx.scene.add(new T.HemisphereLight('#5A5E8C', '#3A2A22', 0.7));
      var moon = new T.DirectionalLight('#C4D0FF', 0.7); moon.position.set(-40, 120, -60); moon.castShadow = true; moon.shadow.mapSize.set(1024, 1024); ctx.scene.add(moon); ctx.scene.add(moon.target);
      // the street's light on the cars: a lamp that rides above and behind the camera
      W.carLight = new T.PointLight('#FFE6CC', 40, 26, 1.6); ctx.scene.add(W.carLight);
      road(ctx);
      furniture(ctx);
      cityscape(ctx);
      landmarks(ctx);
      signs(ctx);
      palms(ctx);
      crowds(ctx);
      skyShow(ctx);
      bakeLight(ctx);
      ctx.on('beat', function (b) { W.beat = 1; W.bar = b.bar; if (b.beat === 0) W.down = 1; });
      ctx.on('start', function () { W.start = W.t; });
      ctx.on('lap', function (e) {
        W.lap = e.level;
        // a jackpot over the lake: shells in the city's colours, and the volcano goes up
        var cols = [['#FF2E88', '#FFD100'], ['#2EE6FF', '#FFFFFF'], ['#FFB000', '#FF3B3B'], ['#B04DFF', '#7DF9FF']];
        for (var i = 0; i < 6; i++) W.fw.queue.push({ at: W.t + i * 0.35, x: -120 + (i % 3 - 1) * 50, y: 130 + (i % 2) * 40, z: 60 + Math.floor(i / 2) * 60, c: cols[(i + e.level) % 4] });
        if (W.volcano) W.volcano.t = W.t;
        var D = W.drones; if (D) { for (var k = 0; k < D.N * 2; k++) D.from[k] = D.to[k]; D.to = D.sample(D.text('LAP ' + e.level, 70)); D.t = 0; D.hold = 8; D.lapCol = true; }
      });
      ctx.on('crash', function () { W.crashT = W.t; });
    },

    player: function (ctx) {
      var c = ctx.assets.car(PLAYER);
      return c || fallbackCar(ctx, '#BCC1C7');
    },

    rival: function (ctx, k) {
      var base = FIELD[(k - 1) % FIELD.length], lap = Math.floor((k - 1) / FIELD.length), o = Object.assign({}, base);
      o.name = base.name + ROMAN[Math.min(lap, ROMAN.length - 1)] + (lap >= ROMAN.length ? ' ' + (lap + 1) : '');
      if (lap > 0) {
        // the next generation: the colour turned round the wheel, and they all glow
        var c = new ctx.THREE.Color(base.paint), hsl = {}; c.getHSL(hsl); c.setHSL((hsl.h + 0.18 * lap) % 1, Math.max(0.5, hsl.s), Math.min(0.55, Math.max(0.2, hsl.l)));
        o.paint = '#' + c.getHexString(); o.glow = o.glow || base.accent; o.spikes = base.kind === 'monster';
      }
      o.color = o.paint;
      var car = ctx.assets.car(o);
      if (!car) return fallbackCar(ctx, o.paint);
      car.name = o.name; car.color = o.paint;
      return car;
    },

    obstacles: function (ctx) {
      var T = ctx.THREE, list = [], R = rng(91), L = ctx.track.length;
      var rubber = new T.MeshStandardMaterial({ color: '#141416', roughness: 0.85 });
      var white = new T.MeshStandardMaterial({ color: '#E8E6E0', roughness: 0.6 });
      var orange = new T.MeshStandardMaterial({ color: '#FF6A13', roughness: 0.5, emissive: '#FF4A00', emissiveIntensity: 0.25 });
      var concrete = new T.MeshStandardMaterial({ color: '#B8B6B0', roughness: 0.8 });
      function tyres() {
        // a stack of tyres, strapped, with a white band
        var g = new T.Group(), tg = new T.TorusGeometry(0.34, 0.16, 8, 18).rotateX(Math.PI / 2);
        for (var i = 0; i < 3; i++) for (var j = 0; j < 4; j++) { var m = new T.Mesh(tg, j % 2 ? white : rubber); m.position.set((i - 1) * 0.72, 0.16 + j * 0.3, 0); g.add(m); }
        return { object: g };
      }
      function cones() {
        var g = new T.Group(), cg = new T.ConeGeometry(0.22, 0.75, 12).translate(0, 0.375, 0);
        [[-0.7, 0], [0, 0.3], [0.7, -0.1]].forEach(function (p) { var c = new T.Mesh(cg, orange); c.position.set(p[0], 0, p[1]); g.add(c); var b = new T.Mesh(new T.CylinderGeometry(0.155, 0.19, 0.12, 12).translate(0, 0.42, 0), white); b.position.copy(c.position); g.add(b); });
        return { object: g };
      }
      function block() {
        var g = new T.Group(), m = new T.Mesh(new T.BoxGeometry(2.4, 0.95, 0.7).translate(0, 0.47, 0), concrete); g.add(m);
        var stripe = new T.Mesh(new T.BoxGeometry(2.42, 0.2, 0.72).translate(0, 0.7, 0), orange); g.add(stripe);
        return { object: g };
      }
      function manhole() {
        // a blown drain cover, steam pouring out of the hole
        var g = new T.Group();
        var ring = new T.Mesh(new T.CylinderGeometry(0.75, 0.75, 0.08, 20).translate(0, 0.04, 0), new T.MeshStandardMaterial({ color: '#2A2A2E', metalness: 0.7, roughness: 0.5 })); g.add(ring);
        var lid = new T.Mesh(new T.CylinderGeometry(0.7, 0.7, 0.08, 20), new T.MeshStandardMaterial({ color: '#3A3A40', metalness: 0.8, roughness: 0.4 })); lid.position.set(0.3, 0.5, -0.2); lid.rotation.set(1.1, 0, 0.4); g.add(lid);
        var steam = new T.Mesh(new T.CylinderGeometry(1.4, 0.6, 4.5, 16, 1, true).translate(0, 2.25, 0), new T.ShaderMaterial({ uniforms: { uTime: { value: 0 } }, transparent: true, depthWrite: false, side: T.DoubleSide,
          vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
          fragmentShader: 'uniform float uTime; varying vec2 vUv; float h(vec2 p) { return fract(sin(dot(p, vec2(12.9, 78.2))) * 43758.5); } float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); } void main() { float s = n(vec2(vUv.x * 8.0, vUv.y * 3.0 - uTime * 1.5)) * n(vec2(vUv.x * 4.0 + 3.0, vUv.y * 2.0 - uTime)); gl_FragColor = vec4(vec3(0.8, 0.82, 0.86), s * (1.0 - vUv.y) * 0.8); }' }));
        g.add(steam); W.steams = W.steams || []; W.steams.push(steam.material);
        return { object: g };
      }
      function wreck() {
        // a crashed car, nose in, its hazards blinking
        var c = ctx.assets.car({ kind: ['formula', 'stockcar'][Math.floor(R() * 2)], paint: '#4A4E56', trim: '#1A1A1A', accent: '#FF6A13', number: String(10 + Math.floor(R() * 80)), pattern: 'bands' });
        if (!c) return tyres();
        var fx = []; c.object.traverse(function (o) { if (o.userData && o.userData.gmFx) fx.push(o); });
        fx.forEach(function (o) { if (o.parent) o.parent.remove(o); });
        var g = new T.Group(); c.object.rotation.y = Math.PI / 2 + (R() - 0.5) * 0.6; c.object.rotation.z = 0.05; g.add(c.object);
        var haz = new T.Mesh(new T.SphereGeometry(0.12, 8, 6), new T.MeshBasicMaterial({ color: hot(T, '#FFA000', 6) })); haz.position.set(0, 1.25, 0); g.add(haz);
        W.hazards = W.hazards || []; W.hazards.push(haz);
        return { object: g };
      }
      function looseTyre() {
        var g = new T.Group(), t = new T.Mesh(new T.TorusGeometry(0.28, 0.14, 10, 22), rubber); t.position.y = 0.44; g.add(t);
        var rim = new T.Mesh(new T.CylinderGeometry(0.2, 0.2, 0.2, 16).rotateX(Math.PI / 2), new T.MeshStandardMaterial({ color: '#A5ACB5', metalness: 1, roughness: 0.3 })); rim.position.y = 0.44; g.add(rim);
        return { object: g, animate: function (t) { g.children.forEach(function (c) { c.rotation.z = t * 9; c.position.y = 0.44 + Math.abs(Math.sin(t * 5.5)) * 0.6; }); } };
      }
      var KINDS = [tyres, cones, block, manhole, wreck, tyres, cones, block];
      // spread round the lap past the grid: one hazard about every 60 m, in varying lanes
      var n = 30, at = 0.075;
      for (var i = 0; i < n; i++) {
        at += (0.9 - 0.075) / n * (0.7 + R() * 0.6);
        if (at > 0.975) break;
        var k = i % 7 === 3 ? looseTyre : KINDS[Math.floor(R() * KINDS.length)], o = k();
        var lane = [-5.2, -2.6, 0, 2.6, 5.2][Math.floor(R() * 5)];
        o.at = at; o.x = lane;
        if (k === looseTyre) { o.x = 0; o.move = { amplitude: 4, period: 2.6 + R() }; }
        list.push(o);
      }
      return list;
    },

    update: function (ctx, t, dt) {
      var T = ctx.THREE; W.t = t;
      W.beat = Math.max(0, W.beat - dt * 3.2); W.down = Math.max(0, (W.down || 0) - dt * 1.6);
      if (W.stars) W.stars.material.uniforms.uTime.value = t;
      if (W.carLight) { var cl = ctx.camera.position; W.carLight.position.set(cl.x, cl.y + 4.5, cl.z); }
      if (W.crowdU) {
        W.crowdU.uTime.value = t; W.crowdU.uBeat.value = W.beat;
        // the cars are where the crowd looks: the camera's spot, a little ahead
        W.crowdU.uNear.value.copy(ctx.camera.position);
      }
      (W.chasers || []).forEach(function (m) { m.uniforms.uTime.value = t; });
      if (W.showMat) { W.showMat.uniforms.uTime.value = t; W.showMat.uniforms.uBeat.value = W.beat; }
      (W.steams || []).forEach(function (m) { m.uniforms.uTime.value = t; });
      (W.hazards || []).forEach(function (h, i) { h.visible = Math.sin(t * 7 + i) > 0; });
      /* the start lights: five pairs on through the count, all out on the go */
      if (W.startLights) {
        var since = t - W.start, on = since >= 0 && since < 3.0 ? Math.min(5, Math.floor(since / 0.55) + 1) : 0;
        W.startLights.forEach(function (b, i) { b.material.color.setRGB(Math.floor(i / 2) < on ? 9 : 0.02, 0.02, 0.02); });
      }
      /* the Sphere: the eye follows the cars, then the planet, the flag, rings, the race live */
      if (W.sphereMat) {
        var U = W.sphereMat.uniforms, cyc = t / 14, m = Math.floor(cyc) % 5, f = cyc - Math.floor(cyc);
        U.uTime.value = t; U.uMode.value = m; U.uMix.value = smooth(0.88, 1.0, f); U.uBeat.value = W.beat;
        if (!U.uHasTV.value) { var tv = ctx.broadcast(); if (tv) { U.uTV.value = tv; U.uHasTV.value = 1; } }
        var cp = ctx.camera.position; U.uLook.value.set(cp.x - W.sphere.position.x, cp.y - W.sphere.position.y + 12, cp.z - W.sphere.position.z).normalize();
      }
      if (W.eiffelSparkle) { W.eiffelSparkle.uniforms.uTime.value = t; W.eiffelSparkle.uniforms.uOn.value = Math.floor(t / 20) % 2 ? 1 : 0.2; }
      /* the wheel turns, slowly */
      if (W.wheel) { W.wheel.grp.rotation.x = t * 0.02; W.wheel.mat.uniforms.uTime.value = t; W.wheel.mat.uniforms.uBeat.value = W.beat; }
      /* the fountains: a show every half minute, jets on the beat */
      if (W.jets) {
        var J = W.jets, show = (t % 34) < 22, D = J.D;
        for (var i = 0; i < J.list.length; i++) {
          var jt = J.list[i], want = 0;
          if (show) {
            var ph = (t % 34);
            if (jt[2] === 0) want = (Math.sin(i * 0.5 - ph * 3) * 0.5 + 0.5) * 28 + W.down * 14;
            else if (jt[2] === 1) want = ph > 6 ? (18 + 34 * W.beat) * (0.6 + 0.4 * Math.sin(i * 0.7 + ph * 2)) : 0;
            else want = ph > 12 ? 60 + 25 * Math.sin(ph * 1.5 + i) : 0;
          }
          J.h[i] += (want - J.h[i]) * Math.min(1, dt * (want > J.h[i] ? 9 : 3));
          D.position.set(jt[0], 0, jt[1]); D.scale.set(1 + J.h[i] * 0.02, Math.max(0.01, J.h[i]), 1 + J.h[i] * 0.02); D.updateMatrix(); J.mesh.setMatrixAt(i, D.matrix);
        }
        J.mesh.instanceMatrix.needsUpdate = true;
      }
      /* the volcano: lava rising after a lap */
      if (W.volcano && W.fw) {
        var vs = t - W.volcano.t;
        if (vs >= 0 && vs < 5 && Math.random() < dt * 30) {
          var F = W.fw, j = F.next++ % F.n;
          F.p[j * 3] = W.volcano.x; F.p[j * 3 + 1] = W.volcano.y; F.p[j * 3 + 2] = W.volcano.z;
          F.v[j * 3] = (Math.random() - 0.5) * 16; F.v[j * 3 + 1] = 22 + Math.random() * 18; F.v[j * 3 + 2] = (Math.random() - 0.5) * 16;
          F.life[j] = 1.8; F.c[j * 3] = 1.0; F.c[j * 3 + 1] = 0.35; F.c[j * 3 + 2] = 0.05;
        }
      }
      /* fireworks */
      if (W.fw) {
        var FW = W.fw;
        while (FW.queue.length && FW.queue[0].at <= t) { var s = FW.queue.shift(); burst(s.x, s.y, s.z, s.c[0], s.c[1], W.low ? 120 : 260); }
        for (var k = 0; k < FW.n; k++) {
          if (FW.life[k] <= 0) continue;
          FW.life[k] -= dt; FW.v[k * 3 + 1] -= 9.8 * dt * 0.6;
          FW.v[k * 3] *= 1 - dt * 0.6; FW.v[k * 3 + 2] *= 1 - dt * 0.6;
          FW.p[k * 3] += FW.v[k * 3] * dt; FW.p[k * 3 + 1] += FW.v[k * 3 + 1] * dt; FW.p[k * 3 + 2] += FW.v[k * 3 + 2] * dt;
        }
        FW.geo.attributes.position.needsUpdate = true; FW.geo.attributes.life.needsUpdate = true; FW.geo.attributes.color.needsUpdate = true;
      }
      /* the drones: from one shape to the next, a slow morph, colours on the beat */
      if (W.drones) {
        var Dr = W.drones; Dr.t += dt;
        var hold = Dr.hold || 11;
        if (Dr.t > hold) { Dr.cur = (Dr.cur + 1) % Dr.shapes.length; for (var q = 0; q < Dr.N * 2; q++) Dr.from[q] = Dr.to[q]; Dr.to = Dr.shapes[Dr.cur].pts; Dr.t = 0; Dr.hold = 11; Dr.lapCol = false; }
        var mk = smooth(0, 3.2, Dr.t), sh = Dr.shapes[Dr.cur], ca = new T.Color(Dr.lapCol ? '#FFD100' : sh.col[0]), cb = new T.Color(Dr.lapCol ? '#FFFFFF' : sh.col[1]);
        for (var n2 = 0; n2 < Dr.N; n2++) {
          var fx = lerp(Dr.from[n2 * 2], Dr.to[n2 * 2], mk), fy = lerp(Dr.from[n2 * 2 + 1], Dr.to[n2 * 2 + 1], mk);
          var wob = Math.sin(t * 1.3 + n2) * 0.6;
          Dr.pos[n2 * 3] = Dr.cx - fx * Dr.w + wob; Dr.pos[n2 * 3 + 1] = Dr.cy + fy * Dr.h + Math.sin(t * 1.7 + n2 * 0.3) * 0.5 + (1 - mk) * Math.sin(n2 * 1.3) * 12; Dr.pos[n2 * 3 + 2] = Dr.cz + (1 - mk) * Math.cos(n2 * 2.1) * 14;
          var c = (n2 % 3) ? ca : cb, br = 0.7 + 0.5 * W.beat;
          Dr.col[n2 * 3] = c.r * br; Dr.col[n2 * 3 + 1] = c.g * br; Dr.col[n2 * 3 + 2] = c.b * br;
        }
        Dr.geo.attributes.position.needsUpdate = true; Dr.geo.attributes.color.needsUpdate = true;
      }
      /* the crowd roars where it is thick */
      if (W.audio) {
        var cpos = ctx.camera.position, nn = ctx.track.nearest(cpos.x, cpos.z), u = nn.d / ctx.track.length;
        var thick = (u > 0.55 && u < 0.86) || u < 0.06 || u > 0.94 ? 1 : 0.3, now = W.audio.ac.currentTime;
        W.audio.crowd.gain.setTargetAtTime(0.05 * thick + 0.03 * W.beat, now, 0.3); W.audio.hi.gain.setTargetAtTime(0.018 * thick, now, 0.3);
      }
      /* the searchlights sweep */
      (W.beams || []).forEach(function (b) { if (!b.mesh || b.fixed) return; b.mesh.rotation.set(0.35 + Math.sin(t * b.speed + b.phase) * 0.25, t * b.speed * 0.7 + b.phase, Math.cos(t * b.speed * 0.8 + b.phase) * 0.3); });
    },

    ambient: function (ctx) {
      // the city at night: a crowd that roars as you pass, the hum of the
      // Strip, and the thump of fireworks on a lap
      var ac = ctx.audio.context, out = ctx.audio.destination;
      var n = ac.createBuffer(1, ac.sampleRate * 3, ac.sampleRate), d = n.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      function loop(type, f, q, g0) { var s = ac.createBufferSource(); s.buffer = n; s.loop = true; var fl = ac.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; var g = ac.createGain(); g.gain.value = g0; s.connect(fl); fl.connect(g); g.connect(out); s.start(ac.currentTime + Math.random()); return g; }
      var hum = loop('lowpass', 180, 0.7, 0.05), crowd = loop('bandpass', 900, 0.6, 0.0), crowdHi = loop('bandpass', 2400, 0.9, 0.0);
      W.audio = { ac: ac, crowd: crowd, hi: crowdHi, out: out, noise: n };
      void hum;
      ctx.on('lap', function () {
        // the fireworks, a beat after they go up
        for (var k = 0; k < 6; k++) (function (k) {
          var t0 = ac.currentTime + 0.9 + k * 0.35, s = ac.createBufferSource(), g = ac.createGain(), f = ac.createBiquadFilter();
          s.buffer = n; f.type = 'lowpass'; f.frequency.value = 500; g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.5, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.2);
          s.connect(f); f.connect(g); g.connect(out); s.start(t0, Math.random() * 2); s.stop(t0 + 1.3);
        })(k);
      });
    },
  });

})();
