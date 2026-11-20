// Marge's stage-manager headset as geometry, rigid on the head bone (the forge's 'earpiece' prop is never drawn in game):
// a thin black band over the crown from ear to ear (5 mm off the hair's outer surface), a padded ear cup on her left ear,
// a small pad on the right, and a boom mic from the left cup forward along the cheek to the corner of her mouth, a foam
// ball at its tip. Matte black plastic and foam; no brand, no lettering.
import { prim, THREE } from '../young-hero/glb.mjs';
import { eyeFit } from '../frames.mjs';
export function headsetPass(doc, K = {}) {
  K = { band: 0.0035, cup: 0.028, ...K };
  const R = doc.getRoot(), skinP = prim(doc, 'skin').sort((a, b) => b.getIndices().getCount() - a.getIndices().getCount())[0], HEADI = R.listSkins()[0].listJoints().findIndex((j) => j.getName() === 'head');
  const E = eyeFit(doc), ey = (E.L.c[1] + E.R.c[1]) / 2, ez = (E.L.c[2] + E.R.c[2]) / 2;
  // the head's outline (skin and hair) in the ear's plane (z = eye centre - 85 mm): its top and its half width at the ears
  // (rules round 1, the critic: "the band floating above her skull": the outline from the skin and the hair's under-layer
  // (the scalp's own lifted shell), not the cards' tips, and the band K.lay over it: it sits down in the hair)
  const pts = []; for (const p of [...prim(doc, 'skin'), ...prim(doc, K.over || 'hairUnder')]) { const a = p.getAttribute('POSITION').getArray(); for (const v of new Set(p.getIndices().getArray())) pts.push([a[v * 3], a[v * 3 + 1], a[v * 3 + 2]]); }
  const zE = ez - 0.085; let top = 0, half = 0; for (const [x, y, z] of pts) { if (Math.abs(z - zE) < 0.012 && Math.abs(x) < 0.01) top = Math.max(top, y); if (Math.abs(z - zE) < 0.015 && Math.abs(y - (ey - 0.015)) < 0.01) half = Math.max(half, Math.abs(x)); }
  if (!top) top = ey + 0.11; if (!half) half = 0.075;
  const geos = [], put = (g, m) => { g = g.index ? g.toNonIndexed() : g; g.applyMatrix4(m); geos.push(g); };
  // the band: a half-ellipse from ear to ear over the crown
  const curve = new THREE.CatmullRomCurve3(Array.from({ length: 13 }, (_, i) => { const t = Math.PI * (i / 12); return new THREE.Vector3(Math.cos(t) * (half + 0.006), ey - 0.01 + Math.sin(t) * (top + (K.lay ?? 0.006) - (ey - 0.01)), zE); }));
  put(new THREE.TubeGeometry(curve, 40, K.band, 8, false), new THREE.Matrix4());
  // the cups: left (her left, +x) the speaker cup, right a small pad
  for (const [s, r, d] of [[1, K.cup / 2, 0.016], [-1, 0.012, 0.008]]) { const g = new THREE.CylinderGeometry(r, r, d, 24); g.rotateZ(Math.PI / 2); put(g, new THREE.Matrix4().makeTranslation(s * (half + 0.004 + d / 2), ey - 0.016, zE)); }
  // the boom: from the left cup forward and down to 15 mm off the mouth's corner, the foam ball at its tip
  const tip = new THREE.Vector3(0.036, ey - 0.078, ez + 0.028), boom = new THREE.CatmullRomCurve3([new THREE.Vector3(half + 0.016, ey - 0.02, zE + 0.004), new THREE.Vector3(half + 0.006, ey - 0.05, zE + 0.07), new THREE.Vector3(0.055, ey - 0.075, ez + 0.01), tip]);
  put(new THREE.TubeGeometry(boom, 30, 0.0016, 6, false), new THREE.Matrix4());
  put(new THREE.SphereGeometry(0.0055, 14, 10), new THREE.Matrix4().makeTranslation(tip.x, tip.y, tip.z));
  const P = [], N = []; for (const g of geos) { const p = g.attributes.position, n = g.attributes.normal; for (let i = 0; i < p.count; i++) { P.push(p.getX(i), p.getY(i), p.getZ(i)); N.push(n.getX(i), n.getY(i), n.getZ(i)); } }
  const n = P.length / 3, JJ = new Uint16Array(n * 4), WW = new Float32Array(n * 4); for (let v = 0; v < n; v++) { JJ[v * 4] = HEADI; WW[v * 4] = 1; }
  const buf = R.listBuffers()[0], acc = (t, arr) => doc.createAccessor().setType(t).setArray(arr).setBuffer(buf), mesh = R.listMeshes().find((m) => m.listPrimitives().includes(skinP));
  const mat = doc.createMaterial('headset').setBaseColorFactor([0.03, 0.03, 0.032, 1]).setRoughnessFactor(0.55).setMetallicFactor(0).setDoubleSided(true);
  mesh.addPrimitive(doc.createPrimitive().setMaterial(mat).setAttribute('POSITION', acc('VEC3', Float32Array.from(P))).setAttribute('NORMAL', acc('VEC3', Float32Array.from(N))).setAttribute('JOINTS_0', acc('VEC4', JJ)).setAttribute('WEIGHTS_0', acc('VEC4', WW)));
  const ex = R.getAsset().extras, fx = ex?.forge || ex; if (fx?.props) fx.props = []; if (fx?.landmarks?.props) fx.landmarks.props = [];
  console.log('headset: top', top.toFixed(3), 'half', half.toFixed(3), 'points', n);
}
