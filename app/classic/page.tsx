import type { Metadata } from 'next';
import { SiteHeader, SiteFooter } from '../header';
import { Tile } from '../tile';
import { listGames, bestTimes, tileStats } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Classic | GameMog' };

/**
 * The race format from before the GameMog Runtime: three laps run to a beat,
 * no GM, no rival joining each lap. They keep their own rules, so they live
 * here rather than in the homepage's rankings of worlds that play by the
 * platform's.
 */
export default function Classic() {
  const classic = listGames(500).filter((g) => g.format === 'race').sort((a, b) => b.plays - a.plays);
  const best = bestTimes(), stats = tileStats();
  return (
    <>
      <SiteHeader on="Classic" />
      <main className="wrap" style={{ paddingTop: 24 }}>
        <h1>Classic</h1>
        <p className="cap" style={{ marginTop: 4 }}>
          The first GameMog races, from before the GameMog Runtime: three laps, run to the beat. They keep their own rules.
        </p>
        <section className="sec" style={{ marginTop: 18 }}>
          <div className="sechead">
            <h2>Most played</h2>
            <span className="t-meta dim">{classic.length} races</span>
          </div>
          {classic.length
            ? <div className="gridw">{classic.map((g, i) => <Tile key={g.id} g={g} i={i + 400} best={best[g.id]} stats={stats[g.id]} />)}</div>
            : <p className="dim">No Classic races are published.</p>}
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
