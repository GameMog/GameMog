/**
 * Motion from glTF animation libraries (Quaternius's Universal Animation
 * Library 1 and 2, CC0), retargeted onto a library skeleton.
 *
 * The same idea as the CMU retarget in mocap.ts, with glTF's own rest pose:
 * each source bone's motion is taken as a rotation away from its rest pose in
 * world space, and applied to the target bone after lining the target's rest
 * direction up with the source's. Different rest poses (Quaternius stands in
 * a T-pose, MakeHuman in an A-pose) and different bone rolls fall out of that,
 * and the twist the source puts on a forearm or a wrist carries over, which is
 * what keeps a sword the right way up in the hand. Fingers are mapped joint for
 * joint, so a hand closes on a grip.
 */
import { readBin } from './lib.ts';
import { arc, closeLoop, cross, forward, norm, qinv, qmul, qrot, slerp, type Clip, type Q, type Skeleton, type V3 } from './mocap.ts';

type Gltf = { json: any; bin: Buffer };
const cache = new Map<string, Gltf>();
function load(path: string): Gltf {
  if (cache.has(path)) return cache.get(path)!;
  const b = readBin(path);
  if (b.readUInt32LE(0) !== 0x46546c67) throw new Error(`${path} is not a GLB`);
  const jl = b.readUInt32LE(12), json = JSON.parse(b.subarray(20, 20 + jl).toString('utf8'));
  const bl = b.readUInt32LE(20 + jl), bin = b.subarray(28 + jl, 28 + jl + bl);
  const g = { json, bin }; cache.set(path, g); return g;
}
const COMP: Record<number, [number, (dv: DataView, o: number) => number]> = {
  5126: [4, (dv, o) => dv.getFloat32(o, true)],
  5123: [2, (dv, o) => dv.getUint16(o, true) / 65535],
  5122: [2, (dv, o) => Math.max(dv.getInt16(o, true) / 32767, -1)],
  5121: [1, (dv, o) => dv.getUint8(o) / 255],
  5120: [1, (dv, o) => Math.max(dv.getInt8(o) / 127, -1)],
};
const WIDTH: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
function accessor(g: Gltf, i: number): Float32Array {
  const a = g.json.accessors[i], v = g.json.bufferViews[a.bufferView], [size, get] = COMP[a.componentType], w = WIDTH[a.type];
  const stride = v.byteStride || size * w, base = (v.byteOffset || 0) + (a.byteOffset || 0);
  const dv = new DataView(g.bin.buffer, g.bin.byteOffset, g.bin.byteLength), out = new Float32Array(a.count * w);
  for (let k = 0; k < a.count; k++) for (let c = 0; c < w; c++) out[k * w + c] = get(dv, base + k * stride + c * size);
  return out;
}

type Track = { times: Float32Array; values: Float32Array; width: number; interp: string };
function sampleTrack(t: Track, time: number): number[] {
  const n = t.times.length, W = t.width, cubic = t.interp === 'CUBICSPLINE';
  const val = (k: number) => { const o = cubic ? (k * 3 + 1) * W : k * W; return Array.from(t.values.subarray(o, o + W)); };
  if (time <= t.times[0]) return val(0);
  if (time >= t.times[n - 1]) return val(n - 1);
  let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (t.times[m] <= time) lo = m; else hi = m; }
  const u = (time - t.times[lo]) / (t.times[hi] - t.times[lo]), a = val(lo), b = val(hi);
  if (t.interp === 'STEP') return a;
  if (W === 4) return slerp(a as Q, b as Q, u);
  return a.map((x, i) => x + (b[i] - x) * u);
}

/** The source's skeleton at rest and in every frame of one animation, in world space. */
function source(path: string, clip: string) {
  const g = load(path), J = g.json, nodes = J.nodes as any[];
  const parent = new Array(nodes.length).fill(-1);
  nodes.forEach((n, i) => (n.children || []).forEach((c: number) => { parent[c] = i; }));
  const byName = new Map<string, number>(); nodes.forEach((n, i) => { if (n.name) byName.set(n.name, i); });
  const anim = (J.animations as any[]).find((a) => a.name === clip);
  if (!anim) throw new Error(`${path}: no animation "${clip}"`);
  const tracks = new Map<string, Track>();
  let duration = 0;
  for (const ch of anim.channels) {
    const s = anim.samplers[ch.sampler], times = accessor(g, s.input), values = accessor(g, s.output);
    tracks.set(`${ch.target.node}:${ch.target.path}`, { times, values, width: ch.target.path === 'rotation' ? 4 : 3, interp: s.interpolation || 'LINEAR' });
    duration = Math.max(duration, times[times.length - 1]);
  }
  const order: number[] = []; const seen = new Set<number>();
  const visit = (i: number) => { if (seen.has(i)) return; if (parent[i] >= 0) visit(parent[i]); seen.add(i); order.push(i); };
  nodes.forEach((_, i) => visit(i));
  function pose(time: number | null) {
    const q: Q[] = [], p: V3[] = [], s: number[] = [];
    for (const i of order) {
      const n = nodes[i];
      const lr = (time !== null && tracks.get(`${i}:rotation`) ? sampleTrack(tracks.get(`${i}:rotation`)!, time) : n.rotation || [0, 0, 0, 1]) as Q;
      const lt = (time !== null && tracks.get(`${i}:translation`) ? sampleTrack(tracks.get(`${i}:translation`)!, time) : n.translation || [0, 0, 0]) as V3;
      const ls = n.scale ? (n.scale[0] + n.scale[1] + n.scale[2]) / 3 : 1;
      const pi = parent[i];
      if (pi < 0) { q[i] = lr; p[i] = lt; s[i] = ls; continue; }
      const off = qrot(q[pi], [lt[0] * s[pi], lt[1] * s[pi], lt[2] * s[pi]]);
      q[i] = qmul(q[pi], lr); p[i] = [p[pi][0] + off[0], p[pi][1] + off[1], p[pi][2] + off[2]]; s[i] = s[pi] * ls;
    }
    return { q, p };
  }
  return { byName, duration, rest: pose(null), pose };
}

// which Quaternius bone drives each library bone
const MAP: Record<string, string> = {
  root: 'pelvis', spine05: 'spine_01', spine04: 'spine_01', spine03: 'spine_02', spine02: 'spine_03', spine01: 'spine_03',
  neck01: 'neck_01', neck02: 'neck_01', neck03: 'neck_01', head: 'Head',
};
const FINGER = ['thumb', 'index', 'middle', 'ring', 'pinky'];
for (const [s, c] of [['L', 'l'], ['R', 'r']]) {
  Object.assign(MAP, {
    [`clavicle.${s}`]: `clavicle_${c}`, [`shoulder01.${s}`]: `clavicle_${c}`, [`upperarm01.${s}`]: `upperarm_${c}`, [`upperarm02.${s}`]: `upperarm_${c}`,
    [`lowerarm01.${s}`]: `lowerarm_${c}`, [`lowerarm02.${s}`]: `lowerarm_${c}`, [`wrist.${s}`]: `hand_${c}`,
    [`upperleg01.${s}`]: `thigh_${c}`, [`upperleg02.${s}`]: `thigh_${c}`, [`lowerleg01.${s}`]: `calf_${c}`, [`lowerleg02.${s}`]: `calf_${c}`, [`foot.${s}`]: `foot_${c}`,
  });
  FINGER.forEach((f, k) => { for (let j = 1; j <= 3; j++) MAP[`finger${k + 1}-${j}.${s}`] = `${f}_0${j}_${c}`; });
}
// which Spiderbench bone drives each library bone (its hero's rig, built in Blender like Quaternius's: every bone along
// its own +y; the forearm's twist bone carries the turn of the wrist)
const SBMAP: Record<string, string> = {
  root: 'hips', spine05: 'spine', spine04: 'spine', spine03: 'spine1', spine02: 'spine2', spine01: 'spine2',
  neck01: 'neck', neck02: 'neck', neck03: 'neck', head: 'head',
};
for (const s of ['L', 'R']) {
  Object.assign(SBMAP, {
    [`clavicle.${s}`]: `shoulder.${s}`, [`shoulder01.${s}`]: `shoulder.${s}`, [`upperarm01.${s}`]: `upperArm.${s}`, [`upperarm02.${s}`]: `upperArm.${s}`,
    [`lowerarm01.${s}`]: `forearm.${s}`, [`lowerarm02.${s}`]: `forearmTwist.${s}`, [`wrist.${s}`]: `hand.${s}`,
    [`upperleg01.${s}`]: `thigh.${s}`, [`upperleg02.${s}`]: `thigh.${s}`, [`lowerleg01.${s}`]: `shin.${s}`, [`lowerleg02.${s}`]: `shin.${s}`, [`foot.${s}`]: `foot.${s}`,
  });
  FINGER.forEach((f, k) => { for (let j = 1; j <= 3; j++) SBMAP[`finger${k + 1}-${j}.${s}`] = `${f}${j}.${s}`; });
}
// faceSource: the rig already faces +Z (its left thigh at +X), and its clips start in a bladed fight stance; turning
// each clip till the hips face +Z put every blow 15 to 28 degrees off the way the body faces
type Rig = { map: Record<string, string>; pelvis: string; thighL: string; thighR: string; footL: string; faceSource?: boolean };
const RIGS: Record<'quaternius' | 'spiderbench', Rig> = {
  quaternius: { map: MAP, pelvis: 'pelvis', thighL: 'thigh_l', thighR: 'thigh_r', footL: 'foot_l' },
  spiderbench: { map: SBMAP, pelvis: 'hips', thighL: 'thigh.L', thighR: 'thigh.R', footL: 'foot.L', faceSource: true },
};
export function sourcePose(path: string, clip: string) { return source(path, clip); }

export function retargetGltf(skel: Skeleton, path: string, clip: string, opts: { name: string; loop?: boolean; fps?: number; start?: number; end?: number; anchor?: 'start' | 'mean'; rig?: 'quaternius' | 'spiderbench'; contact?: number; inPlace?: boolean }): Clip {
  const S = source(path, clip), fps = opts.fps ?? 30, R = RIGS[opts.rig ?? 'quaternius'], MAP = R.map;
  const idx = (n: string) => { const i = S.byName.get(n); if (i === undefined) throw new Error(`${path}: no bone ${n}`); return i; };
  // each source bone points along its own +y at rest (Quaternius's rig, like
  // Blender's); the head in particular stands straighter than its neck, and
  // lining it up with the neck bowed every head by eleven degrees
  const restDir = (n: string): V3 => norm(qrot(S.rest.q[idx(n)], [0, 1, 0]));
  const align = skel.map((b) => {
    const s = MAP[b.name]; if (!s || b.name === 'root') return [0, 0, 0, 1] as Q;
    return arc(norm([b.tail[0] - b.head[0], b.tail[1] - b.head[1], b.tail[2] - b.head[2]]), restDir(s));
  });
  const restInv = new Map<string, Q>(); for (const s of new Set(Object.values(MAP))) restInv.set(s, qinv(S.rest.q[idx(s)]));

  const t0 = opts.start ?? 0, t1 = Math.min(opts.end ?? S.duration, S.duration), loop = !!opts.loop;
  const n = Math.max(2, Math.round((t1 - t0) * fps) + (loop ? 0 : 1));
  const first = S.pose(t0);
  // face +Z: the hips' own forward in the first frame
  const l = first.p[idx(R.thighL)], r = first.p[idx(R.thighR)];
  const heading: Q = R.faceSource ? [0, 0, 0, 1] : arc(norm(cross([l[0] - r[0], 0, l[2] - r[2]], [0, 1, 0])), [0, 0, 1]);
  const J = (nm: string) => skel.find((b) => b.name === nm)!;
  const tLeg = J('upperleg01.L').head[1] - J('foot.L').head[1];
  const sLeg = S.rest.p[idx(R.thighL)][1] - S.rest.p[idx(R.footL)][1];
  const k = tLeg / sLeg;

  const bones = skel.map((b) => b.name), nb = bones.length, m = loop ? n + 1 : n;
  const quats = new Float32Array(m * nb * 4), root = new Float32Array(m * 3), world: Q[] = new Array(nb), rootRest = skel[0].head;
  const p0 = first.p[idx(R.pelvis)];
  for (let f = 0; f < m; f++) {
    const time = t0 + (loop ? f / n : f / (n - 1)) * (t1 - t0);
    const P = S.pose(loop && f === n ? t0 : time);
    skel.forEach((b, bi) => {
      const s = MAP[b.name];
      world[bi] = s ? qmul(qmul(heading, qmul(P.q[idx(s)], restInv.get(s)!)), align[bi]) : qmul(world[b.parent], [0, 0, 0, 1]);
      const local = b.parent < 0 ? world[bi] : qmul(qinv(world[b.parent]), world[bi]);
      quats.set(local, (f * nb + bi) * 4);
    });
    const hp = P.p[idx(R.pelvis)], rel = qrot(heading, [hp[0] - p0[0], hp[1], hp[2] - p0[2]]);
    root.set([rel[0] * k + rootRest[0], rel[1] * k, rel[2] * k + rootRest[2]], f * 3);
  }
  if (opts.anchor === 'mean') {
    let cx = 0, cz = 0; for (let f = 0; f < m; f++) { cx += root[f * 3] / m; cz += root[f * 3 + 2] / m; }
    for (let f = 0; f < m; f++) { root[f * 3] += rootRest[0] - cx; root[f * 3 + 2] += rootRest[2] - cz; }
  }
  // in place: the runtime moves the body itself (a dash, a lunge), so the clip keeps only its rise and fall
  if (opts.inPlace) for (let f = 0; f < m; f++) { root[f * 3] = rootRest[0]; root[f * 3 + 2] = rootRest[2]; }
  if (loop) closeLoop(quats, root, n, nb);
  // the lowest the feet go over the clip is standing height
  const ankle = J('foot.L').head[1];
  let low = Infinity;
  for (let f = 0; f < n; f++) { const hp = forward(skel, quats, root, f); for (const side of ['foot.L', 'foot.R']) low = Math.min(low, hp[bones.indexOf(side)][1]); }
  for (let f = 0; f < m; f++) root[f * 3 + 1] += ankle - low;
  // the moment of contact: where the sword hand moves fastest, so the runtime
  // can land a cut on it whatever speed it plays the clip at
  let contact = 0, fastest = 0, prev: V3 | null = null;
  for (let f = 0; f < n; f++) {
    const w = forward(skel, quats, root, f)[bones.indexOf('wrist.R')];
    if (prev) { const sp = Math.hypot(w[0] - prev[0], w[1] - prev[1], w[2] - prev[2]); if (sp > fastest) { fastest = sp; contact = (f - 0.5) / fps; } }
    prev = w;
  }
  // a source that knows its own moment of contact (a kick lands with a foot, not the sword hand) says so
  if (opts.contact != null) contact = Math.max(0, opts.contact - t0);
  return { name: opts.name, fps, frames: n, loop, speed: 0, bones, quats: quats.slice(0, n * nb * 4), root: root.slice(0, n * 3), contact: +contact.toFixed(3) };
}
