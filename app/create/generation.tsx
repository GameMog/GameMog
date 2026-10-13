'use client';
import { useEffect, useRef, useState } from 'react';
import { PlayFrame } from '../g/[slug]/play-frame';
import { playerId } from '../anon';
import { cleanName, cleanMessage } from '@/lib/names';
import { renderDareCard, cardBase64 } from '@/lib/dare-card';
import { DiscordPill } from '../discord-pill';
import type { WorldMode } from '@/lib/custom-game';

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
  runtime: { ran: boolean; readyMs: number | null; fps: number | null; levelReached?: number; advisories?: string[]; open?: { kos: number; heat: number; boss: boolean };
    /** a penalty shootout's drive (13 Oct, lib/playtest-runtime.ts ShootDrive): the kicks it took and how many reached a result */
    kind?: string; shootout?: { kicks?: number; results?: number; goals?: number } };
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
  // in line for a slot (lib/build-limits.ts): the place (1 = next) and the wait in minutes, until the build begins
  const [queue, setQueue] = useState<{ position: number; etaMin: number } | null>(null);
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [busy]);
  // The build this page is reading. A creator who leaves it within the site (a link, Back: the page goes, the
  // document stays, and a read nobody shows would go on) lets it go, as a new build does: its request is aborted,
  // the connection closes, and the server stops the build (lib/build-limits.ts, the owner's limit 1, 9 Oct).
  // Closing the tab or reloading closes the connection by itself.
  const reading = useRef<AbortController | null>(null);
  useEffect(() => () => { reading.current?.abort(); reading.current = null; }, []);

  /** Streams a written world; any other response comes back as JSON for the caller. */
  async function run(body: Record<string, unknown>): Promise<unknown | null> {
    reading.current?.abort();
    const stop = (reading.current = new AbortController());
    setBusy(true); setError(''); setDraft(null); setRounds([]); setStage(null); setDrive(null); setQueue(null);
    setStartedAt(Date.now()); setNow(Date.now());
    try {
      const res = await fetch('/api/generate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: stop.signal });
      if (res.ok && res.body && (res.headers.get('content-type') ?? '').includes('ndjson')) {
        const reader = res.body.getReader(), dec = new TextDecoder();
        let buf = '', ended = false, waiting = false;
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let nl;
          while ((nl = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
            if (!line.trim()) continue;
            const e = JSON.parse(line);
            // the line moves, then the build begins: its clock starts from its turn, not from the wait
            if (e.type === 'queued') { waiting = true; setQueue({ position: e.position, etaMin: e.etaMin }); }
            else if (e.type === 'admitted') { waiting = false; setQueue(null); setStartedAt(Date.now()); setNow(Date.now()); }
            else if (e.type === 'stage') setStage((s) => ({ stage: e.stage, attempt: e.attempt, chars: e.stage === 'writing' ? s?.chars ?? 0 : 0 }));
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
        if (!ended) setError(waiting ? 'The connection was terminated while waiting in line.' : 'The connection was terminated before the world was finished.');
        return null;
      }
      const data = await res.json();
      if (!res.ok) setError(data.error ?? 'Generation failed');
      return data;
    } catch (e) {
      // a build let go (the page left, or a new build began) says nothing: nobody is here to read it
      if (!stop.signal.aborted) setError((e as Error).message);
      return null;
    } finally {
      // the show is this build's only while it is the one being read
      if (reading.current === stop) { reading.current = null; setBusy(false); setDrive(null); setQueue(null); }
    }
  }

  /**
   * Publishes the draft (POST /api/games; once only: a repeat answers the first game), credited to the name the
   * creator gave, if any, and to this browser (playerId, kept private by the server). The page then shows the next
   * step, sending the dare (DraftResult). A name the server will not take comes back as a field error, said beside it.
   */
  async function publish(who: { creator?: string; dare?: string | null } = {}): Promise<PublishOutcome> {
    if (!draft) return { ok: false, error: 'That draft no longer exists.' };
    setPublishing(true);
    try {
      const res = await fetch('/api/games', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ draftId: draft.draftId, creator: who.creator || undefined, player: playerId(), dare: who.dare || undefined }),
      });
      const data = await res.json().catch(() => ({})) as { id?: string; slug?: string; creator?: string | null; error?: string; field?: string };
      if (res.ok && data.id && data.slug) return { ok: true, game: { id: data.id, slug: data.slug, creator: data.creator ?? null } };
      if (data.field === 'creator') return { ok: false, error: data.error ?? 'Pick another name.', field: 'creator' };
      setError(data.error ?? 'Publish failed');
      return { ok: false, error: data.error ?? 'Publish failed' };
    } catch (e) {
      setError((e as Error).message);
      return { ok: false, error: (e as Error).message };
    } finally { setPublishing(false); }
  }

  return { busy, stage, rounds, draft, error, setError, publishing, startedAt, now, run, publish, drive, endDrive: () => setDrive(null), queue };
}
export type Generation = ReturnType<typeof useGeneration>;
/** A published game, as POST /api/games answers it. */
export type Published = { id: string; slug: string; creator: string | null };
export type PublishOutcome = { ok: true; game: Published } | { ok: false; error: string; field?: 'creator' };

type Mode = 'create' | 'mog';
/** The kind of world being built, when it is known (a Mog's is its original's): a penalty shootout has its own show. */
type Kind = WorldMode | undefined;
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
    lines: ['A test driver is playing it in a real browser', 'Checking it runs smoothly', 'Playing it through to a result'],
    mogLines: ['A test driver is playing your Mog in a real browser', 'Checking it runs smoothly', 'Playing it through to a result'],
  },
  repairing: {
    title: 'Polishing', mogTitle: 'Polishing',
    lines: ['The test drive spotted a few things', 'Tidying them up for you', 'A second pass, so it comes out right'],
    mogLines: ['The test drive spotted a few things', 'Tidying them up for you', 'A second pass, so it comes out right'],
  },
};

/** An open world's build, in its own words: no track, no laps (1 Oct). */
const OPEN_LINES: Partial<Record<StageKey, { lines: string[]; mogLines: string[] }>> = {
  thinking: {
    lines: ['Picking the place, the light and the weather', 'Casting your hero and the crews', 'Deciding what you can pick up and fight with', 'Sketching the streets and the open ground', 'Choosing the sounds of the place'],
    mogLines: ['Taking the original apart, piece by piece', 'Working your idea in', 'Keeping what makes it fun to play', 'Deciding what changes and what stays'],
  },
  writing: {
    lines: ['Raising the place', 'Laying the ground and the streets', 'Dressing the crews', 'Writing the intro and the story', 'Lighting the sky', 'Tuning the sound'],
    mogLines: ['Rebuilding the place your way', 'Swapping in the new scenery', 'Restyling the crews', 'Relighting the world'],
  },
  playtesting: {
    lines: ['A test player is playing it in a real browser', 'The crews are coming, and the heat is rising', 'Checking it runs smoothly', 'Getting knocked out on purpose, to be sure it ends the run'],
    mogLines: ['A test player is playing your Mog in a real browser', 'The crews are coming, and the heat is rising', 'Checking it runs smoothly', 'Getting knocked out on purpose, to be sure it ends the run'],
  },
};
const OPEN_TIPS = [
  'The heat rises with time and with every few knockouts, and a boss comes at every third heat.',
  'Once your world is live, anyone can Mog it with a better version.',
  'Players who have played both games pick the better Mog.',
  'Knockouts drop golden GM. Walk over it to collect it.',
  'The leaderboard ranks the time survived, then the GM you collect.',
  'W A S D moves, Shift runs, J or a click punches, and Space jumps.',
  'Before anything goes live, a test player plays it in a real browser.',
];

/** A penalty shootout's build, in its own words (13 Oct): no track, no laps, no rivals, no GM. */
const SHOOT_LINES: Partial<Record<StageKey, { lines: string[]; mogLines: string[] }>> = {
  thinking: {
    lines: ['Picking the stadium, the light and the weather', 'Choosing the two sides and their kits', 'Dressing the taker, the keeper and the referee', 'Deciding who fills the stands'],
    mogLines: ['Taking the original apart, piece by piece', 'Working your idea in', 'Keeping the kick, the keeper and the roar', 'Deciding what changes and what stays'],
  },
  writing: {
    lines: ['Raising the stadium', 'Laying the pitch and its lines', 'Dressing the two sides', 'Filling the stands', 'Hanging the floodlights', 'Lighting the sky'],
    mogLines: ['Rebuilding the stadium your way', 'Dressing the sides in their kits', 'Filling the stands with their fans', 'Restyling the keeper', 'Relighting the stadium'],
  },
  playtesting: {
    lines: ['A test player is taking penalties in a real browser', 'The keeper is reading the kick', 'Checking it runs smoothly', 'Playing every kick through to a result'],
    mogLines: ['A test player is taking penalties in your Mog in a real browser', 'The keeper is reading the kick', 'Checking it runs smoothly', 'Playing every kick through to a result'],
  },
};
const SHOOT_TIPS = [
  'Tap to run up: the faster you tap, the harder the strike, from COLD through WARM and HOT to ON FIRE.',
  'Once your Mog is live, anyone can Mog it with a better version.',
  'Hold the last tap as the ring glows, and let go as the gold ring closes on the plant foot.',
  'Players who have played both games pick the better Mog.',
  'Aim anywhere you like, but over the bar or past a post is a miss.',
  'The leaderboard ranks the goals you score in a sitting.',
  'Before anything goes live, a test player takes penalties in it in a real browser.',
];

/** Things worth knowing while you wait. */
const TIPS = [
  'Every lap, a new rival joins, a little faster and meaner than the last.',
  'Once your world is live, anyone can Mog it with a better version.',
  'Players who have played both games pick the better Mog.',
  'Golden GM coins line the track and are laid again every lap.',
  'The leaderboard ranks the lap you reach, then the GM you collect.',
  'Arrow keys steer and change speed. Space jumps hurdles and anything lower than you.',
  'Before anything goes live, a test driver races it in a real browser.',
  'Touch a rival or an obstacle and the run is over, so pick your line.',
];

/**
 * How far along a pass is (0 to 1) and roughly how many seconds are left,
 * from the stage, how long it has been running and how much has been written.
 * The times are what builds take at medium effort (the owner, 1 Oct): about 6
 * minutes, a couple of them thinking and a few writing a world of about
 * 60,000 characters; once writing starts, its own pace takes over.
 */
const EXPECT = { thinking: 110, writing: 180, checking: 8, playtesting: 70, repairing: 80 };
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
/** A penalty shootout's fixes, in its own words; anything else as any world's. */
function friendlyShootFix(problem: string) {
  const p = problem.toLowerCase();
  if (/^the kind of game/.test(p)) return 'Keeping it a penalty shootout';
  if (/^the match|shootout\.teams|shootout\.taker/.test(p)) return 'Keeping the two sides right';
  if (/keeper|rival\(/.test(p)) return 'Getting the keeper set up properly';
  if (/taker|player\(/.test(p)) return 'Getting the taker set up properly';
  if (/fps|draw call|triangle/.test(p)) return 'Making it run smoothly';
  if (/flat colou?r/.test(p)) return 'Bringing the stadium into view';
  if (/kick \d|did not end with a result/.test(p)) return 'Making every kick play through to a result';
  if (/human-moves-football/.test(p)) return 'Packing the run-up, the strike and the dives';
  if (/crowd|impostors/.test(p)) return 'Filling the stands';
  if (/lens|on the pitch|behind the goal/.test(p)) return 'Clearing the camera\'s view';
  return friendlyFix(problem);
}
/** Technical notes for the curious, without naming the builder behind GameMog. */
function scrub(text: string) {
  const out = text.replace(/ANTHROPIC_[A-Z_]+/g, 'the builder\'s key')
    .replace(/\b(?:the\s+)?(?:anthropic(?:\s+api)?|claude[\w.-]*(?:\s+opus)?(?:\s+[\d.]+)?|opus(?:\s+[\d.]+)?)\b/gi, 'the world builder');
  return out.charAt(0).toUpperCase() + out.slice(1);
}
function friendlyError(e: string) {
  // every one of the site's build slots is taken (lib/build-limits.ts BUSY): nothing was started or spent, said as it is
  if (/^GameMog is busy building/.test(e)) return 'GameMog is busy building other worlds. Try again in a minute.';
  // the day's spend has reached its ceiling (lib/build-limits.ts RESTING): no build starts until tomorrow
  if (/^Building is resting/.test(e)) return 'Building is resting for today. Every world is still free to play: come back tomorrow.';
  if (/while waiting in line/.test(e)) return 'The connection dropped while you were in line. Please try again.';
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
 * A penalty shootout's show (13 Oct): the goal draws itself as the world is written and its net fills in, the ball
 * waits on the spot and the keeper on his line, a scanner runs the frame during the safety check, and during the test
 * drive the kicks go in, past the keeper and over the bar. The frame is straight lines, so its points are worked out.
 */
const GOAL = 'M 170 192 L 170 58 L 430 58 L 430 192';
const GOAL_LEN = 528;
function goalAt(f: number) {
  const d = (((f % 1) + 1) % 1) * GOAL_LEN;
  return d < 134 ? { x: 170, y: 192 - d } : d < 394 ? { x: 36 + d, y: 58 } : { x: 430, y: d - 336 };
}
const KICKS = [{ x: 212, y: 92, dive: 1 }, { x: 392, y: 152, dive: -1 }, { x: 330, y: 30, dive: 1 }, { x: 238, y: 166, dive: -1 }];
function GoalArt({ stage, built, t }: { stage: StageKey | 'done'; built: number; t: number }) {
  const racing = stage === 'playtesting' || stage === 'done';
  // the net follows the frame: a column once the bar has passed it, a row once the far post has come down to it
  const cols = Array.from({ length: 13 }, (_, i) => (i + 1) / 14), rows = Array.from({ length: 7 }, (_, i) => (i + 1) / 8);
  const col = (f: number) => (134 + 260 * f) / GOAL_LEN <= built, row = (f: number) => (394 + 134 * f) / GOAL_LEN <= built;
  // a kick every 2.6 s: the ball flies from the spot to its corner (or over the bar), the keeper dives one way
  const k = KICKS[Math.floor(t / 2.6) % KICKS.length], u = (t % 2.6) / 2.6;
  const fly = racing ? Math.min(1, Math.max(0, (u - 0.18) / 0.3)) : 0, dive = racing ? Math.min(1, Math.max(0, (u - 0.24) / 0.22)) * k.dive : 0;
  const ball = { x: 300 + (k.x - 300) * fly, y: 207 + (k.y - 207) * fly - Math.sin(fly * Math.PI) * 16, r: 7 - 2.4 * fly };
  return (
    <svg className="bs-art" viewBox="0 0 600 220" role="img" aria-label="Your shootout's goal being built">
      <line x1="60" y1="192" x2="540" y2="192" stroke="rgba(255,255,255,.12)" strokeWidth="2" />
      <path d={GOAL} fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="12" strokeLinejoin="round" />
      {cols.map((f) => col(f) ? <line key={`v${f}`} x1={170 + 260 * f} y1="58" x2={170 + 260 * f} y2="192" stroke="rgba(255,255,255,.16)" strokeWidth="1" /> : null)}
      {rows.map((f) => row(f) ? <line key={`h${f}`} x1="170" y1={58 + 134 * f} x2="430" y2={58 + 134 * f} stroke="rgba(255,255,255,.16)" strokeWidth="1" /> : null)}
      <path d={GOAL} fill="none" stroke="#FFFFFF" strokeWidth="10" strokeLinejoin="round" strokeLinecap="round"
        strokeDasharray={`${GOAL_LEN * built} ${GOAL_LEN}`} opacity={built < 0.005 ? 0 : stage === 'repairing' ? 0.55 : 0.92} />
      {(racing || built >= 0.6) && (
        <g transform={`translate(${dive * 58} ${Math.abs(dive) * 14}) rotate(${dive * 64} 300 192)`}>
          <rect x="292" y="148" width="16" height="44" rx="8" fill="#2FA36B" stroke="#0B0B0F" strokeWidth="1.5" />
          <circle cx="300" cy="138" r="7" fill="#2FA36B" stroke="#0B0B0F" strokeWidth="1.5" />
        </g>
      )}
      <ellipse cx="300" cy="213" rx="7" ry="1.6" fill="rgba(255,255,255,.4)" />
      {(racing ? u < 0.9 : built >= 0.3) && <circle cx={ball.x} cy={ball.y} r={ball.r} fill="#F5B82E" stroke="#0B0B0F" strokeWidth="1.5" />}
      {stage === 'checking' && [0, 0.02, 0.04, 0.06].map((d, i) => {
        const p = goalAt(t * 0.45 - d);
        return <circle key={`s${i}`} cx={p.x} cy={p.y} r={9 - i * 2} fill="#4F7BFF" opacity={0.9 - i * 0.2} />;
      })}
      {(stage === 'thinking' || stage === 'repairing') && (() => {
        const p = goalAt(t * 0.08);
        return <circle cx={p.x} cy={p.y} r="6" fill="#F5B82E" />;
      })()}
    </svg>
  );
}

/**
 * The test drive, played here (the owner, 30 Sep): the draft at 1280x720,
 * scaled to the show, driven by its own autopilot (lib/runtime/drive.js).
 * What it measured goes to the builder; a drive that never reports is let go.
 * A penalty shootout (13 Oct) is then loaded once more as a phone loads it
 * (#phone: built on 'low', where no drive ran before), for up to 100 s, and
 * both reports go together (raw.phone); a phone load that never reports goes
 * as timedOut, and the drive is judged without it.
 */
const PHONE_MS = 100;
function TestDrive({ drive, onDone }: { drive: { draftId: string; token: string; attempt: number }; onDone: () => void }) {
  const box = useRef<HTMLDivElement>(null), frame = useRef<HTMLIFrameElement>(null);
  const [scale, setScale] = useState(0.5);
  const [phone, setPhone] = useState(false);
  // A tab in the background draws nothing, so a drive there can never run (1 Oct:
  // a Mog built in a background tab published with no cover). The drive starts
  // when this tab is in front; its clock runs only while it is; while it is not,
  // the page asks the build to keep waiting, and the tab's title says why.
  const [go, setGo] = useState(() => typeof document === 'undefined' || !document.hidden);
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
    let sent = false, shown = 0, away = 0;
    // (the drive's own report, held while the phone load runs)
    let first: { raw: Record<string, unknown>; covers?: unknown; artIcon?: unknown; artWide?: unknown } | null = null;
    const title = document.title;
    const post = (payload: Record<string, unknown>) => fetch('/api/generate/drive', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ draftId: drive.draftId, token: drive.token, ...payload }) });
    const send = (payload: Record<string, unknown>) => {
      if (sent) return; sent = true; document.title = title;
      post(payload).catch(() => {}).finally(() => done.current());
    };
    const onMsg = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow) return;
      const d = e.data as { gm?: string; type?: string; raw?: unknown; covers?: unknown; artIcon?: unknown; artWide?: unknown };
      if (d?.gm !== 'drive' || d.type !== 'report') return;
      if (first) { send({ ...first, raw: { ...first.raw, phone: d.raw } }); return; }
      const raw = (d.raw && typeof d.raw === 'object' ? d.raw : {}) as Record<string, unknown>;
      // a penalty shootout that loaded, driven in front: now its phone load, in a fresh frame
      if (raw.kind === 'shootout' && raw.ready === true && !raw.hidden) { first = { raw, covers: d.covers, artIcon: d.artIcon, artWide: d.artWide }; shown = 0; setPhone(true); return; }
      send({ raw: d.raw, covers: d.covers, artIcon: d.artIcon, artWide: d.artWide });
    };
    const onVis = () => { if (!document.hidden) { setGo(true); document.title = title; } else if (!sent) document.title = 'Your world is ready to test-drive'; };
    window.addEventListener('message', onMsg);
    document.addEventListener('visibilitychange', onVis);
    onVis();
    const tick = setInterval(() => {
      if (sent) return;
      if (document.hidden) { if (away++ % 30 === 0) post({ hold: true }).catch(() => {}); return; }
      if (first) { if (++shown >= PHONE_MS) send({ ...first, raw: { ...first.raw, phone: { timedOut: true } } }); return; }
      if (++shown >= 200) send({ raw: { timedOut: true } });
    }, 1000);
    return () => { window.removeEventListener('message', onMsg); document.removeEventListener('visibilitychange', onVis); clearInterval(tick); document.title = title; };
  }, [drive.draftId, drive.token]);
  return (
    <div className="bs-drive" ref={box} style={{ height: 720 * scale }}>
      {go ? (
        <iframe key={phone ? 'phone' : 'drive'} ref={frame} src={`/d/${drive.draftId}/play?drive=1${phone ? '#phone' : ''}`} sandbox="allow-scripts" title="Test drive"
          width={1280} height={720} tabIndex={-1} style={{ transform: `scale(${scale})` }} />
      ) : <p className="bs-drivewait">Your world is ready for its test drive. It runs as soon as this tab is in front.</p>}
      <span className="bs-drivetag">{phone ? 'Live test drive: as a phone' : 'Live test drive'}</span>
    </div>
  );
}

/**
 * The show while a world or a Mog is built: what it is, where it has got to,
 * how long is left, and a track drawing itself as it happens.
 */
function BuildShow({ gen, mode, subject, open, kind }: { gen: Generation; mode: Mode; subject?: string; open?: boolean; kind?: Kind }) {
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
  const shootout = kind === 'shootout';
  const info = STAGES[key], own = shootout ? SHOOT_LINES[key] : open ? OPEN_LINES[key] : undefined;
  const lines = mode === 'mog' ? (own ?? info).mogLines : (own ?? info).lines;
  const line = lines[Math.floor(t / 7) % lines.length];
  const tips = shootout ? SHOOT_TIPS : open ? OPEN_TIPS : TIPS, tip = tips[Math.floor(t / 11) % tips.length];
  const fixes = [...new Set(rounds.flatMap((r) => r.problems.map(shootout ? friendlyShootFix : friendlyFix)))];
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
      {gen.drive ? <TestDrive key={gen.drive.token} drive={gen.drive} onDone={gen.endDrive} /> : shootout ? <GoalArt stage={key} built={built} t={t} /> : <TrackArt stage={key} built={built} t={t} />}
      <div className="bs-bar" aria-hidden>
        {Array.from({ length: segments }, (_, i) => {
          const fill = Math.max(0, Math.min(1, overall * segments - i));
          return <span key={i} className={i > 0 ? 'polish' : undefined}><i style={{ width: `${fill * 100}%` }} /></span>;
        })}
      </div>
      <div className="bs-meta">
        <b>{Math.round(overall * 100)}%</b>
        <span>{leftText(left)}{!polishing && tStage < 30 && key === 'thinking' ? (mode === 'mog' ? '  ·  a Mog usually takes 5 to 10 minutes' : '  ·  a world usually takes 5 to 8 minutes') : ''}</span>
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

function ordinal(n: number) {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
  return `${n}${s}`;
}
/**
 * Waiting for a slot (lib/build-limits.ts): the place in line, the wait, and why the tab must stay open, in as few
 * words as it takes. The track waits with a single runner on it; the build show takes over at the build's turn.
 */
function InLine({ gen, mode, subject, kind }: { gen: Generation; mode: Mode; subject?: string; kind?: Kind }) {
  const t = useFrameTime(true);
  const q = gen.queue!;
  const what = mode === 'mog' ? 'Mog' : 'world';
  return (
    <section className="bshow" role="status" aria-live="polite">
      <div className="bs-top"><span className="bs-kicker">{q.position <= 1 ? 'You\'re next in line' : `You're ${ordinal(q.position)} in line`}</span></div>
      <h2 className="bs-title">{q.etaMin <= 1 ? 'About a minute' : `About ${q.etaMin} minutes`}</h2>
      <p className="bs-line">Keep this tab open: your browser test-drives your {what}.</p>
      {kind === 'shootout' ? <GoalArt stage="thinking" built={0} t={t} /> : <TrackArt stage="thinking" built={0} t={t} />}
      {subject ? <div className="bs-foot"><p className="bs-idea"><span>{mode === 'mog' ? 'Your idea' : 'Your world'}</span>{subject.length > 220 ? subject.slice(0, 217) + '...' : subject}</p></div> : null}
    </section>
  );
}
/** A build that could not start because of the site's limits: said calmly, with something to do instead. */
function LimitNote({ error }: { error: string }) {
  const [head, ...rest] = friendlyError(error).split('. ');
  const resting = /^Building is resting/.test(error);
  return (
    <section className="bshow" role="status">
      <div className="bs-top"><span className="bs-kicker">{head.replace(/\.$/, '')}</span></div>
      <p className="bs-line" style={{ marginTop: 10 }}>{rest.join('. ')}</p>
      {resting ? <div style={{ marginTop: 18 }}><a className="btn big outline" href="/">Play a world</a></div> : null}
    </section>
  );
}

export function GenerationProgress({ gen, mode = 'create', subject, open, kind }: { gen: Generation; mode?: Mode; subject?: string; open?: boolean; kind?: Kind }) {
  const { busy, error, rounds } = gen;
  const limit = /^(GameMog is busy building|Building is resting)/.test(error);
  const ref = useRef<HTMLDivElement>(null);
  // the show comes into view as the build starts
  useEffect(() => { if (busy) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, [busy]);
  return (
    <div ref={ref} style={{ scrollMarginTop: 96 }}>
      {busy && (gen.queue ? <InLine gen={gen} mode={mode} subject={subject} kind={kind} /> : <BuildShow gen={gen} mode={mode} subject={subject} open={open} kind={kind} />)}
      {!busy && error && limit && <LimitNote error={error} />}
      {!busy && error && !limit && (
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

/** The name a creator gave last time, offered again (this browser only). */
const CREATOR_KEY = 'gamemog:creator';
function rememberedName() { try { return localStorage.getItem(CREATOR_KEY) ?? ''; } catch { return ''; } }
function rememberName(v: string) { try { if (v) localStorage.setItem(CREATOR_KEY, v); } catch { /* private mode: asked again next time */ } }

/**
 * A finished draft: play it, put your name on it, publish it. Published, the page moves on to sending the dare
 * (SendDare) instead of going straight to the game. `dare`: the dare this Mog answers (the dare landing's "Mog it
 * back", carried here as ?dare=), so the funnel counts it mogged back. `parentTitle`: the game a Mog was made from.
 */
export function DraftResult({ gen, publishLabel, againLabel, onAgain, note, mode = 'create', parentTitle, dare, kind }: {
  gen: Generation; publishLabel: string; againLabel: string; onAgain: () => void; note?: React.ReactNode;
  mode?: Mode; parentTitle?: string; dare?: string | null; kind?: Kind;
}) {
  const { draft, publishing, publish, busy } = gen;
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState('');
  const [live, setLive] = useState<Published | null>(null);
  useEffect(() => { setName(rememberedName()); }, []);
  // another take is another game to publish
  useEffect(() => { setLive(null); }, [draft?.draftId]);
  if (!draft) return null;
  if (live) return <SendDare game={live} title={draft.meta.title} mode={mode} parentTitle={parentTitle} name={live.creator ?? ''} answering={dare ?? null} />;

  async function onPublish() {
    const raw = name.trim();
    const c = raw ? cleanName(raw) : null;
    if (c && !c.ok) { setNameError(c.error); return; }
    setNameError('');
    const r = await publish({ creator: c?.ok ? c.value : undefined, dare });
    if (!r.ok) { if (r.field === 'creator') setNameError(r.error); return; }
    if (r.game.creator) rememberName(r.game.creator);
    // a Mog made from a dare: mogged back (once per dare and browser; sending the new dare says so again, harmlessly)
    if (dare) fetch(`/api/dares/${encodeURIComponent(dare)}/event`, { method: 'POST', keepalive: true, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ visitor: playerId(), kind: 'mogged_back' }) }).catch(() => {});
    setLive(r.game);
  }
  const secs = (draft.runtime.readyMs ?? 0) / 1000;
  // (a penalty shootout's drive, 13 Oct: the kicks that reached a result, not laps)
  const so = draft.runtime.shootout;
  const shot = kind === 'shootout' || draft.runtime.kind === 'shootout' ? { n: so?.results ?? so?.kicks ?? draft.runtime.levelReached ?? 0 } : null;
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
          ? `Test-driven in a real browser: it loads in ${secs < 1 ? 'under a second' : `${secs.toFixed(1)} seconds`}, runs smoothly at ${draft.runtime.fps} fps, and ${shot ? `played ${shot.n} kick${shot.n === 1 ? '' : 's'} through to a result` : draft.runtime.open ? `held up through ${draft.runtime.open.kos} knockouts to heat ${draft.runtime.open.heat}${draft.runtime.open.boss ? ' and a boss' : ''}` : `held up through ${draft.runtime.levelReached ?? 0} laps of rivals`}.`
          : 'It passed the safety check, but the test drive did not get to finish in this tab, so nobody has played it through yet. Give it a run above before you publish.'}
        {' '}Built in {Math.max(1, Math.round(draft.ms / 60000))} minutes.
      </p>
      {note}
      <label className="lbl" htmlFor="creator-name">Your name on it</label>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input id="creator-name" type="text" value={name} maxLength={20} placeholder="Optional" autoComplete="nickname" spellCheck={false}
          aria-invalid={!!nameError} aria-describedby={nameError ? 'creator-name-error' : undefined} style={{ flex: '1 1 220px', width: 'auto', maxWidth: 320 }}
          onChange={(e) => { setName(e.target.value); setNameError(''); }}
          onKeyDown={(e) => { if (e.key === 'Enter' && !publishing) onPublish(); }} />
        <button className="btn" style={{ height: 44 }} onClick={onPublish} disabled={publishing}>{publishing ? 'Publishing' : publishLabel}</button>
        <button className="btn outline" style={{ height: 44 }} onClick={onAgain} disabled={busy || publishing}>{againLabel}</button>
      </div>
      {nameError ? <p id="creator-name-error" className="msg error" role="alert" style={{ marginTop: 8, marginBottom: 0 }}>{nameError}</p> : null}
    </div>
  );
}

/* ---------------------------------------------------------- send the dare -- */
const MOG_DARE = 'I made this. Can you beat it, or make a crazier version?';
type ReadyDare = { id: string; url: string; name: string; message: string };
const sameAs = (d: ReadyDare | null, f: { name: string; message: string }) => !!d && d.name === f.name && d.message === f.message;

/** The link on the clipboard: the async clipboard where there is one, else the old way. */
async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* the old way */ }
  try {
    const t = document.createElement('textarea');
    t.value = text; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.top = '0'; t.style.opacity = '0';
    document.body.appendChild(t); t.select();
    const ok = document.execCommand('copy');
    t.remove();
    return ok;
  } catch { return false; }
}

/**
 * The step after publishing (the dare loop, 10 Oct; mockup 2): "Your Mog is live. Dare someone to beat it", the dare
 * card the link will preview with, the name on it and the dare in a line, one gold SEND THE DARE (the share sheet, else
 * the link copied), COPY LINK, and a quiet way on to the game. The dare is made as the card appears (POST /api/dares,
 * with the card drawn here, lib/dare-card.ts), so a tap shares at once and stays the tap the browser asks for; an edit
 * to the name or the line makes it again when the field is left.
 */
function SendDare({ game, title, mode, parentTitle, name: name0, answering }: {
  game: Published; title: string; mode: Mode; parentTitle?: string; name: string; answering: string | null;
}) {
  const [name, setName] = useState(name0);
  const [message, setMessage] = useState(mode === 'mog' ? MOG_DARE : '');
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<{ field?: 'name' | 'message'; text: string } | null>(null);
  const [said, setSaid] = useState<{ on: 'send' | 'copy'; text: string } | null>(null);
  const ready = useRef<ReadyDare | null>(null);
  const card = useRef<{ name: string; b64: string | null; url: string | null } | null>(null);
  const making = useRef<{ key: string; p: Promise<ReadyDare | null> } | null>(null);
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const head = useRef<HTMLHeadingElement>(null);
  const cover = `/g/${game.slug}/cover?plain`;

  /** What the fields say, cleaned as the server will; null (and the reason shown) when one will not pass. */
  function fields(): { name: string; message: string } | null {
    const n = name.trim() ? cleanName(name) : { ok: true as const, value: '' };
    if (!n.ok) { setError({ field: 'name', text: n.error }); return null; }
    const m = cleanMessage(message);
    if (!m.ok) { setError({ field: 'message', text: m.error }); return null; }
    return { name: n.value, message: m.value };
  }

  /** The card for a name: drawn once per name; none if this browser cannot draw it (the link shows the cover). */
  async function drawCard(n: string) {
    if (card.current?.name === n) return card.current;
    let b64: string | null = null, url: string | null = null;
    try {
      const blob = await renderDareCard({ cover, title, from: n || null, creator: game.creator || n || null, parentTitle: parentTitle || null });
      b64 = await cardBase64(blob);
      url = URL.createObjectURL(blob);
    } catch { /* no card: the link previews with the game's cover */ }
    if (card.current?.url) URL.revokeObjectURL(card.current.url);
    card.current = { name: n, b64, url };
    setPreview(url);
    return card.current;
  }

  /** The dare for these fields: the one already made, the one being made, or a new one (one at a time). */
  function prepare(f: { name: string; message: string }): Promise<ReadyDare | null> {
    if (sameAs(ready.current, f)) return Promise.resolve(ready.current);
    const key = `${f.name}\n${f.message}`;
    if (making.current?.key === key) return making.current.p;
    const p: Promise<ReadyDare | null> = chain.current.then(async () => {
      if (sameAs(ready.current, f)) return ready.current;
      const c = await drawCard(f.name);
      const res = await fetch('/api/dares', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ gameId: game.id, sender: playerId(), name: f.name || undefined, message: f.message || undefined, parent: answering || undefined, card: c.b64 || undefined }),
      });
      const data = await res.json().catch(() => ({})) as { id?: string; url?: string; error?: string; field?: string };
      if (data.field === 'name' || data.field === 'message') { setError({ field: data.field, text: data.error ?? 'Try other words.' }); return null; }
      // the dare could not be made (too many at once, the connection): the game's own link goes out instead, at once
      if (!res.ok || !data.id || !data.url) return (ready.current = plain(f));
      const d: ReadyDare = { id: data.id, url: new URL(data.url, location.origin).href, name: f.name, message: f.message };
      ready.current = d;
      if (f.name) rememberName(f.name);
      return d;
    }).catch(() => (ready.current = plain(f)));
    chain.current = p;
    making.current = { key, p };
    p.finally(() => { if (making.current?.p === p) making.current = null; });
    return p;
  }
  /** The game's own link, for when a dare cannot be made: shared all the same (an edit to the words tries again). */
  const plain = (f: { name: string; message: string }): ReadyDare => ({ id: '', url: new URL(`/g/${game.slug}`, location.origin).href, ...f });
  /** Leaving a field: the dare is made again if it changed. */
  function commit() { const f = fields(); if (f) prepare(f); }

  // the dare is made as the card appears, so the first tap can share at once
  useEffect(() => {
    head.current?.focus({ preventScroll: true });
    commit();
    return () => { if (card.current?.url) URL.revokeObjectURL(card.current.url); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!said || said.text !== 'Link copied') return;
    const t = setTimeout(() => setSaid(null), 2500);
    return () => clearTimeout(t);
  }, [said]);

  const shared = (d: ReadyDare) => d.id && fetch(`/api/dares/${d.id}/event`, { method: 'POST', keepalive: true, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ visitor: playerId(), kind: 'shared' }) }).catch(() => {});
  function copy(d: ReadyDare, on: 'send' | 'copy', late: boolean) {
    copyText(d.url).then((ok) => {
      if (ok) { shared(d); setSaid({ on, text: 'Link copied' }); }
      else setSaid({ on, text: late ? 'Ready: tap again' : 'Copy failed' });
    });
  }
  /** Shares (or copies) a dare; `late`: the dare was still being made at the tap, so the browser may refuse it. */
  function deliver(d: ReadyDare, on: 'send' | 'copy', late: boolean) {
    if (on === 'send' && typeof navigator.share === 'function') {
      navigator.share({ title, text: d.message || undefined, url: d.url })
        .then(() => { shared(d); setSaid(null); })
        .catch((e: unknown) => {
          if ((e as { name?: string })?.name === 'AbortError') { setSaid(null); return; }
          copy(d, on, late);
        });
      return;
    }
    copy(d, on, late);
  }
  function tap(on: 'send' | 'copy') {
    const f = fields();
    if (!f) return;
    setError(null);
    // the dare for exactly these words is made: share in this tap
    if (sameAs(ready.current, f)) { deliver(ready.current!, on, false); return; }
    setSaid({ on, text: 'One moment' });
    prepare(f).then((d) => { if (d) deliver(d, on, true); else setSaid(null); });
  }

  const what = mode === 'mog' ? 'Mog' : 'world';
  return (
    <div className="gl sd" role="dialog" aria-modal="true" aria-labelledby="sd-title">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <div className="sd-bg" aria-hidden><img className="gl-blurart" src={cover} alt="" /></div>
      <div className="sd-in">
        <section className="sd-card gl-glass gl-deep gl-lit">
          <span className="gl-cap sd-live"><i aria-hidden />Your {what} is live</span>
          <h2 id="sd-title" className="gl-ttl sd-ttl" ref={head} tabIndex={-1} style={{ outline: 'none' }}>Dare someone to beat it</h2>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="sd-preview" src={preview ?? cover} alt={preview ? `Your dare card for ${title}` : ''} />
          <label className="gl-cap" htmlFor="sd-name">Your name on it</label>
          <input id="sd-name" className="gl-field" type="text" value={name} maxLength={20} placeholder="Optional" autoComplete="nickname" spellCheck={false}
            aria-invalid={error?.field === 'name'} onChange={(e) => { setName(e.target.value); setError(null); }} onBlur={commit}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
          {error?.field === 'name' ? <p className="sd-err" role="alert">{error.text}</p> : null}
          <label className="gl-cap" htmlFor="sd-message">Your dare</label>
          <textarea id="sd-message" className="gl-field" rows={2} value={message} maxLength={140} placeholder="Optional"
            aria-invalid={error?.field === 'message'} onChange={(e) => { setMessage(e.target.value.replace(/\n/g, ' ')); setError(null); }} onBlur={commit} />
          {error?.field === 'message' ? <p className="sd-err" role="alert">{error.text}</p> : null}
          <button type="button" className="gl-pill gl-gold" onClick={() => tap('send')}>
            {said?.on === 'send' ? said.text : <>Send the dare<svg width="15" height="15" viewBox="0 0 16 16" aria-hidden><path d="M5 3h8v8M13 3L3 13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></>}
          </button>
          <button type="button" className="gl-pill gl-clear" onClick={() => tap('copy')}>{said?.on === 'copy' ? said.text : 'Copy link'}</button>
          <a className="sd-go" href={`/g/${game.slug}`}>Go to your game</a>
        </section>
        <DiscordPill />
      </div>
    </div>
  );
}
