import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { parseTileKey, parseCtxKey, tileStorageKey, ctxStorageKey, manifestStorageKey, buildStorageKey, blockOf, blockChildren, blockId, HttpError } from '../src/keys.mjs';
import { domain, tileId, BOUNDS, domainOfGeoid } from '../src/grid.mjs';
import { LRU } from '../src/lru.mjs';
import { SingleFlight } from '../src/singleflight.mjs';
import { gzipDeterministic, stableJson } from '../src/util.mjs';

test('hg1 tile keys: valid parse, storage keys, 400 on junk, bad domains, levels, negatives and out-of-bounds keys', () => {
  const k = parseTileKey('htc-0.3.0-hg1-b1a2b3c4d', 'hg1-conus', '0', '5806', '8582');
  assert.deepEqual(k, { buildId: 'htc-0.3.0-hg1-b1a2b3c4d', grid: 'hg1', domain: 'conus', L: 0, c: 5806, r: 8582, id: 'hg1-conus/0/5806/8582' });
  assert.equal(tileStorageKey(k), 'tiles/htc-0.3.0-hg1-b1a2b3c4d/hg1-conus/0/5806/8582');
  assert.equal(ctxStorageKey(parseCtxKey('b1', 'hg1-conus', '4', '362', '536')), 'ctx/b1/hg1-conus/4/362/536');
  assert.equal(manifestStorageKey('b1', 'okemah-ok'), 'manifests/b1/okemah-ok.json');
  assert.equal(buildStorageKey('b1'), 'builds/b1.json');
  for (const bad of [['..', 'hg1-conus', '0', '0', '0'], ['v/1', 'hg1-conus', '0', '0', '0'], ['v1', 'hg1-mars', '0', '0', '0'], ['v1', 'hg2-conus', '0', '0', '0'],
    ['v1', 'conus', '0', '0', '0'], ['v1', 'hg1-conus', '2', '0', '0'], ['v1', 'hg1-conus', '0', '-1', '0'], ['v1', 'hg1-conus', '0', '01', '0'], ['v1', 'hg1-conus', '0', '0x1', '0'],
    ['v1', 'hg1-conus', '0', '12001', '0'], ['v1', 'hg1-pr', '0', '0', '4001'], ['v1', 'hg1-conus', '0', '1000000', '0'], ['', 'hg1-conus', '0', '0', '0']]) {
    assert.throws(() => parseTileKey(...bad), (e) => e instanceof HttpError && e.status === 400, bad.join('/'));
  }
  assert.throws(() => parseCtxKey('v1', 'hg1-conus', '4', '751', '0'), (e) => e.status === 400);
  assert.equal('htc-0.3.0-hg1-b1a2b3c4d'.length, 23);
});

test('L2 blocks: a tile\'s block and its 16 children', () => {
  const b = blockOf({ buildId: 'b1', domain: 'conus', c: 5806, r: 8582 });
  assert.equal(blockId(b), 'hg1-conus/2/1451/2145');
  const ch = blockChildren(b);
  assert.equal(ch.length, 16);
  assert.ok(ch.some((t) => t.id === 'hg1-conus/0/5806/8582'));
  assert.deepEqual([ch[0].c, ch[0].r, ch[15].c, ch[15].r], [5804, 8580, 5807, 8583]);
});

test('grid twin vs tools/hometown/grid-vectors.json (the Python authority): forward 1e-6 m, keys from cm, bounds cover the vectors', () => {
  const doc = JSON.parse(readFileSync(new URL('../../../tools/hometown/grid-vectors.json', import.meta.url)));
  let n = 0;
  for (const v of doc.vectors) {
    if (v.edgeExact) { assert.deepEqual([Math.floor(v.gx / 51200), Math.floor(v.gs / 51200)], [v.c, v.r]); continue; }
    const [E, S] = domain(v.domain).forward(v.lon, v.lat);
    assert.ok(Math.abs(E - v.E) < 1e-6 && Math.abs(S - v.S) < 1e-6, v.name);
    const [bc, br] = BOUNDS[v.domain];
    assert.ok(v.c >= 0 && v.r >= 0 && v.c <= bc && v.r <= br, v.name + ' in bounds');
    assert.equal(tileId(v.domain, v.c, v.r), v.id);
    n++;
  }
  assert.ok(n >= 70);
  assert.deepEqual(['0200100', '1500100', '7200100', '7800100', '6600100', '6900100', '6000100', '4054200'].map(domainOfGeoid), ['ak', 'hi', 'pr', 'pr', 'gu', 'gu', 'as', 'conus']);
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
