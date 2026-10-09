/**
 * The owner's four safety limits on builds, checked (9 Oct).  Part of `npm run check:platform`, or on its own:
 * node --import ./scripts/ts-resolve.mjs scripts/build-limits-check.ts
 *
 * No paid call. Builds run in this process through the real route (app/api/generate/route.ts POST), the real
 * generateGame and the real Anthropic SDK, against a stand-in for the Messages API on 127.0.0.1 (ANTHROPIC_BASE_URL)
 * that streams what each check needs: a world (the reference world, with usage counters of its own), a pass that
 * never ends, or a refusal of the request; any call that would leave this machine is refused. The test drive is the
 * creator's browser's (GAMEMOG_DRIVE=browser), reported here as the page would (lib/test-drive.ts submitDrive).
 * Checked: (1) a creator who leaves, by the request's abort or by the stream's cancel, stops the pass at the model
 * and the test drive's wait at once, no further pass runs, and the build is logged 'abandoned', while a page that
 * asks the drive to hold (a tab in the background) keeps its build; (2) with BUILD_SLOTS builds running (3 by
 * default) the next is told GameMog is busy at once, before any model call, and a slot is free again after an
 * abort or an error; (3) the build's row is there from its start ('running', with its kind, its parent or its
 * photo) and finished at its end, and a restart marks what was left 'running' as 'interrupted'; (4) each pass's
 * usage is summed and priced from the one table. Its throwaway rows, drafts and game are removed afterwards.
 * With the dev server (BASE, as `check:platform` passes it; NOBROWSER=1 skips it), the page itself in Chrome: a
 * creator who leaves the Create page within the site (a header link, Back) lets the build's request go, and one who
 * stays reads it to its end. Its /api/generate is answered in the page by a stand-in stream and the request is
 * blocked besides, so the dev server builds nothing and nothing is spent.
 */
import { register } from 'node:module';
import { createServer, type ServerResponse } from 'node:http';
import { readFileSync, copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { db, insertDraft, publishDraft, slugify, interruptBuilds, getGameBySlug } from '../lib/db.ts';
import { submitDrive, holdDrive } from '../lib/test-drive.ts';
import { priceBuild, slotsHeld, BUSY, PRICES } from '../lib/build-limits.ts';
import { interruptBuilds as bootInterrupt } from '../deploy/builds.mjs';
import { withBrowser } from '../lib/browser.ts';

// the app's own "@/" imports (tsconfig paths) for the route, and Next's "next/server", which has no exports map
const ROOT = new URL('../', import.meta.url).href;
register('data:text/javascript,' + encodeURIComponent(`
  export async function resolve(s, c, next) {
    if (s === 'next/server') return next('next/server.js', c);
    if (!s.startsWith('@/')) return next(s, c);
    for (const ext of ['', '.ts', '.tsx', '/index.ts']) { try { return await next(${JSON.stringify(ROOT)} + s.slice(2) + ext, c); } catch {} }
    return next(s, c);
  }`));

type Ok = (name: string, cond: boolean, detail?: string) => void;
type Ev = { type: string; [k: string]: unknown };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (cond: () => boolean, ms = 5000) => { const t = Date.now(); while (!cond() && Date.now() - t < ms) await sleep(20); return cond(); };
// a build's stream to its end, or false after `ms`: a build that never stops fails its check rather than hanging it
const ends = (b: { ended: Promise<void> }, ms = 20_000) => Promise.race([b.ended.then(() => true), sleep(ms).then(() => false)]);
const WORLD = readFileSync(new URL('../lib/runtime/reference-world.js', import.meta.url), 'utf8');
const META = { title: 'Limits Check', tagline: 'A check of the build limits.', blurb: 'Made by the build limits check and removed after it.', genre: 'Test', cast: [{ name: 'Pip', color: '#F2E3C4', role: 'player' }, { name: 'Rook', color: '#3A5BA0', role: 'rival' }], palette: { sky: '#9CCBEB', ground: '#7DB356', accent: '#F28C28' } };
const REPLY = '```json\n' + JSON.stringify(META) + '\n```\n\n```javascript\n' + WORLD + '\n```\n';

/* ----------------------------------------------- the stand-in Messages API -- */
type Start = { input: number; write: number; read: number };
type Reply = { kind: 'world'; start: Start; out: number } | { kind: 'hang'; start: Start } | { kind: 'refuse' };
const api = { calls: 0, open: 0, cut: 0, queue: [] as Reply[] };
const sse = (res: ServerResponse, type: string, data: object) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
const server = createServer((req, res) => {
  req.resume();
  req.on('end', () => {
    api.calls++;
    const r = api.queue.shift() ?? { kind: 'refuse' };
    if (r.kind === 'refuse') {
      res.writeHead(400, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'the build limits check refused this request' } }));
    }
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
    api.open++;
    res.on('close', () => { api.open--; if (!res.writableFinished) api.cut++; });
    sse(res, 'message_start', { message: { id: `msg_${randomUUID().slice(0, 8)}`, type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', content: [], stop_reason: null, stop_sequence: null,
      usage: { input_tokens: r.start.input, output_tokens: 1, cache_creation_input_tokens: r.start.write, cache_read_input_tokens: r.start.read, cache_creation: { ephemeral_5m_input_tokens: r.start.write, ephemeral_1h_input_tokens: 0 } } } });
    sse(res, 'content_block_start', { index: 0, content_block: { type: 'text', text: '' } });
    if (r.kind === 'hang') { sse(res, 'content_block_delta', { index: 0, delta: { type: 'text_delta', text: '```json\n' } }); return; }
    for (let i = 0; i < REPLY.length; i += 4000) sse(res, 'content_block_delta', { index: 0, delta: { type: 'text_delta', text: REPLY.slice(i, i + 4000) } });
    sse(res, 'content_block_stop', { index: 0 });
    sse(res, 'message_delta', { delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: r.out } });
    sse(res, 'message_stop', {});
    res.end();
  });
});

/* ------------------------------------------------------------- a build -- */
type POST = (req: Request) => Promise<Response>;
type Build = { events: Ev[]; ended: Promise<void>; ctl: AbortController; res: Response; cancel: () => Promise<void>; json?: { error?: string; busy?: boolean } };
/** One request to the route, read as the creator's page reads it; `on` sees each event as it comes. */
async function build(POST: POST, body: Record<string, unknown>, on?: (e: Ev, b: Build) => unknown): Promise<Build> {
  const ctl = new AbortController();
  const res = await POST(new Request('http://127.0.0.1:3939/api/generate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal }));
  const b: Build = { events: [], ended: Promise.resolve(), ctl, res, cancel: async () => {} };
  if (!(res.headers.get('content-type') ?? '').includes('ndjson')) { b.json = await res.json(); return b; }
  const reader = res.body!.getReader(), dec = new TextDecoder();
  b.cancel = () => reader.cancel();
  b.ended = (async () => {
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read().catch(() => ({ value: undefined, done: true }));
      if (done) return;
      buf += dec.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
        if (!line.trim()) continue;
        const e = JSON.parse(line) as Ev;
        b.events.push(e);
        await on?.(e, b);
      }
    }
  })();
  return b;
}

/** What the creator's page would post after driving a draft: a run that reached `level` (4 passes, 1 does not). */
function driven(level: number) {
  const cover = 'data:image/jpeg;base64,' + Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(30_000, 7)]).toString('base64');
  return { raw: { ready: true, runtime: true, readyMs: 1800, fps: 60, levelReached: level, results: 1, errors: [], advisories: [] }, images: { cover } };
}
type GenRow = { id: number; status: string | null; kind: string | null; parent_slug: string | null; parent_chars: number | null; prompt_chars: number | null; photo: number | null; started_at: number | null;
  attempts: number; ok: number; ms: number; draft_id: string | null; usage: string | null; cost_usd: number | null; findings: string; model: string };
const rowOf = (tag: string) => db.prepare('SELECT * FROM generations WHERE prompt LIKE ? ORDER BY id DESC LIMIT 1').get(`%${tag}%`) as GenRow | undefined;
const cost = (s: Start, out: number) => (s.input * PRICES['claude-sonnet-5-5'].input + s.write * PRICES['claude-sonnet-5-5'].write5m + s.read * PRICES['claude-sonnet-5-5'].read + out * PRICES['claude-sonnet-5-5'].output) / 1e6;
const near = (a: number | null | undefined, b: number) => a != null && Math.abs(a - b) < 1e-6;

export async function buildLimitsChecks(ok: Ok, base?: string) {
  const tag = `limitscheck-${randomUUID().slice(0, 6)}`;
  const env = { key: process.env.ANTHROPIC_API_KEY, token: process.env.ANTHROPIC_AUTH_TOKEN, base: process.env.ANTHROPIC_BASE_URL, drive: process.env.GAMEMOG_DRIVE, slots: process.env.BUILD_SLOTS };
  const realFetch = globalThis.fetch;
  const drafts = new Set<string>();
  let parentId: string | null = null;
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const port = (server.address() as { port: number }).port;
  try {
    // nothing may leave this machine: the model is the stand-in above, and any other host is refused outright
    process.env.ANTHROPIC_API_KEY = 'stand-in-key-for-the-local-check'; delete process.env.ANTHROPIC_AUTH_TOKEN;
    process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${port}`;
    process.env.GAMEMOG_DRIVE = 'browser'; delete process.env.BUILD_SLOTS;
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      if (!url.startsWith('http://127.0.0.1:')) return Promise.reject(new Error(`the build limits check refused a call to ${url}`));
      return realFetch(input, init);
    }) as typeof fetch;
    const { POST } = await import('../app/api/generate/route.ts') as { POST: POST };

    console.log('\nBuild limits: what a build costs (lib/build-limits.ts)');
    {
      const one = priceBuild([{ attempt: 1, model: 'claude-sonnet-5-5', usage: { input_tokens: 1000, output_tokens: 3000, cache_creation_input_tokens: 10_000, cache_read_input_tokens: 20_000 } }]);
      ok('a pass is priced from the table: input $2, a 5-minute cache write $2.50, a cache read $0.20, output (thinking included) $10 per million', near(one.usd, (1000 * 2 + 10_000 * 2.5 + 20_000 * 0.2 + 3000 * 10) / 1e6), String(one.usd));
      const hour = priceBuild([{ attempt: 1, model: 'claude-sonnet-5-5', usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 10_000, cache_read_input_tokens: 0, cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 10_000 } } }]);
      ok('an hour\'s cache write is priced as one ($4 per million)', near(hour.usd, 0.04), String(hour.usd));
      const fell = priceBuild([{ attempt: 1, model: 'claude-sonnet-5', usage: { input_tokens: 900, output_tokens: 2000, iterations: [
        { type: 'message', model: 'claude-sonnet-5-5', input_tokens: 800, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
        { type: 'fallback_message', model: 'claude-sonnet-5', input_tokens: 900, output_tokens: 2000, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }] } }]);
      ok('a pass that fell back is billed by its iterations, each by its own model', near(fell.usd, (800 * 2 + 900 * 2 + 2000 * 10) / 1e6) && fell.usage.input === 1700, `${fell.usd}, input ${fell.usage.input}`);
      const odd = priceBuild([{ attempt: 1, model: 'claude-made-up-9', usage: { input_tokens: 1_000_000, output_tokens: 0 } }]);
      ok('a model not in the table is priced as the dearest in it, and named', odd.usd === Math.max(...Object.values(PRICES).map((p) => p.input)) && odd.usage.unpriced?.[0] === 'claude-made-up-9', JSON.stringify(odd));
      const sum = priceBuild([{ attempt: 1, model: 'claude-sonnet-5-5', usage: { input_tokens: 10, output_tokens: 20 } }, { attempt: 2, model: 'claude-sonnet-5-5', usage: { input_tokens: 30, output_tokens: 1 }, partial: true }]);
      ok('passes are summed, and one cut short marks the build\'s cost a floor', sum.usage.input === 40 && sum.usage.output === 21 && sum.usage.passes.length === 2 && sum.usage.partial === true && near(sum.usd, (40 * 2 + 21 * 10) / 1e6), JSON.stringify(sum.usage));
    }

    console.log('\nBuild limits: the build log, from its start, with its real cost');
    const cols = (db.prepare('PRAGMA table_info(generations)').all() as { name: string }[]).map((c) => c.name);
    ok('the generations table has the build log\'s columns (added in place, nullable)', ['status', 'started_at', 'kind', 'parent_slug', 'parent_chars', 'prompt_chars', 'photo', 'draft_id', 'usage', 'cost_usd'].every((c) => cols.includes(c)), cols.join(','));
    {
      const A: Start = { input: 1200, write: 30_000, read: 0 }, B: Start = { input: 6000, write: 5000, read: 30_000 };
      api.queue.push({ kind: 'world', start: A, out: 5000 }, { kind: 'world', start: B, out: 4000 });
      const calls = api.calls, prompt = `${tag} s1 a reed marsh at dusk with herons`;
      let atDrive: GenRow | undefined, held = false, heldRow: GenRow | undefined;
      const photo = { mediaType: 'image/png', data: Buffer.alloc(300, 1).toString('base64') };
      const b = await build(POST, { prompt, image: photo }, async (e) => {
        if (e.type !== 'drive') return;
        drafts.add(String(e.draftId));
        if (e.attempt === 1) { atDrive = rowOf(`${tag} s1`); const d = driven(1); submitDrive(String(e.draftId), String(e.token), d.raw, d.images); return; }
        // the second drive: the page's tab is in the background and asks to be waited for; the build waits, still running
        held = holdDrive(String(e.draftId), String(e.token)); await sleep(150); heldRow = rowOf(`${tag} s1`);
        const d = driven(5); submitDrive(String(e.draftId), String(e.token), d.raw, d.images);
      });
      await ends(b);
      const r = rowOf(`${tag} s1`), done = b.events.find((e) => e.type === 'done');
      if (done) drafts.add(String(done.draftId));
      const usage = r?.usage ? JSON.parse(r.usage) as { input: number; output: number; cacheWrite: number; cacheRead: number; passes: unknown[] } : null;
      ok('the row is there from the start: running, a Create, with the request\'s length and its photo', atDrive?.status === 'running' && atDrive.kind === 'create' && atDrive.prompt_chars === prompt.length && atDrive.photo === 1 && !!atDrive.started_at && atDrive.model.includes('+vision'), JSON.stringify(atDrive && { status: atDrive.status, kind: atDrive.kind, chars: atDrive.prompt_chars, photo: atDrive.photo }));
      ok('a pass\'s cost is in the row as soon as the pass ends', near(atDrive?.cost_usd, cost(A, 5000)), String(atDrive?.cost_usd));
      ok('a page that asks the drive to hold (its tab in the background) keeps its build: still running', held && heldRow?.status === 'running');
      ok('the build ran two passes at the model and came back a world', api.calls - calls === 2 && !!done, `calls ${api.calls - calls}, ${b.events.filter((e) => e.type === 'error').map((e) => e.error).join(' ')}`);
      ok('the row is finished at the end: done, two passes, its draft, its time', r?.status === 'done' && r.ok === 1 && r.attempts === 2 && !!done && r.draft_id === done.draftId && r.ms > 0 && r.findings === '[]', JSON.stringify(r && { status: r.status, attempts: r.attempts, draft: r.draft_id }));
      ok('its usage is the two passes summed, and its cost theirs priced', !!usage && usage.input === A.input + B.input && usage.output === 9000 && usage.cacheWrite === A.write + B.write && usage.cacheRead === B.read && usage.passes.length === 2 && near(r?.cost_usd, cost(A, 5000) + cost(B, 4000)), `${r?.usage} $${r?.cost_usd}`);
      ok('its slot is free again', slotsHeld() === 0, String(slotsHeld()));
    }

    console.log('\nBuild limits: a build stops when the creator leaves');
    {
      // a Mog of a throwaway game made from the reference world (so nothing of its parent is dropped)
      const id = randomUUID(), gid = randomUUID(), slug = slugify(`${tag} Parent`);
      insertDraft({ id, prompt: `${tag} parent`, format: 'world', code: WORLD, report: { ok: true, ran: true }, meta: { ...META, title: `${tag} Parent`.slice(0, 40), runtime: 1 } });
      publishDraft(id, slug, gid); parentId = gid; db.prepare('DELETE FROM drafts WHERE id = ?').run(id);
      const parent = getGameBySlug(slug)!;
      api.queue.push({ kind: 'hang', start: { input: 9000, write: 40_000, read: 0 } });
      const calls = api.calls, cut = api.cut;
      let atStart: GenRow | undefined, t0 = 0;
      const b = await build(POST, { mogOf: slug, prompt: `make it night ${tag} s2` }, (e, me) => {
        if (e.type === 'stage' && e.stage === 'writing') { atStart = rowOf(`${tag} s2`); t0 = Date.now(); me.ctl.abort(); }
      });
      await ends(b);
      const ms = Date.now() - t0;
      await until(() => api.cut > cut, 3000);
      await sleep(600);
      const r = rowOf(`${tag} s2`), usage = r?.usage ? JSON.parse(r.usage) as { partial?: boolean } : null;
      ok('a Mog\'s row is there from the start: running, with its parent and the size of its code', atStart?.status === 'running' && atStart.kind === 'mog' && atStart.parent_slug === slug && atStart.parent_chars === parent.code!.length, JSON.stringify(atStart && { kind: atStart.kind, parent: atStart.parent_slug, chars: atStart.parent_chars }));
      ok('the request\'s abort cuts the pass off at the model at once', api.cut > cut && ms < 3000, `${api.cut - cut} cut, the build ended ${ms} ms after`);
      ok('no further pass runs', api.calls - calls === 1, `${api.calls - calls} calls`);
      ok('the build is logged abandoned, with what its cut pass had used (a floor)', r?.status === 'abandoned' && r.ok === 0 && r.attempts === 1 && !!usage?.partial && near(r.cost_usd, cost({ input: 9000, write: 40_000, read: 0 }, 1)), JSON.stringify(r && { status: r.status, cost: r.cost_usd, usage: r.usage }));
      ok('the creator who left is sent no error', !b.events.some((e) => e.type === 'error'));
      ok('its slot is free again', slotsHeld() === 0, String(slotsHeld()));
    }
    {
      // the other way a closed connection shows: the response stream is cancelled
      api.queue.push({ kind: 'hang', start: { input: 500, write: 0, read: 0 } });
      const calls = api.calls, cut = api.cut;
      const b = await build(POST, { prompt: `${tag} s3 a salt flat under a red moon` }, (e, me) => { if (e.type === 'stage' && e.stage === 'writing') void me.cancel(); });
      await ends(b);
      await until(() => api.cut > cut && slotsHeld() === 0 && rowOf(`${tag} s3`)?.status !== 'running', 3000);
      await sleep(400);
      ok('a cancelled stream stops the build the same way: cut at the model, no further pass, abandoned', api.cut > cut && api.calls - calls === 1 && rowOf(`${tag} s3`)?.status === 'abandoned' && slotsHeld() === 0, `${api.cut - cut} cut, ${api.calls - calls} calls, ${rowOf(`${tag} s3`)?.status}`);
    }
    {
      // the creator leaves while the build waits for the test drive (it would wait 4 minutes, or up to 15 on hold)
      api.queue.push({ kind: 'world', start: { input: 1000, write: 0, read: 0 }, out: 2000 });
      const calls = api.calls;
      let drive: Ev | undefined, t0 = 0;
      const b = await build(POST, { prompt: `${tag} s4 a lighthouse in a gale` }, (e, me) => { if (e.type === 'drive') { drive = e; drafts.add(String(e.draftId)); t0 = Date.now(); me.ctl.abort(); } });
      await ends(b);
      const ms = Date.now() - t0;
      await sleep(400);
      const r = rowOf(`${tag} s4`);
      const d = driven(5), late = drive ? submitDrive(String(drive.draftId), String(drive.token), d.raw, d.images) : true;
      ok('leaving during the test drive lets the wait go at once', !!drive && ms < 2000 && !late, `${ms} ms; a late report ${late ? 'was still taken' : 'finds nothing waiting'}`);
      ok('no repair pass follows, and the build is abandoned at its full pass\'s cost', api.calls - calls === 1 && r?.status === 'abandoned' && r.draft_id === drive?.draftId && near(r?.cost_usd, cost({ input: 1000, write: 0, read: 0 }, 2000)), JSON.stringify(r && { status: r.status, cost: r.cost_usd, calls: api.calls - calls }));
    }

    console.log('\nBuild limits: one cap on builds at once, site-wide');
    {
      for (let i = 0; i < 3; i++) api.queue.push({ kind: 'hang', start: { input: 100, write: 0, read: 0 } });
      const calls = api.calls;
      const running = await Promise.all([0, 1, 2].map((i) => build(POST, { prompt: `${tag} s5-${i} a canyon of glass` })));
      await until(() => api.open >= 3);
      const rows = () => (db.prepare('SELECT COUNT(*) AS n FROM generations WHERE prompt LIKE ?').get(`%${tag} s5%`) as { n: number }).n;
      const before = rows(), t0 = Date.now();
      const busy = await build(POST, { prompt: `${tag} s5-busy a fourth world` });
      const ms = Date.now() - t0;
      ok('three builds run at once by default (BUILD_SLOTS unset)', slotsHeld() === 3 && api.open === 3, `${slotsHeld()} held`);
      ok('the fourth is answered at once with the busy word, as JSON', busy.res.status === 503 && busy.json?.busy === true && busy.json.error === BUSY && ms < 1000, `${busy.res.status} in ${ms} ms: ${busy.json?.error}`);
      ok('and nothing was spent on it: no model call, no build row', api.calls - calls === 3 && rows() === before, `${api.calls - calls} calls`);
      // the race brief (kind 'race', which no page sends any more) is the owner's key's too, and waits its turn the same way
      const race = await build(POST, { kind: 'race', prompt: `${tag} s5-race a race brief over the cap` });
      ok('the race brief is held to the same cap: busy at once, no model call', race.res.status === 503 && race.json?.busy === true && race.json.error === BUSY && api.calls - calls === 3, `${race.res.status}: ${race.json?.error}`);
      running[0].ctl.abort(); await ends(running[0]);
      await until(() => slotsHeld() === 2);
      ok('a slot is free again once a build is abandoned', slotsHeld() === 2, String(slotsHeld()));
      api.queue.push({ kind: 'refuse' });
      const fails = await build(POST, { prompt: `${tag} s5-err a world the model refuses` });
      await ends(fails);
      const fr = rowOf(`${tag} s5-err`);
      ok('the next build gets that slot, and an error frees it again', fails.events.some((e) => e.type === 'error') && fr?.status === 'error' && slotsHeld() === 2, `${fr?.status}, ${slotsHeld()} held`);
      const callsRace = api.calls;
      const raced = await build(POST, { kind: 'race', prompt: `${tag} s5-race2 a race brief with a slot free` });
      // (it ends before the model today: the SDK refuses its unstreamed 32k-token call before sending it, lib/generate.ts)
      ok('a race brief with a slot free takes it, and gives it back however it ends', raced.res.status === 502 && api.calls - callsRace <= 1 && slotsHeld() === 2, `${raced.res.status}, ${api.calls - callsRace} calls, ${slotsHeld()} held: ${(raced.json as { error?: string } | undefined)?.error}`);
      process.env.BUILD_SLOTS = '2';
      const two = await build(POST, { prompt: `${tag} s5-two one over BUILD_SLOTS` });
      ok('BUILD_SLOTS sets the cap', two.res.status === 503 && two.json?.busy === true, String(two.res.status));
      delete process.env.BUILD_SLOTS;
      running[1].ctl.abort(); running[2].ctl.abort();
      await Promise.all([ends(running[1]), ends(running[2])]);
      await until(() => slotsHeld() === 0);
      ok('every slot is free once the builds end', slotsHeld() === 0, String(slotsHeld()));
    }
    {
      // the page's words for it (app/create/generation.tsx friendlyError), read from its source
      const src = readFileSync(new URL('../app/create/generation.tsx', import.meta.url), 'utf8');
      const fn = src.match(/function friendlyError\(e: string\) \{[\s\S]*?\n\}/)?.[0].replace('(e: string)', '(e)');
      const friendly = fn ? new Function(`${fn}; return friendlyError;`)() as (e: string) => string : null;
      ok('the creator is told "GameMog is busy building other worlds. Try again in a minute."', friendly?.(BUSY) === 'GameMog is busy building other worlds. Try again in a minute.', friendly?.(BUSY));
    }

    console.log('\nBuild limits: a restart marks what it stopped as interrupted');
    {
      // as deploy/boot.mjs runs it before the server starts, on a copy of this database
      const dir = mkdtempSync(join(tmpdir(), 'gm-limits-')), copy = join(dir, 'gamemog.db');
      try {
        db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
        copyFileSync(new URL('../data/gamemog.db', import.meta.url), copy);
        const c = new DatabaseSync(copy);
        c.exec('DELETE FROM generations');
        const ins = c.prepare("INSERT INTO generations (game_id, prompt, model, attempts, ok, findings, ms, created_at, status) VALUES (NULL, 'boot', 'claude-sonnet-5-5', 1, ?, '[]', 0, 0, ?)");
        ins.run(0, 'running'); ins.run(0, 'running'); ins.run(1, 'done'); ins.run(0, null);
        c.close();
        const n = bootInterrupt(copy);
        const c2 = new DatabaseSync(copy, { readOnly: true });
        const st = (c2.prepare('SELECT status FROM generations ORDER BY id').all() as { status: string | null }[]).map((r) => r.status);
        c2.close();
        ok('at boot, every build left running is interrupted, and nothing else changes', n === 2 && st.join() === 'interrupted,interrupted,done,', `${n}: ${st.join()}`);
        const old = join(dir, 'old.db'), o = new DatabaseSync(old);
        o.exec('CREATE TABLE generations (id INTEGER PRIMARY KEY, prompt TEXT)'); o.close();
        ok('a database from before the build log is left alone', bootInterrupt(old) === 0);
      } finally { rmSync(dir, { recursive: true, force: true }); }
      // and in a running server, which marks only what it is not running itself (lib/db.ts interruptBuilds)
      const others = (db.prepare("SELECT COUNT(*) AS n FROM generations WHERE status = 'running' AND prompt NOT LIKE ?").get(`%${tag}%`) as { n: number }).n;
      if (others) console.log(`  skip  a server's own sweep: ${others} build${others === 1 ? ' is' : 's are'} running on this database`);
      else {
        const ins = db.prepare("INSERT INTO generations (game_id, prompt, model, attempts, ok, findings, ms, created_at, status, started_at) VALUES (NULL, ?, 'claude-sonnet-5-5', 0, 0, '[]', 0, ?, 'running', ?)");
        const mine = Number(ins.run(`${tag} s6 live`, Date.now(), Date.now()).lastInsertRowid), left = Number(ins.run(`${tag} s6 left`, Date.now(), Date.now()).lastInsertRowid);
        const n = interruptBuilds([mine]);
        const st = (id: number) => (db.prepare('SELECT status FROM generations WHERE id = ?').get(id) as { status: string }).status;
        ok('a server marks a row left running interrupted, and leaves its own builds running', n === 1 && st(left) === 'interrupted' && st(mine) === 'running', `${n}: ${st(left)}, ${st(mine)}`);
      }
    }
  } finally {
    globalThis.fetch = realFetch;
    for (const [k, v] of [['ANTHROPIC_API_KEY', env.key], ['ANTHROPIC_AUTH_TOKEN', env.token], ['ANTHROPIC_BASE_URL', env.base], ['GAMEMOG_DRIVE', env.drive], ['BUILD_SLOTS', env.slots]] as const) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
    server.closeAllConnections(); server.close();
    db.prepare('DELETE FROM generations WHERE prompt LIKE ?').run(`%${tag}%`);
    for (const id of drafts) db.prepare('DELETE FROM drafts WHERE id = ?').run(id);
    db.prepare('DELETE FROM drafts WHERE prompt LIKE ?').run(`%${tag}%`);
    if (parentId) db.prepare('DELETE FROM games WHERE id = ?').run(parentId);
  }
  if (base && !process.env.NOBROWSER) await leaveChecks(ok, base);
}

/* ---------------------------------------------- the page lets its build go -- */
/**
 * The creator's page, in Chrome against the dev server: app/create/generation.tsx useGeneration aborts its build's
 * request when the page goes within the site, as the creator who clicks a header link or presses Back sees it, and
 * reads a build it stays on to the end. /api/generate is answered in the page by STUB, a stand-in stream that behaves
 * as a real response does when its request is aborted (it errors), and the request is blocked besides: the dev server
 * (which may hold the owner's key) is never asked to build. Each run records whether its request carried a signal,
 * whether that was aborted, and how many reads the page made.
 */
const STUB = `(() => {
  const real = window.fetch.bind(window), P = window.__gmLeave = { runs: [], end: 0 };
  window.fetch = (input, init) => {
    const url = String(input && input.url || input);
    if (!/\\/api\\/generate(?:$|[?#])/.test(url)) return real(input, init);
    const sig = init && init.signal, r = { signal: !!sig, aborted: false, cancelled: false, reads: 0, ended: false }, enc = new TextEncoder();
    P.runs.push(r);
    let t = 0, n = 0;
    const line = (c, e) => c.enqueue(enc.encode(JSON.stringify(e) + '\\n'));
    const body = new ReadableStream({
      start(c) {
        const gone = () => { r.aborted = true; clearInterval(t); try { c.error(new DOMException('The user aborted a request.', 'AbortError')); } catch {} };
        if (sig) { if (sig.aborted) return gone(); sig.addEventListener('abort', gone, { once: true }); }
        line(c, { type: 'stage', stage: 'thinking', attempt: 1 });
        t = setInterval(() => {
          if (P.end && ++n >= P.end) { clearInterval(t); r.ended = true; line(c, { type: 'error', error: 'the leave check ended its stand-in build' }); c.close(); return; }
          line(c, { type: 'tick' });
        }, 100);
      },
      cancel() { r.cancelled = true; clearInterval(t); },
    });
    const res = new Response(body, { headers: { 'content-type': 'application/x-ndjson; charset=utf-8' } });
    const getReader = body.getReader.bind(body);
    body.getReader = (...a) => { const rd = getReader(...a), read = rd.read.bind(rd); rd.read = () => { r.reads++; return read(); }; return rd; };
    return Promise.resolve(res);
  };
})()`;
type Run = { signal: boolean; aborted: boolean; cancelled: boolean; reads: number; ended: boolean };

export async function leaveChecks(ok: Ok, base: string) {
  console.log('\nBuild limits: the page lets its build go when the creator leaves it (Chrome, the dev server)');
  try {
    await withBrowser(async (page) => {
      await page.blockRequests(['*/api/generate*']);
      await page.preload(STUB);
      const wait = async (expr: string, ms = 30_000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await page.eval<boolean>(expr).catch(() => false)) return true; await sleep(100); } return false; };
      const runs = () => page.eval<Run[]>('window.__gmLeave ? window.__gmLeave.runs : null');
      // the Create page, hydrated, with an idea typed in and Build pressed, as a creator does it
      const start = async () => {
        const ready = await wait("(() => { const t = document.querySelector('#p'); return !!t && Object.keys(t).some((k) => k.startsWith('__reactProps')); })()");
        await page.eval(`(() => { const t = document.querySelector('#p'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(t, 'A leave check: a pier at dawn with gulls'); t.dispatchEvent(new Event('input', { bubbles: true })); })()`);
        const can = await wait("!!document.querySelector('.cgo button.btn') && !document.querySelector('.cgo button.btn').disabled", 5000);
        await page.eval("document.querySelector('.cgo button.btn').click()");
        return ready && can;
      };
      // a link clicked as a creator clicks it: the mouse, at the link, once the page is scrolled back to it
      const clickLink = async (sel: string) => {
        const at = await page.eval<{ x: number; y: number } | null>(`(() => { window.scrollTo({ top: 0, behavior: 'instant' }); const a = document.querySelector(${JSON.stringify(sel)}); if (!a) return null; const r = a.getBoundingClientRect(); return r.width && r.bottom > 0 && r.top < innerHeight ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null; })()`);
        if (at) await page.click(at.x, at.y); else await page.eval(`document.querySelector(${JSON.stringify(sel)}).click()`);
      };
      // what a run does once the page has gone: the reads it makes from then on (none, once its request is let go)
      const after = async (i: number) => { await sleep(600); const a = (await runs())?.[i]; await sleep(900); const b = (await runs())?.[i]; return { run: b, more: (b?.reads ?? 0) - (a?.reads ?? 0) }; };

      // 1. a header link, mid-build: the page goes, the document stays, and the build's request is let go
      await page.goto(`${base}/create`);
      const s1 = await start();
      const reading1 = await wait("window.__gmLeave.runs.length === 1 && window.__gmLeave.runs[0].reads >= 4 && !!document.querySelector('.bshow')");
      await clickLink('header a.hicon[href="/library"]');
      const moved1 = await wait("location.pathname === '/library' && !document.querySelector('.bshow')");
      const a1 = await after(0), same1 = await page.eval<boolean>('!!window.__gmLeave');
      ok('a creator who clicks a header link mid-build lets the build go: its request is aborted, and the page reads no more of it',
        s1 && reading1 && moved1 && same1 && !!a1.run?.signal && a1.run.aborted && a1.more === 0,
        JSON.stringify({ started: s1 && reading1, inSite: moved1 && same1, ...a1.run, readsAfter: a1.more }));

      // 2. Back, mid-build: from the Library into Create by its link, a build, then Back
      await clickLink('footer a[href="/create"]');
      const s2 = (await wait("location.pathname === '/create'")) && await start();
      const reading2 = await wait("window.__gmLeave.runs.length === 2 && window.__gmLeave.runs[1].reads >= 4 && !!document.querySelector('.bshow')");
      await page.eval('history.back()');
      const moved2 = await wait("location.pathname === '/library' && !document.querySelector('.bshow')");
      const a2 = await after(1), same2 = await page.eval<boolean>('!!window.__gmLeave');
      ok('a creator who presses Back mid-build lets the build go the same way',
        s2 && reading2 && moved2 && same2 && !!a2.run?.signal && a2.run.aborted && a2.more === 0,
        JSON.stringify({ started: s2 && reading2, inSite: moved2 && same2, ...a2.run, readsAfter: a2.more }));

      // 3. a creator who stays: the page reads the build to its end and shows how it ended; nothing lets it go early
      await page.goto(`${base}/create`);
      await wait('!!window.__gmLeave && !window.__gmLeave.runs.length');
      await page.eval('window.__gmLeave.end = 12');
      const s3 = await start();
      const ended = await wait("window.__gmLeave.runs.length === 1 && window.__gmLeave.runs[0].ended && !!document.querySelector('.bs-error')", 15_000);
      const r3 = (await runs())?.[0];
      ok('a creator who stays is read the build to its end, and nothing lets it go early',
        s3 && ended && !!r3?.signal && !r3.aborted && !r3.cancelled && r3.reads >= 12,
        JSON.stringify({ started: s3, shown: ended, ...r3, errors: page.errors.slice(0, 2) }));

      // 4. the Mog page, which builds with the same hook (app/mog/[slug]/composer.tsx): a header link mid-Mog
      const og = db.prepare("SELECT slug FROM games WHERE format = 'world' AND hidden = 0 ORDER BY created_at LIMIT 1").get() as { slug: string } | undefined;
      if (!og) { console.log('  skip  the Mog page: no live world in this database'); return; }
      await page.goto(`${base}/mog/${og.slug}`);
      const s4 = (await wait("(() => { const t = document.querySelector('#idea'); return !!t && Object.keys(t).some((k) => k.startsWith('__reactProps')); })()"))
        && await page.eval<boolean>(`(() => { const t = document.querySelector('#idea'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(t, 'make it night'); t.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`)
        && await wait("[...document.querySelectorAll('button.btn')].some((b) => b.textContent === 'Mog it' && !b.disabled)", 5000)
        && await page.eval<boolean>("([...document.querySelectorAll('button.btn')].find((b) => b.textContent === 'Mog it').click(), true)");
      const reading4 = await wait("window.__gmLeave.runs.length === 1 && window.__gmLeave.runs[0].reads >= 4 && !!document.querySelector('.bshow')");
      await clickLink('header a.hicon[href="/library"]');
      const moved4 = await wait("location.pathname === '/library' && !document.querySelector('.bshow')");
      const a4 = await after(0), same4 = await page.eval<boolean>('!!window.__gmLeave');
      ok('the Mog page lets its build go the same way when the creator clicks away mid-Mog',
        !!s4 && reading4 && moved4 && same4 && !!a4.run?.signal && a4.run.aborted && a4.more === 0,
        JSON.stringify({ original: og.slug, started: !!s4 && reading4, inSite: moved4 && same4, ...a4.run, readsAfter: a4.more }));
    }, { timeoutMs: 150_000 });
  } catch (e) {
    ok('the page lets its build go when the creator leaves (Chrome, the dev server)', false, (e as Error).message);
  }
}

// on its own
if (import.meta.url === `file://${process.argv[1]}`) {
  let failures = 0;
  const ok: Ok = (name, cond, detail = '') => { console.log(`${cond ? '  ok  ' : '  FAIL'}  ${name}${detail ? `: ${detail}` : ''}`); if (!cond) failures++; };
  await buildLimitsChecks(ok, process.env.BASE ?? 'http://localhost:3939');
  console.log(`\n${failures ? `${failures} FAILED` : 'all build limit checks passed'}\n`);
  process.exit(failures ? 1 : 0);
}
