import { storyStore, bearer } from '@/lib/storykit-store';
import { storykitOff, json } from '@/lib/storykit-http';

export const runtime = 'nodejs';

/**
 * A Story Kit draft's gated source pack (authorization: Bearer <token>): what the creator's browser needs beside the
 * world itself, the people's sheets to forge (public/storykit/work.js). The world (/pack) is what the engine plays.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const off = storykitOff(req); if (off) return off;
  const d = storyStore().auth((await ctx.params).id, bearer(req));
  return d ? json({ pack: JSON.parse(d.pack), state: d.state, parent: d.parent }) : json({ error: 'No such draft, or not yours.' }, 404);
}
