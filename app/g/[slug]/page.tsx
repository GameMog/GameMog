import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SiteHeader } from '../../header';
import { getGameBySlug, topScores } from '@/lib/db';
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
  const report = playtest(spec);

  return (
    <>
      <SiteHeader />
      <main className="wrap" style={{ paddingBottom: 70 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
          <div>
            <h1 className="display" style={{ fontSize: 'clamp(30px,5vw,44px)' }}>{game.title}</h1>
            <p className="muted" style={{ marginTop: 4 }}>{game.tagline}</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Link href={`/create?remix=${game.slug}`} className="btn ghost sm">Remix</Link>
            <a href={`/g/${game.slug}/play`} target="_blank" rel="noreferrer" className="btn sm">Full screen</a>
          </div>
        </div>

        <PlayFrame slug={game.slug} gameId={game.id} />

        <div className="grid c2" style={{ marginTop: 20, alignItems: 'start' }}>
          <div className="card">
            <div className="eyebrow" style={{ marginBottom: 10 }}>Leaderboard</div>
            {scores.length ? (
              <table className="board">
                <thead><tr><th></th><th>Runner</th><th>Time</th><th>Place</th><th>Locks</th></tr></thead>
                <tbody>
                  {scores.map((s, i) => (
                    <tr key={s.id}>
                      <td>{i + 1}</td>
                      <td>{s.player}</td>
                      <td>{(s.time_ms / 1000).toFixed(2)}s</td>
                      <td>{s.place}</td>
                      <td>{s.locks}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="muted" style={{ fontSize: 14 }}>No times yet. Finish a race and yours lands here.</p>
            )}
          </div>

          <div className="card">
            <div className="eyebrow" style={{ marginBottom: 10 }}>About this world</div>
            <p style={{ fontSize: 14, lineHeight: 1.65, marginBottom: 14 }}>{game.blurb}</p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
              <span className="pill">{spec.difficulty}</span>
              <span className="pill">{report.stats.lapMetres}m lap</span>
              <span className="pill">~{report.stats.estRaceSeconds}s race</span>
              <span className="pill">{game.plays} plays</span>
            </div>
            <div className="eyebrow" style={{ marginBottom: 8 }}>The field</div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {spec.racers.map((r) => (
                <span key={r.name} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                  <i style={{ width: 16, height: 16, borderRadius: '50%', background: r.fur, border: '2px solid rgba(255,255,255,.9)', boxShadow: '0 1px 4px rgba(0,0,0,.18)' }} />
                  {r.name}{r.you ? ' (you)' : ''}
                </span>
              ))}
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
