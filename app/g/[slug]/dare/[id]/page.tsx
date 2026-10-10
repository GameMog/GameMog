/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { dareView } from '@/lib/dare';
import { clip, pageMeta } from '../../../../seo';
import { DiscordPill, GlassFont } from '../../../../discord-pill';
import { DarePlay, DareOpened } from './landing';
import '../../../../glass.css';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ slug: string; id: string }> };

/** "DuneKing dared you", or a dare with no name on it. */
const daredBy = (name: string | null) => (name ? `${name} dared you` : 'You have been dared');

/**
 * A dare's link unfurls as the dare: its own card (drawn in the sender's browser, lib/dare-card.ts; the card route
 * sends the game's cover while there is none). og:url is the dare's own address; search engines are sent to the game's page and never index a dare.
 */
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug, id } = await params;
  const d = dareView(id, slug);
  if (!d) return { title: 'GameMog', robots: { index: false, follow: false } };
  const t = d.target;
  const description = clip([
    d.message ? `"${d.message}"` : '',
    t ? `${t.label}: ${t.text}.` : 'I mogged this. Your turn.',
    'Play it free in your browser.',
  ].filter(Boolean).join(' '));
  return pageMeta({
    name: `${daredBy(d.name)}: ${d.game.title}`,
    description,
    path: d.url,
    canonical: `/g/${d.game.slug}`,
    // (always the card's address: without a card it is a short redirect to the cover, so a card uploaded a moment
    // after the dare was made, as the send panel does, still shows)
    image: { url: d.card, alt: `${daredBy(d.name)}: ${d.game.title}`, ...(d.hasCard ? { width: 1200, height: 630 } : {}) },
    noindex: true,
  });
}

/**
 * The dare landing (mockups 3 and 3b, made simpler for someone who has never seen GameMog): one glass card over the
 * game's cover, saying who dared you, what to beat, and one big gold PLAY. MOG IT BACK is the quiet second choice, and
 * the community is a quieter pill under the card. An unknown or hidden dare goes to the game's page.
 */
export default async function DareLanding({ params }: Params) {
  const { slug, id } = await params;
  const d = dareView(id, slug);
  if (!d) redirect(`/g/${encodeURIComponent(slug)}`);
  const g = d.game, t = d.target;
  const sub = t?.sub ? t.sub.split(' · ').filter(Boolean) : [];
  const credit = g.creator || g.parent;
  return (
    <main className="gl dl">
      <GlassFont />
      <DareOpened id={d.id} />
      <div className="dl-bg"><img className="gl-art" src={g.cover} alt="" /></div>
      <div className="dl-top">
        <Link href="/" className="gl-glass gl-chip" aria-label="GameMog home" style={{ height: 38, padding: '0 14px 0 7px', gap: 9 }}>
          <span className="gl-coin" style={{ width: 24, height: 24, fontSize: 8 }} aria-hidden>GM</span><span className="gl-wm">GameMog</span>
        </Link>
      </div>
      <div className="dl-col">
        <section className="gl-glass gl-deep gl-lit dl-card" aria-labelledby="dl-h">
          <p className="gl-cap dl-from" style={{ margin: '0 0 14px' }}>{daredBy(d.name)}</p>
          <h1 id="dl-h" style={{ margin: 0 }}>
            <span className="gl-shout" style={{ display: 'block' }}>I mogged this.</span>
            <span className="gl-shout gl-prize" style={{ display: 'block' }}>Your turn.</span>
          </h1>
          <h2 className="gl-ttl dl-title">{g.title}</h2>
          {credit ? (
            <p className="dl-credit">
              {g.creator ? <>Created by <b>{g.creator}</b></> : null}
              {g.creator && g.parent ? <span aria-hidden style={{ opacity: 0.5 }}> · </span> : null}
              {g.parent ? <>Remixed from <Link href={`/g/${g.parent.slug}`}>{g.parent.title}</Link></> : null}
            </p>
          ) : null}
          {d.message ? <p className="gl-glass gl-light dl-quote"><i aria-hidden>&ldquo;</i>{d.message}</p> : null}
          {t ? (
            <div className="gl-glass gl-lit dl-score">
              <span className="gl-coin" aria-hidden>GM</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="gl-cap">{t.label}</div>
                <div className="gl-ox">{t.text}</div>
              </div>
              {sub.length ? <div className="dl-sub">{sub.map((s, i) => <div key={i}>{s}</div>)}</div> : null}
            </div>
          ) : null}
          <div className="dl-acts">
            <DarePlay href={`/g/${g.slug}?dare=${d.id}&play=1`} />
            <Link className="gl-pill gl-clear" href={`/mog/${g.slug}?dare=${d.id}`}>Mog it back</Link>
          </div>
        </section>
        <div className="dl-under"><DiscordPill /></div>
      </div>
    </main>
  );
}
