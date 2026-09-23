import Link from 'next/link';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { SiteHeader, SiteFooter, Icon } from './header';
import { Tile, short } from './tile';
import { HeroFilm, type Film } from './hero-film';
import { Rail as Shelf } from './rail';
import { listGames, bestTimes, topScores, tileStats, type GameRow, type TileStats } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** The world the homepage leads with. Its film is made by `npm run media:hero -- <slug>`. */
const HERO = 'la-olympics-2028';

/** The featured world's film, when it has been recorded. */
function filmFor(slug: string): Film | null {
  const base = `/media/${slug}`, dir = join(process.cwd(), 'public', 'media');
  const has = (cut: string) => existsSync(join(dir, `${slug}-${cut}.mp4`)) && existsSync(join(dir, `${slug}-${cut}.jpg`));
  return has('wide') && has('4x3') ? { wide: `${base}-wide`, narrow: `${base}-4x3` } : null;
}

/**
 * A heading, a "See all" when there is more than the row shows, and a row of
 * identical tiles. That is the entire unit a games catalogue is built from.
 */
function Rail({ title, id, games, best, stats, seed, more }: {
  title: string; id?: string; games: GameRow[]; best: Record<string, number>; stats: Record<string, TileStats>; seed: number; more?: string;
}) {
  if (!games.length) return null;
  return (
    <section className="sec" id={id}>
      <div className="sechead">
        <h2>{title}</h2>
        {more && <Link href={more} className="more">See all</Link>}
      </div>
      <Shelf>
        {games.map((g, i) => <Tile key={g.id} g={g} i={seed + i} best={best[g.id]} stats={stats[g.id]} />)}
      </Shelf>
    </section>
  );
}

/**
 * The featured world across the top, playing, with the two things you can do
 * with any game here: play it, or Mog it.
 */
function Billboard({ game, film, stats }: { game: GameRow; film: Film | null; stats?: TileStats }) {
  const record = topScores(game.id, 1, 'level')[0];
  const mogs = stats?.mogs ?? 0;
  return (
    <section className="billboard" aria-label="Featured world">
      <div className="screen">
        {film
          ? <HeroFilm film={film} />
          // eslint-disable-next-line @next/next/no-img-element
          : <div className="film"><img src={`/g/${game.slug}/cover`} alt="" /></div>}
        <Link href={`/g/${game.slug}`} className="filmlink" tabIndex={-1} aria-hidden />
      </div>
      <div className="card">
        <span className="kicker">Featured world</span>
        <h1>{game.title}</h1>
        <p className="tagline">{game.tagline}</p>
        <div className="hstats">
          <span><b>{short(game.plays)}</b> plays</span>
          {record?.level ? <span><b>Lap {record.level}</b> record</span> : null}
          {mogs ? <span><b>{mogs}</b> {mogs === 1 ? 'Mog' : 'Mogs'}</span> : <span>No Mogs yet</span>}
        </div>
        <div className="acts">
          <Link href={`/g/${game.slug}`} className="btn big" aria-label={`Play ${game.title}`}><Icon name="play" size={20} />Play</Link>
          <Link href={`/mog/${game.slug}`} className="btn big light"><Icon name="remix" size={18} />Mog it</Link>
        </div>
      </div>
    </section>
  );
}

export default function Home() {
  const games = listGames(120);
  const best = bestTimes();

  if (!games.length) {
    return (
      <>
        <SiteHeader />
        <main className="wrap" style={{ paddingTop: 24 }}>
          <h1>Charts</h1>
          <p className="dim" style={{ marginTop: 8 }}>
            Nothing published yet. Run <code>npm run seed</code>, or{' '}
            <Link href="/create" style={{ color: 'var(--blue)', fontWeight: 500 }}>make the first world</Link>.
          </p>
        </main>
        <SiteFooter />
      </>
    );
  }

  const stats = tileStats();
  // the race format from before the GameMog Runtime lives on /classic: it
  // does not play by the platform's rules, so it is not ranked with worlds
  // that do
  const worlds = games.filter((g) => g.format !== 'race');
  const hero = worlds.find((g) => g.slug === HERO) ?? worlds.find((g) => g.format === 'world') ?? worlds[0] ?? games[0];
  const played = [...worlds].sort((a, b) => b.plays - a.plays);
  const newest = [...worlds].sort((a, b) => b.created_at - a.created_at);

  return (
    <>
      <SiteHeader />
      <main className="wrap" style={{ paddingTop: 16 }}>
        <Billboard game={hero} film={filmFor(hero.slug)} stats={stats[hero.id]} />

        <Rail title="Top playing now" id="played" games={played.slice(0, 16)} best={best} stats={stats} seed={0} more={worlds.length > 16 ? '#all' : undefined} />
        {/* a second rail only once it would not repeat the first */}
        {worlds.length > 8 && <Rail title="Up and coming" id="new" games={newest.slice(0, 16)} best={best} stats={stats} seed={40} more={worlds.length > 16 ? '#all' : undefined} />}

        {worlds.length > 16 && (
          <section className="sec" id="all">
            <div className="sechead">
              <h2>All worlds</h2>
              <span className="t-meta dim">{worlds.length} published, every one playtested</span>
            </div>
            <div className="gridw">
              {worlds.map((g, i) => <Tile key={g.id} g={g} i={i + 200} best={best[g.id]} stats={stats[g.id]} />)}
            </div>
          </section>
        )}

      </main>
      <SiteFooter />
    </>
  );
}
