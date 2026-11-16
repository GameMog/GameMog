import { readCapped } from '@/lib/storykit-store';
import { saveStoryKeyArt, storyKeyArtSrc, storySite, storyWorldsWithoutArt } from '@/lib/storykit-publish';
import { publicOrigin } from '@/lib/custom-game';
import { storykitOff, ownerRequest, json } from '@/lib/storykit-http';
import { crossOriginRefusal } from '@/lib/same-origin';

export const runtime = 'nodejs';

/**
 * The owner's key art for a published story world, taken again (lib/storykit-publish.ts saveStoryKeyArt; the page that
 * takes it: public/storykit/keyart.html). Owner only, whatever the switch: 404 unless the Story Kit is on for this request
 * and the request carries the owner's admin session, as the patch route.
 *   GET  /api/storykit/admin/keyart               -> { missing: [{ slug, title, city, hidden }] } (story worlds with no key art)
 *   GET  /api/storykit/admin/keyart?slug=<slug>   -> { slug, title, src, mc, hasArt } (where the browser plays it) | 404
 *   POST /api/storykit/admin/keyart { slug, wide, square } (base64 JPEGs, Mog City's keyart message)
 *        -> 200 { ok, slug, titled } | 404 | 413 | 422 { error }
 * Nothing about the world changes: its sealed world, its play and its Mogs are as they were; only the game's cover and art.
 */
export async function GET(req: Request) {
  const off = storykitOff(req); if (off) return off;
  if (!ownerRequest(req)) return json({ error: 'Not found.' }, 404);
  const slug = new URL(req.url).searchParams.get('slug');
  if (!slug) return json({ missing: storyWorldsWithoutArt() });
  const s = storyKeyArtSrc(slug, storySite(publicOrigin(req)));
  return s ? json(s) : json({ error: 'No published story world has that slug.' }, 404);
}

const MAX = 12 * 1024 * 1024;
export async function POST(req: Request) {
  const off = storykitOff(req); if (off) return off;
  if (!ownerRequest(req)) return json({ error: 'Not found.' }, 404);
  const cross = crossOriginRefusal(req); if (cross) return cross;   // (the owner's cookie, from another origin: lib/same-origin.ts)
  const raw = await readCapped(req, MAX);
  if (!raw) return json({ error: 'At most 12 MB.' }, 413);
  let body: { slug?: unknown; wide?: unknown; square?: unknown };
  try { body = JSON.parse(new TextDecoder().decode(raw)); } catch { return json({ error: 'Send JSON: { slug, wide, square }.' }, 400); }
  const b64 = (v: unknown) => (typeof v === 'string' && /^[A-Za-z0-9+/]+={0,2}$/.test(v) ? new Uint8Array(Buffer.from(v, 'base64')) : null);
  const wide = b64(body?.wide), square = b64(body?.square);
  if (!wide || !square) return json({ error: 'wide and square: base64 JPEGs.' }, 400);
  const r = await saveStoryKeyArt(body?.slug, wide, square);
  return r.ok ? json(r) : json({ error: r.error }, r.status);
}
