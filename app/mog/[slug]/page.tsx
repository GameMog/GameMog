import { notFound } from 'next/navigation';
import Link from 'next/link';
import { SiteHeader, SiteFooter } from '../../header';
import { Cover } from '../../cover';
import { getGameBySlug, getGameById, getGameBySlugForOwner, mogsOf } from '@/lib/db';
import type { WorldSpec } from '@/lib/worldspec';
import type { Metadata } from 'next';
import { MogComposer } from './composer';
import { optionsOf } from '@/lib/world-options';
import { clip, pageMeta } from '../../seo';
import { getDare } from '@/lib/dare';
import { canMog, MOG_SOON, worldMode } from '@/lib/custom-game';
import { storyOf, storyCityName } from '@/lib/storykit-site';
import { storykitForViewer } from '@/lib/storykit-http';
import { storykitMode } from '@/lib/storykit-switch';
import { StoryMogComposer } from '../../create/story';
import { mogCityStoryFor, MOG_CITY_STORY_MOG } from '../../mog-city-mog';
import { isMogCityEpisode } from '@/lib/storykit-mogcity';
import { Lock } from '../../create/story-show';

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
  // (STORYKIT=owner: the owner's story worlds are published hidden, so the owner's session also finds a hidden story
  // world here to Mog it; nothing else changes, and nobody else's lookup does: lib/storykit-switch.ts)
  const storyOpen = await storykitForViewer();
  const game = getGameBySlug(slug) ?? (storyOpen && storykitMode() === 'owner' ? ((g) => (g && storyOf(g, true) ? g : undefined))(getGameBySlugForOwner(slug)) : undefined);
  if (!game) notFound();
  // a dare's "Mog it back" (/mog/<slug>?dare=<id>): kept only when it is a live dare on this very game
  const asked = (await searchParams).dare;
  const dare = typeof asked === 'string' && getDare(asked)?.game_id === game.id ? asked : null;
  const root = game.root_id ? getGameById(game.root_id) : null;
  const mogs = mogsOf(game.id).length;
  // (a kind of game that cannot be mogged yet says so and offers no build, and app/api/generate/route.ts refuses one
  // too: lib/custom-game.ts canMog. A penalty shootout can be, 13 Oct: its composer offers its own ideas)
  // a Story Kit world (STORYKIT=on, lib/storykit-site.ts): its Mog keeps its city, shown locked, and remixes the rest
  // (/mog/mog-city, 5 Nov: the 3 Nov episode's Mog is a Story Kit Mog of Mog City's own story when that is live for this
  // viewer, app/mog-city-mog.ts: the same story composer, New York locked, with Mog City's people to remake and its
  // missions kept; the card below stays /g/mog-city's own, and the build takes the own world as the parent)
  const mcStory = isMogCityEpisode(game) ? await mogCityStoryFor(storyOpen) : undefined;
  const mcCity = mcStory ? storyOf(mcStory, true) : null;
  const story = mcCity ?? storyOf(game, storyOpen);
  const open = story ? true : canMog(game);
  const kind = worldMode(game.code, game.meta);
  return (
    <>
      <SiteHeader />
      <main className="wrap" style={{ paddingBottom: 80, maxWidth: 820 }}>
        <h1 style={{ marginTop: 24, marginBottom: 6 }}>Mog {game.title}</h1>
        {/* (a penalty shootout is played, not raced, before it can publish, 13 Oct) */}
        {mcCity ? (
          <p className="dim" style={{ marginBottom: 16, lineHeight: 1.55, maxWidth: '64ch' }}>
            Remix Mog City&apos;s story. The city stays {storyCityName(mcCity.city)}, street for street, and so do its kinds
            of mission (drives, chases, fights, searches); the story, Dan, Jane, Mr. Big and the Suits, their cars, their
            lines and the season are yours to change. Your browser forges the remade people and records the changed lines, and plays every mission
            before it can publish. The original is always credited.
          </p>
        ) : story ? (
          <p className="dim" style={{ marginBottom: 16, lineHeight: 1.55, maxWidth: '64ch' }}>
            Remix the story. The city stays {storyCityName(story.city)}, street for street; the story, the missions, the
            people, their cars and their voices are yours to change. Your browser forges the new people and records the
            new lines, and plays every mission before it can publish. The original is always credited.
          </p>
        ) : open && kind === 'episode' ? (
          <p className="dim" style={{ marginBottom: 16, lineHeight: 1.55, maxWidth: '64ch' }}>
            Challenge it with a better episode. Say how to beat it; GameMog gets the episode&apos;s story and your idea
            and writes your version of it, and Mog City loads it in your browser before it can publish. Players who
            have played both pick the better one, and the original is always credited.
          </p>
        ) : open && kind === 'shootout' ? (
          <p className="dim" style={{ marginBottom: 16, lineHeight: 1.55, maxWidth: '64ch' }}>
            Challenge it with a better variation. Say how to beat it; GameMog gets the original&apos;s
            code and your idea and writes the variation, and it is played in a real browser before it can
            publish. Players who have played both pick the better one, and the original is always credited.
          </p>
        ) : open ? (
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
            {story ? <p className="skchip" style={{ marginTop: 8 }}><Lock />{storyCityName(story.city)}</p> : null}
            <p className="t-meta dim-2" style={{ marginTop: 4 }}>
              Generation {game.generation}
              {root ? <>, from <Link href={`/g/${root.slug}`}>{root.title}</Link></> : null}
              {mogs ? `, ${mogs} Mog${mogs === 1 ? '' : 's'} so far` : ', no Mogs yet'}
            </p>
          </div>
        </div>
        {story
          ? <StoryMogComposer slug={game.slug} title={mcCity ? 'Mog City' : game.title} city={story.city} cityName={storyCityName(story.city)} dare={dare} {...(mcCity ? MOG_CITY_STORY_MOG : {})} />
          : open
          ? <MogComposer slug={game.slug} title={game.title} inherited={optionsOf(game)} dare={dare} kind={kind} />
          : <Link className="btn big" href={`/g/${game.slug}`}>Play {game.title}</Link>}
      </main>
      <SiteFooter />
    </>
  );
}
