import { createHash } from 'node:crypto';
import { db, type DraftRow } from './db';
import { codeHash } from './test-drive';
import { storykitPublic } from './storykit-switch';
import { storyStore } from './storykit-store';
import { MC_PROD, mcOrigin } from './episode';

/**
 * A Story Kit world from its draft to its game (STORYKIT=on): what the creator's browser reports after its work, what
 * publishing does with the world's store draft, and where a story world plays.
 *
 *   the browser's report   public/storykit/work.js, after it forged, voiced, test-drove and framed the world, posts
 *                          { missions, errors } (POST /api/storykit/drafts/<id>/report, with the store draft's token).
 *                          The GameMog draft whose meta names that store draft gets the drive in its report: passed
 *                          only when every mission of the pack passed with 0 page errors (else failed), for its exact
 *                          code (codeHash), as a world's test drive is. The store's key art (art/key-wide, key-square)
 *                          becomes the draft's cover, so the draft and the game show it as every world's.
 *   publishing             app/api/games/route.ts: the store draft is sealed and kept (never swept), and the game's meta
 *                          names the sealed world (storykit.world, its SHA-256): what /g/<slug>/play plays.
 *   playing                a story world plays on Mog City's engine (the owner, 4 Nov: every Story Kit world runs on
 *                          Mog City's engine and look): its frame is mc.gamemog.com/?pack=<the sealed world's URL on
 *                          this site>&host=<this site>&game=<id> (storyFrameSrc). Mog City reads only a content-
 *                          addressed world (/storykit/f/<sha256>.json, checked against its name) from gamemog.com, so a
 *                          draft is sealed before it plays (playableWorld). Outside production a local Mog City may
 *                          stand in (STORYKIT_MC_ORIGIN, else EPISODE_MC_ORIGIN; localhost only: storykitMc), reading
 *                          the world from this dev server. The world's files are served to Mog City with CORS
 *                          (lib/storykit-http.ts storyCors).
 */

const STORE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
type StoryMeta = { mode?: string; storykit?: { city?: string; pack?: string; world?: string; packId?: string } };
const metaOf = (meta?: string | null): StoryMeta => { try { return JSON.parse(meta ?? '{}') as StoryMeta; } catch { return {}; } };

/** The store draft a game or draft's meta names (storykit.pack), or null for anything that is not a story world. */
export function storeDraftOf(meta?: string | null): string | null {
  const m = metaOf(meta);
  return m.mode === 'storykit' && typeof m.storykit?.pack === 'string' && STORE_ID.test(m.storykit.pack) ? m.storykit.pack : null;
}
/** A published story world's sealed world (its SHA-256), or null. */
export function sealedWorldOf(meta?: string | null): string | null {
  const m = metaOf(meta);
  return m.mode === 'storykit' && typeof m.storykit?.world === 'string' && /^[0-9a-f]{64}$/.test(m.storykit.world) ? m.storykit.world : null;
}
const DEV_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1):\d{2,5}$/;
/**
 * Where Story Kit worlds play: Mog City (https://mc.gamemog.com). Outside production a local Mog City may stand in, a
 * localhost origin in STORYKIT_MC_ORIGIN (the Story Kit runtime's worktree on its own port), else the episodes' own
 * EPISODE_MC_ORIGIN (lib/episode.ts mcOrigin).
 */
export function storykitMc() {
  const o = process.env.STORYKIT_MC_ORIGIN;
  return o && process.env.NODE_ENV !== 'production' && DEV_ORIGIN.test(o) ? o : mcOrigin();
}
/** Is this origin one that reads Story Kit worlds (CORS): Mog City's, and outside production any local one. */
export function storykitReader(origin: string | null): string | null {
  if (!origin) return null;
  if (origin === MC_PROD || origin === storykitMc()) return origin;
  return process.env.NODE_ENV !== 'production' && DEV_ORIGIN.test(origin) ? origin : null;
}
/**
 * This site's origin as Mog City is told it: where the world's files are (Mog City takes worlds from https://gamemog.com
 * only) and where it posts its messages (?host=). Production names gamemog.com outright; a dev server its own address.
 */
export function storySite(reqOrigin?: string | null) {
  if (process.env.NODE_ENV === 'production') return 'https://gamemog.com';
  return reqOrigin && DEV_ORIGIN.test(reqOrigin) ? reqOrigin : new URL(process.env.SITE_URL ?? 'http://localhost:3939').origin;
}
/** Mog City's frame address for a sealed world (its SHA-256) and the game it is (a draft: draft-<id>). */
export function storyFrameSrc(world: string, game: string, site = storySite()) {
  const pack = `${site}/storykit/f/${world}.json`;
  return `${storykitMc()}/?pack=${encodeURIComponent(pack)}&host=${encodeURIComponent(site)}&game=${encodeURIComponent(game)}`;
}
/**
 * A story world's playable world: its sealed world when published, else its store draft sealed now (a draft's world
 * changes as the creator's browser stores files, so it is frozen as it is when it is played; sealing the same world
 * twice is the same blob). Null when it is not a story world or its store draft is gone.
 */
export function playableWorld(meta?: string | null): string | null {
  const w = sealedWorldOf(meta); if (w) return w;
  const d = storeDraftOf(meta); if (!d) return null;
  const s = storyStore(), row = s.db.prepare('SELECT * FROM drafts WHERE id = ?').get(d) as Parameters<typeof s.seal>[0] | undefined;
  if (!row) return null;
  const r = s.seal(row);
  return r.ok ? r.hash : null;
}
/** Where a story world plays (the game page's frame, /g/<slug>/play, /d/<id>/play): Mog City with its world, or null. */
export function storyPlaySrc(meta: string | null | undefined, game: string, site = storySite()): string | null {
  const w = playableWorld(meta);
  return w ? storyFrameSrc(w, game, site) : null;
}

/** The newest GameMog draft made with this store draft (the build route writes one per pass that passed). */
export function draftOfStore(storeId: string): (DraftRow & { cover: Uint8Array | null }) | undefined {
  if (!STORE_ID.test(storeId)) return undefined;
  return db.prepare("SELECT * FROM drafts WHERE json_extract(meta, '$.mode') = 'storykit' AND json_extract(meta, '$.storykit.pack') = ? ORDER BY created_at DESC LIMIT 1")
    .get(storeId) as (DraftRow & { cover: Uint8Array | null }) | undefined;
}

export type DriveReport = {
  missions: { id: string; state: 'passed' | 'failed'; ms?: number }[]; errors: number; ms?: number; stages?: Record<string, number>;
  /** why the drive stopped short (public/storykit/work.js: a stuck or failed mission, a world that did not load, a tab
   * left in the background), and where: the mission, its step and kind. `live`/`hidden`: ms the tab was in front / not */
  reason?: string; stuck?: { id: string; step?: number; type?: string }; live?: number; hidden?: number;
  /** a mission passed while the drive goes on (work.js banked): what it passed so far, never a verdict on the rest */
  partial?: boolean;
};
/** A browser's report, read strictly (anything else is refused). */
export function readDriveReport(x: unknown): DriveReport | null {
  if (!x || typeof x !== 'object') return null;
  const r = x as Record<string, unknown>;
  if (!Array.isArray(r.missions) || r.missions.length > 60 || !Number.isInteger(r.errors) || (r.errors as number) < 0) return null;
  const missions: DriveReport['missions'] = [];
  for (const m of r.missions) {
    const o = m as Record<string, unknown>;
    if (!o || typeof o.id !== 'string' || !/^[A-Za-z0-9_.-]{1,40}$/.test(o.id) || (o.state !== 'passed' && o.state !== 'failed')) return null;
    missions.push({ id: o.id, state: o.state, ...(Number.isFinite(o.ms) ? { ms: Math.max(0, Math.round(o.ms as number)) } : {}) });
  }
  const stages: Record<string, number> = {};
  if (r.stages && typeof r.stages === 'object') for (const [k, v] of Object.entries(r.stages as Record<string, unknown>)) if (/^[a-z]{2,12}$/.test(k) && Number.isFinite(v)) stages[k] = Math.max(0, Math.round(v as number));
  const st = r.stuck as Record<string, unknown> | undefined;
  const stuck = st && typeof st === 'object' && typeof st.id === 'string' && /^[A-Za-z0-9_.-]{1,40}$/.test(st.id)
    ? { id: st.id, ...(Number.isInteger(st.step) ? { step: st.step as number } : {}), ...(typeof st.type === 'string' && /^[a-zA-Z]{1,24}$/.test(st.type) ? { type: st.type } : {}) } : null;
  const ms = (k: string) => (Number.isFinite(r[k]) ? { [k]: Math.max(0, Math.round(r[k] as number)) } : {});
  return { missions, errors: r.errors as number, ...ms('ms'), ...(Object.keys(stages).length ? { stages } : {}),
    ...(typeof r.reason === 'string' && r.reason.trim() ? { reason: r.reason.trim().slice(0, 400) } : {}), ...(stuck ? { stuck } : {}), ...ms('live'), ...ms('hidden'), ...(r.partial === true ? { partial: true } : {}) };
}

/** The world a test drive plays, without its art (key art and headshots change between sittings; the play does not). */
function playHashOf(storeId: string): string | null {
  const w = storyStore().world(storeId); if (!w) return null;
  delete w.art;
  return createHash('sha256').update(JSON.stringify(w)).digest('hex');
}

/**
 * The creator's browser's report for a store draft: its GameMog draft's test drive (passed: every mission of the pack,
 * 0 page errors), and the store's key art as the draft's cover. Null when no draft names that store draft.
 */
export function recordStoryReport(storeId: string, pack: { acts?: { missions?: { id: string; hidden?: boolean }[] }[] }, rep: DriveReport) {
  const d = draftOfStore(storeId); if (!d) return null;
  // (a hidden mission, as Mog City's "Coming Soon", is not in the story's list: the work page drives the listed ones)
  const want = (pack.acts ?? []).flatMap((a) => (a.missions ?? []).filter((m) => !m.hidden).map((m) => m.id));
  const report = JSON.parse(d.report) as Record<string, unknown>;
  // A long story's drive in more than one sitting (the work page opened again, or ?from=<mission>): the missions an
  // earlier sitting passed with no errors still count when the world played is the same one (its sealed world without
  // the art, which a sitting's key art changes): the people, voices, cars and every mission exactly as they were.
  const play = playHashOf(storeId);
  const prev = (report.drive ?? null) as { play?: string; errors?: number; missions?: DriveReport['missions'] } | null;
  const carried = play && prev?.play === play && prev.errors === 0 ? (prev.missions ?? []).filter((m) => m.state === 'passed' && !rep.missions.some((x) => x.id === m.id)) : [];
  const missions = [...carried, ...rep.missions];
  const passed = new Set(missions.filter((m) => m.state === 'passed').map((m) => m.id));
  const all = want.length > 0 && want.every((id) => passed.has(id));
  const ok = all && rep.errors === 0;
  // (a partial report, a mission passed with the drive still going: not a failure until the drive says so)
  const status = ok ? 'passed' : rep.partial && rep.errors === 0 ? 'unverified' : 'failed';
  const next: Record<string, unknown> = { ...report, ran: true, status, codeHash: codeHash(d.code), levelReached: passed.size,
    drive: { missions, want: want.length, passed: passed.size, errors: rep.errors, ms: rep.ms ?? null, stages: rep.stages ?? null, reason: rep.reason ?? null, stuck: rep.stuck ?? null, live: rep.live ?? null, hidden: rep.hidden ?? null, at: Date.now(),
      ...(play ? { play } : {}), ...(carried.length ? { carried: carried.map((m) => m.id) } : {}), ...(rep.partial ? { partial: true } : {}) } };
  // the store's key art: the draft's cover (wide) and its icon (square), as every world's
  const s = storyStore(), files = s.db.prepare("SELECT name, hash, ext FROM files WHERE draft_id = ? AND kind = 'art'").all(storeId) as { name: string; hash: string; ext: string }[];
  const blob = (stem: string) => { const f = files.find((x) => x.name.replace(/\.[a-z]+$/, '') === stem && x.ext === 'jpg'); return f ? s.read(`${f.hash}.${f.ext}`)?.bytes ?? null : null; };
  const wide = blob('key-wide'), square = blob('key-square');
  if (wide) next.coverHash = codeHash(d.code);
  db.prepare('UPDATE drafts SET report = ?, cover = COALESCE(?, cover), art_wide = COALESCE(?, art_wide), art_icon = COALESCE(?, art_icon) WHERE id = ?')
    .run(JSON.stringify(next), wide, wide, square, d.id);
  return { draft: d.id, status: next.status as string, passed: passed.size, of: want.length, ...(rep.reason ? { reason: rep.reason } : {}) };
}

/**
 * Publishing a story draft (app/api/games/route.ts): its store draft sealed, the meta's storykit.world naming it. The
 * store draft is kept with the game's id after the game exists (keepStoryWorld). Null when it is not a story draft;
 * an error when the switch is off or the store draft is gone.
 */
export function sealStoryDraft(d: { meta: string }, open = storykitPublic()): { ok: true; storeId: string; world: string; meta: Record<string, unknown> } | { ok: false; status: number; error: string } | null {
  const storeId = storeDraftOf(d.meta); if (!storeId) return null;
  // (open: the Story Kit is open to the publisher, lib/storykit-switch.ts; the caller passes storykitForRequest)
  if (!open) return { ok: false, status: 409, error: 'Story worlds are not open yet.' };
  const s = storyStore();
  const row = s.db.prepare('SELECT * FROM drafts WHERE id = ?').get(storeId) as Parameters<typeof s.seal>[0] | undefined;
  if (!row) return { ok: false, status: 410, error: 'This story world\'s files are gone (a draft is kept for a day). Build it again.' };
  const sealed = s.seal(row);
  if (!sealed.ok) return { ok: false, status: sealed.status, error: sealed.error };
  const m = JSON.parse(d.meta) as Record<string, unknown> & { storykit: Record<string, unknown> };
  return { ok: true, storeId, world: sealed.hash, meta: { storykit: { ...m.storykit, world: sealed.hash } } };
}
export const keepStoryWorld = (storeId: string, gameId: string) => storyStore().keep(storeId, gameId);
