/**
 * Rebuilds data/ from a backup the owner downloaded from /admin (app/api/admin/backup/route.ts: a .tar.gz of the newest
 * snapshot, deploy/backups.mjs, and every Story Kit blob the published story worlds use). For a new or wiped disk:
 *
 *   node deploy/restore.mjs <gamemog-backup-YYYY-MM-DD.tar.gz> [--data <dir>] [--force] [--allow-missing]
 *
 * Every file is checked before anything is put in place: each database against its manifest's SHA-256, each blob
 * against its own name (blobs are content-addressed), and every blob the manifest lists must be in the bundle
 * (--allow-missing restores without the ones that are not). A data/ that already holds anything is refused unless
 * --force (its databases are then replaced; blobs already there are kept). Drafts that were never published are not
 * in a backup: the restored store keeps only the published (kept) story worlds. On Render: stop the service (or run
 * this from its Shell with the service suspended), upload the bundle to the disk, run this, start the service.
 * docs/DEPLOY-RENDER.md, "Backups and restore".
 */
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { createGunzip } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { blobRel, restoreDatabases, rowCounts } from './backups.mjs';

const SNAP_FILE = /^snapshot\/(manifest\.json|[a-z0-9-]+\.db)$/;
const BLOB_FILE = /^blobs\/([0-9a-f]{2})\/([0-9a-f]{64})\.(glb|ogg|wav|jpg|webp|png|json)$/;

/**
 * Read a .tar.gz as a stream, writing each entry the bundle may hold into `stage` while hashing it: no other path is
 * written, whatever the bundle names. Returns the entries: { name, bytes, sha256 }.
 */
export async function extract(bundle, stage) {
  const out = [];
  let buf = Buffer.alloc(0), entry = null, left = 0, pad = 0, zeros = 0;
  const open = (name, bytes) => {
    const f = path.join(stage, ...name.split('/'));
    mkdirSync(path.dirname(f), { recursive: true });
    const ws = createWriteStream(f), hash = createHash('sha256');
    return { name, bytes, ws, hash };
  };
  const finish = async (e) => {
    await new Promise((res, rej) => { e.ws.on('error', rej); e.ws.end(res); });
    out.push({ name: e.name, bytes: e.bytes, sha256: e.hash.digest('hex') });
  };
  for await (const chunk of createReadStream(bundle).pipe(createGunzip())) {
    buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;
    for (;;) {
      if (entry) {
        const n = Math.min(left, buf.length);
        if (n) { const part = buf.subarray(0, n); entry.hash.update(part); if (!entry.ws.write(part)) await new Promise((r) => entry.ws.once('drain', r)); buf = buf.subarray(n); left -= n; }
        if (left) break;
        await finish(entry); entry = null;
      }
      if (pad) { const n = Math.min(pad, buf.length); buf = buf.subarray(n); pad -= n; if (pad) break; }
      if (buf.length < 512) break;
      const h = buf.subarray(0, 512); buf = buf.subarray(512);
      if (h.every((b) => b === 0)) { zeros++; continue; }
      const field = (o, l) => h.subarray(o, o + l).toString('utf8').replace(/\0.*$/s, '');
      const sum = parseInt(field(148, 8).trim(), 8);
      let calc = 0; for (let i = 0; i < 512; i++) calc += i >= 148 && i < 156 ? 32 : h[i];
      if (sum !== calc) throw new Error('restore: the bundle is damaged (a tar header checksum does not match)');
      const prefix = field(345, 155), name = prefix ? `${prefix}/${field(0, 100)}` : field(0, 100);
      const bytes = parseInt(field(124, 12).trim() || '0', 8), type = field(156, 1) || '0';
      if (type === '5') continue;                                   // a folder
      if (type !== '0') throw new Error(`restore: the bundle holds an entry of a kind it never writes (${name})`);
      if (!SNAP_FILE.test(name) && !BLOB_FILE.test(name)) throw new Error(`restore: the bundle holds a file it never writes (${name})`);
      pad = (512 - (bytes % 512)) % 512;
      entry = open(name, bytes); left = bytes;
      if (!left) { await finish(entry); entry = null; }
    }
  }
  if (entry || left) throw new Error('restore: the bundle ends in the middle of a file (an incomplete download?)');
  if (zeros < 1) throw new Error('restore: the bundle has no end (an incomplete download?)');
  return out;
}

/** Restore `bundle` into `data`. Returns { day, games, blobs, missing, rows } or throws with why nothing was changed. */
export async function restoreBundle(bundle, data, { force = false, allowMissing = false, log = console } = {}) {
  const busy = existsSync(data) ? readdirSync(data).filter((f) => f !== '.gitkeep' && !f.startsWith('.restore-')) : [];
  if (busy.length && !force) throw new Error(`restore: ${data} is not empty (${busy.slice(0, 6).join(', ')}${busy.length > 6 ? ', ...' : ''}). Nothing was changed. --force replaces its databases.`);
  mkdirSync(data, { recursive: true });
  const stage = path.join(data, `.restore-${process.pid}`);
  rmSync(stage, { recursive: true, force: true });
  try {
    const entries = await extract(bundle, stage);
    const snap = path.join(stage, 'snapshot');
    if (!existsSync(path.join(snap, 'manifest.json'))) throw new Error('restore: the bundle has no snapshot/manifest.json');
    const manifest = JSON.parse(readFileSync(path.join(snap, 'manifest.json'), 'utf8'));
    if (manifest.v !== 1 || !manifest.files?.['gamemog.db']) throw new Error('restore: the manifest is not one this version reads');
    // every database as its manifest says (restoreDatabases checks again as it copies)
    for (const [name, f] of Object.entries(manifest.files)) {
      const e = entries.find((x) => x.name === `snapshot/${name}`);
      if (!e) throw new Error(`restore: ${name} is listed but not in the bundle`);
      if (e.sha256 !== f.sha256) throw new Error(`restore: ${name} does not match its manifest`);
    }
    // every blob is its own hash; the manifest's blobs are all there (or allowed missing)
    const blobs = new Map();
    for (const e of entries) { const m = BLOB_FILE.exec(e.name); if (!m) continue; if (e.sha256 !== m[2] || m[1] !== m[2].slice(0, 2)) throw new Error(`restore: the blob ${m[2].slice(0, 12)} does not match its own hash`); blobs.set(m[2], m[3]); }
    const missing = manifest.blobs.filter((b) => blobs.get(b.hash) !== b.ext);
    if (missing.length && !allowMissing) throw new Error(`restore: ${missing.length} of the ${manifest.blobs.length} published story files are not in the bundle (first: ${missing[0].hash.slice(0, 12)}.${missing[0].ext}). --allow-missing restores without them.`);
    // in place: the databases, then the blobs (a blob already on the disk is the same bytes: kept)
    const restored = restoreDatabases(snap, data, { replace: true });
    for (const [hash, ext] of blobs) {
      const dest = path.join(data, ...blobRel(hash, ext).split('/'));
      if (existsSync(dest)) continue;
      mkdirSync(path.dirname(dest), { recursive: true });
      renameSync(path.join(stage, 'blobs', hash.slice(0, 2), `${hash}.${ext}`), dest);
    }
    // the store keeps only what the backup holds: the published worlds (drafts in progress were not backed up)
    if (restored.includes('storykit-store.db')) {
      const s = new DatabaseSync(path.join(data, 'storykit', 'store.db'));
      try {
        s.exec('PRAGMA foreign_keys = ON');
        const gone = s.prepare("DELETE FROM drafts WHERE state != 'kept'").run().changes;
        s.prepare('DELETE FROM blobs WHERE hash NOT IN (SELECT hash FROM files) AND hash NOT IN (SELECT world FROM drafts WHERE world IS NOT NULL)').run();
        if (gone) log.log(`restore: ${gone} unpublished story draft(s) left out (drafts are not backed up)`);
      } finally { s.close(); }
    }
    const rows = rowCounts(path.join(data, 'gamemog.db'));
    const want = manifest.files['gamemog.db'].rows;
    const differs = Object.keys(want).filter((t) => want[t] !== rows[t]);
    if (differs.length) throw new Error(`restore: the restored catalog's rows differ from the manifest (${differs.join(', ')})`);
    log.log(`restore: the snapshot of ${manifest.day} is in ${data}: ${restored.join(', ')}; ${rows.games ?? 0} games; ${blobs.size} story files${missing.length ? `; ${missing.length} MISSING (allowed)` : ''}`);
    return { day: manifest.day, games: rows.games ?? 0, blobs: blobs.size, missing: missing.length, rows, restored };
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), at = args.indexOf('--data');
  const bundle = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--data');
  if (!bundle) { console.error('usage: node deploy/restore.mjs <backup.tar.gz> [--data <dir>] [--force] [--allow-missing]'); process.exit(2); }
  try {
    await restoreBundle(path.resolve(bundle), path.resolve(at >= 0 ? args[at + 1] : 'data'), { force: args.includes('--force'), allowMissing: args.includes('--allow-missing') });
  } catch (e) { console.error(String(e?.message ?? e)); process.exit(1); }
}
