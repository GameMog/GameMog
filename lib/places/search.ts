/**
 * Hometown place search (Milestone 6 groundwork): every US incorporated place and census designated
 * place, from the offline index lib/places/us-places.tsv.gz (scripts/places/build-index.ts, US Census
 * Gazetteer, public domain). No map API and no network: the index loads once, about 32,000 places.
 *
 * A query is folded like a name (lib/places/normalize.ts) and matched four ways, best first:
 *   exact     the whole name or an alias ("okemah", "nyc", "saint louis", "st. louis")
 *   prefix    the start of the name or an alias ("okem" finds Okemah, OK)
 *   word      the start of a later word in the name ("francisco" finds San Francisco)
 *   fuzzy     a typo or two away from the start of a name ("okemha", "sant louis", "chicgo")
 * and, within a way, by population, so of the many Springfields the largest comes first, each
 * with its state. A trailing state ("springfield il", "austin texas") keeps the places in it.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { EXPAND, STATES, fold, words } from './normalize.ts';

/** What a picked place hands on: to the Create page, and later to the tile service. */
export type Place = {
  /** Stable: "us-" and the Census GEOID (state FIPS + place FIPS), e.g. "us-4054200" for Okemah, OK. */
  placeId: string;
  name: string;
  /** USPS code, e.g. "OK". */
  state: string;
  stateName: string;
  /** "city", "town", "village", "CDP", ... */
  kind: string;
  /** The Census internal point. */
  lat: number;
  lon: number;
  /** [west, south, east, north], degrees. APPROXIMATE: a square around the internal point sized from the land and water area (the Gazetteer has no outline); the tile service replaces it with the real extent. */
  bbox: [number, number, number, number];
  /** 2010 Census population; null for a place first listed after 2010. */
  pop: number | null;
  landKm2: number;
};

const KIND: Record<string, string> = {
  '21': 'borough', '25': 'city', '37': 'municipality', '43': 'town', '47': 'village', '53': 'city and borough',
  '55': 'comunidad', '57': 'CDP', '62': 'zona urbana', CN: 'corporation', UC: 'urban county',
  CG: 'consolidated government', UG: 'unified government', MG: 'metropolitan government', '00': 'consolidated city',
};

type Index = {
  geoid: string[]; name: string[]; state: string[]; lsad: string[];
  lat: Float64Array; lon: Float64Array; pop: Int32Array; aland: Float64Array; awater: Float64Array;
  /** log10 of the population used for ranking (the land area stands in when the population is unknown). */
  weight: Float64Array;
  /** Sorted search keys: the folded name and aliases (head) and every later word start of them (word). */
  keys: string[]; keyAt: Int32Array; keyHead: Uint8Array;
  /** The folded names and aliases, for the fuzzy pass, and their positions by first letter. */
  heads: string[]; headAt: Int32Array; byFirst: Map<string, number[]>;
};

let INDEX: Index | null = null;
const STATE_BY_NAME = new Map(Object.entries(STATES).map(([code, name]) => [fold(name), code]));

/** The index from its gzipped TSV, or the file in the repo. */
export function loadIndex(gz?: Buffer): Index {
  if (INDEX && !gz) return INDEX;
  const buf = gz ?? readFileSync(join(process.cwd(), 'lib', 'places', 'us-places.tsv.gz'));
  const lines = gunzipSync(buf).toString('utf8').split('\n').filter((l) => l && l[0] !== '#');
  const n = lines.length;
  const ix: Index = {
    geoid: new Array(n), name: new Array(n), state: new Array(n), lsad: new Array(n),
    lat: new Float64Array(n), lon: new Float64Array(n), pop: new Int32Array(n), aland: new Float64Array(n), awater: new Float64Array(n),
    weight: new Float64Array(n), keys: [], keyAt: new Int32Array(0), keyHead: new Uint8Array(0), heads: [], headAt: new Int32Array(0), byFirst: new Map(),
  };
  const keyList: [string, number, number][] = [];
  const headList: [string, number][] = [];
  for (let i = 0; i < n; i++) {
    const c = lines[i].split('\t');
    ix.geoid[i] = c[0]; ix.name[i] = c[1]; ix.state[i] = c[2]; ix.lsad[i] = c[3];
    ix.lat[i] = Number(c[4]); ix.lon[i] = Number(c[5]);
    ix.pop[i] = c[6] === '' ? -1 : Number(c[6]);
    ix.aland[i] = Number(c[7]); ix.awater[i] = Number(c[8]);
    // unknown population: about 30 people a square kilometre of land, capped, so a new CDP neither vanishes nor outranks a city
    const p = ix.pop[i] >= 0 ? ix.pop[i] : Math.min(20_000, (ix.aland[i] / 1e6) * 30);
    ix.weight[i] = Math.log10(p + 10);
    const names = [c[1], ...(c[9] ? c[9].split('|') : [])];
    // "O'Fallon" is found as "ofallon" and as "o fallon"
    for (const nm of names.slice()) if (/['\u2019]/.test(nm)) names.push(nm.replace(/['\u2019]/g, ' '));
    const seen = new Set<string>();
    for (const nm of names) {
      const f = fold(nm);
      if (!f || seen.has(f)) continue;
      seen.add(f);
      keyList.push([f, i, 1]);
      headList.push([f, i]);
      for (let at = f.indexOf(' '); at >= 0; at = f.indexOf(' ', at + 1)) keyList.push([f.slice(at + 1), i, 0]);
    }
  }
  keyList.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] - b[1]));
  ix.keys = keyList.map((k) => k[0]);
  ix.keyAt = Int32Array.from(keyList, (k) => k[1]);
  ix.keyHead = Uint8Array.from(keyList, (k) => k[2]);
  ix.heads = headList.map((h) => h[0]);
  ix.headAt = Int32Array.from(headList, (h) => h[1]);
  ix.heads.forEach((h, k) => { const l = ix.byFirst.get(h[0]); if (l) l.push(k); else ix.byFirst.set(h[0], [k]); });
  if (!gz) INDEX = ix;
  return ix;
}

/** The first key at or after `s`. */
function lowerBound(keys: string[], s: string) {
  let lo = 0, hi = keys.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (keys[mid] < s) lo = mid + 1; else hi = mid; }
  return lo;
}

/**
 * The fewest edits (insert, delete, substitute, swap two neighbours) that turn `q` into some start of
 * `key`, or max + 1 when it is more than `max`.
 */
export function prefixDistance(q: string, key: string, max: number): number {
  const m = q.length, n = Math.min(key.length, m + max);
  let prev2 = new Int32Array(n + 1), prev = new Int32Array(n + 1), cur = new Int32Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    let rowMin = cur[0];
    for (let j = 1; j <= n; j++) {
      const cost = q.charCodeAt(i - 1) === key.charCodeAt(j - 1) ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && q.charCodeAt(i - 1) === key.charCodeAt(j - 2) && q.charCodeAt(i - 2) === key.charCodeAt(j - 1)) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    [prev2, prev, cur] = [prev, cur, prev2];
  }
  let best = max + 1;
  for (let j = 0; j <= n; j++) if (prev[j] < best) best = prev[j];
  return best;
}

const TIER = { exact: 6, prefix: 4, word: 2, fuzzy: 1.5 } as const;
export type Match = keyof typeof TIER;
export type Hit = Place & { match: Match; score: number };

function toPlace(ix: Index, i: number): Place {
  const lat = ix.lat[i], lon = ix.lon[i];
  // half the side of a square of the place's area, times 1.5 (a town is rarely square), at least a kilometre
  const half = Math.max(1000, 0.75 * Math.sqrt(ix.aland[i] + ix.awater[i]));
  const dLat = half / 111_320, dLon = half / (111_320 * Math.max(0.05, Math.cos((lat * Math.PI) / 180)));
  const r = (v: number) => Math.round(v * 1e5) / 1e5;
  return {
    placeId: `us-${ix.geoid[i]}`, name: ix.name[i], state: ix.state[i], stateName: STATES[ix.state[i]] ?? ix.state[i],
    kind: KIND[ix.lsad[i]] ?? 'place', lat, lon, bbox: [r(lon - dLon), r(lat - dLat), r(lon + dLon), r(lat + dLat)],
    pop: ix.pop[i] >= 0 ? ix.pop[i] : null, landKm2: Math.round(ix.aland[i] / 1e4) / 100,
  };
}

/** A trailing state in the words ("... il", "... new york"): the state and the words before it. */
function splitState(ws: string[]): { state: string | null; rest: string[] } {
  if (ws.length < 2) return { state: null, rest: ws };
  for (let take = Math.min(3, ws.length - 1); take >= 1; take--) {
    const tail = ws.slice(-take).join(' ');
    const code = take === 1 && tail.length === 2 && STATES[tail.toUpperCase()] ? tail.toUpperCase() : STATE_BY_NAME.get(tail);
    if (code) return { state: code, rest: ws.slice(0, -take) };
  }
  return { state: null, rest: ws };
}

/** The places for a query, best first. Under a millisecond or two for most queries once the index is loaded. */
export function searchPlaces(query: string, opts: { limit?: number; index?: Index } = {}): Hit[] {
  const limit = Math.max(1, Math.min(25, opts.limit ?? 8));
  const ix = opts.index ?? loadIndex();
  const raw = words(query).slice(0, 8);
  if (!raw.length) return [];
  const { state, rest } = splitState(raw);
  const withState = state ? run(ix, rest, state, limit, true) : [];
  if (withState.length >= limit) return withState;
  // with the state found, the other places only fill the list: no typo search for them
  const all = run(ix, raw, null, limit, !withState.length);
  const have = new Set(withState.map((h) => h.placeId));
  return [...withState, ...all.filter((h) => !have.has(h.placeId))].slice(0, limit);
}

function run(ix: Index, raw: string[], state: string | null, limit: number, fuzzy: boolean): Hit[] {
  const full = raw.map((w) => EXPAND[w] ?? w).join(' ');
  // the last word may be unfinished: "st" is "saint" and also the start of "stamford"
  const literal = raw.join(' ');
  const best = new Map<number, { match: Match; score: number }>();
  const offer = (i: number, match: Match, extra = 0) => {
    if (state && ix.state[i] !== state) return;
    const score = TIER[match] + extra + 0.4 * ix.weight[i];
    const had = best.get(i);
    if (!had || had.score < score) best.set(i, { match, score });
  };
  for (const q of full === literal ? [full] : [full, literal]) {
    for (let k = lowerBound(ix.keys, q); k < ix.keys.length && ix.keys[k].startsWith(q); k++) {
      const i = ix.keyAt[k];
      if (!ix.keyHead[k]) offer(i, 'word');
      else offer(i, ix.keys[k] === q ? 'exact' : 'prefix');
    }
  }
  // typos: up to one in 5 to 7 letters, two in 8 or more, one fewer when the name matches already fill some rows.
  // Only names starting with the query's first or second letter are tried (a swapped or doubled first letter is
  // caught; a wrong first letter is not), which keeps the pass to a few milliseconds.
  const max = fuzzy ? (full.length >= 8 ? 2 : full.length >= 5 ? 1 : 0) - (best.size ? 1 : 0) : 0;
  if (best.size < limit && max > 0) {
    const tried = new Set<string>();
    for (const first of [full[0], full[1]]) {
      if (!first || first === ' ' || tried.has(first)) continue;
      tried.add(first);
      for (const h of ix.byFirst.get(first) ?? []) {
        const i = ix.headAt[h];
        if (best.has(i) || (state && ix.state[i] !== state)) continue;
        const d = prefixDistance(full, ix.heads[h], max);
        if (d <= max) offer(i, 'fuzzy', -0.75 * d);
      }
    }
  }
  return [...best.entries()]
    .sort((a, b) => b[1].score - a[1].score || a[0] - b[0])
    .slice(0, limit)
    .map(([i, m]) => ({ ...toPlace(ix, i), match: m.match, score: Math.round(m.score * 1000) / 1000 }));
}
