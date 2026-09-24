// Runtime check fixture: a 400 m speed-skating oval of mirror ice, skated by
// the skater kit. It hands its scene and track to the check (self.__skate) so
// the check can measure where the blades are and whether the ice reflects.
// Not a published world.
(function () {
  var PI = Math.PI;
  // two 112 m straights and two bends of radius 30 m, anticlockwise as ovals are skated
  var pts = [], R = 30, S = 112;
  for (var i = 0; i < 48; i++) {
    var per = 2 * S + 2 * PI * R, d = i / 48 * per, x, z;
    if (d < S) { x = -S / 2 + d; z = -R; }
    else if (d < S + PI * R) { var a = (d - S) / R; x = S / 2 + Math.sin(a) * R; z = -Math.cos(a) * R; }
    else if (d < 2 * S + PI * R) { x = S / 2 - (d - S - PI * R); z = R; }
    else { var b = (d - 2 * S - PI * R) / R; x = -S / 2 - Math.sin(b) * R; z = Math.cos(b) * R; }
    pts.push([x, 0, -z]);
  }
  var NATIONS = [['NED', '#F36C21', '#FFFFFF', '#1B1B1B'], ['NOR', '#C8102E', '#FFFFFF', '#00205B'], ['JPN', '#FFFFFF', '#BC002D', '#111111'], ['CAN', '#D52B1E', '#FFFFFF', '#111111']];
  function kit(n, k) {
    var c = NATIONS[n % NATIONS.length];
    return { color: c[1], trim: c[2], accent: c[3], code: c[0], number: String(k), pattern: ['panels', 'split', 'chevron', 'band'][n % 4] };
  }
  GameMog.world({
    assets: ['human-athlete-male', 'human-athlete-female'],
    theme: { sky: '#9BC4E6', fog: '#DDE6EE', ink: '#101820', panel: '#FFFFFF', accent: '#E4002B', font: 'Barlow Condensed' },
    graphics: { exposure: 1, environment: true, bloom: { strength: 0.4, threshold: 1.2 }, shadows: { extent: 30, mapSize: 2048 } },
    camera: { distance: 6.5, height: 2.6, fov: 58 },
    track: { width: 12, points: pts },
    build: function (ctx) {
      var T = ctx.THREE; self.__skate = { scene: ctx.scene, track: ctx.track };
      var sun = new T.DirectionalLight('#FFF6EC', 2.6); sun.position.set(20, 90, 10); sun.castShadow = true;
      ctx.scene.add(sun, new T.HemisphereLight('#E6EEF7', '#8C96A0', 1));
      ctx.sky({ top: '#3F7FCB', horizon: '#DDE9F2', bottom: '#8C9AA6', sun: [0.2, 0.9, 0.1] });
      var ice = new T.MeshPhysicalMaterial({ color: '#F4F7FA', roughness: 0.55, clearcoat: 1, clearcoatRoughness: 0.03 });
      ctx.mirror(ice, { y: 0, strength: 1 });
      var g = new T.PlaneGeometry(320, 160); g.rotateX(-PI / 2);
      var sheet = new T.Mesh(g, ice); sheet.receiveShadow = true; ctx.scene.add(sheet);
      ctx.scene.add(ctx.track.ribbon({ width: 0.1, offset: 0, y: 0.004, material: new T.MeshBasicMaterial({ color: '#C8102E' }) }));
      // a screen showing the runtime's live broadcast
      var tv = ctx.broadcast();
      if (tv) { var sc = new T.Mesh(new T.PlaneGeometry(16, 9), new T.MeshStandardMaterial({ color: '#000', emissive: '#FFF', emissiveMap: tv })); sc.position.set(0, 8, -60); ctx.scene.add(sc); self.__skate.tv = true; }
      // a row of bright posts outside, so the ice has something to mirror
      var post = new T.MeshStandardMaterial({ color: '#223', emissive: '#FFE9C8', emissiveIntensity: 4 });
      for (var k = 0; k < 24; k++) { var a = k / 24 * 2 * PI, m = new T.Mesh(new T.BoxGeometry(1, 6, 1), post); m.position.set(Math.cos(a) * 95, 3, Math.sin(a) * 55); ctx.scene.add(m); }
    },
    player: function (ctx) { var me = ctx.assets.skater('human-athlete-male', { skin: 'african', height: 1.84, build: { muscle: 0.85, lean: 0.5 }, suit: { color: '#15264F', trim: '#E4002B', accent: '#FFFFFF', code: 'USA', number: '1', pattern: 'panels' }, name: 'Lab (USA)', color: '#15264F' }); if (self.__skate) self.__skate.player = me && me.object; return me; },
    rival: function (ctx, k) { return ctx.assets.skater(k % 2 ? 'human-athlete-female' : 'human-athlete-male', { skin: 'caucasian', height: 1.76, build: { muscle: 0.8, lean: 0.5 }, suit: kit(k, k), name: 'Rival ' + k, color: NATIONS[k % 4][1] }); },
    obstacles: function () { return []; },
  });
})();
