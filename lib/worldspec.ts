import { z } from 'zod';
import { course } from './course';
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
 * The tempo ladder. Every lap is a level.
 *
 * Lap 1 is the original hand-tuned ANDANTE, untouched: same rhythm, same wide
 * window, same slow pack. It is the lap that teaches the game, and it is meant
 * to be won by anybody who can keep a beat.
 *
 * Laps 2 and 3 keep their original rhythm and impulse too, so the game feels
 * the same under your thumb and runs at the same top speed. What changes is
 * only what they demand: the window shrinks about 3x a lap (210ms, then 70ms,
 * then 20ms wide) and the pack gets faster, so the lead lap 1 hands you is
 * clawed back on lap 2 and has to be defended on lap 3 by tapping that is
 * nearly perfect for the whole lap.
 *
 * Lap 3's pack is deliberately held *just below* the game's top speed. A pack
 * faster than top speed would catch even flawless play on a long enough loop,
 * which made every world over ~700m unwinnable when that was tried. Held just
 * below it, flawless play always wins, and the question the lap asks is only
 * whether you can stay that close to flawless.
 *
 * Measured, not felt: scripts/difficulty-sim.ts replays the engine's arithmetic
 * and was checked against real races in Chrome at 60fps (within 3% on time,
 * exact on finishing place). npm run check asserts the outcomes.
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

const STANDARD: TempoBand[] = [
  // the original lap 1, exactly as shipped
  { n: 1, name: 'ANDANTE', tag: 'the pack waits for you', lo: 0.21, hi: 0.42, ideal: 0.297, imp: 2.46, cpu: 0.85, chase: 2.5, mercy: 4.0, shake: 1.0, spore: 1.0 },
  // original rhythm and impulse; window 135ms -> 70ms, pack faster, rubber band tighter
  { n: 2, name: 'ALLEGRO', tag: 'the pack closes in', lo: 0.177, hi: 0.247, ideal: 0.212, imp: 2.14, cpu: 1.322, chase: 9.0, mercy: 1.0, shake: 1.3, spore: 1.8 },
  // original rhythm and impulse; window 95ms -> 18ms, pack just under top speed
  { n: 3, name: 'PRESTO', tag: 'the pack hunts you', lo: 0.152, hi: 0.170, ideal: 0.161, imp: 1.92, cpu: 1.300, chase: 6.0, mercy: 0.2, shake: 1.7, spore: 2.8 },
];

/** Widen or tighten the band and move the field, keeping the ladder's shape. */
function scaleBand(b: TempoBand, bandMul: number, cpuMul: number): TempoBand {
  const half = ((b.hi - b.lo) / 2) * bandMul;
  return { ...b, lo: +(b.ideal - half).toFixed(4), hi: +(b.ideal + half).toFixed(4), cpu: +(b.cpu * cpuMul).toFixed(3) };
}

/**
 * Lap 1 of each tier is scaled exactly as it always was. Laps 2 and 3 get the
 * tier's own late-race multipliers, so no tier's opening lap changed.
 */
function tier(lap1: [number, number], late: [number, number]): TempoBand[] {
  return [scaleBand(STANDARD[0], ...lap1), scaleBand(STANDARD[1], ...late), scaleBand(STANDARD[2], ...late)];
}

export const LADDERS: Record<Difficulty, TempoBand[]> = {
  gentle: tier([1.28, 0.9], [1.12, 0.992]),
  standard: STANDARD,
  brutal: tier([0.82, 1.07], [0.9, 0.99]),
};

export const PHYSICS: Record<Difficulty, { drag: number; maxSpeed: number }> = {
  gentle: { drag: 0.33, maxSpeed: 36 },
  standard: { drag: 0.345, maxSpeed: 36 },
  brutal: { drag: 0.36, maxSpeed: 36 },
};

/** The deciding lap cannot be won by hammering its fast edge: see check.ts. */
export const MIN_LO_RATIO = 0.891;

/**
 * Per-world compensation for the lap 2 and 3 pack. Lap 1 is never touched.
 *
 * Rivals lose 5.5 m/s per radian of curvature, so a twisty world hands the
 * player free speed that a flowing one does not. Across the 21 published
 * worlds that corner cost runs from 0.5 to 4.8 m/s, and with no compensation
 * the same ladder let a merely good player win Whaleback Night Market 87% of
 * the time while stopping even elite play at 1% on The Tick Vault. Loop length
 * matters too, less: a short lap 3 gives the pack less road to claw back a lead.
 *
 * For each of those 21 real tracks the simulator searched for the pack
 * strength that holds an elite run to about an 8% win. One plane fits all 21
 * to within half a percent:
 *
 *     k = 0.9635 + 0.0359 * meanCorner - 0.0442 * ln(lap / 740)
 *
 * so each m/s the corners take from the pack is handed back as ~3.6% pace.
 * Clamped, because a generated track outside the fitted range should get the
 * nearest measured answer rather than an extrapolated one.
 */
export function paceFor(c: { total: number; meanCorner: number }) {
  const k = 0.9635 + 0.0359 * c.meanCorner - 0.0442 * Math.log(c.total / 740);
  return +Math.min(1.19, Math.max(0.95, k)).toFixed(4);
}

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
  // laps 2 and 3 are scaled for this world's own corners and length, so every
  // world is as hard as it declares; lap 1 is left exactly as it was
  const pace = paceFor(course(spec.track.points as [number, number, number][], spec.track.scale));

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
      cpu: i === 0 ? b.cpu : +(b.cpu * pace).toFixed(4),
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
