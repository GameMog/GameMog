"""Unit tests for deploy/town-builder/worker.py (standard library only; no compiler, no web):
    python3 deploy/town-builder/test_worker.py
The end-to-end run with the real compiler and a local web is deploy/town-builder/dry-run.sh."""
import gzip
import hashlib
import json
import os
import shutil
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import importlib.util
spec = importlib.util.spec_from_file_location('worker', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'worker.py'))
W = importlib.util.module_from_spec(spec)
spec.loader.exec_module(W)


class Capacity(unittest.TestCase):
    def with_cgroup(self, cpu, mem):
        real = W._read
        W._read = lambda p: cpu if p.endswith('cpu.max') else mem if p.endswith('memory.max') else None
        try:
            return W.capacity(1.5)
        finally:
            W._read = real

    def test_pro_plus(self):
        # 4 CPU / 8 GB: min(4, (8 - 0.75) / 1.5 = 4.8) = 4 slots
        self.assertEqual(self.with_cgroup('400000 100000', str(8 * W.GB))[0], 4)

    def test_memory_bound(self):
        # 4 CPU / 4 GB: (4 - 0.75) / 1.5 = 2 slots
        self.assertEqual(self.with_cgroup('400000 100000', str(4 * W.GB))[0], 2)

    def test_at_least_one(self):
        self.assertEqual(self.with_cgroup('50000 100000', str(1 * W.GB))[0], 1)


class Regions(unittest.TestCase):
    def test_both_messages(self):
        self.assertEqual(W.missing_regions('x (tools/hometown/fetch.py --regions conus:362,536;363,536)', 'conus'), 'conus:362,536;363,536')
        self.assertEqual(W.missing_regions('{"refused":"no region of [(362, 536), (363, 537)] fetched"}', 'conus'), 'conus:362,536;363,537')
        self.assertIsNone(W.missing_regions('{"refused":"tile hg1-conus/0/1/1 has no DEM"}', 'conus'))

    def test_domain(self):
        self.assertEqual(W.job_domain({'args': {'ctx': 'hg1-hi/4/1/2'}}), 'hi')
        self.assertEqual(W.job_domain({'args': {'gazetteer': {'geoid': '0203000'}}}), 'ak')


class Keys(unittest.TestCase):
    def test_upload_families(self):
        ok = ['tiles/htc-0.5.0-hg1-b193e041e/hg1-conus/0/5806/4290', 'ctx/htc-0.5.0-hg1-b193e041e/hg1-conus/4/362/268', 'dem/13/n36w097/abc123-4567/7.bin',
              'far/htc-0.5.0-hg1-b193e041e/hg1-conus/3/1/2', 'manifests/htc-0.5.0-hg1-b193e041e/us-4054200.json', 'builds/htc-0.5.0-hg1-b193e041e.json']
        for k in ok:
            self.assertTrue(W.KEY_OK[k.split('/')[0]].match(k), k)
        for k in ['dem/current.json', 'dem/snapshots/dem-12b3e06663843b4d.json', 'tiles/x/hg1-conus/0/1/1.tmp']:
            fam = k.split('/')[0]
            self.assertFalse(W.KEY_OK[fam].match(k) and '.tmp' not in k, k)

    def test_order_lists_last(self):
        self.assertLess(W.ORDER.index('tiles'), W.ORDER.index('manifests'))
        self.assertLess(W.ORDER.index('builds'), W.ORDER.index('tiles'))


class FakeWeb(BaseHTTPRequestHandler):
    objects = {}
    puts = []
    fail_first = {'n': 0}

    def log_message(self, *a):
        pass

    def _send(self, code, body=b'', ctype='application/json'):
        self.send_response(code)
        self.send_header('content-type', ctype)
        self.send_header('content-length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        k = self.path.split('/api/hometown/worker/objects/', 1)[-1]
        if k in self.objects:
            self._send(200, self.objects[k], 'application/octet-stream')
        else:
            self._send(404, b'{}')

    def do_PUT(self):
        if self.fail_first['n'] > 0:
            self.fail_first['n'] -= 1
            self._send(503, b'{}')
            return
        n = int(self.headers['content-length'])
        b = self.rfile.read(n)
        k = self.path.split('/api/hometown/worker/objects/', 1)[-1]
        s = self.headers.get('x-content-sha256')
        self.puts.append((k, s))
        self.objects[k] = b
        self._send(201, json.dumps({'created': True}).encode())


class WebAndRegions(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.srv = ThreadingHTTPServer(('127.0.0.1', 0), FakeWeb)
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()
        cls.base = 'http://127.0.0.1:%d' % cls.srv.server_address[1]

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()

    def worker(self, tmp):
        w = W.Worker.__new__(W.Worker)
        w.web = W.Web(self.base, 't' * 30)
        w.work, w.store, w.data = tmp, os.path.join(tmp, 'store'), os.path.join(tmp, 'data')
        w.downloaded = set()
        os.makedirs(w.store)
        os.makedirs(w.data)
        return w

    def test_staged_region_downloaded_and_checked(self):
        tmp = tempfile.mkdtemp()
        try:
            base = 'src/overture/2026-10-21.0/hg1-conus/4/362/268/'
            pq, rj = b'PAR1' + b'x' * 20 + b'PAR1', b'{"grid":"hg1"}'
            FakeWeb.objects[base + 'overture-base-water.parquet'] = pq
            FakeWeb.objects[base + 'region.json'] = rj
            FakeWeb.objects[base + 'files.json'] = json.dumps({'files': {'overture-base-water.parquet': {'sha256': hashlib.sha256(pq).hexdigest()},
                                                                         'region.json': {'sha256': hashlib.sha256(rj).hexdigest()}}}).encode()
            w = self.worker(tmp)
            left = w.stage_regions('conus:362,268;362,269', '2026-10-21.0')
            self.assertEqual(left, 'conus:362,269')
            self.assertTrue(os.path.exists(os.path.join(w.region_dir('conus', 362, 268), 'region.json')))
            self.assertEqual(w.cached_regions(), ['conus/362/268'])
        finally:
            shutil.rmtree(tmp)

    def test_one_region_staged_by_many_jobs_at_once(self):
        # (a fresh worker's slots all needing the same region: before the fix they shared one temp folder and removed
        # each other's files, so compiles found 'No files found' and the jobs failed three times)
        tmp = tempfile.mkdtemp()
        try:
            base = 'src/overture/2026-10-21.0/hg1-conus/4/362/270/'
            files = {}
            for i in range(6):
                pq = b'PAR1' + bytes([i]) * 200000 + b'PAR1'
                FakeWeb.objects[base + 'overture-l%d.parquet' % i] = pq
                files['overture-l%d.parquet' % i] = {'sha256': hashlib.sha256(pq).hexdigest()}
            FakeWeb.objects[base + 'files.json'] = json.dumps({'files': files}).encode()
            w = self.worker(tmp)
            out = []
            ts = [threading.Thread(target=lambda: out.append(w.stage_regions('conus:362,270', '2026-10-21.0'))) for _ in range(4)]
            for t in ts:
                t.start()
            for t in ts:
                t.join()
            self.assertEqual(out, [None] * 4)
            d = w.region_dir('conus', 362, 270)
            self.assertEqual(sorted(os.listdir(d)), sorted(files))
            self.assertEqual([n for n in os.listdir(os.path.dirname(d)) if '.dl-' in n], [])
        finally:
            shutil.rmtree(tmp)

    def test_uploads_hash_and_retry_while_web_is_down(self):
        tmp = tempfile.mkdtemp()
        try:
            w = self.worker(tmp)
            raw = b'HTL1' + b'y' * 40
            k = 'tiles/htc-0.5.0-hg1-b193e041e/hg1-conus/0/1/2'
            p = w.path(k)
            os.makedirs(os.path.dirname(p))
            open(p, 'wb').write(gzip.compress(raw))
            FakeWeb.fail_first['n'] = 2  # the web answers 503 twice (a deploy), then takes it
            got = w.upload_new(0)
            self.assertEqual(got, [k])
            self.assertIn((k, hashlib.sha256(raw).hexdigest()), FakeWeb.puts)
            self.assertEqual(w.upload_new(0), [])  # (uploaded once)
        finally:
            shutil.rmtree(tmp)


class StubWeb:
    """Answers the claim loop without a network: a list of (status, body) for successive claims, then 204s."""
    def __init__(self, answers):
        self.answers = list(answers)
        self.claims = 0

    def jcall(self, method, path, body=None, **kw):
        if path == 'claim':
            self.claims += 1
            return self.answers.pop(0) if self.answers else (204, {})
        return 200, {}


def loop_worker(web, **env):
    """A Worker with only what main() reads (no compiler, no web): HOMETOWN_ONCE, the idle window and the cap from env."""
    w = object.__new__(W.Worker)
    w.web, w.build, w.slots, w.cpus, w.mem, w.caps, w.env = web, 'htc-0.7.0-hg1-b00000000', 2, 2, 4 * W.GB, set(), {}
    w.id, w.lock, w.used, w.running, w.draining, w.store = 'run-test', threading.Lock(), 0, {}, False, tempfile.mkdtemp()
    w.once = env.get('once', True)
    w.idle_s, w.cap_s, w.t_start = env.get('idle_s', 0.0), env.get('cap_s', 0.0), W.time.time()
    w.stats = {'claimed': 0, 'done': 0, 'failed': 0, 'regions': 0}
    w.cached_regions = lambda: []
    def execute(job):
        W.time.sleep(0.2)
        with w.lock:
            w.stats['done'] += 1
            w.used -= job['held']
            w.running.pop(job['key'], None)
    w.execute = execute
    return w


class Once(unittest.TestCase):
    """A Workflows run (HOMETOWN_ONCE=1) returns instead of waiting: idle, paused, refused, or at its cap."""
    def test_idle_exit_after_the_jobs(self):
        job = (200, {'key': 'tiles:a', 'kind': 'tiles', 'leaseId': 'l', 'args': {}})
        w = loop_worker(StubWeb([job, (200, dict(job[1], key='tiles:b'))]), idle_s=0.3)
        s = w.main()
        self.assertEqual((s['exit'], s['claimed'], s['done'], s['build']), ('idle', 2, 2, w.build))
        self.assertGreaterEqual(w.web.claims, 3)

    def test_a_p0_only_poll_never_ends_the_run(self):
        # 2 slots, one job running: the claim goes out with 1 free slot (P0 only) and comes back 204 after the job is
        # done. That 204 is not idle: the run must claim again with both slots free (where P1 work is) before ending.
        job = (200, {'key': 'tiles:a', 'kind': 'tiles', 'leaseId': 'l', 'args': {}})
        p1 = (200, {'key': 'tiles:p1', 'kind': 'tiles', 'leaseId': 'l', 'args': {}})
        web = StubWeb([job])
        real = web.jcall
        def jcall(method, path, body=None, **kw):
            if path == 'claim' and body['freeSlots'] < 2:
                W.time.sleep(0.4)  # (the long-poll outlives the job)
                return 204, {}
            if path == 'claim' and web.claims == 1:
                web.claims += 1
                return p1
            return real(method, path, body, **kw)
        web.jcall = jcall
        w = loop_worker(web, idle_s=0.1)
        s = w.main()
        self.assertEqual((s['exit'], s['claimed'], s['done']), ('idle', 2, 2))

    def test_paused_returns_at_once(self):
        os.environ['HOMETOWN_WORKER_PAUSED'] = '1'
        try:
            w = loop_worker(StubWeb([]))
            self.assertEqual(w.main()['exit'], 'paused')
            self.assertEqual(w.web.claims, 0)
        finally:
            del os.environ['HOMETOWN_WORKER_PAUSED']

    def test_refused_returns(self):
        w = loop_worker(StubWeb([(404, {})]))
        self.assertEqual(w.main()['exit'], 'refused-404')

    def test_cap_drains(self):
        job = (200, {'key': 'tiles:a', 'kind': 'tiles', 'leaseId': 'l', 'args': {}})
        w = loop_worker(StubWeb([(200, dict(job[1], key='tiles:%d' % i)) for i in range(50)]), cap_s=0.5, idle_s=60)
        s = w.main()
        self.assertEqual(s['exit'], 'cap')
        self.assertEqual(s['claimed'], s['done'])
        self.assertLess(s['seconds'], 5)


spec2 = importlib.util.spec_from_file_location('workflow', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'workflow.py'))
WF = importlib.util.module_from_spec(spec2)
spec2.loader.exec_module(WF)


class Workflow(unittest.TestCase):
    def test_slots_per_plan(self):
        self.assertEqual({p: WF.slots_of(p, 1.5) for p in WF.PLANS}, {'2c-4g': 2, '2c-8g': 2, '4c-8g': 4, '4c-16g': 4, '8c-32g': 8})

    def test_timeout_covers_the_cap_and_a_job(self):
        self.assertGreaterEqual(WF.TIMEOUT_S, WF.CAP_S + 1800)
        self.assertLessEqual(WF.TIMEOUT_S, 86400)

    def test_environment_pins_and_paths(self):
        keep = dict(os.environ)
        try:
            for k in ('HOMETOWN_SLOTS', 'HOMETOWN_PYTHON', 'HOMETOWN_IMAGE_ID_FILE', 'HOMETOWN_WORKER_ID'):
                os.environ.pop(k, None)
            e = WF.environment('trn-abc')
            self.assertEqual((e['HOMETOWN_ONCE'], e['PYTHONHASHSEED'], e['HOMETOWN_WORKER_ID']), ('1', '0', 'run-trn-abc'))
            self.assertTrue(e['HOMETOWN_PYTHON'].startswith(WF.TB) and e['HOMETOWN_IMAGE_ID_FILE'] == os.path.join(WF.TB, 'image-id'))
            self.assertIn('AVX512F', e['NPY_DISABLE_CPU_FEATURES'])
            self.assertEqual(e['HOMETOWN_SLOTS'], str(WF.slots_of(WF.PLAN, 1.5)))
            # (every pin reaches a compile child: worker.py's allowlist)
            for k in WF.PINNED_ENV:
                self.assertIn(k, W.ENV_ALLOW)
        finally:
            os.environ.clear()
            os.environ.update(keep)


if __name__ == '__main__':
    unittest.main()
