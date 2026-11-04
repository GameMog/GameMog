import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gameArt, gameAvatar, gameCover, getGameBySlug, getUnlistedGameBySlug } from '@/lib/db';

/**
 * The hero's portrait (4 Nov): head and shoulders, square, shot by the test drive with the key art
 * (lib/key-art.ts capturePortrait, lib/runtime/portrait.js). The homepage's round "Jump in" pictures show it.
 * A game with none gets a square from the centre of its plain cover (no title over it), else of its key art; with no
 * picture at all, the cover route's own square (its palette card), never a broken image.
 */
export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  if (!/^[a-z0-9-]+$/.test(slug)) return new Response('Not found', { status: 404 });
  const own = gameAvatar(slug);
  if (own) return jpeg(own, 3600);
  const wide = join(process.cwd(), 'public', 'media', 'art', `${slug}-wide.jpg`);
  const from = gameCover(slug) ?? (existsSync(wide) ? readFileSync(wide) : undefined) ?? gameArt(slug, 'wide') ?? gameArt(slug, 'square');
  // briefly cached, so a portrait that arrives later shows
  if (from) return jpeg(await square(from), 300);
  if (!getGameBySlug(slug) && !getUnlistedGameBySlug(slug)) return new Response('Not found', { status: 404 });
  return Response.redirect(new URL(`/g/${slug}/cover?shape=square`, req.url), 302);
}

const jpeg = (b: Uint8Array, age: number) =>
  new Response(Buffer.from(b), { headers: { 'content-type': 'image/jpeg', 'cache-control': `public, max-age=${age}` } });

/** The centre square of a picture, 512 px; the picture as it is if it cannot be cut (the page's circle crops it then). */
async function square(b: Uint8Array): Promise<Uint8Array> {
  try {
    const sharp = (await import('sharp')).default;
    return await sharp(Buffer.from(b)).resize(512, 512, { fit: 'cover', position: 'centre' }).jpeg({ quality: 84 }).toBuffer();
  } catch {
    return b;
  }
}
