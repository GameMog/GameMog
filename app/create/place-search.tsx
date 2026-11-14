'use client';
import { useEffect, useId, useReducer, useRef } from 'react';
import type { Place, PlaceSelection } from '@/lib/places/types';
import type { CityRequest, TownProgress } from '@/lib/places/request-city';
import { boxReducer, enterPick, initialBox, type Option } from '@/lib/places/combobox';

const people = (n: number | null) => (n === null ? '' : `${n.toLocaleString('en-US')} people`);

/**
 * The town box (Hometown, Milestone 6): type a US town, pick it from the list. A combobox in the
 * WAI-ARIA 1.2 pattern: the input owns the list (aria-controls, aria-expanded, aria-activedescendant),
 * Up and Down move through it, Enter picks, Escape closes it and a second Escape clears the box.
 * Results come from /api/places as you type; every edit empties the list and aborts the search before,
 * and only the answer for the text in the box is shown (lib/places/combobox.ts). `onPick` gets
 * {placeId, name, state, bbox, lat, lon, geoid, domain} (domain: the hg1 tile grid's, from the GEOID's state prefix).
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
    const { placeId, name, state, bbox, lat, lon, geoid, domain } = o;
    dispatch({ t: 'input', text: `${name}, ${state}`, open: false });
    onPick({ placeId, name, state, bbox, lat, lon, geoid, domain }, o);
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

/** About how long, in a player's words ('' when unknown). */
const wait = (s: number | null | undefined) => (s == null ? '' : s < 90 ? `about ${Math.max(10, Math.round(s / 10) * 10)} seconds` : `about ${Math.round(s / 60)} minutes`);
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/**
 * The picked town's card (Hometown): its build while it runs, in honest steps (r7): the step it is on with its count
 * (a builder starting, map areas fetched, map sections read, its plan, map tiles built), a bar of the whole town that
 * never goes back, the waits to drive and to the whole town as the server calibrates them from the towns it really
 * built (lib/hometown-build/towns.ts honestEta), and the time so far. Then its three ready states, each said plainly:
 * Ready to write (the story may start: Write the story waits for this, app/create/page.tsx), Ready to drive (with
 * "Drive around <town>", the town's free-roam test drive in Mog City, a new tab) and Your whole town is built; or why not.
 */
export function TownCard({ town, onClear }: { town: { place: Place; progress: TownProgress | null; request: CityRequest | null }; onClear?: () => void }) {
  const { place, request } = town;
  const name = `${place.name}, ${place.stateName}`;
  const ready = request?.status === 'ready' ? request : null;
  const p = ready ? ready.progress ?? null : town.progress;
  // (the three ready states: the story may start; drivable; whole)
  const whole = !!ready && !ready.growing;
  const drivable = whole || (!!ready && (p?.phase === 'growing' || p?.phase === 'full' || !!ready.drive));
  const writable = !!ready;
  const drive = ready?.drive ?? p?.drive ?? null;
  // (the bar: the server's work-based share of the whole town, never shown going back while the card shows this town)
  const top = useRef<{ id: string; pct: number }>({ id: '', pct: 0 });
  if (top.current.id !== place.placeId) top.current = { id: place.placeId, pct: 0 };
  const raw = whole ? 100 : p?.pct ?? (p && p.total ? Math.round((95 * p.done) / p.total) : 0);
  const pct = (top.current.pct = Math.max(top.current.pct, Math.min(100, raw)));
  // (the waits as times they end, kept while a poll's new one is within 25% of the wait left (or a minute) of it: the
  // server's estimate moves with the queue's measured costs as jobs finish (r8: a big town's hidden waits went 2304 s,
  // 1203, 1596, 2547 in a few polls), so the card counts down and moves only for a real change)
  const ends = useRef<{ id: string; drive: number | null; full: number | null }>({ id: '', drive: null, full: null });
  if (ends.current.id !== place.placeId) ends.current = { id: place.placeId, drive: null, full: null };
  const now = Date.now();
  const steady = (k: 'drive' | 'full', s: number | null | undefined) => {
    if (s == null) { ends.current[k] = null; return null; }
    const at = now + s * 1000, was = ends.current[k];
    if (was == null || Math.abs(at - was) > Math.max(60_000, 0.25 * Math.max(0, was - now))) ends.current[k] = at;
    return Math.max(0, Math.round((ends.current[k]! - now) / 1000));
  };
  const etaDrive = steady('drive', p?.etaDriveS), etaFull = steady('full', p?.etaFullS);
  const state = request ? (request.status === 'ready' ? (whole ? 'whole' : drivable ? 'drive' : 'write') : 'error') : p?.state ?? 'asking';

  let head = '', note = '';
  if (request?.status === 'error') head = request.error;
  else if (whole && ready) head = `Your whole town is built: ${ready.town.places} places on ${ready.town.streets} streets.`;
  else if (drivable) head = 'Ready to drive. The rest of town keeps building.';
  else if (writable && ready) head = `Ready to write: ${ready.town.places} places. ${p?.stage ? `${p.stage}.` : 'The streets near you are being laid.'}`;
  else head = `${p ? p.stage : 'Finding your town'}${p && p.position > 1 ? ` (number ${p.position} in line)` : ''}`;
  if (!request || (ready && !whole)) {
    const bits: string[] = [];
    const s = p?.steps;
    const tilesOn = s ? s.tiles.total > 0 && (s.ctx.total === 0 || s.ctx.done >= s.ctx.total) : !!p?.total;
    if (p && p.total && tilesOn) bits.push(`${p.done} of ${p.total} map tiles`);
    // (a town past what towns usually take gets no time it cannot back: it says it is slow instead, below)
    if (!p?.slow && !drivable && etaDrive != null) bits.push(`ready to drive in ${wait(etaDrive)}`);
    if (!p?.slow && etaFull != null && (drivable || etaFull > (etaDrive ?? 0) + 30)) bits.push(`whole town in ${wait(etaFull)}`);
    if (p?.elapsedS != null) bits.push(`${clock(p.elapsedS)} so far`);
    note = bits.length ? `${bits.join(', ')}.` : 'Building its real streets.';
    note = note.charAt(0).toUpperCase() + note.slice(1);
    if (p?.slow) note += ' This one is taking longer than usual; it keeps building.';
    if (!writable) note += ' You can write your story meanwhile.';
  }
  return (
    <div className={`ttown ${request?.status ?? 'building'}`} data-place-id={place.placeId} data-state={state} data-pct={pct} role="status" aria-live="polite">
      <div className="ttown-head">
        <b>{name}</b>
        {onClear && <button type="button" className="ttown-x" onClick={onClear} aria-label="Pick another town">Change</button>}
      </div>
      <p className="ttown-stage">{head}</p>
      {request?.status !== 'error' && (
        <>
          {!whole && <div className="ttown-bar" role="progressbar" aria-label="Town built" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}><i style={{ width: `${pct}%` }} /></div>}
          {note && <p className="ttown-note">{note}</p>}
          <ul className="ttown-steps" aria-label="Your town">
            <li className={writable ? 'on' : undefined}>{writable ? 'Ready to write' : 'Write the story'}</li>
            <li className={drivable ? 'on' : undefined}>{drivable ? 'Ready to drive' : 'Drive'}</li>
            <li className={whole ? 'on' : undefined}>{whole ? 'Whole town built' : 'Whole town'}</li>
          </ul>
          {drivable && drive && (
            <a className="btn outline ttown-drive" href={drive} target="_blank" rel="noopener noreferrer">Drive around {place.name}</a>
          )}
        </>
      )}
    </div>
  );
}
