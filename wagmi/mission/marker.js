// Mog City: a mission marker on the ground, the GTA corona: a 3 m translucent cylinder of light rising off a ring,
// its colour fading out upward, breathing slowly.
//   const m = createMarker(THREE, scene, { color: '#FFC93C', radius: 3 }); m.at(x, y, z); m.hide();
import { uv, uniform, float, vec3, sin, time, pow, mix, smoothstep, abs } from 'three/tsl';

export function createMarker(THREE, scene, { color = '#FFC93C', radius = 3, height = 1.4, alpha = 0.22 } = {}) {
  const g = new THREE.Group(); g.name = 'wagmi-marker'; g.visible = false; scene.add(g);
  const col = uniform(new THREE.Color(color));
  // the wall: open cylinder, brightest at the ground, gone at the top, a slow pulse
  const wall = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const breathe = sin(time.mul(2.2)).mul(0.12).add(0.88);
  wall.colorNode = col;
  wall.opacityNode = pow(float(1).sub(uv().y), float(1.6)).mul(alpha * 1.4).mul(breathe);
  const cyl = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 64, 1, true), wall);
  cyl.position.y = height / 2; cyl.renderOrder = 5; g.add(cyl);
  // the ring on the ground
  const ringMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
  ringMat.colorNode = col;
  const r = uv().sub(0.5).length().mul(2);
  ringMat.opacityNode = smoothstep(0.82, 0.9, r).mul(smoothstep(1.0, 0.94, r)).mul(0.9).add(float(alpha * 0.35).mul(smoothstep(1.0, 0.0, r))).mul(breathe);
  const disc = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), ringMat);
  disc.rotation.x = -Math.PI / 2; disc.position.y = 0.03; disc.renderOrder = 5; g.add(disc);
  return {
    group: g,
    at(x, y, z) { g.position.set(x, y, z); g.visible = true; },
    hide() { g.visible = false; },
    color(c) { col.value.set(c); },
    get visible() { return g.visible; },
  };
}
