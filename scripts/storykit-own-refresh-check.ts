/**
 * Story Kit: Mog City's own story world refreshed in place (deploy/migrate.mjs 2026-11-16-mog-city-own-story-refresh,
 * refreshMogCityOwnStory). Part of `npm run check`. On a fresh copy of deploy/seed.db.gz in a temporary folder (its
 * Story Kit store beside it), with the own world published by 2026-11-05-mog-city-own-story and then set back to an
 * older pack (as the server's still is): the refresh keeps the game (id, slug, hidden, ownOf), its module and meta become
 * the record's pack, a new store draft is sealed and kept with it, the old one is released and abandoned, or kept while a
 * Mog's store draft names it as its parent; run again it is "already current". It waits as the original waits. Nothing
 * touches data/.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { StoryStore } from '../lib/storykit-store.ts';

type Ok = (name: string, cond: boolean, detail?: string) => void;
type Migration = { id: string; async?: boolean; run: (db: unknown, p: string) => unknown };
const OWN_ID = '2026-11-05-mog-city-own-story', REFRESH_ID = '2026-11-16-mog-city-own-story-refresh';

export async function runOwnRefreshChecks(ok: Ok) {
  console.log('\nStory Kit: Mog City\'s own story world refreshed in place (deploy/migrate.mjs ' + REFRESH_ID + ')');
  const { migrate, MIGRATIONS } = await import('../deploy/migrate.mjs') as { migrate: (p: string) => Promise<void> | void; MIGRATIONS: Migration[] };
  const iOwn = MIGRATIONS.findIndex((m) => m.id === OWN_ID), iRef = MIGRATIONS.findIndex((m) => m.id === REFRESH_ID);
  ok('the refresh is a migration of its own, async, after the original', iOwn >= 0 && iRef > iOwn && !!MIGRATIONS[iRef].async && !!MIGRATIONS[iOwn].async, `${iOwn} ${iRef}`);
  if (iOwn < 0 || iRef < 0) return;
  const OWN = MIGRATIONS[iOwn], REF = MIGRATIONS[iRef];
  const rec = JSON.parse(readFileSync('deploy/migrations/mog-city-story.json', 'utf8'));
  const packJson = JSON.stringify(rec.pack), modOf = (j: string) => `GameMog.world({ storykit: ${j} });\n`;

  const dir = mkdtempSync(path.join(tmpdir(), 'mc-own-refresh-')), p = path.join(dir, 'gamemog.db');
  const sk = process.env.STORYKIT, log = console.log, err = console.error;
  const run = async (m: Migration, d: DatabaseSync) => { d.exec('BEGIN'); try { const n = String(await m.run(d, p)); d.exec('COMMIT'); return n; } catch (e) { d.exec('ROLLBACK'); return `threw: ${(e as Error).message}`; } };
  try {
    writeFileSync(p, gunzipSync(readFileSync('deploy/seed.db.gz')));
    delete process.env.STORYKIT;
    console.log = () => {}; console.error = () => {};
    try { await migrate(p); } finally { console.log = log; console.error = err; }
    const db = new DatabaseSync(p);
    ok('with the Story Kit off it waits, as the original waits', /^threw: waiting: the Story Kit is off/.test(await run(REF, db)));
    process.env.STORYKIT = 'on';
    // no own world yet: it does what the original does, then finds it current
    const first = await run(REF, db);
    const own = () => db.prepare("SELECT id, slug, hidden, code, meta FROM games WHERE json_extract(meta, '$.storykit.own') = 1").all() as any[];
    ok('with no own world it publishes one as the original does, then it is already current', own().length === 1 && /^published .*; already current/.test(first), first);
    const store = new StoryStore(path.join(dir, 'storykit'));
    const draft = (id: string) => store.db.prepare('SELECT * FROM drafts WHERE id = ?').get(id) as any;

    // the server's state: the own world on an older pack (its store draft and its module)
    const setOld = () => {
      const g = own()[0], m = JSON.parse(g.meta), old = JSON.parse(packJson); old.tagline = `${old.tagline ?? ''} (older)`;
      const oj = JSON.stringify(old);
      store.db.prepare('UPDATE drafts SET pack = ? WHERE id = ?').run(oj, m.storykit.pack);
      db.prepare('UPDATE games SET code = ? WHERE id = ?').run(modOf(oj), g.id);
      return { g, m };
    };
    { const { g, m } = setOld(), note = await run(REF, db), [h] = own(), hm = JSON.parse(h.meta), nd = draft(hm.storykit.pack);
      ok('it refreshes the own world in place: same id, slug, hidden and ownOf; module the record\'s pack; meta names a new kept store draft and its sealed world',
        h.id === g.id && h.slug === g.slug && h.hidden === 1 && hm.storykit.ownOf === m.storykit.ownOf && h.code === modOf(packJson) && hm.storykit.pack !== m.storykit.pack
          && !!nd && nd.state === 'kept' && nd.game_id === g.id && nd.pack === packJson && nd.world === hm.storykit.world && !!store.read(`${nd.world}.json`), note);
      ok('... the old store draft, named by no Mog, is released and abandoned', !draft(m.storykit.pack) && /released and abandoned/.test(note), note);
      const again = await run(REF, db);
      ok('run again it is already current, nothing written', /^already current/.test(again) && (store.db.prepare("SELECT COUNT(*) AS n FROM drafts WHERE game_id = ?").get(g.id) as any).n === 1, again); }

    { const { g, m } = setOld();
      store.db.prepare("INSERT INTO drafts (id, token_hash, pack, parent, state, game_id, world, created_at, touched_at) VALUES ('00000000-0000-4000-8000-00000000c0de', 'x', '{}', ?, 'kept', 'a-mog', NULL, 1, 1)").run(m.storykit.pack);
      const note = await run(REF, db), [h] = own(), od = draft(m.storykit.pack);
      ok('an old store draft a Mog\'s store draft names as its parent stays kept (and its sealed world served)',
        h.id === g.id && h.code === modOf(packJson) && !!od && od.state === 'kept' && !!store.read(`${od.world}.json`) && /kept \(a Mog store draft names it/.test(note), note); }
    db.close(); store.db.close();
  } finally {
    console.log = log; console.error = err;
    if (sk === undefined) delete process.env.STORYKIT; else process.env.STORYKIT = sk;
    rmSync(dir, { recursive: true, force: true });
  }
}
