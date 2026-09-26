// Runtime check fixture: a coastal road by the sea at midday, built from the
// library: a photographed beach sky, scanned sand, grass and plaster, scanned
// rocks, plants and street furniture, and the runtime's water with surf along
// the shore. It hands its scene and track to the check (self.__day). Not a
// published world.
(function () {
  var PI = Math.PI;
  // a long oval: the sea road north, a bend, the inland road south
  var pts = [], R = 70, S = 520;
  for (var i = 0; i < 44; i++) {
    var per = 2 * S + 2 * PI * R, d = i / 44 * per, x, z;
    if (d < S) { x = R; z = S / 2 - d; }
    else if (d < S + PI * R) { var a = (d - S) / R; x = Math.cos(a) * R; z = -S / 2 - Math.sin(a) * R; }
    else if (d < 2 * S + PI * R) { x = -R; z = -S / 2 + (d - S - PI * R); }
    else { var b = (d - 2 * S - PI * R) / R; x = -Math.cos(b) * R; z = S / 2 + Math.sin(b) * R; }
    pts.push([x, 0, z]);
  }
  GameMog.world({
    assets: ['sky-beach', 'texture-asphalt-track', 'texture-sand', 'texture-grass', 'texture-plaster', 'model-mossy-rocks', 'model-fern', 'model-shrub', 'model-street-lamp', 'model-concrete-barrier', 'model-fire-hydrant', 'model-street-seating', 'model-boulder', 'human-athlete-male'],
    play: { vehicle: true },
    theme: { sky: '#8EC3E8', fog: '#CFE3EE', ink: '#FFFFFF', accent: '#FF5A36', font: 'Bungee' },
    graphics: { exposure: 1, environment: true, bloom: { strength: 0.3, threshold: 1.4 }, grade: { contrast: 1.05, saturation: 1.08, vignette: 0.2 }, shadows: { extent: 60, mapSize: 2048 }, reflections: true, motion: 0.4 },
    camera: { distance: 6.6, height: 2.1, fov: 60, look: 1 },
    track: { width: 16, points: pts },
    build: function (ctx) {
      var T = ctx.THREE, day = self.__day = { scene: ctx.scene, track: ctx.track };
      // the photograph's sea turned to face the world's sea (east); its sun lights the world
      var sky = ctx.sky({ hdri: 'sky-beach', face: [1, 0] });
      var sun = sky.userData.sun || new T.Vector3(0.6, 0.6, -0.3).normalize();
      day.sun = sun.toArray();
      var key = new T.DirectionalLight('#FFF3E0', 3.2); key.position.copy(sun).multiplyScalar(200); key.castShadow = true; ctx.scene.add(key, key.target);
      ctx.scene.add(new T.HemisphereLight('#CFE6FF', '#C8B48A', 0.6));
      // the haze is the photograph's own horizon, so distant ground melts into the sky
      ctx.scene.fog = new T.Fog(sky.userData.haze || '#CFE3EE', 300, 2400);
      day.haze = sky.userData.haze ? '#' + sky.userData.haze.getHexString() : null;
      // grass inland, a scanned surface laid on at true scale (the beach's own sand runs from the road to the sea)
      var gg = new T.PlaneGeometry(960, 1400); gg.rotateX(-PI / 2); gg.translate(-420, -0.03, 0);
      var grassM = ctx.assets.surface('texture-grass', { mottle: 0.3 });
      day.surface = grassM ? grassM.userData.gmSurface : null;
      var grass = new T.Mesh(gg, grassM || new T.MeshStandardMaterial({ color: '#5E7A3A' })); grass.receiveShadow = true; ctx.scene.add(grass);
      function surface(id, rep) { var t = ctx.assets.texture(id); if (!t) return null; [t.map, t.normalMap, t.roughnessMap].forEach(function (m) { if (m) m.repeat.set(rep[0], rep[1]); }); return t; }
      var tx = surface('texture-asphalt-track', [8, 8]);
      var rb = ctx.track.ribbon({ material: new T.MeshStandardMaterial({ map: tx && tx.map, normalMap: tx && tx.normalMap, roughnessMap: tx && tx.roughnessMap }), y: 0.01 });
      rb.userData.gmTrack = true; ctx.scene.add(rb);
      // the sea, surf breaking along the waterline 35 m off the road
      var shore = []; for (var z = -700; z <= 700; z += 20) shore.push([105 + Math.sin(z * 0.02) * 4, z]);
      shore.reverse(); // walked north to south, the water lies on the line's left
      day.water = !!ctx.water({ y: -0.35, waves: 0.7, wind: [-1, 0.2], shore: shore, size: 4000, beach: { land: -0.02, width: 44, back: 26, texture: 'texture-sand' } });
      // a stucco wall with lamps along the inland side
      var wg = new T.BoxGeometry(1, 3.2, 520); wg.translate(-R - 22, 1.6, 0);
      ctx.scene.add(new T.Mesh(wg, ctx.assets.surface('texture-plaster', { project: 'box', color: '#F3E4D0' })));
      var lamp = ctx.assets.model('model-street-lamp');
      day.models = {};
      if (lamp) { day.models.lamp = lamp.parts.length; ctx.scene.add(lamp.instanced(24, function (k, D) { D.position.set(R + 12, 0, -240 + k * 21); D.rotation.y = -PI / 2; })); }
      var rocks = ctx.assets.model('model-mossy-rocks');
      if (rocks) { day.models.rocks = rocks.parts.length; rocks.parts.forEach(function (p, j) { ctx.scene.add(rocks.instanced(8, function (k, D) { D.position.set(112 + (k % 3) * 7, -0.4, -300 + k * 80 + j * 13); D.rotation.y = k * 1.3 + j; D.scale.setScalar(0.7 + ((k * 7 + j) % 5) * 0.15); }, p)); }); }
      var boulder = ctx.assets.model('model-boulder');
      if (boulder) ctx.scene.add(boulder.instanced(10, function (k, D) { D.position.set(-R - 34, 0, -260 + k * 55); D.rotation.y = k; D.scale.setScalar(1.4); }));
      var fern = ctx.assets.model('model-fern');
      if (fern) { day.models.fern = fern.parts.length; ctx.scene.add(fern.instanced(60, function (k, D) { D.position.set(-R - 16 - (k % 4) * 1.5, 0, -270 + k * 9); D.rotation.y = k * 2.3; D.scale.setScalar(1.3); })); }
      var shrub = ctx.assets.model('model-shrub');
      if (shrub) ctx.scene.add(shrub.instanced(18, function (k, D) { D.position.set(-R - 28, 0, -250 + k * 30); D.rotation.y = k * 1.7; }));
      var bar = ctx.assets.model('model-concrete-barrier');
      if (bar) ctx.scene.add(bar.instanced(60, function (k, D) { D.position.set(R + 10.6, 0, -250 + k * 1.6 * 5.2); D.rotation.y = PI / 2; }));
      var hyd = ctx.assets.model('model-fire-hydrant');
      if (hyd) { var h = hyd.part('fire_hydrant'); h.position.set(-R - 13, 0, 40); ctx.scene.add(h); }
      var seat = ctx.assets.model('model-street-seating');
      if (seat) { var st = seat.object; st.position.set(R + 16, 0, 10); st.rotation.y = -PI / 2; ctx.scene.add(st); }
    },
    // an open roadster with one of the library's people at the wheel
    player: function (ctx) { var c = ctx.assets.car({ kind: 'roadster', paint: '#B01C22', interior: '#7A4326', driver: { human: 'human-athlete-male', outfit: { top: '#F4F1EA', trim: '#1B2A44' } } }); self.__day.driver = !!(c && c.driver); self.__day.car = c; return c; },
    rival: function (ctx, k) { var c = ctx.assets.car({ kind: ['roadster', 'formula', 'stockcar', 'monster'][(k - 1) % 4], paint: ['#E8E4DA', '#0E7C86', '#1B3FA6', '#1E7A34'][(k - 1) % 4], number: String(k) }); c.name = 'Rival ' + k; c.color = '#0E7C86'; return c; },
    obstacles: function () { return []; },
  });
})();
