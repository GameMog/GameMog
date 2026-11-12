/**
 * SF 2040, GameMog's second first-party story world (11 Nov): a horse-riding story in San Francisco forty-one days after
 * an impact, six missions on Mog City's engine, published PUBLIC at /g/sf2040 by deploy/migrate.mjs (2026-11-11-sf2040),
 * which reads the record this script writes.
 *
 *   node --import ./scripts/ts-resolve.mjs scripts/storykit-sf2040.ts --export <a Mog City tree> [--next <n> | --art <wide> <square or portrait> <headshot | -> [--suffix -2]]
 *
 * Unlike Pickup Time (scripts/storykit-showcase.ts) SF 2040 was written for Mog City directly, and Mog City ships it as
 * one of its own worlds (packs/sf2040.json, mogcity bcd35463: a runner world already, storykit: 1, city 'sf'), so there
 * is no story-pack form to gate and nothing here is rebuilt from one. Every file it names is one of Mog City's own
 * (assets/characters/sf2040/<id>.glb, the four bodies, 11.7 MB; assets/voice/sf2040/<line hash>-<voice key>.m4a, the
 * 151 clips, 4.2 MB), which Mog City loads from its own origin whatever the world's origin (wagmi/storyrun/pack.js
 * W.asset), so this site stores only the sealed world:
 *   world  deploy/migrations/sf2040/world.json: Mog City's pack, byte for byte as JSON.stringify writes it (the migration
 *          seals it under its SHA-256 in the Story Kit store, as every published story world plays: /storykit/f/<sha>.json)
 * --export checks that every file the world names is in the Mog City tree it reads (the one that is live).
 * --art makes the art the migration writes from a plain wide frame, a square (or portrait) frame and the hero's headshot on light
 * blue: cover-plain.jpg (the plain 1280x720 frame: the dare card, ?plain), cover-wide.jpg and cover-square.jpg (titled
 * in Mog City's lockup, lib/story-art.ts) and headshot.jpg (512 px, already on light blue: Jump in).
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const SF_ID = 'sf2040';
/** The game's id (fixed, as every first-party world's is). */
export const SF_GAME = '228beefa-0eb8-47ec-81de-d0ee72483d0b';
export const SF_RECORD = `deploy/migrations/${SF_ID}-story.json`;
export const SF_DIR = `deploy/migrations/${SF_ID}`;
const BLURB = 'Forty-one days after Erebus came down on the Presidio and the Bio-Preserve\'s walls fell, Cal Mercer, an ex-park ranger, rides his horse Ranger into a San Francisco gone wild to find his wife Nina and their daughter June. Scavenge Market Street, slip past what sleeps on it, round up a wild herd, get past the Preserve\'s security mech and stand up to the Iron Saints. Six missions, from the Embarcadero to the Presidio.';
// (the page's own lines for a ridden world: Mog City's horse, wagmi/horse, and the world's own help lines)
const CONTROLS = 'In the saddle: W trots, hold Shift to gallop, Q slows to a walk, A and D turn, Space jumps, the mouse looks. J swings the bat at whoever is beside you and K kicks out behind. F gets down or back up; on foot J hits and Q counters. M opens the map, Esc pauses.';
const HOW = 'A story in three acts across San Francisco after the impact. Follow the objective and the yellow line on your map to each mission: rides, scavenging, a herd, creatures to sneak past or fight, a mech, and calls on the radio move the story on, with cutscenes between them. Between missions the city is yours to roam. Finish all six to bring the Mercers home.';

const sha = (b: Uint8Array | string) => createHash('sha256').update(b).digest('hex');
const CLIP_URL = /^assets\/voice\/sf2040\/([0-9a-f]{8}-[0-9a-f]{8})\.m4a$/;

/** The record and the world from a Mog City tree's own SF 2040 world (packs/sf2040.json). */
export function sfWorld(mc: string) {
  const pack = JSON.parse(readFileSync(join(mc, 'packs', `${SF_ID}.json`), 'utf8'));
  if (pack.storykit !== 1 || pack.id !== SF_ID || pack.city !== 'sf') throw new Error(`${mc}/packs/${SF_ID}.json is not SF 2040's runner world`);
  // every file it names: one of Mog City's own, in this tree
  const named: string[] = [];
  for (const [name, c] of Object.entries(pack.cast as Record<string, { glb?: string }>)) {
    if (c.glb == null) continue;
    if (!/^assets\/characters\/sf2040\/[a-z][a-z0-9-]{0,39}\.glb$/.test(c.glb)) throw new Error(`${name}: an unexpected body ${c.glb}`);
    named.push(c.glb);
  }
  const clips = pack.voice?.clips as Record<string, { url: string }>;
  for (const [k, c] of Object.entries(clips)) {
    const m = CLIP_URL.exec(c.url);
    if (!m || m[1] !== k) throw new Error(`voice clip ${k}: ${c.url} is not one of Mog City's SF 2040 clips`);
    named.push(c.url);
  }
  for (const l of pack.voice.lines) if (!l.rec && !clips[l.clip]) throw new Error(`line ${l.id} has no clip`);
  let glbBytes = 0, voiceBytes = 0;
  for (const f of named) {
    const p = join(mc, f);
    if (!existsSync(p)) throw new Error(`${p}: not in this Mog City tree`);
    if (f.endsWith('.glb')) glbBytes += statSync(p).size; else voiceBytes += statSync(p).size;
  }
  if (/\/storykit\/f\//.test(JSON.stringify(pack))) throw new Error('the world names a file in this site\'s store');
  const worldBytes = JSON.stringify(pack);

  const people = Object.entries(pack.cast as Record<string, { color: string; voiceOnly?: boolean }>).filter(([, c]) => !c.voiceOnly);
  const missions = (pack.missions as unknown[]).length;
  const meta = {
    title: pack.title, tagline: pack.tagline, blurb: BLURB, genre: 'Story world',
    cast: people.map(([name, c]) => ({ name, color: c.color, role: name === pack.hero ? 'player' : 'rival' })),
    palette: { sky: '#2A1714', ground: '#2B2420', accent: '#E8B04A' },
    mode: 'storykit', scoring: 'none', runtime: 1, options: { hazards: 'same', music: null, open: true, coins: false },
    storykit: {
      city: 'sf', pack: '', packId: SF_ID, base: { engine: 'mogcity-1', city: 'sf' }, parent: null,
      missions, acts: (pack.acts as unknown[]).length, cast: Object.keys(pack.cast).length, vehicles: 1, dressing: pack.dressing,
      showcase: true, ride: 'horse', controls: CONTROLS, how: HOW,
    },
  };
  const record = {
    v: 1, id: SF_GAME, slug: SF_ID, meta,
    world: { hash: sha(worldBytes), bytes: Buffer.byteLength(worldBytes) },
    // (what the world plays from Mog City's own tree: never stored here, listed for the record)
    mc: { bodies: named.filter((f) => f.endsWith('.glb')).length, bodyBytes: glbBytes, clips: Object.keys(clips).length, clipBytes: voiceBytes },
  };
  return { record: JSON.stringify(record, null, 1) + '\n', world: worldBytes };
}

/** The art the migration writes, from a plain wide frame, a square (or portrait) frame and a headshot on light blue. */
async function makeArt(wide: string, square0: string, headshot: string | null, suffix = '') {
  const sharp = (await import('sharp')).default;
  const { storyKeyArt } = await import('../lib/story-art.ts');
  const plain = await sharp(readFileSync(wide)).resize(1280, 720, { fit: 'cover' }).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
  // (the square frame, or a portrait's middle square)
  const square = await sharp(readFileSync(square0)).resize(512, 512, { fit: 'cover', position: 'centre' }).jpeg({ quality: 90 }).toBuffer();
  const art = await storyKeyArt({ wide: plain, square }, 'SF 2040', 'SAN FRANCISCO');
  if (!art) throw new Error('the title could not be set');
  writeFileSync(`${SF_DIR}/cover-plain${suffix}.jpg`, plain);
  writeFileSync(`${SF_DIR}/cover-wide${suffix}.jpg`, art.wide);
  writeFileSync(`${SF_DIR}/cover-square${suffix}.jpg`, art.icon);
  // (the headshot is shot on the light blue already: only sized, as onSky's keying bands a gradient ground)
  if (headshot) writeFileSync(`${SF_DIR}/headshot${suffix}.jpg`, await sharp(readFileSync(headshot)).resize(512, 512, { fit: 'cover', position: 'top' }).jpeg({ quality: 88, mozjpeg: true }).toBuffer());
  console.log(`wrote ${SF_DIR}/cover-{plain,wide,square}${suffix}.jpg${headshot ? `, headshot${suffix}.jpg` : ''}`);
}

/**
 * A newer world for the game already published (11 Nov: Mog City's feel pass, mogcity cc88be61): --next <n> writes
 * deploy/migrations/sf2040/world-<n>.json and its record sf2040-world-<n>.json ({ from: the world it replaces, world }),
 * which a follow-up migration (2026-11-11-sf2040-world-<n>) seals in place of `from`. The first record and world stay
 * as they were: they are what 2026-11-11-sf2040 published, and a fresh disk replays both migrations in order.
 */
function nextWorld(mc: string, n: number) {
  const prevFile = n === 2 ? `${SF_DIR}/world.json` : `${SF_DIR}/world-${n - 1}.json`;
  const prev = readFileSync(prevFile);
  const w = sfWorld(mc), rec = JSON.parse(w.record);
  if (rec.world.hash === sha(prev)) throw new Error(`Mog City's world is the same as ${prevFile}: nothing to refresh`);
  const out = { v: 1, id: SF_GAME, slug: SF_ID, n, from: { hash: sha(prev), bytes: prev.length }, world: rec.world, mc: rec.mc };
  writeFileSync(`${SF_DIR}/world-${n}.json`, w.world);
  writeFileSync(`deploy/migrations/${SF_ID}-world-${n}.json`, JSON.stringify(out, null, 1) + '\n');
  console.log(`wrote ${SF_DIR}/world-${n}.json (${rec.world.bytes} bytes, ${rec.world.hash.slice(0, 12)}) replacing ${out.from.hash.slice(0, 12)}; on Mog City: ${rec.mc.bodies} bodies, ${rec.mc.clips} clips`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2), ei = args.indexOf('--export'), ai = args.indexOf('--art'), ni = args.indexOf('--next');
  if (ei < 0 || !args[ei + 1]) { console.error('usage: storykit-sf2040.ts --export <mogcity tree> [--next <n> | --art <wide.jpg> <square.jpg> <headshot.jpg>]'); process.exit(2); }
  mkdirSync(SF_DIR, { recursive: true });
  if (ni >= 0) { nextWorld(args[ei + 1], Number(args[ni + 1])); process.exit(0); }
  // (--suffix -2: a later art set beside the first, for a swap migration (2026-11-12-sf2040-art-2), the published
  // record and world left as they are; a headshot of '-' keeps the one there)
  const si = args.indexOf('--suffix'), suffix = si >= 0 ? args[si + 1] : '';
  if (suffix && ai >= 0) { await makeArt(args[ai + 1], args[ai + 2], args[ai + 3] === '-' ? null : args[ai + 3], suffix); process.exit(0); }
  const w = sfWorld(args[ei + 1]);
  writeFileSync(SF_RECORD, w.record);
  writeFileSync(`${SF_DIR}/world.json`, w.world);
  const rec = JSON.parse(w.record);
  console.log(`wrote ${SF_RECORD} and ${SF_DIR}/world.json: world ${rec.world.bytes} bytes (${rec.world.hash.slice(0, 12)}); on Mog City: ${rec.mc.bodies} bodies (${rec.mc.bodyBytes} bytes), ${rec.mc.clips} clips (${rec.mc.clipBytes} bytes)`);
  if (ai >= 0) await makeArt(args[ai + 1], args[ai + 2], args[ai + 3]);
}
