/**
 * Changes to the live database's content, made once each (deploy/boot.mjs runs
 * this before every start; on the Mac, `node deploy/migrate.mjs`). The server's
 * database lives on its own disk, so a change to what is published travels as
 * a migration: an id, and what it does. Each one is recorded and never rerun,
 * and each is written to be harmless if what it changes is already changed.
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

const DIR = 'deploy/migrations';
const file = (name) => { const p = join(DIR, name); return existsSync(p) ? readFileSync(p) : null; };

/**
 * Meme Kart's track signature (8 Oct; lib/runtime/kart.js kartTrackSig), worked out on the Mac with the node sim for the
 * code each row carries (sha256 of the code without the blank lines at either end): the live world's
 * (deploy/migrations/meme-kart.js) and The Original's (meme-kart-original.js, the same track). Its lap and laps are
 * the constants' own. `node scripts/kart-score/test-mog.mjs` works each signature out again from those files.
 */
export const MEME_KART_TRACKS = [
  { slug: 'meme-kart', file: 'meme-kart.js', code: '6242e421a0e8435697013100c728f94a7836859527a7c6cdb29e8229ad987212', sig: 'd90450e9fd3eddee', laps: 3, lap: 1574.9 },
  { slug: 'meme-kart-original', file: 'meme-kart-original.js', code: '2e55c9d5c9e61b85e218eb0379a03f0af00e73b4ff80a7df8a2f8824958aef63', sig: 'd90450e9fd3eddee', laps: 3, lap: 1574.9 },
];

/**
 * The live games with a soundtrack of their own (9 Oct; lib/world-options.ts Soundtrack): each as the runtime plays it,
 * read in headless Chrome on the Mac from the very code the row carries (lib/runtime/v1.js state().soundtrack, the
 * page against the dev server), and named for the Mog page (the runtime's own name is the title's: "Great Wall Shinobi
 * score", "Meme Kart: The Original theme"); a score carries its seed, the title it was composed from, so a Mog plays
 * the very notes. Code: sha256 of the row's code without the blank lines at either end. Every other live world plays
 * none of its own: none of the rest defines music or asks for kart.score, and a world built with options plays its
 * creator's choice. scripts/soundtrack-check.ts reads each again from the files.
 */
export const OWN_SOUNDTRACKS = [
  { slug: 'meme-kart', file: 'deploy/migrations/meme-kart.js', code: '6242e421a0e8435697013100c728f94a7836859527a7c6cdb29e8229ad987212', soundtrack: { kart: true, label: 'Meme Kart theme' } },
  { slug: 'meme-kart-original', file: 'deploy/migrations/meme-kart-original.js', code: '2e55c9d5c9e61b85e218eb0379a03f0af00e73b4ff80a7df8a2f8824958aef63', soundtrack: { kart: true, label: 'Meme Kart theme' } },
  { slug: 'great-wall-shinobi', file: 'worlds/greatwall.js', code: 'a53999fe09f0aa6e605ff5655c7a424b24b4bda991b81624104d83a2a89f1ad2', soundtrack: { music: { style: 'taiko', key: 'D', mode: 'in', tempo: 100, seed: 'Great Wall Shinobi' }, label: 'Great Wall score' } },
  { slug: 'las-vegas-night-gp', file: 'worlds/vegas.js', code: '133b1b26c767d2fccc9b5dc7910d2b866c8980e8db12df9283f8f5a6e196eecc', soundtrack: { track: 'music-dance-field', label: 'Dance Field' } },
  { slug: 'ai-alps', file: 'deploy/migrations/ai-alps.js', code: 'dec24fca424105680a9f6e49641b015a1e2fcf57f38c91afaff3262d07e50bcd', soundtrack: { track: 'music-funky-house', label: 'Funky House' } },
];

/**
 * The heroes' headshots (4 to 5 Nov; the owner: the homepage's "Jump in" bubbles should be "profile pics of the games'
 * main characters", "looking straight into camera like a headshot"): straight on, eyes 40% down, 512 px, shot on the Mac in headless Chrome from each live game's own code (as
 * /api/games served it on 4 Nov) by the platform's key-art pass (lib/key-art.ts capturePortrait, lib/runtime/portrait.js),
 * each judged by eye at the bubbles' 90 px. deploy/migrations/<slug>-avatar.jpg. Code: sha256 of the row's code, first 16
 * hex. Set by 2026-11-05-hero-headshots (where a game has none or still has its 4 Nov portrait), only on the code it was
 * shot from; any other game shows a square of its cover (app/g/[slug]/avatar/route.ts) until its next build shoots its own.
 */
export const AVATARS = [
  { slug: 'artificial1', id: '82667fc6-d77e-4bfd-b466-cf174645587f', code: '745abbb65d5779b5' },
  { slug: 'wonderwake-skywhale-rally', id: '68d184f8-4d2c-4846-ba72-2f0036971ef0', code: '1f0826eae18cc40b' },
  { slug: 'eye-of-the-meme-storm', id: 'e77b2a60-2974-4215-8e02-86162bfce883', code: 'a1e77bc8680bd193' },
  { slug: 'qatar-gp-golden-dunes', id: '37d7b3a3-91cc-4c3e-b545-00157c3b5a99', code: 'dc83b96ec3854b0a' },
  { slug: 'meme-kart-midnight-mog', id: '90da1a00-0272-4e56-8b38-ffc088699026', code: '7d253a8fb6fed54b' },
  { slug: 'meme-kart', id: '88cd2bad-86fb-45a0-87ce-d312e1acb244', code: '1b48b6d7a19ef083' },
  { slug: 'amazon-gold-2026', id: '20583b14-077c-4fd9-a92f-1a3ed0b37412', code: '0ef9226c0b2556db' },
  { slug: 'ai-alps', id: 'd7625caf-7e78-41f2-af35-08cd4fb63dac', code: 'f3dbb1dd7732cb8b' },
  { slug: 'neon-canvas-alley', id: '51c2b800-189f-4208-b996-4572c9018a63', code: '0f3d95dba9c4035a' },
  { slug: 'wanderer-of-the-ring', id: '19d07fac-41e7-4c7f-8f69-ef5f4ff4086c', code: '87f4ffabc5fa8956' },
  { slug: 'three-on-the-line', id: '7f16dd2e-26f5-4600-b3d5-feab7b8aa175', code: '208b9fcf24810249' },
  { slug: 'mog-derby', id: '5e118e8c-07b0-4f15-b551-1a1b3ab4101a', code: '3a46566445504402' },
  { slug: 'iara-of-the-amazon', id: '0e1fd6e5-8255-4631-8cde-2ae482d0fa8c', code: 'af544bd362aad190' },
  { slug: 'zombie-beach', id: '7ecfbbb2-5697-4903-844e-40a6b79f0348', code: '20387636c75517cd' },
  { slug: 'invisible-world', id: '3a646312-8002-4cbc-9386-0be572a2a5b4', code: '51a860a8fab19398' },
  { slug: 'magma-crown', id: 'ae46cc09-9dfb-4975-b8f4-6138b7b4e66f', code: 'bf6f3bf50c66462e' },
  { slug: 'santa-south-beach-gp', id: '29042c94-6772-4b6a-a2ff-34fe48ced3f1', code: '2d504c013594e881' },
  { slug: 'darkmog-frostbite-gp', id: 'f3603ade-68bc-40ea-8322-1665c1edeb83', code: 'a36f20e76a91e887' },
  { slug: 'shootout', id: '70a68452-134f-4a25-bfbe-89edaacb1fc1', code: '2c35cc8615404c3b' },
  { slug: 'great-wall-shinobi', id: '09438e11-8062-4952-8b21-9720e89574b3', code: '26731bc8f8bfe63c' },
  { slug: 'rustwalker-ranger', id: '529675fa-ff03-432f-963b-c11d5347c5b4', code: '25e332d215767b16' },
  { slug: 'moonrover-ranger', id: 'a25ab539-c8bc-4521-a2f7-ef972a28cd11', code: '76652426b83b09a1' },
  { slug: 'meme-match', id: '427f5849-f0c1-4f39-8dc6-d5c2f3166427', code: 'c708847ae9228521' },
  { slug: 'country-box', id: '3859e557-f2ae-49f1-a59b-6fbd3796fb4b', code: 'f94abd878f595637' },
  { slug: 'manila-thrilla-2026', id: '8262aaea-e57d-4f2b-9674-7cdb9f4ee21f', code: '63796cac6ddbfc9d' },
  { slug: 'aspen-gp', id: 'c1093f21-d3d3-4735-9b40-1d532ca13892', code: 'f2722635e78362eb' },
];

/** The 4 Nov portraits as they were shipped (sha256 of the bytes, first 16 hex): the headshots replace only these. */
export const OLD_AVATARS = [
  { slug: 'ai-alps', sha: 'c8f478e771b2aec3' },
  { slug: 'amazon-gold-2026', sha: 'a90e40440d6e8d20' },
  { slug: 'artificial1', sha: '5abb246293e20c30' },
  { slug: 'aspen-gp', sha: '79a0ef4f5047b37e' },
  { slug: 'country-box', sha: '6bc1e62b9e7344ba' },
  { slug: 'darkmog-frostbite-gp', sha: '32dcfef70455e796' },
  { slug: 'eye-of-the-meme-storm', sha: 'a5e626abae8c80f0' },
  { slug: 'great-wall-shinobi', sha: '77877546ae6ae646' },
  { slug: 'iara-of-the-amazon', sha: 'b73385dbc7e74613' },
  { slug: 'invisible-world', sha: '298bff4091fde4d0' },
  { slug: 'lantern-hour-moon-whale-midway', sha: '83d6e3d763cc2782' },
  { slug: 'magma-crown', sha: '339ae9378dab9d88' },
  { slug: 'mallow-the-lantern-sea', sha: 'c84ea6cd7cd62a9e' },
  { slug: 'mane-event-savanna-run', sha: '745f911fe0f39eec' },
  { slug: 'manila-thrilla-2026', sha: 'fe0354093439dcfa' },
  { slug: 'meme-kart', sha: '19d09d5067b05121' },
  { slug: 'meme-kart-midnight-mog', sha: '829a69a3ffeff0f8' },
  { slug: 'meme-match', sha: 'b8df6e5601a25886' },
  { slug: 'mog-derby', sha: 'e28e500794637120' },
  { slug: 'mog-kart-canyon-gp', sha: 'c9b6df4779afeccf' },
  { slug: 'mogdune', sha: '0f43fb0ea8422bff' },
  { slug: 'moonrover-ranger', sha: '8f2d299f4348e357' },
  { slug: 'neon-canvas-alley', sha: '6cd1b22f5fec7178' },
  { slug: 'qatar-gp-golden-dunes', sha: '5dd7cf20cd1ecac3' },
  { slug: 'ruse-cloudquake-carnival', sha: 'a16afa71388dfe2e' },
  { slug: 'rustwalker-ranger', sha: 'd3988046e32c61c5' },
  { slug: 'sandrider', sha: '0f3e53e010ced1a0' },
  { slug: 'santa-south-beach-gp', sha: 'b0d9618ab164ec87' },
  { slug: 'shootout', sha: '01295c890f6b082c' },
  { slug: 'three-on-the-line', sha: '9ae31940107810be' },
  { slug: 'wanderer-of-the-ring', sha: '646cd4a3d8516417' },
  { slug: 'wonderwake-skywhale-rally', sha: '8eca21c4d0949da8' },
  { slug: 'zombie-beach', sha: '51581979dcdf19a7' },
];

/**
 * 5 Nov, the owner: "why aren't classic and up & coming centered in the circle like this instagram". The three creatures
 * whose 4 Nov portraits were kept get a centred headshot: Mallow cut from a frontal reshoot, Lantern Hour and Ruse
 * from their own 4 Nov portraits (they turn away from any lens that follows them), each cut round its eyes as found
 * in the picture (.scratch eyes.cjs: the two dark round blobs most level and alike), the eyes 50% across and 40% down.
 * Each replaces only the very 4 Nov portrait (old: its bytes) on the code it was shot from (code).
 */
export const CREATURE_HEADSHOTS = [
  { slug: 'mallow-the-lantern-sea', id: 'bc676b38-450e-4120-bcfa-50f1b9a32d9a', code: 'aad04cc5e4ccb808', old: 'c84ea6cd7cd62a9e' },
  { slug: 'lantern-hour-moon-whale-midway', id: '23f61497-cc86-43ee-adbb-061b099b4fd9', code: '28caf4905f640d0f', old: '83d6e3d763cc2782' },
  { slug: 'ruse-cloudquake-carnival', id: 'b845718a-be6e-4d11-a87e-75afd2e1371e', code: 'f7d7f71b98c9854b', old: 'a16afa71388dfe2e' },
];

/**
 * 6 Nov, the owner: "for Jump In section, it should show main character headshot against a light blue background, not
 * car, for ASPEN GP show the darklord headshot". Every listed world's hero re-shot as a headshot on the light-blue sky
 * (lib/runtime/portrait.js backdrop: the world out of the picture, the hero laid on the sky through his matte), on the
 * Mac in headless Chrome from each game's own code by the platform's portrait pass (lib/key-art.ts capturePortrait); a
 * kart or car world's is its driver's face, Aspen GP's is Lord Black Diamond's. Each judged by eye; a few framed by
 * hand (darkmog-frostbite-gp zoomed to the driver, mog-kart-canyon-gp, Lantern Hour and Ruse from turned lenses, Oaktown
 * and Zcity with their guard up). Las Vegas Night GP (a helmet behind glass), MogDune and Mog City (not a Runtime
 * world) have none: they show the card. deploy/migrations/<slug>-sky.jpg. Code:
 * sha256 of the row's code, first 16 hex. Set by 2026-11-06-sky-headshots only on the code it was shot from (a game
 * rebuilt since keeps the portrait its own build shot); a world with no headshot here shows the headshot card
 * (app/g/[slug]/avatar/route.ts, lib/portrait-sky.ts).
 */
export const SKY_HEADSHOTS = [
  { slug: 'ai-alps', id: 'd7625caf-7e78-41f2-af35-08cd4fb63dac', code: 'f3dbb1dd7732cb8b' },
  { slug: 'amazon-gold-2026', id: '20583b14-077c-4fd9-a92f-1a3ed0b37412', code: '0ef9226c0b2556db' },
  { slug: 'artificial1', id: '82667fc6-d77e-4bfd-b466-cf174645587f', code: '745abbb65d5779b5' },
  { slug: 'aspen-gp', id: 'c1093f21-d3d3-4735-9b40-1d532ca13892', code: 'f2722635e78362eb' },
  { slug: 'country-box', id: '3859e557-f2ae-49f1-a59b-6fbd3796fb4b', code: 'f94abd878f595637' },
  { slug: 'darkmog-frostbite-gp', id: 'f3603ade-68bc-40ea-8322-1665c1edeb83', code: 'a36f20e76a91e887' },
  { slug: 'dead-tide-disco', id: 'c5b2f6b5-d813-49eb-b5ab-287482b6240f', code: 'b4d5afee9a7908e2' },
  { slug: 'eye-of-the-meme-storm', id: 'e77b2a60-2974-4215-8e02-86162bfce883', code: 'a1e77bc8680bd193' },
  { slug: 'great-wall-shinobi', id: '09438e11-8062-4952-8b21-9720e89574b3', code: '26731bc8f8bfe63c' },
  { slug: 'iara-of-the-amazon', id: '0e1fd6e5-8255-4631-8cde-2ae482d0fa8c', code: 'af544bd362aad190' },
  { slug: 'invisible-world', id: '3a646312-8002-4cbc-9386-0be572a2a5b4', code: '51a860a8fab19398' },
  { slug: 'lantern-hour-moon-whale-midway', id: '23f61497-cc86-43ee-adbb-061b099b4fd9', code: '28caf4905f640d0f' },
  { slug: 'magma-crown', id: 'ae46cc09-9dfb-4975-b8f4-6138b7b4e66f', code: 'bf6f3bf50c66462e' },
  { slug: 'mallow-the-lantern-sea', id: 'bc676b38-450e-4120-bcfa-50f1b9a32d9a', code: 'aad04cc5e4ccb808' },
  { slug: 'mane-event-savanna-run', id: '7bf331a3-5abd-4995-baf3-61b89f70399c', code: 'c83015a449b2300d' },
  { slug: 'manila-thrilla-2026', id: '8262aaea-e57d-4f2b-9674-7cdb9f4ee21f', code: '63796cac6ddbfc9d' },
  { slug: 'meme-kart', id: '88cd2bad-86fb-45a0-87ce-d312e1acb244', code: '1b48b6d7a19ef083' },
  { slug: 'meme-kart-midnight-mog', id: '90da1a00-0272-4e56-8b38-ffc088699026', code: '7d253a8fb6fed54b' },
  { slug: 'meme-match', id: '427f5849-f0c1-4f39-8dc6-d5c2f3166427', code: 'c708847ae9228521' },
  { slug: 'mog-derby', id: '5e118e8c-07b0-4f15-b551-1a1b3ab4101a', code: '3a46566445504402' },
  { slug: 'mog-kart-canyon-gp', id: '670ab5a5-0ef9-44cc-b216-345904f419e8', code: '4a8adbdf4067b34d' },
  { slug: 'moonrover-ranger', id: 'a25ab539-c8bc-4521-a2f7-ef972a28cd11', code: '76652426b83b09a1' },
  { slug: 'neon-canvas-alley', id: '51c2b800-189f-4208-b996-4572c9018a63', code: '0f3d95dba9c4035a' },
  { slug: 'oaktown-testarossa', id: 'adb6a723-6655-481f-b1d4-ecd1464b4e46', code: 'd37706db0d309392' },
  { slug: 'qatar-gp-golden-dunes', id: '37d7b3a3-91cc-4c3e-b545-00157c3b5a99', code: 'dc83b96ec3854b0a' },
  { slug: 'ruse-cloudquake-carnival', id: 'b845718a-be6e-4d11-a87e-75afd2e1371e', code: 'f7d7f71b98c9854b' },
  { slug: 'rustwalker-ranger', id: '529675fa-ff03-432f-963b-c11d5347c5b4', code: '25e332d215767b16' },
  { slug: 'sandrider', id: 'f7663e89-bcfa-471d-876a-68a79836938f', code: '1ad4d82e385301fb' },
  { slug: 'santa-south-beach-gp', id: '29042c94-6772-4b6a-a2ff-34fe48ced3f1', code: '2d504c013594e881' },
  { slug: 'shootout', id: '70a68452-134f-4a25-bfbe-89edaacb1fc1', code: '2c35cc8615404c3b' },
  { slug: 'sunset-voltline', id: 'af42bd6b-3f93-4e62-ba55-ca313d768825', code: '973613a330f1a6c1' },
  { slug: 'three-on-the-line', id: '7f16dd2e-26f5-4600-b3d5-feab7b8aa175', code: '208b9fcf24810249' },
  { slug: 'wanderer-of-the-ring', id: '19d07fac-41e7-4c7f-8f69-ef5f4ff4086c', code: '87f4ffabc5fa8956' },
  { slug: 'wonderwake-skywhale-rally', id: '68d184f8-4d2c-4846-ba72-2f0036971ef0', code: '1f0826eae18cc40b' },
  { slug: 'zcity', id: '4ce0c82d-b16b-48ff-96db-d400ba9f34f3', code: '92e96d7b160228c7' },
  { slug: 'zombie-beach', id: '7ecfbbb2-5697-4903-844e-40a6b79f0348', code: '20387636c75517cd' },
];

/**
 * 6 Nov, round 2 (the owner: "every game should include media with a headshot so it can be featured"): the live worlds
 * the first sky headshots missed, on the same sky. Las Vegas Night GP and MogDune by the portrait pass's new ladder
 * (wider, turned, then the best moment: lib/runtime/portrait.js take); The Velvet Run's Lena Vale and Mog City's Dan by
 * the Story Kit's portrait studio from their own bodies (public/storykit/forge/portrait.html, frame 'avatar', on the
 * sky's key, laid on the sky by lib/portrait-sky-key.ts onSky). deploy/migrations/<slug>-sky.jpg. Code: sha256 of the
 * row's code, first 16 hex. Set by 2026-11-06-sky-headshots-2 only on that code and only where the game still has no
 * portrait of its own.
 */
export const SKY_HEADSHOTS_2 = [
  { slug: 'las-vegas-night-gp', id: '993a0020-bd75-4c2e-9e71-7fecb5e2b39c', code: 'aee21ad9419b0e0e' },
  { slug: 'mogdune', id: '6326cf02-b83d-4bbc-89b9-cb4d743ff97e', code: '14038421900f37a9' },
  { slug: 'the-velvet-run', id: '568083ce-a342-49fd-a564-061c59f6efad', code: '1001eaf24b2823e7' },
  { slug: 'mog-city', id: '5b0c2d0e-6f4a-4c1e-9a43-0d7c1e3a9b21', code: 'ecb9219e25fc7155' },
];

// (exported for the checks: scripts/kart-score/test-mog.mjs runs one on a database of its own)
export const MIGRATIONS = [
  {
    // the owner, 1 Oct: "IP fixes, just do Mario Kart to Mog Kart, that is all"
    id: '2026-10-01-mog-kart',
    run(db) {
      const g = db.prepare("SELECT id FROM games WHERE slug IN ('mariomog-canyon-gp', 'mog-kart-canyon-gp')").get();
      if (!g) return 'no such game';
      const swap = (s) => s == null ? s : s.replace(/MarioMog Canyon GP/g, 'Mog Kart Canyon GP').replace(/Mario ?kart/gi, 'Mog Kart').replace(/MarioMog/g, 'Mog');
      const r = db.prepare('SELECT title, tagline, blurb, meta, prompt, code, spec FROM games WHERE id = ?').get(g.id);
      db.prepare('UPDATE games SET slug = ?, title = ?, tagline = ?, blurb = ?, meta = ?, prompt = ?, code = ?, spec = ? WHERE id = ?')
        .run('mog-kart-canyon-gp', swap(r.title), swap(r.tagline), swap(r.blurb), swap(r.meta), swap(r.prompt), swap(r.code), swap(r.spec), g.id);
      // the key art carries the title in the picture: the new one, shot on the Mac
      const wide = file('mog-kart-canyon-gp-wide.jpg'), icon = file('mog-kart-canyon-gp-icon.jpg');
      if (wide && icon) db.prepare('UPDATE games SET art_wide = ?, art_icon = ? WHERE id = ?').run(wide, icon, g.id);
      return `renamed${wide && icon ? ', new key art' : ''}`;
    },
  },
  {
    // the owner, 1 Oct: two official open worlds; the first, Mog Derby, a car combat arena
    // (published on the Mac by `npm run publish:world -- mog-derby`, which playtested it and shot its art)
    id: '2026-10-01-mog-derby',
    run(db) {
      const code = file('mog-derby.js'), meta = file('mog-derby.meta.json');
      if (!code || !meta) return 'files missing';
      // mog-derby.meta.json: { id, title, tagline, blurb, meta } (meta: the games row's meta, as published)
      const m = JSON.parse(meta.toString('utf8')), cover = file('mog-derby-cover.jpg'), icon = file('mog-derby-icon.jpg'), wide = file('mog-derby-wide.jpg');
      const g = db.prepare("SELECT id FROM games WHERE slug = 'mog-derby'").get();
      if (g) {
        db.prepare('UPDATE games SET title = ?, tagline = ?, blurb = ?, code = ?, meta = ?, cover = ?, art_icon = ?, art_wide = ?, format = ? WHERE id = ?')
          .run(m.title, m.tagline, m.blurb, code.toString('utf8'), JSON.stringify(m.meta), cover, icon, wide, 'world', g.id);
        return 'updated';
      }
      db.prepare(`INSERT INTO games (id, slug, title, tagline, blurb, difficulty, spec, prompt, featured, created_at, format, code, meta, cover, art_icon, art_wide, parent_id, root_id, generation, mog_prompt)
        VALUES (?, 'mog-derby', ?, ?, ?, 'endless', '{}', ?, 0, ?, 'world', ?, ?, ?, ?, ?, NULL, NULL, 0, NULL)`)
        .run(m.id, m.title, m.tagline, m.blurb, 'first-party world: mog-derby', Date.now(), code.toString('utf8'), JSON.stringify(m.meta), cover, icon, wide);
      return 'published';
    },
  },
  {
    // 1 Oct: Lantern Hour (a Mog) was built in a background tab, its test drive never
    // ran, and it published with no cover; these were shot on the Mac from its own code
    id: '2026-10-01-lantern-hour-cover',
    run(db) {
      const cover = file('lantern-hour-moon-whale-midway-cover.jpg'), icon = file('lantern-hour-moon-whale-midway-icon.jpg'), wide = file('lantern-hour-moon-whale-midway-wide.jpg');
      if (!cover) return 'files missing';
      const r = db.prepare("UPDATE games SET cover = ?, art_icon = COALESCE(art_icon, ?), art_wide = COALESCE(art_wide, ?) WHERE slug = 'lantern-hour-moon-whale-midway' AND cover IS NULL").run(cover, icon, wide);
      return r.changes ? 'cover restored' : 'already has a cover (or no such game)';
    },
  },
  {
    // the owner, 1 Oct: MogDune, an official open world in Dune's deep desert (the owner chose
    // Dune's names); no GM. Published on the Mac by `npm run publish:world -- mogdune`, which
    // playtested it; the key art is its opening's eclipse shot, shot on the Mac from its own code
    id: '2026-10-02-mogdune',
    run(db) {
      const code = file('mogdune.js'), meta = file('mogdune.meta.json');
      if (!code || !meta) return 'files missing';
      const m = JSON.parse(meta.toString('utf8')), cover = file('mogdune-cover.jpg'), icon = file('mogdune-icon.jpg'), wide = file('mogdune-wide.jpg');
      const g = db.prepare("SELECT id FROM games WHERE slug = 'mogdune'").get();
      if (g) {
        db.prepare('UPDATE games SET title = ?, tagline = ?, blurb = ?, code = ?, meta = ?, cover = ?, art_icon = ?, art_wide = ?, format = ? WHERE id = ?')
          .run(m.title, m.tagline, m.blurb, code.toString('utf8'), JSON.stringify(m.meta), cover, icon, wide, 'world', g.id);
        return 'updated';
      }
      db.prepare(`INSERT INTO games (id, slug, title, tagline, blurb, difficulty, spec, prompt, featured, created_at, format, code, meta, cover, art_icon, art_wide, parent_id, root_id, generation, mog_prompt)
        VALUES (?, 'mogdune', ?, ?, ?, 'endless', '{}', ?, 0, ?, 'world', ?, ?, ?, ?, ?, NULL, NULL, 0, NULL)`)
        .run(m.id, m.title, m.tagline, m.blurb, 'first-party world: mogdune', Date.now(), code.toString('utf8'), JSON.stringify(m.meta), cover, icon, wide);
      return 'published';
    },
  },
  {
    // the owner, 2 Oct: Zcity, "a showcase MOG of Zombie Beach based on Spiderbench": the OG at night in the city map,
    // running up the towers and swinging between them. Published on the Mac by `npm run publish:world -- zcity --mog
    // zombie-beach --prompt ...`, which playtested it and shot its art; it joins Zombie Beach's family, one generation down
    id: '2026-10-02-zcity',
    run(db) {
      const code = file('zcity.js'), meta = file('zcity.meta.json');
      if (!code || !meta) return 'files missing';
      const m = JSON.parse(meta.toString('utf8')), cover = file('zcity-cover.jpg'), icon = file('zcity-icon.jpg'), wide = file('zcity-wide.jpg');
      const parent = db.prepare('SELECT id, root_id, generation FROM games WHERE slug = ?').get(m.mogOf);
      if (!parent) return `no ${m.mogOf} to Mog`;
      const fam = [parent.id, parent.root_id ?? parent.id, parent.generation + 1, m.mogPrompt];
      const g = db.prepare("SELECT id FROM games WHERE slug = 'zcity'").get();
      if (g) {
        db.prepare('UPDATE games SET title = ?, tagline = ?, blurb = ?, code = ?, meta = ?, cover = ?, art_icon = ?, art_wide = ?, format = ?, parent_id = ?, root_id = ?, generation = ?, mog_prompt = ? WHERE id = ?')
          .run(m.title, m.tagline, m.blurb, code.toString('utf8'), JSON.stringify(m.meta), cover, icon, wide, 'world', ...fam, g.id);
        return 'updated';
      }
      db.prepare(`INSERT INTO games (id, slug, title, tagline, blurb, difficulty, spec, prompt, featured, created_at, format, code, meta, cover, art_icon, art_wide, parent_id, root_id, generation, mog_prompt)
        VALUES (?, 'zcity', ?, ?, ?, 'endless', '{}', ?, 0, ?, 'world', ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(m.id, m.title, m.tagline, m.blurb, 'first-party world: zcity', Date.now(), code.toString('utf8'), JSON.stringify(m.meta), cover, icon, wide, ...fam);
      return 'published, a Mog of ' + m.mogOf;
    },
  },
  {
    // the owner, 3 Oct: Zcity's quarantine troopers in the runtime's new hazmat suits (gloves, boots, respirators).
    // Republished on the Mac (playtested), its art reshot; the files above are that version
    id: '2026-10-03-zcity-troopers',
    run(db) {
      const code = file('zcity.js'), meta = file('zcity.meta.json');
      if (!code || !meta) return 'files missing';
      const m = JSON.parse(meta.toString('utf8'));
      const r = db.prepare("UPDATE games SET code = ?, meta = ?, cover = ?, art_icon = ?, art_wide = ? WHERE slug = 'zcity'")
        .run(code.toString('utf8'), JSON.stringify(m.meta), file('zcity-cover.jpg'), file('zcity-icon.jpg'), file('zcity-wide.jpg'));
      return r.changes ? 'updated' : 'no zcity';
    },
  },
  {
    // the owner, 4 Oct: AI Alps, an official open world: a chrome endoskeleton (the owner's reference,
    // replicated) at a Courchevel ski-resort DJ party, punches and bottles only, 10,000 GM to buy a name,
    // a story scene every 1,500 GM. Published on the Mac by `npm run publish:world -- ai-alps`, which
    // playtested it and shot its art
    id: '2026-10-05-ai-alps',
    run(db) {
      const code = file('ai-alps.js'), meta = file('ai-alps.meta.json');
      if (!code || !meta) return 'files missing';
      const m = JSON.parse(meta.toString('utf8')), cover = file('ai-alps-cover.jpg'), icon = file('ai-alps-icon.jpg'), wide = file('ai-alps-wide.jpg');
      const g = db.prepare("SELECT id FROM games WHERE slug = 'ai-alps'").get();
      if (g) {
        db.prepare('UPDATE games SET title = ?, tagline = ?, blurb = ?, code = ?, meta = ?, cover = ?, art_icon = ?, art_wide = ?, format = ? WHERE id = ?')
          .run(m.title, m.tagline, m.blurb, code.toString('utf8'), JSON.stringify(m.meta), cover, icon, wide, 'world', g.id);
        return 'updated';
      }
      db.prepare(`INSERT INTO games (id, slug, title, tagline, blurb, difficulty, spec, prompt, featured, created_at, format, code, meta, cover, art_icon, art_wide, parent_id, root_id, generation, mog_prompt)
        VALUES (?, 'ai-alps', ?, ?, ?, 'endless', '{}', ?, 0, ?, 'world', ?, ?, ?, ?, ?, NULL, NULL, 0, NULL)`)
        .run(m.id, m.title, m.tagline, m.blurb, 'first-party world: ai-alps', Date.now(), code.toString('utf8'), JSON.stringify(m.meta), cover, icon, wide);
      return 'published';
    },
  },
  {
    // the owner, 5 Oct, of the first Mog of AI Alps: "the third pass screwed up the lightening to way
    // overexposed". Typson: Honky Tonk Havoc relit on the Mac: its lighting, fog and graphics values only
    // (exposure 1.7 -> 1.45 under far gentler lights: the photographed dusk drawn dark above the rafters
    // and barely lighting the room, the hemisphere 1.5 -> 1.35, the sun 2.8 -> 1.3, warm lamps, a dark
    // warm haze), playtested as a local draft, its art reshot from that code. Only the version this
    // repairs is replaced: if the creator has rebuilt it since, it is left as it is
    id: '2026-10-05-typson-light',
    run(db) {
      const code = file('typson-honky-tonk-havoc.js');
      if (!code) return 'files missing';
      // by either address: the game is renamed Country Box after this (2026-10-05-country-box, below); the old one first
      const g = db.prepare("SELECT id, code, meta FROM games WHERE slug IN ('typson-honky-tonk-havoc', 'country-box') ORDER BY slug = 'typson-honky-tonk-havoc' DESC").get();
      if (!g) return 'no such game';
      const next = code.toString('utf8'), sha = (s) => createHash('sha256').update(String(s ?? '')).digest('hex');
      // the published code, as it was on 5 Oct (sha256 of its text, without the blank lines at either end)
      const WAS = 'b42d0d8a40e14a6635c93a90b3fbbd63e49293940f41fe3a2a4722a364bed137';
      if (g.code === next) return 'already relit';
      if (sha(String(g.code ?? '').trim()) !== WAS) return 'left alone: its code has changed since 5 Oct, so this repair no longer fits it';
      // the test record follows the code it describes (lib/test-drive.ts codeHash), and the cover is now of this code
      let meta = g.meta, hash = '';
      try {
        const m = JSON.parse(g.meta ?? 'null');
        if (m && m.test && typeof m.test === 'object') { hash = sha(next).slice(0, 16); m.test = { ...m.test, codeHash: hash, cover: 'current' }; meta = JSON.stringify(m); }
      } catch { meta = g.meta; }
      db.prepare('UPDATE games SET code = ?, meta = ?, cover = COALESCE(?, cover), art_icon = COALESCE(?, art_icon), art_wide = COALESCE(?, art_wide) WHERE id = ?')
        .run(next, meta, file('typson-honky-tonk-havoc-cover.jpg'), file('typson-honky-tonk-havoc-icon.jpg'), file('typson-honky-tonk-havoc-wide.jpg'), g.id);
      return `relit (${hash ? 'test codeHash ' + hash : 'no test record'}), new cover and key art`;
    },
  },
  {
    // the owner, 5 Oct: "let's change name "Typson: Honky Tonk Havoc" to "Country Box"". Renamed in place, as Miami OG
    // became Zombie Beach: its title, its address and its meta's title (what the play page and the runtime show), and
    // the old name wherever its tagline or blurb says it. Its code, its family, its plays and its scores stay as they
    // are (the world inside still calls its fighter Iron Mike Typson). /g and /mog/typson-honky-tonk-havoc redirect
    // (next.config.ts). The key art carries the title in the picture: shot on the Mac from the relit code above
    // (typson-honky-tonk-havoc.js), titled Country Box. After 2026-10-05-typson-light, which finds it by either address
    id: '2026-10-05-country-box',
    run(db) {
      const OLD = 'Typson: Honky Tonk Havoc', NEW = 'Country Box';
      const g = db.prepare("SELECT id, title, tagline, blurb, meta, code FROM games WHERE slug = 'typson-honky-tonk-havoc'").get();
      const taken = db.prepare("SELECT id FROM games WHERE slug = 'country-box'").get();
      if (!g) return taken ? 'already Country Box' : 'no such game';
      if (taken) return 'left alone: another game already has the address country-box';
      const swap = (s) => (typeof s === 'string' ? s.split(OLD).join(NEW) : s);
      // the meta is rewritten only where the name is in it; anything else in it, the test record included, as it was
      let meta = g.meta;
      try {
        const m = JSON.parse(g.meta ?? 'null');
        if (m && typeof m === 'object' && !Array.isArray(m)) {
          const was = JSON.stringify(m);
          if (typeof m.title === 'string') m.title = NEW;
          if (typeof m.tagline === 'string') m.tagline = swap(m.tagline);
          if (typeof m.blurb === 'string') m.blurb = swap(m.blurb);
          if (JSON.stringify(m) !== was) meta = JSON.stringify(m);
        }
      } catch { meta = g.meta; }
      db.prepare('UPDATE games SET slug = ?, title = ?, tagline = ?, blurb = ?, meta = ? WHERE id = ?')
        .run('country-box', NEW, swap(g.tagline), swap(g.blurb), meta, g.id);
      // the icon and the wide carry the name, so they are always the new ones; the cover (no title) is replaced only
      // while the code is the one it was shot from, so the test record's "cover: current" stays true
      const icon = file('country-box-icon.jpg'), wide = file('country-box-wide.jpg'), cover = file('country-box-cover.jpg');
      const shot = file('typson-honky-tonk-havoc.js'), same = !!shot && String(g.code ?? '').trim() === shot.toString('utf8').trim();
      if (icon && wide) db.prepare('UPDATE games SET art_icon = ?, art_wide = ? WHERE id = ?').run(icon, wide, g.id);
      if (cover && same) db.prepare('UPDATE games SET cover = ? WHERE id = ?').run(cover, g.id);
      // the intro's title card says the name too (the only place in the world's code that does): only in the relit
      // code, the test record following it (lib/test-drive.ts codeHash)
      let card = false;
      if (same && String(g.code).includes("title: 'HONKY TONK HAVOC'")) {
        const code = String(g.code).split("title: 'HONKY TONK HAVOC'").join("title: 'COUNTRY BOX'");
        let m2 = meta;
        try { const m = JSON.parse(meta ?? 'null'); if (m && m.test && typeof m.test === 'object') { m.test = { ...m.test, codeHash: createHash('sha256').update(code).digest('hex').slice(0, 16) }; m2 = JSON.stringify(m); } } catch { m2 = meta; }
        db.prepare('UPDATE games SET code = ?, meta = ? WHERE id = ?').run(code, m2, g.id); card = true;
      }
      return `renamed Country Box${icon && wide ? ', new key art' : ''}${cover && same ? ' and cover' : ', cover kept (its code is not the relit one)'}${card ? ', title card COUNTRY BOX' : ''}`;
    },
  },
  {
    // the owner, 6 Oct: Country Box's fighter, "Iron Mike Typson", is renamed Cash Callahan ("Cash" for short), so no
    // real boxer's name or nickname is left in the game: in its code (intro, outro, a heat line, the win line, the
    // player's name), its tagline, blurb and cast, and the Mog idea shown on its page (its last line, "This is peak
    // Mike Tyson", becomes "This is a heavyweight in his prime"). The code is changed only while it is the version
    // published by the two migrations above; a rebuild by its creator is left as it is
    id: '2026-10-06-cash-callahan',
    run(db) {
      const g = db.prepare("SELECT id, code, meta, tagline, blurb, mog_prompt FROM games WHERE slug IN ('country-box', 'typson-honky-tonk-havoc') ORDER BY slug = 'country-box' DESC").get();
      if (!g) return 'no such game';
      const name = (t) => (typeof t === 'string' ? t.split('Iron Mike Typson').join('Cash Callahan').split('Iron Mike').join('Cash') : t);
      const idea = (t) => (typeof t === 'string' ? name(t).split('This is peak Mike Tyson').join('This is a heavyweight in his prime').split('Mike Tyson').join('a heavyweight legend') : t);
      const sha = (s) => createHash('sha256').update(String(s ?? '')).digest('hex');
      const relit = file('typson-honky-tonk-havoc.js');
      const known = relit ? [relit.toString('utf8'), relit.toString('utf8').split("title: 'HONKY TONK HAVOC'").join("title: 'COUNTRY BOX'")].map((c) => sha(c.trim())) : [];
      const ours = known.includes(sha(String(g.code ?? '').trim()));
      const code = ours ? name(String(g.code)) : g.code;
      let meta = g.meta;
      try {
        const m = JSON.parse(g.meta ?? 'null');
        if (m && typeof m === 'object' && !Array.isArray(m)) {
          const was = JSON.stringify(m), m2 = JSON.parse(name(was));
          if (ours && m2.test && typeof m2.test === 'object' && code !== g.code) m2.test = { ...m2.test, codeHash: sha(code).slice(0, 16) };
          if (JSON.stringify(m2) !== was) meta = JSON.stringify(m2);
        }
      } catch { meta = g.meta; }
      const r = db.prepare('UPDATE games SET code = ?, meta = ?, tagline = ?, blurb = ?, mog_prompt = ? WHERE id = ?')
        .run(code, meta, name(g.tagline), name(g.blurb), idea(g.mog_prompt), g.id);
      return `${r.changes ? 'renamed the fighter Cash Callahan' : 'unchanged'}${ours ? '' : ' (code left as it is: not the published version)'}`;
    },
  },  {
    // the owner, 6 Oct: "Oaktown is supposed to be a MOG, not a newly created city". Their Mog of Zcity ("set it at
    // daytime driving around in a red ferrari testarossa GTA 5 style. city is called Oaktown") had come back as a
    // car-derby arena with none of Zcity in it. Rebuilt on the Mac with the Mog fixes (lib/mog-dna.ts: the parent's
    // DNA kept unless the idea replaces it): Zcity's city in daylight, named Oaktown, the OG on foot, the crews, the
    // patrol and the vaccine story kept, a red Testarossa at the curb; test-driven (56 fps), its art shot then. Only
    // the derby that was published is replaced: if its creator has rebuilt it since, it is left as it is
    id: '2026-10-06-oaktown-mog',
    run(db) {
      const code = file('oaktown-testarossa.js'), metaFile = file('oaktown-testarossa.meta.json');
      if (!code || !metaFile) return 'files missing';
      const g = db.prepare("SELECT id, code, meta FROM games WHERE slug = 'oaktown-testarossa'").get();
      if (!g) return 'no such game';
      const next = code.toString('utf8'), sha = (s) => createHash('sha256').update(String(s ?? '')).digest('hex');
      // the derby as it was published on 5 Oct (sha256 of its text, without the blank lines at either end)
      const WAS = 'e96a4a726414faa118c4c4a19fcb2401e3e7f531408bf2d0e475675e9eb42fc9';
      if (String(g.code ?? '').trim() === next.trim()) return 'already the Mog';
      if (sha(String(g.code ?? '').trim()) !== WAS) return 'left alone: its code has changed since 5 Oct';
      const add = JSON.parse(metaFile.toString('utf8'));
      let meta = g.meta;
      try { const m = JSON.parse(g.meta ?? 'null'); meta = JSON.stringify({ ...(m && typeof m === 'object' && !Array.isArray(m) ? m : {}), ...add }); } catch { meta = JSON.stringify(add); }
      db.prepare('UPDATE games SET code = ?, meta = ?, tagline = ?, blurb = ?, cover = COALESCE(?, cover), art_icon = COALESCE(?, art_icon), art_wide = COALESCE(?, art_wide) WHERE id = ?')
        .run(next, meta, add.tagline, add.blurb, file('oaktown-testarossa-cover.jpg'), file('oaktown-testarossa-icon.jpg'), file('oaktown-testarossa-wide.jpg'), g.id);
      return 'the Mog of Zcity (daylight Oaktown), new art';
    },
  },
  {
    // the owner, 6 Oct: Meme Kart, the first kart race and the kart kind's showcase, "Meme Kart starring Pepe.
    // featuring Doge, Shibu Inu & Bike Tyson": three laps of To The Moon, eight karts, contact never ends the run.
    // Published on the Mac by `npm run publish:world -- meme-kart`, which playtested it (60 fps, three laps, the
    // podium and a result); the key art is Pepe at the head of the pack under the start arch, shot on the Mac from
    // its own code with the platform's title. It races on the kart kit (lib/runtime/kart.js, kart-roster.js,
    // kart-items.js, and its score, kart-music.js), which only this release's code carries: on a build without it the
    // world would be served as an endless race (or race in silence), so it waits (unrecorded, tried again at the next
    // boot) until the kit is there
    id: '2026-10-07-meme-kart',
    run(db) {
      const code = file('meme-kart.js'), meta = file('meme-kart.meta.json');
      if (!code || !meta) return 'files missing';
      // (and its score, 8 Oct: lib/runtime/kart-score.js, which the runtime, the scores route and the page share)
      if (!['kart.js', 'kart-roster.js', 'kart-items.js', 'kart-music.js', 'kart-score.js', 'kart-guard.js'].every((f) => existsSync(join('lib', 'runtime', f)))) throw new Error('the kart kit (lib/runtime/kart.js) is not in this build');
      const m = JSON.parse(meta.toString('utf8')), cover = file('meme-kart-cover.jpg'), icon = file('meme-kart-icon.jpg'), wide = file('meme-kart-wide.jpg');
      const g = db.prepare("SELECT id FROM games WHERE slug = 'meme-kart'").get();
      if (g) {
        db.prepare('UPDATE games SET title = ?, tagline = ?, blurb = ?, code = ?, meta = ?, cover = ?, art_icon = ?, art_wide = ?, format = ? WHERE id = ?')
          .run(m.title, m.tagline, m.blurb, code.toString('utf8'), JSON.stringify(m.meta), cover, icon, wide, 'world', g.id);
        return 'updated';
      }
      db.prepare(`INSERT INTO games (id, slug, title, tagline, blurb, difficulty, spec, prompt, featured, created_at, format, code, meta, cover, art_icon, art_wide, parent_id, root_id, generation, mog_prompt)
        VALUES (?, 'meme-kart', ?, ?, ?, 'endless', '{}', ?, 0, ?, 'world', ?, ?, ?, ?, ?, NULL, NULL, 0, NULL)`)
        .run(m.id, m.title, m.tagline, m.blurb, 'first-party world: meme-kart', Date.now(), code.toString('utf8'), JSON.stringify(m.meta), cover, icon, wide);
      return 'published';
    },
  },
  {
    // the owner, 8 Oct: Meme Kart crashed while loading on their phone; the crowd's people were built and filmed on the
    // device at every load (six human packs, 96 images decoded, 22 people), so the crowd is now baked once into
    // picture sheets and the world loads those ("pre-bake the crowd ... the pre-baked goes on website for Mog and
    // general use"). Brings the live row up to the shipped world (code and meta: its perfect times and
    // fingerprints); art, plays and scores are kept
    id: '2026-10-08-meme-kart-prebaked',
    run(db) {
      const code = file('meme-kart.js'), meta = file('meme-kart.meta.json');
      if (!code || !meta) return 'files missing';
      if (!['kart.js', 'kart-roster.js', 'kart-items.js', 'kart-music.js', 'kart-score.js', 'kart-guard.js'].every((f) => existsSync(join('lib', 'runtime', f)))) throw new Error('the kart kit (lib/runtime/kart.js) is not in this build');
      const m = JSON.parse(meta.toString('utf8'));
      const g = db.prepare("SELECT id FROM games WHERE slug = 'meme-kart'").get();
      if (!g) return 'no meme-kart yet';
      db.prepare('UPDATE games SET blurb = ?, code = ?, meta = ? WHERE id = ?').run(m.blurb, code.toString('utf8'), JSON.stringify(m.meta), g.id);
      return 'updated';
    },
  },
  {
    // the owner, 8 Oct: "let's preserve the current NON pre-baked game setup ... with a separate and special URL i
    // won't publish or share but have access to play for myself ... it will be The Original", then "open it up ... it
    // should be open to anyone I share the link". The world exactly as it went live on 8 Oct (a10c246, the crowd built
    // and filmed at load), as an UNLISTED game at /g/meme-kart-original: hidden from every list, feed, Mog and board,
    // never indexed, but anyone with the link can play it (meta.unlisted; app/g/[slug]/page.tsx and play/route.ts)
    id: '2026-10-08-meme-kart-original',
    run(db) {
      const code = file('meme-kart-original.js'), meta = file('meme-kart.meta.json');
      if (!code || !meta) return 'files missing';
      if (!['kart.js', 'kart-roster.js', 'kart-items.js', 'kart-music.js', 'kart-score.js', 'kart-guard.js'].every((f) => existsSync(join('lib', 'runtime', f)))) throw new Error('the kart kit (lib/runtime/kart.js) is not in this build');
      if (db.prepare("SELECT id FROM games WHERE slug = 'meme-kart-original'").get()) return 'already there';
      const m = JSON.parse(meta.toString('utf8')), cover = file('meme-kart-cover.jpg'), icon = file('meme-kart-icon.jpg'), wide = file('meme-kart-wide.jpg');
      const title = 'Meme Kart: The Original';
      db.prepare(`INSERT INTO games (id, slug, title, tagline, blurb, difficulty, spec, prompt, featured, created_at, format, code, meta, cover, art_icon, art_wide, parent_id, root_id, generation, mog_prompt, hidden)
        VALUES (?, 'meme-kart-original', ?, ?, ?, 'endless', '{}', ?, 0, ?, 'world', ?, ?, ?, ?, ?, NULL, NULL, 0, NULL, 1)`)
        .run('28d5cacb-e063-4433-9279-79a78c45ceda', title, m.tagline, m.blurb, 'first-party world: meme-kart (the original, unlisted)', Date.now(), code.toString('utf8'), JSON.stringify({ ...m.meta, title, unlisted: true }), cover, icon, wide);
      return 'kept, unlisted';
    },
  },
  {
    // the owner's Fold 5, 8 Oct: Chrome for Android closed itself a few seconds into Meme Kart's load (Firefox ran it).
    // Read over USB: Android killed Chrome for memory, with the graphics memory at 8 GB, all of it while the world
    // painted its four noise textures (moss, moon dust, bank, bark): ~10,700 shapes each drawn through a canvas blur on
    // its own, which Chrome for Android paints on the graphics card, a layer each. Now drawn sharp and blurred once a
    // pass (worlds/meme-kart.js noiseTex): the same textures to the eye, and the score's constants unchanged
    id: '2026-10-08-meme-kart-noise',
    run(db) {
      const code = file('meme-kart.js'), meta = file('meme-kart.meta.json');
      if (!code || !meta) return 'files missing';
      if (!['kart.js', 'kart-roster.js', 'kart-items.js', 'kart-music.js', 'kart-score.js', 'kart-guard.js'].every((f) => existsSync(join('lib', 'runtime', f)))) throw new Error('the kart kit (lib/runtime/kart*.js) is missing: the world needs it');
      const m = JSON.parse(meta.toString('utf8'));
      const g = db.prepare("SELECT id FROM games WHERE slug = 'meme-kart'").get();
      if (!g) return 'no meme-kart yet';
      db.prepare('UPDATE games SET blurb = ?, code = ?, meta = ? WHERE id = ?').run(m.blurb, code.toString('utf8'), JSON.stringify(m.meta), g.id);
      return 'updated';
    },
  },
  {
    // 8 Oct, a Mog's score (the owner's "ok do #1 and #2"): a Mog of Meme Kart that races Meme Kart's track to the
    // centimetre scores against Meme Kart's measured perfect times, matched at publish by the track's signature (kart.js
    // kartTrackSig: the string the race gives in the browser and measure.mjs records; lib/kart-score.ts
    // publishedKartConstants). This adds that signature to the live rows' meta.kartScore and changes nothing else: no
    // perfect time, floor, cap or fingerprint, no score. It was worked out on the Mac with the node sim
    // (scripts/kart-score/sim.mjs, the same string headless Chrome gives) from the very code each row carries, so it is
    // added only to a row whose code is that code (sha256, without the blank lines at either end) and whose constants
    // were measured on that track (its lap, its laps); a row rebuilt since, or with another signature, is left alone
    id: '2026-10-09-meme-kart-track-sig',
    run(db) {
      const notes = [];
      for (const T of MEME_KART_TRACKS) {
        const g = db.prepare('SELECT id, code, meta FROM games WHERE slug = ?').get(T.slug);
        if (!g) { notes.push(`${T.slug}: no such game`); continue; }
        if (createHash('sha256').update(String(g.code ?? '').trim()).digest('hex') !== T.code) { notes.push(`${T.slug}: left alone (its code is not the one signed)`); continue; }
        let m = null;
        try { m = JSON.parse(g.meta ?? 'null'); } catch { m = null; }
        const C = m && typeof m === 'object' && !Array.isArray(m) ? m.kartScore : null;
        if (!C || typeof C !== 'object' || C.source !== 'measured' || C.laps !== T.laps || C.lap !== T.lap) { notes.push(`${T.slug}: left alone (no constants measured on this track)`); continue; }
        if (C.trackSig === T.sig) { notes.push(`${T.slug}: already signed`); continue; }
        if (C.trackSig != null) { notes.push(`${T.slug}: left alone (signed ${C.trackSig})`); continue; }
        const was = JSON.stringify(C);
        m.kartScore = { ...C, trackSig: T.sig };
        // (every other field as it was, in its order: the constants are not touched)
        const { trackSig: _t, ...rest } = m.kartScore;
        if (JSON.stringify(rest) !== was) throw new Error(`${T.slug}: the constants would change`);
        db.prepare('UPDATE games SET meta = ? WHERE id = ?').run(JSON.stringify(m), g.id);
        notes.push(`${T.slug}: signed ${T.sig}`);
      }
      return notes.join('; ');
    },
  },
  {
    // 9 Oct, the owner: "On a Mog of a game with its own soundtrack, the music choice starts on 'Original soundtrack
    // (Meme Kart theme)', with 'No music' and the library tracks as alternatives". The Mog page finds a game's own
    // soundtrack in its meta (meta.soundtrack); this writes it for the live games that have one (OWN_SOUNDTRACKS) and
    // changes nothing else: they play exactly as they did (a world without options plays its own music whatever its
    // meta says). Only to a row whose code is the code it was read from, built without options, with none yet; and only
    // these rows (Meme Kart: Midnight Mog, built with no music, is left as it is: the owner, "leave as is")
    id: '2026-10-09-own-soundtracks',
    run(db) {
      const notes = [];
      for (const S of OWN_SOUNDTRACKS) {
        const g = db.prepare('SELECT id, code, meta FROM games WHERE slug = ?').get(S.slug);
        if (!g) { notes.push(`${S.slug}: no such game`); continue; }
        if (createHash('sha256').update(String(g.code ?? '').trim()).digest('hex') !== S.code) { notes.push(`${S.slug}: left alone (its code is not the one read)`); continue; }
        let m = null;
        try { m = JSON.parse(g.meta ?? 'null'); } catch { m = null; }
        if (!m || typeof m !== 'object' || Array.isArray(m)) { notes.push(`${S.slug}: left alone (no meta)`); continue; }
        if (m.options !== undefined) { notes.push(`${S.slug}: left alone (built with options: it plays its creator's choice)`); continue; }
        if (JSON.stringify(m.soundtrack) === JSON.stringify(S.soundtrack)) { notes.push(`${S.slug}: already`); continue; }
        if (m.soundtrack != null) { notes.push(`${S.slug}: left alone (it has another)`); continue; }
        // (every other field as it was, in its order)
        db.prepare('UPDATE games SET meta = ? WHERE id = ?').run(JSON.stringify({ ...m, soundtrack: S.soundtrack }), g.id);
        notes.push(`${S.slug}: ${S.soundtrack.label}`);
      }
      return notes.join('; ');
    },
  },
  {
    // the owner, 9 Oct: Aspen GP, a first-party kart race in the snow (eight racers on snowmobiles, four laps), built so
    // it can be mogged once it is live: published on the Mac by `npm run publish:world -- aspen-gp` (its kart score
    // measured on its own track with its signature, its own soundtrack, meta.soundtrack, so its Mog page starts on the
    // original's music; playtested; art shot), its files written by scripts/.scratch/aspen/mog/ship.mts. Only inserted:
    // a row already at /g/aspen-gp is never overwritten (the same code: already there; another: left alone). It needs
    // this release's kart kit, the five racers it brings (kart-roster.js) and the sled; on a build without them it
    // waits (unrecorded, tried again at the next boot)
    id: '2026-10-09-aspen-gp',
    run(db) {
      const code = file('aspen-gp.js'), meta = file('aspen-gp.meta.json');
      // (not recorded without its files: written by ship.mts after the final assemble, they may come in a later deploy)
      if (!code || !meta) throw new Error('deploy/migrations/aspen-gp.js or aspen-gp.meta.json is not in this build');
      const kit = ['kart.js', 'kart-roster.js', 'kart-items.js', 'kart-music.js', 'kart-score.js', 'kart-guard.js'];
      if (!kit.every((f) => existsSync(join('lib', 'runtime', f)))) throw new Error('the kart kit (lib/runtime/kart*.js) is not in this build');
      const roster = readFileSync(join('lib', 'runtime', 'kart-roster.js'), 'utf8');
      if (!['whitewhale', 'lux', 'lordblackdiamond', 'whiteoutone', 'whiteouttwo'].every((id) => roster.includes(`'${id}'`)) || !/SnowSled/.test(roster)) throw new Error('the kart roster has no Aspen GP racers or sled in this build');
      const m = JSON.parse(meta.toString('utf8')), src = code.toString('utf8');
      const g = db.prepare("SELECT id, code FROM games WHERE slug = 'aspen-gp'").get();
      if (g) return String(g.code ?? '').trim() === src.trim() ? 'already there' : 'left alone (another aspen-gp)';
      if (db.prepare('SELECT id FROM games WHERE id = ?').get(m.id)) return 'left alone (its id is taken)';
      const cover = file('aspen-gp-cover.jpg'), icon = file('aspen-gp-icon.jpg'), wide = file('aspen-gp-wide.jpg');
      db.prepare(`INSERT INTO games (id, slug, title, tagline, blurb, difficulty, spec, prompt, featured, created_at, format, code, meta, cover, art_icon, art_wide, parent_id, root_id, generation, mog_prompt)
        VALUES (?, 'aspen-gp', ?, ?, ?, 'endless', '{}', ?, 0, ?, 'world', ?, ?, ?, ?, ?, NULL, NULL, 0, NULL)`)
        .run(m.id, m.title, m.tagline, m.blurb, 'first-party world: aspen-gp', Date.now(), src, JSON.stringify(m.meta), cover, icon, wide);
      return 'published';
    },
  },
  {
    // (9 Oct) the Qatar GP test Mog of Aspen GP shipped with the cover its build took, which looked at the back of its
    // start banner: mirrored. The runtime now gives a two-sided sign with words a readable back (lib/runtime/v1.js
    // signsBothWays), and this is its cover and key art retaken on that runtime by the platform's own playtest
    id: '2026-10-09-qatar-gp-cover',
    run(db) {
      const cover = file('qatar-gp-cover.jpg'), icon = file('qatar-gp-icon.jpg'), wide = file('qatar-gp-wide.jpg');
      if (!cover || !icon || !wide) throw new Error('deploy/migrations/qatar-gp-*.jpg are not in this build');
      const g = db.prepare("SELECT g.id FROM games g JOIN games p ON p.id = g.parent_id WHERE p.slug = 'aspen-gp' AND g.title = 'Qatar GP: Golden Dunes' ORDER BY g.created_at LIMIT 1").get();
      // (not recorded until the Mog is published: it runs again at the next boot)
      if (!g) throw new Error('Qatar GP: Golden Dunes is not published yet');
      db.prepare('UPDATE games SET cover = ?, art_icon = ?, art_wide = ? WHERE id = ?').run(cover, icon, wide, g.id);
      return 'cover retaken';
    },
  },
  {
    // the owner, 11 and 12 Oct: SHOOTOUT, one penalty in a night final, kicked again and again (tap to run up, aim,
    // hold the last tap and let go as the gold ring closes; then the keeper's guess and his reach decide), "I'll test
    // in production". The first world of its kind: a world that writes shootout: {...} among its own keys is served
    // the shootout runtime (lib/runtime/shootout*.js at v1.js's /*@include shootout.js*/; lib/custom-game.ts
    // isShootoutWorld), with the football moves and the recorded crowd from the asset library; its board is the goals
    // scored ('score'), and it cannot be mogged yet (lib/custom-game.ts canMog). Its files are worlds/shootout.{js,json}
    // as written, and its cover and key art were shot from the game in headless Chrome. Only inserted: a row already at
    // /g/shootout is never overwritten (the same code: already there; another: left alone). On a build without the
    // runtime, the hooks or the packs it waits (unrecorded, tried again at the next boot)
    id: '2026-10-12-shootout',
    run(db) {
      const code = file('shootout.js'), meta = file('shootout.meta.json');
      if (!code || !meta) throw new Error('deploy/migrations/shootout.js or shootout.meta.json is not in this build');
      const kit = ['shootout.js', 'shootout-sim.js', 'shootout-brain.js', 'shootout-goal.js', 'shootout-people.js', 'shootout-keeper.js', 'shootout-camera.js', 'shootout-audio.js', 'shootout-hud.js'];
      if (!kit.every((f) => existsSync(join('lib', 'runtime', f)))) throw new Error('the shootout runtime (lib/runtime/shootout*.js) is not in this build');
      if (!readFileSync(join('lib', 'runtime', 'v1.js'), 'utf8').includes('/*@include shootout.js*/')) throw new Error('the runtime has no shootout hooks in this build');
      const packs = ['human-moves-football-male', 'human-moves-football-female', 'audio-crowd-shootout'];
      if (!packs.every((p) => existsSync(join('public', 'assets', p, 'asset.json')))) throw new Error('the football moves or the shootout crowd (public/assets) are not in this build');
      let lib = null;
      try { lib = JSON.parse(readFileSync(join('public', 'assets', 'library.json'), 'utf8')); } catch { lib = null; }
      if (!lib || !packs.every((p) => lib.assets && lib.assets[p])) throw new Error('the asset library does not list the football moves and the shootout crowd in this build');
      const m = JSON.parse(meta.toString('utf8')), src = code.toString('utf8');
      if (!m.meta || m.meta.mode !== 'shootout' || m.meta.scoring !== 'score') throw new Error('shootout.meta.json is not a shootout scored by its goals');
      const g = db.prepare("SELECT id, code FROM games WHERE slug = 'shootout'").get();
      if (g) return String(g.code ?? '').trim() === src.trim() ? 'already there' : 'left alone (another shootout)';
      if (db.prepare('SELECT id FROM games WHERE id = ?').get(m.id)) return 'left alone (its id is taken)';
      const cover = file('shootout-cover.jpg'), icon = file('shootout-icon.jpg'), wide = file('shootout-wide.jpg');
      db.prepare(`INSERT INTO games (id, slug, title, tagline, blurb, difficulty, spec, prompt, featured, created_at, format, code, meta, cover, art_icon, art_wide, parent_id, root_id, generation, mog_prompt)
        VALUES (?, 'shootout', ?, ?, ?, 'endless', '{}', ?, 0, ?, 'world', ?, ?, ?, ?, ?, NULL, NULL, 0, NULL)`)
        .run(m.id, m.title, m.tagline, m.blurb, 'first-party world: shootout', Date.now(), src, JSON.stringify(m.meta), cover, icon, wide);
      return 'published';
    },
  },
  {
    // the owner, 18 Oct: ARTIFICIAL1., a first-party Grand Prix (the sixth kind of world, gp: {...}; lib/runtime/gp*.js behind
    // the /*@gp*/ hooks): twenty AI agents, three laps of Port Artificial at night, the WHY. V-07 for you with Muse at the
    // wheel. Published on the Mac by `npm run publish:world -- artificial1` (static check, the Chrome playtest's Grand Prix
    // drive: a lap of the race to its result, its replay, the frame's cost; cover and key art shot on the start/finish
    // straight) and written by scripts/.scratch/a1pub/ship.mts. It is ranked on the time board (the fastest finished race
    // first), it cannot be mogged yet (lib/custom-game.ts canMog) and no Create or Mog build makes one. Only inserted: a row
    // already at /g/artificial1 is never overwritten (the same code: already there; another: left alone). On a build without
    // the Grand Prix runtime, its hooks, its car, its engine pack or its textures it waits (unrecorded, tried again at the
    // next boot)
    id: '2026-10-18-artificial1',
    run(db) {
      const code = file('artificial1.js'), meta = file('artificial1.meta.json');
      if (!code || !meta) throw new Error('deploy/migrations/artificial1.js or artificial1.meta.json is not in this build');
      const kit = ['gp.js', 'gp-track.js', 'gp-sim.js', 'gp-ai.js', 'gp-race.js', 'gp-cam.js', 'gp-hud.js', 'gp-director.js', 'gp-intro.js', 'gp-audio.js'];
      if (!kit.every((f) => existsSync(join('lib', 'runtime', f)))) throw new Error('the Grand Prix runtime (lib/runtime/gp*.js) is not in this build');
      if (!readFileSync(join('lib', 'runtime', 'v1.js'), 'utf8').includes('/*@include gp.js*/')) throw new Error('the runtime has no Grand Prix hooks in this build');
      const packs = ['model-why-v07', 'audio-a1-engine-v4', 'texture-asphalt-clean', 'texture-asphalt-pit-lane', 'texture-facade-night-brown', 'texture-facade-night-grey', 'texture-facade-night-office'];
      if (!packs.every((p) => existsSync(join('public', 'assets', p, 'asset.json')))) throw new Error('the car, the engine pack or the night textures (public/assets) are not in this build');
      let lib = null;
      try { lib = JSON.parse(readFileSync(join('public', 'assets', 'library.json'), 'utf8')); } catch { lib = null; }
      if (!lib || !packs.every((p) => lib.assets && lib.assets[p])) throw new Error('the asset library does not list the car, the engine pack and the night textures in this build');
      const m = JSON.parse(meta.toString('utf8')), src = code.toString('utf8');
      if (!m.meta || m.meta.mode !== 'gp' || m.meta.scoring !== 'time') throw new Error('artificial1.meta.json is not a Grand Prix ranked by its race time');
      const g = db.prepare("SELECT id, code FROM games WHERE slug = 'artificial1'").get();
      if (g) return String(g.code ?? '').trim() === src.trim() ? 'already there' : 'left alone (another artificial1)';
      if (db.prepare('SELECT id FROM games WHERE id = ?').get(m.id)) return 'left alone (its id is taken)';
      const cover = file('artificial1-cover.jpg'), icon = file('artificial1-icon.jpg'), wide = file('artificial1-wide.jpg');
      if (!cover || !icon || !wide) throw new Error('deploy/migrations/artificial1-{cover,icon,wide}.jpg are not in this build');
      db.prepare(`INSERT INTO games (id, slug, title, tagline, blurb, difficulty, spec, prompt, featured, created_at, format, code, meta, cover, art_icon, art_wide, parent_id, root_id, generation, mog_prompt)
        VALUES (?, 'artificial1', ?, ?, ?, 'endless', '{}', ?, 0, ?, 'world', ?, ?, ?, ?, ?, NULL, NULL, 0, NULL)`)
        .run(m.id, m.title, m.tagline, m.blurb, 'first-party world: artificial1', Date.now(), src, JSON.stringify(m.meta), cover, icon, wide);
      return 'published';
    },
  },
  {
    // the owner, 18 Oct: MOGATRON, a first-party kart race of eight lightbikes through the neon tunnels of Voltline
    // Circuit (three laps, hazards on, no item weapons), written by a cloud build from the owner's brief and published
    // on the Mac by `npm run publish:world -- mogatron` (its kart score measured on its own track, its soundtrack read
    // from its definition, the Chrome playtest passed, cover and key art shot), its files written by
    // scripts/.scratch/mogpub/ship.mts. Only inserted: a row already at /g/mogatron is never overwritten (the same code:
    // already there; another: left alone). On a build without the kart kit or its soundtrack it waits (unrecorded,
    // tried again at the next boot)
    id: '2026-10-18-mogatron',
    run(db) {
      const code = file('mogatron.js'), meta = file('mogatron.meta.json');
      if (!code || !meta) throw new Error('deploy/migrations/mogatron.js or mogatron.meta.json is not in this build');
      const kit = ['kart.js', 'kart-roster.js', 'kart-items.js', 'kart-music.js', 'kart-score.js', 'kart-guard.js'];
      if (!kit.every((f) => existsSync(join('lib', 'runtime', f)))) throw new Error('the kart kit (lib/runtime/kart*.js) is not in this build');
      if (!existsSync(join('public', 'assets', 'music-vengeance-electro', 'asset.json'))) throw new Error('the soundtrack (music-vengeance-electro) is not in this build');
      const m = JSON.parse(meta.toString('utf8')), src = code.toString('utf8');
      if (!m.meta || m.meta.mode !== 'kart' || m.meta.scoring !== 'score' || m.meta.kartScore?.source !== 'measured') throw new Error('mogatron.meta.json is not a kart race with its score measured on its track');
      const g = db.prepare("SELECT id, code FROM games WHERE slug = 'mogatron'").get();
      if (g) return String(g.code ?? '').trim() === src.trim() ? 'already there' : 'left alone (another mogatron)';
      if (db.prepare('SELECT id FROM games WHERE id = ?').get(m.id)) return 'left alone (its id is taken)';
      const cover = file('mogatron-cover.jpg'), icon = file('mogatron-icon.jpg'), wide = file('mogatron-wide.jpg');
      if (!cover || !icon || !wide) throw new Error('deploy/migrations/mogatron-{cover,icon,wide}.jpg are not in this build');
      db.prepare(`INSERT INTO games (id, slug, title, tagline, blurb, difficulty, spec, prompt, featured, created_at, format, code, meta, cover, art_icon, art_wide, parent_id, root_id, generation, mog_prompt)
        VALUES (?, 'mogatron', ?, ?, ?, 'endless', '{}', ?, 0, ?, 'world', ?, ?, ?, ?, ?, NULL, NULL, 0, NULL)`)
        .run(m.id, m.title, m.tagline, m.blurb, 'first-party world: mogatron', Date.now(), src, JSON.stringify(m.meta), cover, icon, wide);
      return 'published';
    },
  },
  {
    // the owner, 18 Oct, of WONDERWAKE: Skywhale Rally (build 94, a creator's kart race on a flying whale): its whale was
    // never on screen and its light was pale and flat. A postmortem in Chrome found why and repaired only this world's
    // module: the sky drawn without a second gamma, the sun's direction set in build (the runtime keeps the first one),
    // the environment light at 0.5 and bloom only over 2; the escort whales placed on their orbit at build (the corridor
    // guard had hidden all six at the origin) and six times larger, a curved tail and flukes over the horizon, the breach
    // out past the lawn and the head and eye 18 m higher; the start banner's title fitted to its canvas; Pip's head, ears
    // and ringed tail closer to the creator's picture. The track and its score constants are unchanged. Only the code this
    // repairs is replaced: if the creator has rebuilt it since, it is left as it is
    id: '2026-10-18-wonderwake-repair',
    run(db) {
      const code = file('wonderwake-skywhale-rally.js');
      if (!code) throw new Error('deploy/migrations/wonderwake-skywhale-rally.js is not in this build');
      const g = db.prepare("SELECT id, code, meta FROM games WHERE slug = 'wonderwake-skywhale-rally'").get();
      if (!g) return 'no such game';
      const next = code.toString('utf8'), sha = (s) => createHash('sha256').update(String(s ?? '')).digest('hex');
      // the published code, as it was on 18 Oct (sha256 of its text, without the blank lines at either end)
      const WAS = '9b3f64c0402bafd9e761fe25b7fd191bc5a0cca31f8181aef4420e1372ddce0a';
      if (g.code === next) return 'already repaired';
      if (sha(String(g.code ?? '').trim()) !== WAS) return 'left alone: its code has changed since 18 Oct, so this repair no longer fits it';
      // the test record follows the code it describes (lib/test-drive.ts codeHash), and the cover is now of this code
      let meta = g.meta, hash = '';
      try {
        const m = JSON.parse(g.meta ?? 'null');
        if (m && m.test && typeof m.test === 'object') { hash = sha(next).slice(0, 16); m.test = { ...m.test, codeHash: hash, cover: 'current' }; meta = JSON.stringify(m); }
      } catch { meta = g.meta; }
      db.prepare('UPDATE games SET code = ?, meta = ?, cover = COALESCE(?, cover), art_icon = COALESCE(?, art_icon), art_wide = COALESCE(?, art_wide) WHERE id = ?')
        .run(next, meta, file('wonderwake-skywhale-rally-cover.jpg'), file('wonderwake-skywhale-rally-icon.jpg'), file('wonderwake-skywhale-rally-wide.jpg'), g.id);
      return `repaired (${hash ? 'test codeHash ' + hash : 'no test record'})`;
    },
  },
  {
    // the owner, 18 Oct, after the repair above went live: its tail's two flukes, twisted ellipsoids, read as a propeller
    // on the horizon, and its cover and key art were still of the old world. Now one crescent fluke with its notch, face
    // on to the track, and art shot by the playtest from this code. Only the repaired code is replaced
    id: '2026-10-18-wonderwake-fluke-art',
    run(db) {
      const code = file('wonderwake-skywhale-rally-v2.js');
      if (!code) throw new Error('deploy/migrations/wonderwake-skywhale-rally-v2.js is not in this build');
      const g = db.prepare("SELECT id, code, meta FROM games WHERE slug = 'wonderwake-skywhale-rally'").get();
      if (!g) return 'no such game';
      const next = code.toString('utf8'), sha = (s) => createHash('sha256').update(String(s ?? '')).digest('hex');
      // the code 2026-10-18-wonderwake-repair put live (sha256 of its text, without the blank lines at either end)
      const WAS = '014cdabe5c571bfa86fb689f19d0ce201b73b75269e92fdd419ba91e93f86386';
      if (g.code === next) return 'already done';
      if (sha(String(g.code ?? '').trim()) !== WAS) return 'left alone: its code is not the repaired code';
      let meta = g.meta, hash = '';
      try {
        const m = JSON.parse(g.meta ?? 'null');
        if (m && m.test && typeof m.test === 'object') { hash = sha(next).slice(0, 16); m.test = { ...m.test, codeHash: hash, cover: 'current' }; meta = JSON.stringify(m); }
      } catch { meta = g.meta; }
      db.prepare('UPDATE games SET code = ?, meta = ?, cover = COALESCE(?, cover), art_icon = COALESCE(?, art_icon), art_wide = COALESCE(?, art_wide) WHERE id = ?')
        .run(next, meta, file('wonderwake-skywhale-rally-v2-cover.jpg'), file('wonderwake-skywhale-rally-v2-icon.jpg'), file('wonderwake-skywhale-rally-v2-wide.jpg'), g.id);
      return `new fluke and art (${hash ? 'test codeHash ' + hash : 'no test record'})`;
    },
  },
  {
    // the owner, 20 Oct, of MAGMA CROWN (a creator's kart race up an erupting volcano, built with Create): parts of it,
    // the lava, its thumbnail and B-Hot were overexposed. Measured in Chrome, one change at a time at seven points of the
    // lap: its bloom (strength 0.85 over 1) was the largest cause, and its lava walls and lake were painted in bright
    // orange and yellow, lit by the sun as paint and then glowing at 2.2 to 2.4 on top, so the tone curve took them to a
    // pink white. Now the golden preset's own bloom (0.5 over 1.1), the lava and the lake dark crust with the same
    // picture glowing at 1.25 to 1.3, the road's cracks at 1 and its kerbs at 1.6, and B-Hot's skin, cream and ivory a
    // step darker (filmed from the front, as its icon is, they went past white in the low sun); its lights, track and the
    // rivals as they were, with cover and key art shot from this code. Only the code this repairs is replaced: if the creator has rebuilt it since, it is left as it is
    id: '2026-10-20-magma-crown-light',
    run(db) {
      const code = file('magma-crown.js');
      if (!code) throw new Error('deploy/migrations/magma-crown.js is not in this build');
      const g = db.prepare("SELECT id, code, meta FROM games WHERE slug = 'magma-crown'").get();
      if (!g) return 'no such game';
      const next = code.toString('utf8'), sha = (s) => createHash('sha256').update(String(s ?? '')).digest('hex');
      // the published code, as it was on 20 Oct (sha256 of its text, without the blank lines at either end)
      const WAS = '2fa60cc73240a90ddb992d7c3e273ab27b158c97f32b6fc4ad33622d3bfa67d8';
      if (g.code === next) return 'already relit';
      if (sha(String(g.code ?? '').trim()) !== WAS) return 'left alone: its code has changed since 20 Oct, so this repair no longer fits it';
      // the test record follows the code it describes (lib/test-drive.ts codeHash), and the cover is now of this code
      let meta = g.meta, hash = '';
      try {
        const m = JSON.parse(g.meta ?? 'null');
        if (m && m.test && typeof m.test === 'object') { hash = sha(next).slice(0, 16); m.test = { ...m.test, codeHash: hash, cover: 'current' }; meta = JSON.stringify(m); }
      } catch { meta = g.meta; }
      db.prepare('UPDATE games SET code = ?, meta = ?, cover = COALESCE(?, cover), art_icon = COALESCE(?, art_icon), art_wide = COALESCE(?, art_wide) WHERE id = ?')
        .run(next, meta, file('magma-crown-cover.jpg'), file('magma-crown-icon.jpg'), file('magma-crown-wide.jpg'), g.id);
      return `relit (${hash ? 'test codeHash ' + hash : 'no test record'})`;
    },
  },
  {
    // the owner, 20 Oct, after the relight above: "still seeing overexposure everywhere, needs more polishing": the side
    // glow, the podium, the distant mountains ("all look the same and like tee pees") and the lava ("doesn't look real or
    // flowing"). Now the kerbs, wall tops and tunnel strips are dark rails with a glowing core (about 1, not pale paint
    // glowing at 1.6 to 3); the bloom only on what is truly hot (0.45 over 1.35); the sunset photograph a step down; the
    // sun, sky light, crater light and the light that rides with the camera a step down. The lava is drawn: a flow that
    // moves, dark crust plates over it with glowing edges, cooler banks and hot spots, emissive only, on the channels and
    // the crater lakes. The forty copies of one cone on the horizon are three ranges of jagged ridges (nearer darker,
    // the far one in the haze) and two volcanoes with lava running down them. Only the code the relight put live is
    // replaced
    id: '2026-10-20-magma-crown-polish',
    run(db) {
      const code = file('magma-crown-v2.js');
      if (!code) throw new Error('deploy/migrations/magma-crown-v2.js is not in this build');
      const g = db.prepare("SELECT id, code, meta FROM games WHERE slug = 'magma-crown'").get();
      if (!g) return 'no such game';
      const next = code.toString('utf8'), sha = (s) => createHash('sha256').update(String(s ?? '')).digest('hex');
      // the code 2026-10-20-magma-crown-light put live (sha256 of its text, without the blank lines at either end)
      const WAS = '805cb7cd90da527537fbb7eb6a911d9c59b06c2017c116b9fde410639ec2dcd5';
      if (g.code === next) return 'already polished';
      if (sha(String(g.code ?? '').trim()) !== WAS) return 'left alone: its code is not the relit code';
      let meta = g.meta, hash = '';
      try {
        const m = JSON.parse(g.meta ?? 'null');
        if (m && m.test && typeof m.test === 'object') { hash = sha(next).slice(0, 16); m.test = { ...m.test, codeHash: hash, cover: 'current' }; meta = JSON.stringify(m); }
      } catch { meta = g.meta; }
      db.prepare('UPDATE games SET code = ?, meta = ?, cover = COALESCE(?, cover), art_icon = COALESCE(?, art_icon), art_wide = COALESCE(?, art_wide) WHERE id = ?')
        .run(next, meta, file('magma-crown-v2-cover.jpg'), file('magma-crown-v2-icon.jpg'), file('magma-crown-v2-wide.jpg'), g.id);
      return `polished (${hash ? 'test codeHash ' + hash : 'no test record'})`;
    },
  },
  {
    // Magma Crown, race pass (the owner, 20 Oct: "competition seems lacking ... Aspen GP seems much more challenging ...
    // lava flow needs to be more dramatic, course more chaotic, competitors more challenging, and let's do 4 laps not 3.
    // last lap should be insanely fun!"; and "B-hot kart is too basic"). The same runtime as Aspen GP; the difference
    // was the course: 4 laps, the degen class, the void gap that dropped karts into the trench closed, five lava
    // rivers to jump, three more ramps, rollers, a rail, meteor showers and boulder crossings, and a final lap that
    // turns the mountain red. B-Hot rides a new armoured night-racer. Its score constants are measured on this code
    // (scripts/kart-score/measure.mjs, 4 laps); runs already on the board keep the score they earned on 3 laps.
    id: '2026-10-20-magma-crown-race',
    run(db) {
      const code = file('magma-crown-v3.js');
      if (!code) throw new Error('deploy/migrations/magma-crown-v3.js is not in this build');
      const g = db.prepare("SELECT id, code, meta FROM games WHERE slug = 'magma-crown'").get();
      if (!g) return 'no such game';
      const next = code.toString('utf8'), sha = (s) => createHash('sha256').update(String(s ?? '')).digest('hex');
      // the code 2026-10-20-magma-crown-polish put live (sha256 of its text, without the blank lines at either end)
      const WAS = '77ec926a42b7f4ba146297b2c6f55ac80aa5daf123346c50b7e1d6817e058522';
      if (g.code === next) return 'already raced';
      if (sha(String(g.code ?? '').trim()) !== WAS) return 'left alone: its code is not the polished code';
      const KART = {"version":1,"source":"measured","tStar":{"pepe":115.789,"doge":117.217,"shiba":116.755,"bike":117.169,"bull":114.367,"bear":114.433,"whale":114.905,"mooncat":116.702},"tFloor":{"pepe":99.237,"doge":100.748,"shiba":100.239,"bike":100.748,"bull":97.77,"bear":97.77,"whale":98.254,"mooncat":100.239},"karts":8,"laps":4,"gmCap":174,"gmMax":246,"hitsCap":30,"hitsMax":64,"lap":1496.3,"trackSig":"5065a07514360483","physics":"e92b00755e19","world":"5e9d28dc32cb","at":"2026-10-20T17:10:26.579Z"};
      let meta = g.meta, hash = '';
      try {
        const m = JSON.parse(g.meta ?? 'null');
        if (m && typeof m === 'object' && !Array.isArray(m)) {
          m.kartScore = KART;
          if (m.test && typeof m.test === 'object') { hash = sha(next).slice(0, 16); m.test = { ...m.test, codeHash: hash, cover: 'current' }; }
          meta = JSON.stringify(m);
        }
      } catch { meta = g.meta; }
      db.prepare('UPDATE games SET code = ?, meta = ?, cover = COALESCE(?, cover), art_icon = COALESCE(?, art_icon), art_wide = COALESCE(?, art_wide) WHERE id = ?')
        .run(next, meta, file('magma-crown-v3-cover.jpg'), file('magma-crown-v3-icon.jpg'), file('magma-crown-v3-wide.jpg'), g.id);
      return `raced: 4 laps (${hash ? 'test codeHash ' + hash : 'no test record'})`;
    },
  },
  {
    // Magma Crown, the ground under the road (the owner, 20 Oct: "players are still falling into the game", a kart on
    // the right shoulder buried to its shell). The world's terrain is a 4.4 m grid; on the climbs and tight bends a
    // cell took a corner from the hillside or another stretch of road and stood up to 2.7 m over the drivable
    // corridor, in 13 places a lap. Now every corner of a cell the corridor crosses is held 0.6 m under the road there;
    // checked every 2 m of the lap at every metre across: no point of the terrain over the road. The track, its score
    // constants and the art are unchanged.
    id: '2026-10-20-magma-crown-ground',
    run(db) {
      const code = file('magma-crown-v4.js');
      if (!code) throw new Error('deploy/migrations/magma-crown-v4.js is not in this build');
      const g = db.prepare("SELECT id, code, meta FROM games WHERE slug = 'magma-crown'").get();
      if (!g) return 'no such game';
      const next = code.toString('utf8'), sha = (s) => createHash('sha256').update(String(s ?? '')).digest('hex');
      // the code 2026-10-20-magma-crown-race put live (sha256 of its text, without the blank lines at either end)
      const WAS = '421fbe722248e72e344461bb46f5a28265f9a9aabb6646ff2efa45f8199adb62';
      if (g.code === next) return 'already grounded';
      if (sha(String(g.code ?? '').trim()) !== WAS) return 'left alone: its code is not the race code';
      let meta = g.meta, hash = '';
      try {
        const m = JSON.parse(g.meta ?? 'null');
        if (m && m.test && typeof m.test === 'object') { hash = sha(next).slice(0, 16); m.test = { ...m.test, codeHash: hash }; meta = JSON.stringify(m); }
      } catch { meta = g.meta; }
      db.prepare('UPDATE games SET code = ?, meta = ? WHERE id = ?').run(next, meta, g.id);
      return `grounded (${hash ? 'test codeHash ' + hash : 'no test record'})`;
    },
  },
  {
    // Magma Crown, flat across (the owner, 20 Oct: "still feel below, review again"; and "H-bot car is missing a back
    // fender wing"). The kart kit stands a kart at the road's centre-line height wherever it is across the road
    // (kart.js, k.ground), but this track's points banked its far side up to 22 degrees and the road and ground were
    // drawn tilted: on the raised side they stood up to 4.5 m over a kart, along 626-740 m and 824-1090 m of the lap.
    // The banks are gone (the track's signature, lap and score constants are unchanged: the kit never read them);
    // checked every 2 m at every metre across at the kit's own height: nothing drawn over a kart. B-Hot's night-racer
    // has a rear wing, and the cover and key art are of it.
    id: '2026-10-20-magma-crown-flat',
    run(db) {
      const code = file('magma-crown-v5.js');
      if (!code) throw new Error('deploy/migrations/magma-crown-v5.js is not in this build');
      const g = db.prepare("SELECT id, code, meta FROM games WHERE slug = 'magma-crown'").get();
      if (!g) return 'no such game';
      const next = code.toString('utf8'), sha = (s) => createHash('sha256').update(String(s ?? '')).digest('hex');
      // the code 2026-10-20-magma-crown-ground put live (sha256 of its text, without the blank lines at either end)
      const WAS = 'f6d9cbdb573da94de020b05b166255d597e747453b988a715456897a2f90b8ea';
      if (g.code === next) return 'already flat';
      if (sha(String(g.code ?? '').trim()) !== WAS) return 'left alone: its code is not the grounded code';
      let meta = g.meta, hash = '';
      try {
        const m = JSON.parse(g.meta ?? 'null');
        if (m && m.test && typeof m.test === 'object') { hash = sha(next).slice(0, 16); m.test = { ...m.test, codeHash: hash, cover: 'current' }; meta = JSON.stringify(m); }
      } catch { meta = g.meta; }
      db.prepare('UPDATE games SET code = ?, meta = ?, cover = COALESCE(?, cover), art_icon = COALESCE(?, art_icon), art_wide = COALESCE(?, art_wide) WHERE id = ?')
        .run(next, meta, file('magma-crown-v5-cover.jpg'), file('magma-crown-v5-icon.jpg'), file('magma-crown-v5-wide.jpg'), g.id);
      return `flat (${hash ? 'test codeHash ' + hash : 'no test record'})`;
    },
  },
  {
    // the owner, 21 Oct: ARTIFICIAL1. "more futuristic, higher contrast and feel like the future of agentic racing", the race
    // starting in the cockpit (pass 1): the cockpit the start camera, a higher-contrast night grade, neon lines along every
    // barrier, and light trails behind the agents' cars (gp.trails, lib/runtime/gp.js). Only the code this updates is
    // replaced: if it has changed since 18 Oct, it is left as it is; the key art stays (the same straight, the same night)
    id: '2026-10-21-artificial1-look',
    run(db) {
      const code = file('artificial1-v2.js');
      if (!code) throw new Error('deploy/migrations/artificial1-v2.js is not in this build');
      const g = db.prepare("SELECT id, code, meta FROM games WHERE slug = 'artificial1'").get();
      if (!g) return 'no such game';
      const next = code.toString('utf8'), sha = (s) => createHash('sha256').update(String(s ?? '')).digest('hex');
      // the code 2026-10-18-artificial1 put live (sha256 of its text, without the blank lines at either end)
      const WAS = 'db60f056a144493175b33ab134966a563d49d9d8bd015ed5ae7fa0d481517de2';
      if (g.code === next) return 'already there';
      if (sha(String(g.code ?? '').trim()) !== WAS) return 'left alone: its code has changed since 18 Oct';
      let meta = g.meta, hash = '';
      try {
        const m = JSON.parse(g.meta ?? 'null');
        if (m && m.test && typeof m.test === 'object') { hash = sha(next).slice(0, 16); m.test = { ...m.test, codeHash: hash }; meta = JSON.stringify(m); }
      } catch { meta = g.meta; }
      db.prepare('UPDATE games SET code = ?, meta = ? WHERE id = ?').run(next, meta, g.id);
      return `updated (${hash ? 'test codeHash ' + hash : 'no test record'})`;
    },
  },
  {
    // Artificial1 look pass 2: the futuristic city (neon up the towers, holographic agent billboards, searchlights over the stands)
    id: '2026-10-21-artificial1-city',
    run(db) {
      const code = file('artificial1-v3.js');
      if (!code) throw new Error('deploy/migrations/artificial1-v3.js is not in this build');
      const g = db.prepare("SELECT id, code, meta FROM games WHERE slug = 'artificial1'").get();
      if (!g) return 'no such game';
      const next = code.toString('utf8'), sha = (s) => createHash('sha256').update(String(s ?? '')).digest('hex');
      // the code 2026-10-21-artificial1-look put live (sha256 of its text, without the blank lines at either end)
      const WAS = '449cefe320a85dd382832df6033c8e14e79776bb13ece12d2abb347978c2f142';
      if (g.code === next) return 'already there';
      if (sha(String(g.code ?? '').trim()) !== WAS) return 'left alone: its code has changed since look pass 1';
      let meta = g.meta, hash = '';
      try {
        const m = JSON.parse(g.meta ?? 'null');
        if (m && m.test && typeof m.test === 'object') { hash = sha(next).slice(0, 16); m.test = { ...m.test, codeHash: hash }; meta = JSON.stringify(m); }
      } catch { meta = g.meta; }
      db.prepare('UPDATE games SET code = ?, meta = ? WHERE id = ?').run(next, meta, g.id);
      return `updated (${hash ? 'test codeHash ' + hash : 'no test record'})`;
    },
  },
  {
    // Artificial1 made moggable (21 Oct): the same world, its scenery and agents parts moved out unchanged into the runtime
    // map port-artificial (lib/runtime/maps/port-artificial.js), so its module is about 43 KB and a Mog can rewrite it
    id: '2026-10-21-artificial1-kit',
    run(db) {
      const code = file('artificial1-v4.js');
      if (!code) throw new Error('deploy/migrations/artificial1-v4.js is not in this build');
      const g = db.prepare("SELECT id, code, meta FROM games WHERE slug = 'artificial1'").get();
      if (!g) return 'no such game';
      const next = code.toString('utf8'), sha = (s) => createHash('sha256').update(String(s ?? '')).digest('hex');
      // the code 2026-10-21-artificial1-city put live (sha256 of its text, without the blank lines at either end)
      const WAS = 'ff5ffc5e4f6736d7f77b86e95971f2f8571225dbf623bd34667cf4f076244d50';
      if (g.code === next) return 'already there';
      if (sha(String(g.code ?? '').trim()) !== WAS) return 'left alone: its code has changed since look pass 2';
      let meta = g.meta, hash = '';
      try {
        const m = JSON.parse(g.meta ?? 'null');
        if (m && m.test && typeof m.test === 'object') { hash = sha(next).slice(0, 16); m.test = { ...m.test, codeHash: hash }; meta = JSON.stringify(m); }
      } catch { meta = g.meta; }
      db.prepare('UPDATE games SET code = ?, meta = ? WHERE id = ?').run(next, meta, g.id);
      return `updated (${hash ? 'test codeHash ' + hash : 'no test record'})`;
    },
  },
  {
    // the owner, 21 Oct: SUPERINTELLIGENCE SPRINT, a first-party Grand Prix by day on a 2.27 km street lap round the city
    // map's midtown blocks, five laps, the twenty agents racing as a pack round the player (gp.pack), with grandstands,
    // crowds and the teams' boards; published on the Mac by `npm run publish:world -- superintelligence-sprint` (the
    // Chrome playtest passed, cover and key art shot) and its row written out here. Only inserted: a row already at
    // /g/superintelligence-sprint is never overwritten. On a build without the Grand Prix kit's pack, the city map or its
    // assets it waits (unrecorded, tried again at the next boot)
    id: '2026-10-21-superintelligence-sprint',
    run(db) {
      const code = file('superintelligence-sprint.js'), meta = file('superintelligence-sprint.meta.json');
      if (!code || !meta) throw new Error('deploy/migrations/superintelligence-sprint.js or its meta.json is not in this build');
      if (!readFileSync(join('lib', 'runtime', 'gp-ai.js'), 'utf8').includes('PK = o.pack')) throw new Error('the Grand Prix kit has no pack in this build');
      if (!['city.js', 'port-artificial.js'].every((f) => existsSync(join('lib', 'runtime', 'maps', f)))) throw new Error('the city or port-artificial map is not in this build');
      const packs = ['city-midtown', 'model-why-v07', 'audio-a1-engine-v4', 'sky-partly-cloudy', 'texture-asphalt-clean', 'texture-concrete'];
      if (!packs.every((p) => existsSync(join('public', 'assets', p, 'asset.json')))) throw new Error('the city, the car, the engine pack, the sky or the surfaces (public/assets) are not in this build');
      const m = JSON.parse(meta.toString('utf8')), src = code.toString('utf8');
      if (!m.meta || m.meta.mode !== 'gp' || m.meta.scoring !== 'time') throw new Error('superintelligence-sprint.meta.json is not a Grand Prix ranked by its race time');
      const g = db.prepare("SELECT id, code FROM games WHERE slug = 'superintelligence-sprint'").get();
      if (g) return String(g.code ?? '').trim() === src.trim() ? 'already there' : 'left alone (another superintelligence-sprint)';
      if (db.prepare('SELECT id FROM games WHERE id = ?').get(m.id)) return 'left alone (its id is taken)';
      const cover = file('superintelligence-sprint-cover.jpg'), icon = file('superintelligence-sprint-icon.jpg'), wide = file('superintelligence-sprint-wide.jpg');
      if (!cover || !icon || !wide) throw new Error('deploy/migrations/superintelligence-sprint-{cover,icon,wide}.jpg are not in this build');
      db.prepare(`INSERT INTO games (id, slug, title, tagline, blurb, difficulty, spec, prompt, featured, created_at, format, code, meta, cover, art_icon, art_wide, parent_id, root_id, generation, mog_prompt)
        VALUES (?, 'superintelligence-sprint', ?, ?, ?, 'endless', '{}', ?, 0, ?, 'world', ?, ?, ?, ?, ?, NULL, NULL, 0, NULL)`)
        .run(m.id, m.title, m.tagline, m.blurb, 'first-party world: superintelligence-sprint', Date.now(), src, JSON.stringify(m.meta), cover, icon, wide);
      return 'published';
    },
  },
  {
    // the owner, 21 Oct: INVISIBLE WORLD, a first-party kart race on a road of rainbow glass over a sea of clouds: eight of
    // the owner's 3D Invisible Friends on cloud karts, three laps that each enter a new phase of the dream, the Daybreak
    // cliff, the Skyfall's three cliffs and Big Air; published on the Mac by `npm run publish:world -- invisible-world`
    // (its kart score measured on its own track, its soundtrack read from its definition, the Chrome playtest passed,
    // cover and key art shot) and its row written out here. Only inserted: a row already at /g/invisible-world is never
    // overwritten. On a build without the kart kit's engine level (kart.fx.engine) and its Claw fix (a kart that fell
    // at a wall gap past a break was set down at NaN), or without its soundtrack, it waits (unrecorded, tried again at
    // the next boot)
    id: '2026-10-21-invisible-world',
    run(db) {
      const code = file('invisible-world.js'), meta = file('invisible-world.meta.json');
      if (!code || !meta) throw new Error('deploy/migrations/invisible-world.js or its meta.json is not in this build');
      const kart = readFileSync(join('lib', 'runtime', 'kart.js'), 'utf8');
      if (!kart.includes('FX.engine') || !kart.includes('G.d0 + G.len')) throw new Error('the kart kit has no engine level or Claw fix in this build');
      if (!existsSync(join('public', 'assets', 'music-slampe', 'asset.json'))) throw new Error('the soundtrack (music-slampe) is not in this build');
      const m = JSON.parse(meta.toString('utf8')), src = code.toString('utf8');
      if (!m.meta || m.meta.mode !== 'kart' || m.meta.scoring !== 'score' || m.meta.kartScore?.source !== 'measured') throw new Error('invisible-world.meta.json is not a kart race with its score measured on its track');
      const g = db.prepare("SELECT id, code FROM games WHERE slug = 'invisible-world'").get();
      if (g) return String(g.code ?? '').trim() === src.trim() ? 'already there' : 'left alone (another invisible-world)';
      if (db.prepare('SELECT id FROM games WHERE id = ?').get(m.id)) return 'left alone (its id is taken)';
      const cover = file('invisible-world-cover.jpg'), icon = file('invisible-world-icon.jpg'), wide = file('invisible-world-wide.jpg');
      if (!cover || !icon || !wide) throw new Error('deploy/migrations/invisible-world-{cover,icon,wide}.jpg are not in this build');
      db.prepare(`INSERT INTO games (id, slug, title, tagline, blurb, difficulty, spec, prompt, featured, created_at, format, code, meta, cover, art_icon, art_wide, parent_id, root_id, generation, mog_prompt)
        VALUES (?, 'invisible-world', ?, ?, ?, 'endless', '{}', ?, 0, ?, 'world', ?, ?, ?, ?, ?, NULL, NULL, 0, NULL)`)
        .run(m.id, m.title, m.tagline, m.blurb, 'first-party world: invisible-world', Date.now(), src, JSON.stringify(m.meta), cover, icon, wide);
      return 'published';
    },
  },
  {
    // the owner, 21 Oct: INVISIBLE WORLD's thumbnail, the frame the owner chose (Slime #2211 head-on in the Deep Dream,
    // lap 2) with the race's HUD cropped away: the key art (wide and icon, the platform's title over it) and the plain
    // cover. Only the first-party row (its id) is changed; on a build without the pictures it waits
    id: '2026-10-21-invisible-world-art',
    run(db) {
      const meta = file('invisible-world.meta.json'), cover = file('invisible-world-cover.jpg'), icon = file('invisible-world-icon.jpg'), wide = file('invisible-world-wide.jpg');
      if (!meta || !cover || !icon || !wide) throw new Error('deploy/migrations/invisible-world-{cover,icon,wide}.jpg or its meta.json are not in this build');
      const id = JSON.parse(meta.toString('utf8')).id;
      const g = db.prepare("SELECT id FROM games WHERE slug = 'invisible-world' AND id = ?").get(id);
      if (!g) throw new Error('INVISIBLE WORLD is not published yet');
      db.prepare('UPDATE games SET cover = ?, art_icon = ?, art_wide = ? WHERE id = ?').run(cover, icon, wide, id);
      return 'updated';
    },
  },
  {
    // the owner, 21 Oct: INVISIBLE WORLD's thumbnail shot again with the kart as it now is (the white cloud, the fat
    // cloud tyres): the same head-on angle in the Deep Dream, the owner's pick of two (the pictures above, replaced)
    id: '2026-10-21-invisible-world-art-2',
    run(db) {
      const meta = file('invisible-world.meta.json'), cover = file('invisible-world-cover.jpg'), icon = file('invisible-world-icon.jpg'), wide = file('invisible-world-wide.jpg');
      if (!meta || !cover || !icon || !wide) throw new Error('deploy/migrations/invisible-world-{cover,icon,wide}.jpg or its meta.json are not in this build');
      const id = JSON.parse(meta.toString('utf8')).id;
      const g = db.prepare("SELECT id FROM games WHERE slug = 'invisible-world' AND id = ?").get(id);
      if (!g) throw new Error('INVISIBLE WORLD is not published yet');
      db.prepare('UPDATE games SET cover = ?, art_icon = ?, art_wide = ? WHERE id = ?').run(cover, icon, wide, id);
      return 'updated';
    },
  },
  {
    // the owner, 21 Oct: ARTIFICIAL1's thumbnail "a cockpit city night glassmorphism view": from the cockpit at night,
    // the neon-lined towers and searchlights over Port Artificial, an agent's car ahead on the racing line and the
    // race's glass tags and speed pane in the air (the HUD's flat panels left out). Shot from the code
    // 2026-10-21-artificial1-kit put live; if it has changed since, its pictures are left as they are
    id: '2026-10-21-artificial1-cockpit-art',
    run(db) {
      const code = file('artificial1-v4.js'), cover = file('artificial1-cockpit-cover.jpg'), icon = file('artificial1-cockpit-icon.jpg'), wide = file('artificial1-cockpit-wide.jpg');
      if (!code || !cover || !icon || !wide) throw new Error('deploy/migrations/artificial1-v4.js or artificial1-cockpit-{cover,icon,wide}.jpg are not in this build');
      const g = db.prepare("SELECT id, code FROM games WHERE slug = 'artificial1'").get();
      if (!g) return 'no such game';
      if (String(g.code ?? '').trim() !== code.toString('utf8').trim()) return 'left alone: its code has changed since the kit';
      db.prepare('UPDATE games SET cover = ?, art_icon = ?, art_wide = ? WHERE id = ?').run(cover, icon, wide, g.id);
      return 'updated';
    },
  },
  {
    // the owner, 21 Oct: MAGMA CROWN's thumbnail, "a semi side view of B-Hot": B-Hot on the night-racer from three
    // quarters to its side, the cracked lava road and the low sun behind. Shot from the code 2026-10-20-magma-crown-flat
    // put live; if the creator has rebuilt it since, its pictures are left as they are
    id: '2026-10-21-magma-crown-side-art',
    run(db) {
      const code = file('magma-crown-v5.js'), cover = file('magma-crown-side-cover.jpg'), icon = file('magma-crown-side-icon.jpg'), wide = file('magma-crown-side-wide.jpg');
      if (!code || !cover || !icon || !wide) throw new Error('deploy/migrations/magma-crown-v5.js or magma-crown-side-{cover,icon,wide}.jpg are not in this build');
      const g = db.prepare("SELECT id, code FROM games WHERE slug = 'magma-crown'").get();
      if (!g) return 'no such game';
      if (String(g.code ?? '').trim() !== code.toString('utf8').trim()) return 'left alone: its code is not the flat code';
      db.prepare('UPDATE games SET cover = ?, art_icon = ?, art_wide = ? WHERE id = ?').run(cover, icon, wide, g.id);
      return 'updated';
    },
  },
  {
    // the owner, 3 Nov: Mog City made moggable (MogCity .scratch/moggable/PLAN.md 4.7): the first-party Mog City episode at
    // /g/mog-city, holding Mog City's default story pack (lib/episode/default.json) as its world module, so the city plays
    // in its frame from mc.gamemog.com and an episode Mog has its parent. Deployed dark: the row is playable, and its Mog
    // stays closed until EPISODE_MOGS=on (lib/custom-game.ts MOGGABLE). Only inserted: a row already at /g/mog-city is
    // never overwritten. On a build without the episode kind or its story route it waits (unrecorded, tried at the next boot)
    id: '2026-11-03-mog-city',
    run(db) {
      const code = file('mog-city.js'), meta = file('mog-city.meta.json');
      if (!code || !meta) throw new Error('deploy/migrations/mog-city.js or its meta.json is not in this build');
      if (!existsSync(join('lib', 'episode.ts')) || !existsSync(join('lib', 'episode', 'schema.js')) || !existsSync(join('app', 'g', '[slug]', 'story.json', 'route.ts'))) throw new Error('the episode kind or its story route is not in this build');
      const m = JSON.parse(meta.toString('utf8')), src = code.toString('utf8');
      if (!m.meta || m.meta.mode !== 'episode' || m.meta.scoring !== 'none') throw new Error('mog-city.meta.json is not an episode without a board');
      if (!/^GameMog\.world\(\{ episode: \{/.test(src)) throw new Error('deploy/migrations/mog-city.js is not an episode module');
      const g = db.prepare("SELECT id, code FROM games WHERE slug = 'mog-city'").get();
      if (g) return String(g.code ?? '').trim() === src.trim() ? 'already there' : 'left alone (another mog-city)';
      if (db.prepare('SELECT id FROM games WHERE id = ?').get(m.id)) return 'left alone (its id is taken)';
      const cover = file('mog-city-cover.jpg'), icon = file('mog-city-icon.jpg'), wide = file('mog-city-wide.jpg');
      if (!cover || !icon || !wide) throw new Error('deploy/migrations/mog-city-{cover,icon,wide}.jpg are not in this build');
      db.prepare(`INSERT INTO games (id, slug, title, tagline, blurb, difficulty, spec, prompt, featured, created_at, format, code, meta, cover, art_icon, art_wide, parent_id, root_id, generation, mog_prompt)
        VALUES (?, 'mog-city', ?, ?, ?, 'endless', '{}', ?, 0, ?, 'world', ?, ?, ?, ?, ?, NULL, NULL, 0, NULL)`)
        .run(m.id, m.title, m.tagline, m.blurb, 'first-party world: mog-city', Date.now(), src, JSON.stringify(m.meta), cover, icon, wide);
      return 'published';
    },
  },
  {
    // 4 Nov: Mallow: The Lantern Sea (a creator's build, no parent) published with no cover and no key art: its one test
    // drive never reported (meta.test: unverified, cover none), so /g/<slug>/cover served the route's palette card, an
    // empty sky and sea. These were shot on the Mac from its own code by the platform's server playtest
    // (lib/playtest-runtime.ts playtestWorld: passed, 60 fps). Only the empty columns are filled, and only on the code
    // they were shot from (codeHash aad04cc5e4ccb808): a cover the game has since got is never replaced
    id: '2026-11-04-mallow-cover',
    run(db) {
      const cover = file('mallow-the-lantern-sea-cover.jpg'), icon = file('mallow-the-lantern-sea-icon.jpg'), wide = file('mallow-the-lantern-sea-wide.jpg');
      if (!cover || !icon || !wide) throw new Error('deploy/migrations/mallow-the-lantern-sea-{cover,icon,wide}.jpg are not in this build');
      const g = db.prepare("SELECT id, code, cover, art_wide FROM games WHERE id = 'bc676b38-450e-4120-bcfa-50f1b9a32d9a' AND slug = 'mallow-the-lantern-sea'").get();
      if (!g) return 'no such game';
      if (createHash('sha256').update(String(g.code ?? '')).digest('hex').slice(0, 16) !== 'aad04cc5e4ccb808') return 'left alone: its code is not the code the pictures show';
      if (g.cover && g.art_wide) return 'already has a cover';
      db.prepare('UPDATE games SET cover = COALESCE(cover, ?), art_icon = COALESCE(art_icon, ?), art_wide = COALESCE(art_wide, ?) WHERE id = ?').run(cover, icon, wide, g.id);
      db.prepare("UPDATE games SET meta = json_set(meta, '$.test.cover', 'current') WHERE id = ? AND json_extract(meta, '$.test.cover') = 'none'").run(g.id);
      return 'cover restored';
    },
  },
  {
    // (the owner, 4 Nov: "Dognapped = unlisted": the Mog City episode stays playable for anyone with its link, but
    // leaves every list, feed, Mog and board (hidden = 1 with meta.unlisted, lib/db.ts))
    id: '2026-11-04-unlist-dognapped',
    run(db) {
      const g = db.prepare("SELECT id, hidden, meta FROM games WHERE slug = 'mog-city-dognapped-for-christmas'").get();
      if (!g) return 'no such game';
      db.prepare("UPDATE games SET hidden = 1, meta = json_set(COALESCE(meta, '{}'), '$.unlisted', json('true')) WHERE id = ?").run(g.id);
      return 'unlisted';
    },
  },
  {
    // 4 Nov: the first portraits (33, framed head and shoulders from 18 degrees). Superseded the next day by the headshots
    // (2026-11-05-hero-headshots), which replace them; on a database that has not had it, it only adds the column
    id: '2026-11-04-hero-avatars',
    run(db) {
      const has = db.prepare('PRAGMA table_info(games)').all().some((c) => c.name === 'art_avatar');
      if (!has) db.exec('ALTER TABLE games ADD COLUMN art_avatar BLOB');
      return 'superseded by 2026-11-05-hero-headshots';
    },
  },
  {
    // 5 Nov, the owner: "portraits are not centered, and main character need to be looking straight into camera like a
    // headshot or instagram photo". The headshots (AVATARS above) replace the 4 Nov portraits: a game's portrait is set
    // where it has none or still has the very 4 Nov one (OLD_AVATARS, by its bytes), and only on the code it was shot
    // from; a 4 Nov portrait with no headshot to replace it is cleared, so that game shows its cover's square. A
    // portrait a game's own build shot since is never touched
    id: '2026-11-05-hero-headshots',
    run(db) {
      const has = db.prepare('PRAGMA table_info(games)').all().some((c) => c.name === 'art_avatar');
      if (!has) db.exec('ALTER TABLE games ADD COLUMN art_avatar BLOB');
      const missing = AVATARS.filter((a) => !file(`${a.slug}-avatar.jpg`)).map((a) => a.slug);
      if (missing.length) throw new Error(`deploy/migrations/{${missing.join(',')}}-avatar.jpg are not in this build`);
      const sha = (b) => (b ? createHash('sha256').update(Buffer.from(b)).digest('hex').slice(0, 16) : null);
      const old = new Map(OLD_AVATARS.map((o) => [o.slug, o.sha]));
      let n = 0, cleared = 0;
      const left = [];
      for (const a of AVATARS) {
        const g = db.prepare('SELECT id, code, art_avatar FROM games WHERE id = ? AND slug = ?').get(a.id, a.slug);
        if (!g) { left.push(`${a.slug} (gone)`); continue; }
        if (createHash('sha256').update(String(g.code ?? '')).digest('hex').slice(0, 16) !== a.code) { left.push(`${a.slug} (its code changed)`); continue; }
        if (g.art_avatar && sha(g.art_avatar) !== old.get(a.slug)) { left.push(`${a.slug} (its own portrait)`); continue; }
        n += Number(db.prepare('UPDATE games SET art_avatar = ? WHERE id = ?').run(file(`${a.slug}-avatar.jpg`), g.id).changes);
      }
      // (the 4 Nov portraits of these three creatures already face the camera, centred: kept until a build shoots a
      // headshot, so the homepage's Up-and-Coming bubble keeps Mallow's face instead of a cover square)
      const kept = new Set([...AVATARS.map((a) => a.slug), 'mallow-the-lantern-sea', 'lantern-hour-moon-whale-midway', 'ruse-cloudquake-carnival']);
      for (const o of OLD_AVATARS) {
        if (kept.has(o.slug)) continue;
        const g = db.prepare('SELECT id, art_avatar FROM games WHERE slug = ?').get(o.slug);
        if (g && g.art_avatar && sha(g.art_avatar) === o.sha) cleared += Number(db.prepare('UPDATE games SET art_avatar = NULL WHERE id = ?').run(g.id).changes);
      }
      return `${n} of ${AVATARS.length} headshots; ${cleared} of the 4 Nov portraits cleared${left.length ? `; left alone: ${left.join(', ')}` : ''}`;
    },
  },
  {
    // 5 Nov: the three creatures' centred headshots (CREATURE_HEADSHOTS above)
    id: '2026-11-05-creature-headshots',
    run(db) {
      const missing = CREATURE_HEADSHOTS.filter((a) => !file(`${a.slug}-avatar.jpg`)).map((a) => a.slug);
      if (missing.length) throw new Error(`deploy/migrations/{${missing.join(',')}}-avatar.jpg are not in this build`);
      const sha = (b) => (b ? createHash('sha256').update(Buffer.from(b)).digest('hex').slice(0, 16) : null);
      let n = 0;
      const left = [];
      for (const a of CREATURE_HEADSHOTS) {
        const g = db.prepare('SELECT id, code, art_avatar FROM games WHERE id = ? AND slug = ?').get(a.id, a.slug);
        if (!g) { left.push(`${a.slug} (gone)`); continue; }
        if (createHash('sha256').update(String(g.code ?? '')).digest('hex').slice(0, 16) !== a.code) { left.push(`${a.slug} (its code changed)`); continue; }
        if (sha(g.art_avatar) !== a.old) { left.push(`${a.slug} (not its 4 Nov portrait)`); continue; }
        n += Number(db.prepare('UPDATE games SET art_avatar = ? WHERE id = ?').run(file(`${a.slug}-avatar.jpg`), g.id).changes);
      }
      return `${n} of ${CREATURE_HEADSHOTS.length} headshots${left.length ? `; left alone: ${left.join(', ')}` : ''}`;
    },
  },
  {
    // 5 Nov: the owner's first live story world was signed "Mt. Browser" (the creator-name field took a browser autofill,
    // now off): no name, so the page says "By a GameMog creator" until the owner gives one
    id: '2026-11-05-velvet-run-creator',
    run(db) {
      // (a fresh disk's database has no creator column until the app's first start, lib/db.ts: nothing to clear there)
      if (!columns(db, 'games').has('creator')) return 'no creator column yet: nothing to clear';
      const r = db.prepare("UPDATE games SET creator = NULL WHERE slug = 'the-velvet-run' AND creator = 'Mt. Browser'").run();
      return r.changes ? 'cleared' : 'nothing to clear';
    },
  },
  {
    // 5 Nov, the owner: "make the Mog of Mog City live" with the Story Kit Mog. /g/mog-city stays the 3 Nov episode and
    // plays exactly as before; its Mog is a story Mog of Mog City's OWN story world (lib/storykit-mogcity.ts), published
    // here as scripts/storykit-own-world.ts does on a dev database: the gated pack (storykit/packs/mog-city.json on Mog
    // City's engine, gated { own: true }; the record deploy/migrations/mog-city-story.json, `npm run check` holds it
    // current) written to the Story Kit store beside this database (data/storykit) as a store draft, sealed and kept with
    // the game; the game a story world (format 'world', meta mode 'storykit') HIDDEN, so it has no public page and is in
    // no list, feed, search, sitemap or board (a Mog and the composer read it by meta.storykit.ownOf, the episode's id).
    // Its people are Mog City's shipped models and every line one of its recordings: no files of its own. Once only: a
    // world already linked to the episode is left as it is, an own world from the dev script is linked and hidden. It
    // waits (unrecorded, tried at the next boot) while the Story Kit is off on this server or /g/mog-city is not there
    id: '2026-11-05-mog-city-own-story',
    async: true,
    async run(db, path) {
      if (!['on', 'owner'].includes(String(process.env.STORYKIT ?? '').trim().toLowerCase())) throw new Error('waiting: the Story Kit is off on this server (STORYKIT)');
      const rec = file('mog-city-story.json');
      if (!rec) throw new Error('deploy/migrations/mog-city-story.json is not in this build');
      const own = JSON.parse(rec.toString('utf8'));
      if (own.v !== 1 || !own.pack || own.pack.storykit !== 2 || own.meta?.mode !== 'storykit' || own.meta.storykit?.own !== true) throw new Error('mog-city-story.json is not Mog City\'s own story world');
      const ep = db.prepare("SELECT id, code, cover, art_icon, art_wide FROM games WHERE slug = 'mog-city'").get();
      if (!ep || !/^\s*GameMog\s*\.\s*world\s*\(\s*\{\s*episode\s*:\s*\{/.test(String(ep.code ?? ''))) throw new Error('waiting: /g/mog-city (the episode) is not in this database');
      const owns = db.prepare("SELECT id, slug, hidden, meta FROM games WHERE json_extract(meta, '$.mode') = 'storykit' AND json_extract(meta, '$.storykit.own') = 1").all();
      const linked = owns.find((g) => JSON.parse(g.meta).storykit?.ownOf === ep.id);
      if (linked) return `already there: /g/${linked.slug} (hidden ${linked.hidden})`;
      const dev = owns.find((g) => g.slug === own.slug && JSON.parse(g.meta).storykit?.packId === own.pack.id);
      if (dev) {
        db.prepare("UPDATE games SET hidden = 1, meta = json_set(meta, '$.storykit.ownOf', ?) WHERE id = ?").run(ep.id, dev.id);
        return `linked the existing /g/${dev.slug} to /g/mog-city, hidden`;
      }
      if (db.prepare('SELECT 1 FROM games WHERE slug = ?').get(own.slug)) return `left alone: /g/${own.slug} is another game`;
      // (a fresh disk's database has no creator column until the app's first start: added here as lib/db.ts adds it, which
      // then finds it there; every other column is written only if this database has it)
      if (!columns(db, 'games').has('creator')) db.exec('ALTER TABLE games ADD COLUMN creator TEXT');
      const cols = columns(db, 'games');
      // (the Story Kit store, lib/storykit-store.ts, beside this database: data/gamemog.db -> data/storykit)
      const { StoryStore } = await storykit();
      const s = new StoryStore(join(dirname(resolve(path)), 'storykit'));
      const packJson = JSON.stringify(own.pack), code = `GameMog.world({ storykit: ${packJson} });\n`;
      const storeId = randomUUID(), gameId = randomUUID(), t = Date.now();
      s.db.prepare('INSERT INTO drafts (id, token_hash, pack, parent, created_at, touched_at) VALUES (?, ?, ?, NULL, ?, ?)')
        .run(storeId, createHash('sha256').update(randomBytes(24)).digest('hex'), packJson, t, t);
      try {
        const sealed = s.seal(s.db.prepare('SELECT * FROM drafts WHERE id = ?').get(storeId));
        if (!sealed.ok) throw new Error(`the store refused the world: ${sealed.error}`);
        const meta = { ...own.meta, storykit: { ...own.meta.storykit, pack: storeId, ownOf: ep.id, world: sealed.hash } };
        const row = { id: gameId, slug: own.slug, title: own.meta.title, tagline: own.meta.tagline, blurb: own.meta.blurb, difficulty: 'endless', spec: '{}',
          prompt: 'Mog City\'s own story', featured: 0, created_at: t, format: 'world', code, meta: JSON.stringify(meta),
          cover: ep.cover ?? null, art_icon: ep.art_icon ?? null, art_wide: ep.art_wide ?? null, parent_id: null, root_id: null, generation: 0, mog_prompt: null,
          hidden: 1, creator: 'Mog City' };
        const keys = Object.keys(row).filter((k) => cols.has(k));
        if (!keys.includes('hidden')) throw new Error('the games table has no hidden column');
        db.prepare(`INSERT INTO games (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`).run(...keys.map((k) => row[k]));
        if (!s.keep(storeId, gameId)) throw new Error('the store could not keep the world');
        return `published /g/${own.slug} hidden (store draft ${storeId}, world ${sealed.hash.slice(0, 12)}), linked to /g/mog-city`;
      } catch (e) {
        // (the games row is rolled back with the transaction; the store draft goes with it)
        try { const d = s.db.prepare('SELECT * FROM drafts WHERE id = ?').get(storeId); if (d) { s.release(storeId); s.abandon(d); } } catch { /* swept later */ }
        throw e;
      }
    },
  },
  {
    // 6 Nov: every listed world's headshot on the light-blue sky (SKY_HEADSHOTS above); replaces the portrait of a game
    // whose code is still the code it was shot from. A world whose old portrait was a square of its car or a scene
    // behind the hero and that has no sky headshot keeps no portrait, so it shows the headshot card on the same sky
    id: '2026-11-06-sky-headshots',
    run(db) {
      const has = db.prepare('PRAGMA table_info(games)').all().some((c) => c.name === 'art_avatar');
      if (!has) db.exec('ALTER TABLE games ADD COLUMN art_avatar BLOB');
      const missing = SKY_HEADSHOTS.filter((a) => !file(`${a.slug}-sky.jpg`)).map((a) => a.slug);
      if (missing.length) throw new Error(`deploy/migrations/{${missing.join(',')}}-sky.jpg are not in this build`);
      let n = 0;
      const left = [];
      for (const a of SKY_HEADSHOTS) {
        const g = db.prepare('SELECT id, code FROM games WHERE id = ? AND slug = ?').get(a.id, a.slug);
        if (!g) { left.push(`${a.slug} (gone)`); continue; }
        if (createHash('sha256').update(String(g.code ?? '')).digest('hex').slice(0, 16) !== a.code) { left.push(`${a.slug} (its code changed)`); continue; }
        n += Number(db.prepare('UPDATE games SET art_avatar = ? WHERE id = ?').run(file(`${a.slug}-sky.jpg`), g.id).changes);
      }
      // (the 5 Nov headshots with no sky one to replace them: cleared, so the card on the sky shows, not the old scene)
      const sky = new Set(SKY_HEADSHOTS.map((a) => a.slug));
      const sha = (b) => (b ? createHash('sha256').update(Buffer.from(b)).digest('hex').slice(0, 16) : null);
      let cleared = 0;
      for (const a of [...AVATARS, ...CREATURE_HEADSHOTS]) {
        if (sky.has(a.slug)) continue;
        const shipped = file(`${a.slug}-avatar.jpg`), g = db.prepare('SELECT id, art_avatar FROM games WHERE id = ? AND slug = ?').get(a.id, a.slug);
        if (g && g.art_avatar && shipped && sha(g.art_avatar) === sha(shipped)) cleared += Number(db.prepare('UPDATE games SET art_avatar = NULL WHERE id = ?').run(g.id).changes);
      }
      return `${n} of ${SKY_HEADSHOTS.length} sky headshots; ${cleared} old headshots cleared${left.length ? `; left alone: ${left.join(', ')}` : ''}`;
    },
  },
  {
    // 6 Nov, round 2: the headshots the first pass missed (SKY_HEADSHOTS_2 above), where a game still has none
    id: '2026-11-06-sky-headshots-2',
    run(db) {
      const missing = SKY_HEADSHOTS_2.filter((a) => !file(`${a.slug}-sky.jpg`)).map((a) => a.slug);
      if (missing.length) throw new Error(`deploy/migrations/{${missing.join(',')}}-sky.jpg are not in this build`);
      let n = 0;
      const left = [];
      for (const a of SKY_HEADSHOTS_2) {
        const g = db.prepare('SELECT id, code, art_avatar FROM games WHERE id = ? AND slug = ?').get(a.id, a.slug);
        if (!g) { left.push(`${a.slug} (not here)`); continue; }
        if (createHash('sha256').update(String(g.code ?? '')).digest('hex').slice(0, 16) !== a.code) { left.push(`${a.slug} (its code changed)`); continue; }
        if (g.art_avatar) { left.push(`${a.slug} (has its own)`); continue; }
        n += Number(db.prepare('UPDATE games SET art_avatar = ? WHERE id = ? AND art_avatar IS NULL').run(file(`${a.slug}-sky.jpg`), g.id).changes);
      }
      return `${n} of ${SKY_HEADSHOTS_2.length} headshots${left.length ? `; left alone: ${left.join(', ')}` : ''}`;
    },
  },
  {
    // 7 Nov, the owner: Pickup Time, GameMog's first showcase story world (15 missions on Mog City's engine, the owner's
    // story), published PUBLIC at /g/pickup-time as a first-party world. Its record, deploy/migrations/pickup-time-story.json
    // (scripts/storykit-showcase.ts --export; `npm run check` holds it current), names the gated pack (a showcase,
    // gated { showcase: true }, which the store's open never passes, so the store draft is written here as
    // 2026-11-05-mog-city-own-story writes Mog City's), the game's meta and every file of the world by its SHA-256: the
    // nine hand-built bodies (the cast registry's GLBs in this build, public/storykit/cast/hand), its 910 voice clips
    // (deploy/migrations/pickup-time/voice) and the sealed world (deploy/migrations/pickup-time/world.json). A file
    // whose bytes are not the record's is refused and nothing is written. The files go into the Story Kit store beside
    // this database as a kept draft (never swept), served at /storykit/f/<sha256>.<ext> like every story world's; the
    // game gets its cover, key art and John's headshot (the homepage's Jump in). Once only: a showcase already there
    // (meta.storykit.packId) is left alone, so is another game at /g/pickup-time or with its id. It waits (unrecorded,
    // tried at the next boot) while the Story Kit is off on this server or the store has no room for it
    id: '2026-11-07-pickup-time',
    async: true,
    async run(db, path) {
      if (!['on', 'owner'].includes(String(process.env.STORYKIT ?? '').trim().toLowerCase())) throw new Error('waiting: the Story Kit is off on this server (STORYKIT)');
      const rec = file('pickup-time-story.json'), worldBytes = file('pickup-time/world.json');
      if (!rec || !worldBytes) throw new Error('deploy/migrations/pickup-time-story.json or pickup-time/world.json is not in this build');
      const R = JSON.parse(rec.toString('utf8'));
      if (R.v !== 1 || R.slug !== 'pickup-time' || R.pack?.id !== 'pickup-time' || R.pack.storykit !== 2 || R.meta?.mode !== 'storykit' || R.meta.storykit?.showcase !== true || !Array.isArray(R.files)) throw new Error('pickup-time-story.json is not the Pickup Time showcase');
      const sha = (b) => createHash('sha256').update(b).digest('hex');
      const had = db.prepare("SELECT slug, hidden FROM games WHERE json_extract(meta, '$.mode') = 'storykit' AND json_extract(meta, '$.storykit.packId') = 'pickup-time' AND json_extract(meta, '$.storykit.showcase') = 1").get();
      if (had) return `already there: /g/${had.slug} (hidden ${had.hidden})`;
      if (db.prepare('SELECT 1 FROM games WHERE slug = ?').get(R.slug)) return `left alone: /g/${R.slug} is another game`;
      if (db.prepare('SELECT 1 FROM games WHERE id = ?').get(R.id)) return 'left alone: its id is taken';
      const cover = file('pickup-time-cover.jpg'), icon = file('pickup-time-icon.jpg'), wide = file('pickup-time-wide.jpg'), avatar = file('pickup-time-sky.jpg');
      if (!cover || !icon || !wide || !avatar) throw new Error('deploy/migrations/pickup-time-{cover,icon,wide,sky}.jpg are not in this build');

      // every file, read and checked against the record before anything is written
      if (sha(worldBytes) !== R.world?.hash || worldBytes.length !== R.world.bytes) throw new Error('pickup-time/world.json is not the record\'s world');
      const SRC = /^(public\/storykit\/cast\/hand\/[a-z0-9-]+\.glb|deploy\/migrations\/pickup-time\/voice\/[0-9a-f]{8}-[0-9a-f]{8}\.ogg)$/;
      const blobs = new Map([[R.world.hash, { ext: 'json', bytes: worldBytes }]]);
      for (const f of R.files) {
        if (!['glb', 'voice'].includes(f.kind) || !SRC.test(String(f.src)) || !/^[0-9a-f]{64}$/.test(f.hash) || f.ext !== (f.kind === 'glb' ? 'glb' : 'ogg')) throw new Error(`pickup-time-story.json: a bad file (${f.kind} ${f.name})`);
        if (!existsSync(f.src)) throw new Error(`${f.src} is not in this build`);
        const b = readFileSync(f.src);
        if (sha(b) !== f.hash || b.length !== f.bytes) throw new Error(`${f.src} is not the file the world names (its SHA-256 differs)`);
        if (f.kind === 'glb' ? b.readUInt32LE(0) !== 0x46546c67 : b.subarray(0, 4).toString('latin1') !== 'OggS') throw new Error(`${f.src} is not a ${f.kind === 'glb' ? 'GLB' : 'Ogg file'}`);
        blobs.set(f.hash, { ext: f.ext, bytes: b });
      }
      const named = new Set(R.files.map((f) => f.hash));
      for (const m of worldBytes.toString('utf8').matchAll(/\/storykit\/f\/([0-9a-f]{64})\.([a-z]{3,4})/g)) if (!named.has(m[1])) throw new Error(`the world names /storykit/f/${m[1]}.${m[2]}, which the record does not hold`);

      // (a fresh disk's database may lack the columns the app adds at its first start: added here as lib/db.ts adds them)
      if (!columns(db, 'games').has('art_avatar')) db.exec('ALTER TABLE games ADD COLUMN art_avatar BLOB');
      const cols = columns(db, 'games');
      if (!cols.has('hidden')) throw new Error('the games table has no hidden column');
      const { StoryStore, LIMITS } = await storykit();
      const s = new StoryStore(join(dirname(resolve(path)), 'storykit'));
      const fresh = [...blobs].filter(([h]) => !s.db.prepare('SELECT 1 FROM blobs WHERE hash = ?').get(h));
      const need = fresh.reduce((n, [, b]) => n + b.bytes.length, 0);
      if (s.used() + need > LIMITS.disk) throw new Error(`waiting: the Story Kit store has no room for Pickup Time (${need} bytes more than ${s.used()} used of ${LIMITS.disk})`);

      const storeId = randomUUID(), t = Date.now();
      for (const [h, b] of fresh) {
        const p = s.blobPath(h, b.ext);
        if (existsSync(p) && sha(readFileSync(p)) === h) continue;
        mkdirSync(dirname(p), { recursive: true });
        const tmp = `${p}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
        writeFileSync(tmp, b.bytes); renameSync(tmp, p);
      }
      s.db.exec('BEGIN');
      try {
        const blob = s.db.prepare('INSERT OR IGNORE INTO blobs (hash, ext, bytes, at) VALUES (?, ?, ?, ?)');
        for (const [h, b] of blobs) blob.run(h, b.ext, b.bytes.length, t);
        s.db.prepare("INSERT INTO drafts (id, token_hash, pack, parent, state, created_at, touched_at) VALUES (?, ?, ?, NULL, 'draft', ?, ?)")
          .run(storeId, sha(randomBytes(24)), JSON.stringify(R.pack), t, t);
        const row = s.db.prepare('INSERT INTO files (draft_id, kind, name, hash, ext, bytes, meta, inherited, at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)');
        for (const f of R.files) row.run(storeId, f.kind, f.name, f.hash, f.ext, f.bytes, f.meta ? JSON.stringify(f.meta) : null, t);
        row.run(storeId, 'pack', 'world.json', R.world.hash, 'json', R.world.bytes, null, t);
        s.db.exec('COMMIT');
      } catch (e) { s.db.exec('ROLLBACK'); throw e; }
      try {
        const meta = { ...R.meta, storykit: { ...R.meta.storykit, pack: storeId, world: R.world.hash } };
        const code = `GameMog.world({ storykit: ${JSON.stringify(R.pack)} });\n`;
        const g = { id: R.id, slug: R.slug, title: R.meta.title, tagline: R.meta.tagline, blurb: R.meta.blurb, difficulty: 'endless', spec: '{}',
          prompt: 'first-party world: pickup-time', featured: 0, created_at: t, format: 'world', code, meta: JSON.stringify(meta),
          cover, art_icon: icon, art_wide: wide, art_avatar: avatar, parent_id: null, root_id: null, generation: 0, mog_prompt: null, hidden: 0 };
        const keys = Object.keys(g).filter((k) => cols.has(k));
        db.prepare(`INSERT INTO games (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`).run(...keys.map((k) => g[k]));
        // kept with the game: sealed as the record's world, never swept
        if (!s.db.prepare("UPDATE drafts SET state = 'kept', world = ?, game_id = ? WHERE id = ?").run(R.world.hash, R.id, storeId).changes) throw new Error('the store could not keep the world');
        return `published /g/${R.slug} (store draft ${storeId}, world ${R.world.hash.slice(0, 12)}, ${R.files.length} files, ${need} bytes stored)`;
      } catch (e) {
        // (the games row is rolled back with the transaction; the store draft goes with it, and the blobs only it held)
        try { const d = s.db.prepare('SELECT * FROM drafts WHERE id = ?').get(storeId); if (d) { s.release(storeId); s.abandon(s.db.prepare('SELECT * FROM drafts WHERE id = ?').get(storeId)); } } catch { /* swept later */ }
        throw e;
      }
    },
  },
  {
    // 7 Nov, the owner: "change it to By GameMog". A first-party world read "By a GameMog creator" (Pickup Time, and every
    // world GameMog published by migration, whose creator column was empty). GameMog's own worlds are now by GameMog:
    // games.creator "GameMog" (lib/byline.ts; lib/names.ts reserves the name, so no creator can give it at publish). Each
    // is found by its slug and its first-party prompt (a migration's own, 'first-party world: ...'), and Mog City's own
    // story by its meta (storykit.own, written "Mog City"); a row whose creator is anything else is left alone, and a world
    // not in this database (Pickup Time before its migration runs) is by GameMog from its meta anyway (meta.storykit.showcase)
    id: '2026-11-07-by-gamemog',
    run(db) {
      if (!columns(db, 'games').has('creator')) return 'no creator column yet (the app adds it at its first start, and lib/byline.ts reads first-party worlds from their meta meanwhile)';
      const slugs = ['la-olympics-2028', 'tideline', 'velodrome-2028', 'road-race-2028', 'speed-skating-2030', 'great-wall-shinobi', 'las-vegas-night-gp',
        'zombie-beach', 'mog-derby', 'mogdune', 'zcity', 'ai-alps', 'meme-kart', 'meme-kart-original', 'aspen-gp', 'shootout', 'mogatron', 'artificial1',
        'invisible-world', 'mog-city', 'superintelligence-sprint', 'pickup-time'];
      const one = db.prepare("UPDATE games SET creator = 'GameMog' WHERE slug = ? AND prompt LIKE 'first-party world:%' AND creator IS NULL");
      const done = slugs.filter((slug) => one.run(slug).changes > 0);
      const own = db.prepare("UPDATE games SET creator = 'GameMog' WHERE json_extract(meta, '$.mode') = 'storykit' AND json_extract(meta, '$.storykit.own') = 1 AND parent_id IS NULL AND (creator IS NULL OR creator = 'Mog City')").run().changes;
      return `${done.length} of ${slugs.length} first-party worlds by GameMog${done.length < slugs.length ? ` (left alone or not here: ${slugs.filter((x) => !done.includes(x)).join(', ')})` : ''}; Mog City's own story: ${own}`;
    },
  },
  {
    // 7 Nov, the owner: Pickup Time "needs a MUCH more compelling thumbnail with main characters, john & family in front
    // of the porsche" (the Vantor GT). New cover, key art and icon: the family with the car, rendered in the runtime
    // (deploy/migrations/pickup-time-*-2.jpg). Swapped only where the row still has the art its first migration wrote
    // (byte for byte), so art changed since by hand is left alone; the headshot (art_avatar) stays
    id: '2026-11-07-pickup-time-art',
    run(db) {
      const was = { cover: file('pickup-time-cover.jpg'), art_icon: file('pickup-time-icon.jpg'), art_wide: file('pickup-time-wide.jpg') };
      const now = { cover: file('pickup-time-cover-2.jpg'), art_icon: file('pickup-time-icon-2.jpg'), art_wide: file('pickup-time-wide-2.jpg') };
      if (Object.values(was).some((b) => !b) || Object.values(now).some((b) => !b)) throw new Error('deploy/migrations/pickup-time-{cover,icon,wide}{,-2}.jpg are not all in this build');
      const row = db.prepare("SELECT id, cover, art_icon, art_wide FROM games WHERE slug = 'pickup-time'").get();
      if (!row) throw new Error('waiting: /g/pickup-time is not in this database yet');
      const same = (a, b) => a != null && Buffer.from(a).equals(b);
      const swap = Object.keys(now).filter((k) => same(row[k], was[k]));
      if (!swap.length) return 'left alone: Pickup Time\'s art was changed since its migration';
      db.prepare(`UPDATE games SET ${swap.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...swap.map((k) => now[k]), row.id);
      return `Pickup Time's new art: ${swap.join(', ')}`;
    },
  },
  {
    // 7 Nov, the owner: the live test's two worlds (a Mog of Pickup Time and a Create, published from the test's own
    // browser under the creator name "Nov7 Live Test") read "By GameMog": "change it to By GameMog". Only those two rows,
    // and only while they still carry the test's name
    id: '2026-11-07-live-test-by-gamemog',
    run(db) {
      if (!columns(db, 'games').has('creator')) return 'no creator column yet';
      const one = db.prepare("UPDATE games SET creator = 'GameMog' WHERE slug = ? AND creator = 'Nov7 Live Test'");
      const done = ['silent-night-pickup', 'blackout-tow'].filter((slug) => one.run(slug).changes > 0);
      return `by GameMog: ${done.join(', ') || 'none (renamed already or not here)'}`;
    },
  },
  {
    // 7 Nov: Blackout Tow, the live test's Create, was published after 2026-11-07-live-test-by-gamemog had run; every
    // world still under the test's creator name reads "By GameMog" too (the owner: "change it to By GameMog")
    id: '2026-11-07-live-test-by-gamemog-2',
    run(db) {
      if (!columns(db, 'games').has('creator')) return 'no creator column yet';
      const n = db.prepare("UPDATE games SET creator = 'GameMog' WHERE creator = 'Nov7 Live Test'").run().changes;
      return `by GameMog: ${n} more`;
    },
  },
  {
    // 11 Nov: SF 2040, GameMog's second first-party story world (a horse-riding story in San Francisco after an impact,
    // six missions on Mog City's engine), published PUBLIC at /g/sf2040, by GameMog. Its record,
    // deploy/migrations/sf2040-story.json (scripts/storykit-sf2040.ts --export), names the sealed world
    // (deploy/migrations/sf2040/world.json: Mog City's own world for it, packs/sf2040.json on mogcity bcd35463, written
    // for Mog City directly, so there is no story-pack form to gate) by its SHA-256. Every file it names is one of Mog
    // City's own (assets/characters/sf2040/*.glb, its four bodies; assets/voice/sf2040/*.m4a, its 151 clips), which Mog
    // City loads from mc.gamemog.com itself: the store holds only the world. As Pickup Time's: the world is checked before
    // anything is written, then goes into the Story Kit store beside this database as a kept draft (never swept, its pack
    // the world itself), and the game gets its cover (the plain frame: ?plain, the dare card), key art (wide and square,
    // titled) and Cal's headshot (Jump in), creator GameMog. Once only: SF 2040 already there (meta.storykit.packId) is
    // left alone, so is another game at /g/sf2040 or with its id. It waits (unrecorded, tried at the next boot) while the
    // Story Kit is off on this server or the store has no room for it
    id: '2026-11-11-sf2040',
    async: true,
    async run(db, path) {
      if (!['on', 'owner'].includes(String(process.env.STORYKIT ?? '').trim().toLowerCase())) throw new Error('waiting: the Story Kit is off on this server (STORYKIT)');
      const rec = file('sf2040-story.json'), worldBytes = file('sf2040/world.json');
      if (!rec || !worldBytes) throw new Error('deploy/migrations/sf2040-story.json or sf2040/world.json is not in this build');
      const R = JSON.parse(rec.toString('utf8'));
      if (R.v !== 1 || R.slug !== 'sf2040' || R.meta?.mode !== 'storykit' || R.meta.storykit?.packId !== 'sf2040' || R.meta.storykit.city !== 'sf' || R.meta.storykit.showcase !== true) throw new Error('sf2040-story.json is not SF 2040');
      const sha = (b) => createHash('sha256').update(b).digest('hex');
      const had = db.prepare("SELECT slug, hidden FROM games WHERE json_extract(meta, '$.mode') = 'storykit' AND json_extract(meta, '$.storykit.packId') = 'sf2040' AND json_extract(meta, '$.storykit.showcase') = 1").get();
      if (had) return `already there: /g/${had.slug} (hidden ${had.hidden})`;
      if (db.prepare('SELECT 1 FROM games WHERE slug = ?').get(R.slug)) return `left alone: /g/${R.slug} is another game`;
      if (db.prepare('SELECT 1 FROM games WHERE id = ?').get(R.id)) return 'left alone: its id is taken';
      const plain = file('sf2040/cover-plain.jpg'), wide = file('sf2040/cover-wide.jpg'), icon = file('sf2040/cover-square.jpg'), avatar = file('sf2040/headshot.jpg');
      if (!plain || !wide || !icon || !avatar) throw new Error('deploy/migrations/sf2040/{cover-plain,cover-wide,cover-square,headshot}.jpg are not in this build');
      for (const [n, b] of [['cover-plain', plain], ['cover-wide', wide], ['cover-square', icon], ['headshot', avatar]]) if (!(b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff)) throw new Error(`deploy/migrations/sf2040/${n}.jpg is not a JPEG`);

      // the world, checked against the record before anything is written: SF 2040's runner world, every file it names
      // one of Mog City's own (an assets/ path, which Mog City loads from its own origin), none from this site's store
      if (sha(worldBytes) !== R.world?.hash || worldBytes.length !== R.world.bytes) throw new Error('sf2040/world.json is not the record\'s world');
      const text = worldBytes.toString('utf8'), W = JSON.parse(text);
      if (W.storykit !== 1 || W.id !== 'sf2040' || W.city !== 'sf') throw new Error('sf2040/world.json is not SF 2040\'s runner world');
      if (text.includes('/storykit/f/')) throw new Error('sf2040/world.json names a file in the store, which this migration does not write');
      for (const [n, c] of Object.entries(W.cast ?? {})) if (c?.glb != null && !/^assets\/characters\/sf2040\/[a-z][a-z0-9-]{0,39}\.glb$/.test(String(c.glb))) throw new Error(`the world's ${n} is not one of Mog City's SF 2040 bodies`);
      for (const [k, c] of Object.entries(W.voice?.clips ?? {})) if (!/^[0-9a-f]{8}-[0-9a-f]{8}$/.test(k) || String(c?.url) !== `assets/voice/sf2040/${k}.m4a`) throw new Error(`the world's clip ${k} is not one of Mog City's SF 2040 clips`);

      // (a fresh disk's database may lack the columns the app adds at its first start: added here as lib/db.ts adds them)
      if (!columns(db, 'games').has('art_avatar')) db.exec('ALTER TABLE games ADD COLUMN art_avatar BLOB');
      if (!columns(db, 'games').has('creator')) db.exec('ALTER TABLE games ADD COLUMN creator TEXT');
      const cols = columns(db, 'games');
      if (!cols.has('hidden')) throw new Error('the games table has no hidden column');
      const { StoryStore, LIMITS } = await storykit();
      const s = new StoryStore(join(dirname(resolve(path)), 'storykit'));
      if (worldBytes.length > LIMITS.sealed) throw new Error(`the world is ${worldBytes.length} bytes, over a sealed world's ${LIMITS.sealed}`);
      const fresh = !s.db.prepare('SELECT 1 FROM blobs WHERE hash = ?').get(R.world.hash);
      const need = fresh ? worldBytes.length : 0;
      if (s.used() + need > LIMITS.disk) throw new Error(`waiting: the Story Kit store has no room for SF 2040 (${need} bytes more than ${s.used()} used of ${LIMITS.disk})`);

      const storeId = randomUUID(), t = Date.now();
      if (fresh) {
        const p = s.blobPath(R.world.hash, 'json');
        if (!(existsSync(p) && sha(readFileSync(p)) === R.world.hash)) {
          mkdirSync(dirname(p), { recursive: true });
          const tmp = `${p}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
          writeFileSync(tmp, worldBytes); renameSync(tmp, p);
        }
      }
      s.db.exec('BEGIN');
      try {
        s.db.prepare('INSERT OR IGNORE INTO blobs (hash, ext, bytes, at) VALUES (?, ?, ?, ?)').run(R.world.hash, 'json', worldBytes.length, t);
        s.db.prepare("INSERT INTO drafts (id, token_hash, pack, parent, state, created_at, touched_at) VALUES (?, ?, ?, NULL, 'draft', ?, ?)")
          .run(storeId, sha(randomBytes(24)), text, t, t);
        s.db.prepare("INSERT INTO files (draft_id, kind, name, hash, ext, bytes, meta, inherited, at) VALUES (?, 'pack', 'world.json', ?, 'json', ?, NULL, 0, ?)")
          .run(storeId, R.world.hash, worldBytes.length, t);
        s.db.exec('COMMIT');
      } catch (e) { s.db.exec('ROLLBACK'); throw e; }
      try {
        const meta = { ...R.meta, storykit: { ...R.meta.storykit, pack: storeId, world: R.world.hash } };
        // (the game's module names the world; it plays from meta.storykit.world, lib/storykit-publish.ts storyPlaySrc)
        const code = `GameMog.world({ storykit: ${JSON.stringify({ storykit: 1, id: 'sf2040', title: R.meta.title, city: 'sf', world: R.world.hash })} });\n`;
        const g = { id: R.id, slug: R.slug, title: R.meta.title, tagline: R.meta.tagline, blurb: R.meta.blurb, difficulty: 'endless', spec: '{}',
          prompt: 'first-party world: sf2040', featured: 0, created_at: t, format: 'world', code, meta: JSON.stringify(meta),
          cover: plain, art_icon: icon, art_wide: wide, art_avatar: avatar, parent_id: null, root_id: null, generation: 0, mog_prompt: null, hidden: 0, creator: 'GameMog' };
        const keys = Object.keys(g).filter((k) => cols.has(k));
        db.prepare(`INSERT INTO games (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`).run(...keys.map((k) => g[k]));
        // kept with the game: sealed as the record's world, never swept
        if (!s.db.prepare("UPDATE drafts SET state = 'kept', world = ?, game_id = ? WHERE id = ?").run(R.world.hash, R.id, storeId).changes) throw new Error('the store could not keep the world');
        return `published /g/${R.slug} (store draft ${storeId}, world ${R.world.hash.slice(0, 12)}, ${need} bytes stored; its bodies and clips are Mog City's own)`;
      } catch (e) {
        // (the games row is rolled back with the transaction; the store draft goes with it, and the world if only it held it)
        try { const d = s.db.prepare('SELECT * FROM drafts WHERE id = ?').get(storeId); if (d) { s.release(storeId); s.abandon(s.db.prepare('SELECT * FROM drafts WHERE id = ?').get(storeId)); } } catch { /* swept later */ }
        throw e;
      }
    },
  },
  {
    // 11 Nov, the owner ("yes refresh gamemog.com"): SF 2040 plays Mog City's world as it is now (mogcity cc88be61, the
    // feel pass: M2, M3 and M6 start without the ride between missions, wave sizes, tips). Its record,
    // deploy/migrations/sf2040-world-2.json (scripts/storykit-sf2040.ts --export <mogcity tree> --next 2), names the
    // world it replaces (from: what 2026-11-11-sf2040 sealed) and the new one (deploy/migrations/sf2040/world-2.json),
    // checked as that migration checks its world. The new world is sealed into the game's kept store draft as the patch
    // route seals one (world.json; the old one kept as a was-<sha256>.json row, never swept, so a page or a play still on
    // it loads and counts), the draft's pack becomes it, and the game's meta (storykit.world: what /g/sf2040 frames and
    // what a played mission counts against) and module name it. Only where the game still plays `from`: a world changed
    // since is left alone, as is a database without SF 2040 (it waits, unrecorded, for 2026-11-11-sf2040)
    id: '2026-11-11-sf2040-world-2',
    async: true,
    run: (db, path) => sf2040World(2, db, path),
  },
  {
    // 12 Nov, the owner ("refresh then polish"): SF 2040 plays Mog City's world as it is now (mogcity 506773f1: Pike in
    // person for M1's mercy beat, M1's ride home and M2's sneak tightened, WARDEN-7 a real boss). As
    // 2026-11-11-sf2040-world-2: deploy/migrations/sf2040-world-3.json (from: world-2's) and sf2040/world-3.json, sealed
    // in place of world-2's only while the game still plays it; world-2's and the first world stay served
    id: '2026-11-12-sf2040-world-3',
    async: true,
    run: (db, path) => sf2040World(3, db, path),
  },
  {
    // 12 Nov, the owner: SF 2040's cover again (the rider was lost against a red building). New cover (the plain frame),
    // key art and icon (deploy/migrations/sf2040/cover-{plain,wide,square}-2.jpg, scripts/storykit-sf2040.ts --art
    // --suffix -2), and Cal's headshot with his hairline fixed (headshot-2.jpg, Jump in). As
    // 2026-11-07-pickup-time-art: each swapped only where the row still has what 2026-11-11-sf2040 wrote (byte for
    // byte), so art changed since by hand is left alone
    id: '2026-11-12-sf2040-art-2',
    // (async only to run after 2026-11-11-sf2040, which is: on a fresh disk the row is there by the time this runs)
    async: true,
    async run(db) {
      const was = { cover: file('sf2040/cover-plain.jpg'), art_wide: file('sf2040/cover-wide.jpg'), art_icon: file('sf2040/cover-square.jpg'), art_avatar: file('sf2040/headshot.jpg') };
      const now = { cover: file('sf2040/cover-plain-2.jpg'), art_wide: file('sf2040/cover-wide-2.jpg'), art_icon: file('sf2040/cover-square-2.jpg'), art_avatar: file('sf2040/headshot-2.jpg') };
      if (Object.values(was).some((b) => !b) || Object.values(now).some((b) => !b)) throw new Error('deploy/migrations/sf2040/{cover-plain,cover-wide,cover-square,headshot}{,-2}.jpg are not all in this build');
      for (const [k, b] of Object.entries(now)) if (!(b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff)) throw new Error(`the new ${k} is not a JPEG`);
      const row = db.prepare("SELECT id, cover, art_icon, art_wide, art_avatar FROM games WHERE slug = 'sf2040'").get();
      if (!row) throw new Error('waiting: /g/sf2040 is not in this database yet');
      const same = (a, b) => a != null && Buffer.from(a).equals(b);
      if (Object.keys(now).every((k) => same(row[k], now[k]))) return 'already there: SF 2040 has its new art';
      const swap = Object.keys(now).filter((k) => same(row[k], was[k]));
      if (!swap.length) return 'left alone: SF 2040\'s art was changed since its migration';
      db.prepare(`UPDATE games SET ${swap.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...swap.map((k) => now[k]), row.id);
      return `SF 2040's new art: ${swap.join(', ')}`;
    },
  },
  {
    // 12 Nov, the owner's review: the titled key art set SF 2040's wordmark and its SAN FRANCISCO plate over the Rex's
    // head, the art's hook. Titled again with the lockup in the top-left corner, over the dark sky (lib/story-art.ts
    // LockupPlace 'top-left'; scripts/storykit-sf2040.ts --art ... --suffix -3 --place top-left), the Rex, Cal and
    // Ranger clear: deploy/migrations/sf2040/cover-{wide,square}-3.jpg. As 2026-11-12-sf2040-art-2: each swapped only
    // where the row still has what that migration wrote; the plain cover and the headshot stay
    id: '2026-11-12-sf2040-art-3',
    async: true,
    async run(db) {
      const was = { art_wide: file('sf2040/cover-wide-2.jpg'), art_icon: file('sf2040/cover-square-2.jpg') };
      const now = { art_wide: file('sf2040/cover-wide-3.jpg'), art_icon: file('sf2040/cover-square-3.jpg') };
      if (Object.values(was).some((b) => !b) || Object.values(now).some((b) => !b)) throw new Error('deploy/migrations/sf2040/cover-{wide,square}-{2,3}.jpg are not all in this build');
      for (const [k, b] of Object.entries(now)) if (!(b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff)) throw new Error(`the new ${k} is not a JPEG`);
      const row = db.prepare("SELECT id, art_icon, art_wide FROM games WHERE slug = 'sf2040'").get();
      if (!row) throw new Error('waiting: /g/sf2040 is not in this database yet');
      const same = (a, b) => a != null && Buffer.from(a).equals(b);
      if (Object.keys(now).every((k) => same(row[k], now[k]))) return 'already there: SF 2040 has its corner-titled art';
      const swap = Object.keys(now).filter((k) => same(row[k], was[k]));
      if (!swap.length) return 'left alone: SF 2040\'s art is not the art 2026-11-12-sf2040-art-2 wrote';
      db.prepare(`UPDATE games SET ${swap.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...swap.map((k) => now[k]), row.id);
      return `SF 2040's corner-titled art: ${swap.join(', ')}`;
    },
  },
  {
    // 12 Nov, the owner: a more prominent Rex face and giant ape. The art lane's final4 frames: the plain cover
    // (deploy/migrations/sf2040/cover-plain-4.jpg) and the key art and icon titled in the top-left corner, clear of the
    // Rex's head and Cal's bat (cover-{wide,square}-4.jpg; scripts/storykit-sf2040.ts --art ... --suffix -4 --place
    // top-left). Each swapped only where the row still has what an earlier SF 2040 art migration wrote (the plain cover
    // art-2's; the key art and icon art-3's, or art-2's should art-3 not have run); Cal's headshot stays
    id: '2026-11-12-sf2040-art-4',
    async: true,
    async run(db) {
      const was = { cover: [file('sf2040/cover-plain-2.jpg')], art_wide: [file('sf2040/cover-wide-3.jpg'), file('sf2040/cover-wide-2.jpg')], art_icon: [file('sf2040/cover-square-3.jpg'), file('sf2040/cover-square-2.jpg')] };
      const now = { cover: file('sf2040/cover-plain-4.jpg'), art_wide: file('sf2040/cover-wide-4.jpg'), art_icon: file('sf2040/cover-square-4.jpg') };
      if (Object.values(was).flat().some((b) => !b) || Object.values(now).some((b) => !b)) throw new Error('deploy/migrations/sf2040/cover-{plain,wide,square}-{2,3,4}.jpg are not all in this build');
      for (const [k, b] of Object.entries(now)) if (!(b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff)) throw new Error(`the new ${k} is not a JPEG`);
      const row = db.prepare("SELECT id, cover, art_icon, art_wide FROM games WHERE slug = 'sf2040'").get();
      if (!row) throw new Error('waiting: /g/sf2040 is not in this database yet');
      const same = (a, b) => a != null && Buffer.from(a).equals(b);
      if (Object.keys(now).every((k) => same(row[k], now[k]))) return 'already there: SF 2040 has its final4 art';
      const swap = Object.keys(now).filter((k) => was[k].some((b) => same(row[k], b)));
      if (!swap.length) return 'left alone: SF 2040\'s art is not what its art migrations wrote';
      db.prepare(`UPDATE games SET ${swap.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...swap.map((k) => now[k]), row.id);
      return `SF 2040's final4 art: ${swap.join(', ')}`;
    },
  },
];

/**
 * SF 2040's world refreshed to world-<n> (deploy/migrations/sf2040-world-<n>.json, scripts/storykit-sf2040.ts --next <n>):
 * what 2026-11-11-sf2040-world-2 says, for each refresh. Only while the game and its kept draft play the record's
 * `from`; every world it played before stays served (a was- row each).
 */
async function sf2040World(n, db, path) {
  if (!['on', 'owner'].includes(String(process.env.STORYKIT ?? '').trim().toLowerCase())) throw new Error('waiting: the Story Kit is off on this server (STORYKIT)');
  const rec = file(`sf2040-world-${n}.json`), worldBytes = file(`sf2040/world-${n}.json`);
  if (!rec || !worldBytes) throw new Error(`deploy/migrations/sf2040-world-${n}.json or sf2040/world-${n}.json is not in this build`);
  const R = JSON.parse(rec.toString('utf8'));
  const HEX = /^[0-9a-f]{64}$/;
  if (R.v !== 1 || R.slug !== 'sf2040' || R.n !== n || !HEX.test(R.from?.hash) || !HEX.test(R.world?.hash)) throw new Error(`sf2040-world-${n}.json is not SF 2040's world ${n}`);
  const sha = (b) => createHash('sha256').update(b).digest('hex');
  const g = db.prepare("SELECT id, code, meta FROM games WHERE slug = 'sf2040' AND id = ?").get(R.id);
  if (!g) throw new Error('waiting: /g/sf2040 is not in this database yet');
  const meta = JSON.parse(g.meta ?? '{}');
  if (meta.mode !== 'storykit' || meta.storykit?.packId !== 'sf2040') return 'left alone: /g/sf2040 is not SF 2040';
  if (meta.storykit.world === R.world.hash) return 'already there: /g/sf2040 plays the new world';
  if (meta.storykit.world !== R.from.hash) return `left alone: /g/sf2040 plays ${String(meta.storykit.world).slice(0, 12)}, not ${R.from.hash.slice(0, 12)}`;

  // the new world, checked as 2026-11-11-sf2040 checks its own before anything is written
  if (sha(worldBytes) !== R.world.hash || worldBytes.length !== R.world.bytes) throw new Error(`sf2040/world-${n}.json is not the record's world`);
  const text = worldBytes.toString('utf8'), W = JSON.parse(text);
  if (W.storykit !== 1 || W.id !== 'sf2040' || W.city !== 'sf') throw new Error(`sf2040/world-${n}.json is not SF 2040's runner world`);
  if (text.includes('/storykit/f/')) throw new Error(`sf2040/world-${n}.json names a file in the store, which this migration does not write`);
  for (const [who, c] of Object.entries(W.cast ?? {})) if (c?.glb != null && !/^assets\/characters\/sf2040\/[a-z][a-z0-9-]{0,39}\.glb$/.test(String(c.glb))) throw new Error(`the world's ${who} is not one of Mog City's SF 2040 bodies`);
  for (const [k, c] of Object.entries(W.voice?.clips ?? {})) if (!/^[0-9a-f]{8}-[0-9a-f]{8}$/.test(k) || String(c?.url) !== `assets/voice/sf2040/${k}.m4a`) throw new Error(`the world's clip ${k} is not one of Mog City's SF 2040 clips`);

  const { StoryStore, LIMITS } = await storykit();
  const s = new StoryStore(join(dirname(resolve(path)), 'storykit'));
  const storeId = meta.storykit.pack;
  const d = typeof storeId === 'string' ? s.db.prepare("SELECT id, world FROM drafts WHERE id = ? AND state = 'kept' AND game_id = ?").get(storeId, g.id) : null;
  if (!d) throw new Error('SF 2040\'s kept store draft is not in the store');
  if (d.world !== R.from.hash) return `left alone: the store draft holds ${String(d.world).slice(0, 12)}, not ${R.from.hash.slice(0, 12)}`;
  if (worldBytes.length > LIMITS.sealed) throw new Error(`the world is ${worldBytes.length} bytes, over a sealed world's ${LIMITS.sealed}`);
  const fresh = !s.db.prepare('SELECT 1 FROM blobs WHERE hash = ?').get(R.world.hash);
  if (fresh && s.used() + worldBytes.length > LIMITS.disk) throw new Error('waiting: the Story Kit store has no room for SF 2040\'s new world');
  if (fresh) {
    const p = s.blobPath(R.world.hash, 'json');
    if (!(existsSync(p) && sha(readFileSync(p)) === R.world.hash)) {
      mkdirSync(dirname(p), { recursive: true });
      const tmp = `${p}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
      writeFileSync(tmp, worldBytes); renameSync(tmp, p);
    }
  }
  const t = Date.now();
  const oldBytes = s.db.prepare('SELECT bytes FROM blobs WHERE hash = ?').get(R.from.hash)?.bytes ?? R.from.bytes;
  s.db.exec('BEGIN');
  try {
    s.db.prepare('INSERT OR IGNORE INTO blobs (hash, ext, bytes, at) VALUES (?, ?, ?, ?)').run(R.world.hash, 'json', worldBytes.length, t);
    const row = s.db.prepare("INSERT OR REPLACE INTO files (draft_id, kind, name, hash, ext, bytes, meta, inherited, at) VALUES (?, 'pack', ?, ?, 'json', ?, NULL, 0, ?)");
    // (the world it replaces stays the draft's, as a was- row: never swept, still served)
    row.run(d.id, `was-${R.from.hash}.json`, R.from.hash, oldBytes, t);
    row.run(d.id, 'world.json', R.world.hash, worldBytes.length, t);
    s.db.prepare('UPDATE drafts SET pack = ?, world = ?, touched_at = ? WHERE id = ?').run(text, R.world.hash, t, d.id);
    s.db.exec('COMMIT');
  } catch (e) { s.db.exec('ROLLBACK'); throw e; }
  try {
    const next = { ...meta, storykit: { ...meta.storykit, world: R.world.hash } };
    // (the module names the world it plays: 2026-11-11-sf2040's, with the new hash)
    const code = String(g.code ?? '').includes(R.from.hash) ? String(g.code).split(R.from.hash).join(R.world.hash) : g.code;
    db.prepare('UPDATE games SET meta = ?, code = ? WHERE id = ?').run(JSON.stringify(next), code, g.id);
    return `/g/sf2040 plays ${R.world.hash.slice(0, 12)} (was ${R.from.hash.slice(0, 12)}, kept); store draft ${d.id}`;
  } catch (e) {
    // (the games row is rolled back with the transaction; the store draft goes back to the world it had)
    try {
      s.db.exec('BEGIN');
      s.db.prepare("UPDATE files SET hash = ?, bytes = ? WHERE draft_id = ? AND kind = 'pack' AND name = 'world.json'").run(R.from.hash, oldBytes, d.id);
      s.db.prepare("DELETE FROM files WHERE draft_id = ? AND kind = 'pack' AND name = ?").run(d.id, `was-${R.from.hash}.json`);
      s.db.prepare('UPDATE drafts SET world = ? WHERE id = ?').run(R.from.hash, d.id);
      s.db.exec('COMMIT');
    } catch { try { s.db.exec('ROLLBACK'); } catch { /* as it is */ } }
    throw e;
  }
}

/** A table's columns (the app adds some at its first start, lib/db.ts: a fresh disk's database may lack them). */
const columns = (db, table) => new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name));

/**
 * The Story Kit's store module (TypeScript, loaded the way the scripts load it: Node strips the types, and the resolve
 * hook, scripts/ts-resolve-hooks.mjs, finds the lib's extensionless imports). Loaded only for a migration that needs it.
 */
let sk = null;
async function storykit() {
  if (!sk) {
    register(pathToFileURL(resolve('scripts/ts-resolve-hooks.mjs')).href);
    sk = await import(pathToFileURL(resolve('lib/storykit-store.ts')).href);
  }
  return sk;
}

/**
 * Runs every migration not yet recorded, each in its own transaction, in order. The ones marked `async` (they load the
 * Story Kit's modules) run after the others; then the returned promise settles (deploy/boot.mjs awaits it). Without an
 * async one pending, everything has run when this returns.
 */
export function migrate(path = 'data/gamemog.db') {
  if (!existsSync(path)) return;
  const db = new DatabaseSync(path);
  db.exec('CREATE TABLE IF NOT EXISTS migrations (id TEXT PRIMARY KEY, at INTEGER NOT NULL, note TEXT)');
  const done = new Set(db.prepare('SELECT id FROM migrations').all().map((r) => r.id));
  const later = [];
  for (const m of MIGRATIONS) {
    if (done.has(m.id)) continue;
    if (m.async) { later.push(m); continue; }
    try {
      db.exec('BEGIN');
      const note = m.run(db, path) ?? '';
      db.prepare('INSERT INTO migrations (id, at, note) VALUES (?, ?, ?)').run(m.id, Date.now(), String(note));
      db.exec('COMMIT');
      console.log(`migrate: ${m.id} (${note})`);
    } catch (e) {
      db.exec('ROLLBACK');
      console.error(`migrate: ${m.id} failed: ${e.message}`);
    }
  }
  if (!later.length) { db.close(); return; }
  return (async () => {
    for (const m of later) {
      try {
        db.exec('BEGIN');
        const note = (await m.run(db, path)) ?? '';
        db.prepare('INSERT INTO migrations (id, at, note) VALUES (?, ?, ?)').run(m.id, Date.now(), String(note));
        db.exec('COMMIT');
        console.log(`migrate: ${m.id} (${note})`);
      } catch (e) {
        db.exec('ROLLBACK');
        console.error(`migrate: ${m.id} failed: ${e.message}`);
      }
    }
    db.close();
  })();
}

if (import.meta.url === `file://${process.argv[1]}`) await migrate(process.argv[2]);
