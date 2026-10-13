import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { RANGES, activeNow, adminBuilds, adminScores, adminWorlds, stats, type Range, type Stats } from '@/lib/analytics';
import { kartReports } from '@/lib/kart-report';
import { buildSlots, slotsHeld, queueLength, queueMax, spendToday, IN_FLIGHT_USD } from '@/lib/build-limits';
import { dareLoop } from '@/lib/funnel';
import { adminEnabled, isAdmin } from './session';
import { Dashboard } from './dashboard';
import { Login } from './login';
import './admin.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Admin | GameMog', robots: { index: false, follow: false } };

/**
 * The owner's screen: numbers, the worlds with a switch to take each one
 * down, every build prompt, and every name typed onto a leaderboard. It does
 * not exist unless ADMIN_PASSWORD is set.
 *
 * (the owner, 12 Oct: open to read without signing in, for now. Every change
 * still needs the session: each action in actions.ts checks it first, so a
 * switch flipped without signing in is refused and put back)
 */
const OPEN_TO_READ = true;
export default async function AdminPage() {
  if (!adminEnabled()) notFound();
  if (!OPEN_TO_READ && !(await isAdmin())) return <Login />;
  const now = Date.now();
  // (the builds first: reading them marks any a stopped server left running as interrupted, before the counts are taken)
  const builds = adminBuilds(80, now);
  const all = Object.fromEntries(RANGES.map((r) => [r, stats(r, now)])) as Record<Range, Stats>;
  // capacity now (lib/build-limits.ts): the slots, the line, and the day's spend against its ceiling (Los Angeles's day)
  const day = spendToday(now);
  const slots = { held: slotsHeld(), max: buildSlots(), queue: queueLength(), queueMax: queueMax(), spent: day.total, inFlight: day.inFlight, perBuild: IN_FLIGHT_USD, ceiling: day.ceiling };
  // the dare loop (lib/funnel.ts): today and the last 7 days, read-only
  return <Dashboard stats={all} worlds={adminWorlds()} builds={builds} scores={adminScores()} active={activeNow()} reports={kartReports()} slots={slots} loop={dareLoop(now)} />;
}
