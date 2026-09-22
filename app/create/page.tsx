'use client';
import { useRef, useState } from 'react';
import { SiteHeader } from '../header';
import { prepareUpload, type CharacterImage } from '@/lib/character';

type Finding = { level: 'error' | 'warn'; code: string; message: string };
type Report = { ok: boolean; findings: Finding[]; stats: Record<string, number> };

const EXAMPLES = [
  'A drowned cathedral city at low tide — barnacled spires, green glass light, lanterns made of jellyfish.',
  'The inside of a grandfather clock. Brass gears the size of hills, dust in the light, everything ticking.',
  'A night market on the back of a sleeping whale. Paper lanterns, steam, warm reds against black water.',
  'An orchard on a dying star. White grass, long shadows, fruit that glows because nothing else does.',
];

type Character = { name: string; fur: string; personality?: string; source?: string };

export default function Create() {
  const [prompt, setPrompt] = useState('');
  const [image, setImage] = useState<CharacterImage | null>(null);
  const [preview, setPreview] = useState('');
  const [hintFur, setHintFur] = useState('');
  const [charName, setCharName] = useState('');
  const [character, setCharacter] = useState<Character | null>(null);
  const [adjustments, setAdjustments] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [spec, setSpec] = useState<Record<string, unknown> | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState('');
  const [offline, setOffline] = useState(false);
  const [publishing, setPublishing] = useState(false);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError('');
    if (!/^image\/(png|jpeg|jpg|webp|gif)$/.test(file.type)) {
      setError('That needs to be a PNG, JPEG, WebP or GIF.');
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      setError('That image is over 12MB. Try a smaller one.');
      return;
    }
    try {
      // Resized in the browser: a character reference needs no fidelity, and
      // it keeps the upload (and the vision token cost) small.
      const { image: img, preview: p, dominant } = await prepareUpload(file);
      setImage(img); setPreview(p); setHintFur(dominant);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function clearCharacter() {
    setImage(null); setPreview(''); setHintFur(''); setCharName('');
    if (fileRef.current) fileRef.current.value = '';
  }

  async function generate() {
    setBusy(true); setError(''); setSpec(null); setReport(null);
    setCharacter(null); setAdjustments([]);
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          prompt,
          image: image ?? undefined,
          hintFur: hintFur || undefined,
          characterName: charName || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Generation failed'); setReport(data.report ?? null); }
      else {
        setSpec(data.spec); setReport(data.report); setOffline(!!data.offline);
        setCharacter(data.character ?? null); setAdjustments(data.adjustments ?? []);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally { setBusy(false); }
  }

  async function publish() {
    if (!spec) return;
    setPublishing(true);
    try {
      const res = await fetch('/api/games', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ spec, prompt }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Publish failed'); setReport(data.report ?? report); }
      else location.href = `/g/${data.slug}`;
    } finally { setPublishing(false); }
  }

  const meta = spec?.meta as { title?: string; tagline?: string; blurb?: string } | undefined;
  const racers = (spec?.racers ?? []) as { name: string; fur: string }[];
  const palette = spec?.palette as { skyHigh?: string; skyLow?: string; terrain?: { moss?: string } } | undefined;

  return (
    <>
      <SiteHeader />
      <main className="wrap" style={{ paddingBottom: 80, maxWidth: 820 }}>
        <h1 className="display" style={{ fontSize: 'clamp(32px,5.4vw,46px)', marginBottom: 8 }}>
          Describe a world.
        </h1>
        <p className="muted" style={{ marginBottom: 26, lineHeight: 1.6 }}>
          Bring a character and describe somewhere to run. The format is a rhythm footrace and the
          controls never change — you are choosing the place, the palette and the cast. Everything
          generated is playtested before you can publish it.
        </p>

        <div className="card" style={{ marginBottom: 16 }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>Your character <span style={{ opacity: .6, letterSpacing: 0, textTransform: 'none', fontWeight: 600 }}>— optional</span></div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); onFile(e.dataTransfer.files?.[0]); }}
              style={{
                width: 108, height: 108, borderRadius: 18, cursor: 'pointer', flex: '0 0 auto',
                border: `2px dashed ${preview ? 'transparent' : 'var(--line)'}`,
                background: preview ? `#fff url(${preview}) center/cover` : 'rgba(201,162,94,.07)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                textAlign: 'center', fontSize: 11, color: 'var(--ink-soft)', lineHeight: 1.4, padding: 8,
              }}
            >
              {preview ? '' : 'Drop a picture, or click'}
            </div>
            <div style={{ flex: '1 1 220px', minWidth: 200 }}>
              <input
                type="text" placeholder="Name them (optional)" value={charName}
                onChange={(e) => setCharName(e.target.value.slice(0, 14))}
                style={{ marginBottom: 8 }}
              />
              {hintFur ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                  <i style={{ width: 22, height: 22, borderRadius: '50%', background: hintFur, border: '2px solid rgba(255,255,255,.9)', boxShadow: '0 2px 5px rgba(0,0,0,.2)' }} />
                  <span className="muted">Read <b>{hintFur}</b> off the body, ignoring the backdrop. The world will move aside rather than let this colour get lost.</span>
                </div>
              ) : (
                <p className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
                  Sets the racer&apos;s colour and name. Without one, the world picks its own cast.
                </p>
              )}
              {preview && (
                <button className="pill" style={{ cursor: 'pointer', marginTop: 8 }} onClick={clearCharacter}>Remove</button>
              )}
            </div>
          </div>
          <input
            ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif"
            style={{ display: 'none' }}
            onChange={(e) => onFile(e.target.files?.[0])}
          />
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <label className="field eyebrow" htmlFor="p">The setting</label>
          <textarea
            id="p" rows={4} value={prompt} placeholder="Somewhere specific. Smells, light, weather, what the ground is made of."
            onChange={(e) => setPrompt(e.target.value)}
          />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '12px 0' }}>
            {EXAMPLES.map((ex) => (
              <button key={ex} className="pill" style={{ cursor: 'pointer', textAlign: 'left', maxWidth: 360 }}
                onClick={() => setPrompt(ex)}>
                {ex.slice(0, 54)}…
              </button>
            ))}
          </div>
          <button className="btn" onClick={generate} disabled={busy || prompt.trim().length < 8}>
            {busy ? <><span className="spin" /> Building…</> : 'Build the world'}
          </button>
        </div>

        {error && (
          <div className="card" style={{ marginBottom: 16, borderColor: 'rgba(208,104,74,.4)' }}>
            <div className="eyebrow" style={{ marginBottom: 8 }}>Didn&apos;t work</div>
            <p style={{ fontSize: 14 }}>{error}</p>
          </div>
        )}

        {report && report.findings.length > 0 && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="eyebrow" style={{ marginBottom: 10 }}>Playtest</div>
            {report.findings.map((f, i) => (
              <div key={i} className={`finding ${f.level}`}>
                <b>{f.level}</b><span>{f.message}</span>
              </div>
            ))}
          </div>
        )}

        {spec && meta && (
          <div className="card">
            {offline && (
              <div className="finding warn" style={{ marginBottom: 14 }}>
                <b>offline</b>
                <span>No <code>ANTHROPIC_API_KEY</code> is set, so this world was generated
                  deterministically rather than designed. It is playable but arbitrary.</span>
              </div>
            )}
            <div
              style={{
                height: 92, borderRadius: 14, marginBottom: 16, display: 'flex',
                alignItems: 'flex-end', gap: 6, padding: 12,
                background: `linear-gradient(160deg, ${palette?.skyHigh}, ${palette?.skyLow} 55%, ${palette?.terrain?.moss})`,
              }}
            >
              {racers.map((r) => (
                <i key={r.name} title={r.name} style={{ width: 22, height: 22, borderRadius: '50%', background: r.fur, border: '2px solid rgba(255,255,255,.85)', boxShadow: '0 2px 5px rgba(0,0,0,.2)' }} />
              ))}
            </div>
            {character && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <i style={{ width: 26, height: 26, borderRadius: '50%', background: character.fur, border: '2.5px solid rgba(255,255,255,.95)', boxShadow: '0 2px 6px rgba(0,0,0,.2)' }} />
                <div style={{ fontSize: 13 }}>
                  <b>{character.name}</b> runs this one
                  {character.personality ? <span className="muted"> — {character.personality}</span> : null}
                </div>
              </div>
            )}
            {adjustments.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                {adjustments.map((a, i) => (
                  <div key={i} className="finding warn"><b>kept</b><span>{a}</span></div>
                ))}
              </div>
            )}
            <h2 className="display" style={{ fontSize: 28 }}>{meta.title}</h2>
            <p className="muted" style={{ marginBottom: 10 }}>{meta.tagline}</p>
            <p style={{ fontSize: 14, lineHeight: 1.65, marginBottom: 14 }}>{meta.blurb}</p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18 }}>
              <span className="pill">{String(spec.difficulty)}</span>
              <span className="pill">{report?.stats.lapMetres}m lap</span>
              <span className="pill">~{report?.stats.estRaceSeconds}s race</span>
              <span className="pill">{racers.length} racers</span>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button className="btn" onClick={publish} disabled={publishing || !report?.ok}>
                {publishing ? <><span className="spin" /> Publishing…</> : 'Publish and get a link'}
              </button>
              <button className="btn ghost" onClick={generate} disabled={busy}>Try again</button>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
