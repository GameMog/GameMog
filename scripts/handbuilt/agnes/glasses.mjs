// Hand-built Agnes: her round wire glasses as geometry (the forge's 'round-glasses' prop is drawn only by the studio, from
// the sheet's props; Mog City's runner draws no props for a forged or hand-built person, so in the game she had none):
// two round rims (r 21 mm) 12 mm in front of the eyes' front, a keyhole bridge arched over the nose, and two temples back to
// the ears, a 0.9 mm pale-gold wire, rigid on the head bone.
import { body, sm } from '../young-hero/glb.mjs';
import { EY as EY0, EYEFRONT as EYEFRONT0 } from './skin.mjs';
export function glassesPass(doc, K = {}) {
  // (another face's eyes may be given: K.EY, K.EYEFRONT (Pell's rimless pair))
  const EY = K.EY ?? EY0, EYEFRONT = K.EYEFRONT ?? EYEFRONT0;
  K = { R: 0.021, r: 0.0009, ex: 0.0283, dz: 0.012, temple: 0.075, col: [0.78, 0.68, 0.5], ...K };
  const B = body(doc), hi = B.names.indexOf('head'), P = [], N = [], I = [], SEG = 8;
  const tube = (pts, closed) => { const base = P.length / 3, n = pts.length;
    for (let i = 0; i < n; i++) { const a = pts[closed ? (i - 1 + n) % n : Math.max(0, i - 1)], b = pts[closed ? (i + 1) % n : Math.min(n - 1, i + 1)], t = b.map((x, c) => x - a[c]), tl = Math.hypot(...t) || 1, T = t.map((x) => x / tl);
      let u = Math.abs(T[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]; const d = u[0] * T[0] + u[1] * T[1] + u[2] * T[2]; u = u.map((x, c) => x - T[c] * d); const ul = Math.hypot(...u); u = u.map((x) => x / ul); const v = [T[1] * u[2] - T[2] * u[1], T[2] * u[0] - T[0] * u[2], T[0] * u[1] - T[1] * u[0]];
      for (let j = 0; j < SEG; j++) { const g = (j / SEG) * 2 * Math.PI, nn = [0, 1, 2].map((c) => Math.cos(g) * u[c] + Math.sin(g) * v[c]); P.push(...pts[i].map((x, c) => x + nn[c] * K.r)); N.push(...nn); } }
    for (let i = 0; i < (closed ? n : n - 1); i++) { const i2 = (i + 1) % n; for (let j = 0; j < SEG; j++) { const j2 = (j + 1) % SEG, a = base + i * SEG + j, b = base + i2 * SEG + j, c = base + i2 * SEG + j2, e = base + i * SEG + j2; I.push(a, b, c, a, c, e, a, c, b, a, e, c); } } };
  const z0 = EYEFRONT + K.dz;
  for (const s of [1, -1]) { const cx = s * K.ex; tube(Array.from({ length: 40 }, (_, i) => { const a = (i / 40) * 2 * Math.PI; return [cx + Math.cos(a) * K.R, EY + Math.sin(a) * K.R * 0.95, z0 - 0.002 * Math.cos(a) * s]; }), true);
    // the temple: from the rim's outer edge back along the side of the head to the ear, a little down at the end
    tube(Array.from({ length: 12 }, (_, i) => { const t = i / 11; return [s * (K.ex + K.R + 0.004 + 0.012 * sm(0, 0.3, t)), EY + 0.004 - 0.012 * sm(0.75, 1, t), z0 - 0.004 - K.temple * t]; }), false); }
  tube(Array.from({ length: 12 }, (_, i) => { const t = i / 11, x = -(K.ex - K.R) + 2 * (K.ex - K.R) * t; return [x, EY + 0.006 + 0.004 * Math.sin(t * Math.PI), z0 + 0.001]; }), false);
  const nv = P.length / 3, JJ = new Uint16Array(nv * 4), WW = new Float32Array(nv * 4); for (let v = 0; v < nv; v++) { JJ[v * 4] = hi; WW[v * 4] = 1; }
  const buf = doc.getRoot().listBuffers()[0], acc = (type, arr) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buf);
  const mat = doc.createMaterial('glasses').setBaseColorFactor([...K.col, 1]).setMetallicFactor(1).setRoughnessFactor(0.3);
  const mesh = doc.getRoot().listMeshes().find((m) => m.listPrimitives().includes(B.sk));
  mesh.addPrimitive(doc.createPrimitive().setMaterial(mat).setIndices(acc('SCALAR', Uint32Array.from(I))).setAttribute('POSITION', acc('VEC3', Float32Array.from(P))).setAttribute('NORMAL', acc('VEC3', Float32Array.from(N))).setAttribute('JOINTS_0', acc('VEC4', JJ)).setAttribute('WEIGHTS_0', acc('VEC4', WW)));
  // (the sheet's prop taken off the GLB's forge record, so a studio that draws props does not draw a second pair)
  const ex = doc.getRoot().getAsset().extras; if (ex?.forge) { ex.forge.props = []; if (ex.forge.landmarks) ex.forge.landmarks.props = []; }
  console.log('glasses: points', nv);
}
