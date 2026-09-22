import { z } from 'zod';

/**
 * A character rig.
 *
 * Muse Sprint's creature was a fixed lathe profile, four limb spheres and a
 * face plate. That made every generated world the same creature in a different
 * colour — a reskin, not a game. These numbers make the body itself authorable
 * while keeping the one property that matters: the rig is *data*, so no
 * combination of values can break the animation, the controls or the camera.
 *
 * Every field is a bounded multiplier against the shipped silhouette rather
 * than an absolute measurement, so the identity rig reproduces Muse Sprint
 * exactly and every other rig is a deformation of a shape already known to
 * read well at racing speed.
 */

export const TOPPERS = ['none', 'ears', 'horns', 'antennae', 'crest'] as const;
export type Topper = (typeof TOPPERS)[number];

/** [min, max, default] — the defaults are Muse Sprint's own proportions. */
export const BOUNDS = {
  height: [0.80, 1.22, 1.0],
  girth: [0.78, 1.26, 1.0],
  /** 0 = one continuous egg, 1 = a pinched neck and a distinct head. */
  headRoom: [0.0, 1.0, 0.0],
  /** Where the body is widest: 0 low and pot-bellied, 1 high and barrel-chested. */
  slouch: [0.0, 1.0, 0.5],
  legLength: [0.55, 1.60, 1.0],
  legStance: [0.65, 1.45, 1.0],
  armLength: [0.60, 1.55, 1.0],
  armGirth: [0.65, 1.40, 1.0],
  /** 0.25 sleek and seal-like, 2.2 deep shag. */
  furLength: [0.25, 2.20, 1.0],
  furDensity: [0.55, 1.75, 1.0],
  faceSize: [0.78, 1.24, 1.0],
  /** Cosine of the hood cone. Lower means a wider opening and more face. */
  faceOpen: [0.74, 0.92, 0.845],
  eyeSize: [0.60, 1.60, 1.0],
  eyeSpread: [0.70, 1.35, 1.0],
  eyeHeight: [-0.12, 0.30, 0.0],
  mouthWidth: [0.45, 1.70, 1.0],
  mouthCurve: [0.25, 1.60, 1.0],
  blush: [0.0, 1.6, 1.0],
  topperSize: [0.5, 1.6, 1.0],
} as const;

type BoundKey = keyof typeof BOUNDS;

export const RigSchema = z.object({
  ...(Object.fromEntries(
    (Object.keys(BOUNDS) as BoundKey[]).map((k) => [
      k,
      z.number().min(BOUNDS[k][0]).max(BOUNDS[k][1]),
    ])
  ) as Record<BoundKey, z.ZodNumber>),
  topper: z.enum(TOPPERS),
  /** Eye ink. Black reads as a dot eye; anything lighter reads as an iris. */
  eye: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});
export type Rig = z.infer<typeof RigSchema>;

export const DEFAULT_RIG: Rig = {
  ...(Object.fromEntries(
    (Object.keys(BOUNDS) as BoundKey[]).map((k) => [k, BOUNDS[k][2]])
  ) as Record<BoundKey, number>),
  topper: 'none',
  eye: '#0E0C0B',
};

/** Clamp anything into the safe envelope rather than rejecting it. */
export function coerceRig(input: Partial<Record<string, unknown>> | undefined): Rig {
  const out: Record<string, unknown> = { ...DEFAULT_RIG };
  for (const k of Object.keys(BOUNDS) as BoundKey[]) {
    const [lo, hi, dflt] = BOUNDS[k];
    const v = input?.[k];
    out[k] = typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : dflt;
  }
  const t = input?.topper;
  out.topper = TOPPERS.includes(t as Topper) ? t : 'none';
  const e = typeof input?.eye === 'string' ? (input.eye as string).trim() : '';
  out.eye = /^#[0-9a-fA-F]{6}$/.test(e) ? e.toUpperCase() : '#0E0C0B';
  return out as Rig;
}

/**
 * Siblings, not clones.
 *
 * The model designs one rig — the player's. Asking it for five would blow the
 * structured-output grammar again and produce five unrelated creatures. Rivals
 * are jittered from the player's rig instead, so the field reads as one species
 * with individual variation, which is also what makes a race legible.
 */
export function varyRig(base: Rig, seed: number, index: number): Rig {
  let s = (seed * 2654435761 + index * 40503) >>> 0;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const jitter = (k: BoundKey, amount: number) => {
    const [lo, hi] = BOUNDS[k];
    const span = (hi - lo) * amount;
    return Math.min(hi, Math.max(lo, base[k] + (rnd() - 0.5) * span));
  };
  return {
    ...base,
    height: jitter('height', 0.55),
    girth: jitter('girth', 0.6),
    headRoom: jitter('headRoom', 0.5),
    slouch: jitter('slouch', 0.7),
    legLength: jitter('legLength', 0.45),
    legStance: jitter('legStance', 0.45),
    armLength: jitter('armLength', 0.45),
    armGirth: jitter('armGirth', 0.45),
    furLength: jitter('furLength', 0.45),
    furDensity: jitter('furDensity', 0.5),
    faceSize: jitter('faceSize', 0.45),
    faceOpen: jitter('faceOpen', 0.5),
    eyeSize: jitter('eyeSize', 0.5),
    eyeSpread: jitter('eyeSpread', 0.5),
    eyeHeight: jitter('eyeHeight', 0.5),
    mouthWidth: jitter('mouthWidth', 0.6),
    mouthCurve: jitter('mouthCurve', 0.6),
    // topper and eye colour stay with the species so the cast looks related
  };
}
