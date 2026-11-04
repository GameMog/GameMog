/**
 * Make a Mog City episode's key art from its title (3 Nov 2026; lib/episode/art.ts), for the first-party row:
 *   node --import ./scripts/ts-resolve.mjs scripts/episode-art.ts "Unfinished Business" deploy/migrations/mog-city
 * writes <prefix>-wide.jpg (1280x720), <prefix>-icon.jpg (512x512) and <prefix>-cover.jpg (the plain plate).
 */
import { writeFileSync } from 'node:fs';
import { episodeArt, plainCover } from '../lib/episode/art.ts';

const [title, prefix] = process.argv.slice(2);
if (!title || !prefix) { console.error('usage: scripts/episode-art.ts "<episode title>" <prefix>'); process.exit(1); }
const t = Date.now(), art = await episodeArt(title, ['wide', 'icon']);
writeFileSync(`${prefix}-wide.jpg`, art.wide!); writeFileSync(`${prefix}-icon.jpg`, art.icon!); writeFileSync(`${prefix}-cover.jpg`, plainCover());
console.log(`${art.title}${art.full ? '' : ' (characters dropped)'}: ${JSON.stringify(art.fits)} in ${Date.now() - t} ms`);
// (next/og leaves a handle open after its render: end the script ourselves)
process.exit(0);
