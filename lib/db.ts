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
};

export type ScoreRow = {
  id: number;
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
  db.prepare('SELECT * FROM games WHERE slug = ?').get(slug) as GameRow | undefined;

export const listGames = (limit = 40) =>
  db
    .prepare('SELECT * FROM games ORDER BY featured DESC, created_at DESC LIMIT ?')
    .all(limit) as GameRow[];

export const bumpPlays = (id: string) =>
  db.prepare('UPDATE games SET plays = plays + 1 WHERE id = ?').run(id);

export const topScores = (gameId: string, limit = 10) =>
  db
    .prepare('SELECT * FROM scores WHERE game_id = ? ORDER BY time_ms ASC LIMIT ?')
    .all(gameId, limit) as ScoreRow[];

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
}) {
  db.prepare(
    `INSERT INTO scores (game_id, player, time_ms, place, tempo_reached, locks, best_streak, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(s.gameId, s.player, s.timeMs, s.place, s.tempoReached, s.locks, s.bestStreak, Date.now());
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
