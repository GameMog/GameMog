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
 *
 * The repair pass (5 Oct, the first Mog of AI Alps: "it was looking good the
 * first few passes, then the third pass screwed up the lightening to way
 * overexposed"). A world with no problems but a note goes back to the model
 * once, and that pass used to ship unchecked. Driven again on the local server,
 * the saloon with its original's light (moonlit, exposure 1) measures
 * brightness 76 to 83 and, in one drive of two, the player 14 from its
 * background (a note); as it shipped (golden, exposure 1.7, the sun at 2.8 and
 * the sky light at 1.5 indoors) it measures 155 to 156 with nothing pure white,
 * and scores higher (11.5 to 11.7 against 9.7 to 9.9): washed out is not blown
 * out by any line here, so a better score alone would have shipped it too. What
 * gives it away is the whole frame's light moving when no note asked for it.
 * The notes now give the runtime's ranges and say to change one thing, and
 * pickPass keeps the earlier pass when the repair made the world worse.
 *
 * Burnt heroes and washed key art (20 Oct, Magma Crown: "the thumbnail was overexposed", "B-Hot was
 * overexposed"). Pure white missed both: a hero burns out to a maxed channel or a near-white cream, not to 255,
 * 255, 255. Measured that day on the 16 first-party worlds, live Wonderwake and three Magma Crowns, mid-race,
 * three frames each, and from the kart key art's front camera: the share of the player that is burnt (a channel
 * over 250 or brightness over 230) runs 0 to 30% in every published world, a white whale on snow and neon
 * lightbikes included, and 62 to 64% in Magma Crown with the bloom it shipped with (0.85 over 1); the share of a
 * frame that is near-white (every channel over 217) runs to 29% in snow and ice worlds, so across a frame it is
 * measured and weighed lightly, never a note; in the key art's front view it runs 0 to 1.9% in every published
 * world and 7.8 to 11.2% in Magma Crown before its polish.
 */
export type Look = { entropy: number; dominant: number; edges: number; contrast: number; mean: number;
  /** 1 Oct: the share of the frame that is pure white, the brightness of its darkest 5%, and the player: the share of the frame it fills, how much of it scenery leaves showing, and how far its colour stands from what is round it (0 to 441). */
  clipped?: number; floor?: number; player?: number; seen?: number; apart?: number;
  /** 20 Oct: the share of the frame that is near-white (every channel over 217), and of the player, where it shows, that is burnt out (a channel over 250 or brightness over 230). */
  white?: number; burnt?: number };

/** 20 Oct: the lines (see above): a burnt hero mid-race, and a washed or burnt key art. */
export const BURNT = 0.45, ART_WHITE = 0.06;

export function isLook(v: unknown): v is Look {
  const o = v as Look;
  return !!o && ['entropy', 'dominant', 'edges', 'contrast', 'mean'].every((k) => Number.isFinite(Number((o as Record<string, unknown>)[k])));
}

/** Higher is a richer, readable frame: variety, detail, contrast, neither crushed nor blown out. */
export function lookScore(m: Look) {
  const dark = m.mean < 35 ? (35 - m.mean) / 8 : 0, blown = m.mean > 200 ? (m.mean - 200) / 8 : 0;
  // and the cover should show the player, clear of the scenery and of the background, without glare
  const glare = (m.clipped ?? 0) * 20, hidden = m.seen != null && m.seen < 0.5 ? (0.5 - m.seen) * 6 : 0, blend = m.apart != null && m.apart < 25 ? (25 - m.apart) / 25 : 0;
  // (20 Oct: a burnt hero weighs past the published worlds' 30%, a near-white wash past snow's 30%)
  const burn = Math.max(0, (m.burnt ?? 0) - 0.3) * 10, wash = Math.max(0, (m.white ?? 0) - 0.3) * 5;
  return m.entropy + Math.min(m.edges, 0.35) * 10 + Math.min(m.contrast, 180) / 60 - m.dominant * 4 - dark - blown - glare - hidden - blend - burn - wash;
}

/** What a note is about: the first four are the light (the exposure, the lights, fog and bloom), the rest what is in the frame. */
export type LookKind = 'dark' | 'blown' | 'murky' | 'glare' | 'burnt' | 'one-colour' | 'few-tones' | 'empty' | 'hidden' | 'blends';
export type LookNote = { kind: LookKind; text: string };

// 5 Oct: bounded, so a note is answered with a step and not a relight (lib/runtime/API.md: the lights are legacy units; the presets' own exposures are 0.95 to 1.1)
const RANGES = 'Change one thing, one step, within the runtime\'s ranges: exposure usually 0.8 to 1.3 and never above 1.5 (a graphics preset sets its own, so with one leave it out or near 1), a sun 2 to 4, a sky light (HemisphereLight) 0.4 to 1.5, a lamp 0.5 to 4 with a distance.';
const KEEP_LIGHT = 'Leave the graphics, the exposure and the lights as they are.';

/** The notes a world gets when its best frame still looks basic, each with what it is about. */
export function lookNotes(m: Look): LookNote[] {
  const out: LookNote[] = [];
  if (m.mean < 25) out.push({ kind: 'dark', text: `The test drive's view is nearly black (brightness ${m.mean} of 255; the published worlds are 40 to 155). Night can be dark, but the player, the path and the threats must read: a key light or moonlight with a direction, lit windows, lamps or emissive signs, or the exposure up by 0.2 or 0.3. ${RANGES}` });
  else if (m.mean > 205) out.push({ kind: 'blown', text: `The test drive's view is blown out (brightness ${m.mean} of 255; the published worlds are 40 to 155): lower the exposure, the brightest light, the fog's brightness or the bloom so forms and materials show. ${RANGES}` });
  if (m.dominant > 0.3) out.push({ kind: 'one-colour', text: `One colour covers ${Math.round(m.dominant * 100)}% of the test drive's view. Break it up: layer the scene (foreground props that frame the action, midground detail, a background skyline), and vary the ground and walls with scanned surfaces. ${KEEP_LIGHT}` });
  if (m.entropy < 4) out.push({ kind: 'few-tones', text: `The test drive's view has few distinct tones (${m.entropy} bits of colour variety; the published worlds have 5 to 6.7). Use real materials (scanned surfaces, roughness, wear), a photographed sky and more than one light colour (a second, coloured light within the runtime's ranges, not a brighter world).` });
  if (m.edges < 0.04) out.push({ kind: 'empty', text: `The test drive's view has little detail (edge density ${m.edges}; the published worlds have 0.058 or more). It reads as empty or primitive: add authored props, silhouettes and set dressing near the camera. ${KEEP_LIGHT}` });
  else if (m.contrast < 60) out.push({ kind: 'murky', text: `The test drive's view is murky (contrast ${m.contrast}): fog, darkness or bloom is flattening it. Thin the fog, add a key light with a direction, or lower the bloom, and let darks and lights separate. ${RANGES}` });
  if ((m.clipped ?? 0) > 0.05) out.push({ kind: 'glare', text: `${Math.round((m.clipped ?? 0) * 100)}% of the test drive's view is blown out to pure white (the published worlds stay under 3%). Lamps are usually the cause: the runtime's lights are legacy units, so bring any light over 12 into its range first, and only then, if it is still white, the bloom or the exposure. ${RANGES}` });
  if ((m.burnt ?? 0) > BURNT && m.player != null && m.player > 0) out.push({ kind: 'burnt', text: `${Math.round((m.burnt ?? 0) * 100)}% of the player is burnt out to white or a maxed colour (the published worlds stay under 30%). Bloom is the usual cause: keep the graphics preset's bloom, or a threshold of 1.3 or more, never a threshold of 1 with a stronger strength. Then the hero itself: its lightest materials (cream, ivory, white skin and paint) a step darker, and any glow on the hero under 1. ${RANGES}` });
  if (m.seen != null && m.player != null && m.player > 0 && m.seen < 0.5) out.push({ kind: 'hidden', text: `Scenery hides ${Math.round((1 - m.seen) * 100)}% of the player from the chase camera. Keep tall props, walls and overhangs out of the space between the camera and the player's path, or make them low or see-through there. ${KEEP_LIGHT}` });
  if (m.apart != null && m.player != null && m.player > 0 && m.apart < 25) out.push({ kind: 'blends', text: `The player is hard to tell from what is round them (colour distance ${m.apart} of 441; most published worlds are 40 or more). Change the hero, not the world's light: colours or a material on the hero that stand out from the ground and scenery behind them, or a rim light on the hero alone (a lamp of 0.5 to 2 with a distance of a few metres). ${KEEP_LIGHT}` });
  return out;
}

/** The notes a world gets when its best frame still looks basic, in words the model can act on. */
export function lookAdvisories(m: Look): string[] {
  return lookNotes(m).map((n) => n.text);
}

/**
 * How far the whole frame's brightness (of 255) may move in a repair that no
 * light note asked for. The same code driven twice moved 7 to 8 (5 Oct); the
 * published worlds span 40 to 155; the over-lit saloon moved 72 to 80.
 */
export const LIGHT_SHIFT = 40;
/** How much lower a repair may score and still ship: the same code driven twice scored up to 0.8 apart (5 Oct). */
export const SCORE_SLACK = 1;

/** A pass of a build as the choice sees it: its problems, its test drive's verdict, its best frame, and every note it got (the runtime's and the look's). */
export type Pass = { problems?: string[]; status?: string; look?: Look; notes?: string[] };
export type Pick = { keep: 'prev' | 'next'; why: string };

const SAID: Record<'dark' | 'blown' | 'murky' | 'glare' | 'burnt', string> = { dark: 'nearly black', blown: 'blown out', murky: 'murky', glare: 'glare white', burnt: 'burn the player out' };

/**
 * Which pass ships when the second (`next`) was written only to answer the
 * notes of the first (`prev`), a world that already passed: the repair, unless
 * it made the world worse. It is worse when it has problems, was not driven to
 * a pass, newly looks nearly black, blown out, murky or glare white, moved the
 * whole frame's light by more than LIGHT_SHIFT in a direction no note asked for
 * (only a dark or murky note asks for more light; only a blown, glare, murky
 * note or the runtime's light-units warning asks for less), scores more than
 * SCORE_SLACK lower, or ends with more notes than it was given. Pure, so the
 * build's choice is tested without a paid build (npm run check).
 */
export function pickPass(prev: Pass, next: Pass): Pick {
  if (next.problems?.length) return { keep: 'prev', why: `the repair broke the world: ${next.problems[0].slice(0, 160)}` };
  if (prev.status === 'passed' && next.status !== 'passed') return { keep: 'prev', why: next.status === 'failed' ? 'the repair failed its test drive' : 'the repair was never test-driven' };
  const a = prev.look, b = next.look;
  const before = a ? lookNotes(a).map((n) => n.kind) : [], after = b ? lookNotes(b).map((n) => n.kind) : [];
  if (a && b) {
    for (const k of ['blown', 'glare', 'burnt', 'dark', 'murky'] as const) {
      if (after.includes(k) && !before.includes(k)) return { keep: 'prev', why: `the repair made the view ${SAID[k]}` };
    }
    const lights = (prev.notes ?? []).some((s) => /legacy light units/i.test(s));
    const brighter = before.includes('dark') || before.includes('murky');
    const dimmer = before.includes('blown') || before.includes('glare') || before.includes('burnt') || before.includes('murky') || lights;
    const shift = b.mean - a.mean;
    if (shift > LIGHT_SHIFT && !brighter) return { keep: 'prev', why: `the repair brightened the whole view (${a.mean} to ${b.mean} of 255) when no note asked for more light` };
    if (shift < -LIGHT_SHIFT && !dimmer) return { keep: 'prev', why: `the repair darkened the whole view (${a.mean} to ${b.mean} of 255) when no note asked for less light` };
    const sa = lookScore(a), sb = lookScore(b);
    if (sb < sa - SCORE_SLACK) return { keep: 'prev', why: `the repair looks worse (score ${sa.toFixed(1)} to ${sb.toFixed(1)})` };
  }
  // notes are counted whole: the runtime's own and the look's
  const was = prev.notes ? prev.notes.length : before.length, now = next.notes ? next.notes.length : after.length;
  if (now > was) return { keep: 'prev', why: `the repair ended with more notes (${now}) than it was given (${was})` };
  return { keep: 'next', why: a && b ? `the repair looks no worse (brightness ${a.mean} to ${b.mean}, score ${lookScore(a).toFixed(1)} to ${lookScore(b).toFixed(1)})` : 'the repair passed and there was no frame to compare' };
}

/**
 * The key art (20 Oct): judged by the same measures, with its own lines (see the header). artBadness orders two
 * candidate shots (lower is better); artNote is the builder's note when even the better one is washed or burnt.
 * lib/runtime/drive.js keeps the same lines and the same order for the creator's browser.
 */
export function artBlown(m: Look | null | undefined) { return !!m && ((m.white ?? 0) > ART_WHITE || (m.burnt ?? 0) > BURNT); }
/** A second angle may replace the first only if it still shows the hero (at least half as large, half of it unhidden) and keeps the frame's detail: a less washed frame of a wall is no key art. */
export function artFair(first: Look, second: Look) {
  return (second.player ?? 0) >= 0.5 * (first.player ?? 0) && (second.seen ?? 1) >= 0.5 && second.entropy >= first.entropy - 0.5 && second.edges >= first.edges * 0.6;
}
export function artBadness(m: Look | null | undefined) { return m ? (m.white ?? 0) * 10 + Math.max(0, (m.burnt ?? 0) - 0.3) * 5 : 0; }
export function artNote(m: Look) {
  return `The key art (the hero from the front, as the thumbnail shows it) is washed out: ${Math.round((m.white ?? 0) * 100)}% of it near-white and ${Math.round((m.burnt ?? 0) * 100)}% of the hero burnt out (the published worlds stay under 2% and 30%). A low sun on the hero's front and pale materials are the usual cause: the hero's lightest materials (cream, ivory, white skin and paint) a step darker, any glow on the hero under 1, and the preset's bloom. ${RANGES}`;
}
