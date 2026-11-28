/**
 * Mandi's Revenge's voices (deploy/migrate.mjs 2026-11-27-mandis-revenge-voice). Part of `npm run check`. The record's
 * world differs from the unvoiced one 2026-11-27-mandis-revenge sealed (MR_VOICE_FROM, what gamemog.com plays) in its
 * voice plan's clips and the credits' voices: the same bodies. On a fresh copy of deploy/seed.db.gz in a temporary folder
 * (its Story Kit store beside it): it waits while the Story Kit is off and while the game is not there; after
 * 2026-11-27-mandis-revenge on a fresh disk (which already seals the voiced record) it is "already there"; on the state
 * gamemog.com has (the unvoiced world sealed in the kept draft, no clips, its pack and module) it seals the voiced world
 * and every clip into the kept store draft in place (the old world kept, still served) and leaves the title, the words,
 * the art and hidden as they are; run again it is "already there"; a game playing some other world is left alone.
 * The publish needs Mandi's and Jay's private bodies (never in the repo): on a machine without them (MR_<ID>_GLB or the
 * character folders beside the checkout) only the record's own checks run. Nothing touches data/.
 */
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { StoryStore } from '../lib/storykit-store.ts';
import { privateSource, PREMIUM, MR_VOICE } from './storykit-showcase-mandi.ts';

type Ok = (name: string, cond: boolean, detail?: string) => void;
type Migration = { id: string; async?: boolean; run: (db: unknown, p: string) => unknown };
const PUB_ID = '2026-11-27-mandis-revenge', ID = '2026-11-27-mandis-revenge-voice';
const sha = (b: string | Uint8Array) => createHash('sha256').update(b).digest('hex');

export async function runMandiVoiceChecks(ok: Ok) {
  console.log('\nMandi\'s Revenge voices (deploy/migrate.mjs ' + ID + ')');
  const { migrate, MIGRATIONS, MR_VOICE_FROM } = await import('../deploy/migrate.mjs') as { migrate: (p: string) => Promise<void> | void; MIGRATIONS: Migration[]; MR_VOICE_FROM: string };
  const iPub = MIGRATIONS.findIndex((m) => m.id === PUB_ID), iV = MIGRATIONS.findIndex((m) => m.id === ID);
  ok('the voices are one migration of their own, async, after the publish', iPub >= 0 && iV > iPub && !!MIGRATIONS[iV].async, `${iPub} ${iV}`);
  if (iPub < 0 || iV < 0) return;
  const PUB = MIGRATIONS[iPub], V = MIGRATIONS[iV];
  const R = JSON.parse(readFileSync('deploy/migrations/mandis-revenge-story.json', 'utf8'));
  const worldText = readFileSync('deploy/migrations/mandis-revenge/world.json', 'utf8'), W = JSON.parse(worldText);
  const clips = R.files.filter((f: any) => f.kind === 'voice'), man = JSON.parse(readFileSync(MR_VOICE, 'utf8'));
  const lines = new Set((W.voice.lines as any[]).filter((l) => !l.rec).map((l) => l.clip));
  ok('the record\'s world is voiced: every line of its plan has its clip, each in the voice record and the build', R.world.hash !== MR_VOICE_FROM
    && lines.size === clips.length && Object.keys(W.voice.clips).length === lines.size && [...lines].every((c) => W.voice.clips[c] && man.clips[c]?.secs > 0)
    && clips.every((f: any) => sha(readFileSync(f.src)) === f.hash), `${clips.length} clips, ${lines.size} lines`);
  ok('... the credits roll names the voices as the voice record credits them, and no credit names the assistant',
    JSON.stringify(R.pack.credits.voices) === JSON.stringify(man.credit.split(/(?<=\.) (?=[A-Z])/)) && !/claude|opus|anthropic/i.test(JSON.stringify(R.pack.credits) + man.credit));
  const priv = PREMIUM.map((id) => [id, privateSource(id)] as const);
  if (priv.some(([, s]) => !s)) { ok('(the migration\'s run waits for the private bodies: not on this machine, skipped)', true); return; }

  const dir = mkdtempSync(path.join(tmpdir(), 'mr-voice-')), p = path.join(dir, 'gamemog.db');
  const sk = process.env.STORYKIT, log = console.log, err = console.error;
  const run = async (m: Migration, d: DatabaseSync) => { d.exec('BEGIN'); try { const n = String(await m.run(d, p)); d.exec('COMMIT'); return n; } catch (e) { d.exec('ROLLBACK'); return `threw: ${(e as Error).message}`; } };
  try {
    // (the private bodies where the server keeps them, beside its database)
    mkdirSync(path.join(dir, 'storykit-private'));
    for (const [, s] of priv) copyFileSync(s!, path.join(dir, 'storykit-private', `${sha(readFileSync(s!))}.glb`));
    writeFileSync(p, gunzipSync(readFileSync('deploy/seed.db.gz')));
    delete process.env.STORYKIT;
    console.log = () => {}; console.error = () => {};
    try { await migrate(p); } finally { console.log = log; console.error = err; }
    const db = new DatabaseSync(p);
    ok('with the Story Kit off it waits (unrecorded)', /^threw: waiting: the Story Kit is off/.test(await run(V, db)) && !db.prepare('SELECT 1 FROM migrations WHERE id = ?').get(ID));
    process.env.STORYKIT = 'on';
    ok('before the game is published it waits', /^threw: waiting: Mandi's Revenge is not in this database/.test(await run(V, db)));
    const pub = await run(PUB, db);
    ok('2026-11-27-mandis-revenge still publishes on a fresh disk (the voiced record)', /^published \/g\/mandis-revenge HIDDEN/.test(pub), pub);
    const row = () => db.prepare("SELECT * FROM games WHERE slug = 'mandis-revenge'").get() as any;
    { const note = await run(V, db);
      ok('after it, on a fresh disk it is already there (the publish sealed the record\'s world)', /^already there/.test(note), note); }

    // gamemog.com's state: the unvoiced world sealed in the kept draft (the same bodies, no clips), its pack and module,
    // the game shown. The old world is a stand-in with MR_VOICE_FROM's hash
    const store = new StoryStore(path.join(dir, 'storykit'));
    const g0 = row(), m0 = JSON.parse(g0.meta), draftId = m0.storykit.pack;
    const oldText = JSON.stringify({ ...W, voice: { ...W.voice, clips: {} } });
    const setLive = () => {
      const bp = store.blobPath(MR_VOICE_FROM, 'json');
      mkdirSync(path.dirname(bp), { recursive: true }); writeFileSync(bp, oldText);
      store.db.prepare('INSERT OR IGNORE INTO blobs (hash, ext, bytes, at) VALUES (?, ?, ?, ?)').run(MR_VOICE_FROM, 'json', Buffer.byteLength(oldText), 1);
      store.db.prepare("UPDATE files SET hash = ?, bytes = ? WHERE draft_id = ? AND kind = 'pack' AND name = 'world.json'").run(MR_VOICE_FROM, Buffer.byteLength(oldText), draftId);
      store.db.prepare("DELETE FROM files WHERE draft_id = ? AND (name LIKE 'was-%' OR kind = 'voice')").run(draftId);
      store.db.prepare('UPDATE drafts SET pack = ?, world = ? WHERE id = ?').run('{"was":1}', MR_VOICE_FROM, draftId);
      const meta = { ...m0, storykit: { ...m0.storykit, world: MR_VOICE_FROM } };
      db.prepare('UPDATE games SET meta = ?, code = ?, hidden = 0 WHERE id = ?').run(JSON.stringify(meta), 'GameMog.world({ storykit: {"was":1} });\n', g0.id);
    };
    setLive();
    { const before = row(), note = await run(V, db), g = row(), m = JSON.parse(g.meta), d = store.db.prepare('SELECT * FROM drafts WHERE id = ?').get(draftId) as any;
      const was = store.db.prepare('SELECT hash FROM files WHERE draft_id = ? AND name = ?').get(draftId, `was-${MR_VOICE_FROM}.json`) as any;
      ok('on gamemog.com\'s state it plays the voiced world in place: same id and slug, meta and module the record\'s',
        g.id === g0.id && g.slug === 'mandis-revenge' && m.storykit.world === R.world.hash && m.storykit.pack === draftId
          && g.code === `GameMog.world({ storykit: ${JSON.stringify(R.pack)} });\n` && note.includes(`plays ${R.world.hash.slice(0, 12)} (was ${MR_VOICE_FROM.slice(0, 12)}, kept)`), note);
      ok('... sealed into the same kept store draft (its pack the record\'s), the old one kept as a was- row, both served',
        d.state === 'kept' && d.game_id === g.id && d.world === R.world.hash && d.pack === JSON.stringify(R.pack) && was?.hash === MR_VOICE_FROM
          && store.read(`${R.world.hash}.json`)?.hash === R.world.hash && store.read(`${MR_VOICE_FROM}.json`)?.hash === MR_VOICE_FROM);
      const n = (store.db.prepare("SELECT COUNT(*) n FROM files WHERE draft_id = ? AND kind = 'voice'").get(draftId) as any).n;
      ok(`... every clip (${clips.length}) a voice file of the draft, each served`, n === clips.length && clips.every((f: any) => store.read(`${f.hash}.ogg`)?.hash === f.hash) && note.includes(`${clips.length} voice clips added`), `${n} ${note}`);
      ok('... its title, tagline, art and hidden as they were; the rest of its meta too',
        g.title === before.title && g.tagline === before.tagline && Buffer.from(g.cover).equals(Buffer.from(before.cover)) && Buffer.from(g.art_wide).equals(Buffer.from(before.art_wide)) && g.hidden === 0
          && m.title === m0.title && m.blurb === m0.blurb && m.storykit.credit === m0.storykit.credit && m.storykit.packId === 'mandis-revenge' && m.storykit.showcase === true);
      const again = await run(V, db);
      ok('... run again it is already there', /^already there/.test(again), again); }

    { setLive();
      const g = row(), m = JSON.parse(g.meta), other = 'f'.repeat(64);
      db.prepare('UPDATE games SET meta = ? WHERE id = ?').run(JSON.stringify({ ...m, storykit: { ...m.storykit, world: other } }), g.id);
      const note = await run(V, db), h = row();
      ok('a game playing some other world (patched since) is left alone', /^left alone/.test(note) && JSON.parse(h.meta).storykit.world === other, note); }

    { setLive();
      const other = 'e'.repeat(64);
      store.db.prepare("UPDATE files SET hash = ? WHERE draft_id = ? AND kind = 'glb' AND name = 'kiki'").run(other, draftId);
      const note = await run(V, db), g = row();
      ok('a draft whose body changed since is refused (nothing written)', /^threw: the store draft does not hold kiki/.test(note) && JSON.parse(g.meta).storykit.world === MR_VOICE_FROM
        && !(store.db.prepare("SELECT COUNT(*) n FROM files WHERE draft_id = ? AND kind = 'voice'").get(draftId) as any).n, note); }
    db.close(); store.db.close();
  } finally {
    console.log = log; console.error = err;
    if (sk === undefined) delete process.env.STORYKIT; else process.env.STORYKIT = sk;
    rmSync(dir, { recursive: true, force: true });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let failed = 0;
  await runMandiVoiceChecks((name, cond, detail) => { console.log(`${cond ? '  ok  ' : '  FAIL'} ${name}${!cond && detail ? `: ${detail}` : ''}`); if (!cond) failed++; });
  process.exit(failed ? 1 : 0);
}
