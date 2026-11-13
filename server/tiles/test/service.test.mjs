import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
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
const T = ['hg1-conus', '0', '1400', '7423']; // an L0 tile in San Francisco (L2 block 350/1855)
const KEY = 'tiles/fake-1/hg1-conus/0/1400/7423';
const PORT_S3 = Number(process.env.TILES_TEST_PORT || 4692);

function svc(opts = {}) {
  const compilers = opts.compilers || [createFakeCompiler({ version: 'fake-1', delayMs: opts.delayMs ?? 0 })];
  return createTileService({ store: opts.store || new MemoryStore(), compilers: compilerRegistry(compilers), places, currentVersion: opts.currentVersion || compilers.at(-1)?.version,
    lru: opts.lru, maxConcurrentCompiles: opts.maxConcurrentCompiles ?? 4, blockLevel: opts.blockLevel ?? 2 });
}

test('a miss compiles the tile\'s L2 block once, stores its 16 children; memory and store hits serve the same bytes', async () => {
  const store = new MemoryStore();
  const fake = createFakeCompiler({ version: 'fake-1' });
  const s = svc({ store, compilers: [fake] });
  const a = await s.getTile('fake-1', ...T);
  assert.equal(a.source, 'compiled');
  assert.equal(fake.blocks, 1);
  assert.equal(fake.total, 16);
  assert.ok(store.objects.has(KEY));
  assert.ok(store.objects.has('tiles/fake-1/hg1-conus/0/1403/7420') && store.objects.has('tiles/fake-1/hg1-conus/0/1400/7420'));
  const b = await s.getTile('fake-1', ...T);
  assert.equal(b.source, 'memory');
  s.lru.clear();
  const c = await s.getTile('fake-1', ...T);
  assert.equal(c.source, 'store');
  const sib = await s.getTile('fake-1', 'hg1-conus', '0', '1401', '7422');
  assert.equal(sib.source, 'store', 'a sibling of the block is a store hit');
  assert.equal(fake.blocks, 1);
  assert.deepEqual(a.body, c.body);
  assert.equal(a.meta.hash, sha256(a.body));
  assert.equal(a.meta.contentHash, sha256(decode(a.body, 'gzip')));
  assert.equal(JSON.parse(decode(a.body, 'gzip')).id, 'hg1-conus/0/1400/7423');
});

test('single-flight: 100 concurrent misses for one tile, and for all 16 tiles of a block, compile the block once', async () => {
  const fake = createFakeCompiler({ version: 'fake-1', delayMs: 40 });
  const store = new MemoryStore();
  const s = svc({ store, compilers: [fake] });
  const rs = await Promise.all(Array.from({ length: 100 }, () => s.getTile('fake-1', ...T)));
  assert.equal(fake.blocks, 1);
  assert.equal(fake.calls.get('hg1-conus/0/1400/7423'), 1);
  assert.equal(store.puts, 16);
  assert.ok(rs.every((r) => r.body.equals(rs[0].body)));
  const f2 = createFakeCompiler({ version: 'fake-1', delayMs: 40 });
  const s2 = svc({ compilers: [f2] });
  const all = [];
  for (let k = 0; k < 7; k++) for (let r = 7420; r < 7424; r++) for (let c = 1400; c < 1404; c++) all.push(s2.getTile('fake-1', 'hg1-conus', 0, c, r));
  await Promise.all(all);
  assert.equal(f2.blocks, 1, '112 GETs over a block: one block compile');
  assert.equal(f2.total, 16);
});

test('build keying: a new build never serves an old build\'s tile; old builds keep resolving; an unregistered build is 410 and compiles nothing', async () => {
  const store = new MemoryStore();
  const v1 = createFakeCompiler({ version: 'fake-1' }), v2 = createFakeCompiler({ version: 'fake-2' });
  const s = svc({ store, compilers: [v1, v2] });
  const a = await s.getTile('fake-1', ...T);
  const b = await s.getTile('fake-2', ...T);
  assert.equal(b.source, 'compiled');
  assert.notEqual(a.meta.hash, b.meta.hash);
  const later = svc({ store, compilers: [createFakeCompiler({ version: 'fake-2' })] });
  assert.deepEqual((await later.getTile('fake-1', ...T)).body, a.body);
  await assert.rejects(later.getTile('fake-1', 'hg1-conus', '0', '1400', '7500'), (e) => e.status === 410 && /not registered/.test(e.message));
  await assert.rejects(later.getTile('htc-0.3.0-hg1-b00000000', ...T), (e) => e.status === 410);
  assert.equal(store.objects.size, 32);
});

test('keys: 400 for a bad domain, level, negative, non-decimal or out-of-bounds key, and a bad build id', async () => {
  const fake = createFakeCompiler({ version: 'fake-1' });
  const s = svc({ compilers: [fake] });
  for (const bad of [['fake-1', 'hg1-mars', '0', '1', '1'], ['fake-1', 'hg2-conus', '0', '1', '1'], ['fake-1', 'hg1-conus', '1', '1', '1'], ['fake-1', 'hg1-conus', '4', '1', '1'],
    ['fake-1', 'hg1-conus', '0', '-1', '1'], ['fake-1', 'hg1-conus', '0', '0x1', '1'], ['fake-1', 'hg1-conus', '0', '01', '1'], ['fake-1', 'hg1-conus', '0', '12001', '1'],
    ['fake-1', 'hg1-hi', '0', '4001', '1'], ['fake-1', 'hg1-ak', '0', '1', '10001'], ['fake-1', 'hg1-conus', '0', '1234567', '1'], ['..', 'hg1-conus', '0', '1', '1'], ['v/1', 'hg1-conus', '0', '1', '1']]) {
    await assert.rejects(s.getTile(...bad), (e) => e.status === 400, bad.join('/'));
  }
  assert.equal(fake.total, 0);
});

test('a failed compile is not cached and the next request retries; a refused tile is 422, not cached', async () => {
  let fail = true;
  const fake = createFakeCompiler({ version: 'fake-1', failOn: () => fail });
  const store = new MemoryStore();
  const s = svc({ store, compilers: [fake] });
  const rs = await Promise.allSettled(Array.from({ length: 10 }, () => s.getTile('fake-1', ...T)));
  assert.ok(rs.every((r) => r.status === 'rejected' && r.reason.status === 502));
  assert.equal(fake.blocks, 1);
  assert.equal(store.objects.size, 0);
  fail = false;
  assert.equal((await s.getTile('fake-1', ...T)).source, 'compiled');
  const ref = createFakeCompiler({ version: 'fake-1', refuseOn: (k) => k.c === 1400 && k.r === 7423 });
  const sr = svc({ compilers: [ref] });
  await assert.rejects(sr.getTile('fake-1', ...T), (e) => e.status === 422 && /refused/.test(e.message));
  assert.notEqual((await sr.getTile('fake-1', 'hg1-conus', 0, 1401, 7423)).source, 'compiled', 'its siblings were stored by the one block compile');
  assert.equal(ref.blocks, 1);
  assert.equal(sr.stats.refused >= 1, true);
});

test('compile concurrency is capped across keys (tile by tile, block level 0)', async () => {
  let active = 0, peak = 0;
  const slow = { version: 'fake-1', async compileTile(k) { active++; peak = Math.max(peak, active); await new Promise((r) => setTimeout(r, 15)); active--; return { body: Buffer.from(k.id) }; } };
  const s = svc({ compilers: [slow], maxConcurrentCompiles: 3, blockLevel: 0 });
  await Promise.all(Array.from({ length: 20 }, (_, i) => s.getTile('fake-1', 'hg1-conus', '0', String(1000 + i), '7000')));
  assert.equal(peak, 3);
});

test('two processes racing on one disk store: the loser serves the winner\'s bytes', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tiles-race-'));
  try {
    let n = 0;
    const nondet = () => ({ version: 'fake-1', async compileTile() { await new Promise((r) => setTimeout(r, 20)); return { body: Buffer.from(`run-${++n}`) }; } });
    const p1 = svc({ store: new DiskStore({ root: dir }), compilers: [nondet()], blockLevel: 0 });
    const p2 = svc({ store: new DiskStore({ root: dir }), compilers: [nondet()], blockLevel: 0 });
    const [a, b] = await Promise.all([p1.getTile('fake-1', ...T), p2.getTile('fake-1', ...T)]);
    assert.equal(n, 2);
    assert.deepEqual(a.body, b.body);
    assert.equal(p1.stats.lostRaces + p2.stats.lostRaces, 1);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('manifest: the tile list is the compiler descriptor\'s, the hash is over sorted id + content-hash lines, stored once', async () => {
  const fake = createFakeCompiler({ version: 'fake-1' });
  const s = svc({ compilers: [fake] });
  const m = JSON.parse((await s.getManifest('sf-union-square')).body);
  assert.equal(m.format, 'hometown-tileset');
  assert.equal(m.formatVersion, 2);
  assert.equal(m.buildId, 'fake-1');
  assert.equal(m.grid, 'hg1');
  assert.equal(m.domain, 'conus');
  assert.ok(m.tiles.every((t) => /^hg1-conus\/0\/\d+\/\d+$/.test(t.id)));
  assert.equal(m.tileSetHash, sha256(m.tiles.map((t) => `${t.id} ${t.contentHash}\n`).sort().join('')));
  assert.equal(m.tileSetHash, tileSetHash(m.tiles));
  assert.equal(m.tileUrl, '/tiles/fake-1/hg1-conus/0/{c}/{r}');
  assert.ok(Number.isInteger(m.origin.c0) && m.k0 > 0.99 && m.k0 < 1.01 && Math.abs(m.gamma0 + 16.66) < 0.1);
  const e2 = await svc().getManifest('sf-union-square', 'fake-1');
  assert.deepEqual(JSON.parse(e2.body), m);
  const hi = JSON.parse((await s.getManifest('honolulu-hi')).body);
  assert.equal(hi.domain, 'hi', 'domain from the GEOID prefix 15');
  await assert.rejects(s.getManifest('nowhere'), (x) => x.status === 404);
  await assert.rejects(s.getManifest('Bad Id'), (x) => x.status === 400);
});

test('neighbouring places share tiles: one compile, the same bytes in both manifests', async () => {
  const fake = createFakeCompiler({ version: 'fake-1' });
  const s = svc({ compilers: [fake] });
  const a = JSON.parse((await s.getManifest('okemah-ok')).body), b = JSON.parse((await s.getManifest('okemah-ne')).body);
  const ia = new Map(a.tiles.map((t) => [t.id, t])), shared = b.tiles.filter((t) => ia.has(t.id));
  assert.ok(shared.length > 0);
  for (const t of shared) assert.equal(t.hash, ia.get(t.id).hash);
  for (const [id, n] of fake.calls) assert.equal(n, 1, id + ' compiled once');
});

test('lock v2: create -> verify -> a mismatch is rejected; identical bytes across restarts, build bumps and compiler removal', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tiles-lock-'));
  try {
    const s1 = svc({ store: new DiskStore({ root: dir }), compilers: [createFakeCompiler({ version: 'fake-1' })] });
    const lock = await s1.createLock('okemah-ok');
    assert.deepEqual(Object.keys(lock).sort(), ['buildId', 'domain', 'format', 'formatVersion', 'gamma0', 'grid', 'k0', 'origin', 'place', 'tiles', 'waterLevel', 'yOffset']);
    assert.equal(lock.formatVersion, 2);
    assert.equal(lock.grid, 'hg1');
    assert.equal(lock.yOffset, 0);
    const m1 = JSON.parse((await s1.resolveLock(lock)).body);
    const bytes1 = await Promise.all(m1.tiles.map(async (t) => (await s1.getTile('fake-1', ...t.id.split('/'))).body));
    const v2 = createFakeCompiler({ version: 'fake-2' });
    const s2 = svc({ store: new DiskStore({ root: dir }), compilers: [v2], lru: new LRU() });
    const latest = await s2.createLock('okemah-ok');
    assert.notEqual(latest.tiles, lock.tiles);
    const before = v2.total;
    const proof = await s2.verifyLock(lock);
    assert.equal(proof.ok, true);
    assert.equal(proof.tileSetHash, lock.tiles);
    assert.equal(v2.total, before, 'resolving the old lock compiled nothing');
    const bytes2 = await Promise.all(m1.tiles.map(async (t) => (await s2.getTile('fake-1', ...t.id.split('/'))).body));
    assert.deepEqual(bytes2, bytes1);
    for (const bad of [{ tiles: 'a'.repeat(64) }, { origin: { c0: lock.origin.c0 + 1, r0: lock.origin.r0 } }, { k0: lock.k0 + 1e-9 }, { gamma0: lock.gamma0 + 1e-6 }, { domain: 'ak' }, { yOffset: 1 }]) {
      await assert.rejects(s2.resolveLock({ ...lock, ...bad }), (e) => e.status === 409, JSON.stringify(bad));
    }
    await assert.rejects(s2.resolveLock({ ...lock, tiles: 'nothex' }), (e) => e.status === 400);
    await assert.rejects(s2.resolveLock({ ...lock, grid: 'hg2' }), (e) => e.status === 400);
    await assert.rejects(s2.resolveLock({ ...lock, formatVersion: 1 }), (e) => e.status === 400);
    const t0 = m1.tiles[0];
    await new DiskStore({ root: dir }).delete(`tiles/fake-1/${t0.id}`);
    const drift = { version: 'fake-1', async compileTile() { return { body: Buffer.from('drifted') }; } };
    const s3 = svc({ store: new DiskStore({ root: dir }), compilers: [drift] });
    await assert.rejects(s3.verifyLock(lock), (e) => e.status === 409);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

async function lockedSetup() {
  const store = new MemoryStore();
  const s1 = svc({ store, compilers: [createFakeCompiler({ version: 'fake-1' })] });
  const lock = await s1.createLock('okemah-ok');
  const m = JSON.parse((await s1.resolveLock(lock)).body);
  return { store, lock, m, t0: m.tiles[0], key: (t) => `tiles/fake-1/${t.id}` };
}

test('locked tile: checked against the manifest; a tile outside the set is served unlocked at the same build, 410 once the build is gone', async () => {
  const { store, lock, m, t0, key } = await lockedSetup();
  const s = svc({ store, compilers: [createFakeCompiler({ version: 'fake-1' })] });
  const e = await s.getLockedTile(lock, ...t0.id.split('/'));
  assert.equal(e.meta.hash, t0.hash);
  assert.equal(e.unlocked, undefined);
  const out = await s.getLockedTile(lock, 'hg1-conus', 0, 100, 100);
  assert.equal(out.unlocked, true);
  assert.equal(JSON.parse(decode(out.body, 'gzip')).buildId, 'fake-1');
  const gone = svc({ store, compilers: [createFakeCompiler({ version: 'fake-2' })] });
  await assert.rejects(gone.getLockedTile(lock, 'hg1-conus', 0, 200, 200), (x) => x.status === 410);
  assert.equal((await gone.getLockedTile(lock, 'hg1-conus', 0, 100, 100)).unlocked, true, 'a stored unlocked tile still serves');
  const t1 = m.tiles[1];
  const other = Buffer.from('replaced');
  store.objects.set(key(t1), { body: other, meta: { ...store.objects.get(key(t1)).meta, hash: sha256(other), contentHash: sha256(other), contentEncoding: 'identity' } });
  await assert.rejects(s.getLockedTile(lock, ...t1.id.split('/')), (x) => x.status === 409);
});

test('locked tile: a lost tile is rebuilt by the pinned build (tile by tile), a drifted rebuild is refused and not stored, no compiler = 410', async () => {
  const { store, lock, m, t0, key } = await lockedSetup();
  const original = store.objects.get(key(t0)).body;
  store.objects.delete(key(t0));
  const pinned = createFakeCompiler({ version: 'fake-1' });
  const s = svc({ store, compilers: [pinned] });
  const e = await s.getLockedTile(lock, ...t0.id.split('/'));
  assert.equal(e.source, 'compiled');
  assert.deepEqual(e.body, original);
  assert.equal(pinned.blocks, 0, 'a repair compiles the one tile, not its block');
  assert.equal(s.stats.lockRepairs, 1);
  store.objects.delete(key(t0));
  const drift = { version: 'fake-1', async compileTile() { return { body: Buffer.from('drifted') }; } };
  await assert.rejects(svc({ store, compilers: [drift] }).getLockedTile(lock, ...t0.id.split('/')), (x) => x.status === 409 && /not stored/.test(x.message));
  assert.equal(store.objects.has(key(t0)), false);
  const sg = svc({ store, compilers: [createFakeCompiler({ version: 'fake-2' })] });
  await assert.rejects(sg.getLockedTile(lock, ...t0.id.split('/')), (x) => x.status === 410 && /missing from storage/.test(x.message));
  const proof = await svc({ store, compilers: [createFakeCompiler({ version: 'fake-1' })] }).verifyLock(lock);
  assert.equal(proof.ok, true);
  assert.equal(proof.repaired, 1);
  assert.equal(proof.tiles, m.tileCount);
});

test('resolveLock re-hashes the stored manifest\'s tile list, not only its meta', async () => {
  const { store, lock } = await lockedSetup();
  const mk = 'manifests/fake-1/okemah-ok.json';
  const o = store.objects.get(mk);
  const m = JSON.parse(o.body);
  m.tiles[0] = { ...m.tiles[0], contentHash: 'f'.repeat(64) };
  const body = Buffer.from(JSON.stringify(m));
  store.objects.set(mk, { body, meta: { ...o.meta, hash: sha256(body) } });
  await assert.rejects(svc({ store, compilers: [createFakeCompiler({ version: 'fake-2' })] }).resolveLock(lock), (x) => x.status === 409);
});

test('context blocks are a product of their own: compiled once, stored under ctx/', async () => {
  const store = new MemoryStore();
  const s = svc({ store });
  const a = await s.getCtx('fake-1', 'hg1-conus', '4', '362', '536');
  assert.equal(a.source, 'compiled');
  assert.ok(store.objects.has('ctx/fake-1/hg1-conus/4/362/536'));
  assert.equal((await s.getCtx('fake-1', 'hg1-conus', 4, 362, 536)).source, 'memory');
  await assert.rejects(s.getCtx('fake-1', 'hg1-conus', '0', '362', '536'), (x) => x.status === 400);
});

test('the tile service over the S3 backend (local mock)', async () => {
  const mock = await startMockS3({ port: PORT_S3 });
  try {
    const store = new S3Store({ endpoint: mock.endpoint, bucket: mock.bucket, region: mock.region, accessKeyId: mock.accessKeyId, secretAccessKey: mock.secretAccessKey });
    const s = svc({ store, compilers: [createFakeCompiler({ version: 'fake-1', delayMs: 10 })] });
    const lock = await s.createLock('marfa-tx');
    const proof = await svc({ store, compilers: [createFakeCompiler({ version: 'fake-2' })] }).verifyLock(lock);
    assert.equal(proof.ok, true);
    assert.ok(mock.objects.size >= proof.tiles + 1);
  } finally { await mock.close(); }
});

test('subprocess compiler adapter: tile mode, block mode (HTB1), refusals (422), failures (502), the descriptor', async () => {
  const cmd = (m) => [process.execPath, path.join(here, '..', 'fixtures', 'fake-compiler-cmd.mjs'), m, '{buildId}', '{id}'];
  const one = createSubprocessCompiler({ version: 'cmd-1', argv: cmd('tile'), contentType: 'application/json' });
  const s = svc({ compilers: [one] });
  const j = JSON.parse((await s.getTile('cmd-1', 'hg1-conus', '0', '12', '7')).body);
  assert.deepEqual(j, { format: 'subprocess-tile', buildId: 'cmd-1', id: 'hg1-conus/0/12/7' });
  await assert.rejects(s.getTile('cmd-1', 'hg1-conus', '0', '13', '7'), (x) => x.status === 422 && /scripted refusal/.test(x.message));
  await assert.rejects(s.getTile('cmd-1', 'hg1-conus', '0', '14', '7'), (x) => x.status === 502 && /scripted failure/.test(x.message));
  const blk = createSubprocessCompiler({ version: 'cmd-2', argv: cmd('tile'), blockArgv: cmd('block'),
    describeArgv: [process.execPath, path.join(here, '..', 'fixtures', 'fake-compiler-cmd.mjs'), 'describe', '{placeId}', '{stage}'], contentType: 'application/json' });
  const sb = svc({ compilers: [blk] });
  const e = await sb.getTile('cmd-2', 'hg1-conus', 0, 12, 7);
  assert.equal(JSON.parse(e.body).id, 'hg1-conus/0/12/7');
  assert.equal(sb.stats.blockCompiles, 1);
  assert.equal(sb.stats.compiles, 12, '16 children, the 4 at c 13 refused');
  await assert.rejects(sb.getTile('cmd-2', 'hg1-conus', 0, 13, 6), (x) => x.status === 422);
  const m = JSON.parse((await sb.getManifest('okemah-ok', 'cmd-2')).body);
  assert.equal(m.yOffset, 7);
});

test('a compiler\'s undecodable output is a 502, a lost race whose winner is unreadable a 503: nothing served from memory', async () => {
  const bad = { version: 'fake-1', async compileTile() { return { body: Buffer.from('not gzip at all'), contentEncoding: 'gzip' }; } };
  const store = new MemoryStore();
  const s = svc({ store, compilers: [bad], blockLevel: 0 });
  await assert.rejects(s.getTile('fake-1', ...T), (x) => x.status === 502 && /compile failed/.test(x.message));
  assert.equal(s.stats.compiles, 0);
  assert.equal(store.objects.size, 0);
  const st = new MemoryStore();
  st.put = async () => ({ created: false });
  st.get = async () => null;
  const s2 = svc({ store: st });
  await assert.rejects(s2.getTile('fake-1', ...T), (x) => x.status === 503);
  assert.equal(s2.lru.size, 0);
});

test('subprocess compiler: the child gets an allow-listed environment, not the storage secrets', async () => {
  const saved = process.env.TILES_S3_SECRET_ACCESS_KEY;
  process.env.TILES_S3_SECRET_ACCESS_KEY = 'test-value-not-a-real-secret';
  try {
    const cmd = createSubprocessCompiler({ version: 'env-1', argv: [process.execPath, '-e', 'process.stdout.write(JSON.stringify(Object.keys(process.env)))'], env: { EXTRA_FLAG: '1' } });
    const keys = JSON.parse((await cmd.compileTile({ buildId: 'env-1', domain: 'conus', L: 0, c: 1, r: 1 })).body);
    assert.ok(!keys.includes('TILES_S3_SECRET_ACCESS_KEY'));
    assert.ok(keys.includes('PATH') && keys.includes('EXTRA_FLAG'));
  } finally {
    if (saved === undefined) delete process.env.TILES_S3_SECRET_ACCESS_KEY; else process.env.TILES_S3_SECRET_ACCESS_KEY = saved;
  }
});

// The Python compiler's own store (tools/hometown/compile.py --id okemah): its descriptor's tileSetHash recomputed
// here from the stored tiles' decoded bytes, the service's way. Skipped without a local store.
const PYSTORE = path.join(here, '../../../.scratch/hometown/store');
const pyBuild = existsSync(path.join(PYSTORE, 'manifests')) ? readdirSync(path.join(PYSTORE, 'manifests')).sort().pop() : null;
test('tileSetHash: the service\'s hash equals the Python descriptor\'s', { skip: !pyBuild && 'no local compiler store' }, () => {
  const d = JSON.parse(readFileSync(path.join(PYSTORE, 'manifests', pyBuild, 'okemah.json')));
  const tiles = d.tiles.map((t) => ({ id: t.id, contentHash: sha256(zlib.gunzipSync(readFileSync(path.join(PYSTORE, 'tiles', pyBuild, ...t.id.split('/'))))) }));
  assert.equal(tileSetHash(tiles), d.tileSetHash);
  assert.equal(d.lock.tiles, d.tileSetHash);
  assert.equal(d.lock.formatVersion, 2);
});

test('a failed or unusable descriptor stage 2 stores no manifest (no null yOffset / waterLevel cached forever); the next request retries', async () => {
  const store = new MemoryStore();
  const fake = createFakeCompiler({ version: 'fake-1' });
  const real = fake.describePlace.bind(fake);
  let mode = 'throw';
  fake.describePlace = async (place, stage = 1) => {
    if (stage === 2 && mode === 'throw') throw new Error('stage 2 exploded');
    if (stage === 2 && mode === 'null') return { yOffset: null, waterLevel: -10 };
    return real(place, stage);
  };
  const s = svc({ store, compilers: [fake] });
  const manifests = () => [...store.objects.keys()].filter((k) => k.startsWith('manifests/'));
  await assert.rejects(s.getManifest('okemah-ok', 'fake-1'), (x) => x.status === 502 && /stage 2/.test(x.message));
  assert.deepEqual(manifests(), [], 'nothing stored after a failed stage 2');
  mode = 'null';
  await assert.rejects(s.getManifest('okemah-ok', 'fake-1'), (x) => x.status === 502 && /yOffset/.test(x.message));
  assert.deepEqual(manifests(), [], 'nothing stored after a stage 2 without a datum');
  await assert.rejects(s.createLock('okemah-ok', 'fake-1'), (x) => x.status === 502);
  mode = 'ok';
  const m = JSON.parse((await s.getManifest('okemah-ok', 'fake-1')).body);
  assert.equal(m.yOffset, 0);
  assert.equal(m.waterLevel, -10);
  assert.equal(manifests().length, 1);
  const lock = await s.createLock('okemah-ok', 'fake-1');
  assert.equal(lock.yOffset, 0);
});
