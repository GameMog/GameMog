'use client';
import { useEffect, useRef, useState } from 'react';
import type { StoryCity } from '@/lib/storykit-site';

/**
 * The build show for a Story Kit world (STORYKIT=on): the same show as every build (app/create/generation.tsx), with
 * the stages a story has. The server writes the story and gates it (Write, Check: the build route's own stages); then
 * the creator's browser does the heavy work, and the show follows it person by person and line by line:
 *
 *   forging  Cast: each person's sheet becomes their body (the Character Forge in this browser), and their headshot
 *            appears on their card as soon as it is made (portraitOf below)
 *   voicing  Voices: every spoken line rendered in this browser, a count and the line being recorded
 *   driving  Test drive: the autopilot plays every mission in this tab, each one ticked off as it passes
 *   art      Key art: the cover and the hero's headshot portrait
 *
 * The browser's own work reports through `StoryWork` (useGeneration's `story`, merged by storyPatch); the build stream
 * can send the same thing as { type: 'story', ...patch } lines. Nothing here guesses how long is left: a story's
 * stages have not been timed yet, so the show counts what is done instead.
 */
export type StoryStage = 'forging' | 'voicing' | 'driving' | 'art';
export type StoryPerson = { id: string; name: string; color: string; role?: string; state: 'waiting' | 'forging' | 'done' | 'failed'; portrait?: string; ms?: number };
export type StoryMission = { id: string; title: string; state: 'waiting' | 'driving' | 'passed' | 'failed' };
export type StoryWork = {
  stage?: StoryStage;
  city?: StoryCity;
  title?: string;
  cast?: StoryPerson[];
  voices?: { done: number; total: number; line?: { who: string; text: string }; note?: string };
  /** `src`: the page the autopilot is playing, shown in the show while it drives (as a world's test drive is) */
  drive?: { missions: StoryMission[]; src?: string; note?: string | null; errors?: number; errorKinds?: Record<string, number> };
  art?: { keyArt?: string; headshot?: string; hero?: string };
  /** the browser's work is finished (the draft is then shown as any world's is) */
  done?: boolean;
  /** the test drive's verdict as the server recorded it (public/storykit/work.js, POST .../report) */
  result?: { status: string; passed: number; of: number; reason?: string };
};

/** One report merged into what is known: the cast by id (a person keeps a portrait once made), everything else replaced. */
export function storyPatch(s: StoryWork | null, p: StoryWork): StoryWork {
  const prev = s ?? {};
  const cast = p.cast ? (() => {
    const by = new Map((prev.cast ?? []).map((c) => [c.id, c]));
    for (const c of p.cast) by.set(c.id, { ...by.get(c.id), ...c, portrait: c.portrait ?? by.get(c.id)?.portrait });
    return [...by.values()];
  })() : prev.cast;
  return { ...prev, ...p, cast, art: p.art ? { ...prev.art, ...p.art } : prev.art };
}

/**
 * A headshot of a forged person (a GLB's URL or bytes) as an image URL, made in this browser: a hidden frame on
 * /storykit/forge/portrait.html renders it on the cast's studio set (three.js) and hands back a JPEG. One frame serves
 * every request, one at a time.
 */
let portraitFrame: Promise<(src: string | ArrayBuffer, o?: { w?: number; h?: number; bg?: string }) => Promise<string>> | null = null;
export function portraitOf(src: string | ArrayBuffer, o?: { w?: number; h?: number; bg?: string }): Promise<string> {
  portraitFrame ??= new Promise((resolve, reject) => {
    const f = document.createElement('iframe');
    f.src = '/storykit/forge/portrait.html'; f.title = 'Portraits'; f.tabIndex = -1; f.setAttribute('aria-hidden', 'true');
    Object.assign(f.style, { position: 'fixed', left: '-9999px', top: '0', width: '480px', height: '600px', border: '0' });
    const t0 = Date.now();
    const wait = () => {
      const w = f.contentWindow as (Window & { __portrait?: (s: string | ArrayBuffer, o?: object) => Promise<string>; __portraitError?: string }) | null;
      if (w?.__portrait) return resolve(w.__portrait);
      if (w?.__portraitError) { portraitFrame = null; return reject(new Error(w.__portraitError)); }
      if (Date.now() - t0 > 60_000) { portraitFrame = null; return reject(new Error('The portrait studio did not load.')); }
      setTimeout(wait, 100);
    };
    f.onload = wait;
    document.body.appendChild(f);
  });
  return portraitFrame.then((fn) => fn(src, o));
}

function clock(ms: number) { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }

/** Ticks with the display while the show is up (the scanner during the check, the dots while writing). */
function useFrameTime() {
  const [t, setT] = useState(0);
  useEffect(() => {
    let raf = 0; const t0 = performance.now();
    const step = () => { setT((performance.now() - t0) / 1000); raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);
  return t;
}

type ServerStage = 'thinking' | 'writing' | 'checking' | 'repairing' | 'playtesting';
type Key = 'write' | 'check' | 'cast' | 'voices' | 'drive' | 'art';
const ORDER: Key[] = ['write', 'check', 'cast', 'voices', 'drive', 'art'];
const STEP_LABEL: Record<Key, string> = { write: 'Write', check: 'Check', cast: 'Cast', voices: 'Voices', drive: 'Test drive', art: 'Key art' };
/** Each step's share of the bar: the writing is the long part, the browser's work after it. */
const SHARE: Record<Key, number> = { write: 0.46, check: 0.04, cast: 0.16, voices: 0.18, drive: 0.12, art: 0.04 };

const TITLES: Record<Key, { create: string; mog: string; lines: string[]; mogLines: string[] }> = {
  write: { create: 'Writing your story', mog: 'Writing your remix',
    lines: ['Casting the people and what each of them wants', 'Laying out three acts', 'Picking the streets for every mission', 'Choosing the cars and who drives them', 'Writing the calls and the choices', 'Setting the hour, the season and the weather'],
    mogLines: ['Reading the original story', 'Working your idea in', 'Deciding who stays and who is new', 'Rewriting the missions on the same streets', 'Writing the new lines'] },
  check: { create: 'Safety check', mog: 'Safety check',
    lines: ['Every street named is a street in the city', 'Every mission can be done in the car it gives you', 'Every person and every number within bounds'],
    mogLines: ['The city is the original\'s, untouched', 'Every mission can be done in the car it gives you', 'Every person and every number within bounds'] },
  cast: { create: 'Forging the cast', mog: 'Forging the new cast',
    lines: ['Your browser is building each person, body and face', 'Fitting their clothes and their hair', 'Rigging them to walk, sit and talk'],
    mogLines: ['Your browser is building each new person, body and face', 'People the original already had are kept as they are'] },
  voices: { create: 'Recording the voices', mog: 'Recording the voices',
    lines: ['Your browser is reading every line in its speaker\'s voice'],
    mogLines: ['Your browser is reading every new line in its speaker\'s voice', 'Lines you kept keep their recordings'] },
  drive: { create: 'Test drive', mog: 'Test drive',
    lines: ['A test driver is playing every mission in this tab'],
    mogLines: ['A test driver is playing every mission of your Mog in this tab'] },
  art: { create: 'Key art', mog: 'Key art',
    lines: ['Framing the cover and your hero\'s portrait'],
    mogLines: ['Framing the cover and your hero\'s portrait'] },
};

const TIPS = [
  'A story world is three acts of missions on a real city, with its own people, cars and voices.',
  'Anyone can Mog your story: the city stays, and the story, the people, the cars and the voices are theirs to change.',
  'Every person is built from a description, never from a photo, and every voice is invented.',
  'Lines without a recording yet play as subtitles, so nothing waits on a voice.',
  'Before it can publish, a test driver plays every mission through in this tab.',
];

function keyOf(server: ServerStage | undefined, story: StoryWork | null): Key {
  if (story?.stage === 'art') return 'art';
  if (story?.stage === 'driving') return 'drive';
  if (story?.stage === 'voicing') return 'voices';
  if (story?.stage === 'forging') return 'cast';
  return server === 'checking' ? 'check' : 'write';
}
/** How far along the step is (0 to 1), from what has been counted. */
function within(key: Key, chars: number, story: StoryWork | null, tStage: number) {
  if (key === 'write') return Math.min(0.98, chars / 40000);
  if (key === 'check') return Math.min(0.9, tStage / 8);
  if (key === 'cast') { const c = story?.cast ?? []; return c.length ? c.filter((p) => p.state === 'done' || p.state === 'failed').length / c.length : 0; }
  if (key === 'voices') { const v = story?.voices; return v && v.total ? v.done / v.total : 0; }
  if (key === 'drive') { const m = story?.drive?.missions ?? []; return m.length ? m.filter((x) => x.state === 'passed' || x.state === 'failed').length / m.length : 0; }
  const a = story?.art; return (a?.keyArt ? 0.5 : 0) + (a?.headshot ? 0.5 : 0);
}

/** The first letter of the first name (a title such as "Sgt." or "Mrs." skipped, unless it is all there is). */
function initials(name: string) { const w = name.split(/\s+/).filter(Boolean); return (w.find((x) => !x.endsWith('.')) ?? w[0] ?? '?').charAt(0).toUpperCase(); }

/** The cast as cards: a waiting person is their colour and initial, then their headshot once the forge has made them. */
function CastCards({ cast }: { cast: StoryPerson[] }) {
  return (
    <ul className="sks-cast">
      {cast.map((p) => (
        <li key={p.id} className={`sks-person ${p.state}`}>
          <div className="sks-portrait" style={{ borderColor: p.color }}>
            {p.portrait
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={p.portrait} alt={`${p.name}'s portrait`} />
              : <span style={{ color: p.color }}>{initials(p.name)}</span>}
            {p.state === 'forging' && !p.portrait ? <i className="sks-forging">Forging</i> : null}
          </div>
          <b>{p.name}</b>
          <small>{p.state === 'done' ? (p.ms ? `Ready in ${(p.ms / 1000).toFixed(1)} s` : 'Ready') : p.state === 'forging' ? 'Forging' : p.state === 'failed' ? 'Stand-in for now' : p.role ?? 'Waiting'}</small>
        </li>
      ))}
    </ul>
  );
}

/** The story being written: three acts whose missions fill in as it is written, then a scanner over them for the check. */
function ActsArt({ filled, scanning, t }: { filled: number; scanning: boolean; t: number }) {
  const slots = 9, n = Math.round(filled * slots), scan = Math.floor(t * 2.2) % slots;
  return (
    <div className="sks-acts" aria-hidden>
      {[0, 1, 2].map((a) => (
        <div key={a} className="sks-act">
          <span>Act {a + 1}</span>
          {[0, 1, 2].map((m) => {
            const i = a * 3 + m;
            return <i key={m} className={scanning && i === scan ? 'scan' : i < n ? 'on' : undefined} />;
          })}
        </div>
      ))}
    </div>
  );
}

function VoicesArt({ v, cast }: { v: NonNullable<StoryWork['voices']>; cast: StoryPerson[] }) {
  const who = v.line ? cast.find((c) => c.name === v.line!.who) : undefined;
  return (
    <div className="sks-voices">
      <div className="sks-count"><b>{v.done}</b><span>of {v.total} lines recorded</span></div>
      <div className="sks-track" aria-hidden><i style={{ width: `${v.total ? (v.done / v.total) * 100 : 0}%` }} /></div>
      {v.line ? (
        <p className="sks-line">
          {who?.portrait
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={who.portrait} alt="" style={{ borderColor: who.color }} />
            : <i style={{ background: who?.color ?? '#8E93A0' }} />}
          <span><b>{v.line.who}</b>{v.line.text}</span>
        </p>
      ) : null}
      {v.note ? <p className="sks-note" role="alert">{v.note}</p> : null}
    </div>
  );
}

function DriveArt({ d }: { d: NonNullable<StoryWork['drive']> }) {
  return (
    <div className="sks-drive">
      {d.src ? (
        <div className="bs-drive" style={{ aspectRatio: '16 / 9', margin: 0 }}>
          <iframe src={d.src} title="Test drive" tabIndex={-1} style={{ width: '100%', height: '100%', border: 0, pointerEvents: 'none' }} />
          <span className="bs-drivetag">Test drive</span>
        </div>
      ) : null}
      <ol className="sks-missions">
        {d.missions.map((m, i) => (
          <li key={m.id} className={m.state}>
            <i>{m.state === 'passed' ? <Tick /> : i + 1}</i>
            <span>{m.title}</span>
            <small>{m.state === 'passed' ? 'Passed' : m.state === 'driving' ? 'Driving' : m.state === 'failed' ? 'Needs a look' : ''}</small>
          </li>
        ))}
      </ol>
      {/* (why the drive is waiting or stopped: a tab in the background, a stuck or failed mission; public/storykit/work.js) */}
      {d.note ? <p className="sks-note" role="alert">{d.note}</p> : null}
      {/* (what Mog City reported going wrong on the page, counted: errors, rejections, files that did not load) */}
      {d.errors && !d.note ? <p className="sks-note">{d.errors === 1 ? '1 error' : `${d.errors} errors`} in the game so far</p> : null}
    </div>
  );
}

function ArtArt({ a, hero }: { a: NonNullable<StoryWork['art']>; hero?: StoryPerson }) {
  return (
    <div className="sks-art">
      <figure className="sks-key">
        {a.keyArt
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={a.keyArt} alt="Key art" />
          : <span>Framing the cover</span>}
        <figcaption>Key art</figcaption>
      </figure>
      <figure className="sks-head" style={hero ? { borderColor: hero.color } : undefined}>
        {a.headshot
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={a.headshot} alt={`${a.hero ?? hero?.name ?? 'The hero'}'s portrait`} />
          : <span>Portrait</span>}
        <figcaption>{a.hero ?? hero?.name ?? 'Your hero'}</figcaption>
      </figure>
    </div>
  );
}

const Tick = () => <svg width="12" height="12" viewBox="0 0 20 20" aria-hidden><path d="M4 10.5l4 4 8-9" stroke="currentColor" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>;

export function StoryShow({ mode, stage, chars, startedAt, now, story, subject, cityName }: {
  mode: 'create' | 'mog'; stage?: ServerStage; chars: number; startedAt: number; now: number;
  story: StoryWork | null; subject?: string; cityName?: string;
}) {
  const t = useFrameTime();
  const key = keyOf(stage, story);
  const since = useRef({ key: '', at: 0 });
  if (since.current.key !== key) since.current = { key, at: Date.now() };
  const tStage = Math.max(0, (now || Date.now()) - since.current.at) / 1000;
  const idx = ORDER.indexOf(key);
  const overall = ORDER.slice(0, idx).reduce((s, k) => s + SHARE[k], 0) + SHARE[key] * within(key, chars, story, tStage);
  const info = TITLES[key];
  const lines = mode === 'mog' ? info.mogLines : info.lines;
  const line = lines[Math.floor(t / 7) % lines.length];
  const tip = TIPS[Math.floor(t / 11) % TIPS.length];
  const cast = story?.cast ?? [];
  const hero = cast[0];
  const counted = key === 'cast' && cast.length ? `${cast.filter((p) => p.state === 'done').length} of ${cast.length} people ready`
    : key === 'voices' && story?.voices ? `${story.voices.done} of ${story.voices.total} lines`
    : key === 'drive' && story?.drive ? `${story.drive.missions.filter((m) => m.state === 'passed').length} of ${story.drive.missions.length} missions passed`
    : key === 'write' && chars > 0 ? `${Math.round(Math.min(0.98, chars / 40000) * 100)}% written` : '';
  return (
    <section className="bshow skshow" role="status" aria-live="polite">
      <div className="bs-top">
        <span className="bs-kicker">{mode === 'mog' ? 'Mog in progress' : 'Your story is being made'}</span>
        <span className="bs-clock" aria-label="Time so far">{clock((now || Date.now()) - startedAt)}</span>
      </div>
      {cityName ? <p className="sks-city"><Pin />{cityName}{mode === 'mog' ? ', the original\'s city' : ''}</p> : null}
      <h2 className="bs-title">{mode === 'mog' ? info.mog : info.create}</h2>
      <p className="bs-line">{line}{counted ? `  ·  ${counted}` : ''}</p>
      <div className="sks-stage">
        {key === 'write' || key === 'check'
          ? <ActsArt filled={key === 'check' ? 1 : Math.min(1, chars / 40000)} scanning={key === 'check'} t={t} />
          : key === 'cast' ? <CastCards cast={cast} />
          : key === 'voices' && story?.voices ? <VoicesArt v={story.voices} cast={cast} />
          : key === 'drive' && story?.drive ? <DriveArt d={story.drive} />
          : key === 'art' ? <ArtArt a={story?.art ?? {}} hero={hero} />
          : null}
      </div>
      <div className="bs-bar" aria-hidden><span><i style={{ width: `${Math.min(1, overall) * 100}%` }} /></span></div>
      <div className="bs-meta">
        <b>{Math.round(Math.min(1, overall) * 100)}%</b>
        <span>{idx >= 2 ? 'Your browser is doing this part' : 'GameMog is writing it'}</span>
      </div>
      <ol className="bs-steps">
        {ORDER.map((k, i) => (
          <li key={k} className={k === key ? 'now' : i < idx ? 'done' : undefined}><i>{i + 1}</i>{STEP_LABEL[k]}</li>
        ))}
      </ol>
      <div className="bs-foot">
        {subject ? <p className="bs-idea"><span>{mode === 'mog' ? 'Your idea' : 'Your story'}</span>{subject.length > 220 ? subject.slice(0, 217) + '...' : subject}</p> : null}
        <p className="bs-tip"><span>While you wait</span>{tip}</p>
        <p className="bs-keep">Keep this tab open and in front: your browser forges the cast, records the voices and test-drives every mission.</p>
      </div>
    </section>
  );
}

export const Pin = () => <svg width="14" height="14" viewBox="0 0 20 20" aria-hidden fill="currentColor"><path d="M10 1.8a6 6 0 00-6 6c0 4.4 6 10.4 6 10.4s6-6 6-10.4a6 6 0 00-6-6zm0 3.6a2.4 2.4 0 110 4.8 2.4 2.4 0 010-4.8z" /></svg>;
export const Lock = () => <svg width="13" height="13" viewBox="0 0 20 20" aria-hidden fill="currentColor"><path d="M10 1.8a4.6 4.6 0 00-4.6 4.6V8H4.6A1.6 1.6 0 003 9.6v7A1.6 1.6 0 004.6 18.2h10.8a1.6 1.6 0 001.6-1.6v-7A1.6 1.6 0 0015.4 8h-.8V6.4A4.6 4.6 0 0010 1.8zm0 2.2a2.4 2.4 0 012.4 2.4V8H7.6V6.4A2.4 2.4 0 0110 4z" /></svg>;
