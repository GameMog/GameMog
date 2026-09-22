import { gameCover } from '@/lib/db';

/** The screenshot the runtime playtest took mid-play, used as the game's cover. */
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const jpg = gameCover(slug);
  if (!jpg) return new Response('Not found', { status: 404 });
  return new Response(Buffer.from(jpg), {
    headers: { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=3600' },
  });
}
