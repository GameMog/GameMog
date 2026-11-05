import { getDraft } from '@/lib/db';
import { renderCustomGame, renderWorldGame, CUSTOM_CSP, worldCsp, publicOrigin } from '@/lib/custom-game';
import { withKartScore } from '@/lib/kart-play';
import { isEpisodeWorld } from '@/lib/episode';
import { mcFrameSrc, draftStoryUrl } from '@/lib/episode-play';
import { storyPlaySrc, storySite } from '@/lib/storykit-publish';
import { storykitForRequest } from '@/lib/storykit-http';

/**
 * A draft game, before publishing: what the runtime playtest plays, and what
 * the creator previews. Served with the same locked-down policy as a published
 * game, because it is the same untrusted code.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const d = getDraft(id);
  if (!d) return new Response('Not found', { status: 404 });
  // a draft Mog City episode (3 Nov) plays on mc.gamemog.com with the draft's story
  if (d.format === 'world' && isEpisodeWorld(d.code)) return new Response(null, { status: 302, headers: { location: mcFrameSrc(draftStoryUrl(d.id, process.env.NODE_ENV === 'production' ? undefined : publicOrigin(req)), `draft-${d.id}`), 'cache-control': 'no-store' } });
  // a draft Story Kit world (STORYKIT=on): Mog City with its store draft's world, sealed as it is now (lib/storykit-publish.ts)
  const story = d.format === 'world' && storykitForRequest(req) ? storyPlaySrc(d.meta, `draft-${d.id}`, storySite(publicOrigin(req))) : null;
  if (story) return new Response(null, { status: 302, headers: { location: story, 'cache-control': 'no-store' } });
  const meta = JSON.parse(d.meta);
  const html = d.format === 'world'
    ? renderWorldGame(d.code, withKartScore(d.code, meta), `draft-${d.id}`, meta.runtime ?? 1, new URL(req.url).searchParams.get('drive') === '1')
    : renderCustomGame(d.code, meta, `draft-${d.id}`);
  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'content-security-policy': d.format === 'world' ? worldCsp(publicOrigin(req)) : CUSTOM_CSP,
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      'cache-control': 'no-store',
    },
  });
}
