import assert from 'node:assert/strict';
import test from 'node:test';
import { parseTileKey, tilesForBbox, tileBbox, lonToX, latToY, HttpError } from '../src/keys.mjs';
import { LRU } from '../src/lru.mjs';
import { SingleFlight } from '../src/singleflight.mjs';
import { gzipDeterministic, stableJson } from '../src/util.mjs';

test('tile keys: valid parse, bounds, rejects traversal and junk', () => {
  assert.deepEqual(parseTileKey('fake-1', '16', '10483', '25329'), { version: 'fake-1', z: 16, x: 10483, y: 25329 });
  for (const bad of [['..', '1', '0', '0'], ['v/1', '1', '0', '0'], ['v1', '01', '0', '0'], ['v1', '1', '2', '0'], ['v1', '1', '-1', '0'], ['v1', '30', '0', '0'], ['', '1', '0', '0'], ['v1', '1', '0', '0x1']]) {
    assert.throws(() => parseTileKey(...bad, { maxZoom: 22 }), (e) => e instanceof HttpError && e.status === 400, bad.join('/'));
  }
  assert.throws(() => parseTileKey('v1', '9', '0', '0', { minZoom: 10 }), /outside/);
});

test('slippy maths round-trips and place tile lists are row-major and capped', () => {
  const z = 16, x = lonToX(-122.4077, z), y = latToY(37.7879, z);
  const [w, s, e, n] = tileBbox(z, x, y);
  assert.ok(w <= -122.4077 && -122.4077 < e && s < 37.7879 && 37.7879 <= n);
  const tiles = tilesForBbox([-122.412, 37.785, -122.402, 37.791], z);
  assert.ok(tiles.length >= 4 && tiles.length <= 12, `${tiles.length}`);
  for (let i = 1; i < tiles.length; i++) assert.ok(tiles[i].y > tiles[i - 1].y || (tiles[i].y === tiles[i - 1].y && tiles[i].x > tiles[i - 1].x));
  assert.throws(() => tilesForBbox([-123, 37, -122, 38], 16, 100), (e) => e.status === 413);
});

test('LRU evicts least-recently-used by bytes and by count', () => {
  const l = new LRU({ maxBytes: 100, maxEntries: 3 });
  l.set('a', 1, 40); l.set('b', 2, 40); l.get('a'); l.set('c', 3, 40); // 120 bytes: b (LRU) goes
  assert.equal(l.get('b'), undefined);
  assert.equal(l.get('a'), 1);
  l.set('d', 4, 10); l.set('e', 5, 10); // 4 entries > 3: c goes (a was touched)
  assert.equal(l.size, 3);
  assert.equal(l.get('c'), undefined);
  assert.equal(l.set('huge', 0, 101), false);
  assert.ok(l.bytes <= 100);
});

test('single-flight shares one execution and does not cache failures', async () => {
  const sf = new SingleFlight();
  let n = 0;
  const fn = async () => { n++; await new Promise((r) => setTimeout(r, 10)); return n; };
  const r = await Promise.all(Array.from({ length: 50 }, () => sf.do('k', fn)));
  assert.equal(n, 1);
  assert.ok(r.every((v) => v === 1));
  await assert.rejects(Promise.all([sf.do('e', async () => { throw new Error('x'); }), sf.do('e', async () => 1)]), /x/);
  assert.equal(await sf.do('e', async () => 'retried'), 'retried');
});

test('deterministic gzip and stable JSON', () => {
  const a = gzipDeterministic(Buffer.from('hello'));
  assert.equal(a[9], 255);
  assert.deepEqual(a, gzipDeterministic(Buffer.from('hello')));
  assert.equal(stableJson({ b: 1, a: [{ d: 1, c: 2 }] }), '{"a":[{"c":2,"d":1}],"b":1}');
});
