'use client';
import { useEffect, useRef, useState } from 'react';
import { playerId } from '../../anon';

type Result = {
  place: number; timeMs: number; finished: boolean; score: number; won: boolean; level: number; gm: number; assisted: boolean;
  tempoReached: number; locks: number; bestStreak: number;
};

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
export function PlayFrame({ slug, gameId, poster, src = `/g/${slug}/play`, scores = true }: {
  slug: string; gameId: string; poster: React.ReactNode; src?: string;
  /** Off for drafts: a run in a preview has no leaderboard to post to. */
  scores?: boolean;
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [name, setName] = useState('');
  const [saved, setSaved] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [live, setLive] = useState(false);
  const [stalled, setStalled] = useState(false);

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

  // A game that never answers is a real state: some extensions and embedded
  // browsers refuse frames outright, and a broken game never boots. After a
  // generous wait we say so plainly and offer the direct link.
  useEffect(() => {
    if (live) return;
    const t = setTimeout(() => setStalled(true), 15000);
    return () => clearTimeout(t);
  }, [live]);

  useEffect(() => {
    try { setName(localStorage.getItem('gamemog:name') ?? ''); } catch {}
    function onMessage(e: MessageEvent) {
      if (!ref.current || e.source !== ref.current.contentWindow) return;
      const d = e.data;
      if (!d || d.source !== 'gamemog' || d.gameId !== gameId) return;
      if (d.type === 'ready') { setLive(true); setLoaded(true); return; }
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
      });
      setSaved(false);
      // a finished, unassisted run on a published game is what "has played"
      // means: for distinct players, and for a Mog-off pick to count
      if (scores && d.finished && !d.assisted) {
        fetch('/api/plays', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ gameId, player: playerId(), level: Number(d.level) || undefined }) })
          .then(() => dispatchEvent(new CustomEvent('gamemog:run', { detail: { gameId } }))).catch(() => {});
      }
    }
    addEventListener('message', onMessage);
    return () => removeEventListener('message', onMessage);
  }, [gameId, scores]);

  async function submit() {
    if (!result) return;
    try { localStorage.setItem('gamemog:name', name); } catch {}
    const res = await fetch('/api/scores', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ gameId, player: name || 'anon', ...result }),
    });
    if (res.ok) { setSaved(true); location.reload(); }
  }

  return (
    <div>
      {/* The world's own cover art holds the frame until the engine has drawn,
          the way Roblox shows a thumbnail before its video. A grey box here
          was the first thing every game page showed. */}
      <div id="play" className="gframe">
        <iframe
          ref={ref}
          src={src}
          sandbox="allow-scripts"
          allow="autoplay; fullscreen"
          title={`${slug}, game`}
          onLoad={() => setLoaded(true)}
        />
        <div className="poster" data-hide={live ? '1' : '0'} aria-hidden>{poster}</div>
        {!live && stalled && (
          <p className="stall" role="status">
            {loaded ? 'The game has not started yet.' : 'The game has not loaded in this frame.'}{' '}
            <a href={src} target="_blank" rel="noreferrer">Open it in its own tab</a>.
          </p>
        )}
      </div>
      {scores && result && result.finished && !saved && !result.assisted && (
        <div className="panel" style={{ marginTop: 12, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <b style={{ fontSize: 20, fontWeight: 700, lineHeight: '28px' }}>
            {result.level
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
