// js/gfx-auto.js: the graphics tier Auto picks for a machine (the owner's rule, 15 Nov: low unless it is sure), and the
// frame-time watch: the resolution down fast, the tier at the floor, a step up earned only on a strong machine.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SRC = readFileSync(new URL('../js/gfx-auto.js', import.meta.url), 'utf8');
function load({ search = '', store = {}, coarse = false, fine = true, screen = { width: 1920, height: 1080 } } = {}) {
  const ls = new Map(Object.entries(store));
  const on = [];
  const document = { hidden: false, addEventListener: (k, f) => { if (k === 'visibilitychange') on.push(f); } };
  const window = {
    location: { search }, navigator: { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/141.0.0.0 Safari/537.36' }, screen,
    localStorage: { getItem: (k) => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(k, String(v)), removeItem: (k) => ls.delete(k) },
    matchMedia: (q) => ({ matches: q.includes('coarse') ? coarse : q.includes('fine') ? fine : false }),
    document, performance: { now: () => 0 }, console, URLSearchParams, Float32Array, Math, JSON, Date, Object, Promise, setTimeout
  };
  window.window = window;
  vm.runInNewContext(SRC, window);
  return { G: window.mcGfx, ls, document, window, vis: (hidden) => { document.hidden = hidden; on.forEach((f) => f()); } };
}
const probe = (o = {}) => ({ phone: false, webgpu: true, cls: 'strong', cpuMs: 4, mem: 8, cores: 10, frames: { refreshMs: 16.7, p90Ms: 18, worstMs: 18 }, key: 'k1', gpu: {}, ...o });

test('graphics cards: the strong ones by name, workstations and integrated ones not, software drawing told apart', () => {
  const { G } = load();
  const c = (renderer, extra = {}) => G.classify({ gpu: { renderer, ...extra } });
  assert.equal(c('ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 (0x00002504) Direct3D11 vs_5_0 ps_5_0, D3D11)'), 'strong');
  assert.equal(c('ANGLE (NVIDIA, NVIDIA T1000 8GB Direct3D11 vs_5_0 ps_5_0, D3D11)'), 'weak');
  assert.equal(c('ANGLE (NVIDIA, NVIDIA RTX A2000 12GB Direct3D11 vs_5_0 ps_5_0, D3D11)'), 'weak');
  assert.equal(c('ANGLE (Intel, Intel(R) UHD Graphics 770 Direct3D11 vs_5_0 ps_5_0, D3D11)'), 'weak');
  assert.equal(c('ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)'), 'weak');
  assert.equal(c('ANGLE (AMD, AMD Radeon RX 7800 XT Direct3D11 vs_5_0 ps_5_0, D3D11)'), 'strong');
  assert.equal(c('ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)'), 'weak');
  assert.equal(c('ANGLE (Apple, ANGLE Metal Renderer: Apple M2 Max, Unspecified Version)'), 'strong');
  assert.equal(c('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)'), 'software');
  assert.equal(c('ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11 vs_5_0 ps_5_0, D3D11)'), 'software');
  assert.equal(c('', { fallback: true }), 'software');
  assert.equal(c('Some New GPU 9000'), 'unknown');
  // (the workstation cards named in round hundreds: the 4000 class and up strong, the 2000 / 3000 ones not)
  assert.equal(c('ANGLE (NVIDIA, NVIDIA RTX 4000 Ada Generation Direct3D11 vs_5_0 ps_5_0, D3D11)'), 'strong');
  assert.equal(c('ANGLE (NVIDIA, NVIDIA RTX 5000 Ada Generation Laptop GPU Direct3D11 vs_5_0 ps_5_0, D3D11)'), 'strong');
  assert.equal(c('ANGLE (NVIDIA, Quadro RTX 4000 Direct3D11 vs_5_0 ps_5_0, D3D11)'), 'strong');
  assert.equal(c('ANGLE (NVIDIA, NVIDIA RTX PRO 4000 Blackwell Direct3D11 vs_5_0 ps_5_0, D3D11)'), 'strong');
  assert.equal(c('ANGLE (NVIDIA, NVIDIA RTX 2000 Ada Generation Direct3D11 vs_5_0 ps_5_0, D3D11)'), 'weak');
  assert.equal(c('ANGLE (NVIDIA, NVIDIA GeForce RTX 4050 Laptop GPU Direct3D11 vs_5_0 ps_5_0, D3D11)'), 'weak');
});

test('Auto is low on a computer when it is not sure, the phone tier on a phone', () => {
  const { G } = load();
  for (const [p, why] of [[probe({ webgpu: false }), 'webgl2'], [probe({ cls: 'weak' }), 'weak'], [probe({ cls: 'unknown' }), 'unknown'], [probe({ cls: 'software' }), 'software'],
    [probe({ cpuMs: 60 }), 'cpu-slow'], [probe({ frames: { refreshMs: 33, p90Ms: 90, worstMs: 90 } }), 'warmup-slow'], [probe({ mem: 4 }), 'memory'], [probe({ cores: 4 }), 'cores'],
    [probe(), 'measuring']]) {
    const k = G.pick(p);
    assert.equal(k.tier, 'low', why);
    assert.equal(k.why, why);
  }
  assert.equal(G.pick(probe({ phone: true })).tier, 'phone');
  assert.equal(G.pick(probe({ phone: true, mem: 2 })).tier, 'low');
  // (San Francisco's engine has no phone tier)
  assert.equal(G.pick(probe({ phone: true }), ['low', 'medium', 'high']).tier, 'low');
});

test('a step up learned by an older build is never used on a computer, and a step down is kept', () => {
  const learned = (rec) => ({ 'mc.gfx.v2': JSON.stringify({ choice: 'auto', learned: { at: Date.now(), key: 'k1', ...rec } }) });
  assert.deepEqual([load({ store: learned({ tier: 'medium', cap: 'high', reason: 'fast' }) }).G.pick(probe())].map((k) => [k.tier, k.why])[0], ['low', 'held-low']);
  assert.equal(load({ store: learned({ tier: 'high', cap: 'high', reason: 'fast' }) }).G.pick(probe()).tier, 'low');
  // (the same record on a machine without WebGPU, another graphics card, or one 15 days old: low)
  assert.equal(load({ store: learned({ tier: 'medium', cap: 'high', reason: 'fast' }) }).G.pick(probe({ webgpu: false })).tier, 'low');
  assert.equal(load({ store: learned({ tier: 'medium', cap: 'high', reason: 'fast' }) }).G.pick(probe({ key: 'k2' })).tier, 'low');
  const stale = { 'mc.gfx.v2': JSON.stringify({ choice: 'auto', learned: { at: Date.now() - 15 * 864e5, key: 'k1', tier: 'medium', reason: 'fast' } }) };
  assert.equal(load({ store: stale }).G.pick(probe()).tier, 'low');
  const slow = load({ store: learned({ tier: 'low', cap: 'low', reason: 'slow' }) }).G.pick(probe());
  assert.deepEqual([slow.tier, slow.why], ['low', 'slow-before']);
});

test('?tier= and the saved choice win over Auto; the old wagmi.gfx choice is read', () => {
  assert.equal(load({ search: '?tier=high' }).G.pick(probe({ cls: 'weak' })).tier, 'high');
  assert.equal(load({ search: '?gfx=medium' }).G.pick(probe({ cls: 'weak' })).tier, 'medium');
  assert.equal(load({ search: '?tier=auto' }).G.pick(probe({ cls: 'weak' })).tier, 'low');
  assert.equal(load({ store: { 'wagmi.gfx': 'high' } }).G.pick(probe({ cls: 'weak' })).tier, 'high');
  const { G, ls } = load();
  G.setChoice('medium');
  assert.equal(JSON.parse(ls.get('mc.gfx.v2')).choice, 'medium');
  assert.equal(ls.get('wagmi.gfx'), 'medium');
  G.setChoice('auto');
  assert.equal(ls.has('wagmi.gfx'), false);
});

// a run of frames: ms each (the interval), work ms each
function run(A, secs, ms, workMs = 4) { for (let t = 0; t < secs; t += ms / 1000) A.update(ms / 1000, true, workMs); }

test('slow frames step the resolution down within two seconds, then the tier at the floor', () => {
  const { G } = load();
  const q = { tier: 'medium', choice: 'auto', auto: 'medium', override: null, why: 'measured' };
  const scales = [], downs = [];
  const A = G.adapt({ quality: q, probe: probe(), setScale: (s) => scales.push(s), tierDown: (next) => { downs.push(next); return true; } });
  run(A, 6, 16.7);
  assert.deepEqual(scales, []);
  run(A, 1.8, 30);
  assert.deepEqual(scales, [0.85], 'one step within 2 s of 30 ms frames');
  run(A, 2.2, 30);
  assert.deepEqual(scales, [0.85, 0.7]);
  run(A, 4, 40);
  assert.deepEqual(downs, ['low'], 'the tier at the floor after 3 s more');
  assert.equal(q.learnedSlow, true);
});

test('the resolution comes back up slowly, and frames over 250 ms are stalls, never frame time', () => {
  const { G } = load();
  const q = { tier: 'low', choice: 'auto', auto: 'low', override: null, why: 'webgl2' };
  const scales = [];
  const A = G.adapt({ quality: q, probe: probe({ webgpu: false }), setScale: (s) => scales.push(s), tierDown: () => false });
  run(A, 6, 16.7);
  for (let i = 0; i < 20; i++) { A.update(0.5, true, 4); run(A, 0.3, 16.7); } // (a compile now and then: isolated hitches)
  assert.equal(A.stalls, 20);
  assert.deepEqual(scales, []);
  run(A, 2, 45);
  assert.equal(scales[0], 0.85);
  run(A, 6, 16.7, 4);
  assert.equal(scales.length, 1, 'not back up after 6 s');
  run(A, 4, 16.7, 4);
  assert.deepEqual(scales, [0.85, 1], 'up after 8 s of frames on time with the work light');
  // (frames on time but the work near the budget: no step up)
  const B = G.adapt({ quality: { ...q }, probe: probe({ webgpu: false }), setScale: (s) => scales.push(s), tierDown: () => false });
  run(B, 6, 16.7); run(B, 2, 45); const n = scales.length; run(B, 20, 16.7, 14);
  assert.equal(scales.length, n, 'no step up with 14 ms of work a frame');
});

test('a strong computer on Auto only records the tier it would earn (frames on time, work well inside), never learns it', () => {
  const mk = (p, work) => {
    const { G, ls } = load();
    const q = { tier: 'low', choice: 'auto', auto: 'low', override: null, why: 'measuring' };
    const A = G.adapt({ quality: q, probe: p, setScale: () => {}, tierDown: () => false });
    run(A, 20, 16.7, work);
    return { q, rec: JSON.parse(ls.get('mc.gfx.v2') || 'null') };
  };
  const good = mk(probe(), 5);
  assert.equal(good.q.wouldEarn, 'medium');
  assert.equal(good.q.learnedUp, undefined);
  assert.ok(!good.rec || !good.rec.learned, 'nothing learned');
  assert.equal(mk(probe(), 13).q.wouldEarn, undefined, 'work at 13 ms of 16.7 is not well inside');
  assert.equal(mk(probe({ cls: 'weak' }), 5).q.wouldEarn, undefined, 'never on a weak graphics card');
  assert.equal(mk(probe({ webgpu: false }), 5).q.wouldEarn, undefined, 'never on WebGL 2');
});

test("an engine that can't swap its tier live steps it down once, not again every few seconds (New York)", () => {
  const { G } = load();
  const q = { tier: 'phone', choice: 'auto', auto: 'phone', override: null, why: 'phone' };
  const downs = [];
  const A = G.adapt({ quality: q, probe: probe({ phone: true }), setScale: () => {}, tierDown: (next) => { downs.push(next); return true; } });
  run(A, 6, 16.7);
  const before = G.store.read().learned;
  run(A, 60, 40);
  assert.deepEqual(downs, ['low'], 'phone -> low once in a minute of 40 ms frames');
  assert.equal(A.scale, 0.6);
  assert.equal(G.store.read().learned.tier, 'low');
  assert.ok(!before);
});

test('a 120 Hz display playing a steady 60 fps steps the resolution back up and is recorded as one that would earn a tier', () => {
  const { G } = load();
  const q = { tier: 'low', choice: 'auto', auto: 'low', override: null, why: 'measuring' };
  const scales = [];
  const A = G.adapt({ quality: q, probe: probe({ frames: { refreshMs: 8.3, worstMs: 10 } }), setScale: (s) => scales.push(s), tierDown: () => false });
  run(A, 6, 16.7, 5);
  run(A, 2, 30, 25);
  assert.equal(scales[0], 0.85);
  run(A, 40, 16.7, 5);
  assert.equal(A.scale, 1, 'back to full resolution');
  // (a fresh run with no dip: 60 fps with light work on the 120 Hz display earns the next tier)
  const B = load();
  const q2 = { ...q };
  const A2 = B.G.adapt({ quality: q2, probe: probe({ frames: { refreshMs: 8.3, worstMs: 10 } }), setScale: () => {}, tierDown: () => false });
  run(A2, 20, 16.7, 5);
  assert.equal(q2.wouldEarn, 'medium');
});

test('a machine steadily under 4 fps steps the resolution to its floor, then the tier, and is remembered as slow', () => {
  for (const ms of [300, 333, 600]) {
    const { G } = load();
    const q = { tier: 'medium', choice: 'auto', auto: 'medium', override: null, why: 'measured' };
    const scales = [], downs = [];
    const A = G.adapt({ quality: q, probe: probe(), setScale: (s) => scales.push(s), tierDown: (next) => { downs.push(next); return true; } });
    run(A, 12, ms);
    assert.deepEqual(scales, [0.7], `${ms} ms: the resolution to its floor`);
    assert.ok(downs.length >= 1 && downs[0] === 'low', `${ms} ms: the tier down (${downs})`);
    assert.equal(q.learnedSlow, true);
    assert.equal(G.store.read().learned.tier, 'low');
    assert.equal(G.store.read().learned.reason, 'slow');
    assert.ok(A.stalls > 10 && A.stallSecs >= 7, `${ms} ms: stalls counted (${A.stalls}, ${A.stallSecs} s)`);
    // (and the next load on this machine: low, slow before)
    assert.equal(G.pick(probe()).why, 'slow-before');
  }
});

test('isolated hitches never step down: one long compile, a pause, hitches between good frames', () => {
  const { G } = load();
  const q = { tier: 'medium', choice: 'auto', auto: 'medium', override: null, why: 'measured' };
  const scales = [], downs = [];
  const A = G.adapt({ quality: q, probe: probe(), setScale: (s) => scales.push(s), tierDown: (next) => { downs.push(next); return true; } });
  run(A, 6, 16.7);
  A.update(2.2, true, 4); run(A, 1, 16.7); // (one long compile)
  A.update(30, true, 0); run(A, 1, 16.7); // (the tab back after 30 s, or the pause menu)
  A.update(0.9, true, 4); A.update(0.9, true, 4); run(A, 1, 16.7); // (two back to back: under three)
  for (let i = 0; i < 30; i++) { A.update(0.4, true, 4); run(A, 0.25, 16.7); } // (a hitch every quarter second)
  assert.deepEqual(scales, []);
  assert.deepEqual(downs, []);
  assert.equal(q.learnedSlow, undefined);
});

test('a janky loading screen cannot loosen the slow line past 34 ms', () => {
  const { G } = load();
  const q = { tier: 'medium', choice: 'auto', auto: 'medium', override: null, why: 'measured' };
  const scales = [];
  const A = G.adapt({ quality: q, probe: probe({ frames: { refreshMs: 33, p90Ms: 40, worstMs: 90 } }), setScale: (s) => scales.push(s), tierDown: () => true });
  run(A, 6, 33);
  assert.deepEqual(scales, [], 'a steady 30 fps on a 30 Hz display is on time');
  run(A, 2, 40);
  assert.deepEqual(scales, [0.85], '40 ms frames are slow whatever the loading screen read');
});

test('the loading-screen jank is its 90th percentile, not its one worst frame', () => {
  const { G } = load();
  assert.equal(G.pick(probe({ frames: { refreshMs: 16.7, p90Ms: 20, worstMs: 140 } })).why, 'measuring');
  assert.equal(G.pick(probe({ frames: { refreshMs: 16.7, p90Ms: 80, worstMs: 140 } })).why, 'warmup-slow');
});

test("index.html stamps the graphics and report scripts with the engine scripts' own cache stamp", () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const v = html.match(/const assetVersion = '([^']+)'/)[1];
  assert.equal(html.match(/const v = '([^']+)'/)[1], v);
  assert.ok(html.includes(`<script src="wagmi/perf.js?v=${v}" defer></script>`), 'wagmi/perf.js');
  assert.ok(html.includes(`<script src="js/gfx-auto.js?v=${v}" defer></script>`), 'js/gfx-auto.js');
});

// a strong computer playing whole loads of perfect frames: the next load's pick, three times over
test('a strong desktop with 60 s of perfect frames stays low across 3 loads; a phone stays phone', () => {
  for (const phone of [false, true]) {
    let store = {};
    for (let i = 0; i < 3; i++) {
      const L = load({ store, coarse: phone, fine: !phone, screen: phone ? { width: 390, height: 844 } : { width: 1920, height: 1080 } });
      const p = probe({ phone });
      const k = L.G.pick(p);
      assert.equal(k.tier, phone ? 'phone' : 'low', `load ${i + 1} (${phone ? 'phone' : 'desktop'}): ${k.tier} ${k.why}`);
      const q = { ...k };
      const A = L.G.adapt({ quality: q, probe: p, setScale: () => {}, tierDown: () => false });
      run(A, 60, 16.7, 4);
      if (!phone) assert.equal(q.wouldEarn, 'medium', `load ${i + 1}: recorded what it would earn`);
      assert.equal(q.learnedUp, undefined, `load ${i + 1}: nothing learned`);
      store = Object.fromEntries(L.ls);
      const rec = store['mc.gfx.v2'] ? JSON.parse(store['mc.gfx.v2']) : null;
      assert.ok(!rec || !rec.learned, `load ${i + 1}: nothing stored`);
    }
  }
});

test("the would-earn telemetry: a 'learn' event with the tier it would earn, not applied", () => {
  const L = load();
  const events = [];
  L.window.mcPerf = { event: (kind, d) => events.push([kind, d]) };
  const q = { tier: 'low', choice: 'auto', auto: 'low', override: null, why: 'measuring' };
  const A = L.G.adapt({ quality: q, probe: probe(), setScale: () => {}, tierDown: () => false });
  run(A, 30, 16.7, 4);
  const learnEv = events.filter(([k]) => k === 'learn');
  assert.equal(learnEv.length, 1);
  assert.equal(learnEv[0][1].why, 'would-earn:medium');
  assert.equal(learnEv[0][1].earned, 'medium');
  assert.equal(learnEv[0][1].applied, false);
  assert.equal(learnEv[0][1].to, 'low');
});

test('one ~4 s burst of stalls sets the resolution floor only: no tier step, nothing learned', () => {
  const { G } = load();
  const q = { tier: 'medium', choice: 'auto', auto: 'medium', override: null, why: 'measured' };
  const scales = [], downs = [];
  const A = G.adapt({ quality: q, probe: probe(), setScale: (s) => scales.push(s), tierDown: (next) => { downs.push(next); return true; } });
  run(A, 6, 16.7);
  run(A, 4, 300); // (one continuous burst)
  run(A, 20, 16.7);
  assert.equal(scales[0], 0.7, 'the floor');
  assert.deepEqual(downs, [], 'no tier step');
  assert.ok(!G.store.read().learned, 'nothing learned');
  assert.equal(q.learnedSlow, undefined);
});

test('stalls at the floor after real play there step the tier', () => {
  const { G } = load();
  const q = { tier: 'medium', choice: 'auto', auto: 'medium', override: null, why: 'measured' };
  const downs = [];
  const A = G.adapt({ quality: q, probe: probe(), setScale: () => {}, tierDown: (next) => { downs.push(next); return true; } });
  run(A, 6, 16.7);
  run(A, 3, 300); // (the floor)
  run(A, 3, 25); // (real play at the floor, not slow enough for its own step)
  run(A, 3, 300); // (stalled again: now the tier)
  assert.deepEqual(downs, ['low']);
});

test('hidden or inactive frames, and the first frame back in view, break a run of stalls', () => {
  const { G, vis, document } = load();
  const q = { tier: 'medium', choice: 'auto', auto: 'medium', override: null, why: 'measured' };
  const scales = [];
  const A = G.adapt({ quality: q, probe: probe(), setScale: (s) => scales.push(s), tierDown: () => true });
  run(A, 6, 16.7);
  // (1.5 s of stalls, an inactive frame, 1.5 s more: never 2 s back to back)
  run(A, 1.5, 300); A.update(0.3, false, 4); run(A, 1.5, 300);
  run(A, 0.5, 16.7);
  // (1.5 s of stalls, the tab hidden and back, its first frame skipped, 1.5 s more)
  run(A, 1.5, 300); vis(true); A.update(0.3, true, 4); vis(false); A.update(2, true, 4); run(A, 1.5, 300);
  assert.deepEqual(scales, []);
  assert.equal(document.hidden, false);
  // (and the run still counts once nothing breaks it)
  run(A, 2.5, 300);
  assert.deepEqual(scales, [0.7]);
});
