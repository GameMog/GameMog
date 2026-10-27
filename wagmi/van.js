// Mog City: JP Bank security's van. A plain black high-roof panel van with no maker's name: a short sloped nose, a
// raked windscreen, a sliding side door on the right (curb) side that rolls back along its rail, two rear doors. On
// both sides a thin steel-grey pinstripe at the belt line and, small on the cargo side, 'JP BANK' over 'SECURITY' (the
// game's fictional bank); kept clean, a little road dust along the sills.
//
//   const van = buildVan(THREE); scene.add(van.group);
//   van.setDoor(0..1);              // the sliding door: 0 shut, 1 open (out off its seal, then back along the rail)
//   van.update(dt, speed, steer);   // wheels turn with the speed, the front ones steer (radians)
// Units are metres; the van stands on y = 0, nose to +z, 5.6 x 2.0 x 2.4 m.
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function buildVan(THREE, o = {}) {
  const g = new THREE.Group(); g.name = 'wagmi-van';
  const body = new THREE.Group(); g.add(body); // (rolls and pitches on its springs)
  const W = 1.0; // half width
  const FRONT_AXLE = 1.78, REAR_AXLE = -1.62, WHEEL_R = 0.37, ARCH_R = 0.47;

  /* ------------------------------------------------------------- paint -- */
  // (a satin black that stays black from every side: little metal, a dull coat, the sky's reflection kept low)
  const paint = new THREE.MeshPhysicalMaterial({ color: '#0E0F11', roughness: 0.6, metalness: 0.08, clearcoat: 0.18, clearcoatRoughness: 0.55, envMapIntensity: 0.35 });
  const trim = new THREE.MeshStandardMaterial({ color: '#1C1D20', roughness: 0.85 });
  const glass = new THREE.MeshPhysicalMaterial({ color: '#07090C', roughness: 0.06, metalness: 0.1, clearcoat: 1 });
  const dark = new THREE.MeshStandardMaterial({ color: '#050506', roughness: 0.95 });
  const steel = new THREE.MeshStandardMaterial({ color: '#2A2C30', roughness: 0.5, metalness: 0.7 });
  const tyre = new THREE.MeshStandardMaterial({ color: '#141415', roughness: 0.92 });
  const lamp = new THREE.MeshStandardMaterial({ color: '#FFF4DA', emissive: '#FFE9C0', emissiveIntensity: 2.2, roughness: 0.2 });
  const tail = new THREE.MeshStandardMaterial({ color: '#5A0A0A', emissive: '#FF2A1A', emissiveIntensity: 0.9, roughness: 0.3 });
  const amber = new THREE.MeshStandardMaterial({ color: '#7A4A08', emissive: '#FF9A1A', emissiveIntensity: 0.25, roughness: 0.3 });

  /* --------------------------------------------------- the body's profile -- */
  // the side profile (z forward, y up), round the van from the rear bumper's foot, the wheel arches cut out of the sill
  const P = new THREE.Shape();
  P.moveTo(-2.78, 0.4);
  P.lineTo(-2.82, 0.55); P.lineTo(-2.82, 2.28); P.quadraticCurveTo(-2.82, 2.4, -2.7, 2.4);
  P.lineTo(1.05, 2.4); P.quadraticCurveTo(1.32, 2.4, 1.42, 2.27);
  P.lineTo(2.2, 1.36); P.quadraticCurveTo(2.3, 1.24, 2.5, 1.17);
  P.lineTo(2.7, 1.08); P.quadraticCurveTo(2.82, 1.02, 2.82, 0.9); P.lineTo(2.82, 0.48); P.lineTo(2.74, 0.4);
  // the sill back to the rear, round both arches (walking the outline backwards: front arch, then rear)
  P.lineTo(FRONT_AXLE + ARCH_R, 0.4);
  P.absarc(FRONT_AXLE, 0.36, ARCH_R, 0.09, Math.PI - 0.09, false);
  P.lineTo(REAR_AXLE + ARCH_R, 0.4);
  P.absarc(REAR_AXLE, 0.36, ARCH_R, 0.09, Math.PI - 0.09, false);
  P.lineTo(-2.78, 0.4);
  const shell = new THREE.ExtrudeGeometry(P, { depth: 2 * W - 0.12, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 4, curveSegments: 18 });
  // the shape is drawn in x = z, y = y; extruded along +z: turn it so its depth runs across the van (x)
  shell.translate(0, 0, -(W - 0.06));
  shell.rotateY(-Math.PI / 2);
  const shellMesh = new THREE.Mesh(shell, paint); body.add(shellMesh);
  // the wheel wells: dark tunnels across under the arches
  for (const az of [FRONT_AXLE, REAR_AXLE]) {
    const well = new THREE.Mesh(new THREE.CylinderGeometry(ARCH_R - 0.01, ARCH_R - 0.01, 2 * W - 0.02, 20, 1, true, -Math.PI / 2, Math.PI), dark);
    well.material = dark.clone(); well.material.side = THREE.BackSide;
    well.rotation.z = Math.PI / 2; well.position.set(0, 0.36, az); body.add(well);
  }

  /* ------------------------------------------------------- the side art -- */
  // one canvas for each side, 2048 x 512 over the side's 5.64 x 1.9 m (z -2.82..2.82, y 0.42..2.32)
  const SIDE = { z0: -2.82, z1: 2.82, y0: 0.42, y1: 2.32 };
  const zu = (z) => (z - SIDE.z0) / (SIDE.z1 - SIDE.z0), yv = (y) => (y - SIDE.y0) / (SIDE.y1 - SIDE.y0);
  function sideCanvas(mirror) {
    const c = document.createElement('canvas'); c.width = 2048; c.height = 690;
    const x = c.getContext('2d'), Wc = c.width, Hc = c.height;
    // (mirror: the left side's canvas runs nose to tail, the right side's tail to nose: both read left to right)
    const X = (z) => (mirror ? 1 - zu(z) : zu(z)) * Wc, Y = (y) => (1 - yv(y)) * Hc;
    x.clearRect(0, 0, Wc, Hc);
    // road dust: a faint band along the sill (a fleet van, washed, not a wreck)
    const grime = x.createLinearGradient(0, Y(0.8), 0, Y(0.42));
    grime.addColorStop(0, 'rgba(120,112,100,0)'); grime.addColorStop(1, 'rgba(120,112,100,0.3)');
    x.fillStyle = grime; x.fillRect(0, Y(0.8), Wc, Y(0.42) - Y(0.8));
    // the pinstripe at the belt line, its leading end cut on a slant
    const sy0 = Y(1.37), sy1 = Y(1.345);
    x.fillStyle = 'rgba(150,156,166,0.85)';
    x.beginPath(); x.moveTo(X(-2.82), sy0); x.lineTo(X(1.9), sy0); x.lineTo(X(1.94), sy1); x.lineTo(X(-2.82), sy1); x.closePath(); x.fill();
    // the name, small and plain, high on the cargo side behind the cab: 'JP BANK' over 'SECURITY', letter-spaced
    const cx = X(-1.15);
    x.textAlign = 'center'; x.textBaseline = 'alphabetic';
    const spaced = (t, y, sp) => { const w = [...t].reduce((a, ch) => a + x.measureText(ch).width, 0) + sp * (t.length - 1); let at = cx - w / 2; x.textAlign = 'left'; for (const ch of t) { x.fillText(ch, at, y); at += x.measureText(ch).width + sp; } x.textAlign = 'center'; };
    x.fillStyle = 'rgba(232,234,238,0.94)';
    x.font = '700 70px "Barlow Condensed", "Arial Narrow", sans-serif';
    spaced('JP BANK', Y(1.83), 10);
    x.fillStyle = 'rgba(170,176,186,0.9)';
    x.font = '600 34px "Barlow Condensed", "Arial Narrow", sans-serif';
    spaced('SECURITY', Y(1.7), 12);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    return t;
  }
  // the art rides on thin planes just off the panels, cut round the windows; the door's share on the door
  const DOOR = { z0: -0.62, z1: 0.86, y0: 0.5, y1: 2.12 };
  function artPlane(tex, side, z0, z1, y0, y1, mirror, off = 0.008) {
    const x = side * (W + off), pos = [], uvs = [];
    for (const [z, y] of [[z0, y0], [z1, y0], [z1, y1], [z0, y1]]) { pos.push(x, y, z); uvs.push(mirror ? 1 - zu(z) : zu(z), yv(y)); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(side > 0 ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3]); geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.55, metalness: 0.1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    m.renderOrder = 2;
    return m;
  }
  const leftTex = sideCanvas(true), rightTex = sideCanvas(false);
  // the left side (driver's, +x): all of it below the windows
  body.add(artPlane(leftTex, 1, -2.8, 1.0, 0.44, 2.3, true));
  body.add(artPlane(leftTex, 1, 1.0, 2.2, 0.44, 1.32, true));
  // the right side (curb, -x): around the sliding door
  body.add(artPlane(rightTex, -1, -2.8, DOOR.z0, 0.44, 2.3, false));
  body.add(artPlane(rightTex, -1, DOOR.z0, DOOR.z1, 0.44, DOOR.y0, false));
  body.add(artPlane(rightTex, -1, DOOR.z0, DOOR.z1, DOOR.y1, 2.3, false));
  body.add(artPlane(rightTex, -1, DOOR.z1, 2.2, 0.44, 1.32, false));

  /* -------------------------------------------------------------- glass -- */
  // (built in place: the window's z runs along the van)
  for (const side of [1, -1]) {
    const pts = [[0.98, 1.38], [2.14, 1.38], [1.38, 2.22], [0.98, 2.22]];
    const pos = [], idx = [0, 1, 2, 0, 2, 3];
    for (const [z, y] of pts) pos.push(side * (W + 0.012), y, z);
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(side > 0 ? [0, 2, 1, 0, 3, 2] : idx); geo.computeVertexNormals();
    body.add(new THREE.Mesh(geo, glass));
    // the window's black rubber surround
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 1.2), trim); frame.position.set(side * (W + 0.006), 1.35, 1.57); body.add(frame);
    // the B-pillar seam and the cab door's cut line
    const seam = new THREE.Mesh(new THREE.BoxGeometry(0.012, 1.7, 0.012), dark); seam.position.set(side * (W + 0.01), 1.3, 0.92); body.add(seam);
  }
  {
    // the windscreen, on the raked panel between the roof and the bonnet
    const pts = [[-0.92, 1.4, 2.16], [0.92, 1.4, 2.16], [0.86, 2.24, 1.4], [-0.86, 2.24, 1.4]];
    const n = new THREE.Vector3(0, 0.76, 0.65).normalize().multiplyScalar(0.015);
    const pos = []; for (const p of pts) pos.push(p[0] + n.x, p[1] + n.y, p[2] + n.z);
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex([0, 1, 2, 0, 2, 3]); geo.computeVertexNormals();
    body.add(new THREE.Mesh(geo, glass));
    // wipers
    for (const x of [-0.45, 0.25]) { const w = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.015, 0.02), trim); w.position.set(x, 1.44, 2.13); w.rotation.z = 0.2; body.add(w); }
  }
  // rear doors: two dark windows and the split
  for (const x of [-0.48, 0.48]) { const w = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.55, 0.02), glass); w.position.set(x, 1.85, -2.885); body.add(w); }
  { const split = new THREE.Mesh(new THREE.BoxGeometry(0.012, 1.8, 0.02), dark); split.position.set(0, 1.4, -2.885); body.add(split); }

  /* ------------------------------------------------- nose, tail, details -- */
  const box = (w, h, d, mat, x, y, z, parent = body) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); parent.add(m); return m; };
  box(2.04, 0.3, 0.2, trim, 0, 0.55, 2.82);            // front bumper
  box(2.04, 0.26, 0.2, trim, 0, 0.55, -2.84);          // rear bumper
  box(1.3, 0.3, 0.04, dark, 0, 0.88, 2.86);            // grille
  for (let i = 0; i < 4; i++) box(1.24, 0.018, 0.02, steel, 0, 0.78 + i * 0.065, 2.885);
  for (const s of [1, -1]) {
    box(0.36, 0.16, 0.05, lamp, s * 0.76, 0.98, 2.84);  // headlamps
    box(0.1, 0.08, 0.05, amber, s * 0.96, 0.98, 2.82);   // indicators
    box(0.14, 0.42, 0.05, tail, s * 0.93, 1.05, -2.87);  // tail lamps
    // mirrors on stalks at the A-pillars
    const arm = box(0.2, 0.03, 0.03, trim, s * 1.1, 1.6, 2.0); arm.rotation.y = s * 0.2;
    box(0.06, 0.24, 0.15, trim, s * 1.2, 1.62, 2.0);
    // the cab door's handle and the step under the sliding door
    box(0.02, 0.03, 0.16, steel, s * (W + 0.03), 1.25, 1.75);
  }
  // a plate with no state on it, front and back
  for (const z of [2.94, -2.95]) box(0.52, 0.11, 0.01, new THREE.MeshStandardMaterial({ color: '#E8E4D8', roughness: 0.6 }), 0, 0.55, z);
  // the roof rail the sliding door hangs from
  box(0.03, 0.03, 2.2, steel, -(W + 0.02), 2.16, -0.6);

  /* ---------------------------------------------------- the sliding door -- */
  // the opening (dark, the cargo bay behind it) and the door, which pops out 6 cm and rolls back along the rail
  // (the bay in the dark, lit by a strip of cool white LEDs along its roof, a bench and the floor's edge catching it)
  const bayTex = (() => {
    const c = document.createElement('canvas'); c.width = 128; c.height = 256; const x = c.getContext('2d');
    const gr = x.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, '#3A4048'); gr.addColorStop(0.05, '#171A1E'); gr.addColorStop(0.35, '#070808'); gr.addColorStop(1, '#030303');
    x.fillStyle = gr; x.fillRect(0, 0, 128, 256);
    x.fillStyle = '#DDE6F0'; x.fillRect(0, 0, 128, 5);
    x.fillStyle = 'rgba(42,46,52,0.9)'; x.fillRect(10, 150, 108, 26);   // a bench's edge
    x.fillStyle = 'rgba(70,72,66,0.8)'; x.fillRect(0, 240, 128, 6);     // the floor's lip
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const bayMat = new THREE.MeshStandardMaterial({ color: '#FFFFFF', map: bayTex, emissive: '#FFFFFF', emissiveMap: bayTex, emissiveIntensity: 0.35, roughness: 0.9 });
  const opening = box(0.02, DOOR.y1 - DOOR.y0, DOOR.z1 - DOOR.z0, bayMat, -(W + 0.004), (DOOR.y0 + DOOR.y1) / 2, (DOOR.z0 + DOOR.z1) / 2);
  // the floor's lip at the door's foot (things left on it show)
  box(0.12, 0.03, DOOR.z1 - DOOR.z0 - 0.06, new THREE.MeshStandardMaterial({ color: '#2A2C30', roughness: 0.7, metalness: 0.5 }), -(W + 0.05), DOOR.y0 + 0.015, (DOOR.z0 + DOOR.z1) / 2);
  const door = new THREE.Group(); body.add(door);
  {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.05, DOOR.y1 - DOOR.y0, DOOR.z1 - DOOR.z0), paint);
    panel.position.set(-(W + 0.012), (DOOR.y0 + DOOR.y1) / 2, (DOOR.z0 + DOOR.z1) / 2); door.add(panel);
    door.add(artPlane(rightTex, -1, DOOR.z0, DOOR.z1, DOOR.y0, DOOR.y1, false, 0.04));
    box(0.04, 0.03, 0.18, steel, -(W + 0.06), 1.2, DOOR.z1 - 0.2, door);
  }
  let doorK = 0;
  function setDoor(k) {
    doorK = Math.max(0, Math.min(1, k));
    const out = Math.min(1, doorK / 0.18), slide = Math.max(0, (doorK - 0.12) / 0.88);
    door.position.set(-0.075 * out, 0, -1.42 * slide);
  }
  setDoor(0);

  /* -------------------------------------------------------------- wheels -- */
  const tyreGeo = new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.25, 28); tyreGeo.rotateZ(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.255, 18); rimGeo.rotateZ(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.27, 10); hubGeo.rotateZ(Math.PI / 2);
  const wheels = [];
  for (const [az, front] of [[FRONT_AXLE, true], [REAR_AXLE, false]]) for (const s of [1, -1]) {
    const steer = new THREE.Group(); steer.position.set(s * (W - 0.16), WHEEL_R, az); g.add(steer);
    const spin = new THREE.Group(); steer.add(spin);
    spin.add(new THREE.Mesh(tyreGeo, tyre));
    spin.add(new THREE.Mesh(rimGeo, steel));
    const hub = new THREE.Mesh(hubGeo, trim); spin.add(hub);
    // five lugs, so the spin shows
    for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; const l = box(0.272, 0.025, 0.025, steel, 0, Math.cos(a) * 0.12, Math.sin(a) * 0.12, spin); }
    wheels.push({ steer, spin, front });
  }
  g.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });

  /* -------------------------------------------------------------- motion -- */
  let pitch = 0, pitchV = 0, roll = 0, rollV = 0, lastSpeed = 0;
  function update(dt, speed = 0, steerAng = 0, lean = 0) {
    for (const w of wheels) { w.spin.rotation.x += speed * dt / WHEEL_R; if (w.front) w.steer.rotation.y = steerAng; }
    // a heavy body on soft springs: it squats as it pulls away, dives when it brakes, leans out of a turn
    const acc = dt > 0 ? (speed - lastSpeed) / dt : 0; lastSpeed = speed;
    const pitchGoal = Math.max(-0.05, Math.min(0.05, -acc * 0.006)), rollGoal = Math.max(-0.06, Math.min(0.06, lean));
    pitchV += ((pitchGoal - pitch) * 60 - pitchV * 9) * dt; pitch += pitchV * dt;
    rollV += ((rollGoal - roll) * 50 - rollV * 8) * dt; roll += rollV * dt;
    body.rotation.set(pitch, 0, roll);
  }
  return { group: g, body, door, setDoor, get doorK() { return doorK; }, update, wheels, size: [2.0, 2.4, 5.6] };
}
