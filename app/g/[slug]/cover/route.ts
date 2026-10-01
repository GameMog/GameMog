import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gameArt, gameCover, getGameBySlug } from '@/lib/db';

/** The screenshot the runtime playtest took mid-play, used as the game's cover. */
export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  if (!/^[a-z0-9-]+$/.test(slug)) return new Response('Not found', { status: 404 });
  const shape = new URL(req.url).searchParams.get('shape') === 'square' ? 'square' : 'wide';
  const suffix = shape === 'square' ? 'icon' : 'wide';
  const path = join(process.cwd(), 'public', 'media', 'art', `${slug}-${suffix}.jpg`);
  const jpg = existsSync(path) ? readFileSync(path) : gameArt(slug, shape) ?? gameCover(slug);
  if (jpg) {
    return new Response(Buffer.from(jpg), {
      headers: { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=3600' },
    });
  }
  // A game with no picture at all (1 Oct: a build whose test drive never ran)
  // still gets a card in its own colours, never a broken image; briefly
  // cached, so a cover that arrives later shows.
  const game = getGameBySlug(slug);
  if (!game) return new Response('Not found', { status: 404 });
  const card = await paletteCard(game.meta, shape);
  return new Response(new Uint8Array(card.body), { headers: { 'content-type': card.type, 'cache-control': 'public, max-age=300' } });
}

const hex = (v: unknown, d: string) => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : d);

/** The world's sky over its ground, its accent glowing on the horizon: no text, so no fonts to go missing. */
async function paletteCard(metaJson: string | null, shape: 'square' | 'wide') {
  let p: { sky?: unknown; ground?: unknown; accent?: unknown } = {};
  try { p = (JSON.parse(metaJson ?? '{}') as { palette?: typeof p }).palette ?? {}; } catch { /* the defaults */ }
  const sky = hex(p.sky, '#1B2236'), ground = hex(p.ground, '#3A3048'), accent = hex(p.accent, '#FFB347');
  const [w, h] = shape === 'square' ? [512, 512] : [1280, 720];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<defs>
<linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky}"/><stop offset="0.62" stop-color="${sky}" stop-opacity="0.85"/><stop offset="1" stop-color="${ground}"/></linearGradient>
<radialGradient id="g" cx="0.5" cy="0.62" r="0.55"><stop offset="0" stop-color="${accent}" stop-opacity="0.75"/><stop offset="0.45" stop-color="${accent}" stop-opacity="0.18"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient>
</defs>
<rect width="${w}" height="${h}" fill="url(#s)"/>
<rect width="${w}" height="${h}" fill="url(#g)"/>
<rect y="${Math.round(h * 0.62)}" width="${w}" height="${Math.round(h * 0.38)}" fill="${ground}" fill-opacity="0.55"/>
<rect y="${Math.round(h * 0.62) - 1}" width="${w}" height="2" fill="${accent}" fill-opacity="0.6"/>
</svg>`;
  try {
    const sharp = (await import('sharp')).default;
    return { body: await sharp(Buffer.from(svg)).jpeg({ quality: 82 }).toBuffer(), type: 'image/jpeg' };
  } catch {
    return { body: Buffer.from(svg), type: 'image/svg+xml' };
  }
}
