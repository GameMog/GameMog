import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SiteHeader, SiteFooter, Icon } from '../../header';
import { Tile } from '../../tile';
import { getGameBySlug, topScores, listGames, bestTimes } from '@/lib/db';
import { playtest } from '@/lib/playtest';
import type { WorldSpec } from '@/lib/worldspec';
import { PlayFrame } from './play-frame';
import { Tabs } from './tabs';
import { Rail as Shelf } from '../../rail';

export const dynamic = 'force-dynamic';

/**
 * Laid out the way Roblox lays out a game: the media fills the left, and the
 * title, byline, one large primary action and the counters sit in a fixed
 * 330px column on the right. Everything else goes below a tab bar.
 */
export default async function GamePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const game = getGameBySlug(slug);
  if (!game) notFound();

  const spec = JSON.parse(game.spec) as WorldSpec;
  const scores = topScores(game.id);
  const { stats } = playtest(spec);
  const best = bestTimes();
  const others = listGames(30).filter((g) => g.id !== game.id).slice(0, 16);
  const me = spec.racers.find((r) => r.you);

  const leaderboard = scores.length ? (
    <table className="bd">
      <thead><tr><th /><th>Runner</th><th>Time</th><th>Place</th><th>Locks</th><th>Tempo</th></tr></thead>
      <tbody>
        {scores.map((s, i) => (
          <tr key={s.id}>
            <td>{i + 1}</td><td>{s.player}</td>
            <td>{(s.time_ms / 1000).toFixed(2)}s</td><td>{s.place}</td>
            <td>{s.locks}</td><td>{s.tempo_reached}</td>
          </tr>
        ))}
      </tbody>
    </table>
  ) : <p className="dim">No times yet. Finish a race and yours lands here.</p>;

  return (
    <>
      <SiteHeader on="Charts" />
      <main className="wrap" style={{ paddingTop: 20 }}>
        <p className="t-meta dim-2" style={{ marginBottom: 10 }}>
          <Link href="/">Charts</Link> <span style={{ opacity: .5 }}>/</span>{' '}
          <Link href="/?f=race">Racing</Link> <span style={{ opacity: .5 }}>/</span>{' '}
          <span className="dim">{game.title}</span>
        </p>

        <div style={{ display: 'grid', gap: 0, gridTemplateColumns: 'minmax(0,1fr) 330px' }} className="gamelayout">
          <PlayFrame slug={game.slug} gameId={game.id} />

          <aside style={{ padding: '0 12px 0 18px', display: 'grid', gap: 12, alignContent: 'start' }}>
            <div>
              <h1>{game.title}</h1>
              <p className="by dim">
                Built on the GameMog engine
              </p>
            </div>
            <p className="dim" style={{ fontSize: 16, lineHeight: 1.5 }}>{game.tagline}</p>

            <a href="#play" className="btn cta"><Icon name="play" size={15} />Play</a>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <Link href={`/create?remix=${game.slug}`} className="btn outline wide">Remix</Link>
              <a href={`/g/${game.slug}/play`} target="_blank" rel="noreferrer" className="btn outline wide">Full screen</a>
            </div>

            <div className="facts" style={{ marginTop: 4 }}>
              <div><b>{game.plays}</b><span>plays</span></div>
              <div>
                <b>{scores[0] ? (scores[0].time_ms / 1000).toFixed(2) + 's' : 'unbeaten'}</b>
                <span>record</span>
              </div>
              <div><b>{spec.racers.length}</b><span>racers</span></div>
            </div>
          </aside>
        </div>

        <Tabs
          panels={[
            {
              label: 'About',
              body: (
                <div style={{ maxWidth: 720 }}>
                  <p style={{ fontSize: 16, lineHeight: 1.6, color: 'var(--ink-2)' }}>{game.blurb}</p>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 14 }}>
                    <span className="tag">{spec.difficulty}</span>
                    <span className="tag">{Math.round(stats.lapMetres)}m lap</span>
                    <span className="tag">3 laps</span>
                    <span className="tag">about {Math.round(stats.estRaceSeconds)}s</span>
                    {me?.rig?.topper !== 'none' && <span className="tag">{me?.rig?.topper}</span>}
                  </div>
                  <dl style={{ marginTop: 18, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 20px', fontSize: 14 }}>
                    <dt className="dim-2">Format</dt><dd>Rhythm race, tap to stride</dd>
                    <dt className="dim-2">Controls</dt><dd>Space, or tap the screen</dd>
                    <dt className="dim-2">Scene budget</dt><dd>{stats.propBudget}</dd>
                  </dl>
                </div>
              ),
            },
            { label: `Leaderboard${scores.length ? ` (${scores.length})` : ''}`, body: leaderboard },
            {
              label: 'The field',
              body: (
                <div style={{ display: 'grid', gap: 8, maxWidth: 420 }}>
                  {spec.racers.map((r) => (
                    <div key={r.name} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 16 }}>
                      <i style={{ width: 18, height: 18, borderRadius: 4, background: r.fur, border: '1px solid var(--line)', flex: '0 0 auto' }} />
                      <span style={{ flex: 1, fontWeight: r.you ? 700 : 400 }}>{r.name}</span>
                      {r.rig?.topper !== 'none' && <span className="t-meta dim-2">{r.rig?.topper}</span>}
                      {r.you && <span className="tag solid">you</span>}
                    </div>
                  ))}
                </div>
              ),
            },
          ]}
        />

        {others.length > 0 && (
          <section className="sec">
            <div className="sechead"><h2>More worlds</h2><Link href="/" className="more">See all</Link></div>
            <Shelf>{others.map((g, i) => <Tile key={g.id} g={g} i={i + 40} best={best[g.id]} />)}</Shelf>
          </section>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
