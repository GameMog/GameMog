import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { RANGES, activeNow, adminBuilds, adminScores, adminWorlds, stats, type Range, type Stats } from '@/lib/analytics';
import { kartReports } from '@/lib/kart-report';
import { buildSlots, slotsHeld } from '@/lib/build-limits';
import { adminEnabled, isAdmin } from './session';
import { Dashboard } from './dashboard';
import { Login } from './login';
import './admin.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Admin | GameMog', robots: { index: false, follow: false } };

/**
 * The owner's screen: numbers, the worlds with a switch to take each one
 * down, every build prompt, and every name typed onto a leaderboard. It does
 * not exist unless ADMIN_PASSWORD is set, and shows only a sign-in without
 * the session cookie.
 */
export default async function AdminPage() {
  if (!adminEnabled()) notFound();
  if (!(await isAdmin())) return <Login />;
  const now = Date.now();
  // (the builds first: reading them marks any a stopped server left running as interrupted, before the counts are taken)
  const builds = adminBuilds(80, now);
  const all = Object.fromEntries(RANGES.map((r) => [r, stats(r, now)])) as Record<Range, Stats>;
  return <Dashboard stats={all} worlds={adminWorlds()} builds={builds} scores={adminScores()} active={activeNow()} reports={kartReports()} slots={{ held: slotsHeld(), max: buildSlots() }} />;
}
