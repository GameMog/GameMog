// Street names as a player reads them (the map, the radar, the location chip, the arrivals, mission text): ordinals
// "3rd" and "14th" (never "3Rd", "14Th"), "McCord St", "St John's Rd", "NE 23rd St", "US Hwy 62". A Hometown package's
// arrival and place names come title-cased by the compiler (Python's str.title(): "N 3Rd St") and are put right when the
// package loads (cities/pkg/js/pkg-hud.js pkgNameCase); the road graph's capitals are made display names by
// cities/sf/js/city-config.js prettyName, whose San Francisco labels stay exactly as they were.
//   node --test tests/street-names.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url).pathname;
const hud = () => { const window = { NYC: {} }, module = { exports: {} }; vm.runInNewContext(readFileSync(root + 'cities/pkg/js/pkg-hud.js', 'utf8'), { window, module, document: {} }); return module.exports; };
// (prettyName and its helpers, cut out of city-config.js: the file itself needs the whole city loaded)
const prettyOf = (src) => {
  const a = src.indexOf('function ordinal(n)'), b = src.indexOf('const REAL_SPELLING');
  const ctx = {}; vm.runInNewContext(src.slice(a, src.indexOf('\n', b)) + '\nthis.prettyName = prettyName;', ctx);
  return ctx.prettyName;
};
const pretty = prettyOf(readFileSync(root + 'cities/sf/js/city-config.js', 'utf8'));
// San Francisco's prettyName as it was before Hometown towns' names were added to it (Mog City 0.8.0)
const prettyBefore = prettyOf(`function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
const UNSHOWN = new Set(['CLAUDE LN']);
function prettyName(n) {
  if (UNSHOWN.has(String(n || '').trim().toUpperCase())) return 'Lane';
  return String(n || '').replace(/\\s+/g, ' ').trim().toLowerCase().replace(/\\b\\w/g, (c) => c.toUpperCase())
    .replace(/\\b0*(\\d+)(st|nd|rd|th)\\b/gi, (_, d) => ordinal(+d)).replace(/\\bTunl\\b/, 'Tunnel')
    .replace(/\\bMc([a-z])/g, (_, c) => 'Mc' + c.toUpperCase()).replace(/\\b(Ofarrell|Macarthur)\\b/g, (w) => REAL_SPELLING[w]);
}
const REAL_SPELLING = { Ofarrell: "O'Farrell", Macarthur: 'MacArthur' };
`);
const MISCASED = /\b\d+(St|Nd|Rd|Th)\b|\bMc[a-z]|[a-z]['’][A-Z]\b|\b(Ne|Nw|Se|Sw) \S|\bUs Hwy\b/;

test('the compiler\'s title case put right; text already right unchanged', () => {
  const { pkgNameCase: f } = hud();
  const cases = {
    'N 3Rd St': 'N 3rd St', 'S 14Th St': 'S 14th St', 'N 1St Ave': 'N 1st Ave', 'S 2Nd St': 'S 2nd St', '6Th St': '6th St',
    'the diner on N 1St St': 'the diner on N 1st St', 'Mccord St': 'McCord St', 'Mcanulty Dr': 'McAnulty Dr',
    "St John'S Rd": "St John's Rd", "O'Connor St": "O'Connor St", 'Us Hwy 62': 'US Hwy 62', 'Ne 23Rd St': 'NE 23rd St',
    'the bank on Nw 10Th St': 'the bank on NW 10th St', 'Sr 51': 'SR 51', 'Fm 1960 Rd': 'FM 1960 Rd',
    // (right already, or not a street: as they are)
    'N 3rd St': 'N 3rd St', 'McCord St': 'McCord St', 'Downtown': 'Downtown', 'South': 'South', 'Seminole St': 'Seminole St',
    'Okemah High School': 'Okemah High School', 'W Monroe St': 'W Monroe St', 'Saint Patrick St': 'Saint Patrick St', 'Mc St': 'Mc St',
  };
  for (const [a, b] of Object.entries(cases)) assert.equal(f(a), b, a);
});

test('a package\'s arrivals and places: every name the player sees put right in place', () => {
  const { pkgNameCaseAll } = hud();
  const N = { PKG: { spawn: { name: 'Downtown' }, spawns: { north: { name: 'N 3Rd St' }, west: { name: 'S 14Th St' } },
    places: { diner: { name: 'the diner on N 1St St', street: 'N 1St St' }, school: { name: 'Okemah High School', street: '' } } },
    PLACE_DATA: { regional: { pkg_north: { name: 'N 3Rd St' }, pkg_downtown: { name: 'Downtown' } } } };
  pkgNameCaseAll(N);
  assert.equal(N.PKG.spawns.north.name, 'N 3rd St');
  assert.equal(N.PKG.spawns.west.name, 'S 14th St');
  assert.equal(N.PLACE_DATA.regional.pkg_north.name, 'N 3rd St');
  assert.equal(N.PKG.places.diner.name, 'the diner on N 1st St');
  assert.equal(N.PKG.places.diner.street, 'N 1st St');
  assert.equal(N.PKG.places.school.name, 'Okemah High School');
});

test('road graph names: ordinals, Mc, apostrophes, quarters and routes', () => {
  const cases = { 'N 3RD ST': 'N 3rd St', 'S 14TH ST': 'S 14th St', '03RD ST': '3rd St', 'MCCORD ST': 'McCord St', "ST JOHN'S RD": "St John's Rd",
    "O'CONNOR ST": "O'Connor St", 'NE 23RD ST': 'NE 23rd St', 'US HWY 62': 'US Hwy 62', 'SR 51': 'SR 51', 'E CARSON ST': 'E Carson St',
    "O'FARRELL ST": "O'Farrell St", 'OFARRELL ST': "O'Farrell St", 'MCALLISTER ST': 'McAllister St', 'CLAUDE LN': 'Lane' };
  for (const [a, b] of Object.entries(cases)) assert.equal(pretty(a), b, a);
});

test('San Francisco\'s street labels exactly as they were', () => {
  const window = { NYC: {} };
  vm.runInNewContext(readFileSync(root + 'cities/sf/js/sf-geodata.js', 'utf8'), { window });
  const names = window.NYC.GEO.roadGraph.names;
  assert.ok(names.length > 500);
  for (const n of names) assert.equal(pretty(n), prettyBefore(n), n);
});

// the proof towns, when their packages are here (cities/pkg/packages is git-ignored): the compiler's names mis-cased
// before, none after; every road graph name made a display name with no mis-casing
for (const id of ['okemah', 'phoenix', 'pittsburgh']) {
  const f = root + `cities/pkg/packages/${id}/geodata.js`;
  test(`${id}: arrivals, places and streets read right`, { skip: !existsSync(f) && 'package not built here' }, () => {
    const window = { NYC: {} };
    vm.runInNewContext(readFileSync(f, 'utf8'), { window });
    const N = window.NYC, all = () => [...Object.values(N.PKG.spawns || {}), ...Object.values(N.PLACE_DATA.regional || {}), ...Object.values(N.PKG.places || {})].map((p) => p.name);
    assert.ok(all().some((n) => MISCASED.test(n)), 'the package has the compiler\'s mis-cased names');
    hud().pkgNameCaseAll(N);
    for (const n of all()) assert.ok(!MISCASED.test(n), n);
    for (const n of N.GEO.roadGraph.names) assert.ok(!MISCASED.test(pretty(n)), `${n} -> ${pretty(n)}`);
  });
}
