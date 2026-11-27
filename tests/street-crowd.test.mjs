// The street crowd in a town (wagmi/street/crowd.js, 17 Nov: Colter Land's Bozeman had 126 people on one 467 m block,
// walking its lawns in conga lines of 30 or 40): no more out round him than the sidewalks there take, no side of a
// block given much over its share, and in a Hometown package they walk the town's own sidewalks (the ground mask's
// band), not New York's 2.2 to 4.1 m from the curb.
//   node --test tests/street-crowd.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('../wagmi/street/crowd.js', import.meta.url), 'utf8');

test('how many are out: never more than the curb within R_IN of where he is headed takes', () => {
  assert.match(SRC, /const PER_M = \{ busy: 0\.2, quiet: 0\.11 \};/);
  assert.match(SRC, /cap = TOWN \? Math\.round\(near\.reduce\(\(s, n\) => s \+ n\.inLen \* perM\(n\.b\), 0\)\) : MAX;/);
  // (a town's only: New York's and San Francisco's crowds as they were)
  assert.match(SRC, /const TOWN = world\.id === 'pkg';/);
  assert.match(SRC, /active = Math\.min\(limit, cap,/);
});

test('a side of a block takes its share and a little more, then they are put somewhere else', () => {
  assert.match(SRC, /const SIDE_K = 1\.6;/);
  assert.match(SRC, /if \(\(occ\.get\(S\[k\]\) \|\| 0\) >= sideCap\(n\.b, S\[k\]\)\) continue;/);
});

test('the length of a side within a circle (the clipped segment)', () => {
  const a = SRC.indexOf('  function lenWithin'), b = SRC.indexOf('\n  }\n', a) + 4;
  const lenWithin = new Function(SRC.slice(a, b) + '\nreturn lenWithin;')();
  const S = { ox: -50, oz: 0, ux: 1, uz: 0, len: 100 };
  assert.ok(Math.abs(lenWithin(S, 0, 0, 10) - 20) < 1e-9);
  assert.ok(Math.abs(lenWithin(S, 0, 6, 10) - 16) < 1e-9);
  assert.equal(lenWithin(S, 0, 20, 10), 0);
  assert.ok(Math.abs(lenWithin({ ...S, len: 45 }, 0, 0, 10) - 5) < 1e-9);
});

test('a town\'s people walk its own sidewalks, read off the ground mask, where it shows one', () => {
  assert.match(SRC, /const MASK = world\.id === 'pkg' && typeof world\.sidewalkAt === 'function';/);
  assert.match(SRC, /return S\?\.band \|\| \(b\.park > 0\.6 \? PARK_LANE : LANE\);/);
  assert.doesNotMatch(SRC, /band\(p\.b\)[^,]/);
});

test('a town\'s blocks weighted as their sidewalks take people, a newcomer never on someone\'s heels', () => {
  assert.match(SRC, /w: len \* \(TOWN \? perM\(b\) \* 4 : /);
  assert.match(SRC, /const GAP = 3\.5;/);
  assert.match(SRC, /if \(TOWN && people\.some\(\(q\) => q !== p && q\.placed && q\.b === n\.b && q\.k === k && Math\.abs\(q\.a - p\.a\) < GAP && Math\.abs\(q\.o - p\.o\) < 1\.1\)\) continue;/);
  // (r2: a town's people never off its sidewalks: no side without one, no spot off it, round no corner onto one without it)
  assert.match(SRC, /if \(MASK && !S\[k\]\.band\) continue;/);
  assert.match(SRC, /if \(MASK && !world\.sidewalkAt\(p\.x, p\.z\)\) continue;/);
  assert.match(SRC, /if \(walkable\(S\[k2\], p\.o\) && \(!MASK \|\| S\[k2\]\.band\)\) \{ ok = true; break; \}/);
  assert.match(SRC, /if \(MASK && p\.state === 'walk' && \(p\.swT = \(p\.swT \|\| 0\) - dt\) <= 0\)/);
  assert.match(SRC, /Math\.min\(e, a \+ 3\) - 0\.35/);
});

test('a town\'s busy blocks are its main street\'s: three shopfronts or more on them', () => {
  // (r2: and built over by a third or more: a lawn or a lot with shops round it is not)
  assert.match(SRC, /const busy = world\.id === 'pkg' \? \(b\) => townShops\(b\) >= 3 && built\(b\) > 0\.3 : \(b\) => world\.commercial\(b\.district\);/);
  assert.match(SRC, /const plan = globalThis\.window\?\.NYC\?\.pkgSignPlan; if \(!plan\) return 0;/);
});
