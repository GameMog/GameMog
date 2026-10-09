// The kart score's constants for a kart world (meta.kartScore; docs/RULES.md "Kart score"), measured headless in node
// from the world's own track and the kit's own rules: lib/runtime/kart.js, read as text by sim.mjs, never copied.
//
//   node scripts/kart-score/measure.mjs worlds/meme-kart.js            print the constants
//   node scripts/kart-score/measure.mjs --game meme-kart [--db data/gamemog.db]
//        measure a stored game's code, write its meta.kartScore and rescore its kart rows (an operator's command: it
//        runs the world's code in node, so only for a world you trust: first-party worlds and Mogs, or one you read)
//   import { measure } from './measure.mjs';  const C = await measure({ world: 'worlds/meme-kart.js' });
//
// For every racer (the eight of kart-roster.js), on a worker each:
//  - tStar: the relaxed kart's minimum time (dp.mjs; see bound.mjs in scripts/.scratch/kart/score for the
//    relaxations, every one of which only makes it faster): a lower bound on any run without items or slipstream.
//    10,000 is anchored there, per racer (the owner, 8 Oct), so a racer's score is about the driving, not the pick
//  - tFloor: the same with no turning limit at the To The Moon rocket's speed (or 1.45 x top) everywhere: the floor for
//    any run, items and luck and all. The scores route refuses anything faster
// and for the world: gmCap (coins laid in the race + every rival's purse: what the score counts), gmMax (+ the
// luckiest GM Bags: what the route accepts), hitsCap 30 / hitsMax 64 (the aggressor model's ceiling; SPEC), karts, laps.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { load } from './sim.mjs';
import { makeDP } from './dp.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const VERSION = 1, HITS_CAP = 30, HITS_MAX = 64, BAG_GM = 3;
const r3 = (x) => +x.toFixed(3);

// one racer's two bounds (a worker's job): ds / dy the DP's grid (4 m / 0.2 m; coarser only reads lower, so safe)
function solveRacer({ world, code, id, ds = 4, dy = 0.2 }) {
  const W = load({ world, code, hooks: false }), K = W.rules, DP = makeDP(W, world);
  const c = W.cast.find((q) => q.id === id);
  const R = DP.solveLine(c.stats, { ds, dy, margin: 1.1 });
  const Vitems = Math.max(K.items.moon.v, K.items.moon.vmul * R.top, R.top * K.hard);
  const I = DP.solveLine(c.stats, { ds, dy, margin: 1.1, noTurn: true, items: Vitems });
  return { id, top: r3(R.top), tStar: r3(R.T), tFloor: r3(I.T) };
}

if (!isMainThread && workerData && workerData.job === 'racer') parentPort.postMessage(solveRacer(workerData));

/**
 * The constants, measured. world: a path under the repo; or code: the world's text.
 * @param {{ world?: string | null, code?: string | null, ds?: number, dy?: number }} [o]
 */
export async function measure({ world = null, code = null, ds = 4, dy = 0.2 } = {}) {
  const t0 = Date.now();
  const W = load({ world: world ?? undefined, code: code ?? undefined, hooks: false }), K = W.rules, CO = W.TR.course;
  const ids = W.cast.map((c) => c.id);
  const out = await Promise.all(ids.map((id) => new Promise((ok, no) => {
    const w = new Worker(fileURLToPath(import.meta.url), { workerData: { job: 'racer', world, code, id, ds, dy } });
    w.once('message', ok); w.once('error', no); w.once('exit', (n) => { if (n) no(new Error(`racer ${id}: worker exit ${n}`)); });
  })));
  const karts = 8, laps = W.laps, lines = CO.gm || 0, coins = lines * K.gm.line * laps;
  // (the Airdrop rows a lap: the course's, or the four 'auto' lays (kart.js layCrates); none with items off. Only the
  // route's ceiling (gmMax) reads them, so the generous side is the safe one: an honest run's GM Bags are never refused)
  const itemsOn = W.KD.items !== false, gmCap = coins ? coins + (karts - 1) * K.purse : 0;
  const rows = !itemsOn ? 0 : Array.isArray(CO.drops) ? CO.drops.length : CO.drops === 'auto' || CO.drops == null ? 4 : 0;
  const kartSrc = readFileSync(resolve(ROOT, 'lib/runtime/kart.js'), 'utf8'), worldSrc = code ?? readFileSync(resolve(ROOT, world), 'utf8');
  const sha = (s) => createHash('sha1').update(s).digest('hex').slice(0, 12);
  return {
    version: VERSION, source: 'measured',
    tStar: Object.fromEntries(out.map((r) => [r.id, r.tStar])),
    tFloor: Object.fromEntries(out.map((r) => [r.id, r.tFloor])),
    karts, laps, gmCap,
    gmMax: gmCap ? gmCap + BAG_GM * rows * laps : 0,
    hitsCap: HITS_CAP, hitsMax: HITS_MAX,
    lap: +W.TR.L.toFixed(1),
    // the track's signature (kart.js kartTrackSig, the same string the race gives in the browser): a Mog whose drive
    // reports this one races this track, and inherits these constants at publish (lib/kart-score.ts)
    trackSig: W.make({}).trackSig,
    physics: sha(kartSrc), world: sha(worldSrc), at: new Date().toISOString(), ms: Date.now() - t0,
  };
}

/** The course fallback (no measurement): see lib/kart-score.ts courseConstants, which the route uses; this one reads the real lap. */
/** @param {{ world?: string | null, code?: string | null }} [o] */
export function courseFromSim({ world = null, code = null } = {}) {
  const W = load({ world: world ?? undefined, code: code ?? undefined, hooks: false });
  return { L: W.TR.L, laps: W.laps, cls: W.cls, gmLines: W.TR.course.gm || 0, top: Math.max(...W.cast.map((c) => c.stats.top)), trackSig: W.make({}).trackSig };
}

if (isMainThread && process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (k) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : undefined; };
  const slug = arg('game');
  if (!slug) {
    const world = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'worlds/meme-kart.js';
    console.log(JSON.stringify(await measure({ world, ds: +(arg('ds') ?? 4), dy: +(arg('dy') ?? 0.2) }), null, 1));
  } else {
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(resolve(ROOT, arg('db') ?? 'data/gamemog.db'));
    const g = db.prepare('SELECT id, code, meta FROM games WHERE slug = ?').get(slug);
    if (!g) { console.error('no game', slug); process.exit(1); }
    const C = await measure({ code: g.code });
    const meta = JSON.parse(g.meta ?? '{}'); meta.kartScore = C;
    db.prepare('UPDATE games SET meta = ? WHERE id = ?').run(JSON.stringify(meta), g.id);
    const n = await rescore(db, g.id, C);
    console.log(JSON.stringify(C), `\nwrote meta.kartScore for ${slug}; rescored ${n} rows`);
  }
}

/** Every kart row of a game scored again under C (the same file the route uses), idempotent. */
export async function rescore(db, gameId, C) {
  await import('../../lib/runtime/kart-score.js'); // (loaded for its effect: globalThis.KartScore)
  const KS = globalThis.KartScore;
  {
    const rows = db.prepare('SELECT * FROM scores WHERE game_id = ?').all(gameId);
    const up = db.prepare('UPDATE scores SET score = ?, score_v = ? WHERE id = ?');
    for (const r of rows) up.run(KS.score({ timeMs: r.time_ms, place: r.place, gm: r.gm, hits: r.kos, estimated: !!r.est, progress: r.progress, racer: r.racer }, C).total, KS.V, r.id);
    return rows.length;
  }
}
