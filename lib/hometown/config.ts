/**
 * Hometown towns: the server's settings, from the environment (all of it off unless HOMETOWN_TOWNS=on).
 *
 *   HOMETOWN_TOWNS=on        the town builder and its routes (/api/towns, /towns/...); anything else: every route 404
 *   HOMETOWN_PYTHON          the Python that runs the compiler (default .venv/bin/python, else python3)
 *   HOMETOWN_COMPILER        the compiler's folder (MogCity tools/hometown; default hometown/compiler, the vendored copy)
 *   HOMETOWN_SOURCES         the raw map data the compiler reads and fetch.py fills (default data/towns/src)
 *   HOMETOWN_QUEUE_MAX       towns waiting or building at once (default 10)
 *   HOMETOWN_DAILY_COLD      new towns built per day (default 100)
 *   HOMETOWN_PER_IP_HOUR     new towns one address may ask for in an hour (default 3)
 *   HOMETOWN_JOB_SECS        one town's build, at most (default 900)
 * A town that is built already is never limited.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';

const num = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) && Number(v) > 0 ? Math.floor(Number(v)) : d);

export const townsOn = () => process.env.HOMETOWN_TOWNS === 'on';

export function townsConfig() {
  const cwd = process.cwd(), root = path.join(cwd, 'data', 'towns');
  const venv = path.join(cwd, '.venv', 'bin', 'python');
  return {
    root,
    bundles: path.join(root, 'bundles'),
    jobs: path.join(root, 'jobs'),
    ready: path.join(root, 'ready'),
    store: path.join(root, 'store'),
    scratch: path.join(root, 'scratch'),
    sources: process.env.HOMETOWN_SOURCES || path.join(root, 'src'),
    python: process.env.HOMETOWN_PYTHON || (existsSync(venv) ? venv : 'python3'),
    compiler: process.env.HOMETOWN_COMPILER || path.join(cwd, 'hometown', 'compiler'),
    queueMax: num(process.env.HOMETOWN_QUEUE_MAX, 10),
    dailyCold: num(process.env.HOMETOWN_DAILY_COLD, 100),
    perIpHour: num(process.env.HOMETOWN_PER_IP_HOUR, 3),
    jobMs: num(process.env.HOMETOWN_JOB_SECS, 900) * 1000,
  };
}
export type TownsConfig = ReturnType<typeof townsConfig>;
