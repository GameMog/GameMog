'use client';
import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { playerId } from '../../anon';
import { track } from '../../beacon';
import { useMe } from '../../me-store';
import { meFragment, YOU_IN_GAMES } from '@/lib/me';
import { useRouter } from 'next/navigation';
import { KartScore, kartMeasured, ordinal, raceClock, type KartConstants, type KartTier } from '@/lib/kart-score';
import { TierChip, ScoreBar } from './kart-score-ui';
import { KartDiagCard, readKdiag, KART_BOOT_KEY as BOOT_KEY, KART_LAST_KEY as LAST_KEY } from './kart-diag';
import type { DareView } from '@/lib/dare';
import type { DareOutcome } from './dare-overlay';

// the dare's glass (./dare-overlay.tsx, with app/glass.css): loaded only when a dare is in context
const DareStart = dynamic(() => import('./dare-overlay').then((m) => m.DareStart), { ssr: false });
const DareResult = dynamic(() => import('./dare-overlay').then((m) => m.DareResult), { ssr: false });
const DareExit = dynamic(() => import('./dare-overlay').then((m) => m.DareExit), { ssr: false });

type Result = {
  place: number; timeMs: number; finished: boolean; score: number; won: boolean; level: number; gm: number; assisted: boolean;
  tempoReached: number; locks: number; bestStreak: number;
  // a kart race's (8 Oct): its laps, enemies hit, whether the race was called before the finish and the share driven,
  // and the racer's id (each racer has its own perfect time)
  laps?: number; hits?: number; estimated?: boolean; progress?: number | null; racer?: string | null;
  // an open world's run (its time survived ranks, the takedowns beside it; a goal reached), and a kart race's field size
  kos: number; survival: boolean; goal: boolean; karts?: number;
};
/** What the scores route said of a posted kart run: the score it worked out, where it landed, or that it is held. */
type Posted = { score: number; tier: KartTier; rank: number | null; review: boolean; best: boolean };

/**
 * Hosts the sandboxed game and listens for one message.
 *
 * `sandbox="allow-scripts"` without `allow-same-origin` puts the game on an
 * opaque origin: it cannot read this page, our cookies, or our API. The only
 * channel is postMessage, and because the origin is opaque we verify the
 * *source window* rather than an origin string.
 *
 * A result posted from a frame is a claim, not a fact. It is stored as one.
 */
export function PlayFrame({ slug, gameId, poster, src: base0 = `/g/${slug}/play`, scores = true, you: wantsYou = false, kart = false, kartScore = null, kdiag = null }: {
  slug: string; gameId: string; poster: React.ReactNode; src?: string;
  /** Off for drafts: a run in a preview has no leaderboard to post to. */
  scores?: boolean;
  /**
   * A world on the GameMog Runtime, where the player is you (docs/PRODUCT.md).
   * The frame then waits for this browser's character before it loads, so the
   * world is built with you in it, and hears about any change after.
   */
  you?: boolean;
  /**
   * A kart race (6 Oct), as the page read it from the code: its result is a place and a time over three laps, so the
   * panel says that, not the endless race's level. (The result still carries `level`, its laps, for the score route.)
   */
  kart?: boolean;
  /** A kart race's score constants (meta.kartScore, or the course fallback): the panel scores the run as the route will. */
  kartScore?: KartConstants | null;
  /**
   * A kart race's diagnostic switches, from the page's own ?kdiag= (the owner's phone, 8 Oct; ./kart-diag.tsx): the
   * race's are passed on to the frame's address (lib/runtime/kart-guard.js reads them there), and 'info' holds the race
   * back behind a card of what this device is and how the last race on it ended.
   */
  kdiag?: string | null;
}) {
  const diag = kart ? readKdiag(kdiag) : { info: false, switches: [] as string[] };
  const base = diag.switches.length ? `${base0}${base0.includes('?') ? '&' : '?'}kdiag=${diag.switches.join(',')}` : base0;
  const [held, setHeld] = useState(diag.info);
  const ref = useRef<HTMLIFrameElement>(null);
  const you = wantsYou && YOU_IN_GAMES;
  const me = useMe();
  // the character rides in the URL fragment, which never reaches the server;
  // it is fixed when the frame first loads, and changes after go by message
  const [src, setSrc] = useState<string | null>(you ? null : base);
  useEffect(() => { if (you && me !== undefined && src === null) setSrc(base + (me ? meFragment(me) : '')); }, [you, me, base, src]);
  const [result, setResult] = useState<Result | null>(null);
  const [name, setName] = useState('');
  const [saved, setSaved] = useState(false);
  const [posted, setPosted] = useState<Posted | null>(null);
  const router = useRouter();
  const [loaded, setLoaded] = useState(false);
  const [live, setLive] = useState(false);
  const [stalled, setStalled] = useState(false);
  // a kart race's boot step (8 Oct, lib/runtime/kart-guard.js), for the stall line to say where it got to
  const [bootStep, setBootStep] = useState<string | null>(null);
  // The dare in context (the dare loop, 10 Oct): this page opened with ?dare=<id>, from the dare landing's PLAY. Only a
  // published game's page holds one; without it nothing here changes.
  const box = useRef<HTMLDivElement>(null);
  const [dare, setDare] = useState<DareView | null>(null);
  const dareRef = useRef<DareView | null>(null);
  const [outcome, setOutcome] = useState<DareOutcome | null>(null);
  const [tap, setTap] = useState(false);
  const started = useRef(false), playPending = useRef(false);
  const [fs, setFs] = useState(false);
  // (a phone with no element full screen, an iPhone: the frame takes the screen itself, app/glass.css .gl-pseudo)
  const [pseudo, setPseudo] = useState(false);
  // (a run is over: the way out of the screen-filling frame shows then, never over the game's own HUD mid-run)
  const [ended, setEnded] = useState(false);
  const [frameH, setFrameH] = useState(0);
  const sheet = useRef<HTMLDivElement>(null);
  // the leaderboard asks for your name; your character already has one
  useEffect(() => { if (you && me) setName((n) => n || me.name); }, [you, me]);
  // a change of look while playing: the runtime rebuilds you in place
  useEffect(() => {
    if (you && me && live) ref.current?.contentWindow?.postMessage({ source: 'gamemog-host', type: 'me', me }, '*');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

  // Ask the game whether it is running, until it says so. Waiting to be told
  // does not work: the game can finish booting before this page's script has
  // started, and a message sent before anyone listens is simply lost. That was
  // the "browser is blocking the embedded game" warning over a game that was
  // running perfectly well underneath.
  useEffect(() => {
    if (live) return;
    const ask = () => ref.current?.contentWindow?.postMessage({ source: 'gamemog-host', type: 'hello' }, '*');
    ask();
    const t = setInterval(ask, 400);
    return () => clearInterval(t);
  }, [live]);

  // A kart race's racer pick (6 Oct): the game runs on an opaque origin, so it cannot keep anything itself; the
  // racer you picked is kept here, by its id, and handed back each time a kart race is up
  useEffect(() => {
    if (!kart || !live) return;
    let racer = '';
    try { racer = localStorage.getItem('gamemog:kart:racer') ?? ''; } catch {}
    if (racer) ref.current?.contentWindow?.postMessage({ source: 'gamemog-host', type: 'kart-racer', racer }, '*');
  }, [kart, live]);

  // A game that never answers is a real state: some extensions and embedded
  // browsers refuse frames outright, and a broken game never boots. After a
  // generous wait we say so plainly and offer the direct link.
  useEffect(() => {
    if (live || held) return;
    const t = setTimeout(() => setStalled(true), 15000);
    return () => clearTimeout(t);
  }, [live, held]);

  // A kart race's boot that took the whole tab down (8 Oct): its last step is kept here while it runs and dropped when
  // the page is left; still here the next time a game page opens means the page died, and that is reported once
  useEffect(() => {
    try {
      const raw = localStorage.getItem(BOOT_KEY);
      if (raw) {
        localStorage.removeItem(BOOT_KEY);
        const b = JSON.parse(raw) as { at?: number; slug?: string; step?: string; info?: Record<string, unknown>; hidden?: boolean };
        if (b && typeof b.at === 'number' && Date.now() - b.at < 86400_000) {
          sendKartReport({ ...(b.info ?? {}), kind: 'crash', slug: b.slug, step: b.step, hidden: !!b.hidden });
          // (and kept, for ?kdiag=info to show: the last way a race on this device ended badly)
          localStorage.setItem(LAST_KEY, JSON.stringify({ ...b, kind: 'crash', seen: Date.now() }));
        }
      }
    } catch {}
    const leave = () => { try { localStorage.removeItem(BOOT_KEY); } catch {} };
    const hide = () => { if (document.hidden) try { const raw = localStorage.getItem(BOOT_KEY); if (raw) localStorage.setItem(BOOT_KEY, JSON.stringify({ ...JSON.parse(raw), hidden: true })); } catch {} };
    addEventListener('pagehide', leave); document.addEventListener('visibilitychange', hide);
    return () => { leave(); removeEventListener('pagehide', leave); document.removeEventListener('visibilitychange', hide); };
  }, []);

  useEffect(() => {
    try { setName(localStorage.getItem('gamemog:name') ?? ''); } catch {}
    function onMessage(e: MessageEvent) {
      if (!ref.current || e.source !== ref.current.contentWindow) return;
      const d = e.data;
      if (!d || d.source !== 'gamemog' || d.gameId !== gameId) return;
      if (d.type === 'ready') {
        setLive(true); setLoaded(true);
        // (the dare's PLAY was tapped before the game was up: it starts now)
        if (playPending.current) { playPending.current = false; ref.current?.contentWindow?.postMessage({ source: 'gamemog-host', type: 'play' }, '*'); }
        return;
      }
      // a kart race's guard: how far its boot got, and what went wrong (the frame has no network: sent on from here)
      if (d.type === 'kart-step') {
        if (typeof d.step !== 'string') return;
        const step = d.step.slice(0, 60);
        setBootStep(step);
        try { localStorage.setItem(BOOT_KEY, JSON.stringify({ at: Date.now(), slug, step, info: d.info && typeof d.info === 'object' ? d.info : null })); } catch {}
        return;
      }
      if (d.type === 'kart-report') {
        if (!d.report || typeof d.report !== 'object') return;
        sendKartReport({ ...d.report, slug });
        try { localStorage.setItem(LAST_KEY, JSON.stringify({ at: Date.now(), slug, kind: String(d.report.kind ?? ''), step: String(d.report.step ?? ''), message: String(d.report.message ?? '').slice(0, 300), info: d.report })); } catch {}
        return;
      }
      if (d.type === 'kart-racer') { if (typeof d.racer === 'string' && /^[A-Za-z][A-Za-z .'-]{0,23}$/.test(d.racer)) try { localStorage.setItem('gamemog:kart:racer', d.racer); } catch {} return; }
      // a kart race asking, as it boots, for the racer kept here: a draft's preview (7 Oct) is not told it holds a
      // kart race, so it answers the race itself, the same as a published one
      if (d.type === 'kart-hello') {
        let racer = '';
        try { racer = localStorage.getItem('gamemog:kart:racer') ?? ''; } catch {}
        if (racer) ref.current?.contentWindow?.postMessage({ source: 'gamemog-host', type: 'kart-racer', racer }, '*');
        return;
      }
      if (d.type !== 'result') return;
      setResult({
        place: Number(d.place) || 0,
        timeMs: Number(d.timeMs) || 0,
        finished: !!d.finished,
        score: Number(d.score) || 0,
        won: !!d.won || Number(d.place) === 1,
        level: Number(d.level) || 0,
        gm: Number(d.gm) || 0,
        assisted: !!d.assisted,
        tempoReached: Number(d.tempoReached) || 0,
        locks: Number(d.locks) || 0,
        bestStreak: Number(d.bestStreak) || 0,
        // (a kart race's own; the scores route checks them)
        laps: Number(d.laps ?? d.level) || 0, hits: Math.max(0, Math.round(Number(d.hits) || 0)), estimated: d.estimated === true,
        progress: d.progress == null ? null : Number(d.progress), racer: typeof d.racer === 'string' ? d.racer : null,
        kos: Math.max(0, Math.round(Number(d.kos) || 0)), survival: !!d.survival, goal: !!d.goal,
        ...(d.karts != null ? { karts: Math.max(0, Math.round(Number(d.karts) || 0)) } : {}),
      });
      setSaved(false); setPosted(null);
      if (dareRef.current && d.finished) setEnded(true);
      // a finished, unassisted run on a published game is what "has played"
      // means: for distinct players, and for a Mog-off pick to count
      if (scores && d.finished && !d.assisted) {
        fetch('/api/plays', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ gameId, player: playerId(), level: Number(d.level) || undefined }) })
          .then(() => dispatchEvent(new CustomEvent('gamemog:run', { detail: { gameId } }))).catch(() => {});
        // the run a dare from this page carries (./share-dare.tsx), and, with a dare in context, its answer
        const run = pickRun(d);
        rememberRun(gameId, run);
        const dv = dareRef.current;
        if (dv) {
          fetch(`/api/dares/${encodeURIComponent(dv.id)}/result`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ visitor: playerId(), run }) })
            .then((r) => (r.ok ? r.json() : null)).then((o: DareOutcome | null) => { if (o?.you && dareRef.current === dv) setOutcome(o); }).catch(() => {});
        }
      }
    }
    addEventListener('message', onMessage);
    return () => removeEventListener('message', onMessage);
  }, [gameId, scores, slug]);

  // The dare: read from the address, loaded, and kept only when it is this game's (a published game's page only)
  useEffect(() => {
    if (!scores) return;
    const id = readDareId();
    if (!id) return;
    let gone = false;
    fetch(`/api/dares/${id}`).then((r) => (r.ok ? r.json() : null)).then((v: DareView | null) => {
      if (gone || !v || v.game?.id !== gameId) return;
      // (the dare's glass, app/glass.css with ./dare-overlay.tsx, loaded now: .gl-fill and .gl-pseudo live there)
      void import('./dare-overlay');
      dareRef.current = v; setDare(v);
    }).catch(() => {});
    return () => { gone = true; };
  }, [scores, gameId]);

  // With a dare: where the results go (inside the frame when it is full screen or big enough, else under it), and the
  // start. The landing's PLAY may have taken the whole document full screen (app/glass.css .gl-fill); then, or where
  // nothing can go full screen (an iPhone), the game is started as soon as it is up: that tap was the gesture. Else the
  // frame shows one gold PLAY, whose tap takes it full screen. Any start (that PLAY, the page's Play, Race again) is
  // the 'played' step and clears the last result.
  useEffect(() => {
    if (!dare) return;
    const el = box.current;
    const onFs = () => setFs(!!document.fullscreenElement);
    const size = () => { if (el) setFrameH(el.getBoundingClientRect().height); };
    onFs(); size();
    document.addEventListener('fullscreenchange', onFs);
    const ro = el && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(size) : null;
    if (el) ro?.observe(el);
    const onPlay = () => {
      setTap(false); setOutcome(null); setEnded(false);
      if (!canFullscreen(el)) setPseudo(true);
      if (!live) playPending.current = true;
      if (!started.current) { started.current = true; dareEvent(dare.id, 'played'); }
    };
    addEventListener('gamemog:play', onPlay);
    return () => { document.removeEventListener('fullscreenchange', onFs); ro?.disconnect(); removeEventListener('gamemog:play', onPlay); };
  }, [dare, live]);
  useEffect(() => {
    if (!dare || started.current) return;
    const canFs = canFullscreen(box.current);
    // (play=1: the landing's PLAY was the tap; app/g/[slug]/dare/[id]/page.tsx)
    const go = new URLSearchParams(location.search).get('play') === '1';
    if (go && (document.fullscreenElement || !canFs)) {
      if (!live) return;
      ref.current?.contentWindow?.postMessage({ source: 'gamemog-host', type: 'play' }, '*');
      track('play');
      started.current = true;
      dareEvent(dare.id, 'played');
      setTap(false);
      if (!canFs) setPseudo(true);
      ref.current?.focus();
      // (a reload does not start it again; the dare stays)
      try { const u = new URL(location.href); u.searchParams.delete('play'); history.replaceState(history.state, '', u.pathname + u.search + u.hash); } catch {}
    } else setTap(true);
  }, [dare, live]);
  const over = fs || pseudo || frameH >= 400;
  // (a phone's small frame: the result is a sheet just under it, brought into view)
  useEffect(() => { if (outcome && !over) sheet.current?.scrollIntoView({ block: 'nearest' }); }, [outcome, over]);
  const sendBack = () => dispatchEvent(new CustomEvent('gamemog:dare', { detail: { parent: dare?.id ?? null, run: lastRun(gameId) } }));
  const answer = dare && outcome
    ? <DareResult view={dare} outcome={outcome} mode={over ? 'over' : 'sheet'} compact={over && frameH < 560} onAgain={startPlay} onSendBack={sendBack} />
    : null;

  async function submit() {
    if (!result) return;
    try { localStorage.setItem('gamemog:name', name); } catch {}
    const res = await fetch('/api/scores', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ gameId, player: name || 'anon', ...result }),
    });
    if (!res.ok) return;
    setSaved(true);
    // a kart race: the score the route worked out, and where it landed, stay up while the board below catches up
    if (kart) {
      const j = await res.json().catch(() => null) as (Posted & { ok: boolean }) | null;
      if (j?.tier) setPosted({ score: j.score, tier: j.tier, rank: j.rank, review: j.review, best: j.best !== false });
      router.refresh();
      return;
    }
    location.reload();
  }
  // the run's score before it is posted, from the same file the route uses (the route's figure replaces it after)
  const preview = kart && kartScore && result ? KartScore.score({ ...result, racer: result.racer ? result.racer.toLowerCase() : null }, kartScore) : null;

  return (
    <div>
      {/* The world's own cover art holds the frame until the engine has drawn,
          the way Roblox shows a thumbnail before its video. A grey box here
          was the first thing every game page showed. */}
      {held && <KartDiagCard slug={slug} switches={diag.switches} onStart={() => setHeld(false)} />}
      <div id="play" ref={box} className={dare ? `gframe gl-fill${pseudo ? ' gl-pseudo' : ''}` : 'gframe'}>
        {src !== null && !held && <iframe
          ref={ref}
          src={src}
          sandbox="allow-scripts"
          allow="autoplay; fullscreen"
          title={`${slug}, game`}
          onLoad={() => setLoaded(true)}
        />}
        <div className="poster" data-hide={live ? '1' : '0'} aria-hidden>{poster}</div>
        {!live && stalled && (
          <p className="stall" role="status">
            {loaded ? 'The game has not started yet.' : 'The game has not loaded in this frame.'}{' '}
            {bootStep && `It got as far as: ${bootStep}.`}{' '}
            <a href={src ?? base} target="_blank" rel="noreferrer">Open it in its own tab</a>.
          </p>
        )}
        {dare && tap && !outcome && <DareStart view={dare} onPlay={startPlay} />}
        {over && answer}
        {pseudo && (ended || outcome) && <DareExit onExit={() => setPseudo(false)} />}
      </div>
      {!over && answer && <div ref={sheet}>{answer}</div>}
      {diag.switches.length > 0 && <p className="t-meta dim" style={{ marginTop: 6 }}>Diagnostics on: {diag.switches.join(', ')}. <a href={`/g/${slug}?kdiag=info`}>Device info</a></p>}
      {/* (a dare answered in the sheet under the frame is the one scoreboard on a phone: no second call to action) */}
      {scores && kart && result && result.finished && !result.assisted && (preview || posted) && !(!over && answer) && (
        <KartPanel result={result} score={posted?.score ?? preview!.total} tier={posted?.tier ?? preview!.tier} gmOn={(kartScore?.gmCap ?? 1) > 0} provisional={!!kartScore && !kartMeasured(kartScore)}>
          {posted
            ? <span className="t-meta dim" role="status">{posted.review ? 'Posted, under review: faster than this track\'s perfect-run time.' : posted.rank ? (posted.best ? `Posted. Ranked #${posted.rank} on the leaderboard.` : `Posted. Your best run keeps you #${posted.rank} on the leaderboard.`) : 'Posted.'}</span>
            : <>
                <input
                  type="text" value={name} placeholder="your name"
                  onChange={(e) => setName(e.target.value.slice(0, 16))}
                  style={{ width: 170, flex: '1 1 140px', maxWidth: 220 }}
                />
                <button className="btn" onClick={submit}>Post to leaderboard</button>
              </>}
        </KartPanel>
      )}
      {scores && !(kart && (preview || posted)) && result && result.finished && !saved && !result.assisted && !(!over && answer) && (
        <div className="panel" style={{ marginTop: 12, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <b style={{ fontSize: 20, fontWeight: 700, lineHeight: '28px' }}>
            {kart
              ? `${result.won ? 'You won' : result.place ? `${result.place}${['st','nd','rd'][result.place - 1] ?? 'th'} place` : 'Race over'} · ${raceClock(result.timeMs)}${result.gm ? ` · ${result.gm} GM` : ''}`
              : result.level
              ? `Level ${result.level} · ${result.gm} GM`
              : <>
                  {result.won ? 'You won' : result.place ? `${result.place}${['st','nd','rd'][result.place - 1] ?? 'th'} place` : 'Run over'}
                  {result.score ? ` · ${result.score.toLocaleString()} pts` : ''}
                  {result.timeMs ? ` · ${(result.timeMs / 1000).toFixed(2)}s` : ''}
                </>}
          </b>
          <input
            type="text" value={name} placeholder="your name"
            onChange={(e) => setName(e.target.value.slice(0, 16))}
            style={{ width: 170, flex: '0 1 auto' }}
          />
          <button className="btn" onClick={submit}>Post to leaderboard</button>
        </div>
      )}
    </div>
  );
}

/**
 * A finished kart race, under the frame: the run (place, time, GM, enemies hit), then its score as a big number with
 * its tier and the bar toward 10,000, then the name and the post button (or, once posted, where it landed). Static:
 * the count-up is the game's own results screen.
 */
// (provisional: the track's perfect times are not measured yet, as the board says: lib/kart-score.ts kartMeasured)
function KartPanel({ result, score, tier, gmOn, provisional = false, children }: { result: Result; score: number; tier: KartTier; gmOn: boolean; provisional?: boolean; children: React.ReactNode }) {
  const est = !!result.estimated;
  const run = [est ? 'Race called' : result.place === 1 ? 'You won' : result.place ? `${ordinal(result.place)} place` : 'Race over', `${est ? '~' : ''}${raceClock(result.timeMs)}`,
    gmOn ? `${result.gm} GM` : '', `${result.hits ?? 0} ${result.hits === 1 ? 'hit' : 'hits'}`].filter(Boolean).join(' · ');
  return (
    <div className="panel" style={{ marginTop: 12, display: 'grid', gap: 10 }}>
      <span className="t-meta dim" style={{ fontVariantNumeric: 'tabular-nums' }}>{run}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <b style={{ fontSize: 34, fontWeight: 800, lineHeight: '36px', fontVariantNumeric: 'tabular-nums', letterSpacing: '-.01em' }}>{score.toLocaleString('en-US')}</b>
        <TierChip tier={tier} dnf={est} size={13} />
        <span className="t-meta dim-2">out of 10,000{provisional ? ' · provisional' : ''}</span>
      </div>
      <div style={{ maxWidth: 420 }}><ScoreBar score={score} tier={tier} height={6} /></div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 2 }}>{children}</div>
    </div>
  );
}

/**
 * The page's Play (./actions.tsx), the dare's PLAY and the results' Race again: take the embedded game full screen and
 * ask it for its start screen (until then the world only races itself, with nothing over it). The frame stays in this
 * page, so the finished race can still post its result. Then tells the frame's page ('gamemog:play'), for a dare.
 */
export function startPlay() {
  const box = document.getElementById('play');
  const frame = box?.querySelector('iframe');
  frame?.contentWindow?.postMessage({ source: 'gamemog-host', type: 'play' }, '*');
  track('play');
  if (box?.requestFullscreen) box.requestFullscreen().catch(() => box.scrollIntoView({ block: 'center' }));
  else box?.scrollIntoView({ block: 'center' });
  frame?.focus();
  dispatchEvent(new CustomEvent('gamemog:play'));
}

/** Whether this element can go full screen (an iPhone's cannot: only a video can). */
const canFullscreen = (el: HTMLElement | null) => !!document.fullscreenEnabled && typeof el?.requestFullscreen === 'function';

/** A dare's id from the page's address (?dare=), as lib/dare.ts validDareId reads it. */
function readDareId(): string | null {
  try { const v = new URLSearchParams(location.search).get('dare'); return v && /^[A-Za-z0-9_-]{10}$/.test(v) ? v : null; } catch { return null; }
}

/** A dare's funnel step from this page (app/api/dares/[id]/event/route.ts). Quiet: never breaks the page. */
export function dareEvent(id: string, kind: 'opened' | 'played' | 'shared' | 'mogged_back') {
  fetch(`/api/dares/${encodeURIComponent(id)}/event`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ visitor: playerId(), kind }), keepalive: true }).catch(() => {});
}

/** The parts of a result message a dare keeps (lib/custom-game.ts hostScript finish(); lib/dare.ts checkRun reads them). */
const RUN_KEYS = ['finished', 'won', 'place', 'timeMs', 'score', 'level', 'gm', 'survival', 'kos', 'goal', 'assisted',
  'kart', 'laps', 'hits', 'karts', 'estimated', 'progress', 'racer', 'scoreV'] as const;
function pickRun(d: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of RUN_KEYS) if (d[k] !== undefined && (typeof d[k] !== 'string' || (d[k] as string).length <= 24)) out[k] = d[k];
  return out;
}
/** This browser's last finished, unassisted run on each game (the newest 20 games), for the dares it sends. */
const RUNS_KEY = 'gamemog:dare-runs';
function rememberRun(gameId: string, run: Record<string, unknown>) {
  try {
    const all = JSON.parse(localStorage.getItem(RUNS_KEY) ?? '{}') as Record<string, { at: number; run: Record<string, unknown> }>;
    all[gameId] = { at: Date.now(), run };
    const keep = Object.entries(all).sort((a, b) => b[1].at - a[1].at).slice(0, 20);
    localStorage.setItem(RUNS_KEY, JSON.stringify(Object.fromEntries(keep)));
  } catch {}
}
export function lastRun(gameId: string): Record<string, unknown> | null {
  try { return (JSON.parse(localStorage.getItem(RUNS_KEY) ?? '{}') as Record<string, { run?: Record<string, unknown> }>)[gameId]?.run ?? null; } catch { return null; }
}

/** The one way a kart race's report leaves (where its running boot is kept: ./kart-diag.tsx, KART_BOOT_KEY). */
function sendKartReport(r: Record<string, unknown>) {
  try {
    const body = JSON.stringify(r);
    if (body.length <= 4096) fetch('/api/kart-report', { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true }).catch(() => {});
  } catch {}
}
