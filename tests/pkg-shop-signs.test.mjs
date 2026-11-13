// A Hometown town's shop signs (cities/pkg/js/pkg-buildings.js signPlan): named after the town's own streets and name,
// from a neutral list of trades; never a San Francisco or New York name; one name per shop, the same on every run.
//   node --test tests/pkg-shop-signs.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url).pathname;
const load = () => { const window = { NYC: {} }; vm.runInNewContext(readFileSync(root + 'cities/pkg/js/pkg-buildings.js', 'utf8'), { window, THREE: {} }); return window.NYC.PkgBuildings; };
const SFNY = /SAN FRANCISCO|BAYSIDE|MARKET ST BISTRO|POLK ST|NOB HILL|MISSION DELI|MANHATTAN|BROOKLYN|NEW YORK|HARLEM|TIMES SQ/;

// a little grid town: Main St east-west, 2nd St north-south, an unnamed alley and a highway
const RG = { nodes: [-200, 0, 200, 0, 0, -200, 0, 200, -200, 50, 200, 50, -200, -80, 200, -80], names: ['W MAIN ST', 'N 2ND ST', '', 'US HWY 62'],
  links: [[0, 1, 0, 9, 2, 0, []], [2, 3, 1, 9, 2, 0, []], [4, 5, 2, 5, 1, 0, []], [6, 7, 3, 12, 2, 0, []]] };

test('street words: no direction prefix, no highways or route numbers, no long names', () => {
  const P = load();
  assert.equal(P.streetWord('W COLUMBIA ST'), 'COLUMBIA ST');
  assert.equal(P.streetWord('N 3RD ST'), '3RD ST');
  for (const n of ['', 'US HWY 62', 'N3750 RD', 'E1080 RD', 'VIETNAM VETERAN\'S MEMORIAL HWY', '10TH ST BYPASS', 'BLVD OF THE ALLIES', 'E WASHINGTON ST FRONTAGE RD']) assert.equal(P.streetWord(n), '', n);
});

test('signs: each shop named after the street it fronts or the town, deterministic, any order', () => {
  const P = load();
  const shops = [];
  for (let k = 0; k < 40; k++) shops.push({ i: k * 7, x: -180 + k * 9, z: k % 2 ? 6 : -6 }); // along Main St
  for (let k = 0; k < 20; k++) shops.push({ i: 1000 + k, x: 6, z: -150 + k * 5 }); // along 2nd St (and Main St near 0)
  const a = P.signPlan(RG, 'Okemah, OK', shops), b = P.signPlan(RG, 'Okemah, OK', [...shops].reverse());
  assert.deepEqual(a.themes, b.themes);
  for (const s of shops) assert.equal(a.pick.get(s.i), b.pick.get(s.i));
  assert.ok(a.themes.length >= 3 && a.themes.length <= 20);
  for (const t of a.themes) {
    assert.match(t.text, /^(MAIN ST|2ND ST|OKEMAH) /, t.text);
    assert.ok(!SFNY.test(t.text) && !/HWY|US /.test(t.text), t.text);
    assert.ok(t.style >= 0 && t.style < 5);
  }
  // (a shop on Main St away from the corner: Main St's name or the town's; most of them Main St's)
  const main = shops.slice(0, 40).filter((s) => Math.abs(s.x) > 12).map((s) => a.themes[a.pick.get(s.i)].text);
  for (const t of main) assert.match(t, /^(MAIN ST|OKEMAH) /);
  assert.ok(main.filter((t) => t.startsWith('MAIN ST')).length > main.length / 2);
});

test('signs: at most 20 names however many shops; every shop gets one', () => {
  const P = load();
  const shops = Array.from({ length: 600 }, (_, k) => ({ i: k, x: -190 + (k % 380), z: k % 2 ? 4 : -4 }));
  const p = P.signPlan(RG, 'Okemah, OK', shops);
  assert.ok(p.themes.length <= 20);
  for (const s of shops) assert.ok(p.pick.get(s.i) >= 0 && p.pick.get(s.i) < p.themes.length);
});

// the three proof towns, when their packages are here (cities/pkg/packages is git-ignored): every street name the
// road graph has gives a SF/NY-free sign word
for (const id of ['okemah', 'phoenix', 'pittsburgh']) {
  const f = root + `cities/pkg/packages/${id}/geodata.js`;
  test(`signs: ${id}'s street words`, { skip: !existsSync(f) && 'package not built here' }, () => {
    const window = { NYC: {} };
    vm.runInNewContext(readFileSync(f, 'utf8'), { window });
    const P = load(), rg = window.NYC.GEO.roadGraph;
    const words = new Set(rg.names.map(P.streetWord).filter(Boolean));
    assert.ok(words.size >= 10, `${words.size} words`);
    for (const w of words) assert.ok(!SFNY.test(w), w);
  });
}
