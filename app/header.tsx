import Link from 'next/link';

export function SiteHeader() {
  return (
    <header className="topbar">
      <div className="wrap inner">
        <Link href="/" className="brand" aria-label="GameMog home">
          <span className="mark"><i /></span>
          <b>GameMog</b>
        </Link>
        <Link href="/" className="navlink">Discover</Link>
        <Link href="/#new" className="navlink">New</Link>
        <Link href="/create" className="navlink">Create</Link>
        <div className="search">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" />
          </svg>
          <input placeholder="Search worlds" aria-label="Search worlds" />
        </div>
        <Link href="/create" className="btn sm">Create</Link>
      </div>
    </header>
  );
}

export function Stat({ icon, children, className }: { icon: 'up' | 'people' | 'clock' | 'flag'; children: React.ReactNode; className?: string }) {
  const paths: Record<string, React.ReactNode> = {
    up: <path d="M7 10v10H3V10zM7 10l5-7a2 2 0 013 2l-1 5h5a2 2 0 012 2.4l-1.4 6A2 2 0 0117.6 20H7" />,
    people: <><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" /><path d="M17 8.5a3 3 0 010 5.5" /></>,
    clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
    flag: <><path d="M5 21V4" /><path d="M5 4.5h11l-2 3.5 2 3.5H5" /></>,
  };
  return (
    <span className={className}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
        {paths[icon]}
      </svg>
      {children}
    </span>
  );
}
