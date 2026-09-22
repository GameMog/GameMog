import Link from 'next/link';
import { SiteHeader, SiteFooter, Icon } from './header';
import { Tile } from './tile';
import { Cover } from './cover';
import { HeroStage } from './hero-stage';
import { Rail as Shelf } from './rail';
import { listGames, bestTimes, topScores, type GameRow } from '@/lib/db';
import { playtest } from '@/lib/playtest';
import type { WorldSpec } from '@/lib/worldspec';

export const dynamic = 'force-dynamic';

/**
 * A heading, a "See all", and a row of identical tiles. That is the entire
 * unit a games catalogue is built from, repeated. There is no promo card, no
 * two-up feature block and no ragged grid, because a shelf that changes shape
 * every section reads as a landing page rather than a catalogue.
 */
function Rail({ title, id, games, best, seed }: {
  title: string; id?: string; games: GameRow[]; best: Record<string, number>; seed: number;
}) {
  if (!games.length) return null;
  return (
    <section className="sec" id={id}>
      <div className="sechead">
        <h2>{title}</h2>
        <Link href="#all" className="more">See all</Link>
      </div>
      <Shelf>
        {games.map((g, i) => <Tile key={g.id} g={g} i={seed + i} best={best[g.id]} />)}
      </Shelf>
    </section>
  );
}

export default function Home() {
  const games = listGames(120);
  const best = bestTimes();

  if (!games.length) {
    return (
      <>
        <SiteHeader />
        <main className="wrap" style={{ paddingTop: 24 }}>
          <h1>Charts</h1>
          <p className="dim" style={{ marginTop: 8 }}>
            Nothing published yet. Run <code>npm run seed</code>, or{' '}
            <Link href="/create" style={{ color: 'var(--blue)', fontWeight: 500 }}>make the first world</Link>.
          </p>
        </main>
        <SiteFooter />
      </>
    );
  }

  const featured = games.find((g) => g.featured) ?? games[0];
  const fSpec = JSON.parse(featured.spec) as WorldSpec;
  const fStats = playtest(fSpec).stats;
  const fBest = topScores(featured.id, 1)[0];
  const newest = [...games].sort((a, b) => b.created_at - a.created_at);
  const played = [...games].sort((a, b) => b.plays - a.plays);

  return (
    <>
      <SiteHeader on="Charts" />
      <main className="wrap" style={{ paddingTop: 24 }}>
        <h1>Charts</h1>

        <div style={{ display: 'flex', gap: 8, margin: '6px 0 18px', flexWrap: 'wrap' }}>
          <span className="pill">Racing</span>
          <span className="pill off">Obstacle</span>
          <span className="pill off">Collecting</span>
          <span className="pill off">Survival</span>
        </div>

        {/* The flagship is running, not pictured. A catalogue of playable games
            that leads with a screenshot is arguing against itself. */}
        <section>
          <div className="sechead"><h2>Playing now</h2></div>
          <div className="hero">
            <HeroStage
              slug={featured.slug}
              gameId={featured.id}
              poster={<Cover spec={fSpec} seed={500} wide />}
            />
            <div className="side">
              <h1 style={{ fontSize: 28, lineHeight: '36px' }}>{featured.title}</h1>
              <p className="by">Flagship world by <b>GameMog</b></p>
              <p className="dim" style={{ fontSize: 16, lineHeight: 1.5 }}>{featured.tagline}</p>
              <Link href={`/g/${featured.slug}`} className="btn cta">
                <Icon name="play" size={15} />Play
              </Link>
              <div className="facts">
                <div><b>{featured.plays}</b><span>plays</span></div>
                <div><b>{fBest ? (fBest.time_ms / 1000).toFixed(1) + 's' : 'none yet'}</b><span>record</span></div>
                <div><b>{Math.round(fStats.lapMetres)}m</b><span>lap</span></div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <span className="tag">{fSpec.racers.length} racers</span>
                <span className="tag">3 laps</span>
                <span className="tag">{fSpec.difficulty}</span>
              </div>
            </div>
          </div>
        </section>

        <Rail title="Top playing now" id="played" games={played.slice(0, 16)} best={best} seed={0} />
        <Rail title="Up and coming" id="new" games={newest.slice(0, 16)} best={best} seed={40} />

        <section className="sec" id="all">
          <div className="sechead">
            <h2>All worlds</h2>
            <span className="t-meta dim">{games.length} published, every one playtested</span>
          </div>
          <div className="gridw">
            {games.map((g, i) => <Tile key={g.id} g={g} i={i + 200} best={best[g.id]} />)}
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
