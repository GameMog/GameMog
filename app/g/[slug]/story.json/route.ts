import { getGameBySlug, getUnlistedGameBySlug, getGameBySlugForOwner } from '@/lib/db';
import { COOKIE, validSession } from '../../../admin/session';
import { isEpisodeWorld, storyOf } from '@/lib/episode';
import { storyResponse } from '@/lib/episode-play';
import { publicOrigin } from '@/lib/custom-game';
import { siteUrl } from '../../../seo';

/**
 * A Mog City episode's story pack (3 Nov), read by Mog City on mc.gamemog.com (?story=): the pack as JSON, readable
 * across origins by Mog City only. Hidden and unlisted as the play route: an unlisted game for anyone with its link, any
 * other hidden one only for the owner's session. At its version (?v=, the play frame's address for it) and on the
 * site's own address an edge may keep it for a day, as the play document.
 */
export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const owner = () => validSession(req.headers.get('cookie')?.match(new RegExp(`(?:^|; )${COOKIE}=([^;]+)`))?.[1]);
  const open = getGameBySlug(slug) ?? getUnlistedGameBySlug(slug);
  const game = open ?? (owner() ? getGameBySlugForOwner(slug) : undefined);
  if (!game || game.format !== 'world' || !isEpisodeWorld(game.code)) return new Response('Not found', { status: 404 });
  const v = storyOf(game.code)!.hash.slice(0, 16);
  const shared = !!open && new URL(req.url).searchParams.get('v') === v && publicOrigin(req) === siteUrl().origin;
  return storyResponse(req, game.code, shared ? 'public, max-age=0, s-maxage=86400, stale-while-revalidate=600, no-transform' : open ? 'private, no-cache' : 'no-store');
}
