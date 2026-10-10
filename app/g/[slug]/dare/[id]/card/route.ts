import { dareCard } from '@/lib/dare';

export const runtime = 'nodejs';

/**
 * A dare's link preview (og:image): the 1200 x 630 card the sender's browser drew (lib/dare-card.ts), which never
 * changes, so it is cached for good. A dare sent without one previews with its game's cover (a short redirect, so a
 * card added later would show).
 */
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await ctx.params;
  if (!/^[a-z0-9-]+$/.test(slug)) return new Response('Not found', { status: 404 });
  const d = dareCard(id, slug);
  if (!d) return new Response('Not found', { status: 404 });
  if (d.card) {
    return new Response(Buffer.from(d.card), {
      headers: { 'content-type': 'image/jpeg', 'content-length': String(d.card.length), 'cache-control': 'public, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' },
    });
  }
  return new Response(null, { status: 302, headers: { location: `/g/${slug}/cover`, 'cache-control': 'public, max-age=300' } });
}
