/**
 * How a frame of a world looks, judged (the owner, 1 Oct: low-hanging fruit
 * for better worlds). The runtime measures a frame (debug.look() in
 * lib/runtime/v1.js); both test drives, the server's (lib/playtest-runtime.ts)
 * and the creator's browser's (lib/test-drive.ts), pick the best of a few
 * frames for the cover with lookScore, and tell the model once, through the
 * advisories, when even the best frame looks basic.
 *
 * Calibrated 1 Oct on 14 worlds in active play: the published worlds measure
 * colour variety 5.0 to 6.7 bits, the commonest colour 7 to 18% of the frame,
 * edges 0.058 to 0.32, contrast 124 to 223, brightness 40 to 155; the plain
 * reference world (primitive trees on a flat field under a big sky) measures
 * 3.3 bits and 33%, a near-black night world 2.6 bits, 39%, 0.032 edges,
 * contrast 35 and brightness 12. The lines sit between.
 */
export type Look = { entropy: number; dominant: number; edges: number; contrast: number; mean: number };

export function isLook(v: unknown): v is Look {
  const o = v as Look;
  return !!o && ['entropy', 'dominant', 'edges', 'contrast', 'mean'].every((k) => Number.isFinite(Number((o as Record<string, unknown>)[k])));
}

/** Higher is a richer, readable frame: variety, detail, contrast, neither crushed nor blown out. */
export function lookScore(m: Look) {
  const dark = m.mean < 35 ? (35 - m.mean) / 8 : 0, blown = m.mean > 200 ? (m.mean - 200) / 8 : 0;
  return m.entropy + Math.min(m.edges, 0.35) * 10 + Math.min(m.contrast, 180) / 60 - m.dominant * 4 - dark - blown;
}

/** The notes a world gets when its best frame still looks basic, in words the model can act on. */
export function lookAdvisories(m: Look): string[] {
  const out: string[] = [];
  if (m.mean < 25) out.push(`The test drive's view is nearly black (brightness ${m.mean} of 255). Night can be dark, but the player, the path and the threats must read: add a key light or moonlight with a direction, lit windows, lamps or emissive signs, and lift the exposure.`);
  else if (m.mean > 205) out.push(`The test drive's view is blown out (brightness ${m.mean} of 255): lower the exposure, the fog's brightness or the bloom so forms and materials show.`);
  if (m.dominant > 0.3) out.push(`One colour covers ${Math.round(m.dominant * 100)}% of the test drive's view. Break it up: layer the scene (foreground props that frame the action, midground detail, a background skyline), and vary the ground and walls with scanned surfaces.`);
  if (m.entropy < 4) out.push(`The test drive's view has few distinct tones (${m.entropy} bits of colour variety; the published worlds have 5 to 6.7). Use real materials (scanned surfaces, roughness, wear), a photographed sky and more than one light colour.`);
  if (m.edges < 0.04) out.push(`The test drive's view has little detail (edge density ${m.edges}; the published worlds have 0.058 or more). It reads as empty or primitive: add authored props, silhouettes and set dressing near the camera.`);
  else if (m.contrast < 60) out.push(`The test drive's view is murky (contrast ${m.contrast}): fog, darkness or bloom is flattening it. Thin the fog, add a key light, and let darks and lights separate.`);
  return out;
}
