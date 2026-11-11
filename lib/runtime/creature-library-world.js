// Runtime check fixture: the library's creatures (the owner, 10 Nov: the anymove animals and monsters, CC0) and its
// sound packs. The eight stand in a row, facing the camera, and go through their gaits and moves on a loop: standing,
// walking, running, a strike, a special, a hit, and down. Not a published world.
(function () {
  var IDS = ['creature-horse', 'creature-trex', 'creature-knight', 'creature-ogre', 'creature-ape', 'creature-centaur', 'creature-mech', 'creature-scorpion'];
  var X = [-21, -11, -4.5, -1, 3, 8, 14, 21];
  var made = [];
  GameMog.world({
    assets: IDS.concat(['sounds-impact', 'sounds-voice-fighter', 'human-athlete-male']),
    theme: { sky: '#BFD6EE', fog: '#D8E4EE', ink: '#111111', accent: '#FF7A3D', font: 'Oxanium' },
    graphics: { exposure: 1 },
    open: {
      bounds: { x: [-60, 60], z: [-60, 60] }, spawn: [0, 40, 180], civilians: 0, maxEnemies: 0, weapons: false, coins: false,
      // the row, then each one close for 4 s (from its front and a little to the side)
      intro: { shots: [{ t: 4, cam: { from: [0, 4.5, 30], look: [0, 2.2, 0], fov: 55 }, cast: [] }].concat([[-21, 2.4], [-11, 5.8], [-4.5, 1.85], [-1, 2.8], [3, 2.4], [8, 2.4], [14, 4], [21, 1.6]].map(function (c) {
        var h = c[1], d = Math.max(3.2, h * 2.1);
        return { t: 4, cam: { from: [c[0] + d * 0.35, h * 0.6, d], look: [c[0], h * 0.5, 0], fov: 42 }, cast: [] };
      })) },
    },
    build: function (ctx) {
      var T = ctx.THREE;
      var g = new T.Mesh(new T.PlaneGeometry(240, 240), new T.MeshStandardMaterial({ color: '#B9B4A8', roughness: 0.9 }));
      g.rotation.x = -Math.PI / 2; g.receiveShadow = true; ctx.scene.add(g);
      var l = new T.DirectionalLight('#FFF4E4', 2.4); l.position.set(10, 20, 24); l.castShadow = true; ctx.scene.add(l);
      ctx.scene.add(new T.HemisphereLight('#DCE8F4', '#8A8070', 1.1));
      IDS.forEach(function (id, i) {
        var c = ctx.assets.creature({ model: id, name: id });
        if (!c) return;
        c.object.position.set(X[i], 0, 0);
        ctx.scene.add(c.object);
        made.push({ id: id, c: c, n: 0, phase: i * 0.7 });
      });
      // (for the check: what was made, and the sound packs as a world sees them)
      window.__creatureCheck = { made: made.map(function (m) { return { id: m.id, model: m.c.model, height: m.c.height, radius: m.c.radius, clips: m.c.clips, timing: m.c.timing }; }),
        sound: function (id, name, o) { return ctx.assets.sound(id, name, o); } };
    },
    update: function (ctx, t, dt) {
      made.forEach(function (m) {
        var u = (t + m.phase) % 16, sp = 0, act = null, ko = false;
        if (u >= 3 && u < 6) sp = 1.4; else if (u >= 6 && u < 9) sp = 4.5;
        if (u >= 9 && u < 9.1) act = { name: 'strike', id: ++m.n };
        if (u >= 11 && u < 11.1) act = { name: 'special', id: ++m.n };
        if (u >= 12.5 && u < 12.6) act = { name: 'hit', id: ++m.n };
        if (u >= 13.5) ko = true;
        if (act) m.act = act;
        m.c.animate(t, dt, { speed: sp, brawl: { stance: 'fight', action: m.act || null, ko: ko } });
      });
    },
    player: function (ctx) { return ctx.assets.human('human-athlete-male', { name: 'Tester', color: '#FF7A3D' }); },
  });
})();
