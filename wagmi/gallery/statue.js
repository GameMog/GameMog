// Mog City: the gallery's statue, the Regent (wagmi/gallery/art.js) in gold, made here from lathes, spheres and cones,
// merged so the whole figure is three draws: the gold, the crown's gems, the enamel mark on the crown's back.
//   const R = buildRegent(THREE, { envMap })   R.group (faces +z, its feet at y 0, about 6.4 m tall); R.setMark(kind)
//   R.markAt        the mark's centre in the statue's own frame (on the back of the crown, facing -z)
//   R.mirror()      a copy sharing its geometry and materials, for the reflection behind the black glass (its parent
//                   group carries the mirror's negative scale)
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { markCanvas } from './art.js';

const PI = Math.PI;

export function buildRegent(THREE, { envMap = null } = {}) {
  const gold = new THREE.MeshStandardMaterial({ color: '#D6A443', metalness: 1, roughness: 0.3, envMap, envMapIntensity: 0.9 });
  const gemMat = new THREE.MeshStandardMaterial({ color: '#B0122C', metalness: 0.2, roughness: 0.08, emissive: new THREE.Color('#4A0410'), envMap, envMapIntensity: 1.4 });
  const G = [], gems = [];
  const put = (geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
    geo.applyMatrix4(m); return geo;
  };
  const clean = (g) => { const n = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') n.deleteAttribute(k); return n; };

  /* the robe: a lathe, oval in plan, its hem flared, deep folds down it that soften toward the chest */
  {
    const prof = [[1.32, 0], [1.38, 0.08], [1.3, 0.35], [1.16, 1.0], [1.0, 1.8], [0.88, 2.5], [0.84, 2.9], [0.9, 3.4], [0.96, 3.8], [0.92, 4.2], [0.7, 4.5], [0.36, 4.72], [0.3, 4.9]];
    const robe = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 72);
    const p = robe.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const a = Math.atan2(v.z, v.x), rr = Math.hypot(v.x, v.z), y = v.y;
      const fold = (Math.sin(a * 11 + Math.sin(y * 1.3) * 0.6) * 0.07 + Math.sin(a * 5 + 1.3) * 0.04) * Math.max(0, 1 - y / 3.2);
      const k = (rr + fold) / (rr || 1);
      p.setXYZ(i, v.x * k, y, v.z * k * 0.74);
    }
    robe.computeVertexNormals(); G.push(robe);
    // the mantle over the shoulders, its edge a rolled hem; the collar
    G.push(put(new THREE.SphereGeometry(1, 40, 20, 0, 2 * PI, 0, PI * 0.6), 0, 4.2, 0, 0, 0, 0, 1.5, 0.66, 0.9));
    G.push(put(new THREE.TorusGeometry(1.0, 0.07, 10, 48), 0, 3.96, 0, PI / 2, 0, 0, 1.47, 0.86, 1));
    // the cape: from the shoulders down the back to the hem, in folds (a half lathe, its open side to the front)
    {
      const cp = [[1.42, 0.05], [1.36, 0.6], [1.22, 1.6], [1.12, 2.6], [1.16, 3.4], [1.3, 3.95]];
      const cape = new THREE.LatheGeometry(cp.map(([r, y]) => new THREE.Vector2(r, y)), 40, PI * 0.62, PI * 0.76);
      const q = cape.attributes.position, w = new THREE.Vector3();
      for (let i = 0; i < q.count; i++) { w.fromBufferAttribute(q, i); const a = Math.atan2(w.z, w.x), rr = Math.hypot(w.x, w.z), k = (rr + Math.sin(a * 9) * 0.05 * (1 - w.y / 4)) / rr; q.setXYZ(i, w.x * k, w.y, w.z * k * 0.8); }
      cape.computeVertexNormals(); G.push(cape);
    }
    // a high standing collar behind the head
    G.push(put(new THREE.CylinderGeometry(0.62, 0.42, 0.7, 28, 1, true, PI * 0.6, PI * 0.8), 0, 4.85, -0.05));
    G.push(put(new THREE.TorusGeometry(0.34, 0.07, 10, 28), 0, 4.72, 0, PI / 2, 0, 0, 1, 0.85, 1));
    // a long sash of gold down the front, two embroidered hems
    G.push(put(new THREE.BoxGeometry(0.34, 3.2, 0.06), 0, 1.75, 0.83, -0.1, 0, 0));
  }
  /* the arms, folded at the chest, the hands round a sceptre */
  {
    for (const s of [-1, 1]) {
      // (the upper arm mostly under the mantle: a sleeve flaring to the elbow)
      const up = new THREE.CylinderGeometry(0.26, 0.36, 1.0, 16);
      G.push(put(up, s * 1.08, 3.35, 0.12, 0.25, 0, s * 0.12));
      const fore = new THREE.CapsuleGeometry(0.2, 0.95, 6, 14);
      // (from the elbow, low at the side, up and in to the hands in front of the chest)
      const e = new THREE.Vector3(s * 1.0, 3.0, 0.25), h = new THREE.Vector3(s * 0.16, 3.55, 0.78), mid = e.clone().add(h).multiplyScalar(0.5), d = h.clone().sub(e).normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
      fore.applyMatrix4(new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1))); G.push(fore);
      G.push(put(new THREE.SphereGeometry(0.2, 16, 12), s * 0.13, 3.6, 0.86, 0, 0, 0, 1, 1.15, 0.9));
    }
    // the sceptre: a shaft through the hands, an orb and a small finial
    // (its head low, at the collarbone: higher, its orb sat in front of the face like a nose)
    G.push(put(new THREE.CylinderGeometry(0.05, 0.06, 2.5, 12), 0, 3.0, 0.98));
    G.push(put(new THREE.SphereGeometry(0.16, 20, 14), 0, 4.36, 0.98));
    G.push(put(new THREE.ConeGeometry(0.06, 0.22, 10), 0, 4.6, 0.98));
    for (const y of [1.9, 4.18]) G.push(put(new THREE.TorusGeometry(0.08, 0.025, 6, 16), 0, y, 0.98, PI / 2));
    gems.push(put(new THREE.SphereGeometry(0.06, 12, 8), 0, 4.36, 1.12));
  }
  /* the head: an egg, the face smooth with its eyes closed (lid ridges), a straight nose, a still mouth */
  const HY = 5.3;
  {
    G.push(put(new THREE.CylinderGeometry(0.26, 0.32, 0.6, 20), 0, 4.92, 0.02));
    G.push(put(new THREE.SphereGeometry(0.5, 40, 28), 0, HY, 0, 0, 0, 0, 0.86, 1.08, 0.92));
    G.push(put(new THREE.SphereGeometry(0.36, 28, 18), 0, HY - 0.26, 0.1, 0, 0, 0, 0.98, 0.9, 0.9));
    // the nose: a slim wedge down the face's middle
    G.push(put(new THREE.ConeGeometry(0.06, 0.26, 4), 0, HY - 0.02, 0.45, -0.25, PI / 4, 0, 1, 1, 0.8));
    for (const s of [-1, 1]) {
      G.push(put(new THREE.TorusGeometry(0.1, 0.018, 6, 14, PI), s * 0.17, HY + 0.08, 0.38, 0, 0, PI, 1, 0.55, 1));
      G.push(put(new THREE.TorusGeometry(0.13, 0.016, 6, 14, PI * 0.8), s * 0.17, HY + 0.2, 0.38, 0, 0, PI * 0.1, 1, 0.5, 1));
    }
    G.push(put(new THREE.TorusGeometry(0.09, 0.016, 6, 12, PI), 0, HY - 0.3, 0.38, 0, 0, PI, 1, 0.35, 1));
  }
  /* the crown of seven spires: a band, rims, seven tall spires (the front one tallest), each tipped with a ball, gems
     round the band; on its back, the enamel mark */
  const CY = HY + 0.42, CR = 0.48;
  {
    G.push(put(new THREE.CylinderGeometry(CR, CR * 0.94, 0.36, 40, 1, true), 0, CY, 0));
    G.push(put(new THREE.CylinderGeometry(CR - 0.02, CR - 0.02, 0.04, 40), 0, CY - 0.17, 0));
    for (const y of [CY - 0.18, CY + 0.18]) G.push(put(new THREE.TorusGeometry(CR, 0.035, 8, 48), 0, y, 0, PI / 2));
    for (let i = 0; i < 7; i++) {
      const a = PI / 2 + (i - 3) * (PI / 4.2), L = 0.95 - Math.abs(i - 3) * 0.12, x = Math.cos(a) * CR, z = Math.sin(a) * CR;
      // (the spires lean out a little, fanned round the front half; the back half low, so the mark shows)
      const lean = 0.16;
      G.push(put(new THREE.ConeGeometry(0.09, L, 10), x * (1 + lean * 0.6), CY + 0.18 + L / 2, z * (1 + lean * 0.6), Math.sin(a) * lean, 0, -Math.cos(a) * lean));
      G.push(put(new THREE.SphereGeometry(0.07, 12, 8), x * (1 + lean * 1.3), CY + 0.2 + L, z * (1 + lean * 1.3)));
      gems.push(put(new THREE.SphereGeometry(0.05, 10, 8), Math.cos(a) * (CR + 0.03), CY, Math.sin(a) * (CR + 0.03)));
    }
    // the back: three low points either side of the mark
    for (const da of [-0.55, 0.55]) { const a = -PI / 2 + da; G.push(put(new THREE.ConeGeometry(0.07, 0.36, 8), Math.cos(a) * CR, CY + 0.36, Math.sin(a) * CR)); }
    // (a velvet cap inside the band)
    G.push(put(new THREE.SphereGeometry(CR * 0.94, 24, 12, 0, 2 * PI, 0, PI / 2), 0, CY + 0.05, 0, 0, 0, 0, 1, 0.55, 1));
  }
  const goldGeo = mergeGeometries(G.map(clean)), gemGeo = mergeGeometries(gems.map(clean));
  for (const g of [...G, ...gems]) g.dispose();
  const group = new THREE.Group(); group.name = 'gallery-regent';
  const body = new THREE.Mesh(goldGeo, gold), gemM = new THREE.Mesh(gemGeo, gemMat);
  body.castShadow = false; body.receiveShadow = false;
  group.add(body, gemM);
  // the mark: an enamel plaque curved to the band's back (a strip of cylinder), its sigil drawn per deal
  const mc = markCanvas('star'); const markTex = new THREE.CanvasTexture(mc); markTex.colorSpace = THREE.SRGBColorSpace;
  const markMat = new THREE.MeshStandardMaterial({ map: markTex, metalness: 0.55, roughness: 0.28, envMap, envMapIntensity: 1.0, emissive: new THREE.Color('#FFFFFF'), emissiveMap: markTex, emissiveIntensity: 0.35 });
  const markGeo = new THREE.CylinderGeometry(CR + 0.012, CR * 0.94 + 0.012, 0.34, 16, 1, true, PI - 0.42, 0.84);
  // (the strip's uvs across the full texture)
  { const uv = markGeo.attributes.uv; let u0 = Infinity, u1 = -Infinity; for (let i = 0; i < uv.count; i++) { u0 = Math.min(u0, uv.getX(i)); u1 = Math.max(u1, uv.getX(i)); } for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - (uv.getX(i) - u0) / (u1 - u0)); }
  const mark = new THREE.Mesh(markGeo, markMat); mark.position.y = CY; group.add(mark);
  const R = {
    group, gold, height: CY + 1.2, markAt: new THREE.Vector3(0, CY, -CR),
    setMark(kind) { const c2 = markCanvas(kind); mc.getContext('2d').drawImage(c2, 0, 0); markTex.needsUpdate = true; },
    mirror() {
      const m = new THREE.Group(); m.name = 'gallery-regent-mirror';
      m.add(new THREE.Mesh(goldGeo, gold), new THREE.Mesh(gemGeo, gemMat));
      const mk = new THREE.Mesh(markGeo, markMat); mk.position.y = CY; m.add(mk);
      // (the caller puts it inside a negatively scaled group, the mirror's: the renderer flips the winding itself)
      return m;
    },
    dispose() { goldGeo.dispose(); gemGeo.dispose(); markGeo.dispose(); gold.dispose(); gemMat.dispose(); markMat.dispose(); markTex.dispose(); },
  };
  return R;
}
