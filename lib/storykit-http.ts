import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { COOKIE, validSession } from '../app/admin/session';
import { cookieValue, storykitForCookies, storykitMode } from './storykit-switch';
import { storykitReader } from './storykit-publish';

/** The owner's admin session on this request (the gm_admin cookie, app/admin/session.ts), read from its Cookie header. */
export const ownerRequest = (req: Request) => validSession(cookieValue(req.headers.get('cookie'), COOKIE));
/**
 * The Story Kit is open to this request (lib/storykit-switch.ts): STORYKIT=on, or STORYKIT=owner and the request carries
 * the owner's session. The cookie is read only in owner mode, so with the switch off or on nothing changes.
 */
export const storykitForRequest = (req: Request) => storykitForCookies(req.headers.get('cookie'), validSession, COOKIE);
/** The same for a server page (its request's cookies): a page that calls it in owner mode is rendered per request. */
export async function storykitForViewer(): Promise<boolean> {
  const m = storykitMode();
  if (m !== 'owner') return m === 'on';
  return validSession((await cookies()).get(COOKIE)?.value);
}

/**
 * Story Kit routes answer 404 unless the Story Kit is open to the request (STORYKIT=on, or STORYKIT=owner and the
 * owner's session; off by default, so production is unchanged). `read`: a read-only address Mog City fetches across
 * origins without the cookie (a draft's runner pack by its uuid), open whenever the switch is on or owner-only.
 */
export const storykitOff = (req: Request, opts: { read?: boolean } = {}) =>
  ((opts.read ? storykitMode() !== 'off' : storykitForRequest(req)) ? null : NextResponse.json({ error: 'Not found.' }, { status: 404 }));
export const noStore = { 'cache-control': 'no-store' };
export const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: noStore });

/**
 * CORS for what Mog City reads from this site (a world's runner pack, its GLBs, clips and pictures): the request's
 * origin when it is Mog City's (https://mc.gamemog.com; outside production also a local Mog City on localhost), else
 * none. `vary: origin` so a cache never hands one origin's answer to another.
 */
export function storyCors(req: Request): Record<string, string> {
  const o = storykitReader(req.headers.get('origin'));
  return o ? { 'access-control-allow-origin': o, vary: 'origin' } : { vary: 'origin' };
}
/** The preflight answer for a Story Kit read (GET only, no credentials). */
export function storyPreflight(req: Request) {
  const c = storyCors(req);
  return new Response(null, { status: 204, headers: { ...c, ...(c['access-control-allow-origin'] ? { 'access-control-allow-methods': 'GET, HEAD', 'access-control-max-age': '86400' } : {}) } });
}
