/**
 * Mog City episodes, end to end (3 Nov 2026; MogCity .scratch/moggable/PLAN.md 4.9). Part of `npm run check:platform`,
 * or alone: BASE=http://localhost:3939 node --import ./scripts/ts-resolve.mjs scripts/episode-platform-check.ts
 *
 * No paid call. An episode Mog runs in this process through the real build route (app/api/generate/route.ts POST), the
 * real build loop (lib/episode-build.ts) and the real Anthropic SDK, against a stand-in for the Messages API on
 * 127.0.0.1 that answers the build with a pack (Jane renamed, a new title, a real person named) and the real-name check
 * with that person; the test drive is reported as the creator's page would (Mog City's ready message, with the hash of
 * the story it loaded). Then, against the dev server (BASE, the same database): the draft publishes with its consent
 * and lineage, its page frames Mog City with ?story= at its story.json and shows the consent line and no board or
 * dare, the story is served with CORS for Mog City only, /play goes to Mog City, and scores and dares are refused.
 * Also: a consent the route cannot read is refused before anything is spent, and a pass naming an unconsented real
 * person is sent back. Needs /g/mog-city in the database (deploy/migrate.mjs 2026-11-03-mog-city) and, for the Mog
 * page's composer, a dev server started with EPISODE_MOGS=on (else it checks the dark page). Its throwaway rows go after.
 */
import { register } from 'node:module';
import { createServer, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { db, getGameBySlug, getDraft } from '../lib/db.ts';
import { submitDrive } from '../lib/test-drive.ts';
import { storyOf, packOf, episodeBase, MOG_CITY } from '../lib/episode.ts';
import { MOG_SOON } from '../lib/custom-game.ts';
import { withBrowser } from '../lib/browser.ts';
import type { GameRow } from '../lib/db.ts';

const ROOT = new URL('../', import.meta.url).href;
register('data:text/javascript,' + encodeURIComponent(`
  export async function resolve(s, c, next) {
    if (s === 'next/server') return next('next/server.js', c);
    if (s === 'next/headers') return next('next/headers.js', c);
    if (!s.startsWith('@/')) return next(s, c);
    for (const ext of ['', '.ts', '.tsx', '/index.ts']) { try { return await next(${JSON.stringify(ROOT)} + s.slice(2) + ext, c); } catch {} }
    return next(s, c);
  }`));

type Ok = (name: string, cond: boolean, detail?: string) => void;
type Ev = { type: string; [k: string]: unknown };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** An episode's frame address, as the page's props carry it (the frame itself is mounted in the browser, after its listener). */
const frameSrc = (html: string) => /src\\?":\\?"((?:https:\/\/mc\.gamemog\.com|http:\/\/(?:localhost|127\.0\.0\.1):\d+)\/\?embed=1(?:[^"\\]|\\u0026)*)/.exec(html)?.[1]?.replace(/\\u0026|&amp;/g, '&') ?? null;
const MC_RE = /^(?:https:\/\/mc\.gamemog\.com|http:\/\/(?:localhost|127\.0\.0\.1):\d+)\/\?embed=1(?:&host=[^&]+)?&game=/;

/* the stand-in Messages API: a build gets `reply`, the real-name check gets `names` */
const api = { builds: 0, checks: 0, reply: '', names: '{"people": [], "brands": []}' };
const sse = (res: ServerResponse, type: string, data: object) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
const usage = { input_tokens: 20_000, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
const server = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    let j: { stream?: boolean } = {};
    try { j = JSON.parse(body); } catch { /* a check */ }
    const msg = { id: `msg_${randomUUID().slice(0, 8)}`, type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', stop_sequence: null };
    if (!j.stream) {
      api.checks++;
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ ...msg, content: [{ type: 'text', text: api.names }], stop_reason: 'end_turn', usage: { ...usage, input_tokens: 3000, output_tokens: 40 } }));
    }
    api.builds++;
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
    sse(res, 'message_start', { message: { ...msg, content: [], stop_reason: null, usage } });
    sse(res, 'content_block_start', { index: 0, content_block: { type: 'text', text: '' } });
    for (let i = 0; i < api.reply.length; i += 4000) sse(res, 'content_block_delta', { index: 0, delta: { type: 'text_delta', text: api.reply.slice(i, i + 4000) } });
    sse(res, 'content_block_stop', { index: 0 });
    sse(res, 'message_delta', { delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 18_000 } });
    sse(res, 'message_stop', {});
    res.end();
  });
});

/**
 * The episode's frame in Chrome, with a stand-in Mog City (3 Nov, the owner: an episode counts as played when the player
 * finishes Mission 1). Runs when the dev server frames a local Mog City (EPISODE_MC_ORIGIN=http://localhost:<port>) and
 * that port is free: a page there does what Mog City does when framed (fetch ?story=, post ready with its SHA-256 to
 * ?host=, then { type: 'result', game, mission: 1, passed: true, story, secs }). Checked: the poster lifts on ready, the result is a finished run (/api/plays: the plays
 * table), and nothing reaches the scores.
 */
async function framedRun(ok: Ok, BASE: string, g: GameRow, html: string) {
  const src = frameSrc(html);
  const at = src ? new URL(src) : null;
  if (!at || !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(at.origin)) { console.log('  NOT RUN  the episode frame in Chrome with a stand-in Mog City: start the dev server with EPISODE_MC_ORIGIN=http://localhost:<free port>'); return; }
  const page = `<!doctype html><meta charset="utf-8"><body>stand-in<script>
  const q = new URLSearchParams(location.search), host = q.get('host'), game = q.get('game');
  fetch(q.get('story')).then((r) => r.text()).then(async (t) => {
    const h = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)))].map((b) => b.toString(16).padStart(2, '0')).join('');
    document.body.textContent = 'STAND-IN MOG CITY: ' + JSON.parse(t).cast.jane.name;
    parent.postMessage({ source: 'gamemog', type: 'ready', gameId: game, hash: h, story: { ok: true, id: 'standin', hash: h } }, host);
    // (a result for another pack, or another game, never counts; then the real one)
    setTimeout(() => parent.postMessage({ source: 'gamemog', type: 'result', game, mission: 1, passed: true, story: '0'.repeat(64), secs: 300 }, host), 300);
    setTimeout(() => parent.postMessage({ source: 'gamemog', type: 'result', game: 'another-game', mission: 1, passed: true, story: h, secs: 300 }, host), 450);
    setTimeout(() => parent.postMessage({ source: 'gamemog', type: 'result', game, mission: 1, passed: true, story: h, secs: 312 }, host), 600);
  });
</script>`;
  const mc = createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(page); });
  const listening = await new Promise<boolean>((r) => { mc.once('error', () => r(false)); mc.listen(Number(at.port), () => r(true)); });
  if (!listening) { console.log(`  NOT RUN  the episode frame in Chrome: ${at.origin} is taken (a real Mog City there is checked by hand, PHASE-C.md)`); return; }
  try {
    const before = (db.prepare('SELECT COUNT(*) AS n FROM plays WHERE game_id = ?').get(g.id) as { n: number }).n;
    const seen = await withBrowser(async (pg) => {
      await pg.goto(`${BASE}/g/${g.slug}`);
      for (let i = 0; i < 60; i++) {
        const lifted = await pg.eval<boolean>(`document.querySelector('#play .poster')?.dataset.hide === '1'`).catch(() => false);
        if (lifted && (db.prepare('SELECT COUNT(*) AS n FROM plays WHERE game_id = ?').get(g.id) as { n: number }).n > before) break;
        await sleep(500);
      }
      return { lifted: await pg.eval<boolean>(`document.querySelector('#play .poster')?.dataset.hide === '1'`), errors: pg.errors.slice(0, 4),
        frame: await pg.eval<{ src: string; sandbox: string; allow: string } | null>(`(() => { const f = document.querySelector('#play iframe'); return f && { src: f.src, sandbox: f.getAttribute('sandbox'), allow: f.getAttribute('allow') }; })()`) };
    }, { width: 1280, height: 800, timeoutMs: 90_000 });
    const plays = db.prepare('SELECT runs FROM plays WHERE game_id = ?').all(g.id) as { runs: number }[];
    const scores = (db.prepare('SELECT COUNT(*) AS n FROM scores WHERE game_id = ?').get(g.id) as { n: number }).n;
    ok('in Chrome, the episode frame is mounted with the measured attributes (sandbox with same-origin, pointer lock and popups; allow autoplay, fullscreen, gamepad, web-share, clipboard-write)',
      seen.frame?.src === src && seen.frame.sandbox === 'allow-scripts allow-same-origin allow-pointer-lock allow-popups allow-popups-to-escape-sandbox' && seen.frame.allow === 'autoplay; fullscreen; gamepad; web-share; clipboard-write', JSON.stringify(seen.frame));
    ok('in Chrome, the episode frame (a stand-in Mog City at the local origin, saying ready once, as Mog City does) reports ready, which lifts the poster', seen.lifted, JSON.stringify(seen.errors));
    ok('Mission 1 passed (type result, mission 1, passed, its game id, the served pack\'s hash, from Mog City\'s origin) is a finished run for the Mog-off and the player counts, once (a result for another pack or another game is not); nothing reaches a board',
      plays.length === 1 && plays[0].runs === 1 && before === 0 && scores === 0, JSON.stringify({ plays, scores }));
  } finally { mc.close(); }
}

type POST = (req: Request) => Promise<Response>;
/** One build through the route, its events read to the end; `drive` answers the drive as the creator's page would. */
async function build(POST: POST, body: Record<string, unknown>, drive?: (draftId: string, token: string) => void) {
  const res = await POST(new Request('http://127.0.0.1:3939/api/generate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  const events: Ev[] = [];
  if (!(res.headers.get('content-type') ?? '').includes('ndjson')) return { status: res.status, json: await res.json() as Record<string, unknown>, events };
  const reader = res.body!.getReader(), dec = new TextDecoder();
  let buf = '';
  const t = Date.now();
  while (Date.now() - t < 60_000) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
      if (!line.trim()) continue;
      const e = JSON.parse(line) as Ev;
      events.push(e);
      if (e.type === 'drive' && drive) setTimeout(() => drive(String(e.draftId), String(e.token)), 50);
    }
  }
  return { status: res.status, json: null, events };
}

export async function episodePlatformChecks(ok: Ok, BASE: string) {
  console.log('\nMog City episodes: the first-party episode and its Mog page');
  const parent = getGameBySlug('mog-city');
  if (!parent) { ok('/g/mog-city is in the database (node deploy/migrate.mjs)', false); return; }
  const page = async (path: string, init?: RequestInit) => { const r = await fetch(`${BASE}${path}`, { redirect: 'manual', ...init }); return { r, html: (await r.text()).replaceAll('<!-- -->', '') }; };
  const home = await page('/g/mog-city');
  const hs = frameSrc(home.html), hv = storyOf(parent.code)!.hash.slice(0, 16);
  ok('/g/mog-city plays Mog City in its frame (Mog City embedded, its game id, the story at its version)', home.r.status === 200 && !!hs && MC_RE.test(hs)
    && hs.includes(`&game=${parent.id}&story=${encodeURIComponent(`${new URL(BASE).origin}/g/mog-city/story.json?v=${hv}`)}`) && home.html.includes('Story episode'), hs ?? String(home.r.status));
  const mogPage = await page('/mog/mog-city');
  const lit = !mogPage.html.includes(MOG_SOON.replace(/'/g, '&#x27;')) && mogPage.html.includes('My Mog names a real person');
  if (lit) ok('the Mog page (EPISODE_MOGS=on) offers the episode composer: its ideas and the consent step', mogPage.html.includes('Rename the bank and every sign in the city') && mogPage.html.includes('Mog City loads it in your browser'));
  else ok('the Mog page (dark: EPISODE_MOGS is not on in the dev server) says Mogs are coming soon and offers no composer, and the game page has no Mog button', mogPage.html.includes(MOG_SOON.replace(/'/g, '&#x27;')) && !home.html.includes('href="/mog/mog-city"'));

  const env = { key: process.env.ANTHROPIC_API_KEY, token: process.env.ANTHROPIC_AUTH_TOKEN, base: process.env.ANTHROPIC_BASE_URL, mogs: process.env.EPISODE_MOGS, usd: process.env.BUILD_DAILY_USD, site: process.env.SITE_URL };
  const realFetch = globalThis.fetch;
  const tag = `epcheck-${randomUUID().slice(0, 6)}`;
  const games: string[] = [], drafts = new Set<string>();
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const port = (server.address() as { port: number }).port;
  try {
    process.env.ANTHROPIC_API_KEY = 'stand-in-key-for-the-local-check'; delete process.env.ANTHROPIC_AUTH_TOKEN;
    process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${port}`;
    process.env.EPISODE_MOGS = 'on'; process.env.BUILD_DAILY_USD = '1000000'; process.env.SITE_URL = new URL(BASE).origin;
    // nothing leaves this machine but the dev server
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      if (!url.startsWith('http://127.0.0.1:') && !url.startsWith(new URL(BASE).origin)) return Promise.reject(new Error(`the episode check refused a call to ${url}`));
      return realFetch(input, init);
    }) as typeof fetch;
    const { POST } = await import('../app/api/generate/route.ts') as { POST: POST };

    console.log('\nMog City episodes: a Mog, built against a stand-in model');
    const pack = JSON.parse(JSON.stringify(packOf(parent.code) ?? episodeBase().pack));
    pack.title.episode = `Night Shift ${tag}`.slice(0, 40); pack.cast.jane.name = 'Rosa'; pack.names.bank = 'Harbor Trust'; pack.car.paint = '#20406A';
    const firstLine = Object.keys(pack.lines).find((id) => pack.lines[id][0] === 'jane')!;
    pack.lines[firstLine] = ['jane', 'Elon Musk says hi. Now drive.'];
    api.reply = '```json\n{"tagline":"Rosa runs the night.","blurb":"The same city, a new voice on the phone. Rosa calls the shots tonight.","people":["Elon Musk"],"brands":[]}\n```\n\n```json\n' + JSON.stringify(pack) + '\n```';
    api.names = '{"people": ["Elon Musk"], "brands": []}';

    const calls0 = api.builds + api.checks;
    const refused = await build(POST, { mogOf: 'mog-city', prompt: `Make Jane the boss ${tag}`, consent: { names: ['Elon Musk'], basis: 'maybe', adult: true } });
    ok('a consent the route cannot read is refused before anything is spent', refused.status === 400 && (refused.json as { field?: string })?.field === 'consent' && api.builds + api.checks === calls0);

    const sent = await build(POST, { mogOf: 'mog-city', prompt: `Make Jane the boss ${tag}`, consent: null });
    const err = sent.events.find((e) => e.type === 'error') as { problems?: string[] } | undefined;
    ok('a pass naming a real person nobody consented for is sent back for an original name (and the build ends without it)', !!err && (err.problems ?? []).some((p) => /Real people are named only with their consent/.test(p)) && !sent.events.some((e) => e.type === 'done'),
      JSON.stringify(err ?? sent.events.at(-1)).slice(0, 300));

    let drove: string | null = null;
    const made = await build(POST, { mogOf: 'mog-city', prompt: `Make Jane the boss ${tag}`, consent: { names: ['Elon Musk'], basis: 'permission', adult: true } }, (draftId, token) => {
      drafts.add(draftId);
      const d = getDraft(draftId)!, s = storyOf(d.code)!;
      drove = s.hash;
      submitDrive(draftId, token, { kind: 'episode', ready: true, readyMs: 9000, hash: s.hash, story: { ok: true, id: 'night-shift', hash: s.hash } }, {});
    });
    const done = made.events.find((e) => e.type === 'done') as { draftId: string; meta: { title: string; consent?: unknown }; runtime: { ran?: boolean; ok?: boolean; kind?: string; status?: string } } | undefined;
    ok('with the consent, the Mog passes: the gate, the real-name check and a drive that saw this very pack', !!done && !!drove && done.runtime.ran === true && done.runtime.status === 'passed' && done.runtime.kind === 'episode', JSON.stringify(made.events.filter((e) => e.type !== 'progress' && e.type !== 'tick').map((e) => e.type)));
    if (!done) return;
    drafts.add(done.draftId);
    ok(`its title is ${MOG_CITY}: <its title>, and its meta carries the consent (no browser id)`, done.meta.title === `${MOG_CITY}: ${pack.title.episode}` && JSON.stringify(done.meta.consent).includes('"basis":"permission"') && !('player' in (done.meta.consent as object)));
    const ds = await page(`/d/${done.draftId}/story.json`, { headers: { origin: 'https://mc.gamemog.com' } });
    ok('the draft\'s story is served for its preview, readable by Mog City', ds.r.status === 200 && ds.r.headers.get('access-control-allow-origin') === 'https://mc.gamemog.com' && JSON.parse(ds.html).cast.jane.name === 'Rosa');
    const dp = await page(`/d/${done.draftId}/play`);
    ok('the draft\'s /play goes to Mog City with the draft\'s story', dp.r.status === 302 && /^(?:https:\/\/mc\.gamemog\.com|http:\/\/(?:localhost|127\.0\.0\.1):\d+)\/\?embed=1(?:&host=[^&]+)?&game=draft-/.test(dp.r.headers.get('location') ?? '') && (dp.r.headers.get('location') ?? '').includes(`&game=draft-${done.draftId}&story=`) && decodeURIComponent(dp.r.headers.get('location')!).endsWith(`/d/${done.draftId}/story.json`));

    console.log('\nMog City episodes: published');
    const pub = await realFetch(`${BASE}/api/games`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ draftId: done.draftId, player: randomUUID() }) });
    const pj = await pub.json() as { id?: string; slug?: string };
    ok('the episode Mog publishes from its draft', pub.ok && !!pj.slug, JSON.stringify(pj));
    if (!pj.slug || !pj.id) return;
    games.push(pj.id);
    const g = getGameBySlug(pj.slug)!;
    ok('it joins Mog City\'s family, generation 1, with key art made from its own title', g.parent_id === parent.id && g.root_id === parent.id && g.generation === 1
      && (() => { const art = (id: string) => db.prepare('SELECT cover, art_wide FROM games WHERE id = ?').get(id) as { cover: Uint8Array | null; art_wide: Uint8Array | null };
        const a = art(g.id), b = art(parent.id); return !!a.cover && !!a.art_wide && !!b.art_wide && !Buffer.from(a.art_wide).equals(Buffer.from(b.art_wide)); })());
    const gm = JSON.parse(g.meta ?? '{}') as { mode?: string; scoring?: string; consent?: { names?: string[] } };
    ok('its stored meta: an episode with no board, its consent kept', gm.mode === 'episode' && gm.scoring === 'none' && gm.consent?.names?.[0] === 'Elon Musk');
    const v = storyOf(g.code)!.hash.slice(0, 16), story = `${new URL(BASE).origin}/g/${g.slug}/story.json?v=${v}`;
    const gp = await page(`/g/${g.slug}`);
    ok('its page frames Mog City with ?story= at its story.json, and shows the consent line', gp.r.status === 200 && MC_RE.test(frameSrc(gp.html) ?? '') && (frameSrc(gp.html) ?? '').endsWith(`&game=${g.id}&story=${encodeURIComponent(story)}`)
      && gp.html.includes('Names a real person, with consent stated by its creator.') && gp.html.includes(`${MOG_CITY}: Night Shift`));
    ok('its page has no leaderboard and no dare, and credits Mog City', !gp.html.includes('Leaderboard') && !/>Dare</.test(gp.html) && gp.html.includes('Remixed from') && gp.html.includes('MOG CITY: Unfinished Business'));
    const sMc = await page(`/g/${g.slug}/story.json?v=${v}`, { headers: { origin: 'https://mc.gamemog.com' } });
    const sOther = await page(`/g/${g.slug}/story.json?v=${v}`, { headers: { origin: 'https://example.com' } });
    ok('its story.json is the pack, readable across origins by Mog City only, with an ETag on its hash',
      sMc.r.status === 200 && sMc.r.headers.get('access-control-allow-origin') === 'https://mc.gamemog.com' && sOther.r.status === 200 && !sOther.r.headers.get('access-control-allow-origin')
        && sMc.html === storyOf(g.code)!.text && (sMc.r.headers.get('etag') ?? '').includes(v) && (sMc.r.headers.get('content-type') ?? '').startsWith('application/json'));
    const again = await page(`/g/${g.slug}/story.json?v=${v}`, { headers: { 'if-none-match': sMc.r.headers.get('etag') ?? '' } });
    ok('a story the browser holds is answered 304', again.r.status === 304);
    const play = await page(`/g/${g.slug}/play`);
    ok('/play goes to Mog City with its story', play.r.status === 302 && (play.r.headers.get('location') ?? '').endsWith(`&game=${g.id}&story=${encodeURIComponent(story)}`));
    const sc = await realFetch(`${BASE}/api/scores`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ gameId: g.id, player: 'x', level: 1, timeMs: 1000, finished: true }) });
    const dr = await realFetch(`${BASE}/api/dares`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ gameId: g.id, sender: randomUUID() }) });
    ok('scores and dares are refused for an episode', sc.status === 422 && dr.status === 409, `${sc.status} / ${dr.status}`);
    await framedRun(ok, BASE, g, gp.html);
    const none = await page(`/g/${(db.prepare("SELECT slug FROM games WHERE slug = 'aspen-gp' OR slug = 'meme-kart' LIMIT 1").get() as { slug: string } | undefined)?.slug ?? 'meme-kart'}/story.json`);
    ok('a game that is not an episode has no story', none.r.status === 404);
  } finally {
    globalThis.fetch = realFetch;
    for (const [k, val] of [['ANTHROPIC_API_KEY', env.key], ['ANTHROPIC_AUTH_TOKEN', env.token], ['ANTHROPIC_BASE_URL', env.base], ['EPISODE_MOGS', env.mogs], ['BUILD_DAILY_USD', env.usd], ['SITE_URL', env.site]] as const) {
      if (val === undefined) delete process.env[k]; else process.env[k] = val;
    }
    server.close();
    for (const id of games) { db.prepare('DELETE FROM plays WHERE game_id = ?').run(id); db.prepare('DELETE FROM scores WHERE game_id = ?').run(id); db.prepare('DELETE FROM games WHERE id = ?').run(id); }
    for (const id of drafts) db.prepare('DELETE FROM drafts WHERE id = ?').run(id);
    db.prepare('DELETE FROM generations WHERE prompt LIKE ?').run(`%${tag}%`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let failures = 0;
  await episodePlatformChecks((name, cond, detail = '') => { console.log(`${cond ? '  ok  ' : '  FAIL'}  ${name}${detail ? `: ${detail}` : ''}`); if (!cond) failures++; }, process.env.BASE ?? 'http://localhost:3939');
  console.log(`\n${failures ? `${failures} FAILED` : 'all episode checks passed'}\n`);
  process.exit(failures ? 1 : 0);
}
