/**
 * Meme Kart's crowd, baked.  `npm run bake:crowd`  (needs the dev server: BASE, default http://localhost:3939)
 *
 * The stands' crowd is 22 looks (worlds/meme-kart.js FAN_LOOKS: the library's people in race-day things, and four
 * aliens) filmed by the kart kit (lib/runtime/kart.js kartImpostors) into a sheet of pictures, which the cards draw.
 * Filmed live, a phone had to download the six people packs (~30 MB), decode 96 pictures (~312 MB) and build and film
 * 22 people in one task while loading, and the Galaxy Z Fold 5's tab died (8 Oct). So the film is made here, once:
 * the world as it is, booted in Chrome with the baked sheets hidden from the library (so it films live, exactly as it
 * always did), on a laptop and as a phone, and each finished sheet is read back byte for byte and saved as a library
 * picture (public/assets/crowd-meme-kart and crowd-meme-kart-lo: sheet.png, its card layout in asset.json, hashed into
 * library.json). Bake again whenever FAN_WORDS, FAN_LOOKS, the moves or the film change: `npm run check` says when.
 */
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { withBrowser } from '../lib/browser.ts';
import { insertDraft, db } from '../lib/db.ts';

const BASE = process.env.BASE ?? 'http://localhost:3939';
const OUT = 'public/assets';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const sha256 = (b: Uint8Array | string) => createHash('sha256').update(b).digest('hex');

/** What the sheet is filmed from, in worlds/meme-kart.js: the words and the looks (the check compares it). */
export function crowdSource(code: string) {
  const a = code.indexOf('var FAN_WORDS = ['), b = code.indexOf('var CROWD_SHEETS');
  if (a < 0 || b < a) throw new Error('worlds/meme-kart.js: FAN_WORDS ... CROWD_SHEETS not found');
  return sha256(code.slice(a, b)).slice(0, 16);
}

// a PNG of straight (not premultiplied) RGBA, rows top first, each row filtered the way that packs best
function png(w: number, h: number, rgba: Uint8Array) {
  const stride = w * 4, raw = Buffer.alloc((stride + 1) * h), cur = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const row = rgba.subarray(y * stride, (y + 1) * stride), up = y ? rgba.subarray((y - 1) * stride, y * stride) : null;
    let best = -1, bestSum = Infinity;
    for (let f = 0; f < 5; f++) {
      let sum = 0;
      for (let i = 0; i < stride; i++) {
        const a = i >= 4 ? row[i - 4] : 0, b = up ? up[i] : 0, c = up && i >= 4 ? up[i - 4] : 0;
        let p = row[i];
        if (f === 1) p -= a; else if (f === 2) p -= b; else if (f === 3) p -= (a + b) >> 1;
        else if (f === 4) { const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c); p -= pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
        p &= 255; sum += p < 128 ? p : 256 - p;
      }
      if (sum < bestSum) { bestSum = sum; best = f; }
    }
    raw[y * (stride + 1)] = best;
    for (let i = 0; i < stride; i++) {
      const a = i >= 4 ? row[i - 4] : 0, b = up ? up[i] : 0, c = up && i >= 4 ? up[i - 4] : 0;
      let p = row[i];
      if (best === 1) p -= a; else if (best === 2) p -= b; else if (best === 3) p -= (a + b) >> 1;
      else if (best === 4) { const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c); p -= pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      cur[i] = p & 255;
    }
    cur.copy(raw, y * (stride + 1) + 1);
  }
  const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
  const crc = (b: Buffer) => { let c = -1; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  const chunk = (type: string, data: Buffer) => { const t = Buffer.concat([Buffer.from(type, 'latin1'), data]), len = Buffer.alloc(4), c = Buffer.alloc(4); len.writeUInt32BE(data.length); c.writeUInt32BE(crc(t)); return Buffer.concat([len, t, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// in the page, before anything of its own: the baked sheets hidden from the library (so the world films live), the
// renderer and the scene kept for the read-back, and for the phone a phone (Android, a touch screen)
const PRE = (phone: boolean) => `(() => {
  ${phone ? `try { Object.defineProperty(Navigator.prototype, 'userAgent', { get: () => 'Mozilla/5.0 (Linux; Android 14; SM-F946B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36' }); } catch (e) {}
  const mm = window.matchMedia.bind(window); window.matchMedia = (q) => { const r = mm(q); if (/pointer:\\s*coarse/.test(q)) return Object.assign(Object.create(r), { matches: true, media: q }); return r; };` : ''}
  const f0 = window.fetch;
  window.fetch = function (u) { const p = f0.apply(this, arguments); if (!/library\\.json/.test(String(u && u.url || u))) return p;
    return p.then((r) => r.json().then((j) => { Object.keys(j.assets).forEach((k) => { if (/^crowd-meme-kart/.test(k)) delete j.assets[k]; }); return new Response(JSON.stringify(j), { status: 200, headers: { 'content-type': 'application/json' } }); })); };
  document.addEventListener('DOMContentLoaded', () => {
    const T = window.THREE; if (!T) return; const R0 = T.WebGLRenderer;
    T.WebGLRenderer = function (o) { const r = new R0(o); window.__ren = r; const rd = r.render; r.render = function (sc) { if (sc && sc.isScene && sc.fog && !window.__scene) window.__scene = sc; return rd.apply(this, arguments); }; return r; };
    T.WebGLRenderer.prototype = R0.prototype;
  });
})();`;

type Sheet = { w: number; h: number; crowd: { cards: number; looks: number; frames: number; atlas: [number, number]; baked: boolean; ms: number } };

async function film(id: string, phone: boolean) {
  return withBrowser(async (page) => {
    if (phone) await page.emulate({ width: 344, height: 882, mobile: true, dpr: 2.625 });
    await page.preload(PRE(phone));
    await page.goto(`${BASE}/d/${id}/play?preview=1`);
    console.log(`  ${phone ? 'phone' : 'laptop'}: loading`);
    let ready = false;
    for (let i = 0; i < 600 && !ready; i++) {
      ready = await page.eval<boolean>('!!(window.__gm && window.__gm.ready && window.__scene)').catch(() => false);
      if (!ready) await sleep(200);
      if (!ready && i % 50 === 49) console.log('  ...', await page.eval<string>('JSON.stringify({ gm: !!window.__gm, ready: !!(window.__gm && window.__gm.ready), scene: !!window.__scene, ren: !!window.__ren, errors: window.__gm && window.__gm.errors })').catch((e) => String(e)), page.errors.slice(0, 3));
    }
    if (!ready) throw new Error(`the world did not start (${phone ? 'phone' : 'laptop'}): ${page.errors.slice(0, 3).join(' | ')}`);
    const meta = await page.eval<Sheet | string>(`(() => {
      let m = null; window.__scene.traverse((q) => { if (q.userData && q.userData.crowd && q.userData.atlas) m = q; });
      if (!m) return 'no crowd sheet (did the people load?)';
      const rt = m.userData.atlas, w = rt.width, h = rt.height, buf = new Uint8Array(w * h * 4);
      window.__ren.readRenderTargetPixels(rt, 0, 0, w, h, buf);
      window.__sheet = buf;
      return { w, h, crowd: m.userData.crowd };
    })()`);
    if (typeof meta === 'string') throw new Error(meta);
    console.log(`  ${phone ? 'phone' : 'laptop'}: filmed ${meta.w} x ${meta.h}, reading it back`);
    if (meta.crowd.baked) throw new Error('the world used a baked sheet: the library was not hidden');
    // (read back in pieces of 256 KB: the laptop's sheet is 22 MB, and a reply of a few MB stalls the DevTools socket)
    const bytes = new Uint8Array(meta.w * meta.h * 4), PIECE = 1 << 18;
    for (let at = 0; at < bytes.length; at += PIECE) {
      const b64 = await page.eval<string>(`(() => { const a = window.__sheet.subarray(${at}, ${Math.min(bytes.length, at + PIECE)}); let s = ''; for (let i = 0; i < a.length; i += 32768) s += String.fromCharCode.apply(null, a.subarray(i, i + 32768)); return btoa(s); })()`);
      bytes.set(Buffer.from(b64, 'base64'), at);
    }
    return { ...meta, bytes };
  }, { width: 1280, height: 800, timeoutMs: 300_000 });
}

const code = readFileSync('worlds/meme-kart.js', 'utf8'), meta = JSON.parse(readFileSync('worlds/meme-kart.json', 'utf8'));
const from = crowdSource(code);
const lib = JSON.parse(readFileSync(join(OUT, 'library.json'), 'utf8'));
// the sheet's licences are its people's: the library's bodies, packs and moves it is filmed from
const SRC = ['human-athlete-male', 'human-athlete-female', 'human-pack-male', 'human-pack-female', 'human-moves-male', 'human-moves-female'];
const sources = [...new Set(SRC.flatMap((id) => lib.assets[id].sources as string[]))];

const draft = randomUUID();
insertDraft({ id: draft, prompt: 'crowd bake', format: 'world', report: { runtimeCheck: true }, code, meta: { ...meta, mode: 'kart', runtime: 1 } } as never);
try {
  for (const [id, phone] of [['crowd-meme-kart', false], ['crowd-meme-kart-lo', true]] as const) {
    const s = await film(draft, phone);
    const { w, h, crowd } = s, F = crowd.frames, cols = 2 * F, cell = [w / cols, h / Math.ceil(crowd.looks * F / cols)];
    // (the target's first row is the sheet's bottom, v = 0; a picture's first row is its top)
    const top = new Uint8Array(s.bytes.length), stride = w * 4;
    for (let y = 0; y < h; y++) top.set(s.bytes.subarray((h - 1 - y) * stride, (h - y) * stride), y * stride);
    const file = png(w, h, top);
    const dir = join(OUT, id);
    rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'sheet.png'), file);
    const layout = { looks: crowd.looks, frames: F, cell, cols, rows: h / cell[1], size: [1.24, 2.8], foot: 0.06, from };
    writeFileSync(join(dir, 'asset.json'), JSON.stringify({ format: 'gmasset/1', kind: 'texture', size: 1, maps: { color: 'sheet.png' }, crowd: layout }));
    const files: Record<string, { sha256: string; bytes: number }> = {};
    let total = 0;
    for (const f of ['asset.json', 'sheet.png']) { const d = readFileSync(join(dir, f)); files[f] = { sha256: sha256(d), bytes: d.length }; total += d.length; }
    lib.assets[id] = {
      kind: 'texture', title: `Meme Kart crowd${phone ? ' (phone)' : ''}`,
      description: `Meme Kart's crowd in its stands, filmed: ${crowd.looks} looks (the library's people in race-day clothes, and four aliens) through ${F} frames each of a cheer or a dance, ${cell[0]} x ${cell[1]} px a frame, ${cols} across, ${w} x ${h} px${phone ? ', at a phone\'s size' : ''}. Colour kept as its square root (decode c * c * 2), carried past each figure's edge; alpha is coverage. Not a tiling surface.`,
      sources, derived: 'Filmed in Chrome by the kart kit (lib/runtime/kart.js kartImpostors) from worlds/meme-kart.js FAN_LOOKS, read back byte for byte (scripts/kart-crowd-bake.ts).',
      meta: { maps: ['color'], crowd: layout }, files, bytes: total,
    };
    console.log(`${id}: ${w} x ${h}, ${crowd.looks} looks x ${F} frames at ${cell.join(' x ')}, ${(file.length / 1e6).toFixed(2)} MB (filmed in ${crowd.ms} ms)`);
  }
  writeFileSync(join(OUT, 'library.json'), JSON.stringify(lib, null, 2) + '\n');
} finally {
  db.prepare('DELETE FROM drafts WHERE id = ?').run(draft);
}
process.exit(0);
