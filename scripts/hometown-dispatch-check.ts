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
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BuildQueue, ANY_BUILD } from '../lib/hometown-build/queue.ts';
import { Dispatcher, RenderApiError, renderRuns, runsConfig, runsReady, runsProblem, capacitySlots, type RenderRuns, type RunsConfig } from '../lib/hometown-build/dispatch.ts';
import { estimate, type BuilderDeps } from '../lib/hometown-build/towns.ts';
import { hometownConfig } from '../lib/hometown-tiles/config.ts';
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
  end(status = 'completed') { for (const r of this.runs.values()) if (r.status === 'pending' || r.status === 'running') r.status = status; }
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
    ok('600 P0 quads (2,412 s of work): want 11 runs (byWork), under HOMETOWN_MAX_RUNS', p.want === 11 && p.byJobs === 151, JSON.stringify(p));
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
    ok('render.yaml: HOMETOWN_RUNS and HOMETOWN_BUILDER off; the API key sync: false; the slug from the workflow', /key: HOMETOWN_RUNS\n\s+value: "off"/.test(y) && /key: HOMETOWN_BUILDER\n\s+value: "off"/.test(y)
      && /key: HOMETOWN_RENDER_API_KEY\n\s+sync: false/.test(y) && /key: HOMETOWN_WORKFLOW_SLUG\n\s+fromService:\n\s+type: workflow\n\s+name: gamemog-town-builder\n\s+property: slug/.test(y));
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
