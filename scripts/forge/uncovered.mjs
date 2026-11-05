// THE CHARACTER FORGE: the "uncovered" gate (RZ, 5 Nov). The skin under a garment is taken out of the body (its hide
// list, the library's covers, the neckline's cut), so a garment missing where the skin went leaves a hole you can see
// through (The Velvet Run's Aunt Rosa: overalls on a woman made trousers only, and the trousers' hide list took her
// chest away: the street seen through her torso). This looks for that hole in the finished person, as a camera would:
// a CPU render (orthographic, a pixel every 4 mm, 8 yaws round at eye height and 8 from 25 degrees above) of every
// mesh in the bind pose, where a pixel is a hole when
//   - the nearest surface along it is the skin's back face (the body's inside, seen through a gap in the skin), or
//   - nothing at all is hit, though the ray passes through the body: within a bone's capsule (spine 3 cm, pelvis and
//     thighs 2.5, neck 2, arms and shins 1.2-1.5; every capsule lies well inside the body of the shipped cast)
// and the gate fails when, in any view, one connected patch of hole pixels is over UNCOVERED.maxCm2 (calibrated on
// the shipped Mr. Big and Jane and the 12 anchors: a mouth's parting, an ear's fold or a cuff's sliver of the arm's
// inside are a few pixels; Rosa's chest is hundreds of square centimetres).
// It runs in the forge itself (pipeline.mjs, Node and a creator's browser: a sheet that would leave a hole is an error,
// never a silent hole) and in gates.mjs on any GLB (the shipped cast too). No Node API, no GPU.
//   uncoveredGlb(glb: Uint8Array, env) -> { pass, worst: { cm2, view, near }, totalCm2, views }
// (maxCm2: the shipped cast and the 12 anchors reach 5.3 at most (Jane: a sliver at the hip from the side); Rosa's
// see-through chest 417)
export const UNCOVERED = { pxM: 0.004, maxCm2: 15, yaws: 8, elev: [0, 25] };

// the capsules: [from joint, to joint, radius m] (the cast's one skeleton: MakeHuman's default, Mog City's names)
const CAPS = [];
{ const chain = (names, r) => { for (let i = 0; i + 1 < names.length; i++) CAPS.push([names[i], names[i + 1], r[i] ?? r[r.length - 1]]); };
  chain(['spine05', 'spine04', 'spine03', 'spine02', 'spine01', 'neck01'], [0.03]);
  chain(['neck01', 'neck02', 'neck03', 'head'], [0.02]);
  for (const s of ['L', 'R']) {
    chain(['root', 'pelvis_' + s, 'upperleg01_' + s], [0.025]);
    chain(['upperleg01_' + s, 'upperleg02_' + s, 'lowerleg01_' + s], [0.025]);
    chain(['lowerleg01_' + s, 'lowerleg02_' + s, 'foot_' + s], [0.015, 0.012]);
    chain(['spine01', 'clavicle_' + s, 'shoulder01_' + s], [0.012]);
    chain(['shoulder01_' + s, 'upperarm01_' + s, 'upperarm02_' + s, 'lowerarm01_' + s], [0.015]);
    chain(['lowerarm01_' + s, 'lowerarm02_' + s, 'wrist_' + s], [0.012]);
  } }

/** the test on posed arrays: prims [{ P: Float32Array (world), idx, skin: bool }], joints Map name -> [x, y, z] */
export function uncoveredTest(prims, joints, opt = {}) {
  const O = { ...UNCOVERED, ...opt }, px = O.pxM, caps = CAPS.filter(([a, b]) => joints.has(a) && joints.has(b)).map(([a, b, r]) => [joints.get(a), joints.get(b), r, b]);
  let lo = [9, 9, 9], hi = [-9, -9, -9];
  for (const p of prims) for (let i = 0; i < p.P.length; i += 3) for (let k = 0; k < 3; k++) { const x = p.P[i + k]; if (x < lo[k]) lo[k] = x; if (x > hi[k]) hi[k] = x; }
  const ctr = lo.map((x, k) => (x + hi[k]) / 2), R = Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2 + 0.02, S = Math.ceil(2 * R / px);
  const views = []; let worst = { cm2: 0 }, total = 0;
  for (const el of O.elev) for (let yi = 0; yi < O.yaws; yi++) {
    const yaw = yi * 2 * Math.PI / O.yaws, ph = el * Math.PI / 180;
    // (the camera looks along -d: d points from the body to the camera)
    const d = [Math.sin(yaw) * Math.cos(ph), Math.sin(ph), Math.cos(yaw) * Math.cos(ph)], rt = [Math.cos(yaw), 0, -Math.sin(yaw)], up = [d[1] * rt[2] - d[2] * rt[1], d[2] * rt[0] - d[0] * rt[2], d[0] * rt[1] - d[1] * rt[0]];
    const proj = (x, y, z) => { const a = x - ctr[0], b = y - ctr[1], c = z - ctr[2]; return [(a * rt[0] + b * rt[1] + c * rt[2] + R) / px, (R - (a * up[0] + b * up[1] + c * up[2])) / px, a * d[0] + b * d[1] + c * d[2]]; };
    const Z = new Float32Array(S * S).fill(-1e9), K = new Uint8Array(S * S); // K: 0 none, 1 cover, 2 skin front, 3 skin back
    for (const p of prims) { const P = p.P, I = p.idx, n = P.length / 3, Q = new Float32Array(n * 3);
      for (let v = 0; v < n; v++) { const q = proj(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]); Q[v * 3] = q[0]; Q[v * 3 + 1] = q[1]; Q[v * 3 + 2] = q[2]; }
      for (let t = 0; t < I.length; t += 3) { const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
        const x0 = Q[a], y0 = Q[a + 1], x1 = Q[b], y1 = Q[b + 1], x2 = Q[c], y2 = Q[c + 1], area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0); if (area === 0) continue;
        // (screen y runs down, so a front face (counter-clockwise seen from the camera) has a negative area here)
        const kind = p.skin ? (area < 0 ? 2 : 3) : 1;
        const minX = Math.max(0, Math.ceil(Math.min(x0, x1, x2) - 0.5)), maxX = Math.min(S - 1, Math.floor(Math.max(x0, x1, x2) - 0.5)), minY = Math.max(0, Math.ceil(Math.min(y0, y1, y2) - 0.5)), maxY = Math.min(S - 1, Math.floor(Math.max(y0, y1, y2) - 0.5));
        for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) { const sx = x + 0.5, sy = y + 0.5;
          const w0 = ((x1 - sx) * (y2 - sy) - (x2 - sx) * (y1 - sy)) / area, w1 = ((x2 - sx) * (y0 - sy) - (x0 - sx) * (y2 - sy)) / area, w2 = 1 - w0 - w1;
          if (w0 < -1e-6 || w1 < -1e-6 || w2 < -1e-6) continue; const z = w0 * Q[a + 2] + w1 * Q[b + 2] + w2 * Q[c + 2], k = y * S + x;
          if (z > Z[k]) { Z[k] = z; K[k] = kind; } } } }
    // (the capsules in this view: a pixel whose ray passes within r of a bone is inside the body)
    const C2 = caps.map(([a, b, r, name]) => { const A = proj(...a), B = proj(...b); return [A[0], A[1], B[0], B[1], r / px, name]; });
    const inBody = (x, y) => { for (const [ax, ay, bx, by, r, name] of C2) { const vx = bx - ax, vy = by - ay, L = vx * vx + vy * vy, t = L ? Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / L)) : 0, ex = ax + vx * t - x, ey = ay + vy * t - y; if (ex * ex + ey * ey <= r * r) return name; } return null; };
    const hole = new Uint8Array(S * S); let nh = 0;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const k = y * S + x; if (K[k] === 3 || (K[k] === 0 && inBody(x + 0.5, y + 0.5))) { hole[k] = 1; nh++; } }
    // (connected patches, 8-neighbour; the largest one this view)
    let best = 0, bestAt = null; const seen = new Uint8Array(S * S), st = [];
    if (nh) for (let k0 = 0; k0 < S * S; k0++) { if (!hole[k0] || seen[k0]) continue; let n = 0, sx = 0, sy = 0; st.push(k0); seen[k0] = 1;
      while (st.length) { const k = st.pop(), x = k % S, y = (k / S) | 0; n++; sx += x; sy += y;
        for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const xx = x + i, yy = y + j; if (xx < 0 || yy < 0 || xx >= S || yy >= S) continue; const kk = yy * S + xx; if (hole[kk] && !seen[kk]) { seen[kk] = 1; st.push(kk); } } }
      if (n > best) { best = n; bestAt = [sx / n, sy / n]; } }
    const cm2 = +(best * px * px * 1e4).toFixed(1), all = +(nh * px * px * 1e4).toFixed(1);
    // (where: the bone nearest the patch's middle, on screen)
    let near = null; if (bestAt) { let bd = 1e9; for (const [ax, ay, bx, by, , name] of C2) { const vx = bx - ax, vy = by - ay, L = vx * vx + vy * vy, t = L ? Math.max(0, Math.min(1, ((bestAt[0] - ax) * vx + (bestAt[1] - ay) * vy) / L)) : 0, dd = Math.hypot(ax + vx * t - bestAt[0], ay + vy * t - bestAt[1]); if (dd < bd) { bd = dd; near = name; } } }
    const view = `yaw ${Math.round(yaw * 180 / Math.PI)} el ${el}`;
    views.push({ view, cm2, allCm2: all, near }); total = Math.max(total, all);
    if (cm2 > worst.cm2) worst = { cm2, view, near };
  }
  return { pass: worst.cm2 <= O.maxCm2, worst, maxAllCm2: total, views, limit: `in every view (8 yaws at eye height and from 25 deg above, bind pose, ${O.pxM * 1000} mm pixels) no connected patch of see-through body (the skin's inside, or nothing where a bone's capsule is) over ${O.maxCm2} cm2` };
}

/** the bind pose of a GLB (any of the cast's: the forge's, Mr. Big, Jane) as world arrays, then the test */
export async function uncoveredGlb(glb, env, opt = {}) {
  const { ALL_EXTENSIONS } = env.gltf.extensions, { MeshoptDecoder } = env.meshopt; await MeshoptDecoder.ready;
  const io = new env.IO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const doc = await io.readBinary(glb), R = doc.getRoot(), skin = R.listSkins()[0], J = skin ? skin.listJoints() : [];
  const mul = (a, b) => { const o = new Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; };
  const SM = J.map((j, k) => mul(j.getWorldMatrix(), skin.getInverseBindMatrices().getElement(k, [])));
  const joints = new Map(J.map((j) => { const m = j.getWorldMatrix(); return [j.getName(), [m[12], m[13], m[14]]]; }));
  const prims = [];
  for (const node of R.listNodes()) { const mesh = node.getMesh(); if (!mesh) continue; const skinned = !!node.getSkin(), NM = node.getWorldMatrix();
    for (const p of mesh.listPrimitives()) { const PA = p.getAttribute('POSITION'), IA = p.getIndices(); if (!PA || !IA || (p.getMode?.() ?? 4) !== 4) continue;
      const n = PA.getCount(), P = new Float32Array(n * 3), JA = p.getAttribute('JOINTS_0'), WA = p.getAttribute('WEIGHTS_0'), e = [0, 0, 0], jj = [0, 0, 0, 0], ww = [0, 0, 0, 0];
      for (let v = 0; v < n; v++) { PA.getElement(v, e); const [x, y, z] = e;
        if (skinned && JA && WA) { JA.getElement(v, jj); WA.getElement(v, ww); let X = 0, Y = 0, Zt = 0, ws = 0;
          for (let k = 0; k < 4; k++) { const w = ww[k]; if (!w) continue; const a = SM[jj[k]]; ws += w; X += w * (a[0] * x + a[4] * y + a[8] * z + a[12]); Y += w * (a[1] * x + a[5] * y + a[9] * z + a[13]); Zt += w * (a[2] * x + a[6] * y + a[10] * z + a[14]); }
          ws = ws || 1; P[v * 3] = X / ws; P[v * 3 + 1] = Y / ws; P[v * 3 + 2] = Zt / ws; }
        else { const a = NM; P[v * 3] = a[0] * x + a[4] * y + a[8] * z + a[12]; P[v * 3 + 1] = a[1] * x + a[5] * y + a[9] * z + a[13]; P[v * 3 + 2] = a[2] * x + a[6] * y + a[10] * z + a[14]; } }
      prims.push({ P, idx: Uint32Array.from(IA.getArray()), skin: p.getMaterial()?.getName() === 'skin' }); } }
  return uncoveredTest(prims, joints, opt);
}
