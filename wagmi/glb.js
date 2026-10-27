// Mog City: the one way the game loads a model. One GLTFLoader with the meshopt decoder (the characters and props are
// stored meshopt-compressed with WebP textures, see .scratch/tools/gltf/diet), and one load per file: a model asked for
// from several places (thug.glb: the fight, the intro's men, Mack) is fetched and parsed once, every caller handed the
// same result. Callers clone what they change (SkeletonUtils.clone for a body, material.clone() for a look); the clips
// are shared as they are.
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

let loader = null;
const cache = new Map();

// (a GLTFLoader made anywhere else in the page still reads the compressed files: one without a decoder of its own is
// given this one when it parses. Use loadGLB all the same: it fetches and parses each file once)
{
  const parse = GLTFLoader.prototype.parse;
  if (!parse.__meshopt) {
    GLTFLoader.prototype.parse = function (...args) { if (!this.meshoptDecoder) this.setMeshoptDecoder(MeshoptDecoder); return parse.apply(this, args); };
    GLTFLoader.prototype.parse.__meshopt = true;
  }
}

export function gltfLoader() {
  if (!loader) { loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder); }
  return loader;
}

// the model at url, loaded once (a failed load is forgotten, so a later call tries again). bytes: the file itself when
// the caller has fetched it already (the trailer's cast, wagmi/trailer.js), parsed as it is rather than fetched again
export function loadGLB(url, bytes = null) {
  let p = cache.get(url);
  if (!p) {
    p = bytes ? gltfLoader().parseAsync(bytes, url.slice(0, url.lastIndexOf('/') + 1)) : gltfLoader().loadAsync(url);
    cache.set(url, p);
    p.catch(() => { if (cache.get(url) === p) cache.delete(url); });
  }
  return p;
}
