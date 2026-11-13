import { storyStore, bearer } from '@/lib/storykit-store';
import { storykitOff, json } from '@/lib/storykit-http';
import { storykitMc, bankedMissions, storyFrameQuery } from '@/lib/storykit-publish';

export const runtime = 'nodejs';

/**
 * A Story Kit draft, with its token (authorization: Bearer <token>).
 *   GET     its files, what is still missing (GLBs, clips), its bytes against the limits and when it expires; and `mc`,
 *           Mog City's origin, where its test drive plays (lib/storykit-publish.ts storykitMc); and `banked`, the missions an
 *           earlier sitting of its test drive passed on the world as it plays now (bankedMissions); and `frame`, the city part
 *           of Mog City's address for this world ('' New York, 'city=sf', a hometown's 'city=pkg&town=...&ts=...': storyFrameQuery; the caller joins it with '&'),
 *           which the test drive (public/storykit/work.js) puts before its pack
 *   DELETE  abandon it now: its rows, then every stored file nothing else points at
 */
type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const off = storykitOff(req); if (off) return off;
  const d = storyStore().auth((await ctx.params).id, bearer(req));
  if (!d) return json({ error: 'No such draft, or not yours.' }, 404);
  const base = JSON.parse(d.pack).base ?? {};
  return json({ ...storyStore().status(d), mc: storykitMc(), banked: bankedMissions(d.id), frame: storyFrameQuery(base.city, base.hometown) });
}

export async function DELETE(req: Request, ctx: Ctx) {
  const off = storykitOff(req); if (off) return off;
  const s = storyStore(), d = s.auth((await ctx.params).id, bearer(req));
  if (!d) return json({ error: 'No such draft, or not yours.' }, 404);
  const r = s.abandon(d);
  return r.ok ? json({ ok: true, freed: r.freed }) : json({ error: r.error }, r.status);
}
