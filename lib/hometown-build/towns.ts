/**
 * The production town builder's towns (SPEC 4, 5.3; task G4): a pick becomes a graph of small jobs on the durable
 * queue (queue.ts), built by workers, never in the web process. It replaces lib/hometown/towns.ts's in-process builder
 * behind HOMETOWN_BUILDER (that one stays for local development behind HOMETOWN_TOWNS) and keeps its answer shapes,
 * TownAnswer and TOWN_WORDS, extended with { phase, district, etaDriveS, etaFullS }.
 *
 * The graph from the pick (stage 1 in TS, grid.ts: the tile range at once):
 *   P0  ctx blocks of the town (tiles depend on them: four parallel tiles never compute one ctx four times)
 *   P0  the tile blocks within 2 tiles of the anchor (the Census internal point); the frame (HOMETOWN_FRAME=on)
 *   P1  every other tile block, ringed by Chebyshev distance from the anchor
 *   P2  the full bundle (+ manifest) once every tile is stored; far windows (frame mode)
 *   P3  a lazy rebuild (a town ready only at an older build, asked again); P5 pre-warm and region staging
 * Missing map regions surface as a worker's exit 3 and become regions jobs (queue.ts fail). When the frame lands
 * (frame mode) the spawn district's blocks are raised to P0, the rest re-ringed from the spawn, and the district
 * bundle enqueued: the town is 'district' (the story may start: lock v3), then 'growing' (Drive now), then 'full'.
 * Without the frame (compiler 0.5.0): asked -> framing (building) -> full (lock v2), as today but on workers.
 *
 * Admission (5.3): a new town is refused when its wait to drive is over HOMETOWN_MAX_WAIT_S, with the minutes and the 3
 * nearest built towns; per address HOMETOWN_PER_IP_HOUR new towns, HOMETOWN_DAILY_COLD a day, HOMETOWN_QUEUE_MAX towns
 * waiting (defaults from the live slots). A town that is built is never limited.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { placeById } from '../places/search.ts';
import type { Place } from '../places/types.ts';
import { packageProblems, cityLock, type CityPackage } from '../../storykit/hometown/city-package.ts';
import type { HometownLock } from '../../storykit/pack/cities.ts';
import { playBox, boxHash, BOX_SOURCE, type Box } from '../hometown/box.ts';
import { TOWN_ID, storyLock, type ServiceLock } from '../hometown/ids.ts';
import { TOWN_WORDS } from '../hometown/words.ts';
import { cityPackageOf, type Geodata } from '../hometown/bundle.ts';
import { capacitySlots, type RunsConfig } from './dispatch.ts';
import { bundleKey, ctxKey, farKey, frameKey, manifestKey, parseKeyString, srcKey, tileKey, type Domain } from '../hometown-tiles/keys.ts';
import type { TileStore } from '../hometown-tiles/store.ts';
import type { HometownConfig } from '../hometown-tiles/config.ts';
import { stage1, anchorTile, type Stage1 } from './grid.ts';
import { ANY_BUILD, maskBits, type BuildQueue, type EnqueueSpec, type Job, type JobKind } from './queue.ts';
import { cityPackageOfFrame, frameProblems, normalizeFrame, type TownFrame } from './frame.ts';

export { TOWN_WORDS };
export type TownPhase = 'asked' | 'framing' | 'district' | 'growing' | 'full' | 'failed';
export type TownSource = 'player' | 'prewarm' | 'rebuild' | 'owner-test';
export type TownSummary = { name: string; state: string; places: number; streets: number };
export type Nearby = { placeId: string; name: string; km: number };
export type Progress = {
  state: string; placeId: string; stage: string; done: number; total: number; position: number; etaS: number | null;
  phase: TownPhase; district: boolean; etaDriveS: number | null; etaFullS: number | null;
  /** lock v3 once the frame is in: the story may be written now */
  lock?: HometownLock; town?: TownSummary; play?: { build: string; tilesId: string; variant: string };
};
export type TownAnswer =
  | { status: 200; body: { state: 'ready'; placeId: string; lock: HometownLock; town: TownSummary; phase: 'full'; play?: Progress['play'] } }
  | { status: 202; body: Progress }
  | { status: 400 | 404 | 409 | 429 | 503 | 507; body: { state?: string; placeId?: string; error: string; stage?: string; waitMin?: number; nearby?: Nearby[] } };

/** The Create card's words by phase (SPEC 4.6; no tool, model or vendor names: scripts/hometown-words-check). */
export const PHASE_WORDS: Record<TownPhase, string> = {
  asked: 'Waiting its turn', framing: 'Reading the map', district: 'Laying the streets near you',
  growing: 'Ready to drive: the rest of town keeps building', full: 'Your whole town is built', failed: 'Not built',
};
export const BUSY_WORDS = (min: number) => `Lots of towns are being built. Yours would take about ${min} minute${min === 1 ? '' : 's'}.`;

/** Planning costs (ms) until the queue's EWMAs have numbers (SPEC 3.2). */
/** (tiles: per tile unit, queue.ts jobUnits: a 16-tile block is 5 units, a 2 x 2 quad 2) */
export const DEFAULT_COST: Record<JobKind, number> = { regions: 40_000, ctx: 6_000, frame: 4_000, tiles: 2_000, far: 5_000, bundle: 10_000, manifest: 1_000, canary: 9_000 };
export const DISTRICT_RADIUS = 2;

export type BuilderDeps = { cfg: HometownConfig; store: TileStore; queue: BuildQueue; now?: () => number; build?: () => string | null; place?: (id: string) => Place | null;
  /** on-demand builders (dispatch.ts, HOMETOWN_RUNS=workflows): the estimate counts the runs it may start */
  runs?: RunsConfig | null };

// ------------------------------------------------------------------------------------------------ the job graph
type Gaz = { name: string; geoid: string; anchor: [number, number]; anchorSource: string; bbox: Box; bboxSource: string };
export const gazetteerOf = (p: Place): Gaz => ({ name: `${p.name}, ${p.state}`, geoid: p.geoid, anchor: [p.lon, p.lat], anchorSource: 'Census Gazetteer INTPTLAT/INTPTLONG', bbox: playBox(p), bboxSource: BOX_SOURCE });

type Block = { block: string; C: number; R: number; mask: number; ring: number; tiles: [number, number][] };
/** The town's tiles grouped into L2 blocks with their masks, ringed (Chebyshev, in tiles) from (ac, ar). */
export function blocksOf(s: Stage1, ac: number, ar: number): Block[] {
  const by = new Map<string, Block>();
  for (const id of s.tiles) {
    const [, , c, r] = id.split('/'), cc = Number(c), rr = Number(r);
    const C = cc >> 2, R = rr >> 2, k = `hg1-${s.domain}/2/${C}/${R}`;
    const b = by.get(k) ?? { block: k, C, R, mask: 0, ring: Infinity, tiles: [] };
    b.mask |= 1 << ((rr & 3) * 4 + (cc & 3));
    b.ring = Math.min(b.ring, Math.max(Math.abs(cc - ac), Math.abs(rr - ar)));
    b.tiles.push([cc, rr]);
    by.set(k, b);
  }
  return [...by.values()].sort((a, b) => a.ring - b.ring || (a.block < b.block ? -1 : 1));
}
const ctxOf = (dom: string, c: number, r: number) => `hg1-${dom}/4/${c >> 4}/${r >> 4}`;
/** The L4 map regions a town's tiles read: its tile range grown by the compiler's LOAD_REACH (3,200 grid m). */
export const LOAD_REACH_M = 3200;
export function townRegions(s: Stage1): [number, number][] {
  const [c0, r0, c1, r1] = s.tileRange, T = 512, B = T << 4;
  const x0 = c0 * T - LOAD_REACH_M, z0 = r0 * T - LOAD_REACH_M, x1 = (c1 + 1) * T + LOAD_REACH_M, z1 = (r1 + 1) * T + LOAD_REACH_M;
  const out: [number, number][] = [];
  for (let C = Math.floor(x0 / B); C <= Math.floor((x1 - 1e-9) / B); C++) for (let R = Math.floor(z0 / B); R <= Math.floor((z1 - 1e-9) / B); R++) out.push([C, R]);
  return out;
}
/** The Overture release a build reads (its build record), or null before the record is stored. */
export function releaseIn(store: TileStore, build: string): string | null {
  const r = readJson<{ overture?: unknown }>(store, `builds/${build}.json`);
  return typeof r?.overture === 'string' ? r.overture : null;
}
/** Blocks within this many tiles of the anchor are built as 2 x 2 quads (the likely spawn district: SPEC 3.3). */
export const QUAD_RING = 3;
/** A block mask's 2 x 2 quads that hold any of its bits: part 0..3 = (qx, qy) = (part & 1, part >> 1). */
export function quadsOf(mask: number): { part: number; mask: number }[] {
  const out: { part: number; mask: number }[] = [];
  for (let part = 0; part < 4; part++) {
    let m = 0;
    for (let i = 0; i < 16; i++) if (((i & 3) >> 1) === (part & 1) && ((i >> 2) >> 1) === (part >> 1)) m |= 1 << i;
    if (mask & m) out.push({ part, mask: mask & m });
  }
  return out;
}
/** The (c, r) tiles a tile job builds (its block and mask). */
export const tilesOfJob = (args: Record<string, unknown>): [number, number][] => {
  const [, , C, R] = String(args.block).split('/').map(Number);
  return maskBits(Number(args.mask)).map((i) => [C * 4 + (i & 3), R * 4 + (i >> 2)]);
};

export type Graph = { specs: EnqueueSpec[]; tiles: string[]; stage: Stage1; anchor: [number, number]; box: Box };
/** Every job a town needs, from its pick (SPEC 4.1). `base` is the source's priority floor (P5 pre-warm, P3 rebuild). */
export function townGraph(placeId: string, gaz: Gaz, build: string, o: { frame: boolean; base: number; now: number }): Graph {
  const s = stage1(placeId, { geoid: gaz.geoid, anchor: gaz.anchor, bbox: gaz.bbox });
  const [ac, ar] = anchorTile(s.domain, gaz.anchor[0], gaz.anchor[1]);
  const P = (p: number) => Math.max(p, o.base);
  const specs: EnqueueSpec[] = [];
  const ctxs = new Map<string, string>();
  for (const id of s.tiles) { const [, , c, r] = id.split('/'); const k = ctxOf(s.domain, Number(c), Number(r)); if (!ctxs.has(k)) ctxs.set(k, `ctx:${build}:${k}`); }
  for (const [k, key] of ctxs) specs.push({ key, kind: 'ctx', build, prio: P(0), ring: 0, args: { ctx: k }, place: placeId, firstAsked: o.now });
  const blocks = blocksOf(s, ac, ar);
  const tileKeys: string[] = [];
  for (const b of blocks) {
    const ck = `ctx:${build}:hg1-${s.domain}/4/${b.C >> 2}/${b.R >> 2}`;
    const deps = ctxs.has(`hg1-${s.domain}/4/${b.C >> 2}/${b.R >> 2}`) ? [ck] : [];
    // (round the anchor, where the spawn district almost always lands, the block is split into its 2 x 2 quads: the
    // district's 25 tiles then build on many slots at once, the time to first drive; farther out, whole blocks, the
    // cheapest per tile)
    if (b.ring <= QUAD_RING) {
      for (const qd of quadsOf(b.mask)) {
        const ring = Math.min(...maskBits(qd.mask).map((i) => Math.max(Math.abs(b.C * 4 + (i & 3) - ac), Math.abs(b.R * 4 + (i >> 2) - ar))));
        const key = `tiles:${build}:${b.block}:q${qd.part}`;
        tileKeys.push(key);
        specs.push({ key, kind: 'tiles', build, prio: P(ring <= DISTRICT_RADIUS ? 0 : 1), ring, args: { block: b.block, mask: qd.mask, part: qd.part }, deps, place: placeId, firstAsked: o.now });
      }
      continue;
    }
    const key = `tiles:${build}:${b.block}`;
    tileKeys.push(key);
    specs.push({ key, kind: 'tiles', build, prio: P(b.ring <= DISTRICT_RADIUS ? 0 : 1), ring: b.ring, args: { block: b.block, mask: b.mask }, deps, place: placeId, firstAsked: o.now });
  }
  const bh = boxHash(gaz.bbox);
  if (o.frame) specs.push({ key: `frame:${build}:${placeId}:${bh}`, kind: 'frame', build, prio: P(0), args: { placeId, gazetteer: gaz }, deps: [...ctxs.values()], place: placeId, firstAsked: o.now });
  // (the full bundle: its deps are filled in by requestTown with the tile jobs' actual keys, which the block merge decides)
  specs.push({ key: `bundle:${build}:${placeId}:${bh}:full`, kind: 'bundle', build, prio: P(2), args: { placeId, gazetteer: gaz, variant: 'full', tiles: s.tiles.length }, deps: [...ctxs.values()], place: placeId, firstAsked: o.now });
  return { specs, tiles: s.tiles, stage: s, anchor: [ac, ar], box: gaz.bbox };
}

/** The objects a done job must have stored (queue.ts complete: done means stored). */
export function promisedOutputs(store: TileStore, j: Job, reported: string[] = [], refused: string[] = []): string[] {
  const missing: string[] = [];
  const need = (k: string) => { if (!store.has(k)) missing.push(k); };
  if (j.kind === 'ctx') { const [, , C, R] = String(j.args.ctx).split('/'); need(ctxKey(j.build, String(j.args.ctx).split('/')[0].slice(4) as Domain, Number(C), Number(R))); }
  else if (j.kind === 'tiles') {
    const [g, , C, R] = String(j.args.block).split('/'), d = g.slice(4) as Domain;
    for (const i of maskBits(Number(j.args.mask))) {
      const c = Number(C) * 4 + (i & 3), r = Number(R) * 4 + (i >> 2);
      if (!refused.includes(`hg1-${d}/0/${c}/${r}`)) need(tileKey(j.build, d, c, r));
    }
  } else if (j.kind === 'regions') {
    for (const rg of (j.args.regions as string[]) ?? []) { const [d, C, R] = rg.split(/[/:,]/); need(srcKey(String(j.args.release), d as Domain, Number(C), Number(R), 'files.json')); }
  } else if (j.kind === 'frame') need(frameKey(j.build, String(j.args.placeId)));
  else if (j.kind === 'far') for (const k of (j.args.keys as string[]) ?? []) { const [g, L, C, R] = k.split('/'); need(farKey(j.build, g.slice(4) as Domain, Number(L), Number(C), Number(R))); }
  else if (j.kind === 'bundle') {
    const want = new RegExp(`^bundles/${j.build}/${j.args.placeId}/[0-9a-f]{64}/${j.args.variant}/bundle\\.json$`);
    const b = reported.find((k) => want.test(k));
    if (!b) missing.push(`bundles/${j.build}/${j.args.placeId}/*/${j.args.variant}/bundle.json (not reported)`); else need(b);
    if (j.args.variant === 'full') need(manifestKey(j.build, String(j.args.placeId)));
  }
  for (const k of reported) if (parseKeyString(k) && !store.has(k)) missing.push(k);
  return [...new Set(missing)];
}

// ------------------------------------------------------------------------------------------------- towns rows
type TownRow = { place: string; build: string; box: string; state: TownPhase; first_asked: number; frame_at: number | null; district_at: number | null; full_at: number | null; tiles_total: number; tiles_done: number; asks: number; source: TownSource; meta: string };
export type TownMeta = { promised?: { driveS: number | null; fullS: number | null }; tiles?: string[]; anchor?: [number, number]; domain?: string; bundle?: string; full?: { tilesId: string }; district?: { tilesId: string; variant: string }; frame?: boolean; refused?: string[]; name?: string; stateName?: string };
const rowOf = (q: BuildQueue, place: string, build: string) => q.db.prepare('SELECT * FROM towns WHERE place = ? AND build = ?').get(place, build) as TownRow | undefined;
const metaOf = (r: TownRow | undefined): TownMeta => { try { return r ? JSON.parse(r.meta) : {}; } catch { return {}; } };
const setTown = (q: BuildQueue, place: string, build: string, patch: Partial<Omit<TownRow, 'meta'>> & { meta?: TownMeta }) => {
  const cols = Object.keys(patch).filter((k) => k !== 'meta');
  const vals = cols.map((k) => (patch as Record<string, unknown>)[k] as string | number | null);
  if (patch.meta) { cols.push('meta'); vals.push(JSON.stringify(patch.meta)); }
  if (cols.length) q.db.prepare(`UPDATE towns SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE place = ? AND build = ?`).run(...vals, place, build);
};

/** The build new towns are made at: HOMETOWN_BUILD, else the build the live workers report (one of them). */
export function currentBuild(d: BuilderDeps): string | null {
  if (d.build) return d.build();
  if (d.cfg.build) return d.cfg.build;
  const w = d.queue.liveWorkers().map((x) => x.build).filter((b): b is string => !!b).sort();
  return w[w.length - 1] ?? null;
}

const ACTIVE: TownPhase[] = ['asked', 'framing', 'district', 'growing'];
const day = (t: number) => new Date(t).toISOString().slice(0, 10);
const IPS = new Map<string, number[]>();

const kmBetween = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
  const r = Math.PI / 180, x = (b.lon - a.lon) * r * Math.cos(((a.lat + b.lat) / 2) * r), y = (b.lat - a.lat) * r;
  return Math.round(Math.hypot(x, y) * 6371);
};
/** The n nearest towns built in full at this build (the busy answer: play one of these now). */
export function nearestBuilt(d: BuilderDeps, p: { lat: number; lon: number }, build: string, n = 3): Nearby[] {
  const look = d.place ?? ((id: string) => placeById(id));
  const rows = d.queue.db.prepare("SELECT place FROM towns WHERE build = ? AND state = 'full'").all(build) as { place: string }[];
  return rows.map((r) => { const q = look(r.place); return q ? { placeId: r.place, name: `${q.name}, ${q.state}`, km: kmBetween(p, q) } : null; })
    .filter((x): x is Nearby => !!x).sort((a, b) => a.km - b.km || (a.placeId < b.placeId ? -1 : 1)).slice(0, n);
}

/** The wait to drive and to the whole town (s), from the work ahead and the live slots (SPEC 5.3). */
export function estimate(d: BuilderDeps, place: string, build: string): { etaDriveS: number | null; etaFullS: number | null; slots: number } {
  const q = d.queue, cap = capacitySlots(q.liveSlots(), d.runs), slots = cap.slots;
  const r = rowOf(q, place, build);
  const t = r?.first_asked ?? (d.now ?? Date.now)();
  const cost = (k: JobKind) => q.costOf(k, DEFAULT_COST[k]);
  const sum = (prio: number) => q.ahead(prio, t).reduce((a, x) => a + x.n * x.weight * cost(x.kind), 0);
  const per = Math.max(1, slots);
  // (the critical path of this town alone: ctx, then its spawn blocks, then the district or full bundle)
  // (a district's tiles are quads, 2 units each; without the frame the critical path is a whole block, 5)
  const crit = cost('ctx') + cost('tiles') * (d.cfg.frame ? 2 : 5) + (d.cfg.frame ? cost('frame') + cost('bundle') * 0.3 : cost('bundle'));
  // (no builder is up: the first run's start comes first; Render Workflows starts runs on demand)
  const drive = (d.cfg.frame ? sum(0) / per + crit : sum(2) / per + crit) + cap.spinupS * 1000;
  const full = sum(2) / per + cost('bundle');
  return { etaDriveS: Math.round(drive / 1000), etaFullS: Math.round(Math.max(drive, full) / 1000), slots };
}

// ---------------------------------------------------------------------------------------------------- answers
const summaryOf = (pkg: CityPackage): TownSummary => ({ name: pkg.name, state: pkg.state, places: pkg.places.length, streets: pkg.roadsSummary.streets });
const readJson = <T,>(store: TileStore, key: string): T | null => { const g = store.get(key); if (!g) return null; try { return JSON.parse(g.body.toString('utf8')) as T; } catch { return null; } };
/** A stored frame in this file's shape (the compiler's own shape normalised: frame.ts normalizeFrame). */
export const readFrame = (store: TileStore, key: string): TownFrame | null => normalizeFrame(readJson<unknown>(store, key));

/** The CityPackage a lock names from the production store: a bundle's citypackage.json, else the frame (lock v3). */
export function cityPackageFromStore(store: TileStore, lock: HometownLock): CityPackage | null {
  if (!lock || !TOWN_ID.test(lock.place) || !/^[0-9a-f]{64}$/.test(lock.tiles)) return null;
  for (const variant of ['full', ...listVariants(store, lock.compiler, lock.place, lock.tiles).filter((v) => v !== 'full')]) {
    const pkg = readJson<CityPackage>(store, bundleKey(lock.compiler, lock.place, lock.tiles, variant, 'citypackage.json'));
    if (pkg && !packageProblems(pkg).length && JSON.stringify(cityLock(pkg)) === JSON.stringify({ ...cityLock(pkg), ...lock })) return pkg;
  }
  if (lock.formatVersion === 3) {
    const f = readFrame(store, frameKey(lock.compiler, lock.place));
    const p = placeById(lock.place);
    if (f && p && !frameProblems(f).length && f.lock.tiles === lock.tiles) {
      const pkg = cityPackageOfFrame(f, { placeId: lock.place, name: p.name, stateName: p.stateName });
      if (!packageProblems(pkg).length && JSON.stringify(cityLock(pkg)) === JSON.stringify({ ...cityLock(pkg), ...lock })) return pkg;
    }
  }
  return null;
}
export function listVariants(store: TileStore, build: string, place: string, tilesId: string): string[] {
  try { return readdirSync(store.file(bundleKey(build, place, tilesId, 'full', 'lock.json')).replace(/\/full\/lock\.json$/, '')); } catch { return []; }
}

/** The lock a story may pin now: the full bundle's (v2 or v3), else the frame's (v3, phase district or later). */
export function storyReadyLock(d: BuilderDeps, placeId: string): ServiceLock | null {
  const build = currentBuild(d);
  if (!build) return null;
  const r = rowOf(d.queue, placeId, build), m = metaOf(r);
  if (m.full) { const l = readJson<ServiceLock>(d.store, bundleKey(build, placeId, m.full.tilesId, 'full', 'lock.json')); if (l && storyLock(l)) return l; }
  if (r && (r.state === 'district' || r.state === 'growing' || r.state === 'full')) {
    const f = readFrame(d.store, frameKey(build, placeId));
    if (f && !frameProblems(f).length) return f.lock;
  }
  return null;
}

function progressOf(d: BuilderDeps, r: TownRow): Progress {
  const q = d.queue, m = metaOf(r);
  const jobs = q.jobsOf(r.place).filter((j) => j.build === r.build || j.build === ANY_BUILD);
  const tiles = jobs.filter((j) => j.kind === 'tiles');
  const reading = jobs.some((j) => (j.kind === 'regions' || j.kind === 'ctx') && j.state !== 'done');
  const total = r.tiles_total || 0;
  const done = Math.min(total, m.tiles ? m.tiles.filter((t) => { const [g, , c, rr] = t.split('/'); return d.store.has(tileKey(r.build, g.slice(4) as Domain, Number(c), Number(rr))); }).length : 0);
  const e = estimate(d, r.place, r.build);
  const position = r.state === 'asked' ? (q.db.prepare("SELECT COUNT(*) n FROM towns WHERE state = 'asked' AND build = ? AND first_asked < ?").get(r.build, r.first_asked) as { n: number }).n + 1 : 0;
  const stage = r.state === 'framing' && !reading && tiles.some((j) => j.state === 'done') ? 'Building streets' : PHASE_WORDS[r.state];
  const out: Progress = {
    state: r.state === 'asked' ? 'queued' : r.state === 'framing' ? (reading ? 'reading' : 'compiling') : r.state === 'full' ? 'ready' : 'compiling',
    placeId: r.place, stage, done, total, position, etaS: r.state === 'growing' ? e.etaFullS : e.etaDriveS,
    phase: r.state, district: r.state === 'growing' || r.state === 'full', etaDriveS: r.state === 'growing' || r.state === 'full' ? 0 : e.etaDriveS, etaFullS: e.etaFullS,
  };
  if (r.state === 'district' || r.state === 'growing') {
    const lock = storyReadyLock(d, r.place), pin = lock && storyLock(lock), pkg = pin ? cityPackageFromStore(d.store, pin) : null;
    if (pin && pkg) { out.lock = pin; out.town = summaryOf(pkg); }
    if (m.district) out.play = { build: r.build, tilesId: m.district.tilesId, variant: m.district.variant };
  }
  return out;
}

/** Recompute a town's phase from its jobs (failed when a job it waits on failed for good). */
function refresh(d: BuilderDeps, r: TownRow): TownRow {
  if (r.state === 'full' || r.state === 'failed') return r;
  const jobs = d.queue.jobsOf(r.place).filter((j) => j.build === r.build || j.build === ANY_BUILD);
  if (jobs.some((j) => j.state === 'failed')) { setTown(d.queue, r.place, r.build, { state: 'failed' }); return { ...r, state: 'failed' }; }
  if (r.state === 'asked' && jobs.some((j) => j.state !== 'queued')) { setTown(d.queue, r.place, r.build, { state: 'framing' }); return { ...r, state: 'framing' }; }
  return r;
}

function answer(d: BuilderDeps, r: TownRow): TownAnswer {
  r = refresh(d, r);
  if (r.state === 'failed') return { status: 409, body: { state: 'error', placeId: r.place, error: TOWN_WORDS.failed, stage: PHASE_WORDS.failed } };
  if (r.state === 'full') {
    const lock = storyReadyLock(d, r.place), pin = lock && storyLock(lock), pkg = pin ? cityPackageFromStore(d.store, pin) : null;
    const m = metaOf(r);
    if (pin && pkg) return { status: 200, body: { state: 'ready', placeId: r.place, lock: pin, town: summaryOf(pkg), phase: 'full', ...(m.full ? { play: { build: r.build, tilesId: m.full.tilesId, variant: 'full' } } : {}) } };
  }
  return { status: 202, body: progressOf(d, r) };
}

/** GET /api/towns/{placeId}: never starts anything. */
export function townStatus(d: BuilderDeps, placeId: string): TownAnswer {
  if (!TOWN_ID.test(placeId)) return { status: 400, body: { error: TOWN_WORDS.unknown } };
  const build = currentBuild(d);
  const r = build ? rowOf(d.queue, placeId, build) : undefined;
  if (!r) return { status: 404, body: { placeId, error: 'This town has not been asked for.' } };
  return answer(d, r);
}

/** POST /api/towns: a built town at once, its build joined, a new build admitted, or a refusal. */
export function requestTown(d: BuilderDeps, placeId: string, ip: string, source: TownSource = 'player'): TownAnswer {
  if (typeof placeId !== 'string' || !TOWN_ID.test(placeId)) return { status: 400, body: { error: TOWN_WORDS.unknown } };
  const place = (d.place ?? ((id: string) => placeById(id)))(placeId);
  if (!place) return { status: 404, body: { placeId, error: TOWN_WORDS.unknown } };
  const build = currentBuild(d);
  if (!build) return { status: 503, body: { placeId, error: TOWN_WORDS.busy } };
  const q = d.queue, now = (d.now ?? Date.now)();
  const had = rowOf(q, placeId, build);
  if (had && had.state !== 'failed') {
    q.db.prepare('UPDATE towns SET asks = asks + 1 WHERE place = ? AND build = ?').run(placeId, build);
    // (a town left with no jobs (written before this fix by a pick that crashed half way): build it now)
    if (had.state !== 'full' && !q.jobsOf(placeId).length) enqueueTown(d, place, build, had.source, had.first_asked, false);
    // (an interactive ask raises a pre-warm town's jobs to the player's priorities)
    if (had.source === 'prewarm' && source !== 'prewarm') enqueueTown(d, place, build, source, now, true);
    return answer(d, rowOf(q, placeId, build)!);
  }
  // ---- a new town (or one that failed, asked again): the limits, then admission
  // (on-demand runs: the towns waiting may follow what the dispatcher can start; the day's cold towns, a spend cap,
  // stay on the slots actually live unless the owner sets HOMETOWN_DAILY_COLD)
  const live = q.liveSlots(), slots = capacitySlots(live, d.runs).slots;
  const env = process.env;
  const queueMax = Number(env.HOMETOWN_QUEUE_MAX) > 0 ? Number(env.HOMETOWN_QUEUE_MAX) : Math.max(10, slots * 3);
  const dailyCold = Number(env.HOMETOWN_DAILY_COLD) > 0 ? Number(env.HOMETOWN_DAILY_COLD) : Math.max(100, live * 400);
  const perIp = Number(env.HOMETOWN_PER_IP_HOUR) > 0 ? Number(env.HOMETOWN_PER_IP_HOUR) : 3;
  if (source === 'player') {
    const waiting = (q.db.prepare("SELECT COUNT(*) n FROM towns WHERE build = ? AND state IN ('asked', 'framing') AND source != 'prewarm'").get(build) as { n: number }).n;
    const near = () => nearestBuilt(d, place, build);
    if (waiting >= queueMax) return { status: 503, body: { placeId, error: TOWN_WORDS.busy, nearby: near() } };
    const today = (q.db.prepare("SELECT COUNT(*) n FROM towns WHERE source = 'player' AND first_asked >= ?").get(Date.parse(`${day(now)}T00:00:00Z`)) as { n: number }).n;
    if (today >= dailyCold) return { status: 503, body: { placeId, error: TOWN_WORDS.busy, nearby: near() } };
    const hits = (IPS.get(ip) ?? []).filter((t) => now - t < 3600_000);
    if (hits.length >= perIp) return { status: 429, body: { placeId, error: TOWN_WORDS.busy, nearby: near() } };
    // admission: the wait to drive this town would have, were it admitted now
    const e = estimate(d, '\u0000new', build);
    if (e.etaDriveS != null && e.etaDriveS > d.cfg.maxWaitS) {
      const min = Math.max(1, Math.round(e.etaDriveS / 60));
      return { status: 503, body: { placeId, error: BUSY_WORDS(min), waitMin: min, nearby: near() } };
    }
    hits.push(now); IPS.set(ip, hits);
    if (IPS.size > 5000) for (const [k, v] of IPS) if (!v.some((t) => now - t < 3600_000)) IPS.delete(k);
  }
  if (d.store.fullReason(32 * 1024 * 1024)) return { status: 507, body: { placeId, error: TOWN_WORDS.failed } };
  enqueueTown(d, place, build, source, now, false);
  const r = rowOf(q, placeId, build)!;
  // (the wait it was promised, kept to measure the estimate's error when the town is built: the status page)
  const e = estimate(d, placeId, build);
  setTown(q, placeId, build, { meta: { ...metaOf(r), promised: { driveS: e.etaDriveS, fullS: e.etaFullS } } });
  return answer(d, rowOf(q, placeId, build)!);
}

/** Write the town's row and enqueue its graph (idempotent: an existing job only gains the town and a priority). */
export function enqueueTown(d: BuilderDeps, place: Place, build: string, source: TownSource, now: number, raise: boolean) {
  // (the town's row and every job of its graph in ONE transaction: a crash or a restart in between can never leave a
  // town 'asked' with no jobs, which a re-ask would only join, never build)
  d.queue.tx(() => enqueueTownIn(d, place, build, source, now, raise));
  d.queue.changed();
}
function enqueueTownIn(d: BuilderDeps, place: Place, build: string, source: TownSource, now: number, raise: boolean) {
  const q = d.queue, gaz = gazetteerOf(place);
  const base = source === 'prewarm' ? 5 : source === 'rebuild' ? 3 : 0;
  let g: Graph;
  try { g = townGraph(place.placeId, gaz, build, { frame: d.cfg.frame, base, now }); } catch (e) {
    console.error('hometown-build: stage 1 refused', place.placeId, String((e as Error).message).slice(0, 200));
    throw e;
  }
  q.tx(() => {
    const had = rowOf(q, place.placeId, build);
    const meta: TownMeta = { ...metaOf(had), tiles: g.tiles, anchor: g.anchor, domain: g.stage.domain, name: place.name, stateName: place.stateName };
    if (!had) {
      q.db.prepare(`INSERT INTO towns (place, build, box, state, first_asked, tiles_total, tiles_done, asks, source, meta) VALUES (?, ?, ?, 'asked', ?, ?, 0, 1, ?, ?)`)
        .run(place.placeId, build, JSON.stringify(g.box), now, g.tiles.length, source, JSON.stringify(meta));
    } else {
      q.db.prepare("UPDATE towns SET state = CASE WHEN state = 'failed' THEN 'asked' ELSE state END, source = CASE WHEN ? THEN ? ELSE source END, meta = ? WHERE place = ? AND build = ?")
        .run(raise ? 1 : 0, source, JSON.stringify(meta), place.placeId, build);
    }
  });
  // the town's map regions not staged yet (its tiles' 3.2 km reach), fetched FIRST, each by exactly one job, before its
  // ctx: one round of fetches at the pick instead of a compile finding them missing one exit 3 at a time
  const rel = releaseIn(d.store, build), dom = g.stage.domain;
  const regionDeps: string[] = [];
  if (rel) {
    const fresh: [number, number][] = [];
    for (const [C, R] of townRegions(g.stage)) {
      if (d.store.has(srcKey(rel, dom as Domain, C, R, 'files.json'))) continue;
      const k = q.regionsActive(dom, C, R);
      if (k) regionDeps.push(k); else fresh.push([C, R]);
    }
    const base = source === 'prewarm' ? 5 : source === 'rebuild' ? 3 : 0;
    const regionSpecs: EnqueueSpec[] = [];
    for (let i = 0; i < fresh.length; i += 4) {
      const list = fresh.slice(i, i + 4).map(([C, R]) => `${C},${R}`).join(';');
      const key = `regions:${rel}:hg1-${dom}:${list}`;
      regionDeps.push(key);
      regionSpecs.push({ key, kind: 'regions', build: ANY_BUILD, prio: base, ring: 0, weight: 2, args: { release: rel, spec: `${dom}:${list}`, regions: fresh.slice(i, i + 4).map(([C, R]) => `${dom}/${C}/${R}`) }, place: place.placeId, firstAsked: now });
    }
    if (regionSpecs.length) q.enqueueMany(regionSpecs);
  }
  for (const s of g.specs) if (s.kind === 'ctx' && regionDeps.length) s.deps = [...new Set([...(s.deps ?? []), ...regionDeps])];
  const tileSpecs = g.specs.filter((s) => s.kind === 'tiles'), rest = g.specs.filter((s) => s.kind !== 'tiles' && s.kind !== 'bundle');
  q.enqueueMany(rest);
  const tileKeys = q.enqueueMany(tileSpecs).flat();
  const bundle = g.specs.find((s) => s.kind === 'bundle')!;
  q.enqueueMany([{ ...bundle, deps: [...(bundle.deps ?? []), ...tileKeys] }]);
}

/**
 * After a job is done (worker complete): move its towns on. A frame re-rings the town from its spawn and enqueues the
 * district bundle and the far windows; a district bundle makes the town playable (growing); the full bundle, full.
 */
export function afterJobDone(d: BuilderDeps, j: Job, reported: string[], refused: string[] = []) {
  const q = d.queue;
  const places = (q.db.prepare('SELECT place FROM wants WHERE job = ?').all(j.key) as { place: string }[]).map((w) => w.place);
  for (const place of places) {
    const r = rowOf(q, place, j.build === ANY_BUILD ? (currentBuild(d) ?? '') : j.build);
    if (!r) continue;
    const m = metaOf(r);
    if (refused.length) m.refused = [...new Set([...(m.refused ?? []), ...refused])];
    if (r.state === 'asked') r.state = 'framing';
    if (j.kind === 'frame') {
      const f = readFrame(d.store, frameKey(r.build, place));
      if (!f || frameProblems(f).length) continue;
      m.frame = true;
      // re-ring from the spawn: the district's blocks to P0, the rest by distance from the spawn
      const [sc, sr] = f.spawn.tile, [c0, r0, c1, r1] = f.spawnDistrict;
      const distKeys: string[] = [];
      // (by the tiles each job actually builds: a quad outside the district is not raised, nor waited on by its bundle)
      const inD = (t: Job) => tilesOfJob(t.args).some(([c, rr]) => c >= c0 && c <= c1 && rr >= r0 && rr <= r1);
      for (const t of q.jobsOf(place).filter((x) => x.kind === 'tiles' && x.state === 'queued')) {
        const ring = Math.min(...tilesOfJob(t.args).map(([c, rr]) => Math.max(Math.abs(c - sc), Math.abs(rr - sr))));
        q.reprioritise(t.key, inD(t) ? 0 : 1, ring);
      }
      for (const t of q.jobsOf(place).filter((x) => x.kind === 'tiles' && x.state !== 'failed')) if (inD(t)) distKeys.push(t.key);
      const variant = f.variant ?? `district-${sc}-${sr}`, gaz = gazetteerOf((d.place ?? ((id: string) => placeById(id)))(place)!);
      const base = r.source === 'prewarm' ? 5 : r.source === 'rebuild' ? 3 : 0;
      q.enqueueMany([{ key: `bundle:${r.build}:${place}:${f.lock.tiles}:${variant}`, kind: 'bundle', build: r.build, prio: Math.max(0, base), args: { placeId: place, gazetteer: gaz, variant, window: f.spawnDistrict, tilesId: f.lock.tiles }, deps: [j.key, ...distKeys], place, firstAsked: r.first_asked }]);
      // the far field, in windows of at most 32 far tiles, at P2 (the full bundle waits on them)
      const far = (f.far ?? []).slice().sort();
      const farKeys: string[] = [];
      for (let i = 0; i < far.length; i += 32) {
        const keys = far.slice(i, i + 32), key = `far:${r.build}:${keys[0]}+${keys.length}`;
        farKeys.push(key);
        q.enqueueMany([{ key, kind: 'far', build: r.build, prio: Math.max(2, base), args: { keys }, place, firstAsked: r.first_asked }]);
      }
      const full = q.jobsOf(place).find((x) => x.kind === 'bundle' && x.args.variant === 'full');
      if (full) q.addDeps(full.key, [j.key, ...farKeys]);
      setTown(q, place, r.build, { state: r.state === 'framing' ? 'district' : r.state, frame_at: q.now(), meta: m });
      continue;
    }
    if (j.kind === 'bundle') {
      const b = reported.find((k) => /\/bundle\.json$/.test(k));
      const k = b ? parseKeyString(b) : null;
      if (!k) continue;
      if (k.variant === 'full') {
        m.full = { tilesId: k.tilesId! };
        setTown(q, place, r.build, { state: 'full', full_at: q.now(), meta: m });
        const actual = (q.now() - r.first_asked) / 1000, promised = m.promised?.fullS;
        if (promised != null && actual > 0) q.log('eta', { place, promisedS: promised, actualS: Math.round(actual), errPct: Math.round(((promised - actual) / actual) * 100) });
        continue;
      }
      m.district = { tilesId: k.tilesId!, variant: k.variant! };
      setTown(q, place, r.build, { state: r.state === 'full' ? 'full' : 'growing', district_at: q.now(), meta: m });
      continue;
    }
    setTown(q, place, r.build, { state: r.state, meta: m });
  }
}

/** When a bundle's bundle.json lands: write its citypackage.json (this server's, never uploaded). */
export function onBundleStored(d: BuilderDeps, key: string) {
  const k = parseKeyString(key);
  if (!k || k.family !== 'bundles' || k.file !== 'bundle.json') return;
  const cp = bundleKey(k.buildId, k.placeId!, k.tilesId!, k.variant!, 'citypackage.json');
  if (d.store.has(cp)) return;
  const g = readJson<{ GEO: Geodata['GEO']; PLACE_DATA: Geodata['PLACE_DATA']; PKG: Geodata['PKG'] }>(d.store, bundleKey(k.buildId, k.placeId!, k.tilesId!, k.variant!, 'geodata.json'));
  const p = (d.place ?? ((id: string) => placeById(id)))(k.placeId!);
  if (!g) return;
  const town = p ? { placeId: k.placeId!, name: p.name, stateName: p.stateName } : { placeId: k.placeId!, name: String(g.PKG?.name ?? k.placeId), stateName: String(g.PKG?.state ?? '') };
  // (lock v3: the frame's places and spawns are the story's, one source of truth; else the bundle's own)
  let pkg: CityPackage;
  const f = readFrame(d.store, frameKey(k.buildId, k.placeId!));
  try { pkg = f && !frameProblems(f).length && f.lock.tiles === k.tilesId ? cityPackageOfFrame(f, town) : cityPackageOf(g as Geodata, town); } catch (e) { console.error('hometown-build: city package', key, String((e as Error).message).slice(0, 200)); return; }
  const bad = packageProblems(pkg);
  if (bad.length) { console.error('hometown-build: city package problems', key, bad.slice(0, 3).join('; ')); return; }
  d.store.put(cp, Buffer.from(JSON.stringify(pkg)));
}

/** The best playable variant of a town at a build (the engine's poll, /api/towns/{place}?build=). */
/** (the engine's growing.js reads `state: 'full'` or `full: true` as "the whole town is ready": both are sent) */
export function bestVariant(d: BuilderDeps, placeId: string, build: string): { variant: string; tilesId: string; url: string; state: 'full' | 'district'; full: boolean } | null {
  const r = rowOf(d.queue, placeId, build), m = metaOf(r);
  const pick = m.full ? { variant: 'full', tilesId: m.full.tilesId } : m.district ? { variant: m.district.variant, tilesId: m.district.tilesId } : null;
  if (!pick || !d.store.has(bundleKey(build, placeId, pick.tilesId, pick.variant, 'bundle.json'))) return null;
  const full = pick.variant === 'full';
  return { ...pick, url: `/towns/${placeId}/${build}/${pick.tilesId}/${pick.variant}/`, state: full ? 'full' : 'district', full };
}

/** Pre-warm (SPEC 7): the towns of a list enqueued at P5 (district first inside each town, then rings). */
export function prewarm(d: BuilderDeps, ids: string[], source: TownSource = 'prewarm', atBuild?: string | null): { enqueued: number; skipped: number; build: string | null } {
  // (atBuild: a shadow pre-warm of the NEXT build, claimed only by workers that report it: the upgrade runbook)
  const build = atBuild || currentBuild(d);
  if (!build) return { enqueued: 0, skipped: ids.length, build };
  let n = 0, skipped = 0;
  const now = (d.now ?? Date.now)();
  for (const id of ids) {
    const p = (d.place ?? ((x: string) => placeById(x)))(id);
    if (!p || rowOf(d.queue, id, build)) { skipped++; continue; }
    try { enqueueTown(d, p, build, source, now, false); n++; } catch { skipped++; }
  }
  return { enqueued: n, skipped, build };
}

/** The owner's status view of the towns (G13). */
export function townsStatus(d: BuilderDeps) {
  const rows = d.queue.db.prepare('SELECT state, source, COUNT(*) n FROM towns GROUP BY state, source').all() as { state: string; source: string; n: number }[];
  const ttfd = d.queue.db.prepare("SELECT place, build, first_asked, frame_at, district_at, full_at FROM towns WHERE full_at IS NOT NULL OR district_at IS NOT NULL ORDER BY first_asked DESC LIMIT 20").all() as Record<string, number | string | null>[];
  return { byState: rows, recent: ttfd.map((r) => ({ ...r, toFrameS: r.frame_at ? Math.round((Number(r.frame_at) - Number(r.first_asked)) / 1000) : null, toDistrictS: r.district_at ? Math.round((Number(r.district_at) - Number(r.first_asked)) / 1000) : null, toFullS: r.full_at ? Math.round((Number(r.full_at) - Number(r.first_asked)) / 1000) : null })) };
}

/** A legacy bundle folder (data/towns/bundles, the in-process builder's) still readable: G12 keeps it, read-only. */
export const legacyBundlesDir = (dataDir: string) => `${dataDir}/towns/bundles`;
export const hasLegacyBundles = (dataDir: string) => existsSync(legacyBundlesDir(dataDir));
export const readText = (f: string) => { try { return readFileSync(f, 'utf8'); } catch { return null; } };
