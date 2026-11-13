/**
 * How this server reaches the Python compiler (HOMETOWN_COMPILE=on only; off by default, and not on today's Render
 * plan: docs/HOMETOWN-HOSTING.md). A tile missing from the store compiles its whole L2 block (16 tiles) in ONE child
 * process, writing straight into the store, the same way the Mac pre-warm does:
 *
 *   $HOMETOWN_PYTHON tools/hometown/compile.py --block hg1-{d}/2/{C}/{R} --store <root> --data $HOMETOWN_SOURCES_DIR
 *   (cwd $HOMETOWN_COMPILER_DIR, a checkout of MogCity at the build's commit)
 *
 * One compile at a time (a block peaks at 0.4-1.2 GB RSS, measured), at most 20 waiting, then 503 + Retry-After.
 * Single-flight per block: 16 players asking for 16 tiles of one block are one compile. The child gets an allow-listed
 * environment, never this process's (HOMETOWN_ADMIN_TOKEN, ANTHROPIC_API_KEY and ADMIN_PASSWORD stay here). The
 * compiler only ever writes its OWN buildId: a request for another build is refused before anything runs.
 */
import { spawn, spawnSync } from 'node:child_process';
import type { HometownConfig } from './config.ts';
import type { TileStore } from './store.ts';
import { blockOf, type Domain } from './keys.ts';

export const ENV_ALLOW = ['PATH', 'HOME', 'TMPDIR', 'LANG', 'LC_ALL', 'TZ', 'HOMETOWN_IMAGE_DIGEST', 'HOMETOWN_OSM_ROADS', 'HOMETOWN_DEM_SNAPSHOT'];
export const MAX_WAITING = 20;
export const TIMEOUT_MS = 5 * 60_000;

export class CompileError extends Error {
  status: number;
  retryAfter?: number;
  constructor(status: number, message: string, retryAfter?: number) { super(message); this.status = status; this.retryAfter = retryAfter; }
}

export function childEnv(from: Record<string, string | undefined> = process.env): NodeJS.ProcessEnv {
  const out: Record<string, string> = {};
  for (const k of ENV_ALLOW) if (from[k] !== undefined) out[k] = from[k]!;
  return out as NodeJS.ProcessEnv;
}

type Job = () => Promise<void>;
export function createCompiler(cfg: HometownConfig, store: TileStore, run: (argv: string[], cwd: string) => Promise<{ code: number; err: string }> = runChild, buildIdOf?: () => string | null) {
  const flights = new Map<string, Promise<void>>();
  const queue: Job[] = [];
  let active = 0;
  let ownBuild: string | null | undefined;
  const stats = { blocks: 0, failed: 0, refused: 0, busy: 0 };

  const next = () => {
    if (active || !queue.length) return;
    active = 1;
    const job = queue.shift()!;
    job().finally(() => { active = 0; next(); });
  };

  function buildId(): string | null {
    if (buildIdOf) return buildIdOf();
    if (ownBuild !== undefined) return ownBuild;
    if (!cfg.python || !cfg.compilerDir) return (ownBuild = null);
    // (with the blocks' own --data: the buildId includes the OSM lane table under it)
    const r = spawnSync(cfg.python, ['tools/hometown/compile.py', '--print-build', '--store', store.root, ...(cfg.sourcesDir ? ['--data', cfg.sourcesDir] : [])], { cwd: cfg.compilerDir, env: childEnv(), encoding: 'utf8', timeout: 60_000 });
    try { ownBuild = JSON.parse(r.stdout).buildId ?? null; } catch { ownBuild = null; }
    return ownBuild ?? null;
  }

  /** Compile the block holding tile (c, r) of `build` into the store; resolves when its tiles are written. */
  function compileTileBlock(build: string, domain: Domain, c: number, r: number): Promise<void> {
    if (!cfg.compile || !cfg.python || !cfg.compilerDir || !cfg.sourcesDir) throw new CompileError(404, 'not built (this server does not compile)');
    if (buildId() !== build) throw new CompileError(404, `not built, and build ${build} is not this server's compiler's`);
    if (store.fullReason(16 * 128 * 1024)) throw new CompileError(507, 'the hometown store is full');
    const block = blockOf(domain, c, r);
    const had = flights.get(block);
    if (had) return had;
    if (queue.length >= MAX_WAITING) { stats.busy++; throw new CompileError(503, 'the town builder is busy', 30); }
    const p = new Promise<void>((resolve, reject) => {
      queue.push(async () => {
        try {
          const { code, err } = await run([cfg.python!, 'tools/hometown/compile.py', '--block', block, '--store', store.root, '--data', cfg.sourcesDir!], cfg.compilerDir!);
          store.usedBytes(true);
          if (code === 3) { stats.refused++; reject(new CompileError(422, `refused: ${err.trim().split('\n').pop()?.slice(0, 300)}`)); return; }
          if (code !== 0) { stats.failed++; reject(new CompileError(502, `compile failed (${code})`)); return; }
          stats.blocks++;
          resolve();
        } catch (e) { stats.failed++; reject(new CompileError(502, (e as Error).message)); }
      });
      next();
    }).finally(() => flights.delete(block));
    flights.set(block, p);
    return p;
  }

  return { compileTileBlock, buildId, stats, get waiting() { return queue.length; }, get active() { return active; } };
}

function runChild(argv: string[], cwd: string): Promise<{ code: number; err: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(argv[0], argv.slice(1), { cwd, env: childEnv(), stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`compile timed out after ${TIMEOUT_MS} ms`)); }, TIMEOUT_MS);
    child.stderr.on('data', (d) => { err += d; if (err.length > 64e3) err = err.slice(-16e3); });
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', (code) => { clearTimeout(timer); resolve({ code: code ?? 1, err }); });
  });
}
