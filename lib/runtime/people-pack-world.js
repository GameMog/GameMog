// Runtime check fixture: the people pack (3 Oct, the owner: humans that look like people, not zombies). Two rows of
// seven wearing the pack's garments, shoes and hats, its hairstyles, its middle-aged and old skins and its age and weight
// shapes. Not a published world.
(function () {
  var M = 'human-athlete-male', F = 'human-athlete-female';
  var L = [
    { body: M, skin: 'caucasian', hair: 'short01', hairColor: '#3A2A1E', wear: ['male_casualsuit01', 'shoes01'] },
    { body: M, skin: 'african', hair: 'short03', wear: ['male_casualsuit02', 'shoes02'] },
    { body: M, skin: 'caucasian-old', hair: 'short01', hairColor: '#C8C4BC', build: { age: 0.85 }, wear: ['male_casualsuit03', 'shoes03'] },
    { body: M, skin: 'asian', hair: 'short03', build: { weight: 0.85 }, wear: ['male_casualsuit04', 'shoes04'] },
    { body: M, skin: 'african-middle', hair: 'short01', build: { age: 0.4 }, wear: ['male_casualsuit05', 'shoes05', 'fedora01'] },
    { body: M, skin: 'caucasian-middle', hair: 'short03', hairColor: '#5A4632', build: { age: 0.35, weight: 0.3 }, wear: ['male_elegantsuit01', 'shoes06'] },
    { body: M, skin: 'asian-old', hair: 'short01', hairColor: '#A8A49C', build: { age: 0.7, weight: 0.5 }, wear: ['male_worksuit01', 'shoes01'] },
    { body: F, skin: 'caucasian', hair: 'ponytail01', hairColor: '#6A4A2A', wear: ['female_casualsuit01', 'shoes02'] },
    { body: F, skin: 'african', hair: 'long01', hairColor: '#1A120C', wear: ['female_casualsuit02', 'shoes03'] },
    { body: F, skin: 'asian', hair: 'bob01', hairColor: '#14100C', wear: ['female_elegantsuit01', 'shoes04'] },
    { body: F, skin: 'african-middle', hair: 'braid01', hairColor: '#20140C', build: { age: 0.35 }, wear: ['female_sportsuit01', 'shoes05'] },
    { body: F, skin: 'caucasian-old', hair: 'bob02', hairColor: '#D8D4CC', build: { age: 0.9 }, wear: ['female_casualsuit01', 'shoes06', 'fedora_cocked'] },
    { body: F, skin: 'asian-middle', hair: 'short01', hairColor: '#2A1E14', build: { weight: 0.9 }, wear: [{ name: 'female_casualsuit02', color: '#C8D8F0' }, 'shoes01'] },
    { body: F, skin: 'african-old', hair: 'bob02', hairColor: '#B8B4AC', build: { age: 0.6, weight: 0.4 }, wear: ['female_elegantsuit01', 'shoes02'] },
  ];
  function cast(from, to, x0) {
    var out = [{ id: 'og', at: [0, 30], stance: 'shift' }];
    for (var i = from; i < to; i++) out.push({ id: 'p' + i, kind: 'civ', name: 'P' + i, ghost: true, at: [x0 + (i - from - 3) * 1.15, 0], face: [x0 + (i - from - 3) * 1.15, 10], stance: 'shift', look: L[i] });
    return out;
  }
  GameMog.world({
    assets: ['human-athlete-male', 'human-athlete-female', 'human-pack-male', 'human-pack-female'],
    theme: { sky: '#BFD6EE', fog: '#D8E4EE', ink: '#111111', accent: '#FF7A3D', font: 'Oxanium' },
    graphics: { exposure: 1 },
    open: {
      bounds: { x: [-40, 40], z: [-40, 40] }, spawn: [0, 30, 180], civilians: 0, maxEnemies: 0, weapons: false, coins: false,
      intro: { shots: [
        { t: 30, cam: { from: [0, 1.25, 6.2], look: [0, 1.0, 0], fov: 46 }, cast: cast(0, 7, 0) },
        { t: 30, cam: { from: [20, 1.25, 6.2], look: [20, 1.0, 0], fov: 46 }, cast: cast(7, 14, 20) },
        { t: 30, cam: { from: [-1.2, 1.6, 2.2], look: [-1.2, 1.4, 0], fov: 40 }, cast: [] },
      ] },
    },
    build: function (ctx) {
      var g = new ctx.THREE.Mesh(new ctx.THREE.PlaneGeometry(200, 200), new ctx.THREE.MeshStandardMaterial({ color: '#B9B4A8', roughness: 0.9 }));
      g.rotation.x = -Math.PI / 2; ctx.scene.add(g);
      var l = new ctx.THREE.DirectionalLight('#FFF4E4', 2.2); l.position.set(4, 8, 10); ctx.scene.add(l);
      ctx.scene.add(new ctx.THREE.HemisphereLight('#DCE8F4', '#8A8070', 1.1));
    },
    player: function (ctx) { return ctx.assets.human('human-athlete-male', { name: 'Tester', color: '#FF7A3D' }); },
  });
})();
