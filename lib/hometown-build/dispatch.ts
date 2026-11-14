/**
 * The town builder's dispatcher (docs/HOMETOWN-HOSTING.md): builders run ON DEMAND as Render
 * Workflows task runs (deploy/town-builder/workflow.py, task `build_jobs`), never always on. This web process never
 * runs Python and never compiles: it only asks Render for runs, through the REST API, when the queue has work.
 *
 *   HOMETOWN_RUNS=off|workflows     off (default): nothing is started (a builder can still be run by hand: worker.py)
 *   HOMETOWN_RENDER_API_KEY         the Render API key (the owner's, sync: false); unset: the dispatcher stays off
 *   HOMETOWN_WORKFLOW_SLUG          the workflow's slug (render.yaml fromService property slug); the task is
 *                                   `${slug}/build_jobs` (HOMETOWN_RUN_TASK overrides the whole task slug)
 *   HOMETOWN_RENDER_API             the API base (default https://api.render.com/v1; the local simulation's fake)
 *   HOMETOWN_MAX_RUNS=20            runs in flight at most (Hobby: 16 new CPU a minute, so 4 new 4c-8g runs a minute;
 *                                   Render queues the rest)
 *   HOMETOWN_RUN_SLOTS=4            compile slots of one run (4c-8g: 4; workflow.py slots_of)
 *   HOMETOWN_PREWARM_RUNS=4         runs at most while only pre-warm (P5) work is ready
 *   HOMETOWN_RUN_STARTS_PER_MIN=4   new runs a minute at most (the workspace's 50 run starts a minute on Hobby)
 *   HOMETOWN_RUN_TARGET_S=60        P0 work (a town's spawn path) is sized to drain in this, the rest in 10x it
 *   HOMETOWN_RUN_SPINUP_S=45        added to a wait estimate when no run is live (start, print-build, first inputs)
 *
 * How many runs (each tick, every 5 s and on every queue change):
 *   ready   queued jobs of the current build (or any-build regions) whose deps are done and whose backoff has passed
 *   byJobs  ceil((ready + leased weight) / slots): never more runs than there are jobs for
 *   byWork  ceil(P0 work / (slots x target) + other work / (slots x 10 target)), work = units x the EWMA cost of a kind
 *   want    0 when nothing is ready; else clamp(min(byJobs, byWork), 1, MAX_RUNS, or PREWARM_RUNS when only P5 is ready)
 *   start   want - runs in flight (rows starting/pending/running), at most STARTS_PER_MIN a rolling minute
 * Runs end themselves (idle 20 s, or their time cap); the dispatcher never cancels one.
 *
 * Durable and idempotent (the runs table in queue.db): a row with its idempotency key is written BEFORE the POST, so a
 * web that dies between the two re-sends the same key at boot and Render answers with the run it already made. Run
 * states are refreshed with GET /task-runs/{id}, each at most every 30 s. A 429 or a 5xx backs off; a 401/403/404 (a
 * wrong key or slug) stops starting for 5 minutes and shows on the owner's status page.
 */
import { randomBytes } from 'node:crypto';
import { ANY_BUILD, type BuildQueue, type JobKind } from './queue.ts';

export type RunsConfig = {
  mode: 'off' | 'workflows'; apiBase: string; apiKey: string | null; task: string | null; maxRuns: number; slotsPerRun: number;
  prewarmRuns: number; startsPerMin: number; targetS: number; spinupS: number;
};
const int = (v: string | undefined, d: number, lo: number, hi: number) => { const n = Math.floor(Number(v)); return v != null && v !== '' && Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };

export function runsConfig(env: Record<string, string | undefined> = process.env): RunsConfig {
  const slug = (env.HOMETOWN_WORKFLOW_SLUG ?? '').trim();
  const task = (env.HOMETOWN_RUN_TASK ?? '').trim() || (slug ? `${slug}/build_jobs` : '');
  const apiKey = (env.HOMETOWN_RENDER_API_KEY ?? '').trim();
  return {
    mode: env.HOMETOWN_RUNS === 'workflows' ? 'workflows' : 'off',
    apiBase: (env.HOMETOWN_RENDER_API || 'https://api.render.com/v1').replace(/\/+$/, ''),
    apiKey: apiKey || null,
    task: /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(:[A-Za-z0-9_.-]+)?$/.test(task) ? task : null,
    maxRuns: int(env.HOMETOWN_MAX_RUNS, 20, 0, 500),
    slotsPerRun: int(env.HOMETOWN_RUN_SLOTS, 4, 1, 32),
    prewarmRuns: int(env.HOMETOWN_PREWARM_RUNS, 4, 0, 500),
    startsPerMin: int(env.HOMETOWN_RUN_STARTS_PER_MIN, 4, 1, 1000),
    targetS: int(env.HOMETOWN_RUN_TARGET_S, 60, 5, 86400),
    spinupS: int(env.HOMETOWN_RUN_SPINUP_S, 45, 0, 3600),
  };
}
/** The dispatcher runs only when every piece is there (a missing key or slug is the status page's "why"). */
export const runsReady = (c: RunsConfig) => c.mode === 'workflows' && !!c.apiKey && !!c.task;
export function runsProblem(c: RunsConfig): string | null {
  if (c.mode !== 'workflows') return null;
  if (!c.apiKey) return 'HOMETOWN_RENDER_API_KEY is not set';
  if (!c.task) return 'HOMETOWN_WORKFLOW_SLUG (or HOMETOWN_RUN_TASK) is not set';
  return null;
}

// --------------------------------------------------------------------------------------------- the Render API
export type RunState = 'starting' | 'pending' | 'running' | 'completed' | 'succeeded' | 'failed' | 'canceled' | 'paused' | 'suspended' | 'sleeping' | 'lost';
export const LIVE: RunState[] = ['starting', 'pending', 'running', 'paused', 'suspended', 'sleeping'];
/** Render's run status as a row state: a status this code does not know counts as live (never as ended: an unknown
 * state read as ended would start a replacement on every pass), until RUN_MAX_MS retires the row. */
const ENDED: RunState[] = ['completed', 'succeeded', 'failed', 'canceled'];
export const stateOf = (s: string): RunState => (LIVE.includes(s as RunState) || ENDED.includes(s as RunState) ? s as RunState : 'running');
export class RenderApiError extends Error { readonly status: number; constructor(status: number, msg: string) { super(msg); this.status = status; } }
export type RenderRuns = {
  start(task: string, input: unknown[], idempotencyKey: string): Promise<{ id: string; status: string }>;
  get(id: string): Promise<{ id: string; status: string }>;
};

/** POST /task-runs and GET /task-runs/{id} (api-docs.render.com: createTask, getTaskRun), bearer auth, 15 s timeout. */
export function renderRuns(c: Pick<RunsConfig, 'apiBase' | 'apiKey'>, f: typeof fetch = fetch): RenderRuns {
  const call = async (method: string, p: string, body?: unknown) => {
    const r = await f(`${c.apiBase}${p}`, {
      method, signal: AbortSignal.timeout(15_000),
      headers: { authorization: `Bearer ${c.apiKey}`, accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const text = await r.text();
    if (!r.ok) throw new RenderApiError(r.status, `${method} ${p.split('?')[0]}: HTTP ${r.status} ${text.slice(0, 200)}`);
    const j = text ? JSON.parse(text) : {};
    if (typeof j?.id !== 'string' || typeof j?.status !== 'string') throw new RenderApiError(502, `${method} ${p}: no id/status in the answer`);
    return { id: j.id as string, status: j.status as string };
  };
  return {
    start: (task, input, idempotencyKey) => call('POST', '/task-runs', { task, input, idempotencyKey }),
    get: (id) => call('GET', `/task-runs/${encodeURIComponent(id)}`),
  };
}

// ------------------------------------------------------------------------------------------------ the dispatcher
const SCHEMA = `CREATE TABLE IF NOT EXISTS runs (idem TEXT PRIMARY KEY, id TEXT, state TEXT NOT NULL, want INTEGER, reason TEXT,
  created INTEGER NOT NULL, updated INTEGER NOT NULL, checked INTEGER NOT NULL DEFAULT 0, tries INTEGER NOT NULL DEFAULT 0, error TEXT);
CREATE INDEX IF NOT EXISTS runs_state ON runs(state, created);`;
export type RunRow = { idem: string; id: string | null; state: RunState; want: number | null; reason: string | null; created: number; updated: number; checked: number; tries: number; error: string | null };
export type Plan = { ready: number; readyWeight: number; leasedWeight: number; interactive: boolean; workMs: number; p0Ms: number; byJobs: number; byWork: number; want: number; inFlight: number; toStart: number; probe?: boolean };

/** A run older than this is treated as gone (its own timeout is the cap + 1 h: workflow.py), 3 h + 10 min. */
export const RUN_MAX_MS = (3 * 3600 + 600) * 1000;
export const CHECK_MS = 30_000;
/** a 'starting' row whose POST keeps failing is dropped after this (idempotency keys hold 24 h) */
export const STARTING_MAX_MS = 10 * 60_000;
/** the breaker (Dispatcher.fruitless): this many ended runs in a row that never claimed hold starts this long */
export const FRUITLESS_N = 3;
export const FRUITLESS_HOLD_MS = 10 * 60_000;
/** a pick kept for want of a build (or the boot of a web whose deploy's build is not learned yet) within this starts one
 * probe run (plan) */
export const PROBE_MS = 10 * 60_000;
/** while a new workflow deploy's build is being learned, a probe run is started at most this often: a probe that reported
 * the OLD deploy's build (the workflow still rebuilding) is followed by another one this much later, not at once */
export const PROBE_GAP_MS = 2 * 60_000;
/** (towns.ts BUILD_UNKNOWN and BUILD_LEARN: the same event kinds; not imported, towns.ts imports this file) */
const BUILD_UNKNOWN = 'build-unknown', BUILD_LEARN = 'build-learn';
export const PROBE_REASON = 'learn the build';
const COST_FALLBACK: Record<JobKind, number> = { regions: 40_000, ctx: 6_000, frame: 4_000, tiles: 2_000, far: 5_000, bundle: 10_000, manifest: 1_000, canary: 9_000 };

export class Dispatcher {
  private ticking: Promise<void> | null = null;
  private again = false;
  private holdUntil = 0;
  lastError: { at: number; status: number; message: string } | null = null;
  lastPlan: Plan | null = null;
  /** true while the newest workflow deploy's build is not known (towns.ts buildView, not learned): server.ts sets it */
  learning: () => boolean = () => false;
  /** the build the last run of any deploy reported, while learning (buildView stale): its towns' queued work asks for a
   * probe too (they move to the learned build: towns.ts rekeyStale) */
  stale: () => string | null = () => null;

  readonly q: BuildQueue; readonly cfg: RunsConfig; readonly api: RenderRuns; readonly build: () => string | null; readonly now: () => number;
  constructor(q: BuildQueue, cfg: RunsConfig, api: RenderRuns, build: () => string | null, now?: () => number) {
    this.q = q; this.cfg = cfg; this.api = api; this.build = build; this.now = now ?? (() => q.now());
    q.db.exec(SCHEMA);
  }

  /** Rows by state, newest first (filtered in SQL: a row in a live state is never hidden behind 500 newer ended ones). */
  rows(states?: RunState[]): RunRow[] {
    if (!states) return this.q.db.prepare('SELECT * FROM runs ORDER BY created DESC LIMIT 500').all() as RunRow[];
    return this.q.db.prepare(`SELECT * FROM runs WHERE state IN (${states.map(() => '?').join(',')}) ORDER BY created DESC LIMIT 500`).all(...states) as RunRow[];
  }
  /**
   * Rows that can no longer be live, retired in ONE indexed update before anything counts them: a 'starting' row whose
   * POST never went through for STARTING_MAX_MS (the web died between the row and the POST, or every re-send failed),
   * and any live row older than a run can be. Before, these were retired only while visited one by one (a pass that
   * stopped at a held start, or a row past the 500 newest, left them counted in inFlight for good: fewer runs started).
   */
  reapOrphans(t = this.now()): number {
    const a = this.q.db.prepare("UPDATE runs SET state = 'lost', error = COALESCE(error, 'never started'), updated = ? WHERE state = 'starting' AND created < ?").run(t, t - STARTING_MAX_MS);
    const b = this.q.db.prepare(`UPDATE runs SET state = 'lost', error = 'older than a run can be', updated = ? WHERE state IN (${LIVE.map(() => '?').join(',')}) AND created < ?`).run(t, ...LIVE, t - RUN_MAX_MS);
    const n = Number(a.changes) + Number(b.changes);
    if (n) this.q.log('runs-reaped', { starting: Number(a.changes), old: Number(b.changes) });
    return n;
  }
  inFlight(): number { return (this.q.db.prepare(`SELECT COUNT(*) n FROM runs WHERE state IN (${LIVE.map(() => '?').join(',')})`).get(...LIVE) as { n: number }).n; }

  /**
   * What the queue asks for now (pure: reads the queue and the runs table). Cheap at any depth (it runs every 5 s and
   * on every queue change): the work is summed per kind in SQL over the plan index (jobs.units, a job's cost units);
   * the ready jobs are counted in SQL with their deps checked by primary key, in claim order and only as far as a
   * decision needs (more ready weight than MAX_RUNS runs can hold changes nothing). Before: every queued row parsed in
   * JS with a cost lookup per row (about 200-330 ms at 20,000 jobs, the event loop blocked).
   */
  plan(): Plan {
    const t = this.now(), build = this.build(), learning = this.learning();
    // (no build while a workflow redeploy's is learned: only the any-build jobs (regions) count; an older build's jobs
    // wait for the new build to be learned and move to it, never start runs that may not claim them)
    const bf = build ? ' AND build IN (?, ?)' : learning ? ' AND build = ?' : '', bp = build ? [build, ANY_BUILD] : learning ? [ANY_BUILD] : [];
    let leasedWeight = 0, workMs = 0, p0Ms = 0;
    // (grouped in the plan index's own order: a streaming aggregate, no sort)
    const sums = this.q.db.prepare(`SELECT state, build, kind, prio, SUM(COALESCE(units, 1)) u, SUM(weight) w FROM jobs WHERE state IN ('queued', 'leased')${bf} GROUP BY state, build, kind, prio`)
      .all(...bp) as { kind: JobKind; state: string; prio: number; u: number; w: number }[];
    const cost = new Map<string, number>();
    for (const r of sums) {
      if (!cost.has(r.kind)) cost.set(r.kind, this.q.costOf(r.kind, COST_FALLBACK[r.kind] ?? 5_000));
      const ms = Number(r.u) * cost.get(r.kind)!;
      if (Number(r.prio) <= 0) p0Ms += ms; else workMs += ms;
      if (r.state === 'leased') leasedWeight += Number(r.w);
    }
    const slots = this.cfg.slotsPerRun, target = this.cfg.targetS * 1000;
    // (ready: queued, past its backoff, every dep done (checked by primary key in SQL); in claim order, so the first row
    // says whether it is interactive, and only as far as a decision needs: more ready weight than MAX_RUNS runs can
    // hold changes nothing)
    const enough = Math.max(1, this.cfg.maxRuns) * slots + 1;
    const readyRows = this.q.db.prepare(`SELECT prio, weight FROM jobs j WHERE state = 'queued'${bf} AND not_before <= ?
      AND NOT EXISTS (SELECT 1 FROM json_each(j.deps) d LEFT JOIN jobs x ON x.key = d.value WHERE x.state IS NOT 'done')
      ORDER BY prio LIMIT ?`).all(...bp, t, enough) as { prio: number; weight: number }[];
    const ready = readyRows.length, readyWeight = readyRows.reduce((a, r) => a + Number(r.weight), 0);
    const interactive = readyRows.some((r) => r.prio <= 3);
    const byJobs = Math.ceil((readyWeight + leasedWeight) / slots);
    const byWork = Math.ceil(p0Ms / (slots * target) + workMs / (slots * target * 10));
    const cap = interactive ? this.cfg.maxRuns : Math.min(this.cfg.maxRuns, this.cfg.prewarmRuns);
    // (no build known yet (no HOMETOWN_BUILD and no run ever, or a workflow redeploy whose build no run of it has
    // reported: towns.ts buildView): a pick was kept for it, or the web booted so, within PROBE_MS, so ONE run is started
    // to learn it; its first claim reports the build (queue.ts workers) and admits the kept picks. While a redeploy is
    // being learned, at most one such run every PROBE_GAP_MS: one that reported the old deploy's build (the workflow still
    // rebuilding) is not followed by another at once)
    const stale = learning ? this.stale() : null;
    let probe = (!build || learning) && !ready && this.cfg.maxRuns > 0
      && (!!this.q.db.prepare('SELECT 1 FROM events WHERE kind IN (?, ?) AND at > ? LIMIT 1').get(BUILD_UNKNOWN, BUILD_LEARN, t - PROBE_MS)
        || (!!stale && !!this.q.db.prepare("SELECT 1 FROM jobs WHERE state = 'queued' AND build = ? LIMIT 1").get(stale)));
    if (probe && learning) {
      const last = this.q.db.prepare('SELECT MAX(created) at FROM runs WHERE reason LIKE ?').get(`${PROBE_REASON}%`) as { at: number | null };
      if (last.at != null && t - Number(last.at) < PROBE_GAP_MS) probe = false;
    }
    const want = ready ? Math.max(Math.min(1, cap), Math.min(byJobs, byWork, cap)) : probe ? 1 : 0;
    const inFlight = this.inFlight();
    return { ready, readyWeight, leasedWeight, interactive, workMs: Math.round(workMs + p0Ms), p0Ms: Math.round(p0Ms), byJobs, byWork, want, inFlight, toStart: Math.max(0, want - inFlight), ...(probe ? { probe } : {}) };
  }

  /** One pass; concurrent calls join it (and one more pass follows if something changed meanwhile). */
  tick(): Promise<void> {
    if (this.ticking) { this.again = true; return this.ticking; }
    this.ticking = (async () => {
      try { do { this.again = false; await this.pass(); } while (this.again); } finally { this.ticking = null; }
    })();
    return this.ticking;
  }

  private set(idem: string, f: Partial<RunRow>) {
    const keys = Object.keys(f) as (keyof RunRow)[];
    this.q.db.prepare(`UPDATE runs SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated = ? WHERE idem = ?`).run(...keys.map((k) => f[k] as string | number | null), this.now(), idem);
  }
  private failed(e: unknown): number {
    const status = e instanceof RenderApiError ? e.status : 0;
    this.lastError = { at: this.now(), status, message: String((e as Error)?.message ?? e).slice(0, 300) };
    // (a wrong key or slug: nothing a retry fixes soon; a 429 (Hobby: 50 run starts a minute) or 5xx: a short wait)
    this.holdUntil = this.now() + (status === 401 || status === 403 || status === 404 ? 300_000 : status === 429 ? 60_000 : 15_000);
    this.q.log('runs-error', { status, message: this.lastError.message });
    return status;
  }

  private async send(row: RunRow): Promise<boolean> {
    if (!this.cfg.task) return false;
    try {
      const r = await this.api.start(this.cfg.task, [row.reason ?? ''], row.idem);
      this.set(row.idem, { id: r.id, state: r.status ? stateOf(r.status) : 'pending', checked: this.now(), tries: row.tries + 1, error: null });
      this.q.log('run-started', { id: r.id, want: row.want, reason: row.reason });
      return true;
    } catch (e) {
      const status = this.failed(e);
      // (a 4xx other than 429 means this request will never be accepted: drop the row; otherwise keep it to re-send)
      const dead = status >= 400 && status < 500 && status !== 429;
      this.set(row.idem, { tries: row.tries + 1, error: this.lastError!.message, ...(dead ? { state: 'failed' as RunState } : {}) });
      return false;
    }
  }

  private async pass() {
    const t = this.now();
    this.reapOrphans(t);
    // 1. rows written but never confirmed (the web died between the row and the POST, or the POST failed): the same key
    for (const r of this.rows(['starting'])) {
      if (t - r.created > STARTING_MAX_MS) { this.set(r.idem, { state: 'lost', error: r.error ?? 'never started' }); continue; }
      if (t < this.holdUntil) break;
      if (!(await this.send(r))) break;
    }
    // 2. refresh the live runs' states (each at most every CHECK_MS, 10 a pass)
    // (a run's worker is seen on every claim (a 20 s long-poll) and every heartbeat (15 s): one not seen for 25 s, or
    // never seen 90 s after the start, has most likely returned (idle) or not started; it is re-read every 5 s, so new
    // work does not wait CHECK_MS behind a run that is already gone)
    let checks = 0;
    const seen = this.q.db.prepare('SELECT seen FROM workers WHERE id = ?');
    for (const r of this.rows(LIVE)) {
      if (r.state === 'starting' || !r.id) continue;
      if (t - r.created > RUN_MAX_MS) { this.set(r.idem, { state: 'lost', error: 'older than a run can be' }); continue; }
      const w = seen.get(`run-${r.id}`.slice(0, 80)) as { seen: number } | undefined;
      const quiet = w ? t - Number(w.seen) > 25_000 : t - r.created > 90_000;
      if (t - r.checked < (quiet ? 5_000 : CHECK_MS) || checks >= 10 || t < this.holdUntil) continue;
      checks++;
      try { const g = await this.api.get(r.id); this.set(r.idem, { state: g.status ? stateOf(g.status) : r.state, checked: t }); }
      catch (e) { if (e instanceof RenderApiError && e.status === 404) this.set(r.idem, { state: 'lost', checked: t, error: 'not found' }); else { this.failed(e); this.set(r.idem, { checked: t }); } }
    }
    // 3. start what is missing
    const p = this.plan();
    this.lastPlan = p;
    if (!p.toStart || t < this.holdUntil) return;
    const stuck = this.fruitless(t);
    if (stuck) {
      if (this.lastError?.message !== stuck) { this.lastError = { at: t, status: 0, message: stuck }; this.q.log('runs-held', { why: stuck }); }
      return;
    }
    const lastMinute = (this.q.db.prepare('SELECT COUNT(*) n FROM runs WHERE created > ?').get(t - 60_000) as { n: number }).n;
    const n = Math.min(p.toStart, Math.max(0, this.cfg.startsPerMin - lastMinute));
    for (let i = 0; i < n; i++) {
      const idem = `ht-${t.toString(36)}-${randomBytes(6).toString('hex')}`;
      const reason = p.probe ? `${PROBE_REASON} (${this.learning() ? 'a new workflow deploy' : 'a pick and no build known'})` : `want ${p.want}, ready ${p.ready}${p.interactive ? '' : ' (pre-warm)'}`;
      this.q.db.prepare("INSERT INTO runs (idem, state, want, reason, created, updated) VALUES (?, 'starting', ?, ?, ?, ?)").run(idem, p.want, reason, t, t);
      if (!(await this.send(this.rows(['starting']).find((r) => r.idem === idem)!))) break;
    }
  }

  /**
   * The breaker against paying for runs that cannot work: when the last FRUITLESS_N runs that ended never claimed at the
   * current build (paused, the token refused, the web off, a crash at start, or a workflow redeploy that changed the
   * buildId before HOMETOWN_BUILD was set to it), no run is started for FRUITLESS_HOLD_MS after the last of them ended;
   * then ONE probe run. Without it the dispatcher would start 4 runs a minute for as long as work is ready.
   * -> why it holds, or null.
   */
  fruitless(t: number): string | null {
    const ended = this.q.db.prepare(`SELECT id, updated FROM runs WHERE id IS NOT NULL AND state NOT IN (${LIVE.map(() => '?').join(',')}) ORDER BY created DESC LIMIT ?`)
      .all(...LIVE, FRUITLESS_N) as { id: string; updated: number }[];
    if (ended.length < FRUITLESS_N || t - Math.max(...ended.map((r) => Number(r.updated))) > FRUITLESS_HOLD_MS) return null;
    const build = this.build(), seen = this.q.db.prepare('SELECT build FROM workers WHERE id = ?');
    const builds = new Set<string>();
    for (const r of ended) {
      const w = seen.get(`run-${r.id}`.slice(0, 80)) as { build: string | null } | undefined;
      if (w && (!build || w.build === build)) return null;
      if (w?.build) builds.add(w.build);
    }
    return `the last ${FRUITLESS_N} runs ended without claiming${builds.size ? ` (they report build ${[...builds].join(', ')}, not ${build}: set HOMETOWN_BUILD)` : ' (paused, refused or failed at start: see their logs)'}; one more run in ${Math.ceil(FRUITLESS_HOLD_MS / 60_000)} min`;
  }

  /** The owner's status page. */
  status() {
    const rows = this.rows();
    const by: Record<string, number> = {};
    for (const r of rows) by[r.state] = (by[r.state] ?? 0) + 1;
    return { task: this.cfg.task, maxRuns: this.cfg.maxRuns, slotsPerRun: this.cfg.slotsPerRun, inFlight: this.inFlight(), plan: this.lastPlan, byState: by,
      lastError: this.lastError, holdS: Math.max(0, Math.round((this.holdUntil - this.now()) / 1000)), recent: rows.slice(0, 10).map((r) => ({ id: r.id, state: r.state, created: r.created, reason: r.reason, error: r.error })) };
  }
}

/** The capacity a wait estimate may count on: the live workers' slots, or what the dispatcher can start. */
export function capacitySlots(live: number, c: RunsConfig | null | undefined): { slots: number; spinupS: number } {
  if (!c || !runsReady(c)) return { slots: live, spinupS: 0 };
  return { slots: Math.max(live, c.maxRuns * c.slotsPerRun), spinupS: live > 0 ? 0 : c.spinupS };
}
