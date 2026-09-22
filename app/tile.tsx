import Link from 'next/link';
import { Cover } from './cover';
import { Stat } from './header';
import type { GameRow } from '@/lib/db';
import type { WorldSpec } from '@/lib/worldspec';

const FRESH_MS = 1000 * 60 * 60 * 24 * 3;

export function Tile({ g, i = 0 }: { g: GameRow; i?: number }) {
  const spec = JSON.parse(g.spec) as WorldSpec;
  const fresh = Date.now() - g.created_at < FRESH_MS;
  return (
    <Link href={`/g/${g.slug}`} className="tile">
      <div className="art">
        <Cover spec={spec} seed={i} />
        {g.featured ? <span className="badge">FEATURED</span> : fresh ? <span className="badge" style={{ background: 'var(--accent)' }}>NEW</span> : null}
      </div>
      <div className="nm">{g.title}</div>
      <div className="stats">
        <Stat icon="people">{g.plays}</Stat>
        <Stat icon="flag">{spec.racers.length}</Stat>
        <Stat icon="clock">{spec.difficulty}</Stat>
      </div>
    </Link>
  );
}
