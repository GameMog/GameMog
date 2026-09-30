/**
 * Runs before `next start` on the server. A fresh persistent disk is empty and
 * the worlds live in the database, so the first boot copies in the snapshot
 * shipped with the code (deploy/seed.db.gz, made by `npm run deploy:snapshot`).
 * After that the disk's own copy is the live one and this leaves it alone.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const DB = 'data/gamemog.db', SEED = 'deploy/seed.db.gz';
mkdirSync('data', { recursive: true });
if (existsSync(DB)) {
  console.log(`boot: keeping ${DB} from the disk`);
} else {
  writeFileSync(`${DB}.seeding`, gunzipSync(readFileSync(SEED)));
  renameSync(`${DB}.seeding`, DB);
  console.log(`boot: seeded ${DB} from ${SEED}`);
}
