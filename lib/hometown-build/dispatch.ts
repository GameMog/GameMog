/**
 * The town builder's dispatcher (docs/HOMETOWN-HOSTING.md "Production builder"): builders run ON DEMAND as Render
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
import { ANY_BUILD, jobUnits, type BuildQueue, type JobKind } from './queue.ts';

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
export type Plan = { ready: number; readyWeight: number; leasedWeight: number; interactive: boolean; workMs: number; p0Ms: number; byJobs: number; byWork: number; want: number; inFlight: number; toStart: number };

/** A run older than this is treated as gone (its own timeout is the cap + 1 h: workflow.py), 3 h + 10 min. */
export const RUN_MAX_MS = (3 * 3600 + 600) * 1000;
export const CHECK_MS = 30_000;
/** a 'starting' row whose POST keeps failing is dropped after this (idempotency keys hold 24 h) */
export const STARTING_MAX_MS = 10 * 60_000;
const COST_FALLBACK: Record<JobKind, number> = { regions: 40_000, ctx: 6_000, frame: 4_000, tiles: 2_000, far: 5_000, bundle: 10_000, manifest: 1_000, canary: 9_000 };

export class Dispatcher {
  private ticking: Promise<void> | null = null;
  private again = false;
  private holdUntil = 0;
  lastError: { at: number; status: number; message: string } | null = null;
  lastPlan: Plan | null = null;

  readonly q: BuildQueue; readonly cfg: RunsConfig; readonly api: RenderRuns; readonly build: () => string | null; readonly now: () => number;
  constructor(q: BuildQueue, cfg: RunsConfig, api: RenderRuns, build: () => string | null, now?: () => number) {
    this.q = q; this.cfg = cfg; this.api = api; this.build = build; this.now = now ?? (() => q.now());
    q.db.exec(SCHEMA);
  }

  rows(states?: RunState[]): RunRow[] {
    const all = this.q.db.prepare('SELECT * FROM runs ORDER BY created DESC LIMIT 500').all() as RunRow[];
    return states ? all.filter((r) => states.includes(r.state)) : all;
  }
  inFlight(): number { return (this.q.db.prepare(`SELECT COUNT(*) n FROM runs WHERE state IN (${LIVE.map(() => '?').join(',')})`).get(...LIVE) as { n: number }).n; }

  /** What the queue asks for now (pure: reads the queue and the runs table). */
  plan(): Plan {
    const t = this.now(), build = this.build();
    const rows = this.q.db.prepare(`SELECT key, kind, prio, args, deps, weight, state, not_before FROM jobs WHERE state IN ('queued', 'leased')${build ? ' AND (build = ? OR build = ?)' : ''} LIMIT 20000`)
      .all(...(build ? [build, ANY_BUILD] : [])) as { key: string; kind: JobKind; prio: number; args: string; deps: string; weight: number; state: string; not_before: number }[];
    const depState = new Map<string, string>();
    const done = (k: string) => {
      if (!depState.has(k)) { const r = this.q.db.prepare('SELECT state FROM jobs WHERE key = ?').get(k) as { state: string } | undefined; depState.set(k, r?.state ?? 'failed'); }
      return depState.get(k) === 'done';
    };
    let ready = 0, readyWeight = 0, leasedWeight = 0, interactive = false, workMs = 0, p0Ms = 0;
    for (const r of rows) {
      let args: Record<string, unknown> = {}, deps: string[] = [];
      try { args = JSON.parse(r.args); deps = JSON.parse(r.deps); } catch { /* counted as one unit */ }
      const ms = jobUnits({ kind: r.kind, args }) * this.q.costOf(r.kind, COST_FALLBACK[r.kind] ?? 5_000);
      if (r.prio <= 0) p0Ms += ms; else workMs += ms;
      if (r.state === 'leased') { leasedWeight += r.weight; continue; }
      if (r.not_before > t || !deps.every(done)) continue;
      ready++; readyWeight += r.weight;
      if (r.prio <= 3) interactive = true;
    }
    const slots = this.cfg.slotsPerRun, target = this.cfg.targetS * 1000;
    const byJobs = Math.ceil((readyWeight + leasedWeight) / slots);
    const byWork = Math.ceil(p0Ms / (slots * target) + workMs / (slots * target * 10));
    const cap = interactive ? this.cfg.maxRuns : Math.min(this.cfg.maxRuns, this.cfg.prewarmRuns);
    const want = ready ? Math.max(Math.min(1, cap), Math.min(byJobs, byWork, cap)) : 0;
    const inFlight = this.inFlight();
    return { ready, readyWeight, leasedWeight, interactive, workMs: Math.round(workMs + p0Ms), p0Ms: Math.round(p0Ms), byJobs, byWork, want, inFlight, toStart: Math.max(0, want - inFlight) };
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
      this.set(row.idem, { id: r.id, state: (r.status as RunState) || 'pending', checked: this.now(), tries: row.tries + 1, error: null });
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
      try { const g = await this.api.get(r.id); this.set(r.idem, { state: (g.status as RunState) || r.state, checked: t }); }
      catch (e) { if (e instanceof RenderApiError && e.status === 404) this.set(r.idem, { state: 'lost', checked: t, error: 'not found' }); else { this.failed(e); this.set(r.idem, { checked: t }); } }
    }
    // 3. start what is missing
    const p = this.plan();
    this.lastPlan = p;
    if (!p.toStart || t < this.holdUntil) return;
    const lastMinute = (this.q.db.prepare('SELECT COUNT(*) n FROM runs WHERE created > ?').get(t - 60_000) as { n: number }).n;
    const n = Math.min(p.toStart, Math.max(0, this.cfg.startsPerMin - lastMinute));
    for (let i = 0; i < n; i++) {
      const idem = `ht-${t.toString(36)}-${randomBytes(6).toString('hex')}`;
      const reason = `want ${p.want}, ready ${p.ready}${p.interactive ? '' : ' (pre-warm)'}`;
      this.q.db.prepare("INSERT INTO runs (idem, state, want, reason, created, updated) VALUES (?, 'starting', ?, ?, ?, ?)").run(idem, p.want, reason, t, t);
      if (!(await this.send(this.rows(['starting']).find((r) => r.idem === idem)!))) break;
    }
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
