// (montana) The mountain west's look (cities/pkg/js/pkg-buildings.js): the compiler's region bands mirrored for what reads
// them before the buildings load (Bozeman, Denver, Salt Lake City, Boise, Cheyenne are 'mountain'; Kensington KS, Oakland,
// Okemah, Pittsburgh, Miami are not), its palettes (wood and metal roofs, no stucco majority), and a false front on a
// flat-roofed shop: the street wall carried up past the roof on the road side only, a cap over it.
//   node --test tests/pkg-mountain.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url).pathname;
class Color { setHex(h) { this.r = ((h >> 16) & 255) / 255; this.g = ((h >> 8) & 255) / 255; this.b = (h & 255) / 255; return this; } }
class BufferGeometry { constructor() { this.attributes = {}; } setAttribute(n, a) { this.attributes[n] = a; } computeVertexNormals() {} dispose() {} }
class Float32BufferAttribute { constructor(a, n) { this.array = Float32Array.from(a); this.itemSize = n; } }
class Mesh { constructor(g, m) { this.geometry = g; this.material = m; this.userData = {}; } }
const THREE = { Color, BufferGeometry, Float32BufferAttribute, Mesh, MeshStandardNodeMaterial: class { dispose() {} }, DoubleSide: 2 };
const load = (PKG) => { const window = { NYC: { THREE, PKG } }; vm.runInNewContext(readFileSync(root + 'cities/pkg/js/pkg-buildings.js', 'utf8'), { window, THREE }); return window.NYC.PkgBuildings; };
const hash = (seed) => (k) => { const s = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453; return s - Math.floor(s); };

test('regionAt: the compiler\'s bands; pkgRegion reads the package frame', () => {
  const P = load({ frame: { lon0: -111.0558, lat0: 45.6863 } });
  for (const [lon, lat] of [[-111.04, 45.68], [-104.99, 39.74], [-111.89, 40.76], [-116.2, 43.6], [-104.82, 41.14], [-103.67, 41.87]]) assert.equal(P.regionAt(lon, lat), 'mountain', `${lon},${lat}`);
  for (const [lon, lat, r] of [[-99.03, 39.79, 'plains-midwest'], [-122.27, 37.8, 'california'], [-96.31, 35.43, 'plains-midwest'], [-79.99, 40.44, 'northeast-rust'], [-122.68, 45.52, 'pacific-nw']]) assert.equal(P.regionAt(lon, lat), r, `${lon},${lat}`);
  assert.equal(P.pkgRegion(), 'mountain');
  assert.equal(load(undefined).pkgRegion(), null);
});

test('the mountain palette: wood and metal roofs, siding first, a false front only on flat shops and offices, other regions untouched', () => {
  const P = load();
  const R = P.REGIONS.mountain;
  assert.equal(R.walls[0][0], 'siding');
  assert.ok(R.walls.some(([w]) => w === 'wood') && R.colors.wood.length >= 4);
  assert.ok(R.pitch >= 1.2 && R.falseFront > 0);
  let ff = 0, n = 0;
  for (let s = 1; s < 400; s++) {
    const shop = P.styleFor({ kind: 'shop', roofShape: '', wall: '', region: 'mountain', hash: hash(s) });
    n++; if (shop.falseFront) ff++;
    assert.equal(P.styleFor({ kind: 'house', roofShape: '', wall: '', region: 'mountain', hash: hash(s) }).falseFront, false);
    assert.equal(P.styleFor({ kind: 'shop', roofShape: '', wall: '', region: 'plains-midwest', hash: hash(s) }).falseFront, false);
    assert.equal(P.styleFor({ kind: 'shop', roofShape: 'gabled', wall: '', region: 'mountain', hash: hash(s) }).falseFront, false);
  }
  assert.ok(ff / n > 0.6 && ff / n < 0.95, `${ff}/${n}`);
});

test('a false front: the road side carried up past the roof, nothing on the far side, a cap; too narrow a front: none', () => {
  const P = load();
  const b = P.createPkgBuilder();
  // (a 10 x 20 m mass, theta 0, its road to +z: the front is the local +z face, 10 m wide)
  const m = { cx: 50, cz: 20, w: 10, d: 20 }, roofY = 5, rise = 1.8;
  assert.equal(b.falseFront(m, 0, roofY, 0, 1, rise, true, 0x9a4f3a, 0xf1ede2), true);
  assert.equal(b.stats.falseFronts, 1);
  const pos = b.mesh('t').geometry.attributes.position.array;
  let top = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let k = 0; k < pos.length; k += 3) { top = Math.max(top, pos[k + 1]); minZ = Math.min(minZ, pos[k + 2]); maxZ = Math.max(maxZ, pos[k + 2]); }
  assert.ok(top > roofY + rise && top < roofY + rise + 2.2, `top ${top}`);
  assert.ok(minZ > 20 + 10 - 1.6, `the front only, not the back: minZ ${minZ}`);
  assert.ok(maxZ <= 20 + 10 + 0.6, `maxZ ${maxZ}`);
  const b2 = P.createPkgBuilder();
  assert.equal(b2.falseFront({ cx: 0, cz: 0, w: 2.5, d: 20 }, 0, roofY, 0, 1, rise, false, 0x9a4f3a, 0xf1ede2), false);
});

test('farKeys: a district bundle\'s far tiles by store key, as far.py lists them (Bozeman: 21 A ring, 49 B, 25 C)', () => {
  const window = { NYC: {} };
  vm.runInNewContext(readFileSync(root + 'cities/pkg/js/pkg-far.js', 'utf8'), { window, location: { search: '' } });
  const P = {
    buildId: 'htc-0.13.2-hg1-bbd2ead29', grid: 'hg1', domain: 'conus',
    far: { core: [1830912, 3162624, 1833472, 3165184], tiers: { a: { L: 1, size: 1024 }, b: { L: 3, size: 4096 }, c: { L: 5, size: 16384 } }, tiles: [] }
  };
  const k = window.NYC.PkgFar.farKeys(P);
  const n = (t) => k.filter((e) => e.tier === t).length;
  assert.deepEqual([n('a'), n('b'), n('c')], [21, 49, 25]);
  assert.ok(k.some((e) => e.key === 'far/htc-0.13.2-hg1-bbd2ead29/hg1-conus/5/109/191'));
  assert.ok(k.some((e) => e.key === 'far/htc-0.13.2-hg1-bbd2ead29/hg1-conus/1/1787/3087'));
  assert.equal(window.NYC.PkgFar.farKeys({ ...P, buildId: '../x' }).length, 0);
  assert.equal(window.NYC.PkgFar.farKeys({ ...P, far: { tiles: [] } }).length, 0);
});
