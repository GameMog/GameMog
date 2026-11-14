// Compiled hg1 tiles (tools/hometown/compile.py) decoded by the client (wagmi/world/tiles-net.js) and placed in a session
// frame: a 2 x 2 block's edge posts bitwise equal after decode, border nodes one-to-one at equal positions, each building
// in one tile, no cut edge... and the tile manager's global keys. Needs a local store (HG1_STORE, default
// .scratch/hometown/store, written by `python tools/hometown/compile.py --id okemah`); skipped without one.
//   node --test tests/hg1-tiles.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { parseHTL1, placeTile, createNetTileSource } from '../wagmi/world/tiles-net.js';
import { createTileManager } from '../wagmi/world/tiles.js';
import { tileOf } from '../wagmi/world/grid.js';

const root = new URL('../', import.meta.url).pathname;
const store = process.env.HG1_STORE || root + '.scratch/hometown/store';
const build = existsSync(store + '/tiles') ? readdirSync(store + '/tiles').sort().pop() : null;
const C0 = +(process.env.HG1_C || 5806), R0 = +(process.env.HG1_R || 8582);
const path = (c, r) => `${store}/tiles/${build}/hg1-conus/0/${c}/${r}`;
const have = build && [[0, 0], [1, 0], [0, 1], [1, 1]].every(([a, b]) => existsSync(path(C0 + a, R0 + b)));
const fr = { c0: C0, r0: R0, k0: 0.996523396, yOffset: 244, waterLevel: -10 };
const load = (c, r) => placeTile(fr, parseHTL1(new Uint8Array(gunzipSync(readFileSync(path(c, r))))));

test('2 x 2 seams after client decode', { skip: !have && 'no local hg1 store' }, () => {
  const T = {};
  for (const [a, b] of [[0, 0], [1, 0], [0, 1], [1, 1]]) T[a + ',' + b] = load(C0 + a, R0 + b);
  const P = 257;
  let posts = 0, nodes = 0;
  for (const [a, b, dx, dz] of [[0, 0, 1, 0], [0, 1, 1, 0], [0, 0, 0, 1], [1, 0, 0, 1]]) {
    const A = T[a + ',' + b], B = T[(a + dx) + ',' + (b + dz)];
    for (let k = 0; k < P; k++) {
      const ha = dx ? A.heights.h[k * P + P - 1] : A.heights.h[(P - 1) * P + k];
      const hb = dx ? B.heights.h[k * P] : B.heights.h[k];
      assert.ok(Object.is(ha, hb), `edge post ${k} ${ha} != ${hb}`); posts++;
    }
    const line = dx ? `:E${C0 + a + 1}:` : `:S${R0 + b + 1}:`;
    const ba = new Map(A.roads.nodes.filter((n) => n.border && n.id.includes(line)).map((n) => [n.id, n]));
    const bb = new Map(B.roads.nodes.filter((n) => n.border && n.id.includes(line)).map((n) => [n.id, n]));
    assert.deepEqual([...ba.keys()].sort(), [...bb.keys()].sort(), 'border nodes one-to-one');
    for (const [id, n] of ba) { assert.ok(Object.is(n.x, bb.get(id).x) && Object.is(n.z, bb.get(id).z), id + ' position'); nodes++; }
  }
  const ids = Object.values(T).flatMap((t) => t.buildings.records.map((b) => b.id));
  assert.equal(new Set(ids).size, ids.length, 'every building in one tile');
  // GPU vertices tile-local and small
  let vmax = 0; for (const t of Object.values(T)) for (const v of t.buildings.verts) vmax = Math.max(vmax, Math.abs(v));
  assert.ok(vmax <= 530, 'vertex ' + vmax);
  // a cut edge (clipped at the tile line) on the tile's border, flagged
  let cut = 0; for (const t of Object.values(T)) for (const b of t.blocks) cut += b.cut.reduce((x, y) => x + y, 0);
  assert.ok(cut > 0);
  // tiles.js floor(x / size) = c - c0 at tile centres
  for (const [k, t] of Object.entries(T)) { const [a, b] = k.split(',').map(Number); assert.equal(Math.floor((t.x0 + t.size / 2) / t.size), a); assert.equal(Math.floor((t.z0 + t.size / 2) / t.size), b); }
  console.log(JSON.stringify({ build, edgePostsBitwise: posts, borderNodesMatched: nodes, buildings: ids.length, maxVertexM: +vmax.toFixed(2), cutEdges: cut }));
});

test('the tile manager on a net source: global keys, the store bytes', { skip: !have && 'no local hg1 store' }, async () => {
  const src = createNetTileSource({ base: store, buildId: build, domain: 'conus', ...fr, fetch: async (u) => {
    const p = u; if (!existsSync(p)) return { ok: false, status: 404 };
    const b = readFileSync(p); return { ok: true, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) };
  } });
  // (node's DecompressionStream exists: the net source gunzips like a page)
  const tm = createTileManager(src, { rings: { near: 0, mid: 0, far: 1 } });
  const got = await tm.ensureLoaded(src.size * 0.5, src.size * 0.5, 1);
  assert.equal(got.length, 1);
  assert.equal(got[0].key, `${build}:hg1-conus/0/${C0}/${R0}`);
  assert.equal(tm.keyOf(1, -1), `${build}:hg1-conus/0/${C0 + 1}/${R0 - 1}`);
  assert.ok(got[0].layers.heights.n === 257 && got[0].layers.mask.m.length === 512 * 512);
  assert.deepEqual(tileOf((C0 + 1) * 51200, R0 * 51200), [C0 + 1, R0]);
  tm.dispose();
});

// The water shim on a shared edge post (the verifier's Pittsburgh 4,620 / 4,626: the post read its own tile's mask, and
// the two tiles hold different cells there). Two synthetic tiles side by side: A's east column and B's west column are
// the same posts at the same cm; A's mask says wet along its last cells, B's says dry. Both must place the same heights.
test('water shim: an edge post decides the same on both tiles', () => {
  const P = 257, yOffset = 0, waterLevel = 0.3, lvl = 30;
  const tile = (c, wetEast) => {
    const terrain = new Uint16Array(P * P), mask = new Uint8Array(512 * 512);
    for (let j = 0; j < P; j++) for (let i = 0; i < P; i++) {
      const g = (c - 10) * 256 + i; // global post column
      // (the water: posts at exactly the level west of the line; a bank 40 cm over it beside; dry land further east)
      terrain[j * P + i] = g < 256 ? lvl : g === 256 && j % 2 ? lvl : g <= 258 ? lvl + 40 : 500;
    }
    for (let j = 0; j < 512; j++) for (let i = 0; i < 512; i++) if (wetEast ? i >= 500 : false) mask[j * 512 + i] = 6;
    if (!wetEast) for (let j = 0; j < 512; j++) mask[j * 512 + 0] = 0;
    return { header: { c, r: 0, posts: P, base_cm: 0 }, sections: { terrain, terrainEnc: 'u16', mask } };
  };
  const fr = { c0: 10, r0: 0, k0: 1, yOffset, waterLevel };
  const A = placeTile(fr, tile(10, true)), B = placeTile(fr, tile(11, false));
  let same = 0;
  for (let j = 0; j < P; j++) { assert.ok(Object.is(A.heights.h[j * P + P - 1], B.heights.h[j * P]), `post ${j}: ${A.heights.h[j * P + P - 1]} vs ${B.heights.h[j * P]}`); same++; }
  assert.equal(same, P);
  // (at the level: engine water on both sides; off it: land >= wl + 0.3)
  assert.equal(A.heights.h[1 * P + P - 1], Math.fround(waterLevel));
  assert.ok(A.heights.h[0 * P + P - 1] >= waterLevel + 0.3 - 1e-6);
  // (an inner post still reads its mask cell: A's wet cells near the east edge flatten a post 0.4 m over the level)
  assert.equal(A.heights.h[5 * P + 254], Math.fround(0.3 + 0)); // g = 254 < 256: at the level, wet cell -> water
});
