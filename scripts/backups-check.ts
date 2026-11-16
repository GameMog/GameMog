/**
 * Backups of the live data (16 Nov, deploy/backups.mjs, lib/backups.ts, app/api/admin/backup/route.ts,
 * deploy/restore.mjs), all on throwaway folders in the system's temp folder (never data/): a snapshot's databases,
 * manifest and kept story blobs; one a day, the last 7 kept, the disk's floor; the owner's download through the real
 * route (404 without the owner's session); a restore of that download into an empty folder by the real CLI, with the
 * same rows; a non-empty folder refused, a damaged download refused with nothing changed; and the boot's catalog step
 * on a new disk, on a disk that lost its catalog with no snapshot, and with one.
 */
import { register } from 'node:module';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { StoryStore } from '../lib/storykit-store.ts';

type Ok = (name: string, cond: boolean, detail?: string) => void;
const ROOT = new URL('../', import.meta.url);
// the app's "@/" imports for the route, and Next's extensionless subpaths (next/headers), as scripts/build-limits-check.ts does
register('data:text/javascript,' + encodeURIComponent(`
  export async function resolve(s, c, next) {
    if (s === 'next/headers' || s === 'next/server') return next(s + '.js', c);
    if (!s.startsWith('@/')) return next(s, c);
    for (const ext of ['', '.ts', '.tsx', '/index.ts']) { try { return await next(${JSON.stringify(ROOT.href)} + s.slice(2) + ext, c); } catch {} }
    return next(s, c);
  }`));

const sha = (b: Uint8Array | string) => createHash('sha256').update(b).digest('hex');
const quiet = { log: () => {}, warn: () => {}, error: () => {} };

/** A disk as the server leaves it: a catalog, a store with a published and an unpublished world, a town queue. */
function makeData(data: string) {
  mkdirSync(data, { recursive: true });
  const db = new DatabaseSync(path.join(data, 'gamemog.db'));
  db.exec("PRAGMA journal_mode = WAL; CREATE TABLE games (id TEXT PRIMARY KEY, slug TEXT, meta TEXT); CREATE TABLE generations (id INTEGER PRIMARY KEY, prompt TEXT);");
  for (let i = 0; i < 3; i++) db.prepare('INSERT INTO games VALUES (?, ?, ?)').run(`g${i}`, `game-${i}`, '{}');
  db.prepare('INSERT INTO generations (prompt) VALUES (?)').run('a build');
  db.close();
  const s = new StoryStore(path.join(data, 'storykit'));
  const blob = (tag: string, ext: string) => {
    const bytes = new TextEncoder().encode(`backup check ${tag} `.repeat(8)), h = sha(bytes);
    mkdirSync(path.dirname(s.blobPath(h, ext)), { recursive: true });
    writeFileSync(s.blobPath(h, ext), bytes);
    s.db.prepare('INSERT INTO blobs (hash, ext, bytes, at) VALUES (?, ?, ?, 1)').run(h, ext, bytes.length);
    return h;
  };
  const kept = '11111111-1111-4111-8111-111111111111', open = '22222222-2222-4222-8222-222222222222';
  const g = blob('glb', 'glb'), w = blob('world', 'json'), u = blob('draft', 'glb');
  s.db.prepare("INSERT INTO drafts (id, token_hash, pack, state, game_id, world, created_at, touched_at) VALUES (?, 'x', '{}', 'kept', 'g0', ?, 1, 1)").run(kept, w);
  s.db.prepare("INSERT INTO drafts (id, token_hash, pack, state, created_at, touched_at) VALUES (?, 'x', '{}', 'draft', 1, 1)").run(open);
  s.db.prepare("INSERT INTO files (draft_id, kind, name, hash, ext, bytes, at) VALUES (?, 'glb', 'nico', ?, 'glb', 1, 1)").run(kept, g);
  s.db.prepare("INSERT INTO files (draft_id, kind, name, hash, ext, bytes, at) VALUES (?, 'pack', 'world.json', ?, 'json', 1, 1)").run(kept, w);
  s.db.prepare("INSERT INTO files (draft_id, kind, name, hash, ext, bytes, at) VALUES (?, 'glb', 'rae', ?, 'glb', 1, 1)").run(open, u);
  s.db.close();
  mkdirSync(path.join(data, 'hometown'), { recursive: true });
  const q = new DatabaseSync(path.join(data, 'hometown', 'queue.db'));
  q.exec("CREATE TABLE towns (place TEXT, build TEXT); INSERT INTO towns VALUES ('us-1', 'b1');");
  q.close();
  return { kept: [g, w].sort(), unkept: u };
}
const count = (f: string, sql: string) => { const d = new DatabaseSync(f, { readOnly: true }); try { return (d.prepare(sql).get() as { n: number }).n; } finally { d.close(); } };

export async function runBackupChecks(ok: Ok) {
  console.log('\nbackups of the live data (deploy/backups.mjs, /api/admin/backup, deploy/restore.mjs)');
  // (plain JS with no type annotations: read loosely here)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const B: any = await import('../deploy/backups.mjs');
  const tmp = mkdtempSync(path.join(tmpdir(), 'gamemog-backups-'));
  const env = { pw: process.env.ADMIN_PASSWORD };
  const cwd = process.cwd();
  try {
    const data = path.join(tmp, 'live', 'data');
    const { kept, unkept } = makeData(data);
    const T = Date.UTC(2026, 10, 16, 10, 30);
    const r = B.snapshot(data, { now: T, env: {}, log: quiet });
    const m = r.ok ? r.manifest : null;
    ok('a snapshot copies the catalog, the store and the town queue into data/backups/<UTC date>/', !!m && r.dir === path.join(data, 'backups', '2026-11-16')
      && ['gamemog.db', 'storykit-store.db', 'hometown-queue.db'].every((f) => existsSync(path.join(r.dir!, f))), r.ok ? r.day : String(r.skipped));
    ok('its manifest has each file\'s bytes, SHA-256 and row counts', !!m && m.files['gamemog.db'].rows.games === 3 && m.files['gamemog.db'].rows.generations === 1 && m.files['hometown-queue.db'].rows.towns === 1
      && Object.entries(m.files).every(([n, f]: [string, any]) => f.sha256 === sha(readFileSync(path.join(r.dir!, n)))), JSON.stringify(m?.files['gamemog.db']));
    ok('and lists exactly the blobs the published story worlds use', !!m && JSON.stringify(m.blobs.map((b: any) => b.hash).sort()) === JSON.stringify(kept) && !m.blobs.some((b: any) => b.hash === unkept));
    ok('the copy is a whole database (WAL included), readable on its own', count(path.join(r.dir!, 'gamemog.db'), 'SELECT COUNT(*) AS n FROM games') === 3);
    const again = B.snapshot(data, { now: T + 3600_000, env: {}, log: quiet });
    ok('one a UTC day: a second the same day is skipped', !again.ok && /already/.test(String(again.skipped)));
    const warned: string[] = [];
    const low = B.snapshot(data, { now: T + 86400_000, env: { BACKUP_FREE_FLOOR_GB: '1000000' }, log: { log: () => {}, warn: (w: string) => warned.push(w), error: () => {} } });
    ok('under the disk\'s free floor it is skipped with a logged warning, nothing written', !low.ok && warned.length === 1 && /SKIPPED/.test(warned[0]) && !existsSync(path.join(data, 'backups', '2026-11-17')), warned[0]);
    // the last 7 kept
    const ages = path.join(tmp, 'ages', 'data');
    makeData(ages);
    for (let d = 1; d <= 9; d++) B.snapshot(ages, { now: T + d * 86400_000, env: {}, log: quiet });
    const days = B.listSnapshots(ages);
    ok('the last 7 snapshots are kept, the oldest removed', days.length === 7 && days[0] === '2026-11-19' && days[6] === '2026-11-25', days.join(' '));
    ok('the job\'s timing: none today and past 10:00 UTC, or the newest over two days old', (await import('../lib/backups.ts')).snapshotDue('2026-11-15', T) && !(await import('../lib/backups.ts')).snapshotDue('2026-11-16', T)
      && !(await import('../lib/backups.ts')).snapshotDue('2026-11-15', Date.UTC(2026, 10, 16, 3)) && (await import('../lib/backups.ts')).snapshotDue('2026-11-13', Date.UTC(2026, 10, 16, 3)));

    // the owner's download, through the real route, run where data/ is the throwaway disk
    process.env.ADMIN_PASSWORD = 'backup-check-password-1234';
    const { sessionValue, COOKIE } = await import('../app/admin/session.ts');
    const { GET } = await import('../app/api/admin/backup/route.ts');
    const bundle = path.join(tmp, 'gamemog-backup.tar.gz');
    process.chdir(path.join(tmp, 'live'));
    let anon: Response, mine: Response;
    try {
      anon = await GET(new Request('http://127.0.0.1:3939/api/admin/backup'));
      const forged = await GET(new Request('http://127.0.0.1:3939/api/admin/backup', { headers: { cookie: `${COOKIE}=v1.9999999999.${'0'.repeat(64)}` } }));
      ok('the download is not found without the owner\'s session (a forged cookie too)', anon.status === 404 && forged.status === 404, `${anon.status} ${forged.status}`);
      mine = await GET(new Request('http://127.0.0.1:3939/api/admin/backup', { headers: { cookie: `x=1; ${COOKIE}=${sessionValue().value}` } }));
      writeFileSync(bundle, Buffer.from(await mine.arrayBuffer()));
    } finally { process.chdir(cwd); }
    ok('with it, the newest snapshot and its story files stream as one .tar.gz', mine.status === 200 && mine.headers.get('content-type') === 'application/gzip'
      && /gamemog-backup-2026-11-16\.tar\.gz/.test(mine.headers.get('content-disposition') ?? '') && mine.headers.get('x-backup-files') === '6' && mine.headers.get('x-backup-missing') === '0',
      `${mine.status} ${mine.headers.get('x-backup-files')} files`);

    // the restore CLI, into an empty folder
    const node = (args: string[]) => spawnSync(process.execPath, ['deploy/restore.mjs', ...args], { cwd, encoding: 'utf8' });
    const fresh = path.join(tmp, 'fresh', 'data');
    const out = node([bundle, '--data', fresh]);
    const storeDb = path.join(fresh, 'storykit', 'store.db');
    ok('the restore puts it back on an empty disk', out.status === 0 && existsSync(path.join(fresh, 'gamemog.db')) && existsSync(storeDb) && existsSync(path.join(fresh, 'hometown', 'queue.db')), (out.stderr || out.stdout).trim().slice(0, 300));
    ok('with the same rows: the games, the builds, the towns', out.status === 0 && count(path.join(fresh, 'gamemog.db'), 'SELECT COUNT(*) AS n FROM games') === 3
      && count(path.join(fresh, 'gamemog.db'), 'SELECT COUNT(*) AS n FROM generations') === 1 && count(path.join(fresh, 'hometown', 'queue.db'), 'SELECT COUNT(*) AS n FROM towns') === 1);
    const s = out.status === 0 ? new StoryStore(path.join(fresh, 'storykit')) : null;
    ok('the published story world is whole, its files served from the store; the unpublished draft is left out', !!s
      && (s.db.prepare("SELECT COUNT(*) AS n FROM drafts WHERE state = 'kept'").get() as { n: number }).n === 1 && (s.db.prepare('SELECT COUNT(*) AS n FROM drafts').get() as { n: number }).n === 1
      && kept.every((h) => !!s.stat(`${h}.${(s.db.prepare('SELECT ext FROM blobs WHERE hash = ?').get(h) as { ext: string }).ext}`)) && !existsSync(path.join(fresh, 'storykit', 'blobs', unkept.slice(0, 2), `${unkept}.glb`)));
    s?.db.close();
    const busy = node([bundle, '--data', fresh]);
    ok('a data folder that holds anything is refused, nothing changed', busy.status === 1 && /not empty/.test(busy.stderr));
    const forced = node([bundle, '--data', fresh, '--force']);
    ok('--force restores over it', forced.status === 0, forced.stderr.slice(0, 200));
    const raw = readFileSync(bundle);
    writeFileSync(path.join(tmp, 'cut.tar.gz'), raw.subarray(0, Math.floor(raw.length * 0.6)));
    const cutTo = path.join(tmp, 'cut', 'data');
    const cut = node([path.join(tmp, 'cut.tar.gz'), '--data', cutTo]);
    ok('an incomplete download is refused and nothing is put in place', cut.status === 1 && !existsSync(path.join(cutTo, 'gamemog.db')) && readdirSync(cutTo).length === 0, cut.stderr.trim().slice(0, 200));

    // the boot's catalog step (deploy/boot.mjs)
    const seed = path.join(cwd, 'deploy', 'seed.db.gz');
    const newDisk = path.join(tmp, 'boot-new', 'data'); mkdirSync(newDisk, { recursive: true });
    ok('boot: a new disk (no data at all) is seeded quietly, as before', B.ensureCatalog(newDisk, seed, quiet) === 'seeded' && count(path.join(newDisk, 'gamemog.db'), 'SELECT COUNT(*) AS n FROM games') > 0);
    const lost = path.join(tmp, 'boot-lost', 'data'); makeData(lost); rmSync(path.join(lost, 'gamemog.db'));
    for (const x of ['-wal', '-shm']) rmSync(path.join(lost, `gamemog.db${x}`), { force: true });
    const loud: string[] = [];
    ok('boot: a lost catalog with the store there and no snapshot is seeded, with a loud warning', B.ensureCatalog(lost, seed, { log: () => {}, warn: () => {}, error: (w: string) => loud.push(w) }) === 'seeded-lost' && /WAS MISSING/.test(loud[0] ?? ''), loud[0]?.slice(0, 120));
    const back = path.join(tmp, 'boot-back', 'data'); makeData(back);
    B.snapshot(back, { now: T, env: {}, log: quiet });
    const db = new DatabaseSync(path.join(back, 'gamemog.db')); db.prepare('INSERT INTO games VALUES (?, ?, ?)').run('g9', 'after', '{}'); db.close();
    for (const x of ['', '-wal', '-shm']) rmSync(path.join(back, `gamemog.db${x}`), { force: true });
    const said: string[] = [];
    const how = B.ensureCatalog(back, seed, { log: () => {}, warn: () => {}, error: (w: string) => said.push(w) });
    ok('boot: a lost catalog with a snapshot on the disk is restored from it, never seeded, and said loudly', how === 'restored' && count(path.join(back, 'gamemog.db'), 'SELECT COUNT(*) AS n FROM games') === 3 && /RESTORED/.test(said[0] ?? ''), `${how}: ${said[0]?.slice(0, 160)}`);
    ok('boot: a catalog on the disk is kept as it is', B.ensureCatalog(back, seed, quiet) === 'kept');
  } finally {
    process.chdir(cwd);
    if (env.pw === undefined) delete process.env.ADMIN_PASSWORD; else process.env.ADMIN_PASSWORD = env.pw;
    rmSync(tmp, { recursive: true, force: true });
  }
}
