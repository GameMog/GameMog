# tools/hometown/frame.py: a place's FRAME descriptor (compile.py --frame <placeId>), the part of a town the story and
# the engine pin before any tile exists. It is computed from stage 1 (gazetteer + grid), the ctx blocks, the Overture
# regions and the DEM, and NEVER from compiled tiles, so it is the same bytes whether none, some or all of the place's
# tiles are in the store (test_frame.py), and a town can be written about and spawned into seconds after it is picked.
#
#   yOffset, waterLevel   today's stage-2 rule (the 0.5th percentile of dry ground; the largest water within 1 m above
#                         it), fed by the post function at every 8th post (16 m) over the play box: 3DEP 1/3" bilinear
#                         at the 5 x 5 posts round it, water polygons flattened to their ctx level (per post's block),
#                         the tiles' sigma-1-post blur (land only), int cm. (The tiles' bridge raise is left out: it only
#                         ever lifts ground near a bridge, never the low percentile a datum is taken from.)
#   lanes                 the regions' Overture segments cut into the tiles' own pieces (World.pieces: same projection,
#                         same cm quantisation, same names), less every piece a car must not be put on: motorways,
#                         private, pedestrian and tunnel pieces, any bridge stretch and any level above 0 (a stricter
#                         rule than the tiles' decks: a culvert the tiles keep at grade is left out here too)
#   places                the tiles' place rule (confidence >= 0.45, open, a GENERIC kind; public names kept) over the
#                         play box, snapped to those lanes within 80 m; named as the assembler always named them
#   spawns                downtown (the strongest ctx centre in the box, else its top-scoring cell, else the box
#                         centre, on a lane within 600 m) and the north / south / east / west arrivals
#   district              the spawn's tile and 2 tiles each way (5 x 5, ~2.5 km), the first bundle a player drives in;
#                         spawns and places inside it less DISTRICT_MARGIN carry district: true
#   lock v3               {format 'hometown-city-lock', formatVersion 3, place, buildId, grid, domain, origin, k0,
#                         gamma0, yOffset, waterLevel, tiles: tiles_id(buildId, pinned tile ids)}: the same for the
#                         district and the full bundle (tiles are pure functions of key and build, so their ids name
#                         their bytes; the content hashes stay in the stage-2 manifest)
#
# The frame is ONE source of truth: the assembler (assemble.py) lays spawns, places, yOffset and waterLevel out from it
# and never recomputes them, so the story and the world cannot disagree. Stored at frames/{buildId}/{placeId}.json.
import hashlib
import json
import math

import numpy as np
import shapely
from shapely.geometry import LineString, Point, box as sbox

import grid
import context
import compile as C

FRAME_FORMAT = 'hometown-frame'
FRAME_VERSION = 1
LOCK_VERSION = 3
POST_STEP = 8              # posts (2 m) between frame posts: 16 grid m
DISTRICT_R = 2             # tiles each way round the spawn tile (5 x 5)
DISTRICT_MARGIN = 300.0    # session m: a place this close to the district's edge is not a district place
LANE_REACH = 600.0         # m: the arrivals' lane search (the regions must cover the play box + this)
PLACE_REACH = 80.0
BLUR = np.array([0.0545, 0.2442, 0.4026, 0.2442, 0.0545])   # compile.py posts_cm's kernel
NO_LANE = C.FLAGS['private'] | C.FLAGS['pedestrian'] | C.FLAGS['deck'] | C.FLAGS['tunnel']


def jdump(o):
    return json.dumps(o, sort_keys=True, separators=(',', ':'))


def tiles_id(build_id, tile_ids):
    """Lock v3 `tiles`: sha256 of the buildId and the sorted tile ids, one per line (no trailing newline):
    sha256('htc-...\\nhg1-conus/0/1/2\\nhg1-conus/0/1/3'). GameMog (lib/hometown/ids.ts) and the engine hash the same."""
    return hashlib.sha256('\n'.join([build_id] + sorted(tile_ids)).encode()).hexdigest()


def frame_key(bid, pid):
    return 'frames/%s/%s.json' % (bid, pid)


# ------------------------------------------------------------------------------------------------------------- posts
def frame_posts(W, ctx, gx0, gs0, gx1, gs1):
    """Post heights (int cm NAVD88), wet flags and the wet posts' water ids at every POST_STEP-th global post inside the
    grid-metre box: the tiles' post function at those posts (no bridge raise). Pure per post."""
    S = grid.POST * POST_STEP
    I = np.arange(math.ceil(gx0 / S), math.floor(gx1 / S) + 1) * POST_STEP      # global post indices (2 m posts)
    J = np.arange(math.ceil(gs0 / S), math.floor(gs1 / S) + 1) * POST_STEP
    II, JJ = np.meshgrid(I, J)
    II, JJ = II.ravel(), JJ.ravel()
    off = np.arange(-2, 3)
    # (n, 5, 5): row dj, column di round each frame post
    PI = II[:, None, None] + off[None, None, :]
    PJ = JJ[:, None, None] + off[None, :, None]
    PI, PJ = np.broadcast_to(PI, (II.size, 5, 5)), np.broadcast_to(PJ, (II.size, 5, 5))
    X, Z = (PI * float(grid.POST)).ravel(), (PJ * float(grid.POST)).ravel()
    lon, lat = W.d.inverse(X, Z)
    h = W.dem.sample(lon, lat)
    h[~np.isfinite(h)] = 0.0
    wet = np.zeros(X.shape, bool)
    wid = np.full(X.shape, -1, np.int64)
    wlv = np.full(X.shape, 0, np.int64)
    ids = []
    BL = context.BLOCK
    Cb, Rb = np.floor_divide(PI.ravel() * grid.POST, BL), np.floor_divide(PJ.ravel() * grid.POST, BL)
    win = sbox(X.min(), Z.min(), X.max(), Z.max())
    for r in context.water_polys(W.src, win):
        b0, b1, b2, b3 = r['poly'].bounds
        cand = np.nonzero((X >= b0) & (X <= b2) & (Z >= b1) & (Z <= b3) & ~wet)[0]
        if not cand.size:
            continue
        inside = np.zeros(X.shape, bool)
        inside[cand] = shapely.contains_xy(r['poly'], X[cand], Z[cand])
        if not inside.any():
            continue
        for Cc, Rr in sorted(set(zip(Cb[inside].tolist(), Rb[inside].tolist()))):
            lv = ctx.level(r['id'], Cc, Rr)
            if lv is None:
                continue
            sel = inside & (Cb == Cc) & (Rb == Rr)
            h[sel] = lv / 100.0
            wet |= sel
            if r['id'] not in ids:
                ids.append(r['id'])
            wid[sel] = ids.index(r['id'])
            wlv[sel] = lv
    h, wet, wid, wlv = h.reshape(-1, 5, 5), wet.reshape(-1, 5, 5), wid.reshape(-1, 5, 5), wlv.reshape(-1, 5, 5)
    # the separable blur at the centre post: rows first (each of the 5 rows at its centre column), then the column
    ok = ~wet
    num = (np.where(ok, h, 0) * BLUR[None, None, :]).sum(2)
    den = (ok * BLUR[None, None, :]).sum(2)
    rows = np.where(den > 0, num / np.maximum(den, 1e-9), h[:, :, 2])
    rows = np.where(wet[:, :, 2], h[:, :, 2], rows)             # (n, 5): the row-blurred column
    okc = ~wet[:, :, 2]
    num = (np.where(okc, rows, 0) * BLUR[None, :]).sum(1)
    den = (okc * BLUR[None, :]).sum(1)
    out = np.where(den > 0, num / np.maximum(den, 1e-9), rows[:, 2])
    out = np.where(wet[:, 2, 2], rows[:, 2], out)
    return np.rint(out * 100).astype(np.int64), wet[:, 2, 2].copy(), wid[:, 2, 2].copy(), ids, wlv[:, 2, 2].copy()


def datum(cm, wet, wid, ids, wlv):
    """Today's stage-2 rule on the frame posts -> (yOffset int m, waterLevel m, the water's NAVD88 level or None, waters).
    A water's level: the ctx level most of its frame posts carry (a polygon over two ctx blocks has two; ties: lower)."""
    dry = cm[~wet] if (~wet).any() else cm
    low = float(np.percentile(dry, 0.5)) / 100 if dry.size else float(cm.min()) / 100
    waters = {}
    for k in np.unique(wid[wid >= 0]).tolist():
        vals, cnt = np.unique(wlv[wid == k], return_counts=True)
        waters[ids[k]] = {'level_cm': int(vals[int(np.argmax(cnt))]), 'cells': int((wid == k).sum())}
    cand = sorted(((-v['cells'], w, v['level_cm']) for w, v in waters.items() if v['level_cm'] / 100 <= low + 1.0))
    level = cand[0][2] / 100 if cand else None
    gmin = float(cm.min()) / 100
    y_off = int(math.floor(level)) if level is not None else int(math.floor(gmin))
    water_level = round(level - y_off, 2) if level is not None else -10.0
    return y_off, water_level, level, waters


# ------------------------------------------------------------------------------------------------------------- frame
def compute(pid, places, data, store, bid, log=print, W=None):
    """-> (frame, World). W: a World private to the frame (never one tiles are compiled in)."""
    import assemble
    D1 = assemble.stage1(pid, places, bid, data, store)
    dom = D1['domain']
    c0t, r0t, c1t, r1t = D1['tileRange']
    pb = D1['playBox']
    if W is None:
        # (its own World over the play box's tiles: the frame never shares one with tile compiles, see lanes below)
        T = grid.TILE_CM
        W = C.World(data, dom, C.tile_window(pb['gx0'] // T, pb['gs0'] // T, pb['gx1'] // T, pb['gs1'] // T), store, bid, log)
    # (a lane's position, name and flags are all the frame reads of a piece; its width and lane counts (OSM side table,
    # the slowest part of a piece) are not, so this World skips them. It is private to the frame: no tile is compiled in it)
    W.lanes = lambda s, d: {'lf': 1, 'lb': 1, 'w': 0.0, 'src': None, 'spd': None}
    gx0, gs0, gx1, gs1 = pb['gx0'] / 100.0, pb['gs0'] / 100.0, pb['gx1'] / 100.0, pb['gs1'] / 100.0
    W.src.require(gx0 - LANE_REACH - 200, gs0 - LANE_REACH - 200, gx1 + LANE_REACH + 200, gs1 + LANE_REACH + 200, 'frame %s' % pid)
    k0 = D1['k0']
    TCM = grid.TILE_CM
    c0, r0 = D1['origin']['c0'], D1['origin']['r0']

    def S(gx, gs):   # int cm -> session m
        return (gx - TCM * c0) / (100.0 * k0), (gs - TCM * r0) / (100.0 * k0)

    def G(x, z):     # session m -> int cm
        return int(round(x * 100.0 * k0)) + TCM * c0, int(round(z * 100.0 * k0)) + TCM * r0
    bx0, bz0 = S(pb['gx0'], pb['gs0'])
    bx1, bz1 = S(pb['gx1'], pb['gs1'])
    B = {'x0': bx0, 'x1': bx1, 'z0': bz0, 'z1': bz1}

    # ---- ctx: the box + 3 km (downtown centres look 2 km round each cell; water levels per block)
    ctx = W.context_for(gx0 - 3000, gs0 - 3000, gx1 + 3000, gs1 + 3000)

    # ---- yOffset, waterLevel
    cmv, wet, wid, ids, wlv = frame_posts(W, ctx, gx0, gs0, gx1, gs1)
    y_off, water_level, level, waters = datum(cmv, wet, wid, ids, wlv)

    # ---- lanes: the tiles' pieces of every segment round the box (session metres)
    reach = sbox(gx0 - LANE_REACH, gs0 - LANE_REACH, gx1 + LANE_REACH, gs1 + LANE_REACH)
    lines, seen_p = [], set()
    for s in W.src.query('segments', reach):
        for p in W.pieces(s):
            key = (p['seg'], p['i'])
            if key in seen_p:
                continue
            seen_p.add(key)
            if p['flags'] & NO_LANE or p['cls'] == 'motorway' or p['br'] or p['lvl'] > 0:
                continue
            pts = [S(x, z) for x, z in p['pts']]
            if len(pts) < 2:
                continue
            lines.append((LineString(pts), p))
    lines.sort(key=lambda t: (t[1]['seg'], t[1]['i']))
    ltree = shapely.STRtree([g for g, _ in lines]) if lines else None

    def lane(x, z, R=PLACE_REACH):
        if ltree is None:
            return None
        pt = Point(x, z)
        # (the nearest piece; ties by (segment, piece): never the index's own order)
        cand = ltree.query(pt.buffer(R))
        if not len(cand):
            return None
        best = min(cand.tolist(), key=lambda i: (round(lines[i][0].distance(pt), 6), lines[i][1]['seg'], lines[i][1]['i']))
        g, l = lines[best]
        dd = g.distance(pt)
        if dd > R:
            return None
        s_ = min(max(g.project(pt), 4), max(4, g.length - 4))
        p, p2, p1 = g.interpolate(s_), g.interpolate(min(g.length, s_ + 1)), g.interpolate(max(0, s_ - 1))
        return {'x': C.q1(p.x), 'z': C.q1(p.y), 'heading': round(math.atan2(p2.x - p1.x, p2.y - p1.y), 4), 'street': l['name'] or '', 'd': dd}

    # ---- places: the tiles' place rule over the play box
    places_raw = []
    for p in W.src.places_in(sbox(gx0, gs0, gx1, gs1)):
        if not (pb['gx0'] <= p['gx'] <= pb['gx1'] and pb['gs0'] <= p['gs'] <= pb['gs1']):
            continue
        cat = p['basic_category'] or p['cat'] or ''
        if not cat or (p['confidence'] or 0) < 0.45 or (p['operating_status'] and p['operating_status'] != 'open'):
            continue
        kind = cat if cat in C.GENERIC else next((k for k in C.GENERIC if k in cat), None)
        if not kind:
            continue
        x, z = S(p['gx'], p['gs'])
        places_raw.append({'id': p['id'], 'x': x, 'z': z, 'kind': kind, 'name': p['name'] if (kind in C.PUBLIC and p['name']) else ''})
    out_places, seen = {}, {}
    for p in sorted(places_raw, key=lambda p: p['id']):
        ln = lane(p['x'], p['z'])
        if not ln:
            continue
        street = ln['street'].title() if ln['street'] else ''
        name = p['name'] if (p['kind'] in C.PUBLIC and p['name']) else C.GENERIC[p['kind']] + (' on ' + street if street else '')
        n = seen.get(p['kind'], 0)
        seen[p['kind']] = n + 1
        key = p['kind'] + ('' if n == 0 else str(n + 1))
        out_places[key] = {'x': ln['x'], 'z': ln['z'], 'heading': ln['heading'], 'name': name, 'kind': p['kind'], 'cx': C.q1(p['x']), 'cz': C.q1(p['z']),
                           'street': street, 'overture': p['id']}

    # ---- downtown and the arrivals (as the assembler always placed them)
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
    cl = lane(*center, R=LANE_REACH)
    if cl:
        sp['downtown'] = {'x': cl['x'], 'z': cl['z'], 'heading': cl['heading'], 'name': 'Downtown'}
    for key, (fx, fz) in {'north': (0.5, 0.2), 'south': (0.5, 0.8), 'east': (0.8, 0.5), 'west': (0.2, 0.5)}.items():
        ln = lane(B['x0'] + (B['x1'] - B['x0']) * fx, B['z0'] + (B['z1'] - B['z0']) * fz, R=LANE_REACH)
        if ln:
            sp[key] = {'x': ln['x'], 'z': ln['z'], 'heading': ln['heading'], 'name': (ln['street'].title() or key.title())}
    spawn_key = 'downtown' if 'downtown' in sp else next(iter(sorted(sp)), None)
    spawn = sp.get(spawn_key)

    # ---- the spawn district: 5 x 5 tiles round the spawn's tile (inside the pinned range)
    if spawn:
        sc_, sr_ = grid.tile_of(*G(spawn['x'], spawn['z']))
    else:
        sc_, sr_ = grid.tile_of(*G((B['x0'] + B['x1']) / 2, (B['z0'] + B['z1']) / 2))
    dc0, dr0 = max(c0t, sc_ - DISTRICT_R), max(r0t, sr_ - DISTRICT_R)
    dc1, dr1 = min(c1t, sc_ + DISTRICT_R), min(r1t, sr_ + DISTRICT_R)
    dx0, dz0 = S(dc0 * TCM, dr0 * TCM)
    dx1, dz1 = S((dc1 + 1) * TCM, (dr1 + 1) * TCM)
    m = DISTRICT_MARGIN

    def inside(o):
        return dx0 + m <= o['x'] <= dx1 - m and dz0 + m <= o['z'] <= dz1 - m
    for o in list(out_places.values()) + list(sp.values()):
        if inside(o):
            o['district'] = True
    district = {'variant': 'district-%d-%d' % (sc_, sr_), 'tile': [sc_, sr_], 'tileRange': [dc0, dr0, dc1, dr1],
                'tiles': [grid.tile_id(dom, c, r) for r in range(dr0, dr1 + 1) for c in range(dc0, dc1 + 1)],
                'box': {'x0': C.q1(dx0), 'z0': C.q1(dz0), 'x1': C.q1(dx1), 'z1': C.q1(dz1)}, 'marginM': m,
                'places': sorted(k for k, o in out_places.items() if o.get('district')), 'spawns': sorted(k for k, o in sp.items() if o.get('district'))}

    # ---- density (ctx building counts over the box's land) and the streets
    i0, j0, i1, j1 = pb['gx0'] // cc - ctx.i0, pb['gs0'] // cc - ctx.j0, pb['gx1'] // cc - ctx.i0, pb['gs1'] // cc - ctx.j0
    bcount = int(ctx.b[j0:j1 + 1, i0:i1 + 1].sum())
    land_km2 = (gx1 - gx0) * (gs1 - gs0) / 1e6 * (1.0 - float(wet.mean()) if wet.size else 1.0)
    density = round(min(1.0, max(0.15, 0.15 + bcount / max(land_km2, 0.1) / 2000)), 2)
    streets, sbx = {}, sbox(B['x0'], B['z0'], B['x1'], B['z1'])
    for g, l in lines:
        if l['name'] and g.intersects(sbx):
            streets[l['name']] = streets.get(l['name'], 0.0) + g.intersection(sbx).length

    tile_ids = D1['tiles']
    lock = {'format': 'hometown-city-lock', 'formatVersion': LOCK_VERSION, 'place': pid, 'buildId': bid, 'grid': grid.GRID, 'domain': dom,
            'origin': {'c0': c0, 'r0': r0}, 'k0': k0, 'gamma0': D1['gamma0'], 'yOffset': y_off, 'waterLevel': water_level,
            'tiles': tiles_id(bid, tile_ids)}
    F = dict(D1, format=FRAME_FORMAT, version=FRAME_VERSION, stage='frame', compilerVersion=C.COMPILER_VERSION,
             yOffset=y_off, waterLevel=water_level, waterNAVD88=level, spawn=spawn, spawnKey=spawn_key, spawns=sp, places=out_places,
             downtown=None if downtown is None else dict(downtown, x=C.q1(center[0]), z=C.q1(center[1])),
             districts=[D1['name'].split(',')[0]], density=density, district=district, box={k: C.q1(v) for k, v in B.items()},
             streets=[{'name': n, 'm': round(v)} for n, v in sorted(streets.items(), key=lambda kv: (-round(kv[1]), kv[0]))],
             datumRule={'posts': 'every %d grid m over the play box (%d posts)' % (grid.POST * POST_STEP, int(cmv.size)), 'wetPosts': int(wet.sum()),
                        'waters': {w: v for w, v in sorted(waters.items())}},
             lanesRule={'pieces': len(lines), 'excluded': 'motorway, private, pedestrian, tunnel, any bridge stretch, level > 0'},
             tilesId=lock['tiles'], lock=lock)
    return F, W


def body(F):
    return (json.dumps(F, sort_keys=True, indent=1) + '\n').encode()


def store_frame(store, F, log=print):
    k = frame_key(F['buildId'], F['placeId'])
    b = body(F)
    if store and not store.put_if_absent(k, b) and store.get(k) != b:
        log(jdump({'warning': 'frame %s differs from the stored one (kept the stored)' % k}))
        return json.loads(store.get(k)), k
    return F, k


def load_or_compute(pid, places, data, store, bid, log=print):
    """The stored frame, else a computed (and stored) one: always as its stored bytes read back (sorted keys), so a
    package or bundle laid out from a frame just computed and one from a frame already in the store are the same bytes
    (the spawns' and places' order is the JSON's)."""
    if store:
        b = store.get(frame_key(bid, pid))
        if b is not None:
            return json.loads(b)
    F, _ = compute(pid, places, data, store, bid, log)
    F, _ = store_frame(store, F, log)
    return json.loads(body(F))
