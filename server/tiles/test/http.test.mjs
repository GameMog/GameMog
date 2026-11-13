import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { createTileService } from '../src/service.mjs';
import { createFakeCompiler, compilerRegistry } from '../src/compilers/index.mjs';
import { MemoryStore } from '../src/storage/index.mjs';
import { loadGazetteer } from '../src/places.mjs';
import { createHttpHandler, acceptedEncodings, accepts } from '../src/http.mjs';

const PORT = Number(process.env.TILES_TEST_PORT || 4691);
const here = path.dirname(fileURLToPath(import.meta.url));
const places = await loadGazetteer(path.join(here, '..', 'fixtures', 'places.json'));
const gz = createFakeCompiler({ version: 'fake-1', delayMs: 40 });
const br = createFakeCompiler({ version: 'fake-br', contentEncoding: 'br' });
const service = createTileService({ store: new MemoryStore(), compilers: compilerRegistry([br, gz]), places, currentVersion: 'fake-1' });
const ADMIN = 'test-admin-token';
const DECODED_CAP = 3000; // bytes; a fake tile decodes to ~1.1 KB
const handler = createHttpHandler(service, { adminToken: ADMIN, decodedCacheBytes: DECODED_CAP });
const server = http.createServer(handler);
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
const agent = new http.Agent({ keepAlive: true, maxSockets: 200 });

function get(p, headers = {}, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: PORT, path: p, method, headers, agent }, (res) => {
      const c = [];
      res.on('data', (d) => c.push(d));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(c) }));
    });
    req.on('error', reject);
    req.end();
  });
}

const TP = '/tiles/fake-1/hg1-conus/0/1400/7423';
test('100 concurrent HTTP misses for one tile: one block compile, 100 identical 200s; then a cache hit', async () => {
  const rs = await Promise.all(Array.from({ length: 100 }, () => get('/tiles/fake-1/hg1-conus/0/1400/7424', { 'accept-encoding': 'gzip' })));
  assert.ok(rs.every((r) => r.status === 200));
  assert.equal(gz.calls.get('hg1-conus/0/1400/7424'), 1);
  assert.equal(gz.blocks, 1);
  const hit = await get('/tiles/fake-1/hg1-conus/0/1401/7424', { 'accept-encoding': 'gzip' });
  assert.equal(hit.headers['x-tile-source'], 'memory', 'a sibling in the compiled block: a cache hit, no compile');
  assert.equal(gz.blocks, 1);
  assert.ok(rs.every((r) => r.body.equals(rs[0].body) && r.headers.etag === rs[0].headers.etag));
});

test('tile headers: immutable, ETag, Vary, gzip passthrough, identity fallback, 304, HEAD', async () => {
  const a = await get('/tiles/fake-1/hg1-conus/0/1400/7423', { 'accept-encoding': 'gzip, br' });
  assert.equal(a.status, 200);
  assert.equal(a.headers['cache-control'], 'public, max-age=31536000, immutable');
  assert.equal(a.headers['content-encoding'], 'gzip');
  assert.equal(a.headers.vary, 'Accept-Encoding');
  assert.match(a.headers.etag, /^"[0-9a-f]{40}"$/);
  assert.equal(a.headers['x-tile-source'], 'compiled');
  const raw = zlib.gunzipSync(a.body);
  assert.equal(JSON.parse(raw).format, 'hometown-tile-placeholder');
  assert.equal(JSON.parse(raw).id, 'hg1-conus/0/1400/7423');
  const plain = await get('/tiles/fake-1/hg1-conus/0/1400/7423', { 'accept-encoding': 'identity' });
  assert.equal(plain.headers['content-encoding'], undefined);
  assert.deepEqual(plain.body, raw);
  assert.notEqual(plain.headers.etag, a.headers.etag);
  assert.equal(plain.headers['x-content-sha256'], a.headers['x-content-sha256']);
  const again = await get('/tiles/fake-1/hg1-conus/0/1400/7423', { 'accept-encoding': 'gzip', 'if-none-match': a.headers.etag });
  assert.equal(again.status, 304);
  assert.equal(again.body.length, 0);
  const head = await get('/tiles/fake-1/hg1-conus/0/1400/7423', { 'accept-encoding': 'gzip' }, 'HEAD');
  assert.equal(head.status, 200);
  assert.equal(Number(head.headers['content-length']), a.body.length);
  const b = await get('/tiles/fake-br/hg1-conus/0/1400/7423', { 'accept-encoding': 'gzip, deflate, br' });
  assert.equal(b.headers['content-encoding'], 'br');
  assert.equal(JSON.parse(zlib.brotliDecompressSync(b.body)).buildId, 'fake-br');
  const bOnlyGzip = await get('/tiles/fake-br/hg1-conus/0/1400/7423', { 'accept-encoding': 'gzip' });
  assert.equal(bOnlyGzip.headers['content-encoding'], undefined);
});

test('errors: bad keys 400, unregistered build 410 (no compile), wrong method 405, unknown route 404', async () => {
  const before = gz.total + br.total;
  for (const p of ['/tiles/fake-1/hg1-conus/0/99999999/1', '/tiles/..%2F..%2Fetc/hg1-conus/0/1/1', '/tiles/fake-1/hg1-conus/0/1/%E0%A4%A', '/tiles/fake-1/hg1-conus/1/1/1',
    '/tiles/fake-1/hg1-mars/0/1/1', '/tiles/fake-1/hg1-conus/0/-1/1', '/tiles/fake-1/hg1-conus/0/12001/1', '/tiles/fake-1/hg1-hi/0/1/4001']) assert.equal((await get(p)).status, 400, p);
  const nov = await get('/tiles/fake-9/hg1-conus/0/1/1');
  assert.equal(nov.status, 410);
  assert.match(JSON.parse(nov.body).error, /not registered/);
  assert.equal((await get('/tiles/fake-1/hg1-conus/0/1/1', {}, 'POST')).status, 405);
  assert.equal((await get('/tiles/fake-1/16/1/1')).status, 404, 'the old Web-Mercator route is gone');
  assert.equal((await get('/nope')).status, 404);
  assert.equal(gz.total + br.total, before);
});

test('manifest, lock and lock resolution over HTTP', async () => {
  const cur = await get('/places/marfa-tx/manifest');
  assert.equal(cur.status, 200);
  assert.equal(cur.headers['cache-control'], 'public, max-age=300');
  const pinned = await get('/places/marfa-tx/manifest?version=fake-1');
  assert.equal(pinned.headers['cache-control'], 'public, max-age=31536000, immutable');
  assert.deepEqual(pinned.body, cur.body);
  const lock = JSON.parse((await get('/places/marfa-tx/lock')).body);
  assert.equal(lock.buildId, 'fake-1');
  assert.equal(lock.formatVersion, 2);
  const r = await get(`/locks/${lock.place}/${lock.buildId}/${lock.tiles}`);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, cur.body);
  assert.deepEqual((await get(`/manifests/fake-1/marfa-tx`)).body, cur.body);
  assert.equal((await get(`/locks/marfa-tx/fake-1/${'0'.repeat(64)}`)).status, 409);
  assert.equal((await get('/places/nowhere/manifest')).status, 404);
  const h = JSON.parse((await get('/healthz')).body);
  assert.equal(h.ok, true);
  assert.deepEqual(h.versions.sort(), ['fake-1', 'fake-br']);
});

test('locked tiles over HTTP: served from the lock\'s set, 404 outside it', async () => {
  const lock = JSON.parse((await get('/places/marfa-tx/lock')).body);
  const m = JSON.parse((await get(`/locks/${lock.place}/${lock.buildId}/${lock.tiles}`)).body);
  const t = m.tiles[0];
  const base = `/locks/${lock.place}/${lock.buildId}/${lock.tiles}/tiles`;
  const r = await get(`${base}/${t.id}`, { 'accept-encoding': 'gzip' });
  assert.equal(r.status, 200);
  assert.equal(r.headers['x-content-sha256'], t.contentHash);
  assert.equal(r.headers['x-tile-lock'], undefined);
  assert.deepEqual(r.body, (await get(`/tiles/fake-1/${t.id}`, { 'accept-encoding': 'gzip' })).body);
  const out = await get(`${base}/hg1-conus/0/100/100`);
  assert.equal(out.status, 200, 'outside the locked set: served unlocked at the same build');
  assert.match(out.headers['x-tile-lock'], /unlocked/);
  assert.equal((await get(`/locks/marfa-tx/fake-1/${'0'.repeat(64)}/tiles/${t.id}`)).status, 409);
});

test('admin verify route: local or bearer token only; healthz hides the store from non-local callers', async () => {
  const lock = JSON.parse((await get('/places/marfa-tx/lock')).body);
  const p = `/admin/verify/${lock.place}/${lock.buildId}/${lock.tiles}`;
  assert.equal((await get('/ctx/fake-1/hg1-conus/4/362/536')).status, 200);
  assert.equal((await get('/ctx/fake-1/hg1-conus/4/362/536', { 'x-forwarded-for': '203.0.113.9' })).status, 403);
  const local = await get(p);
  assert.equal(local.status, 200);
  assert.equal(local.headers['cache-control'], 'no-store');
  assert.equal(JSON.parse(local.body).ok, true);
  const proxied = { 'x-forwarded-for': '203.0.113.9' }; // through a proxy: not local any more
  assert.equal((await get(p, proxied)).status, 403);
  assert.equal((await get(p, { ...proxied, authorization: 'Bearer wrong' })).status, 403);
  assert.equal((await get(p, { ...proxied, authorization: `Bearer ${ADMIN}` })).status, 200);
  assert.equal((await get(`/admin/verify/marfa-tx/fake-1/${'0'.repeat(64)}`)).status, 409);
  const pub = JSON.parse((await get('/healthz', proxied)).body);
  assert.equal(pub.ok, true);
  assert.equal(pub.store, undefined);
  assert.equal(pub.versions, undefined);
  assert.equal(typeof pub.stats.compiles, 'number');
  const priv = JSON.parse((await get('/healthz')).body);
  assert.equal(priv.store, 'memory');
});

test('decoded-copy cache is capped by bytes', async () => {
  for (let i = 0; i < 8; i++) {
    const r = await get(`/tiles/fake-1/hg1-conus/0/${2000 + 4 * i}/7000`, { 'accept-encoding': 'identity' });
    assert.equal(r.status, 200);
    assert.equal(r.headers['content-encoding'], undefined);
  }
  assert.ok(handler.decodedCache, 'the handler exposes its decoded-copy cache');
  assert.ok(handler.decodedCache.bytes <= DECODED_CAP, `decoded cache holds ${handler.decodedCache.bytes} bytes, over ${DECODED_CAP}`);
  assert.ok(handler.decodedCache.size >= 1);
});

test('Accept-Encoding parsing', () => {
  const m = acceptedEncodings('gzip;q=0, br;q=0.5, *;q=0.1');
  assert.equal(accepts(m, 'gzip'), false);
  assert.equal(accepts(m, 'br'), true);
  assert.equal(accepts(acceptedEncodings(''), 'gzip'), false);
  assert.equal(accepts(acceptedEncodings('*'), 'br'), true);
});

test('shut down the test server', async () => {
  agent.destroy();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
});
