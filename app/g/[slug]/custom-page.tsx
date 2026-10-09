import Link from 'next/link';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { SiteHeader, SiteFooter } from '../../header';
import { Tile } from '../../tile';
import { topScores, listGames, bestTimes, voteCounts, playerStats, type GameRow } from '@/lib/db';
import { worldControls, worldMode, MODE_PAGE, NO_GM_HOW, kartHow, type GameMeta } from '@/lib/custom-game';
import { optionsOf } from '@/lib/world-options';
import { PlayFrame } from './play-frame';
import { YouLine } from './you-line';
import { GameActions } from './actions';
import { Tabs } from './tabs';
import { Rail as Shelf } from '../../rail';
import { Lineage, MogOffPanel, MogsPanel } from './mog';
import { mogsOf, tileStats } from '@/lib/db';
import { kartConstants, kartMeasured } from '@/lib/kart-score';
import { dna } from '@/lib/mog-dna';
import { KartBoard } from './kart-score-ui';

/**
 * The page for a game Opus wrote: the same grid as a race world, with what
 * the model declared about its own game (controls, cast, how it scores) in
 * place of the race engine's laps and windows.
 */
export function CustomGamePage({ game, kdiag = null }: { game: GameRow; kdiag?: string | null }) {
  const meta = JSON.parse(game.meta ?? '{}') as Omit<GameMeta, 'scoring'> & { scoring?: GameMeta['scoring'] | 'level' | 'survival' };
  const world = game.format === 'world';
  // a framework world's controls are the runtime's, read from its code, so a change to them
  // (the jump, 1 Oct) reaches every published world; a written game keeps the ones it declared
  const controls = world && game.code ? worldControls(game.code) : meta.controls;
  // a lap race, an open world or a derby (1 Oct): read from the code, so an open world's page never talks laps
  const mode = world ? worldMode(game.code, game.meta) : null, page = mode ? MODE_PAGE[mode] : null;
  // an open world with no GM ranks the takedowns after the time
  const noGm = mode === 'survival' && !optionsOf(game).coins;
  // an open world ranks the time survived; a race the level reached; a kart race its score (8 Oct), each player once
  const by = mode ? (mode === 'race' ? 'level' : mode === 'kart' ? 'kart' : 'survival') : meta.scoring === 'survival' ? 'score' : meta.scoring ?? 'score';
  const scores = topScores(game.id, 10, by);
  // (a kart race's constants: the perfect time of each racer, for the post panel's score, the same as the route's)
  // (and its laps for the page's text: kartHow, 9 Oct; Meme Kart's three laps read word for word as before)
  const kartDna = mode === 'kart' && game.code ? dna(game.code).kart : null;
  const kartC = mode === 'kart' ? kartConstants(game.meta, game.code, kartDna) : null;
  const best = bestTimes();
  // worlds recommend worlds; Classic races live on /classic
  const others = listGames(120).filter((g) => g.id !== game.id && g.format !== 'race').slice(0, 16);
  const created = new Date(game.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const players = playerStats(game.id).players;
  const votes = voteCounts(game.id), voteTotal = votes.up + votes.down;
  const likes = voteTotal ? `${Math.round(votes.up / voteTotal * 100)}%` : 'No votes';
  const mogs = mogsOf(game.id);
  const rivals = (meta.cast ?? []).filter((c) => c.role !== 'player').length;
  const filmBase = `/media/${game.slug}-wide`;
  const hasFilm = existsSync(join(process.cwd(), 'public', 'media', `${game.slug}-wide.mp4`));
  const clock = (ms: number) => { const t = Math.floor(ms / 1000); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
  const fmt = (s: (typeof scores)[number]) =>
    by === 'survival' ? clock(s.time_ms)
    : by === 'level' ? `Level ${s.level ?? 0}` : by === 'score' ? `${(s.score ?? 0).toLocaleString()} pts` : by === 'place' ? `${s.place || '-'}` : `${(s.time_ms / 1000).toFixed(2)}s`;
  const leaderboard = scores.length && kartC ? <KartBoard rows={scores} gmOn={kartC.gmCap > 0} provisional={!kartMeasured(kartC)} /> : scores.length ? (
    <table className="bd">
      <thead><tr><th /><th>Player</th><th>{by === 'survival' ? 'Survived' : by === 'level' ? 'Level' : by === 'score' ? 'Score' : by === 'place' ? 'Place' : 'Time'}</th>{(by === 'level' || by === 'survival') && <th>{noGm ? 'Takedowns' : 'GM'}</th>}<th>{by === 'survival' ? 'Heat' : 'Time'}</th></tr></thead>
      <tbody>
        {scores.map((s, i) => (
          <tr key={s.id}>
            <td>{i + 1}</td><td>{s.player}</td><td>{by === 'level' ? s.level : fmt(s)}</td>
            {(by === 'level' || by === 'survival') && <td>{noGm ? s.kos ?? 0 : s.gm ?? 0}</td>}
            <td>{by === 'survival' ? s.level ?? 1 : s.time_ms ? `${(s.time_ms / 1000).toFixed(1)}s` : '-'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  ) : <p className="dim">No runs posted yet. Finish one and yours lands here.</p>;

  return (
    <>
      <SiteHeader />
      <main className="gpage">
        {/* the game is the page: a stage as wide as the screen's height allows,
            then who made it and what you can do with it */}
        <nav className="crumbs" aria-label="Breadcrumb">
          <Link href="/">Home</Link><span aria-hidden>/</span><Link href="/charts/trending">Top Trending</Link><span aria-hidden>/</span><span>{game.title}</span>
        </nav>
        <div className="gtop">
          <div className="gstage">
            <PlayFrame slug={game.slug} gameId={game.id} you={game.format === 'world'} kart={mode === 'kart'} kartScore={kartC} kdiag={mode === 'kart' ? kdiag : null}
              // eslint-disable-next-line @next/next/no-img-element
              poster={<img src={`/g/${game.slug}/cover`} alt="" />} />
          </div>
          <div className="gbar">
            <div className="gtitle">
              <h1>{game.title}</h1>
              <p className="by">By <b>a GameMog creator</b> <span className="maturity">· {page ? `${page.label} · GameMog Runtime` : 'Written by GameMog'}</span></p>
              <Lineage game={game} />
              {world && <YouLine slug={game.slug} />}
            </div>
            <GameActions gameId={game.id} slug={game.slug} title={game.title} initial={voteCounts(game.id)} />
          </div>
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
                    <div><dt>Players</dt><dd>{players.toLocaleString()}</dd></div>
                    <div><dt>Likes</dt><dd>{likes}</dd></div>
                    <div><dt>Mogs</dt><dd>{mogs.length}</dd></div>
                    <div><dt>Generation</dt><dd>{game.generation}</dd></div>
                    <div><dt>Created</dt><dd>{created}</dd></div>
                    <div><dt>Genre</dt><dd>{meta.genre}</dd></div>
                    <div><dt>Rivals</dt><dd>{page ? page.rivals : rivals}</dd></div>
                  </dl>
                  <h2 style={{ marginTop: 26, marginBottom: 6 }}>Controls</h2>
                  <p style={{ fontSize: 16, lineHeight: 1.6, color: 'var(--ink-2)', maxWidth: 720 }}>{controls}</p>
                  <h2 style={{ marginTop: 26, marginBottom: 8 }}>Media</h2>
                  <div className="gmedia">
                    {hasFilm && <video src={`${filmBase}.mp4`} poster={`${filmBase}.jpg`} controls muted loop playsInline aria-label="Gameplay film" />}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/g/${game.slug}/cover`} alt={`${game.title} key art`} />
                  </div>
                  {page && (
                    <>
                      <h2 style={{ marginTop: 26, marginBottom: 6 }}>How it works</h2>
                      <p style={{ fontSize: 16, lineHeight: 1.6, color: 'var(--ink-2)', maxWidth: 720 }}>{noGm ? NO_GM_HOW : mode === 'kart' ? kartHow(kartDna?.laps) : page.how}</p>
                    </>
                  )}
                </div>
              ),
            },
            { label: `Leaderboard${scores.length ? ` (${scores.length})` : ''}`, body: leaderboard },
            { label: `Mogs${mogs.length ? ` (${mogs.length})` : ''}`, body: <MogsPanel game={game} /> },
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
                  {!meta.cast?.length && <div className="empty compact"><p>No cast has been listed for this game.</p></div>}
                </div>
              ),
            },
          ]}
        />

        {others.length > 0 ? (
          <Shelf title="Players Also Play" sub="More worlds on the GameMog Runtime." more={{ href: '/charts/trending', label: 'View all worlds' }}>
            {(() => { const st = tileStats(); return others.map((g, i) => <Tile key={g.id} g={g} i={i + 40} best={best[g.id]} stats={st[g.id]} />); })()}
          </Shelf>
        ) : <section className="sec"><div className="sechead"><div className="sectext"><h2 className="sectitle">Players Also Play</h2></div></div><div className="empty compact"><p>No other worlds are published yet.</p></div></section>}
      </main>
      <SiteFooter />
    </>
  );
}
