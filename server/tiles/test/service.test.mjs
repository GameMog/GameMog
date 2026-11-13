import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTileService, tileSetHash } from '../src/service.mjs';
import { createFakeCompiler, createSubprocessCompiler, compilerRegistry } from '../src/compilers/index.mjs';
import { MemoryStore, DiskStore, S3Store } from '../src/storage/index.mjs';
import { loadGazetteer } from '../src/places.mjs';
import { LRU } from '../src/lru.mjs';
import { decode, sha256 } from '../src/util.mjs';
import { startMockS3 } from './mock-s3.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const places = await loadGazetteer(path.join(here, '..', 'fixtures', 'places.json'));
const T = { z: '16', x: '10483', y: '25329' }; // a z16 tile in San Francisco

function svc(opts = {}) {
  const compilers = opts.compilers || [createFakeCompiler({ version: 'fake-1', delayMs: opts.delayMs ?? 0 })];
  return createTileService({ store: opts.store || new MemoryStore(), compilers: compilerRegistry(compilers), places, currentVersion: opts.currentVersion || compilers.at(-1)?.version, lru: opts.lru, maxConcurrentCompiles: opts.maxConcurrentCompiles ?? 4 });
}

test('miss compiles and stores, then memory and store hits serve the same bytes', async () => {
  const store = new MemoryStore();
  const fake = createFakeCompiler({ version: 'fake-1' });
  const s = svc({ store, compilers: [fake] });
  const a = await s.getTile('fake-1', T.z, T.x, T.y);
  assert.equal(a.source, 'compiled');
  const b = await s.getTile('fake-1', T.z, T.x, T.y);
  assert.equal(b.source, 'memory');
  s.lru.clear();
  const c = await s.getTile('fake-1', T.z, T.x, T.y);
  assert.equal(c.source, 'store');
  assert.equal(fake.total, 1);
  assert.deepEqual(a.body, b.body);
  assert.deepEqual(a.body, c.body);
  assert.equal(a.meta.hash, sha256(a.body));
  assert.equal(a.meta.contentHash, sha256(decode(a.body, 'gzip')));
  assert.equal(JSON.parse(decode(a.body, 'gzip')).format, 'hometown-tile-placeholder');
});

test('single-flight: 100 concurrent misses for one key compile exactly once', async () => {
  const fake = createFakeCompiler({ version: 'fake-1', delayMs: 40 });
  const store = new MemoryStore();
  const s = svc({ store, compilers: [fake] });
  const rs = await Promise.all(Array.from({ length: 100 }, () => s.getTile('fake-1', T.z, T.x, T.y)));
  assert.equal(fake.total, 1);
  assert.equal(fake.calls.get(`${T.z}/${T.x}/${T.y}`), 1);
  assert.equal(store.puts, 1);
  assert.equal(s.flight.shared, 99);
  assert.ok(rs.every((r) => r.body.equals(rs[0].body)));
});

test('version keying: a new compiler version never serves an old version\'s tile; old pinned versions keep resolving', async () => {
  const store = new MemoryStore();
  const v1 = createFakeCompiler({ version: 'fake-1' }), v2 = createFakeCompiler({ version: 'fake-2' });
  const s = svc({ store, compilers: [v1, v2] });
  const a = await s.getTile('fake-1', T.z, T.x, T.y);
  const b = await s.getTile('fake-2', T.z, T.x, T.y);
  assert.equal(b.source, 'compiled', 'fake-2 compiled its own tile instead of reusing fake-1\'s');
  assert.notEqual(a.meta.hash, b.meta.hash);
  assert.equal(JSON.parse(decode(b.body, 'gzip')).compiler, 'fake-2');
  // A later deployment drops the fake-1 compiler: fake-1 tiles that were compiled still resolve, byte for byte.
  const later = svc({ store, compilers: [createFakeCompiler({ version: 'fake-2' })] });
  const a2 = await later.getTile('fake-1', T.z, T.x, T.y);
  assert.deepEqual(a2.body, a.body);
  // ...but nothing is compiled for a version that has no compiler (no cache filling from typos or scans).
  await assert.rejects(later.getTile('fake-1', T.z, T.x, String(Number(T.y) + 1)), (e) => e.status === 404);
  await assert.rejects(later.getTile('nope-9', T.z, T.x, T.y), (e) => e.status === 404);
  assert.equal(store.objects.size, 2);
});

test('a failed compile is not cached and the next request retries', async () => {
  let fail = true;
  const fake = createFakeCompiler({ version: 'fake-1', failOn: () => fail });
  const store = new MemoryStore();
  const s = svc({ store, compilers: [fake] });
  const rs = await Promise.allSettled(Array.from({ length: 10 }, () => s.getTile('fake-1', T.z, T.x, T.y)));
  assert.ok(rs.every((r) => r.status === 'rejected' && r.reason.status === 502));
  assert.equal(fake.total, 1);
  assert.equal(store.objects.size, 0);
  fail = false;
  assert.equal((await s.getTile('fake-1', T.z, T.x, T.y)).source, 'compiled');
  assert.equal(fake.total, 2);
});

test('compile concurrency is capped across keys', async () => {
  let active = 0, peak = 0;
  const slow = { version: 'fake-1', async compileTile(k) { active++; peak = Math.max(peak, active); await new Promise((r) => setTimeout(r, 15)); active--; return { body: Buffer.from(`${k.z}/${k.x}/${k.y}`) }; } };
  const s = svc({ compilers: [slow], maxConcurrentCompiles: 3 });
  await Promise.all(Array.from({ length: 20 }, (_, i) => s.getTile('fake-1', '16', String(10000 + i), '25000')));
  assert.equal(peak, 3);
});

test('two processes racing on one disk store: the loser serves the winner\'s bytes', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tiles-race-'));
  try {
    let n = 0;
    const nondet = () => ({ version: 'fake-1', async compileTile() { await new Promise((r) => setTimeout(r, 20)); return { body: Buffer.from(`run-${++n}`) }; } });
    const p1 = svc({ store: new DiskStore({ root: dir }), compilers: [nondet()] });
    const p2 = svc({ store: new DiskStore({ root: dir }), compilers: [nondet()] });
    const [a, b] = await Promise.all([p1.getTile('fake-1', T.z, T.x, T.y), p2.getTile('fake-1', T.z, T.x, T.y)]);
    assert.equal(n, 2, 'both processes compiled (single-flight is per process)');
    assert.deepEqual(a.body, b.body, 'but both serve the one stored copy');
    assert.equal(p1.stats.lostRaces + p2.stats.lostRaces, 1);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('manifest: deterministic tile set, hash over content hashes, stored once', async () => {
  const fake = createFakeCompiler({ version: 'fake-1' });
  const s = svc({ compilers: [fake] });
  const e = await s.getManifest('sf-union-square');
  const m = JSON.parse(e.body);
  assert.equal(m.format, 'hometown-tileset');
  assert.equal(m.compilerVersion, 'fake-1');
  assert.equal(m.tileCount, m.tiles.length);
  assert.equal(fake.total, m.tileCount);
  assert.equal(m.tileSetHash, tileSetHash(m.tiles));
  // A second, independent service with its own store and compiler produces the same manifest bytes.
  const e2 = await svc().getManifest('sf-union-square', 'fake-1');
  assert.deepEqual(e2.body, e.body);
  await assert.rejects(s.getManifest('nowhere'), (x) => x.status === 404);
  await assert.rejects(s.getManifest('Bad Id'), (x) => x.status === 400);
});

test('city lock: resolving a lock returns identical bytes across restarts, version bumps and compiler removal', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tiles-lock-'));
  try {
    const s1 = svc({ store: new DiskStore({ root: dir }), compilers: [createFakeCompiler({ version: 'fake-1' })] });
    const lock = await s1.createLock('okemah-ok');
    assert.deepEqual(Object.keys(lock).sort(), ['compilerVersion', 'format', 'formatVersion', 'placeId', 'tileSetHash']);
    assert.equal(lock.compilerVersion, 'fake-1');
    const m1 = JSON.parse((await s1.resolveLock(lock)).body);
    const bytes1 = await Promise.all(m1.tiles.map(async (t) => (await s1.getTile('fake-1', t.z, t.x, t.y)).body));

    // "Restart" after a compiler upgrade: fresh process, empty LRU, only fake-2 can compile now.
    const v2 = createFakeCompiler({ version: 'fake-2' });
    const s2 = svc({ store: new DiskStore({ root: dir }), compilers: [v2], lru: new LRU() });
    const latest = await s2.createLock('okemah-ok');
    assert.equal(latest.compilerVersion, 'fake-2');
    assert.notEqual(latest.tileSetHash, lock.tileSetHash, 'the new version is a different city build');
    const before = v2.total;
    const proof = await s2.verifyLock(lock);
    assert.equal(proof.ok, true);
    assert.equal(proof.tileSetHash, lock.tileSetHash);
    assert.equal(v2.total, before, 'resolving the old lock compiled nothing');
    const m2 = JSON.parse((await s2.resolveLock(lock)).body);
    assert.deepEqual(m2, m1);
    const bytes2 = await Promise.all(m2.tiles.map(async (t) => (await s2.getTile('fake-1', t.z, t.x, t.y)).body));
    assert.deepEqual(bytes2, bytes1);

    // A lock whose hash does not match what is stored is refused, not silently served.
    await assert.rejects(s2.resolveLock({ ...lock, tileSetHash: 'a'.repeat(64) }), (e) => e.status === 409);
    await assert.rejects(s2.resolveLock({ ...lock, tileSetHash: 'nothex' }), (e) => e.status === 400);

    // If a stored tile is lost and recompiled to different bytes, verifyLock catches it.
    const t0 = m1.tiles[0];
    await new DiskStore({ root: dir }).delete(`tiles/fake-1/${t0.z}/${t0.x}/${t0.y}`);
    const drift = { version: 'fake-1', async compileTile() { return { body: Buffer.from('drifted') }; } };
    const s3 = svc({ store: new DiskStore({ root: dir }), compilers: [drift] });
    await assert.rejects(s3.verifyLock(lock), (e) => e.status === 409);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('the tile service over the S3 backend (local mock)', async () => {
  const mock = await startMockS3({ port: 4692 });
  try {
    const store = new S3Store({ endpoint: mock.endpoint, bucket: mock.bucket, region: mock.region, accessKeyId: mock.accessKeyId, secretAccessKey: mock.secretAccessKey });
    const fake = createFakeCompiler({ version: 'fake-1', delayMs: 10 });
    const s = svc({ store, compilers: [fake] });
    const lock = await s.createLock('marfa-tx');
    const s2 = svc({ store, compilers: [createFakeCompiler({ version: 'fake-2' })] });
    const proof = await s2.verifyLock(lock);
    assert.equal(proof.ok, true);
    assert.ok(mock.objects.size >= proof.tiles + 1);
  } finally { await mock.close(); }
});

test('subprocess compiler adapter (how M2\'s compiler plugs in)', async () => {
  const cmd = createSubprocessCompiler({
    version: 'cmd-1', argv: [process.execPath, path.join(here, '..', 'fixtures', 'fake-compiler-cmd.mjs'), '{version}', '{z}/{x}/{y}', '{west},{south},{east},{north}'],
    contentType: 'application/json',
  });
  const s = svc({ compilers: [cmd] });
  const e = await s.getTile('cmd-1', '16', '12', '7');
  const j = JSON.parse(e.body);
  assert.equal(j.tile, '16/12/7');
  assert.equal(j.version, 'cmd-1');
  assert.equal(j.bbox.length, 4);
  await assert.rejects(s.getTile('cmd-1', '16', '13', '7'), (x) => x.status === 502 && /scripted failure/.test(x.message));
});
