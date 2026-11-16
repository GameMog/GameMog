/**
 * Backups of the live data (the owner, 16 Nov 2026). Everything GameMog keeps lives on one Render disk (render.yaml,
 * data/): the catalog (data/gamemog.db), the Story Kit store (data/storykit/store.db and its content-addressed blobs) and
 * the town builder's queue (data/hometown/queue.db, its towns). This file is plain Node (no TypeScript, no packages), so
 * deploy/boot.mjs, deploy/restore.mjs and the server's nightly job (lib/backups.ts, which runs it as its own process,
 * off the server's thread) all share it.
 *
 *   snapshot(data)   consistent copies (VACUUM INTO) of the three databases into data/backups/<UTC date>/, with a
 *                    manifest.json: each file's bytes, SHA-256 and row counts, and the store blobs the kept (published)
 *                    story worlds use. One a UTC day (an existing one is kept), the last BACKUP_KEEP (7) kept, skipped
 *                    with a warning while the disk's free space is under BACKUP_FREE_FLOOR_GB (2) plus the copies' size.
 *   ensureCatalog()  deploy/boot.mjs's first step: a missing catalog on a disk that holds other data (the store or a
 *                    snapshot) is a lost database, not a fresh disk: the newest snapshot is restored, never the seed
 *                    silently. Only a disk with no data at all is seeded quietly, as before.
 *   node deploy/backups.mjs snapshot [--data <dir>] [--force]   one snapshot now (what the nightly job runs)
 *   node deploy/backups.mjs list [--data <dir>]                  the snapshots on the disk
 * The owner downloads the newest snapshot with its blobs from /admin (app/api/admin/backup/route.ts) and restores a
 * download with deploy/restore.mjs. docs/DEPLOY-RENDER.md, "Backups and restore".
 */
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, statfsSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** The databases a snapshot copies: its file name in the snapshot, and where it lives under data/. */
export const DATABASES = [
  { name: 'gamemog.db', from: 'gamemog.db', required: true },
  { name: 'storykit-store.db', from: 'storykit/store.db' },
  { name: 'hometown-queue.db', from: 'hometown/queue.db' },
];
export const DAY = /^\d{4}-\d{2}-\d{2}$/;
export const utcDay = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);
const GB = 1024 ** 3;
const num = (v, d) => { const n = Number(v); return v != null && String(v).trim() !== '' && Number.isFinite(n) && n >= 0 ? n : d; };
/** How many daily snapshots are kept: BACKUP_KEEP, or 7. */
export const keepCount = (env = process.env) => Math.max(1, Math.floor(num(env.BACKUP_KEEP, 7)));
/** The free space a snapshot leaves on the disk at the least: BACKUP_FREE_FLOOR_GB, or 2 (the town store's own floor). */
export const floorBytes = (env = process.env) => num(env.BACKUP_FREE_FLOOR_GB, 2) * GB;

export function freeBytes(dir) {
  try { const s = statfsSync(dir); return Number(s.bavail) * Number(s.bsize); } catch { return Infinity; }
}
export function sha256File(f) { return createHash('sha256').update(readFileSync(f)).digest('hex'); }
const size = (f) => { try { return statSync(f).size; } catch { return 0; } };

/** Every table's rows in a database file (sqlite_ tables left out). */
export function rowCounts(file) {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const out = {};
    for (const { name } of db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()) {
      out[name] = db.prepare(`SELECT COUNT(*) AS n FROM "${name.replace(/"/g, '""')}"`).get().n;
    }
    return out;
  } finally { db.close(); }
}

/** The blobs the kept (published) story worlds use, read from a store database: hash, ext, bytes. */
export function keptBlobs(storeFile) {
  const db = new DatabaseSync(storeFile, { readOnly: true });
  try {
    return db.prepare(`SELECT b.hash, b.ext, b.bytes FROM blobs b WHERE b.hash IN (
      SELECT f.hash FROM files f JOIN drafts d ON d.id = f.draft_id WHERE d.state = 'kept'
      UNION SELECT d.world FROM drafts d WHERE d.state = 'kept' AND d.world IS NOT NULL) ORDER BY b.hash`).all().map((r) => ({ hash: r.hash, ext: r.ext, bytes: r.bytes }));
  } finally { db.close(); }
}
/** Where the store keeps a blob, under data/ (lib/storykit-store.ts blobPath). */
export const blobRel = (hash, ext) => `storykit/blobs/${hash.slice(0, 2)}/${hash}.${ext}`;

/** The complete snapshots on the disk, oldest first (a snapshot is complete once its manifest is written). */
export function listSnapshots(data) {
  const root = path.join(data, 'backups');
  if (!existsSync(root)) return [];
  return readdirSync(root).filter((d) => DAY.test(d) && existsSync(path.join(root, d, 'manifest.json'))).sort();
}
export function latestSnapshot(data) {
  const all = listSnapshots(data);
  if (!all.length) return null;
  const day = all[all.length - 1], dir = path.join(data, 'backups', day);
  try { return { day, dir, manifest: JSON.parse(readFileSync(path.join(dir, 'manifest.json'), 'utf8')) }; } catch { return null; }
}

/**
 * One snapshot of `data` into data/backups/<UTC date>/. Returns { ok, day, dir, manifest } or { ok: false, skipped }
 * with why (one already today, the disk's floor, no catalog). Written to a .partial folder first and renamed, so a
 * folder with a manifest is always whole.
 */
export function snapshot(data, { now = Date.now(), env = process.env, force = false, log = console } = {}) {
  const day = utcDay(now), root = path.join(data, 'backups'), dir = path.join(root, day);
  if (!existsSync(path.join(data, 'gamemog.db'))) return { ok: false, skipped: 'no catalog (data/gamemog.db) to back up' };
  if (!force && existsSync(path.join(dir, 'manifest.json'))) return { ok: false, skipped: `a snapshot for ${day} is already on the disk` };
  const need = DATABASES.reduce((s, d) => s + size(path.join(data, d.from)) + size(path.join(data, `${d.from}-wal`)), 0);
  const free = freeBytes(data), floor = floorBytes(env);
  if (free < floor + need) {
    const w = `backups: SKIPPED the snapshot for ${day}: ${(free / GB).toFixed(2)} GB free, under the floor of ${(floor / GB).toFixed(2)} GB plus the copies' ${(need / GB).toFixed(2)} GB (BACKUP_FREE_FLOOR_GB)`;
    log.warn?.(w) ?? log.log(w);
    return { ok: false, skipped: w };
  }
  mkdirSync(root, { recursive: true });
  const part = path.join(root, `.${day}.partial-${process.pid}`);
  rmSync(part, { recursive: true, force: true });
  mkdirSync(part);
  try {
    const files = {};
    for (const d of DATABASES) {
      const src = path.join(data, d.from);
      if (!existsSync(src)) continue;
      const out = path.join(part, d.name);
      const db = new DatabaseSync(src, { readOnly: true });
      try { db.exec(`VACUUM INTO '${out.replace(/'/g, "''")}'`); } finally { db.close(); }
      files[d.name] = { from: d.from, bytes: size(out), sha256: sha256File(out), rows: rowCounts(out) };
    }
    const blobs = files['storykit-store.db'] ? keptBlobs(path.join(part, 'storykit-store.db')) : [];
    const manifest = { v: 1, day, at: new Date(now).toISOString(), files, blobs, blobBytes: blobs.reduce((s, b) => s + b.bytes, 0) };
    writeFileSync(path.join(part, 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n');
    rmSync(dir, { recursive: true, force: true });
    renameSync(part, dir);
    const pruned = prune(data, keepCount(env));
    log.log(`backups: snapshot ${day}: ${Object.entries(files).map(([n, f]) => `${n} ${(f.bytes / 1e6).toFixed(1)} MB`).join(', ')}; ${blobs.length} kept story blobs (${(manifest.blobBytes / 1e6).toFixed(1)} MB, on the disk)${pruned.length ? `; removed ${pruned.join(', ')}` : ''}`);
    return { ok: true, day, dir, manifest };
  } catch (e) {
    rmSync(part, { recursive: true, force: true });
    throw e;
  }
}

/** Keep the newest `keep` snapshots; remove older ones and any partial folder a stopped run left. Returns what went. */
export function prune(data, keep) {
  const root = path.join(data, 'backups');
  if (!existsSync(root)) return [];
  const gone = [];
  for (const d of readdirSync(root)) if (/^\.\d{4}-\d{2}-\d{2}\.partial-\d+$/.test(d) && !d.endsWith(`-${process.pid}`)) { rmSync(path.join(root, d), { recursive: true, force: true }); gone.push(d); }
  const all = listSnapshots(data);
  for (const d of all.slice(0, Math.max(0, all.length - keep))) { rmSync(path.join(root, d), { recursive: true, force: true }); gone.push(d); }
  return gone;
}

/**
 * Put a snapshot's databases back under `data`: each one checked against its manifest's SHA-256 first. `only`: the
 * names to restore (default every one in the snapshot). An existing file is replaced only with `replace` (its -wal and
 * -shm go with it). Returns the names restored.
 */
export function restoreDatabases(snapDir, data, { only, replace = false } = {}) {
  const manifest = JSON.parse(readFileSync(path.join(snapDir, 'manifest.json'), 'utf8'));
  const done = [];
  for (const [name, f] of Object.entries(manifest.files)) {
    if (only && !only.includes(name)) continue;
    const def = DATABASES.find((d) => d.name === name);
    if (!def || def.from !== f.from) throw new Error(`restore: ${name} is not a database this version knows`);
    const src = path.join(snapDir, name), dest = path.join(data, def.from);
    const got = sha256File(src);
    if (got !== f.sha256) throw new Error(`restore: ${name} does not match its manifest (sha256 ${got.slice(0, 12)}, want ${f.sha256.slice(0, 12)})`);
    if (existsSync(dest) && !replace) continue;
    mkdirSync(path.dirname(dest), { recursive: true });
    for (const x of ['', '-wal', '-shm']) rmSync(`${dest}${x}`, { force: true });
    copyFileSync(src, `${dest}.restoring`);
    renameSync(`${dest}.restoring`, dest);
    done.push(name);
  }
  return done;
}

/**
 * The catalog at boot (deploy/boot.mjs). data/gamemog.db there: kept. Missing on a disk that holds nothing: seeded
 * from `seed` (a new disk, as before). Missing on a disk that holds the Story Kit store, the town queue or snapshots:
 * the database was lost or replaced, so the newest snapshot's catalog is restored (and the store's and queue's, if they
 * are missing too), said loudly; with no snapshot it is seeded, with a loud warning that the published worlds since the
 * seed are not in it. Returns what it did: 'kept' | 'seeded' | 'restored' | 'seeded-lost'.
 */
export function ensureCatalog(data, seed, log = console) {
  const DB = path.join(data, 'gamemog.db');
  if (existsSync(DB)) { log.log(`boot: keeping ${DB} from the disk`); return 'kept'; }
  const other = ['storykit/store.db', 'hometown/queue.db'].filter((f) => existsSync(path.join(data, f)));
  const snaps = listSnapshots(data);
  const seedIt = () => { mkdirSync(data, { recursive: true }); writeFileSync(`${DB}.seeding`, gunzipSync(readFileSync(seed))); renameSync(`${DB}.seeding`, DB); };
  if (!other.length && !snaps.length && !existsSync(path.join(data, 'storykit')) && !existsSync(path.join(data, 'backups'))) {
    seedIt();
    log.log(`boot: seeded ${DB} from ${seed} (a new disk)`);
    return 'seeded';
  }
  const latest = latestSnapshot(data);
  if (latest) {
    try {
      const restored = restoreDatabases(latest.dir, data, { replace: false });
      const n = latest.manifest.files['gamemog.db']?.rows?.games;
      log.error(`boot: !!! ${DB} WAS MISSING on a disk that holds other data (${[...other, `${snaps.length} snapshot(s)`].join(', ')}). RESTORED ${restored.join(', ')} from the snapshot of ${latest.day} (${n ?? '?'} games). Anything published after that snapshot is not in the catalog: /admin's story reconcile lists kept story worlds with no game.`);
      return 'restored';
    } catch (e) {
      log.error(`boot: !!! the snapshot of ${latest.day} could not be restored: ${String(e?.message ?? e)}`);
    }
  }
  seedIt();
  log.error(`boot: !!! ${DB} WAS MISSING on a disk that holds other data (${other.join(', ') || 'data/storykit or data/backups'}) and no snapshot could be restored: SEEDED from ${seed}. Every world published since the seed is missing from the catalog. Restore a downloaded backup with deploy/restore.mjs if there is one (docs/DEPLOY-RENDER.md, "Backups and restore").`);
  return 'seeded-lost';
}

// the CLI: node deploy/backups.mjs snapshot|list [--data <dir>] [--force]
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), at = args.indexOf('--data');
  const data = path.resolve(at >= 0 ? args[at + 1] : 'data');
  if (args[0] === 'snapshot') {
    try {
      const r = snapshot(data, { force: args.includes('--force') });
      if (!r.ok) console.log(`backups: ${r.skipped}`);
      process.exit(0);
    } catch (e) { console.error(`backups: the snapshot FAILED: ${String(e?.stack ?? e).slice(0, 600)}`); process.exit(1); }
  } else if (args[0] === 'list') {
    for (const d of listSnapshots(data)) console.log(d);
  } else { console.error('usage: node deploy/backups.mjs snapshot|list [--data <dir>] [--force]'); process.exit(2); }
}
