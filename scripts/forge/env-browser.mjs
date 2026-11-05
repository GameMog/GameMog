// THE CHARACTER FORGE: the browser platform (FB, browser port), env-node.mjs's twin. A creator's browser forges the
// cast at build time with the same modules the Node CLI runs; nothing goes to a server. Files are fetched as static
// files from the site: the asset library (/assets/) and the forge kit (/storykit/forge/kit/, kit.mjs). Works in a page
// or a worker.
//   env = await browserEnv({ A = '/assets/', K = '/storykit/forge/kit/', log, flags })
import * as core from '@gltf-transform/core';
import * as extensions from '@gltf-transform/extensions';
import { prune, resample, listTextureSlots } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { Matrix4, Quaternion, Vector3 } from 'three';
import { makeSharp, decodeImage, encodeCanvas } from './sharp-web.mjs';

export async function browserEnv({ A = '/assets/', K = '/storykit/forge/kit/', log = () => {}, flags = {} } = {}) {
  await MeshoptDecoder.ready; await MeshoptEncoder.ready;
  const cache = new Map();
  const bytes = (p) => {
    if (!cache.has(p)) cache.set(p, fetch(p).then(async (r) => { if (!r.ok) throw new Error(`forge: ${p} ${r.status}`); return new Uint8Array(await r.arrayBuffer()); }));
    return cache.get(p);
  };
  const env = {
    name: 'browser', A, K, bytes,
    text: async (p) => new TextDecoder().decode(await bytes(p)),
    inflate: async (u8) => new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer()),
    sharp: makeSharp(bytes),
    gltf: { core, extensions, functions: { prune, resample } }, IO: core.WebIO,
    meshopt: { MeshoptDecoder, MeshoptEncoder },
    THREE: { Matrix4, Quaternion, Vector3 },
    log, flag: (k) => flags[k],
    // (the diet's textures: PNG / JPEG to WebP by the browser's encoder, normal maps at qn, the rest at q; the texture's
    // name, URI and EXT_texture_webp as textureCompress sets them)
    toWebP: async (doc, { q, qn }) => {
      const T = doc.getRoot().listTextures().filter((t) => /^image\/(png|jpeg)$/.test(t.getMimeType()));
      for (const t of T) {
        const src = t.getMimeType(), im = await decodeImage(t.getImage()), normal = listTextureSlots(t).some((s) => /^normalTexture$/.test(s));
        const webp = await encodeCanvas(im, 'image/webp', (normal ? qn : q) / 100);
        const ext = src === 'image/png' ? 'png' : 'jpg';
        t.setImage(webp).setMimeType('image/webp').setURI(t.getURI().replace(new RegExp(`\\.${ext}$`), '.webp'));
      }
      const x = doc.createExtension(extensions.EXTTextureWebP);
      if (doc.getRoot().listTextures().some((t) => t.getMimeType() === 'image/webp')) x.setRequired(true); else x.dispose();
    },
  };
  return env;
}
