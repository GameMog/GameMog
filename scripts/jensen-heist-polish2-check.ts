/**
 * Jensen Heist's second polish batch (deploy/migrate.mjs 2026-11-21-jensen-heist-polish2; POLISH-LIST A1).
 * Part of `npm run check`. The record's world differs from polish1's (JH_POLISH2_FROM, what gamemog.com plays) only in
 * Mr. Board's re-forged body (JH_POLISH2_BODIES): the same steps, spoken lines, speakers and clips. On a fresh copy of
 * deploy/seed.db.gz in a temporary folder (its Story Kit store beside it): it waits while the Story Kit is off and while
 * the game is not there; after 2026-11-18-jensen-heist on a fresh disk (which already seals the record) it is "already
 * there"; on the state gamemog.com has (polish1's world sealed in the kept draft, its pack and module, the game shown)
 * it seals the new world and the new body into the kept store draft in place (the old ones kept, still served) and
 * leaves the title, the words, the art and hidden as they are; run again it is "already there"; a game playing some
 * other world is left alone. Nothing touches data/.
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
const PUB_ID = '2026-11-18-jensen-heist', TITLE_ID = '2026-11-21-jensen-heist-title', P1_ID = '2026-11-21-jensen-heist-polish1', ID = '2026-11-21-jensen-heist-polish2';
const sha = (b: string | Uint8Array) => createHash('sha256').update(b).digest('hex');

export async function runJensenPolish2Checks(ok: Ok) {
  console.log('\nJensen Heist polish batch 2 (deploy/migrate.mjs ' + ID + ')');
  const { migrate, MIGRATIONS, JH_POLISH2_FROM, JH_POLISH3_FROM, JH_LATER, JH_POLISH2_BODIES } = await import('../deploy/migrate.mjs') as {
    migrate: (p: string) => Promise<void> | void; MIGRATIONS: Migration[]; JH_POLISH2_FROM: string; JH_POLISH3_FROM: string; JH_LATER: string[]; JH_POLISH2_BODIES: Record<string, { from: string; to: string }> };
  const iPub = MIGRATIONS.findIndex((m) => m.id === PUB_ID), iT = MIGRATIONS.findIndex((m) => m.id === TITLE_ID), i1 = MIGRATIONS.findIndex((m) => m.id === P1_ID), iP = MIGRATIONS.findIndex((m) => m.id === ID);
  ok('the second polish batch is one migration of its own, async, after the retitle and polish1', iPub >= 0 && iT > iPub && i1 > iT && iP > i1 && !!MIGRATIONS[iP].async, `${iPub} ${iT} ${i1} ${iP}`);
  if (iPub < 0 || iT < 0 || i1 < 0 || iP < 0) return;
  const PUB = MIGRATIONS[iPub], P = MIGRATIONS[iP];
  const R = JSON.parse(readFileSync('deploy/migrations/jensen-heist-story.json', 'utf8'));
  const worldText = readFileSync('deploy/migrations/jensen-heist/world.json', 'utf8'), W = JSON.parse(worldText);
  ok('the record\'s world is one the retitle leaves to a later migration (JH_LATER)', JH_LATER.includes(R.world.hash) && JH_LATER.includes(JH_POLISH2_FROM) && R.world.hash !== JH_POLISH2_FROM, R.world.hash.slice(0, 12));
  // (a later batch's record (polish3: gamemog.com has polish2 recorded, and plays what it sealed, JH_POLISH3_FROM): what
  // it is built from is that batch's check, scripts/jensen-heist-polish3-check.ts, which runs the same states)
  if (R.world.hash !== JH_POLISH3_FROM) {
    ok('... a later batch\'s record (polish3 replaces what polish2 sealed): its own check runs the states', JH_LATER.indexOf(R.world.hash) > JH_LATER.indexOf(JH_POLISH3_FROM) && MIGRATIONS.some((m) => m.id === '2026-11-21-jensen-heist-polish3'), R.world.hash.slice(0, 12));
    return;
  }
  const BODY = Object.entries(JH_POLISH2_BODIES);
  // (polish1's world exactly: the record's world with the old body's address put back, byte for byte)
  let oldText = worldText;
  for (const [, b] of BODY) oldText = oldText.split(b.to).join(b.from);
  ok('... it is polish1\'s world with only Mr. Board\'s body swapped (the old address put back gives JH_POLISH2_FROM)', sha(oldText) === JH_POLISH2_FROM && oldText !== worldText && W.id === 'jensen-heist');
  ok('... and the re-forged body it names (A1 Mr. Board), new and in this build',
    BODY.length === 1 && BODY[0][0] === 'board' && BODY.every(([n, b]) => { const f = R.files.find((x: any) => x.kind === 'glb' && x.name === n); return !!f && f.hash === b.to && b.from !== b.to && sha(readFileSync(f.src)) === b.to; }));

  const dir = mkdtempSync(path.join(tmpdir(), 'jh-polish2-')), p = path.join(dir, 'gamemog.db');
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

    // gamemog.com's state: polish1's world sealed in the kept draft (with the same clips and every other body), its
    // pack and module, the game shown. The old world is polish1's own text (its hash JH_POLISH2_FROM)
    const store = new StoryStore(path.join(dir, 'storykit'));
    const g0 = row(), m0 = JSON.parse(g0.meta), draftId = m0.storykit.pack;
    const setLive = () => {
      // (the bodies 2026-11-18 stored: stand-in bytes at their addresses, the draft's rows naming them)
      for (const [n, b] of BODY) {
        const bp = store.blobPath(b.from, 'glb'); mkdirSync(path.dirname(bp), { recursive: true }); writeFileSync(bp, 'glTF-was-' + n);
        store.db.prepare('INSERT OR IGNORE INTO blobs (hash, ext, bytes, at) VALUES (?, ?, ?, ?)').run(b.from, 'glb', 9 + n.length, 1);
        store.db.prepare("UPDATE files SET hash = ?, bytes = ? WHERE draft_id = ? AND kind = 'glb' AND name = ?").run(b.from, 9 + n.length, draftId, n);
      }
      const bp = store.blobPath(JH_POLISH2_FROM, 'json');
      mkdirSync(path.dirname(bp), { recursive: true }); writeFileSync(bp, oldText);
      store.db.prepare('INSERT OR IGNORE INTO blobs (hash, ext, bytes, at) VALUES (?, ?, ?, ?)').run(JH_POLISH2_FROM, 'json', Buffer.byteLength(oldText), 1);
      store.db.prepare("UPDATE files SET hash = ?, bytes = ? WHERE draft_id = ? AND kind = 'pack' AND name = 'world.json'").run(JH_POLISH2_FROM, Buffer.byteLength(oldText), draftId);
      store.db.prepare("DELETE FROM files WHERE draft_id = ? AND name LIKE 'was-%'").run(draftId);
      store.db.prepare('UPDATE drafts SET pack = ?, world = ? WHERE id = ?').run('{"was":1}', JH_POLISH2_FROM, draftId);
      const meta = { ...m0, storykit: { ...m0.storykit, world: JH_POLISH2_FROM } };
      db.prepare('UPDATE games SET meta = ?, code = ?, hidden = 0 WHERE id = ?').run(JSON.stringify(meta), 'GameMog.world({ storykit: {"was":1} });\n', g0.id);
    };
    setLive();
    { const before = row(), note = await run(P, db), g = row(), m = JSON.parse(g.meta), d = store.db.prepare('SELECT * FROM drafts WHERE id = ?').get(draftId) as any;
      const was = store.db.prepare('SELECT hash FROM files WHERE draft_id = ? AND name = ?').get(draftId, `was-${JH_POLISH2_FROM}.json`) as any;
      ok('on gamemog.com\'s state it plays the record\'s world in place: same id and slug, meta and module the record\'s',
        g.id === g0.id && g.slug === 'jensen-heist' && m.storykit.world === R.world.hash && m.storykit.pack === draftId
          && g.code === `GameMog.world({ storykit: ${JSON.stringify(R.pack)} });\n` && note.includes(`plays ${R.world.hash.slice(0, 12)} (was ${JH_POLISH2_FROM.slice(0, 12)}, kept)`), note);
      ok('... sealed into the same kept store draft (its pack the record\'s), the old one kept as a was- row, both served',
        d.state === 'kept' && d.game_id === g.id && d.world === R.world.hash && d.pack === JSON.stringify(R.pack) && was?.hash === JH_POLISH2_FROM
          && store.read(`${R.world.hash}.json`)?.hash === R.world.hash && store.read(`${JH_POLISH2_FROM}.json`)?.hash === JH_POLISH2_FROM);
      ok('... its title, tagline, art and hidden as they were; the rest of its meta too',
        g.title === before.title && g.tagline === before.tagline && Buffer.from(g.cover).equals(Buffer.from(before.cover)) && Buffer.from(g.art_wide).equals(Buffer.from(before.art_wide)) && g.hidden === 0
          && m.title === m0.title && m.blurb === m0.blurb && JSON.stringify(m.cast) === JSON.stringify(m0.cast) && m.storykit.credit === m0.storykit.credit && m.storykit.packId === 'jensen-heist' && m.storykit.showcase === true);
      const bodyRow = (n: string) => store.db.prepare("SELECT hash FROM files WHERE draft_id = ? AND kind = 'glb' AND name = ?").get(draftId, n) as any;
      const wasRow = (h: string) => store.db.prepare("SELECT hash FROM files WHERE draft_id = ? AND kind = 'pack' AND name = ?").get(draftId, `was-${h}.glb`) as any;
      ok('... the re-forged body is the draft\'s now, the old ones kept as was- rows; both served',
        BODY.every(([n, b]) => bodyRow(n)?.hash === b.to && wasRow(b.from)?.hash === b.from && store.read(`${b.to}.glb`)?.hash === b.to && !!store.read(`${b.from}.glb`)) && /new bodies board \(/.test(note), note);
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
      ok('a draft whose body was re-forged since is left alone (nothing written)', /^left alone: the store draft's/.test(note) && JSON.parse(g.meta).storykit.world === JH_POLISH2_FROM
        && (store.db.prepare("SELECT hash FROM files WHERE draft_id = ? AND kind = 'glb' AND name = ?").get(draftId, n) as any).hash === other && b.from !== other, note); }
    db.close(); store.db.close();

    // the whole boot on a fresh disk with the Story Kit on: all four recorded, the game the record's world, hidden
    const p2 = path.join(dir, 'fresh.db');
    writeFileSync(p2, gunzipSync(readFileSync('deploy/seed.db.gz')));
    console.log = () => {}; console.error = () => {};
    try { await migrate(p2); } finally { console.log = log; console.error = err; }
    const d2 = new DatabaseSync(p2), notes = d2.prepare('SELECT id, note FROM migrations WHERE id IN (?, ?, ?, ?)').all(PUB_ID, TITLE_ID, P1_ID, ID) as any[], g2 = d2.prepare("SELECT title, hidden, meta FROM games WHERE slug = 'jensen-heist'").get() as any;
    ok('a fresh boot with the Story Kit on records all four and ends with the polished world, hidden',
      notes.length === 4 && g2?.title === 'Jensen Heist' && g2.hidden === 1 && JSON.parse(g2.meta).storykit.world === R.world.hash, notes.map((n) => `${n.id}: ${n.note}`).join(' | '));
    d2.close();
  } finally {
    console.log = log; console.error = err;
    if (sk === undefined) delete process.env.STORYKIT; else process.env.STORYKIT = sk;
    rmSync(dir, { recursive: true, force: true });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let failed = 0;
  await runJensenPolish2Checks((name, cond, detail) => { console.log(`${cond ? '  ok  ' : '  FAIL'} ${name}${!cond && detail ? `: ${detail}` : ''}`); if (!cond) failed++; });
  process.exit(failed ? 1 : 0);
}
