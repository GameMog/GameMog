import { createHash } from 'node:crypto';
import { db, type DraftRow } from './db';
import { codeHash } from './test-drive';
import { storykitPublic, storykitMode } from './storykit-switch';
import { storyStore } from './storykit-store';
import { MC_PROD, mcOrigin } from './episode';
import { onSky } from './portrait-sky-key';
import { storyKeyArt } from './story-art';
import type { HometownLock } from '../storykit/pack/cities.ts';
import { builderMode } from './hometown-build/access.ts';
import { builderDeps } from './hometown-build/server.ts';
import { bestVariant, servingBuild } from './hometown-build/towns.ts';
import { bundleKey } from './hometown-tiles/keys.ts';
import { storyLock } from './hometown/ids.ts';
import { cityPackageByLock } from './hometown/towns.ts';
import { storyUpgradeWith, upgradeWords, frameMoved, type StoryUpgrade, type UpgradeDeps } from './storykit-upgrade.ts';
import { cityTableOf, storyPlan, playerTexts, violentMissions } from '../storykit/hometown/hometown-gate.ts';
import { safetyProblems } from '../storykit/hometown/safety.ts';
import { cityBuildOf, townName } from '../storykit/hometown/city-package.ts';
import { readReach, type DriveReach } from './drive-reach';

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
type StoryMeta = { mode?: string; storykit?: { city?: string; pack?: string; world?: string; packId?: string; hometown?: HometownLock } };
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
/**
 * Mog City's frame address for a sealed world (its SHA-256) and the game it is (a draft: draft-<id>). `city`: the
 * world's city; Mog City loads one city a page and plays New York unless told ?city=sf (its index.html), and refuses a
 * world set in another city than the page's (wagmi/storyrun/pack.js), so a San Francisco world (SF 2040, 11 Nov) names it.
 */
export function storyFrameSrc(world: string, game: string, site = storySite(), city?: string | null, town?: HometownLock | null) {
  const pack = `${site}/storykit/f/${world}.json`;
  const q = storyFrameQuery(city, town);
  return `${storykitMc()}/?${q ? `${q}&` : ''}pack=${encodeURIComponent(pack)}&host=${encodeURIComponent(site)}&game=${encodeURIComponent(game)}`;
}
/**
 * The city part of Mog City's frame address, '' (New York), joined to the rest with '&' by whoever builds the address
 * (it used to end in '&', which read as a stray '&' in the draft status): city=sf for San Francisco; for a hometown
 * (base.city 'hometown') the town's bundle by its lock, ?city=pkg&town=<place>&tc=<buildId>&ts=<tile set hash>, which
 * Mog City loads from the world's own host (?host=; gamemog.com in production: its index.html, wagmi/world/town-src.js).
 * One helper for every address that boots a world: the play page (storyPlaySrc), the frame (storyFrameSrc) and the test
 * drive (the draft status's `frame`, public/storykit/work.js).
 */
export function storyFrameQuery(city?: string | null, town?: HometownLock | null, tv: string | TownPlay | null = city === 'hometown' ? townPlay(town) : null): string {
  if (city === 'sf') return 'city=sf';
  if (city === 'hometown' && town) {
    const play = typeof tv === 'string' ? { variant: tv, tilesId: town.tiles } : tv;
    return `city=pkg&town=${encodeURIComponent(town.place)}&tc=${encodeURIComponent(town.compiler)}&ts=${encodeURIComponent(play?.tilesId ?? town.tiles)}${play ? `&tv=${encodeURIComponent(play.variant)}` : ''}`;
  }
  return '';
}
/**
 * The bundle a town built by the production builder plays (&tv= and &ts=, Mog City's wagmi/world/town-src.js): its bundles
 * live at /towns/{place}/{build}/{tiles}/{variant}/. Read when the address is made (every play page, every draft status),
 * never kept with the world: a story published while only the spawn district was built plays the WHOLE town ('full') as
 * soon as the whole town's bundle is stored, at the same place and build (the lock's compiler), whatever its tiles id;
 * else the spawn district's (growing.js swaps to the whole town when it is ready). Null for a town of the in-process
 * builder (its one bundle at /towns/{place}/{build}/{tiles}/), or when the production builder is off.
 */
export type TownPlay = { variant: string; tilesId: string };
export function townPlay(town?: HometownLock | null): TownPlay | null {
  if (!town || builderMode() === 'off') return null;
  try { return playOf(bestVariant(builderDeps(), town.place, town.compiler), town); } catch { return null; }
}
/** (pure: the variant bestVariant found at the lock's place and build -> what the lock plays) */
export function playOf(v: { variant: string; tilesId: string; full: boolean } | null, town: HometownLock): TownPlay | null {
  if (!v) return null;
  // (the whole town: the same place and build, so it plays even when its tiles id is not the lock's; a district only
  // when it is the lock's own tile set)
  if (v.full) return { variant: 'full', tilesId: v.tilesId };
  return v.tilesId === town.tiles ? { variant: v.variant, tilesId: v.tilesId } : null;
}
/**
 * A town's free-roam test drive in Mog City (r7, the Create card's "Drive around <town>"): the town's bundle by the play
 * variant the builder answered (`play`: build, tiles id, variant), no story, ?host= this site (where the bundle is). The
 * same address the live QA built by hand from the status lock (city=pkg&town&tc&ts&tv&host).
 */
export function townDriveUrl(place: string, play: { build: string; tilesId: string; variant: string }, site = storySite()): string {
  return `${storykitMc()}/?city=pkg&town=${encodeURIComponent(place)}&tc=${encodeURIComponent(play.build)}&ts=${encodeURIComponent(play.tilesId)}&tv=${encodeURIComponent(play.variant)}&host=${encodeURIComponent(site)}`;
}
/** A towns answer (POST /api/towns, GET /api/towns/{place}) with its `drive` address when it has a playable variant. */
export function withDrive<T extends { status: number; body: object }>(a: T, reqOrigin?: string | null): T {
  const b = a.body as { placeId?: unknown; play?: { build: string; tilesId: string; variant: string } };
  if (!b.play || typeof b.placeId !== 'string' || !/^us-[0-9]{7}$/.test(b.placeId)) return a;
  return { ...a, body: { ...a.body, drive: townDriveUrl(b.placeId, b.play, storySite(reqOrigin)) } };
}
/** The variant alone (townPlay), as before. */
export const townVariant = (town?: HometownLock | null): string | null => townPlay(town)?.variant ?? null;
/** A story world's city as its meta names it (storykit.city), or null. */
export const storyCityOf = (meta?: string | null): string | null => { const c = metaOf(meta).storykit?.city; return typeof c === 'string' ? c : null; };
/** A hometown story world's town as its meta pins it (storykit.hometown, the pack's base.hometown), or null. */
export const storyTownOf = (meta?: string | null): HometownLock | null => { const h = metaOf(meta).storykit?.hometown; return h && typeof h === 'object' && typeof h.place === 'string' ? h as HometownLock : null; };
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
/**
 * Where a story world plays (the game page's frame, /g/<slug>/play, /d/<id>/play): Mog City with its world, or null. A
 * hometown world pinned to an older build plays the current whole town when every place it names is the same place
 * there (lib/storykit-upgrade.ts: the world re-pinned, kept with its store draft), else its pinned build as before.
 */
export function storyPlaySrc(meta: string | null | undefined, game: string, site = storySite()): string | null {
  return storyPlay(meta, game, site)?.src ?? null;
}
/** storyPlaySrc's address and the world it plays (its SHA-256: the upgraded world's when it plays the whole town), the
 * world Mog City's results name (the game page's frame counts a played mission for it only, ./play-frame.tsx). */
export function storyPlay(meta: string | null | undefined, game: string, site = storySite()): { src: string; world: string } | null {
  const w = playableWorld(meta);
  if (!w) return null;
  const city = storyCityOf(meta), town = storyTownOf(meta);
  if (city === 'hometown' && town) {
    const u = storyUpgrade(w, { derive: true });
    if (u?.state === 'upgrade' && u.world && u.from.compiler === town.compiler && u.from.tiles === town.tiles) return { src: storyFrameSrc(u.world, game, site, city, u.to), world: u.world };
  }
  return { src: storyFrameSrc(w, game, site, city, town), world: w };
}
/** A hometown story world's town as people say it ("Okemah, Oklahoma"), from its pinned town's package, or null (not a
 * hometown world, or its package cannot be read). Kept per town (a package is megabytes; its name never changes). */
const TOWN_NAMES = new Map<string, string | null>();
export function storyTownName(meta?: string | null): string | null {
  const t = storyTownOf(meta); if (!t) return null;
  const k = `${t.place}/${t.compiler}/${t.tiles}`;
  if (TOWN_NAMES.has(k)) return TOWN_NAMES.get(k)!;
  let name: string | null = null;
  try { const p = cityPackageByLock(t); name = p ? townName(p) : null; } catch { name = null; }
  // (a town not read yet, a bundle still to be stored, is asked again next time)
  if (name) { if (TOWN_NAMES.size > 512) TOWN_NAMES.clear(); TOWN_NAMES.set(k, name); }
  return name;
}

/**
 * A sealed world's upgrade to its town's current whole town (lib/storykit-upgrade.ts storyUpgradeWith, on this server's
 * builder and store). Null when the production builder or the Story Kit is off, or for a world that is not a hometown
 * world. Judged once per world, build and whole-town tile set (a process cache: the bundles it reads never change).
 */
const UPGRADES = new Map<string, StoryUpgrade | null>(), PINS = new Map<string, { place: string; compiler: string } | null>();
export function storyUpgrade(world: string, opts: { derive?: boolean; fresh?: boolean } = {}): StoryUpgrade | null {
  if (builderMode() === 'off' || storykitMode() === 'off' || !/^[0-9a-f]{64}$/.test(world)) return null;
  try {
    const d = builderDeps(), store = storyStore();
    const deps: UpgradeDeps = {
      current: (place) => servingBuild(d, place),
      full: (place, build) => {
        const v = bestVariant(d, place, build);
        if (!v?.full) return null;
        const g = d.store.get(bundleKey(build, place, v.tilesId, 'full', 'lock.json'));
        let lock: HometownLock | null = null;
        try { lock = g ? storyLock(JSON.parse(g.body.toString('utf8'))) : null; } catch { lock = null; }
        return lock && lock.tiles === v.tilesId ? { tilesId: v.tilesId, lock } : null;
      },
      pkg: (lock) => cityPackageByLock(lock),
      world: (h) => { const r = store.read(`${h}.json`); try { return r ? JSON.parse(r.bytes.toString('utf8')) : null; } catch { return null; } },
      derive: (from, body) => store.derive(from, body),
    };
    // (the cache key: the world, and the current build and its whole town as they are now)
    // (a sealed world never changes: its pin is read once)
    let pin = PINS.get(world);
    if (pin === undefined) { const w = deps.world(world), h = w?.hometown; pin = h && typeof h.place === 'string' && typeof h.compiler === 'string' ? { place: h.place, compiler: h.compiler } : null; if (w) { if (PINS.size > 512) PINS.clear(); PINS.set(world, pin); } }
    if (!pin) return null;
    const build = deps.current(pin.place);
    const full = build && build !== pin.compiler ? bestVariant(d, pin.place, build) : null;
    const key = `${world}|${build}|${full?.full ? full.tilesId : '-'}|${opts.derive ? 1 : 0}`;
    if (!opts.fresh && UPGRADES.has(key)) return UPGRADES.get(key)!;
    const u = storyUpgradeWith(deps, world, opts);
    // (an upgrade or a hold is final for that key; 'waiting' and 'current' are cheap and change as the town builds)
    if (u && (u.state === 'upgrade' || u.state === 'held')) {
      if (UPGRADES.size > 256) UPGRADES.delete(UPGRADES.keys().next().value!);
      UPGRADES.set(key, u);
      if (u.state === 'held' && !opts.fresh) console.warn(`storykit: world ${world.slice(0, 12)} ${upgradeWords(u)}`.slice(0, 600));
    }
    return u;
  } catch (e) { console.error('storykit: upgrade', String((e as Error)?.message ?? e).slice(0, 300)); return null; }
}

/** The published hometown story worlds and what each plays now (the owner's screen: app/admin). */
export type StoryTownRow = { slug: string; title: string; hidden: boolean; place: string; pinned: string; state: StoryUpgrade['state'] | 'unknown'; build: string | null; words: string; why: string[]; notes: string[] };
export function storyTownsAdmin(): StoryTownRow[] {
  if (builderMode() === 'off' || storykitMode() === 'off') return [];
  const rows = db.prepare("SELECT slug, title, hidden, meta FROM games WHERE json_extract(meta, '$.mode') = 'storykit' AND json_extract(meta, '$.storykit.city') = 'hometown' ORDER BY created_at DESC LIMIT 200").all() as { slug: string; title: string; hidden: number; meta: string }[];
  return rows.map((g) => {
    const town = storyTownOf(g.meta), w = sealedWorldOf(g.meta), u = w ? storyUpgrade(w) : null;
    return { slug: g.slug, title: g.title, hidden: !!g.hidden, place: town?.place ?? '', pinned: town?.compiler ?? '', state: u?.state ?? 'unknown', build: u && 'build' in u ? u.build : null,
      words: upgradeWords(u), why: u?.state === 'held' ? u.why : [], notes: u && (u.state === 'held' || u.state === 'upgrade') ? u.notes : [] };
  });
}

/**
 * The owner's one-click re-pin (app/admin actions.ts repinStory): a published hometown story world moved for good to its
 * town's current whole town. Judged again first (lib/storykit-upgrade.ts: the same frame, the current whole town built),
 * then the store draft's pack gates against the new town's table (every "@key" on its map, the safety rules; StoryStore
 * .repin), and only then do the sealed world (re-pinned), the game's meta (storykit.world and storykit.hometown) and any
 * GameMog draft that named the old world change. A place the judge called another place is the owner's call here: it
 * passes when the pack gates (the problems the judge saw come back as notes).
 */
export function repinStoryWorld(slug: unknown): { ok: true; hash: string; was: string; build: string; notes: string[] } | { ok: false; status: number; error: string; problems?: string[] } {
  if (typeof slug !== 'string' || !/^[a-z0-9-]{1,80}$/.test(slug)) return { ok: false, status: 400, error: 'slug: a game\'s slug.' };
  const game = db.prepare('SELECT id, meta FROM games WHERE slug = ?').get(slug) as { id: string; meta: string | null } | undefined;
  const storeId = game ? storeDraftOf(game.meta) : null, was = game ? sealedWorldOf(game.meta) : null, town = game ? storyTownOf(game.meta) : null;
  if (!game || !storeId || !was || !town || storyCityOf(game.meta) !== 'hometown') return { ok: false, status: 404, error: 'No published hometown story world has that slug.' };
  const u = storyUpgrade(was, { fresh: true });
  if (!u || u.state === 'current') return { ok: false, status: 409, error: 'It already plays its town\'s current build.' };
  if (u.state === 'waiting') return { ok: false, status: 409, error: `The current build (${u.build}) has not built the whole town yet. Try again once it has.` };
  if (!u.to) return { ok: false, status: 409, error: u.state === 'held' ? u.why.join('; ') : 'No current whole town.' };
  if (frameMoved(u.from, u.to)) return { ok: false, status: 409, error: `The town's frame moved between the builds (${frameMoved(u.from, u.to)}): a re-pin would move every spot of the story.` };
  const pkg = cityPackageByLock(u.to);
  if (!pkg) return { ok: false, status: 409, error: 'The current build\'s places cannot be read.' };
  const table = cityTableOf(pkg);
  const r = storyStore().repin(storeId, { from: was, pin: u.to, cityBuild: cityBuildOf(pkg), city: table, extra: (pack) => {
    // (the real-place rules too, as a hometown pack opens; the spawn-district rule is moot: the whole town is built)
    const plan = storyPlan(pack), texts = playerTexts(pack);
    return safetyProblems({ pkg, refs: plan, violentMissions: violentMissions(pack), texts, aliases: pack.places ?? {} });
  } });
  if (!r.ok) return r;
  db.exec('BEGIN IMMEDIATE');
  try {
    const m = JSON.parse(game.meta!) as Record<string, any>;
    db.prepare('UPDATE games SET meta = ? WHERE id = ?').run(JSON.stringify({ ...m, storykit: { ...m.storykit, world: r.hash, hometown: u.to } }), game.id);
    const drafts = db.prepare("SELECT id, meta FROM drafts WHERE json_extract(meta, '$.mode') = 'storykit' AND json_extract(meta, '$.storykit.pack') = ? AND json_extract(meta, '$.storykit.world') = ?").all(storeId, was) as { id: string; meta: string }[];
    for (const d of drafts) { const dm = JSON.parse(d.meta); db.prepare('UPDATE drafts SET meta = ? WHERE id = ?').run(JSON.stringify({ ...dm, storykit: { ...dm.storykit, world: r.hash, hometown: u.to } }), d.id); }
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  for (const k of [...UPGRADES.keys()]) if (k.startsWith(`${was}|`)) UPGRADES.delete(k);
  return { ok: true, hash: r.hash, was: r.was, build: u.build, notes: u.state === 'held' ? [...u.why, ...u.notes] : u.notes };
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
  /** a step no player could do (Mog City's reach check, MogCity wagmi/storyrun/reach.js): the builder's to fix,
   * lib/storykit-reach.ts afterDriveReach */
  reach?: DriveReach;
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
  const reach = readReach(r.reach);
  return { missions, errors: r.errors as number, ...ms('ms'), ...(Object.keys(stages).length ? { stages } : {}), ...(reach ? { reach } : {}),
    ...(typeof r.reason === 'string' && r.reason.trim() ? { reason: r.reason.trim().slice(0, 400) } : {}), ...(stuck ? { stuck } : {}), ...ms('live'), ...ms('hidden'), ...(r.partial === true ? { partial: true } : {}) };
}

/** The world a test drive plays, without its art (key art and headshots change between sittings; the play does not). */
export function playHashOf(storeId: string): string | null {
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
    drive: { missions, want: want.length, passed: passed.size, errors: rep.errors, ms: rep.ms ?? null, stages: rep.stages ?? null, reason: rep.reason ?? null, stuck: rep.stuck ?? null, reach: rep.reach ?? null, live: rep.live ?? null, hidden: rep.hidden ?? null, at: Date.now(),
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
  // sky's flat key (art avatar, work.js), laid on the sky's gradient (lib/portrait-sky-key.ts onSky); none, the hero's own
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

/**
 * Key art again for a published story world (14 Nov): one whose test drive never drove its world has none (a hometown
 * story's drive played New York before work.js read the town's four-part frame, so Mog City refused the world and took
 * no frame; its cover is the plain palette card). Mog City makes key art only in a browser (a frame of the first drive,
 * the HUD hidden: the server has no graphics card), so the owner's browser takes it: /storykit/keyart.html?slug=<slug>
 * frames the world as it plays (storyKeyArtSrc, its sealed world: nothing about the world changes) with Mog City's
 * autopilot and ?keyart=1, hears the `keyart` message and sends the two JPEGs here (saveStoryKeyArt). The game's plain
 * frame (cover) and its art are replaced, then titled in Mog City's lockup as at a report (titleStoryArt). Owner only:
 * app/api/storykit/admin/keyart/route.ts.
 */
const KEYART_PARAMS = '&nogate&trailer=0&autopilot=1&autoanswer=1&autochoose=0&autocontinue=1&autocard=1&flowfast=1&noaudio=1&keyart=1';
type StoryGameRow = { id: string; slug: string; title: string; meta: string | null; hidden: number; cover: Uint8Array | null };
const storyGame = (slug: unknown): StoryGameRow | null => {
  if (typeof slug !== 'string' || !/^[a-z0-9-]{1,80}$/.test(slug)) return null;
  const g = db.prepare('SELECT id, slug, title, meta, hidden, cover FROM games WHERE slug = ?').get(slug) as StoryGameRow | undefined;
  return g && sealedWorldOf(g.meta) ? g : null;
};
/** The published story worlds with no key art (no plain frame stored): the owner's list on the key art page. */
export function storyWorldsWithoutArt(): { slug: string; title: string; city: string | null; hidden: boolean }[] {
  const rows = db.prepare("SELECT slug, title, meta, hidden FROM games WHERE cover IS NULL AND json_extract(meta, '$.storykit.world') IS NOT NULL ORDER BY created_at DESC LIMIT 200")
    .all() as { slug: string; title: string; meta: string | null; hidden: number }[];
  return rows.map((r) => ({ slug: r.slug, title: r.title, city: storyCityOf(r.meta), hidden: !!r.hidden }));
}
/** Where the owner's browser takes a published story world's key art: its play address, the autopilot on, ?keyart=1. */
export function storyKeyArtSrc(slug: unknown, site = storySite()): { slug: string; title: string; src: string; mc: string; hasArt: boolean } | null {
  const g = storyGame(slug); if (!g) return null;
  const src = storyPlaySrc(g.meta, `keyart-${g.id}`, site);
  return src ? { slug: g.slug, title: g.title, src: `${src}${KEYART_PARAMS}`, mc: new URL(src).origin, hasArt: !!g.cover } : null;
}
/** The two JPEGs Mog City took (wide and square), checked, as the game's frame and art, then titled. */
export async function saveStoryKeyArt(slug: unknown, wide: Uint8Array, square: Uint8Array): Promise<{ ok: true; slug: string; titled: boolean } | { ok: false; status: number; error: string }> {
  const g = storyGame(slug); if (!g) return { ok: false, status: 404, error: 'No published story world has that slug.' };
  const sharp = (await import('sharp')).default;
  for (const [name, b, min] of [['wide', wide, 320], ['square', square, 128]] as const) {
    if (b.length < 1000 || b.length > 4 * 1024 * 1024 || b[0] !== 0xff || b[1] !== 0xd8 || b[2] !== 0xff) return { ok: false, status: 422, error: `${name}: a JPEG of 1 KB to 4 MB.` };
    const m = await sharp(b).metadata().catch(() => null);
    if (!m || m.format !== 'jpeg' || !m.width || !m.height || Math.min(m.width, m.height) < min / 2 || m.width < min) return { ok: false, status: 422, error: `${name}: not a JPEG frame of at least ${min} px.` };
  }
  // (the plain frame is the cover and, until titled, the art: titleStoryArt titles exactly such a world, once)
  db.prepare('UPDATE games SET cover = ?, art_wide = ?, art_icon = ? WHERE id = ?').run(wide, wide, square, g.id);
  const titled = await titleStoryArt(g.slug, true).catch(() => null);
  return { ok: true, slug: g.slug, titled: !!titled };
}

/**
 * A published story world's voices recorded again (14 Nov): every hometown story published before the voice plan read
 * the town's table (fbc60528) was sealed with no lines, so its cast spoke only the placeholder mumble. Kokoro runs only
 * in a browser (the server has no model), so the owner's browser records them: /storykit/revoice.html lists the worlds
 * whose voice plan has lines with no clip (storyWorldsToRevoice), records the missing ones with the voice studio's own
 * pass (studio.html?revoice=<slug>: the plan from storyRevoiceOf, the clips kept in that browser, never stored one by
 * one) and sends them as the owner's patch (POST /api/storykit/admin/patch: StoryStore.patch checks the world's voice
 * lines against the pack's plan with the town's table, and every clip against a line). Nothing else about the world
 * changes. Owner only: app/api/storykit/admin/revoice/route.ts.
 */
type StoryRow = { id: string; slug: string; title: string; meta: string | null; hidden: number };
const storyRows = (): StoryRow[] => db.prepare("SELECT id, slug, title, meta, hidden FROM games WHERE json_extract(meta, '$.storykit.world') IS NOT NULL ORDER BY created_at DESC LIMIT 500").all() as StoryRow[];
const gapOf = (g: StoryRow) => {
  const id = storeDraftOf(g.meta), w = sealedWorldOf(g.meta);
  if (!id || !w) return null;
  const gap = storyStore().voiceGap(id);
  // (the game plays another world than its store draft's: a patch would be refused, StoryStore.patch `from`)
  return gap && gap.hash === w ? gap : null;
};
/** The published story worlds with lines to record (a line with no clip and no recording), newest first. */
export function storyWorldsToRevoice(): { slug: string; title: string; city: string | null; hidden: boolean; lines: number; voiced: number; missing: number; stale: boolean }[] {
  const out = [];
  for (const g of storyRows()) {
    let gap; try { gap = gapOf(g); } catch { gap = null; }
    if (!gap || (!gap.missing.length && !gap.stale)) continue;
    out.push({ slug: g.slug, title: g.title, city: storyCityOf(g.meta), hidden: !!g.hidden, lines: gap.plan.lines.length, voiced: gap.plan.lines.length - gap.missing.length, missing: gap.missing.length, stale: gap.stale });
  }
  return out;
}
/**
 * One world to record: its title, the world it plays now (`from`, its SHA-256, and `world`, the sealed world itself, which
 * the patch sends back with only its voice changed) and `voice`, the plan the studio records against (the pack's plan, its
 * kept clips in `clips`). Null for anything that is not a published story world.
 */
export function storyRevoiceOf(slug: unknown): { slug: string; title: string; from: string; world: Record<string, unknown>; voice: Record<string, unknown>; missing: number } | null {
  if (typeof slug !== 'string' || !/^[a-z0-9-]{1,80}$/.test(slug)) return null;
  const g = db.prepare('SELECT id, slug, title, meta, hidden FROM games WHERE slug = ?').get(slug) as StoryRow | undefined;
  const gap = g ? gapOf(g) : null;
  if (!g || !gap) return null;
  return { slug: g.slug, title: g.title, from: gap.hash, world: gap.world, voice: { ...gap.plan, clips: gap.clips }, missing: gap.missing.length };
}
