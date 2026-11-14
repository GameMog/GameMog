import { storyStore, bearer, readCapped } from '@/lib/storykit-store';
import { storykitOff, json } from '@/lib/storykit-http';
import { readDriveReport, recordStoryReport } from '@/lib/storykit-publish';
import { afterDriveReach } from '@/lib/storykit-reach';

export const runtime = 'nodejs';

/**
 * The creator's browser's report on a Story Kit draft (authorization: Bearer <token>), after its work
 * (public/storykit/work.js): { missions: [{ id, state: passed|failed, ms }], errors, ms, stages }. The GameMog draft
 * made with this store draft takes it as its test drive (passed only when every mission passed with 0 page errors),
 * and the stored key art as its cover (lib/storykit-publish.ts recordStoryReport). A drive that stopped at a step no player
 * could do (`reach`: a place inside a building, walled in, off the roads) gets the builder's own fix: in a hometown story
 * the place swapped for a reachable one of the same kind (lib/storykit-reach.ts afterDriveReach), told back as `swap` so
 * the work page drives on from that mission; else `reachFix` says why not, and the drive's reason stands.
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
  if (!r) return json({ error: 'No world was built with this draft.' }, 404);
  const fix = rep.reach && !rep.partial ? afterDriveReach(d.id, rep.reach) : null;
  return json({ ok: true, ...r, ...(fix?.swap ? { status: 'unverified', swap: fix.swap } : fix ? { reachFix: fix.why } : {}) });
}
