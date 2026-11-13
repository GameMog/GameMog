import { townsOn } from '@/lib/hometown/config';
import { townStatus } from '@/lib/hometown/towns';

export const runtime = 'nodejs';

/** GET /api/towns/{placeId}: a town's build as POST /api/towns answers it, never starting one (polled every 2 s). */
export async function GET(_req: Request, ctx: { params: Promise<{ placeId: string }> }) {
  if (!townsOn()) return new Response('Not found', { status: 404 });
  const { placeId } = await ctx.params;
  const a = await townStatus(placeId);
  return Response.json(a.body, { status: a.status, headers: { 'cache-control': 'no-store' } });
}
