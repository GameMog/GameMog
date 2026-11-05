import { storyStore } from '@/lib/storykit-store';
import { storykitOff, json, storyCors, storyPreflight } from '@/lib/storykit-http';

export const runtime = 'nodejs';

/**
 * A draft's world as the engine plays it (Mog City reads it on a dev server; a test drive plays its sealed world): the runner's pack with each stored GLB, clip and
 * picture by its content-hashed URL. The draft's id is the key to read it, as /d/<id>/play is for a written world;
 * writing needs the token. It changes with every upload, so it is never cached; a sealed world is its own
 * content-hashed .json (/storykit/f/<sha256>.json).
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const off = storykitOff(req, { read: true }); if (off) return off;
  const w = storyStore().world((await ctx.params).id);
  // (a local Mog City may read a draft's world on a dev server: CORS for Mog City's origin only)
  const r = w ? json(w) : json({ error: 'No such draft.' }, 404);
  for (const [k, v] of Object.entries(storyCors(req))) r.headers.set(k, v);
  return r;
}

export async function OPTIONS(req: Request) {
  const off = storykitOff(req, { read: true }); if (off) return off;
  return storyPreflight(req);
}
