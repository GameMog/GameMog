/**
 * Story Kit: who may open a store draft, and the store's caps asked at the build route's door (16 Nov 2026).
 *   node --import ./scripts/ts-resolve.mjs scripts/storykit-door-check.ts      (npm run storykit:door-check; part of npm run check)
 *
 * Checked, without a paid call and without touching data/:
 *   POST /api/storykit/drafts (app/api/storykit/drafts/route.ts) with the Story Kit on: refused (404) without the owner's
 *     session, and a passing pack opens a draft with it;
 *   StoryStore.room() (lib/storykit-store.ts): null with room; at LIMITS.open open drafts, or LIMITS.perDay opened in 24
 *     hours, the refusal open() gives; drafts past their TTL are not counted; it writes nothing;
 *   the build route (app/api/generate/route.ts POST): a story world's create with LIMITS.open drafts open is refused
 *     (429, the store's words) before any model call (no fetch at all) and before a build is logged.
 * The process runs in a temporary folder that links every top-level entry of the repo but data/, so lib/db.ts and the
 * Story Kit store open throwaway copies there; the folder goes after.
 */
import { register } from 'node:module';
import { mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, mkdirSync } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = fileURLToPath(new URL('../', import.meta.url));
const ROOT = new URL('../', import.meta.url).href;
register('data:text/javascript,' + encodeURIComponent(`
  export async function resolve(s, c, next) {
    if (s === 'next/server') return next('next/server.js', c);
    if (s === 'next/headers') return next('next/headers.js', c);
    if (!s.startsWith('@/')) return next(s, c);
    for (const ext of ['', '.ts', '.tsx', '/index.ts']) { try { return await next(${JSON.stringify(ROOT)} + s.slice(2) + ext, c); } catch {} }
    return next(s, c);
  }`));

// the throwaway working folder: the repo's files by link, a data/ of its own
const work = realpathSync(mkdtempSync(path.join(tmpdir(), 'storykit-door-')));
for (const e of readdirSync(ROOT_DIR)) if (e !== 'data' && e !== '.git') symlinkSync(path.join(ROOT_DIR, e), path.join(work, e));
mkdirSync(path.join(work, 'data'));
process.chdir(work);

let failed = 0, passed = 0;
const ok = (name: string, cond: boolean, detail = '') => { if (cond) passed++; else failed++; console.log(`  ${cond ? 'ok  ' : 'FAIL'}  ${name}${!cond && detail ? `\n          ${detail}` : ''}`); };
type POST = (req: Request) => Promise<Response>;
const realFetch = globalThis.fetch;
let fetches = 0;
const env = { ...process.env };

try {
  process.env.STORYKIT = 'on';
  process.env.ADMIN_PASSWORD = `door-check-${randomUUID()}`;   // a throwaway test password, this process only
  process.env.ANTHROPIC_API_KEY = 'stand-in-key-for-the-local-check'; delete process.env.ANTHROPIC_AUTH_TOKEN;
  process.env.ANTHROPIC_BASE_URL = 'http://127.0.0.1:9';
  process.env.BUILD_DAILY_USD = '1000000';
  delete process.env.NEXT_PUBLIC_BUILDS;
  globalThis.fetch = ((input: RequestInfo | URL) => { fetches++; return Promise.reject(new Error(`the check refused a call to ${String(input instanceof Request ? input.url : input)}`)); }) as typeof fetch;

  const { StoryStore, LIMITS, STORE_BUSY, STORE_DAY, storyStore } = await import('../lib/storykit-store.ts');
  const { sessionValue, COOKIE } = await import('../app/admin/session.ts');
  const { db } = await import('../lib/db.ts');
  const { POST: OPEN } = await import('../app/api/storykit/drafts/route.ts') as { POST: POST };
  const { POST: BUILD } = await import('../app/api/generate/route.ts') as { POST: POST };
  const NY = readFileSync(path.join(ROOT_DIR, 'storykit/pack/fixtures/good-ny.json'), 'utf8');
  const s = storyStore();
  ok('the store and the database are the throwaway folder\'s', path.resolve(s.root).startsWith(path.resolve(work)) && !path.resolve(s.root).startsWith(path.resolve(ROOT_DIR)));

  console.log('\nStory Kit: who may open a store draft (POST /api/storykit/drafts)');
  const post = (cookie?: string, origin = 'same-origin') => new Request('http://127.0.0.1/api/storykit/drafts', {
    method: 'POST', body: `{"pack":${NY}}`,
    headers: { 'content-type': 'application/json', 'sec-fetch-site': origin, ...(cookie ? { cookie } : {}) },
  });
  const anon = await OPEN(post());
  const forged = await OPEN(post(`${COOKIE}=v1.9999999999.${'0'.repeat(64)}`));
  const opened = () => (s.db.prepare('SELECT COUNT(*) AS n FROM drafts').get() as { n: number }).n;
  ok('without the owner\'s session it is refused (404) and opens nothing; a forged session too', anon.status === 404 && forged.status === 404 && opened() === 0, `${anon.status} ${forged.status} ${opened()}`);
  const owner = `${COOKIE}=${sessionValue().value}`;
  const mine = await OPEN(post(owner));
  ok('with the owner\'s session a passing pack opens a draft (201)', mine.status === 201 && opened() === 1, `${mine.status} ${await mine.clone().text()}`);
  const sameSite = await OPEN(post(owner, 'same-site')), crossSite = await OPEN(post(owner, 'cross-site'));
  ok('the owner\'s session from another origin (same-site, as mc.gamemog.com is, or cross-site) is refused (403) and opens nothing', sameSite.status === 403 && crossSite.status === 403 && opened() === 1, `${sameSite.status} ${crossSite.status}`);

  console.log('\nStory Kit: the store\'s caps, asked before anything is spent (StoryStore.room)');
  let now = Date.UTC(2026, 10, 16, 12);
  const root = mkdtempSync(path.join(work, 'data', 'room-'));
  const t = new StoryStore(root, () => now);
  const fill = (n: number, at: number) => { for (let i = 0; i < n; i++) t.db.prepare('INSERT INTO drafts (id, token_hash, pack, parent, created_at, touched_at) VALUES (?, ?, ?, NULL, ?, ?)').run(randomUUID(), createHash('sha256').update(randomUUID()).digest('hex'), '{}', at, at); };
  const snap = () => JSON.stringify([t.db.prepare('SELECT COUNT(*) AS n FROM drafts').get(), t.db.prepare('SELECT COUNT(*) AS n FROM opened').get()]);
  ok('an empty store has room', t.room() === null);
  fill(LIMITS.open - 1, now);
  ok(`${LIMITS.open - 1} open drafts: room`, t.room() === null);
  fill(1, now);
  const before = snap(), full = t.room();
  ok(`${LIMITS.open} open drafts: refused as open() refuses (429, "${STORE_BUSY}"), and room() wrote nothing`, full?.status === 429 && full?.error === STORE_BUSY && snap() === before);
  const refusedOpen = t.open(JSON.parse(NY));
  ok('and open() itself refuses the same way', !refusedOpen.ok && refusedOpen.status === 429 && refusedOpen.error === STORE_BUSY);
  now += LIMITS.ttlMs + 60_000;
  ok('drafts past their TTL are not counted (open() sweeps them first)', t.room() === null);
  for (let i = 0; i < LIMITS.perDay; i++) t.db.prepare('INSERT INTO opened (at) VALUES (?)').run(now - 1000);
  const day = t.room();
  ok(`${LIMITS.perDay} opened in 24 hours: refused (429, the day's words)`, day?.status === 429 && day?.error === STORE_DAY);
  t.db.close();

  console.log('\nStory Kit: the build route refuses at the door (app/api/generate/route.ts)');
  // the real store at its cap: the build route's storyStore() is this folder's
  s.db.prepare('DELETE FROM drafts').run();
  const at = Date.now();
  for (let i = 0; i < LIMITS.open; i++) s.db.prepare('INSERT INTO drafts (id, token_hash, pack, parent, created_at, touched_at) VALUES (?, ?, ?, NULL, ?, ?)').run(randomUUID(), createHash('sha256').update(randomUUID()).digest('hex'), '{}', at, at);
  const builds = () => (db.prepare('SELECT COUNT(*) AS n FROM generations').get() as { n: number }).n;
  const b0 = builds(), f0 = fetches;
  const res = await BUILD(new Request('http://127.0.0.1/api/generate', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: 'A getaway driver owes the wrong people one last job across the city.', storykit: { city: 'ny' } }),
  }));
  const body = await res.json().catch(() => null) as { error?: string } | null;
  ok(`a story world's create with ${LIMITS.open} drafts open is refused (429, the store's words)`, res.status === 429 && body?.error === STORE_BUSY, `${res.status} ${JSON.stringify(body)}`);
  ok('before any model call (no fetch at all) and before a build is logged', fetches === f0 && builds() === b0, `fetches ${fetches - f0}, builds ${builds() - b0}`);
  const src = readFileSync(path.join(ROOT_DIR, 'app/api/generate/route.ts'), 'utf8');
  ok('the route asks room() inside the story block, before a slot is taken (admit/takeSlot) or a writer is called', src.indexOf('storyStore().room()') > 0 && src.indexOf('storyStore().room()') < src.indexOf('admit(') && src.indexOf('storyStore().room()') < src.indexOf('generateGame('));
} catch (e) {
  ok('the check ran', false, e instanceof Error ? e.stack ?? e.message : String(e));
} finally {
  globalThis.fetch = realFetch;
  for (const k of Object.keys(process.env)) if (!(k in env)) delete process.env[k];
  Object.assign(process.env, env);
  process.chdir(ROOT_DIR);
  // the links first, one by one (never followed), then the folder's own data/
  for (const e of readdirSync(work)) if (e !== 'data') rmSync(path.join(work, e));
  rmSync(work, { recursive: true, force: true });
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
