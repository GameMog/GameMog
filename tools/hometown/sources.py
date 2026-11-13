# tools/hometown/sources.py: the Overture rows of the hg1 regions a compile reads (fetch.py --regions), deduplicated by
# id, every vertex projected ONCE to the domain's grid and quantised to integer centimetres (grid.py), held in grid
# metres (cm / 100) for the geometry library. Spatial queries return features sorted by Overture id, never in an
# index's own order: the loaded set differs between a single-tile and a block compile (more regions), and nothing a
# tile writes may depend on which other rows happened to be loaded.
import os

import numpy as np
import shapely

import duck
import grid

LAYER_SQL = {
    'buildings': ("buildings", "building", "id, ST_AsWKB(geometry) AS wkb, height, num_floors, min_height, class, subtype, roof_shape, roof_height, is_underground, name"),
    'parts': ("buildings", "building_part", "id, ST_AsWKB(geometry) AS wkb, height, num_floors, min_height, building_id"),
    'segments': ("transportation", "segment", "id, ST_AsWKB(geometry) AS wkb, subtype, class, subclass, names.primary AS name, connectors, access_restrictions, road_flags, width_rules, level_rules, subclass_rules"),
    'places': ("places", "place", "id, ST_X(geometry) AS lon, ST_Y(geometry) AS lat, name, basic_category, taxonomy.primary AS cat, confidence, operating_status"),
    'water': ("base", "water", "id, ST_AsWKB(geometry) AS wkb, subtype, class, name"),
    'land_use': ("base", "land_use", "id, ST_AsWKB(geometry) AS wkb, subtype, class, name"),
}
BLOCK = grid.TILE << grid.CTX_L   # 8192 grid m
EXTRAS_FILE = 'overture-transportation-segment-extras.parquet'   # fetch.py --extras: OSM way ids and speed limits


def mph(v, unit):
    return v if (unit or 'mph') == 'mph' else v / 1.609344


def segment_extras(c, dirs):
    """{segment id: (OSM way id or None, max speed in mph or None)} from the regions' extras files, or None unless EVERY
    loaded region has one (all or nothing: a segment's lanes never depend on which regions happened to be loaded)."""
    files = [os.path.join(d, EXTRAS_FILE) for d in dirs]
    if not files or not all(os.path.exists(f) for f in files):
        return None
    lst = ', '.join("'%s'" % f for f in files)
    out = {}
    for sid, srcs, sl in c.execute(f"""SELECT id, sources, speed_limits FROM (SELECT * FROM read_parquet([{lst}], union_by_name=true)
            QUALIFY row_number() OVER (PARTITION BY id ORDER BY id) = 1) ORDER BY id""").fetchall():
        way = None
        for r in srcs or []:
            rid = (r or {}).get('record_id') or ''
            if rid.startswith('w') and (r.get('dataset') or 'OpenStreetMap') == 'OpenStreetMap':
                try:
                    way = int(rid[1:].split('@')[0])
                    break
                except ValueError:
                    pass
        spd = None
        for r in sl or []:
            ms = (r or {}).get('max_speed') or {}
            if ms.get('value') and not r.get('between') and not r.get('when'):
                spd = mph(float(ms['value']), ms.get('unit'))
                break
        out[sid] = (way, spd)
    return out


class Sources:
    def __init__(self, data_dir, dom, blocks, skip_missing=False):
        """skip_missing: load the regions that are fetched and leave the others out (a block compile whose edge tiles
        reach an unfetched region: those tiles are refused one by one by require(), the rest compile)."""
        self.dom = grid.domain(dom)
        self.blocks, self.missing = [], []
        dirs = []
        for C, R in sorted(set(blocks)):
            d = os.path.join(data_dir, 'regions', 'hg1-%s' % dom, '4', str(C), str(R))
            if not os.path.exists(os.path.join(d, 'region.json')):
                if skip_missing:
                    self.missing.append((C, R))
                    continue
                raise MissingRegion('region hg1-%s/4/%d/%d not fetched (tools/hometown/fetch.py --regions %s:%d,%d)' % (dom, C, R, dom, C, R))
            self.blocks.append((C, R))
            dirs.append(d)
        if not dirs:
            raise MissingRegion('no region of %s fetched' % sorted(set(blocks)))
        c = duck.connect('spatial')
        self.rows = {}
        for key, (theme, typ, cols) in LAYER_SQL.items():
            fl = [os.path.join(d, 'overture-%s-%s.parquet' % (theme, typ)) for d in dirs]
            # (an empty region file has no geometry type; it holds no rows, so leaving it out changes nothing)
            fl = [f for f in fl if c.execute(f"SELECT count(*) FROM read_parquet('{f}')").fetchone()[0] > 0]
            if not fl:
                self.rows[key] = []
                continue
            files = ', '.join("'%s'" % f for f in fl)
            cur = c.execute(f"""SELECT {cols} FROM (SELECT * FROM read_parquet([{files}], union_by_name=true)
                QUALIFY row_number() OVER (PARTITION BY id ORDER BY id) = 1) ORDER BY id""")
            names = [d[0] for d in cur.description]
            self.rows[key] = [dict(zip(names, r)) for r in cur.fetchall()]
        for key in ('buildings', 'parts', 'segments', 'water', 'land_use'):
            rs = self.rows[key]
            geoms = shapely.from_wkb([bytes(r.pop('wkb')) for r in rs]) if rs else []
            geoms = shapely.transform(geoms, self._proj) if len(geoms) else geoms
            for r, g in zip(rs, geoms):
                r['geom'] = g
            self.rows[key] = [r for r in rs if r['geom'] is not None and not r['geom'].is_empty]
        P = self.rows['places']
        if P:
            gx, gs = grid.project_cm(self.dom, [p['lon'] for p in P], [p['lat'] for p in P])
            for p, a, b in zip(P, gx.tolist(), gs.tolist()):
                p['gx'], p['gs'] = a, b
        self.extras = segment_extras(c, dirs)
        self.trees = {}
        for key in ('buildings', 'segments', 'water', 'land_use'):
            self.trees[key] = shapely.STRtree([r['geom'] for r in self.rows[key]])
        # (a building's parts, by its Overture id, each list in part id order)
        self.parts_of = {}
        for r in self.rows['parts']:
            if r['building_id']:
                self.parts_of.setdefault(r['building_id'], []).append(r)
        self._ptree = shapely.STRtree(shapely.points([(p['gx'] / 100.0, p['gs'] / 100.0) for p in P])) if P else None

    def _proj(self, c):
        gx, gs = grid.project_cm(self.dom, c[:, 0], c[:, 1])
        return np.column_stack([gx / 100.0, gs / 100.0])

    def covered(self, x0, z0, x1, z1):
        """Is the grid-metre window inside the loaded blocks (whose rows are complete there)?"""
        have = set(self.blocks)
        for C in range(int(x0 // BLOCK), int((x1 - 1e-9) // BLOCK) + 1):
            for R in range(int(z0 // BLOCK), int((z1 - 1e-9) // BLOCK) + 1):
                if (C, R) not in have:
                    return False
        return True

    def require(self, x0, z0, x1, z1, what):
        if not self.covered(x0, z0, x1, z1):
            need = [b for b in blocks_for(x0, z0, x1, z1) if b not in set(self.blocks)]
            raise MissingRegion('%s needs regions %s, not fetched (tools/hometown/fetch.py --regions %s:%s)' % (what, need, self.dom.name, ';'.join('%d,%d' % b for b in need)))

    def query(self, key, geom, predicate='intersects'):
        """Rows of a layer whose geometry meets geom, in Overture id order."""
        rs = self.rows[key]
        if not rs:
            return []
        idx = self.trees[key].query(geom, predicate=predicate) if predicate else self.trees[key].query(geom)
        return sorted((rs[i] for i in idx.tolist()), key=lambda r: r['id'])

    def places_in(self, geom):
        if self._ptree is None:
            return []
        idx = self._ptree.query(geom, predicate='intersects')
        return sorted((self.rows['places'][i] for i in idx.tolist()), key=lambda r: r['id'])


class MissingRegion(Exception):
    pass


def blocks_for(x0, z0, x1, z1):
    """L4 blocks a grid-metre window touches."""
    return [(C, R) for C in range(int(x0 // BLOCK), int((x1 - 1e-9) // BLOCK) + 1) for R in range(int(z0 // BLOCK), int((z1 - 1e-9) // BLOCK) + 1)]
