/**
 * Hometown hosting (lib/hometown-tiles/): the disk store's cap and free-space floor, the GC (dry run first, pins from
 * the database AND the Story Kit store), the pre-warm list, the public routes (flag, ETag, CORS, no Content-Encoding,
 * the key grammar), the admin routes (token, upload checks, manifest last) and the compile-on-miss queue. Part of npm
 * run check; on its own:
 *
 *   node --import ./scripts/ts-resolve.mjs scripts/hometown-tiles-check.ts
 *
 * Offline: a temp directory, fake tiles, a fake compiler. No server, no Python, no network.
 */
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync, utimesSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';
import { parseKey, parseKeyString, tileKey, manifestKey, buildKey, blockOf } from '../lib/hometown-tiles/keys.ts';
import { TileStore, StoreFull, GB } from '../lib/hometown-tiles/store.ts';
import { planGc, applyGc } from '../lib/hometown-tiles/gc.ts';
import { gatherPins } from '../lib/hometown-tiles/pins.ts';
import { publicResponse, adminResponse, allowedOrigin, verifyObject, currentBuilds, askable, type Deps } from '../lib/hometown-tiles/http.ts';
import { hometownConfig } from '../lib/hometown-tiles/config.ts';
import { createCompiler, childEnv, CompileError } from '../lib/hometown-tiles/compiler.ts';
import { prewarmList, playBox, NAMED, PLAY_SIDE_M } from '../lib/hometown-tiles/prewarm-list.ts';
import { loadIndex } from '../lib/places/search.ts';

type Ok = (name: string, cond: boolean, detail?: string) => void;
const sha = (b: Uint8Array | string) => createHash('sha256').update(b).digest('hex');
const stable = (v: unknown): string => (Array.isArray(v) ? `[${v.map(stable).join(',')}]`
  : v && typeof v === 'object' ? `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(',')}}` : JSON.stringify(v));
const TOKEN = 'test-token-0123456789abcdef-only-for-this-check';

function buildRecord(tag: string) {
  const rec = { format: 'hometown-build', version: 1, grid: 'hg1', compilerVersion: '0.3.0', libs: { python: tag }, overture: '2026-10-21.0' };
  const body = Buffer.from(stable(rec));
  return { id: `htc-0.3.0-hg1-b${sha(body).slice(0, 8)}`, body };
}
const tileBody = (seed: string) => { const raw = Buffer.concat([Buffer.from('HTL1'), Buffer.from(seed.repeat(200))]); return { gz: gzipSync(raw), raw, sha: sha(raw) }; };
function manifestFor(b: string, placeId: string, tiles: { id: string; sha: string; bytes: number }[]) {
  const t = tiles.map((x) => ({ id: x.id, sha256: x.sha, bytes: x.bytes }));
  return Buffer.from(JSON.stringify({ format: 'hometown-session', buildId: b, placeId, name: placeId, tiles: t, tileSetHash: sha(t.map((x) => `${x.id} ${x.sha256}\n`).sort().join('')), lock: { place: placeId, buildId: b } }));
}

export async function runHometownTilesChecks(ok: Ok) {
  const dir = mkdtempSync(path.join(tmpdir(), 'hometown-tiles-check-'));
  try { await checks(ok, dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

async function checks(ok: Ok, dir: string) {
  console.log('\nhometown hosting: keys and the disk store');
  const A = buildRecord('a'), B = buildRecord('b'), C = buildRecord('c'), D = buildRecord('d');
  ok('the key grammar takes tiles, ctx, manifests and build records, and nothing else',
    !!parseKey(['tiles', A.id, 'hg1-conus', '0', '5805', '8582']) && !!parseKey(['ctx', A.id, 'hg1-ak', '4', '0', '12']) && !!parseKey(['manifests', A.id, 'us-4054200.json']) && !!parseKey(['builds', `${A.id}.json`])
    && !parseKey(['tiles', A.id, 'hg1-mars', '0', '1', '1']) && !parseKey(['tiles', A.id, 'hg1-conus', '1', '1', '1']) && !parseKey(['tiles', A.id, 'hg1-conus', '0', '01', '1'])
    && !parseKey(['tiles', 'htc-0.3.0-hg1-bXYZ', 'hg1-conus', '0', '1', '1']) && !parseKey(['state', 'access.json']) && !parseKeyString(`tiles/${A.id}/hg1-conus/0/../1`)
    && !parseKey(['manifests', A.id, 'Okemah.json']) && !parseKey(['builds', A.id]));
  ok('a tile\'s compile block is its L2 parent (compile.py --block)', blockOf('conus', 5805, 8582) === 'hg1-conus/2/1451/2145');

  let free = 100 * GB;
  const root = path.join(dir, 'hometown');
  const store = new TileStore({ root, capBytes: 1 * 1024 * 1024, minFreeBytes: 2 * GB, freeBytes: () => free, log: () => {} });
  const t1 = tileBody('a'), t2 = tileBody('b');
  const k1 = tileKey(A.id, 'conus', 10, 20), k2 = tileKey(A.id, 'conus', 11, 20);
  const p1 = store.put(k1, t1.gz), p1b = store.put(k1, t2.gz);
  ok('a put stores once: the second put of the same key is created false and keeps the first bytes', p1.created && !p1b.created && store.get(k1)!.body.equals(t1.gz));
  ok('the store counts its bytes', store.usedBytes(true) === t1.gz.length, `${store.usedBytes()} B`);
  const g = store.get(k1)!;
  ok('a stored object has a strong ETag from its bytes', g.etag === `"${sha(t1.gz).slice(0, 40)}"`);
  const big = Buffer.alloc(1024 * 1024);
  let full: unknown = null;
  try { store.put(k2, big); } catch (e) { full = e; }
  ok('over the cap a put is refused with 507 (StoreFull, "cap"), and hits still serve', full instanceof StoreFull && full.status === 507 && full.why === 'cap' && !!store.get(k1) && !store.has(k2));
  free = 2 * GB + 10;
  full = null;
  try { store.put(k2, t2.gz); } catch (e) { full = e; }
  ok('below the disk\'s free-space floor a put is refused too ("floor"), whoever used the space', full instanceof StoreFull && full.why === 'floor' && !store.has(k2));
  free = 100 * GB;
  ok('with room again the put goes through', store.put(k2, t2.gz).created && store.usage().full === null);
  mkdirSync(path.join(root, 'tiles', A.id, 'hg1-conus', '0', '12'), { recursive: true });
  const tmp = path.join(root, 'tiles', A.id, 'hg1-conus', '0', '12', '20.tmp-1-abc');
  writeFileSync(tmp, 'half');
  utimesSync(tmp, new Date(Date.now() - 7200_000), new Date(Date.now() - 7200_000));
  ok('a killed writer\'s temp file is never listed or served, and is found as stale', !store.list().some((e) => e.key.includes('.tmp-')) && store.tmpFiles().length === 1);
  const cfgEnv = hometownConfig({ HOMETOWN_TILES: 'on', HOMETOWN_ADMIN_TOKEN: 'short' });
  ok('config: a token under 24 characters counts as no token (admin stays off); the cap and floor default to 2 GB',
    cfgEnv.adminToken === null && cfgEnv.capBytes === 2 * GB && cfgEnv.minFreeBytes === 2 * GB && hometownConfig({}).tiles === false && hometownConfig({}).compile === false);

  console.log('\nhometown hosting: the GC (dry run first; pins from the database and the Story Kit store)');
  // builds: A current, B pinned by a published game, C pinned by a Story Kit draft only, D unpinned and old
  const data = path.join(dir, 'data');
  mkdirSync(path.join(data, 'storykit', 'blobs', 'ab'), { recursive: true });
  const gdb = new DatabaseSync(path.join(data, 'gamemog.db'));
  gdb.exec('CREATE TABLE games (id TEXT, spec TEXT)');
  gdb.prepare('INSERT INTO games VALUES (?, ?)').run('g1', JSON.stringify({ base: { city: 'hometown', hometown: { place: 'us-4054200', compiler: B.id, tiles: 'ab'.repeat(32) } } }));
  gdb.close();
  const sdb = new DatabaseSync(path.join(data, 'storykit', 'store.db'));
  sdb.exec('CREATE TABLE drafts (id TEXT, pack BLOB)');
  sdb.prepare('INSERT INTO drafts VALUES (?, ?)').run('d1', Buffer.from(JSON.stringify({ base: { hometown: { buildId: C.id } } })));
  sdb.close();
  writeFileSync(path.join(data, 'storykit', 'blobs', 'ab', 'x.json'), '{"no":"pin"}');
  const pins = gatherPins(data);
  ok('pins: a build named in gamemog.db and one named only in a Story Kit draft are both found', pins.ok && pins.builds.has(B.id) && pins.builds.has(C.id) && !pins.builds.has(D.id) && pins.builds.size === 2, [...pins.builds].join(' '));
  const gstore = new TileStore({ root: path.join(dir, 'gc'), capBytes: GB, minFreeBytes: 0, freeBytes: () => 100 * GB, log: () => {} });
  const now = Date.now();
  for (const [b, n] of [[A, 3], [B, 2], [C, 2], [D, 4]] as const) {
    gstore.put(buildKey(b.id), b.body);
    for (let i = 0; i < n; i++) gstore.put(tileKey(b.id, 'conus', i, 0), tileBody(b.id + i).gz);
  }
  const E = buildRecord('e');
  gstore.put(buildKey(E.id), E.body);
  gstore.put(tileKey(E.id, 'conus', 0, 0), tileBody('e').gz);
  const served = new Map([[D.id, now - 30 * 86400_000], [E.id, now - 86400_000]]);
  const plan = planGc({ entries: gstore.list(), tmp: gstore.tmpFiles(), current: [A.id], pins: pins.builds, pinsOk: true, lastServed: served, now });
  const st = Object.fromEntries(plan.builds.map((b) => [b.buildId, b.status]));
  ok('the dry run lists only builds neither current nor pinned (0 bytes of any pinned build)', st[A.id] === 'current' && st[B.id] === 'pinned' && st[C.id] === 'pinned' && st[D.id] === 'collect' && st[E.id] === 'collect'
    && !plan.delete.keys.some((k) => k.includes(A.id) || k.includes(B.id) || k.includes(C.id)), JSON.stringify(st));
  ok('and the dry run deletes nothing', gstore.list().length === 17);
  const part = planGc({ entries: gstore.list(), current: [A.id], pins: pins.builds, pinsOk: true, lastServed: served, now, targetBytes: plan.totalBytes - 1 });
  ok('with a target, the least recently served build goes first, and no more than needed', part.delete.builds.length === 1 && part.delete.builds[0] === D.id);
  const blind = planGc({ entries: gstore.list(), current: [A.id], pins: new Set(), pinsOk: false, now });
  ok('when the pins could not be read, nothing is collected (the guard never fails open)', blind.delete.keys.length === 0 && !!blind.refused);
  const nan = planGc({ entries: gstore.list(), tmp: gstore.tmpFiles(), current: [A.id], pins: pins.builds, pinsOk: true, lastServed: served, now, targetBytes: Number('abc') * GB });
  let nanThrew = false; try { applyGc(gstore, nan, nan.planId); } catch { nanThrew = true; }
  ok('a NaN or negative target (the GC script\'s --target-gb abc) plans nothing and cannot be applied, never "no limit"', nan.delete.keys.length === 0 && nan.tmp.keys.length === 0 && /not a number/.test(nan.refused ?? '') && nanThrew
    && planGc({ entries: gstore.list(), current: [A.id], pins: pins.builds, pinsOk: true, now, targetBytes: -1 }).delete.keys.length === 0 && gstore.list().length === 17);
  // without HOMETOWN_BUILD: an older build touched lately (a tile compiled into it on demand) must not make the newest
  // build collectable; both the newest record and the newest file are kept
  const gcfg = hometownConfig({ HOMETOWN_DIR: path.join(dir, 'gc') });
  const recT = (b: { id: string }, t: number) => utimesSync(gstore.file(buildKey(b.id)), t / 1000, t / 1000);
  for (const [b, i] of [[A, 1], [B, 2], [C, 3], [D, 4], [E, 5]] as const) recT(b, now - (10 - i) * 86400_000);
  for (const e of gstore.list()) if (!e.key.startsWith('builds/')) utimesSync(gstore.file(e.key), (now - 20 * 86400_000) / 1000, (now - 20 * 86400_000) / 1000);
  utimesSync(gstore.file(tileKey(D.id, 'conus', 0, 0)), now / 1000, now / 1000);
  const cur = currentBuilds(gstore, gcfg);
  ok('without HOMETOWN_BUILD the newest build record stays current even when an older build has the newest file', cur.includes(E.id) && cur.includes(D.id) && cur.length === 2, cur.join(' '));
  ok('with HOMETOWN_BUILD it is that build alone', JSON.stringify(currentBuilds(gstore, hometownConfig({ HOMETOWN_DIR: path.join(dir, 'gc'), HOMETOWN_BUILD: A.id }))) === JSON.stringify([A.id]));
  let threw = false;
  try { applyGc(gstore, plan, 'not-the-plan'); } catch { threw = true; }
  ok('apply refuses any plan id but the dry run\'s own', threw && gstore.list().length === 17);
  const r = applyGc(gstore, plan, plan.planId);
  ok('apply with the dry run\'s id deletes exactly that plan', r.deleted === plan.delete.keys.length && gstore.list().length === 17 - plan.delete.keys.length && gstore.has(tileKey(B.id, 'conus', 0, 0)) && !gstore.has(tileKey(D.id, 'conus', 0, 0)));
  writeFileSync(path.join(data, 'storykit', 'store.db'), 'not a database at all, not even close: '.repeat(40));
  ok('a Story Kit store that cannot be read makes the pins not ok', !gatherPins(data).ok);

  console.log('\nhometown hosting: the public routes');
  const off: Deps = { cfg: { ...hometownConfig({ HOMETOWN_DIR: root }), tiles: false }, store };
  const on: Deps = { cfg: { ...hometownConfig({ HOMETOWN_DIR: root, HOMETOWN_TILES: 'on' }), production: true }, store };
  const url = (p: string) => `https://gamemog.com/api/hometown/${p}`;
  const req = (p: string, init: RequestInit & { headers?: Record<string, string> } = {}) => new Request(url(p), init);
  const parts = (k: string) => k.split('/');
  const offs = await Promise.all([publicResponse(req(k1), parts(k1), off), publicResponse(req(k1, { method: 'OPTIONS' }), parts(k1), off), publicResponse(req('places/us-4054200'), ['places', 'us-4054200'], off)]);
  ok('flag off (HOMETOWN_TILES unset): every public address is 404', offs.every((x) => x.status === 404));
  const res = await publicResponse(req(k1, { headers: { origin: 'https://mc.gamemog.com', 'accept-encoding': 'gzip, br' } }), parts(k1), on);
  const body = Buffer.from(await res.arrayBuffer());
  ok('a stored tile: 200, its exact bytes, immutable for a year, a strong ETag, CORS for mc.gamemog.com', res.status === 200 && body.equals(t1.gz)
    && /public, max-age=31536000, immutable/.test(res.headers.get('cache-control') ?? '') && res.headers.get('etag') === g.etag && res.headers.get('access-control-allow-origin') === 'https://mc.gamemog.com' && /origin/.test(res.headers.get('vary') ?? ''));
  ok('...as application/octet-stream with NO Content-Encoding (the engine gunzips it)', res.headers.get('content-type') === 'application/octet-stream' && !res.headers.has('content-encoding'));
  const r304 = await publicResponse(req(k1, { headers: { 'if-none-match': g.etag } }), parts(k1), on);
  ok('If-None-Match with its ETag: 304', r304.status === 304);
  const pre = await publicResponse(req(k1, { method: 'OPTIONS', headers: { origin: 'https://mc.gamemog.com' } }), parts(k1), on);
  ok('OPTIONS: 204 with GET, HEAD for Mog City', pre.status === 204 && /GET/.test(pre.headers.get('access-control-allow-methods') ?? ''));
  const evil = await publicResponse(req(k1, { headers: { origin: 'https://evil.example' } }), parts(k1), on);
  ok('an unknown origin gets no Access-Control-Allow-Origin; localhost only outside production', !evil.headers.has('access-control-allow-origin') && allowedOrigin('http://localhost:8080', true) === null && allowedOrigin('http://localhost:8080', false) === 'http://localhost:8080' && allowedOrigin('http://localhost.evil.example', false) === null);
  const bads = await Promise.all([
    publicResponse(req('tiles/x'), ['tiles', 'x'], on), publicResponse(req('state/access.json'), ['state', 'access.json'], on),
    publicResponse(req('ctx'), parts(`ctx/${A.id}/hg1-conus/4/0/0`), on), publicResponse(req('t'), ['tiles', A.id, 'hg1-conus', '0', '..', '1'], on),
  ]);
  ok('a key outside the grammar (or a context block, a compile input) is 400', bads.every((x) => x.status === 400), bads.map((x) => x.status).join(','));
  const miss = await publicResponse(req('t'), parts(tileKey(A.id, 'conus', 99, 99)), on);
  ok('a tile not built (and no compiler): 404', miss.status === 404);

  console.log('\nhometown hosting: the admin routes (upload, status, GC)');
  const admin: Deps = { cfg: { ...on.cfg, adminToken: TOKEN, dataDir: path.join(dir, 'nodata') }, store };
  const areq = (method: string, p: string, body?: Buffer | string, h: Record<string, string> = {}) => new Request(url(`admin/${p}`), { method, body: body as BodyInit | undefined, headers: { authorization: `Bearer ${TOKEN}`, ...h } });
  const noTok = await adminResponse(areq('GET', 'status'), ['status'], on);
  const wrong = await adminResponse(new Request(url('admin/status'), { headers: { authorization: 'Bearer nope' } }), ['status'], admin);
  const right = await adminResponse(areq('GET', 'status'), ['status'], admin);
  const sj = await right.json() as { usage: { used: number; cap: number } };
  ok('admin: 404 with no HOMETOWN_ADMIN_TOKEN, 401 with a wrong bearer, 200 with the right one', noTok.status === 404 && wrong.status === 401 && right.status === 200 && sj.usage.cap === 1024 * 1024);
  const P = buildRecord('upload');
  const put = (key: string, b: Buffer, h: Record<string, string> = {}) => adminResponse(areq('PUT', `objects/${key}`, b, h), ['objects', ...key.split('/')], admin);
  const ta = tileBody('ua'), tb = tileBody('ub');
  const kA = tileKey(P.id, 'conus', 1, 1), kB = tileKey(P.id, 'conus', 2, 1);
  const mk = manifestKey(P.id, 'us-4054200');
  const man = manifestFor(P.id, 'us-4054200', [{ id: 'hg1-conus/0/1/1', sha: ta.sha, bytes: ta.gz.length }, { id: 'hg1-conus/0/2/1', sha: tb.sha, bytes: tb.gz.length }]);
  const early = await put(mk, man);
  ok('a descriptor before its build record and tiles is refused (409): the place stays not built', early.status === 409 && !store.has(mk));
  const badRec = await put(buildKey(P.id), Buffer.from(stable({ format: 'hometown-build', grid: 'hg1', compilerVersion: '0.3.0', libs: { python: 'other' } })));
  ok('a build record that does not hash to its buildId is refused (400)', badRec.status === 400);
  const rec = await put(buildKey(P.id), P.body);
  const up1 = await put(kA, ta.gz, { 'x-content-sha256': ta.sha });
  const tamper = await put(kB, tb.gz, { 'x-content-sha256': ta.sha });
  const noSha = await put(kB, tb.gz);
  ok('a tile is stored with its content hash (201); a tampered or missing hash is refused (400)', rec.status === 201 && up1.status === 201 && tamper.status === 400 && noSha.status === 400 && !store.has(kB));
  const half = await put(mk, man);
  const hj = await half.json() as { missing?: number };
  ok('a half-uploaded place: its descriptor is refused (409, 1 tile missing)', half.status === 409 && hj.missing === 1);
  const pl0 = await publicResponse(req('places/us-4054200'), ['places', 'us-4054200'], on);
  ok('...and /places/{id} answers not-built (404), the ask kept for pre-warm', pl0.status === 404 && ((await pl0.json()) as { status: string }).status === 'not-built' && existsSync(store.statePath('requests.jsonl')));
  const junk = await Promise.all(['us-9999999', 'us-0000001', 'zz-junk', 'okemah'].map((id) => publicResponse(req(`places/${id}`), ['places', id], on)));
  const askLog = readFileSync(store.statePath('requests.jsonl'), 'utf8');
  ok('/places/{id} for an id the gazetteer does not know is 404 too, but never kept as a pre-warm ask', junk.every((r) => r.status === 404) && !/us-9999999|us-0000001|zz-junk|okemah/.test(askLog) && askable('us-4054200') && !askable('us-9999999'));
  await put(kB, tb.gz, { 'x-content-sha256': tb.sha });
  const done = await put(mk, man);
  const again = await put(kA, ta.gz, { 'x-content-sha256': ta.sha });
  const other = await put(kA, tb.gz, { 'x-content-sha256': tb.sha });
  ok('with every tile in, the descriptor goes in last (201); a re-run puts nothing twice (200), other bytes are 409', done.status === 201 && again.status === 200 && other.status === 409);
  const pl = await publicResponse(req('places/us-4054200', { headers: { origin: 'https://mc.gamemog.com' } }), ['places', 'us-4054200'], on);
  const plj = await pl.json() as { status: string; buildId: string; manifest: string; tileCount: number };
  ok('/places/{id} then answers built, with its build, descriptor address and tile count, for a minute', pl.status === 200 && plj.status === 'built' && plj.buildId === P.id && plj.manifest === `/api/hometown/${mk}` && plj.tileCount === 2 && pl.headers.get('cache-control') === 'public, max-age=60');
  const mres = await publicResponse(req(mk), parts(mk), on);
  ok('a descriptor is served as JSON, immutable', mres.status === 200 && mres.headers.get('content-type') === 'application/json' && /immutable/.test(mres.headers.get('cache-control') ?? ''));
  ok('verifyObject: a context block must be gzip of HTC1', !verifyObject(store, `ctx/${P.id}/hg1-conus/4/0/0`, ta.gz, ta.sha).ok && verifyObject(store, `ctx/${P.id}/hg1-conus/4/0/0`, gzipSync(Buffer.from('HTC1xyz')), sha(Buffer.from('HTC1xyz'))).ok);
  store.capBytes = 1; // (the spec's 0.01 GB cap, scaled to this check's few-byte tiles)
  const t3 = tileBody('full');
  const fullPut = await put(tileKey(P.id, 'conus', 3, 1), t3.gz, { 'x-content-sha256': t3.sha });
  const stillServes = await publicResponse(req(kA), parts(kA), on);
  ok('disk guard: with the cap tiny, an upload is 507 and stored tiles still serve', fullPut.status === 507 && stillServes.status === 200);
  store.capBytes = GB;
  const badTarget = await Promise.all(['abc', '-1', '1,5'].map((t) => adminResponse(areq('GET', `gc?target_gb=${t}`), ['gc'], admin)));
  ok('a GC target that is not a number of GB (abc, -1, 1,5) is 400, never a plan to collect everything', badTarget.every((r) => r.status === 400) && store.has(k1));
  const dry = await adminResponse(areq('GET', 'gc'), ['gc'], admin);
  const dj = await dry.json() as { dryRun: boolean; planId: string; delete: { keys: number; builds: string[] } };
  ok('GET admin/gc is a dry run with a plan id (here: the old build A, not the newest)', dry.status === 200 && dj.dryRun && dj.delete.builds.includes(A.id) && !dj.delete.builds.includes(P.id) && store.has(k1), JSON.stringify(dj.delete));
  const ap0 = await adminResponse(areq('POST', 'gc', JSON.stringify({ planId: 'x' }), { 'content-type': 'application/json' }), ['gc'], admin);
  const ap = await adminResponse(areq('POST', 'gc', JSON.stringify({ planId: dj.planId }), { 'content-type': 'application/json' }), ['gc'], admin);
  ok('POST admin/gc applies only the dry run\'s plan id', ap0.status === 409 && ap.status === 200 && !store.has(k1) && store.has(kA));
  const rq = await adminResponse(areq('GET', 'requests'), ['requests'], admin);
  ok('admin/requests lists the towns asked for', ((await rq.json()) as { places: { placeId: string }[] }).places.some((x) => x.placeId === 'us-4054200'));

  console.log('\nhometown hosting: compile on a miss (HOMETOWN_COMPILE=on; a fake compiler here)');
  const env = childEnv({ PATH: '/bin', HOMETOWN_ADMIN_TOKEN: 'x', ANTHROPIC_API_KEY: 'x', ADMIN_PASSWORD: 'x', HOME: '/h' });
  ok('the compiler child gets an allow-listed environment (no token, API key or admin password)', env.PATH === '/bin' && env.HOME === '/h' && !('HOMETOWN_ADMIN_TOKEN' in env) && !('ANTHROPIC_API_KEY' in env) && !('ADMIN_PASSWORD' in env));
  const cstore = new TileStore({ root: path.join(dir, 'cmp'), capBytes: GB, minFreeBytes: 0, freeBytes: () => 100 * GB, log: () => {} });
  const ccfg = { ...hometownConfig({ HOMETOWN_TILES: 'on', HOMETOWN_COMPILE: 'on', HOMETOWN_PYTHON: 'python3', HOMETOWN_COMPILER_DIR: dir, HOMETOWN_SOURCES_DIR: dir, HOMETOWN_DIR: path.join(dir, 'cmp') }) };
  let runs = 0;
  const W = buildRecord('w');
  const fake = async (argv: string[]) => {
    runs++;
    await new Promise((s) => setTimeout(s, 20));
    const [, , C0, R0] = argv[3].split('/').map(Number);
    if (C0 === 9) return { code: 3, err: '{"refused":"region hg1-conus/4/2/2 not fetched"}' };
    for (let r = R0 * 4; r < R0 * 4 + 4; r++) for (let c = C0 * 4; c < C0 * 4 + 4; c++) cstore.put(tileKey(W.id, 'conus', c, r), tileBody(`${c},${r}`).gz);
    return { code: 0, err: '' };
  };
  const comp2 = createCompilerWithBuild(ccfg, cstore, fake, W.id);
  const cdeps: Deps = { cfg: ccfg, store: cstore, compiler: comp2 };
  const tiles16 = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) tiles16.push(publicResponse(req('t'), parts(tileKey(W.id, 'conus', 4 + c, 4 + r)), cdeps));
  const rs = await Promise.all(tiles16);
  ok('16 players asking for the 16 tiles of one block: 16 x 200 from ONE compile', rs.every((x) => x.status === 200) && runs === 1, `${runs} compiles`);
  const refused = await publicResponse(req('t'), parts(tileKey(W.id, 'conus', 36, 4)), cdeps);
  ok('a block the compiler refuses (unfetched region) is 422', refused.status === 422);
  const other2 = await publicResponse(req('t'), parts(tileKey(A.id, 'conus', 0, 0)), cdeps);
  ok('a tile of a build that is not this compiler\'s is 404, nothing run', other2.status === 404 && runs === 2);
  const slow = async () => { await new Promise((s) => setTimeout(s, 50)); return { code: 1, err: 'x' }; };
  const busy = createCompilerWithBuild(ccfg, cstore, slow, W.id);
  const asks: Promise<void>[] = [];
  let shed = 0;
  for (let i = 0; i < 30; i++) { try { asks.push(busy.compileTileBlock(W.id, 'conus', 100 + i * 4, 0).catch(() => {})); } catch (e) { if (e instanceof CompileError && e.status === 503) shed++; } }
  await Promise.all(asks);
  ok('one compile at a time, at most 20 waiting: the rest are 503 (Retry-After)', shed === 9, `${shed} shed`);

  console.log('\nhometown hosting: the pre-warm list');
  const l = prewarmList(100);
  const ix = loadIndex();
  const pops = l.order.slice(NAMED.length).map((id) => l.places[id].pop2010 ?? -1);
  const withPop = [...ix.pop].filter((p) => p >= 0).sort((a, b) => b - a);
  ok('the top 100 by 2010 population plus the named towns, as us-<GEOID>, largest first', l.order.length === 101 && NAMED.every((id) => l.order.includes(id)) && l.order.every((id) => /^us-\d{7}$/.test(id))
    && l.places['us-3651000']?.name === 'New York, NY' && Math.min(...l.order.filter((id) => !NAMED.includes(id)).map((id) => l.places[id].pop2010!)) === withPop[99], `smallest ${withPop[99]}`);
  ok('a place with no 2010 population is never on the ranked part', pops.every((p) => p > 0) && l.skippedNoPop > 0);
  const side = (b: number[], lat: number) => Math.max((b[2] - b[0]) * 111320 * Math.cos((lat * Math.PI) / 180), (b[3] - b[1]) * 111132);
  ok(`every play box is a square of at most ${PLAY_SIDE_M} m round the Census internal point`, l.order.every((id) => { const p = l.places[id]; const s = side(p.bbox, p.anchor[1]); return s <= PLAY_SIDE_M + 1 && Math.abs((p.bbox[0] + p.bbox[2]) / 2 - p.anchor[0]) < 1e-5 && Math.abs((p.bbox[1] + p.bbox[3]) / 2 - p.anchor[1]) < 1e-5; }));
  ok('a small town keeps its own smaller box', side(playBox({ lat: 35, lon: -96, bbox: [-96.01, 34.99, -95.99, 35.01] }), 35) < 2300);
  ok('the list is deterministic', JSON.stringify(prewarmList(100)) === JSON.stringify(l));
}

const createCompilerWithBuild = (cfg: ReturnType<typeof hometownConfig>, store: TileStore, run: Parameters<typeof createCompiler>[2], build: string) => createCompiler(cfg, store, run, () => build);

if (import.meta.url === `file://${process.argv[1]}`) {
  let failed = 0;
  await runHometownTilesChecks((name, cond, detail) => { if (!cond) failed++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`); });
  process.exit(failed ? 1 : 0);
}
