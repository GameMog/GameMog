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
export function PlayFrame({ slug, gameId }: { slug: string; gameId: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [name, setName] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try { setName(localStorage.getItem('gamemog:name') ?? ''); } catch {}
    function onMessage(e: MessageEvent) {
      if (!ref.current || e.source !== ref.current.contentWindow) return;
      const d = e.data;
      if (!d || d.source !== 'gamemog' || d.type !== 'result') return;
      if (d.gameId !== gameId) return;
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
    <>
      <iframe
        ref={ref}
        className="frame"
        src={`/g/${slug}/play`}
        sandbox="allow-scripts"
        allow="autoplay"
        title="game"
      />
      {result && result.finished && !saved && (
        <div className="card" style={{ marginTop: 12, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <b className="display" style={{ fontSize: 18 }}>
            {result.place === 1 ? 'You won' : `${result.place}${['st','nd','rd'][result.place - 1] ?? 'th'} place`} — {(result.timeMs / 1000).toFixed(2)}s
          </b>
          <input
            type="text" value={name} placeholder="your name"
            onChange={(e) => setName(e.target.value.slice(0, 16))}
            style={{ width: 160 }}
          />
          <button className="btn sm" onClick={submit}>Post to leaderboard</button>
        </div>
      )}
    </>
  );
}
