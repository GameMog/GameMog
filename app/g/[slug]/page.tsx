import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SiteHeader, SiteFooter } from '../../header';
import { Tile } from '../../tile';
import { Cover } from '../../cover';
import { getGameBySlug, topScores, listGames, bestTimes, voteCounts } from '@/lib/db';
import { playtest } from '@/lib/playtest';
import { LADDERS } from '@/lib/worldspec';
import type { WorldSpec } from '@/lib/worldspec';
import { PlayFrame } from './play-frame';
import { GameActions } from './actions';
import { Tabs } from './tabs';
import { Rail as Shelf } from '../../rail';
import { CustomGamePage } from './custom-page';
import { Lineage, MogsPanel } from './mog';
import { mogsOf, tileStats } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Laid out on Roblox's game page grid, measured: a 970px column centred on the
 * page, 640px of media on the left, a 330px column on the right holding the
 * title, byline and one large play button over the Favorite / Like / Dislike
 * row, and everything else below a full-width tab bar. The page used to run
 * edge to edge, which made the media 1060px wide and the tabs span the screen.
 */
export default async function GamePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const game = getGameBySlug(slug);
  if (!game) notFound();
  if (game.format === 'custom' || game.format === 'world') return <CustomGamePage game={game} />;

  const spec = JSON.parse(game.spec) as WorldSpec;
  const scores = topScores(game.id);
  const { stats } = playtest(spec);
  const best = bestTimes();
  const others = listGames(30).filter((g) => g.id !== game.id).slice(0, 16);
  const me = spec.racers.find((r) => r.you);
  const ladder = LADDERS[spec.difficulty];
  const difficulty = spec.difficulty[0].toUpperCase() + spec.difficulty.slice(1);
  const created = new Date(game.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

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
      <main className="gpage">
        <div className="gtop">
          <PlayFrame slug={game.slug} gameId={game.id} poster={<Cover spec={spec} seed={900} wide />} />

          <aside className="ginfo">
            <div>
              <h1>{game.title}</h1>
              <p className="by">By <b>{game.featured ? 'GameMog' : 'a GameMog creator'}</b></p>
              <p className="by">Difficulty: {difficulty}</p>
              <Lineage game={game} />
            </div>
            <GameActions gameId={game.id} slug={game.slug} title={game.title} initial={voteCounts(game.id)} />
          </aside>
        </div>

        <Tabs
          panels={[
            {
              label: 'About',
              body: (
                <div>
                  <h2 style={{ marginBottom: 8 }}>Description</h2>
                  <p style={{ fontSize: 16, lineHeight: 1.6, color: 'var(--ink-2)', maxWidth: 720 }}>
                    {game.tagline} {game.blurb}
                  </p>

                  {/* Roblox's stat row: a label over a value, in a single line */}
                  <dl className="gstats">
                    <div><dt>Plays</dt><dd>{game.plays.toLocaleString()}</dd></div>
                    <div><dt>Record</dt><dd>{scores[0] ? `${(scores[0].time_ms / 1000).toFixed(2)}s` : 'Unbeaten'}</dd></div>
                    <div><dt>Racers</dt><dd>{spec.racers.length}</dd></div>
                    <div><dt>Lap</dt><dd>{Math.round(stats.lapMetres)}m</dd></div>
                    <div><dt>Race</dt><dd>about {Math.round(stats.estRaceSeconds)}s</dd></div>
                    <div><dt>Genre</dt><dd>Racing</dd></div>
                    {me?.rig?.topper && me.rig.topper !== 'none' && <div><dt>Creature</dt><dd>{me.rig.topper[0].toUpperCase() + me.rig.topper.slice(1)}</dd></div>}
                    <div><dt>Created</dt><dd>{created}</dd></div>
                  </dl>

                  {/* The windows are the game. A player is owed them before they
                      start, not after they lose. */}
                  <h2 style={{ marginTop: 26, marginBottom: 6 }}>What each lap asks for</h2>
                  <table className="bd" style={{ maxWidth: 560 }}>
                    <thead>
                      <tr><th>Lap</th><th>Tempo</th><th>Window</th><th>Stride</th><th>The pack</th></tr>
                    </thead>
                    <tbody>
                      {ladder.map((b, i) => (
                        <tr key={b.n}>
                          <td>{i + 1}</td>
                          <td>{b.name}</td>
                          <td>{Math.round(b.lo * 1000)}–{Math.round(b.hi * 1000)}ms</td>
                          <td>{Math.round(b.ideal * 1000)}ms</td>
                          <td>{b.tag}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="t-meta dim" style={{ marginTop: 8, maxWidth: 560 }}>
                    Space, or tap the screen. Eight strides inside the window in a row is a lock, worth
                    free speed. The third lap is not meant to be won often.
                  </p>
                </div>
              ),
            },
            { label: `Leaderboard${scores.length ? ` (${scores.length})` : ''}`, body: leaderboard },
            { label: `Mogs${mogsOf(game.id).length ? ` (${mogsOf(game.id).length})` : ''}`, body: <MogsPanel game={game} /> },
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
            <div className="sechead"><h2>Recommended</h2><Link href="/" className="more">See all</Link></div>
            <Shelf>{(() => { const st = tileStats(); return others.map((g, i) => <Tile key={g.id} g={g} i={i + 40} best={best[g.id]} stats={st[g.id]} />); })()}</Shelf>
          </section>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
