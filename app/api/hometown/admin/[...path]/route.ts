import { adminResponse } from '@/lib/hometown-tiles/http';
import { hometownDeps } from '@/lib/hometown-tiles/server';
import { BUILDER_ADMIN, builderAdminResponse, builderDeps } from '@/lib/hometown-build/server';
import { onBundleStored } from '@/lib/hometown-build/towns';
import { ownerVisit } from '@/lib/dare';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The owner's hometown tools (lib/hometown-tiles/http.ts): status, upload, the GC dry run and apply, the towns asked
 * for. Authorization: Bearer HOMETOWN_ADMIN_TOKEN (entered by the owner on Render; unset, every address here is 404).
 * The production builder's (lib/hometown-build/server.ts, HOMETOWN_BUILDER not off): builder (status), prewarm,
 * loadtest, ttfd, with the bearer token or the owner's /admin session.
 */
type Ctx = { params: Promise<{ path: string[] }> };
const handle = async (req: Request, ctx: Ctx) => {
  const parts = (await ctx.params).path ?? [];
  if (BUILDER_ADMIN.has(parts[0])) return builderAdminResponse(req, parts, builderDeps(), ownerVisit(req));
  const d = hometownDeps();
  return adminResponse(req, parts, { ...d, afterPut: (k) => { if (d.cfg.builder !== 'off') onBundleStored(builderDeps(d.cfg), k); } });
};
export const GET = handle;
export const PUT = handle;
export const POST = handle;
