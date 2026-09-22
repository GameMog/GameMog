import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SiteHeader, Stat } from '../../header';
import { Tile } from '../../tile';
import { getGameBySlug, topScores, listGames } from '@/lib/db';
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
  const others = listGames(20).filter((g) => g.id !== game.id);
  const best = scores[0];

  return (
    <>
      <SiteHeader />
      <main className="wrap" style={{ paddingBottom: 72 }}>
        <div style={{ display: 'grid', gap: 22, gridTemplateColumns: 'minmax(0,2.1fr) minmax(0,1fr)', marginTop: 20 }} className="gamelayout">
          <PlayFrame slug={game.slug} gameId={game.id} />

          <aside>
            <h1 className="h1" style={{ fontSize: 26 }}>{game.title}</h1>
            <p className="muted tiny" style={{ marginTop: 6 }}>{game.tagline}</p>

            <div className="stats" style={{ marginTop: 14, fontSize: 13 }}>
              <Stat icon="people">{game.plays} plays</Stat>
              <Stat icon="flag">{spec.racers.length} racers</Stat>
              <Stat icon="clock">~{Math.round(stats.estRaceSeconds)}s</Stat>
            </div>

            <a href="#play" className="btn lg" style={{ marginTop: 16 }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
              Play
            </a>
            <div style={{ display: 'flex', gap: 8, marginTop: 9 }}>
              <Link href={`/create?remix=${game.slug}`} className="btn ghost sm" style={{ flex: 1 }}>Remix</Link>
              <a href={`/g/${game.slug}/play`} target="_blank" rel="noreferrer" className="btn ghost sm" style={{ flex: 1 }}>Full screen</a>
            </div>

            {best && (
              <div className="card flat" style={{ marginTop: 14, padding: 14 }}>
                <div className="tiny muted" style={{ marginBottom: 3 }}>Record</div>
                <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.02em' }}>{(best.time_ms / 1000).toFixed(2)}s</div>
                <div className="tiny muted">by {best.player}</div>
              </div>
            )}

            <div className="card" style={{ marginTop: 14 }}>
              <div className="tiny muted" style={{ marginBottom: 9, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase' }}>The field</div>
              <div style={{ display: 'grid', gap: 7 }}>
                {spec.racers.map((r) => (
                  <div key={r.name} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, fontWeight: 700 }}>
                    <i style={{ width: 18, height: 18, borderRadius: 6, background: r.fur, border: '1px solid var(--line)', flex: '0 0 auto' }} />
                    <span style={{ flex: 1 }}>{r.name}</span>
                    {r.you && <span className="pill accent" style={{ padding: '2px 8px', fontSize: 11 }}>you</span>}
                    {r.rig?.topper !== 'none' && <span className="tiny muted">{r.rig?.topper}</span>}
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>

        <div style={{ display: 'grid', gap: 18, gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', marginTop: 24 }}>
          <div className="card">
            <h2 className="h2" style={{ fontSize: 17, marginBottom: 10 }}>Leaderboard</h2>
            {scores.length ? (
              <table className="board">
                <thead><tr><th /><th>Runner</th><th>Time</th><th>Place</th><th>Locks</th></tr></thead>
                <tbody>
                  {scores.map((s, i) => (
                    <tr key={s.id}>
                      <td>{i + 1}</td><td>{s.player}</td>
                      <td>{(s.time_ms / 1000).toFixed(2)}s</td><td>{s.place}</td><td>{s.locks}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="tiny muted">No times yet. Finish a race and yours lands here.</p>}
          </div>
          <div className="card">
            <h2 className="h2" style={{ fontSize: 17, marginBottom: 10 }}>About</h2>
            <p style={{ fontSize: 14, lineHeight: 1.65 }}>{game.blurb}</p>
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 13 }}>
              <span className="pill">{spec.difficulty}</span>
              <span className="pill">{Math.round(stats.lapMetres)}m lap</span>
              <span className="pill">3 tempo levels</span>
            </div>
          </div>
        </div>

        {others.length > 0 && (
          <section>
            <div className="shelfhead"><h2 className="h2">More worlds</h2><Link href="/" className="seeall">See all <span aria-hidden>→</span></Link></div>
            <div className="shelf">{others.map((g, i) => <Tile key={g.id} g={g} i={i + 40} />)}</div>
          </section>
        )}
      </main>
    </>
  );
}
