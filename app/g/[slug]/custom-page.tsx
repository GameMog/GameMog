import Link from 'next/link';
import { SiteHeader, SiteFooter } from '../../header';
import { Tile } from '../../tile';
import { topScores, listGames, bestTimes, voteCounts, type GameRow } from '@/lib/db';
import type { GameMeta } from '@/lib/custom-game';
import { PlayFrame } from './play-frame';
import { GameActions } from './actions';
import { Tabs } from './tabs';
import { Rail as Shelf } from '../../rail';
import { Lineage, MogOffPanel, MogsPanel } from './mog';
import { mogsOf, tileStats } from '@/lib/db';

/**
 * The page for a game Opus wrote: the same grid as a race world, with what
 * the model declared about its own game (controls, cast, how it scores) in
 * place of the race engine's laps and windows.
 */
export function CustomGamePage({ game }: { game: GameRow }) {
  const meta = JSON.parse(game.meta ?? '{}') as Omit<GameMeta, 'scoring'> & { scoring?: GameMeta['scoring'] | 'level' };
  const world = game.format === 'world';
  const by = world ? 'level' : meta.scoring ?? 'score';
  const scores = topScores(game.id, 10, by);
  const best = bestTimes();
  // worlds recommend worlds; Classic races live on /classic
  const others = listGames(120).filter((g) => g.id !== game.id && g.format !== 'race').slice(0, 16);
  const created = new Date(game.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const fmt = (s: (typeof scores)[number]) =>
    by === 'level' ? `Level ${s.level ?? 0}` : by === 'score' ? `${(s.score ?? 0).toLocaleString()} pts` : by === 'place' ? `${s.place || '-'}` : `${(s.time_ms / 1000).toFixed(2)}s`;
  const record = scores[0] ? fmt(scores[0]) : 'Unbeaten';

  const leaderboard = scores.length ? (
    <table className="bd">
      <thead><tr><th /><th>Player</th><th>{by === 'level' ? 'Level' : by === 'score' ? 'Score' : by === 'place' ? 'Place' : 'Time'}</th>{by === 'level' && <th>GM</th>}<th>Time</th></tr></thead>
      <tbody>
        {scores.map((s, i) => (
          <tr key={s.id}>
            <td>{i + 1}</td><td>{s.player}</td><td>{by === 'level' ? s.level : fmt(s)}</td>
            {by === 'level' && <td>{s.gm ?? 0}</td>}
            <td>{s.time_ms ? `${(s.time_ms / 1000).toFixed(1)}s` : '-'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  ) : <p className="dim">No runs posted yet. Finish one and yours lands here.</p>;

  return (
    <>
      <SiteHeader />
      <main className="gpage">
        <div className="gtop">
          <PlayFrame slug={game.slug} gameId={game.id}
            // eslint-disable-next-line @next/next/no-img-element
            poster={<img src={`/g/${game.slug}/cover`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />} />
          <aside className="ginfo">
            <div>
              <h1>{game.title}</h1>
              <p className="by">By <b>a GameMog creator</b></p>
              <p className="by">{world ? 'Endless laps · GameMog Runtime' : 'Written by Claude Opus 5.5'}</p>
              <Lineage game={game} />
            </div>
            <GameActions gameId={game.id} slug={game.slug} title={game.title} initial={voteCounts(game.id)} />
          </aside>
        </div>

        <MogOffPanel game={game} />

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
                  <dl className="gstats">
                    <div><dt>Plays</dt><dd>{game.plays.toLocaleString()}</dd></div>
                    <div><dt>{world ? 'Best' : 'Record'}</dt><dd>{record}</dd></div>
                    {world && scores[0] && <div><dt>GM on that run</dt><dd>{scores[0].gm ?? 0}</dd></div>}
                    <div><dt>Genre</dt><dd>{meta.genre}</dd></div>
                    <div><dt>Cast</dt><dd>{meta.cast?.length ?? 0}</dd></div>
                    <div><dt>Created</dt><dd>{created}</dd></div>
                  </dl>
                  <h2 style={{ marginTop: 26, marginBottom: 6 }}>Controls</h2>
                  <p style={{ fontSize: 16, lineHeight: 1.6, color: 'var(--ink-2)', maxWidth: 720 }}>{meta.controls}</p>
                  {world && (
                    <>
                      <h2 style={{ marginTop: 26, marginBottom: 6 }}>How it works</h2>
                      <p style={{ fontSize: 16, lineHeight: 1.6, color: 'var(--ink-2)', maxWidth: 720 }}>
                        Endless laps. One rival lines up beside you at the start, and every lap another joins at
                        the line, faster and more aggressive than the last. Every lap everyone runs faster: you,
                        the whole field and the moving obstacles. Touch a rival or an obstacle and the run is over.
                        Collect the golden GM on the way. The leaderboard ranks the highest level reached, then GM.
                      </p>
                    </>
                  )}
                </div>
              ),
            },
            { label: `Leaderboard${scores.length ? ` (${scores.length})` : ''}`, body: leaderboard },
            { label: `Mogs${mogsOf(game.id).length ? ` (${mogsOf(game.id).length})` : ''}`, body: <MogsPanel game={game} /> },
            {
              label: 'Cast',
              body: (
                <div style={{ display: 'grid', gap: 8, maxWidth: 480 }}>
                  {(meta.cast ?? []).map((c) => (
                    <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 16 }}>
                      <i style={{ width: 18, height: 18, borderRadius: 4, background: c.color, border: '1px solid var(--line)', flex: '0 0 auto' }} />
                      <span style={{ flex: 1, fontWeight: c.role === 'player' ? 700 : 400 }}>{c.name}</span>
                      {c.role && <span className="t-meta dim-2">{c.role}</span>}
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
