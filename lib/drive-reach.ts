/**
 * A test drive's reach failure as the creator's browser reports it (public/storykit/work.js `reach`, from Mog City's
 * mission-fail: MogCity wagmi/storyrun/reach.js): a step no player could do, and where. Read strictly here; what the
 * builder does with it is lib/storykit-reach.ts; what every story built in a town learns from it is townUnreachable here
 * (read by the builder, lib/storykit-build.ts, and the report's reader, lib/storykit-publish.ts).
 */
import { db } from './db';
import { withUnreachable, type Mark } from '../storykit/hometown/approach.ts';
import type { CityPackage } from '../storykit/hometown/city-package.ts';
import type { HometownLock } from '../storykit/pack/cities.ts';

export const REACH_WHY = ['inside', 'water', 'enclosed', 'off-road', 'noclip', 'blocked', 'spawn'] as const;
export type DriveReach = { mission: string; step: number; type: string | null; at?: string; place?: string; kind?: string; name?: string; why: typeof REACH_WHY[number]; x?: number; z?: number; mode?: 'person' | 'car' };

const KEY = /^[a-z0-9][a-z0-9_-]{0,39}$/, ID = /^[A-Za-z0-9_.-]{1,40}$/;
/** A report's reach (Mog City's mission-fail, carried by work.js), every field read for what it must be; null otherwise. */
export function readReach(x: unknown): DriveReach | null {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return null;
  const r = x as Record<string, unknown>;
  if (typeof r.mission !== 'string' || !ID.test(r.mission) || !Number.isInteger(r.step) || (r.step as number) < -1 || (r.step as number) > 400) return null;
  if (!REACH_WHY.includes(r.why as DriveReach['why'])) return null;
  const word = (v: unknown, re: RegExp) => (typeof v === 'string' && re.test(v) ? v : undefined);
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && Math.abs(v) < 1e6 ? Math.round(v * 10) / 10 : undefined);
  const out: DriveReach = { mission: r.mission, step: r.step as number, type: word(r.type, /^[a-zA-Z]{1,24}$/) ?? null, why: r.why as DriveReach['why'] };
  const at = word(r.at, KEY), place = word(r.place, KEY), kind = word(r.kind, /^[a-z0-9_:.=-]{1,60}$/), name = typeof r.name === 'string' ? r.name.replace(/[<>]/g, '').slice(0, 60) : undefined;
  const mode = r.mode === 'person' || r.mode === 'car' ? r.mode : undefined;
  return { ...out, ...(at ? { at } : {}), ...(place ? { place } : {}), ...(kind ? { kind } : {}), ...(name ? { name } : {}), ...(num(r.x) != null ? { x: num(r.x) } : {}), ...(num(r.z) != null ? { z: num(r.z) } : {}), ...(mode ? { mode } : {}) };
}


/** The places of a town (its place and build) any test drive found unreachable: [id, 'none' | 'car'] (approach.ts markOf). */
export function townUnreachable(lock: Pick<HometownLock, 'place' | 'compiler'> | null | undefined): Mark[] {
  if (!lock?.place || !lock.compiler) return [];
  const rows = db.prepare(`SELECT json_extract(report, '$.unreachable') AS u FROM drafts WHERE json_extract(meta, '$.mode') = 'storykit'
    AND json_extract(meta, '$.storykit.hometown.place') = ? AND json_extract(meta, '$.storykit.hometown.compiler') = ? AND json_extract(report, '$.unreachable') IS NOT NULL LIMIT 500`)
    .all(lock.place, lock.compiler) as { u: string | null }[];
  const out: Mark[] = [];
  for (const r of rows) { try { for (const m of JSON.parse(r.u || '[]')) { const ok = readMark(m); if (ok) out.push(ok); } } catch { /* none */ } }
  return out;
}
export const readMark = (m: unknown): Mark | null => (Array.isArray(m) && typeof m[0] === 'string' && KEY.test(m[0]) && (m[1] === 'car' || m[1] === 'none') ? [m[0], m[1]] : null);
/** The town's package with what its test drives found marked (approach 'none', or 'car': its middle unreachable). */
export const withDriveReach = (pkg: CityPackage, lock: Pick<HometownLock, 'place' | 'compiler'> | null | undefined) => withUnreachable(pkg, townUnreachable(lock));

