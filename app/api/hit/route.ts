import { cookies } from 'next/headers';
import { deviceOf, isBot, recordEvent } from '@/lib/analytics';
import { COOKIE, validSession } from '../../admin/session';

export const runtime = 'nodejs';

const none = () => new Response(null, { status: 204 });

/** One page view or press of Play from app/beacon.tsx. Anything odd is dropped quietly. */
export async function POST(req: Request) {
  const ua = req.headers.get('user-agent') ?? '';
  const site = req.headers.get('sec-fetch-site');
  if (isBot(ua) || (site && site !== 'same-origin')) return none();
  // the owner's own visits are not traffic
  if (validSession((await cookies()).get(COOKIE)?.value)) return none();
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return none(); }
  const visitor = typeof b.v === 'string' && /^[a-z0-9-]{16,64}$/i.test(b.v) ? b.v : null;
  const kind = b.k === 'view' || b.k === 'play' ? b.k : null;
  const path = typeof b.p === 'string' && /^\/[\w\-/.%]{0,200}$/.test(b.p) ? b.p.replace(/\/+$/, '') || '/' : null;
  if (!visitor || !kind || !path || path.startsWith('/admin') || path.startsWith('/api')) return none();
  const ref = typeof b.r === 'string' && /^[a-z0-9.-]{1,100}(:\d+)?$/i.test(b.r) ? b.r.replace(/^www\./i, '').toLowerCase() : null;
  const source = typeof b.s === 'string' ? b.s.toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 60) || null : null;
  recordEvent({ visitor, kind, path, ref, source, device: deviceOf(ua) });
  return none();
}
