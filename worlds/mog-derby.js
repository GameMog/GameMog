// Mog Derby: an official Open World on wheels (the owner, 1 Oct 2026: "Twisted
// ... main character car is attached", renamed Mog Derby, a car combat arena, an
// original mascot). Saturday night at the Mog County Fair: Dottie drives Scoops,
// her late grandpa's ice-cream truck, into the fair's demolition derby, because
// the bank wants 10,000 GM for the truck by midnight. The derby pays GM for
// every spin and every wreck. The truck is white with pink polka dots, a cone on
// its flank, guns on its roof and a grinning soft-serve on a spring (the car
// kit's van, armed, topper: 'swirl'). The runtime's derby mode (lib/runtime/
// derby.js) drives it; its rules follow drcollect/demolition-derby (MIT, Patrick
// Hable): spins of 90, 180 and 360 degrees and wrecks pay, damage lands by zone.
// No car model, name or likeness from any game is used; every name is invented.
(function () {
  var PI = Math.PI, TAU = PI * 2;
  var RX = 54, RZ = 38;                         // the arena floor, inside its wall
  var GATES = [0, PI / 2, PI, PI * 1.5];        // where the crews drive in, as angles round the ellipse
  function ell(a, k) { return { x: Math.cos(a) * (RX + k), z: Math.sin(a) * (RZ + k) }; }
  function tangentYaw(a) { var tx = -Math.sin(a) * RX, tz = Math.cos(a) * RZ; return Math.atan2(tx, tz); }
  function nearGate(a, w) { for (var i = 0; i < GATES.length; i++) { var d = Math.abs(Math.atan2(Math.sin(a - GATES[i]), Math.cos(a - GATES[i]))); if (d < w) return true; } return false; }
  function pick(list, i) { return list[((i % list.length) + list.length) % list.length]; }
  var crowdMats = [], wheelSpin = null;

  GameMog.world({
    assets: ['sky-night', 'texture-forest-floor', 'texture-grass', 'texture-concrete', 'texture-planks', 'texture-corrugated-metal', 'model-concrete-barrier'],
    theme: { sky: '#0E1428', fog: '#141A2C', ink: '#FFFFFF', accent: '#F0468C', font: 'Oxanium' },
    graphics: { exposure: 1.0, environment: true, bloom: { strength: 0.42, threshold: 1.25, radius: 0.45 }, grade: { contrast: 1.08, saturation: 1.1, warmth: 0.12, vignette: 0.26, split: 0.3 }, reflections: true, motion: 0.3 },
    camera: { distance: 9.5, height: 3.0, fov: 58 },
    open: {
      // the derby: an ellipse of concrete, four gates, your guns, and what spins and wrecks pay
      vehicle: {
        arena: { x: 0, z: 0, rx: RX, rz: RZ },
        gates: GATES.map(function (a) { var p = ell(a, -6); return [p.x, p.z]; }),
        guns: true, armor: 0.55,
        gm: { spin90: 30, spin180: 60, spin360: 150, wreck: 150 },
      },
      bounds: { x: [-RX - 26, RX + 26], z: [-RZ - 26, RZ + 26] },
      spawn: [-14, 4, 90],
      heat: { every: 45, say: ['Hot rods roll in', 'The sheriff wants you off the floor', 'The crowd wants wrecks', 'Nobody is holding back now'] },
      health: 100, maxEnemies: 6, civilians: 0, weapons: false,
      hud: { gm: 'Truck fund', banner: 'Win 10,000 GM to save the truck.' },
      keyArt: { at: [-6, 6], look: 215, tilt: 0.1 },
      goal: { gm: 10000, title: 'Paid in full', text: 'Ten thousand GM by midnight. The bank gets its money, and Scoops stays on the road.' },
      // the opening: the fair at dusk, the truck, the derby rolling in, the mascot's grin
      intro: {
        shots: [
          { t: 6, fade: 'in', place: 'MOG COUNTY FAIR', time: 'SATURDAY  ·  8:40 PM',
            cam: { from: [-96, 34, -74], to: [-78, 27, -60], look: [0, 2, 0], lookTo: [-8, 1, 4], fov: 46, fovTo: 42 },
            cast: [{ id: 'og', at: [-36, 6], face: 90 }] },
          { t: 6.5, say: 'Scoops was Grandpa’s ice-cream truck. Now it is all Dottie has, and the bank wants 10,000 GM for it by midnight.',
            cam: { from: [-29.5, 1.5, 11.5], to: [-30.5, 1.7, 10.2], look: [-36, 2.4, 6], fov: 40, fovTo: 36 },
            cast: [{ id: 'og', at: [-36, 6], face: 90 }] },
          { t: 6.5, say: 'The Mog Derby pays GM for every spin and every wreck.',
            cam: { from: [4, 1.3, 15], to: [1, 1.5, 11], look: [-8, 1.2, 2], lookTo: [-12, 1.3, 3], fov: 50 },
            cast: [
              { id: 'og', at: [-36, 6], path: [[-26, 5], [-16, 4]], speed: 7 },
              { id: 'd1', kind: 'thug', at: [48, 1], path: [[32, 3], [16, 6], [6, 8]], speed: 11, stay: true },
              { id: 'd2', kind: 'thug', at: [1, 32], path: [[1, 20], [-3, 12]], speed: 8, stay: true },
              { id: 'd3', kind: 'thug', at: [-1, -32], path: [[-2, -20], [-7, -10]], speed: 9, stay: true }] },
          { t: 5, say: 'Dottie: “Sprinkles are free. Everything else costs.”',
            cam: { from: [-12.5, 4.15, 4.45], to: [-12.75, 4.12, 4.3], look: [-14.6, 3.98, 4.0], fov: 32, fovTo: 29 },
            cast: [{ id: 'og', at: [-16, 4], face: 90 }] },
          { t: 6, fade: 'out', title: 'MOG DERBY', tagline: 'Spin them. Wreck them. Win 10,000 GM before the bank takes the truck.',
            cam: { from: [-30, 9, 22], to: [-38, 16, 34], look: [-10, 1.5, 2], fov: 50 },
            cast: [{ id: 'og', at: [-16, 4], face: 90 }] },
        ],
      },
      // the close: midnight, the truck in the middle of the floor, the grin
      outro: {
        shots: [
          { t: 5, fade: 'in', place: '10,000 GM', time: 'MIDNIGHT  ·  MOG COUNTY FAIR',
            cam: { from: [14, 3.2, 11], to: [12, 4, -9], look: [0, 1.8, 0], fov: 44 },
            cast: [{ id: 'og', at: [0, 0], face: 0 }] },
          { t: 6, say: 'Paid in full. Grandpa’s truck stays on the road.',
            cam: { from: [0.35, 4.12, 1.45], to: [0.2, 4.1, 1.25], look: [0, 3.97, -0.6], fov: 31, fovTo: 28 },
            cast: [{ id: 'og', at: [0, 0], face: 0 }] },
          { t: 6, fade: 'out', title: 'PAID IN FULL', tagline: 'Ten thousand GM. Scoops rolls on.',
            cam: { from: [0, 6, 16], to: [0, 20, 42], look: [0, 1.5, 0], fov: 48 },
            cast: [{ id: 'og', at: [0, 0], face: 0 }] },
        ],
      },
      crew: {
        // the regulars: stock cars held together with tape, in whatever paint was cheapest
        thug: {
          gm: 110, hp: 3,
          names: ['Rust Bucket', 'Cousin Dale', 'Junk Jenny', 'Tater Tom', 'Boomer', 'Lug Nut Lou', 'Dented Dan', 'Hubcap Holly'],
          car: function (ctx, i, heat) {
            var paint = ['#C8102E', '#1F4E9C', '#F2B705', '#2E7D32', '#E65100', '#00838F', '#6A1B9A', '#8D6E63'];
            return { kind: 'stockcar', paint: pick(paint, i * 3), trim: pick(paint, i * 5 + 2), accent: '#FFFFFF', pattern: pick(['bands', 'stripes', 'arrow', 'plain', 'teeth'], i),
              number: String((i * 37) % 89 + 2), metallic: 0.2, glow: heat >= 5 ? pick(['#FF2A2A', '#2AE0FF', '#B8FF2A'], i) : undefined };
          },
        },
        // from heat 2: hot rods, light and quick, easy to spin
        biker: {
          gm: 140, hp: 3,
          names: ['Cherry Bomb', 'Greaser Gus', 'Flamejob Fran', 'Hot Rod Hank', 'Slick Vic'],
          car: function (ctx, i) {
            return { kind: 'roadster', paint: pick(['#7A0E14', '#101012', '#0B3D2E', '#2A1458'], i), trim: '#141416', accent: '#FFB21A', pattern: 'flames', chrome: i % 3 === 2, rims: '#D3D6DB', interior: '#5A2A1A' };
          },
        },
        // from heat 3: the sheriff's cruisers, lights going
        cop: {
          gm: 160, hp: 4,
          names: ['Deputy Pruitt', 'Deputy Haines', 'Sheriff Boone', 'Deputy Ortega', 'Deputy Kowal'],
          body: function (ctx, i) {
            var THREE = ctx.THREE;
            var c = ctx.assets.car({ kind: 'stockcar', paint: '#F4F4F2', trim: '#101216', accent: '#1D4ED8', pattern: 'split', number: String(11 + i * 7), numberInk: '#101216', livery: 'SHERIFF', name: 'Sheriff' });
            if (!c) return null;
            var red = new THREE.MeshBasicMaterial({ color: new THREE.Color('#FF2020').multiplyScalar(6) }), blue = new THREE.MeshBasicMaterial({ color: new THREE.Color('#2050FF').multiplyScalar(6) });
            var bar = new THREE.Group(), lr = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.1, 0.22), red), lb = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.1, 0.22), blue);
            lr.position.x = 0.27; lb.position.x = -0.27; bar.add(lr, lb, new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.06, 0.26), new THREE.MeshStandardMaterial({ color: '#16181C', roughness: 0.5 })));
            bar.position.set(0, (c.vehicle.height || 1.3) + 0.06, -0.3); c.object.add(bar);
            var anim = c.animate, ph = i * 0.37;
            c.animate = function (t, dt, s) { anim(t, dt, s); var on = Math.floor((t + ph) * 5) % 2 === 0, dead = s && s.wrecked; lr.visible = on && !dead; lb.visible = !on && !dead; };
            return c;
          },
        },
        // every third level of heat: a monster truck, with bottle rockets
        boss: {
          gm: 900, hp: 14,
          names: ['Big Tusk', 'The Countess', 'Iron Hog', 'Bone Rattler', 'Grandma Grit'],
          ranged: { every: 3.4, range: 26, speed: 24, damage: 11, size: 0.3, color: '#FF8A2A', keep: false },
          car: function (ctx, i) {
            return { kind: 'monster', paint: pick(['#1C1C20', '#5B0F14', '#123A1C', '#2B2F8C', '#4A3410'], i), trim: '#F2B705', accent: pick(['#E0401B', '#FF2A6A', '#FFD21A'], i), pattern: 'flames', spikes: true,
              livery: pick(['BIG TUSK', 'COUNTESS', 'IRON HOG', 'RATTLER', 'GRANDMA'], i), chrome: i % 4 === 3 };
          },
        },
      },
    },

    /* --------------------------------------------------------------- the place -- */
    build: function (ctx) {
      var THREE = ctx.THREE, scene = ctx.scene;
      ctx.sky({ hdri: 'sky-night', sun: [0.5, 0.6, -0.4], exposure: 0.1 });
      scene.fog = new THREE.Fog('#141A2C', 170, 640);

      // light: the floodlights, a key from the north-east tower, two spots crossing the floor,
      // and the dusk sky over it all
      var key = new THREE.DirectionalLight('#FFF0DA', 2.6); key.position.set(58, 74, -46); key.target.position.set(0, 0, 0);
      key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
      var sc = key.shadow.camera; sc.left = -72; sc.right = 72; sc.top = 60; sc.bottom = -60; sc.near = 10; sc.far = 260; key.shadow.bias = -0.0004; key.shadow.normalBias = 0.03;
      scene.add(key, key.target);
      scene.add(new THREE.HemisphereLight('#6A78A8', '#4A3424', 0.75));
      // the other three towers: fill from every corner, as floodlights light a floor (no shadows)
      [[-58, 74, -46], [-58, 74, 46], [58, 74, 46]].forEach(function (p) { var f = new THREE.DirectionalLight('#FFEBD0', 1.15); f.position.set(p[0], p[1], p[2]); scene.add(f); });
      [[-62, 30, 48], [62, 30, -48]].forEach(function (p) {
        var s = new THREE.SpotLight('#FFE6C4', 2.4, 170, 0.62, 0.55, 1); s.position.set(p[0], p[1], p[2]); s.target.position.set(-p[0] * 0.15, 0, -p[2] * 0.15); scene.add(s, s.target);
      });

      // the ground: the fairground's grass, the arena's packed dirt and its tyre tracks
      var grass = ctx.assets.surface('texture-grass', { color: '#6E7F52', mottle: 0.3 }) || new THREE.MeshStandardMaterial({ color: '#3C4A2C', roughness: 1 });
      var lawn = new THREE.Mesh(new THREE.PlaneGeometry(900, 900).rotateX(-PI / 2), grass); lawn.position.y = -0.03; lawn.receiveShadow = true; scene.add(lawn);
      var dirt = ctx.assets.surface('texture-forest-floor', { color: '#9C7A58', size: 2.6, roughness: 1, mottle: 0.4 }) || new THREE.MeshStandardMaterial({ color: '#5E4630', roughness: 1 });
      var floor = new THREE.Mesh(new THREE.CircleGeometry(1, 128).scale(RX + 4, RZ + 4, 1).rotateX(-PI / 2), dirt); floor.receiveShadow = true; scene.add(floor);
      var tracks = ctx.textures.canvas(2048, 1440, function (g, w, h) {
        g.clearRect(0, 0, w, h); g.lineCap = 'round';
        for (var k = 0; k < 70; k++) {
          var cx = w * (0.15 + Math.random() * 0.7), cy = h * (0.15 + Math.random() * 0.7), r = 80 + Math.random() * 520, a0 = Math.random() * TAU, a1 = a0 + (0.4 + Math.random() * 1.6) * (Math.random() < 0.5 ? -1 : 1);
          g.strokeStyle = 'rgba(30,20,12,' + (0.12 + Math.random() * 0.2) + ')'; g.lineWidth = 9 + Math.random() * 6;
          [-1, 1].forEach(function (sd) { g.beginPath(); g.arc(cx, cy, r + sd * 22, Math.min(a0, a1), Math.max(a0, a1)); g.stroke(); });
        }
      });
      var trk = new THREE.Mesh(new THREE.PlaneGeometry((RX + 2) * 2, (RZ + 2) * 2).rotateX(-PI / 2), new THREE.MeshStandardMaterial({ map: tracks, transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 }));
      trk.position.y = 0.01; trk.receiveShadow = true; scene.add(trk);

      // the wall: scanned concrete barriers end to end round the ellipse, broken only at the gates
      var spots = [], acc = 0, prev = ell(0, 0.75), N = 3000;
      for (var i = 1; i <= N; i++) { var a = i / N * TAU, p = ell(a, 0.75); acc += Math.hypot(p.x - prev.x, p.z - prev.z); prev = p; if (acc >= 1.52) { acc -= 1.52; if (!nearGate(a, 0.075)) spots.push({ a: a, x: p.x, z: p.z }); } }
      var bar = ctx.assets.model('model-concrete-barrier');
      if (bar) {
        var along = bar.size && bar.size.x > bar.size.z;
        scene.add(bar.instanced(spots.length, function (k, d) { var q = spots[k], ty = tangentYaw(q.a); d.position.set(q.x, 0, q.z); d.rotation.y = along ? ty : ty - PI / 2; }));
      } else {
        var conc = ctx.assets.surface('texture-concrete', { project: 'box' }) || new THREE.MeshStandardMaterial({ color: '#9A968E' });
        scene.add(ctx.instanced(new THREE.BoxGeometry(0.6, 0.9, 1.5).translate(0, 0.45, 0), conc, spots.length, function (k, d) { var q = spots[k]; d.position.set(q.x, 0, q.z); d.rotation.y = tangentYaw(q.a); }));
      }
      // tyres stacked against the wall's back, every few metres
      var tyreGeo = new THREE.TorusGeometry(0.36, 0.17, 8, 16).rotateX(PI / 2), tyreMat = new THREE.MeshStandardMaterial({ color: '#17171A', roughness: 0.9 });
      var stacks = spots.filter(function (q, k) { return k % 4 === 0; });
      scene.add(ctx.instanced(tyreGeo, tyreMat, stacks.length * 3, function (k, d) { var q = stacks[Math.floor(k / 3)], o = ell(q.a, 1.9); d.position.set(o.x, 0.17 + (k % 3) * 0.32, o.z); d.rotation.y = k * 0.7; }));

      // the catch fence over the wall: chain link on posts, coloured bulbs strung along its top
      var link = ctx.textures.canvas(128, 128, function (g, w, h) {
        g.clearRect(0, 0, w, h); g.strokeStyle = 'rgba(205,210,216,0.95)'; g.lineWidth = 5;
        for (var k = -2; k <= 2; k++) { g.beginPath(); g.moveTo(k * w / 2, 0); g.lineTo(k * w / 2 + w, h); g.stroke(); g.beginPath(); g.moveTo(k * w / 2 + w, 0); g.lineTo(k * w / 2, h); g.stroke(); }
      });
      link.wrapS = link.wrapT = THREE.RepeatWrapping; link.repeat.set(10, 10);
      var fenceMat = new THREE.MeshStandardMaterial({ map: link, alphaTest: 0.5, side: THREE.DoubleSide, metalness: 0.7, roughness: 0.45 });
      var panels = spots.filter(function (q, k) { return k % 2 === 0; });
      scene.add(ctx.instanced(new THREE.PlaneGeometry(3.06, 3.2).translate(0, 2.6, 0), fenceMat, panels.length, function (k, d) { var q = panels[k], o = ell(q.a, 2.6); d.position.set(o.x, 0, o.z); d.rotation.y = tangentYaw(q.a) - PI / 2; }));
      var steel = new THREE.MeshStandardMaterial({ color: '#8B9097', metalness: 0.9, roughness: 0.35 });
      scene.add(ctx.instanced(new THREE.CylinderGeometry(0.05, 0.05, 4.4, 6).translate(0, 2.2, 0), steel, panels.length, function (k, d) { var o = ell(panels[k].a, 2.62); d.position.set(o.x - 0, 0, o.z); }));
      var bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.075, 8, 6), new THREE.MeshBasicMaterial({ color: '#FFFFFF', toneMapped: true }), panels.length * 2);
      var bc = ['#FF5FA2', '#FFD23F', '#3BCEAC', '#4D7CFE', '#FF7A2A'].map(function (h) { return new THREE.Color(h).multiplyScalar(4); }), dm = new THREE.Object3D();
      for (var b2 = 0; b2 < panels.length * 2; b2++) { var o2 = ell(panels[Math.floor(b2 / 2)].a + (b2 % 2) * 0.014, 2.62); dm.position.set(o2.x, 4.3, o2.z); dm.updateMatrix(); bulbs.setMatrixAt(b2, dm.matrix); bulbs.setColorAt(b2, bc[b2 % bc.length]); }
      bulbs.userData.noReflection = true; scene.add(bulbs);

      // the gates: steel doors in a frame under a lit number, set back from the wall
      var corr = ctx.assets.surface('texture-corrugated-metal', { project: 'box', color: '#8E2A3A' }) || new THREE.MeshStandardMaterial({ color: '#7A2632', metalness: 0.6, roughness: 0.5 });
      GATES.forEach(function (ga, gi) {
        var g = new THREE.Group(), p = ell(ga, 3.2); g.position.set(p.x, 0, p.z); g.rotation.y = tangentYaw(ga) - PI / 2;
        var door = new THREE.Mesh(new THREE.BoxGeometry(8.6, 4.2, 0.25).translate(0, 2.1, 0), corr); door.castShadow = true; door.receiveShadow = true; g.add(door);
        [-1, 1].forEach(function (sd) { var post = new THREE.Mesh(new THREE.BoxGeometry(0.6, 6, 0.6).translate(sd * 4.6, 3, 0), steel); post.castShadow = true; g.add(post); });
        g.add(new THREE.Mesh(new THREE.BoxGeometry(9.8, 0.9, 0.6).translate(0, 6.2, 0), steel));
        var sign = ctx.textures.canvas(512, 96, function (c, w, h) { c.fillStyle = '#14101C'; c.fillRect(0, 0, w, h); c.font = '800 60px Oxanium, Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#FFD23F'; c.shadowColor = '#FFB21A'; c.shadowBlur = 16; c.fillText('GATE ' + (gi + 1), w / 2, h / 2 + 2); });
        var sm = new THREE.MeshBasicMaterial({ map: sign, color: new THREE.Color(2.2, 2.2, 2.2) }); var sp = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 0.78), sm); sp.position.set(0, 6.2, 0.31); g.add(sp);
        scene.add(g);
      });

      // the grandstands: wooden bleachers all the way round, rising behind the fence
      var planks = ctx.assets.surface('texture-planks', { project: 'box', color: '#B49A7A' }) || new THREE.MeshStandardMaterial({ color: '#7A5E44', roughness: 0.9 });
      var ROWS = 11, RUN = 1.15, RISE = 0.55, K0 = 5;
      var pos = [], idx = [], M = 360;
      function vtx(a, k, y) { var q = ell(a, k); pos.push(q.x, y, q.z); return pos.length / 3 - 1; }
      for (var r = 0; r <= ROWS; r++) {
        var k0 = K0 + r * RUN, k1 = k0 + RUN, y0 = 0.6 + r * RISE, y1 = y0 + RISE;
        for (var m = 0; m < M; m++) {
          var a0 = m / M * TAU, a1 = (m + 1) / M * TAU;
          if (nearGate((a0 + a1) / 2, 0.13)) continue;
          // riser (facing the arena), then tread
          var v0 = vtx(a0, k0, y0), v1 = vtx(a1, k0, y0), v2 = vtx(a1, k0, y1), v3 = vtx(a0, k0, y1); idx.push(v0, v2, v1, v0, v3, v2);
          var t0 = vtx(a0, k0, y1), t1 = vtx(a1, k0, y1), t2 = vtx(a1, k1, y1), t3 = vtx(a0, k1, y1); idx.push(t0, t2, t1, t0, t3, t2);
        }
      }
      var stg = new THREE.BufferGeometry(); stg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); stg.setIndex(idx); stg.computeVertexNormals();
      var stands = new THREE.Mesh(stg, planks); stands.receiveShadow = true; stands.castShadow = true; scene.add(stands);
      // their backs: a dark wall from the top row down
      var bk = []; for (m = 0; m <= M; m++) { var ab = m / M * TAU, qb = ell(ab, K0 + (ROWS + 1) * RUN); bk.push(qb.x, 0, qb.z, qb.x, 0.6 + (ROWS + 1) * RISE + 1.1, qb.z); }
      var bi = []; for (m = 0; m < M; m++) { if (nearGate((m + 0.5) / M * TAU, 0.13)) continue; bi.push(m * 2, m * 2 + 2, m * 2 + 1, m * 2 + 1, m * 2 + 2, m * 2 + 3); }
      var bkg = new THREE.BufferGeometry(); bkg.setAttribute('position', new THREE.Float32BufferAttribute(bk, 3)); bkg.setIndex(bi); bkg.computeVertexNormals();
      scene.add(new THREE.Mesh(bkg, new THREE.MeshStandardMaterial({ color: '#2A2230', roughness: 0.8, side: THREE.DoubleSide })));

      // the crowd: on their feet, a few jumping, lit by the floodlights (instanced: two draw calls)
      var seats = [];
      for (r = 0; r < ROWS; r++) for (m = 0; m < 300; m++) {
        var as = (m + (r % 2) * 0.5 + (Math.random() - 0.5) * 0.4) / 300 * TAU; if (nearGate(as, 0.15) || Math.random() > 0.58) continue;
        var qs = ell(as, K0 + r * RUN + RUN * (0.4 + Math.random() * 0.3)); seats.push({ x: qs.x, y: 0.6 + (r + 1) * RISE, z: qs.z, a: as });
      }
      function crowdMat(color) {
        var mt = new THREE.MeshStandardMaterial({ color: color || '#FFFFFF', roughness: 0.75 });
        mt.onBeforeCompile = function (sh) {
          sh.uniforms.uTime = { value: 0 }; mt.userData.shader = sh;
          sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  float ph = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.53;\n  transformed.y += max(0.0, sin(uTime * 6.5 + ph * 9.0)) * 0.16 * step(0.55, fract(ph * 13.1)) + sin(uTime * 1.7 + ph * 5.0) * 0.02;');
        };
        crowdMats.push(mt); return mt;
      }
      // a person at a distance: shoulders and a body, a head
      var bodyGeo = new THREE.CapsuleGeometry(0.17, 0.46, 3, 8).scale(1.25, 1, 0.8).translate(0, 0.52, 0), headGeo = new THREE.SphereGeometry(0.115, 10, 8).translate(0, 1.0, 0);
      var bodies = new THREE.InstancedMesh(bodyGeo, crowdMat(), seats.length), heads = new THREE.InstancedMesh(headGeo, crowdMat(), seats.length);
      var shirts = ['#2B3A55', '#3A3A3E', '#8C2A2A', '#D9D4C8', '#4A5A3A', '#1E2430', '#6B4A30', '#9A3A5A', '#C8B07A', '#2F4F6F', '#5A2A2A', '#E8E2D6'].map(function (h) { return new THREE.Color(h); });
      var skin = ['#8D5524', '#C68642', '#E0AC69', '#F1C27D', '#FFDBAC', '#5C3A21'].map(function (h) { return new THREE.Color(h); });
      seats.forEach(function (q, k) {
        dm.position.set(q.x, q.y, q.z); dm.rotation.set(0, Math.atan2(-q.x, -q.z), 0); var s = 0.9 + Math.random() * 0.22; dm.scale.set(s, s, s); dm.updateMatrix();
        bodies.setMatrixAt(k, dm.matrix); heads.setMatrixAt(k, dm.matrix); bodies.setColorAt(k, shirts[k % shirts.length]); heads.setColorAt(k, skin[(k * 7) % skin.length]);
      });
      [bodies, heads].forEach(function (im) { im.userData.noReflection = true; scene.add(im); });

      // the floodlight towers: steel masts with banks of lamps over the four corners
      var lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#FFF4DE').multiplyScalar(2.6) }), frameMat = new THREE.MeshStandardMaterial({ color: '#3A3D44', metalness: 0.8, roughness: 0.4 });
      [PI * 0.25, PI * 0.75, PI * 1.25, PI * 1.75].forEach(function (ta) {
        var q = ell(ta, 24), tw = new THREE.Group(); tw.position.set(q.x, 0, q.z); tw.rotation.y = Math.atan2(-q.x, -q.z);
        var mast = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.6, 30, 10).translate(0, 15, 0), frameMat); mast.castShadow = true; tw.add(mast);
        var head = new THREE.Group(); head.position.set(0, 30.5, 0.6); head.rotation.x = 0.42; tw.add(head);
        head.add(new THREE.Mesh(new THREE.BoxGeometry(7, 4, 0.4), frameMat));
        for (var lx = 0; lx < 4; lx++) for (var ly = 0; ly < 3; ly++) { var l = new THREE.Mesh(new THREE.CircleGeometry(0.62, 18), lampMat); l.position.set(-2.55 + lx * 1.7, -1.25 + ly * 1.25, 0.22); head.add(l); }
        scene.add(tw);
      });

      // the screen at the east end: the derby's name over the gate
      var board = ctx.textures.canvas(1024, 384, function (g, w, h) {
        var gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#2A0E2A'); gr.addColorStop(1, '#120614'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
        g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '900 150px Oxanium, "Arial Black", sans-serif'; g.lineJoin = 'round';
        g.lineWidth = 18; g.strokeStyle = '#FFFFFF'; g.strokeText('MOG DERBY', w / 2, h * 0.43); g.fillStyle = '#F0468C'; g.fillText('MOG DERBY', w / 2, h * 0.43);
        g.font = '700 46px Oxanium, Arial, sans-serif'; g.fillStyle = '#FFD23F'; g.fillText('SPIN  ·  WRECK  ·  WIN', w / 2, h * 0.82);
      });
      var scr = new THREE.Mesh(new THREE.PlaneGeometry(22, 8.25), new THREE.MeshBasicMaterial({ map: board, color: new THREE.Color(1.8, 1.8, 1.8) }));
      var se = ell(0, K0 + (ROWS + 1) * RUN + 1); scr.position.set(se.x, 14.5, se.z); scr.rotation.y = -PI / 2; scene.add(scr);
      var scrBack = new THREE.Mesh(new THREE.BoxGeometry(1, 9.2, 23).translate(0.6, 14.5, 0), frameMat); scrBack.position.set(se.x, 0, se.z); scene.add(scrBack);
      [-8, 8].forEach(function (dz) { scene.add(new THREE.Mesh(new THREE.BoxGeometry(0.6, 10, 0.6).translate(se.x + 0.6, 5, se.z + dz), frameMat)); });

      // the fair beyond: a Ferris wheel turning in coloured lights, and tents
      var wheel = new THREE.Group(); wheel.position.set(-70, 21, -112); wheel.rotation.y = 0.5; scene.add(wheel);
      var spin = new THREE.Group(); wheel.add(spin);
      spin.add(new THREE.Mesh(new THREE.TorusGeometry(17, 0.35, 8, 64), frameMat));
      for (var sk = 0; sk < 16; sk++) { var sa = sk / 16 * TAU, spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 17, 5).translate(0, 8.5, 0), frameMat); spoke.rotation.z = sa; spin.add(spoke); }
      var wl = new THREE.InstancedMesh(new THREE.SphereGeometry(0.28, 8, 6), new THREE.MeshBasicMaterial({ color: '#FFFFFF' }), 96);
      for (var w = 0; w < 96; w++) { var wa = w / 96 * TAU; dm.position.set(Math.cos(wa) * 17, Math.sin(wa) * 17, 0); dm.rotation.set(0, 0, 0); dm.scale.setScalar(1); dm.updateMatrix(); wl.setMatrixAt(w, dm.matrix); wl.setColorAt(w, bc[w % bc.length].clone().multiplyScalar(1.4)); }
      wl.userData.noReflection = true; spin.add(wl);
      [-1, 1].forEach(function (sd) { var leg = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 23, 6).translate(0, -11.5, 0), frameMat); leg.rotation.x = sd * 0.32; wheel.add(leg); });
      wheelSpin = spin;
      var tentMat = new THREE.MeshStandardMaterial({ roughness: 0.8, map: ctx.textures.canvas(256, 64, function (g, w2, h) { for (var k = 0; k < 8; k++) { g.fillStyle = k % 2 ? '#F4EFE6' : '#C8102E'; g.fillRect(k * w2 / 8, 0, w2 / 8, h); } }) });
      [[-30, -96], [8, -104], [38, -98], [96, -40], [100, 30], [-104, 36], [-98, -20]].forEach(function (p, k) {
        var tent = new THREE.Mesh(new THREE.ConeGeometry(6 + (k % 3), 7, 12).translate(0, 7.5, 0), tentMat); tent.position.set(p[0], 0, p[1]); scene.add(tent);
        scene.add(new THREE.Mesh(new THREE.CylinderGeometry(6 + (k % 3), 6 + (k % 3), 4, 12, 1, true).translate(p[0], 2, p[1]), tentMat));
      });
    },

    // the crowd on its feet, the wheel turning
    update: function (ctx, t) {
      for (var i = 0; i < crowdMats.length; i++) { var sh = crowdMats[i].userData.shader; if (sh) sh.uniforms.uTime.value = t; }
      if (wheelSpin) wheelSpin.rotation.z = t * 0.12;
    },

    // Scoops: the ice-cream truck, its guns, and the grin on the spring
    player: function (ctx) {
      return ctx.assets.car({
        kind: 'van', paint: '#F8F5EF', trim: '#F0468C', accent: '#FF8DC0', livery: 'SCOOPS', sign: 'ICE CREAM', motto: 'BRAKES FOR SPRINKLES',
        topper: 'swirl', armed: true, driver: { suit: '#F0468C', helmet: '#FFFFFF' }, name: 'Scoops', color: '#F0468C',
      });
    },
  });
})();
