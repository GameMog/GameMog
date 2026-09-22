import Link from 'next/link';

export function SiteHeader() {
  return (
    <header className="site wrap">
      <Link href="/" className="logo">
        Game<span>Mog</span>
      </Link>
      <nav className="nav">
        <Link href="/#gallery" className="btn ghost sm">Worlds</Link>
        <Link href="/create" className="btn sm">Make one</Link>
      </nav>
    </header>
  );
}
