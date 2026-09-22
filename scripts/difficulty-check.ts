/**
 * Difficulty contract.
 *
 * The brief: lap 1 easy, lap 2 exponentially harder, lap 3 won only by an
 * extraordinary run, on every world. And, learned the hard way: without
 * changing how the game feels. An earlier rebuild hit its win-rate targets and
 * still wrecked the game, because it slowed lap 1's rhythm, narrowed its window
 * and cut the top speed; races got a quarter longer and the lock chain that
 * makes the game fun fell from ~28 locks a race to ~4. So the first block
 * below pins the feel to the original values, and only then are outcomes
 * checked.
 *
 * Seeds are fixed, so a number that moves means the ladder moved.
 */
import { LADDERS, PHYSICS, MIN_LO_RATIO, paceFor, DIFFICULTIES, type Difficulty } from '../lib/worldspec.ts';
import { raceWorld, shippedBands } from './difficulty-sim.ts';
import { course } from '../lib/course.ts';
import { buildTrack, TRACK_LENGTHS, TRACK_SHAPES } from '../lib/track.ts';
import { MUSE_SPRINT } from '../lib/presets/muse-sprint.ts';

type Track = { points: [number, number, number][]; scale: number };
const gen = (shape: (typeof TRACK_SHAPES)[number], length: (typeof TRACK_LENGTHS)[number]) =>
  buildTrack({ length, shape, elevation: 0.4, seed: 1234 }, 5.9) as Track;
const MUSE = MUSE_SPRINT.track as Track;
/** The generator's extremes: shortest and twistiest, longest and most flowing, and the middle. */
const SPREAD: [string, Track][] = [
  ['Muse Sprint', MUSE],
  ['hairpins sprint', gen('hairpins', 'sprint')],
  ['oval epic', gen('oval', 'epic')],
  ['serpentine standard', gen('serpentine', 'standard')],
];

/** The hand-tuned ladder the game shipped with, before any difficulty work. */
const ORIGINAL = [
  { lo: 0.21, hi: 0.42, ideal: 0.297, imp: 2.46, cpu: 0.85, chase: 2.5, mercy: 4.0 },
  { lo: 0.155, hi: 0.29, ideal: 0.212, imp: 2.14, cpu: 1.08, chase: 4.0, mercy: 2.4 },
  { lo: 0.12, hi: 0.215, ideal: 0.161, imp: 1.92, cpu: 1.16, chase: 5.5, mercy: 0.8 },
];
const ORIGINAL_PHYSICS = { gentle: 0.33, standard: 0.345, brutal: 0.36 };
const ORIGINAL_LAP1: Record<Difficulty, [number, number]> = { gentle: [1.28, 0.9], standard: [1, 1], brutal: [0.82, 1.07] };

const SD = { casual: 0.030, good: 0.016, expert: 0.011, elite: 0.007, flawless: 0.003 };

function measure(d: Difficulty, sd: number, track: Track = MUSE, rivals = 4, runs = 100, fixed?: number) {
  let wins = 0, place = 0, lead1 = 0, locks = 0;
  for (let i = 0; i < runs; i++) {
    const r = raceWorld({ difficulty: d, track, rivals, sd, fixed, seed: 700 + i * 7919 });
    if (r.place === 1) wins++;
    place += r.place; locks += r.locks;
    if (r.standing[0] === 1) lead1++;
  }
  return { win: wins / runs, place: place / runs, leadsLap1: lead1 / runs, locks: locks / runs };
}

type Ok = (name: string, cond: boolean, detail?: string) => void;
const near = (a: number, b: number) => Math.abs(a - b) < 1e-3;

export function runDifficultyChecks(ok: Ok) {
  console.log('\ndifficulty: the game still feels like the game');
  for (const d of DIFFICULTIES) {
    const l = LADDERS[d];
    const [bm, cm] = ORIGINAL_LAP1[d];
    const o = ORIGINAL[0], half = ((o.hi - o.lo) / 2) * bm;
    const want = d === 'standard' ? o : { ...o, lo: o.ideal - half, hi: o.ideal + half, cpu: o.cpu * cm };
    ok(`${d}: lap 1 is exactly the original lap 1`,
      near(l[0].lo, want.lo) && near(l[0].hi, want.hi) && near(l[0].cpu, want.cpu) &&
      l[0].chase === o.chase && l[0].mercy === o.mercy && l[0].imp === o.imp,
      `${l[0].lo}-${l[0].hi}s, pack ${l[0].cpu}`);
    ok(`${d}: every lap keeps its original rhythm and stride`,
      l.every((b, i) => b.ideal === ORIGINAL[i].ideal && b.imp === ORIGINAL[i].imp),
      l.map((b) => `${Math.round(b.ideal * 1000)}ms`).join(' / '));
    ok(`${d}: original drag and top speed`, PHYSICS[d].drag === ORIGINAL_PHYSICS[d] && PHYSICS[d].maxSpeed === 36);
  }
  for (const [name, t] of SPREAD) {
    ok(`lap 1's pack is never rescaled (${name})`, shippedBands('standard', t)[0].cpu === ORIGINAL[0].cpu);
  }
  const feel = measure('standard', SD.good, MUSE, 5);
  ok('a good player still chains locks', feel.locks >= 12, `${feel.locks.toFixed(0)} locks a race on Muse Sprint`);

  console.log('\ndifficulty: each lap harder than the last');
  for (const d of DIFFICULTIES) {
    const w = LADDERS[d].map((b) => b.hi - b.lo);
    ok(`${d}: the window shrinks at least 2.5x a lap`, w[0] / w[1] >= 2.5 && w[1] / w[2] >= 2.5,
      w.map((v) => `${Math.round(v * 1000)}ms`).join(' -> '));
    const l = LADDERS[d];
    ok(`${d}: the pack speeds up and the rubber band lets go`,
      l[0].cpu < l[1].cpu && l[0].cpu < l[2].cpu && l[0].mercy > l[1].mercy && l[1].mercy > l[2].mercy);
    ok(`${d}: lap 3 cannot be won by hammering its fast edge`, l[2].lo / l[2].ideal >= MIN_LO_RATIO,
      `lo/ideal ${(l[2].lo / l[2].ideal).toFixed(3)}`);
  }

  console.log('\ndifficulty: no world is unwinnable');
  // Over a long lap the pack has time to catch anyone slower than it, so on
  // any loop over ~700m the pace-setter's average lap-3 speed, corners
  // included, must stay under top speed or flawless play loses. That is exactly
  // how every long world once became impossible. On a short loop there is no
  // time to catch anyone, and the measured result below is what counts.
  for (const d of DIFFICULTIES) for (const len of ['standard', 'long', 'epic'] as const) for (const shape of ['oval', 'hairpins'] as const) {
    const t = gen(shape, len), c = course(t.points, t.scale);
    const wuff = (26.4 + 0.8 + 0.4) * LADDERS[d][2].cpu * paceFor(c) - c.meanCorner;
    ok(`${d} ${shape} ${len}: lap 3's pace-setter averages under top speed`, wuff < 36, `${wuff.toFixed(1)} m/s against 36`);
  }
  for (const [name, t] of SPREAD) {
    const f = measure('standard', SD.flawless, t);
    ok(`flawless play wins ${name}`, f.win >= 0.9, `${(f.win * 100).toFixed(0)}%`);
  }

  console.log('\ndifficulty: lap 1 easy, lap 3 rare');
  for (const d of DIFFICULTIES) {
    const m = measure(d, SD.casual);
    ok(`${d}: an ordinary player (30ms) leads after lap 1`, m.leadsLap1 >= 0.9, `${(m.leadsLap1 * 100).toFixed(0)}% of runs`);
  }
  const steady = [0.12, 0.2, 0.26].map((f) => measure('standard', 0.004, MUSE, 5, 50, f).win);
  ok('tapping one steady rhythm and ignoring the dial never wins', steady.every((w) => w === 0), steady.join(', '));
  const good = SPREAD.map(([, t]) => measure('standard', SD.good, t).win);
  ok('a good player (16ms) never wins a standard world', good.every((w) => w === 0), good.join(', '));
  const expert = SPREAD.map(([, t]) => measure('standard', SD.expert, t).win);
  ok('an expert (11ms) almost never does', expert.every((w) => w <= 0.03), expert.map((w) => `${(w * 100).toFixed(0)}%`).join(', '));

  // every track type the generator can produce, not a hand-picked few
  const elite: string[] = []; let lo = 1, hi = 0;
  for (const shape of TRACK_SHAPES) for (const len of TRACK_LENGTHS) {
    const w = measure('standard', SD.elite, gen(shape, len), 4, 80).win;
    lo = Math.min(lo, w); hi = Math.max(hi, w); elite.push(`${shape} ${len} ${(w * 100).toFixed(0)}%`);
  }
  ok('an elite run (7ms) wins, rarely, on all 25 generated track types', lo > 0 && hi <= 0.3,
    `${(lo * 100).toFixed(0)}% to ${(hi * 100).toFixed(0)}%`);
  const rivals = [3, 4, 5, 6].map((n) => measure('standard', SD.elite, MUSE, n, 120).win);
  ok('field size does not change the answer', Math.max(...rivals) - Math.min(...rivals) <= 0.15,
    rivals.map((w) => `${(w * 100).toFixed(0)}%`).join(', ') + ' with 3-6 rivals');
}
