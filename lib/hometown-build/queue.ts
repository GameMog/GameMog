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
 *   tiles    a tile job of several tiles that fails for good is split into one job per tile (3 attempts each, so one
 *            bad tile never costs its 15 neighbours; a district bundle, args.window, then waits on its window's only);
 *            a one-tile job that fails for good DEGRADES the full bundles that wait on it (the dep is dropped, the tile
 *            listed in args.absent: the worker lays flat ground there) unless the tile is in the town's spawn district
 *            (args.keep: the bundle fails), drops out of a district bundle whose window it is not in, and fails anything
 *            else that waits on it (a district bundle: the spawn path fails clearly). A "Try again" (retryFailed) takes
 *            the tiles it queues again out of the full bundle's args.absent
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
export type ClaimSpec = { worker: string; build: string; freeSlots: number; totalSlots?: number; cached?: string[]; version?: string; memMb?: number;
  /** the worker's deploy stamp (stamp.ts): which workflow deploy the build it reports belongs to */
  deploy?: string | null };

export const LEASE_MS = 60_000;
export const HEARTBEAT_MS = 15_000;
export const MAX_ATTEMPTS = 3;
export const BACKOFF_MS = 5_000;
/** a worker seen within this long counts as live (its slots in the wait estimate) */
export const LIVE_MS = 30_000;
/** any build may claim these (a staged region is the same rows whatever compiler reads it) */
export const ANY_BUILD = '*';
/** a claim looks this deep into the queued rows at most (pages of 500) */
export const CLAIM_SCAN_MAX = 20_000;
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
CREATE TABLE IF NOT EXISTS ip_hits (ip TEXT NOT NULL, at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS ip_hits_ip ON ip_hits(ip, at);
CREATE TABLE IF NOT EXISTS pending (place TEXT PRIMARY KEY, source TEXT NOT NULL, asked INTEGER NOT NULL);
`;
/** (added after the first release: a column an older queue.db lacks, added at open) */
const MIGRATE = `CREATE INDEX IF NOT EXISTS jobs_plan ON jobs(state, build, kind, prio, units, weight);`;

type Row = Record<string, unknown>;
const toJob = (r: Row): Job => ({
  key: String(r.key), kind: r.kind as JobKind, build: String(r.build), prio: Number(r.prio), ring: Number(r.ring), args: JSON.parse(String(r.args)),
  deps: JSON.parse(String(r.deps)), state: r.state as JobState, attempts: Number(r.attempts), notBefore: Number(r.not_before),
  leaseId: (r.lease_id as string) ?? null, leaseWorker: (r.lease_worker as string) ?? null, leaseUntil: r.lease_until == null ? null : Number(r.lease_until),
  weight: Number(r.weight), firstAsked: Number(r.first_asked), created: Number(r.created), updated: Number(r.updated),
  doneMs: r.done_ms == null ? null : Number(r.done_ms), peakMb: r.peak_mb == null ? null : Number(r.peak_mb), error: (r.error as string) ?? null, grp: (r.grp as string) ?? null,
});

/**
 * A job's size in cost units: a tile job is 1 + tiles/4 (a fixed start, World and source load, plus each tile:
 * measured locally, a 4-tile quad costs about 2/5 of a 16-tile block), every other job 1.
 */
export const jobUnits = (j: { kind: string; args: Record<string, unknown> }) => j.kind === 'tiles' ? 1 + maskBits(Number(j.args.mask) & 0xffff).length / 4 : 1;
/** The bits of a tile mask (16 tiles of an L2 block, bit i = tile (i % 4, i >> 2) of the block). */
export const maskBits = (m: number) => { const out: number[] = []; for (let i = 0; i < 16; i++) if (m & (1 << i)) out.push(i); return out; };
/** Whether tile "hg1-conus/0/c/r" lies in the tile window [c0, r0, c1, r1] (a bundle's args.window, a full bundle's args.keep). */
export const tileInWindow = (id: string, w: unknown): boolean => {
  if (!Array.isArray(w) || w.length !== 4) return false;
  const [, , c, r] = id.split('/').map(Number);
  return c >= w[0] && c <= w[2] && r >= w[1] && r <= w[3];
};
/** The tile ids a tile job builds ("hg1-conus/2/C/R" + mask -> "hg1-conus/0/c/r", ...). */
export const tileIdsOfJob = (args: Record<string, unknown>): string[] => {
  const [g, , C, R] = String(args.block).split('/');
  return maskBits(Number(args.mask) & 0xffff).map((i) => `${g}/0/${Number(C) * 4 + (i & 3)}/${Number(R) * 4 + (i >> 2)}`);
};

export class BuildQueue {
  readonly db: DatabaseSync;
  now: () => number;
  private listeners = new Set<() => void>();

  constructor(o: { file: string; now?: () => number }) {
    if (o.file !== ':memory:') mkdirSync(path.dirname(o.file), { recursive: true });
    this.db = new DatabaseSync(o.file);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;');
    this.db.exec(SCHEMA);
    // (a job's size in cost units, kept with the row so the dispatcher's plan sums it in SQL: jobUnits)
    const cols = (this.db.prepare('PRAGMA table_info(jobs)').all() as Row[]).map((r) => String(r.name));
    if (!cols.includes('units')) this.db.exec('ALTER TABLE jobs ADD COLUMN units REAL');
    // (the deploy stamp a worker reports with its claims, 14 Nov: towns.ts buildView)
    const wcols = (this.db.prepare('PRAGMA table_info(workers)').all() as Row[]).map((r) => String(r.name));
    if (!wcols.includes('deploy')) this.db.exec('ALTER TABLE workers ADD COLUMN deploy TEXT');
    // (the town an address asked for, 14 Nov: the limit counts towns, so a "Try again" of the same town is no new one)
    const icols = (this.db.prepare('PRAGMA table_info(ip_hits)').all() as Row[]).map((r) => String(r.name));
    if (!icols.includes('place')) this.db.exec('ALTER TABLE ip_hits ADD COLUMN place TEXT');
    this.db.exec(MIGRATE);
    const fill = this.db.prepare('UPDATE jobs SET units = ? WHERE key = ?');
    for (const r of this.db.prepare('SELECT key, kind, args FROM jobs WHERE units IS NULL').all() as Row[]) {
      let args: Record<string, unknown> = {};
      try { args = JSON.parse(String(r.args)); } catch { /* one unit */ }
      fill.run(jobUnits({ kind: String(r.kind), args }), String(r.key));
    }
    this.now = o.now ?? Date.now;
  }

  close() { this.db.close(); }
  /** Long-poll wake-ups: called after anything a claim could now take. */
  onChange(f: () => void) { this.listeners.add(f); return () => this.listeners.delete(f); }
  changed() { for (const f of [...this.listeners]) { try { f(); } catch { /* a listener's own problem */ } } }

  /** One transaction; re-entrant (an inner tx joins the outer one, so a town and all its jobs commit together). */
  private txDepth = 0;
  tx<T>(f: () => T): T {
    if (this.txDepth > 0) return f();
    this.db.exec('BEGIN IMMEDIATE');
    this.txDepth++;
    try { const r = f(); this.txDepth--; this.db.exec('COMMIT'); return r; } catch (e) { this.txDepth = 0; try { this.db.exec('ROLLBACK'); } catch { /* none open */ } throw e; }
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
      // (a quad job, args.part 0-3: the 2 x 2 tiles of one quarter of the block, for the spawn's neighbourhood, so the
      // district's tiles run on several slots at once instead of one 16-tile block per slot. It merges only with its own
      // quad's queued job; leased or done jobs of the WHOLE block, quads or not, cover their bits)
      const part = s.args.part == null ? '' : `:q${Number(s.args.part)}`;
      const base = `${s.build}:${block}`, grp = base + part;
      // (the block and its four quads by the grp index: a LIKE here scanned the whole table on every tile enqueue)
      const rows = (this.db.prepare("SELECT * FROM jobs WHERE grp IN (?, ?, ?, ?, ?) AND state != 'failed'").all(base, `${base}:q0`, `${base}:q1`, `${base}:q2`, `${base}:q3`) as Row[]).map(toJob);
      const keys: string[] = [];
      let covered = 0;
      for (const j of rows) if (j.state !== 'queued') { covered |= Number(j.args.mask); if (Number(j.args.mask) & mask) keys.push(j.key); }
      const need = mask & ~covered;
      const q = rows.find((j) => j.state === 'queued' && (j.args.part == null ? '' : `:q${Number(j.args.part)}`) === part);
      if (need && q) {
        const m = Number(q.args.mask) | need;
        this.db.prepare('UPDATE jobs SET args = ?, units = ?, prio = MIN(prio, ?), ring = MIN(ring, ?), first_asked = MIN(first_asked, ?), updated = ? WHERE key = ?')
          .run(JSON.stringify({ ...q.args, mask: m }), jobUnits({ kind: 'tiles', args: { mask: m } }), s.prio, s.ring ?? 0, first, t, q.key);
        keys.push(q.key);
      } else if (need) {
        const key = `${s.key}:${need.toString(16).padStart(4, '0')}`;
        if (this.get(key)) {
          // (a failed job of these very bits, asked again: a fresh run of it; inserting the key again would throw)
          this.db.prepare("UPDATE jobs SET state = 'queued', attempts = 0, not_before = 0, prio = ?, ring = ?, first_asked = ?, deps = ?, error = NULL, lease_id = NULL, lease_worker = NULL, lease_until = NULL, updated = ? WHERE key = ?")
            .run(s.prio, s.ring ?? 0, first, JSON.stringify(s.deps ?? []), t, key);
        } else this.insert({ ...s, key, args: { ...s.args, mask: need } }, first, grp);
        keys.push(key);
      } else if (q && Number(q.args.mask) & mask) {
        this.db.prepare('UPDATE jobs SET prio = MIN(prio, ?), ring = MIN(ring, ?), first_asked = MIN(first_asked, ?), updated = ? WHERE key = ?').run(s.prio, s.ring ?? 0, first, t, q.key);
        keys.push(q.key);
      }
      for (const k of keys) want(k);
      // (the block's failed jobs no longer hold this town: their bits are queued again above)
      if (s.place) this.db.prepare("DELETE FROM wants WHERE place = ? AND job IN (SELECT key FROM jobs WHERE grp = ? AND state = 'failed')").run(s.place, grp);
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

  private insert(s: EnqueueSpec, first: number, grp: string | null, notBefore = 0) {
    const t = this.now();
    this.db.prepare(`INSERT INTO jobs (key, kind, build, prio, ring, args, deps, state, weight, first_asked, created, updated, grp, units, not_before)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?, ?, ?, ?, ?, ?)`)
      .run(s.key, s.kind, s.build, s.prio, s.ring ?? 0, JSON.stringify(s.args), JSON.stringify(s.deps ?? []), s.weight ?? 1, first, t, t, grp, jobUnits(s), notBefore);
  }

  /**
   * An explicit "try again" of a town whose build failed: every failed job the town waits on is queued again at once,
   * its attempts reset (the 60 s a failure otherwise holds a job is for asks of OTHER towns sharing it, not for this
   * player's own retry). -> the jobs re-queued.
   */
  retryFailed(place: string): string[] {
    return this.tx(() => {
      const keys = (this.db.prepare("SELECT j.key FROM jobs j JOIN wants w ON w.job = j.key WHERE w.place = ? AND j.state = 'failed'").all(place) as Row[]).map((r) => String(r.key));
      const up = this.db.prepare("UPDATE jobs SET state = 'queued', attempts = 0, not_before = 0, error = NULL, lease_id = NULL, lease_worker = NULL, lease_until = NULL, updated = ? WHERE key = ?");
      for (const k of keys) up.run(this.now(), k);
      // (a tile tried again is no longer absent: the town's unbuilt full bundle waits for it again instead of laying it as
      // flat ground (Jupiter Inlet Colony's rebuilt spawn tile was laid flat all the same))
      const again = keys.map((k) => this.get(k)!).filter((j) => j.kind === 'tiles');
      if (again.length) {
        const ids = new Map(again.flatMap((j) => tileIdsOfJob(j.args).map((t) => [t, j.key] as [string, string])));
        const fulls = (this.db.prepare("SELECT j.* FROM jobs j JOIN wants w ON w.job = j.key WHERE w.place = ? AND j.kind = 'bundle' AND j.state IN ('queued', 'leased')").all(place) as Row[]).map(toJob)
          .filter((b) => b.args.variant === 'full' && ((b.args.absent as string[] | undefined) ?? []).some((t) => ids.has(t)));
        for (const b of fulls) {
          const absent = (b.args.absent as string[]).filter((t) => !ids.has(t));
          const back = (b.args.absent as string[]).filter((t) => ids.has(t)).map((t) => ids.get(t)!);
          const args = { ...b.args }; if (absent.length) args.absent = absent; else delete args.absent;
          this.db.prepare('UPDATE jobs SET deps = ?, args = ?, updated = ? WHERE key = ?').run(JSON.stringify([...new Set([...b.deps, ...back])]), JSON.stringify(args), this.now(), b.key);
        }
      }
      if (keys.length) this.log('retry', { place, jobs: keys.length });
      return keys;
    });
  }

  /**
   * The towns asked from one address (a hash of it) since `since`, each town once: a town asked again (a failed town's
   * "Try again") is not another town. `place`: the count without that town (is it a NEW town for this address?).
   * Persisted, so a deploy never resets the limit. (A row from before the place was kept counts as its own town.)
   */
  ipCount(ip: string, since: number, place?: string): number {
    return Number((this.db.prepare("SELECT COUNT(DISTINCT COALESCE(place, 'row:' || rowid)) n FROM ip_hits WHERE ip = ? AND at >= ? AND (? IS NULL OR place IS NULL OR place != ?)")
      .get(ip, since, place ?? null, place ?? null) as Row).n);
  }
  /** Whether this address asked for this town since `since` (its own pick, counted already). */
  ipAsked(ip: string, since: number, place: string): boolean { return !!this.db.prepare('SELECT 1 FROM ip_hits WHERE ip = ? AND at >= ? AND place = ? LIMIT 1').get(ip, since, place); }
  ipHit(ip: string, at: number, place?: string) {
    this.db.prepare('INSERT INTO ip_hits (ip, at, place) VALUES (?, ?, ?)').run(ip, at, place ?? null);
    if (Math.random() < 0.02) this.db.prepare('DELETE FROM ip_hits WHERE at < ?').run(at - 2 * 3600_000);
  }

  /** Raise (never lower) a job's priority and set its ring (a town's re-ringing when its frame lands). */
  reprioritise(key: string, prio: number, ring: number) {
    this.db.prepare("UPDATE jobs SET prio = MIN(prio, ?), ring = ?, updated = ? WHERE key = ? AND state = 'queued'").run(prio, ring, this.now(), key);
  }
  /** Merge into a job's args (a full bundle's args.keep once the town's spawn district is known). */
  mergeArgs(key: string, patch: Record<string, unknown>) {
    const j = this.get(key); if (!j) return;
    this.db.prepare('UPDATE jobs SET args = ?, updated = ? WHERE key = ?').run(JSON.stringify({ ...j.args, ...patch }), this.now(), key);
  }
  /** Fail a queued job for good now (and what waits on it), with why: a full bundle that would lay the spawn district flat. */
  failNow(key: string, why: string) {
    this.tx(() => {
      const j = this.get(key);
      if (!j || j.state !== 'queued') return;
      this.db.prepare("UPDATE jobs SET state = 'failed', attempts = ?, error = ?, not_before = ?, updated = ? WHERE key = ?").run(MAX_ATTEMPTS, why.slice(0, 600), this.now() + 60_000, this.now(), key);
      this.log('failed', { key, why: why.slice(0, 300) });
      this.failDependents(key, why, j);
    });
  }
  addDeps(key: string, deps: string[]) {
    const j = this.get(key); if (!j) return;
    this.db.prepare('UPDATE jobs SET deps = ?, updated = ? WHERE key = ?').run(JSON.stringify([...new Set([...j.deps, ...deps])]), this.now(), key);
  }

  /**
   * A web server just started: every lease gets a fresh LEASE_MS. A deploy of the web (a disk service: stop, then start)
   * can be down longer than a lease, and its workers' heartbeats could not land meanwhile; without this the first
   * claim's reap would requeue (and charge) every job still running fine on a worker. A worker that really died is
   * reaped one lease later.
   */
  graceLeases(): number {
    const t = this.now();
    return Number(this.db.prepare("UPDATE jobs SET lease_until = MAX(lease_until, ?) WHERE state = 'leased'").run(t + LEASE_MS).changes);
  }

  /** Expired leases back to queued (with backoff), or failed after MAX_ATTEMPTS. */
  reap(): number {
    const t = this.now();
    const rows = (this.db.prepare("SELECT * FROM jobs WHERE state = 'leased' AND lease_until < ?").all(t) as Row[]).map(toJob);
    for (const j of rows) this.retryOrFail(j, `lease expired (worker ${j.leaseWorker})`);
    if (rows.length) this.changed();
    return rows.length;
  }

  private retryOrFail(j: Job, why: string, final = false) {
    const t = this.now();
    if (j.attempts >= MAX_ATTEMPTS) {
      // (a tile job of several tiles: one per tile from here, so the tiles that do compile are kept)
      if (j.kind === 'tiles' && !final && maskBits(Number(j.args.mask) & 0xffff).length > 1) { this.split(j, why); return; }
      this.db.prepare("UPDATE jobs SET state = 'failed', lease_id = NULL, lease_worker = NULL, lease_until = NULL, error = ?, not_before = ?, updated = ? WHERE key = ?")
        .run(why.slice(0, 600), t + 60_000, t, j.key);
      this.log('failed', { key: j.key, why: why.slice(0, 300) });
      // (everything that depends on it, transitively, fails with it; a full bundle waiting on a tile job degrades)
      this.failDependents(j.key, why, j);
    } else {
      this.db.prepare("UPDATE jobs SET state = 'queued', lease_id = NULL, lease_worker = NULL, lease_until = NULL, error = ?, not_before = ?, updated = ? WHERE key = ?")
        .run(why.slice(0, 600), t + BACKOFF_MS * 2 ** Math.max(0, j.attempts - 1), t, j.key);
    }
  }
  private failDependents(key: string, why: string, failed?: Job) {
    const rows = (this.db.prepare("SELECT * FROM jobs WHERE state IN ('queued', 'leased') AND deps LIKE ?").all(`%${JSON.stringify(key).slice(1, -1)}%`) as Row[]).map(toJob);
    for (const d of rows) {
      if (!d.deps.includes(key)) continue;
      const tiles = failed?.kind === 'tiles' ? tileIdsOfJob(failed.args) : [];
      if (tiles.length && d.kind === 'bundle' && Array.isArray(d.args.window) && !tiles.some((t) => tileInWindow(t, d.args.window)) && d.state === 'queued') {
        // (a district bundle never waits on a tile outside its window: Surfside's spawn district failed for a tile of the
        // same block job outside it. The dep is dropped; the full bundle degrades for that tile)
        this.db.prepare('UPDATE jobs SET deps = ?, updated = ? WHERE key = ?').run(JSON.stringify(d.deps.filter((k) => k !== key)), this.now(), d.key);
        continue;
      }
      // (a full bundle is degraded (flat ground) for a tile outside the town's spawn district only, args.keep: a town with
      // its downtown laid flat is not built (Beverly Beach was served 'ready' that way); one inside fails the bundle)
      if (tiles.length && d.kind === 'bundle' && d.args.variant === 'full' && d.state === 'queued' && !tiles.some((t) => tileInWindow(t, d.args.keep))) {
        // (the whole town goes on without these tiles: flat ground in their place, listed in the bundle's args.absent)
        const absent = [...new Set([...((d.args.absent as string[] | undefined) ?? []), ...tiles])].sort();
        this.db.prepare('UPDATE jobs SET deps = ?, args = ?, updated = ? WHERE key = ?').run(JSON.stringify(d.deps.filter((k) => k !== key)), JSON.stringify({ ...d.args, absent }), this.now(), d.key);
        this.log('degraded', { bundle: d.key, job: key, tiles, why: why.slice(0, 200) });
        continue;
      }
      this.db.prepare("UPDATE jobs SET state = 'failed', lease_id = NULL, error = ?, not_before = ?, updated = ? WHERE key = ?").run(`dependency ${key} failed: ${why}`.slice(0, 600), this.now() + 60_000, this.now(), d.key);
      this.failDependents(d.key, why);
    }
  }

  /** A tile job of several tiles that failed for good, as one job per tile (fresh attempts, after a backoff); the
   * towns that wanted it want each, and the jobs that waited on it wait on each. The job itself is removed. */
  private split(j: Job, why: string) {
    const t = this.now();
    const keys: string[] = [];
    for (const i of maskBits(Number(j.args.mask) & 0xffff)) {
      const key = `${j.key}:t${i}`;
      keys.push(key);
      if (this.get(key)) {
        this.db.prepare("UPDATE jobs SET state = 'queued', attempts = 0, not_before = ?, error = NULL, lease_id = NULL, lease_worker = NULL, lease_until = NULL, updated = ? WHERE key = ?").run(t + BACKOFF_MS, t, key);
      } else {
        this.insert({ key, kind: 'tiles', build: j.build, prio: j.prio, ring: j.ring, args: { ...j.args, mask: 1 << i, split: true }, deps: j.deps, weight: j.weight }, j.firstAsked, j.grp, t + BACKOFF_MS);
      }
      this.db.prepare('INSERT OR IGNORE INTO wants (job, place) SELECT ?, place FROM wants WHERE job = ?').run(key, j.key);
    }
    // (a district bundle (args.window) waits only on the tiles of its window: the block's other tiles may fail alone)
    const [g, , C, R] = String(j.args.block).split('/');
    const tileOf = (k: string) => { const i = Number(k.slice(k.lastIndexOf(':t') + 2)); return `${g}/0/${Number(C) * 4 + (i & 3)}/${Number(R) * 4 + (i >> 2)}`; };
    for (const d of (this.db.prepare("SELECT * FROM jobs WHERE state IN ('queued', 'leased') AND deps LIKE ?").all(`%${JSON.stringify(j.key).slice(1, -1)}%`) as Row[]).map(toJob)) {
      if (!d.deps.includes(j.key)) continue;
      const mine = Array.isArray(d.args.window) ? keys.filter((k) => tileInWindow(tileOf(k), d.args.window)) : keys;
      this.db.prepare('UPDATE jobs SET deps = ?, updated = ? WHERE key = ?').run(JSON.stringify([...new Set(d.deps.flatMap((k) => (k === j.key ? mine : [k])))]), t, d.key);
    }
    this.db.prepare('DELETE FROM wants WHERE job = ?').run(j.key);
    this.db.prepare('DELETE FROM jobs WHERE key = ?').run(j.key);
    this.log('split', { key: j.key, into: keys.length, why: why.slice(0, 300) });
  }

  /** A worker seen now (its build becomes the current one when none is pinned: towns.ts currentBuild). */
  seenWorker(c: ClaimSpec) { this.seen(c); }
  /** The slots a worker's leased jobs hold (the claim's long-poll re-reads its free slots from this). */
  heldBy(worker: string, totalSlots: number): number {
    return Number((this.db.prepare("SELECT COALESCE(SUM(MIN(weight, ?)), 0) n FROM jobs WHERE state = 'leased' AND lease_worker = ?").get(Math.max(1, totalSlots), worker) as Row).n);
  }

  private seen(c: ClaimSpec) {
    this.db.prepare(`INSERT INTO workers (id, build, slots, seen, version, mem_mb, deploy) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET build = excluded.build, slots = excluded.slots, seen = excluded.seen, version = excluded.version, mem_mb = excluded.mem_mb, deploy = excluded.deploy`)
      .run(c.worker, c.build, c.totalSlots ?? c.freeSlots, this.now(), c.version ?? null, c.memMb ?? null, c.deploy ?? null);
  }

  /** The best claimable job for this worker, leased to it; null when there is none. */
  claim(c: ClaimSpec): (Job & { leaseId: string }) | null {
    this.reap();
    const got = this.tx(() => {
      this.seen(c);
      const t = this.now();
      const states = new Map<string, JobState>();
      const depsDone = (j: Job) => j.deps.every((d) => {
        if (!states.has(d)) { const r = this.db.prepare('SELECT state FROM jobs WHERE key = ?').get(d) as Row | undefined; states.set(d, (r?.state as JobState) ?? 'failed'); }
        return states.get(d) === 'done';
      });
      const reserveP0 = (c.totalSlots ?? c.freeSlots) > 1 && c.freeSlots <= 1;
      // (pages of 500 in claim order: rows waiting on their deps (a whole town behind its regions) must not hide a ready
      // job further down; the rows seen so far decide 'interactive', which the order makes exact for P5)
      const page = this.db.prepare(`SELECT * FROM jobs WHERE state = 'queued' AND (build = ? OR build = ?) AND not_before <= ?
        ORDER BY prio, first_asked, ring, key LIMIT 500 OFFSET ?`);
      const ready: Job[] = [];
      let fits: Job[] = [];
      for (let off = 0; off < CLAIM_SCAN_MAX; off += 500) {
        const rows = (page.all(c.build, ANY_BUILD, t, off) as Row[]).map(toJob);
        ready.push(...rows.filter(depsDone));
        const interactive = ready.some((j) => j.prio <= 3);
        fits = ready.filter((j) => j.args.notWorker !== c.worker && Math.min(j.weight, Math.max(1, c.totalSlots ?? c.freeSlots)) <= c.freeSlots && (!reserveP0 || j.prio === 0) && (j.prio < 5 || !interactive));
        if (fits.length || rows.length < 500) break;
      }
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
        // (a tile job's cost is kept per tile unit, so 16-tile blocks and 4-tile quads share one estimate: jobUnits)
        const ms = r.ms / jobUnits(j);
        const e = c ? (1 - EWMA) * Number(c.ewma_ms) + EWMA * ms : ms;
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
        const had = this.get(f.regions.key);
        if (had?.state === 'done') {
          // (said done, yet a worker could not stage it: its files are gone (src LRU GC). Fetch it again, and charge this
          // job the attempt, so a region that never stages cannot loop a job forever with no backoff)
          this.db.prepare("UPDATE jobs SET state = 'queued', attempts = 0, not_before = 0, error = NULL, updated = ? WHERE key = ?").run(t, f.regions.key);
          for (const w of this.db.prepare('SELECT place FROM wants WHERE job = ?').all(key) as Row[]) this.db.prepare('INSERT OR IGNORE INTO wants (job, place) VALUES (?, ?)').run(f.regions.key, String(w.place));
          this.db.prepare('UPDATE jobs SET deps = ? WHERE key = ?').run(JSON.stringify([...new Set([...j.deps, f.regions.key])]), key);
          this.retryOrFail({ ...j, deps: [...new Set([...j.deps, f.regions.key])] }, `regions ${f.regions.key} were done but not stageable: fetched again`);
          return { ok: true, regionsJob: f.regions.key };
        }
        if (had?.state === 'failed' && had.notBefore > t) {
          // (its regions failed for good moments ago: this job fails too, rather than waiting on a failed dep forever)
          this.retryOrFail({ ...j, attempts: MAX_ATTEMPTS }, `regions ${f.regions.key} failed: ${had.error ?? ''}`, true);
          return { ok: true };
        }
        this.enqueueIn({ key: f.regions.key, kind: 'regions', build: ANY_BUILD, prio: j.prio, ring: j.ring, args: f.regions.args, weight: 2, firstAsked: j.firstAsked });
        for (const w of this.db.prepare('SELECT place FROM wants WHERE job = ?').all(key) as Row[]) this.db.prepare('INSERT OR IGNORE INTO wants (job, place) VALUES (?, ?)').run(f.regions.key, String(w.place));
        this.db.prepare("UPDATE jobs SET state = 'queued', deps = ?, attempts = MAX(0, attempts - 1), lease_id = NULL, lease_worker = NULL, lease_until = NULL, updated = ? WHERE key = ?")
          .run(JSON.stringify([...new Set([...j.deps, f.regions.key])]), t, key);
        return { ok: true, regionsJob: f.regions.key };
      }
      if (f.final) { this.db.prepare('UPDATE jobs SET attempts = ? WHERE key = ?').run(MAX_ATTEMPTS, key); j.attempts = MAX_ATTEMPTS; }
      this.retryOrFail(j, `exit ${f.code ?? '?'}: ${f.reason ?? ''}`, !!f.final);
      return { ok: true };
    });
    this.changed();
    return out;
  }

  /** The queued or leased regions job that will fetch region dom/C/R, if any (one region is fetched by one job). */
  regionsActive(dom: string, C: number, R: number): string | null {
    const r = this.db.prepare("SELECT key FROM jobs WHERE kind = 'regions' AND state IN ('queued', 'leased') AND args LIKE ? ORDER BY created LIMIT 1").get(`%"${dom}/${C}/${R}"%`) as Row | undefined;
    return r ? String(r.key) : null;
  }

  // ------------------------------------------------------------------------------------------------- read models
  /** Live workers (seen within LIVE_MS) and their slots. */
  liveWorkers(): { id: string; build: string | null; slots: number; seen: number; version: string | null; memMb: number | null; deploy: string | null }[] {
    return (this.db.prepare('SELECT * FROM workers WHERE seen >= ? ORDER BY id').all(this.now() - LIVE_MS) as Row[])
      .map((r) => ({ id: String(r.id), build: (r.build as string) ?? null, slots: Number(r.slots) || 0, seen: Number(r.seen), version: (r.version as string) ?? null, memMb: r.mem_mb == null ? null : Number(r.mem_mb), deploy: (r.deploy as string) ?? null }));
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
  /** The work ahead, by kind and weight: n is a count of jobs, or for tiles a count of tile units (jobUnits). */
  ahead(prio: number, before: number): { kind: JobKind; weight: number; n: number }[] {
    const out = (this.db.prepare("SELECT kind, weight, COUNT(*) n FROM jobs WHERE state IN ('queued', 'leased') AND prio <= ? AND first_asked <= ? AND kind != 'tiles' GROUP BY kind, weight").all(prio, before) as Row[])
      .map((r) => ({ kind: r.kind as JobKind, weight: Number(r.weight), n: Number(r.n) }));
    let units = 0;
    for (const r of this.db.prepare("SELECT args FROM jobs WHERE state IN ('queued', 'leased') AND prio <= ? AND first_asked <= ? AND kind = 'tiles'").all(prio, before) as Row[]) {
      try { units += jobUnits({ kind: 'tiles', args: JSON.parse(String(r.args)) }); } catch { units += 5; }
    }
    if (units) out.push({ kind: 'tiles', weight: 1, n: units });
    return out;
  }
  recentEvents(n = 50) { return (this.db.prepare('SELECT * FROM events ORDER BY at DESC LIMIT ?').all(n) as Row[]).map((r) => ({ at: Number(r.at), kind: String(r.kind), ...JSON.parse(String(r.data)) })); }
}
