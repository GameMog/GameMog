import Link from 'next/link';

/**
 * One 40px bar, the height Roblox runs. No second row of category tabs, no
 * border under it, no shadow: the nav is the same colour as the page and is
 * separated from the content by space alone.
 */
/** `wide` links are dropped on a phone, where the bar has room for two. */
const NAV = [
  { label: 'Charts', href: '/' },
  { label: 'Create', href: '/create', wide: true },
  { label: 'Racing', href: '/?f=race', wide: true },
  { label: 'Obstacle', soon: true, wide: true },
  { label: 'Survival', soon: true, wide: true },
];

export function SiteHeader({ on = 'Charts' }: { on?: string }) {
  return (
    <header className="hdr">
      <div className="wrap bar">
        <Link href="/" className="wordmark" aria-label="GameMog home">
          <span className="mk" /><b>GameMog</b>
        </Link>
        {NAV.map((n) =>
          n.soon ? (
            <span key={n.label} className={`nvl${n.wide ? ' wide' : ''}`} aria-disabled>{n.label}</span>
          ) : (
            <Link key={n.label} href={n.href!}
              className={`nvl${n.label === on ? ' on' : ''}${n.wide ? ' wide' : ''}`}>
              {n.label}
            </Link>
          )
        )}
        <div className="srch">
          <span className="ic"><Icon name="search" size={16} /></span>
          <input placeholder="Search" aria-label="Search worlds" />
        </div>
        <div className="right">
          <Link href="/create" className="btn">
            <span className="wide">Create a world</span>
            <span className="narrow">Create</span>
          </Link>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="ftr">
      <div className="wrap">
        <div className="links">
          <Link href="/">Charts</Link>
          <Link href="/create">Create</Link>
          <Link href="/library">Library</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy</Link>
        </div>
        <p className="fine">
          One engine, many worlds. Every world is playtested before it publishes.
        </p>
      </div>
    </footer>
  );
}

/**
 * Solid glyphs at 16px, filled rather than stroked. A 24px two-pixel stroked
 * outline icon is the single most recognisable mark of a generated interface,
 * and it is not what this site is copying.
 */
const PATHS: Record<string, React.ReactNode> = {
  search: <path d="M10.4 2a6.4 6.4 0 104 11.4l3.1 3.1a1.1 1.1 0 001.6-1.6l-3.1-3.1A6.4 6.4 0 0010.4 2zm0 2.2a4.2 4.2 0 110 8.4 4.2 4.2 0 010-8.4z" />,
  players: <path d="M10 3.4a3.1 3.1 0 110 6.2 3.1 3.1 0 010-6.2zM4.2 16.6c0-2.7 2.6-4.5 5.8-4.5s5.8 1.8 5.8 4.5c0 .6-.4 1-1 1H5.2c-.6 0-1-.4-1-1z" />,
  time: <path d="M10 2.2a7.8 7.8 0 100 15.6 7.8 7.8 0 000-15.6zm.9 3.6v4l2.7 1.7a.9.9 0 01-1 1.5l-3.1-2a.9.9 0 01-.4-.8V5.8a.9.9 0 011.8 0z" />,
  field: <path d="M4 2.4a1 1 0 011 1v13.3a1 1 0 11-2 0V3.4a1 1 0 011-1zm2.4 1h9.3a.8.8 0 01.7 1.2L14.8 7.6l1.6 3a.8.8 0 01-.7 1.2H6.4z" />,
  trophy: <path d="M6 2.6h8v3.6a4 4 0 01-8 0zM4.6 3.6H2.8v1.3a2.8 2.8 0 002.4 2.8zm10.8 0h1.8v1.3a2.8 2.8 0 01-2.4 2.8zM9 10.8h2v3.4h2.2a.9.9 0 010 1.8H6.8a.9.9 0 010-1.8H9z" />,
  play: <path d="M6.6 3.7a.9.9 0 011.4-.8l8.2 5.3a.9.9 0 010 1.6l-8.2 5.3a.9.9 0 01-1.4-.8z" />,
  bolt: <path d="M11.4 1.8L4.6 10.4a.7.7 0 00.5 1.1h3.3l-1 6.2a.5.5 0 00.9.4l7-8.9a.7.7 0 00-.5-1.1h-3.4l1-5.9a.5.5 0 00-.9-.4z" />,
  star: <path d="M10 1.6l2.5 5.1 5.6.8-4.1 4 1 5.6-5-2.7-5 2.7 1-5.6-4.1-4 5.6-.8z" />,
  thumbUp: <path d="M2.2 8.6h3.2v9.2H2.2zM7 17.8V8.7l3.7-6c.3-.5 1-.7 1.5-.4.6.3.9 1 .7 1.6l-1 3.6h4.4c1.1 0 1.9 1 1.7 2l-1.3 6.6c-.2 1-1 1.7-1.9 1.7z" />,
  thumbDown: <g transform="rotate(180 10 10)"><path d="M2.2 8.6h3.2v9.2H2.2zM7 17.8V8.7l3.7-6c.3-.5 1-.7 1.5-.4.6.3.9 1 .7 1.6l-1 3.6h4.4c1.1 0 1.9 1 1.7 2l-1.3 6.6c-.2 1-1 1.7-1.9 1.7z" /></g>,
  remix: <path d="M15.6 5.2A7.2 7.2 0 003 8.1l2 .6a5.1 5.1 0 019-2L12 8.8h6.2V2.6zM4.4 14.8A7.2 7.2 0 0017 11.9l-2-.6a5.1 5.1 0 01-9 2L8 11.2H1.8v6.2z" />,
};

export function Icon({ name, size = 14 }: { name: keyof typeof PATHS | string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="currentColor" aria-hidden>
      {PATHS[name]}
    </svg>
  );
}
