// Reference world for the GameMog Runtime v1: "Clover Loop".
// Used by the runtime's own tests and shown to the model as a worked example
// of every hook. Everything here is creative choice; every rule is the runtime's.
GameMog.world({
  theme: { sky: '#9CCBEB', fog: '#BFDCEF', ink: '#23301F', panel: '#FFF8E7', accent: '#F28C28', font: 'Fredoka' },
  camera: { distance: 9, height: 4.2, fov: 64 },

  // a closed loop of [x, y, z] control points; the runtime smooths it into a
  // spline and keeps each lap between 320m and 900m
  track: {
    width: 13,
    points: [
      [0, 0, -110], [70, 1, -95], [115, 3, -40], [100, 2, 30], [55, 0, 60], [30, 1, 110],
      [-30, 3, 115], [-70, 2, 70], [-110, 1, 20], [-105, 0, -45], [-60, 1, -90],
    ],
  },

  build(ctx) {
    const { THREE, scene, scenery, track, random } = ctx;
    scene.add(new THREE.HemisphereLight('#EAF6FF', '#5C7A3A', 1.1));
    const sun = new THREE.DirectionalLight('#FFF1D6', 1.7);
    sun.position.set(80, 140, 60); sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -150, right: 150, top: 150, bottom: -150, far: 400 });
    scene.add(sun);

    const grass = ctx.textures.canvas(128, 128, (g, w, h) => {
      g.fillStyle = '#7DB356'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 400; i++) { g.fillStyle = random() < 0.5 ? '#6FA44A' : '#8CC263'; g.fillRect(random() * w, random() * h, 2, 3); }
    });
    grass.repeat.set(40, 40);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshStandardMaterial({ map: grass, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.4; ground.receiveShadow = true;
    scene.add(ground);

    // the racing surface and a verge either side
    scene.add(track.ribbon({ color: '#C9A06B', y: 0.03 }));
    scene.add(track.ribbon({ width: 1.2, offset: track.halfWidth + 0.6, color: '#F4EBD8', y: 0.05 }));
    scene.add(track.ribbon({ width: 1.2, offset: -track.halfWidth - 0.6, color: '#F4EBD8', y: 0.05 }));

    // trees, instanced, only where they cannot block the racing line
    const spots = [];
    while (spots.length < 180) {
      const x = (random() - 0.5) * 520, z = (random() - 0.5) * 520;
      if (track.clear(x, z, 6)) spots.push([x, z, 0.8 + random() * 0.9]);
    }
    const trunks = ctx.instanced(new THREE.CylinderGeometry(0.4, 0.6, 4, 7), new THREE.MeshStandardMaterial({ color: '#7A5234' }), spots.length,
      (i, o) => { const [x, z, s] = spots[i]; o.position.set(x, 2 * s - 0.4, z); o.scale.setScalar(s); });
    const crowns = ctx.instanced(new THREE.IcosahedronGeometry(2.6, 1), new THREE.MeshStandardMaterial({ color: '#4F8F3A', flatShading: true }), spots.length,
      (i, o) => { const [x, z, s] = spots[i]; o.position.set(x, 5 * s, z); o.scale.setScalar(s); });
    trunks.castShadow = crowns.castShadow = true;
    scenery.add(trunks, crowns);
  },

  // the player: authored facing +Z, standing on y = 0
  player(ctx) {
    return critter(ctx, '#F2E3C4', 'Pip');
  },

  // rival k (1, 2, 3, ...): every one distinct
  rival(ctx, k) {
    const names = ['Bramble', 'Tansy', 'Moss', 'Juniper', 'Fern', 'Sorrel', 'Nettle', 'Clove', 'Yarrow', 'Burdock'];
    const hues = ['#E8674A', '#4A90E2', '#9B59D0', '#F2C230', '#3DBB8A', '#E0508F', '#6B7A8F', '#D98E3A', '#58C4DD', '#8E5B3A'];
    const r = critter(ctx, hues[(k - 1) % hues.length], names[(k - 1) % names.length] + (k > names.length ? ' ' + (Math.floor((k - 1) / names.length) + 1) : ''));
    r.object.scale.setScalar(1 + Math.min(k, 10) * 0.03); // later rivals are a little bigger
    return r;
  },

  obstacles(ctx) {
    const { THREE, random } = ctx;
    const rock = () => {
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry(1.1, 0), new THREE.MeshStandardMaterial({ color: '#8C8C84', flatShading: true }));
      m.position.y = 0.7; m.rotation.set(random(), random(), random());
      const g = new THREE.Group(); g.add(m); return g;
    };
    const log = () => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 3, 10), new THREE.MeshStandardMaterial({ color: '#8A5A36' }));
      m.rotation.z = Math.PI / 2; m.position.y = 0.55;
      const g = new THREE.Group(); g.add(m); return g;
    };
    const out = [];
    for (let i = 0; i < 16; i++) {
      out.push({ at: 0.12 + i * 0.053, x: (random() * 2 - 1) * 4.5, object: rock() });
    }
    out.push({ at: 0.5, x: 0, object: log(), move: { amplitude: 3.5, period: 3.2 } });
    return out;
  },

  update(ctx, t) {
    // nothing ambient in the reference world beyond what the runtime animates
  },
});

function critter(ctx, color, name) {
  const { THREE } = ctx;
  const g = new THREE.Group();
  const fur = new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.85, 20, 16), fur);
  body.scale.set(1, 1.1, 1); body.position.y = 1.05;
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.5, 20), new THREE.MeshStandardMaterial({ color: '#FFF4E0' }));
  face.position.set(0, 1.2, 0.84);
  const eyeMat = new THREE.MeshStandardMaterial({ color: '#15110E' });
  const eyes = [-0.18, 0.18].map((x) => { const e = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), eyeMat); e.position.set(x, 1.28, 0.9); return e; });
  const feet = [-0.35, 0.35].map((x) => { const f = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), fur); f.position.set(x, 0.2, 0.1); return f; });
  g.add(body, face, ...eyes, ...feet);
  return {
    object: g, name, color,
    animate(t, dt, s) {
      const run = s.speed * 0.9;
      body.position.y = 1.05 + Math.abs(Math.sin(t * run * 0.5)) * 0.18;
      feet[0].position.z = 0.1 + Math.sin(t * run * 0.5) * 0.3;
      feet[1].position.z = 0.1 - Math.sin(t * run * 0.5) * 0.3;
      g.rotation.z = -s.lateral * 0.02;
      if (s.crashed) g.rotation.x = Math.min(1.4, g.rotation.x + dt * 4);
      else g.rotation.x = 0;
    },
  };
}
