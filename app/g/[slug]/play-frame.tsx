'use client';
import { useEffect, useRef, useState } from 'react';

type Result = {
  place: number; timeMs: number; finished: boolean;
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
export function PlayFrame({ slug, gameId, poster }: { slug: string; gameId: string; poster: React.ReactNode }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [name, setName] = useState('');
  const [saved, setSaved] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [live, setLive] = useState(false);
  const [stalled, setStalled] = useState(false);

  // A frame that never loads is a real state, not an edge case: privacy
  // extensions and some embedded browsers refuse third-party frames outright.
  // After a generous window we say so and hand them the direct link.
  useEffect(() => {
    if (loaded) return;
    const t = setTimeout(() => setStalled(true), 9000);
    return () => clearTimeout(t);
  }, [loaded]);

  useEffect(() => {
    try { setName(localStorage.getItem('gamemog:name') ?? ''); } catch {}
    function onMessage(e: MessageEvent) {
      if (!ref.current || e.source !== ref.current.contentWindow) return;
      const d = e.data;
      if (!d || d.source !== 'gamemog' || d.gameId !== gameId) return;
      if (d.type === 'ready') { setLive(true); return; }
      if (d.type !== 'result') return;
      setResult({
        place: Number(d.place) || 0,
        timeMs: Number(d.timeMs) || 0,
        finished: !!d.finished,
        tempoReached: Number(d.tempoReached) || 0,
        locks: Number(d.locks) || 0,
        bestStreak: Number(d.bestStreak) || 0,
      });
      setSaved(false);
    }
    addEventListener('message', onMessage);
    return () => removeEventListener('message', onMessage);
  }, [gameId]);

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
          src={`/g/${slug}/play`}
          sandbox="allow-scripts"
          allow="autoplay; fullscreen"
          title={`${slug}, game`}
          onLoad={() => setLoaded(true)}
        />
        <div className="poster" data-hide={live ? '1' : '0'} aria-hidden>{poster}</div>
        {!loaded && stalled && (
          <p className="stall" role="status">
            This browser is blocking the embedded game.{' '}
            <a href={`/g/${slug}/play`} target="_blank" rel="noreferrer">Open it in a new tab</a>.
          </p>
        )}
      </div>
      {result && result.finished && !saved && (
        <div className="panel" style={{ marginTop: 12, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <b style={{ fontSize: 20, fontWeight: 700, lineHeight: '28px' }}>
            {result.place === 1 ? 'You won' : `${result.place}${['st','nd','rd'][result.place - 1] ?? 'th'} place`} · {(result.timeMs / 1000).toFixed(2)}s
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
