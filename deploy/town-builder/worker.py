"""GameMog town builder worker (SPEC 3.5, 3.6, 6.2; task G9). Python standard library only.

One process per instance of the Render background worker `gamemog-town-builder` (Docker, no disk). It claims jobs from
the web service's queue over Render's private network, runs the pinned hg1 compiler (MogCity tools/hometown) in child
processes, uploads what they made through the web's hash-checked PUT, and says done or failed. It holds no state the
web needs: its local cache (sources, ctx, tiles) is an optimisation that may vanish at any restart.

  slots      min(cgroup v2 cpu.max, floor((memory.max - 0.75 GB) / HOMETOWN_SLOT_GB)), at least 1 (HOMETOWN_SLOTS overrides)
  claim      a 20 s long-poll; the last free slot of a multi-slot worker claims P0 only (the web decides)
  heartbeat  every 15 s per running job; a 410 kills the child (its process group) and drops the result
  children   one per slot, under `prlimit --as` (the slot's memory) where prlimit exists, with an allowlisted environment
             (the worker's token never reaches Python)
  inputs     downloaded from the web store into the local store / data dir; staged regions fetched on a compile's
             exit 3 before a regions job is asked for
  uploads    every new object, x-content-sha256 on each, list files (files.json, bundle.json, manifests) LAST
  SIGTERM    stop claiming, finish the running jobs (Render waits maxShutdownDelaySeconds), exit
  web down   every call retried with backoff for up to 10 minutes (a deploy of the web has downtime)

Environment:
  HOMETOWN_WEB              the web's host:port on the private network (render.yaml fromService hostport), or a URL
  HOMETOWN_WORKER_TOKEN     the bearer token (render.yaml fromService envVarKey)
  HOMETOWN_WORKER_PAUSED=1  claim nothing (a kill switch that needs no deploy of the web)
  HOMETOWN_SLOT_GB=1.5      memory per slot; HOMETOWN_CACHE_GB=4 the local cache's cap; HOMETOWN_SLOTS a fixed count
  HOMETOWN_PYTHON           the compiler's Python (default this one); HOMETOWN_COMPILER_DIR its tools/hometown
  HOMETOWN_WORK             the local cache root (default /tmp/hometown-cache)
  HOMETOWN_DATA_SEED        a folder whose osm/, dem/ and overture-index/ seed the data dir (the image's baked OSM table,
                            DEM snapshot and the Overture release's file index: a cold region fetch reads only its files)
  HOMETOWN_WORKER_ID        this worker's name (default hostname-pid)
  HOMETOWN_ONCE=1           exit when the queue has been empty for one long-poll (the local dry run)
"""
import gzip
import hashlib
import json
import os
import re
import shutil
import signal
import socket
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request

VERSION = 'town-builder-worker 1'
ENV_ALLOW = ['PATH', 'HOME', 'LANG', 'LC_ALL', 'TZ', 'TMPDIR', 'DUCKDB_EXTENSION_DIRECTORY', 'HOMETOWN_IMAGE_DIGEST', 'HOMETOWN_OSM_ROADS',
             'HOMETOWN_DEM_SNAPSHOT', 'NPY_DISABLE_CPU_FEATURES', 'PYTHONHASHSEED', 'OMP_NUM_THREADS', 'OPENBLAS_NUM_THREADS']
GB = 1024 ** 3
WEB_DOWN_S = 600
# the families a worker uploads, in the order they are uploaded (lists that are checked against others go last)
ORDER = ['builds', 'dem', 'ctx', 'tiles', 'far', 'frames', 'manifests']
KEY_OK = {
    'builds': re.compile(r'^builds/htc-[0-9][0-9.]{0,9}-hg1-b[0-9a-f]{8}\.json$'),
    'dem': re.compile(r'^dem/(13|1)/n[0-9]{2}w[0-9]{3}/[A-Za-z0-9-]{4,64}/(meta\.json|(0|[1-9][0-9]{0,5})\.bin)$'),
    'ctx': re.compile(r'^ctx/[^/]+/hg1-[a-z]+/4/[0-9]+/[0-9]+$'),
    'tiles': re.compile(r'^tiles/[^/]+/hg1-[a-z]+/0/[0-9]+/[0-9]+$'),
    'far': re.compile(r'^far/[^/]+/hg1-[a-z]+/[135]/[0-9]+/[0-9]+$'),
    'frames': re.compile(r'^frames/[^/]+/[a-z0-9-]+\.json$'),
    'manifests': re.compile(r'^manifests/[^/]+/[a-z0-9-]+\.json$'),
}


def log(**kw):
    kw.setdefault('at', time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()))
    print(json.dumps(kw, sort_keys=True), flush=True)


def sha(b):
    return hashlib.sha256(b).hexdigest()


def job_domain(job):
    """The hg1 domain a job works in (its block, ctx, tile or far ids; a town's gazetteer GEOID)."""
    a = job.get('args', {})
    for k in ('ctx', 'block', 'tile'):
        m = re.match(r'^hg1-([a-z]+)/', str(a.get(k, '')))
        if m:
            return m.group(1)
    for k in a.get('keys', []) or []:
        m = re.match(r'^hg1-([a-z]+)/', str(k))
        if m:
            return m.group(1)
    g = (a.get('gazetteer') or {}).get('geoid', '')
    return {'02': 'ak', '15': 'hi', '72': 'pr', '78': 'pr', '66': 'gu', '69': 'gu', '60': 'as'}.get(str(g)[:2], 'conus')


def missing_regions(err, dom):
    """The regions a compile's exit 3 names, as 'dom:C,R;C,R', from either of the compiler's messages:
    '... (tools/hometown/fetch.py --regions conus:362,536)' or 'no region of [(362, 536), (363, 536)] fetched'."""
    m = re.search(r'--regions ([a-z]+:[0-9,;]+)', err)
    if m:
        return m.group(1)
    m = re.search(r'no region of \[([0-9, ()]+)\] fetched', err)
    if m:
        pairs = re.findall(r'\((\d+), (\d+)\)', m.group(1))
        if pairs:
            return dom + ':' + ';'.join('%s,%s' % p for p in pairs)
    return None


# ------------------------------------------------------------------------------------------------------- capacity
def _read(p):
    try:
        with open(p) as f:
            return f.read().strip()
    except OSError:
        return None


def capacity(slot_gb):
    """(slots, cpus, mem_bytes) from cgroup v2, else the host."""
    cpus = os.cpu_count() or 1
    cm = _read('/sys/fs/cgroup/cpu.max')
    if cm and not cm.startswith('max'):
        q, p = cm.split()[:2]
        cpus = max(1, int(int(q) // int(p)))
    mem = None
    mm = _read('/sys/fs/cgroup/memory.max')
    if mm and mm != 'max':
        mem = int(mm)
    if mem is None:
        try:
            mem = os.sysconf('SC_PAGE_SIZE') * os.sysconf('SC_PHYS_PAGES')
        except (ValueError, OSError, AttributeError):
            mem = 2 * GB
    slots = max(1, min(cpus, int((mem - 0.75 * GB) // (slot_gb * GB))))
    if os.environ.get('HOMETOWN_SLOTS'):
        slots = max(1, int(os.environ['HOMETOWN_SLOTS']))
    return slots, cpus, mem


# ------------------------------------------------------------------------------------------------------------ web
class Web:
    def __init__(self, base, token):
        self.base = base if base.startswith('http') else 'http://' + base
        self.token = token

    def call(self, method, path, body=None, headers=None, timeout=60, ok=(200, 201, 204), retry_s=WEB_DOWN_S, raw=False):
        """-> (status, bytes). Retries a web that is down or 5xx with backoff for up to retry_s; 4xx answers at once."""
        url = self.base.rstrip('/') + '/api/hometown/worker/' + path
        data = body if isinstance(body, (bytes, bytearray)) or body is None else json.dumps(body).encode()
        h = {'authorization': 'Bearer ' + self.token}
        if body is not None and not isinstance(body, (bytes, bytearray)):
            h['content-type'] = 'application/json'
        h.update(headers or {})
        t0, wait = time.time(), 1.0
        while True:
            try:
                req = urllib.request.Request(url, data=data, method=method, headers=h)
                with urllib.request.urlopen(req, timeout=timeout) as r:
                    return r.status, r.read()
            except urllib.error.HTTPError as e:
                b = e.read()
                if e.code < 500 and e.code != 429:
                    return e.code, b
                why = 'HTTP %d' % e.code
            except (urllib.error.URLError, socket.timeout, ConnectionError, OSError) as e:
                why = str(e)[:200]
            if time.time() - t0 > retry_s:
                raise RuntimeError('web unreachable for %ds: %s' % (retry_s, why))
            log(event='web-retry', path=path.split('/')[0], why=why, wait=round(wait, 1))
            time.sleep(wait)
            wait = min(30.0, wait * 2)

    def jcall(self, method, path, body=None, **kw):
        st, b = self.call(method, path, body, **kw)
        try:
            return st, (json.loads(b) if b else {})
        except ValueError:
            return st, {}


# ---------------------------------------------------------------------------------------------------- the worker
class Worker:
    def __init__(self):
        self.web = Web(os.environ['HOMETOWN_WEB'], os.environ['HOMETOWN_WORKER_TOKEN'])
        self.python = os.environ.get('HOMETOWN_PYTHON') or sys.executable
        self.compiler = os.path.abspath(os.environ.get('HOMETOWN_COMPILER_DIR') or '/opt/mogcity/tools/hometown')
        self.work = os.path.abspath(os.environ.get('HOMETOWN_WORK') or '/tmp/hometown-cache')
        self.store = os.path.join(self.work, 'store')
        self.data = os.path.join(self.work, 'data')
        self.slot_gb = float(os.environ.get('HOMETOWN_SLOT_GB') or 1.5)
        self.cache_cap = float(os.environ.get('HOMETOWN_CACHE_GB') or 4) * GB
        self.slots, self.cpus, self.mem = capacity(self.slot_gb)
        self.id = os.environ.get('HOMETOWN_WORKER_ID') or '%s-%d' % (socket.gethostname()[:40], os.getpid())
        self.lock = threading.Lock()
        self.used = 0           # slots in use (weights)
        self.running = {}       # key -> job thread
        self.draining = False
        self.once = os.environ.get('HOMETOWN_ONCE') == '1'
        self.downloaded = set()
        self.region_locks = {}
        self.env = self.child_env()
        os.makedirs(self.store, exist_ok=True)
        os.makedirs(self.data, exist_ok=True)
        self.seed()
        self.caps = self.compiler_caps()
        self.build, self.record = self.print_build()

    def child_env(self):
        env = {k: os.environ[k] for k in ENV_ALLOW if os.environ.get(k) is not None}
        env.update({'PYTHONUNBUFFERED': '1', 'PYTHONDONTWRITEBYTECODE': '1'})
        # the image's identity: a recipe id computed in its build (the Dockerfile), the buildId hashes it
        rid = _read('/opt/hometown-image-id')
        if rid and 'HOMETOWN_IMAGE_DIGEST' not in env:
            env['HOMETOWN_IMAGE_DIGEST'] = 'recipe-' + rid
        return env

    def seed(self):
        """The image's baked OSM lane table and DEM snapshot pieces, into the data dir (links, no copy)."""
        src = os.environ.get('HOMETOWN_DATA_SEED')
        if not src:
            return
        for name in ('osm', 'dem', 'overture-index'):
            a, b = os.path.join(src, name), os.path.join(self.data, name)
            if os.path.isdir(a) and not os.path.exists(b):
                os.symlink(os.path.abspath(a), b)

    def compiler_caps(self):
        r = subprocess.run([self.python, 'compile.py', '--help'], cwd=self.compiler, env=self.env, capture_output=True, text=True, timeout=120)
        return {f for f in ('--frame', '--tiles', '--assemble', '--far-list') if f in r.stdout}

    def print_build(self):
        r = subprocess.run([self.python, 'compile.py', '--print-build', '--store', self.store, '--data', self.data], cwd=self.compiler, env=self.env,
                           capture_output=True, text=True, timeout=300)
        if r.returncode != 0:
            raise SystemExit('compile.py --print-build failed: ' + r.stderr[-800:])
        j = json.loads(r.stdout)
        return j['buildId'], j['record']

    # ---- the local store
    def path(self, key):
        return os.path.join(self.store, *key.split('/'))

    def fetch(self, key):
        """Download one stored object into the local store (skipped when held). -> True when it is held."""
        p = self.path(key)
        if os.path.exists(p):
            return True
        st, b = self.web.call('GET', 'objects/' + key, timeout=120, ok=(200,))
        if st != 200:
            return False
        os.makedirs(os.path.dirname(p), exist_ok=True)
        tmp = '%s.dl-%d' % (p, os.getpid())
        with open(tmp, 'wb') as f:
            f.write(b)
        try:
            os.link(tmp, p)
        except FileExistsError:
            pass
        os.remove(tmp)
        self.downloaded.add(key)
        return True

    def put(self, key, body, raw_sha=None):
        st, j = self.web.jcall('PUT', 'objects/' + key, body, headers={'content-type': 'application/octet-stream', **({'x-content-sha256': raw_sha} if raw_sha else {})}, timeout=300)
        if st not in (200, 201):
            raise RuntimeError('upload %s: %d %s' % (key, st, json.dumps(j)[:300]))
        return st

    def put_store_object(self, key):
        b = open(self.path(key), 'rb').read()
        fam = key.split('/')[0]
        raw = None
        if fam in ('tiles', 'ctx', 'far'):
            raw = sha(gzip.decompress(b))
        elif fam == 'dem' and not key.endswith('.json'):
            raw = sha(b)
        return self.put(key, b, raw)

    def new_objects(self, since):
        out = []
        for fam in ORDER:
            root = os.path.join(self.store, fam)
            for d, _, files in os.walk(root):
                for n in files:
                    if '.tmp' in n or '.dl-' in n:
                        continue
                    p = os.path.join(d, n)
                    k = os.path.relpath(p, self.store).replace(os.sep, '/')
                    if KEY_OK[fam].match(k) and k not in self.downloaded and os.stat(p).st_mtime >= since - 1:
                        out.append(k)
        return sorted(out, key=lambda k: (ORDER.index(k.split('/')[0]), k))

    def upload_new(self, since):
        keys = self.new_objects(since)
        for k in keys:
            self.put_store_object(k)
            self.downloaded.add(k)
        return keys

    # ---- staged regions
    def region_dir(self, dom, C, R):
        return os.path.join(self.data, 'regions', 'hg1-%s' % dom, '4', str(C), str(R))

    def stage_regions(self, spec, release):
        """'conus:530,453;530,454' -> the regions the web has staged, downloaded; the ones it lacks."""
        dom, _, rest = spec.partition(':')
        missing = []
        for b in [x for x in rest.split(';') if x]:
            C, R = [int(v) for v in b.split(',')]
            # (one region is staged by one job thread at a time: two jobs of a fresh worker needing the same region once
            # shared one temp folder (the pid) and removed each other's files mid-compile)
            with self.region_lock(dom, C, R):
                if not self.stage_one(dom, C, R, release):
                    missing.append('%d,%d' % (C, R))
        return (dom + ':' + ';'.join(missing)) if missing else None

    _region_guard = threading.Lock()

    def region_lock(self, dom, C, R):
        with Worker._region_guard:
            return self.__dict__.setdefault('region_locks', {}).setdefault((dom, C, R), threading.Lock())

    def stage_one(self, dom, C, R, release):
        """One staged region into the data dir (True), or False when the web has not staged it."""
        d = self.region_dir(dom, C, R)
        if os.path.exists(os.path.join(d, 'region.json')):
            os.utime(d)
            return True
        base = 'src/overture/%s/hg1-%s/4/%d/%d/' % (release, dom, C, R)
        st, j = self.web.jcall('GET', 'objects/' + base + 'files.json')
        if st != 200 or not isinstance(j.get('files'), dict):
            return False
        tmp = d + '.dl-%d-%d' % (os.getpid(), threading.get_ident())
        shutil.rmtree(tmp, ignore_errors=True)
        os.makedirs(tmp)
        for name, e in sorted(j['files'].items()):
            st, b = self.web.call('GET', 'objects/' + base + name, timeout=300)
            if st != 200 or sha(b) != e['sha256']:
                raise RuntimeError('staged region file %s%s: %d or hash' % (base, name, st))
            open(os.path.join(tmp, name), 'wb').write(b)
        os.makedirs(os.path.dirname(d), exist_ok=True)
        shutil.rmtree(d, ignore_errors=True)
        os.rename(tmp, d)
        return True

    def cached_regions(self):
        out = []
        root = os.path.join(self.data, 'regions')
        for dom in os.listdir(root) if os.path.isdir(root) else []:
            for C in os.listdir(os.path.join(root, dom, '4')) if os.path.isdir(os.path.join(root, dom, '4')) else []:
                for R in os.listdir(os.path.join(root, dom, '4', C)):
                    if os.path.exists(os.path.join(root, dom, '4', C, R, 'region.json')):
                        out.append('%s/%s/%s' % (dom[4:], C, R))
        return out[:500]

    # ---- children
    def run(self, argv, job, timeout=1800):
        """One compile child: (code, stderr tail, peak MB). Killed when the job's lease is lost or at the timeout."""
        lim = int(self.slot_gb * GB * max(1, job.get('weight', 1)))
        pre = ['prlimit', '--as=%d' % lim, '--'] if shutil.which('prlimit') else []
        p = subprocess.Popen(pre + [self.python] + argv, cwd=self.compiler, env=self.env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True)
        job['child'] = p
        err = []

        def pump(stream, keep):
            for line in iter(stream.readline, b''):
                if keep is not None:
                    keep.append(line.decode('utf8', 'replace'))
                    del keep[:-200]
        out = []
        ts = [threading.Thread(target=pump, args=(p.stderr, err), daemon=True), threading.Thread(target=pump, args=(p.stdout, out), daemon=True)]
        for t in ts:
            t.start()
        t0 = time.time()
        hwm = 0
        while p.poll() is None:
            if job.get('lost') or time.time() - t0 > timeout:
                os.killpg(p.pid, signal.SIGKILL)
            # (this child's own peak RSS, Linux: VmHWM; the job's peak MB on the status page)
            st = _read('/proc/%d/status' % p.pid)
            m = re.search(r'^VmHWM:\s+(\d+) kB', st or '', re.M)
            if m:
                hwm = max(hwm, int(m.group(1)) // 1024)
            time.sleep(0.2)
        for t in ts:
            t.join(5)
        peak_mb = hwm or None
        if not peak_mb:
            try:
                import resource
                peak = resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss  # (the largest child so far: an upper bound)
                peak_mb = peak // 1024 if sys.platform.startswith('linux') else peak // (1024 * 1024)
            except Exception:  # noqa: BLE001
                peak_mb = None
        job['child'] = None
        return p.returncode, ''.join(err), ''.join(out), peak_mb

    def compile(self, args, job, release):
        """compile.py with staged regions fetched on exit 3: -> (code, err, out, peak, missingRegions)."""
        dom = job_domain(job)
        for _ in range(4):
            code, err, out, peak = self.run(['compile.py', '--store', self.store, '--data', self.data] + args, job)
            spec = missing_regions(err, dom)
            if code == 3 and spec and release:
                left = self.stage_regions(spec, release)
                if left:
                    return code, err, out, peak, left
                continue
            return code, err, out, peak, None
        return code, err, out, peak, None

    # ---- the jobs
    def do_job(self, job):
        kind, args, key = job['kind'], job['args'], job['key']
        build = job.get('build')
        t0 = time.time()
        if kind != 'regions' and build != self.build:
            return {'fail': True, 'code': 2, 'reason': 'job build %s is not this worker\'s %s' % (build, self.build), 'final': True}
        for k in job.get('inputs', []):
            self.fetch(k)
        release = job.get('release') or self.record.get('overture')
        outputs, refused, peak = [], [], None
        if kind == 'regions':
            st = self.stage_regions(args['spec'], args['release'])
            if st:
                code, err, out, peak = self.run(['fetch.py', '--regions', st, '--data', self.data], job, timeout=1800)
                if code != 0:
                    return {'fail': True, 'code': code, 'reason': 'fetch: ' + err[-400:]}
            dom = args['spec'].split(':')[0]
            for b in args['spec'].split(':')[1].split(';'):
                C, R = [int(v) for v in b.split(',')]
                outputs.append(self.upload_region(dom, C, R, args['release']))
        elif kind == 'ctx':
            code, err, out, peak, missing = self.compile(['--ctx', args['ctx']], job, release)
            if missing:
                return {'fail': True, 'code': 3, 'missingRegions': missing, 'reason': 'regions'}
            if code != 0:
                return {'fail': True, 'code': code, 'reason': err[-600:]}
        elif kind == 'tiles':
            block, mask = args['block'], int(args['mask'])
            g, _, C, R = block.split('/')
            ids = ['%s/0/%d/%d' % (g, int(C) * 4 + (i & 3), int(R) * 4 + (i >> 2)) for i in range(16) if mask & (1 << i)]
            todo = [t for t in ids if not os.path.exists(self.path('tiles/%s/%s' % (build, t)))]
            if todo:
                a = ['--tiles', ','.join(todo)] if '--tiles' in self.caps else ['--block', block]
                code, err, out, peak, missing = self.compile(a, job, release)
                if missing:
                    return {'fail': True, 'code': 3, 'missingRegions': missing, 'reason': 'regions'}
                if code == 3:
                    # (a refused tile, no DEM: find which, one by one; the others compile as usual)
                    for t in todo:
                        if os.path.exists(self.path('tiles/%s/%s' % (build, t))):
                            continue
                        c2, e2, _, _, m2 = self.compile(['--tile', t, '--out', os.devnull], job, release)
                        if m2:
                            return {'fail': True, 'code': 3, 'missingRegions': m2, 'reason': 'regions'}
                        if c2 == 3:
                            refused.append(t)
                        elif c2 != 0:
                            return {'fail': True, 'code': c2, 'reason': e2[-600:]}
                elif code != 0:
                    return {'fail': True, 'code': code, 'reason': err[-600:]}
        elif kind == 'far':
            for k in args['keys']:
                code, err, out, peak, missing = self.compile(['--far', k, '--out', os.devnull], job, release)
                if code != 0:
                    return {'fail': True, 'code': code, 'reason': err[-600:], **({'missingRegions': missing} if missing else {})}
        elif kind == 'frame':
            if '--frame' not in self.caps:
                return {'fail': True, 'code': 2, 'reason': 'this compiler has no --frame (MogCity M2): set HOMETOWN_FRAME off on the web', 'final': True}
            pf = self.places_file(args)
            code, err, out, peak, missing = self.compile(['--frame', args['placeId'], '--places', pf], job, release)
            if missing:
                return {'fail': True, 'code': 3, 'missingRegions': missing, 'reason': 'regions'}
            if code != 0:
                return {'fail': True, 'code': code, 'reason': err[-600:]}
        elif kind == 'bundle':
            r = self.bundle(job, release)
            if r.get('fail'):
                return r
            outputs += r['outputs']
            peak = r.get('peak')
        elif kind == 'canary':
            tile = args['tile']
            out = os.path.join(self.work, 'canary-%d.bin' % os.getpid())
            code, err, _, peak, _ = self.compile(['--tile', tile, '--no-store', '--out', out], job, release)
            if code != 0:
                return {'fail': True, 'code': code, 'reason': err[-600:]}
            mine = sha(gzip.decompress(open(out, 'rb').read()))
            os.remove(out)
            stored = sha(gzip.decompress(open(self.path('tiles/%s/%s' % (build, tile)), 'rb').read()))
            return {'ok': True, 'outputs': [], 'refused': [], 'ms': int((time.time() - t0) * 1000), 'peak': peak, 'canaryMatch': mine == stored}
        else:
            return {'fail': True, 'code': 2, 'reason': 'unknown job kind ' + kind, 'final': True}
        if job.get('lost'):
            return {'lost': True}
        outputs += self.upload_new(t0)
        return {'ok': True, 'outputs': outputs, 'refused': refused, 'ms': int((time.time() - t0) * 1000), 'peak': peak}

    def places_file(self, args):
        f = os.path.join(self.work, 'places-%s-%d.json' % (args['placeId'], os.getpid()))
        json.dump({'format': 'hometown-places', 'places': {args['placeId']: args['gazetteer']}}, open(f, 'w'))
        return f

    def upload_region(self, dom, C, R, release):
        d = self.region_dir(dom, C, R)
        base = 'src/overture/%s/hg1-%s/4/%d/%d/' % (release, dom, C, R)
        files = {}
        try:
            for name in sorted(os.listdir(d)):
                if name.endswith('.parquet') or name == 'region.json':
                    b = open(os.path.join(d, name), 'rb').read()
                    files[name] = {'sha256': sha(b), 'bytes': len(b)}
                    self.put(base + name, b, sha(b))
            self.put(base + 'files.json', json.dumps({'format': 'hometown-region-files', 'files': files}, sort_keys=True).encode())
        except RuntimeError as e:
            # (another worker staged this region first: a second fetch of the same rows is other bytes (parquet is not
            # byte-stable), refused with 409. Take the staged copy, so every worker reads the very bytes the web holds)
            if ': 409 ' not in str(e):
                raise
            log(event='region-staged-elsewhere', region='%s:%d,%d' % (dom, C, R))
            shutil.rmtree(d, ignore_errors=True)
            if self.stage_regions('%s:%d,%d' % (dom, C, R), release):
                raise
        return base + 'files.json'

    def bundle(self, job, release):
        """A playable package of one window: the full town (compile.py --id: the legacy assembler over the stored tiles)
        or a district (compile.py --assemble --window, MogCity M4). Uploaded file by file, bundle.json last."""
        args, build = job['args'], job['build']
        pid, variant = args['placeId'], args['variant']
        pf = self.places_file(args)
        out = os.path.join(self.work, 'out-%s-%d' % (pid, os.getpid()))
        shutil.rmtree(out, ignore_errors=True)
        fr = self.path('frames/%s/%s.json' % (build, pid))
        if '--assemble' in self.caps:
            # (compiler 0.7.0+: the windowed assembler, frame-pinned when the frame is stored, writing the bundle itself.
            # A district lists NO far tiles (--far-mode none): its bytes then depend only on the frame and its tiles, so
            # a retried job re-uploads the very same bytes (objects never change); the full bundle compiles its far field)
            a = ['--assemble', pid, '--window', 'full' if variant == 'full' else 'district', '--places', pf, '--out', out]
            if os.path.exists(fr):
                a += ['--frame', fr]
            elif variant != 'full':
                return {'fail': True, 'code': 2, 'reason': 'a district bundle needs its frame (frames/%s/%s.json not an input)' % (build, pid)}
            if variant != 'full':
                a += ['--far-mode', 'none']
        elif variant == 'full':
            a = ['--id', pid, '--places', pf, '--out', out]
        else:
            return {'fail': True, 'code': 2, 'reason': 'this compiler has no --assemble (MogCity M4)', 'final': True}
        code, err, _, peak, missing = self.compile(a, job, release)
        if missing:
            return {'fail': True, 'code': 3, 'missingRegions': missing, 'reason': 'regions'}
        if code != 0:
            return {'fail': True, 'code': code, 'reason': err[-600:]}
        if '--assemble' in self.caps:
            return self.send_bundle(job, out, peak)
        pk = os.path.join(out, pid)
        man = json.load(open(os.path.join(pk, 'manifest.json')))
        for f, e in man['files'].items():
            if sha(open(os.path.join(pk, f), 'rb').read()) != e['sha256']:
                return {'fail': True, 'code': 2, 'reason': 'package file %s differs from its manifest' % f}
        g = open(os.path.join(pk, 'geodata.js'), encoding='utf8').read()

        def one(k):
            m = re.search(r'^window\.NYC\.%s = (.*);$' % k, g, re.M)
            if not m:
                raise RuntimeError('geodata.js: no window.NYC.' + k)
            return json.loads(m.group(1))
        GEO, PLACE_DATA, PKG = one('GEO'), one('PLACE_DATA'), one('PKG')
        lock = PKG.get('lock') or {}
        tiles_id = lock.get('tiles')
        if lock.get('place') != pid or lock.get('buildId') != build or not re.match(r'^[0-9a-f]{64}$', tiles_id or ''):
            return {'fail': True, 'code': 2, 'reason': 'the package lock is not this town\'s: ' + json.dumps(lock)[:300], 'final': True}
        # (the build's objects first: tiles, far tiles and the manifest the assembler wrote into the store; then the bundle)
        outputs = self.upload_new(job['t0'])
        base = 'bundles/%s/%s/%s/%s/' % (build, pid, tiles_id, variant)
        files = {}

        def send(name, b):
            files[name] = {'sha256': sha(b), 'bytes': len(b)}
            self.put(base + name, b, sha(b))
        send('geodata.json', json.dumps({'format': 'hometown-bundle', 'formatVersion': 1, 'GEO': GEO, 'PLACE_DATA': PLACE_DATA, 'PKG': PKG}, separators=(',', ':')).encode())
        send('lock.json', json.dumps(lock, separators=(',', ':')).encode())
        for f in sorted(man['files']):
            if re.match(r'^data/(terrain|buildings|groundmask)\.bin\.gz$', f) or re.match(r'^data/far/[a-c]-[0-9]{1,6}-[0-9]{1,6}\.bin\.gz$', f):
                send(f, open(os.path.join(pk, f), 'rb').read())
        bj = {'format': 'hometown-bundle-files', 'buildId': build, 'placeId': pid, 'tilesId': tiles_id, 'variant': variant, 'files': files}
        self.put(base + 'bundle.json', json.dumps(bj, sort_keys=True).encode())
        shutil.rmtree(out, ignore_errors=True)
        return {'outputs': outputs + [base + 'bundle.json'], 'peak': peak}

    def send_bundle(self, job, out, peak):
        """Upload a bundle the compiler wrote (--assemble ... --out <dir>: geodata.json, lock.json, data/*.bin.gz and its
        own bundle.json): checked against the compiler's list, then the web's bundle.json (format hometown-bundle-files) LAST."""
        args, build = job['args'], job['build']
        pid, variant = args['placeId'], args['variant']
        cb = json.load(open(os.path.join(out, 'bundle.json')))
        lock = json.load(open(os.path.join(out, 'lock.json')))
        tiles_id = cb.get('tilesId')
        if cb.get('place') != pid or cb.get('buildId') != build or lock.get('tiles') != tiles_id or not re.match(r'^[0-9a-f]{64}$', tiles_id or ''):
            return {'fail': True, 'code': 2, 'reason': 'the bundle is not this town\'s: ' + json.dumps({k: cb.get(k) for k in ('place', 'buildId', 'tilesId', 'variant')})[:300], 'final': True}
        if cb.get('variant') != variant:
            return {'fail': True, 'code': 2, 'reason': 'the compiler made variant %s, the job asked %s' % (cb.get('variant'), variant), 'final': True}
        for f, e in cb['files'].items():
            if sha(open(os.path.join(out, f), 'rb').read()) != e['sha256']:
                return {'fail': True, 'code': 2, 'reason': 'bundle file %s differs from its list' % f}
        # (the build's objects first: far tiles, the stage-2 manifest and anything else the assembler stored; then the bundle)
        outputs = self.upload_new(job['t0'])
        base = 'bundles/%s/%s/%s/%s/' % (build, pid, tiles_id, variant)
        files = {}
        for f in sorted(cb['files']):
            if f in ('geodata.json', 'lock.json') or re.match(r'^data/(terrain|buildings|groundmask)\.bin\.gz$', f) or re.match(r'^data/far/[a-c]-[0-9]{1,6}-[0-9]{1,6}\.bin\.gz$', f):
                b = open(os.path.join(out, f), 'rb').read()
                files[f] = {'sha256': sha(b), 'bytes': len(b)}
                self.put(base + f, b, sha(b))
        bj = {'format': 'hometown-bundle-files', 'buildId': build, 'placeId': pid, 'tilesId': tiles_id, 'variant': variant, 'files': files, 'farRefs': cb.get('farRefs', [])}
        self.put(base + 'bundle.json', json.dumps(bj, sort_keys=True).encode())
        shutil.rmtree(out, ignore_errors=True)
        return {'outputs': outputs + [base + 'bundle.json'], 'peak': peak}

    # ---- the loop
    def heartbeat(self, job):
        while not job.get('done'):
            time.sleep(job.get('heartbeatMs', 15000) / 1000)
            if job.get('done'):
                return
            try:
                st, _ = self.web.call('POST', 'heartbeat', {'key': job['key'], 'leaseId': job['leaseId'], 'worker': self.id}, retry_s=45)
            except RuntimeError:
                continue
            if st == 410:
                log(event='lease-lost', key=job['key'])
                job['lost'] = True
                p = job.get('child')
                if p and p.poll() is None:
                    os.killpg(p.pid, signal.SIGKILL)
                return

    def execute(self, job):
        job['t0'] = time.time()
        hb = threading.Thread(target=self.heartbeat, args=(job,), daemon=True)
        hb.start()
        try:
            try:
                r = self.do_job(job)
            except Exception as e:  # noqa: BLE001
                r = {'fail': True, 'code': 1, 'reason': '%s: %s' % (type(e).__name__, str(e)[:500])}
            job['done'] = True
            if job.get('lost') or r.get('lost'):
                return
            if r.get('ok'):
                body = {'key': job['key'], 'leaseId': job['leaseId'], 'outputs': r['outputs'], 'refused': r.get('refused', []), 'ms': r['ms'], 'peakMB': r.get('peak')}
                if 'canaryMatch' in r:
                    body['canaryMatch'] = r['canaryMatch']
                st, j = self.web.jcall('POST', 'complete', body)
                log(event='done', key=job['key'], kind=job['kind'], ms=r['ms'], peakMB=r.get('peak'), status=st, outputs=len(r['outputs']), **({'web': j} if st != 200 else {}))
            else:
                body = {'key': job['key'], 'leaseId': job['leaseId'], 'code': r.get('code', 1), 'reason': r.get('reason', ''), 'final': bool(r.get('final'))}
                if r.get('missingRegions'):
                    body['missingRegions'] = r['missingRegions']
                st, j = self.web.jcall('POST', 'fail', body)
                log(event='fail', key=job['key'], kind=job['kind'], code=body['code'], reason=body['reason'][-300:], status=st, **({'regionsJob': j.get('regionsJob')} if j.get('regionsJob') else {}))
        except RuntimeError as e:
            log(event='report-lost', key=job['key'], why=str(e)[:300])
        finally:
            job['done'] = True
            with self.lock:
                self.used -= job.get('held', job.get('weight', 1))
                self.running.pop(job['key'], None)
            self.evict()

    def evict(self):
        """Keep the local cache under HOMETOWN_CACHE_GB: the least recently used regions first, then old store objects."""
        def size(p):
            n = 0
            for d, _, fs in os.walk(p):
                for f in fs:
                    try:
                        n += os.lstat(os.path.join(d, f)).st_size
                    except OSError:
                        pass
            return n
        total = size(os.path.join(self.data, 'regions')) + size(self.store)
        if total <= self.cache_cap:
            return
        regs = []
        root = os.path.join(self.data, 'regions')
        for d, dirs, fs in os.walk(root):
            if 'region.json' in fs:
                regs.append((os.stat(d).st_mtime, d))
        for _, d in sorted(regs):
            if total <= self.cache_cap * 0.8:
                break
            n = size(d)
            shutil.rmtree(d, ignore_errors=True)
            total -= n
        log(event='evict', bytes=total)

    def stop(self, *_):
        if not self.draining:
            log(event='draining', running=list(self.running))
        self.draining = True

    def main(self):
        signal.signal(signal.SIGTERM, self.stop)
        signal.signal(signal.SIGINT, self.stop)
        log(event='start', worker=self.id, build=self.build, slots=self.slots, cpus=self.cpus, memGB=round(self.mem / GB, 2), caps=sorted(self.caps),
            image=self.env.get('HOMETOWN_IMAGE_DIGEST', 'unpinned (local venv)'), version=VERSION)
        # the build record first: a manifest is refused until its build's record is stored
        bk = 'builds/%s.json' % self.build
        if os.path.exists(self.path(bk)):
            self.put_store_object(bk)
        idle = 0
        while True:
            if self.draining:
                if not self.running:
                    log(event='stopped')
                    return
                time.sleep(0.5)
                continue
            if os.environ.get('HOMETOWN_WORKER_PAUSED') == '1':
                time.sleep(10)
                continue
            with self.lock:
                free = self.slots - self.used
            if free <= 0:
                time.sleep(0.2)
                continue
            try:
                st, j = self.web.jcall('POST', 'claim', {'worker': self.id, 'build': self.build, 'freeSlots': free, 'totalSlots': self.slots, 'cached': self.cached_regions(),
                                                          'version': VERSION, 'memFreeMB': None}, timeout=40)
            except RuntimeError as e:
                log(event='web-down', why=str(e)[:200])
                continue
            if st == 204:
                idle += 1
                if self.once and idle >= 1 and not self.running:
                    log(event='idle-exit')
                    return
                continue
            if st != 200:
                log(event='claim-refused', status=st, body=j)
                time.sleep(5)
                continue
            idle = 0
            job = dict(j)
            job['weight'] = 2 if job['kind'] == 'regions' else 1
            log(event='claimed', key=job['key'], kind=job['kind'], prio=job.get('prio'), inputs=len(job.get('inputs', [])))
            with self.lock:
                job['held'] = min(job['weight'], self.slots)
                self.used += job['held']
                self.running[job['key']] = job
            threading.Thread(target=self.execute, args=(job,), daemon=True).start()


if __name__ == '__main__':
    Worker().main()
