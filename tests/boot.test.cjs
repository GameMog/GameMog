const assert = require('node:assert/strict');
const { existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const html = readFileSync(join(__dirname, '../index.html'), 'utf8');
// (the city's script list: the plain <script> that makes nycAppScripts, not the first one, the audio shim)
const preloadScript = [...html.matchAll(/<script>([^]*?)<\/script>/g)].find((m) => m[1].includes('const nycAppScripts'));
// (the head's one read of the address's city, MC_CITY, which the list and the module below go by)
const cityScript = [...html.matchAll(/<script>([^]*?)<\/script>/g)].find((m) => /^\s*const MC_CITY = /m.test(m[1]));
const moduleScript = html.match(/<script type="module">([^]*?)<\/script>/);

test('city script preloads start before stylesheets can block the loader', () => {
  assert.ok(preloadScript);
  // (all but the instant title's own type, Barlow Condensed, display=block, which the title asks for first: index.html)
  const sheets = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].filter((m) => !/Barlow\+Condensed/.test(m[1]));
  assert.ok(sheets.length >= 2);
  for (const m of sheets) assert.ok(preloadScript.index < m.index, m[1]);
  assert.match(html, /<link rel="preconnect" href="https:\/\/cdn\.jsdelivr\.net" crossorigin\s*\/>/);
});

// Runs the head's list and the module that executes it, as the page does, for an address with `search`: the preloads,
// the scripts in order, and window.NYC as the city scripts find it
function boot(search) {
  const links = [];
  const scripts = [];
  const window = {};
  const THREE = {};
  const imports = Object.fromEntries(['bloom', 'ssr', 'mergeGeometries', 'mergeVertices', 'SkyMesh', 'SunLight', 'SunLightNode', 'ClusteredLighting'].map((name) => [name, () => {}]));
  const document = {
    baseURI: 'https://mc.gamemog.com/',
    createElement: (tagName) => ({ tagName, async: true }),
    head: {
      appendChild(element) {
        if (element.tagName === 'link') {
          assert.equal(window.NYC, undefined, 'fetching does not initialize or execute app code');
          assert.equal(element.rel, 'preload');
          assert.equal(element.as, 'script');
          links.push(element.href);
        } else {
          assert.equal(window.NYC.THREE, THREE, 'Three.js is available before app script execution');
          assert.equal(element.async, false, 'the browser must preserve dependency order');
          scripts.push(element.src);
        }
      }
    }
  };
  const location = { search, href: 'https://mc.gamemog.com/' + search };
  const context = vm.createContext({ window, document, location, URL, URLSearchParams, THREE, TSL: {}, ...imports });
  vm.runInContext(cityScript[1], context);
  vm.runInContext(preloadScript[1], context);
  assert.equal(scripts.length, 0);
  assert.equal(new Set(links).size, links.length, 'each script is preloaded once');
  // Imports are supplied above; evaluate the unchanged module body in the same global lexical environment.
  vm.runInContext(moduleScript[1].replace(/^\s*import .+;$/gm, ''), context);
  assert.deepEqual(scripts, links);
  assert.equal(new Set(scripts.map((src) => src.split('?v=')[1])).size, 1, 'one version for the whole list');
  return { scripts, NYC: window.NYC };
}

test('preloaded URLs match ordered scripts and execution waits for Three.js imports', () => {
  const { scripts, NYC } = boot('');
  // New York, as ever: its 28 scripts from js/, nyc-geodata.js first and main.js last, no city folder
  assert.equal(scripts.length, 28);
  assert.ok(scripts.every((s) => s.startsWith('./js/')));
  assert.match(scripts[0], /^\.\/js\/nyc-geodata\.js\?v=/);
  assert.match(scripts.at(-1), /^\.\/js\/main\.js\?v=/);
  assert.equal(NYC.BASE, undefined);
  // (the city the page plays, for the world contract: wagmi/world/city.js)
  assert.equal(NYC.CITY, 'ny');
  // (any other ?city= is New York too)
  assert.deepEqual(boot('?city=xx').scripts, scripts);
});

test('?city=sf boots San Francisco: its own modules from cities/sf, the shared ones from js/', () => {
  const { scripts, NYC } = boot('?city=sf');
  assert.match(scripts[0], /^\.\/cities\/sf\/js\/sf-hud\.js\?v=/);
  assert.match(scripts.at(-1), /^\.\/cities\/sf\/js\/main\.js\?v=/);
  const name = (s) => s.split('?')[0];
  const shared = scripts.filter((s) => s.startsWith('./js/')).map(name);
  assert.deepEqual(shared, ['./js/vehicle-lights.js', './js/pedestrians.js', './js/touch-controls.js', './js/gamepad-controls.js', './js/cameras.js', './js/scene-culling.js']);
  // (the fork's settings dialog and robotaxi ride are not Mog City's)
  assert.ok(!scripts.some((s) => /\/(settings|ride|ride-ui|ride-audio)\.js\?/.test(s)));
  // every script it names is there, and its data comes from its own folder
  for (const s of scripts) assert.ok(existsSync(join(__dirname, '..', name(s))), name(s));
  assert.equal(NYC.CITY, 'sf');
  assert.equal(NYC.BASE, 'https://mc.gamemog.com/cities/sf/');
  // (the map's licence and notice ship beside it)
  for (const f of ['LICENSE', 'NOTICE.md', 'docs/data-sources.md']) assert.ok(existsSync(join(__dirname, '../cities/sf', f)), f);
});
