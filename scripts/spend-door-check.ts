/**
 * The paid calls outside the build slots, and the open door (16 Nov). No paid call: the selfie route (app/api/me/selfie)
 * talks to a stand-in for the Messages API on 127.0.0.1 (ANTHROPIC_BASE_URL), and its spend lands in a TEMP copy of
 * paid_calls that shadows the real table for this connection (as scripts/perf-check.ts does), so the database's own day
 * is never changed. Checked: a burst of selfies from one address is refused (429) after SELFIE_PER_HOUR, before any model
 * call; the site's hourly ceiling holds whatever addresses a sender makes up; a selfie's priced cost counts in the day's
 * spend (spendToday) and, at the day's ceiling, a selfie is refused with the resting words; a raw world spec POSTed to
 * /api/games is not found without the owner's session, and with it, a name the filter blocks is refused while a clean
 * one publishes (removed afterwards); the race brief is not found without the owner's session.
 */
import { register } from 'node:module';
import { createServer, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { db } from '../lib/db.ts';
import { MUSE_SPRINT } from '../lib/presets/muse-sprint.ts';

type Ok = (name: string, cond: boolean, detail?: string) => void;
const ROOT = new URL('../', import.meta.url).href;
register('data:text/javascript,' + encodeURIComponent(`
  export async function resolve(s, c, next) {
    if (s === 'next/headers' || s === 'next/server') return next(s + '.js', c);
    if (!s.startsWith('@/')) return next(s, c);
    for (const ext of ['', '.ts', '.tsx', '/index.ts']) { try { return await next(${JSON.stringify(ROOT)} + s.slice(2) + ext, c); } catch {} }
    return next(s, c);
  }`));

/** A stand-in Messages API: every call answers one usable selfie, with usage. */
async function standIn(): Promise<{ server: Server; port: number; calls: () => number }> {
  let calls = 0;
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      calls++;
      const text = JSON.stringify({ usable: true, youngChild: false, tone: 'medium', hair: 'short', hairColor: 'black', eyes: 'brown', build: 'average', body: 'male' });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ id: `msg_${calls}`, type: 'message', role: 'assistant', model: 'claude-sonnet-5', content: [{ type: 'text', text }], stop_reason: 'end_turn', stop_sequence: null,
        usage: { input_tokens: 1600, output_tokens: 120, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } }));
    });
  });
  // (the platform jobs' ports, 6300-6339: the first free one)
  for (let port = 6311; port < 6340; port++) {
    const ok = await new Promise<boolean>((r) => { server.once('error', () => r(false)); server.listen(port, '127.0.0.1', () => r(true)); });
    if (ok) return { server, port, calls: () => calls };
  }
  throw new Error('no free port for the stand-in Messages API (6311-6339)');
}

const PHOTO = 'data:image/jpeg;base64,' + Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...new Array(200).fill(7)]).toString('base64');

export async function runSpendDoorChecks(ok: Ok) {
  console.log('\npaid calls outside the build slots, and the open door (selfie, raw specs, race brief)');
  const env = { key: process.env.ANTHROPIC_API_KEY, token: process.env.ANTHROPIC_AUTH_TOKEN, base: process.env.ANTHROPIC_BASE_URL, usd: process.env.BUILD_DAILY_USD, pw: process.env.ADMIN_PASSWORD, per: process.env.SELFIE_PER_HOUR };
  const api = await standIn();
  const made: string[] = [];
  db.exec('CREATE TEMP TABLE paid_calls AS SELECT * FROM main.paid_calls WHERE 0');
  try {
    process.env.ANTHROPIC_API_KEY = 'stand-in-key'; delete process.env.ANTHROPIC_AUTH_TOKEN;
    process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${api.port}`;
    process.env.ADMIN_PASSWORD = 'spend-door-check-password';
    delete process.env.SELFIE_PER_HOUR;
    const L = await import('../lib/build-limits.ts');
    const { POST: selfie } = await import('../app/api/me/selfie/route.ts');
    const { POST: publish } = await import('../app/api/games/route.ts');
    const { POST: generate } = await import('../app/api/generate/route.ts');
    const { sessionValue, COOKIE } = await import('../app/admin/session.ts');
    const owner = `${COOKIE}=${sessionValue().value}`;

    // the day's ceiling well above today's spend while the burst runs
    process.env.BUILD_DAILY_USD = String(L.spendToday().total + 100);
    const day0 = L.spendToday();
    const ask = (ip: string) => selfie(new Request('http://127.0.0.1:3939/api/me/selfie', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': ip }, body: JSON.stringify({ image: PHOTO, age13: true }) }));
    const statuses: number[] = [];
    for (let i = 0; i < L.selfiePerHour() + 3; i++) statuses.push((await ask('198.51.100.40')).status);
    const allowed = statuses.filter((s) => s === 200).length;
    ok(`a burst of selfies from one address: ${L.selfiePerHour()} read, then 429 before any model call`, allowed === L.selfiePerHour() && statuses.slice(allowed).every((s) => s === 429) && api.calls() === allowed, `${statuses.join(' ')}; ${api.calls()} model calls`);
    const other = await ask('198.51.100.41');
    ok('another address is not held back by it', other.status === 200 && api.calls() === allowed + 1, String(other.status));
    const day1 = L.spendToday();
    const each = L.priceCall('claude-sonnet-5', { input_tokens: 1600, output_tokens: 120 });
    ok('each selfie\'s priced cost counts in the day\'s spend (spendToday, the admin\'s "spent today")', each > 0 && Math.abs(day1.calls - day0.calls - each * (allowed + 1)) < 1e-6 && Math.abs(day1.total - day0.total - each * (allowed + 1)) < 1e-6,
      `${(day1.calls - day0.calls).toFixed(6)} for ${allowed + 1} at ${each.toFixed(6)}`);
    // the site's hourly ceiling: made-up addresses do not get past it
    const far = Date.now() + 10 * 3600_000;
    let site = 0;
    for (let i = 0; i < L.selfieSiteHour() + 20; i++) site += L.allowSelfie(`203.0.113.${i % 250}-${i}`, far + i) ? 1 : 0;
    ok('the site\'s hourly ceiling holds whatever addresses a sender makes up', site === L.selfieSiteHour(), `${site} of ${L.selfieSiteHour()}`);
    // at the day's ceiling: resting, no model call
    process.env.BUILD_DAILY_USD = String(L.spendToday().total);
    const before = api.calls(), rest = await ask('198.51.100.42'), restJson = await rest.json() as { error?: string; resting?: boolean };
    ok('at the day\'s ceiling a selfie is refused with the resting words, no model call', rest.status === 503 && restJson.resting === true && restJson.error === L.RESTING && api.calls() === before, `${rest.status} ${restJson.error}`);
    process.env.BUILD_DAILY_USD = String(L.spendToday().total + 100);

    // the raw spec branch of POST /api/games: the owner's only, names filtered
    const spec = (title: string) => { const s = structuredClone(MUSE_SPRINT); s.meta.title = title; return s; };
    const post = (body: unknown, cookie?: string) => publish(new Request('http://127.0.0.1:3939/api/games', { method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) }));
    const n0 = (db.prepare('SELECT COUNT(*) AS n FROM games').get() as { n: number }).n;
    const anon = await post({ spec: spec(`Door Check ${randomUUID().slice(0, 6)}`) });
    ok('a raw world spec posted without the owner\'s session is not found, and nothing is published', anon.status === 404 && (db.prepare('SELECT COUNT(*) AS n FROM games').get() as { n: number }).n === n0, String(anon.status));
    const rude = await post({ spec: spec('Fuck This Race') }, owner);
    ok('the owner\'s raw spec runs the name filter: a blocked title is refused', rude.status === 400 && (db.prepare('SELECT COUNT(*) AS n FROM games').get() as { n: number }).n === n0, String(rude.status));
    const fine = await post({ spec: spec(`Door Check ${randomUUID().slice(0, 6)}`) }, owner);
    const fj = await fine.json() as { id?: string };
    if (fj.id) made.push(fj.id);
    ok('the owner\'s clean raw spec still publishes', fine.status === 200 && !!fj.id, String(fine.status));

    // the race brief: no page sends it; the owner's only
    const race = await generate(new Request('http://127.0.0.1:3939/api/generate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'race', prompt: 'a race brief from anyone at all' }) }));
    ok('a race brief without the owner\'s session is not found, before a slot or a model call', race.status === 404 && L.slotsHeld() === 0, String(race.status));
  } finally {
    for (const id of made) db.prepare('DELETE FROM games WHERE id = ?').run(id);
    db.exec('DROP TABLE temp.paid_calls');
    await new Promise((r) => api.server.close(r));
    const put = (k: string, v: string | undefined) => { if (v === undefined) delete process.env[k]; else process.env[k] = v; };
    put('ANTHROPIC_API_KEY', env.key); put('ANTHROPIC_AUTH_TOKEN', env.token); put('ANTHROPIC_BASE_URL', env.base); put('BUILD_DAILY_USD', env.usd); put('ADMIN_PASSWORD', env.pw); put('SELFIE_PER_HOUR', env.per);
  }
}
