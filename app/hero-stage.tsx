'use client';
import { useEffect, useRef, useState } from 'react';

/**
 * The flagship, running live.
 *
 * It boots the real game in a sandboxed frame, but holds the world's own cover
 * art over the top until the engine says it has drawn a frame. Without that the
 * hero is a blank box for as long as three.js takes to arrive — which is
 * exactly the moment a visitor decides whether this is a real product.
 *
 * If the frame never boots (no network, WebGL unavailable, a blocked embed) the
 * poster simply stays, and the hero still looks like the game.
 */
export function HeroStage({
  slug, gameId, poster,
}: { slug: string; gameId: string; poster: React.ReactNode }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (!ref.current || e.source !== ref.current.contentWindow) return;
      const d = e.data;
      if (d?.source === 'gamemog' && d.type === 'ready' && d.gameId === gameId) setLive(true);
    }
    addEventListener('message', onMessage);
    return () => removeEventListener('message', onMessage);
  }, [gameId]);

  return (
    <div className="stage">
      <span className="live" data-on={live ? '1' : '0'}>
        <i />{live ? 'LIVE' : 'LOADING'}
      </span>
      <iframe
        ref={ref}
        src={`/g/${slug}/play`}
        sandbox="allow-scripts"
        title={`${slug} — playing`}
      />
      <div className="poster" data-hide={live ? '1' : '0'} aria-hidden={live}>
        {poster}
      </div>
    </div>
  );
}
