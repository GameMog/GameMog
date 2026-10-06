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

const MIGRATIONS = [
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
