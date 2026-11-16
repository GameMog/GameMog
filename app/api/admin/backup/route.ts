import path from 'node:path';
import { COOKIE, adminEnabled, validSession } from '../../../admin/session';
import { cookieValue } from '@/lib/storykit-switch';
import { bundleFiles, bundleStream, latestSnapshot, runSnapshot } from '@/lib/backups';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// a first snapshot may be taken before the download starts
export const maxDuration = 1800;

/**
 * The owner's off-disk copy of the live data (lib/backups.ts, docs/DEPLOY-RENDER.md "Backups and restore"):
 *   GET /api/admin/backup  -> gamemog-backup-<UTC date>.tar.gz: the newest nightly snapshot (data/backups/<date>/: the
 *                             catalog, the Story Kit store's database, the town queue, manifest.json) and every Story Kit
 *                             blob the published story worlds use (content-addressed, so a blob never changes). With no
 *                             snapshot on the disk yet, one is taken first (in its own process).
 * Owner only: 404 unless the request carries the owner's /admin session, like every other owner route. deploy/restore.mjs
 * puts a download back on a new disk.
 */
export async function GET(req: Request) {
  if (!adminEnabled() || !validSession(cookieValue(req.headers.get('cookie'), COOKIE))) return Response.json({ error: 'Not found.' }, { status: 404 });
  const data = path.resolve('data');
  let snap = latestSnapshot(data);
  if (!snap) { await runSnapshot(data); snap = latestSnapshot(data); }
  if (!snap) return Response.json({ error: 'No snapshot could be taken (the server log says why: the disk\'s free space, or no catalog).' }, { status: 503 });
  const { files, missing } = bundleFiles(data, snap);
  if (missing.length) console.error(`backups: ${missing.length} published story file(s) listed by the snapshot of ${snap.day} are not on the disk (first ${missing[0]})`);
  return new Response(bundleStream(files), {
    headers: {
      'content-type': 'application/gzip',
      'content-disposition': `attachment; filename="gamemog-backup-${snap.day}.tar.gz"`,
      'cache-control': 'no-store',
      'x-backup-day': snap.day,
      'x-backup-files': String(files.length),
      'x-backup-missing': String(missing.length),
    },
  });
}
