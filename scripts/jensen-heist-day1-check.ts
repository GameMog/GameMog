/**
 * Jensen Heist's day A (deploy/migrate.mjs 2026-11-22-jensen-heist-day1; the day audit's quick wins, the pack's part).
 * Part of `npm run check`. The record's world differs from polish3's (JH_DAY1_FROM, what gamemog.com plays) only in the
 * batch: SS-5's Board call kept past the chase (persist) and Wesley's call waiting a step of its own after it (six waits
 * for the phone, not four), BT-3's chase opening behind him (count, behind), DL-4's ride to the arena's front (its six
 * lines spread over it), FL-7's
 * convoy to the fan line at its own speed, the stage's side screens showing its sign and the calm driving HUD. Taken
 * out (jhDay1Back), it is JH_DAY1_FROM byte for byte: the same spoken lines, speakers and clips, no body changed. On a
 * fresh copy of deploy/seed.db.gz in a temporary folder (its Story Kit store beside it): it waits while the Story Kit is
 * off and while the game is not there; after 2026-11-18-jensen-heist on a fresh disk it is "already there"; on the state
 * gamemog.com has (polish3's world sealed in the kept draft, its pack and module, the game shown) it seals the new world
 * into the kept store draft in place (the old one kept, still served) and leaves the title, the words, the art and
 * hidden as they are; run again it is "already there"; a game playing some other world is left alone. Nothing touches data/.
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
const PUB_ID = '2026-11-18-jensen-heist', TITLE_ID = '2026-11-21-jensen-heist-title', P1_ID = '2026-11-21-jensen-heist-polish1', P2_ID = '2026-11-21-jensen-heist-polish2', P3_ID = '2026-11-21-jensen-heist-polish3', ID = '2026-11-22-jensen-heist-day1';
const sha = (b: string | Uint8Array) => createHash('sha256').update(b).digest('hex');

/** The record's world with day A taken out (its text): polish3's world, byte for byte. */
export function jhDay1Back(worldText: string) {
  const W = JSON.parse(worldText);
  delete W.hud.calm;
  const walk = (o: any): void => { if (Array.isArray(o)) { o.forEach(walk); return; } if (o && typeof o === 'object') { if (o.screens === 'sign' && typeof o.room === 'string') delete o.screens; Object.values(o).forEach(walk); } };
  walk(W);
  const M = (id: string) => W.missions.find((m: any) => m.id === id);
  const bt = M('BT-3').steps.find((s: any) => s.type === 'pursuit'); delete bt.count; delete bt.behind;
  const dl = M('DL-4').steps.find((s: any) => s.type === 'passenger'); dl.to = '@arena-line'; dl.objective = 'Drive Wesley back to the fan line, under 45.';
  [4, 14, 25, 36, 48, 60].forEach((at, k) => { dl.during[k].at = at; });
  const fl = M('FL-7').steps.find((s: any) => s.type === 'convoy'); fl.route[fl.route.length - 1] = '@arena-approach'; delete fl.speed;
  // (SS-5: Wesley's call back in the chase's during, 20 s in, after the Board's (not kept past it), and four waits)
  const ss = M('SS-5'), i = ss.steps.findIndex((s: any) => s.type === 'pursuit'), p = ss.steps[i], bd = p.during[0]; delete bd.persist;
  const w3: any = {}; for (const [k, v] of Object.entries(ss.steps[i + 1])) { w3[k] = v; if (k === 'inCar') w3.at = 20; }
  p.during = [bd, w3]; const wt = ss.steps[i + 2]; ss.steps = [...ss.steps.slice(0, i + 1), wt, wt, wt, wt];
  // (its lines' ids as they were: a side step's of the chase, not a step's of their own; the same clips)
  return JSON.stringify(W).split('"SS-5.s8.').join('"SS-5.s7.d1.');
}

export async function runJensenDay1Checks(ok: Ok) {
  console.log('\nJensen Heist day A (deploy/migrate.mjs ' + ID + ')');
  const { migrate, MIGRATIONS, JH_DAY1_FROM, JH_LATER } = await import('../deploy/migrate.mjs') as {
    migrate: (p: string) => Promise<void> | void; MIGRATIONS: Migration[]; JH_DAY1_FROM: string; JH_LATER: string[] };
  const ids = [PUB_ID, TITLE_ID, P1_ID, P2_ID, P3_ID, ID].map((id) => MIGRATIONS.findIndex((m) => m.id === id)), iP = ids[5];
  ok('day A is one migration of its own, async, after the retitle and the three polish batches', ids.every((n, k) => n >= 0 && (k === 0 || n > ids[k - 1])) && iP === MIGRATIONS.length - 1 && !!MIGRATIONS[iP].async, ids.join(' '));
  if (ids.some((n) => n < 0)) return;
  const PUB = MIGRATIONS[ids[0]], P = MIGRATIONS[iP];
  const R = JSON.parse(readFileSync('deploy/migrations/jensen-heist-story.json', 'utf8'));
  const worldText = readFileSync('deploy/migrations/jensen-heist/world.json', 'utf8'), W = JSON.parse(worldText);
  ok('the record\'s world is one the retitle leaves to a later migration (JH_LATER), after polish3\'s', JH_LATER.includes(R.world.hash) && JH_LATER.indexOf(R.world.hash) > JH_LATER.indexOf(JH_DAY1_FROM) && JH_LATER.includes(JH_DAY1_FROM), R.world.hash.slice(0, 12));
  const M = (id: string) => W.missions.find((m: any) => m.id === id), ss = M('SS-5').steps, iC = ss.findIndex((s: any) => s.type === 'pursuit');
  ok('... it carries the batch: SS-5\'s Board call kept past the chase, Wesley\'s call waiting a step of its own, then the waits for the phone',
    ss[iC].during.length === 1 && ss[iC].during[0].who === 'Mr. Board' && ss[iC].during[0].persist === true && ss[iC + 1].type === 'call' && ss[iC + 1].interrupts === true && ss[iC + 1].at === undefined
      && ss.slice(iC + 2).length === 6 && ss.slice(iC + 2).every((s: any) => s.type === 'wait' && s.call === true), JSON.stringify(ss.slice(iC).map((s: any) => s.type)));
  const bt = M('BT-3').steps.find((s: any) => s.type === 'pursuit'), dl = M('DL-4').steps.find((s: any) => s.type === 'passenger'), fl = M('FL-7').steps.find((s: any) => s.type === 'convoy');
  let screens = 0; JSON.stringify(W, (k, v) => { if (k === 'screens' && v === 'sign') screens++; return v; });
  ok('... BT-3\'s chase from behind, DL-4\'s ride to the arena, FL-7\'s convoy to the fan line, the signs on the stage\'s screens, the calm HUD',
    bt.goal === 'lose' && bt.behind >= 40 && bt.count === 3 && dl.to === '@arena' && fl.route.at(-1) === '@arena-line' && fl.speed > 11 && screens >= 1 && W.hud?.calm === true && JSON.stringify(R.pack.hud) === JSON.stringify(W.hud));
  const oldText = jhDay1Back(worldText);
  ok('... it is polish3\'s world with only the batch added (taken out, it is JH_DAY1_FROM, byte for byte: every line, speaker and clip as it was)', sha(oldText) === JH_DAY1_FROM && oldText !== worldText && W.id === 'jensen-heist');
  ok('... no body changed (every file the record names is polish3\'s)', R.files.filter((f: any) => f.kind === 'glb').every((f: any) => oldText.includes(f.hash) && sha(readFileSync(f.src)) === f.hash));

  const dir = mkdtempSync(path.join(tmpdir(), 'jh-day1-')), p = path.join(dir, 'gamemog.db');
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
    ok('2026-11-18-jensen-heist still publishes on a fresh disk (the day-1 record)', /^published \/g\/jensen-heist HIDDEN/.test(pub), pub);
    const row = () => db.prepare("SELECT * FROM games WHERE slug = 'jensen-heist'").get() as any;
    { const note = await run(P, db);
      ok('after it, on a fresh disk it is already there (2026-11-18 sealed the record\'s world)', /^already there/.test(note), note); }

    // gamemog.com's state: polish3's world sealed in the kept draft (with the same clips and every body), its
    // pack and module, the game shown. The old world is polish3's own text (its hash JH_DAY1_FROM)
    const store = new StoryStore(path.join(dir, 'storykit'));
    const g0 = row(), m0 = JSON.parse(g0.meta), draftId = m0.storykit.pack;
    const setLive = () => {
      const bp = store.blobPath(JH_DAY1_FROM, 'json');
      mkdirSync(path.dirname(bp), { recursive: true }); writeFileSync(bp, oldText);
      store.db.prepare('INSERT OR IGNORE INTO blobs (hash, ext, bytes, at) VALUES (?, ?, ?, ?)').run(JH_DAY1_FROM, 'json', Buffer.byteLength(oldText), 1);
      store.db.prepare("UPDATE files SET hash = ?, bytes = ? WHERE draft_id = ? AND kind = 'pack' AND name = 'world.json'").run(JH_DAY1_FROM, Buffer.byteLength(oldText), draftId);
      store.db.prepare("DELETE FROM files WHERE draft_id = ? AND name LIKE 'was-%'").run(draftId);
      store.db.prepare('UPDATE drafts SET pack = ?, world = ? WHERE id = ?').run('{"was":1}', JH_DAY1_FROM, draftId);
      const meta = { ...m0, storykit: { ...m0.storykit, world: JH_DAY1_FROM } };
      db.prepare('UPDATE games SET meta = ?, code = ?, hidden = 0 WHERE id = ?').run(JSON.stringify(meta), 'GameMog.world({ storykit: {"was":1} });\n', g0.id);
    };
    setLive();
    { const before = row(), note = await run(P, db), g = row(), m = JSON.parse(g.meta), d = store.db.prepare('SELECT * FROM drafts WHERE id = ?').get(draftId) as any;
      const was = store.db.prepare('SELECT hash FROM files WHERE draft_id = ? AND name = ?').get(draftId, `was-${JH_DAY1_FROM}.json`) as any;
      ok('on gamemog.com\'s state it plays the record\'s world in place: same id and slug, meta and module the record\'s',
        g.id === g0.id && g.slug === 'jensen-heist' && m.storykit.world === R.world.hash && m.storykit.pack === draftId
          && g.code === `GameMog.world({ storykit: ${JSON.stringify(R.pack)} });\n` && note.includes(`plays ${R.world.hash.slice(0, 12)} (was ${JH_DAY1_FROM.slice(0, 12)}, kept)`), note);
      ok('... sealed into the same kept store draft (its pack the record\'s), the old one kept as a was- row, both served',
        d.state === 'kept' && d.game_id === g.id && d.world === R.world.hash && d.pack === JSON.stringify(R.pack) && was?.hash === JH_DAY1_FROM
          && store.read(`${R.world.hash}.json`)?.hash === R.world.hash && store.read(`${JH_DAY1_FROM}.json`)?.hash === JH_DAY1_FROM);
      ok('... its title, tagline, art and hidden as they were; the rest of its meta too',
        g.title === before.title && g.tagline === before.tagline && Buffer.from(g.cover).equals(Buffer.from(before.cover)) && Buffer.from(g.art_wide).equals(Buffer.from(before.art_wide)) && g.hidden === 0
          && m.title === m0.title && m.blurb === m0.blurb && JSON.stringify(m.cast) === JSON.stringify(m0.cast) && m.storykit.credit === m0.storykit.credit && m.storykit.packId === 'jensen-heist' && m.storykit.showcase === true);
      ok('... and no new body (none named)', !/new bodies/.test(note), note);
      const clips = store.db.prepare("SELECT COUNT(*) n FROM files WHERE draft_id = ? AND kind = 'voice'").get(draftId) as any;
      ok('... every clip as it was (678)', clips.n === 678, String(clips.n));
      const again = await run(P, db);
      ok('... run again it is already there', /^already there/.test(again), again); }

    { setLive();
      const g = row(), m = JSON.parse(g.meta), other = 'f'.repeat(64);
      db.prepare('UPDATE games SET meta = ? WHERE id = ?').run(JSON.stringify({ ...m, storykit: { ...m.storykit, world: other } }), g.id);
      const note = await run(P, db), h = row();
      ok('a game playing some other world (patched since) is left alone', /^left alone/.test(note) && JSON.parse(h.meta).storykit.world === other, note); }

    db.close(); store.db.close();

    // the whole boot on a fresh disk with the Story Kit on: all six recorded, the game the record's world, hidden
    const p2 = path.join(dir, 'fresh.db');
    writeFileSync(p2, gunzipSync(readFileSync('deploy/seed.db.gz')));
    console.log = () => {}; console.error = () => {};
    try { await migrate(p2); } finally { console.log = log; console.error = err; }
    const d2 = new DatabaseSync(p2), notes = d2.prepare('SELECT id, note FROM migrations WHERE id IN (?, ?, ?, ?, ?, ?)').all(PUB_ID, TITLE_ID, P1_ID, P2_ID, P3_ID, ID) as any[], g2 = d2.prepare("SELECT title, hidden, meta FROM games WHERE slug = 'jensen-heist'").get() as any;
    ok('a fresh boot with the Story Kit on records all six and ends with the day-1 world, hidden',
      notes.length === 6 && g2?.title === 'Jensen Heist' && g2.hidden === 1 && JSON.parse(g2.meta).storykit.world === R.world.hash, notes.map((n) => `${n.id}: ${n.note}`).join(' | '));
    d2.close();
  } finally {
    console.log = log; console.error = err;
    if (sk === undefined) delete process.env.STORYKIT; else process.env.STORYKIT = sk;
    rmSync(dir, { recursive: true, force: true });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let failed = 0;
  await runJensenDay1Checks((name, cond, detail) => { console.log(`${cond ? '  ok  ' : '  FAIL'} ${name}${!cond && detail ? `: ${detail}` : ''}`); if (!cond) failed++; });
  process.exit(failed ? 1 : 0);
}
