'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Point } from '@/lib/analytics';
import { DRAW, SNAP, Spring, drive } from './motion';

const H = 240, PAD = { l: 40, r: 14, t: 18, b: 30 };

/** 1, 2, 2.5 or 5 times a power of ten, at or above the busiest point. */
function niceMax(v: number) {
  if (v <= 4) return 4;
  const step = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * step >= v) return m * step;
  return 10 * step;
}

export const bucketLabel = (at: number, bucket: 'hour' | 'day') =>
  bucket === 'hour'
    ? new Date(at).toLocaleTimeString('en-US', { hour: 'numeric' })
    : new Date(at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/**
 * Visitors and page views over the range. The lines draw themselves from the
 * left whenever the range changes; hovering (or dragging a finger) rides a
 * hairline and a tooltip along the points on a spring.
 */
export function LineChart({ points, bucket, k }: { points: Point[]; bucket: 'hour' | 'day'; k: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const a = useRef<SVGPathElement>(null), b = useRef<SVGPathElement>(null), clip = useRef<SVGRectElement>(null);
  const hair = useRef<SVGGElement>(null), tip = useRef<HTMLDivElement>(null);
  const draw = useRef(new Spring(0, DRAW, 0.001));
  const hx = useRef<Spring | null>(null), hy = useRef<Spring | null>(null), hv = useRef(new Spring(0, SNAP));

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const n = points.length, max = niceMax(Math.max(...points.map((p) => p.views), 0));
  const x = (i: number) => PAD.l + (n <= 1 ? 0 : (i / (n - 1)) * (w - PAD.l - PAD.r));
  const y = (v: number) => PAD.t + (1 - v / max) * (H - PAD.t - PAD.b);
  const path = (key: 'visitors' | 'views') => points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p[key]).toFixed(1)}`).join(' ');
  const empty = points.every((p) => p.views === 0);

  // draw on every new range, once the width is known
  useLayoutEffect(() => {
    if (!w) return;
    const s = draw.current.jump(0).to(1, DRAW);
    return drive([s], () => {
      const p = s.x;
      a.current?.style.setProperty('stroke-dashoffset', String(1 - p));
      b.current?.style.setProperty('stroke-dashoffset', String(1 - Math.max(0, Math.min(1, p * 1.12 - 0.12))));
      clip.current?.setAttribute('width', String(Math.max(0, p * w)));
    });
  }, [k, w > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  // the hairline and tooltip follow the nearest point
  useLayoutEffect(() => {
    const g = hair.current, t = tip.current;
    if (!g || !t || !w) return;
    const on = hover !== null;
    const i = hover ?? Math.max(0, n - 1);
    const tx = x(i), ty = y(points[i]?.visitors ?? 0);
    if (!hx.current || !hy.current) { hx.current = new Spring(tx); hy.current = new Spring(ty); }
    if (hv.current.target === 0 && on) { hx.current.jump(tx); hy.current.jump(ty); } else { hx.current.to(tx, SNAP); hy.current.to(ty, SNAP); }
    hv.current.to(on ? 1 : 0, SNAP);
    return drive([hx.current, hy.current, hv.current], () => {
      const X = hx.current!.x, Y = hy.current!.x, v = hv.current.x;
      g.setAttribute('transform', `translate(${X.toFixed(2)} 0)`);
      g.style.opacity = String(v);
      g.querySelector('circle')?.setAttribute('cy', Y.toFixed(2));
      const tw = t.offsetWidth;
      t.style.transform = `translate(${Math.max(0, Math.min(w - tw, X - tw / 2)).toFixed(1)}px, 0)`;
      t.style.opacity = String(v);
      t.style.filter = v < 0.99 ? `blur(${((1 - v) * 5).toFixed(2)}px)` : 'none';
    });
  }, [hover, w, k]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (e: React.PointerEvent) => {
    const r = (e.currentTarget as SVGElement).getBoundingClientRect();
    const f = (e.clientX - r.left - PAD.l) / Math.max(1, w - PAD.l - PAD.r);
    setHover(Math.max(0, Math.min(n - 1, Math.round(f * (n - 1)))));
  };

  const ticks = n > 1 ? [...new Set([0, Math.round((n - 1) / 4), Math.round((n - 1) / 2), Math.round((3 * (n - 1)) / 4), n - 1])] : [0];
  const hp = points[hover ?? Math.max(0, n - 1)];

  return (
    <div ref={wrap} className="chart">
      {w > 0 && (
        <svg width={w} height={H} onPointerMove={pick} onPointerDown={pick} onPointerLeave={() => setHover(null)} role="img"
          aria-label={`Visitors and page views by ${bucket}`}>
          <defs><clipPath id="chart-reveal"><rect ref={clip} x="0" y="0" width="0" height={H} /></clipPath></defs>
          {[0, max / 2, max].map((v) => (
            <g key={v}>
              <line x1={PAD.l} x2={w - PAD.r} y1={y(v)} y2={y(v)} className="grid" />
              <text x={PAD.l - 10} y={y(v) + 4} textAnchor="end" className="ax">{v.toLocaleString('en-US')}</text>
            </g>
          ))}
          {ticks.map((i) => <text key={i} x={x(i)} y={H - 8} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'} className="ax">{bucketLabel(points[i].at, bucket)}</text>)}
          <path d={`${path('visitors')} L${x(n - 1)} ${y(0)} L${x(0)} ${y(0)} Z`} className="area" clipPath="url(#chart-reveal)" />
          <path ref={b} d={path('views')} pathLength={1} strokeDasharray="1" className="ln views" />
          <path ref={a} d={path('visitors')} pathLength={1} strokeDasharray="1" className="ln visitors" />
          <g ref={hair} style={{ opacity: 0 }}>
            <line x1={0} x2={0} y1={PAD.t} y2={H - PAD.b} className="hair" />
            <circle cx={0} cy={0} r={4.5} className="dot" />
          </g>
        </svg>
      )}
      {empty && w > 0 && <p className="chart-empty">No visits in this range yet.</p>}
      <div ref={tip} className="tip" style={{ opacity: 0 }} aria-hidden>
        {hp && <><b>{bucketLabel(hp.at, bucket)}</b><span><i className="k visitors" />Visitors {hp.visitors.toLocaleString('en-US')}</span><span><i className="k views" />Page views {hp.views.toLocaleString('en-US')}</span></>}
      </div>
    </div>
  );
}
