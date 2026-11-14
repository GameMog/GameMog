# tools/hometown/dem.py: USGS 3DEP elevation (1/3 and 1 arc-second products) read straight out of the national map's
# cloud-optimized GeoTIFF tiles (1 x 1 degree, 512 px internal tiles, LZW + floating-point predictor) with HTTP range
# requests: only the internal tiles under the box are fetched, never a whole file.
#
# THE SNAPSHOT PIN. USGS serves each file at a mutable ".../TIFF/current/" URL. A build pins the DEM with a SNAPSHOT: the
# S3 listing of every product file with its ETag (list_snapshot, `compile.py --dem-snapshot`), stored content-addressed
# in the shared store at dem/snapshots/{id}.json; the buildId commits to that id. Every read of a file is checked
# against its snapshot ETag: the IFD header and each internal tile are range reads with If-Match: "<etag>" (a file USGS
# replaced since the snapshot answers 412 and the read fails: DemChanged, never mixed bytes), and the bytes are
# mirrored in the store under dem/{product}/{name}/{etag}/ (meta.json, {k}.bin, written ifAbsent) so every worker
# sharing the store reads the same bytes and /current/ is read once per internal tile. A file the snapshot does not
# list has no data (a refused tile names it). The old local mirror (<data>/dem/, keyed by the first 12 ETag chars) is
# read as a seed when its ETag matches the snapshot's.
#
#   read_dem(bbox, cache) -> (grid float32 [rows, cols] north-up, lon0, lat0 (top-left pixel centre), res deg, sources)
#   Sampler(mirror, store=, snapshot=, product='13')   bilinear heights at any lon/lat (hg1 compiles)
#
# No account, no key: https://prd-tnm.s3.amazonaws.com/StagedProducts/Elevation/{13|1}/TIFF/current/n{lat}w{lon}/...
# (USGS 3D Elevation Program, a US government work in the public domain).
import contextlib
import hashlib
import json
import math
import os
import re
import struct
import urllib.error
import urllib.parse
import urllib.request

import numpy as np

BUCKET = 'https://prd-tnm.s3.amazonaws.com'
PREFIX = 'StagedProducts/Elevation/%s/TIFF/current/'
BASE = BUCKET + '/' + PREFIX.rstrip('/') % '13'
PRODUCTS = {'13': 10800, '1': 3600}   # product -> pixels per degree
UA = 'hometown-compiler/0 (open-data city builder)'


class DemChanged(Exception):
    """USGS replaced a file since the snapshot pinned it (If-Match failed): its bytes are not the build's."""


def file_name(latc, lonc):
    return 'n%02dw%03d' % (latc + 1, -lonc)


def file_url(product, name):
    return '%s/%s%s/USGS_%s_%s.tif' % (BUCKET, PREFIX % product, name, product, name)


def _get(url, rng=None, etag=None):
    hdrs = {'User-Agent': UA}
    if rng:
        hdrs['Range'] = 'bytes=%d-%d' % rng
    if etag:
        hdrs['If-Match'] = '"%s"' % etag
    req = urllib.request.Request(url, headers=hdrs)
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return r.read(), dict(r.headers)
    except urllib.error.HTTPError as e:
        if e.code == 412:
            raise DemChanged('%s changed since the DEM snapshot (If-Match "%s" failed)' % (url, etag))
        raise


# ------------------------------------------------------------------------------------------------------------ snapshot
def list_snapshot(products=('13', '1'), lister=None):
    """The S3 listing of every .tif of the products: {format, version, bucket, products: {p: {name: {etag, bytes,
    lastModified}}}}. lister(url) -> XML text (tests pass a fake)."""
    lister = lister or (lambda u: _get(u)[0].decode('utf-8'))
    out = {'format': 'hometown-dem-snapshot', 'version': 1, 'bucket': BUCKET, 'products': {}}
    # (each <Contents> element by its own fields: S3 adds others between them, e.g. ChecksumAlgorithm on newer objects)
    rc = re.compile(r'<Contents>(.*?)</Contents>', re.S)
    field = lambda blk, f: (re.search(r'<%s>([^<]*)</%s>' % (f, f), blk) or [None, ''])[1]  # noqa: E731
    for p in products:
        files, token = {}, None
        while True:
            q = 'list-type=2&prefix=%s&max-keys=1000' % urllib.parse.quote(PREFIX % p)
            if token:
                q += '&continuation-token=' + urllib.parse.quote(token)
            xml = lister('%s/?%s' % (BUCKET, q))
            for blk in rc.findall(xml):
                key, lm, et, size = field(blk, 'Key'), field(blk, 'LastModified'), field(blk, 'ETag'), field(blk, 'Size')
                m = re.search(r'/(n\d\dw\d\d\d)/USGS_%s_\1\.tif$' % re.escape(p), key)
                if m:
                    files[m.group(1)] = {'etag': et.replace('&quot;', '').strip('"'), 'bytes': int(size), 'lastModified': lm}
            t = re.search(r'<NextContinuationToken>([^<]+)</NextContinuationToken>', xml)
            if '<IsTruncated>true</IsTruncated>' not in xml or not t:
                break
            token = t.group(1)
        out['products'][p] = dict(sorted(files.items()))
    return out


def snapshot_bytes(snap):
    return (json.dumps(snap, sort_keys=True, separators=(',', ':')) + '\n').encode()


def snapshot_id(snap):
    return 'dem-' + hashlib.sha256(snapshot_bytes(snap)).hexdigest()[:16]


def snapshot_from_mirror(mirror, product='13'):
    """A snapshot of only the files the local mirror holds metadata for (offline: a partial pin, every other file
    has no data under it)."""
    files = {}
    for f in sorted(os.listdir(mirror)) if os.path.isdir(mirror) else []:
        m = re.match(r'USGS_(13|1)_(n\d\dw\d\d\d)\.tif\.meta\.json$', f)
        if m and m.group(1) == product:
            meta = json.load(open(os.path.join(mirror, f)))
            files[m.group(2)] = {'etag': meta['etag'], 'bytes': None, 'lastModified': meta.get('lastModified', '')}
    return {'format': 'hometown-dem-snapshot', 'version': 1, 'bucket': BUCKET, 'products': {product: files}, 'partial': 'local mirror'}


def store_snapshot(store, snap, current=True):
    """Store the snapshot content-addressed (dem/snapshots/{id}.json) and, with current, point dem/current.json at it."""
    sid = snapshot_id(snap)
    store.put_if_absent('dem/snapshots/%s.json' % sid, snapshot_bytes(snap))
    if current:
        store.put('dem/current.json', (json.dumps({'snapshot': sid}) + '\n').encode())
    return sid


# THE SHIPPED PIN. The compiler carries the snapshot its pre-warmed builds were made at (dem-snapshots/{id}.json.gz,
# gzip -n of the exact snapshot bytes), so a NEW store (a fresh GameMog or Render disk) starts at the same pin and so
# the same buildId as the pre-warm, instead of failing NoDemSnapshot or listing USGS anew (a new id, a new build).
# A store that has a dem/current.json keeps it; `compile.py --dem-snapshot` still moves a store to a newer listing.
HERE = os.path.dirname(os.path.abspath(__file__))
SHIPPED_DIR = os.path.join(HERE, 'dem-snapshots')
PINNED = 'dem-12b3e06663843b4d'


def shipped_snapshot(sid):
    """The snapshot bytes the compiler ships for sid, checked against the id; None when it ships none."""
    import gzip
    f = os.path.join(SHIPPED_DIR, '%s.json.gz' % sid) if sid and re.match(r'^dem-[0-9a-f]{16}$', sid) else None
    if not f or not os.path.exists(f):
        return None
    b = gzip.decompress(open(f, 'rb').read())
    assert 'dem-' + hashlib.sha256(b).hexdigest()[:16] == sid, 'shipped DEM snapshot %s does not hash to its id' % sid
    return b


def load_snapshot(store, sid=None):
    """(id, snapshot) of sid, else of dem/current.json, else of the shipped PINNED (seeded into the store and made
    current); (None, None) when the store has none and the compiler ships none."""
    if sid is None:
        b = store.get('dem/current.json')
        if b is None:
            seed = shipped_snapshot(PINNED)
            if seed is None:
                return None, None
            store.put_if_absent('dem/snapshots/%s.json' % PINNED, seed)
            if store.get('dem/current.json') is None:
                store.put('dem/current.json', (json.dumps({'snapshot': PINNED}) + '\n').encode())
            b = store.get('dem/current.json')
        sid = json.loads(b)['snapshot']
    b = store.get('dem/snapshots/%s.json' % sid)
    if b is None:
        seed = shipped_snapshot(sid)
        if seed is not None:
            store.put_if_absent('dem/snapshots/%s.json' % sid, seed)
            b = store.get('dem/snapshots/%s.json' % sid)
    if b is None:
        raise KeyError('DEM snapshot %s not in the store' % sid)
    snap = json.loads(b)
    assert snapshot_id(snap) == sid, 'DEM snapshot %s does not hash to its id' % sid
    return sid, snap


def lzw_decode(data):
    # TIFF LZW: MSB-first codes, 9..12 bits, ClearCode 256, EOI 257, the code width growing one code early
    out = bytearray()
    table = [bytes([i]) for i in range(256)] + [b'', b'']
    width, bitbuf, nbits, prev = 9, 0, 0, None
    for byte in data:
        bitbuf = (bitbuf << 8) | byte
        nbits += 8
        while nbits >= width:
            nbits -= width
            code = (bitbuf >> nbits) & ((1 << width) - 1)
            if code == 256:
                table = table[:258]
                width, prev = 9, None
                continue
            if code == 257:
                return bytes(out)
            if prev is None:
                entry = table[code]
            elif code < len(table):
                entry = table[code]
                table.append(prev + entry[:1])
            else:
                entry = prev + prev[:1]
                table.append(entry)
            out += entry
            prev = entry
            n = len(table)
            if n >= 511 and width == 9: width = 10
            if n >= 1023 and width == 10: width = 11
            if n >= 2047 and width == 11: width = 12
        bitbuf &= (1 << nbits) - 1
    return bytes(out)


def _undo_fp_predictor(raw, w, h):
    # predictor 3: per row, bytes differenced, then split into planes (most significant byte first)
    a = np.frombuffer(raw, dtype=np.uint8).reshape(h, w * 4)
    a = np.cumsum(a, axis=1, dtype=np.uint8)
    planes = a.reshape(h, 4, w).transpose(0, 2, 1).copy()  # [h, w, 4] big-endian bytes
    return planes.view('>f4').reshape(h, w).astype(np.float32)


class COG:
    """One product file. etag: the snapshot's pin (None: the first-seen ETag, recorded in the local mirror's meta).
    store: the shared store (dem/{product}/{name}/{etag}/ meta.json and {k}.bin, ifAbsent). cache: the local mirror,
    read as a seed when its ETag matches, and written only without a store. Every network read carries If-Match."""
    def __init__(self, url, cache, etag=None, store=None):
        self.url, self.cache, self.store = url, cache, store
        base = os.path.basename(url)
        m = re.match(r'USGS_(13|1)_(n\d\dw\d\d\d)\.tif$', base)
        self.skey = None
        meta = None
        if etag and store is not None and m:
            self.skey = 'dem/%s/%s/%s' % (m.group(1), m.group(2), etag)
            b = store.get(self.skey + '/meta.json')
            meta = json.loads(b) if b is not None else None
        meta_file = os.path.join(cache, base + '.meta.json')
        if meta is None and os.path.exists(meta_file):
            lm = json.load(open(meta_file))
            if etag is None or lm.get('etag') == etag:
                meta = lm
        if meta is None:
            head, hdrs = _get(url, (0, 65535), etag)
            meta = self._parse(head)
            meta['etag'] = etag or hdrs.get('ETag', '').strip('"')
            meta['lastModified'] = hdrs.get('Last-Modified', '')
            meta['url'] = url
            if store is None:
                os.makedirs(cache, exist_ok=True)
                json.dump(meta, open(meta_file, 'w'), sort_keys=True)
        if self.skey:
            store.put_if_absent(self.skey + '/meta.json', json.dumps(meta, sort_keys=True).encode())
        self.meta = meta

    def _parse(self, b):
        assert b[:4] == b'II*\x00', 'not a little-endian classic TIFF'
        off = struct.unpack('<I', b[4:8])[0]
        cnt = struct.unpack('<H', b[off:off + 2])[0]
        tags = {}
        TS = {3: ('H', 2), 4: ('I', 4), 12: ('d', 8), 2: ('s', 1)}
        for i in range(cnt):
            tag, typ, c, v = struct.unpack('<HHII', b[off + 2 + i * 12: off + 14 + i * 12])
            fmt, sz = TS.get(typ, ('I', 4))
            if typ == 2:
                raw = b[v:v + c] if c > 4 else b[off + 10 + i * 12: off + 10 + i * 12 + c]
                tags[tag] = raw.rstrip(b'\x00').decode('ascii', 'replace')
                continue
            if c * sz <= 4:
                vals = struct.unpack('<' + fmt * c, b[off + 10 + i * 12: off + 10 + i * 12 + c * sz])
            else:
                vals = struct.unpack('<' + fmt * c, b[v:v + c * sz])
            tags[tag] = list(vals)
        m = {
            'w': tags[256][0], 'h': tags[257][0], 'tw': tags[322][0], 'th': tags[323][0],
            'compression': tags[259][0], 'predictor': tags.get(317, [1])[0], 'bits': tags[258][0],
            'offsets': tags[324], 'counts': tags[325],
            'scale': tags[33550][:2], 'tie': tags[33922][3:5], 'nodata': float(tags.get(42113, '-999999') or -999999),
        }
        assert m['bits'] == 32 and m['compression'] == 5 and m['predictor'] == 3, 'unexpected DEM encoding'
        return m

    def tile(self, ti, tj):
        m = self.meta
        across = math.ceil(m['w'] / m['tw'])
        k = tj * across + ti
        o, n = m['offsets'][k], m['counts'][k]
        raw = None
        if self.skey:
            raw = self.store.get('%s/%d.bin' % (self.skey, k))
        f = os.path.join(self.cache, '%s-%s-%d.bin' % (os.path.basename(self.url), m['etag'][:12], k))
        if raw is None and os.path.exists(f):
            raw = open(f, 'rb').read()
            if len(raw) != n:
                raw = None
        if raw is None:
            # (If-Match: the file the snapshot / the meta pinned, or 412, never another version's bytes at these offsets)
            raw, _ = _get(self.url, (o, o + n - 1), m['etag'])
            assert len(raw) == n, 'short read'
            if not self.skey:
                os.makedirs(self.cache, exist_ok=True)
                open(f, 'wb').write(raw)
        if self.skey:
            self.store.put_if_absent('%s/%d.bin' % (self.skey, k), raw)
        return _undo_fp_predictor(lzw_decode(raw), m['tw'], m['th'])

    def window(self, c0, r0, c1, r1):
        m = self.meta
        out = np.full((r1 - r0, c1 - c0), np.nan, dtype=np.float32)
        for tj in range(r0 // m['th'], (r1 - 1) // m['th'] + 1):
            for ti in range(c0 // m['tw'], (c1 - 1) // m['tw'] + 1):
                t = self.tile(ti, tj)
                tx0, ty0 = ti * m['tw'], tj * m['th']
                a0, a1 = max(c0, tx0), min(c1, tx0 + m['tw'])
                b0, b1 = max(r0, ty0), min(r1, ty0 + m['th'])
                out[b0 - r0:b1 - r0, a0 - c0:a1 - c0] = t[b0 - ty0:b1 - ty0, a0 - tx0:a1 - tx0]
        out[out <= m['nodata'] + 1] = np.nan
        out[out < -1000] = np.nan
        return out


def read_dem(bbox, cache):
    """bbox (lonW, latS, lonE, latN) -> north-up float32 grid over it on the 1/3" lattice, its top-left pixel centre,
    the pixel size in degrees, and the source files (url, etag, last-modified)."""
    W, S, E, N = bbox
    res = 1 / 10800
    # the national lattice (the 1 x 1 degree files overlap by 6 px)
    # (pixel centres sit half a pixel off whole multiples of res: column k's centre is (k + 0.5) res, row r's -(r + 0.5) res)
    c0, c1 = math.floor(W / res - 0.5), math.ceil(E / res - 0.5) + 1
    r0, r1 = math.floor(-N / res - 0.5), math.ceil(-S / res - 0.5) + 1   # rows count southward from the north
    grid = np.full((r1 - r0, c1 - c0), np.nan, dtype=np.float32)
    sources = []
    for lat in range(math.floor(S), math.floor(N) + 1):
        for lon in range(math.floor(W), math.floor(E) + 1):
            name = 'n%02dw%03d' % (lat + 1, -lon)
            url = file_url('13', name)
            cog = COG(url, os.path.join(cache, 'dem'))
            m = cog.meta
            # top-left pixel centre of this file
            lon_tl = m['tie'][0] + m['scale'][0] / 2
            lat_tl = m['tie'][1] - m['scale'][1] / 2
            fc0 = round(lon_tl / res - 0.5)  # global column of the file's column 0
            fr0 = round(-lat_tl / res - 0.5)
            a0, a1 = max(c0, fc0), min(c1, fc0 + m['w'])
            b0, b1 = max(r0, fr0), min(r1, fr0 + m['h'])
            if a1 <= a0 or b1 <= b0:
                continue
            win = cog.window(a0 - fc0, b0 - fr0, a1 - fc0, b1 - fr0)
            sub = grid[b0 - r0:b1 - r0, a0 - c0:a1 - c0]
            np.copyto(sub, win, where=np.isnan(sub))
            sources.append({'url': url, 'etag': m['etag'], 'lastModified': m['lastModified']})
    return grid, (c0 + 0.5) * res, -(r0 + 0.5) * res, res, sources


# ------------------------------------------------------------------------------------------------- hg1 sampler
RANGE_THREADS = int(os.environ.get('HOMETOWN_DEM_THREADS', '16'))   # parallel range reads (M5)


class Sampler:
    """3DEP heights at any lon/lat, independent of what else was read: bilinear between the 4 global lattice pixels round
    the point (column k's centre is (k + 0.5) / RES degrees, row r's -(r + 0.5) / RES; RES 10800 for the 1/3" product,
    3600 for the 1"), each pixel taken from the ONE file whose nominal 1 x 1 degree cell holds its centre (the files
    overlap by 6 px: a fixed owner per pixel, so a mosaic's extent never changes a value). Each file at its snapshot ETag
    (snapshot given) or its first-seen one; bytes from the store's dem/ mirror, the local mirror or If-Match range reads.
    Records every file it read (demSource)."""

    def __init__(self, mirror, store=None, snapshot=None, product='13'):
        self.mirror, self.store, self.snapshot, self.product = mirror, store, snapshot, product
        self.RES = PRODUCTS[product]
        self.cogs, self.tiles, self.used = {}, {}, {}
        self.missing = set()
        self.scopes = []   # (record(): the files a computation read, open scopes innermost last; None: an isolated mark)

    def _cog(self, latc, lonc):
        k = (latc, lonc)
        if k not in self.cogs:
            if lonc >= 0 or latc < 0:
                # (the national map names n{lat}w{lon} files only: the east / south hemisphere tiles (Guam, American
                # Samoa) are not in this naming scheme)
                self.cogs[k] = None
                self.missing.add('no 3DEP file name for cell lat %d lon %d' % (latc, lonc))
            else:
                name = file_name(latc, lonc)
                url = file_url(self.product, name)
                etag = None
                if self.snapshot is not None:
                    ent = self.snapshot['products'].get(self.product, {}).get(name)
                    if ent is None:  # (no such file in the pinned snapshot: open ocean, outside the US, or not listed)
                        self.cogs[k] = None
                        self.missing.add('%s: not in the DEM snapshot' % name)
                        return None
                    etag = ent['etag']
                try:
                    cog = COG(url, self.mirror, etag, self.store)
                except DemChanged:
                    raise
                except Exception as e:  # (a cell 3DEP has no file for: open ocean, outside the US)
                    self.cogs[k] = None
                    self.missing.add('%s: %s' % (name, str(e)[:80]))
                    return None
                m = cog.meta
                cog.fc0 = round((m['tie'][0] + m['scale'][0] / 2) * self.RES - 0.5)
                cog.fr0 = round(-(m['tie'][1] - m['scale'][1] / 2) * self.RES - 0.5)
                self.cogs[k] = cog
        return self.cogs[k]

    def _load(self, cog, a, b):
        m = cog.meta
        t = cog.tile(a, b).astype(np.float64)
        t[t <= m['nodata'] + 1] = np.nan
        t[t < -1000] = np.nan
        return t

    def _prefetch(self, keys, flat_c, flat_r):
        """Read every internal tile a pixels() call needs and does not hold yet, RANGE_THREADS at a time (a cold
        place's terrain is hundreds of 512 px tiles: one HTTP range read each, from the store's mirror or USGS). Pure
        I/O ahead of the same sequential loop: what is read and every value computed are unchanged."""
        need = []
        for la, lo in sorted(set(map(tuple, keys.tolist()))):
            sel = np.nonzero((keys[:, 0] == la) & (keys[:, 1] == lo))[0]
            cog = self._cog(la, lo)
            if cog is None:
                continue
            m = cog.meta
            lc, lr = flat_c[sel] - cog.fc0, flat_r[sel] - cog.fr0
            ok = (lc >= 0) & (lr >= 0) & (lc < m['w']) & (lr < m['h'])
            for a, b in sorted(set(zip((lc[ok] // m['tw']).tolist(), (lr[ok] // m['th']).tolist()))):
                if (la, lo, a, b) not in self.tiles:
                    need.append((cog, la, lo, a, b))
        if len(need) < 2 or RANGE_THREADS < 2:
            return
        from concurrent.futures import ThreadPoolExecutor
        with ThreadPoolExecutor(min(RANGE_THREADS, len(need))) as ex:
            got = list(ex.map(lambda n: self._load(n[0], n[3], n[4]), need))
        for (cog, la, lo, a, b), t in zip(need, got):
            self.tiles[(la, lo, a, b)] = t

    def pixels(self, col, row):
        """Global lattice pixels (int arrays) -> float64 heights (NaN where no data)."""
        col = np.asarray(col, dtype=np.int64)
        row = np.asarray(row, dtype=np.int64)
        out = np.full(col.shape, np.nan)
        lonc = np.floor((col + 0.5) / self.RES).astype(np.int64)
        latc = np.floor(-(row + 0.5) / self.RES).astype(np.int64)
        keys = np.stack([latc, lonc], axis=-1).reshape(-1, 2)
        flat_c, flat_r, flat_o = col.ravel(), row.ravel(), out.ravel()
        self._prefetch(keys, flat_c, flat_r)
        for la, lo in sorted(set(map(tuple, keys.tolist()))):
            sel = np.nonzero((keys[:, 0] == la) & (keys[:, 1] == lo))[0]
            cog = self._cog(la, lo)
            if cog is None:
                continue
            m = cog.meta
            lc, lr = flat_c[sel] - cog.fc0, flat_r[sel] - cog.fr0
            ok = (lc >= 0) & (lr >= 0) & (lc < m['w']) & (lr < m['h'])
            ti, tj = lc // m['tw'], lr // m['th']
            for a, b in sorted(set(zip(ti[ok].tolist(), tj[ok].tolist()))):
                tk = (la, lo, a, b)
                if tk not in self.tiles:
                    self.tiles[tk] = self._load(cog, a, b)
                self.used[m['url']] = {'url': m['url'], 'etag': m['etag'], 'lastModified': m['lastModified']}
                self.add((m['url'],))
                t = self.tiles[tk]
                s2 = ok & (ti == a) & (tj == b)
                flat_o[sel[s2]] = t[lr[s2] - b * m['th'], lc[s2] - a * m['tw']]
        return out

    def sample(self, lon, lat):
        """Bilinear heights (NAVD88 m, float64) at lon/lat arrays."""
        shape = np.shape(lon)
        fc = np.asarray(lon, dtype=np.float64).ravel() * self.RES - 0.5
        fr = -np.asarray(lat, dtype=np.float64).ravel() * self.RES - 0.5
        c, r = np.floor(fc), np.floor(fr)
        tx, ty = fc - c, fr - r
        c, r = c.astype(np.int64), r.astype(np.int64)
        cc = np.concatenate([c, c + 1, c, c + 1]); rr = np.concatenate([r, r, r + 1, r + 1])
        v = self.pixels(cc, rr)
        n = c.size
        v00, v10, v01, v11 = v[:n], v[n:2 * n], v[2 * n:3 * n], v[3 * n:]
        a = v00 * (1 - tx) + v10 * tx
        b = v01 * (1 - tx) + v11 * tx
        return (a * (1 - ty) + b * ty).reshape(shape)

    # ---- demSource: the files a product's own outputs depend on. A computation runs inside record(); every file read
    # in it, and every file a cached result it reuses was computed from (add()), lands in its scope and in the open
    # scopes round it, up to the innermost isolated one. So a tile lists the same files whatever was compiled before it
    # in the session (its cached decks bring their files along) and nothing a neighbour read.
    def add(self, files):
        for sc in reversed(self.scopes):
            if sc is None:
                break
            sc.update(files)

    @contextlib.contextmanager
    def record(self, isolated=False):
        fs = set()
        if isolated:
            self.scopes.append(None)
        self.scopes.append(fs)
        try:
            yield fs
        finally:
            self.scopes.pop()
            if isolated:
                self.scopes.pop()

    def sources(self, files=None):
        """The used files' records: of `files`, else of the innermost open scope, else every file read."""
        if files is None and self.scopes and self.scopes[-1] is not None:
            files = self.scopes[-1]
        keys = sorted(self.used) if files is None else sorted(files)
        return [self.used[k] for k in keys]
