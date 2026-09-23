import Link from 'next/link';
import { Cover } from './cover';
import { Icon } from './header';
import type { GameRow, TileStats } from '@/lib/db';
import type { WorldSpec } from '@/lib/worldspec';

const NEW_MS = 1000 * 60 * 60 * 36;

/** 1234 as 1.2K, the way a catalogue counts. */
export const short = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : String(n));

/**
 * A 16:9 thumbnail 264px wide, a two-line 16/700 name, one 12/500 metadata
 * row. Every world's cover is a frame of its own gameplay, and gameplay is
 * 16:9: a square crop threw away a third of every picture. The metadata is
 * the catalogue's two numbers, liked and played, plus how many Mogs are
 * challenging the game, because that is what makes a game worth opening
 * here. Every tile is identical in size and rhythm.
 */
export function Tile({ g, i = 0, best, stats }: { g: GameRow; i?: number; best?: number; stats?: TileStats }) {
  const isNew = Date.now() - g.created_at < NEW_MS;
  // a written world's cover is the frame its playtest took mid-race; a race
  // world's is drawn from its spec
  const custom = g.format === 'custom' || g.format === 'world';
  const spec = custom ? null : (JSON.parse(g.spec) as WorldSpec);
  const votes = (stats?.up ?? 0) + (stats?.down ?? 0);
  const liked = votes ? Math.round((100 * stats!.up) / votes) : 0;
  return (
    <Link href={`/g/${g.slug}`} className="tl">
      <div className="th">
        {custom
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={`/g/${g.slug}/cover`} alt="" loading="lazy" />
          : <Cover spec={spec!} seed={i} wide />}
        {g.featured ? <span className="bd">FLAGSHIP</span>
          : g.parent_id ? <span className="bd ink">MOG</span>
          : isNew ? <span className="bd blue">NEW</span> : null}
      </div>
      <div className="nm">{g.title}</div>
      <div className="mt">
        {votes > 0 && <span aria-label={`${liked}% liked`}><Icon name="thumbUp" size={13} />{liked}%</span>}
        <span aria-label={`${g.plays} plays`}><Icon name="players" size={13} />{short(g.plays)}</span>
        {stats?.mogs
          ? <span aria-label={`${stats.mogs} Mogs`}><Icon name="remix" size={13} />{stats.mogs}</span>
          : best ? <span><Icon name="trophy" size={13} />{(best / 1000).toFixed(1)}s</span> : null}
      </div>
    </Link>
  );
}

/** The same box, at the same size, before the data lands. */
export function TileSkeleton() {
  return (
    <div className="tl sk-tile" aria-hidden>
      <div className="th" />
      <div className="sk-line a" />
      <div className="sk-line b" />
    </div>
  );
}
