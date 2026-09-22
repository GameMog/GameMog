/**
 * Difficulty simulator.
 *
 * Replays the engine's arithmetic headlessly so a ladder can be judged by a
 * measured win rate. Everything here is copied from the engine, not
 * approximated: the player's drag, stride quality, streak bonus and locks; the
 * rivals' surge, fade, rubber band, stumbles and corner losses; the real track
 * (lib/course.ts); and the finish-line slow motion.
 *
 * It is only trusted because it was checked against the real game. A harness
 * drove the actual engine in Chrome at 60fps with the same player model and
 * the two agree: race times within half a second at every skill level, and the
 * elite win rate on Muse Sprint 8% simulated against 2 of 12 real races.
 *
 * Two lessons from getting it wrong first:
 *
 *  - A simulator calibrated only against a game everybody wins proves nothing.
 *    The first version charged rivals a flat 0.9 m/s for corners, matched the
 *    original game perfectly (100% = 100%), and was badly wrong the moment the
 *    ladder was close. Real worlds cost rivals 0.5 to 4.8 m/s in corners.
 *
 *  - A good win-rate table can still describe a ruined game. An earlier ladder
 *    hit its targets by slowing lap 1's rhythm, narrowing its window and
 *    cutting top speed, and it felt wrong from the first stride. The contract
 *    in difficulty-check.ts now pins the feel before it measures outcomes.
 *
 * The player is a metronome aiming at each lap's ideal stride with Gaussian
 * timing error: 30ms is an ordinary person keeping a beat, 16ms a good player,
 * 11ms an expert, 7ms about the limit of trained human timing, 3ms flawless.
 */
import { LADDERS, PHYSICS, paceFor, type Difficulty } from '../lib/worldspec.ts';


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
 * Muse Sprint's own five rivals, exactly as the hand-built game shipped them:
 * sprinter, metronome, closer, wobbler, and Wuff, the rival. A world with fewer
 * than five rivals still gets Wuff as its last one, so every world has the same
 * pace-setter; a world with more cycles the first four before Wuff.
 */
const ARCHETYPES = {
  pip: { base: 25.6, surgeA: 1.3, surgeF: 0.30, fade: 2.4 },
  bibo: { base: 24.0, surgeA: 0.5, surgeF: 0.12, fade: 0.0 },
  tova: { base: 23.4, surgeA: 2.1, surgeF: 0.21, fade: -2.6 },
  nim: { base: 24.6, surgeA: 2.6, surgeF: 0.46, fade: 0.4 },
  wuff: { base: 26.4, surgeA: 1.1, surgeF: 0.17, fade: -0.8 },
};
const CYCLE = [ARCHETYPES.pip, ARCHETYPES.bibo, ARCHETYPES.tova, ARCHETYPES.nim];
export const rivalFor = (k: number, n: number) => (k === n - 1 ? ARCHETYPES.wuff : CYCLE[k % 4]);

/* --------------------------------------------------------------- track -- */
/*
 * Races run on the world's real track (lib/course.ts), because corners are
 * where a twisty world hands the player their race. The first version of this
 * file charged every rival a flat 0.9 m/s for corners; real worlds range from
 * 0.5 to 4.8, and the flat guess put the simulated elite win rate at 10% where
 * real races in Chrome won 6 of 7.
 */
import { course } from '../lib/course.ts';
type Pt = [number, number, number];
export const trackProfile = course;

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
  /** If set, the player ignores the dial and taps at this one interval (s). */
  fixed?: number;
  /** The world's actual track. When given, lap length and corners come from it. */
  track?: { points: Pt[]; scale: number };
  /** Model the finish-line slow motion (on by default, as in the engine). */
  photo?: boolean;
  /** Scale the lock bonus by the slow-motion factor, as a stride is. */
  scaledLock?: boolean;
};

export type RaceResult = {
  place: number;
  seconds: number;
  /** Share of strides that landed inside the band, per lap. */
  inBand: number[];
  /** Where the player stood as they crossed the end of laps 1 and 2. */
  standing: number[];
  /** Metres ahead of the best rival at those moments (negative: behind). */
  lead: number[];
  taps: number;
  locks: number;
};

export function race(o: RaceOpts): RaceResult {
  const r = rng(o.seed);
  const prof = o.track ? trackProfile(o.track.points, o.track.scale) : null;
  const TOTAL = prof ? prof.total : o.lapMetres;
  const FINISH = TOTAL * LAPS;
  const cornerAt = (d: number) => {
    if (!prof) return o.cornerCost ?? 0.9;
    let x = d % TOTAL; if (x < 0) x += TOTAL;
    return prof.corner[Math.floor(x)];
  };

  const you = { dist: 0, vel: 0, finished: false, time: 0 };
  const rivals = Array.from({ length: o.rivals }, (_, i) => {
    const a = rivalFor(i, o.rivals);
    return {
      ...a,
      base: a.base + (r() - 0.5) * 0.8,
      surgePh: r() * 6.28,
      stumbleT: 5 + r() * 9,
      stumble: 0,
      dist: 0, vel: 0, finished: false, time: 0,
    };
  });

  let tempo = 0;
  let T = o.bands[0];
  const standing: number[] = [];
  const lead: number[] = [];
  let lastTap = 0, streak = 0, locks = 0, taps = 0;
  const good = [0, 0, 0], strides = [0, 0, 0];

  // the player's next intended tap, in race seconds
  const aim = () => o.fixed ?? T.ideal * o.aimFactor;
  let nextTap = Math.max(0.05, aim() + gauss(r) * o.sd);
  let t = 0;          // real seconds: the player's hands never slow down
  let wt = 0;         // world seconds: what the race clock and the rivals run on
  let timeScale = 1, scaleTarget = 1, armed = false;
  const PHOTO_ARM = 32;
  const CAP = 400;

  while (t < CAP && (!you.finished || rivals.some((x) => !x.finished))) {
    // ---- tempo follows the player's own lap, as in the engine
    const lvl = clamp(Math.floor(you.dist / TOTAL), 0, o.bands.length - 1);
    if (lvl !== tempo) {
      // the player's place at the moment they finish a lap: the story the
      // race tells, as opposed to the result it ends on
      standing.push(1 + rivals.filter((x) => x.dist > you.dist).length);
      lead.push(you.dist - Math.max(...rivals.map((x) => x.dist)));
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
      you.vel = Math.min(o.maxSpeed, you.vel + T.imp * quality * bonus * timeScale);
      if (streak > 0 && streak % LOCK_EVERY === 0) {
        locks++;
        you.vel = Math.min(o.maxSpeed, you.vel + 1.7 * (o.scaledLock ? timeScale : 1));
      }
      nextTap = lastTap + Math.max(0.02, aim() + gauss(r) * o.sd);
    }

    // ---- the finish rig: the last 32m run in slow motion, slower the closer
    //      the nearest rival is, exactly as armPhoto() sets it
    if ((o.photo ?? true) && !armed && !you.finished && FINISH - you.dist <= PHOTO_ARM) {
      armed = true;
      const gap = Math.min(...rivals.map((x) => Math.abs(x.dist - you.dist)));
      scaleTarget = [0.58, 0.38, 0.26][gap < 7 ? 2 : gap < 20 ? 1 : 0];
    }
    if (you.finished) scaleTarget = 1;
    timeScale = smoothDamp(timeScale, scaleTarget, 4.5, TICK);
    const SDT = TICK * timeScale;

    // ---- integrate
    if (!you.finished) {
      you.vel = Math.max(0, you.vel - you.vel * o.drag * SDT * (1 + you.vel * 0.012));
      you.dist += you.vel * SDT;
    }

    for (const x of rivals) {
      if (x.finished) continue;
      const lapT = clamp(x.dist / FINISH, 0, 1);
      let target = (x.base
        + Math.sin(wt * x.surgeF * 6.28 + x.surgePh) * x.surgeA
        + x.fade * (0.5 - lapT) * 2) * T.cpu;
      target += clamp((you.dist - x.dist) * 0.058, -T.mercy, T.chase);
      target -= cornerAt(x.dist);
      x.stumbleT -= SDT;
      if (x.stumbleT <= 0) { x.stumble = 0.5; x.stumbleT = 7 + r() * 11; }
      if (x.stumble > 0) { x.stumble -= SDT; target *= 0.72; }
      x.vel = smoothDamp(x.vel, Math.max(4, target), 1.5, SDT);
      x.dist += x.vel * SDT;
    }

    t += TICK; wt += SDT;
    if (!you.finished && you.dist >= FINISH) { you.finished = true; you.time = wt; }
    for (const x of rivals) if (!x.finished && x.dist >= FINISH) { x.finished = true; x.time = wt; }
  }

  if (!you.finished) you.time = CAP;
  const ahead = rivals.filter((x) => x.finished && x.time < you.time).length;
  while (standing.length < 2) standing.push(1 + rivals.filter((x) => x.dist > you.dist).length);
  return {
    place: ahead + 1,
    seconds: you.time,
    inBand: good.map((g, i) => (strides[i] ? g / strides[i] : 0)),
    standing,
    lead,
    taps,
    locks,
  };
}

/** The ladder exactly as compileWorld hands it to the engine for this track. */
export function shippedBands(difficulty: Difficulty, track: { points: Pt[]; scale: number }): Band[] {
  const pace = paceFor(course(track.points, track.scale));
  return LADDERS[difficulty].map((b, i) => ({
    lo: b.lo, hi: b.hi, ideal: b.ideal, imp: b.imp,
    cpu: i === 0 ? b.cpu : +(b.cpu * pace).toFixed(4), chase: b.chase, mercy: b.mercy,
  }));
}

/** One race on a world's real track, with its tier's own physics. */
export function raceWorld(o: {
  difficulty: Difficulty; track: { points: Pt[]; scale: number }; rivals: number;
  sd: number; seed: number; aimFactor?: number; fixed?: number;
}) {
  return race({
    bands: shippedBands(o.difficulty, o.track), lapMetres: 0, rivals: o.rivals,
    drag: PHYSICS[o.difficulty].drag, maxSpeed: PHYSICS[o.difficulty].maxSpeed,
    sd: o.sd, aimFactor: o.aimFactor ?? 1, fixed: o.fixed, seed: o.seed, track: o.track,
  });
}
