/**
 * A local stand-in for Render Workflows, for the town builder's local simulation (deploy/town-builder/workflow-sim.sh).
 * Two halves, both what Render does around deploy/town-builder/workflow.py, and nothing of GameMog's own code:
 *
 *   the REST API     POST /v1/task-runs {task, input, idempotencyKey} -> 202 {id, status}; GET /v1/task-runs/{id}
 *                    (api-docs.render.com createTask / getTaskRun), bearer key checked, idempotency keys honoured
 *   the runtime      each run is a NEW process of the workflow's start command, driven over the Render SDK's own
 *                    protocol (render 1.8.0, render/workflows/runner.py): RENDER_SDK_MODE=run and
 *                    RENDER_SDK_SOCKET_PATH, HTTP over a unix socket: GET /input -> {task_name, input (base64 JSON),
 *                    task_run_id}; POST /callback {complete: {output}} | {error: {details}}. At start the start command
 *                    runs once with RENDER_SDK_MODE=register (POST /register-tasks), as Render's build does.
 *                    At most SIM_MAX_ACTIVE runs at once (the rest stay pending, as Render queues past its compute
 *                    limits); a failed attempt is retried as the task registered (max_retries).
 *
 * The CLI's own task server (`render workflows dev`) is the official version of this; it is not installed on this Mac
 * (no system packages), so this plays its part against the real SDK code.
 *
 * Environment: SIM_PORT (4830-4849), SIM_KEY (the bearer key), SIM_PYTHON (a Python with the render SDK),
 * SIM_START (the start command's script, deploy/town-builder/workflow.py), SIM_SLUG (the workflow slug),
 * SIM_MAX_ACTIVE (default 2), SIM_WORK (a folder: sockets, per-run logs and work dirs). Every HOMETOWN_* variable is
 * passed to the runs (as a workflow service's env vars are). One JSON line per event on stdout.
 */
import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdirSync, openSync, closeSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';

const PORT = Number(process.env.SIM_PORT || 4840);
if (!(PORT >= 4830 && PORT <= 4849)) { console.error('SIM_PORT must be 4830-4849 (shared machine)'); process.exit(2); }
const KEY = process.env.SIM_KEY || '';
const PY = process.env.SIM_PYTHON || 'python3';
const START = process.env.SIM_START || 'deploy/town-builder/workflow.py';
const SLUG = process.env.SIM_SLUG || 'gamemog-town-builder';
const MAX_ACTIVE = Math.max(1, Number(process.env.SIM_MAX_ACTIVE || 2));
const WORK = path.resolve(process.env.SIM_WORK || '.scratch/workflow-sim');
mkdirSync(WORK, { recursive: true });
// (unix socket paths are short: under 104 bytes on macOS)
const SOCKS = existsSync('/private/tmp') ? path.join('/private/tmp', `htwf-${process.pid}`) : path.join(WORK, 's');
mkdirSync(SOCKS, { recursive: true });

const log = (event: string, o: Record<string, unknown> = {}) => console.log(JSON.stringify({ at: new Date().toISOString(), event, ...o }));
type Run = { id: string; task: string; input: unknown[]; status: string; attempts: number; created: number; started?: number; finished?: number; result?: unknown; error?: string; cpuS?: number; key?: string };
const runs = new Map<string, Run>();
const byKey = new Map<string, string>();
let tasks: { name: string; options?: { retry?: { max_retries?: number }; timeout_seconds?: number; plan?: string } }[] = [];
let n = 0;

const runEnv = (extra: Record<string, string>) => {
  const env: Record<string, string> = { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', LANG: process.env.LANG ?? 'C.UTF-8' };
  for (const [k, v] of Object.entries(process.env)) if (k.startsWith('HOMETOWN_') && v != null) env[k] = v;
  return { ...env, ...extra } as unknown as NodeJS.ProcessEnv;
};

/** A unix-socket HTTP server speaking the SDK's side for one process. */
function sdkSocket(sock: string, on: { input?: () => unknown; callback?: (b: Record<string, unknown>) => void; register?: (b: Record<string, unknown>) => void }) {
  if (existsSync(sock)) rmSync(sock);
  const srv = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const p = (req.url ?? '').split('?')[0];
      const j = body ? JSON.parse(body) : {};
      const send = (st: number, o?: unknown) => { res.writeHead(st, { 'content-type': 'application/json' }); res.end(o === undefined ? '' : JSON.stringify(o)); };
      if (req.method === 'GET' && p === '/input' && on.input) return send(200, on.input());
      if (req.method === 'POST' && p === '/callback' && on.callback) { on.callback(j); return send(200, {}); }
      if (req.method === 'POST' && p === '/register-tasks' && on.register) { on.register(j); return send(200, {}); }
      send(404, { error: `no ${req.method} ${p} here` });
    });
  });
  srv.listen(sock);
  return srv;
}

/** `/usr/bin/time -l` (macOS) or `-v` (GNU): the run's CPU seconds, its compile children included (they are waited for). */
const TIME = existsSync('/usr/bin/time') ? ['/usr/bin/time', process.platform === 'darwin' ? '-l' : '-v'] : [];
const cpuOf = (err: string) => {
  const mac = /([\d.]+) real\s+([\d.]+) user\s+([\d.]+) sys/.exec(err);
  if (mac) return Number(mac[2]) + Number(mac[3]);
  const u = /User time \(seconds\): ([\d.]+)/.exec(err), s = /System time \(seconds\): ([\d.]+)/.exec(err);
  return u && s ? Number(u[1]) + Number(s[1]) : undefined;
};

function register(): Promise<void> {
  return new Promise((resolve, reject) => {
    const sock = path.join(SOCKS, 'reg.sock');
    const srv = sdkSocket(sock, { register: (b) => { tasks = (b.tasks as typeof tasks) ?? []; } });
    const p = spawn(PY, [START], { env: runEnv({ RENDER_SDK_MODE: 'register', RENDER_SDK_SOCKET_PATH: sock }), stdio: ['ignore', 'inherit', 'inherit'] });
    p.on('exit', (code) => {
      srv.close();
      if (code !== 0 || !tasks.length) return reject(new Error(`register exited ${code} with ${tasks.length} tasks`));
      log('registered', { tasks: tasks.map((t) => ({ name: t.name, options: t.options })) });
      resolve();
    });
  });
}

function attempt(r: Run) {
  r.status = 'running'; r.attempts++; r.started ??= Date.now();
  const sock = path.join(SOCKS, `${r.id}.sock`);
  let cb: Record<string, unknown> | null = null;
  const srv = sdkSocket(sock, {
    input: () => ({ task_name: r.task.split('/')[1], input: Buffer.from(JSON.stringify(r.input)).toString('base64'), task_run_id: r.id, root_task_run_id: r.id, attempt: r.attempts - 1 }),
    callback: (b) => { cb = b; },
  });
  const out = openSync(path.join(WORK, `${r.id}.${r.attempts}.log`), 'w');
  const p = spawn(TIME[0] ?? PY, TIME.length ? [TIME[1], PY, START] : [START], {
    env: runEnv({ RENDER_SDK_MODE: 'run', RENDER_SDK_SOCKET_PATH: sock, HOMETOWN_WORK: path.join(WORK, 'cache', r.id) }), stdio: ['ignore', out, 'pipe'],
  });
  let err = '';
  p.stderr!.on('data', (c) => { err += c; if (err.length > 200_000) err = err.slice(-100_000); });
  log('run-start', { id: r.id, attempt: r.attempts, pid: p.pid });
  p.on('exit', (code) => {
    srv.close(); closeSync(out);
    if (existsSync(sock)) rmSync(sock);
    const c = cb as { complete?: { output: string }; error?: { details: string } } | null;
    r.cpuS = (r.cpuS ?? 0) + (cpuOf(err) ?? 0);
    if (c?.complete) {
      r.status = 'completed'; r.finished = Date.now();
      try { r.result = JSON.parse(Buffer.from(c.complete.output, 'base64').toString('utf8'))[0]; } catch { r.result = c.complete.output; }
    } else {
      r.error = c?.error?.details ?? `exited ${code} without a callback: ${err.slice(-400)}`;
      const retries = tasks.find((t) => t.name === r.task.split('/')[1])?.options?.retry?.max_retries ?? 0;
      if (r.attempts <= retries) { r.status = 'pending'; log('run-retry', { id: r.id, error: r.error.slice(0, 300) }); }
      else { r.status = 'failed'; r.finished = Date.now(); }
    }
    if (r.status !== 'pending') log('run-end', { id: r.id, status: r.status, wallS: Math.round((r.finished! - r.started!) / 100) / 10, cpuS: Math.round((r.cpuS ?? 0) * 10) / 10, result: r.result, error: r.error?.slice(0, 300) });
    pump();
  });
}

function pump() {
  const active = [...runs.values()].filter((r) => r.status === 'running').length;
  const next = [...runs.values()].filter((r) => r.status === 'pending').sort((a, b) => a.created - b.created).slice(0, Math.max(0, MAX_ACTIVE - active));
  for (const r of next) attempt(r);
}

const api = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const send = (st: number, o: unknown) => { res.writeHead(st, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (req.headers.authorization !== `Bearer ${KEY}` || !KEY) return send(401, { message: 'unauthorized' });
    const p = (req.url ?? '').split('?')[0];
    const view = (r: Run) => ({ id: r.id, taskId: `tsk-${r.task.split('/')[1]}`, status: r.status, startedAt: r.started ? new Date(r.started).toISOString() : undefined, completedAt: r.finished ? new Date(r.finished).toISOString() : undefined, parentTaskRunId: '', rootTaskRunId: r.id, retries: Math.max(0, r.attempts - 1), attempts: [], results: r.result === undefined ? undefined : [r.result], error: r.error });
    if (req.method === 'POST' && p === '/v1/task-runs') {
      let j: { task?: string; input?: unknown[]; idempotencyKey?: string };
      try { j = JSON.parse(body); } catch { return send(400, { message: 'bad json' }); }
      const name = String(j.task ?? '').split(':')[0];
      if (!name.startsWith(`${SLUG}/`) || !tasks.some((t) => t.name === name.slice(SLUG.length + 1))) return send(404, { message: `no task ${j.task}` });
      if (!Array.isArray(j.input)) return send(400, { message: 'input' });
      if (j.idempotencyKey && byKey.has(j.idempotencyKey)) { log('run-idempotent', { key: j.idempotencyKey }); return send(202, view(runs.get(byKey.get(j.idempotencyKey)!)!)); }
      const r: Run = { id: `trn-sim${String(++n).padStart(4, '0')}`, task: name, input: j.input, status: 'pending', attempts: 0, created: Date.now(), key: j.idempotencyKey };
      runs.set(r.id, r); if (j.idempotencyKey) byKey.set(j.idempotencyKey, r.id);
      log('run-created', { id: r.id, input: r.input, key: j.idempotencyKey });
      setImmediate(pump);
      return send(202, view(r));
    }
    const m = /^\/v1\/task-runs\/([^/]+)$/.exec(p);
    if (req.method === 'GET' && m) { const r = runs.get(decodeURIComponent(m[1])); return r ? send(200, view(r)) : send(404, { message: 'not found' }); }
    if (req.method === 'GET' && p === '/sim/runs') return send(200, [...runs.values()].map((r) => ({ ...view(r), wallS: r.started ? ((r.finished ?? Date.now()) - r.started) / 1000 : 0, cpuS: r.cpuS, created: r.created })));
    send(404, { message: 'not simulated' });
  });
});

await register();
api.listen(PORT, '127.0.0.1', () => log('listening', { port: PORT, slug: SLUG, maxActive: MAX_ACTIVE, start: START, time: TIME[0] ?? null }));
const stop = () => { log('stopping', { running: [...runs.values()].filter((r) => r.status === 'running').map((r) => r.id) }); api.close(); try { rmSync(SOCKS, { recursive: true, force: true }); } catch { /* gone */ } process.exit(0); };
process.on('SIGTERM', stop); process.on('SIGINT', stop);
