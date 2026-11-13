# tools/hometown/test_dem_pin.py: the DEM snapshot pin (dem.py) and the hg1 verifier fixes in the compiler.
#   <venv>/bin/python tools/hometown/test_dem_pin.py
# Offline: the network is a fake (dem._get / the S3 lister patched), the store a temp dir.
import io
import json
import os
import struct
import sys
import tempfile
import unittest
import urllib.error

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import dem  # noqa: E402
import compile as C  # noqa: E402


def page(keys, token=None):
    xs = ''.join('<Contents><Key>%s</Key><LastModified>2025-01-07T21:54:50.000Z</LastModified><ETag>&quot;%s&quot;</ETag><Size>%d</Size>'
                 '<StorageClass>STANDARD</StorageClass></Contents>' % (k, e, n) for k, e, n in keys)
    tail = '<IsTruncated>true</IsTruncated><NextContinuationToken>%s</NextContinuationToken>' % token if token else '<IsTruncated>false</IsTruncated>'
    return '<?xml version="1.0"?><ListBucketResult>%s%s</ListBucketResult>' % (tail, xs)


def tiff_header(w=1024, h=1024, tw=512, th=512, ntiles=4):
    """A minimal little-endian classic TIFF IFD with the tags COG._parse reads."""
    entries, extra = [], b''
    base = 8 + 2 + 12 * 14 + 4

    def arr(fmt, vals):
        nonlocal extra
        off = base + len(extra)
        extra += struct.pack('<' + fmt * len(vals), *vals)
        return off
    offs = arr('I', [10000 + 100 * k for k in range(ntiles)])
    cnts = arr('I', [64] * ntiles)
    scale = arr('d', [1 / 10800, 1 / 10800, 0])
    tie = arr('d', [0, 0, 0, -97.000555, 36.000555, 0])
    nod = base + len(extra)
    extra += b'-999999\x00'
    for tag, typ, c, v in [(256, 3, 1, w), (257, 3, 1, h), (258, 3, 1, 32), (259, 3, 1, 5), (317, 3, 1, 3), (322, 3, 1, tw), (323, 3, 1, th),
                           (324, 4, ntiles, offs), (325, 4, ntiles, cnts), (33550, 12, 3, scale), (33922, 12, 6, tie), (42113, 2, 8, nod),
                           (262, 3, 1, 1), (277, 3, 1, 1)]:
        entries.append(struct.pack('<HHII', tag, typ, c, v))
    ifd = struct.pack('<H', len(entries)) + b''.join(entries) + struct.pack('<I', 0)
    return b'II*\x00' + struct.pack('<I', 8) + ifd + extra


class FakeNet:
    """dem._get stand-in: one file at a given ETag; records every request (range, If-Match)."""
    def __init__(self, etag):
        self.etag, self.calls = etag, []

    def __call__(self, url, rng=None, etag=None):
        self.calls.append((url, rng, etag))
        if etag is not None and etag != self.etag:
            raise dem.DemChanged('412 %s' % url)
        if rng and rng[0] == 0:
            return tiff_header() + b'\x00' * 100, {'ETag': '"%s"' % self.etag, 'Last-Modified': 'x'}
        return bytes([rng[0] % 251]) * (rng[1] - rng[0] + 1), {}


class DemPin(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.store = C.Store(os.path.join(self.tmp.name, 'store'))
        self.mirror = os.path.join(self.tmp.name, 'mirror')
        self._get, self._lzw, self._undo = dem._get, dem.lzw_decode, dem._undo_fp_predictor
        dem.lzw_decode = lambda raw: raw
        dem._undo_fp_predictor = lambda raw, w, h: raw

    def tearDown(self):
        dem._get, dem.lzw_decode, dem._undo_fp_predictor = self._get, self._lzw, self._undo
        self.tmp.cleanup()

    def test_listing_paginates_and_keeps_only_product_tifs(self):
        pre = 'StagedProducts/Elevation/13/TIFF/current/'
        pages = {None: page([(pre + 'n36w097/USGS_13_n36w097.tif', 'aa-89', 9), (pre + 'n36w097/USGS_13_n36w097.xml', 'x', 1)], 'T1'),
                 'T1': page([(pre + 'n36w098/USGS_13_n36w098.tif', 'bb', 8), (pre + 'n36w098/old/USGS_13_n36w098_2019.tif', 'cc', 1)])}
        # (newer objects carry checksum fields between ETag and Size: n41w080 was missed by a fixed-order parse)
        pages['T1'] = pages['T1'].replace('</ETag><Size>8</Size>', '</ETag><ChecksumAlgorithm>CRC64NVME</ChecksumAlgorithm><ChecksumType>FULL_OBJECT</ChecksumType><Size>8</Size>')
        seen = []

        def lister(u):
            tok = u.split('continuation-token=')[1] if 'continuation-token=' in u else None
            seen.append(tok)
            return pages[tok] if '/13/' in u or '%2F13%2F' in u else page([])
        s = dem.list_snapshot(('13', '1'), lister)
        self.assertEqual(s['products']['13'], {'n36w097': {'etag': 'aa-89', 'bytes': 9, 'lastModified': '2025-01-07T21:54:50.000Z'},
                                               'n36w098': {'etag': 'bb', 'bytes': 8, 'lastModified': '2025-01-07T21:54:50.000Z'}})
        self.assertEqual(s['products']['1'], {})
        self.assertEqual(seen, [None, 'T1', None])
        # content-addressed, stable, verified on load
        sid = dem.store_snapshot(self.store, s)
        self.assertEqual(sid, dem.snapshot_id(json.loads(json.dumps(s))))
        self.assertEqual(dem.load_snapshot(self.store), (sid, s))
        p = self.store.path('dem/snapshots/%s.json' % sid)
        body = open(p, 'rb').read()
        open(p, 'wb').write(body.replace(b'aa-89', b'zz-89'))
        with self.assertRaises(AssertionError):
            dem.load_snapshot(self.store)

    def test_range_reads_carry_if_match_and_mirror_into_the_store(self):
        net = FakeNet('e1-89')
        dem._get = net
        url = dem.file_url('13', 'n36w097')
        a = dem.COG(url, self.mirror, 'e1-89', self.store)
        a.tile(1, 0)
        self.assertEqual([c[2] for c in net.calls], ['e1-89', 'e1-89'], 'header and tile both If-Match the pin')
        self.assertTrue(os.path.exists(self.store.path('dem/13/n36w097/e1-89/meta.json')))
        self.assertTrue(os.path.exists(self.store.path('dem/13/n36w097/e1-89/1.bin')))
        self.assertFalse(os.path.exists(self.mirror), 'with a store, nothing is written to the local mirror')
        # a second worker on the same store: the same bytes, no network at all
        n = len(net.calls)
        b = dem.COG(url, self.mirror, 'e1-89', self.store)
        self.assertEqual(bytes(b.tile(1, 0)), bytes(a.tile(1, 0)))
        self.assertEqual(len(net.calls), n)

    def test_a_file_replaced_since_the_snapshot_fails_never_mixes(self):
        dem._get = FakeNet('NEW-89')
        with self.assertRaises(dem.DemChanged):
            dem.COG(dem.file_url('13', 'n36w097'), self.mirror, 'OLD-89', self.store)
        # (a pinned header already mirrored, the internal tile read then fails the same way)
        dem._get = FakeNet('OLD-89')
        cog = dem.COG(dem.file_url('13', 'n36w097'), self.mirror, 'OLD-89', self.store)
        dem._get = FakeNet('NEW-89')
        with self.assertRaises(dem.DemChanged):
            cog.tile(0, 0)

    def test_get_maps_412_to_dem_changed_and_sends_if_match(self):
        sent = {}

        def urlopen(req, timeout=None):
            sent.update(dict(req.header_items()))
            raise urllib.error.HTTPError(req.full_url, 412, 'Precondition Failed', {}, io.BytesIO(b''))
        orig = dem.urllib.request.urlopen
        dem.urllib.request.urlopen = urlopen
        try:
            with self.assertRaises(dem.DemChanged):
                self._get('https://example.invalid/x.tif', (0, 9), 'abc-1')
        finally:
            dem.urllib.request.urlopen = orig
        self.assertEqual(sent.get('If-match'), '"abc-1"')
        self.assertEqual(sent.get('Range'), 'bytes=0-9')

    def test_sampler_reads_only_snapshot_files(self):
        net = FakeNet('e1')
        dem._get = net
        snap = {'format': 'hometown-dem-snapshot', 'version': 1, 'products': {'13': {}}}
        s = dem.Sampler(self.mirror, self.store, snap)
        self.assertIsNone(s._cog(35, -97))
        self.assertEqual(net.calls, [], 'a file outside the snapshot is never fetched')
        self.assertIn('n36w097: not in the DEM snapshot', s.missing)
        self.assertEqual(dem.Sampler(self.mirror, product='1').RES, 3600)

    def test_build_id_commits_to_the_snapshot(self):
        with self.assertRaises(C.NoDemSnapshot):
            C.build_record(self.store)
        s1 = {'format': 'hometown-dem-snapshot', 'version': 1, 'products': {'13': {'n36w097': {'etag': 'a'}}}}
        s2 = {'format': 'hometown-dem-snapshot', 'version': 1, 'products': {'13': {'n36w097': {'etag': 'b'}}}}
        dem.store_snapshot(self.store, s1)
        b1 = C.build_id_of(C.build_record(self.store))
        self.assertEqual(b1, C.build_id_of(C.build_record(self.store)))
        dem.store_snapshot(self.store, s2)
        b2 = C.build_id_of(C.build_record(self.store))
        self.assertNotEqual(b1, b2, 'a new ETag is a new build')
        os.environ['HOMETOWN_DEM_SNAPSHOT'] = dem.snapshot_id(s1)
        try:
            self.assertEqual(C.build_id_of(C.build_record(self.store)), b1, 'an older snapshot named explicitly')
        finally:
            del os.environ['HOMETOWN_DEM_SNAPSHOT']


class AssembleText(unittest.TestCase):
    def test_frame_north_has_no_placeholder(self):
        src = open(os.path.join(HERE, 'assemble.py')).read()
        self.assertNotIn('... see bearingDeg', src)
        self.assertIn("'north': '-z (grid north; its true bearing is bearingDeg)'", src)


if __name__ == '__main__':
    unittest.main()
