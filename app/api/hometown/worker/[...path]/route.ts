import { workerResponse, builderDeps } from '@/lib/hometown-build/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The town-builder workers' protocol (lib/hometown-build/server.ts workerResponse): claim (a 20 s long-poll),
 * heartbeat, objects GET/PUT, complete, fail. Authorization: Bearer HOMETOWN_WORKER_TOKEN; with HOMETOWN_BUILDER=off
 * or no token, every address here is 404. Not under middleware.ts (its matcher never names /api/hometown).
 */
type Ctx = { params: Promise<{ path: string[] }> };
const handle = async (req: Request, ctx: Ctx) => workerResponse(req, (await ctx.params).path ?? [], builderDeps());
export const GET = handle;
export const HEAD = handle;
export const PUT = handle;
export const POST = handle;
