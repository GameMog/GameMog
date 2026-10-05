// Runtime check fixture: a party's weapons (AI Alps, the owner 4 Oct: "he can pick up bottles, glasses and beat club
// goers over the head"). An open world on its own ground with a long table whose top holds weapons.spots: wine bottles,
// a champagne magnum, tumblers and an ice bucket stood upright on it. Its bikers carry a bottle. The check takes one from
// the table, breaks a bottle over a man's head, dents the ice bucket twice and breaks it on the third blow, and boots it
// again without the party's kinds to see the street's mix come back. Not a published world.
(function () {
  var TOP = 0.76;
  GameMog.world({
    assets: ['human-athlete-male', 'human-moves-male'],
    theme: { sky: '#3A4660', fog: '#5A6478', ink: '#FFFFFF', accent: '#FF7A3D', font: 'Oxanium' },
    graphics: { exposure: 1, environment: true },
    camera: { distance: 4.2, height: 1.6, fov: 54 },
    open: {
      bounds: { x: [-30, 30], z: [-30, 30] },
      spawn: [0, 0, 0],
      civilians: 0, maxEnemies: 3, kicks: false,
      weapons: { count: 8, kinds: { bottle: 3, magnum: 1, glass: 2, bucket: 1 }, every: 12, drops: false, spots: [
        { x: -2.1, z: 5.75, y: TOP, kind: 'bottle', stand: true }, { x: -1.4, z: 5.75, y: TOP, kind: 'magnum', stand: true },
        { x: -0.7, z: 5.75, y: TOP, kind: 'glass', stand: true }, { x: 0, z: 5.75, y: TOP, kind: 'bottle', stand: true },
        { x: 0.7, z: 5.75, y: TOP, kind: 'glass', stand: true }, { x: 1.4, z: 5.75, y: TOP, kind: 'bucket', stand: true },
        { x: 2.1, z: 5.75, y: TOP, stand: true }, { x: 2.8, z: 5.75, y: TOP, stand: true },
      ] },
      crew: { biker: { weapon: 'bottle', moves: ['ffCross', 'cross'], names: ['Bottle man'] } },
      hud: { gm: 'GM', banner: 'Bottles on the table.' },
    },
    build: function (ctx) {
      var T = ctx.THREE;
      ctx.sky({ top: '#1E2638', horizon: '#6A7088', bottom: '#2A2C34' });
      ctx.scene.add(new T.HemisphereLight('#C8D4EC', '#3A3630', 0.9));
      var sun = new T.DirectionalLight('#FFE6C8', 1.8); sun.position.set(-12, 20, -6); ctx.scene.add(sun);
      var ground = new T.Mesh(new T.PlaneGeometry(80, 80).rotateX(-Math.PI / 2), new T.MeshStandardMaterial({ color: '#8E8678', roughness: 0.9 })); ctx.scene.add(ground);
      // the table: a white cloth over it, 6.4 m long, its top at 76 cm
      var table = new T.Mesh(new T.BoxGeometry(6.4, TOP, 0.8), new T.MeshStandardMaterial({ color: '#F2EEE6', roughness: 0.85 }));
      table.position.set(0.35, TOP / 2, 6); ctx.scene.add(table); ctx.solid(table);
    },
    player: function (ctx) {
      return ctx.assets.human('human-athlete-male', { name: 'Tester', color: '#FF7A3D', skin: 'caucasian', hair: 'short04', height: 1.9, build: { muscle: 0.9, lean: 0.4 } });
    },
  });
})();
