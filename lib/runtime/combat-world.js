// Runtime check fixture: the platform's combat and bounty options (play.combat,
// play.bounty, play.coins: false) on a plain loop, with sword-carrying library
// runners on both sides. It hands its scene and the moments it heard to the
// check (self.__combat). Not a published world.
(function () {
  var pts = [], R = 70;
  for (var i = 0; i < 40; i++) { var a = i / 40 * Math.PI * 2; pts.push([Math.sin(a) * R * 1.4, 0, -Math.cos(a) * R]); }
  var seen = { lap: [], slay: [], swing: [], crash: [], start: [] };
  GameMog.world({
    assets: ['human-athlete-male', 'human-athlete-female'],
    play: { coins: false, bounty: { base: 100, step: 50, name: 'Test bounty' }, combat: { mark: '危' } },
    theme: { sky: '#C9B8A6', fog: '#D8CBBE', ink: '#1A1512', panel: '#F4ECE0', accent: '#B8322A', font: 'Barlow Condensed' },
    graphics: { exposure: 1, environment: true, bloom: { strength: 0.3, threshold: 1.2 }, shadows: { extent: 30, mapSize: 2048 } },
    camera: { distance: 6.5, height: 2.6, fov: 58 },
    track: { width: 10, points: pts },
    build: function (ctx) {
      var T = ctx.THREE;
      self.__combat = { scene: ctx.scene, seen: seen, play: ctx.play };
      ['lap', 'slay', 'swing', 'crash', 'start'].forEach(function (n) { ctx.on(n, function (e) { seen[n].push(e); }); });
      var sun = new T.DirectionalLight('#FFE2C0', 2.4); sun.position.set(-40, 50, 30); sun.castShadow = true;
      ctx.scene.add(sun, new T.HemisphereLight('#E8DCCF', '#6C6258', 1));
      ctx.sky({ top: '#7C8FA8', horizon: '#E6CDB0', bottom: '#8A7E72', sun: [-0.5, 0.35, 0.3] });
      var g = new T.PlaneGeometry(500, 500); g.rotateX(-Math.PI / 2);
      var ground = new T.Mesh(g, new T.MeshStandardMaterial({ color: '#B9AE9F', roughness: 0.95 })); ground.receiveShadow = true; ctx.scene.add(ground);
      ctx.scene.add(ctx.track.ribbon({ width: 10, offset: 0, y: 0.01, material: new T.MeshStandardMaterial({ color: '#8C7F70', roughness: 0.9 }) }));
    },
    player: function (ctx) {
      return ctx.assets.human('human-athlete-female', { skin: 'asian', height: 1.7, hair: 'short02', hairColor: '#111111', build: { muscle: 0.6, lean: 0.6 },
        suit: { color: '#1C2230', trim: '#9E2A2B', accent: '#D7C9A8', pattern: 'panels' }, weapon: { trail: '#FFE9C4' }, stance: 'guard', name: 'Kage', color: '#1C2230' });
    },
    rival: function (ctx, k) {
      return ctx.assets.human(k % 2 ? 'human-athlete-male' : 'human-athlete-female', { skin: 'asian', height: 1.78, build: { muscle: 0.8, lean: 0.5 },
        suit: { color: '#5A1E1B', trim: '#1A1A1A', accent: '#C9A45C', pattern: 'split' }, weapon: true, stance: 'guard', name: 'Ronin ' + k, color: '#5A1E1B' });
    },
    obstacles: function () { return []; },
  });
})();
