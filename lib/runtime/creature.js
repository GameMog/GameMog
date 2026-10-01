/* GameMog creatures: the platform's kit for anything that is not a person
 * (runtime v1). The owner, 1 Oct: "We need to tap into the creativity of users
 * so it should be allowed to prompt for any enemy types", after a world asked
 * for tall green aliens and got green-tinted people.
 *
 * ctx.assets.creature({ ... }) builds one, procedurally, from what it should
 * be, and animates it from the same state the runtime gives a person: how fast
 * it goes, its stance, the move it is making, a hit, a knockout. Three plans:
 *
 *   biped    two legs, two arms, a neck and a head: aliens, robots, demons,
 *            mutants, lizard folk. Long limbs, a big head, any number of eyes.
 *   beast    four legs, a long body, a neck, a head and a tail: hounds,
 *            raptors on all fours, cats, boars, insects with a little license.
 *   floater  no legs: a body that hovers, with arms or tendrils if it has
 *            them: drones, ghosts, jellyfish, orbs, wraiths.
 *
 * It returns { object, animate(t, dt, s), height, radius, timing }, the shape
 * an open world's crew member takes (open.crew.<kind>.body), and works as a
 * race rival too. Forward is +z, the feet at y = 0.
 */
var GameMogCreatures = (function () {
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function num(v, d, a, b) { v = Number(v); return isFinite(v) ? clamp(v, a, b) : d; }
  function smooth(e0, e1, x) { var u = clamp((x - e0) / (e1 - e0), 0, 1); return u * u * (3 - 2 * u); }
  function bump(x, a, b, c) { return x < a ? 0 : x < b ? smooth(a, b, x) : 1 - smooth(b, c, x); }
  function damp(a, b, k, dt) { return a + (b - a) * (1 - Math.exp(-k * dt)); }

  // how long each kind of move takes, and when it lands (the runtime times blows by it)
  var TIMING = { strike: { duration: 0.75, contact: 0.32 }, cast: { duration: 0.9, contact: 0.48 }, hit: { duration: 0.45, contact: 0.2 },
    dash: { duration: 0.9, contact: 0.42 }, getup: { duration: 1.0, contact: 0.5 }, roll: { duration: 0.6, contact: 0.3 } };
  function moveKind(name) {
    name = String(name || '');
    if (/^hit|stagger|flinch/i.test(name)) return 'hit';
    if (/cast|shoot|fire|spit|zap|beam|throw|blast|breath/i.test(name)) return 'cast';
    if (/getup|rise/i.test(name)) return 'getup';
    if (/roll|dodge/i.test(name)) return 'roll';
    if (/dash|charge|lunge|pounce/i.test(name)) return 'dash';
    return 'strike';
  }

  // skin: a colour map with mottling and darker creases, a bump map of pores
  // and wrinkles, and a roughness map, drawn once per colour and shared
  var TEX = {};
  function rnd(seed) { var x = seed >>> 0 || 1; return function () { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return ((x >>> 0) % 100000) / 100000; }; }
  function skinTextures(THREE, color, pattern) {
    var key = color + ':' + (pattern || ''); if (TEX[key]) return TEX[key];
    var N = 512, R = rnd(color.split('').reduce(function (a, c) { return a * 31 + c.charCodeAt(0); }, 7) + (pattern ? pattern.length : 0));
    function cv(draw) { var c = document.createElement('canvas'); c.width = c.height = N; var g = c.getContext('2d'); draw(g); return c; }
    var base = new THREE.Color(color), hsl = {}; base.getHSL(hsl);
    function tone(dl, ds) { var c = new THREE.Color().setHSL((hsl.h + 1) % 1, Math.max(0, Math.min(1, hsl.s + (ds || 0))), Math.max(0, Math.min(1, hsl.l + dl))); return 'rgb(' + Math.round(c.r * 255) + ',' + Math.round(c.g * 255) + ',' + Math.round(c.b * 255) + ')'; }
    function blots(g, n, rmin, rmax, colorFn, alpha) {
      for (var i = 0; i < n; i++) {
        var x = R() * N, y = R() * N, r = rmin + R() * (rmax - rmin);
        for (var dx = -1; dx <= 1; dx++) for (var dy = -1; dy <= 1; dy++) {
          var gr = g.createRadialGradient(x + dx * N, y + dy * N, 0, x + dx * N, y + dy * N, r);
          gr.addColorStop(0, colorFn(i)); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.globalAlpha = alpha; g.fillStyle = gr; g.fillRect(x + dx * N - r, y + dy * N - r, r * 2, r * 2);
        }
      }
      g.globalAlpha = 1;
    }
    var map = cv(function (g) {
      g.fillStyle = tone(0); g.fillRect(0, 0, N, N);
      blots(g, 50, 40, 130, function (i) { return i % 3 ? tone(-0.05, 0.03) : tone(0.04, -0.03); }, 0.45);
      blots(g, 160, 3, 10, function () { return tone(-0.07, 0.04); }, 0.25);
      if (pattern === 'stripes') for (var k = 0; k < 9; k++) { g.fillStyle = tone(-0.2, 0.1); g.globalAlpha = 0.55; g.fillRect(0, k * N / 9, N, N / 30 + R() * N / 40); g.globalAlpha = 1; }
      if (pattern === 'spots') blots(g, 40, 10, 26, function () { return tone(-0.24, 0.12); }, 0.8);
      if (pattern === 'scales') { g.strokeStyle = tone(-0.18); g.globalAlpha = 0.5; for (var yy = 0; yy < N; yy += 16) for (var xx = (yy / 16 % 2) * 8; xx < N; xx += 16) { g.beginPath(); g.arc(xx, yy, 9, 0, Math.PI); g.stroke(); } g.globalAlpha = 1; }
      if (pattern === 'panels') { g.strokeStyle = tone(-0.25); g.lineWidth = 3; for (var q = 0; q < N; q += 64) { g.beginPath(); g.moveTo(q, 0); g.lineTo(q, N); g.moveTo(0, q + 20); g.lineTo(N, q + 20); g.stroke(); } }
    });
    var bump = cv(function (g) {
      g.fillStyle = '#808080'; g.fillRect(0, 0, N, N);
      blots(g, 1600, 1, 2.6, function (i) { return i % 2 ? '#5A5A5A' : '#A8A8A8'; }, 0.35);
      if (pattern === 'scales' || pattern === 'panels') { g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 2; for (var yy2 = 0; yy2 < N; yy2 += 16) for (var xx2 = (yy2 / 16 % 2) * 8; xx2 < N; xx2 += 16) { g.beginPath(); g.arc(xx2, yy2, 9, 0, Math.PI); g.stroke(); } }
    });
    // a roughness map that only varies the sheen a little: never a mirror
    var rough = cv(function (g) { g.fillStyle = '#E8E8E8'; g.fillRect(0, 0, N, N); blots(g, 80, 20, 70, function (i) { return i % 2 ? '#C8C8C8' : '#FFFFFF'; }, 0.5); });
    function tx(c, srgb) { var t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 2); t.anisotropy = 4; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; }
    return (TEX[key] = { map: tx(map, true), bump: tx(bump), rough: tx(rough) });
  }

  function make(THREE, o) {
    o = o || {};
    var plan = o.plan === 'beast' || o.plan === 'floater' ? o.plan : 'biped';
    var H = num(o.height, plan === 'beast' ? 1.1 : plan === 'floater' ? 1.6 : 2.2, 0.4, 8);
    var skinO = o.skin || {}, headO = o.head || {}, bodyO = o.body || {}, eyesO = headO.eyes || o.eyes || {};
    var color = skinO.color || o.color || '#5DBB46';
    var mats = [];
    function mat(params) { var m = new THREE.MeshPhysicalMaterial(params); m.userData.gmOwned = true; mats.push(m); return m; }
    var base = new THREE.Color(color), light = base.clone().lerp(new THREE.Color('#FFFFFF'), 0.35);
    var tex = skinTextures(THREE, color, skinO.pattern), metallic = num(skinO.metalness, 0, 0, 1);
    var skin = mat({ color: '#FFFFFF', map: tex.map, bumpMap: tex.bump, bumpScale: metallic > 0.5 ? 0.04 : 0.08, roughness: num(skinO.roughness, metallic > 0.5 ? 0.4 : 0.66, 0, 1), roughnessMap: tex.rough, metalness: metallic,
      sheen: num(skinO.sheen, 0.25, 0, 1), sheenColor: light, sheenRoughness: 0.6, clearcoat: num(skinO.gloss, 0.12, 0, 1), clearcoatRoughness: 0.55,
      iridescence: num(skinO.iridescence, 0, 0, 1), iridescenceIOR: 1.4 });
    polish(skin);
    var under = mat({ color: new THREE.Color(skinO.color2 || base.clone().lerp(new THREE.Color('#E8F0D0'), 0.3)), roughness: 0.55, sheen: 0.5, sheenColor: light });
    polish(under);
    var suit = o.suit ? mat({ color: new THREE.Color(o.suit.color || o.suit), roughness: num(o.suit.roughness, 0.4, 0, 1), metalness: num(o.suit.metalness, 0.35, 0, 1), clearcoat: 0.4 }) : null;
    if (suit) polish(suit);
    var glowCol = new THREE.Color(skinO.glow || eyesO.glow || o.glow || '#9CFF6A');
    // polish (the owner, 1 Oct): a rim of light round the silhouette so it reads
    // against any ground, a flash when it is hit, and it dissolves in when it
    // arrives and out when it is down, along a glowing edge
    var FX = { rim: { value: new THREE.Color(skinO.rim || light).multiplyScalar(num(skinO.rimStrength, 0.5, 0, 2)) }, flash: { value: 0 }, dis: { value: 0 }, edge: { value: glowCol.clone().multiplyScalar(3) } };
    function polish(m) {
      m.onBeforeCompile = function (sh) {
        sh.uniforms.uGmRim = FX.rim; sh.uniforms.uGmFlash = FX.flash; sh.uniforms.uGmDis = FX.dis; sh.uniforms.uGmEdge = FX.edge;
        sh.vertexShader = 'varying vec3 vGmPos;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vGmPos = position;');
        sh.fragmentShader = 'uniform vec3 uGmRim; uniform float uGmFlash; uniform float uGmDis; uniform vec3 uGmEdge; varying vec3 vGmPos;\n' +
          'float gmHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }\n' +
          'float gmNoise(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);\n' +
          '  return mix(mix(mix(gmHash(i), gmHash(i + vec3(1, 0, 0)), f.x), mix(gmHash(i + vec3(0, 1, 0)), gmHash(i + vec3(1, 1, 0)), f.x), f.y),\n' +
          '             mix(mix(gmHash(i + vec3(0, 0, 1)), gmHash(i + vec3(1, 0, 1)), f.x), mix(gmHash(i + vec3(0, 1, 1)), gmHash(i + vec3(1, 1, 1)), f.x), f.y), f.z); }\n' +
          sh.fragmentShader
            .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n  float gmN = gmNoise(vGmPos * 9.0); if (gmN > uGmDis) discard;')
            .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  float gmFr = pow(1.0 - clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0), 2.5);\n' +
              '  totalEmissiveRadiance += uGmRim * gmFr + vec3(uGmFlash * 0.4) + uGmEdge * step(uGmDis - 0.05, gmN) * step(uGmDis, 0.999);');
      };
      m.customProgramCacheKey = function () { return 'gm-creature-fx'; };
      return m;
    }
    var glow = new THREE.MeshBasicMaterial({ color: glowCol.clone().multiplyScalar(2.2), toneMapped: false }); glow.userData.gmOwned = true; mats.push(glow);
    var eyeMat = eyesO.glow ? glow : mat({ color: new THREE.Color(eyesO.color || '#050608'), roughness: 0.04, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.02 });
    var dark = mat({ color: new THREE.Color('#14100E'), roughness: 0.6 });

    var root = new THREE.Group(), rig = new THREE.Group(); root.add(rig);
    function part(geo, m, parent, x, y, z) { var p = new THREE.Mesh(geo, m); p.position.set(x || 0, y || 0, z || 0); (parent || rig).add(p); return p; }
    function joint(parent, x, y, z) { var j = new THREE.Group(); j.position.set(x || 0, y || 0, z || 0); parent.add(j); return j; }
    // a limb segment hanging down from its joint: tapered, rounded at both ends
    function seg(parent, len, r0, r1, m, bulge) {
      var pts = [], i, a;
      // a dome on top (r0), a gently bellied side, a dome at the bottom (r1)
      for (i = 0; i <= 6; i++) { a = i / 6 * Math.PI / 2; pts.push(new THREE.Vector2(Math.max(1e-4, r0 * Math.sin(a)), r0 * Math.cos(a))); }
      for (i = 1; i < 8; i++) { var u = i / 8, r = r0 + (r1 - r0) * u + Math.sin(u * Math.PI) * (bulge || 0.12) * (r0 + r1) * 0.5; pts.push(new THREE.Vector2(r, -u * len)); }
      for (i = 0; i <= 6; i++) { a = Math.PI / 2 + i / 6 * Math.PI / 2; pts.push(new THREE.Vector2(Math.max(1e-4, r1 * Math.sin(a)), -len + r1 * Math.cos(a))); }
      return part(new THREE.LatheGeometry(pts, 18), m || skin, parent);
    }
    function blob(parent, rx, ry, rz, m, x, y, z) { var b = part(new THREE.SphereGeometry(1, 28, 20), m || skin, parent, x, y, z); b.scale.set(rx, ry, rz); return b; }

    var build = num(bodyO.build, plan === 'beast' ? 0.6 : 0.25, 0, 1), arms = num(bodyO.arms, 1.15, 0, 2), legs = num(bodyO.legs, 1.1, 0.5, 2);
    var neckK = num(bodyO.neck, 1.3, 0, 3), headK = num(headO.size, plan === 'biped' ? 1.45 : 1, 0.4, 3), tail = num(bodyO.tail, plan === 'beast' ? 1 : 0, 0, 3);
    var fingers = Math.round(num(bodyO.fingers, 3, 0, 5)), eyeN = Math.round(num(eyesO.count, 2, 0, 8)), eyeK = num(eyesO.size, 1, 0.3, 3);
    var J = {}; // the joints the animation drives
    var headShape = headO.shape || (plan === 'beast' ? 'snout' : 'dome');

    // a head: its shape, its eyes, a mouth, and whatever grows on it
    function makeHead(parent, R) {
      var h = joint(parent, 0, 0, 0), g;
      if (headShape === 'dome') {
        // the classic big-skulled alien: a wide cranium over a small, pointed chin
        var pts = [];
        for (var i = 0; i <= 24; i++) {
          // top half a circle; the lower half drawn in to a narrow chin, smoothly
          var a = i / 24 * Math.PI, top = a <= Math.PI / 2, k = top ? 1 : 1 - 0.68 * smooth(Math.PI / 2, Math.PI, a);
          pts.push(new THREE.Vector2(Math.max(1e-4, Math.sin(a) * R * k), Math.cos(a) * R * (top ? 1 : 1.3) + R * 0.25));
        }
        g = new THREE.LatheGeometry(pts, 32); part(g, skin, h).scale.set(1, 1, 0.92);
        blob(h, R * 0.62, R * 0.14, R * 0.3, skin, 0, R * 0.42, R * 0.62);
        [-1, 1].forEach(function (sd) { blob(h, R * 0.035, R * 0.025, R * 0.02, dark, sd * R * 0.06, -R * 0.5, R * 0.52); });
      } else if (headShape === 'long') {
        g = new THREE.SphereGeometry(R, 24, 18); var lg = part(g, skin, h); lg.scale.set(0.85, 0.9, 1.6); lg.position.set(0, R * 0.2, -R * 0.55); lg.rotation.x = -0.35;
      } else if (headShape === 'visor') {
        g = new THREE.BoxGeometry(R * 1.7, R * 1.5, R * 1.7, 2, 2, 2); var bx = part(g, suit || skin, h); bx.position.y = R * 0.3;
        var vz = part(new THREE.BoxGeometry(R * 1.45, R * 0.4, R * 0.1), glow, h); vz.position.set(0, R * 0.42, R * 0.86); eyeN = 0;
      } else if (headShape === 'snout') {
        blob(h, R * 0.8, R * 0.72, R * 0.95, skin);
        var sn = seg(h, R * 1.6, R * 0.5, R * 0.3, skin, 0.05); sn.rotation.x = -Math.PI / 2; sn.position.set(0, -R * 0.12, R * 0.35);
        J.jaw = joint(h, 0, -R * 0.42, R * 0.3);
        var jw = seg(J.jaw, R * 1.35, R * 0.34, R * 0.2, skin, 0.05); jw.rotation.x = -Math.PI / 2;
        [-1, 1].forEach(function (sd) { var ear = part(new THREE.ConeGeometry(R * 0.22, R * 0.6, 10), skin, h); ear.position.set(sd * R * 0.45, R * 0.62, -R * 0.15); ear.rotation.z = sd * -0.35; ear.rotation.x = -0.4; });
      } else {
        part(new THREE.SphereGeometry(R, 24, 18), skin, h);
      }
      // the eyes: big black almonds by default, slanted, set wide on the face
      for (var e = 0; e < eyeN; e++) {
        var row = eyeN > 2 ? Math.floor(e / 2) : 0, side = e % 2 ? 1 : -1, cx = eyeN % 2 && e === eyeN - 1 ? 0 : side;
        var ew = R * 0.36 * eyeK * (eyeN > 2 ? 0.7 : 1), eye = part(new THREE.SphereGeometry(1, 18, 12), eyeMat, h);
        var round = eyesO.shape === 'round';
        eye.scale.set(ew, ew * (round ? 1 : 0.52), ew * 0.42);
        var ey = headShape === 'dome' ? R * 0.18 - row * R * 0.32 : R * 0.12 - row * R * 0.3;
        eye.position.set(cx * R * (headShape === 'dome' ? 0.38 : 0.42), ey, R * (headShape === 'snout' ? 0.78 : 0.8));
        if (!round) eye.rotation.z = cx * -0.42;
        eye.rotation.y = cx * 0.28;
      }
      if (headO.mouth !== false && headShape !== 'visor' && headShape !== 'snout') { var m = part(new THREE.BoxGeometry(R * 0.32, R * 0.025, R * 0.05), dark, h); m.position.set(0, headShape === 'dome' ? -R * 0.6 : -R * 0.45, R * (headShape === 'dome' ? 0.55 : 0.92)); }
      var ant = Math.round(num(headO.antennae, 0, 0, 6));
      for (var k = 0; k < ant; k++) {
        var aj = joint(h, (k - (ant - 1) / 2) * R * 0.45, R * 1.1, -R * 0.1); aj.rotation.z = (k - (ant - 1) / 2) * 0.35; aj.rotation.x = -0.2;
        var st = part(new THREE.CylinderGeometry(R * 0.03, R * 0.05, R * 1.1, 6), skin, aj); st.position.y = R * 0.55;
        part(new THREE.SphereGeometry(R * 0.12, 10, 8), glow, aj).position.y = R * 1.12;
        (J.antennae = J.antennae || []).push(aj);
      }
      var horns = Math.round(num(headO.horns, 0, 0, 4));
      for (var q = 0; q < horns; q++) {
        var hs = q % 2 ? 1 : -1, hn = part(new THREE.ConeGeometry(R * 0.16, R * 0.9, 10), under, h);
        hn.position.set(hs * R * (0.45 + Math.floor(q / 2) * 0.2), R * 0.85, -R * 0.1); hn.rotation.z = hs * -0.5; hn.rotation.x = -0.3;
      }
      return h;
    }
    function makeArm(parent, side, len, r) {
      var sh = joint(parent, 0, 0, 0), sm = suit && o.suit.sleeves !== false ? suit : skin;
      blob(sh, r * 1.45, r * 1.35, r * 1.3, sm, 0, -r * 0.2, 0);
      seg(sh, len * 0.5, r * 1.12, r * 0.78, sm, 0.18);
      var el = joint(sh, 0, -len * 0.5, 0);
      seg(el, len * 0.48, r * 0.86, r * 0.52, skin, 0.16);
      var hand = joint(el, 0, -len * 0.48, 0);
      blob(hand, r * 0.72, r * 0.95, r * 0.42, skin, 0, -r * 0.55, 0);
      // long fingers, two joints each, splayed
      for (var f = 0; f < fingers; f++) {
        var fj = joint(hand, (f - (fingers - 1) / 2) * r * 0.5, -r * 1.25, r * 0.12); fj.rotation.x = 0.2; fj.rotation.z = (f - (fingers - 1) / 2) * 0.2;
        seg(fj, len * 0.09, r * 0.24, r * 0.2);
        var f2 = joint(fj, 0, -len * 0.09, 0); f2.rotation.x = 0.35;
        seg(f2, len * 0.08, r * 0.2, r * 0.13);
      }
      return { sh: sh, el: el, hand: hand };
    }
    function makeLeg(parent, len, r, digi, toes) {
      var hip = joint(parent, 0, 0, 0), lm = suit || skin;
      seg(hip, len * 0.5, r * 1.3, r * 0.82, lm, 0.22);
      var kn = joint(hip, 0, -len * 0.5, 0);
      blob(kn, r * 0.85, r * 0.85, r * 0.85, lm);
      seg(kn, len * 0.47, r * 0.86, r * 0.52, lm, 0.18);
      var an = joint(kn, 0, -len * 0.47, 0);
      // a long, flat foot with toes, or a paw
      blob(an, r * 0.62, r * 0.42, r * (digi ? 1.0 : 1.2), skin, 0, -r * 0.1, r * 0.55);
      var tn = toes == null ? 3 : toes;
      for (var tq = 0; tq < tn; tq++) { var tj = joint(an, (tq - (tn - 1) / 2) * r * 0.45, -r * 0.25, r * 1.35); tj.rotation.x = -Math.PI / 2 + 0.15; tj.rotation.z = (tq - (tn - 1) / 2) * 0.25; seg(tj, r * 0.9, r * 0.24, r * 0.16); }
      return { hip: hip, kn: kn, an: an };
    }

    var timing = Object.assign({}, TIMING, o.timing || {}), height = H, radius;
    if (plan === 'biped') {
      // proportions from the height: a short torso on long legs, a long neck,
      // a head that is too big, arms that reach past the knee
      var legLen = H * 0.47 * legs / 1.1, torso = H * 0.27, neckL = H * 0.05 * neckK, R = H * 0.072 * headK;
      var limbR = H * (0.017 + build * 0.022), shW = H * (0.085 + build * 0.05), hipW = H * (0.05 + build * 0.03);
      var digi = !!bodyO.digitigrade;
      var hipsY = legLen;
      J.hips = joint(rig, 0, hipsY, 0);
      // the body from blended forms: a pelvis, a narrow waist, a ribcage that
      // widens to the shoulders, the neck rising out of a sloped trapezius
      J.spine = joint(J.hips, 0, 0, 0);
      var tm = suit || skin;
      // one smooth surface, turned from a spline: pelvis, waist, ribcage, shoulders
      var prof = new THREE.SplineCurve([
        new THREE.Vector2(0.001, -torso * 0.1), new THREE.Vector2(hipW * 0.9, -torso * 0.04), new THREE.Vector2(hipW * 1.12, torso * 0.1),
        new THREE.Vector2(hipW * 0.86, torso * 0.32), new THREE.Vector2(shW * 0.72, torso * 0.58), new THREE.Vector2(shW * 0.86, torso * 0.8),
        new THREE.Vector2(shW * 0.62, torso * 0.97), new THREE.Vector2(limbR * 1.6, torso * 1.06), new THREE.Vector2(0.001, torso * 1.08)]).getPoints(40);
      var trs = part(new THREE.LatheGeometry(prof, 32), tm, J.spine); trs.scale.set(1, 1, 0.6);
      J.neck = joint(J.spine, 0, torso * 0.9, 0);
      blob(J.neck, limbR * 2.4, limbR * 1.6, limbR * 1.8, skin, 0, limbR * 0.6, -limbR * 0.2);
      seg(J.neck, neckL + R * 0.3, limbR * 0.95, limbR * 1.45, skin, 0.05).rotation.x = Math.PI;
      J.head = makeHead(joint(J.neck, 0, neckL + R * 0.45, R * 0.05), R);
      J.armL = makeArm(joint(J.spine, shW * 0.88, torso * 0.84, -shW * 0.02), 1, H * 0.4 * arms, limbR);
      J.armR = makeArm(joint(J.spine, -shW * 0.88, torso * 0.84, -shW * 0.02), -1, H * 0.4 * arms, limbR);
      J.legL = makeLeg(joint(J.hips, hipW * 0.62, 0, 0), legLen, limbR * 1.25, digi);
      J.legR = makeLeg(joint(J.hips, -hipW * 0.62, 0, 0), legLen, limbR * 1.25, digi);
      if (tail > 0) { J.tail = []; var tj = joint(J.hips, 0, torso * 0.05, -hipW * 0.5); for (var s = 0; s < 5; s++) { tj.rotation.x = s ? 0.18 : -1.0; seg(tj, H * 0.1 * tail, limbR * (1.1 - s * 0.18), limbR * (0.92 - s * 0.18)); J.tail.push(tj); tj = joint(tj, 0, -H * 0.1 * tail, 0); } }
      J.legLen = legLen;
      radius = clamp(H * 0.15, 0.3, 1.2);
    } else if (plan === 'beast') {
      // a hunter on four legs; H is the height at the shoulder: a deep chest,
      // a tucked waist, heavy haunches, a long neck into a skull and a jaw
      var L = H * 1.5 * num(bodyO.length, 1, 0.5, 2), br = H * (0.2 + build * 0.12), lg = H * 0.6 * legs, r2 = H * (0.055 + build * 0.035);
      J.hips = joint(rig, 0, lg + br * 0.1, 0);
      J.spine = J.hips;
      var bm = suit || skin;
      blob(J.hips, br * 0.95, br * 1.1, L * 0.27, bm, 0, br * 0.02, L * 0.24);
      blob(J.hips, br * 0.74, br * 0.8, L * 0.3, bm, 0, br * 0.14, 0);
      blob(J.hips, br * 0.86, br * 0.9, L * 0.24, bm, 0, br * 0.16, -L * 0.26);
      blob(J.hips, br * 0.6, br * 0.55, L * 0.26, under, 0, -br * 0.38, L * 0.14);
      [-1, 1].forEach(function (sd) { blob(J.hips, br * 0.35, br * 0.7, br * 0.6, bm, sd * br * 0.62, 0, L * 0.3); blob(J.hips, br * 0.42, br * 0.8, br * 0.7, bm, sd * br * 0.58, 0.05 * br, -L * 0.32); });
      J.neck = joint(J.hips, 0, br * 0.55, L * 0.42); J.neck.rotation.x = -0.75 + (neckK - 1) * -0.2;
      seg(J.neck, H * 0.34 * neckK, br * 0.42, br * 0.62, bm, 0.1).rotation.x = Math.PI;
      J.head = makeHead(joint(J.neck, 0, H * 0.34 * neckK + br * 0.15, br * 0.05), H * 0.2 * headK);
      J.head.parent.rotation.x = 0.85;
      J.legs = [[1, 1], [-1, 1], [1, -1], [-1, -1]].map(function (p) { var lj = joint(J.hips, p[0] * br * 0.62, -br * 0.15, p[1] * L * 0.33); return makeLeg(lj, lg - br * 0.05, r2, true, 4); });
      if (tail > 0) { J.tail = []; var tj2 = joint(J.hips, 0, br * 0.35, -L * 0.45); for (var s2 = 0; s2 < 6; s2++) { tj2.rotation.x = s2 ? 0.12 : 2.1; seg(tj2, H * 0.17 * tail, br * (0.34 - s2 * 0.05), br * (0.29 - s2 * 0.045)); J.tail.push(tj2); tj2 = joint(tj2, 0, -H * 0.17 * tail, 0); } }
      radius = clamp(L * 0.3, 0.35, 1.6); height = lg + br + H * 0.3;
    } else {
      // a body that hovers, arms or tendrils trailing
      var BR = H * 0.24 * num(bodyO.build, 1, 0.3, 2);
      J.hips = joint(rig, 0, H * 0.62, 0); J.spine = J.hips;
      part(new THREE.SphereGeometry(BR, 28, 20), suit || skin, J.hips).scale.set(1, 1.15, 1);
      J.head = makeHead(joint(J.hips, 0, BR * 1.1, BR * 0.2), BR * 0.62 * headK);
      J.tendrils = [];
      var tn = Math.round(num(bodyO.tendrils, 6, 0, 12));
      for (var k2 = 0; k2 < tn; k2++) { var an2 = k2 / tn * Math.PI * 2, tj3 = joint(J.hips, Math.sin(an2) * BR * 0.6, -BR * 0.6, Math.cos(an2) * BR * 0.6); var chain = []; for (var s3 = 0; s3 < 4; s3++) { seg(tj3, H * 0.1, BR * (0.12 - s3 * 0.025), BR * (0.1 - s3 * 0.025)); chain.push(tj3); tj3 = joint(tj3, 0, -H * 0.1, 0); } J.tendrils.push({ a: an2, chain: chain }); }
      if (arms > 0.2) { J.armL = makeArm(joint(J.hips, BR * 0.85, BR * 0.3, 0), 1, H * 0.3 * arms, BR * 0.12); J.armR = makeArm(joint(J.hips, -BR * 0.85, BR * 0.3, 0), -1, H * 0.3 * arms, BR * 0.12); }
      radius = clamp(BR * 1.2, 0.3, 1.4);
    }
    // glowing spots down the back, if it has them
    var spots = Math.round(num(skinO.spots, 0, 0, 20));
    for (var sp = 0; sp < spots; sp++) { var dot = part(new THREE.SphereGeometry(H * 0.014, 8, 6), glow, J.spine); dot.position.set((sp % 2 ? 1 : -1) * H * 0.03, H * (0.05 + sp * 0.018), -H * 0.045); }
    var stride = plan === 'beast' ? H * 1.2 : plan === 'biped' ? (J.legLen || H * 0.5) * 1.5 : 1;

    // ---------------------------------------------------------------- motion --
    var ph = Math.random() * 6.28, act = null, actId = null, koT = 0, wasKo = false, breathe = Math.random() * 6.28, hover = Math.random() * 6.28, v = 0, fallSide = 1, age = 0;
    function setArm(A, sh, shz, el, hand) { if (!A) return; A.sh.rotation.x = sh; A.sh.rotation.z = shz; A.el.rotation.x = el; A.hand.rotation.x = hand || 0; }
    function animate(t, dt, s) {
      s = s || {}; var b = s.brawl || {}, speed = num(s.speed, 0, 0, 30);
      v = damp(v, speed, 8, dt);
      // a new move: what kind it is decides the shape of it
      var a = b.action;
      if (a && a.id !== actId) { actId = a.id; var kd = moveKind(a.name); act = { kind: kd, t: 0, d: (timing[kd] || TIMING.strike).duration / num(a.rate, 1, 0.3, 3), side: (a.id % 2) ? 1 : -1, name: String(a.name) }; if (kd === 'hit') FX.flash.value = 1; }
      age += dt; FX.flash.value = Math.max(0, FX.flash.value - dt * 5);
      // it materialises over its first 0.8 s, and dissolves 1.6 s after going down
      FX.dis.value = s.dissolve != null ? num(s.dissolve, 1, 0, 1) : b.ko ? 1 - smooth(1.6, 2.6, koT) : smooth(0, 0.8, age);
      if (act) { act.t += dt; if (act.t >= act.d) act = null; }
      var u = act ? act.t / act.d : 0, k = act ? act.kind : '';
      if (b.ko) { if (!wasKo) { koT = 0; fallSide = Math.random() < 0.5 ? 1 : -1; } koT += dt; } wasKo = !!b.ko;
      var fight = b.stance === 'fight' || b.stance === 'guard', run = clamp(v / 4, 0, 1.6);
      ph += dt * (v / Math.max(0.3, stride)) * Math.PI * 2 * (plan === 'beast' ? 0.8 : 1);
      breathe += dt * 1.6; hover += dt * 2.1;
      var sw = Math.sin(ph), cw = Math.cos(ph), amp = clamp(v / 3.5, 0, 1);
      // the blow: wind back, drive through at contact, recover
      var wind = act && (k === 'strike' || k === 'dash') ? bump(u, 0, 0.32, 0.55) : 0, drive = act && (k === 'strike' || k === 'dash') ? bump(u, 0.25, 0.45, 0.9) : 0;
      var cast = act && k === 'cast' ? bump(u, 0, 0.45, 1) : 0, hit = act && k === 'hit' ? bump(u, 0, 0.18, 1) : 0;

      rig.position.set(0, 0, 0); rig.rotation.set(0, 0, 0);
      if (plan === 'biped') {
        var lift = Math.abs(cw) * 0.05 * amp * H / 2.2;
        J.hips.position.y = (J.legLen || 1) * (fight ? 0.95 : 1) + lift - hit * 0.04;
        J.spine.rotation.x = (fight ? 0.12 : 0.04) + run * 0.18 + drive * 0.22 - wind * 0.1 - hit * 0.35 + Math.sin(breathe) * 0.015;
        J.spine.rotation.y = sw * 0.12 * amp + (act && k === 'strike' ? act.side * (drive * 0.45 - wind * 0.3) : 0);
        J.neck.rotation.x = -J.spine.rotation.x * 0.6 + hit * 0.4 - cast * 0.15;
        // legs: a stride, knees bending through it; braced when fighting
        var lA = sw * 0.55 * amp, kneeL = 0.15 + Math.max(0, -cw) * 0.9 * amp + (fight ? 0.2 : 0), kneeR = 0.15 + Math.max(0, cw) * 0.9 * amp + (fight ? 0.2 : 0);
        J.legL.hip.rotation.x = -lA - (fight ? 0.15 : 0); J.legL.kn.rotation.x = kneeL; J.legL.an.rotation.x = -kneeL * 0.5 + lA * 0.3;
        J.legR.hip.rotation.x = lA - (fight ? 0.15 : 0); J.legR.kn.rotation.x = kneeR; J.legR.an.rotation.x = -kneeR * 0.5 - lA * 0.3;
        J.legL.hip.rotation.z = fight ? 0.1 : 0.03; J.legR.hip.rotation.z = fight ? -0.1 : -0.03;
        // arms: swinging opposite the legs, or up and clawed in a fight
        var guardSh = fight ? -0.9 : 0, guardEl = fight ? -1.3 : -0.2;
        var aL = -sw * 0.5 * amp, aR = sw * 0.5 * amp;
        var sL = act && k === 'strike' && act.side > 0, sR = act && k === 'strike' && act.side < 0;
        setArm(J.armL, aL + guardSh + (sL ? wind * 0.9 - drive * 1.9 : 0) - cast * 1.4 + hit * 0.6, 0.12 + (fight ? 0.25 : 0) + (sL ? drive * 0.5 : 0), guardEl + (sL ? -wind * 0.6 + drive * 1.0 : 0) + cast * 0.9, 0);
        setArm(J.armR, aR + guardSh + (sR ? wind * 0.9 - drive * 1.9 : 0) - cast * 1.4 + hit * 0.6, -0.12 - (fight ? 0.25 : 0) - (sR ? drive * 0.5 : 0), guardEl + (sR ? -wind * 0.6 + drive * 1.0 : 0) + cast * 0.9, 0);
        if (act && k === 'dash') { rig.position.z = drive * 0.4; J.spine.rotation.x += drive * 0.25; }
      } else if (plan === 'beast') {
        J.hips.position.y = (J.legs[0].hip.parent.position.y < 0 ? 0 : 0) + (J.hips.userData.y0 || (J.hips.userData.y0 = J.hips.position.y)) + Math.abs(sw) * 0.04 * amp - wind * 0.12;
        J.hips.rotation.x = drive * -0.15 + wind * 0.12 + Math.sin(ph * 2) * 0.03 * amp;
        J.legs.forEach(function (L2, i) { var p = (i === 0 || i === 3) ? sw : -sw, c = (i === 0 || i === 3) ? cw : -cw; L2.hip.rotation.x = p * 0.6 * amp - wind * 0.3 * (i < 2 ? 1 : -1); L2.kn.rotation.x = (i < 2 ? -1 : 1) * (0.25 + Math.max(0, c) * 0.7 * amp); L2.an.rotation.x = -L2.kn.rotation.x * 0.6; });
        J.neck.rotation.x = -0.6 + drive * 0.45 - wind * 0.25 + hit * -0.4 + cast * 0.2;
        if (J.jaw) J.jaw.rotation.x = drive * 0.7 + cast * 0.8 + Math.max(0, Math.sin(breathe * 2)) * 0.05;
        if (act && k === 'dash') rig.position.z = drive * 0.6;
      } else {
        J.hips.position.y = (J.hips.userData.y0 || (J.hips.userData.y0 = J.hips.position.y)) + Math.sin(hover) * 0.12 * H / 1.6 - hit * 0.1;
        J.hips.rotation.x = clamp(v / 10, 0, 0.4) + drive * 0.3 - wind * 0.15 - hit * 0.4;
        J.hips.rotation.z = Math.sin(hover * 0.7) * 0.06;
        J.tendrils.forEach(function (td, i) { td.chain.forEach(function (c, j) { c.rotation.x = Math.sin(hover * 1.3 + i + j * 0.8) * 0.25 + (j ? 0 : clamp(v / 8, 0, 0.6)); c.rotation.z = Math.cos(hover + i * 1.7 + j) * 0.2; }); });
        if (J.armL) { setArm(J.armL, -0.3 - (act && act.side > 0 ? drive * 1.6 : 0) - cast * 1.3, 0.4, -0.6, 0); setArm(J.armR, -0.3 - (act && act.side < 0 ? drive * 1.6 : 0) - cast * 1.3, -0.4, -0.6, 0); }
        if (act && (k === 'dash' || k === 'strike')) rig.position.z = drive * 0.5;
      }
      if (J.tail) J.tail.forEach(function (tj, i) { tj.rotation.y = Math.sin(ph * 0.5 + breathe * 0.5 - i * 0.6) * 0.18 * (0.4 + amp); });
      if (J.antennae) J.antennae.forEach(function (aj, i) { aj.rotation.x = -0.2 + Math.sin(breathe * 1.7 + i) * 0.12 + amp * 0.2; });
      if (J.head && plan !== 'beast') J.head.rotation.y = Math.sin(breathe * 0.37) * 0.15 * (1 - amp);
      // the glow swells as it casts
      glow.color.copy(glowCol).multiplyScalar(2.2 + cast * 4);
      // down: it crumples and falls, and stays down
      if (b.ko) {
        var f = smooth(0, 0.55, koT);
        if (plan === 'floater') { rig.position.y = -J.hips.position.y * 0.85 * f; rig.rotation.z = fallSide * f * 1.2; }
        else { rig.rotation.x = -f * 1.35; rig.rotation.z = fallSide * f * 0.25; rig.position.y = f * (plan === 'beast' ? 0.1 : -0.05) * H; rig.position.z = -f * H * 0.18; }
        if (J.armL) { J.armL.sh.rotation.x = -f * 2.2; J.armR.sh.rotation.x = -f * 2.0; }
      }
    }
    return {
      object: root, animate: animate, height: height, radius: radius, timing: timing, creature: plan,
      // where a shot leaves it: in front of the chest, or the mouth of a beast
      muzzle: function () { return { y: plan === 'beast' ? height * 0.8 : height * 0.68, forward: plan === 'beast' ? radius * 1.6 : radius * 1.4 }; },
    };
  }
  return { make: make, timing: TIMING, kindOf: moveKind };
})();
