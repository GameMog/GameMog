// Runtime check fixture: the wardrobe (3 Oct, the owner: widen the human kit). Two rows of seven, every
// garment and piece of gear the runtime paints or hangs on a person, staged as an opening scene. Not a published world.
(function () {
  var M = 'human-athlete-male', F = 'human-athlete-female';
  var L = [
    { body: M, skin: 'caucasian', hair: 'short04', clothes: { shirt: { kind: 'hoodie', color: '#6B6F75' }, pants: { kind: 'joggers', color: '#1C1D21' } }, gear: { beanie: { color: '#B8302A', pom: '#F2F2EE' }, backpack: '#2D4F7E' } },
    { body: F, skin: 'asian', hair: 'short02', clothes: { shirt: { kind: 'sweater', color: '#2C4A63', color2: '#E8E1D2', print: 'stripes' }, pants: { kind: 'jeans', color: '#3E5A80' } }, gear: { glasses: '#5A3A22' } },
    { body: M, skin: 'african', hair: 'short02', clothes: { shirt: { kind: 'shirt', color: '#F2F2EE', tie: '#8C1C1C' }, pants: { kind: 'trousers', color: '#1D2536' }, jacket: { kind: 'blazer', color: '#1D2536' } } },
    { body: F, skin: 'caucasian', hair: 'short02', clothes: { shirt: { kind: 'scrubs', color: '#3A8A8A' }, pants: { kind: 'trousers', color: '#3A8A8A' } }, gear: { mask: '#9CCBE6' } },
    { body: M, skin: 'asian', hair: 'short04', clothes: { shirt: { kind: 'turtleneck', color: '#141416' }, pants: { kind: 'leggings', color: '#141416' }, boots: '#2A1D14' } },
    { body: F, skin: 'african', hair: 'afro01', clothes: { shirt: { kind: 'dress', color: '#A82A2A' }, pants: { kind: 'none' }, boots: '#141416' } },
    { body: M, skin: 'caucasian2', hair: 'short02', clothes: { shirt: { kind: 'shirt', color: '#DFE3E8' }, pants: { kind: 'trousers', color: '#2B2D31' }, jacket: { kind: 'coat', color: '#A8906A' } }, gear: { glasses: '#101012' } },
    { body: F, skin: 'caucasian', hair: 'short04', clothes: { shirt: { kind: 'tee', color: '#F2F2EE' }, pants: { kind: 'track', color: '#1D2B4B', color2: '#F2F2EE' }, jacket: { kind: 'puffer', color: '#D86A3A' } }, gear: { beanie: '#1C1D21' } },
    { body: M, skin: 'african', hair: 'short04', clothes: { shirt: { kind: 'tee', color: '#D9C22E' }, pants: { kind: 'trousers', color: '#D9C22E' }, jacket: { kind: 'hazmat', color: '#D9C22E' }, gloves: '#141416', boots: '#141416' }, gear: { mask: '#E8F0EA' } },
    { body: M, skin: 'caucasian', hair: 'short02', clothes: { shirt: { kind: 'tee', color: '#3B5B3A' }, pants: { kind: 'cargo', color: '#5A5448' }, gloves: '#2A2A2A', boots: '#3A2A1E' }, gear: { cap: { color: '#3B5B3A' } } },
    { body: F, skin: 'asian', hair: 'afro01', clothes: { shirt: { kind: 'hoodie', color: '#C49A3A' }, pants: { kind: 'leggings', color: '#1A1A1C' } }, gear: { backpack: '#141416' } },
    { body: M, skin: 'caucasian2', hair: 'short04', clothes: { shirt: { kind: 'sweater', color: '#7A2A28' }, pants: { kind: 'track', color: '#141416', color2: '#E06A5A' } } },
    { body: F, skin: 'african', hair: 'short02', clothes: { shirt: { kind: 'shirt', color: '#BFD9E8' }, pants: { kind: 'trousers', color: '#141416' }, jacket: { kind: 'blazer', color: '#6A2E4A' } }, gear: { glasses: '#D4AF37' } },
    { body: F, skin: 'caucasian', hair: 'short04', clothes: { shirt: { kind: 'long', color: '#E8E1D2' }, pants: { kind: 'jeans', color: '#23324A' }, jacket: { kind: 'puffer', color: '#2D5A9A' } }, gear: { backpack: '#C05A24' } },
  ];
  function cast(from, to, z, x0) {
    var out = [{ id: 'og', at: [0, 30], stance: 'shift' }];
    for (var i = from; i < to; i++) out.push({ id: 'p' + i, kind: 'civ', name: 'P' + i, ghost: true, at: [x0 + (i - from - 3) * 1.15, z], face: [x0 + (i - from - 3) * 1.15, z + 10], stance: 'shift', look: L[i] });
    return out;
  }
  GameMog.world({
    assets: ['human-athlete-male', 'human-athlete-female'],
    theme: { sky: '#BFD6EE', fog: '#D8E4EE', ink: '#111111', accent: '#FF7A3D', font: 'Oxanium' },
    graphics: { exposure: 1 },
    open: {
      bounds: { x: [-40, 40], z: [-40, 40] }, spawn: [0, 30, 180], civilians: 0, maxEnemies: 0, weapons: false, coins: false,
      intro: { shots: [
        { t: 30, cam: { from: [0, 1.25, 6.2], look: [0, 1.0, 0], fov: 46 }, cast: cast(0, 7, 0, 0) },
        { t: 30, cam: { from: [20, 1.25, 6.2], look: [20, 1.0, 0], fov: 46 }, cast: cast(7, 14, 0, 20) },
        { t: 30, cam: { from: [1.2, 1.5, -3.2], look: [-1.0, 1.1, 0], fov: 40 }, cast: [] },
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
