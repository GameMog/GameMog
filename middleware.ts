import { NextResponse, type NextRequest } from 'next/server';

/**
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

export function middleware(req: NextRequest) {
  if (process.env.NEXT_PUBLIC_BUILDS !== 'off') return NextResponse.next();
  const { pathname } = req.nextUrl;
  if (SOON[pathname]) return NextResponse.json({ error: SOON[pathname] }, { status: 503 });
  const to = req.nextUrl.clone();
  const mog = pathname.match(/^\/mog\/([^/]+)/);
  to.pathname = mog ? `/g/${mog[1]}` : '/';
  to.search = '?soon=1';
  return NextResponse.redirect(to);
}

export const config = { matcher: ['/create', '/create/:path*', '/mog/:path*', '/api/generate', '/api/me/selfie'] };
