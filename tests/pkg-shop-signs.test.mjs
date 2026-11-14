// A Hometown town's shop signs (cities/pkg/js/pkg-buildings.js signPlan): named after the town's own streets, name and
// sides, from a neutral list of trades; never a San Francisco or New York name; at most 16 letters; one name per
// storefront, the same on every run, and no two storefronts within sight (SIGHT m) with the same name while the town's
// MAX_SIGNS names last.
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

const near = (a, b, r) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2 < r * r;
const SIDE = /^(DOWNTOWN|NORTHSIDE|EASTSIDE|SOUTHSIDE|WESTSIDE) /;

test('signs: each shop named after a street it is on or near, the town or its side; deterministic, any order', () => {
  const P = load();
  const shops = [];
  for (let k = 0; k < 40; k++) shops.push({ i: k * 7, x: -180 + k * 9, z: k % 2 ? 6 : -6 }); // along Main St
  for (let k = 0; k < 20; k++) shops.push({ i: 1000 + k, x: 6, z: -150 + k * 5 }); // along 2nd St (and Main St near 0)
  const a = P.signPlan(RG, 'Okemah, OK', shops), b = P.signPlan(RG, 'Okemah, OK', [...shops].reverse());
  assert.deepEqual(a.themes, b.themes);
  for (const s of shops) assert.equal(a.pick.get(s.i), b.pick.get(s.i));
  assert.ok(a.themes.length >= 3 && a.themes.length <= P.MAX_SIGNS);
  for (const t of a.themes) {
    assert.match(t.text, /^(MAIN ST|MAIN|2ND ST|OKEMAH|DOWNTOWN) /, t.text);
    assert.ok(t.text.length <= 16, t.text);
    assert.ok(!SFNY.test(t.text) && !/HWY|US /.test(t.text), t.text);
    assert.ok(t.style >= 0 && t.style < 5);
  }
  // (a shop on Main St more than 100 m from 2nd St: Main St's name, the town's or its side's; most of them Main St's)
  const main = shops.slice(0, 40).filter((s) => Math.abs(s.x) > 100).map((s) => a.themes[a.pick.get(s.i)].text);
  for (const t of main) assert.match(t, /^(MAIN ST|MAIN|OKEMAH|DOWNTOWN) /);
  assert.ok(main.filter((t) => /^MAIN /.test(t) || t.startsWith('MAIN ST')).length > main.length / 2);
  // (and no name twice within sight: 60 shops fit in the town's names)
  for (const s of shops) for (const q of shops) if (s !== q && near(s, q, P.SIGHT)) assert.notEqual(a.pick.get(s.i), a.pick.get(q.i), `${s.i} ${q.i}`);
});

test('signs: a sign\'s words fit; a numbered street keeps its ST, a long name its short form', () => {
  const P = load();
  assert.equal(P.signText('MAIN ST', 'DINER'), 'MAIN ST DINER');
  assert.equal(P.signText('ADAMS ST', 'FURNITURE'), 'ADAMS FURNITURE');
  assert.equal(P.signText('WASHINGTON ST', 'BAKERY'), '');
  assert.equal(P.signText('3RD ST', 'BARBER SHOP'), '');
  assert.equal(P.signText('3RD ST', 'DINER'), '3RD ST DINER');
  assert.equal(P.signText('PITTSBURGH', 'MUSIC & RECORDS'), '');
});

test('signs: at most MAX_SIGNS names however many shops; every shop gets one; spread out when they run short', () => {
  const P = load();
  const shops = Array.from({ length: 600 }, (_, k) => ({ i: k, x: -190 + (k % 380), z: k % 2 ? 4 : -4 }));
  const p = P.signPlan(RG, 'Okemah, OK', shops);
  assert.ok(p.themes.length <= P.MAX_SIGNS);
  for (const s of shops) assert.ok(p.pick.get(s.i) >= 0 && p.pick.get(s.i) < p.themes.length);
  // (600 shops on 380 m of street, more than the names: still never the same name on two shops 10 m apart)
  for (const s of shops) for (const q of shops) if (s !== q && near(s, q, 10)) assert.notEqual(p.pick.get(s.i), p.pick.get(q.i));
});

test('signs: a grid town of 1,500 storefronts: no name twice within sight, the same plan every run', () => {
  const P = load();
  const names = ['W MAIN ST', 'E BROADWAY', 'N 3RD ST', 'S 14TH ST', 'OAK AVE', 'ELM ST', 'COLUMBIA ST', 'ADAMS ST', 'MONROE ST', 'JEFFERSON ST', 'LINCOLN BLVD', 'GRAND AVE', 'PARK AVE'];
  const nodes = [], links = [];
  // (13 streets each way, 150 m apart, over 1.8 km)
  for (let k = 0; k < 13; k++) {
    const v = -900 + k * 150; nodes.push(-900, v, 900, v, v, -900, v, 900);
    links.push([4 * k, 4 * k + 1, k, 9, 2, 0, []], [4 * k + 2, 4 * k + 3, (k + 5) % 13, 9, 2, 0, []]);
  }
  const rg = { nodes, names, links }, shops = [];
  for (let k = 0; k < 1500; k++) { const r = k % 13, t = Math.floor(k / 13); shops.push({ i: k * 16 + (k % 3), x: -890 + ((t * 31) % 1780), z: -900 + r * 150 + (k % 2 ? 8 : -8) }); }
  const t0 = performance.now(), a = P.signPlan(rg, 'Springfield, IL', shops), ms = performance.now() - t0;
  const b = P.signPlan(rg, 'Springfield, IL', [...shops].reverse());
  assert.deepEqual(a.themes, b.themes);
  for (const s of shops) assert.equal(a.pick.get(s.i), b.pick.get(s.i));
  assert.ok(a.themes.length <= P.MAX_SIGNS);
  let dup = 0;
  for (const s of shops) for (const q of shops) if (s !== q && a.pick.get(s.i) === a.pick.get(q.i) && near(s, q, P.SIGHT)) dup++;
  assert.equal(dup, 0, `${dup} pairs share a name within ${P.SIGHT} m`);
  for (const t of a.themes) assert.ok(t.text.length <= 16 && !SFNY.test(t.text), t.text);
  assert.ok(a.themes.some((t) => SIDE.test(t.text)) && a.themes.some((t) => t.text.startsWith('SPRINGFIELD ')));
  assert.ok(ms < 2000, `${ms.toFixed(0)} ms`);
});

test('signs: never a San Francisco or New York street or a too-long town as a sign\'s word', () => {
  const P = load();
  for (const n of ['MARKET ST', 'N POLK ST', 'MANHATTAN AVE', 'BROOKLYN AVE', 'HARLEM AVE', 'MIDTOWN BLVD']) assert.equal(P.streetWord(n), '', n);
  const shops = Array.from({ length: 30 }, (_, k) => ({ i: k, x: -180 + k * 12, z: 6 }));
  for (const town of ['Manhattan, KS', 'Brooklyn, IA', 'Kingsfordheights, IN']) {
    const p = P.signPlan(RG, town, shops);
    for (const t of p.themes) assert.ok(!SFNY.test(t.text) && !/KINGSFORD/.test(t.text) && t.text.length <= 16, t.text);
  }
});

test('signs: never a chain\'s or a brand\'s word ("LOWE ST HARDWARE", "NAPA AUTO PARTS", "HAMPTON ...")', () => {
  const P = load();
  for (const n of ['LOWE ST', 'N NAPA ST', 'HANCOCK ST', 'WILSON AVE', "O'REILLY ST", 'SHELL RD', 'TARGET ST', 'GOODYEAR AVE', 'MCALLISTER ST']) assert.equal(P.streetWord(n), '', n);
  assert.equal(P.streetWord('E CARSON ST'), 'CARSON ST');
  assert.equal(P.streetWord('CT PL'), ''); // (no word of its own)
  assert.equal(P.signText('PITTSBURGH', 'PAINT'), ''); // (a brand's whole name)
  assert.equal(P.signText('BOSTON', 'PIZZA'), '');
  const rg = { ...RG, names: ['LOWE ST', 'NAPA ST', '', 'US HWY 62'] }, shops = Array.from({ length: 30 }, (_, k) => ({ i: k, x: -180 + k * 12, z: 6 }));
  const p = P.signPlan(rg, 'Hampton, VA', shops);
  for (const t of p.themes) assert.ok(!/\b(LOWE|NAPA|HAMPTON)\b/.test(t.text), t.text);
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
