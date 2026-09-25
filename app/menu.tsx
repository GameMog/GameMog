'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

export type MenuItem = { label: string; href: string; key?: string };

/**
 * The site menu, in the manner of anthropic.com's: three thin lines at the top
 * right that open a full panel under the header, the pages as large links on
 * hairlines, and a thin cross to close it. Escape closes it too, and the page
 * behind stays still while it is open.
 */
export function SiteMenu({ items, on = '' }: { items: MenuItem[]; on?: string }) {
  const [open, setOpen] = useState(false);
  const [top, setTop] = useState(72);
  const btn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    // the panel starts where the header ends, wherever the page is scrolled
    const hdr = document.querySelector('.hdr');
    if (hdr) setTop(Math.max(0, Math.round(hdr.getBoundingClientRect().bottom)));
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); btn.current?.focus(); } };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <>
      <button ref={btn} type="button" className="menubtn" aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open} aria-controls="sitemenu" onClick={() => setOpen((o) => !o)}>
        {open ? (
          <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 5 L19 19 M19 5 L5 19" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none" />
          </svg>
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 6.5 H21 M3 12 H21 M9 17.5 H21" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none" />
          </svg>
        )}
        <span>{open ? 'Close' : 'Menu'}</span>
      </button>
      {open && (
        <div id="sitemenu" className="sitemenu" style={{ top }} role="dialog" aria-modal="true" aria-label="Menu">
          <nav className="wrap" aria-label="Browse">
            <ul>
              {items.map((n) => (
                <li key={n.label}>
                  <Link href={n.href} className={(n.key ?? n.label) === on ? 'on' : undefined} onClick={() => setOpen(false)}
                    aria-current={(n.key ?? n.label) === on ? 'page' : undefined}>
                    <span>{n.label}</span>
                    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M5 12 H19 M13 6 L19 12 L13 18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                    </svg>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      )}
    </>
  );
}
