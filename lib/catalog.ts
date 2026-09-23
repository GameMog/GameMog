import type { GameRow, TileStats } from './db';

export type ChartSort = 'trending' | 'up-and-coming' | 'top-rated' | 'most-mogged' | 'new-mogs' | 'classic';

export const CHARTS: Record<ChartSort, { title: string; explanation: string; caption?: string }> = {
  trending: { title: 'Top Trending', explanation: 'Worlds ranked by real plays.' },
  'up-and-coming': { title: 'Up-and-Coming', explanation: 'The newest worlds gaining an audience.', caption: 'Fresh worlds from GameMog creators.' },
  'top-rated': { title: 'Top Rated', explanation: 'Worlds ranked by the share of positive player votes.' },
  'most-mogged': { title: 'Most Mogged', explanation: 'Worlds with the most published challenges.' },
  'new-mogs': { title: 'New Mogs', explanation: 'The latest variations challenging another game.', caption: 'New branches in existing game families.' },
  classic: { title: 'Classic', explanation: 'The original three-lap GameMog races.' },
};

export function genreOf(game: GameRow) {
  if (game.format === 'race') return 'Classic';
  try {
    const meta = game.meta ? JSON.parse(game.meta) as { genre?: unknown } : null;
    return typeof meta?.genre === 'string' && meta.genre.trim() ? meta.genre.trim() : 'Other';
  } catch { return 'Other'; }
}

export function sortGames(games: GameRow[], sort: ChartSort, stats: Record<string, TileStats>) {
  const rated = (g: GameRow) => {
    const s = stats[g.id], n = (s?.up ?? 0) + (s?.down ?? 0);
    return n ? (s?.up ?? 0) / n : -1;
  };
  const out = games.filter((g) => sort === 'classic' ? g.format === 'race' : g.format !== 'race');
  if (sort === 'new-mogs') return out.filter((g) => g.parent_id).sort((a, b) => b.created_at - a.created_at);
  if (sort === 'up-and-coming') return out.sort((a, b) => b.created_at - a.created_at);
  if (sort === 'top-rated') return out.sort((a, b) => rated(b) - rated(a) || b.plays - a.plays);
  if (sort === 'most-mogged') return out.sort((a, b) => (stats[b.id]?.mogs ?? 0) - (stats[a.id]?.mogs ?? 0) || b.plays - a.plays);
  return out.sort((a, b) => b.plays - a.plays || b.created_at - a.created_at);
}
