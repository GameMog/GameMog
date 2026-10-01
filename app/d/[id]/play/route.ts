import { getDraft } from '@/lib/db';
import { renderCustomGame, renderWorldGame, CUSTOM_CSP, worldCsp, publicOrigin } from '@/lib/custom-game';

/**
 * A draft game, before publishing: what the runtime playtest plays, and what
 * the creator previews. Served with the same locked-down policy as a published
 * game, because it is the same untrusted code.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const d = getDraft(id);
  if (!d) return new Response('Not found', { status: 404 });
  const meta = JSON.parse(d.meta);
  const html = d.format === 'world'
    ? renderWorldGame(d.code, meta, `draft-${d.id}`, meta.runtime ?? 1, new URL(req.url).searchParams.get('drive') === '1')
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
