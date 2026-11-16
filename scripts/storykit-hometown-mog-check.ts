/**
 * Story Kit: a Mog of a hometown story world, end to end (16 Nov 2026; the owner: "everything on platform needs to be
 * able to be mogged. so someone from Oakland doesn't have to rebuild, then can just flip the script").
 *   node --import ./scripts/ts-resolve.mjs scripts/storykit-hometown-mog-check.ts   (npm run storykit:hometown-mog-check; part of npm run check)
 *
 * No paid call. The town is Oakland as gamemog.com publishes it for Oaktown (us-0653000, htc-0.13.2-hg1-bbd2ead29, its
 * whole town's citypackage.json, read-only from /towns/...; storykit/hometown/fixtures/oakland-us-0653000.citypackage.json.gz,
 * map data (c) OpenStreetMap contributors (ODbL 1.0) and Overture Maps Foundation: storykit/hometown/fixtures/NOTICE.md).
 * Its pinned lock is exactly the live Oaktown's. The parent is a story in that town (the Okemah fixture story moved to
 * Oakland's places), gated with the town's real table and published through the real publish route. Every build runs
 * through the real build route (app/api/generate/route.ts POST), the build loop and the real Anthropic SDK against a
 * stand-in Messages API on 127.0.0.1 (STANDIN_PORT, else any free port; every other host is refused).
 *
 * Checked: which games can be mogged (lib/custom-game.ts canMog / storyMogClosed: a hometown world open, New York open,
 * San Francisco closed, MOGGABLE all open but the episode, which stays under EPISODE_MOGS); the game page's and /mog's
 * reading of a hometown world (storyPageOf, the town's name for the locked chip, mogOpenFor under the switch); the build
 * route: off, MOG Soon before anything is spent; an SF 2040-shaped world (a runner world in its store draft) MOG Soon
 * before anything is spent, and storyParentPack refusing a runner world; a hometown world whose town cannot be read
 * refused before a slot is taken; a Mog that moves the town sent back, then the fixed pass kept with the parent's town
 * exactly, its draft's parent, its store draft's parent and its meta's town; a Mog that keeps moving the town refused to
 * the end of the pass limit with nothing kept; publishing as generation 1 in the parent's family, the Mog-off counting
 * a player who finished both, and the Mog itself moggable (dares read canMog), playing the same pinned town.
 * The process runs in a temporary folder that links every top-level entry of the repo but data/, so lib/db.ts, the
 * Story Kit store and the towns' bundles are throwaway copies there; the folder goes after.
 */
import { register } from 'node:module';
import { createServer, type ServerResponse } from 'node:http';
import { mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = fileURLToPath(new URL('../', import.meta.url));
const ROOT = new URL('../', import.meta.url).href;
register('data:text/javascript,' + encodeURIComponent(`
  export async function resolve(s, c, next) {
    if (s === 'next/server') return next('next/server.js', c);
    if (s === 'next/headers') return next('next/headers.js', c);
    if (s === 'next/navigation') return next('next/navigation.js', c);
    if (!s.startsWith('@/')) return next(s, c);
    for (const ext of ['', '.ts', '.tsx', '/index.ts']) { try { return await next(${JSON.stringify(ROOT)} + s.slice(2) + ext, c); } catch {} }
    return next(s, c);
  }`));

// the throwaway working folder: the repo's files by link, a data/ of its own
const work = realpathSync(mkdtempSync(path.join(tmpdir(), 'storykit-hometown-mog-')));
for (const e of readdirSync(ROOT_DIR)) if (e !== 'data' && e !== '.git') symlinkSync(path.join(ROOT_DIR, e), path.join(work, e));
mkdirSync(path.join(work, 'data'));
process.chdir(work);

let failed = 0, passed = 0;
const ok = (name: string, cond: boolean, detail = '') => { if (cond) passed++; else failed++; console.log(`  ${cond ? 'ok  ' : 'FAIL'}  ${name}${!cond && detail ? `\n          ${detail}` : ''}`); };
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
type Ev = { type: string; [k: string]: any };
type POST = (req: Request) => Promise<Response>;

/* ── the stand-in Messages API ── */
const api = { builds: 0, checks: 0, replies: [] as string[], requests: [] as any[] };
const sse = (res: ServerResponse, type: string, data: object) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
const usage = { input_tokens: 30_000, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
const server = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    let j: any = {};
    try { j = JSON.parse(body); } catch { /* */ }
    const msg = { id: `msg_${randomUUID().slice(0, 8)}`, type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_sequence: null };
    if (!j.stream) {
      // the real-name check: nothing real in these invented stories
      api.checks++;
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ ...msg, content: [{ type: 'text', text: JSON.stringify({ people: [], brands: [] }) }], stop_reason: 'end_turn', usage: { ...usage, input_tokens: 3000, output_tokens: 40 } }));
    }
    api.builds++; api.requests.push(j);
    const reply = api.replies.shift() ?? 'no reply scripted';
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
    sse(res, 'message_start', { message: { ...msg, content: [], stop_reason: null, usage } });
    sse(res, 'content_block_start', { index: 0, content_block: { type: 'text', text: '' } });
    for (let i = 0; i < reply.length; i += 4000) sse(res, 'content_block_delta', { index: 0, delta: { type: 'text_delta', text: reply.slice(i, i + 4000) } });
    sse(res, 'content_block_stop', { index: 0 });
    sse(res, 'message_delta', { delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 9000 } });
    sse(res, 'message_stop', {});
    res.end();
  });
});
const blocks = (meta: unknown, pack: unknown) => '```json\n' + JSON.stringify(meta) + '\n```\n\n```json\n' + JSON.stringify(pack) + '\n```';
async function call(P: POST, url: string, body: Record<string, unknown>) {
  const res = await P(new Request(`http://127.0.0.1:3939${url}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  const events: Ev[] = [];
  if (!(res.headers.get('content-type') ?? '').includes('ndjson')) return { status: res.status, json: await res.json().catch(() => null) as any, events };
  const reader = res.body!.getReader(), dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, nl); buf = buf.slice(nl + 1); if (line.trim()) events.push(JSON.parse(line)); }
  }
  return { status: res.status, json: null as any, events };
}
const doneOf = (b: { events: Ev[] }) => b.events.find((e) => e.type === 'done');
const sentBack = (b: { events: Ev[] }) => b.events.filter((e) => e.type === 'problems').flatMap((e) => e.problems as string[]);

/* ── the town and its story ── */
const FIX = path.join(ROOT_DIR, 'storykit/hometown/fixtures');
const OAK = JSON.parse(gunzipSync(readFileSync(path.join(FIX, 'oakland-us-0653000.citypackage.json.gz'))).toString('utf8'));
// Oaktown's pin on gamemog.com (its /g/oaktown/play: town=us-0653000, tc=htc-0.13.2-hg1-bbd2ead29, ts=8d17c2c6...)
const LIVE_PIN = { place: 'us-0653000', compiler: 'htc-0.13.2-hg1-bbd2ead29', tiles: '8d17c2c632f12c9c036fa5cfb9f06d857ab16dccb5036db065603525e2f5dcfa' };
// the Okemah fixture story (storykit/hometown/fixtures/okemah-us-4054200.reply.json) moved to Oakland's places of the same kinds
const TO_OAKLAND: Record<string, string> = { pharmacy2: 'pharmacy10', museum: 'museum2', bar2: 'bar16', park: 'park42', restaurant: 'restaurant102', gas_station4: 'gas_station8' };
const parentReply = JSON.parse(JSON.stringify(JSON.parse(readFileSync(path.join(FIX, 'okemah-us-4054200.reply.json'), 'utf8')))
  .replace(/"@([a-z0-9_-]+)"/g, (m, k: string) => (TO_OAKLAND[k] ? `"@${TO_OAKLAND[k]}"` : m))
  .replaceAll('the diner on Broadway', 'the diner on Park St').replaceAll('Okemah', 'Oakland').replaceAll('Oklahoma', 'California'));

const realFetch = globalThis.fetch;
const env = { ...process.env };
const tag = `htmog-${randomUUID().slice(0, 6)}`;
await new Promise<void>((r) => server.listen(Number(process.env.STANDIN_PORT) || 0, '127.0.0.1', () => r()));
const port = (server.address() as { port: number }).port;
try {
  process.env.STORYKIT = 'on';
  process.env.ANTHROPIC_API_KEY = 'stand-in-key-for-the-local-check'; delete process.env.ANTHROPIC_AUTH_TOKEN;
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${port}`;
  process.env.BUILD_DAILY_USD = '1000000';
  for (const k of ['EPISODE_MOGS', 'NEXT_PUBLIC_BUILDS', 'HOMETOWN_BUILDER', 'HOMETOWN_DIR', 'HOMETOWN_DATA_DIR', 'HOMETOWN_TOWNS', 'STORYKIT_FAKE_REPLY']) delete process.env[k];
  // nothing leaves this machine
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!url.startsWith(`http://127.0.0.1:${port}/`)) return Promise.reject(new Error(`the check refused a call to ${url}`));
    return realFetch(input, init);
  }) as typeof fetch;

  const { db, insertDraft, getGameBySlug, getGameById, mogsOf, familyByRoot, recordRun, castPick, mogOff } = await import('../lib/db.ts');
  const { storyStore } = await import('../lib/storykit-store.ts');
  const { townsConfig } = await import('../lib/hometown/config.ts');
  const { cityPackageByLock } = await import('../lib/hometown/towns.ts');
  const { cityLock, packageProblems } = await import('../storykit/hometown/city-package.ts');
  const { checkHometownReply } = await import('../lib/storykit-hometown.ts');
  const { mogBase } = await import('../storykit/pack/gate.ts');
  const { storykitMeta, storykitModule, inheritance, storyParentPack, storykitPackOf, STORYKIT_MAX_ATTEMPTS } = await import('../lib/storykit-build.ts');
  const { canMog, storyMogClosed, MOGGABLE, MOG_SOON } = await import('../lib/custom-game.ts');
  const { storyPageOf } = await import('../lib/storykit-site.ts');
  const { storyTownName, storyPlay } = await import('../lib/storykit-publish.ts');
  const { mogOpenFor } = await import('../app/mog-city-mog.ts');
  const { STORY_MODEL } = await import('../lib/generate-game.ts');
  const { POST } = await import('../app/api/generate/route.ts') as { POST: POST };
  const { POST: PUBLISH } = await import('../app/api/games/route.ts') as { POST: POST };
  const store = storyStore();
  ok('the database, the Story Kit store and the towns are the throwaway folder\'s',
    path.resolve(store.root).startsWith(work) && path.resolve(townsConfig().bundles).startsWith(work));

  console.log('\nHometown Mog: the town (Oakland, as gamemog.com publishes it for Oaktown)');
  ok('the fixture is a readable city package and its lock is the live Oaktown\'s pin (place, build, tiles)',
    packageProblems(OAK).length === 0 && cityLock(OAK).place === LIVE_PIN.place && cityLock(OAK).compiler === LIVE_PIN.compiler && cityLock(OAK).tiles === LIVE_PIN.tiles,
    JSON.stringify(cityLock(OAK)));
  const lock = cityLock(OAK);
  const dir = path.join(townsConfig().bundles, lock.compiler, lock.place, lock.tiles);
  mkdirSync(path.join(dir, 'data'), { recursive: true });
  writeFileSync(path.join(dir, 'citypackage.json'), JSON.stringify(OAK));
  writeFileSync(path.join(dir, 'lock.json'), JSON.stringify({ format: 'hometown-city-lock', buildId: lock.compiler, ...lock }));
  ok('the town is read by its pinned lock, and nothing for a moved lock', !!cityPackageByLock(lock) && cityPackageByLock({ ...lock, tiles: 'e'.repeat(64) }) === null);

  // the parent: a story in Oakland, gated with the real town table, published through the real route
  const pp = checkHometownReply(blocks(parentReply.meta, parentReply.pack), { pkg: OAK, id: 'sk-oakpar1' });
  ok('the parent story passes the builder\'s pass on Oakland\'s real table, its base pinning the live Oaktown town', pp.problems.length === 0 && !!pp.pack && same(pp.pack.base.hometown, lock), pp.problems.slice(0, 3).join(' | '));
  const parentPack = pp.pack!;
  const opened = store.open(clone(parentPack));
  if (!opened.ok) throw new Error(`the parent did not open in the store: ${opened.error} ${(opened as { problems?: string[] }).problems?.slice(0, 3).join(' | ')}`);
  const pDraft = randomUUID();
  insertDraft({ id: pDraft, prompt: `Oaktown parent ${tag}`, meta: storykitMeta(parentPack, parentReply.meta, inheritance(parentPack, pp.gated!.lines, null), opened.id), code: storykitModule(parentPack), report: { ok: true }, format: 'world' });
  const pPub = await call(PUBLISH, '/api/games', { draftId: pDraft, creator: 'Hometown Tester' });
  const parent = pPub.json?.id ? getGameById(pPub.json.id) : undefined;
  ok('the parent publishes as a hometown story world (meta storykit.city hometown, its town pinned, its store draft kept)',
    !!parent && JSON.parse(parent.meta!).storykit.city === 'hometown' && same(JSON.parse(parent.meta!).storykit.hometown, lock) && (store.db.prepare('SELECT state FROM drafts WHERE id = ?').get(opened.id) as { state: string }).state === 'kept',
    JSON.stringify([pPub.status, pPub.json]));
  if (!parent) throw new Error('no parent');

  console.log('\nHometown Mog: which games can be mogged (lib/custom-game.ts)');
  const meta = (storykit: Record<string, unknown>) => JSON.stringify({ mode: 'storykit', storykit });
  ok('a hometown story world is moggable (canMog), and storyMogClosed is false for it', canMog(parent) && !storyMogClosed(parent.meta));
  ok('a New York story world is moggable; San Francisco (SF 2040) stays MOG Soon; a hometown meta with no town pinned too',
    !storyMogClosed(meta({ city: 'ny' })) && storyMogClosed(meta({ city: 'sf' })) && storyMogClosed(meta({ city: 'hometown' })) && !canMog({ format: 'world', code: '', meta: meta({ city: 'sf' }) }));
  const epOff = MOGGABLE.episode; process.env.EPISODE_MOGS = 'on';
  const epOn = MOGGABLE.episode; delete process.env.EPISODE_MOGS;
  ok('every world mode is open but the episode, which stays under EPISODE_MOGS', (['race', 'survival', 'derby', 'kart', 'shootout', 'gp'] as const).every((k) => MOGGABLE[k]) && !epOff && epOn && !MOGGABLE.episode);
  ok('/g/<slug> and /mog/<slug> read it as a hometown story world named by its town (the locked chip: "Oakland, California")',
    same(storyPageOf(parent, true), { city: 'hometown' }) && storyTownName(parent.meta) === 'Oakland, California', `${JSON.stringify(storyPageOf(parent, true))} ${storyTownName(parent.meta)}`);
  ok('its game page offers the Mog with the Story Kit open, MOG Soon with it closed (mogOpenFor)', (await mogOpenFor(parent, true)) && !(await mogOpenFor(parent, false)));
  const mogPage = readFileSync(path.join(ROOT_DIR, 'app/mog/[slug]/page.tsx'), 'utf8');
  ok('/mog/<slug> takes a hometown world as a story world (storyPageOf), names its town, and gives the story composer its town',
    /const story = mcCity \?\? storyPageOf\(game, storyOpen\)/.test(mogPage) && /storyTownName\(game\.meta\)/.test(mogPage) && /<StoryMogComposer [^>]*city=\{story\.city\} cityName=\{where\}/.test(mogPage));

  console.log('\nHometown Mog: the build route\'s door (app/api/generate/route.ts), before anything is spent');
  const calls = () => api.builds + api.checks;
  const builds = () => (db.prepare('SELECT COUNT(*) AS n FROM generations').get() as { n: number }).n;
  delete process.env.STORYKIT;
  let c0 = calls();
  const off = await call(POST, '/api/generate', { mogOf: parent.slug, prompt: `Flip it: the getaway driver is the hero ${tag}` });
  ok('Story Kit off: MOG Soon (409), nothing spent', off.status === 409 && off.json?.error === MOG_SOON && calls() === c0, JSON.stringify([off.status, off.json]));
  process.env.STORYKIT = 'on';
  // an SF 2040-shaped world: San Francisco, its store draft a runner world (storykit 1), as deploy/migrate.mjs stores it
  const sfStore = randomUUID(), sfId = randomUUID(), sfSlug = `sf2040-${tag}`;
  const runner = JSON.stringify({ storykit: 1, engine: 'mogcity-1', id: 'sf2040', title: 'SF 2040', city: 'sf', missions: [] });
  store.db.prepare("INSERT INTO drafts (id, token_hash, pack, parent, created_at, touched_at, state, game_id) VALUES (?, ?, ?, NULL, ?, ?, 'kept', ?)").run(sfStore, createHash('sha256').update(randomUUID()).digest('hex'), runner, Date.now(), Date.now(), sfId);
  db.prepare(`INSERT INTO games (id, slug, title, tagline, blurb, difficulty, spec, prompt, featured, created_at, format, code, meta, generation)
    VALUES (?, ?, 'SF 2040', 't', 'b', 'endless', '{}', ?, 0, ?, 'world', ?, ?, 0)`).run(sfId, sfSlug, `sf ${tag}`, Date.now(), `/*storykit*/${JSON.stringify({ storykit: runner })}`, meta({ city: 'sf', pack: sfStore }));
  c0 = calls();
  const sf = await call(POST, '/api/generate', { mogOf: sfSlug, prompt: `Ride it at dawn ${tag}` });
  ok('an SF 2040-shaped world: MOG Soon (409) before anything is spent', sf.status === 409 && sf.json?.error === MOG_SOON && calls() === c0, JSON.stringify([sf.status, sf.json]));
  ok('storyParentPack refuses a runner world in a store draft (no pack without a base reaches the builder)', storyParentPack(getGameBySlug(sfSlug)!) === null && storyParentPack(parent)?.store === opened.id);
  // a hometown world whose pinned town is not stored here: refused before a slot is taken
  const lost = clone(parentPack); lost.base.hometown = { ...lost.base.hometown, tiles: 'e'.repeat(64) };
  const lostId = randomUUID(), lostSlug = `lost-town-${tag}`;
  db.prepare(`INSERT INTO games (id, slug, title, tagline, blurb, difficulty, spec, prompt, featured, created_at, format, code, meta, generation)
    VALUES (?, ?, 'Lost Town', 't', 'b', 'endless', '{}', ?, 0, ?, 'world', ?, ?, 0)`).run(lostId, lostSlug, `lost ${tag}`, Date.now(), storykitModule(lost), meta({ city: 'hometown', hometown: lost.base.hometown, base: lost.base }));
  c0 = calls(); const b0 = builds();
  const lostMog = await call(POST, '/api/generate', { mogOf: lostSlug, prompt: `Flip it ${tag}` });
  ok('a hometown world whose town cannot be read: 409 with the town\'s words, before any model call or a build is logged',
    lostMog.status === 409 && /town this story world is set in could not be read/.test(lostMog.json?.error ?? '') && calls() === c0 && builds() === b0, JSON.stringify([lostMog.status, lostMog.json]));

  console.log('\nHometown Mog: the build (the town locked, the rest rewritten)');
  const flip = (f?: (p: any) => void) => {
    const p = clone(parentPack); delete p.voices;
    p.title = 'Oaktown Flipped'; p.tagline = 'Same streets, the other side of the job';
    p.acts[0].missions[0].stakes = 'This time the ledger is yours to keep.';
    f?.(p); return p;
  };
  const moved = flip((p) => { p.base = { ...p.base, hometown: { ...p.base.hometown, tiles: 'f'.repeat(64) } }; });
  const mogMeta = { tagline: 'Same streets, the other side of the job', blurb: 'Oaktown, flipped: the crew are the heroes now.', people: [], brands: [] };
  api.replies = [blocks(mogMeta, moved), blocks(mogMeta, flip())];
  const n0 = api.requests.length;
  const mog = await call(POST, '/api/generate', { mogOf: parent.slug, prompt: `Flip the script: the crew are the heroes ${tag}` });
  const md = doneOf(mog), back = sentBack(mog);
  const first = api.requests[n0], turn = JSON.stringify(first?.messages ?? '');
  ok('it is accepted (not MOG Soon) and reaches the story builder: STORY_MODEL, the first turn a MOG with the town locked, its exact base',
    mog.status === 200 && first?.model === STORY_MODEL && turn.includes('The town is locked') && turn.includes(JSON.stringify(JSON.stringify(mogBase(parentPack.base))).slice(1, -1)) && turn.includes('Oakland, California'),
    `${mog.status} ${turn.slice(0, 300)}`);
  ok('a pass that moves the town (its tile set) is sent back', back.some((p) => /The town is locked|base\.hometown\.tiles: a Mog keeps its parent's town exactly|a Mog keeps its parent's city and build exactly/.test(p)), back.join(' | ').slice(0, 600));
  const story = mog.events.find((e) => e.type === 'story');
  const dRow = md ? db.prepare('SELECT code, meta, parent_id, mog_prompt FROM drafts WHERE id = ?').get(md.draftId) as any : null;
  const dPack = dRow ? storykitPackOf(dRow.code) : null, dMeta = dRow ? JSON.parse(dRow.meta) : null;
  const sRow = md?.story ? store.db.prepare('SELECT parent, pack FROM drafts WHERE id = ?').get(md.story.draft) as any : null;
  ok('the fixed pass is kept on the second pass; its pack keeps base.hometown exactly (the live Oaktown pin) and its story changed',
    !!md && md.attempts === 2 && !!dPack && same(dPack.base, parentPack.base) && same(dPack.base.hometown, lock) && dPack.title === 'Oaktown Flipped' && dPack.acts[0].missions[0].stakes !== parentPack.acts[0].missions[0].stakes,
    JSON.stringify(mog.events.filter((e) => e.type === 'error' || e.type === 'problems').slice(-2)).slice(0, 600));
  ok('lineage: the draft\'s parent is the game, the store draft\'s parent the parent\'s store draft, the meta\'s town the parent\'s, the show names the town',
    dRow?.parent_id === parent.id && dRow?.mog_prompt?.includes('Flip the script') && sRow?.parent === opened.id && dMeta?.storykit?.city === 'hometown' && same(dMeta?.storykit?.hometown, lock)
      && same(JSON.parse(sRow?.pack ?? '{}').base, parentPack.base) && story?.town === 'Oakland, California',
    JSON.stringify([dRow?.parent_id, parent.id, sRow?.parent, opened.id, dMeta?.storykit?.hometown, story?.town]));

  // a Mog that keeps moving the town: refused to the end of the pass limit, nothing kept
  const elsewhere = flip((p) => { p.base = { ...p.base, hometown: { ...p.base.hometown, place: 'us-4054200' } }; });
  api.replies = Array.from({ length: STORYKIT_MAX_ATTEMPTS }, () => blocks(mogMeta, elsewhere));
  const d0 = (db.prepare('SELECT COUNT(*) AS n FROM drafts').get() as { n: number }).n, s0 = (store.db.prepare('SELECT COUNT(*) AS n FROM drafts').get() as { n: number }).n;
  const stuck = await call(POST, '/api/generate', { mogOf: parent.slug, prompt: `Move it to Okemah ${tag}` });
  ok(`a Mog that keeps moving the town is refused after ${STORYKIT_MAX_ATTEMPTS} passes, and nothing is kept (no draft, no store draft)`,
    !doneOf(stuck) && stuck.events.some((e) => e.type === 'error') && sentBack(stuck).some((p) => /town is locked|base\.hometown\.place/i.test(p))
      && (db.prepare('SELECT COUNT(*) AS n FROM drafts').get() as { n: number }).n === d0 && (store.db.prepare('SELECT COUNT(*) AS n FROM drafts').get() as { n: number }).n === s0,
    JSON.stringify(stuck.events.filter((e) => e.type === 'error' || e.type === 'problems').slice(-1)).slice(0, 500));

  console.log('\nHometown Mog: publishing, the family, the Mog-off, dares');
  const pub = md ? await call(PUBLISH, '/api/games', { draftId: md.draftId, creator: 'Oakland Challenger' }) : null;
  const child = pub?.json?.id ? getGameById(pub.json.id) : undefined;
  ok('it publishes as a Mog: generation 1, parent and root the original, listed, a hometown story world playing its sealed world',
    !!child && child.parent_id === parent.id && child.root_id === parent.id && child.generation === 1 && !(db.prepare('SELECT hidden FROM games WHERE id = ?').get(child.id) as { hidden: number }).hidden && JSON.parse(child.meta!).storykit.city === 'hometown' && !!JSON.parse(child.meta!).storykit.world,
    JSON.stringify([pub?.status, pub?.json]));
  ok('it is in the original\'s Mogs and its family tree', !!child && mogsOf(parent.id).some((g) => g.id === child.id) && familyByRoot(parent.id).some((f) => f.id === child.id));
  const play = child ? storyPlay(child.meta, child.id) : null;
  ok('it plays the same pinned town as the original (city=pkg, town, build and tiles)', !!play && play.src.includes(`city=pkg&town=${lock.place}&tc=${encodeURIComponent(lock.compiler)}&ts=${lock.tiles}`), play?.src.slice(0, 300));
  if (child) { recordRun(child.id, `p-${tag}`, null); recordRun(parent.id, `p-${tag}`, null); }
  const pick = child ? castPick(child.id, `p-${tag}`, child.id) : null;
  ok('the Mog-off counts a pick from a player who finished both', !!pick && pick.child === 1 && pick.parent === 0 && mogOff(child!.id)?.child === 1, JSON.stringify(pick));
  ok('the Mog can itself be mogged (its dares and pages read canMog), named by the same town', !!child && canMog(child) && storyTownName(child.meta) === 'Oakland, California' && (await mogOpenFor(child, true)));
} catch (e) {
  ok('the check ran', false, e instanceof Error ? e.stack ?? e.message : String(e));
} finally {
  globalThis.fetch = realFetch;
  server.close();
  for (const k of Object.keys(process.env)) if (!(k in env)) delete process.env[k];
  Object.assign(process.env, env);
  process.chdir(ROOT_DIR);
  // the links first, one by one (never followed), then the folder's own data/
  for (const e of readdirSync(work)) if (e !== 'data') rmSync(path.join(work, e));
  rmSync(work, { recursive: true, force: true });
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
