import { publicResponse } from '@/lib/hometown-tiles/http';
import { hometownDeps } from '@/lib/hometown-tiles/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Hometown towns from GameMog's own disk (lib/hometown-tiles/http.ts): tiles, session descriptors and build records,
 * and /places/{id}. Behind HOMETOWN_TILES=on (off by default: every address here is 404).
 */
type Ctx = { params: Promise<{ path: string[] }> };
const handle = async (req: Request, ctx: Ctx) => publicResponse(req, (await ctx.params).path ?? [], hometownDeps());
export const GET = handle;
export const HEAD = handle;
export const OPTIONS = handle;
