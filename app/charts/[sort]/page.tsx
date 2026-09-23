import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SiteFooter, SiteHeader } from '../../header';
import { GenreFilter } from '../../genre-filter';
import { Tile } from '../../tile';
import { bestTimes, listGames, tileStats } from '@/lib/db';
import { CHARTS, genreOf, sortGames, type ChartSort } from '@/lib/catalog';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Charts | GameMog' };

export default async function ChartPage({ params, searchParams }: {
  params: Promise<{ sort: string }>;
  searchParams: Promise<{ genre?: string }>;
}) {
  const { sort: raw } = await params;
  if (!(raw in CHARTS)) notFound();
  const sort = raw as ChartSort, chart = CHARTS[sort];
  const all = listGames(500), stats = tileStats(), best = bestTimes();
  const base = sortGames(all, sort, stats);
  const genres = [...new Set(base.map(genreOf))].sort();
  const requested = (await searchParams).genre;
  const genre = requested && genres.includes(requested) ? requested : 'All';
  const games = genre === 'All' ? base : base.filter((g) => genreOf(g) === genre);

  return (
    <>
      <SiteHeader on={sort === 'classic' ? '' : sort === 'new-mogs' ? 'Mogs' : 'Charts'} />
      <main className="wrap chartpage">
        <div className="charthead">
          <div><h1>{chart.title}</h1><p className="cap">{chart.explanation}</p></div>
          {genres.length > 1 && <GenreFilter genres={genres} value={genre} />}
        </div>
        {games.length
          ? <div className="gridw">{games.map((game, i) => <Tile key={game.id} g={game} i={i + 500} best={best[game.id]} stats={stats[game.id]} />)}</div>
          : <div className="empty"><h2>No games here yet</h2><p>Try another genre, or create the first one for this chart.</p></div>}
      </main>
      <SiteFooter />
    </>
  );
}
