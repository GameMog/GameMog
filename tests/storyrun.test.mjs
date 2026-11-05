// The story runner (wagmi/storyrun): what it reads, what it refuses, and what it never says.
//   node --test tests/storyrun.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
globalThis.location = new URL('http://127.0.0.1:4981/?pack=x');
const { packUrl, assetUrl, packHash } = await import('../wagmi/storyrun/allow.js');
const { check, STEP_KINDS } = await import('../wagmi/storyrun/pack.js');
const { test: cond, value } = await import('../wagmi/storyrun/cond.js');

const files = (dir) => fs.readdirSync(path.join(ROOT, dir), { recursive: true }).filter((f) => /\.(m?js|mts|json|md)$/.test(f)).map((f) => path.join(dir, f));

test('no forbidden name anywhere in the runner, its tools or its test worlds', () => {
  const BAD = /GEN Z|\bQuant\b|\$QUANT|ceogenz|\bJuno\b|\bDegens\b|\bZK\b|WAGMI City/i;
  const hits = [];
  for (const f of [...files('wagmi/storyrun'), ...files('tools/storyrun')]) {
    const lines = fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n');
    lines.forEach((l, i) => { if (BAD.test(l)) hits.push(`${f}:${i + 1}`); });
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
  assert.ok(STEP_KINDS.has('scene') && STEP_KINDS.size === 35);
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
  const ts = '/Users/sheed/Desktop/GameMog-storykit/storykit/pack/cities.ts';
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
  const scenes = new Set([...src.slice(src.indexOf('export const SCENES'), src.indexOf('};', src.indexOf('export const SCENES'))).matchAll(/^\s*'?([a-z0-9.]+)'?: \(W\)/gm)].map((m) => m[1]));
  const named = w.missions.flatMap((m) => m.steps.flatMap((s) => [s.type === 'scene' ? s.name : null, s.dress || null])).filter(Boolean);
  assert.ok(named.length >= 4);
  assert.deepEqual(named.filter((n) => !scenes.has(n)), []);
  // (its calls are Mog City's own, by id: calls.js CALLS)
  const calls = fs.readFileSync(path.join(ROOT, 'wagmi/mission/calls.js'), 'utf8');
  for (const m of w.missions) for (const s of m.steps) for (const x of s.during || []) if (x.ref) assert.ok(calls.includes(`'${x.ref}': {`), x.ref);
});
