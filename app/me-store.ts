'use client';
import { useEffect, useState } from 'react';
import { sanitizeMe, type Me } from '@/lib/me';

/**
 * Your character, kept in this browser until accounts arrive (docs/PRODUCT.md,
 * step 2). Every game frame on the page reads it and hears when it changes.
 */
const KEY = 'gamemog:me';

export function loadMe(): Me | null {
  try { const s = localStorage.getItem(KEY); return s ? sanitizeMe(JSON.parse(s)) : null; } catch { return null; }
}

export function saveMe(me: Me) {
  try { localStorage.setItem(KEY, JSON.stringify(me)); } catch {}
  dispatchEvent(new CustomEvent('gamemog:me'));
}

/** `undefined` until the browser has been read, then your character or null. */
export function useMe(): Me | null | undefined {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  useEffect(() => {
    const read = () => setMe(loadMe());
    read();
    addEventListener('gamemog:me', read);
    addEventListener('storage', read);
    return () => { removeEventListener('gamemog:me', read); removeEventListener('storage', read); };
  }, []);
  return me;
}
