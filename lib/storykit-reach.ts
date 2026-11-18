/**
 * The Story Kit's builder after a test drive found a place no player can reach (the owner, 14 Nov: "putting rings
 * inside buildings does not work especially since you can NOT enter buildings on the platform"). Mog City's runner
 * fails such a mission in the drive with what and where (MogCity wagmi/storyrun/reach.js: the step, the pack's place
 * key, the town's place it names, why), the creator's browser reports it (public/storykit/work.js `reach`), and here:
 *
 *   readReach(x)            the report's reach, read strictly
 *   afterDriveReach(id, r)  the builder's own fix, no model call: in a hometown story, the failed step's place swapped
 *                           for the nearest reachable one of the same kind that passes the hometown gate
 *                           (storykit/hometown/approach.ts swapPlace), written to the store draft (StoryStore.repack)
 *                           and its GameMog draft (the module and the report); the missions the swap leaves as they
 *                           were stay banked (their drive carries), so the work page drives on from the failed one.
 *                           Every place so found is remembered on the draft (report.unreachable). Up to SWAPS a draft;
 *                           none to be had (no such place, or New York's curated places), the drive's reason stands:
 *                           "Pick another place for it", for the creator or a Mog.
 *   townUnreachable(lock)   the places of a town any test drive found unreachable (every draft built in it, by its
 *                           lock): the builder's next story there never sees them (withDriveReach, then the place list
 *                           and the gate: lib/storykit-hometown.ts, storykit/hometown/hometown-gate.ts)
 */
import { db } from './db';
import { storyStore } from './storykit-store';
import { playHashOf, draftOfStore } from './storykit-publish';
import { cityPackageByLock } from './hometown/towns';
import { storykitModule } from './storykit-build';
import { townForStory } from './storykit-hometown';
import { codeHash } from './test-drive';
import { townUnreachable, readMark, type DriveReach } from './drive-reach';
export { readReach, townUnreachable, withDriveReach, type DriveReach } from './drive-reach';
import { gateHometown } from '../storykit/hometown/hometown-gate.ts';
import { swapPlace, targetsOf, withUnreachable, markOf, type Mark, type Swap } from '../storykit/hometown/approach.ts';
import type { CityPackage } from '../storykit/hometown/city-package.ts';

/** The town as the builder reads it (the sanity pass, lib/storykit-hometown.ts townForStory): a swap never picks an astray place. */
const storyPkg = (p: CityPackage | null) => (p ? townForStory(p) : null);
/** How many places one draft's drives may swap (each swap is another drive of what is left). */
export const SWAPS = 3;
export type ReachFix = { swap: Swap } | { swap: null; why: string };
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
/**
 * The builder's fix, worked out (pure: the check runs it, scripts/storykit-reach-check.ts): from the GameMog draft's
 * report, its store pack (and a Mog's parent's), the reach failure, the town (null: none to read) and what other drives
 * in the town found. `pack`: the swapped pack to store, or none; `report`: the draft's report after it (`unreachable`, the
 * places as marks; `swaps`, what was swapped; after a swap its drive keeps only the missions the swap left as they were,
 * its `play` for the caller to set to the new world's, so they stay banked: lib/storykit-publish.ts bankedMissions).
 */
export function planReachFix(o: { report: Json; pack: Json | null; parent?: Json | null; published?: boolean; reach: DriveReach; pkg: CityPackage | null; townMarks?: Mark[] }): { fix: ReachFix; report: Json; pack: Json | null } {
  const { report, pack, reach } = o;
  const marks: Mark[] = (Array.isArray(report.unreachable) ? report.unreachable : []).map(readMark).filter((m: Mark | null): m is Mark => !!m);
  const mark = pack ? markOf(pack, reach) : null;
  if (mark && !marks.some((m) => JSON.stringify(m) === JSON.stringify(mark))) marks.push(mark);
  const swaps = Array.isArray(report.swaps) ? report.swaps : [];
  const keep = (why: string) => ({ fix: { swap: null, why } as ReachFix, report: { ...report, unreachable: marks }, pack: null });
  if (!pack || o.published) return keep('the world is published');
  if (pack.base?.city !== 'hometown' || !pack.base.hometown) return keep('not a hometown story');
  if (!reach.at) return keep('the step names no place');
  if (swaps.length >= SWAPS) return keep(`already ${swaps.length} places swapped`);
  if (!o.pkg) return keep('the town could not be read');
  const pkg = withUnreachable(o.pkg, [...marks, ...(o.townMarks ?? [])]);
  const fixed = swapPlace(pack, reach, pkg, (p) => gateHometown(p, pkg, { parent: o.parent ?? null }).ok);
  if (!fixed) return keep(`no other ${reach.kind ? reach.kind.replace(/_/g, ' ') : 'place of that kind'} in the town a player can reach`);
  // (the missions the swap did not touch keep their pass: the same steps at the same places)
  const touched = new Set(targetsOf(fixed.pack).filter((t) => t.key === fixed.swap.alias).map((t) => t.mission));
  touched.add(reach.mission);
  const drive = (report.drive ?? {}) as Json;
  const kept = (Array.isArray(drive.missions) ? drive.missions : []).filter((m: { id: string; state: string }) => m.state === 'passed' && !touched.has(m.id));
  return { fix: { swap: fixed.swap }, pack: fixed.pack, report: { ...report, unreachable: marks, swaps: [...swaps, { ...fixed.swap, why: reach.why, step: reach.step }], status: 'unverified',
    drive: { ...drive, missions: kept, passed: kept.length, reason: null, stuck: null, reach: null, errors: drive.errors ?? 0 } } };
}

/** After a drive's report with a reach failure (app/api/storykit/drafts/[id]/report): planReachFix, then written. */
export function afterDriveReach(storeId: string, reach: DriveReach): ReachFix {
  const d = draftOfStore(storeId); if (!d) return { swap: null, why: 'no draft' };
  const s = storyStore(), row = s.db.prepare('SELECT pack, parent, state FROM drafts WHERE id = ?').get(storeId) as { pack: string; parent: string | null; state: string } | undefined;
  const pack = row ? JSON.parse(row.pack) : null;
  const parent = row?.parent ? JSON.parse((s.db.prepare('SELECT pack FROM drafts WHERE id = ?').get(row.parent) as { pack: string } | undefined)?.pack ?? 'null') : null;
  const town = pack?.base?.city === 'hometown' && pack.base.hometown ? pack.base.hometown : null;
  const plan = planReachFix({ report: JSON.parse(d.report), pack, parent, published: !row || row.state === 'kept', reach, pkg: town ? storyPkg(cityPackageByLock(town)) : null, townMarks: town ? townUnreachable(town) : [] });
  let report = plan.report, code: string | null = null;
  if (plan.pack) {
    const stored = s.repack(storeId, plan.pack);
    if (!stored.ok) {
      // (the gate here refused what the hometown gate passed: nothing swapped, the place remembered)
      const why = `the swapped pack was refused: ${stored.error}`;
      const was = JSON.parse(d.report) as Json;
      db.prepare('UPDATE drafts SET report = ? WHERE id = ?').run(JSON.stringify({ ...was, unreachable: plan.report.unreachable }), d.id);
      return { swap: null, why };
    }
    code = storykitModule(stored.pack);
    const play = playHashOf(storeId);
    report = { ...report, codeHash: codeHash(code), drive: { ...report.drive, ...(play ? { play } : {}) }, swaps: report.swaps.map((x: Json, i: number, a: Json[]) => (i === a.length - 1 ? { ...x, at: Date.now() } : x)) };
  }
  db.prepare('UPDATE drafts SET report = ?, code = COALESCE(?, code) WHERE id = ?').run(JSON.stringify(report), code, d.id);
  return plan.fix;
}
