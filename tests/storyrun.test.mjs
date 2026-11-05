// The story runner (wagmi/storyrun): what it reads, what it refuses, and what it never says.
//   node --test tests/storyrun.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
globalThis.location = new URL('http://127.0.0.1:4981/?pack=x');
const { packUrl, assetUrl, packHash } = await import('../wagmi/storyrun/allow.js');
const { check, STEP_KINDS, PART_REFS } = await import('../wagmi/storyrun/pack.js');
const { test: cond, value } = await import('../wagmi/storyrun/cond.js');

const files = (dir) => fs.readdirSync(path.join(ROOT, dir), { recursive: true }).filter((f) => /\.(m?js|mts|json|md)$/.test(f)).map((f) => path.join(dir, f));

test('no forbidden name anywhere in the runner, its tools or its test worlds', () => {
  // (the names are held as hashes, never written out: a word, or two words together, lower-cased, sha256's first 16 hex)
  const BAD = new Set(['6c3b9eb90037aebb', '7327d4d86dcf6bd5', '33ce206b561db612', '74f4465e33524366', 'a50128d59f482a86', '3be0e6fa29e179d8', 'e0f815fb33ac48cf', '21a301158facee68']);
  const h = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);
  const bad = (l) => { const w = l.toLowerCase().match(/\$?[a-z0-9]+/g) || []; return w.some((x, i) => BAD.has(h(x)) || (i && BAD.has(h(w[i - 1] + ' ' + x)))); };
  const hits = [];
  for (const f of [...files('wagmi/storyrun'), ...files('tools/storyrun')]) {
    const lines = fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n');
    lines.forEach((l, i) => { if (bad(l)) hits.push(`${f}:${i + 1}`); });
  }
  assert.deepEqual(hits, []);
});

test('?pack= is read only from sealed GameMog worlds, and on a local server its dev host and test worlds', () => {
  const H = 'a'.repeat(64);
  const here = new URL('https://mc.gamemog.com/');
  assert.equal(packUrl(`https://gamemog.com/storykit/f/${H}.json`, here), `https://gamemog.com/storykit/f/${H}.json`);
  assert.equal(packHash(`https://gamemog.com/storykit/f/${H}.json`), H);
  for (const bad of [`https://evil.com/storykit/f/${H}.json`, `https://gamemog.com/storykit/f/${H}.json?x=1`, `https://gamemog.com/storykit/f/abc.json`, `http://gamemog.com/storykit/f/${H}.json`,
    '/tools/storyrun/test-packs/native.json', `https://gamemog.com/api/storykit/drafts/0e1f0e1f-0e1f-0e1f-0e1f-0e1f0e1f0e1f/pack`, 'javascript:alert(1)'])
    assert.equal(packUrl(bad, here), null, bad);
  const local = new URL('http://127.0.0.1:4981/');
  assert.ok(packUrl('/tools/storyrun/test-packs/native.json', local));
  assert.ok(packUrl('/tools/storyrun/test-packs/night-shift/world.json', local));
  assert.equal(packUrl('/tools/storyrun/test-packs/../../index.json', local), null);
  assert.ok(packUrl('http://localhost:3939/api/storykit/drafts/0e1f0e1f-0e1f-0e1f-0e1f-0e1f0e1f0e1f/pack', local, 'http://localhost:3939'));
  assert.equal(packUrl('http://localhost:3939/api/storykit/drafts/0e1f0e1f-0e1f-0e1f-0e1f-0e1f0e1f0e1f/pack', local, null), null);
});

test("a world's files: content-addressed on its own origin, a local test world's own folder", () => {
  const H = 'b'.repeat(64), at = `https://gamemog.com/storykit/f/${'a'.repeat(64)}.json`;
  assert.equal(assetUrl(`/storykit/f/${H}.glb`, at), `https://gamemog.com/storykit/f/${H}.glb`);
  for (const bad of [`https://evil.com/storykit/f/${H}.glb`, `/storykit/f/${H}.exe`, '/assets/characters/dan.glb', `/storykit/f/${H}.glb#x`]) assert.equal(assetUrl(bad, at), null, bad);
  const t = 'http://127.0.0.1:4981/tools/storyrun/test-packs/night-shift/world.json';
  assert.ok(assetUrl('dez.glb', t, new URL('http://127.0.0.1:4981/')));
  assert.ok(assetUrl('voice/12c6d205-b23faf81.ogg', t, new URL('http://127.0.0.1:4981/')));
  assert.equal(assetUrl('../native.json', t, new URL('http://127.0.0.1:4981/')), null);
  assert.equal(assetUrl('dez.glb', t, new URL('https://mc.gamemog.com/')), null);
});

test('the test worlds pass the checks; bad worlds are refused', () => {
  const native = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/storyrun/test-packs/native.json'), 'utf8'));
  assert.deepEqual(check(native), []);
  const ns = path.join(ROOT, 'tools/storyrun/test-packs/night-shift/world.json');
  if (fs.existsSync(ns)) assert.deepEqual(check(JSON.parse(fs.readFileSync(ns, 'utf8'))), []);
  const bad = (f) => { const w = structuredClone(native); f(w); return check(w); };
  assert.ok(bad((w) => { w.missions[0].steps[0].type = 'eval'; }).some((e) => /kind eval/.test(e)));
  assert.ok(bad((w) => { w.cast.Dan.color = 'red;background:url(x)'; }).some((e) => /colour/.test(e)));
  assert.ok(bad((w) => { w.cast.Dan.model = '../../x'; }).some((e) => /model/.test(e)));
  assert.ok(bad((w) => { w.title = 'x'.repeat(700); }).some((e) => /too long/.test(e)));
  assert.ok(bad((w) => { w.city = 'sf'; }).some((e) => /city sf/.test(e)));
  assert.ok(bad((w) => { w.storykit = 2; }).length);
  assert.ok(bad((w) => { w.car = 'tank'; }).some((e) => /car/.test(e)));
  assert.ok(STEP_KINDS.has('scene') && STEP_KINDS.has('tow') && STEP_KINDS.size === 36);
  // (the tow world: a wrecker sheet as the car, a ride of the world's on the hook)
  assert.deepEqual(check(JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/storyrun/test-packs/tow.json'), 'utf8'))), []);
});

test('conditions and values (the Story Kit semantics)', () => {
  const s = { meters: { cash: 50 }, flags: { took_job: true, role: 'bigger' } };
  assert.equal(cond('cash >= 40', s), true);
  assert.equal(cond('Took job', s), true);
  assert.equal(cond('!took_job', s), false);
  assert.equal(cond({ all: ['took_job', 'role == bigger'] }, s), true);
  assert.equal(cond('done:M2', s, { M2: { result: 'pass' } }), true);
  assert.equal(value({ base: 3, add: [{ if: 'role == bigger', n: 1 }], max: 3 }, s), 3);
});

test("the place library is the Story Kit's New York list (no drift)", () => {
  const src = fs.readFileSync(path.join(ROOT, 'wagmi/storyrun/places.js'), 'utf8');
  const corners = [...src.matchAll(/^\s*\['([a-z0-9-]+)', '[^']+', '/gm)].map((m) => m[1]);
  const mine = new Set([...corners, 'empire', 'timessq', 'chrysler', 'grandcentral', 'bryant', 'flatiron', 'centralpark', 'owtc', 'timessquare', 'fdr', 'fdr-un']);
  // (GameMog's Story Kit checkout: GAMEMOG_DIR, else the GameMog checkout this one sits in; skipped when it has no Story Kit)
  const ts = path.join(process.env.GAMEMOG_DIR || path.join(ROOT, '..'), 'storykit/pack/cities.ts');
  if (!fs.existsSync(ts)) return;
  const body = fs.readFileSync(ts, 'utf8'), ny = body.slice(body.indexOf('ny: {'), body.indexOf('sf: {'));
  const theirs = new Set([...ny.matchAll(/^\s*'?([a-z0-9-]+)'?: \{ name:/gm)].map((m) => m[1]));
  assert.deepEqual([...theirs].filter((k) => !mine.has(k)), []);
});

test("Mog City's own story as a world (packs/mog-city.json): read from the game's own origin, passes the checks, names only real scenes", async () => {
  for (const here of [new URL('https://mc.gamemog.com/'), new URL('http://127.0.0.1:4981/')]) assert.equal(packUrl('/packs/mog-city.json', here), new URL('/packs/mog-city.json', here).href);
  assert.equal(packUrl('https://evil.com/packs/mog-city.json', new URL('https://mc.gamemog.com/')), null);
  assert.equal(packUrl('/packs/../index.json', new URL('https://mc.gamemog.com/')), null);
  const w = JSON.parse(fs.readFileSync(path.join(ROOT, 'packs/mog-city.json'), 'utf8'));
  assert.deepEqual(check(w), []);
  const src = fs.readFileSync(path.join(ROOT, 'wagmi/storyrun/runner.js'), 'utf8');
  const block = src.slice(src.indexOf('export const SCENES'), src.indexOf('\n};', src.indexOf('export const SCENES')));
  const scenes = new Set([...block.matchAll(/^\s*'?([a-z0-9.]+)'?: \(W\)/gm)].map((m) => m[1]));
  // (Missions 2 and 3's scenes: their phases of the same name, listed in the block)
  for (const m of block.matchAll(/'(m[23]\.[a-z]+)'/g)) scenes.add(m[1]);
  const named = w.missions.flatMap((m) => m.steps.flatMap((s) => [s.type === 'scene' ? s.name : null, s.dress || null, s.dressNear?.dress || null])).filter(Boolean);
  assert.ok(named.length >= 10);
  assert.deepEqual(named.filter((n) => !scenes.has(n)), []);
  // (its parts are Mog City's own mission phases: the runner's list is the checks' list, and each is a phase of m2.js / m3.js)
  const ids = JSON.parse(src.match(/const PART_IDS = (\{[^\n]+\});/)[1].replace(/'/g, '"').replace(/(\w+):/g, '"$1":'));
  assert.deepEqual(Object.entries(ids).flatMap(([m, l]) => l.map((n) => `${m}.${n}`)).sort(), [...PART_REFS].sort());
  for (const [m, l] of Object.entries(ids)) { const ms = fs.readFileSync(path.join(ROOT, `wagmi/mission/${m}.js`), 'utf8'); for (const n of l) if (n !== 'chat') assert.ok(new RegExp(`\\n    async ${n}\\(`).test(ms), `${m}.${n}`); }
  const refs = w.missions.flatMap((m) => m.steps.filter((s) => s.ref).map((s) => s.ref));
  assert.ok(refs.length >= 10);
  // (the missions chain the Mog City way: Jane's J and Gears' G, their free-roam calls)
  assert.deepEqual(w.missions.map((m) => m.between?.step || null), [null, 'free:J', 'free:G']);
  // (its calls are Mog City's own, by id: calls.js CALLS)
  const calls = fs.readFileSync(path.join(ROOT, 'wagmi/mission/calls.js'), 'utf8');
  for (const m of w.missions) for (const s of m.steps) for (const x of s.during || []) if (x.ref) assert.ok(calls.includes(`'${x.ref}': {`), x.ref);
});

test("a world's title is its own: no MOG CITY lockup under ?pack= (Mog City's own story keeps it)", async () => {
  const { ownTitle, isOwn } = await import('../wagmi/storyrun/title.js');
  assert.equal(ownTitle('Night Shift'), 'Night Shift');
  assert.equal(ownTitle('Mog City: Night Shift'), 'Night Shift');
  assert.equal(ownTitle('MOGCITY - Night Shift'), 'Night Shift');
  assert.equal(isOwn({ def: { id: 'mog-city' }, url: 'http://127.0.0.1:4981/packs/mog-city.json' }), true);
  assert.equal(isOwn({ def: { id: 'mog-city' }, url: `https://gamemog.com/storykit/f/${'a'.repeat(64)}.json` }), false);
  // (index.html hides its lockup only under ?pack=, until the world's title is in)
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.match(html, /if \(Q\.has\('pack'\)\) H\.classList\.add\('wg-pk'\);/);
  assert.match(html, /html\.wg-pk:not\(\.wg-pk-t\) #wg-boot \.wg-boot-title \{ visibility: hidden; \}/);
});

test('the host hears page errors, rejections, load failures and the page going behind', async () => {
  const src = fs.readFileSync(path.join(ROOT, 'wagmi/storyrun/host.js'), 'utf8');
  for (const k of ["error('page'", "error('rejection'", "error('load'", "tell('hidden'"]) assert.ok(src.includes(k), k);
  assert.match(fs.readFileSync(path.join(ROOT, 'wagmi/storyrun/pack.js'), 'utf8'), /export async function load\(\) \{\n  watch\(\);/);
});
