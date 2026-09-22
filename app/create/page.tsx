'use client';
import { useEffect, useRef, useState } from 'react';
import { SiteHeader, SiteFooter } from '../header';
import { prepareUpload, type CharacterImage } from '@/lib/character';
import { Cover } from '../cover';
import { PlayFrame } from '../g/[slug]/play-frame';
import type { WorldSpec } from '@/lib/worldspec';

type Finding = { level: 'error' | 'warn'; code: string; message: string };
type Report = { ok: boolean; findings: Finding[]; stats: Record<string, number> };

/** For games Opus writes: say what you do, not only where you are. */
const GAME_EXAMPLES = [
  'A frog races three rivals through a firefly swamp at dusk. He runs forward on his own; arrow keys steer and hop over logs. Collect coins, dodge snapping turtles.',
  'A snowball rolls down through a mountain village, growing as it goes. Left and right to steer, space to jump fences. Knock over snowmen for points.',
  'A paper boat drifts down a rainy city gutter at night. Arrow keys to steer, dodge leaves and drains, collect glowing bottle caps before the storm drain.',
  'Three tiny robots race around a breakfast table. WASD to drive, space to boost, avoid the spilled cereal and the cat.',
];

const EXAMPLES = [
  'A drowned cathedral city at low tide. Barnacled spires, green glass light, lanterns made of jellyfish.',
  'The inside of a grandfather clock. Brass gears the size of hills, dust in the light, everything ticking.',
  'A night market on the back of a sleeping whale. Paper lanterns, steam, warm reds against black water.',
  'An orchard on a dying star. White grass, long shadows, fruit that glows because nothing else does.',
];

type Character = { name: string; fur: string; personality?: string; source?: string };
type Draft = {
  draftId: string; attempts: number; ms: number;
  meta: { title: string; tagline: string; blurb: string; genre: string; controls: string; cast: { name: string; color: string; role?: string }[] };
  runtime: { ran: boolean; readyMs: number | null; fps: number | null };
};

const STAGE_TEXT: Record<string, string> = {
  thinking: 'Claude Opus 5.5 is planning the game',
  writing: 'Writing the game',
  checking: 'Reading the code for anything the sandbox would block',
  playtesting: 'Playing it in a real browser: booting, pressing keys, watching the screen',
  repairing: 'Sending what the playtest found back to be fixed',
};

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
  // 'game': Opus writes the whole game. 'race': the tuned rhythm-race template.
  const [kind, setKind] = useState<'game' | 'race'>('game');
  const [stage, setStage] = useState<{ stage: string; attempt: number; chars: number } | null>(null);
  const [rounds, setRounds] = useState<{ attempt: number; problems: string[] }[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [startedAt, setStartedAt] = useState(0);
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [busy]);

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
    setCharacter(null); setAdjustments([]); setDraft(null); setRounds([]); setStage(null);
    setStartedAt(Date.now()); setNow(Date.now());
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind,
          prompt: kind === 'game' && charName ? `${prompt}\n\nThe player's character is called ${charName}.` : prompt,
          image: image ?? undefined,
          hintFur: hintFur || undefined,
          characterName: charName || undefined,
        }),
      });

      // a written game streams its progress as one JSON event per line
      if (res.ok && res.body && (res.headers.get('content-type') ?? '').includes('ndjson')) {
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let nl;
          while ((nl = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
            if (!line.trim()) continue;
            const e = JSON.parse(line);
            if (e.type === 'stage') setStage((s) => ({ stage: e.stage, attempt: e.attempt, chars: e.stage === 'writing' ? s?.chars ?? 0 : 0 }));
            else if (e.type === 'progress') setStage((s) => (s ? { ...s, chars: e.chars } : s));
            else if (e.type === 'problems') setRounds((r) => [...r, { attempt: e.attempt, problems: e.problems }]);
            else if (e.type === 'done') setDraft(e);
            else if (e.type === 'error') {
              setError(e.error);
              if (e.problems?.length) setRounds((r) => [...r, { attempt: 0, problems: e.problems }]);
            }
          }
        }
        return;
      }

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
    if (!spec && !draft) return;
    setPublishing(true);
    try {
      const res = await fetch('/api/games', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(draft ? { draftId: draft.draftId } : { spec, prompt }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Publish failed'); setReport(data.report ?? report); }
      else location.href = `/g/${data.slug}`;
    } finally { setPublishing(false); }
  }

  const meta = spec?.meta as { title?: string; tagline?: string; blurb?: string } | undefined;
  const racers = (spec?.racers ?? []) as { name: string; fur: string }[];

  return (
    <>
      <SiteHeader />
      <main className="wrap" style={{ paddingBottom: 80, maxWidth: 820 }}>
        <h1 style={{ marginTop: 24, marginBottom: 6 }}>Create a world</h1>
        <p className="dim" style={{ marginBottom: 16, lineHeight: 1.55, maxWidth: '64ch' }}>
          {kind === 'game'
            ? 'Describe the game and Claude Opus 5.5 writes all of it: the world, the characters, the controls and the rules. Every game is played in a real browser before you can publish it. It takes a few minutes.'
            : 'The tuned rhythm footrace. You choose the place, the palette and the cast; the controls and the difficulty ladder are fixed. Takes under a minute.'}
        </p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 18 }} role="radiogroup" aria-label="What to make">
          <button role="radio" aria-checked={kind === 'game'} className={`pill${kind === 'game' ? '' : ' off'}`} onClick={() => setKind('game')}>Any game</button>
          <button role="radio" aria-checked={kind === 'race'} className={`pill${kind === 'race' ? '' : ' off'}`} onClick={() => setKind('race')}>Rhythm race template</button>
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
                  {kind === 'game'
                    ? 'The model builds your character from this picture. Without one, it designs its own.'
                    : "Sets the racer's colour and name. Without one, the world picks its own cast."}
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
          <label className="lbl" htmlFor="p">{kind === 'game' ? 'The game' : 'The setting'}</label>
          <textarea
            id="p" rows={kind === 'game' ? 6 : 4} value={prompt}
            placeholder={kind === 'game'
              ? 'Who you play, where, what you do, and the controls. The more specific, the better.'
              : 'Somewhere specific. Smells, light, weather, what the ground is made of.'}
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
            {busy ? (kind === 'game' ? 'Making the game' : 'Building the world') : (kind === 'game' ? 'Make the game' : 'Build the world')}
          </button>
        </div>

        {busy && kind === 'game' && (
          <div className="panel" style={{ marginBottom: 16 }} role="status" aria-live="polite">
            <label className="lbl">Progress</label>
            <p style={{ fontSize: 16, fontWeight: 500 }}>
              {STAGE_TEXT[stage?.stage ?? 'thinking']}
              {stage?.stage === 'writing' && stage.chars > 0 ? `: ${Math.round(stage.chars / 1000)}k characters so far` : ''}
            </p>
            <p className="t-meta dim" style={{ marginTop: 4 }}>
              {Math.floor((now - startedAt) / 60000)}m {String(Math.floor(((now - startedAt) / 1000) % 60)).padStart(2, '0')}s
              {stage && stage.attempt > 1 ? `, attempt ${stage.attempt} of 3` : ''}
            </p>
          </div>
        )}

        {rounds.length > 0 && (
          <div className="panel" style={{ marginBottom: 16 }}>
            <label className="lbl">What the checks found</label>
            {rounds.map((r, i) => (
              <div key={i} style={{ marginBottom: 8 }}>
                <p className="t-meta dim">{r.attempt ? `After attempt ${r.attempt}${draft || busy ? ', sent back to be fixed' : ''}` : 'Still unresolved'}</p>
                {r.problems.map((p, j) => <div key={j} className="msg warn"><b>fix</b><span>{p}</span></div>)}
              </div>
            ))}
          </div>
        )}

        {busy && (
          <div className="panel sk-card" aria-hidden>
            <div className="art" />
            <div className="h" />
            <div className="p" style={{ width: '92%' }} />
            <div className="p" style={{ width: '78%' }} />
            <div className="p" style={{ width: '40%' }} />
          </div>
        )}

        {error && (
          <div className="msg error" style={{ marginBottom: 16, padding: '13px 15px' }}>
            <b>error</b><span>{error}</span>
          </div>
        )}

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

        {draft && (
          <div className="panel">
            <div style={{ marginBottom: 16 }}>
              <PlayFrame slug={draft.draftId} gameId={`draft-${draft.draftId}`} src={`/d/${draft.draftId}/play`} scores={false}
                // eslint-disable-next-line @next/next/no-img-element
                poster={<img src={`/d/${draft.draftId}/cover`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />} />
            </div>
            <h2>{draft.meta.title}</h2>
            <p className="dim" style={{ marginBottom: 10, fontSize: 16 }}>{draft.meta.tagline}</p>
            <p style={{ fontSize: 16, lineHeight: 1.55, marginBottom: 10 }}>{draft.meta.blurb}</p>
            <p style={{ fontSize: 14, marginBottom: 12 }}><b>Controls.</b> {draft.meta.controls}</p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
              <span className="tag">{draft.meta.genre}</span>
              {draft.meta.cast.map((c) => (
                <span key={c.name} className="tag" style={{ gap: 5 }}>
                  <i style={{ width: 10, height: 10, borderRadius: 2, background: c.color }} />{c.name}
                </span>
              ))}
            </div>
            <p className="t-meta dim" style={{ marginBottom: 16 }}>
              {draft.runtime.ran
                ? `Played in Chrome: ready in ${((draft.runtime.readyMs ?? 0) / 1000).toFixed(1)}s, ${draft.runtime.fps} fps, no errors.`
                : 'Chrome was not found on this machine, so this game was only checked statically.'}
              {' '}Written in {Math.round(draft.ms / 60000)} min{draft.attempts > 1 ? `, ${draft.attempts} attempts` : ''}.
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button className="btn" onClick={publish} disabled={publishing}>
                {publishing ? 'Publishing' : 'Publish and get a link'}
              </button>
              <button className="btn outline" onClick={generate} disabled={busy}>Make another</button>
            </div>
          </div>
        )}

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
