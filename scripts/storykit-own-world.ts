/**
 * Story Kit: Mog City's own story as a published story world in this server's local store, the parent a Mog of Mog
 * City remixes (STORYKIT=on, a dev or review database; nothing here runs on a request).
 *
 *   node --import ./scripts/ts-resolve.mjs scripts/storykit-own-world.ts [pack] [--slug <slug>] [--cover <jpg>] [--remove]
 *
 * The pack (default storykit/packs/mog-city.json) is moved to Mog City's engine (gate.ts mogBase: mogcity-1, the same
 * city) and gated with { own: true }: the one pack whose title may be Mog City's (gate rule 11). That exemption is the
 * repo's own, so the store's open (which never passes it) is not used: the store draft is written here and kept with the
 * game, as publishing keeps a world (StoryStore.keep: sealed, never swept). Its people are the cast registry's shipped
 * models and every line is one of Mog City's recordings, so the world has no files of its own. The game is published as
 * a story world (format 'world', meta mode 'storykit' naming the kept store draft and its sealed world), creator Mog
 * City, with meta.storykit.own set; /mog/<slug> then remixes it like any story world. Run again, it says the world is
 * already there (same pack) or replaces it (--remove first). --remove takes the game, its draft and its store draft out.
 */
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { db, insertDraft, publishDraft } from '../lib/db.ts';
import { storyStore } from '../lib/storykit-store.ts';
import { gatePack, mogBase } from '../storykit/pack/gate.ts';
import { inheritance, storykitMeta, storykitModule } from '../lib/storykit-build.ts';

const args = process.argv.slice(2);
const opt = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const file = args.find((a, i) => !a.startsWith('--') && !['--slug', '--cover'].includes(args[i - 1] ?? '')) ?? 'storykit/packs/mog-city.json';
const slug = opt('--slug') ?? 'mog-city-story';
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

const raw = JSON.parse(readFileSync(join(process.cwd(), file), 'utf8'));
const pack0 = { ...raw, base: mogBase(raw.base) };
const g = gatePack(pack0, { own: true });
if (!g.ok || !g.pack) { console.error(JSON.stringify({ refused: g.problems }, null, 1)); process.exit(1); }
const pack = g.pack;
const packJson = JSON.stringify(pack);

const had = ownGames().find((x) => (JSON.parse(x.meta) as { storykit?: { packId?: string } }).storykit?.packId === pack.id);
if (had) {
  const store = (JSON.parse(had.meta) as { storykit?: { pack?: string } }).storykit?.pack;
  const row = store ? s.db.prepare('SELECT pack FROM drafts WHERE id = ?').get(store) as { pack: string } | undefined : undefined;
  console.log(JSON.stringify({ already: had.slug, store, samePack: row?.pack === packJson, hint: row?.pack === packJson ? null : 'the pack changed: --remove, then run again' }));
  process.exit(0);
}

// the store draft, written here (the store's open never passes { own }), then kept with the game below
const storeId = randomUUID(), t = Date.now();
s.db.prepare('INSERT INTO drafts (id, token_hash, pack, parent, created_at, touched_at) VALUES (?, ?, ?, NULL, ?, ?)')
  .run(storeId, createHash('sha256').update(randomBytes(24)).digest('hex'), packJson, t, t);

const meta = storykitMeta(pack, {
  tagline: pack.tagline || 'Fired, framed and filmed. Get the laptop back.',
  blurb: 'Mog City\'s own story: Dan is fired from JPBank, framed for its trades and robbed of the laptop that proves it. Get it back across Manhattan, with Jane on the car phone.',
  people: [], brands: [],
}, inheritance(pack, g.lines, null), storeId);
(meta.storykit as Record<string, unknown>).own = true;
const code = storykitModule(pack);
const draftId = randomUUID(), gameId = randomUUID();
const coverFile = opt('--cover');
const cover = coverFile && existsSync(coverFile) ? readFileSync(coverFile) : undefined;
insertDraft({ id: draftId, prompt: 'Mog City\'s own story', meta, code, cover, format: 'world',
  report: { ok: true, problems: [], advisories: [], levelReached: 0, kind: 'storykit', status: 'own', codeHash: createHash('sha256').update(code).digest('hex').slice(0, 16), warnings: g.warnings } });
if (cover) db.prepare('UPDATE drafts SET art_wide = ? WHERE id = ?').run(cover, draftId);
if (db.prepare('SELECT 1 FROM games WHERE slug = ?').get(slug)) { console.error(`/g/${slug} is taken`); process.exit(1); }
const sealed = s.seal(s.db.prepare('SELECT * FROM drafts WHERE id = ?').get(storeId) as Parameters<typeof s.seal>[0]);
if (!sealed.ok) { console.error(JSON.stringify(sealed)); process.exit(1); }
publishDraft(draftId, slug, gameId, undefined, { storykit: { ...meta.storykit, world: sealed.hash } }, { creator: 'Mog City', player: null });
s.keep(storeId, gameId);
const kept = s.db.prepare('SELECT state, world FROM drafts WHERE id = ?').get(storeId) as { state: string; world: string };
console.log(JSON.stringify({ slug, game: gameId, store: storeId, state: kept.state, world: kept.world, warnings: g.warnings, missions: meta.storykit.missions, base: pack.base }));
