import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { RANGES, activeNow, adminBuilds, adminScores, adminWorlds, mcStats, stats, type McStats, type Range, type Stats } from '@/lib/analytics';
import { kartReports } from '@/lib/kart-report';
import { perfAdmin, type PerfAdmin } from '@/lib/perf';
import { buildSlots, slotsHeld, queueLength, queueMax, spendToday, IN_FLIGHT_USD } from '@/lib/build-limits';
import { dareLoop } from '@/lib/funnel';
import { adminEnabled, isAdmin } from './session';
import { storykitMode } from '@/lib/storykit-switch';
import { storyStore } from '@/lib/storykit-store';
import { storyReconcile, storyTownsAdmin } from '@/lib/storykit-publish';
import { Dashboard } from './dashboard';
import { backupsAdmin } from '@/lib/backups';
import { adminGames } from '@/lib/admin-games';
import path from 'node:path';
import { builderMode } from '@/lib/hometown-build/access';
import { builderDeps, builderStatus } from '@/lib/hometown-build/server';
import { Login } from './login';
import './admin.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Admin | GameMog', robots: { index: false, follow: false } };

/**
 * The owner's screen: numbers, the worlds with a switch to take each one
 * down, every build prompt, and every name typed onto a leaderboard. It does
 * not exist unless ADMIN_PASSWORD is set.
 *
 * (the owner, 12 Oct: open to read without signing in, for now. 21 Oct: "let's make it password reachable by a password
 * i pick": the owner sets ADMIN_PASSWORD on the Render service, and nothing but the sign-in is shown until then; the
 * sign-in keeps one line, the build slots in use and the line, so a release can still check nothing is building
 * before it pushes, without the password. Every change also checks the session in actions.ts)
 */
const OPEN_TO_READ = false;
const PERF_FIRST_RANGE: Range = '7d';
export default async function AdminPage() {
  if (!adminEnabled()) notFound();
  if (!OPEN_TO_READ && !(await isAdmin())) return <Login capacity={{ held: slotsHeld(), max: buildSlots(), queue: queueLength() }} />;
  const now = Date.now();
  // (the builds first: reading them marks any a stopped server left running as interrupted, before the counts are taken)
  const builds = adminBuilds(80, now);
  const all = Object.fromEntries(RANGES.map((r) => [r, stats(r, now)])) as Record<Range, Stats>;
  // Mog City (mc.gamemog.com), counted apart (lib/analytics.ts mcStats)
  const mc = Object.fromEntries(RANGES.map((r) => [r, mcStats(r, now)])) as Record<Range, McStats>;
  // how each machine runs the game (lib/perf.ts: Mog City's wagmi/perf.js reports): only the range the screen opens on
  // (the dashboard's first range, 7 days: its useState in dashboard.tsx), the owner's own loads left out; the Machines
  // tab asks GET /api/perf for another range or with the owner's loads kept in
  let perf: PerfAdmin | null = null;
  try { perf = JSON.parse(JSON.stringify(perfAdmin(PERF_FIRST_RANGE, now, { excludeOwner: true }))) as PerfAdmin; } catch (e) { console.error('admin: machines', String((e as Error).message).slice(0, 200)); }
  // capacity now (lib/build-limits.ts): the slots, the line, and the day's spend against its ceiling (Los Angeles's day)
  const day = spendToday(now);
  const slots = { held: slotsHeld(), max: buildSlots(), queue: queueLength(), queueMax: queueMax(), spent: day.total, inFlight: day.inFlight, perBuild: IN_FLIGHT_USD, ceiling: day.ceiling };
  // the dare loop (lib/funnel.ts): today and the last 7 days, read-only
  // the Story Kit's store (lib/storykit-store.ts), only while its switch is on or owner-only: off, the store is never
  // opened (data/storykit is not made) and nothing is shown
  const mode = storykitMode();
  const storykit = mode === 'off' ? null : { mode, ...storyStore().usage() };
  // the production town builder (lib/hometown-build): only while HOMETOWN_BUILDER is owner or on (off: the queue is never opened).
  // (JSON round trip: node:sqlite rows have a null prototype, which a Client Component prop refuses)
  let towns = null;
  if (builderMode() !== 'off') { try { towns = JSON.parse(JSON.stringify(builderStatus(builderDeps()))); } catch (e) { console.error('admin: town builder status', String((e as Error).message).slice(0, 200)); } }
  // the published hometown story worlds pinned to an older build of their town: what each plays, and why (lib/storykit-upgrade.ts)
  let storyTowns = null;
  if (towns && storykit) { try { storyTowns = JSON.parse(JSON.stringify(storyTownsAdmin())); } catch (e) { console.error('admin: story towns', String((e as Error).message).slice(0, 200)); } }
  // the story reconcile (lib/storykit-publish.ts storyReconcile): published story games whose world the store does not
  // hold whole and kept, and kept worlds no game plays; only while the store is open
  let reconcile = null;
  if (storykit) { try { reconcile = JSON.parse(JSON.stringify(storyReconcile())); } catch (e) { console.error('admin: story reconcile', String((e as Error).message).slice(0, 200)); } }
  // the newest nightly snapshot and the owner's download of it (lib/backups.ts)
  let backups = null;
  try { backups = backupsAdmin(path.join(process.cwd(), 'data')); } catch (e) { console.error('admin: backups', String((e as Error).message).slice(0, 200)); }
  return <Dashboard reconcile={reconcile} backups={backups} storyTowns={storyTowns} towns={towns} stats={all} games={adminGames()} worlds={adminWorlds()} builds={builds} scores={adminScores()} active={activeNow()} reports={kartReports()} perf={perf} slots={slots} loop={dareLoop(now)} mc={mc} storykit={storykit} />;
}
