/**
 * Motion for the humans in the asset library, from the CMU Graphics Lab
 * Motion Capture Database ("free for all uses").
 *
 * Reads Acclaim ASF/AMC, runs forward kinematics, and retargets onto a
 * library skeleton by bone direction: each target bone takes its source
 * bone's rotation, pre-aligned so that at rest it points where the source
 * bone points at rest. Differences in rest pose (MakeHuman stands in an
 * A-pose, CMU in a T-pose) and in proportions fall out of that. The feet are
 * then put back on the floor with the target's own leg lengths.
 *
 * Clips are cut to what a game needs: a seamless run cycle (in place, facing
 * +Z, with its natural speed so the runtime can match cadence to speed), a
 * standing idle loop, and a fall.
 */
import { read } from './lib.ts';

export type V3 = [number, number, number];
export type Q = [number, number, number, number]; // x y z w
export const qmul = (a: Q, b: Q): Q => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
export const qinv = (a: Q): Q => [-a[0], -a[1], -a[2], a[3]];
export const qaxis = (ax: V3, ang: number): Q => { const s = Math.sin(ang / 2); return [ax[0] * s, ax[1] * s, ax[2] * s, Math.cos(ang / 2)]; };
export const qrot = (q: Q, v: V3): V3 => { const p = qmul(qmul(q, [v[0], v[1], v[2], 0]), qinv(q)); return [p[0], p[1], p[2]]; };
export const norm = (v: V3): V3 => { const l = Math.hypot(...v) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export function arc(from: V3, to: V3): Q {
  const a = norm(from), b = norm(to), d = dot(a, b);
  if (d > 0.999999) return [0, 0, 0, 1];
  if (d < -0.999999) { const ax = norm(Math.abs(a[0]) < 0.9 ? cross(a, [1, 0, 0]) : cross(a, [0, 1, 0])); return qaxis(ax, Math.PI); }
  const c = cross(a, b); const q: Q = [c[0], c[1], c[2], 1 + d]; const l = Math.hypot(...q); return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}
export function slerp(a: Q, b: Q, t: number): Q {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  const bb: Q = d < 0 ? [-b[0], -b[1], -b[2], -b[3]] : b; d = Math.abs(d);
  if (d > 0.9995) { const r = a.map((v, i) => v + (bb[i] - v) * t) as Q; const l = Math.hypot(...r); return r.map((v) => v / l) as Q; }
  const th = Math.acos(d), s = Math.sin(th);
  return a.map((v, i) => (v * Math.sin((1 - t) * th) + bb[i] * Math.sin(t * th)) / s) as Q;
}
// Acclaim euler: static x, then y, then z
const euler = (x: number, y: number, z: number): Q => qmul(qmul(qaxis([0, 0, 1], z), qaxis([0, 1, 0], y)), qaxis([1, 0, 0], x));
const D2R = Math.PI / 180;
const INCH = (1 / 0.45) * 2.54 / 100; // ASF length units to metres (CMU FAQ)

type AsfBone = { name: string; dir: V3; length: number; c: Q; dof: string[]; parent: string | null };
function parseAsf(text: string) {
  const bones = new Map<string, AsfBone>();
  bones.set('root', { name: 'root', dir: [0, 0, 0], length: 0, c: [0, 0, 0, 1], dof: ['tx', 'ty', 'tz', 'rx', 'ry', 'rz'], parent: null });
  const sec = text.split(':bonedata')[1].split(':hierarchy');
  for (const block of sec[0].split('begin').slice(1)) {
    const get = (k: string) => block.match(new RegExp(`\\n\\s*${k}\\s+([^\\n]+)`))?.[1].trim().split(/\s+/);
    const name = get('name')![0], dir = get('direction')!.map(Number) as V3, length = +get('length')![0] * INCH;
    const ax = get('axis')!, dof = get('dof') ?? [];
    bones.set(name, { name, dir: norm(dir), length, c: euler(+ax[0] * D2R, +ax[1] * D2R, +ax[2] * D2R), dof, parent: null });
  }
  for (const line of sec[1].split('\n')) {
    const p = line.trim().split(/\s+/);
    if (p.length < 2 || p[0] === 'begin' || p[0] === 'end') continue;
    for (const c of p.slice(1)) bones.get(c)!.parent = p[0];
  }
  const order: string[] = []; const visit = (n: string) => { order.push(n); for (const b of bones.values()) if (b.parent === n) visit(b.name); }; visit('root');
  return { bones, order };
}
function parseAmc(text: string) {
  const frames: Map<string, number[]>[] = []; let cur: Map<string, number[]> | null = null;
  for (const line of text.split('\n')) {
    const t = line.trim(); if (!t || t[0] === '#' || t[0] === ':') continue;
    if (/^\d+$/.test(t)) { cur = new Map(); frames.push(cur); continue; }
    const p = t.split(/\s+/); cur?.set(p[0], p.slice(1).map(Number));
  }
  return frames;
}
type Pose = Map<string, { q: Q; head: V3; tail: V3 }>;
function fk(asf: ReturnType<typeof parseAsf>, f: Map<string, number[]>): Pose {
  const out: Pose = new Map();
  for (const n of asf.order) {
    const b = asf.bones.get(n)!, m = f.get(n) ?? [];
    if (n === 'root') {
      const q = euler(m[3] * D2R, m[4] * D2R, m[5] * D2R), p: V3 = [m[0] * INCH, m[1] * INCH, m[2] * INCH];
      out.set(n, { q, head: p, tail: p }); continue;
    }
    const r = [0, 0, 0]; b.dof.forEach((d, i) => { r[{ rx: 0, ry: 1, rz: 2 }[d as 'rx']] = (m[i] ?? 0) * D2R; });
    const par = out.get(b.parent!)!;
    const q = qmul(qmul(qmul(par.q, b.c), euler(r[0], r[1], r[2])), qinv(b.c));
    const d = qrot(q, b.dir);
    out.set(n, { q, head: par.tail, tail: [par.tail[0] + d[0] * b.length, par.tail[1] + d[1] * b.length, par.tail[2] + d[2] * b.length] });
  }
  return out;
}

// which source bone drives each library bone
const MAP: Record<string, string> = {
  root: 'root', spine05: 'lowerback', spine04: 'lowerback', spine03: 'upperback', spine02: 'upperback', spine01: 'thorax',
  neck01: 'lowerneck', neck02: 'lowerneck', neck03: 'upperneck', head: 'head',
};
for (const [s, c] of [['L', 'l'], ['R', 'r']]) Object.assign(MAP, {
  [`clavicle.${s}`]: `${c}clavicle`, [`shoulder01.${s}`]: `${c}clavicle`, [`upperarm01.${s}`]: `${c}humerus`, [`upperarm02.${s}`]: `${c}humerus`,
  [`lowerarm01.${s}`]: `${c}radius`, [`lowerarm02.${s}`]: `${c}radius`, [`wrist.${s}`]: `${c}hand`,
  [`upperleg01.${s}`]: `${c}femur`, [`upperleg02.${s}`]: `${c}femur`, [`lowerleg01.${s}`]: `${c}tibia`, [`lowerleg02.${s}`]: `${c}tibia`, [`foot.${s}`]: `${c}foot`,
});

export type Skeleton = { name: string; parent: number; head: number[]; tail: number[] }[];
export type Clip = { name: string; fps: number; frames: number; loop: boolean; speed: number; bones: string[]; quats: Float32Array; root: Float32Array; contact?: number; dir?: number };

// kinds: 'cycle' one gait cycle found by the left foot's strikes; 'idle' a loop
// in place; 'once' a move in place; 'move' a loop cut at start..end that keeps
// its travel as a speed and a direction (footwork: a step in, back, aside).
// face 'hips' turns the clip to face where the hips face, not where it goes
// (a sidestep, a backpedal). srcFps is the capture's rate (most CMU trials 120).
// contact: seconds from start to the moment a blow lands.
export function retargetClip(skel: Skeleton, src: { asf: string; amc: string }, opts: { name: string; kind: 'cycle' | 'idle' | 'once' | 'move'; start?: number; end?: number; fps?: number; inPlace?: boolean; face?: 'travel' | 'hips'; srcFps?: number; contact?: number; period?: number; fist?: boolean }): Clip {
  const asf = parseAsf(read(`cmu-mocap/${src.asf}`)), frames = parseAmc(read(`cmu-mocap/${src.amc}`));
  const poses = frames.map((f) => fk(asf, f));
  const FPS = opts.srcFps ?? 120, fps = opts.fps ?? 30;
  // the source at rest: every rotation zero, bones along their ASF directions
  const align = skel.map((b) => {
    const s = MAP[b.name]; if (!s || s === 'root') return [0, 0, 0, 1] as Q;
    return arc(norm([b.tail[0] - b.head[0], b.tail[1] - b.head[1], b.tail[2] - b.head[2]]), asf.bones.get(s)!.dir);
  });

  // pick the frames
  let a = opts.start ?? 0, z = opts.end ?? poses.length - 1;
  const footY = (p: Pose, side: 'l' | 'r') => Math.min(p.get(`${side}foot`)!.tail[1], p.get(`${side}toes`)!.tail[1]);
  if (opts.kind === 'cycle') {
    // one gait cycle, left foot-strike to the next, from the steady middle of
    // the stretch (start..end when given). The stride's period comes first: the
    // lag at which the left foot's height best repeats (a walk's heel and toe
    // would otherwise pass for two strikes)
    const lo = a, hi = z, y = poses.map((p) => footY(p, 'l')), yr = poses.map((p) => footY(p, 'r'));
    const diff = (L: number) => { let d = 0, c = 0; for (let i = lo; i + L <= hi; i++) { d += Math.abs(y[i] - y[i + L]) + Math.abs(yr[i] - yr[i + L]); c++; } return c ? d / c : Infinity; };
    let T = opts.period ? Math.round(opts.period * FPS) : 0, best = Infinity;
    if (!T) for (let L = Math.round(0.45 * FPS); L <= Math.round(1.6 * FPS) && L < (hi - lo) * 0.7; L++) { const d = diff(L); if (d < best) { best = d; T = L; } }
    if (!T) throw new Error(`${src.amc}: too short to find a stride`);
    const floor = Math.min(...y.slice(lo, hi + 1)), strikes: number[] = [];
    for (let i = Math.max(lo, 2); i < Math.min(hi, y.length - 2); i++) if (y[i] <= y[i - 1] && y[i] < y[i + 1] && y[i] < floor + 0.06 && (!strikes.length || i - strikes[strikes.length - 1] > T * 0.6)) strikes.push(i);
    const pairs = strikes.slice(1).map((s2, i) => [strikes[i], s2]).filter(([p, q]) => q - p > T * 0.8 && q - p < T * 1.25);
    if (pairs.length) { const pick = pairs[Math.floor((pairs.length - 1) / 2)]; a = pick[0]; z = pick[1]; }
    else { a = Math.round((lo + hi - T) / 2); z = a + T; }
  }
  const n = Math.max(2, Math.round(((z - a) / FPS) * fps) + (opts.kind === 'once' ? 1 : 0));
  // heading: face +Z along the direction of travel (or of the hips, standing still)
  const r0 = poses[a].get('root')!.head, r1 = poses[z].get('root')!.head;
  let fwd: V3 = [r1[0] - r0[0], 0, r1[2] - r0[2]];
  const hipsFwd = (): V3 => { let sx = 0, sz = 0; for (let i = a; i <= z; i++) { const l = poses[i].get('lfemur')!.head, r = poses[i].get('rfemur')!.head; const c = cross([l[0] - r[0], 0, l[2] - r[2]], [0, 1, 0]); const cl = Math.hypot(c[0], c[2]) || 1; sx += c[0] / cl; sz += c[2] / cl; } return [sx, 0, sz]; };
  if (opts.face === 'hips' || opts.kind === 'move' || Math.hypot(fwd[0], fwd[2]) < 0.3) fwd = hipsFwd();
  const heading = arc(norm(fwd), [0, 0, 1]);
  const travel = Math.hypot(r1[0] - r0[0], r1[2] - r0[2]), duration = (z - a) / FPS;
  // the travel in the clip's own frame (+z ahead, +x to its left)
  const tv = qrot(heading, [r1[0] - r0[0], 0, r1[2] - r0[2]]);
  const moves = opts.kind === 'cycle' || opts.kind === 'move';

  // leg scale: target hip-to-ankle over source hip-to-ankle
  const J = (nm: string) => skel.find((b) => b.name === nm)!;
  const tLeg = J('upperleg01.L').head[1] - J('foot.L').head[1];
  const sLeg = (asf.bones.get('lfemur')!.length + asf.bones.get('ltibia')!.length) * 0.97;
  const k = tLeg / sLeg;

  const sample = (t: number) => {
    const f = a + t * (z - a), i = Math.min(poses.length - 2, Math.floor(f)), u = f - i;
    const A = poses[i], B = poses[i + 1];
    const q = (nm: string) => slerp(A.get(nm)!.q, B.get(nm)!.q, u);
    const rp = A.get('root')!.head.map((v, j) => v + (B.get('root')!.head[j] - v) * u) as V3;
    return { q, rp };
  };
  const bones = skel.map((b) => b.name), nb = bones.length, loop = opts.kind !== 'once';
  // loops sample one extra frame (the start of the next cycle) to close the seam
  const m = loop ? n + 1 : n;
  const quats = new Float32Array(m * nb * 4), root = new Float32Array(m * 3);
  const world: Q[] = new Array(nb);
  const curl = fingerCurl(skel, !!opts.fist), rootRest = skel[0].head;
  for (let fI = 0; fI < m; fI++) {
    const t = loop ? fI / n : fI / (n - 1);
    const s = sample(t);
    skel.forEach((b, bi) => {
      const src = MAP[b.name];
      world[bi] = src ? qmul(qmul(heading, s.q(src)), align[bi]) : qmul(world[b.parent], curl[bi] ?? [0, 0, 0, 1]);
      const local = b.parent < 0 ? world[bi] : qmul(qinv(world[b.parent]), world[bi]);
      quats.set(local, (fI * nb + bi) * 4);
    });
    const rel = qrot(heading, [s.rp[0] - r0[0], s.rp[1], s.rp[2] - r0[2]]);
    // a moving clip plays on the spot: its travel is taken out as it goes
    const ax = moves ? tv[0] * t : 0, az = moves ? tv[2] * t : 0;
    root.set([(rel[0] - ax) * k + rootRest[0], rel[1] * k, (rel[2] - az) * k + rootRest[2]], fI * 3);
  }
  if (!moves) {
    // in place: take out the drift of the hips over the clip
    let cx = 0, cz = 0; for (let fI = 0; fI < m; fI++) { cx += root[fI * 3] / m; cz += root[fI * 3 + 2] / m; }
    const z0 = root[2];
    for (let fI = 0; fI < m; fI++) {
      root[fI * 3] += rootRest[0] - cx;
      // a start happens on the spot (the runtime moves the runner); a fall keeps its dive
      if (opts.inPlace) root[fI * 3 + 2] = rootRest[2];
      else root[fI * 3 + 2] += opts.kind === 'idle' ? rootRest[2] - cz : rootRest[2] - z0;
    }
  }
  if (loop) closeLoop(quats, root, n, nb);
  // put the feet on the floor: lowest ankle over the clip sits at the rest ankle height
  const ankle = J('foot.L').head[1];
  let low = Infinity;
  for (let fI = 0; fI < n; fI++) { const hp = forward(skel, quats, root, fI); for (const side of ['foot.L', 'foot.R']) low = Math.min(low, hp[bones.indexOf(side)][1]); }
  const lift = ankle - low;
  for (let fI = 0; fI < n; fI++) root[fI * 3 + 1] += lift;
  const out: Clip = { name: opts.name, fps, frames: n, loop, speed: moves ? (travel * k) / duration : 0, bones, quats: quats.slice(0, n * nb * 4), root: root.slice(0, n * 3) };
  if (moves) out.dir = +Math.atan2(tv[0], tv[2]).toFixed(3);
  if (opts.contact != null) out.contact = +opts.contact.toFixed(3);
  return out;
}

// close a loop: frame n (the start of the next cycle) must equal frame 0, so
// spread the difference across the cycle
export function closeLoop(quats: Float32Array, root: Float32Array, n: number, nb: number) {
  for (let b = 0; b < nb; b++) {
    const first = Array.from(quats.subarray(b * 4, b * 4 + 4)) as Q, end = Array.from(quats.subarray((n * nb + b) * 4, (n * nb + b) * 4 + 4)) as Q;
    const fix = qmul(first, qinv(end));
    for (let f = 0; f <= n; f++) {
      const o = (f * nb + b) * 4, q = Array.from(quats.subarray(o, o + 4)) as Q;
      quats.set(qmul(slerp([0, 0, 0, 1], fix, f / n), q), o);
    }
  }
  for (let k = 0; k < 3; k++) { const d = root[k] - root[n * 3 + k]; for (let f = 0; f <= n; f++) root[f * 3 + k] += d * (f / n); }
}

/** World head positions of every bone for one frame (rest: identity rotations). */
export function forward(skel: Skeleton, quats: Float32Array, root: Float32Array, f: number): V3[] {
  const nb = skel.length, wq: Q[] = [], wp: V3[] = [];
  skel.forEach((b, i) => {
    const q = Array.from(quats.subarray((f * nb + i) * 4, (f * nb + i) * 4 + 4)) as Q;
    if (b.parent < 0) { wq[i] = q; wp[i] = [root[f * 3], root[f * 3 + 1], root[f * 3 + 2]]; return; }
    const p = skel[b.parent], off: V3 = [b.head[0] - p.head[0], b.head[1] - p.head[1], b.head[2] - p.head[2]];
    const r = qrot(wq[b.parent], off); wq[i] = qmul(wq[b.parent], q); wp[i] = [wp[b.parent][0] + r[0], wp[b.parent][1] + r[1], wp[b.parent][2] + r[2]];
  });
  return wp;
}

// a relaxed, loosely closed hand: each finger joint curls toward the palm, a little more toward the little finger,
// and the fingers lie together with the thumb alongside (the library hand rests splayed: index and little finger
// 16 degrees off the middle one, the thumb 61; captures without fingers left that splay, a claw)
// (a fist for a fighter: about 85 degrees at the knuckle, 105 at the middle joint, 65 at the tip with the rest bend,
// so the fingertips tuck into the palm instead of looping a hollow cage; together; the thumb across)
function fingerCurl(skel: Skeleton, fist = false): Record<number, Q> {
  const out: Record<number, Q> = {};
  const dirOf = (b: Skeleton[number]) => norm([b.tail[0] - b.head[0], b.tail[1] - b.head[1], b.tail[2] - b.head[2]]);
  for (const s of ['L', 'R']) {
    const B = (n: string) => skel.findIndex((b) => b.name === n);
    const idx = skel[B(`finger2-1.${s}`)], pinky = skel[B(`finger5-1.${s}`)], thumb = skel[B(`finger1-1.${s}`)], mid = skel[B(`finger3-1.${s}`)];
    const across = norm([pinky.head[0] - idx.head[0], pinky.head[1] - idx.head[1], pinky.head[2] - idx.head[2]]);
    const middle = dirOf(mid), index = dirOf(idx);
    // the palm's normal, on the side the fingers close to: the side that brings the middle fingertip nearer the
    // thumb's root
    let palm = norm(cross(across, middle));
    const reach = (n: V3) => { const d = qrot(qaxis(norm(cross(middle, n)), 0.5), middle); return Math.hypot(mid.head[0] + d[0] * 0.05 - thumb.head[0], mid.head[1] + d[1] * 0.05 - thumb.head[1], mid.head[2] + d[2] * 0.05 - thumb.head[2]); };
    if (reach([-palm[0], -palm[1], -palm[2]]) < reach(palm)) palm = [-palm[0], -palm[1], -palm[2]];
    for (let f = 1; f <= 5; f++) for (let j = 1; j <= 3; j++) {
      const bi = B(`finger${f}-${j}.${s}`); if (bi < 0) continue;
      const b = skel[bi], dir = dirOf(b);
      const ang = fist ? (f === 1 ? [0.75, 0.6, 0.5][j - 1] : [1.15, 1.75, 1.0][j - 1]) : (f === 1 ? [0.18, 0.3, 0.26][j - 1] : [0.4, 0.55, 0.32][j - 1] * [0, 0, 0.85, 1, 1.1, 1.2][f]);
      let q: Q;
      if (f === 1) {
        // the thumb folds across the palm; choose the sign that brings its tip toward the palm's side
        const axis = norm(cross(dir, across));
        const tip = (sg: number) => { const d = qrot(qaxis(axis, sg * ang), dir); return d[0] * palm[0] + d[1] * palm[1] + d[2] * palm[2]; };
        q = qaxis(axis, tip(1) > tip(-1) ? ang : -ang);
      } else {
        // a finger bends square to itself, in toward the palm (about the knuckle line instead, the splayed fingers
        // twisted sideways as they closed: a claw)
        q = qaxis(norm(cross(dir, palm)), ang);
      }
      // the splay closes at the knuckles: the fingers swing in toward the middle one, the thumb toward the index
      if (j === 1 && f !== 3) {
        const to = f === 1 ? index : middle, gap = Math.acos(Math.min(1, Math.max(-1, dir[0] * to[0] + dir[1] * to[1] + dir[2] * to[2])));
        if (gap > 1e-3) q = qmul(qaxis(norm(cross(dir, to)), gap * (f === 1 ? 0.4 : fist ? 0.8 : 0.65)), q);
      }
      out[bi] = q;
    }
  }
  return out;
}

/** A trial's poses (forward kinematics per frame), for choosing where to cut clips. */
export function trialPoses(asfPath: string, amcPath: string) {
  const asf = parseAsf(read(`cmu-mocap/${asfPath}`)), frames = parseAmc(read(`cmu-mocap/${amcPath}`));
  return { bones: asf.bones, poses: frames.map((f) => fk(asf, f)) };
}

/** Root speed profile of a trial, for choosing clips. */
export function trialStats(asfPath: string, amcPath: string) {
  const asf = parseAsf(read(`cmu-mocap/${asfPath}`)), frames = parseAmc(read(`cmu-mocap/${amcPath}`));
  const p = frames.map((f) => fk(asf, f).get('root')!.head);
  const sp: number[] = []; for (let i = 12; i < p.length; i += 12) sp.push(Math.hypot(p[i][0] - p[i - 12][0], p[i][2] - p[i - 12][2]) * 10);
  return { frames: frames.length, seconds: +(frames.length / 120).toFixed(2), speeds: sp.map((v) => +v.toFixed(2)), rootY: p.map((v) => +v[1].toFixed(2)).filter((_, i) => i % 24 === 0) };
}

/**
 * A sprint from a run: the capture is a 3.5 m/s run, and a sprinter drives
 * the knees higher, swings the arms harder and leans into it. Each bone's
 * motion is amplified around its own average pose over the cycle (so the
 * posture stays the runner's own), then the trunk is tipped forward.
 */
export function sprintFrom(run: Clip, skel: Skeleton, name = 'sprint'): Clip {
  const nb = run.bones.length, n = run.frames, quats = new Float32Array(run.quats);
  const gain = (b: string) => /^upperleg/.test(b) ? 1.45 : /^lowerleg/.test(b) ? 1.18 : /^(upperarm|lowerarm)/.test(b) ? 1.4 : /^foot/.test(b) ? 1.15 : 1;
  for (let b = 0; b < nb; b++) {
    const g = gain(run.bones[b]); if (g === 1) continue;
    // mean rotation: normalised average (the cycle stays within a hemisphere)
    let m: Q = [0, 0, 0, 0]; const q0 = Array.from(quats.subarray(b * 4, b * 4 + 4)) as Q;
    for (let f = 0; f < n; f++) { const o = (f * nb + b) * 4; const s = Math.sign(quats[o] * q0[0] + quats[o + 1] * q0[1] + quats[o + 2] * q0[2] + quats[o + 3] * q0[3]) || 1; for (let k = 0; k < 4; k++) m[k] += quats[o + k] * s; }
    const l = Math.hypot(...m); m = m.map((v) => v / l) as Q;
    for (let f = 0; f < n; f++) {
      const o = (f * nb + b) * 4, q = Array.from(quats.subarray(o, o + 4)) as Q;
      quats.set(qmul(m, slerp([0, 0, 0, 1], qmul(qinv(m), q), g)), o);
    }
  }
  // lean: pitch the trunk forward about the hips (rotation about +X tips +Y toward +Z)
  const lean: Record<string, number> = { spine05: 0.07, spine04: 0.06, spine03: 0.05, neck01: -0.08, head: -0.06 };
  for (let b = 0; b < nb; b++) {
    const a = lean[run.bones[b]]; if (!a) continue;
    const r = qaxis([1, 0, 0], a);
    for (let f = 0; f < n; f++) { const o = (f * nb + b) * 4; quats.set(qmul(r, Array.from(quats.subarray(o, o + 4)) as Q), o); }
  }
  const root = new Float32Array(run.root);
  // the feet go back on the floor
  const ankle = skel.find((b) => b.name === 'foot.L')!.head[1];
  let low = Infinity;
  for (let f = 0; f < n; f++) { const hp = forward(skel, quats, root, f); for (const side of ['foot.L', 'foot.R']) low = Math.min(low, hp[run.bones.indexOf(side)][1]); }
  for (let f = 0; f < n; f++) root[f * 3 + 1] += ankle - low;
  return { ...run, name, quats, root };
}
