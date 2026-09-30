'use client';
import { useEffect, useRef, useState } from 'react';

/**
 * The play-only beta (NEXT_PUBLIC_BUILDS=off): every world plays, nothing new
 * is built yet. Any link to Create or a Mog opens this pop-up instead of the
 * page, and middleware.ts sends a typed-in address back here with ?soon=1.
 *
 * Frosted glass is otherwise banned by the design contract; the owner asked
 * for a glassmorphism "Coming soon" pop-up for the beta, so this file alone is
 * exempt (scripts/design-check.ts).
 */
const OFF = process.env.NEXT_PUBLIC_BUILDS === 'off';
const builds = (path: string) => path === '/create' || path.startsWith('/create/') || path.startsWith('/mog/');

export function ComingSoon() {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!OFF) return;
    const url = new URL(location.href);
    if (url.searchParams.has('soon')) {
      setOpen(true);
      url.searchParams.delete('soon');
      history.replaceState(history.state, '', url.pathname + url.search + url.hash);
    }
    // capture on window runs before React's own listeners, so the Link never navigates
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || a.origin !== location.origin || !builds(a.pathname)) return;
      e.preventDefault(); e.stopPropagation();
      setOpen(true);
    };
    window.addEventListener('click', onClick, true);
    return () => window.removeEventListener('click', onClick, true);
  }, []);

  useEffect(() => {
    if (!open) return;
    button.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!OFF || !open) return null;
  return (
    <div onClick={() => setOpen(false)} style={{
      position: 'fixed', inset: 0, zIndex: 80, display: 'grid', placeItems: 'center', padding: 16,
      background: 'rgba(11,11,15,.28)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
    }}>
      <div role="dialog" aria-modal="true" aria-labelledby="soon-title" onClick={(e) => e.stopPropagation()} style={{
        width: 'min(420px, 100%)', padding: '32px 28px 28px', borderRadius: 'var(--r)', textAlign: 'center', color: '#FFFFFF',
        background: 'rgba(255,255,255,.16)', border: '1px solid rgba(255,255,255,.42)',
        backdropFilter: 'blur(22px) saturate(170%)', WebkitBackdropFilter: 'blur(22px) saturate(170%)',
      }}>
        <p className="kicker" style={{ color: 'rgba(255,255,255,.82)', margin: 0 }}>GameMog beta</p>
        <h2 id="soon-title" style={{ fontSize: 34, lineHeight: '40px', margin: '8px 0 10px', color: '#FFFFFF' }}>Coming soon</h2>
        <p style={{ margin: '0 0 24px', fontSize: 15, lineHeight: '22px', color: 'rgba(255,255,255,.9)' }}>
          Creating and Mogging worlds opens soon. Every world on GameMog is live to play right now.
        </p>
        <button ref={button} type="button" className="btn big light" onClick={() => setOpen(false)}>Keep playing</button>
      </div>
    </div>
  );
}
