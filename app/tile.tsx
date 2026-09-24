import Link from 'next/link';
import { Cover } from './cover';
import { Icon } from './header';
import type { GameRow, TileStats } from '@/lib/db';
import type { WorldSpec } from '@/lib/worldspec';

const NEW_MS = 1000 * 60 * 60 * 36;

/** 1234 as 1.2K, the way a catalogue counts. */
export const short = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : String(n));

/**
 * A 16:9 key-art thumbnail, four across a desktop row, a 16/700 name and one
 * compact metadata row. Every tile is identical in size and rhythm, and every
 * one shows its game's art whole: worlds their wide key art, Classic races
 * their wide drawn cover.
 */
export function Tile({ g, i = 0, best, stats }: { g: GameRow; i?: number; best?: number; stats?: TileStats }) {
  const isNew = Date.now() - g.created_at < NEW_MS;
  // Runtime worlds use their generated wide key art; Classic covers are
  // drawn from their specs at the same shape.
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
        {g.parent_id ? <span className="bd ink">MOG</span>
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
