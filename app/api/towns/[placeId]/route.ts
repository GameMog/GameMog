import { ownerVisit } from '@/lib/dare';
import { townStatus as legacyStatus, TOWN_WORDS } from '@/lib/hometown/towns';
import { townsAccess, builderMode } from '@/lib/hometown-build/access';
import { builderDeps } from '@/lib/hometown-build/server';
import { townStatus, bestVariant } from '@/lib/hometown-build/towns';
import { storyCors, storyPreflight } from '@/lib/storykit-http';
import { BUILD_ID } from '@/lib/hometown-tiles/keys';

export const runtime = 'nodejs';

/**
 * GET /api/towns/{placeId}: a town's build as POST /api/towns answers it, never starting one (polled every 2 s).
 * GET /api/towns/{placeId}?build=<buildId>: Mog City's engine poll (SPEC 4.4, every 10 s): the best playable variant of
 * the town at that build, { variant: 'full' | 'district-c-r', tilesId, url }, or 404. Public (the bytes it points at
 * are), CORS for Mog City's origin, whenever the production builder is not off.
 */
export async function GET(req: Request, ctx: { params: Promise<{ placeId: string }> }) {
  const { placeId } = await ctx.params;
  const build = new URL(req.url).searchParams.get('build');
  if (build != null) {
    if (builderMode() === 'off' || !BUILD_ID.test(build) || !/^us-[0-9]{7}$/.test(placeId)) return new Response('Not found', { status: 404, headers: { 'cache-control': 'no-store', ...storyCors(req) } });
    const v = bestVariant(builderDeps(), placeId, build);
    return Response.json(v ?? { error: 'not built' }, { status: v ? 200 : 404, headers: { 'cache-control': 'no-store', ...storyCors(req) } });
  }
  const access = townsAccess(req, process.env, ownerVisit);
  if (!access) return new Response('Not found', { status: 404 });
  const a = access === 'builder'
    ? await Promise.resolve().then(() => townStatus(builderDeps(), placeId)).catch((e) => { console.error('hometown: towns:', String(e?.message || e).slice(0, 500)); return { status: 503, body: { error: TOWN_WORDS.failed } }; })
    : await legacyStatus(placeId).catch((e) => { console.error('hometown: towns:', String(e?.message || e).slice(0, 500)); return { status: 503, body: { error: TOWN_WORDS.failed } }; });
  return Response.json(a.body, { status: a.status, headers: { 'cache-control': 'no-store' } });
}
export async function OPTIONS(req: Request) {
  if (builderMode() === 'off') return new Response('Not found', { status: 404 });
  return storyPreflight(req);
}
