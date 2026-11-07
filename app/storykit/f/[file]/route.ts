import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { storyStore, BLOB_FILE } from '@/lib/storykit-store';
import { storykitOn } from '@/lib/storykit-store';
import { storyCors, storyPreflight } from '@/lib/storykit-http';

export const runtime = 'nodejs';

/**
 * A stored Story Kit file by the SHA-256 of its bytes (lib/storykit-store.ts): /storykit/f/<sha256>.<ext>. The name is
 * the content, so the bytes never change: a year in every cache, immutable, never transformed (the GLBs and clips are
 * read byte for byte). A file no draft points at any more is gone (404). Mog City (mc.gamemog.com, and a local one on a
 * dev server) reads a world and its files from here across origins: CORS for its origin only (storyCors). Mog City's
 * reads carry no cookie, so with STORYKIT=owner these answer too (by their unguessable names, which only the owner's
 * pages hand out; lib/storykit-switch.ts).
 */
const FOREVER = 'public, max-age=31536000, immutable, no-transform';

export async function GET(req: Request, ctx: { params: Promise<{ file: string }> }) {
  if (!storykitOn()) return new Response('Not found', { status: 404 });
  const { file } = await ctx.params;
  const m = BLOB_FILE.exec(file);
  if (!m) return new Response('Not found', { status: 404, headers: storyCors(req) });
  const etag = `"${m[1]}"`;
  // (streamed from the disk, never read whole: a world's bodies and clips are tens of MB, and many players load at once)
  const b = storyStore().stat(file);
  if (!b) return new Response('Not found', { status: 404, headers: { 'cache-control': 'no-store' } });
  const headers = { 'content-type': b.type, 'cache-control': FOREVER, etag, 'x-content-type-options': 'nosniff', ...storyCors(req) };
  if (req.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers });
  if (req.method === 'HEAD') return new Response(null, { headers: { ...headers, 'content-length': String(b.size) } });
  const body = Readable.toWeb(createReadStream(b.path)) as ReadableStream<Uint8Array>;
  return new Response(body, { headers: { ...headers, 'content-length': String(b.size) } });
}

export async function OPTIONS(req: Request) {
  if (!storykitOn()) return new Response('Not found', { status: 404 });
  return storyPreflight(req);
}
