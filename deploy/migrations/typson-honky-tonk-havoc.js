(function () {
  var PI = Math.PI, TAU = PI * 2;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function pick(l, i) { return l[i % l.length]; }
  function rng(seed) { var s = seed >>> 0 || 1; return function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
  var LOWQ = (function () { try { return matchMedia('(pointer: coarse)').matches || Math.min(screen.width || 1280, screen.height || 720) < 600; } catch (e) { return false; } })();

  var FX = { rings: [], hats: null, hs: [], light: null, ac: null, out: null, band: [], bull: null, motes: null, beams: [], neon: [] };
  var BOUNDS = { x: [-28.5, 28.5], z: [-40, 41] };
  var TABLES = [[18, -26], [24, -20], [18, -12], [24, -4], [18, 4], [24, 12], [18, 20], [24, 26]];
  var BULL = [9, -15];

  var HATS = ['#C9A46A', '#3A2A1E', '#E6DED0', '#141416', '#7A4A26'];
  function guestLook(ctx, i) {
    var woman = i % 3 === 1, old = i % 7 === 5;
    var o = {
      body: woman ? 'human-athlete-female' : 'human-athlete-male',
      skin: pick(['caucasian', 'caucasian2', 'african', 'asian', 'caucasian-middle', 'caucasian'], i + (woman ? 2 : 0)).replace(woman ? 'caucasian2' : 'zzz', 'caucasian'),
      height: woman ? 1.66 + (i % 4) * 0.03 : 1.76 + (i % 5) * 0.03,
      build: { muscle: woman ? 0.2 : 0.4, lean: 0.5, age: old ? 0.7 : 0.1, weight: (i % 4) * 0.12 },
      hair: woman ? pick(['long01', 'bob01', 'ponytail01', 'braid01'], i) : pick(['short01', 'short03', 'short02', 'short04'], i),
      hairColor: pick(['#1B130E', '#3A2618', '#6B4A2F', '#0E0C0B'], i)
    };
    var boots = { name: 'shoes02', color: pick(['#5A3A22', '#2A1D14', '#7A5A3A'], i) };
    if (woman) o.wear = [pick(['female_casualsuit01', 'female_casualsuit02'], i), boots];
    else { o.wear = [pick(['male_casualsuit03', 'male_casualsuit04', 'male_casualsuit05', 'male_casualsuit02', 'male_worksuit01'], i), boots]; if (i % 4 !== 3) o.wear.push({ name: 'fedora01', color: pick(HATS, i) }); }
    return o;
  }
  var TUNE = { health: 400, maxEnemies: 5, turn: 0.35,
    heat: { every: 150, kos: 0, max: 7, police: false, escort: 1, room: true },
    thug: { gm: 31, hp: 8, damage: 4.5 }, biker: { gm: 8, hp: 14, damage: 5.5 }, cop: { gm: 8, hp: 18, damage: 6.5 }, boss: { gm: 60, hp: 20, damage: 11 } };
  var BOSSES = [
    { skin: 'caucasian2', hair: 'none', height: 2.1, build: { muscle: 1, lean: 0.1, weight: 0.6 }, wear: ['male_casualsuit05', { name: 'shoes02', color: '#2A1D14' }, { name: 'fedora01', color: '#F2EEE2' }], weapon: { kind: 'bottle' } },
    { skin: 'african', hair: 'none', height: 2.0, build: { muscle: 1, lean: 0.2, weight: 0.4 }, wear: ['male_worksuit01', { name: 'shoes02', color: '#2A1D14' }], weapon: { kind: 'pipe' } },
    { skin: 'caucasian', hair: 'short02', height: 1.96, build: { muscle: 1, lean: 0.25 }, wear: ['male_casualsuit02', { name: 'shoes02', color: '#3A2A1E' }, { name: 'fedora01', color: '#141416' }], weapon: { kind: 'bat' } },
    { skin: 'caucasian-middle', hair: 'short04', hairColor: '#8A8378', height: 2.05, build: { muscle: 1, lean: 0.1, weight: 0.7, age: 0.5 }, wear: ['male_casualsuit03', { name: 'shoes02', color: '#2A1D14' }, { name: 'fedora01', color: '#7A4A26' }], weapon: { kind: 'bucket' } },
    { skin: 'asian', hair: 'short02', height: 2.0, build: { muscle: 1, lean: 0.2 }, wear: ['male_elegantsuit01', { name: 'shoes03', color: '#0B0B0C' }], weapon: { kind: 'bat' } }
  ];
  var CREW = {
    thug: { gm: TUNE.thug.gm, hp: TUNE.thug.hp, damage: TUNE.thug.damage,
      names: ['Line dancer', 'Rodeo hand', 'Cowpoke', 'Boot scooter', 'Drunk drifter', 'Ranch hand', 'Hat-tipper', 'Honky tonk hero'],
      look: function (ctx, i) { var o = guestLook(ctx, i * 2); o.body = 'human-athlete-male'; if (!o.wear || o.wear[0].indexOf('female') === 0) o.wear = ['male_casualsuit06', { name: 'shoes02', color: '#4A3020' }, { name: 'fedora01', color: pick(HATS, i) }]; if (i % 3 === 2) o.weapon = { kind: 'bottle' }; return o; } },
    biker: { gm: TUNE.biker.gm, hp: TUNE.biker.hp, damage: TUNE.biker.damage,
      names: ['Road Dog', 'Outlaw', 'Hog rider', 'Chain gang', 'Prospect'],
      look: function (ctx, i) { return { skin: pick(['caucasian2', 'african', 'caucasian'], i), hair: 'short02', height: 1.88 + (i % 3) * 0.04, build: { muscle: 0.95, lean: 0.2 }, outfit: { shoes: '#0B0B0C' },
        clothes: { shirt: { kind: 'tank', color: '#1A1A1C' }, jacket: { kind: 'vest', color: '#121012' }, pants: { kind: 'jeans', color: '#1F2A3A' }, boots: '#0B0B0C', gloves: '#141416', beard: pick(['full', 'goatee'], i), tattoos: { arms: true, color: '#1C2A38' } },
        gear: { bandana: '#8C1C1C' }, weapon: { kind: 'chain' } }; } },
    cop: { gm: TUNE.cop.gm, hp: TUNE.cop.hp, damage: TUNE.cop.damage,
      names: ['Deputy Dusty', 'Deputy Clay', 'Sheriff Tate', 'Deputy Hank'],
      look: function (ctx, i) { return { skin: pick(['caucasian', 'caucasian2', 'african'], i), hair: 'short02', height: 1.86, build: { muscle: 0.8, lean: 0.35 }, outfit: { shoes: '#1A1A1C' },
        clothes: { shirt: { kind: 'uniform', color: '#8A7A5A' }, pants: { kind: 'trousers', color: '#3A3A2A' }, boots: '#2A1D14', gloves: '#141416' }, gear: { police: '#3A2A1A' }, weapon: { kind: 'baton' } }; } },
    boss: { gm: TUNE.boss.gm, hp: TUNE.boss.hp, damage: TUNE.boss.damage,
      names: ['Bull Rider Cody', 'Big Hank Hobbs', 'Rattlesnake Ray', 'Two-Ton Tex', 'The Foreman'],
      look: function (ctx, i) { return JSON.parse(JSON.stringify(BOSSES[i % BOSSES.length])); } }
  };
  var BOONE = { kind: 'civ', name: 'Big Tex Boone', look: { body: 'human-athlete-male', skin: 'caucasian-old', hair: 'short01', hairColor: '#DDDAD3', hairDye: true, height: 1.9, build: { muscle: 0.5, lean: 0.2, age: 0.7, weight: 0.6 }, wear: ['male_casualsuit05', { name: 'shoes02', color: '#2A1D14' }, { name: 'fedora01', color: '#F2EEE2' }], weapon: { kind: 'glass' } } };
  function cast(b, o) { var c = {}, k; for (k in b) c[k] = b[k]; for (k in o) c[k] = o[k]; return c; }
  var MID = [0, 2];
  var INTRO = { shots: [
    { t: 7, fade: 'in', place: 'LUBBOCK, TEXAS', time: '23:12  ·  SATURDAY NIGHT',
      cam: { from: [-24, 7, -37], to: [-12, 5, -31], look: [0, 2, 10], lookTo: [0, 2, 14], fov: 42, fovTo: 38 },
      cast: [{ id: 'og', at: [0, -39], path: [[0, -34], [0, -30]], speed: 1.4, gait: 'walkHeavy' }] },
    { t: 6.5, say: 'Iron Mike Typson never loses. Tonight somebody stole his gold belt, and the trail ends here.',
      cam: { from: [1.4, 1.9, -33.4], to: [1.0, 1.9, -32.8], look: 'og', fov: 34 },
      cast: [{ id: 'og', at: [0, -30], face: 0, stance: 'shift' }] },
    { t: 7, vision: { tint: '#FF8A1A', lines: ['SCAN: 140 PATRONS', 'TARGET: GOLD BELT', 'HELD BY: T. BOONE'], track: 'owner' },
      cam: { from: [-6, 2.2, -24], to: [-5, 2.2, -22], look: [20, 1.6, 14], lookTo: [20, 1.7, 14], fov: 32, fovTo: 24 },
      cast: [{ id: 'og', at: [-6, -26], face: [20, 14] }, cast(BOONE, { id: 'owner', at: [20, 14], face: [0, -10], stance: 'arms', ghost: true })] },
    { t: 6.5, say: 'Big Tex Boone: "Ten thousand and the belt walks out. Not a dollar less, champ."',
      cam: { from: [15, 1.9, 8], to: [15.4, 1.9, 8.6], look: 'owner', fov: 30 },
      cast: [cast(BOONE, { id: 'owner', at: [20, 14], face: [15, 8], stance: 'shift', act: [['shrug', 2, 1]], ghost: true })] },
    { t: 6, fade: 'out', title: 'HONKY TONK HAVOC', tagline: 'One saloon. One stolen belt. Nobody left standing.',
      cam: { from: [-5, 2.4, -26], to: [-9, 5, -32], look: [-3, 1.6, -18], lookTo: [0, 2, 0], fov: 44 },
      cast: [{ id: 'og', at: [-3, -26], face: 'g1', stance: 'fight' },
        { id: 'g1', kind: 'thug', at: [-2, -18], stance: 'fight', face: 'og', stay: true },
        { id: 'g2', kind: 'thug', at: [-8, -19], stance: 'fight', face: 'og', stay: true }] }
  ] };
  var BEATS = [
    { gm: 2500, banner: 'Chapter 2  ·  The bikers', objective: 'Boone calls in the back table. Drop them.', heat: 2, boss: true,
      shots: [{ t: 6, fade: 'in', say: 'The bikers by the back door put their beers down. Boone smiles.',
        cam: { from: [0, 3, -6], to: [0.4, 3.2, -5], look: [0, 1.4, 20], fov: 44 },
        cast: [{ id: 'og', at: MID, face: [0, 30], stance: 'fight' },
          { id: 'b1', kind: 'biker', at: [-24, 28], path: [[-20, 20], [-6, 8]], speed: 2.2, gait: 'walkHeavy', stance: 'fight', face: 'og', stay: true },
          { id: 'b2', kind: 'biker', at: [24, 28], path: [[20, 20], [6, 8]], speed: 2.1, gait: 'walkHeavy', stance: 'fight', face: 'og', stay: true }] }] },
    { gm: 5000, banner: 'Chapter 3  ·  The law', objective: 'The deputies are on the take. Keep swinging.', heat: 4, boss: true,
      shots: [{ t: 6, fade: 'in', say: 'The sheriff drinks here free. His deputies come through the front door.',
        cam: { from: [-10, 3, 18], to: [-9, 3.3, 17], look: [0, 1.6, -30], fov: 40 },
        cast: [{ id: 'og', at: MID, face: [0, -30], stance: 'fight' },
          { id: 'd1', kind: 'cop', at: [-3, -38], path: [[-3, -24], [-2, -8]], speed: 2.4, stance: 'fight', face: 'og', stay: true },
          { id: 'd2', kind: 'cop', at: [3, -38], path: [[3, -24], [2, -8]], speed: 2.3, stance: 'fight', face: 'og', stay: true }] }] },
    { gm: 7500, banner: 'Chapter 4  ·  Last call', objective: '2,500 GM to go. The regulars are rolling up their sleeves.', heat: 6, boss: true,
      shots: [{ t: 6, fade: 'in', say: 'Boone rings the bell. Last call, and every regular heard it.',
        cam: { from: [0, 7, -14], to: [0, 6, -10], look: [0, 1.5, 6], fov: 46 },
        cast: [{ id: 'og', at: MID, face: [0, 22], stance: 'fight' },
          { id: 'x1', kind: 'thug', at: [8, 8], stance: 'fight', face: 'og', stay: true },
          { id: 'x2', kind: 'thug', at: [-8, 7], stance: 'fight', face: 'og', stay: true },
          { id: 'x3', kind: 'biker', at: [1, -7], stance: 'fight', face: 'og', stay: true }] }] }
  ];
  var OUTRO = { shots: [
    { t: 6, fade: 'in', place: '10,000 GM', time: 'THE LONE STAR SALOON  ·  01:40',
      cam: { from: [14, 1.9, 4], to: [15, 1.9, 7], look: [20, 1.7, 14], lookTo: [20, 1.8, 14], fov: 34 },
      cast: [{ id: 'og', at: [10, 2], path: [[18, 12]], speed: 1.3, gait: 'walkHeavy' }, cast(BOONE, { id: 'owner', at: [20, 14], face: 'og', stance: 'arms', ghost: true })] },
    { t: 6.5, say: 'Boone: "Ten thousand. Take your belt, champ. And please, use the door next time."',
      cam: { from: [16.5, 1.8, 11], to: [16.8, 1.8, 11.4], look: 'owner', fov: 32 },
      cast: [{ id: 'og', at: [18, 12], face: 'owner', stance: 'shift' }, cast(BOONE, { id: 'owner', at: [20, 14], face: 'og', stance: 'shift', act: [['shrug', 2.5, 1]], ghost: true })] },
    { t: 7, fade: 'out', title: 'BELT RECOVERED', tagline: 'Iron Mike Typson walks out with the gold. The honky tonk needs new furniture.',
      cam: { from: [0, 3, -22], to: [0, 5, -34], look: [0, 1.8, -10], lookTo: [0, 2, -30], fov: 42 },
      cast: [{ id: 'og', at: [0, -14], path: [[0, -30], [0, -39]], speed: 1.3, gait: 'walkHeavy' }] }
  ] };

  function surf(ctx, id, o, fb) { var m = ctx.assets.surface(id, o); return m || new THREE.MeshStandardMaterial({ color: fb || o.color || '#7A5233', roughness: 0.85 }); }
  function box(w, h, d, mat, x, y, z, parent, shadow) { var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = !!shadow; m.receiveShadow = true; (parent || FX.scene).add(m); return m; }
  function solid(ctx, x0, x1, z0, z1, h) { ctx.solid({ min: { x: Math.min(x0, x1), y: 0, z: Math.min(z0, z1) }, max: { x: Math.max(x0, x1), y: h || 2.5, z: Math.max(z0, z1) } }); }
  function neonMat(ctx, text, color, w, h, size) {
    var tex = ctx.textures.canvas(1024, Math.round(1024 * h / w), function (g, W, H) {
      g.fillStyle = '#000'; g.fillRect(0, 0, W, H); g.font = '700 ' + size + 'px Rye, Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 8; g.strokeStyle = color; g.shadowColor = color; g.shadowBlur = 28; g.strokeText(text, W / 2, H / 2); g.fillStyle = '#FFF4E0'; g.shadowBlur = 10; g.fillText(text, W / 2, H / 2);
    });
    return new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(2.2, 2.2, 2.2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  }
  function neon(ctx, text, color, w, h, size, x, y, z, ry) { var m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), neonMat(ctx, text, color, w, h, size)); m.position.set(x, y, z); m.rotation.y = ry; m.userData.noReflection = true; ctx.scene.add(m); FX.neon.push(m); }
  function poster(ctx, x, y, z, ry, c1, c2, txt, seed) {
    var tex = ctx.textures.canvas(256, 384, function (g, w, h) {
      g.fillStyle = c1; g.fillRect(0, 0, w, h); g.fillStyle = c2; g.fillRect(12, 12, w - 24, h - 24); g.fillStyle = c1; g.beginPath(); g.arc(w / 2, 150, 70, 0, TAU); g.fill();
      g.fillStyle = '#FFF4E0'; g.font = '700 38px Rye, Georgia, serif'; g.textAlign = 'center'; g.fillText(txt, w / 2, 290); g.fillText('LIVE', w / 2, 335);
    });
    var m = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.4), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 })); m.position.set(x, y, z); m.rotation.y = ry; ctx.scene.add(m);
  }

  function buildRoom(ctx) {
    var S = ctx.scene, wallM = surf(ctx, 'texture-planks', { project: 'box', size: 2, color: '#C79867', roughness: 0.9 });
    var floorM = surf(ctx, 'texture-planks', { size: 2, color: '#E0B488', roughness: 0.55, normal: 1.2 });
    var brickM = surf(ctx, 'texture-brick', { project: 'box', size: 2, color: '#D69A7A', roughness: 0.9 }, '#A5603E');
    var tinM = surf(ctx, 'texture-corrugated-metal', { project: 'box', size: 2, color: '#9FB0BA', roughness: 0.5, side: 'double' }, '#8A9AA4');
    var concM = surf(ctx, 'texture-concrete', { project: 'box', size: 2, color: '#B8B0A4', roughness: 0.9 }, '#8E8880');
    var floor = new THREE.Mesh(new THREE.PlaneGeometry(64, 90), floorM); floor.rotation.x = -PI / 2; floor.receiveShadow = true; S.add(floor);
    var dtex = ctx.textures.canvas(512, 512, function (g, w) {
      for (var i = 0; i < 16; i++) { g.fillStyle = i % 2 ? '#D9AA70' : '#B88A52'; g.fillRect(i * 32, 0, 32, w); }
      g.fillStyle = 'rgba(30,15,5,0.35)'; for (i = 0; i < 16; i++) g.fillRect(i * 32, 0, 2, w);
      g.strokeStyle = '#3A1E0C'; g.lineWidth = 10; g.strokeRect(14, 14, w - 28, w - 28);
      g.fillStyle = '#C8142E'; g.beginPath(); for (i = 0; i < 10; i++) { var a = -PI / 2 + i * PI / 5, r = i % 2 ? 40 : 100; g.lineTo(256 + Math.cos(a) * r, 256 + Math.sin(a) * r); } g.closePath(); g.fill();
    });
    var df = new THREE.Mesh(new THREE.PlaneGeometry(18, 18), new THREE.MeshStandardMaterial({ map: dtex, roughness: 0.4, metalness: 0.05 })); df.rotation.x = -PI / 2; df.position.set(0, 0.02, 8); df.receiveShadow = true; S.add(df);
    // rugs
    var rtex = ctx.textures.canvas(256, 256, function (g, w) {
      g.fillStyle = '#7A1A24'; g.fillRect(0, 0, w, w); g.strokeStyle = '#E8C98A'; g.lineWidth = 8; g.strokeRect(14, 14, w - 28, w - 28);
      g.fillStyle = '#1F4F8A'; g.beginPath(); g.moveTo(128, 40); g.lineTo(216, 128); g.lineTo(128, 216); g.lineTo(40, 128); g.closePath(); g.fill();
      g.fillStyle = '#E8C98A'; g.beginPath(); g.arc(128, 128, 26, 0, TAU); g.fill();
    });
    [[21, -8, 9, 14], [-14, -22, 8, 6], [0, -28, 10, 5], [-14, 22, 8, 7]].forEach(function (r) { var m = new THREE.Mesh(new THREE.PlaneGeometry(r[2], r[3]), new THREE.MeshStandardMaterial({ map: rtex, roughness: 0.95 })); m.rotation.x = -PI / 2; m.position.set(r[0], 0.03, r[1]); m.receiveShadow = true; S.add(m); });
    // walls: plank above, brick wainscot, tin band, concrete plinth on north
    [[-30.5, 0, 1, 90], [30.5, 0, 1, 90], [0, 43, 62, 1], [0, -43, 62, 1]].forEach(function (w) { box(w[2], 9, w[3], wallM, w[0], 4.5, w[1] + (w[3] === 1 ? (w[1] > 0 ? 0.5 : -0.5) : 0), S, false); });
    box(0.3, 1.5, 80, brickM, -29.85, 0.75, 0, S); box(0.3, 1.5, 80, brickM, 29.85, 0.75, 0, S);
    box(60, 1.5, 0.3, brickM, 0, 0.75, -40.85, S);
    box(0.2, 1.4, 80, tinM, 29.9, 7.8, 0, S); box(0.2, 1.4, 80, tinM, -29.9, 7.8, 0, S);
    box(60, 0.8, 0.3, concM, 0, 0.4, 41.7, S);
    solid(ctx, -32, -29, -44, 44, 9); solid(ctx, 29, 32, -44, 44, 9); solid(ctx, -32, 32, 41.5, 44, 9); solid(ctx, -32, 32, -44, -40.5, 9);
    var beamM = new THREE.MeshStandardMaterial({ color: '#6A4228', roughness: 0.9 });
    var tie = ctx.instanced(new THREE.BoxGeometry(62, 0.4, 0.4), beamM, 9, function (i, d) { d.position.set(0, 8.2, -40 + i * 10); });
    var post = ctx.instanced(new THREE.BoxGeometry(0.35, 3.8, 0.35), beamM, 9, function (i, d) { d.position.set(0, 10.1, -40 + i * 10); });
    var diag = ctx.instanced(new THREE.BoxGeometry(16, 0.3, 0.3), beamM, 18, function (i, d) { var s = i % 2 ? 1 : -1; d.position.set(s * 7, 9.6, -40 + (i >> 1) * 10); d.rotation.z = -s * 0.22; });
    S.add(tie, post, diag);
    var doorM = new THREE.MeshStandardMaterial({ color: '#5A3416', roughness: 0.8 });
    box(2.4, 3.2, 0.2, doorM, -1.25, 1.6, -40.4, S); box(2.4, 3.2, 0.2, doorM, 1.25, 1.6, -40.4, S);
    var wm = new THREE.MeshStandardMaterial({ color: '#8A5A32', roughness: 0.9 }), wg = new THREE.TorusGeometry(0.9, 0.08, 6, 20);
    S.add(ctx.instanced(wg, wm, 6, function (i, d) { var s = i < 3 ? -1 : 1; d.position.set(s * 29.6, 5.2, -24 + (i % 3) * 22); d.rotation.y = PI / 2; }));
    neon(ctx, 'COLD BEER', '#2BA8FF', 5, 1.3, 120, -29.4, 5.4, 0, PI / 2);
    neon(ctx, 'HONKY TONK', '#FF2A3A', 7, 1.6, 120, 29.4, 5.6, -8, -PI / 2);
    neon(ctx, 'LONE STAR', '#FFB020', 9, 1.8, 130, 0, 7.6, 41.2, PI);
    neon(ctx, 'YEE HAW', '#FF4FA0', 4, 1.1, 120, 29.4, 5.6, 14, -PI / 2);
    neon(ctx, 'BULL RIDES', '#4FFF8A', 5, 1.2, 110, 29.4, 3.6, -16, -PI / 2);
    poster(ctx, 29.5, 3, 24, -PI / 2, '#C8142E', '#1F4F8A', 'RODEO', 1); poster(ctx, 29.5, 3, 0, -PI / 2, '#1F7A4A', '#E8A317', 'HOEDOWN', 2);
    poster(ctx, -29.5, 3, -24, PI / 2, '#E8A317', '#7A1A24', 'BANJO', 3); poster(ctx, -29.5, 3, 26, PI / 2, '#2BA8FF', '#2A2F4A', 'FIDDLE', 4);
    poster(ctx, -8, 3, -40.6, 0, '#C8142E', '#E8C98A', 'WANTED', 5); poster(ctx, 8, 3, -40.6, 0, '#1F7A4A', '#E8C98A', 'SALOON', 6);
  }

  function buildStage(ctx) {
    var S = ctx.scene, wood = surf(ctx, 'texture-planks', { project: 'box', size: 2, color: '#A87848' });
    box(26, 1.2, 9, wood, 0, 0.6, 36, S, true);
    solid(ctx, -13.3, 13.3, 31.4, 42, 1.3);
    var fl = ctx.textures.canvas(1024, 512, function (g, w, h) {
      g.fillStyle = '#B3162A'; g.fillRect(0, 0, w, h); g.fillStyle = '#F2E6C8'; for (var i = 0; i < 8; i++) { g.fillRect(i * 128, 0, 64, h); }
      g.globalAlpha = 0.5; g.fillStyle = '#1F3F8A'; g.fillRect(0, 0, w, h); g.globalAlpha = 1;
      g.fillStyle = '#F2B01E'; g.beginPath(); for (i = 0; i < 10; i++) { var a = -PI / 2 + i * PI / 5, r = i % 2 ? 60 : 150; g.lineTo(512 + Math.cos(a) * r, 256 + Math.sin(a) * r); } g.closePath(); g.fill();
    });
    var back = new THREE.Mesh(new THREE.PlaneGeometry(24, 8), new THREE.MeshStandardMaterial({ map: fl, roughness: 0.9 })); back.position.set(0, 5, 41.2); back.rotation.y = PI; S.add(back);
    var curt = new THREE.MeshStandardMaterial({ color: '#A01428', roughness: 0.95 });
    [-1, 1].forEach(function (s) { box(2.2, 8, 0.4, curt, s * 12.4, 4.6, 40.8, S); });
    var amp = new THREE.MeshStandardMaterial({ color: '#2A2A2E', roughness: 0.8 }), steel = new THREE.MeshStandardMaterial({ color: '#C4C9D0', metalness: 0.9, roughness: 0.3 });
    [[-9, 39.5], [9, 39.5], [-6, 34]].forEach(function (p) { box(1.2, 1.2, 0.7, amp, p[0], 1.8, p[1], S, true); });
    var kx = 6, kz = 38;
    [[0, 0.5], [-0.8, 0.8], [0.8, 0.8], [0, 1.0]].forEach(function (q, i) { var c = new THREE.Mesh(new THREE.CylinderGeometry(i === 0 ? 0.4 : 0.28, i === 0 ? 0.4 : 0.28, i === 0 ? 0.45 : 0.3, 18), new THREE.MeshStandardMaterial({ color: '#C8142E', roughness: 0.4, metalness: 0.2 })); c.position.set(kx + q[0], 1.2 + q[1] * 0.7 + 0.2, kz + (i === 3 ? 0.6 : 0)); if (i === 0) c.rotation.x = PI / 2; c.castShadow = true; S.add(c); });
    [[-1.4, 1.2], [1.4, 1.1]].forEach(function (q) { var c = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.02, 20), steel); c.position.set(kx + q[0], 1.2 + 1.5, kz + 0.6); S.add(c); });
    var ms = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 1.5, 6), steel); ms.position.set(-3, 1.95, 34.2); S.add(ms);
    var mk = function (o, x, z, ry) {
      var h = ctx.assets.human && ctx.assets.human('human-athlete-male', o); if (!h || !h.object) return;
      var g = new THREE.Group(); g.add(h.object); g.position.set(x, 1.2, z); g.rotation.y = ry; S.add(g); FX.band.push(h);
      g.traverse(function (m) { m.castShadow = false; });
    };
    mk({ skin: 'caucasian', hair: 'short03', height: 1.82, wear: ['male_casualsuit03', { name: 'shoes02', color: '#3A2A1E' }, { name: 'fedora01', color: '#E6DED0' }] }, -3, 34.8, PI);
    mk({ skin: 'african', hair: 'short02', height: 1.8, wear: ['male_casualsuit04', { name: 'shoes02', color: '#3A2A1E' }, { name: 'fedora01', color: '#141416' }] }, -8, 36, PI);
    mk({ skin: 'caucasian2', hair: 'short01', height: 1.78, wear: ['male_worksuit01', { name: 'shoes02', color: '#3A2A1E' }] }, kx, kz + 0.2, PI);
  }

  function buildBar(ctx) {
    var S = ctx.scene, wood = surf(ctx, 'texture-planks', { project: 'box', size: 1.5, color: '#8A5A32', roughness: 0.7 });
    box(1.3, 1.1, 20, wood, -26.8, 0.55, 0, S, true);
    box(1.6, 0.12, 20.4, new THREE.MeshStandardMaterial({ color: '#4A2A14', roughness: 0.25, metalness: 0.1 }), -26.7, 1.16, 0, S, true);
    solid(ctx, -31, -26.1, -10.4, 10.4, 1.3);
    var rail = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 20, 8), new THREE.MeshStandardMaterial({ color: '#E0B860', metalness: 1, roughness: 0.25 })); rail.rotation.x = PI / 2; rail.position.set(-25.9, 0.3, 0); S.add(rail);
    var mir = new THREE.Mesh(new THREE.PlaneGeometry(19, 3.2), new THREE.MeshStandardMaterial({ color: '#AABBCC', metalness: 1, roughness: 0.08, emissive: '#5A3A18', emissiveIntensity: 0.4 })); mir.position.set(-29.9, 3.4, 0); mir.rotation.y = PI / 2; S.add(mir);
    [2.0, 3.0, 4.0].forEach(function (y) { box(0.5, 0.07, 19.2, wood, -29.6, y, 0, S); });
    var prof = [[0, 0], [0.04, 0], [0.045, 0.02], [0.045, 0.2], [0.03, 0.28], [0.015, 0.33], [0.016, 0.4], [0, 0.4]].map(function (p) { return new THREE.Vector2(p[0], p[1]); });
    var cols = ['#2FAA50', '#C8741E', '#8FC8D8', '#C81E1E', '#E8C060'], R = rng(12), n = 3 * 18;
    var bm = ctx.instanced(new THREE.LatheGeometry(prof, 8), new THREE.MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.15, metalness: 0.1, emissive: '#552a10', emissiveIntensity: 0.7 }), n, function (i, d) { d.position.set(-29.55, 2.04 + (i % 3) * 1.0, -8.6 + Math.floor(i / 3) * 0.97 + R() * 0.2); d.rotation.y = R() * 6; });
    for (var i = 0; i < n; i++) bm.setColorAt(i, new THREE.Color(cols[i % 5]));
    S.add(bm);
    var st = ctx.assets.model('model-bar-stool');
    if (st) { S.add(st.instanced(8, function (i, d) { d.position.set(-25.3, 0, -8.75 + i * 2.5); })); for (i = 0; i < 8; i++) ctx.solid({ x: -25.3, z: -8.75 + i * 2.5, r: 0.28 }); }
  }

  function buildFurniture(ctx) {
    var S = ctx.scene, cafe = ctx.assets.model('model-cafe-set');
    if (cafe) {
      var T = 'outdoor_table_chair_set_01_table';
      S.add(cafe.instanced(TABLES.length, function (i, d) { d.position.set(TABLES[i][0], 0, TABLES[i][1]); }, [T]));
      S.add(cafe.instanced(TABLES.length, function (i, d) { d.position.set(TABLES[i][0] - 0.85, 0, TABLES[i][1]); d.rotation.y = PI / 2; }, [T.replace('table', 'chair_01')]));
      S.add(cafe.instanced(TABLES.length, function (i, d) { d.position.set(TABLES[i][0] + 0.85, 0, TABLES[i][1]); d.rotation.y = -PI / 2; }, [T.replace('table', 'chair_02')]));
    }
    TABLES.forEach(function (t) { ctx.solid({ x: t[0], z: t[1], r: 1.0 }); });
    var bar = ctx.assets.model('model-wine-barrel'), bp = [[-27, 24], [-27, -22], [27, -36], [-27, -36], [27, 36], [-14, 30.5], [14, 30.5], [-26, 30], [26, 30]];
    if (bar) { S.add(bar.instanced(bp.length, function (i, d) { d.position.set(bp[i][0], 0, bp[i][1]); d.rotation.y = i; })); bp.forEach(function (p) { ctx.solid({ x: p[0], z: p[1], r: 0.5 }); }); }
    var hay = ctx.textures.canvas(128, 128, function (g, w) { g.fillStyle = '#D9B450'; g.fillRect(0, 0, w, w); var R = rng(3); for (var i = 0; i < 500; i++) { g.strokeStyle = R() < 0.5 ? '#F0D27A' : '#A88A38'; g.beginPath(); var x = R() * w, y = R() * w; g.moveTo(x, y); g.lineTo(x + R() * 14 - 7, y + R() * 6); g.stroke(); } });
    var hp = [[-26, 38], [26, 38], [-27.5, 36], [27.5, 36], [-27, -38], [27, -38], [-24, -38], [24, -38]];
    S.add(ctx.instanced(new THREE.CylinderGeometry(0.5, 0.5, 1.0, 14), new THREE.MeshStandardMaterial({ map: hay, roughness: 1 }), hp.length, function (i, d) { d.position.set(hp[i][0], 0.5, hp[i][1]); d.rotation.set(0, i, PI / 2 * (i % 2)); }));
    hp.forEach(function (p) { ctx.solid({ x: p[0], z: p[1], r: 0.7 }); });
  }

  function buildBull(ctx) {
    var S = ctx.scene, g = new THREE.Group(); g.position.set(BULL[0], 0, BULL[1]); S.add(g);
    var pad = new THREE.Mesh(new THREE.CylinderGeometry(3, 3.1, 0.35, 28), new THREE.MeshStandardMaterial({ color: '#2A63C8', roughness: 0.6 })); pad.position.y = 0.18; pad.receiveShadow = true; g.add(pad);
    var rim = new THREE.Mesh(new THREE.TorusGeometry(3, 0.08, 6, 36), new THREE.MeshStandardMaterial({ color: '#D4182E', roughness: 0.4 })); rim.rotation.x = PI / 2; rim.position.y = 0.36; g.add(rim);
    var post = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.9, 10), new THREE.MeshStandardMaterial({ color: '#555', metalness: 0.7, roughness: 0.4 })); post.position.y = 0.8; g.add(post);
    var bull = new THREE.Group(); bull.position.y = 1.35; g.add(bull); FX.bull = bull;
    var hide = new THREE.MeshStandardMaterial({ color: '#7A4A28', roughness: 0.7 });
    var body = new THREE.Mesh(new THREE.SphereGeometry(0.6, 20, 14), hide); body.scale.set(1.5, 0.85, 0.95); body.castShadow = true; bull.add(body);
    var hump = new THREE.Mesh(new THREE.SphereGeometry(0.4, 14, 10), hide); hump.position.set(0.5, 0.35, 0); bull.add(hump);
    var head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 10), hide); head.scale.set(1.2, 0.9, 0.9); head.position.set(-1.0, 0.0, 0); bull.add(head);
    var horn = new THREE.MeshStandardMaterial({ color: '#F0E4C8', roughness: 0.4 });
    [-1, 1].forEach(function (s) { var h = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.5, 8), horn); h.position.set(-1.02, 0.28, s * 0.3); h.rotation.x = s * 0.9; bull.add(h); });
    var tail = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.02, 0.8, 6), hide); tail.position.set(0.95, -0.1, 0); tail.rotation.z = -0.5; bull.add(tail);
    var sad = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.12, 0.5), new THREE.MeshStandardMaterial({ color: '#B8682A', roughness: 0.5 })); sad.position.set(0.1, 0.5, 0); bull.add(sad);
    ctx.solid({ x: BULL[0], z: BULL[1], r: 3.1 });
  }

  function buildLights(ctx) {
    var S = ctx.scene, low = ctx.quality === 'low';
    var sky = ctx.sky({ hdri: 'sky-dusk', exposure: 0.04, light: 0.12 });
    var sdir = (sky && sky.userData && sky.userData.sun) ? sky.userData.sun.clone() : new THREE.Vector3(0.4, 0.8, -0.3);
    if (sdir.y < 0.5) sdir.y = 0.8; sdir.normalize();
    S.fog = new THREE.FogExp2('#2B1A12', 0.009);
    S.add(new THREE.HemisphereLight('#FFD8A8', '#4A2E1C', 1.35));
    var sun = new THREE.DirectionalLight('#FFD09A', 1.3); sun.position.copy(sdir).multiplyScalar(60); sun.castShadow = true; sun.shadow.mapSize.set(low ? 1024 : 2048, low ? 1024 : 2048);
    var sc = sun.shadow.camera; sc.left = -30; sc.right = 30; sc.top = 30; sc.bottom = -30; sc.far = 160; S.add(sun); S.add(sun.target);
    [['#FFB45A', 0, 7, 28, 10, 30], ['#FF7A5A', -21, 5, 0, 10, 26], ['#FFD090', 0, 7.5, 2, 9, 28], ['#7AB8FF', 22, 5.5, 0, 10, 26], ['#FFC080', 0, 6, -30, 11, 28], ['#FF4FA0', 10, 4, 22, 8, 20]].forEach(function (p) { var l = new THREE.PointLight(p[0], p[4], p[5], 1.2); l.position.set(p[1], p[2], p[3]); S.add(l); });
    var ys = 6.6, pts = [], bulbs = [];
    [-30, -18, -6, 6, 18, 28].forEach(function (z) {
      var px = -29, py = ys;
      for (var k = 1; k <= 20; k++) { var u = k / 20, x = lerp(-29, 29, u), y = ys - Math.sin(u * PI) * 0.9; pts.push(px, py, z, x, y, z); px = x; py = y; if (k < 20) bulbs.push([x, y - 0.12, z]); }
    });
    var wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); S.add(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: '#1A1A1A' })));
    S.add(ctx.instanced(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshStandardMaterial({ color: '#FFD9A0', emissive: '#FFB060', emissiveIntensity: 5 }), bulbs.length, function (i, d) { d.position.set(bulbs[i][0], bulbs[i][1], bulbs[i][2]); }));
    var pcols = ['#C8142E', '#F2B01E', '#2A63C8', '#2FAA50', '#F2E6C8', '#FF4FA0'], pm = ctx.instanced(new THREE.ConeGeometry(0.2, 0.55, 3), new THREE.MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.8, side: THREE.DoubleSide }), bulbs.length, function (i, d) { d.position.set(bulbs[i][0] + 0.2, bulbs[i][1] - 0.2, bulbs[i][2]); d.rotation.z = PI; });
    for (var q = 0; q < bulbs.length; q++) pm.setColorAt(q, new THREE.Color(pcols[q % 6]));
    S.add(pm);
    var cols = ['#FFB45A', '#FF4FA0', '#4FA8FF'];
    for (var i = 0; i < 3; i++) {
      var geo = new THREE.CylinderGeometry(0.12, 2.0, 9, 18, 1, true).translate(0, -4.5, 0);
      var m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color(cols[i]).multiplyScalar(0.3), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      m.position.set(-6 + i * 6, 8.5, 8); m.userData.noReflection = true; S.add(m); FX.beams.push(m);
    }
    var N = low ? 150 : 350, p = new Float32Array(N * 3), R = rng(5);
    for (i = 0; i < N; i++) { p[i * 3] = (R() - 0.5) * 56; p[i * 3 + 1] = R() * 8; p[i * 3 + 2] = (R() - 0.5) * 80; }
    var mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.BufferAttribute(p, 3));
    FX.motes = new THREE.Points(mg, new THREE.PointsMaterial({ color: '#FFD9A0', size: 0.06, transparent: true, opacity: 0.5, depthWrite: false })); FX.motes.frustumCulled = false; S.add(FX.motes);
  }

  function buildFX(ctx) {
    var S = ctx.scene, i;
    for (i = 0; i < 6; i++) { var r = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.65, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(2, 1.4, 0.4), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); r.rotation.x = -PI / 2; r.visible = false; r.userData = { t: -1, noReflection: true }; S.add(r); FX.rings.push(r); }
    var prof = [[0, 0], [0.34, 0], [0.36, 0.02], [0.2, 0.05], [0.18, 0.06], [0.17, 0.2], [0.12, 0.22], [0, 0.2]].map(function (p) { return new THREE.Vector2(p[0], p[1]); });
    FX.hats = new THREE.InstancedMesh(new THREE.LatheGeometry(prof, 12), new THREE.MeshStandardMaterial({ color: '#C9A46A', roughness: 0.7, side: THREE.DoubleSide }), 24); FX.hats.frustumCulled = false; S.add(FX.hats);
    for (i = 0; i < 24; i++) FX.hs.push({ p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Vector3(), life: 0 });
    FX.light = new THREE.PointLight('#FFB347', 0, 14, 1.5); S.add(FX.light); FX.d = new THREE.Object3D(); FX.hats.userData.noReflection = true;
    ctx.on('knockout', function (e) {
      if (!e) return; var x = e.x || 0, z = e.z || 0;
      for (var k = 0; k < FX.rings.length; k++) if (FX.rings[k].userData.t < 0) { var rr = FX.rings[k]; rr.userData.t = 0; rr.position.set(x, 0.08, z); rr.visible = true; break; }
      var n = 0; for (k = 0; k < 24 && n < 5; k++) if (FX.hs[k].life <= 0) { var h = FX.hs[k], a = Math.random() * TAU; h.p.set(x, 1.7, z); h.v.set(Math.cos(a) * (3 + Math.random() * 4), 6 + Math.random() * 4, Math.sin(a) * (3 + Math.random() * 4)); h.r.set(Math.random() * 8, Math.random() * 8, Math.random() * 8); h.life = 3; n++; }
      FX.light.position.set(x, 1.5, z); FX.light.intensity = 8; thump();
    });
  }
  function thump() {
    if (!FX.ac) return;
    try {
      var ac = FX.ac, o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
      o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.25); g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      o.connect(g); g.connect(FX.out); o.start(t); o.stop(t + 0.4);
    } catch (e) { void e; }
  }

  function ENV(ctx) {
    var T = ctx.THREE, g = new T.Group();
    [[30, 8, 0, 8, -34, '#FFB060', 1.8], [30, 8, 0, 8, 34, '#FFA040', 1.6], [20, 5, -29, 5, 0, '#4FA8FF', 1.4], [20, 5, 29, 5, 0, '#FF3A3A', 1.4], [14, 4, 0, 9, 0, '#FFD9A0', 1.6]].forEach(function (q) {
      var m = new T.Mesh(new T.PlaneGeometry(q[0], q[1]), new T.MeshBasicMaterial({ color: new T.Color(q[5]).multiplyScalar(q[6]), side: T.DoubleSide })); m.position.set(q[2], q[3], q[4]); m.lookAt(0, 2, 0); g.add(m);
    });
    return g;
  }

  GameMog.world({
    assets: ['human-athlete-male', 'human-athlete-female', 'human-pack-male', 'human-pack-female', 'texture-planks', 'texture-corrugated-metal', 'texture-brick', 'texture-concrete', 'sky-dusk', 'model-bar-stool', 'model-wine-barrel', 'model-cafe-set'],
    theme: { sky: '#2A2F4A', fog: '#4A3A3A', ink: '#FFF4E0', accent: '#E8A317', font: 'Rye' },
    graphics: { preset: 'golden', exposure: 1.45, bloom: { strength: 0.55, threshold: 0.95, radius: 0.45 }, grade: { contrast: 1.1, saturation: 1.15, warmth: 0.1, vignette: 0.32, grain: 0.012, split: 0.2 },
      shadows: { follow: 'hero', extent: 36, mapSize: 2048 }, environment: { intensity: 1.15, extras: ENV } },
    camera: { distance: 4.6, height: 1.9, fov: 54 },
    open: {
      bounds: { x: BOUNDS.x, z: BOUNDS.z }, spawn: [0, -36, 0],
      fight: 'boxing', kicks: false, jump: false, dodge: true,
      health: TUNE.health, maxEnemies: TUNE.maxEnemies,
      heat: Object.assign({ say: ['The cowboys want a piece of Iron Mike', 'The back table is coming', 'The deputies walk in', 'The whole saloon is up', 'Nobody sits down tonight', 'Last man standing'] }, TUNE.heat),
      hud: { gm: 'Belt ransom', banner: 'Raise 10,000 GM. Boone sells belts.' },
      words: { kos: 'Knockouts', kod: 'laid out', health: 'Chin', down: 'Counted out', by: ' counted you out.', won: 'Iron Mike won.' },
      goal: { gm: 10000, title: 'Belt recovered', text: 'Ten thousand GM bought back the gold belt.' },
      weapons: { spots: (function () { var s = []; for (var i = 0; i < 8; i++) s.push({ x: -26.2, z: -8.5 + i * 2.4, y: 1.22, kind: i % 3 === 1 ? 'glass' : 'bottle', stand: true, yaw: PI / 2 }); TABLES.forEach(function (t, j) { s.push({ x: t[0], z: t[1], y: 0.76, kind: j % 2 ? 'glass' : 'bottle', stand: true }); }); return s; })(), kinds: { bottle: 5, glass: 3 }, every: 25, drops: false },
      civilians: { count: LOWQ ? 12 : 18, look: guestLook, zones: [
        { x: 0, z: 8, r: 6, count: LOWQ ? 4 : 8, stance: 'dance', face: [0, 36] },
        { x: -8, z: 19, r: 3, count: LOWQ ? 1 : 2, stance: 'dance', face: [0, 36] },
        { x: 8, z: 19, r: 3, count: LOWQ ? 1 : 2, stance: 'dance', face: [0, 36] },
        { x: 21, z: -22, r: 6, count: 3, stance: 'talk' }], stances: { talk: 3, shift: 2, arms: 1, phone: 1 }, wander: false, turn: { kind: 'thug', share: TUNE.turn } },
      steps: 'wood', warm: true, coinFly: 'low', lod: 10, events: true,
      story: { objective: 'Raise 10,000 GM. Boone sells belts.', beats: BEATS },
      intro: INTRO, outro: OUTRO, crew: CREW,
      keyArt: { at: [0, -10], look: 0, tilt: 0.12 }
    },
    build: function (ctx) {
      FX.scene = ctx.scene; FX.band = []; FX.beams = []; FX.neon = [];
      buildLights(ctx); buildRoom(ctx); buildStage(ctx); buildBar(ctx); buildFurniture(ctx); buildBull(ctx); buildFX(ctx);
    },
    update: function (ctx, t, dt) {
      FX.band.forEach(function (b) { try { b.animate(t, dt, { speed: 0, lateral: 0, crashed: false, paused: false, brawl: { stance: 'dance' } }); } catch (e) { void e; } });
      if (FX.bull) { FX.bull.rotation.z = Math.sin(t * 1.7) * 0.2; FX.bull.rotation.x = Math.sin(t * 1.1) * 0.12; FX.bull.position.y = 1.35 + Math.abs(Math.sin(t * 1.7)) * 0.12; }
      FX.beams.forEach(function (b, i) { b.rotation.z = Math.sin(t * 0.7 + i * 2) * 0.4; b.rotation.x = Math.cos(t * 0.5 + i) * 0.3; });
      FX.neon.forEach(function (m, i) { m.material.color.setScalar(2.0 + 0.4 * Math.sin(t * 9 + i * 3) * Math.sin(t * 3.1 + i)); });
      var i;
      if (FX.motes) { var p = FX.motes.geometry.attributes.position, a = p.array; for (i = 0; i < p.count; i++) { a[i * 3 + 1] += dt * 0.12; a[i * 3] += Math.sin(t * 0.3 + i) * dt * 0.1; if (a[i * 3 + 1] > 8) a[i * 3 + 1] = 0; } p.needsUpdate = true; }
      FX.rings.forEach(function (r) { var u = r.userData; if (u.t < 0) return; u.t += dt; var k = u.t / 0.6; if (k >= 1) { u.t = -1; r.visible = false; return; } r.scale.setScalar(1 + k * 14); r.material.opacity = 1 - k; });
      if (FX.hats) {
        var d = FX.d;
        for (i = 0; i < 24; i++) {
          var h = FX.hs[i];
          if (h.life > 0) { h.v.y -= 14 * dt; h.p.addScaledVector(h.v, dt); if (h.p.y < 0.06) { h.p.y = 0.06; h.v.set(0, 0, 0); h.life -= dt * 3; } else h.life -= dt * 0.2; d.position.copy(h.p); d.rotation.set(h.r.x * t * (h.v.y === 0 ? 0 : 1), h.r.y * t * (h.v.y === 0 ? 0 : 1), 0); d.scale.setScalar(1); }
          else { d.position.set(0, -50, 0); d.scale.setScalar(0.001); }
          d.updateMatrix(); FX.hats.setMatrixAt(i, d.matrix);
        }
        FX.hats.instanceMatrix.needsUpdate = true;
      }
      if (FX.light && FX.light.intensity > 0) FX.light.intensity = Math.max(0, FX.light.intensity - dt * 20);
    },
    ambient: function (ctx) {
      var A = ctx.audio; if (!A || !A.context) return;
      var ac = A.context, len = ac.sampleRate * 3, buf = ac.createBuffer(1, len, ac.sampleRate), ch = buf.getChannelData(0), last = 0;
      for (var i = 0; i < len; i++) { last = last * 0.9 + (Math.random() * 2 - 1) * 0.1; ch[i] = last * 3; }
      var out = ac.createGain(); out.gain.value = 0.7; out.connect(A.destination); FX.ac = ac; FX.out = out;
      [[420, 0.8, 0.05, 0.31], [900, 1.2, 0.025, 0.7], [180, 0.6, 0.04, 0.13]].forEach(function (b) {
        var s = ac.createBufferSource(); s.buffer = buf; s.loop = true;
        var f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = b[0]; f.Q.value = b[1];
        var g = ac.createGain(); g.gain.value = b[2];
        var o = ac.createOscillator(), og = ac.createGain(); o.frequency.value = b[3]; og.gain.value = b[2] * 0.7; o.connect(og); og.connect(g.gain); o.start();
        s.connect(f); f.connect(g); g.connect(out); s.start(0, Math.random() * 2);
      });
    },
    player: function (ctx) {
      return ctx.assets.human('human-athlete-male', { skin: 'african', hair: 'none', height: 1.78, build: { muscle: 1, lean: 0.2, weight: 0.25 },
        outfit: { shoes: '#101010' }, name: 'Iron Mike Typson', color: '#C1121F',
        clothes: { pants: { kind: 'shorts', color: '#0B0B0B' }, gloves: '#C1121F', boots: '#101010', tattoos: { neck: true, color: '#1C2A38' } } });
    }
  });
})();
