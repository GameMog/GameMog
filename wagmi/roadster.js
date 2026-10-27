// Mog City: Dan's car. An original electric hypercar: a long, low wedge of flat
// panels and crisp creases. A knife-edge nose with a slim light line over a black face and no grille, a flat bonnet
// between knife-edged fender crests; a narrow bronze glasshouse that peaks over the cabin and falls in one long line to
// a high chopped tail, carried there by two flat sails with the back glass sunk in a trough between them; satin white
// over a gloss black lower body that sweeps up toward the back; big wheels of black turbine spokes over pale aero discs;
// and across the tail a full-width red light bar over a rounded black frame of five round thrusters and four fan bays,
// the rocket package (cold gas, compressed air, and a burn). No maker's name, badge or exact shape.
//
// Built in code from a half-body cage: at every station along the car a section of eleven named points, from the floor's
// middle out round the side and over the top, mirrored in x. The panels between neighbouring points are strips, each
// with its own normals, so the creases between them stay sharp; the side, from the black line up to the shoulder, is
// one strip, so it shades as one long panel. Units are metres; the car stands on y = 0, nose to +z.
//
//   const car = buildRoadster(THREE, { paint: '#E9E9E6' });
//   scene.add(car.group); car.setThrust(1, 0.6); car.update(dt, speed, steer);
import { uniform, uv, float, vec2, vec3, vec4, mix, sin, cos, abs, pow, max, normalView, positionViewDirection, attribute, output } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function buildRoadster(THREE, o = {}) {
  const g = new THREE.Group(); g.name = 'wagmi-roadster';
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

  /* ------------------------------------------------------------ the lines -- */
  // a line through keys [z, value]: straight between them (lin), or a smooth curve that never overshoots them (crv)
  const lin = (keys) => (z) => {
    if (z <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) if (z <= keys[i][0]) { const [z0, v0] = keys[i - 1], [z1, v1] = keys[i]; return v0 + (v1 - v0) * (z - z0) / (z1 - z0); }
    return keys[keys.length - 1][1];
  };
  function crv(keys) {
    const n = keys.length, xs = keys.map((k) => k[0]), ys = keys.map((k) => k[1]), h = [], d = [], m = new Array(n);
    for (let i = 0; i < n - 1; i++) { h[i] = xs[i + 1] - xs[i]; d[i] = (ys[i + 1] - ys[i]) / h[i]; }
    m[0] = d[0]; m[n - 1] = d[n - 2];
    for (let i = 1; i < n - 1; i++) {
      if (d[i - 1] * d[i] <= 0) m[i] = 0;
      else { const w1 = 2 * h[i] + h[i - 1], w2 = h[i] + 2 * h[i - 1]; m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]); }
    }
    return (x) => {
      if (x <= xs[0]) return ys[0]; if (x >= xs[n - 1]) return ys[n - 1];
      let i = 0; while (x > xs[i + 1]) i++;
      const t = (x - xs[i]) / h[i], t2 = t * t, t3 = t2 * t;
      return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h[i] * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h[i] * m[i + 1];
    };
  }

  // the tail and the nose; the side glass's back point; the B and A pillars (top, foot); the windscreen's foot (straight
  // across the bonnet); where the back glass ends and the deck begins
  const ZR = -2.105, ZF = 2.233, ZQ = -0.982, ZBP = [-0.444, -0.338], ZAP = [0.324, 0.641], ZC = 1.5, ZG = -1.6, ZBW = ZR + 0.16;
  // (big wheels, nearly all rim: 22 inches in a tyre 0.71 m across; well: the wheel well's inner wall, clear of the tyre
  // at full lock)
  const AXLES = [{ z: 1.419, r: 0.355, w: 0.27, x: 0.8, arch: 0.39, well: 0.55 }, { z: -1.419, r: 0.355, w: 0.3, x: 0.82, arch: 0.415, well: 0.58 }];

  // the profile's top (the roof's middle, then the windscreen's), measured off the side view; the bonnet's middle
  const TOP = crv([[ZR, 0.897], [-2.027, 0.906], [-1.659, 0.98], [-1.198, 1.063], [-0.738, 1.122], [-0.278, 1.155], [-0.071, 1.159], [0.182, 1.145],
    [0.366, 1.118], [ZAP[1], 1.04], [0.917, 0.948], [1.193, 0.851], [ZC, 0.7]]);
  // (the bonnet one flat plane, from the windscreen's foot down to the light line)
  const HOOD = lin([[ZC, 0.7], [ZF, 0.483]]);
  // (low at the nose, for the black chin, and at the tail, where the black corners' undersides rise from beside the
  // diffuser out to the haunches)
  const FLOOR = lin([[ZR, 0.17], [-1.8, 0.2], [-1.55, 0.14], [1.65, 0.13], [1.85, 0.125], [ZF, 0.135]]);
  // the side: its width at the black line (low behind the front wheel, rising to the tail), the haunches flaring over
  // the back wheels; and the shoulder, a level crease from the B pillar's foot back to the tail's corner
  const SX = crv([[ZR, 0.905], [-1.95, 0.978], [-1.85, 0.992], [-1.42, 1.0], [-0.8, 0.968], [0, 0.945], [0.8, 0.95], [1.42, 0.965], [1.79, 0.955], [1.95, 0.915], [2.13, 0.79], [ZF, 0.69]]);
  const BY = crv([[ZR, 0.736], [-1.95, 0.66], [-1.727, 0.575], [-1.06, 0.437], [-0.83, 0.391], [-0.186, 0.322], [0.826, 0.262], [1.3, 0.26], [ZF, 0.27]]);
  const KX = crv([[ZR, 0.925], [-1.95, 0.988], [-1.42, 1.005], [-0.9, 0.975], [ZBP[1], 0.875]]), KY = lin([[ZR, 0.872], [-1.42, 0.876], [ZBP[1], 0.879]]);
  // the front fender's shoulder: a crease out at the side's full width, from the door over the front wheel (high enough
  // to cover it) and down to the nose's corner; above it a broad facet climbs in to the crest
  const NX = (z) => Math.min(SX(z) - 0.012, 0.95), NY = crv([[0.85, 0.7], [1.15, 0.726], [1.45, 0.724], [1.65, 0.68], [1.8, 0.63], [1.95, 0.57], [2.13, 0.48], [ZF, 0.43]]);
  // behind the side glass, a tunnel back: two sails, big flat planes, carry the profile's top line from the roof's edge
  // down to the tail's corners (their crests' x, SLX), and between them a deep, narrow trough (DIP under the top line)
  // walled by the sails' steep white inner faces: the back glass lies in its floor, then a level white deck runs back
  // to the tail, where trough and sails end flush in one straight lip
  const SLX = lin([[ZR, 0.4], [ZQ, 0.5]]), DIP = lin([[ZR, 0], [-1.95, 0.05], [ZG, 0.12], [-1.25, 0.11], [ZQ, 0]]);
  // the cabin: the window line (out near the shoulder, so the glass runs down nearly flush), the roof's edge (down the
  // A pillar at the front), the roof rail between the glass, carried on down the A pillars to frame the windscreen
  // (a narrow roof, half the car's width, so the side glass and the A pillars lean in hard; the window line stays out by
  // the shoulder until late, so the rear quarter's glass stands up, and only then curves in to meet the roof)
  const BLX = crv([[ZQ, 0.5], [-0.78, 0.74], [-0.56, 0.835], [ZBP[1], 0.865], [ZAP[1], 0.86]]), BLY = lin([[ZQ, 1.049], [ZBP[1], 0.879], [ZAP[1], 0.787]]);
  const CRX = lin([[ZQ, 0.5], [-0.6, 0.57], [-0.2, 0.6], [ZAP[0], 0.62], [ZAP[1], 0.86]]);
  const CRY = lin([[ZQ, 1.049], [ZBP[0], 1.127], [-0.071, 1.14], [ZAP[0], 1.09], [ZAP[1], 0.787]]);
  const RAIL = lin([[ZQ, 0], [-0.86, 0.06], [0.15, 0.06], [ZAP[0], 0.05], [ZAP[1], 0.012]]);
  // the front: the fender pods' crest (one straight knife edge in plan from the A pillar's foot to the nose's corner,
  // high by the windscreen, falling to the nose), the windscreen's foot (level, straight across), and the crease where
  // the pods' low facets meet the flat bonnet
  const FCX = lin([[ZAP[1], 0.86], [ZF, 0.68]]);
  const FCY = crv([[ZAP[1], 0.787], [1.36, 0.787], [1.561, 0.759], [1.745, 0.704], [1.929, 0.621], [2.113, 0.534], [ZF, 0.483]]);
  const WEX = lin([[ZAP[1], 0.86], [ZC, 0.56]]), WEY = lin([[ZAP[1], 0.787], [ZC, 0.7]]);
  const HCX = lin([[ZC, 0.56], [ZF, 0.66]]);

  // the section at z, the right half: [floor's middle, floor's edge, wheel well's top, sill, black line, the side's
  // middle (or the nose's chamfer), shoulder, window line (or fender crest, or sail crease), roof edge (or bonnet
  // crease, or glass edge), rail's inner edge (or the windscreen's foot), the top's middle]
  function section(z) {
    // (toward the nose the lower body tucks in under the fender's shoulder, so the white corners narrow to the chin)
    const tk = 0.07 * Math.min(1, Math.max(0, (z - 1.6) / 0.4)) ** 2;
    const yF = FLOOR(z), sx = SX(z), fx = Math.min(0.7, sx - 0.1 - tk), B = [sx - tk, BY(z)];
    // (behind the back wheels the sill climbs to the tail's corner, so the black corners end in a high diagonal and the
    // tyres show under them; the floor stops short of the middle under the tail, where the fan bays open up into the body)
    const s0 = yF + 0.035, sill = z < -1.84 ? s0 + (0.38 - s0) * (-1.84 - z) / (-1.84 - ZR) : s0;
    const P = [[z <= ZBW + 1e-6 ? 0.615 : 0, yF], [fx, yF], [fx, yF], [sx - 0.045 - tk, sill], B];
    let L, R, G, T;
    if (z <= ZQ) {
      // (just behind the roof the sails' tops start at the roof's edge, then rise to the top line; the trough opens up)
      const f = Math.min(1, (ZQ - z) / 0.3), top = TOP(z), sy = top - (top - CRY(ZQ)) * Math.max(0, 1 - (ZQ - z) / 0.12);
      L = [SLX(z), sy]; T = [0, top - DIP(z)]; R = [SLX(z) - 0.055 * f, CRY(ZQ) + (T[1] - 0.006 - CRY(ZQ)) * f]; G = R;
    }
    else if (z <= ZAP[1]) { L = [BLX(z), BLY(z)]; R = [CRX(z), CRY(z)]; const r = RAIL(z), T0 = TOP(z); G = [R[0] - r, Math.min(R[1] + r * 0.55, T0 - 0.004)]; T = [0, T0]; }
    else {
      L = [FCX(z), FCY(z)];
      if (z <= ZC) { R = [WEX(z), WEY(z)]; G = R; T = [0, TOP(z)]; }
      else { R = [HCX(z), HOOD(z)]; G = [0, HOOD(z)]; T = G; }
    }
    const K = z <= ZBP[1] ? [KX(z), KY(z)] : L;
    // the side's middle: a touch proud of halfway up (so the side is gently full), but out on the fender's shoulder
    // from the front door forward
    let H = [(B[0] + K[0]) / 2 + 0.022, (B[1] + K[1]) / 2];
    if (z > 0.75) { const f = Math.min(1, (z - 0.75) / 0.2); H = [H[0] + (NX(z) - H[0]) * f, H[1] + (NY(z) - H[1]) * f]; }
    P.push(H, K, L, R, G, T);
    // over a wheel: the well (a wall in from the floor, a roof under the panels) and the outside cut at the arch
    for (const a of AXLES) {
      const dz = Math.abs(z - a.z); if (dz > a.arch) continue;
      const ya = a.r + Math.sqrt(a.arch * a.arch - dz * dz);
      // (the well's roof kept 2 cm under whatever panel is over its inner wall, so it never shows through the bonnet)
      let yw = ya;
      for (let k = 7; k < 10; k++) { const [x0, y0] = P[k], [x1, y1] = P[k + 1]; if (x0 >= a.well && x1 <= a.well && x0 > x1) { yw = Math.min(ya, y0 + (y1 - y0) * (x0 - a.well) / (x0 - x1) - 0.02); break; } }
      P[1] = [a.well, yF]; P[2] = [a.well, yw];
      let k = 3; while (k < P.length - 2 && P[k + 1][1] < ya) k++;
      const [x0, y0] = P[k], [x1, y1] = P[k + 1], f = y1 > y0 ? Math.min(1, Math.max(0, (ya - y0) / (y1 - y0))) : 0, E = [x0 + (x1 - x0) * f, y0 + (y1 - y0) * f];
      for (let j = 3; j <= k; j++) P[j] = E.slice();
    }
    return P;
  }

  // the strips through the points, and what each is made of along the car. A strip through more than two points is
  // smooth across them (crease: where it folds sharp instead)
  const STRIPS = [
    { pts: [0, 1], mat: () => 'under' }, { pts: [1, 2], mat: () => 'under' }, { pts: [2, 3], mat: () => 'under' },
    { pts: [3, 4], mat: () => 'lower' },
    { pts: [4, 5, 6], segs: 2, crease: (z) => z > 0.8, mat: () => 'paint' },
    { pts: [6, 7], mat: () => 'paint' },
    { pts: [7, 8], segs: 2, mat: (z) => (z > ZQ && z < ZAP[1] ? 'glass' : 'paint') },
    { pts: [8, 9], mat: () => 'paint' },
    { pts: [9, 10], segs: 6, crown: true, mat: (z) => (z > ZG && z < ZC ? (z < ZQ ? 'glassBack' : 'glass') : 'paint') },
  ];
  // a crown (the roof's and the windscreen's top): a gentle, even curve, bending a little more at its edges
  const crownF = (u) => 0.8 * u * u + 0.2 * u * u * u * u;
  function across(P, s) {
    const n = s.segs || 1, out = [];
    for (let q = 0; q < s.pts.length - 1; q++) {
      const A = P[s.pts[q]], B = P[s.pts[q + 1]];
      for (let j = q ? 1 : 0; j <= n; j++) {
        const t = j / n, u = 1 - t;
        out.push(s.crown ? [A[0] * u, B[1] - (B[1] - A[1]) * crownF(u)] : [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t]);
      }
    }
    return out;
  }

  // the stations: every 3 cm, closer round the arches, and exactly at every key line
  const KEYS = [ZR, ZF, ZQ, ...ZBP, ...ZAP, ZC, ZG, ZBW, -1.85, 1.5, 1.75, 1.95, 2.13];
  for (const a of AXLES) for (let k = 0; k <= 20; k++) KEYS.push(a.z + a.arch * Math.cos((k / 20) * Math.PI));
  const zs = [];
  {
    const all = KEYS.map((z) => [z, 1]); for (let z = ZR; z < ZF; z += 0.03) all.push([z, 0]);
    all.sort((p, q) => p[0] - q[0] || q[1] - p[1]);
    for (const [z, key] of all) {
      if (z < ZR - 1e-9 || z > ZF + 1e-9) continue;
      const last = zs[zs.length - 1];
      if (last === undefined || z - last.z > 0.004) zs.push({ z, key });
      else if (key && !last.key) { last.z = z; last.key = 1; }
    }
  }
  const Z = zs.map((s) => s.z), S = Z.map(section);
  const HARD = new Set([ZQ, ZBP[1], ZAP[0], ZAP[1], ZC, ZG].map((h) => Z.findIndex((z) => Math.abs(z - h) < 1e-9)));

  /* ----------------------------------------------------------- the panels -- */
  const buckets = { paint: [], lower: [], under: [], glass: [], glassBack: [] };
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const len3 = (a) => Math.hypot(a[0], a[1], a[2]);
  const unit = (v) => { const l = len3(v); return l > 1e-12 ? [v[0] / l, v[1] / l, v[2] / l] : [0, 1, 0]; };
  function push(out, p, n) { out.push(p[0], p[1], p[2], n[0], n[1], n[2]); }
  function tri(out, a, b, c, na, nb, nc, mirror) {
    if (len3(cross(sub(b, a), sub(c, a))) < 1e-9) return;
    if (!mirror) { push(out, a, na); push(out, b, nb); push(out, c, nc); return; }
    const m = (p) => [-p[0], p[1], p[2]];
    push(out, m(a), m(na)); push(out, m(c), m(nc)); push(out, m(b), m(nb));
  }
  // the doors' cut: two shut lines across the car, each a plane standing on the x axis ([z at y0, y0, dz / dy]), the
  // front one behind the front wheel, the rear one under the B pillar and on up it to the roof's edge. Between them the
  // side (from the black line up), the panel over the shoulder and the side glass are the door's (doorBk, one door a
  // side: L on +x, the driver's, R on -x)
  const SHUT_F = [0.81, 0.3, 0.1613], SHUT_R = [-0.191, 0.299, -0.304];
  const shutF = (p) => p[2] - SHUT_F[0] - (p[1] - SHUT_F[1]) * SHUT_F[2], shutR = (p) => SHUT_R[0] + (p[1] - SHUT_R[1]) * SHUT_R[2] - p[2];
  const doorBk = { L: { paint: [], glass: [] }, R: { paint: [], glass: [] } };
  // a polygon cut by f into the part where f < 0 and the rest (the normals carried along the cut); and a fan of it
  function splitBy(poly, f) {
    const A = [], B = [];
    for (let i = 0; i < poly.length; i++) {
      const u = poly[i], v = poly[(i + 1) % poly.length], fu = f(u.p), fv = f(v.p);
      (fu < 0 ? A : B).push(u);
      if ((fu < 0) !== (fv < 0)) { const t = fu / (fu - fv), lp = (x, y) => x.map((q, j) => q + (y[j] - q) * t), w = { p: lp(u.p, v.p), n: unit(lp(u.n, v.n)) }; A.push(w); B.push(w); }
    }
    return [A, B];
  }
  function fan(out, poly, mirror) { for (let k = 1; k < poly.length - 1; k++) tri(out, poly[0].p, poly[k].p, poly[k + 1].p, poly[0].n, poly[k].n, poly[k + 1].n, mirror); }
  function cutTri(mat, a, b, c, na, nb, nc, mirror) {
    const [inF, outF] = splitBy([{ p: a, n: na }, { p: b, n: nb }, { p: c, n: nc }], shutF), [door, outR] = splitBy(inF, shutR);
    fan(buckets[mat], outF, mirror); fan(buckets[mat], outR, mirror); fan(doorBk[mirror ? 'R' : 'L'][mat], door, mirror);
  }
  // a strip over stations i0..i1: its grid, its normals (smooth over the grid, split at a creased joint), both halves
  function run(s, i0, i1, mat) {
    const rows = []; for (let i = i0; i <= i1; i++) rows.push(across(S[i], s).map(([x, y]) => [x, y, Z[i]]));
    const n = rows[0].length - 1, per = s.segs || 1, joint = new Set();
    for (let q = 1; q < s.pts.length - 1; q++) joint.add(q * per);
    // (each point's normal gathered from the quads before it across the strip, NA, and after it, NB)
    const NA = rows.map((r) => r.map(() => [0, 0, 0])), NB = rows.map((r) => r.map(() => [0, 0, 0]));
    const add = (v, f) => { v[0] += f[0]; v[1] += f[1]; v[2] += f[2]; };
    for (let r = 0; r < rows.length - 1; r++) for (let k = 0; k < n; k++) {
      const a = rows[r][k], b = rows[r][k + 1], c = rows[r + 1][k], d = rows[r + 1][k + 1];
      const fa = cross(sub(b, a), sub(c, a)), fb = cross(sub(d, b), sub(c, b)), f = [fa[0] + fb[0], fa[1] + fb[1], fa[2] + fb[2]];
      add(NB[r][k], f); add(NB[r + 1][k], f); add(NA[r][k + 1], f); add(NA[r + 1][k + 1], f);
    }
    const nrm = (r, k, side) => {
      const cr = joint.has(k) && s.crease && s.crease(rows[r][k][2]), a = NA[r][k], b = NB[r][k];
      const u = unit(cr ? (side > 0 ? b : a) : [a[0] + b[0], a[1] + b[1], a[2] + b[2]]);
      // (a crown's middle is level across, so the two halves meet without a crease)
      if (s.crown && k === n) u[0] = 0;
      return unit(u);
    };
    const out = buckets[mat], si = STRIPS.indexOf(s), doorish = si === 4 || si === 5 || (si === 6 && mat === 'glass');
    for (let r = 0; r < rows.length - 1; r++) for (let k = 0; k < n; k++) {
      const a = rows[r][k], b = rows[r][k + 1], c = rows[r + 1][k], d = rows[r + 1][k + 1];
      const na = nrm(r, k, 1), nb = nrm(r, k + 1, -1), nc = nrm(r + 1, k, 1), nd = nrm(r + 1, k + 1, -1);
      const cut = doorish && Math.max(a[2], c[2]) > -0.5 && Math.min(a[2], c[2]) < 0.95;
      for (const mirror of [false, true]) {
        if (cut) { cutTri(mat, a, b, c, na, nb, nc, mirror); cutTri(mat, b, d, c, nb, nd, nc, mirror); }
        else { tri(out, a, b, c, na, nb, nc, mirror); tri(out, b, d, c, nb, nd, nc, mirror); }
      }
    }
  }
  for (const s of STRIPS) {
    let i = 0;
    while (i < Z.length - 1) {
      const mat = s.mat((Z[i] + Z[i + 1]) / 2);
      let j = i + 1;
      while (j < Z.length - 1 && !HARD.has(j) && s.mat((Z[j] + Z[j + 1]) / 2) === mat) j++;
      run(s, i, j, mat); i = j;
    }
  }

  // the tail and the nose: flat faces cut in level bands, so each band can be its own material; the middle (between
  // the cuts at +/-cut(y), which may lean) can be set back into the body by rec(y), with walls at its sides (a step in
  // rec(y) between two bands is left open, for a part to cover)
  function cap(i, facing, matAt, bands, cut, rec = () => 0) {
    const cutAt = typeof cut === 'function' ? cut : () => cut;
    const pts = []; for (const s of STRIPS) for (const p of across(S[i], s)) { const l = pts[pts.length - 1]; if (!l || Math.hypot(l[0] - p[0], l[1] - p[1]) > 1e-5) pts.push(p); }
    const xAt = (y) => {
      for (let k = 0; k < pts.length - 1; k++) {
        const [x0, y0] = pts[k], [x1, y1] = pts[k + 1];
        if (y >= Math.min(y0, y1) && y <= Math.max(y0, y1) && y1 !== y0 && k > 0) return x0 + (x1 - x0) * (y - y0) / (y1 - y0);
      }
      return y <= pts[0][1] ? pts[1][0] : 0;
    };
    const lo = pts[0][1], hi = pts[pts.length - 1][1];
    const ys = [...new Set([...pts.map((p) => p[1]), ...bands].filter((y) => y >= lo && y <= hi).map((y) => +y.toFixed(5)))].sort((a, b) => a - b);
    const z = Z[i];
    for (let k = 0; k < ys.length - 1; k++) {
      const y0 = ys[k], y1 = ys[k + 1], x0 = xAt(y0 + 1e-6), x1 = xAt(y1 - 1e-6), ym = (y0 + y1) / 2;
      const k0 = cutAt(y0 + 1e-6), k1 = cutAt(y1 - 1e-6), inside = Math.max(k0, k1) < Math.min(x0, x1);
      // (a cut is the pair [x at y0, x at y1]; -1 and 1 stand for the outline's own edges)
      const cuts = [-1, ...(inside ? [[-k0, -k1], [k0, k1]] : []), 1];
      for (let c = 0; c < cuts.length - 1; c++) {
        const ca = cuts[c], cb = cuts[c + 1], xa0 = ca === -1 ? -x0 : ca[0], xb0 = cb === 1 ? x0 : cb[0], xa1 = ca === -1 ? -x1 : ca[1], xb1 = cb === 1 ? x1 : cb[1];
        const mid = ca !== -1 && cb !== 1, z0 = z - facing * (mid ? rec(y0 + 1e-5) : 0), z1 = z - facing * (mid ? rec(y1 - 1e-5) : 0);
        const out = buckets[matAt((xa0 + xb0) / 2, ym)], p0 = [xa0, y0, z0], p1 = [xb0, y0, z0], p2 = [xb1, y1, z1], p3 = [xa1, y1, z1];
        const fn = [0, -facing * (z1 - z0), facing * (y1 - y0)], fl = Math.hypot(fn[1], fn[2]), f = [0, fn[1] / fl, fn[2] / fl];
        if (facing > 0) { tri(out, p0, p1, p2, f, f, f); tri(out, p0, p2, p3, f, f, f); }
        else { tri(out, p0, p2, p1, f, f, f); tri(out, p0, p3, p2, f, f, f); }
        if (mid && (z0 !== z || z1 !== z)) for (const [xw, xw1, sx] of [[xa0, xa1, 1], [xb0, xb1, -1]]) {
          // (the recess's side walls, facing in)
          const a = [xw, y0, z], b = [xw1, y1, z], c = [xw1, y1, z1], d = [xw, y0, z0], wn = unit([sx * (y1 - y0), -sx * (xw1 - xw), 0]);
          if (sx * facing < 0) { tri(out, a, b, c, wn, wn, wn); tri(out, a, c, d, wn, wn, wn); } else { tri(out, a, c, b, wn, wn, wn); tri(out, a, d, c, wn, wn, wn); }
        }
      }
    }
    return pts;
  }
  // the tail, under the light bar: a white panel dished in round the plate, nearly the full width under the ledge and
  // cut down to the beam's width by big black wedges at its lower corners; the thruster beam's band (the beam covers it),
  // and the fan bays' back wall set deep under the beam
  const PX = 0.62, cutT = (y) => (y > 0.55 && y < 0.7 ? PX + 0.25 * (y - 0.55) / 0.15 : PX);
  const recT = (y) => (y > 0.7 ? 0 : y > 0.55 ? 0.03 + 0.016 * Math.sin((Math.PI * (y - 0.55)) / 0.15) : y > 0.385 ? 0 : 0.16);
  const tailPts = cap(0, -1, (x, y) => (y > 0.7 ? 'paint' : y > 0.55 ? (Math.abs(x) < cutT(y) ? 'paint' : 'lower') : y > 0.385 || Math.abs(x) > PX ? 'lower' : 'under'),
    [0.385, 0.55, 0.585, 0.625, 0.665, 0.7], cutT, recT);
  // the nose: a black face the full width of the bonnet's edge, under its light line (gloss, over a matte intake band)
  cap(Z.length - 1, 1, (x, y) => (y > 0.452 ? 'paint' : Math.abs(x) < 0.56 && y < 0.33 && y > 0.2 ? 'under' : 'lower'), [0.2, 0.33, 0.402, 0.452], 0.56,
    (y) => 0.03 * Math.min(1, Math.max(0, (0.452 - y) / 0.05)));

  /* ------------------------------------------------------------ materials -- */
  const matte = !!o.matte;
  const M = {
    paint: new THREE.MeshPhysicalNodeMaterial({ color: o.paint ?? '#E7E7E3', metalness: matte ? 0.15 : 0.32, roughness: matte ? 0.6 : 0.36, clearcoat: matte ? 0.1 : 0.6, clearcoatRoughness: matte ? 0.6 : 0.24 }),
    lower: new THREE.MeshPhysicalNodeMaterial({ color: o.lower ?? '#0A0B0D', metalness: 0.3, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05 }),
    under: new THREE.MeshStandardNodeMaterial({ color: '#0E0F12', roughness: 0.85, metalness: 0.1 }),
    // (a mid bronze you can just see the cabin through, both panes drawn so the far one tints the view through the car,
    // and whatever it reflects turned gold, so a bright sky at a glancing angle reads gold, not white)
    glass: new THREE.MeshPhysicalNodeMaterial({ color: o.glass ?? '#3A2A1C', metalness: 0, roughness: 0.16, specularIntensity: 0.3, specularColor: '#FFE0B0', transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
    trim: new THREE.MeshStandardNodeMaterial({ color: '#08090B', roughness: 0.45, metalness: 0.2 }),
    // (the cabin, seen through the glass: pale seats in a charcoal suede tub, a red light line along each door)
    seat: new THREE.MeshStandardNodeMaterial({ color: '#B4B6BB', roughness: 0.7 }),
    cabin: new THREE.MeshStandardNodeMaterial({ color: '#1C1D21', roughness: 0.9 }),
    ambient: new THREE.MeshStandardNodeMaterial({ color: '#400008', emissive: '#FF1A2A', emissiveIntensity: 1.6 }),
    screen: new THREE.MeshStandardNodeMaterial({ color: '#05070A', emissive: '#1A2A3A', emissiveIntensity: 0.8, roughness: 0.2 }),
    seam: new THREE.MeshStandardNodeMaterial({ color: '#1A1B1E', roughness: 0.7 }),
    rubber: new THREE.MeshStandardNodeMaterial({ color: '#141518', roughness: 0.88 }),
    disc: new THREE.MeshPhysicalNodeMaterial({ color: o.disc ?? '#BFC2C6', metalness: 0.35, roughness: 0.32, clearcoat: 0.5, clearcoatRoughness: 0.2 }),
    spoke: new THREE.MeshPhysicalNodeMaterial({ color: '#0B0C0E', metalness: 0.4, roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.04 }),
    head: new THREE.MeshStandardNodeMaterial({ color: '#FFFFFF', emissive: '#F4F8FF', emissiveIntensity: 5 }),
    tail: new THREE.MeshStandardNodeMaterial({ color: '#3A0004', emissive: '#D00018', emissiveIntensity: 0.9 }),
    tailCore: new THREE.MeshStandardNodeMaterial({ color: '#5A0008', emissive: '#FF2236', emissiveIntensity: 2.2 }),
    amber: new THREE.MeshStandardNodeMaterial({ color: '#331800', emissive: '#FF6A10', emissiveIntensity: 2.4 }),
    reflector: new THREE.MeshStandardNodeMaterial({ color: '#5A0610', emissive: '#C0101E', emissiveIntensity: 0.6, roughness: 0.3 }),
    nozzle: new THREE.MeshPhysicalNodeMaterial({ color: '#55585E', metalness: 1, roughness: 0.35 }),
    lip: new THREE.MeshPhysicalNodeMaterial({ color: '#D4D8DE', metalness: 1, roughness: 0.14 }),
    fan: new THREE.MeshStandardNodeMaterial({ color: '#2C2E33', metalness: 0.6, roughness: 0.4 }),
    // (the diffuser's frame and strakes: a satin black, so their tops don't flash white with the sky)
    diff: new THREE.MeshPhysicalNodeMaterial({ color: '#0A0B0E', roughness: 0.45, metalness: 0, specularIntensity: 0.5 }),
  };
  M.glass.outputNode = vec4(output.rgb.mul(vec3(1.0, 0.8, 0.52)), output.a);
  // (the back glass, lying low in its trough, darker, so from behind it reads as a deep black slot, not a brass tub)
  M.glassBack = M.glass.clone(); M.glassBack.transparent = false; M.glassBack.opacity = 1; M.glassBack.side = THREE.FrontSide; M.glassBack.color.set('#120D08'); M.glassBack.specularIntensity = 0.3; M.glassBack.roughness = 0.16;
  M.glassBack.outputNode = vec4(output.rgb.mul(vec3(0.9, 0.72, 0.5)), output.a);
  for (const k of ['trim', 'spoke', 'nozzle', 'lip', 'fan', 'diff', 'cabin', 'seat', 'ambient']) M[k].side = THREE.DoubleSide;   // (turned parts, whichever way their outline runs)

  /* ---------------------------------------------------- the nose's rake -- */
  // the nose's front face leans back as it falls: below the bonnet's edge every point in the last 35 cm is drawn back,
  // up to 7.5 cm at the bottom (so the white skin under the tip is undercut, over a splitter that juts out past it)
  const Z0 = ZF - 0.35, RK = 0.075, RY0 = 0.47, RY1 = 0.25;
  const rake = (y) => RK * Math.min(1, Math.max(0, (RY0 - y) / (RY0 - RY1)));
  function bend(p, n) {
    if (p[2] <= Z0) return;
    const s = (p[2] - Z0) / (ZF - Z0), r = rake(p[1]);
    if (n) {
      // (the normal by the inverse transpose of the bend)
      const a = (p[1] < RY0 && p[1] > RY1 ? RK / (RY0 - RY1) : 0) * s, b = 1 - r / (ZF - Z0);
      n[1] -= (a / b) * n[2]; n[2] /= b; const l = len3(n); n[0] /= l; n[1] /= l; n[2] /= l;
    }
    p[2] -= r * s;
  }
  function bendGeo(geo) {
    const pa = geo.attributes.position, na = geo.attributes.normal, p = [0, 0, 0], n = [0, 0, 0];
    for (let v = 0; v < pa.count; v++) {
      p[0] = pa.getX(v); p[1] = pa.getY(v); p[2] = pa.getZ(v);
      if (na) { n[0] = na.getX(v); n[1] = na.getY(v); n[2] = na.getZ(v); }
      bend(p, na ? n : null); pa.setXYZ(v, p[0], p[1], p[2]); if (na) na.setXYZ(v, n[0], n[1], n[2]);
    }
  }

  const body = new THREE.Group(); body.name = 'body'; g.add(body);
  for (const [k, arr] of Object.entries(buckets)) {
    const n = arr.length / 6, pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) { pos[i * 3 + c] = arr[i * 6 + c]; nrm[i * 3 + c] = arr[i * 6 + 3 + c]; }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    bendGeo(geo);
    const m = new THREE.Mesh(geo, M[k]); m.castShadow = true; m.receiveShadow = true; m.name = k; body.add(m);
  }

  /* ---------------------------------------------------- surface and parts -- */
  // a point on the segment from point k to k + 1 of the section at z (t along it; the crown's curve for k = 9), the
  // right side, and the outward normal there; mirrored by the caller
  function segPt(z, k, t) {
    const P = section(z), A = P[k], B = P[k + 1];
    if (k === 9) { const u = 1 - t; return [A[0] * u, B[1] - (B[1] - A[1]) * crownF(u), z]; }
    return [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, z];
  }
  function segN(z, k, t) {
    const e = 0.004, p = segPt(z, k, t), pz = segPt(z + e, k, t), pt = segPt(z, k, Math.min(1, t + 0.02)), pt2 = segPt(z, k, Math.max(0, t - 0.02));
    let n = unit(cross(sub(pt, pt2), sub(pz, p)));
    if (n[0] * p[0] + n[1] * (p[1] - 0.5) < 0) n = [-n[0], -n[1], -n[2]];
    return n;
  }
  const at = (z, k, t) => ({ p: segPt(z, k, t), n: segN(z, k, t) });
  // a point on the side at height y (from the sill up to the glass's edge) and the outward normal there
  function surf(z, y) {
    const P = section(z);
    for (let k = 3; k < 7; k++) { const [x0, y0] = P[k], [x1, y1] = P[k + 1]; if (y >= y0 && y <= y1 && y1 > y0) return [x0 + (x1 - x0) * (y - y0) / (y1 - y0), y, z]; }
    return [P[7][0], P[7][1], z];
  }
  function side(z, y) {
    const e = 0.004, p = surf(z, y), n = unit(cross(sub(surf(z + e, y), p), sub(surf(z, y + e), surf(z, y - e))));
    return { p, n: n[0] < 0 ? [-n[0], -n[1], -n[2]] : n };
  }
  // a thin box from a to b, h across (in the surface), d deep (out of it along n)
  function bar(a, b, h, d, n, mat, sink = 0.3) {
    const A = V3(...a), B = V3(...b), N = V3(...n).normalize(), dir = B.clone().sub(A), L = dir.length(); dir.normalize();
    const up = new THREE.Vector3().crossVectors(N, dir).normalize(), nn = new THREE.Vector3().crossVectors(dir, up).normalize();
    const m = new THREE.Mesh(new THREE.BoxGeometry(L, h, d), mat);
    m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(dir, up, nn));
    m.position.copy(A).add(B).multiplyScalar(0.5).addScaledVector(nn, d * (0.5 - sink));
    return m;
  }
  const both = (make) => { for (const sd of [1, -1]) { const m = make(sd); if (m) g.add(m); } };
  const mx = (p, sd) => [p[0] * sd, p[1], p[2]];

  // a ribbon laid over the body: two edges (lists of points on the right side), lifted off the surface (on both sides,
  // or on those in sides; into parent)
  function ribbon(e1, e2, mat, lift = 0.003, sides = [1, -1], parent = g) {
    const pos = [], idx = [];
    for (const sd of sides) {
      const base = pos.length / 3;
      for (let i = 0; i < e1.length; i++) for (const e of [e1[i], e2[i]]) { const p = mx(e.p, sd), n = mx(e.n, sd); pos.push(p[0] + n[0] * lift, p[1] + n[1] * lift, p[2] + n[2] * lift); }
      // (wound so its face looks out the way the surface does)
      const A = V3(...e1[0].p), B = V3(...e2[0].p), C = V3(...e1[1].p), out = new THREE.Vector3().crossVectors(B.sub(A), C.sub(A)).dot(V3(...e1[0].n)) > 0;
      for (let i = 0; i < e1.length - 1; i++) { const a = base + i * 2, b = a + 1, c = a + 2, d = a + 3; if ((sd > 0) === out) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d); }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat); parent.add(m); return m;
  }
  // a flat shape on the side: corners [z, y] round it, each set on the surface; lifted off it
  function decal(corners, mat, lift) {
    const e1 = [], e2 = [];
    for (let k = 0; k <= 6; k++) {
      const t = k / 6, lerp = (a, b) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      const [za, ya] = lerp(corners[0], corners[1]), [zb, yb] = lerp(corners[3], corners[2]);
      e1.push(side(za, ya)); e2.push(side(zb, yb));
    }
    return ribbon(e1, e2, mat, lift);
  }
  // a solid from a flat outline: shape points [u, v] extruded `depth`, then placed by fn (u, v, w) => [x, y, z]
  // (bevel: its edges rounded off by that much, inside the same outline and depth)
  function prism(pts, depth, place, mat, holes = [], bevel = 0) {
    const sh = new THREE.Shape(); sh.moveTo(...pts[0]); for (const p of pts.slice(1)) sh.lineTo(...p); sh.closePath();
    for (const h of holes) sh.holes.push(h);
    const opt = bevel ? { depth: depth - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 3, curveSegments: 20 } : { depth, bevelEnabled: false, curveSegments: 20 };
    const geo = new THREE.ExtrudeGeometry(sh, opt).translate(0, 0, bevel).toNonIndexed();
    const pa = geo.attributes.position; for (let v = 0; v < pa.count; v++) pa.setXYZ(v, ...place(pa.getX(v), pa.getY(v), pa.getZ(v)));
    geo.deleteAttribute('uv'); geo.deleteAttribute('normal'); geo.computeVertexNormals();
    // (placing can mirror the solid inside out: if so, wind it back)
    const t = new THREE.Vector3(...place(0, 0, 0)), ax = new THREE.Vector3(...place(1, 0, 0)).sub(t), ay = new THREE.Vector3(...place(0, 1, 0)).sub(t), az = new THREE.Vector3(...place(0, 0, 1)).sub(t);
    if (ax.cross(ay).dot(az) < 0) { const idx = []; for (let i = 0; i < pa.count; i += 3) idx.push(i, i + 2, i + 1); geo.setIndex(idx); const g2 = geo.toNonIndexed(); g2.computeVertexNormals(); const m = new THREE.Mesh(g2, mat); g.add(m); return m; }
    const m = new THREE.Mesh(geo, mat); g.add(m); return m;
  }
  const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

  /* ---------------------------------------------------- pillars and seams -- */
  // the B pillar: two fine black lines across the side glass, leaning back as they climb (the front one is on the door)
  const pillarB = [[ZBP[1] - 0.02, ZBP[0] - 0.015], [ZBP[1] + 0.04, ZBP[0] + 0.016]].map(([zf, zt]) => {
    const e1 = [], e2 = [];
    for (let k = 0; k <= 6; k++) { const t = k / 6, z = zf + (zt - zf) * t; e1.push(at(z - 0.006, 7, t)); e2.push(at(z + 0.006, 7, t)); }
    return [e1, e2];
  });
  ribbon(...pillarB[0], M.trim, 0.004);
  // the A pillars: two fine lines down each windscreen edge, one on the screen, one on the side glass (the door's)
  const pillarA = (k, tt, sd) => {
    const pts = [];
    for (let j = 0; j <= 10; j++) { const z = ZAP[0] + (ZAP[1] - ZAP[0]) * (j / 10), q = segPt(z, k, tt), n = segN(z, k, tt); pts.push(V3((q[0] + n[0] * 0.005) * sd, q[1] + n[1] * 0.005, z + n[2] * 0.005)); }
    return new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.006, 5, false), M.trim);
  };
  both((sd) => pillarA(9, 0.04, sd));
  // the shut lines: one sharp, nearly upright cut behind the front wheel, one under the B pillar; and the rear
  // quarter's crease, curving from the shoulder down and back to the black over the back wheel
  const seam = (pts, w = 0.0035, lift = 0.0015) => {
    const e1 = [], e2 = [];
    for (const [z, y] of pts) { const s = side(z, y); e1.push({ p: [s.p[0], s.p[1], z - w], n: s.n }); e2.push({ p: [s.p[0], s.p[1], z + w], n: s.n }); }
    ribbon(e1, e2, M.seam, lift);
  };
  const line = (z0, y0, z1, y1, n = 8) => Array.from({ length: n + 1 }, (_, k) => [z0 + (z1 - z0) * (k / n), y0 + (y1 - y0) * (k / n)]);
  // (the doors' shut lines: up from the black line to the fender's crest, and to the glass under the B pillar)
  seam(line(SHUT_F[0] + (0.78 - SHUT_F[1]) * SHUT_F[2], 0.78, SHUT_F[0], SHUT_F[1], 24), 0.0035, 0.003); seam(line(-0.366, 0.874, -0.191, 0.299));
  seam(Array.from({ length: 13 }, (_, k) => { const t = k / 12, u = 1 - t; return [u * u * -1.68 + 2 * u * t * -1.83 + t * t * -1.935, u * u * 0.862 + 2 * u * t * 0.78 + t * t * 0.63]; }), 0.003);
  // the gill high on the front fender, behind the wheel: a black slot, its front end raked down and forward, an amber tip
  decal([[0.885, 0.652], [1.115, 0.652], [1.138, 0.612], [0.885, 0.612]], M.trim, 0.002);
  decal([[1.065, 0.649], [1.112, 0.649], [1.133, 0.615], [1.086, 0.615]], M.amber, 0.0035);
  // a red reflector slanting across each black rear quarter
  decal([[-1.8, 0.608], [-1.97, 0.698], [-1.97, 0.684], [-1.8, 0.594]], M.reflector, 0.0025);

  /* ------------------------------------------------------------ the doors -- */
  // each side's door, cut from the body (doorBk): its outer skin, the painted panel and the side glass; round the panel
  // a shell DOOR_D deep, its edges in the paint and an inner skin in the cabin's suede with a red light line along it;
  // and in the body round the opening it leaves, jambs JAMB_D deep (at the sill, on down to the cabin's floor). Each
  // hangs on a hinge by the A pillar's foot and swings up and forward and a little out: setDoor('L' | 'R', 0..1)
  const CFLOOR = 0.18, DOOR_D = 0.05, JAMB_D = 0.16;
  const HINGE = o.hinge || [0.9, 0.78, 0.74], HAXIS = unit(o.hingeAxis || [0.6, -0.6, 0.53]), HANG = o.hingeAngle ?? 1.3;
  const key3 = (p) => p.map((v) => Math.round(v * 2e4)).join(',');
  // a bucket's triangles welded at their corners (each corner's normal the mean of its own), and its rim: the edges
  // only one triangle has, each the way that triangle runs round
  function weld(arr) {
    const idx = new Map(), P = [], N = [], T = [];
    for (let i = 0; i < arr.length; i += 6) {
      const p = [arr[i], arr[i + 1], arr[i + 2]], k = key3(p);
      let j = idx.get(k); if (j === undefined) { j = P.length; idx.set(k, j); P.push(p); N.push([0, 0, 0]); }
      N[j][0] += arr[i + 3]; N[j][1] += arr[i + 4]; N[j][2] += arr[i + 5]; T.push(j);
    }
    return { P, N: N.map(unit), T };
  }
  function rim(w) {
    const cnt = new Map(), ek = (a, b) => (a < b ? a + '_' + b : b + '_' + a), out = [];
    for (let t = 0; t < w.T.length; t += 3) for (let e = 0; e < 3; e++) { const k = ek(w.T[t + e], w.T[t + (e + 1) % 3]); cnt.set(k, (cnt.get(k) || 0) + 1); }
    for (let t = 0; t < w.T.length; t += 3) for (let e = 0; e < 3; e++) { const a = w.T[t + e], b = w.T[t + (e + 1) % 3]; if (cnt.get(ek(a, b)) === 1) out.push([a, b]); }
    return out;
  }
  const inset = (w, i, d) => { const p = w.P[i], n = w.N[i]; return [p[0] - n[0] * d, p[1] - n[1] * d, p[2] - n[2] * d]; };
  const solid = (pts, mat) => { const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); geo.computeVertexNormals(); const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; return m; };
  const doors = {}, jambs = [];
  for (const sd of [1, -1]) {
    const sideK = sd > 0 ? 'L' : 'R', bk = doorBk[sideK];
    const pivot = new THREE.Group(); pivot.name = 'door' + sideK; pivot.position.set(HINGE[0] * sd, HINGE[1], HINGE[2]); g.add(pivot);
    const inner = new THREE.Group(); inner.position.copy(pivot.position).negate(); pivot.add(inner);
    // the outer skin, as cut
    for (const k of ['paint', 'glass']) {
      const arr = bk[k], n = arr.length / 6, pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) { pos[i * 3 + c] = arr[i * 6 + c]; nrm[i * 3 + c] = arr[i * 6 + 3 + c]; }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
      const m = new THREE.Mesh(geo, M[k]); m.castShadow = k === 'paint'; m.receiveShadow = true; inner.add(m);
    }
    // the panel's shell: its edges, then its inner skin facing into the cabin
    const w = weld(bk.paint), shell = [], lining = [];
    for (const [a, b] of rim(w)) { const A = w.P[a], B = w.P[b], A1 = inset(w, a, DOOR_D), B1 = inset(w, b, DOOR_D); shell.push(...A, ...A1, ...B1, ...A, ...B1, ...B); }
    for (let t = 0; t < w.T.length; t += 3) lining.push(...inset(w, w.T[t], DOOR_D), ...inset(w, w.T[t + 2], DOOR_D), ...inset(w, w.T[t + 1], DOOR_D));
    inner.add(solid(shell, M.paint), solid(lining, M.cabin));
    // (the red light line along the inside, as the cabin's has; the front B pillar line and the A pillar's on the glass)
    const e1 = [], e2 = [];
    for (let k = 0; k <= 16; k++) { const z = -0.25 + 1.0 * (k / 16); e1.push(side(z, 0.6)); e2.push(side(z, 0.612)); }
    ribbon(e1, e2, M.ambient, -(DOOR_D + 0.003), [sd], inner);
    ribbon(...pillarB[1], M.trim, 0.004, [sd], inner);
    inner.add(pillarA(7, 0.93, sd));
    // the jambs round the opening, facing into it
    const all = weld([...bk.paint, ...bk.glass]);
    for (const [a, b] of rim(all)) {
      const A = all.P[a], B = all.P[b], A1 = inset(all, a, JAMB_D), B1 = inset(all, b, JAMB_D);
      jambs.push(...A, ...B1, ...A1, ...A, ...B, ...B1);
      if (A[1] < 0.36 && B[1] < 0.36) jambs.push(...A1, B1[0], CFLOOR, B1[2], ...B1, ...A1, A1[0], CFLOOR, A1[2], B1[0], CFLOOR, B1[2]);
    }
    doors[sideK] = { pivot, axis: V3(HAXIS[0], HAXIS[1] * sd, HAXIS[2] * sd), t: 0 };
  }
  g.add(solid(jambs, M.paint));
  // a door open by t (0 shut, 1 all the way up)
  function setDoor(sideK, t) { const d = doors[sideK]; if (!d) return; d.t = Math.max(0, Math.min(1, t)); d.pivot.quaternion.setFromAxisAngle(d.axis, HANG * d.t); }

  /* ------------------------------------------------------------- the lamps -- */
  // the nose: one slim white line along the bonnet's front edge, and off each end a short slash climbing the pod's front
  // facet (one line, where the maker's lamps are a separate cluster)
  const nose = S[S.length - 1];
  g.add(bar([-nose[8][0] + 0.005, 0.462, ZF], [nose[8][0] - 0.005, 0.462, ZF], 0.024, 0.01, [0, 0, 1], M.trim, 0.4));
  g.add(bar([-nose[8][0] + 0.015, 0.4625, ZF + 0.004], [nose[8][0] - 0.015, 0.4625, ZF + 0.004], 0.011, 0.012, [0, 0, 1], M.head, 0.5));
  both((sd) => { const a = at(ZF - 0.015, 5, 0.85), b = at(ZF - 0.14, 5, 0.6); return bar(mx(a.p, sd), mx(b.p, sd), 0.012, 0.012, mx(a.n, sd), M.head, 0.55); });
  // the tail: the full-width light bar, a deep red line straight across with square ends, in a deep gloss black band
  // under the deck's lip; then a crisp white ledge jutting out under it
  {
    const top = tailPts.filter((p) => p[1] > 0.86);
    // the lip: the deck's trailing edge carried back over the bar
    const lp = [], li = [];
    const edge = [...top.map((p) => [-p[0], p[1]]), ...top.slice().reverse().slice(1)];
    const D = 0.05, T = 0.026;
    for (const [x, y] of edge) lp.push(x, y, ZR, x, y, ZR - D, x, y - T, ZR - D, x, y - T, ZR);
    for (let i = 0; i < edge.length - 1; i++) {
      const a = i * 4, b = a + 4;
      li.push(a, b, a + 1, b, b + 1, a + 1); li.push(a + 1, b + 1, a + 2, b + 1, b + 2, a + 2); li.push(a + 2, b + 2, a + 3, b + 2, b + 3, a + 3);
    }
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3)); lg.setIndex(li);
    const lipGeo = lg.toNonIndexed(); lipGeo.computeVertexNormals();
    const lip = new THREE.Mesh(lipGeo, M.paint); lip.castShadow = true; g.add(lip);
    const back = (u, v, w, z0) => [u, v, z0 - w];   // (an outline in the tail's plane, standing out behind z0)
    prism(rect(-0.905, 0.745, 0.905, 0.849), 0.036, (u, v, w) => back(u, v, w, ZR), M.lower);
    prism(rect(-0.875, 0.778, 0.875, 0.816), 0.004, (u, v, w) => back(u, v, w, ZR - 0.036), M.tail);
    prism(rect(-0.862, 0.791, 0.862, 0.803), 0.002, (u, v, w) => back(u, v, w, ZR - 0.04), M.tailCore);
    // the ledge: across the car, its section a wedge (the outline here is [back from ZR, y])
    prism([[-0.05, 0.745], [0.045, 0.745], [0.045, 0.729], [-0.05, 0.698]], 1.76, (u, v, w) => [w - 0.88, v, ZR - u], M.paint);
  }

  /* -------------------------------------------- the tail's rocket package -- */
  // the plate, tight under the ledge on the dished white panel
  {
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 256;
    const cx = cv.getContext('2d');
    cx.fillStyle = '#EEEEEA'; cx.fillRect(0, 0, 512, 256);
    cx.strokeStyle = '#2A2C33'; cx.lineWidth = 10; cx.strokeRect(14, 14, 484, 228);
    cx.fillStyle = '#1C1E24'; cx.font = "700 150px 'Barlow Condensed', 'Arial Narrow', system-ui, sans-serif"; cx.textAlign = 'center'; cx.textBaseline = 'middle';
    cx.fillText('D4N', 256, 136);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const pm = new THREE.MeshStandardNodeMaterial({ map: tex, roughness: 0.35, metalness: 0.2 });
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.14), pm); plate.rotation.y = Math.PI; plate.position.set(0, 0.626, ZR + 0.026); g.add(plate);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.29, 0.15, 0.02), M.trim); back.position.set(0, 0.626, ZR + 0.038); g.add(back);
  }
  // the diffuser: one rounded black frame standing just proud of the tail, its top a beam carrying the five thrusters
  // (and four small dark housings between them), its sides running down and round into a lip 12 cm off the road; the
  // fan bays inside it, split by three strakes
  const NZX = [-0.43, -0.215, 0, 0.215, 0.43], NZY = 0.468, ZB = ZR - 0.02, FX = 0.68, FI = 0.6, FY = 0.12, BB = 0.385, BT = 0.55;
  {
    // (the outline of a rounded corner: centre, radius, from angle a0 to a1)
    const arc = (cx, cy, r, a0, a1, n = 6) => Array.from({ length: n + 1 }, (_, k) => { const a = a0 + (a1 - a0) * (k / n); return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; });
    const holes = NZX.map((x) => { const h = new THREE.Path(); h.absarc(x, NZY, 0.0435, 0, Math.PI * 2, true); return h; });
    // (the beam's ends flare out a little past the frame's sides, like a bracket)
    const E = FX + 0.035;
    prism([[-FX, BB], [FX, BB], [E, BB + 0.07], ...arc(E - 0.045, BT - 0.045, 0.045, 0, Math.PI / 2, 5), ...arc(-E + 0.045, BT - 0.045, 0.045, Math.PI / 2, Math.PI, 5), [-E, BB + 0.07]], 0.22, (u, v, w) => [u, v, ZB + w], M.diff, holes);
    // (the sides and the lip: a U under the beam, its edges rounded so the frame reads as one piece from behind and in
    // profile)
    const U = [[-FX, BB], ...arc(-FX + 0.12, FY + 0.12, 0.12, Math.PI, 1.5 * Math.PI, 6), ...arc(FX - 0.12, FY + 0.12, 0.12, 1.5 * Math.PI, 2 * Math.PI, 6), [FX, BB], [FI, BB],
      ...arc(FI - 0.05, FY + 0.13, 0.05, 0, -Math.PI / 2, 4), ...arc(-FI + 0.05, FY + 0.13, 0.05, -Math.PI / 2, -Math.PI, 4), [-FI, BB]];
    prism(U, 0.17, (u, v, w) => [u, v, ZB + 0.025 + w], M.diff, [], 0.025);
    // (ahead of it, the diffuser's floor rising toward the back wheels)
    prism([[ZB + 0.18, FY + 0.012], [-1.86, FY + 0.06], [-1.86, FY + 0.1], [ZB + 0.18, FY + 0.05]], 2 * FI, (u, v, w) => [w - FI, v, u], M.under);
    for (const x of [-0.3, 0, 0.3]) prism(rect(x - 0.015, FY + 0.03, x + 0.015, BB), 0.2, (u, v, w) => [u, v, ZB + 0.012 + w], M.diff);
    // (the bays' back wall, under the tail's own, and their floor)
    prism(rect(-0.616, FY, 0.616, 0.272), 0.01, (u, v, w) => [u, v, ZR + 0.16 + w], M.under);
  }
  // the fans in the bays: a housing ring on the back wall round a rotor that turns with the road
  const fans = [], FANY = 0.278;
  for (const x of [-0.45, -0.15, 0.15, 0.45]) {
    const ring = new THREE.Mesh(new THREE.LatheGeometry([[0.11, 0], [0.11, 0.03], [0.1, 0.034], [0.094, 0.0]].map(([a, b]) => new THREE.Vector2(a, b)), 28), M.trim);
    ring.rotation.x = -Math.PI / 2; ring.position.set(x, FANY, ZR + 0.158); g.add(ring);
    const duct = new THREE.Mesh(new THREE.CircleGeometry(0.096, 24), M.under); duct.rotation.y = Math.PI; duct.position.set(x, FANY, ZR + 0.157); g.add(duct);
    const rotor = new THREE.Group(); rotor.position.set(x, FANY, ZR + 0.15); g.add(rotor); fans.push(rotor);
    const parts = [new THREE.CylinderGeometry(0.03, 0.036, 0.03, 16).rotateX(Math.PI / 2)];
    for (let k = 0; k < 7; k++) { const b = new THREE.BoxGeometry(0.06, 0.026, 0.004); b.rotateX(0.5); b.translate(0.062, 0, 0); b.rotateZ((k / 7) * Math.PI * 2); parts.push(b.toNonIndexed()); }
    rotor.add(new THREE.Mesh(mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p))), M.fan));
  }
  // the thrusters: gunmetal bells set 2 cm into the beam, a thin bright lip; their throats glow as they light
  const NZ = NZX.map((x) => V3(x, NZY, ZB + 0.02));
  // (uElec: ALL ELECTRIC, the drive mode: the burn and the throats' glow go cyan for orange; setElectric)
  const uCold = uniform(0), uBurn = uniform(0), uT = uniform(0), uPuff = uniform(0), uElec = uniform(0);
  const throatM = new THREE.MeshBasicNodeMaterial();
  throatM.colorNode = mix(vec3(0.55, 0.75, 1.0), mix(vec3(1.0, 0.55, 0.18), vec3(0.15, 0.9, 1.0), uElec), uBurn.div(max(uCold.add(uBurn), 0.001))).mul(max(uCold, uBurn).mul(2.6).add(0.04));
  for (const p of NZ) {
    // (lathe outlines [radius, out along the axle]: the bell from deep inside to its lip, then the lip's bright rim)
    const bell = new THREE.Mesh(new THREE.LatheGeometry([[0.027, -0.12], [0.03, -0.05], [0.035, -0.008], [0.0372, 0], [0.0425, 0], [0.0428, -0.06]].map(([a, b]) => new THREE.Vector2(a, b)), 28), M.nozzle);
    bell.rotation.x = -Math.PI / 2; bell.position.copy(p); g.add(bell);
    // (and a bright flange round each mouth, on the beam's face, so the five read as silver rings)
    const rim = new THREE.Mesh(new THREE.LatheGeometry([[0.031, -0.024], [0.0325, 0.017], [0.036, 0.0215], [0.0445, 0.0215], [0.048, 0.019], [0.048, 0.01]].map(([a, b]) => new THREE.Vector2(a, b)), 28), M.lip);
    rim.rotation.x = -Math.PI / 2; rim.position.copy(p); g.add(rim);
    const throat = new THREE.Mesh(new THREE.CircleGeometry(0.03, 20), throatM); throat.rotation.y = Math.PI; throat.position.set(p.x, p.y, p.z + 0.05); g.add(throat);
  }
  for (const x of [-0.3225, -0.1075, 0.1075, 0.3225]) {
    const h = new THREE.Mesh(new THREE.LatheGeometry([[0.017, 0.0], [0.024, 0.003], [0.028, 0.0], [0.028, -0.02]].map(([a, b]) => new THREE.Vector2(a, b)), 20), M.trim);
    h.rotation.x = -Math.PI / 2; h.position.set(x, NZY, ZB - 0.001); g.add(h);
    const d = new THREE.Mesh(new THREE.CircleGeometry(0.018, 16), M.under); d.rotation.y = Math.PI; d.position.set(x, NZY, ZB - 0.0012); g.add(d);
  }

  /* -------------------------------------------------------------- the cabin -- */
  // seen through the glass: a floor, a liner along each side just under the window line (the doors carry their own), a
  // bulkhead behind the seats, the dash running forward under the windscreen over a footwell, two low bucket seats, a
  // console, the yoke on its column out of a pod before the driver (on the left), and a screen
  const yoke = new THREE.Group(), yokeSpin = new THREE.Group(); yoke.name = 'yoke'; yoke.add(yokeSpin);
  // the driver's mark: his hips on the seat, his heels in the footwell (both sides, the passenger's mirrored)
  const SEAT = { hip: [0.36, 0.35, -0.2], heel: [0.11, 0.27, 0.56] };
  {
    const quad = (a, b, c, d, mat) => { const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c, ...a, ...c, ...d], 3)); geo.computeVertexNormals(); g.add(new THREE.Mesh(geo, mat)); };
    const CF = CFLOOR, Z0c = ZQ + 0.02, Z1c = 1.45;
    quad([-0.8, CF, Z0c], [0.8, CF, Z0c], [0.8, CF, Z1c], [-0.8, CF, Z1c], M.cabin);
    // (the liners: in under the window line all along, then level under the dash; none where the doors are)
    const lz = []; for (let z = Z0c; z < Z1c; z += 0.05) lz.push(z); lz.push(Z1c);
    const lx = (z) => (z <= ZAP[1] ? Math.min(0.8, BLX(z) - 0.05) : 0.8), ly = (z) => (z <= ZAP[1] ? BLY(z) - 0.012 : 0.66);
    for (const sd of [1, -1]) for (let i = 0; i < lz.length - 1; i++) {
      const [za, zb] = [lz[i], lz[i + 1]];
      if (zb > -0.39 && za < 0.88) continue;
      quad([sd * lx(za), CF, za], [sd * lx(zb), CF, zb], [sd * lx(zb), ly(zb), zb], [sd * lx(za), ly(za), za], M.cabin);
      if (za > -0.65 && zb < 0.55) quad([sd * (lx(za) - 0.004), 0.6, za], [sd * (lx(zb) - 0.004), 0.6, zb], [sd * (lx(zb) - 0.004), 0.612, zb], [sd * (lx(za) - 0.004), 0.612, za], M.ambient);
    }
    const bw = Math.min(BLX(Z0c), CRX(Z0c)) - 0.02;
    quad([-bw, CF, Z0c], [bw, CF, Z0c], [bw, CRY(Z0c) - 0.02, Z0c], [-bw, CRY(Z0c) - 0.02, Z0c], M.cabin);
    // (the dash, its profile [z, y] across the car: a shelf over the footwell, the toe board under it)
    prism([[0.55, 0.47], [0.74, 0.44], [0.8, CF], [Z1c, CF], [Z1c, 0.665], [0.64, 0.625], [0.55, 0.53]], 1.6, (u, v, w) => [w - 0.8, v, u], M.cabin);
    prism(rect(-0.09, CF, 0.09, 0.46), 1.1, (u, v, w) => [u, v, 0.55 - w], M.cabin);
    // (the seats: a low cushion and a raked back in one profile, set across the car)
    for (const x of [SEAT.hip[0], -SEAT.hip[0]]) prism([[0.12, CF + 0.01], [0.12, 0.3], [-0.28, 0.26], [-0.35, 0.29], [-0.68, 0.92], [-0.79, 0.93], [-0.5, 0.26], [-0.42, CF + 0.01]], 0.46, (u, v, w) => [x - 0.23 + w, v, u], M.seat);
    // (the driver's pod on the dash, the yoke's column out of it)
    prism([[0.3, 0.52], [0.56, 0.47], [0.56, 0.64], [0.38, 0.645]], 0.3, (u, v, w) => [SEAT.hip[0] - 0.15 + w, v, u], M.cabin);
    // (the yoke, the screen in the middle of the dash)
    // (its axis down and forward from his chest to the pod: the rim's top leans toward the dash)
    yoke.position.set(SEAT.hip[0], 0.69, 0.06); yoke.rotation.x = 0.33; g.add(yoke);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.018, 8, 28), M.trim); ring.scale.set(1, 0.62, 1); yokeSpin.add(ring);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.03, 20), M.trim); hub.rotation.x = Math.PI / 2; yokeSpin.add(hub);
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.028, 0.3, 10), M.trim); col.rotation.x = Math.PI / 2; col.position.z = 0.15; yoke.add(col);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.17), M.screen); scr.rotation.x = -0.35; scr.position.set(0, 0.68, 0.6); scr.rotation.y = Math.PI; g.add(scr);
  }
  // where a hand holds the yoke (the wrist's mark: a touch out, under and back from the rim's end), in the world
  const gripOf = (sideK, out = new THREE.Vector3()) => { yokeSpin.updateWorldMatrix(true, false); return yokeSpin.localToWorld(out.set(sideK === 'L' ? 0.17 : -0.17, -0.035, -0.05)); };
  // (Dan in his seat goes in here, in the car's own frame)
  const anchor = new THREE.Group(); anchor.name = 'driver'; g.add(anchor);

  /* ----------------------------------------------------------- the splitter -- */
  // a thick black blade under the whole nose, from the front wheels forward, a touch proud of the sides and jutting 5 cm
  // out past the undercut face: with the black under the side, one chin
  {
    const side = [1.83, 1.9, 1.97, 2.04, 2.1, 2.16, ZF - 0.02].map((z) => [SX(z) + 0.012 - 0.07 * Math.min(1, Math.max(0, (z - 1.6) / 0.4)) ** 2, z]);
    const out = [...side, [SX(ZF) - 0.03, ZF - 0.025]];
    const m = prism([...out, ...out.slice().reverse().map(([x, z]) => [-x, z])], 0.06, (u, v, w) => [u, 0.18 - w, v], M.diff);
    m.userData.rigid = true;
  }

  /* ------------------------------------------------------------ the wheels -- */
  const wheels = [];
  function wheel(ax, sd) {
    const W = new THREE.Group(), spin = new THREE.Group(); W.add(spin);
    const rim = new THREE.Group(); rim.rotation.z = -sd * Math.PI / 2; spin.add(rim);   // (in here the axle is y, the face +y)
    const r = ax.r, tw = ax.w / 2, rimR = r - 0.05;
    // the tyre: its section turned round the axle; a thin, square-shouldered sidewall (5 cm of rubber round the rim)
    const sec = [[rimR + 0.003, -tw * 0.86], [rimR + 0.012, -tw * 0.98], [r - 0.017, -tw], [r - 0.005, -tw * 0.93], [r, -tw * 0.74], [r, tw * 0.74], [r - 0.005, tw * 0.93], [r - 0.017, tw], [rimR + 0.012, tw * 0.98], [rimR + 0.003, tw * 0.86]];
    const tyre = new THREE.Mesh(new THREE.LatheGeometry(sec.map(([a, b]) => new THREE.Vector2(a, b)), 44), M.rubber); tyre.castShadow = true; rim.add(tyre);
    // the aero disc: a pale dish, a little hollow toward the hub, inside a gloss black lip
    const dish = [[rimR - 0.01, tw * 0.83], [rimR * 0.72, tw * 0.71], [0.07, tw * 0.64], [0.0, tw * 0.62]];
    rim.add(new THREE.Mesh(new THREE.LatheGeometry(dish.map(([a, b]) => new THREE.Vector2(a, b)), 48), M.disc));
    const lipGeo = new THREE.LatheGeometry([[rimR + 0.007, tw * 0.84], [rimR - 0.001, tw * 0.885], [rimR - 0.012, tw * 0.86], [rimR - 0.016, tw * 0.82]].map(([a, b]) => new THREE.Vector2(a, b)), 48);
    const dishAt = (rho) => { for (let i = 0; i < dish.length - 1; i++) { const [r0, y0] = dish[i], [r1, y1] = dish[i + 1]; if (rho <= r0 && rho >= r1) return y0 + (y1 - y0) * (r0 - rho) / (r0 - r1); } return dish[0][1]; };
    const inner = new THREE.Mesh(new THREE.CircleGeometry(rimR + 0.01, 32), M.under); inner.rotation.x = Math.PI / 2; inner.position.y = -tw * 0.7; rim.add(inner);
    // over it, five bold turbine spokes running straight out from the hub to the lip: each a long faceted diamond,
    // widest a little past halfway out, with a ridge off its middle, so one face catches the light and the other falls dark
    const sp = [];
    // (a face's outward normal, away from a point inside the blade; and a quad, its near edge's corners a, b carrying
    // normal na, its far edge's c, d carrying nc, so each face is smooth along the blade and sharp across it)
    const outN = (a, b, c, d, inside) => {
      const nn = unit(cross(sub(b, a), sub(d, a))), cen = [(a[0] + b[0] + c[0] + d[0]) / 4, (a[1] + b[1] + c[1] + d[1]) / 4, (a[2] + b[2] + c[2] + d[2]) / 4];
      return nn[0] * (cen[0] - inside[0]) + nn[1] * (cen[1] - inside[1]) + nn[2] * (cen[2] - inside[2]) < 0 ? nn.map((v) => -v) : nn;
    };
    const face = (a, b, c, d, inside, na, nc) => {
      const n = outN(a, b, c, d, inside), flip = len3(cross(sub(b, a), sub(d, a))) > 0 && unit(cross(sub(b, a), sub(d, a)))[0] * n[0] + unit(cross(sub(b, a), sub(d, a)))[1] * n[1] + unit(cross(sub(b, a), sub(d, a)))[2] * n[2] < 0;
      na = na || n; nc = nc || n;
      const N = new Map([[a, na], [b, na], [c, nc], [d, nc]]);
      for (const q of flip ? [a, d, c, a, c, b] : [a, b, c, a, c, d]) sp.push(...q, ...N.get(q));
    };
    for (let k = 0; k < 5; k++) {
      const rows = [], ins = [], ST = 8;
      for (let j = 0; j <= ST; j++) {
        const t = j / ST, rho = 0.045 + (rimR - 0.014 - 0.045) * t, phi = (k / 5) * Math.PI * 2, w = t < 0.55 ? 0.025 + 0.018 * (t / 0.55) : 0.043 - 0.013 * ((t - 0.55) / 0.45);
        const base = dishAt(rho) - 0.003, wall = 0.02 - 0.008 * t, ridge = 0.011 - 0.003 * t;
        const c = [Math.cos(phi), Math.sin(phi)], q = [-Math.sin(phi), Math.cos(phi)];
        const P = (s, h) => [c[0] * rho + q[0] * s, base + h, c[1] * rho + q[1] * s];
        rows.push([P(-w, 0), P(-w, wall), P(w * 0.3, wall + ridge), P(w, wall), P(w, 0)]); ins.push(P(0, wall * 0.5));
      }
      for (let f = 0; f < 4; f++) {
        const qn = []; for (let j = 0; j < ST; j++) qn.push(outN(rows[j][f], rows[j][f + 1], rows[j + 1][f + 1], rows[j + 1][f], ins[j]));
        const vn = (j) => unit(qn[Math.max(0, j - 1)].map((v, i) => v + qn[Math.min(ST - 1, j)][i]));
        for (let j = 0; j < ST; j++) face(rows[j][f], rows[j][f + 1], rows[j + 1][f + 1], rows[j + 1][f], ins[j], vn(j), vn(j + 1));
      }
      const e = rows[ST], ie = [ins[ST][0] * 0.9, ins[ST][1], ins[ST][2] * 0.9];
      face(e[0], e[1], e[3], e[4], ie); face(e[1], e[2], e[2], e[3], ie);
    }
    const sg = new THREE.BufferGeometry(), arr = new Float32Array(sp), n = arr.length / 6, pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) { pos[i * 3 + c] = arr[i * 6 + c]; nrm[i * 3 + c] = arr[i * 6 + 3 + c]; }
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); sg.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    // (the lip, the spokes and the hub, all gloss black: one mesh)
    const hubY = dish[dish.length - 1][1] + 0.014, hubGeo = new THREE.CylinderGeometry(0.052, 0.06, 0.03, 24).translate(0, hubY, 0);
    const blacks = [lipGeo, sg, hubGeo].map((q) => { q = q.index ? q.toNonIndexed() : q; for (const k of Object.keys(q.attributes)) if (k !== 'position' && k !== 'normal') q.deleteAttribute(k); return q; });
    const spokes = new THREE.Mesh(mergeGeometries(blacks), M.spoke); spokes.castShadow = true; rim.add(spokes);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.022, 0.006, 16), M.fan); cap.position.y = hubY + 0.017; rim.add(cap);
    return { W, spin };
  }
  for (const ax of AXLES) for (const sd of [1, -1]) {
    const wh = wheel(ax, sd); wh.W.position.set(sd * ax.x, ax.r, ax.z); g.add(wh.W);
    wheels.push({ ...wh, front: ax.z > 0, r: ax.r });
  }

  /* ------------------------------------------------------------ the plumes -- */
  // lathes along -z (t runs 0 at the nozzle to 1 at the tip), five merged into one mesh per kind, each nozzle's seed in
  // an attribute so they flicker apart
  function plumeGeo(radius, n = 22) {
    const geos = NZ.map((p, i) => {
      const pts = []; for (let j = 0; j <= n; j++) { const t = j / n; pts.push(new THREE.Vector2(Math.max(0.0005, radius(t)), t)); }
      const lg = new THREE.LatheGeometry(pts, 12); lg.rotateX(-Math.PI / 2); lg.translate(p.x, p.y, 0);
      lg.setAttribute('seed', new THREE.Float32BufferAttribute(new Array(lg.attributes.position.count).fill(i * 1.37 + 0.4), 1)); return lg;
    });
    return mergeGeometries(geos);
  }
  // (floor: how much of it still shows edge on, as when the jet points at the camera)
  // (e0, e1: its colours while electric, uElec mixing them in)
  function plumeMat({ c0, c1, e0, e1, gain, level, fade = 1.6, diamonds = 0, edge = 1.4, additive = true, floor = 0 }) {
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    const t = uv().y, seed = attribute('seed', 'float');
    const facing = mix(float(floor), float(1), pow(abs(normalView.dot(positionViewDirection)), float(edge)));
    const flick = sin(uT.mul(61).add(seed.mul(13))).mul(sin(uT.mul(27).add(seed.mul(7)))).mul(0.14).add(0.9);
    let k = pow(float(1).sub(t), float(fade));
    if (diamonds) k = k.mul(pow(abs(cos(t.mul(diamonds * Math.PI).sub(uT.mul(3)).add(seed))), float(5)).mul(1.6).add(0.3));
    const col = mix(vec3(...c0), vec3(...c1), t);
    m.colorNode = (e0 ? mix(col, mix(vec3(...e0), vec3(...e1), t), uElec) : col).mul(gain);
    m.opacityNode = k.mul(facing).mul(flick).mul(level).clamp(0, 1);
    return m;
  }
  const P0 = ZB - 0.005;   // (the nozzles' exit plane)
  const plumes = [];
  function plume(geo, mat, len) { const m = new THREE.Mesh(geo, mat); m.position.z = P0; m.renderOrder = 5; m.frustumCulled = false; m.userData.len = len; g.add(m); plumes.push(m); return m; }
  // cold gas: a tight white jet strung with shock diamonds (drawn solid, so it holds against a bright sky), inside a pale
  // blue glow that stays narrower than the gaps, inside a white vapour that billows out wide and merges behind the car
  const coldCore = plume(plumeGeo((t) => (0.02 + 0.016 * t) * (0.55 + 0.45 * Math.abs(Math.cos(t * 4 * Math.PI))) * (1 - 0.5 * t * t)),
    plumeMat({ c0: [0.95, 0.98, 1.0], c1: [0.7, 0.85, 1.0], gain: 1.6, level: uCold, fade: 1.3, diamonds: 4, edge: 0.6, additive: false }), 1.6);
  const coldHaze = plume(plumeGeo((t) => 0.03 + 0.065 * Math.pow(t, 0.7)),
    plumeMat({ c0: [0.78, 0.9, 1.0], c1: [0.6, 0.76, 1.0], gain: 0.95, level: uCold.mul(0.55), fade: 2.2, edge: 1.8 }), 2.4);
  const coldVapor = plume(plumeGeo((t) => 0.035 + 0.14 * Math.pow(t, 0.75)),
    plumeMat({ c0: [0.94, 0.96, 1.0], c1: [0.86, 0.89, 0.94], gain: 1.0, level: uCold.mul(0.45), fade: 1.5, edge: 1.3, additive: false, floor: 0.3 }), 1.9);
  coldVapor.renderOrder = 4;
  // the burn: a yellow-white tongue with its own diamonds (drawn solid so it reads against a bright sky) inside an
  // orange flame no wider than its own nozzle's share of the tail
  const fireCore = plume(plumeGeo((t) => Math.max(0.004, 0.028 + 0.014 * Math.sin(Math.PI * Math.min(1, t * 1.6)) - 0.036 * t * t)),
    plumeMat({ c0: [1.0, 0.78, 0.36], c1: [1.0, 0.38, 0.08], e0: [0.6, 0.98, 1.0], e1: [0.05, 0.78, 1.0], gain: 1.6, level: uBurn.mul(0.85), fade: 0.8, diamonds: 4, edge: 0.5, additive: false }), 1.6);
  const fireOuter = plume(plumeGeo((t) => 0.038 + 0.047 * Math.sin(Math.PI * Math.pow(t, 0.6)) * (1 - 0.35 * t)),
    plumeMat({ c0: [1.0, 0.42, 0.1], c1: [0.85, 0.14, 0.03], e0: [0.0, 0.85, 1.0], e1: [0.0, 0.45, 0.9], gain: 1.45, level: uBurn.mul(0.75), fade: 1.0, edge: 1.3 }), 3.8);
  // (and round it, drawn solid, a dark orange flame going to smoke, so the burn reads in daylight too)
  const fireSmoke = plume(plumeGeo((t) => 0.05 + 0.13 * Math.pow(t, 0.8)),
    plumeMat({ c0: [0.95, 0.4, 0.1], c1: [0.34, 0.3, 0.28], e0: [0.05, 0.7, 0.88], e1: [0.26, 0.32, 0.36], gain: 1.0, level: uBurn.mul(0.4), fade: 1.2, edge: 1.4, additive: false, floor: 0.3 }), 3.0);
  fireSmoke.renderOrder = 4;
  // a burst at each nozzle's mouth, always facing the camera, so the jets read even end on, from the chase camera
  const burstM = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false });
  {
    const d = uv().sub(vec2(0.5)).length().mul(2), share = uBurn.div(max(uCold.add(uBurn), 0.001));
    burstM.colorNode = mix(vec3(0.92, 0.96, 1.0), mix(vec3(1.0, 0.62, 0.24), vec3(0.3, 0.92, 1.0), uElec), share).mul(1.5);
    burstM.opacityNode = pow(max(float(1).sub(d), 0), float(1.4)).mul(max(uCold.mul(0.75), uBurn.mul(0.9)));
  }
  const bursts = NZ.map((p) => { const b = new THREE.Sprite(burstM); b.position.set(p.x, p.y, P0 - 0.07); b.renderOrder = 6; g.add(b); plumes.push(b); return b; });
  // the perimeter thrusters: at the back, straight down from flush ports under the diffuser's lip, a cloud billowing where
  // they hit the road; at the front, short puffs out from under the splitter
  const puffM = plumeMat({ c0: [0.95, 0.97, 1.0], c1: [0.86, 0.9, 0.96], gain: 1.1, level: uPuff.mul(0.6), fade: 1.4, edge: 2.0, additive: false });
  const puffs = [];
  for (const [x, y, z, dx, dy, dz, len, r0, r1] of [[0.5, FY - 0.0005, -2.02, 0.15, -1, -0.1, 0.11, 0.02, 0.12], [-0.5, FY - 0.0005, -2.02, -0.15, -1, -0.1, 0.11, 0.02, 0.12],
    [0.5, 0.1195, ZF - 0.13, 0.35, -0.45, 0.8, 0.42, 0.016, 0.12], [-0.5, 0.1195, ZF - 0.13, -0.35, -0.45, 0.8, 0.42, 0.016, 0.12]]) {
    const pts = []; for (let j = 0; j <= 12; j++) { const t = j / 12; pts.push(new THREE.Vector2(r0 + (r1 - r0) * Math.sqrt(t), t * len)); }
    const lg = new THREE.LatheGeometry(pts, 14); lg.rotateX(-Math.PI / 2);
    // (uv's v runs along the lathe's outline, so 0 at the port to 1 at the tip)
    lg.setAttribute('seed', new THREE.Float32BufferAttribute(new Array(lg.attributes.position.count).fill(x * 3 + z), 1));
    const m = new THREE.Mesh(lg, puffM); m.position.set(x, y, z); m.quaternion.setFromUnitVectors(V3(0, 0, -1), V3(dx, dy, dz).normalize()); m.frustumCulled = false; m.renderOrder = 5;
    g.add(m); puffs.push(m); plumes.push(m);
    const port = new THREE.Mesh(new THREE.RingGeometry(0.012, 0.02, 14), M.trim); port.position.set(x, y + 0.001, z); port.quaternion.setFromUnitVectors(V3(0, 0, 1), V3(dx, dy, dz).normalize()); g.add(port);
  }
  const billowM = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
  {
    // (a lumpy cloud, not rings)
    const q = uv().sub(vec2(0.5)), d = q.length().mul(2), swirl = sin(q.x.mul(17).add(uT.mul(3))).mul(sin(q.y.mul(13).sub(uT.mul(2.3)))).mul(0.22).add(0.8);
    billowM.colorNode = vec3(0.93, 0.95, 0.98);
    billowM.opacityNode = pow(max(float(1).sub(d), 0), float(1.3)).mul(swirl).mul(uPuff).mul(0.6);
  }
  const billows = [];
  for (const sd of [1, -1]) { const b = new THREE.Mesh(new THREE.CircleGeometry(0.5, 28), billowM); b.rotation.x = -Math.PI / 2; b.position.set(sd * 0.58, 0.02, -2.06); b.renderOrder = 5; b.frustumCulled = false; g.add(b); billows.push(b); plumes.push(b); }
  // and the glow they throw on the road and the car's tail
  // (high and well back, so it washes the road and the tail softly rather than pooling under the nozzles)
  const glow = new THREE.PointLight('#FF9A48', 0, 6, 1.6); glow.position.set(0, 0.95, ZR - 1.3); g.add(glow);

  /* ------------------------------------------------- one mesh per material -- */
  // the fixed parts (trim, lamps, seams, the beam and frame, the thrusters' bells and throats...) baked into one mesh per
  // material and bent with the nose, so the car costs a few draw calls; the body, the wheels, the fans' rotors, the
  // plumes and the plate stay as they are
  {
    g.updateMatrixWorld(true);
    const keep = new Set([body, glow, ...wheels.map((w) => w.W), ...plumes, ...fans, ...Object.values(doors).map((d) => d.pivot), yoke, anchor]), byMat = new Map(), gone = [];
    for (const o of g.children) {
      if (keep.has(o)) continue;
      o.traverse((m) => {
        if (!m.isMesh || m.material.map) return;
        let geo = m.geometry.clone().applyMatrix4(m.matrixWorld); if (geo.index) geo = geo.toNonIndexed();
        for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal') geo.deleteAttribute(k);
        if (!m.userData.rigid) bendGeo(geo);
        if (!byMat.has(m.material)) byMat.set(m.material, []); byMat.get(m.material).push(geo);
      });
      if (o.isMesh ? !o.material.map : true) gone.push(o);
    }
    for (const o of gone) g.remove(o);
    for (const [mat, geos] of byMat) { const m = new THREE.Mesh(mergeGeometries(geos), mat); m.castShadow = true; m.receiveShadow = true; g.add(m); }
  }

  let cold = 0, burn = 0, coldWant = 0, burnWant = 0, t = 0, puffT = 0;
  function setThrust(c, b = 0) { coldWant = Math.max(0, Math.min(1, c)); burnWant = Math.max(0, Math.min(1, b)); }
  function applyThrust() {
    uCold.value = cold; uBurn.value = burn; uT.value = t;
    const j = 0.94 + 0.06 * Math.sin(t * 47) * Math.sin(t * 19);
    const L = (m, k) => { m.scale.z = m.userData.len * Math.max(0.02, k); };
    L(coldCore, (0.25 + 0.75 * cold) * j); L(coldHaze, 0.3 + 0.7 * cold);
    L(fireCore, (0.2 + 0.8 * burn) * j); L(fireOuter, (0.25 + 0.75 * burn) * (0.9 + 0.1 * Math.sin(t * 31)));
    L(coldVapor, 0.3 + 0.7 * cold); L(fireSmoke, 0.3 + 0.7 * burn);
    for (const p of plumes) { p.visible = true; p.castShadow = false; p.receiveShadow = false; }
    // the perimeter thrusters fire in short bursts while the cold gas is on
    uPuff.value = cold * (0.55 + 0.45 * Math.max(0, Math.sin(puffT * 9)));
    for (const p of puffs) p.scale.setScalar(0.5 + 0.5 * uPuff.value);
    for (const b of billows) b.scale.setScalar(0.4 + 0.8 * uPuff.value);
    const bs = 0.14 + 0.34 * Math.max(cold, burn) * j; for (const b of bursts) b.scale.setScalar(bs);
    glow.intensity = burn * 2.4 + cold * 0.4;
    const eb = uElec.value * burn;
    glow.color.setRGB(1 - 0.6 * eb, 0.62 + 0.3 * (1 - burn) + 0.28 * eb, 0.32 + 0.6 * (1 - burn) + 0.68 * eb);
  }

  /* -------------------------------------------------------------- driving -- */
  // per frame: the wheels and the fans turn with the distance, the fronts steer, the thrust eases toward what was asked
  function update(dt, speed = 0, steer = 0) {
    t += dt; puffT += dt * cold;
    for (const w of wheels) { w.spin.rotation.x += (speed * dt) / w.r; if (w.front) w.W.rotation.y = steer * 0.42; }
    for (const f of fans) f.rotation.z += dt * (2 + Math.abs(speed) * 1.5);
    // (the yoke turns with the front wheels, a good deal further: left (steer > 0) is anticlockwise to the driver)
    yokeSpin.rotation.z += (-steer * 1.15 - yokeSpin.rotation.z) * Math.min(1, dt * 16);
    cold += (coldWant - cold) * Math.min(1, dt * 10); burn += (burnWant - burn) * Math.min(1, dt * 6);
    applyThrust();
  }
  setThrust(o.cold ?? 0, o.burn ?? 0); cold = coldWant; burn = burnWant; applyThrust();
  // the doors: setDoor / door(side, t), t 0 shut to 1 up; doorT(side) how far open it is. The cabin: anchor (a group in
  // the car's own frame, for a driver), seat (his marks, the driver's side; mirror x for the passenger's), grip(side) the
  // world point a hand holds the yoke at
  // ALL ELECTRIC (wagmi/game.js calls it with the drive mode): the burn cyan, not orange
  const setElectric = (on) => { uElec.value = on ? 1 : 0; };
  return { group: g, materials: M, wheels, setThrust, setElectric, update, length: ZF - ZR, width: 2.0, height: 1.16,
    setDoor, door: setDoor, doorT: (sideK) => doors[sideK]?.t ?? 0, doors, anchor, seat: SEAT, grip: gripOf, yoke };
}

/* ================================================================ the driver -- */
// Dan at the wheel, and on his way in or out of the driver's door (the left, +x), posed in the car's own frame. q is
// his rig (WAGMI.dan): body (the glb scene), bones by name, mixer, act(name) (a clip's action on that mixer):
//   const d = createDriver(THREE, car, WAGMI.dan);
//   d.attach();          // into the car where he stands, eased over from the pose he is in
//   d.pose(dt, k);       // k 0: standing at the door (d.door, car-local [x, z]) facing the way the car does; 1: in the
//                        // seat, hands on the yoke
//   d.detach(parent);    // back out, his body put in parent (standing at the door)
// k runs the way in: a hand down on the sill, the right foot in over the sill, the seat taken leaning out and
// ducking forward under the roof, the left leg in, then back into the seat by way of the middle (the head never near
// the B pillar). The way out is the same, backwards.
export function createDriver(THREE, rs, q, { fade = 0.22 } = {}) {
  const { body, bones: B, mixer } = q, anchor = rs.anchor, S = rs.seat, sit = q.act('sit'), idle = q.act('idle');
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const smooth = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
  // a track through keys [k, value...]: eased in and out at each key
  const track = (keys) => (k) => {
    if (k <= keys[0][0]) return keys[0].slice(1);
    for (let i = 1; i < keys.length; i++) if (k <= keys[i][0]) { const a = keys[i - 1], b = keys[i], t = smooth((k - a[0]) / (b[0] - a[0])); return a.slice(1).map((v, j) => v + (b[j + 1] - v) * t); }
    return keys[keys.length - 1].slice(1);
  };
  // (the car's marks are its model's, times its scale, rs.scale; the seat's, rs.seat, come in the anchor's frame,
  // already scaled)
  const sc = rs.scale || 1, m = (...v) => v.map((x) => x * sc);
  const DOOR = m(1.45, -0.26), [hx, hy, hz] = S.hip, [fx, fy, fz] = S.heel;
  let R0 = null;   // (his hips over his feet in the idle, measured the first time)
  const hip = (k) => track([[0, DOOR[0] + R0.x, R0.y, DOOR[1] + R0.z], [0.3, ...m(1.12, 0.6, -0.2)], [0.55, ...m(0.62, 0.39, -0.2)], [0.75, hx + 0.04 * sc, hy, hz], [1, hx, hy, hz]])(k);
  const yaw = track([[0, 0], [0.25, 0.55], [0.5, 0.8], [0.72, 0.45], [1, 0]]);
  // the lean of his back (from his hips to his neck): [weight, tilt from upright, which way (from ahead, +z, toward
  // the door, +x)]
  const lean = track([[0, 0, 0, 0], [0.15, 1, 0.25, 0.55], [0.35, 1, 0.5, 0.7], [0.55, 1, 0.65, 0.3], [0.72, 1, 0.6, -0.3], [0.88, 1, 0.55, -1.6], [1, 1, 0.5, -Math.PI]]);
  // the feet (the ankles' marks) and how much they follow them
  const footR = track([[0.1, DOOR[0] - 0.12, 0.12, DOOR[1] + 0.05], [0.28, ...m(1.02, 0.5, 0)], [0.42, ...m(0.62, 0.3, 0.25)], [0.75, hx - 0.06 * sc, fy, 0.45 * sc], [1, hx - fx, fy, fz]]);
  const footL = track([[0.1, DOOR[0] + 0.1, 0.12, DOOR[1]], [0.55, DOOR[0] - 0.25, 0.12, 0], [0.66, ...m(1.2, 0.22, 0.15)], [0.78, ...m(0.95, 0.52, 0.3)], [0.9, ...m(0.55, 0.33, 0.5)], [1, hx + fx, fy, fz]]);
  const wFoot = track([[0.06, 0, 0], [0.18, 1, 1]]);
  // the hands: the left down on the sill beside him while he gets down, both to the yoke at the end
  const wSill = track([[0.18, 0], [0.32, 1], [0.55, 1], [0.66, 0]]), wYoke = track([[0.8, 0], [1, 1]]), SILL = m(0.93, 0.4, -0.08);
  const sitW = track([[0.08, 0], [0.55, 1]]);

  const _a = V(), _b = V(), _c = V(), _t = V(), _n = V(), _p = V(), _r = V(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _qw = new THREE.Quaternion();
  const up = V(0, 1, 0);
  // turn bone b by the world rotation r (on top of its world orientation)
  function turnWorld(b, r) { b.getWorldQuaternion(_qw); _q2.copy(r).multiply(_qw); b.parent.getWorldQuaternion(_qw); b.quaternion.copy(_qw.invert().multiply(_q2)); b.updateMatrixWorld(true); }
  // two-bone reach: b1 (shoulder, hip), b2 (elbow, knee), b3 (wrist, ankle) to the world point to, the middle joint
  // toward the world direction pole; w blends it over the pose
  function reach(n1, n2, n3, to, pole, w) {
    const b1 = B[n1], b2 = B[n2], b3 = B[n3]; if (!b1 || !b2 || !b3 || w < 0.01) return;
    const q1 = b1.quaternion.clone(), q2 = b2.quaternion.clone();
    b1.getWorldPosition(_a); b2.getWorldPosition(_b); b3.getWorldPosition(_c);
    const la = _a.distanceTo(_b), lb = _b.distanceTo(_c), d = Math.min(la + lb - 1e-3, Math.max(1e-3, to.distanceTo(_a)));
    const cur = _p.subVectors(_a, _b).normalize().angleTo(_n.subVectors(_c, _b).normalize());
    const want = Math.acos(Math.min(1, Math.max(-1, (la * la + lb * lb - d * d) / (2 * la * lb))));
    _n.crossVectors(_p.subVectors(_a, _b), _n.subVectors(_c, _b)); if (_n.lengthSq() < 1e-8) _n.set(1, 0, 0); _n.normalize();
    turnWorld(b2, _q.setFromAxisAngle(_n, want - cur));
    b3.getWorldPosition(_c);
    turnWorld(b1, _q.setFromUnitVectors(_p.subVectors(_c, _a).normalize(), _n.subVectors(to, _a).normalize()));
    b2.getWorldPosition(_b);
    const ax = _p.subVectors(to, _a).normalize(), e = _n.subVectors(_b, _a); e.addScaledVector(ax, -e.dot(ax));
    const pl = _r.copy(pole); pl.addScaledVector(ax, -pl.dot(ax));
    if (e.lengthSq() > 1e-6 && pl.lengthSq() > 1e-6) { let ang = e.angleTo(pl); if (_c.crossVectors(e, pl).dot(ax) < 0) ang = -ang; turnWorld(b1, _q.setFromAxisAngle(ax, ang)); }
    if (w < 0.999) { b1.quaternion.slerpQuaternions(q1, _q.copy(b1.quaternion), w); b2.quaternion.slerpQuaternions(q2, _q2.copy(b2.quaternion), w); b1.updateMatrixWorld(true); }
  }
  const world = (a, out) => anchor.localToWorld(out.set(a[0], a[1], a[2]));
  const dirOf = (a, b, out) => out.subVectors(B[b].getWorldPosition(_t), B[a].getWorldPosition(out)).normalize();
  const bodyQ = new THREE.Quaternion(), _pole = V(), _to = V(), _d = V(), _w = V();
  // in his own frame (yaw only), as a world direction
  const his = (x, y, z, out) => out.set(x, y, z).applyQuaternion(bodyQ).applyQuaternion(anchor.getWorldQuaternion(_qw)).normalize();

  const snap = { on: false, t: 0, q: new Map(), root: V(), pos: V(), quat: new THREE.Quaternion() };
  const all = Object.values(B);
  function weights(sw) {
    for (const a of mixer._actions) if (a !== sit && a !== idle) a.setEffectiveWeight(0);
    for (const a of [sit, idle]) { a.enabled = true; if (!a.isRunning()) a.play(); }
    sit.time = 0; sit.setEffectiveWeight(sw); idle.setEffectiveWeight(1 - sw);
  }
  const d = {
    door: DOOR, attached: false,
    // into the car, from wherever (and however) he stands: the pose he is in eased over to the one asked for
    attach(ease = fade) {
      anchor.updateWorldMatrix(true, false); body.updateWorldMatrix(true, false);
      for (const b of all) { let s = snap.q.get(b); if (!s) snap.q.set(b, (s = new THREE.Quaternion())); s.copy(b.quaternion); }
      snap.root.copy(B.root.position);
      anchor.attach(body); snap.pos.copy(body.position); snap.quat.copy(body.quaternion);
      snap.on = ease > 0; snap.t = 0; snap.dur = ease;
      if (!R0) {
        // (the idle's hips, in his own frame)
        const p0 = body.position.clone(), q0 = body.quaternion.clone();
        weights(0); mixer.update(0); body.position.set(0, 0, 0); body.quaternion.identity(); body.updateMatrixWorld(true);
        R0 = anchor.worldToLocal(B.root.getWorldPosition(V()));
        body.position.copy(p0); body.quaternion.copy(q0);
      }
      d.attached = true;
    },
    detach(parent) {
      parent.add(body); body.position.set(0, 0, 0); body.quaternion.identity();
      // (the clips' weights are his rig's again: it, or a scene, sets them)
      sit.setEffectiveWeight(0); sit.stop();
      d.attached = false;
    },
    pose(dt, k, { steer = 0 } = {}) {
      k = Math.min(1, Math.max(0, k));
      weights(smooth(sitW(k)[0])); mixer.update(dt);
      // where he is: turned by his yaw, then moved so his hips are on their mark
      bodyQ.setFromAxisAngle(up, yaw(k)[0]);
      body.quaternion.copy(bodyQ); body.position.set(0, 0, 0); body.updateMatrixWorld(true);
      const h = hip(k), r = anchor.worldToLocal(B.root.getWorldPosition(_p));
      body.position.set(h[0] - r.x, h[1] - r.y, h[2] - r.z); body.updateMatrixWorld(true);
      // his back leaned (the whole of him over the hips), his head kept nearer level
      const [wl, tilt, az] = lean(k);
      if (wl > 0.01 && B.spine05 && B.neck01) {
        const cur = dirOf('spine05', 'neck01', _d), want = _to.set(Math.sin(tilt) * Math.sin(az), Math.cos(tilt), Math.sin(tilt) * Math.cos(az)).transformDirection(anchor.matrixWorld);
        _q.setFromUnitVectors(cur, _w.copy(cur).lerp(want, wl).normalize()); turnWorld(B.spine05, _q);
        if (B.neck01) { const nd = dirOf('neck01', 'head', _d), lv = _w.copy(up).lerp(nd, 0.45).normalize(); _q.setFromUnitVectors(nd, nd.clone().lerp(lv, 0.5 * wl).normalize()); turnWorld(B.neck01, _q); }
      }
      // the legs and the arms
      const wf = wFoot(k)[0];
      reach('upperleg01_R', 'lowerleg01_R', 'foot_R', world(footR(k), _to), his(0, 0.4, 1, _pole), wf);
      reach('upperleg01_L', 'lowerleg01_L', 'foot_L', world(footL(k), _to), his(0, 0.4, 1, _pole), wf);
      const wr = wSill(k)[0], wy = wYoke(k)[0];
      if (wy > 0.01) {
        reach('upperarm01_L', 'lowerarm01_L', 'wrist_L', rs.grip('L', _to), his(1, -1, -0.4, _pole), wy);
        reach('upperarm01_R', 'lowerarm01_R', 'wrist_R', rs.grip('R', _to), his(-1, -1, -0.4, _pole), wy);
      }
      if (wr > 0.01) reach('upperarm01_L', 'lowerarm01_L', 'wrist_L', world(SILL, _to), his(1, 0.3, -1, _pole), wr);
      // (eased over from the pose he came in with)
      if (snap.on) {
        snap.t += dt; const f = smooth(snap.t / snap.dur);
        if (f >= 1) snap.on = false;
        else {
          for (const b of all) { _q.copy(b.quaternion); b.quaternion.copy(snap.q.get(b)).slerp(_q, f); }
          B.root.position.lerpVectors(snap.root, _p.copy(B.root.position), f);
          body.position.lerpVectors(snap.pos, _p.copy(body.position), f); _q.copy(body.quaternion); body.quaternion.copy(snap.quat).slerp(_q, f);
          body.updateMatrixWorld(true);
        }
      }
    },
  };
  return d;
}
