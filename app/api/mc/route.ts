import { cookies } from 'next/headers';
import { MC_KINDS, deviceOf, isBot, recordMcEvent, type McKind } from '@/lib/analytics';
import { COOKIE, validSession } from '../../admin/session';

export const runtime = 'nodejs';

/**
 * Mog City's moments (lib/analytics.ts mcStats), from its wagmi/stats.js on mc.gamemog.com: navigator.sendBeacon from
 * that origin, a JSON body sent as text/plain so no preflight is asked for. Only that origin is taken (and, on the Mac,
 * a local copy of the game on localhost or 127.0.0.1); bots, the owner's own visits (the session cookie comes along:
 * mc.gamemog.com is the same site) and anything odd are dropped quietly. Always 204, with the origin allowed for the
 * game's fetch fallback.
 */
const GAME = 'https://mc.gamemog.com';
const allowed = (o: string | null): o is string =>
  o === GAME || (process.env.NODE_ENV !== 'production' && !!o && /^http:\/\/(localhost|127\.0\.0\.1):\d{2,5}$/.test(o));
const KINDS = new Set<string>(MC_KINDS);
// one time moment is the play since the last (the game sends one every few minutes and when the tab goes away)
const MAX_MS = 15 * 60_000;
// a mission's name, or "<mission>: <reason>": one line of plain words
const words = (x: unknown) => (typeof x === 'string' ? x.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160) || null : null);

export async function POST(req: Request) {
  const origin = req.headers.get('origin');
  if (!allowed(origin)) return new Response(null, { status: 204 });
  const none = () => new Response(null, { status: 204, headers: { 'access-control-allow-origin': origin, vary: 'origin' } });
  const ua = req.headers.get('user-agent') ?? '';
  if (isBot(ua) || Number(req.headers.get('content-length') ?? 0) > 2048) return none();
  // the owner's own visits are not traffic
  if (validSession((await cookies()).get(COOKIE)?.value)) return none();
  let b: Record<string, unknown>;
  try {
    const text = await req.text();
    if (text.length > 2048) return none();
    const j: unknown = JSON.parse(text);
    if (!j || typeof j !== 'object' || Array.isArray(j)) return none();
    b = j as Record<string, unknown>;
  } catch { return none(); }
  const visitor = typeof b.v === 'string' && /^[a-z0-9-]{16,64}$/i.test(b.v) ? b.v : null;
  const kind = typeof b.k === 'string' && KINDS.has(b.k) ? (b.k as McKind) : null;
  if (!visitor || !kind) return none();
  let detail: string | null = null, ms: number | null = null, ref: string | null = null, source: string | null = null;
  if (kind === 'mission' || kind === 'pass' || kind === 'fail') {
    detail = words(b.d);
    if (!detail) return none();
  } else if (kind === 'time') {
    const t = b.ms;
    if (typeof t !== 'number' || !Number.isFinite(t) || t < 1000) return none();
    ms = Math.min(MAX_MS, Math.round(t));
  } else if (kind === 'land') {
    ref = typeof b.r === 'string' && /^[a-z0-9.-]{1,100}(:\d+)?$/i.test(b.r) ? b.r.replace(/^www\./i, '').toLowerCase() : null;
    source = typeof b.s === 'string' ? b.s.toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 60) || null : null;
  }
  recordMcEvent({ visitor, kind, detail, ms, ref, source, device: deviceOf(ua) });
  return none();
}
