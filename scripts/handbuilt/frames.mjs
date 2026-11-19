// Hand-built cast: rectangular glasses as geometry, rigid on the head bone (Mog City's runner and the headshot studio
// draw no props for a forged or hand-built person, so glasses must live in the GLB; Agnes's round wire pair is
// agnes/glasses.mjs). The frame's layout is Mr. Big's (Mog City wagmi/mission/mrbig.js, his study's runtime pair): two
// rounded rectangles extruded with a small bevel, a keyhole bridge, the arms back along the temples into the hair, the
// lenses a thin clear pane just inside each rim. Fitted to the GLB's own eyes (a sphere per side, as face.js and the
// teeth pass fit them) and to the head's width at the temples (the skin itself, 2 to 6 cm behind the eyes).
//   framesPass(doc, { style: 'acetate' | 'tortoise' | 'browline', LW, LH, T, D, r, col, rough, tilt, drop, BH, BD })
import { prim, THREE, sharp, sm } from './young-hero/glb.mjs';

// the eyes as face.js fits them: a least-squares sphere per side over the 'eyes' primitive's points
export function eyeFit(doc) {
  const P0 = prim(doc, 'eyes')[0], PA = P0.getAttribute('POSITION').getArray(), eV = [...new Set(P0.getIndices().getArray())];
  const fit = (side) => { const A = Array.from({ length: 4 }, () => new Float64Array(5));
    for (const v of eV) { const x = PA[v * 3], y = PA[v * 3 + 1], z = PA[v * 3 + 2]; if (x * side <= 0) continue; const r = [2 * x, 2 * y, 2 * z, 1], s = x * x + y * y + z * z;
      for (let i = 0; i < 4; i++) { for (let j = 0; j < 4; j++) A[i][j] += r[i] * r[j]; A[i][4] += r[i] * s; } }
    for (let c = 0; c < 4; c++) { let m = c; for (let r = c + 1; r < 4; r++) if (Math.abs(A[r][c]) > Math.abs(A[m][c])) m = r; [A[c], A[m]] = [A[m], A[c]];
      for (let r = 0; r < 4; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let k = c; k < 5; k++) A[r][k] -= f * A[c][k]; } }
    const c = [A[0][4] / A[0][0], A[1][4] / A[1][1], A[2][4] / A[2][2]]; return { c, r: Math.sqrt(Math.max(1e-8, c[0] ** 2 + c[1] ** 2 + c[2] ** 2 + A[3][4] / A[3][3])) }; };
  return { L: fit(1), R: fit(-1) };
}

// a little tortoiseshell: dark brown with amber and deep-brown blotches (Mr. Big's canvas recipe), as a 256 webp
async function tortoiseTex() {
  const S = 256, d = Buffer.alloc(S * S * 4); let s = 11; const R = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < S * S; i++) { d[i * 4] = 0x1c; d[i * 4 + 1] = 0x0e; d[i * 4 + 2] = 0x07; d[i * 4 + 3] = 255; }
  for (let k = 0; k < 140; k++) { const col = R() < 0.55 ? [120, 62, 22] : [70, 34, 12], cx = R() * S, cy = R() * S, rx = 8 + R() * 24, ry = 6 + R() * 14;
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) { const u = (x - cx) / rx, v = (y - cy) / ry, q = 1 - (u * u + v * v); if (q <= 0) continue;
      const X = ((x % S) + S) % S, Y = ((y % S) + S) % S, i = (Y * S + X) * 4, a = 0.85 * q; for (let c = 0; c < 3; c++) d[i + c] = Math.round(d[i + c] * (1 - a) + col[c] * a); } }
  return sharp(d, { raw: { width: S, height: S, channels: 4 } }).webp({ quality: 90 }).toBuffer();
}

export async function framesPass(doc, K = {}) {
  K = { bevel: 0.0012, style: 'acetate', BH: 0.0028, BD: 0.0022, LW: 0.051, LH: 0.034, T: 0.0058, D: 0.006, r: 0.0065, gap: 0.017, drop: 0.002, tilt: 0.06, armH: 0.0062, armW: 0.0032, col: [0.018, 0.018, 0.02], rough: 0.32, lens: [0.8, 0.84, 0.88, 0.06], ...K };
  const R = doc.getRoot(), skinP = prim(doc, 'skin').sort((a, b) => b.getIndices().getCount() - a.getIndices().getCount())[0];
  const PA = skinP.getAttribute('POSITION').getArray(), skin = R.listSkins()[0], HEADI = skin.listJoints().findIndex((j) => j.getName() === 'head');
  if (HEADI < 0) throw new Error('no head bone');
  const E = eyeFit(doc), eyeMid = [0, 1, 2].map((c) => (E.L.c[c] + E.R.c[c]) / 2), eyeR = (E.L.r + E.R.r) / 2, ipd = Math.abs(E.L.c[0] - E.R.c[0]);
  // the head's half width at the temples and the nose's bridge, from the skin's own points at the eyes' height
  let hw = 0, nz = -9; for (let i = 0; i < PA.length / 3; i++) { const x = PA[i * 3], y = PA[i * 3 + 1], z = PA[i * 3 + 2]; if (Math.abs(y - eyeMid[1]) > 0.012) continue;
    if (z > eyeMid[2] - 0.062 && z < eyeMid[2] - 0.02) hw = Math.max(hw, Math.abs(x - eyeMid[0])); if (Math.abs(x - eyeMid[0]) < 0.006) nz = Math.max(nz, z); }
  const halfW = hw > 0.05 ? hw : 0.074, noseZ = nz > -9 ? nz : eyeMid[2] + 0.02;
  const gz = Math.max(eyeMid[2] + eyeR + K.gap, noseZ + 0.006);
  const rr = (w, h, rad) => { const s = new THREE.Shape(), x0 = -w / 2, y0 = -h / 2; s.moveTo(x0 + rad, y0); s.lineTo(x0 + w - rad, y0); s.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + rad); s.lineTo(x0 + w, y0 + h - rad); s.quadraticCurveTo(x0 + w, y0 + h, x0 + w - rad, y0 + h); s.lineTo(x0 + rad, y0 + h); s.quadraticCurveTo(x0, y0 + h, x0, y0 + h - rad); s.lineTo(x0, y0 + rad); s.quadraticCurveTo(x0, y0, x0 + rad, y0); return s; };
  const { LW, LH, T, D, r } = K, ring = rr(LW + 2 * T, LH + 2 * T, r + T); ring.holes.push(rr(LW, LH, r));
  const ringGeo = new THREE.ExtrudeGeometry(ring, { depth: D, bevelEnabled: true, bevelThickness: K.bevel, bevelSize: K.bevel, bevelSegments: 2, curveSegments: 8 }); ringGeo.translate(0, 0, -D / 2);
  const lensGeo = new THREE.ShapeGeometry(rr(LW + 0.001, LH + 0.001, r), 8);
  const cx = Math.max(ipd / 2, 0.031) + 0.001, frames = [], lenses = [];
  const put = (geo, list, pos, rotY = 0, look = null) => { const m = new THREE.Mesh(geo); m.position.set(...pos); m.rotation.y = rotY; if (look) m.lookAt(...look); m.updateMatrix(); const g = geo.index ? geo.toNonIndexed() : geo.clone(); g.applyMatrix4(m.matrix); list.push(g); };
  const browline = K.style === 'browline', edges = [], glints = [];
  if (browline) {
    // (Jensen, likeness round 1: a thin metal semi-rimless frame: a slim dark top bar along each lens's upper edge, the
    // lens's lower edge rimless (its polished edge a faint line), a thin wire bridge and nose pads, round wire temples)
    const tube = (pts, rad, list, seg = 6) => { const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))); list.push(new THREE.TubeGeometry(curve, Math.max(8, pts.length * 6), rad, seg, false).toNonIndexed()); };
    // (likeness round 2: the tubes un-indexed before the merge, which reads each piece's points as a triangle list: the
    // indexed tubes came out as broken triangles, the temples, bridge and lens edge a dotted chain off the face)
    // (likeness round 3, K.rOut: the lens's lower outer corner rounder than the rest (his lenses taper there); the
    // outline drawn with the outer side at +x, mirrored per side (px * sx: the outer side is where px * sx > 0))
    const lensShape = () => { if (!K.rOut) return rr(LW, LH, r); const sh = new THREE.Shape(), x0 = -LW / 2, y0 = -LH / 2, x1 = LW / 2, y1 = LH / 2, ro = Math.min(K.rOut, LH * 0.8), ri = K.rIn ?? r;
      sh.moveTo(x0 + ri, y0); sh.lineTo(x1 - ro * 1.6, y0); sh.bezierCurveTo(x1 - ro * 0.5, y0, x1, y0 + ro * 0.35, x1, y0 + ro); sh.lineTo(x1, y1 - r); sh.quadraticCurveTo(x1, y1, x1 - r, y1);
      sh.lineTo(x0 + r, y1); sh.quadraticCurveTo(x0, y1, x0, y1 - r); sh.lineTo(x0, y0 + ri); sh.quadraticCurveTo(x0, y0, x0 + ri, y0); return sh; };
    const lensPts = (sx, n = 48) => { const s = lensShape().getSpacedPoints(n); const q = s.map((p) => [p.x * sx, p.y]); if (sx < 0) q.reverse(); return q; };
    for (const sx of [-1, 1]) { const ry = -sx * K.tilt, c = Math.cos(ry), sn = Math.sin(ry), place = (px, py, pz = 0) => [sx * cx + px * c + pz * sn, py, -px * sn + pz * c];
      // the top bar: the lens outline's upper part (above 15 % of its height), a flat bar BH tall and BD deep, the rim a
      // 1.2 mm channel the lens sits in
      const P = lensPts(sx, 96), top = P.filter(([, py]) => py > LH * 0.08).sort((a, b) => a[0] - b[0]);
      const bar = new THREE.Shape(); // (likeness round 2, K.sweep: the bar's outer end swept up a little, as his frame's is)
      const sw = (px) => (K.sweep || 0) * sm(0.35, 1, (px * sx) / (LW / 2)) ** 1.5;
      bar.moveTo(top[0][0] - 0.0008, top[0][1] + sw(top[0][0])); for (const [px, py] of top) bar.lineTo(px, py + sw(px) + K.BH * (0.55 + 0.45 * (1 - Math.abs(px) / (LW / 2)) ** 0.3)); for (const [px, py] of [...top].reverse()) bar.lineTo(px, py + sw(px) - 0.0007); bar.closePath();
      const bg = new THREE.ExtrudeGeometry(bar, { depth: K.BD, bevelEnabled: true, bevelThickness: 0.0003, bevelSize: 0.0003, bevelSegments: 1, curveSegments: 4 }); bg.translate(0, 0, -K.BD / 2); bg.rotateY(ry); bg.translate(sx * cx, 0, 0); frames.push(bg.index ? bg.toNonIndexed() : bg);
      // (no lens pane: a pane, however clear, cast a lens-shaped shadow across the cheek under every key light; the
      // rimless lens reads from its polished edge alone)
      // the lens's lower edge: its polished rim, a faint line under the bar's ends
      const isLo = (q) => q[1] <= LH * 0.12, k0 = P.findIndex((q, k) => !isLo(q) && isLo(P[(k + 1) % P.length])), lo = []; for (let k = 1; k <= P.length; k++) { const q = P[(k0 + k) % P.length]; if (!isLo(q)) break; lo.push(q); }
      // (likeness round 3: with K.pane, the edge a flat ribbon in the lens's plane facing out, single-sided: a tube's
      // shadow from the key light fell on the cheeks as dark specks and smudges under the lenses)
      if (K.pane) { const pts = lo.map(([px, py]) => [px, py]), RP = [], RN = [], ry2 = -sx * K.tilt, c2 = Math.cos(ry2), s2 = Math.sin(ry2), w = K.edgeR ?? 0.0004;
        for (let k = 0; k + 1 < pts.length; k++) { const [ax, ay] = pts[k], [bx, by] = pts[k + 1], dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1, nx = -dy / L * w, ny = dx / L * w;
          const q = [[ax - nx, ay - ny], [bx - nx, by - ny], [bx + nx, by + ny], [ax + nx, ay + ny]].map(([qx, qy]) => place(qx, qy, 0.0004 + (K.pane || 0) * (1 - Math.min(1, (qx / (LW / 2)) ** 2 * 0.8 + (qy / (LH / 2)) ** 2 * 0.2))));
          const u1 = [0, 1, 2].map((c) => q[1][c] - q[0][c]), u2 = [0, 1, 2].map((c) => q[2][c] - q[0][c]), fz = (u1[0] * u2[1] - u1[1] * u2[0]) * c2 + (u1[1] * u2[2] - u1[2] * u2[1]) * s2, tri = fz > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]; for (const t of tri) { RP.push(...q[t]); RN.push(s2, 0, c2); } }
        const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(RP, 3)); rg.setAttribute('normal', new THREE.Float32BufferAttribute(RN, 3)); edges.push(rg); }
      else tube(lo.map(([px, py]) => place(px, py, 0.0002)), K.edgeR ?? 0.0005, edges, 5);
      // (no nose pads drawn: at a webcam's distance their arms read as cracks across the lens and the pads as two dark
      // dots beside the nose)
      // the temple: a round wire from the bar's outer end back over the ear, its tip bent down into the hair
      const ox = sx * (cx + (LW / 2) * c + 0.0012), oy = LH / 2 - 0.0035 + (K.sweep || 0) * 0.8, ex = sx * Math.max(halfW + 0.002, cx + LW / 2 + 0.002), z2 = (eyeMid[2] - 0.062) - gz;
      // (likeness round 2: the hinge turns the wire straight back along the head, not out sideways first)
      if (K.style === 'browline') tube([[sx * (cx + (LW / 2 - 0.004) * c), oy + 0.0006, -0.0005], [ox, oy, -0.003], [ox + sx * 0.003, oy, -0.009], [(ox + ex) / 2 + sx * 0.002, oy, z2 * 0.45], [ex + sx * 0.001, oy - 0.001, z2], [ex + sx * 0.0005, oy - 0.012, z2 - 0.022]], K.armW / 2, frames, 8);
      else tube([[sx * (cx + (LW / 2 - 0.004) * c), oy + 0.0006, -0.0005], [ox, oy, -0.003], [ex, oy, -0.012], [ex + sx * 0.001, oy - 0.001, z2], [ex + sx * 0.0005, oy - 0.012, z2 - 0.022]], K.armW / 2, frames, 8);
    }
    // (likeness round 3, the critic: no painted streaks; a real lens: a clear pane in the rimless outline, bowed 1.2 mm
    // forward at its middle, catching the room's light and the key's highlight in its own surface. Single-sided, facing
    // out: a shadow map draws a single-sided piece by its back faces, so the key light in front casts no lens-shaped
    // shadow on the cheek (the round-1 pane's fault))
    if (K.pane) for (const sx of [-1, 1]) { const ry = -sx * K.tilt, c = Math.cos(ry), sn = Math.sin(ry), place = (px, py, pz = 0) => [sx * cx + px * c + pz * sn, py, -px * sn + pz * c];
      const g = new THREE.ShapeGeometry(lensShape(), 10), pa = g.attributes.position, P = [], N = []; const idx = g.index.array, w2 = LW / 2, h2 = LH / 2;
      const bow = (px, py) => K.pane * (1 - Math.min(1, (px / w2) ** 2 * 0.8 + (py / h2) ** 2 * 0.2));
      for (let t = 0; t < idx.length; t += 3) { const tri = [idx[t], idx[t + 1], idx[t + 2]].map((i) => { const px = pa.getX(i) * sx, py = pa.getY(i); return [px, py]; }); if (sx < 0) tri.reverse();
        for (const [px, py] of tri) { P.push(...place(px, py, 0.0003 + bow(px, py))); const dx = -2 * K.pane * 0.8 * px / (w2 * w2), dy = -2 * K.pane * 0.2 * py / (h2 * h2), l = Math.hypot(dx, dy, 1); const nx = -dx / l, ny = -dy / l, nz = 1 / l; N.push(nx * c + nz * sn, ny, -nx * sn + nz * c); } }
      const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); bg.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); lenses.push(bg); }
    // (likeness round 2b, the owner: believable lens glints: on each lens two soft diagonal streaks, a broad one and a
    // thin one beside it, in the lens's plane (a faint white, see-through; at a webcam's distance they read as the clear
    // lens catching the light, where the rimless lens had no surface at all))
    if (K.glint) for (const sx of [-1, 1]) { const ry = -sx * K.tilt;
      for (const [o, w] of [[-0.0045, 0.0026], [0.0006, 0.0009]]) { const sh = new THREE.Shape(), k = 0.55, y0 = -LH / 2 + 0.0015, y1 = LH / 2 - 0.0015, x0 = sx * (LW * 0.12) + o * sx;
        sh.moveTo(x0 - k * (y0 - 0) * sx, y0); sh.lineTo(x0 + w * sx - k * (y0 - 0) * sx, y0); sh.lineTo(x0 + w * sx - k * y1 * sx, y1); sh.lineTo(x0 - k * y1 * sx, y1); sh.closePath();
        put(new THREE.ShapeGeometry(sh), glints, [sx * cx, 0, 0.0004], ry); } }
    // the bridge: a thin double-curved wire between the bars, a little over the lenses' middles
    { const bx = cx - (LW / 2) * Math.cos(K.tilt) + 0.0006; tube([[-bx, LH * 0.34, 0.0006], [-bx * 0.45, LH * 0.48, 0.0016], [0, LH * 0.5, 0.0018], [bx * 0.45, LH * 0.48, 0.0016], [bx, LH * 0.34, 0.0006]], 0.00075, frames, 6); }
  }
  for (const sx of browline ? [] : [-1, 1]) {
    put(ringGeo, frames, [sx * cx, 0, 0], -sx * K.tilt);
    put(lensGeo, lenses, [sx * cx, 0, 0.0005], -sx * K.tilt);
    const ox = sx * (cx + LW / 2 + T * 0.6), ex = sx * Math.max(halfW + 0.002, cx + LW / 2 + T), z1 = -0.004, z2 = (eyeMid[2] - 0.062) - gz, ay = LH / 2 - 0.004;
    const len = Math.hypot(ex - ox, z2 - z1); put(new THREE.BoxGeometry(K.armW, K.armH, len), frames, [(ox + ex) / 2, ay, (z1 + z2) / 2], 0, [ex, ay, z2]);
    // (the arm's end piece: bent down 2 cm behind the ear's top, into the hair)
    const zl = z2 - 0.022; put(new THREE.BoxGeometry(K.armW, K.armH * 0.9, Math.hypot(0.022, 0.012)), frames, [ex, ay - 0.006, (z2 + zl) / 2], 0, [ex, ay - 0.012, zl]);
  }
  if (K.style !== 'browline') { const bw = 2 * cx - LW - 2 * T + 0.004, br = new THREE.CylinderGeometry(0.0034, 0.0034, bw, 12, 1, false); br.rotateZ(Math.PI / 2); put(br, frames, [0, LH * 0.22, 0.0015]); }
  // every piece placed at the eyes' middle (a touch low), into the body's bind space
  const merge = (list) => { const P = [], N = [], UV = []; for (const g of list) { const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
      for (let i = 0; i < p.count; i++) { P.push(p.getX(i) + eyeMid[0], p.getY(i) + eyeMid[1] - K.drop, p.getZ(i) + gz); N.push(n.getX(i), n.getY(i), n.getZ(i));
        // (uv: the frame's own x/y in metres x 20, so the tortoiseshell's blotches run along it)
        UV.push(uv ? (p.getX(i) + p.getZ(i)) * 20 : 0, uv ? p.getY(i) * 20 : 0); } }
    return { P: Float32Array.from(P), N: Float32Array.from(N), UV: Float32Array.from(UV), n: P.length / 3 }; };
  const buf = R.listBuffers()[0], acc = (type, arr) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buf);
  const mesh = R.listMeshes().find((m) => m.listPrimitives().includes(skinP));
  const addPrim = (G, mat) => { const JJ = new Uint16Array(G.n * 4), WW = new Float32Array(G.n * 4); for (let v = 0; v < G.n; v++) { JJ[v * 4] = HEADI; WW[v * 4] = 1; }
    mesh.addPrimitive(doc.createPrimitive().setMaterial(mat).setAttribute('POSITION', acc('VEC3', G.P)).setAttribute('NORMAL', acc('VEC3', G.N)).setAttribute('TEXCOORD_0', acc('VEC2', G.UV)).setAttribute('JOINTS_0', acc('VEC4', JJ)).setAttribute('WEIGHTS_0', acc('VEC4', WW))); };
  const fm = doc.createMaterial('glasses').setBaseColorFactor([...K.col, 1]).setMetallicFactor(K.metal ?? 0.02).setRoughnessFactor(K.rough).setDoubleSided(true);
  if (K.style === 'tortoise') { fm.setBaseColorFactor([0.72, 0.64, 0.59, 1]).setBaseColorTexture(doc.createTexture('tortoise').setImage(await tortoiseTex()).setMimeType('image/webp')); fm.getBaseColorTextureInfo().setWrapS(10497).setWrapT(10497); }
  addPrim(merge(frames), fm);
  if (edges.length) addPrim(merge(edges), doc.createMaterial('lens-edges').setBaseColorFactor(K.edgeCol || [0.78, 0.8, 0.83, 0.6]).setMetallicFactor(0).setRoughnessFactor(0.1).setAlphaMode('BLEND').setDoubleSided(!K.pane));
  if (glints.length) addPrim(merge(glints), doc.createMaterial('lens-glints').setBaseColorFactor([1, 1, 1, K.glint]).setEmissiveFactor([0.12, 0.12, 0.13]).setMetallicFactor(0).setRoughnessFactor(0.05).setAlphaMode('BLEND').setDoubleSided(true));
  const lm = doc.createMaterial('lenses').setBaseColorFactor(K.lens).setMetallicFactor(0).setRoughnessFactor(K.lensRough ?? 0.05).setAlphaMode('BLEND').setDoubleSided(!K.pane);
  if (lenses.length) addPrim(merge(lenses), lm);
  const ex = R.getAsset().extras, fx = ex?.forge || ex; if (fx?.props) fx.props = []; if (fx?.landmarks?.props) fx.landmarks.props = [];
  console.log('frames:', K.style, 'eyes', eyeMid.map((x) => x.toFixed(4)).join(','), 'ipd', (ipd * 1000).toFixed(1), 'mm halfW', (halfW * 1000).toFixed(1), 'mm z', gz.toFixed(4));
  return { eyeMid, gz, halfW };
}
