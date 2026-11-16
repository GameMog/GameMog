/**
 * The story reconcile at boot (16 Nov, deploy/boot.mjs): a published story game whose Story Kit store draft is not kept
 * (a publish cut short after the catalog commit and before the keep, which the publish route did in that order until 16
 * Nov) would lose its world to the store's sweep a day later. Every such draft is kept now, with its game, and logged.
 * One whose sealed world is gone too (an upload that landed on it) is kept as well, so its files stay, and said so: the
 * owner's /admin (lib/storykit-publish.ts storyReconcile) lists it to patch or publish again. Plain SQL on both
 * databases, so it runs before the server; nothing happens without both.
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import path from 'node:path';

const STORE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** The store draft a game's meta names (lib/storykit-publish.ts storeDraftOf), or null. */
export function storeDraftOf(meta) {
  try { const m = JSON.parse(meta ?? '{}'); return m.mode === 'storykit' && typeof m.storykit?.pack === 'string' && STORE_ID.test(m.storykit.pack) ? m.storykit.pack : null; } catch { return null; }
}

/**
 * Keep every unkept store draft a published story game names. Returns the drafts kept: { storeId, gameId, slug, world }.
 * (`files`: other places for the two databases, for the checks.)
 */
export function keepPublishedStoryDrafts(data, log = console, files = {}) {
  const catalog = files.catalog ?? path.join(data, 'gamemog.db'), store = files.store ?? path.join(data, 'storykit', 'store.db');
  if (!existsSync(catalog) || !existsSync(store)) return [];
  const g = new DatabaseSync(catalog, { readOnly: true }), s = new DatabaseSync(store);
  const kept = [];
  try {
    s.exec('PRAGMA busy_timeout = 5000');
    const games = g.prepare("SELECT id, slug, meta FROM games WHERE meta LIKE '%storykit%'").all();
    for (const game of games) {
      const storeId = storeDraftOf(game.meta); if (!storeId) continue;
      const d = s.prepare('SELECT state, world FROM drafts WHERE id = ?').get(storeId);
      if (!d || d.state === 'kept') continue;
      if (s.prepare("UPDATE drafts SET state = 'kept', game_id = ? WHERE id = ? AND state != 'kept'").run(game.id, storeId).changes) {
        kept.push({ storeId, gameId: game.id, slug: game.slug, world: d.world });
        log.log(`boot: story draft ${storeId} of /g/${game.slug} was ${d.state}, not kept: kept now${d.world ? '' : ' (its sealed world is gone: /admin lists it to patch or publish again)'}`);
      }
    }
  } finally { g.close(); s.close(); }
  return kept;
}
