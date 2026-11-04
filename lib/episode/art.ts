import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
// (next/og.js, not next/og: plain Node, which the checks and scripts run on, has no exports map for next)
import { ImageResponse } from 'next/og.js';
import sharp from 'sharp';

/**
 * A Mog City episode's key art (3 Nov 2026; ported from the Phase D prototype, MogCity .scratch/moggable/phase-d/art):
 * an episode has no frame a test drive can take a picture of, so its card is made, not shot. Mog City's poster plate
 * (lib/episode/art/plate-*.jpg, graded once) with the poster's type: MOG (white) CITY (gold), the gold rule, the
 * episode's title in tracked capitals and the foot line. The type is set by next/og (no system fonts, no Chrome), with
 * the font passed as bytes (lib/episode/art/BarlowCondensed-ExtraBold.ttf, the official upright Barlow Condensed
 * ExtraBold from github.com/google/fonts, pinned by FONT_SHA, SIL OFL 1.1 with OFL.txt beside it; the owner approved its
 * download 3 Nov; the logo's italic is the poster's skew, set here), and
 * composited onto the plate by sharp. Nothing touches the network as long as every glyph is in the font: coverage is
 * checked against the font's cmap first and anything it lacks is dropped (satori would fetch fallback fonts otherwise).
 * The plate always shows Mog City's default Dan and car: a Mog's looks and paint do not show in its card.
 */
const DIR = join(process.cwd(), 'lib', 'episode', 'art');
/** The font's SHA-256 as downloaded (google/fonts at 2fe1e8c6b137fb13041a7cfca6fdcd8a910ea4dc, ofl/barlowcondensed). */
export const FONT_SHA = '724c9c25952d5f4a2d87185d9767aa006144c5f0d944dc05bf7d5d603551c260';
export const FONT_FILE = join(DIR, 'BarlowCondensed-ExtraBold.ttf');
const FONT = readFileSync(FONT_FILE);
const h = React.createElement;
export const GOLD = '#FFC93C';
// (no 1200x630 'og' shape: its plate is not shipped and every page's og:image is the wide card; review F8)
export const SIZES = { wide: [1280, 720], icon: [512, 512] } as const;
export type Shape = keyof typeof SIZES;

/* ------------------------------------------------- the font's cmap and advances (TrueType, format 4) -- */
const metrics = (() => {
  const d = FONT, u16 = (o: number) => d.readUInt16BE(o), i16 = (o: number) => d.readInt16BE(o), u32 = (o: number) => d.readUInt32BE(o);
  const tables: Record<string, number> = {};
  for (let i = 0, n = u16(4); i < n; i++) tables[d.toString('latin1', 12 + 16 * i, 16 + 16 * i)] = u32(20 + 16 * i);
  const upm = u16(tables.head + 18), nHM = u16(tables.hhea + 34);
  const glyph = new Map<number, number>();
  const cm = tables.cmap;
  for (let i = 0, n = u16(cm + 2); i < n; i++) {
    const pid = u16(cm + 4 + 8 * i), eid = u16(cm + 6 + 8 * i), off = cm + u32(cm + 8 + 8 * i);
    if (!(pid === 3 && eid === 1) || u16(off) !== 4) continue;
    const seg = u16(off + 6) / 2, ends = off + 14, starts = ends + 2 * seg + 2, deltas = starts + 2 * seg, ranges = deltas + 2 * seg;
    for (let s = 0; s < seg; s++) {
      const end = u16(ends + 2 * s), start = u16(starts + 2 * s), delta = i16(deltas + 2 * s), ro = u16(ranges + 2 * s);
      for (let c = start; c <= end && c !== 0xffff; c++) {
        let g = 0;
        if (ro === 0) g = (c + delta) & 0xffff;
        else { const gi = u16(ranges + 2 * s + ro + 2 * (c - start)); g = gi ? (gi + delta) & 0xffff : 0; }
        if (g) glyph.set(c, g);
      }
    }
  }
  const adv = (g: number) => u16(tables.hmtx + 4 * Math.min(g, nHM - 1));
  return { upm, has: (c: number) => glyph.has(c), adv: (c: number) => adv(glyph.get(c) ?? 0) };
})();

/** Width in px of a single line at `size` px with `track` em of letter-spacing (kerning ignored: a few px at most). */
export function measure(text: string, size: number, track: number) {
  let w = 0, n = 0;
  for (const ch of text) { w += metrics.adv(ch.codePointAt(0)!); n++; }
  return (w / metrics.upm) * size + track * size * n;
}

/**
 * The episode title as the art sets it: tokens already rendered by the caller (schema.js render(text, pack)),
 * whitespace collapsed, straight apostrophes and quotes made typographic, upper-cased, and anything the font lacks
 * (emoji, CJK, Cyrillic: Barlow is Latin + Vietnamese) dropped. `full` is false when something was dropped; `text` is
 * '' when nothing printable is left, and the art then reads A GAMEMOG EPISODE (og:title still carries the real title).
 */
export function artTitle(episode: string): { text: string; full: boolean } {
  let t = episode.replace(/\s+/g, ' ').trim()
    .replace(/(\w)'(\w)/g, '$1’$2').replace(/'(?=\w)/g, '‘').replace(/'/g, '’')
    .replace(/"(?=\w)/g, '“').replace(/"/g, '”')
    .toUpperCase();
  const kept = Array.from(t).filter((ch) => ch === ' ' || metrics.has(ch.codePointAt(0)!)).join('').replace(/\s+/g, ' ').trim();
  const full = kept === t;
  return { text: /[\p{L}\p{N}]/u.test(kept) ? kept : '', full };
}

/** Lines and size for the title: one line at the largest size that fits, else two balanced lines, else smaller. */
export function fitTitle(text: string, maxW: number, big: number, small: number, track: number) {
  for (let s = big; s >= small; s--) if (measure(text, s, track) <= maxW) return { lines: [text], size: s, track };
  const words = text.split(' ');
  if (words.length > 1) {
    let best: string[] = [text], bestW = Infinity;
    for (let i = 1; i < words.length; i++) {
      const a = words.slice(0, i).join(' '), b = words.slice(i).join(' ');
      const w = Math.max(measure(a, big, track), measure(b, big, track));
      if (w < bestW) { bestW = w; best = [a, b]; }
    }
    for (let s = big; s >= Math.round(small * 0.8); s--) if (Math.max(...best.map((l) => measure(l, s, track))) <= maxW) return { lines: best, size: s, track };
  }
  // one long word (or still too wide): tighter tracking, then whatever size fits
  const t2 = track / 2;
  for (let s = big; s >= 10; s--) if (measure(text, s, t2) <= maxW) return { lines: [text], size: s, track: t2 };
  return { lines: [text], size: 10, track: t2 };
}

/* -------------------------------------------------------------------------------------- layout -- */
type L = { pad: number; top: number; logo: number; rule: [number, number, number, number]; sub: [number, number]; maxW: number; foot: number; center: boolean; footBottom?: number };
const LAYOUT: Record<Shape, L> = {
  // the poster's top-left block (compose.mts 'tl'), scaled 1280/1200 for the card
  wide: { pad: 111, top: 96, logo: 134, rule: [128, 4, 17, 14], sub: [40, 28], maxW: 640, foot: 21, center: false },
  // the icon: centred at the top over the square plate (compose.mts 'sq', at 512), no foot (unreadable at tile size)
  icon: { pad: 26, top: 34, logo: 74, rule: [72, 3, 10, 9], sub: [26, 17], maxW: 440, foot: 0, center: true },
};

function typeLayer(shape: Shape, title: string) {
  const [W, H] = SIZES[shape], L = LAYOUT[shape];
  const track = 0.3;
  const fit = title ? fitTitle(title, L.maxW, L.sub[0], L.sub[1], track) : { lines: ['A GAMEMOG EPISODE'], size: L.sub[0], track };
  const shadow = (px: number) => `0 ${Math.max(1, Math.round(px / 20))}px ${Math.round(px / 4)}px rgba(0,0,0,.85)`;
  const align = L.center ? 'center' : 'flex-start';
  const logo = h('div', { style: { display: 'flex', fontSize: L.logo, lineHeight: 0.86, letterSpacing: 1, transform: 'skewX(-11deg)', textShadow: `0 ${Math.round(L.logo / 21)}px ${Math.round(L.logo / 4.5)}px rgba(0,0,0,.75)`, marginLeft: L.center ? 0 : Math.round(L.logo * 0.04) } },
    h('span', { style: { color: '#fff' } }, 'MOG'), h('span', { style: { color: GOLD, marginLeft: Math.round(L.logo * 0.2) } }, 'CITY'));
  const [rw, rh, rt, rb] = L.rule;
  const rule = h('div', { style: { width: rw, height: rh, background: GOLD, marginTop: rt, marginBottom: rb, boxShadow: '0 2px 8px rgba(0,0,0,.5)' } });
  const sub = h('div', { style: { display: 'flex', flexDirection: 'column', alignItems: align } },
    ...fit.lines.map((line) => h('div', { style: { display: 'flex', fontSize: fit.size, lineHeight: 1.12, letterSpacing: `${fit.track}em`, whiteSpace: 'nowrap', color: '#fff', textShadow: shadow(fit.size),
      // tracking is added after the last letter too; centred lines are nudged back by half of it
      paddingLeft: L.center ? `${fit.track}em` : 0 } }, line)));
  const foot = L.foot ? h('div', { style: { display: 'flex', marginTop: Math.round(L.foot * 1.1), fontSize: L.foot, letterSpacing: 3.5, color: 'rgba(255,255,255,.88)', textShadow: '0 2px 8px rgba(0,0,0,.9)' } },
    h('span', {}, 'PLAY FREE IN YOUR BROWSER'), h('span', { style: { color: 'rgba(255,255,255,.6)', padding: '0 8px' } }, '·'), h('span', { style: { color: GOLD } }, 'GAMEMOG.COM')) : null;
  return {
    el: h('div', { style: { display: 'flex', width: W, height: H, fontFamily: 'Barlow Condensed' } },
      h('div', { style: { position: 'absolute', top: L.top, ...(L.center ? { left: 0, right: 0 } : { left: L.pad }), display: 'flex', flexDirection: 'column', alignItems: align } }, logo, rule, sub, foot)),
    fit,
  };
}

async function draw(el: React.ReactElement, W: number, H: number): Promise<Buffer> {
  const r = new ImageResponse(el, { width: W, height: H, fonts: [{ name: 'Barlow Condensed', data: FONT, weight: 800, style: 'normal' }] });
  return Buffer.from(await r.arrayBuffer());
}

export type EpisodeArt = { wide?: Buffer; icon?: Buffer; title: string; full: boolean; fits: Record<Shape, { lines: string[]; size: number }> };

/** The three images for one episode title (the pack's title.episode, tokens already rendered). About 0.2-0.4 s on a laptop. */
export async function episodeArt(episode: string, shapes: Shape[] = ['wide', 'icon']): Promise<EpisodeArt> {
  const { text, full } = artTitle(episode);
  const out = { title: text, full, fits: {} } as EpisodeArt;
  for (const shape of shapes) {
    const [W, H] = SIZES[shape], plate = `plate-${shape === 'icon' ? 'square' : 'wide'}.jpg`;
    const { el, fit } = typeLayer(shape, text);
    const type = await draw(el, W, H);
    out[shape] = await sharp(readFileSync(join(DIR, plate))).composite([{ input: type }])
      .jpeg({ quality: 85, mozjpeg: true, chromaSubsampling: '4:2:0' }).toBuffer();
    out.fits[shape] = { lines: fit.lines, size: fit.size };
  }
  return out;
}

/** The plain cover: the plate with no type (/g/<slug>/cover?plain, the dare card, must not get a second title). */
export const plainCover = () => readFileSync(join(DIR, 'plate-wide.jpg'));
