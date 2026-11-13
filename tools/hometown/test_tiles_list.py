# tools/hometown/test_tiles_list.py: compile.py --tiles (a tile list in one World: the builder's tile job) is pure. Its
# bytes for each tile equal --tile of that tile alone and the same child of --block, and the whole-town build's (--id)
# copy when the store has one; --far-list equals --far per far tile. Runs the CLI itself (the subprocess contract), on
# the fetched Okemah regions (HOMETOWN_TEST_DATA / HOMETOWN_TEST_STORE; skipped without them). A scratch store holds the
# new compiles; it shares the real store's builds, ctx and DEM mirror (inputs) by symlink, never its tiles.
#   <venv>/bin/python tools/hometown/test_tiles_list.py          (HOMETOWN_TEST_NO_BLOCK=1: skip the 16-tile --block)
import gzip
import os
import shutil
import struct
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
ROOT = os.path.abspath(os.path.join(HERE, '../..'))
DATA = os.environ.get('HOMETOWN_TEST_DATA', os.path.join(ROOT, '.scratch/hometown-m2/data'))
STORE = os.environ.get('HOMETOWN_TEST_STORE', os.path.join(ROOT, '.scratch/hometown/store'))
# two tiles of one L2 block in Okemah's spawn district, and two far tiles (tier a and b)
TILES = os.environ.get('HOMETOWN_TEST_TILES', 'hg1-conus/0/5805/8582,hg1-conus/0/5806/8582').split(',')
FARS = os.environ.get('HOMETOWN_TEST_FARS', 'hg1-conus/1/2902/4291,hg1-conus/3/725/1072').split(',')


def stream(b):
    """HTB1 -> {id: bytes | ('refused', reason)}"""
    assert b[:4] == b'HTB1', b[:16]
    o, out = 4, {}
    while o < len(b):
        n = struct.unpack('<I', b[o:o + 4])[0]
        tid = b[o + 4:o + 4 + n].decode()
        o += 4 + n
        m = struct.unpack('<I', b[o:o + 4])[0]
        o += 4
        if m == 0xffffffff:
            k = struct.unpack('<I', b[o:o + 4])[0]
            out[tid] = ('refused', b[o + 4:o + 4 + k].decode())
            o += 4 + k
        else:
            out[tid] = b[o:o + m]
            o += m
    return out


@unittest.skipUnless(os.path.isdir(os.path.join(DATA, 'regions')) and os.path.isdir(os.path.join(STORE, 'dem')), 'no fetched regions / store')
class TilesList(unittest.TestCase):
    @staticmethod
    def scratch_store(prefix):
        d = tempfile.mkdtemp(prefix=prefix)
        for k in ('builds', 'ctx', 'dem'):
            if os.path.isdir(os.path.join(STORE, k)):
                os.symlink(os.path.join(STORE, k), os.path.join(d, k))
        return d

    @classmethod
    def setUpClass(cls):
        cls.tmp = cls.scratch_store('ht-tiles-')
        cls.tmp2 = cls.scratch_store('ht-blk-')

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp, ignore_errors=True)
        shutil.rmtree(cls.tmp2, ignore_errors=True)

    def run_cli(self, *args, store=None):
        r = subprocess.run([sys.executable, os.path.join(HERE, 'compile.py'), '--data', DATA, '--store', store or self.tmp, *args],
                           capture_output=True, timeout=3600)
        self.assertEqual(r.returncode, 0, r.stderr.decode()[-2000:])
        return r.stdout

    def test_tiles_equal_tile_and_block_and_whole(self):
        got = stream(self.run_cli('--tiles', ','.join(TILES), '--out', '-'))
        self.assertEqual(sorted(got), sorted(TILES))
        bid = None
        for t in TILES:
            self.assertIsInstance(got[t], bytes, got[t])
            alone = self.run_cli('--tile', t, '--out', '-')
            self.assertEqual(got[t], alone, '%s: --tiles == --tile' % t)
            h = gzip.decompress(alone)
            n = struct.unpack('<I', h[4:8])[0]
            bid = __import__('json').loads(h[8:8 + n])['buildId']
            # (the whole-town build's copy, when the real store has it: compile.py --id)
            whole = os.path.join(STORE, 'tiles', bid, *t.split('/'))
            if os.path.exists(whole):
                self.assertEqual(open(whole, 'rb').read(), alone, '%s: == the whole-town build' % t)
        if os.environ.get('HOMETOWN_TEST_NO_BLOCK'):
            return
        import grid
        dom, _, c, r = grid.parse_tile_id(TILES[0])
        blk = grid.tile_id(dom, c >> grid.BLOCK_L, r >> grid.BLOCK_L, grid.BLOCK_L)
        kids = stream(self.run_cli('--block', blk, '--out', '-', store=self.tmp2))   # (a store without the --tiles copies: compiled afresh)
        for t in TILES:
            self.assertEqual(kids[t], got[t], '%s: --tiles == --block %s' % (t, blk))

    def test_far_list_equals_far(self):
        got = stream(self.run_cli('--far-list', ','.join(FARS), '--out', '-', '--no-store'))
        self.assertEqual(sorted(got), sorted(FARS))
        for f in FARS:
            self.assertEqual(got[f], self.run_cli('--far', f, '--out', '-', '--no-store'), f)


if __name__ == '__main__':
    unittest.main(verbosity=2)
