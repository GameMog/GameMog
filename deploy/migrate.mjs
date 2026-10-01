/**
 * Changes to the live database's content, made once each (deploy/boot.mjs runs
 * this before every start; on the Mac, `node deploy/migrate.mjs`). The server's
 * database lives on its own disk, so a change to what is published travels as
 * a migration: an id, and what it does. Each one is recorded and never rerun,
 * and each is written to be harmless if what it changes is already changed.
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'deploy/migrations';
const file = (name) => { const p = join(DIR, name); return existsSync(p) ? readFileSync(p) : null; };

const MIGRATIONS = [
  {
    // the owner, 1 Oct: "IP fixes, just do Mario Kart to Mog Kart, that is all"
    id: '2026-10-01-mog-kart',
    run(db) {
      const g = db.prepare("SELECT id FROM games WHERE slug IN ('mariomog-canyon-gp', 'mog-kart-canyon-gp')").get();
      if (!g) return 'no such game';
      const swap = (s) => s == null ? s : s.replace(/MarioMog Canyon GP/g, 'Mog Kart Canyon GP').replace(/Mario ?kart/gi, 'Mog Kart').replace(/MarioMog/g, 'Mog');
      const r = db.prepare('SELECT title, tagline, blurb, meta, prompt, code, spec FROM games WHERE id = ?').get(g.id);
      db.prepare('UPDATE games SET slug = ?, title = ?, tagline = ?, blurb = ?, meta = ?, prompt = ?, code = ?, spec = ? WHERE id = ?')
        .run('mog-kart-canyon-gp', swap(r.title), swap(r.tagline), swap(r.blurb), swap(r.meta), swap(r.prompt), swap(r.code), swap(r.spec), g.id);
      // the key art carries the title in the picture: the new one, shot on the Mac
      const wide = file('mog-kart-canyon-gp-wide.jpg'), icon = file('mog-kart-canyon-gp-icon.jpg');
      if (wide && icon) db.prepare('UPDATE games SET art_wide = ?, art_icon = ? WHERE id = ?').run(wide, icon, g.id);
      return `renamed${wide && icon ? ', new key art' : ''}`;
    },
  },
];

export function migrate(path = 'data/gamemog.db') {
  if (!existsSync(path)) return;
  const db = new DatabaseSync(path);
  db.exec('CREATE TABLE IF NOT EXISTS migrations (id TEXT PRIMARY KEY, at INTEGER NOT NULL, note TEXT)');
  const done = new Set(db.prepare('SELECT id FROM migrations').all().map((r) => r.id));
  for (const m of MIGRATIONS) {
    if (done.has(m.id)) continue;
    try {
      db.exec('BEGIN');
      const note = m.run(db) ?? '';
      db.prepare('INSERT INTO migrations (id, at, note) VALUES (?, ?, ?)').run(m.id, Date.now(), String(note));
      db.exec('COMMIT');
      console.log(`migrate: ${m.id} (${note})`);
    } catch (e) {
      db.exec('ROLLBACK');
      console.error(`migrate: ${m.id} failed: ${e.message}`);
    }
  }
  db.close();
}

if (import.meta.url === `file://${process.argv[1]}`) migrate(process.argv[2]);
