import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';

/**
 * The owner's way in. There are no accounts: /admin exists only when
 * ADMIN_PASSWORD is set on the server, and a correct password earns a signed,
 * HttpOnly cookie for two weeks. The signature is keyed by the password, so
 * changing the password signs everyone out.
 */
export const COOKIE = 'gm_admin';
const TTL = 14 * 24 * 3600;

export const adminEnabled = () => (process.env.ADMIN_PASSWORD ?? '').length >= 12;

const sign = (exp: number) =>
  createHmac('sha256', `gamemog-admin:${process.env.ADMIN_PASSWORD}`).update(`v1.${exp}`).digest('hex');

export function sessionValue() {
  const exp = Math.floor(Date.now() / 1000) + TTL;
  return { value: `v1.${exp}.${sign(exp)}`, maxAge: TTL };
}

export function validSession(value: string | undefined): boolean {
  if (!adminEnabled() || !value) return false;
  const m = value.match(/^v1\.(\d+)\.([0-9a-f]{64})$/);
  if (!m) return false;
  const exp = Number(m[1]);
  if (exp * 1000 < Date.now()) return false;
  const want = Buffer.from(sign(exp), 'hex'), got = Buffer.from(m[2], 'hex');
  return want.length === got.length && timingSafeEqual(want, got);
}

export async function isAdmin() {
  return validSession((await cookies()).get(COOKIE)?.value);
}

export function passwordMatches(attempt: string) {
  const want = createHmac('sha256', 'gamemog-login').update(process.env.ADMIN_PASSWORD ?? '').digest();
  const got = createHmac('sha256', 'gamemog-login').update(attempt).digest();
  return adminEnabled() && timingSafeEqual(want, got);
}

/**
 * Wrong passwords slow the next try from the same address, in memory only:
 * five misses lock that address out for fifteen minutes. Nothing is stored.
 */
const misses = new Map<string, { n: number; until: number }>();
export function lockedOut(who: string) {
  const m = misses.get(who);
  return !!m && m.until > Date.now();
}
export function recordMiss(who: string) {
  const m = misses.get(who) ?? { n: 0, until: 0 };
  m.n += 1;
  if (m.n >= 5) { m.until = Date.now() + 15 * 60_000; m.n = 0; }
  misses.set(who, m);
  if (misses.size > 5000) misses.clear();
}
export const clearMisses = (who: string) => misses.delete(who);
