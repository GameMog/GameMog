var RAW = [
  [0,0,200],[80,1,195],[150,3,160],[185,8,110],[150,15,70],[192,22,35],[212,32,-12],[172,42,-48],
  [208,52,-88],[165,62,-122],[110,72,-152],[40,78,-172],[-40,80,-170,8],[-105,76,-142],[-160,62,-95],
  [-195,50,-35,14],[-200,45,30,22],[-170,42,92,22],[-115,48,100,6],[-70,56,70],[-20,64,75],[35,70,100],
  [-20,48,140],[-70,30,148],[-115,15,165],[-95,8,200],[-60,5,182],[-30,2,205]
];
var NP = RAW.length, RAWLEN = 0, i0;
for (i0 = 0; i0 < NP; i0++) { var a0 = RAW[i0], b0 = RAW[(i0 + 1) % NP]; RAWLEN += Math.hypot(b0[0] - a0[0], b0[2] - a0[2]); }
var KS = 1450 / RAWLEN;
var PTS = RAW.map(function (p) { var q = [p[0] * KS, p[1], p[2] * KS]; if (p[3]) q.push(p[3]); return q; });
var CUM = [0], TOT = 0;
for (i0 = 0; i0 < NP; i0++) { var a1 = PTS[i0], b1 = PTS[(i0 + 1) % NP]; TOT += Math.hypot(b1[0] - a1[0], b1[2] - a1[2]); CUM.push(TOT); }
function P(i, t) { var a = CUM[i], b = CUM[i + 1]; var f = (a + (b - a) * (t || 0)) / TOT; f = f % 1; return f < 0.002 ? 0.002 : f; }
function M(m) { return m / TOT; }
function sm(a, b, x) { var t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

var RAMP = P(13, 0.35);
var COURSE = {
  shoulder: 4,
  pads: [{ at: P(6, 0.3), x: 2.5 }, { at: P(15, 0.5), x: -2 }, { at: P(22, 0.25), x: 0 }, { at: P(23, 0.45), x: 2 }],
  ramps: [{ at: RAMP, x: 0, width: 14, size: 'big', lift: 1.7 }],
  offroad: [{ from: P(25, 0.1), to: P(27, 0.9), side: 'outside', width: 5, kind: 'mud' }],
  walls: { gaps: [{ from: P(10, 0.3), to: P(12, 0.8), side: 'right', water: false }] },
  airdrops: [{ at: P(1, 0.5), n: 5 }, { at: P(8, 0.5), n: 4 }, { at: P(12, 0.9), n: 4 }, { at: P(17, 0.6), n: 5 }, { at: P(20, 0.7), n: 4 }, { at: P(24, 0.8), n: 5 }],
  gm: 'auto',
  air: { lift: 1.4, hang: 0.42 },
  breakLook: 'void',
  bumps: [
    { at: P(0, 0.35), size: 'roller', n: 3 },
    { at: P(18, 0.35), size: 'roller', n: 4 },
    { at: P(19, 0.5), size: 'roller', n: 3 },
    { at: P(21, 0.7), x: 0, width: 12, size: 'lip' },
    { at: P(22, 0.55), x: 0, width: 12, size: 'lip' },
    { at: P(23, 0.15), x: 0, width: 12, size: 'lip' },
    { at: P(23, 0.8), x: 0, width: 12, size: 'lip' }
  ],
  breaks: [{ from: RAMP + M(10), len: 9, clear: true }],
  rails: [
    { points: [[RAMP + M(45), -3.5], [RAMP + M(85), -3.5]] },
    { points: [[RAMP + M(100), 3], [RAMP + M(140), 3]] }
  ],
  hazards: [
    { kind: 'topple', at: P(4, 0.5), side: 'right', every: 14, offset: 2, model: false },
    { kind: 'topple', at: P(7, 0.5), side: 'left', every: 14, offset: 6, model: false },
    { kind: 'topple', at: P(9, 0.3), side: 'right', every: 14, offset: 10, model: false },
    { kind: 'meteor', from: P(16, 0.1), to: P(17, 0.9), every: 6 },
    { kind: 'meteor', from: P(11, 0.2), to: P(12, 0.6), every: 9, offset: 4 },
    { kind: 'meteor', from: P(20, 0.9), to: P(22, 0.1), every: 10, offset: 2 }
  ]
};

var RIVALS = ['doge', 'shiba', 'bike', 'bull', 'bear', 'whale', 'mooncat'];
var G = {};

GameMog.world({
  assets: ['texture-asphalt-track', 'texture-dark-rock', 'model-boulder', 'sky-sunset'],
  theme: { sky: '#3A0F0C', fog: '#5A1A10', ink: '#FFE2B0', accent: '#FF6A1F', font: 'Bungee' },
  graphics: { preset: 'golden', environment: true, bloom: { strength: 0.45, threshold: 1.35, radius: 0.6 },
    grade: { contrast: 1.08, saturation: 1.18, warmth: 0.1, vignette: 0.3, split: 0.3 }, shadows: { extent: 46, mapSize: 2048 }, reflections: true, motion: 0.4 },
  track: { width: 16, points: PTS },
  kart: {
    laps: 3, class: 'normal', course: COURSE, driftAssist: true, driftCharge: 1.3,
    fx: { skids: '#150E0C', skidOpacity: 0.55, offroad: { mud: '#3A2F2A', grass: '#2A2220', shoulder: '#201A18' }, powder: true, powderColor: '#6B5A52', smoke: '#4A3A35', impacts: true, hype: true, rush: true, wind: true }
  },

  build: function (ctx) {
    var T = ctx.THREE, S = ctx.scene, tr = ctx.track, L = tr.length, rnd = ctx.random, q = ctx.quality === 'low';
    G.ctx = ctx; G.L = L;
    S.fog = new T.Fog('#5A1C12', 160, 1900);

    var sunDir = new T.Vector3(0.7, 0.26, 0.4).normalize();
    var sky = null;
    if (ctx.assets.ready('sky-sunset')) sky = ctx.sky({ hdri: 'sky-sunset', sun: [sunDir.x, sunDir.y, sunDir.z], exposure: 0.7 });
    if (!sky) ctx.sky({ top: '#2A0808', horizon: '#FF6A2A', bottom: '#1A0606', sun: [sunDir.x, sunDir.y, sunDir.z], sunColor: '#FF9A4A', sunSize: 6, glow: 0.8, haze: 0.7, curve: 0.5 });
    S.add(new T.HemisphereLight('#FFA070', '#3A1208', 0.65));
    var sun = new T.DirectionalLight('#FF9A4A', 2.6);
    sun.position.copy(sunDir).multiplyScalar(200); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
    S.add(sun);
    var crL = new T.PointLight('#FF5A1A', 1.6, 320); crL.position.set(0, 60, 0); S.add(crL);
    G.camLight = new T.PointLight('#FF6A20', 0.6, 45); S.add(G.camLight);

    // track samples
    var sx = [], sy = [], sz = [], rxs = [], rzs = [], sls = [], hash = {}, d, k;
    for (d = 0; d < L; d += 3) {
      var f = tr.frameAt(d), hl = Math.hypot(f.right.x, f.right.z) || 1;
      k = sx.length; sx.push(f.pos.x); sy.push(f.pos.y); sz.push(f.pos.z);
      rxs.push(f.right.x / hl); rzs.push(f.right.z / hl); sls.push(f.right.y / hl);
      var key = Math.floor(f.pos.x / 32) * 1000 + Math.floor(f.pos.z / 32);
      (hash[key] = hash[key] || []).push(k);
    }
    var NS = sx.length;
    function mBase(x, z) {
      var r = Math.sqrt(x * x + z * z);
      var h = 85 * (1 - sm(110, 300, r)) - 50 * (1 - sm(30, 140, r));
      var dx = x + 125, dz = z - 30; h -= 48 * Math.exp(-(dx * dx + dz * dz) / 4900);
      h += 6 * Math.sin(x * 0.045 + 1.3) * Math.cos(z * 0.05) + 3 * Math.sin(x * 0.13 + z * 0.11) + 1.5 * Math.sin(z * 0.31 + x * 0.27);
      h -= 30 * sm(270, 335, Math.max(Math.abs(x), Math.abs(z)));
      return h;
    }
    function hAt(x, z) {
      var ix = Math.floor(x / 32), iz = Math.floor(z / 32), best = 1e9, bk = -1, a, b, list, j;
      for (a = -2; a <= 2; a++) for (b = -2; b <= 2; b++) {
        list = hash[(ix + a) * 1000 + iz + b]; if (!list) continue;
        for (j = 0; j < list.length; j++) { var kk = list[j], dx = x - sx[kk], dz = z - sz[kk], dd = dx * dx + dz * dz; if (dd < best) { best = dd; bk = kk; } }
      }
      var m = mBase(x, z);
      if (bk < 0 || best > 3600) return m;
      var dist = Math.sqrt(best), ry = sy[bk], lat = (x - sx[bk]) * rxs[bk] + (z - sz[bk]) * rzs[bk];
      var roadH = ry + lat * sls[bk] * (1 - sm(11, 16, dist)) - 0.5, h;
      if (dist < 11) h = roadH;
      else if (dist < 15) h = roadH + (ry - 3.6 - roadH) * sm(11, 15, dist);
      else if (dist < 24) h = ry - 3.6;
      else h = (ry - 3.6) + (m - (ry - 3.6)) * sm(24, 60, dist);
      return h + 1.4 * Math.sin(x * 0.4 + z * 0.33) * sm(24, 50, dist);
    }
    G.hAt = hAt;

    // terrain
    var seg = q ? 110 : 159;
    var tg = new T.PlaneGeometry(700, 700, seg, seg); tg.rotateX(-Math.PI / 2);
    var tp = tg.attributes.position;
    for (k = 0; k < tp.count; k++) tp.setY(k, hAt(tp.getX(k), tp.getZ(k)));
    tg.computeVertexNormals();
    var tmat = ctx.assets.surface('texture-dark-rock', { project: 'box', size: 8, color: '#7A6A62' }) || new T.MeshStandardMaterial({ color: '#2A2523', roughness: 1 });
    if (tmat.emissive) tmat.emissive.set('#220600');
    var terrain = new T.Mesh(tg, tmat); terrain.receiveShadow = true; S.add(terrain);
    var skirt = new T.Mesh(new T.PlaneGeometry(6000, 6000), new T.MeshStandardMaterial({ color: '#1A1210', roughness: 1 }));
    skirt.rotation.x = -Math.PI / 2; skirt.position.y = -31; S.add(skirt);

    // lava
    G.lavaT = { value: 0 }; G.lavaHeat = { value: 1 };
    var LN = 'float lh(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }\n' +
      'float ln(vec2 p){ vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f); return mix(mix(lh(i), lh(i + vec2(1.0, 0.0)), u.x), mix(lh(i + vec2(0.0, 1.0)), lh(i + vec2(1.0, 1.0)), u.x), u.y); }\n' +
      'float lf(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * ln(p); p = p * 2.03 + vec2(17.1, 9.2); a *= 0.5; } return s; }\n';
    var LF = '{ vec2 p = vLava; float t = uLavaT * uLavaFlow;\n' +
      ' vec2 q = vec2(lf(p * 0.9 + vec2(0.0, -t * 0.6)), lf(p * 0.9 + vec2(5.2, -t * 0.45)));\n' +
      ' float n = lf(p * 1.3 + q * 1.7 + vec2(0.0, -t));\n' +
      ' float plates = lf(p * 2.4 + q * 0.9 + vec2(3.0, -t * 0.85));\n' +
      ' float crust = smoothstep(0.5, 0.57, plates), edge = 1.0 - smoothstep(0.0, 0.035, abs(plates - 0.535));\n' +
      ' float heat = mix(0.5 + 0.5 * n, 0.04 + 0.12 * n, crust);\n' +
      ' heat = max(heat, edge * (0.75 + 0.25 * n));\n' +
      ' float bank = smoothstep(0.0, 0.3 * uLavaW, vLava.x) * smoothstep(uLavaW, 0.7 * uLavaW, vLava.x);\n' +
      ' heat *= mix(1.0, 0.3 + 0.7 * bank, uLavaBank) * uLavaHeat;\n' +
      ' vec3 c = vec3(0.012, 0.003, 0.0015);\n' +
      ' c = mix(c, vec3(0.36, 0.035, 0.004), smoothstep(0.06, 0.32, heat));\n' +
      ' c = mix(c, vec3(0.92, 0.23, 0.02), smoothstep(0.32, 0.66, heat));\n' +
      ' c = mix(c, vec3(1.45, 0.78, 0.2), smoothstep(0.8, 0.98, heat));\n' +
      ' totalEmissiveRadiance = c; }\n';
    function lavaMat(o) {
      var m = new T.MeshStandardMaterial({ color: '#0E0403', roughness: 0.92, metalness: 0, envMapIntensity: 0.35, side: o.side || T.FrontSide });
      m.onBeforeCompile = function (sh) {
        sh.uniforms.uLavaT = G.lavaT; sh.uniforms.uLavaHeat = o.pulse ? G.lavaHeat : { value: 1 };
        sh.uniforms.uLavaFlow = { value: o.flow }; sh.uniforms.uLavaBank = { value: o.bank ? 1 : 0 }; sh.uniforms.uLavaW = { value: o.w || 1 };
        sh.vertexShader = 'attribute vec2 lavaUv;\nvarying vec2 vLava;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vLava = lavaUv;');
        sh.fragmentShader = 'uniform float uLavaT, uLavaFlow, uLavaBank, uLavaW, uLavaHeat;\nvarying vec2 vLava;\n' + LN + sh.fragmentShader.replace('#include <emissivemap_fragment>', LF);
      };
      m.customProgramCacheKey = function () { return 'gm-lava'; };
      return m;
    }
    var chMat = lavaMat({ flow: 0.32, bank: true, w: 2.25, side: T.DoubleSide });
    G.lavaMat = lavaMat;
    function strip(off, w, dy) {
      var pos = [], uv = [], idx = [], n = 0, st = 2, i, kk, nx, nz;
      for (i = 0; i <= NS; i += st) {
        kk = i % NS; nx = rxs[kk]; nz = rzs[kk]; var y = sy[kk] + dy;
        pos.push(sx[kk] + nx * (off - w / 2), y, sz[kk] + nz * (off - w / 2), sx[kk] + nx * (off + w / 2), y, sz[kk] + nz * (off + w / 2));
        uv.push(0, i * 3 / 8, 1, i * 3 / 8);
        if (n > 0) { var a = (n - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
        n++;
      }
      var g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
      var lu = []; for (var li = 0; li < uv.length; li += 2) lu.push(uv[li] * 2.25, uv[li + 1] * 2); g.setAttribute('lavaUv', new T.Float32BufferAttribute(lu, 2));
      g.setIndex(idx); g.computeVertexNormals(); return new T.Mesh(g, chMat);
    }
    S.add(strip(19, 9, -3.15)); S.add(strip(-19, 9, -3.15));
    var lakeMat = lavaMat({ flow: 0.07, pulse: true });
    function lakeGeo(r, n) { var gg = new T.CircleGeometry(r, n), pp = gg.attributes.position, lu = []; for (var li = 0; li < pp.count; li++) lu.push(pp.getX(li) / 11, pp.getY(li) / 11); gg.setAttribute('lavaUv', new T.Float32BufferAttribute(lu, 2)); return gg; }
    var lake1 = new T.Mesh(lakeGeo(105, 64), lakeMat); lake1.rotation.x = -Math.PI / 2; lake1.position.set(0, 48, 0); S.add(lake1);
    var lake2 = new T.Mesh(lakeGeo(58, 48), lakeMat); lake2.rotation.x = -Math.PI / 2; lake2.position.set(-125, 40, 30); S.add(lake2);

    // road
    var crack = ctx.textures.canvas(512, 512, function (g, w, h) {
      g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
      for (var n = 0; n < 30; n++) {
        var px = rnd() * w, py = rnd() * h; g.strokeStyle = rnd() < 0.3 ? '#FFC060' : '#FF6A1A'; g.lineWidth = 1 + rnd() * 2.5; g.beginPath(); g.moveTo(px, py);
        for (var s = 0; s < 7; s++) { px += (rnd() - 0.5) * 90; py += (rnd() - 0.2) * 70; g.lineTo(px, py); }
        g.stroke();
      }
    });
    var roadMat = new T.MeshStandardMaterial({ color: '#3A3430', roughness: 0.75, metalness: 0.1, emissive: '#FF6A1A', emissiveIntensity: 1.0, emissiveMap: crack });
    var at = ctx.assets.texture('texture-asphalt-track');
    if (at) { roadMat.map = at.map; roadMat.normalMap = at.normalMap; var rp = 16 / (at.size || 2); [at.map, at.normalMap].forEach(function (m) { if (m) { m.wrapS = m.wrapT = T.RepeatWrapping; m.repeat.set(rp, rp); } }); }
    var road = tr.ribbon({ material: roadMat, y: 0.03 }); road.receiveShadow = true; S.add(road);
    var edgeMat = new T.MeshStandardMaterial({ color: '#2A140C', emissive: '#FF5A14', emissiveIntensity: 0.95, roughness: 0.6 });
    S.add(tr.ribbon({ width: 0.7, offset: tr.halfWidth - 0.45, y: 0.06, material: edgeMat }));
    S.add(tr.ribbon({ width: 0.7, offset: -tr.halfWidth + 0.45, y: 0.06, material: edgeMat }));
    var shMat = new T.MeshStandardMaterial({ color: '#2A2220', roughness: 1 });
    S.add(tr.ribbon({ width: 4, offset: tr.halfWidth + 2, y: -0.03, material: shMat }));
    S.add(tr.ribbon({ width: 4, offset: -tr.halfWidth - 2, y: -0.03, material: shMat }));

    // frame helpers
    function basisQ(f) { var left = f.right.clone().negate(); return new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(left, f.up, f.tan)); }
    function fr(d) { var f = tr.frameAt(((d % L) + L) % L); return { pos: f.pos.clone(), tan: f.tan.clone(), right: f.right.clone(), up: f.up.clone() }; }

    // walls
    var gA = P(10, 0.3) * L, gB = P(12, 0.8) * L, walls = [];
    for (d = 0; d < L; d += 5.2) for (var sd = -1; sd <= 1; sd += 2) {
      if (sd === 1 && d > gA && d < gB) continue;
      var f2 = fr(d); walls.push({ p: f2.pos.addScaledVector(f2.right, sd * 13.5), q: basisQ(f2), up: f2.up });
    }
    var wallMat = new T.MeshStandardMaterial({ color: '#2B2422', roughness: 0.9, metalness: 0.1 });
    var wm = ctx.instanced(new T.BoxGeometry(1.5, 1.5, 5.4), wallMat, walls.length, function (i, o) { var w = walls[i]; o.position.copy(w.p).addScaledVector(w.up, 0.7); o.quaternion.copy(w.q); });
    wm.castShadow = true; ctx.scenery.add(wm);
    ctx.scenery.add(ctx.instanced(new T.BoxGeometry(0.5, 0.12, 5.4), new T.MeshStandardMaterial({ color: '#2A140C', emissive: '#FF5A14', emissiveIntensity: 1.05 }), walls.length, function (i, o) { var w = walls[i]; o.position.copy(w.p).addScaledVector(w.up, 1.52); o.quaternion.copy(w.q); }));

    // vent tunnel
    var tl = [], tA = P(18, 0.15) * L, tB = P(21, 0.0) * L;
    for (d = tA; d < tB; d += 7) { var f3 = fr(d); tl.push({ f: f3, q: basisQ(f3) }); }
    var rockMat = new T.MeshStandardMaterial({ color: '#241C1A', roughness: 0.95 });
    var roof = ctx.instanced(new T.BoxGeometry(33, 1.8, 7.3), rockMat, tl.length, function (i, o) { var t = tl[i]; o.position.copy(t.f.pos).addScaledVector(t.f.up, 8.7); o.quaternion.copy(t.q); });
    ctx.scenery.add(roof);
    [-1, 1].forEach(function (sd2) {
      ctx.scenery.add(ctx.instanced(new T.BoxGeometry(3, 11, 7.3), rockMat, tl.length, function (i, o) { var t = tl[i]; o.position.copy(t.f.pos).addScaledVector(t.f.right, sd2 * 14.5).addScaledVector(t.f.up, 4.5); o.quaternion.copy(t.q); }));
      ctx.scenery.add(ctx.instanced(new T.BoxGeometry(0.5, 0.5, 6.4), new T.MeshStandardMaterial({ color: '#2A140C', emissive: '#FF5A14', emissiveIntensity: 1.1 }), tl.length, function (i, o) { var t = tl[i]; o.position.copy(t.f.pos).addScaledVector(t.f.right, sd2 * 12.8).addScaledVector(t.f.up, 1.2); o.quaternion.copy(t.q); }));
    });
    ctx.scenery.add(ctx.instanced(new T.BoxGeometry(2, 0.3, 6), new T.MeshStandardMaterial({ color: '#2A140C', emissive: '#FF4A10', emissiveIntensity: 1.0 }), tl.length, function (i, o) { var t = tl[i]; o.position.copy(t.f.pos).addScaledVector(t.f.up, 7.65); o.quaternion.copy(t.q); }));
    for (k = 0; k < 4; k++) { var tf = fr(tA + (tB - tA) * (0.12 + k * 0.25)); var tlight = new T.PointLight('#FF6A20', 1.4, 34); tlight.position.copy(tf.pos).addScaledVector(tf.up, 5); S.add(tlight); }

    // boulders and columns
    var bm = ctx.assets.model('model-boulder'), bl = [];
    for (k = 0; k < (q ? 40 : 80); k++) {
      var dd = rnd() * L, sd3 = rnd() < 0.5 ? -1 : 1, off = 16 + rnd() * 30, f4 = fr(dd);
      var x = f4.pos.x + f4.right.x * sd3 * off, z = f4.pos.z + f4.right.z * sd3 * off;
      bl.push([x, hAt(x, z) - 0.3, z, 0.8 + rnd() * 2, rnd() * 6]);
    }
    if (bm) { var bo = bm.instanced(bl.length, function (i, o) { var b = bl[i]; o.position.set(b[0], b[1], b[2]); o.scale.setScalar(b[3]); o.rotation.y = b[4]; }); ctx.scenery.add(bo); }
    var cl = [];
    for (k = 0; k < (q ? 60 : 130); k++) {
      var dc = rnd() * L, sc = rnd() < 0.5 ? -1 : 1, oc = 15 + rnd() * 45, f5 = fr(dc);
      var cx = f5.pos.x + f5.right.x * sc * oc, cz = f5.pos.z + f5.right.z * sc * oc;
      cl.push([cx, hAt(cx, cz) - 1, cz, 3 + rnd() * 11, 0.7 + rnd() * 1.1]);
    }
    var cols = ctx.instanced(new T.CylinderGeometry(0.8, 1, 1, 6), new T.MeshStandardMaterial({ color: '#2E2624', roughness: 0.9, emissive: '#1C0600' }), cl.length, function (i, o) { var c = cl[i]; o.position.set(c[0], c[1] + c[3] / 2, c[2]); o.scale.set(c[4], c[3], c[4]); o.rotation.y = i; });
    cols.castShadow = true; ctx.scenery.add(cols);

    // horizon peaks and plume
    function hsh(n) { var s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
    // a ridge line round the whole horizon, periodic in the angle (no seam): sharp crests, broad valleys
    function ridge(a, seed, oct) {
      var s = 0, amp = 1, tot = 0;
      for (var o = 0; o < oct; o++) {
        var cells = 9 * Math.pow(2, o), x = a * cells, i0 = Math.floor(x), f0 = x - i0, u = f0 * f0 * (3 - 2 * f0);
        var h0 = hsh(((i0 % cells) + cells) % cells + seed * 101 + o * 977), h1 = hsh((((i0 + 1) % cells) + cells) % cells + seed * 101 + o * 977);
        s += amp * (1 - Math.abs((h0 + (h1 - h0) * u) * 2 - 1)); tot += amp; amp *= 0.5;
      }
      return s / tot;
    }
    var hzMat = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true, side: T.DoubleSide });
    var ASH = new T.Color('#6A5E5A'), TMP = new T.Color();
    function range(R, depth, base, amp, seed, c0, c1, A) {
      var ROWS = 9, pos = [], col = [], idx = [], cb = new T.Color(c0), ct = new T.Color(c1), i, j;
      for (j = 0; j <= ROWS; j++) {
        var tt = j / ROWS;
        for (i = 0; i <= A; i++) {
          var a = (i % A) / A, H = base + amp * Math.pow(ridge(a, seed, 5), 1.7), jit = hsh(i * 7.3 + j * 13.7 + seed) - 0.5;
          var y = -45 + (H + 45) * Math.pow(tt, 0.8) + jit * 18 * tt * (1 - tt);
          var r = R + depth * tt * (0.5 + 0.5 * ridge(a + 0.37, seed + 3, 3)) + jit * 16 * tt, ang = a * 6.28318;
          pos.push(Math.cos(ang) * r, y, Math.sin(ang) * r);
          var hh = (y + 45) / (base + amp + 45);
          TMP.copy(cb).lerp(ct, Math.min(1, hh * 1.4)); if (hh > 0.74) TMP.lerp(ASH, Math.min(1, (hh - 0.74) * 2.4));
          col.push(TMP.r, TMP.g, TMP.b);
        }
      }
      for (j = 0; j < ROWS; j++) for (i = 0; i < A; i++) { var a0 = j * (A + 1) + i, b0 = a0 + A + 1; idx.push(a0, b0, a0 + 1, a0 + 1, b0, b0 + 1); }
      var gg = new T.BufferGeometry(); gg.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); gg.setAttribute('color', new T.Float32BufferAttribute(col, 3));
      gg.setIndex(idx); gg.computeVertexNormals();
      var m = new T.Mesh(gg, hzMat); m.frustumCulled = false; S.add(m); return m;
    }
    range(720, 160, 20, 105, 1, '#100A09', '#38211A', q ? 160 : 300);
    range(960, 200, 50, 165, 2, '#160D0B', '#44281F', q ? 140 : 260);
    range(1250, 240, 90, 240, 3, '#1E130F', '#4E3125', q ? 120 : 220);
    // two volcanoes on the horizon, each with a crater and lava down its flanks
    function volcano(ax, R, Hh, rad, seed) {
      var prof = [], n = 18, i;
      for (i = 0; i <= n; i++) { var u = i / n, rr = rad * (1 - u) + rad * 0.16 * u, yy = Hh * Math.pow(u, 0.75); prof.push(new T.Vector2(rr, yy)); }
      prof.push(new T.Vector2(rad * 0.1, Hh * 0.93)); prof.push(new T.Vector2(0.01, Hh * 0.9));
      var gg = new T.LatheGeometry(prof, 56), pp = gg.attributes.position, col = [], cb = new T.Color('#1A100D'), ct = new T.Color('#5A3328');
      for (i = 0; i < pp.count; i++) {
        var x = pp.getX(i), y = pp.getY(i), z = pp.getZ(i), an = Math.atan2(z, x), k2 = 1 + 0.22 * (ridge(an / 6.28318 + 0.5, seed + 9, 4) - 0.5) * Math.min(1, y / (Hh * 0.2) + 0.3);
        pp.setXYZ(i, x * k2, y, z * k2);
        var hh = y / Hh; TMP.copy(cb).lerp(ct, Math.min(1, hh * 1.3)); if (hh > 0.8) TMP.lerp(ASH, (hh - 0.8) * 3);
        col.push(TMP.r, TMP.g, TMP.b);
      }
      gg.setAttribute('color', new T.Float32BufferAttribute(col, 3)); gg.computeVertexNormals();
      var v = new T.Group(), cx = Math.cos(ax) * R, cz = Math.sin(ax) * R;
      var cone = new T.Mesh(gg, hzMat); cone.frustumCulled = false; v.add(cone);
      // lava streams from the rim to the foot: ribbons laid on the flank, wandering, the flow running down them
      var fm = lavaMat({ flow: 0.5, bank: true, w: 1 });
      for (var s2 = 0; s2 < 3; s2++) {
        var a0 = ax + Math.PI + (s2 - 1) * 0.5 + (hsh(seed * 31 + s2) - 0.5) * 0.3, P2 = [], U = [], ID = [], NSEG = 30, wd = rad * 0.035;
        for (i = 0; i <= NSEG; i++) {
          var u2 = i / NSEG, hy = Hh * 0.9 * (1 - u2), rr2 = (rad * (1 - Math.pow(hy / Hh, 1 / 0.75)) + rad * 0.16 * Math.pow(hy / Hh, 1 / 0.75)) * 1.01 + 1.5;
          var aw = a0 + Math.sin(u2 * 7 + s2 * 2) * 0.06 + u2 * 0.12 * (s2 - 1), tx = -Math.sin(aw), tz = Math.cos(aw), ww = wd * (0.5 + u2);
          P2.push(Math.cos(aw) * rr2 - tx * ww, hy, Math.sin(aw) * rr2 - tz * ww, Math.cos(aw) * rr2 + tx * ww, hy, Math.sin(aw) * rr2 + tz * ww);
          U.push(0, u2 * 9, 1, u2 * 9);
          if (i > 0) { var b1 = (i - 1) * 2; ID.push(b1, b1 + 1, b1 + 2, b1 + 1, b1 + 3, b1 + 2); }
        }
        var sg = new T.BufferGeometry(); sg.setAttribute('position', new T.Float32BufferAttribute(P2, 3)); sg.setAttribute('lavaUv', new T.Float32BufferAttribute(U, 2));
        sg.setIndex(ID); sg.computeVertexNormals();
        var st2 = new T.Mesh(sg, fm); st2.frustumCulled = false; v.add(st2);
      }
      v.position.set(cx, -40, cz); S.add(v);
    }
    volcano(2.2, 1080, 400, 250, 5);
    volcano(4.9, 1150, 340, 220, 6);
    var plume = new T.Group();
    var plMat = new T.MeshStandardMaterial({ color: '#3A2420', roughness: 1, emissive: '#3A0C06' });
    plume.add(ctx.instanced(new T.IcosahedronGeometry(1, 1), plMat, 14, function (i, o) { var u = i / 13; o.position.set(Math.sin(i * 2.1) * 20 * u, 90 + u * 260, Math.cos(i * 1.7) * 20 * u); o.scale.setScalar(30 + u * 70); }));
    plume.add(ctx.instanced(new T.IcosahedronGeometry(1, 1), new T.MeshStandardMaterial({ color: '#FF6A1A', emissive: '#FF5A10', emissiveIntensity: 2.2 }), 5, function (i, o) { o.position.set(Math.sin(i * 2) * 12, 62 + i * 14, Math.cos(i * 2) * 12); o.scale.setScalar(22 - i * 3); }));
    plume.position.set(0, 0, 0); S.add(plume); G.plume = plume;

    // particles
    var glow = ctx.textures.canvas(64, 64, function (g, w, h) { var gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
    function mkSys(N, size, color, blend) {
      var pos = new Float32Array(N * 3).fill(-9999), geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(pos, 3));
      var pts = new T.Points(geo, new T.PointsMaterial({ map: glow, size: size, color: color, transparent: true, blending: blend || T.AdditiveBlending, depthWrite: false }));
      pts.frustumCulled = false; S.add(pts);
      return { pos: pos, vel: new Float32Array(N * 3), life: new Float32Array(N), i: 0, N: N, geo: geo };
    }
    G.bombs = mkSys(80, 11, '#FF7A1A'); G.sparks = mkSys(q ? 120 : 240, 3.5, '#FFB040');
    G.embers = mkSys(q ? 120 : 240, 0.5, '#FF9A3A'); G.ash = mkSys(q ? 140 : 280, 0.6, '#8A7A74', T.NormalBlending);
    G.ash.geo.attributes.position.array.fill(0);
    G.eo = []; for (k = 0; k < G.embers.N; k++) G.eo.push([(rnd() - 0.5) * 100, rnd() * 50, (rnd() - 0.5) * 100, 1 + rnd() * 3]);
    G.ao = []; for (k = 0; k < G.ash.N; k++) G.ao.push([(rnd() - 0.5) * 120, rnd() * 50, (rnd() - 0.5) * 120, 2 + rnd() * 2]);
    G.fount = [];
    [[16, 0.4, -1], [17, 0.3, 1], [16, 0.8, 1]].forEach(function (fo) {
      var ff = fr(P(fo[0], fo[1]) * L), fx = ff.pos.x + ff.right.x * fo[2] * 19, fz = ff.pos.z + ff.right.z * fo[2] * 19;
      G.fount.push({ x: fx, y: ff.pos.y - 3, z: fz, t: rnd() });
    });
    G.crT = 0;

    // steam vents
    var puff = ctx.textures.canvas(64, 64, function (g, w, h) { var gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
    G.vents = [];
    [[0, 0.5, -1], [2, 0.5, 1], [5, 0.2, -1], [9, 0.6, -1], [14, 0.5, 1], [15, 0.7, -1], [24, 0.5, 1], [26, 0.5, -1]].forEach(function (v, vi) {
      var vf = fr(P(v[0], v[1]) * L), vx = vf.pos.x + vf.right.x * v[2] * 15, vz = vf.pos.z + vf.right.z * v[2] * 15, vy = hAt(vx, vz);
      var cone = new T.Mesh(new T.ConeGeometry(1.6, 1.6, 8, 1, true), new T.MeshStandardMaterial({ color: '#2A2220', emissive: '#FF4A10', emissiveIntensity: 1, side: T.DoubleSide }));
      cone.position.set(vx, vy + 0.7, vz); S.add(cone);
      var sps = [];
      for (var j = 0; j < 3; j++) { var sp = new T.Sprite(new T.SpriteMaterial({ map: puff, color: '#E8D4C8', transparent: true, opacity: 0, depthWrite: false })); sp.position.set(vx, vy, vz); S.add(sp); sps.push(sp); }
      G.vents.push({ x: vx, y: vy, z: vz, sps: sps, per: 6 + (vi % 4) * 1.7, ph: vi * 2.3 });
    });
  },

  player: function (ctx) { return bhot(ctx); },
  rival: function (ctx, k) { return ctx.kart.racer(RIVALS[(k - 1) % RIVALS.length]); },

  update: function (ctx, t, dt) {
    if (!G.bombs) return;
    var T = ctx.THREE, cam = ctx.camera.position, i, e;
    G.lavaT.value = t; G.lavaHeat.value = 1 + Math.sin(t * 1.1) * 0.08;
    G.camLight.position.set(cam.x, cam.y + 2, cam.z);
    G.plume.rotation.y = t * 0.02;
    function emit(s, x, y, z, vx, vy, vz, life) { var k = (s.i++) % s.N; s.pos[k * 3] = x; s.pos[k * 3 + 1] = y; s.pos[k * 3 + 2] = z; s.vel[k * 3] = vx; s.vel[k * 3 + 1] = vy; s.vel[k * 3 + 2] = vz; s.life[k] = life; }
    function step(s, g) {
      for (var k = 0; k < s.N; k++) if (s.life[k] > 0) {
        s.life[k] -= dt; s.vel[k * 3 + 1] -= g * dt;
        s.pos[k * 3] += s.vel[k * 3] * dt; s.pos[k * 3 + 1] += s.vel[k * 3 + 1] * dt; s.pos[k * 3 + 2] += s.vel[k * 3 + 2] * dt;
        if (s.life[k] <= 0) s.pos[k * 3 + 1] = -9999;
      }
      s.geo.attributes.position.needsUpdate = true;
    }
    G.crT -= dt;
    if (G.crT <= 0) { G.crT = 1.2 + Math.random(); for (i = 0; i < 9; i++) { var a = Math.random() * 6.283; emit(G.bombs, Math.cos(a) * 15, 52, Math.sin(a) * 15, Math.cos(a) * (5 + Math.random() * 18), 45 + Math.random() * 40, Math.sin(a) * (5 + Math.random() * 18), 6); } }
    for (i = 0; i < G.fount.length; i++) {
      e = G.fount[i]; e.t -= dt;
      if (e.t <= 0) { e.t = 0.1; for (var j = 0; j < 2; j++) emit(G.sparks, e.x, e.y, e.z, (Math.random() - 0.5) * 7, 16 + Math.random() * 10, (Math.random() - 0.5) * 7, 2.4); }
    }
    step(G.bombs, 20); step(G.sparks, 22);
    var em = G.embers, ea = G.ash;
    for (i = 0; i < em.N; i++) {
      var o = G.eo[i]; o[1] += dt * o[3]; o[0] += Math.sin(t + i) * dt * 2; if (o[1] > 50) o[1] -= 50;
      em.pos[i * 3] = cam.x + o[0]; em.pos[i * 3 + 1] = cam.y - 10 + o[1]; em.pos[i * 3 + 2] = cam.z + o[2];
    }
    em.geo.attributes.position.needsUpdate = true;
    for (i = 0; i < ea.N; i++) {
      var p = G.ao[i]; p[1] -= dt * p[3]; p[0] += dt * 1.5; if (p[1] < 0) p[1] += 50;
      ea.pos[i * 3] = cam.x + p[0]; ea.pos[i * 3 + 1] = cam.y - 8 + p[1]; ea.pos[i * 3 + 2] = cam.z + p[2];
    }
    ea.geo.attributes.position.needsUpdate = true;
    for (i = 0; i < G.vents.length; i++) {
      var v = G.vents[i], tt = (t + v.ph) % v.per;
      for (var s = 0; s < 3; s++) {
        var u = (tt - s * 0.15) / 1.8, sp = v.sps[s];
        if (u > 0 && u < 1) { sp.material.opacity = (1 - u) * 0.75; sp.scale.setScalar(3 + u * 11); sp.position.set(v.x, v.y + 1 + u * 13, v.z); } else sp.material.opacity = 0;
      }
    }
    if (ctx.kart && ctx.kart.hazards) {
      var hz = ctx.kart.hazards();
      if (!G.pil) {
        G.pil = [];
        for (i = 0; i < hz.length; i++) if (hz[i].kind === 'topple') {
          var grp = new T.Group(), piv = new T.Group();
          var pm = new T.Mesh(new T.CylinderGeometry(1.3, 1.7, 11, 6), new T.MeshStandardMaterial({ color: '#2E2624', roughness: 0.9, emissive: '#2A0A04' }));
          pm.position.y = 5.5; pm.castShadow = true; piv.add(pm); grp.add(piv); ctx.scene.add(grp); G.pil.push({ g: grp, piv: piv, idx: i });
        }
      }
      for (i = 0; i < G.pil.length; i++) {
        var pl = G.pil[i], h = hz[pl.idx]; if (!h) continue;
        var dd = h.d <= 1.5 ? h.d * G.L : h.d, f = ctx.track.frameAt(((dd % G.L) + G.L) % G.L), sgn = h.side === 'left' ? -1 : 1;
        var left = f.right.clone().negate();
        pl.g.position.copy(f.pos);
        pl.g.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(left, f.up, f.tan));
        pl.piv.position.x = -sgn * 14;
        var ang = 0, u2 = h.u || 0;
        if (h.phase === 'warn') ang = Math.sin(t * 30) * 0.015; else if (h.phase === 'fall') ang = u2 * u2 * 1.45; else if (h.phase === 'lie') ang = 1.45; else if (h.phase === 'rise') ang = (1 - u2) * 1.45;
        pl.piv.rotation.z = sgn > 0 ? -ang : ang;
      }
    }
  },

  ambient: function (ctx) {
    var a = ctx.audio.context, d = ctx.audio.destination, b = a.createBuffer(1, a.sampleRate * 2, a.sampleRate), data = b.getChannelData(0), l = 0;
    for (var i = 0; i < data.length; i++) { l = (l + 0.02 * (Math.random() * 2 - 1)) / 1.02; data[i] = l * 3.5; }
    var src = a.createBufferSource(); src.buffer = b; src.loop = true;
    var f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 140;
    var g = a.createGain(); g.gain.value = 0.12; src.connect(f); f.connect(g); g.connect(d); src.start();
  }
});

function bhot(ctx) {
  var T = ctx.THREE, g = new T.Group();
  function mat(c, r, m, e, ei) { return new T.MeshStandardMaterial({ color: c, roughness: r == null ? 0.6 : r, metalness: m || 0, emissive: e || '#000000', emissiveIntensity: ei || 1 }); }
  var sph = new T.SphereGeometry(1, 20, 14), cone = new T.ConeGeometry(1, 1, 12), cyl = new T.CylinderGeometry(1, 1, 1, 16), box = new T.BoxGeometry(1, 1, 1);
  function add(geo, m, x, y, z, sx, sy, sz, par) { var o = new T.Mesh(geo, m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.castShadow = true; (par || g).add(o); return o; }
  function limb(a, b, r, m, par) { var d = new T.Vector3().subVectors(b, a), len = d.length(); var o = new T.Mesh(cyl, m); o.scale.set(r, len, r); o.position.copy(a).addScaledVector(d, 0.5); o.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize()); o.castShadow = true; par.add(o); return o; }
  var black = mat('#17110F', 0.4, 0.6), red = mat('#B3221A', 0.35, 0.3), skin = mat('#D98F12', 0.55), cream = mat('#D4B37E', 0.6), ivory = mat('#D8C8A2', 0.5), green = mat('#3C7B2B', 0.5), silver = mat('#C9CDD2', 0.25, 0.9), hairM = mat('#D7281C', 0.6);
  var flame = mat('#FFB040', 0.4, 0, '#FF5A14', 3);
  // kart
  add(box, black, 0, 0.38, -0.05, 1.0, 0.3, 1.7);
  add(sph, red, 0, 0.4, 0.95, 0.5, 0.2, 0.6);
  add(box, red, 0.6, 0.45, 0.05, 0.3, 0.28, 1.3); add(box, red, -0.6, 0.45, 0.05, 0.3, 0.28, 1.3);
  add(box, black, 0, 0.9, -1.05, 1.2, 0.08, 0.35); add(box, black, 0.6, 0.7, -1.05, 0.06, 0.5, 0.3); add(box, black, -0.6, 0.7, -1.05, 0.06, 0.5, 0.3);
  var fl = [];
  [-0.3, 0.3].forEach(function (x) { var ex = add(cyl, silver, x, 0.55, -1.0, 0.09, 0.4, 0.09); ex.rotation.x = Math.PI / 2; var fc = add(cone, flame, x, 0.55, -1.35, 0.1, 0.5, 0.1); fc.rotation.x = -Math.PI / 2; fl.push(fc); });
  var tyreM = mat('#0E0C0C', 0.9), rimM = mat('#FF7A1F', 0.3, 0.7, '#401000');
  var wheels = [], fronts = [];
  function wheel(x, z, r, w, front) {
    var piv = new T.Group(); piv.position.set(x, r, z); g.add(piv);
    var sp = new T.Group(); piv.add(sp);
    var tire = add(cyl, tyreM, 0, 0, 0, r, w, r, sp); tire.rotation.z = Math.PI / 2;
    var rim = add(cyl, rimM, 0, 0, 0, r * 0.55, w * 1.05, r * 0.55, sp); rim.rotation.z = Math.PI / 2;
    for (var i = 0; i < 5; i++) { var sk = add(cone, silver, Math.sign(x) * w * 0.55, Math.cos(i * 1.2566) * r * 0.4, Math.sin(i * 1.2566) * r * 0.4, 0.05, 0.14, 0.05, sp); sk.rotation.z = -Math.sign(x) * Math.PI / 2; }
    wheels.push(sp); if (front) fronts.push(piv);
  }
  wheel(0.68, -0.72, 0.38, 0.2, false); wheel(-0.68, -0.72, 0.38, 0.2, false); wheel(0.6, 0.85, 0.28, 0.14, true); wheel(-0.6, 0.85, 0.28, 0.14, true);
  // B-Hot
  var bh = new T.Group(); bh.position.set(0, 0.5, -0.15); bh.scale.setScalar(0.88); g.add(bh);
  add(sph, skin, 0, 0.55, 0.05, 0.5, 0.55, 0.45, bh);
  add(sph, cream, 0, 0.5, 0.3, 0.36, 0.45, 0.2, bh);
  [-0.25, 0.25].forEach(function (x) { add(sph, skin, x, 0.15, 0.35, 0.22, 0.2, 0.4, bh); });
  add(sph, green, 0, 0.72, -0.38, 0.58, 0.56, 0.32, bh);
  var rim2 = new T.Mesh(new T.TorusGeometry(0.56, 0.08, 8, 24), ivory); rim2.position.set(0, 0.72, -0.18); rim2.scale.set(1, 1.05, 1); bh.add(rim2);
  for (var i = 0; i < 7; i++) {
    var a = -1.2 + i * 0.4, sp = add(cone, ivory, Math.sin(a) * 0.52, 0.72 + Math.cos(a) * 0.52 * 0.9, -0.5, 0.13, 0.42, 0.13, bh);
    sp.rotation.z = -a; sp.rotation.x = -0.9;
  }
  var head = new T.Group(); head.position.set(0, 1.18, 0.1); bh.add(head);
  add(sph, skin, 0, 0, 0, 0.34, 0.32, 0.34, head);
  add(sph, cream, 0, -0.06, 0.3, 0.3, 0.2, 0.34, head);
  add(sph, cream, 0, -0.22, 0.28, 0.25, 0.09, 0.3, head);
  add(sph, black, 0.1, 0.0, 0.62, 0.035, 0.03, 0.03, head); add(sph, black, -0.1, 0.0, 0.62, 0.035, 0.03, 0.03, head);
  [-1, 1].forEach(function (s) {
    add(sph, mat('#FFFFFF', 0.3), s * 0.13, 0.12, 0.27, 0.075, 0.08, 0.06, head);
    add(sph, mat('#C01818', 0.3, 0, '#400000'), s * 0.13, 0.11, 0.32, 0.035, 0.04, 0.03, head);
    var br = add(box, mat('#3C7B2B', 0.5), s * 0.14, 0.22, 0.28, 0.17, 0.05, 0.08, head); br.rotation.z = s * 0.45;
    var hn = add(cone, ivory, s * 0.22, 0.3, -0.04, 0.08, 0.5, 0.08, head); hn.rotation.z = -s * 0.55; hn.rotation.x = -0.3;
    add(sph, skin, s * 0.32, 0.0, -0.05, 0.07, 0.1, 0.05, head);
    for (var j = 0; j < 2; j++) add(cone, mat('#FFFFFF', 0.4), s * (0.07 + j * 0.1), -0.15, 0.5, 0.03, 0.09, 0.03, head);
  });
  var hair = [];
  for (i = 0; i < 8; i++) { var an = i / 8 * 6.283, h = add(cone, hairM, Math.cos(an) * 0.15, 0.34, Math.sin(an) * 0.12 - 0.08, 0.1, 0.34, 0.1, head); h.rotation.x = Math.sin(an) * 0.6; h.rotation.z = -Math.cos(an) * 0.6; hair.push(h); }
  // steering and arms
  var wt = new T.Group(); wt.position.set(0, 0.42, 0.52); wt.rotation.x = -1.05; bh.add(wt);
  var ws = new T.Group(); wt.add(ws);
  ws.add(new T.Mesh(new T.TorusGeometry(0.2, 0.035, 8, 20), black));
  [-1, 1].forEach(function (s) {
    var sh = new T.Vector3(s * 0.5, 0.78, 0.0), el = new T.Vector3(s * 0.62, 0.55, 0.3), hd = new T.Vector3(s * 0.2, 0.46, 0.52);
    add(sph, skin, sh.x, sh.y, sh.z, 0.2, 0.2, 0.2, bh);
    limb(sh, el, 0.15, skin, bh); limb(el, hd, 0.12, skin, bh);
    var br = limb(el.clone().lerp(hd, 0.35), el.clone().lerp(hd, 0.8), 0.16, black, bh);
    for (var j = 0; j < 3; j++) { var p = el.clone().lerp(hd, 0.45 + j * 0.15); var sk = add(cone, silver, p.x + s * 0.13, p.y + 0.08, p.z, 0.04, 0.12, 0.04, bh); sk.rotation.z = -s * 1.2; }
    add(sph, skin, hd.x, hd.y, hd.z, 0.12, 0.1, 0.12, bh);
    for (j = 0; j < 3; j++) add(cone, mat('#FFFFFF', 0.4), hd.x + (j - 1) * 0.06, hd.y + 0.04, hd.z + 0.1, 0.025, 0.08, 0.025, bh).rotation.x = 1.4;
  });
  var glowL = new T.PointLight('#FF6A20', 0.8, 5); glowL.position.set(0, 0.1, -1.1); g.add(glowL);
  return {
    object: g, name: 'B-Hot', color: '#F2A81D', stats: { top: 1.0, accel: 1.0, handling: 1.0, mass: 1.2, drift: 1.0 },
    animate: function (t, dt, s) {
      var sp = s.speed || 0, st = s.steer || 0;
      wheels.forEach(function (w) { w.rotation.x += sp * dt / 0.35; });
      fronts.forEach(function (f) { f.rotation.y = st * 0.4; });
      ws.rotation.z = -st * 0.9;
      head.rotation.z = -st * 0.18; head.rotation.y = -st * 0.25;
      bh.position.y = 0.5 + Math.sin(t * 24) * 0.012 * Math.min(1, sp / 20) + (s.celebrate ? Math.abs(Math.sin(t * 8)) * 0.2 : 0);
      bh.rotation.z = -st * 0.08 + (s.hit ? Math.sin(t * 40) * 0.12 : 0);
      hair.forEach(function (h, i) { h.rotation.x += Math.sin(t * 9 + i) * 0.003 * Math.min(2, sp / 12); });
      var fs = 0.8 + (s.boost ? 1.2 : 0) + Math.min(1, sp / 30) * 0.5;
      fl.forEach(function (f) { f.scale.y = 0.4 * fs * (0.8 + Math.random() * 0.4); });
    }
  };
}