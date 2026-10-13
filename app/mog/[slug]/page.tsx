import { notFound } from 'next/navigation';
import Link from 'next/link';
import { SiteHeader, SiteFooter } from '../../header';
import { Cover } from '../../cover';
import { getGameBySlug, getGameById, mogsOf } from '@/lib/db';
import type { WorldSpec } from '@/lib/worldspec';
import type { Metadata } from 'next';
import { MogComposer } from './composer';
import { optionsOf } from '@/lib/world-options';
import { clip, pageMeta } from '../../seo';
import { getDare } from '@/lib/dare';
import { canMog, MOG_SOON } from '@/lib/custom-game';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const game = getGameBySlug(slug);
  if (!game) return { title: 'Not found | GameMog' };
  return pageMeta({
    name: `Mog ${game.title}`, path: `/mog/${slug}`, image: { url: `/g/${slug}/cover`, alt: game.title },
    description: clip(`Think you can beat ${game.title}? Say how in one line and GameMog builds your version, credited to the original.`),
  });
}

/**
 * Mog a game: challenge it with a better variation. The challenger says in a
 * line how to beat it; GameMog gets the original whole and writes the
 * variation; it is raced before it can publish; the original stays credited.
 */
export default async function MogPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ dare?: string | string[] }> }) {
  const { slug } = await params;
  const game = getGameBySlug(slug);
  if (!game) notFound();
  // a dare's "Mog it back" (/mog/<slug>?dare=<id>): kept only when it is a live dare on this very game
  const asked = (await searchParams).dare;
  const dare = typeof asked === 'string' && getDare(asked)?.game_id === game.id ? asked : null;
  const root = game.root_id ? getGameById(game.root_id) : null;
  const mogs = mogsOf(game.id).length;
  // (a game that cannot be mogged yet, 12 Oct: a penalty shootout; the page says so and offers no build, and
  // app/api/generate/route.ts refuses one too)
  const open = canMog(game);
  return (
    <>
      <SiteHeader />
      <main className="wrap" style={{ paddingBottom: 80, maxWidth: 820 }}>
        <h1 style={{ marginTop: 24, marginBottom: 6 }}>Mog {game.title}</h1>
        {open ? (
          <p className="dim" style={{ marginBottom: 16, lineHeight: 1.55, maxWidth: '64ch' }}>
            Challenge it with a better variation. Say how to beat it; GameMog gets the original&apos;s
            code and your idea and writes the variation, and it is raced in a real browser before it can
            publish. Players who have played both pick the better one, and the original is always credited.
          </p>
        ) : <p className="dim" style={{ marginBottom: 16, lineHeight: 1.55, maxWidth: '64ch' }}>{MOG_SOON}</p>}
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
        {open
          ? <MogComposer slug={game.slug} title={game.title} inherited={optionsOf(game)} dare={dare} />
          : <Link className="btn big" href={`/g/${game.slug}`}>Play {game.title}</Link>}
      </main>
      <SiteFooter />
    </>
  );
}
