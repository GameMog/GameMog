'use client';
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * Motion for /admin, after the owner's brief (25 Sep): springs everywhere,
 * a tiny overshoot at most, one shape that morphs instead of being swapped,
 * content that changes behind a short blur.
 *
 * The site's design contract bans CSS transitions and animations, so every
 * moving value here is a closed-form spring evaluated each frame and written
 * straight to the element. A spring that is retargeted mid-flight starts a
 * new step response from the position and velocity it had at that instant,
 * so motion never jumps. Reduced-motion users get the end states at once.
 */

/** Natural frequency (rad/s) and damping ratio. z = 0.9 overshoots by 0.15%. */
export type Cfg = { w: number; z: number };
export const SNAP: Cfg = { w: 26, z: 0.9 };
export const LEAD: Cfg = { w: 38, z: 0.92 };
export const TRAIL: Cfg = { w: 15, z: 0.96 };
export const SOFT: Cfg = { w: 11, z: 1 };
export const DRAW: Cfg = { w: 5, z: 1 };

const now = () => performance.now() / 1000;
const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Displacement and velocity of a damped spring released at d0 with velocity v0, t seconds later. */
function step({ w, z }: Cfg, d0: number, v0: number, t: number): [number, number] {
  if (z >= 1) {
    const e = Math.exp(-w * t), b = v0 + w * d0;
    return [e * (d0 + b * t), e * (b - w * (d0 + b * t))];
  }
  const wd = w * Math.sqrt(1 - z * z), e = Math.exp(-z * w * t), c = Math.cos(wd * t), s = Math.sin(wd * t);
  const b = (v0 + z * w * d0) / wd;
  return [e * (d0 * c + b * s), e * (-z * w * (d0 * c + b * s) + wd * (b * c - d0 * s))];
}

export class Spring {
  target: number; private x0: number; private v0 = 0; private t0 = now();
  constructor(x: number, public cfg: Cfg = SNAP, private eps = 0.002) { this.target = x; this.x0 = x; }
  at(t = now()) { const [d, v] = step(this.cfg, this.x0 - this.target, this.v0, Math.max(0, t - this.t0)); return { x: this.target + d, v }; }
  get x() { return this.at().x; }
  to(target: number, cfg = this.cfg, t = now()) {
    if (reduced()) return this.jump(target);
    const { x, v } = this.at(t);
    this.x0 = x; this.v0 = v; this.t0 = t; this.target = target; this.cfg = cfg;
    return this;
  }
  /** A push without a new target: a shake, a nudge. */
  kick(v: number, t = now()) { const s = this.at(t); this.x0 = s.x; this.v0 = s.v + v; this.t0 = t; return this; }
  jump(x: number) { this.x0 = this.target = x; this.v0 = 0; this.t0 = now(); return this; }
  settled(t = now()) { const { x, v } = this.at(t); return Math.abs(x - this.target) < this.eps && Math.abs(v) < this.eps * 20; }
}

/* One frame loop for every moving thing on the page. A job returns false when it is done. */
const jobs = new Set<(t: number) => boolean>();
let raf = 0;
function frame() {
  const t = now();
  for (const j of [...jobs]) if (!j(t)) jobs.delete(j);
  raf = jobs.size ? requestAnimationFrame(frame) : 0;
}
export function run(job: (t: number) => boolean) {
  jobs.add(job);
  if (!raf) raf = requestAnimationFrame(frame);
  return () => { jobs.delete(job); };
}
/** Write every frame until all the springs rest (and `keep` lets go), then call `rest`. */
export function drive(springs: Spring[], write: (t: number) => void, keep?: () => boolean, rest?: () => void) {
  write(now());
  return run((t) => {
    write(t);
    const going = !!keep?.() || springs.some((s) => !s.settled(t));
    if (!going) rest?.();
    return going;
  });
}
export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export const mix = (a: number, b: number, p: number) => a + (b - a) * p;
const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
export function mixColor(a: string, b: string, p: number) {
  const x = hex(a), y = hex(b);
  return `rgb(${x.map((v, i) => Math.round(mix(v, y[i], Math.min(1, Math.max(0, p))))).join(',')})`;
}

/* --------------------------------------------------------------- tabs -- */
/**
 * Tabs whose indicator is one shape riding two springs: the edge it moves
 * toward leads on a stiff spring and the other trails on a soft one, so it
 * stretches as it travels and settles to the tab's width. `pill` sets it as a
 * white lozenge in a tray; otherwise it is an underline.
 */
export function Segmented<T extends string>({ items, value, onChange, pill, label, counts }: {
  items: readonly { id: T; label: string }[]; value: T; onChange: (v: T) => void; pill?: boolean; label: string; counts?: Partial<Record<T, number>>;
}) {
  const box = useRef<HTMLDivElement>(null), bar = useRef<HTMLSpanElement>(null);
  const l = useRef<Spring | null>(null), r = useRef<Spring | null>(null);

  const measure = useCallback(() => {
    const el = box.current?.querySelector<HTMLElement>(`[data-id="${CSS.escape(value)}"]`);
    return el ? { l: el.offsetLeft, r: el.offsetLeft + el.offsetWidth } : null;
  }, [value]);

  useLayoutEffect(() => {
    const m = measure(), b = bar.current;
    if (!m || !b) return;
    const write = () => { const a = l.current!.x, z = r.current!.x; b.style.transform = `translateX(${a}px)`; b.style.width = `${Math.max(0, z - a)}px`; };
    if (!l.current || !r.current) { l.current = new Spring(m.l); r.current = new Spring(m.r); write(); return; }
    const right = m.r > r.current.target;
    l.current.to(m.l, right ? TRAIL : LEAD);
    r.current.to(m.r, right ? LEAD : TRAIL);
    return drive([l.current, r.current], write);
  }, [measure]);

  // a resize puts the indicator straight under its tab
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const m = measure(), b = bar.current;
      if (!m || !b || !l.current || !r.current) return;
      l.current.jump(m.l); r.current.jump(m.r);
      b.style.transform = `translateX(${m.l}px)`; b.style.width = `${m.r - m.l}px`;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);

  const keys = (e: React.KeyboardEvent) => {
    const i = items.findIndex((x) => x.id === value);
    const n = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : -1;
    if (n < 0 || n >= items.length) return;
    e.preventDefault();
    onChange(items[n].id);
    box.current?.querySelector<HTMLElement>(`[data-id="${CSS.escape(items[n].id)}"]`)?.focus();
  };

  return (
    <div ref={box} className={pill ? 'seg pill' : 'seg line'} role="tablist" aria-label={label} onKeyDown={keys}>
      <span ref={bar} className="seg-bar" aria-hidden />
      {items.map((it) => (
        <button key={it.id} type="button" role="tab" data-id={it.id} aria-selected={it.id === value} tabIndex={it.id === value ? 0 : -1}
          className={it.id === value ? 'on' : undefined} onClick={() => onChange(it.id)}>
          {it.label}{counts?.[it.id] !== undefined && <i>{counts[it.id]}</i>}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------- toggle -- */
/**
 * A switch whose knob is the same two-edged shape: on press it widens toward
 * where it is going; on release the leading edge arrives first.
 */
export function Toggle({ on, onChange, label, disabled }: { on: boolean; onChange: (on: boolean) => void; label: string; disabled?: boolean }) {
  const W = 40, K = 18, P = 3;
  const knob = useRef<HTMLSpanElement>(null), track = useRef<HTMLButtonElement>(null);
  const s = useRef<{ l: Spring; r: Spring; c: Spring } | null>(null);
  const [held, setHeld] = useState(false);

  useLayoutEffect(() => {
    const k = knob.current, tr = track.current;
    if (!k || !tr) return;
    const stretch = held ? 5 : 0;
    const L = on ? W - P - K - stretch : P, R = on ? W - P : P + K + stretch;
    const write = () => {
      const { l, r, c } = s.current!;
      k.style.transform = `translateX(${l.x}px)`; k.style.width = `${r.x - l.x}px`;
      tr.style.background = mixColor('#CFCAC2', '#111111', c.x);
    };
    if (!s.current) { s.current = { l: new Spring(L), r: new Spring(R), c: new Spring(on ? 1 : 0) }; write(); return; }
    const { l, r, c } = s.current;
    // heading on (right), the right edge leads; heading off, the left does
    l.to(L, on ? TRAIL : LEAD); r.to(R, on ? LEAD : TRAIL);
    c.to(on ? 1 : 0, SNAP);
    return drive([l, r, c], write);
  }, [on, held]);

  return (
    <button ref={track} type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} className="tgl"
      onPointerDown={() => setHeld(true)} onPointerUp={() => setHeld(false)} onPointerLeave={() => setHeld(false)}
      onClick={() => onChange(!on)}>
      <span ref={knob} className="tgl-k" />
    </button>
  );
}

/* ------------------------------------------------------------ numbers -- */
/** A number that counts to its value, and springs from old to new when the value changes. */
export function Num({ value, format = (n) => Math.round(n).toLocaleString('en-US') }: { value: number; format?: (n: number) => string }) {
  const el = useRef<HTMLSpanElement>(null), s = useRef<Spring | null>(null);
  useLayoutEffect(() => {
    const e = el.current;
    if (!e) return;
    if (!s.current) s.current = new Spring(0, SOFT, Math.max(0.002, Math.abs(value) / 5000));
    s.current.to(value, SOFT);
    return drive([s.current], () => { e.textContent = format(s.current!.x); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return <span ref={el} className="num">{format(value)}</span>;
}

/* -------------------------------------------------------------- swaps -- */
/** Content that arrives out of a short blur whenever `k` changes. */
export function BlurIn({ k, children, className }: { k: string; children: React.ReactNode; className?: string }) {
  const el = useRef<HTMLDivElement>(null), s = useRef(new Spring(0, SNAP));
  useLayoutEffect(() => {
    const e = el.current;
    if (!e) return;
    s.current.jump(1).to(0, SNAP);
    return drive([s.current], () => {
      const p = s.current.x;
      e.style.opacity = String(1 - p);
      e.style.filter = p > 0.004 ? `blur(${(p * 7).toFixed(2)}px)` : 'none';
      e.style.transform = p > 0.004 ? `translateY(${(p * 8).toFixed(2)}px)` : 'none';
    });
  }, [k]);
  return <div ref={el} className={className}>{children}</div>;
}

/** A bar that grows to its share, a beat after the one above it. */
export function Bar({ share, delay = 0, className = 'bar' }: { share: number; delay?: number; className?: string }) {
  const el = useRef<HTMLSpanElement>(null), s = useRef(new Spring(0, SOFT));
  useLayoutEffect(() => {
    const e = el.current;
    if (!e) return;
    const start = now() + delay;
    let begun = false;
    return run((t) => {
      if (t < start) return true;
      if (!begun) { begun = true; s.current.to(Math.max(0, Math.min(1, share)), SOFT, t); }
      e.style.width = `${(s.current.at(t).x * 100).toFixed(2)}%`;
      return !s.current.settled(t);
    });
  }, [share, delay]);
  return <span ref={el} className={className} />;
}

/* ------------------------------------------------------ morph button -- */
export type Busy = 'idle' | 'busy' | 'done' | 'error';
/**
 * The brief's first beats: a button becomes a loader, the loader becomes a
 * check, and the check becomes the button again, all one shape changing its
 * width and corners. A wrong answer shakes it.
 */
export function MorphButton({ state, children, onClick, type = 'button', small, quiet }: {
  state: Busy; children: React.ReactNode; onClick?: () => void; type?: 'button' | 'submit'; small?: boolean; quiet?: boolean;
}) {
  const btn = useRef<HTMLButtonElement>(null), text = useRef<HTMLSpanElement>(null), ring = useRef<SVGSVGElement>(null), tick = useRef<SVGPathElement>(null);
  const s = useRef<{ w: Spring; lab: Spring; spin: Spring; chk: Spring; x: Spring } | null>(null);
  const H = small ? 30 : 44;

  useLayoutEffect(() => {
    const b = btn.current, tx = text.current, rg = ring.current, tk = tick.current;
    if (!b || !tx || !rg || !tk) return;
    const full = tx.scrollWidth + (small ? 24 : 36);
    const round = state === 'busy' || state === 'done';
    if (!s.current) s.current = { w: new Spring(full), lab: new Spring(1), spin: new Spring(0), chk: new Spring(0), x: new Spring(0, { w: 40, z: 0.35 }) };
    const { w, lab, spin, chk, x } = s.current;
    w.to(round ? H : full, SNAP); lab.to(round ? 0 : 1, SNAP); spin.to(state === 'busy' ? 1 : 0, SNAP); chk.to(state === 'done' ? 1 : 0, { w: 16, z: 1 });
    if (state === 'error') x.kick(-260);
    const t0 = now();
    return drive([w, lab, spin, chk, x], (t) => {
      const width = w.at(t).x, p = lab.at(t).x;
      b.style.width = `${width}px`;
      b.style.borderRadius = `${mix(H / 2, small ? 4 : 6, Math.min(1, Math.max(0, (width - H) / Math.max(1, full - H))))}px`;
      b.style.transform = `translateX(${x.at(t).x.toFixed(2)}px)`;
      tx.style.opacity = String(p);
      tx.style.filter = p < 0.996 ? `blur(${((1 - p) * 6).toFixed(2)}px)` : 'none';
      const sp = spin.at(t).x;
      rg.style.opacity = String(sp);
      rg.style.transform = `rotate(${((t - t0) * 400) % 360}deg)`;
      tk.style.strokeDashoffset = String(1 - chk.at(t).x);
    }, () => state === 'busy');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, H, small, String(children)]);

  return (
    <button ref={btn} type={type} className={`mbtn${small ? ' sm' : ''}${quiet ? ' quiet' : ''}`} onClick={onClick} disabled={state === 'busy'} style={{ height: H }} aria-busy={state === 'busy'}>
      <span ref={text} className="mbtn-t">{children}</span>
      <svg ref={ring} className="mbtn-ring" width={H * 0.45} height={H * 0.45} viewBox="0 0 20 20" aria-hidden>
        <path d="M10 2 A8 8 0 0 1 18 10" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      </svg>
      <svg className="mbtn-chk" width={H * 0.5} height={H * 0.5} viewBox="0 0 20 20" aria-hidden>
        <path ref={tick} d="M4.5 10.5 L8.5 14.5 L15.5 6" pathLength={1} strokeDasharray="1" strokeDashoffset="1" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

/* -------------------------------------------------------------- toast -- */
type ToastMsg = { id: number; text: string; action?: { label: string; run: () => void } };
const ToastCtx = createContext<(text: string, action?: ToastMsg['action']) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

/**
 * One toast at a time, and always the same shape: it rises as a dot, opens
 * to the width of what it says, retells a newer message by blurring its text
 * over, and closes back to a dot before it drops.
 */
export function Toasts({ children }: { children: React.ReactNode }) {
  const [msg, setMsg] = useState<ToastMsg | null>(null);
  const [open, setOpen] = useState(false);
  const shell = useRef<HTMLDivElement>(null), inner = useRef<HTMLDivElement>(null);
  const s = useRef({ w: new Spring(36), y: new Spring(90), t: new Spring(0) });
  const seq = useRef(0);

  const show = useCallback((text: string, action?: ToastMsg['action']) => { setMsg({ id: ++seq.current, text, action }); setOpen(true); }, []);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => setOpen(false), 5200);
    return () => clearTimeout(t);
  }, [open, msg]);

  useLayoutEffect(() => {
    const sh = shell.current, inn = inner.current;
    if (!sh || !inn || !msg) return;
    const { w, y, t } = s.current;
    const width = Math.min(inn.scrollWidth + 40, window.innerWidth - 32);
    if (open) { y.to(0, SNAP); w.to(width, LEAD); t.jump(0).to(1, SNAP); }
    else { t.to(0, SNAP); w.to(36, SNAP); y.to(90, { w: 14, z: 1 }); }
    return drive([w, y, t], () => {
      sh.style.width = `${w.x}px`;
      sh.style.transform = `translate(-50%, ${y.x}px)`;
      sh.style.opacity = String(Math.min(1, Math.max(0, 1 - y.x / 60)));
      const p = t.x;
      inn.style.opacity = String(p);
      inn.style.filter = p < 0.996 ? `blur(${((1 - p) * 6).toFixed(2)}px)` : 'none';
    });
  }, [open, msg]);

  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div ref={shell} className="toast" role="status" aria-live="polite" style={{ width: 36, transform: 'translate(-50%, 90px)', opacity: 0 }}>
        <div ref={inner} className="toast-in">
          {msg && <><span>{msg.text}</span>{msg.action && <button type="button" onClick={() => { msg.action!.run(); setOpen(false); }}>{msg.action.label}</button>}</>}
        </div>
      </div>
    </ToastCtx.Provider>
  );
}
