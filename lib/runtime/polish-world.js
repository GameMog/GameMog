// Runtime check fixture: AI Alps' polish options (5 Oct) on their own ground. A punches-only tank (open.kicks: false, the
// held haymaker), the heat held to the clock and capped (open.heat: kos 0, max 4, no bosses or police of its own, a boss
// bringing one man and only into room under maxEnemies), coins that fly low (open.coinFly: 'low'), faces left out far
// off (open.lod), a dressed crowd in sunglasses and beanies on a dance floor and at a bar, and a story whose beats wait
// 3 s for a boss (story.wait), the first naming none, the second its own. A short intro and outro, for the touch pad.
// Not a published world.
(function () {
  var DJ = [0, 24];
  GameMog.world({
    assets: ['human-athlete-male', 'human-athlete-female'],
    theme: { sky: '#1C2234', fog: '#3A4258', ink: '#FFFFFF', accent: '#FF7A3D', font: 'Oxanium' },
    camera: { distance: 5.2, height: 1.6, fov: 54 },
    open: {
      bounds: { x: [-40, 40], z: [-40, 40] },
      spawn: [0, 0, 0],
      health: 1000, maxEnemies: 3, weapons: false,
      kicks: false, jump: false, dodge: false, tank: true,
      heat: { every: 15, kos: 0, max: 4, bosses: false, police: false, escort: 1, room: true },
      coinFly: 'low', lod: 10,
      civilians: {
        count: 8, wander: false,
        zones: [{ x: 0, z: 20, r: 4, count: 5, stance: 'dance', face: DJ }, { x: -14, z: -16, r: 2.5 }],
        stances: { talk: 2, phone: 1, arms: 1 },
        look: function (ctx, i) {
          return { clothes: { shirt: { kind: 'turtleneck', color: ['#141416', '#E9E4DA', '#4A1020'][i % 3] }, jacket: { kind: 'puffer', color: ['#C1121F', '#0B0B0D', '#2F4F6F'][i % 3] }, pants: { kind: 'trousers', color: '#16161A' } },
            gear: i % 2 ? { shades: '#060607' } : { beanie: { color: '#C1121F', pom: '#F2F2EE' } } };
        },
      },
      goal: { gm: 400, title: 'Paid in full', text: 'The check is over.' },
      hud: { gm: 'Fund', banner: 'A polish check.' },
      intro: { shots: [
        { t: 3, fade: 'in', cam: { from: [3, 1.7, -4], to: [2.4, 1.7, -3.2], look: 'og' }, cast: [{ id: 'og', at: [0, 0], face: [0, 8] }], say: 'A line of the scene, low on a phone, where the pad was.' },
        { t: 3, cam: { from: [-3, 1.8, -4], to: [-2.4, 1.8, -3.4], look: 'og' }, say: 'And another.' },
      ] },
      outro: { shots: [{ t: 4, fade: 'in', cam: { from: [3, 1.7, -4], to: [2.4, 1.7, -3.2], look: 'og' }, cast: [{ id: 'og', at: [0, 0], face: [0, 8] }], say: 'The end of it.' }] },
      story: {
        objective: 'Get 100 GM', wait: 3,
        beats: [
          { gm: 100, banner: 'Chapter 2', objective: 'Hold the floor', shots: [{ t: 2.5, cam: { from: [2, 1.7, -3], to: [1.6, 1.7, -2.4], look: 'og' }, cast: [{ id: 'og', at: [0, 0], face: [0, 8] }], say: 'He is still out there.' }] },
          { gm: 200, banner: 'Chapter 3', objective: 'Take the Promoter down', boss: 'The Promoter', shots: [{ t: 2.5, cam: { from: [-2, 1.7, -3], to: [-1.6, 1.7, -2.4], look: 'og' }, cast: [{ id: 'og', at: [0, 0], face: [0, 8] }], say: 'Someone else wants a word.' }] },
        ],
      },
      crew: {
        thug: { hp: 1, gm: 6, names: ['Bouncer'] },
        cop: { hp: 2, names: ['Guard'], weapon: { kind: 'baton' } },
        boss: { hp: 60, damage: 1, names: ['Big Lou'] },
      },
    },
    build: function (ctx) {
      var T = ctx.THREE;
      ctx.sky({ top: '#141A2A', horizon: '#4A5270', bottom: '#20222A' });
      ctx.scene.add(new T.HemisphereLight('#C8D4EC', '#3A3630', 0.9));
      var sun = new T.DirectionalLight('#FFE6C8', 1.8); sun.position.set(-12, 20, -6); sun.castShadow = true; ctx.scene.add(sun);
      var ground = new T.Mesh(new T.PlaneGeometry(90, 90).rotateX(-Math.PI / 2), new T.MeshStandardMaterial({ color: '#6E7480', roughness: 0.9 }));
      ground.receiveShadow = true; ctx.scene.add(ground);
      var booth = new T.Mesh(new T.BoxGeometry(3, 1.1, 1), new T.MeshStandardMaterial({ color: '#2A2E3A', emissive: '#FF3D7F', emissiveIntensity: 0.25 }));
      booth.position.set(DJ[0], 0.55, DJ[1] + 2); ctx.scene.add(booth); ctx.solid(booth);
    },
    player: function (ctx) {
      return ctx.assets.human('human-athlete-male', { name: 'Tester', color: '#FF7A3D', skin: 'caucasian', hair: 'short04', height: 1.95, build: { muscle: 1, lean: 0.4 } });
    },
  });
})();
