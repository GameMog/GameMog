/**
 * The creator's platform options for a world, chosen on Create and on Mog
 * (the owner, 26 Sep): obstacles each lap (fewer, the same or more) and
 * music (off, or a recorded track from the library; on a Mog of a game with
 * its own soundtrack, that soundtrack: 9 Oct). They are stored with the
 * world's meta, passed to the game page, and enforced by the runtime,
 * whatever the world's code says. A Mog starts from its parent's options.
 */
import { z } from 'zod';

export const HAZARDS = ['fewer', 'same', 'more'] as const;
export type Hazards = (typeof HAZARDS)[number];

/** Recorded tracks a creator can pick, all CC0, in the asset library. */
export const MUSIC_TRACKS = [
  { id: 'music-dance-field', label: 'Dance Field', style: 'Retro electro' },
  { id: 'music-funky-house', label: 'Funky House', style: 'Funky house' },
  { id: 'music-slampe', label: 'Slampe', style: 'Synthwave house' },
  { id: 'music-vengeance-electro', label: 'Vengeance Electro', style: 'Electro' },
  { id: 'music-liquid-flame', label: 'Liquid Flame', style: 'Electronic' },
  { id: 'music-retro-level', label: 'Retro Level', style: 'Chiptune' },
  { id: 'music-epic-boss-battle', label: 'Epic Boss Battle', style: 'Orchestral epic' },
  { id: 'music-old-tower-inn', label: 'The Old Tower Inn', style: 'Celtic folk' },
  { id: 'music-chill-lofi', label: 'Chill Lofi', style: 'Lo-fi hip-hop' },
  { id: 'music-gone-fishin', label: "Gone Fishin'", style: 'Bluegrass banjo' },
  { id: 'music-hyper-ultra-racing', label: 'Hyper Ultra-Racing', style: 'Drum and bass' },
  { id: 'music-shop-theme', label: 'Shop Theme', style: 'Bossa nova' },
  { id: 'music-unchained-destiny', label: 'Unchained Destiny', style: 'Driving rock' },
  { id: 'music-midnight-cruiser', label: 'Midnight Cruiser', style: 'Jazz-funk' },
  { id: 'music-spaghetti-western', label: 'Spaghetti Western', style: 'Western' },
] as const;
export type MusicTrack = (typeof MUSIC_TRACKS)[number]['id'];

/**
 * A game's own soundtrack (the owner, 9 Oct: on a Mog of a game with its own soundtrack, the music starts on
 * "Original soundtrack (Meme Kart theme)", with "No music" and the library's tracks beside it, and "the result matches
 * the choice"): what the game plays as its own, in the terms the runtime plays it by (lib/runtime/v1.js soundOf): a
 * kart race's theme (kart-music.js), a score the runtime composes from a world's `music` (Great Wall's taiko), or a
 * library track (Las Vegas's), with the name the Mog page gives it. Kept with the game as meta.soundtrack: written by
 * a migration for the first-party worlds (deploy/migrate.mjs), and at publish for a Mog that kept its original's.
 */
export type Soundtrack = { kart: true; label: string } | { music: Record<string, unknown>; label: string } | { track: string; label: string };

/** A soundtrack, read for what it must be wherever it came from (a page, a drive, the database), or null: one kind only, in the runtime's order (a track, a score, the kart theme), its name plain text. */
export function readSoundtrack(raw: unknown): Soundtrack | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const s = raw as Record<string, unknown>;
  const label = typeof s.label === 'string' ? s.label.replace(/[^\p{L}\p{N} .,:'&!?()-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 48) : '';
  if (typeof s.track === 'string') {
    // (any of the library's music, not only the tracks Create offers: the runtime plays only what the library has)
    if (!/^music-[a-z0-9-]{2,56}$/.test(s.track)) return null;
    return { track: s.track, label: MUSIC_TRACKS.find((t) => t.id === s.track)?.label ?? (label || s.track) };
  }
  if (s.music && typeof s.music === 'object' && !Array.isArray(s.music)) {
    // a score's options as the world wrote them (style, key, mode, tempo, seed: lib/runtime/music.js reads and bounds
    // each, all plain values); where it plays from (source) belongs to the world that places it, a track is not a score
    const music: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(s.music as Record<string, unknown>)) {
      if (k === 'source' || k === 'track' || !/^[A-Za-z]{1,16}$/.test(k)) continue;
      if (typeof v === 'string' ? v.length <= 60 && !/[<>]/.test(v) : typeof v === 'number' ? Number.isFinite(v) : typeof v === 'boolean' || v === null) music[k] = v;
    }
    if (Object.keys(music).length > 20) return null;
    return { music, label: label || 'Original score' };
  }
  if (s.kart === true) return { kart: true, label: label || 'Kart theme' };
  return null;
}
/** Which soundtrack it is, whatever it is called: the same key is the same music. */
export const soundtrackKey = (s: Soundtrack | null) => !s ? '' : 'track' in s ? `track:${s.track}` : 'music' in s ? `music:${JSON.stringify(s.music)}` : 'kart';

/**
 * The creator's music: the original's own soundtrack ('original', a Mog of a game that has one, played from
 * `soundtrack`), none ('none'), or a library track; null is no music as well, as it was for every world built before
 * 9 Oct.
 */
export type MusicChoice = MusicTrack | 'original' | 'none' | null;

export const WorldOptionsSchema = z.object({
  hazards: z.enum(HAZARDS).default('same'),
  music: z.string().nullable().default(null),
  // an open world (the owner, 27 Sep): roam a place and survive, not a lap race
  open: z.boolean().default(false),
  // GM in an open world (the owner, 1 Oct, for MogDune): off means no coins and no goal
  coins: z.boolean().default(true),
  // the original's soundtrack, with music 'original' (9 Oct): read by readSoundtrack
  soundtrack: z.unknown().optional(),
});
export type WorldOptions = { hazards: Hazards; music: MusicChoice; open: boolean; coins: boolean; soundtrack?: Soundtrack };

export const DEFAULT_OPTIONS: WorldOptions = { hazards: 'same', music: null, open: false, coins: true };

/**
 * Anything in, a valid set of options out (unknown tracks become no music). 'original' stands only with a soundtrack
 * to play (else no music), and only it carries one; a set stored before 9 Oct reads exactly as it did.
 */
export function readOptions(raw: unknown): WorldOptions {
  const p = WorldOptionsSchema.safeParse(raw ?? {});
  if (!p.success) return { ...DEFAULT_OPTIONS };
  const soundtrack = p.data.music === 'original' ? readSoundtrack(p.data.soundtrack) : null;
  const music: MusicChoice = soundtrack ? 'original' : p.data.music === 'none' ? 'none' : MUSIC_TRACKS.some((t) => t.id === p.data.music) ? (p.data.music as MusicTrack) : null;
  return { hazards: p.data.hazards, music, open: p.data.open, coins: p.data.coins, ...(soundtrack ? { soundtrack } : {}) };
}

/** What the builder is told about the creator's choices. */
export function optionsBrief(o: WorldOptions) {
  const hz = o.hazards === 'more'
    ? 'More: the runtime adds copies of your obstacles every lap (about 15% more a lap, up to double). Give the world a varied set of obstacles, so the copies read as a street filling up rather than the same prop repeated.'
    : o.hazards === 'fewer'
      ? 'Fewer: the runtime clears some of your obstacles every lap (about 10% a lap, down to a third). The course opens up as the pace rises.'
      : 'The same every lap.';
  const track = MUSIC_TRACKS.find((t) => t.id === o.music);
  // (9 Oct: the runtime plays the creator's choice whatever the code says, so the builder writes no music and takes
  // none out: a Mog's code keeps what its original has, and the choice is the platform's either way)
  const theirs = 'The music is the platform\'s for this build: do not compose or synthesise music, and do not remove or change any music code the world already has (its music, its kart score).';
  const mu = o.music === 'original' && o.soundtrack
    ? `The original's own soundtrack (${o.soundtrack.label}): the runtime plays it, whatever this world's code says. ${theirs}`
    : track
      ? `On: the runtime plays the library track "${track.label}" (${track.style.toLowerCase()}), loud enough for the race and ducked under the effects. ${theirs}`
      : `Off. ${theirs} ambient() is for the world's own sounds (crowds, wind, surf, engines).`;
  const story = o.coins
    ? `Give it a story: an intro that sets up the hero and the mission, a 'goal' (10,000 GM unless the creator names an amount) and an outro where the hero gets what the GM was for.`
    : `- GM: off. There is no GM in this world: no coins, no goal, no outro and no 'hud.gm' (the runtime drops none and shows none). The run is survival: it ends when the hero goes down, and the board ranks the time survived, then the takedowns. Give it a story all the same: an intro that sets up the hero, the place and why they fight on.`;
  if (o.open) return `## The creator's platform options (the runtime enforces these; do not set them in play)\n\n- Open world: on. Write an open world, not a lap race: follow the "Open worlds" section (GameMog.world({ open: {...}, player, build }), no track, rival() or obstacles()). Give it a place worth roaming, the whole crew (the four kinds: thug, biker, cop, boss) as whatever belongs there and whatever the creator asks for: people in looks that fit, or creatures with a 'body' and a 'ranged' shot when the creator asks for aliens, monsters, robots or animals. ${o.coins ? story + ' ' : ''}And a hero who stands out.\n${o.coins ? '' : story + '\n'}- Music: ${mu}`;
  return `## The creator's platform options (the runtime enforces these; do not set them in play)\n\n- Obstacles each lap: ${hz}\n- Music: ${mu}`;
}

/**
 * A game's options, for a Mog to start from: the ones it was built with, or,
 * for a world written before options existed, what its own code asks for
 * (a library track in `music`, `play.hazards`). A game with a soundtrack of
 * its own (meta.soundtrack, 9 Oct) starts its Mog on it: kept unless the
 * challenger removes it or picks a library track instead.
 */
export function optionsOf(game: { meta?: string | null; code?: string | null }): WorldOptions {
  let meta: { options?: unknown; soundtrack?: unknown } = {};
  try { meta = JSON.parse(game.meta ?? '{}') ?? {}; } catch {}
  // (only a soundtrack the game itself plays is offered: its options' copy of one goes with it)
  const soundtrack = readSoundtrack(meta.soundtrack);
  const own = ({ soundtrack: _o, ...o }: WorldOptions): WorldOptions => soundtrack ? { ...o, music: 'original', soundtrack } : o.music === 'original' ? { ...o, music: null } : o;
  if (meta.options !== undefined) {
    const o = readOptions(meta.options);
    // a world written before the option existed may still be an open world
    return own(/\bopen\s*:\s*\{/.test(game.code ?? '') ? { ...o, open: true } : o);
  }
  const code = game.code ?? '';
  const track = /\bmusic\s*:\s*\{\s*track\s*:\s*['"]([a-z0-9-]+)['"]/.exec(code)?.[1] ?? null;
  const hazards = /\bhazards\s*:\s*['"](fewer|more)['"]/.exec(code)?.[1] ?? 'same';
  return own(readOptions({ hazards, music: track, open: /\bopen\s*:\s*\{/.test(code), coins: !/\bcoins\s*:\s*false/.test(code) || !/\bopen\s*:\s*\{/.test(code) }));
}

/**
 * What a draft publishes as its own soundtrack (9 Oct). Only a Mog that kept its original's has one, and it is the
 * original's as the database has it, never what the page sent: stored with the Mog (meta.soundtrack, so a Mog of the
 * Mog offers it too) and in its options, which the runtime plays. Only when the Mog plays it: as the test drive of
 * exactly this code heard the runtime (lib/runtime/drive.js reports the world's own soundtrack), or, with no such
 * drive, by the one thing that can stop it, read from the code and never run: a kart theme plays only in a kart race.
 * A Mog that would not play it, or whose original has none to keep any more, publishes with no music, which is what
 * it plays. `parentMeta`: the original's games row meta; `kart`: lib/custom-game.ts isKartWorld(code); `drive`: the
 * drive's report when it ran this code and says what it heard (else null). No options back: the draft's stand.
 */
export function publishedSoundtrack(x: { options: unknown; parentMeta: string | null | undefined; kart: boolean; drive: { soundtrack?: unknown } | null }): { options?: WorldOptions; soundtrack: Soundtrack | null } {
  if (x.options === undefined) return { soundtrack: null };
  const o = readOptions(x.options);
  if (o.music !== 'original') return { soundtrack: null };
  let pm: { soundtrack?: unknown } | null = null;
  try { pm = JSON.parse(x.parentMeta ?? 'null'); } catch { pm = null; }
  const theirs = readSoundtrack(pm && typeof pm === 'object' ? pm.soundtrack : null);
  const { soundtrack: _sent, ...rest } = o;
  const plays = !!theirs && (x.drive ? soundtrackKey(readSoundtrack(x.drive.soundtrack)) === soundtrackKey(theirs) : !('kart' in theirs) || x.kart);
  return plays ? { options: { ...rest, soundtrack: theirs! }, soundtrack: theirs } : { options: { ...rest, music: null }, soundtrack: null };
}
