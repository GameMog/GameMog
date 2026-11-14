# tools/hometown/grid_vectors.py: writes tools/hometown/grid-vectors.json, the hg1 test vectors both twins must pass
# (wagmi/world/grid.js via tests/grid.test.mjs, server/tiles via its keys test) and checks Python against itself:
#   forward (E', S) to 1e-6 m, inverse to 1e-9 deg, keys from the integer cm (edge-exact points: the higher c / r tile)
#   python tools/hometown/grid_vectors.py [--check]
import json
import math
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import grid  # noqa: E402

POINTS = {
    'conus': [('San Francisco', -122.4194, 37.7749), ('Okemah', -96.300309, 35.429269), ('Bangor', -68.77, 44.80),
              ('Key West', -81.78, 24.55), ('Seattle', -122.33, 47.61), ('Cape Flattery', -124.73, 48.38),
              ('West Quoddy', -66.95, 44.81), ('San Diego', -117.16, 32.72), ('Brownsville', -97.5, 25.9),
              ('Miami', -80.19, 25.77), ('Lake of the Woods', -95.15, 49.38), ('Memphis', -90.049, 35.149),
              ('West Memphis', -90.184, 35.146), ('Minneapolis', -93.265, 44.978), ('St Paul', -93.09, 44.954),
              ('Phoenix', -112.074, 33.4585), ('Pittsburgh', -79.98, 40.424), ('El Paso', -106.485, 31.759),
              ('New Orleans', -90.07, 29.95), ('Denver', -104.99, 39.74), ('Chicago', -87.63, 41.88),
              ('New York', -74.006, 40.7128), ('Boston', -71.06, 42.36), ('Dry Tortugas', -82.87, 24.63),
              ('Point Roberts', -123.08, 48.99), ('Northwest Angle', -95.1, 49.36), ('Washington DC', -77.037, 38.907)],
    'ak': [('Anchorage', -149.9, 61.2), ('Utqiagvik', -156.8, 71.29), ('Ketchikan', -131.6, 55.34),
           ('Attu (172.9E)', 172.9, 52.9), ('Adak', -176.6, 51.88), ('Juneau', -134.42, 58.3), ('Fairbanks', -147.72, 64.84),
           ('Nome', -165.4, 64.5), ('Kodiak', -152.4, 57.79), ('Unalaska', -166.54, 53.87), ('Prudhoe', -148.4, 70.25),
           ('Hyder', -130.01, 55.91), ('Amchitka (179.3E)', 179.3, 51.5), ('Shemya (174.1E)', 174.1, 52.72)],
    'hi': [('Honolulu', -157.86, 21.31), ('Hilo', -155.09, 19.72), ('Niihau', -160.15, 21.9), ('South Point', -155.68, 18.91),
           ('Lihue', -159.37, 21.98), ('Kahului', -156.47, 20.89), ('Kailua-Kona', -155.99, 19.64), ('Lanai City', -156.92, 20.83)],
    'pr': [('San Juan', -66.1, 18.47), ('St Croix', -64.7, 17.73), ('Mona', -67.9, 18.08), ('Ponce', -66.61, 18.01),
           ('Mayaguez', -67.15, 18.2), ('Charlotte Amalie', -64.93, 18.34), ('Culebra', -65.3, 18.31), ('Vieques', -65.44, 18.12)],
    'gu': [('Hagatna', 144.75, 13.47), ('Saipan', 145.75, 15.18), ('Farallon de Pajaros', 144.9, 20.55), ('Rota', 145.2, 14.15),
           ('Tinian', 145.63, 15.0), ('Merizo', 144.67, 13.26), ('Pagan', 145.77, 18.12), ('Agrihan', 145.67, 18.77)],
    'as': [('Pago Pago', -170.7, -14.28), ('Swains', -171.08, -11.05), ('Rose', -168.15, -14.55), ('Tau', -169.5, -14.23),
           ('Leone', -170.78, -14.34), ('Ofu', -169.65, -14.17), ('Aunuu', -170.55, -14.28), ('Nuuuli', -170.72, -14.31)],
}


def entry(d, name, lon, lat):
    E, S = d.forward([lon], [lat])
    gx, gs = int(grid.to_cm(E)[0]), int(grid.to_cm(S)[0])
    c, r = grid.tile_of(gx, gs)
    edge = min(gx % grid.TILE_CM, grid.TILE_CM - gx % grid.TILE_CM, gs % grid.TILE_CM, grid.TILE_CM - gs % grid.TILE_CM)
    return {'domain': d.name, 'name': name, 'lon': lon, 'lat': lat, 'E': float(E[0]), 'S': float(S[0]), 'gx': gx, 'gs': gs,
            'c': c, 'r': r, 'id': grid.tile_id(d, c, r), 'gamma': d.gamma(lon), 'k': d.scale(lon, lat), 'edgeCm': edge}


def build():
    out = []
    for dn, pts in POINTS.items():
        d = grid.domain(dn)
        for name, lon, lat in pts:
            out.append(entry(d, name, lon, lat))
        # edge-exact cm points: a tile corner / an edge, given as integers (the higher c / r tile owns them)
        base = out[-len(pts)]
        c, r = base['c'], base['r']
        for k, (gx, gs) in enumerate([(c * grid.TILE_CM, r * grid.TILE_CM), ((c + 1) * grid.TILE_CM, r * grid.TILE_CM + 1234),
                                      (c * grid.TILE_CM + 777, (r + 1) * grid.TILE_CM)]):
            lon, lat = d.inverse([gx / 100.0], [gs / 100.0])
            out.append({'domain': dn, 'name': 'edge-exact %d near %s' % (k, base['name']), 'edgeExact': True, 'gx': gx, 'gs': gs,
                        'c': gx // grid.TILE_CM, 'r': gs // grid.TILE_CM, 'id': grid.tile_id(d, gx // grid.TILE_CM, gs // grid.TILE_CM),
                        'E': gx / 100.0, 'S': gs / 100.0, 'lon': float(lon[0]), 'lat': float(lat[0])})
    return out


def check(vecs):
    bad = 0
    for v in vecs:
        d = grid.domain(v['domain'])
        if v.get('edgeExact'):
            if grid.tile_of(v['gx'], v['gs']) != (v['c'], v['r']):
                bad += 1
            lon, lat = d.inverse([v['E']], [v['S']])
            E, S = d.forward(lon, lat)
            if abs(E[0] - v['E']) > 1e-6 or abs(S[0] - v['S']) > 1e-6:
                bad += 1
            continue
        E, S = d.forward([v['lon']], [v['lat']])
        lon, lat = d.inverse([v['E']], [v['S']])
        dl = abs(((lon[0] - v['lon'] + 180) % 360) - 180)
        if abs(E[0] - v['E']) > 1e-6 or abs(S[0] - v['S']) > 1e-6 or dl > 1e-9 or abs(lat[0] - v['lat']) > 1e-9 or v['E'] < 0 or v['S'] < 0:
            print('BAD', v['name'], E[0] - v['E'], S[0] - v['S'], dl, lat[0] - v['lat'])
            bad += 1
    return bad


def round_trip():
    """inverse(forward) on a 1 km lattice over each domain's extent of points (their bbox + 1 degree): worst error (m),
    and the smallest E' / S seen (all must be >= 0)."""
    res = {}
    for dn, pts in POINTS.items():
        d = grid.domain(dn)
        Ep, S = d.forward([p[1] for p in pts], [p[2] for p in pts])
        e0, e1, s0, s1 = Ep.min() - 100e3, Ep.max() + 100e3, S.min() - 100e3, S.max() + 100e3
        X, Z = np.meshgrid(np.arange(e0, e1, 1000.0), np.arange(s0, s1, 1000.0))
        lon, lat = d.inverse(X.ravel(), Z.ravel())
        # (Alaska: only lattice points whose longitude lies inside the frozen (-200, -125] window, the domain itself)
        nl = d.norm_lon(lon)
        ok = (nl > -199.0) & (nl < -126.0) if dn == 'ak' else np.ones(lon.shape, bool)
        E2, S2 = d.forward(lon[ok], lat[ok])
        err = float(np.max(np.hypot(E2 - X.ravel()[ok], S2 - Z.ravel()[ok])))
        res[dn] = {'points': int(ok.sum()), 'maxErrM': err, 'minE': float(min(e0, Ep.min())), 'minS': float(min(s0, S.min()))}
    return res


if __name__ == '__main__':
    vecs = build()
    path = os.path.join(HERE, 'grid-vectors.json')
    if '--check' in sys.argv:
        vecs = json.load(open(path))['vectors']
    else:
        doc = {'format': 'hometown-grid-vectors', 'grid': grid.GRID, 'domains': {k: list(v[:6]) for k, v in grid.DOMAINS.items()},
               'bounds': grid.BOUNDS, 'vectors': vecs}
        with open(path, 'w') as f:
            json.dump(doc, f, indent=1, sort_keys=True)
            f.write('\n')
    print(json.dumps({'vectors': len(vecs), 'bad': check(vecs), 'roundTrip': round_trip()}, indent=1))
