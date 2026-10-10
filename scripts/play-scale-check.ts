/**
 * The play page at scale (10 Oct, the owner: "let everyone play"; lib/play-page.ts, app/g/[slug]/play/route.ts).
 *
 *   node --import ./scripts/ts-resolve.mjs scripts/play-scale-check.ts            identity + server checks + bench
 *   ... scripts/play-scale-check.ts identity                                       the bytes only (no server needed)
 *   BASELINE=<file.json> ...                                                       and each game's page against a
 *                                                                                  snapshot taken before (sha256 by slug)
 *
 * 1. identity: every world (worlds/*.js, deploy/migrations/*.js) and every game in the local database plays exactly
 *    the bytes the route assembled before (the old route's own expression, written out here), from memory and through
 *    both compressed copies; BASELINE also compares what the server sends now with what it sent before.
 * 2. server (BASE, the dev server): ETag and 304, the encodings, the edge-cacheable header only at the current version
 *    on the site's address, a play counted from the page's view beacon and not from the frame's document, an unknown
 *    game 404. A throwaway game is made and removed.
 * 3. bench: the route before (assembled per request, no-store, uncompressed, as it was) and now (lib/play-page.ts),
 *    each in a production-mode child server of its own on a free port, 1 at a time and 50 at once, for Meme Kart,
 *    Aspen GP and a lap world; then the cache's size and the server's memory with every game kept.
 */
import { register } from 'node:module';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';
import type { AddressInfo } from 'node:net';

// the app's own '@/' imports, for the route itself (scripts/ts-resolve-hooks.mjs adds the .ts), and next/headers
register(`data:text/javascript,${encodeURIComponent(`export async function resolve(s, c, n) {
  if (s.startsWith('next/')) { try { return await n(s, c); } catch { return n(s + '.js', c); } }
  if (!s.startsWith('@/')) return n(s, c);
  const u = ${JSON.stringify(new URL('../', import.meta.url).href)} + s.slice(2);
  for (const x of ['', '.ts', '.tsx', '/index.ts']) { try { return await n(u + x, c); } catch {} }
  return n(u, c);
}`)}`);

const ROOT = new URL('../', import.meta.url).pathname;
const BASE = process.env.BASE ?? 'http://localhost:3939';
const mode = process.argv[2] ?? 'all';
let failures = 0;
const ok = (name: string, cond: boolean, detail = '') => {
  console.log(`${cond ? '  ok  ' : '  FAIL'}  ${name}${detail ? `: ${detail}` : ''}`);
  if (!cond) failures++;
};
const sha = (b: Uint8Array | string) => createHash('sha256').update(b).digest('hex');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const BENCH_SLUGS = ['meme-kart', 'aspen-gp', 'velodrome-2028'];

/* -------------------------------------------------- child: one server -- */
if (mode === 'serve-before' || mode === 'serve-now') {
  const { getGameBySlug, getUnlistedGameBySlug, db } = await import('../lib/db.ts');
  const { renderPlayHtml, playCacheStats } = await import('../lib/play-page.ts');
  const { GET } = await import('../app/g/[slug]/play/route.ts');
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost:3939');
    if (url.pathname === '/stats') {
      // (with every game kept: the bench asks for each once before it asks this)
      (globalThis as { gc?: () => void }).gc?.();
      const m = process.memoryUsage();
      res.end(JSON.stringify({ cache: playCacheStats(), rss: m.rss, heapUsed: m.heapUsed, external: m.external, arrayBuffers: m.arrayBuffers }));
      return;
    }
    if (url.pathname === '/slugs') { res.end(JSON.stringify((db.prepare('SELECT slug FROM games').all() as { slug: string }[]).map((r) => r.slug))); return; }
    const slug = /^\/g\/([^/]+)\/play$/.exec(url.pathname)?.[1] ?? '';
    const t0 = performance.now();
    let status = 200, headers: Record<string, string> = {}, body: Uint8Array = new Uint8Array();
    if (mode === 'serve-before') {
      // the route as it was before 10 Oct: assembled per request, no-store, uncompressed (and a plays update, left out
      // here so the bench writes nothing to the shared database; it is a one-row update)
      const game = getGameBySlug(slug) ?? getUnlistedGameBySlug(slug);
      if (!game) status = 404;
      else { body = Buffer.from(renderPlayHtml(game)); headers = { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }; }
    } else {
      const h = new Headers();
      for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') h.set(k, v);
      h.set('host', 'localhost:3939');
      const r = await GET(new Request(`http://localhost:3939${req.url}`, { headers: h }), { params: Promise.resolve({ slug }) });
      status = r.status; r.headers.forEach((v, k) => { headers[k] = v; });
      body = new Uint8Array(await r.arrayBuffer());
    }
    headers['x-server-ms'] = (performance.now() - t0).toFixed(2);
    res.writeHead(status, headers); res.end(body);
  });
  server.listen(0, '127.0.0.1', () => process.stdout.write(`PORT ${(server.address() as AddressInfo).port}\n`));
  await new Promise(() => {});
}

/* --------------------------------------------------------- 1. identity -- */
const { db } = await import('../lib/db.ts');
const { renderGame } = await import('../lib/engine/shell.ts');
const { renderCustomGame, renderWorldGame } = await import('../lib/custom-game.ts');
const { withKartScore } = await import('../lib/kart-play.ts');
const { playPage, playCacheStats, clearPlayCache, renderPlayHtml } = await import('../lib/play-page.ts');
type Src = { id: string; format: 'race' | 'custom' | 'world'; code: string | null; meta: string | null; spec: string; slug?: string };

/** The page exactly as app/g/[slug]/play/route.ts assembled it until 10 Oct (its own expression, kept here). */
function before(game: Src) {
  const custom = (game.format === 'custom' || game.format === 'world') && game.code;
  const meta = JSON.parse(game.meta ?? '{}');
  return !custom
    ? renderGame(JSON.parse(game.spec), game.id)
    : game.format === 'world'
      ? renderWorldGame(game.code!, withKartScore(game.code!, meta), game.id, meta.runtime ?? 1)
      : renderCustomGame(game.code!, meta, game.id);
}

if (mode === 'all' || mode === 'identity') {
  console.log('\nThe bytes: every world and every game plays what it played before');
  const sources: (Src & { name: string })[] = [];
  for (const dir of ['worlds', 'deploy/migrations']) {
    for (const f of readdirSync(join(ROOT, dir)).filter((n) => n.endsWith('.js')).sort()) {
      const name = f.slice(0, -3), j = [`${name}.json`, `${name}.meta.json`].map((m) => join(ROOT, dir, m)).find(existsSync);
      const raw = j ? JSON.parse(readFileSync(j, 'utf8')) : { title: name };
      const meta = { title: raw.title ?? name, ...(raw.meta && typeof raw.meta === 'object' ? raw.meta : raw) };
      sources.push({ name: `${dir}/${f}`, id: raw.id ?? `file-${name}`, format: 'world', code: readFileSync(join(ROOT, dir, f), 'utf8'), meta: JSON.stringify(meta), spec: '{}' });
    }
  }
  for (const r of db.prepare('SELECT id, slug, format, code, meta, spec FROM games ORDER BY slug').all() as unknown as Src[]) sources.push({ ...r, name: `db:${r.slug}` });
  clearPlayCache();
  const bad: string[] = [];
  let bytes = 0;
  for (const s of sources) {
    const want = Buffer.from(before(s), 'utf8'), page = playPage(s), again = playPage(s);
    bytes += want.length;
    if (!page.body.equals(want) || again !== page || renderPlayHtml(s) !== want.toString('utf8') || page.v !== sha(want).slice(0, 16)) bad.push(s.name);
  }
  ok(`${sources.length} pages (${sources.filter((s) => s.name.startsWith('db:')).length} games in the database, ${sources.filter((s) => !s.name.startsWith('db:')).length} world files; ${(bytes / 1e6).toFixed(1)} MB) are byte-identical from memory, and their version is the hash of their bytes`, bad.length === 0, bad.join(', '));
  // the compressed copies are made off the main thread, a moment after
  for (let i = 0; i < 100 && sources.some((s) => { const p = playPage(s); return !p.br || !p.gz; }); i++) await sleep(100);
  const badZ = sources.filter((s) => { const p = playPage(s); return !p.br || !p.gz || !brotliDecompressSync(p.br).equals(p.body) || !gunzipSync(p.gz).equals(p.body); }).map((s) => s.name);
  ok('and so are their brotli and gzip copies', badZ.length === 0, badZ.join(', '));
  const st = playCacheStats();
  ok('the cache keeps within its cap and evicts the least recently used', st.bytes <= st.cap, `${st.entries} kept, ${(st.bytes / 1e6).toFixed(1)} MB of ${(st.cap / 1e6).toFixed(0)} MB, ${st.evicted} evicted`);
  // a change to the game is a new version at once
  const mk = sources.find((s) => s.name === 'db:meme-kart');
  if (mk) {
    const a = playPage(mk), b = playPage({ ...mk, meta: JSON.stringify({ ...JSON.parse(mk.meta ?? '{}'), title: 'Changed' }) }), c = playPage({ ...mk, code: `${mk.code}\n` });
    ok('a changed title or a changed line of code is a new page with a new version', a.v !== b.v && a.v !== c.v && b.v !== c.v && b.body.includes('<title>Changed</title>'));
  }
  const prevCap = process.env.PLAY_CACHE_MB;
  process.env.PLAY_CACHE_MB = '6';
  clearPlayCache();
  for (const s of sources.slice(0, 12)) playPage(s);
  const small = playCacheStats();
  ok('with a small cap the oldest pages go first and the cache stays under it', small.bytes <= small.cap && small.evicted > 0, `${small.entries} kept, ${small.evicted} evicted, ${(small.bytes / 1e6).toFixed(1)} MB`);
  if (prevCap === undefined) delete process.env.PLAY_CACHE_MB; else process.env.PLAY_CACHE_MB = prevCap;
  clearPlayCache();

  if (process.env.BASELINE) {
    const was = JSON.parse(readFileSync(process.env.BASELINE, 'utf8')) as Record<string, { status: number; bytes: number; sha: string }>;
    const diff: string[] = [];
    for (const [slug, w] of Object.entries(was)) {
      const r = await fetch(`${BASE}/g/${slug}/play`, { headers: { 'accept-encoding': 'identity' } });
      const b = new Uint8Array(await r.arrayBuffer());
      if (r.status !== w.status || sha(b) !== w.sha) diff.push(`${slug} (${r.status}, ${b.length} B, was ${w.bytes} B)`);
    }
    ok(`the server sends each of the ${Object.keys(was).length} games byte for byte what it sent before (${process.env.BASELINE.split('/').pop()})`, diff.length === 0, diff.join(', '));
  }
}

/* ----------------------------------------------------------- 2. server -- */
if (mode === 'all' || mode === 'server') {
  console.log(`\nThe route on ${BASE}`);
  const get = (path: string, headers: Record<string, string> = {}) => fetch(`${BASE}${path}`, { headers: { 'accept-encoding': 'identity', ...headers } });
  const raw = async (r: Response) => new Uint8Array(await r.arrayBuffer());
  const g = db.prepare("SELECT id, slug, format, code, meta, spec FROM games WHERE slug = 'meme-kart'").get() as unknown as Src | undefined;
  if (!g) ok('meme-kart is in the local database', false);
  else {
    const want = Buffer.from(before(g), 'utf8'), v = sha(want).slice(0, 16);
    const plain = await get('/g/meme-kart/play'), body = await raw(plain);
    ok('a play page with no version: the same bytes, revalidated by the browser, never kept at an edge',
      plain.status === 200 && Buffer.from(body).equals(want) && plain.headers.get('cache-control') === 'private, no-cache' && plain.headers.get('etag') === `W/"${v}"`,
      `${plain.headers.get('cache-control')} ${plain.headers.get('etag')}`);
    const site = new URL(BASE).origin === (process.env.SITE_URL ? new URL(process.env.SITE_URL).origin : 'http://localhost:3939');
    const at = await get(`/g/meme-kart/play?v=${v}`), atBody = await raw(at);
    ok('at its version, on the site\'s own address: kept at an edge for a day, revalidated by the browser, the same bytes',
      Buffer.from(atBody).equals(want) && (!site || at.headers.get('cache-control') === 'public, max-age=0, s-maxage=86400, stale-while-revalidate=600, no-transform'), String(at.headers.get('cache-control')));
    const diag = await get(`/g/meme-kart/play?v=${v}&kdiag=nomusic`);
    ok('the race\'s switches (?kdiag=) ride along: the same page, kept the same way', Buffer.from(await raw(diag)).equals(want) && diag.headers.get('cache-control') === at.headers.get('cache-control'));
    const old = await get('/g/meme-kart/play?v=0123456789abcdef');
    ok('at any other version: the current page, never kept at an edge', Buffer.from(await raw(old)).equals(want) && old.headers.get('cache-control') === 'private, no-cache');
    const forged = await get(`/g/meme-kart/play?v=${v}`, { 'x-forwarded-host': 'evil.example' });
    ok('a forwarded host it does not know is never kept at an edge (its CSP names that host)', forged.headers.get('cache-control') === 'private, no-cache' && /connect-src https?:\/\/evil\.example\/assets\//.test(forged.headers.get('content-security-policy') ?? ''));
    const nm = await get(`/g/meme-kart/play?v=${v}`, { 'if-none-match': `W/"${v}"` });
    const nm2 = await get('/g/meme-kart/play', { 'if-none-match': `"${v}", "other"` });
    ok('the browser\'s copy is confirmed with a 304 and no body (weak or strong tag, in a list)', nm.status === 304 && (await raw(nm)).length === 0 && nm.headers.get('etag') === `W/"${v}"` && nm2.status === 304);
    ok('and a stale copy gets the page', (await get('/g/meme-kart/play', { 'if-none-match': 'W/"0123456789abcdef"' })).status === 200);
    // the compressed copies are made a moment after the first assembly
    let br: Response | undefined;
    for (let i = 0; i < 50; i++) { br = await get('/g/meme-kart/play', { 'accept-encoding': 'gzip, deflate, br' }); if (br.headers.get('content-encoding') === 'br') break; await br.arrayBuffer(); await sleep(100); }
    const brBytes = Number(br!.headers.get('content-length'));
    ok('a browser that takes brotli gets it, the same bytes once decoded', br!.headers.get('content-encoding') === 'br' && Buffer.from(await raw(br!)).equals(want) && br!.headers.get('vary')?.toLowerCase().includes('accept-encoding') === true,
      `${(brBytes / 1e3).toFixed(0)} KB for ${(want.length / 1e3).toFixed(0)} KB`);
    const gz = await get('/g/meme-kart/play', { 'accept-encoding': 'gzip' });
    ok('one that takes gzip only gets gzip', gz.headers.get('content-encoding') === 'gzip' && Buffer.from(await raw(gz)).equals(want), `${(Number(gz.headers.get('content-length')) / 1e3).toFixed(0)} KB`);
    const none = await get('/g/meme-kart/play', { 'accept-encoding': 'br;q=0, gzip;q=0' });
    ok('and one that refuses both gets the page as it is', !none.headers.get('content-encoding') && Buffer.from(await raw(none)).equals(want));
    ok('a game nobody has is a 404', (await get(`/g/no-such-game-${randomUUID().slice(0, 6)}/play`)).status === 404);
  }

  // a play counted from the game page's view beacon, not from the frame's document (a throwaway game, removed after)
  const id = `playscale-${randomUUID().slice(0, 8)}`, slug = id, visitor = `playscale${randomUUID().replace(/-/g, '')}`;
  const ref = readFileSync(join(ROOT, 'lib/runtime/reference-world.js'), 'utf8');
  db.prepare(`INSERT INTO games (id, slug, title, tagline, blurb, difficulty, spec, prompt, featured, created_at, format, code, meta) VALUES (?, ?, 'Play scale check', '', '', 'endless', '{}', NULL, 0, ?, 'world', ?, '{}')`).run(id, slug, Date.now(), ref);
  const plays = () => (db.prepare('SELECT plays FROM games WHERE id = ?').get(id) as { plays: number }).plays;
  const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
  const hit = (p: string, ua = UA) => fetch(`${BASE}/api/hit`, { method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': ua, 'sec-fetch-site': 'same-origin' }, body: JSON.stringify({ v: visitor, k: 'view', p }) });
  try {
    await fetch(`${BASE}/g/${slug}/play`, { headers: { 'user-agent': UA } }).then((r) => r.arrayBuffer());
    await fetch(`${BASE}/g/${slug}/play?preview=1`, { headers: { 'user-agent': UA } }).then((r) => r.arrayBuffer());
    ok('loading the frame\'s document counts nothing (it may come from memory, a browser\'s cache or an edge)', plays() === 0);
    await hit(`/g/${slug}`);
    ok('opening the game\'s page (its view beacon) is a play', plays() === 1);
    await hit(`/g/${slug}/`); await hit(`/g/${slug}/edit`); await hit(`/g/${slug}`, 'Mozilla/5.0 HeadlessChrome/131.0'); await hit(`/mog/${slug}`);
    ok('another page, a bot and a Mog page are not; the same page with a trailing slash is', plays() === 2, String(plays()));
    db.prepare('UPDATE games SET hidden = 1 WHERE id = ?').run(id);
    await hit(`/g/${slug}`);
    ok('a world taken down is not counted', plays() === 2);
    db.prepare('UPDATE games SET meta = ? WHERE id = ?').run(JSON.stringify({ unlisted: 1 }), id);
    await hit(`/g/${slug}`);
    ok('an unlisted one, played from its link, is', plays() === 3);
  } finally {
    db.prepare('DELETE FROM events WHERE visitor = ?').run(visitor);
    db.prepare('DELETE FROM games WHERE id = ?').run(id);
  }
  ok('its throwaway game and events are gone', !db.prepare('SELECT 1 FROM games WHERE id = ?').get(id) && !db.prepare('SELECT 1 FROM events WHERE visitor = ?').get(visitor));
}

/* ------------------------------------------------------------ 3. bench -- */
async function child(which: 'serve-before' | 'serve-now') {
  const p = spawn(process.execPath, ['--expose-gc', '--import', './scripts/ts-resolve.mjs', 'scripts/play-scale-check.ts', which], { cwd: ROOT, env: { ...process.env, NODE_ENV: 'production' }, stdio: ['ignore', 'pipe', 'inherit'] });
  const port = await new Promise<number>((res, rej) => {
    let out = '';
    p.stdout.on('data', (d) => { out += d; const m = /PORT (\d+)/.exec(out); if (m) res(Number(m[1])); });
    p.on('exit', (c) => rej(new Error(`${which} exited ${c}`)));
  });
  return { base: `http://127.0.0.1:${port}`, stop: () => p.kill() };
}

type Run = { ms: number[]; serverMs: number[]; bytes: number; wall: number };
async function load(base: string, path: string, n: number, conc: number, enc: string): Promise<Run> {
  const out: Run = { ms: [], serverMs: [], bytes: 0, wall: 0 };
  const t0 = performance.now();
  let next = 0;
  const worker = async () => {
    while (next < n) {
      next++;
      const t = performance.now();
      const r = await fetch(`${base}${path}`, { headers: { 'accept-encoding': enc } });
      const b = await r.arrayBuffer();
      out.ms.push(performance.now() - t);
      out.serverMs.push(Number(r.headers.get('x-server-ms') ?? 0));
      out.bytes += Number(r.headers.get('content-length') ?? b.byteLength);
    }
  };
  await Promise.all(Array.from({ length: conc }, worker));
  out.wall = performance.now() - t0;
  return out;
}
const pct = (a: number[], q: number) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
const fmt = (r: Run) => `${r.serverMs.some(Boolean) ? `server ${pct(r.serverMs, 0.5).toFixed(1)} ms p50 / ${pct(r.serverMs, 0.95).toFixed(1)} p95, ` : ''}latency ${pct(r.ms, 0.5).toFixed(0)} ms p50 / ${pct(r.ms, 0.95).toFixed(0)} p95, ${(r.ms.length / (r.wall / 1000)).toFixed(0)} req/s, ${(r.bytes / r.ms.length / 1e3).toFixed(0)} KB each`;

if (mode === 'all' || mode === 'bench') {
  console.log('\nBench (production mode, one child server each, this machine; 1 at a time x20, then 50 at once x200)');
  const enc = 'gzip, deflate, br';
  for (const which of ['serve-before', 'serve-now'] as const) {
    const s = await child(which);
    try {
      for (const slug of BENCH_SLUGS) {
        if (!db.prepare('SELECT 1 FROM games WHERE slug = ?').get(slug)) { console.log(`  (no ${slug} in the local database: node deploy/migrate.mjs)`); continue; }
        const v = which === 'serve-now' ? `?v=${sha(Buffer.from(before(db.prepare('SELECT id, slug, format, code, meta, spec FROM games WHERE slug = ?').get(slug) as unknown as Src), 'utf8')).slice(0, 16)}` : '';
        await load(s.base, `/g/${slug}/play${v}`, 3, 1, enc);
        if (which === 'serve-now') await sleep(400); // (its compressed copies)
        const one = await load(s.base, `/g/${slug}/play${v}`, 20, 1, enc), fifty = await load(s.base, `/g/${slug}/play${v}`, 200, 50, enc);
        console.log(`  ${which === 'serve-before' ? 'before' : 'now   '} ${slug.padEnd(15)} x1  ${fmt(one)}`);
        console.log(`  ${which === 'serve-before' ? 'before' : 'now   '} ${slug.padEnd(15)} x50 ${fmt(fifty)}`);
      }
      {
        const slugs = await (await fetch(`${s.base}/slugs`)).json() as string[];
        for (const slug of slugs) await (await fetch(`${s.base}/g/${slug}/play`, { headers: { 'accept-encoding': enc } })).arrayBuffer();
        await sleep(3000);
        const st = await (await fetch(`${s.base}/stats`)).json() as { cache: ReturnType<typeof playCacheStats>; rss: number; heapUsed: number; external: number; arrayBuffers: number };
        const mb = (n: number) => `${(n / 1048576).toFixed(0)} MB`;
        console.log(`  ${which === 'serve-before' ? 'before' : 'now   '} after every game once (${st.cache.entries} pages kept): cache ${mb(st.cache.bytes)} of ${mb(st.cache.cap)}, ${st.cache.evicted} evicted; server rss ${mb(st.rss)}, heap ${mb(st.heapUsed)}, buffers ${mb(st.arrayBuffers)}`);
        if (which === 'serve-now') ok('every game kept fits the cap', st.cache.bytes <= st.cache.cap && st.cache.entries === slugs.length);
      }
    } finally { s.stop(); }
  }
}

if (mode === 'all' || mode === 'bench') {
  // the same, now, through Next itself (BASE: the dev server, so slower than production, and shared)
  console.log(`\nNow, through Next at ${BASE}`);
  for (const slug of BENCH_SLUGS) {
    const g = db.prepare('SELECT id, slug, format, code, meta, spec FROM games WHERE slug = ?').get(slug) as unknown as Src | undefined;
    if (!g) continue;
    const path = `/g/${slug}/play?v=${sha(Buffer.from(before(g), 'utf8')).slice(0, 16)}`;
    await load(BASE, path, 3, 1, 'gzip, deflate, br'); await sleep(400);
    console.log(`  ${slug.padEnd(15)} x1  ${fmt(await load(BASE, path, 20, 1, 'gzip, deflate, br'))}`);
    console.log(`  ${slug.padEnd(15)} x50 ${fmt(await load(BASE, path, 200, 50, 'gzip, deflate, br'))}`);
  }
}

console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
