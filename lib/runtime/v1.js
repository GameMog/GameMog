/* GameMog Runtime v1.
 *
 * The platform's game framework: the part of every world that is the same.
 * A world module (written by Claude Opus 5.5 from a creator's prompt) supplies
 * what makes a world itself: the track's shape, the scenery, the player's and
 * every rival's look and animation, the obstacles, ambient life and sound.
 * This file supplies the rules, and a world cannot change them:
 *
 *   - endless laps; level = the lap you are on
 *   - lap 1 has one rival; every new lap adds one more, faster and more
 *     aggressive than the last
 *   - the only way to die is to touch a rival or an obstacle
 *   - golden GM coins along the track, re-laid every lap
 *   - arrow keys (and WASD) steer and change speed; Space pauses; on-screen
 *     buttons on touch screens
 *   - title, countdown, HUD, level-up banners, pause, results, restart
 *   - result reporting to the leaderboard through GameMog.finish
 *
 * It also guards the world against itself: hitboxes are measured from the
 * models rather than trusted, obstacle rows that close the whole track are
 * thinned, scenery that would block the chase camera is hidden, and every
 * repair is reported so the playtest can send it back to the model.
 *
 * Load order in the game document: host contract, three.js r157, this file,
 * then the world module, which calls GameMog.world({...}).
 */
(function () {
  'use strict';

  var GM = window.GameMog;
  var diag = window.__gm || (window.__gm = { ready: false, results: [], errors: [] });
  diag.warnings = diag.warnings || [];
  function warn(m) { m = String(m).slice(0, 320); if (diag.warnings.indexOf(m) < 0 && diag.warnings.length < 40) diag.warnings.push(m); }
  function fail(m) { m = String(m).slice(0, 400); if (diag.errors.indexOf(m) < 0 && diag.errors.length < 40) diag.errors.push(m); try { console.error('[gamemog] ' + m); } catch (e) {} }

  /* ------------------------------------------------------------ rules -- */
  var RULES = Object.freeze({
    version: 1,
    baseSpeed: 20, fastSpeed: 28, slowSpeed: 12, accel: 16,
    lateralSpeed: 10, lateralAccel: 48,
    // rival k (1, 2, 3, ...): speed as a multiple of your cruising speed, and
    // how hard it hunts you. The first is slower than you; by the fifth they
    // match you; past that they come from behind.
    rivalSpeed: function (k) { return Math.min(1.42, 0.78 + 0.07 * (k - 1)); },
    rivalAggression: function (k) { return Math.min(0.95, 0.15 + 0.09 * (k - 1)); },
    lapMin: 320, lapMax: 900,
    halfWidthMin: 4, halfWidthMax: 9,
    startClear: 45,
    obstacleSpacing: 11,
    coinGroupEvery: 105, coinsPerGroup: 5, coinSpacing: 3.2,
    corridorHeight: 7,
  });
  GM.rules = RULES;

  var worldDef = null;
  GM.world = function (def) {
    if (worldDef) { warn('GameMog.world() was called more than once; only the first definition is used.'); return; }
    worldDef = def || {};
  };

  /* -------------------------------------------------------------- maths -- */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function damp(cur, tgt, lambda, dt) { return lerp(cur, tgt, 1 - Math.exp(-lambda * dt)); }
  function approach(cur, tgt, step) { return cur < tgt ? Math.min(tgt, cur + step) : Math.max(tgt, cur - step); }
  function mulberry(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6d2b79f5) >>> 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashStr(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function isHex(c) { return typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c); }
  function num(v, d, a, b) { if (v == null || v === '') return d; v = Number(v); return isFinite(v) ? clamp(v, a, b) : d; }
  // a world's `graphics`, bounded: every value has a floor and a ceiling
  function readGraphics(g) {
    if (!g || typeof g !== 'object') return null;
    var b = g.bloom === false ? null : (g.bloom && typeof g.bloom === 'object' ? g.bloom : {});
    var gr = g.grade && typeof g.grade === 'object' ? g.grade : {};
    var sh = g.shadows === false ? null : (g.shadows && typeof g.shadows === 'object' ? g.shadows : {});
    var env = g.environment === false ? null : g.environment == null ? true : g.environment;
    return {
      exposure: num(g.exposure, 1, 0.3, 3),
      environment: env,
      envIntensity: env && typeof env === 'object' && env.intensity != null ? num(env.intensity, 1, 0, 4) : null,
      bloom: b && { strength: num(b.strength, 0.5, 0, 2), threshold: num(b.threshold, 1, 0.2, 6), radius: num(b.radius, 0.7, 0.2, 1.6) },
      grade: { contrast: num(gr.contrast, 1.04, 0.8, 1.3), saturation: num(gr.saturation, 1.05, 0.5, 1.5), warmth: num(gr.warmth, 0, -1, 1), vignette: num(gr.vignette, 0.25, 0, 0.8), grain: num(gr.grain, 0.015, 0, 0.08) },
      shadows: sh && { follow: sh.follow !== false, extent: num(sh.extent, 38, 16, 90), mapSize: Number(sh.mapSize) === 1024 ? 1024 : 2048 },
      msaa: g.antialias !== false,
    };
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (!window.THREE) { fail('three.js did not load, so the game cannot start.'); return; }
    if (!worldDef) { fail('The world module never called GameMog.world({...}).'); return; }
    try { boot(worldDef); }
    catch (e) { fail('The world failed to build: ' + (e && e.message || e)); try { console.error(e); } catch (e2) {} }
  });

  function boot(def) {
    var THREE = window.THREE;
    var meta = GM.meta || { title: GM.title || 'GameMog', tagline: '' };

    /* ------------------------------------------------------------ theme -- */
    var theme = def.theme || {};
    var T = {
      sky: isHex(theme.sky) ? theme.sky : '#8FB8D8',
      fog: isHex(theme.fog) ? theme.fog : (isHex(theme.sky) ? theme.sky : '#A9C4D8'),
      ink: isHex(theme.ink) ? theme.ink : '#1E1A16',
      panel: isHex(theme.panel) ? theme.panel : '#FFF6E6',
      accent: isHex(theme.accent) ? theme.accent : '#FF8A3D',
      font: typeof theme.font === 'string' && /^[A-Za-z0-9 ]{2,40}$/.test(theme.font) ? theme.font : 'Fredoka',
    };
    var G = readGraphics(def.graphics);
    // set before anything is built: rivals are prebuilt before the graphics
    // start, and envify() must not scale their materials by an unset value
    var envScale = 1;

    /* --------------------------------------------------------- renderer -- */
    // a cinematic world renders into its own multisampled HDR target, so the
    // canvas itself needs no antialiasing
    var renderer = new THREE.WebGLRenderer({ antialias: !G, powerPreference: 'high-performance' });
    var basePixelRatio = Math.min(window.devicePixelRatio || 1, G ? 1.5 : 2);
    renderer.setPixelRatio(basePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    if (G) renderer.toneMappingExposure = G.exposure;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(renderer.domElement);

    var scene = new THREE.Scene();
    scene.background = new THREE.Color(T.sky);
    scene.fog = new THREE.Fog(T.fog, 70, 380);
    var cam = def.camera || {};
    var camDist = clamp(Number(cam.distance) || 9, 6, 14);
    var camHeight = clamp(Number(cam.height) || 4, 2.5, 6.5);
    var camera = new THREE.PerspectiveCamera(clamp(Number(cam.fov) || 64, 50, 78), window.innerWidth / window.innerHeight, 0.1, 1800);
    var baseFov = camera.fov;
    // a phone held upright would see a sliver of track through a landscape
    // lens: keep at least 60 degrees across, whatever the screen's shape
    function fovFor(aspect) {
      var across = 2 * Math.atan(Math.tan(30 * Math.PI / 180) / Math.max(0.2, aspect)) * 180 / Math.PI;
      return clamp(Math.max(baseFov, across), baseFov, 96);
    }
    window.addEventListener('resize', function () {
      renderer.setSize(window.innerWidth, window.innerHeight);
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      if (post) post.resize();
    });
    var post = null;

    /* ------------------------------------------------------------ track -- */
    var trackDef = def.track || {};
    var raw = Array.isArray(trackDef.points) ? trackDef.points : [];
    var pts = raw.filter(function (p) { return Array.isArray(p) && p.length >= 2 && p.every(function (v) { return typeof v === 'number' && isFinite(v); }); })
      .map(function (p) { return p.length === 2 ? new THREE.Vector3(p[0], 0, p[1]) : new THREE.Vector3(p[0], p[1], p[2]); });
    if (pts.length < 6) throw new Error('track.points needs at least 6 [x, y, z] control points forming a closed loop; got ' + pts.length + '.');
    if (pts.length > 80) { warn('track.points had ' + pts.length + ' points; the first 80 were used.'); pts = pts.slice(0, 80); }
    var hw = clamp((Number(trackDef.width) || 12) / 2, RULES.halfWidthMin, RULES.halfWidthMax);
    if (trackDef.width && Math.abs(trackDef.width / 2 - hw) > 0.01) warn('track.width must be between ' + RULES.halfWidthMin * 2 + ' and ' + RULES.halfWidthMax * 2 + ' metres; it was clamped to ' + hw * 2 + '.');

    var curve = new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.5);
    var rawLen = curve.getLength();
    if (rawLen < RULES.lapMin || rawLen > RULES.lapMax) {
      var target = clamp(rawLen, RULES.lapMin, RULES.lapMax), k = target / rawLen;
      var c = new THREE.Vector3(); pts.forEach(function (p) { c.add(p); }); c.divideScalar(pts.length);
      pts.forEach(function (p) { p.x = c.x + (p.x - c.x) * k; p.z = c.z + (p.z - c.z) * k; });
      curve = new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.5);
      warn('The track loop was ' + Math.round(rawLen) + 'm; laps must be ' + RULES.lapMin + ' to ' + RULES.lapMax + 'm, so it was scaled to ' + Math.round(curve.getLength()) + 'm. Everything placed with ctx.track helpers moved with it.');
    }

    var NS = 2400, P = [], CUM = new Float64Array(NS + 1);
    for (var i = 0; i <= NS; i++) P.push(curve.getPoint(i / NS));
    for (i = 1; i <= NS; i++) CUM[i] = CUM[i - 1] + P[i].distanceTo(P[i - 1]);
    var L = CUM[NS];
    var UP = new THREE.Vector3(0, 1, 0);
    function wrapD(d) { d = d % L; return d < 0 ? d + L : d; }
    function rel(a, b) { var x = wrapD(a - b); return x > L / 2 ? x - L : x; } // a relative to b, shortest
    function Frame() { return { pos: new THREE.Vector3(), tan: new THREE.Vector3(), right: new THREE.Vector3(), up: new THREE.Vector3(), left: new THREE.Vector3() }; }
    function frameAt(d, out) {
      out = out || Frame();
      var x = wrapD(d), lo = 0, hi = NS;
      while (lo < hi - 1) { var m = (lo + hi) >> 1; if (CUM[m] <= x) lo = m; else hi = m; }
      var seg = CUM[lo + 1] - CUM[lo], f = seg > 1e-6 ? (x - CUM[lo]) / seg : 0;
      out.pos.copy(P[lo]).lerp(P[lo + 1], f);
      out.tan.subVectors(P[(lo + 4) % NS], P[(lo + NS - 3) % NS]).normalize();
      out.right.crossVectors(out.tan, UP).normalize();
      out.up.crossVectors(out.right, out.tan).normalize();
      out.left.copy(out.right).negate();
      return out;
    }
    var TMP = Frame(), BASIS = new THREE.Matrix4();
    function pointAt(d, x, y, out) { frameAt(d, TMP); return (out || new THREE.Vector3()).copy(TMP.pos).addScaledVector(TMP.right, x || 0).addScaledVector(TMP.up, y || 0); }
    // world objects are authored facing +Z with +Y up; the runtime turns them to face along the track
    function place(obj, d, x, y, yaw) {
      frameAt(d, TMP);
      obj.position.copy(TMP.pos).addScaledVector(TMP.right, x).addScaledVector(TMP.up, y || 0);
      BASIS.makeBasis(TMP.left, TMP.up, TMP.tan);
      obj.quaternion.setFromRotationMatrix(BASIS);
      if (yaw) obj.rotateY(yaw);
    }

    // coarse samples for "where is the track" queries
    var COARSE = [];
    for (var cd = 0; cd < L; cd += 3) { var cf = frameAt(cd, Frame()); COARSE.push({ d: cd, x: cf.pos.x, y: cf.pos.y, z: cf.pos.z, rx: cf.right.x, rz: cf.right.z }); }
    function nearest(x, z) {
      var best = null, bd = Infinity;
      for (var j = 0; j < COARSE.length; j++) { var s = COARSE[j], dd = (s.x - x) * (s.x - x) + (s.z - z) * (s.z - z); if (dd < bd) { bd = dd; best = s; } }
      return { d: best.d, distance: Math.sqrt(bd), lateral: (x - best.x) * best.rx + (z - best.z) * best.rz, y: best.y };
    }

    // the loop must not run through itself
    for (var a = 0; a < COARSE.length; a += 2) for (var b = a + 12; b < COARSE.length; b += 2) {
      var A = COARSE[a], B = COARSE[b];
      if (Math.abs(A.d - B.d) < 30 || L - Math.abs(A.d - B.d) < 30) continue;
      if (Math.hypot(A.x - B.x, A.z - B.z) < hw * 2 + 2 && Math.abs(A.y - B.y) < 6) {
        warn('The track passes within ' + Math.round(Math.hypot(A.x - B.x, A.z - B.z)) + 'm of itself at ' + Math.round(A.d / L * 100) + '% and ' + Math.round(B.d / L * 100) + '% of the lap; spread the loop so it never overlaps.');
        a = COARSE.length; break;
      }
    }

    function ribbon(opts) {
      opts = opts || {};
      var w = opts.width != null ? opts.width : hw * 2, lift = opts.y != null ? opts.y : 0.02, off = opts.offset || 0;
      var n = Math.max(80, Math.round(L / (opts.step || 2)));
      var pos = new Float32Array((n + 1) * 2 * 3), uv = new Float32Array((n + 1) * 2 * 2), idx = [];
      var F = Frame(), tile = opts.tile || w;
      for (var s = 0; s <= n; s++) {
        var d = (s / n) * L; frameAt(d, F);
        for (var side = 0; side < 2; side++) {
          var lx = off + (side ? w / 2 : -w / 2), v = (s * 2 + side) * 3;
          pos[v] = F.pos.x + F.right.x * lx + F.up.x * lift;
          pos[v + 1] = F.pos.y + F.right.y * lx + F.up.y * lift;
          pos[v + 2] = F.pos.z + F.right.z * lx + F.up.z * lift;
          uv[(s * 2 + side) * 2] = side; uv[(s * 2 + side) * 2 + 1] = d / tile;
        }
        if (s < n) { var q = s * 2; idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); }
      }
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      g.setIndex(idx); g.computeVertexNormals();
      var mat = opts.material || new THREE.MeshStandardMaterial({ color: opts.color || '#8A6A4A', roughness: 0.95 });
      mat.side = THREE.DoubleSide;
      var mesh = new THREE.Mesh(g, mat);
      mesh.receiveShadow = true;
      mesh.userData.gmTrack = true;
      return mesh;
    }

    var ANISO = G ? Math.min(8, renderer.capabilities.getMaxAnisotropy()) : 4;
    function canvasTexture(w, h, draw, opts) {
      var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      draw(cv.getContext('2d'), w, h);
      var tex = new THREE.CanvasTexture(cv);
      // colour maps are sRGB; roughness, bump and other data maps are linear
      tex.colorSpace = opts && opts.linear ? THREE.NoColorSpace : THREE.SRGBColorSpace; tex.anisotropy = ANISO;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      return tex;
    }
    // a tangent-space normal map from a height field drawn in greys (white is
    // high): grain on a running track, weave in cloth, mortar between bricks
    function normalTexture(w, h, draw, strength) {
      var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      var g = cv.getContext('2d', { willReadFrequently: true });
      g.fillStyle = '#808080'; g.fillRect(0, 0, w, h);
      draw(g, w, h);
      var src = g.getImageData(0, 0, w, h).data, out = g.createImageData(w, h), o = out.data, k = Number(strength) || 2;
      function H(x, y) { x = (x + w) % w; y = (y + h) % h; return src[(y * w + x) * 4] / 255; }
      for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
        var nx = -(H(x + 1, y) - H(x - 1, y)) * k, ny = (H(x, y + 1) - H(x, y - 1)) * k, len = Math.sqrt(nx * nx + ny * ny + 1), q = (y * w + x) * 4;
        o[q] = (nx / len * 0.5 + 0.5) * 255; o[q + 1] = (ny / len * 0.5 + 0.5) * 255; o[q + 2] = (1 / len * 0.5 + 0.5) * 255; o[q + 3] = 255;
      }
      g.putImageData(out, 0, 0);
      var tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.NoColorSpace; tex.anisotropy = ANISO;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      return tex;
    }

    /* -------------------------------------------------------------- sky -- */
    // A sky dome with a sun: a gradient from the zenith to the horizon to the
    // ground, a warm haze on the horizon under the sun, and a glowing disc. It
    // is also what a cinematic world's image-based light is baked from, so the
    // light on every surface matches the sky above it.
    var skies = [], skyParams = null;
    function skyMaterial(p, sunScale) {
      return new THREE.ShaderMaterial({
        uniforms: {
          uTop: { value: new THREE.Color(p.top) }, uHorizon: { value: new THREE.Color(p.horizon) }, uBottom: { value: new THREE.Color(p.bottom) },
          uSunDir: { value: p.sunDir.clone() }, uSunColor: { value: new THREE.Color(p.sunColor) },
          uSunSize: { value: p.sunSize }, uGlow: { value: p.glow }, uSunPower: { value: p.sunPower * sunScale }, uHaze: { value: p.haze }, uCurve: { value: p.curve },
        },
        vertexShader: 'varying vec3 vDir; void main() { vDir = position; vec4 c = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = c.xyww; gl_Position.z *= 0.99999; }',
        fragmentShader: [
          'uniform vec3 uTop, uHorizon, uBottom, uSunDir, uSunColor; uniform float uSunSize, uGlow, uSunPower, uHaze, uCurve; varying vec3 vDir;',
          'void main() {',
          '  vec3 d = normalize(vDir); float h = d.y;',
          '  vec3 col = h > 0.0 ? mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), uCurve)) : mix(uHorizon, uBottom, pow(clamp(-h, 0.0, 1.0), 0.35));',
          '  float c = max(dot(d, uSunDir), 0.0);',
          '  col = mix(col, uSunColor, clamp(uHaze * pow(c, 4.0) * pow(1.0 - abs(h), 6.0), 0.0, 1.0));',
          '  col += uSunColor * uGlow * (0.3 * pow(c, 10.0) + 1.2 * pow(c, 220.0));',
          '  col += uSunColor * uSunPower * smoothstep(cos(uSunSize), cos(uSunSize * 0.8), dot(d, uSunDir));',
          '  gl_FragColor = vec4(col, 1.0);',
          '  #include <tonemapping_fragment>',
          '  #include <colorspace_fragment>',
          '}',
        ].join('\n'),
        side: THREE.BackSide, depthWrite: false, fog: false,
      });
    }
    function sky(o) {
      o = o || {};
      var dir = Array.isArray(o.sun) && o.sun.length === 3 ? new THREE.Vector3(o.sun[0], o.sun[1], o.sun[2]) : new THREE.Vector3(0.45, 0.35, 0.3);
      if (dir.lengthSq() < 1e-6) dir.set(0.45, 0.35, 0.3);
      var p = {
        top: isHex(o.top) ? o.top : T.sky, horizon: isHex(o.horizon) ? o.horizon : T.fog, bottom: isHex(o.bottom) ? o.bottom : '#3A3A34',
        sunDir: dir.normalize(), sunColor: isHex(o.sunColor) ? o.sunColor : '#FFF1D6',
        sunSize: clamp(Number(o.sunSize) || 1.4, 0.3, 8) * Math.PI / 180,
        glow: clamp(o.glow == null ? 1 : Number(o.glow), 0, 6), sunPower: clamp(o.sunPower == null ? 12 : Number(o.sunPower), 0, 60), haze: clamp(o.haze == null ? 0.5 : Number(o.haze), 0, 1),
        curve: clamp(o.curve == null ? 0.45 : Number(o.curve), 0.15, 2.5),
      };
      var mesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24), skyMaterial(p, 1));
      mesh.frustumCulled = false; mesh.renderOrder = -1000; mesh.userData.gmSky = true;
      scene.add(mesh); skies.push(mesh); skyParams = p;
      return mesh;
    }

    var DUMMY = new THREE.Object3D();
    function instanced(geometry, material, count, fn) {
      var im = new THREE.InstancedMesh(geometry, material, count);
      for (var n = 0; n < count; n++) { DUMMY.position.set(0, 0, 0); DUMMY.rotation.set(0, 0, 0); DUMMY.scale.set(1, 1, 1); fn(n, DUMMY); DUMMY.updateMatrix(); im.setMatrixAt(n, DUMMY.matrix); }
      im.instanceMatrix.needsUpdate = true;
      return im;
    }

    var scenery = new THREE.Group(); scenery.name = 'scenery'; scene.add(scenery);
    // phones and tablets get 'low': a world builds lighter there (fewer
    // instances, simpler meshes); the rules and the track stay the same
    var coarse = false; try { coarse = window.matchMedia('(pointer: coarse)').matches; } catch (e) {}
    var quality = coarse || Math.min(window.screen.width || 1280, window.screen.height || 720) < 600 ? 'low' : 'high';
    var ctx = {
      THREE: THREE, scene: scene, scenery: scenery, camera: camera, renderer: renderer,
      rules: RULES, theme: T, quality: quality,
      random: mulberry(hashStr(meta.title || 'world')),
      track: {
        length: L, halfWidth: hw, width: hw * 2,
        frameAt: function (d) { return frameAt(d, Frame()); },
        pointAt: pointAt, nearest: nearest, ribbon: ribbon,
        // is (x, z) far enough from the racing line to put scenery there?
        clear: function (x, z, margin) { return nearest(x, z).distance > hw + (margin == null ? 3 : margin); },
      },
      textures: { canvas: canvasTexture, normal: normalTexture },
      instanced: instanced,
      sky: sky,
      audio: null,
    };

    /* -------------------------------------------------------- the world -- */
    function call(name) {
      var fn = def[name];
      if (typeof fn !== 'function') return undefined;
      return fn.apply(def, [ctx].concat([].slice.call(arguments, 1)));
    }
    call('build');

    var lights = 0; scene.traverse(function (o) { if (o.isLight) lights++; });
    if (!lights) {
      warn('build() added no lights, so default ones were used. Add a HemisphereLight and a DirectionalLight in the world\'s own colours.');
      scene.add(new THREE.HemisphereLight('#ffffff', '#445533', 1.0));
      var sun = new THREE.DirectionalLight('#fff4dd', 1.6); sun.position.set(60, 120, 40); scene.add(sun);
    }

    function asEntity(r, label, defaultRadius) {
      if (!r || !r.object || !r.object.isObject3D) throw new Error(label + ' must return { object: <THREE.Object3D>, ... }.');
      var box = new THREE.Box3().setFromObject(r.object), size = box.getSize(new THREE.Vector3());
      var measured = size.x > 0 ? Math.max(size.x, size.z) / 2 * 0.82 : defaultRadius;
      var declared = Number(r.radius);
      var radius = declared > 0 ? clamp(declared, measured * 0.7, measured * 1.1) : measured;
      if (declared > 0 && Math.abs(radius - declared) > 0.05) warn(label + ' declared radius ' + declared.toFixed(2) + ' but its model is about ' + measured.toFixed(2) + ' across; the hitbox follows the model (' + radius.toFixed(2) + ').');
      // the runtime moves a carrier; the world's own object inside it is the
      // world's to animate (hops, leans, tumbles) without fighting the runtime
      var carrier = new THREE.Group(); carrier.add(r.object);
      return { object: carrier, model: r.object, radius: radius, height: size.y, animate: typeof r.animate === 'function' ? r.animate : null, name: r.name, color: r.color };
    }

    // the player
    var P0 = asEntity(call('player'), 'player()', 0.9);
    P0.radius = clamp(P0.radius, 0.45, 1.6);
    scene.add(P0.object);
    P0.object.traverse(function (o) { if (o.isMesh) o.castShadow = true; });

    // rivals are built on demand, but the first dozen are built now so a
    // broken rival() shows up in the playtest rather than at level 9
    var rivalCache = {};
    function makeRival(k) {
      if (rivalCache[k]) return rivalCache[k];
      var e;
      try { e = asEntity(call('rival', k), 'rival(ctx, ' + k + ')', 0.9); }
      catch (err) {
        fail('rival(ctx, ' + k + ') failed: ' + (err && err.message || err));
        var g = new THREE.Mesh(new THREE.CapsuleGeometry(0.7, 0.8, 4, 12), new THREE.MeshStandardMaterial({ color: '#888888' }));
        e = { object: g, radius: 0.8, height: 2, animate: null };
      }
      e.radius = clamp(e.radius, 0.45, 1.8);
      e.name = typeof e.name === 'string' && e.name.trim() ? e.name.trim().slice(0, 18) : 'Rival ' + k;
      e.color = isHex(e.color) ? e.color : T.accent;
      e.object.traverse(function (o) { if (o.isMesh) o.castShadow = true; });
      envify(e.object);
      rivalCache[k] = e;
      return e;
    }
    for (var rk = 1; rk <= 12; rk++) makeRival(rk);

    // obstacles
    var obstacles = [];
    var rawObs = [];
    try { rawObs = call('obstacles') || []; } catch (e) { fail('obstacles() failed: ' + (e && e.message || e)); }
    if (!Array.isArray(rawObs)) { warn('obstacles() must return an array.'); rawObs = []; }
    rawObs.forEach(function (o, n) {
      try {
        var e = asEntity(o, 'obstacles()[' + n + ']', 1);
        var d = o.at != null ? Number(o.at) * L : Number(o.d);
        if (!isFinite(d)) throw new Error('needs at (0 to 1, fraction of the lap)');
        d = wrapD(d);
        var x = clamp(Number(o.x) || 0, -hw, hw);
        var mv = o.move && Number(o.move.amplitude) > 0 ? { amp: Number(o.move.amplitude), period: clamp(Number(o.move.period) || 3, 1.2, 12), phase: n * 1.7 } : null;
        e.radius = clamp(e.radius, 0.3, hw * 0.8);
        obstacles.push({ d: d, x: x, x0: x, radius: e.radius, object: e.object, animate: e.animate, move: mv });
      } catch (err) { warn('obstacles()[' + n + '] was skipped: ' + (err && err.message || err)); }
    });
    // clear start zone
    obstacles.forEach(function (o) { if (o.d < RULES.startClear || o.d > L - 8) { o.d = RULES.startClear + (o.d % 10); warn('An obstacle sat on the start line; it was moved to ' + Math.round(o.d) + 'm. Keep the first ' + RULES.startClear + 'm clear.'); } });
    // density
    var maxObs = Math.floor(L / RULES.obstacleSpacing);
    if (obstacles.length > maxObs) {
      warn(obstacles.length + ' obstacles is too dense for a ' + Math.round(L) + 'm lap; ' + maxObs + ' were kept, evenly spread.');
      obstacles.sort(function (p, q) { return p.d - q.d; });
      var kept = []; for (var oi = 0; oi < maxObs; oi++) kept.push(obstacles[Math.floor(oi * obstacles.length / maxObs)]);
      obstacles = kept;
    }
    // fairness: every row must leave a gap the player fits through
    function rowBlocked(row) {
      var spans = row.map(function (o) { var sw = o.move ? o.move.amp : 0; return [o.x - o.radius - sw - P0.radius, o.x + o.radius + sw + P0.radius]; }).sort(function (p, q) { return p[0] - q[0]; });
      var need = P0.radius * 0.6, edge = -hw + P0.radius;
      for (var s = 0; s < spans.length; s++) { if (spans[s][0] - edge > need) return false; edge = Math.max(edge, spans[s][1]); }
      return hw - P0.radius - edge <= need;
    }
    obstacles.sort(function (p, q) { return p.d - q.d; });
    for (var guard = 0; guard < 200; guard++) {
      var changed = false;
      for (var r0 = 0; r0 < obstacles.length && !changed; r0++) {
        var row = obstacles.filter(function (o) { return Math.abs(rel(o.d, obstacles[r0].d)) < 3.5; });
        if (row.length && rowBlocked(row)) {
          var big = row.slice().sort(function (p, q) { return (q.radius + (q.move ? q.move.amp : 0)) - (p.radius + (p.move ? p.move.amp : 0)); })[0];
          if (big.move && big.move.amp > 0.5) big.move.amp *= 0.5; else obstacles.splice(obstacles.indexOf(big), 1);
          warn('Obstacles at ' + Math.round(big.d / L * 100) + '% of the lap closed the whole track; one was ' + (obstacles.indexOf(big) >= 0 ? 'slowed' : 'removed') + '. Always leave a gap wider than the player.');
          changed = true;
        }
      }
      if (!changed) break;
    }
    obstacles.forEach(function (o) {
      o.object.traverse(function (m) { if (m.isMesh) m.castShadow = true; });
      scene.add(o.object); place(o.object, o.d, o.x, 0);
    });

    // GM coins: golden, the same in every world
    var coinTex = canvasTexture(256, 256, function (g, w, h) {
      var grd = g.createRadialGradient(w * 0.4, h * 0.35, 10, w / 2, h / 2, w / 2);
      grd.addColorStop(0, '#FFF0A8'); grd.addColorStop(0.55, '#F6C33B'); grd.addColorStop(1, '#C8871A');
      g.fillStyle = grd; g.beginPath(); g.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2); g.fill();
      g.lineWidth = 14; g.strokeStyle = '#B7771A'; g.beginPath(); g.arc(w / 2, h / 2, w / 2 - 18, 0, Math.PI * 2); g.stroke();
      g.font = '900 104px Arial Black, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = '#9A5F0E'; g.fillText('GM', w / 2 + 4, h / 2 + 8);
      g.fillStyle = '#FFE68A'; g.fillText('GM', w / 2, h / 2 + 3);
    });
    coinTex.wrapS = coinTex.wrapT = THREE.ClampToEdgeWrapping;
    var coinGeo = new THREE.CylinderGeometry(0.62, 0.62, 0.14, 32);
    coinGeo.rotateX(Math.PI / 2);
    // GM must read as gold under any world's light, dusk swamp or night city,
    // so the coin carries its own glow rather than relying on the scene's
    var coinSide = new THREE.MeshStandardMaterial({ color: '#F2B632', metalness: 0.6, roughness: 0.35, emissive: '#C98A12', emissiveIntensity: 0.55 });
    var coinFace = new THREE.MeshStandardMaterial({ map: coinTex, metalness: 0.45, roughness: 0.35, emissive: '#FFFFFF', emissiveMap: coinTex, emissiveIntensity: 0.7 });
    var MAX_COINS = 90;
    var coinMesh = new THREE.InstancedMesh(coinGeo, [coinSide, coinFace, coinFace], MAX_COINS);
    coinMesh.frustumCulled = false; scene.add(coinMesh);
    var coins = [];

    // hide scenery that would block the chase camera (the classic: a start
    // arch whose banner fills the screen for the first seconds of the race)
    (function guardCorridor() {
      var grid = {};
      COARSE.forEach(function (s) { var key = Math.floor(s.x / 12) + ',' + Math.floor(s.z / 12); (grid[key] = grid[key] || []).push(s); });
      function intrudes(minX, maxX, minY, maxY, minZ, maxZ) {
        for (var gx = Math.floor((minX - hw - 3) / 12); gx <= Math.floor((maxX + hw + 3) / 12); gx++)
          for (var gz = Math.floor((minZ - hw - 3) / 12); gz <= Math.floor((maxZ + hw + 3) / 12); gz++) {
            var cell = grid[gx + ',' + gz]; if (!cell) continue;
            for (var j = 0; j < cell.length; j++) {
              var s = cell[j];
              var px = clamp(s.x, minX, maxX), pz = clamp(s.z, minZ, maxZ);
              if (Math.hypot(px - s.x, pz - s.z) > hw + 1.2) continue;
              if (maxY > s.y + 0.8 && minY < s.y + RULES.corridorHeight) return s;
            }
          }
        return null;
      }
      var hidden = 0, B = new THREE.Box3(), S = new THREE.Sphere(), M = new THREE.Matrix4(), ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
      scene.updateMatrixWorld(true);
      var skip = new Set([P0.object, coinMesh]); obstacles.forEach(function (o) { skip.add(o.object); });
      scene.traverse(function (o) {
        if (!o.isMesh || o.userData.gmTrack) return;
        for (var p = o; p; p = p.parent) if (skip.has(p)) return;
        if (o.isInstancedMesh) {
          // each instance's real box, not a bounding sphere: a sphere round a
          // flat plank reaches up into the corridor, and hiding the planks of a
          // boardwalk track because they "intrude" on it is exactly wrong
          if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
          var changed = false, IB = new THREE.Box3();
          for (var n = 0; n < o.count; n++) {
            o.getMatrixAt(n, M);
            IB.copy(o.geometry.boundingBox).applyMatrix4(M).applyMatrix4(o.matrixWorld);
            if (IB.max.y - IB.min.y < 0.8 || Math.max(IB.max.x - IB.min.x, IB.max.z - IB.min.z) > 140) continue;
            if (intrudes(IB.min.x, IB.max.x, IB.min.y, IB.max.y, IB.min.z, IB.max.z)) { o.setMatrixAt(n, ZERO); hidden++; changed = true; }
          }
          if (changed) o.instanceMatrix.needsUpdate = true;
          return;
        }
        B.setFromObject(o);
        var size = B.getSize(new THREE.Vector3());
        if (size.y < 0.8 || Math.max(size.x, size.z) > 140) return; // ground, water, sky: not in the way
        if (intrudes(B.min.x, B.max.x, B.min.y, B.max.y, B.min.z, B.max.z)) { o.visible = false; hidden++; }
      });
      if (hidden) warn(hidden + ' scenery piece' + (hidden > 1 ? 's were' : ' was') + ' inside the racing corridor (within ' + (hw + 1.2).toFixed(1) + 'm of the centre line and under ' + RULES.corridorHeight + 'm high) and were hidden so they cannot block the camera. Keep scenery off the track; overhead arches must clear ' + RULES.corridorHeight + 'm.');
    })();

    /* --------------------------------------------------------- graphics -- */
    // Opt-in cinematic rendering: image-based light baked from the world's own
    // sky, a sharp shadow map that follows the player, bloom, colour grading
    // and a resolution that adapts to hold 60 fps. Worlds without `graphics`
    // render exactly as before.
    var sunLight = null, sunOffset = null, SUNB = null;
    function envify(root) {
      if (!G || envScale === 1 || !isFinite(envScale)) return;
      root.traverse(function (o) {
        if (!o.isMesh) return;
        (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) {
          if (m && m.envMapIntensity !== undefined && !m.userData.gmEnv) { m.userData.gmEnv = true; m.envMapIntensity *= envScale; }
        });
      });
    }
    if (G) {
      try {
        scene.traverse(function (o) { if (!sunLight && o.isDirectionalLight && o.castShadow) sunLight = o; });
        if (G.environment) {
          var envScene = new THREE.Scene(), hemi = null;
          scene.traverse(function (o) { if (!hemi && o.isHemisphereLight) hemi = o; });
          var sp = skyParams || {
            top: T.sky, horizon: T.fog, bottom: hemi ? '#' + hemi.groundColor.getHexString() : '#3A3A34',
            sunDir: sunLight ? sunLight.position.clone().sub(sunLight.target.position).normalize() : new THREE.Vector3(0.45, 0.35, 0.3).normalize(),
            sunColor: sunLight ? '#' + sunLight.color.getHexString() : '#FFF1D6', sunSize: 3 * Math.PI / 180, glow: 1, sunPower: 12, haze: 0.5, curve: 0.45,
          };
          // the sun's direct light is the key light's job; in the environment it
          // only glows, or every surface would catch it twice
          envScene.add(new THREE.Mesh(new THREE.SphereGeometry(100, 48, 24), skyMaterial(sp, 0.06)));
          if (typeof G.environment === 'function') {
            var extra = G.environment(ctx);
            if (extra && extra.isObject3D) envScene.add(extra);
          } else if (G.environment && typeof G.environment === 'object' && G.environment.intensity != null) {
            envScale = clamp(Number(G.environment.intensity) || 1, 0, 4);
          }
          if (G.envIntensity != null) envScale = G.envIntensity;
          var pmrem = new THREE.PMREMGenerator(renderer);
          scene.environment = pmrem.fromScene(envScene, 0.02, 0.1, 400).texture;
          pmrem.dispose();
          envify(scene); for (var ek in rivalCache) envify(rivalCache[ek].object);
        }
        if (sunLight && G.shadows && G.shadows.follow) {
          scene.add(sunLight.target);
          var E = G.shadows.extent;
          sunOffset = sunLight.position.clone().sub(sunLight.target.position);
          if (sunOffset.lengthSq() < 1) sunOffset.set(40, 80, 30);
          sunOffset.setLength(Math.max(E * 3, 150));
          var sc = sunLight.shadow.camera;
          sc.left = -E; sc.right = E; sc.top = E; sc.bottom = -E; sc.near = 1; sc.far = sunOffset.length() + E * 3; sc.updateProjectionMatrix();
          sunLight.shadow.mapSize.set(G.shadows.mapSize, G.shadows.mapSize);
          if (sunLight.shadow.map) { sunLight.shadow.map.dispose(); sunLight.shadow.map = null; }
          if (!sunLight.shadow.normalBias) sunLight.shadow.normalBias = 0.025;
          if (!sunLight.shadow.bias) sunLight.shadow.bias = -0.0002;
          var fwd = sunOffset.clone().normalize().negate(), lr = new THREE.Vector3().crossVectors(fwd, Math.abs(fwd.y) > 0.99 ? new THREE.Vector3(1, 0, 0) : UP).normalize();
          SUNB = { fwd: fwd, right: lr, up: new THREE.Vector3().crossVectors(lr, fwd).normalize(), texel: 2 * E / G.shadows.mapSize, E: E, c: new THREE.Vector3() };
        }
        post = makePost();
      } catch (e) {
        warn('The cinematic graphics could not start on this device (' + (e && e.message || e) + '); the world renders without them.');
        post = null;
      }
    }
    // keep the shadow map on what the camera sees, snapped to whole texels so
    // shadow edges do not crawl as the player moves
    function followShadow() {
      if (!SUNB) return;
      var c = pointAt(player.d + SUNB.E * 0.35, player.x * 0.5, 0, SUNB.c);
      var a = Math.round(c.dot(SUNB.right) / SUNB.texel) * SUNB.texel, b = Math.round(c.dot(SUNB.up) / SUNB.texel) * SUNB.texel, f = c.dot(SUNB.fwd);
      c.set(0, 0, 0).addScaledVector(SUNB.right, a).addScaledVector(SUNB.up, b).addScaledVector(SUNB.fwd, f);
      sunLight.target.position.copy(c); sunLight.position.copy(c).add(sunOffset);
      sunLight.target.updateMatrixWorld();
    }

    function makePost() {
      var VS = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
      var tri = new THREE.BufferGeometry();
      tri.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
      tri.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2));
      var quad = new THREE.Mesh(tri); quad.frustumCulled = false;
      var qScene = new THREE.Scene(); qScene.add(quad);
      var qCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      var webgl2 = renderer.capabilities.isWebGL2;
      var hdrType = webgl2 || renderer.extensions.has('OES_texture_half_float') ? THREE.HalfFloatType : THREE.UnsignedByteType;
      var P = { msaa: G.msaa && webgl2, bloomOn: !!G.bloom, calls: 0 };
      var hdr = new THREE.WebGLRenderTarget(1, 1, { type: hdrType, samples: P.msaa ? 4 : 0 });
      var LEVELS = 6, mips = [];
      for (var i = 0; i < LEVELS; i++) mips.push(new THREE.WebGLRenderTarget(1, 1, { type: hdrType, depthBuffer: false }));
      function mat(fs, uniforms, extra) { var m = new THREE.ShaderMaterial(Object.assign({ uniforms: uniforms, vertexShader: VS, fragmentShader: fs, depthTest: false, depthWrite: false, toneMapped: false }, extra || {})); return m; }
      var down = mat([
        'uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uPrefilter, uThreshold, uKnee; varying vec2 vUv;',
        // one NaN or infinite pixel from a broken material must not bloom into a halo
        'vec3 s(vec2 o) {',
        '  vec3 c = texture2D(tSrc, vUv + o * uTexel).rgb;',
        '#if __VERSION__ >= 300',
        '  if (any(isnan(c)) || any(isinf(c))) c = vec3(0.0);',
        '#endif',
        '  return min(c, vec3(64.0));',
        '}',
        'float karis(vec3 c) { return 1.0 / (1.0 + max(c.r, max(c.g, c.b))); }',
        'void main() {',
        '  vec3 a = s(vec2(-2.0, 2.0)), b = s(vec2(0.0, 2.0)), c = s(vec2(2.0, 2.0)), d = s(vec2(-2.0, 0.0)), e = s(vec2(0.0)), f = s(vec2(2.0, 0.0));',
        '  vec3 g = s(vec2(-2.0, -2.0)), h = s(vec2(0.0, -2.0)), i = s(vec2(2.0, -2.0)), j = s(vec2(-1.0, 1.0)), k = s(vec2(1.0, 1.0)), l = s(vec2(-1.0, -1.0)), m = s(vec2(1.0, -1.0));',
        '  vec3 g0 = (a + b + d + e) * 0.25, g1 = (b + c + e + f) * 0.25, g2 = (d + e + g + h) * 0.25, g3 = (e + f + h + i) * 0.25, g4 = (j + k + l + m) * 0.25;',
        '  vec3 col;',
        '  if (uPrefilter > 0.5) {',
        '    float w0 = karis(g0), w1 = karis(g1), w2 = karis(g2), w3 = karis(g3), w4 = karis(g4);',
        '    col = (g4 * w4 * 0.5 + (g0 * w0 + g1 * w1 + g2 * w2 + g3 * w3) * 0.125) / (w4 * 0.5 + (w0 + w1 + w2 + w3) * 0.125);',
        '    float br = max(col.r, max(col.g, col.b)), soft = clamp(br - uThreshold + uKnee, 0.0, 2.0 * uKnee);',
        '    soft = soft * soft / (4.0 * uKnee + 1e-4);',
        '    col *= max(soft, br - uThreshold) / max(br, 1e-4);',
        '  } else col = g4 * 0.5 + (g0 + g1 + g2 + g3) * 0.125;',
        '  gl_FragColor = vec4(min(col, vec3(64.0)), 1.0);',
        '}',
      ].join('\n'), { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uPrefilter: { value: 0 }, uThreshold: { value: 1 }, uKnee: { value: 0.5 } });
      var up = mat([
        'uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uRadius, uWeight; varying vec2 vUv;',
        'vec3 s(float x, float y) { return texture2D(tSrc, vUv + vec2(x, y) * uTexel * uRadius).rgb; }',
        'void main() {',
        '  vec3 c = s(0.0, 0.0) * 4.0 + (s(-1.0, 0.0) + s(1.0, 0.0) + s(0.0, -1.0) + s(0.0, 1.0)) * 2.0 + s(-1.0, -1.0) + s(1.0, -1.0) + s(-1.0, 1.0) + s(1.0, 1.0);',
        '  gl_FragColor = vec4(c / 16.0 * uWeight, 1.0);',
        '}',
      ].join('\n'), { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uRadius: { value: 1 }, uWeight: { value: 1 } }, { blending: THREE.AdditiveBlending });
      var comp = mat([
        'uniform sampler2D tScene, tBloom; uniform float uBloom, uExposure, uContrast, uSat, uWarm, uVig, uGrain, uTime; uniform vec2 uRes; varying vec2 vUv;',
        'vec3 fit(vec3 v) { vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }',
        'vec3 aces(vec3 c) {',
        '  const mat3 IN = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));',
        '  const mat3 OUT = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));',
        '  return clamp(OUT * fit(IN * (c * uExposure / 0.6)), 0.0, 1.0);',
        '}',
        'vec3 srgb(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }',
        'float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }',
        'void main() {',
        '  vec3 c = texture2D(tScene, vUv).rgb;',
        '#if __VERSION__ >= 300',
        '  if (any(isnan(c)) || any(isinf(c))) c = vec3(0.0);',
        '#endif',
        '  c += texture2D(tBloom, vUv).rgb * uBloom;',
        '  c = aces(c);',
        '  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));',
        '  c = srgb(max(mix(vec3(l), c, uSat), 0.0));',
        '  c = (c - 0.5) * uContrast + 0.5;',
        '  c += vec3(uWarm, uWarm * 0.25, -uWarm) * 0.05;',
        '  vec2 q = vUv - 0.5; q.x *= uRes.x / uRes.y;',
        '  c *= 1.0 - uVig * smoothstep(0.3, 1.1, length(q));',
        '  c += (hash(vUv * uRes + fract(uTime * 7.31) * 113.0) - 0.5) * uGrain;',
        '  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);',
        '}',
      ].join('\n'), {
        tScene: { value: hdr.texture }, tBloom: { value: mips[0].texture }, uBloom: { value: G.bloom ? G.bloom.strength : 0 }, uExposure: { value: G.exposure },
        uContrast: { value: G.grade.contrast }, uSat: { value: G.grade.saturation }, uWarm: { value: G.grade.warmth }, uVig: { value: G.grade.vignette },
        uGrain: { value: G.grade.grain }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) },
      });
      var black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); black.needsUpdate = true;
      function pass(m, target) { quad.material = m; renderer.setRenderTarget(target); renderer.render(qScene, qCam); }
      P.resize = function () {
        var v = renderer.getDrawingBufferSize(new THREE.Vector2()), w = Math.max(1, v.x), h = Math.max(1, v.y);
        hdr.setSize(w, h);
        for (var i = 0; i < LEVELS; i++) mips[i].setSize(Math.max(1, w >> (i + 1)), Math.max(1, h >> (i + 1)));
        comp.uniforms.uRes.value.set(w, h);
      };
      P.setMsaa = function (on) { P.msaa = on; hdr.dispose(); hdr = new THREE.WebGLRenderTarget(1, 1, { type: hdrType, samples: on ? 4 : 0 }); comp.uniforms.tScene.value = hdr.texture; P.resize(); };
      P.render = function (time) {
        renderer.setRenderTarget(hdr);
        renderer.render(scene, camera);
        P.calls = renderer.info.render.calls; P.tris = renderer.info.render.triangles;
        if (P.bloomOn && G.bloom) {
          var src = hdr.texture, sw = hdr.width, sh = hdr.height;
          down.uniforms.uThreshold.value = G.bloom.threshold; down.uniforms.uKnee.value = G.bloom.threshold * 0.5;
          for (var i = 0; i < LEVELS; i++) {
            down.uniforms.tSrc.value = src; down.uniforms.uTexel.value.set(1 / sw, 1 / sh); down.uniforms.uPrefilter.value = i === 0 ? 1 : 0;
            pass(down, mips[i]); src = mips[i].texture; sw = mips[i].width; sh = mips[i].height;
          }
          var auto = renderer.autoClear; renderer.autoClear = false;
          for (i = LEVELS - 1; i > 0; i--) {
            up.uniforms.tSrc.value = mips[i].texture; up.uniforms.uTexel.value.set(1 / mips[i].width, 1 / mips[i].height);
            up.uniforms.uRadius.value = G.bloom.radius * 1.6; up.uniforms.uWeight.value = 0.55 + G.bloom.radius * 0.45;
            pass(up, mips[i - 1]);
          }
          renderer.autoClear = auto;
          comp.uniforms.tBloom.value = mips[0].texture;
        } else comp.uniforms.tBloom.value = black;
        comp.uniforms.uTime.value = time;
        pass(comp, null);
      };
      P.resize();
      return P;
    }

    // hold 60 fps: when frames run long, render fewer pixels, then drop the
    // multisampling, then the bloom. A world never has to guess the device.
    var Q = { acc: 0, n: 0, min: Math.max(0.5, Math.min(1, basePixelRatio * 0.6)) };
    function adapt(delta) {
      if (!post || state === 'paused' || document.hidden || delta > 0.1) return;
      Q.acc += delta; Q.n++;
      if (Q.n < 50) return;
      var ms = Q.acc / Q.n * 1000; Q.acc = 0; Q.n = 0;
      if (ms < 19.5) return;
      var pr = renderer.getPixelRatio();
      if (pr > Q.min + 0.01) { renderer.setPixelRatio(Math.max(Q.min, pr * 0.85)); renderer.setSize(window.innerWidth, window.innerHeight); post.resize(); }
      else if (post.msaa) post.setMsaa(false);
      else if (post.bloomOn) post.bloomOn = false;
    }

    /* ------------------------------------------------------------ audio -- */
    var audio = null;
    function ensureAudio() {
      if (audio) { if (audio.ctx.state === 'suspended' && !paused) audio.ctx.resume(); return audio; }
      var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
      var ac = new AC(), master = ac.createGain(); master.gain.value = 0.55; master.connect(ac.destination);
      var fx = ac.createGain(); fx.connect(master);
      var world = ac.createGain(); world.gain.value = 0.8; world.connect(master);
      audio = { ctx: ac, master: master, fx: fx, world: world };
      ctx.audio = { context: ac, destination: world };
      try { call('ambient'); } catch (e) { warn('ambient() failed: ' + (e && e.message || e)); }
      return audio;
    }
    function tone(freq, t0, dur, type, gain, slideTo) {
      if (!audio) return; var ac = audio.ctx, o = ac.createOscillator(), g = ac.createGain();
      o.type = type || 'sine'; o.frequency.setValueAtTime(freq, ac.currentTime + t0);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ac.currentTime + t0 + dur);
      g.gain.setValueAtTime(0.0001, ac.currentTime + t0); g.gain.exponentialRampToValueAtTime(gain || 0.2, ac.currentTime + t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + t0 + dur);
      o.connect(g); g.connect(audio.fx); o.start(ac.currentTime + t0); o.stop(ac.currentTime + t0 + dur + 0.05);
    }
    function noise(dur, gain) {
      if (!audio) return; var ac = audio.ctx, n = Math.floor(ac.sampleRate * dur), buf = ac.createBuffer(1, n, ac.sampleRate), ch = buf.getChannelData(0);
      for (var i = 0; i < n; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2);
      var s = ac.createBufferSource(), g = ac.createGain(), f = ac.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 900; g.gain.value = gain || 0.6;
      s.buffer = buf; s.connect(f); f.connect(g); g.connect(audio.fx); s.start();
    }
    var SFX = {
      coin: function () { tone(988, 0, 0.08, 'square', 0.08); tone(1318, 0.06, 0.14, 'square', 0.08); },
      level: function () { [523, 659, 784, 1046].forEach(function (f, i) { tone(f, i * 0.09, 0.22, 'triangle', 0.14); }); },
      tick: function (hi) { tone(hi ? 880 : 440, 0, 0.12, 'sine', 0.18); },
      crash: function () { noise(0.7, 0.8); tone(140, 0, 0.5, 'sawtooth', 0.25, 40); },
      spawn: function () { tone(220, 0, 0.3, 'sawtooth', 0.08, 330); },
    };

    /* --------------------------------------------------------------- ui -- */
    var fontLink = document.createElement('link');
    fontLink.rel = 'stylesheet';
    fontLink.href = 'https://fonts.googleapis.com/css2?family=' + encodeURIComponent(T.font).replace(/%20/g, '+') + ':wght@500;700&display=swap';
    document.head.appendChild(fontLink);
    var css = document.createElement('style');
    css.textContent = [
      '#gm{position:fixed;inset:0;pointer-events:none;font-family:"' + T.font + '",system-ui,sans-serif;color:' + T.ink + ';-webkit-font-smoothing:antialiased}',
      '#gm .board{position:absolute;top:14px;background:' + T.panel + ';border:3px solid ' + T.ink + ';border-radius:10px;padding:6px 14px;text-align:center;min-width:92px}',
      '#gm .board small{display:block;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;opacity:.75}',
      '#gm .board b{display:block;font-size:30px;line-height:1.05;font-weight:700}',
      '#gm .lvl{left:14px}#gm .time{left:50%;transform:translateX(-50%)}#gm .gm{right:14px;display:flex;align-items:center;gap:8px}',
      '#gm .gm i{width:30px;height:30px;border-radius:50%;background:radial-gradient(circle at 38% 34%,#FFF0A8,#F6C33B 55%,#C8871A);border:2px solid #9A5F0E;display:flex;align-items:center;justify-content:center;font:900 11px Arial Black,Arial;color:#8A520A;font-style:normal}',
      '#gm .rivals{position:absolute;top:84px;left:14px;font-size:14px;font-weight:700;background:' + T.panel + ';border:2px solid ' + T.ink + ';border-radius:8px;padding:3px 10px}',
      '#gm .warn{position:absolute;bottom:22%;font-size:18px;font-weight:700;padding:6px 12px;background:' + T.accent + ';border:3px solid ' + T.ink + ';border-radius:8px;opacity:0}',
      '#gm .banner{position:absolute;left:50%;top:24%;transform:translate(-50%,-50%);text-align:center;opacity:0;transition:none}',
      '#gm .banner b{display:block;font-size:64px;font-weight:700;color:' + T.panel + ';-webkit-text-stroke:3px ' + T.ink + ';paint-order:stroke}',
      '#gm .banner span{display:inline-block;margin-top:6px;font-size:20px;font-weight:700;background:' + T.panel + ';border:3px solid ' + T.ink + ';border-radius:8px;padding:4px 12px}',
      '#gm .screen{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.28);pointer-events:auto}',
      '#gm .card{background:' + T.panel + ';border:4px solid ' + T.ink + ';border-radius:14px;padding:22px 28px;max-width:min(560px,90vw);text-align:center}',
      '#gm .card h1{margin:0;font-size:clamp(34px,6vw,58px);line-height:1;font-weight:700;color:' + T.accent + ';-webkit-text-stroke:2px ' + T.ink + ';paint-order:stroke}',
      '#gm .card p{margin:10px 0 0;font-size:17px;line-height:1.4;font-weight:500}',
      '#gm .card .rules{margin-top:14px;font-size:15px;text-align:left;display:grid;gap:6px}',
      '#gm .card kbd{display:inline-block;min-width:26px;padding:1px 6px;border:2px solid ' + T.ink + ';border-radius:6px;font:700 13px inherit;background:#fff}',
      '#gm .card .go{margin-top:16px;font-size:20px;font-weight:700;color:' + T.accent + '}',
      '#gm .card .stats{display:flex;gap:26px;justify-content:center;margin-top:14px}',
      '#gm .card .stats b{display:block;font-size:34px}#gm .card .stats small{font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;opacity:.75}',
      '#gm .count{position:absolute;left:50%;top:40%;transform:translate(-50%,-50%);font-size:120px;font-weight:700;color:' + T.panel + ';-webkit-text-stroke:4px ' + T.ink + ';paint-order:stroke}',
      '#gm .pad{position:absolute;bottom:18px;display:none;gap:12px;pointer-events:auto}',
      '#gm .pad button{width:74px;height:74px;border-radius:16px;border:3px solid ' + T.ink + ';background:' + T.panel + ';color:' + T.ink + ';display:flex;align-items:center;justify-content:center;touch-action:none;-webkit-tap-highlight-color:transparent}',
      '#gm .pad button.on{background:' + T.accent + '}',
      '#gm .pad.left{left:18px}#gm .pad.right{right:18px}',
      '#gm .pause{position:absolute;top:84px;right:14px;width:48px;height:48px;border-radius:10px;border:3px solid ' + T.ink + ';background:' + T.panel + ';display:none;align-items:center;justify-content:center;pointer-events:auto}',
      '@media (pointer:coarse){#gm .pad{display:flex}#gm .pause{display:flex}}',
      '#gm.touch .pad{display:flex}#gm.touch .pause{display:flex}',
    ].join('\n');
    document.head.appendChild(css);

    function el(tag, cls, html, parent) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; (parent || root).appendChild(e); return e; }
    function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    var root = document.createElement('div'); root.id = 'gm'; document.body.appendChild(root);
    if ('ontouchstart' in window) root.classList.add('touch');
    var hudLvl = el('div', 'board lvl', '<small>Level</small><b>1</b>');
    var hudTime = el('div', 'board time', '<small>Time</small><b>0:00</b>');
    var hudGm = el('div', 'board gm', '<i>GM</i><div><small>GM</small><b>0</b></div>');
    var hudRivals = el('div', 'rivals', '');
    var hudWarn = el('div', 'warn', '');
    var banner = el('div', 'banner', '<b></b><span></span>');
    var countEl = el('div', 'count', '');
    [hudLvl, hudTime, hudGm, hudRivals].forEach(function (e) { e.style.display = 'none'; });

    var CHEV = {
      left: '<svg width="34" height="34" viewBox="0 0 20 20" fill="currentColor"><path d="M12.8 3.6L6.4 10l6.4 6.4 1.6-1.6L9.6 10l4.8-4.8z"/></svg>',
      right: '<svg width="34" height="34" viewBox="0 0 20 20" fill="currentColor"><path d="M7.2 3.6L13.6 10l-6.4 6.4-1.6-1.6 4.8-4.8-4.8-4.8z"/></svg>',
      up: '<svg width="34" height="34" viewBox="0 0 20 20" fill="currentColor"><path d="M3.6 12.8L10 6.4l6.4 6.4-1.6 1.6L10 9.6l-4.8 4.8z"/></svg>',
      down: '<svg width="34" height="34" viewBox="0 0 20 20" fill="currentColor"><path d="M3.6 7.2L10 13.6l6.4-6.4-1.6-1.6L10 10.4 5.2 5.6z"/></svg>',
      pause: '<svg width="22" height="22" viewBox="0 0 20 20" fill="currentColor"><path d="M5 3h3.5v14H5zM11.5 3H15v14h-3.5z"/></svg>',
    };
    var padL = el('div', 'pad left'), padR = el('div', 'pad right');
    var btn = {};
    [['left', padL], ['right', padL], ['up', padR], ['down', padR]].forEach(function (p) {
      var b = el('button', '', CHEV[p[0]], p[1]); b.setAttribute('aria-label', p[0]); btn[p[0]] = b;
      function set(on) { input[p[0]] = on; b.classList.toggle('on', on); }
      b.addEventListener('pointerdown', function (e) { e.preventDefault(); ensureAudio(); set(true); try { b.setPointerCapture(e.pointerId); } catch (x) {} });
      ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (ev) { b.addEventListener(ev, function () { set(false); }); });
    });
    var pauseBtn = el('button', 'pause', CHEV.pause); pauseBtn.setAttribute('aria-label', 'pause');
    pauseBtn.addEventListener('click', function () { togglePause(); });

    var screen = null;
    function showScreen(html, onGo) {
      hideScreen();
      screen = el('div', 'screen', '<div class="card">' + html + '</div>');
      screen.addEventListener('pointerdown', function (e) { e.preventDefault(); ensureAudio(); onGo(); });
      screen._go = onGo;
    }
    function hideScreen() { if (screen) { screen.remove(); screen = null; } }
    var CONTROLS = '<div class="rules">' +
      '<div><kbd>&larr;</kbd> <kbd>&rarr;</kbd> steer &nbsp; <kbd>&uarr;</kbd> faster &nbsp; <kbd>&darr;</kbd> slower &nbsp; <kbd>Space</kbd> pause</div>' +
      '<div>Endless laps. Every lap a new rival joins, faster and meaner than the last.</div>' +
      '<div>Touch a rival or an obstacle and your run is over. Grab the golden GM.</div></div>';

    /* ------------------------------------------------------------ input -- */
    var input = { left: false, right: false, up: false, down: false };
    var KEYMAP = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down' };
    window.addEventListener('keydown', function (e) {
      var k = KEYMAP[e.code];
      if (k) { input[k] = true; e.preventDefault(); ensureAudio(); return; }
      if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyP' || e.code === 'Escape' || e.code === 'KeyR') {
        e.preventDefault(); ensureAudio();
        if (e.repeat) return;
        if (screen && (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyR')) { screen._go(); return; }
        if (state === 'race' || state === 'paused') { if (e.code !== 'Enter' && e.code !== 'KeyR') togglePause(); }
      }
    });
    window.addEventListener('keyup', function (e) { var k = KEYMAP[e.code]; if (k) input[k] = false; });
    window.addEventListener('blur', function () { input.left = input.right = input.up = input.down = false; if (state === 'race') togglePause(); });
    document.addEventListener('visibilitychange', function () { if (document.hidden && state === 'race') togglePause(); });

    /* ------------------------------------------------------------ state -- */
    var state = 'title', paused = false;
    var runRandom = mulberry((Date.now() ^ hashStr(meta.title || '')) >>> 0);
    var player = { d: 0, x: 0, v: 0, vx: 0, alive: true };
    var rivals = [];
    var level = 1, gm = 0, raceTime = 0, countdown = 0, crashT = 0, bannerT = 0, shake = 0, assisted = false;
    var crashedInto = '';
    var autopilot = false, timeScale = 1, invincible = false;

    function layCoins() {
      coins.length = 0;
      var groups = Math.max(4, Math.round(L / RULES.coinGroupEvery));
      for (var g = 0; g < groups; g++) {
        var d0 = RULES.startClear + ((g + runRandom() * 0.7) / groups) * (L - RULES.startClear - 20);
        var pattern = Math.floor(runRandom() * 3), x0 = (runRandom() * 2 - 1) * (hw - 1.4);
        for (var c = 0; c < RULES.coinsPerGroup && coins.length < MAX_COINS; c++) {
          var d = d0 + c * RULES.coinSpacing, x;
          if (pattern === 0) x = x0;
          else if (pattern === 1) x = x0 + Math.sin(c * 1.1) * 2.2;
          else x = x0 + (c - 2) * 1.1;
          x = clamp(x, -hw + 1, hw - 1);
          var blocked = obstacles.some(function (o) { return Math.abs(rel(o.d, d)) < o.radius + 1.6 && Math.abs(o.x0 - x) < o.radius + (o.move ? o.move.amp : 0) + 1.2; });
          if (!blocked) coins.push({ d: wrapD(d), x: x, taken: false });
        }
      }
      syncCoins(0);
    }
    var ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
    function syncCoins(t) {
      for (var n = 0; n < MAX_COINS; n++) {
        var c = coins[n];
        if (!c || c.taken) { coinMesh.setMatrixAt(n, ZERO); continue; }
        place(DUMMY, c.d, c.x, 1.25 + Math.sin(t * 3 + n) * 0.18, t * 3 + n * 0.4);
        DUMMY.scale.set(1, 1, 1); DUMMY.updateMatrix(); coinMesh.setMatrixAt(n, DUMMY.matrix);
      }
      coinMesh.instanceMatrix.needsUpdate = true;
    }

    function spawnRival(k, atD) {
      var e = makeRival(k);
      var r = {
        k: k, e: e, ratio: RULES.rivalSpeed(k), aggro: RULES.rivalAggression(k),
        d: atD, x: (runRandom() * 2 - 1) * (hw - e.radius - 0.5), vx: 0, v: RULES.baseSpeed * RULES.rivalSpeed(k),
        pref: (runRandom() * 2 - 1) * (hw - e.radius - 0.6), wf: 0.35 + runRandom() * 0.5, ph: runRandom() * 6.28,
      };
      scene.add(e.object);
      rivals.push(r);
      return r;
    }

    function reset() {
      rivals.forEach(function (r) { scene.remove(r.e.object); });
      rivals = [];
      player.d = 0; player.x = 0; player.v = 0; player.vx = 0; player.alive = true;
      level = 1; gm = 0; raceTime = 0; crashT = 0; bannerT = 0; crashedInto = ''; assisted = autopilot || timeScale !== 1;
      layCoins();
      spawnRival(1, L * 0.5);
      updateHud();
    }

    function startCountdown() {
      hideScreen(); reset();
      state = 'countdown'; countdown = 3;
      [hudLvl, hudTime, hudGm, hudRivals].forEach(function (e) { e.style.display = ''; });
      SFX.tick(false);
    }
    function togglePause() {
      if (state === 'race') { state = 'paused'; paused = true; if (audio) audio.ctx.suspend(); showScreen('<h1>Paused</h1><p>Level ' + level + ', ' + gm + ' GM</p><div class="go">Space or tap to carry on</div>', togglePause); }
      else if (state === 'paused') { hideScreen(); state = 'race'; paused = false; if (audio) audio.ctx.resume(); }
    }
    function levelUp() {
      level++;
      var r = spawnRival(level, player.d + L * 0.5);
      layCoins();
      banner.querySelector('b').textContent = 'Level ' + level;
      banner.querySelector('span').textContent = r.e.name + ' joins the race';
      bannerT = 2.4; SFX.level(); SFX.spawn();
      updateHud();
    }
    function crash(who) {
      if (!player.alive) return;
      player.alive = false; state = 'crashed'; crashT = 0; shake = 1; crashedInto = who;
      SFX.crash(); burst(pointAt(player.d, player.x, 1), '#ffffff', 40);
    }
    function showResults() {
      state = 'results';
      var t = Math.floor(raceTime);
      showScreen(
        '<h1>Level ' + level + '</h1><p>' + (crashedInto ? 'You hit ' + esc(crashedInto) + '.' : 'Run over.') + '</p>' +
        '<div class="stats"><div><b>' + level + '</b><small>Level</small></div><div><b>' + gm + '</b><small>GM</small></div><div><b>' + Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0') + '</b><small>Time</small></div></div>' +
        '<div class="go">Enter, Space or tap to go again</div>', startCountdown);
      try { GM.finish({ won: false, place: 0, timeMs: Math.round(raceTime * 1000), score: level * 1000 + gm, level: level, gm: gm, assisted: assisted }); } catch (e) {}
    }
    function updateHud() {
      hudLvl.querySelector('b').textContent = level;
      hudGm.querySelector('b').textContent = gm;
      hudRivals.textContent = rivals.length === 1 ? '1 rival' : rivals.length + ' rivals';
    }

    // particles
    var partGeo = new THREE.BufferGeometry(), PMAX = 240, pPos = new Float32Array(PMAX * 3), pVel = new Float32Array(PMAX * 3), pLife = new Float32Array(PMAX), pNext = 0;
    partGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    var parts = new THREE.Points(partGeo, new THREE.PointsMaterial({ size: 0.28, color: '#FFE070', transparent: true, depthWrite: false }));
    parts.frustumCulled = false; scene.add(parts);
    function burst(p, color, n) {
      parts.material.color.set(color);
      for (var i = 0; i < n; i++) {
        var j = pNext++ % PMAX;
        pPos[j * 3] = p.x; pPos[j * 3 + 1] = p.y; pPos[j * 3 + 2] = p.z;
        pVel[j * 3] = (Math.random() - 0.5) * 9; pVel[j * 3 + 1] = Math.random() * 7 + 2; pVel[j * 3 + 2] = (Math.random() - 0.5) * 9;
        pLife[j] = 0.8 + Math.random() * 0.5;
      }
    }
    function stepParticles(dt) {
      for (var i = 0; i < PMAX; i++) {
        if (pLife[i] <= 0) { pPos[i * 3 + 1] = -9999; continue; }
        pLife[i] -= dt; pVel[i * 3 + 1] -= 14 * dt;
        pPos[i * 3] += pVel[i * 3] * dt; pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt; pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
      }
      partGeo.attributes.position.needsUpdate = true;
    }

    /* --------------------------------------------------------- the race -- */
    function obstacleX(o, t) { return o.move ? clamp(o.x0 + Math.sin(t * Math.PI * 2 / o.move.period + o.move.phase) * o.move.amp, -hw + o.radius, hw - o.radius) : o.x0; }

    // the only way to die: touching a rival or an obstacle
    function collide(t) {
      var pr = P0.radius;
      for (var i = 0; i < obstacles.length; i++) {
        var o = obstacles[i], dd = rel(o.d, player.d);
        if (Math.abs(dd) > o.radius + pr + 0.5) continue;
        var dx = obstacleX(o, t) - player.x;
        if (dd * dd + dx * dx < (o.radius + pr) * (o.radius + pr) * 0.92) return 'an obstacle';
      }
      for (var j = 0; j < rivals.length; j++) {
        var r = rivals[j], dd2 = rel(r.d, player.d);
        if (Math.abs(dd2) > r.e.radius + pr + 0.5) continue;
        var dx2 = r.x - player.x;
        if (dd2 * dd2 + dx2 * dx2 < (r.e.radius + pr) * (r.e.radius + pr) * 0.92) return r.e.name;
      }
      return null;
    }

    function freeLateral(fromD, lookAhead, radius, t, ignoreRival) {
      // lateral positions blocked within lookAhead metres ahead of fromD
      var spans = [];
      obstacles.forEach(function (o) { var dd = rel(o.d, fromD); if (dd > -2 && dd < lookAhead) { var ox = obstacleX(o, t + dd / 20); spans.push([ox - o.radius - radius - 0.4, ox + o.radius + radius + 0.4, dd]); } });
      if (ignoreRival !== undefined) rivals.forEach(function (r) { if (r === ignoreRival) return; var dd = rel(r.d, fromD); if (dd > -6 && dd < lookAhead * 0.6) spans.push([r.x - r.e.radius - radius - 0.5, r.x + r.e.radius + radius + 0.5, dd]); });
      return spans;
    }
    function bestX(spans, want, radius) {
      var best = want, cost = Infinity;
      for (var s = 0; s <= 24; s++) {
        var x = -hw + radius + (2 * hw - 2 * radius) * s / 24, c = Math.abs(x - want) * 0.4;
        for (var i = 0; i < spans.length; i++) if (x > spans[i][0] && x < spans[i][1]) c += 40 / (1 + Math.max(0, spans[i][2]) * 0.08);
        if (c < cost) { cost = c; best = x; }
      }
      return { x: best, cost: cost };
    }

    function stepRivals(dt, t) {
      for (var i = 0; i < rivals.length; i++) {
        var r = rivals[i], R = r.e.radius;
        r.v = damp(r.v, RULES.baseSpeed * r.ratio, 2, dt);
        r.d += r.v * dt;
        var toPlayer = rel(player.d, r.d); // >0: the player is ahead of this rival
        var engage = player.alive && Math.abs(toPlayer) < 14 + 22 * r.aggro;
        var wander = r.pref + Math.sin(t * r.wf + r.ph) * (0.6 + 2.4 * r.aggro);
        var want = engage ? lerp(wander, player.x + player.vx * 0.3, r.aggro) : wander;
        want = bestX(freeLateral(r.d, 20, R, t, r), want, R).x;
        var maxLat = 2.2 + 7 * r.aggro;
        r.vx = clamp(damp(r.vx, (want - r.x) * (1.6 + 3 * r.aggro), 6, dt), -maxLat, maxLat);
        r.x = clamp(r.x + r.vx * dt, -hw + R, hw - R);
        place(r.e.object, r.d, r.x, 0, -r.vx * 0.05);
        if (r.e.animate) try { r.e.animate(t, dt, { speed: r.v, lateral: r.vx, crashed: false, paused: false }); } catch (e) { fail('A rival animate() threw: ' + (e && e.message || e)); r.e.animate = null; }
      }
    }

    // Test-only driver. It plans the way a player does: for each lane it
    // could steer toward, where will it actually be when it reaches each
    // hazard, given how fast it can move sideways, and will it be clear?
    function runAutopilot(t) {
      var px = player.x, v = Math.max(player.v, 6), latV = RULES.lateralSpeed * 0.85, rp = P0.radius;
      var hazards = [];
      obstacles.forEach(function (o) {
        var dd = rel(o.d, player.d); if (dd < -1 || dd > 42) return;
        var tau = Math.max(0, dd) / v;
        hazards.push({ tau: tau, x: obstacleX(o, t + tau), r: o.radius, dd: dd });
      });
      rivals.forEach(function (r) {
        var dd = rel(r.d, player.d), closing = v - r.v, tau;
        if (dd >= 0 && closing > 0.3) tau = dd / closing;
        else if (dd < 0 && closing < -0.3) tau = dd / closing;
        else if (Math.abs(dd) < r.e.radius + rp + 1.5) tau = 0;
        else return;
        if (tau > 3.5) return;
        hazards.push({ tau: tau, x: r.x + r.vx * Math.min(tau, 0.6), r: r.e.radius + 0.5, dd: dd });
      });
      var coin = coins.filter(function (c) { var dd = rel(c.d, player.d); return !c.taken && dd > 3 && dd < 24; })[0];
      var best = px, bestCost = Infinity, lim = hw - rp;
      for (var s = 0; s <= 30; s++) {
        var x = -lim + 2 * lim * s / 30, cost = Math.abs(x - px) * 0.15 + (coin ? Math.abs(x - coin.x) * 0.1 : 0);
        for (var i = 0; i < hazards.length; i++) {
          var h = hazards[i], reach = latV * h.tau;
          var at = px + Math.sign(x - px) * Math.min(Math.abs(x - px), reach);
          var gap = Math.abs(at - h.x) - (h.r + rp + 0.35);
          if (gap < 0) cost += 60 / (1 + h.tau * 1.5);
          else if (gap < 1) cost += (1 - gap) * 4;
        }
        if (cost < bestCost) { bestCost = cost; best = x; }
      }
      input.left = best < px - 0.25; input.right = best > px + 0.25;
      input.down = bestCost > 25; input.up = bestCost < 3;
    }

    function stepPlayer(dt, t) {
      if (autopilot) runAutopilot(t);
      var tv = input.up ? RULES.fastSpeed : input.down ? RULES.slowSpeed : RULES.baseSpeed;
      player.v = approach(player.v, tv, RULES.accel * dt);
      var lat = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      player.vx = approach(player.vx, lat * RULES.lateralSpeed, RULES.lateralAccel * dt);
      player.x += player.vx * dt;
      var lim = hw - P0.radius;
      if (player.x > lim) { player.x = lim; player.vx = 0; } else if (player.x < -lim) { player.x = -lim; player.vx = 0; }
      var before = Math.floor(player.d / L);
      player.d += player.v * dt;
      if (Math.floor(player.d / L) > before) levelUp();

      // coins
      for (var i = 0; i < coins.length; i++) {
        var c = coins[i]; if (c.taken) continue;
        var dd = rel(c.d, player.d); if (Math.abs(dd) > 1.6) continue;
        if (Math.abs(c.x - player.x) < P0.radius + 0.7) { c.taken = true; gm++; SFX.coin(); burst(pointAt(c.d, c.x, 1.2), '#FFD54A', 10); updateHud(); }
      }
      var hit = invincible ? null : collide(t);
      if (hit) crash(hit);
    }

    // rear warning: a faster rival closing from behind, in your lane or near it
    function updateWarn() {
      var show = null;
      for (var i = 0; i < rivals.length; i++) {
        var r = rivals[i], dd = rel(r.d, player.d);
        if (dd < 0 && dd > -24 && r.v > player.v + 0.5 && Math.abs(r.x - player.x) < 3.2) { show = r; break; }
      }
      if (show) {
        hudWarn.textContent = show.e.name + ' behind you';
        hudWarn.style.left = show.x > player.x ? '62%' : '24%';
        hudWarn.style.opacity = '1';
      } else hudWarn.style.opacity = '0';
    }

    /* ----------------------------------------------------------- camera -- */
    var camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), camInit = false;
    var CF = Frame(), PF = Frame();
    function stepCamera(dt, t) {
      var pp = pointAt(player.d, player.x, 1.1);
      var want = new THREE.Vector3(), look = new THREE.Vector3();
      if (state === 'title') {
        var ang = t * 0.12;
        frameAt(0, PF);
        want.copy(PF.pos).addScaledVector(PF.tan, Math.cos(ang) * 11).addScaledVector(PF.right, Math.sin(ang) * 11).addScaledVector(UP, 4.5);
        look.copy(PF.pos).addScaledVector(UP, 1.2);
      } else {
        frameAt(player.d - camDist, CF); frameAt(player.d + 9, PF);
        want.copy(CF.pos).addScaledVector(CF.right, player.x * 0.65).addScaledVector(UP, camHeight);
        look.copy(PF.pos).addScaledVector(PF.right, player.x * 0.5).addScaledVector(UP, 1.3);
      }
      if (!camInit) { camPos.copy(want); camLook.copy(look); camInit = true; }
      camPos.lerp(want, 1 - Math.exp(-8 * dt)); camLook.lerp(look, 1 - Math.exp(-10 * dt));
      camera.up.copy(UP);
      if (camera.zoom !== 1) { camera.zoom = 1; camera.updateProjectionMatrix(); }
      camera.position.copy(camPos);
      if (shake > 0) { camera.position.x += (Math.random() - 0.5) * shake * 0.8; camera.position.y += (Math.random() - 0.5) * shake * 0.6; shake = Math.max(0, shake - dt * 1.8); }
      camera.lookAt(camLook);
      var wantFov = fovFor(camera.aspect) + clamp((player.v - RULES.baseSpeed) * 0.5, -4, 6);
      if (Math.abs(camera.fov - wantFov) > 0.05) { camera.fov = damp(camera.fov, wantFov, 4, dt); camera.updateProjectionMatrix(); }
      void pp;
    }

    /* ------------------------------------------------------------- loop -- */
    var clock = new THREE.Clock(), t = 0, readySent = false, frames = 0, drawWarned = false;
    function frame() {
      requestAnimationFrame(frame);
      var delta = clock.getDelta(), raw = Math.min(delta, 0.05);
      var steps = Math.max(1, Math.round(timeScale));
      var dt = raw * timeScale / steps;
      for (var s = 0; s < steps; s++) tick(dt);
      syncCoins(t);
      for (var k = 0; k < skies.length; k++) skies[k].position.copy(camera.position);
      followShadow();
      try {
        if (post) post.render(t);
        else renderer.render(scene, camera);
      } catch (e) {
        if (post) { post = null; renderer.setRenderTarget(null); warn('The cinematic graphics failed on this device (' + (e && e.message || e) + '); the world renders without them.'); }
        else fail('Rendering failed: ' + (e && e.message || e));
      }
      if (frames > 30) adapt(delta);
      frames++;
      if (!readySent) { readySent = true; GM.ready(); }
      var calls = post ? post.calls : renderer.info.render.calls;
      if (frames === 240 && !drawWarned && calls > 450) { drawWarned = true; warn('The scene takes ' + calls + ' draw calls a frame. Merge or instance repeated scenery (ctx.instanced) to stay well under 300.'); }
    }
    function tick(dt) {
      var slow = state === 'crashed' ? 0.25 : 1;
      var sdt = state === 'paused' ? 0 : dt * slow;
      t += sdt;
      if (state === 'countdown') {
        var prev = Math.ceil(countdown); countdown -= dt;
        var now = Math.ceil(countdown);
        countEl.textContent = countdown > 0 ? String(now) : 'GO';
        if (now !== prev && now > 0) SFX.tick(false);
        if (countdown <= 0) { state = 'race'; SFX.tick(true); setTimeout(function () { if (countEl.textContent === 'GO') countEl.textContent = ''; }, 500); }
      } else if (state === 'race') {
        raceTime += sdt;
        stepPlayer(sdt, t);
        stepRivals(sdt, t);
        updateWarn();
        var secs = Math.floor(raceTime); hudTime.querySelector('b').textContent = Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0');
      } else if (state === 'crashed') {
        crashT += dt;
        stepRivals(sdt, t);
        if (crashT > 1.4) showResults();
      }
      if (state !== 'race' && state !== 'crashed') hudWarn.style.opacity = '0';
      if (bannerT > 0) { bannerT -= dt; banner.style.opacity = String(clamp(bannerT, 0, 1)); }

      // obstacles that move
      obstacles.forEach(function (o) {
        if (o.move) place(o.object, o.d, obstacleX(o, t), 0);
        if (o.animate) try { o.animate(t, sdt, {}); } catch (e) { fail('An obstacle animate() threw: ' + (e && e.message || e)); o.animate = null; }
      });
      place(P0.object, player.d, player.x, 0, -player.vx * 0.045);
      if (P0.animate) try { P0.animate(t, sdt, { speed: state === 'race' ? player.v : 0, lateral: player.vx, crashed: !player.alive, paused: state === 'paused' }); } catch (e) { fail('player animate() threw: ' + (e && e.message || e)); P0.animate = null; }
      if (typeof def.update === 'function') try { def.update(ctx, t, sdt); } catch (e) { fail('update() threw: ' + (e && e.message || e)); def.update = null; }
      stepParticles(sdt || dt * 0.25);
      stepCamera(dt, t);
    }

    showScreen('<h1>' + esc(meta.title || 'GameMog') + '</h1>' + (meta.tagline ? '<p>' + esc(meta.tagline) + '</p>' : '') + CONTROLS + '<div class="go">Enter or tap to start</div>', startCountdown);
    layCoins();
    requestAnimationFrame(frame);

    // for the platform's playtest, never for players: any use marks the run
    // as assisted, and assisted runs are refused by the leaderboard
    window.__gmRuntime = {
      version: RULES.version,
      state: function () {
        return { state: state, level: level, gm: gm, alive: player.alive, rivals: rivals.map(function (r) { return { k: r.k, name: r.e.name, ratio: r.ratio, aggro: r.aggro, ahead: rel(r.d, player.d), x: r.x }; }),
          lap: L, halfWidth: hw, obstacles: obstacles.length, coins: coins.length, playerRadius: P0.radius, time: raceTime,
          x: player.x, d: player.d, speed: player.v, paused: state === 'paused',
          render: { calls: post ? post.calls : renderer.info.render.calls, triangles: post ? post.tris : renderer.info.render.triangles, quality: quality, pixelRatio: renderer.getPixelRatio(), cinematic: !!post, msaa: !!(post && post.msaa), bloom: !!(post && post.bloomOn) }, input: { left: input.left, right: input.right, up: input.up, down: input.down }, crashedInto: crashedInto };
      },
      debug: {
        autopilot: function (on) { autopilot = !!on; assisted = true; },
        invincible: function (on) { invincible = !!on; assisted = true; },
        // hide the HUD for a clean cover shot of the world
        cinematic: function (on) { root.style.visibility = on ? 'hidden' : ''; },
        timeScale: function (n) { timeScale = clamp(Number(n) || 1, 1, 8); assisted = true; },
        start: function () { if (state === 'title' || state === 'results') startCountdown(); },
        crashInto: function () { assisted = true; if (obstacles[0]) { player.d = obstacles[0].d - 0.2; player.x = obstacleX(obstacles[0], t); } else if (rivals[0]) { player.d = rivals[0].d; player.x = rivals[0].x; } },
      },
    };
  }
})();
