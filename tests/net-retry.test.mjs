// js/net-retry.js (window.mcNet): a file asked for again when the server was only busy (GitHub Pages' 503s for a few
// minutes after a release), never when it is not there; the backoff, Retry-After, the caller's abort; dynamic imports
// again only when their fetch failed. And tools/serve.mjs's injected-503 test mode, and index.html's script retry.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { failer, handler } from '../tools/serve.mjs';

const SRC = readFileSync(new URL('../js/net-retry.js', import.meta.url), 'utf8');
function load() {
  const logs = [];
  const window = { console: { info: (...a) => logs.push(a.join(' ')), warn: (...a) => logs.push('warn ' + a.join(' ')) }, setTimeout, clearTimeout, DOMException, Date, Math, Number, Promise, Set, Map, Error, Object, String, RegExp };
  window.window = window;
  vm.runInNewContext(SRC, window);
  return { N: window.mcNet, logs };
}
const res = (status, headers = {}) => ({ status, ok: status >= 200 && status < 300, headers: { get: (k) => headers[k.toLowerCase()] ?? null }, body: null });
// a fake server: answers in order, records each call's url and init; the waits recorded, not slept
function rig(answers) {
  const calls = [], waits = [];
  const fetch = async (u, i) => { calls.push({ u, i }); const a = answers[Math.min(calls.length - 1, answers.length - 1)]; if (a instanceof Error) throw a; return res(...[].concat(a)); };
  const sleep = async (ms, signal) => { if (signal?.aborted) throw signal.reason; waits.push(ms); };
  return { calls, waits, cfg: { fetch, sleep, random: () => 0.5 } };
}

test('busy answers (408 425 429 500 502 503 504) are asked again; the first good one is returned and logged once as info', async () => {
  const { N, logs } = load();
  for (const s of [408, 425, 429, 500, 502, 503, 504]) {
    const R = rig([s, s, 200]);
    const r = await N.fetchRetry('data/x.bin.gz', undefined, R.cfg);
    assert.equal(r.status, 200, String(s));
    assert.equal(R.calls.length, 3, String(s));
  }
  assert.equal(logs.length, 7);
  assert.match(logs[0], /^\[net\] recovered file data\/x\.bin\.gz on try 3 \(was 408\)$/);
  assert.ok(logs.every((l) => !l.startsWith('warn')));
});

test('never asked again: 404, 403, 401, 410, 200, 304 and other answers come back as they came, after one request', async () => {
  const { N, logs } = load();
  for (const s of [200, 204, 304, 400, 401, 403, 404, 410, 501]) {
    const R = rig([s, 200]);
    const r = await N.fetchRetry('a', undefined, R.cfg);
    assert.equal(r.status, s);
    assert.equal(R.calls.length, 1, String(s));
  }
  assert.equal(logs.length, 0);
});

test('the backoff: 0.4, 1, 2 and 4 s (5 tries), then the last busy answer is returned as it came', async () => {
  const { N } = load();
  const R = rig([503]);
  const r = await N.fetchRetry('a', undefined, R.cfg);
  assert.equal(r.status, 503);
  assert.equal(R.calls.length, 5);
  assert.deepEqual(R.waits, [400, 1000, 2000, 4000]);
  // (each wait 0.8-1.2 x its step)
  const lo = rig([503]); await N.fetchRetry('a', undefined, { ...lo.cfg, random: () => 0 });
  const hi = rig([503]); await N.fetchRetry('a', undefined, { ...hi.cfg, random: () => 0.999999 });
  assert.deepEqual(lo.waits, [320, 800, 1600, 3200]);
  assert.deepEqual(hi.waits, [480, 1200, 2400, 4800]);
});

test('a network error is asked again too; still failing, the last error is thrown', async () => {
  const { N, logs } = load();
  const R = rig([new TypeError('Failed to fetch'), 200]);
  assert.equal((await N.fetchRetry('a', undefined, R.cfg)).status, 200);
  assert.match(logs[0], /on try 2 \(was network error\)/);
  const D = rig([new TypeError('Failed to fetch')]);
  await assert.rejects(N.fetchRetry('a', undefined, D.cfg), /Failed to fetch/);
  assert.equal(D.calls.length, 5);
});

test('Retry-After: a small one honoured (seconds or a date), a long one not waited for', async () => {
  const { N } = load();
  const A = rig([[503, { 'retry-after': '3' }], 200]);
  await N.fetchRetry('a', undefined, A.cfg);
  assert.deepEqual(A.waits, [3000]);
  // (shorter than the step: the step)
  const B = rig([[503, { 'retry-after': '0' }], 200]);
  await N.fetchRetry('a', undefined, B.cfg);
  assert.deepEqual(B.waits, [400]);
  const C = rig([[429, { 'retry-after': '3600' }], 200]);
  await N.fetchRetry('a', undefined, C.cfg);
  assert.deepEqual(C.waits, [400]);
  assert.equal(N.retryAfterMs(res(503, { 'retry-after': new Date(10_000 + 5000).toUTCString() }), 10_000), 5000);
  assert.equal(N.retryAfterMs(res(503, { 'retry-after': 'soon' })), null);
  assert.equal(N.retryAfterMs(res(503)), null);
});

test("the caller's options are kept; the retries go past the HTTP cache unless the caller chose a cache mode", async () => {
  const { N } = load();
  const R = rig([503, 200]);
  await N.fetchRetry('a', { priority: 'low', credentials: 'omit' }, R.cfg);
  assert.deepEqual(R.calls[0].i, { priority: 'low', credentials: 'omit' });
  assert.deepEqual({ ...R.calls[1].i }, { priority: 'low', credentials: 'omit', cache: 'reload' }); // (the vm's own Object)
  const K = rig([503, 200]);
  await N.fetchRetry('a', { cache: 'no-cache' }, K.cfg);
  assert.equal(K.calls[1].i.cache, 'no-cache');
});

test("abort: the caller's signal is passed on, ends a wait at once, and an abort is never retried", async () => {
  const { N } = load();
  // (aborted before: no request at all)
  const pre = new AbortController(); pre.abort();
  const P = rig([200]);
  await assert.rejects(N.fetchRetry('a', { signal: pre.signal }, P.cfg), (e) => e.name === 'AbortError');
  assert.equal(P.calls.length, 0);
  // (aborted during the wait: the real sleep, ended by the signal)
  const ac = new AbortController();
  let n = 0;
  const fetch = async (u, i) => { n++; assert.equal(i.signal, ac.signal); return res(503); };
  const t0 = Date.now();
  const p = N.fetchRetry('a', { signal: ac.signal }, { fetch });
  setTimeout(() => ac.abort(), 20);
  await assert.rejects(p, (e) => e.name === 'AbortError');
  assert.ok(Date.now() - t0 < 300, 'the wait ended by the abort');
  assert.equal(n, 1);
  // (the fetch itself aborted)
  const A = rig([Object.assign(new Error('aborted'), { name: 'AbortError' }), 200]);
  await assert.rejects(N.fetchRetry('a', undefined, A.cfg), (e) => e.name === 'AbortError');
  assert.equal(A.calls.length, 1);
});

test('retry(): a loader asked again on a busy answer it carries (three.js HttpError), not on a 404 or a parse error', async () => {
  const { N, logs } = load();
  const sleep = async () => {};
  const httpErr = (s) => Object.assign(new Error(`fetch for "x.glb" responded with ${s}: Busy`), { response: { status: s } });
  let n = 0;
  assert.equal(await N.retry(async () => { if (++n < 3) throw httpErr(503); return 'model'; }, { label: 'x.glb', sleep }), 'model');
  assert.equal(n, 3);
  assert.match(logs.at(-1), /recovered file x\.glb on try 3 \(was 503\)/);
  n = 0;
  await assert.rejects(N.retry(async () => { n++; throw httpErr(404); }, { sleep }), /404/);
  assert.equal(n, 1);
  n = 0;
  await assert.rejects(N.retry(async () => { n++; throw new SyntaxError('Unexpected token'); }, { sleep }), SyntaxError);
  assert.equal(n, 1);
  // (the status from the message alone, as the SF data loader words it)
  assert.equal(N.statusOf(new Error('data/region/city--2--3.bin: HTTP 503')), 503);
  assert.equal(N.loadFailed(new Error('data/region/city--2--3.bin: HTTP 503')), true);
  assert.equal(N.loadFailed(new Error('x: HTTP 404')), false);
});

test("importRetry(): again when the module's fetch failed (Chrome, Firefox, Safari wording), never when it ran and threw", async () => {
  const { N, logs } = load();
  const sleep = async () => {};
  for (const msg of ['Failed to fetch dynamically imported module: http://x/wagmi/combat/index.js', 'error loading dynamically imported module: http://x/a.js', 'Importing a module script failed.']) {
    let n = 0;
    const mod = await N.importRetry(async () => { if (++n === 1) throw new TypeError(msg); return { install: 1 }; }, undefined, { sleep });
    assert.equal(mod.install, 1);
    assert.equal(n, 2, msg);
  }
  assert.equal(logs.length, 3);
  let n = 0;
  const thunk = () => { n++; if (n === 1) throw new TypeError('Failed to fetch dynamically imported module: u'); return import('node:path'); };
  await N.importRetry(thunk, 'path', { sleep });
  assert.equal(n, 2);
  n = 0;
  await assert.rejects(N.importRetry(async () => { n++; throw new TypeError("Cannot read properties of undefined (reading 'x')"); }, 'm', { sleep }), TypeError);
  assert.equal(n, 1);
  n = 0;
  await assert.rejects(N.importRetry(async () => { n++; throw new SyntaxError('Unexpected token'); }, 'm', { sleep }), SyntaxError);
  assert.equal(n, 1);
});

test('importRetry() names the module from the thunk for its log line', async () => {
  const { N, logs } = load();
  let n = 0;
  const load1 = () => { if (++n === 1) return Promise.reject(new TypeError('Failed to fetch dynamically imported module: x')); return Promise.resolve({}); };
  // (a thunk whose source names the module, as every caller's does: () => import('./combat/index.js'))
  await N.importRetry(Object.assign(load1, { toString: () => "() => import('./combat/index.js')" }), undefined, { sleep: async () => {} });
  assert.match(logs.at(-1), /recovered module \.\/combat\/index\.js on try 2 \(was load error\)/);
});

test('imageRetry(): again after a wait unless a HEAD says the image is not there', async () => {
  const { N, logs } = load();
  const sleep = async () => {};
  let loads = 0;
  const im = await N.imageRetry('t.jpg', 'anonymous', { sleep, fetch: async () => res(200), load: async (u) => { if (++loads < 2) throw new Error('image'); return { src: u }; } });
  assert.equal(im.src, 't.jpg');
  assert.equal(loads, 2);
  assert.match(logs.at(-1), /recovered image t\.jpg on try 3/);
  loads = 0;
  await assert.rejects(N.imageRetry('gone.jpg', 'anonymous', { sleep, fetch: async () => res(404), load: async () => { loads++; return {}; } }));
  assert.equal(loads, 0);
});

test('tools/serve.mjs FAIL503: off by default; a share of paths 503 the first time only, the same paths every run; every:N', async () => {
  assert.equal(failer(''), null);
  assert.equal(failer(undefined), null);
  assert.equal(failer('0'), null);
  assert.throws(() => failer('lots'));
  const paths = Array.from({ length: 2000 }, (_, i) => `/data/f${i}.bin`);
  const a = failer('0.15'), b = failer('0.15');
  const first = paths.filter((p) => a(p)), again = paths.filter((p) => a(p));
  assert.ok(first.length > 200 && first.length < 400, String(first.length));
  assert.equal(again.length, 0, 'the second request of each path is served');
  assert.deepEqual(paths.filter((p) => b(p)), first, 'the same paths every run');
  const c = failer('0.15', { seed: 2 });
  assert.notDeepEqual(paths.filter((p) => c(p)), first, 'another seed, other paths');
  const t = failer('0.15', { times: 2 });
  const p0 = first[0];
  assert.deepEqual([t(p0), t(p0), t(p0)], [true, true, false]);
  const m = failer('1', { match: '^/wagmi/' });
  assert.deepEqual([m('/wagmi/a.js'), m('/js/main.js'), m('/wagmi/a.js')], [true, false, false]);
  const e = failer('every:3');
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(() => e('/x')), [false, false, true, false, false, true]);
  // (the handler answers 503 for a picked path, never for the page itself)
  const out = [];
  const h = handler(new URL('..', import.meta.url).pathname.replace(/\/$/, ''), { fail: () => true, retryAfter: '1' });
  const fake = (url) => new Promise((done) => {
    const r = { writeHead: (code, head) => { out.push([url, code, head && head['retry-after']]); return r; }, end: () => done(), destroy: () => done(), on: () => r, once: () => r, emit: () => {}, write: () => true };
    h({ url, method: 'HEAD', headers: {} }, r);
    setTimeout(done, 200);
  });
  const log = console.log; console.log = () => {};
  try { await fake('/js/net-retry.js'); await fake('/index.html'); } finally { console.log = log; }
  assert.deepEqual(out[0], ['/js/net-retry.js', 503, '1']);
  assert.equal(out[1][1], 200);
});

test('index.html: the script retry is in the head ahead of every external script, js/net-retry.js loaded before the engine', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const retry = html.indexOf('window.mcScriptRetry = ');
  const firstSrc = html.search(/<script[^>]*\ssrc=/);
  assert.ok(retry > 0 && retry < firstSrc, 'mcScriptRetry before the first <script src>');
  const v = html.match(/const assetVersion = '([^']+)'/)[1];
  const net = html.indexOf(`<script src="js/net-retry.js?v=${v}" defer></script>`);
  assert.ok(net > 0 && net < html.indexOf('<script type="module">'), 'js/net-retry.js, deferred, before the engine module');
  // (the city's scripts one after another, each retried before the next runs)
  assert.match(html, /s\.onerror = \(\) => \(window\.mcScriptRetry \? window\.mcScriptRetry\(s\)\.then\(res\) : res\(false\)\);/);
  assert.match(html, /cityChain = cityChain\.then\(\(\) => window\.mcScriptRetry\?\.idle\(\)\)/);
});

test('the game routes its loads through the retry: no bare fetch( or import( left in the runtime', () => {
  const files = ['cities/sf/js/data-loader.js', 'cities/sf/js/region.js', 'wagmi/game.js', 'wagmi/radio/voices.js', 'wagmi/storyrun/runner.js', 'wagmi/glb.js'];
  for (const f of files) {
    const src = readFileSync(new URL('../' + f, import.meta.url), 'utf8').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
    const bare = src.match(/(?<![\w.$])(?<!=> )import\(\s*['"][^'"]+['"]\s*\)/g) || [];
    assert.deepEqual(bare, [], f + ': a dynamic import not through importRetry');
    assert.doesNotMatch(src.replace(/mcNet\.fetchRetry\(at\) : fetch\(at\)/g, ''), /(?<![\w.$])fetch\(/, f + ': a fetch not through fetchRetry');
  }
});

// index.html's head script, run on its own: mcScriptRetry and its importRetry (the tries counted per file, from the
// page's resource timing), with the page's globals stubbed
function head() {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const at = html.indexOf('window.mcScriptRetry = ');
  const a = html.lastIndexOf('<script>', at) + 8, b = html.indexOf('</script>', at);
  const listeners = [], logs = [];
  const window = { console: { info: (...a) => logs.push(a.join(' ')), warn: (...a) => logs.push('warn ' + a.join(' ')) }, setTimeout, Math, Promise, Set, Map, String, RegExp, Error, Object,
    location: { origin: 'http://x' }, performance: { now: () => 0 }, addEventListener: (t, f, c) => listeners.push({ t, f, c }), fetch: async () => ({ status: 200 }) };
  window.window = window;
  vm.runInNewContext(html.slice(a, b), window);
  return { H: window.mcScriptRetry, listeners, logs };
}
const fetchErr = (u) => new TypeError('Failed to fetch dynamically imported module: ' + u);

test("index.html importRetry: counted per file of the import's tree, not per import (each file busy twice deep in a tree still loads)", async () => {
  const { H, logs } = head();
  // (a tree a -> b -> c -> d, each busy twice: each try gets as far as the first busy file, 7 tries, more than 5)
  const files = ['b', 'c', 'd'], busy = new Map(files.map((f) => [f, 2])), log = [];
  let t = 0, tries = 0;
  const load = async () => {
    tries++;
    for (const f of files) if (busy.get(f) > 0) { busy.set(f, busy.get(f) - 1); log.push({ u: `http://x/${f}.js`, s: 503, t: ++t }); throw fetchErr('http://x/a.js'); }
    return { ok: 1 };
  };
  const waits = [];
  const m = await H.importRetry(load, 'a', { log, now: () => t, wait: async (ms) => waits.push(ms), gone: async () => false });
  assert.equal(m.ok, 1);
  assert.equal(tries, 7);
  assert.match(logs.at(-1), /recovered module a on try 7 \(was busy \/d\.js\)/);
  // (a file still busy after its fifth time is given up on)
  const log2 = []; let n = 0;
  await assert.rejects(H.importRetry(async () => { n++; log2.push({ u: 'http://x/b.js', s: 503, t: ++t }); throw fetchErr('http://x/a.js'); }, 'a', { log: log2, now: () => t, wait: async () => {}, gone: async () => false }), TypeError);
  assert.equal(n, 5);
});

test('index.html importRetry: stops on a file that is not there (its 404, or a HEAD of the module when no status was seen); never on a module that threw', async () => {
  const { H } = head();
  let t = 0, n = 0;
  const log = [];
  await assert.rejects(H.importRetry(async () => { n++; log.push({ u: 'http://x/b.js', s: 404, t: ++t }); throw fetchErr('http://x/a.js'); }, 'a', { log, now: () => t, wait: async () => {}, gone: async () => false }));
  assert.equal(n, 1);
  n = 0;
  await assert.rejects(H.importRetry(async () => { n++; throw fetchErr('http://x/a.js'); }, 'a', { log: [], now: () => 0, wait: async () => {}, gone: async (u) => u === 'http://x/a.js' }));
  assert.equal(n, 1);
  // (no status seen and the module there: 10 tries)
  n = 0;
  await assert.rejects(H.importRetry(async () => { n++; throw fetchErr('http://x/a.js'); }, 'a', { log: [], now: () => 0, wait: async () => {}, gone: async () => false }));
  assert.equal(n, 10);
  n = 0;
  await assert.rejects(H.importRetry(async () => { n++; throw new SyntaxError('x'); }, 'a', { log: [], wait: async () => {} }), SyntaxError);
  assert.equal(n, 1);
});

test('index.html: a stylesheet that did not load is caught too (the capture listener takes LINK rel=stylesheet); mcNet.importRetry is the head one', async () => {
  const { H, listeners } = head();
  assert.ok(listeners.some((l) => l.t === 'error' && l.c === true));
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /el\.tagName === 'LINK' && el\.href && \/\(\^\|\\s\)stylesheet\(\\s\|\$\)\/i\.test\(el\.rel\)/);
  // (the town's path before js/net-retry.js has run: the head's own)
  assert.match(html, /const net = \(load, label\) => \(window\.mcNet \|\| window\.mcScriptRetry\)\.importRetry\(load, label\);/);
  const { N } = load();
  const seen = [];
  const w = { console, setTimeout, clearTimeout, DOMException, Date, Math, Number, Promise, Set, Map, Error, Object, String, RegExp, mcScriptRetry: { importRetry: (l, lab) => { seen.push(lab); return l(); } } };
  w.window = w; w.globalThis = w;
  vm.runInNewContext(SRC, w);
  await w.mcNet.importRetry(() => Promise.resolve(1), 'm');
  assert.deepEqual(seen, ['m']);
  assert.equal(typeof H.importRetry, 'function'); assert.ok(N);
});

test('fetchRetry { network: false }: a network error thrown at once (a refused redirect, a CORS refusal); a busy answer still asked again', async () => {
  const { N } = load();
  const r = rig([new TypeError('Failed to fetch')]);
  await assert.rejects(N.fetchRetry('/s.json', { redirect: 'error' }, { ...r.cfg, network: false }), TypeError);
  assert.equal(r.calls.length, 1);
  const r2 = rig([503, 200]);
  assert.equal((await N.fetchRetry('/s.json', {}, { ...r2.cfg, network: false })).status, 200);
  assert.equal(r2.calls.length, 2);
});

test("importRetry() without the head: up to 10 tries, stopped by a HEAD of the module the error names saying it is not there", async () => {
  const { N } = load();
  let n = 0;
  await assert.rejects(N.importRetry(async () => { n++; throw fetchErr('http://x/a.js'); }, 'a', { sleep: async () => {}, fetch: async () => ({ status: 200 }) }));
  assert.equal(n, 10);
  n = 0;
  await assert.rejects(N.importRetry(async () => { n++; throw fetchErr('http://x/a.js'); }, 'a', { sleep: async () => {}, fetch: async () => ({ status: 404 }) }));
  assert.equal(n, 1);
});
