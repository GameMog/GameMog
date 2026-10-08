// Calibrates the kart score (lib/runtime/kart-score.js, the owner's weights of 8 Oct: time 80 / place 10 / GM 5 /
// hits 5) against the measured perfect run, the bounds and the five driver models, and derives the tier cut-offs.
//
//   node scripts/kart-score/calibrate.mjs --arch <archetypes.json> --summary <run-all summary.json> [--logs <dir>]
//        [--constants <meta.kartScore json>] [--write]
//
// --arch and --summary are the outputs of scripts/.scratch/kart/score/archetypes.mjs and run-all.mjs (re-run them after
// a physics change: SPEC.md). Without --constants the world's constants are measured afresh (measure.mjs, ~15 s).
// --write keeps the result as scripts/kart-score/calibration.json, the fixture test-score.mjs checks the library against.
//
// The tier cut-offs (the rule): each tier keeps the time it meant in the spec (SPEC.md section 5: the time a win with
// the expert's GM and hits, 38 and 3, needs, as a share over the racer's own T*), scored under the owner's weights and
// rounded to the nearest 50. The script prints them, and says so when lib/runtime/kart-score.js differs.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { measure } from './measure.mjs';
await import('../../lib/runtime/kart-score.js');
const K = globalThis.KartScore;

const HERE = dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const J = (f) => JSON.parse(readFileSync(resolve(f), 'utf8'));
const arch = J(arg('arch')), summary = J(arg('summary')), logs = arg('logs', dirname(resolve(arg('summary'), '..')));
const C = arg('constants') ? J(arg('constants')) : await measure({ world: 'worlds/meme-kart.js' });
const RACER = arch.racer || 'pepe', TS = C.tStar[RACER];
const f0 = (n) => Math.round(n).toLocaleString('en-US');
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))]; };
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const sc = (T, P, G, H, racer = RACER, extra = {}) => K.score({ timeMs: T * 1000, place: P, gm: G, hits: H, racer, ...extra }, C);
const R = { at: new Date().toISOString(), weights: K.W, constants: C };

console.log('constants (meta.kartScore):', JSON.stringify(C));
R.ceiling = Object.fromEntries(Object.keys(C.tStar).map((r) => [r, K.ceiling(C, r)]));
R.ceilingNoGm = K.ceiling({ ...C, gmCap: 0 }, RACER);
console.log(`ceiling (T <= T*, 1st, every GM and hit the caps count): ${K.ceiling(C, RACER)} (8000 + 1000 + ${sc(0, 1, C.gmCap, 0).gm} + ${sc(0, 1, 0, C.hitsCap).hits}); a world with no GM: ${R.ceilingNoGm}\n`);

// 1. the tiers (the rule above)
const ANCHOR = [['mog', 118.4], ['moon', 126.9], ['diamond', 132.5], ['candle', 142.3], ['hodl', 152.0], ['paper', 167.1]];
const SPEC_TS = 105.441; // Pepe's T* when the spec's tier times were measured (they are kept as shares over it)
R.tiers = K.TIERS.map((t) => {
  const a = ANCHOR.find(([id]) => id === t.id), T = a ? a[1] * TS / SPEC_TS : null, s = a ? sc(T, 1, 38, 3).total : 0;
  return { id: t.id, name: t.name, color: t.color, bar: t.bar, anchorTime: T && +T.toFixed(2), anchorScore: s, proposed: a ? Math.round(s / 50) * 50 : 0, inFile: t.min };
});
console.log('tiers: the spec\'s time for each (1st, 38 GM, 3 hits, ' + RACER + '), scored now, rounded to 50');
for (const t of R.tiers) console.log(`${t.name.padEnd(14)} ${t.anchorTime ? '<= ' + t.anchorTime + ' s' : '        '}  ${String(t.anchorScore).padStart(5)} -> ${String(t.proposed).padStart(5)}  (file: ${t.inFile})${t.proposed !== t.inFile ? '  <- DIFFERS' : ''}`);
const tierOf = (s) => K.tier(s);

// 2. reference runs
console.log('\nreference runs');
R.refs = [];
const ref = (label, p) => { console.log(label.padEnd(64), String(p.total).padStart(5), ` time ${p.time} finish ${p.finish} gm ${p.gm} hits ${p.hits}  ${p.tier.name}`); R.refs.push({ label, total: p.total, time: p.time, finish: p.finish, gm: p.gm, hits: p.hits, tier: p.tier.id }); return p.total; };
ref(`theoretical perfect (${RACER}): T*, 1st, GM cap, hits cap`, sc(TS, 1, C.gmCap, C.hitsCap));
ref('near-perfect: T* +2%, 1st, 120 GM, 20 hits', sc(TS * 1.02, 1, 120, 20));
ref('near-perfect: T* +5%, 1st, 100 GM, 10 hits', sc(TS * 1.05, 1, 100, 10));
ref('lucky items: the floor, 1st, gmMax, hitsMax', sc(C.tFloor[RACER], 1, C.gmMax, C.hitsMax));
R.oracle = {};
for (const id of Object.keys(summary.oracle)) {
  const o = summary.oracle[id], b = o.runs.find((r) => r.T === o.best); R.oracle[id] = { T: b.T, gm: b.gm };
  ref(`oracle ${id} ${b.T} s, ${b.gm} GM, solo, 0 hits`, sc(b.T, 1, b.gm, 0, id));
  ref(`  + 3 bashes in passing (+0.6 s)`, sc(b.T + 0.6, 1, b.gm, 3, id));
  ref(`  complete: + the coin lines (+3.2 s, 91 GM) + 5 bashes (+1 s)`, sc(b.T + 4.2, 1, 91, 5, id));
}
const gmRuns = [];
if (existsSync(logs)) for (const f of readdirSync(logs).filter((f) => /^gm-mpc-.*\.log$/.test(f))) for (const l of readFileSync(resolve(logs, f), 'utf8').split('\n')) { const m = l.match(/^(\w+) seed (\d+) T ([\d.]+) .* gm (\d+)/); if (m) gmRuns.push({ id: m[1], seed: +m[2], T: +m[3], gm: +m[4] }); }
for (const g of gmRuns) ref(`GM-chasing oracle ${g.id} s${g.seed} ${g.T} s, ${g.gm} GM, + 5 bashes (+1 s)`, sc(g.T + 1, 1, g.gm, 5, g.id));
R.gmChasing = gmRuns;

// 3. the archetypes, run by run
console.log(`\narchetypes (${RACER}, the AI field and items on, ${arch.n} seeded races each)`);
console.log('kind'.padEnd(12), 'mean'.padStart(6), 'p10'.padStart(6), 'p50'.padStart(6), 'p90'.padStart(6), 'min'.padStart(6), 'max'.padStart(6), '  tiers');
R.archetypes = {};
for (const [kind, A] of Object.entries(arch.kinds)) {
  const runs = A.runs.map((r) => [+r.T.toFixed(3), r.place, r.gm, r.hits, r.est ? 1 : 0, r.progress ?? null]);
  const S = runs.map(([T, P, G, H, e, p]) => sc(T, P, G, H, RACER, { estimated: !!e, progress: p }).total);
  const tc = {}; S.forEach((s) => { const t = tierOf(s).name; tc[t] = (tc[t] || 0) + 1; });
  console.log(kind.padEnd(12), ...[mean(S), q(S, 0.1), q(S, 0.5), q(S, 0.9), Math.min(...S), Math.max(...S)].map((v) => f0(v).padStart(6)), ' ', JSON.stringify(tc));
  R.archetypes[kind] = { runs, mean: Math.round(mean(S)), p10: q(S, 0.1), p50: q(S, 0.5), p90: q(S, 0.9), min: Math.min(...S), max: Math.max(...S), tiers: tc, scores: S };
}

// 4. the exchange rate: a second against the next 10 GM and the next hit, at each level
console.log('\nthe exchange rate: what 1 s is worth, and the next 10 GM / the next hit in seconds');
R.rates = [];
for (const [label, T, G, H] of [['oracle', 115.4, 46, 0], ['expert', 126.8, 38, 3], ['clean', 129.7, 42, 0], ['average', 148.7, 39, 4], ['novice', 156.7, 34, 4], ['slow', 175, 30, 3]]) {
  const s0 = sc(T, 1, G, H), perS = s0.time - sc(T + 1, 1, G, H).time, g10 = sc(T, 1, G + 10, H).gm - s0.gm, h1 = sc(T, 1, G, H + 1).hits - s0.hits;
  console.log(`${label.padEnd(8)} ${T} s: 1 s = ${perS} pts; next 10 GM = ${g10} pts (${(g10 / perS).toFixed(2)} s); next hit = ${h1} pts (${(h1 / perS).toFixed(2)} s)`);
  R.rates.push({ label, T, perSecond: perS, next10GM: g10, next10GMsec: +(g10 / perS).toFixed(2), nextHit: h1, nextHitSec: +(h1 / perS).toFixed(2) });
}

// 5. farming: what a run gains in GM or hits against what it pays in time and place
console.log('\nfarming and chasing (the deltas)');
const ex = arch.kinds.expert.summary, ag = arch.kinds.aggressor.summary, av = arch.kinds.average.summary, nv = arch.kinds.novice.summary;
const at = (T, P, G, H, racer) => sc(T, P, G, H, racer).total;
const E = [ex.time.mean, 1, ex.gm.mean, ex.hits.mean], base = at(...E);
const o = R.oracle.bull, ob = at(o.T, 1, o.gm, 0, 'bull');
const pairs = [
  ['expert circles a rival for 5 more bashes (+8 s: 1.2 s untouchable each, plus the turn)', base, at(E[0] + 8, 1, E[2], E[3] + 5)],
  ['expert circles for 10 more bashes (+15 s)', base, at(E[0] + 15, 1, E[2], E[3] + 10)],
  ['expert stays in the pack for hits (expert mean -> aggressor mean)', base, at(ag.time.mean, Math.round(ag.place.mean), ag.gm.mean, ag.hits.mean)],
  ['average driver bashes the pack (average mean -> aggressor mean)', at(av.time.mean, Math.round(av.place.mean), av.gm.mean, av.hits.mean), at(ag.time.mean, Math.round(ag.place.mean), ag.gm.mean, ag.hits.mean)],
  ['novice circles for 5 more bashes (+8 s)', at(nv.time.mean, Math.round(nv.place.mean), nv.gm.mean, nv.hits.mean), at(nv.time.mean + 8, Math.round(nv.place.mean), nv.gm.mean, nv.hits.mean + 5)],
  ['expert turns back for a missed coin line (+6 s, +5 GM)', base, at(E[0] + 6, 1, E[2] + 5, E[3])],
  ['expert chases every coin (+6.2 s, +37 GM)', base, at(E[0] + 6.2, 1, E[2] + 37, E[3])],
  ['novice chases every coin (+6.2 s, +37 GM)', at(nv.time.mean, Math.round(nv.place.mean), nv.gm.mean, nv.hits.mean), at(nv.time.mean + 6.2, Math.round(nv.place.mean), nv.gm.mean + 37, nv.hits.mean)],
  ['oracle (bull) waits 20 s for the pack and bashes all 7 (keeps 1st)', ob, at(o.T + 20, 1, o.gm, 7, 'bull')],
  ['oracle (bull) circles for 5 bashes (+8 s)', ob, at(o.T + 8, 1, o.gm, 5, 'bull')],
  ['oracle (bull) takes 3 bashes in passing (+0.6 s)', ob, at(o.T + 0.6, 1, o.gm, 3, 'bull')],
  ['oracle (bull) takes the coin lines on its way (30 -> 91 GM, +3.2 s)', ob, at(o.T + 3.2, 1, 91, 0, 'bull')],
  ['luck: the best GM Bags (+63 GM) on an expert run', base, at(E[0], 1, E[2] + 63, E[3])],
  ['luck: a Pump, 1.5 s faster, on an expert run', base, at(E[0] - 1.5, 1, E[2], E[3])],
  ['luck: WHALE DUMP, +4 hits at once, on an expert run', base, at(E[0], 1, E[2], E[3] + 4)],
];
R.tradeoffs = pairs.map(([label, before, after]) => ({ label, before, after, delta: after - before }));
for (const t of R.tradeoffs) console.log(`${t.label.padEnd(76)} ${String(t.before).padStart(5)} -> ${String(t.after).padStart(5)}  (${t.delta >= 0 ? '+' : ''}${t.delta})`);
// where does a bash, or a coin line, pay for the time it costs? (1st, 40 GM, 3 hits; 1.5 s a bash, 6 s a line of 5)
R.breakEven = [];
for (const T of [113.8, 115.4, 118, 120, 123, 126.8, 130, 140, 150, 160, 175]) {
  const s0 = at(T, 1, 40, 3), bash = at(T + 1.5, 1, 40, 4) - s0, bash5 = at(T + 8, 1, 40, 8) - s0, line = at(T + 6, 1, 45, 3) - s0, chaseAll = at(T + 6.2, 1, 77, 3) - s0;
  R.breakEven.push({ T, bash1: bash, bash5, coinLine: line, chaseAll });
}
console.log('\nat each time (1st, 40 GM, 3 hits): one more bash for 1.5 s / circling 5 for 8 s / turning back for a coin line (6 s, 5 GM) / chasing every coin (+6.2 s, +37 GM)');
for (const b of R.breakEven) console.log(`${String(b.T).padStart(6)} s   ${String(b.bash1).padStart(5)}  ${String(b.bash5).padStart(5)}  ${String(b.coinLine).padStart(5)}  ${String(b.chaseAll).padStart(5)}`);

// 6. the time each tier asks for (1st, 38 GM, 3 hits; then 8th place, 30 GM, 4 hits)
R.tierTimes = K.TIERS.filter((t) => t.min > 0).map((t) => ({ tier: t.name, min: t.min, first: +(K.timeFor(t.min, { place: 1, gm: 38, hits: 3, racer: RACER }, C) / 1000).toFixed(2), eighth: +((K.timeFor(t.min, { place: 8, gm: 30, hits: 4, racer: RACER }, C) ?? 0) / 1000).toFixed(2) }));
console.log(`\nthe time each tier asks for (${RACER}; 1st place, 38 GM, 3 hits | 8th place, 30 GM, 4 hits)`);
for (const t of R.tierTimes) console.log(`${t.tier.padEnd(14)} ${String(t.min).padStart(5)}   1st: <= ${t.first} s   8th: <= ${t.eighth || '-'} s`);

// 7. tier shares under a player mix (a model; real players have a longer slow tail than the novice model)
const mix = { expert: 0.03, clean: 0.07, average: 0.4, novice: 0.4, aggressor: 0.1 };
const share = {}; for (const t of K.TIERS) share[t.name] = 0;
for (const [k, w] of Object.entries(mix)) { const S = R.archetypes[k].scores; for (const s of S) share[tierOf(s).name] += w / S.length; }
console.log('\ntier shares under a player mix', JSON.stringify(mix)); for (const t of K.TIERS) console.log(`${t.name.padEnd(14)} ${(share[t.name] * 100).toFixed(1)}%`);
R.mix = mix; R.shares = Object.fromEntries(Object.entries(share).map(([k, v]) => [k, +(v * 100).toFixed(1)]));

// 8. unfinished runs (178 s estimated, 8th, 30 GM, 4 hits)
R.dnf = [0.5, 0.8, 0.95].map((p) => ({ progress: p, score: sc(178, 8, 30, 4, RACER, { estimated: true, progress: p }).total }));
console.log('\nunfinished (178 s est., 8th, 30 GM, 4 hits):', R.dnf.map((d) => `${d.progress * 100}% ${d.score}`).join(', '));

for (const k of Object.keys(R.archetypes)) delete R.archetypes[k].scores;
if (process.argv.includes('--write')) { const f = resolve(HERE, 'calibration.json'); writeFileSync(f, JSON.stringify(R, null, 1) + '\n'); console.log('\nwrote', f); }
