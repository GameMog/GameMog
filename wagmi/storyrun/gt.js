// Mog City: the Vantor GT. An original rear-engined sports coupe in gloss black for a Story Kit world's hero (Pickup
// Time: John Marin's car), drawn on the classic lines of its kind without being any maker's: a long fastback falling
// from the roof to a short tail, front wings standing proud of a low front lid, round lamps on the wings' noses, wide
// rear haunches over the back wheels, a full-width light line across the tail, a big wing on two swan-neck uprights,
// black five-spoke centre-lock wheels and a low black splitter. No maker's name, crest or badge: 'VANTOR GT' on the tail.
// The rocket package is its twin centre exhausts, which burn on the boost (subtle: a hot tongue, not a rocket).
//
// It has Dan's roadster's interface (wagmi/roadster.js), so the city's car, the driver's way in and out (createDriver),
// a passenger seat and the boost use it as they use the roadster:
//   const rs = buildGT(THREE, { paint: '#0B0B0D' });
//   group, materials, wheels, setThrust(cold, burn), setElectric(on), update(dt, speed, steer), length, width, height,
//   setDoor(side, t) / door, doorT(side), doors { L, R: { pivot, axis, t } }, anchor, seat { hip, heel }, grip(side, out),
//   yoke (its wheel: yoke.children[0] turns), axle (half its wheelbase), body (its box)
//
// Built in code from a half-body cage: at every station along the car a section of twelve named points, from the
// floor's middle out round the side and over the top (mirrored in x), lofted into one smooth skin with creases only
// where the wheel arches cut it; the doors are cut from that skin, so they sit flush when shut. Metres; the car stands
// on y = 0, nose to +z, its middle between the axles.
import { uniform, uv, float, vec2, vec3, mix, sin, cos, abs, pow, max, normalView, positionViewDirection, attribute } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scl = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len3 = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (v) => { const l = len3(v); return l > 1e-12 ? [v[0] / l, v[1] / l, v[2] / l] : [0, 1, 0]; };
const clamp01 = (x) => Math.min(1, Math.max(0, x));
// a smooth curve through keys [z, value] that never overshoots them (monotone cubic)
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

export function buildGT(THREE, o = {}) {
  const g = new THREE.Group(); g.name = 'mog-gt';
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

  /* ------------------------------------------------------------ the lines -- */
  // the nose and the tail; the axles (tyre radius, width, the wheel's x, the arch's radius)
  const ZF = 2.15, ZR = -2.42;
  const AX = [{ z: 1.23, r: 0.332, w: 0.255, x: 0.765, R: 0.368, front: true }, { z: -1.23, r: 0.357, w: 0.305, x: 0.8, R: 0.398, front: false }];
  // the windscreen's foot (the cowl), the roof's front, the back glass, the side glass's back point; the doors' cut
  const ZCOWL = 0.62, ZROOF = -0.02, ZBG = [-1.44, -0.76], ZDLO = -1.35, ZD = [-0.42, 0.8];
  // the side at its widest (before the ends are rounded in plan), and how high; the sill; the floor
  const W = crv([[ZR, 0.93], [-2.1, 0.97], [-1.6, 0.995], [-1.23, 1.0], [-0.85, 0.955], [-0.45, 0.89], [0.3, 0.875], [0.8, 0.893], [1.23, 0.912], [1.7, 0.9], [ZF, 0.875]]);
  const YW = crv([[ZR, 0.55], [-1.23, 0.5], [0, 0.48], [1.23, 0.47], [ZF, 0.4]]);
  const Y5 = crv([[ZR, 0.32], [-2.0, 0.24], [-1.6, 0.222], [1.6, 0.212], [1.9, 0.19], [ZF, 0.17]]);
  const YFL = crv([[ZR, 0.2], [-2.0, 0.14], [-1.7, 0.125], [1.8, 0.125], [ZF, 0.13]]);
  // the shoulder, where the side turns over into the top
  const Y7 = crv([[ZR, 0.75], [-2.1, 0.8], [-1.6, 0.85], [-1.25, 0.85], [-0.85, 0.805], [-0.45, 0.765], [0.3, 0.75], [0.9, 0.76], [1.3, 0.765], [1.7, 0.745], [2.0, 0.665], [ZF, 0.5]]);
  // the crest: the front wings' crowns, running back into the belt along the door, then over the rear haunches
  const X8 = crv([[ZR, 0.76], [-2.1, 0.84], [-1.6, 0.88], [-1.23, 0.885], [-0.8, 0.84], [0.3, 0.82], [0.62, 0.78], [0.9, 0.7], [1.23, 0.69], [1.7, 0.685], [2.0, 0.66], [ZF, 0.56]]);
  const Y8 = crv([[ZR, 0.85], [-2.1, 0.9], [-1.6, 0.965], [-1.23, 0.96], [-0.8, 0.915], [-0.3, 0.89], [0.3, 0.88], [0.62, 0.85], [0.9, 0.848], [1.23, 0.862], [1.6, 0.856], [1.85, 0.83], [2.0, 0.765], [2.1, 0.675], [ZF, 0.58]]);
  // the side glass's foot (the belt), down to the valley between wing and front lid, and back up into the fastback's
  // edge, where it meets the glass's top (ZDLO)
  const X9 = crv([[ZR, 0.6], [-2.0, 0.63], [-1.6, 0.65], [ZDLO, 0.64], [-1.0, 0.735], [-0.6, 0.765], [0.3, 0.77], [ZCOWL, 0.715], [0.75, 0.52], [1.23, 0.5], [1.8, 0.5], [ZF, 0.44]]);
  const Y9 = crv([[ZR, 0.855], [-2.0, 0.905], [-1.6, 0.96], [ZDLO, 1.01], [-1.0, 0.955], [-0.6, 0.91], [0.3, 0.895], [ZCOWL, 0.84], [0.75, 0.765], [1.23, 0.7], [1.7, 0.65], [2.0, 0.6], [ZF, 0.545]]);
  // the roof's edge (the side glass's top, the A pillar), the lid's edge behind it, the front lid's quarter ahead
  const X10 = crv([[ZR, 0.48], [-2.0, 0.51], [-1.6, 0.545], [ZDLO, 0.585], [-1.0, 0.55], [-0.5, 0.53], [ZROOF, 0.535], [0.3, 0.6], [ZCOWL, 0.7], [0.75, 0.4], [1.0, 0.27], [ZF, 0.22]]);
  const Y10 = crv([[ZR, 0.86], [-2.0, 0.91], [-1.6, 0.98], [ZDLO, 1.025], [-1.0, 1.12], [-0.7, 1.195], [-0.35, 1.235], [ZROOF, 1.212], [0.3, 1.02], [ZCOWL, 0.842], [0.75, 0.78], [1.23, 0.71], [1.7, 0.65], [2.0, 0.595], [ZF, 0.545]]);
  // the middle of the top: front lid, windscreen, roof, the long fastback to the tail
  const YT = crv([[ZR, 0.88], [-2.2, 0.905], [-1.9, 0.95], [-1.6, 1.01], [-1.3, 1.085], [-1.0, 1.16], [-0.75, 1.232], [-0.35, 1.276], [ZROOF, 1.252], [0.3, 1.042], [ZCOWL, 0.818], [0.9, 0.76], [1.23, 0.715], [1.7, 0.655], [2.0, 0.6], [ZF, 0.55]]);
  // the ends rounded in plan (a share of every row's x taken in over the last RN / RT metres) and drawn back in profile
  // (each row by its own amount: the chin tucks under, the front lid rolls down into the nose; at the tail the floor
  // kicks up into the diffuser)
  const RN = 0.42, RT = 0.5;
  const INSET_F = [0.17, 0.16, 0.16, 0.07, 0.07, 0.07, 0, 0.03, 0.075, 0.115, 0.12, 0.125];
  const INSET_R = [0.26, 0.26, 0.26, 0.15, 0.15, 0.15, 0.045, 0, 0.06, 0.11, 0.12, 0.13];
  const endX = (z) => { const sF = clamp01((z - (ZF - RN)) / RN), sR = clamp01(((ZR + RT) - z) / RT); return (1 - 0.32 * (1 - Math.sqrt(1 - sF * sF))) * (1 - 0.3 * (1 - Math.sqrt(1 - sR * sR))); };

  // the section at z, the right half: [floor's middle, floor's edge, well's floor, well's top, arch's lip, sill, widest,
  // shoulder, crest (or belt), belt (or valley, or lid's edge), roof's edge (or front lid's quarter), the top's middle].
  // arch: whether a station on an arch's end counts as inside it (the ends are doubled, outside and inside, so the
  // arch's edge is a clean cut)
  function section(z, arch) {
    const w = W(z), yfl = YFL(z);
    const P = [[0, yfl], [w - 0.095, yfl], null, null, null, [w - 0.055, Y5(z)], [w, YW(z)], [w * 0.965, Y7(z)], [X8(z), Y8(z)], [X9(z), Y9(z)], [X10(z), Y10(z)], [0, YT(z)]];
    P[2] = P[1].slice(); P[3] = P[5].slice(); P[4] = P[5].slice();
    for (const a of AX) {
      const dz = Math.abs(z - a.z), inside = dz < a.R - 1e-6 || (Math.abs(dz - a.R) <= 1e-6 && arch);
      if (!inside) continue;
      const ay = a.r + Math.sqrt(Math.max(0, a.R * a.R - dz * dz)), xin = a.x - a.w / 2 - 0.06;
      // the skin's x at that height (up the sill, the widest line and the shoulder)
      let sx = P[7][0];
      for (const [k0, k1] of [[5, 6], [6, 7]]) { const [x0, y0] = P[k0], [x1, y1] = P[k1]; if (ay >= y0 && ay <= y1) { sx = x0 + (x1 - x0) * (ay - y0) / (y1 - y0); break; } }
      if (ay < P[5][1]) sx = P[5][0];
      P[2] = [xin, yfl]; P[3] = [xin, ay]; P[4] = [sx, ay];
      if (P[5][1] < ay) P[5] = P[4].slice();
      if (P[6][1] < ay) P[6] = P[4].slice();
    }
    const f = endX(z), sF = clamp01((z - (ZF - 0.4)) / 0.4), sR = clamp01(((ZR + 0.4) - z) / 0.4);
    return P.map(([x, y], j) => [x * f, y, z - INSET_F[j] * sF * sF + INSET_R[j] * sR * sR]);
  }

  // the stations: every 3.5 cm, plus each one where a part or a material starts (the arches' ends doubled)
  const marks = [ZCOWL, ZROOF, ...ZBG, ZDLO, ...ZD];
  const st = [];
  for (let z = ZR; z < ZF - 1e-6; z += 0.025) st.push({ z });
  st.push({ z: ZF });
  for (const m of marks) st.push({ z: m });
  const ends = [];
  for (const a of AX) for (const e of [a.z - a.R, a.z + a.R]) ends.push(e);
  const near = (z) => ends.some((e) => Math.abs(z - e) < 0.012) || marks.some((m) => Math.abs(z - m) < 0.012);
  const ST = st.filter((s) => marks.includes(s.z) || s.z === ZR || s.z === ZF || !near(s.z));
  for (const a of AX) {
    ST.push({ z: a.z - a.R, arch: false, ord: 0 }, { z: a.z - a.R, arch: true, ord: 1 });
    ST.push({ z: a.z + a.R, arch: true, ord: 0 }, { z: a.z + a.R, arch: false, ord: 1 });
  }
  ST.sort((a, b) => a.z - b.z || (a.ord ?? 0) - (b.ord ?? 0));
  const NR = 12, NS = ST.length;
  const G = ST.map((s) => section(s.z, s.arch));
  // the doubled stations: no smoothing across them
  const crease = ST.map((s, i) => i > 0 && Math.abs(ST[i - 1].z - s.z) < 1e-9);

  /* ------------------------------------------------------------- materials -- */
  const M = {
    // (gloss black: a deep base under a hard, clear coat, so the city and the sky slide over it)
    paint: new THREE.MeshPhysicalNodeMaterial({ color: o.paint ?? '#030304', metalness: 0, roughness: 0.4, specularIntensity: 0.15, clearcoat: 1, clearcoatRoughness: 0.02, side: THREE.DoubleSide }),
    lower: new THREE.MeshPhysicalNodeMaterial({ color: '#0C0D0F', metalness: 0.2, roughness: 0.5, clearcoat: 0.3, clearcoatRoughness: 0.3 }),
    under: new THREE.MeshStandardNodeMaterial({ color: '#0B0C0E', roughness: 0.9, metalness: 0.05, side: THREE.DoubleSide }),
    glass: new THREE.MeshPhysicalNodeMaterial({ color: '#0E1013', metalness: 0, roughness: 0.05, specularIntensity: 1, transparent: true, opacity: 0.78, side: THREE.DoubleSide, clearcoat: 1, clearcoatRoughness: 0.02 }),
    trim: new THREE.MeshStandardNodeMaterial({ color: '#060708', roughness: 0.4, metalness: 0.2, side: THREE.DoubleSide }),
    seam: new THREE.MeshStandardNodeMaterial({ color: '#010101', roughness: 0.9 }),
    carbon: new THREE.MeshPhysicalNodeMaterial({ color: '#141518', roughness: 0.32, metalness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08, side: THREE.DoubleSide }),
    cabin: new THREE.MeshStandardNodeMaterial({ color: '#141416', roughness: 0.95, side: THREE.DoubleSide }),
    seat: new THREE.MeshStandardNodeMaterial({ color: '#1B1B1E', roughness: 0.85, side: THREE.DoubleSide }),
    stitch: new THREE.MeshStandardNodeMaterial({ color: '#7A1A16', roughness: 0.7 }),
    gauge: new THREE.MeshStandardNodeMaterial({ color: '#0A0B0C', emissive: '#C9D2DC', emissiveIntensity: 0.35, roughness: 0.4 }),
    rubber: new THREE.MeshStandardNodeMaterial({ color: '#121315', roughness: 0.9 }),
    wheel: new THREE.MeshPhysicalNodeMaterial({ color: '#111214', metalness: 0.55, roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.15, side: THREE.DoubleSide }),
    nut: new THREE.MeshPhysicalNodeMaterial({ color: '#2A2C30', metalness: 1, roughness: 0.25 }),
    disc: new THREE.MeshStandardNodeMaterial({ color: '#5E6064', metalness: 0.9, roughness: 0.45 }),
    caliper: new THREE.MeshPhysicalNodeMaterial({ color: '#B0121A', metalness: 0.1, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.1 }),
    chrome: new THREE.MeshPhysicalNodeMaterial({ color: '#B8BCC2', metalness: 1, roughness: 0.18 }),
    tip: new THREE.MeshPhysicalNodeMaterial({ color: '#8E9096', metalness: 1, roughness: 0.3, side: THREE.DoubleSide }),
    throat: new THREE.MeshStandardNodeMaterial({ color: '#050505', roughness: 1, side: THREE.DoubleSide }),
    lens: new THREE.MeshPhysicalNodeMaterial({ color: '#FFFFFF', metalness: 0, roughness: 0.02, transmission: 0, transparent: true, opacity: 0.22, clearcoat: 1, specularIntensity: 1 }),
    bezel: new THREE.MeshPhysicalNodeMaterial({ color: '#16181B', metalness: 0.7, roughness: 0.25, side: THREE.DoubleSide }),
    head: new THREE.MeshStandardNodeMaterial({ color: '#FFFFFF', emissive: '#EEF4FF', emissiveIntensity: 4 }),
    drl: new THREE.MeshStandardNodeMaterial({ color: '#FFFFFF', emissive: '#F2F6FF', emissiveIntensity: 3 }),
    amber: new THREE.MeshStandardNodeMaterial({ color: '#331800', emissive: '#FF7A12', emissiveIntensity: 1.2 }),
    tail: new THREE.MeshStandardNodeMaterial({ color: '#3A0004', emissive: '#E0101C', emissiveIntensity: 1.6 }),
    tailCore: new THREE.MeshStandardNodeMaterial({ color: '#5A0008', emissive: '#FF2030', emissiveIntensity: 3 }),
    tailDark: new THREE.MeshPhysicalNodeMaterial({ color: '#2A0507', metalness: 0, roughness: 0.1, clearcoat: 1 }),
    grille: new THREE.MeshStandardNodeMaterial({ color: '#030303', roughness: 0.8, side: THREE.DoubleSide }),
    slat: new THREE.MeshStandardNodeMaterial({ color: '#2B2D31', roughness: 0.55, metalness: 0.4, side: THREE.DoubleSide }),
  };
  M.lens.depthWrite = false;

  /* -------------------------------------------------------- the one skin -- */
  // a point of the grid: station i, row j (j = 12 is the row 10 of the other side, so the top's middle is smooth)
  const PT = (i, j) => (j === NR ? [-G[i][NR - 2][0], G[i][NR - 2][1], G[i][NR - 2][2]] : G[i][j]);
  // the run of stations a quad between i and i + 1 smooths over (none across a doubled station)
  const runLo = (i) => { let k = i; while (k > 0 && !crease[k]) k--; return k; };
  const runHi = (i) => { let k = i; while (k < NS - 1 && !crease[k + 1]) k++; return k; };
  // a corner's normal: along the car within its run, across it within the paint's rows (4 to 12), else the quad's own
  function cornerN(i, j, lo, hi, jLo, jHi, flat) {
    let a = null, b = null;
    for (let s = 1; s < 4 && !a; s++) { const i0 = Math.max(lo, i - s), i1 = Math.min(hi, i + s), d = sub(PT(i1, j), PT(i0, j)); if (len3(d) > 1e-5) a = d; }
    for (let s = 1; s < 5 && !b; s++) { const j0 = Math.max(jLo, j - s), j1 = Math.min(jHi, j + s), d = sub(PT(i, j1), PT(i, j0)); if (len3(d) > 1e-5) b = d; }
    if (!a || !b) return flat;
    const n = unit(cross(b, a));
    return dot(n, flat) < 0.2 ? flat : n;
  }
  // the quads by part: which material, and whether it is a door's (and which)
  const matOf = (j, z) => {
    if (j <= 3) return 'under';
    if (j === 9 && z > ZDLO && z < ZCOWL) return 'glass';
    if (j === 10 && ((z > ZROOF && z < ZCOWL) || (z > ZBG[0] && z < ZBG[1]))) return 'glass';
    return 'paint';
  };
  const inDoor = (j, z) => j >= 5 && j <= 9 && z > ZD[0] && z < ZD[1];
  const buckets = { paint: [], under: [], glass: [] }, doorBk = { L: { paint: [], glass: [] }, R: { paint: [], glass: [] } };
  const push = (out, p, n, mirror) => { if (mirror) out.push(-p[0], p[1], p[2], -n[0], n[1], n[2]); else out.push(p[0], p[1], p[2], n[0], n[1], n[2]); };
  function tri(out, a, b, c, na, nb, nc, mirror) {
    if (len3(cross(sub(b, a), sub(c, a))) < 1e-9) return;
    if (mirror) { push(out, a, na, true); push(out, c, nc, true); push(out, b, nb, true); }
    else { push(out, a, na); push(out, b, nb); push(out, c, nc); }
  }
  for (let i = 0; i < NS - 1; i++) {
    const lo = runLo(i), hi = runHi(i), edge = crease[i + 1];
    const zm = (ST[i].z + ST[i + 1].z) / 2;
    for (let j = 0; j < NR - 1; j++) {
      const A = PT(i, j), B = PT(i, j + 1), C = PT(i + 1, j + 1), D = PT(i + 1, j);
      let fl = cross(sub(B, A), sub(D, A)); if (len3(fl) < 1e-10) fl = cross(sub(C, B), sub(D, B)); if (len3(fl) < 1e-10) continue; fl = unit(fl);
      const smooth = !edge && j >= 4;
      const n = (ii, jj) => (smooth ? cornerN(ii, jj, lo, hi, 4, NR, fl) : fl);
      const nA = n(i, j), nB = n(i, j + 1), nC = n(i + 1, j + 1), nD = n(i + 1, j);
      const mat = matOf(j, zm);
      for (const mirror of [false, true]) {
        const door = inDoor(j, zm) ? (mirror ? 'R' : 'L') : null;
        const out = door ? doorBk[door][mat === 'glass' ? 'glass' : 'paint'] : buckets[mat];
        tri(out, A, B, D, nA, nB, nD, mirror); tri(out, B, C, D, nB, nC, nD, mirror);
      }
    }
  }
  // the ends: the nose's face and the tail's, ruled across from one side's section to the other's (each row a straight
  // line across at its own height and depth), so the face is as smooth as the rows that bound it
  const caps = [];
  for (const [i, fz] of [[NS - 1, 1], [0, -1]]) {
    const K = 24, P = G[i], pos = [], idx = [];
    for (let j = 0; j < NR; j++) for (let k = 0; k <= K; k++) { const u = -1 + 2 * (k / K); pos.push(P[j][0] * u, P[j][1], P[j][2]); }
    for (const [j0, j1, part] of [[0, 5, 'under'], [5, NR, 'paint']]) {
      const ix = [];
      for (let j = j0; j < j1 - 1 + (j1 === NR ? 0 : 1) && j < NR - 1; j++) for (let k = 0; k < K; k++) {
        const a = j * (K + 1) + k, b = a + 1, c = a + K + 1, d = c + 1;
        ix.push(...(fz > 0 ? [a, b, d, a, d, c] : [a, d, b, a, c, d]));
      }
      caps.push({ pos, ix, part });
    }
    void idx;
  }
  const toGeo = (arr) => {
    const n = arr.length / 6, pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) { pos[i * 3 + c] = arr[i * 6 + c]; nrm[i * 3 + c] = arr[i * 6 + 3 + c]; }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3)); return geo;
  };
  const body = new THREE.Group(); body.name = 'body'; g.add(body);
  for (const [k, arr] of Object.entries(buckets)) { const m = new THREE.Mesh(toGeo(arr), M[k]); m.name = k; m.castShadow = k !== 'glass'; m.receiveShadow = true; body.add(m); }
  for (const c of caps) { const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(c.pos, 3)); geo.setIndex(c.ix); geo.computeVertexNormals(); const m = new THREE.Mesh(geo, M[c.part]); m.castShadow = true; m.receiveShadow = true; body.add(m); }

  /* ---------------------------------------------------- surface helpers -- */
  // a point on the skin at z, between row j and j + 1 (t along), on the right side, and the outward normal there
  function surf(z, j, t) {
    const P = section(z, false), A = P[j], B = j + 1 >= NR ? [-P[NR - 2][0], P[NR - 2][1], P[NR - 2][2]] : P[j + 1];
    return [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t];
  }
  function surfN(z, j, t) {
    const e = 0.004, p = surf(z, j, t), pz = sub(surf(z + e, j, t), surf(z - e, j, t)), pt = sub(surf(z, j, Math.min(1, t + 0.03)), surf(z, j, Math.max(0, t - 0.03)));
    let n = unit(cross(pt, pz));
    if (n[0] * p[0] + n[1] * (p[1] - 0.45) < 0) n = scl(n, -1);
    return n;
  }
  // a point on the skin at z where the side is at height y (searching rows 5 to 9), and its normal
  function sideAt(z, y) {
    const P = section(z, false);
    for (let j = 5; j < 10; j++) { const y0 = P[j][1], y1 = P[j + 1][1]; if (y1 > y0 && y >= y0 && y <= y1) { const t = (y - y0) / (y1 - y0); return { p: surf(z, j, t), n: surfN(z, j, t) }; } }
    return { p: surf(z, 7, 0), n: surfN(z, 7, 0) };
  }
  const mx = (p, sd) => [p[0] * sd, p[1], p[2]];
  // a ribbon over the skin between two edges (lists of { p, n } on the right side), lifted off it, on the sides asked
  function ribbon(e1, e2, mat, lift = 0.002, sides = [1, -1], parent = g) {
    const pos = [], nrm = [], idx = [];
    for (const sd of sides) {
      const base = pos.length / 3;
      for (let i = 0; i < e1.length; i++) for (const e of [e1[i], e2[i]]) { const p = mx(e.p, sd), n = mx(e.n, sd); pos.push(p[0] + n[0] * lift, p[1] + n[1] * lift, p[2] + n[2] * lift); nrm.push(...n); }
      const A = e1[0].p, B = e2[0].p, C = e1[1].p, out = dot(cross(sub(B, A), sub(C, A)), e1[0].n) > 0;
      for (let i = 0; i < e1.length - 1; i++) { const a = base + i * 2, b = a + 1, c = a + 2, d = a + 3; if ((sd > 0) === out) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d); }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3)); geo.setIndex(idx);
    const m = new THREE.Mesh(geo, mat); parent.add(m); return m;
  }
  // a line along the skin: row j at t, from z0 to z1, w wide (across the rows)
  function rowLine(j, t, z0, z1, w, mat, lift = 0.0025, sides, parent) {
    const e1 = [], e2 = [], n = Math.max(2, Math.ceil(Math.abs(z1 - z0) / 0.02));
    for (let k = 0; k <= n; k++) {
      const z = z0 + (z1 - z0) * (k / n), p = surf(z, j, t), nn = surfN(z, j, t);
      const q = sub(surf(z, j, Math.min(1, t + 0.05)), surf(z, j, Math.max(0, t - 0.05))), u = unit(q);
      e1.push({ p: sub(p, scl(u, w / 2)), n: nn }); e2.push({ p: add(p, scl(u, w / 2)), n: nn });
    }
    return ribbon(e1, e2, mat, lift, sides, parent);
  }
  // a seam across the side: a list of [z, y] points, w wide (along z)
  function seam(pts, w, mat = M.seam, lift = 0.0015, sides, parent) {
    const e1 = [], e2 = [];
    for (const [z, y] of pts) { const a = sideAt(z - w / 2, y), b = sideAt(z + w / 2, y); e1.push(a); e2.push(b); }
    return ribbon(e1, e2, mat, lift, sides, parent);
  }
  // a patch on the side: from z0 to z1, y0 to y1, lifted off it
  function patch(z0, z1, y0, y1, mat, lift = 0.003, sides, parent) {
    const e1 = [], e2 = [];
    for (let k = 0; k <= 6; k++) { const z = z0 + (z1 - z0) * (k / 6); e1.push(sideAt(z, y0)); e2.push(sideAt(z, y1)); }
    return ribbon(e1, e2, mat, lift, sides, parent);
  }
  // a solid from a flat outline: points [u, v] extruded `depth` (w), placed by fn (u, v, w) => [x, y, z]
  function prism(pts, depth, place, mat, bevel = 0, parent = g) {
    const sh = new THREE.Shape(); sh.moveTo(...pts[0]); for (const p of pts.slice(1)) sh.lineTo(...p); sh.closePath();
    const opt = bevel ? { depth: depth - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 3, curveSegments: 16 } : { depth, bevelEnabled: false, curveSegments: 16 };
    const geo = new THREE.ExtrudeGeometry(sh, opt).translate(0, 0, bevel).toNonIndexed();
    const pa = geo.attributes.position; for (let v = 0; v < pa.count; v++) pa.setXYZ(v, ...place(pa.getX(v), pa.getY(v), pa.getZ(v)));
    geo.deleteAttribute('uv'); geo.deleteAttribute('normal');
    const t = new THREE.Vector3(...place(0, 0, 0)), ax = new THREE.Vector3(...place(1, 0, 0)).sub(t), ay = new THREE.Vector3(...place(0, 1, 0)).sub(t), az = new THREE.Vector3(...place(0, 0, 1)).sub(t);
    if (ax.cross(ay).dot(az) < 0) { const p2 = pa.array; for (let i = 0; i < p2.length; i += 9) for (let c = 0; c < 3; c++) { const tmp = p2[i + 3 + c]; p2[i + 3 + c] = p2[i + 6 + c]; p2[i + 6 + c] = tmp; } }
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat); m.castShadow = true; parent.add(m); return m;
  }
  const mesh = (geo, mat, x = 0, y = 0, z = 0, parent = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };
  const both = (make) => { for (const sd of [1, -1]) make(sd); };
  // a texture drawn on a canvas
  function canvasTex(w, h, draw) {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const cx = cv.getContext('2d'); draw(cx, w, h);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
  }

  /* ------------------------------------------------------------ the doors -- */
  // each side's door, cut from the skin (doorBk): the painted panel and its glass, a lining 4 cm in, in the cabin's
  // black; hung on a hinge at its front edge, swinging out: setDoor('L' | 'R', 0..1)
  const HANG = o.hingeAngle ?? 1.12;
  const doors = {};
  const key3 = (p) => p.map((v) => Math.round(v * 2e4)).join(',');
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
  const solid = (pts, mat) => { const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); geo.computeVertexNormals(); const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; return m; };
  const DOOR_D = 0.045;
  for (const sd of [1, -1]) {
    const sideK = sd > 0 ? 'L' : 'R', bk = doorBk[sideK];
    const hp = sideAt(ZD[1] - 0.01, 0.6).p;
    const pivot = new THREE.Group(); pivot.name = 'door' + sideK; pivot.position.set((hp[0] - 0.03) * sd, 0.55, ZD[1] - 0.03); g.add(pivot);
    const inner = new THREE.Group(); inner.position.copy(pivot.position).negate(); pivot.add(inner);
    for (const k of ['paint', 'glass']) { const m = new THREE.Mesh(toGeo(bk[k]), M[k]); m.castShadow = k === 'paint'; m.receiveShadow = true; inner.add(m); }
    const w = weld(bk.paint), shell = [], lining = [], ins = (i) => sub(w.P[i], scl(w.N[i], DOOR_D));
    for (const [a, b] of rim(w)) { const A = w.P[a], B = w.P[b], A1 = ins(a), B1 = ins(b); shell.push(...A, ...A1, ...B1, ...A, ...B1, ...B); }
    for (let t = 0; t < w.T.length; t += 3) lining.push(...ins(w.T[t]), ...ins(w.T[t + 2]), ...ins(w.T[t + 1]));
    inner.add(solid(shell, M.paint), solid(lining, M.cabin));
    // (its handle: a slim flush bar, and the mirror on its front corner)
    patch(-0.27, -0.13, 0.795, 0.81, M.chrome, 0.004, [sd], inner);
    doors[sideK] = { pivot, axis: V3(0, -sd, 0), t: 0 };
  }
  function setDoor(sideK, t) { const d = doors[sideK]; if (!d) return; d.t = clamp01(t); d.pivot.quaternion.setFromAxisAngle(d.axis, HANG * d.t); }
  // the shut lines round the doors (front, back, along the sill), on the body
  seam(Array.from({ length: 9 }, (_, k) => [ZD[1], 0.24 + (0.86 - 0.24) * (k / 8)]), 0.005);
  seam(Array.from({ length: 9 }, (_, k) => [ZD[0], 0.24 + (0.88 - 0.24) * (k / 8)]), 0.005);
  rowLine(5, 0.04, ZD[0], ZD[1], 0.005, M.seam, 0.0015);
  // the side glass's black surround and the slim black pillar at the door's back edge
  rowLine(9, 0.02, ZDLO + 0.02, ZCOWL - 0.01, 0.014, M.trim, 0.003);
  rowLine(9, 0.985, ZDLO + 0.02, ZCOWL - 0.03, 0.012, M.trim, 0.003);
  {
    const e1 = [], e2 = [];
    for (let k = 0; k <= 8; k++) { const t = k / 8; e1.push({ p: surf(ZD[0] - 0.012, 9, t), n: surfN(ZD[0], 9, t) }); e2.push({ p: surf(ZD[0] + 0.012, 9, t), n: surfN(ZD[0], 9, t) }); }
    ribbon(e1, e2, M.trim, 0.004);
  }
  // (the windscreen's and the back glass's black frit round their edges)
  rowLine(10, 0.03, ZROOF + 0.01, ZCOWL - 0.01, 0.03, M.trim, 0.0025);
  rowLine(10, 0.03, ZBG[0] + 0.01, ZBG[1] - 0.01, 0.03, M.trim, 0.0025);
  // (the mirrors: a teardrop pod on a short arm from the door's front corner)
  both((sd) => {
    const p = sideAt(0.6, 0.9).p, grp = new THREE.Group(); grp.position.set((p[0] + 0.02) * sd, 0.94, 0.56); doors[sd > 0 ? 'L' : 'R'].pivot.children[0].add(grp);
    const pod = mesh(new THREE.SphereGeometry(0.075, 20, 14), M.paint, sd * 0.11, 0.03, -0.01, grp); pod.scale.set(1.25, 0.72, 0.85);
    const glassM = mesh(new THREE.CircleGeometry(0.068, 20), M.chrome, sd * 0.11, 0.03, -0.073, grp); glassM.scale.set(1.2, 0.7, 1); glassM.rotation.y = Math.PI;
    const arm = mesh(new THREE.BoxGeometry(0.1, 0.018, 0.05), M.carbon, sd * 0.05, 0.0, 0.0, grp); arm.rotation.z = sd * 0.25;
  });

  /* -------------------------------------------------------------- lamps -- */
  // the round headlamps on the wings' noses, each a dish in a dark bezel under a clear dome: four LED daytime points
  // round a projector, the beam's glow behind the lens
  const lampCs = [];
  both((sd) => {
    const z = 1.97, t = 0.62, p = surf(z, 7, t), n = surfN(z, 7, t), ax = unit([0.14, 0.1, 1]); void n;
    const L = new THREE.Group(); L.position.set(...mx(add(p, [-0.01, 0.005, 0.03]), sd)); L.quaternion.setFromUnitVectors(V3(0, 0, 1), V3(...mx(ax, sd))); g.add(L);
    const R = 0.1;
    const ring = mesh(new THREE.TorusGeometry(R, 0.012, 10, 40), M.bezel, 0, 0, 0.006, L);
    mesh(new THREE.CylinderGeometry(R + 0.014, R + 0.04, 0.16, 40, 1, true).rotateX(Math.PI / 2), M.paint, 0, 0, -0.08, L);
    mesh(new THREE.CircleGeometry(R, 40), M.trim, 0, 0, -0.012, L);
    // (the four daytime points, a square round the middle)
    for (let k = 0; k < 4; k++) { const a = Math.PI / 4 + k * Math.PI / 2; const d = mesh(new THREE.CircleGeometry(0.016, 16), M.drl, Math.cos(a) * 0.055, Math.sin(a) * 0.055, -0.002, L); void d; }
    mesh(new THREE.TorusGeometry(0.055, 0.004, 6, 32), M.drl, 0, 0, -0.003, L);
    mesh(new THREE.CircleGeometry(0.028, 20), M.head, 0, 0, -0.001, L);
    mesh(new THREE.RingGeometry(0.028, 0.034, 24), M.chrome, 0, 0, -0.0015, L);
    const dome = mesh(new THREE.SphereGeometry(R * 1.6, 32, 12, 0, Math.PI * 2, 0, 0.66), M.lens, 0, 0, -R * 1.6 * Math.cos(0.66) + 0.002, L);
    dome.rotation.x = Math.PI / 2; dome.renderOrder = 3; dome.castShadow = false;
    void ring; lampCs.push(L);
  });
  // the front: the bumper's face, with a wide black intake across the middle and one under each lamp, an amber line
  // over each side intake, and a low black splitter jutting out under it all
  const noseZ = (y) => { const P = G[NS - 1]; for (let j = 5; j < 9; j++) { const [, y0, z0] = P[j], [, y1, z1] = P[j + 1]; if (y >= y0 && y <= y1 && y1 > y0) return z0 + (z1 - z0) * (y - y0) / (y1 - y0); } return P[5][2]; };
  const faceAt = (x, y) => [x, y, noseZ(y) + 0.003];
  function facePanel(x0, x1, y0, y1, mat, lift = 0.004, r = 0.03) {
    const pts = [], n = 6;
    const corners = [[x1 - r, y0 + r, -Math.PI / 2], [x1 - r, y1 - r, 0], [x0 + r, y1 - r, Math.PI / 2], [x0 + r, y0 + r, Math.PI]];
    for (const [cx, cy, a0] of corners) for (let k = 0; k <= n; k++) { const a = a0 + (Math.PI / 2) * (k / n); pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
    const cxm = (x0 + x1) / 2, cym = (y0 + y1) / 2, pos = [];
    for (let k = 0; k < pts.length; k++) {
      const a = pts[k], b = pts[(k + 1) % pts.length];
      for (const q of [[cxm, cym], a, b]) { const f = faceAt(q[0], q[1]); pos.push(f[0], f[1], f[2] + lift); }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.computeVertexNormals();
    return mesh(geo, mat);
  }
  facePanel(-0.36, 0.36, 0.17, 0.33, M.grille, 0.004, 0.05);
  facePanel(-0.34, 0.34, 0.185, 0.315, M.under, 0.002, 0.04);
  both((sd) => { facePanel(sd > 0 ? 0.43 : -0.62, sd > 0 ? 0.62 : -0.43, 0.18, 0.36, M.grille, 0.004, 0.045); facePanel(sd > 0 ? 0.44 : -0.61, sd > 0 ? 0.61 : -0.44, 0.39, 0.405, M.amber, 0.006, 0.006); });
  // (slats across the intakes)
  for (let k = 0; k < 4; k++) { const y = 0.205 + k * 0.035; facePanel(-0.33, 0.33, y, y + 0.006, M.lower, 0.008, 0.003); both((sd) => facePanel(sd > 0 ? 0.45 : -0.6, sd > 0 ? 0.6 : -0.45, y + 0.01, y + 0.016, M.lower, 0.008, 0.003)); }
  {
    const P = G[NS - 1], half = Math.abs(P[5][0]) + 0.02, zf = noseZ(0.17) + 0.05;
    const out = [];
    for (let k = 0; k <= 16; k++) { const a = Math.PI * (k / 16); out.push([Math.cos(a) * half, 1.6 + Math.sin(a) * (zf - 1.6)]); }
    out.push([-half, 1.45], [half, 1.45]);
    prism(out.slice(0, 17).concat([[-half, 1.45], [half, 1.45]]), 0.035, (u, v, w) => [u, 0.13 - w, v], M.under);
  }
  // (the front lid's two nostrils, low ahead of the screen: dark slots in the lid)
  both((sd) => { const e1 = [], e2 = []; for (let k = 0; k <= 6; k++) { const z = 1.55 + 0.25 * (k / 6); e1.push({ p: surf(z, 10, 0.25 + (sd > 0 ? 0 : 0)), n: surfN(z, 10, 0.25) }); e2.push({ p: surf(z, 10, 0.55), n: surfN(z, 10, 0.55) }); } ribbon(e1, e2, M.grille, 0.002, [sd]); });

  // the tail: a full-width light line across under the lid's lip (a slim bright core in a dark red band), wrapping a
  // little round the corners, the light clusters' darker red under each end; then the maker's mark that isn't one,
  // 'VANTOR GT', in silver under the middle; the plate; a black lower bumper and diffuser with twin centre exhausts
  const tailZ = (y) => { const P = G[0]; if (y <= P[5][1]) return P[5][2]; for (let j = 5; j < 11; j++) { const [, y0, z0] = P[j], [, y1, z1] = P[j + 1]; if (y >= y0 && y <= y1 && y1 > y0) return z0 + (z1 - z0) * (y - y0) / (y1 - y0); } return P[6][2]; };
  const tailX = (y) => { const P = G[0]; if (y <= P[5][1]) return P[5][0]; for (let j = 5; j < 11; j++) { const [x0, y0] = P[j], [x1, y1] = P[j + 1]; if (y >= y0 && y <= y1 && y1 > y0) return x0 + (x1 - x0) * (y - y0) / (y1 - y0); } return P[6][0]; };
  function tailBand(y0, y1, mat, lift, xw = 1, wrap = 0) {
    // across the tail's face, then round each corner along the side for `wrap` metres
    const pos = [], push4 = (a, b, c, d) => pos.push(...a, ...b, ...c, ...a, ...c, ...d);
    const N = 24, xs = (y) => tailX(y) * xw;
    for (let k = 0; k < N; k++) {
      const u0 = -1 + 2 * (k / N), u1 = -1 + 2 * ((k + 1) / N);
      const P = (u, y) => [u * xs(y), y, tailZ(y) - lift];
      push4(P(u0, y0), P(u0, y1), P(u1, y1), P(u1, y0));
    }
    if (wrap) both((sd) => {
      const n = 6;
      for (let k = 0; k < n; k++) {
        const za = ZR + 0.005 + wrap * (k / n), zb = ZR + 0.005 + wrap * ((k + 1) / n);
        const S = (z, y) => { const s = sideAt(Math.max(ZR + 0.004, z), y); return add(mx(s.p, sd), scl(mx(s.n, sd), lift)); };
        const a = S(za, y0), b = S(za, y1), c = S(zb, y1), d = S(zb, y0);
        if (sd > 0) push4(a, d, c, b); else push4(a, b, c, d);
      }
    });
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.computeVertexNormals();
    return mesh(geo, mat);
  }
  tailBand(0.79, 0.832, M.tailDark, 0.004, 0.97, 0.1);
  tailBand(0.804, 0.817, M.tailCore, 0.007, 0.95, 0.09);
  tailBand(0.75, 0.79, M.trim, 0.003, 0.97, 0.06);
  both((sd) => { const pos = []; const y0 = 0.755, y1 = 0.788; const x0 = tailX(0.77) * 0.7, x1 = tailX(0.77) * 0.95; for (const [u0, u1] of [[x0, x1]]) { const P = (x, y) => [x * sd, y, tailZ(y) - 0.006]; pos.push(...P(u0, y0), ...P(u0, y1), ...P(u1, y1), ...P(u0, y0), ...P(u1, y1), ...P(u1, y0)); } const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.computeVertexNormals(); const m = mesh(geo, M.tail); m.material = M.tail; m.material.side = THREE.DoubleSide; });
  // the lower bumper and diffuser
  tailBand(0.33, 0.45, M.lower, 0.004, 0.99);
  {
    // (strakes, and the twin exhausts in the middle: the thrusters)
    for (const x of [-0.5, -0.36, 0.36, 0.5]) prism([[0, 0], [0.07, 0], [0.07, 0.01], [0, 0.01]], 0.26, (u, v, w) => [x + v - 0.005, 0.135 + u, ZR + 0.52 - w], M.lower);
  }
  const NZ = [{ x: 0.105, y: 0.37 }, { x: -0.105, y: 0.37 }];
  const ZE = tailZ(0.37) - 0.03;
  for (const p of NZ) {
    const tip = mesh(new THREE.CylinderGeometry(0.058, 0.058, 0.12, 32, 1, true).rotateX(Math.PI / 2), M.tip, p.x, p.y, ZE + 0.05);
    mesh(new THREE.TorusGeometry(0.058, 0.006, 8, 32), M.tip, p.x, p.y, ZE - 0.01);
    mesh(new THREE.CircleGeometry(0.056, 24).rotateY(Math.PI), M.throat, p.x, p.y, ZE + 0.06);
    void tip;
  }
  // the wordmark and the plate
  {
    const tex = canvasTex(1024, 128, (cx, w, h) => {
      cx.clearRect(0, 0, w, h); cx.fillStyle = '#E8EBEF'; cx.textAlign = 'center'; cx.textBaseline = 'middle';
      cx.font = "600 92px 'Helvetica Neue', 'Arial', sans-serif";
      const word = 'V A N T O R    G T'; cx.fillText(word, w / 2, h / 2 + 4);
    });
    const mm = new THREE.MeshPhysicalNodeMaterial({ map: tex, transparent: true, metalness: 0.9, roughness: 0.2, alphaTest: 0.3 });
    const y = 0.69, pl = mesh(new THREE.PlaneGeometry(0.42, 0.0525), mm, 0, y, tailZ(y) - 0.004); pl.rotation.y = Math.PI; pl.castShadow = false;
    const ptex = canvasTex(512, 256, (cx, w, h) => {
      cx.fillStyle = '#F2F1EA'; cx.fillRect(0, 0, w, h); cx.strokeStyle = '#1B2A4A'; cx.lineWidth = 10; cx.strokeRect(8, 8, w - 16, h - 16);
      cx.fillStyle = '#1B2A4A'; cx.font = "700 132px 'Arial Narrow', 'Arial', sans-serif"; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText(o.plate || 'JM 0838', w / 2, h * 0.56);
      cx.font = "600 34px 'Arial', sans-serif"; cx.fillText('EMPIRE', w / 2, h * 0.16);
    });
    const pm = new THREE.MeshStandardNodeMaterial({ map: ptex, roughness: 0.4, metalness: 0.1 });
    const py = 0.545, back = mesh(new THREE.PlaneGeometry(0.305, 0.155), pm, 0, py, tailZ(py) - 0.006); back.rotation.y = Math.PI;
    const front = mesh(new THREE.PlaneGeometry(0.305, 0.155), pm, 0, 0.255, noseZ(0.255) + 0.012); void front;
  }
  // (the engine lid's grille behind the back glass: a black field across the lid, grey slats along the car over it,
  // a slim third brake light across its front)
  {
    const e = (z, t) => ({ p: surf(z, 10, t), n: surfN(z, 10, t) }), Z0 = -1.5, Z1 = -1.98;
    const field = (t0, t1, z0, z1, mat, lift) => { const e1 = [], e2 = []; for (let k = 0; k <= 8; k++) { const z = z0 + (z1 - z0) * (k / 8); e1.push(e(z, t0)); e2.push(e(z, t1)); } ribbon(e1, e2, mat, lift); };
    field(0.12, 1, Z0, Z1, M.grille, 0.002);
    for (let k = 0; k < 11; k++) { const t0 = 0.16 + k * 0.077; field(t0, Math.min(1, t0 + 0.04), Z0 - 0.02, Z1 + 0.02, M.slat, 0.006); }
    field(0.55, 1, Z0 + 0.035, Z0 + 0.01, M.tailCore, 0.007);
  }

  /* ------------------------------------------------------------- the wing -- */
  // a big wing across the tail on two swan-neck uprights: solid carbon blades that rise from the engine lid, curve back
  // and hook over onto the wing's top, where they are bolted; carbon end plates and a gurney strip on its trailing edge
  const WING = { z: -2.04, y: 1.17, span: 0.78, chord: 0.31, aoa: 0.1 };
  {
    // (an airfoil: thick near the front, a flatter underside; u from the leading edge forward = +z, v up)
    const C = WING.chord, top = [], bot = [];
    for (let k = 0; k <= 20; k++) { const q = k / 20, th = 0.16 * C * 5 * (0.2969 * Math.sqrt(q) - 0.126 * q - 0.3516 * q * q + 0.2843 * q ** 3 - 0.1036 * q ** 4); top.push([-q * C, th * 0.95 + 0.014 * Math.sin(Math.PI * q)]); bot.push([-q * C, -th * 0.4 + 0.014 * Math.sin(Math.PI * q)]); }
    const outline = [...top, ...bot.slice(1, -1).reverse()];
    const ca = Math.cos(WING.aoa), sa = Math.sin(WING.aoa), LE = WING.z + C / 2;
    const place = (u, v, w) => { const zz = u * ca - v * sa, yy = u * sa + v * ca; return [w - WING.span, WING.y + yy, LE + zz]; };
    prism(outline, 2 * WING.span, place, M.paint, 0.004);
    prism([[0, 0], [0.012, 0], [0.012, 0.022], [0, 0.022]], 2 * WING.span - 0.01, (u, v, w) => place(-C + u * 0.4, v + 0.012, w + 0.005), M.carbon);
    // the end plates: tall, swept, a little proud of the wing's ends
    both((sd) => prism([[0.05, -0.1], [-0.37, -0.075], [-0.4, 0.075], [0.0, 0.06]], 0.012, (u, v, w) => [sd * (WING.span + 0.004 + w), WING.y + v, LE + u], M.carbon));
    // the swan necks: each a crescent blade, broad where it stands on the lid, narrowing as it climbs back and hooks over
    // onto the wing's top a third of the way back
    const top0 = [LE - 0.11, WING.y + 0.035];
    both((sd) => {
      const x = sd * 0.27, zf = -1.68, zb = -1.82, yl = (z) => YT(z) - 0.012;
      const front = new THREE.CubicBezierCurve(new THREE.Vector2(zf, yl(zf)), new THREE.Vector2(zf - 0.03, WING.y + 0.02), new THREE.Vector2(top0[0] + 0.1, WING.y + 0.1), new THREE.Vector2(top0[0] - 0.03, top0[1] + 0.035));
      const back = new THREE.CubicBezierCurve(new THREE.Vector2(zb, yl(zb)), new THREE.Vector2(zb - 0.02, WING.y - 0.04), new THREE.Vector2(top0[0] + 0.08, WING.y + 0.06), new THREE.Vector2(top0[0] + 0.04, top0[1] + 0.02));
      const pts = [];
      for (let k = 0; k <= 20; k++) { const p = front.getPoint(k / 20); pts.push([p.x, p.y]); }
      // (the bolted pad on the wing's top)
      pts.push([top0[0] - 0.06, top0[1] + 0.012], [top0[0] + 0.05, top0[1] + 0.012]);
      for (let k = 20; k >= 0; k--) { const p = back.getPoint(k / 20); pts.push([p.x, p.y]); }
      prism(pts, 0.022, (u, v, w) => [x - 0.011 + w, v, u], M.carbon, 0.003);
      // (and a foot plate where it stands on the lid)
      prism([[zf + 0.03, 0], [zb - 0.03, 0], [zb - 0.03, 0.012], [zf + 0.03, 0.012]], 0.07, (u, v, w) => [x - 0.035 + w, yl((u)) - 0.004 + v, u], M.carbon);
    });
  }

  /* ------------------------------------------------------------- the cabin -- */
  // seen through the glass: a black floor and tub, the dash under the screen with five round dials in a hooded
  // binnacle, two carbon buckets, a round wheel, and a roll bar behind the seats
  const yoke = new THREE.Group(), yokeSpin = new THREE.Group(); yoke.name = 'yoke'; yoke.add(yokeSpin);
  const SEAT = { hip: [0.37, 0.3, -0.32], heel: [0.11, 0.22, 0.48] };
  {
    const CF = 0.2;
    const quad = (a, b, c, d, mat) => { const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c, ...a, ...c, ...d], 3)); geo.computeVertexNormals(); g.add(new THREE.Mesh(geo, mat)); };
    quad([-0.8, CF, -1.05], [0.8, CF, -1.05], [0.8, CF, 0.95], [-0.8, CF, 0.95], M.cabin);
    // (the tub's sides under the belt, behind and ahead of the doors; the bulkhead behind the seats)
    for (const sd of [1, -1]) {
      quad([sd * 0.78, CF, -1.05], [sd * 0.78, CF, ZD[0]], [sd * 0.74, 0.86, ZD[0]], [sd * 0.7, 0.9, -1.05], M.cabin);
      quad([sd * 0.8, CF, ZD[1]], [sd * 0.8, CF, 0.95], [sd * 0.7, 0.8, 0.95], [sd * 0.76, 0.84, ZD[1]], M.cabin);
    }
    quad([-0.72, CF, -0.95], [0.72, CF, -0.95], [0.6, 1.0, -1.0], [-0.6, 1.0, -1.0], M.cabin);
    // the dash: a shelf under the screen, the toe board below it
    prism([[0.42, 0.52], [0.64, 0.5], [0.95, 0.68], [0.95, CF], [0.62, CF], [0.42, 0.45]], 1.5, (u, v, w) => [w - 0.75, v, u], M.cabin);
    prism([[0.36, 0.66], [0.62, 0.62], [0.68, 0.79], [0.5, 0.8], [0.4, 0.74]], 1.5, (u, v, w) => [w - 0.75, v, u], M.carbon, 0.01);
    // the binnacle: a hood over five dials before the driver
    prism([[0.44, 0.74], [0.6, 0.74], [0.6, 0.86], [0.5, 0.86]], 0.46, (u, v, w) => [SEAT.hip[0] - 0.23 + w, v, u], M.cabin);
    for (let k = 0; k < 5; k++) {
      const x = SEAT.hip[0] + (k - 2) * 0.082, r = k === 2 ? 0.046 : 0.036;
      const d = mesh(new THREE.CircleGeometry(r, 24), M.gauge, x, 0.795, 0.455); d.rotation.x = -0.5; d.rotation.y = Math.PI;
      const rr = mesh(new THREE.RingGeometry(r, r + 0.006, 24), M.chrome, x, 0.795, 0.4545); rr.rotation.x = -0.5; rr.rotation.y = Math.PI;
    }
    // the console
    prism([[-0.4, CF], [0.62, CF], [0.62, 0.5], [0.3, 0.42], [-0.4, 0.38]], 0.2, (u, v, w) => [w - 0.1, v, u], M.cabin);
    // the buckets: a low cushion and a tall back with wings, in carbon with black cloth; red stitching
    for (const x of [SEAT.hip[0], -SEAT.hip[0]]) {
      prism([[0.12, CF + 0.01], [0.14, 0.27], [-0.3, 0.25], [-0.36, 0.3], [-0.6, 1.02], [-0.7, 1.04], [-0.48, 0.24], [-0.4, CF + 0.01]], 0.5, (u, v, w) => [x - 0.25 + w, v, u + 0.02 + SEAT.hip[2] + 0.2], M.carbon, 0.01);
      for (const s of [-1, 1]) prism([[0.1, 0.24], [0.1, 0.36], [-0.32, 0.36], [-0.56, 0.98], [-0.62, 0.98], [-0.42, 0.24]], 0.06, (u, v, w) => [x + s * 0.22 - 0.03 + w, v, u + 0.04 + SEAT.hip[2] + 0.2], M.carbon, 0.01);
      prism([[0.1, 0.275], [-0.29, 0.258], [-0.35, 0.3], [-0.56, 0.92], [-0.6, 0.925], [-0.4, 0.27]], 0.36, (u, v, w) => [x - 0.18 + w, v + 0.005, u + 0.03 + SEAT.hip[2] + 0.2], M.seat);
      prism([[-0.35, 0.3], [-0.56, 0.92], [-0.555, 0.92], [-0.345, 0.3]], 0.36, (u, v, w) => [x - 0.18 + w, v + 0.02, u + 0.012 + SEAT.hip[2] + 0.2], M.stitch);
    }
    // the roll bar behind the seats: a hoop and two stays back to the bulkhead
    const hoop = new THREE.CatmullRomCurve3([V3(-0.66, CF, -0.82), V3(-0.62, 0.95, -0.84), V3(-0.45, 1.15, -0.86), V3(0, 1.18, -0.87), V3(0.45, 1.15, -0.86), V3(0.62, 0.95, -0.84), V3(0.66, CF, -0.82)]);
    mesh(new THREE.TubeGeometry(hoop, 40, 0.022, 10, false), M.wheel);
    for (const s of [-1, 1]) mesh(new THREE.TubeGeometry(new THREE.LineCurve3(V3(s * 0.45, 1.14, -0.86), V3(s * 0.4, 0.95, -1.0)), 2, 0.018, 8, false), M.wheel);
    // the wheel: a round rim on three spokes, a red mark at the top, on its column out of the dash
    yoke.position.set(SEAT.hip[0], 0.7, 0.12); yoke.rotation.x = 0.42; g.add(yoke);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.152, 0.018, 10, 40), M.seat); yokeSpin.add(ring);
    const mark = new THREE.Mesh(new THREE.TorusGeometry(0.152, 0.0185, 10, 4, 0.12), M.stitch); mark.rotation.z = Math.PI / 2 - 0.06; yokeSpin.add(mark);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.035, 20), M.carbon); hub.rotation.x = Math.PI / 2; yokeSpin.add(hub);
    for (const a of [0, Math.PI, -Math.PI / 2]) { const sp = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.028, 0.012), M.carbon); sp.position.set(Math.cos(a) * 0.09, Math.sin(a) * 0.09, 0); sp.rotation.z = a; yokeSpin.add(sp); }
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.03, 0.3, 10), M.cabin); col.rotation.x = Math.PI / 2; col.position.z = 0.16; yoke.add(col);
  }
  const gripOf = (sideK, out = new THREE.Vector3()) => { yokeSpin.updateWorldMatrix(true, false); return yokeSpin.localToWorld(out.set(sideK === 'L' ? 0.17 : -0.17, -0.035, -0.05)); };
  const anchor = new THREE.Group(); anchor.name = 'driver'; g.add(anchor);

  /* ----------------------------------------------------------- the wheels -- */
  // low-profile tyres on black five-spoke centre-lock wheels, a big ventilated disc and a red caliper behind each
  const wheels = [];
  function wheel(ax, sd) {
    const Wg = new THREE.Group(), spin = new THREE.Group(); Wg.add(spin);
    const rimG = new THREE.Group(); rimG.rotation.z = -sd * Math.PI / 2; spin.add(rimG);   // (in here the axle is y, the face +y)
    const r = ax.r, tw = ax.w / 2, rimR = r - 0.07;
    const sec = [[rimR + 0.004, -tw * 0.86], [rimR + 0.014, -tw * 0.98], [r - 0.02, -tw], [r - 0.006, -tw * 0.94], [r, -tw * 0.76], [r, tw * 0.76], [r - 0.006, tw * 0.94], [r - 0.02, tw], [rimR + 0.014, tw * 0.98], [rimR + 0.004, tw * 0.86]];
    const tyre = new THREE.Mesh(new THREE.LatheGeometry(sec.map(([a, b]) => new THREE.Vector2(a, b)), 48), M.rubber); tyre.castShadow = true; rimG.add(tyre);
    // the rim's barrel and lip
    rimG.add(new THREE.Mesh(new THREE.LatheGeometry([[rimR + 0.006, tw * 0.86], [rimR - 0.004, tw * 0.9], [rimR - 0.012, tw * 0.84], [rimR - 0.01, -tw * 0.8]].map(([a, b]) => new THREE.Vector2(a, b)), 48), M.wheel));
    const inside = new THREE.Mesh(new THREE.CircleGeometry(rimR - 0.008, 32), M.under); inside.rotation.x = Math.PI / 2; inside.position.y = -tw * 0.75; rimG.add(inside);
    // five spokes: each a tapered blade from the hub to the lip, dished back toward the hub, a crease down its middle
    const sp = [];
    for (let k = 0; k < 5; k++) {
      const phi = (k / 5) * Math.PI * 2, c = [Math.cos(phi), Math.sin(phi)], q = [-Math.sin(phi), Math.cos(phi)];
      const rows = [];
      for (let s = 0; s <= 8; s++) {
        const t = s / 8, rho = 0.06 + (rimR - 0.012 - 0.06) * t, w = 0.042 + 0.02 * t, face = tw * 0.62 + 0.05 * (1 - t) * (1 - t) * 0.6 + 0.02 * t, ridge = 0.01;
        const P = (sx, hy) => [c[0] * rho + q[0] * sx, face + hy, c[1] * rho + q[1] * sx];
        rows.push([P(-w, -0.03), P(-w * 0.82, 0), P(0, ridge), P(w * 0.82, 0), P(w, -0.03)]);
      }
      for (let s = 0; s < 8; s++) for (let f = 0; f < 4; f++) { const a = rows[s][f], b = rows[s][f + 1], cc = rows[s + 1][f + 1], d = rows[s + 1][f]; sp.push(...a, ...b, ...cc, ...a, ...cc, ...d); }
    }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3)); sg.computeVertexNormals();
    rimG.add(new THREE.Mesh(sg, M.wheel));
    const hubY = tw * 0.62 + 0.04;
    const hubM = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.085, 0.04, 30), M.wheel); hubM.position.y = hubY; rimG.add(hubM);
    // (the centre-lock nut: a twelve-sided nut, its cap, a fine red ring)
    const nut = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.046, 0.035, 12), M.nut); nut.position.y = hubY + 0.03; rimG.add(nut);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.047, 0.0035, 6, 24), M.caliper); ring.rotation.x = Math.PI / 2; ring.position.y = hubY + 0.022; rimG.add(ring);
    // the disc (turns) and the caliper (doesn't), seen through the spokes
    const dR = rimR - 0.04;
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(dR, dR, 0.034, 40, 1, false), M.disc); disc.position.y = tw * 0.1; rimG.add(disc);
    const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.05, 24), M.nut); bell.position.y = tw * 0.25; rimG.add(bell);
    const cal = new THREE.Group(); cal.rotation.z = -sd * Math.PI / 2; Wg.add(cal);
    // (behind the axle and up for the front wheels, ahead of it and up for the back: local x is the world's -sd y)
    const wy = 0.7, wz = ax.front ? -0.7 : 0.7, a = Math.atan2(wz, -sd * wy);
    const cm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.2), M.caliper); cm.position.set(Math.cos(a) * (dR - 0.03), tw * 0.1 + 0.01, Math.sin(a) * (dR - 0.03)); cm.rotation.y = -a; cal.add(cm);
    return { W: Wg, spin };
  }
  for (const ax of AX) for (const sd of [1, -1]) {
    const wh = wheel(ax, sd); wh.W.position.set(sd * ax.x, ax.r, ax.z); g.add(wh.W);
    wheels.push({ ...wh, front: ax.front, r: ax.r });
  }
  // (the wells: a black liner round the top of each tyre)
  for (const ax of AX) both((sd) => {
    const geo = new THREE.CylinderGeometry(ax.R + 0.01, ax.R + 0.01, ax.w + 0.12, 28, 1, true, Math.PI / 2 - 1.3, 2.6).rotateZ(Math.PI / 2);
    mesh(geo, M.under, sd * ax.x, ax.r, ax.z);
  });

  /* ------------------------------------------------------------- the burn -- */
  // the rocket package as exhaust: on the boost the twin tips burn a short, hot tongue with a heat-coloured flame round
  // it and a glow on the road; the cold gas a pale shimmer. Lathes along -z, one per tip, each with its own seed
  const uCold = uniform(0), uBurn = uniform(0), uT = uniform(0), uElec = uniform(0);
  function plumeGeo(radius, n = 22) {
    const geos = NZ.map((p, i) => {
      const pts = []; for (let j = 0; j <= n; j++) { const t = j / n; pts.push(new THREE.Vector2(Math.max(0.0005, radius(t)), t)); }
      const lg = new THREE.LatheGeometry(pts, 14); lg.rotateX(-Math.PI / 2); lg.translate(p.x, p.y, 0);
      lg.setAttribute('seed', new THREE.Float32BufferAttribute(new Array(lg.attributes.position.count).fill(i * 1.37 + 0.4), 1)); return lg;
    });
    return mergeGeometries(geos);
  }
  function plumeMat({ c0, c1, e0, e1, gain, level, fade = 1.6, diamonds = 0, edge = 1.4, additive = true, floor = 0 }) {
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    const t = uv().y, seed = attribute('seed', 'float');
    const facing = mix(float(floor), float(1), pow(abs(normalView.dot(positionViewDirection)), float(edge)));
    const flick = sin(uT.mul(61).add(seed.mul(13))).mul(sin(uT.mul(27).add(seed.mul(7)))).mul(0.16).add(0.88);
    let k = pow(float(1).sub(t), float(fade));
    if (diamonds) k = k.mul(pow(abs(cos(t.mul(diamonds * Math.PI).sub(uT.mul(3)).add(seed))), float(5)).mul(1.4).add(0.4));
    const col = mix(vec3(...c0), vec3(...c1), t);
    m.colorNode = (e0 ? mix(col, mix(vec3(...e0), vec3(...e1), t), uElec) : col).mul(gain);
    m.opacityNode = k.mul(facing).mul(flick).mul(level).clamp(0, 1);
    return m;
  }
  const plumes = [];
  function plume(geo, mat, len) { const m = new THREE.Mesh(geo, mat); m.position.z = ZE - 0.012; m.renderOrder = 5; m.frustumCulled = false; m.userData.len = len; g.add(m); plumes.push(m); return m; }
  const fireCore = plume(plumeGeo((t) => Math.max(0.004, 0.03 + 0.01 * Math.sin(Math.PI * Math.min(1, t * 1.6)) - 0.034 * t * t)),
    plumeMat({ c0: [1.0, 0.82, 0.5], c1: [1.0, 0.42, 0.1], e0: [0.6, 0.98, 1.0], e1: [0.05, 0.78, 1.0], gain: 1.5, level: uBurn.mul(0.8), fade: 0.9, diamonds: 3, edge: 0.5, additive: false }), 0.9);
  const fireOuter = plume(plumeGeo((t) => 0.045 + 0.035 * Math.sin(Math.PI * Math.pow(t, 0.6)) * (1 - 0.35 * t)),
    plumeMat({ c0: [1.0, 0.45, 0.12], c1: [0.8, 0.14, 0.03], e0: [0.0, 0.85, 1.0], e1: [0.0, 0.45, 0.9], gain: 1.3, level: uBurn.mul(0.65), fade: 1.1, edge: 1.3 }), 1.9);
  const haze = plume(plumeGeo((t) => 0.05 + 0.1 * Math.pow(t, 0.8)),
    plumeMat({ c0: [0.9, 0.93, 0.98], c1: [0.7, 0.72, 0.76], gain: 0.9, level: uCold.mul(0.18).add(uBurn.mul(0.12)), fade: 1.4, edge: 1.4, additive: false, floor: 0.3 }), 1.6);
  haze.renderOrder = 4;
  const burstM = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  {
    const d = uv().sub(vec2(0.5)).length().mul(2);
    burstM.colorNode = mix(vec3(1.0, 0.6, 0.22), vec3(0.3, 0.92, 1.0), uElec).mul(1.4);
    burstM.opacityNode = pow(max(float(1).sub(d), 0), float(1.6)).mul(uBurn.mul(0.85));
  }
  const bursts = NZ.map((p) => { const b = new THREE.Sprite(burstM); b.position.set(p.x, p.y, ZE - 0.06); b.renderOrder = 6; g.add(b); plumes.push(b); return b; });
  const glow = new THREE.PointLight('#FF9A48', 0, 5, 1.8); glow.position.set(0, 0.6, ZR - 1.0); g.add(glow);

  let cold = 0, burn = 0, coldWant = 0, burnWant = 0, t = 0;
  function setThrust(c, b = 0) { coldWant = clamp01(c); burnWant = clamp01(b); }
  function applyThrust() {
    uCold.value = cold; uBurn.value = burn; uT.value = t;
    const j = 0.92 + 0.08 * Math.sin(t * 47) * Math.sin(t * 19);
    const L = (m, k) => { m.scale.z = m.userData.len * Math.max(0.02, k); };
    L(fireCore, (0.2 + 0.8 * burn) * j); L(fireOuter, (0.25 + 0.75 * burn) * (0.9 + 0.1 * Math.sin(t * 31))); L(haze, 0.3 + 0.7 * Math.max(cold, burn));
    for (const p of plumes) { p.visible = cold > 0.01 || burn > 0.01; p.castShadow = false; p.receiveShadow = false; }
    const bs = 0.1 + 0.22 * burn * j; for (const b of bursts) b.scale.setScalar(bs);
    glow.intensity = burn * 1.8;
    const eb = uElec.value * burn;
    glow.color.setRGB(1 - 0.6 * eb, 0.6 + 0.3 * eb, 0.3 + 0.7 * eb);
  }

  /* -------------------------------------------------- one mesh per material -- */
  // the fixed parts merged into one mesh per material (the body, the wheels, the doors, the wheel and the plumes stay)
  {
    g.updateMatrixWorld(true);
    const keep = new Set([body, glow, anchor, yoke, ...wheels.map((w) => w.W), ...plumes, ...Object.values(doors).map((d) => d.pivot), ...lampCs]), byMat = new Map(), gone = [];
    for (const ch of g.children) {
      if (keep.has(ch)) continue;
      ch.traverse((m) => {
        if (!m.isMesh || m.material.map) return;
        let geo = m.geometry.clone().applyMatrix4(m.matrixWorld); if (geo.index) geo = geo.toNonIndexed();
        for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal') geo.deleteAttribute(k);
        if (!geo.attributes.normal) geo.computeVertexNormals();
        if (!byMat.has(m.material)) byMat.set(m.material, []); byMat.get(m.material).push(geo);
      });
      if (ch.isMesh ? !ch.material.map : !ch.children.some((k) => k.isMesh && k.material.map)) gone.push(ch);
    }
    for (const ch of gone) g.remove(ch);
    for (const [mat, geos] of byMat) { const m = new THREE.Mesh(mergeGeometries(geos), mat); m.castShadow = !mat.transparent; m.receiveShadow = true; g.add(m); }
  }

  /* -------------------------------------------------------------- driving -- */
  function update(dt, speed = 0, steer = 0) {
    t += dt;
    for (const w of wheels) { w.spin.rotation.x += (speed * dt) / w.r; if (w.front) w.W.rotation.y = steer * 0.42; }
    yokeSpin.rotation.z += (-steer * 1.6 - yokeSpin.rotation.z) * Math.min(1, dt * 16);
    cold += (coldWant - cold) * Math.min(1, dt * 10); burn += (burnWant - burn) * Math.min(1, dt * 6);
    applyThrust();
  }
  setThrust(o.cold ?? 0, o.burn ?? 0); cold = coldWant; burn = burnWant; applyThrust();
  const setElectric = (on) => { uElec.value = on ? 1 : 0; };
  return {
    group: g, materials: M, wheels, setThrust, setElectric, update, length: ZF - ZR, width: 1.9, height: 1.28,
    setDoor, door: setDoor, doorT: (sideK) => doors[sideK]?.t ?? 0, doors, anchor, seat: SEAT, grip: gripOf, yoke,
    axle: (AX[0].z - AX[1].z) / 2, body: { hx: 1.0, z0: ZR - 0.02, z1: ZF + 0.03, top: 1.28 }, kind: 'gt',
  };
}
