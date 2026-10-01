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
 *
 * The glare and the player (1 Oct, from Codex's review), calibrated the same
 * day on the 25 published runtime worlds mid-run, three frames each: pure white
 * covers 0 to 2.8% of a frame, except Lantern Hour, whose lamps in physical
 * units blow 7 to 8.8% of it out; scenery leaves 73% or more of the player
 * showing (Mog Derby's smoke is the least); the player's colour stands 40 to
 * 210 from what is round it (of 441), down to 10 to 25 in a few frames of a
 * night race, a jungle and a near-black world. The brightness of the darkest
 * 5% (floor) runs 0 to 112 in worlds that look right, so it is measured and
 * not judged. Each line is a note for one repair, never a reason to hold a
 * world back.
 */
export type Look = { entropy: number; dominant: number; edges: number; contrast: number; mean: number;
  /** 1 Oct: the share of the frame that is pure white, the brightness of its darkest 5%, and the player: the share of the frame it fills, how much of it scenery leaves showing, and how far its colour stands from what is round it (0 to 441). */
  clipped?: number; floor?: number; player?: number; seen?: number; apart?: number };

export function isLook(v: unknown): v is Look {
  const o = v as Look;
  return !!o && ['entropy', 'dominant', 'edges', 'contrast', 'mean'].every((k) => Number.isFinite(Number((o as Record<string, unknown>)[k])));
}

/** Higher is a richer, readable frame: variety, detail, contrast, neither crushed nor blown out. */
export function lookScore(m: Look) {
  const dark = m.mean < 35 ? (35 - m.mean) / 8 : 0, blown = m.mean > 200 ? (m.mean - 200) / 8 : 0;
  // and the cover should show the player, clear of the scenery and of the background, without glare
  const glare = (m.clipped ?? 0) * 20, hidden = m.seen != null && m.seen < 0.5 ? (0.5 - m.seen) * 6 : 0, blend = m.apart != null && m.apart < 25 ? (25 - m.apart) / 25 : 0;
  return m.entropy + Math.min(m.edges, 0.35) * 10 + Math.min(m.contrast, 180) / 60 - m.dominant * 4 - dark - blown - glare - hidden - blend;
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
  if ((m.clipped ?? 0) > 0.05) out.push(`${Math.round((m.clipped ?? 0) * 100)}% of the test drive's view is blown out to pure white (the published worlds stay under 3%). Lamps are usually the cause: the runtime's lights are legacy units (a lamp 0.5 to 4, with a distance), so lower any light over 12, then the bloom or the exposure.`);
  if (m.seen != null && m.player != null && m.player > 0 && m.seen < 0.5) out.push(`Scenery hides ${Math.round((1 - m.seen) * 100)}% of the player from the chase camera. Keep tall props, walls and overhangs out of the space between the camera and the player's path, or make them low or see-through there.`);
  if (m.apart != null && m.player != null && m.player > 0 && m.apart < 25) out.push(`The player is hard to tell from what is round them (colour distance ${m.apart} of 441; most published worlds are 40 or more). Give the hero colours, a material or a rim light that stand out from the ground and scenery behind them.`);
  return out;
}
