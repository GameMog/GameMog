// Zombie Beach (was Miami OG): the flagship Open World (the owner, 27 Sep 2026;
// renamed 28 Sep: "an outbreak of an unknown virus and you need 10000 GM to
// purchase the vaccine"). The OG has caught it. He roams Ocean Drive at sunrise
// knocking out whoever comes for his money, street thugs, then bikers, then the
// police by patrol car, and a named boss at every third level of heat, until he
// has 10,000 GM; then the doctor comes out of the clinic with the vaccine and he
// is healed. The street is StarKnightt/ocean-drive (MIT), the runtime's Miami
// map; the people are the library's; the fight is the runtime's. All names are
// invented; no real person, gang, brand or game is depicted.
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
      // the mission: 10,000 GM for the vaccine; then the doctor, and the cure
      hud: { gm: 'Vaccine fund', banner: 'Stack 10,000 GM for the vaccine.' },
      // the thumbnail the owner liked (28 Sep): the classic convertible up front, the fight in the street behind it
      keyArt: { at: [-17.0, 8.9], look: 112.3, tilt: 0.15 },
      goal: { gm: 10000, title: 'Cured', text: 'Ten thousand GM, one vaccine. Zombie Beach didn\u2019t take the OG.' },
      // the opening scene: South Beach at sunrise, the OG, the corner his club will be on, and the crew that wants his money
      intro: {
        shots: [
          { t: 6, fade: 'in', place: 'SOUTH BEACH', time: 'DAY 3 OF THE OUTBREAK',
            cam: { from: [60, 30, 92], to: [16, 14, 60], look: [-26, 7, 38], lookTo: [-24, 3, 38], fov: 46, fovTo: 40 },
            cast: [{ id: 'og', at: [-12.4, 50], to: [-12.4, 44], speed: 1.0, gait: 'walkCool', stance: 'shift' }] },
          { t: 5.5, say: 'Nobody knows where the virus came from. In three days it had the whole city.',
            cam: { from: [-11.9, 0.9, 39.6], to: [-12.0, 1.0, 35.4], look: 'og', fov: 38 },
            cast: [{ id: 'og', to: [-12.6, 38.6], speed: 1.0 }] },
          { t: 7, say: 'The OG caught it. The only vaccine on the strip is behind that door, and it costs 10,000 GM.',
            cam: { from: [-11.6, 1.55, 40.2], to: [-15.2, 1.7, 39.4], look: [-30.6, 4.6, 33.3], lookTo: [-28, 3.2, 34.5], fov: 44, fovTo: 38 },
            cast: [{ id: 'og', path: [[-14.2, 38.2], [-24.4, 37.0]], speed: 1.75, gait: 'walk' }] },
          { t: 5, say: '“Ten thousand. I’ll take it off this street, one coin at a time.”',
            cam: { from: [-23.05, 1.62, 37.5], to: [-23.1, 1.64, 37.42], look: 'og', fov: 30 },
            cast: [{ id: 'og', at: [-24.4, 37.0], face: [-15, 37.6], stance: 'shift', act: [['shrug', 1.7, 1.1]] }] },
          { t: 6.5, say: 'But on South Beach, everybody wants the same money.',
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
          { t: 5.5, fade: 'out', title: 'ZOMBIE BEACH', tagline: 'Knock them out. Take their GM. Stack 10,000 for the vaccine before the virus takes you.',
            cam: { from: [-21.5, 2, 35.5], to: [-14, 11, 48], look: [-26, 1.2, 33], fov: 44 } },
        ],
      },
      // the closing scene, at 10,000 GM: the doctor comes out of the clinic with the vaccine
      outro: {
        shots: [
          { t: 4, fade: 'in', place: '10,000 GM', time: 'THE CLINIC  ·  OCEAN DRIVE',
            cam: { from: [-17.6, 1.5, 35.6], to: [-18.3, 1.6, 35.2], look: [-27.2, 2.8, 32.5], fov: 46 },
            cast: [{ id: 'og', at: [-25.8, 31.4], face: [-30.2, 33.3], stance: 'shift' }] },
          { t: 5.5, say: 'Dr. Reyes: “Ten thousand. That buys you a second chance.”',
            cam: { from: [-24.9, 1.72, 28.9], to: [-25.0, 1.7, 29.25], look: 'doc', fov: 42 },
            cast: [
              { id: 'og', face: 'doc' },
              { id: 'doc', kind: 'civ', name: 'Dr. Reyes', ghost: true, at: [-30.2, 33.3], path: [[-28.1, 33.1], [-26.6, 31.95]], speed: 1.05, gait: 'walkF', stance: 'shift', face: 'og',
                look: { body: 'human-athlete-female', skin: 'caucasian', hair: 'short02', hairColor: '#2A1A12', height: 1.7, outfit: { shoes: '#F4F4F2' },
                  clothes: { shirt: { kind: 'long', color: '#BFD9E8' }, jacket: { kind: 'jacket', color: '#F7F8FA' }, pants: { kind: 'trousers', color: '#8FAEC4' }, belt: false },
                  gear: { mask: '#9CCBE6' }, weapon: { kind: 'syringe' } } }] },
          { t: 5, say: '“Hold still.”',
            cam: { from: [-24.9, 1.45, 28.5], to: [-25.05, 1.45, 28.85], look: [-26.35, 1.3, 31.8], fov: 38 },
            cast: [
              { id: 'og', face: 'doc', act: [['heal', 1.6, 2.8]] },
              { id: 'doc', at: [-26.6, 31.95], face: 'og', act: [['pickup', 0.7, 0.7]] }] },
          { t: 5, say: 'The OG: “I can breathe again.”',
            cam: { from: [-24.45, 1.62, 31.25], to: [-24.5, 1.63, 31.2], look: 'og', fov: 30 },
            cast: [{ id: 'og', face: [-15, 31.4], stance: 'shift' }, { id: 'doc', face: 'og' }] },
          { t: 6, fade: 'out', title: 'CURED', tagline: 'Ten thousand GM, one vaccine. Zombie Beach didn’t take the OG.',
            cam: { from: [-22, 2, 34], to: [-13.5, 12, 45], look: [-26.5, 1.3, 32], fov: 44 },
            cast: [{ id: 'og', face: [-15, 31.4] }, { id: 'doc', face: 'og' }] },
        ],
      },
      crew: {
        thug: {
          gm: 60,
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
          gm: 90,
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
          gm: 90,
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
          gm: 800,
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
    // the clinic: a green neon cross and the price of the vaccine, on the deco front on Ocean Drive
    onMap: function (ctx) {
      var THREE = ctx.THREE;
      var tex = ctx.textures.canvas(1024, 320, function (g, w, h) {
        g.clearRect(0, 0, w, h); g.textBaseline = 'middle'; g.lineJoin = 'round';
        // the cross
        g.shadowColor = '#22FF7A'; g.shadowBlur = 34; g.fillStyle = '#B8FFD2';
        var cx = 150, cy = h / 2, a = 44, b = 128;
        g.fillRect(cx - a, cy - b, a * 2, b * 2); g.fillRect(cx - b, cy - a, b * 2, a * 2);
        g.textAlign = 'left';
        g.font = '800 132px Arial, Helvetica, sans-serif'; g.shadowColor = '#22FF7A'; g.shadowBlur = 30; g.fillStyle = '#E8FFF0';
        g.fillText('CLINIC', 318, h * 0.36);
        g.font = '700 58px Arial, Helvetica, sans-serif'; g.shadowColor = '#FFB02E'; g.shadowBlur = 20; g.fillStyle = '#FFE7B8';
        g.fillText('VACCINE  10,000 GM', 322, h * 0.78);
      });
      var sign = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 1.19), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, color: new THREE.Color(2.4, 2.4, 2.4), toneMapped: true }));
      sign.position.set(-30.7, 5.45, 33.3); sign.rotation.y = Math.PI / 2;
      ctx.scene.add(sign);
    },
    player: function (ctx) {
      // the OG: an original look of Miami today, nobody's likeness
      return ctx.assets.human('human-athlete-male', {
        name: 'The OG', color: '#FF3D7F', skin: 'caucasian2', hair: 'short04', hairColor: '#1A120C', height: 1.86, build: { muscle: 0.9, lean: 0.35 },
        sick: 0.9,   // the virus: pale, grey-green, sunk eyes, veins; the vaccine heals it
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
