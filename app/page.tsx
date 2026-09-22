import Link from 'next/link';
import { SiteHeader, SiteFooter, Icon } from './header';
import { Tile } from './tile';
import { Cover } from './cover';
import { HeroStage } from './hero-stage';
import { listGames, bestTimes, topScores, type GameRow } from '@/lib/db';
import { playtest } from '@/lib/playtest';
import type { WorldSpec } from '@/lib/worldspec';

export const dynamic = 'force-dynamic';

function Rail({ title, sub, id, games, best }: {
  title: string; sub?: string; id?: string; games: GameRow[]; best: Record<string, number>;
}) {
  if (!games.length) return null;
  return (
    <section className="sec" id={id}>
      <div className="sechead">
        <div>
          <h2 className="t-lg">{title}</h2>
          {sub && <p>{sub}</p>}
        </div>
        <Link href="#all" className="more">See all</Link>
      </div>
      <div className="rail">
        {games.map((g, i) => <Tile key={g.id} g={g} i={i} best={best[g.id]} />)}
      </div>
    </section>
  );
}

function Feature({ g, tall, tag, seed }: { g: GameRow; tall?: boolean; tag: string; seed: number }) {
  const spec = JSON.parse(g.spec) as WorldSpec;
  return (
    <Link href={`/g/${g.slug}`} className={`fcard${tall ? ' tall' : ''}`}>
      <span className="tag">{tag}</span>
      <div className="art"><Cover spec={spec} seed={seed} wide={!tall} /></div>
      <div className="ov">
        <h3>{g.title}</h3>
        <p>{g.tagline}</p>
      </div>
    </Link>
  );
}

export default function Home() {
  const games = listGames(120);
  const best = bestTimes();
  if (!games.length) {
    return (
      <>
        <SiteHeader />
        <main className="wrap" style={{ paddingTop: 40 }}>
          <div className="well"><h1 className="t-lg">Nothing published yet</h1>
            <p className="dim" style={{ marginTop: 6 }}>Run <code>npm run seed</code>, or <Link href="/create" style={{ color: 'var(--accent)' }}>make the first world</Link>.</p>
          </div>
        </main>
      </>
    );
  }

  const featured = games.find((g) => g.featured) ?? games[0];
  const fSpec = JSON.parse(featured.spec) as WorldSpec;
  const fStats = playtest(fSpec).stats;
  const fBest = topScores(featured.id, 1)[0];
  const newest = [...games].sort((a, b) => b.created_at - a.created_at);
  const played = [...games].sort((a, b) => b.plays - a.plays);
  const promo = newest.filter((g) => g.id !== featured.id).slice(0, 3);

  return (
    <>
      <SiteHeader />
      <main className="wrap" style={{ paddingTop: 16 }}>
        {/* The flagship runs live in the hero rather than sitting as a still.
            It is the whole pitch: this is a real game, playing, right now. */}
        <section className="hero">
          <HeroStage
            slug={featured.slug}
            gameId={featured.id}
            poster={<Cover spec={fSpec} seed={500} wide />}
          />
          <div className="side">
            <div>
              <h1>{featured.title}</h1>
              <p className="by">Flagship world · <b>one engine, every world</b></p>
            </div>
            <p style={{ fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.55 }}>{featured.tagline}</p>
            <Link href={`/g/${featured.slug}`} className="btn play">
              <Icon name="play" size={17} />Play
            </Link>
            <div className="facts">
              <div><b>{featured.plays}</b><span>plays</span></div>
              <div><b>{fBest ? (fBest.time_ms / 1000).toFixed(1) + 's' : '—'}</b><span>record</span></div>
              <div><b>{Math.round(fStats.lapMetres)}m</b><span>lap</span></div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <span className="chip">{fSpec.racers.length} racers</span>
              <span className="chip">3 laps</span>
              <span className="chip">{fSpec.difficulty}</span>
            </div>
          </div>
        </section>

        {promo.length > 0 && (
          <div className="feat" style={{ marginTop: 22 }}>
            <Feature g={promo[0]} tag="NEW" seed={900} />
            {promo[1] && <Feature g={promo[1]} tall tag="NEW" seed={901} />}
            {promo[2] && <Feature g={promo[2]} tall tag="NEW" seed={902} />}
          </div>
        )}

        <Rail title="Most played" sub="What people are actually running" id="played" games={played.slice(0, 14)} best={best} />
        <Rail title="New worlds" sub="Published in the last few days" id="new" games={newest.slice(0, 14)} best={best} />

        <section className="sec" id="all">
          <div className="sechead">
            <div>
              <h2 className="t-lg">All worlds</h2>
              <p>{games.length} published · one engine · every one playtested</p>
            </div>
            <span className="chip"><Icon name="time" />Racing</span>
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
