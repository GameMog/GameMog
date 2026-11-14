#!/usr/bin/env node
// Local load test of the tile service over real HTTP (127.0.0.1:4690 by default), with the fake compiler.
//   node server/tiles/bin/loadtest.mjs [--port 4690] [--tiles 200] [--concurrency 32] [--hot-rounds 10]
//                                      [--compile-ms 25] [--stampede 100] [--store disk|memory]
// Phases: cold (every request a miss: compile + store), hot-memory (LRU hits), hot-store (fresh process state:
// empty LRU, tiles read from the store), stampede (N concurrent misses for ONE new key: must compile exactly once).
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createTileService } from '../src/service.mjs';
import { createFakeCompiler, compilerRegistry } from '../src/compilers/index.mjs';
import { DiskStore, MemoryStore } from '../src/storage/index.mjs';
import { loadGazetteer } from '../src/places.mjs';
import { createHttpHandler } from '../src/http.mjs';
import { mapLimit } from '../src/util.mjs';

const { values: o } = parseArgs({ options: {
  port: { type: 'string', default: '4690' }, tiles: { type: 'string', default: '200' }, concurrency: { type: 'string', default: '32' },
  'hot-rounds': { type: 'string', default: '10' }, 'compile-ms': { type: 'string', default: '25' }, stampede: { type: 'string', default: '100' },
  store: { type: 'string', default: 'disk' }, 'max-compiles': { type: 'string', default: '8' },
} });
const PORT = Number(o.port), N = Number(o.tiles), C = Number(o.concurrency);
const here = path.dirname(fileURLToPath(import.meta.url));
const places = await loadGazetteer(path.join(here, '..', 'fixtures', 'places.json'));
const dir = o.store === 'disk' ? await fs.mkdtemp(path.join(os.tmpdir(), 'tiles-loadtest-')) : null;
const store = dir ? new DiskStore({ root: dir }) : new MemoryStore();
const fake = createFakeCompiler({ version: 'fake-1', delayMs: Number(o['compile-ms']) });
const make = () => createTileService({ store, compilers: compilerRegistry([fake]), places, currentVersion: 'fake-1', maxConcurrentCompiles: Number(o['max-compiles']) });
let service = make();
const server = http.createServer((req, res) => handler(req, res));
let handler = createHttpHandler(service);
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
const agent = new http.Agent({ keepAlive: true, maxSockets: Math.max(C, Number(o.stampede)) });

function get(p) {
  const t0 = process.hrtime.bigint();
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: PORT, path: p, agent, headers: { 'accept-encoding': 'gzip' } }, (res) => {
      const c = [];
      res.on('data', (d) => c.push(d));
      res.on('end', () => resolve({ status: res.statusCode, ms: Number(process.hrtime.bigint() - t0) / 1e6, source: res.headers['x-tile-source'], bytes: Buffer.concat(c) }));
    });
    req.on('error', reject);
    req.end();
  });
}

const pct = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)]; };
function summary(name, rs, wallMs) {
  const ms = rs.map((r) => r.ms);
  const sources = {};
  for (const r of rs) sources[r.source] = (sources[r.source] || 0) + 1;
  return { phase: name, requests: rs.length, non200: rs.filter((r) => r.status !== 200).length, sources,
    p50: +pct(ms, 50).toFixed(2), p95: +pct(ms, 95).toFixed(2), p99: +pct(ms, 99).toFixed(2), max: +Math.max(...ms).toFixed(2), rps: Math.round(rs.length / (wallMs / 1000)) };
}
async function phase(name, paths) {
  const t0 = Date.now();
  const rs = await mapLimit(paths, C, (p) => get(p));
  return summary(name, rs, Date.now() - t0);
}

const tiles = Array.from({ length: N }, (_, i) => `/tiles/fake-1/hg1-conus/0/${1400 + (i % 40)}/${7400 + Math.floor(i / 40)}`);
const out = { config: { tiles: N, concurrency: C, compileMs: Number(o['compile-ms']), maxConcurrentCompiles: Number(o['max-compiles']), store: store.describe(), node: process.version } };
out.cold = await phase('cold (miss: compile + store)', tiles);
const hot = [];
for (let r = 0; r < Number(o['hot-rounds']); r++) hot.push(...tiles);
out.hotMemory = await phase('hot (memory LRU hit)', hot);
service = make(); // fresh process state: empty LRU and single-flight, same store
handler = createHttpHandler(service);
out.hotStore = await phase('hot (store hit, cold LRU)', tiles);

const before = fake.total;
const t0 = Date.now();
const key = '/tiles/fake-1/hg1-conus/0/1999/7999';
const st = await Promise.all(Array.from({ length: Number(o.stampede) }, () => get(key)));
out.stampede = { ...summary(`stampede (${o.stampede} concurrent misses, one key)`, st, Date.now() - t0), compiles: fake.total - before,
  identicalBodies: st.every((r) => r.bytes.equals(st[0].bytes)), sharedWaits: service.flight.shared };
out.totals = { compiles: fake.total, distinctTilesRequested: N + 1 };

agent.destroy();
server.closeAllConnections();
await new Promise((r) => server.close(r));
if (dir) await fs.rm(dir, { recursive: true, force: true });

const rows = [out.cold, out.hotMemory, out.hotStore, out.stampede];
process.stderr.write(`\n${'phase'.padEnd(48)} ${'req'.padStart(6)} ${'p50 ms'.padStart(8)} ${'p95 ms'.padStart(8)} ${'p99 ms'.padStart(8)} ${'rps'.padStart(7)}\n`);
for (const r of rows) process.stderr.write(`${r.phase.padEnd(48)} ${String(r.requests).padStart(6)} ${String(r.p50).padStart(8)} ${String(r.p95).padStart(8)} ${String(r.p99).padStart(8)} ${String(r.rps).padStart(7)}\n`);
process.stderr.write(`stampede compiles: ${out.stampede.compiles} (must be 1); identical bodies: ${out.stampede.identicalBodies}\n\n`);
process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
const ok = out.stampede.compiles === 1 && out.stampede.identicalBodies && fake.total === N + 1 && rows.every((r) => r.non200 === 0);
process.exit(ok ? 0 : 1);
