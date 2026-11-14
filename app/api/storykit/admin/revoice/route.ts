import { storyRevoiceOf, storyWorldsToRevoice } from '@/lib/storykit-publish';
import { storykitOff, ownerRequest, json } from '@/lib/storykit-http';

export const runtime = 'nodejs';

/**
 * The owner's voices for a published story world, recorded again (lib/storykit-publish.ts storyWorldsToRevoice and
 * storyRevoiceOf; the page that records them: public/storykit/revoice.html). Owner only, whatever the switch: 404 unless
 * the Story Kit is on for this request and the request carries the owner's admin session, as the patch route.
 *   GET /api/storykit/admin/revoice              -> { worlds: [{ slug, title, city, hidden, lines, voiced, missing, stale }] }
 *   GET /api/storykit/admin/revoice?slug=<slug>  -> { slug, title, from, world, voice, missing } | 404
 * The clips go to the world with the owner's patch (POST /api/storykit/admin/patch), whose checks are StoryStore.patch's.
 */
export async function GET(req: Request) {
  const off = storykitOff(req); if (off) return off;
  if (!ownerRequest(req)) return json({ error: 'Not found.' }, 404);
  const slug = new URL(req.url).searchParams.get('slug');
  if (!slug) return json({ worlds: storyWorldsToRevoice() });
  const r = storyRevoiceOf(slug);
  return r ? json(r) : json({ error: 'No published story world has that slug.' }, 404);
}
