# tools/hometown/assemble.py: a PLACE on the hg1 grid. The session descriptor (stage 1 from the gazetteer and the
# grid; stage 2 derived from the place's compiled tiles and ctx) and the LEGACY ASSEMBLER: the tiles laid out in session
# coordinates as today's single package (cities/pkg/packages/<id>/: geodata.js, data/*.bin.gz, manifest.json), so
# ?city=pkg&pkg=<id>, fixcheck and the package shots keep working on tiles that are compiled per tile.
#
# Session frame (grid.py session_frame): origin the NW corner of the anchor's tile (c0, r0); x = (gx - 51200 c0) /
# (100 k0), z likewise (+x grid east, -z grid north, heading 0 faces +z); y = NAVD88 m - yOffset. k0, gamma0 pinned
# here; frame.bearingDeg = gamma0 (the true bearing of -z, as New York's 29.02).
import hashlib
import json
import math
import os

import numpy as np
import shapely
from shapely.geometry import LineString, Point, Polygon
from shapely.ops import unary_union

import grid
import context
import compile as C

PIN_PAD_CM = 100000     # the pinned tile set: the play box + 1 km
MAX_TILES = 1024


def jdump(o):
    return json.dumps(o, sort_keys=True, separators=(',', ':'))


def box_cm(d, bbox):
    W, S, E, N = bbox
    t = np.linspace(0, 1, 33)
    lon = np.concatenate([W + (E - W) * t, np.full(33, E), E - (E - W) * t, np.full(33, W)])
    lat = np.concatenate([np.full(33, S), S + (N - S) * t, np.full(33, N), N - (N - S) * t])
    gx, gs = grid.project_cm(d, lon, lat)
    return int(gx.min()), int(gs.min()), int(gx.max()), int(gs.max())


def stage1(pid, places, bid):
    pl = places[pid]
    dom = grid.domain_of_geoid(pl['geoid']) if pl.get('geoid') else pl.get('domain', 'conus')
    d = grid.domain(dom)
    if pl.get('anchor'):
        lon, lat, how = pl['anchor'][0], pl['anchor'][1], pl.get('anchorSource', 'Census Gazetteer INTPTLAT/INTPTLONG')
    else:
        W, S, E, N = pl['bbox']
        lon, lat, how = (W + E) / 2, (S + N) / 2, 'the given bbox centre (no gazetteer place)'
    fr = grid.session_frame(dom, lon, lat)
    bx = box_cm(d, pl['bbox'])
    c0, r0 = (bx[0] - PIN_PAD_CM) // grid.TILE_CM, (bx[1] - PIN_PAD_CM) // grid.TILE_CM
    c1, r1 = (bx[2] + PIN_PAD_CM) // grid.TILE_CM, (bx[3] + PIN_PAD_CM) // grid.TILE_CM
    n = (c1 - c0 + 1) * (r1 - r0 + 1)
    if n > MAX_TILES:
        raise SystemExit('%s: %d tiles over the %d cap' % (pid, n, MAX_TILES))
    return {'format': 'hometown-session', 'version': 1, 'stage': 1, 'placeId': pid, 'name': pl.get('name', pid), 'geoid': pl.get('geoid'),
            'buildId': bid, 'grid': grid.GRID, 'domain': dom, 'anchor': {'lon': lon, 'lat': lat, 'source': how}, 'bbox': pl['bbox'],
            'origin': {'c0': fr['c0'], 'r0': fr['r0'], 'lon': fr['originLon'], 'lat': fr['originLat']}, 'k0': fr['k0'], 'gamma0': fr['gamma0'],
            'playBox': {'gx0': bx[0], 'gs0': bx[1], 'gx1': bx[2], 'gs1': bx[3]},
            'tileRange': [c0, r0, c1, r1], 'tiles': [grid.tile_id(dom, c, r) for r in range(r0, r1 + 1) for c in range(c0, c1 + 1)]}


def tile_set_hash(tiles):
    return hashlib.sha256(''.join(sorted('%s %s\n' % (t['id'], t['sha256']) for t in tiles)).encode()).hexdigest()


def compile_place(pid, places, data, store, bid, out_root, log=print):
    D1 = stage1(pid, places, bid)
    dom = D1['domain']
    c0t, r0t, c1t, r1t = D1['tileRange']
    W = C.World(data, dom, C.tile_window(c0t, r0t, c1t, r1t), store, bid, log)
    order = [(c, r) for r in range(r0t, r1t + 1) for c in range(c0t, c1t + 1)]
    blobs = C.compile_tiles(W, store, order, log)
    dec = {k: C.read_htl1(b) for k, b in blobs.items()}
    fr = {'c0': D1['origin']['c0'], 'r0': D1['origin']['r0'], 'k0': D1['k0']}
    k0 = fr['k0']
    TCM = grid.TILE_CM

    def S(gx, gs):
        return (gx - TCM * fr['c0']) / (100.0 * k0), (gs - TCM * fr['r0']) / (100.0 * k0)
    pb = D1['playBox']
    bx0, bz0 = S(pb['gx0'], pb['gs0'])
    bx1, bz1 = S(pb['gx1'], pb['gs1'])
    B = {'x0': bx0, 'x1': bx1, 'z0': bz0, 'z1': bz1}
    play = [k for k in order if not ((k[0] + 1) * TCM <= pb['gx0'] or k[0] * TCM > pb['gx1'] or (k[1] + 1) * TCM <= pb['gs0'] or k[1] * TCM > pb['gs1'])]

    # ---- stage 2: height datum and water (v0's rule over the play box's tiles)
    dry, allp, waters = [], [], {}
    for k in play:
        h, s, _ = dec[k]
        t = s['terrain_cm']
        m = s['mask']
        wet = (m[::2, ::2] == C.MASK['water'])
        wet = np.pad(wet, ((0, 1), (0, 1)), mode='edge')
        allp.append(t.ravel())
        dry.append(t[~wet].ravel())
        for w in h['waters']:
            if w['level_cm'] is None:
                continue
            e = waters.setdefault(w['id'], {'level_cm': w['level_cm'], 'cells': 0})
            e['cells'] += w['cells']
    allp = np.concatenate(allp)
    dry = np.concatenate(dry) if dry else allp
    low = float(np.percentile(dry, 0.5)) / 100 if dry.size else float(allp.min()) / 100
    cand = sorted(((-v['cells'], wid, v['level_cm']) for wid, v in waters.items() if v['level_cm'] / 100 <= low + 1.0))
    level = cand[0][2] / 100 if cand else None
    gmin = float(allp.min()) / 100
    y_off = int(math.floor(level)) if level is not None else int(math.floor(gmin))
    water_level = round(level - y_off, 2) if level is not None else -10.0

    # ---- roads: links stitched by node id (border nodes: the lower (r, c) tile's along-edge cm wins)
    node_pos, node_ctl, node_from = {}, {}, {}
    links = []
    for (c, r) in order:
        h, s, _ = dec[(c, r)]
        for n in s['roads']['nodes']:
            gx, gs = n['u'] + c * TCM, n['v'] + r * TCM
            key = n['id']
            if key not in node_pos or (r, c) < node_from[key]:
                node_pos[key], node_from[key] = (gx, gs), (r, c)
            if 'control' in n:
                node_ctl[key] = n['control']
        for l in s['roads']['links']:
            links.append(dict(l, pts=[(u + c * TCM, v + r * TCM) for u, v in l['pts']]))
    links.sort(key=lambda l: (l['seg'], l['piece'], l['sub']))
    nid, nodes = {}, []
    names, name_of = [], {}

    def name_idx(n):
        if n not in name_of:
            name_of[n] = len(names)
            names.append(n)
        return name_of[n]
    rl, inc = [], {}
    for l in links:
        for e in ('a', 'b'):
            if l[e] not in nid:
                nid[l[e]] = len(nodes)
                nodes.append(S(*node_pos[l[e]]))
        a, b = nid[l['a']], nid[l['b']]
        if a == b:
            continue
        inner = [S(x, z) for x, z in l['pts'][1:-1]]
        idx = len(rl)
        rl.append({'a': a, 'b': b, 'ni': name_idx(l['name']), 'w': l['w'], 'lanes': l['lanes'], 'dir': l['dir'], 'inner': inner, 'flags': l['flags'],
                   'sw': l['sw'], 'cls': l['cls'], 'rank': l['rank'], 'stopA': l['stopA'], 'stopB': l['stopB']})
        inc.setdefault(a, []).append((idx, 'A'))
        inc.setdefault(b, []).append((idx, 'B'))
    control, stop_mask = [0] * len(nodes), [0] * len(nodes)
    for key, i in nid.items():
        control[i] = node_ctl.get(key, 0)
        for slot, (li, end) in enumerate(inc.get(i, [])):
            if rl[li]['stop' + end]:
                stop_mask[i] |= 1 << slot
    rg = {'nodes': [v for p in nodes for v in (C.q1(p[0]), C.q1(p[1]))], 'names': names,
          'links': [[l['a'], l['b'], l['ni'], C.q1(l['w']), l['lanes'], l['dir'], [v for p in l['inner'] for v in (C.q1(p[0]), C.q1(p[1]))], l['flags'], C.q1(l['sw']), C.q1(l['sw'])] for l in rl],
          'control': control, 'stopMask': stop_mask, 'nhoods': [D1['name'].split(',')[0]], 'linkNhood': [0] * len(rl), 'decks': []}

    # ---- curb islands: pieces merged back across the tiles' cut edges (by kind)
    groups = {}
    for (c, r) in order:
        h, s, _ = dec[(c, r)]
        for b in s['blocks']:
            ring = [S(b['ring'][i] + c * TCM, b['ring'][i + 1] + r * TCM) for i in range(0, len(b['ring']), 2)]
            groups.setdefault(b['kind'], []).append((Polygon(ring), b))
    blocks = []
    for kind in sorted(groups):
        polys = [p.buffer(0.02, join_style='mitre') for p, _ in groups[kind]]
        merged = unary_union(polys)
        items = groups[kind]
        tree = shapely.STRtree([p for p, _ in items])
        for pp in sorted(C.polygons(merged), key=lambda g: (round(g.bounds[0], 1), round(g.bounds[1], 1))):
            for piece in [h for g in C.polygons(pp.buffer(-0.02, join_style='mitre')) for h in C.cut_holes(g)]:
                piece = piece.simplify(0.05)
                for q in C.polygons(piece):
                    if q.area < 6:
                        continue
                    pts = C.neg_ring(list(q.exterior.coords))
                    if len(pts) < 3:
                        continue
                    src = [items[i][1] for i in sorted(tree.query(q, predicate='intersects').tolist())]
                    share = max((b['park'] for b in src), default=0)
                    pname = next((b['parkName'] for b in src if b['parkName']), '')
                    theta = C.dominant_angle(pts) % (math.pi / 2)
                    x0, z0, x1, z1 = q.bounds
                    rect = q.area / max(1e-9, (x1 - x0) * (z1 - z0)) > 0.97
                    blocks.append([[v for p in pts for v in (C.q1(p[0]), C.q1(p[1]))], [], share, pname, 1 if rect else 0,
                                   [[round(theta, 4), C.q1((x0 + x1) / 2), C.q1((z0 + z1) / 2), []]], kind])

    # ---- terrain posts, mask, buildings, trees, places, water, parks
    nc, nr = c1t - c0t + 1, r1t - r0t + 1
    P = grid.POSTS - 1
    Wp, Hp = nc * P + 1, nr * P + 1
    hcm = np.zeros((Hp, Wp), np.int64)
    mask = np.zeros((nr * grid.TILE, nc * grid.TILE), np.uint8)
    bverts, btable, trees, places_raw, wparts, pparts = [], [], [], [], [], {}
    bcount_play, area_play = 0, 0.0
    for (c, r) in order:
        h, s, _ = dec[(c, r)]
        i0, j0 = (c - c0t) * P, (r - r0t) * P
        hcm[j0:j0 + P + 1, i0:i0 + P + 1] = s['terrain_cm']
        mask[(r - r0t) * grid.TILE:(r - r0t + 1) * grid.TILE, (c - c0t) * grid.TILE:(c - c0t + 1) * grid.TILE] = s['mask']
        if (c, r) in play:
            bcount_play += h['bcount']
            area_play += h['groundAreaM2']
        bv = s['bverts']
        for b in s['buildings']:
            ring = [S(bv[2 * (b['ringStart'] + k)] + c * TCM, bv[2 * (b['ringStart'] + k) + 1] + r * TCM) for k in range(b['ringCount'])]
            start = len(bverts) // 2
            for x, z in ring:
                bverts += [x, z]
            y = lambda v: v / 100.0 - y_off  # noqa: E731
            ms = []
            for mx, mz, mw, md in b.get('masses') or []:
                x, z = S(mx + c * TCM, mz + r * TCM)
                ms.append([x, z, mw / (100.0 * k0), md / (100.0 * k0)])
            btable.append((b['id'], [y(b['base']), y(b['roof']), y(b['peak']), start, b['ringCount'], b['theta'], 0, len(ms), b['shops'], b['type'],
                                     b['palette'], b.get('bays', 0), 0, 0, b.get('frontW', 0), b.get('row', 1), 3.4, b['stories'], 0, b.get('podium', 0),
                                     b.get('kind', 0), b.get('roofShape', 0), 0, 0, 0, b.get('front', -1), b.get('frontDist', 0), b.get('minH', 0) / 100.0], b, ms))
        tr = s['trees'].reshape(-1, 4) if s['trees'].size else np.zeros((0, 4), np.int64)
        for u, v, cls, trunk in tr.tolist():
            x, z = S(u + c * TCM, v + r * TCM)
            trees += [C.q1(x), C.q1(z), int(cls), int(trunk)]
        for p in s['places']:
            x, z = S(p['u'] + c * TCM, p['v'] + r * TCM)
            places_raw.append(dict(p, x=x, z=z))
        for w in s['water']:
            for ring in w['rings']:
                wparts.append(Polygon([S(ring[i] + c * TCM, ring[i + 1] + r * TCM) for i in range(0, len(ring), 2)]))
        for p in s['parks']:
            ring = p['ring']
            pparts.setdefault(p['id'], (p, []))[1].append(Polygon([S(ring[i] + c * TCM, ring[i + 1] + r * TCM) for i in range(0, len(ring), 2)]))
    # (the interim water shim, §6: one engine water level; wet posts within 1 m of it are engine water, every other post
    # at least 0.3 m above it, so no land floods; other water renders as flattened terrain)
    H = hcm / 100.0 - y_off
    if level is not None:
        wetp = np.pad(mask[::2, ::2] == C.MASK['water'], ((0, 1), (0, 1)), mode='edge')
        eng = wetp & (np.abs(H - water_level) <= 1.0)
        H = np.where(eng, water_level, np.maximum(H, water_level + 0.3))
    minH = math.floor(min(float(H.min()), water_level)) - 1
    maxH = math.ceil(float(H.max())) + 1
    scale = 0.01 if (maxH - minH) / 0.01 <= 65535 else (maxH - minH) / 65535
    q = np.round((H - minH) / scale).clip(0, 65535).astype('<u2')
    ox, oz = S(c0t * TCM, r0t * TCM)
    # (the engine's mask has no water class: water reads as the water's edge)
    mask_e = np.where(mask == C.MASK['water'], C.MASK['waterEdge'], mask).astype(np.uint8)

    # ---- spawns and mission places on the lanes (session coordinates)
    lines = []
    for l in rl:
        if l['flags'] & (C.FLAGS['private'] | C.FLAGS['pedestrian']) or l['cls'] == 'motorway':
            continue
        lines.append((LineString([nodes[l['a']], *l['inner'], nodes[l['b']]]), l))
    ltree = shapely.STRtree([g for g, _ in lines]) if lines else None

    def lane(x, z, R=80):
        if ltree is None:
            return None
        i = ltree.nearest(Point(x, z))
        if i is None:
            return None
        g, l = lines[int(i)]
        dd = g.distance(Point(x, z))
        if dd > R:
            return None
        s_ = min(max(g.project(Point(x, z)), 4), max(4, g.length - 4))
        p, p2, p1 = g.interpolate(s_), g.interpolate(min(g.length, s_ + 1)), g.interpolate(max(0, s_ - 1))
        return {'x': C.q1(p.x), 'z': C.q1(p.y), 'heading': round(math.atan2(p2.x - p1.x, p2.y - p1.y), 4), 'street': names[l['ni']], 'd': dd}
    places, seen = {}, {}
    for p in sorted(places_raw, key=lambda p: p['id']):
        if not (B['x0'] <= p['x'] <= B['x1'] and B['z0'] <= p['z'] <= B['z1']):
            continue
        ln = lane(p['x'], p['z'])
        if not ln:
            continue
        street = ln['street'].title() if ln['street'] else ''
        name = p['name'] if (p['kind'] in C.PUBLIC and p['name']) else C.GENERIC[p['kind']] + (' on ' + street if street else '')
        n = seen.get(p['kind'], 0)
        seen[p['kind']] = n + 1
        key = p['kind'] + ('' if n == 0 else str(n + 1))
        places[key] = {'x': ln['x'], 'z': ln['z'], 'heading': ln['heading'], 'name': name, 'kind': p['kind'], 'cx': C.q1(p['x']), 'cz': C.q1(p['z'])}
    # downtown: the strongest ctx centre inside the play box (else the box centre)
    ctx = W.context_for(pb['gx0'] / 100 - 3000, pb['gs0'] / 100 - 3000, pb['gx1'] / 100 + 3000, pb['gs1'] / 100 + 3000)
    cc = context.CELL
    cent = ctx.centres(pb['gx0'] // cc, pb['gs0'] // cc, pb['gx1'] // cc, pb['gs1'] // cc)
    top = None if cent else context.top_cell(ctx, pb['gx0'] // cc, pb['gs0'] // cc, pb['gx1'] // cc, pb['gs1'] // cc)
    if cent or top:
        ci, cj, sc = cent[0] if cent else top
        center = S(ci * cc + cc // 2, cj * cc + cc // 2)
        downtown = {'cell': [ci, cj], 'score': sc, 'rule': 'the strongest centre in the box' if cent else 'no centre in the box: its top-scoring cell'}
    else:
        center = ((B['x0'] + B['x1']) / 2, (B['z0'] + B['z1']) / 2)
        downtown = None
    sp = {}
    cl = lane(*center, R=600)
    if cl:
        sp['downtown'] = {'x': cl['x'], 'z': cl['z'], 'heading': cl['heading'], 'name': 'Downtown'}
    for key, (fx, fz) in {'north': (0.5, 0.2), 'south': (0.5, 0.8), 'east': (0.8, 0.5), 'west': (0.2, 0.5)}.items():
        ln = lane(B['x0'] + (B['x1'] - B['x0']) * fx, B['z0'] + (B['z1'] - B['z0']) * fz, R=600)
        if ln:
            sp[key] = {'x': ln['x'], 'z': ln['z'], 'heading': ln['heading'], 'name': (ln['street'].title() or key.title())}
    spawn = sp.get('downtown') or next(iter(sp.values()), None)
    density = round(min(1.0, max(0.15, 0.15 + bcount_play / max(area_play / 1e6, 0.1) / 2000)), 2)

    # ---- the descriptor (stage 2)
    tiles = [{'id': grid.tile_id(dom, c, r), 'sha256': hashlib.sha256(dec[(c, r)][2]).hexdigest(), 'bytes': len(blobs[(c, r)])} for (c, r) in order]
    D2 = dict(D1, stage=2, yOffset=y_off, waterLevel=water_level, waterNAVD88=level, spawn=spawn, spawns=sp, places=places,
              downtown=None if downtown is None else dict(downtown, x=C.q1(center[0]), z=C.q1(center[1])),
              districts=[D1['name'].split(',')[0]], density=density,
              roadsSummary={'links': len(rl), 'nodes': len(nodes), 'names': len(names)}, tiles=tiles, tileSetHash=tile_set_hash(tiles),
              lock={'format': 'hometown-city-lock', 'formatVersion': 2, 'place': pid, 'buildId': bid, 'grid': grid.GRID, 'domain': dom,
                    'origin': {'c0': fr['c0'], 'r0': fr['r0']}, 'k0': k0, 'gamma0': D1['gamma0'], 'yOffset': y_off, 'waterLevel': water_level,
                    'tiles': tile_set_hash(tiles)})
    mk = 'manifests/%s/%s.json' % (bid, pid)
    body = (json.dumps(D2, sort_keys=True, indent=1) + '\n').encode()
    if store and not store.put_if_absent(mk, body) and store.get(mk) != body:
        log(jdump({'warning': 'descriptor %s differs from the stored one (kept the stored)' % mk}))
    if not out_root:
        print(jdump(D2))
        return D2

    # ---- the legacy package
    out = os.path.join(out_root, pid)
    os.makedirs(os.path.join(out, 'data'), exist_ok=True)
    btable.sort(key=lambda t: t[0])
    # (ringStart and massStart in assembled order; masses in record order)
    verts2, k, mass, region = [], 0, [], None
    for _, rec, _, ms in btable:
        s0, n = rec[3], rec[4]
        rec[3] = k
        verts2 += bverts[2 * s0:2 * (s0 + n)]
        k += n
        rec[6] = len(mass) // 4
        for m in ms:
            mass += m
    table = [v for _, rec, _, _ in btable for v in rec]
    # (the place's building region: its anchor tile's)
    region = dec[min(order, key=lambda k: abs(k[0] - fr['c0']) + abs(k[1] - fr['r0']))][0].get('region', 'plains-midwest') if order else 'plains-midwest'
    theader = {'format': 'sf-terrain', 'version': 1, 'box': 'pkg', 'cell': 2 / k0, 'originX': ox, 'originZ': oz, 'w': Wp, 'h': Hp,
               'minH': minH, 'maxH': maxH, 'scale': scale, 'waterLevel': water_level, 'datum': 'NAVD88 m minus %d' % y_off,
               'grid': grid.GRID, 'source': sorted({os.path.basename(s['url']) for (c, r) in order for s in dec[(c, r)][0]['demSource']})}
    mheader = {'format': 'sf-groundmask', 'version': 1, 'box': 'pkg', 'cell': 1 / k0, 'originX': ox, 'originZ': oz, 'w': nc * grid.TILE,
               'h': nr * grid.TILE, 'classes': list(C.MASK)[:6]}
    bheader = {'format': 'sf-buildings', 'version': 4, 'box': 'pkg', 'count': len(btable), 'fields': C.BFIELDS, 'types': C.BTYPES, 'palettes': C.PALETTES,
               'eras': C.ERAS, 'facades': C.FACADES, 'tableFloats': len(table), 'vertexFloats': len(verts2), 'massFields': ['cx', 'cz', 'w', 'd'],
               'massFloats': len(mass), 'datum': 'NAVD88 m minus frame.yOffset', 'kinds': C.KINDS, 'roofShapes': C.ROOF_SHAPES, 'walls': C.WALLS,
               'region': region}
    files = {
        'data/terrain.bin.gz': C.gz(sfb1(theader, q.tobytes())),
        'data/buildings.bin.gz': C.gz(sfb1(bheader, np.array(table, dtype='<f4').tobytes() + np.array(verts2, dtype='<f4').tobytes() + np.array(mass, dtype='<f4').tobytes())),
        'data/groundmask.bin.gz': C.gz(sfb1(mheader, mask_e.tobytes())),
    }
    X0, Z0 = ox, oz
    X1, Z1 = S((c1t + 1) * TCM, (r1t + 1) * TCM)
    land = [[v for p in C.neg_ring([(X0 + 2, Z0 + 2), (X1 - 2, Z0 + 2), (X1 - 2, Z1 - 2), (X0 + 2, Z1 - 2)]) for v in (C.q1(p[0]), C.q1(p[1]))]]
    water = []
    if wparts:
        for pp in C.polygons(unary_union([p.buffer(0.02) for p in wparts])):
            water.append({'name': '', 'ring': [v for p in C.neg_ring(list(pp.simplify(1.0).exterior.coords)) for v in (C.q1(p[0]), C.q1(p[1]))]})
    parks = []
    for pid_ in sorted(pparts):
        p, parts = pparts[pid_]
        for pp in C.polygons(unary_union([g.buffer(0.02) for g in parts])):
            parks.append({'name': p['name'], 'cat': p['cat'], 'acres': round(pp.area * k0 * k0 / 4046.86, 1),
                          'rings': [[v for q_ in C.neg_ring(list(pp.exterior.coords)) for v in (C.q1(q_[0]), C.q1(q_[1]))]]})
    frame = {'units': 'm', 'grid': grid.GRID, 'domain': dom, 'c0': fr['c0'], 'r0': fr['r0'], 'k0': k0, 'gamma0': D1['gamma0'],
             'lat0': D1['origin']['lat'], 'lon0': D1['origin']['lon'], 'origin': 'NW corner of tile %s' % grid.tile_id(dom, fr['c0'], fr['r0']),
             'east': '+x (grid east)', 'north': '-z (grid north; true north is gamma0 clockwise of it... see bearingDeg)', 'up': '+y', 'headingZero': '+z',
             'bearingDeg': D1['gamma0'], 'yOffset': y_off, 'datum': 'NAVD88',
             'projection': 'hg1 %s: Lambert Conformal Conic on GRS80 (tools/hometown/grid.py); session metres = grid metres / k0' % dom}
    frame['north'] = '-z (grid north; its true bearing is bearingDeg)'
    box = {k: C.q1(v) for k, v in B.items()}
    stats = {'buildings': len(btable), 'roadLinks': len(rl), 'roadNodes': len(nodes), 'blocks': len(blocks),
             'islands': sum(1 for b in blocks if b[6] == 'island'), 'places': len(places), 'trees': len(trees) // 4, 'density': density,
             'tiles': len(order), 'playTiles': len(play), 'heightsFromOverture': sum(1 for _, _, b, _ in btable if b['fromOverture']),
             'buildingKinds': dict(sorted(((C.KINDS[k], n) for k, n in __import__('collections').Counter(b.get('kind', 0) for _, _, b, _ in btable).items()))),
             'masses': len(mass) // 4, 'outlines': sum(1 for _, rec, _, _ in btable if rec[7] == 0), 'parts': sum(1 for _, _, b, _ in btable if b.get('parent')),
             'roofShapes': dict(sorted(((C.ROOF_SHAPES[k], n) for k, n in __import__('collections').Counter(b.get('roofShape', 0) for _, _, b, _ in btable).items()))),
             'region': region}
    tile_ids = [t['id'] for t in tiles]
    GEO = {'version': 2, 'city': D1['name'], 'pkg': pid, 'frame': {k: frame[k] for k in ('lat0', 'lon0', 'units', 'bearingDeg', 'yOffset', 'grid', 'domain', 'c0', 'r0', 'k0')},
           'box': {'name': 'pkg', **box},
           'data': {'terrain': {'url': 'data/terrain.bin', 'waterLevel': water_level, 'minH': minH, 'maxH': maxH},
                    'buildings': {'url': 'data/buildings.bin', 'count': len(btable)}, 'groundMask': {'url': 'data/groundmask.bin'}},
           'land': land, 'blocks': blocks, 'roadGraph': rg, 'parks': parks, 'piers': [], 'water': water, 'rail': [], 'trolley': [], 'muniStops': [],
           'bikeways': [], 'trees': trees, 'transit': [], 'landmarks': {}, 'bridges': {}}
    GEO['frame']['up'] = 'NAVD88 m minus %d' % y_off
    PLACE_DATA = {'source': 'hometown ' + bid, 'neighborhoods': [], 'regional': {('pkg_' + k): {'x': s['x'], 'z': s['z'], 'heading': s['heading'], 'name': s['name']} for k, s in sp.items()}}
    PKG = {'id': pid, 'name': D1['name'], 'compiler': bid, 'compilerVersion': C.COMPILER_VERSION, 'buildId': bid, 'grid': grid.GRID, 'domain': dom,
           'origin': {'c0': fr['c0'], 'r0': fr['r0']}, 'k0': k0, 'gamma0': D1['gamma0'], 'yOffset': y_off, 'waterLevel': water_level,
           'tileSize': grid.TILE / k0, 'density': density, 'spawn': spawn, 'spawns': sp, 'places': places, 'attribution': C.ATTRIBUTION,
           'frame': frame, 'box': box, 'tiles': tile_ids, 'tileSetHash': D2['tileSetHash'], 'lock': D2['lock'],
           'tileHeaders': {grid.tile_id(dom, c, r): {'bcount': dec[(c, r)][0]['bcount'], 'groundAreaM2': dec[(c, r)][0]['groundAreaM2']} for (c, r) in order},
           'downtown': {'x': C.q1(center[0]), 'z': C.q1(center[1])}}
    js = ('// geodata.js: GENERATED by tools/hometown/compile.py (hg1 legacy assembler) %s for "%s", do not edit by hand.\n'
          '// Map data: %s.\n(function () {\nwindow.NYC = window.NYC || {};\nwindow.NYC.GEO = %s;\nwindow.NYC.PLACE_DATA = %s;\nwindow.NYC.PKG = %s;\n})();\n') % (
        bid, D1['name'], '; '.join(C.ATTRIBUTION), json.dumps(GEO, separators=(',', ':')), json.dumps(PLACE_DATA, separators=(',', ':')), json.dumps(PKG, separators=(',', ':')))
    files['geodata.js'] = js.encode()
    manifest = {'format': 'hometown-package', 'version': 2, 'id': pid, 'name': D1['name'],
                'compiler': {'name': 'hometown', 'version': C.COMPILER_VERSION, 'buildId': bid, 'tile': grid.TILE, 'grid': grid.GRID, 'libs': C.lib_versions()},
                'sources': {'overture': {'release': C.OVERTURE_RELEASE, 'licenses': C.LICENSES}, 'dem': theader['source'], 'bbox': D1['bbox']},
                'attribution': C.ATTRIBUTION, 'frame': frame, 'box': box, 'waterLevel': water_level, 'descriptor': mk, 'tiles': tile_ids,
                'tileSetHash': D2['tileSetHash'], 'lock': D2['lock'], 'stats': stats, 'files': {}}
    for k_, b in sorted(files.items()):
        with open(os.path.join(out, k_), 'wb') as f:
            f.write(b)
        manifest['files'][k_] = {'bytes': len(b), 'sha256': hashlib.sha256(b).hexdigest()}
    with open(os.path.join(out, 'manifest.json'), 'w') as f:
        json.dump(manifest, f, indent=1, sort_keys=True)
        f.write('\n')
    print(jdump({'id': pid, 'buildId': bid, 'stats': stats, 'yOffset': y_off, 'waterLevel': water_level, 'tileSetHash': D2['tileSetHash'],
                 'bytes': sum(v['bytes'] for v in manifest['files'].values())}), flush=True)
    return D2


def sfb1(header, payload):
    import struct
    js = json.dumps(header, sort_keys=True, separators=(',', ':')).encode()
    pad = (4 - len(js) % 4) % 4
    return b'SFB1' + struct.pack('<I', len(js) + pad) + js + b' ' * pad + payload
