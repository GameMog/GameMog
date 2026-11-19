// Jensen, the stylized parody caricature (the owner, 19 Nov 2026: after four realistic likeness rounds stalled, an
// affectionate SNL / Spitting Image style caricature of the public keynote persona). Only the signature, non-ethnic
// features are pushed: the big silver swoop of hair, the oversized gunmetal browline glasses, the warm presenter grin
// with lively brows (build.mjs `grin`), the head a little large for the body (build.mjs `headsize`, kept by writeKept).
// The eyes, nose and skin are left exactly as the realistic build made them: no eye shape, skin tone or other
// racialised feature is touched by anything here.
//   hairSwoopPass(doc, K)   the groom's volume pushed out from the scalp (the roots stay put, each card's height above
//                           the scalp grows with a saturating curve), most at the front-top quiff, lifted up and back
//   glassesBigPass(doc, K)  the frame's front a little oversized about the bridge (the temples blend back to the ears),
//                           the browline bar thicker, the gunmetal lighter so it reads at a distance
// Original work (no new assets); see storykit/handbuilt/jensen/CREDITS.md.
const sm = (a, b, t) => { t = Math.max(0, Math.min(1, (t - a) / (b - a))); return t * t * (3 - 2 * t); };
const primsOf = (doc) => doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives());

// the scalp: the body's skin points above the brow line (used by its triangles), on a 1 cm grid
function scalp(doc, y0) {
  const sk = primsOf(doc).filter((p) => p.getMaterial()?.getName() === 'skin').sort((a, b) => b.getIndices().getCount() - a.getIndices().getCount())[0];
  const S = sk.getAttribute('POSITION').getArray(), used = new Uint8Array(S.length / 3); for (const i of sk.getIndices().getArray()) used[i] = 1;
  const G = new Map(), cell = 0.01, key = (x, y, z) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`; let n = 0;
  for (let v = 0; v < used.length; v++) if (used[v] && S[v * 3 + 1] > y0) { const k = key(S[v * 3], S[v * 3 + 1], S[v * 3 + 2]); (G.get(k) || G.set(k, []).get(k)).push(v); n++; }
  const near = (x, y, z) => { let best = 1e9, q = -1; for (let r = 1; r <= 6 && q < 0; r++) { const cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell);
      for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) for (let k = -r; k <= r; k++) for (const v of G.get(`${cx + i},${cy + j},${cz + k}`) || []) { const d = (S[v * 3] - x) ** 2 + (S[v * 3 + 1] - y) ** 2 + (S[v * 3 + 2] - z) ** 2; if (d < best) { best = d; q = v; } } }
    return q < 0 ? null : [S[q * 3], S[q * 3 + 1], S[q * 3 + 2]]; };
  return { near, n };
}

// The hair: each point p of the groom (and its cap) finds the scalp point q under it; n is the scalp's outward
// direction there (from the skull's centre c). Its height t above the scalp becomes t + A(n) * (1 - exp(-t / tau)):
// the roots (t ~ 0) stay on the scalp, every layer above them is lifted, the outer ones most, so the cards keep their
// order and the groom stays one continuous mass. A(n) is the region's lift: largest over the front-top (the quiff),
// generous over the crown, less behind, little over the ears and none at the nape. The front-top is also carried a
// little back (the swoop's flow), the crown a little up.
export function hairSwoopPass(doc, K = {}) {
  K = { c: [0, 1.645, 0.035], tau: 0.007, quiff: 0.04, top: 0.022, back: 0.01, side: 0.003, flowBack: 0.01, quiffDir: [0, 0.62, 0.78], quiffCos: 0.55, y0: 1.575, ...K };
  const { near, n: ns } = scalp(doc, K.y0), qd = K.quiffDir, ql = Math.hypot(...qd), Q = qd.map((v) => v / ql);
  let moved = 0, peak = 0;
  for (const p of primsOf(doc)) { const mat = p.getMaterial()?.getName(); if (mat !== 'hair' && mat !== 'hairCap') continue;
    const acc = p.getAttribute('POSITION'), A = acc.getArray().slice(), N = A.length / 3;
    for (let i = 0; i < N; i++) { const x = A[i * 3], y = A[i * 3 + 1], z = A[i * 3 + 2], q = near(x, y, z); if (!q) continue;
      let nx = q[0] - K.c[0], ny = q[1] - K.c[1], nz = q[2] - K.c[2]; const L = Math.hypot(nx, ny, nz) || 1; nx /= L; ny /= L; nz /= L;
      const t = Math.max(0, (x - q[0]) * nx + (y - q[1]) * ny + (z - q[2]) * nz);
      const wQ = sm(K.quiffCos, 0.97, nx * Q[0] + ny * Q[1] + nz * Q[2]), wTop = sm(0.35, 0.9, ny), wBack = sm(0.15, 0.7, -nz) * sm(-0.45, 0.1, ny), wSide = sm(0.45, 0.9, Math.abs(nx)) * sm(-0.5, 0.2, ny);
      const lift = Math.max(K.quiff * wQ, K.top * wTop, K.back * wBack, K.side * wSide), g = 1 - Math.exp(-t / K.tau), d = lift * g;
      const fb = K.flowBack * Math.max(wQ, wTop * 0.6) * g; // (carried back along -z, the swoop's flow)
      A[i * 3] = x + nx * d; A[i * 3 + 1] = y + ny * d; A[i * 3 + 2] = z + nz * d - fb;
      if (d > 1e-4) moved++; peak = Math.max(peak, d); }
    acc.setArray(A); }
  console.log('hair swoop: scalp points', ns, 'points lifted', moved, 'peak mm', (peak * 1000).toFixed(1));
}

// The glasses: the front (z >= zFront) scaled by `big` in x and y about the bridge, blending to 1 at zBack (the
// temples run back to the ears as before); the browline bar (metal above yBar) thickened by `bar` about its own
// centre line; the gunmetal colour lifted so the frame reads in a webcam tile.
export function glassesBigPass(doc, K = {}) {
  K = { big: 1.1, zFront: 0.125, zBack: 0.07, bridge: [0, 1.62, 0.15], bar: 1.6, yBar: 1.6305, yBarC: 1.6335, col: [0.13, 0.135, 0.145], metal: 0.65, rough: 0.32, ...K };
  let n = 0; const seen = new Set();
  for (const p of primsOf(doc)) { const mat = p.getMaterial()?.getName() || ''; if (!/^glasses-/.test(mat)) continue;
    const acc = p.getAttribute('POSITION'); if (seen.has(acc)) continue; seen.add(acc); const A = acc.getArray().slice();
    for (let i = 0; i < A.length / 3; i++) { let x = A[i * 3], y = A[i * 3 + 1]; const z = A[i * 3 + 2], w = sm(K.zBack, K.zFront, z);
      if (mat === 'glasses-metal' && w > 0.5 && y > K.yBar) y = K.yBarC + (y - K.yBarC) * (1 + (K.bar - 1) * w);
      const s = 1 + (K.big - 1) * w; x = K.bridge[0] + (x - K.bridge[0]) * s; y = K.bridge[1] + (y - K.bridge[1]) * s;
      A[i * 3] = x; A[i * 3 + 1] = y; n++; }
    acc.setArray(A);
    if (mat === 'glasses-metal' && K.col) p.getMaterial().setBaseColorFactor([...K.col, 1]).setMetallicFactor(K.metal).setRoughnessFactor(K.rough); }
  console.log('glasses big: points', n, 'front x', K.big, 'bar x', K.bar);
}
