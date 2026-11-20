// Jensen, hair round 2 (caricature round 11, 19 Nov). The critic on hair round 1's cards: in the game (the kitchen call,
// the cutscene, the car) the hair read as a white cotton puff with spikes standing up; the front locks pointed straight up
// instead of up and back; it blew out to flat white with no lowlights; in Blender the cards read as dry-brush strokes with
// curled edges and scribbly loops over the temples and ears, black gaps and ragged tips along the crown, too much bare
// forehead at the temples, a thin veil over the ear. So:
//   R11.shell   the under-shell higher (shellK 0.55 -> 0.72) and a cool mid-grey, not near-black: a gap between cards shows
//               hair under it, not a hole
//   R11.cards   fewer, wider clump cards (whole strips of the clump atlas, hairatlas.mjs) laid flatter (twist 9 -> 3 deg,
//               arch 0.12 -> 0.03), no curl at the sides (no loops), the tips settled under the next layer; the four swoop
//               locks lower and lying back over the crown (lift 18 -> 9 mm, up-bias 0.25 -> -0.15, drop 0.35 -> 0.7), the
//               mass 12% lower on top; the front wall and temples rooted 5 mm past the hairline and the wall carried round
//               to the temples (58 -> 84 deg); a fill of clumps over and behind the ear and an inner crown layer; fuller at
//               the nape. Values: the top a neutral light silver (0.72 -> 0.55 linear, not blue; the value jitter one per card, not per channel), the under-layer, temples
//               and nape a much darker cool grey, the middle of each card darker than its edges
//   R11.cavity  the oh viseme's light band: the lower teeth's biting edge narrower and in shadow, the cavity a deep red-brown
//               (not flat black)
export const R11 = {
  shell: { shellK: 0.72, tone: [0.24, 0.245, 0.26], low: [0.13, 0.133, 0.145], sideLow: 0.4 },
  cards: {
    n: 760, win: [0.95, 1], arch: 0.03, twist: 3, tipSettle: 0.42, sideStraight: 1, xDark: 0.16,
    lay: [0.5, 0.9], front: 0.016, lockLift: 0.009, sideFlat: 0.12, backFlat: 0.28, sideAdd: 0.008,
    top: [0.56, 0.55, 0.545], mid: [0.15, 0.152, 0.165], low: [0.05, 0.052, 0.06], jit: [0.86, 1.08], lowW: [0.75, 0.8],
    layers: [[0.0, 0.32, 0.34, [0, 1, 2], [0.016, 0.022]], [0.35, 0.68, 0.34, [0, 1, 2, 3], [0.014, 0.02]], [0.7, 1.0, 0.32, [0, 1, 3, 4, 5], [0.012, 0.018]]],
    // the swoop's four locks: [azimuth, half-width, length, sweep to his right, lift]; longer and lower than round 1's
    locks: [[-36, 13, 0.11, -0.34, 0.8], [-14, 14, 0.125, -0.3, 1.0], [8, 14, 0.125, -0.27, 1.05], [30, 12, 0.105, -0.2, 0.85]],
    lockBiasY: -0.15, lockDrop: 0.7, lockFront: 0.45, lockCards: 11, lockW: [0.016, 0.022], lockUnderDark: 0.5, wallBright: -0.15, wallDark: 0.15,
    wallRange: 84, wallInset: [-0.003, 0.004], wallBiasY: 0.55, wallBiasK: 0.85, wallLen: [0.055, 0.08], wallStep: 3.2, wallSideLow: 0.45, wallSideLift: 0,
    temple: { n: 150, x: 0.55, z: 0.0, y: [-0.25, 0.35], len: [0.035, 0.055], past: 0.012, layer: [0.55, 0.9], w: [0.014, 0.02], dark: 0.15 },
    crown: { n: 120, y: 0.35, layer: [0.25, 0.55], w: [0.018, 0.024], dark: 0.1 },
    flyaways: 3,
  },
  cavity: { edge: [0.47, 0.5], dark: [0.505, 0.53], tooth: [150, 140, 124], cave: [62, 26, 22] },
};
