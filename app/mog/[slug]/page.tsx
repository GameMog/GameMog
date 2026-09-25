import { notFound } from 'next/navigation';
import Link from 'next/link';
import { SiteHeader, SiteFooter } from '../../header';
import { Cover } from '../../cover';
import { getGameBySlug, getGameById, mogsOf } from '@/lib/db';
import type { WorldSpec } from '@/lib/worldspec';
import { MogComposer } from './composer';

export const dynamic = 'force-dynamic';

/**
 * Mog a game: challenge it with a better variation. The challenger says in a
 * line how to beat it; GameMog gets the original whole and writes the
 * variation; it is raced before it can publish; the original stays credited.
 */
export default async function MogPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const game = getGameBySlug(slug);
  if (!game) notFound();
  const root = game.root_id ? getGameById(game.root_id) : null;
  const mogs = mogsOf(game.id).length;
  return (
    <>
      <SiteHeader />
      <main className="wrap" style={{ paddingBottom: 80, maxWidth: 820 }}>
        <h1 style={{ marginTop: 24, marginBottom: 6 }}>Mog {game.title}</h1>
        <p className="dim" style={{ marginBottom: 16, lineHeight: 1.55, maxWidth: '64ch' }}>
          Challenge it with a better variation. Say how to beat it; GameMog gets the original&apos;s
          code and your idea and writes the variation, and it is raced in a real browser before it can
          publish. Players who have played both pick the better one, and the original is always credited.
        </p>
        <div className="panel" style={{ marginBottom: 16, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ width: 200, aspectRatio: '16 / 9', borderRadius: 8, overflow: 'hidden', background: 'var(--fill)', flex: '0 0 auto' }}>
            {game.format === 'race'
              ? <Cover spec={JSON.parse(game.spec) as WorldSpec} seed={7} />
              // eslint-disable-next-line @next/next/no-img-element
              : <img src={`/g/${game.slug}/cover`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
          </div>
          <div style={{ flex: '1 1 260px' }}>
            <label className="lbl">The game you are challenging</label>
            <p style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.3 }}><Link href={`/g/${game.slug}`}>{game.title}</Link></p>
            <p className="dim" style={{ fontSize: 14, lineHeight: 1.5 }}>{game.tagline}</p>
            <p className="t-meta dim-2" style={{ marginTop: 4 }}>
              Generation {game.generation}
              {root ? <>, from <Link href={`/g/${root.slug}`}>{root.title}</Link></> : null}
              {mogs ? `, ${mogs} Mog${mogs === 1 ? '' : 's'} so far` : ', no Mogs yet'}
            </p>
          </div>
        </div>
        <MogComposer slug={game.slug} title={game.title} />
      </main>
      <SiteFooter />
    </>
  );
}
