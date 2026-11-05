import { db, type GameRow } from './db';
import { isEpisodeWorld } from './episode';
import { isStoryParent, storyParentPack } from './storykit-build';
import { storykitLive } from './storykit-switch';

/**
 * A Mog of Mog City (5 Nov 2026): /g/mog-city is the 3 Nov episode (a Mog City story pack as its world module, played
 * from mc.gamemog.com) and it plays exactly as it did. Only its Mog changed: a Mog of /g/mog-city is a Story Kit Mog of
 * Mog City's OWN story world, the V2 pack storykit/packs/mog-city.json moved to Mog City's engine (gate.ts mogBase) and
 * gated with { own: true } (the one world whose title may be Mog City's), published by deploy/migrate.mjs
 * (2026-11-05-mog-city-own-story; scripts/storykit-own-world.ts does the same on a dev database).
 *
 * The own world has no public page: its row is hidden (not unlisted), so it is in no list, feed, search, sitemap or
 * board, and /g/<its slug> answers only the owner's session. Its meta names the episode it stands behind
 * (meta.storykit.ownOf, the /g/mog-city game's id). The build reads it as the Mog's parent (its pack, its city lock,
 * its kept store draft's files), while the published Mog's lineage is /g/mog-city's: its parent_id is the episode's,
 * so it shows in /g/mog-city's Mogs tab and family tree.
 */

/** The slug of the first-party Mog City episode (deploy/migrate.mjs 2026-11-03-mog-city). */
export const MOG_CITY_SLUG = 'mog-city';
/** The slug the own story world is published at (hidden: no public page). */
export const MOG_CITY_STORY_SLUG = 'mog-city-story';

const COLS = 'id, slug, title, tagline, blurb, difficulty, spec, prompt, featured, plays, created_at, format, code, meta, parent_id, root_id, generation, mog_prompt, creator';

/** Whether a game is the /g/mog-city episode (the game whose Mog is the own story world's). */
export function isMogCityEpisode(game: { slug: string; format: string; code?: string | null } | null | undefined): boolean {
  return !!game && game.slug === MOG_CITY_SLUG && game.format === 'world' && isEpisodeWorld(game.code);
}

/**
 * The published own story world that Mogs of /g/mog-city remix: hidden, a story world (meta mode 'storykit') with
 * meta.storykit.own set and meta.storykit.ownOf the episode's id, and its kept store draft readable (storyParentPack).
 * Undefined when the Story Kit is off on this server, when there is no episode at /g/mog-city, or no such world: the
 * Mog of /g/mog-city then stays MOG Soon, as before.
 */
export function mogCityStoryParent(): GameRow | undefined {
  if (!storykitLive()) return undefined;
  try {
    const ep = db.prepare(`SELECT ${COLS} FROM games WHERE slug = ? AND hidden = 0`).get(MOG_CITY_SLUG) as GameRow | undefined;
    if (!isMogCityEpisode(ep)) return undefined;
    const rows = db.prepare(`SELECT ${COLS} FROM games WHERE json_extract(meta, '$.mode') = 'storykit' AND json_extract(meta, '$.storykit.own') = 1
      AND json_extract(meta, '$.storykit.ownOf') = ? ORDER BY created_at DESC`).all(ep!.id) as GameRow[];
    return rows.find((g) => isStoryParent(g) && !!storyParentPack(g)?.store);
  } catch { return undefined; }
}
