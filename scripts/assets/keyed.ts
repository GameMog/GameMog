/**
 * Hand-keyed motion: a clip built from a few key poses on a library skeleton,
 * for a move no capture or animation library has (the punch finisher's
 * overhead blow to a man on the ground, AI Alps, the owner 4 Oct: "a
 * skull-crushing overhead punch").
 *
 * A key pose says where things are, not how each bone turns: the hips' height
 * and lean, the torso's bend, twist and side bend (spread up the spine), the
 * neck's, where each ankle and wrist goes and which way each knee and elbow
 * points. Between keys the numbers are eased, and every frame is solved again:
 * each leg and arm by two-bone IK (the upper and lower segment turning as a
 * hinge, so a knee or an elbow only ever bends the way it bends), so a fist on
 * its way from one key to the next goes straight there instead of swinging
 * round on its shoulder. The fingers keep the pose they have in the clip the
 * move starts from (the fight guard's fist), and the move starts in that
 * clip's first frame and goes back to it, blended over the windows given.
 *
 * Same conventions as mocap.ts: the skeleton's rest pose is its bones' heads
 * and tails in world space with every rotation zero, a frame is one local
 * rotation per bone plus the root's position, the body faces +Z with its left
 * at +X, and the floor is at y = 0.
 */
import { cross, dot, forward, norm, qaxis, qinv, qmul, slerp, type Clip, type Q, type Skeleton, type V3 } from './mocap.ts';

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const X: V3 = [1, 0, 0], Y: V3 = [0, 1, 0], Z: V3 = [0, 0, 1];
// a turn as pitch (about x: + leans forward / looks down), yaw (about y: + turns to the left) and roll (about z:
// + tips to the right), the roll first and the pitch last, so the yaw is a twist about the body's own upright
const pyr = (p: number, y = 0, r = 0): Q => qmul(qaxis(X, p), qmul(qaxis(Y, y), qaxis(Z, r)));

// the rotation taking one frame (x along a bone, z across it) to another
function frameQ(x0: V3, z0: V3, x1: V3, z1: V3): Q {
  const basis = (x: V3, z: V3) => { const a = norm(x), c = norm(sub(z, mul(a, dot(z, a)))); return [a, cross(c, a), c]; };
  const b0 = basis(x0, z0), b1 = basis(x1, z1), m = [0, 1, 2].map((i) => [0, 1, 2].map((j) => b1[0][i] * b0[0][j] + b1[1][i] * b0[1][j] + b1[2][i] * b0[2][j]));
  const t = m[0][0] + m[1][1] + m[2][2];
  let q: Q;
  if (t > 0) { const s = 0.5 / Math.sqrt(t + 1); q = [(m[2][1] - m[1][2]) * s, (m[0][2] - m[2][0]) * s, (m[1][0] - m[0][1]) * s, 0.25 / s]; }
  else if (m[0][0] > m[1][1] && m[0][0] > m[2][2]) { const s = 2 * Math.sqrt(1 + m[0][0] - m[1][1] - m[2][2]); q = [0.25 * s, (m[0][1] + m[1][0]) / s, (m[0][2] + m[2][0]) / s, (m[2][1] - m[1][2]) / s]; }
  else if (m[1][1] > m[2][2]) { const s = 2 * Math.sqrt(1 + m[1][1] - m[0][0] - m[2][2]); q = [(m[0][1] + m[1][0]) / s, 0.25 * s, (m[1][2] + m[2][1]) / s, (m[0][2] - m[2][0]) / s]; }
  else { const s = 2 * Math.sqrt(1 + m[2][2] - m[0][0] - m[1][1]); q = [(m[0][2] + m[2][0]) / s, (m[1][2] + m[2][1]) / s, 0.25 * s, (m[1][0] - m[0][1]) / s]; }
  const l = Math.hypot(...q); return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}

// two-bone IK: the middle joint for a limb from s to t (lengths l1, l2), bent toward the point pole; t is pulled in
// if out of reach (a limb never quite straight, so it keeps a plane to bend in)
function ik2(s: V3, t: V3, l1: number, l2: number, pole: V3) {
  let d = sub(t, s), L = len(d);
  const hi = (l1 + l2) * 0.995, lo = Math.abs(l1 - l2) + 1e-3;
  if (L > hi) { t = add(s, mul(d, hi / L)); d = sub(t, s); L = hi; } else if (L < lo) { t = add(s, mul(norm(d), lo)); d = sub(t, s); L = lo; }
  const n = norm(d), a = (l1 * l1 - l2 * l2 + L * L) / (2 * L), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  let m = sub(pole, s); m = norm(sub(m, mul(n, dot(m, n))));
  return { mid: add(s, add(mul(n, a), mul(m, h))), end: t, reach: len(sub(t, s)) / (l1 + l2), m, n };
}

/** A limb's key: where its end goes (an ankle, a wrist) and a point its knee or elbow bends toward. */
export type Limb = { at: V3; pole: V3 };
/** One key pose. Angles in radians; positions in metres on the body the keys were written for (see keyedClip's ref). */
export type Pose = {
  rootY: number;
  turn?: number;                    // the whole body turned on the spot (+ to the left), its targets with it
  hips: [number, number, number];   // pitch, yaw, roll of the pelvis
  torso: [number, number, number];  // pitch, yaw, roll of the chest against the pelvis, spread up the spine
  neck: [number, number];           // pitch, yaw of the head against the chest, spread up the neck
  footL: Limb & { pitch: number }; footR: Limb & { pitch: number }; // + pitch: the toes down (a foot on its toes)
  handL: Limb; handR: Limb;
  shoulder?: [number, number];      // the left and right shoulder raised (a shrug toward an arm overhead)
};
/** A key at t seconds; ease: how the numbers come into it from the key before (default smooth). */
export type Key = { t: number; ease?: 'smooth' | 'in' | 'out' | 'linear'; pose: Pose };
const EASE = { smooth: (u: number) => u * u * (3 - 2 * u), in: (u: number) => u * u * u, out: (u: number) => 1 - (1 - u) ** 2, linear: (u: number) => u };

function mix(a: Pose, b: Pose, u: number): Pose {
  const n = (x: number, y: number) => x + (y - x) * u, v = (x: V3, y: V3): V3 => [n(x[0], y[0]), n(x[1], y[1]), n(x[2], y[2])];
  const limb = <L extends Limb>(x: L, y: L): L => ({ ...x, at: v(x.at, y.at), pole: v(x.pole, y.pole), ...('pitch' in x ? { pitch: n((x as any).pitch, (y as any).pitch) } : {}) });
  return {
    rootY: n(a.rootY, b.rootY), turn: n(a.turn ?? 0, b.turn ?? 0), hips: v(a.hips, b.hips), torso: v(a.torso, b.torso), neck: [n(a.neck[0], b.neck[0]), n(a.neck[1], b.neck[1])],
    footL: limb(a.footL, b.footL), footR: limb(a.footR, b.footR), handL: limb(a.handL, b.handL), handR: limb(a.handR, b.handR),
    shoulder: [n(a.shoulder?.[0] ?? 0, b.shoulder?.[0] ?? 0), n(a.shoulder?.[1] ?? 0, b.shoulder?.[1] ?? 0)],
  };
}
function poseAt(keys: Key[], t: number): Pose {
  if (t <= keys[0].t) return keys[0].pose;
  for (let i = 1; i < keys.length; i++) if (t <= keys[i].t) { const u = (t - keys[i - 1].t) / (keys[i].t - keys[i - 1].t); return mix(keys[i - 1].pose, keys[i].pose, EASE[keys[i].ease ?? 'smooth'](u)); }
  return keys[keys.length - 1].pose;
}

export type Solved = { quats: Q[]; root: V3; reach: Record<string, number> };
/** Solve one pose on a skeleton: a local rotation per bone and the root's position (fingers from `hands`). */
export function solvePose(skel: Skeleton, p: Pose, hands: Q[]): Solved {
  const nb = skel.length, B = (n: string) => { const i = skel.findIndex((b) => b.name === n); if (i < 0) throw new Error(`no bone ${n}`); return i; };
  const H = (i: number) => skel[i].head as V3;
  const W: Q[] = new Array(nb), P: V3[] = new Array(nb), set = new Array(nb).fill(false);
  const root: V3 = [skel[0].head[0], p.rootY, skel[0].head[2]];
  // a bone's world turn, and its head where its parent's turn puts it
  const place = (i: number, q: Q) => {
    W[i] = q; set[i] = true;
    const pi = skel[i].parent; P[i] = pi < 0 ? root : add(P[pi], rotate(W[pi], sub(H(i), H(pi))));
  };
  const rotate = (q: Q, v: V3): V3 => { const r = qmul(qmul(q, [v[0], v[1], v[2], 0]), qinv(q)); return [r[0], r[1], r[2]]; };
  // the turn: about the upright through the root, the hips and every target with it
  const turn = qaxis(Y, p.turn ?? 0), spin = (v: V3): V3 => add([root[0], 0, root[2]], rotate(turn, sub(v, [root[0], 0, root[2]])));
  const hips = qmul(turn, pyr(...p.hips));
  place(0, hips);
  for (const s of ['L', 'R']) place(B(`pelvis.${s}`), hips);
  // the spine bends over its five bones, the neck over its three and the head
  const torso = pyr(...p.torso), spine = ['spine05', 'spine04', 'spine03', 'spine02', 'spine01'], sf = [0.12, 0.3, 0.5, 0.75, 1];
  spine.forEach((n, k) => place(B(n), qmul(hips, slerp([0, 0, 0, 1], torso, sf[k]))));
  const chest = W[B('spine01')], neck = pyr(p.neck[0], p.neck[1]);
  ['neck01', 'neck02', 'neck03', 'head'].forEach((n, k) => place(B(n), qmul(chest, slerp([0, 0, 0, 1], neck, [0.25, 0.5, 0.75, 1][k]))));
  const reach: Record<string, number> = {};
  for (const s of ['L', 'R'] as const) {
    // the arm: the clavicle as at rest on the chest (the runtime holds it three quarters of the way to rest), the
    // shoulder raised as asked, then the upper arm and forearm (each a pair of bones) by IK, the hand straight on
    place(B(`clavicle.${s}`), chest);
    const raise = (p.shoulder?.[s === 'L' ? 0 : 1] ?? 0) * (s === 'L' ? 1 : -1);
    place(B(`shoulder01.${s}`), qmul(qaxis(Z, raise), chest));
    const u1 = B(`upperarm01.${s}`), u2 = B(`upperarm02.${s}`), f1 = B(`lowerarm01.${s}`), f2 = B(`lowerarm02.${s}`), w = B(`wrist.${s}`);
    place(u1, chest);
    const S = P[u1], h0 = s === 'L' ? p.handL : p.handR, hand = { at: spin(h0.at), pole: spin(h0.pole) };
    const up0 = sub(H(f1), H(u1)), fo0 = sub(H(w), H(f1)), hinge0 = cross(up0, fo0);
    const k = ik2(S, hand.at, len(up0), len(fo0), hand.pole);
    let hinge = cross(sub(k.mid, S), sub(k.end, k.mid)); if (len(hinge) < 1e-6) hinge = cross(k.m, k.n);
    const qu = frameQ(up0, hinge0, sub(k.mid, S), hinge), qf = frameQ(fo0, hinge0, sub(k.end, k.mid), hinge);
    place(u1, qu); place(u2, qu); place(f1, qf); place(f2, qf); place(w, qf);
    reach[`hand${s}`] = +k.reach.toFixed(3);
    // the leg: thigh and shin (each a pair) by IK, the knee a hinge about the body's side-to-side axis at rest; the foot
    // flat as at rest, pitched (toes down) and turned with the hips' yaw
    const t1 = B(`upperleg01.${s}`), t2 = B(`upperleg02.${s}`), s1 = B(`lowerleg01.${s}`), s2 = B(`lowerleg02.${s}`), ft = B(`foot.${s}`);
    place(t1, hips);
    const Hp = P[t1], f0 = s === 'L' ? p.footL : p.footR, foot = { ...f0, at: spin(f0.at), pole: spin(f0.pole) };
    const th0 = sub(H(s1), H(t1)), sh0 = sub(H(ft), H(s1));
    const kl = ik2(Hp, foot.at, len(th0), len(sh0), foot.pole);
    let khinge = cross(sub(kl.mid, Hp), sub(kl.end, kl.mid)); if (len(khinge) < 1e-6) khinge = cross(kl.m, kl.n);
    const qt = frameQ(th0, X, sub(kl.mid, Hp), khinge), qs = frameQ(sh0, X, sub(kl.end, kl.mid), khinge);
    place(t1, qt); place(t2, qt); place(s1, qs); place(s2, qs);
    place(ft, qmul(qaxis(Y, (p.turn ?? 0) + p.hips[1]), qaxis(X, foot.pitch)));
    reach[`foot${s}`] = +kl.reach.toFixed(3);
  }
  // anything left (the fingers): its local turn from `hands`, on its parent's
  skel.forEach((b, i) => { if (!set[i]) place(i, qmul(W[b.parent], hands[i])); });
  const quats = skel.map((b, i) => (b.parent < 0 ? W[i] : qmul(qinv(W[b.parent]), W[i])));
  return { quats, root, reach };
}

/**
 * A clip from key poses. `from`: the clip the move starts in and goes back to (its first frame; the fingers keep its
 * pose throughout), blended in over blendIn (seconds: full at the first, gone by the second) and back over blendOut.
 * ref: the height (the head bone's tip) of the body the keys were written for; another body's keys are scaled to it.
 */
export function keyedClip(skel: Skeleton, from: Clip, o: { name: string; keys: Key[]; ref: number; contact: number; blendIn: [number, number]; blendOut: [number, number]; fps?: number }): Clip & { reach: Record<string, number>[] } {
  const fps = o.fps ?? 30, end = o.keys[o.keys.length - 1].t, n = Math.round(end * fps) + 1, nb = skel.length;
  const headTip = skel.find((b) => b.name === 'head')!.tail[1], k = headTip / o.ref;
  const scaleLimb = <L extends Limb>(l: L): L => ({ ...l, at: mul(l.at, k), pole: mul(l.pole, k) });
  const keys = o.keys.map((K) => ({ ...K, pose: { ...K.pose, rootY: K.pose.rootY * k, footL: scaleLimb(K.pose.footL), footR: scaleLimb(K.pose.footR), handL: scaleLimb(K.pose.handL), handR: scaleLimb(K.pose.handR) } }));
  const g0 = (b: number): Q => Array.from(from.quats.subarray(b * 4, b * 4 + 4)) as Q;
  const hands = skel.map((_, b) => g0(b)), gRoot: V3 = [from.root[0], from.root[1], from.root[2]];
  const quats = new Float32Array(n * nb * 4), root = new Float32Array(n * 3), reach: Record<string, number>[] = [];
  const smooth = (a: number, b: number, x: number) => { const u = Math.min(1, Math.max(0, (x - a) / (b - a))); return u * u * (3 - 2 * u); };
  for (let f = 0; f < n; f++) {
    const t = f / fps, s = solvePose(skel, poseAt(keys, t), hands);
    // how much of the guard is left: all of it at the start and the end, none in between
    const w = Math.max(1 - smooth(o.blendIn[0], o.blendIn[1], t), smooth(o.blendOut[0], o.blendOut[1], t));
    for (let b = 0; b < nb; b++) quats.set(slerp(s.quats[b], g0(b), w), (f * nb + b) * 4);
    // (the root's ground position is the skeleton's at rest, as the runtime pins it; only its height moves)
    root.set([skel[0].head[0], s.root[1] + (gRoot[1] - s.root[1]) * w, skel[0].head[2]], f * 3);
    reach.push(s.reach);
  }
  return { name: o.name, fps, frames: n, loop: false, speed: 0, bones: skel.map((b) => b.name), quats, root, contact: o.contact, reach };
}

/** World positions of named bones' heads in one frame of a clip (for checking a keyed clip as it is built). */
export function clipPoints(skel: Skeleton, c: Clip, f: number, names: string[]) {
  const P = forward(skel, c.quats, c.root, f);
  return Object.fromEntries(names.map((nm) => [nm, P[skel.findIndex((b) => b.name === nm)]]));
}

/* ---------------- the crush: the punch finisher's blow to a man on the ground ---------------- */
// From the fight guard the hero steps in with the left foot and drops onto the right knee (toes tucked), the right fist
// going up overhead as he goes down: the elbow high and the right shoulder turned back, the left hand out toward the
// man. Then the fist is driven straight down, the chest folding over it and the right shoulder coming through, onto a
// head on the ground: at contact the knuckles are 0.21 m over the floor, 0.56 m ahead of the body's spot and 0.26 m to
// its right (where the head of a man the punch finisher's haymaker drops comes to rest, measured in Chrome). He holds it
// there a beat, then rises back toward the guard. Written for the male body (head tip 1.845 m); the female's keys are
// scaled to her. Its root never leaves the spot: the runtime moves the body (the finisher keeps him at the distance
// that puts the fist on the head).
const CRUSH_CONTACT = 0.56;
const guardish: Pose = {
  rootY: 0.9, hips: [0, 0, 0], torso: [0.1, 0, 0], neck: [0, 0],
  footL: { at: [0.12, 0.076, -0.15], pole: [0.2, 0.6, 1.5], pitch: 0 }, footR: { at: [-0.25, 0.076, 0.15], pole: [-0.3, 0.6, 1.5], pitch: 0 },
  handL: { at: [0.14, 1.52, 0.32], pole: [0.6, 0.6, -0.2] }, handR: { at: [-0.17, 1.55, 0.26], pole: [-0.6, 0.6, -0.2] },
};
const step: Pose = {
  rootY: 0.72, turn: 0.05, hips: [0.1, -0.08, 0], torso: [0.1, -0.35, -0.08], neck: [0.2, 0.3],
  footL: { at: [0.15, 0.2, 0.2], pole: [0.2, 1.0, 1.5], pitch: 0 }, footR: { at: [-0.14, 0.12, -0.35], pole: [-0.13, -0.6, 0.6], pitch: 0.4 },
  handL: { at: [0.16, 1.2, 0.38], pole: [0.7, 0.6, 0] }, handR: { at: [-0.24, 1.6, -0.1], pole: [-0.7, 1.3, 0.1] }, shoulder: [0, 0.25],
};
const kneel: Pose = {
  rootY: 0.52, turn: 0.1, hips: [0.05, -0.15, 0], torso: [-0.15, -0.55, -0.15], neck: [0.4, 0.5],
  footL: { at: [0.3, 0.076, 0.24], pole: [0.7, 1.0, 1.2], pitch: 0 }, footR: { at: [-0.13, 0.19, -0.59], pole: [-0.13, -1.0, 0.3], pitch: 0.87 },
  handL: { at: [0.18, 0.8, 0.5], pole: [0.7, 0.6, 0.1] }, handR: { at: [-0.18, 1.52, -0.25], pole: [-0.7, 1.3, 0.1] }, shoulder: [0, 0.35],
};
const apex: Pose = { ...kneel, torso: [-0.22, -0.62, -0.17], handR: { at: [-0.17, 1.5, -0.32], pole: [-0.7, 1.3, 0.1] } };
const strike: Pose = {
  rootY: 0.5, turn: 0, hips: [0.25, -0.05, 0], torso: [0.8, 0.2, 0.1], neck: [0.2, -0.1],
  footL: kneel.footL, footR: kneel.footR,
  handL: { at: [0.25, 0.62, 0.05], pole: [0.7, 0.6, -0.4] }, handR: { at: [-0.3, 0.3, 0.5], pole: [-0.7, 1.2, -0.2] }, shoulder: [0, 0],
};
const hold: Pose = { ...strike, torso: [0.76, 0.18, 0.08], handR: { at: [-0.3, 0.32, 0.49], pole: [-0.7, 1.2, -0.2] } };
const rise: Pose = {
  rootY: 0.8, turn: 0, hips: [0.1, -0.05, 0], torso: [0.3, 0.05, 0], neck: [0.1, 0],
  footL: { at: [0.22, 0.076, 0.2], pole: [0.4, 0.8, 1.5], pitch: 0 }, footR: { at: [-0.18, 0.1, -0.2], pole: [-0.2, 0.4, 1.5], pitch: 0.2 },
  handL: { at: [0.16, 1.3, 0.35], pole: [0.6, 0.6, -0.2] }, handR: { at: [-0.18, 1.3, 0.3], pole: [-0.6, 0.6, -0.2] },
};
export const CRUSH = {
  name: 'crush', ref: 1.84465, contact: CRUSH_CONTACT, blendIn: [0, 0.16] as [number, number], blendOut: [1.1, 1.45] as [number, number],
  keys: [
    { t: 0, pose: guardish }, { t: 0.14, pose: step }, { t: 0.32, ease: 'out', pose: kneel }, { t: 0.42, pose: apex },
    { t: CRUSH_CONTACT, ease: 'in', pose: strike }, { t: 0.82, pose: hold }, { t: 1.15, pose: rise }, { t: 1.45, pose: guardish },
  ] as Key[],
};
