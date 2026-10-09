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
