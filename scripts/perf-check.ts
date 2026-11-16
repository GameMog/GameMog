/**
 * How each machine runs the game (16 Nov, lib/perf.ts, POST /api/perf): what a report keeps and what it drops. The
 * browser's family and major only (never the full user-agent), the graphics card's name cleaned, every field checked, a
 * body of the wrong shape refused; the migration's tables the module's own; a load, its frames and its steps stored and
 * read back as the owner's Machines tab reads them (inside a transaction that is rolled back: nothing is left behind).
 */
import { readFileSync } from 'node:fs';
import { db } from '../lib/db.ts';
import { BINS, PERF_DDL, RATE_IP, RATE_SID, allowPerf, browserOf, cleanPerf, gpuName, histPct, perfAdmin, storePerf } from '../lib/perf.ts';

type Ok = (name: string, cond: boolean, detail?: string) => void;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0';

export async function runPerfChecks(ok: Ok) {
  console.log('\nmachine reports (lib/perf.ts)');
  ok('Edge is told from Chrome, its major only', JSON.stringify(browserOf(UA)) === '{"browser":"edge","bver":141}');
  ok('Firefox is Firefox', browserOf('Mozilla/5.0 (Windows NT 10.0; rv:145.0) Gecko/20100101 Firefox/145.0').browser === 'firefox');
  ok("a graphics card's ANGLE name is cleaned", gpuName('ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 (0x00002504) Direct3D11 vs_5_0 ps_5_0, D3D11)') === 'NVIDIA GeForce RTX 3060',
    String(gpuName('ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 (0x00002504) Direct3D11 vs_5_0 ps_5_0, D3D11)')));
  ok("an Apple chip's ANGLE name is cleaned", gpuName('ANGLE (Apple, ANGLE Metal Renderer: Apple M5, Unspecified Version)') === 'Apple M5',
    String(gpuName('ANGLE (Apple, ANGLE Metal Renderer: Apple M5, Unspecified Version)')));

  const sid = '0f3c6a1e-0000-4000-8000-000000000001';
  // (friends testing together share one address: six machines, each a load and ten minutes of play, all kept; one tab
  // reloading with other ?tier= values keeps its reports for many loads)
  {
    const t0 = 1e12;
    let kept = 0;
    for (let m = 0; m < 6; m++) for (let i = 0; i < 14; i++) kept += allowPerf('198.51.100.7', `rate-check-${m}`, t0 + i) ? 1 : 0;
    ok('six machines on one address keep their reports', kept === 84, String(kept));
    let one = 0;
    for (let i = 0; i < 200; i++) one += allowPerf(`198.51.100.${8 + (i % 200)}`, 'rate-check-reload', t0 + 1000 + i) ? 1 : 0;
    ok('a session keeps RATE_SID reports an hour', one === RATE_SID && RATE_SID >= 100 && RATE_IP >= 200, String(one));
    let full = 0;
    for (let i = 0; i < RATE_IP + 5; i++) full += allowPerf('198.51.100.250', `rate-check-full-${i}`, t0 + 2000 + i) ? 1 : 0;
    ok('an address stops at RATE_IP a window', full === RATE_IP, `${full}`);
  }
  const load = cleanPerf({
    v: 1, s: sid, n: 1, game: 'cold-harbor', k: 'load', engine: 'pkg', town: 'us-0643000', ua: 'leaked full user agent', ip: '203.0.113.9',
    marks: { ready: 8123.4, gate: 9000, dcl: 400, 'bad key!': 3 }, phases: { renderer: 120, gpu: 900 }, outcome: 'ready', errors: 0, lost: 0,
    browser: 'spoofed', os: 'windows', cores: 8, mem: 8, screen: '1920x1080', dpr: 1, backend: 'webgl2', backendWhy: 'firefox', cls: 'weak',
    gpu: { renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 770 (0x00004680) Direct3D11 vs_5_0 ps_5_0, D3D11)', vendor: 'intel' },
    tier: 'low', tierAuto: 'low', tierChoice: 'auto', why: 'webgl2', cpuMs: 7.2, stalls: 40, stallSecs: 13.27,
  }, UA) as Record<string, unknown> | null;
  ok('a load is kept', !!load && load.k === 'load');
  ok('a load keeps the browser from the header, never what the body says or the user-agent', load?.browser === 'edge' && load?.bver === 141 && !JSON.stringify(load).includes('leaked'));
  ok('a load keeps no address', !JSON.stringify(load).includes('203.0.113'));
  ok("a load's marks are checked", JSON.stringify((load?.data as { marks: unknown }).marks) === '{"ready":8123,"gate":9000,"dcl":400}');
  ok('a body of another shape is refused', cleanPerf({ v: 1, s: 'x', n: 1, k: 'load' }, UA) === null && cleanPerf({ v: 2, s: sid, n: 1, k: 'load' }, UA) === null && cleanPerf([], UA) === null);
  ok('a frames record needs its 24 bins', cleanPerf({ v: 1, s: sid, n: 1, k: 'frames', hist: [1, 2], frames: 3 }, UA) === null);
  const hist = new Array(BINS).fill(0); hist[8] = 100; hist[14] = 5;
  const frames = cleanPerf({ v: 1, s: sid, n: 1, k: 'frames', scene: 'pkg:car', tier: 'low', scale: 0.85, secs: 60, frames: 105, hist, long50: 5, long100: 0, stalls: 1, p50: 18, p95: 60, p99: 60 }, UA);
  const event = cleanPerf({ v: 1, s: sid, n: 1, k: 'event', kind: 'downgrade', tier: 'low', data: { what: 'scale', from: 1, to: 0.85, why: 'slow', p50: 26 } }, UA);
  ok('a frames record and a step are kept', !!frames && !!event);
  ok("a load keeps its stalls and their seconds", (load?.data as { stalls: unknown }).stalls === 40 && (load?.data as { stallSecs: unknown }).stallSecs === 13.3, JSON.stringify(load?.data));
  // (a machine under 4 fps: no frame under 250 ms in its window, only stalls; kept with 5 s of them, never with none)
  const zero = new Array(BINS).fill(0);
  const stalled = cleanPerf({ v: 1, s: sid, n: 1, k: 'frames', scene: 'ny:car', tier: 'low', scale: 0.7, secs: 0, frames: 0, hist: zero, stalls: 190, stallSecs: 63.4 }, UA) as Record<string, unknown> | null;
  ok("a window of only stalls is kept, with their seconds", !!stalled && stalled.frames === 0 && stalled.stalls === 190 && stalled.stallSecs === 63.4, JSON.stringify(stalled));
  ok('a window with no frames and under 5 s of stalls is refused', cleanPerf({ v: 1, s: sid, n: 1, k: 'frames', frames: 0, hist: zero, stalls: 3, stallSecs: 1.2 }, UA) === null
    && cleanPerf({ v: 1, s: sid, n: 1, k: 'frames', frames: 0, hist: zero }, UA) === null);
  ok("a frames window's stall seconds are bounded", (cleanPerf({ v: 1, s: sid, n: 1, k: 'frames', frames: 10, hist, stallSecs: 1e9 }, UA) as Record<string, unknown>)?.stallSecs === 3600);
  ok('the merged histogram has its percentiles', histPct(hist, 0.5) != null && histPct(hist, 0.99)! > histPct(hist, 0.5)!);

  const mig = readFileSync('deploy/migrate.mjs', 'utf8');
  ok("the migration's tables are the module's own", mig.includes('2026-11-16-perf-tables') && mig.includes(PERF_DDL.trim()));

  db.exec('BEGIN');
  try {
    storePerf(load as never, false);
    storePerf({ ...(load as object), data: { ...(load!.data as object) }, story: 9500 } as never, true);
    storePerf(frames!, false);
    storePerf(stalled as never, false);
    storePerf(event!, false);
    // (someone else's load, its frames: kept when the owner's are left out)
    const other = '0f3c6a1e-0000-4000-8000-000000000002';
    storePerf({ ...(load as object), sid: other, data: { ...(load!.data as object) } } as never, false);
    storePerf({ ...frames!, sid: other } as never, false);
    const a = perfAdmin('24h');
    const mine = a.sessions.find((x) => x.sid === sid);
    ok("the owner's Machines tab reads the load back, once", !!mine && a.sessions.filter((x) => x.sid === sid).length === 1, JSON.stringify(mine?.gpu));
    ok('a later report of the same load fills it in (and marks the owner)', mine?.storyMs === 9500 && mine?.owner === true);
    ok('its frames (a window of play, one of stalls) and its step are with it', mine?.windows.length === 2 && mine?.events[0]?.kind === 'downgrade' && mine?.p50 != null);
    ok('the machine is grouped by graphics card and browser', a.byMachine.some((g) => g.key === 'Intel(R) UHD Graphics 770 · edge 141'), a.byMachine.map((g) => g.key).join(' | '));
    ok("a session's stalls and their seconds are read back", mine?.stalls === 191 && mine?.stallSecs === 63 && mine?.windows.some((w) => w.stallSecs === 63.4) === true, `${mine?.stalls} ${mine?.stallSecs}`);
    const x = perfAdmin('24h', Date.now(), { excludeOwner: true });
    ok("the owner's own loads are left out on asking, their frames with them", x.ownerExcluded && !x.sessions.some((s) => s.sid === sid) && x.sessions.some((s) => s.sid === other)
      && x.kpis.loads === a.kpis.loads - 1 && x.byMachine.reduce((n, g) => n + g.n, 0) === a.byMachine.reduce((n, g) => n + g.n, 0) - 1, `${x.kpis.loads} of ${a.kpis.loads}`);
    ok('the groups count the stalls', a.byMachine.some((g) => g.stallSecs >= 63));
  } finally { db.exec('ROLLBACK'); }
}
