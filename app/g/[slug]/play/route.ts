import { getGameBySlug, bumpPlays } from '@/lib/db';
import { renderGame, GAME_CSP } from '@/lib/engine/shell';
import { renderCustomGame, renderWorldGame, CUSTOM_CSP, worldCsp } from '@/lib/custom-game';
import type { WorldSpec } from '@/lib/worldspec';

/**
 * The game document itself. Served on its own URL so it can be locked down
 * independently of the site: no same-origin access from the sandboxed frame,
 * a tight CSP, and nothing on this page that can reach a session cookie.
 */
export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const game = getGameBySlug(slug);
  if (!game) return new Response('Not found', { status: 404 });

  bumpPlays(game.id);
  const custom = (game.format === 'custom' || game.format === 'world') && game.code;
  const meta = JSON.parse(game.meta ?? '{}');
  const html = !custom
    ? renderGame(JSON.parse(game.spec) as WorldSpec, game.id)
    : game.format === 'world'
      ? renderWorldGame(game.code!, meta, game.id, meta.runtime ?? 1)
      : renderCustomGame(game.code!, meta, game.id);

  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'content-security-policy': !custom ? GAME_CSP : game.format === 'world' ? worldCsp(new URL(req.url).origin) : CUSTOM_CSP,
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      'cache-control': 'no-store',
    },
  });
}
