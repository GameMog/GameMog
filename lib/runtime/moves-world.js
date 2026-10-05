// Runtime check fixture: the motion pack (4 Oct, AI Alps). A dance floor in the opening shot: a Macarena, the Twist, a
// seated talker, a drinker leaning on a bar, a drunk walking past and a guest who cheers, raises a glass and smashes.
// The check boots it twice, with human-moves-male listed and without it: the pack's clips must be on the human only when
// it is listed (without it, the stances fall back to standing). Not a published world.
(function () {
  var M = 'human-athlete-male';
  var LOOK = { body: M, skin: 'caucasian', hair: 'short04', hairColor: '#3A2A1E', clothes: { shirt: { kind: 'shirt', color: '#E8E4DA' }, pants: { kind: 'trousers', color: '#2A2E38' } } };
  GameMog.world({
    assets: ['human-athlete-male', 'human-moves-male'],
    theme: { sky: '#BFD6EE', fog: '#D8E4EE', ink: '#111111', accent: '#FF7A3D', font: 'Oxanium' },
    graphics: { exposure: 1 },
    open: {
      bounds: { x: [-40, 40], z: [-40, 40] }, spawn: [0, 30, 180], civilians: 0, maxEnemies: 0, weapons: false, coins: false,
      intro: { shots: [
        { t: 30, cam: { from: [0, 1.6, 8], look: [0, 0.9, 0], fov: 50 }, cast: [
          { id: 'og', at: [0, 30], stance: 'shift' },
          { id: 'macarena', kind: 'civ', name: 'Macarena', ghost: true, at: [-4, 0], face: [-4, 10], stance: 'danceMacarena', look: LOOK },
          { id: 'twist', kind: 'civ', name: 'Twist', ghost: true, at: [-2, 0], face: [-2, 10], stance: 'danceTwist', look: LOOK },
          { id: 'sitter', kind: 'civ', name: 'Sitter', ghost: true, at: [0, 0], face: [0, 10], stance: 'sitTalk', look: LOOK },
          { id: 'leaner', kind: 'civ', name: 'Leaner', ghost: true, at: [2, 0], face: [2, 10], stance: 'leanBar', look: LOOK },
          { id: 'guest', kind: 'civ', name: 'Guest', ghost: true, at: [4, 0], face: [4, 10], stance: 'shift', look: LOOK,
            act: [['cheer', 0.5, 1], ['toast', 2.5, 1], ['drink', 4.5, 1.5], ['smash', 9, 1]] },
          { id: 'drunk', kind: 'civ', name: 'Drunk', ghost: true, at: [-6, -3], to: [6, -3], speed: 0.7, gait: 'drunkWalk', stance: 'drunkIdle', look: LOOK },
        ] },
      ] },
    },
    build: function (ctx) {
      var g = new ctx.THREE.Mesh(new ctx.THREE.PlaneGeometry(200, 200), new ctx.THREE.MeshStandardMaterial({ color: '#B9B4A8', roughness: 0.9 }));
      g.rotation.x = -Math.PI / 2; ctx.scene.add(g);
      var l = new ctx.THREE.DirectionalLight('#FFF4E4', 2.2); l.position.set(4, 8, 10); ctx.scene.add(l);
      ctx.scene.add(new ctx.THREE.HemisphereLight('#DCE8F4', '#8A8070', 1.1));
      // what the world was given: the human's clip names as ctx.assets.info lists them
      var info = ctx.assets.info(M);
      self.__moves = { clips: info && info.clips ? info.clips.slice() : [] };
    },
    player: function (ctx) { return ctx.assets.human(M, { name: 'Tester', color: '#FF7A3D' }); },
  });
})();
