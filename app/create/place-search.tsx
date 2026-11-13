'use client';
import { useEffect, useId, useRef, useState } from 'react';
import type { Place, PlaceSelection } from '@/lib/places/types';

type Option = Place & { match?: string };

const people = (n: number | null) => (n === null ? '' : `${n.toLocaleString('en-US')} people`);

/**
 * The town box (Hometown, Milestone 6): type a US town, pick it from the list. A combobox in the
 * WAI-ARIA 1.2 pattern: the input owns the list (aria-controls, aria-expanded, aria-activedescendant),
 * Up and Down move through it, Enter picks, Escape closes it and a second Escape clears the box.
 * Results come from /api/places as you type, the newest query winning. `onPick` gets
 * {placeId, name, state, bbox, lat, lon}.
 */
export function PlaceSearch({ onPick, disabled }: { onPick: (place: PlaceSelection, full: Place) => void; disabled?: boolean }) {
  const id = useId();
  const listId = `${id}-list`;
  const [text, setText] = useState('');
  const [options, setOptions] = useState<Option[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState('');
  const abort = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // as you type: a short pause, then the newest query only
  useEffect(() => {
    const q = text.trim();
    if (!q) { setOptions([]); setSearched(''); setLoading(false); return; }
    const t = setTimeout(async () => {
      abort.current?.abort();
      const ctl = new AbortController();
      abort.current = ctl;
      setLoading(true);
      try {
        const res = await fetch(`/api/places?q=${encodeURIComponent(q)}&limit=8`, { signal: ctl.signal });
        const data = res.ok ? await res.json() as { places: Option[] } : { places: [] };
        if (ctl.signal.aborted) return;
        setOptions(data.places); setSearched(q); setActive(data.places.length ? 0 : -1);
      } catch {
        if (!ctl.signal.aborted) { setOptions([]); setSearched(q); }
      } finally {
        if (!ctl.signal.aborted) setLoading(false);
      }
    }, 90);
    return () => clearTimeout(t);
  }, [text]);

  // the highlighted row stays in view
  useEffect(() => {
    if (active < 0) return;
    listRef.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  function pick(o: Option) {
    const { placeId, name, state, bbox, lat, lon } = o;
    setText(`${name}, ${state}`);
    setOpen(false); setActive(-1);
    onPick({ placeId, name, state, bbox, lat, lon }, o);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) { setOpen(true); if (options.length && active < 0) setActive(0); return; }
      if (options.length) setActive((a) => (a + 1) % options.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) { setOpen(true); return; }
      if (options.length) setActive((a) => (a <= 0 ? options.length - 1 : a - 1));
    } else if (e.key === 'Enter') {
      if (open && active >= 0 && options[active]) { e.preventDefault(); pick(options[active]); }
    } else if (e.key === 'Escape') {
      if (open) { e.preventDefault(); setOpen(false); }
      else if (text) { e.preventDefault(); setText(''); }
    }
  }

  const q = text.trim();
  const showList = open && !!q && (options.length > 0 || (!loading && searched === q));
  const activeId = showList && active >= 0 ? `${id}-o${active}` : undefined;

  return (
    <div className="psearch">
      <input
        id={`${id}-input`}
        type="text" role="combobox" aria-label="Your hometown" aria-autocomplete="list"
        aria-expanded={showList} aria-controls={listId} aria-activedescendant={activeId}
        autoComplete="off" autoCorrect="off" autoCapitalize="words" spellCheck={false}
        inputMode="search" enterKeyHint="search"
        placeholder="Type a US town or city"
        value={text} disabled={disabled}
        onChange={(e) => { setText(e.target.value); setOpen(true); }}
        onFocus={() => { if (q) setOpen(true); }}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
      />
      <ul id={listId} role="listbox" aria-label="Towns" ref={listRef} className="psearch-list" hidden={!showList}>
        {options.map((o, i) => (
          <li
            key={o.placeId} id={`${id}-o${i}`} data-i={i} role="option" aria-selected={i === active}
            className={i === active ? 'on' : undefined}
            // mousedown, not click: the input keeps focus, so the list is not closed first
            onMouseDown={(e) => { e.preventDefault(); pick(o); }}
            onMouseMove={() => { if (active !== i) setActive(i); }}
          >
            <b>{o.name}<span>, {o.state}</span></b>
            <small>{[o.stateName, o.kind === 'CDP' ? 'community' : o.kind, people(o.pop)].filter(Boolean).join(' · ')}</small>
          </li>
        ))}
        {!options.length && <li className="none" role="presentation">No US town by that name</li>}
      </ul>
      <span className="sr-only" aria-live="polite">
        {showList ? (options.length ? `${options.length} towns. Up and down to choose, Enter to pick.` : 'No US town by that name.') : ''}
      </span>
    </div>
  );
}
