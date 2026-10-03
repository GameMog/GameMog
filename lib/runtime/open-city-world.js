// Runtime check fixture: an open world on the city map (open.map 'city', from
// Spiderbench; lib/runtime/maps/city) with the traversal on: a midtown
// district of avenues, streets and blocks at dusk, the hero swinging between
// its towers. Not a published world.
(function () {
  GameMog.world({
    assets: ['human-athlete-male'],
    theme: { sky: '#0A1022', fog: '#121A2C', ink: '#FFFFFF', accent: '#FF7A3D', font: 'Oxanium' },
    camera: { distance: 5.2, height: 1.6, fov: 54 },
    graphics: { preset: 'moonlit', exposure: 0.55, environment: { intensity: 0.25 }, bloom: { strength: 0.55, threshold: 1.1, radius: 0.6 } },
    open: {
      map: 'city',
      city: { district: 'midtown', time: 'night' },
      spawn: [0, -280, 180],
      civilians: 0, weapons: false, maxEnemies: 6, coins: false,
      traversal: { line: '#1C1E22' },
      crew: { thug: { climb: 0.5 } },
      hud: { banner: 'The city.' },
      // an opening scene up on a roof (a mark with a height: [x, z, y]); the run starts where it leaves him
      intro: { shots: [{ t: 3, fade: 'in', place: 'MIDTOWN', cam: { from: [8, 44, -300], to: [10, 42, -302], look: [19, 37, -305] }, cast: [{ id: 'og', at: [19, -305, 37], face: [-16, -305] }] }] },
    },
    player: function (ctx) {
      return ctx.assets.human('human-athlete-male', { name: 'Runner', color: '#FF7A3D', skin: 'caucasian2', hair: 'short04', height: 1.82, clothes: { shirt: { kind: 'tank', color: '#F4F1EA' }, pants: { kind: 'jeans', color: '#4A6A92' } } });
    },
  });
})();
