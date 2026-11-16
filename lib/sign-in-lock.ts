import { townClientKey } from './hometown/client';

/**
 * The address a sign-in is counted against: the trusted hop (lib/hometown/client.ts townClientKey), never a header the
 * client wrote. (It read x-nf-client-connection-ip, then the first X-Forwarded-For, which Render passes on from the
 * client: a fresh address, and five fresh tries, on every ask.)
 */
export const signInKey = (h: { get(name: string): string | null }) => townClientKey({ headers: h });

/**
 * Wrong passwords slow the next try from the same address, in memory only:
 * five misses lock that address out for fifteen minutes. And from all
 * addresses together (16 Nov): GLOBAL_MISSES misses in fifteen minutes lock
 * every new sign-in out until the oldest is fifteen minutes old, so addresses
 * that rotate cannot brute-force it. A session already signed in is untouched.
 * Nothing is stored.
 */
export const GLOBAL_MISSES = 30;
const WINDOW = 15 * 60_000;
const misses = new Map<string, { n: number; until: number }>();
let everyMiss: number[] = [];
export function lockedOut(who: string, now = Date.now()) {
  everyMiss = everyMiss.filter((t) => t > now - WINDOW);
  if (everyMiss.length >= GLOBAL_MISSES) return true;
  const m = misses.get(who);
  return !!m && m.until > now;
}
export function recordMiss(who: string, now = Date.now()) {
  everyMiss.push(now);
  if (everyMiss.length > GLOBAL_MISSES * 4) everyMiss = everyMiss.slice(-GLOBAL_MISSES * 2);
  const m = misses.get(who) ?? { n: 0, until: 0 };
  m.n += 1;
  if (m.n >= 5) { m.until = now + WINDOW; m.n = 0; }
  misses.set(who, m);
  if (misses.size > 5000) misses.clear();
}
export const clearMisses = (who: string) => misses.delete(who);
/** For the checks: forget every miss. */
export const resetMisses = () => { misses.clear(); everyMiss = []; };
