// THE CHARACTER FORGE: the Node platform (FB, browser port). The forge's modules (core, post, diet, targets) touch no
// Node API; each gets one of these, and env-browser.mjs is its twin for a creator's browser. Both read the same static
// files: the asset library (public/assets) and the forge kit (public/storykit/forge/kit, kit.mjs).
//   env = await nodeEnv()   { name, A, K, bytes(p), text(p), inflate(u8), sharp, gltf { core, extensions, functions }, IO,
//                             meshopt { MeshoptDecoder, MeshoptEncoder }, THREE, log(...), flag(name), toWebP(doc, opt) }
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { createRequire } from 'node:module';
import { TOOLBOX, GAMEMOG } from './paths.mjs';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../..');

let made = null;
export async function nodeEnv() {
  if (made) return made;
  const require = createRequire(TOOLBOX);
  const core = require('@gltf-transform/core'), extensions = require('@gltf-transform/extensions'), functions = require('@gltf-transform/functions');
  const { MeshoptDecoder, MeshoptEncoder } = require('meshoptimizer'), sharp = require('sharp');
  await MeshoptDecoder.ready; await MeshoptEncoder.ready;
  const THREE = createRequire(GAMEMOG + '/package.json')('three');
  made = {
    name: 'node',
    A: (process.env.FORGE_ASSETS || path.join(ROOT, 'public/assets')) + '/',
    K: (process.env.FORGE_KIT || path.join(ROOT, 'public/storykit/forge/kit')) + '/',
    bytes: async (p) => { const b = fs.readFileSync(p); return new Uint8Array(b.buffer, b.byteOffset, b.byteLength); },
    text: async (p) => fs.readFileSync(p, 'utf8'),
    inflate: async (u8) => { const b = zlib.inflateSync(u8); return new Uint8Array(b.buffer, b.byteOffset, b.byteLength); },
    sharp, gltf: { core, extensions, functions }, IO: core.NodeIO, meshopt: { MeshoptDecoder, MeshoptEncoder }, THREE,
    log: (...a) => console.error(...a),
    flag: (k) => process.env[k],
    // (the diet's textures: PNG / JPEG to WebP by sharp, normal maps at qn, the rest at q)
    toWebP: async (doc, { q, qn }) => {
      const { textureCompress } = functions;
      await doc.transform(
        textureCompress({ encoder: sharp, targetFormat: 'webp', formats: /^image\/(png|jpeg)$/, slots: /^normalTexture$/, quality: qn }),
        textureCompress({ encoder: sharp, targetFormat: 'webp', formats: /^image\/(png|jpeg)$/, quality: q }));
    },
  };
  return made;
}
