/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { familyByRoot, getGameBySlug, getUnlistedGameBySlug, getPlayableGameById, type FamilyMember, type GameRow } from '@/lib/db';
import { pageMeta } from '../../../seo';
import { GlassFont } from '../../../discord-pill';
import '../../../glass.css';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ slug: string }> };

/** The game a family page was opened from, its family (hidden games never in it) and its original. */
function load(slug: string) {
  const game = getGameBySlug(slug) ?? getUnlistedGameBySlug(slug);
  if (!game) return null;
  const rootId = game.root_id ?? game.id;
  const root: GameRow | undefined = rootId === game.id ? game : getPlayableGameById(rootId);
  return { game, root, members: familyByRoot(rootId), rootId };
}

/**
 * The family as one list, in tree order: the original, then each Mog under the game it was made from, oldest first,
 * indented by how far down it is. A Mog whose parent is hidden sits under the original.
 */
function treeOrder(members: FamilyMember[], rootId: string): { m: FamilyMember; depth: number }[] {
  const ids = new Set(members.map((m) => m.id));
  const kids = new Map<string, FamilyMember[]>();
  const top: FamilyMember[] = [];
  for (const m of [...members].sort((a, b) => a.created_at - b.created_at)) {
    const parent = m.id === rootId ? null : m.parent_id && ids.has(m.parent_id) ? m.parent_id : ids.has(rootId) ? rootId : null;
    if (parent) kids.set(parent, [...(kids.get(parent) ?? []), m]); else top.push(m);
  }
  top.sort((a, b) => (a.id === rootId ? -1 : b.id === rootId ? 1 : a.created_at - b.created_at));
  const out: { m: FamilyMember; depth: number }[] = [];
  const walk = (m: FamilyMember, depth: number) => { out.push({ m, depth }); for (const k of kids.get(m.id) ?? []) walk(k, depth + 1); };
  for (const m of top) walk(m, 0);
  return out;
}

const n = (v: number) => v.toLocaleString('en-US');

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const f = load(slug);
  if (!f) return { title: 'Not found | GameMog' };
  const title = f.root?.title ?? f.game.title;
  // (one page per family: every member's family page points at the original's)
  const canonical = f.root && !getUnlistedGameBySlug(f.root.slug) ? `/g/${f.root.slug}/family` : `/g/${f.game.slug}/family`;
  return pageMeta({
    name: `${title}: the family`,
    description: `${title} and every Mog made from it. Play any of them free, or Mog your own.`,
    path: `/g/${f.game.slug}/family`, canonical, image: { url: `/g/${f.root?.slug ?? f.game.slug}/cover`, alt: title },
  });
}

/**
 * The family tree (mockup 5, simpler): one list, indented by generation. Each row is a cover, a title, who made it,
 * its plays and its Mog-off record, then Play and Mog it. The game the page was opened from is lit.
 */
export default async function FamilyPage({ params }: Params) {
  const { slug } = await params;
  const f = load(slug);
  if (!f) notFound();
  const rows = treeOrder(f.members, f.rootId);
  const title = f.root?.title ?? f.game.title;
  const plays = f.members.reduce((s, m) => s + m.plays, 0);
  return (
    <main className="gl fp">
      <GlassFont />
      <div className="fp-bg"><img className="gl-blurart" src={`/g/${f.root?.slug ?? f.game.slug}/cover`} alt="" /></div>
      <header className="gl-glass fp-bar">
        <Link href="/" className="gl-wm" style={{ textDecoration: 'none' }} aria-label="GameMog home">GameMog</Link>
        <Link href={`/g/${f.game.slug}`} className="gl-glass gl-chip" style={{ height: 34 }}>Back</Link>
      </header>
      <div className="fp-main">
        <p className="gl-cap" style={{ margin: 0 }}>The family</p>
        <h1 className="gl-ttl fp-h">{title}</h1>
        <p className="fp-stats">{n(rows.length)} {rows.length === 1 ? 'version' : 'versions'} · {n(plays)} {plays === 1 ? 'play' : 'plays'}</p>
        <ol className="fp-list">
          {rows.map(({ m, depth }) => {
            const here = m.id === f.game.id;
            const by = m.creator ?? (m.featured ? 'GameMog' : null);
            const fought = m.wins + m.losses;
            return (
              <li key={m.id} className={`gl-glass fp-row${here ? ' gl-lit fp-here' : ''}`} data-depth={Math.min(depth, 3)} aria-current={here ? true : undefined}>
                <Link href={`/g/${m.slug}`} tabIndex={-1} aria-hidden><img src={`/g/${m.slug}/cover`} alt="" loading="lazy" /></Link>
                <div style={{ minWidth: 0 }}>
                  <h2 className="gl-ttl fp-name"><Link href={`/g/${m.slug}`}>{m.title}</Link></h2>
                  <p className="fp-meta">
                    {by ? <>by <b>{by}</b>{' · '}</> : null}
                    {m.id === f.rootId ? 'The original · ' : ''}{n(m.plays)} {m.plays === 1 ? 'play' : 'plays'}
                    {fought ? <span className="fp-mo">{' · '}Mog-offs: {n(m.wins)} won, {n(m.losses)} lost</span> : null}
                  </p>
                  {here ? <span className="gl-cap fp-here-tag">You are here</span> : null}
                </div>
                <div className="fp-acts">
                  <Link className="gl-pill gl-gold" href={`/g/${m.slug}`} aria-label={`Play ${m.title}`}>
                    <svg width="11" height="13" viewBox="0 0 14 16" aria-hidden><path d="M1 1.2v13.6a.7.7 0 0 0 1.05.6l11.2-6.8a.7.7 0 0 0 0-1.2L2.05.6A.7.7 0 0 0 1 1.2Z" fill="currentColor" /></svg>
                    <span>Play</span>
                  </Link>
                  <Link className="gl-pill gl-clear" href={`/mog/${m.slug}`} aria-label={`Mog ${m.title}`}>Mog it</Link>
                </div>
              </li>
            );
          })}
        </ol>
        {rows.length <= 1 ? <p className="fp-meta" style={{ marginTop: 16 }}>No Mogs yet. Make the first one.</p> : null}
      </div>
    </main>
  );
}
