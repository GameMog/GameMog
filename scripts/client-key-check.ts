/**
 * The address every per-address limit counts against (16 Nov 2026): the trusted hop (lib/hometown/client.ts
 * townClientKey), never a header the client wrote, and the owner's sign-in lockout across all addresses. Part of
 * `npm run check`; nothing is stored, no server runs.
 */
import { readFileSync } from 'node:fs';
import { townClientKey } from '../lib/hometown/client.ts';

type Ok = (name: string, cond: boolean, detail?: string) => void;
const R = (p: string) => readFileSync(p, 'utf8');
const H = (h: Record<string, string>) => new Headers(h);

export async function runClientKeyChecks(ok: Ok) {
  console.log('\nThe address a limit counts against (lib/hometown/client.ts), and the sign-in lockout (lib/sign-in-lock.ts)');
  const { signInKey, lockedOut, recordMiss, clearMisses, resetMisses, GLOBAL_MISSES } = await import('../lib/sign-in-lock.ts');
  const onRender = { RENDER: 'true' }, off = {};
  const key = (h: Record<string, string>, env: Record<string, string> = off) => townClientKey({ headers: H(h) }, env);

  // Render: Cloudflare's header (its edge replaces a client's), and Render's proxy appends to X-Forwarded-For
  const real = { 'cf-connecting-ip': '198.51.100.7', 'x-forwarded-for': '198.51.100.7, 172.70.1.1' };
  const spoofs: Record<string, string>[] = [
    { 'x-forwarded-for': '1.2.3.4, 198.51.100.7, 172.70.1.1' },
    { 'x-nf-client-connection-ip': '5.6.7.8' },
    { 'x-real-ip': '9.9.9.9' },
    { 'true-client-ip': '4.4.4.4' },
  ];
  ok('on Render a spoofed X-Forwarded-For first hop, x-nf-client-connection-ip, x-real-ip or True-Client-IP does not change the key',
    spoofs.every((s) => key({ ...real, ...s }, onRender) === '198.51.100.7'), spoofs.map((s) => key({ ...real, ...s }, onRender)).join(' '));
  // elsewhere: the last hop, the nearest proxy's
  const proxied = { 'x-forwarded-for': '203.0.113.5' };
  ok('off Render a spoofed first hop, x-nf-client-connection-ip, x-real-ip or cf-connecting-ip does not change the key',
    ([{ 'x-forwarded-for': '1.2.3.4, 203.0.113.5' }, { 'x-nf-client-connection-ip': '5.6.7.8' }, { 'x-real-ip': '9.9.9.9' }, { 'cf-connecting-ip': '1.1.1.1' }] as Record<string, string>[])
      .every((s) => key({ ...proxied, ...s }) === '203.0.113.5'));

  // the sign-in key is that same rule
  const before = process.env.RENDER;
  process.env.RENDER = 'true';
  try {
    ok('the sign-in key is the trusted hop: a spoofed header does not change it',
      signInKey(H(real)) === '198.51.100.7' && spoofs.every((s) => signInKey(H({ ...real, ...s })) === '198.51.100.7'));
  } finally { if (before === undefined) delete process.env.RENDER; else process.env.RENDER = before; }

  // every per-address limit reads it; nobody reads the client's headers by hand
  const users = { 'app/admin/actions.ts': /signInKey\(h\)/, 'app/api/kart-report/route.ts': /townClientKey\(req\)/, 'lib/dare.ts': /return townClientKey\(req\)/, 'app/api/perf/route.ts': /townClientKey\(req\)/, 'app/api/towns/route.ts': /townClientKey\(req\)/ };
  const hand = /get\('(x-forwarded-for|x-nf-client-connection-ip|x-real-ip|cf-connecting-ip|true-client-ip)'\)/;
  ok('the sign-in lockout, kart reports, dares, machine reports and towns all key on it, and none reads the address headers itself',
    Object.entries(users).every(([f, re]) => re.test(R(f)) && !hand.test(R(f))), Object.entries(users).filter(([f, re]) => !re.test(R(f)) || hand.test(R(f))).map(([f]) => f).join(', '));

  // the lockout: five misses lock one address; GLOBAL_MISSES from all addresses lock every new sign-in for fifteen minutes
  resetMisses();
  const t = Date.UTC(2026, 10, 16, 12);
  for (let i = 0; i < 5; i++) recordMiss('203.0.113.9', t);
  ok('five misses lock that address out, another address is still let try', lockedOut('203.0.113.9', t + 1000) && !lockedOut('203.0.113.10', t + 1000));
  ok('fifteen minutes on it may try again', !lockedOut('203.0.113.9', t + 15 * 60_000 + 1));
  resetMisses();
  for (let i = 0; i < GLOBAL_MISSES; i++) recordMiss(`198.18.${i >> 8}.${i & 255}`, t + i);
  ok(`${GLOBAL_MISSES} misses from ${GLOBAL_MISSES} rotating addresses in fifteen minutes lock every new sign-in out, a fresh address too`,
    lockedOut('192.0.2.200', t + 60_000) && lockedOut('198.18.0.0', t + 60_000));
  ok('a correct sign-in does not clear the all-addresses count (clearMisses is per address)', (clearMisses('198.18.0.0'), lockedOut('192.0.2.200', t + 60_000)));
  ok('fifteen minutes after the misses, sign-in opens again', !lockedOut('192.0.2.200', t + GLOBAL_MISSES + 15 * 60_000 + 1));
  resetMisses();
  for (let i = 0; i < GLOBAL_MISSES - 1; i++) recordMiss(`198.18.1.${i}`, t);
  ok(`${GLOBAL_MISSES - 1} misses from all addresses lock nobody new out`, !lockedOut('192.0.2.201', t + 1000));
  resetMisses();
}
