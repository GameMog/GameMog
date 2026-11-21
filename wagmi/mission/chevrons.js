// Mog City (jh-drive round 2): the GPS on the road. At the next turn of the route (wagmi/mission/turns.js cue), a row
// of gold chevrons lying on the street where it turns, pointing the way out of the corner, a light running along them;
// only the next junction, only in the car, faded in as it comes within NEAR m and out once it is passed or the cue goes.
//   const ch = createChevrons(scene, groundAt);  ch.show(cue | null, carX, carZ, dt);  ch.state()
import * as THREE from 'three/webgpu';
import { uniform, float, sin, time } from 'three/tsl';

// (N chevrons GAP m apart from LEAD m along the way out of the corner's point: from inside the junction, where they show
// on the way up to it, not round the corner behind its building)
// SIZE: the 1.8 m chevron scaled up (a flat mark on the road is a sliver at 50 m); LEAN: each stood up off the road toward the
// way the car comes in (rad), so it faces the driver, not the sky
const N = 5, GAP = 3.4, LEAD = -4, NEAR = 240, FULL = 170, SIZE = 1.7, LEAN = 0.5;

export function createChevrons(scene, groundAt) {
  const g = new THREE.Group(); g.name = 'wagmi-gps-chevrons'; g.visible = false; scene.add(g);
  // a flat chevron, 1.8 m across, pointing +z
  const shape = new THREE.Shape();
  shape.moveTo(-0.9, -0.55); shape.lineTo(0, 0.35); shape.lineTo(0.9, -0.55); shape.lineTo(0.9, -0.05); shape.lineTo(0, 0.85); shape.lineTo(-0.9, -0.05); shape.closePath();
  const geo = new THREE.ShapeGeometry(shape); geo.rotateX(-Math.PI / 2);
  // (the shape's y is the way it points: after the turn flat, that is -z; turned round to +z)
  geo.rotateY(Math.PI);
  const fade = uniform(0);
  const items = [];
  for (let i = 0; i < N; i++) {
    // (solid gold, not added light: added onto a pale road it washed out to nothing at 50 m)
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, color: 0xffc93c });
    // (a light running along the row, toward the way out)
    const wave = sin(time.mul(5).sub(i * 1.1)).mul(0.15).add(0.85);
    m.opacityNode = wave.mul(fade).mul(float(0.95));
    m.polygonOffset = true; m.polygonOffsetFactor = -3; m.polygonOffsetUnits = -3;
    const mesh = new THREE.Mesh(geo, m); mesh.renderOrder = 6; mesh.frustumCulled = false; mesh.scale.setScalar(SIZE);
    g.add(mesh); items.push(mesh);
  }
  let k = 0, key = '';
  const S = { on: false, at: null, dist: 0, fade: 0 };
  function place(cue, px, pz) {
    const [x0, z0] = cue.at, ux = cue.ux, uz = cue.uz, yaw = Math.atan2(ux, uz);
    // (the side of the row the car comes from: its right (-uz, ux) or its left; leaned up toward it about the way it points)
    const side = Math.sign((px - x0) * -uz + (pz - z0) * ux) || 1;
    for (let i = 0; i < N; i++) {
      const x = x0 + ux * (LEAD + GAP * i), z = z0 + uz * (LEAD + GAP * i);
      items[i].position.set(x, (groundAt(x, z) || 0) + 0.06 + Math.sin(LEAN) * 0.9 * SIZE, z); items[i].rotation.set(0, yaw, side * LEAN);
    }
  }
  function show(cue, px, pz, dt) {
    const turn = cue && cue.kind === 'turn' && cue.dir !== 'U' && Array.isArray(cue.at) && Number.isFinite(cue.ux);
    let want = 0;
    if (turn) {
      const kk = `${cue.at[0].toFixed(0)},${cue.at[1].toFixed(0)}`;
      if (kk !== key) { key = kk; place(cue, px, pz); }
      const d = Math.hypot(cue.at[0] - px, cue.at[1] - pz);
      S.dist = d; S.at = cue.at;
      want = d > NEAR ? 0 : d < FULL ? 1 : (NEAR - d) / (NEAR - FULL);
    }
    k += Math.max(-1, Math.min(1, (want - k))) * Math.min(1, (dt || 0.016) * 4);
    fade.value = k; S.fade = k;
    g.visible = S.on = k > 0.01;
  }
  return { group: g, show, state: () => ({ on: S.on, dist: +S.dist.toFixed(1), fade: +S.fade.toFixed(2), at: S.at }) };
}
