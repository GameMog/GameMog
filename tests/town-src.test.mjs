// A Hometown town from GameMog (wagmi/world/town-src.js): the address, the bundle check, and a story world played only
// on a page that loaded the town it pins (wagmi/storyrun/pack.js). node --test tests/town-src.test.mjs
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TC = 'htc-0.3.0-hg1-becc45523', TS = '771cf340f47905b6ddfcf93e53d6d9649512ada4d466ba41c29dbece8ae05540';
const LOCK = { format: 'hometown-city-lock', formatVersion: 2, place: 'us-4054200', buildId: TC, grid: 'hg1', domain: 'conus', origin: { c0: 5806, r0: 8582 }, k0: 0.996523396, gamma0: -0.190411, yOffset: 244, waterLevel: -10, tiles: TS };
const PIN = { place: 'us-4054200', compiler: TC, tiles: TS, formatVersion: 2, grid: 'hg1', domain: 'conus', origin: { c0: 5806, r0: 8582 }, k0: 0.996523396, gamma0: -0.190411, yOffset: 244, waterLevel: -10 };
const SEARCH = `?city=pkg&town=us-4054200&tc=${TC}&ts=${TS}&host=http://localhost:4721`;
// (a page that loaded the town: pack.js reads the page's city when it is imported)
globalThis.location = { search: SEARCH, hostname: 'localhost', origin: 'http://localhost:4722', href: 'http://localhost:4722/' + SEARCH };
globalThis.window = globalThis;
globalThis.NYC = { CITY: 'pkg', PKG: { id: 'us-4054200', lock: LOCK } };
const T = await import('../wagmi/world/town-src.js');
const { check } = await import('../wagmi/storyrun/pack.js');
const { cityId, cityQuery } = await import('../wagmi/world/city.js');

test('the town address: a canonical place, a build id, a 64-hex tile set; the host gamemog.com, or a local dev host on localhost', () => {
  const q = (s) => new URLSearchParams(s);
  const t = T.townFromQuery(q(SEARCH), { hostname: 'localhost' });
  assert.equal(t.base, `http://localhost:4721/towns/us-4054200/${TC}/${TS}/`);
  assert.equal(T.townFromQuery(q(SEARCH), { hostname: 'mc.gamemog.com' }).host, 'https://gamemog.com');
  assert.equal(T.townFromQuery(q(SEARCH.replace('localhost:4721', 'evil.example')), { hostname: 'localhost' }).host, 'https://gamemog.com');
  for (const bad of [SEARCH.replace('us-4054200', 'okemah'), SEARCH.replace(TS, 'abc'), SEARCH.replace(TC, '../x'), SEARCH.replace('city=pkg', 'city=sf')]) assert.equal(T.townFromQuery(q(bad), { hostname: 'localhost' }), null, bad);
  assert.equal(cityId(), 'pkg');
});

test('loadTown: the bundle is read as data and must be the town the address names', async () => {
  const t = T.townFromQuery(new URLSearchParams(SEARCH), { hostname: 'localhost' });
  const body = { format: 'hometown-bundle', formatVersion: 1, GEO: {}, PLACE_DATA: {}, PKG: { id: 'us-4054200', lock: LOCK } };
  const f = (b, ok = true) => async (url, init) => { assert.equal(init.credentials, 'omit'); assert.ok(url.endsWith('/geodata.json')); return { ok, status: ok ? 200 : 404, json: async () => b }; };
  assert.equal((await T.loadTown(t, f(body))).PKG.lock.tiles, TS);
  await assert.rejects(T.loadTown(t, f(body, false)), /404/);
  await assert.rejects(T.loadTown(t, f({ ...body, formatVersion: 99 })), /not a town bundle/);
  await assert.rejects(T.loadTown(t, f({ ...body, PKG: { ...body.PKG, lock: { ...LOCK, tiles: 'f'.repeat(64) } } })), /not the town/);
});

test('a world pins the town field by field (compiler = the bundle\'s buildId)', () => {
  assert.equal(T.townLockMismatch(PIN, LOCK), '');
  assert.equal(T.townLockMismatch({ ...PIN, tiles: 'e'.repeat(64) }, LOCK), 'tiles');
  assert.equal(T.townLockMismatch({ ...PIN, k0: 1 }, LOCK), 'k0');
  assert.equal(T.townLockMismatch(null, LOCK), 'no town pinned');
});

test('a hometown world plays only on the page that loaded its town; a New York world is refused here', () => {
  globalThis.NYC.TOWN = T.townFromQuery(new URLSearchParams(SEARCH), { hostname: 'localhost' });
  assert.match(cityQuery('pkg'), /town=us-4054200/);
  const native = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/storyrun/test-packs/native.json'), 'utf8'));
  const cityErr = (w) => check(w).filter((e) => /^city /.test(e));
  assert.deepEqual(cityErr({ ...native, city: 'hometown', hometown: PIN }), []);
  assert.match(cityErr({ ...native, city: 'hometown', hometown: { ...PIN, tiles: 'e'.repeat(64) } })[0], /has not loaded the town the world pins \(tiles\)/);
  assert.match(cityErr({ ...native, city: 'hometown' })[0], /no town pinned/);
  assert.equal(cityErr({ ...native, city: 'ny' }).length, 1);
  delete globalThis.NYC.TOWN;
  assert.match(cityErr({ ...native, city: 'hometown', hometown: PIN })[0], /no town loaded/);
});

// (the runner's modules keep timers on a page; a node test has none to close)
after(() => setTimeout(() => process.exit(0), 50));
