/**
 * The pre-warm list (lib/hometown-tiles/prewarm-list.ts): the top N US places by 2010 population plus the named demo
 * towns, as the compiler's gazetteer (MogCity tools/hometown/places.json format) and a plain list of ids.
 *
 *   node --import ./scripts/ts-resolve.mjs scripts/hometown-prewarm-list.ts --n 100 --out .scratch/prewarm-100.json
 *
 * Then on the Mac (MogCity checkout, the pinned venv): tools/hometown/prewarm.py --places <that json> --store <dir>,
 * and scripts/hometown-upload.ts to put the store on the server.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { prewarmList, NAMED } from '../lib/hometown-tiles/prewarm-list.ts';

const { values: o } = parseArgs({ options: { n: { type: 'string', default: '100' }, out: { type: 'string' }, named: { type: 'string' } } });
const n = Number(o.n);
if (!Number.isInteger(n) || n < 0 || n > 5000) throw new Error('--n 0..5000');
const named = o.named != null ? o.named.split(',').filter(Boolean) : NAMED;
const l = prewarmList(n, named);
const doc = { format: 'hometown-places', note: `GameMog pre-warm list: the ${n} largest US places by 2010 population plus ${named.length} named towns (${l.skippedNoPop} places with no 2010 population left out)`, order: l.order, places: l.places };
const text = `${JSON.stringify(doc, null, 1)}\n`;
if (o.out) {
  mkdirSync(path.dirname(path.resolve(o.out)), { recursive: true });
  writeFileSync(o.out, text);
  writeFileSync(o.out.replace(/\.json$/, '') + '.txt', l.order.join('\n') + '\n');
  console.log(`${l.order.length} places -> ${o.out} (+ .txt); smallest on the list: ${Math.min(...l.order.map((id) => l.places[id].pop2010 ?? Infinity))} people`);
} else process.stdout.write(text);
