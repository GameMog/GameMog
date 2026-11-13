/**
 * The production town builder's job queue (SPEC 3, task G3): a durable SQLite queue on the web service's disk
 * (data/hometown/queue.db, node:sqlite, WAL, the same library as lib/db.ts). The web never compiles; stateless workers
 * (deploy/town-builder/worker.py) claim jobs over Render's private network and upload what they make.
 *
 *   jobs     one job per output, keyed `kind:build:canonical-input`: idempotent, shared by every town that needs it
 *   wants    which towns wait on a job (a failed job fails them; a done job moves them on)
 *   towns    a town's build and its state (lib/hometown-build/towns.ts owns the rules)
 *   workers  who claimed lately (live slots for the wait estimate, the build they report)
 *   costs    per-kind EWMA of a job's wall time (the wait estimate)
 *
 * Rules:
 *   enqueue  INSERT or merge: prio = min, first_asked = min, a tile block's mask ORed while queued; a done job is never
 *            queued again; a failed one only by a new ask after its not_before
 *   claim    in ONE transaction: the lowest (prio, first_asked, ring) job of the worker's build (regions: any build)
 *            whose deps are all done, whose not_before has passed and whose weight fits the free slots; region
 *            affinity breaks ties inside a priority. A worker's last free slot claims P0 only (the spawn path never
 *            waits behind a block); P5 (pre-warm) only when no P0-P3 job is claimable at all
 *   lease    60 s, extended by a heartbeat (every 15 s); an expired lease goes back to queued with backoff
 *            5 s * 2^(attempts-1); after 3 attempts the job is failed
 *   complete the outputs must be stored (the caller's check) or the attempt counts as failed
 *   fail     exit 3 naming missing regions is not a failure: a regions job is added as a dep, no attempt charged
 *
 * Every function takes the clock from the queue (tests pass a fake one).
 */
import { DatabaseSync } from 'node:sqlite';
import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

export type JobKind = 'regions' | 'ctx' | 'frame' | 'tiles' | 'far' | 'bundle' | 'manifest' | 'canary';
export type JobState = 'queued' | 'leased' | 'done' | 'failed';
export type Job = {
  key: string; kind: JobKind; build: string; prio: number; ring: number; args: Record<string, unknown>; deps: string[];
  state: JobState; attempts: number; notBefore: number; leaseId: string | null; leaseWorker: string | null; leaseUntil: number | null;
  weight: number; firstAsked: number; created: number; updated: number; doneMs: number | null; peakMb: number | null; error: string | null;
  grp: string | null;
};
export type EnqueueSpec = {
  key: string; kind: JobKind; build: string; prio: number; ring?: number; args: Record<string, unknown>; deps?: string[]; weight?: number;
  /** the town this job is wanted for (a wants row) */
  place?: string; firstAsked?: number;
};
export type ClaimSpec = { worker: string; build: string; freeSlots: number; totalSlots?: number; cached?: string[]; version?: string; memMb?: number };

export const LEASE_MS = 60_000;
export const HEARTBEAT_MS = 15_000;
export const MAX_ATTEMPTS = 3;
export const BACKOFF_MS = 5_000;
/** a worker seen within this long counts as live (its slots in the wait estimate) */
export const LIVE_MS = 30_000;
/** any build may claim these (a staged region is the same rows whatever compiler reads it) */
export const ANY_BUILD = '*';
const EWMA = 0.3;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS jobs (
  key TEXT PRIMARY KEY, kind TEXT NOT NULL, build TEXT NOT NULL, prio INTEGER NOT NULL, ring INTEGER NOT NULL DEFAULT 0,
  args TEXT NOT NULL, deps TEXT NOT NULL DEFAULT '[]', state TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0, not_before INTEGER NOT NULL DEFAULT 0,
  lease_id TEXT, lease_worker TEXT, lease_until INTEGER, weight INTEGER NOT NULL DEFAULT 1,
  first_asked INTEGER NOT NULL, created INTEGER NOT NULL, updated INTEGER NOT NULL, done_ms INTEGER, peak_mb INTEGER, error TEXT,
  grp TEXT);
CREATE INDEX IF NOT EXISTS jobs_claim ON jobs(state, build, prio, first_asked, ring);
CREATE INDEX IF NOT EXISTS jobs_grp ON jobs(grp, state);
CREATE TABLE IF NOT EXISTS wants (job TEXT NOT NULL, place TEXT NOT NULL, PRIMARY KEY (job, place));
CREATE INDEX IF NOT EXISTS wants_place ON wants(place);
CREATE TABLE IF NOT EXISTS towns (place TEXT NOT NULL, build TEXT NOT NULL, box TEXT NOT NULL, state TEXT NOT NULL,
  first_asked INTEGER, frame_at INTEGER, district_at INTEGER, full_at INTEGER, tiles_total INTEGER, tiles_done INTEGER,
  asks INTEGER NOT NULL DEFAULT 0, source TEXT NOT NULL, meta TEXT NOT NULL DEFAULT '{}', PRIMARY KEY (place, build));
CREATE TABLE IF NOT EXISTS workers (id TEXT PRIMARY KEY, build TEXT, slots INTEGER, seen INTEGER, version TEXT, mem_mb INTEGER);
CREATE TABLE IF NOT EXISTS costs (kind TEXT PRIMARY KEY, ewma_ms REAL, n INTEGER);
CREATE TABLE IF NOT EXISTS events (at INTEGER NOT NULL, kind TEXT NOT NULL, data TEXT NOT NULL);
`;

type Row = Record<string, unknown>;
const toJob = (r: Row): Job => ({
  key: String(r.key), kind: r.kind as JobKind, build: String(r.build), prio: Number(r.prio), ring: Number(r.ring), args: JSON.parse(String(r.args)),
  deps: JSON.parse(String(r.deps)), state: r.state as JobState, attempts: Number(r.attempts), notBefore: Number(r.not_before),
  leaseId: (r.lease_id as string) ?? null, leaseWorker: (r.lease_worker as string) ?? null, leaseUntil: r.lease_until == null ? null : Number(r.lease_until),
  weight: Number(r.weight), firstAsked: Number(r.first_asked), created: Number(r.created), updated: Number(r.updated),
  doneMs: r.done_ms == null ? null : Number(r.done_ms), peakMb: r.peak_mb == null ? null : Number(r.peak_mb), error: (r.error as string) ?? null, grp: (r.grp as string) ?? null,
});

/** The bits of a tile mask (16 tiles of an L2 block, bit i = tile (i % 4, i >> 2) of the block). */
export const maskBits = (m: number) => { const out: number[] = []; for (let i = 0; i < 16; i++) if (m & (1 << i)) out.push(i); return out; };

export class BuildQueue {
  readonly db: DatabaseSync;
  now: () => number;
  private listeners = new Set<() => void>();

  constructor(o: { file: string; now?: () => number }) {
    if (o.file !== ':memory:') mkdirSync(path.dirname(o.file), { recursive: true });
    this.db = new DatabaseSync(o.file);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;');
    this.db.exec(SCHEMA);
    this.now = o.now ?? Date.now;
  }

  close() { this.db.close(); }
  /** Long-poll wake-ups: called after anything a claim could now take. */
  onChange(f: () => void) { this.listeners.add(f); return () => this.listeners.delete(f); }
  private changed() { for (const f of [...this.listeners]) { try { f(); } catch { /* a listener's own problem */ } } }

  tx<T>(f: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const r = f(); this.db.exec('COMMIT'); return r; } catch (e) { try { this.db.exec('ROLLBACK'); } catch { /* none open */ } throw e; }
  }

  get(key: string): Job | null { const r = this.db.prepare('SELECT * FROM jobs WHERE key = ?').get(key) as Row | undefined; return r ? toJob(r) : null; }
  jobsOf(place: string): Job[] { return (this.db.prepare('SELECT j.* FROM jobs j JOIN wants w ON w.job = j.key WHERE w.place = ?').all(place) as Row[]).map(toJob); }
  log(kind: string, data: Record<string, unknown>) {
    this.db.prepare('INSERT INTO events (at, kind, data) VALUES (?, ?, ?)').run(this.now(), kind, JSON.stringify(data));
    // (a bounded journal: the owner's status page reads the last of it)
    if (Math.random() < 0.01) this.db.prepare('DELETE FROM events WHERE at < ?').run(this.now() - 14 * 86400_000);
  }

  /**
   * Idempotent enqueue. A tile job (kind 'tiles', args { block, mask }) merges by its block: ORed into a queued job of
   * the block, nothing new when leased/done jobs of the block cover the bits, else a new job for the bits not covered.
   * Returns the key the town should depend on (for tiles, possibly several).
   */
  enqueue(s: EnqueueSpec): string[] {
    return this.tx(() => this.enqueueIn(s));
  }
  enqueueMany(specs: EnqueueSpec[]): string[][] { const out = this.tx(() => specs.map((s) => this.enqueueIn(s))); this.changed(); return out; }

  private enqueueIn(s: EnqueueSpec): string[] {
    const t = this.now(), first = s.firstAsked ?? t;
    const want = (key: string) => { if (s.place) this.db.prepare('INSERT OR IGNORE INTO wants (job, place) VALUES (?, ?)').run(key, s.place); };
    if (s.kind === 'tiles') {
      const block = String(s.args.block), mask = Number(s.args.mask) & 0xffff;
      const grp = `${s.build}:${block}`;
      const rows = (this.db.prepare("SELECT * FROM jobs WHERE grp = ? AND state != 'failed'").all(grp) as Row[]).map(toJob);
      const keys: string[] = [];
      let covered = 0;
      for (const j of rows) if (j.state !== 'queued') { covered |= Number(j.args.mask); if (Number(j.args.mask) & mask) keys.push(j.key); }
      const need = mask & ~covered;
      const q = rows.find((j) => j.state === 'queued');
      if (need && q) {
        const m = Number(q.args.mask) | need;
        this.db.prepare('UPDATE jobs SET args = ?, prio = MIN(prio, ?), ring = MIN(ring, ?), first_asked = MIN(first_asked, ?), updated = ? WHERE key = ?')
          .run(JSON.stringify({ ...q.args, mask: m }), s.prio, s.ring ?? 0, first, t, q.key);
        keys.push(q.key);
      } else if (need) {
        const key = `${s.key}:${need.toString(16).padStart(4, '0')}`;
        this.insert({ ...s, key, args: { ...s.args, mask: need } }, first, grp);
        keys.push(key);
      } else if (q && Number(q.args.mask) & mask) {
        this.db.prepare('UPDATE jobs SET prio = MIN(prio, ?), ring = MIN(ring, ?), first_asked = MIN(first_asked, ?), updated = ? WHERE key = ?').run(s.prio, s.ring ?? 0, first, t, q.key);
        keys.push(q.key);
      }
      for (const k of keys) want(k);
      return [...new Set(keys)];
    }
    const had = this.get(s.key);
    if (!had) this.insert(s, first, null);
    else if (had.state === 'queued' || had.state === 'leased') {
      const deps = [...new Set([...had.deps, ...(s.deps ?? [])])];
      this.db.prepare('UPDATE jobs SET prio = MIN(prio, ?), ring = MIN(ring, ?), first_asked = MIN(first_asked, ?), deps = ?, updated = ? WHERE key = ?')
        .run(s.prio, s.ring ?? 0, first, JSON.stringify(deps), t, s.key);
    } else if (had.state === 'failed' && had.notBefore <= t) {
      // (a new ask after the failure's backoff: a fresh run, its attempts reset)
      this.db.prepare("UPDATE jobs SET state = 'queued', attempts = 0, prio = ?, deps = ?, error = NULL, updated = ? WHERE key = ?").run(s.prio, JSON.stringify(s.deps ?? had.deps), t, s.key);
    }
    want(s.key);
    return [s.key];
  }

  private insert(s: EnqueueSpec, first: number, grp: string | null) {
    const t = this.now();
    this.db.prepare(`INSERT INTO jobs (key, kind, build, prio, ring, args, deps, state, weight, first_asked, created, updated, grp)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?, ?, ?, ?)`)
      .run(s.key, s.kind, s.build, s.prio, s.ring ?? 0, JSON.stringify(s.args), JSON.stringify(s.deps ?? []), s.weight ?? 1, first, t, t, grp);
  }

  /** Raise (never lower) a job's priority and set its ring (a town's re-ringing when its frame lands). */
  reprioritise(key: string, prio: number, ring: number) {
    this.db.prepare("UPDATE jobs SET prio = MIN(prio, ?), ring = ?, updated = ? WHERE key = ? AND state = 'queued'").run(prio, ring, this.now(), key);
  }
  addDeps(key: string, deps: string[]) {
    const j = this.get(key); if (!j) return;
    this.db.prepare('UPDATE jobs SET deps = ?, updated = ? WHERE key = ?').run(JSON.stringify([...new Set([...j.deps, ...deps])]), this.now(), key);
  }

  /** Expired leases back to queued (with backoff), or failed after MAX_ATTEMPTS. */
  reap(): number {
    const t = this.now();
    const rows = (this.db.prepare("SELECT * FROM jobs WHERE state = 'leased' AND lease_until < ?").all(t) as Row[]).map(toJob);
    for (const j of rows) this.retryOrFail(j, `lease expired (worker ${j.leaseWorker})`);
    if (rows.length) this.changed();
    return rows.length;
  }

  private retryOrFail(j: Job, why: string) {
    const t = this.now();
    if (j.attempts >= MAX_ATTEMPTS) {
      this.db.prepare("UPDATE jobs SET state = 'failed', lease_id = NULL, lease_worker = NULL, lease_until = NULL, error = ?, not_before = ?, updated = ? WHERE key = ?")
        .run(why.slice(0, 600), t + 60_000, t, j.key);
      this.log('failed', { key: j.key, why: why.slice(0, 300) });
      // (everything that depends on it, transitively, fails with it)
      this.failDependents(j.key, why);
    } else {
      this.db.prepare("UPDATE jobs SET state = 'queued', lease_id = NULL, lease_worker = NULL, lease_until = NULL, error = ?, not_before = ?, updated = ? WHERE key = ?")
        .run(why.slice(0, 600), t + BACKOFF_MS * 2 ** Math.max(0, j.attempts - 1), t, j.key);
    }
  }
  private failDependents(key: string, why: string) {
    const rows = (this.db.prepare("SELECT * FROM jobs WHERE state IN ('queued', 'leased') AND deps LIKE ?").all(`%${JSON.stringify(key).slice(1, -1)}%`) as Row[]).map(toJob);
    for (const d of rows) {
      if (!d.deps.includes(key)) continue;
      this.db.prepare("UPDATE jobs SET state = 'failed', lease_id = NULL, error = ?, not_before = ?, updated = ? WHERE key = ?").run(`dependency ${key} failed: ${why}`.slice(0, 600), this.now() + 60_000, this.now(), d.key);
      this.failDependents(d.key, why);
    }
  }

  private seen(c: ClaimSpec) {
    this.db.prepare(`INSERT INTO workers (id, build, slots, seen, version, mem_mb) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET build = excluded.build, slots = excluded.slots, seen = excluded.seen, version = excluded.version, mem_mb = excluded.mem_mb`)
      .run(c.worker, c.build, c.totalSlots ?? c.freeSlots, this.now(), c.version ?? null, c.memMb ?? null);
  }

  /** The best claimable job for this worker, leased to it; null when there is none. */
  claim(c: ClaimSpec): (Job & { leaseId: string }) | null {
    this.reap();
    const got = this.tx(() => {
      this.seen(c);
      const t = this.now();
      const rows = (this.db.prepare(`SELECT * FROM jobs WHERE state = 'queued' AND (build = ? OR build = ?) AND not_before <= ?
        ORDER BY prio, first_asked, ring LIMIT 500`).all(c.build, ANY_BUILD, t) as Row[]).map(toJob);
      if (!rows.length) return null;
      const states = new Map<string, JobState>();
      const depsDone = (j: Job) => j.deps.every((d) => {
        if (!states.has(d)) { const r = this.db.prepare('SELECT state FROM jobs WHERE key = ?').get(d) as Row | undefined; states.set(d, (r?.state as JobState) ?? 'failed'); }
        return states.get(d) === 'done';
      });
      const ready = rows.filter(depsDone);
      if (!ready.length) return null;
      const reserveP0 = (c.totalSlots ?? c.freeSlots) > 1 && c.freeSlots <= 1;
      const interactive = ready.some((j) => j.prio <= 3);
      const fits = ready.filter((j) => j.args.notWorker !== c.worker && Math.min(j.weight, Math.max(1, c.totalSlots ?? c.freeSlots)) <= c.freeSlots && (!reserveP0 || j.prio === 0) && (j.prio < 5 || !interactive));
      if (!fits.length) return null;
      const p = fits[0].prio;
      const top = fits.filter((j) => j.prio === p);
      const cached = new Set(c.cached ?? []);
      const affinity = (j: Job) => ((j.args.regions as string[] | undefined) ?? []).some((r) => cached.has(r)) ? 1 : 0;
      const j = cached.size ? [...top].sort((a, b) => affinity(b) - affinity(a) || a.firstAsked - b.firstAsked || a.ring - b.ring)[0] : top[0];
      const leaseId = randomBytes(12).toString('hex');
      this.db.prepare("UPDATE jobs SET state = 'leased', lease_id = ?, lease_worker = ?, lease_until = ?, attempts = attempts + 1, updated = ? WHERE key = ? AND state = 'queued'")
        .run(leaseId, c.worker, t + LEASE_MS, t, j.key);
      return { ...j, state: 'leased' as JobState, leaseId, leaseWorker: c.worker, leaseUntil: t + LEASE_MS, attempts: j.attempts + 1 };
    });
    return got;
  }

  /** Extend a held lease; false when the lease is no longer this one's (the worker drops its result: HTTP 410). */
  heartbeat(key: string, leaseId: string, worker?: string): boolean {
    const t = this.now();
    if (worker) this.db.prepare('UPDATE workers SET seen = ? WHERE id = ?').run(t, worker);
    const r = this.db.prepare("UPDATE jobs SET lease_until = ?, updated = ? WHERE key = ? AND state = 'leased' AND lease_id = ?").run(t + LEASE_MS, t, key, leaseId);
    return Number(r.changes) === 1;
  }

  /**
   * A job done. `missing` checks the promised outputs are stored (done means stored): any missing and the attempt
   * counts as a failure. 'lost' when the lease is not this one's.
   */
  complete(key: string, leaseId: string, r: { ms?: number; peakMb?: number }, missing: (j: Job) => string[]): { ok: true; job: Job } | { ok: false; why: 'lost' | 'missing'; missing?: string[] } {
    const out = this.tx(() => {
      const j = this.get(key);
      if (!j || j.state !== 'leased' || j.leaseId !== leaseId) return { ok: false as const, why: 'lost' as const };
      const m = missing(j);
      if (m.length) { this.retryOrFail(j, `said done but ${m.length} output(s) are not stored: ${m.slice(0, 3).join(', ')}`); return { ok: false as const, why: 'missing' as const, missing: m }; }
      const t = this.now();
      this.db.prepare("UPDATE jobs SET state = 'done', lease_id = NULL, lease_worker = NULL, lease_until = NULL, done_ms = ?, peak_mb = ?, error = NULL, updated = ? WHERE key = ?")
        .run(r.ms ?? null, r.peakMb ?? null, t, key);
      if (r.ms != null && Number.isFinite(r.ms) && r.ms >= 0) {
        const c = this.db.prepare('SELECT ewma_ms, n FROM costs WHERE kind = ?').get(j.kind) as Row | undefined;
        const e = c ? (1 - EWMA) * Number(c.ewma_ms) + EWMA * r.ms : r.ms;
        this.db.prepare('INSERT INTO costs (kind, ewma_ms, n) VALUES (?, ?, 1) ON CONFLICT(kind) DO UPDATE SET ewma_ms = ?, n = n + 1').run(j.kind, e, e);
      }
      return { ok: true as const, job: { ...j, state: 'done' as JobState } };
    });
    this.changed();
    return out;
  }

  /**
   * A job failed. code 3 with missingRegions: a regions job (P = this job's) is added as a dep and this job re-queued
   * with no attempt charged. Anything else: retry with backoff, failed after MAX_ATTEMPTS.
   */
  fail(key: string, leaseId: string, f: { code?: number; reason?: string; regions?: { key: string; args: Record<string, unknown> } | null; final?: boolean }): { ok: boolean; regionsJob?: string } {
    const out = this.tx(() => {
      const j = this.get(key);
      if (!j || j.state !== 'leased' || j.leaseId !== leaseId) return { ok: false };
      const t = this.now();
      if (f.code === 3 && f.regions) {
        this.enqueueIn({ key: f.regions.key, kind: 'regions', build: ANY_BUILD, prio: j.prio, ring: j.ring, args: f.regions.args, weight: 2, firstAsked: j.firstAsked });
        for (const w of this.db.prepare('SELECT place FROM wants WHERE job = ?').all(key) as Row[]) this.db.prepare('INSERT OR IGNORE INTO wants (job, place) VALUES (?, ?)').run(f.regions.key, String(w.place));
        this.db.prepare("UPDATE jobs SET state = 'queued', deps = ?, attempts = MAX(0, attempts - 1), lease_id = NULL, lease_worker = NULL, lease_until = NULL, updated = ? WHERE key = ?")
          .run(JSON.stringify([...new Set([...j.deps, f.regions.key])]), t, key);
        return { ok: true, regionsJob: f.regions.key };
      }
      if (f.final) { this.db.prepare('UPDATE jobs SET attempts = ? WHERE key = ?').run(MAX_ATTEMPTS, key); j.attempts = MAX_ATTEMPTS; }
      this.retryOrFail(j, `exit ${f.code ?? '?'}: ${f.reason ?? ''}`);
      return { ok: true };
    });
    this.changed();
    return out;
  }

  // ------------------------------------------------------------------------------------------------- read models
  /** Live workers (seen within LIVE_MS) and their slots. */
  liveWorkers(): { id: string; build: string | null; slots: number; seen: number; version: string | null; memMb: number | null }[] {
    return (this.db.prepare('SELECT * FROM workers WHERE seen >= ? ORDER BY id').all(this.now() - LIVE_MS) as Row[])
      .map((r) => ({ id: String(r.id), build: (r.build as string) ?? null, slots: Number(r.slots) || 0, seen: Number(r.seen), version: (r.version as string) ?? null, memMb: r.mem_mb == null ? null : Number(r.mem_mb) }));
  }
  liveSlots(): number { return this.liveWorkers().reduce((a, w) => a + w.slots, 0); }
  costOf(kind: JobKind, fallbackMs: number): number { const c = this.db.prepare('SELECT ewma_ms FROM costs WHERE kind = ?').get(kind) as Row | undefined; return c ? Number(c.ewma_ms) : fallbackMs; }
  costs(): Record<string, { ewmaMs: number; n: number }> { return Object.fromEntries((this.db.prepare('SELECT * FROM costs').all() as Row[]).map((r) => [String(r.kind), { ewmaMs: Math.round(Number(r.ewma_ms)), n: Number(r.n) }])); }
  /** Queue depth by priority and state. */
  depth(): { prio: number; state: string; n: number; weight: number }[] {
    return (this.db.prepare("SELECT prio, state, COUNT(*) n, SUM(weight) w FROM jobs WHERE state IN ('queued', 'leased') GROUP BY prio, state ORDER BY prio, state").all() as Row[])
      .map((r) => ({ prio: Number(r.prio), state: String(r.state), n: Number(r.n), weight: Number(r.w) }));
  }
  /** Queued and leased jobs at or under a priority, with their kinds (the wait estimate's work ahead). */
  ahead(prio: number, before: number): { kind: JobKind; weight: number; n: number }[] {
    return (this.db.prepare("SELECT kind, weight, COUNT(*) n FROM jobs WHERE state IN ('queued', 'leased') AND prio <= ? AND first_asked <= ? GROUP BY kind, weight").all(prio, before) as Row[])
      .map((r) => ({ kind: r.kind as JobKind, weight: Number(r.weight), n: Number(r.n) }));
  }
  recentEvents(n = 50) { return (this.db.prepare('SELECT * FROM events ORDER BY at DESC LIMIT ?').all(n) as Row[]).map((r) => ({ at: Number(r.at), kind: String(r.kind), ...JSON.parse(String(r.data)) })); }
}
