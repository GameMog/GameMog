#!/usr/bin/env node
// node server/tiles/bin/prewarm.mjs --places list.txt --version v [--concurrency 2] [--state file] [config options]
// --concurrency = places compiled at once; --max-compiles = tile compiles at once across them (default 4).
// Ctrl-C stops launching new places and lets the running ones finish; run the same command again to resume.
import path from 'node:path';
import fs from 'node:fs/promises';
import { parse, serviceFrom, TILES_DIR } from '../src/config.mjs';
import { prewarm, parsePlaceList } from '../src/prewarm.mjs';

const o = parse(process.argv.slice(2), { places: { type: 'string' }, version: { type: 'string' }, concurrency: { type: 'string', default: '2' }, state: { type: 'string' } });
if (!o.places || !o.version) { process.stderr.write('usage: prewarm --places list.txt --version v [--concurrency 2] [--state file]\n'); process.exit(2); }
if (o.compiler === 'fake') o['fake-version'] = o.version;
const service = await serviceFrom(o);
const placeIds = parsePlaceList(await fs.readFile(o.places, 'utf8'));
const stateFile = o.state || path.join(o['store-dir'] || path.join(TILES_DIR, '.cache'), 'prewarm', `${o.version}.jsonl`);
const ac = new AbortController();
process.once('SIGINT', () => { process.stderr.write('prewarm: stopping after the places in flight\n'); ac.abort(); });
const r = await prewarm({ service, placeIds, version: o.version, concurrency: Number(o.concurrency), stateFile, signal: ac.signal,
  onEvent: (e) => process.stderr.write(`${JSON.stringify(e)}\n`) });
process.stdout.write(`${JSON.stringify({ ...r, stateFile, compiles: service.stats.compiles }, null, 2)}\n`);
process.exit(r.failed.length || r.interrupted ? 1 : 0);
