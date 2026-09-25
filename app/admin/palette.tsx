'use client';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { LEAD, SNAP, Spring, TRAIL, clamp01, drive, mix } from './motion';

export type Command = { id: string; label: string; group: string; run: () => void; always?: boolean };

const ROW = 44;

/** Every word typed must appear in the label; labels that start with the query come first. */
function filter(all: Command[], q: string) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return all.filter((c) => c.always);
  return all
    .filter((c) => words.every((w) => c.label.toLowerCase().includes(w)))
    .sort((a, b) => Number(!a.label.toLowerCase().startsWith(words[0])) - Number(!b.label.toLowerCase().startsWith(words[0])));
}

/**
 * Command-K. The palette is its trigger, grown: it opens out of the search
 * pill in the top bar, rounding off its corners as it widens, and folds
 * back into it on close. The highlight is the tab indicator again, stretched
 * vertically between rows.
 */
export function Palette({ open, onClose, commands, anchor }: {
  open: boolean; onClose: () => void; commands: Command[]; anchor: React.RefObject<HTMLElement | null>;
}) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const [mounted, setMounted] = useState(false);
  const shell = useRef<HTMLDivElement>(null), body = useRef<HTMLDivElement>(null), veil = useRef<HTMLDivElement>(null);
  const hl = useRef<HTMLDivElement>(null), input = useRef<HTMLInputElement>(null);
  const p = useRef(new Spring(0, SNAP, 0.001)), h = useRef<Spring | null>(null);
  const top = useRef<Spring | null>(null), bot = useRef<Spring | null>(null);
  const list = useMemo(() => filter(commands, q).slice(0, 8), [commands, q]);

  useEffect(() => { if (open) { setMounted(true); setQ(''); setSel(0); } }, [open]);
  useEffect(() => { setSel(0); }, [q]);

  // the morph between the trigger and the panel
  useLayoutEffect(() => {
    const sh = shell.current, bd = body.current, vl = veil.current, a = anchor.current;
    if (!mounted || !sh || !bd || !vl || !a) return;
    const from = a.getBoundingClientRect();
    const W = Math.min(600, window.innerWidth - 24), left = (window.innerWidth - W) / 2, y = Math.min(window.innerHeight * 0.14, 110);
    // the content keeps the panel's final width throughout, so nothing reflows mid-morph
    bd.style.width = `${W}px`;
    if (!h.current) h.current = new Spring(bd.scrollHeight);
    h.current.to(bd.scrollHeight, SNAP);
    p.current.to(open ? 1 : 0, open ? SNAP : { w: 30, z: 1 });
    if (open) input.current?.focus();
    return drive([p.current, h.current], () => {
      const k = p.current.x, c = clamp01((k - 0.4) / 0.6);
      sh.style.left = `${mix(from.left, left, k)}px`;
      sh.style.top = `${mix(from.top, y, k)}px`;
      sh.style.width = `${mix(from.width, W, k)}px`;
      sh.style.height = `${mix(from.height, h.current!.x, k)}px`;
      sh.style.borderRadius = `${mix(from.height / 2, 8, clamp01(k * 1.4))}px`;
      bd.style.opacity = String(c);
      bd.style.filter = c < 0.996 ? `blur(${((1 - c) * 6).toFixed(2)}px)` : 'none';
      vl.style.opacity = String(clamp01(k));
    }, undefined, () => { if (!open) setMounted(false); });
  }, [open, mounted, list.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // the highlight rides two springs, like the tabs
  useLayoutEffect(() => {
    const el = hl.current;
    if (!el || !mounted) return;
    const T = sel * ROW, B = T + ROW;
    if (!top.current || !bot.current) { top.current = new Spring(T); bot.current = new Spring(B); }
    const down = B > bot.current.target;
    top.current.to(T, down ? TRAIL : LEAD); bot.current.to(B, down ? LEAD : TRAIL);
    return drive([top.current, bot.current], () => {
      el.style.transform = `translateY(${top.current!.x}px)`;
      el.style.height = `${bot.current!.x - top.current!.x}px`;
    });
  }, [sel, mounted]);

  if (!mounted) return null;
  const go = (c?: Command) => { if (!c) return; onClose(); c.run(); };
  const keys = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => (list.length ? (s + 1) % list.length : 0)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => (list.length ? (s - 1 + list.length) % list.length : 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); go(list[sel]); }
  };

  return (
    <div className="pal-root" onKeyDown={keys}>
      <div ref={veil} className="pal-veil" onClick={onClose} style={{ opacity: 0 }} />
      <div ref={shell} className="pal" role="dialog" aria-modal="true" aria-label="Command menu">
        <div ref={body} className="pal-body" style={{ opacity: 0 }}>
          <div className="pal-in">
            <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden><circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.8" fill="none" /><path d="M13.5 13.5 L17.5 17.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
            <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type a world, a tab or an action" aria-label="Search commands"
              role="combobox" aria-expanded="true" aria-controls="pal-list" aria-activedescendant={list[sel] ? `pal-${list[sel].id}` : undefined} />
            <kbd>esc</kbd>
          </div>
          <div className="pal-list" id="pal-list" role="listbox">
            <div ref={hl} className="pal-hl" style={{ opacity: list.length ? 1 : 0 }} />
            {list.map((c, i) => (
              <div key={c.id} id={`pal-${c.id}`} role="option" aria-selected={i === sel} className={i === sel ? 'pal-row on' : 'pal-row'}
                onPointerMove={() => setSel(i)} onClick={() => go(c)}>
                <span>{c.label}</span><em>{c.group}</em>
              </div>
            ))}
            {!list.length && <p className="pal-none">Nothing matches &ldquo;{q}&rdquo;.</p>}
          </div>
          <div className="pal-foot">Arrows to move, Enter to run, Esc to close</div>
        </div>
      </div>
    </div>
  );
}
