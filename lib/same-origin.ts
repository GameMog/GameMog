import { publicOrigin } from './custom-game';

/**
 * Was this write sent by another origin's page (16 Nov)? Every write the owner's session authorizes asks it first, so a
 * page elsewhere cannot spend the owner's cookie.
 *
 * The gm_admin cookie is SameSite=Strict, so another SITE's page never sends it; but a page on the same site and another
 * origin does: mc.gamemog.com (GitHub Pages) is same-SITE with gamemog.com, not same-ORIGIN. So the rule is the origin:
 *   Sec-Fetch-Site (every current browser sends it; a page cannot set it): only 'same-origin' passes ('same-site', 'cross-site'
 *     and 'none' do not);
 *   else an Origin header (older browsers send one on every cross-origin POST): only the site's own origin passes (the address
 *     the browser used, lib/custom-game.ts publicOrigin, or the server's own);
 *   neither: no browser sent it (a script with the owner's cookie, the offline checks), so no page could have, and it passes.
 */
export function crossOrigin(req: Request): boolean {
  const site = req.headers.get('sec-fetch-site');
  if (site) return site.trim().toLowerCase() !== 'same-origin';
  const origin = req.headers.get('origin');
  if (origin == null) return false;
  return origin !== publicOrigin(req) && origin !== new URL(req.url).origin;
}

/** An owner write from another origin: its refusal (403), or null to go on. */
export const crossOriginRefusal = (req: Request): Response | null =>
  crossOrigin(req) ? Response.json({ error: 'Send it from the site itself.' }, { status: 403, headers: { 'cache-control': 'no-store' } }) : null;
