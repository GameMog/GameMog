// Mog City: the chase cars. The city's own lofted bodies (js/actor-models.js: BODY_SPECS, buildCarGeometry,
// createLoftedCarMaterial), as Mission 1's black SUV is built (wagmi/mission/m1.js buildSUV):
//   suits   gloss black SUVs and sedans on acid-green rims (#B6FF3B), an acid-green glow on the road under them
//   police   the city's NYPD cruiser (the sedan in the white and blue livery) with its flashing roof bar
// Each is a few draw calls (one body, a rim per wheel, the glow or the bar), shared geometry and materials. The rims
// carry two spokes, so a wheel is seen turning.
//   const c = buildChaseCar(kind, i)  ->  { group, tilt (the body, pitched and rolled), rims, hw, hl, roof, mass, kind }
import * as THREE from 'three/webgpu';

const ACID = '#B6FF3B';
const cache = {};
function shared() {
  if (cache.ok) return cache;
  const N = window.NYC || {};
  cache.N = N;
  cache.geo = {}; cache.ok = true;
  cache.acid = new THREE.MeshStandardNodeMaterial({ color: ACID, emissive: '#6FA81A', emissiveIntensity: 0.9, roughness: 0.35, metalness: 0.4 });
  cache.chrome = new THREE.MeshStandardNodeMaterial({ color: '#C9CED6', roughness: 0.25, metalness: 0.9 });
  cache.glow = new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(ACID).multiplyScalar(0.55), transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending });
  // (a soft-edged pool: a disc squashed to the car's length, fading out to its rim)
  const g = new THREE.CircleGeometry(1, 28); g.rotateX(-Math.PI / 2);
  const col = []; const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const r = Math.hypot(p.getX(i), p.getZ(i)); col.push(1 - r, 1 - r, 1 - r); }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  cache.glowGeo = g; cache.glow.vertexColors = true;
  return cache;
}
// a wheel's rim (a torus, the tyre's face) and two spokes across it, turned by the wheel
function rimGeo(r) {
  const key = 'rim' + r.toFixed(3);
  if (cache.geo[key]) return cache.geo[key];
  const merge = window.NYC?.Addons?.mergeGeometries;
  const t = new THREE.TorusGeometry(r, r * 0.17, 8, 26);
  const a = new THREE.BoxGeometry(r * 1.9, r * 0.2, r * 0.12), b = a.clone().rotateZ(Math.PI / 2);
  for (const x of [t, a, b]) { x.deleteAttribute('uv'); }
  const geo = merge ? merge([t.toNonIndexed(), a.toNonIndexed(), b.toNonIndexed()]) : t;
  geo.rotateY(Math.PI / 2);
  return (cache.geo[key] = geo);
}
function bodyGeo(spec) {
  const key = 'body' + spec.name;
  return cache.geo[key] || (cache.geo[key] = cache.N.buildCarGeometry(spec, true));
}

export function buildChaseCar(kind = 'suits', i = 0) {
  const C = shared(), N = C.N, police = kind === 'police';
  const group = new THREE.Group(); group.name = `wagmi-chase-${kind}-${i}`;
  const tilt = new THREE.Group(); group.add(tilt);
  const specName = police ? 'sedan' : i % 2 ? 'sedan' : 'suv';
  const spec = N.BODY_SPECS && N.BODY_SPECS[specName];
  let hw = 0.95, hl = 2.3, roof = 1.5;
  if (spec && N.buildCarGeometry && N.createLoftedCarMaterial) {
    const mat = N.createLoftedCarMaterial(spec, police ? 0xf6f9fc : 0x0c0d0f);
    // (the NYPD livery: the fixed-colour material's state uniform, w = 1)
    if (police && mat.userData.carState) mat.userData.carState.value.w = 1;
    const m = new THREE.Mesh(bodyGeo(spec), mat); m.castShadow = true; m.receiveShadow = true; tilt.add(m);
    hw = spec.halfWidth[2][1] + 0.02; hl = spec.zFront; roof = spec.cabin.roofY[1][1];
    if (police && N.buildLightbarGeometry && N.createLightbarMaterial) {
      const bar = new THREE.Mesh(cache.geo.bar || (cache.geo.bar = N.buildLightbarGeometry(spec)), N.createLightbarMaterial());
      tilt.add(bar);
    }
  } else {
    const m = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.5, 4.6), new THREE.MeshStandardNodeMaterial({ color: police ? '#f6f9fc' : '#0c0d0f', roughness: 0.4 }));
    m.position.y = 0.95; tilt.add(m);
  }
  // the rims: acid green on the Suits' cars, plain alloy on the police's
  const rims = [];
  const wr = spec ? spec.wheelRadius : 0.38, wx = spec ? spec.wheelX : 0.86, wz = spec ? spec.wheelZ : 1.4;
  for (const sx of [-1, 1]) for (const z of [-wz, wz]) {
    const r = new THREE.Mesh(rimGeo(wr * 0.52), police ? C.chrome : C.acid);
    r.position.set(sx * (wx + 0.13), wr, z); tilt.add(r); rims.push(r);
  }
  if (!police) {
    const glow = new THREE.Mesh(C.glowGeo, C.glow); glow.scale.set(hw * 1.5, 1, hl * 1.15); glow.position.y = 0.04; glow.renderOrder = 3; group.add(glow);
  }
  return { group, tilt, rims, hw, hl, roof, kind, mass: police ? 1.6 : specName === 'suv' ? 2.1 : 1.6, wheelR: wr };
}
