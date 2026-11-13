/**
 * Builds the Hometown place index, lib/places/us-places.tsv.gz, from the US Census Bureau's
 * Gazetteer place files (public domain, U.S. Government work).
 *
 *   node --import ./scripts/ts-resolve.mjs scripts/places/build-index.ts <2025_Gaz_place_national.txt> <Gaz_places_national.txt>
 *
 * Sources (download by hand into the git-ignored scripts/.scratch/gazetteer/ and unzip):
 *   https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2025_Gazetteer/2025_Gaz_place_national.zip
 *     every incorporated place and census designated place (CDP): name, kind, land and water area, internal point
 *   https://www2.census.gov/geo/docs/maps-data/data/gazetteer/Gaz_places_national.zip
 *     the 2010 file, the last Gazetteer to carry population (POP10), joined on GEOID; a place
 *     new since 2010 has no population and ranks on its land area instead
 *
 * Deterministic: rows sorted by GEOID, fixed number formats, gzip level 9 with a zero mtime and the
 * header's OS byte fixed at 255 ("unknown": zlib writes the build machine's), so the same inputs give
 * the same TSV everywhere. The compressed bytes can still differ with the zlib version, so the sha256
 * of the uncompressed TSV is written beside it, lib/places/us-places.tsv.sha256, and npm run check
 * holds the index to it. The index carries no county: the Gazetteer place
 * files do not have one (the Census place-by-county relationship file would add it).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { STATES } from '../../lib/places/normalize.ts';

const [, , file2025, file2010] = process.argv;
if (!file2025 || !file2010) {
  console.error('usage: build-index.ts <2025_Gaz_place_national.txt> <Gaz_places_national.txt (2010)>');
  process.exit(2);
}
const OUT = new URL('../../lib/places/us-places.tsv.gz', import.meta.url).pathname;
const OUT_SHA = new URL('../../lib/places/us-places.tsv.sha256', import.meta.url).pathname;

/** The kind word(s) the Gazetteer appends to a name, by LSAD code. */
const SUFFIX: Record<string, RegExp> = {
  '21': / borough$/, '25': / city$/, '37': / municipality$/, '43': / town$/, '47': / village$/,
  '53': / city and borough$/, '55': / comunidad$/, '57': / CDP$/, '62': / zona urbana$/,
  CN: / corporation$/, UC: / urban county$/, CG: / consolidated government$/, UG: / unified government$/,
  MG: / metropolitan government$/,
  // '00': a consolidated city's balance; its words vary, so every kind is tried
  '00': / (?:city|unified government|consolidated government|metropolitan government|metro government)$/,
};
/** Names people say that the Census does not, by GEOID. */
const EXTRA: Record<string, string[]> = {
  '3651000': ['New York City', 'NYC'],
  '1150000': ['Washington DC', 'Washington D.C.', 'DC'],
};
/** A name shown instead of the Census one (which stays an alias), by GEOID. */
const SHOWN: Record<string, string> = { '1571550': 'Honolulu' };

// the 2025 file is UTF-8; the 2010 file is Latin-1 (only its GEOID and POP10 columns are read)
function rows(path: string, sep: string, enc: BufferEncoding) {
  const text = readFileSync(path, enc).split(/\r?\n/).filter((l) => l.trim());
  const head = text[0].split(sep).map((h) => h.trim());
  return text.slice(1).map((l) => {
    const c = l.split(sep).map((v) => v.trim());
    return Object.fromEntries(head.map((h, i) => [h, c[i] ?? ''])) as Record<string, string>;
  });
}

const pop10 = new Map<string, number>();
for (const r of rows(file2010, '\t', 'latin1')) pop10.set(r.GEOID, Number(r.POP10));

type Row = { geoid: string; name: string; state: string; lsad: string; lat: string; lon: string; pop: string; aland: string; awater: string; aliases: string[] };
const out: Row[] = [];
const skipped: string[] = [];
for (const r of rows(file2025, '|', 'utf8')) {
  if (!STATES[r.USPS]) { skipped.push(`${r.USPS} ${r.NAME}`); continue; }
  let name = r.NAME.replace(/ \(balance\)$/, '');
  const suf = SUFFIX[r.LSAD];
  if (suf) name = name.replace(suf, '');
  const aliases = new Set<string>(EXTRA[r.GEOID] ?? []);
  // "San Buenaventura (Ventura)": both the official and the everyday name
  const paren = /^(.*?) \((.+)\)$/.exec(name);
  if (paren) { aliases.add(paren[2]); aliases.add(paren[1]); }
  // "Nashville-Davidson", "Louisville/Jefferson County", "Athens-Clarke County": the city's own name
  // shown by that name, the official one kept as an alias
  if (['00', 'CG', 'UG', 'MG', 'UC'].includes(r.LSAD)) {
    const first = name.split(/[-/,]/)[0].trim();
    if (first && first !== name && !/ County$/.test(first)) { aliases.add(name); name = first; }
  }
  if (SHOWN[r.GEOID]) { aliases.add(name); name = SHOWN[r.GEOID]; }
  aliases.delete(name);
  const p = pop10.get(r.GEOID);
  out.push({
    geoid: r.GEOID, name, state: r.USPS, lsad: r.LSAD,
    lat: Number(r.INTPTLAT).toFixed(5), lon: Number(r.INTPTLONG).toFixed(5),
    pop: p !== undefined && Number.isFinite(p) ? String(p) : '',
    aland: String(Math.round(Number(r.ALAND))), awater: String(Math.round(Number(r.AWATER))),
    aliases: [...aliases].sort(),
  });
}
out.sort((a, b) => (a.geoid < b.geoid ? -1 : a.geoid > b.geoid ? 1 : 0));

const clean = (s: string) => s.replace(/[\t\n|]/g, ' ');
const header = [
  '# GameMog Hometown place index v1. Source: US Census Bureau Gazetteer place files (public domain):',
  '# 2025_Gaz_place_national (names, kinds, areas, internal points) and the 2010 Gaz_places_national (POP10).',
  '# Built by scripts/places/build-index.ts. Columns: geoid name state lsad lat lon pop2010 aland_m2 awater_m2 aliases(|)',
].join('\n');
const body = out.map((r) => [r.geoid, clean(r.name), r.state, r.lsad, r.lat, r.lon, r.pop, r.aland, r.awater, r.aliases.map(clean).join('|')].join('\t')).join('\n');
const tsv = `${header}\n${body}\n`;
const gz = gzipSync(Buffer.from(tsv, 'utf8'), { level: 9 });
// RFC 1952 header: bytes 4-7 the mtime (zero already), byte 9 the OS; neither is covered by the CRC
gz.writeUInt32LE(0, 4);
gz[9] = 0xff;
writeFileSync(OUT, gz);
const tsvSha = createHash('sha256').update(tsv, 'utf8').digest('hex');
writeFileSync(OUT_SHA, `${tsvSha}  us-places.tsv\n`);
const withPop = out.filter((r) => r.pop).length;
console.log(`${out.length} places (${withPop} with 2010 population), ${skipped.length} skipped (${skipped.slice(0, 3).join(', ')})`);
console.log(`${OUT}: ${gz.length} bytes gzip (${tsv.length} raw), sha256 ${createHash('sha256').update(gz).digest('hex')} gzip, ${tsvSha} TSV`);
