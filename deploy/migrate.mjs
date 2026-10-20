/**
 * Changes to the live database's content, made once each (deploy/boot.mjs runs
 * this before every start; on the Mac, `node deploy/migrate.mjs`). The server's
 * database lives on its own disk, so a change to what is published travels as
 * a migration: an id, and what it does. Each one is recorded and never rerun,
 * and each is written to be harmless if what it changes is already changed.
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

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
];

export function migrate(path = 'data/gamemog.db') {
  if (!existsSync(path)) return;
  const db = new DatabaseSync(path);
  db.exec('CREATE TABLE IF NOT EXISTS migrations (id TEXT PRIMARY KEY, at INTEGER NOT NULL, note TEXT)');
  const done = new Set(db.prepare('SELECT id FROM migrations').all().map((r) => r.id));
  for (const m of MIGRATIONS) {
    if (done.has(m.id)) continue;
    try {
      db.exec('BEGIN');
      const note = m.run(db) ?? '';
      db.prepare('INSERT INTO migrations (id, at, note) VALUES (?, ?, ?)').run(m.id, Date.now(), String(note));
      db.exec('COMMIT');
      console.log(`migrate: ${m.id} (${note})`);
    } catch (e) {
      db.exec('ROLLBACK');
      console.error(`migrate: ${m.id} failed: ${e.message}`);
    }
  }
  db.close();
}

if (import.meta.url === `file://${process.argv[1]}`) migrate(process.argv[2]);
