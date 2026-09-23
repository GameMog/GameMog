import Link from 'next/link';
import { Cover } from './cover';
import { Icon } from './header';
import type { GameRow } from '@/lib/db';
import type { WorldSpec } from '@/lib/worldspec';

const NEW_MS = 1000 * 60 * 60 * 36;

/**
 * 150x150 thumbnail at 8px radius, a two-line 16/700 name, one 12/500 metadata
 * row. Those are Roblox's measured numbers, and the reason a catalogue reads as
 * a catalogue is that every tile is identical in size and rhythm.
 */
export function Tile({ g, i = 0, best }: { g: GameRow; i?: number; best?: number }) {
  const isNew = Date.now() - g.created_at < NEW_MS;
  // A written game's cover is the screenshot its playtest took mid-play; a
  // race world's is drawn from its spec.
  const custom = g.format === 'custom' || g.format === 'world';
  const spec = custom ? null : (JSON.parse(g.spec) as WorldSpec);
  const cast = custom ? (JSON.parse(g.meta ?? '{}').cast?.length ?? 0) : spec!.racers.length;
  return (
    <Link href={`/g/${g.slug}`} className="tl">
      <div className="th">
        {custom
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={`/g/${g.slug}/cover`} alt="" loading="lazy" />
          : <Cover spec={spec!} seed={i} />}
        {g.featured ? <span className="bd">FLAGSHIP</span> : isNew ? <span className="bd blue">NEW</span> : null}
      </div>
      <div className="nm">{g.title}</div>
      <div className="mt">
        <span><Icon name="players" size={13} />{g.plays}</span>
        {best
          ? <span><Icon name="trophy" size={13} />{(best / 1000).toFixed(1)}s</span>
          : <span><Icon name="field" size={13} />{cast}</span>}
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
