import { ownerVisit } from '@/lib/dare';
import { townStatus as legacyStatus, TOWN_WORDS } from '@/lib/hometown/towns';
import { townsAccess, builderMode } from '@/lib/hometown-build/access';
import { builderDeps } from '@/lib/hometown-build/server';
import { withDrive } from '@/lib/storykit-publish';
import { publicOrigin } from '@/lib/custom-game';
import { townStatus, bestVariant } from '@/lib/hometown-build/towns';
import { storyCors, storyPreflight } from '@/lib/storykit-http';
import { BUILD_ID } from '@/lib/hometown-tiles/keys';
import { storyUpgrade } from '@/lib/storykit-publish';

export const runtime = 'nodejs';

/**
 * GET /api/towns/{placeId}: a town's build as POST /api/towns answers it, never starting one (polled every 2 s).
 * GET /api/towns/{placeId}?build=<buildId>: Mog City's engine poll (SPEC 4.4, every 10 s): the best playable variant of
 * the town at that build, { variant: 'full' | 'district-c-r', tilesId, url }, or 404; `stalled: true` beside a district
 * whose whole-town build has failed for good (lib/hometown-build/towns.ts bestVariant: the engine puts its edge haze down). Public (the bytes it points at
 * are), CORS for Mog City's origin, whenever the production builder is not off. &world=<sha256> (the story world the
 * page plays): `upgrade` { build, tilesId, variant: 'full', url, pack } as well, when that world may play the town's current
 * whole town instead (lib/storykit-upgrade.ts).
 */
export async function GET(req: Request, ctx: { params: Promise<{ placeId: string }> }) {
  const { placeId } = await ctx.params;
  const build = new URL(req.url).searchParams.get('build');
  if (build != null) {
    if (builderMode() === 'off' || !BUILD_ID.test(build) || !/^us-[0-9]{7}$/.test(placeId)) return new Response('Not found', { status: 404, headers: { 'cache-control': 'no-store', ...storyCors(req) } });
    const v = bestVariant(builderDeps(), placeId, build);
    // (&world=<sha256>: the story world the page plays, growing.js. Pinned to this build while the town's current build has
    // its whole town and every place of the world is the same place there: `upgrade`, where the page goes instead,
    // lib/storykit-upgrade.ts. The answer about this build is unchanged, so an engine that does not read it is unchanged)
    const world = new URL(req.url).searchParams.get('world');
    const u = v && world && /^[0-9a-f]{64}$/.test(world) ? storyUpgrade(world, { derive: true }) : null;
    const upgrade = u?.state === 'upgrade' && u.world && u.from.place === placeId && u.from.compiler === build
      ? { build: u.to.compiler, tilesId: u.tilesId, variant: 'full', url: `/towns/${placeId}/${u.to.compiler}/${u.tilesId}/full/`, pack: `/storykit/f/${u.world}.json` } : null;
    return Response.json(v ? (upgrade ? { ...v, upgrade } : v) : { error: 'not built' }, { status: v ? 200 : 404, headers: { 'cache-control': 'no-store', ...storyCors(req) } });
  }
  const access = townsAccess(req, process.env, ownerVisit);
  if (!access) return new Response('Not found', { status: 404 });
  const a = access === 'builder'
    ? await Promise.resolve().then(() => townStatus(builderDeps(), placeId)).catch((e) => { console.error('hometown: towns:', String(e?.message || e).slice(0, 500)); return { status: 503, body: { error: TOWN_WORDS.failed } }; })
    : await legacyStatus(placeId).catch((e) => { console.error('hometown: towns:', String(e?.message || e).slice(0, 500)); return { status: 503, body: { error: TOWN_WORDS.failed } }; });
  // (r7: a town with a playable variant carries its free-roam test drive in Mog City, the card's "Drive around")
  const out = access === 'builder' ? withDrive(a, publicOrigin(req)) : a;
  return Response.json(out.body, { status: out.status, headers: { 'cache-control': 'no-store' } });
}
export async function OPTIONS(req: Request) {
  if (builderMode() === 'off') return new Response('Not found', { status: 404 });
  return storyPreflight(req);
}
