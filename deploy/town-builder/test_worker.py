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


if __name__ == '__main__':
    unittest.main()
