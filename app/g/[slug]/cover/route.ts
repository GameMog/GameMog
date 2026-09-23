import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gameArt, gameCover } from '@/lib/db';

/** The screenshot the runtime playtest took mid-play, used as the game's cover. */
export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  if (!/^[a-z0-9-]+$/.test(slug)) return new Response('Not found', { status: 404 });
  const shape = new URL(req.url).searchParams.get('shape') === 'square' ? 'square' : 'wide';
  const suffix = shape === 'square' ? 'icon' : 'wide';
  const path = join(process.cwd(), 'public', 'media', 'art', `${slug}-${suffix}.jpg`);
  const jpg = existsSync(path) ? readFileSync(path) : gameArt(slug, shape) ?? gameCover(slug);
  if (!jpg) return new Response('Not found', { status: 404 });
  return new Response(Buffer.from(jpg), {
    headers: { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=3600' },
  });
}
