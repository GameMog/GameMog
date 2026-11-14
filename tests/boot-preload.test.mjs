// The head's script preloads (index.html: every city script is preloaded while Three.js loads). A town from GameMog
// lists its bundle as the marker 'town:geodata.json' (fetched as data, never run as a script): a <link rel=preload> to it
// was a browser error, net::ERR_UNKNOWN_URL_SCHEME, on every town boot. Here, for a town, a package, San Francisco and
// New York: every preload is a same-origin relative script, none is the marker, and the town's list still carries it
// (the boot splits the list at it).
//   node --test tests/boot-preload.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url).pathname;
const html = readFileSync(root + 'index.html', 'utf8');
// (the city's script list and its preload loop, as the head runs them)
const a = html.indexOf('const nycAppScripts =');
const loop = html.indexOf('for (const src of nycAppScripts)', a);
const b = html.indexOf('\n    }\n', loop);
assert.ok(a > 0 && loop > a && b > loop, 'the script list and its preload loop are in index.html');
const block = html.slice(a, b + 6);

function preloads({ city, pkg = null, town = null }) {
  const links = [];
  const document = { createElement: () => ({}), head: { appendChild: (l) => links.push(l) } };
  const ctx = { document, MC_CITY: city, MC_PKG: pkg, MC_TOWN: town };
  vm.runInNewContext(block + '\nthis.nycAppScripts = nycAppScripts;', ctx);
  return { links, scripts: ctx.nycAppScripts };
}

for (const [name, opts] of Object.entries({
  town: { city: 'pkg', town: 'us-4054200' },
  package: { city: 'pkg', pkg: 'okemah' },
  'San Francisco': { city: 'sf' },
  'New York': { city: 'ny' },
})) {
  test(`${name}: every preload a relative script, never the town marker`, () => {
    const { links, scripts } = preloads(opts);
    assert.ok(links.length > 10, 'the city scripts are preloaded');
    for (const l of links) {
      assert.equal(l.rel, 'preload');
      assert.equal(l.as, 'script');
      assert.match(l.href, /^\.\//, l.href);
      assert.ok(!l.href.includes('town:'), l.href);
    }
    assert.equal(links.length, scripts.filter((s) => s !== 'town:geodata.json').length);
    if (opts.town) assert.ok(scripts.includes('town:geodata.json'), 'the town\'s list keeps its marker (the boot splits there)');
    else assert.ok(!scripts.includes('town:geodata.json'));
  });
}
