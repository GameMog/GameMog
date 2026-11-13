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
import { createServer, acceptedEncodings, accepts } from '../src/http.mjs';

const PORT = 4691;
const here = path.dirname(fileURLToPath(import.meta.url));
const places = await loadGazetteer(path.join(here, '..', 'fixtures', 'places.json'));
const gz = createFakeCompiler({ version: 'fake-1', delayMs: 40 });
const br = createFakeCompiler({ version: 'fake-br', contentEncoding: 'br' });
const service = createTileService({ store: new MemoryStore(), compilers: compilerRegistry([br, gz]), places, currentVersion: 'fake-1' });
const server = createServer(service);
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

test('100 concurrent HTTP misses for one tile: one compile, 100 identical 200s', async () => {
  const rs = await Promise.all(Array.from({ length: 100 }, () => get('/tiles/fake-1/16/10483/25330', { 'accept-encoding': 'gzip' })));
  assert.ok(rs.every((r) => r.status === 200));
  assert.equal(gz.calls.get('16/10483/25330'), 1);
  assert.ok(rs.every((r) => r.body.equals(rs[0].body) && r.headers.etag === rs[0].headers.etag));
});

test('tile headers: immutable, ETag, Vary, gzip passthrough, identity fallback, 304, HEAD', async () => {
  const a = await get('/tiles/fake-1/16/10483/25329', { 'accept-encoding': 'gzip, br' });
  assert.equal(a.status, 200);
  assert.equal(a.headers['cache-control'], 'public, max-age=31536000, immutable');
  assert.equal(a.headers['content-encoding'], 'gzip');
  assert.equal(a.headers.vary, 'Accept-Encoding');
  assert.match(a.headers.etag, /^"[0-9a-f]{40}"$/);
  assert.equal(a.headers['x-tile-source'], 'compiled');
  const raw = zlib.gunzipSync(a.body);
  assert.equal(JSON.parse(raw).format, 'hometown-tile-placeholder');
  const plain = await get('/tiles/fake-1/16/10483/25329', { 'accept-encoding': 'identity' });
  assert.equal(plain.headers['content-encoding'], undefined);
  assert.deepEqual(plain.body, raw);
  assert.notEqual(plain.headers.etag, a.headers.etag);
  assert.equal(plain.headers['x-content-sha256'], a.headers['x-content-sha256']);
  const again = await get('/tiles/fake-1/16/10483/25329', { 'accept-encoding': 'gzip', 'if-none-match': a.headers.etag });
  assert.equal(again.status, 304);
  assert.equal(again.body.length, 0);
  const head = await get('/tiles/fake-1/16/10483/25329', { 'accept-encoding': 'gzip' }, 'HEAD');
  assert.equal(head.status, 200);
  assert.equal(Number(head.headers['content-length']), a.body.length);
  const b = await get('/tiles/fake-br/16/10483/25329', { 'accept-encoding': 'gzip, deflate, br' });
  assert.equal(b.headers['content-encoding'], 'br');
  assert.equal(JSON.parse(zlib.brotliDecompressSync(b.body)).compiler, 'fake-br');
  const bOnlyGzip = await get('/tiles/fake-br/16/10483/25329', { 'accept-encoding': 'gzip' });
  assert.equal(bOnlyGzip.headers['content-encoding'], undefined);
});

test('errors: bad keys 400, unknown version 404 (no compile), wrong method 405, unknown route 404', async () => {
  const before = gz.total + br.total;
  assert.equal((await get('/tiles/fake-1/16/99999999/1')).status, 400);
  assert.equal((await get('/tiles/..%2F..%2Fetc/16/1/1')).status, 400);
  assert.equal((await get('/tiles/fake-1/16/1/%E0%A4%A')).status, 400);
  assert.equal((await get('/tiles/fake-1/9/1/1')).status, 400);
  const nov = await get('/tiles/fake-9/16/1/1');
  assert.equal(nov.status, 404);
  assert.match(JSON.parse(nov.body).error, /no compiler/);
  assert.equal((await get('/tiles/fake-1/16/1/1', {}, 'POST')).status, 405);
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
  assert.equal(lock.compilerVersion, 'fake-1');
  const r = await get(`/locks/${lock.placeId}/${lock.compilerVersion}/${lock.tileSetHash}`);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, cur.body);
  assert.equal((await get(`/locks/marfa-tx/fake-1/${'0'.repeat(64)}`)).status, 409);
  assert.equal((await get('/places/nowhere/manifest')).status, 404);
  const h = JSON.parse((await get('/healthz')).body);
  assert.equal(h.ok, true);
  assert.deepEqual(h.versions.sort(), ['fake-1', 'fake-br']);
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
