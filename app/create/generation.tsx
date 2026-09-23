'use client';
import { useEffect, useState } from 'react';
import { PlayFrame } from '../g/[slug]/play-frame';

/**
 * Writing a world, shared by Create and Mog: the request, the progress Opus
 * streams back while it writes, the rounds of problems the checks send back,
 * and the playtested draft with its preview and publish button.
 */
export type Draft = {
  draftId: string; attempts: number; ms: number;
  meta: { title: string; tagline: string; blurb: string; genre: string; cast: { name: string; color: string; role?: string }[] };
  runtime: { ran: boolean; readyMs: number | null; fps: number | null; levelReached?: number; advisories?: string[] };
};

const STAGE_TEXT: Record<string, string> = {
  thinking: 'Claude Opus 5.5 is designing the world',
  writing: 'Writing the world',
  checking: 'Reading the code for anything the runtime would refuse',
  playtesting: 'Racing it in a real browser: rivals joining lap after lap, then a crash',
  repairing: 'Sending what the playtest found back to be fixed',
};

export function useGeneration() {
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<{ stage: string; attempt: number; chars: number } | null>(null);
  const [rounds, setRounds] = useState<{ attempt: number; problems: string[] }[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [startedAt, setStartedAt] = useState(0);
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [busy]);

  /** Streams a written world; any other response comes back as JSON for the caller. */
  async function run(body: Record<string, unknown>): Promise<unknown | null> {
    setBusy(true); setError(''); setDraft(null); setRounds([]); setStage(null);
    setStartedAt(Date.now()); setNow(Date.now());
    try {
      const res = await fetch('/api/generate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      if (res.ok && res.body && (res.headers.get('content-type') ?? '').includes('ndjson')) {
        const reader = res.body.getReader(), dec = new TextDecoder();
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
        return null;
      }
      const data = await res.json();
      if (!res.ok) setError(data.error ?? 'Generation failed');
      return data;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally { setBusy(false); }
  }

  async function publish() {
    if (!draft) return;
    setPublishing(true);
    try {
      const res = await fetch('/api/games', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ draftId: draft.draftId }) });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? 'Publish failed');
      else location.href = `/g/${data.slug}`;
    } finally { setPublishing(false); }
  }

  return { busy, stage, rounds, draft, error, setError, publishing, startedAt, now, run, publish };
}
export type Generation = ReturnType<typeof useGeneration>;

export function GenerationProgress({ gen }: { gen: Generation }) {
  const { busy, stage, rounds, draft, error, now, startedAt } = gen;
  return (
    <>
      {busy && (
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
    </>
  );
}

export function DraftResult({ gen, publishLabel, againLabel, onAgain, note }: { gen: Generation; publishLabel: string; againLabel: string; onAgain: () => void; note?: React.ReactNode }) {
  const { draft, publishing, publish, busy } = gen;
  if (!draft) return null;
  return (
    <div className="panel">
      <div style={{ marginBottom: 16 }}>
        <PlayFrame slug={draft.draftId} gameId={`draft-${draft.draftId}`} src={`/d/${draft.draftId}/play`} scores={false}
          // eslint-disable-next-line @next/next/no-img-element
          poster={<img src={`/d/${draft.draftId}/cover`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />} />
      </div>
      <h2>{draft.meta.title}</h2>
      <p className="dim" style={{ marginBottom: 10, fontSize: 16 }}>{draft.meta.tagline}</p>
      <p style={{ fontSize: 16, lineHeight: 1.55, marginBottom: 10 }}>{draft.meta.blurb}</p>
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
          ? `Raced in Chrome: ready in ${((draft.runtime.readyMs ?? 0) / 1000).toFixed(1)}s, ${draft.runtime.fps} fps, ${draft.runtime.levelReached ?? 0} laps of rivals joining with no errors, and a crash ended the run as it should.`
          : 'Chrome was not found on this machine, so this world was only checked statically.'}
        {' '}Written in {Math.round(draft.ms / 60000)} min{draft.attempts > 1 ? `, ${draft.attempts} attempts` : ''}.
      </p>
      {note}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button className="btn" onClick={publish} disabled={publishing}>{publishing ? 'Publishing' : publishLabel}</button>
        <button className="btn outline" onClick={onAgain} disabled={busy}>{againLabel}</button>
      </div>
    </div>
  );
}
