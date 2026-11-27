/**
 * The town builder's on-demand runs (lib/hometown-build/dispatch.ts): the dispatcher against a fake Render API on a
 * fake clock (how many runs it wants, idempotent starts that survive a restart of the web, the rate limit, 429/401
 * backoff, run states refreshed, pre-warm capped), the REST shapes it sends (an injected fetch: no port), the wait
 * estimate counting the runs it may start, and render.yaml (a workflow, no always-on worker, the web disk at 10 GB, every
 * switch off). Part of npm run check; on its own:
 *
 *   node --import ./scripts/ts-resolve.mjs scripts/hometown-dispatch-check.ts
 *
 * Offline: a temp directory, no server, no Python, no network.
 */
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BuildQueue, ANY_BUILD } from '../lib/hometown-build/queue.ts';
import { Dispatcher, RenderApiError, stateOf, renderRuns, runsConfig, runsReady, runsProblem, capacitySlots, STARTING_MAX_MS, RUN_MAX_MS, type RenderRuns, type RunsConfig } from '../lib/hometown-build/dispatch.ts';
import { admitPending, currentBuild, estimate, requestTown, townStatus, buildView, rekeyStale, servingBuild, BUILD_LEARN, type BuilderDeps } from '../lib/hometown-build/towns.ts';
import { deployStamp, webStamp } from '../lib/hometown-build/stamp.ts';
import { workerResponse } from '../lib/hometown-build/server.ts';
import { placeById } from '../lib/places/search.ts';
import { buildKey } from '../lib/hometown-tiles/keys.ts';
import { hometownConfig } from '../lib/hometown-tiles/config.ts';
import { TOWN_WORDS } from '../lib/hometown/words.ts';
import { TileStore, GB } from '../lib/hometown-tiles/store.ts';

type Ok = (name: string, cond: boolean, detail?: string) => void;
const B = 'htc-0.7.0-hg1-b0123abcd';

/** A fake of POST/GET /task-runs: idempotency keys, scripted failures, runs that end when told. */
class FakeRender implements RenderRuns {
  runs = new Map<string, { id: string; status: string; input: unknown[]; task: string }>();
  byKey = new Map<string, string>();
  posts = 0; gets = 0; failNext: number[] = [];
  async start(task: string, input: unknown[], idem: string) {
    this.posts++;
    const f = this.failNext.shift(); if (f) throw new RenderApiError(f, `HTTP ${f}`);
    const had = this.byKey.get(idem); if (had) return { id: had, status: this.runs.get(had)!.status };
    const id = `trn-${this.runs.size + 1}`;
    this.runs.set(id, { id, status: 'pending', input, task }); this.byKey.set(idem, id);
    return { id, status: 'pending' };
  }
  async get(id: string) { this.gets++; const r = this.runs.get(id); if (!r) throw new RenderApiError(404, 'no run'); return { id, status: r.status }; }
  /** the queue the runs claim from: an ended run that `claimed` has its worker row (run-<id>) at `build`, as a real one would */
  q: BuildQueue | null = null;
  end(status = 'completed', o: { claimed?: boolean; build?: string } = {}) {
    for (const r of this.runs.values()) if (r.status === 'pending' || r.status === 'running') {
      r.status = status;
      if (o.claimed !== false && this.q) this.q.db.prepare('INSERT OR IGNORE INTO workers (id, build, slots, seen) VALUES (?, ?, 4, 0)').run(`run-${r.id}`, o.build ?? B);
    }
  }
}

const cfgOf = (env: Record<string, string> = {}): RunsConfig => runsConfig({ HOMETOWN_RUNS: 'workflows', HOMETOWN_RENDER_API_KEY: 'rnd_fake', HOMETOWN_WORKFLOW_SLUG: 'gamemog-town-builder', ...env });
const jobs = (q: BuildQueue, n: number, prio: number, kind: 'tiles' | 'ctx' | 'regions' = 'tiles', from = 0) =>
  q.enqueueMany(Array.from({ length: n }, (_, i) => ({ key: `${kind}:${B}:${prio}:${from + i}`, kind, build: kind === 'regions' ? ANY_BUILD : B, prio,
    args: kind === 'tiles' ? { block: `hg1-conus/2/${100 + from + i}/${200 + prio}`, mask: 0xf } : { n: i }, weight: kind === 'regions' ? 2 : 1 })));

export async function runDispatchChecks(ok: Ok) {
  console.log('\nHometown builders on demand: Render Workflows runs started by the web (lib/hometown-build/dispatch.ts)');
  const dir = mkdtempSync(path.join(tmpdir(), 'hometown-dispatch-check-'));
  try {
    // ---- the switches
    const off = runsConfig({});
    ok('HOMETOWN_RUNS defaults off; workflows needs the key and the slug', off.mode === 'off' && !runsReady(off) && !runsReady(runsConfig({ HOMETOWN_RUNS: 'workflows' }))
      && runsProblem(runsConfig({ HOMETOWN_RUNS: 'workflows', HOMETOWN_WORKFLOW_SLUG: 'x' })) === 'HOMETOWN_RENDER_API_KEY is not set' && runsReady(cfgOf()));
    const c = cfgOf();
    ok('the task is <slug>/build_jobs; defaults 20 runs of 4 slots, 4 starts a minute, 4 for pre-warm', c.task === 'gamemog-town-builder/build_jobs' && c.maxRuns === 20 && c.slotsPerRun === 4 && c.startsPerMin === 4 && c.prewarmRuns === 4 && c.apiBase === 'https://api.render.com/v1');
    ok('a malformed task slug is refused (no request is ever built from it)', cfgOf({ HOMETOWN_RUN_TASK: 'a b/c' }).task === null);

    // ---- the plan
    let t = 1_000_000;
    const q = new BuildQueue({ file: path.join(dir, 'q.db'), now: () => t });
    const api = new FakeRender();
    api.q = q;
    let d = new Dispatcher(q, c, api, () => B, () => t);
    ok('an empty queue wants no run', d.plan().want === 0);
    await d.tick();
    ok('...and starts none', api.posts === 0);
    jobs(q, 3, 0);
    let p = d.plan();
    ok('3 small P0 jobs: one run (4 slots cover them)', p.ready === 3 && p.want === 1 && p.toStart === 1, JSON.stringify(p));
    await d.tick();
    ok('one run started: the task slug, a reason, an idempotency key', api.posts === 1 && api.runs.get('trn-1')?.task === 'gamemog-town-builder/build_jobs' && /^want 1/.test(String(api.runs.get('trn-1')?.input[0])) && d.inFlight() === 1);
    await d.tick();
    ok('a second pass with the run in flight starts nothing more', api.posts === 1);
    jobs(q, 60, 0, 'tiles', 100);
    p = d.plan();
    ok('60 more P0 quads (2 units of 2 s each: 252 s of P0 work): byJobs 16, byWork 2 (P0 sized to drain in 60 s on 4 slots), want the smaller', p.byJobs === 16 && p.byWork === 2 && p.want === 2, JSON.stringify(p));
    jobs(q, 540, 0, 'tiles', 200);
    p = d.plan();
    // (the ready jobs are counted only as far as a decision needs: MAX_RUNS x slots + 1; more cannot change want)
    ok('600 P0 quads (2,412 s of work): want 11 runs (byWork), under HOMETOWN_MAX_RUNS', p.want === 11 && p.byWork === 11 && p.ready === 81 && p.byJobs > p.want, JSON.stringify(p));
    await d.tick();
    ok('starts are rate limited: 4 a rolling minute (Hobby: 16 new CPU a minute)', api.posts === 4 && d.inFlight() === 4, `${api.posts}`);
    t += 61_000;
    await d.tick();
    ok('the next minute: 4 more', d.inFlight() === 8, `${d.inFlight()}`);
    t += 61_000;
    await d.tick();
    ok('then the rest it wants, never over it', d.inFlight() === 11, `${d.inFlight()}`);
    ok('HOMETOWN_MAX_RUNS caps the want', new Dispatcher(q, cfgOf({ HOMETOWN_MAX_RUNS: '6' }), api, () => B, () => t).plan().want === 6);

    // ---- run states: refreshed every 30 s; ended runs leave room
    api.end('completed');
    t += 31_000;
    const g1 = api.gets;
    await d.tick();
    ok('ended runs are seen (GET /task-runs/{id}, at most 10 a pass) and new ones start within the rate limit', api.gets - g1 === 10 && d.rows(['completed']).length === 10 && d.inFlight() >= 1 && d.inFlight() <= 4 + 1, `gets ${api.gets - g1}, in flight ${d.inFlight()}`);
    // drain the queue: every job done
    q.db.prepare("UPDATE jobs SET state = 'done'").run();
    api.end('completed'); t += 61_000; await d.tick(); t += 31_000; await d.tick();
    ok('nothing ready: no new run, every run seen ended (scale to zero)', d.inFlight() === 0 && d.plan().want === 0, JSON.stringify(d.status().byState));

    // ---- a run whose worker went quiet is checked within 5 s, not 30
    jobs(q, 2, 0, 'ctx', 900);
    t += 61_000; await d.tick();
    const quietRun = d.rows(['pending'])[0];
    t += 95_000; api.end('completed'); const g0 = api.gets;
    q.db.prepare("INSERT OR REPLACE INTO workers (id, build, slots, seen) VALUES (?, ?, 4, ?)").run(`run-${quietRun.id}`, B, t - 60_000);
    q.db.prepare('UPDATE runs SET checked = ? WHERE idem = ?').run(t - 6_000, quietRun.idem);
    await d.tick();
    ok('a run whose worker has not claimed for 25 s is re-read at once (an idle run that returned)', api.gets > g0 && d.rows(['completed']).some((r) => r.idem === quietRun.idem));
    q.db.prepare("UPDATE jobs SET state = 'done'").run(); api.end(); t += 61_000; await d.tick();

    // ---- idempotent across a restart of the web: the row is written before the POST
    jobs(q, 1, 0, 'ctx', 950);
    t += 61_000;
    api.failNext = [503];
    await d.tick();
    const starting = d.rows(['starting']);
    ok('a POST that fails (503) leaves its row "starting" and backs off 15 s', starting.length === 1 && d.status().holdS === 15 && d.status().lastError?.status === 503);
    // the web restarts: a new dispatcher on the same queue.db re-sends the SAME key
    d = new Dispatcher(q, c, api, () => B, () => t);
    t += 16_000;
    await d.tick();
    const sent = d.rows().find((r) => r.idem === starting[0].idem)!;
    ok('after a restart the same idempotency key is re-sent and recorded (no duplicate row)', sent.state === 'pending' && !!sent.id && d.inFlight() === 1, JSON.stringify(sent));
    const before = api.runs.size;
    q.db.prepare("UPDATE runs SET state = 'starting' WHERE idem = ?").run(sent.idem);
    await d.tick();
    ok('re-sending a key Render already took answers the original run (no second run)', api.runs.size === before && d.rows().find((r) => r.idem === sent.idem)!.id === sent.id);
    q.db.prepare("UPDATE jobs SET state = 'done'").run(); api.end(); t += 61_000; await d.tick();

    // ---- 429 and 401
    jobs(q, 1, 0, 'ctx', 970);
    t += 61_000; api.failNext = [429];
    await d.tick();
    ok('429 (Hobby: 50 run starts a minute): wait 60 s, keep the row to re-send', d.status().holdS === 60 && d.rows(['starting']).length === 1);
    t += 61_000; api.failNext = [401];
    await d.tick();
    ok('401 (a wrong key): the row is dropped and starting waits 5 minutes; the status says why', d.status().holdS === 300 && d.rows(['starting']).length === 0 && d.status().lastError?.status === 401);
    t += 301_000; await d.tick();
    ok('after the hold a run is started again', d.inFlight() === 1);
    q.db.prepare("UPDATE jobs SET state = 'done'").run(); api.end(); t += 61_000; await d.tick();

    // ---- the breaker: runs that end without claiming at the current build are not started again and again
    const fruitless = async (o: { claimed?: boolean; build?: string }) => {
      for (let i = 0; i < 3; i++) { jobs(q, 1, 0, 'ctx', 4000 + i * 10 + api.runs.size); t += 61_000; await d.tick(); api.end('completed', o); t += 31_000; q.db.prepare('UPDATE runs SET checked = 0').run(); await d.tick(); }
    };
    q.db.prepare("UPDATE jobs SET state = 'done'").run(); api.end(); t += 61_000; await d.tick();
    await fruitless({ claimed: false });
    let n0 = api.posts; t += 61_000; await d.tick();
    ok('breaker: 3 runs in a row that never claimed (paused, refused, failed at start): no 4th run while work is ready; the status says why', api.posts === n0 && d.inFlight() === 0 && d.plan().ready > 0
      && /without claiming/.test(d.status().lastError?.message ?? ''), d.status().lastError?.message);
    t += 10 * 60_000 + 1; await d.tick();
    ok('breaker: after 10 minutes ONE probe run', api.posts === n0 + 1 && d.inFlight() === 1);
    api.end('completed', { claimed: false }); t += 31_000; q.db.prepare('UPDATE runs SET checked = 0').run(); await d.tick(); n0 = api.posts; t += 61_000; await d.tick();
    ok('breaker: a probe that claims nothing holds again', api.posts === n0);
    q.db.prepare("UPDATE jobs SET state = 'done'").run(); t += 11 * 60_000; await d.tick();
    await fruitless({ build: 'htc-0.7.0-hg1-b0000ffff' });
    n0 = api.posts; t += 61_000; await d.tick();
    ok('breaker: runs of another build (a workflow redeploy before HOMETOWN_BUILD was set) hold too, naming that build', api.posts === n0 && /b0000ffff.*set HOMETOWN_BUILD/.test(d.status().lastError?.message ?? ''), d.status().lastError?.message);
    q.db.prepare("UPDATE jobs SET state = 'done'").run(); t += 11 * 60_000; await d.tick();
    await fruitless({});
    ok('breaker: runs that claimed at the current build never hold', api.posts > n0 + 2 && d.inFlight() >= 1, `${api.posts - n0}`);
    q.db.prepare("UPDATE jobs SET state = 'done'").run(); api.end(); t += 61_000; await d.tick();

    ok('a run status Render may add later counts as live, never as ended (no replacement started for it)', stateOf('queued') === 'running' && stateOf('succeeded') === 'succeeded' && stateOf('sleeping') === 'sleeping');

    // ---- pre-warm: P5 only is capped at HOMETOWN_PREWARM_RUNS, and never runs behind a deps chain
    jobs(q, 200, 5, 'tiles', 20000);
    p = d.plan();
    ok('200 pre-warm (P5) jobs: sized on 10x the target (one run)', !p.interactive && p.want === 1, JSON.stringify(p));
    jobs(q, 2800, 5, 'tiles', 30000);
    p = d.plan();
    ok('3,000 pre-warm jobs: at most HOMETOWN_PREWARM_RUNS (4) runs while nothing interactive waits', !p.interactive && p.byWork === 5 && p.want === 4, JSON.stringify(p));
    q.enqueue({ key: `tiles:${B}:dep`, kind: 'tiles', build: B, prio: 0, args: { block: 'hg1-conus/2/1/1', mask: 1 }, deps: ['regions:not-done'] });
    ok('a job waiting on its deps is not ready (it never starts a run on its own)', d.plan().interactive === false);
    q.db.prepare("UPDATE jobs SET state = 'done'").run();
    ok('jobs of another build are not counted (runs claim by build)', (() => { jobs(q, 3, 0, 'ctx', 3000); q.db.prepare("UPDATE jobs SET build = 'htc-0.6.0-hg1-b99999999' WHERE state = 'queued'").run(); return d.plan().ready === 0; })());
    q.close();

    // ---- no build known yet (no HOMETOWN_BUILD, no run ever): a pick starts ONE run to learn it; then the last run's build
    {
      let t2 = 9_000_000;
      const q2 = new BuildQueue({ file: path.join(dir, 'probe.db'), now: () => t2 });
      const api2 = new FakeRender(); api2.q = q2;
      const hc2 = hometownConfig({ HOMETOWN_DIR: path.join(dir, 'probe'), HOMETOWN_DATA_DIR: path.join(dir, 'probe', 'data'), HOMETOWN_BUILDER: 'on', HOMETOWN_FRAME: 'on' });
      const deps2: BuilderDeps = { cfg: hc2, store: new TileStore({ root: hc2.root, capBytes: GB, minFreeBytes: 0, freeBytes: () => 100 * GB, log: () => {} }), queue: q2, now: () => t2,
        place: (id) => (id === 'us-4007500' ? { placeId: id, name: 'Boley', state: 'OK', stateName: 'Oklahoma', geoid: '4007500', lat: 35.4917, lon: -96.4836, bbox: [-96.5, 35.48, -96.47, 35.5], pop: 1184 } as never : null) };
      const d2 = new Dispatcher(q2, cfgOf(), api2, () => currentBuild(deps2), () => t2);
      await d2.tick();
      ok('no build known and nothing asked: no run', api2.posts === 0 && currentBuild(deps2) === null);
      const a = requestTown(deps2, 'us-4007500', '1.2.3.4');
      await d2.tick();
      // (before: a 503 with retryS 15, and the Create card asked again 15 s later; the live Wewoka pick reached 'framing'
      // at 15.9 s for exactly that round trip)
      ok('a pick with no build known is kept and answered 202 at once (waiting its turn, no retry round trip), and starts ONE run to learn the build',
        a.status === 202 && (a.body as { phase?: string }).phase === 'asked' && (a.body as { retryS?: number }).retryS === undefined && api2.posts === 1 && /learn the build/.test(String(api2.runs.get('trn-1')?.input[0])) && d2.inFlight() === 1);
      ok('...its status is waiting too (GET), not "not asked"', townStatus(deps2, 'us-4007500').status === 202);
      await d2.tick();
      ok('...only one run while it is in flight', api2.posts === 1);
      q2.claim({ worker: 'run-trn-1', build: B, freeSlots: 4, totalSlots: 4 });
      ok('its first claim reports the build: the kept pick is admitted at it', currentBuild(deps2) === B && admitPending(deps2) === 1 && q2.jobsOf('us-4007500').length > 0 && requestTown(deps2, 'us-4007500', '1.2.3.4').status === 202);
      api2.end('completed'); t2 += 120_000;
      ok('the run ended (no live builder): the build is still the last run\'s', q2.liveWorkers().length === 0 && currentBuild(deps2) === B);
      q2.db.prepare("UPDATE jobs SET state = 'done'").run(); q2.db.prepare('UPDATE runs SET checked = 0').run(); await d2.tick();
      const n = api2.posts; t2 += 61_000; await d2.tick();
      ok('with the build known the probe never starts again', api2.posts === n && !d2.plan().probe);
      // (runs switched on but none can start: no Render API key, as on the first sync of a Blueprint, which ignores new
      // sync: false keys): a new town is refused at once with no retryS; a town built in full is still served
      const down: BuilderDeps = { ...deps2, runsDown: runsProblem(runsConfig({ HOMETOWN_RUNS: 'workflows', HOMETOWN_WORKFLOW_SLUG: 'gamemog-town-builder' })) };
      const r1 = requestTown(down, 'us-4007500', '9.9.9.9');
      ok('runs that cannot start: a new pick is refused at once (503, no retryS, the closed words), nothing is queued', r1.status === 503 && (r1.body as { retryS?: number }).retryS === undefined && r1.body.error === TOWN_WORDS.closed && down.runsDown === 'HOMETOWN_RENDER_API_KEY is not set');
      q2.db.prepare("UPDATE towns SET state = 'full' WHERE place = 'us-4007500'").run();
      ok('...but a town built in full is not refused', requestTown(down, 'us-4007500', '9.9.9.9').status !== 503);
      q2.close();
    }

    await learnChecks(ok, dir);

    // ---- orphaned rows: a 'starting' row whose POST never went through, behind 500 newer rows and a held start
    {
      let t3 = 50_000_000;
      const q3 = new BuildQueue({ file: path.join(dir, 'orphans.db'), now: () => t3 });
      const api3 = new FakeRender(); api3.q = q3;
      const d3 = new Dispatcher(q3, cfgOf(), api3, () => B, () => t3);
      const ins = q3.db.prepare('INSERT INTO runs (idem, id, state, created, updated) VALUES (?, ?, ?, ?, ?)');
      ins.run('ht-orphan', null, 'starting', t3, t3);
      ins.run('ht-ancient', 'trn-old', 'running', t3 - RUN_MAX_MS - 1, t3);
      for (let i = 0; i < 600; i++) ins.run(`ht-ended-${i}`, `trn-e${i}`, 'completed', t3 + 1 + i, t3);
      t3 += STARTING_MAX_MS + 1;
      ok('(the orphan is counted in flight, hidden behind 600 newer rows)', d3.inFlight() === 2);
      // (a held start: before, pass() stopped at the first held 'starting' row and never retired it)
      (d3 as unknown as { holdUntil: number }).holdUntil = t3 + 300_000;
      await d3.tick();
      const st = (k: string) => (q3.db.prepare('SELECT state FROM runs WHERE idem = ?').get(k) as { state: string }).state;
      ok('orphaned rows are reaped in one indexed update on every pass, even while starts are held: a never-sent "starting" row after 10 min and a run older than a run can be', st('ht-orphan') === 'lost' && st('ht-ancient') === 'lost' && d3.inFlight() === 0);
      ok('...and the reap is journalled for the owner\'s page', q3.recentEvents(5).some((e) => e.kind === 'runs-reaped'));
      q3.close();
    }

    // ---- the plan stays cheap on a deep queue (it runs every 5 s and on every queue change)
    {
      const q4 = new BuildQueue({ file: ':memory:', now: () => 1 });
      const d4 = new Dispatcher(q4, cfgOf(), new FakeRender(), () => B, () => 1);
      q4.enqueueMany(Array.from({ length: 20_000 }, (_, i) => ({ key: `tiles:${B}:deep:${i}`, kind: 'tiles' as const, build: B, prio: 1 + (i % 3), args: { block: `hg1-conus/2/${i}/7`, mask: 0xffff }, deps: [i % 2 ? 'ctx:none' : `tiles:${B}:deep:${i - 1}`] })));
      d4.plan();
      const t0 = performance.now(); for (let i = 0; i < 5; i++) d4.plan(); const ms = (performance.now() - t0) / 5;
      const p4 = d4.plan();
      const qp = JSON.stringify(q4.db.prepare(`EXPLAIN QUERY PLAN SELECT state, build, kind, prio, SUM(COALESCE(units, 1)) u, SUM(weight) w FROM jobs WHERE state IN ('queued', 'leased') AND build IN (?, ?) GROUP BY state, build, kind, prio`).all(B, ANY_BUILD));
      ok(`plan() over 20,000 queued jobs, none ready (its worst case), takes ${ms.toFixed(1)} ms on this machine: the work summed in SQL over the plan index (no row parsed in JS; before about 200-330 ms)`, /jobs_plan/.test(qp) && !/TEMP B-TREE/.test(qp) && ms < 2000 && p4.ready === 0 && p4.workMs === Math.round(20_000 * 5 * 2_000), JSON.stringify(p4));
      ok('the plan index exists, and every job carries its cost units', !!q4.db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'jobs_plan'").get() && (q4.db.prepare('SELECT COUNT(*) n FROM jobs WHERE units IS NULL').get() as { n: number }).n === 0);
      q4.close();
    }

    // ---- the REST shapes (fetch injected: no socket)
    const seen: { url: string; method: string; body: unknown; auth: string | null }[] = [];
    const fakeFetch = (async (url: string | URL | Request, init?: RequestInit) => {
      seen.push({ url: String(url), method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : null, auth: new Headers(init?.headers).get('authorization') });
      return new Response(JSON.stringify({ id: 'trn-abc', status: 'pending', taskId: 'tsk-1' }), { status: 202 });
    }) as typeof fetch;
    const r = renderRuns({ apiBase: 'https://api.render.com/v1', apiKey: 'rnd_fake' }, fakeFetch);
    const got = await r.start('gamemog-town-builder/build_jobs', ['why'], 'ht-1');
    await r.get('trn-abc');
    ok('POST /v1/task-runs {task, input, idempotencyKey} with the bearer key; GET /v1/task-runs/{id}', got.id === 'trn-abc' && seen[0].url === 'https://api.render.com/v1/task-runs' && seen[0].method === 'POST'
      && JSON.stringify(seen[0].body) === JSON.stringify({ task: 'gamemog-town-builder/build_jobs', input: ['why'], idempotencyKey: 'ht-1' }) && seen[0].auth === 'Bearer rnd_fake' && seen[1].url === 'https://api.render.com/v1/task-runs/trn-abc' && seen[1].method === 'GET');
    const bad = renderRuns({ apiBase: 'x', apiKey: 'k' }, (async () => new Response('{"message":"nope"}', { status: 429 })) as typeof fetch);
    ok('an HTTP error becomes RenderApiError with its status', await bad.get('x').then(() => false, (e) => e instanceof RenderApiError && e.status === 429));

    // ---- the wait estimate counts the runs it may start (plus their spin-up when none is live)
    ok('capacity: off -> the live slots; on -> max(live, runs x slots), spin-up only when nothing is live', capacitySlots(3, null).slots === 3 && capacitySlots(0, cfgOf()).slots === 80 && capacitySlots(0, cfgOf()).spinupS === 45 && capacitySlots(8, cfgOf()).spinupS === 0);
    const tt = { now: 5_000_000 };
    const hc = hometownConfig({ HOMETOWN_DIR: path.join(dir, 'est'), HOMETOWN_DATA_DIR: path.join(dir, 'est', 'data'), HOMETOWN_BUILD: B, HOMETOWN_BUILDER: 'on', HOMETOWN_FRAME: 'on' });
    const dq = new BuildQueue({ file: path.join(dir, 'est.db'), now: () => tt.now });
    const deps: BuilderDeps = { cfg: hc, store: new TileStore({ root: hc.root, capBytes: GB, minFreeBytes: 0, freeBytes: () => 100 * GB, log: () => {} }), queue: dq, now: () => tt.now };
    jobs(dq, 400, 0, 'tiles', 5000);
    const e0 = estimate(deps, '\u0000new', B), e1 = estimate({ ...deps, runs: cfgOf() }, '\u0000new', B);
    ok('400 queued quads: with on-demand runs the wait counts 80 slots (+45 s spin-up), not 1', e1.slots === 80 && e1.etaDriveS! < e0.etaDriveS! && e0.slots === 0, `${e0.etaDriveS} s vs ${e1.etaDriveS} s`);
    dq.close();

    // ---- render.yaml: the builder is a workflow, the web disk stays 10 GB, every switch off
    const y = readFileSync('render.yaml', 'utf8');
    const wf = y.slice(y.indexOf('- type: workflow'));
    ok('render.yaml: no always-on worker; one workflow gamemog-town-builder, python, virginia, the build script, the task file', !/- type: worker/.test(y) && /- type: workflow\n\s+name: gamemog-town-builder\n\s+runtime: python\n/.test(wf) && /region: virginia/.test(wf)
      && /buildCommand: pip install -r deploy\/town-builder\/workflow-requirements.txt && bash deploy\/town-builder\/workflow-build.sh/.test(wf) && /startCommand: python deploy\/town-builder\/workflow.py/.test(wf));
    ok('render.yaml: Python pinned for the buildId; the web reached by hostport; the token from the web; paused is the owner\'s', /key: PYTHON_VERSION\n\s+value: "3\.\d+\.\d+"/.test(wf) && /property: hostport/.test(wf) && /envVarKey: HOMETOWN_WORKER_TOKEN/.test(wf) && /key: HOMETOWN_WORKER_PAUSED\n\s+sync: false/.test(wf));
    ok('render.yaml: the web disk stays 10 GB (grown on demand: a documented one-line change)', /sizeGB: 10\n/.test(y) && /change\n\s+# sizeGB to 20 here/.test(y));
    // (the owner, 13 Nov: "switch the builder on, full visibility to everyone": the live test)
    ok('render.yaml: the builder on for everyone (HOMETOWN_BUILDER on, HOMETOWN_RUNS workflows, HOMETOWN_TILES on, the town box and Story Kit on); the secrets sync: false; the slug from the workflow',
      /key: HOMETOWN_RUNS\n\s+value: "workflows"/.test(y) && /key: HOMETOWN_BUILDER\n\s+value: "on"/.test(y) && /key: HOMETOWN_TILES\n\s+value: "on"/.test(y)
      && /key: NEXT_PUBLIC_HOMETOWN_SEARCH\n\s+value: "on"/.test(y) && /key: STORYKIT\n\s+value: "on"/.test(y) && /key: HOMETOWN_COMPILE\n\s+value: "off"/.test(y)
      && /key: HOMETOWN_DAILY_COLD\n\s+value: "\d+"/.test(y) && !/key: HOMETOWN_TOWNS\b/.test(y) && !/key: HOMETOWN_RENDER_API\n/.test(y)
      && ['HOMETOWN_RENDER_API_KEY', 'HOMETOWN_ADMIN_TOKEN', 'ADMIN_PASSWORD', 'HOMETOWN_BUILD'].every((k) => new RegExp(`key: ${k}\\n\\s+sync: false`).test(y))
      // (the worker token is generated by Render: a Blueprint update ignores new sync: false keys, so a typed-in token
      // would never reach an existing service; generateValue adds it on the first sync and keeps one already there)
      && /key: HOMETOWN_WORKER_TOKEN\n\s+generateValue: true/.test(y)
      && /key: HOMETOWN_WORKFLOW_SLUG\n\s+fromService:\n\s+type: workflow\n\s+name: gamemog-town-builder\n\s+property: slug/.test(y));
    const wb = readFileSync('deploy/town-builder/workflow-build.sh', 'utf8');
    ok('workflow-build.sh pins compiler 0.15.0 by SHA, falls back to its branch, and takes the OSM table from the compiler commit',
      /^MOGCITY_SHA=4aed19f0e54476942d73477184d9a50adfa87a96$/m.test(wb) && /MOGCITY_REF="\$\{HOMETOWN_MOGCITY_REF:-hometown-compiler\}"/.test(wb) && /"\$HT\/osm\/osm-roads-us\.parquet"/.test(wb));
    const PY_VER = /key: PYTHON_VERSION\n\s+value: "([0-9.]+)"/.exec(wf)?.[1];
    const lock = readFileSync('deploy/town-builder/requirements.lock', 'utf8');
    ok('the pinned Python is a CPython 3.14 (the lock\'s wheels) and the build script refuses any other', !!PY_VER?.startsWith('3.14.') && /CPython 3\.14/.test(lock) && /Python \$have is not the pinned \$PYTHON_VERSION/.test(readFileSync('deploy/town-builder/workflow-build.sh', 'utf8')));
    const wfPy = readFileSync('deploy/town-builder/workflow.py', 'utf8');
    ok('workflow.py registers build_jobs with the plan, a timeout over the cap, and one retry', /@app\.task\(name='build_jobs', plan=PLAN, timeout_seconds=TIMEOUT_S,/.test(wfPy) && /max_retries=1/.test(wfPy) && /app\.start\(\)/.test(wfPy));
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let failed = 0;
  await runDispatchChecks((name, cond, detail) => { if (!cond) failed++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`); });
  process.exit(failed ? 1 : 0);
}

/**
 * A workflow redeploy (a compiler upgrade) with HOMETOWN_BUILD empty (14 Nov): the web learns the new deploy's build by
 * itself (one run at boot), never admits a town at a build no live or startable run can claim, and moves a town left at
 * the old build to the new one; a pinned build on an empty store still stages its regions at the pick.
 */
async function learnChecks(ok: Ok, dir: string) {
  // the deploy stamp: the same bytes as worker.py deploy_stamp (deploy/town-builder/test_worker.py has the same vector)
  const sv = path.join(dir, 'stamp'); mkdirSync(path.join(sv, 'sub'), { recursive: true });
  writeFileSync(path.join(sv, 'a.sh'), 'echo a\n'); writeFileSync(path.join(sv, 'b.py'), 'print(1)\n');
  writeFileSync(path.join(sv, '.hidden'), 'x'); writeFileSync(path.join(sv, 'sub', 'c.txt'), 'y'); writeFileSync(path.join(sv, 'old.pyc'), 'z');
  ok('the deploy stamp hashes the top-level files by name and bytes (dot files, .pyc and folders skipped), as worker.py does', deployStamp(sv) === 'b4b09477bf5abee9', String(deployStamp(sv)));
  ok('the web\'s stamp is its own deploy/town-builder\'s, HOMETOWN_DEPLOY_STAMP sets it, off switches it off',
    webStamp({}) === deployStamp(path.join(process.cwd(), 'deploy', 'town-builder')) && !!webStamp({}) && webStamp({ HOMETOWN_DEPLOY_STAMP: 'ab'.repeat(8) }) === 'ab'.repeat(8) && webStamp({ HOMETOWN_DEPLOY_STAMP: 'off' }) === null);

  const OLD = 'htc-0.8.0-hg1-b0000aaaa', NEW = 'htc-0.9.0-hg1-b1111bbbb', S_OLD = '0'.repeat(16), S_NEW = '1'.repeat(16);
  let t = 20_000_000;
  const q = new BuildQueue({ file: path.join(dir, 'learn.db'), now: () => t });
  const api = new FakeRender(); api.q = q;
  const hc = hometownConfig({ HOMETOWN_DIR: path.join(dir, 'learn'), HOMETOWN_DATA_DIR: path.join(dir, 'learn', 'data'), HOMETOWN_BUILDER: 'on', HOMETOWN_FRAME: 'on' });
  const deps: BuilderDeps = { cfg: hc, store: new TileStore({ root: hc.root, capBytes: GB, minFreeBytes: 0, freeBytes: () => 100 * GB, log: () => {} }), queue: q, now: () => t, place: (id) => placeById(id), stamp: S_NEW };
  // (before the redeploy: runs of the old deploy built Okemah in full at the old build)
  q.seenWorker({ worker: 'run-before', build: OLD, freeSlots: 4, totalSlots: 4, deploy: S_OLD });
  q.db.prepare("INSERT INTO towns (place, build, box, state, first_asked, tiles_total, tiles_done, asks, source, meta) VALUES ('us-4054200', ?, '[]', 'full', ?, 1, 1, 1, 'player', '{}')").run(OLD, t);
  t += 3_600_000;
  const v0 = buildView(deps);
  ok('after a workflow redeploy no run of the new deploy has reported: the build is NOT learned and none is current (the old one is only stale)', !v0.learned && v0.build === null && v0.stale === OLD && currentBuild(deps) === null);
  const d = new Dispatcher(q, cfgOf(), api, () => currentBuild(deps), () => t);
  d.learning = () => !buildView(deps).learned;
  q.log(BUILD_LEARN, { stamp: S_NEW });   // (server.ts builderDeps logs this at boot)
  await d.tick();
  ok('at boot, before any pick, ONE run is started to learn the new build (no manual build_jobs run)', api.posts === 1 && /learn the build \(a new workflow deploy\)/.test(String(api.runs.get('trn-1')?.input[0])) && !!d.lastPlan?.probe);
  await d.tick();
  ok('...only one while it is in flight', api.posts === 1);
  // (the workflow is still rebuilding: that run is of the OLD deploy; it claims, reports the old build, finds nothing, ends)
  q.claim({ worker: 'run-trn-1', build: OLD, freeSlots: 4, totalSlots: 4, deploy: S_OLD });
  ok('a run of the old deploy does not make its build the learned one', !buildView(deps).learned && currentBuild(deps) === OLD);
  api.end('completed', { build: OLD }); t += 60_000; q.db.prepare('UPDATE runs SET checked = 0').run(); await d.tick();
  ok('a probe that reported the old deploy is not followed by another at once (one every 2 minutes while learning)', api.posts === 1 && currentBuild(deps) === null, `posts ${api.posts}`);
  t += 70_000; await d.tick();
  ok('...but 2 minutes on, one more', api.posts === 2);
  // a town built in full at the old build plays at once while the new build is learned; a new town is kept, not admitted old
  const okemah = requestTown(deps, 'us-4054200', '1.1.1.1');
  ok('while learning, a town built in full at the old build is served at once (never kept waiting for a run)',
    !q.db.prepare("SELECT 1 FROM pending WHERE place = 'us-4054200'").get() && servingBuild(deps, 'us-4054200') === OLD && okemah.status !== 503, JSON.stringify(okemah).slice(0, 200));
  const boley = requestTown(deps, 'us-4007500', '1.1.1.2');
  ok('while learning with no run live, a new town is kept (202), NOT admitted at the old build no run may claim again',
    boley.status === 202 && !!q.db.prepare("SELECT 1 FROM pending WHERE place = 'us-4007500'").get() && !q.db.prepare("SELECT 1 FROM towns WHERE place = 'us-4007500'").get());
  // (run 2 is of the old deploy too, and live: it CAN claim the old build, so the kept pick is admitted at it and built)
  q.claim({ worker: 'run-trn-2', build: OLD, freeSlots: 4, totalSlots: 4, deploy: S_OLD });
  ok('a LIVE run of the old deploy admits the kept pick at its build (it can claim it now)', admitPending(deps) === 1 && !!q.db.prepare("SELECT 1 FROM towns WHERE place = 'us-4007500' AND build = ?").get(OLD) && rekeyStale(deps) === 0);
  api.end('completed', { build: OLD }); t += 60_000;
  ok('when that run is gone and the build is still unlearned, the town is not moved (no learned build to move it to)', rekeyStale(deps) === 0);
  // (a story was published on Okemah's spawn district at the old build: a growing town)
  q.db.prepare("UPDATE towns SET state = 'growing', meta = ? WHERE place = 'us-4054200' AND build = ?").run(JSON.stringify({ district: { tilesId: 'c'.repeat(64), variant: 'district-1-2' } }), OLD);
  // (the new deploy is live: its first run claims and reports the new build with the web's stamp)
  q.claim({ worker: 'run-trn-3', build: NEW, freeSlots: 4, totalSlots: 4, deploy: S_NEW });
  const v1 = buildView(deps);
  ok('a run of the web\'s own deploy reports the build: learned, current, the boot probe stops', v1.learned && v1.build === NEW && currentBuild(deps) === NEW && !d.learning());
  const moved = rekeyStale(deps);
  const oldJobs = q.db.prepare("SELECT COUNT(*) n FROM jobs WHERE build = ? AND state != 'done'").get(OLD) as { n: number };
  ok('the towns left at the old build move to the learned one (a building town whole; its old jobs dropped)',
    moved === 2 && !q.db.prepare("SELECT 1 FROM towns WHERE place = 'us-4007500' AND build = ?").get(OLD) && !!q.db.prepare("SELECT 1 FROM towns WHERE place = 'us-4007500' AND build = ?").get(NEW)
      && q.jobsOf('us-4007500').every((j) => j.build === NEW || j.build === ANY_BUILD) && oldJobs.n === 0, `moved ${moved}, old jobs ${oldJobs.n}`);
  const g = q.db.prepare("SELECT meta FROM towns WHERE place = 'us-4054200' AND build = ?").get(OLD) as { meta: string } | undefined;
  ok('...a playable town keeps its old row and district (a story pinned to it plays it) and is built whole at the new build',
    !!g && JSON.parse(g.meta).movedTo === NEW && !!JSON.parse(g.meta).district && !!q.db.prepare("SELECT 1 FROM towns WHERE place = 'us-4054200' AND build = ?").get(NEW));
  ok('...and only once', rekeyStale(deps) === 0);
  t += 120_000; q.db.prepare('UPDATE runs SET checked = 0').run(); api.end('completed', { build: NEW });
  const n = api.posts; await d.tick();
  ok('with the build learned no probe starts; the moved towns\' work starts runs of the new build', !d.lastPlan?.probe && (d.lastPlan?.ready ?? 0) > 0 && api.posts > n, JSON.stringify(d.lastPlan));
  q.close();

  // ---- a pinned build on an empty store: the pick queues its regions jobs (no build record yet: the release is the run's)
  {
    let t2 = 30_000_000;
    const q2 = new BuildQueue({ file: path.join(dir, 'pinned.db'), now: () => t2 });
    const hc2 = hometownConfig({ HOMETOWN_DIR: path.join(dir, 'pinned'), HOMETOWN_DATA_DIR: path.join(dir, 'pinned', 'data'), HOMETOWN_BUILDER: 'on', HOMETOWN_FRAME: 'on', HOMETOWN_BUILD: NEW, HOMETOWN_WORKER_TOKEN: 'w'.repeat(40) });
    const store2 = new TileStore({ root: hc2.root, capBytes: GB, minFreeBytes: 0, freeBytes: () => 100 * GB, log: () => {} });
    const deps2: BuilderDeps = { cfg: hc2, store: store2, queue: q2, now: () => t2, place: (id) => placeById(id) };
    const a = requestTown(deps2, 'us-4007500', '2.2.2.2');
    const regions = q2.jobsOf('us-4007500').filter((j) => j.kind === 'regions');
    const ctx = q2.jobsOf('us-4007500').filter((j) => j.kind === 'ctx');
    ok('a pinned build on an empty store: the pick queues the town\'s regions jobs (bound to the build, the release not known yet), and its ctx wait on them',
      a.status === 202 && regions.length > 0 && regions.every((j) => j.build === NEW && j.args.release == null && j.key.startsWith(`regions:@${NEW}:`))
        && ctx.length > 0 && ctx.every((j) => j.deps.some((k) => k.startsWith('regions:'))), `${regions.length} regions, ${ctx.length} ctx`);
    // (the run stores its build record before it claims: the claim fills the release in from it)
    store2.put(buildKey(NEW), Buffer.from(JSON.stringify({ buildId: NEW, overture: '2026-10-21.0' })));
    const res = await workerResponse(new Request('http://web/api/hometown/worker/claim', { method: 'POST', headers: { authorization: `Bearer ${'w'.repeat(40)}`, 'content-type': 'application/json' },
      body: JSON.stringify({ worker: 'run-p1', build: NEW, freeSlots: 4, totalSlots: 4 }) }), ['claim'], deps2, { pollMs: 0 });
    const j = res.status === 200 ? await res.json() as { kind: string; key: string; args: { release?: string } } : null;
    ok('...its first claim takes a regions job with the release from the run\'s build record, kept on the job (its outputs are checked against it)',
      !!j && j.kind === 'regions' && j.args.release === '2026-10-21.0' && q2.get(j.key)?.args.release === '2026-10-21.0', JSON.stringify(j).slice(0, 300));
    q2.close();
  }
}
