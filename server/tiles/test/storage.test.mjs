import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DiskStore, MemoryStore, S3Store, IntegrityError } from '../src/storage/index.mjs';
import { signV4 } from '../src/storage/sigv4.mjs';
import { sha256 } from '../src/util.mjs';
import { startMockS3 } from './mock-s3.mjs';

const PORT_S3 = Number(process.env.TILES_TEST_PORT || 4693);

test('SigV4 matches the AWS documentation example (GET Object, examplebucket/test.txt)', () => {
  // AWS's published example values (docs: "Signature Calculations for the Authorization Header", GET Object).
  const { signature } = signV4({
    method: 'GET', url: 'https://examplebucket.s3.amazonaws.com/test.txt',
    headers: { host: 'examplebucket.s3.amazonaws.com', range: 'bytes=0-9', 'x-amz-content-sha256': 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', 'x-amz-date': '20130524T000000Z' },
    payloadHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    accessKeyId: 'AKIAIOSFODNN7EXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY', region: 'us-east-1', service: 's3',
  });
  assert.equal(signature, 'f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41');
});

async function contract(name, make, tamper) {
  await test(`storage contract: ${name}`, async () => {
    const { store, cleanup } = await make();
    try {
      const body = Buffer.from([0x1f, 0x8b, 1, 2, 3, 0, 255]);
      const meta = { contentType: 'application/json', contentEncoding: 'gzip', hash: sha256(body), contentHash: 'x', bytes: body.length };
      assert.equal(await store.get('tiles/v1/16/1/2'), null);
      assert.deepEqual(await store.put('tiles/v1/16/1/2', body, meta), { created: true });
      const got = await store.get('tiles/v1/16/1/2');
      assert.deepEqual(got.body, body);
      assert.deepEqual(got.meta, meta);
      // immutable: a second writer does not replace the first one's bytes
      const other = Buffer.from('different');
      assert.deepEqual(await store.put('tiles/v1/16/1/2', other, { ...meta, hash: sha256(other) }, { ifAbsent: true }), { created: false });
      assert.deepEqual((await store.get('tiles/v1/16/1/2')).body, body);
      // concurrent first writes: exactly one wins
      const rs = await Promise.all(Array.from({ length: 20 }, (_, i) => { const b = Buffer.from(`w${i}`); return store.put('race/k', b, { hash: sha256(b) }); }));
      assert.equal(rs.filter((r) => r.created).length, 1);
      for (const bad of ['../x', 'a//b', '/abs', 'a/../b', 'a b']) await assert.rejects(store.get(bad), /bad storage key/);
      if (tamper) { await tamper(store, 'tiles/v1/16/1/2'); await assert.rejects(store.get('tiles/v1/16/1/2'), IntegrityError); }
      await store.delete('tiles/v1/16/1/2');
      assert.equal(await store.get('tiles/v1/16/1/2'), null);
    } finally { await cleanup(); }
  });
}

await contract('memory', async () => ({ store: new MemoryStore(), cleanup: async () => {} }), async (s, k) => { s.objects.get(k).body[0] ^= 1; });

await contract('disk', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tiles-disk-'));
  return { store: new DiskStore({ root: dir }), cleanup: () => fs.rm(dir, { recursive: true, force: true }) };
}, async (s, k) => { const f = s.file(k); const b = await fs.readFile(f); b[b.length - 1] ^= 1; await fs.writeFile(f, b); });

const mock = await startMockS3({ port: PORT_S3 });

await contract('s3 (local mock, signed requests)', async () => {
  const store = new S3Store({ endpoint: mock.endpoint, bucket: mock.bucket, region: mock.region, accessKeyId: mock.accessKeyId, secretAccessKey: mock.secretAccessKey, prefix: 'hometown/' });
  return { store, cleanup: async () => {} };
}, async (s, k) => { mock.objects.get(`hometown/${k}`).body[0] ^= 1; });

test('s3: a 409 (write in progress) is retried with backoff, not reported as already stored', async () => {
  const sleeps = [];
  const store = new S3Store({ endpoint: mock.endpoint, bucket: mock.bucket, region: mock.region, accessKeyId: mock.accessKeyId, secretAccessKey: mock.secretAccessKey, prefix: 'c/', sleep: async (ms) => { sleeps.push(ms); } });
  const body = Buffer.from('conflicted');
  mock.state.conflicts = 2;
  assert.deepEqual(await store.put('tiles/v/2/0/0', body, { hash: sha256(body) }), { created: true });
  assert.equal(sleeps.length, 2);
  assert.ok(sleeps[1] >= sleeps[0], 'backoff grows');
  assert.deepEqual((await store.get('tiles/v/2/0/0')).body, body);
  // a conflict that never clears is an error, not created:false
  const few = new S3Store({ endpoint: mock.endpoint, bucket: mock.bucket, region: mock.region, accessKeyId: mock.accessKeyId, secretAccessKey: mock.secretAccessKey, prefix: 'c/', conflictRetries: 2, sleep: async () => {} });
  mock.state.conflicts = 100;
  await assert.rejects(few.put('tiles/v/2/0/1', body, { hash: sha256(body) }), /409/);
  mock.state.conflicts = 0;
});

test('s3: keeps the tile encoding in metadata, sends If-None-Match, rejects a wrong secret', async () => {
  try {
    const store = new S3Store({ endpoint: mock.endpoint, bucket: mock.bucket, region: mock.region, accessKeyId: mock.accessKeyId, secretAccessKey: mock.secretAccessKey, prefix: 'p/' });
    const body = Buffer.from('gz-bytes');
    await store.put('tiles/v/1/0/0', body, { contentEncoding: 'gzip', hash: sha256(body) });
    const o = mock.objects.get('p/tiles/v/1/0/0');
    assert.ok(o, 'stored under the prefix');
    assert.equal(o.meta['content-encoding'], undefined);
    assert.equal((await store.get('tiles/v/1/0/0')).meta.contentEncoding, 'gzip');
    assert.equal((await store.put('tiles/v/1/0/0', body, { hash: sha256(body) })).created, false);
    assert.ok(mock.log.some((l) => l.status === 412));
    const bad = new S3Store({ endpoint: mock.endpoint, bucket: mock.bucket, region: mock.region, accessKeyId: mock.accessKeyId, secretAccessKey: 'wrong' });
    await assert.rejects(bad.get('tiles/v/1/0/0'), /403/);
  } finally { await mock.close(); }
});
