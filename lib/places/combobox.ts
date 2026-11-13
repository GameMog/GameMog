/**
 * Hometown place search: the town box's state (app/create/place-search.tsx), kept pure so npm run
 * check can drive it without a browser.
 *
 * Every edit of the text starts a new search, numbered `seq`, and empties the list at once: rows for
 * older text are never shown or picked, so Enter during the pause before the next answer does nothing
 * rather than picking a town for what was typed before. An answer is taken only when its number is
 * the newest and its query is the text in the box, so a slow answer for a query since cleared or
 * changed cannot refill the list.
 */
import type { Place } from './types.ts';

export type Option = Place & { match?: string };

export type BoxState = {
  text: string;
  options: Option[];
  open: boolean;
  active: number;
  loading: boolean;
  /** The query the options answer ('' before the first answer for this text). */
  searched: string;
  /** The newest search: bumped by every edit of the text. */
  seq: number;
};

export type BoxAction =
  | { t: 'input'; text: string; open?: boolean }
  | { t: 'results'; seq: number; q: string; places: Option[] }
  | { t: 'open' }
  | { t: 'close' }
  | { t: 'move'; by: 1 | -1 }
  | { t: 'hover'; i: number };

export const initialBox: BoxState = { text: '', options: [], open: false, active: -1, loading: false, searched: '', seq: 0 };

export function boxReducer(s: BoxState, a: BoxAction): BoxState {
  switch (a.t) {
    case 'input':
      return { ...s, text: a.text, open: a.open ?? true, options: [], active: -1, searched: '', loading: !!a.text.trim(), seq: s.seq + 1 };
    case 'results':
      if (a.seq !== s.seq || a.q !== s.text.trim()) return s;
      return { ...s, options: a.places, searched: a.q, active: a.places.length ? 0 : -1, loading: false };
    case 'open':
      return { ...s, open: true, active: s.active < 0 && s.options.length ? 0 : s.active };
    case 'close':
      return { ...s, open: false };
    case 'move': {
      const n = s.options.length;
      if (!s.open) return { ...s, open: true, active: a.by > 0 && s.active < 0 && n ? 0 : s.active };
      if (!n) return s;
      return { ...s, active: a.by > 0 ? (s.active + 1) % n : s.active <= 0 ? n - 1 : s.active - 1 };
    }
    case 'hover':
      return a.i === s.active ? s : { ...s, active: a.i };
  }
}

/** The row Enter picks: the highlighted one, only while the list answers the text in the box. */
export function enterPick(s: BoxState): Option | null {
  const q = s.text.trim();
  if (!s.open || !q || s.searched !== q || s.active < 0) return null;
  return s.options[s.active] ?? null;
}
