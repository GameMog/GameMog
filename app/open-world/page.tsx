import Link from 'next/link';
import { SiteFooter, SiteHeader } from '../header';
import { Tile } from '../tile';
import { bestTimes, listGames, tileStats } from '@/lib/db';
import { isOpenWorld } from '@/lib/custom-game';
import { sortGames } from '@/lib/catalog';
import { pageMeta } from '../seo';

export const dynamic = 'force-dynamic';
export const metadata = pageMeta({
  name: 'Open World',
  path: '/open-world',
  description: 'Open worlds on GameMog: roam a place instead of racing a lap, fight whoever comes for you, and survive as the heat rises. Play free in your browser, then Mog one.',
});

/**
 * The Open World category (the owner, 27 Sep): worlds you roam rather than
 * race, their own rules (lib/runtime/open.js), ranked by the time survived.
 */
export default function OpenWorldPage() {
  const all = listGames(500), stats = tileStats(), best = bestTimes();
  const games = sortGames(all.filter((g) => g.format === 'world' && isOpenWorld(g.code ?? undefined)), 'trending', stats);
  return (
    <>
      <SiteHeader on="Open World" />
      <main className="wrap chartpage">
        <div className="charthead">
          <h1>Open World</h1>
          <p className="cap">Roam a place instead of racing a lap. Whoever comes for you, knock them out and take their GM; the heat rises the longer you last. Ranked by the time you survive.</p>
        </div>
        {games.length
          ? <div className="gridw">{games.map((game, i) => <Tile key={game.id} g={game} i={i + 700} best={best[game.id]} stats={stats[game.id]} />)}</div>
          : <div className="empty"><h2>No open worlds yet</h2><p><Link href="/create">Create the first one</Link>.</p></div>}
      </main>
      <SiteFooter />
    </>
  );
}
