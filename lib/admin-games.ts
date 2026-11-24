import { db, playerStats, tileStats, voteCounts, type GameRow } from './db';
import { worldMode } from './custom-game';
import { isFirstParty } from './byline';
import { isStoryCity, storyCityName } from './storykit-site';
import { storyTownName } from './storykit-publish';

/**
 * The Games tab on the owner's admin dashboard (the owner, 23 Nov): every game, hidden ones too, with the numbers the
 * homepage and the game pages used to show the public before those came off them. Each figure comes from the very
 * function the public pages read, so the numbers match: plays is games.plays (the tile and the hero), players is
 * playerStats (the game page's Players), likes and dislikes are voteCounts (the game page's Likes and the tile's %),
 * Mogs is tileStats (the tile's and the hero's count: listed Mogs only, as mogsOf on the game page).
 */
export type AdminGame = {
  id: string; slug: string; title: string; plays: number; players: number; up: number; down: number; likePct: number | null;
  mogs: number; generation: number; parent: string | null; created_at: number; genre: string; mode: string; city: string | null;
  hidden: boolean; unlisted: boolean; firstParty: boolean;
};

type Row = GameRow & { hidden: number };

export function adminGames(): AdminGame[] {
  const rows = db.prepare(`SELECT id, slug, title, plays, created_at, format, code, meta, parent_id, generation, prompt, creator, hidden
    FROM games`).all() as unknown as Row[];
  const titles = new Map(rows.map((r) => [r.id, r.title]));
  const tiles = tileStats();
  const out = rows.map((g): AdminGame => {
    let meta: { genre?: unknown; unlisted?: unknown; storykit?: { city?: unknown } } = {};
    try { meta = JSON.parse(g.meta ?? '{}') ?? {}; } catch { /* a row with unreadable meta still lists */ }
    const votes = voteCounts(g.id), total = votes.up + votes.down;
    const storyCity = meta.storykit?.city;
    // (the city line the game page showed a story world: its city, or a hometown by name)
    const city = isStoryCity(storyCity) ? storyCityName(storyCity) : storyCity === 'hometown' ? storyTownName(g.meta) ?? 'A US town' : null;
    const mode = g.format === 'race' ? 'classic race' : g.format === 'custom' ? 'written game' : storyCity !== undefined ? 'story' : worldMode(g.code, g.meta);
    return {
      id: g.id, slug: g.slug, title: g.title, plays: g.plays, players: playerStats(g.id).players,
      up: votes.up, down: votes.down, likePct: total ? Math.round((votes.up / total) * 100) : null,
      mogs: tiles[g.id]?.mogs ?? 0, generation: g.generation, parent: g.parent_id ? titles.get(g.parent_id) ?? null : null,
      created_at: g.created_at, genre: g.format === 'race' ? 'Racing' : typeof meta.genre === 'string' ? meta.genre : '',
      mode, city, hidden: !!g.hidden, unlisted: !!g.hidden && meta.unlisted === 1, firstParty: isFirstParty(g),
    };
  });
  out.sort((a, b) => b.plays - a.plays || b.created_at - a.created_at);
  return out;
}
