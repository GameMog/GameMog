import Link from 'next/link';

const CATEGORIES = [
  { label: 'Discover', href: '/', on: true },
  { label: 'Racing', href: '/?f=race' },
  { label: 'New', href: '/#new' },
  { label: 'Most played', href: '/#played' },
  { label: 'Obstacle', soon: true },
  { label: 'Collecting', soon: true },
  { label: 'Survival', soon: true },
];

export function SiteHeader() {
  return (
    <header className="hdr">
      <div className="wrap row1">
        <Link href="/" className="wordmark" aria-label="GameMog home">
          <span className="mk" /><b>GameMog</b>
        </Link>
        <div className="srch">
          <Icon name="search" />
          <input placeholder="Search worlds, creators, characters" aria-label="Search" />
        </div>
        <Link href="/create" className="btn">Create a world</Link>
      </div>
      <nav className="wrap row2" aria-label="Categories">
        {CATEGORIES.map((c) =>
          c.soon ? (
            <span key={c.label} className="cat" aria-disabled>{c.label}<span className="dim-2" style={{ fontSize: 10, marginLeft: 5 }}>SOON</span></span>
          ) : (
            <Link key={c.label} href={c.href!} className={`cat${c.on ? ' on' : ''}`}>{c.label}</Link>
          )
        )}
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="ftr">
      <div className="wrap" style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontWeight: 600, color: 'var(--ink-2)' }}>GameMog</span>
        <span>One engine, many worlds.</span>
        <span style={{ marginLeft: 'auto' }}>Every world is playtested before it publishes.</span>
      </div>
    </footer>
  );
}

const PATHS: Record<string, React.ReactNode> = {
  search: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.6-3.6" /></>,
  players: <><circle cx="9" cy="8" r="3.1" /><path d="M3.2 19.5c0-3.1 2.6-5.2 5.8-5.2s5.8 2.1 5.8 5.2" /><path d="M16.8 8.4a3 3 0 010 5.3" /></>,
  time: <><circle cx="12" cy="12" r="8.4" /><path d="M12 7.6V12l2.9 1.9" /></>,
  field: <><path d="M5 20.5V4" /><path d="M5 4.6h11.4l-2 3.4 2 3.4H5" /></>,
  trophy: <><path d="M7 4h10v4a5 5 0 01-10 0z" /><path d="M7 5.5H4.6V7a3 3 0 003 3M17 5.5h2.4V7a3 3 0 01-3 3" /><path d="M12 13v4M9 20h6" /></>,
  play: <path d="M8 5v14l11-7z" />,
};

export function Icon({ name, size = 13 }: { name: keyof typeof PATHS | string; size?: number }) {
  const filled = name === 'play';
  return (
    <svg width={size} height={size} viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'} stroke={filled ? 'none' : 'currentColor'}
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {PATHS[name]}
    </svg>
  );
}
