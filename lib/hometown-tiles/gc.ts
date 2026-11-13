/**
 * Hometown store GC: "cache forever", with guards. A plan is always made first (a dry run: what would go, and how
 * many bytes); it deletes only when applied with the same plan's id, so nothing is removed that the owner did not see.
 *
 * Never collected:
 *   current   the build(s) this server serves new towns from (HOMETOWN_BUILD; else the newest build in the store)
 *   pinned    every build any world names: a published game in gamemog.db, or a Story Kit pack or sealed world in
 *             data/storykit, drafts included (pins.ts). A Mog's lock (base.hometown) points at its build's tiles, so a
 *             pinned build keeps every object it has
 * Collectable: every other build, whole, least recently served first (the store's access journal; a build never
 * served counts from its newest file). With a target, builds go until the store is at or under it; without one,
 * every collectable build goes. Temp files a killed writer left, an hour old or more, always go.
 * If the pins could not be read, the plan refuses to delete anything (a guard must never fail open).
 *
 * The shared sources (production builder, SPEC 3.1): staged Overture regions (src/) are never pinned (a region can be
 * fetched again while its release is on S3), and are collected least recently served first, whole regions at a time,
 * until they are at or under HOMETOWN_SRC_CAP_GB (srcCapBytes). The DEM mirror (dem/) is small and never collected.
 * Bundles, frames and far tiles belong to their build and follow its pins like tiles do.
 */
import { createHash } from 'node:crypto';
import type { TileStore, Entry } from './store.ts';
import { buildOfKey } from './keys.ts';

export type GcBuild = { buildId: string; objects: number; bytes: number; lastServed: number | null; newestFile: number; status: 'current' | 'pinned' | 'collect' | 'keep' };
export type GcPlan = {
  planId: string;
  at: number;
  totalBytes: number;
  targetBytes: number | null;
  builds: GcBuild[];
  delete: { keys: string[]; bytes: number; builds: string[]; regions?: string[] };
  /** the staged source regions: their bytes, the cap, and how many the plan collects */
  src?: { regions: number; bytes: number; capBytes: number | null; collect: number };
  tmp: { keys: string[]; bytes: number };
  afterBytes: number;
  pinsOk: boolean;
  pinSources: string[];
  /** how the current build(s) were chosen: HOMETOWN_BUILD, or the newest record and newest file both (http.ts) */
  currentFrom?: string;
  refused?: string;
};

export function planGc(o: {
  entries: Entry[]; tmp?: Entry[]; current: string[]; pins: Set<string>; pinsOk: boolean; pinSources?: string[];
  lastServed?: Map<string, number>; targetBytes?: number | null; now?: number; currentFrom?: string; srcCapBytes?: number | null;
}): GcPlan {
  // (a target that is not a number of bytes, 0 or more (NaN from "--target-gb abc"), compared false with every size and
  // planned to collect every unpinned build: such a plan collects nothing and says why)
  const badTarget = o.targetBytes != null && !(Number.isFinite(o.targetBytes) && o.targetBytes >= 0);
  const now = o.now ?? Date.now();
  const by = new Map<string, { keys: string[]; bytes: number; newest: number }>();
  const regions = new Map<string, { keys: string[]; bytes: number; newest: number }>();
  for (const e of o.entries) {
    if (e.key.startsWith('src/')) {
      const rk = e.key.split('/').slice(2, 7).join('/');
      const g = regions.get(rk) ?? { keys: [], bytes: 0, newest: 0 };
      g.keys.push(e.key); g.bytes += e.bytes; g.newest = Math.max(g.newest, e.mtimeMs);
      regions.set(rk, g);
      continue;
    }
    const b = buildOfKey(e.key);
    if (!b) continue;
    const g = by.get(b) ?? { keys: [], bytes: 0, newest: 0 };
    g.keys.push(e.key); g.bytes += e.bytes; g.newest = Math.max(g.newest, e.mtimeMs);
    by.set(b, g);
  }
  const total = o.entries.reduce((a, e) => a + e.bytes, 0) + (o.tmp ?? []).reduce((a, e) => a + e.bytes, 0);
  const builds: GcBuild[] = [...by].map(([buildId, g]) => ({
    buildId, objects: g.keys.length, bytes: g.bytes, lastServed: o.lastServed?.get(buildId) ?? null, newestFile: g.newest,
    status: o.current.includes(buildId) ? 'current' : o.pins.has(buildId) ? 'pinned' : 'keep',
  }));
  const oldTmp = (o.tmp ?? []).filter((e) => now - e.mtimeMs >= 3600_000);
  const tmpBytes = oldTmp.reduce((a, e) => a + e.bytes, 0);
  // least recently served first; a build never served by its newest file
  const order = builds.filter((b) => b.status === 'keep').sort((a, b) => (a.lastServed ?? a.newestFile) - (b.lastServed ?? b.newestFile) || (a.buildId < b.buildId ? -1 : 1));
  const target = badTarget ? null : o.targetBytes ?? null;
  let after = total - tmpBytes;
  const del: GcBuild[] = [];
  if (o.pinsOk && !badTarget) {
    for (const b of order) {
      if (target != null && after <= target) break;
      del.push(b); b.status = 'collect'; after -= b.bytes;
    }
  }
  // the staged regions over their own cap, least recently served first (never pinned: they can be fetched again)
  const srcBytes = [...regions.values()].reduce((a, g) => a + g.bytes, 0);
  const srcCap = o.srcCapBytes != null && Number.isFinite(o.srcCapBytes) && o.srcCapBytes >= 0 ? o.srcCapBytes : null;
  const srcDel: string[] = [];
  if (srcCap != null && !badTarget) {
    let left = srcBytes;
    const old = [...regions].sort((a, b) => (o.lastServed?.get(`src:${a[0]}`) ?? a[1].newest) - (o.lastServed?.get(`src:${b[0]}`) ?? b[1].newest) || (a[0] < b[0] ? -1 : 1));
    for (const [rk, g] of old) { if (left <= srcCap) break; srcDel.push(rk); left -= g.bytes; after -= g.bytes; }
  }
  const keys = [...del.flatMap((b) => by.get(b.buildId)!.keys), ...srcDel.flatMap((rk) => regions.get(rk)!.keys)];
  const plan: Omit<GcPlan, 'planId'> = {
    at: now, totalBytes: total, targetBytes: target, builds: builds.sort((a, b) => (a.buildId < b.buildId ? -1 : 1)),
    delete: { keys, bytes: del.reduce((a, b) => a + b.bytes, 0) + srcDel.reduce((a, rk) => a + regions.get(rk)!.bytes, 0), builds: del.map((b) => b.buildId), regions: srcDel },
    src: { regions: regions.size, bytes: srcBytes, capBytes: srcCap, collect: srcDel.length },
    tmp: { keys: badTarget ? [] : oldTmp.map((e) => e.key), bytes: badTarget ? 0 : tmpBytes }, afterBytes: badTarget ? total : after, pinsOk: o.pinsOk, pinSources: o.pinSources ?? [],
    ...(o.currentFrom ? { currentFrom: o.currentFrom } : {}),
    ...(!o.pinsOk ? { refused: 'the pins could not all be read: nothing is collected' } : badTarget ? { refused: `the target ${String(o.targetBytes)} is not a number of bytes, 0 or more: nothing is collected` } : {}),
  };
  // (the id covers exactly what would be deleted: apply refuses if the store or the pins moved since the dry run)
  const planId = createHash('sha256').update(JSON.stringify([plan.delete.keys, plan.tmp.keys])).digest('hex').slice(0, 16);
  return { planId, ...plan };
}

/** Delete what the plan names; only when `planId` is the plan's own (made just now from the same store and pins). */
export function applyGc(store: TileStore, plan: GcPlan, planId: string): { deleted: number; bytes: number } {
  if (!plan.pinsOk || plan.refused) throw new Error(plan.refused ?? 'pins not read');
  if (planId !== plan.planId) throw new Error(`plan ${planId} is not the current plan ${plan.planId}: run the dry run again`);
  let n = 0, bytes = 0;
  for (const k of plan.delete.keys) { bytes += store.delete(k); n++; }
  for (const k of plan.tmp.keys) { bytes += store.removeTmp(k); n++; }
  return { deleted: n, bytes };
}
