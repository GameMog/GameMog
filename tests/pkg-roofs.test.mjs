// A Hometown town's building looks from the compiler's stage 0 fields (cities/pkg/js/pkg-buildings.js): OSM's facade and
// roof colours win over the region's palettes, its dome and round roofs are drawn as such (not hipped / gabled), and a
// dome sits on its mass: 40 triangles inside the walls' ellipse, no lower than the eave, the flat roof round it in the
// roof's colour (a shade darker), never the walls'.
//   node --test tests/pkg-roofs.test.mjs
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
const load = () => { const window = { NYC: { THREE } }; vm.runInNewContext(readFileSync(root + 'cities/pkg/js/pkg-buildings.js', 'utf8'), { window, THREE }); return window.NYC.PkgBuildings; };
const hash = (seed) => (k) => { const s = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453; return s - Math.floor(s); };

test('styles: OSM colours win, dome and round are their own roofs, a record with none keeps the palettes', () => {
  const P = load();
  const s = P.styleFor({ kind: 'office', roofShape: 'dome', wall: 'stone', wallRGB: 0xd8cfb8, roofRGB: 0x6f9c8a, region: 'northeast-rust', hash: hash(3) });
  assert.equal(s.roof, 'dome');
  assert.equal(s.paint[0], 0xd8cfb8);
  assert.equal(s.roofColor, 0x6f9c8a);
  assert.equal(P.styleFor({ kind: 'office', roofShape: 'round', region: 'northeast-rust', hash: hash(4) }).roof, 'round');
  const plain = P.styleFor({ kind: 'house', roofShape: '', wall: '', wallRGB: 0, roofRGB: 0, region: 'plains-midwest', hash: hash(5) });
  assert.ok(plain.paint[0] > 0 && plain.roofColor > 0);
  assert.notEqual(plain.roof, 'dome');
});

test('a dome: 40 triangles on the mass\'s ellipse, above the eave, the flat roof round it a darker roof colour', () => {
  const P = load();
  const b = P.createPkgBuilder();
  const m = { cx: 100, cz: -40, w: 24, d: 16 }, y = 30, rise = 6, roofHex = 0x6f9c8a, wallHex = 0xeeeeee;
  b.roof(m, 0.3, y, rise, 'dome', roofHex, wallHex);
  assert.equal(b.stats.domes, 1);
  const g = b.mesh('t').geometry, pos = g.attributes.position.array, col = g.attributes.color.array;
  assert.equal(pos.length / 9, 40 + 2);
  const near = (a, c) => Math.abs(a - c) < 1e-3;
  const isRGB = (k, hex) => near(col[k], ((hex >> 16) & 255) / 255) && near(col[k + 1], ((hex >> 8) & 255) / 255) && near(col[k + 2], (hex & 255) / 255);
  let domeV = 0, ringV = 0;
  for (let k = 0; k < pos.length; k += 3) {
    const x = pos[k] - m.cx, yy = pos[k + 1], z = pos[k + 2] - m.cz;
    assert.ok(yy >= y - 1e-6 && yy <= y + rise + 1e-6);
    assert.ok(!isRGB(k, wallHex), 'nothing of the dome in the walls\' colour');
    if (isRGB(k, roofHex)) {
      domeV++;
      assert.ok(Math.hypot(x, z) <= Math.hypot(m.w, m.d) / 2 * 1.03, 'the dome inside its mass');
    } else ringV++;
  }
  assert.equal(domeV, 40 * 3);
  assert.equal(ringV, 2 * 3);
});

test('a round roof: a barrel vault, gable ends the walls\' colour, its crown at the rise', () => {
  const P = load();
  const b = P.createPkgBuilder();
  b.roof({ cx: 0, cz: 0, w: 20, d: 10 }, 0, 10, 3, 'round', 0x8e9396, 0xa0a0a0);
  const pos = b.mesh('t').geometry.attributes.position.array;
  let top = -Infinity;
  for (let k = 1; k < pos.length; k += 3) top = Math.max(top, pos[k]);
  assert.ok(Math.abs(top - 13) < 0.01, `crown ${top}`);
  assert.ok(b.stats.pitched === 1 && !b.stats.domes);
});
