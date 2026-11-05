import { storyStore, bearer, readCapped } from '@/lib/storykit-store';
import { storykitOff, json } from '@/lib/storykit-http';
import { readDriveReport, recordStoryReport } from '@/lib/storykit-publish';

export const runtime = 'nodejs';

/**
 * The creator's browser's report on a Story Kit draft (authorization: Bearer <token>), after its work
 * (public/storykit/work.js): { missions: [{ id, state: passed|failed, ms }], errors, ms, stages }. The GameMog draft
 * made with this store draft takes it as its test drive (passed only when every mission passed with 0 page errors),
 * and the stored key art as its cover (lib/storykit-publish.ts recordStoryReport).
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const off = storykitOff(req); if (off) return off;
  const s = storyStore(), d = s.auth((await ctx.params).id, bearer(req));
  if (!d) return json({ error: 'No such draft, or not yours.' }, 404);
  if (d.state === 'kept') return json({ error: 'A published world is not changed. Mog it instead.' }, 409);
  const body = await readCapped(req, 16_000);
  let rep = null;
  try { rep = body ? readDriveReport(JSON.parse(new TextDecoder().decode(body))) : null; } catch { rep = null; }
  if (!rep) return json({ error: 'A report is { missions: [{ id, state }], errors }.' }, 400);
  const r = await recordStoryReport(d.id, JSON.parse(d.pack), rep);
  return r ? json({ ok: true, ...r }) : json({ error: 'No world was built with this draft.' }, 404);
}
