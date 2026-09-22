import { z } from 'zod';

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
        name: z.string().min(1).max(12),
        fur: Hex,
        you: z.boolean(),
        /** Index into track.lanes. */
        lane: z.number().int().min(0).max(6),
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
 * The tempo ladder. Every lap is a level and every level the band you have to
 * hit slides left and narrows, while the pack speeds up and the rubber band
 * that was carrying you lets go. These numbers are tuned, not guessed.
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
  { n: 1, name: 'ANDANTE', tag: 'the pack waits for you', lo: 0.21, hi: 0.42, ideal: 0.297, imp: 2.46, cpu: 0.85, chase: 2.5, mercy: 4.0, shake: 1.0, spore: 1.0 },
  { n: 2, name: 'ALLEGRO', tag: 'the pack closes in', lo: 0.155, hi: 0.29, ideal: 0.212, imp: 2.14, cpu: 1.08, chase: 4.0, mercy: 2.4, shake: 1.3, spore: 1.8 },
  { n: 3, name: 'PRESTO', tag: 'the pack hunts you', lo: 0.12, hi: 0.215, ideal: 0.161, imp: 1.92, cpu: 1.16, chase: 5.5, mercy: 0.8, shake: 1.7, spore: 2.8 },
];

/** Widen or tighten the band and move the field, keeping the ladder's shape. */
function scaleLadder(bands: TempoBand[], bandMul: number, cpuMul: number): TempoBand[] {
  return bands.map((b) => {
    const half = ((b.hi - b.lo) / 2) * bandMul;
    return {
      ...b,
      lo: +(b.ideal - half).toFixed(4),
      hi: +(b.ideal + half).toFixed(4),
      cpu: +(b.cpu * cpuMul).toFixed(3),
    };
  });
}

export const LADDERS: Record<Difficulty, TempoBand[]> = {
  gentle: scaleLadder(STANDARD, 1.28, 0.9),
  standard: STANDARD,
  brutal: scaleLadder(STANDARD, 0.82, 1.07),
};

export const PHYSICS: Record<Difficulty, { drag: number; maxSpeed: number }> = {
  gentle: { drag: 0.33, maxSpeed: 36 },
  standard: { drag: 0.345, maxSpeed: 36 },
  brutal: { drag: 0.36, maxSpeed: 36 },
};

/* --------------------------------------------------------------- compile -- */
const THREE_SOURCES = [
  'https://cdn.jsdelivr.net/npm/three@0.157.0/build/three.min.js',
  'https://cdn.jsdelivr.net/npm/three@0.157.0/build/three.js',
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
];

const hexInt = (h: string) => parseInt(h.slice(1), 16);

/**
 * Expand an authored WorldSpec into the exact shape the engine reads.
 * The engine never sees a WorldSpec directly, only this.
 */
export function compileWorld(spec: WorldSpec, id: string) {
  const ladder = LADDERS[spec.difficulty];
  const ramp = spec.palette.moodRamp;

  return {
    meta: { id, title: spec.meta.title, tagline: spec.meta.tagline },
    runtime: { threeSources: THREE_SOURCES },
    race: { laps: ladder.length },
    physics: PHYSICS[spec.difficulty],
    track: spec.track,
    // fur must be an integer: the HUD renders it with .toString(16)
    racers: spec.racers.map((r) => ({ ...r, fur: hexInt(r.fur) })),
    tempi: ladder.map((b, i) => ({
      ...b,
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
