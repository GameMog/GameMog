/**
 * Runs before `next start` on the server. A fresh persistent disk is empty and
 * the worlds live in the database, so the first boot copies in the snapshot
 * shipped with the code (deploy/seed.db.gz, made by `npm run deploy:snapshot`).
 * After that the disk's own copy is the live one and this leaves it alone.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { migrate } from './migrate.mjs';
import { interruptBuilds } from './builds.mjs';

const DB = 'data/gamemog.db', SEED = 'deploy/seed.db.gz';
mkdirSync('data', { recursive: true });
if (existsSync(DB)) {
  console.log(`boot: keeping ${DB} from the disk`);
} else {
  writeFileSync(`${DB}.seeding`, gunzipSync(readFileSync(SEED)));
  renameSync(`${DB}.seeding`, DB);
  console.log(`boot: seeded ${DB} from ${SEED}`);
}

// what has changed in the published content since (deploy/migrate.mjs)
migrate(DB);

// the builds the last server was running when it stopped are 'interrupted' (deploy/builds.mjs)
const interrupted = interruptBuilds(DB);
if (interrupted) console.log(`boot: ${interrupted} build${interrupted === 1 ? '' : 's'} the last server was running marked interrupted`);
