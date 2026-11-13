import { ownerVisit } from '@/lib/dare';
import { hometownSearchOn } from '@/lib/places/flag';
import { townsAccess } from '@/lib/hometown-build/access';
import { searchPlaces } from '@/lib/places/search';

export const runtime = 'nodejs';

/**
 * Hometown town search: GET /api/places?q=okem&limit=8, the places for the Create page's town box,
 * best first (lib/places/search.ts, from the offline Census index; no map API). Behind the
 * Hometown flag (lib/places/flag.ts): off, this route is not found.
 */
export async function GET(req: Request) {
  // (or the production builder's runtime switch: HOMETOWN_BUILDER on, or owner for the owner's session)
  if (!hometownSearchOn() && townsAccess(req, process.env, ownerVisit) !== 'builder') return new Response('Not found', { status: 404 });
  const url = new URL(req.url);
  const q = (url.searchParams.get('q') ?? '').slice(0, 80);
  const limit = Math.max(1, Math.min(12, Number(url.searchParams.get('limit')) || 8));
  const t = performance.now();
  const places = searchPlaces(q, { limit }).map(({ score: _score, ...p }) => p);
  const ms = performance.now() - t;
  return Response.json({ q, places }, {
    headers: {
      'cache-control': 'public, max-age=3600',
      'server-timing': `search;dur=${ms.toFixed(2)}`,
    },
  });
}
