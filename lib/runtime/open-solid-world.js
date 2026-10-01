// Runtime check fixture: an open world on its own ground (no library map) that
// registers its colliders while it builds, as the API says to: a wall as a
// box, a post as a circle, and a crate as an object measured where it stands.
// The check walks into each and needs them to stop it, and still needs the
// edges to hold and a fight to work. Not a published world.
(function () {
  GameMog.world({
    assets: ['human-athlete-male'],
    theme: { sky: '#9CC0E0', fog: '#C8D8E6', ink: '#FFFFFF', accent: '#FF7A3D', font: 'Oxanium' },
    camera: { distance: 5.2, height: 1.6, fov: 54 },
    open: {
      bounds: { x: [-30, 30], z: [-30, 30] },
      spawn: [0, 0, 90],
      civilians: 0, weapons: false, maxEnemies: 3,
      hud: { gm: 'GM', banner: 'Walk into the wall.' },
    },
    build: function (ctx) {
      var T = ctx.THREE;
      ctx.scene.add(new T.HemisphereLight('#DDE8F4', '#6E6455', 1.1));
      var sun = new T.DirectionalLight('#FFF1DC', 2); sun.position.set(20, 30, 10); ctx.scene.add(sun);
      var ground = new T.Mesh(new T.PlaneGeometry(80, 80).rotateX(-Math.PI / 2), new T.MeshStandardMaterial({ color: '#A79C88', roughness: 0.95 })); ctx.scene.add(ground);
      var stone = new T.MeshStandardMaterial({ color: '#8C8C94', roughness: 0.8 });
      // the wall, east of the spawn: x 6 to 8, z -8 to 8 (a box)
      var wall = new T.Mesh(new T.BoxGeometry(2, 3, 16), stone); wall.position.set(7, 1.5, 0); ctx.scene.add(wall);
      ctx.solid({ min: { x: 6, z: -8 }, max: { x: 8, z: 8 } });
      // the post, west of it: radius 1.2 at x -6 (a circle)
      var post = new T.Mesh(new T.CylinderGeometry(1.2, 1.2, 3, 24), stone); post.position.set(-6, 1.5, 0); ctx.scene.add(post);
      ctx.solid({ x: -6, z: 0, r: 1.2 });
      // the crate, north: registered as the object itself, measured where it stands
      var crate = new T.Mesh(new T.BoxGeometry(3, 2, 3), new T.MeshStandardMaterial({ color: '#9A6B3E', roughness: 0.85 })); crate.position.set(0, 1, -8); ctx.scene.add(crate);
      ctx.solid(crate);
      self.__solids = { open: !!ctx.open, heat: ctx.open && ctx.open.heat };
    },
    player: function (ctx) {
      return ctx.assets.human('human-athlete-male', { name: 'Tester', color: '#FF7A3D', skin: 'caucasian', hair: 'short04', height: 1.8 });
    },
  });
})();
