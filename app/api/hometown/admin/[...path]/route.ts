import { adminResponse } from '@/lib/hometown-tiles/http';
import { hometownDeps } from '@/lib/hometown-tiles/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The owner's hometown tools (lib/hometown-tiles/http.ts): status, upload, the GC dry run and apply, the towns asked
 * for. Authorization: Bearer HOMETOWN_ADMIN_TOKEN (entered by the owner on Render; unset, every address here is 404).
 */
type Ctx = { params: Promise<{ path: string[] }> };
const handle = async (req: Request, ctx: Ctx) => adminResponse(req, (await ctx.params).path ?? [], hometownDeps());
export const GET = handle;
export const PUT = handle;
export const POST = handle;
