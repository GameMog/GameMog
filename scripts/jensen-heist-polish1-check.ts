/**
 * Jensen Heist's first polish batch (deploy/migrate.mjs 2026-11-21-jensen-heist-polish1; POLISH-LIST A2, A3, A5, B3, B4).
 * Part of `npm run check`. The record's world differs from the retitle's (JH_POLISH1_FROM, what gamemog.com plays) in
 * its steps and two re-forged bodies (JH_POLISH1_BODIES): the same spoken lines, speakers and clips. On a fresh copy of deploy/seed.db.gz in a
 * temporary folder (its Story Kit store beside it): it waits while the Story Kit is off and while the game is not
 * there; after 2026-11-18-jensen-heist on a fresh disk (which already seals the record) it is "already there"; on the
 * state gamemog.com has (the retitle's world sealed in the kept draft, its pack and module, the game shown) it seals
 * the new world and the two new bodies into the kept store draft in place (the old ones kept, still served) and leaves the title, the words,
 * the art and hidden as they are; run again it is "already there"; a game playing some other world is left alone.
 * Nothing touches data/.
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
const PUB_ID = '2026-11-18-jensen-heist', TITLE_ID = '2026-11-21-jensen-heist-title', ID = '2026-11-21-jensen-heist-polish1';
const sha = (b: string | Uint8Array) => createHash('sha256').update(b).digest('hex');

export async function runJensenPolish1Checks(ok: Ok) {
  console.log('\nJensen Heist polish batch 1 (deploy/migrate.mjs ' + ID + ')');
  const { migrate, MIGRATIONS, JH_POLISH1_FROM, JH_LATER, JH_POLISH1_BODIES } = await import('../deploy/migrate.mjs') as {
    migrate: (p: string) => Promise<void> | void; MIGRATIONS: Migration[]; JH_POLISH1_FROM: string; JH_LATER: string[]; JH_POLISH1_BODIES: Record<string, { from: string; to: string }> };
  const iPub = MIGRATIONS.findIndex((m) => m.id === PUB_ID), iT = MIGRATIONS.findIndex((m) => m.id === TITLE_ID), iP = MIGRATIONS.findIndex((m) => m.id === ID);
  ok('the polish batch is one migration of its own, async, after the retitle', iPub >= 0 && iT > iPub && iP > iT && !!MIGRATIONS[iP].async, `${iPub} ${iT} ${iP}`);
  if (iPub < 0 || iT < 0 || iP < 0) return;
  const PUB = MIGRATIONS[iPub], P = MIGRATIONS[iP];
  const R = JSON.parse(readFileSync('deploy/migrations/jensen-heist-story.json', 'utf8'));
  const worldText = readFileSync('deploy/migrations/jensen-heist/world.json', 'utf8'), W = JSON.parse(worldText);
  ok('the record\'s world is one the retitle leaves to a later migration (JH_LATER)', JH_LATER.includes(R.world.hash) && R.world.hash !== JH_POLISH1_FROM, R.world.hash.slice(0, 12));
  const tp6 = JSON.stringify(R.pack).includes('"behind":55,"loseTime":25') && JSON.stringify(R.pack).includes('"count":4');
  ok('... it carries the batch: TP-6\'s board meeting on the plaza lawn, its chase four cars and 55 m back, ST-8\'s three texts',
    /"rose-lawn":\{"@":"park16"/.test(JSON.stringify(R.pack.places)) && tp6 && (JSON.stringify(R.pack).match(/"type":"dm","at":(45|75|105),/g) || []).length === 3 && W.id === 'jensen-heist');

  const BODY = Object.entries(JH_POLISH1_BODIES);
  ok('... and the two re-forged bodies it names (A2 Director Grey, A3 Intern Two), each new and in this build',
    BODY.length === 2 && BODY.every(([n, b]) => { const f = R.files.find((x: any) => x.kind === 'glb' && x.name === n); return !!f && f.hash === b.to && b.from !== b.to && sha(readFileSync(f.src)) === b.to; }));

  const dir = mkdtempSync(path.join(tmpdir(), 'jh-polish1-')), p = path.join(dir, 'gamemog.db');
  const sk = process.env.STORYKIT, log = console.log, err = console.error;
  const run = async (m: Migration, d: DatabaseSync) => { d.exec('BEGIN'); try { const n = String(await m.run(d, p)); d.exec('COMMIT'); return n; } catch (e) { d.exec('ROLLBACK'); return `threw: ${(e as Error).message}`; } };
  try {
    writeFileSync(p, gunzipSync(readFileSync('deploy/seed.db.gz')));
    delete process.env.STORYKIT;
    console.log = () => {}; console.error = () => {};
    try { await migrate(p); } finally { console.log = log; console.error = err; }
    const db = new DatabaseSync(p);
    ok('with the Story Kit off it waits (unrecorded)', /^threw: waiting: the Story Kit is off/.test(await run(P, db)) && !db.prepare('SELECT 1 FROM migrations WHERE id = ?').get(ID));
    process.env.STORYKIT = 'on';
    ok('before the game is published it waits', /^threw: waiting: Jensen Heist is not in this database/.test(await run(P, db)));
    const pub = await run(PUB, db);
    ok('2026-11-18-jensen-heist still publishes on a fresh disk (the polished record)', /^published \/g\/jensen-heist HIDDEN/.test(pub), pub);
    const row = () => db.prepare("SELECT * FROM games WHERE slug = 'jensen-heist'").get() as any;
    { const note = await run(P, db);
      ok('after it, on a fresh disk it is already there (2026-11-18 sealed the record\'s world)', /^already there/.test(note), note); }

    // gamemog.com's state: the retitle's world sealed in the kept draft (with the same bodies and clips), its pack and
    // module, the game shown. The old world is the record's world as the retitle sealed it: a stand-in with its hash
    const store = new StoryStore(path.join(dir, 'storykit'));
    const g0 = row(), m0 = JSON.parse(g0.meta), draftId = m0.storykit.pack;
    let oldText = worldText.replace('"rose-lawn"', '"rose-lawn-was"');
    for (const [, b] of BODY) oldText = oldText.split(b.to).join(b.from);
    const setLive = () => {
      // (the bodies 2026-11-18 stored: stand-in bytes at their addresses, the draft's rows naming them)
      for (const [n, b] of BODY) {
        const bp = store.blobPath(b.from, 'glb'); mkdirSync(path.dirname(bp), { recursive: true }); writeFileSync(bp, 'glTF-was-' + n);
        store.db.prepare('INSERT OR IGNORE INTO blobs (hash, ext, bytes, at) VALUES (?, ?, ?, ?)').run(b.from, 'glb', 9 + n.length, 1);
        store.db.prepare("UPDATE files SET hash = ?, bytes = ? WHERE draft_id = ? AND kind = 'glb' AND name = ?").run(b.from, 9 + n.length, draftId, n);
      }
      const bp = store.blobPath(JH_POLISH1_FROM, 'json');
      mkdirSync(path.dirname(bp), { recursive: true }); writeFileSync(bp, oldText);
      store.db.prepare('INSERT OR IGNORE INTO blobs (hash, ext, bytes, at) VALUES (?, ?, ?, ?)').run(JH_POLISH1_FROM, 'json', Buffer.byteLength(oldText), 1);
      store.db.prepare("UPDATE files SET hash = ?, bytes = ? WHERE draft_id = ? AND kind = 'pack' AND name = 'world.json'").run(JH_POLISH1_FROM, Buffer.byteLength(oldText), draftId);
      store.db.prepare("DELETE FROM files WHERE draft_id = ? AND name LIKE 'was-%'").run(draftId);
      store.db.prepare('UPDATE drafts SET pack = ?, world = ? WHERE id = ?').run('{"was":1}', JH_POLISH1_FROM, draftId);
      const meta = { ...m0, storykit: { ...m0.storykit, world: JH_POLISH1_FROM } };
      db.prepare('UPDATE games SET meta = ?, code = ?, hidden = 0 WHERE id = ?').run(JSON.stringify(meta), 'GameMog.world({ storykit: {"was":1} });\n', g0.id);
    };
    setLive();
    { const before = row(), note = await run(P, db), g = row(), m = JSON.parse(g.meta), d = store.db.prepare('SELECT * FROM drafts WHERE id = ?').get(draftId) as any;
      const was = store.db.prepare('SELECT hash FROM files WHERE draft_id = ? AND name = ?').get(draftId, `was-${JH_POLISH1_FROM}.json`) as any;
      ok('on gamemog.com\'s state it plays the record\'s world in place: same id and slug, meta and module the record\'s',
        g.id === g0.id && g.slug === 'jensen-heist' && m.storykit.world === R.world.hash && m.storykit.pack === draftId
          && g.code === `GameMog.world({ storykit: ${JSON.stringify(R.pack)} });\n` && note.includes(`plays ${R.world.hash.slice(0, 12)} (was ${JH_POLISH1_FROM.slice(0, 12)}, kept)`), note);
      ok('... sealed into the same kept store draft (its pack the record\'s), the old one kept as a was- row, both served',
        d.state === 'kept' && d.game_id === g.id && d.world === R.world.hash && d.pack === JSON.stringify(R.pack) && was?.hash === JH_POLISH1_FROM
          && store.read(`${R.world.hash}.json`)?.hash === R.world.hash && store.read(`${JH_POLISH1_FROM}.json`)?.hash === JH_POLISH1_FROM);
      ok('... its title, tagline, art and hidden as they were; the rest of its meta too',
        g.title === before.title && g.tagline === before.tagline && Buffer.from(g.cover).equals(Buffer.from(before.cover)) && Buffer.from(g.art_wide).equals(Buffer.from(before.art_wide)) && g.hidden === 0
          && m.title === m0.title && m.blurb === m0.blurb && JSON.stringify(m.cast) === JSON.stringify(m0.cast) && m.storykit.credit === m0.storykit.credit && m.storykit.packId === 'jensen-heist' && m.storykit.showcase === true);
      const bodyRow = (n: string) => store.db.prepare("SELECT hash FROM files WHERE draft_id = ? AND kind = 'glb' AND name = ?").get(draftId, n) as any;
      const wasRow = (h: string) => store.db.prepare("SELECT hash FROM files WHERE draft_id = ? AND kind = 'pack' AND name = ?").get(draftId, `was-${h}.glb`) as any;
      ok('... the two re-forged bodies are the draft\'s now, the old ones kept as was- rows; both served',
        BODY.every(([n, b]) => bodyRow(n)?.hash === b.to && wasRow(b.from)?.hash === b.from && store.read(`${b.to}.glb`)?.hash === b.to && !!store.read(`${b.from}.glb`)) && /new bodies director-a, intern-b/.test(note), note);
      const clips = store.db.prepare("SELECT COUNT(*) n FROM files WHERE draft_id = ? AND kind = 'voice'").get(draftId) as any;
      ok('... every clip as it was (678)', clips.n === 678, String(clips.n));
      const again = await run(P, db);
      ok('... run again it is already there', /^already there/.test(again), again); }

    { setLive();
      const g = row(), m = JSON.parse(g.meta), other = 'f'.repeat(64);
      db.prepare('UPDATE games SET meta = ? WHERE id = ?').run(JSON.stringify({ ...m, storykit: { ...m.storykit, world: other } }), g.id);
      const note = await run(P, db), h = row();
      ok('a game playing some other world (patched since) is left alone', /^left alone/.test(note) && JSON.parse(h.meta).storykit.world === other, note); }

    { setLive();
      const [n, b] = BODY[0], other = 'e'.repeat(64);
      store.db.prepare("UPDATE files SET hash = ? WHERE draft_id = ? AND kind = 'glb' AND name = ?").run(other, draftId, n);
      const note = await run(P, db), g = row();
      ok('a draft whose body was re-forged since is left alone (nothing written)', /^left alone: the store draft's/.test(note) && JSON.parse(g.meta).storykit.world === JH_POLISH1_FROM
        && (store.db.prepare("SELECT hash FROM files WHERE draft_id = ? AND kind = 'glb' AND name = ?").get(draftId, n) as any).hash === other && b.from !== other, note); }
    db.close(); store.db.close();

    // the whole boot on a fresh disk with the Story Kit on: all three recorded, the game the record's world, hidden
    const p2 = path.join(dir, 'fresh.db');
    writeFileSync(p2, gunzipSync(readFileSync('deploy/seed.db.gz')));
    console.log = () => {}; console.error = () => {};
    try { await migrate(p2); } finally { console.log = log; console.error = err; }
    const d2 = new DatabaseSync(p2), notes = d2.prepare('SELECT id, note FROM migrations WHERE id IN (?, ?, ?)').all(PUB_ID, TITLE_ID, ID) as any[], g2 = d2.prepare("SELECT title, hidden, meta FROM games WHERE json_extract(meta, '$.storykit.packId') = 'jensen-heist'").get() as any;
    ok('a fresh boot with the Story Kit on records all three and ends with the polished world, hidden',
      notes.length === 3 && g2?.title === R.meta.title && g2.hidden === 1 && JSON.parse(g2.meta).storykit.world === R.world.hash, notes.map((n) => `${n.id}: ${n.note}`).join(' | '));
    d2.close();
  } finally {
    console.log = log; console.error = err;
    if (sk === undefined) delete process.env.STORYKIT; else process.env.STORYKIT = sk;
    rmSync(dir, { recursive: true, force: true });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let failed = 0;
  await runJensenPolish1Checks((name, cond, detail) => { console.log(`${cond ? '  ok  ' : '  FAIL'} ${name}${!cond && detail ? `: ${detail}` : ''}`); if (!cond) failed++; });
  process.exit(failed ? 1 : 0);
}
