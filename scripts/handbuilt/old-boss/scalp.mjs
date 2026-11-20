// Hand-built old boss, the horseshoe: the forge's fuzz shell (hairShell) removed. Cut to the horseshoe's line
// (landmarks.hsLine) it stood as a white wreath along the cut, so the fringe is painted in the skin pass instead (short
// silver strands over scalp skin, thinning to the line). The mesh keeps one degenerate triangle (a mesh needs a
// primitive, and the node order must not change) and a 4 x 4 texture (its 2048 one was 212 KB).
import { prim, matOf, setWebp } from '../young-hero/glb.mjs';
export async function horseshoePass(doc) {
  const p = prim(doc, 'hairShell')[0]; if (!p) return;
  const I = p.getIndices().getArray(), keep = [I[0], I[0], I[0]];
  p.setIndices(doc.createAccessor().setType('SCALAR').setArray(new (I.constructor)(keep)).setBuffer(p.getIndices().getBuffer()));
  const tex = matOf(doc, 'hairShell').getBaseColorTexture(); if (tex) await setWebp(tex, Buffer.alloc(4 * 4 * 4, 0), 4, 4, 80);
  console.log('horseshoe: hair shell triangles', I.length / 3, '->', keep.length / 3);
}
