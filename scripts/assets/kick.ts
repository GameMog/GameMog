/**
 * A football kick, measured on a clip already retargeted onto a library skeleton (SHOOTOUT), and cut ready for the
 * game: which foot strikes, the moment of contact, the plant, every stance of each foot, the strike point, the
 * directions of the swing, of the foot's inside face and of the shot, the foot's pitch, and where the run-up starts.
 *
 * It works in library space (the skeleton's own bones, after the retarget), so it holds for any source. The thresholds
 * are the ones the SHOOTOUT scans proved on the CMU kicks (m1/motion-tools/kickscan.ts, m1/inventory.md section 3.1):
 * - the strike point is the instep, 60% of the way from the ankle to the ball of the foot and half a foot's width to
 *   its inside (the library foot bone ends at mid-foot and there are no toe bones);
 * - the kicking foot is the one whose strike point is fastest while under 0.45 m;
 * - contact is the strike point's closest approach to a ball modelled beside the plant foot (the plant ankle at the
 *   speed peak, 0.25 m toward the kicking side and 0.05 m ahead, at ball height), which falls a few frames after the
 *   speed peak, as a real ball sits beside the plant foot;
 * - a foot comes down when its lowest sole point (heel, ball or toe) is within 5 cm of its floor and moving slower than
 *   1.2 m/s, and stays down while that point is slow and within 9 cm (on the library body a planted foot rides up to
 *   7 cm over the floor at times, pivoting on its toe or as the knee bends over it); a flicker out of contact that leaves the foot where it was is the same stance; a
 *   re-touch of the same foot within 0.2 m of its last stance is a regrip, not a step; the run-up starts when the hips
 *   first pass 0.3 m/s.
 *
 * Conventions (the runtime's): metres, Y up, the clip's +Z ahead and +X its left. A yaw is atan2(x, z): 0 along +Z,
 * positive toward +X. Times are seconds from the clip's first frame.
 */
import { forwardQ, qaxis, qmul, qrot, retargetClip, type Clip, type Q, type Skeleton, type V3 } from './mocap.ts';

const BALL_R = 0.11;
const r3 = (v: number) => +v.toFixed(3), r4 = (v: number) => +v.toFixed(4);
const yawOf = (v: V3) => Math.atan2(v[0], v[2]);
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

type Side = 'L' | 'R';
export type Stance = [Side, number, number]; // foot, down (touchdown), up (the first moment it is off the floor again)
export type KickMeta = {
  v: 1; foot: Side; fps: number;
  start: number; run: number; plant: number; contact: number; lift: number; end: number;
  frames: { run: number; plant: number; contact: number; lift: number; last: number };
  stance: Stance[];
  steps: [Side, number, number, number][]; // foot, touchdown time, ankle x, z at touchdown (the run-up's, to the plant)
  strides: number[]; lastStride: number;
  strike: V3; plantAt: [number, number];
  shotYaw: number; swingYaw: number; swingPeakYaw: number; faceYaw: number; footYaw: number; runYaw: number; footPitch: number; footPitchStand: number;
  mark: [number, number]; markYaw: number; markFeet: [[number, number], [number, number]];
  speed: { contact: number; peak: number; peakT: number };
};

/** Every frame's feet, strike points and root, in the clip's space. */
function frames(skel: Skeleton, clip: Clip) {
  const B = (n: string) => { const i = skel.findIndex((b) => b.name === n); if (i < 0) throw new Error(`no bone ${n}`); return i; };
  const foot = { L: B('foot.L'), R: B('foot.R') }, thigh = { L: B('upperleg01.L'), R: B('upperleg01.R') };
  const ankleH = skel[foot.L].head[1], kf = ankleH / 0.0762; // the male's ankle height is 0.0762 m
  const restDir = (s: Side): V3 => { const b = skel[foot[s]]; return [b.tail[0] - b.head[0], b.tail[1] - b.head[1], b.tail[2] - b.head[2]]; };
  const medial = (s: Side): V3 => [s === 'L' ? -1 : 1, 0, 0];
  const off = (s: Side) => {
    const d = restDir(s), m = medial(s);
    return {
      strike: [1.2 * d[0] + 0.035 * kf * m[0], 1.2 * d[1], 1.2 * d[2]] as V3,
      sole: [[0, -ankleH, -0.05 * kf], [0, -ankleH + 0.012 * kf, 0.10 * kf], [0, -ankleH + 0.008 * kf, 0.18 * kf]] as V3[],
    };
  };
  const O = { L: off('L'), R: off('R') };
  const at = (p: V3, q: Q, o: V3): V3 => { const r = qrot(q, o); return [p[0] + r[0], p[1] + r[1], p[2] + r[2]]; };
  const out = [];
  for (let f = 0; f < clip.frames; f++) {
    const { p, q } = forwardQ(skel, clip.quats, clip.root, f);
    const side = (s: Side) => ({ ankle: p[foot[s]], q: q[foot[s]], strike: at(p[foot[s]], q[foot[s]], O[s].strike), sole: O[s].sole.map((o) => at(p[foot[s]], q[foot[s]], o)) });
    const l = p[thigh.L], r = p[thigh.R];
    out.push({ L: side('L'), R: side('R'), root: p[0], hips: [-(l[2] - r[2]), 0, l[0] - r[0]] as V3 }); // hips forward: (left - right) x up
  }
  return { F: out, kf, restDir, medial };
}

/**
 * Measure a kick. `contactFrame` forces the moment of contact (an output frame of this clip) instead of finding it.
 */
export function kickMeta(skel: Skeleton, clip: Clip, o: { contactFrame?: number } = {}): KickMeta {
  const { F, kf, restDir, medial } = frames(skel, clip), n = F.length, fps = clip.fps, H = 1 / fps;
  const v = (pt: (i: number) => V3, i: number): V3 => { const a = pt(Math.max(0, i - 1)), b = pt(Math.min(n - 1, i + 1)), dt = (Math.min(n - 1, i + 1) - Math.max(0, i - 1)) * H; return [(b[0] - a[0]) / dt, (b[1] - a[1]) / dt, (b[2] - a[2]) / dt]; };
  const len = (a: V3) => Math.hypot(a[0], a[1], a[2]), hlen = (a: V3) => Math.hypot(a[0], a[2]);
  // the floor each foot stands on: low among its own slow frames (a frame's rolled or pitched foot can dip a sole point
  // through the floor, so not the lowest)
  const lowSole = (i: number, s: Side) => { let b = 0; const so = F[i][s].sole; for (let k = 1; k < so.length; k++) if (so[k][1] < so[b][1]) b = k; return b; };
  const floor = { L: 0, R: 0 };
  for (const s of ['L', 'R'] as Side[]) {
    const ys: number[] = [];
    for (let i = 0; i < n; i++) { const k = lowSole(i, s); if (len(v((j) => F[j][s].sole[k], i)) < 0.5) ys.push(F[i][s].sole[k][1]); }
    ys.sort((p, q) => p - q); floor[s] = ys.length ? ys[Math.floor(ys.length * 0.1)] : 0;
  }
  // the kicking foot and its speed peak
  let pk = -1, peak = 0, foot: Side = 'R';
  for (const s of ['L', 'R'] as Side[]) for (let i = 1; i < n - 1; i++) {
    const sp = len(v((j) => F[j][s].strike, i));
    if (sp > peak && F[i][s].strike[1] - floor[s] < 0.45) { peak = sp; pk = i; foot = s; }
  }
  const plantSide: Side = foot === 'R' ? 'L' : 'R';
  // each foot's stances: down while the lowest sole point is near the floor and slow
  // (a foot stays down to 9 cm while slow: the retarget floats a planted foot that much at times, pivoting on its toe)
  const down = (i: number, s: Side, was: boolean) => { const k = lowSole(i, s), y = F[i][s].sole[k][1]; return y < floor[s] + (was ? 0.09 : 0.05) * kf && len(v((j) => F[j][s].sole[k], i)) < 1.2; };
  const stances: { s: Side; d: number; u: number }[] = [];
  for (const s of ['L', 'R'] as Side[]) {
    let d = -1;
    const runs: [number, number][] = [];
    for (let i = 0; i <= n; i++) { const on = i < n && down(i, s, d >= 0); if (on && d < 0) d = i; if (!on && d >= 0) { runs.push([d, i - 1]); d = -1; } }
    // a flicker out of contact (up to 0.15 s, the foot's lowest point moved no more than 12 cm) is one stance
    const merged: [number, number][] = [];
    const lowAt = (i: number) => F[i][s].sole[lowSole(i, s)];
    for (const r of runs) {
      const last = merged[merged.length - 1];
      if (last && (r[0] - last[1]) * H <= 0.15 && Math.hypot(lowAt(r[0])[0] - lowAt(last[1])[0], lowAt(r[0])[2] - lowAt(last[1])[2]) <= 0.12 * kf) last[1] = r[1];
      else merged.push([r[0], r[1]]);
    }
    for (const [a, b] of merged) if ((b - a + 1) * H >= 0.03) stances.push({ s, d: a, u: b });
  }
  stances.sort((p, q) => p.d - q.d || (p.s < q.s ? -1 : 1));
  const plantSt = stances.filter((t) => t.s === plantSide && t.d <= pk).pop();
  if (!plantSt) throw new Error(`${clip.name}: no plant before the kick`);
  // contact: closest approach of the strike point to a ball beside the plant foot
  let c = o.contactFrame ?? -1;
  if (c < 0) {
    const sv = v((j) => F[j][foot].strike, pk), fw = [sv[0] / hlen(sv), sv[2] / hlen(sv)], side = foot === 'R' ? [-fw[1], fw[0]] : [fw[1], -fw[0]];
    const pa = F[pk][plantSide].ankle, ball: V3 = [pa[0] + (0.25 * side[0] + 0.05 * fw[0]) * kf, BALL_R, pa[2] + (0.25 * side[1] + 0.05 * fw[1]) * kf];
    let best = Infinity;
    for (let i = Math.max(0, pk - Math.round(0.05 * fps)); i <= Math.min(n - 1, pk + Math.round(0.12 * fps)); i++) {
      const s = F[i][foot].strike, dd = Math.hypot(s[0] - ball[0], s[1] - ball[1], s[2] - ball[2]);
      if (dd < best) { best = dd; c = i; }
    }
  }
  // the run-up: from the last moment before the plant that the hips were slower than 0.3 m/s
  const w = Math.max(1, Math.round(0.05 * fps)), rootSp = (i: number) => { const a = F[Math.max(0, i - w)].root, b = F[Math.min(n - 1, i + w)].root; return Math.hypot(b[0] - a[0], b[2] - a[2]) / ((Math.min(n - 1, i + w) - Math.max(0, i - w)) * H); };
  let run = plantSt.d; while (run > 0 && rootSp(run - 1) > 0.3) run--;
  // the run-up's touchdowns, to the plant (a re-touch of the same foot within 0.2 m is a regrip, not a step)
  const steps: KickMeta['steps'] = [];
  for (const t of stances) {
    if (t.d < run || t.d > plantSt.d) continue;
    const a = F[t.d][t.s].ankle, prev = stances.filter((x) => x.s === t.s && x.d < t.d).pop();
    if (prev && Math.hypot(a[0] - F[prev.d][t.s].ankle[0], a[2] - F[prev.d][t.s].ankle[2]) < 0.2 * kf) continue;
    steps.push([t.s, r4(t.d * H), r3(a[0]), r3(a[2])]);
  }
  const strides = steps.slice(1).map((x, i) => r3(Math.hypot(x[2] - steps[i][2], x[3] - steps[i][3])));
  // at contact: the strike point, the swing, the inside face, the shot between them, the foot's yaw and pitch
  const K = F[c][foot], sw = v((j) => F[j][foot].strike, c), face = qrot(K.q, medial(foot)), fd = qrot(K.q, restDir(foot)), rd = restDir(foot);
  const u2 = (a: V3): V3 => { const l = hlen(a) || 1; return [a[0] / l, 0, a[2] / l]; };
  const su = u2(sw), fu = u2(face), shot: V3 = [su[0] + fu[0], 0, su[2] + fu[2]];
  const pitch = (d: V3) => Math.atan2(d[1], hlen(d)), spk = v((j) => F[j][foot].strike, pk);
  const ra = F[run].root, rp = F[plantSt.d].root;
  const f0 = F[0];
  return {
    v: 1, foot, fps,
    start: 0, run: r4(run * H), plant: r4(plantSt.d * H), contact: r4(c * H), lift: r4(Math.min(plantSt.u + 1, n - 1) * H), end: r4((n - 1) * H),
    frames: { run, plant: plantSt.d, contact: c, lift: plantSt.u + 1, last: n - 1 },
    stance: stances.map((t) => [t.s, r4(t.d * H), r4(Math.min(t.u + 1, n - 1) * H)] as Stance),
    steps, strides, lastStride: strides.length ? strides[strides.length - 1] : 0,
    strike: [r3(K.strike[0]), r3(K.strike[1]), r3(K.strike[2])], plantAt: [r3(F[c][plantSide].ankle[0]), r3(F[c][plantSide].ankle[2])],
    shotYaw: r4(yawOf(shot)), swingYaw: r4(yawOf(sw)), swingPeakYaw: r4(yawOf(spk)), faceYaw: r4(yawOf(face)), footYaw: r4(yawOf(fd)), runYaw: r4(yawOf([rp[0] - ra[0], 0, rp[2] - ra[2]])),
    // toe up (+), against the rest pose, whose sole is flat on the floor; and the same foot standing at the first frame
    footPitch: r4(pitch(fd) - pitch(rd)), footPitchStand: r4(pitch(qrot(F[0][foot].q, rd)) - pitch(rd)),
    mark: [r3(f0.root[0]), r3(f0.root[2])], markYaw: r4(yawOf(f0.hips)), markFeet: [[r3(f0.L.ankle[0]), r3(f0.L.ankle[2])], [r3(f0.R.ankle[0]), r3(f0.R.ankle[2])]],
    speed: { contact: r3(len(sw)), peak: r3(peak), peakT: r4(pk * H) },
  };
}

/** Turn a whole clip about the upright through the origin (a positive angle turns +Z toward +X), then move it. */
export function placeClip(clip: Clip, yaw: number, dx = 0, dz = 0): Clip {
  const q = qaxis([0, 1, 0], yaw), nb = clip.bones.length, quats = new Float32Array(clip.quats), root = new Float32Array(clip.root);
  for (let f = 0; f < clip.frames; f++) {
    const o = f * nb * 4, r = qmul(q, Array.from(quats.subarray(o, o + 4)) as Q);
    quats.set(r, o);
    const p = qrot(q, [root[f * 3], root[f * 3 + 1], root[f * 3 + 2]]);
    root.set([p[0] + dx, p[1], p[2] + dz], f * 3);
  }
  return { ...clip, quats, root };
}

/**
 * A CMU kick cut for the game: the travel kept; started `lead` seconds before the run-up (the standing gather before it
 * taken off); contact on an output frame; turned so the shot (the bisector of the swing and the foot's inside face at
 * contact) runs along +Z; moved so the strike point at contact is at the origin. `at` forces the source frames of
 * contact and of the run-up's start (so every body cuts one capture the same way).
 */
export function kickCut(skel: Skeleton, src: { asf: string; amc: string }, o: { name: string; from: number; to: number; srcFps?: number; fps?: number; lead?: number; at?: { contact: number; run: number } }) {
  const FPS = o.srcFps ?? 120, fps = o.fps ?? 60, step = FPS / fps, lead = o.lead ?? 0.15;
  if (!Number.isInteger(step)) throw new Error(`${o.name}: ${FPS} fps does not divide into ${fps}`);
  const cut = (a: number, z: number, rate: number) => retargetClip(skel, src, { name: o.name, kind: 'once', start: a, end: z, fps: rate, srcFps: FPS, keepTravel: true });
  // where contact and the run-up fall in the capture (measured at the source's own rate)
  const a0 = Math.round(o.from * FPS), z0 = Math.round(o.to * FPS);
  let at = o.at;
  if (!at) { const m0 = kickMeta(skel, cut(a0, z0, FPS)); at = { contact: a0 + m0.frames.contact, run: a0 + m0.frames.run }; }
  // the window: from `lead` before the run-up, whole output steps to contact and to the end
  const a = at.contact - step * Math.ceil((at.contact - (at.run - Math.round(lead * FPS))) / step), z = a + step * Math.floor((z0 - a) / step);
  // measured at the source rate (same window, so the same heading), then turned and moved; the game's clip is sampled
  // on every step-th of those frames, so its frames are exactly these
  const fine = cut(a, z, FPS), m1 = kickMeta(skel, fine, { contactFrame: at.contact - a });
  const s1 = qrot(qaxis([0, 1, 0], -m1.shotYaw), m1.strike);
  const place = (c: Clip) => placeClip(c, -m1.shotYaw, -s1[0], -s1[2]);
  const fineP = place(fine), meta = kickMeta(skel, fineP, { contactFrame: at.contact - a });
  const coarse = retargetClip(skel, src, { name: o.name, kind: 'once', start: a, end: z, fps, srcFps: FPS, keepTravel: true, alignAt: at.contact });
  // its feet go on the floor by the lowest ankle over its own frames, which can miss the fine clip's lowest by a
  // fraction of a millimetre: stand it on the fine clip's floor
  const dy = fine.root[1] - coarse.root[1]; for (let f = 0; f < coarse.frames; f++) coarse.root[f * 3 + 1] += dy;
  const clip = place(coarse);
  // the game's frames are the fine clip's every step-th: check it
  const nb = clip.bones.length;
  if (clip.frames !== (z - a) / step + 1) throw new Error(`${o.name}: ${clip.frames} frames, expected ${(z - a) / step + 1}`);
  let worst = 0;
  for (let f = 0; f < clip.frames; f++) {
    for (let k = 0; k < 3; k++) worst = Math.max(worst, Math.abs(clip.root[f * 3 + k] - fineP.root[f * step * 3 + k]));
    for (let k = 0; k < nb * 4; k++) worst = Math.max(worst, Math.abs(clip.quats[f * nb * 4 + k] - fineP.quats[f * step * nb * 4 + k]));
  }
  if (worst > 1e-4) throw new Error(`${o.name}: the ${fps} fps clip strays ${worst} from its source frames`);
  const kick = { ...meta, fps, src: { trial: src.amc.split('/').pop()!.replace('.amc', ''), frames: [a, z] as [number, number], fps: FPS, contact: at.contact, run: at.run },
    frames: { run: r4(meta.frames.run / step), plant: r4(meta.frames.plant / step), contact: meta.frames.contact / step, lift: r4(meta.frames.lift / step), last: clip.frames - 1 } };
  if (!Number.isInteger(kick.frames.contact)) throw new Error(`${o.name}: contact is not on a frame`);
  return { clip: { ...clip, contact: meta.contact, meta: { kick } } as Clip, kick, fineMeta: meta };
}

// SHOOTOUT M1's kicks (the right foot, side-foot, a still start and three steps; m1/inventory.md section 3.3): the scans'
// window in the trial (s), and the source frames (120 fps) of contact and of the run-up's start, measured by kickMeta on
// the male body and pinned so every body cuts the capture at the same frames (11_01's contact 408 is the inventory's too)
export const KICKS: { name: string; trial: string; from: number; to: number; at: { contact: number; run: number } }[] = [
  { name: 'fbKick', trial: '11_01', from: 1.417, to: 4.483, at: { contact: 408, run: 204 } },   // the hero kick
  { name: 'fbKick2', trial: '10_06', from: 1.35, to: 4.12, at: { contact: 410, run: 194 } },    // the fallback
];

/* ---------------- the keeper's get-up (SHOOTOUT M1, critique #25) ---------------- */
// Of the get-ups to hand (CMU 139_16, 139_18, 140_01/02/08/09 and the base human's own `getup`, Quaternius LayToIdle),
// only CMU 139_18 starts on its side (the hips' left-right axis 86 degrees off level, the left side down), as a keeper
// lands from a dive; LayToIdle and 140_08/09 start on the back, 139_16 and 140_01/02 face down. Its window: from the
// first stir (0.9 s) to standing, bent forward with the hands at the thighs (4.8 s), a pose the keeper's ready crouch
// takes over from. Retargeted by the hips (rootAt), the travel kept, put on the floor frame by frame (below); turned so
// the body lies along +X (the head toward +X, the front toward +Z: a keeper who dived to
// his left), the hips at the origin. gkGetupR is its mirror (lying on the right side, the head toward -X).
export function getupCut(skel: Skeleton, src: { asf: string; amc: string }, o: { name: string; from: number; to: number; srcFps?: number; fps?: number }): Clip {
  const FPS = o.srcFps ?? 120;
  let clip = retargetClip(skel, src, { name: o.name, kind: 'once', start: Math.round(o.from * FPS), end: Math.round(o.to * FPS), fps: o.fps ?? 30, srcFps: FPS, keepTravel: true, rootAt: 'hips' });
  // on the floor every frame: whatever touches it (a sole, a knee, a hand, an elbow, a hip, a shoulder, the head; each
  // joint with the flesh around it) is lowered or raised onto it, the correction smoothed over 5 frames. The capture's
  // body is always on the floor somewhere while it gets up; one shift of the whole clip (the lowest-ankle rule) leaves
  // the retarget lying on the floor but standing 9 cm above it, or the hands 11 cm into it as they push up
  const B = (n: string) => skel.findIndex((b) => b.name === n), ankleH = skel[B('foot.L')].head[1], kf = ankleH / 0.0762;
  const SOLE: V3[] = [[0, -ankleH, -0.05 * kf], [0, -ankleH + 0.012 * kf, 0.10 * kf], [0, -ankleH + 0.008 * kf, 0.18 * kf]];
  const JOINTS: [string, number][] = [];
  for (const sd of ['L', 'R']) JOINTS.push([`lowerleg01.${sd}`, 0.05], [`wrist.${sd}`, 0.035], [`lowerarm01.${sd}`, 0.04], [`upperleg01.${sd}`, 0.09], [`upperarm01.${sd}`, 0.05]);
  const corr = new Float32Array(clip.frames);
  for (let f = 0; f < clip.frames; f++) {
    const { p, q } = forwardQ(skel, clip.quats, clip.root, f);
    let low = Infinity;
    for (const sd of ['L', 'R']) { const i = B(`foot.${sd}`); for (const o of SOLE) low = Math.min(low, p[i][1] + qrot(q[i], o)[1]); }
    for (const [n, r] of JOINTS) low = Math.min(low, p[B(n)][1] - r * kf);
    const hd = skel[B('head')], hm = qrot(q[B('head')], [(hd.tail[0] - hd.head[0]) / 2, (hd.tail[1] - hd.head[1]) / 2, (hd.tail[2] - hd.head[2]) / 2]);
    low = Math.min(low, p[B('head')][1] + hm[1] - 0.09 * kf);
    corr[f] = -low;
  }
  const root = new Float32Array(clip.root);
  for (let f = 0; f < clip.frames; f++) { let sum = 0, c = 0; for (let j = Math.max(0, f - 2); j <= Math.min(clip.frames - 1, f + 2); j++) { sum += corr[j]; c++; } root[f * 3 + 1] += sum / c; }
  clip = { ...clip, root };
  const at = (f: number) => forwardQ(skel, clip.quats, clip.root, f).p;
  // lie along +X: the spine (hips to neck) at the first frame, turned onto +X; the hips onto the origin
  const p0 = at(0), sp = [p0[B('neck01')][0] - p0[0][0], p0[B('neck01')][2] - p0[0][2]];
  const yaw = Math.PI / 2 - Math.atan2(sp[0], sp[1]);
  const q = qaxis([0, 1, 0], yaw), r0 = qrot(q, p0[0]);
  return placeClip(clip, yaw, -r0[0], -r0[2]);
}
export const GETUP = { trial: '139_18', from: 0.9, to: 4.8 };
