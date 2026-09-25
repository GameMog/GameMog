import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SiteFooter, SiteHeader } from '../../header';
import { GenreFilter } from '../../genre-filter';
import { Tile } from '../../tile';
import { bestTimes, listGames, tileStats } from '@/lib/db';
import { CHARTS, genreOf, sortGames, type ChartSort } from '@/lib/catalog';
import { pageMeta } from '../../seo';

export const dynamic = 'force-dynamic';
export async function generateMetadata({ params }: { params: Promise<{ sort: string }> }): Promise<Metadata> {
  const { sort } = await params;
  const chart = CHARTS[sort as ChartSort];
  if (!chart) return { title: 'Charts | GameMog' };
  return pageMeta({ name: chart.title, path: `/charts/${sort}`, description: `${chart.explanation} Play any of them free in your browser, then Mog the one you think you can beat.` });
}

export default async function ChartPage({ params, searchParams }: {
  params: Promise<{ sort: string }>;
  searchParams: Promise<{ genre?: string; q?: string }>;
}) {
  const { sort: raw } = await params;
  if (!(raw in CHARTS)) notFound();
  const sort = raw as ChartSort, chart = CHARTS[sort];
  const all = listGames(500), stats = tileStats(), best = bestTimes();
  const base = sortGames(all, sort, stats);
  const genres = [...new Set(base.map(genreOf))].sort();
  const query = await searchParams;
  const requested = query.genre;
  const genre = requested && genres.includes(requested) ? requested : 'All';
  const byGenre = genre === 'All' ? base : base.filter((g) => genreOf(g) === genre);
  const q = query.q?.trim().toLocaleLowerCase() ?? '';
  const games = q ? byGenre.filter((g) => `${g.title} ${g.tagline} ${genreOf(g)}`.toLocaleLowerCase().includes(q)) : byGenre;

  return (
    <>
      <SiteHeader on={sort === 'classic' ? 'Classic' : sort === 'new-mogs' ? 'Mogs' : sort === 'trending' ? 'Charts' : chart.title} />
      <main className="wrap chartpage">
        <div className="charthead">
          <h1>{chart.title}</h1>
          <p className="cap">{chart.caption ?? chart.explanation}</p>
          {genres.length > 1 && <GenreFilter genres={genres} value={genre} />}
        </div>
        {games.length
          ? <div className="gridw">{games.map((game, i) => <Tile key={game.id} g={game} i={i + 500} best={best[game.id]} stats={stats[game.id]} />)}</div>
          : <div className="empty"><h2>{q ? `No games match “${query.q?.trim()}”` : 'No games here yet'}</h2><p>Try another search or genre, or create the first one for this chart.</p></div>}
      </main>
      <SiteFooter />
    </>
  );
}
