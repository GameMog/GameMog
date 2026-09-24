'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { DEFAULT_ME, HAIR_COLORS, KITS, TONES, meFragment, sanitizeMe, type Me } from '@/lib/me';
import { saveMe, useMe } from '../me-store';

/** The world you first stand in: the start line of the flagship. */
const STUDIO = 'la-olympics-2028';

const HAIR_LABEL: Record<Me['hair'], string> = { short02: 'Cropped', short04: 'Short', afro01: 'Afro', none: 'None' };
const BUILD_LABEL: Record<Me['build'], string> = { slim: 'Slim', athletic: 'Athletic', strong: 'Strong' };

/** A phone photo is several megabytes; 640px is plenty to read a look from. */
async function shrink(file: File): Promise<string> {
  const bm = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const k = Math.min(1, 640 / Math.max(bm.width, bm.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bm.width * k); c.height = Math.round(bm.height * k);
  c.getContext('2d')!.drawImage(bm, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.86);
}

/**
 * "You are the main character": a selfie becomes your runner, you see them
 * standing on a real start line, fix anything in a tap, and go.
 */
export function MeMaker({ then }: { then: string }) {
  const saved = useMe();
  const [step, setStep] = useState<'start' | 'reading' | 'look'>('start');
  const [age, setAge] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const [note, setNote] = useState('');
  const [fromPhoto, setFromPhoto] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  // someone who already made their character goes straight to it
  useEffect(() => {
    if (saved && !me) { setMe(saved); setAge(true); setStep('look'); }
  }, [saved, me]);

  async function onPhoto(f: File | undefined) {
    if (!f) return;
    setStep('reading'); setNote('');
    try {
      const image = await shrink(f);
      const res = await fetch('/api/me/selfie', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ image, age13: true }) });
      const d = await res.json();
      if (res.ok) { setMe(sanitizeMe({ ...d.me, name: me?.name ?? d.me.name })); setFromPhoto(true); setStep('look'); return; }
      setNote(d.error ?? 'That photo could not be read.');
      if (res.status === 503) { setMe(me ?? { ...DEFAULT_ME }); setStep('look'); } else setStep(me ? 'look' : 'start');
    } catch {
      setNote('That photo could not be read.'); setStep(me ? 'look' : 'start');
    } finally { if (file.current) file.current.value = ''; }
  }

  const picker = (
    <input ref={file} type="file" accept="image/*" capture="user" hidden onChange={(e) => onPhoto(e.target.files?.[0])} />
  );

  if (step === 'start' || !me) {
    return (
      <div className="you-start">
        {picker}
        <p className="kicker" style={{ color: 'var(--ink-3)' }}>GameMog</p>
        <h1 className="you-h1">You are the main character.</h1>
        <p className="you-lede">Take a selfie and GameMog makes a runner who looks like you. You play as them in every world.</p>
        <label className="you-age">
          <input type="checkbox" checked={age} onChange={(e) => setAge(e.target.checked)} /> I am 13 or older
        </label>
        {step === 'reading'
          ? <div className="panel" role="status" aria-live="polite" style={{ marginTop: 18 }}><b>Reading your photo</b><p className="dim" style={{ marginTop: 4 }}>A few seconds.</p></div>
          : (
            <div className="acts" style={{ marginTop: 18 }}>
              <button className="btn big" disabled={!age} onClick={() => file.current?.click()}>Take a selfie</button>
              <button className="btn big outline" disabled={!age} onClick={() => { setMe({ ...DEFAULT_ME }); setStep('look'); }}>Pick my look</button>
            </div>
          )}
        {note && <div className="msg warn" style={{ marginTop: 14 }}><b>note</b><span>{note}</span></div>}
        <p className="t-meta dim" style={{ marginTop: 18, maxWidth: 520 }}>
          Your photo is read once to choose your look and is never stored. Your character is saved in this browser. <Link href="/privacy">Privacy</Link>
        </p>
      </div>
    );
  }

  const set = (patch: Partial<Me>) => setMe((m) => sanitizeMe({ ...m, ...patch }));
  return (
    <div className="you-look">
      {picker}
      <Studio me={me} />
      <div className="you-panel">
        <h1 className="you-h2">Looks like you?</h1>
        {note && <div className="msg warn" style={{ margin: '10px 0' }}><b>note</b><span>{note}</span></div>}
        <div className="you-row">
          <label className="lbl">Name on your bib</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="text" value={me.name} maxLength={14} onChange={(e) => set({ name: e.target.value })} aria-label="Your name" />
            <input type="text" value={me.kit.number} maxLength={3} inputMode="numeric" style={{ width: 70 }} onChange={(e) => set({ kit: { ...me.kit, number: e.target.value } })} aria-label="Your number" />
          </div>
        </div>
        <Swatches label="Skin" values={TONES} on={me.tone} pick={(tone) => set({ tone })} />
        <Chips label="Hair" values={Object.keys(HAIR_LABEL) as Me['hair'][]} on={me.hair} name={(h) => HAIR_LABEL[h]} pick={(hair) => set({ hair })} />
        {me.hair !== 'none' && <Swatches label="Hair colour" values={HAIR_COLORS} on={me.hairColor} pick={(hairColor) => set({ hairColor })} />}
        <Chips label="Body" values={['a', 'b'] as Me['body'][]} on={me.body} name={(b) => (b === 'a' ? 'Body A' : 'Body B')} pick={(body) => set({ body })} />
        <Chips label="Build" values={Object.keys(BUILD_LABEL) as Me['build'][]} on={me.build} name={(b) => BUILD_LABEL[b]} pick={(build) => set({ build })} />
        <div className="you-row">
          <label className="lbl">Kit</label>
          <div className="you-swatches">
            {KITS.map((k) => (
              <button key={k.top + k.trim} className="you-kit" aria-pressed={me.kit.top === k.top && me.kit.trim === k.trim} aria-label={`Kit ${k.top}`}
                onClick={() => set({ kit: { ...k, number: me.kit.number } })}>
                <i style={{ background: k.top }} /><i style={{ background: k.trim }} />
              </button>
            ))}
          </div>
        </div>
        <div className="acts" style={{ marginTop: 18 }}>
          <button className="btn big" onClick={() => { saveMe(me); location.href = then; }}>That&apos;s me. Run</button>
          <button className="btn big outline" onClick={() => file.current?.click()}>{fromPhoto ? 'Retake selfie' : 'Use a selfie'}</button>
        </div>
        <p className="t-meta dim" style={{ marginTop: 12 }}>{fromPhoto ? 'Your photo was read once and not kept. ' : ''}You can change any of this later.</p>
      </div>
    </div>
  );
}

/**
 * You, standing on the start line of a real world, turning slowly. It is the
 * game itself (the runtime's portrait view), so what you see is what you play.
 */
function Studio({ me }: { me: Me }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [src] = useState(() => `/g/${STUDIO}/play?preview=1${meFragment(me)}`);
  const [live, setLive] = useState(false);
  useEffect(() => {
    if (live) return;
    const ask = () => ref.current?.contentWindow?.postMessage({ source: 'gamemog-host', type: 'hello' }, '*');
    const t = setInterval(ask, 400); ask();
    return () => clearInterval(t);
  }, [live]);
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (!ref.current || e.source !== ref.current.contentWindow) return;
      if (e.data?.source === 'gamemog' && e.data.type === 'ready') setLive(true);
    }
    addEventListener('message', onMessage);
    return () => removeEventListener('message', onMessage);
  }, []);
  useEffect(() => {
    if (!live) return;
    const w = ref.current?.contentWindow;
    w?.postMessage({ source: 'gamemog-host', type: 'view', view: 'portrait' }, '*');
    w?.postMessage({ source: 'gamemog-host', type: 'me', me }, '*');
  }, [live, me]);
  return (
    <div className="you-studio">
      <iframe ref={ref} src={src} sandbox="allow-scripts" title="Your character" className="frame" />
      {!live && <div className="you-wait" aria-hidden>Putting you on the start line</div>}
    </div>
  );
}

function Swatches({ label, values, on, pick }: { label: string; values: string[]; on: string; pick: (v: string) => void }) {
  return (
    <div className="you-row">
      <label className="lbl">{label}</label>
      <div className="you-swatches">
        {values.map((v) => (
          <button key={v} className="you-sw" style={{ background: v }} aria-pressed={on.toUpperCase() === v.toUpperCase()} aria-label={`${label} ${v}`} onClick={() => pick(v)} />
        ))}
      </div>
    </div>
  );
}

function Chips<T extends string>({ label, values, on, name, pick }: { label: string; values: T[]; on: T; name: (v: T) => string; pick: (v: T) => void }) {
  return (
    <div className="you-row">
      <label className="lbl">{label}</label>
      <div className="you-swatches">
        {values.map((v) => (
          <button key={v} className={`tag${v === on ? ' blue' : ''}`} aria-pressed={v === on} onClick={() => pick(v)}>{name(v)}</button>
        ))}
      </div>
    </div>
  );
}
