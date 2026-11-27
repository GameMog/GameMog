// An old car's sheet worn by a newer fleet model keeps its looks (wagmi/fleet-car.js vintage, 17 Nov: Colter Land's
// 1978 feed truck on the modern full-size pickup had lost its two-tone and its age): its second colour at the model's
// own lines (cities/sf/js/fleet-models.js U.setSplit), and from VINTAGE back the chrome face the sheet gives it.
//   node --test tests/fleet-vintage.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('../wagmi/fleet-car.js', import.meta.url), 'utf8');
const FM = readFileSync(new URL('../cities/sf/js/fleet-models.js', import.meta.url), 'utf8');
const a = SRC.indexOf('export function vintageParts'), b = SRC.indexOf('\n}\n', a) + 3;
const VINTAGE = +SRC.match(/export const VINTAGE = (\d+);/)[1];
const vintageParts = new Function('VINTAGE', SRC.slice(a, b).replace('export ', '') + '\nreturn vintageParts;')(VINTAGE);

const feed = { era: 1978, face: { lamps: 'round-pair', grille: 'horizontal-bars', bumper: 'chrome-blade' }, paint: { base: '#8E2A22', second: '#E8DCC4', split: 'roof' } };

test('the 1978 feed truck: its cream roof, a chrome blade bumper, round lamps and a barred grille', () => {
  assert.deepEqual(vintageParts(feed), { split: 'roof', bumper: true, lamps: 'round-pair', grille: 'horizontal-bars' });
});

test('a newer car keeps its two-tone only; a car with no second colour or no split none', () => {
  assert.deepEqual(vintageParts({ ...feed, era: 2012 }), { split: 'roof', bumper: false, lamps: null, grille: null });
  assert.equal(vintageParts({ ...feed, paint: { base: '#111111', split: 'roof' } }).split, null);
  assert.equal(vintageParts({ ...feed, paint: { ...feed.paint, split: 'none' } }).split, null);
  assert.deepEqual(vintageParts({}), { split: null, bumper: false, lamps: null, grille: null });
  assert.equal(vintageParts({ era: 1985, face: { lamps: 'slim-led', bumper: 'body', grille: 'closed-ev' } }).lamps, null);
});

test('the model\'s material takes a second colour by a line, every hero car\'s uniforms carry it, the build is guarded', () => {
  assert.match(FM, /U\.setSplit = \(kind, hex, y = 0, half = 0\.05\) =>/);
  assert.match(FM, /if \(U && U\.second && kind === 'body' && !liv\)/);
  assert.match(SRC, /try \{ vintage\(THREE, rs, car, model, sheet, rig\); \} catch \(err\) \{ console\.warn\('\[fleet\] vintage', err\); \}/);
});

// (the face is laid on the model's own skin, endSurface: read along its length from either end, a lamp's hole filled
// across from its sides, no wider than the skin is at a height)
test('the model\'s end read off its body: a box nose with a hole in it, rounded off at its corners', () => {
  const a = SRC.indexOf('export function endSurface'), b = SRC.indexOf('\n}\n', a) + 3;
  const endSurface = new Function(SRC.slice(a, b).replace('export ', '') + '\nreturn endSurface;')();
  // (a nose: a front face at z 2 from x -0.6 to 0.6 and y 0.3 to 1.1 with a hole at x 0.3..0.45, y 0.6..0.8, its corners
  // falling back to z 1.7 at x 0.8; a tail face at z -2)
  const P = [], I = [];
  const quad = (p) => { const k = P.length / 3; for (const v of p) P.push(...v); I.push(k, k + 1, k + 2, k, k + 2, k + 3); };
  for (const sx of [-1, 1]) {
    const f = (x0, x1, y0, y1, z0 = 2, z1 = 2) => quad([[sx * x0, y0, z0], [sx * x1, y0, z1], [sx * x1, y1, z1], [sx * x0, y1, z0]]);
    f(0, 0.3, 0.3, 1.1); f(0.3, 0.45, 0.3, 0.6); f(0.3, 0.45, 0.8, 1.1); f(0.45, 0.6, 0.3, 1.1); f(0.6, 0.8, 0.3, 1.1, 2, 1.7);
    quad([[sx * 0, 0.3, -2], [sx * 0.8, 0.3, -2], [sx * 0.8, 1.1, -2], [sx * 0, 1.1, -2]]);
  }
  const pos = { count: P.length / 3, getX: (i) => P[i * 3], getY: (i) => P[i * 3 + 1], getZ: (i) => P[i * 3 + 2] };
  const model = { meta: { zF: 2, zR: -2 }, geo: { body: { attributes: { position: pos }, index: { array: I } } } };
  const F = endSurface(model, 1), R = endSurface(model, -1);
  assert.ok(Math.abs(F.z(0, 0.7) - 2) < 1e-6);
  assert.ok(Math.abs(F.z(-0.37, 0.7) - 2) < 1e-6, 'the hole filled from its sides');
  assert.ok(Math.abs(F.z(0.7, 0.7) - 1.85) < 0.02, 'the corner falling back');
  assert.ok(Number.isNaN(F.z(1.0, 0.7)), 'nothing past its side');
  assert.ok(Math.abs(F.zIn(1.0, 0.7) - F.z(0.8, 0.7)) < 0.03, 'zIn: further in where it is off the edge');
  const xe = F.reach(0.4, 1.0, 0.1);
  assert.ok(xe >= 0.6 && xe <= 0.68, 'reach: out to where the skin falls back 10 cm, ' + xe);
  assert.ok(Math.abs(R.z(0.3, 0.7) + 2) < 1e-6);
});
