"""The town builder as a Render Workflows task (docs/HOMETOWN-HOSTING.md; render.yaml service
`gamemog-town-builder`, type: workflow, runtime: python).

One task, `build_jobs`. Its body IS the worker loop (worker.py) run once: it claims jobs from the web's queue over
Render's private network until nothing has been claimable for HOMETOWN_IDLE_S (20 s) and nothing runs, or until its
time cap, then returns a summary. Each run is its own instance, spun up on demand and gone when it returns: idle costs
nothing. The web's dispatcher (lib/hometown-build/dispatch.ts) starts runs through the Render API when there is
claimable work and fewer runs in flight than it wants. The queue, its leases and heartbeats are unchanged: a run that
dies loses nothing (its leases expire and another run takes the jobs one lease later).

Why a long run and not one run per job: a town is about 30-150 small jobs (ctx blocks, 2 x 2 quads, far windows,
bundles). A run pays its start once (instance spin-up, which Render puts at seconds, plus compile.py --print-build and
the first downloads of the town's ctx and sources, about 5-15 s) and then keeps the local cache warm for the next job of
the same town. One run per job would pay that start 30-150 times per town (several minutes of billed start-up per town)
and lose the cache affinity the claim's region tie-break is built on.

Pre-warm (P5) runs on this same task: the owner's /api/hometown/admin/prewarm enqueues P5 jobs, the dispatcher starts
runs for them (at most HOMETOWN_PREWARM_RUNS while nothing interactive waits), and a run claims P5 only when no P0-P3
job is claimable (queue.ts). One task, one build environment, one buildId.

The build environment (workflow-build.sh, the buildCommand) pins everything that decides a build's bytes: Python by
PYTHON_VERSION (render.yaml), the compiler by MOGCITY_SHA, its packages by hash, the OSM lane table by sha256, the
duckdb extensions installed at build time, numpy's CPU dispatch below. Its recipe id (.town-builder/image-id) is what
compile.py hashes into the buildId as HOMETOWN_IMAGE_DIGEST, so every run of one deploy, and every redeploy of the same
pins, reports the same buildId.

Locally: python deploy/town-builder/workflow.py needs RENDER_SDK_MODE and RENDER_SDK_SOCKET_PATH (Render, or the CLI's
`render workflows dev`, sets them); scripts/hometown-workflow-sim.ts plays that part for the local simulation.
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
# what workflow-build.sh made (the compiler, its venv, the data seed, the duckdb extensions, the recipe id)
TB = os.path.abspath(os.environ.get('HOMETOWN_TB_DIR') or os.path.join(ROOT, '.town-builder'))

# the compute plan of every run (Render's workflow plans): its CPUs and GB decide the slots, 1.5 GB a compile child
PLANS = {'2c-4g': (2, 4), '2c-8g': (2, 8), '4c-8g': (4, 8), '4c-16g': (4, 16), '8c-32g': (8, 32)}
PLAN = os.environ.get('HOMETOWN_RUN_PLAN') or '4c-8g'
if PLAN not in PLANS:
    raise SystemExit('HOMETOWN_RUN_PLAN must be one of %s' % ', '.join(PLANS))
# a run stops claiming after this (then finishes its jobs and returns; the dispatcher starts a fresh one if work is left)
CAP_S = int(os.environ.get('HOMETOWN_RUN_CAP_S') or 7200)
# Render's per-attempt timeout: the cap plus the longest job (worker.py's child timeout is 1,800 s) plus the uploads
TIMEOUT_S = min(86400, CAP_S + 3600)

# numpy's run-time CPU dispatch and the hash seed, for every compile child (worker.py passes these through)
PINNED_ENV = {
    'PYTHONHASHSEED': '0',
    'NPY_DISABLE_CPU_FEATURES': 'AVX512F AVX512CD AVX512_SKX AVX512_CLX AVX512_CNL AVX512_ICL AVX512_SPR',
    'OMP_NUM_THREADS': '1',
    'OPENBLAS_NUM_THREADS': '1',
}


def slots_of(plan, slot_gb):
    """The compile slots of one run: min(CPUs, floor((GB - 0.75) / slot GB)), at least 1 (worker.capacity's rule, from the
    plan's own specs: a run's cgroup may show the host's)."""
    cpus, gb = PLANS[plan]
    return max(1, min(cpus, int((gb - 0.75) // slot_gb)))


def environment(run_id=None):
    """The worker's environment inside a run: the build's paths and pins (as the Docker image's ENV lines were)."""
    env = os.environ
    for k, v in PINNED_ENV.items():
        env[k] = v
    env.setdefault('HOMETOWN_PYTHON', os.path.join(TB, 'venv', 'bin', 'python'))
    env.setdefault('HOMETOWN_COMPILER_DIR', os.path.join(TB, 'mogcity', 'tools', 'hometown'))
    env.setdefault('HOMETOWN_DATA_SEED', os.path.join(TB, 'data'))
    env.setdefault('HOMETOWN_OSM_ROADS', os.path.join(TB, 'data', 'osm', 'osm-roads-us.parquet'))
    env.setdefault('DUCKDB_EXTENSION_DIRECTORY', os.path.join(TB, 'duckdb-ext'))
    env.setdefault('HOMETOWN_IMAGE_ID_FILE', os.path.join(TB, 'image-id'))
    env.setdefault('HOMETOWN_WORK', '/tmp/hometown-cache')
    env.setdefault('HOMETOWN_SLOTS', str(slots_of(PLAN, float(env.get('HOMETOWN_SLOT_GB') or 1.5))))
    env['HOMETOWN_ONCE'] = '1'
    env.setdefault('HOMETOWN_IDLE_S', '20')
    env['HOMETOWN_RUN_CAP_S'] = str(CAP_S)
    if run_id:
        # (the run's id is the worker's name: the owner's status page and the dispatcher's runs table line up)
        env['HOMETOWN_WORKER_ID'] = ('run-' + run_id)[:80]
    return env


def run_once(run_id=None):
    """The task's body: the worker loop until idle or the cap. -> its summary (JSON)."""
    environment(run_id)
    if HERE not in sys.path:
        sys.path.insert(0, HERE)
    import worker  # noqa: E402  (after the environment: it reads it at construction)
    try:
        return worker.Worker().main()
    except SystemExit as e:
        # (compile.py --print-build failed, or a pin is missing: a task error, so Render records it and retries once;
        # SystemExit would end the process without a callback)
        raise RuntimeError('town builder could not start: %s' % e) from None


try:
    from render import Retry, TaskContext, Workflows
except ImportError:  # (the unit tests import this file without the SDK)
    Workflows = None

if Workflows is not None:
    app = Workflows()

    @app.task(name='build_jobs', plan=PLAN, timeout_seconds=TIMEOUT_S,
              retry=Retry(max_retries=1, wait_duration_ms=10_000, backoff_scaling=2))
    def build_jobs(ctx: TaskContext, reason: str = '') -> dict:
        """Work the town queue until it is idle. `reason` is the dispatcher's note (kept with the run; unused)."""
        rid = None
        try:
            rid = ctx.metadata.task_run_id
        except Exception:  # noqa: BLE001
            pass
        return run_once(rid)


if __name__ == '__main__':
    if Workflows is None:
        raise SystemExit('the Render SDK is not installed (deploy/town-builder/workflow-requirements.txt)')
    app.start()
