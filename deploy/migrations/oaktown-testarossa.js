(function () {
  var SKIN = ['african', 'caucasian2', 'asian', 'caucasian'];
  function pick(list, i) { return list[i % list.length]; }
  var CLINIC = { x: -16.1, z: -307.5 }, R = 36.2;
  function ferrari(ctx, x, z, rotY) {
    try {
      var c = ctx.assets.car({ kind: 'hypercar', paint: '#C8102E', trim: '#1A1A1A', accent: '#F2F2F2', pattern: 'plain', metallic: 0.35,
        rims: '#D8D8D8', calipers: '#111111', name: 'Testarossa', color: '#C8102E' });
      c.object.position.set(x, 0, z); c.object.rotation.y = rotY;
      ctx.scene.add(c.object);
      ctx.solid({ min: { x: x - 1.2, y: 0, z: z - 2.5 }, max: { x: x + 1.2, y: 1.2, z: z + 2.5 } });
    } catch (e) {}
  }
  GameMog.world({
    assets: ['human-athlete-male', 'human-athlete-female'],
    theme: { sky: '#7FB6E8', fog: '#BCD6EC', ink: '#FFFFFF', accent: '#FF3B30', font: 'Oxanium' },
    graphics: { preset: 'daylight', exposure: 1, bloom: { strength: 0.2, threshold: 1.2, radius: 0.5 },
      grade: { contrast: 1.08, saturation: 1.12, warmth: 0.08, vignette: 0.2, split: 0.1 }, shadows: { extent: 30, mapSize: 1024 } },
    camera: { distance: 5.2, height: 1.55, fov: 54 },
    open: {
      map: 'city',
      city: {
        district: 'midtown', time: 'day', traffic: 0.35, people: 0.25,
        ads: [
          ['WELCOME TO OAKTOWN', 'STAY INDOORS, STAY SAFE', '#101014', '#2A2A30', '#F4F1E8', '#D11F1F'],
          ['VACCINE  10,000 GM', 'ONE CLINIC  ·  SIXTH AVENUE', '#0D3B2E', '#1F7A58', '#E9FFF4', '#9DF0C8'],
          ['REPORT SYMPTOMS', 'FEVER  ·  GREY SKIN  ·  NO SLEEP', '#F0B21A', '#E2721B', '#1B1B1B', '#FFFFFF'],
          ['OAKTOWN CURFEW', 'BY ORDER OF THE CITY', '#1B2F6B', '#3D62C9', '#FFFFFF', '#FFCF33'],
          ['THEY CLIMB', 'OAKTOWN, KEEP YOUR WINDOWS SHUT', '#B3121A', '#E8343C', '#FFFFFF', '#FFE066'],
          ['ROSSO MOTORS', 'RED IS FASTER  ·  OAKTOWN', '#7A0A12', '#C8102E', '#FFFFFF', '#FFD9B0'],
          ['COLD BREW CO.', 'SLOW STEEPED, FAST CITY', '#2B1B12', '#5C3A24', '#F2E6D2', '#E8B062'],
          ['OAKTOWN MARKET', 'OPEN THROUGH THE OUTBREAK', '#1A0F2E', '#46205E', '#FFD27A', '#FF8A3D'],
        ],
        signs: [
          ['24 HR PHARMACY', '#EEF1F4', '#1F8A4C'], ['CLOSED', '#1A1A1A', '#E8E8E8'], ['DELI & GROCERY', '#1F6B36', '#F4EFC8'],
          ['MASKS SOLD HERE', '#F2E94E', '#1A1A1A'], ['OAKTOWN PIZZA', '#B3191C', '#F2C14E'], ['BOARDED UP', '#5A4A3A', '#F2E6D2'],
          ['HARDWARE', '#E3A21D', '#1A1A1A'], ['OAK DINER', '#1E3A7A', '#F2C14E'], ['NO SYMPTOMS NO ENTRY', '#B8202C', '#FFFFFF'],
          ['LAUNDROMAT', '#2C6E8F', '#FFFFFF'], ['CHECK CASHING', '#F2E94E', '#1A1A1A'], ['COFFEE', '#5A3A24', '#F2E6D2'],
        ],
      },
      spawn: [-11, -268, 180],
      civilians: 0,
      maxEnemies: 7,
      lod: true,
      keyArt: { at: [-4, -318], look: 180, tilt: 0.1 },
      patrol: { car: 'sedan', color: '#ECEBE4', lights: ['#FFB020', '#2E6BFF'] },
      heat: { every: 40, say: ['Looters on the avenue', 'Quarantine troopers move in', 'The infected take the roofs', 'All of Oaktown wants your GM'] },
      health: 100,
      traversal: { line: '#E6F2EA' },
      hud: { gm: 'Vaccine fund', banner: 'Stack 10,000 GM for the vaccine.' },
      goal: { gm: 10000, title: 'Cured', text: 'Ten thousand GM, one vaccine. Oaktown didn\u2019t take the OG either.' },
      intro: {
        shots: [
          { t: 6.5, fade: 'in', place: 'OAKTOWN', time: 'DAY 9 OF THE OUTBREAK',
            cam: { from: [-2, 120, -150], to: [1, 62, -246], look: [18, R + 1, -296], lookTo: [18, R + 1.3, -297.5], fov: 50, fovTo: 40 },
            cast: [{ id: 'og', at: [18.2, -297.5, R + 1], face: [-16, -304], stance: 'shift' }] },
          { t: 6, say: 'The virus left the beach. Now it has all of Oaktown, even in daylight.',
            cam: { from: [20.6, R + 2.1, -291.8], to: [20.1, R + 2.0, -292.6], look: [-6, 24, -440], lookTo: [-8, 20, -440], fov: 46 },
            cast: [{ id: 'og', face: [-4, -420] }] },
          { t: 7, say: 'The OG still has it. One clinic on Sixth Avenue has the vaccine, and it costs 10,000 GM.',
            cam: { from: [17.6, R + 2.3, -300.6], to: [17.2, R + 2.1, -300.9], look: [CLINIC.x, 3.2, CLINIC.z], fov: 30, fovTo: 24 },
            cast: [{ id: 'og', face: [CLINIC.x, CLINIC.z] }] },
          { t: 5, say: '\u201CTen thousand. The red Testarossa stays at the curb. I take the high road.\u201D',
            cam: { from: [16.6, R + 1.75, -298.4], to: [16.5, R + 1.8, -298.3], look: 'og', fov: 32 },
            cast: [{ id: 'og', face: [-4, -300], stance: 'shift', act: [['shrug', 1.6, 1.1]] }] },
          { t: 6.5, say: 'But the infected want the same money. And they climb.',
            cam: { from: [19.4, R + 1.0, -304], to: [19.7, R + 1.1, -302.4], look: [21.5, R + 1.4, -287], lookTo: [20.5, R + 1.4, -291.5], fov: 48 },
            cast: [
              { id: 'og', face: [21, -286] },
              { id: 'z1', kind: 'thug', at: [22.6, -278.5, R + 1], path: [[22, -286], [21.4, -291.4]], speed: 1.3, gait: 'walkHeavy', stance: 'shift' },
              { id: 'z2', kind: 'thug', at: [18.6, -277.5, R + 1], path: [[18.8, -285], [19.1, -292.6]], speed: 1.45, gait: 'walkHeavy', stance: 'shift' },
              { id: 'z3', kind: 'thug', at: [25.6, -281, R + 1], to: [23.4, -292.2], speed: 1.2, gait: 'walkHeavy', stance: 'shift' }] },
          { t: 4.5, say: '\u201CLet\u2019s get to work.\u201D',
            cam: { from: [20.9, R + 1.55, -293.0], to: [20.8, R + 1.6, -293.5], look: 'og', fov: 40 },
            cast: [
              { id: 'og', at: [18.4, -297.5, R + 1], to: [18.8, -295.8, R + 1], speed: 1.0, gait: 'walkCool', stance: 'fight', face: 'z2' },
              { id: 'z1', at: [21.4, -291.4, R + 1], stance: 'fight', face: 'og', stay: true },
              { id: 'z2', at: [19.1, -292.6, R + 1], stance: 'fight', face: 'og', stay: true },
              { id: 'z3', at: [23.4, -292.2, R + 1], stance: 'fight', face: 'og', stay: true }] },
          { t: 5.5, fade: 'out', title: 'OAKTOWN', tagline: 'Run the walls. Swing the avenues. Stack 10,000 GM for the vaccine before the virus takes you.',
            cam: { from: [8, R + 4, -301], to: [-34, 78, -346], look: [19.5, R + 1, -294], fov: 46 } },
        ],
      },
      outro: {
        shots: [
          { t: 4.5, fade: 'in', place: '10,000 GM', time: 'THE CLINIC  \u00B7  SIXTH AVENUE, OAKTOWN',
            cam: { from: [-6.2, 1.7, -301.2], to: [-7.1, 1.7, -302.0], look: [CLINIC.x, 2.6, CLINIC.z], fov: 46 },
            cast: [{ id: 'og', at: [-12.6, -307.0], face: [CLINIC.x, CLINIC.z], stance: 'shift' }] },
          { t: 5.5, say: 'Dr. Reyes: \u201CYou came all the way from the beach for this?\u201D',
            cam: { from: [-9.9, 1.72, -303.6], to: [-10.1, 1.7, -303.9], look: 'doc', fov: 40 },
            cast: [
              { id: 'og', at: [-12.6, -307.0], face: 'doc' },
              { id: 'doc', kind: 'civ', name: 'Dr. Reyes', ghost: true, at: [CLINIC.x + 0.5, CLINIC.z], path: [[-14.9, -307.9], [-14.0, -308.1]], speed: 1.05, gait: 'walkF', stance: 'shift', face: 'og',
                look: { body: 'human-athlete-female', skin: 'caucasian', hair: 'short02', hairColor: '#2A1A12', height: 1.7, outfit: { shoes: '#F4F4F2' },
                  clothes: { shirt: { kind: 'long', color: '#BFD9E8' }, jacket: { kind: 'jacket', color: '#F7F8FA' }, pants: { kind: 'trousers', color: '#8FAEC4' }, belt: false },
                  gear: { mask: '#9CCBE6' }, weapon: { kind: 'syringe' } } }] },
          { t: 5, say: '\u201CHold still.\u201D',
            cam: { from: [-15.0, 1.5, -305.2], to: [-14.9, 1.5, -305.5], look: [-13.3, 1.3, -307.6], fov: 40 },
            cast: [
              { id: 'og', face: 'doc', act: [['heal', 1.6, 2.8]] },
              { id: 'doc', at: [-14.0, -308.1], face: 'og', act: [['pickup', 0.7, 0.7]] }] },
          { t: 5, say: 'The OG: \u201CI can breathe again. Now, where did I park the Testarossa?\u201D',
            cam: { from: [-10.8, 1.66, -306.3], to: [-10.9, 1.66, -306.35], look: 'og', fov: 32 },
            cast: [{ id: 'og', face: [-4, -304], stance: 'shift' }, { id: 'doc', face: 'og' }] },
          { t: 6, fade: 'out', title: 'CURED', tagline: 'Ten thousand GM, one vaccine. Oaktown didn\u2019t take the OG either.',
            cam: { from: [-8.5, 2, -303], to: [6, 40, -286], look: [-13.3, 1.3, -307.6], fov: 46 },
            cast: [{ id: 'og', face: [-4, -304] }, { id: 'doc', face: 'og' }] },
        ],
      },
      crew: {
        thug: {
          gm: 60, climb: 0.5,
          names: ['Infected courier', 'Infected cabbie', 'Infected banker', 'Infected cook', 'Infected doorman', 'Infected nurse'],
          look: function (ctx, i) {
            var n = i % 6, sick = 0.8 + (i % 3) * 0.1, hair = pick(['short04', 'afro01', 'short02'], i), skin = pick(SKIN, i + 1);
            if (n === 0) return { skin: skin, hair: hair, height: 1.76, sick: sick, outfit: { shoes: '#E8E8E8' },
              clothes: { shirt: { kind: 'tee', color: '#2C4A63' }, pants: { kind: 'jeans', color: '#23324A' }, beard: 'stubble' }, gear: { cap: { color: '#101012', backwards: true } } };
            if (n === 1) return { skin: skin, hair: hair, height: 1.8, build: { muscle: 0.4, lean: 0.2 }, sick: sick, outfit: { shoes: '#1A1A1A' },
              clothes: { shirt: { kind: 'polo', color: '#E2B21E' }, pants: { kind: 'trousers', color: '#2B2D31' }, beard: 'full' } };
            if (n === 2) return { skin: skin, hair: 'short02', height: 1.82, sick: sick, outfit: { shoes: '#0C0C0E' },
              clothes: { shirt: { kind: 'long', color: '#DFE3E8' }, jacket: { kind: 'jacket', color: '#1D2536' }, pants: { kind: 'trousers', color: '#1D2536' }, belt: '#0B0B0C', beard: 'none' } };
            if (n === 3) return { skin: skin, hair: hair, height: 1.74, build: { muscle: 0.6, lean: 0.3 }, sick: sick, outfit: { shoes: '#F2F2F2' },
              clothes: { shirt: { kind: 'tee', color: '#F0ECE0' }, pants: { kind: 'trousers', color: '#2B2D31' }, tattoos: { arms: true } } };
            if (n === 4) return { skin: skin, hair: hair, height: 1.86, sick: sick, outfit: { shoes: '#0C0C0E' },
              clothes: { shirt: { kind: 'long', color: '#E8E8E4' }, jacket: { kind: 'jacket', color: '#5A1F2A' }, pants: { kind: 'trousers', color: '#151517' }, beard: 'goatee' }, gear: { cap: { color: '#5A1F2A' } } };
            return { body: 'human-athlete-female', skin: skin, hair: 'afro01', hairColor: '#20140C', height: 1.7, sick: sick, outfit: { shoes: '#F4F4F2' },
              clothes: { shirt: { kind: 'tee', color: '#7FB3C8' }, pants: { kind: 'trousers', color: '#7FB3C8' } } };
          },
        },
        biker: {
          gm: 90,
          names: ['Crowbar', 'Smash', 'Sticky', 'Five-Finger', 'Hood', 'Grab'],
          look: function (ctx, i) {
            return {
              skin: pick(['caucasian', 'african', 'caucasian2', 'asian'], i), hair: pick(['short04', 'afro01'], i), height: 1.8 + (i % 3) * 0.04, build: { muscle: 0.75, lean: 0.3 },
              outfit: { shoes: pick(['#111111', '#F2F2F2'], i) },
              clothes: { shirt: { kind: pick(['tee', 'long'], i), color: pick(['#1F1F24', '#3B5B3A', '#4A4C50'], i), print: i % 3 === 1 ? 'camo' : 'plain' }, jacket: i % 2 ? { kind: 'jacket', color: '#121214' } : null,
                pants: { kind: pick(['jeans', 'trousers'], i), color: pick(['#23324A', '#1B1B1F'], i) }, beard: pick(['stubble', 'goatee', 'none'], i) },
              gear: { bandana: pick(['#1A1A1A', '#8C1C1C', '#15305A'], i) }, weapon: { kind: i % 2 ? 'pipe' : 'chain' },
            };
          },
        },
        cop: {
          gm: 90,
          names: ['Trooper Vance', 'Trooper Okafor', 'Trooper Lind', 'Sergeant Hale', 'Trooper Cruz', 'Trooper Moss'],
          look: function (ctx, i) {
            return {
              skin: pick(SKIN, i + 2), hair: 'short02', height: 1.8, outfit: { shoes: '#0C0C0E' },
              clothes: { shirt: { kind: 'tee', color: '#D9C22E' }, pants: { kind: 'trousers', color: '#D9C22E' }, jacket: { kind: 'hazmat', color: '#D9C22E' },
                gloves: '#141416', boots: '#141416', belt: false, beard: 'none' },
              gear: { beanie: '#C9B22A', respirator: '#1E1E22', glasses: '#141416' }, weapon: { kind: 'baton' },
            };
          },
        },
        boss: {
          gm: 800,
          names: ['Patient Zero', 'Big Sal', 'The Night Nurse', 'Hammer', 'Mother Ruth'],
          look: function (ctx, i) {
            var n = i % 5;
            if (n === 0) return { skin: 'caucasian2', hair: 'short04', height: 2.08, build: { muscle: 1, lean: 0.1 }, sick: 1, outfit: { shoes: '#2A2A2A' },
              clothes: { shirt: { kind: 'tank', color: '#D8D4C8' }, pants: { kind: 'trousers', color: '#7FB3C8' }, beard: 'full', tattoos: { arms: true, chest: true } }, weapon: { kind: 'pipe' } };
            if (n === 1) return { skin: 'african', hair: 'short04', height: 2.06, build: { muscle: 1, lean: 0.1 }, sick: 0.95, outfit: { shoes: '#0A0A0B' },
              clothes: { shirt: { kind: 'tee', color: '#F0ECE0' }, pants: { kind: 'trousers', color: '#2B2D31' }, beard: 'goatee', tattoos: { arms: true, neck: true } }, gear: { chain: '#C8C8C8' }, weapon: { kind: 'bat' } };
            if (n === 2) return { body: 'human-athlete-female', skin: 'caucasian', hair: 'short02', hairColor: '#1A120C', height: 1.9, build: { muscle: 0.95, lean: 0.35 }, sick: 1, outfit: { shoes: '#F4F4F2' },
              clothes: { shirt: { kind: 'tee', color: '#7FB3C8' }, pants: { kind: 'trousers', color: '#7FB3C8' } }, gear: { mask: '#9CCBE6' }, weapon: { kind: 'pipe' } };
            if (n === 3) return { skin: 'asian', hair: 'short02', height: 2.04, build: { muscle: 1, lean: 0.2 }, sick: 0.95, outfit: { shoes: '#0A0A0B' },
              clothes: { shirt: { kind: 'tank', color: '#1A1A1C' }, pants: { kind: 'jeans', color: '#23324A' }, beard: 'stubble', tattoos: { arms: true } }, weapon: { kind: 'bat' } };
            return { body: 'human-athlete-female', skin: 'african', hair: 'afro01', hairColor: '#C8C4BC', height: 1.92, build: { muscle: 1, lean: 0.3 }, sick: 1, outfit: { shoes: '#2A1D14' },
              clothes: { shirt: { kind: 'long', color: '#5A1F2A' }, pants: { kind: 'trousers', color: '#141416' } }, gear: { chain: '#D4AF37' }, weapon: { kind: 'bat' } };
          },
        },
      },
    },
    onMap: function (ctx) {
      var THREE = ctx.THREE, x = CLINIC.x + 0.3, z = CLINIC.z;
      var sign = ctx.textures.canvas(1024, 256, function (g, w, h) {
        g.fillStyle = '#07140D'; g.fillRect(0, 0, w, h); g.textBaseline = 'middle'; g.lineJoin = 'round';
        g.strokeStyle = 'rgba(120,255,170,0.35)'; g.lineWidth = 6; g.strokeRect(8, 8, w - 16, h - 16);
        g.shadowColor = '#22FF7A'; g.shadowBlur = 30; g.fillStyle = '#B8FFD2';
        var cx = 128, cy = h / 2, a = 30, b = 86;
        g.fillRect(cx - a, cy - b, a * 2, b * 2); g.fillRect(cx - b, cy - a, b * 2, a * 2);
        g.textAlign = 'left';
        g.font = '800 104px Arial, Helvetica, sans-serif'; g.fillStyle = '#E8FFF0';
        g.fillText('CLINIC', 250, h * 0.36);
        g.font = '700 50px Arial, Helvetica, sans-serif'; g.shadowColor = '#FFB02E'; g.shadowBlur = 18; g.fillStyle = '#FFE7B8';
        g.fillText('VACCINE  10,000 GM', 254, h * 0.76);
      });
      var glass = ctx.textures.canvas(512, 256, function (g, w, h) {
        var gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#DDEFE6'); gr.addColorStop(1, '#B9D8C8');
        g.fillStyle = gr; g.fillRect(0, 0, w, h);
        g.fillStyle = 'rgba(20,40,30,0.85)'; for (var k = 1; k < 3; k++) g.fillRect(k * w / 3 - 3, 0, 6, h);
        g.fillStyle = '#1FA85A'; var cx = w / 2, cy = h * 0.42, a = 17, b = 48;
        g.fillRect(cx - a, cy - b, a * 2, b * 2); g.fillRect(cx - b, cy - a, b * 2, a * 2);
        g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#16402A';
        g.font = '700 23px Arial, Helvetica, sans-serif'; g.fillText('VACCINATIONS  \u00B7  OAKTOWN CLINIC', cx, h * 0.84);
      });
      var board = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 1.6), new THREE.MeshBasicMaterial({ map: sign, color: new THREE.Color(1.3, 1.3, 1.3), toneMapped: true }));
      board.position.set(x + 0.05, 4.7, z); board.rotation.y = Math.PI / 2; ctx.scene.add(board);
      var win = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 3.3), new THREE.MeshBasicMaterial({ map: glass, color: new THREE.Color(0.8, 0.85, 0.82), toneMapped: true }));
      win.position.set(x, 2.05, z); win.rotation.y = Math.PI / 2; ctx.scene.add(win);
      // the OG's red Testarossa at the curb on Sixth Avenue
      ferrari(ctx, -7.5, -282, 0.04);
    },
    player: function (ctx) {
      return ctx.assets.human('human-athlete-male', {
        name: 'The OG', color: '#FF3D7F', skin: 'caucasian2', hair: 'short04', hairColor: '#1A120C', height: 1.86, build: { muscle: 0.9, lean: 0.35 },
        sick: 0.9,
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
