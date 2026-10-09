// A kart Mog's score constants (8 Oct, the owner's "ok do #1 and #2"), checked without a server: the track's signature
// (lib/runtime/kart.js kartTrackSig, run here by the node sim exactly as the race runs it in the browser), what a site
// publish stores (lib/kart-score.ts publishedKartConstants: the parent's when the track is the parent's, else the
// course's from the lap the test drive measured, else nothing), and the migration that signs Meme Kart's live rows.
//   node --import ./scripts/ts-resolve.mjs scripts/kart-score/test-mog.mjs     (scripts/platform-check.ts runs it too)
// (The browser's own signature for Meme Kart is the platform check's, against the running site.)
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { publishedKartConstants, kartConstants, kartMeasured, courseConstants, KART_RACER_IDS, KART_REPORTED_LAP } from '../../lib/kart-score.ts';
import { dna } from '../../lib/mog-dna.ts';
import { load } from './sim.mjs';
import { MEME_KART_TRACKS, MIGRATIONS, migrate } from '../../deploy/migrate.mjs';
await import('../../lib/runtime/kart-score.js');
const K = globalThis.KartScore;
const rd = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');

export function runKartMogTests(log = console.log) {
  let fails = 0, n = 0;
  const ok = (name, cond, detail = '') => { n++; if (!cond) fails++; log((cond ? 'ok   ' : 'FAIL ') + 'kart Mog: ' + name + (detail ? '  ' + detail : '')); };
  const sigOf = (o) => load({ hooks: false, ...o }).make({}).trackSig;

  // 1. the track's signature: the same for the same track, another for any other
  const mkCode = rd('worlds/meme-kart.js'), meta = JSON.parse(rd('deploy/migrations/meme-kart.meta.json')).meta, M = meta.kartScore;
  const mk = sigOf({ code: mkCode }), orig = sigOf({ code: rd('deploy/migrations/meme-kart-original.js') }), fx = sigOf({ world: 'lib/runtime/kart-world.js' });
  ok('the track\'s signature is 16 hex digits, the same however often it is worked out', /^[0-9a-f]{16}$/.test(mk) && sigOf({ code: mkCode }) === mk && load({ code: mkCode, hooks: false }).make({ seed: 99, pick: 'bull' }).trackSig === mk, mk);
  ok('Meme Kart\'s is the one its measured constants carry (meme-kart.meta.json) and The Original races the same track; the fixture\'s is another', M.trackSig === mk && orig === mk && fx !== mk, `${M.trackSig} / ${orig} / ${fx}`);
  // (a world's code changed in its looks only keeps it; the track moved 1 cm, a pad moved, the laps or the class: another)
  const looks = mkCode.replace(/#[0-9A-Fa-f]{6}/, '#123456'), degen = mkCode.replace("class: 'normal'", "class: 'degen'");
  const W0 = load({ code: mkCode, hooks: false }), KD = W0.KD;
  const moved = (patch) => { const W = load({ code: mkCode, hooks: false, patch: [] }); patch(W); W.TR.sig0 = null; return W.make({}).trackSig; };
  ok('looks alone keep it; a centimetre off the centre line, a pad moved half a metre, a lap more or another class change it',
    sigOf({ code: looks }) === mk && moved((W) => { W.TR.px[400] += 0.011; }) !== mk && (!W0.TR.course.pads.length || moved((W) => { W.TR.course.pads[0].d0 += 0.5; }) !== mk)
      && load({ code: mkCode, hooks: false }).make({ laps: 4 }).trackSig !== mk && degen !== mkCode && sigOf({ code: degen }) !== mk,
    `${KD.laps ?? 3} laps, ${W0.TR.course.pads.length} pads`);
  ok('the measured constants record it (measure.mjs: trackSig, the lap, the laps)', /trackSig: W\.make\(\{\}\)\.trackSig/.test(rd('scripts/kart-score/measure.mjs')) && M.lap === +W0.TR.L.toFixed(1) && M.laps === W0.laps);

  // 2. what a site publish stores
  const k = dna(mkCode).kart, parent = { id: 'mk', meta, kart: k }, run = { timeMs: 150_000, place: 3, gm: 23, hits: 7, racer: 'pepe' };
  const same = publishedKartConstants({ code: mkCode, kart: k, drive: { L: 1574.9, trackSig: mk, laps: 3 }, parent });
  const strip = (C) => { const { source, from, ...rest } = C; return JSON.stringify(rest); };
  ok('a Mog racing its parent\'s track (the drive\'s signature, laps and class the parent\'s) stores the parent\'s measured constants, flagged inherited, from the parent',
    !!same && same.source === 'inherited' && same.from === 'mk' && strip(same) === strip(M) && kartMeasured(same), same ? `${same.source} from ${same.from}` : 'none');
  ok('and scores a run exactly as its parent does (150 s, 3rd, 23 GM, 7 hits as Pepe)', !!same && K.score(run, same).total === K.score(run, M).total && K.score(run, M).total === 6334, `${same && K.score(run, same).total} = ${K.score(run, M).total}`);
  const lacks = { ...meta, kartScore: { ...M, tStar: { ...M.tStar }, tFloor: { ...M.tFloor } } }; delete lacks.kartScore.tStar.mooncat; delete lacks.kartScore.tFloor.mooncat;
  const filled = publishedKartConstants({ code: mkCode, kart: k, drive: { L: 1574.9, trackSig: mk, laps: 3 }, parent: { ...parent, meta: lacks } });
  const cc = courseConstants({ L: M.lap, laps: 3, cls: 'normal' });
  ok('a racer the parent\'s table lacks gets the course\'s time for that lap (never the table\'s strictest), the rest the parent\'s',
    !!filled && filled.tStar.mooncat === cc.tStar && filled.tFloor.mooncat === cc.tFloor && filled.tStar.pepe === M.tStar.pepe && KART_RACER_IDS.every((r) => typeof filled.tStar[r] === 'number'), filled ? String(filled.tStar.mooncat) : '');
  const course = (d, p = parent, code = mkCode, kk = k) => publishedKartConstants({ code, kart: kk, drive: d, parent: p });
  const notParent = [
    ['another track', course({ L: 1574.9, trackSig: 'aaaaaaaaaaaaaaaa', laps: 3 })],
    ['another lap count', course({ L: 1574.9, trackSig: mk, laps: 2 }, parent, mkCode, { ...k, laps: 2 })],
    ['another class in the code', course({ L: 1574.9, trackSig: mk, laps: 3 }, parent, mkCode, { ...k, class: 'degen' })],
    ['a parent whose constants were not measured', course({ L: 1574.9, trackSig: mk, laps: 3 }, { ...parent, meta: { ...meta, kartScore: { ...M, source: 'course' } } })],
    ['a parent with no signature', course({ L: 1574.9, trackSig: mk, laps: 3 }, { ...parent, meta: { ...meta, kartScore: { ...M, trackSig: undefined } } })],
    ['no parent', course({ L: 1574.9, trackSig: mk, laps: 3 }, null)],
  ];
  ok('anything else is not the parent\'s track: another signature, laps or class, a parent not measured or not signed, no parent: the course constants instead',
    notParent.every(([, C]) => C && C.source === 'course' && !kartMeasured(C)), notParent.map(([w, C]) => `${w}: ${C && C.source}`).join('; '));
  const c = course({ L: 1574.9, trackSig: 'aaaaaaaaaaaaaaaa', laps: 3 }), min = kartConstants(null, mkCode, k);
  ok('the course constants come from the lap the drive measured, every one under the measured (and the 800 m minimum\'s 48.9 s gone)',
    !!c && c.lap === 1574.9 && c.tStar === courseConstants({ L: 1574.9, laps: 3, cls: 'normal' }).tStar && KART_RACER_IDS.every((r) => c.tStar < M.tStar[r] && c.tFloor < M.tFloor[r]) && c.tStar > min.tStar * 1.9 && c.gmCap === M.gmCap && c.trackSig === 'aaaaaaaaaaaaaaaa',
    c ? `Pepe T* ${c.tStar} (measured ${M.tStar.pepe}, minimal ${min.tStar})` : 'none');
  const lo = course({ L: 120, laps: 3 }, null), hi = course({ L: 99999, laps: 3 }, null), mid = course({ L: 1200, laps: 3 }, null);
  ok(`a reported lap is held to ${KART_REPORTED_LAP[0]} to ${KART_REPORTED_LAP[1]} m (the runtime's 800 to 1800, a little either side for hills)`, lo?.lap === KART_REPORTED_LAP[0] && hi?.lap === KART_REPORTED_LAP[1] && mid?.lap === 1200, `${lo?.lap} / ${mid?.lap} / ${hi?.lap}`);
  const none = [course(null), course({}), course({ L: 'far', laps: 3 }), course({ L: NaN }), course({ L: 1574.9, laps: 2 }, parent, mkCode, { ...k, laps: 3 })];
  ok('no drive (or a junk lap, or a drive whose laps are not the code\'s): nothing stored, the route\'s fallback as before (minimal, provisional)', none.every((x) => x === null) && min.source === 'minimal' && !kartMeasured(min));
  ok('an inherited table counts as measured; course and minimal are provisional', kartMeasured({ source: 'measured' }) && kartMeasured({ source: 'inherited' }) && !kartMeasured({ source: 'course' }) && !kartMeasured({ source: 'minimal' }) && !kartMeasured(null));
  ok('and the route takes stored inherited and course constants as they are', kartConstants({ kartScore: same }, mkCode, k) === same && kartConstants({ kartScore: c }, mkCode, k) === c);
  const ids = /const IDS = \[([^\]]*)\]/.exec(rd('lib/runtime/kart-roster.js'));
  ok('the racers filled in are the roster\'s eight (kart-roster.js IDS, as measure.mjs measures them)', !!ids && ids[1].replace(/['\s]/g, '') === KART_RACER_IDS.join(','), ids ? ids[1] : 'IDS not found');
  ok('the results screen keeps the next-tier hint for measured constants only (kart.js: measured or inherited)', /var measured = C\.source === 'measured' \|\| C\.source === 'inherited';/.test(rd('lib/runtime/kart.js')) && /else if \(!measured\) hint = /.test(rd('lib/runtime/kart.js')));

  // 3. the migration that signs Meme Kart's live rows: on a database of its own
  const sha = (s) => createHash('sha256').update(String(s).trim()).digest('hex');
  ok('the migration signs exactly the shipped code (its files\' sha256) with the node sim\'s signature for it', MEME_KART_TRACKS.every((T) => sha(rd('deploy/migrations/' + T.file)) === T.code && sigOf({ code: rd('deploy/migrations/' + T.file) }) === T.sig && T.lap === M.lap && T.laps === M.laps),
    MEME_KART_TRACKS.map((T) => `${T.slug} ${T.sig}`).join(', '));
  const dir = mkdtempSync(join(tmpdir(), 'gamemog-mig-')), path = join(dir, 'm.db');
  try {
    const db = new DatabaseSync(path);
    db.exec('CREATE TABLE games (id TEXT PRIMARY KEY, slug TEXT, code TEXT, meta TEXT); CREATE TABLE migrations (id TEXT PRIMARY KEY, at INTEGER NOT NULL, note TEXT)');
    const MIG = '2026-10-09-meme-kart-track-sig';
    for (const m of MIGRATIONS) if (m.id !== MIG) db.prepare('INSERT INTO migrations (id, at, note) VALUES (?, 0, ?)').run(m.id, 'check');
    const { trackSig: _s, ...unsigned } = M, live = JSON.stringify({ ...meta, kartScore: unsigned });
    db.prepare('INSERT INTO games VALUES (?, ?, ?, ?)').run('a', 'meme-kart', rd('deploy/migrations/meme-kart.js'), live);
    // (The Original rebuilt since: its code another, so it is left alone)
    db.prepare('INSERT INTO games VALUES (?, ?, ?, ?)').run('b', 'meme-kart-original', rd('deploy/migrations/meme-kart-original.js') + '\n// rebuilt', live);
    db.close();
    const quiet = console.log; console.log = () => {}; try { migrate(path); migrate(path); } finally { console.log = quiet; }
    const db2 = new DatabaseSync(path), row = (id) => JSON.parse(db2.prepare('SELECT meta FROM games WHERE id = ?').get(id).meta);
    const a = row('a'), b = row('b'), note = db2.prepare('SELECT note FROM migrations WHERE id = ?').get(MIG)?.note;
    const { trackSig: sa, ...restA } = a.kartScore;
    ok('it adds the signature to a row of that code and nothing else (every constant, every other field as it was), a rebuilt row left alone, once',
      sa === mk && JSON.stringify(restA) === JSON.stringify(unsigned) && JSON.stringify({ ...a, kartScore: null }) === JSON.stringify({ ...meta, kartScore: null }) && JSON.stringify(b) === live
        && /meme-kart: signed/.test(note ?? '') && /meme-kart-original: left alone/.test(note ?? ''), note ?? 'not run');
    db2.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
  return { n, fails };
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  const { n, fails } = runKartMogTests();
  console.log(`\n${n - fails}/${n} passed`); process.exit(fails ? 1 : 0);
}
