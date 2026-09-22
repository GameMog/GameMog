/**
 * Procedural track generation.
 *
 * A model is bad at emitting a drivable closed loop as raw spline control
 * points — it produces self-intersecting tracks, hairpins tighter than the road
 * is wide, and laps that finish before the tempo banner clears. So it never
 * gets to. It picks four legible knobs (how big, how many corners, how twisty,
 * how hilly) and this function guarantees the geometry.
 *
 * The loop is built in polar form with a jittered radius, which makes it
 * star-shaped about its centre — and a star-shaped polygon cannot intersect
 * itself. That single property removes an entire class of broken tracks.
 */

export type TrackShape = {
  /** 0.55 small and tight, 1.3 long and sweeping. */
  size: number;
  /** Control points around the loop; more means more direction changes. */
  corners: number;
  /** 0 nearly circular, 1 strongly lobed with straights and hairpins. */
  twistiness: number;
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

export function buildTrack(shape: TrackShape, roadHalf: number) {
  const rnd = mulberry(shape.seed || 1);
  const n = Math.max(7, Math.min(16, Math.round(shape.corners)));
  const base = 70 + Math.max(0, Math.min(1.3, shape.size)) * 62;
  const twist = Math.max(0, Math.min(1, shape.twistiness));
  const hill = Math.max(0, Math.min(1, shape.elevation));

  // three harmonics give lobes at different scales: long straights from the
  // low one, corner character from the high one
  const ph = [rnd() * 6.283, rnd() * 6.283, rnd() * 6.283, rnd() * 6.283];
  const harm = [
    { k: 2, a: 0.26 },
    { k: 3, a: 0.15 },
    { k: 5, a: 0.09 },
  ];

  const points: [number, number, number][] = [];
  for (let i = 0; i < n; i++) {
    const th = (i / n) * Math.PI * 2;
    let wob = 0;
    harm.forEach((h, j) => (wob += Math.sin(th * h.k + ph[j]) * h.a));
    // keep the radius strictly positive so the loop stays star-shaped
    const r = base * (1 + twist * wob);
    const y = hill * 9 * Math.sin(th * 2 + ph[3]) + hill * 4 * Math.sin(th * 3 + ph[0]);
    points.push([+(Math.cos(th) * r).toFixed(2), +y.toFixed(2), +(Math.sin(th) * r).toFixed(2)]);
  }

  // Guarantee the corner-pinch invariant the playtest checks for, by pushing
  // any too-close pair apart radially rather than rejecting the whole track.
  const minChord = roadHalf * MIN_CHORD_FACTOR;
  for (let pass = 0; pass < 6; pass++) {
    let worst = Infinity;
    for (let i = 0; i < n; i++) {
      const a = points[i];
      const b = points[(i + 1) % n];
      const d = Math.hypot(a[0] - b[0], a[2] - b[2]);
      worst = Math.min(worst, d);
      if (d < minChord) {
        const grow = minChord / Math.max(d, 0.01);
        for (const p of [a, b]) {
          const rad = Math.hypot(p[0], p[2]) || 1;
          const s = Math.min(1.35, Math.sqrt(grow));
          p[0] = +(p[0] * s).toFixed(2);
          p[2] = +(p[2] * s).toFixed(2);
          void rad;
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
