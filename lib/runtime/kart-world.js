// Kart test circuit for the GameMog Runtime v1: "Greybox Ring".
// The kart kit's fixture (lib/runtime/kart.js; npm run check:runtime, the kart section): a world that asks for a
// kart race (kart: { ... }), on a circuit with each kind of corner a kart track needs, and the roster's eight racers
// (ctx.kart.racer). The circuit is not art; it is the shape of a kart world, and what the checks drive on.
const COURSE = {
  shoulder: 4,
  pads: [{ at: 0.149, x: -2.5 }, { at: 0.545, x: 3 }],
  ramps: [{ at: 0.64, x: 0, width: 8, size: 'small' }],
  offroad: [{ from: 0.47, to: 0.505, side: 'outside', width: 5, kind: 'mud' }],
  walls: { gaps: [{ from: 0.668, to: 0.703, side: 'left', water: true }] },
  // three rows of Airdrop crates: on the main straight 270 m from the line, out of the hairpin, and on the back
  // straight before the sweeper
  airdrops: [{ at: 0.24, x: 0, n: 5 }, { at: 0.42, x: 0, n: 4 }, { at: 0.82, x: 0, n: 5 }],
  gm: 'auto',
  // the road's chaos (7 Oct): three rollers at the start of the back straight; a break across the road a little on
  // (8 m), a lip on its right to jump it and two linked rails along its left to grind over it, a charge jump anywhere
  // else; a rolling GM coin past the pond, a toppling candle into the sweeper, and meteors on the way home
  bumps: [{ at: 0.522, size: 'roller', n: 3 }, { at: 0.574, x: 4.5, width: 6, size: 'lip' }],
  breaks: [{ from: 0.576, len: 8 }],
  rails: [{ points: [[0.562, -5], [0.585, -5]] }, { points: [[0.585, -5], [0.6, -2.5]] }],
  hazards: [{ kind: 'crossing', at: 0.722, side: 'right' }, { kind: 'topple', at: 0.79, side: 'right' }, { kind: 'meteor', from: 0.87, to: 0.95 }],
};
// the racers: the roster's ids (ctx.kart.racers) and the names they race under, the four stars first
const RACERS = [['pepe', 'Pepe'], ['doge', 'Doge'], ['shiba', 'Shiba'], ['bike', 'Bike Tyson'], ['bull', 'Bull Run'], ['bear', 'Big Bear'], ['whale', 'The Whale'], ['mooncat', 'Moon Cat']];

GameMog.world({
  theme: { sky: '#A9D3F2', fog: '#CFE6F6', ink: '#1E2228', panel: '#F6F8FA', accent: '#7CFF4F', font: 'Oxanium' },
  graphics: { preset: 'toy', shadows: { extent: 46 } },

  // about 1,140 m round and 16 m wide (the plan's kart track: a lap of 1,050 to 1,300 m, 13 to 18 m wide): a 380 m
  // straight (the line is 80 m into it, the grid behind), a hairpin of about 20 m, an S of two 60-degree bends, a long
  // back straight and a long sweeper back onto it (the line about 95 m in radius coming in, 60 m mid-corner)
  track: {
    width: 16,
    points: [
      [-160.8, 0], [-134.4, 0], [-108, 0], [-81.6, 0], [-55.2, 0], [-28.8, 0], [-2.4, 0], [24, 0],
      [50.4, 0], [76.8, 0], [103.2, 0], [129.6, 0], [156, 0], [174.7, 7.7], [182.4, 26.4], [174.7, 45.1],
      [156, 52.8], [120, 52.8], [96, 59.3], [78.5, 76.8], [66, 98.4], [53.5, 120], [35.9, 137.6], [11.9, 144],
      [-13.3, 144], [-38.5, 144], [-63.7, 144], [-88.9, 144], [-114.1, 144], [-139.3, 144], [-164.5, 144], [-189.7, 144],
      [-214.9, 144], [-240.1, 144], [-260.4, 141.1], [-279, 132.6], [-294.5, 119.2], [-305.6, 102], [-311.4, 82.3], [-311.4, 61.8],
      [-305.6, 42.1], [-294.5, 24.8], [-279, 11.5], [-260.4, 3], [-240, 0], [-213.6, 0], [-187.2, 0],
    ],
  },

  // three laps; grass 4 m wide either side of the road, then the walls. The course: two Green Candle pads (one on
  // the main straight, one out of the S), a small ramp on the back straight to trick off, mud on the outside of the
  // S's exit, a gap in the wall after the ramp where the pond comes up to the grass (the Rescue Claw's), the GM,
  // three rows of Airdrop crates, and the chaos: rollers, a break with a lip and rails, and three hazards
  kart: { laps: 3, course: COURSE },
  // the score Meme Kart races to (the runtime's own composer): it builds with each lap, and the kart kit takes the
  // final lap to 168 BPM
  music: { style: 'tropical', key: 'F', mode: 'major', tempo: 160, seed: 'Meme Kart 92', lead: 'synthlead', chords: 'pluck', arp: 'synthpluck', counter: 'brass', drums: 'lofi' },

  build(ctx) {
    const { THREE, scene, scenery, track, random } = ctx;
    scene.add(new THREE.HemisphereLight('#EEF6FF', '#6B8A4A', 1.05));
    const sun = new THREE.DirectionalLight('#FFF3DC', 2.0);
    sun.position.set(70, 120, 50); sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    scene.add(sun);

    // plain ground, a grey road, red and white kerbs at its edges, and a chequered line
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), new THREE.MeshStandardMaterial({ color: '#86B05A', roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.05; ground.receiveShadow = true;
    scene.add(ground);
    const asphalt = ctx.textures.canvas(256, 256, (g, w, h) => {
      g.fillStyle = '#5B5F66'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 2600; i++) { const v = 80 + Math.floor(random() * 40); g.fillStyle = `rgb(${v},${v + 2},${v + 6})`; g.fillRect(random() * w, random() * h, 2, 2); }
    });
    scene.add(track.ribbon({ material: new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.92 }), y: 0.02, tile: 12 }));
    const kerb = ctx.textures.canvas(64, 128, (g, w, h) => { g.fillStyle = '#F4F4F4'; g.fillRect(0, 0, w, h); g.fillStyle = '#D9342B'; g.fillRect(0, 0, w, h / 2); });
    for (const side of [-1, 1]) scene.add(track.ribbon({ width: 1.4, offset: side * (track.halfWidth + 0.3), y: 0.04, tile: 4, material: new THREE.MeshStandardMaterial({ map: kerb, roughness: 0.8 }) }));
    const chequer = ctx.textures.canvas(128, 128, (g, w, h) => { for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { g.fillStyle = (x + y) % 2 ? '#111' : '#F4F4F4'; g.fillRect(x * w / 8, y * h / 8, w / 8, h / 8); } });
    chequer.repeat.set(10, 1);
    const line = new THREE.Mesh(new THREE.PlaneGeometry(track.width, 2), new THREE.MeshStandardMaterial({ map: chequer, roughness: 0.8 }));
    const f0 = track.frameAt(0);
    line.position.copy(f0.pos).setY(f0.pos.y + 0.05); line.rotation.set(-Math.PI / 2, 0, Math.atan2(f0.tan.x, f0.tan.z));
    scene.add(line);
    // the grid's boxes, two columns, staggered
    const slotMat = new THREE.MeshStandardMaterial({ color: '#F4F4F4', roughness: 0.8 });
    for (let s = 0; s < 8; s++) {
      const row = Math.floor(s / 2), col = s % 2, d = track.length - (5 + row * 6 + col * 3) + 1.6, x = col ? -1.6 : 1.6;
      const f = track.frameAt(d), bar = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.02, 0.25), slotMat);
      bar.position.copy(track.pointAt(d, x, 0.05)); bar.rotation.y = Math.atan2(f.tan.x, f.tan.z);
      scene.add(bar);
    }

    // the walls: a low concrete barrier with a coloured rail, 4 m off each edge of the road, open where the course
    // leaves a gap (there the grass runs down to the pond)
    const L = track.length, wallAt = track.halfWidth + COURSE.shoulder + 0.3;
    const gaps = COURSE.walls.gaps.map((g) => ({ d0: g.from * L, d1: g.to * L, side: g.side === 'left' ? -1 : 1 }));
    const runs = (side) => {
      const cut = gaps.filter((g) => g.side === side).sort((a, b) => a.d0 - b.d0), out = [];
      let at = 0;
      for (const g of cut) { out.push([at, g.d0]); at = g.d1; }
      out.push([at, L]);
      return out.filter(([a, b]) => b - a > 1);
    };
    // a band along the track from d0 to d1: its profile [across, up] pairs, offset across by `at`
    const band = (side, d0, d1, profile, at) => {
      const pos = [], idx = [], n = Math.max(2, Math.round((d1 - d0) / 2)), m = profile.length;
      for (let i = 0; i <= n; i++) {
        const f = track.frameAt(d0 + (d1 - d0) * i / n);
        for (const [o, y] of profile) { const p = f.pos.clone().addScaledVector(f.right, side * (at + o)).addScaledVector(f.up, y); pos.push(p.x, p.y, p.z); }
        if (i < n) for (let q = 0; q < m - 1; q++) { const a = i * m + q, b = a + m; idx.push(a, b, a + 1, a + 1, b, b + 1); }
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
      return g;
    };
    const concrete = new THREE.MeshStandardMaterial({ color: '#C9C6BE', roughness: 0.9, side: THREE.DoubleSide });
    for (const side of [-1, 1]) {
      const railMat = new THREE.MeshStandardMaterial({ color: side > 0 ? '#2E7BEA' : '#E8463A', roughness: 0.5, side: THREE.DoubleSide });
      for (const [d0, d1] of runs(side)) {
        const w = new THREE.Mesh(band(side, d0, d1, [[0, 0], [0, 1.0], [0.6, 1.0], [0.6, 0]], wallAt), concrete); w.castShadow = w.receiveShadow = true; w.userData.gmKart = true; scene.add(w);
        const rail = new THREE.Mesh(band(side, d0, d1, [[-0.05, 1.0], [-0.05, 1.12], [0.65, 1.12], [0.65, 1.0]], wallAt), railMat); rail.userData.gmKart = true; scene.add(rail);
      }
    }
    // the pond past the gap: deep water up to the grass (in it for 0.4 s and the Rescue Claw comes)
    const water = new THREE.MeshStandardMaterial({ color: '#1F5E86', roughness: 0.12, metalness: 0.2, emissive: '#0B2A3D', emissiveIntensity: 0.4, side: THREE.DoubleSide });
    for (const g of gaps) {
      const pond = new THREE.Mesh(band(g.side, g.d0 - 14, g.d1 + 14, [[0, 0.01], [36, 0.01]], wallAt - 0.3), water);
      pond.receiveShadow = true; pond.userData.gmKart = true; scene.add(pond);
      const bank = new THREE.Mesh(band(g.side, g.d0 - 14, g.d1 + 14, [[-0.4, 0.06], [0.4, -0.12]], wallAt - 0.3), new THREE.MeshStandardMaterial({ color: '#6B5A3E', roughness: 1, side: THREE.DoubleSide }));
      bank.userData.gmKart = true; scene.add(bank);
    }

    // blocks and trees out beyond the walls, where they cannot be in anyone's way
    const spots = [];
    for (let tries = 0; spots.length < 140 && tries < 4000; tries++) {
      const x = -400 + random() * 680, z = -130 + random() * 400;
      if (track.clear(x, z, 9) && !(z > 150 && z < 200 && x < -130 && x > -240)) spots.push([x, z, 0.8 + random() * 0.8]);
    }
    const trunks = ctx.instanced(new THREE.CylinderGeometry(0.35, 0.5, 3.2, 6), new THREE.MeshStandardMaterial({ color: '#7A5638' }), spots.length,
      (i, o) => { const [x, z, s] = spots[i]; o.position.set(x, 1.6 * s, z); o.scale.setScalar(s); });
    const crowns = ctx.instanced(new THREE.ConeGeometry(2.2, 5, 7), new THREE.MeshStandardMaterial({ color: '#3F7F3A', flatShading: true }), spots.length,
      (i, o) => { const [x, z, s] = spots[i]; o.position.set(x, 5 * s, z); o.scale.setScalar(s); });
    trunks.castShadow = crowns.castShadow = true;
    scenery.add(trunks, crowns);
    const stands = [[-48, -38, 70], [72, 192, 50], [-240, 72, 30]];
    for (const [x, z, w] of stands) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, 6, 10), new THREE.MeshStandardMaterial({ color: '#B9C2CC', roughness: 0.8 }));
      b.position.set(x, 3, z); b.castShadow = b.receiveShadow = true; scenery.add(b);
    }
  },

  // you and seven rivals: the roster's eight (RACERS, above), Pepe first, each with its own handling (all-round,
  // light and quick, the drifters, the heavies)
  player(ctx) { return ctx.kart.racer(RACERS[0][0], { name: RACERS[0][1] }); },
  rival(ctx, k) { const R = RACERS[k % 8]; return ctx.kart.racer(R[0], { name: R[1] }); },
});
