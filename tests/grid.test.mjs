// hg1 (wagmi/world/grid.js) against tools/hometown/grid-vectors.json, written by the Python authority
// (tools/hometown/grid_vectors.py): forward < 1e-6 m, inverse < 1e-9 deg, keys equal >= 1 cm from an edge, edge-exact
// cm points to the higher c / r tile, ids validated against the bounds registry.  node --test tests/grid.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { domain, tileOf, tileId, parseTileId, checkTile, sessionOf, tileCorner, sessionToGrid, toCm } from '../wagmi/world/grid.js';

const doc = JSON.parse(readFileSync(new URL('../tools/hometown/grid-vectors.json', import.meta.url)));

test('vectors: forward, inverse, keys (all six domains)', () => {
  const seen = new Set();
  let n = 0, worstF = 0, worstI = 0;
  for (const v of doc.vectors) {
    seen.add(v.domain);
    const d = domain(v.domain);
    if (v.edgeExact) {
      assert.deepEqual(tileOf(v.gx, v.gs), [v.c, v.r], v.name);
      assert.equal(tileId(v.domain, v.c, v.r), v.id);
      continue;
    }
    const [E, S] = d.forward(v.lon, v.lat);
    worstF = Math.max(worstF, Math.abs(E - v.E), Math.abs(S - v.S));
    assert.ok(Math.abs(E - v.E) < 1e-6 && Math.abs(S - v.S) < 1e-6, `${v.name} forward ${E - v.E} ${S - v.S}`);
    const [lon, lat] = d.inverse(v.E, v.S);
    const dl = Math.abs(((lon - v.lon + 540) % 360) - 180);
    worstI = Math.max(worstI, dl, Math.abs(lat - v.lat));
    assert.ok(dl < 1e-9 && Math.abs(lat - v.lat) < 1e-9, `${v.name} inverse ${dl} ${lat - v.lat}`);
    assert.ok(Math.abs(d.gamma(v.lon) - v.gamma) < 1e-9 && Math.abs(d.scale(v.lon, v.lat) - v.k) < 1e-12, v.name + ' gamma/k');
    if (v.edgeCm >= 1) {
      const gx = toCm(E), gs = toCm(S);
      assert.deepEqual(tileOf(gx, gs), [v.c, v.r], v.name + ' key');
    }
    assert.ok(v.E >= 0 && v.S >= 0, v.name + ' non-negative');
    assert.equal(parseTileId(v.id).id, v.id);
    n++;
  }
  assert.deepEqual([...seen].sort(), ['ak', 'as', 'conus', 'gu', 'hi', 'pr']);
  assert.ok(doc.vectors.length >= 80, 'at least 80 vectors (edge-exact included), got ' + doc.vectors.length);
  console.log(JSON.stringify({ vectors: doc.vectors.length, lonlat: n, worstForwardM: worstF, worstInverseDeg: worstI }));
});

test('ids: grammar and bounds', () => {
  assert.deepEqual(parseTileId('hg1-conus/0/5806/8582'), { grid: 'hg1', domain: 'conus', L: 0, c: 5806, r: 8582, id: 'hg1-conus/0/5806/8582' });
  for (const bad of ['hg2-conus/0/1/1', 'hg1-mars/0/1/1', 'hg1-conus/1/1/1', 'hg1-conus/0/-1/1', 'hg1-conus/0/01/1', 'hg1-conus/0/12001/1',
    'hg1-hi/0/4001/0', 'hg1-ak/0/0/10001', 'hg1-conus/0/1234567/1', 'hg1-conus/0/1.5/1', 'hg1-conus/0/1/1/1']) assert.throws(() => parseTileId(bad), bad);
  assert.equal(checkTile('hg1-conus', '4', '362', '536', { levels: [4] }).id, 'hg1-conus/4/362/536');
  assert.throws(() => checkTile('hg1-conus', '4', '751', '1', { levels: [4] })); // 751 * 16 > 12000
});

test('session placement: neighbour corners bitwise equal, floor(x / size) = c - c0 at tile centres', () => {
  const fr = { c0: 5806, r0: 8582, k0: 0.996523396 };
  const size = 512 / fr.k0;
  for (let dc = -3; dc <= 3; dc++) for (let dr = -3; dr <= 3; dr++) {
    const c = fr.c0 + dc, r = fr.r0 + dr;
    // the east edge of (c, r) as tile (c, r)'s u = 51200 and as tile (c + 1, r)'s u = 0
    assert.deepEqual(sessionOf(fr, c, r, 51200, 0), sessionOf(fr, c + 1, r, 0, 0));
    assert.deepEqual(sessionOf(fr, c, r, 0, 51200), sessionOf(fr, c, r + 1, 0, 0));
    const [x0, z0] = tileCorner(fr, c, r);
    assert.equal(Math.floor((x0 + size / 2) / size), dc);
    assert.equal(Math.floor((z0 + size / 2) / size), dr);
    const g = sessionToGrid(fr, x0 + size / 2, z0 + size / 2);
    assert.deepEqual([g.c, g.r], [c, r]);
  }
  // a tile-local GPU vertex never exceeds ~530 m (u, v up to 51200 cm plus overhang, over k0)
  assert.ok(51200 / 100 / fr.k0 < 530);
});
