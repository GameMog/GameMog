/**
 * Writes lib/hometown-build/fixtures/stage1-py.json: THE play box (fetch.py's cap) and stage 1 (assemble.py) of 1,000
 * places, computed by the real compiler, for `npm run check` to compare the TS ports against offline (G1, G4).
 *   HOMETOWN_PYTHON=<venv>/bin/python HOMETOWN_COMPILER=<MogCity>/tools/hometown \
 *     node --import ./scripts/ts-resolve.mjs scripts/hometown-build-fixture.ts
 * Re-run it when the compiler's grid or cap changes (a new build), never by hand-editing the fixture.
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { loadIndex, toPlace } from '../lib/places/search.ts';

export const FIXTURE = 'lib/hometown-build/fixtures/stage1-py.json';

/** 1,000 places: the 600 largest, 100 outside the lower 48 (every domain), 300 spread over the rest. Deterministic. */
export function samplePlaces() {
  const ix = loadIndex();
  const rows = [...Array(ix.geoid.length).keys()];
  const byPop = [...rows].sort((a, b) => ix.pop[b] - ix.pop[a] || (ix.geoid[a] < ix.geoid[b] ? -1 : 1));
  const pick = new Set<number>(byPop.slice(0, 600));
  const outer = rows.filter((i) => /^(02|15|72|78|66|69|60)/.test(ix.geoid[i]));
  for (let k = 0; k < outer.length && pick.size < 700; k += Math.max(1, Math.floor(outer.length / 100))) pick.add(outer[k]);
  for (let k = 0; pick.size < 1000; k += 97) pick.add(rows[(k * 31) % rows.length]);
  return [...pick].sort((a, b) => a - b).map((i) => { const p = toPlace(ix, i); return { placeId: p.placeId, geoid: p.geoid, lat: p.lat, lon: p.lon, bbox: p.bbox }; });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const py = process.env.HOMETOWN_PYTHON, dir = process.env.HOMETOWN_COMPILER;
  if (!py || !dir) { console.error('HOMETOWN_PYTHON and HOMETOWN_COMPILER (tools/hometown) are required'); process.exit(2); }
  const r = spawnSync(py, ['scripts/hometown-build-pycheck.py', dir], { input: JSON.stringify(samplePlaces()), encoding: 'utf8', maxBuffer: 64 << 20, env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '' } as unknown as NodeJS.ProcessEnv });
  if (r.status !== 0) { console.error(r.stderr); process.exit(1); }
  writeFileSync(FIXTURE, r.stdout + '\n');
  console.log(`${FIXTURE}: ${JSON.parse(r.stdout).places.length} places`);
}
