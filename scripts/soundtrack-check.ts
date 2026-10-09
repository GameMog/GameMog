/**
 * The soundtrack choice, checked (9 Oct).  Part of `npm run check:platform`, or on its own:
 * node --import ./scripts/ts-resolve.mjs scripts/soundtrack-check.ts            (BASE: the dev server; NOBROWSER=1 skips Chrome)
 *
 * The owner: "On a Mog of a game with its own soundtrack, the music choice starts on 'Original soundtrack (Meme Kart
 * theme)', with 'No music' and the library tracks as alternatives. The creator can keep it, remove it or swap it, and
 * the result matches the choice", and Midnight Mog is left as it is. The music is three-way: 'original' (the
 * original's own soundtrack, carried in options.soundtrack), 'none', or a library track; null is no music, as it was.
 * Checked without a server: every set of options stored before reads exactly as it did (lib/world-options.ts
 * readOptions), a soundtrack is read for what it must be (readSoundtrack), what a Mog starts on (optionsOf), what the
 * builder is told (optionsBrief), what a publish stores (publishedSoundtrack: the original's from the database, only
 * when the Mog plays it), the runtime's decision for every world as it was and for the new choices (lib/runtime/v1.js
 * soundOf, kart.js KSC.on), a score's seed (the same notes under another title), the test drive's report
 * (lib/test-drive.ts submitDrive) and the migration that names the live worlds' own (deploy/migrate.mjs). Then, with
 * the dev server: the Mog page's music choice per original, and Mog drafts played in Chrome, each playing exactly its
 * choice whatever its code says. Its drafts are removed afterwards.
 */
import { readFileSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { withBrowser } from '../lib/browser.ts';
import { db, insertDraft } from '../lib/db.ts';
import { waitForDrive, submitDrive } from '../lib/test-drive.ts';
import { renderWorldGame } from '../lib/custom-game.ts';
import { MUSIC_TRACKS, WorldOptionsSchema, DEFAULT_OPTIONS, readOptions, readSoundtrack, soundtrackKey, optionsOf, optionsBrief, publishedSoundtrack, type WorldOptions } from '../lib/world-options.ts';
import { OWN_SOUNDTRACKS, MIGRATIONS } from '../deploy/migrate.mjs';

type Ok = (name: string, cond: boolean, detail?: string) => void;
const file = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const sha = (s: string) => createHash('sha256').update(s.trim()).digest('hex');
const J = JSON.stringify;
const KART = { kart: true as const, label: 'Meme Kart theme' }, TAIKO = OWN_SOUNDTRACKS.find((s) => s.slug === 'great-wall-shinobi')!.soundtrack, DANCE = { track: 'music-dance-field', label: 'Dance Field' };
// the composed score's notes as a short hash: lib/runtime/music.js runs here as in the browser (no audio to compose)
const Music = new Function(file('lib/runtime/music.js') + '\nreturn GameMogMusic;')() as { read: (o: unknown, seed: string) => unknown; score: (S: unknown) => unknown };
const notesOf = (j: string | null) => { if (!j) return null; let h = 2166136261; for (let i = 0; i < j.length; i++) { h ^= j.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16) + ':' + j.length; };
const notes = (music: unknown, title: string) => notesOf(J(Music.score(Music.read(music, title))));

/** readOptions as it was before 9 Oct, to read every stored set both ways. */
function readOptionsBefore(raw: unknown) {
  const p = WorldOptionsSchema.safeParse(raw ?? {});
  if (!p.success) return { ...DEFAULT_OPTIONS };
  const music = MUSIC_TRACKS.some((t) => t.id === p.data.music) ? p.data.music : null;
  return { hazards: p.data.hazards, music, open: p.data.open, coins: p.data.coins };
}
/** optionsOf as it was before 9 Oct. */
function optionsOfBefore(game: { meta?: string | null; code?: string | null }) {
  let meta: { options?: unknown } = {};
  try { meta = JSON.parse(game.meta ?? '{}') ?? {}; } catch {}
  if (meta.options !== undefined) { const o = readOptionsBefore(meta.options); return /\bopen\s*:\s*\{/.test(game.code ?? '') ? { ...o, open: true } : o; }
  const code = game.code ?? '';
  const track = /\bmusic\s*:\s*\{\s*track\s*:\s*['"]([a-z0-9-]+)['"]/.exec(code)?.[1] ?? null;
  const hazards = /\bhazards\s*:\s*['"](fewer|more)['"]/.exec(code)?.[1] ?? 'same';
  return readOptionsBefore({ hazards, music: track, open: /\bopen\s*:\s*\{/.test(code), coins: !/\bcoins\s*:\s*false/.test(code) || !/\bopen\s*:\s*\{/.test(code) });
}

export async function soundtrackUnitChecks(ok: Ok) {
  // 1. options: everything stored reads as it did, and the new choices read for what they must be
  const rows = [...db.prepare("SELECT meta, code FROM games WHERE format = 'world'").all(), ...db.prepare("SELECT meta, code FROM drafts WHERE format = 'world'").all()] as { meta: string | null; code: string | null }[];
  // (the sets stored before 9 Oct: none of them names 'original' or 'none', which only a later build can)
  const fresh = (o: unknown) => !!o && typeof o === 'object' && ['original', 'none'].includes((o as { music?: unknown }).music as string);
  const stored = rows.map((r) => { try { return JSON.parse(r.meta ?? '{}')?.options; } catch { return undefined; } }).filter((o) => o !== undefined && !fresh(o));
  const legacy = [undefined, null, {}, { music: 'music-slampe' }, { music: 'music-nope', hazards: 'more' }, { hazards: 'fewer', music: null, open: true, coins: false }, { music: 7 }, 'junk'];
  const differ = [...stored, ...legacy].filter((o) => J(readOptions(o)) !== J(readOptionsBefore(o)) || J(readOptions(o)).replace(/</g, '\\u003c') !== J(readOptionsBefore(o)));
  ok('soundtrack: every set of options stored (local games and drafts) and every older shape reads exactly as before, to the byte the play page carries', differ.length === 0, `${stored.length} stored + ${legacy.length} shapes${differ.length ? `; differ: ${J(differ.slice(0, 2))}` : ''}`);
  const r = (music: unknown, soundtrack?: unknown) => readOptions({ music, soundtrack });
  ok("soundtrack: 'none' is kept; 'original' only with a soundtrack (else no music); only 'original' carries one; a track keeps none",
    r('none').music === 'none' && !('soundtrack' in r('none')) && r('original').music === null && r('original', { nope: 1 }).music === null
      && r('original', KART).music === 'original' && J(r('original', KART).soundtrack) === J(KART) && r('music-slampe', KART).music === 'music-slampe' && !('soundtrack' in r('music-slampe', KART))
      && J(Object.keys(r('original', DANCE))) === J(['hazards', 'music', 'open', 'coins', 'soundtrack']));
  // 2. a soundtrack, read: one kind, the runtime's order, a plain name, plain score values, never a '<'
  const evil = readSoundtrack({ music: { style: 'taiko', key: '</script><script>x()</script>', tempo: 100, source: { at: [0, 0, 0] }, nested: { a: 1 }, track: 'music-x' }, label: '<b>Score</b> & co!' });
  ok('soundtrack: read for what it must be (a track over a score over the theme; a library id; a score\'s plain values without where it plays from; a plain name)',
    J(readSoundtrack({ track: 'music-dance-field', music: { style: 'taiko' }, kart: true, label: 'x' })) === J(DANCE) && J(readSoundtrack({ music: { style: 'taiko' }, kart: true })) === J({ music: { style: 'taiko' }, label: 'Original score' })
      && readSoundtrack({ track: 'human-athlete-male' }) === null && readSoundtrack({ track: 'music-../x' }) === null && readSoundtrack('kart') === null && readSoundtrack([KART]) === null && readSoundtrack({ kart: 'yes' }) === null
      && J(evil) === J({ music: { style: 'taiko', tempo: 100 }, label: 'bScoreb & co!' }) && J(readSoundtrack(TAIKO)) === J(TAIKO) && OWN_SOUNDTRACKS.every((s) => J(readSoundtrack(s.soundtrack)) === J(s.soundtrack)),
    J(evil));
  const page = renderWorldGame(file('lib/runtime/reference-world.js'), { title: 'T', tagline: '', options: { music: 'original', soundtrack: { music: { style: 'taiko', key: '</script><b>' }, label: '</script>' } } }, 'x');
  ok('soundtrack: nothing in the options can end the play page\'s host script (no "</script" from them; a \'<\' would be \\u003c)', (page.match(/<\/script/gi) ?? []).length === (renderWorldGame(file('lib/runtime/reference-world.js'), { title: 'T', tagline: '' }, 'x').match(/<\/script/gi) ?? []).length);

  // 3. what a Mog starts on: the original's own soundtrack when it has one, and only one it plays
  const local = db.prepare("SELECT slug, meta, code FROM games WHERE format = 'world'").all() as { slug: string; meta: string | null; code: string | null }[];
  const without = local.filter((g) => { try { const m = JSON.parse(g.meta ?? '{}'); return !m?.soundtrack && !fresh(m?.options); } catch { return true; } });
  const moved = without.filter((g) => J(optionsOf(g)) !== J(optionsOfBefore(g)));
  ok('soundtrack: a Mog of any game without a soundtrack of its own starts exactly where it did (every local world)', moved.length === 0, `${without.length} worlds${moved.length ? `; moved: ${moved.map((g) => g.slug).join(', ')}` : ''}`);
  const vegas = { code: file('worlds/vegas.js'), meta: J({ title: 'Las Vegas Night GP', soundtrack: DANCE }) };
  const kept = { code: '', meta: J({ options: { hazards: 'more', music: 'original', open: false, coins: true, soundtrack: KART }, soundtrack: KART }) };
  const lost = { code: '', meta: J({ options: { hazards: 'more', music: 'original', open: false, coins: true, soundtrack: KART } }) };
  ok('soundtrack: a game with its own (meta.soundtrack) starts its Mog on it, its other options kept; options naming one the game does not play offer none',
    optionsOf(vegas).music === 'original' && J(optionsOf(vegas).soundtrack) === J(DANCE) && optionsOf(kept).music === 'original' && optionsOf(kept).hazards === 'more' && J(optionsOf(kept).soundtrack) === J(KART)
      && optionsOf(lost).music === null && !('soundtrack' in optionsOf(lost)) && optionsOf({ meta: J({ options: { music: 'none' } }) }).music === 'none');
  // 4. what the builder is told: the original's by name, and to leave the music code alone
  const brief = (o: Partial<WorldOptions>) => optionsBrief({ ...DEFAULT_OPTIONS, ...o });
  ok('soundtrack: the builder is told the music is the platform\'s for the build (the original\'s by name, or a track, or none) and to write and remove no music code',
    /Music: The original's own soundtrack \(Meme Kart theme\): the runtime plays it, whatever this world's code says\. The music is the platform's for this build: do not compose or synthesise music, and do not remove or change any music code/.test(brief({ music: 'original', soundtrack: KART }))
      && /Music: On: the runtime plays the library track "Slampe"/.test(brief({ music: 'music-slampe' })) && /Music: Off\. The music is the platform's/.test(brief({ music: 'none' })) && /Music: Off\./.test(brief({ music: null })));

  // 5. what a publish stores
  const MK = J({ title: 'Meme Kart', soundtrack: KART }), opts = (music: unknown, soundtrack?: unknown) => ({ hazards: 'same', music, open: false, coins: true, soundtrack });
  const P = (o: unknown, parentMeta: string | null, kart: boolean, drive: { soundtrack?: unknown } | null) => publishedSoundtrack({ options: o, parentMeta, kart, drive });
  const a = P(opts('original', KART), MK, true, { soundtrack: KART }), b = P(opts('original', KART), MK, true, null), c = P(opts('original', DANCE), MK, true, { soundtrack: DANCE });
  const c2 = P(opts('original', DANCE), MK, true, null), d = P(opts('original', KART), MK, false, null), e = P(opts('original', KART), J({ title: 'x' }), true, null);
  ok('soundtrack: a Mog that kept its original\'s stores the original\'s (meta.soundtrack and its options) when its drive heard it, or with no drive when nothing in its code can stop it',
    J(a.soundtrack) === J(KART) && a.options?.music === 'original' && J(a.options?.soundtrack) === J(KART) && J(b.soundtrack) === J(KART) && J(c2.soundtrack) === J(KART) && J(c2.options?.soundtrack) === J(KART));
  ok('soundtrack: never one the page made up (the drive heard another: no music), never a kart theme outside a kart race, never one the original no longer has',
    c.soundtrack === null && c.options?.music === null && d.soundtrack === null && d.options?.music === null && e.soundtrack === null && e.options?.music === null && !('soundtrack' in (e.options ?? {})));
  ok('soundtrack: every other choice publishes as built, with none of its own (none, a track, nothing, no options)',
    [opts('none'), opts('music-slampe'), opts(null)].every((o) => { const x = P(o, MK, true, { soundtrack: null }); return x.soundtrack === null && x.options === undefined; }) && P(undefined, MK, true, null).soundtrack === null);
  const route = file('app/api/games/route.ts');
  ok('soundtrack: the publish route asks with the parent\'s row, the code\'s kind and only a drive of exactly this code that says what it heard',
    /publishedSoundtrack\(\{ options: dm\.options, parentMeta, kart: isKartWorld\(d\.code\), drive: report\.codeHash === hash && 'soundtrack' in report \? \{ soundtrack: report\.soundtrack \} : null \}\)/.test(route) && /SELECT meta FROM games WHERE id = \?'\)\.get\(d\.parent_id\)/.test(route));

  // 6. the runtime's decision (lib/runtime/v1.js soundOf), run here: every world as it was, and the new choices
  const v1 = file('lib/runtime/v1.js'), kartJs = file('lib/runtime/kart.js');
  const src = /\n  function soundOf\(o, d\) \{[\s\S]*?\n  \}\n/.exec(v1)?.[0] ?? '';
  const soundOf = new Function(src + '\nreturn soundOf;')() as (o: unknown, d: unknown) => { own: boolean; track: string | null; music: unknown; kart: boolean | null; label: string | null };
  const before = (o: { music?: unknown } | null, d: { music?: { track?: unknown } }, score: boolean) => {
    const TRACK = o ? (typeof o.music === 'string' ? o.music : null) : d.music && typeof d.music.track === 'string' ? d.music.track : null;
    return { track: TRACK, music: !o && !!d.music && !TRACK, kart: !!score && !o && !TRACK };
  };
  const after = (o: { music?: unknown } | null, d: unknown, score: boolean) => { const S = soundOf(o, d); return { track: S.track, music: !!S.music, kart: (o ? S.kart : !!score && !S.track) === true }; };
  const optsSets = [null, { hazards: 'same', music: null, open: false, coins: true }, { music: 'music-slampe' }, { hazards: 'more' }];
  const defs = [{}, { music: { track: 'music-dance-field' } }, { music: { style: 'taiko', key: 'D' } }, { music: { track: 'music-funky-house', source: { at: [0, 0, 0] } } }];
  const grid = optsSets.flatMap((o) => defs.flatMap((d) => [true, false].map((s) => ({ o, d, s }))));
  const changed = grid.filter(({ o, d, s }) => J(before(o, d, s)) !== J(after(o, d, s)));
  ok('soundtrack: the runtime decides as it did for every world built before (no options or options with null or a track; a score, a track or none in code; kart.score or not)', src.length > 0 && changed.length === 0, `${grid.length} cases${changed.length ? `; changed: ${J(changed[0])}` : ''}`);
  const O = (music: unknown, soundtrack?: unknown) => ({ hazards: 'same', music, open: false, coins: true, soundtrack });
  const gwDef = { music: { style: 'synthwave' } };
  ok("soundtrack: 'original' plays the original's (the theme, its score or its track) whatever the code has; 'none' nothing; a track that track alone",
    J(after(O('original', KART), {}, false)) === J({ track: null, music: false, kart: true }) && J(after(O('original', TAIKO), gwDef, true)) === J({ track: null, music: true, kart: false }) && J(soundOf(O('original', TAIKO), gwDef).music) === J(TAIKO.music)
      && J(after(O('original', DANCE), { music: { track: 'music-slampe' } }, true)) === J({ track: 'music-dance-field', music: false, kart: false }) && J(after(O('none'), gwDef, true)) === J({ track: null, music: false, kart: false })
      && J(after(O('original'), gwDef, true)) === J({ track: null, music: false, kart: false }) && J(after(O('music-liquid-flame'), { music: { track: 'music-dance-field' } }, true)) === J({ track: 'music-liquid-flame', music: false, kart: false }));
  ok('soundtrack: the runtime asks soundOf everywhere it decides (the track it loads, what boot plays, the kart theme) and reports the world\'s own (state().soundtrack)',
    /var tr = soundOf\(go, worldDef\)\.track;/.test(v1) && /var SND = soundOf\(OPTS, def\);\n\s*var TRACK = SND\.track;\n\s*if \(SND\.music && typeof GameMogMusic/.test(v1) && /soundtrack: ownSound\(\),/.test(v1)
      && /var KSC = \{ on: \(OPTS \? SND\.kart : !!KD\.score && !TRACK\) && typeof kartMusic !== 'undefined' && !KDIAG\.nomusic,/.test(kartJs) && !/!OPTS && def\.music && !TRACK/.test(v1));
  // a score is its options and a seed (the title, unless it names one): the seed travels, so the notes do
  const gwNotes = notes({ style: 'taiko', key: 'D', mode: 'in', tempo: 100 }, 'Great Wall Shinobi');
  ok('soundtrack: Great Wall\'s score with its seed is the very same notes under any other title (without it, other notes)',
    notes(TAIKO.music, 'Soundtrack Check Wall') === gwNotes && notes({ style: 'taiko', key: 'D', mode: 'in', tempo: 100 }, 'Soundtrack Check Wall') !== gwNotes, gwNotes ?? '');

  // 7. the test drive's report keeps what it heard, read; one without says nothing
  const drive = async (raw: Record<string, unknown>) => { const id = randomUUID(), token = randomUUID(), w = waitForDrive(id, token, 5000); submitDrive(id, token, raw, {}); return await w as unknown as Record<string, unknown>; };
  const base = { ready: true, runtime: true, readyMs: 900, fps: 60, levelReached: 5, results: 1, open: false, errors: [], advisories: [], hidden: false };
  const [h1, h2, h3, h4] = await Promise.all([drive({ ...base, soundtrack: { ...KART, label: '<i>x' } }), drive({ ...base, soundtrack: { track: 'nope' } }), drive({ ...base }), drive({ timedOut: true, soundtrack: KART })]);
  const [h5] = await Promise.all([drive({ timedOut: true })]);
  ok('soundtrack: the drive\'s report keeps what it heard, read (a junk one is none); a report without one has no soundtrack key; the skipped report stays shared and clean',
    J(h1.soundtrack) === J({ kart: true, label: 'ix' }) && h2.soundtrack === null && !('soundtrack' in h3) && h4.ran === false && J(h4.soundtrack) === J(KART) && !('soundtrack' in h5));
  ok('soundtrack: the drive reports the runtime\'s soundtrack with every kind of world (the base report)', /if \(st && 'soundtrack' in st\) base\.soundtrack = st\.soundtrack;/.test(file('lib/runtime/drive.js')));

  // 8. the migration: the live worlds' own, by code, and nothing else
  const ownWorlds = readdirSync(new URL('../worlds/', import.meta.url)).filter((f) => f.endsWith('.js')).filter((f) => { const c = file(`worlds/${f}`); return /\bmusic\s*:/.test(c) || /\bscore\s*:\s*true/.test(c); });
  const missing = ownWorlds.filter((f) => !OWN_SOUNDTRACKS.some((s) => s.code === sha(file(`worlds/${f}`))));
  ok('soundtrack: every first-party world with music or kart.score in its code is named, by the hash of the very code it carries (and each named file is that code)',
    missing.length === 0 && OWN_SOUNDTRACKS.every((s) => sha(file(s.file)) === s.code), `${ownWorlds.join(', ')}${missing.length ? `; not named: ${missing.join(', ')}` : ''}`);
  const dir = mkdtempSync(join(tmpdir(), 'gamemog-soundtrack-'));
  try {
    const t = new DatabaseSync(join(dir, 'm.db'));
    t.exec('CREATE TABLE games (id TEXT PRIMARY KEY, slug TEXT UNIQUE, code TEXT, meta TEXT)');
    const metaOf = (slug: string) => { const g = db.prepare('SELECT meta FROM games WHERE slug = ?').get(slug) as { meta: string } | undefined; const m = g ? JSON.parse(g.meta) : { title: slug }; delete m.soundtrack; return J(m); };
    for (const s of OWN_SOUNDTRACKS) t.prepare('INSERT INTO games VALUES (?, ?, ?, ?)').run(s.slug, s.slug, file(s.file) + '\n\n', metaOf(s.slug));
    // (Midnight Mog: a Mog of Meme Kart built with no music, and a world that has changed since it was read)
    const midnight = J({ title: 'Meme Kart: Midnight Mog', options: { hazards: 'same', music: null, open: false, coins: true } });
    t.prepare('INSERT INTO games VALUES (?, ?, ?, ?)').run('mm', 'meme-kart-midnight-mog', file('worlds/meme-kart.js').replace('score: true,', ''), midnight);
    t.prepare('UPDATE games SET code = code || ? WHERE slug = ?').run('\n// changed', 'ai-alps');
    const was = new Map((t.prepare('SELECT slug, meta FROM games').all() as { slug: string; meta: string }[]).map((g) => [g.slug, g.meta]));
    const M = MIGRATIONS.find((m: { id: string }) => m.id === '2026-10-09-own-soundtracks')!;
    const note = M.run(t), again = M.run(t);
    const now = new Map((t.prepare('SELECT slug, meta FROM games').all() as { slug: string; meta: string }[]).map((g) => [g.slug, g.meta]));
    const right = OWN_SOUNDTRACKS.filter((s) => s.slug !== 'ai-alps').every((s) => now.get(s.slug) === J({ ...JSON.parse(was.get(s.slug)!), soundtrack: s.soundtrack }));
    ok('soundtrack: the migration adds each live world\'s own soundtrack to its meta and nothing else (every other field as it was), leaves a changed world and Midnight Mog alone, and is harmless twice',
      right && now.get('ai-alps') === was.get('ai-alps') && now.get('meme-kart-midnight-mog') === midnight && /ai-alps: left alone \(its code is not the one read\)/.test(note) && /meme-kart: Meme Kart theme/.test(note) && /great-wall-shinobi: Great Wall score/.test(note)
        && OWN_SOUNDTRACKS.filter((s) => s.slug !== 'ai-alps').every((s) => again.includes(`${s.slug}: already`)), note);
    t.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

/** The Mog page's choice per original, and Mog drafts played in Chrome (BASE: the dev server). */
export async function soundtrackPageChecks(ok: Ok, base: string) {
  const offered = async (path: string) => {
    const html = await (await fetch(base + path)).text();
    const sel = /<span>Music<\/span><select[^>]*>([\s\S]*?)<\/select>/.exec(html)?.[1] ?? '';
    return [...sel.matchAll(/<option([^>]*)>(.*?)<\/option>/g)].map((x) => (/selected/.test(x[1]) ? '*' : '') + x[2].replace(/&#x27;/g, "'").replace(/&amp;/g, '&'));
  };
  const live = OWN_SOUNDTRACKS.filter((s) => { const g = db.prepare('SELECT meta, hidden FROM games WHERE slug = ?').get(s.slug) as { meta: string; hidden: number } | undefined; return g && !g.hidden && J(JSON.parse(g.meta).soundtrack) === J(s.soundtrack); });
  const pages = await Promise.all(live.map((s) => offered(`/mog/${s.slug}`)));
  ok('soundtrack: the Mog page of each original with its own soundtrack starts on "Original soundtrack (its name)", then No music and every library track',
    live.length > 0 && pages.every((o, i) => J(o) === J([`*Original soundtrack (${live[i].soundtrack.label})`, 'No music', ...MUSIC_TRACKS.map((t) => `${t.label} (${t.style.toLowerCase()})`)])),
    live.length ? live.map((s, i) => `${s.slug}: ${pages[i][0]}`).join('; ') : 'no live world has its soundtrack in the local database: run node deploy/migrate.mjs');
  const plain = (db.prepare("SELECT slug, meta FROM games WHERE format = 'world' AND hidden = 0").all() as { slug: string; meta: string }[]).filter((g) => !JSON.parse(g.meta).soundtrack).slice(0, 3);
  const others = await Promise.all([...plain.map((g) => offered(`/mog/${g.slug}`)), offered('/create')]);
  ok('soundtrack: an original without one, and Create, offer No music and the library tracks, as before', others.every((o) => o.length === MUSIC_TRACKS.length + 1 && o[0].replace('*', '') === 'No music' && !o.some((x) => x.includes('Original'))), others.map((o) => o.find((x) => x.startsWith('*'))).join(', '));
  if (process.env.NOBROWSER) return;

  // Mog drafts as the build stores them, played in Chrome: each plays exactly its choice whatever its code says
  const mk = readFileSync(new URL('../worlds/meme-kart.js', import.meta.url), 'utf8'), gw = readFileSync(new URL('../worlds/greatwall.js', import.meta.url), 'utf8'), vg = readFileSync(new URL('../worlds/vegas.js', import.meta.url), 'utf8');
  const noScore = mk.replace('course: COURSE, score: true,', 'course: COURSE,'), gwOther = gw.replace(/music: \{ style: 'taiko'[^}]*\},/, "music: { style: 'synthwave', key: 'A', mode: 'minor', tempo: 120 },"), vgNone = vg.replace("music: { track: 'music-dance-field' },", '');
  const cases = [
    { name: 'a Mog of Meme Kart whose code dropped kart.score, kept the theme: the theme plays, nothing else', code: noScore, options: readOptions({ music: 'original', soundtrack: KART }),
      want: (s: Heard) => !!s.theme?.on && s.theme.playing && !s.track && !s.music && J(s.soundtrack) === J(KART) },
    { name: "a Mog of Meme Kart with kart.score in its code, music 'none': silent", code: mk, options: readOptions({ music: 'none' }), want: (s: Heard) => s.theme === null && !s.track && !s.music && s.soundtrack === null },
    { name: 'a Mog of Great Wall titled otherwise, its code asking for synthwave, kept the score: Great Wall\'s very notes', code: gwOther, options: readOptions({ music: 'original', soundtrack: TAIKO }),
      want: (s: Heard) => s.music?.style === 'taiko' && s.music.playing && !s.track && s.notes === notes({ style: 'taiko', key: 'D', mode: 'in', tempo: 100 }, 'Great Wall Shinobi') && J(s.soundtrack) === J(TAIKO) },
    { name: 'a Mog of Las Vegas with no music in its code, kept Dance Field: Dance Field plays', code: vgNone, options: readOptions({ music: 'original', soundtrack: DANCE }),
      want: (s: Heard) => s.track?.id === 'music-dance-field' && s.track.playing && !s.music && J(s.soundtrack) === J(DANCE) },
  ];
  type Heard = { ready?: boolean; theme?: { on: boolean; playing: boolean } | null; track: { id: string; playing: boolean } | null; music: { style: string; playing: boolean } | null; notes: string | null; soundtrack: unknown; errors?: string[] };
  for (const c of cases) {
    const id = randomUUID();
    insertDraft({ id, prompt: 'soundtrack check', format: 'world', code: c.code, report: { pending: true },
      meta: { title: 'Soundtrack Check', tagline: 'A soundtrack check.', blurb: 'Made by the soundtrack check and removed after it.', genre: 'Test', cast: [{ name: 'Pip', color: '#F2E3C4' }], palette: { sky: '#9CCBEB', ground: '#7DB356', accent: '#F28C28' }, runtime: 1, options: c.options } });
    try {
      const s = await withBrowser(async (page) => {
        await page.goto(`${base}/d/${id}/play`);
        let up = false;
        for (let i = 0; i < 450 && !up; i++) { await new Promise((r) => setTimeout(r, 200)); up = await page.eval<boolean>('!!(window.__gm && window.__gm.ready && window.__gmRuntime)').catch(() => false); }
        if (!up) return { ready: false, track: null, music: null, notes: null, soundtrack: null, errors: page.errors.slice(0, 3) } as Heard;
        return await page.eval<Heard>(`(async () => {
          const R = window.__gmRuntime, d = R.debug, wait = (ms) => new Promise((r) => setTimeout(r, ms));
          d.audio(); await wait(1500); try { d.start(); } catch (e) {} await wait(3500);
          const s = R.state(), k = s.kart, j = d.musicScore() ? JSON.stringify(d.musicScore()) : null;
          let h = 2166136261; if (j) for (let i = 0; i < j.length; i++) { h ^= j.charCodeAt(i); h = Math.imul(h, 16777619); }
          return { ready: true, soundtrack: s.soundtrack, notes: j ? (h >>> 0).toString(16) + ':' + j.length : null,
            track: s.track ? { id: s.track.id, playing: s.track.playing } : null, music: s.music ? { style: s.music.style, playing: s.music.playing } : null,
            theme: k ? (k.theme ? { on: true, playing: !!k.theme.playing } : null) : undefined };
        })()`);
      }, { timeoutMs: 150_000 });
      ok(`soundtrack: ${c.name}`, !!s.ready && c.want(s), J({ soundtrack: s.soundtrack, theme: s.theme, track: s.track, music: s.music, notes: s.notes, errors: s.errors }));
    } finally { db.prepare('DELETE FROM drafts WHERE id = ?').run(id); }
  }
}

export async function soundtrackChecks(ok: Ok, base: string) {
  await soundtrackUnitChecks(ok);
  await soundtrackPageChecks(ok, base);
}

// on its own
if (import.meta.url === `file://${process.argv[1]}`) {
  const BASE = process.env.BASE ?? 'http://localhost:3939';
  let failures = 0;
  const ok: Ok = (name, cond, detail = '') => { console.log(`${cond ? '  ok  ' : '  FAIL'}  ${name}${detail ? `: ${detail}` : ''}`); if (!cond) failures++; };
  console.log('\nThe soundtrack choice');
  await soundtrackChecks(ok, BASE);
  console.log(`\n${failures ? `${failures} FAILED` : 'all soundtrack checks passed'}\n`);
  process.exit(failures ? 1 : 0);
}
