// THE CHARACTER FORGE: the forge kit (FB, browser port). Everything the forge reads that is not already a static asset
// in public/assets, packed once into public/storykit/forge/kit/ so the same files feed the Node CLI and a creator's
// browser (fetched as static files; no server work):
//   face-kit.json + face-kit.bin.z   MakeHuman's CC0 face targets the library uses (parsed: indices + offsets in m) and
//                                    base.obj's body triangle corners (the vertex map is rebuilt from them, targets.mjs)
//   rig-male.glb, rig-female.glb     the cast rig templates (Mog City's gears.glb, Fiona's original): the 66 joints,
//                                    their inverse binds, the frame, the mouth's inside and the cap; skinned meshes,
//                                    their textures and the template clips dropped (core.mjs keeps none of them)
//   clips-src.glb                    Dan's skeleton (the clips' frame) and his idle clip: post.mjs measures leg length
//                                    and stands the body on the floor with them (the 74 clips ship as cast-clips.glb)
//   node scripts/forge/kit.mjs        (npm run storykit:forge-kit; run again only when a source changes)
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { allTargetNames, parseTarget, parseBodyCorners } from './targets.mjs';
import { MH_TARGETS, MH_BASE, MOGCITY } from './paths.mjs';
import { nodeEnv } from './env-node.mjs';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../..');
const OUT = path.join(ROOT, 'public/storykit/forge/kit');
const TARGETS = MH_TARGETS, BASE_OBJ = MH_BASE;
const MC = MOGCITY;
fs.mkdirSync(OUT, { recursive: true });

/* -- face targets -- */
{
  const corners = parseBodyCorners(fs.readFileSync(BASE_OBJ, 'utf8')), parts = [Buffer.from(corners.buffer)], J = { corners: [0, corners.length], targets: {}, source: 'MakeHuman 1.x data/targets (CC0 1.0), commit a8bc2d54' };
  let off = corners.byteLength;
  for (const name of allTargetNames()) {
    const f = path.join(TARGETS, name + '.target'); if (!fs.existsSync(f)) throw new Error('face target missing: ' + f);
    const t = parseTarget(fs.readFileSync(f, 'utf8'));
    J.targets[name] = [off, t.idx.length]; parts.push(Buffer.from(t.idx.buffer), Buffer.from(t.d.buffer)); off += t.idx.byteLength + t.d.byteLength;
  }
  fs.writeFileSync(path.join(OUT, 'face-kit.bin.z'), zlib.deflateSync(Buffer.concat(parts), { level: 9 }));
  fs.writeFileSync(path.join(OUT, 'face-kit.json'), JSON.stringify(J) + '\n');
  console.log('face kit:', Object.keys(J.targets).length, 'targets,', (off / 1e6).toFixed(2), 'MB raw');
}

/* -- rigs and Dan's frame -- */
const env = await nodeEnv();
const { core: { NodeIO, PropertyType: PT }, extensions: { ALL_EXTENSIONS }, functions: { prune } } = env.gltf;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': env.meshopt.MeshoptDecoder });
async function strip(src, out, { keepIdle = false } = {}) {
  const doc = await io.read(src), R = doc.getRoot();
  for (const e of R.listExtensionsUsed()) if (/meshopt|quantization/i.test(e.extensionName)) e.dispose();
  // (skinned meshes away, their nodes and skins kept: core.mjs reads the joints and binds from the first skin)
  for (const n of R.listNodes()) if (n.getSkin() && n.getMesh()) n.setMesh(null);
  const clips = R.listAnimations().length;
  for (const a of R.listAnimations()) if (!(keepIdle && a.getName() === 'idle')) { for (const c of a.listChannels()) c.dispose(); for (const s of a.listSamplers()) s.dispose(); a.dispose(); }
  await doc.transform(prune({ propertyTypes: [PT.MESH, PT.PRIMITIVE, PT.PRIMITIVE_TARGET, PT.MATERIAL, PT.TEXTURE, PT.ACCESSOR], keepLeaves: true, keepAttributes: true, keepIndices: true, keepSolidTextures: true, keepExtras: true }));
  if (keepIdle) R.getAsset().extras = Object.assign(R.getAsset().extras || {}, { forgeKit: { from: src.split('/').pop(), clips } });
  await io.write(out, doc);
  console.log(path.basename(out), (fs.statSync(src).size / 1e6).toFixed(2), '->', (fs.statSync(out).size / 1e6).toFixed(2), 'MB');
}
await strip(MC + '/assets/characters/gears.glb', path.join(OUT, 'rig-male.glb'));
await strip(MC + '/.scratch/polish/cast2/orig/fiona.glb', path.join(OUT, 'rig-female.glb'));
await strip(MC + '/assets/characters/dan.glb', path.join(OUT, 'clips-src.glb'), { keepIdle: true });
