'use client';
import { useEffect, useRef, useState } from 'react';

export type Film = { wide: string; narrow: string };

const PHONE = '(max-width: 899px)';

/**
 * The featured world, playing: real gameplay recorded from the world's own
 * canvas (scripts/media/record-hero.ts), not a render or a trailer.
 *
 * The poster is the film's first frame and is in the HTML, chosen by the same
 * breakpoint as the film, so the hero is right before any script runs and
 * nothing jumps when playback starts. Phones get a 4:3 cut framed on the
 * runner; wider screens get the 8:3 cut. With reduced motion the poster stays.
 * The film pauses while it is scrolled out of view.
 */
export function HeroFilm({ film }: { film: Film }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    const phone = matchMedia(PHONE), still = matchMedia('(prefers-reduced-motion: reduce)');
    const pick = () => setSrc(still.matches ? null : phone.matches ? film.narrow : film.wide);
    pick();
    phone.addEventListener('change', pick); still.addEventListener('change', pick);
    return () => { phone.removeEventListener('change', pick); still.removeEventListener('change', pick); };
  }, [film]);

  useEffect(() => {
    const v = ref.current;
    if (!v || !src) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) v.play().catch(() => {}); else v.pause(); });
    io.observe(v);
    return () => io.disconnect();
  }, [src]);

  return (
    <div className="film" aria-hidden>
      <picture>
        <source media={PHONE} srcSet={`${film.narrow}.jpg`} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`${film.wide}.jpg`} alt="" />
      </picture>
      {src && <video ref={ref} key={src} src={`${src}.mp4`} poster={`${src}.jpg`} autoPlay muted loop playsInline preload="auto" />}
    </div>
  );
}
