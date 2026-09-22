import Link from 'next/link';
import { SiteHeader } from './header';
import { Tile } from './tile';
import { Cover } from './cover';
import { listGames } from '@/lib/db';
import { playtest } from '@/lib/playtest';
import type { WorldSpec } from '@/lib/worldspec';

export const dynamic = 'force-dynamic';

function Shelf({ title, id, games, href }: { title: string; id?: string; games: ReturnType<typeof listGames>; href?: string }) {
  if (!games.length) return null;
  return (
    <section id={id}>
      <div className="shelfhead">
        <h2 className="h2">{title}</h2>
        {href && <Link href={href} className="seeall">See all <span aria-hidden>→</span></Link>}
      </div>
      <div className="shelf">{games.map((g, i) => <Tile key={g.id} g={g} i={i} />)}</div>
    </section>
  );
}

export default function Home() {
  const games = listGames(60);
  const featured = games.find((g) => g.featured) ?? games[0];
  const spec = featured ? (JSON.parse(featured.spec) as WorldSpec) : null;
  const stats = spec ? playtest(spec).stats : null;

  const newest = [...games].sort((a, b) => b.created_at - a.created_at);
  const popular = [...games].sort((a, b) => b.plays - a.plays);

  return (
    <>
      <SiteHeader />
      <main className="wrap" style={{ paddingBottom: 72 }}>
        {featured && spec && (
          <section className="hero">
            <div style={{ display: 'grid', gap: 26, gridTemplateColumns: 'minmax(0,1.25fr) minmax(0,.75fr)', alignItems: 'center' }}>
              <div>
                <span className="pill" style={{ background: 'rgba(255,255,255,.16)', color: '#fff', borderColor: 'transparent', marginBottom: 14 }}>
                  Featured world
                </span>
                <h1>{spec.meta.title}</h1>
                <p>{spec.meta.blurb}</p>
                <div className="cta">
                  <Link href={`/g/${featured.slug}`} className="btn">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                    Play now
                  </Link>
                  <Link href="/create" className="btn ghost">Make your own</Link>
                </div>
              </div>
              <div style={{ borderRadius: 14, overflow: 'hidden', boxShadow: '0 18px 44px rgba(10,6,40,.4)' }}>
                <Cover spec={spec} seed={99} />
              </div>
            </div>
          </section>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 24, flexWrap: 'wrap' }}>
          <span className="pill on">All</span>
          <span className="pill">Racing</span>
          <span className="pill" style={{ opacity: .5 }}>Obstacle · soon</span>
          <span className="pill" style={{ opacity: .5 }}>Collecting · soon</span>
          <span className="pill" style={{ opacity: .5 }}>Survival · soon</span>
        </div>

        <Shelf title="Most played" games={popular} href="/" />
        <Shelf title="New worlds" id="new" games={newest} href="/" />

        <section>
          <div className="shelfhead"><h2 className="h2">Every world</h2>{stats && <span className="tiny muted">{games.length} published</span>}</div>
          <div className="grid">{games.map((g, i) => <Tile key={g.id} g={g} i={i + 100} />)}</div>
        </section>

        <section className="card flat" style={{ marginTop: 34, display: 'grid', gap: 20, gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))' }}>
          <div>
            <h3 className="h3">Bring a character</h3>
            <p className="tiny muted" style={{ marginTop: 5, lineHeight: 1.55 }}>
              A picture or a description sets its body, fur, face and colour. The world bends around it, never the other way.
            </p>
          </div>
          <div>
            <h3 className="h3">Describe a world</h3>
            <p className="tiny muted" style={{ marginTop: 5, lineHeight: 1.55 }}>
              Mood, palette, cast and the shape of the loop. The controls underneath never change.
            </p>
          </div>
          <div>
            <h3 className="h3">Playtested before it ships</h3>
            <p className="tiny muted" style={{ marginTop: 5, lineHeight: 1.55 }}>
              Lanes on the road, racers visible, a lap that holds frame rate on a phone. Errors block publishing.
            </p>
          </div>
          <div>
            <h3 className="h3">Share the link</h3>
            <p className="tiny muted" style={{ marginTop: 5, lineHeight: 1.55 }}>
              One tap to play, a leaderboard to beat, and a remix button for anyone who wants their own.
            </p>
          </div>
        </section>
      </main>
    </>
  );
}
