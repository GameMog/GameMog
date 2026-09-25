'use client';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { playerId } from './anon';

/**
 * First-party page views (lib/analytics.ts). Where a visit came from is sent
 * once, with the page it landed on. Nothing is sent from /admin, from game
 * previews, or from automated browsers.
 */
let landed = false, last = '', lastAt = 0;

export function track(kind: 'view' | 'play', path = typeof location === 'undefined' ? '/' : location.pathname) {
  try {
    if (navigator.webdriver || /(^|[?&])preview=1/.test(location.search) || path.startsWith('/admin')) return;
    // the same page twice within a second is one view (React runs effects twice in development)
    const key = `${kind}:${path}`;
    if (key === last && Date.now() - lastAt < 1000) return;
    last = key; lastAt = Date.now();
    const body: Record<string, string> = { v: playerId(), k: kind, p: path };
    if (!landed) {
      landed = true;
      const q = new URLSearchParams(location.search);
      const source = q.get('utm_source') ?? q.get('ref');
      if (source) body.s = source;
      try { const r = document.referrer && new URL(document.referrer); if (r && r.host !== location.host) body.r = r.host; } catch { /* no referrer */ }
    }
    const blob = new Blob([JSON.stringify(body)], { type: 'application/json' });
    if (!navigator.sendBeacon?.('/api/hit', blob)) fetch('/api/hit', { method: 'POST', body: blob, keepalive: true }).catch(() => {});
  } catch { /* analytics never breaks a page */ }
}

export function Beacon() {
  const path = usePathname();
  useEffect(() => { track('view', path); }, [path]);
  return null;
}
