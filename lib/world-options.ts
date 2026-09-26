/**
 * The creator's platform options for a world, chosen on Create and on Mog
 * (the owner, 26 Sep): obstacles each lap (fewer, the same or more) and
 * music (off, or a recorded track from the library). They are stored with
 * the world's meta, passed to the game page, and enforced by the runtime,
 * whatever the world's code says. A Mog starts from its parent's options.
 */
import { z } from 'zod';

export const HAZARDS = ['fewer', 'same', 'more'] as const;
export type Hazards = (typeof HAZARDS)[number];

/** Recorded tracks a creator can pick, all CC0, in the asset library. */
export const MUSIC_TRACKS = [
  { id: 'music-dance-field', label: 'Dance Field', style: 'Retro electro' },
] as const;
export type MusicTrack = (typeof MUSIC_TRACKS)[number]['id'];

export const WorldOptionsSchema = z.object({
  hazards: z.enum(HAZARDS).default('same'),
  music: z.string().nullable().default(null),
});
export type WorldOptions = { hazards: Hazards; music: MusicTrack | null };

export const DEFAULT_OPTIONS: WorldOptions = { hazards: 'same', music: null };

/** Anything in, a valid set of options out (unknown tracks become no music). */
export function readOptions(raw: unknown): WorldOptions {
  const p = WorldOptionsSchema.safeParse(raw ?? {});
  if (!p.success) return { ...DEFAULT_OPTIONS };
  const music = MUSIC_TRACKS.some((t) => t.id === p.data.music) ? (p.data.music as MusicTrack) : null;
  return { hazards: p.data.hazards, music };
}

/** What the builder is told about the creator's choices. */
export function optionsBrief(o: WorldOptions) {
  const hz = o.hazards === 'more'
    ? 'More: the runtime adds copies of your obstacles every lap (about 15% more a lap, up to double). Give the world a varied set of obstacles, so the copies read as a street filling up rather than the same prop repeated.'
    : o.hazards === 'fewer'
      ? 'Fewer: the runtime clears some of your obstacles every lap (about 10% a lap, down to a third). The course opens up as the pace rises.'
      : 'The same every lap.';
  const track = MUSIC_TRACKS.find((t) => t.id === o.music);
  const mu = track
    ? `On: the runtime plays the library track "${track.label}" (${track.style.toLowerCase()}), loud enough for the race and ducked under the effects. Do not compose or synthesise music yourself.`
    : 'Off. Do not compose or synthesise music: ambient() is for the world\'s own sounds (crowds, wind, surf, engines).';
  return `## The creator's platform options (the runtime enforces these; do not set them in play)\n\n- Obstacles each lap: ${hz}\n- Music: ${mu}`;
}

/**
 * A game's options, for a Mog to start from: the ones it was built with, or,
 * for a world written before options existed, what its own code asks for
 * (a library track in `music`, `play.hazards`).
 */
export function optionsOf(game: { meta?: string | null; code?: string | null }): WorldOptions {
  let meta: { options?: unknown } = {};
  try { meta = JSON.parse(game.meta ?? '{}'); } catch {}
  if (meta.options !== undefined) return readOptions(meta.options);
  const code = game.code ?? '';
  const track = /\bmusic\s*:\s*\{\s*track\s*:\s*['"]([a-z0-9-]+)['"]/.exec(code)?.[1] ?? null;
  const hazards = /\bhazards\s*:\s*['"](fewer|more)['"]/.exec(code)?.[1] ?? 'same';
  return readOptions({ hazards, music: track });
}
