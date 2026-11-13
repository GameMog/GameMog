import { createReadStream, statSync } from 'node:fs';
import { Readable } from 'node:stream';
import { townsOn } from '@/lib/hometown/config';
import { bundleFile } from '@/lib/hometown/towns';
import { storyCors, storyPreflight } from '@/lib/storykit-http';
import { builderMode } from '@/lib/hometown-build/access';
import { builderDeps } from '@/lib/hometown-build/server';
import { BUILD_ID, VARIANT, bundleKey, parseKeyString } from '@/lib/hometown-tiles/keys';
import { TOWN_ID } from '@/lib/hometown/ids';

export const runtime = 'nodejs';

/**
 * A stored town bundle's file. Two shapes, both addressed by their lock so the bytes never change (immutable, never
 * transformed; .bin.gz files go out as the gzip bytes they are, octet-stream, no Content-Encoding):
 *   /towns/{placeId}/{buildId}/{tilesId}/{variant}/{file}   the production builder's (lib/hometown-build), from the
 *       store's bundles/ family; variant `full` or `district-{c}-{r}`. Public but unlinked whenever HOMETOWN_BUILDER is
 *       not off (Mog City's engine reads them across origins)
 *   /towns/{placeId}/{buildId}/{tileSetHash}/{file}         the in-process builder's (data/towns/bundles, HOMETOWN_TOWNS=on),
 *       still readable
 * Store-only: a file that is not stored is 404, and nothing here ever builds a town. CORS for Mog City's origin only.
 */
const FOREVER = 'public, max-age=31536000, immutable, no-transform';

export async function GET(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const parts = path ?? [];
  if (parts.length >= 5 && VARIANT.test(parts[3]) && builderMode() !== 'off') {
    const [place, build, tilesId, variant, ...rest] = parts;
    const key = TOWN_ID.test(place) && BUILD_ID.test(build) ? bundleKey(build, place, tilesId, variant, rest.join('/')) : '';
    const k = key ? parseKeyString(key) : null;
    const got = k ? builderDeps().store.get(key) : null;
    if (!got) return new Response('Not found', { status: 404, headers: { 'cache-control': 'no-store', ...storyCors(req) } });
    const headers = { 'content-type': key.endsWith('.json') ? 'application/json' : 'application/octet-stream', 'content-length': String(got.bytes), 'cache-control': FOREVER, etag: got.etag, 'x-content-type-options': 'nosniff', ...storyCors(req) };
    if (req.headers.get('if-none-match') === got.etag) return new Response(null, { status: 304, headers });
    return new Response(req.method === 'HEAD' ? null : new Uint8Array(got.body), { headers });
  }
  if (!townsOn()) return new Response('Not found', { status: 404 });
  const f = bundleFile(parts);
  if (!f) return new Response('Not found', { status: 404, headers: { 'cache-control': 'no-store', ...storyCors(req) } });
  const size = statSync(f.path).size;
  const headers = { 'content-type': f.type, 'content-length': String(size), 'cache-control': FOREVER, 'x-content-type-options': 'nosniff', ...storyCors(req) };
  if (req.method === 'HEAD') return new Response(null, { headers });
  return new Response(Readable.toWeb(createReadStream(f.path)) as ReadableStream<Uint8Array>, { headers });
}
export async function OPTIONS(req: Request) {
  if (!townsOn() && builderMode() === 'off') return new Response('Not found', { status: 404 });
  return storyPreflight(req);
}
