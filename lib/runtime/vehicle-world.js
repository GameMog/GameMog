// Runtime check fixture: a plain street oval for the car kit (play.vehicle).
// A hypercar on scanned asphalt from the library, a field that cycles the
// four classes, live reflections, speed blur and a recorded track. It hands
// its scene and track to the check (self.__veh) so the check can measure the
// cars. Not a published world.
(function () {
  var PI = Math.PI;
  // a 1.4 km oval: two long straights and two wide bends
  var pts = [], R = 90, S = 420;
  for (var i = 0; i < 48; i++) {
    var per = 2 * S + 2 * PI * R, d = i / 48 * per, x, z;
    if (d < S) { x = -S / 2 + d; z = -R; }
    else if (d < S + PI * R) { var a = (d - S) / R; x = S / 2 + Math.sin(a) * R; z = -Math.cos(a) * R; }
    else if (d < 2 * S + PI * R) { x = S / 2 - (d - S - PI * R); z = R; }
    else { var b = (d - 2 * S - PI * R) / R; x = -S / 2 - Math.sin(b) * R; z = Math.cos(b) * R; }
    pts.push([x, 0, -z]);
  }
  var KINDS = ['formula', 'stockcar', 'monster', 'hypercar'], COLS = ['#0E7C86', '#1B3FA6', '#1E7A34', '#C8102E'];
  GameMog.world({
    assets: ['texture-asphalt-track'],
    play: { vehicle: true },
    music: { track: 'music-dance-field' },
    theme: { sky: '#101424', fog: '#1A1A2A', ink: '#FFFFFF', accent: '#00D1C1', font: 'Bungee' },
    graphics: { exposure: 1.1, environment: true, bloom: { strength: 0.6 }, shadows: { extent: 40 }, reflections: true, motion: 0.5 },
    camera: { distance: 6.6, height: 2.1, fov: 62, look: 1 },
    track: { width: 16, points: pts },
    build: function (ctx) {
      var T = ctx.THREE, tex = ctx.assets.texture('texture-asphalt-track');
      self.__veh = { scene: ctx.scene, track: ctx.track, texture: tex ? { map: !!tex.map, normal: !!tex.normalMap, rough: !!tex.roughnessMap, size: tex.size } : null };
      var moon = new T.DirectionalLight('#C4D0FF', 1.2); moon.position.set(-40, 120, -60); moon.castShadow = true;
      ctx.scene.add(moon, new T.HemisphereLight('#6A70A0', '#3A2A22', 0.9));
      ctx.sky({ top: '#0C0B1C', horizon: '#5A3448', bottom: '#120E14', sun: [-0.35, 0.42, -0.62] });
      var g = new T.PlaneGeometry(2000, 2000); g.rotateX(-PI / 2);
      ctx.scene.add(new T.Mesh(g, new T.MeshStandardMaterial({ color: '#16161A' })));
      var road = new T.MeshPhysicalMaterial({ map: tex && tex.map, normalMap: tex && tex.normalMap, roughnessMap: tex && tex.roughnessMap, roughness: 0.9, clearcoat: 0.7, clearcoatRoughness: 0.1 });
      if (tex) [tex.map, tex.normalMap, tex.roughnessMap].forEach(function (t) { t.repeat.set(8, 8); });
      ctx.mirror(road, { y: 0 });
      var rb = ctx.track.ribbon({ material: road, y: 0 }); rb.userData.gmTrack = true; ctx.scene.add(rb);
      // lamps along the straights, bright enough to show in the paint
      for (var k = 0; k < 20; k++) {
        var p = ctx.track.pointAt(k * ctx.track.length / 20, 14, 0);
        var lamp = new T.Mesh(new T.BoxGeometry(1, 0.3, 1), new T.MeshBasicMaterial({ color: new T.Color('#FFE2B8').multiplyScalar(6) }));
        lamp.position.set(p.x, 9, p.z); ctx.scene.add(lamp);
      }
    },
    player: function (ctx) { return ctx.assets.car({ kind: 'hypercar', number: '7', livery: 'CHECK', name: 'Lab' }); },
    rival: function (ctx, k) { var c = ctx.assets.car({ kind: KINDS[(k - 1) % 4], paint: COLS[(k - 1) % 4], number: String(k), name: 'Rival ' + k }); c.name = 'Rival ' + k; c.color = COLS[(k - 1) % 4]; return c; },
    obstacles: function () { return []; },
  });
})();
