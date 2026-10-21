/**
 * The dare loop (the owner, 10 Oct 2026): a player who made or played a game sends a link that dares someone to beat
 * their run, at /g/<slug>/dare/<id>. No accounts: the sender is their browser's id (app/anon.ts playerId), kept
 * private, and the name on the dare is the one they typed (lib/names.ts).
 *
 * A dare keeps its run's parts, never a score the client worked out: a kart race's score is worked out again from the
 * game's constants of the day (lib/kart-score.ts, exactly as app/api/scores/route.ts does), and a run the scores route
 * would hold for review is not a target. Every other board ranks what the run reports, with the scores route's checks.
 *
 * Server only (node:crypto, the database). The page's canvas card is lib/dare-card.ts.
 */
import { randomBytes } from 'node:crypto';
import { db, getGameById, getPlayableGameById, type GameRow } from './db';
import { isBot } from './analytics';
import { COOKIE, validSession } from '../app/admin/session';
import { worldMode, canMog, gpLaps, gpMinLapMs } from './custom-game';
import { optionsOf } from './world-options';
import { dna } from './mog-dna';
import { KartScore, kartConstants, checkKartRun, raceClock, ordinal, type KartConstants } from './kart-score';

/* ----------------------------------------------------------------- boards -- */
/** How a game ranks a run, the same as its page's board (app/g/[slug]/custom-page.tsx `by`). */
export type Board = 'kart' | 'survival' | 'level' | 'score' | 'time' | 'place';
type GameLike = Pick<GameRow, 'format' | 'code' | 'meta'>;

export function boardOf(game: GameLike): Board {
  if (game.format === 'world') {
    const mode = worldMode(game.code, game.meta);
    // (a penalty shootout, 12 Oct: the goals scored, on the score board)
    // (a Grand Prix, 18 Oct: the fastest race first)
    return mode === 'kart' ? 'kart' : mode === 'race' ? 'level' : mode === 'shootout' ? 'score' : mode === 'gp' ? 'time' : 'survival';
  }
  if (game.format === 'custom') {
    let s: unknown;
    try { s = (JSON.parse(game.meta ?? '{}') as { scoring?: unknown }).scoring; } catch { /* a score */ }
    return s === 'time' || s === 'place' || s === 'level' ? s : 'score';
  }
  return 'time';
}

/** A run as a dare keeps it: the parts its board ranks, and a kart race's score as the server worked it out. */
export type DareRun = {
  timeMs: number; place: number; laps: number | null; gm: number; hits: number; est: boolean; progress: number | null;
  racer: string | null; level: number; kos: number; survival: boolean; score: number | null;
};

/** What a game's runs are checked and scored against: its board, a kart race's constants and laps, and whether it has GM. */
function contextOf(game: GameLike) {
  const board = boardOf(game);
  const kart = board === 'kart' && game.code ? dna(game.code).kart : null;
  const C: KartConstants | null = board === 'kart' ? kartConstants(game.meta, game.code, kart) : null;
  let cast = 8;
  try { cast = (JSON.parse(game.meta ?? '{}') as { cast?: unknown[] }).cast?.length ?? 8; } catch { /* the default */ }
  // (a penalty shootout's run is its goals, from that many kicks)
  const shootout = game.format === 'world' && board === 'score';
  const gp = game.format === 'world' && worldMode(game.code, game.meta) === 'gp';
  return { board, C, laps: kart?.laps ?? null, coins: game.format === 'world' ? !!optionsOf(game).coins : true, cast, shootout, gp };
}

const int = (v: unknown) => Math.round(Number(v) || 0);

/**
 * A run posted with a dare or as a dare's answer: the result message a game sends its page (lib/custom-game.ts
 * hostScript finish(), as app/g/[slug]/play-frame.tsx receives it), checked as app/api/scores/route.ts checks it.
 * An assisted run, a kart run held for review or one out of range is refused, with a short reason.
 */
export function checkRun(game: GameLike, input: unknown): { ok: true; run: DareRun } | { ok: false; error: string } {
  const no = (error: string) => ({ ok: false as const, error });
  if (!input || typeof input !== 'object') return no('That run did not come through.');
  const b = input as Record<string, unknown>;
  if (b.assisted) return no('Assisted runs do not count.');
  const x = contextOf(game);
  const base = { laps: null, hits: 0, est: false, progress: null, racer: null, survival: false, score: null };
  if (x.board === 'kart' && x.C) {
    const c = checkKartRun(b, x.C, x.laps);
    if (!c.ok) return no(c.error);
    // (faster than the racer's perfect-run bound: the board holds it for the owner, and so does a dare)
    if (c.review) return no('That run is being checked.');
    const r = c.run;
    return { ok: true, run: { timeMs: r.timeMs, place: r.place, laps: r.laps, gm: r.gm, hits: r.hits, est: r.estimated, progress: r.progress, racer: r.racer,
      level: r.laps, kos: r.hits, survival: false, score: KartScore.score(r, x.C).total } };
  }
  const level = Number(b.level) || 0, gm = Number(b.gm) || 0, timeMs = Number(b.timeMs) || 0, kos = Math.max(0, int(b.kos));
  if (x.board === 'survival') {
    const secs = timeMs / 1000;
    if (!Number.isInteger(level) || level < 1 || level > 2 + secs / 4 || gm < 0 || gm > 60 + secs * 60 || kos > 5 + secs || timeMs < 1000 || timeMs > 6 * 60 * 60 * 1000) {
      return no('Result outside plausible range');
    }
    return { ok: true, run: { ...base, timeMs: Math.round(timeMs), place: 0, gm: Math.round(gm), level, kos, survival: true } };
  }
  if (x.board === 'level' && game.format === 'world') {
    let floorMs = 0;
    for (let l = 1; l < Math.min(level, 1000); l++) floorMs += (320 / (28 * Math.min(1.6, 1 + 0.05 * (l - 1)))) * 1000 * 0.9;
    if (!Number.isInteger(level) || level < 1 || level > 999 || gm < 0 || gm > level * 90 || timeMs < floorMs || timeMs > 6 * 60 * 60 * 1000) {
      return no('Result outside plausible range');
    }
    return { ok: true, run: { ...base, timeMs: Math.round(timeMs), place: 0, gm: Math.round(gm), level, kos, score: level * 1000 + Math.round(gm) } };
  }
  // (a penalty shootout, 12 Oct: as app/api/scores/route.ts checks it; its score is the goals, its level the kicks)
  if (x.shootout) {
    const goals = Number(b.score) || 0;
    if (!Number.isInteger(level) || level < 1 || level > 999 || !Number.isInteger(goals) || goals < 0 || goals > level || timeMs < 500 || timeMs > 30 * 60 * 1000) {
      return no('Result outside plausible range');
    }
    return { ok: true, run: { ...base, timeMs: Math.round(timeMs), place: 0, gm: 0, level, kos: 0, score: goals } };
  }
  // (a Grand Prix, 18 Oct: the race time, over its laps, and the place it finished in; the same bounds as app/api/scores/route.ts)
  if (x.gp) {
    const place = Number(b.place) || 0;
    // (only a race run to the flag counts: a car classified without finishing, or short of the world's own laps, is not a time)
    if (b.classified === true || level !== gpLaps(game.code)) return no('Only a finished race counts.');
    if (!Number.isInteger(level) || level < 1 || level > 5 || !Number.isInteger(place) || place < 1 || place > 20 || timeMs < level * gpMinLapMs(game.code) || timeMs > 60 * 60 * 1000) {
      return no('Result outside plausible range');
    }
    return { ok: true, run: { ...base, timeMs: Math.round(timeMs), place, gm: 0, level, kos: 0 } };
  }
  if (game.format === 'custom') {
    const score = Number(b.score) || 0, place = Number(b.place) || 0;
    if (![timeMs, score, place].every(Number.isFinite) || timeMs < 0 || timeMs > 60 * 60 * 1000 || Math.abs(score) > 1e9 || place < 0 || place > x.cast + 1) {
      return no('Result outside plausible range');
    }
    return { ok: true, run: { ...base, timeMs: Math.round(timeMs), place: Math.round(place), gm: Math.max(0, int(gm)), level: Math.max(0, int(level)), kos, score: Math.round(score) } };
  }
  // (a Classic race checks its runs against its spec's playtest; dares are for the worlds and written games)
  return no('Dares are not open on this game.');
}

/* ---------------------------------------------------------------- compare -- */
const cmp = (x: number, y: number) => (x === y ? 0 : x > y ? 1 : -1);
/** Positive when run a ranks above run b on the board, negative below, 0 level: the board's own order. */
export function compare(by: Board, a: DareRun, b: DareRun): number {
  switch (by) {
    case 'kart': case 'score': return cmp(a.score ?? 0, b.score ?? 0) || cmp(b.timeMs, a.timeMs);
    case 'survival': return cmp(a.timeMs, b.timeMs) || cmp(a.gm, b.gm) || cmp(a.kos, b.kos);
    case 'level': return cmp(a.level, b.level) || cmp(a.gm, b.gm) || cmp(b.timeMs, a.timeMs);
    case 'time': return cmp(b.timeMs || 1e12, a.timeMs || 1e12);
    case 'place': return cmp(b.place || 99, a.place || 99) || cmp(b.timeMs, a.timeMs);
  }
}
/** Whether run a beats run b (strictly: a tie is not a win). */
export const better = (by: Board, a: DareRun, b: DareRun) => compare(by, a, b) > 0;
/** How far a is ahead of b (negative: behind) in the board's first measure: points, ms, levels or places. */
export function margin(by: Board, a: DareRun, b: DareRun): number {
  switch (by) {
    case 'kart': case 'score': return (a.score ?? 0) - (b.score ?? 0);
    case 'survival': return a.timeMs - b.timeMs;
    case 'level': return a.level - b.level;
    case 'time': return b.timeMs - a.timeMs;
    case 'place': return (b.place || 99) - (a.place || 99);
  }
}

/* ---------------------------------------------------------------- words -- */
const n = (v: number) => Math.round(v).toLocaleString('en-US');
const clock = (ms: number) => { const t = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
const plural = (v: number, one: string) => `${n(v)} ${one}${Math.abs(v) === 1 ? '' : 's'}`;

/** A run in a few words, the big number of a dare: "8,412", "3:05", "Level 12", "58.32s", "2nd". */
export function headline(by: Board, run: DareRun): string {
  switch (by) {
    case 'kart': case 'score': return n(run.score ?? 0);
    case 'survival': return clock(run.timeMs);
    case 'level': return `Level ${run.level}`;
    case 'time': return `${(run.timeMs / 1000).toFixed(2)}s`;
    case 'place': return ordinal(run.place);
  }
}
/** A margin in words, without its sign: "462", "0:12", "2 levels", "1 place". */
export function marginText(by: Board, m: number): string {
  const a = Math.abs(m);
  switch (by) {
    case 'kart': case 'score': return n(a);
    case 'survival': return clock(a);
    case 'level': return plural(a, 'level');
    case 'time': return `${(a / 1000).toFixed(2)}s`;
    case 'place': return plural(a, 'place');
  }
}

/** A run as a dare shows it: the big number, its label and one line under it. */
export type Target = { board: Board; value: number; text: string; label: string; sub: string; run: DareRun };
function describe(game: GameLike, run: DareRun): Target {
  const x = contextOf(game), by = x.board;
  const label = x.shootout ? 'Goals to beat' : by === 'kart' || by === 'score' ? 'Score to beat' : by === 'level' ? 'Level to beat' : by === 'place' ? 'Place to beat' : 'Time to beat';
  const sub = x.shootout ? `from ${plural(run.level, 'kick')}`
    : by === 'kart' ? `${ordinal(run.place)} of ${x.C?.karts ?? 8} · ${raceClock(run.timeMs)}`
    : by === 'survival' ? (x.coins ? `${n(run.gm)} GM` : plural(run.kos, 'takedown'))
    : by === 'level' ? `${n(run.gm)} GM · ${clock(run.timeMs)}`
    : by === 'score' ? (run.timeMs > 0 ? clock(run.timeMs) : '')
    : by === 'time' ? (run.place > 0 ? ordinal(run.place) : '')
    : clock(run.timeMs);
  const value = by === 'kart' || by === 'score' ? run.score ?? 0 : by === 'level' ? run.level : by === 'place' ? run.place : run.timeMs;
  return { board: by, value, text: headline(by, run), label, sub, run };
}
/** A checked run, described: what the result route answers for the visitor's own run. */
export const describeRun = describe;

/* ------------------------------------------------------------------ dares -- */
/** The browser id behind a dare, a run or an event (app/anon.ts playerId): a UUID, or 32 hex digits. */
export const validPlayer = (v: unknown): v is string => typeof v === 'string' && /^[a-z0-9-]{16,64}$/i.test(v);
/** A dare's id: 10 random base64url characters (60 bits). */
export const validDareId = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{10}$/.test(v);
export const dareUrl = (slug: string, id: string) => `/g/${slug}/dare/${id}`;
export const dareCardUrl = (slug: string, id: string) => `/g/${slug}/dare/${id}/card`;

export type DareRow = {
  id: string; game_id: string; parent_dare: string | null; sender: string; name: string | null; message: string | null; board: Board;
  has_run: number; time_ms: number | null; place: number | null; laps: number | null; gm: number | null; hits: number | null; est: number | null;
  progress: number | null; racer: string | null; level: number | null; kos: number | null; survival: number | null; score: number | null;
  created_at: number; hidden: number; has_card: number;
};
const DARE = `id, game_id, parent_dare, sender, name, message, board, has_run, time_ms, place, laps, gm, hits, est, progress, racer, level, kos,
  survival, score, created_at, hidden, card IS NOT NULL AS has_card`;

/** A dare that is not hidden (the sender's id included: server code only, never served). */
export const getDare = (id: string) =>
  validDareId(id) ? db.prepare(`SELECT ${DARE} FROM dares WHERE id = ? AND hidden = 0`).get(id) as DareRow | undefined : undefined;

const runOf = (d: DareRow): DareRun | null => (d.has_run ? {
  timeMs: d.time_ms ?? 0, place: d.place ?? 0, laps: d.laps, gm: d.gm ?? 0, hits: d.hits ?? 0, est: !!d.est, progress: d.progress,
  racer: d.racer, level: d.level ?? 0, kos: d.kos ?? 0, survival: !!d.survival, score: d.score,
} : null);

/**
 * What a dare's sender must beat, worked out now: a kart run is checked and scored again with the game's constants of
 * today (they can be measured after the dare was sent); one that no longer passes, or would be held for review, is no
 * target. null: a dare with no run ("I mogged this. Your turn.").
 */
export function target(dare: DareRow, game?: GameLike | null): Target | null {
  const run = runOf(dare);
  const g = game ?? getPlayableGameById(dare.game_id);
  if (!run || !g) return null;
  if (boardOf(g) !== dare.board) return null;
  if (dare.board === 'kart') {
    const c = checkRun(g, { timeMs: run.timeMs, place: run.place, laps: run.laps, gm: run.gm, hits: run.hits, estimated: run.est, progress: run.progress, racer: run.racer });
    return c.ok ? describe(g, c.run) : null;
  }
  return describe(g, run);
}

/** A dare as anyone may see it (GET /api/dares/<id>, the dare page and its card): never the sender's id. */
export type DareView = {
  id: string; url: string; card: string; hasCard: boolean; createdAt: number;
  name: string | null; message: string | null; board: Board; target: Target | null; parent: string | null;
  game: { id: string; slug: string; title: string; tagline: string; cover: string; creator: string | null; parent: { slug: string; title: string } | null;
    /** whether it can be mogged back (lib/custom-game.ts canMog: every kind can today, a penalty shootout too since 13 Oct) */
    mog: boolean };
};
export function dareView(id: string, slug?: string): DareView | null {
  const d = getDare(id);
  const g = d ? getPlayableGameById(d.game_id) : undefined;
  if (!d || !g || (slug && g.slug !== slug)) return null;
  const p = g.parent_id ? getGameById(g.parent_id) : undefined;
  return {
    id: d.id, url: dareUrl(g.slug, d.id), card: dareCardUrl(g.slug, d.id), hasCard: !!d.has_card, createdAt: d.created_at,
    name: d.name, message: d.message, board: d.board, target: target(d, g), parent: d.parent_dare,
    game: { id: g.id, slug: g.slug, title: g.title, tagline: g.tagline, cover: `/g/${g.slug}/cover?plain`, creator: g.creator, parent: p ? { slug: p.slug, title: p.title } : null, mog: canMog(g) },
  };
}

/** A dare's card, for its route: the JPEG, or null (the route sends the game's cover). Only under its own game's slug. */
export function dareCard(id: string, slug: string): { card: Uint8Array | null } | null {
  if (!validDareId(id)) return null;
  const r = db.prepare(`SELECT d.card AS card FROM dares d JOIN games g ON g.id = d.game_id
    WHERE d.id = ? AND d.hidden = 0 AND g.slug = ? AND (g.hidden = 0 OR json_extract(g.meta, '$.unlisted') = 1)`).get(id, slug) as { card: Uint8Array | null } | undefined;
  return r ? { card: r.card ?? null } : null;
}

const newId = () => {
  for (;;) {
    const id = randomBytes(8).toString('base64url').slice(0, 10);
    if (!db.prepare('SELECT 1 FROM dares WHERE id = ?').get(id)) return id;
  }
};

/**
 * A new dare (POST /api/dares has checked everything first). Records 'sent' for the sender; a dare that answers
 * another on a different game (a Mog of it, sent back) records 'mogged_back' on that one. A sender who published the
 * game and had not named it yet names it with this dare's name.
 */
export function createDare(a: { game: GameRow; sender: string; name: string | null; message: string | null; parent: string | null; run: DareRun | null; card: Uint8Array | null }): string {
  const id = newId(), r = a.run, now = Date.now();
  db.prepare(`INSERT INTO dares (id, game_id, parent_dare, sender, name, message, board, has_run, time_ms, place, laps, gm, hits, est, progress, racer, level, kos, survival, score, created_at, card)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    id, a.game.id, a.parent, a.sender, a.name, a.message, boardOf(a.game), r ? 1 : 0,
    r?.timeMs ?? null, r?.place ?? null, r?.laps ?? null, r?.gm ?? null, r?.hits ?? null, r ? (r.est ? 1 : 0) : null, r?.progress ?? null, r?.racer ?? null,
    r?.level ?? null, r?.kos ?? null, r ? (r.survival ? 1 : 0) : null, r?.score ?? null, now, a.card);
  recordDareEvent(id, a.sender, 'sent', now);
  if (a.parent) {
    const p = getDare(a.parent);
    if (p && p.game_id !== a.game.id && p.sender !== a.sender) recordDareEvent(p.id, a.sender, 'mogged_back', now);
  }
  // (only the browser that published it: a game from before creators were kept is named at publish, never by a dare)
  if (a.name) db.prepare('UPDATE games SET creator = ? WHERE id = ? AND creator IS NULL AND creator_player = ?').run(a.name, a.game.id, a.sender);
  return id;
}

/* ----------------------------------------------------------------- events -- */
export const DARE_EVENTS = ['sent', 'opened', 'played', 'finished', 'beaten', 'mogged_back', 'shared'] as const;
export type DareEvent = (typeof DARE_EVENTS)[number];
/** One step of the funnel, once per dare, visitor and step (a repeat is ignored). */
export function recordDareEvent(dareId: string, visitor: string, kind: DareEvent, at = Date.now()) {
  db.prepare('INSERT OR IGNORE INTO dare_events (dare_id, visitor, kind, at) VALUES (?, ?, ?, ?)').run(dareId, visitor, kind, at);
}
/** The funnel since a time, for /admin: dares made, and the distinct visitor-dare pairs at each step. */
export function dareFunnel(since = 0): { dares: number } & Record<DareEvent, number> {
  const out = { dares: (db.prepare('SELECT COUNT(*) AS n FROM dares WHERE created_at >= ?').get(since) as { n: number }).n } as { dares: number } & Record<DareEvent, number>;
  for (const k of DARE_EVENTS) out[k] = 0;
  for (const r of db.prepare('SELECT kind, COUNT(*) AS n FROM dare_events WHERE at >= ? GROUP BY kind').all(since) as { kind: DareEvent; n: number }[]) out[r.kind] = r.n;
  return out;
}
/** Dares sent on each of these games (the family tree's "118 DARES"), hidden dares left out; a game with none is 0. */
export function dareCounts(gameIds: string[]): Record<string, number> {
  const out: Record<string, number> = Object.fromEntries(gameIds.map((id) => [id, 0]));
  if (!gameIds.length) return out;
  for (const r of db.prepare(`SELECT game_id, COUNT(*) AS n FROM dares WHERE hidden = 0 AND game_id IN (${gameIds.map(() => '?').join(',')}) GROUP BY game_id`).all(...gameIds) as { game_id: string; n: number }[]) out[r.game_id] = r.n;
  return out;
}
/** The latest dares for /admin, hidden ones included: what was said, on which game, and how far each one went. */
export type AdminDare = { id: string; slug: string; title: string; name: string | null; message: string | null; created_at: number; hidden: number; has_card: number; opened: number; played: number; finished: number; beaten: number };
export const adminDares = (limit = 80) => db.prepare(`SELECT d.id, g.slug, g.title, d.name, d.message, d.created_at, d.hidden, d.card IS NOT NULL AS has_card,
    (SELECT COUNT(*) FROM dare_events e WHERE e.dare_id = d.id AND e.kind = 'opened') AS opened,
    (SELECT COUNT(*) FROM dare_events e WHERE e.dare_id = d.id AND e.kind = 'played') AS played,
    (SELECT COUNT(*) FROM dare_events e WHERE e.dare_id = d.id AND e.kind = 'finished') AS finished,
    (SELECT COUNT(*) FROM dare_events e WHERE e.dare_id = d.id AND e.kind = 'beaten') AS beaten
  FROM dares d JOIN games g ON g.id = d.game_id ORDER BY d.created_at DESC LIMIT ?`).all(limit) as AdminDare[];
/** The owner's takedown from /admin: a hidden dare is not served, its card included. */
export const setDareHidden = (id: string, hidden: boolean) => db.prepare('UPDATE dares SET hidden = ? WHERE id = ?').run(hidden ? 1 : 0, id);

/* ------------------------------------------------------------------- card -- */
export const CARD_W = 1200, CARD_H = 630, CARD_MAX_BYTES = 350 * 1024;
/** A JPEG's width and height from its frame header (SOFn), or null when it is not a JPEG this can read. */
export function jpegSize(b: Uint8Array): { w: number; h: number } | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8 || b[2] !== 0xff) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    let m = b[i + 1];
    while (m === 0xff && i + 2 < b.length) { i++; m = b[i + 1]; }
    // (markers with no length: restarts, start of image, TEM)
    if ((m >= 0xd0 && m <= 0xd8) || m === 0x01) { i += 2; continue; }
    if (m === 0xd9 || m === 0xda) return null;
    const len = (b[i + 2] << 8) | b[i + 3];
    if (len < 2) return null;
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8] };
    i += 2 + len;
  }
  return null;
}
/** An uploaded card: a JPEG, at most 350 KB, exactly 1200 x 630. */
export function checkCard(b: Uint8Array): { ok: true } | { ok: false; error: string } {
  if (b.length > CARD_MAX_BYTES) return { ok: false, error: 'card too large' };
  const s = jpegSize(b);
  if (!s) return { ok: false, error: 'card is not a JPEG' };
  if (s.w !== CARD_W || s.h !== CARD_H) return { ok: false, error: `card is ${s.w}x${s.h}, not ${CARD_W}x${CARD_H}` };
  return { ok: true };
}
/** A base64 card (plain or a data: URL) as bytes, or null when it is not base64 or is far too big to be one. */
export function decodeCard(v: unknown): Uint8Array | null {
  if (typeof v !== 'string' || !v) return null;
  const s = v.replace(/^data:image\/jpeg;base64,/, '');
  if (s.length > Math.ceil(CARD_MAX_BYTES / 3) * 4 + 8 || !/^[A-Za-z0-9+/_-]+=*$/.test(s)) return null;
  return new Uint8Array(Buffer.from(s, 'base64'));
}

/* ------------------------------------------------------------- the limits -- */
/**
 * Dare creation, per address (POST /api/dares): 10 in 10 minutes. In memory only (the address is never stored); a
 * restart forgets it, which is fine for a limit this coarse. And all cards together, per day, so a flood of dares
 * cannot fill the disk: past the budget a dare is still made, and its link previews with the game's cover.
 */
const LIMIT = { max: 10, windowMs: 10 * 60_000 };
const seen = new Map<string, number[]>();
export function rateOk(key: string, now = Date.now()): boolean {
  const t = (seen.get(key) ?? []).filter((x) => now - x < LIMIT.windowMs);
  if (t.length >= LIMIT.max) { seen.set(key, t); return false; }
  t.push(now);
  seen.set(key, t);
  if (seen.size > 5000) for (const [k, v] of seen) if (!v.some((x) => now - x < LIMIT.windowMs)) seen.delete(k);
  return true;
}
export const resetRate = () => seen.clear();
const CARD_BUDGET = 150 * 1024 * 1024;
let cardDay = { day: '', bytes: 0 };
/** Whether a card of this size still fits today's budget (and counts it when it does). */
export function cardBudgetOk(bytes: number, now = Date.now()): boolean {
  const day = new Date(now).toISOString().slice(0, 10);
  if (cardDay.day !== day) cardDay = { day, bytes: 0 };
  if (cardDay.bytes + bytes > CARD_BUDGET) return false;
  cardDay.bytes += bytes;
  return true;
}
/** The address a request came from, for the rate limit only: Cloudflare's header, else the first forwarded-for. */
export function clientKey(req: Request): string {
  const h = req.headers;
  return h.get('cf-connecting-ip') ?? h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? 'local';
}
/** The checks app/api/hit/route.ts makes: no crawlers, and only the site's own pages. */
export function fromOwnPage(req: Request): boolean {
  const site = req.headers.get('sec-fetch-site');
  return !isBot(req.headers.get('user-agent') ?? '') && !(site && site !== 'same-origin');
}
/** Whether the request carries the owner's /admin session: the owner's own visits are not the funnel. */
export function ownerVisit(req: Request): boolean {
  const c = (req.headers.get('cookie') ?? '').split(/;\s*/).find((p) => p.startsWith(`${COOKIE}=`));
  return validSession(c ? decodeURIComponent(c.slice(COOKIE.length + 1)) : undefined);
}
