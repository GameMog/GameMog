// A Hometown place's street look (fid2-street): its buses and the player's plate carry the place's own words, never San
// Francisco's (cities/pkg/js/pkg-hud.js pkgVehicleSigns); the terrain's mask keeps the land off the asphalt along a curb
// (cities/sf/js/terrain-mesh.js roadsideMask); the road paint measures its lines through the mesh's own model matrix,
// so the floating origin no longer draws every line 16 times as wide.
//   node --test tests/pkg-street.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url).pathname;
const read = (f) => readFileSync(root + f, 'utf8');

function hud() {
  const window = { NYC: {} };
  vm.runInNewContext(read('cities/pkg/js/pkg-hud.js'), { window, document: {} });
  return window.NYC.pkgVehicleSigns;
}

test('vehicle signs: the town in capitals, its state from the suffix, a stable accent', () => {
  const signs = hud();
  const bh = signs({ id: 'us-1203275', name: 'Bal Harbour, FL' });
  assert.equal(bh.town, 'BAL HARBOUR');
  assert.equal(bh.state, 'Florida');
  assert.equal(typeof bh.accent, 'number');
  assert.deepEqual(signs({ id: 'us-1203275', name: 'Bal Harbour, FL' }), bh, 'the same town, the same signs');
  assert.equal(signs({ id: 'okemah', name: 'Okemah, OK' }).state, 'Oklahoma');
  assert.equal(signs({ id: 'pittsburgh', name: 'Pittsburgh, PA' }).town, 'PITTSBURGH');
  // no US state suffix: no state on the plate, never California's
  assert.equal(signs({ id: 'x', name: 'Somewhere' }).state, '');
  assert.equal(signs({ id: 'x', name: 'Town, ZZ' }).state, '');
  const accents = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'].map((id) => signs({ id, name: 'X, TX' }).accent));
  assert.ok(accents.size > 1, 'towns differ in their stripe colour');
});

test('vehicle signs: the engine reads them for the bus sign, the bus livery and the plate in a town', () => {
  const traffic = read('cities/sf/js/traffic.js');
  assert.match(traffic, /pkgVehicleSigns\(window\.NYC\.PKG\)/);
  assert.match(traffic, /signs \? signs\.town \|\| 'LOCAL' : 'CALIFORNIA'/, 'California only on San Francisco\'s own buses');
  assert.match(read('cities/sf/js/actor-models.js'), /town \? town\.accent : 0xbe1e2d/, 'Muni\'s red only in San Francisco');
  assert.match(read('cities/sf/js/controllers.js'), /signs \? signs\.state : 'California'/);
});

function terrainMesh() {
  const window = { NYC: { THREE: {}, Terrain: {}, createTerrainMaterial: () => null } };
  vm.runInNewContext(read('cities/sf/js/terrain-mesh.js'), { window, URLSearchParams, location: { search: '' } });
  return window.NYC.roadsideMask;
}

test('roadside mask: a land cell beside the asphalt (of its eight) is asphalt; the shore and the paving are kept', () => {
  const roadsideMask = terrainMesh();
  // 7 x 5: a road (0) down column 1, a median of lawn (2) in columns 2-4, a sidewalk (1) in column 5 next to it,
  // the water's edge (5) and wet sand (11) touching the road in the bottom row
  const w = 7, h = 5;
  const m = Uint8Array.from([
    2, 0, 2, 2, 2, 1, 2,
    2, 0, 2, 2, 2, 1, 2,
    2, 0, 2, 2, 2, 1, 2,
    2, 0, 2, 2, 2, 1, 2,
    5, 0, 11, 2, 2, 1, 2,
  ]);
  const out = roadsideMask(m, w, h);
  const at = (i, j) => out[j * w + i];
  for (let j = 0; j < h - 1; j++) {
    assert.equal(at(0, j), 0, 'the lawn left of the road');
    assert.equal(at(2, j), 0, 'the median\'s cell on the curb');
    assert.equal(at(3, j), 2, 'the median a cell in stays');
    assert.equal(at(5, j), 1, 'a sidewalk is paving already');
    assert.equal(at(6, j), 2, 'the lawn behind a sidewalk stays');
  }
  assert.equal(at(0, 4), 5, 'the water\'s edge stays');
  assert.equal(at(2, 4), 11, 'the wet sand stays');
  assert.equal(m[2], 2, 'the compiled mask itself is untouched (the island tops read it)');
});

test('road paint: the line width is measured through the model matrix (floating origin)', () => {
  for (const f of ['cities/sf/js/tsl-materials.js', 'js/tsl-materials.js']) {
    const src = read(f);
    const a = src.indexOf('function createRoadPaintMaterial');
    const body = src.slice(a, src.indexOf('\n}\n', a));
    assert.match(body, /cameraProjectionMatrix\.mul\(modelViewMatrix\)/, f);
    assert.doesNotMatch(body, /cameraProjectionMatrix\.mul\(cameraViewMatrix\)/, f);
  }
});
