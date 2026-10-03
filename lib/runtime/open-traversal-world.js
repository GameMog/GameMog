// Runtime check fixture: an open world with the traversal on (open.traversal,
// lib/runtime/traversal). A street runs north to south between two rows of
// buildings of different heights, a tower at its end; the check runs, jumps,
// swings on the line from the roofs, zips to a marked point, runs up a wall,
// dives on a crowd below, and punches on the street; the thugs climb after a
// player on a roof. Not a published world.
(function () {
  // [x0, z0, x1, z1, height]
  var BLOCKS = [
    [8, -40, 20, -22, 12], [8, -18, 20, -4, 6], [8, 0, 20, 14, 18], [8, 18, 20, 34, 9],
    [-20, -40, -8, -26, 16], [-20, -22, -8, -6, 24], [-20, -2, -8, 12, 8], [-20, 16, -8, 34, 14],
    [-12, -70, 12, -56, 30],
  ];
  GameMog.world({
    assets: ['human-athlete-male'],
    theme: { sky: '#8FB4D8', fog: '#B8C8D8', ink: '#FFFFFF', accent: '#FF7A3D', font: 'Oxanium' },
    camera: { distance: 5.2, height: 1.6, fov: 54 },
    open: {
      bounds: { x: [-40, 40], z: [-80, 50] },
      spawn: [0, 30, 180],
      civilians: 0, weapons: false, maxEnemies: 6, coins: false,
      traversal: { line: '#1C1E22' },
      crew: { thug: { climb: 1 } },
      hud: { banner: 'Swing.' },
    },
    build: function (ctx) {
      var T = ctx.THREE;
      ctx.scene.add(new T.HemisphereLight('#DDE8F4', '#6E6455', 1.1));
      var sun = new T.DirectionalLight('#FFF1DC', 2.2); sun.position.set(30, 50, 20); sun.castShadow = true; ctx.scene.add(sun);
      ctx.scene.add(new T.Mesh(new T.PlaneGeometry(200, 200).rotateX(-Math.PI / 2), new T.MeshStandardMaterial({ color: '#7E7A74', roughness: 0.95 })));
      var wall = new T.MeshStandardMaterial({ color: '#B49A84', roughness: 0.85 });
      BLOCKS.forEach(function (b) {
        var w = b[2] - b[0], d = b[3] - b[1], h = b[4];
        var m = new T.Mesh(new T.BoxGeometry(w, h, d), wall); m.position.set((b[0] + b[2]) / 2, h / 2, (b[1] + b[3]) / 2); m.castShadow = true; m.receiveShadow = true; ctx.scene.add(m);
        ctx.solid({ min: { x: b[0], y: 0, z: b[1] }, max: { x: b[2], y: h, z: b[3] } });
      });
    },
    player: function (ctx) {
      return ctx.assets.human('human-athlete-male', { name: 'Climber', color: '#FF7A3D', skin: 'caucasian2', hair: 'short04', height: 1.82, clothes: { shirt: { kind: 'tank', color: '#F4F1EA' }, pants: { kind: 'jeans', color: '#4A6A92' } } });
    },
  });
})();
