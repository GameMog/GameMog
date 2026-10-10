/**
 * A dare's link preview, drawn in the sender's browser (the dare loop, 10 Oct; the approved mockup is round 2, card 1):
 * the game's cover full-bleed, a glass panel ("A DARE FROM <NAME>", "I MOGGED THIS." and a gold "YOUR TURN.", the title
 * and its credit), the score to beat and a gold PLAY FREE pill. 1200 x 630, a JPEG under 350 KB, which POST /api/dares
 * takes as `card` (cardBase64) and serves at /g/<slug>/dare/<id>/card.
 *
 * Drawn here, not on the server, because the site's fonts are woff2 only and the page has them loaded already. The
 * glass is the game HUD's recipe (lib/runtime/v1.js GLASS): a blurred copy of the cover under a translucent tint, a
 * white sheen at 150 degrees, a lit top rim and a hairline border. The cover is blurred once, and every glass shape
 * draws its own region of that one copy. Browser only.
 */

export type DareCardInput = {
  /** the game's cover, same origin (/g/<slug>/cover), so the canvas stays readable */
  cover: string;
  title: string;
  /** the sender's name: "A DARE FROM <NAME>"; none given: "A DARE" (never the creator's: the sender may be anyone, and the
   *  landing says "You have been dared" for a dare with no name) */
  from?: string | null;
  /** the game's creator: "Created by <creator>" */
  creator?: string | null;
  /** the game it was mogged from: "Remixed from <parent>" */
  parentTitle?: string | null;
  /** the big number, as lib/dare.ts Target.text ("8,412"); no score chip without it */
  scoreText?: string | null;
  /** the line under it, as Target.sub ("2nd of 8 · 2:58.4"): split at " · " or new lines into the chip's right column */
  scoreSub?: string | string[] | null;
  /** as Target.label; 'Score to beat' when not given */
  scoreLabel?: string | null;
};

export const CARD_W = 1200, CARD_H = 630;
const MAX_BYTES = 340 * 1024;
export const OXANIUM_CSS = 'https://fonts.googleapis.com/css2?family=Oxanium:wght@400;500;600;700&display=swap';
const OX = 'Oxanium, system-ui, sans-serif';
const DISPLAY = "'Hubot Sans Variable', 'Figtree Variable', system-ui, sans-serif";
const UI = "'Figtree Variable', 'Helvetica Neue', Helvetica, Arial, sans-serif";
const INK = '#F4F6FA', ACC = '#FFB020';

type Ctx = CanvasRenderingContext2D;

/* ------------------------------------------------------------------ fonts -- */
/** The card's fonts, loaded: Oxanium from Google Fonts (its stylesheet added when the page has none), the site's own. */
export async function ensureCardFonts(): Promise<void> {
  let link = document.querySelector<HTMLLinkElement>('link[href*="family=Oxanium"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = OXANIUM_CSS;
    (document.head ?? document.documentElement).appendChild(link);
  }
  if (!link.sheet) {
    const l = link;
    await new Promise<void>((done) => { l.addEventListener('load', () => done(), { once: true }); l.addEventListener('error', () => done(), { once: true }); setTimeout(done, 4000); });
  }
  const want = [`500 11px ${OX}`, `600 72px ${OX}`, `400 30px ${OX}`, `700 12px ${OX}`, `800 28px ${DISPLAY}`, `500 14px ${UI}`, `700 14px ${UI}`];
  await Promise.race([Promise.all(want.map((f) => document.fonts.load(f).catch(() => []))), new Promise((r) => setTimeout(r, 4000))]);
  await document.fonts.ready;
}

/* ---------------------------------------------------------------- helpers -- */
function rr(ctx: Ctx | Path2D, x: number, y: number, w: number, h: number, r: number) {
  r = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
const roundPath = (x: number, y: number, w: number, h: number, r: number) => { const p = new Path2D(); rr(p, x, y, w, h, r); return p; };

const hasSpacing = (ctx: Ctx) => 'letterSpacing' in ctx;
/** Text with tracking (CSS letter-spacing, in px): the canvas's own where the browser has it, else letter by letter. */
function tracked(ctx: Ctx, text: string, px: number) {
  if (hasSpacing(ctx)) {
    ctx.save();
    (ctx as Ctx & { letterSpacing: string }).letterSpacing = `${px}px`;
    const w = ctx.measureText(text).width;
    ctx.restore();
    return { width: w, draw: (x: number, y: number, how: 'fill' | 'stroke' = 'fill') => { ctx.textAlign = 'left'; ctx.save(); (ctx as Ctx & { letterSpacing: string }).letterSpacing = `${px}px`; how === 'fill' ? ctx.fillText(text, x, y) : ctx.strokeText(text, x, y); ctx.restore(); } };
  }
  const chars = [...text], widths = chars.map((c) => ctx.measureText(c).width);
  const width = widths.reduce((a, b) => a + b, 0) + px * chars.length;
  return {
    width,
    draw: (x: number, y: number) => { ctx.textAlign = 'left'; let at = x; chars.forEach((c, i) => { ctx.fillText(c, at, y); at += widths[i] + px; }); },
  };
}
/** The longest start of a text that fits, with an ellipsis when cut. */
function fit(ctx: Ctx, text: string, max: number, px = 0): string {
  const w = (s: string) => tracked(ctx, s, px).width;
  if (w(text) <= max) return text;
  const chars = [...text];
  while (chars.length > 1 && w(chars.join('').trimEnd() + '\u2026') > max) chars.pop();
  return chars.join('').trimEnd() + '\u2026';
}
/** Words in lines of at most `max` px; the last line kept is cut with an ellipsis when more would follow. */
function wrap(ctx: Ctx, text: string, max: number, px: number, lines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean), out: string[] = [];
  let line = '';
  for (let i = 0; i < words.length; i++) {
    const next = line ? `${line} ${words[i]}` : words[i];
    if (tracked(ctx, next, px).width <= max || !line) { line = next; continue; }
    out.push(line);
    line = words[i];
    if (out.length === lines) { line = ''; out[lines - 1] = fit(ctx, `${out[lines - 1]} ${words.slice(i).join(' ')}`, max, px); break; }
  }
  if (line) out.push(line);
  return out.map((l) => fit(ctx, l, max, px));
}

/** A blurred copy of the whole card once: canvas filters where the browser has them, else a downscale and back. */
function blurredCopy(base: HTMLCanvasElement): HTMLCanvasElement {
  const P = 64, out = document.createElement('canvas');
  out.width = CARD_W; out.height = CARD_H;
  const o = out.getContext('2d')!;
  // (edges stretched past the card, so the blur does not darken toward them)
  const pad = document.createElement('canvas');
  pad.width = CARD_W + 2 * P; pad.height = CARD_H + 2 * P;
  const p = pad.getContext('2d')!;
  p.drawImage(base, 0, 0, pad.width, pad.height);
  p.drawImage(base, P, P);
  o.filter = 'blur(22px) saturate(170%)';
  if (o.filter === 'blur(22px) saturate(170%)') {
    o.drawImage(pad, -P, -P);
    o.filter = 'none';
    return out;
  }
  // (no canvas filters, as in Safari: a 1/16 copy smoothed back up, then laid over itself a few px apart, reads as the
  // same frosted glass)
  const s1 = document.createElement('canvas'), s2 = document.createElement('canvas');
  s1.width = Math.round(pad.width / 4); s1.height = Math.round(pad.height / 4);
  s2.width = Math.round(pad.width / 16); s2.height = Math.round(pad.height / 16);
  const c1 = s1.getContext('2d')!, c2 = s2.getContext('2d')!;
  c1.imageSmoothingQuality = c2.imageSmoothingQuality = o.imageSmoothingQuality = 'high';
  c1.drawImage(pad, 0, 0, s1.width, s1.height);
  c2.drawImage(s1, 0, 0, s2.width, s2.height);
  o.drawImage(s2, -P, -P, pad.width, pad.height);
  o.globalAlpha = 0.5;
  for (const [dx, dy] of [[-8, -8], [8, 8], [8, -8], [-8, 8]]) o.drawImage(s2, -P + dx, -P + dy, pad.width, pad.height);
  o.globalAlpha = 1;
  return out;
}

/** A glass shape over the card: its shadow, the blurred cover under a tint, the white sheen, the lit rim and the hairline. */
function glass(ctx: Ctx, blur: HTMLCanvasElement, x: number, y: number, w: number, h: number, r: number, o: { deep?: boolean; lit?: boolean } = {}) {
  const shape = roundPath(x, y, w, h, r);
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.22)'; ctx.shadowBlur = 32; ctx.shadowOffsetY = 12;
  ctx.fillStyle = '#000';
  ctx.fill(shape);
  ctx.restore();
  ctx.save();
  ctx.clip(shape);
  ctx.drawImage(blur, x, y, w, h, x, y, w, h);
  ctx.fillStyle = o.deep ? 'rgba(12,14,22,.48)' : 'rgba(10,12,18,.34)';
  ctx.fillRect(x, y, w, h);
  // (CSS linear-gradient(150deg, ...): its line through the centre, as long as the box's projection on it)
  const a = (150 * Math.PI) / 180, dx = Math.sin(a), dy = -Math.cos(a), len = Math.abs(w * dx) + Math.abs(h * dy);
  const cx = x + w / 2, cy = y + h / 2;
  const g = ctx.createLinearGradient(cx - (dx * len) / 2, cy - (dy * len) / 2, cx + (dx * len) / 2, cy + (dy * len) / 2);
  g.addColorStop(0, 'rgba(255,255,255,.15)'); g.addColorStop(0.62, 'rgba(255,255,255,.03)'); g.addColorStop(1, 'rgba(255,255,255,.03)');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  // the lit top rim (inset 0 1px 0)
  const rim = new Path2D();
  rr(rim, x, y, w, h, r); rr(rim, x, y + 1, w, h, r);
  ctx.fillStyle = 'rgba(255,255,255,.24)';
  ctx.fill(rim, 'evenodd');
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,.2)'; ctx.lineWidth = 1;
  ctx.stroke(roundPath(x + 0.5, y + 0.5, w - 1, h - 1, r - 0.5));
  if (o.lit) {
    ctx.shadowColor = 'rgba(255,176,32,.85)'; ctx.shadowBlur = 12;
    ctx.fillStyle = ACC;
    ctx.fill(roundPath(x + 24, y - 1, 30, 2, 1));
  }
  ctx.restore();
}

/** The GM coin: gold, lit from the top left, "GM" stamped on it. */
function coin(ctx: Ctx, cx: number, cy: number, s: number) {
  const x = cx - s / 2, y = cy - s / 2;
  const g = ctx.createRadialGradient(x + 0.36 * s, y + 0.32 * s, 0, x + 0.36 * s, y + 0.32 * s, 0.934 * s);
  g.addColorStop(0, '#FFF4C2'); g.addColorStop(0.52, '#F6C33B'); g.addColorStop(1, '#B97A12');
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, s / 2, 0, Math.PI * 2);
  ctx.shadowColor = 'rgba(246,195,59,.5)'; ctx.shadowBlur = 16;
  ctx.fillStyle = g; ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.beginPath(); ctx.arc(cx, cy, s / 2 - 0.5, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,226,150,.9)'; ctx.lineWidth = 1; ctx.stroke();
  ctx.font = `700 ${Math.round(s * 0.32)}px ${OX}`;
  ctx.fillStyle = '#5E3B00'; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
  ctx.fillText('GM', cx, cy + 0.5);
  ctx.restore();
}

/** Cover-fit an image into the card. */
function drawCover(ctx: Ctx, img: HTMLImageElement) {
  const r = Math.max(CARD_W / img.naturalWidth, CARD_H / img.naturalHeight), w = img.naturalWidth * r, h = img.naturalHeight * r;
  ctx.drawImage(img, (CARD_W - w) / 2, (CARD_H - h) / 2, w, h);
}

async function loadImage(src: string): Promise<HTMLImageElement | null> {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = src;
  try { await img.decode(); return img; } catch { return null; }
}

/* ------------------------------------------------------------------- card -- */
/** The dare card, as a 1200 x 630 JPEG under 350 KB. */
export async function renderDareCard(input: DareCardInput): Promise<Blob> {
  if (typeof document === 'undefined') throw new Error('renderDareCard runs in the browser');
  const [img] = await Promise.all([loadImage(input.cover), ensureCardFonts()]);

  // the base: the cover, and the mockup's vignette (an ellipse at 70% 40%, darker to the far corner)
  const base = document.createElement('canvas');
  base.width = CARD_W; base.height = CARD_H;
  const b = base.getContext('2d')!;
  b.fillStyle = '#07080C';
  b.fillRect(0, 0, CARD_W, CARD_H);
  if (img) drawCover(b, img);
  {
    const cx = CARD_W * 0.7, cy = CARD_H * 0.4, rx = Math.max(cx, CARD_W - cx) * Math.SQRT2, ry = Math.max(cy, CARD_H - cy) * Math.SQRT2;
    b.save();
    b.translate(cx, cy); b.scale(rx / ry, 1);
    const v = b.createRadialGradient(0, 0, 0, 0, 0, ry);
    v.addColorStop(0, 'rgba(6,8,14,0)'); v.addColorStop(0.55, 'rgba(6,8,14,.25)'); v.addColorStop(1, 'rgba(6,8,14,.7)');
    b.fillStyle = v;
    b.fillRect(-cx * ry / rx - 1, -cy - 1, (CARD_W * ry) / rx + 2, CARD_H + 2);
    b.restore();
  }
  const blur = blurredCopy(base);

  const canvas = document.createElement('canvas');
  canvas.width = CARD_W; canvas.height = CARD_H;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(base, 0, 0);
  ctx.textBaseline = 'middle';

  // the wordmark chip, top left
  {
    ctx.font = `800 20px ${DISPLAY}`;
    const word = tracked(ctx, 'GameMog', -0.6), w = 8 + 24 + 10 + word.width + 16;
    glass(ctx, blur, 40, 36, w, 38, 19);
    coin(ctx, 40 + 8 + 12, 36 + 19, 24);
    ctx.fillStyle = '#fff'; ctx.font = `800 20px ${DISPLAY}`;
    word.draw(40 + 8 + 24 + 10, 36 + 19 + 1);
  }
  // the address chip, top right
  {
    ctx.font = `500 12px ${OX}`;
    const t = tracked(ctx, 'GAMEMOG.COM', 1.92), w = t.width + 28;
    glass(ctx, blur, CARD_W - 40 - w, 36, w, 34, 17);
    ctx.fillStyle = '#fff'; ctx.font = `500 12px ${OX}`;
    t.draw(CARD_W - 40 - w + 14, 36 + 17 + 0.5);
  }

  // the panel
  const PX = 40, PY = 100, PW = 600, PH = CARD_H - 40 - PY, L = PX + 36, TW = PW - 72;
  glass(ctx, blur, PX, PY, PW, PH, 28, { deep: true, lit: true });
  let y = PY + 34;
  {
    ctx.font = `500 11px ${OX}`; ctx.fillStyle = 'rgba(244,246,250,.66)';
    const who = (input.from || '').trim();
    const cap = fit(ctx, who ? `A DARE FROM ${who.toUpperCase()}` : 'A DARE', TW, 3.08);
    tracked(ctx, cap, 3.08).draw(L, y + 5.5);
    y += 11 + 20;
  }
  {
    ctx.font = `600 72px ${OX}`;
    const lines = wrap(ctx, 'I MOGGED THIS.', TW, 0.72, 2), lh = 72 * 0.96;
    for (const line of lines) {
      const t = tracked(ctx, line, 0.72);
      ctx.save();
      ctx.fillStyle = '#fff';
      ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 2;
      t.draw(L, y + lh / 2);
      ctx.shadowColor = 'rgba(255,176,32,.35)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 0;
      t.draw(L, y + lh / 2);
      ctx.restore();
      y += lh;
    }
    y += 4;
    ctx.font = `600 80px ${OX}`;
    const lh2 = 80 * 0.96;
    for (const line of wrap(ctx, 'YOUR TURN.', TW, 0.8, 2)) {
      const t = tracked(ctx, line, 0.8);
      const g = ctx.createLinearGradient(0, y + lh2 / 2 - 34, 0, y + lh2 / 2 + 30);
      g.addColorStop(0, '#FFF6D0'); g.addColorStop(0.55, '#F6C33B'); g.addColorStop(1, '#C98A18');
      ctx.save();
      ctx.fillStyle = g;
      ctx.shadowColor = 'rgba(0,0,0,.4)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 2;
      t.draw(L, y + lh2 / 2);
      ctx.shadowColor = 'rgba(246,195,59,.5)'; ctx.shadowBlur = 22; ctx.shadowOffsetY = 0;
      t.draw(L, y + lh2 / 2);
      ctx.restore();
      y += lh2;
    }
  }
  // the title and its credit, from the panel's foot up
  {
    const credit: { text: string; bold?: boolean; line?: boolean; dim?: boolean }[] = [];
    if (input.creator?.trim()) credit.push({ text: 'Created by ' }, { text: input.creator.trim(), bold: true });
    if (input.parentTitle?.trim()) {
      if (credit.length) credit.push({ text: ' · ', dim: true });
      credit.push({ text: 'Remixed from ' }, { text: input.parentTitle.trim(), bold: true, line: true });
    }
    const foot = PY + PH - 34;
    let titleBottom = foot;
    if (credit.length) {
      const cy = foot - 19.6 / 2;
      // (the last part, the parent's title or the creator's name, gives way when the line is too long)
      const widthOf = (p: (typeof credit)[number]) => { ctx.font = `${p.bold ? 700 : 500} 14px ${UI}`; return ctx.measureText(p.text).width; };
      const total = () => credit.reduce((s, p) => s + widthOf(p), 0);
      if (total() > TW) { const last = credit[credit.length - 1]; ctx.font = `700 14px ${UI}`; last.text = fit(ctx, last.text, Math.max(40, TW - (total() - widthOf(last)))); }
      let x = L;
      for (const p of credit) {
        ctx.font = `${p.bold ? 700 : 500} 14px ${UI}`;
        ctx.fillStyle = p.bold ? '#fff' : p.dim ? 'rgba(244,246,250,.39)' : 'rgba(244,246,250,.78)';
        ctx.textAlign = 'left';
        ctx.fillText(p.text, x, cy);
        const w = ctx.measureText(p.text).width;
        if (p.line) { ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fillRect(x, cy + 9, w, 1); }
        x += w;
      }
      titleBottom = foot - 19.6 - 6;
    }
    ctx.font = `800 28px ${DISPLAY}`;
    const lines = wrap(ctx, input.title.trim() || 'GameMog', TW, -0.56, 2), lh = 32;
    let ty = titleBottom - lines.length * lh;
    ctx.fillStyle = '#fff';
    for (const line of lines) { tracked(ctx, line, -0.56).draw(L, ty + lh / 2); ty += lh; }
    const rule = titleBottom - lines.length * lh - 18;
    ctx.fillStyle = 'rgba(255,255,255,.14)';
    ctx.fillRect(L, rule, TW, 1);
  }

  // PLAY FREE, and the score to beat beside it
  const pw = 210, ph = 62, px = CARD_W - 40 - pw, py = CARD_H - 40 - ph, mid = py + ph / 2;
  {
    const shape = roundPath(px, py, pw, ph, ph / 2);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.3)'; ctx.shadowBlur = 26; ctx.shadowOffsetY = 10;
    ctx.fillStyle = '#E0A223'; ctx.fill(shape);
    ctx.shadowColor = 'rgba(246,195,59,.45)'; ctx.shadowBlur = 28; ctx.shadowOffsetY = 0;
    const g = ctx.createLinearGradient(0, py, 0, py + ph);
    g.addColorStop(0, '#FFE9A8'); g.addColorStop(0.55, '#F6C33B'); g.addColorStop(1, '#E0A223');
    ctx.fillStyle = g; ctx.fill(shape);
    ctx.restore();
    ctx.save();
    ctx.clip(shape);
    const rim = new Path2D(); rr(rim, px, py, pw, ph, ph / 2); rr(rim, px, py + 1, pw, ph, ph / 2);
    ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fill(rim, 'evenodd');
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,238,180,.95)'; ctx.lineWidth = 1;
    ctx.stroke(roundPath(px + 0.5, py + 0.5, pw - 1, ph - 1, ph / 2 - 0.5));
    ctx.font = `600 14px ${OX}`;
    const t = tracked(ctx, 'PLAY FREE', 3.36), tri = 9, gap = 10, w = tri + gap + t.width - 3.36, x0 = px + (pw - w) / 2;
    ctx.fillStyle = '#2A1A00';
    ctx.beginPath(); ctx.moveTo(x0, mid - 5); ctx.lineTo(x0 + tri, mid); ctx.lineTo(x0, mid + 5); ctx.closePath(); ctx.fill();
    t.draw(x0 + tri + gap, mid + 0.5);
  }
  if (input.scoreText?.trim()) {
    const sw = 300, sh = 70, sx = px - 12 - sw, sy = mid - sh / 2;
    glass(ctx, blur, sx, sy, sw, sh, 20, { lit: true });
    coin(ctx, sx + 16 + 17, mid, 34);
    const tx = sx + 16 + 34 + 14;
    const sub = (Array.isArray(input.scoreSub) ? input.scoreSub : (input.scoreSub ?? '').split(/\s+·\s+|\n/)).map((s) => s.trim().toUpperCase()).filter(Boolean).slice(0, 2);
    ctx.font = `500 12px ${OX}`;
    const subW = Math.max(0, ...sub.map((s) => tracked(ctx, s, 1.68).width));
    ctx.fillStyle = 'rgba(244,246,250,.72)';
    sub.forEach((s, i) => { const t = tracked(ctx, s, 1.68); t.draw(sx + sw - 16 - t.width + 1.68, mid + (i - (sub.length - 1) / 2) * 20.4); });
    const room = sw - 16 - (tx - sx) - (subW ? subW + 12 : 0);
    ctx.font = `500 11px ${OX}`; ctx.fillStyle = 'rgba(244,246,250,.66)';
    tracked(ctx, fit(ctx, (input.scoreLabel || 'Score to beat').toUpperCase(), room, 3.08), 3.08).draw(tx, sy + 12 + 5.5);
    ctx.font = `400 30px ${OX}`; ctx.fillStyle = '#fff';
    tracked(ctx, fit(ctx, input.scoreText.trim(), room, 0.6), 0.6).draw(tx, sy + 12 + 11 + 4 + 31.5 / 2);
  }

  return toJpeg(canvas);
}

/** The card as a JPEG, as good as fits under the server's 350 KB. */
async function toJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  let last: Blob | null = null;
  for (const q of [0.86, 0.8, 0.72, 0.62, 0.5]) {
    last = await new Promise<Blob | null>((done) => canvas.toBlob(done, 'image/jpeg', q));
    if (last && last.size <= MAX_BYTES) return last;
  }
  if (!last) throw new Error('This browser could not draw the card.');
  return last;
}

/** A card as the base64 POST /api/dares takes in `card`. */
export async function cardBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
