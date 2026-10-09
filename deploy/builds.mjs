/**
 * The builds a server was running when it stopped (the owner's safety limits, 9 Oct; lib/build-limits.ts). A build
 * is one long request, so a deploy or a crash stops every build in flight, and its row in generations stays
 * 'running'. deploy/boot.mjs runs this before every start, when no build can be running: each such row is marked
 * 'interrupted', with what its passes had spent so far kept (lib/db.ts). A database from before the build log has no
 * status column, and nothing to mark.
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';

export function interruptBuilds(path = 'data/gamemog.db') {
  if (!existsSync(path)) return 0;
  const db = new DatabaseSync(path);
  try {
    const cols = db.prepare('PRAGMA table_info(generations)').all().map((c) => c.name);
    if (!cols.includes('status')) return 0;
    return Number(db.prepare("UPDATE generations SET status = 'interrupted' WHERE status = 'running'").run().changes);
  } finally { db.close(); }
}
