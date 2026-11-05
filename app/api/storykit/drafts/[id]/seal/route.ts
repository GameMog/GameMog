import { storyStore, bearer } from '@/lib/storykit-store';
import { storykitOff, json } from '@/lib/storykit-http';

export const runtime = 'nodejs';

/** Freeze a draft's world as it is (authorization: Bearer <token>): { url: /storykit/f/<sha256>.json, hash, bytes }. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const off = storykitOff(req); if (off) return off;
  const s = storyStore(), d = s.auth((await ctx.params).id, bearer(req));
  if (!d) return json({ error: 'No such draft, or not yours.' }, 404);
  const r = s.seal(d);
  return r.ok ? json(r) : json({ error: r.error }, r.status);
}
