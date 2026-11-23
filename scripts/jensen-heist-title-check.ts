/**
 * Jensen Heist retitled (deploy/migrate.mjs 2026-11-21-jensen-heist-title; the owner, 21 Nov: "SAN JOSE, CA" in place of
 * "Ten Hours to Showtime", styled like /g/oaktown). Part of `npm run check`. On a fresh copy of deploy/seed.db.gz in a
 * temporary folder (its Story Kit store beside it): it waits while the Story Kit is off and while the game is not there;
 * after 2026-11-18-jensen-heist on a fresh disk (which already seals the retitled record) it swaps only the art; on the
 * state gamemog.com has (the world, pack, module, words and art 2026-11-18 published there, the game shown) it seals the
 * new world into the kept store draft in place (the old one kept, still served), retitles the row, swaps the cover and
 * the key art and leaves the slug, the icon, the headshot and hidden as they are; run again it is "already there"; a
 * game playing some other world is left alone. Nothing touches data/.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { StoryStore } from '../lib/storykit-store.ts';

type Ok = (name: string, cond: boolean, detail?: string) => void;
type Migration = { id: string; async?: boolean; run: (db: unknown, p: string) => unknown };
type W = { title: string; kicker: string; tagline: string };
const PUB_ID = '2026-11-18-jensen-heist', ID = '2026-11-21-jensen-heist-title';
const sha = (b: string | Uint8Array) => createHash('sha256').update(b).digest('hex');

export async function runJensenTitleChecks(ok: Ok) {
  console.log('\nJensen Heist retitled SAN JOSE, CA (deploy/migrate.mjs ' + ID + ')');
  const { migrate, MIGRATIONS, JH_TITLE, JH_TITLES, JH_TITLE_WAS, JH_TITLE_FROM, JH_LATER, jhTitledWorld } = await import('../deploy/migrate.mjs') as {
    migrate: (p: string) => Promise<void> | void; MIGRATIONS: Migration[]; JH_TITLE: W; JH_TITLES: string[]; JH_TITLE_WAS: W; JH_TITLE_FROM: string; JH_LATER: string[]; jhTitledWorld: (t: string, w: W) => string };
  const iPub = MIGRATIONS.findIndex((m) => m.id === PUB_ID), iT = MIGRATIONS.findIndex((m) => m.id === ID);
  ok('the retitle is a migration of its own, async, after the publish', iPub >= 0 && iT > iPub && !!MIGRATIONS[iT].async && !!MIGRATIONS[iPub].async, `${iPub} ${iT}`);
  if (iPub < 0 || iT < 0) return;
  const PUB = MIGRATIONS[iPub], T = MIGRATIONS[iT];
  const R = JSON.parse(readFileSync('deploy/migrations/jensen-heist-story.json', 'utf8'));
  const worldText = readFileSync('deploy/migrations/jensen-heist/world.json', 'utf8'), W = JSON.parse(worldText);
  const art = (n: string) => readFileSync(`deploy/migrations/jensen-heist-${n}.jpg`);
  // (its title "Jensen Heist", or a later one: "Jensen Return" since 23 Nov, 2026-11-23-jensen-return, scripts/jensen-return-check.ts)
  ok('the record is the owner\'s title: "Jensen Heist" (or a later one, JH_TITLES), SAN JOSE, CA under it, the tagline "San Jose, CA. One chip. One jacket."',
    R.pack.title === R.meta.title && JH_TITLES.includes(R.meta.title) && R.pack.kicker === 'SAN JOSE, CA' && W.kicker === 'SAN JOSE, CA' && W.title === R.meta.title
      && R.meta.tagline === 'San Jose, CA. One chip. One jacket.' && R.pack.tagline === R.meta.tagline && R.slug === 'jensen-heist' && JH_TITLE.title === 'Jensen Heist',
    `${R.pack.title} / ${R.pack.kicker} / ${R.meta.tagline}`);
  ok('... no "Ten hours to showtime" left in the record or its world; the Showtime act stays',
    !/ten hours to showtime/i.test(JSON.stringify(R)) && !/ten hours to showtime/i.test(worldText) && /"Showtime"/.test(worldText));
  const oldText = jhTitledWorld(worldText, JH_TITLE_WAS);
  // (a later record, the polish batch's (2026-11-21-jensen-heist-polish1, scripts/jensen-heist-polish1-check.ts): its
  // world is more than the retitle, so the retitle never seals it; it brings the words and the art alone)
  const later = JH_LATER.includes(R.world.hash);
  ok('the world gamemog.com plays (2026-11-18\'s) is this world with the old title, kicker and tagline, byte for byte, or the record is a later one (JH_LATER)', sha(oldText) === JH_TITLE_FROM || later, sha(oldText).slice(0, 12));

  const dir = mkdtempSync(path.join(tmpdir(), 'jh-title-')), p = path.join(dir, 'gamemog.db');
  const sk = process.env.STORYKIT, log = console.log, err = console.error;
  const run = async (m: Migration, d: DatabaseSync) => { d.exec('BEGIN'); try { const n = String(await m.run(d, p)); d.exec('COMMIT'); return n; } catch (e) { d.exec('ROLLBACK'); return `threw: ${(e as Error).message}`; } };
  try {
    writeFileSync(p, gunzipSync(readFileSync('deploy/seed.db.gz')));
    delete process.env.STORYKIT;
    console.log = () => {}; console.error = () => {};
    try { await migrate(p); } finally { console.log = log; console.error = err; }
    const db = new DatabaseSync(p);
    ok('with the Story Kit off it waits (unrecorded)', /^threw: waiting: the Story Kit is off/.test(await run(T, db)) && !db.prepare('SELECT 1 FROM migrations WHERE id = ?').get(ID));
    process.env.STORYKIT = 'on';
    ok('before the game is published it waits', /^threw: waiting: Jensen Heist is not in this database/.test(await run(T, db)));
    const pub = await run(PUB, db);
    ok('2026-11-18-jensen-heist still publishes on a fresh disk (the retitled record)', /^published \/g\/jensen-heist HIDDEN/.test(pub), pub);
    const row = () => db.prepare("SELECT * FROM games WHERE slug = 'jensen-heist'").get() as any;
    const same = (a: unknown, b: Buffer) => a != null && Buffer.from(a as Uint8Array).equals(b);
    { const note = await run(T, db), g = row();
      ok('after it, on a fresh disk only the art is swapped (the titled cover and key art), the title already the record\'s, still hidden',
        /new cover, art_wide/.test(note) && !/plays/.test(note) && g.title === R.meta.title && g.hidden === 1 && same(g.cover, art('cover-2')) && same(g.art_wide, art('wide-2'))
          && same(g.art_icon, art('icon')) && same(g.art_avatar, art('sky')), note);
      const again = await run(T, db);
      ok('... run again it is already there', /^already there/.test(again), again); }

    // gamemog.com's state: what 2026-11-18 published there (the old world sealed in the kept draft, its pack, module,
    // words and art), and the game shown (the owner un-hid it)
    const store = new StoryStore(path.join(dir, 'storykit'));
    const g0 = row(), m0 = JSON.parse(g0.meta), draftId = m0.storykit.pack;
    const oldPack = { ...R.pack, ...JH_TITLE_WAS };
    const setLive = () => {
      const bp = store.blobPath(JH_TITLE_FROM, 'json');
      mkdirSync(path.dirname(bp), { recursive: true }); writeFileSync(bp, oldText);
      store.db.prepare('INSERT OR IGNORE INTO blobs (hash, ext, bytes, at) VALUES (?, ?, ?, ?)').run(JH_TITLE_FROM, 'json', Buffer.byteLength(oldText), 1);
      store.db.prepare("UPDATE files SET hash = ?, bytes = ? WHERE draft_id = ? AND kind = 'pack' AND name = 'world.json'").run(JH_TITLE_FROM, Buffer.byteLength(oldText), draftId);
      store.db.prepare("DELETE FROM files WHERE draft_id = ? AND name LIKE 'was-%'").run(draftId);
      store.db.prepare('UPDATE drafts SET pack = ?, world = ? WHERE id = ?').run(JSON.stringify(oldPack), JH_TITLE_FROM, draftId);
      const meta = { ...m0, title: JH_TITLE_WAS.title, tagline: JH_TITLE_WAS.tagline, storykit: { ...m0.storykit, world: JH_TITLE_FROM } };
      db.prepare('UPDATE games SET title = ?, tagline = ?, meta = ?, code = ?, cover = ?, art_wide = ?, hidden = 0 WHERE id = ?')
        .run(JH_TITLE_WAS.title, JH_TITLE_WAS.tagline, JSON.stringify(meta), `GameMog.world({ storykit: ${JSON.stringify(oldPack)} });\n`, art('cover'), art('wide'), g0.id);
    };
    setLive();
    if (later) {
      const note = await run(T, db), g = row();
      ok('on gamemog.com\'s pre-retitle state, a later record is left alone by the retitle (never sealed as a retitle)', /^left alone: .*a later one than the retitle/.test(note) && g.title === JH_TITLE_WAS.title, note);
    } else { const note = await run(T, db), g = row(), m = JSON.parse(g.meta), d = store.db.prepare('SELECT * FROM drafts WHERE id = ?').get(draftId) as any;
      const was = store.db.prepare("SELECT hash FROM files WHERE draft_id = ? AND name = ?").get(draftId, `was-${JH_TITLE_FROM}.json`) as any;
      ok('on gamemog.com\'s state it retitles the game in place: same id and slug, title, tagline, meta and module the record\'s, the world the record\'s',
        g.id === g0.id && g.slug === 'jensen-heist' && g.title === R.meta.title && g.tagline === R.meta.tagline && m.title === R.meta.title && m.tagline === R.meta.tagline
          && m.storykit.world === R.world.hash && m.storykit.pack === draftId && g.code === `GameMog.world({ storykit: ${JSON.stringify(R.pack)} });\n` && note.includes(`plays ${R.world.hash.slice(0, 12)} (was ${JH_TITLE_FROM.slice(0, 12)}, kept)`), note);
      ok('... the new world sealed into the same kept store draft (its pack the record\'s), the old one kept as a was- row, both served',
        d.state === 'kept' && d.game_id === g.id && d.world === R.world.hash && d.pack === JSON.stringify(R.pack) && was?.hash === JH_TITLE_FROM
          && store.read(`${R.world.hash}.json`)?.hash === R.world.hash && store.read(`${JH_TITLE_FROM}.json`)?.hash === JH_TITLE_FROM);
      ok('... the cover and the key art the titled ones; the icon and the headshot as they were; shown as it was (hidden 0)',
        same(g.cover, art('cover-2')) && same(g.art_wide, art('wide-2')) && same(g.art_icon, art('icon')) && same(g.art_avatar, art('sky')) && g.hidden === 0, `hidden ${g.hidden}`);
      ok('... the rest of its meta as it was (blurb, cast, credit, packId, showcase)',
        m.blurb === m0.blurb && JSON.stringify(m.cast) === JSON.stringify(m0.cast) && m.storykit.credit === m0.storykit.credit && m.storykit.packId === 'jensen-heist' && m.storykit.showcase === true);
      const again = await run(T, db);
      ok('... run again it is already there', /^already there/.test(again), again); }

    { setLive();
      const g = row(), m = JSON.parse(g.meta), other = 'f'.repeat(64);
      db.prepare('UPDATE games SET meta = ? WHERE id = ?').run(JSON.stringify({ ...m, storykit: { ...m.storykit, world: other } }), g.id);
      const note = await run(T, db), h = row();
      ok('a game playing some other world (patched since) is left alone: title and art untouched', /^left alone/.test(note) && h.title === JH_TITLE_WAS.title && same(h.cover, art('cover')), note); }

    { setLive();
      db.prepare("UPDATE games SET cover = ? WHERE slug = 'jensen-heist'").run(Buffer.from([0xff, 0xd8, 0xff, 0x00]));
      const note = await run(T, db), h = row();
      ok('a cover changed since by hand is left alone (the world, words and key art still brought up)',
        later ? /^left alone: .*a later one than the retitle/.test(note) : /left alone: its cover/.test(note) && h.title === R.meta.title && same(h.art_wide, art('wide-2')) && !same(h.cover, art('cover-2')), note); }
    db.close(); store.db.close();

    // the whole boot on a fresh disk with the Story Kit on: both recorded, the game the retitled one
    const p2 = path.join(dir, 'fresh.db');
    writeFileSync(p2, gunzipSync(readFileSync('deploy/seed.db.gz')));
    console.log = () => {}; console.error = () => {};
    try { await migrate(p2); } finally { console.log = log; console.error = err; }
    const d2 = new DatabaseSync(p2), notes = d2.prepare('SELECT id, note FROM migrations WHERE id IN (?, ?)').all(PUB_ID, ID) as any[], g2 = d2.prepare("SELECT title, hidden, cover FROM games WHERE json_extract(meta, '$.storykit.packId') = 'jensen-heist'").get() as any;
    // (its titled cover, or Jensen Return's, which 2026-11-23-jensen-return swaps in after it)
    ok('a fresh boot with the Story Kit on records both and ends with the retitled game, its titled cover, hidden',
      notes.length === 2 && g2?.title === R.meta.title && g2.hidden === 1 && same(g2.cover, art(R.meta.title === JH_TITLE.title ? 'cover-2' : 'cover-3')), notes.map((n) => `${n.id}: ${n.note}`).join(' | '));
    d2.close();
  } finally {
    console.log = log; console.error = err;
    if (sk === undefined) delete process.env.STORYKIT; else process.env.STORYKIT = sk;
    rmSync(dir, { recursive: true, force: true });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let failed = 0;
  await runJensenTitleChecks((name, cond, detail) => { console.log(`${cond ? '  ok  ' : '  FAIL'} ${name}${!cond && detail ? `: ${detail}` : ''}`); if (!cond) failed++; });
  process.exit(failed ? 1 : 0);
}
