/**
 * Who a game is by, everywhere it is said: the game page, the family page, a dare's page and card, link previews and
 * the charts' search (the owner, 7 Nov: Pickup Time read "By a GameMog creator"; "change it to By GameMog").
 *
 * A first-party world is GameMog's own and reads "By GameMog":
 *   - its creator is the platform: `games.creator` is "GameMog", which only a migration writes (lib/names.ts cleanName
 *     reserves the name, so no creator can give it at publish); deploy/migrate.mjs 2026-11-07-by-gamemog names every
 *     first-party world so;
 *   - a featured game (the owner's, as Classic's Muse Sprint);
 *   - a story world the repo ships: a showcase (meta.storykit.showcase, Pickup Time) or Mog City's own story
 *     (meta.storykit.own), never a Mog (a Mog is its creator's, whatever its parent).
 * Any other game reads "Created by <name>" when its creator named it, else "By a GameMog creator".
 * A stored creator that is a model's or its maker's name (Claude, Anthropic, AI: lib/names.ts isModelName, which
 * cleanName now refuses at publish) is never shown: it reads as an unnamed creator (16 Nov, Colter Land).
 */
import { isModelName } from './names';

export const PLATFORM = 'GameMog';

type Who = { creator?: string | null; featured?: number | null; meta?: string | null; parent_id?: string | null };

function shippedStory(meta: string | null | undefined): boolean {
  if (!meta) return false;
  try {
    const m = JSON.parse(meta) as { mode?: unknown; storykit?: { showcase?: unknown; own?: unknown } };
    return m?.mode === 'storykit' && (m.storykit?.showcase === true || m.storykit?.own === true);
  } catch { return false; }
}

/** Is this game GameMog's own (a first-party world)? */
export function isFirstParty(g: Who): boolean {
  if (g.creator === PLATFORM) return true;
  // (a Mog is its creator's, whatever its parent; only the repo's own migrations write a shipped story's meta, which
  // the builder never does, so Mog City's own story, written with creator "Mog City", is GameMog's too)
  if (g.parent_id) return false;
  if (shippedStory(g.meta)) return true;
  // (a creator's own name is never the platform's)
  return !g.creator?.trim() && !!g.featured;
}

/** A creator's name as it may be shown: trimmed, and null when empty or a model's name. */
export function shownCreator(creator: string | null | undefined): string | null {
  const c = creator?.trim();
  return c && (c === PLATFORM || !isModelName(c)) ? c : null;
}

/** The name a game is by: "GameMog" for a first-party world, its creator's name, or null (an unnamed creator). */
export function byName(g: Who): string | null {
  return isFirstParty(g) ? PLATFORM : shownCreator(g.creator);
}

/** The byline as words: "By GameMog", "Created by <name>" or "By a GameMog creator". */
export function bylineText(g: Who): string {
  if (isFirstParty(g)) return `By ${PLATFORM}`;
  const c = shownCreator(g.creator);
  return c ? `Created by ${c}` : 'By a GameMog creator';
}
