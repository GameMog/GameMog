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
 * waiting (defaults from the live slots). A town that is built is never limited. The per-address count lives in the
 * queue's SQLite (ip_hits, a hash of the address), so a deploy never resets it.
 *
 * Degraded towns: a tile that cannot be built (queue.ts: retried, split to one job per tile, retried again) leaves flat
 * ground in the whole town (the full bundle's args.absent; deploy/town-builder/worker.py lays it), and the town still
 * becomes 'full' (meta.absent: the owner's status lists it). A failed tile inside the spawn district fails the town:
 * the district is the frame's spawnDistrict (meta.districtWindow), or without the frame the anchor's 5 x 5. The full
 * bundle carries that window as args.keep and fails rather than lay a district tile flat, so a failed town is never
 * later served as ready; a district bundle waits only on its own window's tiles.
 *
 * No build known yet (no HOMETOWN_BUILD, no run ever): the pick is kept (pending) and answered 202 at once; the
 * dispatcher starts one run, and that run's FIRST claim admits it at the build it reports and takes its first job
 * (admitPending): no refusal, no round trip, no idle claim.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
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
import { ANY_BUILD, maskBits, tileInWindow, type BuildQueue, type EnqueueSpec, type Job, type JobKind } from './queue.ts';
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
  /** (r7, the Create card) the build's steps as counts: map areas fetched, map sections read, the town's plan (frame),
   * map tiles built, the drivable district and the whole town; `running` jobs of the town on a builder now */
  steps?: TownSteps;
  /** (r7) how far the whole town is, 0..100, by its work done (the card's bar; the card never lets it go back) */
  pct?: number;
  /** (r7) seconds since the town was first asked for; `starting`: no builder is up yet and one is being started for it;
   * `slow`: it has taken well over what towns usually take (the card says so) */
  elapsedS?: number; starting?: boolean; slow?: boolean;
};
export type TownSteps = { regions: { done: number; total: number }; ctx: { done: number; total: number }; frame: boolean | null; tiles: { done: number; total: number }; district: boolean; full: boolean; running: number };
export type TownAnswer =
  | { status: 200; body: { state: 'ready'; placeId: string; lock: HometownLock; town: TownSummary; phase: 'full'; play?: Progress['play'] } }
  | { status: 202; body: Progress }
  | { status: 400 | 404 | 409 | 429 | 503 | 507; body: { state?: string; placeId?: string; error: string; stage?: string; waitMin?: number; nearby?: Nearby[]; retryS?: number } };

/** The Create card's words by phase (SPEC 4.6; no tool, model or vendor names: scripts/hometown-words-check). */
export const PHASE_WORDS: Record<TownPhase, string> = {
  asked: 'Waiting its turn', framing: 'Reading the map', district: 'Laying the streets near you',
  growing: 'Ready to drive: the rest of town keeps building', full: 'Your whole town is built', failed: 'Not built',
};
/** (r7) the Create card's words for the steps inside 'asked' and 'framing' (no tool, model or vendor names) */
export const STEP_WORDS = {
  starting: 'Starting a builder for your town', fetching: 'Fetching map data', reading: 'Reading the map', planning: 'Planning your town\'s streets and places',
  building: 'Building streets',
};
export const BUSY_WORDS = (min: number) => `Lots of towns are being built. Yours would take about ${min} minute${min === 1 ? '' : 's'}.`;

/** Planning costs (ms) until the queue's EWMAs have numbers (SPEC 3.2). */
/** (tiles: per tile unit, queue.ts jobUnits: a 16-tile block is 5 units, a 2 x 2 quad 2) */
export const DEFAULT_COST: Record<JobKind, number> = { regions: 40_000, ctx: 6_000, frame: 4_000, tiles: 2_000, far: 5_000, bundle: 10_000, manifest: 1_000, canary: 9_000 };
export const DISTRICT_RADIUS = 2;

export type BuilderDeps = { cfg: HometownConfig; store: TileStore; queue: BuildQueue; now?: () => number; build?: () => string | null; place?: (id: string) => Place | null;
  /** on-demand builders (dispatch.ts, HOMETOWN_RUNS=workflows): the estimate counts the runs it may start */
  runs?: RunsConfig | null;
  /** why on-demand builders are switched on (HOMETOWN_RUNS=workflows) but none can start (dispatch.ts runsProblem: no
   * Render API key or workflow slug); null when they can, or when the builder is not on-demand */
  runsDown?: string | null;
  /** the workflow deploy this web expects of the runs (stamp.ts webStamp): set, a build counts as the current one only
   * once a run of that deploy reports it (buildView); null or unset, the build the runs report, as before 14 Nov */
  stamp?: string | null };

// ------------------------------------------------------------------------------------------------ the job graph
/**
 * The compiler's places entry of a pick. `bbox` is THE play box (box.ts: the internal point's, stage 1 here); `searchBbox`
 * is the search's whole square (compiler 0.8.0+): when the cap cuts it, the compiler's frame centres a box of the same size
 * on the place's downtown (MogCity tools/hometown/assemble.py downtown_box), so a capped town's FRAME may pin other tiles
 * than stage 1 here. The frame is the truth: afterJobDone re-tiles the town to it (retileToFrame).
 */
type Gaz = { name: string; geoid: string; anchor: [number, number]; anchorSource: string; bbox: Box; bboxSource: string; searchBbox?: Box };
export const gazetteerOf = (p: Place): Gaz => ({ name: `${p.name}, ${p.state}`, geoid: p.geoid, anchor: [p.lon, p.lat], anchorSource: 'Census Gazetteer INTPTLAT/INTPTLONG', bbox: playBox(p), bboxSource: BOX_SOURCE, searchBbox: [...p.bbox] as Box });

type Block = { block: string; C: number; R: number; mask: number; ring: number; tiles: [number, number][] };
/** The town's tiles grouped into L2 blocks with their masks, ringed (Chebyshev, in tiles) from (ac, ar). */
export function blocksOf(s: Pick<Stage1, 'tiles' | 'domain'>, ac: number, ar: number): Block[] {
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
/** The ctx (and region) blocks, L4, within `reach` grid m of the tile range c0..c1, r0..r1 (inclusive). */
export function reachBlocks(c0: number, r0: number, c1: number, r1: number, reach: number): [number, number][] {
  const T = 512, B = T << 4;
  const x0 = c0 * T - reach, z0 = r0 * T - reach, x1 = (c1 + 1) * T + reach, z1 = (r1 + 1) * T + reach;
  const out: [number, number][] = [];
  for (let C = Math.floor(x0 / B); C <= Math.floor((x1 - 1e-9) / B); C++) for (let R = Math.floor(z0 / B); R <= Math.floor((z1 - 1e-9) / B); R++) out.push([C, R]);
  return out;
}
/** The compiler's CTX_REACH (compile.py): the ctx a tile compile reads round it, grid m. */
export const CTX_REACH_M = 3200;
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
  const { specs, ctxs } = tileGraph(placeId, s, build, ac, ar, o);
  const bh = boxHash(gaz.bbox);
  if (o.frame) specs.push({ key: `frame:${build}:${placeId}:${bh}`, kind: 'frame', build, prio: Math.max(0, o.base), args: { placeId, gazetteer: gaz }, deps: [...ctxs.values()], place: placeId, firstAsked: o.now });
  // (the full bundle: its deps are filled in by requestTown with the tile jobs' actual keys, which the block merge decides)
  // (args.keep: the spawn district, whose tiles are never laid as flat ground (queue.ts failDependents): without the frame
  // the anchor's 5 x 5 (districtOf); with it, set when the frame lands (afterJobDone))
  const keep = o.frame ? {} : { keep: [ac - DISTRICT_RADIUS, ar - DISTRICT_RADIUS, ac + DISTRICT_RADIUS, ar + DISTRICT_RADIUS] };
  specs.push({ key: `bundle:${build}:${placeId}:${bh}:full`, kind: 'bundle', build, prio: Math.max(2, o.base), args: { placeId, gazetteer: gaz, variant: 'full', tiles: s.tiles.length, ...keep }, deps: [...ctxs.values()], place: placeId, firstAsked: o.now });
  return { specs, tiles: s.tiles, stage: s, anchor: [ac, ar], box: gaz.bbox };
}

/** The ctx and tile jobs of a tile set, ringed from (ac, ar): quads near it, whole blocks farther out (SPEC 3.3). */
export function tileGraph(placeId: string, s: Pick<Stage1, 'tiles' | 'domain'>, build: string, ac: number, ar: number, o: { base: number; now: number }) {
  const P = (p: number) => Math.max(p, o.base);
  const specs: EnqueueSpec[] = [];
  // (every ctx block the town's compiles read: a tile reads the ctx within CTX_REACH_M of it, the frame within 3 km of
  // the box. Each its own job, so they compute side by side on every slot; before, only the blocks holding the town's
  // tiles were jobs, and the frame computed the rest one after another itself: Prague, OK, 1 ctx job and 8 blocks in
  // the frame, 54-104 s of the time to the story under load)
  const ctxs = new Map<string, string>();
  const cr = s.tiles.map((id) => id.split('/').slice(2).map(Number));
  const [tc0, tr0, tc1, tr1] = [Math.min(...cr.map((x) => x[0])), Math.min(...cr.map((x) => x[1])), Math.max(...cr.map((x) => x[0])), Math.max(...cr.map((x) => x[1]))];
  for (const [C, R] of reachBlocks(tc0, tr0, tc1, tr1, CTX_REACH_M)) { const k = `hg1-${s.domain}/4/${C}/${R}`; ctxs.set(k, `ctx:${build}:${k}`); }
  for (const [k, key] of ctxs) specs.push({ key, kind: 'ctx', build, prio: P(0), ring: 0, args: { ctx: k }, place: placeId, firstAsked: o.now });
  const blocks = blocksOf(s, ac, ar);
  const tileKeys: string[] = [];
  for (const b of blocks) {
    // (the ctx blocks within reach of the block's tiles: a tile job never computes a neighbour's ctx a ctx job is on)
    const deps = reachBlocks(b.C * 4, b.R * 4, b.C * 4 + 3, b.R * 4 + 3, CTX_REACH_M).map(([C, R]) => ctxs.get(`hg1-${s.domain}/4/${C}/${R}`)).filter((k): k is string => !!k);
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
  return { specs, ctxs, tileKeys };
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
    // (no release known: the build record was never stored, so nothing it fetched can be checked; not done)
    if (typeof j.args.release !== 'string' || !j.args.release) missing.push(`regions ${j.key}: no Overture release (builds/${j.build}.json not stored)`);
    else for (const rg of (j.args.regions as string[]) ?? []) { const [d, C, R] = rg.split(/[/:,]/); need(srcKey(String(j.args.release), d as Domain, Number(C), Number(R), 'files.json')); }
  } else if (j.kind === 'frame') need(frameKey(j.build, String(j.args.placeId)));
  else if (j.kind === 'far') for (const k of (j.args.keys as string[]) ?? []) { const [g, L, C, R] = k.split('/'); need(farKey(j.build, g.slice(4) as Domain, Number(L), Number(C), Number(R))); }
  else if (j.kind === 'bundle') {
    const want = new RegExp(`^bundles/${j.build}/${j.args.placeId}/[0-9a-f]{64}/${j.args.variant}/bundle\\.json$`);
    const b = reported.find((k) => want.test(k));
    if (!b) missing.push(`bundles/${j.build}/${j.args.placeId}/*/${j.args.variant}/bundle.json (not reported)`); else need(b);
    // (a degraded town, tiles laid as flat ground, stores no session descriptor: the web takes a manifest only when every
    // tile it lists is stored, and a placeholder never is. Its bundle is how it plays; a later whole build may store one)
    if (j.args.variant === 'full' && !((j.args.absent as string[] | undefined) ?? []).length) need(manifestKey(j.build, String(j.args.placeId)));
  }
  for (const k of reported) if (parseKeyString(k) && !store.has(k)) missing.push(k);
  return [...new Set(missing)];
}

// ------------------------------------------------------------------------------------------------- towns rows
type TownRow = { place: string; build: string; box: string; state: TownPhase; first_asked: number; frame_at: number | null; district_at: number | null; full_at: number | null; tiles_total: number; tiles_done: number; asks: number; source: TownSource; meta: string };
export type TownMeta = { promised?: { driveS: number | null; fullS: number | null }; tiles?: string[]; anchor?: [number, number]; domain?: string; bundle?: string; full?: { tilesId: string }; district?: { tilesId: string; variant: string }; frame?: boolean; refused?: string[]; name?: string; stateName?: string;
  /** the spawn district's tile window [c0, r0, c1, r1] (the frame's spawnDistrict): a failed tile there fails the town */
  districtWindow?: [number, number, number, number];
  /** the tiles the full bundle laid as flat ground (they could not be built): a degraded town */
  absent?: string[];
  /** why the town failed (the job and its error), for the owner's status */
  failed?: { key: string; why: string | null; at: number };
  /** a town admitted at a build no run could claim any more, moved to this build (rekeyStale) */
  movedTo?: string };
const rowOf = (q: BuildQueue, place: string, build: string) => q.db.prepare('SELECT * FROM towns WHERE place = ? AND build = ?').get(place, build) as TownRow | undefined;
const metaOf = (r: TownRow | undefined): TownMeta => { try { return r ? JSON.parse(r.meta) : {}; } catch { return {}; } };
const setTown = (q: BuildQueue, place: string, build: string, patch: Partial<Omit<TownRow, 'meta'>> & { meta?: TownMeta }) => {
  const cols = Object.keys(patch).filter((k) => k !== 'meta');
  const vals = cols.map((k) => (patch as Record<string, unknown>)[k] as string | number | null);
  if (patch.meta) { cols.push('meta'); vals.push(JSON.stringify(patch.meta)); }
  if (cols.length) q.db.prepare(`UPDATE towns SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE place = ? AND build = ?`).run(...vals, place, build);
};

/**
 * The build new towns are made at, and whether it is the one the newest workflow deploy makes (14 Nov):
 *   HOMETOWN_BUILD set               that build (learned: the owner's pin)
 *   no deploy stamp (stamp unset)    the build the live runs report, else the build the last run reported (learned)
 *   a run of this web's deploy seen  the build it reports (learned): a live one first, else the last one seen
 *   none yet (a workflow redeploy)   NOT learned: only a build a live run reports (that run can claim it now), else none:
 *                                    the pick is kept (pending) and the dispatcher starts a run to learn it (plan, probe);
 *                                    `stale` is the build the last run of any deploy reported (towns built in full there
 *                                    keep being served at once: servingBuild)
 * A town admitted at an older build that no live run reports any more is moved to the learned build (rekeyStale).
 */
export type BuildView = { build: string | null; learned: boolean; stale: string | null; stamp: string | null };
export function buildView(d: BuilderDeps): BuildView {
  if (d.build) return { build: d.build(), learned: true, stale: null, stamp: null };
  if (d.cfg.build) return { build: d.cfg.build, learned: true, stale: null, stamp: null };
  const live = d.queue.liveWorkers().filter((x) => !!x.build);
  const newest = (ws: { build: string | null }[]) => ws.map((x) => x.build!).sort().at(-1) ?? null;
  const last = (stamp?: string) => (d.queue.db.prepare(`SELECT build FROM workers WHERE build IS NOT NULL${stamp ? ' AND deploy = ?' : ''} ORDER BY seen DESC LIMIT 1`)
    .get(...(stamp ? [stamp] : [])) as { build: string } | undefined)?.build ?? null;
  const stamp = d.stamp ?? null;
  // (no builder live: on-demand runs are up only while there is work. The build the last run reported, so a pick between
  // runs is never refused for want of one)
  if (!stamp) return { build: newest(live) ?? last(), learned: true, stale: null, stamp };
  const mine = newest(live.filter((x) => x.deploy === stamp)) ?? last(stamp);
  if (mine) return { build: mine, learned: true, stale: null, stamp };
  return { build: newest(live), learned: false, stale: last(), stamp };
}
export function currentBuild(d: BuilderDeps): string | null { return buildView(d).build; }
/** The build a town is SERVED at: the current one, or, while the current one is being learned, the stale build when the
 * town is built in full there (a built town needs no run: it plays at once, as it did before the redeploy). */
export function servingBuild(d: BuilderDeps, placeId: string): string | null {
  const v = buildView(d);
  if (v.build) return v.build;
  return v.stale && rowOf(d.queue, placeId, v.stale)?.state === 'full' ? v.stale : null;
}
/** The event logged at boot when the web's deploy has no build yet (buildView not learned): the dispatcher starts one run
 * to learn it at once (dispatch.ts plan, probe), before any pick. */
export const BUILD_LEARN = 'build-learn';
/** The event a pick logs when no build is known yet (no HOMETOWN_BUILD, no run ever): the dispatcher starts ONE run to
 * learn it (dispatch.ts plan, `probe`); the player is asked to try again in a minute. */
export const BUILD_UNKNOWN = 'build-unknown';
export const BUILD_UNKNOWN_RETRY_S = 15;

const ACTIVE: TownPhase[] = ['asked', 'framing', 'district', 'growing'];
const day = (t: number) => new Date(t).toISOString().slice(0, 10);
/** The address a limit counts, as stored: a hash, never the address itself. */
const ipKey = (ip: string) => createHash('sha256').update(`hometown-ip:${ip}`).digest('hex').slice(0, 32);

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
export function storyReadyLock(d: BuilderDeps, placeId: string, build: string | null = servingBuild(d, placeId)): ServiceLock | null {
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
  const now = (d.now ?? Date.now)(), elapsedS = Math.max(0, Math.round((now - r.first_asked) / 1000));
  const steps = stepsOf(jobs, done, total, r.state);
  // (r7: no builder up and nothing of this town running yet: one is being started for it, Render Workflows on demand)
  const starting = r.state === 'asked' && !steps.running && q.liveSlots() === 0 && !!d.runs;
  const stage = stageOf(r.state, steps, starting, reading, tiles.some((j) => j.state === 'done'));
  const h = honestEta(e, waitHistory(d), elapsedS, r.state);
  const out: Progress = {
    state: r.state === 'asked' ? 'queued' : r.state === 'framing' ? (reading ? 'reading' : 'compiling') : r.state === 'full' ? 'ready' : 'compiling',
    placeId: r.place, stage, done, total, position, etaS: r.state === 'growing' ? h.etaFullS : h.etaDriveS,
    phase: r.state, district: r.state === 'growing' || r.state === 'full', etaDriveS: r.state === 'growing' || r.state === 'full' ? 0 : h.etaDriveS, etaFullS: h.etaFullS,
    steps, pct: pctOf(steps, r.state), elapsedS, starting, slow: h.slow,
  };
  if (r.state === 'district' || r.state === 'growing') {
    const lock = storyReadyLock(d, r.place, r.build), pin = lock && storyLock(lock), pkg = pin ? cityPackageFromStore(d.store, pin) : null;
    if (pin && pkg) { out.lock = pin; out.town = summaryOf(pkg); }
    if (m.district) out.play = { build: r.build, tilesId: m.district.tilesId, variant: m.district.variant };
  }
  return out;
}

// ------------------------------------------------------------------------------- the Create card's honest progress (r7)
/** The town's build as counts (TownSteps): map areas (regions jobs: the areas each fetches), map sections (ctx jobs), the
 * plan (the frame: null without one), tiles stored, the district bundle, the whole town; jobs running now. */
export function stepsOf(jobs: Job[], done: number, total: number, phase: TownPhase): TownSteps {
  const of = (k: JobKind) => jobs.filter((j) => j.kind === k);
  const areas = (j: Job) => Math.max(1, ((j.args.regions as string[] | undefined) ?? []).length);
  const regions = of('regions'), ctx = of('ctx'), frame = of('frame');
  const bundles = of('bundle');
  return {
    regions: { done: regions.filter((j) => j.state === 'done').reduce((a, j) => a + areas(j), 0), total: regions.reduce((a, j) => a + areas(j), 0) },
    ctx: { done: ctx.filter((j) => j.state === 'done').length, total: ctx.length },
    frame: frame.length ? frame.some((j) => j.state === 'done') : null,
    tiles: { done, total },
    district: phase === 'growing' || phase === 'full' || bundles.some((j) => j.args.variant !== 'full' && j.state === 'done'),
    full: phase === 'full',
    running: jobs.filter((j) => j.state === 'leased').length,
  };
}
/** The card's stage words: the phase's, and inside 'asked' and 'framing' the step the town is on, with its count. */
export function stageOf(phase: TownPhase, s: TownSteps, starting: boolean, reading: boolean, anyTile: boolean): string {
  if (phase === 'asked') return starting ? STEP_WORDS.starting : PHASE_WORDS.asked;
  if (phase !== 'framing') return PHASE_WORDS[phase];
  if (s.regions.total && s.regions.done < s.regions.total) return `${STEP_WORDS.fetching}: ${s.regions.done} of ${s.regions.total} areas`;
  if (s.ctx.total && s.ctx.done < s.ctx.total) return `${STEP_WORDS.reading}: ${s.ctx.done} of ${s.ctx.total} sections`;
  if (reading) return PHASE_WORDS.framing;
  return !anyTile && s.frame === false ? STEP_WORDS.planning : STEP_WORDS.building;
}
/** How far the whole town is, 0..100, by its work: the map (areas, then sections) to 30, the plan to 35, the tiles to 95,
 * the whole town 100. Never 100 before the town is whole; the card keeps the highest it has shown. */
export function pctOf(s: TownSteps, phase: TownPhase): number {
  if (phase === 'full') return 100;
  const f = (x: { done: number; total: number }) => (x.total ? Math.min(1, x.done / x.total) : 1);
  let p = 2;
  if (phase !== 'asked') p = 2 + 18 * f(s.regions) + 10 * f(s.ctx) + (s.frame === false ? 0 : 5) + 60 * f(s.tiles);
  if (s.ctx.total && f(s.ctx) < 1 && s.tiles.done === 0) p = Math.min(p, 30);
  return Math.max(0, Math.min(97, Math.round(p)));
}

/**
 * What towns really took (r7): the recorded timings of the last towns built (first ask to drive, district_at, and to the
 * whole town, full_at; towns players and the owner asked for, within 14 days, under an hour), their medians, and how much
 * longer they took than the estimate promised them (meta.promised: the median of actual / promised, at least 1). With
 * fewer than 3 towns recorded, the live r6 builds measured on 14 Nov stand in (WAIT_SEED). Cached 15 s per queue.
 */
export type WaitHistory = { driveS: number; fullS: number; n: number; driveRatio: number; fullRatio: number };
/** (live r6, 14 Nov: Cedar Key, FL drive 201 s / whole 357 s; Bal Harbour, FL 215 s / 450 s) */
export const WAIT_SEED: { driveS: number; fullS: number }[] = [{ driveS: 201, fullS: 357 }, { driveS: 215, fullS: 450 }];
const median = (xs: number[]) => { const a = [...xs].sort((x, y) => x - y); const n = a.length; return n ? (n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2) : NaN; };
const histCache = new WeakMap<BuildQueue, { at: number; h: WaitHistory }>();
export function waitHistory(d: Pick<BuilderDeps, 'queue' | 'now'>): WaitHistory {
  const now = (d.now ?? Date.now)(), c = histCache.get(d.queue);
  if (c && now - c.at < 15_000 && now >= c.at) return c.h;
  const rows = d.queue.db.prepare(`SELECT first_asked, district_at, full_at, meta FROM towns WHERE source IN ('player', 'owner-test') AND first_asked > ?
    AND (district_at IS NOT NULL OR full_at IS NOT NULL) ORDER BY first_asked DESC LIMIT 20`).all(now - 14 * 86400_000) as Pick<TownRow, 'first_asked' | 'district_at' | 'full_at' | 'meta'>[];
  const drive: number[] = [], full: number[] = [], rd: number[] = [], rf: number[] = [];
  for (const r of rows) {
    const m = metaOf(r as TownRow);
    const ds = r.district_at != null ? (r.district_at - r.first_asked) / 1000 : r.full_at != null ? (r.full_at - r.first_asked) / 1000 : NaN;
    const fs = r.full_at != null ? (r.full_at - r.first_asked) / 1000 : NaN;
    if (ds > 0 && ds < 3600) { drive.push(ds); if (m.promised?.driveS) rd.push(ds / m.promised.driveS); }
    if (fs > 0 && fs < 3600) { full.push(fs); if (m.promised?.fullS) rf.push(fs / m.promised.fullS); }
  }
  const seeded = (xs: number[], k: 'driveS' | 'fullS') => (xs.length >= 3 ? xs : [...xs, ...WAIT_SEED.map((x) => x[k])]);
  const ratio = (xs: number[]) => (xs.length ? Math.min(6, Math.max(1, median(xs))) : 1);
  const h: WaitHistory = { driveS: Math.round(median(seeded(drive, 'driveS'))), fullS: Math.round(median(seeded(full, 'fullS'))), n: Math.max(drive.length, full.length), driveRatio: ratio(rd), fullRatio: ratio(rf) };
  histCache.set(d.queue, { at: now, h });
  return h;
}
/** A town past this share of the median wait is slow: the card says so and stops giving a time it cannot back. */
export const SLOW_PAST = 1.25;
/** Never shown as less than this while a step is still to come (s). */
export const ETA_FLOOR_S = 15;
/**
 * The waits the card shows (r7): never less than history says. The estimate (the work ahead in the queue and the live
 * slots: estimate) scaled by how far towns overran it (WaitHistory ratios), and never under what the median town still
 * had to go at this point (its median minus the time this town has waited). `slow`: past SLOW_PAST x the median already.
 * The admission rule and meta.promised keep the plain estimate, so the ratio stays measured against it.
 */
export function honestEta(e: { etaDriveS: number | null; etaFullS: number | null }, h: WaitHistory, elapsedS: number, phase: TownPhase | 'pending'): { etaDriveS: number | null; etaFullS: number | null; slow: boolean } {
  const drivable = phase === 'growing' || phase === 'full';
  const drive = drivable ? 0 : e.etaDriveS == null ? null : Math.max(ETA_FLOOR_S, Math.round(e.etaDriveS * h.driveRatio), Math.round(h.driveS - elapsedS));
  const full = phase === 'full' ? 0 : e.etaFullS == null ? null : Math.max(ETA_FLOOR_S, drive ?? 0, Math.round(e.etaFullS * h.fullRatio), Math.round(h.fullS - elapsedS));
  const slow = drivable ? elapsedS > h.fullS * SLOW_PAST : elapsedS > h.driveS * SLOW_PAST;
  return { etaDriveS: drive, etaFullS: full, slow };
}

/** The spawn district's tile window: the frame's; without the frame (compiler 0.5.0) the anchor's 5 x 5; null while a
 * frame is still to come (a failed tile then waits for the frame to say whether it is the district's). */
export function districtOf(d: Pick<BuilderDeps, 'cfg'>, m: TownMeta): [number, number, number, number] | null {
  if (m.districtWindow) return m.districtWindow;
  if (d.cfg.frame || !m.anchor) return null;
  const [ac, ar] = m.anchor;
  return [ac - DISTRICT_RADIUS, ar - DISTRICT_RADIUS, ac + DISTRICT_RADIUS, ar + DISTRICT_RADIUS];
}
const inWindow = (j: Pick<Job, 'args'>, w: [number, number, number, number]) => tilesOfJob(j.args).some(([c, rr]) => c >= w[0] && c <= w[2] && rr >= w[1] && rr <= w[3]);
/** The failed jobs that fail the town: any but a tile job outside the spawn district (that one only degrades it). */
export function fatalFailures(d: Pick<BuilderDeps, 'cfg'>, m: TownMeta, jobs: Job[]): Job[] {
  const w = districtOf(d, m);
  return jobs.filter((j) => j.state === 'failed' && (j.kind !== 'tiles' || (w != null && inWindow(j, w))));
}

/** Recompute a town's phase from its jobs (failed when a job it waits on failed for good, a degradable tile aside). */
function refresh(d: BuilderDeps, r: TownRow): TownRow {
  if (r.state === 'full' || r.state === 'failed') return r;
  const jobs = d.queue.jobsOf(r.place).filter((j) => j.build === r.build || j.build === ANY_BUILD);
  const fatal = fatalFailures(d, metaOf(r), jobs);
  if (fatal.length) {
    const m = metaOf(r);
    m.failed = { key: fatal[0].key, why: fatal[0].error ? fatal[0].error.slice(0, 300) : null, at: d.queue.now() };
    setTown(d.queue, r.place, r.build, { state: 'failed', meta: m });
    d.queue.log('town-failed', { place: r.place, build: r.build, job: fatal[0].key });
    return { ...r, state: 'failed', meta: JSON.stringify(m) };
  }
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
  if (pendingOf(d.queue, placeId)) { admitPending(d); const p = pendingAnswer(d, placeId); if (p) return p; }
  const build = servingBuild(d, placeId);
  const r = build ? rowOf(d.queue, placeId, build) : undefined;
  if (!r) return { status: 404, body: { placeId, error: 'This town has not been asked for.' } };
  return answer(d, r);
}

// --------------------------------------------------------------------------------------- picks with no build yet
/** A pick waits this long for its run to report the build; then it is refused (busy) and forgotten. */
export const PENDING_MAX_MS = 10 * 60_000;
type PendingRow = { place: string; source: TownSource; asked: number };
const pendingOf = (q: BuildQueue, place: string) => q.db.prepare('SELECT * FROM pending WHERE place = ?').get(place) as PendingRow | undefined;
/** A pending pick's answer: 202 'asked' (the run is starting), or the refusal once it waited PENDING_MAX_MS; null when
 * it is no longer pending (admitted). */
function pendingAnswer(d: BuilderDeps, placeId: string): TownAnswer | null {
  const p = pendingOf(d.queue, placeId);
  if (!p) return null;
  const now = (d.now ?? Date.now)();
  if (now - p.asked > PENDING_MAX_MS) {
    d.queue.db.prepare('DELETE FROM pending WHERE place = ?').run(placeId);
    return { status: 503, body: { placeId, error: TOWN_WORDS.busy } };
  }
  const e = estimate(d, '\u0000new', '');
  const position = (d.queue.db.prepare('SELECT COUNT(*) n FROM pending WHERE asked < ?').get(p.asked) as { n: number }).n + 1;
  // (r7: no build known yet: a builder is being started to learn it; the waits as history says, from the pick)
  const elapsedS = Math.max(0, Math.round((now - p.asked) / 1000)), h = honestEta(e, waitHistory(d), elapsedS, 'pending');
  const steps: TownSteps = { regions: { done: 0, total: 0 }, ctx: { done: 0, total: 0 }, frame: null, tiles: { done: 0, total: 0 }, district: false, full: false, running: 0 };
  return { status: 202, body: { state: 'queued', placeId, stage: STEP_WORDS.starting, done: 0, total: 0, position, etaS: h.etaDriveS, phase: 'asked', district: false, etaDriveS: h.etaDriveS, etaFullS: h.etaFullS, steps, pct: 1, elapsedS, starting: true, slow: h.slow } };
}
/**
 * The picks kept while no build was known, admitted now that one is (the worker protocol calls this on every claim,
 * after recording the claiming worker's build, so the run started for them takes their first job in that same claim).
 * -> how many were admitted.
 */
export function admitPending(d: BuilderDeps): number {
  const rows = d.queue.db.prepare('SELECT * FROM pending ORDER BY asked LIMIT 50').all() as PendingRow[];
  if (!rows.length) return 0;
  const build = currentBuild(d);
  if (!build) return 0;
  let n = 0;
  for (const p of rows) {
    d.queue.db.prepare('DELETE FROM pending WHERE place = ?').run(p.place);
    const place = (d.place ?? ((id: string) => placeById(id)))(p.place);
    if (!place || rowOf(d.queue, p.place, build)) continue;
    try {
      enqueueTown(d, place, build, p.source, p.asked, false);
      const r = rowOf(d.queue, p.place, build)!, e = estimate(d, p.place, build);
      setTown(d.queue, p.place, build, { meta: { ...metaOf(r), promised: { driveS: e.etaDriveS, fullS: e.etaFullS } } });
      d.queue.log('admitted', { place: p.place, build, waitedMs: d.queue.now() - p.asked });
      n++;
    } catch (e) { console.error('hometown-build: admit', p.place, String((e as Error).message).slice(0, 200)); }
  }
  return n;
}

/**
 * Towns admitted at an older build that no run can claim any more, moved to the current build (14 Nov). A workflow
 * redeploy (a compiler upgrade) changes the build its runs report; a town admitted at the old build (by a run of the old
 * deploy still live while the new one was learned) would otherwise wait for good once no old run is left. Only when the
 * current build is LEARNED (a run of this web's deploy reported it) and is not the owner's pin (a pin is the shadow
 * upgrade: the owner moves it), and only towns no live run reports the build of. A town not yet playable (asked,
 * framing) is moved whole; a playable one (district, growing) keeps its row and its district bundle (a story pinned to it
 * plays it) and is built whole at the new build. The old build's unfinished jobs it wanted are dropped when no other
 * town wants them. The dispatcher's pass and every claim call this. -> how many towns moved.
 */
export const REKEY_MAX_AGE_MS = 24 * 3600_000;
export function rekeyStale(d: BuilderDeps): number {
  if (d.build || d.cfg.build) return 0;
  const v = buildView(d);
  if (!v.learned || !v.build) return 0;
  const cur = v.build, q = d.queue;
  // (towns asked within a day: one left half built at a build abandoned long ago is nobody's wait, and is not paid for
  // again; it is built at the current build when it is asked again, as any town is)
  const rows = q.db.prepare("SELECT * FROM towns WHERE build != ? AND state IN ('asked', 'framing', 'district', 'growing') AND first_asked > ?").all(cur, q.now() - REKEY_MAX_AGE_MS) as TownRow[];
  if (!rows.length) return 0;
  const live = new Set(q.liveWorkers().map((w) => w.build).filter((b): b is string => !!b));
  let n = 0;
  for (const r of rows) {
    const m = metaOf(r);
    if (live.has(r.build) || m.movedTo) continue;
    const place = (d.place ?? ((id: string) => placeById(id)))(r.place);
    try {
      q.tx(() => {
        for (const j of q.jobsOf(r.place).filter((x) => x.build === r.build && x.state !== 'done')) {
          q.db.prepare('DELETE FROM wants WHERE job = ? AND place = ?').run(j.key, r.place);
          if (!q.db.prepare('SELECT 1 FROM wants WHERE job = ?').get(j.key)) q.db.prepare('DELETE FROM jobs WHERE key = ?').run(j.key);
        }
        if (r.state === 'asked' || r.state === 'framing') q.db.prepare('DELETE FROM towns WHERE place = ? AND build = ?').run(r.place, r.build);
        else setTown(q, r.place, r.build, { meta: { ...m, movedTo: cur } });
        if (place && !rowOf(q, r.place, cur)) enqueueTown(d, place, cur, r.source, r.first_asked, false);
      });
      q.log('town-rekeyed', { place: r.place, from: r.build, to: cur, state: r.state });
      n++;
    } catch (e) { console.error('hometown-build: rekey', r.place, String((e as Error).message).slice(0, 200)); }
  }
  if (n) q.changed();
  return n;
}

/** POST /api/towns: a built town at once, its build joined, a new build admitted, or a refusal. */
export function requestTown(d: BuilderDeps, placeId: string, ip: string, source: TownSource = 'player'): TownAnswer {
  if (typeof placeId !== 'string' || !TOWN_ID.test(placeId)) return { status: 400, body: { error: TOWN_WORDS.unknown } };
  const place = (d.place ?? ((id: string) => placeById(id)))(placeId);
  if (!place) return { status: 404, body: { placeId, error: TOWN_WORDS.unknown } };
  // (on-demand builders switched on but none can start (the owner's status page shows the runs problem): a town built in
  // full is served as ever; any other pick is refused at once, with no retryS, never left waiting its turn for a run
  // that cannot come)
  if (d.runsDown) {
    const b = servingBuild(d, placeId), row = b ? rowOf(d.queue, placeId, b) : undefined;
    if (!row || row.state !== 'full') return { status: 503, body: { placeId, error: TOWN_WORDS.closed } };
  }
  const build = currentBuild(d);
  const q = d.queue, now = (d.now ?? Date.now)();
  const perIp = Number(process.env.HOMETOWN_PER_IP_HOUR) > 0 ? Number(process.env.HOMETOWN_PER_IP_HOUR) : 3;
  const ipk = ipKey(ip);
  if (!build) {
    // (a town built in full at the build the runs reported before a workflow redeploy: served at once, as before; a run
    // is needed only for a town still to be built)
    const v = buildView(d), old = v.stale ? rowOf(q, placeId, v.stale) : undefined;
    if (old?.state === 'full') return answer(d, old);
    // (kept, answered 202 at once: the dispatcher starts ONE run (dispatch.ts plan, probe) whose first claim admits the
    // pick at the build it reports and takes its first job: admitPending. Only the address limit applies here: nothing
    // is building, so the queue's limits are moot)
    if (!pendingOf(q, placeId)) {
      if (source === 'player') {
        if (q.ipCount(ipk, now - 3600_000, placeId) >= perIp) return { status: 429, body: { placeId, error: TOWN_WORDS.busy } };
        q.ipHit(ipk, now, placeId);
      }
      q.db.prepare('INSERT OR IGNORE INTO pending (place, source, asked) VALUES (?, ?, ?)').run(placeId, source, now);
    }
    q.log(BUILD_UNKNOWN, { place: placeId });
    q.changed();
    return pendingAnswer(d, placeId) ?? { status: 503, body: { placeId, error: TOWN_WORDS.busy } };
  }
  if (pendingOf(q, placeId)) admitPending(d);
  const had0 = rowOf(q, placeId, build);
  // (refreshed: a row still 'framing' whose job failed is a failed town, retried below)
  const had = had0 ? refresh(d, had0) : undefined;
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
  if (source === 'player') {
    const waiting = (q.db.prepare("SELECT COUNT(*) n FROM towns WHERE build = ? AND state IN ('asked', 'framing') AND source != 'prewarm'").get(build) as { n: number }).n;
    const near = () => nearestBuilt(d, place, build);
    if (waiting >= queueMax) return { status: 503, body: { placeId, error: TOWN_WORDS.busy, nearby: near() } };
    const today = (q.db.prepare("SELECT COUNT(*) n FROM towns WHERE source = 'player' AND first_asked >= ?").get(Date.parse(`${day(now)}T00:00:00Z`)) as { n: number }).n;
    if (today >= dailyCold) return { status: 503, body: { placeId, error: TOWN_WORDS.busy, nearby: near() } };
    // (towns, not asks: a town this address already asked for this hour, failed and asked again ("Try again"), is not a
    // new town, so it is never refused by this limit; the hit is kept once per town)
    if (q.ipCount(ipk, now - 3600_000, placeId) >= perIp) return { status: 429, body: { placeId, error: TOWN_WORDS.busy, nearby: near() } };
    // admission: the wait to drive this town would have, were it admitted now
    const e = estimate(d, '\u0000new', build);
    if (e.etaDriveS != null && e.etaDriveS > d.cfg.maxWaitS) {
      const min = Math.max(1, Math.round(e.etaDriveS / 60));
      return { status: 503, body: { placeId, error: BUSY_WORDS(min), waitMin: min, nearby: near() } };
    }
    if (!q.ipAsked(ipk, now - 3600_000, placeId)) q.ipHit(ipk, now, placeId);
  }
  if (d.store.fullReason(32 * 1024 * 1024)) return { status: 507, body: { placeId, error: TOWN_WORDS.failed } };
  // (a failed town asked again, the Create card's "Try again": its failed jobs are queued again NOW, not after the 60 s
  // a failure holds a job for other towns' asks; without this the re-ask joined the same failed jobs and got nothing)
  if (had?.state === 'failed') {
    const again = q.retryFailed(placeId);
    const m = metaOf(had); delete m.failed;
    setTown(q, placeId, build, { meta: m });
    q.log('town-retry', { place: placeId, build, jobs: again.length });
  }
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
  // (the Overture release the build reads is in its build record, stored by the build's first run before it claims. A
  // pinned build on an empty store has none yet at the pick: its regions jobs are then bound to the build (only its runs
  // claim them) with no release, filled in at the claim from the claiming run's record (server.ts argsOf and the claim), so the
  // pick still stages its regions first instead of each compile finding them missing one exit 3 at a time)
  const rel = releaseIn(d.store, build), dom = g.stage.domain;
  const regionDeps: string[] = [];
  // (the job that stages each region: a ctx block (C, R) reads exactly region (C, R) (compile.py --ctx loads its own
  // block only), so each ctx waits for ITS region alone and starts while the town's other regions are still fetched;
  // the tiles and the frame read the regions round them (3.2 km), so they wait for all of the town's)
  const regionJob = new Map<string, string>();
  {
    const fresh: [number, number][] = [];
    for (const [C, R] of townRegions(g.stage)) {
      if (rel && d.store.has(srcKey(rel, dom as Domain, C, R, 'files.json'))) continue;
      const k = q.regionsActive(dom, C, R);
      if (k) { regionDeps.push(k); regionJob.set(`${C},${R}`, k); } else fresh.push([C, R]);
    }
    // (the town's own ctx blocks' regions first: the first regions job then unblocks the ctx, and so the frame's inputs)
    const own = new Set(g.specs.filter((s) => s.kind === 'ctx').map((s) => { const [, , C, R] = String(s.args.ctx).split('/'); return `${C},${R}`; }));
    fresh.sort((a, b) => Number(own.has(`${b[0]},${b[1]}`)) - Number(own.has(`${a[0]},${a[1]}`)));
    const base = source === 'prewarm' ? 5 : source === 'rebuild' ? 3 : 0;
    const regionSpecs: EnqueueSpec[] = [];
    for (let i = 0; i < fresh.length; i += 4) {
      const list = fresh.slice(i, i + 4).map(([C, R]) => `${C},${R}`).join(';');
      const key = rel ? `regions:${rel}:hg1-${dom}:${list}` : `regions:@${build}:hg1-${dom}:${list}`;
      regionDeps.push(key);
      for (const [C, R] of fresh.slice(i, i + 4)) regionJob.set(`${C},${R}`, key);
      regionSpecs.push({ key, kind: 'regions', build: rel ? ANY_BUILD : build, prio: base, ring: 0, weight: 2, args: { release: rel, spec: `${dom}:${list}`, regions: fresh.slice(i, i + 4).map(([C, R]) => `${dom}/${C}/${R}`) }, place: place.placeId, firstAsked: now });
    }
    if (regionSpecs.length) q.enqueueMany(regionSpecs);
  }
  if (regionDeps.length) for (const s of g.specs) {
    if (s.kind === 'ctx') {
      const [, , C, R] = String(s.args.ctx).split('/');
      const k = regionJob.get(`${C},${R}`);
      if (k) s.deps = [...new Set([...(s.deps ?? []), k])];
    } else if (s.kind === 'tiles' || s.kind === 'frame') s.deps = [...new Set([...(s.deps ?? []), ...regionDeps])];
  }
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
      m.districtWindow = [...f.spawnDistrict] as [number, number, number, number];
      // (compiler 0.8.0: a capped town's frame pins its downtown-centred box, not stage 1's; the frame is the truth)
      if (!sameTiles(f.tiles, m.tiles)) retileToFrame(d, r, f, m);
      // (the full bundle never lays the spawn district as flat ground: args.keep. One already degraded over a district
      // tile (it failed before the frame said where the district is) fails now, with the town below, instead of
      // assembling a town with a flat downtown that would then be served as ready)
      for (const fb of q.jobsOf(place).filter((x) => x.kind === 'bundle' && x.args.variant === 'full' && x.build === r.build && x.state === 'queued')) {
        q.mergeArgs(fb.key, { keep: m.districtWindow });
        const flat = ((fb.args.absent as string[] | undefined) ?? []).filter((t) => tileInWindow(t, m.districtWindow));
        if (flat.length) q.failNow(fb.key, `spawn district tile(s) could not be built: ${flat.slice(0, 4).join(', ')}`);
      }
      // (a tile of the spawn district failed for good before the frame said where the district is: the town fails now,
      // clearly, instead of a district bundle compiling that tile again and failing three attempts later)
      const deadInDistrict = fatalFailures(d, m, q.jobsOf(place).filter((x) => x.kind === 'tiles' && x.build === r.build));
      if (deadInDistrict.length) {
        m.failed = { key: deadInDistrict[0].key, why: deadInDistrict[0].error ? `a spawn district tile: ${deadInDistrict[0].error}`.slice(0, 300) : 'a spawn district tile could not be built', at: q.now() };
        setTown(q, place, r.build, { state: 'failed', frame_at: q.now(), meta: m });
        q.log('town-failed', { place, build: r.build, job: deadInDistrict[0].key, district: true });
        continue;
      }
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
        // (a degraded town: built whole, these tiles laid as flat ground)
        const absent = (j.args.absent as string[] | undefined) ?? [];
        // (never a town whose spawn district is flat ground for want of a tile that failed: args.keep prevents it; this is
        // the last guard. A tile the compile refused (no DEM under it: out at sea) is flat ground anywhere, by design)
        const noDem = new Set(m.refused ?? []), w = districtOf(d, m), flat = w ? absent.filter((t) => tileInWindow(t, w) && !noDem.has(t)) : [];
        if (flat.length) {
          m.failed = { key: j.key, why: `the full bundle laid spawn district tile(s) as flat ground: ${flat.slice(0, 4).join(', ')}`, at: q.now() };
          setTown(q, place, r.build, { state: 'failed', meta: m });
          q.log('town-failed', { place, build: r.build, job: j.key, flatDistrict: flat.length });
          continue;
        }
        m.full = { tilesId: k.tilesId! };
        // (built whole: a town failed earlier (its district bundle) plays in full now)
        delete m.failed;
        if (absent.length) { m.absent = absent; q.log('town-degraded', { place, build: r.build, absent: absent.length }); } else delete m.absent;
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

const sameTiles = (a: string[] | undefined, b: string[] | undefined) => !!a && !!b && a.length === b.length && new Set([...a, ...b]).size === a.length;

/**
 * A town whose frame pins other tiles than stage 1 did (compiler 0.8.0: a capped place's box centred on its downtown,
 * MogCity assemble.py downtown_box): its tile set becomes the frame's. The frame's ctx and tile jobs are enqueued (the
 * block merge adds only the bits not covered), the town stops wanting the tile jobs that build none of the frame's
 * tiles (dropped when no other town wants them and they have not started), and the full bundle waits on the new set.
 * New ctx blocks read map regions that may not be staged: their worker exits 3 and the queue makes the regions job.
 */
export function retileToFrame(d: BuilderDeps, r: Pick<TownRow, 'place' | 'build' | 'source' | 'first_asked'>, f: TownFrame, m: TownMeta) {
  const q = d.queue, place = r.place, build = r.build;
  const domain = String(f.tiles[0] ?? '').split('/')[0].slice(4) || m.domain || 'conus';
  const base = r.source === 'prewarm' ? 5 : r.source === 'rebuild' ? 3 : 0;
  const [sc, sr] = f.spawn.tile;
  const want = new Set(f.tiles), before = m.tiles?.length ?? 0;
  q.tx(() => {
    const g = tileGraph(place, { tiles: f.tiles, domain: domain as Stage1['domain'] }, build, sc, sr, { base, now: r.first_asked });
    q.enqueueMany(g.specs.filter((x) => x.kind === 'ctx'));
    const tileKeys = q.enqueueMany(g.specs.filter((x) => x.kind === 'tiles')).flat();
    const dropped: string[] = [];
    for (const t of q.jobsOf(place).filter((x) => x.kind === 'tiles' && x.build === build)) {
      if (tilesOfJob(t.args).some(([c, rr]) => want.has(`hg1-${domain}/0/${c}/${rr}`))) continue;
      q.db.prepare('DELETE FROM wants WHERE job = ? AND place = ?').run(t.key, place);
      dropped.push(t.key);
      if (t.state === 'queued' && !q.db.prepare('SELECT 1 FROM wants WHERE job = ?').get(t.key)) q.db.prepare('DELETE FROM jobs WHERE key = ?').run(t.key);
    }
    const full = q.jobsOf(place).find((x) => x.kind === 'bundle' && x.args.variant === 'full' && x.build === build);
    if (full) {
      const deps = [...new Set([...full.deps.filter((k) => !dropped.includes(k)), ...tileKeys, ...g.ctxs.values()])];
      q.db.prepare('UPDATE jobs SET deps = ?, args = ?, updated = ? WHERE key = ?').run(JSON.stringify(deps), JSON.stringify({ ...full.args, tiles: f.tiles.length }), q.now(), full.key);
    }
    m.tiles = [...f.tiles];
    q.db.prepare('UPDATE towns SET tiles_total = ? WHERE place = ? AND build = ?').run(f.tiles.length, place, build);
    q.log('retile', { place, build, before, after: f.tiles.length, dropped: dropped.length });
  });
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
  // (the whole town's once built, else the spawn district's; a variant whose bundle is not stored is passed over)
  const pick = [m.full ? { variant: 'full', tilesId: m.full.tilesId } : null, m.district ? { variant: m.district.variant, tilesId: m.district.tilesId } : null]
    .find((v) => v && d.store.has(bundleKey(build, placeId, v.tilesId, v.variant, 'bundle.json'))) ?? null;
  if (!pick) return null;
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
  // (degraded: built whole with tiles laid as flat ground; failed: why, the job and its error)
  const pick = (state: string, has: (m: TownMeta) => boolean) => (d.queue.db.prepare('SELECT place, build, meta, first_asked FROM towns WHERE state = ? ORDER BY first_asked DESC LIMIT 200').all(state) as { place: string; build: string; meta: string; first_asked: number }[])
    .map((r) => ({ r, m: metaOf(r as unknown as TownRow) })).filter((x) => has(x.m));
  const degraded = pick('full', (m) => !!m.absent?.length);
  const failed = pick('failed', () => true);
  const pending = (d.queue.db.prepare('SELECT COUNT(*) n FROM pending').get() as { n: number }).n;
  return { byState: rows, pending,
    degraded: { n: degraded.length, recent: degraded.slice(0, 10).map(({ r, m }) => ({ place: r.place, name: m.name ?? null, build: r.build, absent: m.absent!.length, tiles: m.absent!.slice(0, 8) })) },
    failed: failed.slice(0, 10).map(({ r, m }) => ({ place: r.place, name: m.name ?? null, build: r.build, job: m.failed?.key ?? null, why: m.failed?.why ?? null, at: m.failed?.at ?? null })),
    recent: ttfd.map((r) => ({ ...r, toFrameS: r.frame_at ? Math.round((Number(r.frame_at) - Number(r.first_asked)) / 1000) : null, toDistrictS: r.district_at ? Math.round((Number(r.district_at) - Number(r.first_asked)) / 1000) : null, toFullS: r.full_at ? Math.round((Number(r.full_at) - Number(r.first_asked)) / 1000) : null })) };
}

/** A legacy bundle folder (data/towns/bundles, the in-process builder's) still readable: G12 keeps it, read-only. */
export const legacyBundlesDir = (dataDir: string) => `${dataDir}/towns/bundles`;
export const hasLegacyBundles = (dataDir: string) => existsSync(legacyBundlesDir(dataDir));
export const readText = (f: string) => { try { return readFileSync(f, 'utf8'); } catch { return null; } };
