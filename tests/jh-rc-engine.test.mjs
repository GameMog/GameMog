// The engine's side of the Jensen Heist release candidate's playtest (its fix list, 20 Nov): what every story
// world gets. One test per item, its pure part run and its wiring read from the source.
//   node --test tests/jh-rc-engine.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname;
const src = (f) => fs.readFileSync(ROOT + f, 'utf8');
// (pack.js reads the page's address as it loads, as the storyrun tests do)
globalThis.location ??= new URL('http://127.0.0.1:4981/?pack=x');

test('B1: a transition card waits for the mission title to go (never two titles drawn over each other)', async () => {
  const { titleClear, TITLE_UP } = await import('../wagmi/storyrun/hud.js');
  // (busy for 3 polls, then clear: it waits those out and no more)
  let n = 0; const waits = [];
  const t = await titleClear(() => n++ < 3, async (ms) => { waits.push(ms); }, 4000, 50);
  assert.equal(t, 150); assert.deepEqual(waits, [50, 50, 50]);
  // (a title that never goes: given up on at maxMs)
  assert.equal(await titleClear(() => true, async () => {}, 400, 50), 400);
  assert.equal(await titleClear(() => false, async () => { throw new Error('no wait'); }), 0);
  // (the slam and Mog City's own title are what it waits on)
  assert.match(TITLE_UP, /#sr-slam\.on/); assert.match(TITLE_UP, /\.wg-title\.on/);
  // (the card's words are put in only after the wait: they never replace a title still on screen)
  const hud = src('wagmi/storyrun/hud.js'), card = hud.slice(hud.indexOf('async card('), hud.indexOf('clear() {'));
  assert.ok(card.indexOf('await titleClear(') > 0 && card.indexOf('await titleClear(') < card.indexOf(".textContent = kicker"), 'the wait comes before the words');
  assert.match(card, /if \(my !== cardN\) return;/);
  // (after a title it waited on, up for less: half the wait off, never under 1.8 s)
  const { cardSecs } = await import('../wagmi/storyrun/hud.js');
  assert.equal(cardSecs(2.6, 0), 2.6); assert.equal(cardSecs(2.6, 1000), 2.1); assert.equal(cardSecs(2.6, 2400), 1.8);
  assert.equal(cardSecs(1.2, 3000), 1.2); assert.equal(cardSecs(5, 2000), 4);
  assert.match(card, /const waited = await titleClear\(/); assert.match(card, /secs = cardSecs\(secs, waited\);/);
});

test('B2: one conversion: the speedo reads real mph in a story world, as the limit meter does', async () => {
  const { MPH, mphOf, dialFor } = await import('../wagmi/speedo.js');
  const rules = await import('../wagmi/storyrun/rules.js');
  assert.equal(MPH, 2.23694); assert.equal(rules.MPH, MPH);
  assert.equal(Math.round(mphOf(22)), 49);
  // (Dan's roadster keeps its dial only in Mog City's own game; the Tensore, a model car, any car under ?pack= reads real mph)
  assert.equal(dialFor({ stock: true, pack: false }), 'dan');
  assert.equal(dialFor({ stock: true, pack: true, own: true }), 'dan');
  assert.equal(dialFor({ stock: true, pack: true, own: false }), null);
  assert.equal(dialFor({ stock: false, pack: false }), null);
  const game = src('wagmi/game.js');
  assert.match(game, /dial: dialFor\(\{ stock: !\(rs === horseRs \|\| rs === sheetRs \|\| rs === modelRs\), pack: !!PACK\?\.ok, own: !!PACK\?\.ok && isOwn\(PACK\) \}\)/);
  // (js/main.js shows Math.round(speed * MPH) for every car without the dial, with the same constant)
  const main = src('js/main.js');
  assert.match(main, /const MPH = 2\.23694;/);
  assert.match(main, /: Math\.round\(Math\.abs\(activeEnt\.speed\) \* MPH\);/);
  assert.doesNotMatch(main, /\* 2\.237\b/);
  // (a van's and a sedan's tops read as themselves: 31.3 m/s is 70 mph, 32.2 m/s is 72 mph; a worn sheet has no dial)
  assert.equal(Math.round(mphOf(31.3)), 70); assert.equal(Math.round(mphOf(32.2)), 72);
  assert.match(src('wagmi/storyrun/ride.js'), /car\.dial = null;/);
});

test("B4: a line takes down only its own subtitle (Marge's s5 line no longer clears Mr. Board's st1 line)", async () => {
  const { ownsSub } = await import('../wagmi/storyrun/subs.js');
  const el = (text, hide = false) => ({ classList: { contains: (c) => c === 'hide' && hide }, querySelector: () => ({ textContent: text }) });
  assert.equal(ownsSub(el('Standby, sunrise.'), 'Standby, sunrise.'), true);
  assert.equal(ownsSub(el("Good evening, I'm the Board."), 'Standby, sunrise.'), false);
  assert.equal(ownsSub(el('Standby, sunrise.', true), 'Standby, sunrise.'), false);
  assert.equal(ownsSub(null, 'x'), false);
  const run = src('wagmi/storyrun/runner.js');
  assert.match(run, /setTimeout\(\(\) => \{ if \(g === subGen && !saying && ownsSub\(document\.querySelector\('#wg \.wg-sub'\), text\)\) ui\.sub\(null\); \}, 450\);/);
});

test('B5: MISSION PASSED waits for the last line (8 s at most); a fail still cuts it', async () => {
  const { lineBusy, PASS_HOLD } = await import('../wagmi/storyrun/subs.js');
  assert.equal(PASS_HOLD, 8);
  assert.equal(lineBusy(1, 0), true); assert.equal(lineBusy(0, 2.5), true); assert.equal(lineBusy(0, 0.05), false); assert.equal(lineBusy(0, 0), false);
  const run = src('wagmi/storyrun/runner.js');
  const end = run.slice(run.indexOf('M.ending = true;'), run.indexOf('applySet(def.reward);'));
  assert.match(end, /await wait\(\(\) => !lineBusy\(saying, W\.voice\?\.left\?\.\(\) \|\| 0\) \|\| now\(\) - t0 > PASS_HOLD \* 1000, M\.tok\)/);
  assert.ok(end.indexOf('lineBusy') < end.indexOf('kill(M.tok, new Stop())'), 'held before the attempt is killed');
  // (no clock runs out while the last line is heard out)
  assert.match(run, /if \(!M\.ending\) for \(const x of M\.timer\.tick\(\)\)/);
});

test('B8: the lit option is the default the clock picks; a press picks on pointerdown; the panel sits in the lower third', async () => {
  const { firstSel } = await import('../wagmi/storyrun/hud.js');
  const o = (n, locked = []) => Array.from({ length: n }, (_, i) => ({ text: String(i), locked: locked.includes(i) }));
  assert.equal(firstSel(o(3), 1), 1);
  assert.equal(firstSel(o(3), null), 0);
  assert.equal(firstSel(o(3, [1]), 1), 0);
  assert.equal(firstSel(o(3, [0]), null), 1);
  assert.equal(firstSel(o(3), 7), 0);
  const hud = src('wagmi/storyrun/hud.js');
  assert.match(hud, /let sel = firstSel\(options, dflt\);/);
  assert.match(hud, /b\.addEventListener\('pointerdown', /);
  assert.match(hud, /b\.addEventListener\('click', \(\) => pick\(i\)\);/);
  // (away with the pick: its own panel only)
  assert.match(hud, /if \(choiceEl\.dataset\.n === String\(me\.n0\)\) choiceEl\.classList\.remove\('on'\);/);
  // (in a scene: on the letterbox's edge, its options side by side)
  assert.match(hud, /body\.wg-cine #wg \.sr-choice \{ bottom: calc\(var\(--bar\) \+ 10px\);/);
  assert.match(hud, /body\.wg-cine #wg \.sr-choice \.opts \{ display: flex;/);
  assert.match(src('wagmi/storyrun/runner.js'), /dflt: c\.timeout && c\.default != null \? c\.default : null/);
});

test('P3: a checkpoint step; a fail after it offers RETRY from it and RESTART from the start', async () => {
  const rules = await import('../wagmi/storyrun/rules.js');
  const { check } = await import('../wagmi/storyrun/pack.js');
  assert.deepEqual(rules.retryChoices(null), { retryLabel: 'Retry: from the start', restart: false });
  assert.deepEqual(rules.retryChoices({ i: 0 }), { retryLabel: 'Retry: from the start', restart: false });
  assert.deepEqual(rules.retryChoices({ i: 7 }), { retryLabel: 'Retry: from the checkpoint', restart: true, restartLabel: 'Restart: from the start' });
  const ui = src('wagmi/mission/ui.js');
  assert.match(ui, /const opts = \['retry', \.\.\.\(restart \? \['restart'\] : \[\]\), 'quit', \.\.\.\(skip \? \['skip'\] : \[\]\)\];/);
  const run = src('wagmi/storyrun/runner.js');
  assert.match(run, /if \(pick === 'restart'\) \{ cp = null;/);
  assert.match(run, /if \(d\.checkpoint && \(!M\.cp \|\| M\.cp\.i !== i\)\) \{ M\.cp = snapshot\(i\);/);
  // (the pack field: a boolean on a top-level step)
  const w = JSON.parse(src('tools/storyrun/test-packs/native.json'));
  w.missions[0].steps[0].checkpoint = true; assert.deepEqual(check(w), []);
  w.missions[0].steps[0].checkpoint = 'yes'; assert.ok(check(w).some((e) => /checkpoint/.test(e)));
  assert.ok(fs.existsSync(ROOT + 'docs/CHECKPOINTS.md'));
});

test('P8: no interact prompt over a title, a card, a scene or a call; no jack prompt in a sneak', () => {
  const game = src('wagmi/game.js');
  assert.match(game, /const CARDS_UP = '#sr-slam\.on, #wg \.sr-card\.on, #wg \.sr-pass\.on, #wg \.wg-big\.on, #wg \.wg-title\.on';/);
  assert.match(game, /\(WAGMI\.carF && WAGMI\.carF\(\)\) \|\| carded \? '' :/);
  // (held through the card's fade-out: a tail after its .on goes, and the fight's offers keyed on body.wg-cardup)
  assert.match(game, /const CARD_TAIL = (\d+);/); assert.ok(+game.match(/const CARD_TAIL = (\d+);/)[1] >= 550);
  assert.match(game, /document\.body\.classList\.toggle\('wg-cardup', carded\)/);
  assert.match(src('wagmi/combat/hud.js'), /body\.wg-cardup #wf \.wf-offer\{display:none\}/);
  assert.match(game, /!WAGMI\.noJack && WAGMI\.jackPrompt\?\.\(\)/);
  assert.match(game, /!WAGMI\.noJack && WAGMI\.jack\?\.\(\)/);
  assert.match(src('wagmi/combat/hud.js'), /body:has\(#sr-slam\.on, #wg \.sr-card\.on, #wg \.sr-pass\.on, #wg \.wg-big\.on, #wg \.wg-title\.on\) #wf \.wf-offer\{display:none\}/);
  const run = src('wagmi/storyrun/runner.js'), st = run.slice(run.indexOf('STEPS.stealth = '), run.indexOf('STEPS.stealth = ') + 6000);
  assert.match(st, /W\.noJack = true;/); assert.match(st, /W\.noJack = false;/);
});

test('P10: an edge marker keeps out of the subtitles\' room', async () => {
  const { subZone, clearTop } = await import('../wagmi/storyrun/guide.js');
  // (the line's box at the foot of a 1280 x 720 frame, empty: two lines' room kept over its foot)
  const z = subZone({ left: 330, right: 950, top: 640, bottom: 656, width: 620 });
  assert.ok(z.top <= 656 - 68 - 6 && z.bottom === 662 && z.left === 324 && z.right === 956);
  assert.equal(subZone(null), null); assert.equal(subZone({ width: 0 }), null);
  // (FL-7: the truck behind him, its marker at the bottom edge over Lola's line: moved up clear of it)
  const top = clearTop(560, 160, 662, 53, [z]);
  assert.ok(top + 53 < z.top, `marker ${top}..${top + 53}, zone from ${z.top}`);
  // (clear already: left be)
  assert.equal(clearTop(20, 100, 300, 53, [z]), 300);
  assert.match(src('wagmi/storyrun/guide.js'), /subZone\(ln\.getBoundingClientRect\(\)\)/);
});

test('P12: the next scenes\' people are readied under a transition card', async () => {
  const { warmList } = await import('../wagmi/storyrun/prewarm.js');
  const steps = [
    { type: 'transition', text: 'X' },
    { type: 'vcall', people: [{ who: 'Mr. Board' }, { who: 'player' }, { who: 'Marge Tolliver' }] },
    { type: 'drive', during: [{ type: 'call', who: 'Nico Brancato', video: { office: 'car' } }, { type: 'call', who: 'Lola Hart' }] },
    { type: 'cutscene', set: { people: [{ who: 'Mr. Board' }, { who: 'Wesley Trout' }] } },
    { type: 'transition', text: 'Y' },
    { type: 'vcall', people: [{ who: 'Dex Varga' }] },
  ];
  assert.deepEqual(warmList(steps, 1, { heroName: 'Jensen' }), ['Mr. Board', 'Jensen', 'Marge Tolliver', 'Nico Brancato', 'Wesley Trout']);
  assert.deepEqual(warmList(steps, 1, { heroName: 'Jensen', max: 2 }), ['Mr. Board', 'Jensen']);
  assert.deepEqual(warmList(steps, 5, { heroName: 'Jensen' }), ['Dex Varga']);
  assert.deepEqual(warmList(null, 0), []);
  const run = src('wagmi/storyrun/runner.js'), tr = run.slice(run.indexOf('STEPS.transition = '), run.indexOf('STEPS.actEnd = '));
  assert.match(tr, /const warm = ctx\.flags\.flowFast \? null : prewarm\(M\.i \+ 1\)/);
  // (held past the card a beat at most, never seconds of black: ST-8's opening card stood 8.0 s, the RC review)
  assert.match(tr, /if \(warm\) await Promise\.race\(\[warm, delay\(WARM_HOLD, t\)/);
  const hold = +run.match(/const WARM_HOLD = ([\d.]+);/)[1]; assert.ok(hold > 0 && hold <= 0.6, `WARM_HOLD ${hold}`);
  // (never more than the cast's room: a body standing in the street is never let go for a warm-up)
  assert.match(run, /let room = Math\.max\(0, 8 - \(cast\.live\?\.length \|\| 0\)\)/);
  assert.match(src('wagmi/storyrun/cast.js'), /const MAX = 8;/);
});

test('P12: a set is compiled for the target it is drawn into (the scene pass, a call\'s tile), its hidden people too', () => {
  // (Mog City's frame has warm(): compiled into the scene pass's target with its MRT, or a target given; the loop draws
  // nothing meanwhile. Without it a set compiled for the canvas and built every pipeline again on its first frame)
  const main = src('js/main.js');
  assert.match(main, /async function warm\(objects, \{ scene: where = scene, camera = cameraSystem\.camera, target = null, hold = true \} = \{\}\)/);
  assert.match(main, /renderer\.setRenderTarget\(target \|\| scenePass\.renderTarget\);\s*renderer\.setMRT\(target \? null : sceneMRT\);/);
  assert.match(main, /if \(warming\) return;/);
  assert.match(main, /\n    warm, \/\//);
  const sets = src('wagmi/storyrun/sets.js'), pr = sets.slice(sets.indexOf('async prepare(defs'), sets.indexOf('    async pool(defs'));
  assert.match(pr, /if \(P\.fig && !P\.fig\.root\.visible\) \{ P\.fig\.root\.visible = true; shown\.push\(P\.fig\.root\); \}/);
  assert.match(sets, /async function tileWarm\(S, hold\) \{[\s\S]*?if \(P\.fig && !P\.fig\.root\.visible\) \{ P\.fig\.root\.visible = true; shown\.push\(P\.fig\.root\); \}/);
  assert.match(pr, /finally \{ for \(const r of shown\) r\.visible = false; for \(const o of culled\) o\.frustumCulled = true; \}/);
  // (everything in it, not only what the warm-up's lens sees: its culling off for the compile and the frame)
  assert.match(pr, /S\.scene\.traverseVisible\(\(o\) => \{ if \(o\.frustumCulled\) \{ o\.frustumCulled = false; culled\.push\(o\); \} \}\);/);
  assert.match(pr, /if \(tile && app\.warm && !S\.tileWarmed\) \{ S\.tileWarmed = true; await tileWarm\(S, hold\); \}/);
  assert.match(sets, /for \(const rt of grid\.warmTargets\(\)\) await app\.warm\(S\.scene, \{ scene: S\.scene, camera: S\.cam, target: rt, hold \}\);/);
  // (prime: a set built by this call drawn once through the city's real frame, behind a cutscene's dip only)
  assert.match(pr, /async prepare\(defs, \{ tile = false, prime = false, hold = true \} = \{\}\)/);
  assert.match(pr, /sets\.set\(id, S\); built\.add\(S\);/);
  assert.match(pr, /if \(prime && built\.has\(S\) && !direct\) primeFrame\(S\);/);
  assert.match(sets, /function primeFrame\(S\) \{\s*const a0 = active, f0 = frameCam;\s*active = S; frameCam = \{[^}]*\};\s*try \{ rp\.render\(\); \}[^\n]*finally \{ active = a0; frameCam = f0; \}/);
  assert.match(src('wagmi/storyrun/runner.js'), /await setsOf\(\)\.prepare\(\{ cut: d\.set \}, \{ prime: true \}\)/);
  // (the tile's targets: a tile's picture and its blurred office, the same format and samples as rtOf's)
  const draw = src('wagmi/storyrun/vcall-draw.js');
  assert.match(draw, /const opt = \{ type: THREE\.HalfFloatType, samples: 4 \};/);
  assert.match(draw, /warmRT = \[new THREE\.RenderTarget\(16, 16, \{ type: THREE\.HalfFloatType, samples: 4 \}\), new THREE\.RenderTarget\(8, 8, \{ type: THREE\.HalfFloatType \}\)\]/);
  const vc = src('wagmi/storyrun/vcall.js');
  assert.equal((vc.match(/prepare\([^;]*\{ tile: true \}\)/g) || []).length, 1);
  assert.equal((vc.match(/prepare\([^;]*\{ tile: true, hold: false \}\)/g) || []).length, 2);
});

test('P9: free roam between missions routes the GPS to the next one and marks it', () => {
  const idx = src('wagmi/storyrun/index.js');
  assert.ok(idx.indexOf('routeNext(order[k + 1]?.def || null);') > 0 && idx.indexOf('routeNext(order[k + 1]?.def || null);') < idx.indexOf('await afterPass(m);'));
  assert.match(idx, /W\.gps\.objective\(\['Go to ', \{ \[p\.name \|\| m\.title\]: 'yellow' \}/);
  assert.match(idx, /W\.nextMission = null;/);
  const run = src('wagmi/storyrun/runner.js');
  assert.match(run, /if \(!M \|\| !M\.live \|\| M\.tok\.dead \|\| M\.inScene\) return M\?\.inScene \? null : nextSource\(\);/);
});

test('P11: on foot, backing toward his car, the lens is never straight over him', async () => {
  const vm = await import('node:vm');
  const cam = src('js/cameras.js');
  const fn = cam.match(/const FOOT_ELEV = [^\n]*\nfunction footClamp\([\s\S]*?\n}\n/)[0];
  const { footClamp, FOOT_ELEV } = vm.runInNewContext(`${fn}\n({ footClamp, FOOT_ELEV });`, { Math });
  const P = { x: 0, y: 1.45, z: 0 }, open = () => 99;
  // (the playtest's flip: the boom pulled in to 0.3 m behind him and risen 2.4 m over his chest)
  const q = footClamp(P, { x: 0, y: 3.85, z: -0.3 }, 0, open);
  const elev = Math.atan2(q.y - P.y, Math.hypot(q.x - P.x, q.z - P.z));
  assert.ok(Math.abs(elev - FOOT_ELEV) < 1e-6, `held at ${(elev * 180 / Math.PI).toFixed(1)} degrees`);
  assert.ok(q.z < -1.5, 'put back out behind him, over the car');
  // (straight over his head: behind him by his heading)
  const q2 = footClamp(P, { x: 0, y: 4, z: 0 }, Math.PI / 2, open);
  assert.ok(q2.x < -1 && Math.abs(q2.z) < 1e-9);
  // (a usual view, or one already under the angle: left be)
  assert.equal(footClamp(P, { x: 0, y: 2.4, z: -4 }, 0, open), null);
  // (no clear way out at that angle (a corner): the old rise stays)
  assert.equal(footClamp(P, { x: 0, y: 3.85, z: -0.3 }, 0, () => 0.9), null);
  // (clear part of the way: as far as it is clear)
  const q3 = footClamp(P, { x: 0, y: 3.85, z: -0.3 }, 0, () => 2);
  assert.ok(Math.abs(Math.hypot(q3.x - P.x, q3.y - P.y, q3.z - P.z) - 2) < 1e-9);
  assert.match(cam, /if \(!car && entity\.type === 'person'\) \{\s*const q = footClamp\(P, cam, entity\.heading/);
});

test("B7: a call's grid keeps its pictures through a re-layout; a face's eyes where they can be", async () => {
  const { rtKeep, RT_STEP, eyesAim, EYES_OFF, rtSize } = await import('../wagmi/storyrun/vcall-plan.js');
  // (Dex leaves DL-4's x1: five tiles of 409 x 230 to four of 427 x 240, on a 1280 x 720 frame: the targets kept)
  const five = rtKeep([0, 0], rtSize(409, 230, 1));
  assert.deepEqual(five, [448, 256]); assert.equal(five[0] % RT_STEP, 0);
  assert.deepEqual(rtKeep(five, rtSize(427, 240, 1)), five);
  // (grown when it needs more; made again smaller only under 60% of it)
  assert.deepEqual(rtKeep(five, rtSize(620, 350, 1)), [640, 384]);
  assert.deepEqual(rtKeep([640, 384], [300, 170]), [320, 192]);
  // (the playtest's numbers: Intern Two's landmarks 18 cm over her head bone, over her hair; the rest kept)
  assert.deepEqual(eyesAim([0.02, 1.297, 0.05], [0, 1.115, 0]).map((x) => +x.toFixed(3)), [0, 1.185, 0]);
  assert.deepEqual(eyesAim([0.01, 1.083, 0.06], [0, 1.152, 0]), [0.01, 1.083, 0.06]);
  assert.deepEqual(eyesAim(null, [1, 2, 3]).map((x) => +x.toFixed(3)), [1, 2.07, 3]);
  assert.ok(EYES_OFF > 0.1 && EYES_OFF < 0.15);
  assert.match(src('wagmi/storyrun/vcall-draw.js'), /rtKeep\(\[r\.w, r\.h\], rtSize\(w, h, renderer\.getPixelRatio\?\.\(\) \|\| 1, 1600\)\)/);
  assert.match(src('wagmi/storyrun/vcall.js'), /return eyesAim\(e \? \[e\.x, e\.y, e\.z\] : null, \[h\.x, h\.y, h\.z\]\);/);
});

test('P13: a call on the car screen mid-drive never holds the loop: its office pooled under the card, warmed for its tile', async () => {
  // (which calls: every call with video from the card to the next one, in a drive's during too, each caller and office
  // once, the hero's own calls by the one he calls; the 12 of the Jensen Heist pack are all of this kind)
  const { feedList, feedKey } = await import('../wagmi/storyrun/prewarm.js');
  const steps = [
    { type: 'transition' },
    { type: 'vcall', people: [{ who: 'Marge' }] },
    { type: 'drive', during: [{ type: 'call', who: 'Wes', video: { office: 'green', blur: true } }] },
    { type: 'pursuit', during: [{ type: 'call', who: 'Board', video: { office: 'study' } }, { type: 'call', who: 'Wes', video: { office: 'green' } }] },
    { type: 'call', who: 'Cal', video: { office: 'car' }, lines: [['Cal', 'hey'], ['Nico', 'yo']] },
    { type: 'call', who: 'Lola' }, // (a voice call: no office)
    { type: 'transition' },
    { type: 'drive', during: [{ type: 'call', who: 'Dex', video: {} }] },
  ];
  assert.deepEqual(feedList(steps, 1, { heroName: 'Cal' }).map((f) => f.who), ['Wes', 'Board', 'Nico']);
  assert.deepEqual(feedList(steps, 7, { heroName: 'Cal' }).map((f) => f.who), ['Dex']);
  assert.deepEqual(feedList(steps, 0, { heroName: 'Cal', castName: (w) => (w === 'Wes' ? 'Wesley Trout' : w) }).map((f) => f.who), ['Wesley Trout', 'Board', 'Nico']);
  assert.deepEqual(feedList(null, 0), []);
  assert.equal(feedKey({ room: 'office-green', people: [{ who: 'Wes' }] }), 'pool:office-green::Wes');
  assert.notEqual(feedKey({ room: 'office-green', light: 'night', people: [{ who: 'Wes' }] }), feedKey({ room: 'office-green', people: [{ who: 'Wes' }] }));
  // (the SF city's warm() (Jensen Heist's ?city=pkg) takes a target as Mog City's does, and both can leave the loop
  // running: each object compiled in a task of its own, the target put back as soon as compileAsync() has it)
  for (const f of ['js/main.js', 'cities/sf/js/main.js']) {
    const m = src(f), w = m.slice(m.indexOf('async function warm('), m.indexOf('// 6. Animation Loop'));
    assert.match(w, /target = null, hold = true \} = \{\}\)/, f);
    assert.match(w, /renderer\.setRenderTarget\(target \|\| scenePass\.renderTarget\);\s*renderer\.setMRT\(target \? null : sceneMRT\);/, f);
    assert.match(w, /if \(!hold\) list = list\.flatMap\(\(o\) => \(o\.isScene \? o\.children : \[o\]\)\);/, f);
    assert.match(w, /if \(hold\) warming\+\+;/, f); assert.match(w, /if \(hold\) warming--;/, f);
    assert.match(w, /try \{ p = renderer\.compileAsync\(o, camera, where\); \}[^\n]*\n\s*finally \{ renderer\.setRenderTarget\(rt0\); renderer\.setMRT\(mrt0\); \}\n\s*try \{ await p; \}/, f);
    assert.match(m, /if \(warming\) return;/, f);
  }
  // (the pool: built and compiled for the tile, not the loop held; its people given back; kept by release(); a call
  // takes its office by key, else builds its own with the loop running, and only for its tile)
  const sets = src('wagmi/storyrun/sets.js');
  const pool = sets.slice(sets.indexOf('async pool(defs'), sets.indexOf('    use(id) {'));
  assert.match(pool, /async pool\(defs, \{ hold = false \} = \{\}\)/);
  assert.match(pool, /S\.pooled = true; sets\.set\(id, S\);/);
  assert.match(pool, /await tileWarm\(S, hold\);/);
  assert.match(pool, /for \(const P of S\.people\.values\(\)\) \{ giveBack\(P\.fig\);/);
  assert.match(pool, /if \(fresh\.length > room\) continue;/);
  assert.match(pool, /cast\.get\?\.\(P\.name\) !== P\.fig/);
  assert.match(sets, /for \(const \[id, S\] of \[\.\.\.sets\]\) if \(!S\.pooled\) \{ sets\.delete\(id\); dropSet\(S\); \}/);
  assert.match(sets, /if \(S\.pooled\) continue;/);
  assert.match(sets, /if \(tile && !hold && app\.warm && !direct\) \{\}/);
  const vc = src('wagmi/storyrun/vcall.js');
  assert.equal((vc.match(/S\.adopt\?\.\(poolKey\(video, who\), id\); await S\.prepare\(\{ \[id\]: feedDef\(video, who\) \}, \{ tile: true, hold: false \}\);/g) || []).length, 2);
  // (pooled under the mission's title as it starts and under each card, past the card never waited on)
  const run = src('wagmi/storyrun/runner.js');
  assert.match(run, /if \(M && !M\.tok\.dead\) n \+= await poolFeeds\(from\);/);
  assert.match(run, /const feeds = feedList\(M\?\.def\?\.steps, from, \{ castName, heroName \}\);/);
  assert.match(run, /if \(!ctx\.flags\.flowFast\) poolFeeds\(M\.i\);\n/);
  assert.match(run, /const WARM_HOLD = 0\.4;/);
});
