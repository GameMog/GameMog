// A growing town (wagmi/world/growing.js, the production builder's lock v3 and &tv= variants in wagmi/world/town-src.js):
// the variant address, lock v3 accepted beside v2, the district window, the soft boundary, the status answer and the
// swap address. node --test tests/growing.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

const TC = 'htc-0.7.0-hg1-be9d23a20', TS = '06ad1e104d8b325b2a4e7821585b83e5e9b972ef79e5ef570fed581b86f61a92';
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
