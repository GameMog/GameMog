// Mog City: the one way the game loads a model. One GLTFLoader with the meshopt decoder (the characters and props are
// stored meshopt-compressed with WebP textures, see .scratch/tools/gltf/diet), and one load per file: a model asked for
// from several places (thug.glb: the fight, the intro's men, Mack) is fetched and parsed once, every caller handed the
// same result. Callers clone what they change (SkeletonUtils.clone for a body, material.clone() for a look); the clips
// are shared as they are.
import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

// (a character's alpha-tested parts, his eyes and lashes, cast no shadow, whoever sets castShadow on his body: the sun's
// cascades draw every caster with one shared material and copy each caster's `alphaTest` onto it, and each switch
// between 0 and > 0 makes three.js rebuild every caster's shader key, ~8-15 ms of CPU a frame with Dan in view. After
// Slop New York 1a1cfd8, which takes the city's own alpha tests off the shadow casters)
if (!Object.getOwnPropertyDescriptor(THREE.SkinnedMesh.prototype, 'castShadow')) {
  Object.defineProperty(THREE.SkinnedMesh.prototype, 'castShadow', {
    get() { return this._castShadow === true && !(this.material && this.material.alphaTest > 0); },
    set(v) { this._castShadow = v; },
    configurable: true
  });
}

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
