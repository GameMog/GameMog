import { db, interruptBuilds } from './db';
import { runningRows } from './build-limits';

/**
 * First-party analytics for the pilot, and everything /admin reads.
 *
 * A visitor is the random id the browser made for itself (app/anon.ts), the
 * same id that already stands behind votes and finished runs, so a visit can
 * be followed to a finished run without knowing who anyone is. No IP address
 * is stored, no cookie is set on visitors, and nothing leaves this server.
 */

export type EventKind = 'view' | 'play';
export type Device = 'phone' | 'tablet' | 'desktop';

export function deviceOf(ua: string): Device {
  if (/iPad|Tablet|PlayBook|Silk|Android(?!.*Mobile)/i.test(ua)) return 'tablet';
  if (/Mobi|iPhone|iPod|Android/i.test(ua)) return 'phone';
  return 'desktop';
}

/** Link unfurlers, crawlers, headless browsers and scripts are not visitors. */
export const isBot = (ua: string) =>
  !ua || /bot|crawl|spider|slurp|preview|headless|lighthouse|facebookexternalhit|embedly|pinterest|whatsapp|telegram|discord|slack|skype|curl|wget|python|node-fetch|axios|go-http/i.test(ua);

export function recordEvent(e: { visitor: string; kind: EventKind; path: string; ref?: string | null; source?: string | null; device: Device }) {
  db.prepare('INSERT INTO events (at, visitor, kind, path, ref, source, device) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(Date.now(), e.visitor, e.kind, e.path, e.ref ?? null, e.source ?? null, e.device);
}

/* ---------------------------------------------------------------- ranges -- */
export const RANGES = ['24h', '7d', '30d'] as const;
export type Range = (typeof RANGES)[number];
const HOUR = 3_600_000, DAY = 24 * HOUR;
const SPAN: Record<Range, number> = { '24h': DAY, '7d': 7 * DAY, '30d': 30 * DAY };

const one = (sql: string, ...args: number[]) => Number((db.prepare(sql).get(...args) as { n: number | null }).n ?? 0);

/* ----------------------------------------------------------------- spend -- */
/**
 * Before 9 Oct GameMog did not record tokens, so an older build's spend is
 * estimated from how long it wrote for, calibrated on builds whose tokens were
 * counted (25 Sep): about $0.11 a minute for a world and $0.17 for a Mog, which
 * also reads the original's code, and never more than a full pass ($0.84 and
 * $1.35) per pass. A quick race spec from the first days costs cents; a
 * stalled build is capped. Since the owner's safety limits (9 Oct) a build
 * records what each pass really used, priced in lib/build-limits.ts
 * (cost_usd), and that is what buildSpend reads; the Console has the bill.
 */
const RATE = { world: { minute: 0.11, pass: 0.84 }, mog: { minute: 0.17, pass: 1.35 } };
export function buildCost(b: { model: string; attempts: number; ms: number }) {
  if (b.model === 'offline') return 0;
  const r = b.model.includes('+mog') ? RATE.mog : RATE.world;
  const passes = b.attempts > 0 ? b.attempts : Math.min(2, Math.max(1, Math.round(b.ms / 720_000)));
  // the rates were measured on Opus 5.5; Sonnet 5.5 costs half per token, so a
  // pass costs half (it also writes faster, so the per-minute rate stands)
  const price = b.model.startsWith('claude-sonnet') ? 0.5 : 1;
  return Math.min((b.ms / 60_000) * r.minute, passes * r.pass * price);
}

/** How a build stands (lib/db.ts): a row from before 9 Oct has no status, and ended as its ok says. */
export type BuildStatus = 'running' | 'done' | 'error' | 'abandoned' | 'interrupted';
type BuildRow = { model: string; attempts: number; ok: number; ms: number; status: string | null; cost_usd: number | null; usage: string | null };
const statusOf = (b: BuildRow): BuildStatus => (b.status as BuildStatus | null) ?? (b.ok ? 'done' : 'error');
/**
 * What a build cost: its passes' real cost when it has one, else (a build from before 9 Oct) the estimate. `floor`:
 * a pass was cut short before its output was counted (the creator left, or the server stopped under it), so it cost
 * at least this. A build logged since with no cost never reached the model.
 */
export function buildSpend(b: BuildRow): { usd: number; estimated: boolean; floor: boolean } {
  let partial = false;
  try { partial = !!b.usage && !!(JSON.parse(b.usage) as { partial?: boolean }).partial; } catch { /* keep false */ }
  if (b.cost_usd != null) return { usd: b.cost_usd, estimated: false, floor: partial || b.status === 'interrupted' };
  if (b.status != null) return { usd: 0, estimated: false, floor: b.status === 'interrupted' };
  return { usd: buildCost(b), estimated: true, floor: false };
}

/* -------------------------------------------------------------- overview -- */
export type Kpis = {
  visitors: number; views: number; gameViewers: number; starters: number; starts: number; finishers: number;
  createViewers: number; builds: number; buildsOk: number; buildMinutes: number; published: number; mogs: number; spend: number;
  // builds the creator left before the end, builds a restart stopped, and builds running now (their spend so far is in
  // spend, so each is a build to share it by); and how much of the spend is estimated
  abandoned: number; interrupted: number; running: number; spendEstimated: number;
};

function kpis(from: number, to: number): Kpis {
  const views = (extra = '') => `FROM events WHERE kind = 'view' ${extra} AND at >= ? AND at < ?`;
  const builds = db.prepare("SELECT model, attempts, ok, ms, status, cost_usd, usage FROM generations WHERE model != 'offline' AND created_at >= ? AND created_at < ?").all(from, to) as BuildRow[];
  const pub = db.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(parent_id IS NOT NULL), 0) AS mogs FROM games WHERE featured = 0 AND created_at >= ? AND created_at < ?').get(from, to) as { n: number; mogs: number };
  // a build counts as built once it ended with a world or without one; one still running, left or stopped is counted apart
  const ended = builds.filter((b) => ['done', 'error'].includes(statusOf(b))), done = ended.filter((b) => b.ok);
  const spent = builds.map(buildSpend);
  return {
    visitors: one(`SELECT COUNT(DISTINCT visitor) AS n ${views()}`, from, to),
    views: one(`SELECT COUNT(*) AS n ${views()}`, from, to),
    gameViewers: one(`SELECT COUNT(DISTINCT visitor) AS n ${views("AND path LIKE '/g/%'")}`, from, to),
    starters: one("SELECT COUNT(DISTINCT visitor) AS n FROM events WHERE kind = 'play' AND at >= ? AND at < ?", from, to),
    starts: one("SELECT COUNT(*) AS n FROM events WHERE kind = 'play' AND at >= ? AND at < ?", from, to),
    finishers: one('SELECT COUNT(DISTINCT player) AS n FROM plays WHERE last_at >= ? AND last_at < ?', from, to),
    createViewers: one(`SELECT COUNT(DISTINCT visitor) AS n ${views("AND path = '/create'")}`, from, to),
    builds: ended.length,
    buildsOk: done.length,
    buildMinutes: done.length ? done.reduce((s, b) => s + b.ms, 0) / done.length / 60_000 : 0,
    published: pub.n,
    mogs: pub.mogs,
    spend: spent.reduce((s, c) => s + c.usd, 0),
    abandoned: builds.filter((b) => b.status === 'abandoned').length,
    interrupted: builds.filter((b) => b.status === 'interrupted').length,
    running: builds.filter((b) => b.status === 'running').length,
    spendEstimated: spent.reduce((s, c) => s + (c.estimated ? c.usd : 0), 0),
  };
}

export type Point = { at: number; visitors: number; views: number };
export type Row = { label: string; href?: string; value: number; sub?: number };
export type Stats = {
  range: Range; now: Kpis; before: Kpis; series: Point[]; bucket: 'hour' | 'day';
  pages: Row[]; sources: Row[]; devices: Row[]; games: Row[];
};

/** Everything the Overview and Traffic tabs show for one range, with the range before it for comparison. */
export function stats(range: Range, now = Date.now()): Stats {
  const span = SPAN[range], from = now - span;

  // buckets start on the hour, or at local midnight, so the chart's last
  // point is the one still filling up
  const hourly = range === '24h', size = hourly ? HOUR : DAY, count = hourly ? 24 : span / DAY;
  const end = new Date(now);
  if (hourly) end.setMinutes(0, 0, 0); else end.setHours(0, 0, 0, 0);
  const first = end.getTime() - (count - 1) * size;
  const series: Point[] = Array.from({ length: count }, (_, i) => ({ at: first + i * size, visitors: 0, views: 0 }));
  for (const r of db.prepare("SELECT CAST((at - ?) / ? AS INTEGER) AS b, COUNT(*) AS views, COUNT(DISTINCT visitor) AS visitors FROM events WHERE kind = 'view' AND at >= ? GROUP BY b").all(first, size, first) as { b: number; views: number; visitors: number }[]) {
    const p = series[Math.floor(r.b)];
    if (p) { p.views = r.views; p.visitors = r.visitors; }
  }

  const titles = new Map((db.prepare('SELECT slug, title FROM games').all() as { slug: string; title: string }[]).map((g) => [g.slug, g.title]));
  const pageName = (path: string) => {
    if (path === '/') return 'Home';
    const g = path.match(/^\/g\/([a-z0-9-]+)/);
    if (g) return titles.get(g[1]) ?? path;
    const m = path.match(/^\/mog\/([a-z0-9-]+)/);
    if (m) return `Mog: ${titles.get(m[1]) ?? m[1]}`;
    return path;
  };
  const pages = (db.prepare("SELECT path, COUNT(*) AS n, COUNT(DISTINCT visitor) AS v FROM events WHERE kind = 'view' AND at >= ? GROUP BY path ORDER BY n DESC LIMIT 12").all(from) as { path: string; n: number; v: number }[])
    .map((r) => ({ label: pageName(r.path), href: r.path, value: r.n, sub: r.v }));

  // where a visit came from is recorded once, on the page it landed on
  const visitors = one("SELECT COUNT(DISTINCT visitor) AS n FROM events WHERE kind = 'view' AND at >= ?", from);
  const referred = db.prepare("SELECT COALESCE(source, ref) AS s, COUNT(DISTINCT visitor) AS n FROM events WHERE kind = 'view' AND at >= ? AND (source IS NOT NULL OR ref IS NOT NULL) GROUP BY s ORDER BY n DESC LIMIT 10").all(from) as { s: string; n: number }[];
  const withSource = one("SELECT COUNT(DISTINCT visitor) AS n FROM events WHERE kind = 'view' AND at >= ? AND (source IS NOT NULL OR ref IS NOT NULL)", from);
  const sources: Row[] = [...referred.map((r) => ({ label: r.s, value: r.n })), ...(visitors - withSource > 0 ? [{ label: 'Direct or unknown', value: visitors - withSource }] : [])]
    .sort((a, b) => b.value - a.value);

  const devices = (db.prepare("SELECT device, COUNT(DISTINCT visitor) AS n FROM events WHERE kind = 'view' AND at >= ? GROUP BY device ORDER BY n DESC").all(from) as { device: string; n: number }[])
    .map((r) => ({ label: r.device[0].toUpperCase() + r.device.slice(1), value: r.n }));

  // a game's reach: people who opened it, and how many pressed Play
  const opened = db.prepare("SELECT substr(path, 4) AS slug, COUNT(DISTINCT visitor) AS n FROM events WHERE kind = 'view' AND path LIKE '/g/%' AND at >= ? GROUP BY slug").all(from) as { slug: string; n: number }[];
  const pressed = new Map((db.prepare("SELECT substr(path, 4) AS slug, COUNT(DISTINCT visitor) AS n FROM events WHERE kind = 'play' AND at >= ? GROUP BY slug").all(from) as { slug: string; n: number }[]).map((r) => [r.slug, r.n]));
  const games = opened.filter((r) => titles.has(r.slug)).sort((a, b) => b.n - a.n).slice(0, 10)
    .map((r) => ({ label: titles.get(r.slug)!, href: `/g/${r.slug}`, value: r.n, sub: pressed.get(r.slug) ?? 0 }));

  return { range, now: kpis(from, now), before: kpis(from - span, from), series, bucket: hourly ? 'hour' : 'day', pages, sources, devices, games };
}

/** People on the site in the last five minutes. */
export const activeNow = () => one("SELECT COUNT(DISTINCT visitor) AS n FROM events WHERE at >= ?", Date.now() - 5 * 60_000);

/* ------------------------------------------------------------ moderation -- */
// node:sqlite rows have no prototype; the admin page hands these to the
// browser, which takes plain objects only, hence the spreads below.
export type AdminWorld = {
  id: string; slug: string; title: string; format: string; featured: number; plays: number; created_at: number; hidden: number;
  parent_title: string | null; prompt: string | null; mog_prompt: string | null; players: number; up: number; down: number; mogs: number;
};
export const adminWorlds = () => db.prepare(`
  SELECT g.id, g.slug, g.title, g.format, g.featured, g.plays, g.created_at, g.hidden, g.prompt, g.mog_prompt,
    (SELECT p.title FROM games p WHERE p.id = g.parent_id) AS parent_title,
    (SELECT COUNT(*) FROM plays p WHERE p.game_id = g.id) AS players,
    (SELECT COUNT(*) FROM votes v WHERE v.game_id = g.id AND v.value = 1) AS up,
    (SELECT COUNT(*) FROM votes v WHERE v.game_id = g.id AND v.value = -1) AS down,
    (SELECT COUNT(*) FROM games c WHERE c.parent_id = g.id) AS mogs
  FROM games g ORDER BY g.created_at DESC`).all().map((r) => ({ ...r })) as AdminWorld[];

/** A build on the Builds tab: how it stands, and what it cost (`estimated` before 9 Oct; `floor`: at least this). */
export type AdminBuild = {
  id: number; at: number; prompt: string; mogOf: string | null; photo: boolean; mog: boolean; passes: number; ok: boolean; minutes: number; cost: number; problem: string | null;
  status: BuildStatus; estimated: boolean; floor: boolean;
};
export function adminBuilds(limit = 80, now = Date.now()): AdminBuild[] {
  // a row still 'running' that this server is not running was left by one that stopped (deploy/boot.mjs marks them as
  // the server starts; this catches a server started without it, as on the Mac)
  interruptBuilds(runningRows());
  const rows = db.prepare("SELECT id, prompt, model, attempts, ok, findings, ms, created_at, status, cost_usd, usage FROM generations WHERE model != 'offline' ORDER BY id DESC LIMIT ?").all(limit) as (BuildRow & { id: number; prompt: string; findings: string; created_at: number })[];
  return rows.map((r) => {
    const m = r.prompt.match(/^\[mog of ([a-z0-9-]+)\] ([\s\S]*)$/);
    let problem: string | null = null;
    const status = statusOf(r), spend = buildSpend(r);
    if (status === 'error') {
      try { const f = JSON.parse(r.findings) as unknown[]; const x = f[0]; problem = typeof x === 'string' ? x : x && typeof x === 'object' && 'message' in x ? String((x as { message: unknown }).message) : null; } catch { /* keep null */ }
    }
    return {
      id: r.id, at: r.created_at, prompt: m ? m[2] : r.prompt, mogOf: m ? m[1] : null, photo: r.model.includes('+vision'), mog: r.model.includes('+mog'),
      passes: r.attempts, ok: !!r.ok, minutes: (status === 'running' ? now - r.created_at : r.ms) / 60_000, cost: spend.usd, problem,
      status, estimated: spend.estimated, floor: spend.floor,
    };
  });
}

export type AdminScore = { id: number; player: string; title: string; slug: string; time_ms: number; score: number | null; created_at: number; hidden: number };
export const adminScores = (limit = 120) => db.prepare(`
  SELECT s.id, s.player, g.title, g.slug, s.time_ms, s.score, s.created_at, s.hidden
  FROM scores s JOIN games g ON g.id = s.game_id ORDER BY s.id DESC LIMIT ?`).all(limit).map((r) => ({ ...r })) as AdminScore[];

export const setWorldHidden = (id: string, hidden: boolean) =>
  db.prepare('UPDATE games SET hidden = ? WHERE id = ?').run(hidden ? 1 : 0, id).changes > 0;
export const setScoreHidden = (id: number, hidden: boolean) =>
  db.prepare('UPDATE scores SET hidden = ? WHERE id = ?').run(hidden ? 1 : 0, id).changes > 0;
