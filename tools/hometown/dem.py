# tools/hometown/dem.py: USGS 3DEP 1/3 arc-second elevation for a bounding box, read straight out of the national
# map's cloud-optimized GeoTIFF tiles (1 x 1 degree, 512 px internal tiles, LZW + floating-point predictor) with HTTP
# range requests: only the internal tiles under the box are fetched, never a whole file. Each fetched internal tile is
# cached under <cache>/dem/ by the file's ETag, so a rebuild is offline and byte-identical.
#
#   read_dem(bbox, cache) -> (grid float32 [rows, cols] north-up, lon0, lat0 (top-left pixel centre), res deg, sources)
#
# No account, no key: https://prd-tnm.s3.amazonaws.com/StagedProducts/Elevation/13/TIFF/current/n{lat}w{lon}/...
# (USGS 3D Elevation Program, a US government work in the public domain).
import json
import math
import os
import struct
import urllib.request

import numpy as np

BASE = 'https://prd-tnm.s3.amazonaws.com/StagedProducts/Elevation/13/TIFF/current'
UA = 'hometown-compiler/0 (open-data city builder)'


def _get(url, rng=None):
    req = urllib.request.Request(url, headers={'User-Agent': UA, **({'Range': 'bytes=%d-%d' % rng} if rng else {})})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read(), dict(r.headers)


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
    def __init__(self, url, cache):
        self.url, self.cache = url, cache
        meta_file = os.path.join(cache, os.path.basename(url) + '.meta.json')
        if os.path.exists(meta_file):
            self.meta = json.load(open(meta_file))
        else:
            head, hdrs = _get(url, (0, 65535))
            self.meta = self._parse(head)
            self.meta['etag'] = hdrs.get('ETag', '').strip('"')
            self.meta['lastModified'] = hdrs.get('Last-Modified', '')
            self.meta['url'] = url
            os.makedirs(cache, exist_ok=True)
            json.dump(self.meta, open(meta_file, 'w'), sort_keys=True)

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
        f = os.path.join(self.cache, '%s-%s-%d.bin' % (os.path.basename(self.url), m['etag'][:12], k))
        if os.path.exists(f):
            raw = open(f, 'rb').read()
        else:
            o, n = m['offsets'][k], m['counts'][k]
            raw, _ = _get(self.url, (o, o + n - 1))
            assert len(raw) == n, 'short read'
            open(f, 'wb').write(raw)
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
            url = '%s/%s/USGS_13_%s.tif' % (BASE, name, name)
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
