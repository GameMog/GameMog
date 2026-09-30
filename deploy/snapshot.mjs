/**
 * Freezes data/gamemog.db into deploy/seed.db.gz, the copy a fresh server disk
 * starts from (deploy/boot.mjs). VACUUM INTO reads a consistent copy even
 * while the dev server is writing, WAL included. It only matters for a new
 * disk: a running server keeps its own database.
 */
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const dir = mkdtempSync(join(tmpdir(), 'gamemog-snapshot-')), out = join(dir, 'seed.db');
const live = new DatabaseSync('data/gamemog.db', { readOnly: true });
live.exec(`VACUUM INTO '${out}'`);
live.close();
const copy = new DatabaseSync(out, { readOnly: true });
const games = copy.prepare('SELECT COUNT(*) AS n FROM games').get().n;
copy.close();
const raw = readFileSync(out), gz = gzipSync(raw, { level: 9 });
writeFileSync('deploy/seed.db.gz', gz);
rmSync(dir, { recursive: true, force: true });
console.log(`deploy/seed.db.gz: ${games} games, ${(raw.length / 1e6).toFixed(1)} MB -> ${(gz.length / 1e6).toFixed(1)} MB`);
