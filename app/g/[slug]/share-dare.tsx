'use client';
import { useEffect, useRef, useState } from 'react';
// (react-dom ships no types in this project, and @types/react-dom is not a dependency: createPortal is used as declared)
// @ts-ignore TS7016
import { createPortal as portal } from 'react-dom';
import { playerId } from '../../anon';
import { cleanName, cleanMessage } from '@/lib/names';
import { renderDareCard, cardBase64 } from '@/lib/dare-card';
import type { DareView, Target } from '@/lib/dare';
import { DiscordPill, GlassFont } from '../../discord-pill';
import { lastRun, dareEvent } from './play-frame';

/**
 * "Dare someone" (the dare loop, 10 Oct): a small glass sheet from the game page's Dare action, and from the results
 * overlay's "Send it back" (then with parent = the dare being answered). An optional name (kept in this browser as
 * gamemog:creator), an optional line, and one gold Send: the system share sheet where there is one, else the link copied.
 *
 * The dare is made the moment the sheet opens (POST /api/dares), so its link is ready before the tap and the share
 * call stays inside the tap's gesture (Safari refuses a share that waited on the network). A name or line typed after
 * makes a fresh dare once the typing stops; a tap that comes before it is ready waits for it, and if the browser then
 * refuses the share the button asks for one more tap. The visitor's last finished run on this game rides along as the
 * score to beat (app/g/[slug]/play-frame.tsx lastRun). The card (lib/dare-card.ts) is drawn here with the score the
 * server worked out and uploaded after (POST /api/dares/<id>/card); until it lands the link previews with the cover.
 */

type Made = { id: string; url: string; target: Target | null; key: string };
const NAME_KEY = 'gamemog:creator';
const keyOf = (name: string, message: string) => `${name.trim()}\n${message.trim()}`;

async function post(url: string, body: unknown): Promise<{ ok: boolean; status: number; json: Record<string, unknown> }> {
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return { ok: r.ok, status: r.status, json: ((await r.json().catch(() => ({}))) ?? {}) as Record<string, unknown> };
  } catch { return { ok: false, status: 0, json: {} }; }
}

export function ShareDare({ gameId, slug, title, parent = null, run, onClose }: {
  gameId: string; slug: string; title: string;
  /** the dare this one answers ("Send it back") */
  parent?: string | null;
  /** the run to carry; the visitor's last finished run on this game when not given */
  run?: Record<string, unknown> | null;
  onClose: () => void;
}) {
  const [name, setName] = useState(() => { try { return localStorage.getItem(NAME_KEY) ?? ''; } catch { return ''; } });
  const [message, setMessage] = useState('');
  const [made, setMade] = useState<Made | null>(null);
  const [error, setError] = useState<{ field: 'name' | 'message' | 'other'; text: string } | null>(null);
  const [card, setCard] = useState<string | null>(null);
  const [state, setState] = useState<'idle' | 'waiting' | 'again' | 'sent' | 'copied' | 'link'>('idle');
  const runRef = useRef<Record<string, unknown> | null>(run ?? lastRun(gameId));
  const seq = useRef(0);
  const pending = useRef<{ key: string; p: Promise<Made | null> } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  // (inside the frame while anything is full screen, or the frame takes the screen itself, so it shows over the game;
  // else over the page)
  const [host] = useState<HTMLElement | null>(() => {
    if (typeof document === 'undefined') return null;
    const frame = document.getElementById('play');
    return frame && (document.fullscreenElement || frame.classList.contains('gl-pseudo')) ? frame : document.body;
  });
  const inFrame = host !== null && host !== document.body;

  /** Make the dare for this name and line (a newer call wins), then draw and upload its card. */
  function make(nm: string, msg: string): Promise<Made | null> {
    const key = keyOf(nm, msg), mine = ++seq.current;
    const p = (async () => {
      const body = { gameId, sender: playerId(), name: nm.trim() || null, message: msg.trim() || null, parent, run: runRef.current };
      let r = await post('/api/dares', body);
      // (a run the server will not take, as one held for review: the dare goes without a score)
      if (r.status === 422 && r.json.field === 'run' && runRef.current) { runRef.current = null; r = await post('/api/dares', { ...body, run: null }); }
      if (mine !== seq.current) return null;
      if (!r.ok || typeof r.json.id !== 'string') {
        const f = r.json.field === 'name' || r.json.field === 'message' ? r.json.field : 'other';
        setError({ field: f, text: typeof r.json.error === 'string' ? r.json.error : 'That did not go through. Try again.' });
        return null;
      }
      const m: Made = { id: r.json.id, url: new URL(String(r.json.url), location.origin).href, target: (r.json.target as Target | null) ?? null, key };
      setMade(m); setError(null);
      void drawCard(m, nm.trim(), mine);
      return m;
    })();
    pending.current = { key, p };
    return p;
  }

  async function drawCard(m: Made, nm: string, mine: number) {
    try {
      const v = await fetch(`/api/dares/${m.id}`).then((r) => (r.ok ? (r.json() as Promise<DareView>) : null)).catch(() => null);
      const blob = await renderDareCard({
        cover: `/g/${slug}/cover`, title, from: nm || null, creator: v?.game.creator ?? null, parentTitle: v?.game.parent?.title ?? null,
        scoreText: m.target?.text ?? null, scoreSub: m.target?.sub ?? null, scoreLabel: m.target?.label ?? null,
      });
      if (mine === seq.current) setCard(URL.createObjectURL(blob));
      await post(`/api/dares/${m.id}/card`, { sender: playerId(), card: await cardBase64(blob) });
    } catch { /* the link previews with the game's cover */ }
  }

  // the dare, made as the sheet opens (once: development runs effects twice)
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    void make(name, '');
    box.current?.focus();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => () => { if (card) URL.revokeObjectURL(card); }, [card]);

  // a name or line typed: checked here first (lib/names.ts), then a fresh dare once the typing stops
  useEffect(() => {
    const key = keyOf(name, message);
    if (made?.key === key || pending.current?.key === key) return;
    const n = name.trim() ? cleanName(name) : null, msg = cleanMessage(message);
    if (n && !n.ok) { setError({ field: 'name', text: n.error }); return; }
    if (!msg.ok) { setError({ field: 'message', text: msg.error }); return; }
    setError(null);
    const t = setTimeout(() => { void make(name, message); }, 700);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, message]);

  // Escape closes
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [onClose]);

  async function share(m: Made, late: boolean) {
    try { if (name.trim()) localStorage.setItem(NAME_KEY, name.trim()); } catch {}
    const text = message.trim() || (m.target ? `Beat my ${m.target.text} on ${title}.` : `${title}. Your turn.`);
    if (typeof navigator.share === 'function') {
      try { await navigator.share({ title, text, url: m.url }); done(m, 'sent'); return; }
      catch (e) {
        const n = (e as { name?: string })?.name;
        if (n === 'AbortError') { setState('idle'); return; }
        // (the tap's gesture ran out while the dare was made: one more tap shares at once)
        if (n === 'NotAllowedError' && late) { setState('again'); return; }
      }
    }
    try { await navigator.clipboard.writeText(m.url); done(m, 'copied'); }
    catch { setState(late ? 'again' : 'link'); }
  }
  function done(m: Made, how: 'sent' | 'copied') { setState(how); dareEvent(m.id, 'shared'); }

  function send() {
    if (error && error.field !== 'other') return;
    const key = keyOf(name, message);
    if (made && made.key === key) { void share(made, false); return; }
    setState('waiting');
    const p = pending.current?.key === key ? pending.current.p : make(name, message);
    void p.then((m) => { if (m) void share(m, true); else setState('idle'); });
  }

  const blocked = !!error && error.field !== 'other';
  const label = state === 'waiting' ? 'Getting it ready' : state === 'again' ? 'Tap to send' : parent ? 'Send it back' : 'Send the dare';
  const note = state === 'sent' ? 'Sent.' : state === 'copied' ? 'Link copied. Paste it anywhere.'
    : made?.target ? `They play free and try to beat your ${made.target.text}.` : 'They play free and try to beat you.';

  if (!host) return null;
  return (portal as (children: React.ReactNode, host: Element) => React.ReactNode)(
    <div className={`gl dv-modal${inFrame ? ' dv-in' : ''}`} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <GlassFont />
      <div style={{ width: 'min(420px, 100%)' }}>
        <div ref={box} tabIndex={-1} className="dv-card gl-glass gl-deep gl-lit" role="dialog" aria-modal="true" aria-labelledby="dv-ttl">
          <button type="button" className="gl-cap dv-x" onClick={onClose}>Close</button>
          <h2 id="dv-ttl" className="gl-ttl dv-ttl">{parent ? 'Send it back' : 'Dare someone'}</h2>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="dv-preview" src={card ?? `/g/${slug}/cover`} alt={card ? 'Your dare card' : ''} />
          <input className="gl-field" value={name} onChange={(e) => setName(e.target.value.slice(0, 24))} placeholder="Your name" aria-label="Your name" autoComplete="nickname" maxLength={24} />
          {error?.field === 'name' && <p className="dv-err" role="alert">{error.text}</p>}
          <input className="gl-field" value={message} onChange={(e) => setMessage(e.target.value.slice(0, 140))} placeholder="Add a message (optional)" aria-label="Your message" maxLength={140}
            onKeyDown={(e) => { if (e.key === 'Enter') send(); }} />
          {error && error.field !== 'name' && <p className="dv-err" role="alert">{error.text}</p>}
          <button type="button" className="gl-pill gl-gold" onClick={send} disabled={blocked || state === 'waiting'}>{label} <Arrow /></button>
          {state === 'link' && made
            ? <input className="gl-field" readOnly value={made.url} aria-label="Dare link" onFocus={(e) => e.currentTarget.select()} />
            : <p className="dv-note" role="status">{note}</p>}
        </div>
        <div className="dv-under"><DiscordPill /></div>
      </div>
    </div>,
    host,
  );
}

const Arrow = () => (
  <svg width={14} height={14} viewBox="0 0 20 20" fill="currentColor" aria-hidden><path d="M6 4h10v10h-2V7.4l-8.3 8.3-1.4-1.4L12.6 6H6z" /></svg>
);
