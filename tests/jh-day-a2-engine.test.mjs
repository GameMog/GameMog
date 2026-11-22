// Jensen Heist day A, stage 2 (22 Nov): the two engine pieces the pack's batch asks for, both opt-in per step or set.
//  - a chase to lose from a standing car opens behind him only when its step has `behind` (BT-3's Directors stood
//    either side of the parked Tensore); a chase to lose without it opens as before.
//  - a stage set's `screens: 'sign'` puts its sign on the side screens; without it they keep the stand-in figure.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

test('a chase to lose opens behind him only with its own behind', async () => {
  const { chaseOpening, standingOpens, BEHIND_START } = await import('../wagmi/storyrun/rules.js');
  assert.equal(chaseOpening({ goal: 'lose' }, { speed: 0, carH: 1 }), null);
  assert.equal(standingOpens({ goal: 'lose' }), false);
  assert.equal(standingOpens({ goal: 'escort', behind: 60 }), false);
  const o = chaseOpening({ goal: 'lose', behind: 60 }, { speed: 0, carH: 1 });
  assert.deepEqual(o, { ahead: false, calm: BEHIND_START.calm, behind: { min: 60, h: 1 } });
  // (moving, it is the town's opening as before)
  assert.equal(chaseOpening({ goal: 'lose', behind: 60 }, { speed: 9, carH: 1 }), null);
  // (a chase to a place is as it was)
  assert.equal(standingOpens({ goal: 'reach', to: '@x' }), true);
  const src = fs.readFileSync(path.join(ROOT, 'wagmi/storyrun/runner.js'), 'utf8');
  assert.match(src, /if \(standingOpens\(d\) && inCar\(\) && Math\.abs\(car\.speed \|\| 0\) < 4\)/);
  assert.match(src, /if \(d\.to\) try \{\s*const p = placeOf\(d\.to\)/);
});

test('a stage set shows its sign on the side screens only when it asks', () => {
  const src = fs.readFileSync(path.join(ROOT, 'wagmi/storyrun/stage-room.js'), 'utf8');
  assert.match(src, /K\.tex\(sideCanvas\(def\.screens === 'sign' \? sign : null\)\)/);
  assert.match(src, /function sideCanvas\(sign = null\)/);
  // (the stand-in figure is still drawn when there is no sign)
  assert.match(src, /\} else \{\s*x\.fillStyle = 'rgba\(0,0,0,0\.55\)'; x\.beginPath\(\); x\.ellipse/);
});
