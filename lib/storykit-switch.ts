/**
 * The Story Kit's one server switch, STORYKIT (read on the server only; a browser reads it as unset, so 'off'):
 *   unset / anything else  off: the site is exactly as it is without the Story Kit (every door 404s or refuses)
 *   owner                  on for the owner only: the Story Kit's pages, build route, store and play answer only to a
 *                          request carrying the owner's admin session (the gm_admin cookie, app/admin/session.ts);
 *                          everyone else sees the site as it is with the switch off. A story world the owner publishes
 *                          goes in hidden (only the owner's session opens it). Mog City reads a world's sealed files
 *                          and a draft's runner pack across origins, without the cookie: those two read-only addresses
 *                          (/storykit/f/<sha256>.<ext>, /api/storykit/drafts/<uuid>/pack) answer by their unguessable
 *                          names, which only the owner's pages hand out
 *   on                     on for everyone
 * /create is prerendered, so the switch is read there when the site is built: changing it needs a rebuild (on Render,
 * "Save, rebuild, and deploy"). With STORYKIT=owner the build makes /create dynamic (it reads the cookie).
 * Pure (no Next imports): lib/storykit-site.ts (also read by client components), lib/storykit-store.ts and the
 * checks read it. The cookie half is lib/storykit-http.ts (storykitForRequest, storykitForViewer).
 */
export type StorykitMode = 'off' | 'owner' | 'on';

export function storykitMode(): StorykitMode {
  const v = (typeof process !== 'undefined' ? process.env.STORYKIT ?? '' : '').trim().toLowerCase();
  return v === 'on' ? 'on' : v === 'owner' ? 'owner' : 'off';
}
/** On for everyone. */
export const storykitPublic = () => storykitMode() === 'on';
/** On at all on this server: for everyone, or for the owner (the store, the build worker and the sealed files). */
export const storykitLive = () => storykitMode() !== 'off';
/** Open to this viewer: on for everyone, or owner-only and `owner` (the request carries the owner's session). */
export const storykitOpenTo = (owner: boolean) => { const m = storykitMode(); return m === 'on' || (m === 'owner' && owner); };
/** A cookie's value from a request's Cookie header. */
export const cookieValue = (header: string | null | undefined, name: string) =>
  header?.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))?.[1];
/**
 * Open to a request with this Cookie header: on for everyone; or owner-only and `valid` (app/admin/session.ts
 * validSession) takes its admin cookie. The cookie is read only in owner mode. (lib/storykit-http.ts wires the session.)
 */
export function storykitForCookies(header: string | null | undefined, valid: (v: string | undefined) => boolean, name = 'gm_admin'): boolean {
  const m = storykitMode();
  return m === 'owner' ? valid(cookieValue(header, name)) : m === 'on';
}
