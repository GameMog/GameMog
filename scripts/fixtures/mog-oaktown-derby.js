// The Mog of Zcity that came back a derby (the case behind "Mogs keep their parent", 6 Oct 2026; the idea: "set it at daytime driving around in a red ferrari
// testarossa GTA 5 style. city is called "Oaktown""), as it was live: the DNA check's case (lib/mog-dna.ts, npm run check).
// Not a world GameMog ships.

(function () {
  function pick(l, i) { return l[i % l.length]; }
  var RX = 70, RZ = 48;
  GameMog.world({
    assets: ['human-athlete-male', 'human-athlete-female', 'sky-partly-cloudy', 'texture-asphalt-track', 'texture-concrete',
      'texture-plaster', 'texture-brick', 'texture-bark', 'texture-grass', 'model-street-lamp', 'model-concrete-barrier', 'model-shrub'],
    theme: { sky: '#7FB6E8', fog: '#CFE2F2', ink: '#FFFFFF', accent: '#FF3B30', font: 'Oxanium' },
    graphics: { preset: 'daylight', environment: true, reflections: true, motion: 0.4,
      bloom: { strength: 0.3, threshold: 1.1, radius: 0.6 },
      grade: { contrast: 1.07, saturation: 1.12, warmth: 0.08, vignette: 0.2, split: 0.15 },
      shadows: { extent: 70, mapSize: 2048 } },
    camera: { distance: 8.5, height: 3.4, fov: 62 },
    open: {
      bounds: { x: [-110, 110], z: [-80, 80] },
      spawn: [-24, 8, 90],
      warm: true,
      vehicle: {
        arena: { x: 0, z: 0, rx: RX, rz: RZ },
        gates: [[RX - 6, 0], [0, RZ - 6], [-(RX - 6), 0], [0, -(RZ - 6)]],
        guns: true, armor: 0.6,
        gm: { spin90: 30, spin180: 70, spin360: 160, wreck: 160 },
      },
      heat: { every: 45, say: ['Street racers cut in', 'Oaktown PD on your tail', 'The Marlowe crew rolls up', 'Every car in town wants you'] },
      health: 100, maxEnemies: 9, civilians: 0, weapons: false,
      hud: { gm: 'Getaway fund', banner: 'Stack 10,000 GM to clear the Marlowe debt.' },
      goal: { gm: 10000, title: 'Debt Cleared', text: 'Ten thousand GM and the Testarossa is finally yours.' },
      intro: { shots: [
        { t: 6, fade: 'in', place: 'OAKTOWN', time: 'HIGH NOON',
          cam: { from: [0, 70, 120], to: [30, 22, 70], look: [0, 2, 0], fov: 50, fovTo: 44 } },
        { t: 6, say: 'Dante Cruz owes the Marlowe brothers ten thousand. The Testarossa is his collateral.',
          cam: { from: [-70, 6, 30], to: [-40, 4, 10], look: [0, 1, 0], fov: 46 } },
        { t: 5.5, say: '"One more afternoon. Put the top down, floor it."', fade: 'out', title: 'OAKTOWN TESTAROSSA',
          tagline: 'Ram them off the plaza. Stack 10,000 GM before the sheriff arrives.',
          cam: { from: [20, 5, 60], to: [-10, 14, 40], look: [0, 1, 0], fov: 50 } },
      ] },
      outro: { shots: [
        { t: 5, fade: 'in', place: '10,000 GM', time: 'OAKTOWN PLAZA',
          cam: { from: [40, 8, 40], to: [20, 4, 25], look: [0, 1, 0], fov: 46 } },
        { t: 6, say: 'Big Marlowe tears up the note. The red Testarossa is Dante\u2019s, free and clear.', fade: 'out', title: 'DEBT CLEARED',
          tagline: 'Ten thousand GM. Oaktown looks better from the driver\u2019s seat.',
          cam: { from: [-30, 3, 30], to: [-10, 12, 50], look: [0, 1, 0], fov: 48 } },
      ] },
      crew: {
        thug: { gm: 70, hp: 3, names: ['Lowrider Lou', 'Dusty Dale', 'Cab Wrecker', 'Rust Bucket', 'Sunday Driver'],
          car: function (ctx, i) { return { kind: 'stockcar', paint: pick(['#2FA84F', '#3A6FD8', '#E8D13A', '#8E5B3A', '#7A3BC4'], i), trim: '#F2F2F2', number: String(10 + i * 7 % 90), livery: pick(['TAXI', 'OAK CAB', 'DELIVERY'], i) }; } },
        biker: { gm: 100, hp: 3, names: ['Street Racer', 'Vinewood Vince', 'Nitro Nina', 'Kerb Crawler'],
          car: function (ctx, i) { return { kind: pick(['hypercar', 'roadster'], i), paint: pick(['#F2B418', '#1C8FE0', '#F2F2F2', '#8A2BE2'], i), metallic: 0.5, glow: i % 2 ? '#FF2AA0' : false, number: String(7 + i) }; } },
        cop: { gm: 100, hp: 4, names: ['Oaktown PD', 'Deputy Hale', 'Sheriff Brand', 'Officer Cruz'],
          car: function (ctx, i) { return { kind: 'stockcar', paint: '#14181F', trim: '#F4F4F4', accent: '#2E6BFF', livery: 'OAKTOWN PD', number: String(1 + i), pattern: 'split' }; } },
        boss: { gm: 900, hp: 14, names: ['Big Marlowe', 'Mama Marlowe', 'Hammer Marlowe'],
          car: function (ctx, i) { return { kind: 'monster', paint: pick(['#E8671C', '#6A1B9A', '#1B8A5A'], i), spikes: true, glow: '#FF8A2A' }; },
          ranged: { every: 3.4, range: 26, damage: 9, color: '#FF8A2A' } },
      },
    },
    build: function (ctx) {
      var THREE = ctx.THREE, scene = ctx.scene, rnd = ctx.random;
      var sky = ctx.sky({ hdri: 'sky-partly-cloudy', sun: [0.45, 0.75, 0.35] });
      scene.fog = new THREE.Fog(sky.userData.haze || '#CFE2F2', 200, 1500);
      scene.add(new THREE.HemisphereLight('#CFE6FF', '#7A7468', 0.9));
      var sun = new THREE.DirectionalLight('#FFF1D6', 3);
      sun.position.copy(sky.userData.sun || new THREE.Vector3(0.45, 0.75, 0.35)).multiplyScalar(200);
      sun.castShadow = true; scene.add(sun);

      function surf(id, o, fb) { return ctx.assets.surface(id, o) || new THREE.MeshStandardMaterial({ color: fb, roughness: 0.9 }); }
      var asphalt = surf('texture-asphalt-track', { roughness: 0.85 }, '#444');
      var ground = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), surf('texture-concrete', { color: '#B8B4AA' }, '#999'));
      ground.rotation.x = -Math.PI / 2; ground.position.y = -0.05; ground.receiveShadow = true; scene.add(ground);
      var road = new THREE.Mesh(new THREE.CircleGeometry(1, 64), asphalt);
      road.scale.set(RX + 4, RZ + 4, 1); road.rotation.x = -Math.PI / 2; road.position.y = 0; road.receiveShadow = true;
      // ellipse via scaled circle: scale y of rotated circle maps to z
      road.scale.set(RX + 4, RZ + 4, 1);
      scene.add(road);
      // sidewalk ring
      var sh = new THREE.Shape(); sh.absellipse(0, 0, RX + 16, RZ + 16, 0, Math.PI * 2, false);
      var hole = new THREE.Path(); hole.absellipse(0, 0, RX + 2, RZ + 2, 0, Math.PI * 2, true); sh.holes.push(hole);
      var side = new THREE.Mesh(new THREE.ShapeGeometry(sh, 64), surf('texture-concrete', { color: '#D2CEC4' }, '#CCC'));
      side.rotation.x = -Math.PI / 2; side.position.y = 0.12; side.receiveShadow = true; scene.add(side);

      // road paint
      var paint = new THREE.MeshStandardMaterial({ color: '#F2F0E8', roughness: 0.7 });
      var marks = [], k;
      for (k = -54; k <= 54; k += 6) if (Math.abs(k) > 10) marks.push([k, 0, 3, 0.3, 0]);
      for (k = -34; k <= 34; k += 6) if (Math.abs(k) > 10) marks.push([0, k, 0.3, 3, 0]);
      [[RX - 12, 0, 0], [-(RX - 12), 0, 0], [0, RZ - 10, 1], [0, -(RZ - 10), 1]].forEach(function (g) {
        for (var j = -3; j <= 3; j++) marks.push(g[2] ? [g[0] + j * 1.4, g[1], 0.7, 5, 0] : [g[0], g[1] + j * 1.4, 5, 0.7, 0]);
      });
      scene.add(ctx.instanced(new THREE.BoxGeometry(1, 0.03, 1), paint, marks.length, function (i, d) {
        var m = marks[i]; d.position.set(m[0], 0.05, m[1]); d.scale.set(m[2], 1, m[3]);
      }));
      // centre roundel
      var ring = new THREE.Mesh(new THREE.RingGeometry(9, 9.5, 48), paint);
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06; scene.add(ring);

      // barrier wall
      var N = 260;
      function ep(a, e) { return [(RX + e) * Math.cos(a), (RZ + e) * Math.sin(a)]; }
      var barr = ctx.assets.model('model-concrete-barrier');
      var bfn = function (i, d) {
        var a = i / N * Math.PI * 2, p = ep(a, 1.2);
        d.position.set(p[0], 0, p[1]);
        d.rotation.y = Math.atan2(-RZ * Math.cos(a), -RX * Math.sin(a));
        d.scale.set(1.2, 1.2, 1.2);
      };
      if (barr) scene.add(barr.instanced(N, bfn));
      else scene.add(ctx.instanced(new THREE.BoxGeometry(1.7, 0.9, 0.5), new THREE.MeshStandardMaterial({ color: '#A9A59C', roughness: 0.95 }), N, function (i, d) { bfn(i, d); d.position.y = 0.45; }));

      // buildings
      var mats = [
        surf('texture-plaster', { project: 'box', color: '#F0DCC0' }, '#E8D6BA'),
        surf('texture-brick', { project: 'box', color: '#C98A6A' }, '#B07050'),
        surf('texture-concrete', { project: 'box', color: '#C9CDD2' }, '#BBB'),
        surf('texture-plaster', { project: 'box', color: '#8FC4C8' }, '#8FC4C8'),
      ];
      var strips = [];
      function tower(a, e, w, dpt, h, mi) {
        var p = ep(a, e), th = Math.atan2(p[0] / (RX + e), p[1] / (RZ + e));
        var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, dpt), mats[mi % mats.length]);
        m.position.set(p[0], h / 2, p[1]); m.rotation.y = th; m.castShadow = e < 40; m.receiveShadow = true; scene.add(m);
        var nx = Math.sin(th), nz = Math.cos(th);
        for (var f = 0; f < Math.floor((h - 4) / 4); f++)
          strips.push([p[0] + nx * (dpt / 2 + 0.05), 3.6 + f * 4, p[1] + nz * (dpt / 2 + 0.05), th, w * 0.88]);
        return { m: m, th: th, p: p, h: h };
      }
      var inner = [], i;
      for (i = 0; i < 30; i++) inner.push(tower(i / 30 * Math.PI * 2, 28, 17, 22, 18 + rnd() * 34, i + (i % 3)));
      for (i = 0; i < 18; i++) tower(i / 18 * Math.PI * 2 + 0.08, 70, 28, 28, 70 + rnd() * 70, i);
      var glass = new THREE.MeshStandardMaterial({ color: '#1C3550', metalness: 0.9, roughness: 0.12 });
      scene.add(ctx.instanced(new THREE.BoxGeometry(1, 2, 0.1), glass, strips.length, function (i2, d) {
        var s = strips[i2]; d.position.set(s[0], s[1], s[2]); d.rotation.y = s[3]; d.scale.set(s[4], 1, 1);
      }));

      // OAKTOWN signs on two rooftops
      var tex = ctx.textures.canvas(1024, 256, function (g, w, h) {
        g.fillStyle = '#7A1010'; g.fillRect(0, 0, w, h); g.strokeStyle = '#FFE9B0'; g.lineWidth = 8; g.strokeRect(10, 10, w - 20, h - 20);
        g.fillStyle = '#FFE9B0'; g.font = '800 150px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('OAKTOWN', w / 2, h / 2 + 6);
      });
      [4, 19].forEach(function (ix) {
        var b = inner[ix], bd = new THREE.Mesh(new THREE.PlaneGeometry(14, 3.5), new THREE.MeshStandardMaterial({ map: tex, emissive: '#FFFFFF', emissiveMap: tex, emissiveIntensity: 0.6 }));
        var nx = Math.sin(b.th), nz = Math.cos(b.th);
        bd.position.set(b.p[0] + nx * 8, b.h + 4, b.p[1] + nz * 8); bd.rotation.y = b.th; scene.add(bd);
        var leg = new THREE.Mesh(new THREE.BoxGeometry(0.4, 4, 0.4), new THREE.MeshStandardMaterial({ color: '#333', metalness: 0.7, roughness: 0.5 }));
        leg.position.set(bd.position.x, b.h + 2, bd.position.z); scene.add(leg);
      });

      // oaks
      var bark = surf('texture-bark', { project: 'box', color: '#6A5140' }, '#6A5140');
      var T = 44, leaf = new THREE.MeshStandardMaterial({ color: '#4C7A32', roughness: 0.85 });
      var tp = []; for (i = 0; i < T; i++) { var a2 = i / T * Math.PI * 2 + 0.07, q = ep(a2, 8); tp.push([q[0], q[1], 0.9 + rnd() * 0.5]); }
      var trunks = ctx.instanced(new THREE.CylinderGeometry(0.35, 0.55, 5, 8), bark, T, function (j, d) { var t = tp[j]; d.position.set(t[0], 2.5 * t[2], t[1]); d.scale.set(t[2], t[2], t[2]); });
      var crowns = ctx.instanced(new THREE.IcosahedronGeometry(3.2, 2), leaf, T * 2, function (j, d) {
        var t = tp[j >> 1], o = (j & 1) ? 1.6 : -1.2; d.position.set(t[0] + o * 0.6, (5.6 + (j & 1) * 1.6) * t[2], t[1] + o * 0.4); d.scale.setScalar(t[2] * ((j & 1) ? 0.8 : 1));
      });
      trunks.castShadow = crowns.castShadow = true; scene.add(trunks, crowns);

      // shrubs and lamps
      var shr = ctx.assets.model('model-shrub');
      if (shr) scene.add(shr.instanced(34, function (j, d) { var q = ep(j / 34 * Math.PI * 2 + 0.1, 4.5); d.position.set(q[0], 0.12, q[1]); d.rotation.y = j; d.scale.setScalar(0.6); }));
      var lamp = ctx.assets.model('model-street-lamp');
      if (lamp) scene.add(lamp.instanced(20, function (j, d) { var a3 = j / 20 * Math.PI * 2 + 0.15, q = ep(a3, 6); d.position.set(q[0], 0.12, q[1]); d.rotation.y = Math.atan2(-q[0], -q[1]); }));
    },
    player: function (ctx) {
      return ctx.assets.car({
        kind: 'hypercar', paint: '#D0101E', trim: '#1A1A1C', accent: '#F4F1EA', metallic: 0.35, pattern: 'plain',
        number: '', livery: 'TESTAROSSA', rims: '#C9CCD0', calipers: '#F2C14E', armed: true,
        driver: { human: 'human-athlete-male', skin: 'caucasian2', hair: 'short04', hairColor: '#1A120C', outfit: { top: '#F4F1EA' } },
        name: 'Dante Cruz', color: '#D0101E',
      });
    },
  });
})();

