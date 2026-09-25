import Link from 'next/link';
import { SiteHeader, SiteFooter } from './header';

export const metadata = { title: 'Not found | GameMog', robots: { index: false } };

/** A missing page, a mistyped link, or a world its maker took down. */
export default function NotFound() {
  return (
    <>
      <SiteHeader on="" />
      <main className="wrap nf">
        <p className="nf-code">404</p>
        <h1>This world isn&apos;t here</h1>
        <p className="nf-lede">The link may be mistyped, or the world may have been taken down. Plenty of others are still racing.</p>
        <div className="nf-acts">
          <Link className="btn" href="/">Back to GameMog</Link>
          <Link className="btn outline" href="/charts/trending">Top Trending</Link>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
