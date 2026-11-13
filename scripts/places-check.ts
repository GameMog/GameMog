/**
 * Hometown place search: the index and the search behind the Create page's town box
 * (lib/places/search.ts, lib/places/us-places.tsv.gz). Part of npm run check; on its own:
 *
 *   node --import ./scripts/ts-resolve.mjs scripts/places-check.ts
 *
 * Offline and fast: it reads the checked-in index only. Latency is measured on this machine
 * (the median and the slowest of a fixed set of queries, after the index has loaded) and printed.
 */
import { readFileSync, statSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fold, words } from '../lib/places/normalize.ts';
import { loadIndex, prefixDistance, searchPlaces, type Hit } from '../lib/places/search.ts';

type Ok = (name: string, cond: boolean, detail?: string) => void;
const INDEX = new URL('../lib/places/us-places.tsv.gz', import.meta.url).pathname;

const label = (h: Hit) => `${h.name}, ${h.state}`;
const top = (q: string, n = 1) => searchPlaces(q, { limit: Math.max(n, 8) }).slice(0, n).map(label);
const first = (q: string) => top(q)[0] ?? '(none)';

export function runPlacesChecks(ok: Ok) {
  console.log('\nhometown place search: the index');
  const bytes = statSync(INDEX).size;
  const text = gunzipSync(readFileSync(INDEX)).toString('utf8');
  const rows = text.split('\n').filter((l) => l && l[0] !== '#');
  ok('the index is small: under 3 MB gzipped', bytes < 3 * 1024 * 1024, `${(bytes / 1024).toFixed(0)} KB, ${rows.length} places`);
  ok('it names its source, the US Census Gazetteer, and the script that builds it',
    /US Census Bureau Gazetteer/.test(text.slice(0, 400)) && /scripts\/places\/build-index\.ts/.test(text.slice(0, 400)));
  ok('every incorporated place and CDP: over 32,000 rows, every one with a state, a point and an area',
    rows.length > 32_000 && rows.every((r) => { const c = r.split('\t'); return c.length === 10 && /^\d{7}$/.test(c[0]) && /^[A-Z]{2}$/.test(c[2]) && Number.isFinite(+c[4]) && Number.isFinite(+c[5]) && +c[7] >= 0; }));
  ok('GEOIDs are unique and sorted (a deterministic build)', rows.every((r, i) => i === 0 || r.split('\t')[0] > rows[i - 1].split('\t')[0]));
  let t = performance.now();
  const ix = loadIndex();
  const loadMs = performance.now() - t;
  ok('it loads once, in under 1.5 s', loadMs < 1500, `${loadMs.toFixed(0)} ms, ${ix.keys.length} keys`);

  console.log('\nhometown place search: folding');
  ok('accents, case and punctuation fold away', fold('Española') === 'espanola' && fold('St. Louis') === 'saint louis' && fold("Coeur d'Alene") === 'coeur dalene');
  ok('abbreviations are spelled out, whole words only', fold('Ft Worth') === 'fort worth' && fold('Mt. Vernon') === 'mount vernon' && fold('Stamford') === 'stamford' && words('St.')[0] === 'st');
  ok('typo distance counts edits to a start of the name', prefixDistance('okemha', 'okemah', 2) === 1 && prefixDistance('chicgo', 'chicago', 1) === 1 && prefixDistance('okem', 'okemah', 0) === 0 && prefixDistance('zzzz', 'okemah', 1) === 2);

  console.log('\nhometown place search: what people type');
  ok('"okem" finds Okemah, OK', top('okem', 3).includes('Okemah, OK'), top('okem', 3).join(' | '));
  ok('"okemah" is Okemah, OK first', first('okemah') === 'Okemah, OK');
  ok('"st louis", "st. louis" and "saint louis" all put St. Louis, MO first', ['st louis', 'st. louis', 'saint louis', 'St Louis'].every((q) => first(q) === 'St. Louis, MO'));
  ok('"st" is still the start of Stockton and Stamford', top('st', 8).some((l) => l.startsWith('Stockton')));
  const spring = searchPlaces('springfield', { limit: 8 });
  ok('ambiguous names: every Springfield exact, the largest first, each with its state',
    spring.length === 8 && spring.every((h) => h.name === 'Springfield' && h.match === 'exact' && /^[A-Z]{2}$/.test(h.state))
      && first('springfield') === 'Springfield, MO' && spring.every((h, i) => i === 0 || (h.pop ?? 0) <= (spring[i - 1].pop ?? 0)), spring.map(label).join(' | '));
  ok('a trailing state picks the place in it: "springfield il", "austin texas", "portland maine"',
    first('springfield il') === 'Springfield, IL' && first('austin texas') === 'Austin, TX' && first('portland maine') === 'Portland, ME' && first('portland') === 'Portland, OR');
  ok('typos are forgiven: "okemha", "chicgo", "phildelphia", "albequerque", "sant louis"',
    first('okemha') === 'Okemah, OK' && first('chicgo') === 'Chicago, IL' && first('phildelphia') === 'Philadelphia, PA' && first('albequerque') === 'Albuquerque, NM' && first('sant louis') === 'St. Louis, MO',
    ['okemha', 'chicgo', 'phildelphia', 'albequerque', 'sant louis'].map(first).join(' | '));
  ok('everyday names: NYC, Washington DC, Nashville, Louisville, Honolulu, Ventura, O Fallon',
    first('nyc') === 'New York, NY' && first('washington dc') === 'Washington, DC' && first('nashville') === 'Nashville, TN'
      && first('louisville') === 'Louisville, KY' && first('honolulu') === 'Honolulu, HI' && first('ventura') === 'San Buenaventura (Ventura), CA' && first('o fallon') === "O'Fallon, MO");
  ok('a later word finds a name: "francisco" lists San Francisco, CA', top('francisco', 3).includes('San Francisco, CA'));
  ok('no ZIP codes, and nonsense finds nothing', searchPlaces('74859').length === 0 && searchPlaces('xyzzyq').length === 0 && searchPlaces('   ').length === 0);
  const ok1 = searchPlaces('okemah')[0];
  ok('a result is {placeId, name, state, bbox, lat, lon}: Okemah is us-4054200, its bbox around its point',
    ok1?.placeId === 'us-4054200' && ok1.state === 'OK' && ok1.bbox.length === 4 && ok1.bbox[0] < ok1.lon && ok1.lon < ok1.bbox[2] && ok1.bbox[1] < ok1.lat && ok1.lat < ok1.bbox[3]
      && Math.abs(ok1.lat - 35.43) < 0.01 && Math.abs(ok1.lon + 96.30) < 0.01, JSON.stringify(ok1 && { placeId: ok1.placeId, bbox: ok1.bbox }));

  console.log('\nhometown place search: speed');
  const queries = ['s', 'sa', 'san', 'okem', 'okemha', 'st louis', 'sant louis', 'springfield', 'springfield il', 'new york', 'chicgo', 'phildelphia',
    'albequerque', 'los angles', 'washington dc', 'francisco', 'portland maine', 'winston salem', 'xyzzyq', 'mt vernon', 'ft worth', 'pitsburgh',
    'w', 'e', 'new', 'north', 'lake', 'saint', 'port', 'fort', 'mount pleasant', 'greenville sc', 'pleasant valley', 'kansas city', 'east', 'west palm'];
  const times: number[] = [];
  for (let round = 0; round < 3; round++) for (const q of queries) { t = performance.now(); searchPlaces(q); times.push(performance.now() - t); }
  times.sort((a, b) => a - b);
  const p50 = times[Math.floor(times.length / 2)], p95 = times[Math.floor(times.length * 0.95)], max = times[times.length - 1];
  ok('a query takes under 20 ms on the server (95th percentile)', p95 < 20, `${times.length} queries: median ${p50.toFixed(2)} ms, p95 ${p95.toFixed(2)} ms, slowest ${max.toFixed(2)} ms`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let failures = 0;
  runPlacesChecks((name, cond, detail = '') => { console.log(`${cond ? '  ok  ' : '  FAIL'}  ${name}${detail ? `: ${detail}` : ''}`); if (!cond) failures++; });
  console.log(`\n${failures ? `${failures} FAILED` : 'all place checks passed'}\n`);
  process.exit(failures ? 1 : 0);
}
