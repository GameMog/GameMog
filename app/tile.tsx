import Link from 'next/link';
import { Cover } from './cover';
import { Icon } from './header';
import type { GameRow } from '@/lib/db';
import type { WorldSpec } from '@/lib/worldspec';

const NEW_MS = 1000 * 60 * 60 * 36;

export function Tile({ g, i = 0, best }: { g: GameRow; i?: number; best?: number }) {
  const spec = JSON.parse(g.spec) as WorldSpec;
  const isNew = Date.now() - g.created_at < NEW_MS;
  return (
    <Link href={`/g/${g.slug}`} className="tl">
      <div className="th">
        <Cover spec={spec} seed={i} />
        {g.featured ? <span className="bd">FEATURED</span> : isNew ? <span className="bd blue">NEW</span> : null}
      </div>
      <div className="nm">{g.title}</div>
      <div className="mt">
        <span><Icon name="players" />{g.plays}</span>
        {best ? <span><Icon name="trophy" />{(best / 1000).toFixed(1)}s</span>
              : <span><Icon name="field" />{spec.racers.length}</span>}
      </div>
    </Link>
  );
}
