// San Francisco on Mog City's engine (?city=sf): what the story runner takes from it, and the city's data as shipped.
//   node --test tests/sf-city.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
globalThis.location = new URL('http://127.0.0.1:4621/?city=sf&pack=x');
const { check } = await import('../wagmi/storyrun/pack.js');
const { SF_PLACES } = await import('../wagmi/storyrun/places.js');

test('a world set in San Francisco plays on a ?city=sf page; New York\'s does not', () => {
  const native = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/storyrun/test-packs/native.json'), 'utf8'));
  const sf = structuredClone(native); sf.city = 'sf';
  assert.deepEqual(check(sf), []);
  const ny = structuredClone(native); delete ny.city;
  assert.ok(check(ny).some((e) => /this page plays San Francisco/.test(e)));
  const la = structuredClone(native); la.city = 'la';
  assert.ok(check(la).some((e) => /city la/.test(e)));
  // (the San Francisco smoke world: a drive up California St, on SF's own places)
  const smoke = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/storyrun/test-packs/sf-smoke.json'), 'utf8'));
  assert.deepEqual(check(smoke), []);
});

test("San Francisco's place library is the Story Kit's (no drift)", () => {
  // (the arrivals' keys, cities/sf/js/city-config.js TELEPORT_DEFS and LANDMARK_TELEPORTS)
  const cfg = fs.readFileSync(path.join(ROOT, 'cities/sf/js/city-config.js'), 'utf8');
  const arrivals = [...cfg.slice(cfg.indexOf('const TELEPORT_DEFS'), cfg.indexOf('const NOT_DRIVEN')).matchAll(/^\s+([a-z]+): [\['"]/gm)].map((m) => m[1]);
  assert.ok(arrivals.length >= 14);
  const mine = new Set([...arrivals, ...Object.keys(SF_PLACES)]);
  const ts = path.join(process.env.GAMEMOG_DIR || path.join(ROOT, '..'), 'storykit/pack/cities.ts');
  if (!fs.existsSync(ts)) return;
  const body = fs.readFileSync(ts, 'utf8'), at = body.indexOf('export const PLACES');
  const sf = body.slice(body.indexOf('sf: {', at), body.indexOf('export const CAM_POINTS'));
  const theirs = [...sf.matchAll(/^\s*'?([a-z0-9_-]+)'?: \{ name:/gm)].map((m) => m[1]);
  assert.ok(theirs.length >= 40);
  assert.deepEqual(theirs.filter((k) => !mine.has(k)), []);
});

test("the city's data ships gzipped, every file its loader asks for, each a whole SFB1 file", () => {
  const geo = fs.readFileSync(path.join(ROOT, 'cities/sf/js/sf-geodata.js'), 'utf8');
  const urls = [...geo.slice(0, 4000).matchAll(/"url":"(data\/[a-z-]+-core\.bin)"/g)].map((m) => m[1]);
  assert.deepEqual(urls.sort(), ['data/buildings-core.bin', 'data/groundmask-core.bin', 'data/terrain-core.bin']);
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'cities/sf/data/region/manifest.json'), 'utf8'));
  const region = [...manifest.city.files, ...manifest.horizon.files, ...manifest.buildings.files, manifest.mask, manifest.trees, manifest.roads].map((f) => f.url);
  for (const u of [...urls, ...region]) {
    const f = path.join(ROOT, 'cities/sf', u + '.gz');
    assert.ok(fs.existsSync(f), u);
  }
  // (one of each kind inflated and read as the loader reads it: the magic, its header's length)
  for (const u of [urls[0], region[0], manifest.mask.url]) {
    const buf = zlib.gunzipSync(fs.readFileSync(path.join(ROOT, 'cities/sf', u + '.gz')));
    assert.equal(buf.subarray(0, 4).toString(), 'SFB1', u);
    const n = buf.readUInt32LE(4);
    assert.ok(JSON.parse(buf.subarray(8, 8 + n).toString()), u);
  }
});

test('no company\'s name on San Francisco\'s screens (labels, signs, the teleport list, the scenic cameras)', () => {
  const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
  const cfg = read('cities/sf/js/city-config.js');
  const labels = cfg.slice(cfg.indexOf('const NYC_LANDMARKS'), cfg.indexOf('.filter(', cfg.indexOf('const NYC_LANDMARKS')));
  // (each entry's display and short names: the OSM name after them stays the data's key)
  const shown = [...labels.matchAll(/\['[a-z]+', '([^']+)', '([^']+)'/g)].flatMap((m) => [m[1], m[2]]);
  const hud = read('cities/sf/js/sf-hud.js'), signs = read('cities/sf/js/landmarks.js') + read('cities/sf/js/buildings.js');
  for (const brand of ['Salesforce', 'Transamerica', 'Oracle', 'Ghirardelli', 'GHIRARDELLI', 'DUANE READE', 'Waymo']) {
    assert.ok(!shown.some((s) => s.includes(brand)), `label ${brand}`);
    assert.ok(!/name: '[^']*/.test(hud) || ![...hud.matchAll(/(?:name|short): '([^']+)'/g)].some((m) => m[1].includes(brand)), `hud ${brand}`);
    assert.ok(![...signs.matchAll(/(?:fillText\(|text: )'([^']+)'/g)].some((m) => m[1].includes(brand)), `sign ${brand}`);
  }
});
