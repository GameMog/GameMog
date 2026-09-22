/**
 * The racing line, measured the way the engine measures it.
 *
 * The engine builds a closed THREE.CatmullRomCurve3 ('catmullrom', tension 0.5)
 * through the world's points with x and z scaled, samples it at 2400 parameter
 * steps into an arc-length table, takes tangents across seven samples, and
 * reads curvature as the angle between the tangents 7m behind and 7m ahead.
 * Every rival loses 5.5 m/s per radian of that, so a twisty world hands the
 * player free speed that a flowing one does not.
 *
 * This reproduces that arithmetic without three.js, so the difficulty ladder
 * can account for it per world, and the simulator can race the real track.
 */
type Pt = [number, number, number];
export type Course = { total: number; corner: Float32Array; meanCorner: number };

const cache = new Map<string, Course>();

function catmull(x0: number, x1: number, x2: number, x3: number, t: number, tension = 0.5) {
  const t0 = tension * (x2 - x0), t1 = tension * (x3 - x1);
  const c2 = -3 * x1 + 3 * x2 - 2 * t0 - t1, c3 = 2 * x1 - 2 * x2 + t0 + t1;
  return x1 + t0 * t + c2 * t * t + c3 * t * t * t;
}

export function course(points: Pt[], scale: number): Course {
  const key = JSON.stringify([points, scale]);
  const hit = cache.get(key);
  if (hit) return hit;

  const P = points.map(([x, y, z]) => [x * scale, y, z * scale] as Pt);
  const l = P.length, NS = 2400;
  const pts: Pt[] = [];
  for (let i = 0; i <= NS; i++) {
    const p = l * (i / NS);
    let ip = Math.floor(p);
    const w = p - ip;
    if (ip <= 0) ip += (Math.floor(Math.abs(ip) / l) + 1) * l;
    const p0 = P[(ip - 1) % l], p1 = P[ip % l], p2 = P[(ip + 1) % l], p3 = P[(ip + 2) % l];
    pts.push([0, 1, 2].map((k) => catmull(p0[k], p1[k], p2[k], p3[k], w)) as Pt);
  }
  const cum = new Float64Array(NS + 1);
  for (let i = 1; i <= NS; i++) {
    cum[i] = cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]);
  }
  const total = cum[NS];
  const tanAt = (d: number): Pt => {
    let x = d % total; if (x < 0) x += total;
    let lo = 0, hi = NS;
    while (lo < hi - 1) { const m = (lo + hi) >> 1; if (cum[m] <= x) lo = m; else hi = m; }
    const a = pts[(lo + NS - 3) % NS], b = pts[(lo + 4) % NS];
    const v: Pt = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const n = Math.hypot(...v) || 1;
    return [v[0] / n, v[1] / n, v[2] / n];
  };

  const corner = new Float32Array(Math.ceil(total) + 1);
  let sum = 0;
  for (let m = 0; m < corner.length; m++) {
    const a = tanAt(m - 7), b = tanAt(m + 7);
    const dot = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
    corner[m] = Math.acos(dot) * 5.5;
    sum += corner[m];
  }
  const out = { total, corner, meanCorner: sum / corner.length };
  cache.set(key, out);
  return out;
}
