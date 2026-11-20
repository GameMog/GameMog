// Jensen, hair round 3 (caricature round 12, 19 Nov). The critic on hair round 2: the mass a thin skin of flat ribbons
// (curled paper strips, paint-brush daubs, the scalp seen between the locks), a sawtooth row of card ends sitting on the
// forehead, the swoop too low and flat, the atlas reading as dry-brush paint, ragged dark veils over the ears, the
// lowlights separate dark patches, and in the game a white cap with dark temple pads. So:
//   R12.shell   the dome pushed out ~13 mm all round (its base thickness 8 -> 21 mm; the cards ride the dome's thickness,
//               so they move out with it), the under-shell closer under the cards (shellK 0.72 -> 0.8) and a lighter mid
//               grey, the hairline's wobble smaller (a clean, soft hairline, not a jagged one)
//   R12.cards   a strand atlas of fine strands (hairatlas.mjs, round 3); three stacked layers of wide clumps (inner volume,
//               mid, outer locks: 760 -> 1350 cards) and a denser inner crown layer, so no line of sight reaches the scalp;
//               the front wall rooted 6-12 mm behind the hairline and rising up out of it; a row of fine baby-hair cards
//               along the front edge; five hero locks, each 15 cards in three crossed, section-curved levels, lifted
//               ~20 mm just behind the hairline and rolling back with a lean to his right; the sides wider, denser cards
//               combed back with the tips tucked in (no cards hanging past the hairline over the ear), four flyaways;
//               each card dark at the root rising to its value along its length (the lowlights blended, not patches)
export const R12 = {
  shell: { base: 0.012, top: 0.0155, backTrim: 0.5, sideTrim: 0.2, edgeW: 0.02, fadeW: 0.0015, shellK: 0.8, tone: [0.3, 0.302, 0.315], low: [0.17, 0.172, 0.185], edgeJit: 0.003 },
  cards: {
    n: 1350, jit: [0.96, 1.03], normalVol: 0.92, cut: 0.4, lay: [0.55, 0.93], tipSettle: 0.5, xDark: 0.08, rootGrad: [0.8, 0.45], top: [0.72, 0.715, 0.71], lowW: [0.5, 0.35], shortK: 0.12,
    layers: [[0.0, 0.3, 0.3, [0, 1, 2], [0.02, 0.026]], [0.32, 0.66, 0.35, [0, 1, 2, 3], [0.018, 0.024]], [0.68, 1.0, 0.35, [0, 1, 3, 4], [0.015, 0.021]]],
    // the swoop's five hero locks: [azimuth, half-width, length, sweep to his right, lift]
    locks: [[-36, 12, 0.11, -0.32, 0.6], [-18, 13, 0.13, -0.3, 0.95], [0, 14, 0.135, -0.27, 1.1], [18, 13, 0.125, -0.22, 1.0], [34, 11, 0.105, -0.14, 0.7]],
    lockLift: 0.012, lockFront: 0.45, lockBiasY: 0.05, lockDrop: 0.6, lockInset: 0.011, lockCards: 15, lockStack: [3, 0.007], lockCross: 14,
    lockArch: 0.18, lockW: [0.022, 0.03], lockStrips: [0, 1, 2, 3, 4], lockTaper: 0.45, lockCut: 0.85, lockUnderDark: 0.25,
    // (the swoop's face is the locks' and the wall's root half: near-white there too, darker only right at the root)
    frontTone: { rootGrad: [0.82, 0.18], rootLow: 0.15 },
    wallInset: [0.0015, 0.005], wallBright: 0.05, wallDark: 0, wallBiasY: 0.8, wallSideLift: 0.3,
    temple: { n: 260, x: 0.55, z: 0.1, y: [-0.25, 0.4], len: [0.04, 0.06], past: 0.003, layer: [0.5, 0.9], w: [0.02, 0.028], dark: 0.05, bias: [-0.45, -1], biasK: 0.6, taper: 0.3 },
    crown: { n: 240, y: 0.2, layer: [0.15, 0.45], w: [0.022, 0.028], dark: 0.08 },
    baby: { range: 46, step: 2.4, rows: 1, inset: 0.0015, len: [0.01, 0.016], layer: 0.3, w: [0.003, 0.004], dark: 0.3 },
    flyaways: 4,
  },
};

// ---- the rest of the critic's list (hair round 3), one late pass: r12Pass(doc, K)
//   mouth    the oh viseme's pale line across the lower teeth: their biting edge darker and narrower (R12.cavity, fed to
//            round10's mouthCavityPass); the flat pink tongue slab pulled back and down into the cavity and darkened
//   glasses  the browline frames read flat and blue in the game: the lens rims' top edge arched over each lens (the bar's
//            own arch is glasses8's, raised in R12.glasses), the frames ~5% larger (R12.glassesBig), the metal a neutral
//            gunmetal (no blue tint for the sky to push)
//   leather  charcoal grey with sheen: a deeper black (albedo x 0.78 on top of round 10's x 0.72), its clearcoat and
//            specular lower
export const R12x = {
  cavity: { edge: [0.474, 0.494], dark: [0.5, 0.52], tooth: [104, 94, 84], cave: [48, 20, 17] },
  glasses: { arc: 0.0072 },
  glassesBig: { big: 1.25 },
  tongue: { back: 0.004, down: 0.0028, col: [0.16, 0.05, 0.048], rough: 0.6 },
  lens: { arc: 0.0032, lensX: 0.044, arcW: 0.03, yMid: 1.613, metal: [0.2, 0.198, 0.195], rim: [0.2, 0.198, 0.195], metallic: 0.75, rough: 0.36 },
  leather: { black: 0.78, coat: 0.02, spec: 0.22 },
};
const sm = (a, b, t) => { t = Math.max(0, Math.min(1, (t - a) / (b - a))); return t * t * (3 - 2 * t); };
export function r12Pass(doc, K = {}) {
  K = { ...R12x, ...K };
  const prims = doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives());
  // the tongue: back and down (its morph deltas ride as they were)
  let nt = 0;
  for (const p of prims) if (p.getMaterial()?.getName() === 'tongue') { const acc = p.getAttribute('POSITION'), A = acc.getArray().slice();
    for (let i = 0; i < A.length; i += 3) { A[i + 1] -= K.tongue.down; A[i + 2] -= K.tongue.back; nt++; } acc.setArray(A);
    p.getMaterial().setBaseColorFactor([...K.tongue.col, 1]).setRoughnessFactor(K.tongue.rough); }
  // the glasses: the lens rims' top edge arched, the metal neutral
  const L = K.lens; let nl = 0; const seen = new Set();
  for (const p of prims) { const mn = p.getMaterial()?.getName() || ''; if (!/^glasses-(lens-edge|metal)$/.test(mn)) continue;
    const m = p.getMaterial(); m.setBaseColorFactor([...(mn === 'glasses-metal' ? L.metal : L.rim), 1]).setMetallicFactor(L.metallic).setRoughnessFactor(L.rough);
    if (mn !== 'glasses-lens-edge') continue; const acc = p.getAttribute('POSITION'); if (seen.has(acc)) continue; seen.add(acc); const A = acc.getArray().slice();
    for (let i = 0; i < A.length; i += 3) { const x = Math.abs(A[i]), y = A[i + 1], u = (x - L.lensX) / L.arcW; if (y <= L.yMid) continue;
      A[i + 1] = y + L.arc * Math.max(0, 1 - u * u) * sm(L.yMid, L.yMid + 0.012, y); nl++; }
    acc.setArray(A); }
  // the leather: deeper black, less sheen
  const lm = doc.getRoot().listMaterials().find((m) => m.getName() === 'leather');
  if (lm) { const f = lm.getBaseColorFactor(); lm.setBaseColorFactor([f[0] * K.leather.black, f[1] * K.leather.black, f[2] * K.leather.black, f[3]]);
    for (const e of lm.listExtensions()) { if (e.setClearcoatFactor) e.setClearcoatFactor(K.leather.coat); if (e.setSpecularFactor) e.setSpecularFactor(K.leather.spec); } }
  console.log('r12: tongue points', nt, '; lens rim points arched', nl, '; leather', lm ? 'x' + K.leather.black : 'none');
}
