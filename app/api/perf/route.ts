import { cookies } from 'next/headers';
import { isBot } from '@/lib/analytics';
import { PERF_MAX_BYTES, allowPerf, cleanPerf, perfAdmin, storePerf } from '@/lib/perf';
import { townClientKey } from '@/lib/hometown/client';
import { COOKIE, validSession } from '../../admin/session';

export const runtime = 'nodejs';

/**
 * How a machine runs the game (lib/perf.ts), from Mog City's wagmi/perf.js on mc.gamemog.com: navigator.sendBeacon
 * from that origin, a JSON body sent as text/plain so no preflight is asked for (as /api/mc). Also from this site
 * itself (sec-fetch-site same-origin), and outside production from a local copy of the game on localhost or 127.0.0.1.
 * Bots and anything odd are dropped quietly; the owner's own sessions are kept and marked. Always 204, with the origin
 * allowed for the game's fetch fallback. No IP address is kept: the rate limit counts them in memory only.
 */
const GAME = 'https://mc.gamemog.com';
const local = (o: string | null) => process.env.NODE_ENV !== 'production' && !!o && /^http:\/\/(localhost|127\.0\.0\.1):\d{2,5}$/.test(o);

async function body(req: Request): Promise<string | null> {
  const r = req.body?.getReader();
  if (!r) return '';
  const parts: Uint8Array[] = [];
  for (let n = 0; ;) {
    const { done, value } = await r.read();
    if (done) break;
    n += value.byteLength;
    if (n > PERF_MAX_BYTES) { r.cancel().catch(() => {}); return null; }
    parts.push(value);
  }
  return Buffer.concat(parts).toString('utf8');
}

export async function POST(req: Request) {
  const origin = req.headers.get('origin');
  const same = req.headers.get('sec-fetch-site') === 'same-origin';
  if (!(origin === GAME || local(origin) || same)) return new Response(null, { status: 204 });
  const none = () => new Response(null, { status: 204, headers: origin && !same ? { 'access-control-allow-origin': origin, vary: 'origin' } : {} });
  const h = req.headers, ua = h.get('user-agent') ?? '';
  // (Do Not Track or Global Privacy Control: the game sends nothing then; anything that comes anyway is dropped)
  if (h.get('dnt') === '1' || h.get('sec-gpc') === '1') return none();
  if ((isBot(ua) && !local(origin)) || Number(h.get('content-length') ?? 0) > PERF_MAX_BYTES) return none();
  let c: ReturnType<typeof cleanPerf> = null;
  try {
    const text = await body(req);
    if (text == null) return none();
    c = cleanPerf(JSON.parse(text), ua);
  } catch { return none(); }
  if (!c) return none();
  // (the address from a header the client cannot write, as the town builder's limit: lib/hometown/client.ts)
  const who = townClientKey(req);
  if (!allowPerf(who, c.sid)) return none();
  const owner = validSession((await cookies()).get(COOKIE)?.value);
  try { storePerf(c, owner); } catch (e) { console.error('perf: store', String((e as Error).message).slice(0, 200)); }
  return none();
}

/** The last day's machines, as the Machines tab has them, for the owner only (the admin session); to anyone else, nothing is here. */
export async function GET(req: Request) {
  if (!validSession((await cookies()).get(COOKIE)?.value)) return new Response('Not found', { status: 404 });
  const r = new URL(req.url).searchParams.get('range');
  const range = r === '7d' || r === '30d' || r === 'all' ? r : '24h';
  return Response.json(perfAdmin(range), { headers: { 'cache-control': 'no-store' } });
}
