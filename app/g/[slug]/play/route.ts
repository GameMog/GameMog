import { getGameBySlug, getUnlistedGameBySlug, getGameBySlugForOwner } from '@/lib/db';
import { COOKIE, validSession } from '../../../admin/session';
import { GAME_CSP } from '@/lib/engine/shell';
import { CUSTOM_CSP, worldCsp, publicOrigin } from '@/lib/custom-game';
import { playPage } from '@/lib/play-page';
import { siteUrl } from '../../../seo';

/**
 * The game document itself. Served on its own URL so it can be locked down
 * independently of the site: no same-origin access from the sandboxed frame,
 * a tight CSP, and nothing on this page that can reach a session cookie.
 *
 * Served from memory (lib/play-page.ts, 10 Oct: a wave of plays must not take the server down), precompressed, with
 * an ETag a browser revalidates against. At its version (?v=, the game page's address for it: playSrc) and on the
 * site's own address, an edge may keep it for a day: that address only ever names these bytes. Anything else (no
 * version, an old one, a game only the owner can open, another host) is never kept by an edge. A play is counted
 * from the game page's view beacon now, not here (lib/play-page.ts countPagePlay).
 */
export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  // an unlisted game plays for anyone with its link; any other hidden game only for the owner's session (the
  // frame's request carries the site's cookie)
  const owner = () => validSession(req.headers.get('cookie')?.match(new RegExp(`(?:^|; )${COOKIE}=([^;]+)`))?.[1]);
  const open = getGameBySlug(slug) ?? getUnlistedGameBySlug(slug);
  const game = open ?? (owner() ? getGameBySlugForOwner(slug) : undefined);
  if (!game) return new Response('Not found', { status: 404 });

  const page = playPage(game);
  const custom = (game.format === 'custom' || game.format === 'world') && game.code;
  const origin = publicOrigin(req);
  // (the CSP names the address the browser used, so only the site's own address may be kept at its edge: a forwarded
  // host it does not know can never leave a page whose assets are shut for everyone)
  const shared = !!open && new URL(req.url).searchParams.get('v') === page.v && origin === siteUrl().origin;
  const headers: Record<string, string> = {
    'content-type': 'text/html; charset=utf-8',
    'content-security-policy': !custom ? GAME_CSP : game.format === 'world' ? worldCsp(origin) : CUSTOM_CSP,
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    // no-transform: an edge must hand on these bytes as they are (an injected script would meet the CSP)
    'cache-control': shared ? 'public, max-age=0, s-maxage=86400, stale-while-revalidate=600, no-transform'
      : open ? 'private, no-cache' : 'no-store',
    etag: page.etag,
    vary: 'accept-encoding',
  };
  const seen = req.headers.get('if-none-match');
  if (seen && seen.split(',').some((t) => t.trim().replace(/^W\//, '') === page.etag.slice(2))) return new Response(null, { status: 304, headers });

  // (an encoding the browser lists without q=0; the compressed copies are ready a moment after the first assembly)
  const listed = (req.headers.get('accept-encoding') ?? '').toLowerCase().split(',').map((p) => p.trim().split(/\s*;\s*q=/));
  const accepts = (enc: string) => listed.some(([name, q]) => name === enc && (q === undefined || Number(q) > 0));
  const [body, encoding] = page.br && accepts('br') ? [page.br, 'br'] : page.gz && accepts('gzip') ? [page.gz, 'gzip'] : [page.body, null];
  if (encoding) headers['content-encoding'] = encoding;
  headers['content-length'] = String(body.length);
  return new Response(new Uint8Array(body.buffer as ArrayBuffer, body.byteOffset, body.length), { headers });
}
