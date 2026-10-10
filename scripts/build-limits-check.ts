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
 * asks the drive to hold (a tab in the background) keeps its build; (2) BUILD_SLOTS builds run at once (10 by
 * default), and a slot is free again after an abort or an error; with every slot taken the next waits in line (10
 * Oct), told its place at once and as it moves, first come first served, nothing spent while it waits; one who
 * leaves the line (an abort or a cancel) leaves it at once; a full line (BUILD_QUEUE_MAX) is told GameMog is busy at
 * once; the wait is honest (queueEta); (3) the day's ceiling (BUILD_DAILY_USD, $50 by default, 10 Oct): the day is
 * Los Angeles's, its spend is its builds' real cost plus $2 for each running now, at or over it a build is refused
 * with the resting words and the line is let go, and a running build runs on; (4) the build's row is there from its
 * start ('running', with its kind, its parent or its photo) and finished at its end, and a restart marks what was
 * left 'running' as 'interrupted'; (5) each pass's usage is summed and priced from the one table. Its throwaway
 * rows, drafts and game are removed afterwards.
 * With the dev server (BASE, as `check:platform` passes it; NOBROWSER=1 skips it), the page itself in Chrome: a
 * creator who leaves the Create page within the site (a header link, Back) lets the build's request go, and one who
 * stays reads it to its end; a creator in line sees their place and the wait, then the build show at their turn; a
 * build refused at the day's ceiling says so calmly, with a way to play. Its /api/generate is answered in the page
 * by a stand-in stream and the request is blocked besides, so the dev server builds nothing and nothing is spent.
 */
import { register } from 'node:module';
import { createServer, type ServerResponse } from 'node:http';
import { readFileSync, writeFileSync, copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { db, insertDraft, publishDraft, slugify, interruptBuilds, getGameBySlug } from '../lib/db.ts';
import { submitDrive, holdDrive } from '../lib/test-drive.ts';
import { priceBuild, slotsHeld, queueLength, buildSlots, dailyCeiling, laDay, spendToday, resting, pump, queueEta, BUSY, RESTING, PRICES, IN_FLIGHT_USD, QUEUE_PULSE_MS } from '../lib/build-limits.ts';
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
type Build = { events: Ev[]; ended: Promise<void>; ctl: AbortController; res: Response; cancel: () => Promise<void>; json?: { error?: string; busy?: boolean; resting?: boolean } };
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
  const env = { key: process.env.ANTHROPIC_API_KEY, token: process.env.ANTHROPIC_AUTH_TOKEN, base: process.env.ANTHROPIC_BASE_URL, drive: process.env.GAMEMOG_DRIVE, slots: process.env.BUILD_SLOTS, line: process.env.BUILD_QUEUE_MAX, usd: process.env.BUILD_DAILY_USD };
  const realFetch = globalThis.fetch;
  const drafts = new Set<string>();
  let parentId: string | null = null;
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const port = (server.address() as { port: number }).port;
  try {
    // nothing may leave this machine: the model is the stand-in above, and any other host is refused outright
    process.env.ANTHROPIC_API_KEY = 'stand-in-key-for-the-local-check'; delete process.env.ANTHROPIC_AUTH_TOKEN;
    process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${port}`;
    process.env.GAMEMOG_DRIVE = 'browser'; delete process.env.BUILD_SLOTS; delete process.env.BUILD_QUEUE_MAX;
    // the day's ceiling out of the way (this database's own spend today is whatever it is) but where it is checked
    process.env.BUILD_DAILY_USD = '1000000';
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
      const slots = buildSlots(), open0 = api.open;
      for (let i = 0; i < slots; i++) api.queue.push({ kind: 'hang', start: { input: 100, write: 0, read: 0 } });
      const calls = api.calls;
      const running = await Promise.all(Array.from({ length: slots }, (_, i) => build(POST, { prompt: `${tag} s5-${i} a canyon of glass` })));
      await until(() => api.open >= open0 + slots);
      const rows = () => (db.prepare('SELECT COUNT(*) AS n FROM generations WHERE prompt LIKE ?').get(`%${tag} s5%`) as { n: number }).n;
      const before = rows(), t0 = Date.now();
      // no room in line (BUILD_QUEUE_MAX 0): the old answer, at once
      process.env.BUILD_QUEUE_MAX = '0';
      const busy = await build(POST, { prompt: `${tag} s5-busy one over the cap with no room in line` });
      const ms = Date.now() - t0;
      ok('ten builds run at once by default (BUILD_SLOTS unset)', slots === 10 && slotsHeld() === 10 && api.open - open0 === 10, `${slots} slots, ${slotsHeld()} held`);
      ok('with every slot taken and no room in line, the next is answered at once with the busy word, as JSON', busy.res.status === 503 && busy.json?.busy === true && busy.json.error === BUSY && ms < 1000, `${busy.res.status} in ${ms} ms: ${busy.json?.error}`);
      ok('and nothing was spent on it: no model call, no build row', api.calls - calls === slots && rows() === before, `${api.calls - calls} calls`);
      // the race brief (kind 'race', which no page sends any more) is the owner's key's too, and never waits in line
      delete process.env.BUILD_QUEUE_MAX;
      const race = await build(POST, { kind: 'race', prompt: `${tag} s5-race a race brief over the cap` });
      ok('the race brief is held to the same cap: busy at once, no model call', race.res.status === 503 && race.json?.busy === true && race.json.error === BUSY && api.calls - calls === slots && queueLength() === 0, `${race.res.status}: ${race.json?.error}`);
      running[0].ctl.abort(); await ends(running[0]);
      await until(() => slotsHeld() === slots - 1);
      ok('a slot is free again once a build is abandoned', slotsHeld() === slots - 1, String(slotsHeld()));
      api.queue.push({ kind: 'refuse' });
      const fails = await build(POST, { prompt: `${tag} s5-err a world the model refuses` });
      await ends(fails);
      const fr = rowOf(`${tag} s5-err`);
      ok('the next build gets that slot, and an error frees it again', fails.events.some((e) => e.type === 'error') && fr?.status === 'error' && slotsHeld() === slots - 1, `${fr?.status}, ${slotsHeld()} held`);
      const callsRace = api.calls;
      const raced = await build(POST, { kind: 'race', prompt: `${tag} s5-race2 a race brief with a slot free` });
      // (it ends before the model today: the SDK refuses its unstreamed 32k-token call before sending it, lib/generate.ts)
      ok('a race brief with a slot free takes it, and gives it back however it ends', raced.res.status === 502 && api.calls - callsRace <= 1 && slotsHeld() === slots - 1, `${raced.res.status}, ${api.calls - callsRace} calls, ${slotsHeld()} held: ${(raced.json as { error?: string } | undefined)?.error}`);
      process.env.BUILD_SLOTS = '2';
      const two = await build(POST, { prompt: `${tag} s5-two one over BUILD_SLOTS` });
      await until(() => two.events.length > 0, 2000);
      ok('BUILD_SLOTS sets the cap: one over it waits in line, first', two.res.status === 200 && two.events[0]?.type === 'queued' && two.events[0].position === 1 && queueLength() === 1, `${two.res.status} ${JSON.stringify(two.events[0])}`);
      two.ctl.abort(); await ends(two);
      delete process.env.BUILD_SLOTS;
      for (const r of running.slice(1)) r.ctl.abort();
      await Promise.all(running.slice(1).map((r) => ends(r)));
      await until(() => slotsHeld() === 0);
      ok('every slot is free once the builds end, and nobody is left in line', slotsHeld() === 0 && queueLength() === 0, `${slotsHeld()} held, ${queueLength()} in line`);
    }

    console.log('\nBuild limits: a line for a slot, first come first served (10 Oct)');
    {
      process.env.BUILD_SLOTS = '2'; process.env.BUILD_QUEUE_MAX = '3';
      const open0 = api.open, hang = (): Reply => ({ kind: 'hang', start: { input: 100, write: 0, read: 0 } });
      api.queue.push(hang(), hang());
      const A = await build(POST, { prompt: `${tag} q-a the first running build` }), B = await build(POST, { prompt: `${tag} q-b the second running build` });
      await until(() => api.open >= open0 + 2);
      const calls = api.calls, admitted: string[] = [];
      const wait = (name: string) => build(POST, { prompt: `${tag} q-${name} a build that waits` }, (e) => { if (e.type === 'admitted') admitted.push(name); });
      const q1 = await wait('1'), q2 = await wait('2'), q3 = await wait('3');
      await until(() => [q1, q2, q3].every((q) => q.events.length > 0), 2000);
      const first = [q1, q2, q3].map((q) => q.events[0]);
      ok('with every slot taken a build waits in line, told its place and the wait at once: 1st, 2nd, 3rd', first.every((e, i) => e?.type === 'queued' && e.position === i + 1 && Number(e.etaMin) >= 1) && queueLength() === 3 && [q1, q2, q3].every((q) => q.res.status === 200), JSON.stringify(first));
      ok('nothing is spent on a build in line: no model call, no build row', api.calls === calls && !rowOf(`${tag} q-1`) && !rowOf(`${tag} q-3`), `${api.calls - calls} calls`);
      const t0 = Date.now(), full = await build(POST, { prompt: `${tag} q-4 one more than the line holds` }), ms = Date.now() - t0;
      ok('a full line (BUILD_QUEUE_MAX) is answered at once with the busy word, as JSON', full.res.status === 503 && full.json?.busy === true && full.json.error === BUSY && ms < 1000 && queueLength() === 3, `${full.res.status} in ${ms} ms, ${queueLength()} in line`);
      // the second leaves (the request's abort): out of the line at once, and the third moves up
      const n3 = q3.events.length;
      q2.ctl.abort();
      const gone = await ends(q2, 3000);
      await until(() => q3.events.slice(n3).some((e) => e.type === 'queued' && e.position === 2), 1500);
      ok('a creator who leaves the line leaves it at once, and everyone behind moves up', gone && queueLength() === 2 && q3.events.slice(n3).some((e) => e.type === 'queued' && e.position === 2) && !q2.events.some((e) => e.type === 'error') && api.calls === calls, `${queueLength()} in line, the third told ${JSON.stringify(q3.events.slice(n3))}`);
      // while it waits, the line is told where it stands every few seconds (and the connection kept alive)
      const n1 = q1.events.length;
      await sleep(QUEUE_PULSE_MS + 700);
      ok('the line is told where it stands every few seconds while it waits', q1.events.slice(n1).some((e) => e.type === 'queued' && e.position === 1), JSON.stringify(q1.events.slice(n1)));
      // a slot frees: the front of the line gets it and its build begins; then the next slot to the next
      api.queue.push(hang(), hang());
      A.ctl.abort(); await ends(A);
      await until(() => admitted.length === 1 && !!rowOf(`${tag} q-1`) && q3.events.some((e) => e.type === 'queued' && e.position === 1), 3000);
      ok('a freed slot goes to the front of the line: admitted, its build begins, and the next is told it is next', admitted.join() === '1' && q1.events.some((e) => e.type === 'stage') && rowOf(`${tag} q-1`)?.status === 'running' && queueLength() === 1 && q3.events.some((e) => e.type === 'queued' && e.position === 1), `${admitted.join()}, ${rowOf(`${tag} q-1`)?.status}, ${queueLength()} in line`);
      B.ctl.abort(); await ends(B);
      await until(() => admitted.length === 2 && !!rowOf(`${tag} q-3`), 3000);
      ok('and the next slot to the next in line, in order', admitted.join() === '1,3' && queueLength() === 0 && rowOf(`${tag} q-3`)?.status === 'running' && slotsHeld() === 2, `${admitted.join()}, ${queueLength()} in line, ${slotsHeld()} held`);
      // the other way a closed connection shows, in line: the response stream is cancelled
      const q5 = await wait('5');
      await until(() => q5.events.length > 0 && queueLength() === 1, 2000);
      const calls5 = api.calls;
      await q5.cancel();
      await until(() => queueLength() === 0, 2000);
      ok('a cancelled stream leaves the line the same way, with nothing spent', q5.events[0]?.type === 'queued' && queueLength() === 0 && api.calls === calls5 && !rowOf(`${tag} q-5`) && !admitted.includes('5'), `${queueLength()} in line, ${JSON.stringify(q5.events[0])}`);
      q1.ctl.abort(); q3.ctl.abort();
      await Promise.all([ends(q1), ends(q3)]);
      await until(() => slotsHeld() === 0);
      ok('once the builds end every slot is free, and the line is empty', slotsHeld() === 0 && queueLength() === 0, `${slotsHeld()} held, ${queueLength()} in line`);
      // one slot (BUILD_SLOTS=1, the smallest server): every build after the first waits, and they go one by one, in order
      process.env.BUILD_SLOTS = '1';
      {
        const open1 = api.open, order: string[] = [];
        api.queue.push(hang());
        const S1 = await build(POST, { prompt: `${tag} q1-a the only running build` });
        await until(() => api.open >= open1 + 1);
        const c1 = api.calls;
        const one = (name: string) => build(POST, { prompt: `${tag} q1-${name} a build behind it` }, (e) => { if (e.type === 'admitted') order.push(name); });
        const w1 = await one('b'), w2 = await one('c');
        await until(() => w1.events.length > 0 && w2.events.length > 0, 2000);
        ok('BUILD_SLOTS=1: one build runs, the next two wait 1st and 2nd, nothing spent on them', slotsHeld() === 1 && queueLength() === 2 && w1.events[0]?.type === 'queued' && w1.events[0].position === 1 && w2.events[0]?.type === 'queued' && w2.events[0].position === 2 && api.calls === c1, `${slotsHeld()} held, ${queueLength()} in line, ${JSON.stringify([w1.events[0], w2.events[0]])}`);
        api.queue.push(hang(), hang());
        S1.ctl.abort(); await ends(S1);
        await until(() => order.length === 1 && w2.events.some((e) => e.type === 'queued' && e.position === 1), 3000);
        ok('BUILD_SLOTS=1: the slot goes to the 1st in line, and the 2nd is told it is next', order.join() === 'b' && slotsHeld() === 1 && queueLength() === 1 && !!rowOf(`${tag} q1-b`) && !rowOf(`${tag} q1-c`), `${order.join()}, ${slotsHeld()} held, ${queueLength()} in line`);
        w1.ctl.abort(); await ends(w1);
        await until(() => order.length === 2, 3000);
        ok('BUILD_SLOTS=1: then to the 2nd, and never two at once', order.join() === 'b,c' && slotsHeld() === 1 && queueLength() === 0 && rowOf(`${tag} q1-c`)?.status === 'running', `${order.join()}, ${slotsHeld()} held`);
        w2.ctl.abort(); await ends(w2);
        await until(() => slotsHeld() === 0);
        ok('BUILD_SLOTS=1: the slot is free once they end', slotsHeld() === 0 && queueLength() === 0, `${slotsHeld()} held, ${queueLength()} in line`);
      }
      delete process.env.BUILD_SLOTS; delete process.env.BUILD_QUEUE_MAX;
      // the wait: running builds end when a typical one would (at least a minute away), and each freed slot goes on to the next in line
      const M = 60_000;
      const waits = [1, 2, 3, 4].map((p) => queueEta(p, [5 * M, 0], 2, 10 * M));
      ok('the wait is honest: two slots, builds 5 and 0 minutes in, 10 a build: 5, 10, 15 and 20 minutes for the first four in line', waits.join() === '5,10,15,20', waits.join());
      ok('a build over its time is still a minute away, and a free slot is a minute at most', queueEta(1, [14 * M], 1, 10 * M) === 1 && queueEta(1, [], 2, 10 * M) === 1, `${queueEta(1, [14 * M], 1, 10 * M)}, ${queueEta(1, [], 2, 10 * M)}`);
      ok('ten slots, ten builds spread over ten minutes: the 6th in line waits about 6 minutes, the 12th about 12', queueEta(6, Array.from({ length: 10 }, (_, i) => i * M), 10, 10 * M) === 6 && queueEta(12, Array.from({ length: 10 }, (_, i) => i * M), 10, 10 * M) === 12, `${queueEta(6, Array.from({ length: 10 }, (_, i) => i * M), 10, 10 * M)}, ${queueEta(12, Array.from({ length: 10 }, (_, i) => i * M), 10, 10 * M)}`);
    }

    console.log('\nBuild limits: a ceiling on the day\'s spend, Los Angeles\'s day (10 Oct)');
    {
      delete process.env.BUILD_DAILY_USD;
      const def = dailyCeiling();
      process.env.BUILD_DAILY_USD = '12.5';
      ok('the ceiling is $50 a day by default (BUILD_DAILY_USD unset), and BUILD_DAILY_USD sets it', def === 50 && dailyCeiling() === 12.5, `${def}, ${dailyCeiling()}`);
      const at = (iso: string) => Date.parse(iso);
      const d1 = laDay(at('2026-10-10T06:59:59Z')), d2 = laDay(at('2026-10-10T07:00:00Z'));
      ok('the day is Los Angeles\'s: at 23:59:59 PDT it is still the 9th, a second later the 10th begins', d1.day === '2026-10-09' && d2.day === '2026-10-10' && d2.from === at('2026-10-10T07:00:00Z') && d1.to === d2.from && d2.to === at('2026-10-11T07:00:00Z'), JSON.stringify({ d1, d2 }));
      const fall = laDay(at('2026-11-01T20:00:00Z')), spring = laDay(at('2026-03-08T20:00:00Z'));
      ok('a day the clocks change runs midnight to midnight: 25 hours in November, 23 in March', fall.day === '2026-11-01' && fall.from === at('2026-11-01T07:00:00Z') && fall.to === at('2026-11-02T08:00:00Z') && spring.day === '2026-03-08' && spring.from === at('2026-03-08T08:00:00Z') && spring.to === at('2026-03-09T07:00:00Z'), JSON.stringify({ fall, spring }));
      // the spend by day, on throwaway builds on two days long ago: 23:59 on the 3rd, and just after midnight on the 4th
      const put = (t: number, usd: number | null, status: string, model = 'claude-sonnet-5-5') => db.prepare("INSERT INTO generations (game_id, prompt, model, attempts, ok, findings, ms, created_at, status, started_at, cost_usd) VALUES (NULL, ?, ?, 1, 0, '[]', 600000, ?, ?, ?, ?)").run(`${tag} c-day`, model, t, status, t, usd);
      const late = at('2001-03-04T07:59:00Z'), early = at('2001-03-04T08:01:00Z');
      put(late, 5, 'done'); put(early, 7, 'done'); put(early + 60_000, 0.25, 'abandoned'); put(early + 120_000, null, 'error'); put(early + 180_000, 3, 'done', 'offline');
      const s1 = spendToday(late + 30_000), s2 = spendToday(early + 30_000), s3 = spendToday(at('2001-03-05T20:00:00Z'));
      ok('the day\'s spend is its builds\' real cost, by the day each began: a build at 23:59 is the day before\'s', s1.day === '2001-03-03' && near(s1.done, 5) && s2.day === '2001-03-04' && near(s2.done, 7.25) && s2.inFlight === 0 && s3.total === 0, JSON.stringify({ s1: s1.done, s2: s2.done, s3: s3.total }));
      process.env.BUILD_DAILY_USD = '6';
      ok('the ceiling is the day\'s: under it on the 3rd, over it on the 4th, and the 5th starts from nothing', !resting(late + 30_000) && resting(early + 30_000) && !resting(at('2001-03-05T20:00:00Z')), `${resting(late + 30_000)}, ${resting(early + 30_000)}, ${resting(at('2001-03-05T20:00:00Z'))}`);
      // a build running now counts at $2 from its start (the stand-in's earlier streams closed first, so they are not counted)
      process.env.BUILD_DAILY_USD = '1000000';
      await until(() => api.open === 0, 5000);
      const open0 = api.open, cut0 = api.cut, hang = (): Reply => ({ kind: 'hang', start: { input: 100, write: 0, read: 0 } });
      const base0 = spendToday();
      api.queue.push(hang());
      const run = await build(POST, { prompt: `${tag} c-run a build in flight` });
      await until(() => api.open > open0 && rowOf(`${tag} c-run`)?.status === 'running');
      const s4 = spendToday();
      ok('a build running now counts at $2 until its passes cost more', s4.running === base0.running + 1 && near(s4.inFlight - base0.inFlight, IN_FLIGHT_USD) && near(s4.total, s4.done + s4.inFlight), JSON.stringify({ before: base0, now: s4 }));
      // at the ceiling: refused at once, nothing spent
      const calls = api.calls;
      process.env.BUILD_DAILY_USD = String(spendToday().total);
      const t0 = Date.now(), no = await build(POST, { prompt: `${tag} c-no one at the ceiling` }), ms = Date.now() - t0;
      ok('at the ceiling a new build is refused at once with the resting words, as JSON: no model call, no build row', no.res.status === 503 && no.json?.resting === true && no.json.error === RESTING && api.calls === calls && !rowOf(`${tag} c-no`) && ms < 1000, `${no.res.status} in ${ms} ms: ${no.json?.error}`);
      const raceNo = await build(POST, { kind: 'race', prompt: `${tag} c-race a race brief at the ceiling` });
      ok('the race brief is refused the same way', raceNo.res.status === 503 && raceNo.json?.resting === true && api.calls === calls, `${raceNo.res.status}: ${raceNo.json?.error}`);
      ok('and the build already running runs on', rowOf(`${tag} c-run`)?.status === 'running' && !run.events.some((e) => e.type === 'error') && slotsHeld() === 1 && api.open === open0 + 1 && api.cut === cut0, `${rowOf(`${tag} c-run`)?.status}, ${slotsHeld()} held, ${api.open - open0} open, ${api.cut - cut0} cut`);
      // just under it: a build starts, and its $2 counts at once
      process.env.BUILD_DAILY_USD = String(spendToday().total + 1);
      api.queue.push(hang());
      const yes = await build(POST, { prompt: `${tag} c-yes one just under the ceiling` });
      await until(() => rowOf(`${tag} c-yes`)?.status === 'running', 3000);
      const after = await build(POST, { prompt: `${tag} c-after the one after it` });
      ok('just under the ceiling a build starts, and its estimate counts at once: the next is refused', yes.res.status === 200 && rowOf(`${tag} c-yes`)?.status === 'running' && after.res.status === 503 && after.json?.resting === true, `${yes.res.status}, ${rowOf(`${tag} c-yes`)?.status}, then ${after.res.status}`);
      // the line, let go when the day reaches its ceiling; the builds running run on
      process.env.BUILD_DAILY_USD = '1000000'; process.env.BUILD_SLOTS = '2';
      const w1 = await build(POST, { prompt: `${tag} c-w1 waiting` }), w2 = await build(POST, { prompt: `${tag} c-w2 waiting` });
      await until(() => queueLength() === 2 && w1.events.length > 0 && w2.events.length > 0, 2000);
      const inLine = queueLength();
      process.env.BUILD_DAILY_USD = String(spendToday().total);
      pump();
      const let1 = await ends(w1, 3000), let2 = await ends(w2, 3000);
      const told = [w1, w2].map((w) => w.events.at(-1));
      ok('when the day reaches its ceiling the line is let go, each told it is resting, nothing spent', inLine === 2 && let1 && let2 && told.every((e) => e?.type === 'error' && e.resting === true && e.error === RESTING) && queueLength() === 0 && !rowOf(`${tag} c-w1`) && !rowOf(`${tag} c-w2`), JSON.stringify(told));
      ok('while the builds already running run on', rowOf(`${tag} c-run`)?.status === 'running' && rowOf(`${tag} c-yes`)?.status === 'running' && slotsHeld() === 2 && api.open === open0 + 2 && api.cut === cut0, `${slotsHeld()} held, ${api.open - open0} open, ${api.cut - cut0} cut`);
      // two slots free at once, a dollar under the ceiling: the first in line is let in, and its $2 lets the second go
      process.env.BUILD_DAILY_USD = '1000000';
      const w3 = await build(POST, { prompt: `${tag} c-w3 waiting` }), w4 = await build(POST, { prompt: `${tag} c-w4 waiting` });
      await until(() => queueLength() === 2 && w3.events.length > 0 && w4.events.length > 0, 2000);
      process.env.BUILD_DAILY_USD = String(spendToday().total + 1); process.env.BUILD_SLOTS = '4';
      api.queue.push(hang());
      pump();
      const let4 = await ends(w4, 3000);
      await until(() => rowOf(`${tag} c-w3`)?.status === 'running', 3000);
      ok('the ceiling is looked at before each build is let in: two slots free a dollar under it, one is let in and the next told it is resting', w3.events.some((e) => e.type === 'admitted') && rowOf(`${tag} c-w3`)?.status === 'running' && let4 && w4.events.at(-1)?.resting === true && !rowOf(`${tag} c-w4`) && queueLength() === 0 && slotsHeld() === 3, `${JSON.stringify(w3.events.map((e) => e.type))}, ${JSON.stringify(w4.events.at(-1))}, ${slotsHeld()} held`);
      process.env.BUILD_DAILY_USD = '1000000'; delete process.env.BUILD_SLOTS;
      run.ctl.abort(); yes.ctl.abort(); w3.ctl.abort();
      await Promise.all([ends(run), ends(yes), ends(w3)]);
      await until(() => slotsHeld() === 0);
      ok('and end as builds end: every slot free again', slotsHeld() === 0 && queueLength() === 0 && rowOf(`${tag} c-run`)?.status === 'abandoned', `${slotsHeld()} held, ${rowOf(`${tag} c-run`)?.status}`);
    }
    {
      // the page's words for it (app/create/generation.tsx friendlyError), read from its source
      const src = readFileSync(new URL('../app/create/generation.tsx', import.meta.url), 'utf8');
      const fn = src.match(/function friendlyError\(e: string\) \{[\s\S]*?\n\}/)?.[0].replace('(e: string)', '(e)');
      const friendly = fn ? new Function(`${fn}; return friendlyError;`)() as (e: string) => string : null;
      ok('the creator is told "GameMog is busy building other worlds. Try again in a minute."', friendly?.(BUSY) === 'GameMog is busy building other worlds. Try again in a minute.', friendly?.(BUSY));
      ok('and at the day\'s ceiling, "Building is resting for today. Every world is still free to play: come back tomorrow."', friendly?.(RESTING) === 'Building is resting for today. Every world is still free to play: come back tomorrow.', friendly?.(RESTING));
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
    for (const [k, v] of [['ANTHROPIC_API_KEY', env.key], ['ANTHROPIC_AUTH_TOKEN', env.token], ['ANTHROPIC_BASE_URL', env.base], ['GAMEMOG_DRIVE', env.drive], ['BUILD_SLOTS', env.slots], ['BUILD_QUEUE_MAX', env.line], ['BUILD_DAILY_USD', env.usd]] as const) {
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
    // the day's ceiling reached: the route's JSON answer
    if (P.mode === 'resting') { P.runs.push({ resting: true }); return Promise.resolve(new Response(JSON.stringify({ error: ${JSON.stringify(RESTING)}, resting: true }), { status: 503, headers: { 'content-type': 'application/json' } })); }
    const sig = init && init.signal, r = { signal: !!sig, aborted: false, cancelled: false, reads: 0, ended: false, admitted: false }, enc = new TextEncoder();
    P.runs.push(r);
    // in line (P.mode 'queue'): its place and wait (P.pos, P.eta) on every beat, until P.admit lets it in
    const waiting = () => P.mode === 'queue' && !r.admitted;
    let t = 0, n = 0;
    const line = (c, e) => c.enqueue(enc.encode(JSON.stringify(e) + '\\n'));
    const body = new ReadableStream({
      start(c) {
        const gone = () => { r.aborted = true; clearInterval(t); try { c.error(new DOMException('The user aborted a request.', 'AbortError')); } catch {} };
        if (sig) { if (sig.aborted) return gone(); sig.addEventListener('abort', gone, { once: true }); }
        if (waiting()) line(c, { type: 'queued', position: P.pos || 6, etaMin: P.eta || 12 });
        else line(c, { type: 'stage', stage: 'thinking', attempt: 1 });
        t = setInterval(() => {
          if (waiting()) {
            if (P.admit) { r.admitted = true; line(c, { type: 'admitted' }); line(c, { type: 'stage', stage: 'thinking', attempt: 1 }); }
            else line(c, { type: 'queued', position: P.pos || 6, etaMin: P.eta || 12 });
            return;
          }
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
type Run = { signal: boolean; aborted: boolean; cancelled: boolean; reads: number; ended: boolean; admitted?: boolean };

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

      // what the creator sees, as JPEGs, when LIMITS_SHOTS names a folder
      const shot = async (name: string) => { if (process.env.LIMITS_SHOTS) writeFileSync(join(process.env.LIMITS_SHOTS, `${name}.jpg`), await page.screenshot(80)); };
      const text = (sel: string) => page.eval<string | null>(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); return e ? e.textContent : null; })()`);
      const scrollShow = () => page.eval("(() => { const e = document.querySelector('.bshow'); if (e) e.scrollIntoView({ block: 'start', behavior: 'instant' }); return true; })()");

      // 5. in line (10 Oct): the place and the wait in a few words, then the build show at the creator's turn
      await page.goto(`${base}/create`);
      await wait('!!window.__gmLeave && !window.__gmLeave.runs.length');
      await page.eval("window.__gmLeave.mode = 'queue'");
      const s5 = await start();
      const inLine = await wait(`(() => { const k = document.querySelector('.bshow .bs-kicker'); return !!k && k.textContent === "You're 6th in line"; })()`, 10_000);
      const words5 = { kicker: await text('.bshow .bs-kicker'), wait: await text('.bshow .bs-title'), line: await text('.bshow .bs-line'), steps: await page.eval<boolean>("!!document.querySelector('.bshow .bs-steps')") };
      await sleep(400); await scrollShow(); await sleep(250); await shot('queue-6th');
      await page.eval('window.__gmLeave.pos = 1; window.__gmLeave.eta = 1');
      const next5 = await wait(`(() => { const k = document.querySelector('.bshow .bs-kicker'), t = document.querySelector('.bshow .bs-title'); return !!k && k.textContent === "You're next in line" && !!t && t.textContent === 'About a minute'; })()`, 5000);
      await page.eval('window.__gmLeave.admit = true');
      const built5 = await wait("(() => { const k = document.querySelector('.bshow .bs-kicker'); return !!k && k.textContent === 'Your world is being created' && !!document.querySelector('.bshow .bs-steps'); })()", 5000);
      const r5 = (await runs())?.[0];
      ok('a creator in line is told their place and the wait in a few words, then sees the build show at their turn',
        s5 && inLine && words5.wait === 'About 12 minutes' && words5.line === 'Keep this tab open: your browser test-drives your world.' && !words5.steps && next5 && built5 && !!r5?.admitted && !r5.aborted,
        JSON.stringify({ started: s5, ...words5, next: next5, built: built5, run: r5, errors: page.errors.slice(0, 2) }));

      // 6. the day's ceiling: refused at once, said calmly, with a way to play instead (no red error box)
      await page.goto(`${base}/create`);
      await wait('!!window.__gmLeave && !window.__gmLeave.runs.length');
      await page.eval("window.__gmLeave.mode = 'resting'");
      const s6 = await start();
      const rest6 = await wait("(() => { const k = document.querySelector('.bshow .bs-kicker'); return !!k && k.textContent === 'Building is resting for today'; })()", 10_000);
      const words6 = { line: await text('.bshow .bs-line'), play: await text('.bshow a.btn[href="/"]'), red: await page.eval<boolean>("!!document.querySelector('.bs-error')"), button: await page.eval<boolean>("!!document.querySelector('.cgo button.btn') && !document.querySelector('.cgo button.btn').disabled") };
      await scrollShow(); await sleep(250); await shot('resting');
      ok('a build refused at the day\'s ceiling says so calmly, with one thing to do instead: play',
        s6 && rest6 && words6.line === 'Every world is still free to play: come back tomorrow.' && words6.play === 'Play a world' && !words6.red,
        JSON.stringify({ started: s6, shown: rest6, ...words6 }));

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
