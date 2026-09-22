/**
 * Difficulty simulator.
 *
 * Tuning a rhythm game by feel is how you end up with a game its author always
 * wins. This replays the engine's exact arithmetic headlessly against a player
 * model, so a ladder can be judged by a measured win rate instead of by how it
 * felt to the person who wrote it.
 *
 * Everything below is copied from the engine, not approximated:
 *
 *   player   vel -= vel*DRAG*dt*(1 + vel*0.012);  dist += vel*dt
 *   tap      vel  = min(MAXSPEED, vel + imp*quality*bonus)
 *            bonus = 1 + min(streak,12)*0.022, and every 8th clean stride
 *            is a lock worth a flat +1.7
 *   rival    target = (base + sin(t*surgeF*6.28 + ph)*surgeA + fade*(0.5-lapT)*2) * cpu
 *            target += clamp(gap*0.058, -mercy, chase)
 *            target -= |curvature|*5.5
 *            vel = smoothDamp(vel, max(4,target), 1.5, dt)
 *
 * The player is a metronome with Gaussian timing error, which is the standard
 * model for rhythm-game accuracy. The standard deviations are the interesting
 * part, and they are chosen from published rhythm-game timing research rather
 * than invented: a 7ms deviation is about the limit of trained human motor
 * timing, and a 30ms deviation is an ordinary person keeping a beat.
 *
 * The player is also assumed to play *optimally*: for each ladder we sweep the
 * interval they aim for and keep their best result. Anything less would tune
 * the game against a worse player than the one who will actually show up.
 */
import { LADDERS, PHYSICS, paceFor, type Difficulty } from '../lib/worldspec.ts';

export const SKILLS = [
  { name: 'masher', sd: 0.045 },
  { name: 'casual', sd: 0.030 },
  { name: 'average', sd: 0.022 },
  { name: 'good', sd: 0.016 },
  { name: 'expert', sd: 0.011 },
  { name: 'elite', sd: 0.007 },
  { name: 'inhuman', sd: 0.003 },
] as const;

const LAPS = 3;
const TICK = 1 / 60;
const LOCK_EVERY = 8;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const smoothDamp = (cur: number, tgt: number, lambda: number, dt: number) =>
  lerp(cur, tgt, 1 - Math.exp(-lambda * dt));

/** Deterministic RNG, so a tuning run is reproducible. */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const gauss = (r: () => number) =>
  Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(6.283185 * r());

/**
 * Rival temperaments, and the speed ladder they are hung on.
 *
 * The engine used to give rival i the i-th archetype, which meant the fastest
 * one only existed in a field of five. A four-rival world was therefore a
 * materially easier game than a five-rival one, for no reason anybody chose.
 * The pace is now spread across whatever field the world has, with the last
 * rival always the pace-setter, so difficulty is a property of the ladder and
 * not of how many creatures the generator happened to name.
 */
const TEMPERAMENTS = [
  { surgeA: 1.3, surgeF: 0.30, fade: 2.4 },   // fast starter
  { surgeA: 0.5, surgeF: 0.12, fade: 0.0 },   // metronome
  { surgeA: 2.1, surgeF: 0.21, fade: -2.6 },  // closer
  { surgeA: 2.6, surgeF: 0.46, fade: 0.4 },   // wobbler
  { surgeA: 1.1, surgeF: 0.17, fade: -0.8 },  // the rival
];
export const PACE_SLOW = 20.5, PACE_FAST = 26.6;

export type Band = {
  lo: number; hi: number; ideal: number; imp: number;
  cpu: number; chase: number; mercy: number;
};

export type RaceOpts = {
  bands: Band[];
  lapMetres: number;
  rivals: number;
  drag: number;
  maxSpeed: number;
  /** Player timing standard deviation, seconds. */
  sd: number;
  /** Interval the player aims for, as a multiple of each band's ideal. */
  aimFactor: number;
  seed: number;
  /** Mean |curvature| * 5.5, the speed corners cost a rival. */
  cornerCost?: number;
  /** Slowest and fastest rival pace, for sweeping the field's spread. */
  paceSlow?: number;
  paceFast?: number;
};

export type RaceResult = {
  place: number;
  seconds: number;
  /** Share of strides that landed inside the band, per lap. */
  inBand: number[];
  /** Where the player stood as they crossed the end of laps 1 and 2. */
  standing: number[];
  taps: number;
  locks: number;
};

export function race(o: RaceOpts): RaceResult {
  const r = rng(o.seed);
  const TOTAL = o.lapMetres;
  const FINISH = TOTAL * LAPS;
  const corner = o.cornerCost ?? 0.9;

  const you = { dist: 0, vel: 0, finished: false, time: 0 };
  const rivals = Array.from({ length: o.rivals }, (_, i) => {
    // the pace-setter is always the same temperament; see assignPersonalities
    const a = i === o.rivals - 1 ? TEMPERAMENTS[4] : TEMPERAMENTS[i % 4];
    const t = o.rivals === 1 ? 1 : i / (o.rivals - 1);
    const slow = o.paceSlow ?? PACE_SLOW, fast = o.paceFast ?? PACE_FAST;
    return {
      ...a,
      base: slow + (fast - slow) * t + (r() - 0.5) * 0.5,
      surgePh: r() * 6.28,
      stumbleT: 5 + r() * 9,
      stumble: 0,
      dist: 0, vel: 0, finished: false, time: 0,
    };
  });

  let tempo = 0;
  let T = o.bands[0];
  const standing: number[] = [];
  let lastTap = 0, streak = 0, locks = 0, taps = 0;
  const good = [0, 0, 0], strides = [0, 0, 0];

  // the player's next intended tap, in race seconds
  let nextTap = Math.max(0.05, T.ideal * o.aimFactor + gauss(r) * o.sd);
  let t = 0;
  const CAP = 400;

  while (t < CAP && (!you.finished || rivals.some((x) => !x.finished))) {
    // ---- tempo follows the player's own lap, as in the engine
    const lvl = clamp(Math.floor(you.dist / TOTAL), 0, o.bands.length - 1);
    if (lvl !== tempo) {
      // the player's place at the moment they finish a lap: the story the
      // race tells, as opposed to the result it ends on
      standing.push(1 + rivals.filter((x) => x.dist > you.dist).length);
      tempo = lvl; T = o.bands[lvl];
    }
    const mash = T.lo * 0.60, cold = T.hi * 2.0;

    // ---- the player taps
    if (!you.finished && t >= nextTap) {
      const dt = lastTap ? nextTap - lastTap : 999;
      lastTap = nextTap;
      taps++; strides[tempo]++;

      let quality: number;
      if (dt < mash) {
        quality = 0.12; you.vel *= 0.86; streak = 0;
      } else if (dt < T.lo) {
        quality = lerp(0.45, 1.0, (dt - mash) / (T.lo - mash)); streak = 0;
      } else if (dt <= T.hi) {
        const half = Math.max(T.hi - T.ideal, T.ideal - T.lo);
        quality = lerp(1.28, 1.14, Math.abs(dt - T.ideal) / half);
        streak++; good[tempo]++;
      } else if (dt < cold) {
        quality = lerp(1.0, 0.70, (dt - T.hi) / (cold - T.hi)); streak = 0;
      } else {
        quality = 0.92; streak = 0;
      }

      const bonus = 1 + Math.min(streak, 12) * 0.022;
      you.vel = Math.min(o.maxSpeed, you.vel + T.imp * quality * bonus);
      if (streak > 0 && streak % LOCK_EVERY === 0) {
        locks++;
        you.vel = Math.min(o.maxSpeed, you.vel + 1.7);
      }
      nextTap = lastTap + Math.max(0.02, T.ideal * o.aimFactor + gauss(r) * o.sd);
    }

    // ---- integrate
    if (!you.finished) {
      you.vel = Math.max(0, you.vel - you.vel * o.drag * TICK * (1 + you.vel * 0.012));
      you.dist += you.vel * TICK;
    }

    for (const x of rivals) {
      if (x.finished) continue;
      const lapT = clamp(x.dist / FINISH, 0, 1);
      let target = (x.base
        + Math.sin(t * x.surgeF * 6.28 + x.surgePh) * x.surgeA
        + x.fade * (0.5 - lapT) * 2) * T.cpu;
      target += clamp((you.dist - x.dist) * 0.058, -T.mercy, T.chase);
      target -= corner;
      x.stumbleT -= TICK;
      if (x.stumbleT <= 0) { x.stumble = 0.5; x.stumbleT = 7 + r() * 11; }
      if (x.stumble > 0) { x.stumble -= TICK; target *= 0.72; }
      x.vel = smoothDamp(x.vel, Math.max(4, target), 1.5, TICK);
      x.dist += x.vel * TICK;
    }

    t += TICK;
    if (!you.finished && you.dist >= FINISH) { you.finished = true; you.time = t; }
    for (const x of rivals) if (!x.finished && x.dist >= FINISH) { x.finished = true; x.time = t; }
  }

  if (!you.finished) you.time = CAP;
  const ahead = rivals.filter((x) => x.finished && x.time < you.time).length;
  while (standing.length < 2) standing.push(1 + rivals.filter((x) => x.dist > you.dist).length);
  return {
    place: ahead + 1,
    seconds: you.time,
    inBand: good.map((g, i) => (strides[i] ? g / strides[i] : 0)),
    standing,
    taps,
    locks,
  };
}

/** The ladder exactly as the engine will receive it, pace compensation included. */
export function shippedBands(difficulty: Difficulty, lapMetres: number): Band[] {
  const pace = paceFor(lapMetres);
  return LADDERS[difficulty].map((b) => ({
    lo: b.lo, hi: b.hi, ideal: b.ideal, imp: b.imp,
    cpu: +(b.cpu * pace).toFixed(4), chase: b.chase, mercy: b.mercy,
  }));
}

/** The best any player of this skill can do, across aiming strategies. */
export function bestFor(
  skill: number, base: Omit<RaceOpts, 'sd' | 'aimFactor' | 'seed'>, runs = 260,
  aims = [0.85, 0.92, 0.97, 1.0, 1.03, 1.08]
) {
  let best = { win: -1, aim: 1, podium: 0, inBand: [0, 0, 0], standing: [0, 0], seconds: 1e9, place: 9 };
  for (const aimFactor of aims) {
    let wins = 0, podium = 0, secs = 0, pl = 0;
    const band = [0, 0, 0], st = [0, 0];
    for (let i = 0; i < runs; i++) {
      const res = race({ ...base, sd: skill, aimFactor, seed: 1000 + i * 7919 });
      if (res.place === 1) wins++;
      if (res.place <= 3) podium++;
      secs += res.seconds; pl += res.place;
      res.inBand.forEach((v, k) => (band[k] += v));
      res.standing.forEach((v, k) => { if (k < 2) st[k] += v; });
    }
    const win = wins / runs, seconds = secs / runs;
    if (win > best.win || (win === best.win && seconds < best.seconds)) {
      best = {
        win, aim: aimFactor, podium: podium / runs, seconds, place: pl / runs,
        inBand: band.map((v) => v / runs), standing: st.map((v) => v / runs),
      };
    }
  }
  return best;
}

/** Win rate by skill for a difficulty, on a given world shape. */
export function profile(
  difficulty: Difficulty, lapMetres = 740, rivals = 4, runs = 260
) {
  const bands = shippedBands(difficulty, lapMetres);
  const phys = PHYSICS[difficulty];
  return SKILLS.map((s) => ({
    skill: s.name,
    sdMs: Math.round(s.sd * 1000),
    ...bestFor(s.sd, { bands, lapMetres, rivals, drag: phys.drag, maxSpeed: phys.maxSpeed }, runs),
  }));
}
