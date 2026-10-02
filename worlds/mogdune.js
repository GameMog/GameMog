// MogDune: an official open world (the owner, 1 Oct 2026: "a game that makes
// everyone go wild ... a classic Dune environment ... super detailed,
// hyperrealistic, no GM coins, a staff as a sword, the goal is just exploring
// and taking down super interesting human and alien enemies, harder and more
// aggressive with time ... cinematic and real"). The owner chose Dune's own
// names; the hero is a plush in a stillsuit, a burlap hood and a tattered
// cloak, built from the owner's reference and named Muse (the owner, 2 Oct). The deep desert of Arrakis under a long eclipse: dunes, the Shield
// Wall's rock, a sietch, the wrecks of a spice harvester and an ornithopter,
// the bones of an old worm, a thumper; Harkonnen troopers, sandtrout and
// stalkers from the deep sand, Sardaukar, and at every third heat a boss:
// Shai-Hulud, the Beast, a spice wraith. No GM: the run is survival.
(function () {
  var PI = Math.PI, TAU = PI * 2;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function smooth(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
  function damp(a, b, k, dt) { return a + (b - a) * (1 - Math.exp(-k * dt)); }
  function pick(list, i) { return list[i % list.length]; }

  /* ------------------------------------------------------- the dunes -- */
  // One height function for the ground the runtime walks on (open.ground)
  // and the mesh that is drawn, so feet meet sand. Dunes run north to south
  // with gentle windward backs and steep slip faces to the east, a long
  // draa under them, and ripples; the landmarks stand on flats.
  // the crest is a knife edge: the windward back climbs to it still rising, the slip face falls away steeply
  function crest(u) { u -= Math.floor(u); if (u < 0.72) { var w = u / 0.72; return w * w * (1.6 - 0.6 * w); } var sl = (u - 0.72) / 0.28; return Math.pow(1 - sl, 1.6); }
  function dunes(x, z) {
    var a = crest(x * 0.021 + Math.sin(z * 0.017) * 0.9 + Math.sin(z * 0.0061 + 1.7) * 1.4) * (5 + 2.4 * Math.sin(z * 0.009 + x * 0.004));
    var b = crest(x * 0.0085 - z * 0.006 + Math.sin(z * 0.011) * 0.5) * 8;
    return a + b + Math.sin(x * 0.07 + z * 0.05) * 0.3 + Math.sin(z * 0.09 - x * 0.03) * 0.22;
  }
  // the flats: [x, z, radius, falloff]; their height is the dune's at the centre
  var FLATS = [[0, 34, 9, 16], [-40, -112, 24, 22], [92, -36, 18, 20], [-84, 18, 12, 16], [58, 92, 16, 18], [-16, -54, 14, 18], [40, -88, 12, 16], [-112, -58, 12, 14], [118, 46, 12, 14], [-46, 118, 12, 14]];
  FLATS.forEach(function (f) { f.push(dunes(f[0], f[1])); });
  function H(x, z) {
    var h = dunes(x, z);
    for (var i = 0; i < FLATS.length; i++) {
      var f = FLATS[i], dx = x - f[0], dz = z - f[1], d2 = dx * dx + dz * dz, R = f[2] + f[3];
      if (d2 < R * R) { var k = smooth((Math.sqrt(d2) - f[2]) / f[3]); h = h * k + f[4] * (1 - k); }
    }
    return h;
  }
  var B = 170;   // the walkable desert: x and z from -B to B

  /* ---------------------------------------------------- the textures -- */
  function noiseCanvas(g, w, h, n, a0, a1, light, dark) {
    for (var i = 0; i < n; i++) { g.fillStyle = (Math.random() < 0.5 ? light : dark) + (a0 + Math.random() * (a1 - a0)) + ')'; var s = 1 + Math.random() * 2.5; g.fillRect(Math.random() * w, Math.random() * h, s, s); }
  }
  var TEX = null;
  function textures(ctx) {
    if (TEX) return TEX;
    var T = ctx.textures;
    TEX = {
      // felt: a fine fuzz, a little uneven
      feltN: T.normal(256, 256, function (g, w, h) { g.fillStyle = '#808080'; g.fillRect(0, 0, w, h); noiseCanvas(g, w, h, 9000, 0.1, 0.35, 'rgba(255,255,255,', 'rgba(0,0,0,'); for (var i = 0; i < 900; i++) { g.strokeStyle = 'rgba(' + (Math.random() < 0.5 ? '255,255,255,' : '0,0,0,') + (0.15 + Math.random() * 0.2) + ')'; g.beginPath(); var x = Math.random() * w, y = Math.random() * h, a = Math.random() * TAU; g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 6, y + Math.sin(a) * 6); g.stroke(); } }, 0.9),
      // felt: cream fibres, a little dust worked into it
      felt: T.canvas(256, 256, function (g, w, h) { g.fillStyle = '#EFDCC0'; g.fillRect(0, 0, w, h); for (var i = 0; i < 2600; i++) { g.strokeStyle = 'rgba(' + (Math.random() < 0.6 ? '255,248,232,' : '176,140,100,') + (0.08 + Math.random() * 0.18) + ')'; g.beginPath(); var x = Math.random() * w, y = Math.random() * h, a = Math.random() * TAU; g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 5, y + Math.sin(a) * 5); g.stroke(); } noiseCanvas(g, w, h, 1200, 0.04, 0.12, 'rgba(160,110,60,', 'rgba(120,80,40,'); }),
      // burlap: a coarse open weave, slubbed
      burlap: T.canvas(512, 512, function (g, w, h) {
        g.fillStyle = '#7A5B3C'; g.fillRect(0, 0, w, h);
        for (var y = 0; y < h; y += 6) { g.fillStyle = 'rgba(40,26,14,' + (0.25 + Math.random() * 0.2) + ')'; g.fillRect(0, y, w, 2); }
        for (var x = 0; x < w; x += 6) { g.fillStyle = 'rgba(160,124,84,' + (0.18 + Math.random() * 0.2) + ')'; g.fillRect(x, 0, 2, h); }
        noiseCanvas(g, w, h, 5000, 0.05, 0.2, 'rgba(210,170,120,', 'rgba(30,18,8,');
        var gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,220,170,0.08)'); gr.addColorStop(1, 'rgba(120,70,30,0.2)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      }),
      burlapN: T.normal(256, 256, function (g, w, h) {
        g.fillStyle = '#808080'; g.fillRect(0, 0, w, h);
        for (var y = 0; y < h; y += 4) { g.fillStyle = 'rgba(255,255,255,' + (0.3 + Math.random() * 0.3) + ')'; g.fillRect(0, y, w, 2); }
        for (var x = 0; x < w; x += 4) { g.fillStyle = 'rgba(0,0,0,' + (0.2 + Math.random() * 0.3) + ')'; g.fillRect(x, 0, 1, h); }
      }, 1.4),
      // the stillsuit: quilted panels, ribbed across the chest, sand in every seam
      suit: T.canvas(512, 512, function (g, w, h) {
        g.fillStyle = '#8E6E4C'; g.fillRect(0, 0, w, h);
        for (var y = 0; y < h; y += 32) { g.fillStyle = 'rgba(44,30,18,0.5)'; g.fillRect(0, y, w, 3); g.fillStyle = 'rgba(200,160,110,0.25)'; g.fillRect(0, y + 3, w, 2); }
        for (var x = 0; x < w; x += 64) { g.fillStyle = 'rgba(44,30,18,0.4)'; g.fillRect(x, 0, 3, h); }
        noiseCanvas(g, w, h, 7000, 0.05, 0.22, 'rgba(214,176,124,', 'rgba(40,26,14,');
      }),
      suitN: T.normal(256, 256, function (g, w, h) {
        g.fillStyle = '#9A9A9A'; g.fillRect(0, 0, w, h);
        for (var y = 0; y < h; y += 16) { var gr = g.createLinearGradient(0, y, 0, y + 16); gr.addColorStop(0, '#303030'); gr.addColorStop(0.2, '#C0C0C0'); gr.addColorStop(0.8, '#A0A0A0'); gr.addColorStop(1, '#303030'); g.fillStyle = gr; g.fillRect(0, y, w, 16); }
        for (var x = 0; x < w; x += 32) { g.fillStyle = '#404040'; g.fillRect(x, 0, 2, h); }
      }, 1.1),
      // a knitted scarf
      knit: T.canvas(256, 256, function (g, w, h) {
        g.fillStyle = '#8A6A47'; g.fillRect(0, 0, w, h);
        for (var y = 0; y < h; y += 8) for (var x = 0; x < w; x += 8) { g.fillStyle = 'rgba(' + ((x / 8 + y / 8) % 2 ? '50,34,20,0.35' : '210,170,120,0.25') + ')'; g.beginPath(); g.ellipse(x + 4, y + 4, 3, 4.5, 0.5, 0, TAU); g.fill(); }
        noiseCanvas(g, w, h, 2500, 0.05, 0.2, 'rgba(220,180,130,', 'rgba(30,18,8,');
      }),
      knitN: T.normal(128, 128, function (g, w, h) { g.fillStyle = '#404040'; g.fillRect(0, 0, w, h); for (var y = 0; y < h; y += 8) for (var x = 0; x < w; x += 8) { g.fillStyle = '#E0E0E0'; g.beginPath(); g.ellipse(x + 4, y + 4, 3, 4, 0.5, 0, TAU); g.fill(); } }, 1.6),
      // a tattered cloak: worn cloth, frayed and torn at the hem (alpha)
      cloak: T.canvas(256, 512, function (g, w, h) {
        g.fillStyle = '#6E5236'; g.fillRect(0, 0, w, h);
        noiseCanvas(g, w, h, 6000, 0.05, 0.2, 'rgba(190,150,100,', 'rgba(30,18,8,');
        for (var i = 0; i < 40; i++) { g.fillStyle = 'rgba(30,18,8,0.15)'; g.fillRect(Math.random() * w, 0, 1 + Math.random() * 3, h); }
        var gr = g.createLinearGradient(0, h * 0.5, 0, h); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(176,120,64,0.55)'); g.fillStyle = gr; g.fillRect(0, h * 0.5, w, h * 0.5);
        g.globalCompositeOperation = 'destination-out';
        for (var x = 0; x < w; x += 2 + Math.random() * 5) { var len = 8 + Math.pow(Math.random(), 2) * 150; g.fillRect(x, h - len, 1 + Math.random() * 2.5, len); }
        for (var k = 0; k < 14; k++) { g.beginPath(); g.ellipse(Math.random() * w, h * (0.45 + Math.random() * 0.45), 2 + Math.random() * 6, 3 + Math.random() * 10, Math.random(), 0, TAU); g.fill(); }
        g.globalCompositeOperation = 'source-over';
      }),
      leather: T.canvas(256, 256, function (g, w, h) { g.fillStyle = '#4E3A28'; g.fillRect(0, 0, w, h); noiseCanvas(g, w, h, 4000, 0.05, 0.25, 'rgba(150,110,70,', 'rgba(15,8,4,'); for (var y = 0; y < h; y += 22) { g.fillStyle = 'rgba(20,12,6,0.5)'; g.fillRect(0, y, w, 4); } }),
      wood: T.canvas(64, 512, function (g, w, h) { g.fillStyle = '#5E4329'; g.fillRect(0, 0, w, h); for (var i = 0; i < 90; i++) { g.fillStyle = 'rgba(' + (Math.random() < 0.5 ? '28,18,10,' : '140,104,64,') + (0.08 + Math.random() * 0.16) + ')'; g.fillRect(Math.random() * w, 0, 1 + Math.random() * 2, h); } }),
    };
    TEX.cloak.wrapS = TEX.cloak.wrapT = ctx.THREE.ClampToEdgeWrapping;
    return TEX;
  }

  /* ------------------------------------------------------------ Muse -- */
  // The hero, Muse (the owner, 2 Oct: the name, and this reference): a plush
  // about 1.3 m tall in a desert outfit. A wide soft head in short cream
  // pile, bead eyes set wide, a stitched mouth, pink cheeks, a black ribbed
  // catchtube from the cheek down into the scarf; a cream fleece lining
  // framing the face inside a coarse burlap hood; a chunky burlap scarf; a
  // charcoal stillsuit, tooled in panels, a vent grille on the chest, a strap
  // across it, a buckled belt with pouches, knee pads, chunky wrapped boots;
  // cream mitten paws; a cloak torn to rags that the wind streams sideways;
  // and his staff. Animated as a plush moves: a waddle with squash and
  // stretch, breathing and looking about when still, swings with a wind-up,
  // a follow-through and a trail, a squash when he lands, a bouncy fall.
  // Forward is +z, the feet at y = 0; the runtime's state drives it.
  function muse(ctx) {
    var THREE = ctx.THREE, X = textures(ctx);
    function rep(t, a, b) { var c = t.clone(); c.wrapS = c.wrapT = THREE.RepeatWrapping; c.repeat.set(a, b); c.needsUpdate = true; return c; }
    function V3(x, y, z) { return new THREE.Vector3(x, y, z); }
    var T = ctx.textures;
    // the plush's own maps: short pile (alpha, for the shells), tooled suit, holey burlap
    var pile = T.canvas(256, 256, function (g, w, h) { g.fillStyle = '#000'; g.fillRect(0, 0, w, h); for (var i = 0; i < 9000; i++) { var v = 120 + Math.random() * 135; g.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')'; g.fillRect(Math.random() * w, Math.random() * h, 1.4, 1.4); } }, { linear: true });
    var tooled = T.canvas(512, 512, function (g, w, h) {
      g.fillStyle = '#5E554A'; g.fillRect(0, 0, w, h);
      noiseCanvas(g, w, h, 9000, 0.05, 0.18, 'rgba(160,146,124,', 'rgba(20,16,12,');
      // panels, seams with stitching, and a tooled scroll inside each panel
      g.lineWidth = 3;
      for (var py = 0; py < h; py += 96) for (var px = 0; px < w; px += 128) {
        var ox = px + ((py / 96) % 2) * 64;
        g.strokeStyle = 'rgba(24,20,16,0.7)'; g.strokeRect(ox + 4, py + 4, 120, 88);
        g.strokeStyle = 'rgba(150,136,114,0.35)'; g.strokeRect(ox + 7, py + 7, 114, 82);
        g.setLineDash([4, 5]); g.strokeStyle = 'rgba(200,184,150,0.35)'; g.lineWidth = 1.2; g.strokeRect(ox + 12, py + 12, 104, 72); g.setLineDash([]); g.lineWidth = 3;
        g.strokeStyle = 'rgba(30,24,18,0.55)'; g.beginPath(); g.moveTo(ox + 22, py + 60); g.bezierCurveTo(ox + 40, py + 20, ox + 70, py + 80, ox + 100, py + 34); g.stroke();
        g.beginPath(); g.arc(ox + 64, py + 46, 10, 0, TAU); g.stroke();
      }
      // dust in the creases
      var gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(200,170,120,0.05)'); gr.addColorStop(1, 'rgba(200,160,110,0.22)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    });
    var tooledN = T.normal(256, 256, function (g, w, h) {
      g.fillStyle = '#9A9A9A'; g.fillRect(0, 0, w, h); g.lineWidth = 2;
      for (var py = 0; py < h; py += 48) for (var px = 0; px < w; px += 64) {
        var ox = px + ((py / 48) % 2) * 32;
        g.strokeStyle = '#303030'; g.strokeRect(ox + 2, py + 2, 60, 44);
        g.strokeStyle = '#E0E0E0'; g.strokeRect(ox + 4, py + 4, 56, 40);
        g.strokeStyle = '#505050'; g.beginPath(); g.moveTo(ox + 11, py + 30); g.bezierCurveTo(ox + 20, py + 10, ox + 35, py + 40, ox + 50, py + 17); g.stroke(); g.beginPath(); g.arc(ox + 32, py + 23, 5, 0, TAU); g.stroke();
      }
    }, 1.6);
    var holey = T.canvas(256, 256, function (g, w, h) {
      g.fillStyle = '#9A7652'; g.fillRect(0, 0, w, h);
      for (var y = 0; y < h; y += 5) { g.fillStyle = 'rgba(46,30,16,' + (0.3 + Math.random() * 0.2) + ')'; g.fillRect(0, y, w, 2); }
      for (var x = 0; x < w; x += 5) { g.fillStyle = 'rgba(176,138,96,' + (0.2 + Math.random() * 0.2) + ')'; g.fillRect(x, 0, 2, h); }
      noiseCanvas(g, w, h, 4000, 0.05, 0.2, 'rgba(214,178,130,', 'rgba(30,18,8,');
      g.globalCompositeOperation = 'destination-out';
      for (var k = 0; k < 120; k++) { g.beginPath(); g.ellipse(Math.random() * w, Math.random() * h, 1 + Math.random() * 2.5, 1 + Math.random() * 2, Math.random(), 0, TAU); g.fill(); }
      g.globalCompositeOperation = 'source-over';
    });
    var rags = T.canvas(256, 512, function (g, w, h) {
      g.drawImage(holey.image, 0, 0, w, h / 2); g.drawImage(holey.image, 0, h / 2, w, h / 2);
      var gr = g.createLinearGradient(0, h * 0.4, 0, h); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(190,140,84,0.45)'); g.fillStyle = gr; g.fillRect(0, h * 0.4, w, h * 0.6);
      g.globalCompositeOperation = 'destination-out';
      // torn into strips at the hem and frayed at the sides; big holes worn through
      for (var x = 0; x < w; x += 2 + Math.random() * 3) { var len = 30 + Math.pow(Math.random(), 1.3) * 300; g.fillRect(x, h - len, 0.8 + Math.random() * 2.6, len); }
      // big jagged tears between the tongues of cloth
      for (var tx = Math.random() * 12; tx < w; tx += 14 + Math.random() * 18) { var tw = 5 + Math.random() * 12, th = 70 + Math.random() * 230; g.beginPath(); g.moveTo(tx - tw / 2, h + 2); g.lineTo(tx + (Math.random() - 0.5) * 8, h - th); g.lineTo(tx + tw / 2, h + 2); g.closePath(); g.fill(); }
      for (var y = h * 0.25; y < h; y += 3 + Math.random() * 6) { var l2 = 4 + Math.random() * 26 * (y / h); g.fillRect(0, y, l2, 1.5); g.fillRect(w - l2, y, l2, 1.5); }
      for (var k = 0; k < 90; k++) { g.beginPath(); g.ellipse(Math.random() * w, h * (0.2 + Math.random() * 0.7), 3 + Math.random() * 11, 4 + Math.random() * 20, Math.random(), 0, TAU); g.fill(); }
      g.globalCompositeOperation = 'source-over';
    });
    rags.wrapS = rags.wrapT = THREE.ClampToEdgeWrapping;

    var cream = '#EFE3CF';
    function plushMat(alpha) { return new THREE.MeshStandardMaterial({ color: cream, map: rep(X.felt, 2, 2), normalMap: rep(X.feltN, 3, 3), normalScale: new THREE.Vector2(0.5, 0.5), roughness: 1, alphaMap: alpha ? rep(pile, 6, 6) : null, alphaTest: alpha || 0 }); }
    var plush = plushMat(0);
    var burlap = new THREE.MeshStandardMaterial({ color: '#FFEBD2', map: rep(holey, 3, 3), normalMap: rep(X.burlapN, 6, 6), normalScale: new THREE.Vector2(2, 2), roughness: 1, side: THREE.DoubleSide, alphaTest: 0.4 });
    var scarfM = new THREE.MeshStandardMaterial({ color: '#F2DCC0', map: rep(holey, 4, 2), normalMap: rep(X.burlapN, 8, 4), normalScale: new THREE.Vector2(2.2, 2.2), roughness: 1, side: THREE.DoubleSide });
    var suit = new THREE.MeshStandardMaterial({ map: rep(tooled, 1, 1), normalMap: rep(tooledN, 1, 1), normalScale: new THREE.Vector2(1.1, 1.1), roughness: 0.9 });
    var leather = new THREE.MeshStandardMaterial({ map: rep(X.leather, 1, 1), color: '#A88A6A', roughness: 0.85 });
    var dark = new THREE.MeshStandardMaterial({ color: '#2A2622', roughness: 0.7, metalness: 0.3 });
    var brass = new THREE.MeshStandardMaterial({ color: '#7A6648', roughness: 0.45, metalness: 0.8 });
    var bead = new THREE.MeshPhysicalMaterial({ color: '#070605', roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.03 });
    var stitch = new THREE.MeshStandardMaterial({ color: '#2A1E16', roughness: 0.9 });
    var rubber = new THREE.MeshPhysicalMaterial({ color: '#1A1816', roughness: 0.35, clearcoat: 0.6 });

    var root = new THREE.Group(), body = new THREE.Group(), hips = new THREE.Group(), spine = new THREE.Group(), neck = new THREE.Group(), headG = new THREE.Group();
    root.add(body); body.add(hips); hips.position.y = 0.34; hips.add(spine);
    function add(parent, geo, mat, x, y, z) { var m = new THREE.Mesh(geo, mat); m.position.set(x || 0, y || 0, z || 0); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; }
    // short pile: a few shells of the same shape, each a hair bigger and sparser
    function pileOn(parent, geo, x, y, z, n, step) { for (var k = 1; k <= n; k++) { var s = 1 + step * k, m = new THREE.Mesh(geo, plushMat(0.35 + 0.55 * k / n)); m.material.color.multiplyScalar(1 + 0.05 * k / n); m.material.normalMap = null; m.scale.setScalar(s); m.position.set(x || 0, y || 0, z || 0); parent.add(m); } }
    function folds(geo, amp, f) { var p = geo.attributes.position, v = V3(); for (var i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); var n = Math.sin(v.x * f + v.y * f * 0.7) * Math.sin(v.z * f * 1.3 - v.y * f * 0.4); v.multiplyScalar(1 + n * amp); p.setXYZ(i, v.x, v.y, v.z); } geo.computeVertexNormals(); return geo; }

    // the stillsuit: stout, tooled in panels
    var torsoG = new THREE.CapsuleGeometry(0.19, 0.2, 10, 24); torsoG.scale(1.12, 1, 0.88);
    add(spine, torsoG, suit, 0, 0.2, 0);
    // the chest vent: a grille of slots
    var vent = new THREE.Group(); vent.position.set(0, 0.29, 0.162); vent.rotation.x = -0.12; spine.add(vent);
    add(vent, new THREE.BoxGeometry(0.11, 0.075, 0.02), dark, 0, 0, 0);
    for (var vs = 0; vs < 5; vs++) add(vent, new THREE.BoxGeometry(0.085, 0.006, 0.012), brass, 0, -0.028 + vs * 0.014, 0.01);
    // a strap from the right shoulder across to the left hip, a square buckle on it
    var strapC = new THREE.CatmullRomCurve3([V3(-0.16, 0.34, 0.11), V3(-0.06, 0.22, 0.175), V3(0.07, 0.1, 0.17), V3(0.17, 0.02, 0.11)]);
    add(spine, new THREE.TubeGeometry(strapC, 24, 0.016, 6, false), leather, 0, 0, 0).scale.set(1, 1, 1.02);
    add(spine, new THREE.BoxGeometry(0.04, 0.04, 0.012), brass, -0.02, 0.17, 0.178).rotation.z = 0.7;
    // the belt, its buckle and pouches
    var beltG = new THREE.TorusGeometry(0.205, 0.024, 8, 36); beltG.rotateX(PI / 2); beltG.scale(1.1, 1, 0.9);
    add(spine, beltG, leather, 0, 0.04, 0);
    add(spine, new THREE.BoxGeometry(0.06, 0.05, 0.02), brass, 0.02, 0.04, 0.188);
    [[-0.17, 0.5], [0.2, -0.6], [0.05, 2.6]].forEach(function (pp) { var pz = add(spine, new THREE.BoxGeometry(0.075, 0.08, 0.05), leather, Math.sin(pp[1]) * 0.21, 0.0, Math.cos(pp[1]) * 0.17); pz.rotation.y = pp[1]; void pp[0]; });

    // the scarf: a chunky wrap of burlap, folded, an end hanging down the chest
    var scarf = new THREE.Group(); scarf.position.y = 0.39; spine.add(scarf);
    for (var c = 0; c < 3; c++) { var coil = new THREE.TorusGeometry(0.15 + c * 0.012, 0.062 - c * 0.008, 12, 34); coil.rotateX(PI / 2 + 0.22 - c * 0.14); coil.scale(1.15, 1, 1.02); folds(coil, 0.09, 26); add(scarf, coil, scarfM, 0, -c * 0.045 + 0.02, 0); }
    var drape = new THREE.PlaneGeometry(0.16, 0.26, 4, 8), dp = drape.attributes.position;
    for (var di = 0; di < dp.count; di++) { var dy = dp.getY(di); dp.setZ(di, Math.sin(dp.getX(di) * 30) * 0.012 + (0.13 - dy) * 0.12); }
    drape.computeVertexNormals(); var drapeM = add(scarf, drape, burlap, -0.06, -0.15, 0.17); drapeM.rotation.z = -0.15;

    // the head: wide and soft, in short cream pile
    neck.position.y = 0.42; spine.add(neck); neck.add(headG); headG.position.y = 0.2;
    var HA = 0.235, HB = 0.2, HC = 0.19, HE = 0.76;
    function headZ(x, y) { var t = 1 - Math.pow(Math.abs(x / HA), 2 / HE) - Math.pow(Math.abs(y / HB), 2 / HE); return t <= 0 ? 0 : HC * Math.pow(t, HE / 2); }
    var hg = new THREE.SphereGeometry(1, 44, 32), hp = hg.attributes.position, v = V3();
    for (var i = 0; i < hp.count; i++) {
      v.fromBufferAttribute(hp, i);
      var f = Math.pow(Math.pow(Math.abs(v.x), 2 / HE) + Math.pow(Math.abs(v.y), 2 / HE) + Math.pow(Math.abs(v.z), 2 / HE), HE / 2);
      v.divideScalar(f || 1); hp.setXYZ(i, v.x * HA, v.y * HB, v.z * HC);
    }
    hg.computeVertexNormals();
    add(headG, hg, plush, 0, 0, 0); pileOn(headG, hg, 0, 0, 0, 4, 0.0045);
    // bead eyes set wide, a stitched mouth, pink cheeks
    var front = 0.085;
    [-1, 1].forEach(function (sd) { var ex = sd * 0.085, ey = 0.02; add(headG, new THREE.SphereGeometry(0.021, 18, 12), bead, ex, ey, headZ(ex, ey) + 0.004); });
    add(headG, new THREE.BoxGeometry(0.045, 0.006, 0.006), stitch, 0, -0.045, headZ(0, -0.045) + 0.006);
    var blushT = T.canvas(64, 64, function (g, w, h) { var gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(240,140,140,0.7)'); gr.addColorStop(0.6, 'rgba(240,150,150,0.25)'); gr.addColorStop(1, 'rgba(240,150,150,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
    var blushM = new THREE.MeshBasicMaterial({ map: blushT, transparent: true, depthWrite: false, opacity: 0.85, color: '#F6C6C0' });
    [-1, 1].forEach(function (sd) { var bx = sd * 0.135, by = -0.035, bz = headZ(bx, by); var b = add(headG, new THREE.CircleGeometry(0.042, 20), blushM, bx, by, bz + 0.012); b.rotation.y = Math.atan2(bx, bz * 1.6) * 0.9; b.castShadow = false; });
    void front;
    // the catchtube: from his right cheek, a black ribbed hose coiling down into the scarf
    var tubeC = new THREE.CatmullRomCurve3([V3(-0.165, -0.04, 0.14), V3(-0.205, -0.1, 0.15), V3(-0.19, -0.17, 0.165), V3(-0.15, -0.22, 0.175), V3(-0.11, -0.27, 0.17)]);
    var tg = new THREE.TubeGeometry(tubeC, 60, 0.0115, 8, false), tgp = tg.attributes.position, tgn = tg.attributes.normal;
    for (i = 0; i < tgp.count; i++) { var ring = Math.floor(i / 9), k2 = 1 + 0.35 * (ring % 2); tgp.setXYZ(i, tgp.getX(i) + tgn.getX(i) * 0.004 * (k2 - 1), tgp.getY(i) + tgn.getY(i) * 0.004 * (k2 - 1), tgp.getZ(i) + tgn.getZ(i) * 0.004 * (k2 - 1)); }
    add(headG, tg, rubber, 0, 0, 0);
    add(headG, new THREE.CylinderGeometry(0.016, 0.016, 0.02, 12), rubber, -0.162, -0.04, 0.14).rotation.z = 1.2;
    // the hood: fleece lining framing the face, coarse burlap outside, falling to the shoulders
    var fleece = new THREE.TorusGeometry(0.205, 0.05, 12, 40); fleece.scale(1.12, 1.0, 0.62);
    add(headG, fleece, plush, 0, 0.0, 0.125); pileOn(headG, fleece, 0, 0.0, 0.125, 3, 0.012);
    var hood = new THREE.SphereGeometry(0.275, 44, 30, PI / 2 + 1.2, TAU - 2.4, 0, 2.3); hood.scale(1.07, 1.0, 0.98); folds(hood, 0.07, 18); folds(hood, 0.025, 47);
    add(headG, hood, burlap, 0, 0.015, -0.02);
    var rim = new THREE.TorusGeometry(0.255, 0.038, 10, 44); rim.scale(1.04, 0.98, 0.7); folds(rim, 0.12, 30);
    add(headG, rim, burlap, 0, 0.005, 0.1).rotation.x = -0.08;
    var fall = new THREE.CylinderGeometry(0.24, 0.3, 0.2, 30, 3, true, 0.7, TAU - 1.4); folds(fall, 0.05, 25);
    add(neck, fall, burlap, 0, 0.03, -0.03);

    // the arms: short and soft, mitten paws in cream pile; the right holds the staff
    function arm(sd) {
      var sh = new THREE.Group(); sh.position.set(sd * 0.245, 0.31, 0); spine.add(sh);
      add(sh, new THREE.CapsuleGeometry(0.068, 0.07, 6, 14), suit, 0, -0.065, 0);
      var el = new THREE.Group(); el.position.y = -0.135; sh.add(el);
      add(el, new THREE.CapsuleGeometry(0.064, 0.05, 6, 14), suit, 0, -0.045, 0);
      var cuffG = new THREE.TorusGeometry(0.066, 0.016, 6, 18); cuffG.rotateX(PI / 2); add(el, cuffG, leather, 0, -0.085, 0);
      var hand = new THREE.Group(); hand.position.y = -0.135; el.add(hand);
      var mg = new THREE.SphereGeometry(0.078, 22, 16); mg.scale(0.95, 1.05, 0.92);
      add(hand, mg, plush, 0, 0, 0); pileOn(hand, mg, 0, 0, 0, 3, 0.012);
      return { sh: sh, el: el, hand: hand };
    }
    var L = arm(1), R = arm(-1);

    // the legs: short and thick, knee pads, chunky boots wrapped in straps
    function leg(sd) {
      var hip = new THREE.Group(); hip.position.set(sd * 0.1, 0.0, 0); hips.add(hip);
      add(hip, new THREE.CapsuleGeometry(0.088, 0.06, 6, 14), suit, 0, -0.07, 0);
      var kn = new THREE.Group(); kn.position.y = -0.15; hip.add(kn);
      var pad = add(kn, new THREE.SphereGeometry(0.06, 14, 10, 0, TAU, 0, PI / 2), leather, 0, 0.0, 0.05); pad.rotation.x = PI / 2; pad.scale.set(1, 1, 0.6);
      add(kn, new THREE.CapsuleGeometry(0.084, 0.03, 6, 14), suit, 0, -0.045, 0);
      var boot = new THREE.Group(); boot.position.y = -0.12; kn.add(boot);
      add(boot, new THREE.CylinderGeometry(0.09, 0.098, 0.1, 18), dark, 0, 0.01, 0.0);
      var toe = add(boot, new THREE.SphereGeometry(0.1, 18, 12), dark, 0, -0.035, 0.045); toe.scale.set(0.98, 0.55, 1.3);
      for (var w = 0; w < 3; w++) { var band = new THREE.TorusGeometry(0.094, 0.011, 6, 20); band.rotateX(PI / 2 + 0.12); add(boot, band, leather, 0, 0.04 - w * 0.032, 0.005); }
      var sole = new THREE.CylinderGeometry(0.1, 0.1, 0.022, 18); sole.scale(1, 1, 1.35); add(boot, sole, new THREE.MeshStandardMaterial({ color: '#1A1714', roughness: 0.9 }), 0, -0.058, 0.03);
      return { hip: hip, kn: kn, boot: boot };
    }
    var LL = leg(1), LR = leg(-1);

    // the staff, a head taller than he is, and the trail a swing leaves
    var staff = new THREE.Group(); R.hand.add(staff); staff.position.y = -0.01;
    var wood = new THREE.MeshStandardMaterial({ map: rep(X.wood, 1, 2), roughness: 0.8 });
    add(staff, new THREE.CylinderGeometry(0.018, 0.021, 1.62, 10), wood, 0, 0.36, 0);
    add(staff, new THREE.CylinderGeometry(0.024, 0.024, 0.16, 10), leather, 0, 0.0, 0);
    add(staff, new THREE.CylinderGeometry(0.023, 0.023, 0.12, 10), leather, 0, 0.75, 0);
    add(staff, new THREE.CylinderGeometry(0.025, 0.019, 0.07, 10), brass, 0, 1.17, 0);
    add(staff, new THREE.CylinderGeometry(0.02, 0.025, 0.06, 10), brass, 0, -0.44, 0);
    var tieG = new THREE.PlaneGeometry(0.075, 0.17, 1, 6); tieG.translate(0, -0.085, 0);
    var tie = add(staff, tieG, new THREE.MeshStandardMaterial({ map: X.cloak, roughness: 1, side: THREE.DoubleSide, alphaTest: 0.35, color: '#F2D6A8' }), 0.025, 1.08, 0);
    var tipL = new THREE.Object3D(); tipL.position.y = 1.15; staff.add(tipL);
    var TN = 9, trailG = new THREE.BufferGeometry(), trailP = new Float32Array(TN * 2 * 3), trailA = new Float32Array(TN * 2), trailI = [];
    for (i = 0; i < TN - 1; i++) { var a0 = i * 2; trailI.push(a0, a0 + 1, a0 + 2, a0 + 1, a0 + 3, a0 + 2); }
    trailG.setAttribute('position', new THREE.BufferAttribute(trailP, 3)); trailG.setAttribute('fade', new THREE.BufferAttribute(trailA, 1)); trailG.setIndex(trailI);
    var trailM = new THREE.ShaderMaterial({ uniforms: { uK: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: 'attribute float fade; varying float vF; void main() { vF = fade; gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform float uK; varying float vF; void main() { float a = vF * vF * vF * uK * 0.32; gl_FragColor = vec4(vec3(1.0, 0.8, 0.55) * a, a); }' });
    var trail = new THREE.Mesh(trailG, trailM); trail.frustumCulled = false; trail.matrixAutoUpdate = false; root.add(trail);
    var tipW = [], midW = [], tpos = V3(), mpos = V3(), midL = new THREE.Object3D(); midL.position.y = 0.88; staff.add(midL);
    for (i = 0; i < TN; i++) { tipW.push(V3()); midW.push(V3()); }

    // the cloak: a grid of rags laid out every frame from the shoulders, streaming with speed and wind
    var CW = 10, CH = 16, cloakG = new THREE.PlaneGeometry(1, 1, CW, CH), cpos = cloakG.attributes.position;
    var cloak = add(spine, cloakG, new THREE.MeshStandardMaterial({ color: '#F4D8B4', map: rags, normalMap: rep(X.burlapN, 4, 6), normalScale: new THREE.Vector2(1.4, 1.4), roughness: 1, side: THREE.DoubleSide, alphaTest: 0.42 }), 0, 0, 0);
    cloak.frustumCulled = false;
    var CLOAK_LEN = 0.74, qW = new THREE.Quaternion(), windL = V3(), invQ = new THREE.Quaternion();

    // posing: each joint eases toward a target built from the stance, the stride and the move
    var J = { lean: 0, twist: 0, roll: 0, bob: 0, sq: 1, step: 0, head: 0, headY: 0, headR: 0,
      rSx: 0, rSz: 0, rSy: 0, rE: 0, lSx: 0, lSz: 0, lSy: 0, lE: 0, staffX: 0, staffY: 0, staffZ: 0,
      lHip: 0, rHip: 0, lKn: 0, rKn: 0, lFt: 0, rFt: 0, fall: 0 };
    var TG = {}; for (var k in J) TG[k] = J[k];
    function setT(o) { for (var kk in o) TG[kk] = o[kk]; }
    function lerpO(a, b, u) { var o = {}; for (var kk in a) o[kk] = a[kk] + ((b[kk] == null ? a[kk] : b[kk]) - a[kk]) * u; return o; }
    // the staff planted beside him (rest), braced across him (guard); the swings' key poses
    var REST = { rSx: -0.22, rSz: -0.5, rSy: 0, rE: -0.45, staffX: 0.62, staffY: 0, staffZ: 0.5, lSx: 0.08, lSz: 0.2, lSy: 0, lE: -0.25, twist: 0, lean: 0.02 };
    var GUARD = { rSx: -0.95, rSz: 0.32, rSy: 0.3, rE: -1.05, staffX: 1.0, staffY: 0.2, staffZ: 1.15, lSx: -1.0, lSz: -0.5, lSy: -0.2, lE: -0.95, twist: -0.25, lean: 0.12 };
    // each swing: wind-up, the blow, follow-through (the blow lands at 45%)
    var CUT = {
      slash1: [{ rSx: -2.0, rSz: 1.0, rSy: 0.2, rE: -0.7, staffX: 1.25, staffY: 0, staffZ: 1.45, twist: -1.0, lean: -0.02, lSx: -0.5, lSz: -0.3, lE: -0.5, step: -0.04 },
               { rSx: -1.45, rSz: -0.7, rSy: -0.5, rE: -0.2, staffX: 1.6, staffY: 0, staffZ: 1.55, twist: 0.85, lean: 0.24, lSx: -0.2, lSz: 0.45, lE: -0.3, step: 0.1 },
               { rSx: -1.1, rSz: -1.0, rSy: -0.6, rE: -0.35, staffX: 1.7, staffY: 0, staffZ: 1.3, twist: 1.1, lean: 0.2, lSx: -0.1, lSz: 0.5, lE: -0.2, step: 0.08 }],
      slash2: [{ rSx: -1.55, rSz: -1.0, rSy: -0.35, rE: -0.85, staffX: 1.45, staffY: 0, staffZ: -1.45, twist: 0.95, lean: 0.04, lSx: -0.35, lSz: 0.35, lE: -0.4, step: -0.03 },
               { rSx: -1.3, rSz: 0.85, rSy: 0.45, rE: -0.2, staffX: 1.45, staffY: 0, staffZ: -1.55, twist: -0.9, lean: 0.22, lSx: -0.85, lSz: -0.45, lE: -0.6, step: 0.1 },
               { rSx: -1.0, rSz: 1.05, rSy: 0.5, rE: -0.3, staffX: 1.4, staffY: 0, staffZ: -1.35, twist: -1.15, lean: 0.18, lSx: -0.7, lSz: -0.5, lE: -0.5, step: 0.08 }],
      slash3: [{ rSx: -2.95, rSz: 0.18, rSy: 0, rE: -0.3, staffX: 0.25, staffY: 0, staffZ: 0.2, twist: -0.25, lean: -0.22, lSx: -2.85, lSz: -0.22, lE: -0.35, step: -0.05 },
               { rSx: -1.25, rSz: 0.1, rSy: 0, rE: -0.08, staffX: 1.72, staffY: 0, staffZ: 0.15, twist: 0.05, lean: 0.48, lSx: -1.25, lSz: -0.12, lE: -0.12, step: 0.16 },
               { rSx: -0.95, rSz: 0.1, rSy: 0, rE: -0.15, staffX: 1.85, staffY: 0, staffZ: 0.12, twist: 0.05, lean: 0.4, lSx: -1.0, lSz: -0.12, lE: -0.2, step: 0.14 }],
    };
    var ph = 0, actId = -1, actName = null, actT = 0, actRate = 1, koT = 0, wind = 0, trail2 = 0, airK = 0, wasAir = false, landT = 9, guardK = 0, hitT = 9, hitDir = 0, tPrev = 0, breathe = 0;
    var lookT = 3, lookY = 0, lookP = 0, headV = 0, headLag = 0, lastSp = 0;
    var SW = 0.62;

    function animate(t, dt, s) {
      dt = Math.min(0.05, Math.max(0, dt || (t - tPrev) || 0.016)); tPrev = t;
      s = s || {};
      var br = s.brawl || {}, sp = s.speed || 0, a = br.action;
      if (a && a.id !== actId) { actId = a.id; actName = a.name; actT = 0; actRate = a.rate || 1; if (/^hit/.test(actName)) { hitT = 0; hitDir = /Chest/.test(actName) ? 1 : 0.6; } }
      if (!a) actName = null; else actT += dt * actRate;
      hitT += dt; breathe += dt;
      var fight = br.stance && !/^(idle|shift|arms|phone|argue|dance)$/.test(br.stance);
      guardK = damp(guardK, fight ? 1 : 0, 6, dt);
      var inAir = !!s.air; airK = damp(airK, inAir ? 1 : 0, 14, dt);
      if (wasAir && !inAir) landT = 0; wasAir = inAir; landT += dt;
      // the stride: short legs, quick steps, a side-to-side waddle
      var stride = 0.36 + 0.1 * sp, steps = sp > 0.08 ? sp / stride : 0;
      ph += dt * PI * steps;
      var walk = clamp(sp / 1.6, 0, 1), run = clamp((sp - 1.6) / 3, 0, 1), mv = Math.max(walk, run);
      var sw = Math.sin(ph), cw = Math.cos(ph), amp = 0.42 + 0.3 * run;
      setT(lerpO(REST, GUARD, guardK));
      TG.lHip = -sw * amp * mv; TG.rHip = sw * amp * mv;
      TG.lKn = Math.max(0, cw) * (0.75 + 0.4 * run) * mv; TG.rKn = Math.max(0, -cw) * (0.75 + 0.4 * run) * mv;
      TG.lFt = -TG.lHip * 0.5; TG.rFt = -TG.rHip * 0.5;
      // a bounce on every step, squashed as the foot lands
      var contact = Math.abs(sw);
      TG.bob = (0.012 + 0.035 * run) * (1 - contact) * mv; TG.sq = 1 - (0.03 + 0.04 * run) * Math.max(0, contact - 0.6) * mv;
      TG.roll = sw * (0.11 * walk * (1 - run) + 0.04 * run); TG.lean += 0.07 * walk + 0.16 * run;
      if (guardK < 0.5) { TG.lSx = -sw * (0.55 * walk + 0.3 * run) + 0.08; TG.lE = -0.25 - 0.4 * run; TG.rSx += sw * 0.18 * walk - 0.25 * run; TG.staffZ += -0.35 * run; }
      // still: he breathes, and now and then looks round
      var still = 1 - mv;
      TG.sq *= 1 + 0.015 * Math.sin(breathe * 1.7) * still;
      lookT -= dt; if (lookT <= 0) { lookT = 2.5 + Math.random() * 4; lookY = (Math.random() - 0.5) * 1.1 * still; lookP = (Math.random() - 0.4) * 0.25 * still; }
      TG.headY = lookY * (1 - guardK); TG.head = lookP * (1 - guardK); TG.headR = Math.sin(breathe * 0.9) * 0.04 * still;
      TG.step = 0; TG.fall = 0;
      // the swings
      var cut = actName && CUT[actName] ? CUT[actName] : actName && /^(jab|cross|hook|upper|body)/.test(actName) ? CUT.slash1 : null;
      var swingK = 0;
      if (cut) {
        var p = actT / SW, o;
        if (p < 0.34) o = lerpO(GUARD, cut[0], smooth(p / 0.34));
        else if (p < 0.5) { o = lerpO(cut[0], cut[1], smooth((p - 0.34) / 0.16)); swingK = 1; }
        else if (p < 0.66) { o = lerpO(cut[1], cut[2], smooth((p - 0.5) / 0.16)); swingK = 0.6; }
        else o = lerpO(cut[2], GUARD, smooth((p - 0.66) / 0.34));
        setT(o);
        TG.lHip = -0.4; TG.rHip = 0.45; TG.lKn = 0.35; TG.rKn = 0.1;
        // the overhead blow lifts him off his feet and slams down
        if (actName === 'slash3') { TG.bob = p > 0.2 && p < 0.5 ? Math.sin((p - 0.2) / 0.3 * PI) * 0.14 : 0; TG.sq = p > 0.48 && p < 0.62 ? 0.88 : 1; }
        else TG.sq = p > 0.34 && p < 0.5 ? 1.03 : 1;
      }
      // a blow taken: squashed, rocked back, the head snapping
      if (hitT < 0.45) { var hk = Math.sin(hitT / 0.45 * PI); TG.lean -= 0.55 * hk * hitDir; TG.head -= 0.4 * hk; TG.twist += 0.25 * hk; TG.sq *= 1 - 0.1 * hk; }
      // down for good: over backwards, with a bounce, and still
      if (br.ko) { koT += dt; var u = clamp(koT / 0.5, 0, 1), fk = u < 1 ? 1 - Math.pow(1 - u, 3) : 1, bounce = koT > 0.5 && koT < 0.85 ? Math.sin((koT - 0.5) / 0.35 * PI) * 0.12 : 0; TG.fall = fk - bounce; TG.lHip = -0.9 * fk; TG.rHip = -0.5 * fk; TG.lKn = 0.4; TG.rKn = 0.7; TG.rSx = -2.3 * fk; TG.lSx = -2.5 * fk; TG.lE = -0.3; TG.rE = -0.3; TG.head = -0.25 * fk; TG.sq = 1; }
      else koT = 0;
      // in the air: knees up, paws out, cloak lifting; a squash when he lands
      if (airK > 0.01) { TG.lKn += 1.0 * airK; TG.rKn += 1.0 * airK; TG.lHip -= 0.55 * airK; TG.rHip -= 0.35 * airK; TG.lSz += 0.6 * airK; TG.lSx -= 0.5 * airK; TG.sq *= 1 + 0.06 * airK; }
      if (landT < 0.3) { var lk = Math.sin(landT / 0.3 * PI); TG.sq *= 1 - 0.14 * lk; TG.lKn += 0.5 * lk; TG.rKn += 0.5 * lk; }
      var kq = cut ? 30 : 12;
      for (var j in J) J[j] = damp(J[j], TG[j], j === 'sq' ? 18 : kq, dt);
      // the head lags a starting and stopping body, and springs back
      var acc = (sp - lastSp) / Math.max(dt, 0.001); lastSp = sp;
      headV += (-headLag * 140 - headV * 12 - clamp(acc, -20, 20) * 0.9) * dt; headLag += headV * dt; headLag = clamp(headLag, -0.25, 0.25);

      body.scale.set(1 + (1 - J.sq) * 0.6, J.sq, 1 + (1 - J.sq) * 0.6);
      hips.position.y = 0.34 + J.bob - J.fall * 0.2; hips.position.z = J.step; hips.rotation.z = J.roll * 0.5;
      body.rotation.x = -J.fall * 1.4; body.position.z = -J.fall * 0.26; body.position.y = J.fall * 0.16;
      spine.rotation.set(J.lean, J.twist, J.roll);
      neck.rotation.set(J.head - J.lean * 0.5 + headLag, -J.twist * 0.5 + J.headY, J.headR - J.roll * 0.4);
      R.sh.rotation.set(J.rSx, J.rSy, J.rSz); R.el.rotation.x = J.rE;
      L.sh.rotation.set(J.lSx, J.lSy, J.lSz); L.el.rotation.x = J.lE;
      staff.rotation.set(J.staffX, J.staffY, J.staffZ);
      LL.hip.rotation.x = J.lHip; LR.hip.rotation.x = J.rHip; LL.kn.rotation.x = J.lKn; LR.kn.rotation.x = J.rKn;
      LL.boot.rotation.x = J.lFt - J.lKn * 0.3; LR.boot.rotation.x = J.rFt - J.rKn * 0.3;

      // the trail: the staff's head over the last few frames, bright through the blow
      root.updateMatrixWorld(true);
      tipL.getWorldPosition(tpos); midL.getWorldPosition(mpos);
      for (i = TN - 1; i > 0; i--) { tipW[i].copy(tipW[i - 1]); midW[i].copy(midW[i - 1]); }
      tipW[0].copy(tpos); midW[0].copy(mpos);
      trail2 = damp(trail2, swingK, swingK > trail2 ? 30 : 8, dt);
      trailM.uniforms.uK.value = trail2;
      for (i = 0; i < TN; i++) { trailP.set([tipW[i].x, tipW[i].y, tipW[i].z], i * 6); trailP.set([midW[i].x, midW[i].y, midW[i].z], i * 6 + 3); trailA[i * 2] = trailA[i * 2 + 1] = 1 - i / (TN - 1); }
      trailG.attributes.position.needsUpdate = true; trailG.attributes.fade.needsUpdate = true;
      trail.visible = trail2 > 0.02;

      // the cloak and the staff's tie, worked by the wind and the run
      wind += dt; var flow = damp(0, 0, 1, dt); void flow;
      var tr = Math.min(0.85, sp * 0.15) + airK * 0.5 + (cut ? 0.2 : 0);
      spine.getWorldQuaternion(qW); invQ.copy(qW).invert(); windL.set(1, 0, 0).applyQuaternion(invQ);
      var gust = 0.6 + 0.4 * Math.sin(wind * 0.7) * Math.sin(wind * 1.9 + 1);
      for (var row = 0; row <= CH; row++) {
        var uu = row / CH, ang = Math.min(1.05, 0.08 + tr * (0.45 + uu * 0.55) + Math.sin(wind * 2.1 + uu * 3) * 0.05 * (1 + tr));
        var yy = 0.4, zz = -0.17, along = uu * CLOAK_LEN, blow = uu * uu * (0.38 * gust + 0.05);
        for (var col = 0; col <= CW; col++) {
          var vtx = row * (CW + 1) + col, cu = col / CW - 0.5, wide = 0.42 + uu * 0.36;
          var flut = Math.sin(wind * 4.6 + uu * 6 + cu * 7) * 0.04 * uu * (0.6 + tr + gust) + Math.sin(wind * 1.3 + cu * 2) * 0.04 * uu;
          // wrapped round the shoulders at the top, hanging in folds below
          var curl = cu * cu * 0.8 * (1 - uu * 0.55), fold = Math.sin(cu * TAU * 2.5 + 0.6) * 0.028 * (0.35 + uu);
          cpos.setXYZ(vtx, cu * wide * (1 - 0.18 * (1 - uu)) + windL.x * blow + flut * 0.5, yy - Math.cos(ang) * along + flut * 0.4 + Math.abs(windL.x) * blow * 0.3, zz - Math.sin(ang) * along + curl + fold + flut + windL.z * blow);
        }
      }
      cpos.needsUpdate = true; cloakG.computeVertexNormals();
      tie.rotation.z = 0.3 + Math.sin(wind * 5) * 0.25 + tr * 0.6; tie.rotation.x = Math.sin(wind * 3.3) * 0.2;
    }
    animate(0, 0.016, {});
    return {
      object: root, animate: animate, name: 'Muse', color: '#EFE3CF', height: 1.32, radius: 0.38,
      // a swing lands at 45% of its 0.62 s, a flinch is quick
      timing: { strike: { duration: SW, contact: SW * 0.45 }, hit: { duration: 0.45, contact: 0.2 }, dash: { duration: 0.7, contact: 0.32 }, cast: { duration: 0.8, contact: 0.4 }, getup: { duration: 0.9, contact: 0.45 }, roll: { duration: 0.6, contact: 0.3 } },
      arm: function () {},
    };
  }

  /* --------------------------------------------------- Shai-Hulud -- */
  // The worm: a ringed hide thirty metres long, three and a half across.
  // Travelling, it is under the sand: a mound that runs at you, throwing
  // dust. Close in, it rises eight metres out of the dune, sways, and opens
  // its maw (three petals, rings of crystal teeth, a glow far down the
  // throat); a strike comes down on you, a spit throws a jet of sand; put
  // down, it sinks back. The runtime moves it like any fighter.
  var WORMTEX = null;
  function shaiHulud(ctx, i) {
    var THREE = ctx.THREE;
    if (!WORMTEX) WORMTEX = {
      hide: ctx.textures.canvas(256, 512, function (g, w, h) {
        g.fillStyle = '#7C5636'; g.fillRect(0, 0, w, h);
        for (var y = 0; y < h; y += 32) { var gr = g.createLinearGradient(0, y, 0, y + 32); gr.addColorStop(0, 'rgba(30,18,10,0.75)'); gr.addColorStop(0.18, 'rgba(160,118,78,0.5)'); gr.addColorStop(0.7, 'rgba(110,76,48,0.2)'); gr.addColorStop(1, 'rgba(30,18,10,0.6)'); g.fillStyle = gr; g.fillRect(0, y, w, 32); }
        noiseCanvas(g, w, h, 9000, 0.05, 0.22, 'rgba(206,164,112,', 'rgba(24,14,8,');
        for (var c = 0; c < 60; c++) { g.strokeStyle = 'rgba(20,12,6,0.35)'; g.lineWidth = 1; g.beginPath(); var x0 = Math.random() * w, y0 = Math.random() * h; g.moveTo(x0, y0); for (var k = 0; k < 5; k++) g.lineTo(x0 + (Math.random() - 0.5) * 30, y0 + k * 6); g.stroke(); }
      }),
      hideN: ctx.textures.normal(128, 256, function (g, w, h) { g.fillStyle = '#808080'; g.fillRect(0, 0, w, h); for (var y = 0; y < h; y += 16) { var gr = g.createLinearGradient(0, y, 0, y + 16); gr.addColorStop(0, '#202020'); gr.addColorStop(0.25, '#F0F0F0'); gr.addColorStop(0.8, '#909090'); gr.addColorStop(1, '#202020'); g.fillStyle = gr; g.fillRect(0, y, w, 16); } noiseCanvas(g, w, h, 3000, 0.1, 0.3, 'rgba(255,255,255,', 'rgba(0,0,0,'); }, 2.2),
    };
    var hide = new THREE.MeshStandardMaterial({ map: WORMTEX.hide, normalMap: WORMTEX.hideN, normalScale: new THREE.Vector2(1.4, 1.4), roughness: 0.9, side: THREE.DoubleSide });
    var ivory = new THREE.MeshPhysicalMaterial({ color: '#EDE4CF', roughness: 0.25, clearcoat: 0.6, sheen: 0.4, sheenColor: new THREE.Color('#FFF3D6') });
    var throat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.3, 0.5, 0.14), side: THREE.DoubleSide, fog: false });
    var flesh = new THREE.MeshStandardMaterial({ color: '#6E2E1C', roughness: 0.55, emissive: '#5A1A08', emissiveIntensity: 0.6, side: THREE.DoubleSide });
    var sandM = ctx.assets.surface('texture-sand', { color: '#D79A62', size: 3, normal: 1.6 }) || new THREE.MeshStandardMaterial({ color: '#B87A48', roughness: 1 });
    var root = new THREE.Group(), NS = 18, SEGL = 1.45, segs = [];
    for (var k = 0; k < NS; k++) {
      var r = (1.85 - k * 0.014) * (1 + Math.sin(k * 2.7) * 0.035), sg = new THREE.Group();
      var cyl = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.96, SEGL, 30, 1, true), hide); cyl.castShadow = true; sg.add(cyl);
      if (k % 2 === 0) { var plate = new THREE.Mesh(new THREE.TorusGeometry(r + 0.03, 0.17 - k * 0.004, 8, 30), hide); plate.rotation.x = PI / 2; plate.position.y = SEGL / 2; plate.scale.set(1, 1, 0.8); sg.add(plate); }
      root.add(sg); segs.push(sg);
    }
    // the maw: three petals that open, rings of teeth, the throat's glow
    var maw = new THREE.Group(); root.add(maw);
    var petals = [];
    // the lip: a thick flared ring round the mouth, the hide rolled back from the teeth
    var lip = new THREE.Mesh(new THREE.TorusGeometry(1.95, 0.32, 12, 40), hide); lip.rotation.x = PI / 2; lip.position.y = 0.15; lip.castShadow = true; maw.add(lip);
    var flare = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 1.82, 0.9, 36, 1, true), hide); flare.position.y = -0.35; maw.add(flare);
    var ringT = new THREE.InstancedMesh(new THREE.ConeGeometry(0.06, 0.38, 5), ivory, 96), dmy = new THREE.Object3D();
    for (var n = 0; n < 96; n++) { var ring = Math.floor(n / 32), ang = (n % 32) / 32 * TAU + ring * 0.1, rr = 1.55 - ring * 0.32; dmy.position.set(Math.cos(ang) * rr, 0.2 - ring * 0.9, Math.sin(ang) * rr); dmy.lookAt(0, 0.2 - ring * 0.9 - 0.3, 0); dmy.rotateX(PI / 2); dmy.updateMatrix(); ringT.setMatrixAt(n, dmy.matrix); }
    maw.add(ringT);
    // the gullet: a fleshy funnel going down into the body, glowing deep inside
    var gul = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 0.25, 4.2, 28, 6, true), new THREE.MeshStandardMaterial({ color: '#4A1C10', roughness: 0.5, emissive: '#3A0E04', emissiveIntensity: 0.8, side: THREE.BackSide }));
    gul.position.y = -2.0; maw.add(gul);
    var glow = new THREE.Mesh(new THREE.CircleGeometry(0.42, 20), throat); glow.rotation.x = PI / 2; glow.position.y = -4.0; maw.add(glow);
    var wlight = new THREE.PointLight('#FF8A30', 0, 14, 2); wlight.position.y = -1; maw.add(wlight);
    // where it breaks the surface: a collar of churned sand; travelling, a running mound
    var cg = new THREE.TorusGeometry(2.7, 1.0, 10, 36), cgp = cg.attributes.position;
    for (n = 0; n < cgp.count; n++) { var cxp = cgp.getX(n), cyp = cgp.getY(n); var jit = 1 + Math.sin(cxp * 3.1 + cyp * 2.3) * 0.18 + Math.sin(cxp * 7 - cyp * 5) * 0.08; cgp.setXYZ(n, cxp * jit, cyp * jit, cgp.getZ(n) * (0.6 + 0.5 * Math.abs(Math.sin(cxp * 2 + cyp)))); }
    cg.computeVertexNormals();
    var collar = new THREE.Mesh(cg, sandM); collar.rotation.x = PI / 2; collar.scale.set(1, 1, 0.5); collar.receiveShadow = true; root.add(collar);
    var mound = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 10, 0, TAU, 0, PI / 2), sandM); mound.scale.set(3.2, 1.3, 7); root.add(mound);
    var dustT = ctx.textures.canvas(64, 64, function (g, w, h) { var gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(232,180,120,0.55)'); gr.addColorStop(1, 'rgba(232,180,120,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
    var dust = [], dustM = new THREE.SpriteMaterial({ map: dustT, transparent: true, depthWrite: false, color: '#E2A46C' });
    for (n = 0; n < 18; n++) { var sp = new THREE.Sprite(dustM.clone()); root.add(sp); dust.push({ s: sp, t: Math.random() * 2, a: Math.random() * TAU }); }
    var curve = new THREE.CatmullRomCurve3([new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]);
    var up = new THREE.Vector3(0, 1, 0), tan = new THREE.Vector3(), pos = new THREE.Vector3();
    var rise = 0, lunge = 0, rear = 0, open = 0, sway = 0, actId = -1, actT = 0, actName = null, hitT = 9, koT = 0, head = new THREE.Vector3(0, 6, 1);
    var STR = 1.05, CST = 1.15;
    function animate(t, dt, s) {
      dt = Math.min(0.05, Math.max(0, dt || 0.016)); s = s || {};
      var br = s.brawl || {}, a = br.action, spd = s.speed || 0;
      if (a && a.id !== actId) { actId = a.id; actName = a.name; actT = 0; if (/^hit/.test(actName)) hitT = 0; }
      if (a) actT += dt * (a.rate || 1); else actName = null;
      hitT += dt;
      var kind = actName ? (/cast|shoot|spit|breath|throw|blast/.test(actName) ? 'cast' : /^hit/.test(actName) ? 'hit' : 'strike') : null;
      // under the sand while it runs at you; up when it is close and fighting
      var fighting = br.stance && !/^(idle|shift|walk)$/.test(br.stance);
      var wantUp = br.ko ? 0 : kind || fighting || spd < 2.2 ? 1 : 0;
      if (br.ko) koT += dt; else koT = 0;
      rise = damp(rise, wantUp, wantUp > rise ? 1.4 : 0.9, dt);
      var lg = 0, rr = 0;
      if (kind === 'strike') { var u = actT / STR; lg = u < 0.4 ? -0.35 * Math.sin(u / 0.4 * PI / 2) : u < 0.58 ? -0.35 + 1.35 * smooth((u - 0.4) / 0.18) : 1 - smooth((u - 0.58) / 0.42); }
      if (kind === 'cast') { var c = actT / CST; rr = c < 0.5 ? smooth(c / 0.5) : 1 - smooth((c - 0.5) / 0.5); }
      lunge = damp(lunge, lg, 14, dt); rear = damp(rear, rr, 8, dt);
      open = damp(open, (kind === 'strike' && actT / STR > 0.3 && actT / STR < 0.75) || kind === 'cast' ? 1 : 0.25 + 0.15 * Math.sin(t * 1.3), 8, dt);
      sway += dt;
      var hk = hitT < 0.5 ? Math.sin(hitT / 0.5 * PI) : 0;
      // the head: high and swaying, coming down at you on a strike, rearing for a spit
      var hy = -3 + rise * (8 + rear * 2) - Math.max(0, lunge) * 6.2, hz = -3.6 + Math.max(0, lunge) * 6 - rear * 1.5 - hk * 1.2;
      var hx = Math.sin(sway * 0.7) * 0.9 * rise * (1 - Math.max(0, lunge));
      head.set(hx, hy, hz);
      var pts = curve.points;
      pts[0].copy(head);
      // the neck arches over: up and back from the sand, then forward to the head
      pts[1].set(hx * 0.7, hy + 1.2 * rise - Math.max(0, lunge) * 1.5, hz - 3.2 - lunge * 1.2);
      pts[2].set(Math.sin(sway * 0.7 - 1) * 0.6 * rise, hy * 0.62, -10.4);
      pts[3].set(0, -1.0, -12.6);
      pts[4].set(0, -6, -14);
      for (var k2 = 0; k2 < NS; k2++) {
        var uu = Math.min(1, k2 / (NS - 1) * 1.05);
        curve.getPointAt(uu, pos); curve.getTangentAt(uu, tan);
        segs[k2].position.copy(pos); segs[k2].quaternion.setFromUnitVectors(up, tan.multiplyScalar(-1));
        segs[k2].visible = rise > 0.04 || koT < 2;
      }
      // the maw faces down the body's line
      curve.getTangentAt(0, tan); maw.position.copy(head); maw.quaternion.setFromUnitVectors(up, tan.negate().multiplyScalar(-1));
      maw.visible = rise > 0.04;
      lip.scale.setScalar(1 + open * 0.12); flare.scale.set(1 + open * 0.1, 1, 1 + open * 0.1); var q;
      wlight.intensity = 2 * open * rise; throat.color.setRGB(1.3 * (0.35 + open * 0.65), 0.5 * (0.35 + open * 0.65), 0.14);
      collar.visible = rise > 0.05; collar.position.set(pts[3].x * 0.5, -0.3, -12.2); collar.scale.set(1 + rise * 0.2, 1 + rise * 0.2, 0.45);
      mound.visible = rise < 0.6; mound.scale.set(3.2, 1.3 * (1 - rise) * (0.85 + 0.15 * Math.sin(t * 6)), 7); mound.position.set(0, -0.35, -1.5);
      // dust: thrown up while it runs under the sand, bursting as it breaks out
      var kick = clamp((spd > 1 && rise < 0.5 ? 1 : 0) + (rise > 0.1 && rise < 0.9 ? 1 : 0) + (koT > 0 && koT < 2 ? 1 : 0), 0, 1);
      for (q = 0; q < dust.length; q++) {
        var dd = dust[q]; dd.t += dt * (0.6 + kick);
        if (dd.t > 2) { dd.t = 0; dd.a = Math.random() * TAU; }
        var life = dd.t / 2, rad = 2 + life * 5;
        dd.s.position.set(Math.cos(dd.a) * rad, 0.4 + life * 4, Math.sin(dd.a) * rad - (rise > 0.3 ? 12 : 2));
        dd.s.scale.setScalar(2 + life * 6); dd.s.material.opacity = kick * (1 - life) * 0.6;
      }
      root.visible = koT < 4;
    }
    animate(0, 0.016, { speed: 3 });
    return {
      object: root, animate: animate, name: i % 2 ? 'Old Man of the Desert' : 'Shai-Hulud', height: 9, radius: 2,
      timing: { strike: { duration: STR, contact: STR * 0.55 }, cast: { duration: CST, contact: CST * 0.55 }, hit: { duration: 0.5, contact: 0.2 }, dash: { duration: 1, contact: 0.5 }, getup: { duration: 1, contact: 0.5 }, roll: { duration: 0.6, contact: 0.3 } },
      muzzle: function () { return { y: Math.max(1.5, head.y - 0.5), forward: head.z + 1.5 }; },
    };
  }

  /* -------------------------------------------------- the crews -- */
  // Harkonnen: pale, bald, black armour, the long knife; now and then a
  // smuggler in desert robes and a respirator. Sardaukar: the Emperor's
  // terror troops, grey armour and close helmets, lasguns that fire blue
  // bolts. From the deep sand: sandtrout (low, leathery, fast, eyeless, in
  // packs) and stalkers (three metres of jointed limb and four blue eyes).
  function harkonnen(ctx, i, heat) {
    if (i % 4 === 3) return {
      skin: pick(['caucasian2', 'african', 'asian'], i), hair: 'short02', height: 1.76 + (i % 3) * 0.04, build: { muscle: 0.6, lean: 0.5 },
      suit: { color: '#3B342E', trim: '#2A2520', pattern: 'panels' }, outfit: { shoes: '#2A1D14' },
      gear: { robe: { color: pick(['#8C6E4C', '#7A5E42', '#9A7A56'], i), length: 1.2 }, scarf: '#6B4E34', respirator: '#2B2621' },
      weapon: { kind: 'knife' }, name: pick(['Smuggler', 'Water thief', 'Spice runner'], i),
    };
    return {
      skin: 'caucasian', skinTint: '#ECE4EA', hair: 'none', height: 1.82 + (i % 4) * 0.04, build: { muscle: 0.75 + (i % 2) * 0.2, lean: 0.4 },
      clothes: { shirt: { kind: 'long', color: '#101012' }, pants: { kind: 'trousers', color: '#0C0C0E' }, belt: '#1A1A1C' }, outfit: { shoes: '#0A0A0B' },
      gear: i % 3 === 1 ? { helmet: { color: '#131315', visor: '#060607' }, armor: { color: '#121214', trim: '#34343A' } } : { armor: { color: '#121214', trim: '#34343A' } },
      weapon: { kind: i % 5 === 4 ? 'baton' : 'knife', color: i % 5 === 4 ? '#1A1A1C' : null }, name: pick(['Harkonnen trooper', 'Harkonnen guard', 'Harkonnen sergeant', 'Harkonnen trooper'], i),
    };
  }
  function sardaukar(ctx, i) {
    return {
      skin: pick(['caucasian2', 'asian', 'african'], i), hair: 'short02', height: 1.9 + (i % 3) * 0.04, build: { muscle: 0.95, lean: 0.3 },
      clothes: { shirt: { kind: 'long', color: '#2A2A2C' }, pants: { kind: 'trousers', color: '#232325' }, belt: '#141416' }, outfit: { shoes: '#0E0E10' },
      gear: { helmet: { color: '#3C3C3E', visor: '#0A0A0B' }, armor: { color: '#38383A', trim: '#6A6256' }, robe: i % 2 ? { color: '#2E2C2A', length: 1.0, hood: false } : null },
      weapon: { kind: 'knife' }, name: pick(['Sardaukar', 'Sardaukar levenbrech', 'Sardaukar bashar'], i),
    };
  }
  function deepSand(ctx, i, heat) {
    if (i % 3 !== 2) return ctx.assets.creature({
      plan: 'beast', height: 0.55 + (i % 2) * 0.1, name: 'Sandtrout',
      skin: { color: '#6E4A2C', color2: '#C2925E', pattern: 'scales', roughness: 0.75, sheen: 0.5, glow: '#FF9A3A' },
      head: { shape: 'snout', size: 1.1, eyes: { count: 0 }, mouth: true },
      body: { build: 0.85, length: 1.9, legs: 0.5, tail: 1.4, neck: 0.4 },
    });
    return ctx.assets.creature({
      plan: 'biped', height: 2.9 + (i % 2) * 0.3, name: 'Desert stalker',
      skin: { color: '#B88A5C', color2: '#5E3E26', pattern: 'stripes', roughness: 0.6, glow: '#7FD8FF', spots: 6 },
      head: { shape: 'long', size: 1.05, eyes: { count: 4, size: 0.9, color: '#7FD8FF', glow: true, shape: 'almond' }, horns: true },
      body: { build: 0.25, arms: 1.5, legs: 1.25, neck: 1.4, fingers: 3, digitigrade: true, tail: 0.7 },
    });
  }
  function bossBody(ctx, i) {
    if (i % 2 === 0) return shaiHulud(ctx, i / 2);
    return ctx.assets.creature({
      plan: 'floater', height: 4.2, name: 'Spice wraith',
      skin: { color: '#A8461A', color2: '#FFB060', pattern: 'spots', spots: 16, glow: '#FFB347', sheen: 0.7, gloss: 0.4 },
      head: { shape: 'long', size: 1.25, eyes: { count: 3, size: 1.2, color: '#FFD27A', glow: true }, mouth: false, antennae: true },
      body: { build: 0.35, arms: 1.5, tendrils: 9, fingers: 4 },
    });
  }

  /* ----------------------------------------------- the landmarks -- */
  function tintModel(obj, color, rough) {
    obj.traverse(function (m) { if (m.isMesh && m.material) { m.material = m.material.clone(); m.material.color.set(color); if (rough != null) m.material.roughness = rough; m.castShadow = true; m.receiveShadow = true; } });
    return obj;
  }
  function landmarks(ctx) {
    var THREE = ctx.THREE, scene = ctx.scene, X = textures(ctx), hi = ctx.quality !== 'low';
    var rockMat = ctx.assets.surface('texture-rock', { project: 'box', color: '#C98758', size: 6, normal: 1.4 }) || new THREE.MeshStandardMaterial({ color: '#A8704A', roughness: 0.95 });
    var cliff = ctx.assets.model('model-coastal-cliff'), boulder = ctx.assets.model('model-boulder');
    // the Shield Wall: a ring of rock beyond the walkable desert, the edge you can see
    if (cliff) {
      var ring = [];
      for (var side = 0; side < 4; side++) for (var k = 0; k < 5; k++) {
        var along = -B - 20 + k * 86 + 43, off = B + 26 + (k % 2) * 8, ang = side * PI / 2;
        var cx = side === 0 ? along : side === 2 ? -along : side === 1 ? off : -off, cz = side === 0 ? -off : side === 2 ? off : side === 1 ? along : -along;
        ring.push({ x: cx, z: cz, ry: ang + (k % 2 ? 0.1 : -0.06), s: 1.0 + (k % 3) * 0.12, sy: 2.4 + (k % 3) * 0.5 });
      }
      var wall = cliff.instanced(ring.length, function (j, d) { var q = ring[j]; d.position.set(q.x, H(q.x, q.z) - 3, q.z); d.rotation.set(0, q.ry, 0); d.scale.set(q.s, q.sy, 1.4); });
      tintModel(wall, '#D29466', 0.95); scene.add(wall);
    }
    // outcrops: rock shelves and tumbled boulders, each solid
    var crops = [[-112, -58, 0.6], [118, 46, 2.1], [-46, 118, 4.0], [-132, 92, 1.0], [136, -112, 2.6], [12, -150, 0.3], [-150, -10, 1.6]];
    if (cliff) {
      var shelves = cliff.instanced(crops.length, function (j, d) { var c = crops[j]; d.position.set(c[0], H(c[0], c[1]) - 1.2, c[1]); d.rotation.set(0, c[2], 0); d.scale.set(0.28, 0.75, 0.42); });
      tintModel(shelves, '#C88C60', 0.95); scene.add(shelves);
      crops.forEach(function (c) { var hw = 12.5, hd = 4.5, cs = Math.cos(c[2]), sn = Math.sin(c[2]); var ex = Math.abs(cs) * hw + Math.abs(sn) * hd, ez = Math.abs(sn) * hw + Math.abs(cs) * hd; ctx.solid({ min: { x: c[0] - ex, z: c[1] - ez }, max: { x: c[0] + ex, z: c[1] + ez } }); });
    }
    if (boulder) {
      var R2 = ctx.random, bs = [];
      crops.forEach(function (c, j) { for (var n = 0; n < (hi ? 7 : 4); n++) { var a = R2() * TAU, r = 14 + R2() * 10, x = c[0] + Math.cos(a) * r, z = c[1] + Math.sin(a) * r, sc = 1.4 + R2() * 3.2; bs.push([x, z, sc, R2() * TAU]); } });
      for (var n2 = 0; n2 < (hi ? 26 : 12); n2++) { var bx = (R2() - 0.5) * 2 * (B - 10), bz = (R2() - 0.5) * 2 * (B - 10); if (Math.hypot(bx, bz - 34) > 20) bs.push([bx, bz, 0.8 + R2() * 2.2, R2() * TAU]); }
      var rocks = boulder.instanced(bs.length, function (j, d) { var b = bs[j]; d.position.set(b[0], H(b[0], b[1]) - 0.25 * b[2], b[1]); d.rotation.set(0, b[3], 0); d.scale.setScalar(b[2]); });
      tintModel(rocks, '#D09A70', 0.9); scene.add(rocks);
      bs.forEach(function (b) { if (b[2] > 1.2) ctx.solid({ x: b[0], z: b[1], r: 0.75 * b[2] }); });
    }

    // the sietch: a door cut in the rock face, a sealed hatch, lamps within
    var sx = -40, sz = -112, sy = H(sx, sz);
    if (cliff) { var face = tintModel(cliff.object, '#C4885C', 0.95); face.position.set(sx, sy - 2, sz - 16); face.scale.set(0.7, 2.1, 0.9); scene.add(face); ctx.solid({ min: { x: sx - 34, z: sz - 28 }, max: { x: sx + 30, z: sz - 9 } }); }
    var stone = new THREE.MeshStandardMaterial({ color: '#8A6448', roughness: 0.95 });
    var portal = new THREE.Mesh(new THREE.BoxGeometry(6, 7, 3), stone); portal.position.set(sx, sy + 3.5, sz - 10.5); scene.add(portal);
    var hatch = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.1, 0.5, 40), new THREE.MeshStandardMaterial({ color: '#5E4A38', roughness: 0.6, metalness: 0.45 }));
    hatch.rotation.x = PI / 2; hatch.position.set(sx, sy + 3, sz - 8.9); scene.add(hatch);
    for (var sp = 0; sp < 8; sp++) { var spoke = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2, 0.08), new THREE.MeshStandardMaterial({ color: '#A88A5E', metalness: 0.7, roughness: 0.4 })); spoke.position.set(sx, sy + 3, sz - 8.62); spoke.rotation.z = sp * PI / 8; scene.add(spoke); }
    [-1, 1].forEach(function (sd) { var lampM = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2, 1) })); lampM.position.set(sx + sd * 3.6, sy + 4.2, sz - 8.8); scene.add(lampM); var pl = new THREE.PointLight('#FFB060', 2.2, 12, 2); pl.position.copy(lampM.position).add(new THREE.Vector3(0, 0, 0.6)); scene.add(pl); });
    for (var st = 0; st < 5; st++) { var step = new THREE.Mesh(new THREE.BoxGeometry(7 - st * 0.4, 0.4, 1.4), stone); step.position.set(sx, sy + 0.2 + st * 0.0, sz - 8 + 4.5 - st * 1.1); step.receiveShadow = true; scene.add(step); }

    // the spice harvester: a wreck the size of a building, half in the sand, tilted
    var hx = 58, hz = 92, hy = H(hx, hz), hv = new THREE.Group(); hv.position.set(hx, hy - 3.2, hz); hv.rotation.set(0.12, 0.6, -0.08); scene.add(hv);
    var rust = ctx.assets.surface('texture-corrugated-metal', { project: 'box', color: '#9A6A48', size: 3 }) || new THREE.MeshStandardMaterial({ color: '#8A5A3A', roughness: 0.7, metalness: 0.6 });
    var dark = new THREE.MeshStandardMaterial({ color: '#2E2622', roughness: 0.7, metalness: 0.6 });
    [[0, 5, 0, 24, 10, 12], [0, 11.5, -2, 14, 3, 8], [9, 9, 4, 4, 6, 4], [-11, 3, 0, 2, 6, 14]].forEach(function (b) { var m = new THREE.Mesh(new THREE.BoxGeometry(b[3], b[4], b[5]), rust); m.position.set(b[0], b[1], b[2]); m.castShadow = true; m.receiveShadow = true; hv.add(m); });
    [-1, 1].forEach(function (sd) { var tr = new THREE.Mesh(new THREE.BoxGeometry(26, 3.4, 3), dark); tr.position.set(0, 1, sd * 7.5); hv.add(tr); for (var w = 0; w < 9; w++) { var wh = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 3.2, 16), dark); wh.rotation.x = PI / 2; wh.position.set(-11 + w * 2.8, 1, sd * 7.5); hv.add(wh); } });
    var boom = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 22), rust); boom.position.set(6, 14, 8); boom.rotation.x = -0.55; hv.add(boom);
    for (var vn = 0; vn < 6; vn++) { var vent = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 4, 12), dark); vent.position.set(-8 + vn * 3, 12.5, -5); hv.add(vent); }
    ctx.solid({ x: hx, z: hz, r: 14 });

    // a crashed ornithopter: a long body nosed into the dune, wings snapped
    var ox = -84, oz = 18, oy = H(ox, oz), th = new THREE.Group(); th.position.set(ox, oy - 0.6, oz); th.rotation.set(0.18, -0.9, 0.22); scene.add(th);
    var hull = new THREE.MeshStandardMaterial({ color: '#7A7468', roughness: 0.5, metalness: 0.65 });
    var body = new THREE.Mesh(new THREE.CapsuleGeometry(1.25, 7, 8, 18), hull); body.rotation.x = PI / 2; body.castShadow = true; th.add(body);
    var canopy = new THREE.Mesh(new THREE.SphereGeometry(1.15, 18, 12, 0, TAU, 0, PI / 2), new THREE.MeshPhysicalMaterial({ color: '#1E2A30', roughness: 0.05, metalness: 0.4, clearcoat: 1, transparent: true, opacity: 0.7 }));
    canopy.position.set(0, 0.5, 3.6); canopy.scale.set(0.95, 0.8, 1.6); th.add(canopy);
    var wingM = new THREE.MeshStandardMaterial({ color: '#B8AE98', roughness: 0.55, metalness: 0.3, side: THREE.DoubleSide });
    [[-1, 0.3, 0.1, 1], [1, -0.4, 0.4, 1], [-1, 0.2, -2.2, 0.55], [1, 0.9, -2.0, 0.6]].forEach(function (w) {
      var wg = new THREE.PlaneGeometry(9 * w[3], 1.5, 8, 1); wg.translate(4.5 * w[3], 0, 0); var wm = new THREE.Mesh(wg, wingM); wm.position.set(w[0] * 1.1, 0.6, w[2]); wm.rotation.set(-PI / 2 + w[1] * 0.3, w[0] > 0 ? 0 : PI, w[1]); wm.castShadow = true; th.add(wm);
      for (var rb = 0; rb < 6; rb++) { var rib = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.5, 0.08), hull); rib.position.set((0.6 + rb * 1.4) * w[3], 0, 0.04); wm.add(rib); }
    });
    ctx.solid({ x: ox, z: oz, r: 5 });

    // the bones of an old worm: rib arches as high as a house, a skull ring at the head
    var bx0 = 92, bz0 = -36, bone = new THREE.MeshStandardMaterial({ color: '#B49E80', roughness: 0.95 });
    for (var rbn = 0; rbn < 10; rbn++) {
      var bzr = bz0 - 40 + rbn * 8, by = H(bx0, bzr), rr2 = 7.5 + Math.sin(rbn / 9 * PI) * 3.5;
      var arch = new THREE.Mesh(new THREE.TorusGeometry(rr2, 0.55 - rbn * 0.015, 10, 30, PI), bone); arch.position.set(bx0, by - 1.2, bzr); arch.rotation.z = (rbn % 2 ? 0.06 : -0.06); arch.castShadow = true; scene.add(arch);
      ctx.solid({ x: bx0 - rr2, z: bzr, r: 0.8 }); ctx.solid({ x: bx0 + rr2, z: bzr, r: 0.8 });
    }
    var skull = new THREE.Mesh(new THREE.TorusGeometry(9, 1.6, 12, 36), bone); skull.position.set(bx0, H(bx0, bz0 + 44) + 2, bz0 + 44); skull.rotation.set(0.4, 0, 0.1); skull.castShadow = true; scene.add(skull);
    var fang = new THREE.InstancedMesh(new THREE.ConeGeometry(0.35, 2.4, 6), bone, 28), fd = new THREE.Object3D();
    for (var fn = 0; fn < 28; fn++) { var fa = fn / 28 * TAU; fd.position.set(bx0 + Math.cos(fa) * 8, H(bx0, bz0 + 44) + 2 + Math.sin(fa) * 8 * Math.cos(0.4), bz0 + 44 + Math.sin(fa) * 8 * Math.sin(0.4)); fd.lookAt(bx0, H(bx0, bz0 + 44) + 2, bz0 + 44); fd.rotateX(PI / 2); fd.updateMatrix(); fang.setMatrixAt(fn, fd.matrix); }
    scene.add(fang); ctx.solid({ x: bx0 - 9, z: bz0 + 44, r: 1.8 }); ctx.solid({ x: bx0 + 9, z: bz0 + 44, r: 1.8 });

    // a thumper: a spring-loaded stake, beating out a call to the worms
    var tx = -16, tz = -54, ty = H(tx, tz), thump = new THREE.Group(); thump.position.set(tx, ty, tz); scene.add(thump);
    var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.6, 10), new THREE.MeshStandardMaterial({ color: '#4A3A2A', metalness: 0.6, roughness: 0.5 })); pole.position.y = 0.8; thump.add(pole);
    var hammer = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.4, 14), new THREE.MeshStandardMaterial({ color: '#8C7A5A', metalness: 0.8, roughness: 0.35 })); hammer.position.y = 1.3; thump.add(hammer);
    for (var fl = 0; fl < 3; fl++) { var flag = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.5), new THREE.MeshStandardMaterial({ map: X.cloak, color: '#C0402A', side: THREE.DoubleSide, alphaTest: 0.4 })); flag.position.set(0.2, 1.4 - fl * 0.02, 0); flag.rotation.y = fl * 2.1; thump.add(flag); }
    W.thumper = { hammer: hammer, x: tx, z: tz, y: ty, next: 0 }; ctx.solid({ x: tx, z: tz, r: 0.4 });

    // the spice field: rust-red sand and spice glittering up off it
    var spx = 40, spz = -88, spiceT = ctx.textures.canvas(256, 256, function (g, w, h) { var gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(176,58,18,0.7)'); gr.addColorStop(0.6, 'rgba(196,84,28,0.35)'); gr.addColorStop(1, 'rgba(196,84,28,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); noiseCanvas(g, w, h, 1500, 0.1, 0.3, 'rgba(255,150,60,', 'rgba(90,20,6,'); });
    for (var pf = 0; pf < 5; pf++) {
      var px = spx + (pf - 2) * 9 + Math.sin(pf * 2.3) * 5, pz = spz + Math.cos(pf * 1.7) * 8, size = 16 + pf * 2;
      var pgm = new THREE.PlaneGeometry(size, size, 16, 16); pgm.rotateX(-PI / 2); var pp = pgm.attributes.position; for (var v = 0; v < pp.count; v++) pp.setY(v, H(px + pp.getX(v), pz + pp.getZ(v)) + 0.06);
      var patch = new THREE.Mesh(pgm, new THREE.MeshStandardMaterial({ map: spiceT, transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 })); patch.position.set(px, 0, pz); scene.add(patch);
    }
    var moteT = ctx.textures.canvas(32, 32, function (g, w, h) { var gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(255,190,110,1)'); gr.addColorStop(1, 'rgba(255,140,50,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
    var MN = hi ? 160 : 60, motes = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.12, 0.12), new THREE.MeshBasicMaterial({ map: moteT, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: new THREE.Color(2, 1.3, 0.6) }), MN);
    motes.frustumCulled = false; scene.add(motes);
    W.spice = { mesh: motes, list: [] };
    for (var mn = 0; mn < MN; mn++) W.spice.list.push({ x: spx + (Math.random() - 0.5) * 50, z: spz + (Math.random() - 0.5) * 30, t: Math.random() * 6, v: 0.3 + Math.random() * 0.6 });
  }

  /* ------------------------------------------------------- the world -- */
  var SUN = { x: -0.62, y: 0.2, z: -0.78 };
  var W = { sand: [], crescent: null, moon: null, sun: null, thumper: null, spice: null, audio: null };
  function build(ctx) {
    var THREE = ctx.THREE, scene = ctx.scene, hi = ctx.quality !== 'low';
    var sd = new THREE.Vector3(SUN.x, SUN.y, SUN.z).normalize();
    // the eclipse sky: rust overhead, burning orange at the horizon
    ctx.sky({ top: '#7A2C12', horizon: '#E47A36', bottom: '#C86E3A', sun: [sd.x, sd.y, sd.z], sunColor: '#FFB46A', sunSize: 0.3, glow: 0.7, sunPower: 0.4, haze: 1, curve: 0.85 });
    scene.fog = new THREE.FogExp2('#D47E44', 0.0052);
    scene.add(new THREE.HemisphereLight('#F7AC6E', '#7E4424', 1.05));
    var sun = new THREE.DirectionalLight('#FFB476', 2.9); sun.position.copy(sd).multiplyScalar(220); sun.castShadow = true; scene.add(sun); scene.add(sun.target); W.sun = sun;
    // a soft light from the camera's side, so a face turned to it reads against the glare
    var fill = new THREE.DirectionalLight('#FFDDBA', 0.55); scene.add(fill); scene.add(fill.target); W.fill = fill;

    // the eclipse: a burning crescent, and the second moon, pale, higher up
    var cres = ctx.textures.canvas(512, 512, function (g, w, h) {
      var gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(255,220,150,0.55)'); gr.addColorStop(0.35, 'rgba(255,170,80,0.18)'); gr.addColorStop(1, 'rgba(255,120,40,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.save(); g.beginPath(); g.arc(w / 2, h / 2, 70, 0, TAU); g.fillStyle = '#FFF4D8'; g.shadowColor = '#FFD890'; g.shadowBlur = 40; g.fill(); g.restore();
      // the moon across the sun: cut clean out (an opaque fill erases fully)
      g.globalCompositeOperation = 'destination-out'; g.fillStyle = '#000'; g.beginPath(); g.arc(w / 2 - 30, h / 2 + 12, 66, 0, TAU); g.fill();
      g.globalCompositeOperation = 'source-over';
    });
    W.crescent = new THREE.Mesh(new THREE.PlaneGeometry(150, 150), new THREE.MeshBasicMaterial({ map: cres, transparent: true, depthWrite: false, fog: false, toneMapped: false, color: new THREE.Color(2.2, 1.8, 1.35) }));
    W.crescent.frustumCulled = false; W.crescent.renderOrder = -900; scene.add(W.crescent);
    var moonT = ctx.textures.canvas(128, 128, function (g, w, h) { g.beginPath(); g.arc(w / 2, h / 2, 40, 0, TAU); g.fillStyle = 'rgba(255,226,196,0.55)'; g.fill(); g.globalCompositeOperation = 'destination-out'; g.fillStyle = '#000'; g.beginPath(); g.arc(w / 2 + 16, h / 2 - 8, 38, 0, TAU); g.fill(); });
    W.moon = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshBasicMaterial({ map: moonT, transparent: true, depthWrite: false, fog: false, color: new THREE.Color(1.1, 0.9, 0.75) }));
    W.moon.frustumCulled = false; W.moon.renderOrder = -899; scene.add(W.moon);

    // the ground: cinematic sand. Fine and smooth at a distance, long clean gradients, crests
    // lighter and slip faces deeper; wind ripples at two scales that curve across the dunes
    // and fade on the steep faces and into the distance; grain up close; a glint here and there
    var sandMat = new THREE.MeshStandardMaterial({ color: '#E4B58C', roughness: 0.93, metalness: 0, vertexColors: true });
    sandMat.onBeforeCompile = function (sh) {
      sh.uniforms.uWind = { value: new THREE.Vector2(1, 0.14).normalize() };
      sh.uniforms.uSun = { value: sd.clone() };
      sh.vertexShader = 'varying vec3 vSandP; varying vec3 vSandN;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vSandP = (modelMatrix * vec4(position, 1.0)).xyz; vSandN = normalize(mat3(modelMatrix) * normal);');
      sh.fragmentShader = [
        'uniform vec2 uWind; uniform vec3 uSun; varying vec3 vSandP; varying vec3 vSandN;',
        'float sHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }',
        'float sNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(sHash(i), sHash(i + vec2(1, 0)), f.x), mix(sHash(i + vec2(0, 1)), sHash(i + vec2(1, 1)), f.x), f.y); }',
        // ripple slope along the wind: a long gentle stoss, a short steep lee
        'float sRip(float ph) { float s = sin(ph), c = cos(ph); return c + 0.32 * cos(2.0 * ph) + 0.1 * cos(3.0 * ph); }',
      ].join('\n') + '\n' + sh.fragmentShader
        .replace('#include <color_fragment>', [
          '#include <color_fragment>',
          'vec2 sP = vSandP.xz; float sD = length(vSandP - cameraPosition);',
          'float sSlope = 1.0 - clamp(vSandN.y, 0.0, 1.0);',
          // broad, soft variation in the sand's colour, and a fine grain that fades with distance
          'float sBig = sNoise(sP * 0.012) * 0.6 + sNoise(sP * 0.045) * 0.4;',
          'diffuseColor.rgb *= mix(vec3(0.93, 0.9, 0.86), vec3(1.05, 1.03, 1.0), sBig);',
          'float sGrain = (sHash(floor(sP * 90.0)) - 0.5) * (1.0 - smoothstep(4.0, 16.0, sD));',
          'diffuseColor.rgb *= 1.0 + sGrain * 0.09;',
          // the lee of the dunes a touch deeper and warmer
          'diffuseColor.rgb *= mix(vec3(1.0), vec3(0.9, 0.82, 0.74), smoothstep(0.25, 0.6, sSlope) * step(0.0, vSandN.x));',
        ].join('\n'))
        .replace('#include <normal_fragment_maps>', [
          '#include <normal_fragment_maps>',
          '{',
          '  vec2 sQ = vSandP.xz; float sDist = length(vSandP - cameraPosition);',
          '  float sWarp = sin(sQ.y * 0.31 + sin(sQ.x * 0.09) * 2.2) * 1.6 + sin(sQ.y * 0.83 + sQ.x * 0.17) * 0.45 + sNoise(sQ * 0.2) * 1.4;',
          '  float sFlat = 1.0 - smoothstep(0.18, 0.5, 1.0 - clamp(vSandN.y, 0.0, 1.0));',
          '  float f1 = 1.0 - smoothstep(14.0, 70.0, sDist), f2 = 1.0 - smoothstep(4.0, 20.0, sDist);',
          '  vec2 w2 = normalize(uWind + vec2(0.0, 0.18));',
          // the wavelength wanders a little, so the ripples never read as stripes
          '  float sLam = 1.0 + 0.18 * sNoise(sQ * 0.07);',
          '  vec2 g = uWind * sRip(dot(sQ, uWind) * 6.3 * sLam + sWarp) * 6.3 * 0.017 * f1 * (0.7 + 0.6 * sNoise(sQ * 0.05 + 3.0))',
          '         + w2 * sRip(dot(sQ, w2) * 19.0 + sWarp * 2.7) * 19.0 * 0.0036 * f2;',
          '  g *= sFlat;',
          '  vec3 dv = (viewMatrix * vec4(-g.x, 0.0, -g.y, 0.0)).xyz;',
          '  normal = normalize(normal + dv);',
          '}',
        ].join('\n'))
        .replace('#include <emissivemap_fragment>', [
          '#include <emissivemap_fragment>',
          // grains catching the low sun: rare points that twinkle as you move
          '{ vec2 sC = floor(vSandP.xz * 38.0); float sSp = step(0.9988, sHash(sC + floor(cameraPosition.xz * 2.0)));',
          '  vec3 sV = normalize(cameraPosition - vSandP); float sGl = pow(max(dot(normalize(sV + uSun), vSandN), 0.0), 6.0);',
          '  totalEmissiveRadiance += vec3(1.0, 0.82, 0.55) * sSp * sGl * 0.9 * (1.0 - smoothstep(2.5, 10.0, length(vSandP - cameraPosition))); }',
        ].join('\n'));
    };
    sandMat.customProgramCacheKey = function () { return 'mogdune-sand'; };
    var N = hi ? 330 : 160, S = 2 * (B + 70);
    var g = new THREE.PlaneGeometry(S, S, N, N); g.rotateX(-PI / 2);
    var gp = g.attributes.position, cols = new Float32Array(gp.count * 3);
    for (var i = 0; i < gp.count; i++) {
      var x = gp.getX(i), z = gp.getZ(i), y = H(x, z); gp.setY(i, y);
      var hl = clamp((y - 1) / 14, 0, 1), c = 0.86 + hl * 0.2;
      cols[i * 3] = c; cols[i * 3 + 1] = c * (0.95 + hl * 0.03); cols[i * 3 + 2] = c * (0.9 + hl * 0.05);
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3)); g.computeVertexNormals();
    var ground = new THREE.Mesh(g, sandMat); ground.receiveShadow = true; ground.castShadow = true; scene.add(ground);
    // the dunes beyond, bigger, to the haze
    var fg = new THREE.RingGeometry(S * 0.48, 2200, 96, 24); fg.rotateX(-PI / 2);
    var fp = fg.attributes.position;
    for (i = 0; i < fp.count; i++) { var fx = fp.getX(i), fz = fp.getZ(i), r = Math.hypot(fx, fz), edge = smooth((r - S * 0.48) / 120); fp.setY(i, dunes(fx, fz) * (1 - edge) + (dunes(fx * 0.4, fz * 0.4) * 2.6 - 4) * edge); }
    fg.computeVertexNormals();
    var farM = sandMat.clone ? sandMat : sandMat; var far = new THREE.Mesh(fg, farM); scene.add(far);

    // blowing sand: streaks of grit skating over the crests, round the camera
    var gritT = ctx.textures.canvas(64, 16, function (g2, w, h) { var gr = g2.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, 'rgba(255,214,160,0)'); gr.addColorStop(0.5, 'rgba(255,214,160,0.7)'); gr.addColorStop(1, 'rgba(255,214,160,0)'); g2.fillStyle = gr; g2.fillRect(0, h * 0.35, w, h * 0.3); });
    var gritM = new THREE.MeshBasicMaterial({ map: gritT, transparent: true, depthWrite: false, opacity: 0.3, color: '#FFD2A0', side: THREE.DoubleSide });
    var GN = hi ? 300 : 120, grit = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.9, 0.06), gritM, GN); grit.frustumCulled = false; scene.add(grit);
    for (i = 0; i < GN; i++) W.sand.push({ x: (Math.random() - 0.5) * 80, z: (Math.random() - 0.5) * 80, y: Math.random() * 1.6, v: 6 + Math.random() * 7, s: 0.6 + Math.random() * 1.2 });
    W.grit = grit; W.dummy = new THREE.Object3D();

    // spindrift: sand streaming off the crests in the wind, the films' signature
    var driftT = ctx.textures.canvas(128, 64, function (g2, w, h) {
      for (var k = 0; k < 26; k++) { var x = 10 + Math.random() * 100, y = 18 + Math.random() * 28, gr = g2.createRadialGradient(x, y, 0, x, y, 10 + Math.random() * 20); gr.addColorStop(0, 'rgba(255,255,255,0.22)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g2.fillStyle = gr; g2.fillRect(0, 0, w, h); }
    });
    // a haze of sand, not light: plain blending in the sand's own colour, each wisp fading by itself
    var DN = hi ? 120 : 45, driftG = new THREE.PlaneGeometry(1, 1), driftA = new THREE.InstancedBufferAttribute(new Float32Array(DN), 1);
    driftG.setAttribute('aFade', driftA);
    var driftM = new THREE.ShaderMaterial({ uniforms: { uMap: { value: driftT }, uCol: { value: new THREE.Color('#E8B88A') } }, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
      vertexShader: 'attribute float aFade; varying float vF; varying vec2 vUv; void main() { vF = aFade; vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform sampler2D uMap; uniform vec3 uCol; varying float vF; varying vec2 vUv; void main() { float a = texture2D(uMap, vUv).a * vF; if (a < 0.003) discard; gl_FragColor = vec4(uCol, a); }' });
    var drift = new THREE.InstancedMesh(driftG, driftM, DN); drift.frustumCulled = false; scene.add(drift);
    W.drift = { mesh: drift, fade: driftA, list: [] };
    for (i = 0; i < DN; i++) W.drift.list.push({ age: Math.random() * 2, life: 0.1, x: 0, y: -99, z: 0, vx: 0, vy: 0, s: 1 });

    landmarks(ctx);
  }

  function thud(ctx, gain) {
    var A = W.audio; if (!A || !A.context || gain < 0.004) return;
    var ac = A.context, o = ac.createOscillator(), g = ac.createGain(), t0 = ac.currentTime;
    o.type = 'sine'; o.frequency.setValueAtTime(70, t0); o.frequency.exponentialRampToValueAtTime(38, t0 + 0.25);
    g.gain.setValueAtTime(gain, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.4);
    o.connect(g); g.connect(A.destination); o.start(t0); o.stop(t0 + 0.45);
  }
  function update(ctx, t, dt) {
    var cam = ctx.camera; if (!cam) return;
    var THREE = ctx.THREE, sd = W.sd || (W.sd = new THREE.Vector3(SUN.x, SUN.y, SUN.z).normalize());
    if (W.crescent) { W.crescent.position.copy(cam.position).addScaledVector(sd, 900); W.crescent.lookAt(cam.position); }
    if (W.moon) { W.moon.position.copy(cam.position).add(W.md || (W.md = new THREE.Vector3(0.35, 0.62, -0.7).normalize().multiplyScalar(920))); W.moon.lookAt(cam.position); }
    // the sun's shadow follows the action
    if (W.sun) { W.sun.target.position.set(cam.position.x, 0, cam.position.z); W.sun.position.copy(W.sun.target.position).addScaledVector(sd, 160); }
    if (W.fill) { cam.getWorldDirection(W.fdir || (W.fdir = new THREE.Vector3())); W.fill.position.copy(cam.position); W.fill.position.y += 1.5; W.fill.target.position.copy(cam.position).addScaledVector(W.fdir, 6); }
    var d = W.dummy, i;
    if (W.grit) {
      for (i = 0; i < W.sand.length; i++) {
        var q = W.sand[i];
        q.x += q.v * dt;
        var rx = q.x - cam.position.x, rz = q.z - cam.position.z;
        if (rx > 40) q.x -= 80; else if (rx < -40) q.x += 80;
        if (rz > 40) q.z -= 80; else if (rz < -40) q.z += 80;
        d.position.set(q.x, H(q.x, q.z) + 0.05 + q.y * (0.3 + 0.7 * Math.abs(Math.sin(t * 0.7 + i))), q.z); d.rotation.set(0, 0, Math.sin(t * 3 + i) * 0.05); d.scale.set(q.s, 1, 1); d.updateMatrix();
        W.grit.setMatrixAt(i, d.matrix);
      }
      W.grit.instanceMatrix.needsUpdate = true;
    }
    // spindrift: respawned along the crests near the camera, streaming downwind and fading
    if (W.drift) {
      var DR = W.drift, cc = new THREE.Color();
      for (i = 0; i < DR.list.length; i++) {
        var pd = DR.list[i]; pd.age += dt;
        if (pd.age > pd.life) {
          var zz = cam.position.z + (Math.random() - 0.5) * 80, Sz = Math.sin(zz * 0.017) * 0.9 + Math.sin(zz * 0.0061 + 1.7) * 1.4;
          var n0 = Math.round((cam.position.x + (Math.random() - 0.5) * 70) * 0.021 + Sz - 0.72), xx = (n0 + 0.72 - Sz) / 0.021;
          pd.x = xx; pd.z = zz; pd.y = H(xx, zz) + 0.02; pd.age = 0; pd.life = 1.4 + Math.random() * 1.4; pd.vx = 3 + Math.random() * 3.5; pd.vy = 0.05 + Math.random() * 0.15; pd.s = 0.5 + Math.random() * 0.6;
          // only off a real crest: high enough above the trough
          if (H(xx, zz) - H(xx - 10, zz) < 1.5) pd.age = pd.life;
        }
        pd.x += pd.vx * dt; pd.y += pd.vy * dt; pd.z += pd.vx * 0.14 * dt;
        var lifeK = pd.age / pd.life, fadeK = Math.sin(Math.min(1, lifeK) * PI) * (Math.hypot(pd.x - cam.position.x, pd.z - cam.position.z) < 70 ? 1 : 0);
        d.position.set(pd.x, pd.y, pd.z); d.quaternion.copy(cam.quaternion); d.scale.set(pd.s * (2 + lifeK * 4.5), pd.s * (0.3 + lifeK * 0.6), 1); d.updateMatrix();
        DR.mesh.setMatrixAt(i, d.matrix); DR.fade.setX(i, fadeK * 0.55);
      }
      DR.mesh.instanceMatrix.needsUpdate = true; DR.fade.needsUpdate = true; void cc;
    }
    // the thumper beats, and you hear it across the sand
    var T2 = W.thumper;
    if (T2) {
      var beat = (t % 1.4) / 1.4; T2.hammer.position.y = 1.3 - Math.max(0, 1 - beat * 8) * 0.55 + (beat > 0.6 ? (beat - 0.6) * 0.3 : 0);
      if (t >= T2.next) { T2.next = t - (t % 1.4) + 1.4; var dist = Math.hypot(cam.position.x - T2.x, cam.position.z - T2.z); thud(ctx, 0.22 * Math.exp(-dist / 45)); }
    }
    // spice glitters up off the field
    if (W.spice) {
      var sp = W.spice;
      for (i = 0; i < sp.list.length; i++) { var m = sp.list[i]; m.t += dt * m.v; if (m.t > 6) m.t = 0; d.position.set(m.x + Math.sin(m.t * 1.3 + i) * 0.4, H(m.x, m.z) + m.t * 0.45, m.z + Math.cos(m.t + i) * 0.4); d.rotation.set(0, 0, 0); d.lookAt(cam.position); var k = Math.sin(m.t / 6 * PI); d.scale.setScalar(0.3 + k); d.updateMatrix(); sp.mesh.setMatrixAt(i, d.matrix); }
      sp.mesh.instanceMatrix.needsUpdate = true;
    }
  }
  // the desert's own sound: wind in gusts, the hiss of moving sand
  function ambient(ctx) {
    var A = ctx.audio; if (!A || !A.context) return; W.audio = A;
    var ac = A.context, len = ac.sampleRate * 2, buf = ac.createBuffer(1, len, ac.sampleRate), ch = buf.getChannelData(0);
    for (var i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
    function bed(freq, q, gain, lfo) {
      var src = ac.createBufferSource(); src.buffer = buf; src.loop = true;
      var f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
      var g = ac.createGain(); g.gain.value = gain;
      var o = ac.createOscillator(), og = ac.createGain(); o.frequency.value = lfo; og.gain.value = gain * 0.7; o.connect(og); og.connect(g.gain); o.start();
      src.connect(f); f.connect(g); g.connect(A.destination); src.start();
    }
    bed(380, 0.7, 0.05, 0.11); bed(1900, 0.9, 0.012, 0.23); bed(120, 0.5, 0.03, 0.07);
  }

  /* ------------------------------------------------ the opening -- */
  // Muse on the crest with the eclipse behind him; the Harkonnen coming over
  // the next dune; the title. Heights from the dunes themselves.
  var SPX = 0, SPZ = 34, SPY = H(SPX, SPZ), SDX = -0.62, SDZ = -0.78;
  function at(x, z, up) { return [x, H(x, z) + up, z]; }
  var INTRO = [
    { t: 7, fade: 'in', place: 'ARRAKIS', time: 'THE DEEP DESERT · THE LONG ECLIPSE',
      cam: { from: at(60, 120, 34), to: at(26, 82, 20), look: [SPX - 40, SPY + 6, SPZ - 60], lookTo: [SPX, SPY + 2, SPZ], fov: 50, fovTo: 42 },
      cast: [{ id: 'og', at: [SPX, SPZ], face: [SPX - SDX * 10, SPZ - SDZ * 10], stance: 'shift' }] },
    { t: 7, say: 'Sand to the edge of the world, and a sun the moon has swallowed.',
      cam: { from: [SPX - SDX * 3.6 + 0.6, SPY + 0.35, SPZ - SDZ * 3.6], to: [SPX - SDX * 2.8 + 0.4, SPY + 0.45, SPZ - SDZ * 2.8], look: [SPX, SPY + 0.95, SPZ], fov: 40, fovTo: 34 },
      cast: [{ id: 'og', at: [SPX, SPZ], face: 'cam', stance: 'shift' }] },
    { t: 6, say: 'The Harkonnen came for the spice. Now they hunt anything that walks the deep desert.',
      cam: { from: [SPX + 1.4, SPY + 1.5, SPZ + 3.2], to: [SPX + 1.0, SPY + 1.4, SPZ + 2.6], look: [SPX - 2, SPY + 1.2, SPZ - 18], fov: 46 },
      cast: [
        { id: 'og', at: [SPX, SPZ], face: [SPX - 2, SPZ - 18], stance: 'shift' },
        { id: 'h1', kind: 'thug', at: [SPX - 6, SPZ - 26], path: [[SPX - 4, SPZ - 14], [SPX - 2.4, SPZ - 6]], speed: 1.6, stance: 'fight' },
        { id: 'h2', kind: 'thug', at: [SPX + 3, SPZ - 28], path: [[SPX + 2, SPZ - 15], [SPX + 1.6, SPZ - 6.5]], speed: 1.7, stance: 'fight' },
        { id: 'h3', kind: 'thug', at: [SPX - 12, SPZ - 24], path: [[SPX - 8, SPZ - 13], [SPX - 4.2, SPZ - 5.4]], speed: 1.5, stance: 'fight' }] },
    { t: 6, say: 'And under the sand, something vast has heard them coming.',
      cam: { from: [SPX + 2.4, SPY + 1.0, SPZ + 4.5], to: [SPX + 2.2, SPY + 1.3, SPZ + 4.0], look: [SPX + 8, SPY + 3.5, SPZ - 26], lookTo: [SPX + 9, SPY + 4.5, SPZ - 28], fov: 34, fovTo: 28 },
      cast: [
        { id: 'og', at: [SPX, SPZ], face: [SPX - 2, SPZ - 18], stance: 'fight' },
        { id: 'h1', at: [SPX - 2.4, SPZ - 6], face: 'og', stance: 'fight' },
        { id: 'h2', at: [SPX + 1.6, SPZ - 6.5], face: 'og', stance: 'fight' },
        { id: 'h3', at: [SPX - 4.2, SPZ - 5.4], face: 'og', stance: 'fight' },
        { id: 'worm', kind: 'boss', at: [SPX + 9, SPZ - 24], face: 'og', stance: 'fight' }] },
    // Muse turns to us, and behind him the worm rears out of the dune (the key art is shot here)
    { t: 4.5,
      cam: { from: [SPX - SDX * 2.7 + 0.78 * 0.5, SPY + 0.5, SPZ - SDZ * 2.7 - 0.62 * 0.5], to: [SPX - SDX * 2.4 + 0.78 * 0.45, SPY + 0.52, SPZ - SDZ * 2.4 - 0.62 * 0.45], look: [SPX + 0.78 * 0.95, SPY + 1.05, SPZ - 0.62 * 0.95], fov: 46, fovTo: 43 },
      cast: [
        { id: 'og', at: [SPX, SPZ], face: 'cam', stance: 'fight' },
        { id: 'worm', at: [SPX + SDX * 20 + 0.78 * 8, SPZ + SDZ * 20 - 0.62 * 8], face: 'og', stance: 'fight' }] },
    { t: 4.5, say: '“Then let them hunt.”',
      cam: { from: [SPX + 0.9, SPY + 0.6, SPZ - 2.2], to: [SPX + 0.8, SPY + 0.55, SPZ - 1.9], look: [SPX, SPY + 0.85, SPZ], fov: 36 },
      cast: [
        { id: 'og', at: [SPX, SPZ], face: [SPX, SPZ - 10], stance: 'fight' },
        { id: 'h1', at: [SPX - 2.4, SPZ - 6], face: 'og', stance: 'fight', stay: true },
        { id: 'h2', at: [SPX + 1.6, SPZ - 6.5], face: 'og', stance: 'fight', stay: true },
        { id: 'h3', at: [SPX - 4.2, SPZ - 5.4], face: 'og', stance: 'fight', stay: true }] },
    { t: 6, fade: 'out', title: 'MOGDUNE', tagline: 'Explore the deep desert. Take down Harkonnen, Sardaukar and the things that live under the sand. Survive the eclipse.',
      cam: { from: [SPX + 3, SPY + 2.2, SPZ + 5], to: [SPX + 10, SPY + 12, SPZ + 22], look: [SPX - 1, SPY + 1, SPZ - 6], fov: 46 } },
  ];

  GameMog.world({
    assets: ['human-athlete-male', 'human-athlete-female', 'texture-sand', 'texture-rock', 'texture-corrugated-metal', 'model-boulder', 'model-coastal-cliff'],
    theme: { sky: '#CF6A30', fog: '#CF6A30', ink: '#2A1206', accent: '#FFB04A', font: 'Oxanium' },
    graphics: { preset: 'golden', environment: true, bloom: { strength: 0.55, threshold: 1.05, radius: 0.75 }, grade: { contrast: 1.1, saturation: 1.04, warmth: 0.32, vignette: 0.36, split: 0.22, grain: 0.024 }, shadows: { extent: 40, mapSize: 2048 } },
    camera: { distance: 4.4, height: 1.25, fov: 52 },
    open: {
      bounds: { x: [-B, B], z: [-B, B] },
      ground: H,
      spawn: [SPX, SPZ, 180],
      coins: false, weapons: false, civilians: 0, maxEnemies: 12,
      hero: { weapon: 'staff' },
      health: 120,
      heat: { every: 45, say: ['The sand comes alive', 'Sardaukar drop from the sky', 'Harkonnen reinforcements', 'The storm is rising', 'Worm sign. Worm sign!', 'The deep desert wakes'] },
      words: { kos: 'Takedowns', kod: 'taken down', health: 'Water', down: 'Fallen', by: ' brought you down.', won: 'Arrakis won.' },
      hud: { banner: 'Explore the deep desert. Survive.' },
      intro: { shots: INTRO },
      // the thumbnail: Muse on the crest, the eclipse behind him, the Harkonnen closing in
      keyArt: { at: [SPX, SPZ], look: -141.5, tilt: 0.06 },
      crew: {
        thug: { names: ['Harkonnen trooper'], hp: 3, damage: 7, speed: 4, moves: ['slash1', 'slash2', 'slash3'], look: harkonnen },
        biker: { names: ['Sandtrout', 'Desert stalker'], hp: 4, damage: 9, speed: 4.6, reach: 1.6, moves: ['bite', 'claw', 'lunge'], body: deepSand,
          ranged: { every: 4.5, range: 11, speed: 13, damage: 6, size: 0.24, color: '#E2A45E' } },
        cop: { names: ['Sardaukar'], hp: 6, damage: 11, speed: 4.3, moves: ['slash1', 'slash3'], look: sardaukar,
          ranged: { every: 2.8, range: 22, speed: 32, damage: 9, size: 0.12, color: '#9FDCFF' } },
        boss: { names: ['Shai-Hulud', 'Spice wraith'], hp: 28, damage: 20, speed: 5.2, reach: 2.6, windup: 0.9, moves: ['strike', 'lunge', 'strike'], body: bossBody,
          ranged: { every: 4, range: 24, speed: 18, damage: 14, size: 0.42, color: '#B86E34' } },
      },
    },
    build: build,
    update: update,
    ambient: ambient,
    player: function (ctx) { return muse(ctx); },
  });
})();
