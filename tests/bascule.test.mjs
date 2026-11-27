// cities/sf/js/bascule.js: the ported helpers find a river crossing, and a town's deck floor over it is cut between the
// hinges (the bascule's leaves stand there); a town that is not Chicago keeps its bridges fixed
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function load(NYC, search = '') {
  const window = { NYC };
  const ctx = vm.createContext({ window, location: { search }, URLSearchParams, Math, console: { info() {}, log() {}, warn() {} } });
  vm.runInContext(readFileSync(new URL('../cities/sf/js/bascule.js', import.meta.url), 'utf8'), ctx);
  return window.NYC;
}
const THREE = { Vector3: class { set() { return this; } }, Quaternion: class {}, Matrix4: class {} };
// a street running north-south over a 60 m river (z -30..30), the town's frame at the Loop
const town = (id) => ({
  THREE, PKG: { id },
  GEO: { frame: { lat0: 41.882, lon0: -87.6278, bearingDeg: 0 }, water: [{ ring: [-500, -30, 500, -30, 500, 30, -500, 30] }],
    roadGraph: { nodes: [0, -200, 0, 200], names: ['N STATE ST'], links: [[0, 1, 0, 12, 2, 0, [], 128, 0, 0, 1, 1, [5, 7, 7, 7]]] } }
});

test('a deck over the river in Chicago is a bascule: hinges behind the river walls, the floor cut between them', () => {
  const N = load(town('us-1714000'));
  const roadPaths = N.basculePort.roadPaths, shore = N.basculePort.shorelineStations, water = N.basculePort.waterMap([{ k: 'water', p: [-500, -30, 500, -30, 500, 30, -500, 30] }]);
  const road = { p: [0, -200, 0, 200], w: 12, k: 'x' };
  const [path] = roadPaths([{ road, edges: N.basculePort.segments(road) }]);
  assert.equal(JSON.stringify(shore(path, 0, water).map((s) => Math.round(s))), "[170,230]");
  const seg = { kind: 'deck', x0: 0, z0: -200, dx: 0, dz: 1, rx: -1, rz: 0, t0: 0, t1: 400, L: -6, R: 6, ys: new Float32Array(201).fill(7) };
  const cut = N.basculeClaim(seg);
  assert.ok(cut && Math.abs(cut[0] - 168.8) < 0.01 && Math.abs(cut[1] - 231.2) < 0.01, JSON.stringify(cut));
  assert.ok(N.basculeCovers(0, 0) && !N.basculeCovers(0, 60));
});

test('another town, or ?bascule=0, keeps its bridges fixed', () => {
  const seg = { kind: 'deck', x0: 0, z0: -200, dx: 0, dz: 1, rx: -1, rz: 0, t0: 0, t1: 400, L: -6, R: 6, ys: new Float32Array(201).fill(7) };
  assert.equal(load(town('us-4261000')).basculeClaim({ ...seg }), null);
  assert.equal(load(town('us-1714000'), '?bascule=0').basculeClaim({ ...seg }), null);
});
