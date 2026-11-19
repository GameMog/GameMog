// Write a posture-fixed copy of cast-clips.glb (read-only from the worktree) to ./clips/cast-clips.posture.glb: the
// rotation channels posture.py corrected (idle, talk, phone, arms, sitTalk, sit) replaced with float keys.
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(process.env.FORGE_TOOLBOX_DIR.replace(/\/?$/, '/') + 'node_modules/');
const { NodeIO } = require('@gltf-transform/core'); const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
const { MeshoptDecoder, MeshoptEncoder } = require('meshoptimizer');
await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const H = new URL('.', import.meta.url).pathname;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(new URL('../../../../../public/storykit/cast/cast-clips.glb', import.meta.url).pathname);
const FIX = JSON.parse(fs.readFileSync(H + 'dump/clips_fixed.json')).clips; const P = JSON.parse(fs.readFileSync(H + 'posture.json')).clips;
const buf = doc.getRoot().listBuffers()[0];
let n = 0;
for (const an of doc.getRoot().listAnimations()) {
  if (!P[an.getName()]) continue;
  for (const ch of an.listChannels()) {
    const key = ch.getTargetNode().getName() + '|' + ch.getTargetPath(); const f = FIX[an.getName()][key];
    if (ch.getTargetPath() !== 'rotation' || !f || f.v.some((x) => Math.abs(x) > 1.0001)) continue;
    const s = ch.getSampler(); const old = s.getOutput().getArray();
    const nv = Float32Array.from(f.v); if (nv.length !== old.length) throw new Error('len ' + key);
    let same = true; const on = s.getOutput().getNormalized(); const sc = old instanceof Int16Array ? 32767 : old instanceof Int8Array ? 127 : 1;
    for (let i = 0; i < nv.length; i++) if (Math.abs(nv[i] - old[i] / sc) > 2e-3) { same = false; break; }
    if (same) continue;
    s.setOutput(doc.createAccessor().setArray(nv).setType('VEC4').setBuffer(buf)); n++;
  }
}
fs.mkdirSync(H + 'clips', { recursive: true });
await io.write(H + 'clips/cast-clips.posture.glb', doc);
console.log('channels replaced', n, 'size', (fs.statSync(H + 'clips/cast-clips.posture.glb').size / 1024).toFixed(0), 'KB vs', (fs.statSync(new URL('../../../../../public/storykit/cast/cast-clips.glb', import.meta.url).pathname).size / 1024).toFixed(0), 'KB');
