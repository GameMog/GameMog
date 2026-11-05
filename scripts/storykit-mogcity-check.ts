/**
 * Story Kit: the Mog of Mog City, end to end without a paid call (5 Nov 2026; lib/storykit-mogcity.ts).
 *   node --import ./scripts/ts-resolve.mjs scripts/storykit-mogcity-check.ts      (npm run storykit:mogcity-check)
 *
 * /g/mog-city is the 3 Nov episode and plays as it always did; its Mog is a story Mog of Mog City's OWN story world,
 * which deploy/migrate.mjs (2026-11-05-mog-city-own-story) publishes hidden on the server's disk. Checked:
 *   the migration, on a fresh copy of deploy/seed.db.gz in a temporary folder (its Story Kit store beside it): it waits
 *     while STORYKIT is off; on, it publishes the own world hidden (no public page, not unlisted), linked to /g/mog-city,
 *     its store draft sealed and kept; run again it changes nothing; on a database shaped like the live one (the app's
 *     creator column there, every earlier migration recorded) it writes the creator too; an own world the dev script
 *     published before is linked and hidden instead of a second one;
 *   the build route (app/api/generate/route.ts POST, the real build loop, the real SDK against a stand-in Messages API on
 *     127.0.0.1, as storykit:builder-check): with the Story Kit off a Mog of /g/mog-city is MOG Soon (409) before anything
 *     is spent; on, another episode's Mog stays MOG Soon; a Mog of /g/mog-city reaches the story builder with the own
 *     world as its parent (STORY_MODEL, the own pack in the first turn), a pass titled "Mog City: ...", with a meter of
 *     its own and moved to San Francisco is sent back for all three, and the fixed pass is stored as a draft whose
 *     family is /g/mog-city's and whose store draft's parent is the own world's;
 *   publishing (app/api/games/route.ts POST): the Mog is generation 1 under /g/mog-city, in its Mogs and its family.
 * The throwaway rows in data/gamemog.db and the temporary folders go after.
 */
import { register } from 'node:module';
import { createServer, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import path from 'node:path';

const ROOT = new URL('../', import.meta.url).href;
register('data:text/javascript,' + encodeURIComponent(`
  export async function resolve(s, c, next) {
    if (s === 'next/server') return next('next/server.js', c);
    if (s === 'next/headers') return next('next/headers.js', c);
    if (!s.startsWith('@/')) return next(s, c);
    for (const ext of ['', '.ts', '.tsx', '/index.ts']) { try { return await next(${JSON.stringify(ROOT)} + s.slice(2) + ext, c); } catch {} }
    return next(s, c);
  }`));

const { db, mogsOf, familyByRoot } = await import('../lib/db.ts');
const { StoryStore } = await import('../lib/storykit-store.ts');
const { storykitPackOf } = await import('../lib/storykit-build.ts');
const { MOG_SOON } = await import('../lib/custom-game.ts');
const { isMogCityEpisode, mogCityStoryParent, MOG_CITY_STORY_SLUG } = await import('../lib/storykit-mogcity.ts');
const { migrate, MIGRATIONS } = await import('../deploy/migrate.mjs') as { migrate: (p: string) => Promise<void> | void; MIGRATIONS: { id: string; async?: boolean; run: (db: unknown, p: string) => unknown }[] };

let failed = 0, passed = 0;
const ok = (name: string, cond: boolean, detail = '') => { if (cond) passed++; else failed++; console.log(`  ${cond ? 'ok  ' : 'FAIL'}  ${name}${!cond && detail ? `\n          ${detail}` : ''}`); };
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
type Ev = { type: string; [k: string]: any };
const OWN_ID = '2026-11-05-mog-city-own-story';
const OWN = MIGRATIONS.find((m) => m.id === OWN_ID)!;
const RECORD = JSON.parse(readFileSync(new URL('deploy/migrations/mog-city-story.json', ROOT), 'utf8'));
const EP_CODE = readFileSync(new URL('deploy/migrations/mog-city.js', ROOT), 'utf8');
const EP_META = JSON.parse(readFileSync(new URL('deploy/migrations/mog-city.meta.json', ROOT), 'utf8'));
const env = { key: process.env.ANTHROPIC_API_KEY, token: process.env.ANTHROPIC_AUTH_TOKEN, base: process.env.ANTHROPIC_BASE_URL, usd: process.env.BUILD_DAILY_USD, sk: process.env.STORYKIT, ep: process.env.EPISODE_MOGS };
const temps: string[] = [];
const tmp = (p: string) => { const d = mkdtempSync(path.join(tmpdir(), p)); temps.push(d); return d; };
/** migrate quietly: what it logged */
async function migrateQuiet(p: string) {
  const out: string[] = [], log = console.log, err = console.error;
  console.log = (...a: unknown[]) => { out.push(a.join(' ')); }; console.error = (...a: unknown[]) => { out.push(a.join(' ')); };
  try { await migrate(p); } finally { console.log = log; console.error = err; }
  return out;
}
const seedTo = (dir: string) => { const p = path.join(dir, 'gamemog.db'); writeFileSync(p, gunzipSync(readFileSync(new URL('deploy/seed.db.gz', ROOT)))); return p; };
const ownRows = (d: DatabaseSync) => d.prepare("SELECT * FROM games WHERE json_extract(meta, '$.storykit.own') = 1").all() as any[];
const cols = (d: DatabaseSync) => new Set((d.prepare('PRAGMA table_info(games)').all() as { name: string }[]).map((c) => c.name));

/* ───────────────────────────── the migration, on a fresh seed ── */
console.log('\nMog of Mog City: the migration (a fresh copy of deploy/seed.db.gz)');
{
  delete process.env.STORYKIT;
  const A = tmp('mc-seed-'), pa = seedTo(A);
  const off = await migrateQuiet(pa);
  const da = new DatabaseSync(pa);
  ok('with the Story Kit off it waits: not recorded (tried at the next boot), nothing written, /g/mog-city published by the earlier migration',
    off.some((l) => l.includes(`${OWN_ID} failed: waiting`)) && !da.prepare('SELECT 1 FROM migrations WHERE id = ?').get(OWN_ID) && !ownRows(da).length && !existsSync(path.join(A, 'storykit'))
      && isMogCityEpisode(da.prepare("SELECT slug, format, code FROM games WHERE slug = 'mog-city'").get() as any), off.filter((l) => l.includes('mog-city')).join(' | '));
  da.close();
  process.env.STORYKIT = 'on';
  const on = await migrateQuiet(pa);
  const db1 = new DatabaseSync(pa), ep = db1.prepare("SELECT id FROM games WHERE slug = 'mog-city'").get() as { id: string };
  const own = ownRows(db1), m = own[0] ? JSON.parse(own[0].meta) : null;
  const store = new StoryStore(path.join(A, 'storykit'));
  const sd = m ? store.db.prepare('SELECT state, game_id, world, pack FROM drafts WHERE id = ?').get(m.storykit.pack) as any : null;
  ok('on: it publishes Mog City\'s own story world once, hidden and not unlisted (no public page, in no list), creator Mog City, linked to /g/mog-city (meta.storykit.ownOf)',
    own.length === 1 && own[0].slug === MOG_CITY_STORY_SLUG && own[0].hidden === 1 && !m.unlisted && own[0].title === 'Mog City' && own[0].creator === 'Mog City' && own[0].generation === 0 && !own[0].parent_id
      && m.mode === 'storykit' && m.storykit.own === true && m.storykit.ownOf === ep.id && !!db1.prepare('SELECT 1 FROM migrations WHERE id = ?').get(OWN_ID)
      && !db1.prepare('SELECT 1 FROM games WHERE slug = ? AND hidden = 0', ).get(MOG_CITY_STORY_SLUG), JSON.stringify([on.filter((l) => l.includes(OWN_ID)), own.map((r) => [r.slug, r.hidden, r.creator])]));
  ok('... on the creator column a fresh disk has not got yet (added as lib/db.ts adds it)', cols(db1).has('creator'));
  ok('... its store draft (data/storykit beside the database) is the own pack on Mog City\'s engine, sealed and kept with the game; its module is that pack',
    !!sd && sd.state === 'kept' && sd.game_id === own[0].id && sd.world === m.storykit.world && JSON.parse(sd.pack).id === 'mog-city' && JSON.parse(sd.pack).base.engine === 'mogcity-1'
      && existsSync(store.blobPath(sd.world, 'json')) && storykitPackOf((db1.prepare('SELECT code FROM games WHERE id = ?').get(own[0].id) as any).code)?.title === 'Mog City', JSON.stringify(sd && { ...sd, pack: undefined }));
  // idempotent: run again (recorded: skipped) and its body again (already there)
  await migrateQuiet(pa);
  db1.exec('BEGIN'); const again = await OWN.run(db1, pa); db1.exec('COMMIT');
  ok('run again it changes nothing: one own world, one store draft ("already there")', ownRows(db1).length === 1 && (store.db.prepare('SELECT COUNT(*) AS n FROM drafts').get() as any).n === 1 && /^already there/.test(String(again)), String(again));
  db1.close(); store.db.close();

  // the live database's shape: the app's columns there, every earlier migration recorded, an existing Mog City episode
  const B = tmp('mc-live-'), pb = seedTo(B);
  delete process.env.STORYKIT; await migrateQuiet(pb); process.env.STORYKIT = 'on';
  { const d = new DatabaseSync(pb); for (const c of ['creator TEXT', 'creator_player TEXT']) { if (!cols(d).has(c.split(' ')[0])) d.exec(`ALTER TABLE games ADD COLUMN ${c}`); } d.close(); }
  const live = await migrateQuiet(pb);
  { const d = new DatabaseSync(pb), own2 = ownRows(d);
    ok('on a database shaped like the live one (creator column there, earlier migrations recorded) it publishes the same way, creator Mog City',
      own2.length === 1 && own2[0].creator === 'Mog City' && own2[0].hidden === 1 && live.some((l) => l.includes(`${OWN_ID} (published /g/${MOG_CITY_STORY_SLUG} hidden`)), live.join(' | '));
    // an own world the dev script published before (no ownOf, listed): linked and hidden, never a second one
    const r = own2[0], meta = JSON.parse(r.meta); delete meta.storykit.ownOf;
    d.prepare('UPDATE games SET hidden = 0, meta = ? WHERE id = ?').run(JSON.stringify(meta), r.id);
    d.exec('BEGIN'); const note = await OWN.run(d, pb); d.exec('COMMIT');
    const after = ownRows(d);
    ok('an own world the dev script published (no link, listed) is linked to /g/mog-city and hidden, not published twice', after.length === 1 && after[0].hidden === 1 && !!JSON.parse(after[0].meta).storykit.ownOf && /^linked/.test(String(note)), String(note));
    d.close(); }
}

/* ───────────────────────────── the build route and publishing ── */
const REAL = ['Taylor Swift', 'Elon Musk'];
const api = { builds: 0, checks: 0, replies: [] as string[], requests: [] as any[] };
const sse = (res: ServerResponse, type: string, data: object) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
const usage = { input_tokens: 30_000, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
const server = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    let j: any = {};
    try { j = JSON.parse(body); } catch { /* */ }
    const msg = { id: `msg_${randomUUID().slice(0, 8)}`, type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', stop_sequence: null };
    if (!j.stream) {
      api.checks++;
      const t = JSON.stringify(j.messages ?? '');
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ ...msg, content: [{ type: 'text', text: JSON.stringify({ people: REAL.filter((n) => t.includes(n)), brands: [] }) }], stop_reason: 'end_turn', usage: { ...usage, input_tokens: 3000, output_tokens: 40 } }));
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
const reply = (pack: any, meta: Record<string, unknown> = {}) => '```json\n' + JSON.stringify({ tagline: 'Christmas Eve, and the laptop is still out there', blurb: 'The same night across Manhattan, in the snow: Jane runs it, Dan drives.', people: [], brands: [], ...meta }) + '\n```\n\n```json\n' + JSON.stringify(pack) + '\n```';
type POST = (req: Request) => Promise<Response>;
async function call(POST: POST, url: string, body: Record<string, unknown>) {
  const res = await POST(new Request(`http://127.0.0.1:3939${url}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  const events: Ev[] = [];
  if (!(res.headers.get('content-type') ?? '').includes('ndjson')) return { status: res.status, json: await res.json() as any, events };
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

// the Mog the stand-in writes: Mog City's own pack, Christmas in the snow, a new title; the builder sets its id and parent
function silentNight(own: any) {
  const p = clone(own);
  p.title = 'Silent Night Shift'; p.tagline = 'Christmas Eve, and the laptop is still out there';
  p.dressing = { ...p.dressing, season: 'winter', weather: 'snow', holiday: ['christmas'] };
  return p;
}

const tag = `skmc-${randomUUID().slice(0, 6)}`;
const realFetch = globalThis.fetch;
const C = tmp('mc-route-'), storeDir = path.join(C, 'storykit');
const prevStore = (globalThis as any).__storykitStore;
const added = { games: [] as string[], drafts: [] as string[], stores: [] as string[] };
let store: InstanceType<typeof StoryStore> | null = null;
await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
const port = (server.address() as { port: number }).port;
try {
  process.env.ANTHROPIC_API_KEY = 'stand-in-key-for-the-local-check'; delete process.env.ANTHROPIC_AUTH_TOKEN;
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${port}`;
  process.env.BUILD_DAILY_USD = '1000000';
  delete process.env.EPISODE_MOGS;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!url.startsWith(`http://127.0.0.1:${port}/`)) return Promise.reject(new Error(`the check refused a call to ${url}`));
    return realFetch(input, init);
  }) as typeof fetch;
  const { POST } = await import('../app/api/generate/route.ts') as { POST: POST };
  const { POST: PUBLISH } = await import('../app/api/games/route.ts') as { POST: POST };

  // the episode at /g/mog-city (this database's, or a throwaway one), and the own world linked to it: this database's
  // (its store is data/storykit) or one the migration publishes for the check (its store a temporary one)
  process.env.STORYKIT = 'on';
  let ep = db.prepare("SELECT id, slug, format, code, meta FROM games WHERE slug = 'mog-city'").get() as any;
  if (!ep) {
    const id = randomUUID();
    db.prepare(`INSERT INTO games (id, slug, title, tagline, blurb, difficulty, spec, prompt, featured, created_at, format, code, meta, generation)
      VALUES (?, 'mog-city', ?, ?, ?, 'endless', '{}', ?, 0, ?, 'world', ?, ?, 0)`).run(id, EP_META.title, EP_META.tagline, EP_META.blurb, `first-party ${tag}`, Date.now(), EP_CODE, JSON.stringify(EP_META.meta));
    added.games.push(id);
    ep = db.prepare("SELECT id, slug, format, code, meta FROM games WHERE id = ?").get(id);
  }
  const linked = (db.prepare("SELECT id, meta FROM games WHERE json_extract(meta, '$.storykit.own') = 1 AND json_extract(meta, '$.storykit.ownOf') = ?").all(ep.id) as any[])[0];
  if (linked) store = new StoryStore(path.join(process.cwd(), 'data', 'storykit'));
  else {
    store = new StoryStore(storeDir);
    db.exec('BEGIN');
    try { await OWN.run(db, path.join(C, 'gamemog.db')); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; }
    const g = (db.prepare("SELECT id, meta FROM games WHERE json_extract(meta, '$.storykit.ownOf') = ?").get(ep.id) as any);
    added.games.push(g.id); added.stores.push(JSON.parse(g.meta).storykit.pack);
  }
  (globalThis as any).__storykitStore = store;
  const own = mogCityStoryParent();
  const ownStore = own ? JSON.parse(own.meta!).storykit.pack : null;
  console.log('\nMog of Mog City: the build route (a stand-in model, no paid call)');
  ok('/g/mog-city is the episode (isMogCityEpisode), and mogCityStoryParent is its own story world (hidden, its store draft kept)',
    isMogCityEpisode(ep) && !!own && own.slug !== 'mog-city' && !!ownStore && (store.db.prepare('SELECT state FROM drafts WHERE id = ?').get(ownStore) as any)?.state === 'kept'
      && !!(db.prepare('SELECT hidden FROM games WHERE id = ?').get(own.id) as any)?.hidden);

  // the switch off: MOG Soon, nothing spent; and no own world is offered
  delete process.env.STORYKIT;
  const calls0 = api.builds + api.checks;
  const off = await call(POST, '/api/generate', { mogOf: 'mog-city', prompt: `Make it Christmas ${tag}` });
  ok('Story Kit off: a Mog of /g/mog-city is MOG Soon (409, the coming-soon words), nothing spent, and no own world is offered',
    off.status === 409 && off.json?.error === MOG_SOON && api.builds + api.checks === calls0 && !mogCityStoryParent(), JSON.stringify([off.status, off.json]));
  process.env.STORYKIT = 'on';

  // another episode (a throwaway one) stays MOG Soon
  const other = randomUUID(), otherSlug = `episode-${tag}`;
  db.prepare(`INSERT INTO games (id, slug, title, tagline, blurb, difficulty, spec, prompt, featured, created_at, format, code, meta, generation)
    VALUES (?, ?, 'Another Episode', 't', 'b', 'endless', '{}', ?, 0, ?, 'world', ?, ?, 0)`).run(other, otherSlug, `episode ${tag}`, Date.now(), EP_CODE, JSON.stringify(EP_META.meta));
  added.games.push(other);
  const otherMog = await call(POST, '/api/generate', { mogOf: otherSlug, prompt: `Make it Christmas ${tag}` });
  ok('on: another episode\'s Mog stays MOG Soon (409) before anything is spent (EPISODE_MOGS unset)', otherMog.status === 409 && otherMog.json?.error === MOG_SOON && api.builds + api.checks === calls0, JSON.stringify([otherMog.status, otherMog.json]));

  // a Mog of /g/mog-city: a pass that names Mog City, adds a meter and moves to San Francisco, then the fixed pass
  const ownPack = storykitPackOf(own!.code)!;
  const bad = silentNight(ownPack);
  bad.title = 'Mog City: Silent Night';
  bad.hud.meters.push({ id: 'cheer', label: 'CHEER', kind: 'count', start: 0 });
  bad.base = { ...bad.base, city: 'sf' };
  api.replies = [reply(bad), reply(silentNight(ownPack))];
  const n0 = api.requests.length;
  const mog = await call(POST, '/api/generate', { mogOf: 'mog-city', prompt: `Make it a Christmas story where Jane is the boss and Dan drives a vintage pickup ${tag}` });
  const md = doneOf(mog), back = sentBack(mog);
  const first = api.requests[n0], turn = JSON.stringify(first?.messages ?? '');
  ok('it reaches the story builder: STORY_MODEL (claude-opus-5-5), the first turn a MOG of the own world (its pack, title Mog City, New York locked)',
    first?.model === 'claude-opus-5-5' && turn.includes('MOG. The original: \\"Mog City\\"') && turn.includes('\\"id\\":\\"mog-city\\"') && turn.includes('ny-mogcity-1') && !turn.includes('episode'), turn.slice(0, 400));
  ok('a pass titled "Mog City: ..." is sent back (only Mog City\'s own world carries its name)', back.some((p) => /names Mog City/.test(p)), back.join(' | ').slice(0, 600));
  ok('a pass with a meter of its own is sent back (the framework stays: a Mog keeps its parent\'s meters)', back.some((p) => /hud\.meters "cheer": a Mog keeps its parent's meters/.test(p)), back.join(' | ').slice(0, 600));
  ok('a pass moved to San Francisco is sent back (the city is locked: New York)', back.some((p) => /a Mog keeps its parent's city and build exactly/.test(p)), back.join(' | ').slice(0, 600));
  const dRow = md ? db.prepare('SELECT code, meta, report, parent_id, mog_prompt FROM drafts WHERE id = ?').get(md.draftId) as any : null;
  if (md) added.drafts.push(md.draftId);
  const dPack = dRow ? storykitPackOf(dRow.code) : null, dMeta = dRow ? JSON.parse(dRow.meta) : null, dRep = dRow ? JSON.parse(dRow.report) : null;
  const sRow = md?.story ? store.db.prepare('SELECT parent FROM drafts WHERE id = ?').get(md.story.draft) as any : null;
  if (md?.story) added.stores.push(md.story.draft);
  ok('the fixed pass is kept on the second pass: "Silent Night Shift" in New York on Mog City\'s engine, its parent the own world',
    !!md && md.attempts === 2 && dPack?.title === 'Silent Night Shift' && dPack.base.city === 'ny' && dPack.base.engine === 'mogcity-1' && dPack.parent === 'mog-city' && dMeta?.storykit?.parent === 'mog-city',
    JSON.stringify(mog.events.filter((e) => e.type === 'error' || e.type === 'problems').slice(-2)).slice(0, 600));
  ok('its family is /g/mog-city\'s (the draft\'s parent is the episode), and its store draft\'s parent is the own world\'s',
    dRow?.parent_id === ep.id && sRow?.parent === ownStore && dRow.mog_prompt?.includes('Jane is the boss'), JSON.stringify([dRow?.parent_id, ep.id, sRow, ownStore]));
  ok('everyone is Mog City\'s shipped people and every line its recording (nothing to forge or voice: only the season changed)',
    !!dRep && dRep.inherit.todo.forge.length === 0 && dRep.inherit.lines.render === 0 && dRep.inherit.lines.total > 400, JSON.stringify(dRep?.inherit?.todo));

  // publishing: generation 1 under /g/mog-city, in its Mogs tab and its family tree
  const pub = md ? await call(PUBLISH, '/api/games', { draftId: md.draftId, creator: 'MC Tester' }) : null;
  const pg = pub?.json?.id ? db.prepare('SELECT id, slug, title, parent_id, root_id, generation, hidden, meta FROM games WHERE id = ?').get(pub.json.id) as any : null;
  if (pg) added.games.push(pg.id);
  console.log('\nMog of Mog City: publishing');
  ok('it publishes as a Mog of /g/mog-city: generation 1, parent and root the episode, listed, a story world playing its sealed world, no "Mog City" in its title',
    !!pg && pg.parent_id === ep.id && pg.root_id === ep.id && pg.generation === 1 && pg.hidden === 0 && !/mog\s*city/i.test(pg.title) && JSON.parse(pg.meta).mode === 'storykit' && !!JSON.parse(pg.meta).storykit.world,
    JSON.stringify([pub?.status, pub?.json, pg && { ...pg, meta: undefined }]));
  ok('it is in /g/mog-city\'s Mogs (mogsOf) and its family tree (familyByRoot); the hidden own world is in neither',
    !!pg && mogsOf(ep.id).some((g) => g.id === pg.id) && familyByRoot(ep.id).some((f: any) => (f.game?.id ?? f.id) === pg.id)
      && !mogsOf(ep.id).some((g) => g.id === own!.id) && !familyByRoot(ep.id).some((f: any) => (f.game?.id ?? f.id) === own!.id),
    JSON.stringify(familyByRoot(ep.id).map((f: any) => f.game?.slug ?? f.slug)));
  const kept = md?.story ? store.db.prepare('SELECT state, game_id FROM drafts WHERE id = ?').get(md.story.draft) as any : null;
  ok('its store draft is kept with the game', kept?.state === 'kept' && kept.game_id === pg?.id, JSON.stringify(kept));
} catch (e) {
  failed++; console.log('  FAIL  the check threw:', (e as Error).stack);
} finally {
  globalThis.fetch = realFetch;
  server.close();
  for (const [k, v] of [['ANTHROPIC_API_KEY', env.key], ['ANTHROPIC_AUTH_TOKEN', env.token], ['ANTHROPIC_BASE_URL', env.base], ['BUILD_DAILY_USD', env.usd], ['STORYKIT', env.sk], ['EPISODE_MOGS', env.ep]] as const) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  for (const id of added.games.reverse()) { for (const t of ['plays', 'scores', 'mog_picks']) { try { db.prepare(`DELETE FROM ${t} WHERE ${t === 'mog_picks' ? 'child_id' : 'game_id'} = ?`).run(id); } catch { /* */ } } db.prepare('DELETE FROM games WHERE id = ?').run(id); }
  for (const id of added.drafts) db.prepare('DELETE FROM drafts WHERE id = ?').run(id);
  db.prepare('DELETE FROM drafts WHERE prompt LIKE ?').run(`%${tag}%`);
  try { db.prepare('DELETE FROM generations WHERE prompt LIKE ?').run(`%${tag}%`); } catch { /* */ }
  if (store) {
    for (const id of added.stores) { try { store.release(id); const d = store.db.prepare('SELECT * FROM drafts WHERE id = ?').get(id) as any; if (d) store.abandon(d); } catch { /* */ } }
    store.db.close();
  }
  (globalThis as any).__storykitStore = prevStore;
  for (const d of temps) rmSync(d, { recursive: true, force: true });
}
console.log(`\n${passed} passed, ${failed} failed (${api.builds} build passes and ${api.checks} name checks against the stand-in, no paid call)`);
process.exit(failed ? 1 : 0);
