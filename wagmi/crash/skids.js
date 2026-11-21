// Mog City: the tyres on the road. Black marks laid down by the rear wheels while the car slides (its slip angle past
// MARK.slip, js/drive-model.js c.slip), on the handbrake, braking hard at speed or spinning them up off the line; grey
// smoke from the same wheels as it slides. Installed by wagmi/crash/index.js, run every frame with the crash's frame.
//   marks   one instanced mesh of N flat strips (one draw call), a ring: the oldest strip reused when it runs out; each
//           fades out over MARK.life s (re-faded every FADE s, not every frame)
//   smoke   the cold-gas vapour's puffs (wagmi/pursuit/vapor.js), grey, at the rear wheels
// API: { update(dt), clear(), marks: count } (WAGMI.crash.skids)
import * as THREE from 'three/webgpu';
import { instancedDynamicBufferAttribute, float } from 'three/tsl';
import { createVapor } from '../pursuit/vapor.js';

const N = 1536;
// a mark: the slip it starts at (rad), how hard the brakes or the launch must be (m/s²) over what speed, its width,
// how dark, how long it stays (s); a smoke puff's slip and its rate (puffs a second per wheel, full slide)
const MARK = { slip: 0.14, brake: 12, brakeV: 10, launch: 11, launchV: 12, w: 0.24, a: 0.55, life: 40 };
const SMOKE = { slip: 0.3, rate: 26 };
const FADE = 0.25;

export function createSkids(W) {
  const app = W.app, cm = app.controllerManager, car = W.car, scene = app.scene;
  const alpha = new THREE.InstancedInterleavedBuffer(new Float32Array(N), 1); alpha.setUsage(THREE.DynamicDrawUsage);
  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, color: 0x0b0b0c });
  mat.opacityNode = instancedDynamicBufferAttribute(alpha, 'float', 1, 0).mul(float(1));
  mat.polygonOffset = true; mat.polygonOffsetFactor = -2; mat.polygonOffsetUnits = -2;
  const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.InstancedMesh(geo, mat, N);
  mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = false; mesh.renderOrder = 1; mesh.name = 'wagmi-skids';
  const born = new Float32Array(N), strength = new Float32Array(N);
  const dummy = new THREE.Object3D();
  // (always one drawn, out of sight under the street until the first mark, so its pipeline is built at the start, as
  // the vapour's is)
  const idle = () => { dummy.position.set(0, -200, 0); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(0.001); dummy.updateMatrix(); mesh.setMatrixAt(0, dummy.matrix); alpha.array[0] = 0; mesh.count = 1; mesh.instanceMatrix.needsUpdate = true; alpha.needsUpdate = true; };
  idle(); scene.add(mesh);
  let head = 0, used = 0, clock = 0, fadeT = 0;
  const last = [null, null];
  const smoke = createVapor(scene);
  let smokeAcc = 0, v0 = null;

  function strip(x0, y0, z0, x1, y1, z1, k) {
    const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz);
    if (L < 0.05 || L > 4) return;
    dummy.position.set((x0 + x1) / 2, (y0 + y1) / 2 + 0.025, (z0 + z1) / 2);
    dummy.rotation.set(0, Math.atan2(dx, dz), 0);
    dummy.scale.set(MARK.w, 1, L + 0.04);
    dummy.updateMatrix();
    mesh.setMatrixAt(head, dummy.matrix);
    born[head] = clock; strength[head] = k; alpha.array[head] = MARK.a * k;
    head = (head + 1) % N; used = Math.min(N, used + 1);
    mesh.count = used;
    mesh.instanceMatrix.needsUpdate = true; alpha.needsUpdate = true;
  }

  // the rear wheels' contact points now: [x, y, z] each
  const wheels = () => {
    const h = car.heading, fx = Math.sin(h), fz = Math.cos(h), lx = Math.cos(h), lz = -Math.sin(h);
    const back = car.axle || 1.45, half = (car.body ? car.body.hx : 0.95) * 0.8;
    const out = [];
    for (const sd of [1, -1]) {
      const x = car.position.x - fx * back + lx * half * sd, z = car.position.z - fz * back + lz * half * sd;
      out.push([x, cm.getGroundHeight(x, z, 'car'), z]);
    }
    return out;
  };

  function update(dt) {
    if (!(dt > 0)) return;
    clock += dt;
    smoke.update(dt);
    // (the marks fading)
    if ((fadeT -= dt) <= 0 && used) {
      fadeT = FADE;
      for (let i = 0; i < used; i++) alpha.array[i] = MARK.a * strength[i] * Math.max(0, 1 - (clock - born[i]) / MARK.life);
      alpha.needsUpdate = true;
    }
    const driving = cm.activeMode === 'car' && car.kind !== 'horse' && !(W.thrusters?.air > 0.3);
    const v = Math.abs(car.speed), acc = v0 === null ? 0 : (v - v0) / dt; v0 = v;
    if (!driving) { last[0] = last[1] = null; return; }
    const slip = Math.abs(car.slip || 0), keys = cm.keys;
    const braking = (keys.backward && car.speed > 0) || (keys.forward && car.speed < 0);
    let k = 0;
    if (v > 3 && slip > MARK.slip) k = Math.min(1, 0.4 + (slip - MARK.slip) / 0.3);
    if (car.hb && v > 3) k = Math.max(k, 0.8);
    if (braking && v > MARK.brakeV && -acc > MARK.brake) k = Math.max(k, 0.6);
    if (keys.forward && v < MARK.launchV && acc > MARK.launch) k = Math.max(k, 0.5);
    const at = wheels();
    for (let i = 0; i < 2; i++) {
      const p = at[i], q = last[i];
      if (k > 0 && q) strip(q[0], q[1], q[2], p[0], p[1], p[2], k);
      last[i] = k > 0 ? p : null;
    }
    // the smoke: past SMOKE.slip, or the handbrake at speed
    const s = Math.max(slip > SMOKE.slip ? Math.min(1, (slip - SMOKE.slip) / 0.4 + 0.3) : 0, car.hb && v > 6 ? 0.6 : 0) * Math.min(1, v / 10);
    if (s > 0) {
      smokeAcc += Math.min(dt, 0.1) * SMOKE.rate * s;
      const n = Math.floor(smokeAcc); smokeAcc -= n;
      const h = car.heading, vx = Math.sin(h) * car.speed + Math.cos(h) * (car.slipV || 0), vz = Math.cos(h) * car.speed - Math.sin(h) * (car.slipV || 0);
      for (const p of at) for (let j = 0; j < n; j++) {
        const a = Math.random() * Math.PI * 2, sp = 0.5 + Math.random() * 1.6;
        smoke.puff(p[0] + (Math.random() - 0.5) * 0.35, p[1] + 0.2 + Math.random() * 0.15, p[2] + (Math.random() - 0.5) * 0.35,
          vx * 0.15 + Math.sin(a) * sp, 0.4 + Math.random() * 0.9, vz * 0.15 + Math.cos(a) * sp,
          { r: 0.32, grow: 3.2, life: 0.8 + Math.random() * 0.6, a: 0.3, k: 0.42, drag: 1.8, lift: 0.8 });
      }
    }
  }
  function clear() { used = 0; head = 0; idle(); last[0] = last[1] = null; }
  return { update, clear, get marks() { return used; } };
}
