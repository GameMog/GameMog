/**
 * Copy Mog City's story pack files into GameMog (3 Nov 2026), and remake what is made from them.
 *   node scripts/episode-copy.mjs [<Mog City checkout>]     (default: MOGCITY_DIR, ./MogCity or ../GameMog/MogCity)
 *
 * Reads, never writes, the Mog City checkout: wagmi/story/schema.js (copied below lib/episode/schema.js's header, its
 * SHA-256 then pinned in lib/episode.ts SCHEMA_SHA), assets/story/default.json and limits.json (lib/episode/). Then
 * writes the first-party world from the default pack (worlds/mog-city.js, and deploy/migrations/mog-city.js with its
 * meta.json's codeHash). Run `npm run check` after: it compares every copy with its source.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const dir = [process.argv[2], process.env.MOGCITY_DIR, 'MogCity', '../GameMog/MogCity'].find((d) => d && existsSync(join(d, 'wagmi', 'story', 'schema.js')));
if (!dir) { console.error('no Mog City checkout found: pass its path'); process.exit(1); }
const sha = (s) => createHash('sha256').update(s).digest('hex');
const MARK = '// ---- copy below ----\n';

const schema = readFileSync(join(dir, 'wagmi', 'story', 'schema.js'), 'utf8');
const copy = readFileSync('lib/episode/schema.js', 'utf8');
writeFileSync('lib/episode/schema.js', copy.slice(0, copy.indexOf(MARK) + MARK.length) + schema);
const lib = readFileSync('lib/episode.ts', 'utf8');
writeFileSync('lib/episode.ts', lib.replace(/export const SCHEMA_SHA = '[0-9a-f]{64}';/, `export const SCHEMA_SHA = '${sha(schema)}';`));
for (const f of ['default.json', 'limits.json']) writeFileSync(join('lib', 'episode', f), readFileSync(join(dir, 'assets', 'story', f)));

// the first-party world: the default pack as its module (lib/episode.ts episodeModule: compact JSON)
const pack = JSON.parse(readFileSync('lib/episode/default.json', 'utf8'));
const code = `GameMog.world({ episode: ${JSON.stringify(pack)} });\n`;
writeFileSync('worlds/mog-city.js', code);
writeFileSync('deploy/migrations/mog-city.js', code);
const metaPath = 'deploy/migrations/mog-city.meta.json', meta = JSON.parse(readFileSync(metaPath, 'utf8'));
meta.meta.test = { ...meta.meta.test, codeHash: sha(code).slice(0, 16) };
writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n');
console.log(`copied from ${dir}: schema ${sha(schema).slice(0, 12)}, default pack ${Math.round(code.length / 1000)} KB (${Object.keys(pack.lines).length} lines, ${Object.keys(pack.copy).length} copy)`);
