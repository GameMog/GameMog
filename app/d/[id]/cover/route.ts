import { draftCover } from '@/lib/db';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const jpg = draftCover(id);
  if (!jpg) return new Response('Not found', { status: 404 });
  return new Response(Buffer.from(jpg), { headers: { 'content-type': 'image/jpeg', 'cache-control': 'no-store' } });
}
