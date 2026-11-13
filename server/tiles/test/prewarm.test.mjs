import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createTileService } from '../src/service.mjs';
import { createFakeCompiler, compilerRegistry } from '../src/compilers/index.mjs';
import { DiskStore } from '../src/storage/index.mjs';
import { loadGazetteer } from '../src/places.mjs';
import { prewarm, parsePlaceList, readState } from '../src/prewarm.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const places = await loadGazetteer(path.join(root, 'fixtures', 'places.json'));
const ids = parsePlaceList(await fs.readFile(path.join(root, 'fixtures', 'places.txt'), 'utf8'));

test('place list parsing', () => {
  assert.deepEqual(ids, ['okemah-ok', 'sf-union-square', 'phoenix-az-downtown', 'marfa-tx']);
  assert.throws(() => parsePlaceList('ok\nNot An Id\n'), /bad place id/);
});

test('prewarm resumes: a failed place is retried, finished places are skipped, stored tiles are not recompiled', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tiles-prewarm-'));
  const stateFile = path.join(dir, 'state.jsonl');
  try {
    let broken = true;
    let active = 0, peak = 0;
    const inner = createFakeCompiler({ version: 'fake-1', delayMs: 5, failOn: (k) => broken && k.x === 12367 && k.y === 26299 });
    const fake = { version: 'fake-1', async compileTile(k) { active++; peak = Math.max(peak, active); try { return await inner.compileTile(k); } finally { active--; } } };
    const mk = () => createTileService({ store: new DiskStore({ root: dir }), compilers: compilerRegistry([fake]), places, currentVersion: 'fake-1', maxConcurrentCompiles: 3 });
    const tilesOf = async (id) => JSON.parse((await mk().getManifest(id).catch(() => null))?.body || 'null');

    const r1 = await prewarm({ service: mk(), placeIds: ids, version: 'fake-1', concurrency: 2, stateFile });
    assert.equal(r1.failed.length, 1, JSON.stringify(r1.failed));
    assert.equal(r1.failed[0].placeId, 'phoenix-az-downtown');
    assert.equal(r1.warmed.length, 3);
    assert.ok(peak <= 3, `peak concurrent compiles ${peak}`);
    const firstRunCompiles = inner.total;
    const state1 = await readState(stateFile, 'fake-1');
    assert.deepEqual([...state1.keys()].sort(), ['marfa-tx', 'okemah-ok', 'sf-union-square']);

    broken = false;
    const r2 = await prewarm({ service: mk(), placeIds: ids, version: 'fake-1', concurrency: 2, stateFile });
    assert.equal(r2.skipped, 3);
    assert.deepEqual(r2.warmed.map((w) => w.placeId), ['phoenix-az-downtown']);
    const phx = await tilesOf('phoenix-az-downtown');
    // Only the phoenix tiles that failed (or never started) the first time were compiled now.
    assert.ok(inner.total - firstRunCompiles < phx.tileCount, `recompiled ${inner.total - firstRunCompiles} of ${phx.tileCount}`);
    assert.ok(inner.total - firstRunCompiles >= 1);

    const r3 = await prewarm({ service: mk(), placeIds: ids, version: 'fake-1', concurrency: 2, stateFile });
    assert.equal(r3.skipped, 4);
    assert.equal(r3.warmed.length, 0);

    // An aborted run stops launching places and reports it.
    const ac = new AbortController();
    ac.abort();
    const r4 = await prewarm({ service: mk(), placeIds: ids, version: 'fake-2', concurrency: 2, stateFile, signal: ac.signal }).catch((e) => e);
    assert.match(String(r4.message || ''), /no compiler registered/);
    const s5 = createTileService({ store: new DiskStore({ root: dir }), compilers: compilerRegistry([createFakeCompiler({ version: 'fake-2' })]), places, currentVersion: 'fake-2' });
    const r5 = await prewarm({ service: s5, placeIds: ids, version: 'fake-2', stateFile, signal: ac.signal });
    assert.equal(r5.interrupted, true);
    assert.equal(r5.warmed.length, 0);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('prewarm CLI: second run is a no-op resume', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tiles-prewarm-cli-'));
  try {
    const args = [path.join(root, 'bin', 'prewarm.mjs'), '--places', path.join(root, 'fixtures', 'places.txt'), '--version', 'fake-7', '--store-dir', dir, '--concurrency', '2', '--max-compiles', '4'];
    const a = spawnSync(process.execPath, args, { encoding: 'utf8' });
    assert.equal(a.status, 0, a.stderr);
    const ra = JSON.parse(a.stdout);
    assert.equal(ra.warmed.length, 4);
    assert.ok(ra.compiles > 0);
    const b = spawnSync(process.execPath, args, { encoding: 'utf8' });
    assert.equal(b.status, 0, b.stderr);
    const rb = JSON.parse(b.stdout);
    assert.equal(rb.skipped, 4);
    assert.equal(rb.compiles, 0);
    assert.equal(rb.stateFile, path.join(dir, 'prewarm', 'fake-7.jsonl'));
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
