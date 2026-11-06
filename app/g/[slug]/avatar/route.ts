import { gameAvatar, getGameBySlug, getUnlistedGameBySlug, getGameBySlugForOwner } from '@/lib/db';
import { headshotCard } from '@/lib/portrait-sky';
import { isAdmin } from '../../../admin/session';

/**
 * The hero's portrait (4 Nov): his headshot, square, shot by the test drive with the key art (lib/key-art.ts
 * capturePortrait, lib/runtime/portrait.js), on the light-blue sky since 6 Nov (the owner: "main character headshot
 * against a light blue background, not car"). The homepage's round "Jump in" pictures show it.
 * A game with none gets the headshot card on the same sky (lib/portrait-sky.ts headshotCard), never a square cut from
 * its cover or key art (a car or kart world's showed the car).
 */
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  if (!/^[a-z0-9-]+$/.test(slug)) return new Response('Not found', { status: 404 });
  // (a hidden game's portrait for the owner's session only, never cached: 5 Nov, owner-only story worlds)
  const listed = !!(getGameBySlug(slug) ?? getUnlistedGameBySlug(slug)), owner = !listed && (await isAdmin());
  const own = gameAvatar(slug, owner);
  if (own) return jpeg(own, owner ? 0 : 3600);
  if (!listed && !(owner && getGameBySlugForOwner(slug))) return new Response('Not found', { status: 404 });
  // briefly cached, so a portrait that arrives later shows
  const c = await card();
  return jpeg(c.body, owner ? 0 : 300, c.type);
}

const jpeg = (b: Uint8Array, age: number, type = 'image/jpeg') =>
  new Response(Buffer.from(b), { headers: { 'content-type': type, 'cache-control': age ? `public, max-age=${age}` : 'private, no-store' } });

/** The headshot card as a 512 px JPEG, made once per server; the SVG itself if it cannot be drawn. */
let CARD: Promise<{ body: Uint8Array; type: string }> | null = null;
function card(): Promise<{ body: Uint8Array; type: string }> {
  return (CARD ??= (async () => {
    const svg = Buffer.from(headshotCard());
    try {
      const sharp = (await import('sharp')).default;
      return { body: new Uint8Array(await sharp(svg).jpeg({ quality: 88 }).toBuffer()), type: 'image/jpeg' };
    } catch {
      CARD = null;
      return { body: new Uint8Array(svg), type: 'image/svg+xml' };
    }
  })());
}
