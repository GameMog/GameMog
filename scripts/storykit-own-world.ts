/**
 * Story Kit: Mog City's own story as a published story world, the parent a Mog of /g/mog-city remixes (5 Nov;
 * lib/storykit-mogcity.ts). Production gets it from deploy/migrate.mjs (2026-11-05-mog-city-own-story), which reads the
 * record this script writes; on a dev or review database this script publishes it directly (STORYKIT=on or owner).
 *
 *   node --import ./scripts/ts-resolve.mjs scripts/storykit-own-world.ts [pack] [--slug <slug>] [--cover <jpg>] [--remove]
 *   node --import ./scripts/ts-resolve.mjs scripts/storykit-own-world.ts --export      (writes deploy/migrations/mog-city-story.json)
 *
 * The pack (default storykit/packs/mog-city.json) is moved to Mog City's engine (gate.ts mogBase: mogcity-1, the same
 * city) and gated with { own: true }: the one pack whose title may be Mog City's (gate rule 11). That exemption is the
 * repo's own, so the store's open (which never passes it) is not used: the store draft is written here and kept with the
 * game, as publishing keeps a world (StoryStore.keep: sealed, never swept). Its people are the cast registry's shipped
 * models and every line is one of Mog City's recordings, so the world has no files of its own. The game is published as
 * a story world (format 'world', meta mode 'storykit' naming the kept store draft and its sealed world), creator Mog
 * City, with meta.storykit.own set and meta.storykit.ownOf the /g/mog-city episode's id, HIDDEN (no public page of its
 * own: in no list, feed, search or sitemap); /mog/mog-city remixes it (app/api/generate/route.ts). Run again, it says the
 * world is already there (same pack) or replaces it (--remove first). --remove takes the game, its draft and its store
 * draft out.
 */
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { gatePack, mogBase } from '../storykit/pack/gate.ts';
import { inheritance, storykitMeta, storykitModule } from '../lib/storykit-build.ts';

/** Where deploy/migrate.mjs reads the own world from. */
export const OWN_RECORD = 'deploy/migrations/mog-city-story.json';
export const OWN_SLUG = 'mog-city-story';

/**
 * The own world as the migration publishes it: the gated pack (on Mog City's engine), the game's meta (its store draft
 * and sealed world filled in at publish) and its module. Throws when the pack does not pass the gate.
 */
export function ownWorld(file = 'storykit/packs/mog-city.json') {
  const raw = JSON.parse(readFileSync(join(process.cwd(), file), 'utf8'));
  const g = gatePack({ ...raw, base: mogBase(raw.base) }, { own: true });
  if (!g.ok || !g.pack) throw new Error(`the own pack is refused: ${g.problems.join(' | ')}`);
  const pack = g.pack;
  const meta = storykitMeta(pack, {
    tagline: pack.tagline || 'Fired, framed and filmed. Get the laptop back.',
    blurb: 'Mog City\'s own story: Dan is fired from JPBank, framed for its trades and robbed of the laptop that proves it. Get it back across Manhattan, with Jane on the car phone.',
    people: [], brands: [],
  }, inheritance(pack, g.lines, null), '');
  (meta.storykit as Record<string, unknown>).own = true;
  return { pack, meta, code: storykitModule(pack), warnings: g.warnings };
}
/** The record deploy/migrate.mjs reads (the module is not stored: it is `GameMog.world({ storykit: <pack> });`). */
export const ownRecord = (file?: string) => { const w = ownWorld(file); return JSON.stringify({ v: 1, slug: OWN_SLUG, pack: w.pack, meta: w.meta }) + '\n'; };

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  if (args.includes('--export')) {
    writeFileSync(OWN_RECORD, ownRecord());
    console.log(`wrote ${OWN_RECORD}`);
    process.exit(0);
  }
  const { db, insertDraft, publishDraft } = await import('../lib/db.ts');
  const { storyStore } = await import('../lib/storykit-store.ts');
  const opt = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
  const file = args.find((a, i) => !a.startsWith('--') && !['--slug', '--cover'].includes(args[i - 1] ?? '')) ?? 'storykit/packs/mog-city.json';
  const slug = opt('--slug') ?? OWN_SLUG;
  const remove = args.includes('--remove');
  const s = storyStore();

  const ownGames = () => db.prepare("SELECT id, slug, meta FROM games WHERE json_extract(meta, '$.mode') = 'storykit' AND json_extract(meta, '$.storykit.own') = 1").all() as { id: string; slug: string; meta: string }[];
  if (remove) {
    const out: string[] = [];
    for (const g of ownGames()) {
      const store = (JSON.parse(g.meta) as { storykit?: { pack?: string } }).storykit?.pack;
      for (const t of ['plays', 'scores', 'votes', 'favorites']) { try { db.prepare(`DELETE FROM ${t} WHERE game_id = ?`).run(g.id); } catch { /* no such table */ } }
      db.prepare('DELETE FROM drafts WHERE published_id = ?').run(g.id);
      db.prepare('DELETE FROM games WHERE id = ?').run(g.id);
      if (store) { s.release(store); const row = s.db.prepare('SELECT * FROM drafts WHERE id = ?').get(store) as Parameters<typeof s.abandon>[0] | undefined; if (row) s.abandon(row); }
      out.push(g.slug);
    }
    console.log(JSON.stringify({ removed: out }));
    process.exit(0);
  }

  let w: ReturnType<typeof ownWorld>;
  try { w = ownWorld(file); } catch (e) { console.error((e as Error).message); process.exit(1); }
  const { pack, meta, code } = w;
  const packJson = JSON.stringify(pack);
  const episode = db.prepare("SELECT id FROM games WHERE slug = 'mog-city'").get() as { id: string } | undefined;

  const had = ownGames().find((x) => (JSON.parse(x.meta) as { storykit?: { packId?: string } }).storykit?.packId === pack.id);
  if (had) {
    const store = (JSON.parse(had.meta) as { storykit?: { pack?: string } }).storykit?.pack;
    const row = store ? s.db.prepare('SELECT pack FROM drafts WHERE id = ?').get(store) as { pack: string } | undefined : undefined;
    // (a world published before 5 Nov: linked to the episode and hidden, as the migration publishes it)
    if (episode) db.prepare("UPDATE games SET hidden = 1, meta = json_set(meta, '$.storykit.ownOf', ?) WHERE id = ?").run(episode.id, had.id);
    console.log(JSON.stringify({ already: had.slug, store, samePack: row?.pack === packJson, linked: episode?.id ?? null, hint: row?.pack === packJson ? null : 'the pack changed: --remove, then run again' }));
    process.exit(0);
  }

  // the store draft, written here (the store's open never passes { own }), then kept with the game below
  const storeId = randomUUID(), t = Date.now();
  s.db.prepare('INSERT INTO drafts (id, token_hash, pack, parent, created_at, touched_at) VALUES (?, ?, ?, NULL, ?, ?)')
    .run(storeId, createHash('sha256').update(randomBytes(24)).digest('hex'), packJson, t, t);
  (meta.storykit as Record<string, unknown>).pack = storeId;
  if (episode) (meta.storykit as Record<string, unknown>).ownOf = episode.id;
  const draftId = randomUUID(), gameId = randomUUID();
  const coverFile = opt('--cover');
  const cover = coverFile && existsSync(coverFile) ? readFileSync(coverFile) : undefined;
  insertDraft({ id: draftId, prompt: 'Mog City\'s own story', meta, code, cover, format: 'world',
    report: { ok: true, problems: [], advisories: [], levelReached: 0, kind: 'storykit', status: 'own', codeHash: createHash('sha256').update(code).digest('hex').slice(0, 16), warnings: w.warnings } });
  if (cover) db.prepare('UPDATE drafts SET art_wide = ? WHERE id = ?').run(cover, draftId);
  if (db.prepare('SELECT 1 FROM games WHERE slug = ?').get(slug)) { console.error(`/g/${slug} is taken`); process.exit(1); }
  const sealed = s.seal(s.db.prepare('SELECT * FROM drafts WHERE id = ?').get(storeId) as Parameters<typeof s.seal>[0]);
  if (!sealed.ok) { console.error(JSON.stringify(sealed)); process.exit(1); }
  publishDraft(draftId, slug, gameId, undefined, { storykit: { ...meta.storykit, world: sealed.hash } }, { creator: 'Mog City', player: null });
  db.prepare('UPDATE games SET hidden = 1 WHERE id = ?').run(gameId);
  s.keep(storeId, gameId);
  const kept = s.db.prepare('SELECT state, world FROM drafts WHERE id = ?').get(storeId) as { state: string; world: string };
  console.log(JSON.stringify({ slug, game: gameId, store: storeId, state: kept.state, world: kept.world, hidden: true, ownOf: episode?.id ?? null, warnings: w.warnings, missions: meta.storykit.missions, base: pack.base }));
}
