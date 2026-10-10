import { db } from './db';
import { laDay } from './build-limits';

/**
 * The dare loop on /admin (10 Oct 2026): read-only numbers for today (Los Angeles's day, as the build ceiling counts it)
 * and the last 7 days, from the tables the loop writes (lib/db.ts dares, dare_events) and the ones the site already
 * keeps (plays, games). Nothing here writes. The success metrics are Codex's, approved by the owner: completed first
 * races, voluntary replays, successful Mogs, shared playable links and the share of dared players who start a race.
 *
 * The funnel after "sent" follows people: everyone who reached a dare in the window (their first step on it then),
 * and how far each of them got on it since. A finish counts as a press of Play and a win as a finish, so the steps
 * always narrow, even when a page's beacon was lost. The sender's own steps and the owner's are never recorded
 * (app/api/dares/[id]/event and result routes).
 */

const HOUR = 3_600_000, DAY = 24 * HOUR;
const one = (sql: string, ...args: (number | string)[]) => Number((db.prepare(sql).get(...args) as { n: number | null } | undefined)?.n ?? 0);

/** One window of the loop. Counts of people are visitor-and-dare pairs (one person on two dares is two), except where named. */
export type LoopWindow = {
  from: number; to: number;
  /** dares made in the window, and how many of those someone has opened since */
  sent: number; sentOpened: number;
  /** people who reached a dare in the window, and of them who pressed Play, finished, and beat it */
  opened: number; played: number; finished: number; beaten: number;
  /** answers: a dared player sent a dare back on a Mog of the game; and dare links shared or copied (anyone, the sender too) */
  moggedBack: number; shared: number;
  /** distinct people: who reached a dare, who of them pressed Play on one, and who went on to send a dare of their own */
  recipients: number; racers: number; passedOn: number;
  /** distinct players: whose first finished run ever was in the window; who finished any run in it; and whose run in it
   *  was a repeat of a game they had finished before (latest run in the window, two or more on that game) */
  firstRaces: number; finishers: number; replayers: number;
  /** Mogs published in the window (players' games with a parent; the site's own featured games left out) */
  mogs: number;
};

/** A dare most opened in the last 7 days, hidden ones included (marked): the steps are counted in the 7 days. */
export type TopDare = {
  id: string; url: string; slug: string; title: string; name: string | null; message: string | null; createdAt: number; hidden: boolean;
  opened: number; played: number; beaten: number;
};

export type DareLoop = { day: string; today: LoopWindow; week: LoopWindow; top: TopDare[] };

const STEPS = "'opened', 'played', 'finished', 'beaten'";
/**
 * A dare that really went out: its link was shared or copied, or someone opened it. The send-the-dare panel and the
 * Dare sheet make a dare row (and its 'sent' event) as they open and again on each edit, so they can share inside the
 * tap; a row alone is a panel opened, not a dare sent.
 */
const WENT_OUT = `EXISTS (SELECT 1 FROM dare_events e WHERE e.dare_id = d.id AND e.kind IN ('shared', ${STEPS}))`;

export function loopWindow(from: number, to: number): LoopWindow {
  const sent = db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(EXISTS (SELECT 1 FROM dare_events e WHERE e.dare_id = d.id AND e.kind IN (${STEPS}))), 0) AS opened
    FROM dares d WHERE d.created_at >= ? AND d.created_at < ? AND ${WENT_OUT}`).get(from, to) as { n: number; opened: number };

  // everyone on a dare: their first step on it, and the furthest they got (only dares with a step in the window can
  // hold a first step in it, which the time index finds)
  const pairs = `SELECT dare_id, visitor, MIN(at) AS first,
      MAX(kind IN ('played', 'finished', 'beaten')) AS played, MAX(kind IN ('finished', 'beaten')) AS finished, MAX(kind = 'beaten') AS beaten
    FROM dare_events WHERE kind IN (${STEPS}) AND dare_id IN (SELECT dare_id FROM dare_events WHERE at >= ? AND at < ? AND kind IN (${STEPS}))
    GROUP BY dare_id, visitor HAVING MIN(at) >= ? AND MIN(at) < ?`;
  const f = db.prepare(`SELECT COUNT(*) AS opened, COALESCE(SUM(played), 0) AS played, COALESCE(SUM(finished), 0) AS finished, COALESCE(SUM(beaten), 0) AS beaten,
      COUNT(DISTINCT visitor) AS recipients, COUNT(DISTINCT CASE WHEN played THEN visitor END) AS racers
    FROM (${pairs})`).get(from, to, from, to) as { opened: number; played: number; finished: number; beaten: number; recipients: number; racers: number };
  // a dared player who later sent a dare of their own (on any game, any dare but the one that reached them)
  const passedOn = one(`SELECT COUNT(DISTINCT p.visitor) AS n FROM (${pairs}) p
    JOIN (SELECT id, sender, created_at FROM dares d WHERE created_at >= ? AND ${WENT_OUT}) s ON s.sender = p.visitor AND s.id != p.dare_id AND s.created_at >= p.first`, from, to, from, to, from);

  const ev = (kind: string) => one('SELECT COUNT(*) AS n FROM dare_events WHERE kind = ? AND at >= ? AND at < ?', kind, from, to);

  return {
    from, to,
    sent: sent.n, sentOpened: sent.opened,
    opened: f.opened, played: f.played, finished: f.finished, beaten: f.beaten,
    moggedBack: ev('mogged_back'), shared: ev('shared'),
    recipients: f.recipients, racers: f.racers, passedOn,
    firstRaces: one('SELECT COUNT(*) AS n FROM (SELECT MIN(first_at) AS f FROM plays GROUP BY player) WHERE f >= ? AND f < ?', from, to),
    finishers: one('SELECT COUNT(DISTINCT player) AS n FROM plays WHERE last_at >= ? AND last_at < ?', from, to),
    replayers: one('SELECT COUNT(DISTINCT player) AS n FROM plays WHERE runs >= 2 AND last_at >= ? AND last_at < ?', from, to),
    mogs: one('SELECT COUNT(*) AS n FROM games WHERE parent_id IS NOT NULL AND featured = 0 AND created_at >= ? AND created_at < ?', from, to),
  };
}

/** The five dares most opened since `from`, with their presses of Play and wins in the same time. */
export function topDares(from: number, to: number, limit = 5): TopDare[] {
  const rows = db.prepare(`SELECT d.id, g.slug, g.title, d.name, d.message, d.created_at, d.hidden,
      SUM(e.kind = 'opened') AS opened, SUM(e.kind = 'played') AS played, SUM(e.kind = 'beaten') AS beaten
    FROM dare_events e JOIN dares d ON d.id = e.dare_id JOIN games g ON g.id = d.game_id
    WHERE e.at >= ? AND e.at < ? AND e.kind IN ('opened', 'played', 'beaten')
    GROUP BY d.id HAVING SUM(e.kind = 'opened') > 0
    ORDER BY opened DESC, played DESC, d.created_at DESC LIMIT ?`).all(from, to, limit) as {
      id: string; slug: string; title: string; name: string | null; message: string | null; created_at: number; hidden: number; opened: number; played: number; beaten: number;
    }[];
  // (plain objects: the admin page hands these to the browser)
  return rows.map((r) => ({
    id: r.id, url: `/g/${r.slug}/dare/${r.id}`, slug: r.slug, title: r.title, name: r.name, message: r.message, createdAt: r.created_at,
    hidden: !!r.hidden, opened: r.opened, played: r.played, beaten: r.beaten,
  }));
}

/** Everything the Dare loop tab shows: today (Los Angeles), the last 7 days, and the top five dares of the 7 days. */
export function dareLoop(now = Date.now()): DareLoop {
  const { day, from } = laDay(now), end = now + 1;
  return { day, today: loopWindow(from, end), week: loopWindow(now - 7 * DAY, end), top: topDares(now - 7 * DAY, end) };
}
