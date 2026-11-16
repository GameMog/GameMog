/**
 * The server's side of the backups (deploy/backups.mjs has the snapshot itself; docs/DEPLOY-RENDER.md, "Backups and
 * restore"):
 *  - the nightly job (startNightlyBackups, from instrumentation-node.ts at boot): once an hour it looks for today's
 *    snapshot (UTC) and, from BACKUP_HOUR_UTC (10, about 2 am in Los Angeles) or when the newest is over a day old, takes
 *    one. The snapshot runs as its own Node process (node deploy/backups.mjs snapshot), so the copies, hashes and row
 *    counts never hold up a request on this server's thread. On in production (GAMEMOG_BACKUPS=off stops it); off in
 *    development unless GAMEMOG_BACKUPS=on;
 *  - the owner's download (app/api/admin/backup/route.ts): the newest snapshot and every Story Kit blob the published
 *    story worlds use, as one .tar.gz streamed from the disk (bundleStream), which deploy/restore.mjs puts back.
 */
import { spawn } from 'node:child_process';
import { createReadStream, existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { createGzip } from 'node:zlib';
import { Readable } from 'node:stream';

export type SnapshotFile = { from: string; bytes: number; sha256: string; rows: Record<string, number> };
export type Manifest = { v: 1; day: string; at: string; files: Record<string, SnapshotFile>; blobs: { hash: string; ext: string; bytes: number }[]; blobBytes: number };
export type Snapshot = { day: string; dir: string; manifest: Manifest };

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const BLOB = /^[0-9a-f]{64}$/, EXT = /^(glb|ogg|wav|jpg|webp|png|json)$/;
const SNAP_NAME = /^(manifest\.json|[a-z0-9-]+\.db)$/;
export const utcDay = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);

/** The newest complete snapshot under data/backups (one with its manifest), or null. */
export function latestSnapshot(data: string): Snapshot | null {
  const root = path.join(data, 'backups');
  if (!existsSync(root)) return null;
  const days = readdirSync(root).filter((d) => DAY.test(d) && existsSync(path.join(root, d, 'manifest.json'))).sort();
  for (const day of days.reverse()) {
    try { return { day, dir: path.join(root, day), manifest: JSON.parse(readFileSync(path.join(root, day, 'manifest.json'), 'utf8')) as Manifest }; } catch { /* the one before */ }
  }
  return null;
}
export type BackupsAdmin = { day: string; at: string; games: number | null; bytes: number; blobs: number; blobBytes: number; count: number; nightly: boolean };
/** What /admin shows: the newest snapshot, its size and how many there are. */
export function backupsAdmin(data: string): BackupsAdmin | null {
  const s = latestSnapshot(data);
  if (!s) return null;
  const root = path.join(data, 'backups');
  return {
    day: s.day, at: s.manifest.at, games: s.manifest.files['gamemog.db']?.rows?.games ?? null,
    bytes: Object.values(s.manifest.files).reduce((n, f) => n + f.bytes, 0), blobs: s.manifest.blobs.length, blobBytes: s.manifest.blobBytes,
    count: readdirSync(root).filter((d) => DAY.test(d)).length, nightly: backupsOn(),
  };
}

/** The nightly job's switch: GAMEMOG_BACKUPS on|off; unset, on in production only. */
export function backupsOn(env: Record<string, string | undefined> = process.env) {
  const v = env.GAMEMOG_BACKUPS?.trim().toLowerCase();
  return v ? v === 'on' : env.NODE_ENV === 'production';
}

/* ------------------------------------------------------- the snapshot process -- */
const G = globalThis as unknown as { __gmBackupRun?: Promise<boolean> | null; __gmBackupTimer?: ReturnType<typeof setInterval> | null };
/**
 * One snapshot in its own process (node deploy/backups.mjs snapshot): true when it ended well (a snapshot taken, or one
 * already there for today). One at a time: a second ask waits for the run in flight. Never throws.
 */
export function runSnapshot(data: string, { cwd = process.cwd(), timeoutMs = 20 * 60_000 } = {}): Promise<boolean> {
  if (G.__gmBackupRun) return G.__gmBackupRun;
  const run = new Promise<boolean>((resolve) => {
    let done = false;
    const end = (ok: boolean) => { if (!done) { done = true; clearTimeout(t); resolve(ok); } };
    const child = spawn(process.execPath, [path.join(cwd, 'deploy', 'backups.mjs'), 'snapshot', '--data', data], { cwd, stdio: ['ignore', 'inherit', 'inherit'] });
    const t = setTimeout(() => { console.error('backups: the snapshot took too long and was stopped'); child.kill('SIGKILL'); end(false); }, timeoutMs);
    t.unref?.();
    child.on('error', (e) => { console.error('backups: the snapshot could not start', String(e?.message ?? e).slice(0, 200)); end(false); });
    child.on('exit', (code) => end(code === 0));
  }).finally(() => { G.__gmBackupRun = null; });
  G.__gmBackupRun = run;
  return run;
}

/** Whether the job should take a snapshot now: none today yet, and either past the hour or the newest over a day old. */
export function snapshotDue(latest: string | null, now = Date.now(), hourUtc = Number(process.env.BACKUP_HOUR_UTC ?? 10)) {
  const today = utcDay(now);
  if (latest === today) return false;
  if (!latest) return true;
  const ageMs = now - Date.parse(`${latest}T00:00:00Z`);
  return new Date(now).getUTCHours() >= (Number.isFinite(hourUtc) ? hourUtc : 10) || ageMs > 2 * 86_400_000;
}

/** The nightly job (instrumentation-node.ts): looks every hour, first 5 minutes after boot. Idempotent. */
export function startNightlyBackups(data = path.join(process.cwd(), 'data')) {
  if (!backupsOn() || G.__gmBackupTimer) return;
  const tick = () => {
    try { if (snapshotDue(latestSnapshot(data)?.day ?? null)) void runSnapshot(data); } catch (e) { console.error('backups: the nightly look failed', String((e as Error)?.message ?? e).slice(0, 200)); }
  };
  const first = setTimeout(tick, 5 * 60_000); first.unref?.();
  const t = setInterval(tick, 3600_000); t.unref?.();
  G.__gmBackupTimer = t;
  console.log('backups: the nightly snapshot job is on (data/backups, docs/DEPLOY-RENDER.md)');
}

/* ------------------------------------------------------------ the bundle -- */
// a ustar header for one regular file (names are short: snapshot/<file> and blobs/<xx>/<sha256>.<ext>)
function header(name: string, bytes: number, mtime: number) {
  const h = Buffer.alloc(512);
  const put = (s: string, o: number, l: number) => h.write(s.slice(0, l), o, l, 'utf8');
  const oct = (n: number, l: number) => n.toString(8).padStart(l - 1, '0') + '\0';
  if (Buffer.byteLength(name) > 100) throw new Error(`backup: a name too long for the bundle (${name})`);
  put(name, 0, 100); put(oct(0o644, 8), 100, 8); put(oct(0, 8), 108, 8); put(oct(0, 8), 116, 8);
  put(oct(bytes, 12), 124, 12); put(oct(Math.floor(mtime / 1000), 12), 136, 12);
  h.fill(32, 148, 156); put('0', 156, 1); put('ustar\0', 257, 6); put('00', 263, 2);
  let sum = 0; for (const b of h) sum += b;
  put(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8);
  return h;
}

/** The files a bundle of `snap` holds: the snapshot's own, and the blobs on the disk; the blobs it lists that are gone. */
export function bundleFiles(data: string, snap: Snapshot) {
  const files: { name: string; path: string; bytes: number }[] = [];
  for (const f of readdirSync(snap.dir).filter((f) => SNAP_NAME.test(f)).sort()) {
    const p = path.join(snap.dir, f);
    files.push({ name: `snapshot/${f}`, path: p, bytes: statSync(p).size });
  }
  const missing: string[] = [];
  for (const b of snap.manifest.blobs) {
    if (!BLOB.test(b.hash) || !EXT.test(b.ext)) continue;
    const p = path.join(data, 'storykit', 'blobs', b.hash.slice(0, 2), `${b.hash}.${b.ext}`);
    let bytes = -1; try { const st = statSync(p); if (st.isFile()) bytes = st.size; } catch { /* gone */ }
    if (bytes < 0) { missing.push(`${b.hash}.${b.ext}`); continue; }
    files.push({ name: `blobs/${b.hash.slice(0, 2)}/${b.hash}.${b.ext}`, path: p, bytes });
  }
  return { files, missing };
}

/** The bundle as a gzipped tar stream, read from the disk as it goes (a multi-GB store is never held in memory). */
export function bundleStream(files: { name: string; path: string; bytes: number }[]): ReadableStream<Uint8Array> {
  async function* tar() {
    for (const f of files) {
      yield header(f.name, f.bytes, Date.now());
      let n = 0;
      for await (const c of createReadStream(f.path, { start: 0, end: Math.max(0, f.bytes - 1) })) {
        const b = c as Buffer;
        const keep = b.subarray(0, Math.max(0, f.bytes - n));
        n += keep.length;
        if (keep.length) yield keep;
        if (n >= f.bytes) break;
      }
      if (n !== f.bytes) throw new Error(`backup: ${f.name} changed size while it was read`);
      const pad = (512 - (f.bytes % 512)) % 512;
      if (pad) yield Buffer.alloc(pad);
    }
    yield Buffer.alloc(1024);
  }
  return Readable.toWeb(Readable.from(tar()).pipe(createGzip({ level: 6 }))) as unknown as ReadableStream<Uint8Array>;
}
