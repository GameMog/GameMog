/**
 * The production town builder on the web service (SPEC 2, 3.6; tasks G5, G6): its one queue, the worker protocol and
 * the owner's tools, as Web Request -> Response with no Next import (scripts/hometown-build-check.ts runs them as is).
 *
 * Worker (Authorization: Bearer HOMETOWN_WORKER_TOKEN; unset: 404). Over Render's private network only in practice;
 * not under middleware.ts (its matcher never names /api/hometown):
 *   POST claim       { worker, build, freeSlots, totalSlots, cached[], version, memFreeMB } -> 200 a job | 204 (20 s long-poll)
 *   POST heartbeat   { key, leaseId } -> 200 | 410 (the lease is not yours: kill the child, drop the result)
 *   GET  objects/{k} any family (the worker's inputs: src and dem included)
 *   PUT  objects/{k} the families a worker makes (keys.ts WORKER_PUT), through the same checks as the owner's upload
 *   POST complete    { key, leaseId, outputs[], ms, peakMB, refused[] } -> 200 | 409 (outputs not stored) | 410
 *   POST fail        { key, leaseId, code, missingRegions?, reason, final? } -> 200 | 410
 * The token never reaches a compile child (worker.py passes only an allowlisted environment), can never GC, read the
 * owner's status or use HOMETOWN_ADMIN_TOKEN routes.
 *
 * Owner (HOMETOWN_ADMIN_TOKEN bearer, or the owner's /admin session): /api/hometown/admin/{builder, prewarm, loadtest,
 * ttfd}. HOMETOWN_BUILDER=off: the queue is inert and every one of these is 404.
 */
import path from 'node:path';
import { hometownConfig, hometownStore } from '../hometown-tiles/config.ts';
import { bearerMatches, putObject } from '../hometown-tiles/http.ts';
import { BUILD_ID, WORKER_PUT, contentType, parseKeyString, buildKey, ctxKey, tileKey, farKey, frameKey, type Domain } from '../hometown-tiles/keys.ts';
import { StoreFull, type TileStore } from '../hometown-tiles/store.ts';
import type { HometownConfig } from '../hometown-tiles/config.ts';
import { BuildQueue, ANY_BUILD, HEARTBEAT_MS, LEASE_MS, maskBits, type Job } from './queue.ts';
import { afterJobDone, currentBuild, onBundleStored, prewarm, promisedOutputs, townsStatus, type BuilderDeps, type TownMeta } from './towns.ts';
import { prewarmList } from '../hometown-tiles/prewarm-list.ts';

const G = globalThis as unknown as { __hometownBuilder?: { file: string; q: BuildQueue; reaper: NodeJS.Timeout | null } };
/** The server's one queue (data/hometown/queue.db), and a 10 s reaper. */
export function builderDeps(cfg: HometownConfig = hometownConfig()): BuilderDeps {
  const file = path.join(cfg.root, 'queue.db');
  if (G.__hometownBuilder?.file !== file) {
    const q = new BuildQueue({ file });
    const reaper = setInterval(() => { try { q.reap(); } catch { /* the next tick */ } }, 10_000);
    reaper.unref?.();
    G.__hometownBuilder = { file, q, reaper };
  }
  return { cfg, store: hometownStore(cfg), queue: G.__hometownBuilder.q };
}

/** HOMETOWN_CANARY_RATE (default 0.01): the share of tile jobs recompiled elsewhere and compared. */
const canaryRate = () => { const v = Number(process.env.HOMETOWN_CANARY_RATE); return Number.isFinite(v) && v >= 0 && v <= 1 && process.env.HOMETOWN_CANARY_RATE ? v : 0.01; };
const json = (status: number, body: unknown, extra: Record<string, string> = {}) => new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...extra } });
const notFound = () => new Response('Not found', { status: 404, headers: { 'cache-control': 'no-store' } });
const readBody = async (req: Request): Promise<Record<string, unknown>> => { try { const j = await req.json(); return j && typeof j === 'object' ? j : {}; } catch { return {}; } };
const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.slice(0, max) : '');

/** The Overture release a build reads (its build record), for staged region keys. */
export function releaseOf(store: TileStore, build: string): string | null {
  const g = store.get(buildKey(build));
  if (!g) return null;
  try { const r = JSON.parse(g.body.toString('utf8')); return typeof r.overture === 'string' ? r.overture : null; } catch { return null; }
}

/** What a worker should download before running a job (the web knows what is stored; the worker re-checks). */
export function inputsOf(d: BuilderDeps, j: Job): string[] {
  const s = d.store, out: string[] = [];
  const add = (k: string) => { if (s.has(k)) out.push(k); };
  if (j.build !== ANY_BUILD) add(buildKey(j.build));
  const domOf = (block: string) => block.split('/')[0].slice(4) as Domain;
  if (j.kind === 'tiles') {
    const [, , C, R] = String(j.args.block).split('/').map(Number), dom = domOf(String(j.args.block));
    add(ctxKey(j.build, dom, C >> 2, R >> 2));
    // (tiles of the block already stored: the compile is ifAbsent, so the worker never recompiles them)
    for (const i of maskBits(0xffff)) add(tileKey(j.build, dom, C * 4 + (i & 3), R * 4 + (i >> 2)));
  } else if (j.kind === 'frame' || j.kind === 'bundle') {
    const place = String(j.args.placeId);
    for (const w of d.queue.jobsOf(place)) {
      if (w.kind === 'ctx' && w.build === j.build) { const [g, , C, R] = String(w.args.ctx).split('/'); add(ctxKey(j.build, g.slice(4) as Domain, Number(C), Number(R))); }
    }
    if (j.kind === 'bundle') {
      add(frameKey(j.build, place));
      const r = d.queue.db.prepare('SELECT meta FROM towns WHERE place = ? AND build = ?').get(place, j.build) as { meta: string } | undefined;
      const m: TownMeta = r ? JSON.parse(r.meta) : {};
      const win = j.args.window as [number, number, number, number] | undefined;
      for (const t of m.tiles ?? []) {
        const [g, , c, rr] = t.split('/'), cc = Number(c), r2 = Number(rr);
        if (win && (cc < win[0] || cc > win[2] || r2 < win[1] || r2 > win[3])) continue;
        add(tileKey(j.build, g.slice(4) as Domain, cc, r2));
      }
      // far tiles stored for this build round the town (the assembler reads them instead of compiling them again)
      const f = d.store.get(frameKey(j.build, place));
      if (f) { try { for (const k of (JSON.parse(f.body.toString('utf8')).far ?? []) as string[]) { const [g, L, C, R] = k.split('/'); add(farKey(j.build, g.slice(4) as Domain, Number(L), Number(C), Number(R))); } } catch { /* a bad frame is refused on PUT */ } }
    }
  } else if (j.kind === 'canary') {
    // the stored tile to compare with, and its ctx (the canary recompiles from sources with --no-store: worker.py)
    const [g, , c, r] = String(j.args.tile).split('/'), dom = g.slice(4) as Domain;
    add(tileKey(j.build, dom, Number(c), Number(r)));
  }
  return out;
}

/** "conus:530,453;530,454" -> the regions job's key and args (sorted, at most 4 a job: more become several deps). */
export function regionsJobOf(release: string, spec: string): { key: string; args: Record<string, unknown> } | null {
  const m = /^([a-z]+):([0-9,;]+)$/.exec(spec);
  if (!m || !release) return null;
  const blocks = [...new Set(m[2].split(';').filter(Boolean))].map((b) => b.split(',').map(Number)).filter((b) => b.length === 2 && b.every(Number.isInteger))
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]).slice(0, 4);
  if (!blocks.length) return null;
  const list = blocks.map(([C, R]) => `${C},${R}`).join(';');
  return { key: `regions:${release}:hg1-${m[1]}:${list}`, args: { release, spec: `${m[1]}:${list}`, regions: blocks.map(([C, R]) => `${m[1]}/${C}/${R}`) } };
}

// ---------------------------------------------------------------------------------------------- worker protocol
export async function workerResponse(req: Request, parts: string[], d: BuilderDeps, o: { pollMs?: number } = {}): Promise<Response> {
  const { cfg, store, queue } = d;
  if (cfg.builder === 'off' || !cfg.workerToken) return notFound();
  if (!bearerMatches(req, cfg.workerToken)) return json(401, { error: 'unauthorized' });
  try {
    if (req.method === 'POST' && parts[0] === 'claim') {
      const b = await readBody(req);
      const spec = { worker: str(b.worker, 80), build: str(b.build, 40), freeSlots: Math.max(0, Math.floor(Number(b.freeSlots) || 0)), totalSlots: Math.max(1, Math.floor(Number(b.totalSlots) || 1)),
        cached: Array.isArray(b.cached) ? (b.cached as unknown[]).map((x) => str(x, 80)).slice(0, 500) : [], version: str(b.version, 80), memMb: Math.floor(Number(b.memFreeMB) || 0) };
      if (!spec.worker || !spec.build || !spec.freeSlots) return json(400, { error: 'worker, build and freeSlots' });
      const until = Date.now() + Math.min(20_000, o.pollMs ?? 20_000);
      for (;;) {
        const j = queue.claim(spec);
        if (j) {
          return json(200, { key: j.key, kind: j.kind, build: j.build === ANY_BUILD ? spec.build : j.build, leaseId: j.leaseId, leaseMs: LEASE_MS, heartbeatMs: HEARTBEAT_MS, args: j.args, prio: j.prio,
            release: releaseOf(store, spec.build), inputs: inputsOf(d, j), attempts: j.attempts, current: currentBuild(d) });
        }
        const left = until - Date.now();
        if (left <= 0) return json(204, null);
        await new Promise<void>((resolve) => { const off = queue.onChange(() => { off(); clearTimeout(t); resolve(); }); const t = setTimeout(() => { off(); resolve(); }, Math.min(left, 2_000)); });
      }
    }
    if (req.method === 'POST' && parts[0] === 'heartbeat') {
      const b = await readBody(req);
      return queue.heartbeat(str(b.key, 300), str(b.leaseId, 40), str(b.worker, 80) || undefined) ? json(200, { ok: true, leaseMs: LEASE_MS }) : json(410, { error: 'the lease is not yours any more' });
    }
    if (parts[0] === 'objects' && parts.length > 1) {
      const key = parts.slice(1).join('/');
      if (req.method === 'GET' || req.method === 'HEAD') {
        const k = parseKeyString(key);
        if (!k) return json(400, { error: 'not a hometown key' });
        const got = store.get(key);
        if (!got) return json(404, { error: 'not stored' });
        return new Response(req.method === 'HEAD' ? null : new Uint8Array(got.body), { status: 200, headers: { 'content-type': contentType(k.family, key), 'content-length': String(got.bytes), etag: got.etag, 'cache-control': 'no-store' } });
      }
      if (req.method === 'PUT') {
        const r = await putObject(req, store, key, WORKER_PUT, (k) => onBundleStored(d, k));
        return json(r.status, r.body);
      }
    }
    if (req.method === 'POST' && parts[0] === 'complete') {
      const b = await readBody(req);
      const outputs = Array.isArray(b.outputs) ? (b.outputs as unknown[]).map((x) => str(x, 300)).filter(Boolean).slice(0, 4000) : [];
      const refused = Array.isArray(b.refused) ? (b.refused as unknown[]).map((x) => str(x, 60)).filter((t) => /^hg1-[a-z]+\/0\/[0-9]+\/[0-9]+$/.test(t)) : [];
      const r = queue.complete(str(b.key, 300), str(b.leaseId, 40), { ms: Number(b.ms), peakMb: Number(b.peakMB) || undefined }, (j) => promisedOutputs(store, j, outputs, refused));
      if (!r.ok) return r.why === 'lost' ? json(410, { error: 'the lease is not yours any more' }) : json(409, { error: 'outputs not stored', missing: r.missing?.slice(0, 20) });
      afterJobDone(d, r.job, outputs, refused);
      if (r.job.kind === 'canary') queue.log('canary', { tile: r.job.args.tile, build: r.job.build, match: b.canaryMatch === true, worker: r.job.leaseWorker, of: r.job.args.notWorker });
      // the determinism canary (SPEC 6.2): 1% of tile jobs recompile one of their tiles on ANOTHER worker, bytes compared
      if (r.job.kind === 'tiles' && Math.random() < canaryRate()) {
        const bits = maskBits(Number(r.job.args.mask));
        const i = bits[Math.floor(Math.random() * bits.length)];
        const [g, , C, R] = String(r.job.args.block).split('/');
        const tile = `${g}/0/${Number(C) * 4 + (i & 3)}/${Number(R) * 4 + (i >> 2)}`;
        queue.enqueue({ key: `canary:${r.job.build}:${tile}`, kind: 'canary', build: r.job.build, prio: 5, args: { tile, notWorker: r.job.leaseWorker } });
      }
      queue.log('done', { key: r.job.key, ms: Number(b.ms) || null, peakMB: Number(b.peakMB) || null, worker: r.job.leaseWorker });
      return json(200, { ok: true });
    }
    if (req.method === 'POST' && parts[0] === 'fail') {
      const b = await readBody(req);
      const key = str(b.key, 300), code = Number(b.code);
      const j = queue.get(key);
      const rel = j ? (str(j.args.release as string, 20) || releaseOf(store, j.build === ANY_BUILD ? (currentBuild(d) ?? '') : j.build) || '') : '';
      const regions = code === 3 && typeof b.missingRegions === 'string' ? regionsJobOf(rel, b.missingRegions) : null;
      if (code === 3 && b.missingRegions && !regions) return json(400, { error: 'missingRegions is dom:C,R;C,R and the build record names its Overture release (upload builds/<id>.json first)' });
      const r = queue.fail(key, str(b.leaseId, 40), { code, reason: str(b.reason, 600), regions, final: b.final === true });
      if (!r.ok) return json(410, { error: 'the lease is not yours any more' });
      queue.log('fail', { key, code, reason: str(b.reason, 300), regions: r.regionsJob ?? null });
      return json(200, { ok: true, ...(r.regionsJob ? { regionsJob: r.regionsJob } : {}) });
    }
    return json(404, { error: 'not found' });
  } catch (e) {
    if (e instanceof StoreFull) return json(507, { error: e.message, why: e.why });
    throw e;
  }
}

// ---------------------------------------------------------------------------------------------- the owner's tools
export const BUILDER_ADMIN = new Set(['builder', 'prewarm', 'loadtest', 'ttfd']);
/** The owner's status of the builder (G13): workers, slots, the queue by priority, ETA error, canary, builds seen. */
export function builderStatus(d: BuilderDeps) {
  const q = d.queue, workers = q.liveWorkers();
  const seen = [...new Set(workers.map((w) => w.build).filter((b): b is string => !!b))];
  const ev = q.recentEvents(200);
  const canary = ev.filter((e) => e.kind === 'canary');
  const eta = ev.filter((e) => e.kind === 'eta');
  return {
    mode: d.cfg.builder, frame: d.cfg.frame, build: { configured: d.cfg.build, current: currentBuild(d), workersReport: seen, mismatch: !!d.cfg.build && seen.some((b) => b !== d.cfg.build) },
    workers, slots: q.liveSlots(), queue: q.depth(), costs: q.costs(), towns: townsStatus(d),
    canary: { runs: canary.length, mismatches: canary.filter((e) => e.match === false).length, last: canary.slice(0, 5) },
    etaError: eta.length ? { n: eta.length, meanPct: Math.round(eta.reduce((a, e) => a + Math.abs(Number(e.errPct ?? 0)), 0) / eta.length) } : null,
    recent: ev.slice(0, 30),
  };
}

export async function builderAdminResponse(req: Request, parts: string[], d: BuilderDeps, owner: boolean): Promise<Response> {
  if (d.cfg.builder === 'off') return notFound();
  if (!owner && !bearerMatches(req, d.cfg.adminToken)) return d.cfg.adminToken ? json(401, { error: 'unauthorized' }) : notFound();
  const [what] = parts;
  if (what === 'builder' && req.method === 'GET') return json(200, builderStatus(d));
  if (what === 'prewarm' && req.method === 'POST') {
    const b = await readBody(req);
    const n = Math.max(0, Math.min(5000, Math.floor(Number(b.n) || 0)));
    const ids = Array.isArray(b.ids) ? (b.ids as unknown[]).map((x) => str(x, 20)) : prewarmList(n).order;
    const at = typeof b.build === 'string' && BUILD_ID.test(b.build) ? b.build : null;
    return json(200, prewarm(d, ids, 'prewarm', at));
  }
  if (what === 'loadtest' && req.method === 'POST') {
    // (n real towns asked as owner-test, spread over spreadS: ranks 1,001 and down of the pre-warm list, never pre-warmed)
    const b = await readBody(req);
    const n = Math.max(1, Math.min(200, Math.floor(Number(b.n) || 30))), spread = Math.max(0, Math.min(3600, Number(b.spreadS) || 60));
    const ids = prewarmList(1000 + n).order.slice(-n);
    ids.forEach((id, i) => { const t = setTimeout(() => { try { prewarm(d, [id], 'owner-test'); } catch { /* logged by the queue */ } }, (spread * 1000 * i) / Math.max(1, n - 1)); t.unref?.(); });
    return json(202, { asked: ids.length, spreadS: spread, ids });
  }
  if (what === 'ttfd' && req.method === 'POST') {
    const b = await readBody(req);
    const marks = b.marks && typeof b.marks === 'object' ? Object.fromEntries(Object.entries(b.marks as Record<string, unknown>).filter(([k, v]) => /^[a-z-]{1,30}$/.test(k) && Number.isFinite(Number(v))).slice(0, 20).map(([k, v]) => [k, Number(v)])) : {};
    d.queue.log('ttfd', { place: str(b.place, 20), build: str(b.build, 40), variant: str(b.variant, 40), marks });
    return json(200, { ok: true });
  }
  return json(404, { error: 'not found' });
}

/** The per-key cache families a worker may hold, for its claim's affinity list (region keys "conus/C/R"). */
export const regionKeyOf = (dom: string, C: number, R: number) => `${dom}/${C}/${R}`;
export { tileKey };
