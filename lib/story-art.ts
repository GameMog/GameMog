import { readFileSync } from 'node:fs';
import React from 'react';
// (next/og.js, not next/og: plain Node, which the checks and scripts run on, has no exports map for next)
import { ImageResponse } from 'next/og.js';
import sharp from 'sharp';
import { FONT_FILE, GOLD, artTitle, measure } from './episode/art';

/**
 * A Story Kit world's key art (the owner, 5 Nov: "the thumbnails for Story World are awful, they need to pop like the
 * rest of the thumbnails with game title etc"). The frame Mog City took of the first drive (public/storykit/work.js,
 * the `keyart` message) is plain gameplay; this makes it key art, as every other world's is (lib/key-art.ts titled():
 * the title lettered large over a dramatic shot), in Mog City's own lockup, the one its title card and start gate set
 * (Mog City wagmi/storyrun/title.js): the world's title in Barlow Condensed ExtraBold, italic, its last word in the gold
 * (as CITY is), the gold rule, and the world's kicker on the tag line under it.
 *
 *   the shot    graded for a poster: a dark frame lifted, colour and contrast up, a golden-hour wash by day (warm
 *               light over cool shadow) or a neon one by night (magenta and teal), the
 *               frame's edges thrown out of focus round its middle (a long lens's shallow depth, from a blurred copy
 *               through a feathered oval round the car and the street, low in the frame), and a vignette with the head darkened
 *               under the type
 *   the type    set by next/og with the font as bytes (lib/episode/art: the pinned, OFL Barlow Condensed ExtraBold; the
 *               italic is the lockup's skew), so no system font, Chrome or network is used; a title whose letters the
 *               font lacks is dropped to what it has (artTitle), and nothing printable left is no type at all
 *   wide        1280x720: the lockup centred at the head, sized to fill the width a title's length allows (up to 156 px)
 *   icon        512x512: the title stacked, a word or two a line, up to 80 px, over the square frame (no tag line)
 *
 * Used when the creator's report stores the key art (lib/storykit-publish.ts recordStoryReport) and, for a story world
 * whose art is still the plain frame (published before this), when its cover is first asked for (app/g/[slug]/cover).
 */
const FONT = readFileSync(FONT_FILE);
const h = React.createElement;
const W = 1280, H = 720, S = 512;

/** The world's own title, as Mog City's title.js has it ('Mog City: Night Shift' shows its own part). */
export const ownTitle = (t: string) => String(t || '').replace(/^\s*mog\s*city\s*[:·\-–—]?\s*/i, '').trim();

/* ---------------------------------------------------------------------------------------------- the shot -- */
/** The frame as a poster: graded, the edges soft, vignetted and darkened at the head (the type's side). */
async function shot(frame: Uint8Array, w: number, h0: number, head: number): Promise<Buffer> {
  // exposed for a poster: a dark frame (a night drive) lifted toward a mid-grey mean, never more than 2.2 times; the
  // highlights (headlights, signs) may clip, as a night poster's do
  const mean = (await sharp(frame).greyscale().stats()).channels[0].mean / 255;
  const night = mean < 0.3, lift = Math.min(1.6, Math.max(1.06, 0.36 / Math.max(mean, 0.05)));
  // (a night frame's shadows opened with local contrast, CLAHE, so the car and the street read out of the dark)
  const graded = sharp(frame).resize(w, h0, { fit: 'cover', position: 'centre' });
  if (night) graded.clahe({ width: Math.round(w / 10), height: Math.round(h0 / 10), maxSlope: 4 });
  const base = await graded.modulate({ saturation: night ? 1.4 : 1.25, brightness: lift }).linear(1.12, -10).toBuffer();
  // the long lens: a blurred copy over the sharp one, clear in an oval round the frame's middle (a little above the
  // type), fully soft at the corners
  // (objectBoundingBox units: the gradient's circle is the frame's oval)
  const mask = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h0}"><defs>
<radialGradient id="m" cx="0.5" cy="0.62" r="0.6"><stop offset="0.5" stop-color="#000"/><stop offset="1" stop-color="#fff"/></radialGradient></defs>
<rect width="${w}" height="${h0}" fill="url(#m)"/></svg>`)).removeAlpha().extractChannel(0).raw().toBuffer();
  // (two passes: sharp joins channels before it blurs, which would blur nothing but the mask)
  const blurred = await sharp(base).blur(Math.max(2, w / 190)).removeAlpha().raw().toBuffer();
  const soft = await sharp(blurred, { raw: { width: w, height: h0, channels: 3 } }).joinChannel(mask, { raw: { width: w, height: h0, channels: 1 } }).png().toBuffer();
  // the light: by day golden hour (warm from the top, the shadows cooled); by night neon (magenta from one side, teal
  // from the other); then the vignette and the head under the type
  const light = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h0}"><defs>${night
    ? `<linearGradient id="g" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FF3D9A" stop-opacity="0.32"/><stop offset="0.5" stop-color="#7A3DFF" stop-opacity="0.06"/><stop offset="1" stop-color="#19D3C5" stop-opacity="0.28"/></linearGradient>`
    : `<linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFB255" stop-opacity="0.7"/><stop offset="0.6" stop-color="#FFA050" stop-opacity="0.25"/><stop offset="1" stop-color="#1D3550" stop-opacity="0.55"/></linearGradient>`}</defs>
<rect width="${w}" height="${h0}" fill="url(#g)"/></svg>`;
  const shade = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h0}"><defs>
<radialGradient id="v" cx="0.5" cy="0.45" r="0.75"><stop offset="0.6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.5"/></radialGradient>
<linearGradient id="f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#05060A" stop-opacity="0.8"/><stop offset="${head.toFixed(3)}" stop-color="#05060A" stop-opacity="0"/></linearGradient></defs>
<rect width="${w}" height="${h0}" fill="url(#v)"/><rect width="${w}" height="${h0}" fill="url(#f)"/></svg>`;
  return sharp(base).composite([
    { input: soft },
    // (night's neon is light added, screen; day's a grade, soft light)
    { input: Buffer.from(light), blend: night ? 'screen' : 'soft-light' },
    { input: Buffer.from(shade) },
  ]).toBuffer();
}

/* ---------------------------------------------------------------------------------------------- the type -- */
const TRACK = 0.012;
/** Lines for the title: as few as fit `maxW` at the largest size from `big` down to `small`, never more than `most`. */
function lay(text: string, maxW: number, big: number, small: number, most: number, stack = false) {
  const words = text.split(' ');
  const width = (lines: string[], s: number) => Math.max(...lines.map((l) => measure(l, s, TRACK)));
  // every way of cutting the words into 1..most lines, kept in order
  const cuts: string[][] = [];
  const walk = (i: number, acc: string[]) => {
    if (i === words.length) { cuts.push(acc); return; }
    for (let j = i + 1; j <= words.length; j++) if (acc.length < most) walk(j, [...acc, words.slice(i, j).join(' ')]);
  };
  walk(0, []);
  // the largest size any cut fits at; a tie goes to fewer lines (the wide) or more (the stacked icon)
  let best = { lines: [text], size: small };
  for (const lines of cuts) {
    let s = Math.min(big, Math.floor(big * maxW / Math.max(1, width(lines, big))));
    // (each extra line costs height: the size is also held to what the block's height allows)
    s = Math.min(s, Math.floor(big * (stack ? 3.2 : 1.9) / Math.max(1, lines.length * 0.92)));
    if (s > best.size || (s === best.size && (stack ? lines.length > best.lines.length : lines.length < best.lines.length))) best = { lines, size: s };
  }
  return { lines: best.lines, size: Math.max(small, best.size) };
}

/**
 * Where the lockup sits: 'head' (the default, centred at the head, as Mog City's start gate) or 'top-left' (smaller,
 * set flush left in the frame's top-left corner: a frame whose hook is in the middle of its head, 12 Nov: SF 2040's
 * Rex, whose head the centred plate covered).
 */
export type LockupPlace = 'head' | 'top-left';

function lockup(shape: 'wide' | 'icon', title: string, kicker: string, place: LockupPlace = 'head') {
  const wide = shape === 'wide', w = wide ? W : S, h0 = wide ? H : S, corner = place === 'top-left';
  const fit = corner ? (wide ? lay(title, 420, 112, 48, 2) : lay(title, 200, 62, 28, 4, true))
    : wide ? lay(title, 1120, 156, 64, 2) : lay(title, 430, 80, 34, 4, true);
  const words = title.split(' '), lastStart = words.length > 1 ? title.length - words[words.length - 1].length : 0;
  // each line, the title's last word in the gold (only when the title has more than one word, as MOG CITY's)
  let at = 0;
  const lines = fit.lines.map((line, i) => {
    const from = at; at += line.length + 1;
    const cut = words.length > 1 && from + line.length > lastStart ? Math.max(0, lastStart - from) : line.length;
    const white = line.slice(0, cut).trimEnd(), gold = line.slice(cut);
    // (each line skewed on its own middle, so a stacked title's lines stay centred over each other)
    return h('div', { key: i, style: { display: 'flex', justifyContent: corner ? 'flex-start' : 'center', whiteSpace: 'nowrap', transform: 'skewX(-11deg)' } },
      white ? h('span', { style: { color: '#fff' } }, white) : null,
      gold ? h('span', { style: { color: GOLD, marginLeft: white ? Math.round(fit.size * 0.22) : 0 } }, gold) : null);
  });
  const sh = (s: number) => `0 ${Math.round(s / 22)}px 0 rgba(0,0,0,.6), 0 ${Math.round(s / 12)}px ${Math.round(s / 3.4)}px rgba(0,0,0,.8)`;
  const logo = h('div', { style: { display: 'flex', flexDirection: 'column', alignItems: corner ? 'flex-start' : 'center', fontSize: fit.size, lineHeight: 0.9, letterSpacing: `${TRACK}em`,
    textShadow: sh(fit.size) } }, ...lines);
  const rw = corner ? (wide ? 110 : 64) : wide ? 150 : 96, rh = wide ? 5 : 4;
  const rule = h('div', { style: { width: rw, height: rh, background: GOLD, marginTop: wide ? 16 : 11, boxShadow: '0 2px 10px rgba(0,0,0,.6)' } });
  // (the tag line on the wide only: at a tile's size the icon's would be a smudge over the car)
  const k = wide ? artTitle(kicker).text : '';
  const ks = corner ? 20 : wide ? 25 : 17;
  const kt = wide ? 0.32 : 0.28, kp = wide ? 22 : 14;
  // (tracking is added after the last letter too: the left padding takes as much again, so the word sits centred)
  const tag = k ? h('div', { style: { display: 'flex', marginTop: wide ? 13 : 9, paddingTop: wide ? 8 : 6, paddingBottom: wide ? 7 : 5, paddingRight: kp, paddingLeft: kp + Math.round(kt * ks),
    fontSize: ks, letterSpacing: `${kt}em`, color: '#fff', background: 'rgba(6,8,12,.62)', borderRadius: 3, textShadow: '0 1px 3px rgba(0,0,0,.8)' } }, k) : null;
  // (at the head, as Mog City's start gate sets its lockup: a drive's frame has its car low and its sky high)
  const top = wide ? 30 : 22;
  // (top-left: flush left at the frame's margin, the skew's lean kept inside it)
  const box = corner ? { left: wide ? 48 : 24, top: wide ? 30 : 18, alignItems: 'flex-start' } : { left: 0, right: 0, top, alignItems: 'center' };
  return h('div', { style: { display: 'flex', width: w, height: h0, fontFamily: 'Barlow Condensed' } },
    h('div', { style: { position: 'absolute', ...box, display: 'flex', flexDirection: 'column' } }, logo, rule, tag));
}

async function type(el: React.ReactElement, w: number, h0: number): Promise<Buffer> {
  const r = new ImageResponse(el, { width: w, height: h0, fonts: [{ name: 'Barlow Condensed', data: FONT, weight: 800, style: 'normal' }] });
  return Buffer.from(await r.arrayBuffer());
}

export type StoryArt = { wide: Buffer; icon: Buffer };

/**
 * The world's key art from Mog City's frames: `wide` (any 16:9 frame, 1280x720 as sent) and `square` (its square frame;
 * absent, the wide's middle). `title` the game's title, `kicker` the pack's (the lockup's tag line; may be empty);
 * `place` where the lockup sits (LockupPlace; the head unless a frame's hook is there).
 * Null when the title has no letter the font can set (the frames are then kept as they are). About 0.3 s.
 */
export async function storyKeyArt(frames: { wide: Uint8Array; square?: Uint8Array | null }, title: string, kicker = '', place: LockupPlace = 'head'): Promise<StoryArt | null> {
  const t = artTitle(ownTitle(title)).text;
  if (!t) return null;
  const k = ownTitle(kicker);
  const [wideShot, iconShot] = await Promise.all([
    shot(frames.wide, W, H, 0.5),
    shot(frames.square ?? await sharp(frames.wide).resize(S, S, { fit: 'cover' }).toBuffer(), S, S, 0.6),
  ]);
  const [wt, it] = await Promise.all([type(lockup('wide', t, k, place), W, H), type(lockup('icon', t, k, place), S, S)]);
  const jpg = (b: Buffer, over: Buffer) => sharp(b).composite([{ input: over }]).jpeg({ quality: 86, mozjpeg: true, chromaSubsampling: '4:2:0' }).toBuffer();
  const [wide, icon] = await Promise.all([jpg(wideShot, wt), jpg(iconShot, it)]);
  return { wide, icon };
}
