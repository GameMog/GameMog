// Hand-built Milo: a small school backpack, made here (no library model): a rounded box (a superquadric, 22 x 26 x 9
// cm in his bind space, about 21 x 25 x 9 cm at his 1.15 m) on his back, its front face laid on the hoodie's back, rigid on
// the upper spine; two 3 cm straps from its top over his shoulders and down the front of the hoodie to under the arms,
// laid 4 mm over the hoodie by marching along its surface, skinned as the hoodie under them. Navy nylon, darker straps,
// a yellow zip line painted round the front panel (vertex colour). The straps (K.straps) are off: marched over the
// shoulder they floated off his back in profile; the hood lies over where they would be.
import { prim } from '../young-hero/glb.mjs';
import { big, attrs, grid, surf } from '../agnes/collar.mjs';

export function backpackPass(doc, K = {}) {
  K = { straps: false, w: 0.11, h: 0.13, d: 0.045, yC: 0.84, e: 0.25, col: [0.13, 0.2, 0.4], strap: [0.08, 0.1, 0.2], zip: [0.95, 0.75, 0.2], ...K };
  const hood = big(doc, 'hoodie'), H = attrs(hood), near = grid(H, 0.012);
  const names = doc.getRoot().listSkins()[0].listJoints().map((j) => j.getName()), sp = names.indexOf(K.bone || 'spine02') >= 0 ? names.indexOf(K.bone || 'spine02') : names.indexOf('spine01');
  // the back's surface behind the pack: the hoodie's furthest-back z near the pack's middle
  let zb = 9; for (const v of H.verts) { const x = H.P[v * 3], y = H.P[v * 3 + 1], z = H.P[v * 3 + 2]; if (Math.abs(x) < K.w * 0.8 && Math.abs(y - K.yC) < K.h * 0.8 && z < zb) zb = z; }
  const zC = zb - K.d - 0.004;
  const P = [], N = [], C = [], I = [], J = [], W = [];
  const sg = (x, p) => Math.sign(x) * Math.abs(x) ** p;
  const NU = 28, NV = 18, base = 0;
  for (let i = 0; i <= NV; i++) { const v = -Math.PI / 2 + (i / NV) * Math.PI; for (let j = 0; j < NU; j++) { const u = -Math.PI + (j / NU) * 2 * Math.PI;
    const cx = sg(Math.cos(v), K.e) * sg(Math.cos(u), K.e), cy = sg(Math.sin(v), K.e), cz = sg(Math.cos(v), K.e) * sg(Math.sin(u), K.e);
    let x = cx * K.w, y = K.yC + cy * K.h, z = zC + cz * K.d; if (z > zb - 0.002) z = zb - 0.002; // (the front face on the back)
    P.push(x, y, z); const nx = Math.cos(v) * Math.cos(u), ny = Math.sin(v), nz = Math.cos(v) * Math.sin(u), l = Math.hypot(nx, ny, nz) || 1; N.push(nx / l, ny / l, nz / l);
    const zipL = Math.abs(Math.abs(cz) - 0.55) < 0.06 && cz < 0 ? 1 : 0; C.push(...(zipL ? K.zip : K.col), 1); J.push(sp, 0, 0, 0); W.push(1, 0, 0, 0); } }
  for (let i = 0; i < NV; i++) for (let j = 0; j < NU; j++) { const a = base + i * NU + j, b = base + i * NU + (j + 1) % NU, c = base + (i + 1) * NU + (j + 1) % NU, d = base + (i + 1) * NU + j; I.push(a, b, c, a, c, d); }
  // straps: a ribbon each side, marched over the shoulder (the path's guide: a loop in the side's sagittal plane)
  if (K.straps) for (const s of [1, -1]) { const xs = s * 0.055, ang0 = -2.0, ang1 = 0.35, n = 20, half = 0.016, b0 = P.length / 3, top = K.yC + K.h * 0.85;
    const cy = top - 0.05, cz = 0.0, R = 0.2;
    for (let k = 0; k <= n; k++) { const a = ang0 + (k / n) * (ang1 - ang0), g = [xs + s * 0.012 * Math.max(0, (k - n * 0.6) / (n * 0.4)), cy + Math.cos(a) * R * 0.5, cz + Math.sin(a) * R];
      // pull the guide in onto the hoodie
      let q = g; for (let it = 0; it < 8; it++) { const S2 = surf(H, near, q); if (!S2) break; q = S2.p.map((x, c) => x + S2.n[c] * 0.004); }
      const S3 = surf(H, near, q); const nn = S3 ? S3.n : [0, 1, 0];
      for (const sd of [-1, 1]) { P.push(q[0] + sd * half, q[1], q[2]); N.push(...nn); C.push(...K.strap, 1); const v = S3 ? S3.v : 0; for (let kk = 0; kk < 4; kk++) { J.push(H.J[v * 4 + kk]); W.push(H.W(v, kk)); } } }
    for (let k = 0; k < n; k++) { const a = b0 + k * 2, b = a + 1, c = a + 3, d = a + 2; I.push(a, b, c, a, c, d, a, c, b, a, d, c); } }
  const nv = P.length / 3, Wn = new Float32Array(W); for (let v = 0; v < nv; v++) { let t = 0; for (let k = 0; k < 4; k++) t += Wn[v * 4 + k]; for (let k = 0; k < 4; k++) Wn[v * 4 + k] /= t || 1; }
  const buf = doc.getRoot().listBuffers()[0], acc = (type, arr) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buf);
  const mat = doc.createMaterial('backpack').setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(0.7).setMetallicFactor(0);
  doc.getRoot().listMeshes().find((m) => m.listPrimitives().includes(hood)).addPrimitive(doc.createPrimitive().setMaterial(mat).setIndices(acc('SCALAR', Uint32Array.from(I))).setAttribute('POSITION', acc('VEC3', Float32Array.from(P))).setAttribute('NORMAL', acc('VEC3', Float32Array.from(N))).setAttribute('COLOR_0', acc('VEC4', Float32Array.from(C))).setAttribute('JOINTS_0', acc('VEC4', Uint16Array.from(J))).setAttribute('WEIGHTS_0', acc('VEC4', Wn)));
  console.log('backpack: back at z', zb.toFixed(3), 'bone', names[sp], 'points', nv);
}
