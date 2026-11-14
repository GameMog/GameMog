/**
 * Hometown towns (Phase A, local only): a picked US town built into a town bundle (lib/hometown/bundle.ts) and kept.
 *
 *   requestTown(placeId, ip)   POST /api/towns: a built town at once (ready, its lock), else its build queued or running
 *                              (single flight: a second player asking for the same town waits on the same job), else a
 *                              refusal (unknown place 404, limits 429 / 503)
 *   townStatus(placeId)        GET /api/towns/{placeId}: the same shape, never starts anything
 *   readyLock(placeId)         the lock of the town as built at the current compiler build, or null
 *   cityPackageByLock(lock)    the CityPackage a lock names, read from its bundle (a Mog reads its parent's by its lock,
 *                              never the town's current build)
 *   bundleFile(parts)          a stored bundle file for /towns/..., or null: never builds anything
 *
 * One job runs at a time, first in first out, under `nice`, in a child with only an allowlisted environment (it never
 * sees the server's keys): the hg1 compiler's descriptor (the tile count), its whole-place compile (fetching the map
 * regions it lacks first), then the bundle written beside the others and the town's ready lock. A job's state is kept
 * on the disk (data/towns/jobs), so a restart shows a job it cut short as interrupted, and a re-POST builds it again.
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { placeById } from '../places/search.ts';
import type { Place } from '../places/types.ts';
import { cityLock, packageProblems, type CityPackage } from '../../storykit/hometown/city-package.ts';
import type { HometownLock } from '../../storykit/pack/cities.ts';
import { cityPackageOf, geodataJson, readGeodataJs } from './bundle.ts';
import { TOWN_ID, serviceLock, storyLock, type ServiceLock } from './ids.ts';
import { townsConfig, type TownsConfig } from './config.ts';
import { playBox, BOX_SOURCE } from './box.ts';
import { TOWN_WORDS } from './words.ts';
import { cityPackageFromStore } from '../hometown-build/towns.ts';
import { hometownStore } from '../hometown-tiles/config.ts';

export type TownState = 'queued' | 'reading' | 'fetching' | 'compiling' | 'assembling' | 'ready' | 'error' | 'interrupted';
export type Job = {
  placeId: string; buildId: string; state: TownState; done: number; total: number;
  queuedAt: number; startedAt?: number; endedAt?: number; error?: string; fetched?: boolean;
  /** a failed job: the stage it failed in, and why (timeout: over HOMETOWN_JOB_SECS; stalled: nothing written for
   *  HOMETOWN_STALL_SECS; error: the compiler or the package said no) */
  failedAt?: TownState; reason?: 'timeout' | 'stalled' | 'error';
  /** of `done`, the tiles that were in the store already (another town's build, or this one's cut short) */
  stored?: number;
};
export type TownSummary = { name: string; state: string; places: number; streets: number };
export type TownAnswer =
  | { status: 200; body: { state: 'ready'; placeId: string; lock: HometownLock; town: TownSummary } }
  | { status: 202; body: { state: TownState; placeId: string; stage: string; done: number; total: number; position: number; etaS: number | null } }
  | { status: 400 | 404 | 409 | 429 | 503; body: { state?: TownState; placeId?: string; error: string; stage?: string; reason?: Job['reason'] } };

export { TOWN_WORDS } from './words.ts';

/** The descriptor's limit: a capped town's reads the map round its internal point for its downtown (its ctx blocks). */
const STAGE1_MS = 300_000;
/**
 * The canonical box of a picked place: THE play box (lib/hometown/box.ts, one rule for on-demand and pre-warm). With the
 * internal point and the uncapped search box (searchBbox) it is the compiler's input: since compiler 0.8.0 a capped box
 * moves onto the place's downtown (MogCity tools/hometown/assemble.py downtown_box); changing this rule changes towns.
 */
export const canonicalBox = (p: Pick<Place, 'lat' | 'lon' | 'bbox'>) => playBox(p);

// ------------------------------------------------------------------------------------------------------------ state
type Runtime = { cfg: TownsConfig; queue: string[]; running: string | null; build: Promise<string> | null; ips: Map<string, number[]>; booted: boolean };
declare global { var __hometownTowns: Runtime | undefined; } // eslint-disable-line no-var
const rt = (): Runtime => {
  const r = (globalThis.__hometownTowns ??= { cfg: townsConfig(), queue: [], running: null, build: null, ips: new Map(), booted: false });
  if (!r.booted) { r.booted = true; markInterrupted(r.cfg); }
  return r;
};
const readJson = <T,>(f: string): T | null => { try { return JSON.parse(readFileSync(f, 'utf8')) as T; } catch { return null; } };
const writeJson = (f: string, v: unknown) => { mkdirSync(path.dirname(f), { recursive: true }); const t = `${f}.${process.pid}.tmp`; writeFileSync(t, JSON.stringify(v, null, 1) + '\n'); renameSync(t, f); };
const jobFile = (cfg: TownsConfig, id: string) => path.join(cfg.jobs, `${id}.json`);
const readJob = (cfg: TownsConfig, id: string) => readJson<Job>(jobFile(cfg, id));
const saveJob = (cfg: TownsConfig, j: Job) => writeJson(jobFile(cfg, j.placeId), j);
const ACTIVE: TownState[] = ['queued', 'reading', 'fetching', 'compiling', 'assembling'];

/** A job file left running by a process that is gone (a deploy, a crash): interrupted (deploy/boot.mjs does the same). */
export function markInterrupted(cfg: TownsConfig = townsConfig()) {
  if (!existsSync(cfg.jobs)) return 0;
  let n = 0;
  for (const f of readdirSync(cfg.jobs)) {
    if (!f.endsWith('.json')) continue;
    const j = readJson<Job>(path.join(cfg.jobs, f));
    if (j && ACTIVE.includes(j.state)) { j.state = 'interrupted'; j.endedAt = Date.now(); saveJob(cfg, j); n++; }
  }
  return n;
}

// ---------------------------------------------------------------------------------------------- the compiler's build
/** The child's environment: an allowlist, never the server's own (its keys and tokens). */
function childEnv(): Record<string, string> {
  // (HOMETOWN_OSM_ROADS and HOMETOWN_DEM_SNAPSHOT are read by compile.py and go into the buildId: the same in every child)
  const keep = ['PATH', 'HOME', 'LANG', 'LC_ALL', 'TMPDIR', 'DUCKDB_EXTENSION_DIRECTORY', 'HOMETOWN_IMAGE_DIGEST', 'HOMETOWN_OSM_ROADS', 'HOMETOWN_DEM_SNAPSHOT'];
  const env: Record<string, string> = { PYTHONUNBUFFERED: '1', PYTHONDONTWRITEBYTECODE: '1' };
  for (const k of keep) { const v = process.env[k]; if (v) env[k] = v; }
  return env;
}
type Run = { code: number | null; out: string; err: string; killed?: 'timeout' | 'stalled' };
/** One compiler run: stopped (SIGKILL) at `timeoutMs`, or after `stallMs` with nothing written (0: no stall limit). */
function run(cfg: TownsConfig, script: string, args: string[], onErrLine?: (l: string) => void, timeoutMs = cfg.jobMs, stallMs = 0): Promise<Run> {
  return new Promise((resolve) => {
    const nice = process.platform !== 'win32';
    const cmd = nice ? 'nice' : cfg.python, argv = [...(nice ? ['-n', '10', cfg.python] : []), path.join(cfg.compiler, script), ...args];
    const p = spawn(cmd, argv, { cwd: cfg.compiler, env: childEnv() as NodeJS.ProcessEnv, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '', buf = '', killed: Run['killed'];
    const kill = (why: 'timeout' | 'stalled') => { if (killed) return; killed = why; err += `\n[${why}]`; p.kill('SIGKILL'); };
    const t = setTimeout(() => kill('timeout'), Math.max(1000, timeoutMs));
    let stall: NodeJS.Timeout | null = null;
    const alive = () => { if (!stallMs) return; if (stall) clearTimeout(stall); stall = setTimeout(() => kill('stalled'), stallMs); };
    alive();
    const done = () => { clearTimeout(t); if (stall) clearTimeout(stall); };
    p.stdout.on('data', (d) => { alive(); out += d; if (out.length > 2e6) out = out.slice(-1e6); });
    p.stderr.on('data', (d) => {
      alive(); buf += d; err += d; if (err.length > 2e5) err = err.slice(-1e5);
      let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); onErrLine?.(l); }
    });
    p.on('error', (e) => { done(); resolve({ code: -1, out, err: err + String(e), killed }); });
    p.on('close', (code) => { done(); resolve({ code, out, err, killed }); });
  });
}

/** The compiler's current build id (compile.py --print-build: compiler version, libraries, sources, grid), once.
 *  With the jobs' own --data: the id includes the OSM lane table under it, so without it the two disagree and every
 *  job fails "the compiler is at X, the job at Y". */
export const printBuildArgs = (cfg: TownsConfig) => ['--print-build', '--store', cfg.store, '--data', cfg.sources];
export function currentBuild(): Promise<string> {
  const r = rt();
  return (r.build ??= run(r.cfg, 'compile.py', printBuildArgs(r.cfg), undefined, 60_000).then((x) => {
    const id = x.code === 0 ? (JSON.parse(x.out) as { buildId: string }).buildId : null;
    if (!id) { r.build = null; throw new Error(`the compiler's build id could not be read: ${x.err.slice(-300)}`); }
    return id;
  }));
}

// ------------------------------------------------------------------------------------------------------- the bundle
const bundleDirOf = (cfg: TownsConfig, buildId: string, placeId: string, tiles: string) => path.join(cfg.bundles, buildId, placeId, tiles);
const readyFile = (cfg: TownsConfig, buildId: string, placeId: string) => path.join(cfg.ready, buildId, `${placeId}.json`);
const SAFE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const FAR_FILE = /^data\/far\/[a-z]-[0-9]{1,5}-[0-9]{1,5}\.bin\.gz$/;

/** The lock of the town as built at this build, or null. */
export function readyLockAt(buildId: string, placeId: string): ServiceLock | null {
  const cfg = rt().cfg;
  if (!TOWN_ID.test(placeId) || !SAFE.test(buildId)) return null;
  const l = readJson<ServiceLock>(readyFile(cfg, buildId, placeId));
  return l && existsSync(path.join(bundleDirOf(cfg, l.buildId, l.place, l.tiles), 'lock.json')) ? l : null;
}
export async function readyLock(placeId: string): Promise<ServiceLock | null> { return readyLockAt(await currentBuild(), placeId); }

/**
 * The CityPackage a lock names, from its bundle; null when no such bundle is stored or it is not that lock's. Read and
 * checked once per bundle file (its size and time; a bundle is written once, by rename), not on every ready POST and
 * status poll: a big town's citypackage.json is megabytes of places.
 */
const PKG_CACHE = new Map<string, { stamp: string; pkg: CityPackage | null }>();
export function cityPackageByLock(lock: HometownLock): CityPackage | null {
  const cfg = rt().cfg;
  if (!lock || !TOWN_ID.test(lock.place) || !SAFE.test(lock.compiler) || !/^[0-9a-f]{64}$/.test(lock.tiles)) return null;
  const f = path.join(bundleDirOf(cfg, lock.compiler, lock.place, lock.tiles), 'citypackage.json');
  let stamp: string;
  // (not a bundle of this builder: the production builder's store, a bundle or a frame (lock v3), lib/hometown-build)
  try { const st = statSync(f); stamp = `${st.size}:${st.mtimeMs}:${st.ino}`; } catch { PKG_CACHE.delete(f); try { return cityPackageFromStore(hometownStore(), lock); } catch { return null; } }
  let hit = PKG_CACHE.get(f);
  if (!hit || hit.stamp !== stamp) {
    const pkg = readJson<CityPackage>(f);
    hit = { stamp, pkg: pkg && !packageProblems(pkg).length ? pkg : null };
    PKG_CACHE.delete(f); PKG_CACHE.set(f, hit);
    if (PKG_CACHE.size > 64) PKG_CACHE.delete(PKG_CACHE.keys().next().value!);
  }
  const pkg = hit.pkg;
  if (!pkg) return null;
  return JSON.stringify(cityLock(pkg)) === JSON.stringify({ ...cityLock(pkg), ...lock }) ? pkg : null;
}

/** A stored bundle file: /towns/{place}/{buildId}/{tiles}/{file}. Null for anything else. */
export function bundleFile(parts: string[]): { path: string; type: string } | null {
  const [place, build, tiles, ...rest] = parts;
  const file = rest.join('/');
  if (!place || !TOWN_ID.test(place) || !build || !SAFE.test(build) || !tiles || !/^[0-9a-f]{64}$/.test(tiles)) return null;
  if (!/^(geodata\.json|citypackage\.json|lock\.json|data\/(terrain|buildings|groundmask)\.bin\.gz)$/.test(file) && !FAR_FILE.test(file)) return null;
  const f = path.join(bundleDirOf(rt().cfg, build, place, tiles), file);
  return existsSync(f) ? { path: f, type: file.endsWith('.json') ? 'application/json' : 'application/octet-stream' } : null;
}

/** How many of a town's tiles (the descriptor's hg1 ids, "hg1-conus/0/c/r") the store holds at this build already. */
export function storedTiles(cfg: Pick<TownsConfig, 'store'>, buildId: string, tiles: string[]): number {
  if (!SAFE.test(buildId)) return 0;
  let n = 0;
  for (const t of tiles) if (/^hg1-[a-z]+\/0\/-?[0-9]{1,6}\/-?[0-9]{1,6}$/.test(t) && existsSync(path.join(cfg.store, 'tiles', buildId, ...t.split('/')))) n++;
  return n;
}

const summaryOf = (pkg: CityPackage): TownSummary => ({ name: pkg.name, state: pkg.state, places: pkg.places.length, streets: pkg.roadsSummary.streets });

// --------------------------------------------------------------------------------------------------------- the jobs
function etaS(cfg: TownsConfig, ahead: number, j?: Job | null): number | null {
  const past = (readJson<number[]>(path.join(cfg.root, 'build-secs.json')) || []).slice(-20).sort((a, b) => a - b);
  const med = past.length ? past[past.length >> 1] : 60;
  // (the running job: from its own pace once a few tiles are done, else the median less the time it has run)
  const ran = j && j.startedAt ? (Date.now() - j.startedAt) / 1000 : 0;
  const runningLeft = !j || !j.startedAt ? med : j.total && j.done >= 8 ? Math.max(5, (ran * (j.total - j.done)) / j.done + 5) : Math.max(5, med - ran);
  return Math.round(runningLeft + ahead * med);
}
function answerOf(cfg: TownsConfig, j: Job): TownAnswer {
  if (j.state === 'error') {
    const slow = j.reason === 'timeout' || j.reason === 'stalled';
    return { status: 409, body: { state: 'error', placeId: j.placeId, error: slow ? TOWN_WORDS.slow : TOWN_WORDS.failed, ...(j.failedAt ? { stage: TOWN_WORDS.stage[j.failedAt] } : {}), ...(j.reason ? { reason: j.reason } : {}) } };
  }
  if (j.state === 'interrupted') return { status: 409, body: { state: 'interrupted', placeId: j.placeId, error: TOWN_WORDS.interrupted } };
  const r = rt(), pos = r.queue.indexOf(j.placeId);
  return { status: 202, body: { state: j.state, placeId: j.placeId, stage: TOWN_WORDS.stage[j.state], done: j.done, total: j.total, position: pos < 0 ? 0 : pos + 1, etaS: etaS(cfg, pos < 0 ? 0 : pos + (r.running ? 1 : 0), r.running === j.placeId ? j : null) } };
}
function readyAnswer(lock: ServiceLock): TownAnswer | null {
  const s = storyLock(lock), pkg = s ? cityPackageByLock(s) : null;
  return s && pkg ? { status: 200, body: { state: 'ready', placeId: lock.place, lock: s, town: summaryOf(pkg) } } : null;
}

/** The town's state, never starting anything. */
export async function townStatus(placeId: string): Promise<TownAnswer> {
  if (!TOWN_ID.test(placeId)) return { status: 400, body: { error: TOWN_WORDS.unknown } };
  const cfg = rt().cfg, buildId = await currentBuild();
  const l = readyLockAt(buildId, placeId), ready = l && readyAnswer(l);
  if (ready) return ready;
  const j = readJob(cfg, placeId);
  if (!j || j.buildId !== buildId) return { status: 404, body: { placeId, error: 'This town has not been asked for.' } };
  return answerOf(cfg, j);
}

/** A built town at once, its build joined or started, or a refusal. */
export async function requestTown(placeId: string, ip: string, now = Date.now()): Promise<TownAnswer> {
  if (typeof placeId !== 'string' || !TOWN_ID.test(placeId)) return { status: 400, body: { error: TOWN_WORDS.unknown } };
  const r = rt(), cfg = r.cfg;
  const place = placeById(placeId);
  if (!place) return { status: 404, body: { placeId, error: TOWN_WORDS.unknown } };
  const buildId = await currentBuild();
  const l = readyLockAt(buildId, placeId), ready = l && readyAnswer(l);
  if (ready) return ready;
  const j = readJob(cfg, placeId);
  if (j && j.buildId === buildId && ACTIVE.includes(j.state) && (r.running === placeId || r.queue.includes(placeId))) return answerOf(cfg, j);
  // a new build: the limits (a town that is built is never limited, above)
  if (r.queue.length + (r.running ? 1 : 0) >= cfg.queueMax) return { status: 503, body: { placeId, error: TOWN_WORDS.busy } };
  const day = readJson<{ day: string; n: number }>(path.join(cfg.root, 'cold-today.json'));
  const today = new Date(now).toISOString().slice(0, 10);
  if (day && day.day === today && day.n >= cfg.dailyCold) return { status: 503, body: { placeId, error: TOWN_WORDS.busy } };
  const hits = (r.ips.get(ip) || []).filter((t) => now - t < 3600_000);
  if (hits.length >= cfg.perIpHour) return { status: 429, body: { placeId, error: TOWN_WORDS.busy } };
  hits.push(now); r.ips.set(ip, hits);
  if (r.ips.size > 5000) for (const [k, v] of r.ips) if (!v.some((t) => now - t < 3600_000)) r.ips.delete(k);
  writeJson(path.join(cfg.root, 'cold-today.json'), { day: today, n: (day && day.day === today ? day.n : 0) + 1 });
  const job: Job = { placeId, buildId, state: 'queued', done: 0, total: 0, queuedAt: now };
  saveJob(cfg, job);
  r.queue.push(placeId);
  setImmediate(pump);
  return answerOf(cfg, job);
}

function pump() {
  const r = rt();
  if (r.running || !r.queue.length) return;
  const id = r.queue.shift()!;
  r.running = id;
  buildTown(id).catch((e) => console.error('hometown: the town build failed outright', id, e)).finally(() => { r.running = null; setImmediate(pump); });
}

/** Build one town into its bundle (the queue's one job at a time). */
async function buildTown(placeId: string) {
  const cfg = rt().cfg, job = readJob(cfg, placeId)!, place = placeById(placeId)!;
  const set = (patch: Partial<Job>) => { Object.assign(job, patch); saveJob(cfg, job); };
  // (a failure names its stage and why: a run killed at the job's limit or for writing nothing is said so in the log
  // and the job, not left as a bare "exit null")
  const fail = (why: string, r?: Run) => {
    const reason: Job['reason'] = r?.killed ?? 'error', at = job.state, secs = Math.round((Date.now() - (job.startedAt ?? Date.now())) / 1000);
    const head = reason === 'timeout' ? `timed out ${TOWN_WORDS.stage[at].toLowerCase()} (${at}) after ${secs} s, the job's limit (HOMETOWN_JOB_SECS ${cfg.jobMs / 1000})`
      : reason === 'stalled' ? `stopped ${TOWN_WORDS.stage[at].toLowerCase()} (${at}) after ${secs} s: nothing written for ${cfg.stallMs / 1000} s (HOMETOWN_STALL_SECS)`
        : `failed ${TOWN_WORDS.stage[at].toLowerCase()} (${at}) after ${secs} s`;
    const msg = `${head}, ${job.done} of ${job.total} tiles: ${why}`;
    console.error(`hometown: ${placeId}: ${msg.slice(0, 300)}${msg.length > 300 ? ` ... ${msg.slice(-1200)}` : ''}`);
    set({ state: 'error', failedAt: at, reason, error: `${head}: ${why}`.slice(-600), endedAt: Date.now() });
  };
  set({ state: 'reading', startedAt: Date.now() });
  // the job's limit is the whole build's (each run gets what is left of it); a compile that writes nothing for
  // HOMETOWN_STALL_SECS is stuck (it writes a line per tile and per far tile)
  const deadline = job.startedAt! + cfg.jobMs, left = () => deadline - Date.now();
  const work = path.join(cfg.scratch, `${placeId}-${process.pid}-${Date.now()}`);
  mkdirSync(work, { recursive: true });
  try {
    // the compiler's input: this place under its canonical id (its own places file, so the compiler's places.json is untouched)
    const placesFile = path.join(work, 'places.json');
    // (searchBbox: the search's whole square; when the cap cuts it, the compiler centres the capped box on the place's
    // downtown, tools/hometown/assemble.py downtown_box, reading the map round it: fetched first like the compile's)
    writeFileSync(placesFile, JSON.stringify({ format: 'hometown-places', places: { [placeId]: {
      name: `${place.name}, ${place.state}`, geoid: place.geoid, anchor: [place.lon, place.lat], bbox: canonicalBox(place), searchBbox: place.bbox,
      anchorSource: 'Census Gazetteer INTPTLAT/INTPTLONG', bboxSource: BOX_SOURCE } } }));
    const common = ['--places', placesFile, '--data', cfg.sources, '--store', cfg.store];
    let d1: Run = await run(cfg, 'compile.py', ['--descriptor', placeId, '--stage', '1', ...common], undefined, Math.min(STAGE1_MS, left()));
    for (let tries = 0; tries < 2 && d1.code === 3; tries++) {
      const m = /--regions ([a-z]+:[0-9,;]+)/.exec(d1.err);
      if (!m) break;
      set({ state: 'fetching', fetched: true });
      const f = await run(cfg, 'fetch.py', ['--regions', m[1], '--data', cfg.sources], undefined, left());
      if (f.code !== 0) return fail(`fetch ${m[1]}: exit ${f.code}: ${f.err}`, f);
      d1 = await run(cfg, 'compile.py', ['--descriptor', placeId, '--stage', '1', ...common], undefined, Math.min(STAGE1_MS, left()));
    }
    if (d1.code !== 0) return fail(`descriptor: ${d1.err}`, d1);
    const desc = JSON.parse(d1.out) as { tiles: string[]; buildId: string };
    if (desc.buildId !== job.buildId) return fail(`the compiler is at ${desc.buildId}, the job at ${job.buildId}`);
    set({ total: desc.tiles.length, done: 0 });
    const out = path.join(work, 'out');
    let compiled: Run | null = null;
    for (let tries = 0; tries < 3; tries++) {
      // (the tiles already in the store count as done: the compiler reads them back without a line, so a warm town's
      // counter sat at 0 of N until it was ready)
      const stored = storedTiles(cfg, job.buildId, desc.tiles);
      set({ state: 'compiling', done: stored, stored });
      let done = stored;
      compiled = await run(cfg, 'compile.py', ['--id', placeId, ...common, '--out', out], (l) => {
        if (l.startsWith('{"blocks"')) { done++; if (done % 4 === 0 || done === job.total) set({ done: Math.min(done, job.total) }); }
      }, left(), cfg.stallMs);
      if (compiled.code === 0) break;
      if (compiled.killed) return fail(`compile: ${compiled.err.slice(-400)}`, compiled);
      // (a map region the compiler has not read yet: fetch it, one read per layer for all of them, then compile again)
      const m = /--regions ([a-z]+:[0-9,;]+)/.exec(compiled.err);
      if (compiled.code !== 3 || !m) return fail(`compile: exit ${compiled.code}: ${compiled.err}`);
      set({ state: 'fetching', fetched: true });
      const f = await run(cfg, 'fetch.py', ['--regions', m[1], '--data', cfg.sources], undefined, left());
      if (f.code !== 0) return fail(`fetch ${m[1]}: exit ${f.code}: ${f.err}`, f);
    }
    if (!compiled || compiled.code !== 0) return fail(`compile: still missing map regions after 3 tries: ${compiled?.err ?? ''}`);
    set({ state: 'assembling', done: job.total });
    const pk = path.join(out, placeId);
    const manifest = JSON.parse(readFileSync(path.join(pk, 'manifest.json'), 'utf8')) as { files: Record<string, { sha256: string }> };
    for (const [f, e] of Object.entries(manifest.files)) {
      const h = createHash('sha256').update(readFileSync(path.join(pk, f))).digest('hex');
      if (h !== e.sha256) return fail(`package file ${f}: sha256 ${h} is not the manifest's`);
    }
    const g = readGeodataJs(path.join(pk, 'geodata.js'));
    const lock = g.PKG.lock as ServiceLock;
    if (!storyLock(lock) || lock.place !== placeId || lock.buildId !== job.buildId) return fail(`the package's lock is not this town's: ${JSON.stringify(lock)}`);
    const pkg = cityPackageOf(g, { placeId, name: place.name, stateName: place.stateName });
    const bad = packageProblems(pkg);
    if (bad.length) return fail(`city package: ${bad.join('; ')}`);
    if (JSON.stringify(serviceLock(cityLock(pkg))) !== JSON.stringify(serviceLock(storyLock(lock)!))) return fail('the city package\'s lock is not the bundle\'s');
    const dir = bundleDirOf(cfg, lock.buildId, placeId, lock.tiles);
    if (!existsSync(path.join(dir, 'lock.json'))) {
      const tmp = `${dir}.${process.pid}.tmp`;
      rmSync(tmp, { recursive: true, force: true });
      mkdirSync(path.join(tmp, 'data'), { recursive: true });
      writeFileSync(path.join(tmp, 'geodata.json'), JSON.stringify(geodataJson(g)));
      writeFileSync(path.join(tmp, 'citypackage.json'), JSON.stringify(pkg));
      for (const f of ['terrain', 'buildings', 'groundmask']) cpSync(path.join(pk, 'data', `${f}.bin.gz`), path.join(tmp, 'data', `${f}.bin.gz`));
      // (the far field, PKG.far: the land past the core to the horizon, Mog City's cities/pkg/js/pkg-far.js; checked above)
      const far = Object.keys(manifest.files).filter((f) => FAR_FILE.test(f));
      if (far.length) mkdirSync(path.join(tmp, 'data', 'far'), { recursive: true });
      for (const f of far) cpSync(path.join(pk, f), path.join(tmp, f));
      writeFileSync(path.join(tmp, 'lock.json'), JSON.stringify(lock));
      mkdirSync(path.dirname(dir), { recursive: true });
      rmSync(dir, { recursive: true, force: true });
      renameSync(tmp, dir);
    }
    writeJson(readyFile(cfg, lock.buildId, placeId), lock);
    const secs = Math.round((Date.now() - job.startedAt!) / 1000);
    const past = readJson<number[]>(path.join(cfg.root, 'build-secs.json')) || [];
    writeJson(path.join(cfg.root, 'build-secs.json'), [...past, secs].slice(-50));
    set({ state: 'ready', endedAt: Date.now() });
    console.log(`hometown: ${placeId} built in ${secs}s (${job.total} tiles${job.fetched ? ', map regions fetched' : ''}): ${lock.tiles.slice(0, 12)}`);
  } catch (e) {
    fail(String((e as Error)?.stack || e));
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
