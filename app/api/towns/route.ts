import { townsOn } from '@/lib/hometown/config';
import { requestTown } from '@/lib/hometown/towns';
import { clientKey } from '@/lib/dare';

export const runtime = 'nodejs';

/**
 * POST /api/towns { placeId: "us-<GEOID>" }: the only way a town build starts (Hometown, lib/hometown/towns.ts).
 * 200 { state: 'ready', lock, town } for a town built already (never limited); 202 { state, stage, done, total,
 * position, etaS } while it is queued or building (the Create page polls GET /api/towns/{placeId}); 400 / 404 a bad or
 * unknown place; 429 too many new towns from one address; 503 the queue full or the day's new towns built.
 * Behind HOMETOWN_TOWNS=on: off, not found.
 */
export async function POST(req: Request) {
  if (!townsOn()) return new Response('Not found', { status: 404 });
  let body: { placeId?: unknown };
  try { body = await req.json(); } catch { return Response.json({ error: 'Malformed request.' }, { status: 400, headers: { 'cache-control': 'no-store' } }); }
  const a = await requestTown(String(body?.placeId ?? ''), clientKey(req));
  return Response.json(a.body, { status: a.status, headers: { 'cache-control': 'no-store' } });
}
