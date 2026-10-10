/**
 * The safety limits on builds (the owner, 9 Oct 2026: "let's do the four safety limits"; 10 Oct: "$50 a day", and a
 * line instead of an instant no). A build is one long request (app/api/generate/route.ts): the model writes the world,
 * the creator's page test-drives it, up to two repairs follow, minutes of the owner's key each. The limits, none of
 * them per person (the owner: no per-user caps):
 *  1. it stops when the creator leaves: the request's abort reaches the model's stream (lib/generate-game.ts) and the
 *     test drive's wait (lib/test-drive.ts), no further pass runs, and the build is logged 'abandoned'. A tab in the
 *     background is still connected, and keeps building;
 *  2. one cap for the whole site on builds at once, here: BUILD_SLOTS (default 10), counted in this server (there is
 *     one). A build holds its slot from its request to the end of its stream, test drive included. With every slot
 *     taken the request waits in one line, first come first served (admit, below), and is told its place and an honest
 *     wait, from how long recent builds took; a creator who leaves the line leaves it at once. Only a full line
 *     (BUILD_QUEUE_MAX, default 40) is answered BUSY at once. Nothing is spent on a build until it has its slot;
 *  3. a ceiling on the day's spend, site-wide: BUILD_DAILY_USD (default $50), the day being Los Angeles's calendar
 *     day. The day's spend is what its builds really cost (generations.cost_usd) plus IN_FLIGHT_USD for each build
 *     running now (or what it has cost so far, if more). At or over the ceiling no build starts, and the line is let
 *     go, with RESTING; a build already running always runs to its end;
 *  4. every build is logged as it starts (lib/db.ts startBuild) and finished as it ends; one the server stopped under
 *     (a deploy stops the builds in flight) is 'interrupted' when the server starts again (deploy/boot.mjs);
 *  5. its real cost: the tokens each pass used, summed and priced here, in the one price table.
 * A creator leaves by closing the tab, or within the site (a link, Back): the page lets its build go as it goes
 * (app/create/generation.tsx useGeneration). The race brief, which no page sends any more but a request still can,
 * takes a slot too, or is told BUSY at once (it does not wait in line); the selfie is a short single call, and stays
 * outside the cap.
 */
import { db } from './db';

/** What the creator is told when the line is full too (app/create/generation.tsx says it as it is). */
export const BUSY = 'GameMog is busy building other worlds. Try again in a minute.';
/** What the creator is told once the day's ceiling is reached: plain words, no numbers. */
export const RESTING = 'Building is resting for today. Every world is still free to play: come back tomorrow.';

const int = (v: string | undefined) => (v != null && v.trim() !== '' ? Math.floor(Number(v)) : NaN);
/** Builds at once, site-wide: BUILD_SLOTS on the server's Environment page, or 10 (the owner, 10 Oct). */
export function buildSlots() {
  const n = int(process.env.BUILD_SLOTS);
  return n >= 1 ? n : 10;
}
/** The longest the line gets: BUILD_QUEUE_MAX, or 40 (0: no line, every slot taken is BUSY at once). */
export function queueMax() {
  const n = int(process.env.BUILD_QUEUE_MAX);
  return n >= 0 ? n : 40;
}
/** The day's ceiling in dollars: BUILD_DAILY_USD, or 50 (the owner, 10 Oct: "$50 a day"). 0 builds nothing. */
export function dailyCeiling() {
  const v = process.env.BUILD_DAILY_USD?.trim(), n = v ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : 50;
}
/** What a build running now is counted at until its passes have cost more: a full Sonnet build with a repair. */
export const IN_FLIGHT_USD = 2;
/** How often the line is told where it stands (and the ceiling looked at again). */
export const QUEUE_PULSE_MS = 5000;

// one set of slots and one line for the whole process: each route is its own bundle (lib/test-drive.ts keeps its
// drives the same way)
type Slot = { row: number | null; at: number };
type Waiter = { at: number; resolve: (t: Turn) => void; moved: () => void };
const G = globalThis as unknown as { __gmBuildSlots?: Set<Slot>; __gmBuildQueue?: Waiter[]; __gmBuildPulse?: ReturnType<typeof setInterval> | null };
const held = (G.__gmBuildSlots ??= new Set<Slot>());
const line = (G.__gmBuildQueue ??= []);

/** A slot held by one build. Its release must run, and may run more than once; it lets the line move. */
export type Lease = { slot: Slot; release: () => void };
function lease(): Lease {
  const slot: Slot = { row: null, at: Date.now() };
  held.add(slot);
  let gone = false;
  return { slot, release: () => { if (gone) return; gone = true; held.delete(slot); pump(); } };
}

/** A slot for one build now, or null when every one is taken or someone is already waiting (no cutting in). */
export function takeSlot(): Lease | null {
  if (held.size >= buildSlots() || line.length) return null;
  return lease();
}
/** The slots taken now. */
export const slotsHeld = () => held.size;
/** The builds waiting for a slot now. */
export const queueLength = () => line.length;
/** The builds this server is running now, by their row in generations: any other row still 'running' was left by a server that stopped. */
export const runningRows = () => [...held].flatMap((s) => (s.row === null ? [] : [s.row]));

/* ------------------------------------------------------------------ line -- */
/** How a wait in line ended: a slot, or let go (the day's ceiling was reached) or left (the creator went). */
export type Turn = { lease: Lease } | { refused: 'resting' | 'left' };
/** A place in line: where it is (1 = next), the wait in minutes, its turn, and leaving (idempotent). */
export type Ticket = { position: () => number; etaMin: () => number; turn: Promise<Turn>; leave: () => void };
export type Admission = { kind: 'slot'; lease: Lease } | { kind: 'queued'; ticket: Ticket } | { kind: 'busy' } | { kind: 'resting' };

/**
 * A build's request, at the door: resting when the day's ceiling is reached, a slot at once when one is free and
 * nobody is waiting, else a place at the back of the line, or busy when the line is full. `moved` is called whenever
 * this place changes, and every QUEUE_PULSE_MS while it waits, to tell the creator.
 */
export function admit(moved: () => void = () => {}, now = Date.now()): Admission {
  if (resting(now)) return { kind: 'resting' };
  if (!line.length && held.size < buildSlots()) return { kind: 'slot', lease: lease() };
  if (line.length >= queueMax()) return { kind: 'busy' };
  let done = false, settle!: (t: Turn) => void;
  const turn = new Promise<Turn>((r) => { settle = r; });
  const w: Waiter = { at: now, moved, resolve: (t) => { if (!done) { done = true; settle(t); } } };
  line.push(w);
  pulse(true);
  const position = () => line.indexOf(w) + 1;
  return {
    kind: 'queued',
    ticket: {
      position,
      etaMin: () => { const p = position(); return p ? waitMinutes(p) : 0; },
      turn,
      leave: () => {
        const i = line.indexOf(w);
        if (i < 0) return;
        line.splice(i, 1);
        w.resolve({ refused: 'left' });
        for (const o of line.slice(i)) o.moved();
        if (!line.length) pulse(false);
      },
    },
  };
}

/**
 * The line moves: at or over the day's ceiling every waiting build is let go; else each free slot goes to the front
 * of the line, in order, and everyone behind is told their new place. Runs whenever a slot is released, and on the
 * pulse; safe to call at any time.
 */
export function pump(now = Date.now()) {
  let moved = false, first = true;
  // (the ceiling is looked at before each build is let in: each one let in counts toward the day at once)
  while (line.length && (first || held.size < buildSlots())) {
    first = false;
    if (resting(now)) { for (const w of line.splice(0)) w.resolve({ refused: 'resting' }); break; }
    if (held.size >= buildSlots()) break;
    line.shift()!.resolve({ lease: lease() });
    moved = true;
  }
  if (moved) for (const w of line) w.moved();
  if (!line.length) pulse(false);
}
// while anyone waits: the ceiling looked at again, and everyone told where they stand (a wait shortens as builds run)
function pulse(on: boolean) {
  if (on && !G.__gmBuildPulse) {
    const t = setInterval(() => { pump(); for (const w of line) w.moved(); }, QUEUE_PULSE_MS);
    t.unref?.();
    G.__gmBuildPulse = t;
  } else if (!on && G.__gmBuildPulse) { clearInterval(G.__gmBuildPulse); G.__gmBuildPulse = null; }
}

/**
 * Minutes until the build at `position` in line (1 = next) gets its slot: each running build is expected to end when
 * a typical build would (`avgMs` after it began, and at least a minute from now), each freed slot goes to the next in
 * line, and those builds run a typical build's time too. Rounded up, at least 1.
 */
export function queueEta(position: number, elapsedMs: number[], slots: number, avgMs: number) {
  const ends = elapsedMs.map((e) => Math.max(avgMs - e, 60_000)).sort((a, b) => a - b);
  let running = ends.length, t = 0;
  for (let k = 0; k < position; k++) {
    while (running >= slots && ends.length) { t = Math.max(t, ends.shift()!); running--; }
    running++;
    const at = t + avgMs, i = ends.findIndex((e) => e > at);
    ends.splice(i < 0 ? ends.length : i, 0, at);
  }
  return Math.max(1, Math.ceil(t / 60_000));
}
/** The wait for a place in this server's line, from its running builds and how long builds take. */
export function waitMinutes(position: number, now = Date.now()) {
  return queueEta(position, [...held].map((s) => now - s.at), buildSlots(), typicalBuildMs(now));
}

const TYPICAL_DEFAULT = 10 * 60_000;
let typical = { at: 0, ms: TYPICAL_DEFAULT };
/**
 * How long a build takes, for the wait: the mean of the last 20 builds that ran to an end (done, or an error after
 * a minute or more; a creator who left early says nothing about it), 10 minutes until there are 3, held between 3
 * and 30. Read again at most once a minute.
 */
export function typicalBuildMs(now = Date.now()) {
  if (now - typical.at < 60_000) return typical.ms;
  let ms = TYPICAL_DEFAULT;
  try {
    const r = db.prepare("SELECT ms FROM generations WHERE status IN ('done', 'error') AND ms >= 60000 ORDER BY id DESC LIMIT 20").all() as { ms: number }[];
    if (r.length >= 3) ms = Math.min(30 * 60_000, Math.max(3 * 60_000, r.reduce((s, x) => s + x.ms, 0) / r.length));
  } catch { /* the default stands */ }
  typical = { at: now, ms };
  return ms;
}

/* ------------------------------------------------------------- the day -- */
const LA = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
// Los Angeles's wall clock at `t`, as if it were UTC
function wall(t: number) {
  const p = Object.fromEntries(LA.formatToParts(t).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
}
// the moment Los Angeles's clock reads midnight on the day that starts at `day` (a UTC date's ms): summer or winter
function midnight(day: number) {
  let t = day;
  for (let i = 0; i < 3; i++) t += day - wall(t);
  return t;
}
/** The Los Angeles calendar day `now` is in: its date, and its start and end (a 23- or 25-hour day when the clocks change). */
export function laDay(now = Date.now()) {
  const w = wall(now), day = Date.UTC(new Date(w).getUTCFullYear(), new Date(w).getUTCMonth(), new Date(w).getUTCDate());
  return { day: new Date(day).toISOString().slice(0, 10), from: midnight(day), to: midnight(day + 86_400_000) };
}

export type DaySpend = { day: string; from: number; to: number; done: number; inFlight: number; running: number; total: number; ceiling: number };
/**
 * The day's spend, site-wide: what its builds cost (by the day each started, its passes priced as they end) and, for
 * each build this server is running now that started today, IN_FLIGHT_USD or what it has cost so far if that is more.
 */
export function spendToday(now = Date.now()): DaySpend {
  const { day, from, to } = laDay(now);
  const live = [...held].filter((s) => s.at >= from && s.at < to);
  const mine = new Set(live.flatMap((s) => (s.row === null ? [] : [s.row])));
  const rows = db.prepare("SELECT id, cost_usd FROM generations WHERE created_at >= ? AND created_at < ? AND model != 'offline'").all(from, to) as { id: number; cost_usd: number | null }[];
  let done = 0;
  const sofar = new Map<number, number>();
  for (const r of rows) if (mine.has(r.id)) sofar.set(r.id, r.cost_usd ?? 0); else done += r.cost_usd ?? 0;
  const inFlight = live.reduce((s, x) => s + Math.max(IN_FLIGHT_USD, x.row === null ? 0 : sofar.get(x.row) ?? 0), 0);
  return { day, from, to, done: +done.toFixed(6), inFlight: +inFlight.toFixed(6), running: live.length, total: +(done + inFlight).toFixed(6), ceiling: dailyCeiling() };
}
/** Whether no new build may start: the day's spend is at or over its ceiling. A spend that cannot be read stops nothing. */
export function resting(now = Date.now()) {
  try { const s = spendToday(now); return s.total >= s.ceiling; } catch (e) { console.error('builds: the day\'s spend could not be read', e); return false; }
}

/* ------------------------------------------------------------------ cost -- */
/**
 * Dollars per million tokens, by model (Anthropic's prices, 9 Oct 2026). A cache write is the 5-minute kind unless the
 * usage says an hour's (1.25x and 2x the input price); thinking is billed as output. Sonnet 5 is where Sonnet 5.5's
 * declined passes fall back to (lib/generate-game.ts: fallbacks 'default'), and Opus 5.5 is what built worlds until 30
 * Sep. A model not in the table is priced as the dearest one in it, and named in the build's usage (unpriced) so the
 * table can be extended: the spend shown is never less than was spent.
 */
type Price = { input: number; write5m: number; write1h: number; read: number; output: number };
export const PRICES: Record<string, Price> = {
  'claude-sonnet-5-5': { input: 2, write5m: 2.5, write1h: 4, read: 0.2, output: 10 },
  'claude-sonnet-5': { input: 2, write5m: 2.5, write1h: 4, read: 0.2, output: 10 },
  'claude-opus-5-5': { input: 4, write5m: 5, write1h: 8, read: 0.2, output: 20 },
};
const DEAREST = Object.values(PRICES).reduce((a, b) => (b.output > a.output ? b : a));

/** The usage counters a pass reports (the SDK's BetaUsage, or one of its iterations), as far as they are priced. */
type Tokens = {
  input_tokens: number; output_tokens: number; cache_creation_input_tokens?: number | null; cache_read_input_tokens?: number | null;
  cache_creation?: { ephemeral_5m_input_tokens?: number; ephemeral_1h_input_tokens?: number } | null;
};
/** One pass's usage as lib/generate-game.ts hands it over: `partial` for a pass cut short (the creator left, or the
 *  stream broke), whose output was never counted, so its cost is a floor. `iterations`: each model that ran in the
 *  pass (a declined pass and its fallback), which the bill counts one by one. */
export type PassUsage = { attempt: number; model: string; usage: Tokens & { iterations?: (Partial<Tokens> & { type?: string; model?: string | null })[] | null }; partial?: boolean };
type Counted = { input: number; output: number; cacheWrite: number; cacheRead: number };
export type BuildUsage = Counted & { passes: (Counted & { attempt: number; model: string; usd: number; partial?: true })[]; partial?: true; unpriced?: string[] };

const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);
function count(t: Partial<Tokens>, model: string, unpriced: Set<string>): Counted & { usd: number } {
  const p = PRICES[model] ?? (unpriced.add(model), DEAREST);
  const input = n(t.input_tokens), output = n(t.output_tokens), cacheWrite = n(t.cache_creation_input_tokens), cacheRead = n(t.cache_read_input_tokens);
  const hour = Math.min(cacheWrite, n(t.cache_creation?.ephemeral_1h_input_tokens));
  const usd = (input * p.input + (cacheWrite - hour) * p.write5m + hour * p.write1h + cacheRead * p.read + output * p.output) / 1e6;
  return { input, output, cacheWrite, cacheRead, usd };
}

/** A build's passes, summed and priced: what is stored with its row (usage, cost_usd). */
export function priceBuild(passes: PassUsage[]): { usage: BuildUsage; usd: number } {
  const unpriced = new Set<string>();
  const usage: BuildUsage = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0, passes: [] };
  let usd = 0;
  for (const p of passes) {
    // a pass with iterations is billed by them (the top-level counts only the model that answered); without, by itself
    const its = (p.usage.iterations ?? []).filter((i) => i && typeof i === 'object');
    const parts = its.length ? its.map((i) => count(i, i.model || p.model, unpriced)) : [count(p.usage, p.model, unpriced)];
    const c = parts.reduce((a, b) => ({ input: a.input + b.input, output: a.output + b.output, cacheWrite: a.cacheWrite + b.cacheWrite, cacheRead: a.cacheRead + b.cacheRead, usd: a.usd + b.usd }));
    usage.passes.push({ attempt: p.attempt, model: p.model, input: c.input, output: c.output, cacheWrite: c.cacheWrite, cacheRead: c.cacheRead, usd: +c.usd.toFixed(6), ...(p.partial ? { partial: true as const } : {}) });
    usage.input += c.input; usage.output += c.output; usage.cacheWrite += c.cacheWrite; usage.cacheRead += c.cacheRead; usd += c.usd;
    if (p.partial) usage.partial = true;
  }
  if (unpriced.size) usage.unpriced = [...unpriced];
  return { usage, usd: +usd.toFixed(6) };
}
