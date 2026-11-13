import { ownerVisit } from '@/lib/dare';
import { requestTown as legacyRequest, TOWN_WORDS } from '@/lib/hometown/towns';
import { townClientKey } from '@/lib/hometown/client';
import { townsAccess, builderMode } from '@/lib/hometown-build/access';
import { builderDeps } from '@/lib/hometown-build/server';
import { requestTown } from '@/lib/hometown-build/towns';

export const runtime = 'nodejs';

/**
 * POST /api/towns { placeId: "us-<GEOID>" }: the only way a town build starts.
 * HOMETOWN_BUILDER=on|owner (the production builder, lib/hometown-build/towns.ts; owner: the owner's /admin session
 * only): the town's jobs go on the durable queue and workers build them. 200 { state: 'ready', lock, town } for a town
 * built already (never limited); 202 { state, stage, done, total, position, etaS, phase, district, etaDriveS, etaFullS,
 * lock? } while it builds (lock v3 once its frame is in: the story may start); 400 / 404 a bad or unknown place; 429 too
 * many new towns from one address; 503 busy (with the wait in minutes and the 3 nearest built towns).
 * HOMETOWN_BUILDER=off: the in-process builder behind HOMETOWN_TOWNS=on (local), as before; else not found.
 */
export async function POST(req: Request) {
  const access = townsAccess(req, process.env, ownerVisit);
  if (!access) return new Response('Not found', { status: 404 });
  let body: { placeId?: unknown };
  try { body = await req.json(); } catch { return Response.json({ error: 'Malformed request.' }, { status: 400, headers: { 'cache-control': 'no-store' } }); }
  const placeId = String(body?.placeId ?? '');
  const a = access === 'builder'
    ? await Promise.resolve().then(() => requestTown(builderDeps(), placeId, townClientKey(req), builderMode() === 'owner' ? 'owner-test' : 'player')).catch((e) => { console.error('hometown: towns:', String(e?.message || e).slice(0, 500)); return { status: 503, body: { error: TOWN_WORDS.failed } }; })
    // (no compiler on this server, or its build id unreadable: a 503 in the town card's words, not a bare 500)
    : await legacyRequest(placeId, townClientKey(req)).catch((e) => { console.error('hometown: towns:', String(e?.message || e).slice(0, 500)); return { status: 503, body: { error: TOWN_WORDS.failed } }; });
  return Response.json(a.body, { status: a.status, headers: { 'cache-control': 'no-store' } });
}
