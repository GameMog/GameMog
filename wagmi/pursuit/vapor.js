// Mog City: cold-gas vapour and a wreck's smoke. Soft puffs, one instanced mesh (always drawn: one tiny instance under
// the street when idle, so its pipeline is built at the start and the first puff doesn't stall). Each puff is shot out at
// a speed, slowed hard by the air, grows and fades; white nitrogen vapour or dark engine smoke (k 0..1).
//   const v = createVapor(scene);  v.puff(x, y, z, vx, vy, vz, { r, grow, life, k, a });  v.update(dt)
import * as THREE from 'three/webgpu';
import { instancedDynamicBufferAttribute, normalView, positionViewDirection, abs, pow, float, vec3, mix } from 'three/tsl';

const N = 160;
export function createVapor(scene) {
  const alpha = new THREE.InstancedInterleavedBuffer(new Float32Array(N * 2), 2); alpha.setUsage(THREE.DynamicDrawUsage);
  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
  const a = instancedDynamicBufferAttribute(alpha, 'float', 2, 0), k = instancedDynamicBufferAttribute(alpha, 'float', 2, 1);
  // (edge on, a sphere thins out: no hard rim)
  const facing = pow(abs(normalView.dot(positionViewDirection)), float(1.8));
  mat.colorNode = mix(vec3(0.9, 0.93, 0.98), vec3(0.11, 0.11, 0.12), k);
  mat.opacityNode = a.mul(facing);
  const mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 2), mat, N);
  mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = false; mesh.renderOrder = 5; mesh.name = 'wagmi-vapor';
  const dummy = new THREE.Object3D();
  const idle = () => { mesh.count = 1; dummy.position.set(0, -200, 0); dummy.scale.setScalar(0.001); dummy.updateMatrix(); mesh.setMatrixAt(0, dummy.matrix); mesh.instanceMatrix.needsUpdate = true; };
  idle(); scene.add(mesh);
  const list = [];
  function puff(x, y, z, vx = 0, vy = 0, vz = 0, { r = 0.25, grow = 1.6, life = 0.9, k = 0, a = 0.55, drag = 4.5, lift = 0 } = {}) {
    if (list.length >= N) list.shift();
    list.push({ x, y, z, vx, vy, vz, r, grow, life, t: 0, k, a, drag, lift, spin: Math.random() * 6 });
  }
  function update(dt) {
    if (!list.length) { if (mesh.count !== 1) idle(); return; }
    let n = 0;
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i]; p.t += dt;
      if (p.t >= p.life) { list.splice(i, 1); continue; }
      const d = Math.exp(-p.drag * dt);
      p.vx *= d; p.vz *= d; p.vy = p.vy * d + p.lift * dt;
      p.x += p.vx * dt; p.y = Math.max(0.05, p.y + p.vy * dt); p.z += p.vz * dt;
    }
    for (const p of list) {
      const u = p.t / p.life, s = p.r * (1 + p.grow * Math.sqrt(u));
      dummy.position.set(p.x, p.y, p.z); dummy.rotation.set(p.spin, p.spin * 0.7, 0); dummy.scale.set(s, s * 0.82, s); dummy.updateMatrix();
      mesh.setMatrixAt(n, dummy.matrix);
      // (in fast, out slowly)
      alpha.array[n * 2] = p.a * Math.min(1, u * 8) * (1 - u) * (1 - u); alpha.array[n * 2 + 1] = p.k;
      n++;
    }
    if (!n) return idle();
    mesh.count = n; mesh.instanceMatrix.needsUpdate = true; alpha.needsUpdate = true;
  }
  return { puff, update, mesh, get live() { return list.length; } };
}
