/**
 * /g/the-long-way-home titled "Long Way" (deploy/migrate.mjs 2026-11-16-long-way-home-title; the owner, 16 Nov: the
 * three-line lockup covered the red car). Part of `npm run check`. On a fresh copy of deploy/seed.db.gz in a temporary
 * folder (its Story Kit store beside it), the world seeded as it is live: a plain cover, titled key art (wide and
 * square), the plain square in its store draft. After the migration: title "Long Way", art_wide the cover (so the cover
 * route's titleStoryArt titles it once), art_icon the store's plain square (never the titled one), and the lockup sets
 * "Long Way" over them. Run again, or on a world already renamed, it leaves it alone; with no square in the store the
 * icon is cut from the cover. Nothing touches data/.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { StoryStore } from '../lib/storykit-store.ts';
import { storyKeyArt } from '../lib/story-art.ts';

type Ok = (name: string, cond: boolean, detail?: string) => void;
type Migration = { id: string; async?: boolean; run: (db: unknown, p: string) => unknown };
const ID = '2026-11-16-long-way-home-title';

export async function runLongWayHomeChecks(ok: Ok) {
  console.log('\n/g/the-long-way-home titled Long Way (deploy/migrate.mjs ' + ID + ')');
  const { MIGRATIONS } = await import('../deploy/migrate.mjs') as { MIGRATIONS: Migration[] };
  const M = MIGRATIONS.find((m) => m.id === ID);
  ok('the rename is a migration', !!M && !M.async);
  if (!M) return;
  const dir = mkdtempSync(path.join(tmpdir(), 'long-way-home-')), p = path.join(dir, 'gamemog.db');
  const run = (d: DatabaseSync) => { d.exec('BEGIN'); try { const n = String(M.run(d, p)); d.exec('COMMIT'); return n; } catch (e) { d.exec('ROLLBACK'); return `threw: ${(e as Error).message}`; } };
  const jpg = (w: number, h: number, r: number) => sharp({ create: { width: w, height: h, channels: 3, background: { r, g: 60, b: 50 } } }).jpeg({ quality: 80 }).toBuffer();
  try {
    writeFileSync(p, gunzipSync(readFileSync('deploy/seed.db.gz')));
    const db = new DatabaseSync(p);
    const store = new StoryStore(path.join(dir, 'storykit'));
    const [cover, wideT, iconT, square] = await Promise.all([jpg(1280, 720, 200), jpg(1280, 720, 90), jpg(512, 512, 91), jpg(512, 512, 210)]);
    // the store draft with its plain square (as a publish leaves it: art/key-square.jpg)
    const storeId = randomUUID(), t = Date.now(), h = createHash('sha256').update(square).digest('hex');
    store.db.prepare("INSERT INTO drafts (id, token_hash, pack, parent, state, created_at, touched_at) VALUES (?, 'x', '{}', NULL, 'kept', ?, ?)").run(storeId, t, t);
    mkdirSync(path.dirname(store.blobPath(h, 'jpg')), { recursive: true });
    writeFileSync(store.blobPath(h, 'jpg'), square);
    store.db.prepare('INSERT INTO blobs (hash, ext, bytes, at) VALUES (?, ?, ?, ?)').run(h, 'jpg', square.length, t);
    store.db.prepare("INSERT INTO files (draft_id, kind, name, hash, ext, bytes, at) VALUES (?, 'art', 'key-square.jpg', ?, 'jpg', ?, ?)").run(storeId, h, square.length, t);
    store.db.close();
    const meta = JSON.stringify({ mode: 'storykit', storykit: { pack: storeId, world: 'a'.repeat(64), city: 'hometown' } });
    const seed = (slug: string, title: string, m = meta) => db.prepare(`INSERT INTO games (id, slug, title, tagline, blurb, difficulty, spec, created_at, meta, cover, art_wide, art_icon)
      VALUES (?, ?, ?, '', '', 'normal', '{}', ?, ?, ?, ?, ?)`).run(randomUUID(), slug, title, t, m, cover, wideT, iconT);
    const row = (slug = 'the-long-way-home') => db.prepare('SELECT title, cover, art_wide, art_icon, meta FROM games WHERE slug = ?').get(slug) as any;
    const same = (a: Uint8Array | null, b: Uint8Array) => !!a && Buffer.from(a).equals(b);

    ok('with no such world it leaves the database alone', /^left alone/.test(run(db)));
    seed('the-long-way-home', 'The Long Way Home');
    const note = run(db), r = row();
    ok('it renames the world Long Way, its slug kept', r?.title === 'Long Way', note);
    ok('... its key art goes back to the plain frame (art_wide the cover: titleStoryArt titles it, once)', same(r.art_wide, cover) && same(r.cover, cover));
    ok('... its icon is the store\'s plain square, never the titled icon', same(r.art_icon, square) && !same(r.art_icon, iconT), note);
    ok('... the world\'s meta (its sealed story) is untouched', r.meta === meta);
    const art = await storyKeyArt({ wide: r.cover, square: r.art_icon }, r.title, 'Kensington, Kansas');
    ok('... and the lockup sets Long Way over the plain frames', !!art && art.wide.length > 1000 && art.icon.length > 1000);
    db.prepare('UPDATE games SET art_wide = ?, art_icon = ? WHERE slug = ?').run(wideT, iconT, 'the-long-way-home');
    const again = run(db), r2 = row();
    ok('run again (the world renamed and titled) it is left alone', /^left alone/.test(again) && same(r2.art_wide, wideT) && same(r2.art_icon, iconT), again);

    // no square in the store: the icon is cut from the cover, as storyKeyArt does with none
    db.prepare("DELETE FROM games WHERE slug = 'the-long-way-home'").run();
    seed('the-long-way-home', 'The Long Way Home', JSON.stringify({ mode: 'storykit', storykit: { pack: randomUUID(), world: 'a'.repeat(64) } }));
    const n3 = run(db), r3 = row();
    ok('with no plain square in the store the icon is left for the cover to give (none, never the titled one)', r3.title === 'Long Way' && same(r3.art_wide, cover) && r3.art_icon === null, n3);
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
