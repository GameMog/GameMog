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
  assert.ok(STEP_KINDS.has('scene') && STEP_KINDS.has('tow') && STEP_KINDS.size === 38);
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

test("a world's opening: checked, played once before Mission 1 on a first start, in Mog City's own lettering", () => {
  const native = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/storyrun/test-packs/native.json'), 'utf8'));
  const w = structuredClone(native);
  w.opening = { place: '@murrayhill', stage: [{ who: 'Jane', at: '@bowery' }], shots: [
    { cam: { rel: 'player', right: -30, up: 40, fwd: -60 }, look: 'player', dur: 7, where: { name: 'Murray Hill', sub: 'E 37th St · 5:45 PM' } },
    { cam: { rel: 'player', fwd: 2.2, right: 0.6 }, look: { rel: 'player' }, dur: 6, card: { who: 'Dan', role: 'the fall guy', is: 'hero' }, sub: ['Dan', 'One more day.'] },
    { cam: { rel: 'player', right: -8, up: 9, fwd: -16 }, look: 'player', dur: 5, title: true }] };
  assert.deepEqual(check(w), []);
  const bad = (f) => { const x = structuredClone(w); f(x.opening); return check(x); };
  assert.ok(bad((o) => { o.shots = []; }).some((e) => /opening\.shots/.test(e)));
  assert.ok(bad((o) => { o.shots[1].card = 'Dan'; }).some((e) => /opening\.shots\[1\]\.card/.test(e)));
  assert.ok(bad((o) => { o.shots[0].where = { sub: 'x' }; }).some((e) => /\.where/.test(e)));
  assert.ok(bad((o) => { o.shots[0].dur = 90; }).some((e) => /\.dur/.test(e)));
  assert.ok(bad((o) => { o.stage = [{ at: '@bowery' }]; }).some((e) => /opening\.stage/.test(e)));
  // (index.js: the opening only when the world has one, on a first start or ?opening=1, never with ?opening=0)
  const idx = fs.readFileSync(path.join(ROOT, 'wagmi/storyrun/index.js'), 'utf8');
  assert.match(idx, /if \(def\.opening && Array\.isArray\(def\.opening\.shots\) && def\.opening\.shots\.length && Q\.get\('opening'\) !== '0'/);
  assert.match(idx, /Q\.get\('opening'\) === '1' \|\| \(k === 0 && !Q\.get\('mission'\) && !Object\.keys\(save\.done\)\.length\)/);
  // (runner.js: Mog City's own place card, name card (caption) and title lockup, on the cutscene director)
  const run = fs.readFileSync(path.join(ROOT, 'wagmi/storyrun/runner.js'), 'utf8');
  for (const k of ['ui.place(tokens(s.where.name)', 'ui.caption(who, ', 'ui.gameTitle(true)', "shotList(o.shots || [], t, { opening: true })", 'fig.hold = true']) assert.ok(run.includes(k), k);
});

test("a side step waits only on a number of seconds: a roadblock's or a car's `at` is its place", () => {
  // (a roadblock kept beside the steps after it, { type: 'roadblock', at: '@toll' }, is started as a side step: its place
  // must never be read as the side step's seconds-in delay, or it waits for ever and never stands up)
  const src = fs.readFileSync(path.join(ROOT, 'wagmi/storyrun/runner.js'), 'utf8');
  const fn = src.slice(src.indexOf('function side(d, hostTok'), src.indexOf('/* --------------------------------------------------------- a mission --'));
  assert.match(fn, /typeof d\.at === 'number'/);
  assert.doesNotMatch(fn, /if \(d\.at\) await delay/);
});

test("an act's end card shows its stats and its quote: the big card, headed with the act's title", () => {
  const idx = fs.readFileSync(path.join(ROOT, 'wagmi/storyrun/index.js'), 'utf8');
  const fn = idx.slice(idx.indexOf('async function actEnd(e'), idx.indexOf('const fmt = '));
  assert.match(fn, /e\.stats/);
  assert.match(fn, /hud\.passed\(\{ head: e\.title/);
  const hud = fs.readFileSync(path.join(ROOT, 'wagmi/storyrun/hud.js'), 'utf8');
  assert.match(hud, /c\.head \|\| 'MISSION PASSED'/);
});

test("a story's night is lit (nightlit.js) and its end is unmistakable (STORY COMPLETE)", () => {
  const nl = fs.readFileSync(path.join(ROOT, 'wagmi/storyrun/nightlit.js'), 'utf8');
  assert.match(nl, /if \(dressing && dressing\.blackout\) return null/); // (a blackout world keeps its own dressing's lift)
  assert.match(nl, /if \(!\(n > 0\)\) return;/); // (day and dusk untouched)
  const idx = fs.readFileSync(path.join(ROOT, 'wagmi/storyrun/index.js'), 'utf8');
  assert.match(idx, /createNightLit\(W, def\.dressing/);
  assert.match(idx, /head: 'STORY COMPLETE'/);
});

test("a van or a truck is not a sports car: its own engine, no boost (owner: \"the truck shouldn't make the same noise as the porsche or have the booster\")", () => {
  const ride = fs.readFileSync(path.join(ROOT, 'wagmi/storyrun/ride.js'), 'utf8');
  // (the class table: only sports, supercar, coupe and muscle boost; the van and minivan are vans, the pickup and wrecker trucks)
  for (const k of ["van: 'van'", "minivan: 'van'", "pickup: 'truck'", "wrecker: 'truck'", "sports: 'sports'", "supercar: 'sports'"]) assert.ok(ride.includes(k), k);
  assert.match(ride, /car\.noBoost = vclass !== 'sports'/);
  assert.match(ride, /boostSpeed: car\.topSpeed, boostAccel: car\.accel/); // (Shift does nothing to its pace)
  assert.match(ride, /'vclass', 'noBoost'\]/); // (the hero car's own class back after the ride)
  const game = fs.readFileSync(path.join(ROOT, 'wagmi/game.js'), 'utf8');
  assert.match(game, /const boost = !!keys\.boost && throttle > 0 && !car\.noBoost;/); // (no flame)
  const audio = fs.readFileSync(path.join(ROOT, 'wagmi/audio/index.js'), 'utf8');
  assert.match(audio, /boost: !!k\.boost && !c\.noBoost, voice: c\.noBoost \? c\.vclass/);
  const pc = fs.readFileSync(path.join(ROOT, 'wagmi/audio/playercar.js'), 'utf8');
  assert.match(pc, /utilityKinds\.includes\(voice\) \? createUtility\(M, bus, voice\) : createSupercar/);
  const ut = fs.readFileSync(path.join(ROOT, 'wagmi/audio/utility.js'), 'utf8');
  assert.match(ut, /van: \{ motor: 'bus'/); assert.match(ut, /truck: \{ motor: 'bus'/);
  assert.doesNotMatch(ut, /fetch\(|\.m4a|\.ogg/); // (synthesized: no recordings)
  // (the HUD: no BOOST button, no Boost hint, the meter not yellow)
  assert.match(fs.readFileSync(path.join(ROOT, 'wagmi/touch.js'), 'utf8'), /show\('boost', !W\.car\?\.noBoost\)/);
  const main = fs.readFileSync(path.join(ROOT, 'js/main.js'), 'utf8');
  assert.match(main, /!\(hintNoBoost && action === 'Boost'\)/);
  assert.match(main, /!\(mode === 'car' && activeEnt\.noBoost\)/);
});

test('a ride-along call finishes what it is saying when its step ends; a call step takes the last objective down', () => {
  const calls = fs.readFileSync(path.join(ROOT, 'wagmi/mission/calls.js'), 'utf8');
  assert.match(calls, /if \(C\.def\.finish && C\.state === 'talk' && inCar\(\)\) \{ C\.finishing = true;/);
  assert.match(calls, /cur\.carrying \|\| cur\.wrapOnly \|\| cur\.finishing/); // (the next step's call waits for it)
  assert.match(calls, /if \(C\.finishing && C\.yieldNow\) \{ end\(C, true\); return; \}/); // (a story's next call: after the line it is saying)
  const run = fs.readFileSync(path.join(ROOT, 'wagmi/storyrun/runner.js'), 'utf8');
  assert.match(run, /wrapAfterMain: !ride, finish: !!ride \}/);
  assert.match(run, /if \(QUIET_STEPS\.has\(d\.type\) && !d\.ref\) ui\.objective\(d\.objective \? parts\(d\.objective\) : null\)/);
});

test("after STORY COMPLETE free roam is in daylight; a forged man fights in his own body", () => {
  const idx = fs.readFileSync(path.join(ROOT, 'wagmi/storyrun/index.js'), 'utf8');
  const end = idx.slice(idx.indexOf("head: 'STORY COMPLETE'"), idx.indexOf("ui.objective(['Free roam. '"));
  assert.match(end, /W\.app\.selectTime\('midday'\)/);
  const run = fs.readFileSync(path.join(ROOT, 'wagmi/storyrun/runner.js'), 'utf8');
  assert.match(run, /function puppet\(e, who\)/);
  assert.match(run, /thugPunch1: 'jab'/); assert.match(run, /thugKnockdown: 'fall'/);
  assert.match(run, /if \(!c \|\| c\.model \|\| !c\.glb \|\| cast\.isHero\(who\)\) return null;/); // (a Suit stays a Suit)
});

test("a recorded line is heard out: the call waiting waits for the hold line, a step's end or the next call never cuts a clip", () => {
  const run = fs.readFileSync(path.join(ROOT, 'wagmi/storyrun/runner.js'), 'utf8');
  const cw = run.slice(run.indexOf('async function callWaiting('), run.indexOf('async function voicemail('));
  assert.match(cw, /W\.calls\.state\(\)\?\.held && !W\.calls\.talking/); // ('Go, I'll hold.' said before the new caller)
  assert.match(run, /if \(W\.voice\?\.left\?\.\(\) > 0\.08\) \{ const t0 = now\(\); await wait\(\(\) => !\(W\.voice\.left\(\) > 0\.08\)/);
  const calls = fs.readFileSync(path.join(ROOT, 'wagmi/mission/calls.js'), 'utf8');
  const end = calls.slice(calls.indexOf('function end(C, sound = true)'), calls.indexOf('function stepGone('));
  assert.doesNotMatch(end, /W\.voice\?\.stop/);
  assert.match(calls, /if \(subNow\(\) \|\| W\.voice\?\.left\?\.\(\) > 0\.08\)/);
  assert.match(fs.readFileSync(path.join(ROOT, 'wagmi/radio/voices.js'), 'utf8'), /left: \(\) => \(cur && ctx \? Math\.max\(0, cur\.end - ctx\.currentTime\) : 0\)/);
});

test("a failed attempt is over: its token killed, so its timer loop never ticks or pins a later mission's time", () => {
  const run = fs.readFileSync(path.join(ROOT, 'wagmi/storyrun/runner.js'), 'utf8');
  const play = run.slice(run.indexOf('async function play('), run.indexOf("if (pick === 'quit')"));
  // (a step's thrown Fail left the attempt's token alive: after PT-14's retry its timer loop held PT-15's midnight over free roam)
  assert.match(play, /const at = M; kill\(at\.tok, e instanceof Fail \? e : new Stop\(\)\); tidy\(\);/);
});

test("the story's end reads MISSION PASSED, the act's stats, STORY COMPLETE, the title, FREE ROAM; a chase from a standing car starts in a clear street", () => {
  const idx = fs.readFileSync(path.join(ROOT, 'wagmi/storyrun/index.js'), 'utf8');
  assert.match(idx, /await actEnd\(act\.end, \{ holdNext: k === order\.length - 1 \}\)/);
  assert.match(idx, /if \(e\.next && !holdNext\)/);
  const end = idx.slice(idx.indexOf("head: 'STORY COMPLETE'"), idx.indexOf("ui.objective(['Free roam. '"));
  assert.ok(end.indexOf('text: def.title') < end.indexOf('const fin = order[order.length - 1]?.act?.end?.next'));
  assert.match(idx, /stats: \[\['TIME', fmt\(r\.secs\)\], \.\.\.card\.stands\]/);
  const run = fs.readFileSync(path.join(ROOT, 'wagmi/storyrun/runner.js'), 'utf8');
  const pu = run.slice(run.indexOf('STEPS.pursuit = '), run.indexOf('STEPS.tail = '));
  assert.match(pu, /const cr = d\.clear \?\? 32/); assert.match(pu, /gps\.plan\(/);
  assert.match(pu, /Math\.abs\(car\.speed \|\| 0\) < 4/);
  assert.match(pu, /finally \{ if \(clearT\) \{ clearInterval\(clearT\); try \{ app\.trafficSystem\.hold\?\.\(\[\]\); \} catch \{\} \}/);
});

test("the action beats have punch: a chase's alarm, a roadblock rammed in slow motion, a tail's warnings, a hard clock's stakes and red edge; the autopilot keeps moving in a chase beside a call", () => {
  const run = fs.readFileSync(path.join(ROOT, 'wagmi/storyrun/runner.js'), 'utf8');
  const juice = fs.readFileSync(path.join(ROOT, 'wagmi/storyrun/juice.js'), 'utf8');
  assert.match(run, /import \{ createJuice \} from '\.\/juice\.js'/);
  assert.match(juice, /export function createJuice\(W\)/);
  // (nothing in it touches a rule: it draws, sounds, and borrows the crash's slow motion and jolt)
  assert.doesNotMatch(juice, /M\.(timer|state|tok)|throw new/);
  assert.match(juice, /if \(!text \|\| W\.cutscene\) return;/);
  const pu = run.slice(run.indexOf('STEPS.pursuit = '), run.indexOf('STEPS.tail = '));
  assert.match(pu, /juice\.alert\(d\.kind === 'police' \? 'Police' : "Delgado's crew"/);
  assert.match(pu, /juice\.alert\('Lost them'/);
  const rb = run.slice(run.indexOf('STEPS.roadblock = '), run.indexOf('function dropBlock'));
  assert.match(rb, /juice\.slow\(0\.7, 0\.3\)/);
  const tail = run.slice(run.indexOf('STEPS.tail = '), run.indexOf('function cue('));
  assert.ok(tail.indexOf("'Too close'") > 0 && tail.indexOf("'Too close'") < tail.indexOf('spotted you'));
  assert.match(run, /if \(sh\.opts\.fail !== 'soft'\) juice\.pulse\(1 - sh\.left \/ 10\)/);
  assert.match(run, /hud\.clear\(\); M\.timer\.stop\(\); juice\.clear\(\); juice\.live = false;/);
  // (a near miss: only in a mission, at speed, past one of the city's cars untouched)
  assert.match(juice, /if \(!api\.live \|\| W\.cutscene/); assert.match(juice, /lastHit < c\.t - 150/);
  const ap = fs.readFileSync(path.join(ROOT, 'wagmi/storyrun/autopilot.js'), 'utf8');
  assert.ok(ap.indexOf("if (M.chase && ['call'") > 0 && ap.indexOf("if (M.chase && ['call'") < ap.indexOf("if (!['drive', 'stops', 'walk'"));
});

test("pacing 2: a clock or a meter never under a call's card; a sneak's UNSEEN bar; a wait hears out a call ringing beside it; the autopilot sneaks, tails and races at a player's pace", () => {
  const hud = fs.readFileSync(path.join(ROOT, 'wagmi/storyrun/hud.js'), 'utf8');
  const run = fs.readFileSync(path.join(ROOT, 'wagmi/storyrun/runner.js'), 'utf8');
  const ap = fs.readFileSync(path.join(ROOT, 'wagmi/storyrun/autopilot.js'), 'utf8');
  // (the clock first, then the meters, moved clear of the card: up on a desk, down on a phone)
  assert.match(hud, /for \(const e of \[count, timerEl, metersEl\]\)/);
  assert.match(hud, /const down = document\.body\.classList\.contains\('touch-enabled'\)/);
  assert.match(hud, /setInterval\(unstack, 200\)/);
  const st = run.slice(run.indexOf('STEPS.stealth = '), run.indexOf('a parked car --'));
  assert.match(st, /hud\.bar\(d\.label \|\| 'UNSEEN', 1 - k/);
  assert.match(st, /if \(d\.meter !== false && \(dest \|\| secs\)\) hud\.bar\(null\)/);
  assert.match(st, /u\.dir != null/);
  assert.match(st, /if \(d\.detect > 0\) S\.rate = 0\.92 \/ d\.detect;/);
  const m2 = fs.readFileSync(path.join(ROOT, 'wagmi/mission/m2-stealth.js'), 'utf8');
  assert.match(m2, /by: null, rate: 1 \};/); assert.match(m2, /\* S\.rate; if \(d < CLOSE\) L\.sus = 1;/);
  assert.match(st, /if \(M\.auto && !ctx\.flags\.stealthFair\) S\.grace = 5;/);
  assert.match(run, /d\.call && !W\.calls\?\.live && !ringingBeside\(\)/);
  assert.match(ap, /if \(realPace && type === 'stealth' && !inCar\(\)\) \{\n\s+footSp = 1\.7;/);
  assert.match(ap, /L > 60 && !\(realPace && type === 'stealth'\)/);
  assert.match(ap, /vt = clamp\(\(T\.v \|\| 0\) \+ \(dv - ring \* 1\.6\) \* 0\.3, 0, 20\)/);
  assert.match(ap, /if \(raceKey === stepKey \|\| \(L \+ rest\) \/ 20 > sh\.left\)/);
});

test("an act card is a legible title, never a blackout: its words above the fade, a light dim, about 3-4 s, and the dim always comes off", () => {
  const hud = fs.readFileSync(path.join(ROOT, 'wagmi/storyrun/hud.js'), 'utf8');
  const ui = fs.readFileSync(path.join(ROOT, 'wagmi/mission/ui.js'), 'utf8');
  const idx = fs.readFileSync(path.join(ROOT, 'wagmi/storyrun/index.js'), 'utf8');
  const run = fs.readFileSync(path.join(ROOT, 'wagmi/storyrun/runner.js'), 'utf8');
  // (the card is drawn above ui.fade's cover: a fade dims the city under it, never its words; the owner's ACT II card
  // was dark grey words under a 0.9 cover)
  const z = (css, sel) => +css.match(new RegExp(sel.replace(/[.]/g, '\\.') + ' \\{[^}]*z-index: (\\d+)'))[1];
  assert.ok(z(hud, '#wg .sr-card') > z(ui, '.wg-fade'), 'the card above the fade');
  // (the act's dim: at most half, and taken off in a finally whatever happens during the cards)
  // (at module scope: declared inside install() after the story loop, actEnd hit it before it was set, a TDZ error)
  const dim = +idx.match(/^const ACT_DIM = ([\d.]+);/m)[1];
  assert.ok(dim > 0 && dim <= 0.5, `act dim ${dim}`);
  const ae = idx.slice(idx.indexOf('async function actEnd('), idx.indexOf('\n  }\n', idx.indexOf('async function actEnd(')));
  assert.doesNotMatch(ae, /ui\.fade\(0\.[6-9]/);
  assert.match(ae, /try \{[\s\S]*\} finally \{ await ui\.fade\(0, [\d.]+\); \}/);
  // (each act card held about 3-4 s)
  for (const m of ae.matchAll(/hud\.card\([^\n]*?flags\.autoCard \? [\d.]+ : ([^\n]+?)\);/g)) assert.match(m[1], /^Math\.min\(4,/, m[1]);
  // (every other dark cover in the runner comes off in a finally: a set's veil, a transition, the story's end)
  for (const src of [run, idx]) {
    for (const m of src.matchAll(/await ui\.fade\(0\.9\d*, [\d.]+\);/g)) {
      const after = src.slice(m.index, m.index + 1200);
      assert.match(after, /finally \{[^\n]*ui\.fade\(0, /, after.slice(0, 120));
    }
  }
  // (a second card while one is up is not taken down by the first's end)
  assert.match(hud, /const my = \+\+cardN;/); assert.match(hud, /if \(my === cardN\) cardEl\.classList\.remove\('on'\)/);
});
