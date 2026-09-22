import { z } from 'zod';
import { RigSchema, DEFAULT_RIG } from './rig';

/**
 * A WorldSpec is the entire authored surface of a game.
 *
 * It is deliberately small and entirely declarative. A model filling this in
 * cannot change how the character moves, how the controls feel, or what the
 * engine does — it can only choose what the world looks like, where the track
 * goes, and who is running on it. That is the whole safety and reliability
 * story: there is no code path from generated output to executed script.
 *
 * Feel (timing windows, CPU pace) comes from a named difficulty preset instead
 * of from the model, because getting a rhythm ladder right is tuning work, not
 * creative work, and a model guessing at it produces unplayable races.
 */

const Hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'expected #RRGGBB');
const Rgba = z.string().regex(/^rgba?\([\d\s.,]+\)$/, 'expected rgba(...)');

export const DIFFICULTIES = ['gentle', 'standard', 'brutal'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const WorldSpecSchema = z.object({
  schemaVersion: z.literal(1),

  meta: z.object({
    title: z.string().min(2).max(40),
    tagline: z.string().min(4).max(140),
    /** One or two sentences of world flavour, shown on the game page. */
    blurb: z.string().min(10).max(400),
  }),

  format: z.literal('race'),
  difficulty: z.enum(DIFFICULTIES),

  track: z.object({
    /** Closed Catmull-Rom loop. Y is elevation. */
    points: z.array(z.tuple([z.number(), z.number(), z.number()])).min(6).max(24),
    scale: z.number().min(0.4).max(1.6),
    roadHalf: z.number().min(4).max(9),
    // 7 is what a 5.9m half-road holds at a readable 1.3m spacing; see scripts/check.ts
    lanes: z.array(z.number().min(-9).max(9)).min(2).max(7),
  }),

  racers: z
    .array(
      z.object({
        name: z.string().min(1).max(14),
        fur: Hex,
        you: z.boolean(),
        /** Index into track.lanes. */
        lane: z.number().int().min(0).max(6),
        /** Body, fur and face proportions. Bounded, so no rig can break the rig. */
        rig: RigSchema,
      })
    )
    .min(2)
    .max(7),

  palette: z.object({
    light: Hex,
    skyLow: Hex,
    skyMid: Hex,
    skyHigh: Hex,
    skyAmbient: Hex,
    groundAmbient: Hex,
    fog: Hex,
    fogDensity: z.number().min(0.0008).max(0.009),
    sunDir: z.tuple([z.number(), z.number(), z.number()]),
    terrain: z.object({ moss: Hex, pale: Hex, sand: Hex, accent: Hex }),
    /** How the world grades across the three tempo levels: calm -> urgent. */
    moodRamp: z
      .array(z.object({ accent: Hex, fog: Hex, light: Hex, sky: Hex, tint: Rgba }))
      .length(3),
  }),

  props: z.object({
    caps: z.object({
      count: z.number().int().min(0).max(400),
      /** [capTop, capUnder, stem] */
      palettes: z.array(z.tuple([Hex, Hex, Hex])).min(1).max(8),
    }),
    tufts: z.object({
      count: z.number().int().min(0).max(6000),
      palettes: z.array(z.tuple([Hex, Hex])).min(1).max(6),
    }),
    lanterns: z.object({
      spacing: z.number().min(10).max(80),
      post: Hex,
      bulb: Hex,
      glow: Hex,
    }),
    gate: z.object({
      post: Hex,
      banner: Hex,
      pennants: z.array(Hex).min(2).max(8),
    }),
    islets: z.object({ count: z.number().int().min(0).max(20), caps: z.array(Hex).min(1).max(6) }),
    spores: z.object({
      count: z.number().int().min(0).max(4000),
      hue: z.number().min(0).max(1),
      hueSpread: z.number().min(0).max(0.5),
      sat: z.number().min(0).max(1),
    }),
  }),

  copy: z.object({
    /** Six lines, best place first. Shorter than the field is fine — padded. */
    placeTitles: z.array(z.string().min(2).max(40)).length(6),
    placeLines: z.array(z.string().min(6).max(180)).length(6),
  }),
});

export type WorldSpec = z.infer<typeof WorldSpecSchema>;

/* ------------------------------------------------------------ difficulty -- */
/**
 * The tempo ladder.
 *
 * Every lap is a level. The window you have to hit narrows exponentially, the
 * pack speeds up, and the rubber band that was carrying you lets go.
 *
 * These numbers are measured, not felt. `scripts/difficulty-sim.ts` replays the
 * engine's exact arithmetic against a player modelled as a metronome with
 * Gaussian timing error, and `npm run check` asserts the resulting win rates.
 * The previous ladder was tuned by hand and simulated at a **100% win rate for
 * every skill level including a random masher**, which is exactly what it felt
 * like to play.
 *
 * Two structural facts drove the rebuild.
 *
 * First, the old windows were wildly asymmetric: ANDANTE ran 210ms to 420ms
 * around an ideal of 297ms. Because a stride's value is fixed but its cost is
 * the time you waited, tapping at the fast edge of a wide window beat tapping
 * well, and the simulator found it immediately: optimal play was to hammer at
 * 0.70x the ideal. The game rewarded rate, not rhythm. Windows are now
 * symmetric, and narrow enough that the fast edge loses:
 *
 *     in-band quality runs 1.28 at the ideal down to 1.14 at the edge, so
 *     edge-tapping wins iff 1.14 * ideal/lo > 1.28, i.e. iff lo < 0.891*ideal.
 *
 * MIN_LO_RATIO keeps every band clear of that, and check.ts asserts it.
 *
 * Second, difficulty has to be a property of the ladder rather than an
 * accident of the world. A four-rival world was materially easier than a
 * five-rival one, and a 1280m loop was 36x harder than a 340m one, because
 * sustaining accuracy compounds with race length. The rival pace ladder is now
 * normalised in the engine, and `paceFor()` below compensates for lap length.
 */
type TempoBand = {
  n: number;
  name: string;
  tag: string;
  lo: number;
  hi: number;
  ideal: number;
  imp: number;
  cpu: number;
  chase: number;
  mercy: number;
  shake: number;
  spore: number;
};

/** Below this ratio of lo to ideal, hammering the fast edge beats playing well. */
export const MIN_LO_RATIO = 0.9;

/** Drag is uniform across tiers: the impulses below are solved against it. */
const DRAG = 0.345;
const MAX_SPEED = 36;

/**
 * The impulse that makes flawless play settle at `targetV` metres per second.
 * Solves imp * (1.28 * 1.264) = v * DRAG * ideal * (1 + 0.012v), which is the
 * engine's own drag integration at equilibrium with a full streak bonus.
 */
const impFor = (ideal: number, targetV: number) =>
  +((targetV * DRAG * ideal * (1 + 0.012 * targetV)) / (1.28 * 1.264)).toFixed(3);

type Rung = {
  name: string; tag: string;
  /** Seconds between strides this lap asks for. */
  ideal: number;
  /** Half-window, as a fraction of ideal. Must stay under 1 - MIN_LO_RATIO. */
  w: number;
  /** Speed flawless play settles at. */
  v: number;
  cpu: number; chase: number; mercy: number; shake: number; spore: number;
};

const rung = (n: number, r: Rung): TempoBand => ({
  n,
  name: r.name,
  tag: r.tag,
  ideal: r.ideal,
  lo: +(r.ideal * (1 - r.w)).toFixed(4),
  hi: +(r.ideal * (1 + r.w)).toFixed(4),
  imp: impFor(r.ideal, r.v),
  cpu: r.cpu,
  chase: r.chase,
  mercy: r.mercy,
  shake: r.shake,
  spore: r.spore,
});

/**
 * Windows, in milliseconds either side of the ideal:
 *
 *            lap 1     lap 2     lap 3
 *   gentle    +-42      +-21      +-12
 *   standard  +-40      +-18      +-10
 *   brutal    +-37      +-16       +-8
 *
 * Lap 1 is generous and the pack dawdles, so anybody who can hold a beat leads
 * it. Lap 2 halves the window and the pack wakes up. Lap 3 halves it again and
 * the pace-setter runs faster than all but flawless play, which is the whole
 * point: the third lap is not meant to be won often.
 */
export const LADDERS: Record<Difficulty, TempoBand[]> = {
  gentle: [
    rung(1, { name: 'ANDANTE', tag: 'the pack dawdles', ideal: 0.40, w: 0.100, v: 26, cpu: 0.76, chase: 2.0, mercy: 5.5, shake: 1.0, spore: 1.0 }),
    rung(2, { name: 'ALLEGRO', tag: 'the window halves', ideal: 0.26, w: 0.082, v: 30, cpu: 1.00, chase: 4.0, mercy: 2.6, shake: 1.3, spore: 1.8 }),
    rung(3, { name: 'PRESTO', tag: 'the pack hunts you', ideal: 0.17, w: 0.071, v: 33, cpu: 1.20, chase: 5.0, mercy: 1.6, shake: 1.7, spore: 2.8 }),
  ],
  standard: [
    rung(1, { name: 'ANDANTE', tag: 'the pack dawdles', ideal: 0.40, w: 0.100, v: 27, cpu: 0.80, chase: 2.0, mercy: 5.0, shake: 1.0, spore: 1.0 }),
    rung(2, { name: 'ALLEGRO', tag: 'the window halves', ideal: 0.26, w: 0.070, v: 31, cpu: 1.05, chase: 4.5, mercy: 2.2, shake: 1.3, spore: 1.8 }),
    rung(3, { name: 'PRESTO', tag: 'the pack hunts you', ideal: 0.17, w: 0.059, v: 34, cpu: 1.28, chase: 5.5, mercy: 1.4, shake: 1.7, spore: 2.8 }),
  ],
  brutal: [
    rung(1, { name: 'ANDANTE', tag: 'the pack dawdles', ideal: 0.40, w: 0.096, v: 27, cpu: 0.79, chase: 2.2, mercy: 4.2, shake: 1.0, spore: 1.0 }),
    rung(2, { name: 'ALLEGRO', tag: 'the window halves', ideal: 0.26, w: 0.060, v: 31, cpu: 1.12, chase: 5.0, mercy: 1.6, shake: 1.3, spore: 1.8 }),
    rung(3, { name: 'PRESTO', tag: 'nothing short of flawless', ideal: 0.17, w: 0.047, v: 34, cpu: 1.34, chase: 6.0, mercy: 1.0, shake: 1.7, spore: 2.8 }),
  ],
};

/**
 * Lap-length compensation for the pack's pace.
 *
 * Holding a window is a per-stride coin flip, so the odds of holding it for a
 * whole race compound with the number of strides in it. Measured on the
 * standard ladder against a 7ms player, the same pack speed produced a 63% win
 * over a 340m loop and a 4% win over a 1280m one. Nobody chose that; the
 * generator chose a loop length for variety and it moved the difficulty by an
 * order of magnitude.
 *
 * So the pace is scaled against the 740m reference, by the factor the
 * simulation says holds the win rate flat. Clamped, because past about a
 * kilometre the effect saturates and further easing just hands the race back.
 */
export function paceFor(lapMetres: number) {
  return +Math.min(1.05, Math.max(0.993, 1 + 0.075 * (1 - lapMetres / 740))).toFixed(4);
}

export const PHYSICS: Record<Difficulty, { drag: number; maxSpeed: number }> = {
  gentle: { drag: DRAG, maxSpeed: MAX_SPEED },
  standard: { drag: DRAG, maxSpeed: MAX_SPEED },
  brutal: { drag: DRAG, maxSpeed: MAX_SPEED },
};

/* --------------------------------------------------------------- compile -- */
const THREE_SOURCES = [
  'https://cdn.jsdelivr.net/npm/three@0.157.0/build/three.min.js',
  'https://cdn.jsdelivr.net/npm/three@0.157.0/build/three.js',
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
];

const hexInt = (h: string) => parseInt(h.slice(1), 16);

/** Length of one lap in metres. Catmull-Rom runs a little long, hence 1.04. */
export function loopLength(points: [number, number, number][], scale: number) {
  let total = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    total += Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  }
  return total * scale * 1.04;
}

/**
 * Expand an authored WorldSpec into the exact shape the engine reads.
 * The engine never sees a WorldSpec directly, only this.
 */
export function compileWorld(spec: WorldSpec, id: string) {
  const ladder = LADDERS[spec.difficulty];
  const ramp = spec.palette.moodRamp;
  // the pack's pace is scaled so a world's difficulty is the one it declares,
  // not a side effect of how long its loop happens to be
  const pace = paceFor(loopLength(spec.track.points, spec.track.scale));

  return {
    meta: { id, title: spec.meta.title, tagline: spec.meta.tagline },
    runtime: { threeSources: THREE_SOURCES },
    race: { laps: ladder.length },
    physics: PHYSICS[spec.difficulty],
    track: spec.track,
    // fur must be an integer: the HUD renders it with .toString(16)
    racers: spec.racers.map((r) => ({ ...r, fur: hexInt(r.fur), rig: r.rig ?? DEFAULT_RIG })),
    tempi: ladder.map((b, i) => ({
      ...b,
      cpu: +(b.cpu * pace).toFixed(4),
      col: ramp[i].accent,
      fog: ramp[i].fog,
      light: ramp[i].light,
      sky: ramp[i].sky,
      tint: ramp[i].tint,
    })),
    palette: spec.palette,
    props: spec.props,
    copy: spec.copy,
  };
}

export type RuntimeWorld = ReturnType<typeof compileWorld>;
