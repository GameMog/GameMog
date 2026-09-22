'use client';
import { useEffect, useRef, useState } from 'react';

/**
 * The flagship, running live.
 *
 * There is no skeleton here on purpose. The world's cover art is drawn on the
 * server from the same WorldSpec the engine is about to run, so it is in the
 * HTML before the frame has even been requested. A grey box standing in for a
 * picture we already have would be a downgrade, not a loading state.
 *
 * The poster holds until the engine posts `ready`, meaning it has drawn a
 * frame. If the frame never boots, the poster stays and the hero still looks
 * like the game.
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
        title={`${slug}, playing`}
      />
      <div className="poster" data-hide={live ? '1' : '0'} aria-hidden>{poster}</div>
    </div>
  );
}
