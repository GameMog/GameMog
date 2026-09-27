'use client';
import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Film } from './hero-film';

/** A film in the reel: its cut, how much of it plays (all of it unless `seconds`), and where Play goes. */
export type ReelClip = { film: Film; seconds?: number; href: string; title: string };

const PHONE = '(max-width: 899px)';
/** The dissolve between films, in seconds. */
const FADE = 1.1;

/**
 * The homepage hero as a reel (the owner, 27 Sep): several worlds' gameplay
 * films in turn, each dissolving into the next, round and round. Every film is
 * real gameplay recorded from its world's canvas (scripts/media/record-hero.ts).
 *
 * Two videos lie one over the other. While one plays, the next loads under it;
 * a moment before the playing film's cut ends, the next starts beneath and the
 * top one fades away over it, so the two blend frame by frame. The copy and the
 * buttons follow the world on screen, changing at the middle of the dissolve.
 * The design contract has no CSS transitions, so the fades are drawn here, a
 * frame at a time. With reduced motion the first film's poster stays, and the
 * reel pauses while it is scrolled out of view.
 */
export function HeroReel({ clips, headline, leads, cards }: { clips: ReelClip[]; headline: ReactNode; leads: ReactNode[]; cards: ReactNode[] }) {
  const a = useRef<HTMLVideoElement>(null), b = useRef<HTMLVideoElement>(null);
  const section = useRef<HTMLElement>(null), copy = useRef<HTMLDivElement>(null), card = useRef<HTMLDivElement>(null);
  const [cut, setCut] = useState<'wide' | 'narrow' | null>(null);
  const [on, setOn] = useState(0);
  const first = clips[0].film;

  useEffect(() => {
    const phone = matchMedia(PHONE), still = matchMedia('(prefers-reduced-motion: reduce)');
    const pick = () => setCut(still.matches ? null : phone.matches ? 'narrow' : 'wide');
    pick();
    phone.addEventListener('change', pick); still.addEventListener('change', pick);
    return () => { phone.removeEventListener('change', pick); still.removeEventListener('change', pick); };
  }, []);

  useEffect(() => {
    const A = a.current, B = b.current, el = section.current;
    if (!cut || !A || !B || !el) return;
    const n = clips.length, layers = [A, B];
    let front = 0, cur = 0, fadeAt = -1, shown = 0, raf = 0, visible = true, queued = -1, timer = 0;
    setOn(0);
    const load = (v: HTMLVideoElement, c: number) => { const f = clips[c % n].film[cut]; v.poster = `${f}.jpg`; v.src = `${f}.mp4`; v.load(); };
    const end = (v: HTMLVideoElement, c: number) => Math.min(clips[c].seconds ?? Infinity, v.duration || Infinity);
    const fade = (k: number) => { for (const r of [copy.current, card.current]) if (r) r.style.opacity = String(k); };
    layers.forEach((v, k) => { v.style.opacity = k ? '0' : '1'; v.style.zIndex = k ? '1' : '2'; });
    load(A, 0);
    if (visible) A.play().catch(() => {});
    // the next film loads under this one once it is under way, so each starts at full speed
    const queue = () => { if (n < 2) return; const q = (cur + 1) % n, back = layers[1 - front]; clearTimeout(timer); timer = window.setTimeout(() => { load(back, q); queued = q; }, 1500); };
    A.addEventListener('playing', queue, { once: true });

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (n < 2) return;
      const F = layers[front], N = layers[1 - front], next = (cur + 1) % n;
      if (fadeAt < 0) {
        const e = end(F, cur);
        if (!isFinite(e)) return;
        // a cut shorter than its file holds on its last frame until the next is ready
        if (F.currentTime >= e && !F.paused) F.pause();
        if (visible && F.currentTime >= e - FADE && queued === next && N.readyState >= 3) {
          fadeAt = now;
          N.currentTime = 0; N.style.opacity = '1'; N.style.zIndex = '1'; F.style.zIndex = '2';
          N.play().catch(() => {});
        }
        return;
      }
      // the film on top fades away over the next: a dissolve, not a dip to black
      const t = Math.min(1, (now - fadeAt) / (FADE * 1000)), s = t * t * (3 - 2 * t);
      F.style.opacity = String(1 - s);
      fade(Math.abs(1 - 2 * s));
      if (s >= 0.5 && shown !== next) { shown = next; setOn(next); }
      if (t >= 1) {
        F.pause(); F.style.opacity = '0'; F.style.zIndex = '1'; N.style.zIndex = '2';
        front = 1 - front; cur = next; fadeAt = -1; fade(1);
        queue();
      }
    };
    raf = requestAnimationFrame(tick);
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      const F = layers[front];
      if (visible) F.play().catch(() => {}); else layers.forEach((v) => v.pause());
    });
    io.observe(el);
    return () => {
      cancelAnimationFrame(raf); io.disconnect(); clearTimeout(timer);
      A.removeEventListener('playing', queue);
      layers.forEach((v) => { v.pause(); v.removeAttribute('src'); v.load(); });
    };
  }, [cut, clips]);

  const c = clips[on];
  // every world's copy is laid in the same place and only the one on screen is
  // shown, so the space is always the tallest's and nothing on the page moves
  const slots = (list: ReactNode[]) => list.map((node, k) => (
    <div key={k} className="slot" aria-hidden={k !== on} style={{ visibility: k === on ? 'visible' : 'hidden' }}>{node}</div>
  ));
  return (
    <section className="billboard" aria-label="Featured worlds" ref={section}>
      <div className="screen">
        <div className="film reel" aria-hidden>
          <picture>
            <source media={PHONE} srcSet={`${first.narrow}.jpg`} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${first.wide}.jpg`} alt="" />
          </picture>
          {cut && <video ref={a} muted playsInline preload="auto" />}
          {cut && <video ref={b} muted playsInline preload="auto" />}
        </div>
        <Link href={c.href} className="filmlink" tabIndex={-1} aria-hidden />
      </div>
      {/* desktop: roblox.com's hero, straight on the film */}
      <div className="lead">
        {headline}
        <div className="slots lead-slots" ref={copy}>{slots(leads)}</div>
      </div>
      {/* phones: the card under the film */}
      <div className="card" ref={card}><div className="slots card-slots">{slots(cards)}</div></div>
    </section>
  );
}
