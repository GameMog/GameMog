/**
 * Procedural track generation.
 *
 * Two lessons are baked in here.
 *
 * First, a model is bad at emitting a drivable closed loop as raw spline
 * control points — it produces self-intersecting tracks, hairpins tighter than
 * the road is wide, and laps that end before the tempo banner clears. So it
 * never gets to. The loop is built in polar form with a jittered radius, which
 * makes it star-shaped about its centre, and a star-shaped polygon cannot
 * intersect itself. That single property removes an entire class of broken
 * tracks.
 *
 * Second — and this one cost a whole gallery of near-identical ovals — a model
 * given a continuous numeric range picks the middle of it. Told "0.55 tight,
 * 1.3 sweeping" it answered ~0.9 every single time, and fourteen worlds shipped
 * with laps between 850m and 930m. The knobs are therefore *named discrete
 * choices*, not numbers. An enum forces a decision; a range invites a shrug.
 */

export const TRACK_LENGTHS = ['sprint', 'short', 'standard', 'long', 'epic'] as const;
export const TRACK_SHAPES = ['oval', 'lobed', 'serpentine', 'hairpins', 'sprawling'] as const;
export type TrackLength = (typeof TRACK_LENGTHS)[number];
export type TrackShape = (typeof TRACK_SHAPES)[number];

/** Target lap in metres. Measured and scaled to, not estimated. */
const LENGTH_M: Record<TrackLength, number> = {
  sprint: 340,
  short: 520,
  standard: 740,
  long: 1000,
  epic: 1280,
};

/**
 * Harmonic recipes. Low k gives long straights and sweeping bends; high k gives
 * frequent direction changes. Amplitudes are deliberately far apart so the
 * shapes are told apart at thumbnail size, not just in the data.
 */
const SHAPES: Record<TrackShape, { points: number; harm: { k: number; a: number }[] }> = {
  oval:       { points: 9,  harm: [{ k: 2, a: 0.16 }, { k: 3, a: 0.05 }] },
  lobed:      { points: 12, harm: [{ k: 3, a: 0.34 }, { k: 2, a: 0.14 }, { k: 6, a: 0.07 }] },
  serpentine: { points: 15, harm: [{ k: 4, a: 0.30 }, { k: 7, a: 0.16 }, { k: 2, a: 0.10 }] },
  hairpins:   { points: 16, harm: [{ k: 6, a: 0.36 }, { k: 3, a: 0.20 }, { k: 11, a: 0.09 }] },
  sprawling:  { points: 11, harm: [{ k: 2, a: 0.42 }, { k: 5, a: 0.10 }] },
};

export type TrackBrief = {
  length: TrackLength;
  shape: TrackShape;
  /** 0 flat, 1 rolling hills. */
  elevation: number;
  seed: number;
};

function mulberry(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The narrowest chord the road can take without pinching the corner shut. */
const MIN_CHORD_FACTOR = 2.4;

const perimeter = (p: [number, number, number][]) => {
  let d = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length];
    d += Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  }
  return d * 1.04; // Catmull-Rom runs a little longer than its control polygon
};

export function buildTrack(brief: TrackBrief, roadHalf: number) {
  const shape = SHAPES[brief.shape] ?? SHAPES.lobed;
  const target = LENGTH_M[brief.length] ?? LENGTH_M.standard;
  const rnd = mulberry(brief.seed || 1);
  const n = shape.points;
  const hill = Math.max(0, Math.min(1, brief.elevation));
  const ph = shape.harm.map(() => rnd() * 6.283);
  const hillPh = rnd() * 6.283;

  const build = (base: number) => {
    const pts: [number, number, number][] = [];
    for (let i = 0; i < n; i++) {
      const th = (i / n) * Math.PI * 2;
      let wob = 0;
      shape.harm.forEach((h, j) => (wob += Math.sin(th * h.k + ph[j]) * h.a));
      const r = base * (1 + wob);                       // stays positive: sum(a) < 1
      const y = hill * 10 * Math.sin(th * 2 + hillPh) + hill * 4.5 * Math.sin(th * 3 + ph[0]);
      pts.push([+(Math.cos(th) * r).toFixed(2), +y.toFixed(2), +(Math.sin(th) * r).toFixed(2)]);
    }
    return pts;
  };

  // Build once, measure, then scale to the length that was actually asked for.
  // Estimating the perimeter of a lobed loop analytically is not worth it when
  // measuring is exact.
  let points = build(100);
  const got = perimeter(points);
  points = build((100 * target) / Math.max(got, 1));

  // Guarantee the corner-pinch invariant the playtest checks for, by pushing
  // any too-close pair apart radially rather than rejecting the whole track.
  const minChord = roadHalf * MIN_CHORD_FACTOR;
  for (let pass = 0; pass < 8; pass++) {
    let worst = Infinity;
    for (let i = 0; i < n; i++) {
      const a = points[i], b = points[(i + 1) % n];
      const d = Math.hypot(a[0] - b[0], a[2] - b[2]);
      worst = Math.min(worst, d);
      if (d < minChord) {
        const grow = Math.min(1.3, Math.sqrt(minChord / Math.max(d, 0.01)));
        for (const p of [a, b]) {
          p[0] = +(p[0] * grow).toFixed(2);
          p[2] = +(p[2] * grow).toFixed(2);
        }
      }
    }
    if (worst >= minChord) break;
  }

  return { points, scale: 1 };
}

/** Even lanes across the road, centre-out, so the player sits mid-pack. */
export function buildLanes(count: number, roadHalf: number) {
  const usable = roadHalf - 1.55;
  const step = (usable * 2) / (count - 1);
  return Array.from({ length: count }, (_, i) => +(-usable + i * step).toFixed(2));
}

/**
 * Put the player near the middle of the grid and spread the field either side,
 * so rivals are visible on both flanks instead of all on one shoulder.
 */
export function assignLanes(count: number) {
  const order: number[] = [];
  const mid = Math.floor((count - 1) / 2);
  order.push(mid);
  for (let d = 1; order.length < count; d++) {
    if (mid - d >= 0) order.push(mid - d);
    if (order.length < count && mid + d < count) order.push(mid + d);
  }
  return order;
}

/** A stable seed from text, so two worlds with the same knobs still differ. */
export function seedFrom(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) || 1;
}
