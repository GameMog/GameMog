// Runtime check fixture: a party crowd the world dresses and places (open.civilians as an object; AI Alps, the owner 4 Oct:
// "he can pick up bottles, glasses and beat club goers over the head", and "One party, rising stakes: all the action
// stays at the DJ party"), and snow underfoot (open.steps). Eighteen party-goers in puffers and turtlenecks: ten on a
// dance floor facing the DJ's booth, four at a bar, four in a lounge (the lounge names no count, so it takes the rest),
// none of them moving off their spot (wander: false), and every enemy the director wants coming out of the crowd near
// the hero (turn, share 1). crew.civ has a look of its own (a camel coat), which the crowd's look overrides; the check
// also runs this world with `civilians: 12` (the street's people as they always were) and with a crowd that names no
// look (crew.civ's). Not a published world.
(function () {
  var BOOTH = [0, 9];
  var CROWD = {
    count: 18,
    look: function (ctx, i) {
      return {
        body: i % 3 ? 'human-athlete-male' : 'human-athlete-female',
        clothes: { shirt: { kind: 'turtleneck', color: ['#F2EEE6', '#1B1B1F', '#7A1E2B'][i % 3] }, jacket: { kind: 'puffer', color: ['#F4F1EA', '#121214', '#B0122A', '#2E4F8A'][i % 4] },
          pants: { kind: 'trousers', color: '#1B1B1F' }, boots: '#EDEBE6', gloves: i % 2 ? '#1A1A1C' : false },
        gear: i % 2 ? { beanie: { color: '#F2F2EE', pom: '#C8102E' } } : null,
      };
    },
    stances: { dance: 5, talk: 2, phone: 1, arms: 1, shift: 1 },
    zones: [
      { x: 0, z: 2, r: 4.5, count: 10, stance: 'dance', face: BOOTH },
      { x: -11, z: 2, r: 2.5, count: 4 },
      { x: 11, z: 2, r: 2.5 },
    ],
    wander: false,
    turn: { kind: 'thug', share: 1 },
  };
  GameMog.world({
    assets: ['human-athlete-male', 'human-athlete-female'],
    theme: { sky: '#141A2A', fog: '#2A3048', ink: '#FFFFFF', accent: '#FF7A3D', font: 'Oxanium' },
    graphics: { exposure: 1, environment: true },
    camera: { distance: 5, height: 1.7, fov: 55 },
    open: {
      bounds: { x: [-40, 40], z: [-40, 40] },
      spawn: [0, -14, 0],
      civilians: CROWD,
      steps: 'snow',
      maxEnemies: 3, health: 1000,
      heat: { every: 180 },
      weapons: false,
      hud: { gm: 'Fund', banner: 'A crowd check.' },
      crew: {
        thug: { hp: 1, gm: 5, names: ['Bouncer'] },
        civ: { look: function (ctx, i) { return { clothes: { shirt: { kind: 'sweater', color: '#E8E1D2' }, jacket: { kind: 'coat', color: '#B08A5A' }, pants: { kind: 'trousers', color: '#2A2A30' }, boots: '#2A1D14' } }; } },
      },
    },
    build: function (ctx) {
      var T = ctx.THREE;
      ctx.sky({ top: '#0E1322', horizon: '#3A4262', bottom: '#1A1C24' });
      ctx.scene.add(new T.HemisphereLight('#C8D4EC', '#5A5E6A', 0.9));
      var sun = new T.DirectionalLight('#E8EEFF', 1.6); sun.position.set(-12, 20, -6); ctx.scene.add(sun);
      // a terrace of snow, and the DJ's booth the dance floor faces
      var ground = new T.Mesh(new T.PlaneGeometry(90, 90).rotateX(-Math.PI / 2), new T.MeshStandardMaterial({ color: '#E6EAF0', roughness: 0.85 })); ctx.scene.add(ground);
      var booth = new T.Mesh(new T.BoxGeometry(3.2, 1.2, 1.2), new T.MeshStandardMaterial({ color: '#22262E', emissive: '#FF3D7F', emissiveIntensity: 0.3 }));
      booth.position.set(BOOTH[0], 0.6, BOOTH[1]); ctx.scene.add(booth); ctx.solid(booth);
    },
    player: function (ctx) {
      return ctx.assets.human('human-athlete-male', { name: 'Tester', color: '#FF7A3D', skin: 'caucasian', hair: 'short04', height: 1.9, build: { muscle: 0.9, lean: 0.4 } });
    },
  });
})();
