// Hand-built young hero, pass 2: targeted edits after the review of pass 1.
//  fingers   a radial slim (K.slim, 7%) of each finger toward its own bone line (Mr. Big's got 10%): the long, thick,
//            waxy fingers read thinner and more jointed; the palm and the hand's back untouched
//  stubble   the forged stubble primitive's colour from a neutral grey-blue (36/38/39) to a warm near-black brown, and
//            ~30% of its hairs dropped (it read as a grey film, "grime", on a young face)
//  faceShape the eye sockets 1.2 mm deeper under the brow, the brow ridge 0.8 mm forward, the nose bridge 0.7 mm up and
//            narrower: a less flat midface (all clear of the lips, so the mouth landmarks do not move)
//  cords     the hood's drawcords from stark white to a light warm grey (they glowed as rigid white rods)
//  sneakers  off-white (a warm 0.82) and a touch rougher: the shoes glowed in every turntable shot
import { body, prim, matOf, rgba, setWebp, sm, h3, THREE } from './glb.mjs';
const jpOf = (B) => { const ibm = B.skin.getInverseBindMatrices().getArray(); return (nm) => new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray(ibm, B.names.indexOf(nm) * 16).invert()); };
export function fingerPass(doc, K = {}) {
  K = { slim: 0.07, ...K };
  const B = body(doc), P = B.P, a = P.getArray().slice(), n = a.length / 3, jp = jpOf(B);
  const wF = B.wOn(/^finger[2-5]-/), wT = B.wOn(/^finger1-/), segs = [];
  for (const s of ['L', 'R']) for (let f = 1; f <= 5; f++) { const j = [1, 2, 3].map((k) => jp(`finger${f}-${k}_${s}`)), d = j[2].clone().sub(j[1]).normalize(); const tip = j[2].clone().addScaledVector(d, f === 1 ? 0.03 : 0.024);
    const pts = [...j, tip]; for (let k = 0; k < 3; k++) segs.push({ a: pts[k], b: pts[k + 1], f, k, s }); }
  let moved = 0, mean = 0; const v3 = new THREE.Vector3();
  for (let v = 0; v < n; v++) { const w = wF[v] + wT[v]; if (w < 0.2) continue; v3.set(a[v * 3], a[v * 3 + 1], a[v * 3 + 2]);
    let best = 1e9, q = null; for (const sg of segs) { if ((sg.s === 'L') !== (v3.x > 0)) continue; const ab = sg.b.clone().sub(sg.a), L = ab.length(); ab.normalize(); const t = Math.max(0, Math.min(L, v3.clone().sub(sg.a).dot(ab))), c = sg.a.clone().addScaledVector(ab, t), d = c.distanceTo(v3); if (d < best) { best = d; q = { c, t, L, sg }; } }
    if (!q || best > 0.016) continue;
    // (the first segment's root half eased in: the knuckles stay as broad as the palm)
    const ease = q.sg.k === 0 ? sm(0.0, 0.5, q.t / q.L) : 1, k = K.slim * sm(0.2, 0.7, w) * ease;
    for (let c = 0; c < 3; c++) a[v * 3 + c] += (q.c.getComponent(c) - a[v * 3 + c]) * k; moved++; mean += best * k; }
  P.setArray(a); console.log('fingers slimmed', moved, 'mean mm', ((mean / Math.max(1, moved)) * 1000).toFixed(2));
}
export async function stubblePass(doc, K = {}) {
  K = { keep: 0.7, ...K };
  const tex = matOf(doc, 'beard').getBaseColorTexture(), { data, w, h } = await rgba(tex); let n = 0, cut = 0;
  for (let i = 0; i < w * h; i++) { if (data[i * 4 + 3] < 8) continue; n++; const L = (data[i * 4] + data[i * 4 + 1] + data[i * 4 + 2]) / 3, k = 0.7 + 0.6 * (L / 40);
    data[i * 4] = Math.round(30 * k); data[i * 4 + 1] = Math.round(22 * k); data[i * 4 + 2] = Math.round(16 * k);
    if (h3(i % w >> 1, (i / w) >> 1, 41) > K.keep) { data[i * 4 + 3] = 0; cut++; } }
  await setWebp(tex, data, w, h, 86); console.log('stubble texels', n, 'dropped', cut);
}
export function faceShapePass(doc, K = {}) {
  K = { socket: 0.0012, brow: 0.0008, bridge: 0.0007, ...K };
  const B = body(doc), P = B.P, a = P.getArray().slice(), head = B.wOn(/^head$/), n = a.length / 3;
  const EY = 1.748, EZ = 0.138, g = (dx, dy, dz, sx, sy, sz) => Math.exp(-((dx / sx) ** 2 + (dy / sy) ** 2 + (dz / sz) ** 2));
  // (the eyeballs and lids are their own primitives on the same points: only the skin's own points around the socket move)
  const skinOnly = new Set(prim(doc, 'skin').flatMap((q) => [...q.getIndices().getArray()])), other = new Set(['eyes', 'lashes', 'brows'].flatMap((m) => prim(doc, m).flatMap((q) => [...q.getIndices().getArray()])));
  let moved = 0;
  for (let v = 0; v < n; v++) { if (head[v] < 0.5 || !skinOnly.has(v)) continue; const x0 = a[v * 3], y = a[v * 3 + 1], z = a[v * 3 + 2], x = Math.abs(x0), sx = Math.sign(x0) || 1;
    if (y < 1.70) continue;
    // socket: the hollow between the brow and the upper lid's crease, and the inner corner (not the lids)
    const sock = g(x - 0.03, y - (EY + 0.012), z - (EZ + 0.006), 0.012, 0.006, 0.012) + 0.6 * g(x - 0.018, y - (EY + 0.004), z - (EZ + 0.004), 0.006, 0.007, 0.01);
    const brow = g(x - 0.032, y - (EY + 0.026), z - (EZ + 0.012), 0.02, 0.006, 0.014);
    const bridge = g(x0, y - (EY + 0.002), z - (EZ + 0.03), 0.006, 0.014, 0.012), side = g(x - 0.009, y - (EY - 0.005), z - (EZ + 0.022), 0.004, 0.012, 0.01);
    const lidGuard = other.has(v) ? 0 : 1;
    const dz = (-K.socket * sock * lidGuard + K.brow * brow + K.bridge * bridge), dx = -sx * 0.0005 * side;
    if (Math.abs(dz) + Math.abs(dx) < 1e-6) continue; a[v * 3 + 2] += dz * head[v]; a[v * 3] += dx * head[v]; moved++; }
  P.setArray(a); console.log('face shape: moved', moved);
}
export async function cordsShoesPass(doc, K = {}) {
  const c = matOf(doc, 'hood-cords'); if (c) { c.setBaseColorFactor([...(K.cord || [0.62, 0.6, 0.57]), 1]); c.setRoughnessFactor(0.85); if (K.spec != null) c.setExtension('KHR_materials_specular', doc.createExtension(KHRMaterialsSpecular).createSpecular().setSpecularFactor(K.spec)); }
  for (const nm of ['sneakers', 'sneakers-collar', 'sneakers-laces', 'sneakers-lining']) { const m = matOf(doc, nm); if (!m) continue; const f = m.getBaseColorFactor(); m.setBaseColorFactor([f[0] * 0.74, f[1] * 0.72, f[2] * 0.69, 1]); m.setRoughnessFactor(Math.max(0.9, m.getRoughnessFactor())); }
  const so = matOf(doc, 'sneakers-soles'); if (so) { const f = so.getBaseColorFactor(); so.setBaseColorFactor([f[0] * 0.86, f[1] * 0.84, f[2] * 0.8, 1]); }
}
// the hood: a closed shell drawn double-sided, so where it folds over at its tip (lying down at the back) its folded
// faces showed their insides: dark slits and light slivers at 135-225 (the flat-id render: back faces at the tip).
// Single-sided, the fold shows the shell's own outside and the hoodie under it.
// The light zigzag along the hood's lower edge was its specular at grazing angles (it stayed with the hood's colour
// and vertex colour at black and went with specular 0.02): fleece has next to none, so the hood's and the hoodie's
// specular from 0.45 to 0.08 (the shoulder's light sliver was the same).
export function hoodSidePass(doc) { const m = matOf(doc, 'hood'); if (m) m.setDoubleSided(false);
  for (const n of ['hood', 'hoodie', 'hoodie-hem', 'hoodie-neckband']) matOf(doc, n)?.getExtension('KHR_materials_specular')?.setSpecularFactor(0.08); }
// the jeans: in the turntable's key light they still read mid-blue and whiskered (the dye's mean is the sheet's
// #2C3646 only in the study's dim light): the fold/wash contrast flattened toward its local mean by 45%, the colour
// 0.8 darker, and the denim's specular (glTF's default 0.5 sheen at grazing angles washed it out) down to 0.15
import { require as req } from './glb.mjs';
const { KHRMaterialsSpecular } = req('@gltf-transform/extensions');
export async function denimPass(doc, K = {}) {
  K = { flat: 0.45, dark: 0.8, spec: 0.15, ...K };
  const m = matOf(doc, 'clothes'), tex = m.getBaseColorTexture(), { data, w, h } = await rgba(tex);
  const { default: sharpMod } = { default: (await import('./glb.mjs')).sharp };
  const blur = await sharpMod(data, { raw: { width: w, height: h, channels: 4 } }).blur(10).raw().toBuffer();
  for (let i = 0; i < w * h; i++) { const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2]; if (!(b > r + 4)) continue;
    for (let c = 0; c < 3; c++) data[i * 4 + c] = Math.round((data[i * 4 + c] * (1 - K.flat) + blur[i * 4 + c] * K.flat) * K.dark); }
  await setWebp(tex, data, w, h, 88);
  const ext = doc.createExtension(KHRMaterialsSpecular); m.setExtension('KHR_materials_specular', ext.createSpecular().setSpecularFactor(K.spec));
}
