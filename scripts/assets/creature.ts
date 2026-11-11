/**
 * A creature for the library, from one of Patch's anymove GLBs (CC0; approved by the owner 10 Nov 2026): a
 * textured, rigged and animated animal or monster, its mesh and textures cut to a browser game's budget.
 *
 * - The mesh: its triangles cut by meshoptimizer to BUDGET (from about 58,000), every vertex keeping its skin
 *   weights (four bones a vertex, as published).
 * - The textures: the colour map at 1024 px (and 512 for phones), the normal map at 1024 and the packed
 *   metal-roughness map at 512, from the 4K originals.
 * - The skeleton: each bone's rest pose and its inverse bind matrix, as published.
 * - The motion: every clip but the *_Root copies, sampled at its own rate (24 fps): every bone's rotation, and the
 *   position of the bones that move (the root). The *_Root copies are the same walk and run travelling as they were
 *   captured: how far the root goes in one is the creature's pace at that gait, so the runtime matches its stride
 *   to its speed, and which way it goes is its forward.
 *
 * Output: creature.bin.z (deflated, its layout in asset.json) and four JPEGs.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MeshoptSimplifier } from 'meshoptimizer';
import { CACHE, Packer } from './lib.ts';

export const BUDGET = 12000;

// the runtime's moves (lib/runtime/creature.js: a person's state, as a creature takes it) to each creature's clips
type Moves = { idle?: string; walk?: string; run?: string; strike?: string; hit?: string; jump?: string; special?: string };
export type CreatureDef = { id: string; file: string; title: string; plan: 'biped' | 'beast'; what: string; moves: Moves };
export const CREATURES: CreatureDef[] = [
  { id: 'creature-horse', file: 'horse.glb', title: 'Horse', plan: 'beast', what: 'A bay horse with black legs and a roached mane, no tack, about 2.4 m tall at the head and 2.4 m long; its run is a trot',
    moves: { idle: 'Idle', walk: 'Walk', run: 'Run', strike: 'Attack', jump: 'Jump' } },
  { id: 'creature-trex', file: 'trex.glb', title: 'Tyrannosaurus rex', plan: 'beast', what: 'A Tyrannosaurus rex with olive-brown scaly skin and a paler belly, about 5.8 m tall and 12 m long',
    moves: { idle: 'Idle', walk: 'Walk', run: 'Run', strike: 'Attack', hit: 'Hit', jump: 'Jump', special: 'Roar' } },
  { id: 'creature-knight', file: 'knight.glb', title: 'Armoured knight', plan: 'biped', what: 'A medieval knight in full steel plate with a closed visor and a mail skirt, 1.85 m tall, unarmed',
    moves: { idle: 'Idle', walk: 'Walk', run: 'Run', strike: 'Attack', hit: 'Hit', jump: 'Jump', special: 'Kick' } },
  { id: 'creature-ogre', file: 'ogre.glb', title: 'Ogre', plan: 'biped', what: 'A huge green-grey ogre with a big belly, small tusks and a loincloth, about 2.8 m tall',
    moves: { idle: 'Idle', walk: 'Walk', run: 'Run', strike: 'Attack', hit: 'Hit', special: 'GroundSlam' } },
  { id: 'creature-ape', file: 'ape.glb', title: 'Giant ape', plan: 'beast', what: 'A giant silverback ape with dark grey fur, knuckle-walking, about 2.4 m tall; it walks, never runs (a run is its walk, quicker)',
    moves: { idle: 'Idle', walk: 'Walk', strike: 'Jump', hit: 'Hit', jump: 'Jump', special: 'ChestBeat' } },
  { id: 'creature-centaur', file: 'centaur.glb', title: 'Centaur', plan: 'beast', what: "A centaur: a chestnut horse's body with a bearded man's bare torso, about 2.4 m tall",
    moves: { idle: 'Idle', walk: 'Walk', run: 'Run', strike: 'Attack', hit: 'Hit', jump: 'Jump', special: 'Rear' } },
  { id: 'creature-mech', file: 'mech.glb', title: 'Walking mech', plan: 'biped', what: 'A two-legged walking mech in industrial yellow and dark grey, with reverse-jointed legs and clamp hands, about 4 m tall',
    moves: { idle: 'Idle', walk: 'Walk', run: 'Run', strike: 'Attack', hit: 'Hit', jump: 'Jump', special: 'Stomp' } },
  { id: 'creature-scorpion', file: 'scorpion.glb', title: 'Giant scorpion', plan: 'beast', what: 'A giant scorpion with a glossy brown-black shell, amber legs and a raised stinger, about 1.6 m tall and 2.8 m long; it fights where it stands and never walks (it has no walk: moved, it slides)',
    moves: { idle: 'ClawSnap', strike: 'Attack', hit: 'Hit', jump: 'Jump', special: 'ClawSnap' } },
];

type Gltf = { json: any; bin: Buffer };
function loadGlb(path: string): Gltf {
  const b = readFileSync(path);
  if (b.readUInt32LE(0) !== 0x46546c67) throw new Error(`${path} is not a GLB`);
  const jl = b.readUInt32LE(12), json = JSON.parse(b.subarray(20, 20 + jl).toString('utf8'));
  const bl = b.readUInt32LE(20 + jl);
  return { json, bin: b.subarray(28 + jl, 28 + jl + bl) };
}
const SIZE: Record<number, number> = { 5126: 4, 5125: 4, 5123: 2, 5122: 2, 5121: 1, 5120: 1 };
const WIDTH: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
// an accessor's values as numbers: floats as they are, integers raw unless `norm` (then as glTF normalises them)
function read(g: Gltf, i: number, norm = false): Float64Array {
  const a = g.json.accessors[i], v = g.json.bufferViews[a.bufferView], size = SIZE[a.componentType], w = WIDTH[a.type];
  const stride = v.byteStride || size * w, base = (v.byteOffset || 0) + (a.byteOffset || 0), dv = new DataView(g.bin.buffer, g.bin.byteOffset, g.bin.byteLength);
  const out = new Float64Array(a.count * w);
  for (let k = 0; k < a.count; k++) for (let c = 0; c < w; c++) {
    const o = base + k * stride + c * size;
    let x: number;
    switch (a.componentType) {
      case 5126: x = dv.getFloat32(o, true); break;
      case 5125: x = dv.getUint32(o, true); break;
      case 5123: x = dv.getUint16(o, true); if (norm || a.normalized) x /= 65535; break;
      case 5122: x = dv.getInt16(o, true); if (norm || a.normalized) x = Math.max(x / 32767, -1); break;
      case 5121: x = dv.getUint8(o); if (norm || a.normalized) x /= 255; break;
      default: x = dv.getInt8(o); if (norm || a.normalized) x = Math.max(x / 127, -1);
    }
    out[k * w + c] = x;
  }
  return out;
}
type Q = [number, number, number, number];
const nlerp = (a: Q, b: Q, u: number): Q => {
  const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3], s = d < 0 ? -1 : 1;
  const q: Q = [a[0] + (b[0] * s - a[0]) * u, a[1] + (b[1] * s - a[1]) * u, a[2] + (b[2] * s - a[2]) * u, a[3] + (b[3] * s - a[3]) * u];
  const l = Math.hypot(...q) || 1; return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
};
// a channel's value at time t (linear, as anymove's exports are)
function sample(times: Float64Array, vals: Float64Array, w: number, t: number, rot: boolean): number[] {
  const n = times.length;
  if (t <= times[0]) return Array.from(vals.subarray(0, w));
  if (t >= times[n - 1]) return Array.from(vals.subarray((n - 1) * w, n * w));
  let k = 0; while (k < n - 2 && times[k + 1] < t) k++;
  const u = (t - times[k]) / (times[k + 1] - times[k] || 1), a = Array.from(vals.subarray(k * w, k * w + w)), b = Array.from(vals.subarray((k + 1) * w, (k + 2) * w));
  return rot ? nlerp(a as Q, b as Q, u) : a.map((x, c) => x + (b[c] - x) * u);
}

export async function buildCreature(def: CreatureDef, outDir: string) {
  await MeshoptSimplifier.ready;
  const g = loadGlb(join(CACHE, 'patch-anymove', def.file)), J = g.json;
  if (J.meshes.length !== 1 || J.meshes[0].primitives.length !== 1 || J.skins.length !== 1) throw new Error(`${def.file}: expected one skinned mesh with one primitive`);
  const P = J.meshes[0].primitives[0], skin = J.skins[0], joints: number[] = skin.joints;
  const meshNode = J.nodes.findIndex((n: any) => n.mesh === 0);

  // the skeleton: each joint's parent among the joints, and its rest pose
  const parentOf = new Map<number, number>(); J.nodes.forEach((n: any, i: number) => (n.children || []).forEach((c: number) => parentOf.set(c, i)));
  const jIndex = new Map(joints.map((n, k) => [n, k]));
  const bones = joints.map((n) => {
    const N = J.nodes[n], p = parentOf.get(n);
    return { name: String(N.name || `bone${n}`).replace(/[.:/\s]/g, '_'), parent: p != null && jIndex.has(p) ? jIndex.get(p)! : -1, t: N.translation || [0, 0, 0], r: N.rotation || [0, 0, 0, 1], s: N.scale || [1, 1, 1] };
  });
  if (new Set(bones.map((b) => b.name)).size !== bones.length) throw new Error(`${def.file}: two bones share a name`);
  // what holds the root bones (anymove: an armature node, 'rig'): its transform, in world space, as the runtime's group above them
  const roots = joints.filter((n) => !jIndex.has(parentOf.get(n) ?? -1));
  for (const r of roots) { let p = parentOf.get(r); while (p != null) { const N = J.nodes[p]; if (N.matrix || (N.rotation && Math.abs(N.rotation[3]) < 0.9999) || (N.scale && N.scale.some((x: number) => Math.abs(x - 1) > 1e-4)) || (N.translation && N.translation.some((x: number) => Math.abs(x) > 1e-4))) throw new Error(`${def.file}: the armature node ${N.name} has a transform; not handled`); p = parentOf.get(p); } }
  if (meshNode < 0) throw new Error(`${def.file}: no mesh node`);
  const ibm = Float32Array.from(read(g, skin.inverseBindMatrices));

  // the mesh
  const pos = read(g, P.attributes.POSITION), nor = read(g, P.attributes.NORMAL), uv = read(g, P.attributes.TEXCOORD_0);
  const jo = read(g, P.attributes.JOINTS_0), we = read(g, P.attributes.WEIGHTS_0, true), idx = Uint32Array.from(read(g, P.indices));
  const nv = pos.length / 3, tris0 = idx.length / 3;
  const [cut, err] = MeshoptSimplifier.simplify(idx, Float32Array.from(pos), 3, BUDGET * 3, 0.05, []);
  // the vertices the cut kept, renumbered
  const map = new Int32Array(nv).fill(-1); let m = 0;
  for (const i of cut) if (map[i] < 0) map[i] = m++;
  const P3 = new Float32Array(m * 3), N3 = new Int8Array(m * 3), U2 = new Float32Array(m * 2), SI = new Uint8Array(m * 4), SW = new Uint8Array(m * 4);
  let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let v = 0; v < nv; v++) {
    const k = map[v]; if (k < 0) continue;
    for (let c = 0; c < 3; c++) { P3[k * 3 + c] = pos[v * 3 + c]; lo[c] = Math.min(lo[c], pos[v * 3 + c]); hi[c] = Math.max(hi[c], pos[v * 3 + c]); }
    const nl = Math.hypot(nor[v * 3], nor[v * 3 + 1], nor[v * 3 + 2]) || 1;
    for (let c = 0; c < 3; c++) N3[k * 3 + c] = Math.round((nor[v * 3 + c] / nl) * 127);
    U2[k * 2] = uv[v * 2]; U2[k * 2 + 1] = uv[v * 2 + 1];
    // weights as bytes summing to 255, the largest taking the rounding
    const w4 = [0, 1, 2, 3].map((c) => Math.max(0, we[v * 4 + c])), sw = w4.reduce((a, b) => a + b, 0) || 1, b4 = w4.map((x) => Math.round((x / sw) * 255));
    const big = b4.indexOf(Math.max(...b4)); b4[big] += 255 - b4.reduce((a, b) => a + b, 0);
    for (let c = 0; c < 4; c++) { SI[k * 4 + c] = jo[v * 4 + c]; SW[k * 4 + c] = b4[c]; }
    if (Math.max(...[0, 1, 2, 3].map((c) => jo[v * 4 + c])) >= joints.length) throw new Error(`${def.file}: a vertex names a bone the skin does not have`);
  }
  const I = m > 65535 ? new Uint32Array(cut.length) : new Uint16Array(cut.length);
  for (let i = 0; i < cut.length; i++) I[i] = map[cut[i]];

  // the motion: every clip, every bone's rotation; positions for the bones that move off their rest
  const clipsIn = J.animations.map((a: any) => {
    const ch = a.channels.map((c: any) => { const s = a.samplers[c.sampler]; return { node: c.target.node, path: c.target.path, times: read(g, s.input), vals: read(g, s.output) }; });
    const dur = Math.max(...ch.map((c: any) => c.times[c.times.length - 1]));
    return { name: String(a.name), ch, dur };
  });
  const FPS = 24;
  const at = (clip: any, b: number, path: 'rotation' | 'translation', t: number) => {
    const c = clip.ch.find((x: any) => x.node === joints[b] && x.path === path);
    return c ? sample(c.times, c.vals, path === 'rotation' ? 4 : 3, t, path === 'rotation') : (path === 'rotation' ? bones[b].r : bones[b].t);
  };
  const used = clipsIn.filter((c: any) => !/_Root$/.test(c.name));
  const moving = bones.map((_, b) => used.some((c: any) => { for (let f = 0; f * (1 / FPS) <= c.dur + 1e-6; f++) { const t = at(c, b, 'translation', f / FPS); if (Math.hypot(t[0] - bones[b].t[0], t[1] - bones[b].t[1], t[2] - bones[b].t[2]) > 0.002) return true; } return false; })).map((x, b) => (x ? b : -1)).filter((b) => b >= 0);
  // scale is left out: say so if a clip used it
  for (const c of used) for (const ch of c.ch) if (ch.path === 'scale') for (let k = 0; k < ch.vals.length; k++) if (Math.abs(ch.vals[k] - 1) > 0.01) throw new Error(`${def.file}: ${c.name} scales a bone; not handled`);
  const pack = new Packer();
  pack.add('pos', P3, 3); pack.add('nor', N3, 3); pack.add('uv', U2, 2); pack.add('skinIndex', SI, 4); pack.add('skinWeight', SW, 4); pack.add('index', I, 1); pack.add('ibm', ibm, 16);
  const clipList: { name: string; frames: number; fps: number; loop: boolean; duration: number }[] = [];
  const LOOP = new Set([def.moves.idle, def.moves.walk, def.moves.run].filter(Boolean));
  for (const c of used) {
    const frames = Math.max(2, Math.round(c.dur * FPS) + 1), nb = bones.length;
    const q = new Int16Array(frames * nb * 4), tr = new Float32Array(frames * moving.length * 3);
    for (let b = 0; b < nb; b++) { let prev: Q | null = null; for (let f = 0; f < frames; f++) {
      let r = at(c, b, 'rotation', Math.min(c.dur, f / FPS)) as Q;
      if (prev && prev[0] * r[0] + prev[1] * r[1] + prev[2] * r[2] + prev[3] * r[3] < 0) r = [-r[0], -r[1], -r[2], -r[3]];
      prev = r; for (let k = 0; k < 4; k++) q[(f * nb + b) * 4 + k] = Math.round(r[k] * 32767);
    } }
    moving.forEach((b, j) => { for (let f = 0; f < frames; f++) { const t = at(c, b, 'translation', Math.min(c.dur, f / FPS)); for (let k = 0; k < 3; k++) tr[(f * moving.length + j) * 3 + k] = t[k]; } });
    pack.add(`${c.name}:q`, q, 4); pack.add(`${c.name}:t`, tr, 3);
    clipList.push({ name: c.name, frames, fps: FPS, loop: LOOP.has(c.name), duration: +c.dur.toFixed(4) });
  }
  for (const k of Object.values(def.moves)) if (k && !clipList.some((c) => c.name === k)) throw new Error(`${def.file}: no clip ${k}`);
  // the paces, and the way it faces, from the travelling copies: the root's ground distance over the clip
  const rootB = jIndex.get(roots[0])!;
  const pace = (name: string) => {
    const c = clipsIn.find((x: any) => x.name === name); if (!c) return null;
    const a = at(c, rootB, 'translation', 0), b = at(c, rootB, 'translation', c.dur);
    return { speed: +(Math.hypot(b[0] - a[0], b[2] - a[2]) / c.dur).toFixed(3), dir: [b[0] - a[0], b[2] - a[2]] };
  };
  const walk = def.moves.walk ? pace(`${def.moves.walk}_Root`) : null, run = def.moves.run ? pace(`${def.moves.run}_Root`) : null;
  const dir = (run || walk)?.dir;
  // turn: the yaw that brings its travel round to +z (the runtime's forward)
  const turn = dir ? +(-Math.atan2(dir[0], dir[1])).toFixed(4) : 0;

  // textures
  mkdirSync(outDir, { recursive: true });
  const tmp = join(tmpdir(), `gm-creature-${process.pid}-${def.id}`); mkdirSync(tmp, { recursive: true });
  try {
    const mat = J.materials[P.material], pbr = mat.pbrMetallicRoughness || {};
    const imageOf = (tex: number) => { const im = J.images[J.textures[tex].source], v = J.bufferViews[im.bufferView]; const p = join(tmp, `t${tex}.${im.mimeType === 'image/png' ? 'png' : 'jpg'}`); writeFileSync(p, g.bin.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength)); return p; };
    const jpeg = (src: string, dst: string, max: number, q: number) => execFileSync('sips', ['-s', 'format', 'jpeg', '-Z', String(max), '-s', 'formatOptions', String(q), src, '--out', join(outDir, dst)], { stdio: 'ignore' });
    const col = imageOf(pbr.baseColorTexture.index); jpeg(col, 'color.jpg', 1024, 84); jpeg(col, 'color-lo.jpg', 512, 82);
    const material: Record<string, unknown> = { map: 'color.jpg', mapLo: 'color-lo.jpg', roughness: pbr.roughnessFactor ?? 1, metalness: pbr.metallicFactor ?? 1 };
    if (mat.normalTexture) { jpeg(imageOf(mat.normalTexture.index), 'normal.jpg', 1024, 90); material.normalMap = 'normal.jpg'; }
    if (pbr.metallicRoughnessTexture) { jpeg(imageOf(pbr.metallicRoughnessTexture.index), 'orm.jpg', 512, 88); material.ormMap = 'orm.jpg'; }
    writeFileSync(join(outDir, 'creature.bin.z'), deflateSync(pack.buffer(), { level: 9 }));
    const height = +(hi[1] - lo[1]).toFixed(3), length = +(hi[2] - lo[2]).toFixed(3), width = +(hi[0] - lo[0]).toFixed(3);
    const asset = {
      format: 'gmasset/1', kind: 'creature', file: 'creature.bin.z', layout: pack.layout, vertexCount: m, plan: def.plan,
      bones, moving, material, clips: clipList, moves: def.moves, speeds: { walk: walk?.speed ?? null, run: run?.speed ?? null }, turn,
      bounds: { min: lo.map((x) => +x.toFixed(3)), max: hi.map((x) => +x.toFixed(3)) }, height, length, width,
    };
    const names = clipList.map((c) => c.name);
    const desc = `${def.what}. Rigged and animated (${bones.length} bones), ${(I.length / 3).toLocaleString('en')} triangles: ${names.join(', ')}.` + (walk ? ` Walks at ${walk.speed.toFixed(1)} m/s` + (run ? `, runs at ${run.speed.toFixed(1)} m/s.` : '.') : '');
    return {
      asset, description: desc,
      derived: `Made by Patch with anymove (mesh and motion generated with AI; Patch dedicates it to the public domain). Triangles cut from ${tris0.toLocaleString('en')} to ${(I.length / 3).toLocaleString('en')} by meshoptimizer, skin weights kept; textures cut from 4K to 1024 px (colour also 512 px, metal-roughness 512 px); clips sampled at 24 fps, the travelling *_Root copies measured for pace and left out.`,
      meta: { plan: def.plan, clips: names, moves: def.moves, speeds: asset.speeds, height, length, triangles: I.length / 3 },
      check: `${tris0} -> ${I.length / 3} tris (error ${err.toFixed(4)}), ${m} verts, ${bones.length} bones, ${moving.length} moving, clips ${names.join('/')}, walk ${walk?.speed ?? '-'} run ${run?.speed ?? '-'} m/s, turn ${turn}, ${height} m tall, ${length} m long`,
    };
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
