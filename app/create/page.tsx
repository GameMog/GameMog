'use client';
import { useEffect, useRef, useState } from 'react';
import { SiteHeader, SiteFooter, Icon } from '../header';
import { prepareUpload, type CharacterImage } from '@/lib/character';
import { Cover } from '../cover';
import type { WorldSpec } from '@/lib/worldspec';
import { useGeneration, GenerationProgress, DraftResult } from './generation';

type Finding = { level: 'error' | 'warn'; code: string; message: string };
type Report = { ok: boolean; findings: Finding[]; stats: Record<string, number> };

/** Every world plays by the runtime's rules, so an idea only needs the world. */
const GAME_IDEAS = [
  { title: 'Firefly swamp', text: 'Pepe and his frog friends race laps of a firefly swamp at dusk. Mossy logs, lily pads, snapping turtles, a lantern-lit boardwalk.' },
  { title: 'Snowball village', text: 'A snowball rolls laps of a mountain village at night. Snowmen and sleds on the road, warm windows, falling snow.' },
  { title: 'Gutter regatta', text: 'Paper boats race round a rainy city gutter. Floating leaves and bottle caps, drains, neon reflections in the puddles.' },
  { title: 'Breakfast table', text: 'Tiny robots race laps of a breakfast table. Cereal spills, a toast rack, the cat watching from the edge.' },
];

const RACE_IDEAS = [
  { title: 'Drowned cathedral', text: 'A drowned cathedral city at low tide. Barnacled spires, green glass light, lanterns made of jellyfish.' },
  { title: 'Grandfather clock', text: 'The inside of a grandfather clock. Brass gears the size of hills, dust in the light, everything ticking.' },
  { title: 'Whale night market', text: 'A night market on the back of a sleeping whale. Paper lanterns, steam, warm reds against black water.' },
  { title: 'Dying star orchard', text: 'An orchard on a dying star. White grass, long shadows, fruit that glows because nothing else does.' },
];

/**
 * What the Runtime supplies, so an idea never has to: shown after the idea,
 * because a creator comes to describe a world, not to configure an engine.
 */
const RULES = [
  { title: '3D, from behind', text: 'Every world is 3D, seen from behind your character by the chase camera.' },
  { title: 'Endless laps', text: 'There is no finish line. Your level is the lap you are on.' },
  { title: 'A rival every lap', text: 'One rival lines up beside you. Every lap another joins, faster and meaner than the last.' },
  { title: 'Faster every lap', text: 'You, the whole field and the moving obstacles all speed up together.' },
  { title: 'One touch ends it', text: 'Touch a rival or an obstacle and the run is over.' },
  { title: 'Collect the GM', text: 'Golden GM line the track. The leaderboard ranks the lap reached, then GM.' },
  { title: 'Arrows and Space', text: 'Arrow keys steer and change speed, Space pauses, touch buttons on phones.' },
  { title: 'Raced before it publishes', text: 'A bot plays every new world in a real browser before it can go live.' },
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
      <main className="wrap" style={{ paddingBottom: 80 }}>
        <div className="chead">
          <h1>Create a world</h1>
          <p className="secsub">
            Describe a place and Claude Opus 5.5 builds it: the track, the rivals, the obstacles, the
            light and the sound. It goes on the charts, and anyone can Mog it with a better version.
          </p>
        </div>

        <div className="cgrid">
          <section className="panel cidea">
            <label className="lbl" htmlFor="p">Your world</label>
            <textarea
              id="p" rows={6} value={prompt}
              placeholder="Where is the race, who runs it, and what is in the way? Name the place, its light and its obstacles. The more specific, the better."
              onChange={(e) => setPrompt(e.target.value)}
            />
            <div className="cgo">
              <p className="dim-2">You describe the world. The rules below come with it.</p>
              <button className="btn big" onClick={generate} disabled={busy || prompt.trim().length < 8}>
                {busy ? 'Building the world' : 'Build the world'}
              </button>
            </div>
            <p className="lbl" style={{ marginTop: 22 }}>Or start from one of these</p>
            <div className="cideas">
              {(kind === 'game' ? GAME_IDEAS : RACE_IDEAS).map((idea) => (
                <button key={idea.title} className={`cideacard${prompt === idea.text ? ' on' : ''}`} onClick={() => setPrompt(idea.text)}>
                  <b>{idea.title}</b><span>{idea.text}</span>
                </button>
              ))}
            </div>
          </section>

          <aside className="panel cchar">
            <label className="lbl">Your character <span className="opt">(optional)</span></label>
            <div
              className={`cdrop${preview ? ' has' : ''}`}
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); onFile(e.dataTransfer.files?.[0]); }}
              style={preview ? { backgroundImage: `url(${preview})` } : undefined}
              role="button" tabIndex={0} aria-label="Add a picture of your character"
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileRef.current?.click(); } }}
            >
              {!preview && <span><Icon name="plus" size={28} /><b>Drop a picture</b>or click to choose one</span>}
            </div>
            <input
              type="text" placeholder="Name them (optional)" value={charName}
              onChange={(e) => setCharName(e.target.value.slice(0, 14))}
              style={{ marginTop: 12 }} aria-label="Character name"
            />
            {hintFur ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, lineHeight: 1.5, marginTop: 10 }}>
                <i style={{ width: 22, height: 22, borderRadius: 4, background: hintFur, border: '1px solid var(--line)', flex: '0 0 auto' }} />
                <span className="dim">Read <b>{hintFur}</b> off the body, ignoring the backdrop. The world will move aside rather than let this colour get lost.</span>
              </div>
            ) : (
              <p className="dim" style={{ fontSize: 13, lineHeight: 1.5, marginTop: 10 }}>
                The model builds your character from this picture. Without one, it designs its own.
              </p>
            )}
            {preview && (
              <button className="tag" style={{ marginTop: 10 }} onClick={clearCharacter}>Remove</button>
            )}
            <input
              ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif"
              style={{ display: 'none' }}
              onChange={(e) => onFile(e.target.files?.[0])}
            />
          </aside>
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

        <section className="sec">
          <div className="sechead">
            <div className="sectext">
              <h2 className="sectitle">How every world plays</h2>
              <p className="secsub">The GameMog Runtime supplies the rules, so every world is fair to race and fair to Mog.</p>
            </div>
          </div>
          <ol className="crules">
            {RULES.map((r, i) => (
              <li key={r.title}>
                <span className="n">{String(i + 1).padStart(2, '0')}</span>
                <b>{r.title}</b>
                <span>{r.text}</span>
              </li>
            ))}
          </ol>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
