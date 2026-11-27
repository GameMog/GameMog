/**
 * Jensen Return (deploy/migrate.mjs 2026-11-23-jensen-return; the owner, 23 Nov: "rename game everywhere 'Jensen
 * Return'"). Part of `npm run check`. The record's world differs from day1's (JH_RETURN_FROM, what gamemog.com plays)
 * only in its title: with the old title put back (jhTitledWorld, JH_TITLE) it is JH_RETURN_FROM byte for byte, so every
 * spoken line, speaker, clip and body is as it was. On a fresh copy of deploy/seed.db.gz in a temporary folder (its
 * Story Kit store beside it): it waits while the Story Kit is off and while the game is not there; after
 * 2026-11-18-jensen-heist and the retitle on a fresh disk (the record's world and title already there) it moves the
 * address and swaps the art; on the state gamemog.com has (day1's world sealed in the kept draft, its pack and module,
 * "Jensen Heist" at /g/jensen-heist with the retitle's cover and key art and 2026-11-18's icon, the game shown, its
 * plays and scores) it seals the new world into the kept store draft in place (the old one kept, still served),
 * retitles the row, moves it to /g/jensen-return and swaps the cover, key art and icon, keeping its id, plays, scores,
 * headshot and hidden; run again it is "already there"; another game at /g/jensen-return keeps its address; a game
 * playing some other world is left alone. The old address redirects (next.config.ts, 301). Nothing touches data/.
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
type T = { title: string; kicker: string; tagline: string };
const PUB_ID = '2026-11-18-jensen-heist', TITLE_ID = '2026-11-21-jensen-heist-title', P1_ID = '2026-11-21-jensen-heist-polish1', P2_ID = '2026-11-21-jensen-heist-polish2', P3_ID = '2026-11-21-jensen-heist-polish3', D1_ID = '2026-11-22-jensen-heist-day1', ID = '2026-11-23-jensen-return';
const sha = (b: string | Uint8Array) => createHash('sha256').update(b).digest('hex');
const jpeg = (b: Buffer) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
/** A JPEG's width and height (its first SOF marker). */
function jpegSize(b: Buffer): [number, number] {
  for (let i = 2; i + 9 < b.length;) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1], len = b.readUInt16BE(i + 2);
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
    i += 2 + len;
  }
  return [0, 0];
}

export async function runJensenReturnChecks(ok: Ok) {
  console.log('\nJensen Return (deploy/migrate.mjs ' + ID + ')');
  const { migrate, MIGRATIONS, JH_TITLE, JH_RETURN, JH_RETURN_FROM, JH_RETURN_ART, JH_LATER, jhTitledWorld } = await import('../deploy/migrate.mjs') as {
    migrate: (p: string) => Promise<void> | void; MIGRATIONS: Migration[]; JH_TITLE: T; JH_RETURN: { title: string; slug: string }; JH_RETURN_FROM: string;
    JH_RETURN_ART: Record<string, string>; JH_LATER: string[]; jhTitledWorld: (t: string, w: T) => string };
  const ids = [PUB_ID, TITLE_ID, P1_ID, P2_ID, P3_ID, D1_ID, ID].map((id) => MIGRATIONS.findIndex((m) => m.id === id)), iP = ids[6];
  // (the last of Jensen's migrations; later worlds' own come after it, Mandi's Revenge's 2026-11-27)
  const lastJh = MIGRATIONS.map((m) => /jensen/.test(m.id)).lastIndexOf(true);
  ok('Jensen Return is one migration of its own, async, after the retitle, the three polish batches and day A, the last of Jensen\'s', ids.every((n, k) => n >= 0 && (k === 0 || n > ids[k - 1])) && iP === lastJh && !!MIGRATIONS[iP].async, ids.join(' '));
  if (ids.some((n) => n < 0)) return;
  const PUB = MIGRATIONS[ids[0]], TT = MIGRATIONS[ids[1]], P = MIGRATIONS[iP];
  const R = JSON.parse(readFileSync('deploy/migrations/jensen-heist-story.json', 'utf8'));
  const worldText = readFileSync('deploy/migrations/jensen-heist/world.json', 'utf8'), W = JSON.parse(worldText);
  ok('the record is titled "Jensen Return" (pack, meta, world), SAN JOSE, CA under it, the tagline as it was; its id and first address jensen-heist',
    R.pack.title === 'Jensen Return' && R.meta.title === 'Jensen Return' && W.title === 'Jensen Return' && JH_RETURN.title === R.meta.title && JH_RETURN.slug === 'jensen-return'
      && R.pack.kicker === JH_TITLE.kicker && W.kicker === JH_TITLE.kicker && R.meta.tagline === JH_TITLE.tagline && R.pack.tagline === JH_TITLE.tagline && W.tagline === JH_TITLE.tagline
      && R.slug === 'jensen-heist' && R.pack.id === 'jensen-heist' && W.id === 'jensen-heist', `${R.pack.title} / ${R.pack.kicker} / ${R.meta.tagline}`);
  ok('... the record and its world name no spy, espionage, affair or China (the owner: no scandal content)',
    !/\b(spy|spies|spying|espionage|affairs?|china|chinese|beijing)\b/i.test(JSON.stringify(R)) && !/\b(spy|spies|spying|espionage|affairs?|china|chinese|beijing)\b/i.test(worldText));
  ok('the record\'s world is one the earlier migrations leave to a later one (JH_LATER), after day1\'s', JH_LATER.includes(R.world.hash) && JH_LATER.indexOf(R.world.hash) > JH_LATER.indexOf(JH_RETURN_FROM) && JH_LATER.includes(JH_RETURN_FROM), R.world.hash.slice(0, 12));
  const oldText = jhTitledWorld(worldText, JH_TITLE);
  ok('... it is day1\'s world with only the title changed (the old title put back, it is JH_RETURN_FROM, byte for byte: every line, speaker, clip and body as it was)', sha(oldText) === JH_RETURN_FROM && oldText !== worldText);
  const art = (n: string) => readFileSync(`deploy/migrations/jensen-heist-${n}.jpg`);
  const NEW: Record<string, [string, string, [number, number]]> = { cover: ['cover-2', 'cover-3', [1280, 720]], art_wide: ['wide-2', 'wide-3', [1280, 720]], art_icon: ['icon', 'icon-2', [512, 512]] };
  ok('the art it replaces is what gamemog.com has (the retitle\'s cover and key art, 2026-11-18\'s icon); the new art is the same size, JPEG, new',
    Object.entries(NEW).every(([k, [was, now, [w, h]]]) => sha(art(was)) === JH_RETURN_ART[k] && jpeg(art(now)) && jpegSize(art(now)).join('x') === `${w}x${h}` && jpegSize(art(was)).join('x') === `${w}x${h}` && sha(art(now)) !== JH_RETURN_ART[k]));
  const NC = readFileSync('next.config.ts', 'utf8');
  ok('the old address redirects for good (next.config.ts: /g and /mog jensen-heist to jensen-return, 301)',
    NC.includes("{ source: '/:section(g|mog)/jensen-heist/:rest*', destination: '/:section/jensen-return/:rest*', statusCode: 301 }"));

  const dir = mkdtempSync(path.join(tmpdir(), 'jh-return-')), p = path.join(dir, 'gamemog.db');
  const sk = process.env.STORYKIT, log = console.log, err = console.error;
  const run = async (m: Migration, d: DatabaseSync) => { d.exec('BEGIN'); try { const n = String(await m.run(d, p)); d.exec('COMMIT'); return n; } catch (e) { d.exec('ROLLBACK'); return `threw: ${(e as Error).message}`; } };
  const same = (a: unknown, b: Buffer) => a != null && Buffer.from(a as Uint8Array).equals(b);
  try {
    writeFileSync(p, gunzipSync(readFileSync('deploy/seed.db.gz')));
    delete process.env.STORYKIT;
    console.log = () => {}; console.error = () => {};
    try { await migrate(p); } finally { console.log = log; console.error = err; }
    const db = new DatabaseSync(p);
    ok('with the Story Kit off it waits (unrecorded)', /^threw: waiting: the Story Kit is off/.test(await run(P, db)) && !db.prepare('SELECT 1 FROM migrations WHERE id = ?').get(ID));
    process.env.STORYKIT = 'on';
    ok('before the game is published it waits', /^threw: waiting: Jensen Heist is not in this database/.test(await run(P, db)));
    const pub = await run(PUB, db), tt = await run(TT, db);
    ok('2026-11-18-jensen-heist still publishes on a fresh disk (the Jensen Return record), and the retitle gives it the titled art', /^published \/g\/jensen-heist HIDDEN/.test(pub) && /new cover, art_wide/.test(tt), `${pub} | ${tt}`);
    const row = () => db.prepare("SELECT * FROM games WHERE json_extract(meta, '$.storykit.packId') = 'jensen-heist'").get() as any;
    { const g0 = row(), note = await run(P, db), g = row();
      ok('after them, on a fresh disk the address moves and the art is swapped (the title and world already the record\'s), still hidden',
        /moved to \/g\/jensen-return \(was \/g\/jensen-heist\)/.test(note) && /new cover, art_wide, art_icon/.test(note) && !/plays|titled/.test(note) && g.id === g0.id && g.slug === 'jensen-return'
          && g.title === 'Jensen Return' && JSON.parse(g.meta).title === 'Jensen Return' && g.hidden === 1 && same(g.cover, art('cover-3')) && same(g.art_wide, art('wide-3')) && same(g.art_icon, art('icon-2'))
          && same(g.art_avatar, art('sky')), note);
      const again = await run(P, db);
      ok('... run again it is already there', /^already there/.test(again), again); }

    // gamemog.com's state: day1's world sealed in the kept draft (with the same clips and every body), its pack and
    // module, "Jensen Heist" at /g/jensen-heist with the retitle's cover and key art and 2026-11-18's icon, the game
    // shown, a player's plays and a score. The old world is day1's own text (its hash JH_RETURN_FROM)
    const store = new StoryStore(path.join(dir, 'storykit'));
    const g0 = row(), m0 = JSON.parse(g0.meta), draftId = m0.storykit.pack;
    const setLive = () => {
      const bp = store.blobPath(JH_RETURN_FROM, 'json');
      mkdirSync(path.dirname(bp), { recursive: true }); writeFileSync(bp, oldText);
      store.db.prepare('INSERT OR IGNORE INTO blobs (hash, ext, bytes, at) VALUES (?, ?, ?, ?)').run(JH_RETURN_FROM, 'json', Buffer.byteLength(oldText), 1);
      store.db.prepare("UPDATE files SET hash = ?, bytes = ? WHERE draft_id = ? AND kind = 'pack' AND name = 'world.json'").run(JH_RETURN_FROM, Buffer.byteLength(oldText), draftId);
      store.db.prepare("DELETE FROM files WHERE draft_id = ? AND name LIKE 'was-%'").run(draftId);
      store.db.prepare('UPDATE drafts SET pack = ?, world = ? WHERE id = ?').run('{"was":1}', JH_RETURN_FROM, draftId);
      const meta = { ...m0, title: JH_TITLE.title, storykit: { ...m0.storykit, world: JH_RETURN_FROM } };
      db.prepare('UPDATE games SET slug = ?, title = ?, meta = ?, code = ?, cover = ?, art_wide = ?, art_icon = ?, hidden = 0 WHERE id = ?')
        .run('jensen-heist', JH_TITLE.title, JSON.stringify(meta), 'GameMog.world({ storykit: {"was":1} });\n', art('cover-2'), art('wide-2'), art('icon'), g0.id);
    };
    setLive();
    db.prepare('INSERT OR REPLACE INTO plays (game_id, player, runs, best, first_at, last_at) VALUES (?, ?, 3, 41000, 1, 2)').run(g0.id, 'p-return');
    db.prepare('INSERT INTO scores (game_id, player, time_ms, place, tempo_reached, locks, best_streak, created_at) VALUES (?, ?, 41000, 1, 0, 0, 0, 2)').run(g0.id, 'p-return');
    { const before = row(), note = await run(P, db), g = row(), m = JSON.parse(g.meta), d = store.db.prepare('SELECT * FROM drafts WHERE id = ?').get(draftId) as any;
      const was = store.db.prepare('SELECT hash FROM files WHERE draft_id = ? AND name = ?').get(draftId, `was-${JH_RETURN_FROM}.json`) as any;
      ok('on gamemog.com\'s state it plays the record\'s world in place, titled "Jensen Return" at /g/jensen-return: the same id, meta and module the record\'s',
        g.id === g0.id && g.slug === 'jensen-return' && g.title === 'Jensen Return' && m.title === 'Jensen Return' && m.storykit.world === R.world.hash && m.storykit.pack === draftId
          && g.code === `GameMog.world({ storykit: ${JSON.stringify(R.pack)} });\n` && note.includes(`plays ${R.world.hash.slice(0, 12)} (was ${JH_RETURN_FROM.slice(0, 12)}, kept)`)
          && note.includes('moved to /g/jensen-return (was /g/jensen-heist)') && note.includes('new cover, art_wide, art_icon'), note);
      ok('... sealed into the same kept store draft (its pack the record\'s), the old one kept as a was- row, both served',
        d.state === 'kept' && d.game_id === g.id && d.world === R.world.hash && d.pack === JSON.stringify(R.pack) && was?.hash === JH_RETURN_FROM
          && store.read(`${R.world.hash}.json`)?.hash === R.world.hash && store.read(`${JH_RETURN_FROM}.json`)?.hash === JH_RETURN_FROM);
      ok('... the new cover, key art and icon; its tagline, headshot and hidden as they were; the rest of its meta too',
        same(g.cover, art('cover-3')) && same(g.art_wide, art('wide-3')) && same(g.art_icon, art('icon-2')) && Buffer.from(g.art_avatar).equals(Buffer.from(before.art_avatar))
          && g.tagline === before.tagline && g.hidden === 0 && m.tagline === m0.tagline && m.blurb === m0.blurb && JSON.stringify(m.cast) === JSON.stringify(m0.cast)
          && m.storykit.credit === m0.storykit.credit && m.storykit.packId === 'jensen-heist' && m.storykit.showcase === true);
      const plays = db.prepare('SELECT runs FROM plays WHERE game_id = ? AND player = ?').get(g.id, 'p-return') as any, sc = db.prepare('SELECT COUNT(*) n FROM scores WHERE game_id = ? AND player = ?').get(g.id, 'p-return') as any;
      ok('... its plays and scores kept (they follow the game\'s id, not its address)', plays?.runs === 3 && sc.n === 1);
      const clips = store.db.prepare("SELECT COUNT(*) n FROM files WHERE draft_id = ? AND kind = 'voice'").get(draftId) as any;
      ok('... every clip as it was (678)', clips.n === 678, String(clips.n));
      const again = await run(P, db);
      ok('... run again it is already there', /^already there: \/g\/jensen-return/.test(again), again); }

    { setLive();
      const other = db.prepare("SELECT id FROM games WHERE id != ? LIMIT 1").get(g0.id) as any, oslug = (db.prepare('SELECT slug FROM games WHERE id = ?').get(other.id) as any).slug;
      db.prepare("UPDATE games SET slug = 'jensen-return' WHERE id = ?").run(other.id);
      const note = await run(P, db), g = row();
      ok('another game at /g/jensen-return keeps it: Jensen Return is retitled where it is', /left alone: its address \/g\/jensen-heist/.test(note) && g.slug === 'jensen-heist' && g.title === 'Jensen Return', note);
      db.prepare('UPDATE games SET slug = ? WHERE id = ?').run(oslug, other.id); }

    { setLive();
      const g = row(), m = JSON.parse(g.meta), other = 'f'.repeat(64);
      db.prepare('UPDATE games SET meta = ? WHERE id = ?').run(JSON.stringify({ ...m, storykit: { ...m.storykit, world: other } }), g.id);
      const note = await run(P, db), h = row();
      ok('a game playing some other world (patched since) is left alone', /^left alone/.test(note) && JSON.parse(h.meta).storykit.world === other && h.slug === 'jensen-heist' && h.title === JH_TITLE.title, note); }

    db.close(); store.db.close();

    // the whole boot on a fresh disk with the Story Kit on: all seven recorded, the game at /g/jensen-return, hidden
    const p2 = path.join(dir, 'fresh.db');
    writeFileSync(p2, gunzipSync(readFileSync('deploy/seed.db.gz')));
    console.log = () => {}; console.error = () => {};
    try { await migrate(p2); } finally { console.log = log; console.error = err; }
    const d2 = new DatabaseSync(p2), notes = d2.prepare('SELECT id, note FROM migrations WHERE id IN (?, ?, ?, ?, ?, ?, ?)').all(PUB_ID, TITLE_ID, P1_ID, P2_ID, P3_ID, D1_ID, ID) as any[];
    const g2 = d2.prepare("SELECT slug, title, hidden, meta, cover, art_icon FROM games WHERE json_extract(meta, '$.storykit.packId') = 'jensen-heist'").get() as any;
    ok('a fresh boot with the Story Kit on records all seven and ends with Jensen Return at /g/jensen-return, its art, hidden',
      notes.length === 7 && g2?.slug === 'jensen-return' && g2.title === 'Jensen Return' && g2.hidden === 1 && JSON.parse(g2.meta).storykit.world === R.world.hash
        && same(g2.cover, art('cover-3')) && same(g2.art_icon, art('icon-2')), notes.map((n) => `${n.id}: ${n.note}`).join(' | '));
    d2.close();
  } finally {
    console.log = log; console.error = err;
    if (sk === undefined) delete process.env.STORYKIT; else process.env.STORYKIT = sk;
    rmSync(dir, { recursive: true, force: true });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let failed = 0;
  await runJensenReturnChecks((name, cond, detail) => { console.log(`${cond ? '  ok  ' : '  FAIL'} ${name}${!cond && detail ? `: ${detail}` : ''}`); if (!cond) failed++; });
  process.exit(failed ? 1 : 0);
}
