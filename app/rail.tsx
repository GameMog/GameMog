'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

/**
 * A catalogue section in GameStop's anatomy (docs/design/premium.md): a display
 * title and a grey subtitle on the left, two square arrows on the right, any
 * controls (tab chips) under the title, the rail of cards, and an underlined
 * "View all" under the rail's end. Without a title it is just the rail.
 *
 * The arrows appear only when the rail overflows, and each is live only when
 * there is more to see that way. Scrolling is a native smooth scroll of most
 * of a rail's width; nothing here animates on its own.
 */
export function Rail({ children, title, sub, more, controls }: {
  children: React.ReactNode;
  title?: React.ReactNode;
  sub?: React.ReactNode;
  more?: { href: string; label: string };
  controls?: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState({ left: false, right: false });

  function measure() {
    const el = ref.current;
    if (!el) return;
    setAt({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
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

  const rail = <div className="rail" ref={ref} onScroll={measure}>{children}</div>;
  if (!title) return <div className="railwrap">{rail}</div>;
  return (
    <section className="sec">
      <div className="sechead">
        <div className="sectext">
          <h2 className="sectitle">{title}</h2>
          {sub && <p className="secsub">{sub}</p>}
        </div>
        {(at.left || at.right) && (
          <div className="arrows">
            <button className="arrow" disabled={!at.left} onClick={() => page(-1)} aria-label="Scroll left"><Chevron dir="l" /></button>
            <button className="arrow" disabled={!at.right} onClick={() => page(1)} aria-label="Scroll right"><Chevron dir="r" /></button>
          </div>
        )}
      </div>
      {controls && <div className="seccontrols">{controls}</div>}
      <div className="railwrap">{rail}</div>
      {more && (
        <div className="secfoot">
          <Link href={more.href} className="viewmore">{more.label} <span aria-hidden>›</span></Link>
        </div>
      )}
    </section>
  );
}

function Chevron({ dir }: { dir: 'l' | 'r' }) {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
      <path d={dir === 'l'
        ? 'M12.7 3.5a1 1 0 010 1.5L7.6 10l5.1 5a1 1 0 11-1.4 1.5l-5.8-5.7a1 1 0 010-1.5l5.8-5.8a1 1 0 011.4 0z'
        : 'M7.3 3.5a1 1 0 000 1.5l5.1 5-5.1 5a1 1 0 101.4 1.5l5.8-5.7a1 1 0 000-1.5L8.7 3.5a1 1 0 00-1.4 0z'} />
    </svg>
  );
}
