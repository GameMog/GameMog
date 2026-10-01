'use client';
import { useEffect, useRef, useState } from 'react';
import { PlayFrame } from '../g/[slug]/play-frame';

/**
 * Writing a world, shared by Create and Mog: the request and the events the
 * builder streams back while it works (useGeneration, the plumbing), and what
 * the creator sees meanwhile: a show that follows the build stage by stage,
 * with a track that draws itself as the world is written and racers that lap
 * it during the test drive, a progress bar with an honest time estimate, and
 * plain words for anything that needs another pass. The builder is never
 * named: to the creator it is GameMog.
 */
export type Draft = {
  draftId: string; attempts: number; ms: number;
  meta: { title: string; tagline: string; blurb: string; genre: string; cast: { name: string; color: string; role?: string }[] };
  runtime: { ran: boolean; readyMs: number | null; fps: number | null; levelReached?: number; advisories?: string[] };
};

export function useGeneration() {
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<{ stage: string; attempt: number; chars: number } | null>(null);
  const [rounds, setRounds] = useState<{ attempt: number; problems: string[] }[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState('');
  const [publishing, setPublishing] = useState(false);
  // a draft the builder wants this page to test-drive (lib/test-drive.ts)
  const [drive, setDrive] = useState<{ draftId: string; token: string; attempt: number } | null>(null);
  const [startedAt, setStartedAt] = useState(0);
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [busy]);

  /** Streams a written world; any other response comes back as JSON for the caller. */
  async function run(body: Record<string, unknown>): Promise<unknown | null> {
    setBusy(true); setError(''); setDraft(null); setRounds([]); setStage(null); setDrive(null);
    setStartedAt(Date.now()); setNow(Date.now());
    try {
      const res = await fetch('/api/generate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      if (res.ok && res.body && (res.headers.get('content-type') ?? '').includes('ndjson')) {
        const reader = res.body.getReader(), dec = new TextDecoder();
        let buf = '', ended = false;
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
            else if (e.type === 'drive') setDrive({ draftId: e.draftId, token: e.token, attempt: e.attempt });
            else if (e.type === 'done') { ended = true; setDraft(e); }
            else if (e.type === 'error') {
              ended = true;
              setError(e.error);
              if (e.problems?.length) setRounds((r) => [...r, { attempt: 0, problems: e.problems }]);
            }
          }
        }
        // the stream closed with neither a world nor an error: the server went
        // away mid-build (a deploy restarts it), so say so rather than vanish
        if (!ended) setError('The connection was terminated before the world was finished.');
        return null;
      }
      const data = await res.json();
      if (!res.ok) setError(data.error ?? 'Generation failed');
      return data;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally { setBusy(false); setDrive(null); }
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

  return { busy, stage, rounds, draft, error, setError, publishing, startedAt, now, run, publish, drive, endDrive: () => setDrive(null) };
}
export type Generation = ReturnType<typeof useGeneration>;

type Mode = 'create' | 'mog';
type StageKey = 'thinking' | 'writing' | 'checking' | 'playtesting' | 'repairing';

/** What each stage is called, and what is going on in it, in the creator's words. */
const STAGES: Record<StageKey, { title: string; mogTitle: string; lines: string[]; mogLines: string[] }> = {
  thinking: {
    title: 'Dreaming it up', mogTitle: 'Studying the original',
    lines: ['Picking the place, the light and the weather', 'Casting your rivals and their colours', 'Deciding what gets in the way', 'Sketching the shape of the track', 'Choosing the sounds of the place'],
    mogLines: ['Taking the original apart, piece by piece', 'Working your idea in', 'Keeping what makes it fun to race', 'Deciding what changes and what stays'],
  },
  writing: {
    title: 'Building your world', mogTitle: 'Building your Mog',
    lines: ['Laying the track', 'Raising the scenery', 'Placing the obstacles', 'Scattering the GM coins', 'Lighting the sky', 'Dressing the rivals', 'Tuning the sound'],
    mogLines: ['Rebuilding the track your way', 'Swapping in the new scenery', 'Moving the obstacles', 'Restyling the rivals', 'Relighting the world'],
  },
  checking: {
    title: 'Safety check', mogTitle: 'Safety check',
    lines: ['Making sure it plays by GameMog\'s rules', 'Checking every piece fits'],
    mogLines: ['Making sure it plays by GameMog\'s rules', 'Checking every piece fits'],
  },
  playtesting: {
    title: 'Test drive', mogTitle: 'Test drive',
    lines: ['A test driver is racing it in a real browser', 'Rivals are joining, lap after lap', 'Checking it runs smoothly', 'Crashing on purpose, to be sure a crash ends the run'],
    mogLines: ['A test driver is racing your Mog in a real browser', 'Rivals are joining, lap after lap', 'Checking it runs smoothly', 'Crashing on purpose, to be sure a crash ends the run'],
  },
  repairing: {
    title: 'Polishing', mogTitle: 'Polishing',
    lines: ['The test drive spotted a few things', 'Tidying them up for you', 'A second pass, so it comes out right'],
    mogLines: ['The test drive spotted a few things', 'Tidying them up for you', 'A second pass, so it comes out right'],
  },
};

/** Things worth knowing while you wait. */
const TIPS = [
  'Every lap, a new rival joins, a little faster and meaner than the last.',
  'Once your world is live, anyone can Mog it with a better version.',
  'Players who have played both games pick the better Mog.',
  'Golden GM coins line the track and are laid again every lap.',
  'The leaderboard ranks the lap you reach, then the GM you collect.',
  'Arrow keys steer and change speed. Space pauses.',
  'Before anything goes live, a test driver races it in a real browser.',
  'Touch a rival or an obstacle and the run is over, so pick your line.',
];

/**
 * How far along a pass is (0 to 1) and roughly how many seconds are left,
 * from the stage, how long it has been running and how much has been written.
 * The times are what builds have taken so far: a first pass is usually 10 to
 * 15 minutes, most of it writing a world of about 60,000 characters.
 */
const EXPECT = { thinking: 180, writing: 600, checking: 8, playtesting: 70, repairing: 150 };
const TARGET_CHARS = 60000;
function ease(x: number) { return 1 - Math.exp(-Math.max(0, x) * 1.6); }
function passProgress(stage: StageKey, t: number, chars: number): { p: number; left: number } {
  const after = EXPECT.checking + EXPECT.playtesting;
  if (stage === 'thinking' || stage === 'repairing') {
    const e = EXPECT[stage];
    return { p: 0.14 * ease(t / e), left: Math.max(25, e - t) + EXPECT.writing + after };
  }
  if (stage === 'writing') {
    const f = Math.min(0.98, chars / TARGET_CHARS);
    const rate = t > 20 && chars > 3000 ? chars / t : TARGET_CHARS / EXPECT.writing;
    return { p: 0.15 + 0.7 * f, left: Math.max(15, (TARGET_CHARS - chars) / Math.max(rate, 30)) + after };
  }
  if (stage === 'checking') return { p: 0.86, left: after };
  return { p: 0.88 + 0.1 * Math.min(1, t / EXPECT.playtesting), left: Math.max(8, EXPECT.playtesting - t) };
}

function clock(ms: number) { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
function leftText(sec: number) {
  if (sec < 45) return 'Almost there';
  const m = Math.round(sec / 60);
  return m <= 1 ? 'About a minute left' : `About ${m} minutes left`;
}

/** What a check found, in a sentence a player would use. */
function friendlyFix(problem: string) {
  const p = problem.toLowerCase();
  if (/corridor|scenery|hidden so they cannot|block the camera|overhead/.test(p)) return 'Moving scenery out of the racers\' way';
  if (/obstacle/.test(p)) return 'Spacing the obstacles so there is always a way through';
  if (/fps|frame|draw call|triangle|slow|performance/.test(p)) return 'Making it run smoothly';
  if (/light/.test(p)) return 'Fixing the lighting';
  if (/rival|player\(|opponent/.test(p)) return 'Getting the racers set up properly';
  if (/coin|\bgm\b/.test(p)) return 'Sorting out the GM coins';
  if (/camera/.test(p)) return 'Clearing the camera\'s view';
  if (/track|lap|loop|points/.test(p)) return 'Smoothing out the track';
  if (/threw|error|exception|undefined|not a function|syntax|refus|crash/.test(p)) return 'Fixing a bug the test drive ran into';
  return 'Polishing a few details';
}
/** Technical notes for the curious, without naming the builder behind GameMog. */
function scrub(text: string) {
  const out = text.replace(/ANTHROPIC_[A-Z_]+/g, 'the builder\'s key')
    .replace(/\b(?:the\s+)?(?:anthropic(?:\s+api)?|claude[\w.-]*(?:\s+opus)?(?:\s+[\d.]+)?|opus(?:\s+[\d.]+)?)\b/gi, 'the world builder');
  return out.charAt(0).toUpperCase() + out.slice(1);
}
function friendlyError(e: string) {
  if (/rate limit|overload|529|capacity|busy/i.test(e)) return 'The world builder is very busy right now. Give it a minute, then try again.';
  if (/key|authentication|unauthori[sz]ed|401|403|needs the model/i.test(e)) return 'The world builder isn\'t connected right now, so nothing could be built.';
  if (/network|failed to fetch|load failed|aborted|terminated/i.test(e)) return 'The connection dropped while your world was being built. Please try again.';
  return 'This one didn\'t come together. Your idea is still here, so try again, or change a detail.';
}

/** Ticks with the display, for the drawing; stops when nothing is being built. */
function useFrameTime(on: boolean) {
  const [t, setT] = useState(0);
  useEffect(() => {
    if (!on) return;
    let raf = 0; const t0 = performance.now();
    const step = () => { setT((performance.now() - t0) / 1000); raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [on]);
  return t;
}

/**
 * The track the show draws: a winding loop that lays itself down as the world
 * is written, with obstacles and coins appearing on the built part, a scanner
 * running round it during the safety check, and racers lapping it during the
 * test drive.
 */
const LOOP = 'M 90 150 C 40 150 30 70 95 58 C 170 44 205 108 270 104 C 340 100 350 34 430 38 C 520 42 580 70 560 118 C 540 164 470 142 400 150 C 320 160 300 186 210 178 C 160 174 135 150 90 150 Z';
const RACERS = ['#F5B82E', '#E0454F', '#2FA36B', '#FF8A3D', '#4F7BFF'];
function TrackArt({ stage, built, t }: { stage: StageKey | 'done'; built: number; t: number }) {
  const ref = useRef<SVGPathElement>(null);
  const [len, setLen] = useState(0);
  useEffect(() => { if (ref.current) setLen(ref.current.getTotalLength()); }, []);
  const at = (f: number) => (ref.current && len ? ref.current.getPointAtLength(((f % 1) + 1) % 1 * len) : { x: 0, y: 0 });
  const marks = Array.from({ length: 14 }, (_, i) => (i + 0.5) / 14);
  const coins = Array.from({ length: 22 }, (_, i) => (i + 0.25) / 22);
  const racing = stage === 'playtesting' || stage === 'done';
  return (
    <svg className="bs-art" viewBox="0 0 600 220" role="img" aria-label="Your world's track being built">
      <path d={LOOP} fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="16" strokeLinejoin="round" />
      <path d={LOOP} fill="none" stroke="rgba(255,255,255,.25)" strokeWidth="1.5" strokeDasharray="2 9" />
      <path ref={ref} d={LOOP} fill="none" stroke="#FFFFFF" strokeWidth="16" strokeLinejoin="round" strokeLinecap="round"
        strokeDasharray={len ? `${len * built} ${len}` : '0 1'} opacity={built < 0.005 ? 0 : stage === 'repairing' ? 0.55 : 0.92} />
      {len > 0 && marks.map((f) => {
        if (f > built) return null;
        const p = at(f);
        return <rect key={`m${f}`} x={p.x - 4} y={p.y - 4} width="8" height="8" rx="1.5" fill="#E0454F" transform={`rotate(45 ${p.x} ${p.y})`} />;
      })}
      {len > 0 && !racing && coins.map((f) => {
        if (f > built) return null;
        const p = at(f + 0.012);
        return <circle key={`c${f}`} cx={p.x} cy={p.y} r="3.2" fill="#F5B82E" />;
      })}
      {len > 0 && stage === 'checking' && (() => {
        const f = (t * 0.45) % 1, pts = [0, 0.02, 0.04, 0.06].map((d) => at(f - d));
        return pts.map((p, i) => <circle key={`s${i}`} cx={p.x} cy={p.y} r={9 - i * 2} fill="#4F7BFF" opacity={0.9 - i * 0.2} />);
      })()}
      {len > 0 && (stage === 'thinking' || stage === 'repairing') && (() => {
        const p = at(t * 0.08);
        return <circle cx={p.x} cy={p.y} r="6" fill="#F5B82E" />;
      })()}
      {len > 0 && racing && RACERS.map((c, i) => {
        const p = at(t * (0.11 + i * 0.012) + i * 0.07);
        return <circle key={c} cx={p.x} cy={p.y} r={i === 4 ? 6.5 : 5.5} fill={c} stroke="#0B0B0F" strokeWidth="1.5" />;
      })}
    </svg>
  );
}

/**
 * The test drive, played here (the owner, 30 Sep): the draft at 1280x720,
 * scaled to the show, driven by its own autopilot (lib/runtime/drive.js).
 * What it measured goes to the builder; a drive that never reports is let go.
 */
function TestDrive({ drive, onDone }: { drive: { draftId: string; token: string; attempt: number }; onDone: () => void }) {
  const box = useRef<HTMLDivElement>(null), frame = useRef<HTMLIFrameElement>(null);
  const [scale, setScale] = useState(0.5);
  // the show re-renders every frame; the drive's listener and its time-out must not
  const done = useRef(onDone); done.current = onDone;
  useEffect(() => {
    const el = box.current; if (!el) return;
    const fit = () => setScale(el.clientWidth / 1280);
    fit();
    const ro = new ResizeObserver(fit); ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    let sent = false;
    const send = (payload: Record<string, unknown>) => {
      if (sent) return; sent = true;
      fetch('/api/generate/drive', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ draftId: drive.draftId, token: drive.token, ...payload }) })
        .catch(() => {}).finally(() => done.current());
    };
    const onMsg = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow) return;
      const d = e.data as { gm?: string; type?: string; raw?: unknown; cover?: unknown; artIcon?: unknown; artWide?: unknown };
      if (d?.gm !== 'drive' || d.type !== 'report') return;
      send({ raw: d.raw, cover: d.cover, artIcon: d.artIcon, artWide: d.artWide });
    };
    window.addEventListener('message', onMsg);
    const t = setTimeout(() => send({ raw: { timedOut: true } }), 200_000);
    return () => { window.removeEventListener('message', onMsg); clearTimeout(t); };
  }, [drive.draftId, drive.token]);
  return (
    <div className="bs-drive" ref={box} style={{ height: 720 * scale }}>
      <iframe ref={frame} src={`/d/${drive.draftId}/play?drive=1`} sandbox="allow-scripts" title="Test drive"
        width={1280} height={720} tabIndex={-1} style={{ transform: `scale(${scale})` }} />
      <span className="bs-drivetag">Live test drive</span>
    </div>
  );
}

/**
 * The show while a world or a Mog is built: what it is, where it has got to,
 * how long is left, and a track drawing itself as it happens.
 */
function BuildShow({ gen, mode, subject }: { gen: Generation; mode: Mode; subject?: string }) {
  const { stage, rounds, now, startedAt } = gen;
  const key = (stage?.stage ?? 'thinking') as StageKey;
  const attempt = stage?.attempt ?? 1;
  // when this stage began, measured here: the builder only says which stage it is in
  const since = useRef({ key: '', at: 0 });
  const tag = `${key}:${attempt}`;
  if (since.current.key !== tag) since.current = { key: tag, at: Date.now() };
  const tStage = Math.max(0, (now || Date.now()) - since.current.at) / 1000;
  const t = useFrameTime(true);
  const { p, left } = passProgress(key, tStage, stage?.chars ?? 0);
  const polishing = attempt > 1;
  // a polish pass is a whole new pass: the bar shows the build, then each polish, as its own segment
  const segments = polishing ? attempt : 1;
  const overall = polishing ? ((attempt - 1) + p) / segments : p;
  // how much of the track is drawn: none while dreaming, the written share while building, all of it after
  const built = key === 'thinking' ? 0 : key === 'writing' ? Math.min(1, (stage?.chars ?? 0) / TARGET_CHARS) : 1;
  const info = STAGES[key];
  const lines = mode === 'mog' ? info.mogLines : info.lines;
  const line = lines[Math.floor(t / 7) % lines.length];
  const tip = TIPS[Math.floor(t / 11) % TIPS.length];
  const fixes = [...new Set(rounds.flatMap((r) => r.problems.map(friendlyFix)))];
  const steps: { key: StageKey | 'polish'; label: string }[] = [
    { key: 'thinking', label: mode === 'mog' ? 'Study' : 'Imagine' }, { key: 'writing', label: 'Build' },
    { key: 'checking', label: 'Check' }, { key: 'playtesting', label: 'Test drive' },
  ];
  if (polishing) steps.push({ key: 'polish', label: 'Polish' });
  const order: (StageKey | 'polish')[] = ['thinking', 'writing', 'checking', 'playtesting', 'polish'];
  // a polish pass runs every stage again, and all of it is the Polish step
  const current: StageKey | 'polish' = polishing || key === 'repairing' ? 'polish' : key;
  const done = (k: StageKey | 'polish') => polishing ? k !== 'polish' : order.indexOf(k) < order.indexOf(current);
  return (
    <section className="bshow" role="status" aria-live="polite">
      <div className="bs-top">
        <span className="bs-kicker">{mode === 'mog' ? 'Mog in progress' : 'Your world is being created'}</span>
        <span className="bs-clock" aria-label="Time so far">{clock((now || Date.now()) - startedAt)}</span>
      </div>
      <h2 className="bs-title">{mode === 'mog' ? info.mogTitle : info.title}{polishing ? `, pass ${attempt} of 3` : ''}</h2>
      <p className="bs-line">{line}{key === 'writing' && (stage?.chars ?? 0) > 0 ? `  ·  ${Math.round(Math.min(0.98, (stage?.chars ?? 0) / TARGET_CHARS) * 100)}% built` : ''}</p>
      {gen.drive ? <TestDrive key={gen.drive.token} drive={gen.drive} onDone={gen.endDrive} /> : <TrackArt stage={key} built={built} t={t} />}
      <div className="bs-bar" aria-hidden>
        {Array.from({ length: segments }, (_, i) => {
          const fill = Math.max(0, Math.min(1, overall * segments - i));
          return <span key={i} className={i > 0 ? 'polish' : undefined}><i style={{ width: `${fill * 100}%` }} /></span>;
        })}
      </div>
      <div className="bs-meta">
        <b>{Math.round(overall * 100)}%</b>
        <span>{leftText(left)}{!polishing && tStage < 30 && key === 'thinking' ? (mode === 'mog' ? '  ·  a Mog usually takes 10 to 20 minutes' : '  ·  a world usually takes 10 to 15 minutes') : ''}</span>
      </div>
      <ol className="bs-steps">
        {steps.map((s, i) => (
          <li key={s.key} className={s.key === current ? 'now' : done(s.key) ? 'done' : undefined}>
            <i>{i + 1}</i>{s.label}
          </li>
        ))}
      </ol>
      {fixes.length > 0 && (
        <div className="bs-fixes">
          <p><b>A second look.</b> The test drive found a few things, so your {mode === 'mog' ? 'Mog' : 'world'} is getting a polish:</p>
          <ul>{fixes.map((f) => <li key={f}>{f}</li>)}</ul>
          <details>
            <summary>Technical notes</summary>
            {rounds.flatMap((r) => r.problems).map((x, i) => <p key={i}>{scrub(x)}</p>)}
          </details>
        </div>
      )}
      <div className="bs-foot">
        {subject ? <p className="bs-idea"><span>{mode === 'mog' ? 'Your idea' : 'Your world'}</span>{subject.length > 220 ? subject.slice(0, 217) + '...' : subject}</p> : null}
        <p className="bs-tip"><span>While you wait</span>{tip}</p>
        <p className="bs-keep">Keep this tab open. You can play other worlds in a new tab meanwhile.</p>
      </div>
    </section>
  );
}

export function GenerationProgress({ gen, mode = 'create', subject }: { gen: Generation; mode?: Mode; subject?: string }) {
  const { busy, error, rounds } = gen;
  const ref = useRef<HTMLDivElement>(null);
  // the show comes into view as the build starts
  useEffect(() => { if (busy) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, [busy]);
  return (
    <div ref={ref} style={{ scrollMarginTop: 96 }}>
      {busy && <BuildShow gen={gen} mode={mode} subject={subject} />}
      {!busy && error && (
        <div className="bs-error" role="alert">
          <b>{mode === 'mog' ? 'Your Mog didn\'t finish' : 'Your world didn\'t finish'}</b>
          <p>{friendlyError(error)}</p>
          <details>
            <summary>Technical notes</summary>
            <p>{scrub(error)}</p>
            {rounds.flatMap((r) => r.problems).map((x, i) => <p key={i}>{scrub(x)}</p>)}
          </details>
        </div>
      )}
    </div>
  );
}

export function DraftResult({ gen, publishLabel, againLabel, onAgain, note }: { gen: Generation; publishLabel: string; againLabel: string; onAgain: () => void; note?: React.ReactNode }) {
  const { draft, publishing, publish, busy } = gen;
  if (!draft) return null;
  const secs = (draft.runtime.readyMs ?? 0) / 1000;
  return (
    <div className="panel bs-ready">
      <p className="bs-readylbl">Ready to play</p>
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
          ? `Test-driven in a real browser: it loads in ${secs < 1 ? 'under a second' : `${secs.toFixed(1)} seconds`}, runs smoothly at ${draft.runtime.fps} fps, and held up through ${draft.runtime.levelReached ?? 0} laps of rivals.`
          : 'Checked and ready to play.'}
        {' '}Built in {Math.max(1, Math.round(draft.ms / 60000))} minutes.
      </p>
      {note}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button className="btn" onClick={publish} disabled={publishing}>{publishing ? 'Publishing' : publishLabel}</button>
        <button className="btn outline" onClick={onAgain} disabled={busy}>{againLabel}</button>
      </div>
    </div>
  );
}
