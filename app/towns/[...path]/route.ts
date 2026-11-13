import { createReadStream, statSync } from 'node:fs';
import { Readable } from 'node:stream';
import { townsOn } from '@/lib/hometown/config';
import { bundleFile } from '@/lib/hometown/towns';
import { storyCors, storyPreflight } from '@/lib/storykit-http';

export const runtime = 'nodejs';

/**
 * A stored town bundle's file (lib/hometown/bundle.ts): /towns/{placeId}/{buildId}/{tileSetHash}/{geodata.json |
 * citypackage.json | lock.json | data/{terrain,buildings,groundmask}.bin.gz}. Store-only: a file that is not stored is
 * 404, and nothing here ever builds a town (POST /api/towns is the only way in). Addressed by its lock, so the bytes
 * never change: immutable, never transformed, streamed from the disk. The .bin.gz files go out as the gzip bytes they
 * are (octet-stream, no Content-Encoding: Mog City's data loader inflates them itself). Mog City reads them across
 * origins: CORS for its origin only (storyCors, the Story Kit's own rule).
 */
const FOREVER = 'public, max-age=31536000, immutable, no-transform';

export async function GET(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  if (!townsOn()) return new Response('Not found', { status: 404 });
  const { path } = await ctx.params;
  const f = bundleFile(path ?? []);
  if (!f) return new Response('Not found', { status: 404, headers: { 'cache-control': 'no-store', ...storyCors(req) } });
  const size = statSync(f.path).size;
  const headers = { 'content-type': f.type, 'content-length': String(size), 'cache-control': FOREVER, 'x-content-type-options': 'nosniff', ...storyCors(req) };
  if (req.method === 'HEAD') return new Response(null, { headers });
  return new Response(Readable.toWeb(createReadStream(f.path)) as ReadableStream<Uint8Array>, { headers });
}
export async function OPTIONS(req: Request) {
  if (!townsOn()) return new Response('Not found', { status: 404 });
  return storyPreflight(req);
}
