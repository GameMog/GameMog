'use client';
import { useEffect, useRef, useState } from 'react';

/**
 * A horizontal shelf with arrows at the ends, which is how Roblox moves a rail.
 *
 * The arrows are rendered only when the row actually overflows, and only on
 * the side there is more to see, so they report the state of the shelf rather
 * than decorating it. Scrolling is a native smooth scroll of one viewport
 * width; nothing here animates on its own.
 */
export function Rail({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState({ left: false, right: false });

  function measure() {
    const el = ref.current;
    if (!el) return;
    setAt({
      left: el.scrollLeft > 4,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4,
    });
  }

  useEffect(() => {
    measure();
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const page = (dir: -1 | 1) => {
    const el = ref.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.9, behavior: 'smooth' });
  };

  return (
    <div className="railwrap">
      {at.left && (
        <button className="railbtn l" onClick={() => page(-1)} aria-label="Scroll left">
          <Chevron dir="l" />
        </button>
      )}
      <div className="rail" ref={ref} onScroll={measure}>{children}</div>
      {at.right && (
        <button className="railbtn r" onClick={() => page(1)} aria-label="Scroll right">
          <Chevron dir="r" />
        </button>
      )}
    </div>
  );
}

function Chevron({ dir }: { dir: 'l' | 'r' }) {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
      <path d={dir === 'l'
        ? 'M12.7 3.5a1 1 0 010 1.5L7.6 10l5.1 5a1 1 0 11-1.4 1.5l-5.8-5.7a1 1 0 010-1.5l5.8-5.8a1 1 0 011.4 0z'
        : 'M7.3 3.5a1 1 0 000 1.5l5.1 5-5.1 5a1 1 0 101.4 1.5l5.8-5.7a1 1 0 000-1.5L8.7 3.5a1 1 0 00-1.4 0z'} />
    </svg>
  );
}
