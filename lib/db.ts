import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { WorldSpec } from './worldspec';

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
  add('scores', 'score', 'score INTEGER');
  add('scores', 'level', 'level INTEGER');
  add('scores', 'gm', 'gm INTEGER');
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
};

/** Columns that are large or binary stay out of list queries. */
const ROW = 'id, slug, title, tagline, blurb, difficulty, spec, prompt, featured, plays, created_at, format, code, meta';

export type ScoreRow = {
  id: number;
  score: number | null;
  level: number | null;
  gm: number | null;
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

export const getGameBySlug = (slug: string) =>
  db.prepare(`SELECT ${ROW} FROM games WHERE slug = ?`).get(slug) as GameRow | undefined;

export const listGames = (limit = 40) =>
  db
    .prepare(`SELECT ${ROW} FROM games ORDER BY featured DESC, created_at DESC LIMIT ?`)
    .all(limit) as GameRow[];

export function gameCover(slug: string): Uint8Array | undefined {
  const r = db.prepare('SELECT cover FROM games WHERE slug = ?').get(slug) as { cover: Uint8Array | null } | undefined;
  return r?.cover ?? undefined;
}

/* ---------------------------------------------------------------- drafts -- */
export type DraftRow = { id: string; prompt: string; meta: string; code: string; report: string; created_at: number; format: 'custom' | 'world' };

export function insertDraft(d: { id: string; prompt: string; meta: unknown; code: string; cover?: Uint8Array; report: unknown; format?: 'custom' | 'world' }) {
  db.prepare(`INSERT INTO drafts (id, prompt, meta, code, cover, report, created_at, format) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(d.id, d.prompt, JSON.stringify(d.meta), d.code, d.cover ?? null, JSON.stringify(d.report), Date.now(), d.format ?? 'custom');
}
export const getDraft = (id: string) =>
  db.prepare('SELECT id, prompt, meta, code, report, created_at, format FROM drafts WHERE id = ?').get(id) as DraftRow | undefined;
export function draftCover(id: string): Uint8Array | undefined {
  const r = db.prepare('SELECT cover FROM drafts WHERE id = ?').get(id) as { cover: Uint8Array | null } | undefined;
  return r?.cover ?? undefined;
}

/** Publish a draft as a custom game. The draft row is what was playtested. */
export function publishDraft(draftId: string, slug: string, id: string): boolean {
  const d = db.prepare('SELECT * FROM drafts WHERE id = ?').get(draftId) as (DraftRow & { cover: Uint8Array | null }) | undefined;
  if (!d) return false;
  const meta = JSON.parse(d.meta) as { title: string; tagline: string; blurb: string };
  db.prepare(
    `INSERT INTO games (id, slug, title, tagline, blurb, difficulty, spec, prompt, featured, created_at, format, code, meta, cover)
     VALUES (?, ?, ?, ?, ?, 'endless', '{}', ?, 0, ?, ?, ?, ?, ?)`
  ).run(id, slug, meta.title, meta.tagline, meta.blurb, d.prompt, Date.now(), d.format === 'world' ? 'world' : 'custom', d.code, d.meta, d.cover);
  return true;
}

export const bumpPlays = (id: string) =>
  db.prepare('UPDATE games SET plays = plays + 1 WHERE id = ?').run(id);

/** Best runs. Race worlds and 'time' games rank by time; 'score' by points; 'place' by finish. */
export function topScores(gameId: string, limit = 10, by: 'time' | 'score' | 'place' | 'level' = 'time') {
  const order = by === 'level' ? 'level DESC, gm DESC, time_ms ASC'
    : by === 'score' ? 'score DESC, time_ms ASC'
    : by === 'place' ? 'CASE WHEN place > 0 THEN place ELSE 99 END ASC, time_ms ASC'
    : 'CASE WHEN time_ms > 0 THEN time_ms ELSE 1e12 END ASC';
  return db.prepare(`SELECT * FROM scores WHERE game_id = ? ORDER BY ${order} LIMIT ?`).all(gameId, limit) as ScoreRow[];
}

/** Fastest run per game, for the shelf metric. */
export function bestTimes(): Record<string, number> {
  const rows = db
    .prepare('SELECT game_id, MIN(time_ms) AS t FROM scores GROUP BY game_id')
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
}) {
  db.prepare(
    `INSERT INTO scores (game_id, player, time_ms, place, tempo_reached, locks, best_streak, created_at, score, level, gm)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(s.gameId, s.player, s.timeMs, s.place, s.tempoReached, s.locks, s.bestStreak, Date.now(), s.score ?? null, s.level ?? null, s.gm ?? null);
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
