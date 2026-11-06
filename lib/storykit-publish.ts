import { createHash } from 'node:crypto';
import { db, type DraftRow } from './db';
import { codeHash } from './test-drive';
import { storykitPublic } from './storykit-switch';
import { storyStore } from './storykit-store';
import { MC_PROD, mcOrigin } from './episode';
import { onSky } from './portrait-sky';
import { storyKeyArt } from './story-art';

/**
 * A Story Kit world from its draft to its game (STORYKIT=on): what the creator's browser reports after its work, what
 * publishing does with the world's store draft, and where a story world plays.
 *
 *   the browser's report   public/storykit/work.js, after it forged, voiced, test-drove and framed the world, posts
 *                          { missions, errors } (POST /api/storykit/drafts/<id>/report, with the store draft's token).
 *                          The GameMog draft whose meta names that store draft gets the drive in its report: passed
 *                          only when every mission of the pack passed with 0 page errors (else failed), for its exact
 *                          code (codeHash), as a world's test drive is. The store's key art (art/key-wide, key-square,
 *                          Mog City's frames) becomes the draft's cover as it is (cover: the plain frame, as every
 *                          world's) and, titled in Mog City's lockup (lib/story-art.ts), its key art (art_wide, art_icon).
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
 * The missions a store draft's test drive has banked (GET /api/storykit/drafts/<id>, read by public/storykit/work.js):
 * the ones an earlier sitting passed with no errors on the world as it plays now (the same rule recordStoryReport carries
 * by), so a sitting after a reload or a stop drives only what is left, and a drive that has all of them goes straight to
 * its report. Empty when nothing is banked, or the world has changed since.
 */
export function bankedMissions(storeId: string): string[] {
  const d = draftOfStore(storeId); if (!d) return [];
  type Prev = { play?: string; errors?: number; missions?: DriveReport['missions'] };
  let prev: Prev | null = null;
  try { prev = (JSON.parse(d.report) as { drive?: Prev }).drive ?? null; } catch { return []; }
  if (!prev || prev.errors !== 0 || !prev.play || prev.play !== playHashOf(storeId)) return [];
  return (prev.missions ?? []).filter((m) => m.state === 'passed').map((m) => m.id);
}

/**
 * The creator's browser's report for a store draft: its GameMog draft's test drive (passed: every mission of the pack,
 * 0 page errors), and the store's key art as the draft's cover. Null when no draft names that store draft.
 */
export async function recordStoryReport(storeId: string, pack: { title?: unknown; kicker?: unknown; acts?: { missions?: { id: string; hidden?: boolean }[] }[] }, rep: DriveReport) {
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
  // the store's key art: the draft's cover (the plain wide frame), and its key art, wide and square, titled in Mog City's
  // lockup (lib/story-art.ts; the owner, 5 Nov: story thumbnails "need to pop like the rest ... with game title"). A
  // title the lettering cannot set, or a failure, keeps the plain frames (the cover route titles them when asked)
  const s = storyStore(), files = s.db.prepare("SELECT name, hash, ext FROM files WHERE draft_id = ? AND kind = 'art'").all(storeId) as { name: string; hash: string; ext: string }[];
  const blob = (stem: string) => { const f = files.find((x) => x.name.replace(/\.[a-z]+$/, '') === stem && x.ext === 'jpg'); return f ? s.read(`${f.hash}.${f.ext}`)?.bytes ?? null : null; };
  const wide = blob('key-wide'), square = blob('key-square');
  if (wide) next.coverHash = codeHash(d.code);
  const art = wide ? await storyKeyArt({ wide, square }, typeof pack.title === 'string' ? pack.title : '', typeof pack.kicker === 'string' ? pack.kicker : '').catch(() => null) : null;
  // the world's round headshot (6 Nov, the owner: every game carries a headshot so it can be featured): its hero on the
  // sky's flat key (art avatar, work.js), laid on the sky's gradient (lib/portrait-sky.ts onSky); none, the hero's own
  // headshot (head-<hero>) is not used (it is on the studio's dark ground, which cannot be keyed out cleanly)
  const av = blob('avatar'), avatar = av ? await onSky(av).catch(() => null) : null;
  db.prepare('UPDATE drafts SET report = ?, cover = COALESCE(?, cover), art_wide = COALESCE(?, art_wide), art_icon = COALESCE(?, art_icon), art_avatar = COALESCE(?, art_avatar) WHERE id = ?')
    .run(JSON.stringify(next), wide, art?.wide ?? wide, art?.icon ?? square, avatar, d.id);
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

/**
 * The owner's patch of a published story world (app/api/storykit/admin/patch/route.ts): the game by its slug (hidden or
 * not), its store draft patched (lib/storykit-store.ts StoryStore.patch: the checks, the clips, the pack's opening, the
 * new sealed world, the old one kept), then everything that names the world it played names the new one: the game's
 * meta (storykit.world, what /g/<slug>/play plays) and any GameMog draft of the same store draft that named it. A Mog of
 * it reads the store draft's pack and files (lib/storykit-build.ts storyParentPack), so it keeps the opening and clips.
 */
export function patchStoryWorld(slug: unknown, input: { world: unknown; files?: { ext: string; bytes: Uint8Array }[]; opening?: unknown }) {
  if (typeof slug !== 'string' || !/^[a-z0-9-]{1,80}$/.test(slug)) return { ok: false as const, status: 400, error: 'slug: a game\'s slug.' };
  const game = db.prepare('SELECT id, meta FROM games WHERE slug = ?').get(slug) as { id: string; meta: string | null } | undefined;
  const storeId = game ? storeDraftOf(game.meta) : null, was = game ? sealedWorldOf(game.meta) : null;
  if (!game || !storeId || !was) return { ok: false as const, status: 404, error: 'No published story world has that slug.' };
  const r = storyStore().patch(storeId, { ...input, from: was });
  if (!r.ok) return r;
  db.exec('BEGIN IMMEDIATE');
  try {
    const m = JSON.parse(game.meta!) as Record<string, any>;
    db.prepare('UPDATE games SET meta = ? WHERE id = ?').run(JSON.stringify({ ...m, storykit: { ...m.storykit, world: r.hash } }), game.id);
    const drafts = db.prepare("SELECT id, meta FROM drafts WHERE json_extract(meta, '$.mode') = 'storykit' AND json_extract(meta, '$.storykit.pack') = ? AND json_extract(meta, '$.storykit.world') = ?").all(storeId, was) as { id: string; meta: string }[];
    for (const d of drafts) { const dm = JSON.parse(d.meta); db.prepare('UPDATE drafts SET meta = ? WHERE id = ?').run(JSON.stringify({ ...dm, storykit: { ...dm.storykit, world: r.hash } }), d.id); }
    db.exec('COMMIT');
    return { ...r, game: game.id, drafts: drafts.length };
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}

/**
 * A published story world's key art, titled (lib/story-art.ts), for one whose art is still Mog City's plain frame: the
 * worlds published before story key art was titled (5 Nov: The Velvet Run, Special Delivery), or one whose titling
 * failed at its report. Its plain frame stays the cover (?plain, the dare card); the titled wide and square replace
 * art_wide and art_icon, once (the update is guarded on the art still being the frame), so the first request for its
 * cover after a deploy makes them and every later one reads them. `owner`: a hidden world's, for the owner's session
 * only, as gameArt. Null for anything else: not a story world, no frame, already titled, or a title nothing can set.
 */
const titling = new Map<string, Promise<{ wide: Buffer; icon: Buffer } | null>>();
export function titleStoryArt(slug: string, owner = false): Promise<{ wide: Buffer; icon: Buffer } | null> {
  const row = db.prepare(`SELECT id, title, meta, cover, art_wide, art_icon FROM games WHERE slug = ? AND (${owner ? '1' : "hidden = 0 OR json_extract(meta, '$.unlisted') = 1"})`)
    .get(slug) as { id: string; title: string; meta: string | null; cover: Uint8Array | null; art_wide: Uint8Array | null; art_icon: Uint8Array | null } | undefined;
  if (!row?.cover || !storeDraftOf(row.meta)) return Promise.resolve(null);
  if (row.art_wide && !Buffer.from(row.art_wide).equals(Buffer.from(row.cover))) return Promise.resolve(null);
  const busy = titling.get(row.id); if (busy) return busy;
  const job = (async () => {
    // the lockup's tag line is the world's kicker, from its pack in the store (none to be had: no tag line)
    let kicker = '';
    try {
      const p = storyStore().db.prepare('SELECT pack FROM drafts WHERE id = ?').get(storeDraftOf(row.meta)!) as { pack: string } | undefined;
      const k = p ? (JSON.parse(p.pack) as { kicker?: unknown }).kicker : null;
      if (typeof k === 'string') kicker = k;
    } catch { /* no tag line */ }
    const art = await storyKeyArt({ wide: row.cover!, square: row.art_icon }, row.title, kicker).catch(() => null);
    if (art) db.prepare('UPDATE games SET art_wide = ?, art_icon = ? WHERE id = ? AND (art_wide IS NULL OR art_wide = cover)').run(art.wide, art.icon, row.id);
    return art;
  })().finally(() => titling.delete(row.id));
  titling.set(row.id, job);
  return job;
}
