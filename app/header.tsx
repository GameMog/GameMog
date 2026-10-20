import Link from 'next/link';
import { Wordmark } from './logo';
import { SiteMenu } from './menu';

/**
 * GameStop's header, for GameMog (docs/design/premium.md): a white brand row
 * that stays at the top (the mark, a wide search, icon actions with labels).
 * The pages live in a menu at the far right, after Library, opened like
 * anthropic.com's (the owner, 24 Sep): Create first, Classic seventh. The
 * category row and the black promo strip under it are gone.
 */
const NAV = [
  { label: 'Create', href: '/create' },
  { label: 'Open World', href: '/open-world' },
  { label: 'Top Trending', href: '/charts/trending', key: 'Charts' },
  { label: 'Up-and-Coming', href: '/charts/up-and-coming' },
  { label: 'Top Rated', href: '/charts/top-rated' },
  { label: 'Most Mogged', href: '/charts/most-mogged' },
  { label: 'New Mogs', href: '/charts/new-mogs', key: 'Mogs' },
  { label: 'Classic', href: '/classic' },
  { label: 'Asset Library', href: '/library', key: 'Library' },
];

/** The "Create a world" button at the top right: hidden for now (the owner, 24 Sep). Create still leads the categories. */
const SHOW_CREATE_BUTTON = false;

export function SiteHeader({ on = '' }: { on?: string }) {
  return (
    <>
      <header className="hdr">
        <div className="wrap hrow">
          <Wordmark />
          <form className="srch" action="/charts/trending" role="search">
            <span className="ic"><Icon name="search" size={16} /></span>
            <input name="q" placeholder="Search worlds" aria-label="Search worlds" />
          </form>
          <nav className="hicons" aria-label="Shortcuts">
            <Link href="/charts/new-mogs" className="hicon"><Icon name="remix" size={22} /><span>Mogs</span></Link>
            <Link href="/library" className="hicon"><Icon name="library" size={22} /><span>Library</span></Link>
            {SHOW_CREATE_BUTTON && <Link href="/create" className="btn createworld">Create a world</Link>}
            <SiteMenu items={NAV} on={on} />
          </nav>
        </div>
      </header>
    </>
  );
}

/** The community server (the owner, 30 Sep). */
const DISCORD = 'https://discord.gg/9uhVpqfsK5';

/** Discord's mark, from Simple Icons 15.22 (CC0), drawn on its own 24px grid. */
function DiscordMark() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z" />
    </svg>
  );
}

/** The code (the owner, 14 Oct: the GitHub repo beside Discord; the repo is public since 1 Oct). */
const GITHUB = 'https://github.com/GameMog/GameMog';

/** GitHub's mark, from Simple Icons (CC0), on the same 24px grid as Discord's. */
function GitHubMark() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}

/** The socials (the owner, 20 Oct: "let's add x & telegram social icons & links"). */
const X = 'https://x.com/gamemogged';
const TELEGRAM = 'https://t.me/gamemogged';

/** X's mark, from Simple Icons (CC0), on the same 24px grid. */
function XMark() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" />
    </svg>
  );
}

/** Telegram's mark, from Simple Icons (CC0), on the same 24px grid. */
function TelegramMark() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>
  );
}

export function SiteFooter() {
  return (
    <footer className="ftr">
      <div className="wrap fcols">
        <div className="fbrand">
          <Wordmark icon />
          <p>The internet, playable. Every world on the GameMog Runtime is playtested in a real browser before it publishes.</p>
          <div className="fsocial">
            <a href={DISCORD} target="_blank" rel="noopener noreferrer" aria-label="GameMog on Discord" title="Discord"><DiscordMark /></a>
            <a href={X} target="_blank" rel="noopener noreferrer" aria-label="GameMog on X" title="X"><XMark /></a>
            <a href={TELEGRAM} target="_blank" rel="noopener noreferrer" aria-label="GameMog on Telegram" title="Telegram"><TelegramMark /></a>
            <a href={GITHUB} target="_blank" rel="noopener noreferrer" aria-label="GameMog on GitHub" title="GitHub"><GitHubMark /></a>
          </div>
        </div>
        <div>
          <h3>Play</h3>
          <Link href="/charts/trending">Top Trending</Link>
          <Link href="/charts/up-and-coming">Up-and-Coming</Link>
          <Link href="/charts/new-mogs">New Mogs</Link>
          <Link href="/classic">Classic</Link>
        </div>
        <div>
          <h3>Make</h3>
          <Link href="/create">Create a world</Link>
          <Link href="/charts/most-mogged">Most Mogged</Link>
          <Link href="/library">Asset library</Link>
        </div>
        <div>
          <h3>Legal &amp; privacy</h3>
          <Link href="/terms">Terms of Service</Link>
          <Link href="/privacy">Privacy Policy</Link>
        </div>
      </div>
      <div className="wrap flegal">
        <span>© 2026 Ockams Inc. All rights reserved.</span>
        <nav aria-label="Legal"><Link href="/terms">Terms</Link><Link href="/privacy">Privacy</Link></nav>
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
  library: <path d="M3 3.2h3.2v13.6H3zM7.6 3.2h3.2v13.6H7.6zM12.3 4.1l3-.8 3.5 13.1-3 .8z" />,
  plus: <path d="M9 3.5h2v5.5h5.5v2H11v5.5H9V11H3.5V9H9z" />,
  // a paper plane: the game page's Dare (send a dare)
  share: <path d="M17.6 2.2a.9.9 0 011.2 1.2l-5.3 13.9a.9.9 0 01-1.6.2l-2.7-4.5 4.2-5.6-5.6 4.2-4.5-2.7a.9.9 0 01.2-1.6z" />,
};

export function Icon({ name, size = 14 }: { name: keyof typeof PATHS | string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="currentColor" aria-hidden>
      {PATHS[name]}
    </svg>
  );
}
