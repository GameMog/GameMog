'use client';
import { useEffect, useRef, useState } from 'react';
import { playerId } from '../../anon';
import { useMe } from '../../me-store';
import { meFragment, YOU_IN_GAMES } from '@/lib/me';
import { useRouter } from 'next/navigation';
import { KartScore, ordinal, raceClock, type KartConstants, type KartTier } from '@/lib/kart-score';
import { TierChip, ScoreBar } from './kart-score-ui';

type Result = {
  place: number; timeMs: number; finished: boolean; score: number; won: boolean; level: number; gm: number; assisted: boolean;
  tempoReached: number; locks: number; bestStreak: number;
  // a kart race's (8 Oct): its laps, enemies hit, whether the race was called before the finish and the share driven,
  // and the racer's id (each racer has its own perfect time)
  laps?: number; hits?: number; estimated?: boolean; progress?: number | null; racer?: string | null;
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
export function PlayFrame({ slug, gameId, poster, src: base = `/g/${slug}/play`, scores = true, you: wantsYou = false, kart = false, kartScore = null }: {
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
}) {
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
    if (live) return;
    const t = setTimeout(() => setStalled(true), 15000);
    return () => clearTimeout(t);
  }, [live]);

  // A kart race's boot that took the whole tab down (8 Oct): its last step is kept here while it runs and dropped when
  // the page is left; still here the next time a game page opens means the page died, and that is reported once
  useEffect(() => {
    try {
      const raw = localStorage.getItem(BOOT_KEY);
      if (raw) {
        localStorage.removeItem(BOOT_KEY);
        const b = JSON.parse(raw) as { at?: number; slug?: string; step?: string; info?: Record<string, unknown>; hidden?: boolean };
        if (b && typeof b.at === 'number' && Date.now() - b.at < 86400_000) sendKartReport({ ...(b.info ?? {}), kind: 'crash', slug: b.slug, step: b.step, hidden: !!b.hidden });
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
      if (d.type === 'ready') { setLive(true); setLoaded(true); return; }
      // a kart race's guard: how far its boot got, and what went wrong (the frame has no network: sent on from here)
      if (d.type === 'kart-step') {
        if (typeof d.step !== 'string') return;
        const step = d.step.slice(0, 60);
        setBootStep(step);
        try { localStorage.setItem(BOOT_KEY, JSON.stringify({ at: Date.now(), slug, step, info: d.info && typeof d.info === 'object' ? d.info : null })); } catch {}
        return;
      }
      if (d.type === 'kart-report') { if (d.report && typeof d.report === 'object') sendKartReport({ ...d.report, slug }); return; }
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
      });
      setSaved(false); setPosted(null);
      // a finished, unassisted run on a published game is what "has played"
      // means: for distinct players, and for a Mog-off pick to count
      if (scores && d.finished && !d.assisted) {
        fetch('/api/plays', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ gameId, player: playerId(), level: Number(d.level) || undefined }) })
          .then(() => dispatchEvent(new CustomEvent('gamemog:run', { detail: { gameId } }))).catch(() => {});
      }
    }
    addEventListener('message', onMessage);
    return () => removeEventListener('message', onMessage);
  }, [gameId, scores, slug]);

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
      <div id="play" className="gframe">
        {src !== null && <iframe
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
      </div>
      {scores && kart && result && result.finished && !result.assisted && (preview || posted) && (
        <KartPanel result={result} score={posted?.score ?? preview!.total} tier={posted?.tier ?? preview!.tier} gmOn={(kartScore?.gmCap ?? 1) > 0}>
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
      {scores && !(kart && (preview || posted)) && result && result.finished && !saved && !result.assisted && (
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
function KartPanel({ result, score, tier, gmOn, children }: { result: Result; score: number; tier: KartTier; gmOn: boolean; children: React.ReactNode }) {
  const est = !!result.estimated;
  const run = [est ? 'Race called' : result.place === 1 ? 'You won' : result.place ? `${ordinal(result.place)} place` : 'Race over', `${est ? '~' : ''}${raceClock(result.timeMs)}`,
    gmOn ? `${result.gm} GM` : '', `${result.hits ?? 0} ${result.hits === 1 ? 'hit' : 'hits'}`].filter(Boolean).join(' · ');
  return (
    <div className="panel" style={{ marginTop: 12, display: 'grid', gap: 10 }}>
      <span className="t-meta dim" style={{ fontVariantNumeric: 'tabular-nums' }}>{run}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <b style={{ fontSize: 34, fontWeight: 800, lineHeight: '36px', fontVariantNumeric: 'tabular-nums', letterSpacing: '-.01em' }}>{score.toLocaleString('en-US')}</b>
        <TierChip tier={tier} dnf={est} size={13} />
        <span className="t-meta dim-2">out of 10,000</span>
      </div>
      <div style={{ maxWidth: 420 }}><ScoreBar score={score} tier={tier} height={6} /></div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 2 }}>{children}</div>
    </div>
  );
}

/** Where a kart race's running boot is kept (see the crash effect in PlayFrame), and the one way a report leaves. */
const BOOT_KEY = 'gamemog:kart:boot';
function sendKartReport(r: Record<string, unknown>) {
  try {
    const body = JSON.stringify(r);
    if (body.length <= 4096) fetch('/api/kart-report', { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true }).catch(() => {});
  } catch {}
}
