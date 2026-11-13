import { ownerVisit } from '@/lib/dare';
import { townBoxEnabled } from '@/lib/hometown-build/access';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/towns/enabled: { enabled } for this request (HOMETOWN_BUILDER owner: the owner's session only). The Create
 *  page's town box asks this at run time instead of the build-time NEXT_PUBLIC_HOMETOWN_SEARCH. */
export async function GET(req: Request) {
  const enabled = townBoxEnabled(req, process.env, ownerVisit);
  if (!enabled) return new Response('Not found', { status: 404, headers: { 'cache-control': 'no-store' } });
  return Response.json({ enabled: true }, { headers: { 'cache-control': 'no-store, private' } });
}
