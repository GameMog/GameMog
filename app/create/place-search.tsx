'use client';
import { useEffect, useId, useReducer, useRef } from 'react';
import type { Place, PlaceSelection } from '@/lib/places/types';
import { boxReducer, enterPick, initialBox, type Option } from '@/lib/places/combobox';

const people = (n: number | null) => (n === null ? '' : `${n.toLocaleString('en-US')} people`);

/**
 * The town box (Hometown, Milestone 6): type a US town, pick it from the list. A combobox in the
 * WAI-ARIA 1.2 pattern: the input owns the list (aria-controls, aria-expanded, aria-activedescendant),
 * Up and Down move through it, Enter picks, Escape closes it and a second Escape clears the box.
 * Results come from /api/places as you type; every edit empties the list and aborts the search before,
 * and only the answer for the text in the box is shown (lib/places/combobox.ts). `onPick` gets
 * {placeId, name, state, bbox, lat, lon}.
 */
export function PlaceSearch({ onPick, disabled }: { onPick: (place: PlaceSelection, full: Place) => void; disabled?: boolean }) {
  const id = useId();
  const listId = `${id}-list`;
  const [box, dispatch] = useReducer(boxReducer, initialBox);
  const { text, options, open, active, loading, searched, seq } = box;
  const listRef = useRef<HTMLUListElement>(null);

  // as you type: a short pause, then the newest query only; a newer edit (or clearing the box) aborts it
  useEffect(() => {
    const q = text.trim();
    if (!q) return;
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      let places: Option[] = [];
      try {
        const res = await fetch(`/api/places?q=${encodeURIComponent(q)}&limit=8`, { signal: ctl.signal });
        if (res.ok) places = (await res.json() as { places: Option[] }).places;
      } catch { /* aborted or offline: no rows */ }
      if (!ctl.signal.aborted) dispatch({ t: 'results', seq, q, places });
    }, 90);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [text, seq]);

  // the highlighted row stays in view
  useEffect(() => {
    if (active < 0) return;
    listRef.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  function pick(o: Option) {
    const { placeId, name, state, bbox, lat, lon } = o;
    dispatch({ t: 'input', text: `${name}, ${state}`, open: false });
    onPick({ placeId, name, state, bbox, lat, lon }, o);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      dispatch({ t: 'move', by: e.key === 'ArrowDown' ? 1 : -1 });
    } else if (e.key === 'Enter') {
      // only a row that answers the text in the box: never one left from older text
      const o = enterPick(box);
      if (o) { e.preventDefault(); pick(o); }
    } else if (e.key === 'Escape') {
      if (open) { e.preventDefault(); dispatch({ t: 'close' }); }
      else if (text) { e.preventDefault(); dispatch({ t: 'input', text: '', open: false }); }
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
        onChange={(e) => dispatch({ t: 'input', text: e.target.value })}
        onFocus={() => { if (q) dispatch({ t: 'open' }); }}
        onBlur={() => dispatch({ t: 'close' })}
        onKeyDown={onKeyDown}
      />
      <ul id={listId} role="listbox" aria-label="Towns" ref={listRef} className="psearch-list" hidden={!showList}>
        {options.map((o, i) => (
          <li
            key={o.placeId} id={`${id}-o${i}`} data-i={i} role="option" aria-selected={i === active}
            className={i === active ? 'on' : undefined}
            // mousedown, not click: the input keeps focus, so the list is not closed first
            onMouseDown={(e) => { e.preventDefault(); pick(o); }}
            onMouseMove={() => dispatch({ t: 'hover', i })}
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
