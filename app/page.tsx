import Link from 'next/link';
import { SiteHeader } from './header';
import { listGames, type GameRow } from '@/lib/db';
import type { WorldSpec } from '@/lib/worldspec';

export const dynamic = 'force-dynamic';

function Swatch({ spec }: { spec: WorldSpec }) {
  const p = spec.palette;
  return (
    <div
      className="swatch"
      style={{ background: `linear-gradient(160deg, ${p.skyHigh}, ${p.skyLow} 55%, ${p.terrain.moss})` }}
    >
      {spec.racers.slice(0, 6).map((r, i) => (
        <i key={i} style={{ background: r.fur }} />
      ))}
    </div>
  );
}

function Card({ g }: { g: GameRow }) {
  const spec = JSON.parse(g.spec) as WorldSpec;
  return (
    <Link href={`/g/${g.slug}`} className="card gamecard">
      <Swatch spec={spec} />
      <div className="body">
        <h3>{g.title}</h3>
        <p className="muted" style={{ fontSize: 13 }}>{g.tagline}</p>
        <div style={{ marginTop: 10, display: 'flex', gap: 6 }}>
          <span className="pill">{spec.difficulty}</span>
          <span className="pill">{g.plays} plays</span>
        </div>
      </div>
    </Link>
  );
}

export default function Home() {
  const games = listGames();
  const featured = games.find((g) => g.featured) ?? games[0];
  const rest = games.filter((g) => g.id !== featured?.id);

  return (
    <>
      <SiteHeader />
      <main className="wrap" style={{ paddingBottom: 80 }}>
        <section style={{ padding: '46px 0 34px', maxWidth: 720 }}>
          <div className="eyebrow" style={{ marginBottom: 12 }}>Playable worlds, not prompts</div>
          <h1 className="display" style={{ fontSize: 'clamp(40px,7vw,68px)' }}>
            Give your character
            <br />a world to run through.
          </h1>
          <p className="muted" style={{ marginTop: 16, fontSize: 17, lineHeight: 1.6 }}>
            Pick a proven format. Describe a setting. Get a link people can play in one tap —
            with a leaderboard, a shareable URL, and a world that holds together because the
            game underneath it never changes.
          </p>
          <div style={{ marginTop: 24, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Link href="/create" className="btn">Make a world</Link>
            {featured && <Link href={`/g/${featured.slug}`} className="btn ghost">Play the first one</Link>}
          </div>
        </section>

        {featured && (
          <section style={{ marginBottom: 46 }}>
            <div className="eyebrow" style={{ marginBottom: 10 }}>Featured</div>
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div className="grid c2" style={{ gap: 0 }}>
                <div style={{ padding: 26 }}>
                  <h2 className="display" style={{ fontSize: 34, marginBottom: 8 }}>{featured.title}</h2>
                  <p className="muted" style={{ marginBottom: 14, lineHeight: 1.6 }}>{featured.blurb}</p>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18 }}>
                    <span className="pill">rhythm race</span>
                    <span className="pill">3 tempo levels</span>
                    <span className="pill">photo finish</span>
                  </div>
                  <Link href={`/g/${featured.slug}`} className="btn">Play now</Link>
                </div>
                <Swatch spec={JSON.parse(featured.spec)} />
              </div>
            </div>
          </section>
        )}

        <section id="gallery" style={{ marginBottom: 46 }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>Worlds</div>
          {rest.length ? (
            <div className="grid c3">{rest.map((g) => <Card key={g.id} g={g} />)}</div>
          ) : (
            <div className="card muted">Nothing else published yet. <Link href="/create" style={{ color: 'var(--gold-deep)' }}>Make the second one.</Link></div>
          )}
        </section>

        <section>
          <div className="eyebrow" style={{ marginBottom: 18 }}>How it works</div>
          <div className="steps">
            <div className="card">
              <h3 className="display" style={{ fontSize: 17, marginBottom: 6 }}>Bring a character</h3>
              <p className="muted" style={{ fontSize: 13, lineHeight: 1.55 }}>
                A picture or a description. It sets the cast&apos;s colour and name.
              </p>
            </div>
            <div className="card">
              <h3 className="display" style={{ fontSize: 17, marginBottom: 6 }}>Pick a format</h3>
              <p className="muted" style={{ fontSize: 13, lineHeight: 1.55 }}>
                Racing ships today. Obstacle, collecting and survival reuse the same engine contract.
              </p>
            </div>
            <div className="card">
              <h3 className="display" style={{ fontSize: 17, marginBottom: 6 }}>Describe the world</h3>
              <p className="muted" style={{ fontSize: 13, lineHeight: 1.55 }}>
                Mood, palette, cast, track shape. Every generated world is playtested before it publishes.
              </p>
            </div>
            <div className="card">
              <h3 className="display" style={{ fontSize: 17, marginBottom: 6 }}>Share the link</h3>
              <p className="muted" style={{ fontSize: 13, lineHeight: 1.55 }}>
                One tap to play, a leaderboard to beat, and a remix button for anyone who wants their own.
              </p>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
