// A Hometown package's credit line (cities/pkg/js/pkg-hud.js): the title's credit names the package's own data from
// PKG.attribution (OpenStreetMap's ODbL credit linked to its copyright page), never "Built on Slop San Francisco".
//   node --test tests/pkg-credit.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url).pathname;
const SRC = readFileSync(root + 'cities/pkg/js/pkg-hud.js', 'utf8');
const ATTR = ['© OpenStreetMap contributors (ODbL 1.0), via Overture Maps Foundation', 'Overture Maps Foundation (CDLA Permissive 2.0 / ODbL 1.0 per theme)', 'USGS 3D Elevation Program (public domain)'];

function page(PKG) {
  // (the markup sf-hud.js has just worded: San Francisco's credit under the title)
  const text = { nodeType: 3, textContent: 'Built on Slop San Francisco ' };
  const attrs = { 'aria-label': 'Built on Slop San Francisco, on GitHub (opens in a new tab)' };
  const repo = { href: 'https://github.com/unable12/slop-sanfrancisco/', title: '', dataset: {}, firstChild: text, setAttribute: (k, v) => { attrs[k] = v; }, attrs };
  const added = [];
  const el = (tag) => { const a = {}; return { tag, attrs: a, setAttribute: (k, v) => { a[k] = v; } }; };
  const document = { getElementById: (id) => added.find((e) => e.id === id) || null, querySelector: (s) => (s === '.brand .repo-link' ? repo : null),
    createElement: el, head: { appendChild: (e) => added.push(e) }, body: { appendChild: (e) => added.push(e) } };
  const window = { NYC: { PKG, PLACE_DATA: { regional: {} } } };
  vm.runInNewContext(SRC, { window, document });
  return { repo, N: window.NYC, added };
}

test('package credit: the data sources from PKG.attribution, linked to OpenStreetMap; no Slop San Francisco', () => {
  const { repo } = page({ name: 'Okemah, OK', attribution: ATTR });
  assert.equal(repo.firstChild.textContent.trim(), '© OpenStreetMap contributors · Overture Maps · USGS 3DEP');
  assert.equal(repo.href, 'https://www.openstreetmap.org/copyright');
  assert.ok(repo.title.includes('ODbL 1.0') && repo.title.includes('USGS 3D Elevation Program'));
  for (const s of [repo.firstChild.textContent, repo.title, repo.attrs['aria-label'], repo.href]) assert.ok(!/Slop|github/i.test(s), s);
});

test('package credit: a line of its own, outside every .hud, linked to OpenStreetMap, above the pause menu and the map', () => {
  const { added } = page({ name: 'Okemah, OK', attribution: ATTR });
  const line = added.find((e) => e.id === 'pkg-map-credit'), css = added.find((e) => e.tag === 'style');
  assert.ok(line && css);
  assert.equal(line.textContent, '© OpenStreetMap contributors · Overture Maps · USGS 3DEP');
  assert.equal(line.href, 'https://www.openstreetmap.org/copyright');
  assert.match(css.textContent, /position:fixed/);
  const z = +/z-index:(\d+)/.exec(css.textContent)[1];
  assert.ok(z > 100, 'above the loader (100), the full map (90) and the pause menu (60)');
  assert.match(css.textContent, /body\.hud-minimized #pkg-map-credit\{opacity:\.55!important\}/);
  assert.equal(added.filter((e) => e.id === 'pkg-map-credit').length, 1);
});

test('package credit: follows the lines it is given (a WorldCover line; no lines at all)', () => {
  const { N } = page({ name: 'X', attribution: ATTR });
  const w = N.pkgCredit([...ATTR, 'ESA WorldCover (via Overture Maps land cover), CC BY 4.0']);
  assert.equal(w.short, '© OpenStreetMap contributors · Overture Maps · USGS 3DEP · ESA WorldCover');
  const none = N.pkgCredit(undefined);
  assert.equal(none.short, '© OpenStreetMap contributors');
  assert.equal(none.href, 'https://www.openstreetmap.org/copyright');
});

test('San Francisco and New York keep their own credit (pkg-hud.js does nothing without a package)', () => {
  const { repo } = page(undefined);
  assert.equal(repo.firstChild.textContent, 'Built on Slop San Francisco ');
  assert.equal(repo.href, 'https://github.com/unable12/slop-sanfrancisco/');
  assert.equal(page(undefined).added.length, 0);
});
