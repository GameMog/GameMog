import { NextResponse, type NextRequest } from 'next/server';
import { isOwnerPath } from '@/lib/owner-path';

/**
 * Two jobs.
 *
 * The owner's screen (app/admin) is served only at the owner's own address, which lib/owner-path.ts knows by its
 * fingerprint alone; /admin itself answers with the 404 page, as any made-up address does.
 *
 * The play-only beta (NEXT_PUBLIC_BUILDS=off, set on the Render service).
 * Pages that build a world send people back with the "Coming soon" pop-up
 * (app/coming-soon.tsx), and the two routes that spend model time answer 503,
 * so a request made by hand cannot run up the bill either. Unset, as on the
 * Mac, everything passes through.
 */
const SOON: Record<string, string> = {
  '/api/generate': 'Building worlds is coming soon.',
  '/api/me/selfie': 'Photo matching is coming soon. Build your runner by hand for now.',
};
const gated = (p: string) => !!SOON[p] || p === '/create' || p.startsWith('/create/') || p.startsWith('/mog/');

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // (a rewrite is served as it is: the middleware does not run again for /admin when the owner's address is rewritten to it)
  if (pathname === '/admin' || pathname.startsWith('/admin/')) return NextResponse.rewrite(new URL('/_gm-not-found', req.url));
  if (await isOwnerPath(pathname)) return NextResponse.rewrite(new URL('/admin', req.url));
  if (process.env.NEXT_PUBLIC_BUILDS !== 'off' || !gated(pathname)) return NextResponse.next();
  if (SOON[pathname]) return NextResponse.json({ error: SOON[pathname] }, { status: 503 });
  const to = req.nextUrl.clone();
  const mog = pathname.match(/^\/mog\/([^/]+)/);
  to.pathname = mog ? `/g/${mog[1]}` : '/';
  // (the address's own query goes along, so a dare's ?dare=<id> survives the trip)
  to.searchParams.set('soon', '1');
  return NextResponse.redirect(to);
}

// (single segments too, for the owner's address: lib/owner-path.ts fingerprints only lowercase words, once each)
export const config = { matcher: ['/admin', '/admin/:path*', '/:seg', '/create/:path*', '/mog/:path*', '/api/generate', '/api/me/selfie'] };
