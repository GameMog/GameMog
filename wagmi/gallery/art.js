// Mog City: the gallery's art, all of it painted here in code (nothing downloaded, no real artist's work or style).
// The Regent: an original figure of Marzo Quillfeather's (the fictional painter of Mission 4), smooth-faced, eyes
// closed, gold-skinned, a robe and a crown. The gallery shows a giant gold statue of it and three portraits of it, each
// in a different crown, each crown's jewel bearing one of three sigils; the statue's own crown bears one of them on its
// back, seen only in its reflection. That sigil names the High Artwork.
//   SIGILS                      the three: 'star' | 'moon' | 'eye'
//   sigil(x, kind, cx, cy, s, color)          a sigil drawn into a 2D context
//   portrait(x, w, h, { crown, sigil, seed })  a portrait of the Regent: crown 'sun' | 'laurel' | 'tide'
//   markCanvas(kind)            the enamel plaque on the back of the statue's crown (and the frames' cartouches)
//   plaqueCanvas(title, sub)    a wall label        certCanvas(owner, glitch)  the certificate of ownership
//   signCanvas(lines)           the gallery's backlit sign
import { S as story } from '../story/index.js';

const PI = Math.PI;
export const SIGILS = ['star', 'moon', 'eye'];
export const CROWNS = ['sun', 'laurel', 'tide'];
export const ARTIST = 'Marzo Quillfeather';
const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; };
export const rng = (seed) => { seed = (Math.floor(seed) % 2147483646) + 1; return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; };

/* --------------------------------------------------------------- sigils -- */
export function sigil(x, kind, cx, cy, s, color = '#F6D98A') {
  x.save(); x.fillStyle = color; x.strokeStyle = color; x.lineCap = 'round'; x.lineJoin = 'round';
  if (kind === 'star') {
    x.beginPath();
    for (let i = 0; i < 16; i++) { const a = -PI / 2 + i * PI / 8, r = i % 2 ? s * 0.2 : s * 0.5; x.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
    x.closePath(); x.fill();
  } else if (kind === 'moon') {
    // (a crescent: a disc with a second cut out of it, on a scratch canvas so the cut leaves what is under it)
    const n = Math.ceil(s * 1.2) + 4, [c, y] = canvas(n, n), o = n / 2;
    y.fillStyle = color; y.beginPath(); y.arc(o, o, s * 0.46, 0, 2 * PI); y.fill();
    y.globalCompositeOperation = 'destination-out'; y.beginPath(); y.arc(o + s * 0.2, o - s * 0.1, s * 0.38, 0, 2 * PI); y.fill();
    x.drawImage(c, cx - o, cy - o);
  } else {
    x.lineWidth = Math.max(1.5, s * 0.08);
    x.beginPath(); x.moveTo(cx - s * 0.5, cy); x.quadraticCurveTo(cx, cy - s * 0.5, cx + s * 0.5, cy); x.quadraticCurveTo(cx, cy + s * 0.5, cx - s * 0.5, cy); x.closePath(); x.stroke();
    x.beginPath(); x.arc(cx, cy, s * 0.15, 0, 2 * PI); x.fill();
    for (const a of [-0.6, -0.3, 0, 0.3, 0.6]) { const ax = Math.sin(a), ay = -Math.cos(a); x.beginPath(); x.moveTo(cx + ax * s * 0.34, cy + ay * s * 0.34); x.lineTo(cx + ax * s * 0.52, cy + ay * s * 0.52); x.stroke(); }
  }
  x.restore();
}
// (the moon sigil's name is "a crescent": the story's scrub keeps cast names, the cat among them, out of the code)
export const SIGIL_NAME = { star: 'a star', moon: 'a crescent', eye: 'an open eye' };

/* ------------------------------------------------------------- portrait -- */
const GROUNDS = {
  sun: ['#2A0E12', '#5C1A22', '#9A3A2A', '#E9B04A'],     // oxblood to ember
  laurel: ['#08201C', '#123A33', '#2F6B57', '#D8C27A'],  // deep green
  tide: ['#070F26', '#132A5C', '#2E5FA0', '#CFE0F0'],    // ultramarine
};
const ROBES = { sun: ['#4A0F18', '#8C1E2B'], laurel: ['#0E2B25', '#1F5244'], tide: ['#0B1A3E', '#1E3F7E'] };
const JEWELS = { sun: '#B3122A', laurel: '#0F7A55', tide: '#1B4FB8' };
// gold, lit from the upper left, at (cx, cy) radius r
const goldFill = (x, cx, cy, r, k = 1) => {
  const g = x.createRadialGradient(cx - r * 0.35, cy - r * 0.45, r * 0.05, cx, cy, r * 1.05);
  g.addColorStop(0, '#FFF3C4'); g.addColorStop(0.25 * k, '#F2C760'); g.addColorStop(0.7, '#B9821F'); g.addColorStop(1, '#5E3A0C');
  return g;
};
// one of his feathers, small, the painter's signature mark
function feather(x, cx, cy, len, ang, col) {
  x.save(); x.translate(cx, cy); x.rotate(ang); x.strokeStyle = col; x.fillStyle = col;
  x.globalAlpha = 0.55; x.beginPath(); x.moveTo(0, 0); x.quadraticCurveTo(len * 0.18, -len * 0.5, 0, -len); x.quadraticCurveTo(-len * 0.16, -len * 0.5, 0, 0); x.fill();
  x.globalAlpha = 0.9; x.lineWidth = Math.max(1, len * 0.02); x.beginPath(); x.moveTo(0, len * 0.12); x.lineTo(0, -len); x.stroke();
  x.lineWidth = Math.max(0.5, len * 0.008);
  for (let i = 2; i < 18; i++) { const t = i / 18, y = -len * t, w = len * 0.16 * Math.sin(t * PI); for (const s of [-1, 1]) { x.beginPath(); x.moveTo(0, y); x.lineTo(s * w, y - len * 0.05); x.stroke(); } }
  x.restore();
}
// the crown on the head (head centre hx, hy; head half width rx, half height ry)
function crown(x, kind, hx, hy, rx, ry, sig, r) {
  const top = hy - ry * 1.0, bw = rx * 1.04;
  x.save();
  if (kind === 'sun') {
    // rays: nine gold blades fanned out from behind the band, the middle one tallest
    for (let i = -4; i <= 4; i++) {
      const a = -PI / 2 + i * 0.2, L = ry * (1.25 - Math.abs(i) * 0.1), bx = hx + Math.cos(a) * bw * 0.6, by = top + 6 + Math.sin(a) * ry * 0.12;
      x.fillStyle = goldFill(x, bx, by - L * 0.5, L * 0.7);
      x.beginPath(); x.moveTo(bx - rx * 0.07, by); x.lineTo(bx + Math.cos(a) * L, by + Math.sin(a) * L); x.lineTo(bx + rx * 0.07, by); x.closePath(); x.fill();
      x.strokeStyle = 'rgba(80,40,0,0.5)'; x.lineWidth = 1; x.stroke();
    }
  } else if (kind === 'laurel') {
    // a wreath: two sprays of leaves meeting at the front, gold with a green patina
    for (const s of [-1, 1]) for (let i = 0; i < 9; i++) {
      const t = i / 8, lx = hx + s * bw * (0.15 + t * 0.85), ly = top + ry * 0.05 - Math.sin(t * PI) * ry * 0.18 + t * ry * 0.2;
      for (const up of [-1, 1]) {
        x.save(); x.translate(lx, ly); x.rotate(s * (0.9 - t * 0.6) + up * 0.55 * s);
        x.fillStyle = r() < 0.5 ? '#C9A040' : '#9DAF5A'; x.strokeStyle = 'rgba(40,30,0,0.6)'; x.lineWidth = 1;
        x.beginPath(); x.ellipse(0, -rx * 0.14 * up, rx * 0.08, rx * 0.2, 0, 0, 2 * PI); x.fill(); x.stroke(); x.restore();
      }
    }
  } else {
    // tide: a band of curling wave crests, silver-blue enamel edged in gold
    for (let i = -3; i <= 3; i++) {
      const cx = hx + i * bw * 0.28, cy = top - ry * 0.1 - (3 - Math.abs(i)) * ry * 0.07, R = rx * 0.22;
      const g = x.createLinearGradient(cx, cy - R * 2, cx, cy + R); g.addColorStop(0, '#E8F2FF'); g.addColorStop(0.5, '#7FA6D8'); g.addColorStop(1, '#2C4E86');
      x.fillStyle = g; x.strokeStyle = '#E2B85A'; x.lineWidth = Math.max(1.5, rx * 0.02);
      x.beginPath(); x.moveTo(cx - R, cy + R * 0.6); x.quadraticCurveTo(cx - R, cy - R * 1.8, cx + R * 0.5, cy - R * 1.2); x.quadraticCurveTo(cx + R * 0.1, cy - R * 0.9, cx + R * 0.2, cy - R * 0.4); x.quadraticCurveTo(cx + R * 0.9, cy - R * 0.4, cx + R, cy + R * 0.6); x.closePath(); x.fill(); x.stroke();
    }
  }
  // the band, its rim and its gems; the front jewel with the sigil
  const by0 = top - ry * 0.04, bh = ry * 0.26;
  x.fillStyle = goldFill(x, hx, by0 + bh / 2, bw * 1.2);
  x.beginPath(); x.moveTo(hx - bw, by0 + bh * 0.3); x.quadraticCurveTo(hx, by0 - bh * 0.25, hx + bw, by0 + bh * 0.3); x.lineTo(hx + bw, by0 + bh * 1.3); x.quadraticCurveTo(hx, by0 + bh * 0.8, hx - bw, by0 + bh * 1.3); x.closePath(); x.fill();
  x.strokeStyle = 'rgba(70,40,0,0.7)'; x.lineWidth = Math.max(1, rx * 0.012); x.stroke();
  for (let i = -3; i <= 3; i++) { if (!i) continue; const gx = hx + i * bw * 0.27, gy = by0 + bh * 0.62 + Math.abs(i) * bh * 0.04; x.fillStyle = i % 2 ? '#F4ECDA' : JEWELS[kind]; x.beginPath(); x.arc(gx, gy, rx * 0.035, 0, 2 * PI); x.fill(); }
  // (a big cabochon; the sigils are the frames' now, on their cartouches (frame.js), so a real work hung in a frame
  // keeps the puzzle: the painted jewel carries one only if asked)
  const jx = hx, jy = by0 + bh * 0.3, jr = rx * (sig ? 0.34 : 0.24);
  const jg = x.createRadialGradient(jx - jr * 0.3, jy - jr * 0.3, jr * 0.1, jx, jy, jr); jg.addColorStop(0, '#FFFFFF'); jg.addColorStop(0.25, JEWELS[kind]); jg.addColorStop(1, '#100408');
  x.fillStyle = goldFill(x, jx, jy, jr * 1.4); x.beginPath(); x.ellipse(jx, jy, jr * 1.22, jr * 1.36, 0, 0, 2 * PI); x.fill();
  x.fillStyle = jg; x.beginPath(); x.ellipse(jx, jy, jr, jr * 1.12, 0, 0, 2 * PI); x.fill();
  if (sig) sigil(x, sig, jx, jy, jr * 1.45, '#FFF0C0');
  x.restore();
}
export function portrait(x, w, h, { crown: kind = 'sun', sigil: sig = null, seed = 1 } = {}) {
  const r = rng(seed * 7717 + 3), G = GROUNDS[kind], u = Math.min(w, h);
  // the ground: a deep gradient, worked over with soft strokes
  let g = x.createLinearGradient(0, 0, w * 0.3, h); g.addColorStop(0, G[1]); g.addColorStop(1, G[0]); x.fillStyle = g; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 140; i++) {
    x.globalAlpha = 0.05 + r() * 0.08; x.strokeStyle = r() < 0.5 ? G[2] : G[0]; x.lineWidth = u * (0.01 + r() * 0.04);
    const sx = r() * w, sy = r() * h, a = r() * PI; x.beginPath(); x.moveTo(sx, sy); x.quadraticCurveTo(sx + Math.cos(a) * u * 0.1, sy + Math.sin(a) * u * 0.1, sx + Math.cos(a + 0.5) * u * 0.22, sy + Math.sin(a + 0.5) * u * 0.22); x.stroke();
  }
  x.globalAlpha = 1;
  const hx = w * 0.5, hy = h * 0.4, rx = w * 0.15, ry = h * 0.15;
  // the aureole behind the head
  g = x.createRadialGradient(hx, hy - ry * 0.2, ry * 0.4, hx, hy - ry * 0.2, ry * 2.6); g.addColorStop(0, G[3] + 'AA'); g.addColorStop(0.45, G[3] + '33'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  x.strokeStyle = G[3] + '66'; x.lineWidth = Math.max(1, u * 0.004);
  for (let i = 0; i < 3; i++) { x.beginPath(); x.arc(hx, hy - ry * 0.2, ry * (1.75 + i * 0.22), 0, 2 * PI); x.stroke(); }
  // the robe: broad shoulders from the bottom edge, a mantle, gold trim
  const R = ROBES[kind];
  g = x.createLinearGradient(0, h * 0.55, 0, h); g.addColorStop(0, R[1]); g.addColorStop(1, R[0]); x.fillStyle = g;
  x.beginPath(); x.moveTo(-w * 0.05, h); x.bezierCurveTo(w * 0.02, h * 0.72, w * 0.18, h * 0.62, hx - rx * 0.55, h * 0.6); x.lineTo(hx + rx * 0.55, h * 0.6);
  x.bezierCurveTo(w * 0.82, h * 0.62, w * 0.98, h * 0.72, w * 1.05, h); x.closePath(); x.fill();
  // (folds)
  for (let i = 0; i < 10; i++) { const fx = w * (0.12 + i * 0.085), lit = i % 2; x.strokeStyle = lit ? R[1] : 'rgba(0,0,0,0.35)'; x.globalAlpha = 0.6; x.lineWidth = u * 0.012; x.beginPath(); x.moveTo(fx, h); x.quadraticCurveTo(fx + (fx - hx) * 0.1, h * 0.8, hx + (fx - hx) * 0.55, h * 0.64); x.stroke(); }
  x.globalAlpha = 1;
  // the collar: a gold mantle edge in a wide V, with a clasp
  x.strokeStyle = goldFill(x, hx, h * 0.7, w * 0.4); x.lineWidth = u * 0.03;
  x.beginPath(); x.moveTo(w * 0.14, h * 0.7); x.quadraticCurveTo(hx - rx * 0.2, h * 0.68, hx, h * 0.8); x.quadraticCurveTo(hx + rx * 0.2, h * 0.68, w * 0.86, h * 0.7); x.stroke();
  x.lineWidth = u * 0.006; x.strokeStyle = '#FFE7A0';
  x.beginPath(); x.moveTo(w * 0.14, h * 0.7 - u * 0.012); x.quadraticCurveTo(hx - rx * 0.2, h * 0.68 - u * 0.012, hx, h * 0.8 - u * 0.012); x.quadraticCurveTo(hx + rx * 0.2, h * 0.68 - u * 0.012, w * 0.86, h * 0.7 - u * 0.012); x.stroke();
  x.fillStyle = goldFill(x, hx, h * 0.8, u * 0.04); x.beginPath(); x.arc(hx, h * 0.8, u * 0.03, 0, 2 * PI); x.fill();
  x.fillStyle = JEWELS[kind]; x.beginPath(); x.arc(hx, h * 0.8, u * 0.016, 0, 2 * PI); x.fill();
  // the neck and the head: gold, lit from the upper left
  x.fillStyle = goldFill(x, hx, hy + ry * 1.2, rx * 0.9, 0.6);
  x.beginPath(); x.moveTo(hx - rx * 0.42, hy + ry * 0.6); x.lineTo(hx - rx * 0.5, h * 0.62); x.quadraticCurveTo(hx, h * 0.66, hx + rx * 0.5, h * 0.62); x.lineTo(hx + rx * 0.42, hy + ry * 0.6); x.closePath(); x.fill();
  x.fillStyle = goldFill(x, hx, hy, ry * 1.08);
  x.beginPath(); x.ellipse(hx, hy, rx, ry, 0, 0, 2 * PI); x.fill();
  // (the jaw a little narrower: an egg, the chin small)
  x.fillStyle = goldFill(x, hx, hy + ry * 0.3, ry * 0.9, 0.8); x.beginPath(); x.ellipse(hx, hy + ry * 0.42, rx * 0.74, ry * 0.62, 0, 0, PI); x.fill();
  // the face: closed eyes (two low arcs and their lids' shadow), the brow, the nose's ridge, a still mouth
  x.strokeStyle = 'rgba(90,52,8,0.85)'; x.lineWidth = Math.max(1.2, u * 0.006); x.lineCap = 'round';
  for (const s of [-1, 1]) {
    const ex = hx + s * rx * 0.42, ey = hy + ry * 0.02;
    x.beginPath(); x.arc(ex, ey - ry * 0.12, rx * 0.22, PI * 0.2, PI * 0.8); x.stroke();
    x.globalAlpha = 0.35; x.fillStyle = '#6E4610'; x.beginPath(); x.ellipse(ex, ey - ry * 0.02, rx * 0.2, ry * 0.07, 0, PI, 2 * PI); x.fill(); x.globalAlpha = 1;
    x.globalAlpha = 0.5; x.beginPath(); x.arc(ex, ey - ry * 0.3, rx * 0.28, PI * 1.15, PI * 1.85); x.stroke(); x.globalAlpha = 1;
  }
  x.globalAlpha = 0.6; x.beginPath(); x.moveTo(hx + rx * 0.02, hy - ry * 0.18); x.quadraticCurveTo(hx + rx * 0.1, hy + ry * 0.25, hx - rx * 0.04, hy + ry * 0.36); x.stroke();
  x.globalAlpha = 0.8; x.beginPath(); x.moveTo(hx - rx * 0.2, hy + ry * 0.6); x.quadraticCurveTo(hx, hy + ry * 0.66, hx + rx * 0.2, hy + ry * 0.6); x.stroke(); x.globalAlpha = 1;
  // (a highlight down the brow and the cheek)
  g = x.createRadialGradient(hx - rx * 0.4, hy - ry * 0.4, 1, hx - rx * 0.4, hy - ry * 0.4, rx * 0.6); g.addColorStop(0, 'rgba(255,250,220,0.55)'); g.addColorStop(1, 'rgba(255,250,220,0)');
  x.fillStyle = g; x.beginPath(); x.ellipse(hx, hy, rx, ry, 0, 0, 2 * PI); x.fill();
  crown(x, kind, hx, hy, rx, ry, sig, r);
  // his feather drifting at the side, and his signature
  feather(x, w * (0.12 + r() * 0.06), h * (0.42 + r() * 0.1), u * 0.2, -0.5 + r() * 0.3, G[3]);
  x.fillStyle = G[3]; x.globalAlpha = 0.75; x.font = `italic 600 ${Math.round(u * 0.032)}px Georgia, serif`; x.textAlign = 'right'; x.fillText('M. Quillfeather', w * 0.94, h * 0.96); x.globalAlpha = 1;
  // varnish: a warm vignette and a fine grain
  g = x.createRadialGradient(w / 2, h * 0.45, u * 0.25, w / 2, h / 2, Math.hypot(w, h) * 0.62); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(10,4,0,0.62)');
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  const id = x.getImageData(0, 0, w, h), d = id.data; for (let i = 0; i < d.length; i += 4) { const n = (r() - 0.5) * 14; d[i] += n; d[i + 1] += n; d[i + 2] += n * 0.8; } x.putImageData(id, 0, 0);
}

/* ------------------------------------------------------- small canvases -- */
// the enamel plaque on the back of the statue's crown: a dark oval in a gold rim, the sigil in bright gold
export function markCanvas(kind, n = 256) {
  const [c, x] = canvas(n, n);
  x.fillStyle = '#8A6420'; x.fillRect(0, 0, n, n);
  const g = x.createRadialGradient(n * 0.4, n * 0.35, 4, n / 2, n / 2, n * 0.48); g.addColorStop(0, '#3A0A18'); g.addColorStop(1, '#0A0206');
  x.fillStyle = goldFill(x, n / 2, n / 2, n * 0.55); x.beginPath(); x.ellipse(n / 2, n / 2, n * 0.48, n * 0.48, 0, 0, 2 * PI); x.fill();
  x.fillStyle = g; x.beginPath(); x.ellipse(n / 2, n / 2, n * 0.4, n * 0.4, 0, 0, 2 * PI); x.fill();
  sigil(x, kind, n / 2, n / 2, n * 0.56, '#FFE9A6');
  return c;
}
// (a wall label: big type on a warm card, a brass rule; sized to read from a few metres off, not as a museum's 10 pt)
export function plaqueCanvas(title, sub = `${ARTIST} · 2026`) {
  const W = 512, H = 154, [c, x] = canvas(W, H);
  x.fillStyle = '#E9E2D4'; x.fillRect(0, 0, W, H);
  x.fillStyle = '#9A7A3A'; x.fillRect(20, 20, 6, H - 40);
  x.textBaseline = 'middle';
  const fit = (t, weight, size, max) => { let f = size; do { x.font = `${weight} ${f}px "Barlow Condensed", sans-serif`; f -= 1; } while (x.measureText(t).width > max && f > 12); };
  const t1 = story.t(title), t2 = story.t(sub);
  x.fillStyle = '#16130F'; fit(t1, 700, 44, W - 64); x.fillText(t1, 42, 56);
  x.fillStyle = '#5A4E3C'; fit(t2, 500, 30, W - 64); x.fillText(t2, 42, 108);
  return c;
}
export function signCanvas() {
  const [c, x] = canvas(1024, 192);
  x.clearRect(0, 0, 1024, 192); x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillStyle = '#F3D27A'; x.font = '800 104px "Barlow Condensed", sans-serif'; x.fillText(story.t('THE GILDED REGENT'), 512, 78);
  x.fillStyle = '#E9E2D2'; x.font = '600 40px "Barlow Condensed", sans-serif'; x.fillText(story.t('MARZO QUILLFEATHER · NEW WORKS'), 512, 158);
  return c;
}
// a wax seal: a pooled, uneven edge, a raised rim pressed into it, the Regent's crown engraved in its middle (cut in:
// dark on the light's far side, a highlight on its near side), a sheen across the top (the look review, round 2: a flat
// red disc)
function waxSeal(x, cx, cy, R, hot = false) {
  const base = hot ? [214, 47, 47] : [150, 30, 34], c = (k, a = 1) => `rgba(${base.map((v) => Math.min(255, Math.round(v * k))).join(',')},${a})`;
  const r = rng(91);
  // (its shadow on the paper, then the pooled wax, its edge wandering)
  x.save(); x.fillStyle = 'rgba(40,20,10,0.28)'; x.beginPath(); x.ellipse(cx + 4, cy + 6, R * 1.08, R * 1.04, 0, 0, 2 * PI); x.fill(); x.restore();
  x.beginPath();
  for (let i = 0; i <= 48; i++) { const a = (i / 48) * 2 * PI, rr = R * (1 + (i % 48 ? (r() - 0.5) * 0.12 : 0)); i ? x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr) : x.moveTo(cx + rr, cy); }
  x.closePath();
  let g = x.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R * 1.05); g.addColorStop(0, c(1.35)); g.addColorStop(0.55, c(1)); g.addColorStop(1, c(0.6));
  x.fillStyle = g; x.fill();
  // (the rim the stamp left: a raised ring, lit top left, shaded bottom right)
  const ring = (rr, lw, col, dx = 0, dy = 0) => { x.strokeStyle = col; x.lineWidth = lw; x.beginPath(); x.arc(cx + dx, cy + dy, rr, 0, 2 * PI); x.stroke(); };
  ring(R * 0.74, 7, c(0.55), 1.5, 1.5); ring(R * 0.74, 5, c(1.15), -1, -1); ring(R * 0.74, 2, c(1.5, 0.7), -2, -2);
  ring(R * 0.62, 1.5, c(0.55));
  // (beads round the rim)
  for (let i = 0; i < 24; i++) { const a = (i / 24) * 2 * PI, bx = cx + Math.cos(a) * R * 0.86, by = cy + Math.sin(a) * R * 0.86; x.fillStyle = c(0.6); x.beginPath(); x.arc(bx + 1, by + 1, 2.2, 0, 2 * PI); x.fill(); x.fillStyle = c(1.4); x.beginPath(); x.arc(bx - 0.6, by - 0.6, 1.6, 0, 2 * PI); x.fill(); }
  // (the crown engraved: three points on a band, a dot on each)
  const crown = (dx, dy, col) => {
    x.fillStyle = col; const s = R * 0.42, X = cx + dx, Y = cy + dy + s * 0.15;
    x.beginPath(); x.moveTo(X - s, Y + s * 0.45); x.lineTo(X - s, Y - s * 0.35); x.lineTo(X - s * 0.5, Y + s * 0.05); x.lineTo(X, Y - s * 0.6); x.lineTo(X + s * 0.5, Y + s * 0.05); x.lineTo(X + s, Y - s * 0.35); x.lineTo(X + s, Y + s * 0.45); x.closePath(); x.fill();
    for (const px of [-1, 0, 1]) { x.beginPath(); x.arc(X + px * s, Y - (px ? s * 0.42 : s * 0.68), s * 0.12, 0, 2 * PI); x.fill(); }
  };
  crown(-1.5, -1.5, c(0.45)); crown(1.2, 1.2, c(1.45, 0.8)); crown(0, 0, c(0.75));
  // (a sheen across its top)
  g = x.createLinearGradient(cx, cy - R, cx, cy); g.addColorStop(0, 'rgba(255,240,230,0.22)'); g.addColorStop(1, 'rgba(255,240,230,0)');
  x.fillStyle = g; x.beginPath(); x.ellipse(cx - R * 0.15, cy - R * 0.45, R * 0.6, R * 0.3, -0.3, 0, 2 * PI); x.fill();
}
// the certificate (as the pavilion's: m4-pavilion.js drawCert), a glitch over it while it changes hands
export function certCanvas(c, owner, glitch = false, seed = 1) {
  const w = c.width, h = c.height, x = c.getContext('2d');
  x.clearRect(0, 0, w, h); x.fillStyle = '#F6F1E6'; x.fillRect(0, 0, w, h);
  x.textAlign = 'center'; x.textBaseline = 'middle';
  const line = (t, size, col, weight, y) => { x.fillStyle = col; x.font = `${weight} ${size}px "Barlow Condensed", sans-serif`; x.fillText(t, w / 2, y); };
  line(story.t('CERTIFICATE OF OWNERSHIP'), 64, '#6A5530', 700, h * 0.2);
  line(story.t('THE HIGH ARTWORK'), 92, '#1A1A1A', 800, h * 0.4);
  line(story.t(ARTIST).toUpperCase(), 52, '#6A5530', 600, h * 0.58);
  line(`${story.t('OWNER')} · ${owner}`, 104, glitch ? '#D62F2F' : '#1A1A1A', 800, h * 0.78);
  x.strokeStyle = '#B8924A'; x.lineWidth = 12; x.strokeRect(28, 28, w - 56, h - 56); x.lineWidth = 4; x.strokeRect(48, 48, w - 96, h - 96);
  waxSeal(x, w - 128, h - 124, 58, glitch);
  if (glitch) { const r = rng(seed); for (let i = 0; i < 9; i++) { const yy = r() * h, hh = 8 + r() * 36; x.drawImage(c, 0, yy, w, hh, (r() - 0.5) * 120, yy, w, hh); x.fillStyle = `rgba(${r() < 0.5 ? '214,47,47' : '60,200,255'},${0.15 + r() * 0.25})`; x.fillRect(0, yy, w, hh * 0.4); } }
}
