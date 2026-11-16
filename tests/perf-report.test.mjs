// wagmi/perf.js: what the report of a load sends. A machine under 4 fps (every frame a stall) still sends its frames
// window and its stall time; the windows widen as play goes on (1, 2, 4, 8, 16 minutes) inside the sends a load has.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SRC = readFileSync(new URL('../wagmi/perf.js', import.meta.url), 'utf8');
function load() {
  const sent = [], timers = [], ss = new Map(), vis = [];
  let t = 5000;
  class Blob { constructor(parts) { this.text = parts.join(''); } }
  const window = {
    location: { search: '?statsto=http://localhost:5899', hostname: 'localhost' },
    navigator: { sendBeacon: (url, b) => { sent.push({ url, body: JSON.parse(b.text) }); return true; } },
    sessionStorage: { getItem: (k) => (ss.has(k) ? ss.get(k) : null), setItem: (k, v) => ss.set(k, String(v)) },
    crypto: { randomUUID: () => '0f3c6a1e-0000-4000-8000-000000000001' },
    document: { hidden: false, addEventListener: (k, f) => { if (k === 'visibilitychange') vis.push(f); }, querySelector: () => null },
    addEventListener: () => {}, performance: { now: () => t, getEntriesByType: () => [] },
    setTimeout: (f, ms) => { timers.push({ f, ms }); return timers.length; }, clearTimeout: () => {},
    URLSearchParams, Uint16Array, Uint32Array, Blob, JSON, Math, Object, Array, String, console
  };
  window.window = window;
  vm.runInNewContext(SRC, window);
  return { P: window.mcPerf, sent, timers, tick: (ms) => { t += ms; }, vis: (hidden) => { window.document.hidden = hidden; vis.forEach((f) => f()); } };
}

test('a machine under 4 fps sends its frames window and its stall time, and the load says it too', () => {
  const { P, sent, timers } = load();
  assert.equal(P.on, true);
  P.init(['renderer 100ms']);
  for (let i = 0; i < 200; i++) P.frame(0.333, 30); // (66 s of 333 ms frames: no frame under 250 ms)
  const frames = sent.filter((s) => s.body.k === 'frames');
  assert.equal(frames.length, 1, 'the minute window sent');
  assert.equal(frames[0].body.frames, 0);
  assert.ok(frames[0].body.stalls >= 180 && frames[0].body.stallSecs >= 60, JSON.stringify(frames[0].body));
  P.flush();
  timers.filter((x) => x.ms === 3000).forEach((x) => x.f());
  const l = sent.find((s) => s.body.k === 'load');
  assert.ok(l && l.body.stalls === 200 && l.body.stallSecs > 60, JSON.stringify(l && l.body));
  assert.equal(sent[0].url, 'http://localhost:5899/api/perf');
});

test('the frames windows widen as play goes on, so an hour of play stays covered', () => {
  const { P, sent } = load();
  P.init([]);
  for (let i = 0; i < 60 * 60 * 30; i++) P.frame(1 / 30, 5); // (an hour at 30 fps)
  const secs = sent.filter((s) => s.body.k === 'frames').map((s) => s.body.secs);
  assert.deepEqual(secs, [60, 120, 240, 480, 960, 960], `windows ${secs}`);
});

test('isolated hitches are stalls, never a frames window of their own', () => {
  const { P, sent } = load();
  P.init([]);
  P.frame(0.6, 5); P.frame(0.6, 5); // (1.2 s of stalls, nothing else)
  P.flush();
  assert.equal(sent.filter((s) => s.body.k === 'frames').length, 0);
});

test('the first frame after the tab comes back into view is skipped, never a stall', () => {
  const { P, sent, vis } = load();
  P.init([]);
  for (let i = 0; i < 300; i++) P.frame(1 / 60, 4); // (5 s of play)
  vis(true); P.frame(1 / 60, 4); vis(false);
  P.frame(40, 0); // (the frame back: its interval spans the 40 s away)
  for (let i = 0; i < 60; i++) P.frame(1 / 60, 4);
  P.flush();
  const f = sent.filter((s) => s.body.k === 'frames');
  assert.ok(f.length >= 1);
  assert.equal(f.reduce((a, s) => a + s.body.stalls, 0), 0, JSON.stringify(f.map((s) => s.body.stalls)));
});
