// Miami OG: the flagship Open World (the owner, 27 Sep 2026). A Miami OG roams
// Ocean Drive at sunrise and knocks out whoever comes for him: street thugs,
// then bikers, then the police by patrol car, and a named boss at every third
// level of heat. The street is StarKnightt/ocean-drive (MIT), the runtime's
// Miami map; the people are the library's; the fight is the runtime's.
// All names are invented; no real person, gang, brand or game is depicted.
(function () {
  var SKIN = ['african', 'caucasian2', 'asian', 'caucasian'];
  function pick(list, i) { return list[i % list.length]; }
  GameMog.world({
    assets: ['human-athlete-male', 'human-athlete-female'],
    theme: { sky: '#F2A36B', fog: '#E9B999', ink: '#FFFFFF', accent: '#FF3D7F', font: 'Oxanium' },
    graphics: { exposure: 0.66, bloom: { strength: 0.42, threshold: 1.25, radius: 0.6 }, grade: { contrast: 1.06, saturation: 1.08, warmth: 0.25, vignette: 0.24, split: 0.35 }, motion: 0.12 },
    camera: { distance: 5.2, height: 1.55, fov: 54 },
    open: {
      map: 'ocean-drive',
      spawn: [-4, 30, 180],
      heat: { every: 40 },
      health: 100,
      // his mission (the owner, 28 Sep): every coin goes to his own club on South Beach
      hud: { gm: 'Club fund', banner: 'Stack GM for the club. Survive.' },
      // the opening scene: South Beach at sunrise, the OG, the corner his club will be on, and the crew that wants his money
      intro: {
        shots: [
          { t: 6, fade: 'in', place: 'SOUTH BEACH', time: 'OCEAN DRIVE  ·  6:12 AM',
            cam: { from: [60, 30, 92], to: [16, 14, 60], look: [-26, 7, 38], lookTo: [-24, 3, 38], fov: 46, fovTo: 40 },
            cast: [{ id: 'og', at: [-12.4, 50], to: [-12.4, 44], speed: 1.0, gait: 'walkCool', stance: 'shift' }] },
          { t: 5.5, say: 'They call him the OG. Born two blocks from here.',
            cam: { from: [-11.9, 0.9, 39.6], to: [-12.0, 1.0, 35.4], look: 'og', fov: 38 },
            cast: [{ id: 'og', to: [-12.6, 38.6], speed: 1.0 }] },
          { t: 7, say: 'Twenty years on this strip, and one dream: a club of his own, right here on South Beach.',
            cam: { from: [-11.6, 1.55, 40.2], to: [-15.2, 1.7, 39.4], look: [-30.6, 4.6, 33.3], lookTo: [-28, 3.2, 34.5], fov: 44, fovTo: 38 },
            cast: [{ id: 'og', path: [[-14.2, 38.2], [-24.4, 37.0]], speed: 1.75, gait: 'walk' }] },
          { t: 5, say: '“All it takes is money. Every coin on this street is mine.”',
            cam: { from: [-23.05, 1.62, 37.5], to: [-23.1, 1.64, 37.42], look: 'og', fov: 30 },
            cast: [{ id: 'og', at: [-24.4, 37.0], face: [-15, 37.6], stance: 'shift', act: [['shrug', 1.7, 1.1]] }] },
          { t: 6.5, say: 'But South Beach doesn’t give anything away.',
            cam: { from: [-21.6, 1.6, 22.2], to: [-21.9, 1.55, 22.9], look: [-27.2, 1.3, 27.2], lookTo: [-25.8, 1.4, 30.5], fov: 50 },
            cast: [
              { id: 'og', at: [-24.4, 37.0], face: [-26, 29.5] },
              { id: 't1', kind: 'thug', at: [-32.5, 25.5], path: [[-28.4, 25.5], [-25.9, 29.8]], speed: 1.5, gait: 'walkCool', stance: 'shift' },
              { id: 't2', kind: 'thug', at: [-35.5, 25.4], path: [[-28.4, 25.4], [-24.7, 29.1]], speed: 1.75, gait: 'walkCool', stance: 'shift' },
              { id: 't3', kind: 'thug', at: [-20.6, 24.4], to: [-23.3, 30.5], speed: 1.35, gait: 'walkCool', stance: 'shift' }] },
          { t: 4.5, say: '“Let’s get to work.”',
            cam: { from: [-24.6, 1.05, 26.4], to: [-24.5, 1.1, 27.1], look: 'og', fov: 42 },
            cast: [
              { id: 'og', at: [-24.4, 36.4], to: [-24.8, 33.6], speed: 1.0, gait: 'walkCool', stance: 'fight', face: 't2' },
              { id: 't1', at: [-25.9, 29.8], stance: 'fight', face: 'og', stay: true },
              { id: 't2', at: [-24.7, 29.1], stance: 'fight', face: 'og', stay: true },
              { id: 't3', at: [-23.3, 30.5], stance: 'fight', face: 'og', stay: true }] },
          { t: 5.5, fade: 'out', title: 'MIAMI OG', tagline: 'Knock them out. Take their GM. Every coin you stack goes to the club. Survive as long as you can.',
            cam: { from: [-21.5, 2, 35.5], to: [-14, 11, 48], look: [-26, 1.2, 33], fov: 44 } },
        ],
      },
      crew: {
        thug: {
          names: ['Corner boy', 'Hustler', 'Enforcer', 'Lookout', 'Muscle', 'Runner'],
          look: function (ctx, i) {
            return {
              skin: pick(SKIN, i + 1), hair: pick(['short04', 'afro01', 'short02'], i), height: 1.74 + (i % 4) * 0.05, build: { muscle: 0.5 + (i % 3) * 0.2, lean: 0.4 },
              outfit: { shoes: pick(['#F2F2F2', '#111111', '#C8102E'], i) },
              clothes: {
                shirt: { kind: pick(['tee', 'long', 'tank', 'tee', 'polo'], i), color: pick(['#1F1F24', '#7A1E2B', '#2C4A63', '#E8E1D2', '#3B5B3A', '#5A2E6B'], i), color2: '#0F0F12', print: i % 7 === 3 ? 'camo' : 'plain' },
                pants: { kind: pick(['jeans', 'trousers', 'jeans'], i), color: pick(['#23324A', '#1B1B1F', '#39506E', '#2E3B2A'], i) },
                tattoos: { arms: i % 2 === 0, neck: i % 3 === 0 }, beard: pick(['stubble', 'none', 'full', 'goatee'], i),
              },
              gear: i % 4 === 0 ? { cap: { color: pick(['#101012', '#7A1E2B', '#F2F2F2'], i), backwards: true } } : i % 4 === 2 ? { chain: '#D4AF37' } : null,
            };
          },
        },
        biker: {
          names: ['Road Dog', 'Iron Mike', 'Chains', 'Gator', 'Tank', 'Deacon'],
          look: function (ctx, i) {
            return {
              skin: pick(['caucasian', 'caucasian2', 'african'], i), hair: pick(['short04', 'afro01'], i), height: 1.82 + (i % 3) * 0.04, build: { muscle: 0.85, lean: 0.2 },
              outfit: { shoes: '#2A1D14' },
              clothes: { shirt: { kind: pick(['tee', 'tank'], i), color: pick(['#2B2B2E', '#6B6B6E', '#F0EDE6'], i) }, jacket: { kind: 'vest', color: '#121012' }, pants: { kind: 'jeans', color: '#27364F' }, tattoos: { arms: true, neck: i % 2 === 1 }, beard: pick(['full', 'goatee'], i) },
              gear: { bandana: pick(['#1A1A1A', '#8C1C1C', '#15305A'], i) }, weapon: { kind: 'chain' },
            };
          },
        },
        cop: {
          names: ['Officer Ruiz', 'Officer Kane', 'Officer Diaz', 'Officer Park', 'Sergeant Cole', 'Officer Brandt'],
          look: function (ctx, i) {
            return {
              skin: pick(SKIN, i + 2), hair: 'short02', height: 1.8, outfit: { shoes: '#0C0C0E' },
              clothes: { shirt: { kind: 'uniform', color: '#1D2B4B', color2: '#2E5DA8', badge: '#D9B44A' }, pants: { kind: 'trousers', color: '#141D33' }, belt: '#0B0B0C', beard: i % 3 ? 'none' : 'stubble' },
              gear: { police: '#111827' }, weapon: { kind: 'baton' },
            };
          },
        },
        boss: {
          names: ['El Jefe', 'Big Tony Vega', 'La Reina', 'The Collector', 'King Marlowe'],
          look: function (ctx, i) {
            var n = i % 5;
            if (n === 0) return { skin: 'caucasian2', hair: 'short04', height: 2.02, build: { muscle: 1, lean: 0.15 }, outfit: { shoes: '#F2EEE6' },
              clothes: { shirt: { kind: 'open', color: '#F4F0E6', color2: '#C8102E', print: 'floral' }, pants: { kind: 'trousers', color: '#E6DCC6' }, belt: '#5A3A22', beard: 'full', tattoos: { chest: true } },
              gear: { chain: '#D4AF37', shades: '#101014' }, weapon: { kind: 'bat' } };
            if (n === 1) return { skin: 'african', hair: 'short04', height: 2.04, build: { muscle: 1, lean: 0.1 }, outfit: { shoes: '#0A0A0B' },
              clothes: { shirt: { kind: 'open', color: '#0E0E10' }, pants: { kind: 'trousers', color: '#141416' }, belt: '#0B0B0C', beard: 'goatee', tattoos: { chest: true, neck: true } },
              gear: { chain: '#E8C45A', shades: '#0B0B0D' }, weapon: { kind: 'pipe' } };
            if (n === 2) return { body: 'human-athlete-female', skin: 'caucasian', hair: 'afro01', hairColor: '#2A140C', height: 1.84, build: { muscle: 0.9, lean: 0.4 }, outfit: { shoes: '#8C1020' },
              clothes: { shirt: { kind: 'tee', color: '#8C1020' }, pants: { kind: 'trousers', color: '#0E0E10' }, belt: '#D4AF37', tattoos: { arms: true } },
              gear: { chain: '#D4AF37', shades: '#2A0A10' }, weapon: { kind: 'bat', color: '#1A1A1C' } };
            if (n === 3) return { skin: 'asian', hair: 'short02', height: 2.0, build: { muscle: 1, lean: 0.2 }, outfit: { shoes: '#0A0A0B' },
              clothes: { shirt: { kind: 'tee', color: '#1A1A1C' }, jacket: { kind: 'jacket', color: '#0C0B0A' }, pants: { kind: 'trousers', color: '#121214' }, beard: 'stubble' },
              gear: { shades: '#0B0B0D' }, weapon: { kind: 'pipe' } };
            return { skin: 'caucasian', hair: 'short04', height: 2.06, build: { muscle: 1, lean: 0.1 }, outfit: { shoes: '#F2F2F2' },
              clothes: { shirt: { kind: 'polo', color: '#F2F2F2' }, pants: { kind: 'trousers', color: '#1E2A44' }, belt: '#1C1410', beard: 'full' },
              gear: { chain: '#D4AF37', cap: { color: '#1E2A44' } }, weapon: { kind: 'bat' } };
          },
        },
      },
    },
    // the OG's club-to-be: a pink neon sign on the deco front where it will open
    onMap: function (ctx) {
      var THREE = ctx.THREE;
      var tex = ctx.textures.canvas(1024, 320, function (g, w, h) {
        g.clearRect(0, 0, w, h); g.textAlign = 'center'; g.textBaseline = 'middle';
        g.font = 'italic 700 158px Georgia, serif'; g.lineJoin = 'round';
        g.shadowColor = '#FF2E78'; g.shadowBlur = 36; g.strokeStyle = '#FF4F8E'; g.lineWidth = 16; g.strokeText('OG\u2019s', w / 2, h * 0.39);
        g.shadowBlur = 10; g.fillStyle = '#FFE3EE'; g.fillText('OG\u2019s', w / 2, h * 0.39);
        g.font = '700 50px Arial, Helvetica, sans-serif'; g.shadowColor = '#22E4FF'; g.shadowBlur = 22; g.fillStyle = '#D8FBFF';
        g.fillText('C O M I N G   S O O N', w / 2, h * 0.84);
      });
      var sign = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.125), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, color: new THREE.Color(2.4, 2.4, 2.4), toneMapped: true }));
      sign.position.set(-30.7, 5.45, 33.3); sign.rotation.y = Math.PI / 2;
      ctx.scene.add(sign);
    },
    player: function (ctx) {
      // the OG: an original look of Miami today, nobody's likeness
      return ctx.assets.human('human-athlete-male', {
        name: 'The OG', color: '#FF3D7F', skin: 'caucasian2', hair: 'short04', hairColor: '#1A120C', height: 1.86, build: { muscle: 0.9, lean: 0.35 },
        outfit: { shoes: '#F7F7F7' },
        clothes: {
          shirt: { kind: 'tank', color: '#F4F1EA' },
          pants: { kind: 'jeans', color: '#4A6A92' }, belt: '#2A1C12',
          tattoos: { arms: true, neck: true, color: '#1C2A38' }, beard: 'full',
        },
        gear: { chain: '#D4AF37', shades: '#0E0F12' },
      });
    },
  });
})();
