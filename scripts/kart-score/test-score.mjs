// The kart score's properties, checked against lib/runtime/kart-score.js itself and the calibration fixture
// (calibration.json, written by calibrate.mjs --write). No server, no kart.js changes needed:
//   node scripts/kart-score/test-score.mjs          (scripts/platform-check.ts runs it too)
import { readFileSync } from 'node:fs';
import { courseConstants, kartConstants, checkKartRun, literalLap, KART_CLASS_TOP } from '../../lib/kart-score.ts';
await import('../../lib/runtime/kart-score.js');
const K = globalThis.KartScore;

export function runKartScoreTests(log = console.log) {
  const F = JSON.parse(readFileSync(new URL('./calibration.json', import.meta.url), 'utf8')), C = F.constants;
  const racers = Object.keys(C.tStar);
  let fails = 0, n = 0;
  const ok = (name, cond, detail = '') => { n++; if (!cond) fails++; log((cond ? 'ok   ' : 'FAIL ') + 'kart score: ' + name + (detail ? '  ' + detail : '')); };
  let s = 12345; const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const randRun = (c = C) => ({ timeMs: (60 + rnd() * 200) * 1000, place: 1 + Math.floor(rnd() * 8), gm: Math.floor(rnd() * (c.gmMax + 20)), hits: Math.floor(rnd() * (c.hitsMax + 10)), estimated: rnd() < 0.2, progress: rnd(), racer: racers[Math.floor(rnd() * racers.length)] });
  const sc = (T, P, G, H, racer = 'pepe', x = {}) => K.score({ timeMs: T * 1000, place: P, gm: G, hits: H, racer, ...x }, C).total;

  // 1. never 10,000: the highest any input scores, for every racer and every set of constants the formula allows
  ok('the weights are the owner\'s: time 8,000, finish 1,000, GM 500, hits 500', K.W.time === 8000 && K.W.finish === 1000 && K.W.gm === 500 && K.W.hits === 500);
  const worlds = [C, { ...C, gmCap: 0 }, { ...C, hitsCap: 1 }, { ...C, hitsCap: 400, gmCap: 4000 }, courseConstants({ L: 800, laps: 1, cls: 'degen' }), kartConstants(null, '', null)];
  for (const w of worlds) ok(`ceiling < 10,000 (${w.source}, gmCap ${w.gmCap}, hitsCap ${w.hitsCap})`, racers.every((r) => K.ceiling(w, r) < 10000), racers.map((r) => K.ceiling(w, r)).join('/'));
  ok('the ceiling is 9,975 (8,000 + 1,000 + 477 + 498), and 9,998 in a world with no GM', K.ceiling(C, 'pepe') === 9975 && K.ceiling({ ...C, gmCap: 0 }, 'pepe') === 9998, `${K.ceiling(C, 'pepe')} / ${K.ceiling({ ...C, gmCap: 0 }, 'pepe')}`);
  let top = 0; for (let i = 0; i < 200000; i++) { const w = worlds[i % worlds.length]; top = Math.max(top, K.score({ ...randRun(w), timeMs: rnd() < 0.1 ? 0 : rnd() * 400000, gm: rnd() * 1e6, hits: rnd() * 1e6, progress: rnd() * 3 }, w).total); }
  ok('no run of 200,000 random ones (any time, even 0; any GM and hits) reaches 10,000', top < 10000, String(top));
  ok('junk in scores 0, never NaN or 10,000', [{}, { timeMs: NaN }, { timeMs: 'x', place: 'y' }, { timeMs: -5, place: -3, gm: -9, hits: -9 }].every((r) => { const t = K.score(r, C).total; return Number.isInteger(t) && t >= 0 && t < 10000; }) && K.score({ timeMs: 120000, place: 1 }, {}).time === 0);

  // 2. monotonic in every component, each moved alone, finished or not, for every racer
  const dirs = [['timeMs', -250], ['place', -1], ['gm', 1], ['hits', 1], ['progress', 0.05]];
  const bad = [];
  for (let i = 0; i < 50000; i++) {
    const r = randRun(); r.place = Math.max(2, r.place); const s0 = K.score(r, C).total;
    for (const [k, d] of dirs) { const r2 = { ...r, [k]: r[k] + d }; if (k === 'progress' && r2.progress > 1) continue; if (K.score(r2, C).total < s0) bad.push([k, r]); }
    if (r.estimated && K.score({ ...r, estimated: false }, C).total < s0) bad.push(['finish', r]);
  }
  ok('a faster time, a better place, more GM, more hits, more of the race driven, finishing: never a lower score (50,000 runs)', bad.length === 0, bad.length ? JSON.stringify(bad[0]) : '');
  let mism = 0; for (let i = 0; i < 20000; i++) { const p = K.score(randRun(), C); if (!Number.isInteger(p.total) || p.total !== p.time + p.finish + p.gm + p.hits || p.total < 0 || p.tier !== K.tier(p.total)) mism++; }
  ok('every score is a whole number, Time + Finish + GM + Hits = the score, and its tier is the score\'s', mism === 0);
  ok('per racer: the same share over your own perfect time scores the same, whoever you drive', new Set(racers.map((r) => sc(C.tStar[r] * 1.2, 1, 40, 3, r))).size === 1, racers.map((r) => sc(C.tStar[r] * 1.2, 1, 40, 3, r)).join(' '));
  ok('per racer: Bull Run (the fastest kart) needs a faster time than Pepe for the same score', sc(120, 1, 40, 3, 'bull') < sc(120, 1, 40, 3, 'pepe'));
  ok('a racer the constants do not know is held to the strictest perfect time', sc(120, 1, 40, 3, 'nobody') === sc(120, 1, 40, 3, 'bull') && sc(120, 1, 40, 3, null) === sc(120, 1, 40, 3, 'bull'));
  ok('GM and hits past their caps count nothing', sc(120, 1, C.gmCap + 50, 3) === sc(120, 1, C.gmCap, 3) && sc(120, 1, 40, C.hitsCap + 20) === sc(120, 1, 40, C.hitsCap));

  // 3. the tiers
  const T = K.TIERS;
  ok('seven tiers, highest first, from MOG down to Rekt at 0', T.length === 7 && T.map((t) => t.id).join() === 'mog,moon,diamond,candle,hodl,paper,rekt' && T.every((t, i) => i === 0 || T[i - 1].min > t.min) && T[6].min === 0);
  // (the site's design contract, scripts/design-check.ts: no purple, hue 250 to 320 at saturation over .25, no neon over .92)
  const hue = (h) => { const v = parseInt(h.slice(1), 16), r = ((v >> 16) & 255) / 255, g = ((v >> 8) & 255) / 255, b = (v & 255) / 255, mx = Math.max(r, g, b), d = mx - Math.min(r, g, b); if (d < 0.08) return { h: 0, s: 0 }; const x = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return { h: x * 60, s: d / mx }; };
  const loud = T.flatMap((t) => [t.color, t.bar]).filter((c) => { const q = hue(c); return (q.h >= 250 && q.h <= 320 && q.s > 0.25) || q.s > 0.92; });
  ok('every tier colour is a plain hex within the design contract (no purple, no neon), and every tier is reachable', T.every((t) => /^#[0-9A-F]{6}$/.test(t.color) && /^#[0-9A-F]{6}$/.test(t.bar)) && !loud.length && T.every((t) => K.ceiling(C, 'pepe') >= t.min), loud.join(' '));
  ok('the cut-offs are the calibration\'s (calibrate.mjs)', F.tiers.every((t) => T.find((x) => x.id === t.id).min === t.proposed), T.map((t) => t.min).join('/'));
  const A = F.archetypes, scores = (k) => A[k].runs.map(([t, p, g, h, e, pr]) => sc(t, p, g, h, 'pepe', { estimated: !!e, progress: pr }));
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const ex = scores('expert'), cl = scores('clean'), av = scores('average'), nv = scores('novice'), ag = scores('aggressor');
  ok('MOG means near-perfect: above every expert run, and every near-perfect run (T* +5%, 1st, 100 GM, 10 hits) is MOG', Math.max(...ex) < T[0].min && K.tier(sc(C.tStar.pepe * 1.05, 1, 100, 10)).id === 'mog', `${Math.max(...ex)} < ${T[0].min}`);
  ok('the complete perfect run (the oracle, its coin lines and 5 bashes in passing) is MOG, for every racer', Object.entries(F.oracle).every(([r, o]) => K.tier(sc(o.T + 4.2, 1, 91, 5, r)).id === 'mog'));
  ok('an expert win lands Moonshot or Diamond Hands, every one of 15', ex.every((v) => ['moon', 'diamond'].includes(K.tier(v).id)), ex.map((v) => K.tier(v).name).join(', '));
  ok('order of the driver models: expert > clean > average and aggressor > novice', mean(ex) > mean(cl) && mean(cl) > mean(av) && mean(cl) > mean(ag) && Math.min(mean(av), mean(ag)) > mean(nv), [ex, cl, av, ag, nv].map((a) => Math.round(mean(a))).join(' / '));
  ok('every expert run outscores every novice run', Math.min(...ex) > Math.max(...nv));
  const dnf = (p) => sc(178, 8, 30, 4, 'pepe', { estimated: true, progress: p });
  ok('a race called before your finish counts the share you drove, and stays Rekt even at 95%', dnf(0.5) < dnf(0.8) && dnf(0.8) < dnf(0.95) && K.tier(dnf(0.95)).id === 'rekt' && dnf(0.95) < Math.min(...nv), `${dnf(0.5)} / ${dnf(0.8)} / ${dnf(0.95)}`);

  // 4. farming loses at every level a person drives (from 17% over the racer's perfect time; the expert's best run is
  // 17.6% over): a bash for 1.5 s, circling for 5, a coin line for 6 s, every coin for 6.2 s
  const human = [1.17, 1.2, 1.25, 1.35, 1.45, 1.6, 1.8].map((f) => C.tStar.pepe * f);
  ok('farming loses for every human: a bash for 1.5 s, 5 for 8 s, a coin line for 6 s, every coin for 6.2 s', human.every((t) => sc(t + 1.5, 1, 40, 4) < sc(t, 1, 40, 3) && sc(t + 8, 1, 40, 8) < sc(t, 1, 40, 3) && sc(t + 6, 1, 45, 3) < sc(t, 1, 40, 3) && sc(t + 6.2, 1, 77, 3) < sc(t, 1, 40, 3)));
  ok('staying in the pack for hits costs an expert thousands', sc(149.3, 6, 48, 19.5) < mean(ex) - 2000);
  ok('the luckiest GM Bags (+63 GM) are worth under 2% of an expert run', sc(126.8, 1, 38 + 63, 3) - sc(126.8, 1, 38, 3) < 200);

  // 5. constants: the fallback is low (an unmeasured world can only score lower), and measured To The Moon is stored
  const fb = courseConstants({ L: C.lap, laps: C.laps, cls: 'normal' });
  ok('the course fallback\'s perfect time and floor are under every racer\'s measured ones, and its GM cap is exact', racers.every((r) => fb.tStar < C.tStar[r] && fb.tFloor < C.tFloor[r]) && fb.gmCap === C.gmCap, `${fb.tStar} / ${fb.tFloor} / ${fb.gmCap}`);
  const kart = readFileSync(new URL('../../lib/runtime/kart.js', import.meta.url), 'utf8').match(/top = cls === 'chill' \? ([\d.]+) : cls === 'degen' \? ([\d.]+) : ([\d.]+)/);
  ok('the fallback\'s class speeds are kart.js\'s (kartRules)', !!kart && +kart[1] === KART_CLASS_TOP.chill && +kart[2] === KART_CLASS_TOP.degen && +kart[3] === KART_CLASS_TOP.normal, kart ? kart.slice(1).join('/') : 'kartRules not found');
  ok('a lap from written-out points (the polygon, kept 800 to 1800 m), else none', literalLap('track: { width: 14, points: [[0, 0], [400, 0], [400, 300], [0, 300]] }') === 1400 && literalLap('track: { points: SEG.map(f) }') === null);
  const meta = JSON.parse(readFileSync(new URL('../../deploy/migrations/meme-kart.meta.json', import.meta.url), 'utf8')).meta.kartScore;
  ok('Meme Kart ships its measured constants (meta.kartScore), the calibration\'s', meta && meta.source === 'measured' && kartConstants({ kartScore: meta }, '', null) === meta && racers.every((r) => meta.tStar[r] === C.tStar[r]));

  // 6. the route's check (checkKartRun): the client's score is never read
  const good = { place: 1, laps: 3, timeMs: 126_800, gm: 38, hits: 3, racer: 'pepe' };
  const chk = (b) => checkKartRun(b, C, 3);
  ok('the route takes a plausible run, scoring it from its parts (a posted score of 9,999 is ignored)', chk({ ...good, score: 9999 }).ok && K.score(chk({ ...good, score: 9999 }).run, C).total === sc(126.8, 1, 38, 3));
  const refused = [{ assisted: true }, { place: 0 }, { place: 9 }, { place: 1.5 }, { laps: 4 }, { timeMs: C.tFloor.pepe * 1000 - 1 }, { timeMs: 31 * 60_000 }, { gm: C.gmMax + 1 }, { gm: -1 }, { hits: C.hitsMax + 1 }, { hits: 2.5 }, { estimated: 'yes' }, { estimated: true, progress: 1 }, { progress: 1.5 }];
  ok('and refuses an assisted run, a place outside 1 to 8, the wrong laps, a time under the floor or over 30 min, GM or hits past their maxima, a bad progress', refused.every((b) => !chk({ ...good, ...b }).ok), refused.filter((b) => chk({ ...good, ...b }).ok).map((b) => JSON.stringify(b)).join(' '));
  const rev = chk({ ...good, timeMs: (C.tStar.pepe - 1) * 1000 }), clean = chk(good);
  ok('a run under the racer\'s perfect time (but over the floor) is kept for review; the floor is per racer', rev.ok && rev.review && clean.ok && !clean.review && chk({ ...good, racer: 'bull', timeMs: (C.tFloor.bull + 0.3) * 1000 }).ok && !chk({ ...good, racer: 'pepe', timeMs: (C.tFloor.bull + 0.3) * 1000 }).ok);
  return { n, fails };
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  const { n, fails } = runKartScoreTests();
  console.log(`\n${n - fails}/${n} passed`); process.exit(fails ? 1 : 0);
}
