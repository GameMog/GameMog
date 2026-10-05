// Runtime check fixture: the impact (the owner, 5 Oct, on the first Mog of AI Alps: "punches don't feel satisfying like
// are connecting and giving me the feeling of a hit"). A hero who only punches (open.kicks: false, so open.impact is on
// without being named), as tall as AI Alps' machine (1.95 m), so he leans in over the men he hits; a crowd of eight at a
// bar a few metres off (open.civilians as an object), who never turn on him, for the "ooh"; thugs who take a long chain
// before they drop, and bikers (unarmed) who drop at the first blow, for the knockouts. The check also runs it as a
// boxer (fight: 'boxing', the Typson Mog's) and with impact: false (the runtime as it was). Not a published world.
(function () {
  GameMog.world({
    assets: ['human-athlete-male', 'human-athlete-female'],
    theme: { sky: '#1A2236', fog: '#2C3450', ink: '#FFFFFF', accent: '#FF7A3D', font: 'Oxanium' },
    graphics: { exposure: 1, environment: true },
    camera: { distance: 5, height: 1.6, fov: 55 },
    open: {
      bounds: { x: [-30, 30], z: [-30, 30] },
      spawn: [0, -6, 0],
      kicks: false, jump: false,
      civilians: { count: 8, zones: [{ x: 0, z: 4, r: 2.5, count: 8, stance: 'talk' }], stances: { talk: 2, arms: 1, shift: 1 }, wander: false,
        look: function (ctx, i) { return { body: i % 2 ? 'human-athlete-female' : 'human-athlete-male', clothes: { shirt: { kind: 'sweater', color: ['#E8E1D2', '#2A2A30', '#7A1E2B'][i % 3] }, pants: { kind: 'trousers', color: '#1B1B1F' }, boots: '#2A1D14' } }; } },
      maxEnemies: 3, health: 1000, heat: { every: 180 },
      weapons: false,
      hud: { gm: 'GM', banner: 'Every punch lands.' },
      crew: { thug: { hp: 40, damage: 1, names: ['Sparring partner'] }, biker: { hp: 1, damage: 1, weapon: null, names: ['Glass jaw'] } },
    },
    build: function (ctx) {
      var T = ctx.THREE;
      ctx.sky({ top: '#121A2C', horizon: '#3A4466', bottom: '#1A1C24' });
      ctx.scene.add(new T.HemisphereLight('#C8D4EC', '#5A5E6A', 0.9));
      var sun = new T.DirectionalLight('#FFF1DC', 1.8); sun.position.set(-12, 20, -6); ctx.scene.add(sun);
      ctx.scene.add(new T.Mesh(new T.PlaneGeometry(70, 70).rotateX(-Math.PI / 2), new T.MeshStandardMaterial({ color: '#8E8676', roughness: 0.9 })));
      var bar = new T.Mesh(new T.BoxGeometry(5, 1.1, 0.7), new T.MeshStandardMaterial({ color: '#3A2A1E', roughness: 0.6 }));
      bar.position.set(0, 0.55, 7); ctx.scene.add(bar); ctx.solid(bar);
    },
    player: function (ctx) {
      return ctx.assets.human('human-athlete-male', { name: 'Tester', color: '#FF7A3D', skin: 'caucasian', hair: 'short04', height: 1.95, build: { muscle: 1, lean: 0.4 } });
    },
  });
})();
