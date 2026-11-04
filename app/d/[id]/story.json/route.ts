import { getDraft } from '@/lib/db';
import { isEpisodeWorld } from '@/lib/episode';
import { storyResponse } from '@/lib/episode-play';

/** A draft episode's story pack (3 Nov): what its preview frame and its test drive load in Mog City. Never kept. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const d = getDraft(id);
  if (!d || d.format !== 'world' || !isEpisodeWorld(d.code)) return new Response('Not found', { status: 404 });
  return storyResponse(req, d.code, 'no-store');
}
