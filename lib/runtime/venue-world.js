// Runtime check fixture: a DJ set heard from the booth (music.source; AI Alps, the owner 4 Oct, picking "Funky House":
// "It would play from the DJ booth: loud and full at the party, muffled and distant across the rest of the resort"),
// and, for a world on its own ground, shadows and live reflections that follow the hero (graphics.shadows.follow and
// reflections: 'hero') and everything compiled before the world is ready (open.warm). A terrace of snow with the booth
// at its north end; a chalet's room (a box on the ground) off to the west; an opening scene shot first by the booth,
// then from far down the valley; a bottle on the bar for the warm-up's shards. The check also runs this world without
// the source (the music as it always was), with plain follow and plain reflections, and without the warm-up.
// Not a published world.
(function () {
  var BOOTH = [0, 1.5, 9];
  GameMog.world({
    assets: ['human-athlete-male'],
    theme: { sky: '#141A2A', fog: '#2A3048', ink: '#FFFFFF', accent: '#FF7A3D', font: 'Oxanium' },
    graphics: { exposure: 1, environment: true, shadows: { follow: 'hero', extent: 30 }, reflections: 'hero' },
    camera: { distance: 4.6, height: 1.6, fov: 55 },
    music: { track: 'music-funky-house', source: { at: BOOTH, near: 8, far: 140, floor: 0.12, boost: 1.6, sub: 0.8, crowd: 0.6, keep: true, rooms: [{ min: [-46, -24], max: [-26, -6] }] } },
    open: {
      bounds: { x: [-60, 60], z: [-110, 30] },
      spawn: [0, -14, 0],
      civilians: 0, maxEnemies: 2, health: 1000,
      heat: { every: 180 },
      warm: true,
      weapons: { count: 1, kinds: { bottle: 1 }, spots: [{ x: 6, z: 2, y: 1.05, kind: 'bottle', stand: true }], every: 600 },
      hud: { gm: 'Fund', banner: 'A venue check.' },
      intro: { shots: [
        { t: 7, fade: 'in', cam: { from: [-3, 2.2, -4], to: [-2, 2.2, -3], look: [0, 1.4, 9] }, cast: [{ id: 'og', at: [0, -14], face: [0, 9] }], place: 'The terrace', time: '23:40' },
        { t: 7, cam: { from: [55, 7, -75], to: [56, 7, -76], look: [0, 1.4, 9] }, say: 'From down the valley.' },
      ] },
      crew: { thug: { hp: 1, gm: 5, names: ['Bouncer'] } },
    },
    build: function (ctx) {
      var T = ctx.THREE;
      ctx.sky({ top: '#0E1322', horizon: '#3A4262', bottom: '#1A1C24' });
      ctx.scene.add(new T.HemisphereLight('#C8D4EC', '#5A5E6A', 0.8));
      var sun = new T.DirectionalLight('#E8EEFF', 2); sun.position.set(-30, 50, -20); sun.castShadow = true; ctx.scene.add(sun);
      var snow = new T.Mesh(new T.PlaneGeometry(160, 180).rotateX(-Math.PI / 2), new T.MeshStandardMaterial({ color: '#E6EAF0', roughness: 0.85 }));
      snow.position.set(0, 0, -40); snow.receiveShadow = true; ctx.scene.add(snow);
      // the booth, the bar a bottle stands on, and the chalet's floor (its room is the music's, a box on the ground)
      var booth = new T.Mesh(new T.BoxGeometry(3.2, 1.2, 1.2), new T.MeshStandardMaterial({ color: '#22262E', emissive: '#FF3D7F', emissiveIntensity: 0.3 }));
      booth.position.set(BOOTH[0], 0.6, BOOTH[2]); booth.castShadow = true; ctx.scene.add(booth); ctx.solid(booth);
      var bar = new T.Mesh(new T.BoxGeometry(2.4, 1.05, 0.7), new T.MeshStandardMaterial({ color: '#5A3A24', roughness: 0.6 }));
      bar.position.set(6, 0.525, 2.2); bar.castShadow = true; ctx.scene.add(bar); ctx.solid(bar);
      var floor = new T.Mesh(new T.BoxGeometry(20, 0.05, 18), new T.MeshStandardMaterial({ color: '#6A4A30', roughness: 0.7 }));
      floor.position.set(-36, 0.025, -15); ctx.scene.add(floor);
      // posts for the sun to throw shadows from, along the walk down the valley
      for (var i = 0; i < 8; i++) {
        var post = new T.Mesh(new T.BoxGeometry(0.4, 3, 0.4), new T.MeshStandardMaterial({ color: '#30343C' }));
        post.position.set(i % 2 ? 4 : -4, 1.5, -10 - i * 12); post.castShadow = true; ctx.scene.add(post); ctx.solid(post);
      }
    },
    player: function (ctx) {
      return ctx.assets.human('human-athlete-male', { name: 'Tester', color: '#FF7A3D', skin: 'caucasian', hair: 'short04', height: 1.9, build: { muscle: 0.9, lean: 0.4 } });
    },
  });
})();
