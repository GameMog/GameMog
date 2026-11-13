# tools/hometown/test_assemble_window.py: compile.py --assemble (a bundle over a window, pinned to a frame). Two runs of
# the same window give the same bytes (every file); the district and the full bundle carry the same lock (v3) and the
# frame's yOffset, waterLevel, spawns and places; PKG.window / PKG.variant say which; far tiles are referenced by store
# key, never copied; the district holds the frame's 5 x 5 tiles, its arrivals only inside it; bundle.json lists every
# file with its sha256. On the fetched Okemah regions with the town's tiles stored (compile.py --id okemah first), else
# skipped. HOMETOWN_TEST_FULL=1 also assembles the full window twice.
#   <venv>/bin/python tools/hometown/test_assemble_window.py
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
ROOT = os.path.abspath(os.path.join(HERE, '../..'))
DATA = os.environ.get('HOMETOWN_TEST_DATA', os.path.join(ROOT, '.scratch/hometown-m2/data'))
STORE = os.environ.get('HOMETOWN_TEST_STORE', os.path.join(ROOT, '.scratch/hometown/store'))
PLACE = os.environ.get('HOMETOWN_TEST_PLACE', 'okemah')


def files_of(d):
    out = {}
    for r, _, fs in os.walk(d):
        for f in fs:
            p = os.path.join(r, f)
            out[os.path.relpath(p, d)] = open(p, 'rb').read()
    return out


@unittest.skipUnless(os.path.isdir(os.path.join(DATA, 'regions')) and os.path.isdir(os.path.join(STORE, 'tiles')), 'no fetched regions / store')
class AssembleWindow(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp(prefix='ht-asm-')
        cls.frame = os.path.join(cls.tmp, 'frame.json')
        cls.cli('--frame', PLACE, '--out', cls.frame)
        cls.F = json.load(open(cls.frame))

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp, ignore_errors=True)

    @staticmethod
    def cli(*args):
        r = subprocess.run([sys.executable, os.path.join(HERE, 'compile.py'), '--data', DATA, '--store', STORE, *args], capture_output=True, timeout=3600)
        if r.returncode != 0:
            raise AssertionError(r.stderr.decode()[-3000:])
        return r.stdout

    def bundle(self, window, n):
        out = os.path.join(self.tmp, '%s-%d' % (window, n))
        self.cli('--assemble', PLACE, '--window', window, '--frame', self.frame, '--out', out)
        return out, files_of(out)

    def check_bundle(self, d, fs, window):
        F = self.F
        g = json.loads(fs['geodata.json'])
        P = g['PKG']
        self.assertEqual(g['format'], 'hometown-bundle')
        self.assertEqual(P['lock'], F['lock'])
        self.assertEqual(json.loads(fs['lock.json']), F['lock'])
        self.assertEqual(P['lock']['formatVersion'], 3)
        for k in ('yOffset', 'waterLevel', 'spawn', 'spawns', 'places'):
            self.assertEqual(P[k], F[k], k)
        self.assertEqual(P['variant'], F['district']['variant'] if window == 'district' else 'full')
        self.assertEqual(P['window']['full'], window == 'full')
        self.assertEqual(P['tiles'], F['district']['tiles'] if window == 'district' else F['tiles'])
        self.assertTrue(all('key' in t and 'url' not in t for t in P['far']['tiles']), 'far tiles by key')
        self.assertFalse([k for k in fs if k.startswith('data/far/')], 'no far copies')
        bj = json.loads(fs['bundle.json'])
        for k, v in bj['files'].items():
            self.assertEqual(hashlib.sha256(fs[k]).hexdigest(), v['sha256'], k)
        self.assertEqual(set(bj['files']), set(fs) - {'bundle.json'})
        if window == 'district':
            b = P['window']['box']
            for k, s in g['PLACE_DATA']['regional'].items():
                self.assertTrue(b['x0'] + 150 <= s['x'] <= b['x1'] - 150 and b['z0'] + 150 <= s['z'] <= b['z1'] - 150, k)

    def test_district_deterministic(self):
        d1, f1 = self.bundle('district', 1)
        d2, f2 = self.bundle('district', 2)
        self.assertEqual(sorted(f1), sorted(f2))
        for k in f1:
            self.assertEqual(f1[k], f2[k], k)
        self.check_bundle(d1, f1, 'district')

    @unittest.skipUnless(os.environ.get('HOMETOWN_TEST_FULL'), 'HOMETOWN_TEST_FULL=1 for the full window')
    def test_full_deterministic(self):
        d1, f1 = self.bundle('full', 1)
        d2, f2 = self.bundle('full', 2)
        for k in f1:
            self.assertEqual(f1[k], f2[k], k)
        self.check_bundle(d1, f1, 'full')


if __name__ == '__main__':
    unittest.main(verbosity=2)
