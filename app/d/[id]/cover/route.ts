import { draftArt, draftCover } from '@/lib/db';

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const shape = new URL(req.url).searchParams.get('shape') === 'square' ? 'square' : 'wide';
  const jpg = draftArt(id, shape) ?? draftCover(id);
  if (!jpg) return new Response('Not found', { status: 404 });
  return new Response(Buffer.from(jpg), { headers: { 'content-type': 'image/jpeg', 'cache-control': 'no-store' } });
}
