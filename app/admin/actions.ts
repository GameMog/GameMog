'use server';
import { cookies, headers } from 'next/headers';
import { setScoreHidden, setWorldHidden, setWorldVisibility, type WorldVisibility } from '@/lib/analytics';
import { repinStoryWorld } from '@/lib/storykit-publish';
import { COOKIE, adminEnabled, clearMisses, isAdmin, lockedOut, passwordMatches, recordMiss, sessionValue } from './session';

/** Server actions for /admin. Every one but signing in checks the session first. */

export async function signIn(password: string): Promise<{ ok: boolean; error?: string }> {
  const h = await headers();
  // Netlify's own client address header cannot be set by the caller; the rest are fallbacks
  const who = h.get('x-nf-client-connection-ip') ?? h.get('x-forwarded-for')?.split(',')[0].trim() ?? h.get('x-real-ip') ?? 'local';
  if (!adminEnabled()) return { ok: false, error: 'Admin is switched off on this server.' };
  if (lockedOut(who)) return { ok: false, error: 'Too many tries. Wait fifteen minutes.' };
  await new Promise((r) => setTimeout(r, 400));
  if (typeof password !== 'string' || !passwordMatches(password)) {
    recordMiss(who);
    return { ok: false, error: 'That password is not right.' };
  }
  clearMisses(who);
  const s = sessionValue();
  (await cookies()).set(COOKIE, s.value, { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: s.maxAge });
  return { ok: true };
}

export async function signOut() {
  (await cookies()).delete(COOKIE);
}

async function must() {
  if (!(await isAdmin())) throw new Error('Signed out');
}

export async function setWorld(id: string, hidden: boolean) {
  await must();
  return setWorldHidden(String(id), !!hidden);
}

export async function setVisibility(id: string, v: WorldVisibility) {
  await must();
  if (v !== 'live' && v !== 'link' && v !== 'owner') return false;
  return setWorldVisibility(String(id), v);
}

export async function setScore(id: number, hidden: boolean) {
  await must();
  return setScoreHidden(Number(id), !!hidden);
}

/** Re-pin a published hometown story world to its town's current whole town (lib/storykit-publish.ts repinStoryWorld). */
export async function repinStory(slug: string): Promise<{ ok: boolean; error?: string; problems?: string[]; build?: string; notes?: string[] }> {
  await must();
  const r = repinStoryWorld(String(slug));
  return r.ok ? { ok: true, build: r.build, notes: r.notes } : { ok: false, error: r.error, problems: r.problems?.slice(0, 12) };
}
