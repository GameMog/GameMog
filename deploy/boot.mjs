/**
 * Runs before `next start` on the server. A fresh persistent disk is empty and
 * the worlds live in the database, so the first boot copies in the snapshot
 * shipped with the code (deploy/seed.db.gz, made by `npm run deploy:snapshot`).
 * After that the disk's own copy is the live one and this leaves it alone.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { migrate } from './migrate.mjs';
import { interruptBuilds } from './builds.mjs';

const DB = 'data/gamemog.db', SEED = 'deploy/seed.db.gz';
mkdirSync('data', { recursive: true });
// the Hometown tile store (lib/hometown-tiles/store.ts): its own folder on the disk, empty until towns are uploaded
mkdirSync('data/hometown', { recursive: true });
if (existsSync(DB)) {
  console.log(`boot: keeping ${DB} from the disk`);
} else {
  writeFileSync(`${DB}.seeding`, gunzipSync(readFileSync(SEED)));
  renameSync(`${DB}.seeding`, DB);
  console.log(`boot: seeded ${DB} from ${SEED}`);
}

// what has changed in the published content since (deploy/migrate.mjs)
await migrate(DB);

// the builds the last server was running when it stopped are 'interrupted' (deploy/builds.mjs)
const interrupted = interruptBuilds(DB);
if (interrupted) console.log(`boot: ${interrupted} build${interrupted === 1 ? '' : 's'} the last server was running marked interrupted`);

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
