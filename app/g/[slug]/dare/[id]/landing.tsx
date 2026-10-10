'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { playerId } from '../../../../anon';

/**
 * The dare landing's two moving parts (the page is app/g/[slug]/dare/[id]/page.tsx).
 *
 * PLAY: full screen needs a tap in the same document, and after a page load there is none. So the tap itself makes
 * the whole document full screen (where the browser can: not iPhone), then moves to the game page in place, as a
 * client navigation, so the document and its full screen carry over; the game page sees ?play=1, starts the game and
 * lets its frame fill the screen (app/glass.css .gl-fill). The link is the same address, so a hard load, a new tab or
 * a phone with no full screen still lands on the game, ready to start.
 */
export function DarePlay({ href }: { href: string }) {
  const router = useRouter();
  const [going, setGoing] = useState(false);
  // (the game page is the next stop for nearly everyone who opens a dare)
  useEffect(() => { router.prefetch(href); }, [router, href]);
  function go(e: React.MouseEvent<HTMLAnchorElement>) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
    try {
      if (!document.fullscreenElement) {
        if (el.requestFullscreen) el.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
        else el.webkitRequestFullscreen?.();
      }
    } catch { /* no full screen here: the game starts in the page */ }
    setGoing(true);
    router.push(href);
  }
  return (
    <a className="gl-pill gl-gold" href={href} onClick={go} aria-busy={going || undefined}>
      <svg width="14" height="16" viewBox="0 0 14 16" aria-hidden><path d="M1 1.2v13.6a.7.7 0 0 0 1.05.6l11.2-6.8a.7.7 0 0 0 0-1.2L2.05.6A.7.7 0 0 0 1 1.2Z" fill="currentColor" /></svg>
      <span>{going ? 'Loading' : 'Play'}</span>
    </a>
  );
}

/** The funnel's first step: this browser opened the dare (once per dare; the sender's own opens are not counted). */
export function DareOpened({ id }: { id: string }) {
  useEffect(() => {
    fetch(`/api/dares/${encodeURIComponent(id)}/event`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ visitor: playerId(), kind: 'opened' }), keepalive: true,
    }).catch(() => {});
  }, [id]);
  return null;
}
