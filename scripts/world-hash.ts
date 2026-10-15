/**
 * Proof that a runtime edit changed only the worlds it meant to.
 *
 * Prints a short sha256 of every first-party world's play document, built the way the site serves it
 * (lib/custom-game.ts renderWorldGame). That covers the host, the map and endoskeleton scripts the world asks for, the
 * runtime of its kind and the world itself. Each world is hashed twice: as a player gets it, and as a test drive does
 * (with drive.js, and a shootout's lenses). The worlds are the two runtime fixtures (a lap race and a kart race) and
 * every worlds/*.js, so every kind of world (race, survival, derby, kart, shootout) is covered.
 *
 * Run it before an edit and after it, then compare. Every line you did not mean to change must be identical:
 *   node --import ./scripts/ts-resolve.mjs scripts/world-hash.ts > <before.txt>
 *   (edit)
 *   node --import ./scripts/ts-resolve.mjs scripts/world-hash.ts > <after.txt>; diff <before.txt> <after.txt>
 * It reads files only: no server, no Chrome, no database.
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { renderWorldGame, worldMode } from '../lib/custom-game.ts';

const fixtures = ['lib/runtime/reference-world.js', 'lib/runtime/kart-world.js', ...readdirSync('worlds').filter((f) => f.endsWith('.js')).sort().map((f) => `worlds/${f}`)];
const hash = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 16);
for (const file of fixtures) {
  const world = readFileSync(file, 'utf8'), meta = { title: 'World hash', tagline: 'World hash' };
  console.log(`${file.padEnd(36)} ${worldMode(world).padEnd(9)} play ${hash(renderWorldGame(world, meta, 'world-hash'))}  drive ${hash(renderWorldGame(world, meta, 'world-hash', 1, true))}`);
}
