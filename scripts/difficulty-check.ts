/**
 * Difficulty contract.
 *
 * The ladder in lib/worldspec.ts is a set of claims about how hard the game
 * is. This turns each claim into an assertion against the simulator, because
 * the previous ladder was also tuned carefully and was nevertheless winnable
 * 100% of the time by a random masher. Nobody noticed until it was measured.
 *
 * Run counts are kept modest so `npm run check` stays quick; seeds are fixed,
 * so a result that moves means the ladder moved.
 */
import { LADDERS, MIN_LO_RATIO, DIFFICULTIES, type Difficulty } from '../lib/worldspec.ts';
import { race, shippedBands } from './difficulty-sim.ts';

const SD = { masher: 0.045, casual: 0.030, average: 0.022, good: 0.016, expert: 0.011, elite: 0.007 };

function measure(d: Difficulty, sd: number, lap = 740, rivals = 4, runs = 140) {
  const bands = shippedBands(d, lap);
  let wins = 0, place = 0, lead1 = 0;
  for (let i = 0; i < runs; i++) {
    const r = race({ bands, lapMetres: lap, rivals, drag: 0.345, maxSpeed: 36,
      sd, aimFactor: 1.0, seed: 77 + i * 7919 });
    if (r.place === 1) wins++;
    place += r.place;
    if (r.standing[0] === 1) lead1++;
  }
  return { win: wins / runs, place: place / runs, leadsLap1: lead1 / runs };
}

type Ok = (name: string, cond: boolean, detail?: string) => void;

export function runDifficultyChecks(ok: Ok) {
  console.log('\ndifficulty: the ladder is shaped the way it claims');
  for (const d of DIFFICULTIES) {
    const l = LADDERS[d];
    const ratios = l.map((b) => b.lo / b.ideal);
    ok(`${d}: no band rewards hammering the fast edge`,
      ratios.every((r) => r >= MIN_LO_RATIO - 1e-9),
      `lo/ideal ${ratios.map((r) => r.toFixed(3)).join(' ')}, floor ${MIN_LO_RATIO}`);

    const w = l.map((b) => (b.hi - b.lo) / 2);
    ok(`${d}: the window narrows at least 1.6x a lap`,
      w[0] / w[1] >= 1.6 && w[1] / w[2] >= 1.6,
      `+-${w.map((v) => (v * 1000).toFixed(0)).join('ms, +-')}ms`);

    ok(`${d}: the pack speeds up every lap`,
      l[0].cpu < l[1].cpu && l[1].cpu < l[2].cpu,
      l.map((b) => b.cpu.toFixed(2)).join(' -> '));

    ok(`${d}: the rubber band lets go every lap`,
      l[0].mercy > l[1].mercy && l[1].mercy > l[2].mercy && l[0].chase < l[2].chase,
      `mercy ${l.map((b) => b.mercy).join('/')}, chase ${l.map((b) => b.chase).join('/')}`);
  }

  console.log('\ndifficulty: lap one is the easy one');
  for (const d of DIFFICULTIES) {
    const m = measure(d, SD.casual);
    ok(`${d}: an ordinary player leads after lap 1`, m.leadsLap1 >= 0.8,
      `leads ${(m.leadsLap1 * 100).toFixed(0)}% of runs, finishes ${m.place.toFixed(1)}`);
  }

  console.log('\ndifficulty: lap three is not meant to be won');
  const masher = DIFFICULTIES.map((d) => measure(d, SD.masher).win);
  ok('nobody wins by mashing', masher.every((w) => w === 0), masher.join(', '));

  const good = measure('standard', SD.good);
  ok('a good player (16ms) never wins a standard world', good.win === 0,
    `finishes ${good.place.toFixed(1)} of 5`);

  const expert = measure('standard', SD.expert);
  ok('an expert (11ms) does not win a standard world either', expert.win <= 0.02,
    `${(expert.win * 100).toFixed(1)}%, finishes ${expert.place.toFixed(1)}`);

  const elite = measure('standard', SD.elite, 740, 4, 300);
  ok('an elite run (7ms) wins standard, but rarely', elite.win > 0 && elite.win <= 0.15,
    `${(elite.win * 100).toFixed(1)}%`);

  const gentle = measure('gentle', SD.elite);
  ok('gentle is the tier an elite run can actually take', gentle.win >= 0.5,
    `${(gentle.win * 100).toFixed(0)}%`);

  const brutal = measure('brutal', SD.elite);
  ok('brutal resists even an elite run', brutal.win === 0,
    `finishes ${brutal.place.toFixed(1)} of 5`);

  console.log('\ndifficulty: the same everywhere, whatever shape the world is');
  const shapes: number[] = [];
  for (const lap of [340, 520, 740, 1000, 1280])
    for (const rivals of [3, 4, 5, 6])
      shapes.push(measure('standard', SD.elite, lap, rivals, 120).win);
  const worst = Math.max(...shapes);
  ok('no world shape is an easy one', worst <= 0.15,
    `hardest ${(Math.min(...shapes) * 100).toFixed(1)}%, easiest ${(worst * 100).toFixed(1)}% across 20 shapes`);

  const placeGrad = [SD.casual, SD.average, SD.good, SD.expert, SD.elite]
    .map((sd) => measure('standard', sd).place);
  ok('placing still improves as you improve',
    placeGrad.every((p, i) => i === 0 || p <= placeGrad[i - 1] + 0.35),
    placeGrad.map((p) => p.toFixed(1)).join(' -> '));
}
