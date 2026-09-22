import { getGameBySlug, bumpPlays } from '@/lib/db';
import { renderGame, GAME_CSP } from '@/lib/engine/shell';
import { renderCustomGame, CUSTOM_CSP } from '@/lib/custom-game';
import type { WorldSpec } from '@/lib/worldspec';

/**
 * The game document itself. Served on its own URL so it can be locked down
 * independently of the site: no same-origin access from the sandboxed frame,
 * a tight CSP, and nothing on this page that can reach a session cookie.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const game = getGameBySlug(slug);
  if (!game) return new Response('Not found', { status: 404 });

  bumpPlays(game.id);
  const custom = game.format === 'custom' && game.code;
  const html = custom
    ? renderCustomGame(game.code!, JSON.parse(game.meta ?? '{}'), game.id)
    : renderGame(JSON.parse(game.spec) as WorldSpec, game.id);

  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'content-security-policy': custom ? CUSTOM_CSP : GAME_CSP,
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      'cache-control': 'no-store',
    },
  });
}
