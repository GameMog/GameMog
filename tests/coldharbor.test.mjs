// Cold Harbor's three (the owner, 15 Nov 2026, playing it): every game in Mog City's own car view unless its build asks
// for another (wagmi/storyrun/action.js carCamOn, ride.js mogFraming); a story world at its own hour from the first frame
// (storyrun/pack.js storyHour, wagmi/game.js, index.html's veil); a town's bridge decks mended as its bundle arrives
// (wagmi/world/deck-repair.js), a deck the town's edge cut off closed by a barrier and the edge held (growing.js
// townEdge). node --test tests/coldharbor.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { carCamOn, actionOn } from '../wagmi/storyrun/action.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

test('a step\'s own camera only in a world whose build asks for it (cine.carCam); else Mog City\'s chase view', () => {
  assert.equal(carCamOn({ city: 'hometown', cine: { action: true } }), false, 'Cold Harbor: the action layer on, its step cams off');
  assert.equal(carCamOn({ city: 'hometown' }), false);
  assert.equal(carCamOn({ city: 'ny', cine: { carCam: 'yes' } }), false);
  assert.equal(carCamOn({ city: 'hometown', cine: { carCam: true } }), true);
  assert.equal(actionOn({ city: 'hometown', cine: { action: true } }), true, 'the rest of the action layer unchanged');
  const a = src('wagmi/storyrun/action.js');
  assert.match(a, /stepCams = on && carCamOn\(def\)/);
  assert.match(a, /if \(!preset \|\| !stepCams \|\| !cs\?\.setCameraPreset\) return null;/);
});

test('every car the player drives is framed as Dan\'s car (5.58 m back, 2.05 m up, a 58 degree lens) unless its sheet names its own', async () => {
  // (ride.js imports three.js-free modules only through build-vehicle; its framing helper is a plain function)
  const r = src('wagmi/storyrun/ride.js');
  const body = r.slice(r.indexOf('export const MOG_FRAMING'), r.indexOf('export function fitSheet'));
  const mod = await import('data:text/javascript,' + encodeURIComponent(body));
  const { mogFraming, MOG_FRAMING } = mod;
  assert.deepEqual({ ...MOG_FRAMING }, { distance: 5.58, height: 2.05, fov: 58, pull: 0.002 });
  // (game.js's own numbers for Dan's car: the same)
  assert.match(src('wagmi/game.js'), /chaseDistance: 5\.58, chaseHeight: 2\.05, chase: \{ fov: 58, pull: 0\.002,/);
  const tune = { chaseDistance: 5.85, chaseHeight: 1.75, chase: { fov: 60, pull: 0.002, kick: 1.3, vmax: 30, vtop: 40, shake: 0.02, boostKick: 1.8 } };
  const f = mogFraming(tune, null, 1.35);
  assert.equal(f.chaseDistance, 5.58); assert.equal(f.chaseHeight, 2.05); assert.equal(f.chase.fov, 58); assert.equal(f.chase.pull, 0.002);
  assert.equal(f.chase.kick, 1.3, 'its own feel of speed kept'); assert.equal(f.chase.vmax, 30);
  // (a tall van: a little higher and further back)
  const v = mogFraming(tune, null, 2.2);
  assert.ok(v.chaseHeight > 2.05 && v.chaseHeight <= 3.25 && v.chaseDistance > 5.58 && v.chaseDistance <= 6.48);
  // (the build's own framing)
  const own = mogFraming(tune, { camera: { distance: 8, height: 3, fov: 50 } }, 1.35);
  assert.deepEqual([own.chaseDistance, own.chaseHeight, own.chase.fov], [8, 3, 50]);
  // (fitSheet and wearRide no longer copy the tune's framing)
  assert.doesNotMatch(r.slice(r.indexOf('export function fitSheet'), r.indexOf('// a mission\'s own ride')), /'chaseDistance', 'chaseHeight', 'chase'/);
  assert.match(r, /Object\.assign\(car, mogFraming\(T, sheet, bodyHeight\(T, w\)\)\);/);
});

test('a story world opens at its own hour: its first mission\'s, its act\'s timeline, its dressing\'s', async () => {
  const p = src('wagmi/storyrun/pack.js');
  const body = p.slice(p.indexOf('export const HOURS'), p.indexOf('export const BLACKOUTS'));
  const { storyHour } = await import('data:text/javascript,' + encodeURIComponent(body));
  // (Cold Harbor's hours as its stored pack has them: midnight, then dawn in its third act)
  const ids = ['CH-1', 'CH-2', 'CH-3', 'CH-4', 'CH-5', 'CH-6', 'CH-7', 'CH-8'], t = (id) => (id >= 'CH-7' ? 'dawn' : 'midnight');
  const ch = { city: 'hometown', dressing: { time: 'midnight' }, missions: ids.map((id) => ({ id, time: t(id) })),
    acts: [ids.slice(0, 3), ids.slice(3, 6), ids.slice(6)].map((order) => ({ order, timeline: Object.fromEntries(order.map((id) => [id, { time: t(id) }])) })) };
  assert.equal(storyHour(ch), 'midnight', 'Cold Harbor: midnight');
  assert.equal(storyHour({ missions: [{ id: 'a', time: 'dusk' }] }), 'twilight');
  assert.equal(storyHour({ missions: [{ id: 'a' }, { id: 'b', time: 'night' }], acts: [{ order: ['b', 'a'] }] }), 'midnight', 'the acts\' order first');
  assert.equal(storyHour({ missions: [{ id: 'a' }], acts: [{ order: ['a'], timeline: { a: { time: 'dawn' } } }] }), 'twilight');
  assert.equal(storyHour({ missions: [{ id: 'a' }], dressing: {} }), 'midday', 'a dressed world that says none: daylight');
  assert.equal(storyHour({ missions: [{ id: 'a' }] }), null, 'no word at all: the city\'s own');
  assert.equal(storyHour({ missions: [{ id: 'a', time: 'teatime' }] }), null);
  // (game.js sets it as the pack arrives, before the city is up; index.js the same under its gate)
  assert.match(src('wagmi/game.js'), /function atReady\(\) \{ if \(!app\.ready\) \{ setTimeout\(atReady, 100\); return; \} try \{ app\.selectTime\(hour\); \}/);
  assert.match(p, /def, hour: storyHour\(def\) \}\);/);
  // (the veil: a story world's held for its gate)
  assert.match(src('index.html'), /if \(dt >= 25000 && \(!story \|\| \(P && !P\.ok\) \|\| \(W && W\.storyFailed\)\) \|\| dt >= 600000\)/);
});

test('a bridge deck the compiler pulled down to the water mid-span is lifted back onto its span; nothing else moves', async () => {
  const { repairDecks } = await import('../wagmi/world/deck-repair.js');
  // a straight bridge, x from -200 to 200 along z = 0: two links meeting at a node at x = 0, the deck at 10 m but
  // the node anchored at 0.9 m (a V at the steepest grade), and a ground street elsewhere
  const prof = (fromNode) => { const ys = []; for (let s = 0; s <= 200; s += 2) { const d = fromNode(s); ys.push(+Math.min(10, 0.9 + 0.1 * d).toFixed(2)); } return [2, ...ys]; };
  const GEO = { roadGraph: { nodes: [-200, 0, 0, 0, 200, 0, 0, 300, 50, 300],
    links: [
      [0, 1, 0, 12, 2, 0, [], 128, 0, 0, 1, 1, prof((s) => 200 - s)],
      [1, 2, 0, 12, 2, 0, [], 128, 0, 0, 1, 1, prof((s) => s)],
      [3, 4, 1, 9, 2, 0, [], 0, 0, 0, 1, 1, null],
    ] } };
  const before = JSON.stringify(GEO.roadGraph.links[2]);
  const r = repairDecks(GEO);
  assert.equal(r.lifted.length, 1);
  assert.equal(r.lifted[0].node, 1);
  assert.ok(r.lifted[0].to > 9.5, `lifted to ${r.lifted[0].to}`);
  const a = GEO.roadGraph.links[0][12], b = GEO.roadGraph.links[1][12];
  assert.ok(a[a.length - 1] > 9.5 && b[1] > 9.5, 'both sides meet at the lifted height');
  assert.ok(Math.min(...a.slice(1), ...b.slice(1)) >= 0.9, 'nothing lowered');
  assert.equal(JSON.stringify(GEO.roadGraph.links[2]), before);
  assert.equal(repairDecks(GEO).lifted.length, 0, 'once mended, left alone');
  // (a deck that comes down to the ground on purpose: a ramp foot whose other link is at grade: left alone)
  const G2 = { roadGraph: { nodes: [-200, 0, 0, 0, 200, 0], links: [[0, 1, 0, 12, 2, 0, [], 128, 0, 0, 1, 1, prof((s) => 200 - s)], [1, 2, 0, 12, 2, 0, [], 0, 0, 0, 1, 1, null]] } };
  assert.equal(repairDecks(G2).lifted.length, 0);
  // (no road graph: nothing)
  assert.deepEqual(repairDecks({}), { lifted: [] });
});

test('a whole town\'s edge is held by the soft boundary; a deck the edge cut off ends at a barrier', async () => {
  const G = await import('../wagmi/world/growing.js');
  assert.deepEqual(G.townEdge({ window: { full: true, box: { x0: -5639.3, x1: 2050.7, z0: -3076, z1: 4614 } } }), { x0: -5639.3, z0: -3076, x1: 2050.7, z1: 4614 });
  assert.equal(G.townEdge({ window: { full: false, box: { x0: 0, x1: 1000, z0: 0, z1: 1000 } } }), null, 'a district: its own boundary');
  assert.equal(G.townEdge({}), null);
  // (a car heading out of the band slowed and turned)
  const car = { position: { x: -5630, z: 0 }, heading: -Math.PI / 2, speed: 30 };
  G.softBoundary(G.townEdge({ window: { full: true, box: { x0: -5639.3, x1: 2050.7, z0: -3076, z1: 4614 } } }), car, 'car', 0.1);
  assert.ok(car.speed < 30);
  const gs = src('cities/sf/js/grade-separation.js');
  assert.match(gs, /if \(atTownEdge\(node\)\) endBarrier\(seg,/);
  assert.match(gs, /collider\(cx, cz, seg\.dx, seg\.dz, 1\.2, w, y - 1, y \+ 3\);/);
  assert.match(gs, /atGradeTunnels\(\);/);
  assert.match(src('index.html'), /repairDecks\(b\.GEO\)/);
});
