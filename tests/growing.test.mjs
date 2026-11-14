// A growing town (wagmi/world/growing.js, the production builder's lock v3 and &tv= variants in wagmi/world/town-src.js):
// the variant address, lock v3 accepted beside v2, the district window, the soft boundary, the status answer and the
// swap address. node --test tests/growing.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

const TC = 'htc-0.8.0-hg1-bd21d7d2c', TS = '374619d446da8abe062dde3b8cda89f7f951450d430c3e10bb1a2ce7405e976d';
const LOCK3 = { format: 'hometown-city-lock', formatVersion: 3, place: 'us-4054200', buildId: TC, grid: 'hg1', domain: 'conus', origin: { c0: 5806, r0: 8582 }, k0: 0.996523396, gamma0: -0.190411, yOffset: 246, waterLevel: -10, tiles: TS };
const PIN3 = { place: 'us-4054200', compiler: TC, tiles: TS, formatVersion: 3, grid: 'hg1', domain: 'conus', origin: { c0: 5806, r0: 8582 }, k0: 0.996523396, gamma0: -0.190411, yOffset: 246, waterLevel: -10 };
const SEARCH = `?city=pkg&town=us-4054200&tc=${TC}&ts=${TS}&host=http://localhost:4841`;
globalThis.window = globalThis;
const T = await import('../wagmi/world/town-src.js');
const G = await import('../wagmi/world/growing.js');

test('the variant address: &tv=district-{c}-{r}|full adds a folder; no tv keeps the lock v2 address', () => {
  const q = (s) => new URLSearchParams(s);
  const d = T.townFromQuery(q(SEARCH + '&tv=district-5805-8582'), { hostname: 'localhost' });
  assert.equal(d.tv, 'district-5805-8582');
  assert.equal(d.base, `http://localhost:4841/towns/us-4054200/${TC}/${TS}/district-5805-8582/`);
  assert.equal(T.townFromQuery(q(SEARCH + '&tv=full'), { hostname: 'localhost' }).base, `http://localhost:4841/towns/us-4054200/${TC}/${TS}/full/`);
  assert.equal(T.townFromQuery(q(SEARCH), { hostname: 'localhost' }).base, `http://localhost:4841/towns/us-4054200/${TC}/${TS}/`);
  for (const bad of ['&tv=district-1', '&tv=../x', '&tv=FULL', '&tv=district-1-2-3', '&tv=']) assert.equal(T.townFromQuery(q(SEARCH + bad), { hostname: 'localhost' }), null, bad);
});

test('loadTown: lock v3 plays, its variant must be the one the address names; an unknown lock version is refused', async () => {
  const t = T.townFromQuery(new URLSearchParams(SEARCH + '&tv=district-5805-8582'), { hostname: 'localhost' });
  const body = (PKG) => ({ format: 'hometown-bundle', formatVersion: 1, GEO: {}, PLACE_DATA: {}, PKG: { id: 'us-4054200', lock: LOCK3, variant: 'district-5805-8582', ...PKG } });
  const f = (b) => async (url) => { assert.ok(url.startsWith(t.base)); return { ok: true, status: 200, json: async () => b }; };
  assert.equal((await T.loadTown(t, f(body()))).PKG.variant, 'district-5805-8582');
  await assert.rejects(T.loadTown(t, f(body({ variant: 'full' }))), /not the variant/);
  await assert.rejects(T.loadTown(t, f(body({ lock: { ...LOCK3, formatVersion: 9 } }))), /does not read/);
});

test('townLockMismatch: v3 against v3 matches; v2 still matches v2; a v2 pin on a v3 town is a mismatch', () => {
  assert.equal(T.townLockMismatch(PIN3, LOCK3), '');
  assert.equal(T.townLockMismatch({ ...PIN3, formatVersion: 2 }, LOCK3), 'formatVersion');
  assert.equal(T.townLockMismatch({ ...PIN3, formatVersion: 2 }, { ...LOCK3, formatVersion: 2 }), '');
  const { formatVersion, ...noVersion } = PIN3; // (a pin that does not say: the fields decide)
  assert.equal(T.townLockMismatch(noVersion, LOCK3), '');
  assert.equal(T.townLockMismatch(PIN3, { ...LOCK3, yOffset: 245 }), 'yOffset');
});

const PKG = { window: { full: false, box: { x0: -1000, z0: -1000, x1: 1500, z1: 1500 } } };
test('the window: only a district bundle has one; clip rectangle; inside / outside', () => {
  assert.equal(G.windowBox({}), null);
  assert.equal(G.windowBox({ window: { full: true, box: PKG.window.box } }), null);
  const b = G.windowBox(PKG);
  assert.deepEqual(G.clipRect(b), { minX: -850, maxX: 1350, minZ: -850, maxZ: 1350 });
  assert.ok(G.inWindow(b, 0, 0, G.CLIP) && !G.inWindow(b, 1400, 0, G.CLIP) && G.inWindow(null, 1e9, 1e9));
  assert.deepEqual(G.edgeOf(b, 1490, 0), { inside: 10, nx: 1, nz: 0 });
  assert.deepEqual(G.edgeOf(b, 0, -1100), { inside: -100, nx: 0, nz: -1 });
});

test('the soft boundary: outside the band nothing; heading out in the band, slower and turned back in; past the edge, back on it', () => {
  const b = G.windowBox(PKG);
  const car = (x, z, heading, speed) => ({ position: { x, z, y: 0 }, heading, speed, vx: Math.sin(heading) * speed, vz: Math.cos(heading) * speed });
  const a = car(0, 0, Math.PI / 2, 20);
  assert.equal(G.softBoundary(b, a, 'car', 1 / 60), 0);
  assert.equal(a.speed, 20);
  // (east edge at x 1500; heading +x (pi/2) at 1480: 20 m into the 40 m band)
  const c = car(1480, 0, Math.PI / 2, 20), out0 = Math.sin(c.heading);
  let t = 0;
  for (let i = 0; i < 60; i++) t = G.softBoundary(b, c, 'car', 1 / 60);
  assert.ok(t > 0.4, 'deep in the band');
  assert.ok(c.speed < 20, 'slowed');
  assert.ok(Math.sin(c.heading) < out0, 'turned back in');
  // (heading in: not slowed)
  const d = car(1480, 0, -Math.PI / 2, 20);
  G.softBoundary(b, d, 'car', 1 / 60);
  assert.equal(d.speed, 20);
  // (past the edge: back on it)
  const e = car(1600, 1700, 0, 10);
  G.softBoundary(b, e, 'car', 1 / 60);
  assert.deepEqual([e.position.x, e.position.z], [1500, 1500]);
  const p = { position: { x: -1200, z: 0 }, heading: 0, speed: 1 };
  G.softBoundary(b, p, 'person', 1 / 60);
  assert.equal(p.position.x, -1000);
});

test('the whole town: the status answer and the swap address; the words', () => {
  assert.ok(G.fullReady({ state: 'full' }) && G.fullReady({ full: true }) && G.fullReady({ variants: { full: {} } }));
  assert.ok(!G.fullReady({ state: 'district' }) && !G.fullReady(null) && !G.fullReady({ state: 'growing' }));
  const u = new URL(G.fullHref(`http://localhost:4840/${SEARCH}&tv=district-5805-8582&pack=x`));
  assert.equal(u.searchParams.get('tv'), 'full');
  assert.deepEqual([...u.searchParams.keys()], ['city', 'town', 'tc', 'ts', 'host', 'tv', 'pack']);
  assert.equal(u.searchParams.get('host'), 'http://localhost:4841');
  assert.equal(G.poseKey({ place: 'us-4054200', tiles: TS }), `mc.town.pose.us-4054200.${TS}`);
  for (const w of Object.values(G.WORDS)) assert.doesNotMatch(w, /claude|anthropic|\bai\b|gta|gen z quant|model|compiler|overture|usgs/i);
});

test('the upgrade: the world the page plays, the answer\'s upgrade checked, the newer whole town\'s address with the re-pinned world', () => {
  const H = 'http://localhost:4841', W = 'a'.repeat(64), W2 = 'b'.repeat(64), TS2 = 'c'.repeat(64), TC2 = 'htc-0.10.0-hg1-b2b48fbe8';
  const href = `http://localhost:4840/${SEARCH}&tv=district-5805-8582&pack=${encodeURIComponent(`${H}/storykit/f/${W}.json`)}&game=g1`;
  assert.equal(G.worldOf(href, H), W);
  assert.equal(G.worldOf(href, 'https://gamemog.com'), null, 'a world on another host is not named');
  assert.equal(G.worldOf(`http://localhost:4840/${SEARCH}`, H), null);
  const up = { build: TC2, tilesId: TS2, variant: 'full', url: 'x', pack: `/storykit/f/${W2}.json` };
  assert.deepEqual(G.upgradeOf({ state: 'district', full: false, upgrade: up }), { build: TC2, tilesId: TS2, pack: `/storykit/f/${W2}.json` });
  for (const bad of [{ ...up, variant: 'district-1-2' }, { ...up, build: '../x' }, { ...up, tilesId: 'nope' }, { ...up, pack: 'https://elsewhere/storykit/f/x.json' }, { ...up, pack: `/storykit/f/${W2}.glb` }, null, 'full'])
    assert.equal(G.upgradeOf({ state: 'district', upgrade: bad }), null, JSON.stringify(bad));
  assert.equal(G.upgradeOf({ state: 'full', full: true }), null, 'a plain whole town is fullReady, not an upgrade');
  const u = new URL(G.upgradeHref(href, G.upgradeOf({ upgrade: up }), H));
  assert.equal(u.searchParams.get('tc'), TC2);
  assert.equal(u.searchParams.get('ts'), TS2);
  assert.equal(u.searchParams.get('tv'), 'full');
  assert.equal(u.searchParams.get('pack'), `${H}/storykit/f/${W2}.json`);
  assert.equal(u.searchParams.get('town'), 'us-4054200');
  assert.equal(u.searchParams.get('game'), 'g1');
  // (the new address is one town-src.js reads: the newer build's whole town on the same host)
  const t = T.townFromQuery(u.searchParams, { hostname: 'localhost' });
  assert.equal(t.base, `${H}/towns/us-4054200/${TC2}/${TS2}/full/`);
});

test('the poll names the world and swaps to the upgrade', async () => {
  const H = 'http://localhost:4841', W = 'a'.repeat(64), W2 = 'b'.repeat(64), TS2 = 'c'.repeat(64), TC2 = 'htc-0.10.0-hg1-b2b48fbe8';
  const seen = [];
  const store = new Map();
  const listeners = {};
  const saved = { location: globalThis.location, document: globalThis.document, sessionStorage: globalThis.sessionStorage, raf: globalThis.requestAnimationFrame, add: globalThis.addEventListener };
  let replaced = null;
  globalThis.location = { replace: (x) => { replaced = x; } };
  globalThis.sessionStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
  globalThis.document = { body: { appendChild() {} }, createElement: () => ({ style: {} }), getElementById: () => null };
  globalThis.requestAnimationFrame = () => 0;
  globalThis.addEventListener = (n, f) => { listeners[n] = f; };
  globalThis.__NYC_APP = { controllerManager: { activeMode: 'car', getActiveEntity: () => ({ position: { x: 1, z: 2 }, heading: 0, speed: 3 }) } };
  try {
    const href = `http://localhost:4840/${SEARCH}&tv=district-5805-8582&pack=${encodeURIComponent(`${H}/storykit/f/${W}.json`)}`;
    const town = T.townFromQuery(new URL(href).searchParams, { hostname: 'localhost' });
    const fetchFn = async (url) => { seen.push(url); return { ok: true, json: async () => ({ state: 'district', full: false, upgrade: { build: TC2, tilesId: TS2, variant: 'full', url: 'x', pack: `/storykit/f/${W2}.json` } }) }; };
    const st = G.startGrowing({ town, PKG: { ...PKG, variant: 'district-5805-8582' }, fetchFn, href });
    await new Promise((r) => setTimeout(r, 1700));
    assert.equal(seen.length, 1);
    assert.ok(seen[0].endsWith(`/api/towns/us-4054200?build=${TC}&world=${W}`), seen[0]);
    assert.ok(st.armed && st.upgrade && st.upgrade.build === TC2);
    listeners['mc:checkpoint']();
    await new Promise((r) => setTimeout(r, G.FADE_MS + 100));
    const u = new URL(replaced);
    assert.deepEqual([u.searchParams.get('tc'), u.searchParams.get('ts'), u.searchParams.get('tv'), u.searchParams.get('pack')], [TC2, TS2, 'full', `${H}/storykit/f/${W2}.json`]);
    assert.ok(store.has(G.poseKey({ place: 'us-4054200', tiles: TS2 })), 'the pose is kept for the newer town');
  } finally {
    Object.assign(globalThis, { location: saved.location, document: saved.document, sessionStorage: saved.sessionStorage, requestAnimationFrame: saved.raf, addEventListener: saved.add });
    delete globalThis.__NYC_APP;
  }
});
