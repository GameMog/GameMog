// Runtime check fixture: the punches-only tank (AI Alps' hero, the owner 4 Oct: "no kicks. just an array of
// punches", "no jumping", no dodge, "He walks through hits and blocks with his forearms"). An open world on its own
// ground whose hero sets open.kicks: false, open.jump: false, open.dodge: false and open.tank: true. The check throws
// many chains, presses Space, K, C and L, runs the finisher and lets a man hit him from the front and from behind.
// Not a published world.
(function () {
  GameMog.world({
    assets: ['human-athlete-male'],
    theme: { sky: '#9CB4D0', fog: '#C6D2E0', ink: '#FFFFFF', accent: '#FF7A3D', font: 'Oxanium' },
    camera: { distance: 5.2, height: 1.6, fov: 54 },
    open: {
      bounds: { x: [-30, 30], z: [-30, 30] },
      spawn: [0, 0, 90],
      civilians: 0, weapons: false, maxEnemies: 3,
      kicks: false, jump: false, dodge: false, tank: true,
      hud: { gm: 'GM', banner: 'Punches only.' },
    },
    build: function (ctx) {
      var T = ctx.THREE;
      ctx.scene.add(new T.HemisphereLight('#DDE8F4', '#6E6455', 1.1));
      var sun = new T.DirectionalLight('#FFF1DC', 2); sun.position.set(20, 30, 10); ctx.scene.add(sun);
      var ground = new T.Mesh(new T.PlaneGeometry(80, 80).rotateX(-Math.PI / 2), new T.MeshStandardMaterial({ color: '#A79C88', roughness: 0.95 })); ctx.scene.add(ground);
    },
    player: function (ctx) {
      return ctx.assets.human('human-athlete-male', { name: 'Tester', color: '#FF7A3D', skin: 'caucasian', hair: 'short04', height: 1.9, build: { muscle: 0.9, lean: 0.4 } });
    },
  });
})();
