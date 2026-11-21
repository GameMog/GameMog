// Jensen Heist's polish list (21 Nov): B3, a story's chase to a place can set its crew out nearer (the step's `behind`
// m, clamped), so TP-6's heat-2 chase has pressure; B7, a retried mission's own calls are said again (calls.js forget),
// so a tail retried after a fail is not silent.
//   node --test tests/jh-polish-b3b7.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname;
const src = (f) => fs.readFileSync(ROOT + f, 'utf8');
globalThis.location ??= new URL('http://127.0.0.1:4981/?pack=x');

test('B3: a chase to a place sets its first car `behind` m back, clamped; none set keeps BEHIND_START.min', async () => {
  const { chaseOpening, behindMin, BEHIND_START } = await import('../wagmi/storyrun/rules.js');
  const reach = { type: 'pursuit', goal: 'reach', to: '@market' };
  assert.equal(chaseOpening(reach, { speed: 0, routeH: 1 }).behind.min, BEHIND_START.min);
  assert.equal(chaseOpening({ ...reach, behind: 55 }, { speed: 0, routeH: 1 }).behind.min, 55);
  assert.equal(behindMin({ behind: 5 }), BEHIND_START.near[0], 'never beside him');
  assert.equal(behindMin({ behind: 900 }), BEHIND_START.near[1]);
  assert.equal(behindMin({ behind: 'x' }), BEHIND_START.min);
  assert.equal(behindMin({}), BEHIND_START.min);
  assert.ok(BEHIND_START.near[0] >= 40, 'out of the calm gap');
});

test('B7: calls.js forget drops only a story mission\'s heard calls; the runner forgets them on a retry', async () => {
  // (calls.js pulls in the renderer: its forget run as written, over a heard map of its own)
  const line = src('wagmi/mission/calls.js').split('\n').find((l) => /^\s+forget\(prefix\) \{/.test(l));
  assert.ok(line, 'calls.js forget');
  const heard = new Map([['pack:TP-6:2:d:Nico', { main: true }], ['pack:CB-2:0:d:Dex', { main: true }], ['m2-tail', { main: true }]]);
  const C = new Function('heard', `return { ${line.trim().replace(/,$/, '')} };`)(heard);
  assert.equal(C.forget('m2'), 0, 'Mog City\'s own calls keep their heard rule');
  assert.equal(C.forget('pack:TP-6:'), 1);
  assert.equal(C.forget('pack:TP-6:'), 0);
  assert.equal(C.forget('pack:CB-2:'), 1);
  assert.deepEqual([...heard.keys()], ['m2-tail']);
  const r = src('wagmi/storyrun/runner.js');
  const i = r.indexOf('const at = M; kill(at.tok'), j = r.indexOf('W.calls?.forget?.(`pack:${def.id}:`)'), k = r.indexOf('if (restartTo) { cp =');
  assert.ok(i > 0 && j > i && k > j, 'forgotten after the attempt is killed, before any retry or restart');
  assert.ok(/const id = `pack:\$\{M\.def\.id\}:/.test(r), 'a world call\'s id starts pack:<mission>:');
});
