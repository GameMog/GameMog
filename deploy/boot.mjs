/**
 * Runs before `next start` on the server. A fresh persistent disk is empty and
 * the worlds live in the database, so the first boot copies in the snapshot
 * shipped with the code (deploy/seed.db.gz, made by `npm run deploy:snapshot`).
 * After that the disk's own copy is the live one and this leaves it alone.
 * A catalog missing from a disk that holds other data (the Story Kit store, the
 * town queue, nightly snapshots) was lost, not new: the newest snapshot is
 * restored, loudly, never the seed silently (deploy/backups.mjs ensureCatalog).
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { migrate } from './migrate.mjs';
import { interruptBuilds } from './builds.mjs';
import { ensureCatalog } from './backups.mjs';
import { keepPublishedStoryDrafts } from './reconcile.mjs';

const DB = 'data/gamemog.db', SEED = 'deploy/seed.db.gz';
mkdirSync('data', { recursive: true });
// (before anything below creates a folder on the disk: an empty disk is told from a lost database by what it holds)
ensureCatalog('data', SEED);
// the Hometown tile store (lib/hometown-tiles/store.ts): its own folder on the disk, empty until towns are uploaded
mkdirSync('data/hometown', { recursive: true });

// what has changed in the published content since (deploy/migrate.mjs)
await migrate(DB);

// the builds the last server was running when it stopped are 'interrupted' (deploy/builds.mjs)
const interrupted = interruptBuilds(DB);
if (interrupted) console.log(`boot: ${interrupted} build${interrupted === 1 ? '' : 's'} the last server was running marked interrupted`);

// a published story game whose store draft is not kept (a publish cut short before 16 Nov's keep-first order): kept
// now, so the store's sweep never takes the world a listed game plays (deploy/reconcile.mjs; /admin lists the rest)
try { keepPublishedStoryDrafts('data'); } catch (e) { console.error(`boot: the story reconcile failed: ${String(e?.message ?? e).slice(0, 300)}`); }

// The production town builder's queue (lib/hometown-build/queue.ts): created here so its tables exist before the first
// request. Its jobs are NOT marked interrupted on a restart: leases cover that (a job whose worker lost the web just
// expires after 60 s and is claimed again; workers keep a finished result and retry for up to 10 minutes).
{
  const { DatabaseSync } = await import('node:sqlite');
  const q = new DatabaseSync('data/hometown/queue.db');
  q.exec('PRAGMA journal_mode = WAL;');
  q.close();
}

// The in-process builder's town jobs (lib/hometown/towns.ts, HOMETOWN_TOWNS=on, local development only): the ones the
// last server was running are interrupted, so a re-ask builds the town again. Its bundles (data/towns/bundles) stay
// where they are and readable at their old addresses (/towns/{place}/{build}/{tileSetHash}/...); the production
// builder's bundles live in the store (data/hometown/bundles/...), so nothing moves.
const TOWN_JOBS = 'data/towns/jobs', ACTIVE = new Set(['queued', 'reading', 'fetching', 'compiling', 'assembling']);
let towns = 0;
if (existsSync(TOWN_JOBS)) for (const f of readdirSync(TOWN_JOBS)) {
  if (!f.endsWith('.json')) continue;
  try {
    const j = JSON.parse(readFileSync(`${TOWN_JOBS}/${f}`, 'utf8'));
    if (ACTIVE.has(j.state)) { j.state = 'interrupted'; j.endedAt = Date.now(); writeFileSync(`${TOWN_JOBS}/${f}`, JSON.stringify(j, null, 1) + '\n'); towns++; }
  } catch { /* a job file that cannot be read is left alone */ }
}
if (towns) console.log(`boot: ${towns} town build${towns === 1 ? '' : 's'} the last server was running marked interrupted`);
