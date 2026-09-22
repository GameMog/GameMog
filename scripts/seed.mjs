/** Seeds the featured game. Idempotent. */
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

const { DatabaseSync } = await import('node:sqlite');
const { mkdirSync } = await import('node:fs');
const { join } = await import('node:path');

// the preset is TypeScript; read the values through a tiny transpile-free shim
const specModule = await import('./muse-sprint.data.mjs');
const MUSE_SPRINT = specModule.MUSE_SPRINT;

mkdirSync(join(process.cwd(), 'data'), { recursive: true });
const db = new DatabaseSync(join(process.cwd(), 'data/gamemog.db'));
db.exec('PRAGMA journal_mode = WAL');
db.exec(`CREATE TABLE IF NOT EXISTS games (
  id TEXT PRIMARY KEY, slug TEXT UNIQUE NOT NULL, title TEXT NOT NULL, tagline TEXT NOT NULL,
  blurb TEXT NOT NULL, difficulty TEXT NOT NULL, spec TEXT NOT NULL, prompt TEXT,
  featured INTEGER NOT NULL DEFAULT 0, plays INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)`);
db.exec(`CREATE TABLE IF NOT EXISTS scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT, game_id TEXT NOT NULL, player TEXT NOT NULL,
  time_ms INTEGER NOT NULL, place INTEGER NOT NULL, tempo_reached INTEGER NOT NULL,
  locks INTEGER NOT NULL, best_streak INTEGER NOT NULL, created_at INTEGER NOT NULL)`);
db.exec(`CREATE TABLE IF NOT EXISTS generations (
  id INTEGER PRIMARY KEY AUTOINCREMENT, game_id TEXT, prompt TEXT NOT NULL, model TEXT NOT NULL,
  attempts INTEGER NOT NULL, ok INTEGER NOT NULL, findings TEXT NOT NULL, ms INTEGER NOT NULL,
  created_at INTEGER NOT NULL)`);

const existing = db.prepare('SELECT id FROM games WHERE slug = ?').get('muse-sprint');
if (existing) {
  db.prepare('UPDATE games SET spec = ?, featured = 1 WHERE slug = ?').run(JSON.stringify(MUSE_SPRINT), 'muse-sprint');
  console.log('muse-sprint refreshed');
} else {
  db.prepare(
    `INSERT INTO games (id, slug, title, tagline, blurb, difficulty, spec, prompt, featured, created_at)
     VALUES (?,?,?,?,?,?,?,?,1,?)`
  ).run(
    'muse-sprint-0000', 'muse-sprint', MUSE_SPRINT.meta.title, MUSE_SPRINT.meta.tagline,
    MUSE_SPRINT.meta.blurb, MUSE_SPRINT.difficulty, JSON.stringify(MUSE_SPRINT), null, Date.now()
  );
  console.log('muse-sprint seeded');
}
void register; void pathToFileURL;
