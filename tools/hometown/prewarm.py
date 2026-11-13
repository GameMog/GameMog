# tools/hometown/prewarm.py: build a list of towns ahead of their first player, on the Mac (GameMog hosting, phase 1:
# the Render server only serves; docs/HOMETOWN-HOSTING.md in GameMog). One child process per town, one at a time by
# default, each `compile.py --descriptor <id> --stage 2` (the town's tiles, its ctx blocks and its session descriptor,
# written into --store in the compiler's own layout, which is exactly what GameMog's disk store holds). A town whose
# Overture regions are not fetched yet is refused by the compiler with the regions it needs; they are fetched
# (fetch.py --regions) and the town retried.
#
#   python tools/hometown/prewarm.py --places <gazetteer.json> --store <dir> [--data <dir>] [--only id,id] [--jobs 1]
#
# The gazetteer is GameMog's pre-warm list (scripts/hometown-prewarm-list.ts: the top N by 2010 population, as
# us-<GEOID>, each with its capped play box), or tools/hometown/places.json. Resumable: every finished town is a line
# of <store>/state/prewarm-<buildId>.jsonl (seconds, bytes, tiles, the terrain share, the child's peak RSS) and is
# skipped next time; a killed run loses only the towns in flight, whose stored tiles are hits on the retry.
import argparse
import concurrent.futures as cf
import gzip
import json
import os
import re
import resource
import struct
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
REGIONS = re.compile(r'fetch\.py --regions ([a-z]+:[0-9,;]+)')


def build_id(store):
    out = subprocess.run([sys.executable, os.path.join(HERE, 'compile.py'), '--print-build', '--store', store], capture_output=True, text=True, check=True, cwd=ROOT)
    return json.loads(out.stdout)['buildId']


def peak_rss_mb():
    # (ru_maxrss: bytes on macOS, KiB on Linux; the max over every child waited for so far, so it is a high-water mark)
    r = resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss
    return round((r if sys.platform == 'darwin' else r * 1024) / 2 ** 20, 1)


def tree_bytes(d):
    n = 0
    for dp, _, fs in os.walk(d):
        for f in fs:
            n += os.path.getsize(os.path.join(dp, f))
    return n


def one(pid, a, bid):
    t0 = time.time()
    fetched = []
    for attempt in range(6):
        p = subprocess.run([sys.executable, os.path.join(HERE, 'compile.py'), '--descriptor', pid, '--stage', '2', '--places', a.places,
                            '--store', a.store, '--data', a.data], capture_output=True, text=True, cwd=ROOT)
        if p.returncode == 0:
            break
        m = REGIONS.search(p.stderr)
        if p.returncode == 3 and m and attempt < 5:
            f = subprocess.run([sys.executable, os.path.join(HERE, 'fetch.py'), '--regions', m.group(1), '--data', a.data], capture_output=True, text=True, cwd=ROOT)
            if f.returncode != 0:
                return {'placeId': pid, 'error': 'fetch failed: ' + f.stderr.strip()[-300:]}
            fetched.append(m.group(1))
            continue
        return {'placeId': pid, 'error': (p.stderr.strip().splitlines() or ['exit %d' % p.returncode])[-1][-300:]}
    mk = os.path.join(a.store, 'manifests', bid, pid + '.json')
    if not os.path.exists(mk):
        return {'placeId': pid, 'error': 'no descriptor written'}
    m = json.load(open(mk))
    tiles = m.get('tiles', [])
    tb = sum(t.get('bytes', 0) for t in tiles)
    # the terrain share of the town's tiles: the heights section's share of each decoded HTL1 tile (tiles-net.js
    # parseHTL1), weighted by the tile's stored bytes (a stat for the terrain-compaction decision; never fails a town)
    terr = 0.0
    for t in tiles:
        try:
            dom, c, r = re.match(r'hg1-([a-z]+)/0/([0-9]+)/([0-9]+)$', t['id']).groups()
            raw = gzip.decompress(open(os.path.join(a.store, 'tiles', bid, 'hg1-' + dom, '0', c, r), 'rb').read())
            n = struct.unpack('<I', raw[4:8])[0]
            secs = json.loads(raw[8:8 + n])['sections']
            terr += sum(x['bytes'] for x in secs if x['name'] == 'terrain') / len(raw) * t.get('bytes', 0)
        except Exception:  # noqa: BLE001
            pass
    return {'placeId': pid, 'buildId': bid, 'name': m.get('name'), 'tiles': len(tiles), 'tileBytes': tb, 'tileSetHash': m.get('tileSetHash'),
            'terrainShare': round(terr / tb, 3) if tb else None, 'seconds': round(time.time() - t0, 1), 'fetched': fetched}


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--places', required=True)
    ap.add_argument('--store', required=True)
    ap.add_argument('--data', default=os.path.join(ROOT, '.scratch/hometown-m2/data'))
    ap.add_argument('--only', help='a comma list of place ids (default: every place, in the list\'s order)')
    ap.add_argument('--jobs', type=int, default=1, help='towns at once (each compile peaks at 1.4-1.8 GB RSS)')
    a = ap.parse_args()
    a.places, a.store, a.data = os.path.abspath(a.places), os.path.abspath(a.store), os.path.abspath(a.data)
    g = json.load(open(a.places))
    ids = a.only.split(',') if a.only else g.get('order') or list(g['places'])
    bid = build_id(a.store)
    state = os.path.join(a.store, 'state', 'prewarm-%s.jsonl' % bid)
    os.makedirs(os.path.dirname(state), exist_ok=True)
    done = set()
    if os.path.exists(state):
        for line in open(state):
            try:
                done.add(json.loads(line)['placeId'])
            except Exception:  # noqa: BLE001 (a torn last line from a kill)
                pass
    todo = [i for i in ids if i not in done]
    print(json.dumps({'buildId': bid, 'places': len(ids), 'skipped': len(ids) - len(todo), 'state': state}), flush=True)
    t0, failed = time.time(), []
    with cf.ThreadPoolExecutor(max_workers=max(1, a.jobs)) as ex:
        for rec in ex.map(lambda pid: one(pid, a, bid), todo):
            rec['peakRssMB'] = peak_rss_mb()
            print(json.dumps(rec, sort_keys=True), flush=True)
            if 'error' in rec:
                failed.append(rec['placeId'])
                continue
            with open(state, 'a') as f:
                f.write(json.dumps(rec, sort_keys=True) + '\n')
    print(json.dumps({'buildId': bid, 'built': len(todo) - len(failed), 'failed': failed, 'seconds': round(time.time() - t0, 1),
                      'storeBytes': tree_bytes(os.path.join(a.store, 'tiles', bid)) + tree_bytes(os.path.join(a.store, 'manifests', bid))}), flush=True)
    sys.exit(1 if failed else 0)
