// Jensen Heist: Jensen's own moves (polish 2, the owner's list: "Jensen's own moves: gestures and walk instead of borrowed
// clips"). Until now the game's hero played Dan's clips but for his own sit and sitTalk (rules-b.mjs). This adds three of
// his own to the built jensen.glb, all from Quaternius's Universal Animation Library 1 and 2 (Standard), CC0 1.0 (the
// owner approved UAL1+2 Standard; NOT the newer "QAL" licence, which is not CC0):
//   walk   UAL1 Walk_Formal_Loop          an upright, unhurried walk, the arms close: a CEO's, not Dan's street walk
//   talk   UAL1 Idle_Talking_Loop, then UAL1 Interact
//                                        the keynote talk: talking with both hands, then one hand held out open to
//                                        the room (the presenting gesture), and back; one loop of 4.6 s
//   cheer  UAL2 Yes                      his celebration: a fist pumped, "yes" (where the story wins: ST4's close)
// Retargeted onto Dan's rig (his body plays Dan's: one MakeHuman 66-bone rig) by the library's own retarget
// (scripts/assets/gltf.ts, the code that makes the human athletes' clips), then carried into the GLB's frame by each
// bone's constant offset between the library's rig and Dan's, measured on the one clip both have from the same source
// (Dan's 'talk' is UAL1 Idle_Talking_Loop: the offsets hold to about 1 degree over its frames, fingers aside). Played as
// the game plays Dan's (the armature's turn taken out, wagmi/game.js and storyrun/cast.js). The GLB marks them its own
// (asset extras heroOwn), so Mog City's heroClips (storyrun/pack.js) plays them over Dan's of the same name.
//   node --import ./scripts/ts-resolve.mjs scripts/handbuilt/jensen/moves.mjs <in.glb> <out.glb>
// (the UAL files from assets-src/cache/quaternius-ual, npm run assets:fetch; FORGE_ASSETS_CACHE names another cache)
// Original procedural work, CC0.
import fs from 'node:fs';
import path from 'node:path';
import { read, write, io } from '../young-hero/glb.mjs';
import { MOGCITY, ROOT } from '../../forge/paths.mjs';

const CACHE = [process.env.FORGE_ASSETS_CACHE, path.join(ROOT, 'assets-src/cache'), path.join(ROOT, '../assets-src/cache')].filter(Boolean).find((p) => fs.existsSync(path.join(p, 'quaternius-ual/UAL1_Standard.glb')));
if (!CACHE) throw new Error('no assets-src/cache/quaternius-ual (npm run assets:fetch)');
process.chdir(path.dirname(path.dirname(CACHE)));   // (gltf.ts reads from assets-src/cache, relative)
const { retargetGltf } = await import('../../assets/gltf.ts');
const { forwardQ, qmul, qinv, slerp } = await import('../../assets/mocap.ts');
const ATHLETE = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/assets/human-athlete-male/asset.json'), 'utf8')).skeleton;

export const MOVES = [
  { name: 'walk', loop: true, parts: [['UAL1_Standard.glb', 'Walk_Formal_Loop']] },
  { name: 'talk', loop: true, parts: [['UAL1_Standard.glb', 'Idle_Talking_Loop'], ['UAL1_Standard.glb', 'Interact']], blend: 0.35 },
  { name: 'cheer', loop: true, parts: [['UAL2_Standard.glb', 'Yes']] },
];
export const CREDITS = { walk: 'Quaternius UAL1 Walk_Formal_Loop', talk: 'Quaternius UAL1 Idle_Talking_Loop + UAL1 Interact', cheer: 'Quaternius UAL2 Yes' };
const FPS = 30, dn = (n) => n.replace('.', '_');
const norm4 = (q) => { const l = Math.hypot(...q) || 1; return q.map((x) => x / l); };

// Dan's local rotations at t of one of his clips; world rotations by FK from 'root' with the armature's turn out (the game's)
function danSampler(dan, clip) {
  const an = dan.getRoot().listAnimations().find((a) => a.getName() === clip), tr = new Map();
  for (const ch of an.listChannels()) { const s = ch.getSampler(); tr.set(ch.getTargetNode().getName() + ':' + ch.getTargetPath(), { t: s.getInput().getArray(), o: s.getOutput() }); }
  return (key, t, def) => { const T = tr.get(key); if (!T) return def; let k = 0; while (k < T.t.length - 1 && T.t[k + 1] <= t + 1e-6) k++; const e = []; T.o.getElement(k, e); return e.length === 4 ? norm4(e) : e; };
}
function danWorld(rootNode, sample, t) {
  const W = {}; const walk = (n, pq) => { const nm = n.getName(), q = qmul(pq, sample(nm + ':rotation', t, n.getRotation())); W[nm] = q; for (const c of n.listChildren()) walk(c, q); };
  walk(rootNode, [0, 0, 0, 1]); return W;
}
// each bone's offset K (library world rotation -> Dan's): averaged over every frame of the clip both have
export function calibrate(dan) {
  const nodes = new Map(dan.getRoot().listNodes().map((n) => [n.getName(), n])), sample = danSampler(dan, 'talk');
  const c = retargetGltf(ATHLETE, 'quaternius-ual/UAL1_Standard.glb', 'Idle_Talking_Loop', { name: 'talk', loop: true });
  const acc = ATHLETE.map(() => [0, 0, 0, 0]), ref = [];
  for (let f = 0; f < c.frames; f++) {
    const D = danWorld(nodes.get('root'), sample, f / FPS), P = forwardQ(ATHLETE, c.quats, c.root, f).q;
    ATHLETE.forEach((b, i) => { const k = qmul(qinv(P[i]), D[dn(b.name)]); if (!ref[i]) ref[i] = k; const s = k[0] * ref[i][0] + k[1] * ref[i][1] + k[2] * ref[i][2] + k[3] * ref[i][3] < 0 ? -1 : 1; for (let q = 0; q < 4; q++) acc[i][q] += s * k[q]; });
  }
  return { K: acc.map(norm4), rootRest: sample('root:translation', 0, nodes.get('root').getTranslation()), athRoot: ATHLETE[0].head };
}
// one move as Dan-rig local rotations per frame (and the root's translation), its parts joined by a short crossfade
export function buildMove(m, cal) {
  const parts = m.parts.map(([file, clip]) => retargetGltf(ATHLETE, 'quaternius-ual/' + file, clip, { name: m.name, loop: !!m.loop && m.parts.length === 1, inPlace: true }));
  const frames = []; // { W: world rotations (library), root }
  for (const c of parts) for (let f = 0; f < c.frames; f++) { const { q } = forwardQ(ATHLETE, c.quats, c.root, f); frames.push({ W: q, root: Array.from(c.root.subarray(f * 3, f * 3 + 3)) }); }
  // (a join's seam, and a joined loop's wrap: the last frames of one part eased into the first of the next)
  if (parts.length > 1) {
    const nb = Math.round((m.blend || 0.3) * FPS); let at = 0;
    for (let p = 0; p < parts.length; p++) {
      at += parts[p].frames; const next = p + 1 < parts.length ? at : 0;
      for (let k = 0; k < nb; k++) { const u = (k + 1) / (nb + 1), s = u * u * (3 - 2 * u), fr = frames[at - nb + k], to = frames[next]; fr.W = fr.W.map((q, i) => slerp(q, to.W[i], s)); fr.root = fr.root.map((x, i) => x + (to.root[i] - x) * s); }
    }
  }
  if (m.loop) frames.push(frames[0]);
  const parent = ATHLETE.map((b) => b.parent);
  const out = frames.map(({ W, root }) => {
    const D = W.map((w, i) => qmul(w, cal.K[i]));
    return { q: ATHLETE.map((b, i) => (parent[i] < 0 ? D[i] : qmul(qinv(D[parent[i]]), D[i]))), t: [cal.rootRest[0] + root[0] - cal.athRoot[0], cal.rootRest[1] + root[1] - cal.athRoot[1], cal.rootRest[2] + root[2] - cal.athRoot[2]] };
  });
  return out;
}
// written into the GLB as the game's other clips are: a channel per bone that moves (one key for a bone that holds still)
export function addMove(doc, name, frames) {
  const R = doc.getRoot(), buf = R.listBuffers()[0], byName = new Map(R.listNodes().map((n) => [n.getName(), n]));
  for (const a of R.listAnimations()) if (a.getName() === name) a.dispose();
  const an = doc.createAnimation(name), times = Float32Array.from(frames.map((_, f) => f / FPS)), t0 = Float32Array.from([0]);
  const input = doc.createAccessor().setType('SCALAR').setArray(times).setBuffer(buf), input0 = doc.createAccessor().setType('SCALAR').setArray(t0).setBuffer(buf);
  const chan = (node, pathName, type, arr, still) => { const smp = doc.createAnimationSampler().setInput(still ? input0 : input).setOutput(doc.createAccessor().setType(type).setArray(arr).setBuffer(buf)).setInterpolation('LINEAR'); an.addSampler(smp).addChannel(doc.createAnimationChannel().setTargetNode(node).setTargetPath(pathName).setSampler(smp)); };
  ATHLETE.forEach((b, i) => {
    const node = byName.get(dn(b.name)); if (!node) return;
    const Q = frames.map((fr) => fr.q[i]); for (let f = 1; f < Q.length; f++) { const p = Q[f - 1], q = Q[f]; if (p[0] * q[0] + p[1] * q[1] + p[2] * q[2] + p[3] * q[3] < 0) Q[f] = q.map((x) => -x); }
    const moves = Q.some((q) => Math.abs(q[0] * Q[0][0] + q[1] * Q[0][1] + q[2] * Q[0][2] + q[3] * Q[0][3]) < Math.cos(0.25 * Math.PI / 360));
    chan(node, 'rotation', 'VEC4', Float32Array.from((moves ? Q : [Q[0]]).flat()), !moves);
  });
  chan(byName.get('root'), 'translation', 'VEC3', Float32Array.from(frames.flatMap((fr) => fr.t)), false);
  return an;
}

if (import.meta.url === 'file://' + process.argv[1]) {
  const [inp, out] = process.argv.slice(2).map((p) => path.resolve(process.env.INIT_CWD || process.env.PWD || '.', p));
  const { doc, src } = await read(inp), dan = await io.read(MOGCITY + '/assets/characters/dan.glb'), cal = calibrate(dan);
  for (const m of MOVES) { const fr = buildMove(m, cal); addMove(doc, m.name, fr); console.log(`${m.name}: ${(fr.length - 1) / FPS} s from ${m.parts.map((p) => p[1]).join(' + ')}`); }
  const A = doc.getRoot().getAsset(), ex = A.extras || {}; A.extras = { ...ex, heroOwn: MOVES.map((m) => m.name), moves: CREDITS };
  const glb = await write(doc, src); fs.writeFileSync(out, glb);
  console.log(`${out} ${glb.length} bytes (cap 6291456)`);
}
