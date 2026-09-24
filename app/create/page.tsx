'use client';
import { useEffect, useRef, useState } from 'react';
import { SiteHeader, SiteFooter } from '../header';
import { prepareUpload, type CharacterImage } from '@/lib/character';
import { Cover } from '../cover';
import type { WorldSpec } from '@/lib/worldspec';
import { useGeneration, GenerationProgress, DraftResult } from './generation';

type Finding = { level: 'error' | 'warn'; code: string; message: string };
type Report = { ok: boolean; findings: Finding[]; stats: Record<string, number> };

/** Every world plays by the runtime's rules, so a prompt only needs the world. */
const GAME_EXAMPLES = [
  'Pepe and his frog friends race laps of a firefly swamp at dusk. Mossy logs, lily pads, snapping turtles, a lantern-lit boardwalk.',
  'A snowball rolls laps of a mountain village at night. Snowmen and sleds on the road, warm windows, falling snow.',
  'Paper boats race round a rainy city gutter. Floating leaves and bottle caps, drains, neon reflections in the puddles.',
  'Tiny robots race laps of a breakfast table. Cereal spills, a toast rack, the cat watching from the edge.',
];

const EXAMPLES = [
  'A drowned cathedral city at low tide. Barnacled spires, green glass light, lanterns made of jellyfish.',
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
  const gen = useGeneration();
  const { busy, error, setError, draft } = gen;
  const [spec, setSpec] = useState<Record<string, unknown> | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [offline, setOffline] = useState(false);
  const [publishing, setPublishing] = useState(false);
  // 'game': Opus writes the whole game. 'race': the tuned rhythm-race template.
  // every future game is a world on the runtime; the race template remains for
  // the worlds already built on it and for running without an API key
  const kind = 'game' as 'game' | 'race';

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
    setSpec(null); setReport(null); setCharacter(null); setAdjustments([]);
    const data = await gen.run({
      kind,
      prompt: kind === 'game' && charName ? `${prompt}\n\nThe player's character is called ${charName}.` : prompt,
      image: image ?? undefined,
      hintFur: hintFur || undefined,
      characterName: charName || undefined,
    }) as { spec?: Record<string, unknown>; report?: Report; offline?: boolean; character?: Character; adjustments?: string[] } | null;
    if (!data) return;
    if (data.spec) {
      setSpec(data.spec); setReport(data.report ?? null); setOffline(!!data.offline);
      setCharacter(data.character ?? null); setAdjustments(data.adjustments ?? []);
    } else if (data.report) setReport(data.report);
  }

  // the race template's spec publishes here; a written world publishes from its draft
  async function publish() {
    if (!spec) return;
    setPublishing(true);
    try {
      const res = await fetch('/api/games', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ spec, prompt }) });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Publish failed'); setReport(data.report ?? report); }
      else location.href = `/g/${data.slug}`;
    } finally { setPublishing(false); }
  }

  const meta = spec?.meta as { title?: string; tagline?: string; blurb?: string } | undefined;
  const racers = (spec?.racers ?? []) as { name: string; fur: string }[];

  return (
    <>
      <SiteHeader on="Create" />
      <main className="wrap" style={{ paddingBottom: 80, maxWidth: 820 }}>
        <h1 style={{ marginTop: 24, marginBottom: 6 }}>Create a world</h1>
        <p className="dim" style={{ marginBottom: 16, lineHeight: 1.55, maxWidth: '64ch' }}>
          Describe a world and Claude Opus 5.5 builds it: the place, the track, your character, every
          rival, the obstacles, the light and the sound. Every GameMog world plays by the same rules,
          so you only have to describe the world.
        </p>
        <div className="panel" style={{ marginBottom: 16 }}>
          <label className="lbl">The rules every world plays by</label>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.6, color: 'var(--ink-2)' }}>
            <li>Every world is 3D, seen from behind your character by the chase camera.</li>
            <li>Endless laps. Your level is the lap you are on.</li>
            <li>One rival lines up beside you. Every lap another joins at the line, faster and meaner than the last.</li>
            <li>Every lap everyone runs faster: you, the whole field and the moving obstacles.</li>
            <li>Touch a rival or an obstacle and the run is over.</li>
            <li>Collect the golden GM along the way.</li>
            <li>Arrow keys steer and change speed, Space pauses, touch buttons on phones.</li>
          </ul>
        </div>

        <div className="panel" style={{ marginBottom: 16 }}>
          <label className="lbl">Your character <span style={{ opacity: .65, fontWeight: 500 }}>(optional)</span></label>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); onFile(e.dataTransfer.files?.[0]); }}
              style={{
                width: 110, height: 110, borderRadius: 8, cursor: 'pointer', flex: '0 0 auto',
                border: preview ? '1px solid var(--line)' : '1px dashed var(--ink-3)',
                background: preview ? `#fff url(${preview}) center/cover` : 'var(--fill)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                textAlign: 'center', fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.4, padding: 8,
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, lineHeight: 1.5 }}>
                  <i style={{ width: 22, height: 22, borderRadius: 4, background: hintFur, border: '1px solid var(--line)' }} />
                  <span className="dim">Read <b>{hintFur}</b> off the body, ignoring the backdrop. The world will move aside rather than let this colour get lost.</span>
                </div>
              ) : (
                <p className="dim" style={{ fontSize: 12, lineHeight: 1.5 }}>
                  The model builds your character from this picture. Without one, it designs its own.
                </p>
              )}
              {preview && (
                <button className="tag" style={{ marginTop: 8 }} onClick={clearCharacter}>Remove</button>
              )}
            </div>
          </div>
          <input
            ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif"
            style={{ display: 'none' }}
            onChange={(e) => onFile(e.target.files?.[0])}
          />
        </div>

        <div className="panel" style={{ marginBottom: 16 }}>
          <label className="lbl" htmlFor="p">The world</label>
          <textarea
            id="p" rows={kind === 'game' ? 6 : 4} value={prompt}
            placeholder={'Who you play, who you race, and where: the place, its light, what the obstacles are. The more specific, the better.'}
            onChange={(e) => setPrompt(e.target.value)}
          />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '12px 0' }}>
            {(kind === 'game' ? GAME_EXAMPLES : EXAMPLES).map((ex) => (
              <button key={ex} className="tag multi" style={{ maxWidth: 340 }}
                onClick={() => setPrompt(ex)}>
                {ex.slice(0, 44)}...
              </button>
            ))}
          </div>
          <button className="btn" onClick={generate} disabled={busy || prompt.trim().length < 8}>
            {busy ? 'Building the world' : 'Build the world'}
          </button>
        </div>

        <GenerationProgress gen={gen} />

        {report && report.findings.length > 0 && (
          <div className="panel" style={{ marginBottom: 16 }}>
            <label className="lbl">Playtest</label>
            {report.findings.map((f, i) => (
              <div key={i} className={`msg ${f.level}`}>
                <b>{f.level}</b><span>{f.message}</span>
              </div>
            ))}
          </div>
        )}

        <DraftResult gen={gen} publishLabel="Publish and get a link" againLabel="Make another" onAgain={generate} />

        {spec && meta && (
          <div className="panel">
            {offline && (
              <div className="msg warn" style={{ marginBottom: 14 }}>
                <b>offline</b>
                <span>No <code>ANTHROPIC_API_KEY</code> is set, so this world was generated
                  deterministically rather than designed. It is playable but arbitrary.</span>
              </div>
            )}
            <div style={{ borderRadius: 8, overflow: 'hidden', marginBottom: 16, width: 300 }}>
              <Cover spec={spec as unknown as WorldSpec} seed={7} />
            </div>
            {character && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <i style={{ width: 24, height: 24, borderRadius: 4, background: character.fur, border: '1px solid var(--line)' }} />
                <div style={{ fontSize: 14 }}>
                  <b>{character.name}</b> runs this one
                  {character.personality ? <span className="dim">. {character.personality}</span> : null}
                </div>
              </div>
            )}
            {adjustments.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                {adjustments.map((a, i) => (
                  <div key={i} className="msg info"><b>kept</b><span>{a}</span></div>
                ))}
              </div>
            )}
            <h2>{meta.title}</h2>
            <p className="dim" style={{ marginBottom: 10, fontSize: 16 }}>{meta.tagline}</p>
            <p style={{ fontSize: 16, lineHeight: 1.55, marginBottom: 14 }}>{meta.blurb}</p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18 }}>
              <span className="tag">{String(spec.difficulty)}</span>
              <span className="tag">{report?.stats.lapMetres}m lap</span>
              <span className="tag">about {report?.stats.estRaceSeconds}s race</span>
              <span className="tag">{racers.length} racers</span>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button className="btn" onClick={publish} disabled={publishing || !report?.ok}>
                {publishing ? 'Publishing' : 'Publish and get a link'}
              </button>
              <button className="btn outline" onClick={generate} disabled={busy}>Try again</button>
            </div>
          </div>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
