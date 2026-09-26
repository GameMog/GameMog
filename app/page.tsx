import Link from 'next/link';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { SiteHeader, SiteFooter, Icon } from './header';
import { Tile, short } from './tile';
import { HeroFilm, type Film } from './hero-film';
import { Rail as Shelf } from './rail';
import { GenreFilter } from './genre-filter';
import { listGames, bestTimes, topScores, tileStats, type GameRow, type TileStats } from '@/lib/db';
import { CHARTS, genreOf, sortGames, type ChartSort } from '@/lib/catalog';
import { Cover } from './cover';
import type { WorldSpec } from '@/lib/worldspec';
import { DEFAULT_DESCRIPTION, pageMeta } from './seo';

export const dynamic = 'force-dynamic';
export const metadata = pageMeta({ description: DEFAULT_DESCRIPTION, path: '/' });

/** The world the homepage leads with. Its film is made by `npm run media:hero -- <slug>`. */
// the Mog rows (Most Mogged, New Mogs) join the homepage once each has this many worlds
const MOG_ROW_MIN = 25;
const HERO = 'speed-skating-2030';
/** A line of the owner's under the featured world's tagline. */
const HERO_NOTE = 'The next Winter Olympics will take place in the French Alps, France, from February 1 to February 17, 2030.';
/** The desktop hero's words, in roblox.com's voice: two short lines and one sentence. */
const HERO_COPY = {
  headline: ['One game.', 'Endless mogs.'],
  sub: `Speed Skating 2030 is Olympic long-track on mirror ice, lap after lap. ${HERO_NOTE}`,
};

/** The featured world's film, when it has been recorded. */
function filmFor(slug: string): Film | null {
  const base = `/media/${slug}`, dir = join(process.cwd(), 'public', 'media');
  const has = (cut: string) => existsSync(join(dir, `${slug}-${cut}.mp4`)) && existsSync(join(dir, `${slug}-${cut}.jpg`));
  return has('wide') && has('4x3') ? { wide: `${base}-wide`, narrow: `${base}-4x3` } : null;
}

/**
 * A chart as a GameStop section (docs/design/premium.md): the title and a grey
 * subtitle, arrows, any tab chips, the rail of cards, "View all" under it.
 */
function Section({ sort, games, best, stats, seed, controls, genre }: {
  sort: ChartSort; games: GameRow[]; best: Record<string, number>; stats: Record<string, TileStats>; seed: number; controls?: React.ReactNode; genre: string;
}) {
  const chart = CHARTS[sort];
  const query = genre === 'All' ? '' : `?genre=${encodeURIComponent(genre)}`;
  return (
    <Shelf title={chart.title} sub={chart.caption ?? chart.explanation} controls={controls}
      more={{ href: `/charts/${sort}${query}`, label: `View all ${chart.title}` }}>
      {games.map((g, i) => <Tile key={g.id} g={g} i={seed + i} best={best[g.id]} stats={stats[g.id]} />)}
    </Shelf>
  );
}

/**
 * GameStop's round category bubbles: every way into GameMog, each with a
 * picture from a real game where there is one.
 */
function JumpIn({ worlds, classic, stats }: { worlds: GameRow[]; classic?: GameRow; stats: Record<string, TileStats> }) {
  // each bubble gets its own picture: a chart's natural pick, or the next
  // world nobody else is showing, so no two circles repeat
  const used = new Set<string>();
  const pick = (...order: (GameRow | undefined)[]) => {
    const g = [...order, ...worlds].find((w) => w && !used.has(w.id));
    if (g) used.add(g.id);
    return g;
  };
  const byPlays = [...worlds].sort((a, b) => b.plays - a.plays);
  const mog = pick(worlds.find((g) => g.parent_id), ...byPlays);
  const trending = pick(...byPlays);
  const mogged = pick(...[...worlds].sort((a, b) => (stats[b.id]?.mogs ?? 0) - (stats[a.id]?.mogs ?? 0)));
  const rising = pick(...[...worlds].sort((a, b) => b.created_at - a.created_at));
  const art = (g?: GameRow) => (g ? <img src={`/g/${g.slug}/cover`} alt="" loading="lazy" /> : null);
  const items: { href: string; label: string; pic: React.ReactNode; solid?: boolean }[] = [
    { href: '/charts/trending', label: 'Top Trending', pic: art(trending) },
    { href: '/charts/up-and-coming', label: 'Up-and-Coming', pic: art(rising) },
    { href: '/charts/new-mogs', label: 'New Mogs', pic: art(mog) },
    { href: '/classic', label: 'Classic', pic: classic ? <Cover spec={JSON.parse(classic.spec) as WorldSpec} seed={7} /> : null },
    { href: '/charts/most-mogged', label: 'Most Mogged', pic: art(mogged) },
    { href: '/create', label: 'Create a world', pic: <span aria-hidden><Icon name="plus" size={44} /></span>, solid: true },
  ];
  return (
    <section className="sec">
      <div className="sechead"><div className="sectext"><h2 className="sectitle">Jump in</h2><p className="secsub">Every way into GameMog.</p></div></div>
      <div className="bubbles">
        {items.map((it) => (
          <Link key={it.label} href={it.href} className="bubble">
            <i className={it.solid ? 'solid' : undefined}>{it.pic}</i>
            {it.label}
          </Link>
        ))}
      </div>
    </section>
  );
}

/**
 * The featured world across the top, playing, with the two things you can do
 * with any game here: play it, or Mog it.
 */
function Billboard({ game, film, stats }: { game: GameRow; film: Film | null; stats?: TileStats }) {
  const record = topScores(game.id, 1, 'level')[0];
  const copy = game.slug === HERO ? HERO_COPY : { headline: [game.title], sub: game.tagline };
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
      {/* desktop: roblox.com's hero, straight on the film */}
      <div className="lead">
        <h1>{copy.headline.map((l) => <span key={l}>{l}</span>)}</h1>
        <p>{copy.sub}</p>
        <div className="acts">
          <Link href={`/g/${game.slug}`} className="btn play" aria-label={`Play ${game.title}`}>Play</Link>
          <Link href={`/mog/${game.slug}`} className="btn more">Mog it</Link>
        </div>
      </div>
      {/* phones: the card under the film */}
      <div className="card">
        <span className="kicker">Featured world</span>
        <h1>{game.title}</h1>
        <p className="tagline">{game.tagline}</p>
        {game.slug === HERO && HERO_NOTE ? <p className="hnote">{HERO_NOTE}</p> : null}
        <div className="hstats">
          <span><b>{short(game.plays)}</b> {game.plays === 1 ? 'play' : 'plays'}</span>
          {record?.level ? <span><b>Lap {record.level}</b> record</span> : null}
          {mogs ? <span><b>{mogs}</b> {mogs === 1 ? 'Mog' : 'Mogs'}</span> : <span>No Mogs yet</span>}
        </div>
        <div className="acts">
          <Link href={`/g/${game.slug}`} className="btn big light" aria-label={`Play ${game.title}`}><Icon name="play" size={20} />Play</Link>
          <Link href={`/mog/${game.slug}`} className="btn big ghost"><Icon name="remix" size={18} />Mog it</Link>
        </div>
      </div>
    </section>
  );
}

export default async function Home({ searchParams }: { searchParams: Promise<{ genre?: string }> }) {
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
  // the race format from before the GameMog Runtime lives on /classic, in
  // the nav, and not on the homepage (the owner's call): it does not play by
  // the platform's rules, so it is not ranked with worlds that do
  const worlds = games.filter((g) => g.format !== 'race');
  const hero = worlds.find((g) => g.slug === HERO) ?? worlds.find((g) => g.format === 'world') ?? worlds[0] ?? games[0];
  const genres = [...new Set(worlds.map(genreOf))].sort();
  const requested = (await searchParams).genre;
  const genre = requested && genres.includes(requested) ? requested : 'All';
  const filtered = genre === 'All' ? worlds : worlds.filter((g) => genreOf(g) === genre);
  const charts: { sort: ChartSort; all: GameRow[] }[] = [
    { sort: 'trending', all: sortGames(filtered, 'trending', stats) },
    { sort: 'up-and-coming', all: sortGames(filtered, 'up-and-coming', stats) },
    { sort: 'top-rated', all: sortGames(filtered.filter((g) => (stats[g.id]?.up ?? 0) + (stats[g.id]?.down ?? 0) > 0), 'top-rated', stats) },
    { sort: 'most-mogged', all: sortGames(filtered.filter((g) => (stats[g.id]?.mogs ?? 0) > 0), 'most-mogged', stats) },
    { sort: 'new-mogs', all: sortGames(filtered, 'new-mogs', stats) },
  ];
  // unfiltered, a chart needs four worlds to be worth a row; filtered, every
  // match is shown, or picking a genre that exists would empty the page.
  // The two Mog rows wait for 25 (the owner, 25 Sep), with or without a
  // genre; until then they live on the Charts pages. Counted before a row is
  // cut to its 16 cards.
  const least = (sort: ChartSort) => sort === 'most-mogged' || sort === 'new-mogs' ? MOG_ROW_MIN : genre === 'All' ? 4 : 1;
  const candidates = charts.filter((c) => c.all.length >= least(c.sort)).map((c) => ({ sort: c.sort, games: c.all.slice(0, 16) }));
  const seen = new Set<string>();
  const rails = candidates.filter((rail) => {
    // a rail repeats another only if it shows the same cards in the same
    // order; the same few worlds in a different order is a different chart
    const signature = rail.games.slice(0, 4).map((g) => g.id).join(',');
    if (seen.has(signature)) return false;
    seen.add(signature); return true;
  });

  return (
    <>
      <SiteHeader />
      <Billboard game={hero} film={filmFor(hero.slug)} stats={stats[hero.id]} />
      <main className="wrap" style={{ paddingTop: 24 }}>

        {rails.map((rail, i) => (
          <Section key={rail.sort} sort={rail.sort} games={rail.games} best={best} stats={stats} seed={i * 40} genre={genre}
            controls={i === 0 && genres.length > 1 ? <GenreFilter genres={genres} value={genre} /> : undefined} />
        ))}
        {!rails.length && (
          <section className="sec">
            {genres.length > 1 && <div className="seccontrols"><GenreFilter genres={genres} value={genre} /></div>}
            <div className="empty"><h2>No worlds here yet</h2><p>Charts appear when at least four worlds qualify.</p></div>
          </section>
        )}
        <JumpIn worlds={worlds} classic={games.find((g) => g.slug === 'muse-sprint') ?? games.find((g) => g.format === 'race')} stats={stats} />

      </main>
      <SiteFooter />
    </>
  );
}
