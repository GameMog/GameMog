import { storyOf, mcOrigin, MC_PROD } from './episode';

/**
 * Where a Mog City episode plays (3 Nov 2026; MogCity .scratch/moggable/PLAN.md 4.4): its story JSON on this site
 * (/g/<slug>/story.json, /d/<id>/story.json) and the frame's address, Mog City itself with ?story= at it. Mog City takes
 * story addresses from https://gamemog.com only (and, on a Mac, localhost), so production always names that origin.
 */
export const storyOrigin = () => process.env.STORY_ORIGIN
  ?? (process.env.NODE_ENV === 'production' ? 'https://gamemog.com' : new URL(process.env.SITE_URL ?? 'http://localhost:3939').origin);

/** A published episode's story address, at its version (the first 16 hex of the story's SHA-256), so an edge may keep it. */
export function storyUrl(game: { slug: string; code?: string | null }) {
  const s = storyOf(game.code);
  return `${storyOrigin()}/g/${game.slug}/story.json${s ? `?v=${s.hash.slice(0, 16)}` : ''}`;
}
/** A draft's story address (never kept by an edge). */
export const draftStoryUrl = (id: string, origin = storyOrigin()) => `${origin}/d/${id}/story.json`;
/** The play frame's address for a story: Mog City embedded (embed=1, the game's id for its messages) with ?story=. */
// (and ?host=, the site's own origin, where Mog City posts its messages: https://gamemog.com in production, named outright
// rather than left to Mog City's default; a local dev origin on the Mac)
export const mcFrameSrc = (story: string, game: string) => `${mcOrigin()}/?embed=1&host=${encodeURIComponent(storyOrigin())}&game=${encodeURIComponent(game)}&story=${encodeURIComponent(story)}`;

/** The origins whose pages may read a story (CORS): Mog City's, and on a Mac a local copy of it (app/api/mc's rule). */
export function storyReader(origin: string | null): string | null {
  if (!origin) return null;
  if (origin === MC_PROD || origin === mcOrigin()) return origin;
  return process.env.NODE_ENV !== 'production' && /^http:\/\/(localhost|127\.0\.0\.1):\d{2,5}$/.test(origin) ? origin : null;
}

/** The story response: the pack's text, CORS for Mog City only, an ETag on its hash. */
export function storyResponse(req: Request, code: string | null | undefined, cache: string): Response {
  const s = storyOf(code);
  if (!s) return new Response('Not found', { status: 404 });
  const reader = storyReader(req.headers.get('origin'));
  const etag = `W/"${s.hash.slice(0, 16)}"`;
  const headers: Record<string, string> = {
    'content-type': 'application/json; charset=utf-8', 'x-content-type-options': 'nosniff', 'cache-control': cache, etag, vary: 'origin',
    ...(reader ? { 'access-control-allow-origin': reader } : {}),
  };
  const seen = req.headers.get('if-none-match');
  if (seen && seen.split(',').some((t) => t.trim().replace(/^W\//, '') === etag.slice(2))) return new Response(null, { status: 304, headers });
  return new Response(s.text, { headers });
}
