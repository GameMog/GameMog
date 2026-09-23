'use client';
import { useState } from 'react';

export function MediaCarousel({ slides }: { slides: { label: string; content: React.ReactNode }[] }) {
  const [active, setActive] = useState(0);
  const move = (delta: number) => setActive((active + delta + slides.length) % slides.length);
  return (
    <div className="media-carousel" aria-label="Game media">
      <div className="media-stage">
        {slides.map((slide, index) => (
          <div key={slide.label} className={`media-slide${index === active ? ' on' : ''}`} aria-hidden={index !== active}>
            {slide.content}
          </div>
        ))}
        {slides.length > 1 && (
          <>
            <button className="media-arrow left" onClick={() => move(-1)} aria-label="Previous media"><Chevron direction="left" /></button>
            <button className="media-arrow right" onClick={() => move(1)} aria-label="Next media"><Chevron direction="right" /></button>
          </>
        )}
      </div>
      {slides.length > 1 && <p className="media-count">{active + 1} of {slides.length}: {slides[active].label}</p>}
    </div>
  );
}

function Chevron({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg width="22" height="22" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
      <path d={direction === 'left' ? 'M12.7 3.5a1 1 0 010 1.5L7.6 10l5.1 5a1 1 0 11-1.4 1.5l-5.8-5.7a1 1 0 010-1.5l5.8-5.8a1 1 0 011.4 0z' : 'M7.3 3.5a1 1 0 000 1.5l5.1 5-5.1 5a1 1 0 101.4 1.5l5.8-5.7a1 1 0 000-1.5L8.7 3.5a1 1 0 00-1.4 0z'} />
    </svg>
  );
}
