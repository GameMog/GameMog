import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SiteHeader, SiteFooter, Icon } from '../../header';
import { Tile } from '../../tile';
import { getGameBySlug, topScores, listGames, bestTimes } from '@/lib/db';
import { playtest } from '@/lib/playtest';
import type { WorldSpec } from '@/lib/worldspec';
import { PlayFrame } from './play-frame';

export const dynamic = 'force-dynamic';

export default async function GamePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const game = getGameBySlug(slug);
  if (!game) notFound();

  const spec = JSON.parse(game.spec) as WorldSpec;
  const scores = topScores(game.id);
  const { stats } = playtest(spec);
  const best = bestTimes();
  const others = listGames(30).filter((g) => g.id !== game.id).slice(0, 14);
  const me = spec.racers.find((r) => r.you);

  return (
    <>
      <SiteHeader />
      <main className="wrap" style={{ paddingTop: 16 }}>
        <nav className="t-xs dim-2" style={{ marginBottom: 10 }}>
          <Link href="/">Discover</Link> <span style={{ opacity: .5 }}>/</span> <Link href="/?f=race">Racing</Link> <span style={{ opacity: .5 }}>/</span> <span className="dim">{game.title}</span>
        </nav>

        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'minmax(0,1fr) 320px' }} className="gamelayout">
          <PlayFrame slug={game.slug} gameId={game.id} />

          <aside style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
            <div className="well">
              <h1 className="t-xl" style={{ fontSize: 22 }}>{game.title}</h1>
              <p className="dim" style={{ marginTop: 4, fontSize: 13 }}>{game.tagline}</p>

              <div style={{ display: 'flex', gap: 14, marginTop: 12, fontSize: 12.5, fontWeight: 500, color: 'var(--ink-2)' }}>
                <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}><Icon name="players" />{game.plays} plays</span>
                <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}><Icon name="field" />{spec.racers.length} racers</span>
                <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}><Icon name="time" />~{Math.round(stats.estRaceSeconds)}s</span>
              </div>

              <a href="#play" className="btn big" style={{ marginTop: 14 }}><Icon name="play" size={15} />Play</a>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
                <Link href={`/create?remix=${game.slug}`} className="btn ghost sm">Remix</Link>
                <a href={`/g/${game.slug}/play`} target="_blank" rel="noreferrer" className="btn ghost sm">Full screen</a>
              </div>
            </div>

            <div className="well">
              <div className="lbl">Record</div>
              {scores[0] ? (
                <>
                  <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-.02em', fontVariantNumeric: 'tabular-nums' }}>
                    {(scores[0].time_ms / 1000).toFixed(2)}<span className="dim-2" style={{ fontSize: 15, fontWeight: 500 }}>s</span>
                  </div>
                  <div className="t-xs dim">{scores[0].player} · {scores[0].locks} locks</div>
                </>
              ) : <p className="t-xs dim">Unbeaten. No one has finished this world yet.</p>}
            </div>

            <div className="well">
              <div className="lbl">The field</div>
              <div style={{ display: 'grid', gap: 6 }}>
                {spec.racers.map((r) => (
                  <div key={r.name} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                    <i style={{ width: 16, height: 16, borderRadius: 4, background: r.fur, border: '1px solid rgba(0,0,0,.08)', flex: '0 0 auto' }} />
                    <span style={{ flex: 1, fontWeight: r.you ? 600 : 400 }}>{r.name}</span>
                    {r.rig?.topper !== 'none' && <span className="t-xs dim-2">{r.rig?.topper}</span>}
                    {r.you && <span className="chip accent" style={{ height: 20, fontSize: 11 }}>you</span>}
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>

        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', marginTop: 16 }}>
          <div className="well">
            <div className="sechead" style={{ marginBottom: 8 }}><h2 className="t-md">Leaderboard</h2>{scores.length > 0 && <span className="t-xs dim-2">{scores.length} runs</span>}</div>
            {scores.length ? (
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
            ) : <p className="t-xs dim">No times yet. Finish a race and yours lands here.</p>}
          </div>

          <div className="well">
            <h2 className="t-md" style={{ marginBottom: 8 }}>About</h2>
            <p style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--ink-2)' }}>{game.blurb}</p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
              <span className="chip">{spec.difficulty}</span>
              <span className="chip">{Math.round(stats.lapMetres)}m lap</span>
              <span className="chip">3 laps</span>
              {me?.rig?.topper !== 'none' && <span className="chip">{me?.rig?.topper}</span>}
            </div>
            <dl style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 16px', fontSize: 12.5 }}>
              <dt className="dim-2">Format</dt><dd>Rhythm race · tap to stride</dd>
              <dt className="dim-2">Controls</dt><dd>Space, or tap the screen</dd>
              <dt className="dim-2">Scene budget</dt><dd>{stats.propBudget}</dd>
            </dl>
          </div>
        </div>

        {others.length > 0 && (
          <section className="sec">
            <div className="sechead"><h2 className="t-lg">More worlds</h2><Link href="/" className="more">See all</Link></div>
            <div className="rail">{others.map((g, i) => <Tile key={g.id} g={g} i={i + 40} best={best[g.id]} />)}</div>
          </section>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
