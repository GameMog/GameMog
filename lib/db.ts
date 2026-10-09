import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { WorldSpec } from './worldspec';
import { KartScore, type KartConstants } from './kart-score';

/**
 * SQLite via Node's built-in driver — no native module, no build step.
 * One file on disk; swap the driver for Postgres when concurrency demands it.
 */

const DATA_DIR = join(process.cwd(), 'data');
mkdirSync(DATA_DIR, { recursive: true });

declare global {
  // eslint-disable-next-line no-var
  var __gamemogDb: DatabaseSync | undefined;
}

function open() {
  const db = new DatabaseSync(join(DATA_DIR, 'gamemog.db'));
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS games (
      id          TEXT PRIMARY KEY,
      slug        TEXT UNIQUE NOT NULL,
      title       TEXT NOT NULL,
      tagline     TEXT NOT NULL,
      blurb       TEXT NOT NULL,
      difficulty  TEXT NOT NULL,
      spec        TEXT NOT NULL,
      prompt      TEXT,
      featured    INTEGER NOT NULL DEFAULT 0,
      plays       INTEGER NOT NULL DEFAULT 0,
      created_at  INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS scores (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id       TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      player        TEXT NOT NULL,
      time_ms       INTEGER NOT NULL,
      place         INTEGER NOT NULL,
      tempo_reached INTEGER NOT NULL,
      locks         INTEGER NOT NULL,
      best_streak   INTEGER NOT NULL,
      created_at    INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS scores_by_game ON scores(game_id, time_ms);
    CREATE TABLE IF NOT EXISTS votes (
      game_id    TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      voter      TEXT NOT NULL,
      value      INTEGER NOT NULL CHECK (value IN (-1, 1)),
      created_at INTEGER NOT NULL,
      PRIMARY KEY (game_id, voter)
    );
    CREATE TABLE IF NOT EXISTS generations (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id    TEXT,
      prompt     TEXT NOT NULL,
      model      TEXT NOT NULL,
      attempts   INTEGER NOT NULL,
      ok         INTEGER NOT NULL,
      findings   TEXT NOT NULL,
      ms         INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);

  // Games Opus writes itself. A game row keeps its authored WorldSpec for the
  // race engine; a 'custom' row keeps the model's code, its metadata and the
  // screenshot the runtime playtest took, which becomes its cover.
  const cols = (t: string) => (db.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).map((c) => c.name);
  const add = (t: string, c: string, ddl: string) => { if (!cols(t).includes(c)) db.exec(`ALTER TABLE ${t} ADD COLUMN ${ddl}`); };
  add('games', 'format', "format TEXT NOT NULL DEFAULT 'race'");
  add('games', 'code', 'code TEXT');
  add('games', 'meta', 'meta TEXT');
  add('games', 'cover', 'cover BLOB');
  add('games', 'art_icon', 'art_icon BLOB');
  add('games', 'art_wide', 'art_wide BLOB');
  add('scores', 'score', 'score INTEGER');
  add('scores', 'level', 'level INTEGER');
  add('scores', 'gm', 'gm INTEGER');
  // an open world's takedowns (1 Oct): what a world with no GM ranks after the time
  add('scores', 'kos', 'kos INTEGER');
  db.exec(`
    CREATE TABLE IF NOT EXISTS drafts (
      id          TEXT PRIMARY KEY,
      prompt      TEXT NOT NULL,
      meta        TEXT NOT NULL,
      code        TEXT NOT NULL,
      cover       BLOB,
      report      TEXT NOT NULL,
      created_at  INTEGER NOT NULL
    );
  `);
  add('drafts', 'format', "format TEXT NOT NULL DEFAULT 'custom'");
  add('drafts', 'art_icon', 'art_icon BLOB');
  add('drafts', 'art_wide', 'art_wide BLOB');

  // Mog: every game can be challenged by a better variation. A Mog keeps its
  // parent, the root of its family and its generation, so the original is
  // always credited and a family can be ranked.
  add('games', 'parent_id', 'parent_id TEXT');
  add('games', 'root_id', 'root_id TEXT');
  add('games', 'generation', 'generation INTEGER NOT NULL DEFAULT 0');
  add('games', 'mog_prompt', 'mog_prompt TEXT');
  add('drafts', 'parent_id', 'parent_id TEXT');
  add('drafts', 'mog_prompt', 'mog_prompt TEXT');
  db.exec(`
    CREATE INDEX IF NOT EXISTS games_by_parent ON games(parent_id);
    CREATE INDEX IF NOT EXISTS games_by_root ON games(root_id);
    -- finished runs per game per player: distinct players, and whether a
    -- player has actually played both sides of a Mog-off
    CREATE TABLE IF NOT EXISTS plays (
      game_id   TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      player    TEXT NOT NULL,
      runs      INTEGER NOT NULL DEFAULT 0,
      best      INTEGER,
      first_at  INTEGER NOT NULL,
      last_at   INTEGER NOT NULL,
      PRIMARY KEY (game_id, player)
    );
    -- a Mog-off is always a Mog against the game it challenged
    CREATE TABLE IF NOT EXISTS mog_picks (
      child_id   TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      parent_id  TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      voter      TEXT NOT NULL,
      winner_id  TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (child_id, voter)
    );
  `);

  // Moderation from /admin: the owner can take a world or a leaderboard row
  // down and put it back. Nothing is deleted; a hidden row is simply not
  // served to anyone.
  add('games', 'hidden', 'hidden INTEGER NOT NULL DEFAULT 0');
  add('scores', 'hidden', 'hidden INTEGER NOT NULL DEFAULT 0');
  // a kart race's score (the owner, 8 Oct; lib/runtime/kart-score.js): score holds the total the server computed,
  // kos the enemies hit, level the laps; beside them whether the race was called before the finish (est) and the share
  // of it driven, the racer (its own perfect time), the formula's version and the tier the total landed in
  add('scores', 'est', 'est INTEGER NOT NULL DEFAULT 0');
  add('scores', 'progress', 'progress REAL');
  add('scores', 'racer', 'racer TEXT');
  add('scores', 'score_v', 'score_v INTEGER');
  add('scores', 'tier', 'tier TEXT');
  db.exec('CREATE INDEX IF NOT EXISTS scores_by_game_score ON scores(game_id, score DESC)');
  // First-party analytics (lib/analytics.ts): a page view or a press of Play,
  // against the random id the browser made for itself. No IP address, no
  // cookie, no third party.
  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      at       INTEGER NOT NULL,
      visitor  TEXT NOT NULL,
      kind     TEXT NOT NULL,
      path     TEXT NOT NULL,
      ref      TEXT,
      source   TEXT,
      device   TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS events_by_time ON events(at);
  `);
  return db;
}

export const db: DatabaseSync = globalThis.__gamemogDb ?? (globalThis.__gamemogDb = open());

/* ------------------------------------------------------------------ rows -- */
export type GameRow = {
  id: string;
  slug: string;
  title: string;
  tagline: string;
  blurb: string;
  difficulty: string;
  spec: string;
  prompt: string | null;
  featured: number;
  plays: number;
  created_at: number;
  /** 'race' runs the built-in engine from `spec`; 'custom' runs `code` as a
   *  whole game; 'world' runs `code` as a world module on the GameMog Runtime. */
  format: 'race' | 'custom' | 'world';
  code: string | null;
  meta: string | null;
  parent_id: string | null;
  root_id: string | null;
  generation: number;
  mog_prompt: string | null;
};

/** Columns that are large or binary stay out of list queries. */
const ROW = 'id, slug, title, tagline, blurb, difficulty, spec, prompt, featured, plays, created_at, format, code, meta, parent_id, root_id, generation, mog_prompt';

export type ScoreRow = {
  id: number;
  score: number | null;
  level: number | null;
  gm: number | null;
  kos: number | null;
  est?: number | null;
  progress?: number | null;
  racer?: string | null;
  score_v?: number | null;
  tier?: string | null;
  player: string;
  time_ms: number;
  place: number;
  tempo_reached: number;
  locks: number;
  best_streak: number;
  created_at: number;
};

/* --------------------------------------------------------------- queries -- */
export function slugify(title: string) {
  const base =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'world';
  let slug = base;
  let n = 1;
  while (db.prepare('SELECT 1 FROM games WHERE slug = ?').get(slug)) slug = `${base}-${++n}`;
  return slug;
}

export function insertGame(args: {
  id: string;
  slug: string;
  spec: WorldSpec;
  prompt?: string | null;
  featured?: boolean;
}) {
  db.prepare(
    `INSERT INTO games (id, slug, title, tagline, blurb, difficulty, spec, prompt, featured, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    args.id,
    args.slug,
    args.spec.meta.title,
    args.spec.meta.tagline,
    args.spec.meta.blurb,
    args.spec.difficulty,
    JSON.stringify(args.spec),
    args.prompt ?? null,
    args.featured ? 1 : 0,
    Date.now()
  );
}

/* Everything public reads live games only; /admin reads its own queries. */
export const getGameBySlug = (slug: string) =>
  db.prepare(`SELECT ${ROW} FROM games WHERE slug = ? AND hidden = 0`).get(slug) as GameRow | undefined;

/* An unlisted game: hidden from every list, feed, Mog and board, but anyone with its link can play it (the owner, 8
   Oct, on "Meme Kart: The Original": "it isn't published to not confuse users or crash their phones but it should be
   open to anyone I share the link"). A hidden game is unlisted only when its meta says so. */
export const getUnlistedGameBySlug = (slug: string) =>
  db.prepare(`SELECT ${ROW} FROM games WHERE slug = ? AND hidden = 1 AND json_extract(meta, '$.unlisted') = 1`).get(slug) as GameRow | undefined;

/* The owner's own way to any hidden game, only for a request that carries the owner's session (the caller checks). */
export const getGameBySlugForOwner = (slug: string) =>
  db.prepare(`SELECT ${ROW} FROM games WHERE slug = ?`).get(slug) as GameRow | undefined;

export const listGames = (limit = 40) =>
  db
    .prepare(`SELECT ${ROW} FROM games WHERE hidden = 0 ORDER BY featured DESC, created_at DESC LIMIT ?`)
    .all(limit) as GameRow[];

export function gameCover(slug: string): Uint8Array | undefined {
  // (an unlisted game's cover is served too: its own page shows it)
  const r = db.prepare("SELECT cover FROM games WHERE slug = ? AND (hidden = 0 OR json_extract(meta, '$.unlisted') = 1)").get(slug) as { cover: Uint8Array | null } | undefined;
  return r?.cover ?? undefined;
}

export function gameArt(slug: string, shape: 'square' | 'wide'): Uint8Array | undefined {
  const column = shape === 'square' ? 'art_icon' : 'art_wide';
  const r = db.prepare(`SELECT ${column} AS art FROM games WHERE slug = ? AND (hidden = 0 OR json_extract(meta, '$.unlisted') = 1)`).get(slug) as { art: Uint8Array | null } | undefined;
  return r?.art ?? undefined;
}

/* ---------------------------------------------------------------- drafts -- */
export type DraftRow = { id: string; prompt: string; meta: string; code: string; report: string; created_at: number; format: 'custom' | 'world'; parent_id: string | null; mog_prompt: string | null; art_icon: Uint8Array | null; art_wide: Uint8Array | null };

export function insertDraft(d: { id: string; prompt: string; meta: unknown; code: string; cover?: Uint8Array; report: unknown; format?: 'custom' | 'world'; parentId?: string | null; mogPrompt?: string | null }) {
  db.prepare(`INSERT INTO drafts (id, prompt, meta, code, cover, report, created_at, format, parent_id, mog_prompt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(d.id, d.prompt, JSON.stringify(d.meta), d.code, d.cover ?? null, JSON.stringify(d.report), Date.now(), d.format ?? 'custom', d.parentId ?? null, d.mogPrompt ?? null);
}
export const getDraft = (id: string) =>
  db.prepare('SELECT id, prompt, meta, code, report, created_at, format, parent_id, mog_prompt FROM drafts WHERE id = ?').get(id) as DraftRow | undefined;
export function draftCover(id: string): Uint8Array | undefined {
  const r = db.prepare('SELECT cover FROM drafts WHERE id = ?').get(id) as { cover: Uint8Array | null } | undefined;
  return r?.cover ?? undefined;
}
export function draftArt(id: string, shape: 'square' | 'wide'): Uint8Array | undefined {
  const column = shape === 'square' ? 'art_icon' : 'art_wide';
  const r = db.prepare(`SELECT ${column} AS art FROM drafts WHERE id = ?`).get(id) as { art: Uint8Array | null } | undefined;
  return r?.art ?? undefined;
}

/**
 * Publish a draft as a custom game. The draft row is what was playtested. `add`: what publishing works out for the
 * game's meta besides the test record (a kart race's score constants, 8 Oct: app/api/games/route.ts).
 */
export function publishDraft(draftId: string, slug: string, id: string, test?: Record<string, unknown>, add?: Record<string, unknown>): boolean {
  const d = db.prepare('SELECT * FROM drafts WHERE id = ?').get(draftId) as (DraftRow & { cover: Uint8Array | null }) | undefined;
  if (!d) return false;
  const meta = JSON.parse(d.meta) as { title: string; tagline: string; blurb: string };
  // what the test drive found, kept with the game (1 Oct): never a gate, a record
  if (test || add) d.meta = JSON.stringify({ ...meta, ...add, ...(test ? { test } : {}) });
  // a Mog joins its parent's family, one generation down
  const parent = d.parent_id ? db.prepare('SELECT id, root_id, generation FROM games WHERE id = ?').get(d.parent_id) as { id: string; root_id: string | null; generation: number } | undefined : undefined;
  db.prepare(
    `INSERT INTO games (id, slug, title, tagline, blurb, difficulty, spec, prompt, featured, created_at, format, code, meta, cover, art_icon, art_wide, parent_id, root_id, generation, mog_prompt)
     VALUES (?, ?, ?, ?, ?, 'endless', '{}', ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, slug, meta.title, meta.tagline, meta.blurb, d.prompt, Date.now(), d.format === 'world' ? 'world' : 'custom', d.code, d.meta, d.cover,
    d.art_icon, d.art_wide, parent?.id ?? null, parent ? parent.root_id ?? parent.id : null, parent ? parent.generation + 1 : 0, parent ? d.mog_prompt : null);
  return true;
}

/* -------------------------------------------------------------------- mog -- */
/**
 * A Mog is a game made from another one plus an idea for how to beat it. The
 * family is the original and everything mogged from it, at any depth; it is
 * ranked by the Mog-off picks of players who have finished a run in both
 * games of that Mog-off (Elo, K = 32, from 1000), then by distinct players.
 * Players are ids the browser makes for itself: a signal, not an identity.
 */
export const getGameById = (id: string) =>
  db.prepare(`SELECT ${ROW} FROM games WHERE id = ? AND hidden = 0`).get(id) as GameRow | undefined;
export const mogsOf = (id: string) =>
  db.prepare(`SELECT ${ROW} FROM games WHERE parent_id = ? AND hidden = 0 ORDER BY created_at DESC`).all(id) as GameRow[];

export function recordRun(gameId: string, player: string, best: number | null) {
  const now = Date.now();
  db.prepare(
    `INSERT INTO plays (game_id, player, runs, best, first_at, last_at) VALUES (?, ?, 1, ?, ?, ?)
     ON CONFLICT(game_id, player) DO UPDATE SET runs = runs + 1, best = MAX(COALESCE(best, 0), COALESCE(excluded.best, 0)), last_at = excluded.last_at`
  ).run(gameId, player, best, now, now);
}
export function playerStats(gameId: string) {
  const r = db.prepare('SELECT COUNT(*) AS players, COALESCE(SUM(runs), 0) AS runs FROM plays WHERE game_id = ?').get(gameId) as { players: number; runs: number };
  return { players: r.players, runs: r.runs, runsPerPlayer: r.players ? +(r.runs / r.players).toFixed(1) : 0 };
}
const hasPlayed = (gameId: string, player: string) =>
  !!db.prepare('SELECT 1 FROM plays WHERE game_id = ? AND player = ? AND runs > 0').get(gameId, player);

export type MogOff = { childId: string; parentId: string; child: number; parent: number; uncounted: number; pick: string | null; played: { child: boolean; parent: boolean } };
export function mogOff(childId: string, voter?: string): MogOff | null {
  const g = getGameById(childId);
  if (!g?.parent_id) return null;
  const picks = db.prepare('SELECT voter, winner_id FROM mog_picks WHERE child_id = ?').all(childId) as { voter: string; winner_id: string }[];
  let child = 0, parent = 0, uncounted = 0;
  for (const p of picks) {
    if (!(hasPlayed(childId, p.voter) && hasPlayed(g.parent_id, p.voter))) { uncounted++; continue; }
    if (p.winner_id === childId) child++; else parent++;
  }
  const mine = voter ? picks.find((p) => p.voter === voter)?.winner_id ?? null : null;
  return { childId, parentId: g.parent_id, child, parent, uncounted, pick: mine, played: { child: !!voter && hasPlayed(childId, voter), parent: !!voter && hasPlayed(g.parent_id, voter) } };
}
export function castPick(childId: string, voter: string, winnerId: string | null) {
  const g = getGameById(childId);
  if (!g?.parent_id) return null;
  if (winnerId === null) db.prepare('DELETE FROM mog_picks WHERE child_id = ? AND voter = ?').run(childId, voter);
  else {
    if (winnerId !== childId && winnerId !== g.parent_id) return null;
    db.prepare(
      `INSERT INTO mog_picks (child_id, parent_id, voter, winner_id, created_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(child_id, voter) DO UPDATE SET winner_id = excluded.winner_id, created_at = excluded.created_at`
    ).run(childId, g.parent_id, voter, winnerId, Date.now());
  }
  return mogOff(childId, voter);
}

export type FamilyMember = GameRow & { elo: number; wins: number; losses: number; players: number; runs: number; rank: number };
/** The original and every Mog descended from it, ranked. */
export function family(gameId: string): FamilyMember[] {
  const g = getGameById(gameId);
  if (!g) return [];
  const root = g.root_id ?? g.id;
  const members = db.prepare(`SELECT ${ROW} FROM games WHERE (id = ? OR root_id = ?) AND hidden = 0 ORDER BY generation, created_at`).all(root, root) as GameRow[];
  const elo = new Map(members.map((m) => [m.id, 1000])), wins = new Map(members.map((m) => [m.id, 0])), losses = new Map(members.map((m) => [m.id, 0]));
  const ids = members.map((m) => m.id);
  const picks = ids.length > 1 ? db.prepare(`SELECT child_id, parent_id, voter, winner_id FROM mog_picks WHERE child_id IN (${ids.map(() => '?').join(',')}) ORDER BY created_at`).all(...ids) as { child_id: string; parent_id: string; voter: string; winner_id: string }[] : [];
  for (const p of picks) {
    if (!(hasPlayed(p.child_id, p.voter) && hasPlayed(p.parent_id, p.voter))) continue;
    const w = p.winner_id, l = w === p.child_id ? p.parent_id : p.child_id;
    if (!elo.has(w) || !elo.has(l)) continue;
    const ew = 1 / (1 + 10 ** ((elo.get(l)! - elo.get(w)!) / 400));
    elo.set(w, elo.get(w)! + 32 * (1 - ew)); elo.set(l, elo.get(l)! - 32 * (1 - ew));
    wins.set(w, wins.get(w)! + 1); losses.set(l, losses.get(l)! + 1);
  }
  const out = members.map((m) => { const s = playerStats(m.id); return { ...m, elo: Math.round(elo.get(m.id)!), wins: wins.get(m.id)!, losses: losses.get(m.id)!, players: s.players, runs: s.runs, rank: 0 }; });
  out.sort((a, b) => b.elo - a.elo || b.players - a.players || a.created_at - b.created_at);
  out.forEach((m, i) => { m.rank = i + 1; });
  return out;
}

/** What a catalogue tile shows beside its plays: likes, and how many Mogs challenge it. */
export type TileStats = { up: number; down: number; mogs: number };
export function tileStats(): Record<string, TileStats> {
  const out: Record<string, TileStats> = {};
  const at = (id: string) => (out[id] ??= { up: 0, down: 0, mogs: 0 });
  for (const r of db.prepare('SELECT game_id, SUM(value = 1) AS up, SUM(value = -1) AS down FROM votes GROUP BY game_id').all() as { game_id: string; up: number; down: number }[]) {
    Object.assign(at(r.game_id), { up: r.up ?? 0, down: r.down ?? 0 });
  }
  for (const r of db.prepare('SELECT parent_id, COUNT(*) AS n FROM games WHERE parent_id IS NOT NULL AND hidden = 0 GROUP BY parent_id').all() as { parent_id: string; n: number }[]) at(r.parent_id).mogs = r.n;
  return out;
}

export const bumpPlays = (id: string) =>
  db.prepare('UPDATE games SET plays = plays + 1 WHERE id = ?').run(id);

/** Best runs. Race worlds and 'time' games rank by time; 'score' by points; 'place' by finish. */
export function topScores(gameId: string, limit = 10, by: 'time' | 'score' | 'place' | 'level' | 'survival' | 'kart' = 'time') {
  // a kart race (the owner, 8 Oct): its score (lib/runtime/kart-score.js), then the time, then who posted first; and
  // each player once, by their best run (a name, as typed, any case)
  if (by === 'kart') {
    return db.prepare(`SELECT * FROM (SELECT s.*, ROW_NUMBER() OVER (PARTITION BY lower(trim(player)) ORDER BY ${KART_ORDER}) AS rn
      FROM scores s WHERE game_id = ? AND hidden = 0) WHERE rn = 1 ORDER BY ${KART_ORDER} LIMIT ?`).all(gameId, limit) as ScoreRow[];
  }
  const order = by === 'survival' ? 'time_ms DESC, gm DESC, kos DESC'
    : by === 'level' ? 'level DESC, gm DESC, time_ms ASC'
    : by === 'score' ? 'score DESC, time_ms ASC'
    : by === 'place' ? 'CASE WHEN place > 0 THEN place ELSE 99 END ASC, time_ms ASC'
    : 'CASE WHEN time_ms > 0 THEN time_ms ELSE 1e12 END ASC';
  return db.prepare(`SELECT * FROM scores WHERE game_id = ? AND hidden = 0 ORDER BY ${order} LIMIT ?`).all(gameId, limit) as ScoreRow[];
}

const KART_ORDER = 'score DESC, time_ms ASC, created_at ASC, id ASC';
/**
 * Where a player stands on a kart board after a run (one row a player): the board shows their best run, so the rank is
 * that run's (this one, or a better one already there): 1 + the players other than this one whose best run beats it.
 * best: whether this run is the one the board now shows.
 */
export function kartRank(gameId: string, player: string, score: number, timeMs: number) {
  const b = db.prepare(`SELECT score, time_ms FROM scores WHERE game_id = ? AND hidden = 0 AND lower(trim(player)) = lower(trim(?)) ORDER BY ${KART_ORDER} LIMIT 1`)
    .get(gameId, player) as { score: number; time_ms: number } | undefined;
  const best = !b || score > b.score || (score === b.score && timeMs <= b.time_ms);
  const s = best ? score : b.score, t = best ? timeMs : b.time_ms;
  const r = db.prepare(`SELECT COUNT(DISTINCT lower(trim(player))) AS n FROM scores WHERE game_id = ? AND hidden = 0 AND lower(trim(player)) <> lower(trim(?))
    AND (score > ? OR (score = ? AND time_ms < ?))`).get(gameId, player, s, s, t) as { n: number };
  return { rank: r.n + 1, best };
}
/** Every kart row of a game scored again under its constants (after they are measured, or the formula changes); idempotent. */
export function rescoreKart(gameId: string, C: KartConstants) {
  const rows = db.prepare('SELECT id, time_ms, place, gm, kos, est, progress, racer FROM scores WHERE game_id = ?').all(gameId) as
    { id: number; time_ms: number; place: number; gm: number | null; kos: number | null; est: number | null; progress: number | null; racer: string | null }[];
  const up = db.prepare('UPDATE scores SET score = ?, score_v = ?, tier = ? WHERE id = ?');
  for (const r of rows) {
    const p = KartScore.score({ timeMs: r.time_ms, place: r.place, gm: r.gm ?? 0, hits: r.kos ?? 0, estimated: !!r.est, progress: r.progress, racer: r.racer }, C);
    up.run(p.total, KartScore.V, p.tier.id, r.id);
  }
  return rows.length;
}

/** Fastest run per game, for the shelf metric. */
export function bestTimes(): Record<string, number> {
  const rows = db
    .prepare('SELECT game_id, MIN(time_ms) AS t FROM scores WHERE hidden = 0 GROUP BY game_id')
    .all() as { game_id: string; t: number }[];
  return Object.fromEntries(rows.map((r) => [r.game_id, r.t]));
}

export function insertScore(s: {
  gameId: string;
  player: string;
  timeMs: number;
  place: number;
  tempoReached: number;
  locks: number;
  bestStreak: number;
  score?: number | null;
  level?: number | null;
  gm?: number | null;
  kos?: number | null;
  /** a kart race's (8 Oct): see the columns above; hidden holds a run for review */
  kart?: { est: boolean; progress: number | null; racer: string | null; scoreV: number; tier: string; hidden: boolean };
}) {
  if (s.kart) {
    const k = s.kart;
    db.prepare(
      `INSERT INTO scores (game_id, player, time_ms, place, tempo_reached, locks, best_streak, created_at, score, level, gm, kos, est, progress, racer, score_v, tier, hidden)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(s.gameId, s.player, s.timeMs, s.place, s.tempoReached, s.locks, s.bestStreak, Date.now(), s.score ?? null, s.level ?? null, s.gm ?? null, s.kos ?? null,
      k.est ? 1 : 0, k.progress, k.racer, k.scoreV, k.tier, k.hidden ? 1 : 0);
    return;
  }
  db.prepare(
    `INSERT INTO scores (game_id, player, time_ms, place, tempo_reached, locks, best_streak, created_at, score, level, gm, kos)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(s.gameId, s.player, s.timeMs, s.place, s.tempoReached, s.locks, s.bestStreak, Date.now(), s.score ?? null, s.level ?? null, s.gm ?? null, s.kos ?? null);
}

/* ----------------------------------------------------------------- votes -- */
/**
 * Likes and dislikes, one per browser per game. With no accounts the voter is
 * a random id the browser generated for itself, which stops accidental double
 * votes and nothing more; it is a signal, not a ballot.
 */
export type VoteCounts = { up: number; down: number };

export function voteCounts(gameId: string): VoteCounts {
  const r = db
    .prepare(`SELECT SUM(value = 1) AS up, SUM(value = -1) AS down FROM votes WHERE game_id = ?`)
    .get(gameId) as { up: number | null; down: number | null };
  return { up: r.up ?? 0, down: r.down ?? 0 };
}

export function castVote(gameId: string, voter: string, value: -1 | 0 | 1) {
  if (value === 0) {
    db.prepare('DELETE FROM votes WHERE game_id = ? AND voter = ?').run(gameId, voter);
  } else {
    db.prepare(
      `INSERT INTO votes (game_id, voter, value, created_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(game_id, voter) DO UPDATE SET value = excluded.value, created_at = excluded.created_at`
    ).run(gameId, voter, value, Date.now());
  }
  return voteCounts(gameId);
}

/**
 * The recent catalogue, as raw specs. Used to balance generation choices so a
 * model's favourite option cannot take over the shelf.
 */
export function recentSpecs(limit = 24): unknown[] {
  return (db
    .prepare("SELECT spec FROM games WHERE format = 'race' ORDER BY created_at DESC LIMIT ?")
    .all(limit) as { spec: string }[]).map((r) => JSON.parse(r.spec));
}

export function logGeneration(g: {
  gameId: string | null;
  prompt: string;
  model: string;
  attempts: number;
  ok: boolean;
  findings: unknown;
  ms: number;
}) {
  db.prepare(
    `INSERT INTO generations (game_id, prompt, model, attempts, ok, findings, ms, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(g.gameId, g.prompt, g.model, g.attempts, g.ok ? 1 : 0, JSON.stringify(g.findings), g.ms, Date.now());
}
