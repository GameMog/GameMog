// The tile lifecycle (wagmi/world/tiles.js) against a fake TileSource: rings, upgrades, the LRU's budget,
// ensureLoaded's promise, failures. node --test tests/tiles.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTileManager } from '../wagmi/world/tiles.js';

function fakeSource({ size = 100, fail = () => false, delay = 0, has } = {}) {
  const calls = [], unloads = [];
  return {
    id: 'fake', version: 't1', size, has, calls, unloads,
    async load(ix, iz, lod) {
      calls.push([ix, iz, lod]);
      if (delay) await new Promise((r) => setTimeout(r, delay));
      if (fail(ix, iz, lod)) throw new Error('boom ' + ix + ',' + iz);
      return { bytes: lod === 'near' ? 1000 : lod === 'mid' ? 100 : 10, layers: { lod } };
    },
    unload(t) { unloads.push(t.key); },
  };
}
const settle = () => new Promise((r) => setTimeout(r, 5));
async function drain(m) { for (let i = 0; i < 200 && (m.stats().queued || m.stats().loading); i++) await settle(); }

test('rings: every tile round the player at its ring level, nearest first', async () => {
  const src = fakeSource();
  const m = createTileManager(src, { rings: { near: 0, mid: 1, far: 2 }, concurrency: 1 });
  m.update(50, 50);
  await drain(m);
  const s = m.stats();
  assert.equal(s.tiles, 25);
  assert.deepEqual(s.byLod, { near: 1, mid: 8, far: 16 });
  assert.deepEqual(src.calls[0], [0, 0, 'near']); // the player's own tile first
  assert.equal(m.at(50, 50).lod, 'near');
  assert.equal(m.get(2, 2).lod, 'far');
  assert.equal(m.keyOf(1, -2), 'fake@t1:1,-2');
});

test('moving: tiles upgrade as they come near, leave the rings cold, and the LRU evicts the oldest over budget', async () => {
  const src = fakeSource();
  const m = createTileManager(src, { rings: { near: 0, mid: 1, far: 1 }, budget: { tiles: 12, bytes: 1e9 } });
  const ups = [], outs = [];
  m.on('upgrade', (t, prev) => ups.push([t.key, prev.lod, t.lod]));
  m.on('unload', (t) => outs.push(t.key));
  m.update(50, 50); await drain(m);
  assert.equal(m.stats().tiles, 9);
  m.update(150, 50); await drain(m); // one tile east: (1,0) mid -> near, 3 new tiles
  assert.ok(ups.some(([k, a, b]) => k === 'fake@t1:1,0' && a === 'mid' && b === 'near'));
  assert.equal(m.stats().tiles, 12);
  assert.equal(m.stats().byRing.cold, 3);
  m.update(250, 50); await drain(m); // another: 3 more, budget 12 -> the 3 oldest cold ones go
  assert.equal(m.stats().tiles, 12);
  assert.deepEqual(outs.sort(), ['fake@t1:-1,-1', 'fake@t1:-1,0', 'fake@t1:-1,1']);
  assert.equal(src.unloads.length, 3 + ups.length); // (an upgrade unloads the coarser copy)
  for (const t of m.loaded()) assert.ok(t.ring || t.ix === 0, 'only the newest cold column is kept');
});

test('ensureLoaded: a real promise, resolved with the tiles at the level asked, pinned against eviction', async () => {
  const src = fakeSource({ delay: 3 });
  const m = createTileManager(src, { rings: { near: 0, mid: 0, far: 0 }, budget: { tiles: 1, bytes: 1e9 } });
  const p = m.ensureLoaded(1000, 1000, 120, 'mid');
  assert.ok(p instanceof Promise);
  const got = await p;
  assert.equal(got.length, 12); // a 120 m disc on a tile corner: the 4 x 4 tiles it spans, less the 4 corners it misses
  for (const t of got) assert.ok(t.lod === 'mid' || t.lod === 'near');
  // unpinned now and out of every ring: the budget (1 tile) evicts them on the next update
  m.update(-5000, -5000); await drain(m);
  assert.equal(m.stats().tiles, 1);
  // the same disc again: loaded again
  const again = await m.ensureLoaded({ x: 1000, z: 1000, r: 0 });
  assert.equal(again.length, 1);
  assert.equal(again[0].lod, 'near');
});

test('ensureLoaded over a rectangle, and outside the source (has false) nothing is asked', async () => {
  const src = fakeSource({ has: (ix) => ix >= 0 });
  const m = createTileManager(src);
  const got = await m.ensureLoaded({ minX: -150, maxX: 150, minZ: 0, maxZ: 99 }, 'far');
  assert.deepEqual(got.map((t) => [t.ix, t.iz]), [[0, 0], [1, 0]]);
  assert.ok(src.calls.every(([ix]) => ix >= 0));
});

test('a failed load rejects ensureLoaded, is retried later, and the rest still load', async () => {
  let broken = true;
  const src = fakeSource({ fail: (ix, iz) => broken && ix === 1 && iz === 0 });
  const m = createTileManager(src, { rings: { near: 0, mid: 0, far: 1 } });
  const errs = [];
  m.on('error', (e) => errs.push(e));
  await assert.rejects(m.ensureLoaded(150, 50, 0), /boom 1,0/);
  m.update(50, 50); await drain(m);
  assert.equal(m.stats().tiles, 8);
  broken = false;
  const t = await m.ensureLoaded(150, 50, 0, 'far');
  assert.equal(t[0].ix, 1);
  assert.ok(errs.length >= 1);
});

test('a finer request while a coarse load is in flight ends with the finer tile', async () => {
  const src = fakeSource({ delay: 5 });
  const m = createTileManager(src, { rings: { near: 0, mid: 0, far: 3 }, concurrency: 4 });
  m.update(-250, 50); // (0,0) wanted far
  const [t] = await m.ensureLoaded(50, 50, 0, 'near');
  assert.equal(t.lod, 'near');
  await drain(m);
  assert.equal(m.get(0, 0).lod, 'near');
});
